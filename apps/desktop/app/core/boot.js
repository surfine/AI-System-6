// Startup orchestration for app.js.

let bootInProgress = false;

async function retryBoot() {
  if (bootInProgress) return false;
  // A fresh runtime is the only reliable retry: partial boot state, listeners,
  // timers and lazy-module state are discarded by reloading.
  window.location.reload();
  return true;
}

// Safe-mode-lite: clear only the Working Session (windows, cursor, scroll
// scene), never projects, files, or IndexedDB data, then retry startup.
async function startBootWithoutSession() {
  if (bootInProgress) return false;
  try {
    await clearWorkingSession();
  } catch (error) {
    console.warn("Could not clear the Working Session for safe startup.", error);
  }
  window.location.reload();
  return true;
}

async function bootRecoveryStatus() {
  let storage = "unavailable";
  let session = "unavailable";
  let aiConfig = "unavailable";
  let projectsCount = 0;
  try {
    const status = await window.AISystem6RecoveryStorage?.recoveryStorageStatus?.() || { readable: false, projectCount: 0 };
    storage = status.readable ? "readable" : "unavailable";
    projectsCount = status.projectCount;
  } catch {
    storage = "unavailable";
  }
  try {
    const snapshot = await readWorkingSessionSnapshot();
    session = snapshot && typeof snapshot.version !== "undefined" ? "available" : "unavailable";
  } catch {}
  try {
    aiConfig = localStorage.getItem("ai-system6-cloud-config") ? "available" : "unavailable";
  } catch {}
  return {
    storage,
    projectsCount,
    session,
    aiConfig,
  };
}

let recoveryProjectsCache = [];
let selectedRecoveryProjectId = "";

async function renderRecoveryProjectList() {
  const list = document.getElementById("boot-recovery-projects-list");
  if (!list) return;
  recoveryProjectsCache = await window.AISystem6RecoveryStorage?.listRecoverableProjects?.() || [];
  list.replaceChildren();
  if (!recoveryProjectsCache.length) {
    const empty = document.createElement("p");
    empty.className = "finder-operation-lede";
    empty.textContent = t("boot_recovery_no_projects");
    list.append(empty);
    selectedRecoveryProjectId = "";
    return;
  }
  if (!selectedRecoveryProjectId || !recoveryProjectsCache.some((project) => project.id === selectedRecoveryProjectId)) {
    selectedRecoveryProjectId = recoveryProjectsCache[0].id;
  }
  recoveryProjectsCache.forEach((project) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "finder-operation-item btn";
    button.dataset.recoveryProjectId = project.id;
    button.setAttribute("aria-pressed", String(project.id === selectedRecoveryProjectId));
    const copy = document.createElement("span");
    copy.className = "finder-operation-item-copy";
    const name = document.createElement("b");
    name.textContent = project.name;
    const meta = document.createElement("small");
    meta.textContent = project.updatedAt || "";
    copy.append(name, meta);
    button.append(copy);
    button.addEventListener("click", () => {
      selectedRecoveryProjectId = project.id;
      renderRecoveryProjectList();
    });
    list.append(button);
  });
}

function openBootRecovery() {
  const dialog = document.getElementById("boot-recovery-modal");
  if (!dialog || typeof dialog.showModal !== "function") return;
  const note = document.getElementById("boot-recovery-note");
  const label = (available) => t(available ? "boot_recovery_available" : "boot_recovery_unavailable");
  const renderStatus = async () => {
    const status = await bootRecoveryStatus();
    document.getElementById("boot-recovery-storage").textContent = label(status.storage === "readable");
    document.getElementById("boot-recovery-projects").textContent = String(status.projectsCount);
    document.getElementById("boot-recovery-session").textContent = label(status.session === "available");
    document.getElementById("boot-recovery-ai").textContent = label(status.aiConfig === "available");
    await renderRecoveryProjectList();
  };
  const setNote = (message) => {
    if (note) note.textContent = message;
  };
  document.getElementById("boot-recovery-export").onclick = async () => {
    if (!selectedRecoveryProjectId) {
      setNote(t("boot_recovery_export_failed"));
      return;
    }
    try {
      const bundle = await window.AISystem6RecoveryStorage?.exportRecoveryProjectBackup?.(selectedRecoveryProjectId);
      if (!bundle) {
        setNote(t("boot_recovery_export_unverified"));
        return;
      }
      const project = recoveryProjectsCache.find((entry) => entry.id === selectedRecoveryProjectId);
      setNote(t("boot_recovery_exported"));
      downloadJsonFile(bundle, `${project?.name || "Project"} Project Hard Disk Backup`);
    } catch {
      setNote(t("boot_recovery_export_failed"));
    }
  };
  document.getElementById("boot-recovery-reset-session").onclick = async () => {
    try {
      await clearWorkingSession();
      setNote(t("boot_recovery_session_reset"));
      await renderStatus();
    } catch {
      setNote(t("boot_recovery_export_failed"));
    }
  };
  document.getElementById("boot-recovery-reset-ai").onclick = () => {
    try {
      handleAction("reset-ai-connection");
    } catch {}
  };
  document.getElementById("boot-recovery-retry").onclick = () => {
    dialog.close();
    window.location.reload();
  };
  renderStatus();
  if (typeof playSystemSound === "function") playSystemSound("alert");
  dialog.showModal();
}

