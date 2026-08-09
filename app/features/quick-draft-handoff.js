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

async function saveQuickDraftAsProjectDocument() {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const markdown = quickDraftDocumentMarkdown(slot.record);
  if (!markdown) {
    setQuickDraftStatus(t("quick_draft_empty_body"));
    refs.draft?.focus();
    return false;
  }
  const title = String(refs.titleInput?.value || titleFromBody(markdown) || t("quick_draft_title")).trim();
  const result = await commitQuickDraftProjectDocument({
    projectId: slot.project.id,
    title,
    body: markdown,
    existingDocumentId: slot.record.workspace.projectDocId,
  });
  setQuickDraftStatus(t(result.repairNeeded ? "quick_draft_repair_needed" : result.ok ? "quick_draft_project_doc_saved" : "quick_draft_save_failed"));
  return result.ok;
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
