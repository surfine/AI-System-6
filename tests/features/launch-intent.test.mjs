import vm from "node:vm";
import { read } from "../helpers/feature-test-harness.mjs";

const context = vm.createContext({ window: {} });
vm.runInContext(read("app/core/launch-intent.js"), context);

const parse = context.window.AISystem6LaunchIntent.parse;
const assert = (condition, message) => {
  if (!condition) {
    console.error(`NO  launch-intent: ${message}`);
    process.exit(1);
  }
  console.log(`OK  launch-intent: ${message}`);
};

assert(parse("?open=micropolis").open?.command === "open-micropolis", "open=micropolis resolves to the registered command");
assert(parse("?open=teachtext").open?.command === "open-teachtext", "open=teachtext resolves to the registered command");
assert(parse("?open=reader&appearance=liquid-glass").appearance === "liquid-glass", "appearance=liquid-glass is a valid release appearance");
assert(parse("?tour=writing").tour === "writing", "tour=writing is recognized");
assert(parse("?open=unknown-app").open === null, "unknown open targets are ignored");
assert(parse("?appearance=not-a-theme").appearance === "", "unknown appearances are ignored");
assert(parse("?tour=secrets").tour === "", "unknown tours are ignored");
assert(parse("?open=micropolis&apiKey=should-not-appear").open?.command === "open-micropolis", "extra query parameters do not expand the contract");

console.log("\nlaunch-intent feature test passed.");

// Writer Mode is entered once, at boot, from ?tour=writing. It has no switch.
//
// It had one until 2026-05-21, when the menu migration took it away. Restoring
// it was tried and measured: with a keep-set replacing the stale 31-window
// close list, a re-entrancy guard, and the sweep moved after every step that
// can put a window on the desk, three identical toggles still produced two
// different desks -- and one of them closed the manuscript the writer was in.
// Entering once from a clean desk is stable; toggling mid-session is not.
//
// So a switch is not a restore. It needs the arrangement to be idempotent
// against a window manager that changed underneath it, and until that is done,
// a menu row hands the writer a control that can close their work.
const actionsSource = read("app/core/actions.js");
const menusSource = read("app/data/menus.js");
assert(
  !actionsSource.includes('"toggle-writer-mode"') && !menusSource.includes("toggle-writer-mode"),
  "Writer Mode has no toggle: toggling it mid-session is not yet idempotent",
);
assert(
  read("app/core/launch-intent.js").includes('tour === "writing"'),
  "and the deep link that does enter it is still the way in",
);
