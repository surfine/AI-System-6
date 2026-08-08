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
  const saved = saveQuickDraft({ workspace: { projectDocId: file.id } }, { debounce: false });
  if (saved?.workspace) saved.workspace.projectDocId = file.id;
  const persisted = await persistQuickDraftWorkspace();
  if (!persisted) {
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  selectedChatFileId = file.id;
  if (typeof renderDocuments === "function") renderDocuments();
  if (typeof renderProjectDisks === "function") renderProjectDisks();
  saveDeskState();
  setQuickDraftStatus(t("quick_draft_project_doc_saved"));
  return true;
}

async function transferQuickDraftToTeachText() {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  let markdown = quickDraftDocumentMarkdown(slot.record);
  if (!markdown) {
    const made = await requestQuickDraft("draft", { taskKind: "generate-first-body" });
    if (!made) return false;
    markdown = quickDraftDocumentMarkdown(activeProjectQuickDraft()?.record);
  }
  if (!markdown) return false;

  const result = await showSystemModal(t("quick_draft_transfer_confirm"), "confirm");
  if (result !== "yes") {
    setQuickDraftStatus(t("quick_draft_overwrite_cancelled"));
    return false;
  }

  if (typeof ensureWritingFlowModule === "function") await ensureWritingFlowModule();
  if (typeof setProjectOutlineMarkdown === "function") setProjectOutlineMarkdown(slot.project, markdown);
  slot.project.questionSheet = quickDraftQuestionSheetText(slot.record);
  slot.project.manuscriptLinkedToOutline = true;
  slot.project.flowState = {
    ...(slot.project.flowState || {}),
    topic: true,
    outline: true,
    drafting: true,
  };
  slot.project.quickDraft = {
    ...normalizeQuickDraftRecord(slot.project.quickDraft),
    workspace: normalizeQuickDraftWorkspace({
      ...slot.project.quickDraft?.workspace,
      ...workspaceSnapshot(slot.record),
      body: refs.draft?.value || "",
      updatedAt: new Date().toISOString(),
      savedStatus: "saved",
    }, slot.project.quickDraft),
    insertedAt: new Date().toISOString(),
  };
  slot.project.updatedAt = new Date().toISOString();
  if (typeof syncDraftsFromProjectOutline === "function") syncDraftsFromProjectOutline(slot.project);
  if (typeof syncOutlineDomFromProject === "function") syncOutlineDomFromProject(slot.project);
  if (typeof syncProjectOutlineToTeachText === "function") {
    syncProjectOutlineToTeachText(slot.project, { ai: true, open: true, focusPreview: false, markModified: false });
  } else {
    openWindow("teachText");
    if (teachTextBodyInput) teachTextBodyInput.value = markdown;
  }
  saveDeskState();
  setQuickDraftStatus(t("quick_draft_teachtext_done"));
  return true;
}

async function sendQuickDraftToReviewDesk() {
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
  saveQuickDraft({}, { debounce: false });
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
  saveQuickDraft({}, { debounce: false });
  runtimeEnvironment = "multifinder";
  startupEnvironment = "multifinder";
  startupOpenMode = normalizeStartupOpenMode(startupOpenMode, startupEnvironment);
  ensureRunningApp("writingStudio", "quickDraft");
  if (typeof updateQuickDraftFocusChrome === "function") updateQuickDraftFocusChrome();
  renderMultiFinderMenu();
  updateMenuState();
  await saveDeskState();
  setQuickDraftStatus(t("quick_draft_multifinder_done"));
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
  surfaceMode: () => quickDraftSurfaceMode,
  paperSurface: () => quickDraftPaperSurface,
  setView: (mode) => setQuickDraftSurface(mode === "canvas" ? "canvas" : "linear", { manual: true }),
  setPaperSurface: (surface) => setQuickDraftPaperSurface(surface, { manual: true }),
  protectSelection: protectSelectionFromTextarea,
  applyAdjustments: applyAdjustmentLayers,
  develop: developAdjustmentLayers,
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
