// Core runtime module: desktop-runtime.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.

// One shared, unlock-aware sound engine (see app/core/system-sounds.js). The
// Control Panel toggle is read lazily at play time, and sounds requested
// before the browser allows audio (the boot chime) are queued and replayed on
// the first user gesture.
const systemSoundEngine = window.AISystem6SystemSounds?.createSystemSoundEngine?.({
  getEnabled: () => !soundEffectsInput || soundEffectsInput.checked,
});

// Session-only boot flag: a refresh, PWA background return, or same-session
// reopen is a warm resume and skips the full Happy Mac hold; a new browser
// session or an explicit Restart is a cold boot with the complete ceremony.
const BOOT_SESSION_KEY = "ai-system6-boot-seen";

function sessionBootSeen() {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(BOOT_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markSessionBootSeen() {
  try {
    sessionStorage.setItem(BOOT_SESSION_KEY, "1");
  } catch {}
}

function clearSessionBootSeen() {
  try {
    sessionStorage.removeItem(BOOT_SESSION_KEY);
  } catch {}
}

function playSystemSound(type) {
  systemSoundEngine?.play(type);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBootSequence() {
  document.body.classList.add("is-booting");
  if (!bootScreenEl) {
    document.body.classList.remove("is-booting");
    return;
  }
  setBootMacState("sleeping");
  const desktopProfile = workspaceProfile === workspaceProfileDesktop;
  bootProjectDiskEl?.classList.toggle("is-hidden", desktopProfile);
  bootLocalModelEl?.classList.toggle("is-hidden", desktopProfile);
  updateBootLedger("startup");
  const steps = desktopProfile ? [
    [t("boot_starting"), "24%", "startup", "sleeping", 190],
    [t("boot_fonts"), "56%", "system", "sleeping", 190],
    [t("boot_disks"), "84%", "project", "happy", 430],
    [t("boot_ready"), "84%", "ready", "happy", 760],
  ] : [
    [t("boot_starting"), "18%", "startup", "sleeping", 190],
    [t("boot_fonts"), "42%", "system", "sleeping", 190],
    [t("boot_disks"), "66%", "project", "sleeping", 190],
    [t("boot_model"), "84%", "model", "happy", 430],
    [t("boot_ready"), "84%", "ready", "happy", 760],
  ];

  const warmResume = sessionBootSeen();
  // Warm resume plays no boot chime: the sound engine may queue it until the
  // first user gesture, which would turn a refresh into a delayed boot sound.
  if (!warmResume) playSystemSound("boot");
  steps.forEach(([message, progress, stage, macState]) => {
    setBootMacState(macState);
    updateBootLedger(stage);
    if (bootMessageEl) bootMessageEl.textContent = message;
    if (bootProgressFillEl) bootProgressFillEl.style.width = progress;
  });
  // Warm resume cancels the visual holds (only a short Happy Mac flash and
  // fade remain); it never skips loadDeskState, migration, storage restore or
  // the Working Session, which all run before this sequence.
  for (let index = 0; index < steps.length; index += 1) {
    await delay(warmResume ? (index === steps.length - 1 ? 80 : 0) : steps[index][4]);
  }
  bootScreenEl.classList.add("is-done");
  await delay(warmResume ? 140 : 260);
  bootScreenEl.hidden = true;
  document.body.classList.remove("is-booting");
  if (!warmResume) markSessionBootSeen();
}

function setBootMacState(state = "sleeping") {
  const mac = bootScreenEl?.querySelector(".happy-mac");
  if (!mac) return;
  mac.classList.toggle("is-sleeping", state === "sleeping");
  mac.classList.toggle("is-happy", state === "happy");
  mac.classList.toggle("is-sad", state === "sad");
}

function showBootFailure(error) {
  console.error("AI System 6 failed to start.", error);
  setBootMacState("sad");
  if (bootScreenEl) {
    document.body.classList.add("is-booting");
    bootScreenEl.hidden = false;
    bootScreenEl.classList.remove("is-done");
  }
  if (bootMessageEl) bootMessageEl.textContent = t("boot_failed_recovery");
  if (bootProgressFillEl) bootProgressFillEl.style.width = "100%";
  document.getElementById("boot-failure-actions")?.classList.remove("is-hidden");
}

function setBootLedgerItem(el, label, value = "", state = "pending") {
  if (!el) return;
  el.textContent = value ? `${label}: ${value}` : label;
  el.classList.toggle("is-ready", state === "ready");
  el.classList.toggle("is-standby", state === "standby");
}

function updateBootLedger(stage = "startup") {
  const project = getActiveProject?.();
  const projectMounted = !!(project && isProjectMounted);
  const cloudModelReady = !!(typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudConfig?.provider && cloudCredentialReady() && cloudConfig?.model);
  const modelName = modelInput?.value.trim();
  const modelReady = cloudModelReady || localModelState.ready || localModelState.loaded || !!modelName;
  const modelDisplayName = cloudModelReady ? cloudConfig.model : (modelName || modelInput?.placeholder || "LM Studio");

  setBootLedgerItem(
    bootStartupDiskEl,
    t("boot_startup_pending"),
    stage === "startup" ? "" : t("boot_ready_short"),
    stage === "startup" ? "pending" : "ready"
  );

  setBootLedgerItem(
    bootProjectDiskEl,
    t("boot_project_pending"),
    ["startup", "system"].includes(stage)
      ? ""
      : projectMounted
        ? project.name
        : t("boot_missing_short"),
    ["startup", "system"].includes(stage)
      ? "pending"
      : projectMounted
        ? "ready"
        : "standby"
  );

  setBootLedgerItem(
    bootLocalModelEl,
    t("boot_model_pending"),
    ["startup", "system", "project"].includes(stage)
      ? ""
      : modelReady
        ? modelDisplayName
        : t("boot_standby_short"),
    ["startup", "system", "project"].includes(stage)
      ? "pending"
      : modelReady
        ? "ready"
        : "standby"
  );
}

// Mounting a disk brings back that disk's own desktop scene. Pass
// { resumeScene: false } when the caller owns the windows itself (a writing
// surface that mounts a disk on the way to opening its own window).
async function switchProject(projectId, options = {}) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) {
    renderProjectDisks();
    return;
  }

  if (project.id === activeProjectId && isProjectMounted) {
    renderProjectDisks();
    return;
  }

  if (typeof flushPendingQuickDraftCommit === "function" && !await flushPendingQuickDraftCommit()) {
    setStatus(t("quick_draft_save_failed"));
    return false;
  }
  // Flush the Working Session before activeProjectId moves: the old project's
  // scene (windows, selection, cursor, scroll) must never be saved under the
  // new project's ownership.
  if (typeof flushWorkingSessionCommit === "function") {
    await flushWorkingSessionCommit();
  }

  // Play mechanical disk sound
  playSystemSound("disk");

  const previousProjectId = activeProjectId;
  parkConversationInProject(previousProjectId);

  const wasArchived = project.archived;
  project.archived = false;
  isProjectMounted = true;
  activeProjectId = project.id;
  window.AISystem6AssistantActivity?.resetForProject?.(project.id);
  selectedProjectId = project.id;
  selectedFolderId = "all";
  clearProjectTransientState();
  selectedScrapId = getProjectScraps()[0]?.id || null;
  if (selectedScrapId) selectedScrapIds.add(selectedScrapId);
  selectedProjectCdItemId = getProjectCdItems(project.id)[0]?.id || null;
  if (selectedProjectCdItemId) selectedProjectCdItemIds.add(selectedProjectCdItemId);
  lastClipScrapId = selectedScrapId;
  closeProjectScopedWindows();
  scheduleWorkspaceRender({ projectReferences: true, mountedTextDisk: true, menuState: true });
  resetAssistantForProject(project.name);
  loadActiveProjectReferences();
  // The disk is mounted; give it back the desk it had. Startup Items open only
  // when this disk has no scene of its own yet.
  if (options.resumeScene !== false && typeof restoreWorkingSession === "function") {
    const resumed = await restoreWorkingSession({ projectId: project.id, mounted: true });
    if (!resumed) openStartupItems();
  }
  saveDeskState();
  scheduleDesktopMaintenance("project");
  setStatus(wasArchived ? t("project_unarchived", project.name) : t("project_opened", project.name));
  return true;
}

async function createProjectFromInput() {
  const name = projectDiskNameInput.value.trim() || t("untitled_project");
  if (getProjectNameConflict(name)) {
    setStatus(t("project_name_taken", name));
    if (!projectDiskNameInput.closest("[hidden]")) {
      projectDiskNameInput.focus();
      projectDiskNameInput.select();
    }
    return;
  }

  isPreparingProjectDisk = false;
  const project = createProjectRecord(name);
  const previousProjectId = activeProjectId;
  if (typeof flushWorkingSessionCommit === "function") {
    await flushWorkingSessionCommit();
  }
  parkConversationInProject(previousProjectId);
  await window.AISystem6StateStores?.projects.commit((draft) => {
    draft.projects.unshift(project);
  });
  isProjectMounted = true;
  activeProjectId = project.id;
  selectedProjectId = project.id;
  selectedFolderId = "all";
  clearProjectTransientState();
  closeProjectScopedWindows();
  scheduleWorkspaceRender({ projectReferences: true, mountedTextDisk: true, menuState: true });
  resetAssistantForProject(project.name);
  loadActiveProjectReferences();
  await openWindow("projects");
  // The projects.commit() above saves through saveDeskState(), but it runs
  // while activeProjectId still names the previous disk -- so the settings
  // record kept the old mount until some later, unrelated save corrected it.
  // Record the mount here instead of leaving it to an accident of timing. This
  // comes after the window opens, because saveDeskState() also writes the
  // scene, and the scene must show the desk the new disk actually has.
  // flushWorkingSessionCommit() above already parked the previous disk's scene.
  await saveDeskState();
  setStatus(t("project_created", project.name));
}

async function createDefaultProjectForDraftDesk() {
  const name = uniqueProjectName(t("untitled_project"));
  const project = createProjectRecord(name);
  const previousProjectId = activeProjectId;
  parkConversationInProject(previousProjectId);
  await window.AISystem6StateStores?.projects.commit((draft) => {
    draft.projects.unshift(project);
  });
  isProjectMounted = true;
  activeProjectId = project.id;
  selectedProjectId = project.id;
  selectedFolderId = "all";
  clearProjectTransientState();
  closeProjectScopedWindows();
  scheduleWorkspaceRender({ projectReferences: true, mountedTextDisk: true, menuState: true });
  resetAssistantForProject(project.name);
  loadActiveProjectReferences();
  await saveDeskState();
  await window.AISystem6WebPlatform?.renderProjectStorageStatus?.();
  await ensureQuickDraftModule?.();
  await window.AISystem6QuickDraft?.open?.();
  setStatus(t("project_created", project.name));
  return project;
}

function uniqueProjectName(baseName) {
  const base = (baseName || t("untitled_project")).trim() || t("untitled_project");
  if (!getProjectNameConflict(base)) return base;
  let index = 2;
  while (getProjectNameConflict(`${base} ${index}`)) {
    index += 1;
  }
  return `${base} ${index}`;
}

function mountProject(project) {
  const previousProjectId = activeProjectId;
  parkConversationInProject(previousProjectId);
  isProjectMounted = true;
  activeProjectId = project.id;
  window.AISystem6AssistantActivity?.resetForProject?.(project.id);
  selectedProjectId = project.id;
  selectedFolderId = "all";
  clearProjectTransientState();
}

function createTeachTextFile({ project, folder, name, body, label = "draft" }) {
  const now = new Date().toISOString();
  const file = {
    id: crypto.randomUUID(),
    projectId: project.id,
    type: "text",
    name,
    folderId: folder.id,
    body,
    label,
    durable: true,
    createdAt: now,
    updatedAt: now,
  };
  chatFiles.unshift(file);
  return file;
}

function nextProjectDiskName() {
  const base = t("untitled_project");
  const names = new Set(projects.map((project) => project.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;

  let index = 2;
  while (names.has(`${base} ${index}`.toLowerCase())) {
    index += 1;
  }
  return `${base} ${index}`;
}

function nextAvailableProjectName(baseName) {
  const base = (baseName || t("untitled_project")).trim() || t("untitled_project");
  const names = new Set(projects.map((project) => project.name.trim().toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;

  let index = 2;
  while (names.has(`${base} ${index}`.toLowerCase())) {
    index += 1;
  }
  return `${base} ${index}`;
}

function showNewProjectDiskModal() {
  const dialog = document.querySelector("#new-project-disk-modal");
  const input = dialog?.querySelector("#new-project-disk-name");
  if (!dialog || !input) return null;

  return new Promise((resolve) => {
    const titleEl = dialog.querySelector("#new-project-disk-title");
    const ledeEl = dialog.querySelector("#new-project-disk-lede");
    const createButton = dialog.querySelector("#new-project-disk-confirm");
    const cancelButton = dialog.querySelector("#new-project-disk-cancel");

    titleEl.textContent = t("new_project_disk_title");
    ledeEl.textContent = t("new_project_disk_lede");
    createButton.textContent = t("new_project_disk_create");
    cancelButton.textContent = t("cancel");
    input.setAttribute("aria-label", t("new_project_prompt"));
    input.value = nextProjectDiskName();

    const commit = () => {
      const name = String(input.value || "").trim();
      if (!name) {
        input.focus();
        return;
      }
      if (getProjectNameConflict(name)) {
        ledeEl.textContent = t("project_name_taken", name);
        input.focus();
        input.select();
        return;
      }
      dialog.close("ok");
    };

    if (!dialog.dataset.inputWired) {
      dialog.dataset.inputWired = "true";
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !eventIsTextComposition(event)) {
          event.preventDefault();
          commit();
        }
      });
      createButton.addEventListener("click", (event) => {
        event.preventDefault();
        commit();
      });
    }

    dialog.onclose = () => {
      modalScrim.classList.add("is-hidden");
      resolve({ result: dialog.returnValue || "cancel", value: input.value });
    };

    playSystemSound("save");
    modalScrim.classList.remove("is-hidden");
    if (dialog.open) dialog.close("cancel");
    dialog.showModal();
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

function prepareNewProjectDisk() {
  isPreparingProjectDisk = true;
  selectedProjectId = activeProjectId;
  const result = showNewProjectDiskModal();
  if (!result) {
    isPreparingProjectDisk = false;
    return;
  }
  result.then(({ result: action, value }) => {
    const name = String(value || "").trim();
    if (action !== "ok" || !name) {
      isPreparingProjectDisk = false;
      return;
    }
    projectDiskNameInput.value = name;
    createProjectFromInput();
  });
}

function openSelectedProject() {
  const project = getSelectedProject();
  if (project) switchProject(project.id);
}

async function duplicateSelectedProjectDisk() {
  const source = getSelectedProject();
  if (!source) return;

  const now = new Date().toISOString();
  const copyProject = structuredClone(source);
  const sourceProjectId = source.id;
  const folderIdMap = new Map();

  copyProject.id = crypto.randomUUID();
  copyProject.name = nextAvailableProjectName(`${source.name} copy`);
  copyProject.createdAt = now;
  copyProject.updatedAt = now;
  copyProject.archived = false;

  const copiedFolders = chatFolders
    .filter((folder) => folder.projectId === sourceProjectId)
    .map((folder) => {
      const copy = structuredClone(folder);
      folderIdMap.set(folder.id, crypto.randomUUID());
      copy.id = folderIdMap.get(folder.id);
      copy.projectId = copyProject.id;
      copy.parentId = folder.parentId || null;
      return copy;
    });

  copiedFolders.forEach((folder) => {
    if (folder.parentId && folderIdMap.has(folder.parentId)) {
      folder.parentId = folderIdMap.get(folder.parentId);
    }
  });

  const copiedFiles = chatFiles
    .filter((file) => file.projectId === sourceProjectId)
    .map((file) => {
      const copy = structuredClone(file);
      copy.id = crypto.randomUUID();
      copy.projectId = copyProject.id;
      if (copy.folderId && folderIdMap.has(copy.folderId)) {
        copy.folderId = folderIdMap.get(copy.folderId);
      }
      copy.createdAt = now;
      copy.updatedAt = now;
      return copy;
    });

  const copiedScraps = scraps
    .filter((scrap) => scrap.projectId === sourceProjectId)
    .map((scrap) => ({
      ...structuredClone(scrap),
      id: crypto.randomUUID(),
      projectId: copyProject.id,
      createdAt: now,
    }));

  const copiedProjectCdItems = projectCdItems
    .filter((item) => item.projectId === sourceProjectId)
    .map((item) => ({
      ...structuredClone(item),
      id: crypto.randomUUID(),
      projectId: copyProject.id,
      burnedAt: now,
      updatedAt: now,
    }));

  projects.unshift(copyProject);
  chatFolders.unshift(...copiedFolders);
  chatFiles.unshift(...copiedFiles);
  scraps.unshift(...copiedScraps);
  projectCdItems.unshift(...copiedProjectCdItems);

  try {
    const refs = await getStoredProjectReferences(sourceProjectId);
    await Promise.all(refs.map((reference) =>
      putStoredProjectReference({
        ...structuredClone(reference),
        id: crypto.randomUUID(),
        projectId: copyProject.id,
        createdAt: now,
        updatedAt: now,
      })
    ));
  } catch (error) {
    setStatus(t("project_reference_error", error.message));
  }

  isProjectMounted = true;
  activeProjectId = copyProject.id;
  selectedProjectId = copyProject.id;
  selectedFolderId = "all";
  clearProjectTransientState();
  selectedScrapId = copiedScraps[0]?.id || null;
  if (selectedScrapId) selectedScrapIds.add(selectedScrapId);
  selectedProjectCdItemId = copiedProjectCdItems[0]?.id || null;
  if (selectedProjectCdItemId) selectedProjectCdItemIds.add(selectedProjectCdItemId);
  closeProjectScopedWindows();
  scheduleWorkspaceRender({ projectReferences: true, mountedTextDisk: true, menuState: true });
  resetAssistantForProject(copyProject.name);
  await loadActiveProjectReferences();
  saveDeskState();
  openWindow("projects");
  setStatus(t("project_duplicated", copyProject.name));
}

function archiveSelectedProjectDisk() {
  const project = getSelectedProject();
  if (!project) return;

  project.archived = true;
  project.updatedAt = new Date().toISOString();
  if (project.id === activeProjectId && isProjectMounted) {
    ejectActiveProject();
  } else {
    renderProjectDisks();
    saveDeskState();
    setStatus(t("project_archived", project.name));
  }
}

function ejectActiveProject() {
  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  // Capture the scene while this disk still owns it: the capture is
  // synchronous and its write is bound to that disk's scope key.
  if (typeof flushWorkingSessionCommit === "function") flushWorkingSessionCommit();
  parkConversationInProject(project.id);
  removeProjectReferenceChunks();
  projectReferences.length = 0;
  closeProjectScopedWindows();
  isProjectMounted = false;
  selectedProjectId = project.id;
  clearProjectTransientState();
  messagesEl.replaceChildren();
  renderClioTalkWelcome();
  renderClioTalkRunAssembly();
  scheduleWorkspaceRender({ projectLabels: true, projectReferences: true, mountedTextDisk: true, menuState: true });
  saveDeskState();
  openWindow("projects");
  setStatus(t("project_ejected", project.name));
}

function setStartupProjectFromSelection() {
  showStartupSettingsDialog();
}

function showStartupSettingsDialog() {
  if (!startupSettingsModal) {
    openProjectSwitcherForStartup();
    return;
  }
  if (typeof closeMenus === "function") closeMenus();
  document.body.classList.add("has-system-modal");

  startupModeInputs.forEach((input) => {
    input.checked = input.value === startupEnvironment;
  });
  startupOpenOptionInputs.forEach((input) => {
    input.checked = input.value === startupOpenMode;
  });
  syncStartupSelectedItemsLabel();
  syncStartupOpenOptions(startupEnvironment);
  modalScrim.classList.remove("is-hidden");
  startupSettingsModal.showModal();
}

function normalizeStartupOpenMode(mode, environment = startupEnvironment) {
  if (environment === "multifinder" && (mode === "selected-items" || mode === "opened-apps")) {
    return mode;
  }
  return "cliotalk";
}

function syncStartupOpenOptions(environment = startupEnvironment) {
  const selectedDesktopApplication = getSelectedDesktopApplicationItem();
  if (selectedDesktopApplication) setStartupSelectedApplication(selectedDesktopApplication);
  syncStartupSelectedItemsLabel();
  const isMultiFinderStartup = environment === "multifinder";
  startupOpenOptionInputs.forEach((input) => {
    const multiFinderOnlyOption = input.closest("[data-multifinder-only]");
    const unavailable = Boolean(multiFinderOnlyOption && !isMultiFinderStartup);
    input.disabled = unavailable;
    if (multiFinderOnlyOption) {
      if (unavailable) {
        multiFinderOnlyOption.dataset.balloonHelp = "balloon_startup_multifinder_only";
        multiFinderOnlyOption.setAttribute("aria-disabled", "true");
      } else {
        delete multiFinderOnlyOption.dataset.balloonHelp;
        multiFinderOnlyOption.removeAttribute("aria-disabled");
      }
    }
  });

  const selectedInput = document.querySelector("input[name='startup-open']:checked");
  const nextOpenMode = normalizeStartupOpenMode(selectedInput?.value, environment);
  startupOpenOptionInputs.forEach((input) => {
    input.checked = input.value === nextOpenMode;
  });

  const environmentHelp = document.querySelector("#startup-environment-help");
  if (environmentHelp) {
    // The choice must explain both environments before the user changes it;
    // describing only the currently selected radio makes the other name opaque.
    environmentHelp.textContent = t("startup_environment_explanation");
  }
}

async function setStartupEnvironmentPreference(mode, { promptRestart = true } = {}) {
  const nextEnvironment = mode === "multifinder" ? "multifinder" : "finder";
  const previousEnvironment = runtimeEnvironment;
  startupEnvironment = nextEnvironment;
  if (nextEnvironment === "multifinder" && previousEnvironment !== nextEnvironment) {
    multiFinderSwitcherHintSeen = false;
  }
  startupOpenMode = normalizeStartupOpenMode(startupOpenMode, startupEnvironment);
  syncStartupOpenOptions(startupEnvironment);
  renderProjectSwitcher();
  await saveDeskState();
  setStatus(startupEnvironment === "multifinder" ? t("startup_multifinder_set") : t("startup_finder_set"));

  if (promptRestart && previousEnvironment !== startupEnvironment) {
    const result = await showSystemModal(t("startup_restart_required", t(startupEnvironment === "multifinder" ? "multifinder" : "finder")), "confirm");
    if (result === "yes") restartSystem();
  }
}

async function handleStartupSettingsClose() {
  modalScrim.classList.add("is-hidden");
  document.body.classList.remove("has-system-modal");
  if (startupSettingsModal.returnValue !== "ok") return;

  const selectedMode = document.querySelector("input[name='startup-mode']:checked")?.value;
  const selectedOpenMode = document.querySelector("input[name='startup-open']:checked")?.value;
  startupOpenMode = normalizeStartupOpenMode(selectedOpenMode, selectedMode === "finder" ? "finder" : "multifinder");
  await setStartupEnvironmentPreference(selectedMode, { promptRestart: true });
}

function openStartupItems() {
  if (!guideSeen) {
    // Welcome Floppy belongs to Finder, not Writing Studio. First launch gives
    // the desktop back immediately and mounts one read-only orientation disk.
    setWorkspaceProfile(workspaceProfileDesktop, { persist: false });
  }
  quietStartup();
  if (!guideSeen) {
    const assistant = getWindow("assistant");
    assistant?.classList.add("is-hidden");
    if (assistant) forgetWindowFromRunningApps("assistant");
    openWelcomeFloppy();
    return;
  }
  if (workspaceProfile === workspaceProfileDesktop) {
    const assistant = getWindow("assistant");
    assistant?.classList.add("is-hidden");
    if (assistant) forgetWindowFromRunningApps("assistant");
    openWindow("disk");
    return;
  }
  const selectedApp = getStartupSelectedApplicationItem();
  if (startupOpenMode === "selected-items" && selectedApp && isMultiFinderMode()) {
    handleAction(selectedApp.action);
    return;
  }
  if (startupOpenMode === "opened-apps" && isMultiFinderMode()) {
    const names = normalizeStartupOpenedWindowNames(startupOpenedWindowNames);
    if (names.length) {
      names.forEach((name) => openWindow(name));
      return;
    }
  }
  openWindow("assistant");
}

function normalizeStartupOpenedWindowNames(names) {
  if (!Array.isArray(names)) return [];
  const seen = new Set();
  return names.filter((name) => {
    if (typeof name !== "string" || seen.has(name)) return false;
    const win = getWindow(name);
    if (!win) return false;
    const appId = getWindowAppId(name);
    if (appId === "finder" || appId === "system") return false;
    seen.add(name);
    return true;
  });
}

function captureStartupOpenedWindowNames() {
  return normalizeStartupOpenedWindowNames(
    Array.from(document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden)"))
      .map((win) => win.dataset.window)
  );
}

function setStartupProject(projectId) {
  const project = projects.find((item) => item.id === projectId) || getSelectedProject() || getActiveProject();
  if (!project) {
    openWindow("projects");
    setStatus(t("no_project_mounted"));
    return;
  }

  startupProjectId = project.id;
  project.archived = false;
  project.updatedAt = new Date().toISOString();
  selectedProjectId = project.id;
  renderProjectDisks();
  renderProjectSwitcher();
  saveDeskState();
  setStatus(t("startup_project_set", projectDisplayName(project)));
}

function ejectMenuSelection() {
  const active = document.querySelector(".window.is-active:not(.is-hidden)");
  const activeName = active?.dataset.window;
  const hasMountedFileFloppy = getMountedTextDiskChunks().length > 0;

  if (["textDisk", "rag"].includes(activeName)) {
    if (hasMountedFileFloppy) {
      ejectTextDisk();
    } else {
      closeWindow(activeName, true);
      setStatus(t("no_text_disk_mounted"));
    }
    return;
  }

  if (activeName === "projectCd") {
    closeWindow("projectCd", true);
    setStatus(t("project_cd_ejected"));
    return;
  }

  if (activeName === "projects") {
    const selected = getSelectedProject();
    if (selected && selected.id !== activeProjectId) {
      setStatus(t("select_mounted_project_to_eject"));
      return;
    }
  }

  if (isProjectMounted) {
    ejectActiveProject();
    return;
  }

  if (hasMountedFileFloppy) {
    ejectSelectedMountedFile();
    return;
  }

  setStatus(t("nothing_to_eject"));
}

function openProjectInfo() {
  const project = getActiveProject();
  if (!project) {
    openWindow("projects");
    setStatus(t("no_project_mounted"));
    return;
  }

  const projectFiles = chatFiles.filter((f) => f.projectId === project.id);
  const projectScraps = scraps.filter((s) => s.projectId === project.id);
  const projectRefs = projectReferences.filter((r) => r.projectId === project.id);

  // Total word count across files
  const wordCount = projectFiles.reduce((acc, f) => {
    return acc + (f.body || "").trim().split(/\s+/).filter(w => w.length > 0).length;
  }, 0);

  infoProjectNameEl.textContent = project.name;
  infoProjectCreatedEl.textContent = new Date(project.createdAt).toLocaleString();
  infoProjectModifiedEl.textContent = new Date(project.updatedAt).toLocaleString();

  infoFileCountEl.textContent = projectFiles.length;
  infoScrapCountEl.textContent = projectScraps.length;
  infoRefCountEl.textContent = projectRefs.length;
  infoWordCountEl.textContent = wordCount;

  openWindow("projectInfo");
}

function openFileInfo() {
  const item = getActiveItem();
  if (!item) {
    openProjectInfo();
    return;
  }

  fileInfoItem = item;
  fileInfoNameEl.textContent = item.name || item.title;
  fileInfoCreatedEl.textContent = item.createdAt ? new Date(item.createdAt).toLocaleString() : "--";
  fileInfoModifiedEl.textContent = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "--";

  let kindLabel = "Unknown";
  let iconClass = "scrapbook-icon";
  let iconId = "scrap";
  let sizeBytes = 0;

  if (item.type === "alias") {
    kindLabel = t("kind_alias");
    iconClass = "alias-icon";
    iconId = "alias";
    sizeBytes = 0;
  } else if (item.artifactKind === "clipping") {
    kindLabel = t("kind_clipping");
    iconClass = "scrap-icon";
    iconId = "scrap";
    sizeBytes = (item.body || "").length;
  } else if (item.type === "text") {
    kindLabel = t("kind_teachtext");
    iconClass = "teachtext-icon";
    iconId = "teachText";
    sizeBytes = (item.body || "").length;
  } else if (item.type === "chat") {
    kindLabel = t("kind_chat");
    iconClass = "doc-icon";
    iconId = "chatFile";
    sizeBytes = JSON.stringify(item.messages || []).length;
  } else if (item.type === "folder") {
    kindLabel = t("folder_kind");
    iconClass = "folder-icon";
    iconId = "folder";
    sizeBytes = item.itemCount ?? getProjectFolderDeepItemCount(item.id);
  } else if (item.type === "finder-root") {
    kindLabel = item.kindLabel || t("folder_kind");
    iconClass = item.iconClass || "folder-icon";
    iconId = item.iconId || iconClass;
    sizeBytes = item.itemCount || 0;
  } else if (item.type === "finder-volume") {
    kindLabel = item.kindLabel || t("project_disk");
    iconClass = item.iconClass || "hard-disk-icon";
    iconId = item.iconId || "startupDisk";
    sizeBytes = item.itemCount || 0;
  } else if (item.type === "mountedFile") {
    kindLabel = item.kindLabel || t("mounted_text_disk");
    iconClass = item.iconClass || "doc-icon";
    iconId = item.iconId || "document";
    sizeBytes = item.sizeValue ?? String(item.body || "").length;
  } else if (item.type === "projectCdItem") {
    kindLabel = item.kindLabel || t("project_cd");
    iconClass = item.iconClass || "doc-icon";
    iconId = item.iconId || "document";
    sizeBytes = item.sizeValue ?? String(item.body || "").length;
  } else if (item.type === "trashRoot") {
    kindLabel = item.kindLabel || t("trash_kind");
    iconClass = item.iconClass || "trash-icon";
    iconId = item.iconId || "trash";
    sizeBytes = item.itemCount || 0;
  } else if (item.type === "trashItem") {
    kindLabel = item.kindLabel || t("trash_kind");
    iconClass = item.iconClass || "doc-icon";
    iconId = item.iconId || "document";
    sizeBytes = item.sizeValue ?? String(item.body || "").length;
  } else if (projects.includes(item)) {
    kindLabel = t("project_disk");
    iconClass = "project-disk-icon";
    iconId = "projectDisk";
    sizeBytes = chatFiles.filter((file) => file.projectId === item.id).length
      + scraps.filter((scrap) => scrap.projectId === item.id).length;
  } else if (item.body !== undefined) {
    kindLabel = t("kind_scrap");
    iconClass = "scrapbook-icon";
    iconId = "scrap";
    sizeBytes = (item.body || "").length;
  } else if (item.virtual) {
    kindLabel = item.kind || t("system_component");
    iconClass = item.icon || "doc-icon";
    iconId = item.iconId || item.icon || "document";
  }

  fileInfoKindEl.textContent = `${t("kind")}: ${kindLabel}`;
  fileInfoSizeEl.textContent = item.sizeLabel
    || (projects.includes(item) || item.type === "finder-volume" || item.type === "finder-root" || item.type === "trashRoot" || item.type === "folder" ? t("items_count", sizeBytes) : `${sizeBytes} bytes`);
  const project = item.projectId ? projects.find((entry) => entry.id === item.projectId) : getActiveProject();
  fileInfoLocationEl.textContent = item.location || (project ? projectDisplayName(project) : t("project_disk"));
  const folder = item.folderId ? chatFolders.find((entry) => entry.id === item.folderId) : null;
  const sourceMatch = (item.body || "").match(/URL:\s*(https?:\/\/\S+)/i);
  fileInfoFolderEl.textContent = item.type === "finder-volume" || item.type === "trashRoot"
    ? item.name
    : item.type === "finder-root"
    ? getFinderItemPathLabel(item)
    : item.type === "folder"
      ? getFinderItemPathLabel(item)
    // A trashed object's folder is the place it will go back to, which is the
    // only address it still has.
    : item.type === "trashItem"
      ? item.folderLabel || item.location
    : item.type === "mountedFile" || item.type === "projectCdItem"
      ? item.location
      : folder ? getProjectFolderPathLabel(folder.id, item.projectId || activeProjectId) : getProjectFolderPathLabel(null, item.projectId || activeProjectId);
  fileInfoSourceEl.textContent = sourceMatch?.[1] || t("local_source");
  fileInfoContextEl.textContent = item.virtual
    ? t("local_desktop")
    : item.type === "mountedFile"
      ? t("durable_no")
    // Trashed material carries a projectId, so without this branch Get Info
    // read "Saved on Project Hard Disk" for something already thrown away.
    : item.type === "trashRoot" || item.type === "trashItem"
      ? t("durable_trash")
      : item.projectId || projects.includes(item) || item.type === "finder-volume" || item.type === "finder-root" || item.type === "folder" ? t("durable_yes") : t("durable_no");
  fileInfoCommentsEl.value = item.comments || "";
  fileInfoCommentsEl.disabled = item.readOnly === true;
  // Stationery Pad applies to editable project files, not folders, system
  // components, or derived artifacts whose identity is load-bearing.
  const stationeryAvailable = (item.type === "text" || item.type === "chat") && item.readOnly !== true && !String(item.artifactKind || "").trim() && isInActiveProject(item);
  fileInfoStationeryEl.checked = item.stationery === true;
  fileInfoStationeryEl.disabled = !stationeryAvailable;
  withFinderObjects(() => {
    if (typeof renderFinderObjectInfo === "function" && fileInfoItem === item) renderFinderObjectInfo(item);
  });

  fileInfoIconEl.className = `large-mini-icon sys-icon ${iconClass}`;
  fileInfoIconEl.dataset.systemIcon = normalizeSystemIconId(iconId);
  fileInfoIconEl.innerHTML = systemIconSvg(iconId, { size: 48, title: kindLabel });

  renderFileInfoKindActions(item);
  openWindow("fileInfo");
}

// Verbs that only make sense for one kind of object.
//
// These used to sit in Finder's File menu, where they were permanently black
// because they had no availability entry, and answered a click with "select an
// item first". Here they exist only when their object does, which is both the
// System 6 answer (Get Info is the object's own surface — contextual menus
// arrived with Mac OS 8) and the honest one: an absent row cannot lie about
// being available.
const fileInfoKindActions = [
  { kind: "ai-skill", action: "toggle-project-skill", labelKey: "enable_disable_project_skill" },
  { kind: "project-memory", action: "toggle-project-memory", labelKey: "toggle_project_memory" },
  { kind: "retrospective", action: "attach-retrospective-next-task", labelKey: "attach_retrospective_next_task" },
  { kind: "retrospective", action: "create-skill-draft-from-retrospective", labelKey: "create_skill_draft_from_retrospective" },
  { kind: "skill-draft", action: "create-project-skill-from-draft", labelKey: "create_project_skill_from_draft" },
  { kind: "skill-auto-call-receipt", action: "disable-auto-called-skill", labelKey: "disable_auto_called_skill" },
  { kind: "teachtext-modification-suggestion", action: "view-modification-suggestion-diff", labelKey: "view_modification_suggestion_diff" },
  { kind: "teachtext-modification-suggestion", action: "accept-modification-suggestion", labelKey: "accept_modification_suggestion" },
  { kind: "teachtext-modification-suggestion", action: "reject-modification-suggestion", labelKey: "reject_modification_suggestion" },
  { kind: "task-config-draft", action: "create-task-config-from-draft", labelKey: "create_task_config_from_draft" },
  { kind: "skill-auto-call-settings", action: "configure-skill-auto-call", labelKey: "configure_skill_auto_call" },
];

// Whole-volume verbs, keyed by the Finder volume the Get Info was opened from.
// Writing a File Floppy through to the Project Hard Disk acts on the mounted
// volume, not on a selected file, so it belongs to the volume's own window —
// where it used to be reachable only as one button among three.
const finderVolumeKindActions = new Map([
  ["textDisk", [
    { action: "add-text-disk-project", labelKey: "add_to_project_disk" },
  ]],
]);

// A burned Project CD item had four verbs and no surface of its own: Receipt
// and Copy Markdown were buttons in the volume window, and Download and Print
// to PDF were bare button ids no command could reach.
const projectCdItemKindActions = [
  { action: "open-finishing-receipt", labelKey: "finishing_receipt_ellipsis" },
  { action: "copy-project-cd-markdown", labelKey: "copy_markdown" },
  { action: "download-project-cd-item", labelKey: "download" },
  { action: "print-project-cd-item", labelKey: "print_to_pdf" },
];

function finderVolumeWindowNameForItem(item) {
  return String(item?.id || "").startsWith("finder-volume:")
    ? String(item.id).slice("finder-volume:".length)
    : "";
}

function fileInfoActionsForItem(item) {
  if (item?.type === "mountedFile") {
    return [
      { action: "install-mounted-skill", labelKey: "install_skill" },
      { action: "preview-mounted-skill", labelKey: "preview_skill" },
    ].filter(() => typeof parseMountedSkillPackage === "function" && parseMountedSkillPackage(item.name).valid);
  }
  if (item?.type === "finder-volume") {
    return finderVolumeKindActions.get(finderVolumeWindowNameForItem(item)) || [];
  }
  if (item?.type === "projectCdItem") return projectCdItemKindActions;
  return fileInfoKindActions.filter((entry) => entry.kind === item?.artifactKind);
}

function renderFileInfoKindActions(item) {
  const row = document.querySelector("#info-kind-actions");
  if (!row) return;
  row.replaceChildren();

  const entries = fileInfoActionsForItem(item);
  // A kind verb exists only while its object does, but existing is not the
  // same as being able to act. When the shared availability map answers for
  // the verb, the button reports that answer the way a menu row does: grey
  // and genuinely refusing the click, never grey-looking but still live.
  const availability = typeof getActionAvailability === "function" ? getActionAvailability() : {};

  entries.forEach((entry) => {
    const button = document.createElement("button");
    button.className = "btn";
    button.type = "button";
    button.dataset.action = entry.action;
    button.dataset.i18n = entry.labelKey;
    button.textContent = t(entry.labelKey);
    if (availability[entry.action] !== undefined) {
      button.disabled = !availability[entry.action];
      button.classList.toggle("is-disabled", !availability[entry.action]);
    }
    row.append(button);
  });
  row.hidden = entries.length === 0;
}

// The Trash has a window, a count, an icon that fills, and a selection the Put
// Away command already reads — but Get Info could not see any of it. The verb
// stayed grey in the Trash window forever, and from another Finder window it
// silently described the project instead of the object the user pointed at.
// These two shapes give the Trash and a trashed object the same Get Info the
// rest of Finder's objects have.
function getTrashRootFinderItem() {
  const items = typeof getProjectTrashItems === "function" ? getProjectTrashItems() : [];
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  return {
    id: "finder-trash",
    type: "trashRoot",
    name: t("trash"),
    title: t("trash"),
    kindLabel: t("trash_kind"),
    iconClass: "trash-icon",
    iconId: items.length ? "trashFull" : "trash",
    itemCount: items.length,
    sizeValue: items.length,
    sizeLabel: t("items_count", items.length),
    location: project ? projectDisplayName(project) : t("project_disk"),
    projectId: activeProjectId,
    readOnly: true,
    canOpen: false,
    canDuplicate: false,
    canRename: false,
    canTrash: false,
  };
}

function getTrashItemFinderItem(item) {
  if (!item) return null;
  const originalKind = t(`trash_type_${item.originalType || "note"}`);
  return {
    id: item.id,
    type: "trashItem",
    name: item.title,
    title: item.title,
    kindLabel: t("kind_in_trash", originalKind),
    iconClass: "doc-icon",
    iconId: "document",
    body: item.body || "",
    sizeValue: String(item.body || "").length,
    location: t("trash"),
    folderLabel: typeof getTrashOriginalPath === "function" ? getTrashOriginalPath(item) : "",
    projectId: item.projectId || activeProjectId,
    createdAt: item.createdAt || "",
    // "Modified" is the moment it was thrown away — the last thing that
    // actually happened to it.
    updatedAt: item.deletedAt || item.createdAt || "",
    readOnly: true,
    canOpen: false,
    canDuplicate: false,
    canRename: false,
    canTrash: false,
  };
}

function getActiveItem() {
  const activeWin = document.querySelector(".window.is-active");
  if (!activeWin) return null;

  const name = activeWin.dataset.window;
  if (typeof getFinderVolumeDefinition === "function" && getFinderVolumeDefinition(name)) {
    return getFinderVolumeSelectedItem(name) || getFinderVolumeRootItem(name);
  } else if (finderContainerWindowNames.includes(name)) {
    return getSelectedStaticFinderItem(name);
  } else if (name === "documents") {
    return getSelectedDocumentItem();
  } else if (name === "scrapbook") {
    return scraps.find((scrap) => scrap.id === selectedScrapId && isInActiveProject(scrap));
  } else if (name === "projects") {
    return getSelectedProjectRootItem();
  } else if (name === "trash") {
    const selected = typeof getSelectedTrashItem === "function" ? getSelectedTrashItem() : null;
    return selected ? getTrashItemFinderItem(selected) : getTrashRootFinderItem();
  }
  return null;
}

function restoreTrashItem(item) {
  if (!item || !isInActiveProject(item)) return false;

  if (item.originalType === "scrap" && item.originalData) {
    item.originalData.projectId = activeProjectId;
    if (!scraps.some((scrap) => scrap.id === item.originalData.id && isInActiveProject(scrap))) {
      scraps.push(item.originalData);
    }
    return true;
  }

  if (item.originalType === "file" && item.originalData) {
    item.originalData.projectId = activeProjectId;
    if (item.originalData.folderId && !chatFolders.some((folder) => folder.id === item.originalData.folderId && isInActiveProject(folder))) {
      item.originalData.folderId = null;
      setStatus(t("trash_restored_to_root", item.originalData.name || item.title));
    }
    if (!chatFiles.some((file) => file.id === item.originalData.id && isInActiveProject(file))) {
      chatFiles.push(item.originalData);
    }
    return true;
  }

  if (item.originalType === "folder" && item.originalData?.folder) {
    const rootFolder = structuredClone(item.originalData.folder);
    const childFolders = Array.isArray(item.originalData.folders) ? structuredClone(item.originalData.folders) : [];
    const childFiles = Array.isArray(item.originalData.files) ? structuredClone(item.originalData.files) : [];
    const restoringFolderIds = new Set([rootFolder.id, ...childFolders.map((folder) => folder.id)]);

    [rootFolder, ...childFolders].forEach((folder) => {
      folder.projectId = activeProjectId;
      if (folder.parentId && !restoringFolderIds.has(folder.parentId) && !chatFolders.some((item) => item.id === folder.parentId && isInActiveProject(item))) {
        folder.parentId = null;
        if (folder.id === rootFolder.id) setStatus(t("trash_restored_to_root", displayFolderName(rootFolder.name)));
      }
      if (!chatFolders.some((item) => item.id === folder.id && isInActiveProject(item))) {
        chatFolders.push(folder);
      }
    });

    childFiles.forEach((file) => {
      file.projectId = activeProjectId;
      if (file.folderId && !restoringFolderIds.has(file.folderId)) file.folderId = rootFolder.id;
      if (!chatFiles.some((item) => item.id === file.id && isInActiveProject(item))) {
        chatFiles.push(file);
      }
    });
    return true;
  }

  if (item.originalType === "project" && item.originalData) {
    if (!projects.some((project) => project.id === item.originalData.id)) {
      projects.push(item.originalData);
    }
    return true;
  }

  if (item.originalType === "projectCd" && item.originalData) {
    item.originalData.projectId = activeProjectId;
    if (!projectCdItems.some((cdItem) => cdItem.id === item.originalData.id && isInActiveProject(cdItem))) {
      projectCdItems.unshift(item.originalData);
      selectedProjectCdItemId = item.originalData.id;
      selectedProjectCdItemIds.clear();
      selectedProjectCdItemIds.add(item.originalData.id);
    }
    return true;
  }

  if (item.originalType === "projectReference" && item.originalData) {
    item.originalData.projectId = activeProjectId;
    if (!projectReferences.some((reference) => reference.id === item.originalData.id && reference.projectId === activeProjectId)) {
      projectReferences.unshift(item.originalData);
      selectedProjectReferenceId = item.originalData.id;
      if (typeof putStoredProjectReference === "function") putStoredProjectReference(item.originalData);
    }
    return true;
  }

  return false;
}

async function cleanupDeletedTrashItem(item) {
  if (!item?.originalType || !isInActiveProject(item)) return;

  if (item.originalType !== "project" || !item.originalData?.id) return;

  const projectId = item.originalData.id;
  for (let index = chatFiles.length - 1; index >= 0; index -= 1) {
    if (chatFiles[index].projectId === projectId) chatFiles.splice(index, 1);
  }
  for (let index = chatFolders.length - 1; index >= 0; index -= 1) {
    if (chatFolders[index].projectId === projectId) chatFolders.splice(index, 1);
  }
  for (let index = scraps.length - 1; index >= 0; index -= 1) {
    if (scraps[index].projectId === projectId) scraps.splice(index, 1);
  }
  for (let index = projectCdItems.length - 1; index >= 0; index -= 1) {
    if (projectCdItems[index].projectId === projectId) projectCdItems.splice(index, 1);
  }
  for (let index = trashItems.length - 1; index >= 0; index -= 1) {
    if (trashItems[index].projectId === projectId) trashItems.splice(index, 1);
  }

  try {
    const refs = await getStoredProjectReferences(projectId);
    await Promise.all(refs.map((reference) => deleteStoredProjectReference(reference.id)));
  } catch (error) {
    setStatus(t("project_reference_error", error.message));
  }
}

async function emptyActiveProjectTrash() {
  const items = getProjectTrashItems();
  if (!items.length) return;

  const project = getActiveProject();
  const projectName = project ? projectDisplayName(project) : t("project_disk");
  const result = await showSystemModal(t("empty_trash_confirm", items.length, projectName), "confirm");
  if (result !== "yes") return;

  for (const item of items) {
    await cleanupDeletedTrashItem(item);
    const index = trashItems.indexOf(item);
    if (index !== -1) trashItems.splice(index, 1);
  }
  renderTrash();
  renderProjectDisks();
  renderDocuments();
  renderScraps();
  renderProjectCd();
  saveDeskState();
  if (items.length) playSystemSound("trash");
}

function removeProjectItems(collection, projectId) {
  for (let index = collection.length - 1; index >= 0; index -= 1) {
    if (collection[index]?.projectId === projectId) collection.splice(index, 1);
  }
}

function getProjectDiskErasePreview(project) {
  const projectId = project.id;
  const status = [
    isProjectMounted && activeProjectId === projectId ? t("project_switcher_current") : "",
    startupProjectId === projectId ? t("project_switcher_startup") : "",
    project.archived ? t("archived") : "",
  ].filter(Boolean).join(" · ") || t("project_disk");
  const documentCount = chatFiles.filter((file) => file.projectId === projectId).length;
  const folderCount = chatFolders.filter((folder) => folder.projectId === projectId).length;
  const scrapCount = scraps.filter((scrap) => scrap.projectId === projectId).length;
  const exportCount = projectCdItems.filter((item) => item.projectId === projectId).length;
  const draftCount = Array.isArray(project.drafts) ? project.drafts.length : 0;
  const trashCount = trashItems.filter((item) => item.projectId === projectId).length;
  const mountedFileCount = mountedTextDisk.projectId === projectId ? mountedTextDisk.files.length : 0;
  const mountedChunkCount = mountedTextDisk.projectId === projectId ? getMountedTextDiskChunks().length : 0;
  const rows = [
    {
      iconClass: "folder-icon",
      iconId: "documents",
      name: t("documents"),
      meta: [t("folders_count", folderCount), t("records_count", documentCount)].join(" · "),
      count: folderCount + documentCount,
    },
    {
      iconClass: "scrapbook-desk-icon",
      iconId: "scrapbook",
      name: t("scrapbook_label"),
      meta: t("scraps_count", scrapCount),
      count: scrapCount,
    },
    {
      iconClass: "drafts-icon",
      iconId: "sectionDrafts",
      name: t("section_drafts"),
      meta: t("drafts_count", draftCount),
      count: draftCount,
    },
    {
      iconClass: "doc-icon",
      iconId: "projectDisc",
      name: t("project_cd"),
      meta: t("project_cd_items_count", exportCount),
      count: exportCount,
    },
    {
      iconClass: "trash-icon",
      iconId: "trash",
      name: t("trash"),
      meta: t("erase_disk_trash_count", trashCount),
      count: trashCount,
    },
  ];

  if (mountedFileCount || mountedChunkCount) {
    rows.splice(2, 0, {
      iconClass: "text-file-icon",
      iconId: "fileFloppy",
      name: t("mounted_text_disk"),
      meta: [t("files_count", mountedFileCount), t("chunks_count", mountedChunkCount)].join(" · "),
      count: mountedFileCount + mountedChunkCount,
    });
  }

  return {
    status,
    rows,
    totalCount: rows.reduce((sum, row) => sum + row.count, 0),
  };
}

function showEraseDiskPreviewModal(project) {
  const dialog = document.querySelector("#erase-disk-modal");
  if (!dialog) return showSystemModal(t("erase_disk_confirm_title", projectDisplayName(project)), "confirm");

  return new Promise((resolve) => {
    const projectName = projectDisplayName(project);
    const preview = getProjectDiskErasePreview(project);
    const titleEl = dialog.querySelector("#erase-disk-title");
    const subjectNameEl = dialog.querySelector("#erase-disk-subject-name");
    const subjectStatusEl = dialog.querySelector("#erase-disk-subject-status");
    const ledeEl = dialog.querySelector("#erase-disk-lede");
    const listEl = dialog.querySelector("#erase-disk-preview-list");
    const removeLabelEl = dialog.querySelector("#erase-disk-remove-label");
    const removeTextEl = dialog.querySelector("#erase-disk-remove-text");
    const keepLabelEl = dialog.querySelector("#erase-disk-keep-label");
    const keepTextEl = dialog.querySelector("#erase-disk-keep-text");
    const cancelButton = dialog.querySelector("#erase-disk-cancel");
    const confirmButton = dialog.querySelector("#erase-disk-confirm");

    titleEl.textContent = t("erase_disk_confirm_title", projectName);
    subjectNameEl.textContent = projectName;
    subjectStatusEl.textContent = preview.status;
    ledeEl.textContent = t("erase_disk_preview_lede");
    removeLabelEl.textContent = t("erase_disk_will_erase");
    removeTextEl.textContent = t("erase_disk_will_erase_text");
    keepLabelEl.textContent = t("erase_disk_will_keep");
    keepTextEl.textContent = t("erase_disk_will_keep_text");
    cancelButton.textContent = t("cancel");
    confirmButton.textContent = t("erase_disk_confirm_button");

    listEl.replaceChildren();
    preview.rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = `finder-operation-item${row.count ? "" : " is-empty"}`;
      item.innerHTML = `
        ${renderSystemIcon(row.iconId || row.iconClass, { size: "list"})}
        <span class="finder-operation-item-copy">
          <b>${escapeHtml(row.name)}</b>
          <small>${escapeHtml(row.meta)}</small>
        </span>
      `;
      listEl.append(item);
    });

    dialog.onclose = () => {
      modalScrim.classList.add("is-hidden");
      resolve(dialog.returnValue || "cancel");
    };

    playSystemSound("alert");
    modalScrim.classList.remove("is-hidden");
    if (dialog.open) dialog.close("cancel");
    dialog.showModal();
  });
}

async function eraseSelectedProjectDisk() {
  const project = getSelectedProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    return;
  }

  const projectName = projectDisplayName(project);
  const result = await showEraseDiskPreviewModal(project);
  if (result !== "yes") return;

  const projectId = project.id;
  const wasActiveProject = isProjectMounted && activeProjectId === projectId;
  const freshProject = createProjectRecord(project.name);
  Object.assign(project, {
    ...freshProject,
    id: project.id,
    name: project.name,
    createdAt: project.createdAt || freshProject.createdAt,
    archived: project.archived === true,
  });

  removeProjectItems(chatFiles, projectId);
  removeProjectItems(chatFolders, projectId);
  removeProjectItems(scraps, projectId);
  removeProjectItems(trashItems, projectId);
  removeProjectItems(projectCdItems, projectId);
  removeProjectItems(projectReferences, projectId);
  removeProjectItems(ragChunks, projectId);

  if (mountedTextDisk.projectId === projectId) {
    mountedTextDisk.files = [];
    mountedTextDisk.fileBodies = {};
    mountedTextDisk.fileDiagnostics = {};
    mountedTextDisk.fileSources = {};
    mountedTextDisk.chunks = 0;
    mountedTextDisk.projectId = null;
    selectedMountedFile = null;
    filesInput.value = "";
    updateFilePickerLabels();
  }

  try {
    const refs = await getStoredProjectReferences(projectId);
    await Promise.all(refs.map((reference) => deleteStoredProjectReference(reference.id)));
  } catch (error) {
    setStatus(t("project_reference_error", error.message));
  }

  if (wasActiveProject) {
    selectedProjectId = projectId;
    selectedFolderId = "all";
    selectedDraftIndex = -1;
    clearProjectTransientState();
    await clearWorkingSession({ projectId });
    resetAssistantForProject(project.name);
    loadActiveProjectReferences();
  } else {
    await clearWorkingSession({ projectId });
  }

  scheduleWorkspaceRender({ projectLabels: true, mountedTextDisk: true, menuState: true });
  saveDeskState();
  playSystemSound("trash");
  setStatus(t("disk_erased", projectName));
  updateMenuState();
}

function deleteAppDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(indexedDbName);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error("deleteDatabase failed"));
    request.onblocked = () => reject(new Error("deleteDatabase blocked"));
  });
}

