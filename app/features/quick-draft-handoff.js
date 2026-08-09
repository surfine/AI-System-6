// 钟点稿 / Quick Draft — delivery.
//
// The explicit "done" actions: save the draft as a Project Hard Disk
// document, send it to TeachText, send it to Review Desk, or hand it to the
// main writing flow. Every delivery write is awaited and reports its own
// success or failure; a failure never shows as success and never claims the
// draft was saved.

/**
 * @param {{projectId?: string, title?: string, body?: string, existingDocumentId?: string}} options
 */
async function commitQuickDraftProjectDocument({ projectId = "", title = "", body = "", existingDocumentId = "" } = {}) {
  const project = projects.find((item) => item.id === projectId);
  if (!project || !String(body || "").trim()) return { ok: false, documentId: "", repairNeeded: false };

  const previousFolders = chatFolders.filter((folder) => folder.projectId === projectId).map((folder) => structuredClone(folder));
  const previousQuickDraft = structuredClone(project.quickDraft || blankQuickDraft());
  const previousBackupReminderShownAt = project.backupReminderShownAt || "";
  const previousSelectedId = selectedChatFileId;
  const existing = existingDocumentId
    ? chatFiles.find((file) => file.id === existingDocumentId && file.projectId === projectId && file.type === "text")
    : null;
  const previousFile = existing ? structuredClone(existing) : null;
  const now = new Date().toISOString();
  const folder = typeof ensureFolder === "function" ? ensureFolder(t("documents"), null) : null;
  const file = existing || {
    id: crypto.randomUUID(),
    projectId,
    type: "text",
    name: typeof nextAvailableProjectFileName === "function" ? nextAvailableProjectFileName(title, projectId) : title,
    folderId: folder?.id || "",
    source: "Quick Draft",
    durable: true,
    label: "draft",
    createdAt: now,
  };
  file.name = existing ? title : file.name;
  file.body = body;
  file.folderId = folder?.id || file.folderId || "";
  file.updatedAt = now;
  if (!existing) chatFiles.unshift(file);
  const shouldRemindBackup = !previousBackupReminderShownAt
    && !chatFiles.some((item) => item.projectId === projectId && item.id !== file.id && item.durable && item.type === "text");
  if (shouldRemindBackup) project.backupReminderShownAt = now;
  project.quickDraft = normalizeQuickDraftRecord({
    ...project.quickDraft,
    workspace: {
      ...normalizeQuickDraftRecord(project.quickDraft).workspace,
      projectDocId: file.id,
      savedStatus: "saved",
      updatedAt: now,
    },
  });

  let saved = false;
  try {
    saved = typeof saveDeskState === "function" ? await saveDeskState() : true;
  } catch {
    saved = false;
  }
  if (saved) {
    selectedChatFileId = file.id;
    if (typeof renderDocuments === "function") renderDocuments();
    if (typeof renderProjectDisks === "function") renderProjectDisks();
    if (shouldRemindBackup && typeof pushSystemNotification === "function") {
      pushSystemNotification(t("first_work_backup_reminder"), {
        state: "saved",
        actionId: "export-project-backup",
        actionLabel: t("export_project_backup"),
      });
    }
    return { ok: true, documentId: file.id, repairNeeded: false };
  }

  chatFolders.splice(
    0,
    chatFolders.length,
    ...chatFolders.filter((folder) => folder.projectId !== projectId),
    ...previousFolders.map((folder) => structuredClone(folder))
  );
  if (previousFile) {
    const target = chatFiles.find((item) => item.id === previousFile.id);
    if (target) Object.assign(target, structuredClone(previousFile));
    else chatFiles.unshift(structuredClone(previousFile));
  } else {
    const index = chatFiles.findIndex((item) => item.id === file.id);
    if (index >= 0) chatFiles.splice(index, 1);
  }
  project.quickDraft = previousQuickDraft;
  project.backupReminderShownAt = previousBackupReminderShownAt;
  selectedChatFileId = previousSelectedId;

  let rollbackSaved = false;
  try {
    rollbackSaved = typeof saveDeskState === "function" ? await saveDeskState() : true;
  } catch {
    rollbackSaved = false;
  }
  if (!rollbackSaved && typeof pushSystemNotification === "function") {
    pushSystemNotification(t("quick_draft_repair_needed"), { state: "failed", windowName: "quickDraft" });
  }
  return { ok: false, documentId: "", repairNeeded: !rollbackSaved };
}

