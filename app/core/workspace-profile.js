// Workspace profile policy.
//
// "writing" is the complete writing environment. "desktop" keeps the shared
// System 6 desk (including ClioTalk) while withholding writing-route surfaces.

const workspaceProfileWriting = "writing";
const workspaceProfileDesktop = "desktop";
const workspaceCapabilityShared = "shared";
const workspaceCapabilityStudio = "studio";

let workspaceProfile = workspaceProfileWriting;
let workspaceProfileWasRestored = false;

const studioWindowNames = new Set([
  "questionSheet",
  "outline",
  "sectionDrafts",
  "reviewDesk",
  "styleSheet",
  "claimCheck",
  "projectCd",
  "rebuildFlow",
  "rag",
  "textDisk",
]);

const writingStudioOwnedWindowNames = new Set([
  "questionSheet",
  "outline",
  "sectionDrafts",
  "reviewDesk",
  "styleSheet",
  "claimCheck",
  "rebuildFlow",
  "imageManager",
]);

const studioActionNames = new Set([
  "open-question-sheet",
  "open-outline",
  "open-section-drafts",
  "open-review-desk",
  "open-style-sheet",
  "open-claim-check",
  "open-project-cd",
  "open-rebuild-flow",
  "open-rag",
  "open-text-disk",
  "open-image-manager",
  "export-teachtext-project-cd",
  "generate-marp-open-clio-stage",
  "print-to-slides",
  "ai-print-to-slides",
  "style-check-teachtext",
  "style-check-manuscript",
  "style-check-section",
  "run-claim-check",
  "run-claim-check-section",
]);

const studioActionPrefixes = ["ai-", "rebuild-", "review-"];

function normalizeWorkspaceProfile(value) {
  return value === workspaceProfileDesktop ? workspaceProfileDesktop : workspaceProfileWriting;
}

function workspaceCapabilityVisible(capability, profile = workspaceProfile) {
  return normalizeWorkspaceProfile(profile) !== workspaceProfileDesktop
    || capability !== workspaceCapabilityStudio;
}

function workspaceCapabilityForWindow(name) {
  return studioWindowNames.has(String(name || ""))
    ? workspaceCapabilityStudio
    : workspaceCapabilityShared;
}

function workspaceCapabilityForAction(action) {
  const name = String(action || "");
  return studioActionNames.has(name) || studioActionPrefixes.some((prefix) => name.startsWith(prefix))
    ? workspaceCapabilityStudio
    : workspaceCapabilityShared;
}

function isWorkspaceWindowAllowed(name, profile = workspaceProfile) {
  return workspaceCapabilityVisible(workspaceCapabilityForWindow(name), profile);
}

function isWorkspaceActionAllowed(action, profile = workspaceProfile) {
  return workspaceCapabilityVisible(workspaceCapabilityForAction(action), profile);
}

function filterWorkspaceItems(items = [], profile = workspaceProfile) {
  return items.filter((item) => {
    if (Array.isArray(item.workspaceProfiles) && !item.workspaceProfiles.includes(profile)) return false;
    return workspaceCapabilityVisible(
      item.workspaceCapability || workspaceCapabilityShared,
      profile
    );
  });
}

function syncWorkspaceProfileDom(root = document) {
  document.body.dataset.workspaceProfile = workspaceProfile;
  root.querySelectorAll("[data-workspace-capability]").forEach((element) => {
    const visible = workspaceCapabilityVisible(element.dataset.workspaceCapability);
    element.classList.toggle("is-hidden", !visible);
    element.setAttribute("aria-hidden", visible ? "false" : "true");
  });
  const selector = document.getElementById("workspace-profile");
  if (selector) selector.value = workspaceProfile;
  const aboutKey = workspaceProfile === workspaceProfileDesktop ? "about_finder" : "about_menu";
  document.querySelectorAll('[data-action="open-about"], #about-title').forEach((element) => {
    element.dataset.i18n = aboutKey;
    element.textContent = t(aboutKey);
  });
  const aboutBody = document.querySelector(".about-pane [data-i18n='about_body'], .about-pane [data-i18n='about_finder_body']");
  if (aboutBody) {
    const bodyKey = workspaceProfile === workspaceProfileDesktop ? "about_finder_body" : "about_body";
    aboutBody.dataset.i18n = bodyKey;
    aboutBody.textContent = t(bodyKey);
  }
  syncWorkspaceDesktopIcon();
  if (typeof scheduleWritingSpineAvoidance === "function") {
    scheduleWritingSpineAvoidance();
  }
}

function syncWorkspaceDesktopIcon() {
  const button = document.getElementById("finder-writing-studio-toggle");
  const label = document.getElementById("finder-writing-studio-toggle-label");
  if (!button || !label) return;
  const finderSingleTask = typeof isMultiFinderMode !== "function" || !isMultiFinderMode();
  const studioOpen = workspaceProfile === workspaceProfileWriting;
  button.classList.toggle("is-hidden", !finderSingleTask);
  button.dataset.action = studioOpen ? "exit-writing-studio" : "open-writing-studio";
  label.textContent = studioOpen ? t("quit_app", t("writing_studio")) : t("writing_studio");
}

function hideWorkspaceDisallowedWindows() {
  document.querySelectorAll(".window").forEach((win) => {
    const name = win.dataset.window || "";
    if (isWorkspaceWindowAllowed(name)) return;
    win.classList.add("is-hidden");
    win.classList.remove("is-active", "is-app-hidden");
    delete win.dataset.appHiddenCollapsed;
    if (typeof forgetWindowFromRunningApps === "function") forgetWindowFromRunningApps(name);
  });
  if (!document.querySelector(".window.is-active:not(.is-hidden):not(.is-app-hidden)")) {
    activeAppId = "finder";
  }
}

