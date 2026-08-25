// Draft Desk durability scenarios — pure / VM behavior tests.
//
// The five scenarios from the release contract run here against the real
// production functions in a bare vm context (no DOM, no browser, no
// Playwright). They prove the durable workspace, the non-destructive
// composition contract, the immutable-sentinel protect rule, and the
// reload/restore behavior that a UI test would otherwise have to chase.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("quick-draft-scenarios");

const sources = [
  "app/core/adjustment-layers.js",
  "app/core/protected-ranges.js",
  "app/core/text-compose.js",
  "app/core/grain-diff.js",
  "app/core/explanation-lens.js",
  "app/core/quick-draft-workspace.js",
  "app/features/draft-desk.js",
  "app/features/quick-draft-intake.js",
  "app/features/quick-draft-editor.js",
  "app/features/quick-draft-composition.js",
  "app/features/quick-draft-ai.js",
  "app/features/quick-draft-handoff.js",
].map((path) => read(path));

const documentStub = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  body: { append: () => {}, dataset: {} },
  createElement: () => ({ classList: { toggle: () => {}, add: () => {}, remove: () => {} }, style: { setProperty: () => {} }, addEventListener: () => {}, append: () => {}, remove: () => {}, click: () => {} }),
};

const context = vm.createContext({
  crypto: webcrypto,
  structuredClone,
  TextEncoder,
  Uint8Array,
  document: documentStub,
  window: {},
  navigator: { userAgent: "node" },
  console,
  t: (key, ...args) => {
    if (typeof key !== "string") return String(key);
    return args.length ? `${key}:${args.join(",")}` : key;
  },
  getActiveProject: () => context.activeProject || null,
  saveDeskState: async () => context.persistSucceeds !== false,
  registerWorkingSessionAdapter: () => {},
  getWindow: () => null,
  openWindow: async () => {},
  showSystemModal: async () => "yes",
  createDocumentRevision: async () => {},
  formatReviewVoiceStats: null,
  currentLanguage: "zh",
  mountedTextDisk: null,
  activeProjectId: "",
  cloudConfig: undefined,
  cloudCredentialReady: () => false,
  modelInput: { value: "local-model" },
  getLocalModelRequestName: () => "local-model",
  sendLocalModelTask: async () => ({ text: "{}" }),
  fetchModelPayload: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "x" } }] }) }),
  withMarkdownModelMessages: (messages) => messages,
  serviceErrorDetail: () => "model error",
  markdownToSystemHtml: (text) => String(text || ""),
  escapeHtml: (text) => String(text || ""),
  attachMarkdownEditor: () => {},
  attachMarkdownHighlight: () => {},
  initSystemSelectControls: () => {},
  refreshSystemSelectControls: () => {},
  AISystem6ProtectedRanges: {},
  AISystem6ModelTaskRuntime: { buildQuickDraftMessages: () => [] },
  AISystem6LocalLMStudio: { parseJsonText: (text) => { try { return JSON.parse(text); } catch { return {}; } } },
});

// The browser runs these files as one concatenated bundle, so function
// declarations hoist across files. Run the same combined script in the VM.
vm.runInContext(sources.join("\n"), context);

const workspaceTools = context.window.AISystem6QuickDraftRuntime;

// ---- Scenario 1: no model — write, save, close, reopen, continue --------
context.activeProject = {
  id: "project-1",
  name: "Test Disk",
  quickDraft: {
    // Legacy pre-schemaVersion record (flat aliases + toolInputs), proving
    // old projects keep opening after the migration.
    stage: "brief",
    title: "旧稿",
    thesis: "想讲点什么",
    targetFormat: "bili-dynamic",
    targetDuration: "280w",
    draft: "第一稿正文。",
    toolInputs: {
      pastedSources: "材料一\n材料二",
      audienceConcerns: "观众在乎什么",
      firstImpression: "感觉",
    },
    sourceMap: [{ id: "P1", label: "Material" }],
    strategyReport: { editorial: "取舍", materialLedger: "", adoptionTable: "" },
  },
};

