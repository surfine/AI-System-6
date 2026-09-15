// Run Receipt contracts: one durable project-scoped record, lifecycle
// terminal states, read-vs-write honesty, checkpoint accept/edit/reject
// recording (edit records the final user version), reload and
// backup/restore recovery, repeat-from-contract, and a hard guarantee that
// receipts never contain secrets or chain-of-thought.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("run-receipts");
const manifest = read("tooling/runtime-manifest.mjs");
const receiptsSource = read("app/core/run-receipts.js");
const documentsChat = read("app/features/documents-chat.js");

test.assertIncludes(manifest, '"app/core/run-receipts.js"', "run receipts load in the app runtime");
test.assert(
  manifest.indexOf("app/core/run-receipts.js") < manifest.indexOf("app/features/documents-chat.js"),
  "run receipts load before their ClioTalk adapter"
);
test.assertIncludes(receiptsSource, 'runReceiptArtifactKind = "clio-run-record"', "receipts extend the existing clio-run-record artifact");
test.assertIncludes(receiptsSource, "artifactKind: runReceiptArtifactKind", "receipt files use the shared artifact kind");
test.assertIncludes(receiptsSource, "ensureRunReceiptsFolder", "receipts use the existing Run Records folder helper");
test.assertIncludes(receiptsSource, "runReceiptSchemaVersion = 2", "new receipts carry schemaVersion 2");
test.assertIncludes(receiptsSource, "schemaVersion: runReceiptSchemaVersion", "receipt records carry the shared schema version");
test.assertIncludes(receiptsSource, "runReceiptStatuses", "receipt statuses are a closed set");
test.assertIncludes(receiptsSource, "never API keys, provider secrets, or chain-of-thought", "the module documents its privacy boundary");
test.assertIncludes(documentsChat, "persistReceiptFileSync", "the ClioTalk adapter delegates persistence to the shared writer");
test.assertIncludes(documentsChat, "recordUserAction", "checkpoint accept/reject route through the receipt writer");

const forbiddenSecrets = ["apiKey", "api_key", "secret", "password", "chain-of-thought", "hidden reasoning"];

function createReceiptsContext(overrides = {}) {
  const chatFiles = overrides.chatFiles || [];
  const statusCalls = [];
  const folderCalls = [];
  const repeatCalls = [];
  const store = overrides.store || {
    projects: {
      commit: async (updater) => {
        updater({ projects: [], chatFiles });
      },
    },
  };
  const context = vm.createContext({
    console,
    crypto: webcrypto,
    chatFiles,
    activeProjectId: "project-1",
    ensureFolder: (name, parentId) => {
      folderCalls.push([name, parentId]);
      return { id: `folder-${name}`, name };
    },
    nextAvailableFileName: (name) => name,
    contentHash: (text) => `fnv1a-${String(text || "").length}`,
    saveDeskState: async () => true,
    renderDocuments: () => {},
    renderProjectDisks: () => {},
    setStatus: (message) => statusCalls.push(String(message)),
    t: (key) => key,
    window: {
      AISystem6WriteLease: { isReadOnly: () => overrides.readOnly === true },
      AISystem6StateStores: store,
      AISystem6ApplicationRegistry: overrides.registry || null,
    },
  });
  vm.runInContext(receiptsSource, context);
  return { context, chatFiles, statusCalls, folderCalls, repeatCalls };
}

const first = createReceiptsContext();
const api = first.context.window.AISystem6RunReceipts;

test.assert(api.schemaVersion === 2, "the exported schema version is 2");
test.assert(api.statuses.includes("completed") && api.statuses.includes("failed"), "terminal statuses exist");
test.assert(api.statuses.includes("cancelled") && api.statuses.includes("interrupted"), "cancelled and interrupted are explicit terminal states");

const created = await api.createReceipt({
  projectId: "project-1",
  sourceAppId: "reviewDesk",
  intent: "review",
  inputObjectIds: ["file-1"],
  provider: "local",
  model: "test-model",
  replayContract: { appId: "reviewDesk", intent: "review", inputObjectIds: ["file-1"] },
});
test.assert(created.ok === true && !!created.receiptId, "createReceipt returns a durable receipt id");
test.assert(first.chatFiles.some((file) => file.artifactKind === "clio-run-record"), "receipts persist as clio-run-record project files");
test.assert(
  first.folderCalls.some((call) => call[0] === "ClioTalk") && first.folderCalls.some((call) => call[0] === "Run Records"),
  "receipts land in the existing ClioTalk / Run Records folder"
);
const receiptFile = first.chatFiles.find((file) => file.id === created.receiptId);
test.assert(receiptFile?.runReceipt?.status === "running", "a fresh receipt starts non-terminal (running)");
test.assert(receiptFile?.runReceipt?.projectId === "project-1", "receipts are project-scoped");
test.assert(receiptFile?.body && receiptFile.body.includes("Run Receipt"), "receipts carry a readable text body");

