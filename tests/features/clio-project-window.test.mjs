// ClioProject 项目表 — the window half of the plan.
//
// The model (app/core/clio-project.js) is the authority and has its own
// contract; this one holds the window to the model's rules: the plan is
// derived and never stored, only ticks and typed dates persist, the bolded
// run is "the chain blocking the handoff" and never a critical path, and the
// name ClioProject stays untranslated in both languages.

import vm from "node:vm";

import { createFeatureTest, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";
import { lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";

const test = createFeatureTest("clio-project-window");

const source = read("app/features/clio-project-window.js");
const config = read("app/core/config.js");
const html = read("index.html");
const actions = read("app/core/actions.js");
const menus = read("app/data/menus.js");
const multiFinder = read("app/core/multi-finder.js");
const windowManager = read("app/core/window-manager.js");
const persistence = read("app/core/persistence-status.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// ---- Lazy, and reachable ----------------------------------------------------
//
// The model file was merged with no manifest entry at all: correct for a pure
// contract, invisible to the product. Both halves are lazy now, and both are
// named by the one loader, so neither can silently stop arriving.
for (const path of ["app/core/clio-project.js", "app/features/clio-project-window.js"]) {
  test.assert(lazyRuntimePaths.includes(path), `${path} is a lazy module, not a boot cost`);
}
test.assertIncludes(
  config,
  'createLazyModuleLoader("AISystem6ClioProjectWindowLoaded", ["app/core/application-shell.js", "app/core/clio-project.js", "app/features/clio-project-window.js"])',
  "one loader names the shell, the model, and the window, in that order"
);

// ---- The window is declared, not improvised ---------------------------------
const record = windowRegistryRecords().clioProject;
test.assert(!!record, "clioProject has a window-registry record");
test.assert(record.app === "clioProject", "and it declares its own application id");
test.assert(record.builtByModule === true, "the markup is built by the module, not shipped in index.html on every boot");
test.assert(!!record.lazy, "the registry knows the window arrives lazily");

test.assertIncludes(multiFinder, 'clioProject: "ClioProject"', "MultiFinder can name the running application");
test.assertMatches(
  windowManager,
  /mobileFullScreenAppIds = new Set\(\[(?:(?!\]\))[\s\S])*"clioProject"/,
  "the phone shell covers ClioProject like its sibling applications"
);
test.assertIncludes(menus, "clioProject: clioProjectMenus", "the application owns a menu set, following ClioChart's pattern");
test.assertIncludes(html, 'data-action="open-clio-project"', "Applications lists the opener beside the other Clio- applications");
test.assertIncludes(actions, '"open-clio-project",{ensure:ensureClioProjectModule}', "the opener is a lazy command, so the first click loads the module");

// ---- The naming law ---------------------------------------------------------
//
// ClioProject is untranslated in BOTH languages, like ClioTalk. The zh label
// may carry a descriptor after the brand, the way ClioChart 可视化 does, but
// the brand itself never becomes Chinese.
test.assertIncludes(en, 'clio_project_label: "ClioProject"', "English names the application ClioProject");
test.assertIncludes(zh, 'clio_project_label: "ClioProject', "Chinese keeps the brand untranslated");
test.assertIncludes(source, 'title: "ClioProject"', "the title bar says ClioProject in every language");

// ---- The chain is never a critical path -------------------------------------
// Prose may explain why the phrase is banned — the model's own header does —
// but no identifier, key, or user-facing string may claim one.
test.assertNotIncludes(source, "criticalPath", "the window does not claim a critical path");
test.assertNotIncludes(en, "Critical path", "no English copy says critical path");
test.assertNotIncludes(zh, "关键路径", "no Chinese copy says 关键路径");
test.assertIncludes(en, "clio_project_chain:", "English names the chain blocking the handoff");
test.assertIncludes(zh, "卡住交付的链", "Chinese calls it 卡住交付的链, verbatim");

// ---- Only decisions persist -------------------------------------------------
//
// The one write path prunes through the model and stores the record on the
// project itself — no new IndexedDB store, and never the diagram.
test.assertIncludes(
  source,
  "project.clioProject = model.pruneClioProjectRecord(",
  "the record rides on the project record and is pruned by the model on the way out"
);
test.assertIncludes(source, "saveDeskState()", "and it is saved the way every other per-project fact is");
test.assertNotIncludes(persistence, "clioProjectNudges", "layout nudges are session-local, never persisted");
test.assertNotIncludes(source, "localStorage", "and no side channel stores what the model says is not kept");

// Dates are hand-typed words, not parsed timestamps.
test.assertIncludes(source, 'date.type = "text"', "the date field takes the writer's words, not a date control");
test.assertNotIncludes(source, 'type = "date"', "no native date picker invents precision");

// Done tasks check off and fold.
test.assertIncludes(source, "clioProjectDoneNodes", "finished work folds into the done group instead of disappearing");

// ---- Auto-layout with nudge and reset, executed ----------------------------
const layoutSlice = source.slice(
  source.indexOf("// Where a card sits"),
  source.indexOf("function renderClioProject"),
);
const context = vm.createContext({ window: {} });
vm.runInContext(layoutSlice, context);

const plan = {
  nodes: [
    { id: "disk", kind: "stop", done: false },
    { id: "rag", kind: "stop", done: false },
    { id: "sectionDrafts", kind: "stop", done: false },
    { id: "section:a1", kind: "section", done: false },
    { id: "section:b2", kind: "section", done: false },
    { id: "projectCd", kind: "stop", done: true },
  ],
  edges: [],
};

const positions = vm.runInContext("clioProjectLayout", context)(plan);
test.assert(
  positions.get("disk").y < positions.get("rag").y && positions.get("rag").y < positions.get("sectionDrafts").y,
  "route stops run down the page in route order"
);
test.assert(
  positions.get("section:a1").x > positions.get("sectionDrafts").x,
  "sections hang in a second column beside Section Drafts"
);
test.assert(!positions.has("projectCd"), "a done node folds out of the diagram");

vm.runInContext('clioProjectNudges.set("disk", { dx: 30, dy: 10 })', context);
const nudged = vm.runInContext("clioProjectLayout", context)(plan);
test.assert(
  nudged.get("disk").x === positions.get("disk").x + 30 && nudged.get("disk").y === positions.get("disk").y + 10,
  "a nudge moves exactly the card the writer pushed"
);
test.assert(nudged.get("rag").y === positions.get("rag").y, "and moves nothing else");

vm.runInContext("clioProjectNudges.clear()", context);
const reset = vm.runInContext("clioProjectLayout", context)(plan);
test.assert(
  reset.get("disk").x === positions.get("disk").x && reset.get("disk").y === positions.get("disk").y,
  "Reset Layout returns every card to the derived position"
);

test.finish();
