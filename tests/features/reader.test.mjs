// Reader is a reading and clipping surface, not a general browser. It opens
// extracted documents, File Floppy documents, and reader tabs, then sends
// selected evidence into visible project objects.

import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("reader");
const reader = read("app/features/reader.js");
const workingSession = read("app/core/working-session.js");
const index = read("index.html");
const app = readAppSurface(["app/features/scrapbook.js", "app/features/writing-flow.js"]);

test.assertIncludes(reader, "function readerDocumentTitle(readerDoc)", "Reader works with extracted document records, not browser chrome");
test.assertIncludes(reader, "function openReaderDocumentTab(tabId)", "Reader documents are managed as project-scoped tabs");
test.assertIncludes(reader, "function captureActiveReaderTabState()", "Reader captures scroll and document state before switching tabs");
test.assertIncludes(reader, "readerFileTabDocument(tab)", "Reader can open File Floppy documents as reading material");
test.assertIncludes(reader, "mountedTextDisk.projectId !== activeProjectId", "Reader refuses File Floppy documents from another project");

test.assertIncludes(workingSession, "function captureReaderWorkingSession()", "ordinary refresh captures the active Reader page");
test.assertIncludes(workingSession, "function restoreReaderWorkingSession(state = {})", "ordinary refresh restores the active Reader page");
test.assertIncludes(workingSession, "currentReaderPage", "Reader resume stores document state rather than only a URL");

test.assertIncludes(index, 'id="reader-clip-translate-button"', "Reader exposes clipping and translation controls as visible actions");
test.assertIncludes(app, "clipReaderSelection", "Reader selections can become project evidence");
test.assertIncludes(app, "openSelectedScrapSourceInReader", "Scrapbook sources can return to Reader");
test.assertNotIncludes(reader, "window.open(", "Reader does not degrade into a raw browser window");

test.finish();
