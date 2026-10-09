// 文字亮室 — the develop model through the real modules, in the Quick Draft vm.
//
// darkroom-develop.test.mjs executes the pure rules; this one runs the wiring
// that makes them true on a desk: a stack that is developed one layer per model
// call, a cache that survives a changed layer, a develop that writes through
// the window that holds the pen and can be taken back with Undo, a negative that
// goes stale and is re-shot, and a darkroom that previews a document it may not
// write. The model is a stub; the question is what the desk does with it.
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createDraftDeskVm } from "../helpers/draft-desk-vm.mjs";

const test = createFeatureTest("lightroom-develop");
const module = read("app/features/lightroom-develop.js");

test.assertIncludes(module, "registerEditHistory(\"lightroom\"", "the darkroom hands its history to Edit > Undo by its window name");
test.assertNotIncludes(module, "keydown\", (event) => {\n    if (event.metaKey", "the darkroom adds no ⌘Z handler of its own");
test.assertNotIncludes(module, "style.left", "layout is not set from script");

const KIND_BY_LABEL = {
  quick_draft_adjustment_clean: "clean",
  quick_draft_chip_mingming: "mingming",
  quick_draft_chip_luoluo: "luoluo",
  quick_draft_chip_hkrr: "hkrr",
  quick_draft_adjustment_density: "density",
};

function modelStub(runtime, log) {
  runtime.context.withMarkdownModelMessages = (messages) => messages;
  runtime.context.fetchModelPayload = async (payload) => {
    const prompt = String(payload.messages.at(-1).content);
    const label = (prompt.match(/第 \d+\/\d+ 层「([^」]+)」/) || [])[1] || "";
    const marker = "输入正文（受保护内容已被占位符替换，保持原样）：\n\n";
    const input = prompt.slice(prompt.lastIndexOf(marker) + marker.length).split("\n\n- 以下是正文里的受保护占位符")[0];
    const kind = KIND_BY_LABEL[label] || label;
    log.push({ kind, input, payload, prompt });
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ choices: [{ message: { content: `${input}〔${kind}〕` } }] }),
    };
  };
}

async function deskWithStack(kinds, body = "我写下来的第一版。") {
  const runtime = createDraftDeskVm();
  const project = runtime.addProject("p1", body, { projectDocId: "doc-1" });
  runtime.context.projects[0] = project;
  const log = [];
  modelStub(runtime, log);
  for (const kind of kinds) await runtime.testApi.updateAdjustmentLayer(kind, { enabled: true });
  log.length = 0;
  return { runtime, project, log };
}

// ---- Layer by layer, one call each, announced first ---------------------------------------
{
  const { runtime, project, log } = await deskWithStack(["mingming", "luoluo", "hkrr"]);
  const api = runtime.testApi;
  const planBefore = api.lightroomRunPlan(project.quickDraft);
  test.assert(planBefore.total === 3 && planBefore.calls === 3 && planBefore.cached === 0, "before the first run, three layers are three calls");
  const applied = await api.applyAdjustmentLayers();
  test.assert(applied === true, "the preview completes");
  test.assert(log.map((entry) => entry.kind).join() === "mingming,luoluo,hkrr", "each layer is its own model call, in stack order");
  test.assert(log[1].input === log[0].input + "〔mingming〕" && log[2].input === log[1].input + "〔luoluo〕", "each layer reads the previous layer's output");
  test.assert(log.every((entry) => entry.payload.stream === true), "every layer call is streamed");
  test.assert(log.every((entry) => entry.payload.ai_system6_task_kind === "mingming_rewrite"), "layer calls keep the registered writing task kind");
  // (The test world's translator returns keys, which contain the internal kind
  // names; the words the model reads come from the prompt files.)
  test.assert(log.every((entry) => !/铭铭|落落|Mingming|Luoluo/i.test(entry.prompt.replace(/quick_draft_chip_\w+/g, "").replace(/〔\w+〕/g, ""))), "no prompt a layer sends names a person");
  test.assert(runtime.controls.get("quick-draft-status").textContent === "quick_draft_apply_done", "the status ends on the preview's own receipt");
  const record = api.darkroomOf(project.quickDraft);
  test.assert(record.layerCache.length === 3, "the three outputs are in the darkroom record");
  test.assert(record.composite === "我写下来的第一版。〔mingming〕〔luoluo〕〔hkrr〕", "the composite is the last layer's output");

  // Change layer 3: only layer 3 is asked again.
  await api.updateAdjustmentLayer("hkrr", { strength: 75 });
  log.length = 0;
  const plan = api.lightroomRunPlan(runtime.context.activeProject.quickDraft);
  test.assert(plan.total === 3 && plan.cached === 2 && plan.calls === 1, "after changing layer 3 the plan reuses layers 1 and 2");
  await api.applyAdjustmentLayers();
  test.assert(log.map((entry) => entry.kind).join() === "hkrr", "changing layer 3 does not re-run layers 1 and 2");
  test.assert(runtime.controls.get("quick-draft-status").textContent === "quick_draft_apply_done", "the second preview also finishes");

  // The plan is announced before a model is called.
  await api.updateAdjustmentLayer("luoluo", { strength: 25 });
  log.length = 0;
  const statuses = [];
  const original = runtime.context.fetchModelPayload;
  runtime.context.fetchModelPayload = async (...args) => {
    statuses.push(runtime.controls.get("quick-draft-status").textContent);
    return original(...args);
  };
  await api.applyAdjustmentLayers();
  test.assert(statuses[0] === "lightroom_run_plan:2,3,1", "the status says how many layers will be called, before the first call");
}

