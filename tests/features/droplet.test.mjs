// Droplets: real Application-folder icons that accept file drops and run a
// declared command on the dropped files (source -> DocMap, Markdown ->
// slides, draft -> Project CD, article -> review, document -> .md export).
// Every command declares input/output types, permissions, and undoability,
// and runs through one executor, so a drop is validated the same way whatever
// it lands on. A Script Editor was considered and dropped (2026-08-06); these
// declarations describe the Droplets, not a scripting UI.

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

test.assertIncludes(scripting, "window.AISystem6Scripting", "the scripting layer exposes an internal API");
test.assertIncludes(scripting, "inputType:", "scriptable commands declare their input type");
test.assertIncludes(scripting, "outputType:", "scriptable commands declare their output type");
test.assertIncludes(scripting, "requiresProject:", "scriptable commands declare their project requirement");
test.assertIncludes(scripting, "permissions:", "scriptable commands declare their permissions");
test.assertIncludes(scripting, "undoable:", "scriptable commands declare their undoability");
test.assertIncludes(scripting, "async function runScriptableCommand", "every droplet drop runs through one executor");
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
test.assertIncludes(app, "getDropletItems()", "the Applications catalogue includes droplets");
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

test.finish();