function refreshWorkspaceProfileSurfaces() {
  ["finder", "helpFolder", "applications", "disk", "controlStripModules"].forEach((name) => {
    if (typeof renderStaticFinderWindow === "function") renderStaticFinderWindow(name);
  });
  if (typeof updateMenuState === "function") updateMenuState();
  if (typeof refreshTeachTextDocumentState === "function") refreshTeachTextDocumentState();
  if (typeof syncWorkspaceAppOwnership === "function") syncWorkspaceAppOwnership();
  if (typeof renderMultiFinderMenu === "function") renderMultiFinderMenu();
}

async function activateWorkspaceProfile(value, options = {}) {
  const nextProfile = setWorkspaceProfile(value, { persist: false });
  hideWorkspaceDisallowedWindows();
  if (
    nextProfile === workspaceProfileDesktop
    && typeof isTeachTextManuscriptRole === "function"
    && isTeachTextManuscriptRole()
    && !getWindow("teachText")?.classList.contains("is-hidden")
    && typeof openDesktopTeachTextWindow === "function"
  ) {
    openDesktopTeachTextWindow();
  }
  refreshWorkspaceProfileSurfaces();
  if (options.openDefault !== false) {
    await openWindow(nextProfile === workspaceProfileDesktop ? "disk" : "assistant");
  }
  if (options.persist !== false && typeof saveDeskState === "function") await saveDeskState();
  if (typeof scheduleWorkingSessionSave === "function") scheduleWorkingSessionSave();
  return nextProfile;
}

async function openWritingStudio() {
  await activateWorkspaceProfile(workspaceProfileWriting, { openDefault: false });
  await openWritingStudioDefaultSurface();
}

/**
 * Central decision for what Writing Studio opens on entry. One function owns
 * the project-state -> surface mapping so buttons, menus, and the desktop
 * toggle never re-derive it:
 *
 *   no project          -> Project Hard Disk (create/choose)
 *   no Question Sheet   -> Question Sheet
 *   outline exists      -> Outline
 *   any draft body      -> Section Drafts
 *   review in progress  -> Review Desk + Manuscript
 *   completed           -> Manuscript (Project CD stays one click away)
 *
 * ClioTalk stays summonable but is never the Writing Studio home. Session
 * restore is untouched: a restored desk keeps the user's last position.
 */
function writingStudioDefaultEntry(project = typeof getActiveProject === "function" ? getActiveProject() : null) {
  if (!project || !isProjectMounted) return "projects";
  const questionSheet = String(project.questionSheet || "").trim();
  if (!questionSheet) return "questionSheet";
  const hasOutline = (project.outlineSections || []).length > 1
    || /^##\s+/m.test(String(project.outline || ""));
  const hasDraftBody = (project.drafts || []).some((draft) => String(draft.body || "").trim());
  const reviewing = project.flowState?.check === true;
  const workflowFinal = typeof teachTextWorkflowState === "string"
    ? teachTextWorkflowState === "final"
    : false;
  if (reviewing && workflowFinal) return "teachText";
  if (reviewing) return "reviewDesk";
  if (hasDraftBody) return "sectionDrafts";
  if (hasOutline) return "outline";
  return "questionSheet";
}

async function openWritingStudioDefaultSurface() {
  const entry = writingStudioDefaultEntry();
  if (entry === "projects") {
    openWindow("projects");
    return;
  }
  if (entry === "reviewDesk") {
    openReviewDesk("style");
    openWindow("teachText");
    return;
  }
  if (entry === "teachText") {
    if (typeof openTeachTextManuscriptWindow === "function") {
      openTeachTextManuscriptWindow();
    } else {
      openWindow("teachText");
    }
    return;
  }
  openWindow(entry);
}

async function exitWritingStudio() {
  if (workspaceProfile !== workspaceProfileWriting) return;
  if (
    typeof isTeachTextManuscriptRole === "function"
    && isTeachTextManuscriptRole()
    && typeof shouldPromptForTeachTextFileSave === "function"
    && shouldPromptForTeachTextFileSave()
  ) {
    const result = await showSystemModal(teachTextUnsavedChangesMessage(), "save");
    if (result === "cancel") return;
    if (result === "yes") {
      const saved = await saveTextDocument();
      if (!saved) return;
    } else {
      setTeachTextStatus("saved");
    }
  }
  runningApps?.delete?.("writingStudio");
  hiddenAppIds?.delete?.("writingStudio");
  await activateWorkspaceProfile(workspaceProfileDesktop);
  setStatus(t("app_quit", t("writing_studio")));
}

function setWorkspaceProfile(value, options = {}) {
  const nextProfile = normalizeWorkspaceProfile(value);
  const changed = nextProfile !== workspaceProfile;
  workspaceProfile = nextProfile;
  syncWorkspaceProfileDom();
  if (changed && options.persist !== false && typeof saveDeskState === "function") {
    saveDeskState();
  }
  if (typeof updateMenuState === "function") updateMenuState();
  return workspaceProfile;
}

async function applyDeploymentWorkspaceDefault() {
  if (workspaceProfileWasRestored) return workspaceProfile;
  const capabilities = await window.AISystem6PublicAccess?.getCapabilities?.();
  if (!capabilities?.public_deployment) return workspaceProfile;
  return setWorkspaceProfile(workspaceProfileDesktop, { persist: false });
}
