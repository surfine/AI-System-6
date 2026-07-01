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
    loadAppVersion();
    await startupTaskWithTimeout(loadDeskState(), "loadDeskState", 3500);
    syncDocMapLayoutControls();
    applyLanguage();
    initSystemSelectControls();
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
    startupTaskWithTimeout(refreshLocalModelReadiness(), "refreshLocalModelReadiness");
    refreshImporterStatus();
    initDragAndDrop();

    const resumedWorkingSession = !writerMode && await startupTaskWithTimeout(restoreWorkingSession(), "restoreWorkingSession", 3500);
    if (writerMode) {
      await enterWriterMode();
    } else if (!resumedWorkingSession) {
      openStartupItems();
    } else if (runtimeEnvironment === "finder" && startupOpenMode === "quick-draft") {
      handleAction("open-quick-draft");
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
