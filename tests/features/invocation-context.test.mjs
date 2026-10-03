import assert from "node:assert/strict";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import { createFeatureTest, parseJsSource, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("invocation-context");
const chat = read("app/core/chat-messages.js");
const retrieval = read("app/core/context-retrieval.js");
function functions(source, names) {
  const nodes = parseJsSource(source).body.filter((node) => node.type === "FunctionDeclaration");
  return names.map((name) => {
    const node = nodes.find((node) => node.id.name === name);
    assert.ok(node, name);
    return source.slice(node.start, node.end);
  }).join("\n");
}
const pending = [];
const answers = [];
let descriptors = [];
const noop = () => {};
const sandbox = vm.createContext({
  console, crypto: { randomUUID }, performance, AbortController,
  window: {
    AISystem6RunReceipts: { recordModelAnswer: async (receipt) => { answers.push(receipt); return { receiptId: randomUUID() }; } },
    AISystem6LocalLMStudio: { chat: (payload) => new Promise((resolve) => pending.push({ payload, resolve })) },
    nextTaskInputFileIds: new Set(), nextTaskRetrospectiveIds: new Set(), nextTaskSkillIds: new Set(),
  },
  activeProjectId: "project-A", activeTextFileId: "document-A", isProjectMounted: true,
  sideAskEnabled: false, clioTalkTemporaryMode: false, currentLanguage: "en",
  rememberInput: { checked: true }, attachedClipIds: new Set(), scraps: [], ragChunks: [],
  conversation: [], compressedConversationMemory: {}, excludedContextKeys: new Set(),
  lastContextBudget: null, lastRetrievedContextItems: [],
  maxContextItemChars: 2000, maxCuratedContextItems: 6, contextLengthInput: { value: "8192" },
  localLmStudioConnectionEnabled: true, cloudConfig: { active: false },
  getClioTalkPendingInputDescriptors: () => descriptors,
  getClioTalkPendingHarnessDescriptor: () => null,
  currentClioTalkNativeResponseScope: () => ({ provider: "lm-studio", endpoint: "local", model: "requested" }),
  compactConversationMemoryIfNeeded: noop, renderAttachedClips: noop,
  aiSystem6IdentityContext: () => "Identity", isMultiFinderMode: () => false,
  isClioTalkAnswerContractTask: () => false, clioProductHelpContext: () => "",
  formatProjectDictionaryTermsForContext: () => "", formatSideAskAnchorContext: () => "",
  buildEndfieldSourceContext: () => "", hasMountedFileDiskContext: () => false,
  clioTalkContinuationMessages: () => [], getProjectFiles: () => [],
  conversationMemorySystemMessage: () => null,
  clioTalkPromptMessages: () => {
    sandbox.window.lastTaskPromptFiles = [{ name: `prompt-${sandbox.activeProjectId}`, hash: "prompt-hash" }];
    return [{ role: "system", content: `Policy for ${sandbox.activeProjectId}` }];
  },
  clioTalkLanguageInstruction: () => "Language", getLocalModelRequestName: () => "requested",
  withMarkdownModelMessages: (messages) => messages, localChatDefaults: () => ({ max_tokens: 256 }),
  attachClioImageInputsToMessages: noop, clioImageReceiptDescriptors: () => [],
  getRagContextBudget: () => ({ contextTokens: 8192, budgetChars: 4000 }),
  getSystemRagTopK: () => 4, getQueryWords: () => new Set(),
  getCuratedContextItems: () => descriptors.map((file) => ({ ...file, content: file.body })),
  isContextSourceEnabled: () => true, finderLabelContextPolicy: () => ({ include: true, tag: "quotable-source" }),
  selectDiverseRankedChunks: (items) => items, isContextSourceLive: () => true,
  takeWithinBudgetDetailed: (items, budget, format) => ({
    selected: items.map((item, index) => ({ item, text: format(item, index), chars: item.content.length })),
    dropped: [], used: items.reduce((sum, item) => sum + item.content.length, 0),
  }),
  sourceCitationForContextItem: (item, index) => `[S${index + 1}]`,
  contextSourceLabel: (item) => item.name, clipContextContent: (text) => text,
  contextContentHash: (text) => `hash:${text}`, finderLabelContextRulesSnapshot: () => ({ exclude: [] }),
  scheduleRenderTasks: noop, renderClioTalkContextSpace: noop, renderClioTalkRunAssembly: noop,
  modelMessageContentReceipt: (content) => String(content), modelMessageContentIdentity: (content) => String(content),
  estimateTokenCount: (content) => Math.ceil(String(content).length / 4),
  clioRunHash: (text) => `hash:${text}`, clioProductHelpReceipt: () => [], t: (key) => key,
  ensurePromptFilesData: async () => {}, fitPayloadWithModelBudget: async (payload) => payload,
  isGemma4ModelName: () => false, clioCloudRouteActive: () => false,
  withBrowserLocalSafetyMessages: (messages) => messages, clioTalkPreviousNativeResponseId: () => null,
  retryCloudFilePayloadInline: async (response) => response, scrubVisibleModelOutput: (text) => text.trim(),
  modelMetricsFromResponse: (data) => ({ stopReason: data.choices[0].finish_reason, tokens: 4 }),
  modelMetricsFromStream: (text, duration, reason) => ({ stopReason: reason, tokens: 4 }),
  updateModelMeter: noop, maybeRepairBrowserLocalResult: async (result) => result,
  cloudCredentialReady: () => false, cloudPayloadCarriesImage: () => false,
  captureClioTalkGroundingSafely: () => ({ sources: [], missing: [] }),
  clioTalkReplayOptions: () => ({}), isIncompleteModelFinishReason: (reason) => reason === "length" || reason === "interrupted",
  clioTalkReadingTrace: () => [], clioTalkProposedManuscriptPatch: () => null,
  clioProductHelpActions: () => [], cloneClioRunManifest: (manifest) => JSON.parse(JSON.stringify(manifest)),
  getClioTalkPromptFileDescriptors: () => [],
});
vm.runInContext(functions(chat, [
  "clioTaskSnapshot", "createClioTaskInvocation", "assertClioTaskInvocationActive", "updateClioTaskInvocation",
  "recordContextLoadout", "buildPayload", "fetchModelPayload", "requestModelResponse", "sendLocalModelTask",
  "readJsonModelResult", "chargeClioServerModelCalls", "modelMessageText", "noteClioTalkModelAttempt", "createClioTalkAssistantRecord",
  "createClioTalkPreflightRunManifest",
]) + "\n" + functions(retrieval, ["retrieveContext"]), sandbox);

function start(project, source, { skipContext = false } = {}) {
  sandbox.activeProjectId = project;
  sandbox.activeTextFileId = `document-${project}`;
  descriptors = [{ id: source, name: source, body: `Evidence ${source}`, kind: "input", projectId: project }];
  sandbox.window.nextTaskInputFileIds = new Set([source]);
  const invocation = sandbox.createClioTaskInvocation({ userText: `Question ${source}` });
  const controller = new AbortController();
  const payload = sandbox.buildPayload(`Question ${source}`, { invocation, skipContext });
  const promise = sandbox.sendLocalModelTask({ invocation, payload, signal: controller.signal, streamPreference: "json" });
  return { invocation, controller, payload, promise };
}
async function waitRequests(count) {
  for (let index = 0; pending.length < count && index < 30; index += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.length, count);
}
function jsonResponse(text, model = "", finishReason = "stop") {
  return { ok: true, headers: { get: () => "application/json" }, json: async () => ({
    ...(model ? { model } : {}), choices: [{ message: { role: "assistant", content: text }, finish_reason: finishReason }],
  }) };
}
function completeRecord(task, result) {
  return sandbox.createClioTalkAssistantRecord({
    invocation: task.invocation, content: result.text, taskKind: "chat",
    finishReason: result.metrics.stopReason, requestRecord: { id: `request-${task.invocation.id}` },
  });
}

// Actual assembly, provider request and assistant receipt with reverse arrival.
const a = start("project-A", "source-A");
await waitRequests(1);
const b = start("project-B", "source-B");
await waitRequests(2);
assert.ok(pending[0].payload.messages.some((message) => String(message.content).includes("Evidence source-A")));
pending[1].resolve(jsonResponse("Answer B", "served-B", "length"));
const resultB = await b.promise;
const recordB = completeRecord(b, resultB);
pending[0].resolve(jsonResponse("Answer A", "served-A"));
const resultA = await a.promise;
const recordA = completeRecord(a, resultA);
assert.equal(recordA.runManifest.invocationId, a.invocation.id);
assert.equal(recordA.runManifest.contextManifest.projectId, "project-A");
assert.equal(recordA.runManifest.inputFiles[0].id, "source-A");
assert.equal(recordA.runManifest.promptFiles[0].name, "prompt-project-A");
assert.equal(recordA.harness.model, "served-A");
assert.equal(recordA.runManifest.contextManifest.actualModel, "served-A");
assert.equal(recordB.runManifest.contextManifest.sources[0].id, "source-B");
assert.equal(recordB.incomplete, true);
assert.equal(sandbox.window.lastTaskRunManifest.invocationId, b.invocation.id);
assert.equal(answers.find((answer) => answer.answerText === "Answer A").projectId, "project-A");
assert.equal(recordA.runManifest.attempts.length, 1);
assert.equal(recordB.runManifest.attempts.length, 1);
assert.ok(Object.isFrozen(a.invocation.runManifest.contextManifest.sources));
assert.throws(() => { a.invocation.runManifest.inputFiles[0].id = "corrupted"; }, TypeError);

// No-context / unknown-model turns cannot borrow a previous source or model.
const unknown = start("project-B", "source-unknown", { skipContext: true });
await waitRequests(3);
pending[2].resolve(jsonResponse("Unknown-model answer"));
const resultUnknown = await unknown.promise;
const recordUnknown = completeRecord(unknown, resultUnknown);
assert.equal(recordUnknown.runManifest.contextManifest, null);
assert.equal(recordUnknown.harness.model, "");
assert.equal(recordUnknown.runManifest.model, "");
assert.equal(answers.at(-1).model, "");
assert.equal(recordA.harness.model, "served-A");

// A provider ignoring abort cannot convert a stopped invocation into an answer.
const stopped = start("project-B", "source-stopped");
await waitRequests(4);
stopped.controller.abort();
pending[3].resolve(jsonResponse("Late cancelled answer", "served-late"));
await assert.rejects(stopped.promise, { name: "AbortError" });
assert.equal(stopped.invocation.modelResult, null);
assert.equal(stopped.invocation.runManifest.servedModel, undefined);
assert.equal(answers.some((answer) => answer.answerText === "Late cancelled answer"), false);
assert.equal(recordB.runManifest.invocationId, b.invocation.id);

// A project switch before assembly cannot retrieve project B into project A.
const stale = sandbox.createClioTaskInvocation({ projectId: "project-A" });
assert.throws(() => sandbox.buildPayload("old question", { invocation: stale }), { name: "AbortError" });

// Tool rounds retain immutable earlier snapshots and one ordered attempt list.
const rounds = start("project-B", "source-round");
await waitRequests(5);
pending[4].resolve(jsonResponse("Round one", "model-one"));
const roundOne = await rounds.promise;
const second = sandbox.sendLocalModelTask({ invocation: rounds.invocation, payload: rounds.payload, streamPreference: "json" });
await waitRequests(6);
pending[5].resolve(jsonResponse("Round two", "model-two"));
const roundTwo = await second;
assert.equal(roundOne.runManifest.servedModel, "model-one");
assert.equal(roundOne.runManifest.attempts.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(roundTwo.runManifest.attempts.map((attempt) => attempt.model))), ["model-one", "model-two"]);
// Cancellation during asynchronous budget fitting prevents dispatch itself.
const fitNormally = sandbox.fitPayloadWithModelBudget;
let finishBudget;
sandbox.fitPayloadWithModelBudget = (payload) => new Promise((resolve) => { finishBudget = () => resolve(payload); });
const beforeDispatch = start("project-B", "source-before-dispatch");
for (let index = 0; !finishBudget && index < 20; index += 1) await new Promise((resolve) => setImmediate(resolve));
beforeDispatch.controller.abort();
finishBudget();
await assert.rejects(beforeDispatch.promise, { name: "AbortError" });
assert.equal(pending.length, 6);
sandbox.fitPayloadWithModelBudget = fitNormally;

