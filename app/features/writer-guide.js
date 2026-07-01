// Feature module: writer-guide.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



async function enterWriterMode() {
  writerMode = true;
  document.body.classList.add("is-writer-mode");

  ["control", "rag", "textDisk", "disk", "helpFolder", "projects", "finder", "documents", "chatFile", "trash", "saveChat", "writingBell", "notePad", "clipboard", "calculator", "puzzle", "memoryCards", "keyCaps", "systemStatus", "modelMeter", "contextPanel", "findPath", "findFile", "printDirectory", "pageSetup", "reader", "guide", "systemHelp", "scrapbook", "sectionDrafts", "reviewDesk"].forEach(closeWindow);
  if (getWindow("teachText").classList.contains("is-hidden")) {
    newTextDocument();
  } else {
    await openWindow("teachText");
  }

  await openWindow("assistant");
  setAssistantDesklet(true);
  focusWindow(getWindow("teachText"));
  applyLanguage();
  saveDeskState();
}

function leaveWriterMode() {
  writerMode = false;
  clearSideAskMode();
  document.body.classList.remove("is-writer-mode");
  setAssistantDesklet(false);
  openWindow("assistant");
  tileWindows();
  applyLanguage();
  saveDeskState();
}

function toggleWriterMode() {
  if (writerMode) {
    leaveWriterMode();
  } else {
    enterWriterMode();
  }
}

function dismissGuide() {
  guideSeen = true;
  closeWindow("guide");
  saveDeskState();
}

function openApiSetup() {
  openWindow("control");
  endpointInput.focus();
  endpointInput.select();
}

async function startGuidedWritingRoute() {
  guideSeen = true;
  closeWindow("guide");

  if (!getActiveProject()) {
    await openWindow("projects");
    setStatus(t("guide_route_needs_project"));
    saveDeskState();
    return;
  }

  if (typeof openWritingFlowWindows === "function") {
    await openWritingFlowWindows();
  } else {
    await openWindow("questionSheet");
  }
  setStatus(t("guide_route_started"));
  saveDeskState();
}
