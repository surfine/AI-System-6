// @ts-check
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

// The route manuscript is a document long before it is a file. Every entry
// point here keyed history on activeTextFileId, which stays empty until the
// writer saves — so createDocumentRevision returned null and Versions… listed
// nothing for exactly the person this history exists for: someone who has
// never saved and has just watched a command replace their words. The
// manuscript's durable identity is its project, so it gets one.
const routeManuscriptDocumentPrefix = "manuscript:";

function routeManuscriptDocumentId(projectId = activeProjectId) {
  return projectId ? `${routeManuscriptDocumentPrefix}${projectId}` : "";
}

function isRouteManuscriptDocumentId(documentId) {
  return String(documentId || "").startsWith(routeManuscriptDocumentPrefix);
}

// Which document the writer is looking at, for history purposes. A saved file
// answers with its own id; an unsaved route manuscript answers with its
// project's. Anything else has no history to keep.
function currentRevisionDocumentId() {
  if (activeTextFileId) return activeTextFileId;
  const isManuscript = typeof isTeachTextManuscriptRole === "function" && isTeachTextManuscriptRole();
  return isManuscript ? routeManuscriptDocumentId() : "";
}

function documentRevisionStorageKey(projectId, documentId) {
  return `documentRevisions:${String(projectId || "")}:${String(documentId || "")}`;
}

// A route manuscript keeps its history when it becomes a file. Finalizing
// saves the manuscript to disk for the first time, which gives it a file id --
// and the pre-command revision, recorded moments earlier under the project's
// manuscript id, would then be listed under a document the writer can no
// longer reach. Versions… would be empty at the exact moment it is needed.
// Seen live: the 98 words were protected and the list showed nothing.
async function adoptRouteManuscriptHistory(projectId, documentId) {
  if (!projectId || !documentId || isRouteManuscriptDocumentId(documentId)) return;
  // Only the manuscript the writer is looking at may adopt: another document's
  // file id must never inherit this project's manuscript history.
  if (documentId !== activeTextFileId) return;
  if (typeof isTeachTextManuscriptRole === "function" && !isTeachTextManuscriptRole()) return;
  const target = cachedRevisions(projectId, documentId);
  if (target.length) return;
  const manuscriptId = routeManuscriptDocumentId(projectId);
  if (!manuscriptId) return;
  await readStoredRevisions(projectId, manuscriptId);
  const source = cachedRevisions(projectId, manuscriptId);
  if (!source.length) return;
  target.push(...source.map((entry) => ({ ...entry, documentId })));
  documentRevisionCache.set(documentRevisionStorageKey(projectId, manuscriptId), []);
  try {
    await persistRevisions(projectId, documentId);
    await persistRevisions(projectId, manuscriptId);
  } catch (error) {
    // The move did not reach disk. The in-memory list still shows the whole
    // history, and the next write will try again.
    console.warn("Could not carry the manuscript's history onto its new file.", error);
  }
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
    // Version history is user data: a failed write must reach the caller so
    // the destructive operation it protects can be aborted instead of
    // silently losing the recovery point.
    console.warn("Could not persist document revisions.", error);
    throw error;
  } finally {
    db?.close();
  }
}

async function createDocumentRevision({
  projectId = activeProjectId,
  documentId = currentRevisionDocumentId(),
  phase = typeof teachTextWorkflowState === "string" ? teachTextWorkflowState : "",
  body = typeof teachTextBodyInput !== "undefined" ? teachTextBodyInput?.value || "" : "",
  origin = "system",
  operation = "revision",
  runRecordId = "",
  parentRevisionId = "",
} = {}) {
  if (!projectId || !documentId) return null;
  await adoptRouteManuscriptHistory(projectId, documentId);
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
  try {
    await persistRevisions(projectId, documentId);
    return revision;
  } catch (error) {
    // Roll the in-memory entry back so a failed write never leaves a
    // revision that claims to be durable.
    const index = revisions.indexOf(revision);
    if (index >= 0) revisions.splice(index, 1);
    throw error;
  }
}

async function listDocumentRevisions(documentId = currentRevisionDocumentId(), projectId = activeProjectId) {
  if (!documentId || !projectId) return [];
  await readStoredRevisions(projectId, documentId);
  await adoptRouteManuscriptHistory(projectId, documentId);
  return cachedRevisions(projectId, documentId);
}

/**
 * Longest-common-subsequence line diff. Correctly handles repeated lines and
 * moved paragraphs, which a set-based comparison cannot. For pathological
 * sizes the LCS table is capped and a prefix/suffix-trimmed set diff is used.
 * @param {string[]} older
 * @param {string[]} newer
 */
