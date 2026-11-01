// WM2 + WM3 · The conditional Window menu.
//
// The Window menu is a Mac OS X-and-later convention, so it is not a fifth
// stable top-level menu: it is declared with menuCondition "window-menu", and
// the appearance registry decides which eras have it. Every row dispatches one
// of windowshade-entry.js's runtime commands, the single registry the menu, the
// keyboard and the title-bar gestures already share. This contract proves the
// declaration, the era gate, and the command ids all exist and agree.

import vm from "node:vm";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
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
// The darkroom carried no Window menu while its conditional budget was two;
// every other Mac OS X-era application has one, and a darkroom window can be
// shaded, split, tiled and put full screen, so the budget is three (owner,
// 2026-10-13).
test.assert(
  windowDefinition(menuSets.lightroom)?.labelKey === "menu_window",
  "the darkroom carries the Window menu too, so its window verbs have a home",
);

// The modern macOS order: Minimize, Zoom, Fill, Center, Move & Resize, Enter
// Full Screen, Pin, the Dock switch, Bring All to Front, this application's
// windows. The desk-only verbs live inside Move & Resize and Pinned, so the
// template shape is matched without dropping a single one.
const expectedItems = [
  ["minimize-window", "window_minimize"],
  ["zoom-window", "window_zoom"],
  ["window-layout-fill", "window_arrange_fill"],
  ["window-layout-center", "window_center"],
  ["submenu:move_and_resize", "move_and_resize"],
  ["window-layout-left", "window_arrange_left"],
  ["window-layout-right", "window_arrange_right"],
  ["window-layout-top", "window_arrange_top"],
  ["window-layout-bottom", "window_arrange_bottom"],
  ["window-layout-top-left", "window_arrange_top_left"],
  ["window-layout-top-right", "window_arrange_top_right"],
  ["window-layout-bottom-left", "window_arrange_bottom_left"],
  ["window-layout-bottom-right", "window_arrange_bottom_right"],
  ["window-layout-left-two-thirds", "window_arrange_left_two_thirds"],
  ["window-layout-right-two-thirds", "window_arrange_right_two_thirds"],
  ["window-layout-left-third", "window_arrange_left_third"],
  ["window-layout-right-third", "window_arrange_right_third"],
  // The desk's own window verbs, one submenu down rather than gone.
  ["window-shade", "window_shade"],
  ["window-expand", "window_expand"],
  ["window-peek", "window_peek"],
  // Slide Over's rows are inline: the desk's grammar stops after one submenu
  // layer, so Move & Resize is the only layer here.
  ["window-slide-left", "window_slide_left"],
  ["window-slide-right", "window_slide_right"],
  ["window-slide-hide", "window_slide_hide"],
  ["window-slide-show", "window_slide_show"],
  ["window-slide-exit", "window_slide_exit"],
  ["window-split-choose", "window_split_choose"],
  ["window-layout-undo", "window_arrange_undo"],
  ["window-layout-recover", "window_arrange_recover"],
  ["toggle-full-screen-window", "window_full_screen"],
  // Sierra's window-tab verbs (WINDOW-TABS-SPEC §5): between Enter Full Screen
  // and Pinned, where Part 2 left room for them. Gated by the `window-tabs`
  // capability, so they appear only in the post-Sierra eras.
  ["show-previous-tab", "tabs_previous"],
  ["show-next-tab", "tabs_next"],
  ["toggle-tab-bar", "tabs_show_bar"],
  // The two verbs a second window makes expressible (§4.2 of the multi-instance
  // work order), in the same gated block as the three above.
  ["merge-all-windows", "tabs_merge_all_windows"],
  ["move-tab-to-new-window", "tabs_move_to_new_window"],
  ["submenu:pinned", "pinned"],
  ["window-pin", "window_pin"],
  ["window-unpin", "window_unpin"],
  ["window-pinned-list", "window_pinned_list"],
  ["window-pin-suspend", "window_pin_suspend"],
  ["window-pin-restore", "window_pin_restore"],
  ["window-pin-clear", "window_pin_clear"],
  // The Dock switch (owner, 2026-10-08): the row reads Show or Hide to match.
  ["window-toggle-dock", "show_dock"],
  ["bring-app-front", "bring_all_to_front"],
  // The list macOS ends its Window menu with, drawn from the same projection
  // the NeXTSTEP Windows submenu reads.
  ["window-list", "window-list"],
];
const windowItems = menuDefinitionItems(windowDefinition(menuSets.finder).items);
function menuDefinitionItems(definitions) {
  const rows = [];
  (definitions || []).forEach((item) => {
    if (item.type === "separator") return;
    if (item.type === "window-list") { rows.push(["window-list", "window-list"]); return; }
    if (item.type === "submenu") {
      rows.push([`submenu:${item.labelKey}`, item.labelKey]);
      rows.push(...menuDefinitionItems(item.items));
      return;
    }
    rows.push([item.action, item.labelKey]);
  });
  return rows;
}
test.assert(
  JSON.stringify(windowItems) === JSON.stringify(expectedItems),
  `the Window menu carries the authorized overview, arrangement and pin commands in order (got ${JSON.stringify(windowItems)})`,
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
// Drive the real availability table and menu updater. Appearance is changed
// through the real registry; only the viewport predicate is controlled.
const h = createAppBootVm();
await h.settleBoot();
h.document.querySelectorAll(".window[data-window]").forEach((win) => { win.classList.add("is-hidden"); win.classList.remove("is-active"); });
const front = h.document.querySelector('[data-window="notepad"]') || h.document.querySelector(".window[data-window]");
front.classList.remove("is-hidden");
front.classList.add("is-active");
h.context.isCenteredSystemWindow = () => false;
h.context.canPinWindow = () => true;
let narrow = false;
h.context.isNarrowViewport = () => narrow;
h.context.queueMicrotask = (fn) => Promise.resolve().then(fn);
for (const era of ["classic", "system-7", "platinum", "drawing-board", "aqua", "tiger", "snow-leopard", "lion", "yosemite", "big-sur", "liquid-glass"]) {
  await h.context.AISystem6Theme.applyTheme(era, { persist: false, announce: false });
  for (const phone of [false, true]) {
    narrow = phone;
    const state = h.context.getActionAvailability();
    test.assert(state["window-browse"] === true, `${era} ${phone ? "narrow" : "wide"} keeps All Windows usable`);
    test.assert(state["window-browse-special"], `${era} ${phone ? "narrow" : "wide"} keeps a menu path to All Windows, which now lives on Special`);
  }
}
// --- (b2) an empty desk in a Dock era ----------------------------------------
// Show Dock / Hide Dock is the Window menu's last row (owner decision F11). The
// menu used to leave the bar with the last window, so a hidden Dock on an empty
// desk had no way back. A Dock era keeps the menu; System 6 still has none.
{
  const open = [...h.document.querySelectorAll(".window[data-window]:not(.is-hidden)")];
  open.forEach((win) => win.classList.add("is-hidden"));
  narrow = false;
  await h.context.AISystem6Theme.applyTheme("snow-leopard", { persist: false, announce: false });
  const empty = h.context.getActionAvailability();
  test.assert(empty["window-menu"] && empty["window-toggle-dock"], "a Dock era keeps the Window menu and its Dock row on an empty desk");
  test.assert(!empty["window-browse"], "with nothing open, All Windows greys rather than the whole menu leaving");
  await h.context.AISystem6Theme.applyTheme("classic", { persist: false, announce: false });
  test.assert(!h.context.getActionAvailability()["window-menu"], "System 6 still has no Window menu");
  open.forEach((win) => win.classList.remove("is-hidden"));
  // Leave a Window-menu era in place: the next case switches to System 6 and
  // needs that to be a real change of era.
  await h.context.AISystem6Theme.applyTheme("liquid-glass", { persist: false, announce: false });
}
// --- (c) the era change is itself a trigger ---------------------------------
// The conditions were right whenever updateMenuState happened to run, but
// nothing ran it on a change of era: the Window menu stayed on System 6's bar
// after switching from Aqua, and was missing from Aqua's after switching from
// System 6 until something else updated the menus (seen 2026-10-08). Rendered
// menus carry data-menu-condition; the themechange event must re-evaluate them.
const eraGate = h.document.createElement("div");
eraGate.dataset.menuCondition = "window-menu";
h.document.body.append(eraGate);
narrow = false;
await h.context.AISystem6Theme.applyTheme("classic", { persist: false });
test.assert(eraGate.classList.contains("is-hidden"), "switching to System 6 hides a rendered Window menu without another trigger");
await h.context.AISystem6Theme.applyTheme("liquid-glass", { persist: false });
test.assert(!eraGate.classList.contains("is-hidden"), "switching to a Window-menu era shows it again the same way");
eraGate.remove();

await h.context.AISystem6Theme.applyTheme("nextstep", { persist: false, announce: false });
narrow = false;
if (!h.context.AISystem6NextstepMenus) h.run(read("app/core/nextstep-menus.js"));
h.context.AISystem6NextstepMenus.sync();
await Promise.resolve();
const nextstepWindows = [...h.document.querySelectorAll(".nextstep-menu-palette button")].find((button) => button.getAttribute("aria-label") === h.context.t("nextstep_windows"));
test.assert(Boolean(nextstepWindows), "NeXTSTEP wide view renders its own Windows submenu");
nextstepWindows?.dispatchEvent({ type: "click", stopPropagation() {} });
const nextstepBrowse = h.document.querySelector('[data-nextstep-action="window-browse"]');
test.assert(Boolean(nextstepBrowse) && !nextstepBrowse.disabled, "NeXTSTEP Windows submenu offers an enabled All Windows row");
narrow = true;
const nextstepPhoneState = h.context.getActionAvailability();
test.assert(nextstepPhoneState["window-browse"] && (nextstepPhoneState["window-menu"] || nextstepPhoneState["window-browse-special"]), "NeXTSTEP narrow view exposes All Windows through the shared phone menu bar");
await h.context.AISystem6Theme.applyTheme("liquid-glass", { persist: false, announce: false });
narrow = false;
// The unloaded engine has no undo ledger. Opposite verbs must not both claim
// to be available, including before the lazy module is fetched.
front.classList.remove("is-collapsed");
delete front.dataset.windowPinned;
let state = h.context.getActionAvailability();
test.assert(state["window-shade"] && !state["window-expand"], "an open window offers shade only");
test.assert(state["window-pin"] && !state["window-unpin"], "an unpinned window offers pin only");
test.assert(!state["window-layout-undo"], "empty arrangement history disables undo");
test.assert(!state["window-peek"], "an expanded window does not offer Peek");
test.assert(["window-slide-hide", "window-slide-show", "window-slide-exit", "window-pin-restore"].every((action) => !state[action]), "without a side slot or suspended pins, their state-dependent actions stay unavailable");
front.classList.add("is-collapsed");
front.dataset.windowPinned = "true";
state = h.context.getActionAvailability();
test.assert(!state["window-shade"] && state["window-expand"], "a collapsed window offers expand only");
test.assert(!state["window-pin"] && state["window-unpin"], "a pinned window offers unpin only");
test.assert(state["window-peek"], "a manually rolled-up window exposes Peek without expanding it");
const commandMenu = h.document.createElement("div");
commandMenu.className = "menu-popover";
h.document.body.append(commandMenu);
const commandRows = Object.fromEntries(["window-shade", "window-expand", "window-pin", "window-unpin", "window-layout-undo"].map((action) => {
  const row = h.document.createElement("button");
  row.dataset.action = action;
  commandMenu.append(row);
  return [action, row];
}));
h.context.invalidateMenuActionCache();
h.context.updateMenuState();
test.assert(commandRows["window-shade"].classList.contains("is-hidden") && !commandRows["window-expand"].classList.contains("is-hidden"), "rendered menu hides shade while expand is the relevant verb");
test.assert(commandRows["window-pin"].classList.contains("is-hidden") && !commandRows["window-unpin"].classList.contains("is-hidden"), "rendered menu hides pin while unpin is the relevant verb");
test.assert(commandRows["window-layout-undo"].disabled, "rendered undo row is disabled without history");
front.classList.remove("is-collapsed");
delete front.dataset.windowPinned;
h.context.updateMenuState();
test.assert(!commandRows["window-shade"].classList.contains("is-hidden") && commandRows["window-expand"].classList.contains("is-hidden"), "expanding switches the visible verb back to shade");
test.assert(!commandRows["window-pin"].classList.contains("is-hidden") && commandRows["window-unpin"].classList.contains("is-hidden"), "unpinning switches the visible verb back to pin");

front.classList.remove("is-collapsed");
// Slot placement needs a growable window; recovery and shade do not.
h.context.isResizableWindow = () => false;
state = h.context.getActionAvailability();
test.assert(["left", "right", "fill"].every((verb) => !state[`window-layout-${verb}`]), "fixed windows disable every resizing slot");
test.assert(state["window-shade"] && state["window-layout-recover"], "fixed windows retain shade and recovery");
front.classList.add("is-minimized");
front.classList.remove("is-active");
state = h.context.getActionAvailability();
test.assert(state["window-browse"] && state["window-menu"], "when every window is minimized the desk still exposes a window path");
test.assert(!state["window-shade"] && !state["window-layout-fill"], "an all-minimized desk offers no front-window arrangement");

test.assertIncludes(
  read("app/core/nextstep-menus.js"),
  '.filter((definition) => definition.menuCondition !== "window-menu")',
  "the NeXTSTEP palette drops the era-gated Window menu instead of showing it unconditionally",
);

// --- (c) every row resolves somewhere ---------------------------------------
// Window verbs answer through the one runtime registry. Minimize and Bring All
// to Front are application commands (actions.js's handler map) whose
// availability window-manager already answers for, so they are checked there.
// A submenu trigger and the window list are not commands at all: the trigger
// opens rows, and the list's rows carry their own window-list-row action.
const applicationHandlers = typeof h.context.getApplicationActionHandlers === "function"
  ? h.context.getApplicationActionHandlers()
  : {};
for (const [action] of expectedItems) {
  if (action.startsWith("submenu:") || action === "window-list") continue;
  const command = h.context.AISystem6Runtime.getCommand(action);
  const resolves = typeof command?.handler === "function"
    || typeof applicationHandlers[action] === "function";
  test.assert(resolves, `${action} resolves to a callable command`);
}
test.assertIncludes(entry, "window-pin", "the pin command is registered beside the arrangement commands");
test.assertIncludes(
  entry,
  "window.AISystem6Runtime?.registerCommand?.(commandId,",
  "every Window menu row routes through the one runtime command registry",
);
// The list's rows are the window projection, not a second copy of window state.
// Rows name the identity: kind:instance in the action string, with the main
// instance keeping the bare-kind form the list always carried (multi-instance
// spec §4 — the second-instance machinery ships empty at P0).
test.assertIncludes(menus, 'button.dataset.action = `window-list-row:${name}${inst ? ":" + inst : ""}`', "the window list asks the projection for its rows");
test.assertIncludes(menus, "typeof applicationWindowOrder === \"function\"", "and draws them in the one order multi-finder already owns");

// --- both languages carry the copy ------------------------------------------
// "window-list" is the pseudo-row's marker, not a label key: its rows are
// window titles, so there is no copy to translate.
const labelKeys = expectedItems.map(([, labelKey]) => labelKey).filter((key) => key !== "window-list");
for (const key of ["menu_window", ...labelKeys]) {
  test.assert(
    enText.includes(`${key}:`) && zhText.includes(`${key}:`),
    `${key} exists in both languages`,
  );
}

test.finish();
