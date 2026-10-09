// 文字亮室 — the develop model, executed. These are the rules the rework rests
// on, run against the real modules in a bare vm: who may write a document, what
// a preset carries to another one, how a layer's prompt file becomes the text a
// layer sends, what a layer changed, and which lines a selection means.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("darkroom-develop");
const source = read("app/core/darkroom-develop.js");

test.assertNotIncludes(source, "document.", "the develop model never touches the DOM");
test.assertNotIncludes(source, "indexedDB", "the develop model never touches storage");
test.assertNotIncludes(source, "localStorage", "the develop model never touches storage");
test.assertNotIncludes(source, "fetch(", "the develop model never calls a model");
test.assertNotIncludes(source, "t(\"", "the develop model never touches translations");

const context = vm.createContext({ window: {}, structuredClone });
vm.runInContext(read("app/core/word-diff.js"), context);
vm.runInContext(source, context);
const D = context.window.AISystem6DarkroomDevelop;

// ---- Who may write: the decision table ------------------------------------------------
const base = { leaseMode: "writer", found: true, isDraft: false, isRouteManuscript: false, phase: "", openIn: "", routeStop: "" };
const decide = (over) => D.darkroomWriteDecision({ ...base, ...over });
const row = (name, over, expected) => {
  const got = decide(over);
  test.assert(
    got.canWrite === expected.canWrite && got.owner === expected.owner && got.path === expected.path && got.reason === expected.reason,
    `${name} -> ${JSON.stringify(got)}`
  );
};

row("Quick Draft's own draft is written through Quick Draft", { isDraft: true }, { canWrite: true, owner: "quickDraft", path: "draft", reason: "" });
row("a lease in handoff takes no new write, even on the draft", { isDraft: true, leaseMode: "handoff" }, { canWrite: false, owner: "lease", path: "", reason: "handoff" });
row("a read-only window may still write: the lease holds the connection, not the permission", { isDraft: true, leaseMode: "readonly" }, { canWrite: true, owner: "quickDraft", path: "draft", reason: "" });
row("a document that is gone cannot be written", { found: false }, { canWrite: false, owner: "none", path: "", reason: "missing" });
row("a plain document held by TeachText is written through TeachText", { openIn: "teachText" }, { canWrite: true, owner: "teachText", path: "editor", reason: "" });
row("a plain document nobody is editing is written to its record", {}, { canWrite: true, owner: "file", path: "record", reason: "" });
row("the route document while drafting belongs to Section Drafts", { isRouteManuscript: true, phase: "drafting", openIn: "teachText" }, { canWrite: false, owner: "sectionDrafts", path: "", reason: "route-owned" });
row("drafting still belongs to Section Drafts when the writer's caret is in the manuscript", { isRouteManuscript: true, phase: "drafting", routeStop: "teachText" }, { canWrite: false, owner: "sectionDrafts", path: "", reason: "route-owned" });
row("the route document in the manuscript phase is written through the manuscript when it holds it", { isRouteManuscript: true, phase: "manuscript", openIn: "teachText" }, { canWrite: true, owner: "teachText", path: "editor", reason: "" });
row("the route document in review is written through the manuscript when it holds it", { isRouteManuscript: true, phase: "review", openIn: "teachText" }, { canWrite: true, owner: "teachText", path: "editor", reason: "" });
row("the caret in the manuscript counts as the manuscript holding the route document", { isRouteManuscript: true, phase: "manuscript", routeStop: "teachText" }, { canWrite: true, owner: "teachText", path: "editor", reason: "" });
row("the route document is never written around its owner: not open in the manuscript means preview only", { isRouteManuscript: true, phase: "review" }, { canWrite: false, owner: "teachText", path: "", reason: "open-in-owner" });
row("the route document with no phase known is previewed, not guessed at", { isRouteManuscript: true, phase: "", openIn: "teachText" }, { canWrite: false, owner: "teachText", path: "", reason: "route-unknown" });
row("a handoff lease outranks a free document", { leaseMode: "handoff" }, { canWrite: false, owner: "lease", path: "", reason: "handoff" });
row("the caret elsewhere does not make a plain document the route's", { routeStop: "outline" }, { canWrite: true, owner: "file", path: "record", reason: "" });
test.assert(D.darkroomWriteDecision().canWrite === true, "an empty question answers like a plain free document, never throws");