function lcsLineDiff(older, newer) {
  const m = older.length;
  const n = newer.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i][j] = older[i] === newer[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const addedLines = [];
  const removedLines = [];
  const unchangedLines = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (older[i] === newer[j]) {
      unchangedLines.push(newer[j]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      removedLines.push(older[i]);
      i += 1;
    } else {
      addedLines.push(newer[j]);
      j += 1;
    }
  }
  while (i < m) removedLines.push(older[i++]);
  while (j < n) addedLines.push(newer[j++]);
  return { addedLines, removedLines, unchangedLines };
}

function compareDocumentRevisions(olderRevision, newerRevision) {
  const older = String(olderRevision?.body || "").split("\n");
  const newer = String(newerRevision?.body || "").split("\n");

  // Trim the common prefix and suffix first: the LCS table then only covers
  // the genuinely changed middle, which is both faster and keeps the diff
  // anchored for documents that mostly grew or shrank at the ends.
  let start = 0;
  while (start < older.length && start < newer.length && older[start] === newer[start]) start += 1;
  let olderEnd = older.length;
  let newerEnd = newer.length;
  while (olderEnd > start && newerEnd > start && older[olderEnd - 1] === newer[newerEnd - 1]) {
    olderEnd -= 1;
    newerEnd -= 1;
  }
  const olderCore = older.slice(start, olderEnd);
  const newerCore = newer.slice(start, newerEnd);

  const maxLcsCells = 1_000_000;
  let coreDiff;
  if (olderCore.length * newerCore.length <= maxLcsCells) {
    coreDiff = lcsLineDiff(olderCore, newerCore);
  } else {
    const olderSet = new Set(olderCore);
    const newerSet = new Set(newerCore);
    coreDiff = {
      addedLines: newerCore.filter((line) => !olderSet.has(line)),
      removedLines: olderCore.filter((line) => !newerSet.has(line)),
      unchangedLines: [],
    };
  }
  const unchangedLines = [
    ...older.slice(0, start),
    ...coreDiff.unchangedLines,
    ...older.slice(olderEnd),
  ];
  return {
    olderId: olderRevision?.id || "",
    newerId: newerRevision?.id || "",
    olderLines: older.length,
    newerLines: newer.length,
    addedLines: coreDiff.addedLines,
    removedLines: coreDiff.removedLines,
    unchangedLines,
    unchanged: unchangedLines.length,
  };
}

// The route manuscript has no chatFiles record to write back into: it lives in
// the project's own document (project.outline), which the manuscript field
// shows as prose. Same promise as the file path — protect what is on the paper
// now BEFORE replacing it, and roll everything back if the write is refused.
async function restoreRouteManuscriptRevision(revision) {
  const project = projects.find((item) => item.id === revision.projectId);
  if (!project) return false;
  const paper = typeof teachTextBodyInput !== "undefined" ? teachTextBodyInput : null;
  const previous = {
    outline: project.outline,
    updatedAt: project.updatedAt,
    body: paper ? paper.value : undefined,
    statusKey: typeof teachTextStatusEl !== "undefined" ? teachTextStatusEl?.dataset?.statusKey || "" : "",
  };
  try {
    await createDocumentRevision({
      projectId: revision.projectId,
      documentId: revision.documentId,
      phase: revision.phase,
      body: paper ? paper.value : String(project.outline || ""),
      origin: "system",
      operation: "restore-before",
      parentRevisionId: revision.id,
    });
  } catch (error) {
    setStatus?.(t?.("versions_restore_failed") || "Could not save the pre-restore revision; the document was not changed.");
    return false;
  }
  const restored = String(revision.body || "");
  // setProjectOutlineMarkdown is the one road into the record and it stamps
  // record ids on the way in; it lives in the lazy route module, so fall back
  // to a plain write when the route has not been loaded.
  if (typeof setProjectOutlineMarkdown === "function") setProjectOutlineMarkdown(project, restored);
  else project.outline = restored;
  project.updatedAt = new Date().toISOString();
  if (paper) {
    paper.value = restored;
    if (typeof markTeachTextModified === "function") markTeachTextModified();
  }
  const saved = await saveDeskState();
  if (!saved) {
    project.outline = previous.outline;
    project.updatedAt = previous.updatedAt;
    if (paper && previous.body !== undefined) paper.value = previous.body;
    if (previous.statusKey && typeof setTeachTextStatus === "function") setTeachTextStatus(previous.statusKey);
    setStatus?.(t?.("versions_restore_persist_failed") || "Could not save the restored document; nothing was changed.");
    return false;
  }
  if (typeof renderPipeline === "function") renderPipeline();
  try {
    await createDocumentRevision({
      projectId: revision.projectId,
      documentId: revision.documentId,
      phase: revision.phase,
      body: restored,
      origin: "system",
      operation: "restore",
      parentRevisionId: revision.id,
    });
  } catch (error) {
    setStatus?.(t?.("versions_restore_revision_failed") || "The document was restored, but the restore revision could not be saved.");
  }
  return true;
}