const legacyNormalized = context.normalizeQuickDraftRecord(context.activeProject.quickDraft);
test.assert(legacyNormalized.workspace.schemaVersion === 4, "legacy records migrate to schemaVersion 4");
test.assert(legacyNormalized.workspace.title === "旧稿", "legacy title survives migration");
test.assert(legacyNormalized.workspace.body === "第一稿正文。", "legacy draft body survives migration");
test.assert(
  legacyNormalized.workspace.intake.setup.explanationLens?.enabled === true,
  "legacy records pick up the one-pass-listening default, which is now on"
);
test.assert(
  legacyNormalized.workspace.intake.setup.pastedSources === "材料一\n材料二",
  "legacy pasted sources survive migration"
);
test.assert(
  legacyNormalized.workspace.intake.setup.audienceConcerns === "观众在乎什么"
    && legacyNormalized.workspace.intake.setup.firstImpression === "感觉",
  "legacy advanced fields survive migration"
);
test.assert(
  legacyNormalized.workspace.materials.some((entry) => entry.label === "Material"),
  "legacy sourceMap migrates into materials"
);
test.assert(
  legacyNormalized.workspace.strategy.editorial === "取舍",
  "legacy strategyReport migrates into strategy"
);

const lensed = context.normalizeQuickDraftWorkspace({
  intake: { setup: { explanationLens: { enabled: true, baselineKnowledge: "familiar", mustKeepTerms: ["缓存", " 引用 "] } } },
});
test.assert(lensed.intake.setup.explanationLens.enabled === true, "enabled explanationLens survives normalization");
test.assert(lensed.intake.setup.explanationLens.baselineKnowledge === "familiar", "baselineKnowledge survives normalization");
test.assert(
  JSON.stringify(lensed.intake.setup.explanationLens.mustKeepTerms) === JSON.stringify(["缓存", "引用"]),
  "mustKeepTerms is trimmed and deduped in quick draft"
);

const v2WithDumps = context.normalizeQuickDraftWorkspace({
  schemaVersion: 2,
  intake: { ventLog: [
    { id: "real-vent", text: "真正的树洞材料", createdAt: "2026-08-01T01:00:00.000Z", sourceKind: "clioTalk-vent" },
    { id: "old-dump", text: "旧版本正文", createdAt: "2026-08-01T02:00:00.000Z", sourceKind: "quick-draft-dump" },
  ] },
});
const v3Again = context.normalizeQuickDraftWorkspace(v2WithDumps);
test.assert((v2WithDumps.pendingDarkroom?.versions || []).length === 1 && (v2WithDumps.pendingDarkroom?.versions || [])[0].body === "旧版本正文" && (v2WithDumps.pendingDarkroom?.versions || [])[0].createdAt === "2026-08-01T02:00:00.000Z", "v2 dump body and timestamp migrate into Versions");
test.assert(v2WithDumps.intake.ventLog.length === 1 && v2WithDumps.intake.ventLog[0].id === "real-vent", "migration leaves only genuine vent material in ventLog");
test.assert((v3Again.pendingDarkroom?.versions || []).length === 1, "v2 to v4 dump migration is idempotent");

// Open → write → save → close → reopen: the canonical workspace is
// idempotent, so no field is lost across cycles.
const firstCycle = context.normalizeQuickDraftWorkspace({
  ...legacyNormalized.workspace,
  body: "第一稿正文。\n继续写第二句。",
  updatedAt: "2026-08-08T00:00:00.000Z",
}, context.activeProject.quickDraft);
const reopened = context.normalizeQuickDraftWorkspace(firstCycle, context.activeProject.quickDraft);
test.assert(reopened.body === "第一稿正文。\n继续写第二句。", "the body survives a save/close/reopen cycle");
test.assert(reopened.schemaVersion === 4 && reopened.title === "旧稿", "title and schema survive a save/close/reopen cycle");
test.assert(
  reopened.intake.setup.pastedSources === "材料一\n材料二"
    && reopened.materials.length === 1,
  "materials survive a save/close/reopen cycle"
);

// Persistence semantics: success marks Saved; failure marks Modified and
// never claims Saved.
context.persistSucceeds = true;
const savedOk = await context.persistQuickDraftWorkspace();
test.assert(savedOk === true, "a successful write resolves as saved");
context.persistSucceeds = false;
const savedFailed = await context.persistQuickDraftWorkspace();
test.assert(
  savedFailed === false && context.activeProject.quickDraft.workspace.savedStatus === "modified",
  "a failed write leaves the record Modified, never Saved"
);
context.persistSucceeds = true;

