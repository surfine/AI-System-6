// Run Receipts — durable, project-scoped records of AI operations.
//
// This extends the existing clio-run-record artifact (one system, no second
// parallel store): new records carry schemaVersion 2 with unified fields and
// live in the same "ClioTalk / Run Records" folder; legacy schemaVersion 1
// records stay readable. A receipt records objectively verifiable run facts
// only — never API keys, provider secrets, or chain-of-thought.
//
// Receipts are ordinary project files, so backup/export/restore, the write
// lease, and saveDeskState already cover them. Writes go through the Project
// Store commit so a failed persist rolls the in-memory state back.

const runReceiptSchemaVersion = 2;
const runReceiptStatuses = Object.freeze(["running", "completed", "failed", "cancelled", "interrupted"]);
const runReceiptTerminalStatuses = new Set(["completed", "failed", "cancelled", "interrupted"]);
const runReceiptArtifactKind = "clio-run-record";
const runReceiptListeners = new Set();

function runReceiptStatusIsTerminal(status) {
  return runReceiptTerminalStatuses.has(String(status || ""));
}

function runReceiptNow() {
  return new Date().toISOString();
}

function runReceiptUuid(prefix = "receipt") {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeRunReceiptScope(scope) {
  if (!scope || typeof scope !== "object") return { sourceIds: [], citationIds: [] };
  return {
    sourceIds: [...new Set((scope.sourceIds || []).map(String).filter(Boolean))],
    citationIds: [...new Set((scope.citationIds || []).map(String).filter(Boolean))],
  };
}

function ensureRunReceiptsFolder() {
  if (typeof ensureFolder !== "function") return null;
  const parent = ensureFolder("ClioTalk", null);
  return ensureFolder("Run Records", parent?.id || null);
}

function buildRunReceiptRecord(input = {}, now = runReceiptNow()) {
  return {
    schemaVersion: runReceiptSchemaVersion,
    runId: String(input.runId || runReceiptUuid()),
    projectId: String(input.projectId || ""),
    sourceAppId: String(input.sourceAppId || ""),
    intent: String(input.intent || ""),
    operation: String(input.intent || ""),
    startedAt: String(input.startedAt || now),
    finishedAt: "",
    sourceScope: normalizeRunReceiptScope(input.sourceScope),
    inputObjectIds: [...new Set((input.inputObjectIds || []).map(String).filter(Boolean))],
    affectedObjectIds: [...new Set((input.affectedObjectIds || []).map(String).filter(Boolean))],
    provider: String(input.provider || ""),
    model: String(input.model || ""),
    allowedTools: [],
    toolInvocations: [],
    proposal: "",
    checkpointState: "none",
    userAction: "",
    finalBodyHash: "",
    outputObjectIds: [],
    destination: "",
    status: "running",
    publicErrorReason: "",
    replayContract: input.replayContract || null,
  };
}

function runReceiptDefaultName(record) {
  const stamp = String(record.startedAt || "").replace("T", " ").replace(/\.\d{3}Z$/, "");
  const app = String(record.sourceAppId || "");
  const intent = String(record.intent || "run");
  return `Run ${stamp}${app ? ` · ${app}` : ""}${intent && app ? ` · ${intent}` : ""}`;
}

function formatRunReceiptBody(record = {}) {
  const tools = Array.isArray(record.toolInvocations) ? record.toolInvocations : [];
  const lines = [
    `Run Receipt · ${record.sourceAppId || "—"} · ${record.status || "running"}`,
    `- Run: ${record.runId || "—"}`,
    `- App / intent: ${record.sourceAppId || "—"} / ${record.intent || "—"}`,
    `- Started: ${record.startedAt || "—"}`,
    `- Finished: ${record.finishedAt || "—"}`,
    `- Project: ${record.projectId || "—"}`,
    `- Inputs: ${(record.inputObjectIds || []).join(", ") || "—"}`,
    `- Affected: ${(record.affectedObjectIds || []).join(", ") || "—"}`,
    `- Provider / model: ${record.provider || "—"} / ${record.model || "—"}`,
    `- Allowed tools: ${(record.allowedTools || []).join(", ") || "—"}`,
    `- Tool calls: ${tools.length ? tools.map((tool) => `${tool.name} [${tool.effect || ""}] ${tool.ok ? "ok" : "failed"}`).join("; ") : "—"}`,
    `- Proposal: ${record.proposal || "—"}`,
    `- Checkpoint: ${record.checkpointState || "none"}`,
    `- User action: ${record.userAction || "—"}${record.finalBodyHash ? ` (final body ${record.finalBodyHash})` : ""}`,
    `- Outputs: ${(record.outputObjectIds || []).join(", ") || "—"}`,
    `- Destination: ${record.destination || "—"}`,
    `- Error: ${record.publicErrorReason || "—"}`,
  ];
  return lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n").trim();
}

function runReceiptFileFromRecord(record, options = {}) {
  const now = runReceiptNow();
  const folder = ensureRunReceiptsFolder();
  const folderId = folder?.id || null;
  const displayName = String(options.name || runReceiptDefaultName(record));
  const body = String(options.body || formatRunReceiptBody(record));
  return {
    id: options.id || runReceiptUuid("receipt-file"),
    projectId: String(record.projectId || ""),
    folderId,
    type: "text",
    artifactKind: runReceiptArtifactKind,
    name: typeof nextAvailableFileName === "function"
      ? nextAvailableFileName(displayName, folderId)
      : displayName,
    body,
    hash: typeof contentHash === "function" ? contentHash(body) : "",
    runReceipt: record,
    createdAt: now,
    updatedAt: now,
    ...(options.extraFields && typeof options.extraFields === "object" ? options.extraFields : {}),
  };
}

function refreshReceiptFileBody(file) {
  if (!file?.runReceipt) return;
  const body = formatRunReceiptBody(file.runReceipt);
  file.body = body;
  file.hash = typeof contentHash === "function" ? contentHash(body) : "";
  file.updatedAt = runReceiptNow();
}

async function persistReceiptFile(file) {
  if (!file) return { ok: false, reason: "missing" };
  if (typeof window.AISystem6WriteLease?.isReadOnly === "function" && window.AISystem6WriteLease.isReadOnly()) {
    if (typeof setStatus === "function") setStatus(t("read_only"));
    return { ok: false, reason: "read-only" };
  }
  if (typeof chatFiles === "undefined") return { ok: false, reason: "no-store" };
  try {
    if (typeof window.AISystem6StateStores?.projects?.commit === "function") {
      await window.AISystem6StateStores.projects.commit(() => {
        const index = chatFiles.findIndex((item) => item.id === file.id);
        if (index >= 0) chatFiles[index] = file;
        else chatFiles.unshift(file);
      });
    } else {
      const index = chatFiles.findIndex((item) => item.id === file.id);
      if (index >= 0) chatFiles[index] = file;
      else chatFiles.unshift(file);
      const saved = typeof saveDeskState === "function" ? await saveDeskState() : true;
      if (!saved) return { ok: false, reason: "persist-failed" };
    }
  } catch (error) {
    console.warn("Run receipt persistence failed.", error);
    return { ok: false, reason: "persist-failed", error };
  }
  if (typeof renderDocuments === "function") renderDocuments();
  if (typeof renderProjectDisks === "function") renderProjectDisks();
  runReceiptListeners.forEach((listener) => {
    try {
      listener({ receiptId: file.id, file });
    } catch (error) {
      console.warn("Run receipt listener failed.", error);
    }
  });
  return { ok: true, file };
}

// Synchronous variant for callers with a sync contract (the ClioTalk Run
// Record adapter). It uses the same single write path and listener fan-out;
// durability is best-effort via saveDeskState() like the legacy behavior.
function persistReceiptFileSync(file) {
  if (!file) return { ok: false, reason: "missing" };
  if (typeof chatFiles === "undefined") return { ok: false, reason: "no-store" };
  const index = chatFiles.findIndex((item) => item.id === file.id);
  if (index >= 0) chatFiles[index] = file;
  else chatFiles.unshift(file);
  if (typeof saveDeskState === "function") saveDeskState();
  if (typeof renderDocuments === "function") renderDocuments();
  if (typeof renderProjectDisks === "function") renderProjectDisks();
  runReceiptListeners.forEach((listener) => {
    try {
      listener({ receiptId: file.id, file });
    } catch (error) {
      console.warn("Run receipt listener failed.", error);
    }
  });
  return { ok: true, file };
}

function findReceiptFile(receiptId) {
  const id = String(receiptId || "");
  if (!id || typeof chatFiles === "undefined") return null;
  return chatFiles.find((file) => file?.id === id && file?.artifactKind === runReceiptArtifactKind) || null;
}

async function createReceipt(input = {}) {
  if (typeof window.AISystem6WriteLease?.isReadOnly === "function" && window.AISystem6WriteLease.isReadOnly()) {
    if (typeof setStatus === "function") setStatus(t("read_only"));
    return { ok: false, reason: "read-only" };
  }
  const projectId = String(input.projectId || activeProjectId || "");
  if (!projectId) return { ok: false, reason: "no-project" };
  const record = buildRunReceiptRecord({ ...input, projectId });
  const file = runReceiptFileFromRecord(record, {
    name: input.name || "",
    extraFields: input.extraFields || null,
  });
  const persisted = await persistReceiptFile(file);
  if (!persisted.ok) return { ok: false, reason: persisted.reason || "persist-failed" };
  return { ok: true, receiptId: file.id, file, record };
}

async function updateReceipt(receiptId, patch = {}) {
  const file = findReceiptFile(receiptId);
  if (!file?.runReceipt) return { ok: false, reason: "missing" };
  const record = file.runReceipt;
  if (Object.prototype.hasOwnProperty.call(patch, "toolCalls") && Array.isArray(patch.toolCalls)) {
    record.toolInvocations = patch.toolCalls.map((tool) => ({
      name: String(tool?.name || ""),
      effect: String(tool?.effect || ""),
      ok: tool?.ok !== false,
      error: tool?.error ? String(tool.error) : "",
    }));
    record.allowedTools = [...new Set(record.toolInvocations.map((tool) => tool.name))];
  }
  if (Object.prototype.hasOwnProperty.call(patch, "allowedTools") && Array.isArray(patch.allowedTools)) {
    record.allowedTools = patch.allowedTools.map(String);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "proposal")) record.proposal = String(patch.proposal || "");
  if (Object.prototype.hasOwnProperty.call(patch, "provider")) record.provider = String(patch.provider || "");
  if (Object.prototype.hasOwnProperty.call(patch, "model")) record.model = String(patch.model || "");
  if (Object.prototype.hasOwnProperty.call(patch, "affectedObjectIds") && Array.isArray(patch.affectedObjectIds)) {
    record.affectedObjectIds = [...new Set(patch.affectedObjectIds.map(String).filter(Boolean))];
  }
  if (Object.prototype.hasOwnProperty.call(patch, "replayContract")) record.replayContract = patch.replayContract || null;
  refreshReceiptFileBody(file);
  return persistReceiptFile(file);
}