// Read operations are recorded as reads; proposals never auto-commit.
await api.updateReceipt(created.receiptId, {
  toolCalls: [
    { name: "searchProjectSources", effect: "read", ok: true },
    { name: "proposeManuscriptPatch", effect: "proposal", ok: true },
  ],
});
await api.updateReceipt(created.receiptId, { proposal: "Replace the opening paragraph." });
let record = first.chatFiles.find((file) => file.id === created.receiptId).runReceipt;
test.assert(record.toolInvocations.some((tool) => tool.effect === "read"), "read tool calls are recorded as reads");
test.assert(record.toolInvocations.some((tool) => tool.effect === "proposal"), "proposal calls are recorded as proposals");
test.assert(record.status === "running", "a proposal does not auto-commit the receipt");
test.assert(record.proposal === "Replace the opening paragraph.", "the proposal text is recorded");

// Terminal transitions and checkpoint user actions.
await api.recordUserAction(created.receiptId, { action: "edit", finalBodyHash: "fnv1a-user-edited" });
record = first.chatFiles.find((file) => file.id === created.receiptId).runReceipt;
test.assert(record.userAction === "edit" && record.checkpointState === "edit", "Edit records the user's action");
test.assert(record.finalBodyHash === "fnv1a-user-edited", "Edit records the final user version hash");

await api.finishReceipt(created.receiptId, {
  status: "completed",
  outputObjectIds: ["manuscript-1"],
  destination: "teachText",
});
record = first.chatFiles.find((file) => file.id === created.receiptId).runReceipt;
test.assert(record.status === "completed" && !!record.finishedAt, "completed receipts carry a terminal status and finish time");
test.assert(record.outputObjectIds.includes("manuscript-1"), "receipts record the output object ids");
test.assert(record.destination === "teachText", "receipts record the destination");

await api.finishReceipt(created.receiptId, { status: "interrupted", publicErrorReason: "stale" });
record = first.chatFiles.find((file) => file.id === created.receiptId).runReceipt;
test.assert(record.status === "interrupted", "interrupted is an explicit terminal state");

const invalid = await api.recordUserAction(created.receiptId, { action: "ignore" });
test.assert(invalid.ok === false, "invalid checkpoint actions are rejected");

// Queries: terminal-only by default, project-scoped, output-linked.
const second = createReceiptsContext();
const api2 = second.context.window.AISystem6RunReceipts;
const created2 = await api2.createReceipt({ sourceAppId: "docMap", intent: "map", inputObjectIds: ["file-2"] });
await api2.finishReceipt(created2.receiptId, { status: "completed", outputObjectIds: ["file-2"] });
const running = await api2.createReceipt({ sourceAppId: "clioTalk", intent: "chat", inputObjectIds: [] });
const terminalOnly = api2.queryReceipts({ projectId: "project-1", limit: 10 });
test.assert(terminalOnly.length === 1 && terminalOnly[0].id === created2.receiptId, "queryReceipts hides in-flight runs by default");
const withRunning = api2.queryReceipts({ projectId: "project-1", limit: 10, includeRunning: true });
test.assert(withRunning.length === 2, "queryReceipts can include running runs explicitly");
const byOutput = api2.queryReceiptsByOutput("file-2");
test.assert(byOutput.length === 1 && byOutput[0].id === created2.receiptId, "output objects can be traced back to their receipt");
const foreignProject = api2.queryReceipts({ projectId: "project-other", limit: 10 });
test.assert(foreignProject.length === 0, "receipts never leak across projects");

