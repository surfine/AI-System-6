// WM2 + WM3 · The conditional Window menu.
//
// The Window menu is a Mac OS X-and-later convention, so it is not a fifth
// stable top-level menu: it is declared with menuCondition "window-menu", and
// the appearance registry decides which eras have it. Every row dispatches one
// of windowshade-entry.js's runtime commands, the single registry the menu, the
// keyboard and the title-bar gestures already share. This contract proves the
// declaration, the era gate, and the command ids all exist and agree.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("window-menu");
const menus = read("app/data/menus.js");
const entry = read("app/core/windowshade-entry.js");
const windows = read("app/core/window-manager.js");
const enText = read("app/data/translations-en.js");
const zhText = read("app/data/translations-zh.js");

// Build the real application menu sets exactly as the browser does: the menu
// data reads the live appearance registry for the Appearance submenu.
const registryWindow = {};
vm.runInNewContext(read("app/core/theme-registry.js"), { window: registryWindow });
const menuContext = { document: {}, activeAppId: "finder", window: registryWindow };
vm.runInNewContext(
  `${menus}\nglobalThis.__menuSets = applicationMenuSets; globalThis.__menuSetForApp = menuSetForApp;`,
  menuContext,
);
const menuSets = menuContext.__menuSets;
const menuSetForApp = menuContext.__menuSetForApp;
const themeApi = registryWindow.AISystem6Theme;

// --- (a) a conditional top-level Window menu --------------------------------
const windowDefinition = (definitions) => (definitions || []).find(
  (definition) => definition.id === "window" && definition.menuCondition === "window-menu",
);

test.assertIncludes(menus, "const windowMenu = () =>", "menus.js declares one Window menu builder");
test.assert(
  windowDefinition(menuSets.finder)?.labelKey === "menu_window",
  "Finder carries a conditional top-level Window menu",
);
test.assert(
  windowDefinition(menuSets.teachText)?.labelKey === "menu_window",
  "Writing Studio carries a conditional top-level Window menu",
);
test.assert(
  windowDefinition(menuSetForApp("finder")) && windowDefinition(menuSetForApp("teachText")),
  "menuSetForApp() surfaces the Window menu for the shaped applications",
);
test.assert(
  Object.values(menuSets).filter((definitions) => windowDefinition(definitions)).length >= 10,
  "the Window menu is offered by the desk's real applications, not only two",
);
// The darkroom already spends both conditional slots on its mutually exclusive
// stack/listen menus; a third would put six menus on the bar, so it is exempt.
test.assert(
  !windowDefinition(menuSets.lightroom),
  "the darkroom keeps its two-slot conditional budget and does not gain a third",
);

// WM5's All Windows row leads, then exactly the nine arrangement/pin commands,
// in the order Windows users expect.
const expectedItems = [
  ["window-browse", "window_browse"],
  ["window-shade", "window_shade"],
  ["window-expand", "window_expand"],
  ["window-layout-left", "window_arrange_left"],
  ["window-layout-right", "window_arrange_right"],
  ["window-layout-fill", "window_arrange_fill"],
  ["window-layout-undo", "window_arrange_undo"],
  ["window-layout-recover", "window_arrange_recover"],
  ["window-pin", "window_pin"],
  ["window-unpin", "window_unpin"],
];
const windowItems = menuDefinitionItems(windowDefinition(menuSets.finder).items);
function menuDefinitionItems(definitions) {
  return (definitions || [])
    .filter((definition) => definition.type !== "separator")
    .map((item) => [item.action, item.labelKey]);
}
test.assert(
  JSON.stringify(windowItems) === JSON.stringify(expectedItems),
  `the Window menu carries the ten commands in order (got ${JSON.stringify(windowItems)})`,
);

// --- (b) the era gate -------------------------------------------------------
for (const era of ["classic", "system-7", "platinum", "drawing-board", "nextstep"]) {
  test.assert(
    themeApi.hasCapability("window-menu", era) === false,
    `${era} has no Window menu (pre-Mac OS X convention)`,
  );
}
for (const era of ["aqua", "tiger", "snow-leopard", "lion", "yosemite", "big-sur", "liquid-glass"]) {
  test.assert(
    themeApi.hasCapability("window-menu", era) === true,
    `${era} grants the Window menu capability`,
  );
}
test.assertIncludes(
  windows,
  'window.AISystem6Theme?.hasCapability?.("window-menu")',
  "the menu condition is the theme capability, not a hard-coded era list",
);
test.assertIncludes(windows, '"window-menu": windowMenuAvailable,', "the condition answers getActionAvailability()");
for (const [action] of expectedItems) {
  test.assertIncludes(windows, `"${action}": windowMenu`, `${action} reports its own availability`);
}
// A slot arrangement needs a window the grow box can own. The engine's own
// target() returns null for a window isResizableWindow() rejects, and
// dispatch() then reports noRoom silently — so left/right/fill used to stay
// black on a fixed-size Desk Accessory (Note Pad) and do nothing when chosen.
// Pin already greyed with canPinWindow; the slots had no counterpart.
test.assertMatches(
  windows,
  /const windowMenuArrangeAvailable = windowMenuAvailable\s*\n\s*&& typeof isResizableWindow === "function" && isResizableWindow\(windowMenuFrontWindow\);/,
  "the slot rows require a front window the grow box can own",
);
for (const [action] of expectedItems.filter(([id]) => /^window-layout-(left|right|fill)$/.test(id))) {
  test.assertIncludes(windows, `"${action}": windowMenuArrangeAvailable,`, `${action} greys when the front window is not resizable`);
}
// The rest of the family is not a slot: roll-up, unroll and bring-back work on
// any eligible window, and undo can have history from those as well.
for (const [action] of expectedItems.filter(([id]) => /^window-(expand|shade|layout-undo|layout-recover)$/.test(id))) {
  test.assertIncludes(windows, `"${action}": windowMenuAvailable,`, `${action} stays available on any eligible front window`);
}
test.assertIncludes(
  read("app/core/nextstep-menus.js"),
  '.filter((definition) => definition.menuCondition !== "window-menu")',
  "the NeXTSTEP palette drops the era-gated Window menu instead of showing it unconditionally",
);

// --- (c) the commands live in the one shared registry -----------------------
const registeredIds = new Set([
  // The arrangement map is an object literal keyed by command id.
  ...[...entry.matchAll(/"(window-[a-z0-9-]+)"\s*:\s*"/g)].map((match) => match[1]),
  ...[...entry.matchAll(/\[\s*"(window-[a-z0-9-]+)",\s*"/g)].map((match) => match[1]),
  // The browse row registers its own command in the same registry.
  ...[...entry.matchAll(/registerCommand\?\.\("(window-[a-z0-9-]+)"/g)].map((match) => match[1]),
]);
for (const [action] of expectedItems) {
  test.assert(registeredIds.has(action), `${action} is registered by windowshade-entry.js`);
}
test.assertIncludes(entry, "window-pin", "the pin command is registered beside the arrangement commands");
test.assertIncludes(
  entry,
  "window.AISystem6Runtime?.registerCommand?.(commandId,",
  "every Window menu row routes through the one runtime command registry",
);

// --- both languages carry the copy ------------------------------------------
for (const key of ["menu_window", ...expectedItems.map(([, labelKey]) => labelKey)]) {
  test.assert(
    enText.includes(`${key}:`) && zhText.includes(`${key}:`),
    `${key} exists in both languages`,
  );
}

test.finish();
