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
    await startupTaskWithTimeout(loadDeskState(), "loadDeskState", 3500);
    await startupTaskWithTimeout(applyDeploymentWorkspaceDefault(), "deploymentWorkspaceDefault", 3500);
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

    const resumedWorkingSession = !writerMode && await startupTaskWithTimeout(restoreWorkingSession(), "restoreWorkingSession", 3500);
    if (writerMode) {
      await enterWriterMode();
    } else if (!resumedWorkingSession) {
      openStartupItems();
    }

    updateMenuState();
    refreshSystemSelectControls();
    installWorkingSessionAutosave();
    await runBootSequence();
    document.body.dataset.appReady = "ready";
    setInterval(updateClock, 1000);
    startLocalModelMonitor();
  } catch (error) {
    console.error("AI System 6 boot failed", error);
    document.body.dataset.appReady = "error";
    showBootFailure(error);
  }
}