// Provenance vocabulary: input vs affected vs output are distinct. A review
// that only inspects a manuscript must never claim the manuscript as output.
const provenanceCtx = createReceiptsContext();
const provenanceApi = provenanceCtx.context.window.AISystem6RunReceipts;
const reviewed = await provenanceApi.createReceipt({
  sourceAppId: "reviewDesk",
  intent: "review",
  inputObjectIds: ["manuscript-1"],
});
await provenanceApi.finishReceipt(reviewed.receiptId, {
  status: "completed",
  affectedObjectIds: ["manuscript-1"],
});
const reviewedRecord = provenanceCtx.chatFiles.find((file) => file.id === reviewed.receiptId).runReceipt;
test.assert(
  reviewedRecord.outputObjectIds.length === 0 && !reviewedRecord.outputObjectIds.includes("manuscript-1"),
  "an inspected manuscript is not recorded as produced output"
);
test.assert(
  reviewedRecord.affectedObjectIds.includes("manuscript-1") && reviewedRecord.inputObjectIds.includes("manuscript-1"),
  "an inspected manuscript is recorded as input and affected, not output"
);
test.assert(
  provenanceApi.queryReceiptsByOutput("manuscript-1").length === 0,
  "Get Info Produced-by finds nothing for an inspected-only manuscript"
);
const produced = await provenanceApi.createReceipt({
  sourceAppId: "projectCd",
  intent: "attach",
  inputObjectIds: ["manuscript-1"],
});
await provenanceApi.finishReceipt(produced.receiptId, { status: "completed", outputObjectIds: ["cd-item-1"] });
test.assert(
  provenanceApi.queryReceiptsByOutput("cd-item-1").length === 1,
  "a durable artifact is traced back to its producing receipt"
);

// Model/provider honesty: the receipt records only what the runtime actually
// resolved and wrote via updateReceipt; it never guesses the active model.
const modelCtx = createReceiptsContext();
const modelApi = modelCtx.context.window.AISystem6RunReceipts;
const modelRun = await modelApi.createReceipt({ sourceAppId: "docMap", intent: "map", inputObjectIds: ["file-2"] });
let modelRecord = modelCtx.chatFiles.find((file) => file.id === modelRun.receiptId).runReceipt;
test.assert(modelRecord.model === "" && modelRecord.provider === "", "a receipt starts with no guessed model or provider");
await modelApi.updateReceipt(modelRun.receiptId, { provider: "local", model: "foo" });
modelRecord = modelCtx.chatFiles.find((file) => file.id === modelRun.receiptId).runReceipt;
test.assert(modelRecord.model === "foo" && modelRecord.provider === "local", "updateReceipt records the model the runtime actually used");
const noModelRun = await modelApi.createReceipt({ sourceAppId: "clioStage", intent: "present", inputObjectIds: [] });
const noModelRecord = modelCtx.chatFiles.find((file) => file.id === noModelRun.receiptId).runReceipt;
test.assert(noModelRecord.model === "" && noModelRecord.provider === "", "an operation that never resolves a model stays unclaimed");

// Attempts: a run can spend several tries before a model answer lands (a
// streamed call that failed and was retried, a local reply repaired by a
// second call). The receipt keeps the model that finally answered AND the
// earlier tries, so "which model wrote this" and "what else was tried" are
// both answerable from one record \u2014 still only verifiable routing facts.
const attemptsCtx = createReceiptsContext();
const attemptsApi = attemptsCtx.context.window.AISystem6RunReceipts;
const twoAttempts = await attemptsApi.createReceipt({
  sourceAppId: "clioTalk",
  intent: "chat",
  provider: "cloud",
  model: "final-model",
  attempts: [
    { model: "stream-model", provider: "cloud", outcome: "stream-failed", at: "2026-01-01T10:00:00.000Z" },
    { model: "final-model", provider: "cloud", outcome: "answered", at: "2026-01-01T10:00:05.000Z" },
  ],
});
let attemptsRecord = attemptsCtx.chatFiles.find((file) => file.id === twoAttempts.receiptId).runReceipt;
test.assert(
  attemptsRecord.attempts.length === 2 && attemptsRecord.attempts[0].model === "stream-model" && attemptsRecord.attempts[1].model === "final-model",
  "a receipt keeps every attempt, in the order they happened"
);
test.assert(
  attemptsRecord.model === "final-model" && attemptsRecord.attempts[1].model === "final-model",
  "the receipt keeps both the model that finally answered and the earlier tries"
);
test.assert(
  attemptsRecord.attempts[0].outcome === "stream-failed" && attemptsRecord.attempts[0].at === "2026-01-01T10:00:00.000Z",
  "an attempt carries its outcome word and timestamp"
);
test.assert(attemptsRecord.attempts[0].prompt === undefined, "an attempt carries no prompt or reasoning text");

