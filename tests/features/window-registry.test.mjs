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
// loaded function resolves at boot and throws. Every loader and hook is an
// arrow, so the reference is deferred to the moment it is called.
Object.entries(records).forEach(([name, record]) => {
  ["lazy", "onOpen", "onReveal"].forEach((field) => {
    const source = record[field];
    if (typeof source !== "string" || field === "lazy") return;
    test.assert(source.startsWith("("), `${name}.${field} is an arrow, so a lazy identifier is not resolved at boot`);
  });
});

test.assertIncludes(read("tooling/runtime-manifest.mjs"), '"app/core/window-registry.js"', "the registry boots with the system");

test.finish();