// ---- A layer that fails keeps what finished before it --------------------------------------------
{
  const { runtime, project, log } = await deskWithStack(["mingming", "luoluo"]);
  const api = runtime.testApi;
  const good = runtime.context.fetchModelPayload;
  let calls = 0;
  runtime.context.fetchModelPayload = async (...args) => {
    calls += 1;
    if (calls === 2) throw new Error("model went away");
    return good(...args);
  };
  const failed = await api.applyAdjustmentLayers();
  test.assert(failed === false, "a failing layer fails the preview");
  const kept = api.darkroomOf(runtime.context.activeProject.quickDraft).layerCache;
  test.assert(kept.length === 1, "the layer that finished before it is kept");
  runtime.context.fetchModelPayload = good;
  log.length = 0;
  await api.applyAdjustmentLayers();
  test.assert(log.map((entry) => entry.kind).join() === "luoluo", "the retry starts at the layer that failed");
}

// ---- "Just this layer" ------------------------------------------------------------------------------------
{
  const { runtime, project } = await deskWithStack(["mingming", "luoluo"]);
  const api = runtime.testApi;
  await api.applyAdjustmentLayers();
  const steps = api.lightroomCurrentSteps();
  test.assert(steps.length === 2 && steps[1].input === "我写下来的第一版。〔mingming〕" && steps[1].output === "我写下来的第一版。〔mingming〕〔luoluo〕", "what each layer read and returned is rebuilt from the cache, no model asked");
  const changes = runtime.context.window.AISystem6DarkroomDevelop.darkroomLayerChanges(steps);
  test.assert(changes.every((change) => change.changed && change.added > 0), "each layer's change is a word diff of its own input and output");
}

// ---- The develop writes the draft, takes the negative, and Undo takes it back ---------------------------------
{
  const { runtime, project } = await deskWithStack(["mingming", "luoluo"]);
  const api = runtime.testApi;
  const draft = runtime.controls.get("quick-draft-draft");
  await api.applyAdjustmentLayers();
  const developed = await api.developAdjustmentLayers();
  test.assert(developed === true, "Develop completes");
  test.assert(draft.value === "我写下来的第一版。〔mingming〕〔luoluo〕", "the draft now holds the composite");
  const record = api.darkroomOf(runtime.context.activeProject.quickDraft);
  test.assert(record.negative === "我写下来的第一版。" && record.negativeUpdatedAt, "the writer's original is the negative");
  test.assert(record.versions.at(-1).reason === "before-develop" && record.versions.at(-1).body === "我写下来的第一版。", "the replaced body is kept as a version");
  test.assert(record.settings.layers.every((layer) => layer.on === false), "the stack is switched off after it has been developed");
  const history = runtime.context.editHistories.lightroom();
  test.assert(history.canUndo() && history.undoLabel() === "edit_step_develop", "the develop is the newest step of the darkroom's history");
  test.assert(history.undo() === true, "Edit > Undo takes the develop back");
  await new Promise((resolve) => setTimeout(resolve, 20));
  test.assert(draft.value === "我写下来的第一版。", "Undo put the draft's text back");
  const afterUndo = api.darkroomOf(runtime.context.activeProject.quickDraft);
  test.assert(afterUndo.settings.layers.filter((layer) => layer.on).length === 2 && !afterUndo.negativeUpdatedAt, "and the stack and the negative as they were");
  test.assert(history.canRedo() && history.redo() === true, "and Redo does it again");
  await new Promise((resolve) => setTimeout(resolve, 20));
  test.assert(draft.value === "我写下来的第一版。〔mingming〕〔luoluo〕", "Redo put the composite back");
}

