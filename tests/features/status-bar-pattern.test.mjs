// Document applications share a three-slot status bar: leading state, centered
// object context, and trailing low-frequency commands. Browser-like surfaces
// may project the same roles into their navigation chrome.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("status-bar-pattern");
const index = read("index.html");
const windows = read("styles/10-windows.css");
const readerStyles = read("styles/20-reader-docmap.css");
const appStyles = read("styles/50-apps.css");
const draftDeskStyles = read("styles/91-draft-desk.css");
const responsive = read("styles/60-responsive.css");

test.assertIncludes(windows, ".app-status-bar {", "document apps share one status-bar grid");
test.assertIncludes(windows, "grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)", "the status bar reserves leading, centered, and trailing slots");
test.assertIncludes(windows, ".status-bar-leading {", "leading status has a shared semantic slot");
test.assertIncludes(windows, ".status-bar-context {", "current-object context has a shared semantic slot");
test.assertIncludes(windows, ".status-bar-trailing {", "commands and trailing state have a shared semantic slot");
test.assertIncludes(windows, "grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto", "phone-width document bars preserve live receipt, document context, and primary command");
test.assertNotIncludes(windows, ".details-bar.app-status-bar > .status-bar-leading {\n    display: none;", "responsive status bars never hide a live leading receipt by default");
test.assertIncludes(windows, ".details-bar.app-status-bar > .status-bar-context {\n    grid-column: 2;", "phone-width document context keeps the flexible middle slot");
test.assertNotIncludes(windows, ".teachtext-details-bar {\n  display: grid;", "obsolete TeachText-only columns cannot override the shared status grammar");
test.assertNotIncludes(appStyles, ".teachtext-surface-window .details-bar {\n    grid-template-columns:", "surface-specific phone columns cannot override the shared two-slot fallback");
test.assertMatches(index, /data-window="findPath"[\s\S]*?class="details-bar app-status-bar"[\s\S]*?class="status-bar-leading"[\s\S]*?class="status-bar-context"[\s\S]*?class="status-bar-trailing"/, "Searcher adopts the same semantic three-slot status grammar");
test.assertNotIncludes(windows, ".find-path-details {", "Searcher does not maintain a private copy of the shared grid");

test.assertIncludes(index, 'class="details-bar app-status-bar reader-details-bar"', "Reader uses the shared status-bar grammar");
test.assertIncludes(index, 'class="status-bar-context reader-status-context"', "Reader places source or compact document stack in the center");
test.assertIncludes(index, 'class="status-bar-trailing reader-status-actions"', "Reader reserves the trailing slot for document commands");
test.assertIncludes(index, 'id="reader-docmap-selection-command" data-action="reader-docmap-selection"', "Reader exposes selection mapping as an explicitly gated command");
test.assertIncludes(index, 'id="reader-docmap-source-command" data-action="reader-docmap-source"', "Reader exposes whole-source mapping as an explicitly gated command");
test.assertMatches(index, /reader-status-actions[\s\S]*id="reader-command-menu"[\s\S]*<\/div>\s*<\/div>\s*<div class="window-pane reader-pane">/, "Reader's Commands menu lives in the status bar rather than the content toolbar");
test.assertIncludes(readerStyles, ".reader-pane:has(#reader-docmap-button:not(:disabled)) .reader-actions {", "a loaded Reader document removes the now-empty source-action row");
test.assertIncludes(readerStyles, ".reader-status-context:has(.tdi-stack-host:not(.is-hidden)) > #reader-url-display", "the compact document stack replaces duplicate source text under pressure");
test.assertIncludes(responsive, ".reader-pane:has(#reader-docmap-button:not(:disabled)) .reader-actions {\n    display: none;", "phone rules do not resurrect Reader's empty toolbar row");

test.assertIncludes(index, 'class="details-bar app-status-bar teachtext-details-bar"', "TeachText maps its existing state, context, and save state onto the shared slots");
test.assertIncludes(index, 'class="details-bar app-status-bar docmap-details-bar"', "DocMap maps count, document stack, and Commands onto the shared slots");
test.assertIncludes(index, 'class="status-bar-leading" id="docmap-count"', "DocMap keeps node count in the leading status slot");
test.assertIncludes(index, 'class="status-bar-context tdi-stack-host" data-tdi-stack-for="docmap-tabs"', "DocMap centers the active document independently of trailing commands");
test.assertIncludes(index, 'class="status-bar-trailing docmap-status-actions"', "DocMap keeps Commands in the trailing slot");

for (const [id, role] of [
  ["question-count", "Question Sheet"],
  ["outline-status", "Outline"],
  ["draft-count", "Section Drafts"],
  ["style-sheet-count", "Review Desk"],
]) {
  test.assertIncludes(index, `class="status-bar-leading" id="${id}"`, `${role} maps its receipt to the shared leading slot`);
}
test.assertIncludes(index, 'class="status-bar-context linked-manuscript-title" id="question-manuscript-title"', "Question Sheet centers its current manuscript semantically rather than absolutely");
test.assertIncludes(index, 'class="status-bar-context select-wrap select-wrap-inline"><select id="outline-pipeline-label"', "Outline centers its document status through the shared context slot");
test.assertIncludes(index, 'class="status-bar-context select-wrap select-wrap-inline"><select id="draft-pipeline-label"', "Section Drafts centers its document status through the shared context slot");
test.assertIncludes(index, 'class="status-bar-context linked-manuscript-title" id="review-status-title"', "Review Desk centers its current manuscript through the shared context slot");
test.assertNotIncludes(windows, "#question-manuscript-title {\n  position: absolute", "Question Sheet no longer overlays status-bar tracks with absolute positioning");
test.assertNotIncludes(windows, ".outline-window .select-wrap-inline {\n  position: absolute", "writing status selectors no longer overlay status-bar tracks with absolute positioning");

test.assertIncludes(windows, ".details-bar:has(.view-controls) {\n  position: relative;\n  display: grid;", "Finder-family status bars reserve a real center track for view controls");
test.assertIncludes(windows, ".details-bar:has(.view-controls) > span:last-child {", "Finder-family trailing location text owns the trailing grid slot");
test.assertIncludes(windows, ".view-controls {\n  display: flex;\n  align-items: center;\n  position: static;", "Finder view controls participate in layout instead of overlaying labels");

test.assertIncludes(draftDeskStyles, "grid-template-columns: auto auto minmax(0, 1fr) auto auto;", "Quick Draft assigns all five receipts explicit tracks at useful widths");
test.assertIncludes(draftDeskStyles, ".draft-desk-details > #quick-draft-protect-state,\n  .draft-desk-details > #quick-draft-stack-state {", "phone-width Quick Draft yields low-frequency guardrail receipts before live status");
test.assertIncludes(index, 'class="time-machine-navigation"', "Time Machine retains browser navigation as the intentional status-bar analogue");

test.finish();
