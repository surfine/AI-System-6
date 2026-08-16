// External drop: material from outside AI System 6 gets in, and finished
// material gets out.
//
// One router (app/core/external-drop.js) answers "what is this, and where does
// it belong": a file goes to the File Floppy, a link goes to Reader as one
// source, a paragraph stops at the Clipboard. DocMap, ClioStage, and Reader
// used to carry their own copies of the file rules; they now share this one.
//
// Outgoing, shareArtifact/saveArtifact is the single exit. Every window used
// to build its own <a download>.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("external-drop");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const externalDrop = read("app/core/external-drop.js");
const dragDrop = read("app/core/drag-drop.js");
const modal = read("app/core/modal.js");
const webPlatform = read("app/core/web-platform.js");
const wireup = read("app/core/wireup.js");
const reader = read("app/features/reader.js");
const exportImport = read("app/features/export-import.js");
const manifest = read("tooling/runtime-manifest.mjs");

// ---- The router exists and boots ------------------------------------------

test.assertFile("app/core/external-drop.js", "the external-drop router is a core module");
test.assertIncludes(manifest, '"app/core/external-drop.js"', "the router loads at boot, not lazily");
test.assertMatches(
  manifest,
  /"app\/core\/external-drop\.js",\s*\n\s*"app\/core\/drag-drop\.js"/,
  "the router loads before the Finder drop handler that calls it"
);
test.assertIncludes(dragDrop, "initExternalDropSafetyNet()", "the Finder drop wiring installs the external-drop safety net");

// ---- Internal drags keep their own routes ---------------------------------

test.assertIncludes(
  externalDrop,
  'const internalDragDataType = "application/json"',
  "internal Finder drags are recognized by their own payload type"
);
test.assertIncludes(
  externalDrop,
  "if (types.includes(internalDragDataType)) return false;",
  "an internal drag is never re-read as outside material"
);
test.assertIncludes(
  externalDrop,
  "if (types.includes(internalDragDataType)) return null;",
  "the payload reader refuses internal drags"
);
test.assertIncludes(
  dragDrop,
  "if (isExternalDrop(event)) {",
  "the Finder drop handler routes outside material before reading its own payload"
);

// ---- One classification, three destinations -------------------------------

test.assertIncludes(externalDrop, "function classifyExternalDrop", "one function decides where a drop belongs");
test.assertIncludes(externalDrop, 'if (payload.files.length) return "fileFloppy";', "files go to the File Floppy");
test.assertIncludes(externalDrop, 'if (payload.urls.length && payload.hasUriList) return "reader";', "an explicit link drag goes to Reader");
test.assertIncludes(externalDrop, 'if (payload.urls.length && payload.textIsBareUrl) return "choose";', "a bare URL inside plain text is the one ambiguous case");
test.assertIncludes(externalDrop, 'if (payload.text) return "clipboard";', "plain text stops at the Clipboard");
test.assertIncludes(externalDrop, "function fileExternalDropIntoFileFloppy", "the File Floppy route has one implementation");
test.assertIncludes(externalDrop, "function readExternalDropInReader", "the Reader route has one implementation");
test.assertIncludes(externalDrop, "function keepExternalDropOnClipboard", "the Clipboard route has one implementation");

// Reader stays a reading surface: a dropped link is fetched through the
// existing extraction, never opened as a page.
test.assertIncludes(externalDrop, "fetchReaderPage(urls[0])", "a dropped link goes through Reader's own source extraction");
test.assertNotIncludes(externalDrop, "window.open", "no drop route opens a browser window");
test.assertNotIncludes(externalDrop, "iframe", "no drop route renders a page frame");

// AI-mouthpiece and injection safety: dropped text is material, not a command
// and not a document edit.
test.assertIncludes(externalDrop, "setClipboard(text,", "dropped text is held on the Clipboard for the user to place");
test.assertNotIncludes(externalDrop, "teachTextBodyInput", "no drop route writes into the Manuscript by itself");
test.assertNotIncludes(externalDrop, "createScrap", "no drop route writes into Scrapbook by itself");

