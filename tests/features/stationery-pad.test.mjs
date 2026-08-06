// Stationery Pad: a project file flagged in Get Info opens as a fresh untitled
// copy instead of the original. The template content and folder survive; the
// copy gets a new identity, timestamps, an untitled name, and no source
// relationships.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("stationery-pad");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const domHandles = read("app/core/dom-handles.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const wireup = read("app/core/wireup.js");
const documentsChat = read("app/features/documents-chat.js");
const projectDisk = read("app/features/project-disk.js");
const finderObjects = read("app/features/finder-objects.js");

test.assertIncludes(html, 'id="info-file-stationery"', "Get Info surface exposes a Stationery Pad checkbox");
test.assertIncludes(en, 'stationery_pad: "Stationery Pad"', "English UI names the Stationery Pad brand");
test.assertIncludes(zh, 'stationery_pad: "Stationery Pad"', "Chinese UI keeps the Stationery Pad brand name");
test.assertIncludes(en, "stationery_pad_hint:", "English UI explains what opening the template does");
test.assertIncludes(zh, "stationery_pad_hint:", "Chinese UI explains what opening the template does");

test.assertIncludes(domHandles, "fileInfoStationeryEl", "Get Info stationery checkbox is wired into the shared DOM handles");
test.assertIncludes(desktopRuntime, "fileInfoStationeryEl.checked", "Get Info reflects the file's stationery flag");
test.assertIncludes(desktopRuntime, "fileInfoStationeryEl.disabled", "Get Info disables Stationery Pad for ineligible objects");
test.assertIncludes(desktopRuntime, 'item.artifactKind', "derived artifacts cannot be flagged as templates");
test.assertIncludes(wireup, "fileInfoItem.stationery = fileInfoStationeryEl.checked", "Get Info writes the flag back to the file record");
test.assertIncludes(wireup, "saveDeskState()", "flag changes persist through the shared desk save");

test.assertIncludes(finderObjects, "function createStationeryCopy", "opening a stationery file goes through a single copy factory");
test.assertMatches(finderObjects, /copy\.id = crypto\.randomUUID\(\)/, "stationery copies get a fresh identity");
test.assertMatches(finderObjects, /copy\.name = nextAvailableFileName\(t\("untitled"\), file\.folderId\)/, "stationery copies are untitled documents in the same folder");
test.assertIncludes(finderObjects, "copy.stationery = false", "the copy is a normal document, not another template");
test.assertMatches(finderObjects, /stationeryResetFields[\s\S]*"parentChatId"[\s\S]*"sourceFileId"/, "stationery copies drop source relationships");
test.assertIncludes(documentsChat, "openProjectFileWithStationery(file)", "documents-window open routes stationery files through the copy helper");
test.assertIncludes(projectDisk, "openProjectFileWithStationery(file)", "Project Disk open routes stationery files through the copy helper");
test.assertIncludes(finderObjects, "isStationeryCapableFile", "stationery eligibility has a single policy function");
test.assertIncludes(documentsChat, "withFinderObjects", "the lazy finder-objects module is loaded on first use");

test.finish();