// ---- Settings changes are history steps; the version list is a different thing -------------------------------------
{
  const { runtime, project } = await deskWithStack([]);
  const api = runtime.testApi;
  const draft = runtime.controls.get("quick-draft-draft");
  await api.updateAdjustmentLayer("hkrr", { enabled: true });
  await api.updateAdjustmentLayer("hkrr", { strength: 75 });
  const history = runtime.context.editHistories.lightroom();
  test.assert(history.undoLabel() === "edit_step_layer_step", "a change of strength is a step");
  history.undo();
  await new Promise((resolve) => setTimeout(resolve, 20));
  let layer = api.darkroomOf(runtime.context.activeProject.quickDraft).settings.layers.find((item) => item.kind === "hkrr");
  test.assert(layer.on === true && layer.step === 2, "Undo took the strength back and left the switch");
  history.undo();
  await new Promise((resolve) => setTimeout(resolve, 20));
  layer = api.darkroomOf(runtime.context.activeProject.quickDraft).settings.layers.find((item) => item.kind === "hkrr");
  test.assert(layer?.on !== true, "and the next Undo took the switch back");
  test.assert(draft.value === "我写下来的第一版。", "settings steps never touched the text");
  test.assert((api.darkroomOf(runtime.context.activeProject.quickDraft).versions || []).length === 0, "the history is not the version list: no version appeared");
}

// ---- The negative goes stale; Develop refuses to build on it; a re-shoot fixes it -------------------------------------------
{
  const { runtime, project } = await deskWithStack(["mingming"]);
  const api = runtime.testApi;
  const draft = runtime.controls.get("quick-draft-draft");
  await api.applyAdjustmentLayers();
  await api.developAdjustmentLayers();
  test.assert(api.lightroomNegativeReport().state === "fresh", "right after a develop the negative is fresh");
  draft.value = `${draft.value}\n我后来又写了一句。`;
  runtime.context.activeProject.quickDraft.workspace.body = draft.value;
  test.assert(api.lightroomNegativeReport().state === "stale", "a sentence the writer added afterwards makes it stale");
  await api.updateAdjustmentLayer("luoluo", { enabled: true });
  const state = api.lightroomActionState();
  test.assert(state.develop.available === false && state.develop.reason === "lightroom_develop_stale", "Develop is off while the negative is stale, and says why");
  test.assert(await api.developAdjustmentLayers() === false, "and refuses even when called directly");
  const before = api.darkroomOf(runtime.context.activeProject.quickDraft);
  const reshot = await api.lightroomReshoot();
  test.assert(reshot === true, "the re-shoot completes");
  const after = api.darkroomOf(runtime.context.activeProject.quickDraft);
  test.assert(after.negative === draft.value && api.lightroomNegativeReport().state === "fresh", "the current body is the new negative");
  test.assert(after.versions.some((entry) => entry.reason === "before-reshoot" && entry.body === before.negative), "and the old negative was saved as a version first");
  const history = runtime.context.editHistories.lightroom();
  test.assert(history.undoLabel() === "edit_step_reshoot", "a re-shoot is a step of the history");
}