// ---- The ambiguous case asks once, in a System 6 alert ---------------------

test.assertIncludes(externalDrop, "function chooseExternalDropRouteForUrl", "the ambiguous link asks instead of guessing");
test.assertIncludes(externalDrop, 'altKey: "external_drop_keep_text"', "the question offers the second real answer, not only OK/Cancel");
test.assertIncludes(modal, "systemModalNo.hidden = !options.altKey;", "the confirm alert can show one named alternative");
test.assertIncludes(en, "external_drop_url_question:", "the question is translated in English");
test.assertIncludes(zh, "external_drop_url_question:", "the question is translated in Chinese");
test.assertIncludes(en, "external_drop_read_source:", "the Reader answer is translated in English");
test.assertIncludes(zh, "external_drop_read_source:", "the Reader answer is translated in Chinese");
test.assertIncludes(en, "external_drop_keep_text:", "the Clipboard answer is translated in English");
test.assertIncludes(zh, "external_drop_keep_text:", "the Clipboard answer is translated in Chinese");

// ---- Nothing is claimed that did not happen -------------------------------

test.assertIncludes(
  externalDrop,
  "const mounted = result?.mountedFileNames?.length || 0;",
  "the File Floppy route reports the files the import really mounted"
);
test.assertIncludes(externalDrop, 't("file_disk_mount_failed_all", files.length)', "a failed import reports the failure, not a success");
test.assertIncludes(en, "external_drop_filed:", "the success line names the real count in English");
test.assertIncludes(zh, "external_drop_filed:", "the success line names the real count in Chinese");
test.assertIncludes(en, "external_drop_kept_text:", "the Clipboard line is translated in English");
test.assertIncludes(zh, "external_drop_kept_text:", "the Clipboard line is translated in Chinese");
test.assertIncludes(en, "external_drop_canceled:", "a drop that filed nothing says so in English");
test.assertIncludes(zh, "external_drop_canceled:", "a drop that filed nothing says so in Chinese");

// ---- Target windows keep their own behavior -------------------------------

test.assertIncludes(externalDrop, "function registerExternalFileDropSurface", "windows that take files share one registration");
test.assertIncludes(wireup, "registerExternalFileDropSurface(docMapDropZoneEl", "DocMap uses the shared surface");
test.assertIncludes(wireup, "registerExternalFileDropSurface(clioStageViewportEl", "ClioStage uses the shared surface");
test.assertNotIncludes(wireup, 'docMapDropZoneEl?.addEventListener("drop"', "DocMap no longer keeps its own copy of the drop rules");
test.assertNotIncludes(wireup, 'clioStageViewportEl?.addEventListener("drop"', "ClioStage no longer keeps its own copy of the drop rules");
test.assertIncludes(reader, "readExternalDropPayload(event)", "Reader reads outside material through the shared payload reader");
test.assertIncludes(reader, "return mountedFileNamesFromDrop(event);", "Reader shares the internal File Floppy drag reader");
test.assertIncludes(
  externalDrop,
  "if (!isExternalDrop(event)) {",
  "a registered surface lets internal object drags bubble to the Finder router"
);
test.assertIncludes(
  dragDrop,
  'const externalDropTargets = new Set(["desktop", "editor-insert", "clio-attachment"]);',
  "only the desktop and the two content surfaces take outside material"
);
test.assertIncludes(
  dragDrop,
  "if (!externalDropHasFiles(event)) return false;",
  "an editable surface keeps the browser's own text insertion at the drop point"
);
test.assertIncludes(en, "external_drop_needs_file:", "a window that only takes files says so in English");
test.assertIncludes(zh, "external_drop_needs_file:", "a window that only takes files says so in Chinese");
test.assertIncludes(en, "external_drop_use_desktop:", "a refused drop points at the desktop in English");
test.assertIncludes(zh, "external_drop_use_desktop:", "a refused drop points at the desktop in Chinese");

