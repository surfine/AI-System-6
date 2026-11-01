// Shared VM builder for write-lease tests: two instances over one storage
// map, a connected broadcast bus, and controllable flush stubs.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { read } from "./feature-test-harness.mjs";

const leaseSource = read("app/core/write-lease.js");

export function createWriteLeaseInstance(storage, options = {}) {
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
    BroadcastChannel: options.noBroadcastChannel
      ? class {
        constructor() { throw new Error("BroadcastChannel unavailable"); }
      }
      : class {
        constructor(name) { this.name = name; channels.push(this); }
        addEventListener(_name, listener) { this._listener = listener; }
        postMessage(message) { this._sent = message; }
      },
    setTimeout: options.fastTimers ? (fn) => setTimeout(fn, 10) : setTimeout,
    clearTimeout,
    setInterval: options.fastTimers ? (fn) => setInterval(fn, 10) : setInterval,
    clearInterval,
    t: (key) => key,
    setStatus: () => {},
    updateMenuState: () => {},
    cancelWorkingSessionAutosave: () => { context.__autosaveCancelled = true; },
    flushPendingQuickDraftCommit: async () => (options.flushDraft === false ? false : true),
    flushWorkingSessionCommit: async () => true,
    saveDeskState: async () => (options.saveDesk === false ? false : true),
    showSystemModal: async () => "yes",
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

export function connectWriteLeaseChannels(instances) {
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