async function saveQuickDraftAsProjectDocumentFor(projectId) {
  const slot = projectQuickDraft(projectId, { create: false });
  if (!slot) {
    if (projectId === activeProjectId) setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const markdown = quickDraftDocumentMarkdown(slot.record);
  if (!markdown) {
    if (projectId === activeProjectId) {
      setQuickDraftStatus(t("quick_draft_empty_body"));
      refs.draft?.focus();
    }
    return false;
  }
  const title = String(
    (projectId === activeProjectId ? refs.titleInput?.value : "")
    || titleFromBody(markdown)
    || t("quick_draft_title")
  ).trim();
  const result = await commitQuickDraftProjectDocument({
    projectId,
    title,
    body: markdown,
    existingDocumentId: slot.record.workspace.projectDocId,
  });
  if (projectId === activeProjectId) {
    setQuickDraftStatus(t(result.repairNeeded ? "quick_draft_repair_needed" : result.ok ? "quick_draft_project_doc_saved" : "quick_draft_save_failed"));
  }
  return result.ok;
}

function saveQuickDraftAsProjectDocument() {
  return saveQuickDraftAsProjectDocumentFor(activeProjectId);
}

// A New draft keeps the user's format/scenario preferences but gets a fresh
// identity: no projectDocId, no versions, no composite, no protects.
function freshQuickDraftWorkspaceAfterNew(previousRecord) {
  const blank = blankQuickDraftWorkspace();
  const previousWorkspace = normalizeQuickDraftRecord(previousRecord).workspace;
  return {
    ...blank,
    intake: {
      ...blank.intake,
      setup: {
        ...blank.intake.setup,
        scenario: previousWorkspace.intake.setup.scenario,
        targetDuration: previousWorkspace.intake.setup.targetDuration,
      },
    },
  };
}

async function transferQuickDraftToTeachText() {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  if (!quickDraftDocumentMarkdown(slot.record)) return false;
  if (!await saveQuickDraftAsProjectDocument()) return false;
  const documentId = activeProjectQuickDraft({ create: false })?.record.workspace.projectDocId;
  if (!documentId || !window.AISystem6TeachText?.openDocument?.(documentId)) return false;
  setQuickDraftStatus(t("quick_draft_teachtext_done"));
  return true;
}

async function sendQuickDraftToReviewDesk() {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  if (!quickDraftDocumentMarkdown(slot.record)) {
    setQuickDraftStatus(t("quick_draft_empty_body"));
    refs.draft?.focus();
    return false;
  }
  if (!await saveQuickDraftAsProjectDocument()) return false;
  const documentId = activeProjectQuickDraft({ create: false })?.record.workspace.projectDocId;
  if (!documentId || !await window.AISystem6ReviewDesk?.openDocument?.({ documentId, mode: "facts" })) return false;
  setQuickDraftStatus(t("quick_draft_review_done"));
  return true;
}

async function switchToMultiFinder() {
  const committed = await commitQuickDraft({});
  if (!committed.ok) return false;
  const switched = await setFinderEnvironment("multifinder", { persistStartup: true, announce: false });
  if (!switched) return false;
  ensureRunningApp("quickDraft", "quickDraft");
  setQuickDraftStatus(t("quick_draft_multifinder_done"));
  return true;
}

// Standard Save: flush the textarea into the workspace, durable-commit, and
// resolve with a boolean. Receipts (saving → saved / modified) are owned by
// the commit machinery so a failed persist can never leave a Saved receipt.
async function saveQuickDraftNow() {
  const slot = activeProjectQuickDraft({ create: false });
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const committed = await commitQuickDraft({});
  if (!committed.ok) {
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  return true;
}

// Standard New contract:
//   A) empty desk → blank draft, no confirm;
//   B) body + durable Project Document → flush, update the document, blank;
//   C) body without a Project Document → explicit "Save & New" (default),
//      save creates a reopenable document, then blank.
// A failed save aborts New and leaves the old draft untouched.
async function newQuickDraftDocument() {
  const slot = activeProjectQuickDraft({ create: false });
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const projectId = slot.project.id;
  const record = normalizeQuickDraftRecord(slot.record);
  const hasBody = Boolean(String(refs.draft?.value || record.workspace.body || "").trim());
  const openBlank = async () => {
    const fresh = await commitQuickDraftForProject(projectId, {
      workspace: freshQuickDraftWorkspaceAfterNew(record),
    });
    if (!fresh.ok) {
      setQuickDraftStatus(t("quick_draft_save_failed"));
      return false;
    }
    renderQuickDraft(fresh.record || activeProjectQuickDraft({ create: false })?.record);
    focusQuickDraftPaper();
    setQuickDraftStatus(t("quick_draft_ready"));
    return true;
  };

  // Case A: nothing to preserve.
  if (!hasBody) return openBlank();

  // Case C: the draft was never saved as a Project document, so New must ask
  // to save it first; a bare "start a new draft?" would lose the old draft.
  if (!record.workspace.projectDocId) {
    if (typeof showSystemModal === "function") {
      const choice = await showSystemModal(
        t("quick_draft_new_save_confirm"),
        "confirm",
        { confirmKey: "quick_draft_new_save_button", defaultAction: "yes" }
      );
      if (choice !== "yes") return false;
    }
    const saved = await saveQuickDraftAsProjectDocumentFor(projectId);
    if (!saved) {
      setQuickDraftStatus(t("quick_draft_save_failed"));
      return false;
    }
    return openBlank();
  }

  // Case B: durable document exists — flush the working draft, update the
  // document, then open a fresh blank workspace.
  const flushed = await commitQuickDraftForProject(projectId, {}, { captureForm: true });
  if (!flushed.ok) {
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  const markdown = quickDraftDocumentMarkdown(flushed.record);
  const title = String(refs.titleInput?.value || titleFromBody(markdown) || t("quick_draft_title")).trim();
  const updated = await commitQuickDraftProjectDocument({
    projectId,
    title,
    body: markdown,
    existingDocumentId: record.workspace.projectDocId,
  });
  if (!updated.ok) {
    setQuickDraftStatus(t(updated.repairNeeded ? "quick_draft_repair_needed" : "quick_draft_save_failed"));
    return false;
  }
  return openBlank();
}

// Standard Close: the window layer flushes any pending or Modified workspace
// before hiding; this is the public entry so the command router never touches
// Draft Desk internals.
async function closeQuickDraftWindow() {
  if (typeof closeWindow !== "function") return false;
  await closeWindow("quickDraft");
  return true;
}

// Module boot (runs last in the lazy chain, after every sibling has loaded):
// wire the window, register the working-session adapter, and publish the API.
bind();
if (typeof registerWorkingSessionAdapter === "function") {
  registerWorkingSessionAdapter({
    id: "quickDraft",
    capture: captureWorkingSession,
    restore: restoreWorkingSession,
  });
}

window.AISystem6QuickDraftLoaded = true;
window.AISystem6QuickDraft = Object.freeze({
  open,
  render: renderQuickDraft,
  request: requestQuickDraft,
  askClioTalk,
  captureVentText,
  setVentMode,
  clearVentLog,
  ventEntryCount,
  isVentIntakeActive,
  importChatScreenshots,
  togglePreview: toggleQuickDraftPreview,
  toggleComposite: toggleQuickDraftComposite,
  previewMode: currentQuickDraftDisplayMode,
  displayMode: currentQuickDraftDisplayMode,
  setDisplayMode: setQuickDraftDisplayMode,
  panelVisible: quickDraftPanelVisible,
  togglePanel: toggleQuickDraftPanel,
  hasInput: () => quickDraftInteractionState().hasInput,
  hasOrganizableMaterial: () => quickDraftInteractionState().hasOrganizableMaterial,
  paperSurface: () => quickDraftPaperSurface,
  setPaperSurface: (surface) => setQuickDraftPaperSurface(surface, { manual: true }),
  protectSelection: protectSelectionFromTextarea,
  applyAdjustments: applyAdjustmentLayers,
  develop: developAdjustmentLayers,
  hasBody: () => Boolean(String(refs.draft?.value || activeProjectQuickDraft({ create: false })?.record?.workspace?.body || "").trim()),
  modelAvailable: quickDraftModelAvailable,
  canPreviewAdjustments: () => Boolean(
    quickDraftModelAvailable()
    && String(refs.draft?.value || activeProjectQuickDraft({ create: false })?.record?.workspace?.body || "").trim()
    && enabledAdjustmentLayers(activeProjectQuickDraft({ create: false })?.record).length
  ),
  canDevelop: () => currentCompositeState(activeProjectQuickDraft({ create: false })?.record).ready,
  copyMarkdown: copyQuickDraftMarkdown,
  shareMarkdown: shareQuickDraftMarkdown,
  save: saveQuickDraftNow,
  newDocument: newQuickDraftDocument,
  close: closeQuickDraftWindow,
  share: shareQuickDraftMarkdown,
  collectVentOutline,
  adoptFirstImpression,
  startWritingNow,
  runClioTalkAction,
  sendToTeachText: transferQuickDraftToTeachText,
  transferQuickDraftToTeachText,
  sendQuickDraftToReviewDesk,
  saveQuickDraftAsProjectDocument,
  getContextSnapshot: () => quickDraftContextSnapshot(activeProjectQuickDraft({ create: false })?.record || {}),
});

window.AISystem6QuickDraftHandoff = Object.freeze({
  commitQuickDraftProjectDocument,
  saveQuickDraftAsProjectDocument,
  sendQuickDraftToReviewDesk,
  switchToMultiFinder,
  transferQuickDraftToTeachText,
});
