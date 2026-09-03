// Startup orchestration for app.js.

let bootInProgress = false;

function registerRuntimeRenderTasks() {
  const tasks = {
    projectLabels: updateProjectLabels,
    projectDisks: renderProjectDisks,
    documents: renderDocuments,
    scraps: renderScraps,
    trash: renderTrash,
    projectCd: renderProjectCd,
    projectReferences: renderProjectReferences,
    mountedTextDisk: renderMountedTextDisk,
    contextPanel: renderContextPanel,
    pipeline: renderPipeline,
    readerTabs: renderReaderTabs,
    menuState: updateMenuState,
    menuStatus: updateMenuStatus,
    aboutMacintosh: renderAboutMacintosh,
    localModelState: renderLocalModelState,
  };
  Object.entries(tasks).forEach(([task, handler]) => {
    if (typeof handler === "function") {
      window.AISystem6Runtime?.registerRenderTask?.(task, handler);
    }
  });
}

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
    await ensureRecoveryStorage().catch(() => {});
    const status = await window.AISystem6RecoveryStorage?.recoveryStorageStatus?.() || { readable: false, projectCount: 0 };
    storage = status.readable ? "readable" : "unavailable";
    projectsCount = status.projectCount;
  } catch {
    storage = "unavailable";
  }
  try {
    const platform = await window.AISystem6WebPlatform?.projectStorageSnapshot?.();
    if (platform?.supported) {
      storage = platform.persistent ? "persistent" : "managed";
    }
  } catch {}
  try {
    // Any disk's scene counts, not just the mounted one.
    await migrateWorkingSessionStorage();
    session = (await listWorkingSessionScopeKeys()).length ? "available" : "unavailable";
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
  await ensureRecoveryStorage().catch(() => {});
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
  const storageLabel = (status) => ({
    persistent: t("project_storage_persistent"),
    managed: t("project_storage_managed"),
    unavailable: t("project_storage_unavailable"),
  }[status.storage] || t("boot_recovery_available"));
  const renderStatus = async () => {
    const status = await bootRecoveryStatus();
    document.getElementById("boot-recovery-storage").textContent = storageLabel(status);
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
      // "Backup verified." is true as soon as the bundle passes above - but
      // downloadJsonFile's own dispatch is a separate step that can still
      // refuse (e.g. no File constructor), so check it before staying silent
      // about a download that never started.
      const dispatched = downloadJsonFile(bundle, `${project?.name || "Project"} Project Hard Disk Backup`);
      setNote(dispatched ? t("boot_recovery_exported") : t("boot_recovery_export_failed"));
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
  const retryButton = document.getElementById("boot-recovery-retry");
  retryButton.onclick = () => {
    dialog.close();
    window.location.reload();
  };
  renderStatus();
  if (typeof playSystemSound === "function") playSystemSound("alert");
  dialog.showModal();
  // Native initial focus lands on the first button in the row (Export),
  // not the one marked default (Retry) — see the same fix in
  // write-lease.js and modal.js's showSystemModal.
  retryButton.focus();
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

// Non-essential boot step: a per-feature initializer (one window's render,
// one Desk Accessory, one UI wiring call) must not blank the rest of the
// desk if it throws. This runs the step, and on failure records the failure
// where a person can read it (Notification Center) and where a developer can
// grep it (console.error) instead of letting the throw escape to boot()'s
// outer catch, which would abort every step after it. Essential steps
// (write-lease acquisition, desk-state load, the boot sequence itself) are
// deliberately left outside this wrapper: their failure is supposed to stop
// boot and show the existing Sad Mac recovery screen.
// `notify` defaults to the real Notification Center push, but loadDeskState()
// restores the persisted notification list wholesale (a splice-replace, not a
// merge) — a notification pushed before that point is silently overwritten a
// moment later. Steps that run earlier than loadDeskState() pass a queuing
// notify instead (see earlyBootFailures below) so their trace survives.
async function runBootStep(label, fn, notify = defaultBootStepNotify) {
  try {
    return await fn();
  } catch (error) {
    console.error(`AI System 6 boot: "${label}" failed and was skipped.`, error);
    notify(t("lazy_load_failed", label, error?.message || String(error)));
    return undefined;
  }
}

function defaultBootStepNotify(message) {
  if (typeof pushSystemNotification === "function") pushSystemNotification(message, { state: "failed" });
}

async function boot() {
  if (bootInProgress) return false;
  bootInProgress = true;
  try {
    registerRuntimeRenderTasks();
    // Single-writer lease: acquire before any durable write can run. A second
    // instance starts read-only and gets the conflict dialog after first paint.
    window.AISystem6WriteLease?.initUi?.();
    await window.AISystem6WriteLease?.acquireAtBoot?.();
    // Sad Mac recovery controls (wired once; boot may retry).
    const retryControl = document.getElementById("boot-retry");
    if (retryControl && retryControl.dataset.wired !== "true") {
      retryControl.dataset.wired = "true";
      retryControl.addEventListener("click", () => retryBoot());
      document.getElementById("boot-without-session")?.addEventListener("click", () => startBootWithoutSession());
      document.getElementById("boot-recovery")?.addEventListener("click", () => openBootRecovery());
    }
    // Every step until loadDeskState() runs before that call restores the
    // persisted Notification Center list wholesale, which would otherwise
    // erase a notification pushed here a moment after it lands — so these
    // steps queue their failure and it is pushed for real right after.
    const earlyBootFailures = [];
    const queueEarlyBootFailure = (message) => earlyBootFailures.push(message);
    await runBootStep("Clock", () => updateClock(), queueEarlyBootFailure);
    // Each of these is one feature's own preload; one failing (a bad script,
    // an offline fetch) must not stall the others or abort boot, so every
    // entry carries its own catch that still leaves a trace.
    await Promise.all([
      runBootStep(t("alarm_clock"), () => ensureAlarmClockModule(), queueEarlyBootFailure),
      runBootStep(t("project_cd"), () => ensureProjectCdPrintModule(), queueEarlyBootFailure),
      ...[ensureContextGistModule, ensureDocMapSourcePolicyModule, ensureUserRecoveryMessagesModule, ensureDocumentRolePolicyModule]
        .map((load) => load().catch((error) => console.warn("AI System 6 boot: a context/policy module failed to load.", error))),
      ensurePromptFilesData().catch((error) => console.warn("AI System 6 boot: prompt files data failed to load.", error)),
      ensureLanguageFor(currentLanguage).catch((error) => console.warn("AI System 6 boot: language table failed to load.", error)),
    ]);
    // Clio's static first paint is plain HTML; load Markdown in the background
    // and rely on the escaped-text fallback until it arrives.
    ensureMarkdownParser().catch(() => {});
    await runBootStep(t("alarm_clock"), () => initializeAlarmClock(), queueEarlyBootFailure);
    await runBootStep("Version", () => loadAppVersion(), queueEarlyBootFailure);
    await loadDeskState();
    earlyBootFailures.forEach(defaultBootStepNotify);
    // A saved setting may have switched the active language away from the
    // system default; make sure its table is present before the first paint.
    // A failed fetch degrades to key fallbacks rather than stalling boot.
    await ensureLanguageFor(currentLanguage).catch(() => {});
    applyLanguage();
    await startupTaskWithTimeout(applyDeploymentWorkspaceDefault(), "deploymentWorkspaceDefault", 3500);
    if (window.AISystem6DerivedIndexQueue) {
      await startupTaskWithTimeout(window.AISystem6DerivedIndexQueue.restore(), "derivedIndexQueue", 3500);
    }
    await runBootStep(t("local_model"), () => configurePublicLmStudioControls());
    if (window.AISystem6DocMapLoaded) await runBootStep(t("docmap"), () => syncDocMapLayoutControls());
    applyLanguage();
    await runBootStep("System controls", () => initSystemSelectControls());
    await runBootStep("System controls", () => initSharedControlBehaviors());
    await runBootStep("System icons", () => hydrateSystemIcons());
    // Each Finder-style window paints on its own: a corrupt record in one
    // (say, Trash) must not blank the others, so every render call is its own
    // step rather than one shared try/catch around the whole list.
    await runBootStep(t("projects"), () => renderProjectDisks());
    await runBootStep(t("references"), () => renderProjectReferences());
    await runBootStep(t("scrapbook"), () => renderScraps());
    await runBootStep(t("trash"), () => renderTrash());
    await runBootStep(t("documents"), () => renderDocuments());
    await runBootStep(t("mounted_text_disk"), () => renderMountedTextDisk());
    await runBootStep(t("project_cd"), () => renderProjectCd());
    // Searcher paints itself when its window opens (openWindow loads the lazy
    // module first); startup must not reach into it, or the module is no longer
    // lazy.
    await runBootStep(t("references"), () => loadActiveProjectReferences());
    await runBootStep("Writing Flow pipeline", () => renderPipeline());
    await runBootStep(t("writing_tools"), () => applyWritingToolsViewMode());
    await runBootStep(t("local_model"), () => updateLocalModelState({ selected: !!modelInput.value.trim() }));
    if (localLmStudioConnectionEnabled) {
      startupTaskWithTimeout(connectLocalLmStudio({ toggle: false, silent: true }), "connectLocalLmStudio");
    } else {
      renderLocalConnectionStatus("local_connection_waiting");
    }
    await runBootStep("File Floppy import status", () => refreshImporterStatus());
    await runBootStep("Drag and drop", () => initDragAndDrop());

    // A true first launch opens ClioTalk, but recoverable work still wins.
    // Restored chat history re-renders Markdown messages, so the parser must
    // be present before any restored message paints. If it cannot load, the
    // escaped-text fallback still paints usable messages.
    await ensureMarkdownParser().catch(() => {});
    // The writer's words are not part of onboarding. A snapshot exists only if
    // someone already worked here, so resuming one cannot disturb a true first
    // launch. The persisted onboarding bit is deliberately independent from
    // the Working Session snapshot.
    const resumedWorkingSession = !writerMode
      && await startupTaskWithTimeout(restoreWorkingSession(), "restoreWorkingSession", 3500);
    // Someone who wrote a paragraph is not on first launch, whatever the flag
    // says. Replay remains available later without replacing the saved scene.
    if (!clioOnboardingCompleted && !resumedWorkingSession) {
      await runBootStep("Startup items", () => openStartupItems());
    } else if (writerMode) {
      await runBootStep("Writer Mode", () => enterWriterMode());
    } else if (!resumedWorkingSession) {
      await runBootStep("Startup items", () => openStartupItems());
    }
    if (window.AISystem6LocalLMStudio?.isSafariHttpLocalMode?.()) {
      await runBootStep(t("local_model"), () => {
        openWindow("control");
        setControlTab("local");
      });
    }

    updateMenuState();
    refreshSystemSelectControls();
    installWorkingSessionAutosave();
    installApplicationLifecycleWatch();
    await runBootSequence();
    document.body.dataset.appReady = "ready";
    // This timer fires after boot() has already returned, so nothing here is
    // inside boot()'s own try/catch any more — an uncaught throw in this
    // callback would be genuinely invisible. Each step gets its own
    // runBootStep for the same reason the steps above do.
    setTimeout(() => {
      runBootStep("Desktop maintenance", () => scheduleDesktopMaintenance("boot"));
      runBootStep(t("control_strip"), () => applyControlStripState({ silent: true }));
      runBootStep("Applications window", () => ensureScriptingModule().then(() => {
        if (!getWindow("applications")?.classList.contains("is-hidden")) renderStaticFinderWindow("applications");
      }));
    }, 8000);
    if (typeof revealMultiFinderSwitcherHint === "function") revealMultiFinderSwitcherHint();
    // Once the desktop is actually on screen: this one measures whether the
    // icon column wrapped, so it needs the column placed, not merely present.
    await runBootStep("Desktop icon layout", () => syncIconColumnDensity?.());
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