async function resetSystemStorage() {
  const result = await showSystemModal(t("reset_system_confirm"), "confirm");
  if (result !== "yes") return;

  setStatus(t("reset_system_progress"));
  try {
    try {
      localStorage.clear();
    } catch (error) {
      console.warn("Failed to clear localStorage during system reset.", error);
    }
    try {
      sessionStorage.clear();
    } catch (error) {
      console.warn("Failed to clear sessionStorage during system reset.", error);
    }
    await deleteAppDatabase();
    location.reload();
  } catch (error) {
    console.error("Failed to reset system storage.", error);
    setStatus(t("reset_system_failed"));
    await showSystemModal(t("reset_system_failed"), "alert");
  }
}

function moveSelectedProjectToTrash() {
  const project = getSelectedProject();
  if (!project) return;

  const isActiveProject = project.id === activeProjectId && isProjectMounted;
  let fallbackProject = null;

  if (isActiveProject) {
    fallbackProject = projects.find((item) => item.id !== project.id && !item.archived)
      || projects.find((item) => item.id !== project.id)
      || null;

    if (!fallbackProject) {
      fallbackProject = createProjectRecord(nextAvailableProjectName(getDefaultProjectName()));
      projects.push(fallbackProject);
    }

    fallbackProject.archived = false;
    parkConversationInProject(project.id);
  }

  trashItems.unshift({
    projectId: isActiveProject ? fallbackProject.id : activeProjectId,
    title: project.name,
    body: `Project Hard Disk: ${project.name}`,
    originalPath: t("project_disk"),
    originalType: "project",
    originalData: project,
  });

  const index = projects.indexOf(project);
  if (index !== -1) projects.splice(index, 1);

  if (isActiveProject) {
    isProjectMounted = true;
    activeProjectId = fallbackProject.id;
    selectedProjectId = fallbackProject.id;
    selectedFolderId = "all";
    clearProjectTransientState();
    selectedScrapId = getProjectScraps()[0]?.id || null;
    if (selectedScrapId) selectedScrapIds.add(selectedScrapId);
    selectedProjectCdItemId = getProjectCdItems(fallbackProject.id)[0]?.id || null;
    if (selectedProjectCdItemId) selectedProjectCdItemIds.add(selectedProjectCdItemId);
    lastClipScrapId = selectedScrapId;
    if (startupProjectId === project.id) startupProjectId = fallbackProject.id;
    closeProjectScopedWindows();
    resetAssistantForProject(fallbackProject.name);
    loadActiveProjectReferences();
  } else {
    selectedProjectId = activeProjectId;
    if (startupProjectId === project.id) startupProjectId = activeProjectId;
  }

  scheduleWorkspaceRender({ projectLabels: true, menuState: true });
  saveDeskState();
  playSystemSound("trash");
  setStatus(t("project_moved_trash", project.name));
}

function renameSelectedProject() {
  const project = getSelectedProject();
  const name = projectDiskNameInput.value.trim();
  if (!project || !name) return;
  if (getProjectNameConflict(name, project.id)) {
    setStatus(t("project_name_taken", name));
    projectDiskNameInput.focus();
    projectDiskNameInput.select();
    return;
  }

  isPreparingProjectDisk = false;
  project.name = name;
  project.updatedAt = new Date().toISOString();
  renderProjectDisks();
  saveDeskState();
  setStatus(t("project_renamed", project.name));
}
