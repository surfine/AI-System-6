// Document revisions: durable version history for key writing nodes.
//
// The rule that each writing phase has exactly one editable owner is
// unchanged; revisions are read-only snapshots. They are created at explicit
// save, before AI proposals, on proposal acceptance, at phase transitions, on
// Project CD burn, on backup import/restore, and before maintenance repairs —
// never on every keystroke.
//
// Storage is per-document inside the keyval store
// ("documentRevisions:<projectId>:<documentId>"), capped per document. AI
// output stays a proposal until the user accepts it; acceptance moves the
// revision head. The UI is the existing File menu ("Versions…"), not a new
// top-level application.

const maxDocumentRevisions = 200;
const documentRevisionCache = new Map();

function documentRevisionStorageKey(projectId, documentId) {
  return `documentRevisions:${String(projectId || "")}:${String(documentId || "")}`;
}

function revisionContentHash(body = "") {
  let hash = 0x811c9dc5;
  const value = String(body || "");
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function cachedRevisions(projectId, documentId) {
  const key = documentRevisionStorageKey(projectId, documentId);
  if (!documentRevisionCache.has(key)) documentRevisionCache.set(key, []);
  return documentRevisionCache.get(key);
}

async function readStoredRevisions(projectId, documentId) {
  let db;
  try {
    db = await openAppDb();
    const stored = await window.AISystem6StorageTransactions.runTransaction(
      db,
      keyvalStoreName,
      "readonly",
      (tx) => idbRequest(tx.objectStore(keyvalStoreName).get(documentRevisionStorageKey(projectId, documentId)))
    );
    if (Array.isArray(stored)) {
      documentRevisionCache.set(documentRevisionStorageKey(projectId, documentId), stored);
    }
  } catch (error) {
    console.warn("Could not read document revisions.", error);
  } finally {
    db?.close();
  }
}

async function persistRevisions(projectId, documentId) {
  let db;
  try {
    db = await openAppDb();
    await window.AISystem6StorageTransactions.runTransaction(
      db,
      keyvalStoreName,
      "readwrite",
      (tx) => idbRequest(
        tx.objectStore(keyvalStoreName).put(
          cachedRevisions(projectId, documentId),
          documentRevisionStorageKey(projectId, documentId)
        )
      )
    );
  } catch (error) {
    console.warn("Could not persist document revisions.", error);
  } finally {
    db?.close();
  }
}

function createDocumentRevision({
  projectId = activeProjectId,
  documentId = activeTextFileId || "",
  phase = typeof teachTextWorkflowState === "string" ? teachTextWorkflowState : "",
  body = typeof teachTextBodyInput !== "undefined" ? teachTextBodyInput?.value || "" : "",
  origin = "system",
  operation = "revision",
  runRecordId = "",
  parentRevisionId = "",
} = {}) {
  if (!projectId || !documentId) return null;
  const revisions = cachedRevisions(projectId, documentId);
  const contentHash = revisionContentHash(body);
  const latest = revisions[0];
  if (latest && latest.contentHash === contentHash && latest.origin === origin && latest.operation === operation) {
    return latest;
  }
  const revision = {
    id: crypto.randomUUID(),
    projectId,
    documentId,
    parentRevisionId: String(parentRevisionId || latest?.id || ""),
    phase: String(phase || ""),
    body: String(body || ""),
    contentHash,
    origin: String(origin || "system"),
    operation: String(operation || "revision"),
    runRecordId: String(runRecordId || ""),
    createdAt: new Date().toISOString(),
  };
  revisions.unshift(revision);
  if (revisions.length > maxDocumentRevisions) revisions.length = maxDocumentRevisions;
  persistRevisions(projectId, documentId);
  return revision;
}

async function listDocumentRevisions(documentId = activeTextFileId || "", projectId = activeProjectId) {
  if (!documentId || !projectId) return [];
  await readStoredRevisions(projectId, documentId);
  return cachedRevisions(projectId, documentId);
}

function compareDocumentRevisions(olderRevision, newerRevision) {
  const older = String(olderRevision?.body || "").split("\n");
  const newer = String(newerRevision?.body || "").split("\n");
  const olderSet = new Set(older);
  const newerSet = new Set(newer);
  const addedLines = newer.filter((line) => !olderSet.has(line));
  const removedLines = older.filter((line) => !newerSet.has(line));
  return {
    olderId: olderRevision?.id || "",
    newerId: newerRevision?.id || "",
    olderLines: older.length,
    newerLines: newer.length,
    addedLines,
    removedLines,
    unchanged: older.length + newer.length - addedLines.length - removedLines.length,
  };
}

async function restoreDocumentRevision(revision) {
  if (!revision?.id || !revision.projectId || !revision.documentId) return false;
  const target = chatFiles.find((file) => file.id === revision.documentId && file.projectId === revision.projectId && file.type === "text");
  if (!target) return false;
  createDocumentRevision({
    projectId: revision.projectId,
    documentId: revision.documentId,
    phase: revision.phase,
    body: target.body,
    origin: "system",
    operation: "restore-before",
    parentRevisionId: revision.id,
  });
  target.body = String(revision.body || "");
  target.updatedAt = new Date().toISOString();
  if (target.id === activeTextFileId) {
    teachTextBodyInput.value = target.body;
    markTeachTextModified();
    refreshTeachTextDocumentState();
  }
  createDocumentRevision({
    projectId: revision.projectId,
    documentId: revision.documentId,
    phase: revision.phase,
    body: target.body,
    origin: "system",
    operation: "restore",
    parentRevisionId: revision.id,
  });
  saveDeskState();
  renderDocuments?.();
  renderProjectDisks?.();
  return true;
}

function renderDocumentVersionsList() {
  const listEl = document.querySelector("#document-versions-list");
  if (!listEl) return;
  const documentId = activeTextFileId || "";
  listDocumentRevisions(documentId).then((revisions) => {
    listEl.replaceChildren();
    if (!revisions.length) {
      const empty = document.createElement("p");
      empty.className = "empty-folder-note";
      empty.textContent = t("versions_empty");
      listEl.append(empty);
      return;
    }
    revisions.slice(0, 40).forEach((revision) => {
      const label = document.createElement("label");
      label.className = "versions-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "version-pick";
      checkbox.value = revision.id;
      const summary = document.createElement("span");
      const when = new Date(revision.createdAt).toLocaleString();
      const parts = [when, revision.operation, revision.origin, revision.contentHash.slice(0, 8)];
      if (revision.runRecordId) {
        const run = getProjectFiles?.().find((file) => file.id === revision.runRecordId && file.artifactKind === "clio-run-record");
        parts.push(run ? `Run: ${run.name}` : `Run: ${revision.runRecordId.slice(0, 8)}`);
      }
      summary.textContent = parts.join(" · ");
      label.append(checkbox, summary);
      if (revision.runRecordId) {
        const run = getProjectFiles?.().find((file) => file.id === revision.runRecordId && file.artifactKind === "clio-run-record");
        if (run) {
          const openRun = document.createElement("button");
          openRun.type = "button";
          openRun.className = "btn mini-btn";
          openRun.textContent = t("versions_open_run");
          openRun.addEventListener("click", () => {
            selectedChatFileId = run.id;
            openWindow("documents");
          });
          label.append(openRun);
        }
      }
      listEl.append(label);
    });
  });
}

async function compareSelectedDocumentVersions() {
  const revisions = await listDocumentRevisions();
  let checked = [...document.querySelectorAll("#document-versions-list input:checked")];
  if (checked.length !== 2 && revisions.length >= 2) {
    // Default to the two most recent revisions when fewer than two are picked.
    const latest = revisions.slice(0, 2);
    checked = latest.map((revision) => ({ value: revision.id }));
  }
  const selected = checked.map((input) => revisions.find((revision) => revision.id === input.value)).filter(Boolean).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (selected.length !== 2) {
    setStatus(t("versions_compare_need_two"));
    return;
  }
  const diff = compareDocumentRevisions(selected[0], selected[1]);
  const lines = [
    t("versions_compare_title"),
    `${selected[0].createdAt} → ${selected[1].createdAt}`,
    `+ ${diff.addedLines.length} / - ${diff.removedLines.length}`,
    ...(selected[1].runRecordId ? [`Run record: ${selected[1].runRecordId}`] : []),
    "",
    "--- added ---",
    ...diff.addedLines.slice(0, 40),
    "--- removed ---",
    ...diff.removedLines.slice(0, 40),
  ];
  const body = document.querySelector("#document-versions-diff");
  if (body) body.textContent = lines.join("\n");
}

async function restoreSelectedDocumentVersion() {
  const checked = document.querySelector("#document-versions-list input:checked");
  if (!checked) {
    setStatus(t("versions_restore_none"));
    return;
  }
  const revisions = await listDocumentRevisions();
  const revision = revisions.find((entry) => entry.id === checked.value);
  if (revision && await restoreDocumentRevision(revision)) {
    setStatus(t("versions_restored"));
  }
}

async function openDocumentVersions() {
  const dialog = document.querySelector("#document-versions-modal");
  if (!dialog) {
    setStatus(t("versions_unavailable"));
    return;
  }
  const diffEl = document.querySelector("#document-versions-diff");
  if (diffEl) diffEl.textContent = "";
  renderDocumentVersionsList();
  modalScrim.classList.remove("is-hidden");
  dialog.showModal();
}

window.AISystem6DocumentRevisions = Object.freeze({
  create: createDocumentRevision,
  list: listDocumentRevisions,
  compare: compareDocumentRevisions,
  restore: restoreDocumentRevision,
  open: openDocumentVersions,
});
