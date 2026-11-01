// Finder Alias: a durable pointer to a project file. The target is resolved by
// id, so moving or renaming the original inside the Project Hard Disk keeps the
// alias working; a deleted or trashed target reads as broken. Get Info offers
// Show Original and Replace Original…, and backups remap alias targets.
// Finder operations (Rename, Get Info, Trash, moves) operate on the Alias
// itself; content consumers (Droplets, ClioTalk attachments) read the original.

import vm from "node:vm";
import { webcrypto } from "node:crypto";

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
test.assertIncludes(en, "alias_replace_file_only:", "English explains why Replace stays gated for non-file targets");
test.assertIncludes(zh, "alias_replace_file_only:", "Chinese explains why Replace stays gated for non-file targets");

test.assertIncludes(finderObjects, "function createAliasFile", "aliases are created through a single factory");
test.assertIncludes(finderObjects, 'aliasTarget: { kind: "file", id: source.id }', "aliases store their target kind and id");
test.assertIncludes(finderObjects, "function resolveAliasTarget", "aliases resolve through a single policy function");
test.assertIncludes(finderObjects, 'alias.kind === "scrap"', "aliases resolve Scrapbook entries");
test.assertIncludes(finderObjects, 'alias.kind === "reference"', "aliases resolve project references");
test.assertNotMatches(finderObjects, /kind === "docmapNode"/, "aliases never point at derived DocMap state");
test.assertIncludes(finderObjects, "function resolveProjectFileForUse", "content consumers resolve through one shared function");
test.assertIncludes(finderObjects, "resolveProjectFileForUse,", "the resolver ships on the existing AISystem6FinderObjects API");
test.assertIncludes(finderObjects, '"broken-alias"', "the resolver names broken aliases explicitly");
test.assertIncludes(finderObjects, '"non-file-alias"', "the resolver names non-document aliases explicitly");
test.assertIncludes(finderObjects, "function openAliasFile", "opening an alias opens its original");
test.assertIncludes(finderObjects, "function replaceAliasWithOriginal", "Replace Original materializes the target in place");
test.assertIncludes(finderObjects, "copy.id = file.id", "Replace Original keeps the alias's own identity stable");
test.assertIncludes(finderObjects, "function makeAliasForFinderSelection", "Make Alias works from a Finder selection");
test.assertIncludes(finderObjects, "function renderAliasFileInfo", "Get Info renders alias status from the lazy module");
test.assertIncludes(finderObjects, "only file aliases can be replaced", "Replace Original stays gated to file targets");
test.assertIncludes(finderObjects, "function resolveLabelableRecord", "Get Info labels write through the backing record");

test.assertIncludes(menus, 'menuItem("make-alias"', "the File menu declares Make Alias");
test.assertIncludes(actions, '"make-alias":', "Make Alias has a command handler");
test.assertIncludes(windowManager, '"make-alias":', "Make Alias is gated by Finder selection availability");
test.assertIncludes(projectDisk, 't("kind_alias")', "Project Disk renders the Alias kind label");
test.assertIncludes(documentsChat, "withFinderObjects", "alias opens load the lazy finder-objects module");

test.assertIncludes(backup, 'file.type === "alias"', "backup validation understands alias records");
test.assertIncludes(backup, 'key === "aliasTarget"', "backup import remaps alias target ids");

// ---- Runtime behavior -----------------------------------------------------
// These run the real module in a vm with a minimal project-disk state so they
// observe actual function behavior, not just source strings.

const projectId = "project-1";
const original = {
  id: "file-1",
  projectId,
  type: "text",
  name: "Draft",
  body: "Draft body",
};
const alias = {
  id: "alias-1",
  projectId,
  type: "alias",
  name: "Draft alias",
  folderId: null,
  aliasTarget: { kind: "file", id: "file-1" },
};
const chainAlias = {
  id: "alias-2",
  projectId,
  type: "alias",
  name: "Middle alias",
  folderId: null,
  aliasTarget: { kind: "file", id: "alias-1" },
};
const brokenAlias = {
  id: "alias-broken",
  projectId,
  type: "alias",
  name: "Broken alias",
  folderId: null,
  aliasTarget: { kind: "file", id: "file-gone" },
};
const scrap = { id: "scrap-1", projectId, title: "Clip", body: "Evidence" };
const scrapAlias = {
  id: "alias-scrap",
  projectId,
  type: "alias",
  name: "Clip alias",
  folderId: null,
  aliasTarget: { kind: "scrap", id: "scrap-1" },
};
const reference = { id: "ref-1", projectId, name: "Source" };
const referenceAlias = {
  id: "alias-ref",
  projectId,
  type: "alias",
  name: "Source alias",
  folderId: null,
  aliasTarget: { kind: "reference", id: "ref-1" },
};

const context = vm.createContext({
  crypto: webcrypto,
  window: {},
  structuredClone,
  chatFiles: [original, alias, chainAlias, brokenAlias, scrapAlias, referenceAlias],
  scraps: [scrap],
  projectReferences: [reference],
  activeProjectId: projectId,
  isInActiveProject: (item) => item?.projectId === projectId,
  getActiveProject: () => ({ id: projectId }),
  openWindow: () => {},
  setStatus: () => {},
  t: (key) => key,
  saveDeskState: () => {},
  renderDocuments: () => {},
  renderProjectDisks: () => {},
  openTextFile: () => {},
  openChatFileWindow: () => {},
  openProjectFileWithStationery: () => null,
});
vm.runInContext(finderObjects, context);
const resolver = context.window.AISystem6FinderObjects.resolveProjectFileForUse;

const plain = resolver(original);
test.assert(
  plain.selected === original && plain.target === original && plain.reason === "",
  "a plain text file resolves to itself at the content boundary"
);

const viaAlias = resolver(alias);
test.assert(
  viaAlias.selected === alias && viaAlias.target === original && viaAlias.reason === "",
  "an alias resolves to its original for content consumers"
);

const viaChain = resolver(chainAlias);
test.assert(
  viaChain.selected === chainAlias && viaChain.target === original && viaChain.reason === "",
  "a two-level alias chain resolves to the final original"
);

const broken = resolver(brokenAlias);
test.assert(
  broken.selected === brokenAlias && broken.target === null && broken.reason === "broken-alias",
  "a broken alias reports broken-alias with no target"
);

const scrapResolution = resolver(scrapAlias);
test.assert(
  scrapResolution.selected === scrapAlias && scrapResolution.target === null && scrapResolution.reason === "non-file-alias",
  "an alias to a Scrapbook entry never masquerades as a project document"
);

const referenceResolution = resolver(referenceAlias);
test.assert(
  referenceResolution.selected === referenceAlias && referenceResolution.target === null && referenceResolution.reason === "non-file-alias",
  "an alias to a Project Reference never masquerades as a project document"
);

const aliasSnapshot = JSON.stringify(alias);
resolver(alias);
resolver(chainAlias);
resolver(brokenAlias);
test.assert(
  JSON.stringify(alias) === aliasSnapshot,
  "resolving for content never mutates the alias record"
);

test.assert(
  context.resolveLabelableRecord(alias) === alias,
  "Get Info label writes resolve to the alias itself, not its original"
);

test.assertIncludes(
  documentsChat,
  "file.name = name.trim()",
  "Rename still writes the selected Alias record, never auto-resolves the original"
);
test.assertIncludes(
  documentsChat,
  "moveChatFileToTrash()",
  "Trash still removes the selected Alias record, never auto-resolves the original"
);

test.finish();
