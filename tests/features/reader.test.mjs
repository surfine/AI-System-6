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
const appStyles = read("styles/50-apps.css");
const foundation = read("styles/00-foundation.css");
const liquid = read("styles/70-liquid-glass.css");
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
test.assertIncludes(index, 'class="teachtext-command-menu command-menu-opens-down reader-command-menu"', "Reader marks its top-toolbar command menu to open into the window");
test.assertIncludes(appStyles, ".teachtext-command-menu.command-menu-opens-down .teachtext-command-popover", "top-toolbar command menus share the downward placement rule");
test.assertIncludes(foundation, "--reader-title-divider:", "Reader title hierarchy uses a theme-owned divider token");
test.assertIncludes(foundation, "--reader-meta-divider:", "Reader metadata hierarchy uses a theme-owned divider token");
test.assertIncludes(foundation, "--reader-section-marker:", "Reader section hierarchy uses a theme-owned marker token");
test.assertIncludes(liquid, "--reader-meta-divider: 1px solid rgba(16, 17, 20, 0.1)", "Liquid Glass replaces the Classic dotted metadata rule with a quiet solid divider");
test.assertIncludes(windowManager, "const activeOwnedControlEnabled", "Reader menu availability reads the toolbar's native state without self-locking on its mirrored class");
test.assertIncludes(reader, '["reader-make-docmap"', "Reader registers its DocMap command explicitly");
test.assertIncludes(reader, 'rctrl("#reader-docmap-button")', "a loaded Reader document re-enables its DocMap handoff after starting empty");
test.assertIncludes(reader, 'isAvailable:()=>a==="open-reader"', "Reader commands report availability through the runtime");
test.assertIncludes(app, "clipReaderSelection", "Reader selections can become project evidence");
test.assertIncludes(app, "openSelectedScrapSourceInReader", "Scrapbook sources can return to Reader");
test.assertNotIncludes(reader, "window.open(", "Reader does not degrade into a raw browser window");
test.assertIncludes(styles, ".reader-pane:has(#reader-docmap-button:not(:disabled)) .reader-url-row", "Reader switches to loaded-document actions without keeping the source-entry row on any screen");
test.assertIncludes(responsive, ".reader-pane:has(#reader-docmap-button:not(:disabled)) .reader-actions {\n    display: none;", "Reader loaded state does not restore an empty phone toolbar below the status bar");
test.assertIncludes(index, '<button class="btn ask-bar-lead" type="button" id="reader-docmap-button"', "Reader hands off to DocMap from beside the question, like Time Machine");
test.assertIncludes(index, '<form id="reader-ask-form" class="ask-bar" data-ask-source="reader">', "Reader uses the shared ask bar rather than a Reader-only question form");
test.assertIncludes(reader, 'range: selection ? t("ask_scope_selection") : t("ask_scope_whole_source")', "Reader still derives the selection or whole-source context carried into SideAsk");
test.assertIncludes(surfaces, ".ask-bar-row {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;", "the shared ask bar keeps input and action on one row");
test.assertIncludes(responsive, ".reader-body-content p {\n    margin: 1em 0;\n    text-align: start;", "Reader drops desktop justification on a narrow reading column");
test.assertIncludes(responsive, "overflow-wrap: anywhere", "Reader can wrap long English URLs and translated terms");
test.assertIncludes(dictionary, "Follow Searcher → Reader → DocMap", "System Help documents the source-to-reading-to-map chain");
test.assertIncludes(writingHelp, "**Searcher → Reader → DocMap**", "Writing Flow Help teaches the same production chain");
test.assertIncludes(writingHelp, "Searcher finds a source door, Reader opens the original", "the help explains what changes at each research step");
test.assertIncludes(findPath, 't("searcher_open_link_hint")', "Searcher result affordances use localized copy");
test.assertIncludes(findPath, 't("searcher_more_results")', "Searcher pagination uses localized copy");
for (const key of ["searcher_open_link_hint", "searcher_more_results"]) {
  test.assertIncludes(en, `${key}:`, `English includes ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese includes ${key}`);
}
test.assertIncludes(reader, 'readerTitleEl.textContent = appTitle', "Reader keeps the application name in its title bar");
test.assertIncludes(reader, 'compactLabelFor: (tab) => tab.title || tab.url || t("reader")', "Reader puts the active source title in compact TDI chrome without an ordinal prefix");