// An attempt with no model and no provider says nothing verifiable: drop it.
await attemptsApi.updateReceipt(twoAttempts.receiptId, {
  attempts: [
    { model: "stream-model", provider: "cloud", outcome: "stream-failed" },
    { model: "", provider: "", outcome: "answered" },
    { model: "repair-model", provider: "local", outcome: "answered" },
  ],
});
attemptsRecord = attemptsCtx.chatFiles.find((file) => file.id === twoAttempts.receiptId).runReceipt;
test.assert(
  attemptsRecord.attempts.length === 2 && attemptsRecord.attempts.every((attempt) => attempt.model || attempt.provider),
  "updateReceipt normalizes the attempts patch and drops empty attempts"
);
test.assert(attemptsRecord.attempts[1].model === "repair-model", "the surviving attempts keep their order after normalization");

const attemptsBody = attemptsCtx.chatFiles.find((file) => file.id === twoAttempts.receiptId).body;
test.assertIncludes(attemptsBody, "- Attempts: stream-model [cloud] stream-failed; repair-model [local] answered", "the body prints each attempt as model [provider] outcome");
test.assert(!attemptsBody.includes("- Attempts: stream-model [cloud] stream-failed (2026"), "the Attempts line stays readable and carries no timestamp");

// Back-compat: a record without attempts \u2014 or a caller passing a non-array \u2014
// normalizes to an empty array, never null or undefined, so an old record
// still loads and still prints a readable Attempts line.
const bareRun = await attemptsApi.createReceipt({ sourceAppId: "docMap", intent: "map", attempts: null });
const bareRecord = attemptsCtx.chatFiles.find((file) => file.id === bareRun.receiptId).runReceipt;
test.assert(Array.isArray(bareRecord.attempts) && bareRecord.attempts.length === 0, "a receipt without attempts loads with an empty attempts array");
test.assert(bareRecord.attempts !== null && bareRecord.attempts !== undefined, "a missing attempts value normalizes to an empty array, never null or undefined");
const legacyRecord = attemptsApi.buildRunReceiptRecord({ sourceAppId: "docMap", intent: "map" });
test.assert(Array.isArray(legacyRecord.attempts) && legacyRecord.attempts.length === 0, "an old record built without attempts stays loadable");
const bareBody = attemptsCtx.chatFiles.find((file) => file.id === bareRun.receiptId).body;
test.assertIncludes(bareBody, "- Attempts: \u2014", "the Attempts line shows an em dash when there are no attempts");

const answeredWithAttempts = await attemptsApi.recordModelAnswer({
  projectId: "project-1",
  sourceAppId: "quickDraft",
  intent: "draft",
  provider: "cloud",
  model: "final-model",
  answerText: "A draft that took two tries to arrive.",
  attempts: [{ model: "stream-model", provider: "cloud", outcome: "stream-failed", at: "2026-01-01T10:00:00.000Z" }],
});
const answeredWithAttemptsRecord = attemptsCtx.chatFiles.find((file) => file.id === answeredWithAttempts.receiptId).runReceipt;
test.assert(
  answeredWithAttemptsRecord.attempts.length === 1 && answeredWithAttemptsRecord.attempts[0].model === "stream-model",
  "recordModelAnswer passes the attempts it was given to the receipt"
);

// Reload recovery: a fresh module instance over the same backing store can
// still read receipts written before the reload.
const reloaded = createReceiptsContext({ chatFiles: second.chatFiles });
const afterReload = reloaded.context.window.AISystem6RunReceipts.queryReceipts({ projectId: "project-1", limit: 10, includeRunning: true });
test.assert(afterReload.length === 2, "receipts survive a reload of the runtime");

// Backup -> restore identity remapping is covered by the real remapBackup()
// fixture in project-backup-integrity.test.mjs. A structuredClone round-trip
// here would fake a restore without the id remap and assert nothing real, so
// it is intentionally not repeated in this module.

// Privacy: the serialized receipt and its body never contain secrets.
const serialized = JSON.stringify(second.chatFiles);
test.assert(
  forbiddenSecrets.every((needle) => !serialized.toLowerCase().includes(needle)),
  "serialized receipts contain no API keys, secrets, or chain-of-thought"
);

