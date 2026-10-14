// NW0-NW2 · NeXTSTEP's own Windows menu, and the window verbs of that era.
//
// The NeXTSTEP appearance is not a Mac OS X era: it has no `window-menu`
// capability, and its own Windows submenu is 3.3's, not the modern one. 3.3's
// Menus chapter gives the submenu exactly three commands in a fixed order --
// Arrange in Front, Miniaturize Window, Close Window -- followed by the
// document-window list the Application Kit generates. The Window chapter names
// a miniaturize button on the left and a close button on the right and no
// third button, and gives Command-up / Command-down as the within-tier reorder.
//
// This contract pins what the era must show and what it must NOT: the order,
// the three rows' command resolution, the two ids the era deliberately does not
// name (Zoom and WindowShade, both of which keep their other homes), the era
// gate on the era's own verbs, and the deliberate deviations that stay put.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("nextstep-menus");
const palettes = read("app/core/nextstep-menus.js");
const sharedMenus = read("app/data/menus.js");
const entry = read("app/core/windowshade-entry.js");
const actions = read("app/core/actions.js");
const windows = read("app/core/window-manager.js");
const dock = read("app/core/nextstep-dock.js");
const shell = read("app/core/nextstep-shell.js");
const enText = read("app/data/translations-en.js");
const zhText = read("app/data/translations-zh.js");

// --- (a) 3.3's order: three commands, the window list, then the desk's rows --
const order = (...needles) => needles.map((needle) => palettes.indexOf(needle));
const [arrangeAt, minimizeAt, closeAt, listAt, browseAt] = order(
  'menuItem("nextstep-arrange-in-front", "nextstep_arrange_in_front")',
  'menuItem("minimize-window", "minimize_window_command")',
  'menuItem("close-active-window", "close_window")',
  "applicationWindowOrder(appId)",
  'menuItem("window-browse", "window_browse")',
);
test.assert(
  arrangeAt !== -1 && minimizeAt > arrangeAt && closeAt > minimizeAt && listAt > closeAt && browseAt > listAt,
  "the Windows submenu is Arrange in Front, Miniaturize Window, Close Window, the document-window list, then the desk's cross-era rows",
);

// --- (b) the two verbs 3.3 does not name, and their orphaned copy -----------
// Zoom and WindowShade are the shared vocabulary's, borrowed by an earlier
// version of this palette. 3.3's menu lists no roll-up and its title bar has no
// zoom button, so neither belongs here (owner ruling, 2026-10-13). The verbs
// themselves are untouched -- both are asserted below to still have a home.
for (const id of ["nextstep-zoom-window", "nextstep-shade-window"]) {
  test.assert(!palettes.includes(id), `${id} is no longer declared by the NeXTSTEP palette`);
}
test.assert(
  !palettes.includes("nextstep_zoom") && !palettes.includes("nextstep_shade"),
  "the two label keys only those rows read are gone from the palette",
);
for (const [language, source] of [["English", enText], ["Chinese", zhText]]) {
  test.assert(
    !source.includes("nextstep_zoom:") && !source.includes("nextstep_shade:"),
    `the ${language} copy carries neither orphaned key`,
  );
}
test.assertIncludes(sharedMenus, 'menuItem("zoom-window", "window_zoom")', "the Mac OS X-era Window menu still names Zoom");
test.assertIncludes(entry, '"window-shade": "shade"', "WindowShade is still an arrangement the shared engine answers");

// --- (c) the commands, and the era gate that belongs to them ----------------
// The three verbs are runtime commands registered in the eager
// windowshade-entry.js (a registry shortcut may not name an action no loaded
// module registers), while their implementations live in the lazy
// nextstep-menus.js -- the floppy budget asks an era-only verb to stay off the
// boot bundle. Their era gate is the appearance, per command.
test.assertIncludes(entry, '"nextstep-arrange-in-front"', "windowshade-entry registers Arrange in Front");
test.assertIncludes(entry, '"nextstep-window-front"', "and the within-tier reorder keys");
for (const id of ["nextstep-arrange-in-front", "nextstep-window-front", "nextstep-window-back"]) {
  test.assertNotIncludes(actions, `"${id}": () =>`, `actions.js's handler map does not duplicate ${id}`);
}
test.assertIncludes(palettes, "function arrangeInFront(", "the cascade's geometry lives in the lazy era module");
test.assertIncludes(palettes, "function windowWithinTier(", "and so does the within-tier reorder");
test.assertIncludes(palettes, "arrangeInFront, windowWithinTier", "both dispatch through the frozen NextstepMenus API");
test.assertIncludes(
  windows,
  'window.AISystem6Theme?.getCurrentTheme?.() === "nextstep"',
  "the era is the gate for the era's own window verbs",
);
// The two reorder keys: registry entries, because the Window chapter gives them
// as key equivalents. Scope is global, because runShortcut has no per-era scope
// to name; the command carries the gate itself.
for (const [id, key, display] of [["nextstep-window-front", "arrowup", "⌘↑"], ["nextstep-window-back", "arrowdown", "⌘↓"]]) {
  test.assertIncludes(actions, `id: "${id}", key: "${key}", action: "${id}", display: "${display}"`, `${id} is the ${display} key`);
}
test.assert(
  /id: "nextstep-window-front"[\s\S]*?suppressInEditable: true/.test(actions)
  && /id: "nextstep-window-back"[\s\S]*?suppressInEditable: true/.test(actions),
  "both keys yield to a text field: Command-up/down is macOS's caret-to-start/end there",
);