async function restoreDocumentRevision(revision) {
  if (!revision?.id || !revision.projectId || !revision.documentId) return false;
  if (isRouteManuscriptDocumentId(revision.documentId)) {
    return restoreRouteManuscriptRevision(revision);
  }
  const target = chatFiles.find((file) => file.id === revision.documentId && file.projectId === revision.projectId && file.type === "text");
  if (!target) return false;
  try {
    await createDocumentRevision({
      projectId: revision.projectId,
      documentId: revision.documentId,
      phase: revision.phase,
      body: target.body,
      origin: "system",
      operation: "restore-before",
      parentRevisionId: revision.id,
    });
  } catch (error) {
    // The old state could not be protected; do not overwrite it.
    setStatus?.(t?.("versions_restore_failed") || "Could not save the pre-restore revision; the document was not changed.");
    return false;
  }
  const previous = {
    body: target.body,
    updatedAt: target.updatedAt,
    textareaBody: target.id === activeTextFileId && typeof teachTextBodyInput !== "undefined" ? teachTextBodyInput?.value : undefined,
    statusKey: typeof teachTextStatusEl !== "undefined" ? teachTextStatusEl?.dataset?.statusKey || "" : "",
  };
  target.body = String(revision.body || "");
  target.updatedAt = new Date().toISOString();
  if (target.id === activeTextFileId) {
    teachTextBodyInput.value = target.body;
    markTeachTextModified();
    refreshTeachTextDocumentState();
  }
  const saved = await saveDeskState();
  if (!saved) {
    // The new body never landed on disk: roll back the in-memory document,
    // the textarea, and the modified/status state so a reload shows the
    // pre-restore version.
    target.body = previous.body;
    target.updatedAt = previous.updatedAt;
    if (target.id === activeTextFileId) {
      if (previous.textareaBody !== undefined) teachTextBodyInput.value = previous.textareaBody;
      if (previous.statusKey && typeof setTeachTextStatus === "function") setTeachTextStatus(previous.statusKey);
      if (typeof refreshTeachTextDocumentState === "function") refreshTeachTextDocumentState();
    }
    renderDocuments?.();
    renderProjectDisks?.();
    setStatus?.(t?.("versions_restore_persist_failed") || "Could not save the restored document; nothing was changed.");
    return false;
  }
  try {
    await createDocumentRevision({
      projectId: revision.projectId,
      documentId: revision.documentId,
      phase: revision.phase,
      body: target.body,
      origin: "system",
      operation: "restore",
      parentRevisionId: revision.id,
    });
  } catch (error) {
    console.warn("Restore applied, but the restore revision could not be persisted.", error);
    setStatus?.(t?.("versions_restore_revision_failed") || "The document was restored, but the restore revision could not be saved.");
  }
  renderDocuments?.();
  renderProjectDisks?.();
  return true;
}

function renderDocumentVersionsList() {
  const listEl = document.querySelector("#document-versions-list");
  if (!listEl) return;
  const documentId = currentRevisionDocumentId();
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
  const selected = checked
    .map((input) => revisions.find((revision) => revision.id === /** @type {HTMLInputElement} */ (input).value))
    .filter(Boolean)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (selected.length !== 2) {
    setStatus(t("versions_compare_need_two"));
    return;
  }
  const diff = compareDocumentRevisions(selected[0], selected[1]);
  const lines = [
    t("versions_compare_title"),
    `${selected[0].createdAt} → ${selected[1].createdAt}`,
    `+ ${diff.addedLines.length} / - ${diff.removedLines.length} / = ${diff.unchanged}`,
    ...(selected[1].runRecordId ? [`Run record: ${selected[1].runRecordId}`] : []),
    "",
    "--- added ---",
    ...diff.addedLines.slice(0, 40),
    "--- removed ---",
    ...diff.removedLines.slice(0, 40),
    "--- unchanged ---",
    ...diff.unchangedLines.slice(0, 20),
  ];
  const body = document.querySelector("#document-versions-diff");
  if (body) body.textContent = lines.join("\n");
}

async function restoreSelectedDocumentVersion() {
  const checked = /** @type {HTMLInputElement | null} */ (document.querySelector("#document-versions-list input:checked"));
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
  /** @type {HTMLDialogElement} */ (dialog).showModal();
}

window.AISystem6DocumentRevisions = Object.freeze({
  create: createDocumentRevision,
  list: listDocumentRevisions,
  compare: compareDocumentRevisions,
  restore: restoreDocumentRevision,
  open: openDocumentVersions,
});