async function finishReceipt(receiptId, { status = "completed", outputObjectIds = [], affectedObjectIds = null, destination = "", publicErrorReason = "" } = {}) {
  const file = findReceiptFile(receiptId);
  if (!file?.runReceipt) return { ok: false, reason: "missing" };
  const record = file.runReceipt;
  const normalizedStatus = runReceiptStatuses.includes(status) ? status : "failed";
  record.status = normalizedStatus;
  if (runReceiptStatusIsTerminal(normalizedStatus) && !record.finishedAt) record.finishedAt = runReceiptNow();
  if (Array.isArray(outputObjectIds)) record.outputObjectIds = [...new Set(outputObjectIds.map(String).filter(Boolean))];
  if (Array.isArray(affectedObjectIds)) record.affectedObjectIds = [...new Set(affectedObjectIds.map(String).filter(Boolean))];
  if (destination) record.destination = String(destination);
  if (publicErrorReason) record.publicErrorReason = String(publicErrorReason);
  refreshReceiptFileBody(file);
  return persistReceiptFile(file);
}

async function recordUserAction(receiptId, { action = "", finalBodyHash = "" } = {}) {
  const normalized = ["accept", "edit", "reject"].includes(action) ? action : "";
  if (!normalized) return { ok: false, reason: "invalid-action" };
  const file = findReceiptFile(receiptId);
  if (!file?.runReceipt) return { ok: false, reason: "missing" };
  const record = file.runReceipt;
  record.userAction = normalized;
  record.checkpointState = normalized;
  if (finalBodyHash) record.finalBodyHash = String(finalBodyHash);
  refreshReceiptFileBody(file);
  return persistReceiptFile(file);
}

