// Repeatedly opening and closing a window must not add observers, listeners or
// timers each round. Fixed cycle counts, compared: a rise means something is
// registered per open and never released.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("window-resource-growth");

const vmw = createAppBootVm();
const run = (code) => vmw.run(code);

run(`
  // Count what is still LIVE, not what has ever been created: a one-shot timer
  // that has fired, or an interval that was cleared, is not a leak.
  window.__liveIntervals = new Set();
  window.__liveObservers = new Set();
  window.__pendingTimeouts = new Set();
  window.__createdObservers = 0;
  const RealObserver = MutationObserver;
  MutationObserver = function CountingObserver(...args) {
    const observer = new RealObserver(...args);
    window.__createdObservers += 1;
    window.__liveObservers.add(observer);
    const realDisconnect = observer.disconnect.bind(observer);
    observer.disconnect = () => { window.__liveObservers.delete(observer); return realDisconnect(); };
    return observer;
  };
  MutationObserver.prototype = RealObserver.prototype;
  const realSetInterval = setInterval;
  const realClearInterval = clearInterval;
  const realSetTimeout = setTimeout;
  const realClearTimeout = clearTimeout;
  setInterval = (fn, ms) => { const id = realSetInterval(fn, ms); window.__liveIntervals.add(id); return id; };
  clearInterval = (id) => { window.__liveIntervals.delete(id); return realClearInterval(id); };
  setTimeout = (fn, ms, ...rest) => {
    const id = realSetTimeout(() => { window.__pendingTimeouts.delete(id); fn(); }, ms, ...rest);
    window.__pendingTimeouts.add(id);
    return id;
  };
  clearTimeout = (id) => { window.__pendingTimeouts.delete(id); return realClearTimeout(id); };
  window.__counts = () => ({
    observers: window.__liveObservers.size,
    intervals: window.__liveIntervals.size,
    pendingTimeouts: window.__pendingTimeouts.size,
  });
`);

const cycles = await run(`
  (async () => {
    const samples = [];
    // The product's own paths: the command that opens the window, and the
    // close box that hides it. Re-mounting an application directly asks for
    // the write lease again, which is not something a window does.
    for (let round = 0; round < 4; round += 1) {
      await handleAction("open-calculator");
      await Promise.resolve();
      samples.push(window.__counts());
      document.querySelector('[data-window="calculator"] .close-box')
        ?.dispatchEvent(new Event("click", { bubbles: true }));
      await Promise.resolve();
    }
    return samples;
  })()
`);

test.assert(cycles.length === 4, "four open/close cycles were measured");
// Compare the last two cycles, not the first and the last: a lazy module (the
// alarm clock's own one-second check, for instance) loads on an early open and
// never loads again, so the first cycle may legitimately add a resource the
// later ones must not add again.
const first = cycles[cycles.length - 2];
const last = cycles[cycles.length - 1];
test.assert(
  last.observers === first.observers,
  `live observers do not grow with repeated open/close (${first.observers} -> ${last.observers})`
);
test.assert(
  last.intervals === first.intervals,
  `live intervals do not grow with repeated open/close (${first.intervals} -> ${last.intervals})`
);
// One-shot timers are deliberately not asserted on: this harness runs the
// whole sequence synchronously, so the desk's debounce timers (80ms/220ms for
// the writing spine's title alignment) are all still pending when the samples
// are taken. Their count says nothing about leaks - the live observers and
// intervals above are the ones that would grow.

test.finish();
