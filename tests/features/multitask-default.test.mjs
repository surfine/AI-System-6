// Unified spec (2026-10-10) W06 product decision contract: a NEW desk runs
// as MultiFinder; an existing user's explicitly saved environment — including
// a chosen single-application Finder — survives. Shape-checked against the
// real sources because the decision lives in two files' initialization and
// the working-session restore.
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("multitask-default");
const app = read("app.js");
const workingSession = read("app/core/working-session.js");

// 1. The defaults are MultiFinder now.
test.assert(app.includes('let startupEnvironment = "multifinder";'),
  "a new desk's startup environment is MultiFinder (the product decision, spec §1.1)");
test.assert(app.includes('let runtimeEnvironment = "multifinder";'),
  "a new desk's runtime environment starts MultiFinder");
test.assert(app.includes("Unified spec W06"), "the default change carries its decision note in place");

// 2. The restore treats the saved environment as authoritative BOTH ways.
test.assert(workingSession.includes('state.runtimeEnvironment === "multifinder" || state.runtimeEnvironment === "finder"'),
  "a saved explicit finder choice is honored, not silently upgraded");

// 3. The settings affordance still exists: the Control Strip offers both
//    environments by their existing labels (the explicit choice must remain
//    reachable from settings).
const controlStrip = read("app/features/control-strip-modules.js");
test.assert(controlStrip.includes("finder_environment_single_label") && controlStrip.includes('setFinderEnvironment("finder")'),
  "the single-application Finder remains an explicit choice in settings");

// 4. Dock visibility still never changes the business state by itself: the
//    mode is a function of environment + Dock capability, and hiding the Dock
//    does not write the environment.
const multiFinder = read("app/core/multi-finder.js");
test.assert(multiFinder.includes("function dockKeepsMultiFinder()") && multiFinder.includes("syncDockMultiFinder"),
  "Dock visibility feeds presentation only (menus redraw; the saved environment is untouched)");

// 5. The Mac OS X-era multitasking semantics are untouched: the NeXTSTEP-era
//    early return in prepareFinderModeForApp stays (launching never quits).
test.assert(multiFinder.includes('getCurrentTheme() === "nextstep"'),
  "NeXTSTEP-era launching never quits another application");

test.finish();