function getReceipt(receiptId) {
  return findReceiptFile(receiptId);
}

function queryReceipts({ projectId = "", limit = 20, includeRunning = false } = {}) {
  if (typeof chatFiles === "undefined") return [];
  const scope = String(projectId || activeProjectId || "");
  return chatFiles
    .filter((file) => file?.artifactKind === runReceiptArtifactKind)
    .filter((file) => !scope || String(file.projectId || "") === scope)
    .filter((file) => includeRunning || runReceiptStatusIsTerminal(String(file.runReceipt?.status || "completed")))
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
    .slice(0, Math.max(0, Number(limit) || 20));
}

function queryReceiptsByOutput(fileId) {
  const id = String(fileId || "");
  if (!id || typeof chatFiles === "undefined") return [];
  return chatFiles
    .filter((file) => file?.artifactKind === runReceiptArtifactKind)
    .filter((file) => {
      const record = file.runReceipt || file.runRecord || {};
      if (Array.isArray(record.outputObjectIds) && record.outputObjectIds.includes(id)) return true;
      if (record.resultUse?.targetId === id) return true;
      return false;
    })
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

function subscribeRunReceipts(listener) {
  if (typeof listener !== "function") return () => {};
  runReceiptListeners.add(listener);
  return () => runReceiptListeners.delete(listener);
}

async function repeatReceipt(receiptId, overrides = {}) {
  const file = findReceiptFile(receiptId);
  const record = file?.runReceipt;
  if (!record) return { ok: false, reason: "not-replayable" };
  const contract = record.replayContract || {
    appId: record.sourceAppId,
    intent: record.intent,
    inputObjectIds: record.inputObjectIds,
  };
  if (!contract?.appId || !contract?.intent || typeof chatFiles === "undefined") {
    return { ok: false, reason: "not-replayable" };
  }
  const inputs = (contract.inputObjectIds || [])
    .map((id) => chatFiles.find((item) => item.id === id && String(item.projectId || "") === String(record.projectId || "")))
    .filter(Boolean);
  if (inputs.length !== (contract.inputObjectIds || []).length) {
    return { ok: false, reason: "inputs-missing" };
  }
  if (typeof window.AISystem6ApplicationRegistry?.dispatchApplicationIntent !== "function") {
    return { ok: false, reason: "no-dispatcher" };
  }
  return window.AISystem6ApplicationRegistry.dispatchApplicationIntent(contract.appId, {
    intent: contract.intent,
    items: inputs,
    sourceAppId: "repeat",
    projectId: record.projectId,
    options: { repeatedFrom: receiptId, ...(overrides.options || {}) },
  });
}

window.AISystem6RunReceipts = Object.freeze({
  schemaVersion: runReceiptSchemaVersion,
  statuses: runReceiptStatuses,
  artifactKind: runReceiptArtifactKind,
  buildRunReceiptRecord,
  formatRunReceiptBody,
  ensureRunReceiptsFolder,
  persistReceiptFile,
  persistReceiptFileSync,
  createReceipt,
  updateReceipt,
  finishReceipt,
  recordUserAction,
  getReceipt,
  queryReceipts,
  queryReceiptsByOutput,
  subscribe: subscribeRunReceipts,
  repeatReceipt,
});
