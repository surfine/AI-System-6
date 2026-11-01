// Single-writer lease: two Web instances share one IndexedDB, so only one may
// write. Non-writers reject mutating storage transactions and can take over
// explicitly; the old writer loses access and stops writing.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("single-writer-lease");
const leaseSource = read("app/core/write-lease.js");
const transactionsSource = read("app/core/storage-transactions.js");

function createLeaseInstance(storage, { noBroadcastChannel = false } = {}) {
  const windowStub = {
    listeners: {},
    addEventListener(name, listener) {
      (windowStub.listeners[name] ||= []).push(listener);
    },
  };
  const channels = [];
  const context = vm.createContext({
    console,
    crypto: webcrypto,
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    window: windowStub,
    navigator: { sendBeacon: false },
    BroadcastChannel: noBroadcastChannel
      ? class {
        constructor() { throw new Error("BroadcastChannel unavailable"); }
      }
      : class {
        constructor(name) { this.name = name; channels.push(this); }
        addEventListener(_name, listener) { this._listener = listener; }
        postMessage(message) { this._sent = message; }
      },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    t: (key) => key,
    setStatus: () => {},
    updateMenuState: () => {},
    cancelWorkingSessionAutosave: () => { context.__autosaveCancelled = true; },
    document: {
      querySelector: () => null,
      addEventListener: () => {},
      body: { dataset: {} },
      visibilityState: "visible",
    },
    playSystemSound: () => {},
  });
  vm.runInContext(leaseSource, context);
  return {
    context,
    channels,
    window: windowStub,
    lease: context.window.AISystem6WriteLease,
  };
}

function connectChannels(instances) {
  const all = instances.flatMap((instance) => instance.channels);
  all.forEach((channel) => {
    const original = channel.postMessage.bind(channel);
    channel.postMessage = (message) => {
      original(message);
      all.filter((other) => other !== channel).forEach((other) => {
        other._listener?.({ data: message });
      });
    };
  });
}

// Instance A acquires the lease; instance B (same storage) becomes read-only.
{
  const storage = new Map();
  const a = createLeaseInstance(storage);
  const b = createLeaseInstance(storage);
  connectChannels([a, b]);
  const acquiredA = await a.lease.acquire();
  test.assert(acquiredA.writer === true && acquiredA.readOnly === false, "the first instance acquires the write lease");
  test.assert(a.lease.isOwner() === true, "instance A is the writer");
  a.lease.initUi();
  const acquiredB = await b.lease.acquire();
  test.assert(acquiredB.writer === false && acquiredB.readOnly === true, "the second instance starts read-only");
  test.assert(b.lease.isReadOnly() === true, "instance B is read-only");
  test.assert(storage.has("ai-system6-write-lease"), "the lease is stored");

  // B's mutating storage transactions are rejected with READ_ONLY_INSTANCE.
  vm.runInContext(transactionsSource, b.context);
  let rejected = null;
  try {
    await b.context.window.AISystem6StorageTransactions.runTransaction(
      {},
      "keyval",
      "readwrite",
      () => {}
    );
  } catch (error) {
    rejected = error;
  }
  test.assert(rejected?.code === "READ_ONLY_INSTANCE", "a read-only instance rejects mutating transactions");

  // B takes over: A loses the writer role and cancels its pending autosave.
  const tookOver = await b.lease.takeOver();
  test.assert(tookOver.writer === true, "takeover makes instance B the writer");
  test.assert(a.lease.isOwner() === false && a.lease.isReadOnly() === true, "instance A loses write access");
  test.assert(a.context.__autosaveCancelled === true, "the losing instance cancels pending autosave");

  await a.lease.release();
  await b.lease.release();
}

// A stale lease (heartbeat older than the stale window) can be re-acquired.
{
  const storage = new Map();
  storage.set("ai-system6-write-lease", JSON.stringify({
    instanceId: "dead-instance",
    claimedAt: Date.now() - 60000,
    heartbeatAt: Date.now() - 30000,
  }));
  const c = createLeaseInstance(storage);
  connectChannels([c]);
  const acquired = await c.lease.acquire();
  test.assert(acquired.writer === true, "a stale lease can be re-acquired");
  test.assert(c.lease.isOwner() === true, "the new instance becomes the writer");
  await c.lease.release();
}

// A takeover through the localStorage fallback path also strips the writer.
{
  const storage = new Map();
  const a = createLeaseInstance(storage, { noBroadcastChannel: true });
  const b = createLeaseInstance(storage, { noBroadcastChannel: true });
  connectChannels([a, b]);
  await a.lease.acquire();
  await b.lease.acquire();
  // Force the storage-event fallback: replace the lease and deliver the event.
  const claim = {
    instanceId: b.lease.instanceId,
    claimedAt: Date.now(),
    heartbeatAt: Date.now(),
  };
  storage.set("ai-system6-write-lease", JSON.stringify(claim));
  a.window.listeners.storage?.forEach((listener) => listener({ key: "ai-system6-write-lease", newValue: JSON.stringify(claim) }));
  test.assert(a.lease.isOwner() === false, "the storage fallback strips the old writer");
  await a.lease.release();
  await b.lease.release();
}

test.finish();
