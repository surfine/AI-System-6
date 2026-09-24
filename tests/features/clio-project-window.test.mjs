// ClioProject 项目表 — the window half of the plan.
//
// The model (app/core/clio-project.js) is the authority and has its own
// contract; this one holds the window to the model's rules and to the 08-21
// spec it was rebuilt against on 2026-09-23: the plan is derived and never
// stored, only the writer's decisions persist, the bolded run is "the chain
// blocking the handoff" and never a critical path, two views switch from the
// View menu, one click selects and a double-click opens, and the name
// ClioProject stays untranslated in both languages.

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
const styleManifest = read("tooling/style-manifest.mjs");
const css = read("styles/99-clio-project.css");
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
  'createLazyModuleLoader("AISystem6ClioProjectWindowLoaded", ["app/core/application-shell.js", "app/core/clio-project.js", "app/features/clio-project-window.js"], false, ["styles.clio-project.css"])',
  "one loader names the shell, the model, the window, and the window's own sheet"
);
// The sheet paid for the rebuild: it left the boot bundle, so a desk that never
// opens the plan never downloads it.
test.assertIncludes(styleManifest, '"styles/99-clio-project.css"', "the ClioProject sheet is a lazy style bundle");
test.assertNotIncludes(read("styles/10-windows.css"), ".clio-project-", "and no ClioProject rule rides the boot stylesheet");
for (const allowlist of ["apps/server/server/static.js", "tooling/lib/paths.mjs", "tooling/web-release-manifest.mjs", "tooling/check-release-assets.mjs", "tooling/deploy-web.mjs", "tooling/verify-web-release-safety.mjs", "platform/web/install-release.sh", "package.json"]) {
  test.assertIncludes(read(allowlist), "styles.clio-project.css", `${allowlist} serves the lazy sheet`);
}

// ---- The window is declared, not improvised ---------------------------------
const record = windowRegistryRecords().clioProject;
test.assert(!!record, "clioProject has a window-registry record");
test.assert(record.app === "clioProject", "and it declares its own application id");
test.assert(record.builtByModule === true, "the markup is built by the module, not shipped in index.html on every boot");
test.assert(!!record.lazy, "the registry knows the window arrives lazily");

test.assertIncludes(read("app/core/app-admissions.js"), 'multiFinder: "ClioProject"', "MultiFinder can name the running application from the admission table");
test.assertMatches(
  windowManager,
  /mobileFullScreenAppIds = new Set\(\[(?:(?!\]\))[\s\S])*"clioProject"/,
  "the phone shell covers ClioProject like its sibling applications"
);
test.assertIncludes(source, 'window.AISystem6RegisterApplicationMenuSet?.("clioProject", CLIO_PROJECT_MENUS)', "the application brings its own menu set when it loads, following ClioChart's pattern");
test.assertNotIncludes(menus, "clioProjectMenus", "so the boot menu table carries none of its rows");
test.assertIncludes(html, 'data-action="open-clio-project"', "Applications lists the opener beside the other Clio- applications");
test.assertIncludes(read("app/core/app-admissions.js"), '"open-clio-project"', "the opener is admitted with its loader, so the first click loads the module");

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

