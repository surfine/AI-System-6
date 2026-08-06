// Finder Alias: a durable pointer to a project file. The target is resolved by
// id, so moving or renaming the original inside the Project Hard Disk keeps the
// alias working; a deleted or trashed target reads as broken. Get Info offers
// Show Original and Replace Original…, and backups remap alias targets.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("alias");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const finderObjects = read("app/features/finder-objects.js");
const documentsChat = read("app/features/documents-chat.js");
const projectDisk = read("app/features/project-disk.js");
const menus = read("app/data/menus.js");
const actions = read("app/core/actions.js");
const windowManager = read("app/core/window-manager.js");
const backup = read("app/core/project-disk-backup.js");

test.assertIncludes(en, 'kind_alias: "Alias"', "English UI names the Alias object");
test.assertIncludes(zh, 'kind_alias: "替身"', "Chinese UI uses the Classic Mac term 替身");
test.assertIncludes(en, "make_alias:", "English File menu names Make Alias");
test.assertIncludes(zh, "make_alias:", "Chinese File menu names Make Alias");
test.assertIncludes(en, "alias_show_original:", "Get Info offers Show Original");
test.assertIncludes(en, "alias_replace_original:", "Get Info offers Replace Original…");

test.assertIncludes(finderObjects, "function createAliasFile", "aliases are created through a single factory");
test.assertIncludes(finderObjects, 'aliasTarget: { kind: "file", id: source.id }', "aliases store their target kind and id");
test.assertIncludes(finderObjects, "function resolveAliasTarget", "aliases resolve through a single policy function");
test.assertIncludes(finderObjects, "function openAliasFile", "opening an alias opens its original");
test.assertIncludes(finderObjects, "function replaceAliasWithOriginal", "Replace Original materializes the target in place");
test.assertIncludes(finderObjects, "copy.id = file.id", "Replace Original keeps the alias's own identity stable");
test.assertIncludes(finderObjects, "function makeAliasForFinderSelection", "Make Alias works from a Finder selection");
test.assertIncludes(finderObjects, "function renderAliasFileInfo", "Get Info renders alias status from the lazy module");

test.assertIncludes(menus, 'menuItem("make-alias"', "the File menu declares Make Alias");
test.assertIncludes(actions, '"make-alias":', "Make Alias has a command handler");
test.assertIncludes(windowManager, '"make-alias":', "Make Alias is gated by Finder selection availability");
test.assertIncludes(projectDisk, 't("kind_alias")', "Project Disk renders the Alias kind label");
test.assertIncludes(documentsChat, "withFinderObjects", "alias opens load the lazy finder-objects module");

test.assertIncludes(backup, 'file.type === "alias"', "backup validation understands alias records");
test.assertIncludes(backup, 'key === "aliasTarget"', "backup import remaps alias target ids");

test.finish();
