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
    ]);
    initializeAlarmClock();
    loadAppVersion();
    await loadDeskState();
    await startupTaskWithTimeout(applyDeploymentWorkspaceDefault(), "deploymentWorkspaceDefault", 3500);
    if (window.AISystem6DerivedIndexQueue) {
      await startupTaskWithTimeout(window.AISystem6DerivedIndexQueue.restore(), "derivedIndexQueue", 3500);
    }
    configurePublicLmStudioControls();
    syncDocMapLayoutControls();
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
    if (typeof revealMultiFinderSwitcherHint === "function") revealMultiFinderSwitcherHint();
    setInterval(updateClock, 1000);
    startLocalModelMonitor();
  } catch (error) {
    console.error("AI System 6 boot failed", error);
    document.body.dataset.appReady = "error";
    showBootFailure(error);
  }
}