// ---- Layer prompt files: a stop picks the wording --------------------------------------
const body = [
  "Reader's Eye: read it cold.",
  "",
  "[1] Light touch: fix one thing.",
  "",
  "[2] Standard: merge or tune.",
  "",
  "[3] Strong: reorder and reword.",
].join("\n");
const parsed = D.parseLayerPrompt(body);
test.assert(parsed.common.length === 1 && parsed.steps[1].startsWith("Light touch") && parsed.steps[3].startsWith("Strong"), "a prompt file splits into its common text and its three stops");
test.assert(D.layerPromptText(parsed, 1) === "Reader's Eye: read it cold.\n\nLight touch: fix one thing.", "stop 1 sends the common text and the light wording only");
test.assert(D.layerPromptText(parsed, 3).endsWith("Strong: reorder and reword.") && !D.layerPromptText(parsed, 3).includes("Light touch"), "stop 3 sends the strong wording and not the others");
test.assert(D.layerPromptText(parsed, 9) === D.layerPromptText(parsed, 2), "an unknown stop reads as the standard one");
const bare = D.parseLayerPrompt("A file the writer rewrote by hand, with no stops.");
test.assert(D.layerPromptText(bare, 1) === D.layerPromptText(bare, 3) && D.layerPromptText(bare, 2).startsWith("A file the writer"), "a file with no stops is used whole at every stop");
const clean = D.parseLayerPrompt("清稿：只做四件事。");
test.assert(D.layerPromptText(clean, 2) === "清稿：只做四件事。", "a layer with no strength has only its common text");

// ---- Presets ---------------------------------------------------------------------------------
const settings = {
  layers: [
    { kind: "luoluo", on: true, step: 3, scope: [{ start: 2, end: 3 }] },
    { kind: "clean", on: true, step: 2, scope: [] },
    { kind: "mingming", on: false, step: 1, scope: [] },
    { kind: "hkrr", on: false, step: 2, scope: [{ start: 1, end: 1 }], note: "kept" },
  ],
  protected: [{ start: 9, end: 9 }],
  disabled: true,
};
const spoken = D.darkroomPresetFromSettings("口播版", settings, { id: "p1", now: "T" });
test.assert(spoken.name === "口播版" && spoken.layers.map((layer) => `${layer.kind}:${layer.step}`).join() === "luoluo:3,clean:2", "a preset is the layers that are on, in stack order, with their stops");
test.assert(!JSON.stringify(spoken).includes("scope") && !JSON.stringify(spoken).includes("protected"), "a preset carries no scope and no locks: they are line numbers of one text");
test.assert(D.darkroomPresetFromSettings("空", { layers: [{ kind: "clean", on: false, step: 2 }] }) === null, "a stack with nothing on makes no preset");
test.assert(D.normalizeDarkroomPreset({ name: "x", layers: [{ kind: "nonsense" }] }) === null, "unknown kinds are not a preset");
test.assert(D.normalizeDarkroomPreset({ name: "x".repeat(100), layers: [{ kind: "clean" }] }).name.length === 40, "a preset name is cut to what a menu row can show");

const target = {
  layers: [
    { kind: "mingming", on: true, step: 2, scope: [{ start: 4, end: 5 }] },
    { kind: "hkrr", on: true, step: 3, scope: [] },
  ],
  protected: [{ start: 7, end: 7 }],
  disabled: true,
};
const applied = D.applyDarkroomPreset(target, spoken);
test.assert(applied.layers.slice(0, 2).map((layer) => `${layer.kind}:${layer.on}:${layer.step}`).join() === "luoluo:true:3,clean:true:2", "a preset's layers come first, in its order, with its stops");
test.assert(applied.layers.slice(2).every((layer) => layer.on === false) && applied.layers.slice(2).map((layer) => layer.kind).join() === "mingming,hkrr", "the document's other layers stay, after them, switched off");
test.assert(applied.layers.every((layer) => !layer.scope.length || layer.on === false), "a preset's layers apply to the whole document; an old scope survives only on a layer that is off");
test.assert(applied.protected.length === 1 && applied.protected[0].start === 7, "the document's own locks are kept");
test.assert(applied.disabled === false, "applying a preset switches the adjustments back on");
test.assert(target.layers[0].on === true && target.disabled === true, "applying a preset never mutates the settings it was given");
const publish = D.darkroomPresetFromSettings("公众号版", { layers: [{ kind: "mingming", on: true, step: 2 }, { kind: "hkrr", on: true, step: 2 }] });
const onBlank = D.applyDarkroomPreset({ layers: [], protected: [], disabled: false }, publish);
test.assert(onBlank.layers.map((layer) => layer.kind).join() === "mingming,hkrr", "a preset applies to a document that has no stack yet");
const store = D.darkroomPresetsWith(D.darkroomPresetsWith([], spoken), publish);
test.assert(store.length === 2, "presets accumulate");
test.assert(D.darkroomPresetsWith(store, { ...spoken, layers: [{ kind: "density", on: true, step: 1 }] }).length === 2, "saving under an existing name replaces it");
test.assert(D.darkroomPresetsWithout(store, "p1").length === 1, "a preset can be removed by id");
test.assert(D.darkroomPresetsWith(Array.from({ length: 30 }, (_, n) => ({ name: `p${n}`, layers: [{ kind: "clean" }] })), publish).length === 24, "the list is bounded");