// Read-only instances refuse to write.
const readOnly = createReceiptsContext({ readOnly: true });
const denied = await readOnly.context.window.AISystem6RunReceipts.createReceipt({ sourceAppId: "docMap", intent: "map" });
test.assert(denied.ok === false && denied.reason === "read-only", "read-only instances refuse receipt creation");
test.assert(readOnly.statusCalls.length > 0, "the read-only refusal is visible");

// Persist failure rolls back / rejects without a phantom file.
const failingStore = {
  projects: {
    commit: async () => {
      throw new Error("persist failed");
    },
  },
};
const failing = createReceiptsContext({ store: failingStore });
const failedWrite = await failing.context.window.AISystem6RunReceipts.createReceipt({ sourceAppId: "docMap", intent: "map" });
test.assert(failedWrite.ok === false && failedWrite.reason === "persist-failed", "a failed persist surfaces as a receipt failure");

// Repeat This Run re-dispatches the stored contract.
const repeatRegistry = {
  dispatchApplicationIntent: async (appId, payload) => {
    repeatRegistry.calls.push({ appId, payload });
    return { ok: true };
  },
  calls: [],
};
const repeatCtx = createReceiptsContext({ registry: repeatRegistry });
const repeatApi = repeatCtx.context.window.AISystem6RunReceipts;
const repeatReceipt = await repeatApi.createReceipt({
  sourceAppId: "docMap",
  intent: "map",
  inputObjectIds: ["file-1"],
  replayContract: { appId: "docMap", intent: "map", inputObjectIds: ["file-1"] },
});
repeatCtx.chatFiles.unshift({ id: "file-1", projectId: "project-1", type: "text", body: "x" });
const replayed = await repeatApi.repeatReceipt(repeatReceipt.receiptId);
test.assert(replayed.ok === true && repeatRegistry.calls.length === 1, "Repeat This Run re-dispatches the stored contract");
test.assert(repeatRegistry.calls[0].appId === "docMap" && repeatRegistry.calls[0].payload.intent === "map", "the replay keeps app and intent");

repeatCtx.chatFiles.splice(repeatCtx.chatFiles.findIndex((file) => file.id === "file-1"), 1);
const missingInputs = await repeatApi.repeatReceipt(repeatReceipt.receiptId);
test.assert(missingInputs.ok === false, "a repeat with missing inputs fails explicitly");

// 2026-09-01 charter rule: "temporary, but never lost." A model answer is
// written to the receipt store the instant it arrives, before any decision
// about whether it lands in the writer's prose — and an answer that never
// lands stays honestly marked unadopted, not silently dropped. This is what
// every model-call site in quick-draft-ai.js, quick-draft-composition.js,
// quick-draft-listen.js, outline-claim.js, translation.js, hkrr-review.js and
// chat-messages.js (ClioTalk replies) now calls through, via
// recordModelAnswer.
test.assertIncludes(receiptsSource, "async function recordModelAnswer", "a single shared helper records a model answer the moment it arrives");
test.assertIncludes(receiptsSource, "recordModelAnswer,", "recordModelAnswer is exported on the shared receipts API");

const answerCtx = createReceiptsContext();
const answerApi = answerCtx.context.window.AISystem6RunReceipts;

const empty = await answerApi.recordModelAnswer({ projectId: "project-1", sourceAppId: "quickDraft", intent: "draft", answerText: "   " });
test.assert(empty.ok === false, "an empty answer is not worth a receipt");

const arrived = await answerApi.recordModelAnswer({
  projectId: "project-1",
  sourceAppId: "quickDraft",
  intent: "draft",
  provider: "cloud",
  model: "deepseek-v4",
  answerText: "This is the model's full draft body, paid for and delivered.",
});
test.assert(arrived.ok === true && !!arrived.receiptId, "the answer is durable the instant it arrives");
let arrivedRecord = answerCtx.chatFiles.find((file) => file.id === arrived.receiptId).runReceipt;
test.assert(arrivedRecord.status === "completed", "the run is complete: an answer came back");
test.assert(arrivedRecord.proposal.includes("paid for and delivered"), "the full answer text is recoverable from the receipt, not just a summary");
test.assert(arrivedRecord.userAction === "", "before any landing decision, the receipt does not yet claim adoption");

let arrivedFile = answerCtx.chatFiles.find((file) => file.id === arrived.receiptId);
let arrivedBody = arrivedFile.body;
test.assertIncludes(arrivedBody, "Adopted: no", "an unadopted-but-delivered answer says so honestly in its own body");
test.assertIncludes(arrivedBody, "reuse it here instead of running the command again", "the receipt makes cost already paid obvious, so the command is not re-run for nothing");

