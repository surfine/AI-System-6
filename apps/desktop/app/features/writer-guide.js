// Writer-mode transitions and the system-owned Welcome Floppy.

async function enterWriterMode() {
  writerMode = true;
  document.body.classList.add("is-writer-mode");

  ["control", "rag", "textDisk", "welcomeDisk", "disk", "helpFolder", "projects", "finder", "documents", "chatFile", "trash", "saveChat", "writingBell", "notePad", "clipboard", "alarmClock", "calculator", "puzzle", "memoryCards", "keyCaps", "systemStatus", "modelMeter", "contextPanel", "findPath", "findFile", "printDirectory", "pageSetup", "reader", "guide", "systemHelp", "scrapbook", "sectionDrafts", "reviewDesk"].forEach(closeWindow);
  if (getWindow("teachText").classList.contains("is-hidden")) newTextDocument();
  else await openWindow("teachText");

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
  if (writerMode) leaveWriterMode();
  else enterWriterMode();
}

function guideHasReadyModel() {
  return typeof clioTalkModelReady === "function" && clioTalkModelReady();
}

// The floppy reports configuration readiness, never a network connection that
// has not happened. Its fourth object exists only where iOS needs written Home
// Screen instructions instead of a browser install prompt.
function syncWelcomeFloppyState() {
  const aiLabel = document.getElementById("welcome-ai-label");
  const shared = guideHasReadyModel()
    && typeof cloudCredentialMode === "function"
    && cloudCredentialMode() === "shared";
  const aiKey = shared ? "welcome_ai_website_ready" : guideHasReadyModel() ? "welcome_ai_ready" : "welcome_ai_setup";
  if (aiLabel) {
    aiLabel.dataset.i18n = aiKey;
    aiLabel.textContent = t(aiKey);
  }

  const iphone = document.getElementById("welcome-iphone-item");
  const showIphone = typeof isIosWebPlatform === "function"
    && isIosWebPlatform()
    && !(typeof isStandaloneWebApp === "function" && isStandaloneWebApp());
  if (iphone) iphone.hidden = !showIphone;
  const count = document.getElementById("welcome-disk-count");
  if (count) count.textContent = t("items_count", showIphone ? 4 : 3);
}

async function openWelcomeFloppy() {
  const icon = document.getElementById("mounted-welcome-disk");
  if (icon) icon.hidden = false;
  syncWelcomeFloppyState();
  await openWindow("welcomeDisk");
  getWindow("welcomeDisk")?.querySelector(".finder-item.is-selected")?.focus({ preventScroll: true });
}

async function openWelcomeReadMe() {
  await openWindow("guide");
  getWindow("guide")?.querySelector(".btn.default")?.focus({ preventScroll: true });
}

async function dismissWelcomeFloppy() {
  guideSeen = true;
  await closeWindow("welcomeDisk");
  saveDeskState();
  window.requestAnimationFrame(() => revealMultiFinderSwitcherHint());
}

async function openModelSettings() {
  await openWindow("control");
  if (typeof setControlTab === "function") setControlTab();
}

function showWelcomeIphoneHelp() {
  return window.AISystem6WebPlatform?.installWebApp?.();
}

function initializeWelcomeFloppy() {
  syncWelcomeFloppyState();
}
