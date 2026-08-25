// Writer-mode transitions and the Clio-first introduction.

// Entering and leaving both close and open windows, and both are async, so a
// second transition that starts before the first settles interleaves their
// closes and opens. The mode is entered once at boot today, which cannot
// collide -- this guard is what a switch would need, and is kept because
// leaveWriterMode still fires whenever the writer moves to another app.
let writerModeTransition = null;

async function enterWriterMode() {
  if (writerModeTransition) await writerModeTransition;
  writerModeTransition = enterWriterModeNow().finally(() => { writerModeTransition = null; });
  return writerModeTransition;
}

async function enterWriterModeNow() {
  writerMode = true;
  document.body.classList.add("is-writer-mode");

  // The writing surface first, then one sweep.
  //
  // Sweeping first and opening second looked right and was not: opening the
  // manuscript brings the route's own views back with it, so Question Sheet
  // survived a sweep that had already run. Putting the sweep last means
  // anything the opens bring along is swept too, and the mode does not have to
  // know which step produces which window.
  //
  // The set names what STAYS. This used to be a list of 31 windows to close,
  // written when the desk had about 40; the desk has 73 now and the list had
  // never been updated, so a mode whose whole job is "clear the desk" was
  // leaving Question Sheet, Outline, 文字亮室, Quick Draft and every game
  // exactly where they were. A close-list is wrong for this by construction --
  // it needs editing whenever anyone adds a window, and nothing fails when they
  // forget. A window added tomorrow is swept by a mode that never heard of it.
  //
  // What stays: the manuscript, ClioTalk, and the route the manuscript belongs
  // to. The route stops are here because today's manuscript arrives WITH its
  // linked views -- opening TeachText brings them back on a later tick, so a
  // mode that swept them would be fighting the route rather than clearing the
  // desk. Everything else goes: games, labs, accessories, Finder, and anything
  // added after this was written.
  //
  // Not to be confused with writerModeCssOwnedWindows (window-manager.js):
  // those four are the windows whose geometry writer-mode CSS places IF they
  // are opened. Searcher and the Context Panel stay summonable while writing;
  // they are simply not part of the arrangement the mode opens with.
  const writerModeKeepsOpen = new Set([
    "teachText", "assistant",
    "questionSheet", "outline", "sectionDrafts", "reviewDesk",
  ]);

  if (getWindow("teachText").classList.contains("is-hidden")) newTextDocument();
  else await openWindow("teachText");
  await openWindow("assistant");
  setAssistantDesklet(true);

  focusWindow(getWindow("teachText"));
  applyLanguage();

  // The sweep runs LAST, after every step that can put a window on the desk.
  // Opening the manuscript brings the route's linked views back on a later
  // tick, and applyLanguage() re-renders Note Pad, TeachText, the ask bars and
  // the alarm clock -- so a sweep placed before either of them cleared a desk
  // that was about to be repopulated. Measured: Question Sheet survived an
  // earlier sweep, then Note Pad survived a later one.
  await Promise.all(
    Array.from(document.querySelectorAll(".window[data-window]"))
      .map((win) => win.dataset.window)
      .filter((name) => name && !writerModeKeepsOpen.has(name))
      .map((name) => closeWindow(name, true)),
  );

  saveDeskState();
}

async function leaveWriterMode() {
  if (writerModeTransition) await writerModeTransition;
  writerModeTransition = Promise.resolve(leaveWriterModeNow()).finally(() => { writerModeTransition = null; });
  return writerModeTransition;
}

function leaveWriterModeNow() {
  writerMode = false;
  clearSideAskMode();
  document.body.classList.remove("is-writer-mode");
  setAssistantDesklet(false);
  openWindow("assistant");
  tileWindows();
  applyLanguage();
  saveDeskState();
}

function isClioIntroductionActive() {
  return clioIntroductionReplay || !clioOnboardingCompleted;
}

async function completeClioOnboarding(reason = "completed") {
  if (clioOnboardingCompleted && !clioIntroductionReplay) return false;
  clioOnboardingCompleted = true;
  clioIntroductionReplay = false;
  await saveDeskState();
  window.dispatchEvent(new CustomEvent("ai-system6:clio-onboarding-complete", {
    detail: { reason },
  }));
  window.requestAnimationFrame(() => revealMultiFinderSwitcherHint());
  return true;
}

async function openClioIntroduction({ replay = true } = {}) {
  if (replay) clioIntroductionReplay = true;
  if (typeof startNewClioTalkConversation === "function" && conversation.length) {
    const started = await startNewClioTalkConversation();
    if (started === false) return false;
  }
  await openWindow("assistant");
  if (typeof renderClioTalkWelcome === "function") renderClioTalkWelcome();
  if (typeof window.AISystem6ClioProvider?.resolve === "function") {
    await ensureClioProviderResolver().catch(() => {});
    window.AISystem6ClioProvider.resolve({ reason: "introduction" }).catch(() => {});
  }
  window.requestAnimationFrame(() => promptInput?.focus());
  return true;
}

async function openFirstRunClioTalk() {
  setWorkspaceProfile(workspaceProfileDesktop, { persist: false });
  quietStartup();
  clioIntroductionReplay = false;
  await openWindow("assistant");
  if (typeof renderClioTalkWelcome === "function") renderClioTalkWelcome();
  await ensureClioProviderResolver().catch(() => {});
  window.AISystem6ClioProvider?.resolve?.({ reason: "first-run" }).catch(() => {});
  window.requestAnimationFrame(() => promptInput?.focus());
  return true;
}

function activateClioStarter(starterId = "") {
  const key = {
    idea: "clio_starter_idea_prompt",
    notes: "clio_starter_notes_prompt",
    file: "clio_starter_file_prompt",
    explore: "clio_starter_explore_prompt",
  }[String(starterId || "")];
  if (!key || !promptInput) return false;
  promptInput.value = t(key);
  promptInput.dispatchEvent(new Event("input", { bubbles: true }));
  promptInput.focus();
  promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
  return true;
}

function initializeClioOnboarding() {
  document.addEventListener("click", (event) => {
    const starter = event.target.closest?.("[data-clio-starter]");
    if (!starter) return;
    event.preventDefault();
    activateClioStarter(starter.dataset.clioStarter);
  });
}

async function useThisWindowForClio() {
  const result = await window.AISystem6WriteLease?.requestTakeover?.();
  if (!result?.ok) {
    if (result?.reason === "unsaved-work" || result?.reason === "timeout") {
      window.AISystem6WriteLease?.showDenied?.();
    } else {
      window.AISystem6WriteLease?.showConflict?.();
    }
    return false;
  }
  window.AISystem6WriteLease?.syncReadOnlySurface?.();
  renderClioTalkWelcome();
  syncClioTalkSendButton();
  promptInput?.focus();
  return true;
}

async function openModelSettings() {
  await openWindow("control");
  if (typeof setControlTab === "function") setControlTab();
}
