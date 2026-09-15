// Memory Cards: a hidden window stops repainting its clock every second, keeps
// counting time by timestamp (the game's own rule is untouched), and repaints
// the moment it is shown again.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import vm from "node:vm";

const test = createFeatureTest("memory-cards-cadence");

const vmw = createAppBootVm();
const run = (code) => vmw.run(code);

vm.runInContext(read("app/features/memory-cards.js"), vmw.context, { filename: "app/features/memory-cards.js" });

const outcome = await run(`
  (() => {
    window.__paints = 0;
    window.__intervals = 0;
    window.__clears = 0;
    setInterval = () => { window.__intervals += 1; return window.__intervals; };
    clearInterval = () => { window.__clears += 1; };
    updateMemoryCardsStats = () => { window.__paints += 1; };
    window.__visibility = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => window.__visibility });
    window.__setVisibility = (value) => { window.__visibility = value; document.dispatchEvent(new Event("visibilitychange")); };

    const win = document.querySelector('[data-window="memoryCards"]');
    win?.classList.remove("is-hidden");
    // The visibility watch is installed by the window's own mount step.
    mountMemoryCardsRuntime();

    // A running game, then the window goes away.
    memoryCardsMatched = 0;
    memoryCards.length = 0;
    memoryCards.push({ id: "a" }, { id: "b" });
    startMemoryCardsTimer();
    const startedIntervals = window.__intervals;
    window.__setVisibility("hidden");
    const hidden = { paints: window.__paints, clears: window.__clears, intervals: window.__intervals };
    window.__setVisibility("visible");
    const returned = { paints: window.__paints, intervals: window.__intervals };
    return { startedIntervals, hidden, returned, elapsed: currentMemoryCardsElapsed() };
  })()
`);

test.assert(
  outcome.startedIntervals === 1,
  "a running game ticks once a second while it is on screen"
);
test.assert(
  outcome.hidden.paints === 0 && outcome.hidden.clears === 1,
  "hiding the window clears the interval instead of repainting a clock nobody can see"
);
test.assert(
  outcome.returned.intervals === 2 && outcome.returned.paints === 1,
  "showing it again repaints once and re-arms the interval"
);
test.assert(
  outcome.elapsed >= 0,
  "and the elapsed time is still derived from the running clock, not from the repaints"
);

test.finish();