// --- A clipped page keeps its figures ------------------------------------
//
// The extractor used to delete <figure> and <picture> outright, so a chart or
// a diagram -- often the evidence itself -- vanished from the clip. It stays
// now, carried by the address the publisher already published. The Reader is
// still not a browser: it reads the figures of the page already clipped and
// follows nothing.

const readerServer = read("apps/server/server/reader.js");

test.assertIncludes(readerServer, "readerFigureMarkdown", "a figure becomes Markdown instead of being deleted");
test.assertNotIncludes(
  readerServer,
  "replace(/<figure\\b[^<]*(?:(?!<\\/figure>)<[^<]*)*<\\/figure>/gi, \"\")",
  "figures are no longer replaced with nothing"
);
test.assertIncludes(readerServer, "isReaderFigureBlock(block)) return true", "the boilerplate stripper does not prune a figure");
test.assertIncludes(readerServer, "isReaderFigureBlock(blocks[0])", "a figure at the top stops the leading trim instead of being eaten");
test.assertIncludes(readerServer, "isReaderFigureBlock(last)", "a figure at the end stops the trailing trim");
test.assertIncludes(readerServer, "READER_MAX_IMAGE_URL_LENGTH = 8192", "a link too long for the vision route is not carried");
test.assertIncludes(readerServer, "READER_TRACKING_PIXEL_PATTERN", "counting pixels are not mistaken for evidence");
test.assertIncludes(readerServer, "if (!source || /^data:/i.test(source)) return \"\"", "an inline sprite is not a figure");
test.assertIncludes(readerServer, "if (!/^https:\\/\\//i.test(absolute)) return \"\"", "only an HTTPS address is carried");
test.assertIncludes(readerServer, "READER_MAX_FIGURES = 12", "a page is not a gallery");

test.assertIncludes(reader, "wireReaderFigures", "the Reader offers to read a figure it kept");
// The picture is named, not fetched. The desktop's img-src policy allows only
// self, data:, and blob:, and pulling a publisher's image into the page would
// tell that publisher the writer is reading, every time the clip is opened.
test.assertIncludes(reader, "plate.dataset.src = src", "a kept figure carries its address without fetching it");
test.assertIncludes(reader, "host.replaceWith(plate)", "the remote image never enters the page");
test.assertIncludes(reader, "reader_figure_untitled", "an uncaptioned figure still says what it is");
// A held place, not an error. The "why is the picture not here" explanation
// belongs in Balloon Help, which is what Balloon Help is for -- the article
// body should read like an article.
test.assertIncludes(reader, "reader-figure-frame", "the figure shows a framed place where the picture would be");
test.assertIncludes(reader, "balloon_reader_figure", "Balloon Help carries the explanation instead of the body text");
test.assertIncludes(reader, "balloon_reader_figure_ask", "Balloon Help says what the ask actually sends");
test.assertNotIncludes(en, "(not downloaded)", "the caption does not explain the implementation to the reader");
for (const key of ["balloon_reader_figure", "balloon_reader_figure_ask"]) {
  test.assertIncludes(en, key, `English Balloon Help carries ${key}`);
  test.assertIncludes(zh, key, `Chinese Balloon Help carries ${key}`);
}
test.assertNotIncludes(reader, "image.loading = \"lazy\"", "no remote image is left in the document to load");
test.assertIncludes(reader, "images: [src]", "the address travels, not the picture");
test.assertIncludes(reader, "readerFigureReading = null", "figure notes are held in memory until the writer clips them");
test.assertIncludes(reader, "\"reader-figure\"", "a clipped figure reading is a scrap with its own provenance");
test.assertIncludes(reader, "Read by: ", "a clipped reading names the model that produced it");

for (const key of ["reader_figure_read", "reader_figure_reading", "reader_figure_clip", "reader_figure_discard"]) {
  test.assertIncludes(en, key, `English copy carries ${key}`);
  test.assertIncludes(zh, key, `Chinese copy carries ${key}`);
}

test.finish();
