// Droplets: real Application-folder icons that accept file drops and run a
// declared command on the dropped files (source -> DocMap, Markdown ->
// slides, draft -> Project CD, article -> review, document -> .md export).
// Every command declares input/output types, permissions, and undoability,
// and runs through one executor, so a drop is validated the same way whatever
// it lands on. A Script Editor was considered and dropped (2026-08-06); these
// declarations describe the Droplets, not a scripting UI. Aliases are
// consumed as their original document; broken or non-document aliases block
// the run before any handler is invoked.

import vm from "node:vm";
import { webcrypto } from "node:crypto";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("droplet");
const manifest = read("scripts/runtime-manifest.mjs");
const scripting = read("app/core/scripting.js");
const config = read("app/core/config.js");
const boot = read("app/core/boot.js");
const app = read("app.js");
const actions = read("app/core/actions.js");
const dragDrop = read("app/core/drag-drop.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const finderObjects = read("app/features/finder-objects.js");

test.assertIncludes(scripting, "window.AISystem6Scripting", "the scripting layer exposes an internal API");
test.assertIncludes(scripting, "inputType:", "scriptable commands declare their input type");
test.assertIncludes(scripting, "outputType:", "scriptable commands declare their output type");
test.assertIncludes(scripting, "requiresProject:", "scriptable commands declare their project requirement");
test.assertIncludes(scripting, "permissions:", "scriptable commands declare their permissions");
test.assertIncludes(scripting, "undoable:", "scriptable commands declare their undoability");
test.assertIncludes(scripting, "async function runScriptableCommand", "every droplet drop runs through one executor");
test.assertIncludes(scripting, "async function resolveDropletFiles", "droplet input resolution loads the finder module and resolves aliases");
test.assertIncludes(scripting, "ensureFinderObjectsModule", "droplet resolution awaits the lazy finder-objects module");
test.assertIncludes(scripting, "resolveProjectFileForUse", "droplet resolution routes through the shared content resolver");
test.assertIncludes(scripting, "seenTargetIds", "dragging an original together with its alias deduplicates by target id");
test.assertIncludes(scripting, "alias_broken", "a broken alias blocks the run with the existing alias status");
test.assertIncludes(scripting, "只接受文稿", "a non-document alias blocks the run with the existing droplet refusal");
test.assertNotIncludes(scripting, "describeScriptableCommand", "no scripting-UI helper survives without a caller");
test.assertNotIncludes(scripting, "showDropletHint", "no droplet hint helper survives without a caller");

// Extending the set was considered and dropped (2026-08-06). A sixth droplet is
// not a new entry in this list — it needs input types that are not project
// objects yet, so it must be its own decision, not a drive-by addition.
test.assert(
  (scripting.match(/^\s{4}id: "droplet-/gm) || []).length === 5,
  "the droplet set stays at the five that work"
);

test.assertIncludes(scripting, "function getDropletItems", "droplets are declared as Application-folder items");
test.assertIncludes(scripting, "dropletAction:", "each droplet carries its command id for drops");
test.assertNotIncludes(app, "getDropletItems()", "Droplets stay drop tools, not top-level applications");
test.assertIncludes(app, 'data-drop-target="droplet"', "droplet icons accept file drops");
test.assertIncludes(app, 'data-balloon-help="balloon_droplet"', "droplet icons explain themselves through Balloon Help");
test.assertIncludes(app, 't("droplets_section")', "the Applications folder groups droplets under a visible section label");
test.assertIncludes(app, "function splitApplicationsSections", "applications split into apps and droplets for the section label");
test.assertIncludes(actions, '"open-droplet"', "opening a droplet shows an explanation instead of doing nothing");
test.assertIncludes(actions, 'startsWith("open-droplet:")', "droplet open actions reach the shared explainer");
test.assertIncludes(en, "droplets_section:", "English names the droplet section");
test.assertIncludes(zh, "droplets_section:", "Chinese names the droplet section");
test.assertIncludes(en, "balloon_droplet:", "English explains droplet icons");
test.assertIncludes(zh, "balloon_droplet:", "Chinese explains droplet icons");
test.assertIncludes(en, "droplet_open_explainer:", "English explains double-clicking a droplet");
test.assertIncludes(zh, "droplet_open_explainer:", "Chinese explains double-clicking a droplet");
test.assertIncludes(dragDrop, 'dropTargetType === "droplet"', "drops are routed to droplets");
test.assertIncludes(dragDrop, "runDropletDrop", "droplet drops run through the scripting executor");
test.assertIncludes(config, "withScripting", "the scripting layer loads on first use");

test.assertIncludes(scripting, "makeDocMapFromCurrentSource", "source -> DocMap droplet");
test.assertIncludes(scripting, "generateMarpMarkdownAndOpenClioStage", "Markdown -> slides droplet");
test.assertIncludes(scripting, "addProjectCdItem", "draft -> Project CD droplet");
test.assertIncludes(scripting, "runClaimCheck", "article -> review droplet");
test.assertIncludes(scripting, "downloadMarkdown", "document -> .md export droplet");
test.assertIncludes(scripting, '"clipping-selection"', "a Reader selection can drop onto a droplet");

test.assertIncludes(manifest, '"app/core/scripting.js"', "the scripting layer is a lazy module");
test.assertNotIncludes(manifest.split("lazyRuntimePaths = [")[0], "app/core/scripting.js", "the scripting layer is not part of the startup bundle list");
test.assertIncludes(boot, "ensureScriptingModule", "droplets become available shortly after boot without blocking it");

// ---- Runtime behavior -----------------------------------------------------
// Runs the real finder-objects and scripting modules in a vm so the droplet
// executor actually resolves aliases, blocks bad targets, and deduplicates
// before a handler sees anything.

const projectId = "project-1";
const statusCalls = [];
const docMapCalls = [];
const cdItems = [];
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

const context = vm.createContext({
  crypto: webcrypto,
  window: {},
  structuredClone,
  chatFiles: [original, alias, brokenAlias, scrapAlias],
  scraps: [scrap],
  projectReferences: [],
  activeProjectId: projectId,
  currentLanguage: "en",
  isInActiveProject: (item) => item?.projectId === projectId,
  ensureFinderObjectsModule: async () => true,
  getActiveProject: () => ({ id: projectId }),
  openWindow: () => {},
  setStatus: (message) => statusCalls.push(message),
  t: (key) => `t:${key}`,
  saveDeskState: () => {},
  openTextFile: () => {},
  ensureDocMapModule: async () => {},
  makeDocMapFromCurrentSource: async (payload) => docMapCalls.push(payload),
  docMapMinDocumentChars: 100,
  ensureSlidesExportModule: async () => {},
  generateMarpMarkdownAndOpenClioStage: async () => {},
  preferredFolderName: () => "",
  addProjectCdItem: (body, name) => {
    const item = { id: `cd-${cdItems.length + 1}`, name, body };
    cdItems.push(item);
    return item;
  },
  runClaimCheck: async () => {},
  downloadMarkdown: () => {},
  createClippingFile: () => null,
});
vm.runInContext(finderObjects, context);
vm.runInContext(scripting, context);
const scriptingApi = context.window.AISystem6Scripting;

test.assert(
  scriptingApi.getDropletItems().length === 5,
  "the five droplet definitions remain the complete runtime set"
);

const resolved = await context.resolveDropletFiles([alias.id]);
test.assert(
  resolved.blocked === false && resolved.files.length === 1 && resolved.files[0].id === original.id,
  "droplet input resolution hands the original document to the command"
);

await scriptingApi.runScriptableCommand("droplet-docmap", { fileIds: [alias.id] });
test.assert(
  docMapCalls.length === 1 && docMapCalls[0].meta?.fileId === original.id,
  "the DocMap handler receives the alias's original, not the alias record"
);

const brokenResolution = await context.resolveDropletFiles([brokenAlias.id]);
test.assert(
  brokenResolution.blocked === true && brokenResolution.reason === "broken-alias" && brokenResolution.files.length === 0,
  "a broken alias blocks the run before any handler is called"
);

const nonFileResolution = await context.resolveDropletFiles([scrapAlias.id]);
test.assert(
  nonFileResolution.blocked === true && nonFileResolution.reason === "non-file-alias" && nonFileResolution.files.length === 0,
  "an alias to a non-document object blocks the run before any handler is called"
);

const deduped = await context.resolveDropletFiles([original.id, alias.id]);
test.assert(
  deduped.blocked === false && deduped.files.length === 1 && deduped.files[0].id === original.id,
  "an original dragged together with its alias collapses to one target"
);

await scriptingApi.runScriptableCommand("droplet-projectcd", { fileIds: [original.id, alias.id] });
test.assert(
  cdItems.length === 1 && cdItems[0].sourceDocumentId === original.id,
  "the Project CD droplet records the final original id, never the alias id"
);

const brokenRun = await scriptingApi.runScriptableCommand("droplet-docmap", { fileIds: [brokenAlias.id] });
test.assert(
  brokenRun === false && docMapCalls.length === 1 && statusCalls.some((message) => message === "t:alias_broken"),
  "a broken alias blocks execution and reports through the existing alias status"
);

const nonFileRun = await scriptingApi.runScriptableCommand("droplet-docmap", { fileIds: [scrapAlias.id] });
test.assert(
  nonFileRun === false && docMapCalls.length === 1 && statusCalls.some((message) => message === "This droplet accepts documents only"),
  "a non-document alias blocks execution with the existing droplet refusal"
);

test.finish();