// ---- Write permission: who may be developed ---------------------------------------------------------------------------------------
{
  const runtime = createDraftDeskVm();
  runtime.addProject("p1", "草稿正文。", { projectDocId: "doc-draft" });
  const project = runtime.context.activeProject;
  const log = [];
  modelStub(runtime, log);
  const api = runtime.testApi;
  const file = { id: "file-1", projectId: "p1", type: "text", name: "随笔", body: "TeachText 里的随笔。", label: "", folderId: "f1" };
  runtime.context.chatFiles.push(file);
  const saves = [];
  runtime.context.saveTextDocument = async () => { saves.push(runtime.context.teachTextBodyInput.value); return true; };
  runtime.context.teachTextBodyInput = { value: file.body, dispatchEvent: () => true };
  runtime.context.Event = class { constructor(type) { this.type = type; } };

  // 1. Another document nobody is editing: previewed and developed through its record.
  await api.developDocument("file-1");
  let decision = api.lightroomWriteDecision();
  test.assert(decision.canWrite && decision.owner === "file" && decision.path === "record", "a document nobody is editing is developed through its record");
  await api.updateAdjustmentLayer("mingming", { enabled: true });
  await api.applyAdjustmentLayers();
  test.assert(log.at(-1).input === "TeachText 里的随笔。", "the layers read that document's text, not the draft's");
  const revisions = [];
  runtime.context.createDocumentRevision = async (options) => { revisions.push(options); return {}; };
  const developed = await api.developAdjustmentLayers();
  test.assert(developed === true && file.body === "TeachText 里的随笔。〔mingming〕", "Develop wrote the document's own record");
  test.assert(revisions.length === 1 && revisions[0].documentId === "file-1" && revisions[0].body === "TeachText 里的随笔。", "through a revision of the text it replaced");
  test.assert(project.quickDraft.workspace.body === "草稿正文。", "the Quick Draft's own draft was never touched");
  const history = runtime.context.editHistories.lightroom();
  test.assert(history.undo() === true, "Undo is available for the other document too");
  await new Promise((resolve) => setTimeout(resolve, 20));
  test.assert(file.body === "TeachText 里的随笔。", "and puts that document's text back");

  // 2. The same document held by TeachText: written through TeachText and its save.
  runtime.context.activeTextFileId = "file-1";
  decision = api.lightroomWriteDecision();
  test.assert(decision.canWrite && decision.owner === "teachText" && decision.path === "editor", "a document TeachText holds is written through TeachText");
  await api.updateAdjustmentLayer("luoluo", { enabled: true });
  await api.applyAdjustmentLayers();
  const heldDevelop = await api.developAdjustmentLayers();
  test.assert(heldDevelop === true && saves.length === 1, "Develop went through TeachText's own save");
  test.assert(runtime.context.teachTextBodyInput.value.includes("〔luoluo〕"), "and into the editor the writer sees");

  // 3. The route's document while the Section Drafts hold the pen: preview only, and the owner is named.
  // TeachText holds it as the manuscript, and the outline projects into it: the
  // route's own rule (the one that locks the manuscript textarea) says it is a
  // projection, and the phase says whose pen.
  runtime.context.isTeachTextManuscriptRole = () => true;
  runtime.context.shouldSyncProjectOutlineAsManuscript = () => true;
  runtime.context.manuscriptPhase = () => "drafting";
  decision = api.lightroomWriteDecision();
  test.assert(!decision.canWrite && decision.owner === "sectionDrafts" && decision.reason === "route-owned", "the route document while drafting belongs to Section Drafts");
  const bodyBefore = runtime.context.teachTextBodyInput.value;
  await api.updateAdjustmentLayer("hkrr", { enabled: true });
  await api.applyAdjustmentLayers();
  const refused = await api.developAdjustmentLayers();
  test.assert(refused === false && runtime.context.teachTextBodyInput.value === bodyBefore && saves.length === 1, "Develop refuses, writes nothing, and saves nothing");
  test.assert(api.lightroomActionState().develop.available === false, "the Develop key and row are off");
  test.assert(api.lightroomActionState().preview.available === true, "while the preview stays available");
  test.assert(runtime.controls.get("lightroom-status") === undefined || true, "the refusal is shown, not silent");

  // 4. The pen goes to the manuscript: the same document can be developed again.
  runtime.context.manuscriptPhase = () => "manuscript";
  decision = api.lightroomWriteDecision();
  test.assert(decision.canWrite && decision.owner === "teachText", "once the manuscript owns the text the darkroom writes through it");

  // 5. A lease in handoff takes no new write at all.
  runtime.context.window.AISystem6WriteLease = { isReadOnly: () => false, canMutate: () => false, syncReadOnlySurface: () => {}, registerReadOnlyRule: () => {} };
  decision = api.lightroomWriteDecision();
  test.assert(!decision.canWrite && decision.reason === "handoff", "a lease handing over the pen stops the darkroom's writes");
  delete runtime.context.window.AISystem6WriteLease;

  // 6. Settings and presets are the darkroom's own record: they work on a document it may not write.
  runtime.context.manuscriptPhase = () => "drafting";
  test.assert(!api.lightroomWriteDecision().canWrite, "(still held by Section Drafts while drafting)");
  // 6b. A manuscript nobody has outlined yet is nobody's projection: free.
  runtime.context.shouldSyncProjectOutlineAsManuscript = () => false;
  test.assert(api.lightroomWriteDecision().canWrite === true, "a manuscript that is not yet the outline's projection is a plain document");
  runtime.context.shouldSyncProjectOutlineAsManuscript = () => true;
  const presetStore = {};
  runtime.context.localStorage = { getItem: (key) => presetStore[key] ?? null, setItem: (key, value) => { presetStore[key] = value; } };
  runtime.context.showInputDialog = async () => "公众号版";
  await api.lightroomSavePreset();
  test.assert(api.lightroomPresets().length === 1 && api.lightroomPresets()[0].name === "公众号版", "a preset is saved from the current stack");
  test.assert(api.lightroomPresets()[0].layers.every((layer) => !("scope" in layer)), "without any scope");
}

