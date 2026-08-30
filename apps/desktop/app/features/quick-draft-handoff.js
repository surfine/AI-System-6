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
  const file = documentId
    ? chatFiles.find((item) => item.id === documentId && item.type === "text" && item.projectId === activeProjectId)
    : null;
  const dispatch = window.AISystem6ApplicationRegistry?.dispatchApplicationIntent;
  if (file && typeof dispatch === "function") {
    const result = await dispatch("teachText", { intent: "open", items: [file], sourceAppId: "quickDraft" });
    if (!result?.ok) return false;
    setQuickDraftStatus(t("quick_draft_teachtext_done"));
    return true;
  }
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
  const file = documentId
    ? chatFiles.find((item) => item.id === documentId && item.type === "text" && item.projectId === activeProjectId)
    : null;
  const dispatch = window.AISystem6ApplicationRegistry?.dispatchApplicationIntent;
  if (file && typeof dispatch === "function") {
    const result = await dispatch("reviewDesk", {
      intent: "open",
      items: [file],
      sourceAppId: "quickDraft",
      options: { mode: "facts" },
    });
    if (!result?.ok) return false;
    setQuickDraftStatus(t("quick_draft_review_done"));
    return true;
  }
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
// Entering 文字亮室 as a destination lands on the draft as it reads; the
// negative is one tab away. The display-mode switch opens this window too, so
// the opening view is chosen here, at the door. Choosing it inside
// openLightroomWindow would make the two call each other — they did, once, and
// the renderer stopped answering.
async function enterLightroom() {
  // The durable half loads here, at the door, because only ONE of the two
  // branches below reaches ensureDarkroomReady(). Putting the loader only
  // there left the desk-icon route — the cold-start route a first-time visitor
  // takes — opening the darkroom with its store never loaded, which is the
  // whole defect: it answers every read from a blank record and writes
  // nothing, silently. Found by opening it in a browser on a cold desk; the
  // contract could not see it, because it tested the wiring and not the path.
  if (typeof ensureDarkroomModule === "function") await ensureDarkroomModule();
  if (currentQuickDraftDisplayMode() === "body") setQuickDraftDisplayMode("read");
  else await openLightroomWindow();
}

