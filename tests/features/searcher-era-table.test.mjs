// Searcher era result table: one DOM, six appearances. The header row and
// the rank-mapped relevance bar always render; base CSS carries the whole
// recipe on --find-path-* tokens, and the era theme blocks only assign
// token values (the child-appearance gate forbids app selectors there).
// Platinum, Aqua, and Snow Leopard show the header; only Platinum + Aqua
// draw the relevance column (product decision, 2026-08-11). Snow Leopard
// instead moves the query row onto toolbar material and drops the
// relevance column through the two-column template.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("searcher-era-table");
const findPath = read("app/features/findpath.js");
const foundation = read("styles/00-foundation.css");
const windowsCss = read("styles/10-windows.css");
const platinumCss = read("styles/65-appearance-themes.css");
const aquaCss = read("styles/67-aqua-appearance.css");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

test.assertIncludes(findPath, 'resultsHeader.className = "find-path-results-header"', "Searcher renders one shared column-header row");
test.assertIncludes(findPath, 'resultsHeader.setAttribute("aria-hidden", "true")', "the era header stays decorative for screen readers");
test.assertIncludes(findPath, 'setProperty("--find-path-relevance"', "relevance is a rank-mapped custom property, not per-era markup");
test.assertIncludes(findPath, '<span class="find-path-result-relevance" aria-hidden="true">', "each result carries the shared relevance element");

test.assertIncludes(foundation, "--find-path-header-display: none;", "Classic hides the header through the default token");
test.assertIncludes(foundation, "--find-path-relevance-display: none;", "Classic hides the relevance bar through the default token");
test.assertIncludes(windowsCss, "display: var(--find-path-header-display);", "base CSS gates the header on the display token");
test.assertIncludes(windowsCss, "display: var(--find-path-result-display, flex);", "result rows switch to the era grid only by token");
test.assertIncludes(windowsCss, "padding: var(--find-path-result-padding);", "result row padding is a token so eras can densify rows");
test.assertIncludes(windowsCss, "currentColor 0 var(--find-path-relevance, 0%)", "the relevance bar paints with currentColor so selection inversion keeps it visible");
test.assertIncludes(windowsCss, ":where(:nth-child(even of .find-path-result))", "zebra striping stays low-specificity so hover and selection win");

// Era blocks assign tokens only; no app selector may appear under a theme
// scope (child-appearance budget is zero).
test.assertNotIncludes(platinumCss, '[data-theme="platinum"] .find-path', "Platinum carries the Searcher table through tokens, not app selectors");
test.assertNotIncludes(aquaCss, '.find-path', "the Aqua branch carries the Searcher table through tokens, not app selectors");
test.assertIncludes(platinumCss, "--find-path-relevance-display: block;", "Platinum turns the Sherlock relevance column on");
test.assertIncludes(aquaCss, "--find-path-result-even-bg: #edf3fe;", "Aqua zebra-stripes the result rows");
test.assertIncludes(aquaCss, "--find-path-relevance-radius: 999px;", "Aqua rounds the relevance bar");
test.assertIncludes(aquaCss, "--find-path-query-bg: var(--search-field-background, var(--field-bg));", "Aqua swaps the query field to its measured search-field recipe");
test.assertIncludes(aquaCss, "--find-path-table-columns: minmax(0, 1fr) minmax(0, 36%);", "Snow Leopard drops the relevance column via the template");
test.assertIncludes(aquaCss, "--find-path-query-row-bg: var(--toolbar-bg);", "Snow Leopard lifts the query row onto toolbar material");

for (const key of ["searcher_column_name", "searcher_column_relevance", "searcher_column_site"]) {
  test.assertIncludes(en, `${key}:`, `English includes ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese includes ${key}`);
}

test.finish();
