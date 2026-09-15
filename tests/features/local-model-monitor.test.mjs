// Local model readiness polling: one request at a time, nothing while the page
// is hidden, a bounded backoff while the endpoint is unreachable, and one
// refresh the moment the writer comes back to the tab.
//
// The timers are replaced with a queue the test drives, so the schedule is
// checked exactly rather than by waiting.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("local-model-monitor");

const vmw = createAppBootVm();
vmw.run(`
  window.__visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => window.__visibility,
  });
  window.__timerQueue = [];
  window.__listModelsCalls = 0;
  window.__pendingListModels = null;
  setTimeout = (fn, delay) => {
    window.__timerQueue.push({ fn, delay });
    return window.__timerQueue.length;
  };
  clearTimeout = (id) => { if (id > 0) window.__timerQueue[id - 1] = null; };
  window.__fireTimers = () => {
    const queued = window.__timerQueue.filter(Boolean);
    window.__timerQueue = [];
    queued.forEach((entry) => entry.fn());
    return queued.map((entry) => entry.delay);
  };
  window.__pendingDelays = () => window.__timerQueue.filter(Boolean).map((entry) => entry.delay);
  window.__settleListModels = (ok, data) => {
    const pending = window.__pendingListModels;
    window.__pendingListModels = null;
    if (!pending) return;
    if (ok) pending.resolve(data);
    else pending.reject(new Error("local server unreachable"));
  };
  window.__setVisibility = (value) => {
    window.__visibility = value;
    document.dispatchEvent(new Event("visibilitychange"));
  };

  localLmStudioConnectionEnabled = true;
  modelInput.value = "local-model";
  window.AISystem6LocalLMStudio = {
    listModels() {
      window.__listModelsCalls += 1;
      return new Promise((resolve, reject) => { window.__pendingListModels = { resolve, reject }; });
    },
  };
`);

const calls = () => vmw.run("window.__listModelsCalls");
const pendingDelays = () => vmw.run("window.__pendingDelays()");
// The monitor only asks when something still needs the answer, so each fired
// tick restores the preconditions the test set up: an endpoint that is
// enabled, a selected model, and no run in progress.
const fireTimers = () => vmw.run(`
  localLmStudioConnectionEnabled = true;
  localModelState.running = false;
  modelInput.value = "local-model";
  window.__fireTimers();
`);

vmw.run("startLocalModelMonitor()");
await new Promise((resolve) => setTimeout(resolve, 20));
test.assert(calls() === 1, "the monitor asks once when it starts");

// A slow request must not be joined by a second one from the schedule: the
// next check is only planned after this one settles.
fireTimers();
await new Promise((resolve) => setTimeout(resolve, 20));
test.assert(calls() === 1, "a tick while a request is in flight does not start a second request");
test.assert(pendingDelays().length === 0, "and it does not schedule ahead of the running request");

vmw.run("window.__settleListModels(true, { chatModels: [], embeddingModels: [] })");
await new Promise((resolve) => setTimeout(resolve, 30));
test.assert(pendingDelays().length === 1, "the next check is scheduled once the previous one settles");
test.assert(pendingDelays()[0] === 5000, "a reachable endpoint keeps the normal five-second cadence");

// Unreachable: the schedule backs off instead of hammering the same endpoint.
fireTimers();
await new Promise((resolve) => setTimeout(resolve, 20));
vmw.run("window.__settleListModels(false)");
await new Promise((resolve) => setTimeout(resolve, 30));
test.assert(pendingDelays()[0] === 10000, "a failed check backs the next one off to ten seconds");

fireTimers();
await new Promise((resolve) => setTimeout(resolve, 20));
vmw.run("window.__settleListModels(false)");
await new Promise((resolve) => setTimeout(resolve, 30));
test.assert(pendingDelays()[0] === 20000, "and it keeps backing off while the endpoint stays down");

// Hidden: no requests and no schedule until the writer comes back.
vmw.run("window.__setVisibility('hidden')");
await new Promise((resolve) => setTimeout(resolve, 20));
const callsWhileHidden = calls();
await new Promise((resolve) => setTimeout(resolve, 30));
test.assert(calls() === callsWhileHidden, "a hidden page does not poll the local endpoint");
test.assert(pendingDelays().length === 0, "and it leaves no timer running in the background");

vmw.run("window.__setVisibility('visible')");
await new Promise((resolve) => setTimeout(resolve, 20));
test.assert(calls() === callsWhileHidden + 1, "coming back to the tab refreshes once");
test.assert(pendingDelays().length === 0, "and that refresh waits for its own answer before scheduling again");

vmw.run("window.__settleListModels(true, { chatModels: [], embeddingModels: [] })");
await new Promise((resolve) => setTimeout(resolve, 30));
test.assert(pendingDelays()[0] === 5000, "the normal cadence is restored after a successful refresh");

test.finish();