// Browser repair really is a second provider request; its served model and
// finish reason belong to that returned answer, including an unknown model.
vm.runInContext(functions(chat, ["maybeRepairBrowserLocalResult"]), sandbox);
sandbox.window.AISystem6ModelTaskRuntime = {
  shouldRepairHumanizerOutput: () => true,
  findHumanizerOutputHits: (text) => text.includes("bad") ? ["bad"] : [],
  buildHumanizerRepairMessages: (text) => [{ role: "user", content: text }],
};
const repair = start("project-B", "source-repair");
// This explicit second send uses the same invocation and an auto repair policy.
await waitRequests(7);
pending[6].resolve(jsonResponse("Initial complete answer", "model-initial"));
await repair.promise;
const repairPromise = sandbox.sendLocalModelTask({ invocation: repair.invocation, payload: repair.payload, streamPreference: "auto" });
await waitRequests(8);
pending[7].resolve(jsonResponse("bad answer", "model-original"));
await waitRequests(9);
pending[8].resolve(jsonResponse("Repaired answer", "", "length"));
const repaired = await repairPromise;
const repairRecord = completeRecord(repair, repaired);
assert.equal(repairRecord.harness.model, "");
assert.equal(repairRecord.runManifest.contextManifest.actualModel, "");
assert.equal(repairRecord.incomplete, true);
assert.equal(repairRecord.runManifest.attempts.at(-2).model, "model-original");
assert.equal(repairRecord.runManifest.attempts.at(-1).model, "");
assert.equal(repairRecord.runManifest.attempts.at(-2).outcome, "repaired");
test.assert(true, "assembly, reverse completion, immutable receipts, unknown models, cancellation and project switches preserve invocation ownership");
test.finish();