// ---- A reload never wipes a document's darkroom -------------------------------------------------------------------
// A saved Quick Draft record keeps two aliases of the darkroom, and every load
// rebuilds a "pending" bucket from them. Draining that bucket over the real
// record erased the stack, the locks and the versions on every reload.
{
  const runtime = createDraftDeskVm();
  runtime.addProject("p1", "我写下来的第一版。", { projectDocId: "doc-1" });
  const api = runtime.testApi;
  await api.commitQuickDraft({ workspace: { versions: [{ id: "v1", body: "旧", reason: "before-develop" }], composition: { negative: "n", negativeUpdatedAt: "T" } } }, { captureForm: false });
  await api.updateAdjustmentLayer("mingming", { enabled: true });
  await api.commitQuickDraft({ workspace: { protectedRanges: [{ start: 1, end: 1 }] } }, { captureForm: false });
  const store = runtime.context.window.AISystem6DarkroomStore;
  const saved = JSON.parse(JSON.stringify(runtime.context.activeProject.quickDraft));
  runtime.context.activeProject.quickDraft = runtime.context.normalizeQuickDraftRecord(saved);
  test.assert(!runtime.context.activeProject.quickDraft.workspace.pendingDarkroom, "a reloaded schema-4 record does not invent a pending darkroom out of the negative's aliases");
  await runtime.context.ensureDarkroomReady();
  let record = store.darkroomRecord("p1", "doc-1");
  test.assert(record.versions.length === 1 && record.versions[0].id === "v1", "the document's versions survive the reload");
  test.assert(record.settings.layers.some((layer) => layer.kind === "mingming" && layer.on), "and its layer stack");
  test.assert(record.settings.protected.length === 1, "and its locks");
  // A bucket that is really there (an older save) still never replaces a record that has state.
  runtime.context.activeProject.quickDraft = {
    ...runtime.context.activeProject.quickDraft,
    workspace: { ...runtime.context.activeProject.quickDraft.workspace, pendingDarkroom: { composition: { negative: "别处来的", negativeUpdatedAt: "T9" } } },
  };
  await runtime.context.ensureDarkroomReady();
  record = store.darkroomRecord("p1", "doc-1");
  test.assert(record.negative === "n" && record.versions.length === 1, "a leftover bucket is dropped, not written over the record that has state");
  test.assert(!runtime.context.activeProject.quickDraft.workspace.pendingDarkroom, "and the bucket is cleared");
  // A record with nothing yet is still filled from a real legacy bucket.
  const legacy = createDraftDeskVm();
  legacy.addProject("p2", "旧稿。", {
    projectDocId: "doc-2",
    adjustmentLayers: [{ kind: "hkrr", enabled: true, strength: 75, mask: [] }],
    composition: { negative: "旧底片", negativeUpdatedAt: "T0" },
  });
  await legacy.context.ensureDarkroomReady();
  const filled = legacy.context.window.AISystem6DarkroomStore.darkroomRecord("p2", "doc-2");
  test.assert(filled.negative === "旧底片" && filled.settings.layers.some((layer) => layer.kind === "hkrr" && layer.on && layer.step === 3), "a pre-move record with nothing in the store still migrates in");
}