// A file dropped on a window with no handler must not navigate the browser
// away from the desktop, which would end the session.
test.assertIncludes(externalDrop, "function initExternalDropSafetyNet", "an unhandled file drop cannot navigate away from the desktop");
test.assertIncludes(externalDrop, "if (event.defaultPrevented || !externalDropHasFiles(event)) return;", "the safety net never steals a handled drop");

// ---- One exit for finished material ---------------------------------------

test.assertIncludes(webPlatform, "async function shareArtifact", "one share exit takes any artifact");
test.assertIncludes(webPlatform, "function saveArtifact", "one save exit takes any artifact");
test.assertIncludes(webPlatform, "function artifactFileFrom", "text, Blob, data URL, and File all become one File");
test.assertIncludes(webPlatform, "navigator.canShare?.({ files: [file] }) === true", "the share sheet is used only when it can really take the file");
test.assertIncludes(webPlatform, 'return { shared: false, method: "cancel" };', "a cancelled share reports a cancel, never a success");
test.assertIncludes(webPlatform, 'if (fallback === "download")', "a platform that cannot share files saves the artifact instead");
test.assertIncludes(webPlatform, "  saveArtifact,\n  shareArtifact,", "both halves are published on the web-platform surface");

// Web Share Target does not exist in WebKit, so there is no incoming share
// hook to claim; material comes back through the picker, drop, paste, or URL.
test.assertNotIncludes(html, "share_target", "no page claims to be a system share destination");

test.assertIncludes(exportImport, "function saveMarkdownArtifact", "Markdown downloads run through the one exit");
test.assertIncludes(exportImport, "window.AISystem6WebPlatform.saveArtifact(projectCdItemArtifact(item))", "the Project CD download runs through the one exit");
test.assertIncludes(exportImport, "async function shareActiveProjectDisk", "the Project Hard Disk backup can be shared, not only downloaded");
test.assertIncludes(exportImport, "async function readyProjectDiskBackup", "export and share assemble the same backup through one path");
test.assertIncludes(html, 'id="share-project-disk"', "Share Project Disk sits beside Export Backup");
test.assertIncludes(html, 'data-i18n="share_project_disk"', "the Share Project Disk button is translated");
test.assertIncludes(en, "share_project_disk:", "Share Project Disk is translated in English");
test.assertIncludes(zh, "share_project_disk:", "Share Project Disk is translated in Chinese");
test.assertIncludes(en, "project_disk_share_canceled:", "a cancelled project-disk share says so in English");
test.assertIncludes(zh, "project_disk_share_canceled:", "a cancelled project-disk share says so in Chinese");

// No window may keep a private download or a permanent hidden file input.
for (const [name, source] of [
  ["export-import", exportImport],
  ["quick-draft-editor", read("app/features/quick-draft-editor.js")],
  ["cmf-studio", read("app/features/cmf-studio.js")],
  ["liquid-cover", read("app/features/liquid-cover.js")],
  ["bureaucracy-meme", read("app/features/bureaucracy-meme.js")],
]) {
  test.assertNotMatches(source, /\.download = /, `${name} has no private download of its own`);
}
test.assertNotIncludes(html, 'id="clio-stage-file-input"', "ClioStage uses the one Choose-button picker");
test.assertNotIncludes(html, 'id="clio-chart-file-input"', "ClioChart uses the one Choose-button picker");
test.assertNotIncludes(html, 'id="bureaucracy-upload-input"', "the meme window uses the one Choose-button picker");
test.assertNotIncludes(html, 'id="soundscape-local-input"', "Soundscape uses the one Choose-button picker");
test.assertIncludes(reader, "openTransientFilePicker({", "Reader uses the one Choose-button picker");

test.finish();