// ---- Scenario 2: with a model — draft, non-destructive stack ------------
const SOURCE = "这是我的原文。\n\n第二段要保护：\n这句话不许动。\n\n结尾。";
const PROTECTED = [{ start: 4, end: 4 }];
const STACK = [
  { kind: "mingming", enabled: true, strength: 50, mask: [] },
  { kind: "density", enabled: true, strength: 75, mask: [] },
];
const runModelPass = async ({ protectedText, sentinels }) => {
  // The model keeps every token verbatim and edits the rest.
  return `${protectedText}\n\n[model refined this pass]`;
};
const composed = await context.composeDocument({
  source: SOURCE,
  layers: STACK,
  protectedRanges: PROTECTED,
  cache: new Map(),
  runModel: runModelPass,
});
test.assert(SOURCE.includes("这句话不许动。"), "the negative still carries the protected text");
test.assert(composed.text.includes("这句话不许动。"), "the composite carries the protected text byte-identical");
test.assert(
  composed.text !== SOURCE && composed.text.includes("[model refined this pass]"),
  "the enabled stack changed the composite"
);

// ---- Scenario 3: failure — body unchanged, idle, retry works -------------
let attempts = 0;
let failedOnce = false;
const failingRunModel = async () => {
  attempts += 1;
  if (!failedOnce) {
    failedOnce = true;
    throw new Error("model down");
  }
  return `${SOURCE}\n\n[model recovered]`;
};
const retryCache = new Map();
const firstAttempt = await context.composeDocument({
  source: SOURCE,
  layers: STACK,
  protectedRanges: [],
  cache: retryCache,
  runModel: failingRunModel,
}).then(
  () => null,
  (error) => error
);
test.assert(!!firstAttempt && /model down/.test(String(firstAttempt.message)), "a failed model call rejects the composition");
test.assert(retryCache.size === 0, "a failed pass is never cached, so Retry re-calls");
const retried = await context.composeDocument({
  source: SOURCE,
  layers: STACK,
  protectedRanges: [],
  cache: retryCache,
  runModel: failingRunModel,
});
test.assert(attempts === 2 && retried.text.includes("[model recovered]"), "Retry after a failure re-calls the exact stack once and succeeds");

// ---- Scenario 4: protect — byte-identical, sentinel break fails ----------
const exact = await context.composeDocument({
  source: SOURCE,
  layers: [{ kind: "hkrr", enabled: true, strength: 50, mask: [] }],
  protectedRanges: PROTECTED,
  cache: new Map(),
  runModel: async ({ protectedText, sentinels }) => protectedText,
});
test.assert(exact.text === SOURCE, "a protected pass with intact sentinels is byte-identical");
const broken = await context.composeDocument({
  source: SOURCE,
  layers: STACK,
  protectedRanges: PROTECTED,
  cache: new Map(),
  runModel: async () => "第一段。\n\n第二段被模型重写了。\n\n结尾。",
}).then(
  () => null,
  (error) => error
);
test.assert(
  !!broken && broken.code === "PROTECTED_RANGE_VIOLATION",
  "a model that breaks a sentinel fails the whole composition"
);
test.assert(
  !broken?.details?.some((detail) => /appended|guessed/i.test(detail)),
  "protection never guesses a position or appends the quote at the end"
);

// ---- Scenario 5: restore — layers, protect, title, body, refresh ---------
const layered = context.normalizeQuickDraftWorkspace({
  schemaVersion: 2,
  title: "持久稿",
  body: "正文。",
  intake: { setup: { scenario: "first-day-hands-on", targetDuration: "7m" } },
  adjustmentLayers: context.normalizeAdjustmentLayers([
    { kind: "density", enabled: true, strength: 75, mask: "2-3" },
  ]),
  protectedRanges: [{ start: 1, end: 1 }],
  versions: [{ id: "kept-1", body: "上一稿。", createdAt: "2026-08-08T00:00:00.000Z" }],
});
const refreshed = context.normalizeQuickDraftWorkspace(layered, {});
test.assert(
  // The stack is the document's now, so a refresh restores it through the
  // pending bucket until the draft has a document to file it under.
  refreshed.pendingDarkroom?.adjustmentLayers[0]?.kind === "density"
    && refreshed.pendingDarkroom?.adjustmentLayers[0]?.enabled === true
    && refreshed.pendingDarkroom?.adjustmentLayers[0]?.strength === 75,
  "the layer stack restores after a refresh"
);
test.assert(
  (refreshed.pendingDarkroom?.protectedRanges || []).some((range) => range.start === 1 && range.end === 1),
  "protected ranges restore after a refresh"
);
test.assert((refreshed.pendingDarkroom?.versions || [])[0]?.body === "上一稿。", "kept versions restore after a refresh");
test.assert(refreshed.body === "正文." || refreshed.body === "正文。", "switching views never loses the body");
test.assert(refreshed.title === "持久稿", "the saved project title restores after a refresh");

test.finish();
