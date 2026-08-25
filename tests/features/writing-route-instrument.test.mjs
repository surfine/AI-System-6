// The writing route as an instrument the writer can read and drive.
//
// Five properties, each one a repair of something the 2026-08-21 field report
// found by driving the running app:
//
//   A  the route has a status surface of its own. #status is ONE element that
//      moves into the active window's host; its home host is ClioTalk's info
//      bar, which is where it used to live permanently - so with ClioTalk
//      closed (the normal writing layout) every message the product sent went
//      into a box with zero size, and a refused Save looked like a dead key.
//   B  Find / Change exists on the writing surfaces at all. ClioTalk had Find
//      in Conversation and the Finder had Find File; the manuscript, where a
//      writer most needs it, had neither.
//   C  the route has Command keys. ClioChart - a side tool - had five; the
//      product's core route had none.
//   D  the Writing Flow palette reports state instead of being five buttons.
//   E  a route phase gets the screen instead of cascading paper-width windows.

import { createFeatureTest, read, windowApp } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-route-instrument");

const html = read("index.html");
const actions = read("app/core/actions.js");
const windowManager = read("app/core/window-manager.js");
const persistenceStatus = read("app/core/persistence-status.js");
const wireup = read("app/core/wireup.js");
const menus = read("app/data/menus.js");
const multiFinder = read("app/core/multi-finder.js");
const findChange = read("app/features/find-change.js");
const config = read("app/core/config.js");
const manifest = read("tooling/runtime-manifest.mjs");
const surfaces = read("styles/30-surfaces.css");
const windowsCss = read("styles/10-windows.css");
const liquidCss = read("styles/70-liquid-glass.css");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// --- A. A status surface the route owns -----------------------------------

