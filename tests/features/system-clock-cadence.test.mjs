// The desk clock shows hours and minutes, so it repaints on the minute instead
// of once a second, and coming back from a hidden page reads the real time at
// once rather than waiting for the next boundary.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import vm from "node:vm";

const test = createFeatureTest("system-clock-cadence");

const vmw = createAppBootVm();
const run = (code) => vmw.run(code);

// The Control Strip's adapters are a lazy module; the clock tile's adapter is
// the consumer under test, so the real source is evaluated in this runtime.
vm.runInContext(
  read("app/features/control-strip-modules.js"),
  vmw.context,
  { filename: "app/features/control-strip-modules.js" }
);

// A clock face the test can count, and timers the test drives.
run(`
  window.__clockPaints = 0;
  window.__timers = [];
  window.__realSetTimeout = setTimeout;
  window.__realClearTimeout = clearTimeout;
  setTimeout = (fn, delay) => { window.__timers.push({ fn, delay }); return window.__timers.length; };
  clearTimeout = (id) => { if (id > 0) window.__timers[id - 1] = null; };
  window.__pendingTimers = () => window.__timers.filter(Boolean).map((entry) => entry.delay);
  // The clock's own timer, not "whatever timer is next": the harness's
  // setTimeout stub also catches timers the desk schedules for its own work.
  window.__clockTimerIndex = -1;
  window.__armClock = () => {
    window.__clockTimerIndex = window.__timers.length;
    startSystemClock();
  };
  window.__tickClock = () => {
    const entry = window.__timers[window.__clockTimerIndex];
    if (!entry) return null;
    window.__timers[window.__clockTimerIndex] = null;
    entry.fn();
    // The clock schedules its next tick last; remember where it landed.
    window.__clockTimerIndex = window.__timers.length - 1;
    return { fired: entry.delay, next: window.__timers[window.__clockTimerIndex] || null };
  };
  window.__visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => window.__visibility });
  window.__setVisibility = (value) => { window.__visibility = value; document.dispatchEvent(new Event("visibilitychange")); };
  // Count the paint, not updateClock itself: the real updateClock also hands
  // the tick to its subscribers, which is part of what this test checks.
  renderSystemClock = () => { window.__clockPaints += 1; };
`);

const started = await run(`
  (() => {
    window.AISystem6Runtime && void 0;
    window.__armClock();
    return { paints: window.__clockPaints, pending: window.__pendingTimers(), timer: window.__timers[window.__clockTimerIndex] || null };
  })()
`);
test.assert(started.paints === 1, "starting the clock paints the current time once");
test.assert(
  started.timer !== null && started.timer.delay > 0 && started.timer.delay <= 60000,
  "and schedules exactly one tick, no further away than the next minute"
);

// A minute-aligned tick repaints and schedules the next one.
const afterOneMinute = await run(`
  (() => {
    const tick = window.__tickClock();
    return { delay: tick?.fired ?? null, paints: window.__clockPaints, next: tick?.next || null };
  })()
`);
test.assert(afterOneMinute.paints === 2, "a minute boundary repaints the clock");
test.assert(
  afterOneMinute.next !== null && afterOneMinute.next.delay > 0 && afterOneMinute.next.delay <= 60000,
  "and the next boundary is scheduled from there, so the tick keeps its alignment"
);

// Ten minutes of desk time is ten repaints, not six hundred.
const overTenMinutes = await run(`
  (() => {
    const before = window.__clockPaints;
    for (let minute = 0; minute < 9; minute += 1) window.__tickClock();
    return { paints: window.__clockPaints - before };
  })()
`);
test.assert(
  overTenMinutes.paints === 9,
  "ten minutes of clock time costs one repaint per minute, not one per second"
);

// Coming back from a hidden page reads the real time at once.
const afterReturn = await run(`
  (() => {
    const before = window.__clockPaints;
    window.__setVisibility("hidden");
    const whileHidden = window.__clockPaints - before;
    window.__setVisibility("visible");
    return { whileHidden, onReturn: window.__clockPaints - before - whileHidden };
  })()
`);
test.assert(afterReturn.whileHidden === 0, "a hidden page does not repaint the clock");
test.assert(afterReturn.onReturn === 1, "and the return paints the real time immediately");

// Everything that shows the clock shares the one tick. The Control Strip's
// tile used to keep its own one-second interval for the same minute.
const sharedTick = await run(`
  (() => {
    let stripRefreshes = 0;
    const unsubscribe = controlStripSubscribeClock(() => { stripRefreshes += 1; });
    const before = stripRefreshes;
    // The return-from-hidden path re-scheduled the clock; its newest timer is
    // the one this block should fire.
    window.__clockTimerIndex = window.__timers.length - 1;
    const tick = window.__tickClock();
    const afterOneMinute = stripRefreshes - before;
    unsubscribe();
    window.__tickClock();
    return { subscribed: typeof unsubscribe === "function", afterOneMinute, afterUnsubscribe: stripRefreshes - before, tickDelay: tick?.fired ?? null };
  })()
`);
test.assert(
  sharedTick.tickDelay !== null && sharedTick.afterOneMinute === 1,
  "the Control Strip's clock tile refreshes on the desk clock's minute tick"
);
test.assert(
  sharedTick.afterUnsubscribe === 1,
  "and stops the moment its subscription is released"
);

test.finish();
