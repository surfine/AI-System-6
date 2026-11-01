// Lease fencing races: even when two instances interleave reads and writes,
// exactly one instance passes the stored-owner verification at write time,
// and no late heartbeat / release can overwrite or delete the new owner.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { connectWriteLeaseChannels, createWriteLeaseInstance } from "../helpers/write-lease-vm.mjs";

const test = createFeatureTest("single-writer-race");
const transactionsSource = read("app/core/storage-transactions.js");

// Simultaneous acquisition with a stale read and a late rival claim: the
// read-back fence leaves exactly one writer.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage);
  const b = createWriteLeaseInstance(storage);
  connectWriteLeaseChannels([a, b]);
  const leaseKey = "ai-system6-write-lease";

  // B claims first (normal path).
  const bAcquired = await b.lease.acquire();
  test.assert(bAcquired.writer === true, "B acquires normally");

  // A's reads are stale (it read "no lease" before B wrote), and B re-claims
  // immediately after A's first write — so A's read-back must fail.
  const originalGet = storage.get.bind(storage);
  const originalSet = storage.set.bind(storage);
  let aWrites = 0;
  let aReads = 0;
  storage.get = (key) => {
    if (key === leaseKey) {
      aReads += 1;
      // A's first read is stale: it saw "no lease" before B wrote.
      if (aReads === 1) return null;
    }
    return originalGet(key);
  };
  storage.set = (key, value) => {
    originalSet(key, value);
    if (key === leaseKey) {
      aWrites += 1;
      if (aWrites === 1) originalSet(key, JSON.stringify({ instanceId: b.lease.instanceId, claimedAt: Date.now(), heartbeatAt: Date.now() }));
    }
  };
  const aAcquired = await a.lease.acquire();
  test.assert(aAcquired.writer === false && aAcquired.readOnly === true, "the stale reader ends read-only after the read-back fence");
  test.assert(b.lease.isOwner() === true, "the rival claimant remains the only writer");
  test.assert(a.lease.isOwner() === false, "instance A never becomes a writer");

  // A's storage boundary rejects writes because the STORED owner is not A.
  vm.runInContext(transactionsSource, a.context);
  let rejected = null;
  try {
    await a.context.window.AISystem6StorageTransactions.runTransaction({}, "keyval", "readwrite", () => {});
  } catch (error) {
    rejected = error;
  }
  test.assert(rejected?.code === "READ_ONLY_INSTANCE", "the transaction fence rejects the memory-writer whose stored lease is gone");

  await b.lease.release();
}

// Heartbeat after takeover: a late heartbeat must not overwrite the new owner.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage, { fastTimers: true });
  const b = createWriteLeaseInstance(storage, { fastTimers: true });
  connectWriteLeaseChannels([a, b]);
  await a.lease.acquire();
  await b.lease.acquire();
  await b.lease.takeOver();
  const storedAfterTakeover = JSON.parse(storage.get("ai-system6-write-lease"));
  test.assert(storedAfterTakeover.instanceId === b.lease.instanceId, "the new owner holds the stored lease");
  await a.lease.reconcile();
  const storedAfterReconcile = JSON.parse(storage.get("ai-system6-write-lease"));
  test.assert(storedAfterReconcile.instanceId === b.lease.instanceId, "reconcile never overwrites the new owner");
  test.assert(a.lease.isOwner() === false && a.lease.isReadOnly() === true, "the old instance is read-only after reconcile");
  await new Promise((resolve) => setTimeout(resolve, 30));
  const storedAfterHeartbeats = JSON.parse(storage.get("ai-system6-write-lease"));
  test.assert(storedAfterHeartbeats.instanceId === b.lease.instanceId, "late heartbeat ticks never replace the new owner");
  await b.lease.release();
}

// Late pagehide / release after takeover: only the stored owner can be deleted.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage, { noBroadcastChannel: true });
  const b = createWriteLeaseInstance(storage, { noBroadcastChannel: true });
  await a.lease.acquire();
  await b.lease.acquire();
  await b.lease.takeOver();
  await a.lease.release();
  const stored = JSON.parse(storage.get("ai-system6-write-lease"));
  test.assert(stored.instanceId === b.lease.instanceId, "the late old-window release leaves the new owner's lease intact");
  await b.lease.release();
}

// BFCache / foreground resume re-verifies the stored owner.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage);
  const b = createWriteLeaseInstance(storage);
  connectWriteLeaseChannels([a, b]);
  await a.lease.acquire();
  await b.lease.acquire();
  await b.lease.takeOver();
  const reconciled = await a.lease.reconcile();
  test.assert(reconciled.readOnly === true, "resume with another fresh owner reconciles to read-only");
  test.assert(a.lease.isOwner() === false, "the resumed instance never auto-takeovers");
  await b.lease.release();
}

// The page that is leaving gives the pen back and does not pick it up again.
//
// Chromium fires visibilitychange AFTER pagehide, so the resume path runs in a
// document that has already released the lease - and it used to claim it
// straight back. The claim it left behind looked fresh to the next window,
// which then waited out the handshake timeout and asked the writer about a
// window that no longer existed.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage, { fastTimers: true });
  const b = createWriteLeaseInstance(storage, { fastTimers: true });
  connectWriteLeaseChannels([a, b]);
  await a.lease.acquire();
  test.assert(a.lease.isOwner() === true, "the writer holds the pen before it leaves");
  a.window.listeners.pagehide.forEach((listener) => listener());
  test.assert(!storage.has("ai-system6-write-lease"), "the lease is gone the moment the page goes away");
  const reconciled = await a.lease.reconcile();
  test.assert(
    reconciled.readOnly === true && !storage.has("ai-system6-write-lease"),
    "the leaving page cannot claim its own lease back",
  );
  const arriving = await b.lease.acquire();
  test.assert(
    arriving.writer === true,
    "the next window claims the desk directly instead of waiting on a window that left",
  );
  await b.lease.release();

  // Back from BFCache is the same document coming back to life, not one that is
  // leaving; the guard must lift or the returned page refuses its own pen.
  a.window.listeners.pageshow.forEach((listener) => listener({ persisted: true }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  const held = JSON.parse(storage.get("ai-system6-write-lease") || "null");
  test.assert(
    held?.instanceId === a.lease.instanceId && Number(held.epoch) > 0,
    "a page restored from BFCache can hold the pen again",
  );
  await a.lease.release();
}

test.finish();