// --- (d) the palette that really renders ------------------------------------
const h = createAppBootVm();
await h.settleBoot();
h.run(`
  if (typeof document.createComment !== "function") document.createComment = (text) => Object.assign(document.createElement("#comment"), { textContent: text });
  if (typeof queueMicrotask !== "function") queueMicrotask = (fn) => Promise.resolve().then(fn);
`);
await h.context.whenLanguageReady?.();
await h.context.AISystem6Theme.applyTheme("nextstep", { persist: false, announce: false });
if (!h.context.AISystem6NextstepMenus) h.run(palettes);
h.context.AISystem6NextstepMenus.sync();
await Promise.resolve();

const label = (key) => h.context.t(key);
const trigger = [...h.document.querySelectorAll(".nextstep-menu-palette button")]
  .find((button) => button.getAttribute("aria-label") === label("nextstep_windows"));
test.assert(Boolean(trigger), "NeXTSTEP renders its own Windows submenu");
trigger?.dispatchEvent({ type: "click", stopPropagation() {} });
const palette = [...h.document.querySelectorAll(".nextstep-menu-palette")]
  .find((node) => node.getAttribute("aria-label") === label("nextstep_windows"));
test.assert(Boolean(palette), "the Windows row opens a submenu palette");
const body = palette?.querySelector('[role="menu"]');
const rows = body ? [...body.querySelectorAll("button")] : [];
const rowActions = rows.map((button) => button.dataset.nextstepAction || "").filter(Boolean);
test.assert(
  JSON.stringify(rowActions) === JSON.stringify([
    "nextstep-arrange-in-front", "minimize-window", "close-active-window",
    "window-browse", "windowshade-arrange-menu", "window-peek",
  ]),
  `the rendered submenu shows the three canonical commands then the desk's conveniences (got ${JSON.stringify(rowActions)})`,
);
test.assert(
  !rowActions.includes("nextstep-zoom-window") && !rowActions.includes("nextstep-shade-window"),
  "and no Zoom or WindowShade row survives in the rendered era menu",
);
const rowLabels = rows.map((button) => button.getAttribute("aria-label"));
test.assert(
  rowLabels[0] === label("nextstep_arrange_in_front")
  && rowLabels[1] === label("minimize_window_command")
  && rowLabels[2] === label("close_window"),
  "the three rows read Arrange in Front, Miniaturize Window, Close Window",
);
// Every row must reach a callable command: a row that resolves nowhere is the
// dead menu row the desk's census records. The three canonical rows answer
// through the application handler map; the desk's own conveniences are runtime
// commands windowshade-entry.js registers, so both registries are asked.
const handlers = h.context.getApplicationActionHandlers();
for (const action of rowActions) {
  const command = h.context.AISystem6Runtime.getCommand(action);
  const resolves = typeof command?.handler === "function" || typeof handlers[action] === "function";
  test.assert(resolves, `${action} resolves to a callable command`);
}

// --- (e) the era gate, driven through the real availability table -----------
h.document.querySelectorAll(".window[data-window]").forEach((win) => {
  win.classList.add("is-hidden");
  win.classList.remove("is-active");
});
const front = h.document.querySelector('[data-window="textDisk"]') || h.document.querySelector(".window[data-window]");
front.classList.remove("is-hidden");
front.classList.add("is-active");
// A real focus also makes the window's application the active one; the
// availability of Minimize reads the front application's open windows, so the
// stand-in focus has to move the same two variables focusWindow moves.
h.run(`activeAppId = ${JSON.stringify(h.context.getWindowAppId(front))}; menuOwnerAppId = activeAppId;`);
const nextstepState = h.context.getActionAvailability();
test.assert(
  nextstepState["nextstep-arrange-in-front"] && nextstepState["nextstep-window-front"] && nextstepState["nextstep-window-back"],
  "NeXTSTEP offers its own three window verbs",
);
test.assert(
  nextstepState["minimize-window"],
  "and its Miniaturize Window row is live, even though the era grants no minimize-lamp and draws no yellow lamp",
);
await h.context.AISystem6Theme.applyTheme("classic", { persist: false, announce: false });
const classicState = h.context.getActionAvailability();
test.assert(
  !classicState["nextstep-arrange-in-front"] && !classicState["nextstep-window-front"] && !classicState["nextstep-window-back"],
  "no other era offers them: System 6 has its own windows and no such menu",
);
await h.context.AISystem6Theme.applyTheme("nextstep", { persist: false, announce: false });

// --- (f) a verb with nothing to do reports, it does not go quiet ------------
// The tier reorder returns false before touching focus when the tier holds fewer
// than two windows, and says so. This is the "did nothing" case that reads as a
// dead row if the command is silent.
h.document.querySelectorAll(".window[data-window]").forEach((win) => win.classList.add("is-hidden"));
const quiet = await h.context.handleAction("nextstep-window-front");
test.assert(quiet === false, "a tier with no windows refuses the reorder instead of silently succeeding");
test.assertIncludes(palettes, 'setStatus(t("nextstep_tier_only_one"))', "and the refusal is a receipt, not silence");
test.assertIncludes(palettes, 'setStatus(moved ? t("nextstep_arrange_done") : t("nextstep_arrange_already"))', "Arrange in Front reports both outcomes the way Bring All to Front does");

// --- (g) the deliberate deviations stay put ---------------------------------
test.assertIncludes(dock, "A miniwindow is one window, never one bucket per application", "the era still keeps one miniwindow per window, its registered deviation");
test.assertIncludes(shell, "bar.prepend(button);", "the era's miniaturize button still sits at the left end of the title bar");
for (const key of ["nextstep_arrange_in_front", "nextstep_window_front", "nextstep_window_back", "nextstep_arrange_done", "nextstep_arrange_already", "nextstep_arrange_none", "nextstep_tier_only_one"]) {
  test.assert(
    enText.includes(`${key}:`) && zhText.includes(`${key}:`),
    `${key} exists in both languages`,
  );
}

test.finish();
