// Scrapbook keeps one curated-item model while historical appearances choose
// the native page rail or a later source-browser projection through tokens.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("scrapbook-era-pager");
const html = read("index.html");
const scrapbook = read("app/features/scrapbook.js");
const actions = read("app/core/actions.js");
const foundation = read("styles/00-foundation.css");
const apps = read("styles/50-apps.css");
const appearance = read("styles/65-appearance-themes.css");
const aqua = read("styles/67-aqua-appearance.css");
const liquid = read("styles/70-liquid-glass.css");

test.assertIncludes(html, 'class="scrapbook-page-rail is-horizontal"', "Scrapbook carries the native horizontal page rail in stable DOM");
test.assertIncludes(html, 'class="window-frame-arrow is-left"', "the previous control reuses the native stepped window-frame arrow");
test.assertIncludes(html, 'id="scrapbook-page-position">0 / 0</output>', "the page receipt starts with an honest empty count");
test.assertIncludes(scrapbook, "function moveScrapbookPage(direction)", "one selection model drives both page and list projections");
test.assertIncludes(scrapbook, 'const tick = document.createElement("button");', "each page tick is a real control, not decoration");
test.assertIncludes(scrapbook, 'scrap.id === selectedScrap?.id ? "is-active" : ""', "the native thumb position is derived without inline layout");
test.assertIncludes(scrapbook, 'selectedScrapIds.has(scrap.id) ? "is-multi-selected" : ""', "ticks show multi-selection membership");
test.assertIncludes(scrapbook, 'tick.setAttribute("aria-pressed", selectedScrapIds.has(scrap.id) ? "true" : "false")', "tick selection state is announced");
test.assertMatches(scrapbook, /tick\.addEventListener\("click", \(event\) => \{\s*const wasSelected[\s\S]{0,200}event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey/, "tick clicks reuse the list rows' modifier multi-select grammar");
test.assertIncludes(actions, '"scrapbook-page-previous": showPreviousScrapbookPage', "the page arrows use the shared action registry");
test.assertIncludes(scrapbook, "sendScrapsToQuestionButton.disabled = !selectedCount", "Scrapbook owns the real availability of its batch actions");
test.assertMatches(read("app/core/window-manager.js"), /"scrapbook-send-question": winName === "scrapbook" && activeOwnedControlEnabled/, "the Scrap menu reads owned availability, not the mirrored is-disabled class");
test.assertIncludes(foundation, "--scrapbook-list-display: none;", "Classic defaults to the native single-item projection");
test.assertIncludes(foundation, "--scrapbook-pager-display: grid;", "Classic reveals the page rail");
test.assertIncludes(apps, "display: var(--scrapbook-pager-display);", "the base recipe consumes the era projection token");
test.assertIncludes(aqua, "--scrap-list-item-selected-bg: linear-gradient(#73baff, #2778d8);", "Jaguar supplies its Aqua list selection");
test.assertIncludes(aqua, "--scrap-list-item-selected-bg: var(--sidebar-selection-bg);", "Snow Leopard reuses the measured source-list selection");
test.assertIncludes(appearance, "--scrapbook-pager-display: none;", "Yosemite keeps a flat list browser");
test.assertIncludes(liquid, "--scrapbook-list-display: block;", "Liquid Glass preserves its existing split browser");
test.assertNotMatches(appearance, /body\[data-theme="(?:platinum|yosemite)"\][^{]*(?:scrapbook-pane|scrapbook-pager|scrap-list)/, "appearance themes remain token-only for Scrapbook roles");
test.assertNotMatches(aqua, /body\[data-theme="(?:aqua|snow-leopard)"\][^{]*(?:scrapbook-pane|scrapbook-pager|scrap-list)/, "Aqua-family themes remain token-only for Scrapbook roles");

test.finish();
