import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";
import { windowInterfaceRegistry } from "../../tooling/interface-guidelines-contract.mjs";

const test = createFeatureTest("window-registry");
const registry = read("app/core/window-registry.js");
const windowManager = read("app/core/window-manager.js");
const multiFinder = read("app/core/multi-finder.js");
const html = read("index.html");
const records = windowRegistryRecords();

// A window used to be declared in eight places, four of which only announced a
// missing entry as a test failure. That is a gate compensating for the absence
// of a declaration. This is the declaration, and these are the six sites that
// no longer hold a second copy of it.
[
  ["const deskAccessoryDefaultWidths", "the width table"],
  ["const mobileWorkAreaExcludedWindowNames", "the narrow-screen exclusion set"],
  ["const lazyWindowModules", "the lazy-module map"],
  ['if (name === "notePad")', "the open-time render chain"],
].forEach(([needle, what]) => {
  test.assertNotIncludes(windowManager, needle, `window-manager no longer keeps ${what}`);
});
test.assertNotIncludes(multiFinder, "const windowAppMap", "multi-finder no longer keeps its own app-id map");
test.assertIncludes(windowManager, "sidebarWindowNames().forEach", "hideSidebars reads the registry instead of repeating it");

// The seam the old chain hid. Hooks before the reveal run on a window nobody
// can measure; hooks after it run on one that is on screen. A hook on the wrong
// side of that line fails in a way that reads as a layout bug.
test.assertMatches(
  windowManager,
  /runWindowHook\(name, "onOpen"[\s\S]{0,400}?win\.classList\.remove\("is-hidden", "is-collapsed"\)[\s\S]{0,900}?runWindowHook\(name, "onReveal"/,
  "onOpen runs while the window is hidden and onReveal after it is shown",
);

// Every window belongs to an application, and the fallback is not a declaration.
Object.entries(records).forEach(([name, record]) => {
  test.assert(typeof record.app === "string" && record.app.length > 0, `${name} declares an owning application`);
});

// A registry entry is one of three things, and it has to say which. The app-id
// map it replaced had no way to express "this is not a window", which is how a
// dead entry (`guide`) survived in it unnoticed.
const staticWindows = new Set([...html.matchAll(/\bdata-window="([^"]+)"/g)].map((match) => match[1]));
Object.entries(records).forEach(([name, record]) => {
  const kind = staticWindows.has(name) ? "static"
    : record.opensAs ? "alias"
      : record.builtByModule ? "module-built" : "";
  test.assert(!!kind, `${name} is a window in index.html, a window a module builds, or an alias for another window`);
});

// The other direction: markup without a record would get the "finder" fallback,
// which is a plausible wrong answer — the worst kind.
[...staticWindows].forEach((name) => {
  test.assert(!!records[name], `${name} has markup, so it has a record`);
});

// Aliases route somewhere real.
Object.entries(records).forEach(([name, record]) => {
  if (!record.opensAs) return;
  test.assert(!!records[record.opensAs], `${name} is an alias for a window that exists`);
});

// Tooling reads the product, not the other way round. The design facets
// (interface role, status layout, document model) stay in the tooling contract
// because the browser never reads them and they would only cost boot bytes —
// but neither file may grow a window the other has never heard of.
const toolingNames = new Set(Object.keys(windowInterfaceRegistry));
const runtimeNames = Object.keys(records).filter((name) => !records[name].opensAs);
runtimeNames.forEach((name) => {
  test.assert(toolingNames.has(name), `${name} has an interface contract as well as a runtime record`);
});
[...toolingNames].forEach((name) => {
  test.assert(!!records[name], `${name} has a runtime record as well as an interface contract`);
});

// Values, not behaviour, wherever it is possible. A width is a token name and a
// fallback so it is read after the stylesheet exists rather than at boot.
Object.entries(records).forEach(([name, record]) => {
  if (record.width === undefined) return;
  const width = String(record.width);
  test.assert(
    /^\d+$/.test(width) || /^\["--[a-z-]+", \d+\]$/.test(width),
    `${name} declares a width as a number or a [token, fallback] pair (got ${width})`,
  );
});

// The lazy trap this file has to keep avoiding: a bare reference to a lazily
// loaded function resolves at boot and throws. Converted from a heuristic —
// "the hook's source text starts with '(', so it must be an arrow, so the
// identifier is probably deferred" — into the real proof: boot the actual
// eager module set, load EVERY lazy window's module through its real
// ensure() (the same loader a real click uses), then actually CALL every
// onOpen / onReveal / lazy.* hook for every one of the registry's ~70
// windows and watch what the real engine does with the identifiers inside.
// A bare reference to a not-yet-declared name throws a ReferenceError — the
// one error type this loop watches for. Everything else (a TypeError from a
// DOM shim that has no real geometry or CSSOM, for instance) is expected
// harness noise unrelated to the trap this test exists to catch, so it is
// deliberately not flagged: the hooks are real render/attach code written
// for a real browser, and this harness's DOM shim (see app-boot-vm.mjs) does
// not attempt to be one.
const vmw = createAppBootVm();
const lazyWindowNames = vmw.run(`
  Object.entries(windowRegistry).filter(([, r]) => r.lazy && typeof r.lazy.ensure === "function").map(([n]) => n)
`);
test.assert(lazyWindowNames.length > 20, `the real registry has lazy windows to load (got ${lazyWindowNames.length}, expected well over 20)`);
// A module that paints on a real 2D context cannot finish loading against a
// DOM shim: the canvas answers no getContext. Named here the way
// lazy-command-loading names it, and covered for real by the browser walk.
const canvasBackedWindows = new Set(["clioPaint"]);
for (const name of lazyWindowNames) {
  if (canvasBackedWindows.has(name)) continue;
  // eslint-disable-next-line no-await-in-loop -- each ensure() is the real
  // sequential loader a real window open goes through; running them
  // concurrently would not match how any single window actually opens.
  await vmw.run(`windowRegistry[${JSON.stringify(name)}].lazy.ensure()`);
}
test.assert(true, `every one of ${lazyWindowNames.length - canvasBackedWindows.size} headless-testable lazy windows' real module loads through its real ensure() without throwing`);

const hookReferenceErrors = JSON.parse(vmw.run(`
  JSON.stringify((() => {
    const out = [];
    for (const [name, record] of Object.entries(windowRegistry)) {
      for (const field of ["onOpen", "onReveal"]) {
        const fn = record[field];
        if (typeof fn !== "function") continue;
        try { fn(); } catch (error) {
          if (error instanceof ReferenceError) out.push({ name, field, message: String(error.message) });
        }
      }
      const lazy = record.lazy;
      if (lazy && typeof lazy === "object") {
        for (const field of Object.keys(lazy)) {
          if (field === "ensure") continue;
          const fn = lazy[field];
          if (typeof fn !== "function") continue;
          try { fn(); } catch (error) {
            if (error instanceof ReferenceError) out.push({ name, field: "lazy." + field, message: String(error.message) });
          }
        }
      }
    }
    return out;
  })())
`));
test.assert(
  hookReferenceErrors.length === 0,
  hookReferenceErrors.length
    ? `no window hook throws a ReferenceError once every lazy module is loaded — offenders: ${hookReferenceErrors.map((e) => `${e.name}.${e.field} (${e.message})`).join("; ")}`
    : `every onOpen / onReveal / lazy hook across the whole registry resolves its identifiers for real (0 ReferenceErrors after loading ${lazyWindowNames.length} lazy modules)`
);

test.assertIncludes(read("tooling/runtime-manifest.mjs"), '"app/core/window-registry.js"', "the registry boots with the system");

test.finish();
// See action-registry-dispatch.test.mjs's comment on this same line: a real
// boot can leave unrelated background async work in flight, and
// test.finish() does not exit on success.
process.exit(0);