window.AISystem6QuickDraft = Object.freeze({
  developDocument,
  open,
  openLightroom: enterLightroom,
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
  // What 文字亮室 needs to answer for its own menu bar.
  isReadOnlySubject: lightroomIsReadOnly,
  noteLightroomClosed,
  hasDraftSelection: hasQuickDraftSelection,
  hasVersions: () => lightroomMenuRows("versions").length > 0,
  hasComposite: () => Boolean(darkroomOf(activeProjectQuickDraft({ create: false })?.record).composite),
  lightroomMenuRows,
  syncMenuState: syncLightroomMenuState,
  hasInput: () => quickDraftInteractionState().hasInput,
  hasOrganizableMaterial: () => quickDraftInteractionState().hasOrganizableMaterial,
  paperSurface: () => quickDraftPhase(),
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

const QUICK_DRAFT_COMMAND_NAMES = [
  "quick-draft-open-writing-studio",
  "quick-draft-import-chat",
  "quick-draft-vent-on",
  "quick-draft-vent-off",
  "quick-draft-vent-summary",
  "quick-draft-compose",
  "quick-draft-apply",
  "quick-draft-develop",
  "quick-draft-view-body",
  "quick-draft-view-grain",
  "quick-draft-view-read",
  "quick-draft-view-listen",
  "quick-draft-toggle-materials",
  "quick-draft-toggle-adjustments",
  "quick-draft-toggle-sideask",
  "quick-draft-talk-points",
  "quick-draft-mingming",
  "quick-draft-luoluo",
  "quick-draft-hkrr",
  "quick-draft-praise",
  "quick-draft-save-project",
  "quick-draft-copy-markdown",
  "quick-draft-send-teachtext",
  "quick-draft-send-review",
];

function quickDraftCommandAvailable(action) {
  if (action === "open-quick-draft") return true;
  const activeWindow = /** @type {HTMLElement | null} */ (document.querySelector(".window.is-active"));
  const frontWindow = activeWindow?.dataset.window || "";
  // 文字亮室 is the second front window for the commands the two applications
  // share -- the three views, 试看 and 冲洗. Asking only for quickDraft is what
  // greyed the darkroom's whole menu bar the moment it came forward.
  const inDarkroom = frontWindow === "lightroom";
  if (!["quickDraft", "lightroom"].includes(frontWindow)) return false;
  const quickDraft = window.AISystem6QuickDraft;
  if (!quickDraft) return false;
  if (inDarkroom) {
    // In the darkroom only the shared commands exist; everything else on this
    // list belongs to the desk that writes.
    if (["quick-draft-view-grain", "quick-draft-view-read", "quick-draft-view-listen"].includes(action)) {
      return !!quickDraft.hasBody?.();
    }
    if (action === "quick-draft-view-body") return true;
    if (action === "quick-draft-apply") return !!quickDraft.canPreviewAdjustments?.();
    // Develop writes the document, so a subject this application does not own
    // never offers it, however ready the composite is.
    // Develop writes the proof back. With no proof it would write the body onto
    // itself and leave a version saying nothing happened, so the row waits for
    // 试看 rather than offering a move with no effect.
    if (action === "quick-draft-develop") {
      return !quickDraft.isReadOnlySubject?.()
        && !!quickDraft.hasBody?.()
        && !!quickDraft.hasComposite?.()
        && !!quickDraft.canDevelop?.();
    }
    return false;
  }
  if (action === "quick-draft-vent-on") return !quickDraft.isVentIntakeActive?.();
  if (action === "quick-draft-vent-off") return !!quickDraft.isVentIntakeActive?.();
  if (action === "quick-draft-vent-summary") return !!quickDraft.modelAvailable?.() && !!quickDraft.hasOrganizableMaterial?.();
  if (action === "quick-draft-compose") return !!quickDraft.modelAvailable?.() && !!quickDraft.hasInput?.();
  if (action === "quick-draft-apply") return !!quickDraft.canPreviewAdjustments?.();
  if (action === "quick-draft-develop") return !!quickDraft.hasBody?.() && !!quickDraft.canDevelop?.();
  if (["quick-draft-view-grain", "quick-draft-view-read", "quick-draft-view-listen"].includes(action)) return !!quickDraft.hasBody?.();
  if (action === "quick-draft-view-body") return true;
  if (["quick-draft-toggle-materials", "quick-draft-toggle-adjustments"].includes(action)) return !!quickDraft.hasBody?.();
  if (action === "quick-draft-toggle-sideask") return !(typeof isMultiFinderMode === "function" && isMultiFinderMode());
  if (action === "quick-draft-talk-points") return !!quickDraft.modelAvailable?.() && !!quickDraft.hasInput?.();
  if (["quick-draft-mingming", "quick-draft-luoluo", "quick-draft-hkrr", "quick-draft-praise"].includes(action)) {
    return !!quickDraft.modelAvailable?.() && !!quickDraft.hasBody?.();
  }
  if (["quick-draft-save-project", "quick-draft-copy-markdown", "quick-draft-send-teachtext", "quick-draft-send-review"].includes(action)) {
    return !!quickDraft.hasBody?.();
  }
  return true;
}

function runQuickDraftRuntimeCommand(action) {
  if (action === "open-quick-draft") return window.AISystem6QuickDraft.open();
  if (action === "quick-draft-open-writing-studio") {
    return (async () => {
      const saved = await window.AISystem6QuickDraftRuntime?.flushPendingQuickDraftCommit?.();
      if (saved === false) {
        window.AISystem6QuickDraftRuntime?.setQuickDraftStatus?.(t("quick_draft_save_failed"));
        return false;
      }
      await openWritingStudio();
      return true;
    })();
  }
  if (action === "quick-draft-import-chat") return window.AISystem6QuickDraft.importChatScreenshots?.();
  if (action === "quick-draft-toggle-sideask") return toggleQuickDraftSideAsk();

  const command = action.slice("quick-draft-".length);
  const quickDraft = window.AISystem6QuickDraft;
  if (!quickDraft) return;
  if (command === "vent-on") return quickDraft.setVentMode?.(true);
  if (command === "vent-off") return quickDraft.setVentMode?.(false);
  if (command === "vent-summary") return quickDraft.collectVentOutline?.();
  if (command === "compose") return quickDraft.startWritingNow?.();
  if (command === "apply") return quickDraft.applyAdjustments?.();
  if (command === "develop") return quickDraft.develop?.();
  if (command === "view-body") return quickDraft.setDisplayMode?.("body");
  if (command === "view-grain") return quickDraft.setDisplayMode?.("grain");
  if (command === "view-read") return quickDraft.setDisplayMode?.("read");
  if (command === "view-listen") return quickDraft.setDisplayMode?.("listen");
  if (command === "toggle-materials") return quickDraft.togglePanel?.("shelf");
  if (command === "toggle-adjustments") return quickDraft.togglePanel?.("inspector");
  if (command === "save-project") return quickDraft.saveQuickDraftAsProjectDocument?.();
  if (command === "copy-markdown") return quickDraft.copyMarkdown?.();
  if (command === "send-teachtext") return quickDraft.transferQuickDraftToTeachText?.();
  if (command === "send-review") return quickDraft.sendQuickDraftToReviewDesk?.();
  return quickDraft.runClioTalkAction?.(command === "talk-points" ? "organize" : command);
}

// ---- 文字亮室 commands ---------------------------------------------------
// The darkroom's own verbs. They are listed and answered here, beside Quick
// Draft's, because the two applications share one bundle -- but they are a
// separate list with a separate availability rule, so neither can silently
// decide the other is unavailable again.
const LIGHTROOM_COMMAND_NAMES = [
  "lightroom-develop-document",
  "lightroom-save-version",
  "lightroom-restore-version",
  "lightroom-zoom-grain",
  "lightroom-zoom-histogram",
  "lightroom-zoom-fatbits",
  "lightroom-toggle-inspector",
  "lightroom-layer-toggle",
  "lightroom-layer-strength",
  "lightroom-layer-move",
  "lightroom-layer-scope",
  "lightroom-layer-scope-all",
  "lightroom-protect-selection",
  "lightroom-eli5-toggle",
  "lightroom-eli5-baseline",
  "lightroom-eli5-review",
  "lightroom-eli5-rewrite",
  "lightroom-discard-composite",
  "lightroom-listen-toggle",
  "lightroom-listen-back",
  "lightroom-listen-lost",
  "lightroom-listen-rehearse",
  "lightroom-listen-voice",
];

function lightroomCommandAvailable(action) {
  const activeWindow = /** @type {HTMLElement | null} */ (document.querySelector(".window.is-active"));
  if (activeWindow?.dataset.window !== "lightroom") return false;
  const quickDraft = window.AISystem6QuickDraft;
  if (!quickDraft) return false;
  // Opening a document is opening an application's document: always allowed.
  if (action === "lightroom-develop-document") return true;
  const hasBody = !!quickDraft.hasBody?.();
  const readOnly = !!quickDraft.isReadOnlySubject?.();
  const view = String(quickDraft.displayMode?.() || "");
  const writable = hasBody && !readOnly;
  if (action.startsWith("lightroom-zoom-")) return hasBody && view === "grain";
  if (action === "lightroom-toggle-inspector") return hasBody;
  if (action === "lightroom-restore-version") return !readOnly && !!quickDraft.hasVersions?.();
  if (action === "lightroom-save-version") return writable;
  if (action === "lightroom-discard-composite") return writable && !!quickDraft.hasComposite?.();
  if (["lightroom-layer-scope", "lightroom-protect-selection"].includes(action)) {
    return writable && !!quickDraft.hasDraftSelection?.();
  }
  if (action.startsWith("lightroom-layer-")) return writable;
  if (["lightroom-eli5-review", "lightroom-eli5-rewrite"].includes(action)) {
    return writable && !!quickDraft.modelAvailable?.();
  }
  if (action.startsWith("lightroom-eli5-")) return writable;
  if (action.startsWith("lightroom-listen-")) {
    if (view !== "listen") return false;
    if (action === "lightroom-listen-rehearse") return !readOnly;
    return true;
  }
  return hasBody;
}

function runLightroomRuntimeCommand(action, context = {}) {
  const args = Array.isArray(context.lightroomArgs) ? context.lightroomArgs : [];
  const quickDraft = window.AISystem6QuickDraft;
  if (!quickDraft) return false;
  if (action === "lightroom-develop-document") return quickDraft.developDocument?.(args[0] || "");
  if (action === "lightroom-save-version") return saveLightroomVersion();
  if (action === "lightroom-restore-version") return restoreQuickDraftVersion(args[1] || "", args[0] || "version");
  if (action.startsWith("lightroom-zoom-")) return setQuickDraftGrainZoom(action.slice("lightroom-zoom-".length), { toggle: false });
  if (action === "lightroom-toggle-inspector") return toggleQuickDraftPanel("inspector");
  if (action === "lightroom-layer-toggle") {
    const kind = args[0] || "";
    const enabled = adjustmentLayerState(kind)?.enabled === true;
    return updateAdjustmentLayer(kind, { enabled: !enabled });
  }
  if (action === "lightroom-layer-strength") return updateAdjustmentLayer(args[0] || "", { strength: Number(args[1]) || 50 });
  if (action === "lightroom-layer-move") return moveAdjustmentLayer(args[0] || "", Number(args[1]) || -1);
  if (action === "lightroom-layer-scope") return scopeSelectionToLayer(args[0] || "");
  if (action === "lightroom-layer-scope-all") return updateAdjustmentLayer(args[0] || "", { mask: "" });
  if (action === "lightroom-protect-selection") return protectSelectionFromTextarea();
  if (action === "lightroom-eli5-toggle") {
    const lens = getActiveProject()?.explanationLens || {};
    return updateQuickDraftEli5Lens({ enabled: lens.enabled !== true });
  }
  if (action === "lightroom-eli5-baseline") return updateQuickDraftEli5Lens({ baselineKnowledge: args[0] || "secondary-school" });
  if (action === "lightroom-eli5-review") return window.AISystem6QuickDraftAI?.requestEli5Review?.();
  if (action === "lightroom-eli5-rewrite") return window.AISystem6QuickDraftAI?.requestEli5Rewrite?.();
  if (action === "lightroom-discard-composite") return discardLightroomComposite();
  if (action === "lightroom-listen-toggle") return window.AISystem6QuickDraftListen?.toggle?.();
  if (action === "lightroom-listen-back") return window.AISystem6QuickDraftListen?.stepBack?.();
  if (action === "lightroom-listen-lost") return window.AISystem6QuickDraftListen?.markLost?.();
  if (action === "lightroom-listen-rehearse") return window.AISystem6QuickDraftListen?.startQuickDraftRehearse?.();
  if (action === "lightroom-listen-voice") return window.AISystem6QuickDraftListen?.setQuickDraftListenVoice?.(args[0] || "");
  return false;
}

// 文字亮室 answers the develop intent for any text document, so Writing Studio
// can hand a manuscript to the darkroom the same way Quick Draft hands one to
// TeachText: through the registry, not through a private call.
async function developActiveDocumentInLightroom() {
  const id = typeof activeTextFileId === "string" ? activeTextFileId : "";
  const file = id && typeof chatFiles !== "undefined"
    ? chatFiles.find((item) => item.id === id && item.type === "text")
    : null;
  if (!file || !String(file.body || "").trim()) {
    setStatus(t("lightroom_no_document"));
    return false;
  }
  const dispatch = window.AISystem6ApplicationRegistry?.dispatchApplicationIntent;
  if (typeof dispatch !== "function") return false;
  // Whichever route stop handed it over -- Outline and Section Drafts can too,
  // and they are views onto this same document. Saying "teachText" regardless
  // would tell the darkroom something that is not true.
  const sourceAppId = (typeof currentWritingRouteStop === "function" && currentWritingRouteStop()) || "teachText";
  const result = await dispatch("lightroom", { intent: "develop", items: [file], sourceAppId });
  return Boolean(result?.ok);
}

window.AISystem6Runtime?.registerLazyCommand?.("develop-in-lightroom", {
  ensure: () => window.AISystem6QuickDraft?.ensure?.() || Promise.resolve(),
});

window.AISystem6Runtime?.registerApplication({
  id: "quickDraft",
  windowName: "quickDraft",
  mount: () => window.AISystem6QuickDraft.open(),
  restore: () => window.AISystem6QuickDraft.render?.(),
  commands: Object.fromEntries([
    ...["open-quick-draft", "develop-in-lightroom", ...QUICK_DRAFT_COMMAND_NAMES].map((action) => [action, {
      handler: () => (action === "develop-in-lightroom"
        ? developActiveDocumentInLightroom()
        : runQuickDraftRuntimeCommand(action)),
      isAvailable: () => (action === "develop-in-lightroom" ? true : quickDraftCommandAvailable(action)),
    }]),
    ...LIGHTROOM_COMMAND_NAMES.map((action) => [action, {
      handler: (context) => runLightroomRuntimeCommand(action, context),
      isAvailable: () => lightroomCommandAvailable(action),
    }]),
  ]),
});

window.AISystem6QuickDraftHandoff = Object.freeze({
  commitQuickDraftProjectDocument,
  saveQuickDraftAsProjectDocument,
  sendQuickDraftToReviewDesk,
  switchToMultiFinder,
  transferQuickDraftToTeachText,
});