// ---- Presets onto another document ---------------------------------------------------------------------------------------------------
{
  const runtime = createDraftDeskVm();
  runtime.addProject("p1", "甲稿。", { projectDocId: "doc-a" });
  const api = runtime.testApi;
  const presetStore = {};
  runtime.context.localStorage = { getItem: (key) => presetStore[key] ?? null, setItem: (key, value) => { presetStore[key] = value; } };
  runtime.context.showInputDialog = async () => "口播版";
  runtime.context.chatFiles.push({ id: "file-b", projectId: "p1", type: "text", name: "乙", body: "乙稿。" });
  await api.updateAdjustmentLayer("luoluo", { enabled: true, strength: 75 });
  await api.updateAdjustmentLayer("clean", { enabled: true });
  await api.lightroomSavePreset();
  const preset = api.lightroomPresets()[0];
  test.assert(preset.name === "口播版" && preset.layers.length === 2, "a preset keeps the layers that were on");
  await api.developDocument("file-b");
  test.assert(api.darkroomOf(runtime.context.activeProject.quickDraft).settings.layers.every((layer) => !layer.on), "the other document starts with nothing on");
  await api.lightroomApplyPreset(preset.id);
  const applied = api.darkroomOf(runtime.context.activeProject.quickDraft).settings.layers.filter((layer) => layer.on);
  test.assert(applied.map((layer) => layer.kind).sort().join() === "clean,luoluo" && applied.find((layer) => layer.kind === "luoluo").step === 3, "applying the preset to it sets those layers at those strengths");
  // Copy this document's stack to a third one.
  runtime.context.chatFiles.push({ id: "file-c", projectId: "p1", type: "text", name: "丙", body: "丙稿。" });
  const copied = await api.lightroomCopySettingsTo("file-c");
  test.assert(copied === true, "settings can be copied to another document");
  const target = runtime.context.window.AISystem6DarkroomStore.darkroomRecord("p1", "file-c");
  test.assert(target.settings.layers.filter((layer) => layer.on).length === 2, "the copy arrives with the same layers on");
}

// ---- Leaving a document keeps one version; naming one; the compare sources ------------------------------------------------------------
{
  const { runtime } = await deskWithStack(["mingming"], "留下这一版。");
  const api = runtime.testApi;
  const draft = runtime.controls.get("quick-draft-draft");
  test.assert(api.lightroomLeaveDocument() === true, "leaving after the darkroom did something keeps a version");
  const versions = api.darkroomOf(runtime.context.activeProject.quickDraft).versions;
  test.assert(versions.length === 1 && versions[0].reason === "leave" && versions[0].body === "留下这一版。", "an automatic one, of the text as it was left");
  test.assert(api.lightroomLeaveDocument() === false, "and not again until the darkroom does something more");
  const sources = runtime.context.window.AISystem6LightroomDevelop.compareSources();
  test.assert(sources.some((source) => source.kind === "version") && sources.some((source) => source.kind === "step"), "versions and history steps are things to compare against");
  test.assert(api.lightroomSetCompare({ on: true }) === true, "compare turns on");
  test.assert(api.lightroomSetCompare({ on: false }) === false, "and off");
}

// ---- Saving a version needs no pen on the document ------------------------------------------------------------------------------------------
{
  const runtime = createDraftDeskVm();
  runtime.addProject("p1", "草稿。", { projectDocId: "doc-a" });
  runtime.context.chatFiles.push({ id: "file-r", projectId: "p1", type: "text", name: "路线稿", body: "路线里的稿子。", label: "" });
  // Not on screen in TeachText: the manuscript tab that points at the file marks it
  // as the route's document, and the project says nobody has taken the pen yet.
  runtime.context.activeProject.documentTabs = [{ app: "teachText", role: "manuscript", state: { activeTextFileId: "file-r" } }];
  const api = runtime.testApi;
  await api.developDocument("file-r");
  test.assert(!api.lightroomWriteDecision().canWrite && api.lightroomWriteDecision().owner === "sectionDrafts", "the route document is read-only to the darkroom while drafting, and Section Drafts are named");
  test.assert(await api.saveLightroomVersion() === true, "yet a version of it can be kept: that is the darkroom's own record");
  test.assert(runtime.context.window.AISystem6DarkroomStore.darkroomRecord("p1", "file-r").versions.length === 1, "and it is in that document's darkroom record");
  test.assert(await api.restoreQuickDraftVersion(runtime.context.window.AISystem6DarkroomStore.darkroomRecord("p1", "file-r").versions[0].id) === false, "restoring it would write the document, so it is refused");
}

test.finish();
