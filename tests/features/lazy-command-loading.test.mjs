// Real execution, converting a static family: lazy-module-reachable.test.mjs
// checks that every file in lazyRuntimePaths is NAMED as a string literal
// somewhere in the built bundle. That is real and worth keeping (it is what
// caught 文字亮室's durable half sitting unreachable for a day — see that
// file's own comment) — but "named" is not "loads". A loader can name its
// source correctly and still fail once actually run: a missing browser
// global at the module's own top level, a duplicate top-level `const` that
// collides with something already loaded, a Loaded-flag that never gets set.
// None of those are visible from the bundle text.
//
// Two sections, two different guarantees:
//
// 1. Every registered lazy ACTION (window.AISystem6Runtime.lazyCommands —
//    the same map handleAction() itself resolves through) loads through its
//    real ensure() without throwing.
//
// 2. Every builtByModule WINDOW's real ApplicationShell.createWindow() call
//    actually runs and produces a real, queryable window. This section did
//    not exist in the first version of this file: it reported all 13
//    ApplicationShell-based windows green on the strength of section 1 alone
//    (their ensure() resolved without throwing), while this harness was
//    separately auto-vivifying a stub for any `[data-window="name"]` lookup —
//    which made every one of those windows' own
//    `if (document.querySelector('[data-window="name"]')) return;` guard
//    find the stub and skip construction. createWindow() had never once
//    actually run for any of them, under any test, while this file reported
//    all thirteen green. See app-boot-vm.mjs's windowElement()/promote() for
//    the fix: a builtByModule window is no longer auto-vivified, so it stays
//    genuinely absent until its own module really builds and appends it.
//
// While building section 1, the harness itself was missing `Audio`
// (Soundscape constructs one at its own module top level) — see
// app-boot-vm.mjs's Audio stub. While building section 2, it was missing
// support for a comma-separated selector list (`.is-up, .is-left` — OR, not
// a two-class AND) and a working className setter (application-shell.js
// assigns win.className as a string, not classList.add() calls) — both
// fixed in app-boot-vm.mjs, documented there.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("lazy-command-loading");

// Section 1: every lazy ACTION loads.
{
  const vmw = createAppBootVm();
  const ctx = vmw.context;
  const lazyCommands = ctx.window.AISystem6Runtime.lazyCommands;
  const initialIds = [...lazyCommands.keys()];

  test.assert(initialIds.length > 20, `the lazy command registry looks too small to be real (${initialIds.length} entries)`);

  // Loading one lazy command can itself register another (a module that owns
  // a nested feature adds its own lazyCommand entries once it runs), so the
  // map can grow while this loop iterates — iterate the id snapshot taken
  // above, not the live map, and report against that same fixed count.
  // The commands whose module paints on a real canvas cannot finish loading
  // in a DOM shim; they are named here for the same reason the window list
  // names them, and the browser walk covers them where the canvas is real.
  const canvasBackedCommands = new Set(["open-clio-paint"]);
  const failures = [];
  for (const id of initialIds) {
    if (canvasBackedCommands.has(id)) continue;
    try {
      await lazyCommands.get(id).ensure();
    } catch (error) {
      failures.push(`${id}: ${error?.message || error}`);
    }
  }

  test.assert(
    failures.length === 0,
    failures.length
      ? `${failures.length} of ${initialIds.length} lazy command(s) failed to load for real: ${failures.join("; ")}`
      : `all ${initialIds.length} lazy commands present at boot load through their real ensure() without throwing`
  );
}

// Section 2: every builtByModule window's real createWindow() call runs and
// produces a real, queryable window — not just "its loader resolved".
{
  const vmw = createAppBootVm();
  const ctx = vmw.context;
  const records = windowRegistryRecords();
  const builtByModuleNames = Object.entries(records)
    .filter(([, record]) => record.builtByModule)
    .map(([name]) => name);

  test.assert(builtByModuleNames.length > 10, `expected well over 10 builtByModule windows in the registry, found ${builtByModuleNames.length}`);

  // bonsaiCity's window is not built by ApplicationShell at module load —
  // AISystem6BonsaiCity.attach() owns its construction, and that path leans
  // on a real WebGL/canvas context this harness does not provide. That is a
  // headless-testability gap in a feature owned by its own lane (Bonsai
  // City), not a defect this contract can responsibly assert on; excluded
  // here and named explicitly rather than silently skipped.
  // clioPaint paints on a real 2D context: its window build calls
  // canvas.getContext, which this harness's element shim cannot answer. The
  // same kind of gap, named the same way rather than passed off as green.
  // Both remain covered by the browser walk, where the canvas is real.
  const untestableHeadless = new Set(["bonsaiCity", "clioPaint"]);

  const windowFailures = [];
  for (const name of builtByModuleNames) {
    if (untestableHeadless.has(name)) continue;
    try {
      await ctx.loadLazyWindowModule(name);
      const win = ctx.getWindow(name);
      if (!win) {
        windowFailures.push(`${name}: loadLazyWindowModule() resolved but getWindow("${name}") found nothing`);
      } else if (win.dataset.window !== name) {
        windowFailures.push(`${name}: the real window's dataset.window is "${win.dataset.window}", not "${name}"`);
      } else if (!win.classList.contains("window")) {
        windowFailures.push(`${name}: the real element createWindow() built does not carry the "window" class`);
      }
    } catch (error) {
      windowFailures.push(`${name}: ${error?.message || error}`);
    }
  }

  test.assert(
    windowFailures.length === 0,
    windowFailures.length
      ? `${windowFailures.length} builtByModule window(s) failed to actually build a real, queryable window: ${windowFailures.join("; ")}`
      : `all ${builtByModuleNames.length - untestableHeadless.size} testable builtByModule windows build a real, queryable window through their own createWindow() call`
  );
}

test.finish();
// See control-panel-input-wiring.test.mjs's comment on this same line.
process.exit(0);
