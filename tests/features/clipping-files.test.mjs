// Clipping Files: dragging a selection out of Reader (or clipping it from
// Selection Services) creates a small movable material file on the Project
// Hard Disk. It is not a Scrapbook entry and not File Floppy context; it is a
// durable file that can be dragged into folders, the desktop, or ClioTalk.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clipping-files");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const finderObjects = read("app/features/finder-objects.js");
const documentsChat = read("app/features/documents-chat.js");
const projectDisk = read("app/features/project-disk.js");
const selectionServices = read("app/features/selection-services.js");
const reader = read("app/features/reader.js");
const dragDrop = read("app/core/drag-drop.js");

test.assertIncludes(en, 'kind_clipping: "Clipping File"', "English UI names the Clipping File object");
test.assertIncludes(zh, 'kind_clipping: "摘录文件"', "Chinese UI names the Clipping File object");
test.assertIncludes(en, "selection_clip_file:", "English Selection Services offers Clip as File");
test.assertIncludes(zh, "selection_clip_file:", "Chinese Selection Services offers Clip as File");
test.assertIncludes(en, "clipping_allow_quote:", "Get Info offers the allow-quote choice");
test.assertIncludes(zh, "clipping_allow_quote:", "Get Info offers the allow-quote choice");

test.assertIncludes(finderObjects, "function createClippingFile", "clipping files are created through a single factory");
test.assertIncludes(finderObjects, 'artifactKind: "clipping"', "clipping files carry a durable kind marker");
test.assertIncludes(finderObjects, 'sourceUrl', "clipping files remember their original URL");
test.assertIncludes(finderObjects, "capturedAt", "clipping files record when they were captured");
test.assertIncludes(finderObjects, "contentHash", "clipping files carry a content hash");
test.assertIncludes(finderObjects, "allowQuote", "clipping files carry the direct-quote permission");
test.assertIncludes(finderObjects, "nextAvailableFileName", "clipping files share Finder's untitled naming");

test.assertIncludes(documentsChat, 'file.artifactKind === "clipping"', "clipping files can be attached to ClioTalk runs");
test.assertIncludes(selectionServices, 'command === "clip-file"', "Selection Services exposes Clip as File");
test.assertIncludes(selectionServices, "withFinderObjects", "Clip as File loads the lazy finder-objects module");
test.assertIncludes(reader, '"clipping-selection"', "Reader drags out selections as clipping payloads");
test.assertIncludes(dragDrop, 'dropTargetType === "desktop"', "the desktop is a clipping drop target");
test.assertIncludes(dragDrop, 'dropTargetType === "editor-insert"', "editable surfaces accept clipping insertion");
test.assertIncludes(dragDrop, 'dragData.type === "clipping-selection"', "Clipping drops are recognized by type");
test.assertIncludes(projectDisk, 't("kind_clipping")', "Project Disk renders the Clipping File kind label");
test.assertIncludes(finderObjects, "function renderClippingFileInfo", "Get Info renders clipping metadata from the lazy module");
test.assertIncludes(finderObjects, "function insertClippingIntoEditor", "insertion runs through one policy function");
test.assertIncludes(finderObjects, "allowQuote === false", "no-direct-quote clippings are refused at the drop");
test.assertIncludes(finderObjects, "drop point", "the insertion target follows the drop point, not activeElement");
test.assertIncludes(html, 'id="info-finder-objects-block"', "Get Info hosts a shared finder-object detail block");
test.assertIncludes(html, 'id="question-sheet-body"', "Question Sheet is one of the receiving surfaces");
test.assertIncludes(en, "clipping_drop_no_quote:", "the no-quote refusal is translated in English");
test.assertIncludes(zh, "clipping_drop_no_quote:", "the no-quote refusal is translated in Chinese");

test.finish();