function startupTaskWithTimeout(promise, label, ms = 1600) {
  let timeoutId = null;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`${label} timed out during startup.`);
      resolve(null);
    }, ms);
  });
  return Promise.race([
    Promise.resolve(promise).catch((error) => {
      console.warn(`${label} failed during startup.`, error);
      return null;
    }),
    timeout,
  ]).finally(() => clearTimeout(timeoutId));
}

async function boot() {
  if (bootInProgress) return false;
  bootInProgress = true;
  try {
    // Single-writer lease: acquire before any durable write can run. A second
    // instance starts read-only and gets the conflict dialog after first paint.
    window.AISystem6WriteLease?.initUi?.();
    window.AISystem6WriteLease?.acquireAtBoot?.();
    // Sad Mac recovery controls (wired once; boot may retry).
    const retryControl = document.getElementById("boot-retry");
    if (retryControl && retryControl.dataset.wired !== "true") {
      retryControl.dataset.wired = "true";
      retryControl.addEventListener("click", () => retryBoot());
      document.getElementById("boot-without-session")?.addEventListener("click", () => startBootWithoutSession());
      document.getElementById("boot-recovery")?.addEventListener("click", () => openBootRecovery());
    }
    updateClock();
    await Promise.all([
      ensureAlarmClockModule(),
      ensureProjectCdPrintModule(),
      ensurePromptFilesData().catch(() => {}),
      ensureLanguageFor(currentLanguage).catch(() => {}),
    ]);
    // Markdown parsing is not needed for first paint (welcome and guide are
    // plain HTML); load it in the background and rely on the escaped-text
    // fallback in markdown.js until it arrives.
    ensureMarkdownParser().catch(() => {});
    initializeAlarmClock();
    loadAppVersion();
    await loadDeskState();
    // A saved setting may have switched the active language away from the
    // system default; make sure its table is present before the first paint.
    // A failed fetch degrades to key fallbacks rather than stalling boot.
    await ensureLanguageFor(currentLanguage).catch(() => {});
    applyLanguage();
    await startupTaskWithTimeout(applyDeploymentWorkspaceDefault(), "deploymentWorkspaceDefault", 3500);
    if (window.AISystem6DerivedIndexQueue) {
      await startupTaskWithTimeout(window.AISystem6DerivedIndexQueue.restore(), "derivedIndexQueue", 3500);
    }
    configurePublicLmStudioControls();
    if (window.AISystem6DocMapLoaded) syncDocMapLayoutControls();
    applyLanguage();
    initSystemSelectControls();
    initSharedControlBehaviors();
    hydrateSystemIcons();
    renderProjectDisks();
    renderProjectReferences();
    renderScraps();
    renderTrash();
    renderDocuments();
    renderMountedTextDisk();
    renderProjectCd();
    renderFindPathResults();
    loadActiveProjectReferences();
    renderPipeline();
    applyWritingToolsViewMode();
    updateLocalModelState({ selected: !!modelInput.value.trim() });
    if (localLmStudioConnectionEnabled) {
      startupTaskWithTimeout(connectLocalLmStudio({ toggle: false, silent: true }), "connectLocalLmStudio");
    } else {
      renderLocalConnectionStatus("local_connection_waiting");
    }
    refreshImporterStatus();
    initDragAndDrop();

    // An unfinished OOBE owns first launch. A stale working-session snapshot
    // must not reopen applications behind the welcome window.
    // Restored chat history re-renders Markdown messages, so the parser must
    // be present before any restored message paints. If it cannot load, the
    // escaped-text fallback still paints usable messages.
    await ensureMarkdownParser().catch(() => {});
    const resumedWorkingSession = guideSeen
      && !writerMode
      && await startupTaskWithTimeout(restoreWorkingSession(), "restoreWorkingSession", 3500);
    if (!guideSeen) {
      openStartupItems();
    } else if (writerMode) {
      await enterWriterMode();
    } else if (!resumedWorkingSession) {
      openStartupItems();
    }
    if (window.AISystem6LocalLMStudio?.isSafariHttpLocalMode?.()) {
      openWindow("control");
      setControlTab("local");
    }

    updateMenuState();
    refreshSystemSelectControls();
    installWorkingSessionAutosave();
    await runBootSequence();
    document.body.dataset.appReady = "ready";
    setTimeout(() => {
      scheduleDesktopMaintenance("boot");
      applyControlStripState({ silent: true });
      ensureScriptingModule()
        .then(() => {
          if (!getWindow("applications")?.classList.contains("is-hidden")) renderStaticFinderWindow("applications");
        })
        .catch(() => {});
    }, 8000);
    if (typeof revealMultiFinderSwitcherHint === "function") revealMultiFinderSwitcherHint();
    setInterval(updateClock, 1000);
    startLocalModelMonitor();
  } catch (error) {
    console.error("AI System 6 boot failed", error);
    document.body.dataset.appReady = "error";
    showBootFailure(error);
  } finally {
    bootInProgress = false;
  }
}
