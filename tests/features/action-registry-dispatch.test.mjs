// Real execution, not source reading: this test boots the actual eager
// module set in a VM (tests/helpers/app-boot-vm.mjs) and calls the app's own
// getApplicationCommandRegistry() the way handleAction() does, instead of
// grepping actions.js for a pattern that looks safe.
//
// This is the direct fix for the incident named in CLAUDE.md's Common
// Pitfalls: "Making an eager module lazy: bare function references bite
// first." 253 static contracts stayed green while 20 route commands were
// silently dead, because a bare reference to a not-yet-loaded function
// resolves at registry-build time — a fact only the real JS engine can see.
// tests/features/lazy-action-handlers.test.mjs already fights this class of
// bug with hand-built regex scope analysis (declares(), stub-name scraping);
// this test gets the same guarantee for free by letting the real engine
// resolve every identifier, and is a candidate to retire that file once it
// has run in CI for a while (see the backlog note in the harness report).

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("action-registry-dispatch");

const vmw = createAppBootVm();
const ctx = vmw.context;

// Sanity: prove the harness actually loaded the real app rather than an
// empty context. A regression here would make every assertion below
// vacuously true, which is worse than not having the test.
const handlers = ctx.getApplicationActionHandlers();
test.assert(
  Object.keys(handlers).length > 150,
  `getApplicationActionHandlers() returned ${Object.keys(handlers).length} entries (expected the real app's own count, well over 150)`
);

const registry = ctx.getApplicationCommandRegistry();
test.assert(registry.size > 300, `getApplicationCommandRegistry() returned ${registry.size} entries (expected well over 300)`);

// The acceptance test named in the task: every action id in the registry
// dispatches to something callable. A bare reference to an undefined
// identifier throws while the registry OBJECT is being built (a
// ReferenceError, not a per-entry failure), so this loop mostly proves the
// harness got this far at all — but it also catches the narrower case of an
// entry whose value silently evaluated to something other than a function.
const nonCallable = [];
for (const [id, command] of registry) {
  if (typeof command.handler !== "function") nonCallable.push(id);
}
test.assert(
  nonCallable.length === 0,
  nonCallable.length
    ? `${nonCallable.length} action id(s) have a non-callable handler: ${nonCallable.join(", ")}`
    : `every one of ${registry.size} registered action ids dispatches to a callable handler`
);

// Lazy commands (registerLazyCommand) resolve through handleAction's own
// lazy-load branch rather than sitting in the map already built — the
// harness's script-tag loader shim (see app-boot-vm.mjs) makes `.ensure()`
// actually load the real module, so this checks the SAME lazy path a real
// click uses, not a parallel one.
const lazyCommands = ctx.window.AISystem6Runtime.lazyCommands;
test.assert(lazyCommands.size > 0, `the lazy command registry is empty (expected some — got ${lazyCommands.size})`);
const nonCallableLazy = [];
for (const [id, entry] of lazyCommands) {
  if (typeof entry.ensure !== "function") nonCallableLazy.push(id);
}
test.assert(
  nonCallableLazy.length === 0,
  nonCallableLazy.length
    ? `${nonCallableLazy.length} lazy action id(s) have a non-callable ensure(): ${nonCallableLazy.join(", ")}`
    : `every one of ${lazyCommands.size} lazy action ids has a callable ensure()`
);

// Exercise one lazy command's real ensure() end to end — this is the "load a
// lazy module through the real loader path" capability the harness exists
// for. If a lazy module's loader is wired to the wrong path or its Loaded
// flag never gets set, ensure() rejects; a static contract cannot see this
// because it never runs the loader.
test.assert(
  ctx.window.AISystem6WritingFlowLoaded !== true,
  "writing-flow starts unloaded, so ensure() below is a real load, not a no-op"
);
await ctx.openQuestionSheetSurface();
test.assert(
  ctx.window.AISystem6WritingFlowLoaded === true,
  "calling a lazy-stubbed handler (open-question-sheet) loads its real module through the real loader"
);
test.assert(
  typeof ctx.openQuestionSheetSurface === "function" && ctx.openQuestionSheetSurface.name !== "lazyWritingFlowStub",
  "after loading, the global name resolves to the real function, not the stand-in stub"
);

// The keyboard shortcut registry names an `action` for every dispatchable
// shortcut. Most resolve in the eager registry already checked above;
// `dispatch: false` entries are intentionally decorative (Key Caps summary
// rows) and are excluded the same way runShortcut() itself excludes them.
// A shortcut CAN legitimately name an action that only exists once its own
// window's module has loaded and self-registered (`registerApplication`
// inside e.g. scrapbook.js, clio-chart.js, the lightroom) — that is a real,
// intentional pattern, not the dead-command bug, so those are reported
// separately rather than failed: this loop only asserts on the eager half.
const shortcutRegistry = vmw.run("keyboardShortcutRegistry");
const eagerShortcutOffenders = [];
const moduleScopedShortcuts = [];
for (const shortcut of shortcutRegistry) {
  if (shortcut.dispatch === false) continue;
  if (registry.has(shortcut.action) || lazyCommands.has(shortcut.action)) continue;
  // A window-scoped shortcut whose window carries its own lazy loader
  // registers its command only once that window's module runs — not yet, in
  // a fresh boot. Anything else naming an unregistered action is the real
  // dead-command shape this test exists to catch.
  const scopeWindow = Array.isArray(shortcut.scope) ? shortcut.scope[0] : null;
  const record = scopeWindow ? windowRegistryRecords()[scopeWindow] : null;
  if (record?.lazy) moduleScopedShortcuts.push(shortcut.action);
  else eagerShortcutOffenders.push(shortcut.action);
}
test.assert(
  eagerShortcutOffenders.length === 0,
  eagerShortcutOffenders.length
    ? `${eagerShortcutOffenders.length} keyboard shortcut(s) name an action with no registered command and no lazy window to explain it: ${eagerShortcutOffenders.join(", ")}`
    : `every eagerly-dispatchable keyboard shortcut names a registered action (${shortcutRegistry.length} shortcuts checked, ${moduleScopedShortcuts.length} deferred to their own lazy window's module)`
);

test.finish();
// See control-panel-input-wiring.test.mjs's comment on this same line: a
// real boot can leave unrelated background async work in flight, and
// test.finish() does not exit on success.
process.exit(0);