// The writer discards this one (a placeholder draft, a sentinel violation, a
// declined confirm dialog) — the answer is still sitting in the Versions /
// Run Records surfaces, never claimed as saved or inserted.
const declined = await answerApi.recordModelAnswer({
  projectId: "project-1",
  sourceAppId: "outline",
  intent: "polish-draft",
  answerText: "A polished section the writer declined to keep.",
});
const declinedRecord = answerCtx.chatFiles.find((file) => file.id === declined.receiptId).runReceipt;
test.assert(declinedRecord.userAction === "", "a declined answer is never marked adopted");
test.assert(declinedRecord.status === "completed", "a declined answer is not reported as a failed run — it answered fine, the writer just did not use it");

// The writer adopts a different one — recordUserAction is the same
// checkpoint machinery the ClioTalk suggestion flow already used, now reused
// for every writing-route command's landing decision.
const adopted = await answerApi.recordModelAnswer({
  projectId: "project-1",
  sourceAppId: "quickDraft",
  intent: "listen-fix-one",
  answerText: "The rewritten sentence that actually replaced the original.",
});
await answerApi.recordUserAction(adopted.receiptId, { action: "accept", finalBodyHash: "fnv1a-9" });
const adoptedRecord = answerCtx.chatFiles.find((file) => file.id === adopted.receiptId).runReceipt;
test.assert(adoptedRecord.userAction === "accept", "an adopted answer is marked accepted through the existing checkpoint action");
const adoptedBody = answerCtx.chatFiles.find((file) => file.id === adopted.receiptId).body;
test.assertIncludes(adoptedBody, "Adopted: yes", "an adopted answer says so honestly, with no reuse nudge");
test.assert(!adoptedBody.includes("reuse it here"), "an adopted answer carries no leftover cost-reuse nudge");

// Every call site this rule reaches — grepped so the contract fails loudly if
// a future edit routes a call site around the shared helper instead of
// through it.
const quickDraftAi = read("app/features/quick-draft-ai.js");
const quickDraftComposition = read("app/features/quick-draft-composition.js");
const quickDraftListen = read("app/features/quick-draft-listen.js");
const outlineClaim = read("app/features/outline-claim.js");
const translation = read("app/features/translation.js");
const hkrrReview = read("app/features/hkrr-review.js");
const chatMessages = read("app/core/chat-messages.js");
[
  ["quick-draft-ai.js (Quick Draft's four request sites)", quickDraftAi],
  ["quick-draft-composition.js (adjustment-layer composite)", quickDraftComposition],
  ["quick-draft-listen.js (fix-one)", quickDraftListen],
  ["outline-claim.js (generate/expand/organize/polish/suggest/claim-check)", outlineClaim],
  ["translation.js (Review Desk style check)", translation],
  ["hkrr-review.js (Review Desk HKRR)", hkrrReview],
  ["chat-messages.js (ClioTalk replies)", chatMessages],
].forEach(([label, source]) => {
  test.assertIncludes(source, "recordModelAnswer", `${label} routes its model answer through the shared receipt helper`);
});

// A receipt names the model that ANSWERED, not the one the desk happens to
// have selected. The ClioTalk reply used to write currentTranslationModel() —
// the local model display name — onto every receipt, so a cloud run, a
// fallback and a repaired run all reported a model that never saw the
// question. The served model comes off the run manifest the transport fills
// in, and when the transport did not say, the receipt says nothing.
test.assertIncludes(chatMessages, "const servedModelName = String(runManifest?.servedModel", "the receipt reads the served model off the run manifest");
test.assertNotIncludes(
  chatMessages.slice(chatMessages.indexOf("function createClioTalkAssistantRecord")),
  "model: currentTranslationModel()",
  "and never substitutes the desk's current model selection",
);
test.assertIncludes(chatMessages, "function noteClioTalkModelAttempt", "each attempt in a run is recorded as it happens");
test.assertIncludes(chatMessages, 'outcome: "stream-failed"', "a stream that produced no answer stays visible as an attempt");
test.assertIncludes(chatMessages, "attempts: modelAttempts", "and the attempts travel with the receipt the answer creates");