// ---- The 08-21 spec, held --------------------------------------------------
//
// Two views of one model from the View menu, with the current one checked.
test.assertMatches(
  source,
  /menu\("view", "menu_view", \[\s*menuItem\("clio-project-view-plan"[^\n]*clioProjectView: "plan"[\s\S]*?clioProjectView: "calendar"/,
  "View switches Plan and All Disks"
);
test.assertIncludes(windowManager, "btn.dataset.clioProjectView", "and the menu checks the view that is showing");
for (const command of ["clio-project-add-task", "clio-project-mark-done", "clio-project-open-node", "clio-project-reset-layout"]) {
  test.assertIncludes(source, `menuItem("${command}"`, `the Plan menu carries ${command}`);
  test.assertIncludes(source, `"${command}": {`, `and the window answers ${command}`);
}

// Opened by a button in the Project Hard Disk window, beside Add… and Backup….
test.assertMatches(
  html,
  /data-action="open-project-backup"[^\n]*\n\s*<button[^>]*data-action="open-clio-project" data-i18n="project_plan_action"/,
  "the Project Hard Disk window opens its plan from the button row"
);
test.assertIncludes(en, 'project_plan_action: "Plan…"', "English names the button");
test.assertIncludes(zh, 'project_plan_action: "项目表…"', "Chinese names it too");

// One click selects; double-click (or Return) opens. A single click on a card
// never opens a window, the rule every other object on this desk follows.
const clickHandler = source.slice(source.indexOf('parts.root.addEventListener("click"'), source.indexOf('parts.canvas.addEventListener("dblclick"'));
test.assertIncludes(clickHandler, "selectClioProjectNode(card.dataset.nodeId)", "a click on a card selects it");
test.assertNotIncludes(clickHandler, "openClioProjectNode(card", "and does not open it");
test.assertIncludes(source, 'parts.canvas.addEventListener("dblclick"', "a double-click opens");

// Editing lives in one Get Info pane, not an input on every card.
const canvasRender = source.slice(source.indexOf("function renderClioProjectCanvas"), source.indexOf("function clioProjectLabeledField"));
test.assertNotIncludes(canvasRender, '"text"', "no card carries a text field");
test.assertIncludes(source, "function renderClioProjectInfo", "the selected node is edited in the Get Info pane");

// The first-open question is asked through the model, which remembers the answer.
test.assertIncludes(source, "model.clioProjectRecordIsUntouched(", "the question is asked only of an untouched plan");
test.assertIncludes(source, "clioProjectModel().answerClioProjectFirstLook(", "and the answer is stored by the model");

// An unstamped section is asked for through the Outline's own stamping pass.
const stamping = source.slice(source.indexOf("function stampClioProjectSections"), source.indexOf("function clioProjectIsFront"));
test.assertIncludes(stamping, "ensureMarkdownSectionIds(project.outline", "opening the plan stamps unstamped sections on the record, with the outline's own pure stamp");
test.assertIncludes(stamping, "setProjectOutlineMarkdown(project, stamped.markdown)", "written through the one outline setter");
// The Writing Flow's stamping pass dispatches an input event on the Outline
// field; in the manuscript phase that wrote the manuscript into the outline.
test.assertNotIncludes(stamping.replace(/\/\/.*$/gm, ""), "stampOutlineSectionIds(", "so the plan never calls it");
test.assertNotIncludes(stamping, "dispatchEvent", "and dispatches nothing");
test.assertIncludes(stamping, "document.activeElement === outlineContentEl", "and never stamps under the writer's caret");

// Executed: only ids are added, and a stamped outline is left alone.
const stampContext = vm.createContext({
  window: { AISystem6ClioProject: null },
  document: { activeElement: null },
  saveDeskState: () => { stampContext.saved = (stampContext.saved || 0) + 1; },
});
vm.runInContext(read("app/core/clio-project.js"), stampContext);
vm.runInContext(read("app/core/markdown.js"), stampContext);
vm.runInContext(`${source.slice(source.indexOf("function clioProjectModel"), source.indexOf("function clioProjectPlanFor"))}
function setProjectOutlineMarkdown(project, markdown) { project.outline = String(markdown || "").trim(); }
${stamping}`, stampContext);
const stampProject = { outline: "# Title\n\n## One\n\nBody one.\n\n## Two {#b2e9d4}\n\nBody two." };
stampContext.getActiveProject = () => stampProject;
test.assert(vm.runInContext("stampClioProjectSections()", stampContext) === true, "an unstamped section is stamped when the plan opens");
test.assertMatches(stampProject.outline, /^## One \{#[0-9a-f]{6}\}$/m, "the heading gains an id");
test.assert(stampProject.outline.replace(/ \{#[0-9a-f]{6}\}/g, "") === "# Title\n\n## One\n\nBody one.\n\n## Two\n\nBody two.", "and nothing but ids changes");
test.assert(stampContext.saved === 1, "and the desk is saved once");
test.assert(vm.runInContext("stampClioProjectSections()", stampContext) === false && stampContext.saved === 1, "a stamped outline is left alone");

// The calendar is read-only: it has no date field and writes nothing.
const calendarRender = source.slice(source.indexOf("function renderClioProjectCalendar"), source.indexOf("// ---- Commands"));
test.assertNotIncludes(calendarRender, "commitClioProject", "the calendar never writes");
test.assertNotIncludes(calendarRender, '"input"', "and offers nothing to edit");

// Bold is the only emphasis the chain gets, in the card, the line and the type.
test.assertIncludes(css, ".clio-project-node.is-blocking {", "a blocking card is drawn heavier");
test.assertIncludes(css, ".clio-project-edges path.is-blocking {", "so is a blocking line");
test.assertIncludes(css, ".clio-project-node.is-milestone {", "route stops are milestones, with MacProject's rounded box");

// ---- "Wrote something" = the word count changed that day, executed ---------
const writing = persistence.slice(
  persistence.indexOf("function noteProjectWritingDay"),
  persistence.indexOf("async function persistDeskState"),
);
const writingContext = vm.createContext({ chatFiles: [{ id: "m1", body: "manuscript" }] });
vm.runInContext(writing, writingContext);
const note = vm.runInContext("noteProjectWritingDay", writingContext);
const day = (text) => new Date(`${text}T10:00:00`);
const disk = { questionSheet: "abc", drafts: [{ body: "de", insertedFileId: "m1" }] };
note(disk, day("2026-09-20"));
test.assert(JSON.stringify(disk.writingDays) === '[["2026-09-20",15]]', "the first save records the count it found, manuscript included");
note(disk, day("2026-09-21"));
test.assert(disk.writingDays.length === 1, "a day with no change adds nothing");
disk.questionSheet += "f";
note(disk, day("2026-09-22"));
disk.questionSheet += "g";
note(disk, day("2026-09-22"));
test.assert(JSON.stringify(disk.writingDays.at(-1)) === '["2026-09-22",17]' && disk.writingDays.length === 2, "one entry per day, holding that day's last count");
test.assertIncludes(persistence, "noteProjectWritingDay(getActiveProject());", "every desk save notes the mounted project's count");
const calendarDays = source.slice(source.indexOf("function clioProjectWritingDays"), source.indexOf("function renderClioProjectCalendar"));
test.assertIncludes(calendarDays, "for (let index = 1;", "the calendar never counts the first entry, which is a count found, not a change");

// ---- Auto-layout with nudge and reset, executed ----------------------------
const layoutSlice = source.slice(
  source.indexOf("// Where a card sits"),
  source.indexOf("// ---- Render"),
);
const context = vm.createContext({ window: {} });
vm.runInContext(layoutSlice, context);

const node = (id, kind, done = false, parent = "") => ({ id, kind, done, parent, addressable: true });
const plan = {
  nodes: [
    node("disk", "stop", true),
    node("rag", "stop", true),
    node("questionSheet", "stop"),
    node("sectionDrafts", "stop"),
    node("teachText", "stop"),
    node("section:a1", "section"),
    node("section:b2", "section"),
    node("section:c3", "section", true),
    node("task:1", "own", false, "section:a1"),
    node("task:2", "own", false, "rag"),
  ],
  edges: [],
};

const layout = vm.runInContext("clioProjectLayout", context)(plan);
const at = (id) => layout.positions.get(id);
test.assert(!!at("__done") && at("__done").x < at("questionSheet").x, "finished work folds into the done pile, left of where the project is");
test.assert(!layout.positions.has("disk") && !layout.positions.has("section:c3"), "a done card leaves the diagram");
test.assert(
  at("questionSheet").x < at("sectionDrafts").x && at("sectionDrafts").x < at("section:a1").x && at("section:a1").x < at("teachText").x,
  "the route runs left to right, with the sections between Section Drafts and the manuscript"
);
test.assert(at("section:a1").x === at("section:b2").x && at("section:a1").y < at("section:b2").y, "sections stack as one column, in outline order");
test.assert(at("task:1").y > at("section:a1").y && at("task:1").y < at("section:b2").y, "a task hangs directly under its section");
test.assert(at("task:1").x > at("section:a1").x, "indented, so it reads as hung rather than as a section");
test.assert(at("task:2").x > at("__done").x && at("task:2").y > at("__done").y, "a task whose parent is finished hangs under the done pile, where its parent went");
test.assert(
  Math.abs((at("questionSheet").y + at("questionSheet").h / 2) - (at("teachText").y + at("teachText").h / 2)) < 1,
  "every stop sits on one spine"
);

vm.runInContext('clioProjectNudges.set("questionSheet", { dx: 30, dy: 10 })', context);
const nudged = vm.runInContext("clioProjectLayout", context)(plan).positions;
test.assert(
  nudged.get("questionSheet").x === at("questionSheet").x + 30 && nudged.get("questionSheet").y === at("questionSheet").y + 10,
  "a nudge moves exactly the card the writer pushed"
);
test.assert(nudged.get("teachText").x === at("teachText").x, "and moves nothing else");

vm.runInContext("clioProjectNudges.clear()", context);
const reset = vm.runInContext("clioProjectLayout", context)(plan).positions;
test.assert(
  reset.get("questionSheet").x === at("questionSheet").x && reset.get("questionSheet").y === at("questionSheet").y,
  "Reset Layout returns every card to the derived position"
);
test.assertIncludes(source, "renderClioProjectEdges(parts, plan, clioProjectLayout(plan)", "a drag redraws only the arrows until the card is let go");

test.finish();