const copied = D.copyDarkroomSettings(settings, target);
test.assert(copied.layers.slice(0, 4).map((layer) => `${layer.kind}:${layer.on}`).join() === "luoluo:true,clean:true,mingming:false,hkrr:false", "copied settings keep the order and the switches");
test.assert(copied.layers.every((layer) => (layer.scope || []).length === 0), "a copy carries no scope");
test.assert(copied.protected[0].start === 7, "a copy leaves the target's own locks alone");
test.assert(copied.disabled === true, "a copy carries the bypass switch");

// ---- What changed -----------------------------------------------------------------------------------
const compare = D.darkroomCompare("今天发布会很顺利。我们展示了新机器。", "今天发布会很顺利。我们当场演示了新机器。");
test.assert(compare.changed && compare.before.some((run) => run.changed) && compare.after.some((run) => run.changed), "a compare marks the changed words on both sides");
test.assert(compare.before.map((run) => run.text).join("") === "今天发布会很顺利。我们展示了新机器。" && compare.after.map((run) => run.text).join("") === "今天发布会很顺利。我们当场演示了新机器。", "the runs on each side add back up to exactly that side's text");
test.assert(compare.after.filter((run) => run.changed).map((run) => run.text).join("").includes("当场"), "the words the layer put in are the marked ones");
test.assert(D.darkroomCompare("一样", "一样").changed === false, "identical texts report no change");
const changes = D.darkroomLayerChanges([
  { kind: "clean", input: "嗯 今天 下雨", output: "今天下雨", cached: false },
  { kind: "density", input: "今天下雨", output: "今天下雨", cached: true },
  { kind: "hkrr", input: "x", output: "x", skipped: true },
]);
test.assert(changes[0].changed && changes[0].removed > 0, "a layer that cut words says how many");
test.assert(!changes[1].changed && changes[1].cached === true, "a layer that handed the text back says it changed nothing, and that it was reused");
test.assert(changes[2].skipped === true && changes[2].changed === false, "a skipped layer stays in the list as skipped");

// ---- Selection ----------------------------------------------------------------------------------------
const doc = "第一行。\n第二行有一句重要的话。\n第三行。\n\n第五行结尾。";
const one = D.lineRangesForSelectedText(doc, "重要的话");
test.assert(one.reason === "" && one.ranges[0].start === 2 && one.ranges[0].end === 2, "words on one line mean that line");
const span = D.lineRangesForSelectedText(doc, "第二行有一句重要的话。 第三行。");
test.assert(span.ranges[0].start === 2 && span.ranges[0].end === 3, "a selection across a line break means both lines, with the break collapsed");
test.assert(D.lineRangesForSelectedText(doc, "不存在的话").reason === "not-found", "words that are not in the text answer not-found, not a guess");
test.assert(D.lineRangesForSelectedText("甲乙。\n甲乙。", "甲乙").reason === "ambiguous", "words that appear twice answer ambiguous, not the first match");
test.assert(D.lineRangesForSelectedText(doc, "   ").reason === "empty", "an empty selection answers empty");
test.assert(JSON.stringify(D.darkroomRangesFromLines([5, 3, 4, 4, 9, 0])) === JSON.stringify([{ start: 3, end: 5 }, { start: 9, end: 9 }]), "line numbers merge into sorted ranges");

// ---- Compare sources -----------------------------------------------------------------------------------
const sources = D.darkroomCompareSources(
  { negative: "底片", versions: [{ id: "v1", body: "第一版", name: "初稿" }, { id: "v2", body: "第二版" }, { id: "v3", body: "  " }] },
  [{ label: "开关调整层", body: "步骤前" }],
  { negative: "底片", step: "步骤" }
);
test.assert(sources[0].id === "negative" && sources[1].id === "version:v2" && sources[2].id === "version:v1", "the negative first, then versions newest first");
test.assert(sources.at(-1).kind === "step" && sources.at(-1).label.includes("开关调整层"), "history steps are sources too");
test.assert(!sources.some((entry) => entry.id === "version:v3"), "a version with no text is not a source");

test.finish();
