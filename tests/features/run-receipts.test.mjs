// Run Receipt contracts: one durable project-scoped record, lifecycle
// terminal states, read-vs-write honesty, checkpoint accept/edit/reject
// recording (edit records the final user version), reload and
// backup/restore recovery, repeat-from-contract, and a hard guarantee that
// receipts never contain secrets or chain-of-thought.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("run-receipts");
const manifest = read("scripts/runtime-manifest.mjs");
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
        updater({ projects: [] });
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

// Reload recovery: a fresh module instance over the same backing store can
// still read receipts written before the reload.
const reloaded = createReceiptsContext({ chatFiles: second.chatFiles });
const afterReload = reloaded.context.window.AISystem6RunReceipts.queryReceipts({ projectId: "project-1", limit: 10, includeRunning: true });
test.assert(afterReload.length === 2, "receipts survive a reload of the runtime");

// Backup -> restore keeps the records and their relationships.
const backup = structuredClone(second.chatFiles);
second.chatFiles.splice(0, second.chatFiles.length);
second.chatFiles.push(...structuredClone(backup));
const afterRestore = second.context.window.AISystem6RunReceipts.queryReceiptsByOutput("file-2");
test.assert(afterRestore.length === 1, "receipts and output relations survive backup -> restore");

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

test.finish();
