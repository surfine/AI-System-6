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

// Standalone launch routes (1.0.52): an external ?launch= route maps to the
// feature command that owns the window, and ?mode=fullscreen requests the
// System 6 zoom behaviour.
assert(parse("?launch=endfield-terminal").launch?.command === "open-endfield-terminal", "launch=endfield-terminal resolves to the terminal command");
assert(parse("?launch=endfield-terminal").launch?.window === "endfieldTerminal", "launch routes name the window they own");
assert(parse("?launch=bonsai-city").launch?.command === "open-bonsai-city", "launch=bonsai-city resolves to the bonsai command");
assert(parse("?launch=time-machine").launch?.command === "open-time-machine", "launch=time-machine resolves to the time-machine command");
assert(parse("?launch=liquid-cover").launch?.command === "open-liquid-cover", "launch=liquid-cover resolves to the liquid-cover command");
assert(parse("?launch=micropolis").launch?.command === "open-micropolis", "launch=micropolis resolves to the micropolis command");
assert(parse("?launch=openttd").launch?.command === "open-openttd", "launch=openttd resolves to the openttd command");
assert(parse("?launch=doom").launch?.command === "open-doom", "launch=doom resolves to the doom command");
assert(parse("?launch=endfield-terminal&mode=fullscreen").launch?.fullscreen === true, "mode=fullscreen requests the zoomed layout");
assert(parse("?launch=endfield-terminal&mode=plain").launch?.fullscreen === false, "an unknown mode stays ordinary");
assert(parse("?launch=not-a-route").launch === null, "unknown launch routes are ignored");
assert(parse("?launch=endfield-terminal&apiKey=should-not-appear").launch?.command === "open-endfield-terminal", "extra launch query parameters do not expand the contract");

// The route table is replicated on purpose: the browser module cannot require
// the Node server, and Cloudflare Pages ships its own function. A consistency
// contract keeps the three copies from drifting apart.
const launchSource = read("app/core/launch-intent.js");
const serverGo = read("apps/server/server/routes/go.js");
let pagesGo = "";
try {
  pagesGo = read("functions/go/[route].js");
} catch {
  // Pages Functions are not part of the public source snapshot; the
  // three-copy contract still runs fully in the private tree.
}
assert(
  serverGo.includes('"endfield-terminal"') && serverGo.includes('"liquid-cover"'),
  "the local /go redirector carries every launch route",
);
if (pagesGo) {
  assert(
    pagesGo.includes('"endfield-terminal"') && pagesGo.includes('"liquid-cover"'),
    "the Cloudflare Pages /go function carries every launch route",
  );
}
assert(
  launchSource.includes('"endfield-terminal"') && launchSource.includes('"liquid-cover"'),
  "the browser launch-intent carries every launch route",
);
const appSource = read("app.js");
assert(
  appSource.includes("runStandaloneLaunchIntent") && appSource.includes("launch"),
  "boot wakes the standalone launch intent when ?launch= is present",
);

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
