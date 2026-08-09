// 钟点稿 / Quick Draft — delivery.
//
// The explicit "done" actions: save the draft as a Project Hard Disk
// document, send it to TeachText, send it to Review Desk, or hand it to the
// main writing flow. Every delivery write is awaited and reports its own
// success or failure; a failure never shows as success and never claims the
// draft was saved.

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
  const now = new Date().toISOString();
  const title = String(refs.titleInput?.value || titleFromBody(markdown) || t("quick_draft_title")).trim();
  const folder = typeof ensureFolder === "function" ? ensureFolder(teachTextFolderInput?.value || t("documents")) : null;
  const existingId = slot.record.workspace.projectDocId;
  const existing = existingId ? chatFiles.find((file) => file.id === existingId && file.type === "text" && isInActiveProject(file)) : null;
  const previousFile = existing ? { ...existing } : null;
  const previousSelectedId = selectedChatFileId;
  const previousProjectDocId = slot.record.workspace.projectDocId;
  const file = existing || {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "text",
    name: typeof nextAvailableProjectFileName === "function" ? nextAvailableProjectFileName(title, activeProjectId) : title,
    folderId: folder?.id || "",
    source: "Quick Draft",
    durable: true,
    label: "draft",
    createdAt: now,
  };
  file.name = existing ? title : file.name;
  file.body = markdown;
  file.folderId = folder?.id || file.folderId || "";
  file.updatedAt = now;
  if (!existing) chatFiles.unshift(file);
  const committed = await commitQuickDraft({ workspace: { projectDocId: file.id } });
  if (!committed.ok) {
    if (previousFile) Object.assign(file, previousFile);
    else {
      const index = chatFiles.findIndex((item) => item.id === file.id);
      if (index >= 0) chatFiles.splice(index, 1);
    }
    selectedChatFileId = previousSelectedId;
    slot.project.quickDraft.workspace.projectDocId = previousProjectDocId;
    await saveDeskState();
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  selectedChatFileId = file.id;
  if (typeof renderDocuments === "function") renderDocuments();
  if (typeof renderProjectDisks === "function") renderProjectDisks();
  setQuickDraftStatus(t("quick_draft_project_doc_saved"));
  return true;
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
  if (!documentId || typeof openTextFile !== "function") return false;
  openTextFile(documentId);
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
  const durableSlot = activeProjectQuickDraft({ create: false });
  const file = chatFiles.find((item) => item.id === durableSlot?.record.workspace.projectDocId);
  const markdown = String(file?.body || "");
  if (!markdown) return false;
  await openWindow("reviewDesk");
  getWindow("reviewDesk")?.classList.remove("is-review-locked");
  if (reviewDeskBodyInput) {
    reviewDeskBodyInput.readOnly = false;
    reviewDeskBodyInput.classList.remove("is-hidden");
    reviewDeskBodyInput.value = markdown;
    reviewDeskBodyInput.scrollTop = 0;
    reviewDeskDirty = true;
  }
  reviewDeskPreviewEl?.classList.add("is-hidden");
  reviewDeskEmptyNoteEl?.classList.add("is-hidden");
  if (typeof setReviewDeskMode === "function") setReviewDeskMode("facts");
  if (typeof updateReviewDeskStats === "function") updateReviewDeskStats();
  if (typeof updateReviewDeskStatusTitle === "function") updateReviewDeskStatusTitle();
  if (typeof updateMenuState === "function") updateMenuState();
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
  previewMode: () => quickDraftPreviewMode,
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
  collectVentOutline,
  adoptFirstImpression,
  startWritingNow,
  runClioTalkAction,
  sendToTeachText: transferQuickDraftToTeachText,
  transferQuickDraftToTeachText,
  sendQuickDraftToReviewDesk,
  saveQuickDraftAsProjectDocument,
});

window.AISystem6QuickDraftHandoff = Object.freeze({
  saveQuickDraftAsProjectDocument,
  sendQuickDraftToReviewDesk,
  switchToMultiFinder,
  transferQuickDraftToTeachText,
});