// One obvious way to name the served model. The helper prefers what the
// transport actually stamped (ai_system6_metrics.model), falls back to a bare
// data.model, and stays empty for a reply that says neither rather than
// borrowing the desk's current selection.
test.assertIncludes(receiptsSource, "function servedModelFromResponse(data)", "run receipts define a single served-model helper");
test.assertIncludes(receiptsSource, "servedModelFromResponse,", "servedModelFromResponse is exported on the shared receipts API");
const servedModelContext = createReceiptsContext();
const servedModelApi = servedModelContext.context.window.AISystem6RunReceipts;
test.assert(typeof servedModelApi.servedModelFromResponse === "function", "the served-model helper is callable on the frozen API");
test.assert(
  servedModelApi.servedModelFromResponse({ ai_system6_metrics: { model: "deepseek-v4" } }) === "deepseek-v4",
  "the helper prefers the model the transport stamped on ai_system6_metrics"
);
test.assert(
  servedModelApi.servedModelFromResponse({ ai_system6_metrics: { model: "deepseek-v4" }, model: "ignored-fallback" }) === "deepseek-v4",
  "a stamped metric wins over a bare data.model"
);
test.assert(
  servedModelApi.servedModelFromResponse({ model: "gpt-local" }) === "gpt-local",
  "the helper falls back to a bare data.model when no metric is stamped"
);
test.assert(
  servedModelApi.servedModelFromResponse({}) === "" && servedModelApi.servedModelFromResponse(null) === "",
  "a reply that names no model stays empty rather than borrowing a name"
);

// Both Review Desk receipt sites take the model from the reply that arrived,
// never from the desk's current local selection. The request payloads in these
// files keep naming the local model — that one is the model being ASKED, and
// it is correct there; only the receipt's answer is at stake.
const receiptModelFromReply = 'model: window.AISystem6RunReceipts?.servedModelFromResponse?.(data) || "",';
const receiptModelFromSelection = 'model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : "",';
test.assertIncludes(hkrrReview, receiptModelFromReply, "the HKRR receipt names the model that answered");
test.assertNotIncludes(hkrrReview, receiptModelFromSelection, "and no longer the desk's local selection");
test.assertIncludes(translation, receiptModelFromReply, "the style-check receipt names the model that answered");
test.assertNotIncludes(translation, receiptModelFromSelection, "and no longer the desk's local selection");

// outline-claim.js is the streaming route: its answers arrive as a stream, so
// the served model comes off the stream callback rather than a parsed reply.
// The module records what the stream named, every stream in the file reports
// it, and the receipt no longer falls back to the desk's local selection.
test.assertIncludes(outlineClaim, "function noteServedWritingModel", "outline-claim records the model the stream served");
const servedModelStreamReports = outlineClaim.split("onModel: noteServedWritingModel").length - 1;
test.assert(
  servedModelStreamReports >= 6,
  "every writing-route stream in outline-claim reports the served model"
);
test.assertNotIncludes(
  outlineClaim,
  "model: model || (typeof getLocalModelRequestName",
  "the outline-claim receipt no longer falls back to the desk's local selection"
);
test.assertIncludes(outlineClaim, "lastServedWritingModel = \"\";\n  const record", "a served model is spent once, so a later run cannot inherit it") ;

// The class gate. A receipt's model is a fact about the answer, so no call site
// may fill it from the desk's current selection: getLocalModelRequestName() and
// currentTranslationModel() both read what would be asked NEXT, and on the
// cloud route the local name is not even the right one. Quick Draft's
// quickDraftConnectedModelName() is allowed — it follows the route and returns
// "" when nothing is connected, which is a claim about this run.
const forbiddenReceiptModelSources = ["getLocalModelRequestName", "currentTranslationModel"];
for (const [label, source] of [
  ["quick-draft-ai.js", quickDraftAi],
  ["quick-draft-composition.js", quickDraftComposition],
  ["quick-draft-listen.js", quickDraftListen],
  ["outline-claim.js", outlineClaim],
  ["translation.js", translation],
  ["hkrr-review.js", hkrrReview],
  ["chat-messages.js", chatMessages],
]) {
  const blocks = [];
  let cursor = source.indexOf("recordModelAnswer");
  while (cursor >= 0) {
    blocks.push(source.slice(cursor, source.indexOf("answerText", cursor) + 40));
    cursor = source.indexOf("recordModelAnswer", cursor + 1);
  }
  const offenders = blocks.filter((block) => forbiddenReceiptModelSources.some((name) => block.includes(name)));
  test.assert(
    offenders.length === 0,
    `${label} never fills a receipt's model from the desk's current selection`,
  );
}

test.finish();
