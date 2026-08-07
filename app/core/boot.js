// Startup orchestration for app.js.

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
  try {
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
  }
}