test.assertIncludes(persistenceStatus, "function statusHostForActiveWindow", "the status line resolves a host from the active window");
test.assertIncludes(persistenceStatus, "function syncStatusHost", "the status element relocates rather than being duplicated");
test.assertIncludes(persistenceStatus, "host.append(statusEl)", "there is one #status element, moved - two elements would be two truths");
test.assertMatches(
  persistenceStatus,
  /function setStatus\(text, options = \{\}\) \{[\s\S]*?syncStatusHost\(\);/,
  "every message re-homes the status line before writing it",
);
test.assertIncludes(windowManager, 'if (typeof syncStatusHost === "function") syncStatusHost();', "activating a window brings the status line with it");
test.assertIncludes(html, "data-status-home", "ClioTalk keeps the home host so the element is never orphaned");
// A host, not a particular box. TeachText's is a cell of its desk strip; the
// other four carry a strip of their own. What matters is that setStatus()
// always has somewhere in the active window to render, or the product goes
// mute exactly where the writer is standing.
test.assert(
  (html.match(/data-status-host/g) || []).length === 6,
  "every route window has a status host, plus ClioTalk's home",
);
test.assertIncludes(surfaces, ".window-status-strip {", "the strip has its own System 6 info-bar recipe");
test.assertIncludes(surfaces, "min-height: 19px;", "the strip keeps its height with or without a message, so a receipt never shoves the layout");

// --- B. Find / Change ------------------------------------------------------

test.assertIncludes(html, 'data-window="findChange"', "Find/Change is a real window, not a prompt");
test.assertIncludes(html, 'id="find-change-query"', "it has a Find field");
test.assertIncludes(html, 'id="find-change-replacement"', "it has a Change field");
test.assertIncludes(html, 'id="find-change-match-case"', "case sensitivity is a visible option, as in MacWrite");
test.assertIncludes(html, 'id="find-change-target"', "the panel names the surface it will act on");
test.assertNotIncludes(html, 'class="window find-change-window is-hidden" data-window="findChange" aria-labelledby="find-change-title">\n        <div class="title-bar">\n          <button class="close-box" aria-label="Close" data-i18n-aria-label="close"></button>\n          <button class="resize-box"', "a Desk Accessory has no zoom box");
test.assertIncludes(manifest, '"app/features/find-change.js"', "the module is lazy, so the panel costs nothing until it is summoned");
test.assertIncludes(config, 'createLazyModuleLoader("AISystem6FindChangeLoaded"', "the lazy loader is declared");
test.assertIncludes(actions, '"open-find-change": async () => {', "the action loads the module before using it");
test.assertIncludes(actions, "await ensureFindChangeModule();", "one mechanism: the action table owns these, so the handler loads the module");
test.assertIncludes(findChange, "mdeApply(target", "edits go through the house helper, so native undo and the input event survive");
test.assertMatches(
  findChange,
  /async function findChangeAll\(\)[\s\S]*?mdeApply\(target, \{ from: 0, to: text\.length/,
  "Change All is one edit over the whole document: one undo entry, not one per match",
);
test.assertIncludes(findChange, "showSystemModal(t(\"find_change_all_confirm\"", "Change All names the count before it runs");
test.assertIncludes(findChange, "function findChangeCaretSurfaceName", "the panel aims at the caret first");
test.assertIncludes(
  findChange,
  "registerReadOnlyRule?.(findChangeControlIsReadOnly)",
  "Change is greyed through the single owner of the property, never by a second assignment",
);
test.assertNotIncludes(findChange, "button.disabled = !writable", "the panel does not fight the write lease for `disabled`");
test.assert(windowApp("findChange") === "accessories", "Find/Change floats like a Desk Accessory: it must not displace the window it edits");
test.assertIncludes(
  windowManager,
  'if (win.dataset.window === "findChange" && ["teachText", "writingStudio"].includes(appId)) return false;',
  "raising the window being searched does not dismiss the panel",
);
test.assertIncludes(menus, 'menuItem("open-find-change", "find_change_ellipsis", "find-change")', "Find lives in the Edit menu, where a Mac writer looks for it");

// --- C. Command keys for the route ----------------------------------------

const routeKeys = [
  ['id: "route-question-sheet", key: "1"', "open-question-sheet"],
  ['id: "route-outline", key: "2"', "open-outline"],
  ['id: "route-section-drafts", key: "3"', "open-section-drafts"],
  ['id: "route-manuscript", key: "4"', "open-teachtext-manuscript"],
  ['id: "route-review-desk", key: "5"', "open-review-desk"],
];
routeKeys.forEach(([marker, action]) => {
  test.assertIncludes(actions, marker, `the route binds a Command key for ${action}`);
});
test.assertIncludes(actions, 'id: "find-change", key: "f"', "Find is on the key a Mac writer already presses");
test.assertIncludes(actions, 'id: "find-change-next", key: "g"', "Find Again keeps its traditional key");
test.assertIncludes(actions, 'id: "route-advance", key: "arrowright", shift: true', "one chord advances to the next stop");
test.assertIncludes(actions, "function advanceWritingRouteFromCurrentStop", "the advance chord resolves which stop it is on");
test.assertIncludes(actions, "writing_route_last_stop", "the last stop says so instead of doing something adjacent");
test.assertNotMatches(
  actions,
  /id: "route-question-sheet"[^}]*suppressInEditable/,
  "moving between stops works with the caret in the text, which is where a writer always is",
);

// --- D. The palette reports state -----------------------------------------

test.assertIncludes(windowManager, "function renderWritingSpineState", "the palette has a renderer");
test.assertIncludes(windowManager, "function writingSpineStopHoldsPen", "one mark says where the pen is");
test.assertIncludes(windowManager, "function writingSpineStopHasContent", "one mark says which stops hold work");
test.assertIncludes(windowManager, "function writingMarkdownHasWork", "the system's own placeholder does not count as content");
test.assertMatches(
  windowManager,
  /function updateMenuState\(\)[\s\S]{0,200}renderWritingSpineState\(\);/,
  "the palette refreshes with the rest of the menu state",
);
test.assertIncludes(wireup, "renderWritingSpineState();", "and follows typing, so a content mark is never a command behind");
test.assert((html.match(/class="spine-step-mark"/g) || []).length === 5, "each stop carries its content mark");
// Reuses the shared .is-selected state rather than a parallel class: a class of
// our own ties on specificity with every appearance's existing selected twin
// and loses on source order, which is how the current stop rendered as a blank
// white pill under Liquid Glass.
test.assertIncludes(windowsCss, ".spine-actions button.is-selected b {", "the stop the writer is in reverses its label through the shared selected state");
test.assertIncludes(windowManager, 'button.classList.toggle("is-selected", current);', "the palette sets the shared selected state");
test.assertIncludes(liquidCss, "body.use-liquid-glass .spine-actions button.is-selected b", "Liquid Glass reverses the selected label and sets its text fill");
test.assertIncludes(liquidCss, "body.use-liquid-glass .spine-actions button.holds-pen .spine-step-number", "Liquid Glass reverses the pen badge too");
test.assertIncludes(windowsCss, ".spine-actions button.holds-pen .spine-step-number {", "the stop that owns the text fills its step badge");

// --- E. A phase gets the screen -------------------------------------------

test.assertIncludes(windowManager, "function arrangeSoloWritingWindow", "a phase with one surface is arranged too");
test.assertIncludes(
  windowManager,
  '["questionSheet", "outline", "sectionDrafts", "reviewDesk", "teachText"].includes(name)',
  "the Question Sheet is arranged like every other stop",
);
test.assertNotIncludes(windowManager, 'if (!isOpen("teachText")) return;', "arrangement no longer gives up when there is no manuscript yet");
test.assertIncludes(windowManager, 'if (win.dataset.userPositioned === "true") return;', "a window the writer dragged keeps its place");

// --- Copy exists in both languages ----------------------------------------

[
  "advance_writing_route",
  "writing_spine_here",
  "writing_spine_pen",
  "writing_spine_has_content",
  "find_change",
  "find_what",
  "change_to",
  "find_match_case",
  "change_all",
  "change_find",
  "find_no_target",
  "find_change_blocked",
].forEach((key) => {
  test.assertIncludes(en, `    ${key}:`, `English copy defines ${key}`);
  test.assertIncludes(zh, `    ${key}:`, `Chinese copy defines ${key}`);
});

// --- One bar under the paper --------------------------------------------
//
// TeachText used to stack a desk strip and a status strip, pulled together
// with a negative margin so they would read as one bordered instrument. They
// are one now, and the two rules that faked it are gone.

const indexHtml = read("index.html");
const surfacesCss = read("styles/30-surfaces.css");

test.assertMatches(
  indexHtml,
  /<span id="teachtext-export-state"[^>]*>[^<]*<\/span>\s*<span class="window-status-slot" data-status-host aria-live="polite">/,
  "the status message is a cell of the desk strip",
);
test.assertNotMatches(
  indexHtml,
  /teachtext-desk-strip[\s\S]{0,600}?<div class="window-status-strip"/,
  "and TeachText no longer carries a second strip of its own",
);
test.assertNotIncludes(surfacesCss, ".teachtext-desk-strip + .window-status-strip", "the negative margin that faked one bar is gone");
test.assertNotIncludes(liquidCss, ".teachtext-desk-strip + .window-status-strip", "in both appearances");

// aria-live belongs to the message alone. On the container, every keystroke
// that changes a state cell would be announced.
test.assertNotMatches(
  indexHtml,
  /<div class="teachtext-desk-strip"[^>]*aria-live/,
  "the four state cells do not announce themselves",
);

// The state cells take the width their words need. Four equal columns plus a
// fifth clipped "Read-only, edit in Section Drafts" to an ellipsis -- the one
// cell that says why the writer cannot type.
test.assertMatches(
  read("styles/50-apps.css"),
  /\.teachtext-desk-strip \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, auto\)\) minmax\(0, 1fr\);/,
  "the message takes the room the state cells do not need",
);

// --- Four controls on the writing surfaces -------------------------------
//
// Preview, Focus, Commands, and the route. Focus keeps its place in the row:
// ⌥⌘F and the Writing-menu item are additions to it, not replacements for it.
// A mode you can see the state of without opening a menu is worth a button.
["#teachtext-body", "#review-desk-body", "#question-sheet-body", "#outline-content", "#draft-body", "#quick-draft-draft"].forEach((target) => {
  test.assertMatches(
    indexHtml,
    new RegExp(`data-mde-focus-cycle[^>]*data-mde-target="${target}"`),
    `${target} keeps its Focus button`,
  );
});

test.finish();
