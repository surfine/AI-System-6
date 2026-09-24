// Searcher finds a source door; Reader opens it. A result is picked in the
// list, and the handoff verbs act on that one pick -- so with nothing picked
// they are unavailable rather than answering a click with a status line, and
// opening a result means Reader, never a raw browser tab.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("searcher");
const findPath = read("app/features/findpath.js");
const actions = read("app/core/actions.js");
const html = read("index.html");
const windowsCss = read("styles/10-windows.css");
const appsCss = read("styles/50-apps.css");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// Opening a result goes to Reader.
test.assertNotIncludes(findPath, "window.open(", "a result never opens in a raw browser tab");
test.assertIncludes(findPath, 'dispatchCommand?.("open-selected-in-reader")', "double-click and Return open the picked result in Reader");
test.assertIncludes(actions, 'isAvailable:()=>selectedFindPathIndex!==null&&!!findPathResults[selectedFindPathIndex]?.url', "Open in Reader is available only with a picked result");

// Picking a result marks a row; it does not rebuild the list.
test.assertIncludes(findPath, "function selectFindPathResult(index, { focus = false } = {})", "selection toggles the row instead of re-rendering");
test.assertNotMatches(findPath, /item\.addEventListener\("click"[\s\S]{0,160}renderFindPathResults\(\)/, "a click no longer rebuilds every row and drops keyboard focus");
test.assertIncludes(findPath, "const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: last }[event.key];", "arrow keys, Home and End move through the results");

// The handoff verbs are unavailable with nothing picked, and say why.
test.assertIncludes(findPath, "function syncFindPathActions()", "one function owns the handoff verbs' availability");
test.assertIncludes(findPath, 'button.dataset.balloonHelpDisabled = "balloon_searcher_needs_result"', "a disabled verb explains itself in Balloon Help");
for (const key of ["balloon_searcher_needs_result", "searcher_send_menu"]) {
  test.assertIncludes(en, `${key}:`, `English includes ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese includes ${key}`);
}

// One action row: Synthesize apart, then Send To (File Floppy, Copy, Insert),
// Clip, and Open in Reader at the trailing edge.
test.assertMatches(html, /class="button-row find-path-actions">\s*<button[^>]*id="synthesize-find-path"[\s\S]*?id="find-path-send-menu"[\s\S]*?data-action="find-path-to-floppy"[\s\S]*?data-action="copy-search-result-markdown"[\s\S]*?data-action="insert-search-result"[\s\S]*?data-action="clip-selected-find-path"[\s\S]*?data-action="open-selected-in-reader"/, "the action row is ordered by reach: batch, send, clip, open");
test.assertIncludes(appsCss, ".teachtext-command-menu.is-disabled > summary {", "a command menu with nothing available reads as disabled and does not open");

// Scannable rows in a window wide enough to hold them.
test.assertIncludes(windowsCss, "width: min(560px, calc(100vw - 24px));", "the window holds a query and one row of actions");
test.assertIncludes(windowsCss, "-webkit-line-clamp: 2;", "unpicked rows show two lines of snippet");

test.finish();
