// Reader is a reading and clipping surface, not a general browser. It opens
// extracted documents, File Floppy documents, and reader tabs, then sends
// selected evidence into visible project objects.

import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("reader");
const reader = read("app/features/reader.js");
const workingSession = read("app/core/working-session.js");
const windowManager = read("app/core/window-manager.js");
const index = read("index.html");
const app = readAppSurface(["app/features/scrapbook.js", "app/features/writing-flow.js"]);
const responsive = read("styles/60-responsive.css");
const styles = read("styles/20-reader-docmap.css");
const surfaces = read("styles/30-surfaces.css");
const findPath = read("app/features/findpath.js");
const dictionary = read("app/data/system-dictionary.js");
const writingHelp = read("app/data/writing-flow-help.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

test.assertIncludes(reader, "function readerDocumentTitle(readerDoc)", "Reader works with extracted document records, not browser chrome");
test.assertIncludes(reader, "function openReaderDocumentTab(tabId)", "Reader documents are managed as project-scoped tabs");
test.assertIncludes(reader, "function captureActiveReaderTabState()", "Reader captures scroll and document state before switching tabs");
test.assertIncludes(reader, "readerFileTabDocument(tab)", "Reader can open File Floppy documents as reading material");
test.assertIncludes(reader, "mountedTextDisk.projectId !== activeProjectId", "Reader refuses File Floppy documents from another project");

test.assertIncludes(workingSession, "function captureReaderWorkingSession()", "ordinary refresh captures the active Reader page");
test.assertIncludes(workingSession, "function restoreReaderWorkingSession(state = {})", "ordinary refresh restores the active Reader page");
test.assertIncludes(workingSession, "currentReaderPage", "Reader resume stores document state rather than only a URL");

test.assertIncludes(index, 'id="reader-clip-translate-button"', "Reader exposes clipping and translation controls as visible actions");
test.assertIncludes(windowManager, "const activeReaderControlEnabled", "Reader menu availability reads the toolbar's native state without self-locking on its mirrored class");
test.assertIncludes(windowManager, '"reader-make-docmap": winName === "reader" && activeReaderControlEnabled("#reader-docmap-button")', "a loaded Reader document can re-enable its DocMap handoff after starting empty");
test.assertIncludes(app, "clipReaderSelection", "Reader selections can become project evidence");
test.assertIncludes(app, "openSelectedScrapSourceInReader", "Scrapbook sources can return to Reader");
test.assertNotIncludes(reader, "window.open(", "Reader does not degrade into a raw browser window");
test.assertIncludes(styles, ".reader-pane:has(#reader-docmap-button:not(:disabled)) .reader-url-row", "Reader switches to loaded-document actions without keeping the source-entry row on any screen");
test.assertIncludes(responsive, "grid-template-columns: repeat(auto-fit, minmax(84px, 1fr))", "Reader handoffs share one compact phone row");
test.assertIncludes(index, '<button class="btn ask-bar-lead" type="button" id="reader-docmap-button"', "Reader hands off to DocMap from beside the question, like Time Machine");
test.assertIncludes(index, '<form id="reader-ask-form" class="ask-bar" data-ask-source="reader">', "Reader uses the shared ask bar rather than a Reader-only question form");
test.assertIncludes(reader, 'range: selection ? t("ask_scope_selection") : t("ask_scope_whole_source")', "the Reader ask bar states whether the question carries the selection or the whole source");
test.assertIncludes(surfaces, ".ask-bar-row {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;", "the shared ask bar keeps input and action on one row");
test.assertIncludes(responsive, ".reader-body-content p {\n    margin: 1em 0;\n    text-align: start;", "Reader drops desktop justification on a narrow reading column");
test.assertIncludes(responsive, "overflow-wrap: anywhere", "Reader can wrap long English URLs and translated terms");
test.assertIncludes(dictionary, "Follow Searcher → Reader → DocMap", "System Help documents the source-to-reading-to-map chain");
test.assertIncludes(writingHelp, "**Searcher → Reader → DocMap**", "Writing Flow Help teaches the same production chain");
test.assertIncludes(findPath, 't("searcher_open_link_hint")', "Searcher result affordances use localized copy");
test.assertIncludes(findPath, 't("searcher_more_results")', "Searcher pagination uses localized copy");
for (const key of ["searcher_open_link_hint", "searcher_more_results"]) {
  test.assertIncludes(en, `${key}:`, `English includes ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese includes ${key}`);
}

test.finish();
