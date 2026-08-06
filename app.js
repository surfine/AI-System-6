const {
  contextBudgetConfig,
  defaultAppVersionInfo,
  defaultWindowViewModes,
  docToolConfig,
  flowConfig,
  longTaskControlSelectors,
  memoryCardPairs,
  projectConfig,
  storageConfig,
  windowManagementConfig,
} = window.AISystem6Config || {};

if (!defaultAppVersionInfo) {
  throw new Error("app/core/config.js must load before app.js");
}

const {
  maxCuratedContextItems,
  maxReferenceChunks,
  maxContextChars,
  maxContextItemChars,
  maxAttachedContextChars,
  maxPipelineReferenceChunks,
  maxPipelineContextChars,
  contextCharsPerToken,
  reservedOutputTokens,
  reservedSafetyTokens,
  ragBudgetShare,
} = contextBudgetConfig;
const {
  docMapMinSelectionChars,
  docMapMinDocumentChars,
  dictionaryMaxSelectionChars,
  defaultOutlineSection,
} = docToolConfig;
const {
  storageVersion,
  indexedDbName,
  indexedDbVersion,
  referenceStoreName,
  keyvalStoreName,
  projectsStoreName,
  scrapsStoreName,
  trashStoreName,
  chatFoldersStoreName,
  chatFilesStoreName,
} = storageConfig;
const {
  defaultProjectName,
  displayNameRewrites,
} = projectConfig;

// The name a fresh disk is born with follows the interface language; the frozen
// config value is the pre-translation fallback.
function getDefaultProjectName() {
  const localized = typeof t === "function" ? String(t("default_project_name") || "").trim() : "";
  return localized || defaultProjectName;
}
const {
  stepOrder: flowStepOrder,
} = flowConfig;
const {
  tileableWindowNames: tileableWindowNameValues,
  resizableWindowNames: resizableWindowNameValues,
  assistantSidecarWindowNames: assistantSidecarWindowNameValues,
} = windowManagementConfig;
const tileableWindowNames = new Set(tileableWindowNameValues);
const resizableWindowNames = new Set(resizableWindowNameValues);
const assistantSidecarWindowNames = new Set(assistantSidecarWindowNameValues);

const {
  form,
  bootScreenEl,
  bootMessageEl,
  bootProgressFillEl,
  bootStartupDiskEl,
  bootProjectDiskEl,
  bootLocalModelEl,
  promptInput,
  composeToolsToggleButton,
  composeToolsMenuEl,
  messagesEl,
  clioScrollLatestButton,
  composerKeyHintEl,
  statusEl,
  assistantMeterButton,
  localProviderEl,
  endpointInput,
  localApiTokenInput,
  connectLocalModelButton,
  localConnectionStatusEl,
  localAuthStatusEl,
  localCorsStatusEl,
  localBrowserPermissionStatusEl,
  modelInput,
  setupLocalModelButton,
  findModelsButton,
  modelPickerStatusEl,
  modelStatePanelEl,
  modelStateNextEl,
  searchProviderInput,
  importerModeInput,
  ocrEngineInput,
  importerStatusEl,
  contextLengthInput,
  contextRamStatusEl,
  loadModelButton,
  loadModelStatusEl,
  rememberInput,
  clearButton,
  clipSelectionButton,
  retryButton,
  composerSubmitButton,
  clockEl,
  filesInput,
  filesSelectionEl,
  indexFilesButton,
  ragStatusEl,
  mountedTextDiskEl,
  textDiskCountEl,
  textDiskGridEl,
  currentProjectLabelEl,
  desktopProjectCdEl,
  projectSwitcherButton,
  projectSwitcherLabelEl,
  projectSwitcherPopoverEl,
  startupSettingsModal,
  startupModeInputs,
  startupOpenOptionInputs,
  startupSelectedItemsLabelEl,
  spineFileFloppyButtonEl,
  spineBurnProjectCdButtonEl,
  writingToolsPanelEl,
  writingToolsShadeToggleEl,
  assistantProjectStatusEl,
  activeProjectLabelEl,
  selectedProjectLabelEl,
  documentsProjectLabelEl,
  scrapbookProjectLabelEl,
  trashProjectLabelEl,
  projectDiskCountEl,
  projectDiskGridEl,
  projectDiskNameInput,
  newProjectDiskButton,
  projectDiskUpButton,
  projectDiskPathEl,
  embeddingModelInput,
  scrapTitleDisplay,
  scrapTagsEl,
  scrapStackSelect,
  scrapBodyInput,
  scrapSourceInfoEl,
  toggleScrapTranslationButton,
  insertScrapButton,
  deleteScrapButton,
  openScrapSourceButton,
  scrapSelectionCountEl,
  sendScrapsToQuestionButton,
  outlineScrapsButton,
  scrapbookDocMapButton,
  scrapbookAskForm,
  scrapbookQuestionInput,
  downloadScrapsBilingualButton,
  scrapListEl,
  scrapCountEl,
  trashListEl,
  trashCountEl,
  restoreTrashButton,
  emptyTrashButton,
  projectCdCountEl,
  projectCdGridEl,
  downloadProjectCdButton,
  printProjectCdPdfButton,
  clearProjectCdButton,
  pageSetupInputs,
  importFilesButton,
  importFilesSelectionEl,
  importStatusEl,
  importPreviewEl,
  importDocumentsButton,
  projectBackupFileButton,
  projectBackupSelectionEl,
  projectBackupPreviewEl,
  importProjectBackupButton,
  modalScrim,
  documentsCountEl,
  documentsFolderLabelEl,
  documentIconGridEl,
  documentsUpButton,
  chatFileTitleEl,
  chatFileMetaEl,
  chatFileBodyEl,
  openChatFileButton,
  insertChatFileButton,
  chatFileDocMapButton,
  downloadChatMarkdownButton,
  trashChatFileButton,
  newFolderNameInput,
  newFolderButton,
  saveChatTitleEl,
  saveChatForm,
  chatFileNameInput,
  chatFolderNameInput,
  saveChatHintEl,
  folderSuggestionsEl,
  teachTextForm,
  teachTextTitleEl,
  teachTextStatusEl,
  teachTextTabsEl,
  teachTextNameInput,
  teachTextFolderInput,
  teachTextLabelSelect,
  teachTextBodyInput,
  teachTextBoundaryEl,
  teachTextSeeAsChartButton,
  teachTextModeStateEl,
  teachTextSourceCountEl,
  teachTextSelectionStateEl,
  teachTextExportStateEl,
  teachTextPreviewEl,
  teachTextImageInput,
  teachTextAttachmentsCountEl,
  teachTextAttachmentDocumentEl,
  teachTextAttachmentsListEl,
  teachTextTogglePreviewButton,
  teachTextSideAskButton,
  teachTextTranslateButton,
  teachTextDocMapButton,
  teachTextClipSelectionButton,
  teachTextSaveCopyButton,
  teachTextDownloadMarkdownButton,
  teachTextDownloadBilingualButton,
  styleSheetCountEl,
  styleSheetResultsEl,
  reviewStatusTitleEl,
  reviewDeskBodyInput,
  reviewDeskPreviewEl,
  reviewDeskEmptyNoteEl,
  reviewDeskSplitterEl,
  reviewSectionSelectEl,
  reviewSectionMetaEl,
  reviewSectionPreviousButton,
  reviewSectionNextButton,
  styleSectionSelectEl,
  styleSectionMetaEl,
  styleSectionPreviousButton,
  styleSectionNextButton,
  findPathForm,
  findPathQueryInput,
  findPathLimitInput,
  findPathResultsEl,
  findPathProviderEl,
  findPathCountEl,
  synthesizeFindPathButton,
  findPathSummaryEl,
  findFileForm,
  findFileQueryInput,
  findFileResultsEl,
  findFileCountEl,
  findFileScopeEl,
  copyFindPathButton,
  insertFindPathButton,
  notePadTextInput,
  notePadPrevButton,
  notePadNextButton,
  notePadPageLabelEl,
  notePadSendTeachTextButton,
  notePadSendScrapbookButton,
  notePadSendAssistantButton,
  clipboardTextInput,
  clipboardMetaEl,
  clipboardInsertButton,
  clipboardClearButton,
  clipboardTranslateButton,
  clipboardTranslationPanel,
  clipboardTranslationTextInput,
  clipboardTranslationTeachTextButton,
  clipboardTranslationScrapbookButton,
  clipboardTranslationAssistantButton,
  clipboardDocMapButton,
  calculatorDisplay,
  calculatorKeys,
  writingBellTimeEl,
  writingBellModeEl,
  writingBellPresetsEl,
  writingBellStartButton,
  writingBellPauseButton,
  writingBellResetButton,
  writingBellStatusEl,
  memoryCardsBoardEl,
  memoryCardsMovesEl,
  memoryCardsTimeEl,
  memoryCardsStatusEl,
  puzzleBoardEl,
  puzzleMovesEl,
  puzzleStatusEl,
  characterMapEl,
  readerTitleEl,
  readerUrlInput,
  readerWorkspaceEl,
  readerTabsEl,
  readerSplitHandleEl,
  readerFetchButton,
  readerClipButton,
  readerClipTranslateButton,
  readerDocMapButton,
  readerOpenClioStageButton,
  readerSendManuscriptButton,
  readerFindSourcesButton,
  readerAskForm,
  readerQuestionInput,
  readerContentEl,
  readerStatusEl,
  readerUrlDisplayEl,
  dictationRecordButton,
  dictationStopButton,
  dictationCleanButton,
  dictationClearButton,
  dictationSendButton,
  dictationRawInput,
  dictationCleanedInput,
  dictationStatusEl,
  dictationIntentTargetEl,
  translationPadSourceInput,
  translationPadResultInput,
  translationPadStatusEl,
  translationPadTargetEl,
  translationPadClearButton,
  translationPadTranslateButton,
  translationPadSendButton,
  questionSheetBodyInput,
  questionSheetPreviewEl,
  questionCountEl,
  questionManuscriptTitleEl,
  outlineNotesEl,
  outlineContentEl,
  outlinePreviewEl,
  outlineStatusEl,
  outlinePipelineLabelSelect,
  draftListEl,
  draftSectionSelectEl,
  draftCountEl,
  draftPipelineLabelSelect,
  draftSectionLabelEl,
  draftTitleInput,
  draftBodyInput,
  draftPreviewEl,
  claimSectionSelectEl,
  claimSectionMetaEl,
  claimSectionPreviousButton,
  claimSectionNextButton,
  claimResultsEl,
  rebuildFlowProjectEl,
  rebuildFlowSourceMetaEl,
  rebuildFlowSourceInput,
  rebuildFlowStatusEl,
  rebuildFlowProgressBarEl,
  rebuildFlowStepsEl,
  docMapCountEl,
  docMapTabsEl,
  docMapTreeEl,
  docMapFitViewButton,
  docMapFocusRootButton,
  docMapZoomOutButton,
  docMapZoomInButton,
  docMapCommandMenu,
  docMapCommandSummary,
  docMapSendQuestionButton,
  docMapAskHkrrButton,
  docMapInsertOutlineButton,
  docMapSaveButton,
  docMapPrintPdfButton,
  docMapAskForm,
  docMapQuestionInput,
  docMapDropZoneEl,
  clioStageViewportEl,
  clioStageImportFilesButton,
  clioStageFileInput,
  clioStageAskForm,
  clioStageQuestionInput,
  dictionaryTermEl,
  dictionarySourceEl,
  dictionaryForm,
  dictionaryQueryInput,
  dictionaryResultEl,
  dictionaryRecentEl,
  systemHelpQueryInput,
  systemHelpCategoriesEl,
  systemHelpListEl,
  systemHelpDetailEl,
  systemHelpCountEl,
  modernFontsInput,
  liquidGlassInput,
  soundEffectsInput,
  menuClockInput,
  controlStripInput,
  docMapLayoutToggleButton,
  docMapLayoutButtons,
  performanceMeterInput,
  showResetSystemMenuInput,
  infoProjectNameEl,
  infoProjectCreatedEl,
  infoProjectModifiedEl,
  infoFileCountEl,
  infoScrapCountEl,
  infoRefCountEl,
  infoWordCountEl,
  exportProjectDiskButton,
  systemModal,
  systemModalMessage,
  systemModalCancel,
  systemModalNo,
  systemModalYes,
  meterSpeedEl,
  meterTokensEl,
  meterElapsedEl,
  meterStopEl,
  aboutModelEl,
  aboutVersionEl,
  statusClockTimeEl,
  statusClockDateEl,
  statusModelEl,
  statusModelStateEl,
  statusCurrentTaskEl,
  statusVersionEl,
  statusProjectEl,
  statusTextDiskEl,
  statusContextEl,
  statusModeEl,
  notificationCenterButton,
  notificationCenterCountEl,
  notificationCenterSummaryEl,
  notificationCenterListEl,
  attachedClipsShelfEl,
  attachedClipsToolbarEl,
  attachScrapButton,
  fileInfoNameEl,
  fileInfoKindEl,
  fileInfoSizeEl,
  fileInfoLocationEl,
  fileInfoFolderEl,
  fileInfoSourceEl,
  fileInfoContextEl,
  fileInfoCreatedEl,
  fileInfoModifiedEl,
  fileInfoCommentsEl,
  fileInfoStationeryEl,
  infoFinderObjectsBlockEl,
  fileInfoIconEl,
  fileInfoDownloadMarkdownButton,
  printDirectorySourceEl,
  printDirectoryMetaEl,
  printDirectoryPreviewEl,
  printDirectoryDownloadButton,
} = getElements();

document.body.dataset.appReady = "booting";
try {
  if (localStorage.getItem("ai-system-6-liquid-glass") === "true") {
    document.body.classList.add("use-liquid-glass", "use-modern-fonts");
    window.AISystem6LiquidGlassOverlay?.setEnabled(true);
  }
} catch (error) {
  console.warn("Could not read cached appearance preference.", error);
}
let appVersionInfo = { ...defaultAppVersionInfo };
if (rememberInput) rememberInput.checked = true;

const conversation = [];
let activeChatFileId = null;
let compressedConversationMemory = {
  text: "",
  sourceMessages: 0,
  updatedAt: "",
}
const systemNotifications = [];
let unreadSystemNotifications = 0;
const activeLongTaskDetails = new Map();

// File Info elements

let fileInfoItem = null;

// View Modes state
const windowViewModes = { ...defaultWindowViewModes };
let writingToolsViewMode = "icon";
let systemFinderPath = "";
const finderContainerWindowNames = ["finder", "helpFolder", "applications", "disk"];
const viewWindowNames = [...finderContainerWindowNames, "projects", "documents", "imageManager"];
const printableDirectoryWindowNames = new Set([
  ...finderContainerWindowNames,
  "projects",
  "documents",
  "textDisk",
  "projectCd",
  "trash",
]);

function staticFinderBuildDate() {
  const match = String(appVersionInfo.build || "").match(/^(\d{4})(\d{2})(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z` : "";
}

function withStaticFinderMetadata(items, location) {
  const buildDate = staticFinderBuildDate();
  return items.map((item) => ({
    virtual: true,
    canDuplicate: false,
    canTrash: false,
    canOpen: item.canOpen !== false,
    sizeLabel: item.sizeLabel || t("built_in"),
    createdAt: item.createdAt || buildDate,
    updatedAt: item.updatedAt || buildDate,
    version: item.version || appVersionInfo.version,
    location,
    ...item,
  }));
}

function getSystemFolderItems() {
  return withStaticFinderMetadata([
    { name: t("ai_prompts_folder"), iconId: "folder", icon: "folder-icon", action: "open-system-folder-path:ai-prompts", kind: t("folder_kind") },
    { name: "System", iconId: "systemFile", icon: "doc-icon", action: "open-system-file-system", kind: t("system_component"), canOpen: false },
    { name: "Finder", iconId: "finderApp", icon: "app-icon", action: "open-system-file-finder", kind: t("application"), canOpen: false },
    { name: "MultiFinder", iconId: "multiFinderApp", icon: "app-icon", action: "open-system-file-multifinder", kind: t("application"), canOpen: false },
    { name: "DA Handler", iconId: "daHandler", icon: "doc-icon", action: "open-system-file-da-handler", kind: t("system_component"), canOpen: false },
    { name: t("chooser"), iconId: "chooser", icon: "panel-icon", action: "open-chooser", kind: t("system_component") },
    { name: t("control_panel"), iconId: "controlPanel", icon: "panel-icon", action: "open-control", kind: t("system_component") },
    { name: t("system_status"), iconId: "systemStatus", icon: "panel-icon", action: "open-system-status", kind: t("system_component") },
    { name: t("context_panel"), iconId: "contextPanel", icon: "panel-icon", action: "open-context-panel", kind: t("system_component") },
  ], t("system_folder"));
}

// The System Folder is a real directory tree, not a flat list behind a hidden
// mode flag. Every subfolder declares its own parent and folder name so the
// shared Finder path bar, the Back control, and Get Info all read the same
// current directory the user actually walked into.
const systemFolderPathDefinitions = new Map([
  ["ai-prompts", {
    // The only System Folder directory with a localized name; the folders below
    // it are English product names in both languages.
    labelKey: "ai_prompts_folder",
    parentPath: "",
    folders: [
      { path: "writing-tools", name: "Writing Tools" },
      { path: "writing-route", name: "Writing Route" },
      { path: "source-apps", name: "Source Apps" },
      { path: "other-apps", name: "Other Apps" },
      { path: "cliotalk", name: "ClioTalk" },
      { path: "boundaries", name: "System Boundaries" },
    ],
  }],
  ["writing-tools", { label: "Writing Tools", parentPath: "ai-prompts", promptCategory: "Writing Tools" }],
  ["writing-route", { label: "Writing Route", parentPath: "ai-prompts", promptCategory: "Writing Route" }],
  ["source-apps", { label: "Source Apps", parentPath: "ai-prompts", promptCategory: "Source Apps" }],
  ["other-apps", { label: "Other Apps", parentPath: "ai-prompts", promptCategory: "Other Apps" }],
  ["cliotalk", { label: "ClioTalk", parentPath: "ai-prompts", promptCategory: "ClioTalk" }],
  ["boundaries", { label: "System Boundaries", parentPath: "ai-prompts", promptCategory: "System Boundaries" }],
]);

function getSystemFolderPathDefinition(path = systemFinderPath) {
  return systemFolderPathDefinitions.get(path) || null;
}

function systemFolderPathLabel(path) {
  const definition = systemFolderPathDefinitions.get(path);
  if (!definition) return "";
  return definition.labelKey ? t(definition.labelKey) : definition.label;
}

function systemFolderPathTrail(path = systemFinderPath) {
  const trail = [];
  const seen = new Set();
  let current = path;
  while (current && systemFolderPathDefinitions.has(current) && !seen.has(current)) {
    seen.add(current);
    trail.unshift({ path: current, label: systemFolderPathLabel(current) });
    current = systemFolderPathDefinitions.get(current).parentPath;
  }
  return trail;
}

function systemFolderCurrentLabel(path = systemFinderPath) {
  return systemFolderPathLabel(path) || t("system_folder");
}

function systemFolderLocationPath(path = systemFinderPath) {
  return ["System Folder", ...systemFolderPathTrail(path).map((entry) => entry.label)].join("/");
}

// One entry point for every System Folder directory change, so the contents,
// the window title, and the shared path bar can never disagree about where the
// user is.
function navigateSystemFolderPath(path = "") {
  systemFinderPath = systemFolderPathDefinitions.has(path) ? path : "";
  selectedStaticFinderAction = "";
  renderStaticFinderWindow("finder");
  if (typeof renderFinderNavigationBar === "function") renderFinderNavigationBar("finder");
}

function getSystemPromptFinderItems() {
  const definition = getSystemFolderPathDefinition();
  if (!definition) return getSystemFolderItems();
  const location = systemFolderLocationPath();

  if (definition.folders) {
    return withStaticFinderMetadata(definition.folders.map((folder) => ({
      name: folder.name,
      iconId: "folder",
      icon: "folder-icon",
      action: `open-system-folder-path:${folder.path}`,
      kind: t("folder_kind"),
    })), location);
  }

  return withStaticFinderMetadata(
    (window.AISystem6PromptFiles || [])
      .filter((prompt) => prompt.category === definition.promptCategory)
      .map((prompt) => ({
        name: prompt.name,
        iconId: "document",
        icon: "doc-icon",
        action: `open-system-prompt-file:${prompt.id}`,
        kind: prompt.editable === "project"
          ? t("system_component")
          : (currentLanguage === "zh" ? "系统只读" : "System read-only"),
      })),
    location
  );
}

function getHelpFolderItems() {
  return withStaticFinderMetadata([
    { name: t("start_here"), iconId: "document", icon: "doc-icon", action: "open-guide", kind: t("system_component"), workspaceCapability: workspaceCapabilityStudio },
    { name: t("system_help"), iconId: "systemHelp", icon: "doc-icon", action: "open-system-help", kind: t("system_component") },
    { name: t("read_me"), iconId: "document", icon: "doc-icon", action: "open-read-me", kind: t("system_component") },
    { name: t("flow_readme"), iconId: "document", icon: "doc-icon", action: "open-flow-readme", kind: t("system_component"), workspaceCapability: workspaceCapabilityStudio },
    { name: t("memory_readme"), iconId: "document", icon: "doc-icon", action: "open-memory-readme", kind: t("system_component") },
    { name: t("concepts_docmap"), iconId: "docMap", icon: "doc-icon", action: "open-system-concepts-docmap", kind: t("system_component") },
    { name: t("concepts_clio_stage"), iconId: "clioStage", icon: "doc-icon", action: "open-system-concepts-clio-stage", kind: t("system_component") },
  ], t("help_folder"));
}

function getApplicationsItems() {
  return withStaticFinderMetadata([
    { name: t("assistant_label"), iconId: "assistant", icon: "app-icon", action: "open-assistant", type: "application", kind: t("application") },
    { name: t("writing_studio"), iconId: "writingStudio", icon: "writing-studio-icon", action: "open-writing-studio", type: "application", kind: t("application"), workspaceProfiles: [workspaceProfileDesktop] },
    { name: t("quick_draft_label"), iconId: "quickDraft", icon: "teachtext-icon", action: "open-quick-draft", type: "application", kind: t("application"), workspaceCapability: workspaceCapabilityStudio },
    { name: t("teachtext_label"), iconId: "teachText", icon: "teachtext-icon", action: "open-teachtext", type: "application", kind: t("application") },
    { name: t("reader_label"), iconId: "reader", icon: "reader-desk-icon", action: "open-reader", type: "application", kind: t("application") },
    { name: t("time_machine_label"), iconId: "timeMachine", icon: "tools-icon", action: "open-time-machine", type: "application", kind: t("application") },
    { name: t("searcher_label"), iconId: "searcher", icon: "tools-icon", action: "open-find-path", type: "application", kind: t("application") },
    { name: t("docmap_label"), iconId: "docMap", icon: "folder-icon", action: "open-docmap", type: "application", kind: t("application") },
    { name: t("scrapbook_label"), iconId: "scrapbook", icon: "folder-icon", action: "open-scrapbook", type: "application", kind: t("application") },
    { name: t("bureaucracy_meme_label"), iconId: "bureaucracyMeme", icon: "tools-icon", action: "open-bureaucracy-meme", type: "application", kind: t("application") },
    { name: t("endfield_terminal_label"), iconId: "endfieldTerminal", icon: "tools-icon", action: "open-endfield-terminal", type: "application", kind: t("application") },
    { name: t("clio_stage_label"), iconId: "clioStage", icon: "tools-icon", action: "open-clio-stage", type: "application", kind: t("application") },
    { name: t("clio_chart_label"), iconId: "clioChart", icon: "tools-icon", action: "open-clio-chart", type: "application", kind: t("application") },
    { name: t("liquid_cover_label"), iconId: "liquidCover", icon: "tools-icon", action: "open-liquid-cover", type: "application", kind: t("application") },
    { name: t("cmf_studio_label"), iconId: "cmfStudio", icon: "tools-icon", action: "open-cmf-studio", type: "application", kind: t("application") },
    { name: t("soundscape_label"), iconId: "soundscape", icon: "tools-icon", action: "open-soundscape", type: "application", kind: t("application") },
    { name: t("rebuild_article"), iconId: "rebuildArticle", icon: "tools-icon", action: "open-rebuild-flow", type: "application", kind: t("application"), workspaceCapability: workspaceCapabilityStudio },
    { name: t("guide_play_demo"), iconId: "writingDemo", icon: "teachtext-icon", action: "play-writing-demo", type: "application", kind: t("application"), workspaceCapability: workspaceCapabilityStudio },
    ...(typeof getDropletItems === "function" ? getDropletItems() : []),
  ], t("applications"));
}

function getStartupDiskItems() {
  const fileFloppyMounted = typeof getMountedTextDiskChunks === "function"
    && getMountedTextDiskChunks().length > 0;
  return withStaticFinderMetadata([
    { name: t("system_folder"), iconId: "systemFolder", icon: "system-icon", action: "open-finder", kind: t("folder_kind") },
    { name: t("help_folder"), iconId: "helpFolder", icon: "folder-icon", action: "open-help-folder", kind: t("folder_kind") },
    { name: t("applications"), iconId: "applications", icon: "applications-icon", action: "open-applications", kind: t("folder_kind") },
    { name: t("project_disk"), iconId: "projectDisk", icon: "project-disk-icon", action: "open-project-disks", type: "volume", kind: t("project_disk"), virtual: false },
    { name: t("project_cd"), iconId: "projectDisc", icon: "hard-disk-icon", action: "open-project-cd", type: "volume", kind: t("project_cd"), virtual: false, workspaceCapability: workspaceCapabilityStudio },
    {
      name: t(fileFloppyMounted ? "mounted_text_disk" : "mount_text_disk"),
      iconId: "fileFloppy",
      icon: "text-disk-icon",
      action: fileFloppyMounted ? "open-text-disk" : "open-rag",
      type: "volume",
      kind: t("mounted_text_disk"),
      virtual: !fileFloppyMounted,
      workspaceCapability: workspaceCapabilityStudio,
    },
    { name: t("trash"), iconId: "trash", icon: "trash-icon", action: "open-trash", kind: t("folder_kind") },
  ], t("startup_disk"));
}

function getStaticFinderItems(winName) {
  if (winName === "helpFolder") return filterWorkspaceItems(getHelpFolderItems());
  if (winName === "applications") return filterWorkspaceItems(getApplicationsItems());
  if (winName === "disk") return filterWorkspaceItems(getStartupDiskItems());
  return filterWorkspaceItems(getSystemPromptFinderItems());
}

function renderFinderItemIcon(item) {
  return renderSystemIcon(item.iconId || item.icon, {
    size: item.iconBase === "icon" ? "desktop" : "mini"});
}

function dropletDropAttributes(item) {
  return item.dropletAction
    ? ` data-drop-target="droplet" data-droplet-action="${escapeHtml(item.dropletAction)}" data-balloon-help="balloon_droplet"`
    : "";
}

function splitApplicationsSections(items = []) {
  const apps = [];
  const droplets = [];
  items.forEach((item) => (item.dropletAction ? droplets : apps).push(item));
  return droplets.length ? { apps, droplets } : null;
}

function getSelectedStaticFinderItem(winName = selectedStaticFinderWindowName) {
  if (!winName || winName !== selectedStaticFinderWindowName || !selectedStaticFinderAction) return null;
  return getStaticFinderItems(winName).find((item) => item.action === selectedStaticFinderAction) || null;
}

function isStartupApplicationItem(item) {
  return item?.type === "application";
}

function getApplicationItemByAction(action) {
  if (!action) return null;
  return getApplicationsItems().find((item) => item.action === action && isStartupApplicationItem(item)) || null;
}

function getSelectedDesktopApplicationItem() {
  const action = selectedDesktopIconEl?.dataset.action;
  return getApplicationItemByAction(action);
}

function setStartupSelectedApplication(item) {
  if (!isStartupApplicationItem(item)) return;
  startupSelectedApplicationAction = item.action;
  startupSelectedApplicationName = item.name;
  syncStartupSelectedItemsLabel();
}

function selectDesktopIcon(icon) {
  if (!icon) return;
  if (selectedDesktopIconEl && selectedDesktopIconEl !== icon) {
    selectedDesktopIconEl.classList.remove("is-selected");
  }
  selectedDesktopIconEl = icon;
  selectedDesktopIconEl.classList.add("is-selected");
  selectedDesktopIconEl.focus({ preventScroll: true });
}

function openDesktopIcon(icon) {
  if (!icon || icon.disabled || icon.classList.contains("is-disabled")) return;
  selectDesktopIcon(icon);
  if (icon.dataset.open) {
    openWindow(icon.dataset.open);
    return;
  }
  if (icon.dataset.action) {
    handleAction(icon.dataset.action);
  }
}

function finderMarqueeContext(event) {
  // A finger drag means scroll, not select: the marquee calls preventDefault on
  // pointerdown, which on a phone freezes the pane you were trying to scroll.
  // Mouse and pen keep the rubber band.
  if (event.pointerType === "touch") return null;
  if (event.button || event.target.closest("button,input,textarea,select,label,a,summary,.title-bar,.menu-bar,.resize-handle,.grow-box")) return null;
  const pane = event.target.closest(".window-pane");
  if (pane?.querySelector(".finder-item")) return {
    win: pane.closest(".window")?.dataset.window || "",
    items: [...pane.querySelectorAll(".finder-item")].filter((item) => item.offsetParent),
  };
  if (event.target.closest(".window")) return null;
  return event.target.closest(".desktop")
    ? { win: "desktop", items: [...document.querySelectorAll(".icon-column .desktop-icon:not(.is-hidden)")].filter((item) => item.offsetParent) }
    : null;
}

function commitFinderMarqueeSelection(context, hits) {
  context.items.forEach((item) => item.classList.remove("is-selected"));
  const primary = hits[0] || null;
  if (context.win === "desktop") {
    hits.forEach((item) => item.classList.add("is-selected"));
    selectedDesktopIconEl = primary;
    updateMenuState();
    return;
  }
  if (!primary) {
    selectedStaticFinderWindowName = selectedStaticFinderAction = "";
    if (context.win === "projectDisk" || context.win === "documents") {
      selectedProjectRootItemId = selectedChatFileId = selectedDocumentFolderId = null;
      selectedDocumentItemKeys.clear();
      selectedDocumentAnchorKey = "";
    }
    if (context.win === "projectCd") {
      selectedProjectCdItemId = null;
      selectedProjectCdItemIds.clear();
    }
    if (context.win === "textDisk") {
      selectedMountedFile = null;
      selectedMountedFileNames.clear();
    }
    updateMenuState();
    return;
  }
  const data = primary.dataset;
  if (context.win === "projectCd" && data.projectCdItemId) {
    selectedProjectCdItemIds.clear();
    hits.forEach((item) => {
      if (item.dataset.projectCdItemId) selectedProjectCdItemIds.add(item.dataset.projectCdItemId);
    });
    selectedProjectCdItemId = data.projectCdItemId;
  } else if ((context.win === "projectDisk" || context.win === "documents") && data.documentItemId) {
    selectedProjectRootItemId = null;
    selectedDocumentItemKeys.clear();
    hits.forEach((item) => {
      if (item.dataset.documentItemType && item.dataset.documentItemId) {
        selectedDocumentItemKeys.add(documentSelectionKey(item.dataset.documentItemType, item.dataset.documentItemId));
      }
    });
    selectedDocumentAnchorKey = data.documentItemType && data.documentItemId
      ? documentSelectionKey(data.documentItemType, data.documentItemId)
      : "";
    if (data.documentItemType === "folder") {
      selectedDocumentFolderId = data.documentItemId;
      selectedChatFileId = null;
    } else {
      selectedChatFileId = data.documentItemId;
      selectedDocumentFolderId = null;
    }
  } else if (context.win === "textDisk" && data.mountedFile) {
    selectedMountedFileNames.clear();
    hits.forEach((item) => {
      if (item.dataset.mountedFile) selectedMountedFileNames.add(item.dataset.mountedFile);
    });
    selectedMountedFile = data.mountedFile;
  } else if (data.projectRootId) {
    selectedProjectRootItemId = data.projectRootId;
    selectedChatFileId = selectedDocumentFolderId = null;
  } else if (data.documentItemId) {
    selectedProjectRootItemId = null;
    if (data.documentItemType === "folder") {
      selectedDocumentFolderId = data.documentItemId;
      selectedChatFileId = null;
    } else {
      selectedChatFileId = data.documentItemId;
      selectedDocumentFolderId = null;
    }
  } else if (data.mountedFile) {
    selectedMountedFile = data.mountedFile;
  } else {
    selectedStaticFinderWindowName = context.win;
    selectedStaticFinderAction = data.staticFinderAction || data.action || "";
  }
  hits.forEach((item) => item.classList.add("is-selected"));
  updateMenuState();
}

function startFinderMarquee(event) {
  const context = finderMarqueeContext(event);
  if (!context?.items.length) return;
  event.preventDefault();
  const box = document.createElement("div");
  box.className = "finder-marquee";
  box.hidden = true;
  document.body.append(box);
  const startX = event.clientX;
  const startY = event.clientY;
  let hits = [];
  const move = (moveEvent) => {
    const x = moveEvent.clientX;
    const y = moveEvent.clientY;
    const left = Math.min(startX, x);
    const top = Math.min(startY, y);
    const right = Math.max(startX, x);
    const bottom = Math.max(startY, y);
    box.hidden = Math.abs(x - startX) + Math.abs(y - startY) <= 4;
    Object.assign(box.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
    hits = box.hidden ? [] : context.items.filter((item) => {
      const rect = item.getBoundingClientRect();
      return left <= rect.right && right >= rect.left && top <= rect.bottom && bottom >= rect.top;
    });
    context.items.forEach((item) => item.classList.toggle("is-selected", hits.includes(item)));
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    box.remove();
    commitFinderMarqueeSelection(context, hits);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
}

function selectStaticFinderItem(winName, action) {
  const item = getStaticFinderItems(winName).find((entry) => entry.action === action);
  if (!item) return;
  const alreadySelected = selectedStaticFinderWindowName === winName && selectedStaticFinderAction === action;
  selectedStaticFinderWindowName = winName;
  selectedStaticFinderAction = action;
  if (isStartupApplicationItem(item)) {
    setStartupSelectedApplication(item);
    saveDeskState();
  }
  if (!alreadySelected) renderStaticFinderWindow(winName);
  updateMenuState();
}

function syncStartupSelectedItemsLabel() {
  if (!startupSelectedItemsLabelEl) return;
  const item = getStartupSelectedApplicationItem();
  startupSelectedItemsLabelEl.textContent = item?.name || startupSelectedApplicationName || t("startup_selected_items");
}

function getStartupSelectedApplicationItem() {
  return [...getApplicationsItems(), ...getStartupDiskItems()]
    .find((item) => item.type === "application" && item.action === startupSelectedApplicationAction) || null;
}

function renderStaticFinderWindow(winName) {
  const win = getWindow(winName);
  if (!win) return;

  const grid = win.querySelector(".window-pane");
  const mode = normalizeFinderViewMode(windowViewModes[winName]);
  windowViewModes[winName] = mode;
  const items = sortFinderItemsForView(getStaticFinderItems(winName), mode);
  const selected = getSelectedStaticFinderItem(winName);
  const count = win.querySelector(".details-bar > span:first-child");
  if (count) count.textContent = t("items_count", items.length);
  if (winName === "finder") {
    // Browsing into a folder renames the window it reuses, the way a System 6
    // Finder window does; the root name comes back from the translation table.
    const title = win.querySelector(":scope > .title-bar h2");
    if (title) title.textContent = systemFolderCurrentLabel();
  }

  updateFinderViewButtons(win, mode);

  setFinderViewClasses(grid, mode);
  const sectioned = winName === "applications" ? splitApplicationsSections(items) : null;
  const apps = sectioned ? sectioned.apps : items;
  const droplets = sectioned ? sectioned.droplets : [];
  const dropletSectionLabel = sectioned
    ? `<div class="finder-section-label">${escapeHtml(t("droplets_section"))}</div>`
    : "";
  const dropletListLabel = sectioned
    ? `<div class="finder-list-group">${escapeHtml(t("droplets_section"))}</div>`
    : "";
  if (isFinderListMode(mode)) {
    const renderListRow = (item) => `
      <button class="finder-list-row${selected?.action === item.action ? " is-selected" : ""}" data-static-finder-window="${escapeHtml(winName)}" data-static-finder-action="${escapeHtml(item.action)}"${dropletDropAttributes(item)}>
        <span class="finder-list-name-cell">${renderFinderItemIcon(item)}<span>${escapeHtml(item.name)}</span></span>
        <span>${escapeHtml(item.kind)}</span>
        <span>${escapeHtml(item.sizeLabel || "--")}</span>
        <span>${escapeHtml(item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "--")}</span>
      </button>
    `;
    grid.innerHTML = `
      <div class="finder-list-header">
        <span>${escapeHtml(t("file_name"))}</span>
        <span>${escapeHtml(t("kind"))}</span>
        <span>${escapeHtml(t("size"))}</span>
        <span>${escapeHtml(t("modified"))}</span>
      </div>
      ${apps.map(renderListRow).join("")}
      ${dropletListLabel}
      ${droplets.map(renderListRow).join("")}
    `;
    return;
  }

  const renderIconItem = (item) => `
    <button class="finder-item${selected?.action === item.action ? " is-selected" : ""}" data-static-finder-window="${escapeHtml(winName)}" data-static-finder-action="${escapeHtml(item.action)}"${dropletDropAttributes(item)}>
      ${renderFinderItemIcon(item)}
      <span>${escapeHtml(item.name)}</span>
    </button>
  `;
  grid.innerHTML = [
    ...apps.map(renderIconItem),
    dropletSectionLabel,
    ...droplets.map(renderIconItem),
  ].filter(Boolean).join("");
}

function toggleViewMode(winName, mode) {
  windowViewModes[winName] = normalizeFinderViewMode(mode);

  const win = getWindow(winName === "projects" ? "projects" : winName);
  updateFinderViewButtons(win, windowViewModes[winName]);

  if (winName === "documents") renderDocuments();
  else if (winName === "projects") renderProjectDisks();
  else if (winName === "imageManager") renderTeachTextImageAttachments();
  else if (finderContainerWindowNames.includes(winName)) renderStaticFinderWindow(winName);
  updateMenuState();
}

function writingToolsAreViewTarget() {
  const active = document.querySelector(".window.is-active:not(.is-hidden)");
  if (viewWindowNames.includes(active?.dataset.window)) return false;
  const panel = document.querySelector(".writing-spine-panel");
  return !!panel && !panel.classList.contains("is-hidden");
}

function applyWritingToolsViewMode() {
  const panel = document.querySelector(".writing-spine-panel");
  if (!panel) return;
  panel.classList.toggle("is-small-icons", writingToolsViewMode === "small-icon");
  panel.classList.toggle("is-icon-view", writingToolsViewMode !== "small-icon");
}

function setActiveViewMode(mode) {
  const active = document.querySelector(".window.is-active:not(.is-hidden)");
  let targetName = viewWindowNames.includes(active?.dataset.window) ? active.dataset.window : null;

  if (!targetName && writingToolsAreViewTarget()) {
    const normalized = normalizeFinderViewMode(mode);
    if (!["small-icon", "icon"].includes(normalized)) {
      setStatus(t("fixed_order_view"));
      updateMenuState();
      return;
    }
    writingToolsViewMode = normalized;
    applyWritingToolsViewMode();
    scheduleWorkingSessionSave();
    updateMenuState();
    setStatus(t("view_mode_active", t(getFinderViewModeLabelKey(normalized))));
    return;
  }

  if (!targetName) {
    const visible = viewWindowNames
      .map((name) => getWindow(name))
      .find((win) => win && !win.classList.contains("is-hidden"));
    targetName = visible?.dataset.window || "finder";
  }

  if (getWindow(targetName)?.classList.contains("is-hidden")) {
    openWindow(targetName);
  }

  if (finderContainerWindowNames.includes(targetName)) {
    finderContainerWindowNames.forEach((name) => toggleViewMode(name, mode));
    setStatus(t("view_mode_active", t(getFinderViewModeLabelKey(mode))));
    return;
  }

  toggleViewMode(targetName, mode);
  setStatus(t("view_mode_active", t(getFinderViewModeLabelKey(mode))));
}

function renderFinder() {
  renderStaticFinderWindow("finder");
}
const attachedClipIds = new Set();
const ragChunks = [];
const mountedTextDisk = {
  files: [],
  fileBodies: {},
  fileDiagnostics: {},
  fileSources: {},
  chunks: 0,
  projectId: null,
}
let fileDiskImportController = null;
const projects = [];
const projectReferences = [];
const scraps = [];
let lastRetrievedContextItems = [];
let lastContextBudget = null;
const excludedContextKeys = new Set();
const trashItems = [];
const chatFolders = [];
const chatFiles = [];
const temporaryVideoDocMaps = new Map();
const findPathResults = [];
const findFileResults = [];
const projectCdItems = [];
const importCandidates = [];
let selectedImportFiles = [];
let previewedProjectBackup = null;
let selectedProjectBackupFile = null;
const importableFileAccept = ".txt,.text,.srt,.rtf,.md,.mdx,.markdown,.mdown,.mkd,.mkdn,.csv,.tsv,.json,.js,.ts,.htm,.html,.xhtml,.webarchive,.css,.xml,.log,.pdf,.docx,.pages,.numbers,.key,.epub,.pptx,.xlsx,.bmp,.jpg,.jpeg,.png,.webp,.heic,.heif,.aac,.aif,.aiff,.amr,.caf,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav,.webm,audio/*";
let lastAssistantText = "";
let lastSourceAnswer = "";
let selectedScrapId = null;
const selectedScrapIds = new Set();
let selectedFolderId = "all";
let selectedChatFileId = null;
let selectedDocumentFolderId = null;
const selectedDocumentItemKeys = new Set();
let selectedDocumentAnchorKey = "";
let selectedMountedFile = null;
const selectedMountedFileNames = new Set();
let selectedFindPathIndex = null;
let selectedFindFileIndex = null;
let selectedProjectCdItemId = null;
const selectedProjectCdItemIds = new Set();
let activeProjectId = null;
let selectedProjectId = null;
let selectedProjectRootItemId = null;
let startupProjectId = null;
let startupEnvironment = "finder";
let startupOpenMode = "cliotalk";
let startupSelectedApplicationAction = "open-assistant";
let startupSelectedApplicationName = "";
let startupOpenedWindowNames = [];
let runtimeEnvironment = "finder";
let sideAskEnabled = false;
let sideAskAnchorAppId = "teachText";
let sideAskAnchorOwnerAppId = "teachText";
let selectedDesktopIconEl = null;
let selectedStaticFinderWindowName = "";
let selectedStaticFinderAction = "";
let selectedProjectReferenceId = null;
let isPreparingProjectDisk = false;
let isProjectMounted = true;
let activeTextFileId = null;
let teachTextFileLabel = "";
let teachTextWorkflowState = "";
let teachTextDocumentRole = "manuscript";
let saveDialogMode = "chat";
let pendingTeachTextSaveOptions = null;
let lastClipScrapId = null;
let showingScrapTranslation = false;
let scrapTranslationViewMode = "original";
let selectedScrapStack = "all";
let topZ = 10;
let cascadeOffset = 0;
let waitTimer = null;
// The app follows the host system language: a Chinese system defaults to
// Simplified Chinese, any other system defaults to English (international
// first-run). Saved settings override this later; the Apple menu can switch.
var currentLanguage = String(navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
let writerMode = false;
let activeAbortController = null;
let lastUserText = "";
let claimCitationContextItems = [];
let currentReaderPage = null;
let currentReaderClipCount = 0;
let guideSeen = false;
let multiFinderSwitcherHintSeen = false;
let calculatorExpression = "0";
let writingBellMode = "work";
let writingBellDurations = { work: 25 * 60, break: 5 * 60 };
let writingBellRemaining = writingBellDurations.work;
let writingBellRunning = false;
let writingBellEndsAt = 0;
let writingBellTimer = null;
let puzzleTiles = [];
let puzzleMoves = 0;
let pageSetupSettings = { paper: "a4", orientation: "portrait", density: "manuscript" };
let saveDeskStatePromise = Promise.resolve();
let settingsSaveTimer = null;
let teachTextTabSaveTimer = null;
let lastModelMetrics = null;
let activeChatModelIdentifier = "";
let lastMigrationNote = "";
let modelCatalog = [];
let embeddingModelCatalog = [];
let contextMaxByModel = {};
let contextLengthByModel = {};
let contextLengthUserOverrides = {};
let localLmStudioConnectionEnabled = false;
let localModelState = {
  server: false,
  models: false,
  selected: false,
  loaded: false,
  ready: false,
  running: false,
  task: "",
  next: "model_next_start_lm",
}

let cloudConfig = null;
let cloudRuntimeApiKey = "";
let publicSharedCloudAvailable = false;
const CLOUD_STORAGE_KEY = "ai-system6-cloud-config";
const CLOUD_SESSION_KEY = "ai-system6-cloud-api-key";

function isPublicCloudCredentialMode() {
  return document.documentElement.dataset.deploymentProfile === "public";
}

function cloudCredentialReady(config = cloudConfig) {
  return !!(config?.credentialId || cloudRuntimeApiKey || (
    isPublicCloudCredentialMode()
    && publicSharedCloudAvailable
    && config?.provider
  ));
}

function cloudCredentialMode(config = cloudConfig) {
  if (isPublicCloudCredentialMode()) {
    if (cloudRuntimeApiKey) return "byok";
    if (publicSharedCloudAvailable && config?.provider) return "shared";
  }
  return config?.credentialId ? "stored" : "none";
}

function setPublicSharedCloudAvailable(value = false) {
  publicSharedCloudAvailable = value === true;
  if (!publicSharedCloudAvailable && cloudConfig?.credentialMode === "shared") {
    cloudConfig.active = false;
  }
  if (typeof window.syncCloudCredentialUi === "function") window.syncCloudCredentialUi();
  if (typeof applyCloudActiveState === "function") applyCloudActiveState();
}

window.addEventListener?.("ai-system6:capabilities", (event) => {
  const capabilities = /** @type {CustomEvent} */ (event).detail;
  setPublicSharedCloudAvailable(capabilities?.features?.cloud_shared === true);
});

function setCloudRuntimeApiKey(value = "") {
  cloudRuntimeApiKey = String(value || "").trim();
}

function cloudCredentialTransportFields(style = "model") {
  if (cloudConfig?.credentialId && !isPublicCloudCredentialMode()) {
    return style === "status"
      ? { credential_id: cloudConfig.credentialId }
      : { _cloud_credential_id: cloudConfig.credentialId };
  }
  if (!cloudRuntimeApiKey) return {};
  return style === "status"
    ? { api_key: cloudRuntimeApiKey }
    : { _cloud_api_key: cloudRuntimeApiKey };
}

function loadCloudConfig() {
  let persistedConfig = null;
  let legacyApiKey = "";

  try {
    const raw = localStorage.getItem(CLOUD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        persistedConfig = { ...parsed };
        legacyApiKey = typeof persistedConfig.apiKey === "string"
          ? persistedConfig.apiKey.trim()
          : "";
        delete persistedConfig.apiKey;
      }
    }
  } catch {
    persistedConfig = null;
  }

  let sessionApiKey = "";
  try {
    sessionApiKey = (sessionStorage.getItem(CLOUD_SESSION_KEY) || "").trim();
    sessionStorage.removeItem(CLOUD_SESSION_KEY);
  } catch {
    sessionApiKey = "";
  }

  setCloudRuntimeApiKey(sessionApiKey || legacyApiKey);
  if (!persistedConfig && cloudRuntimeApiKey) persistedConfig = {};
  if (
    persistedConfig
    && persistedConfig.active
    && !cloudCredentialReady(persistedConfig)
    && persistedConfig.credentialMode !== "shared"
  ) {
    persistedConfig.active = false;
  }

  // Remove credentials written by older builds. Only a local-service
  // credential ID and non-secret provider preferences remain in browser state.
  try {
    if (persistedConfig && Object.keys(persistedConfig).length) {
      const safeConfig = { ...persistedConfig };
      delete safeConfig.apiKey;
      localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(safeConfig));
    } else {
      localStorage.removeItem(CLOUD_STORAGE_KEY);
    }
  } catch {
    try { localStorage.removeItem(CLOUD_STORAGE_KEY); } catch {}
  }

  cloudConfig = persistedConfig;
  return cloudConfig;
}

function saveCloudConfig() {
  try {
    if (cloudConfig) {
      const persistedConfig = { ...cloudConfig };
      delete persistedConfig.apiKey;
      if (Object.keys(persistedConfig).length) {
        localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(persistedConfig));
      } else {
        localStorage.removeItem(CLOUD_STORAGE_KEY);
      }
    } else {
      localStorage.removeItem(CLOUD_STORAGE_KEY);
    }
  } catch {
    // Runtime cloud use can continue even when browser persistence is blocked.
  }

  try { sessionStorage.removeItem(CLOUD_SESSION_KEY); } catch {}
}

function getLocalModelRequestName() {
  if (typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.model) {
    return cloudConfig.model;
  }

  return activeChatModelIdentifier || modelInput.value.trim() || "local-model";
}

function getLocalModelDisplayName() {
  if (typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.model) {
    return cloudConfig.model;
  }

  return modelInput.value.trim() || t("local_lm_studio");
}

let dictationIntentDestination = "assistant";
let dictationInputTarget = null;
let lastEditableRange = null;
let teachTextPreviewState = {
  scrollTop: 0,
  selectionStart: 0,
  selectionEnd: 0,
}
let teachTextLastExportKind = "";
let teachTextLastExportAt = "";
let teachTextLastExportSnapshot = "";
let reviewDeskDirty = false;
let reviewDeskScrollSyncing = false;
const activeLongTasks = new Set();
let notePadPages = [""];
let notePadPageIndex = 0;
let clipboardText = "";
let clipboardSource = "";
let clipboardUpdatedAt = "";
let clipboardTranslationText = "";
let clipboardTranslationSourceText = "";
let clipboardTranslationLanguage = "";
let clipboardTranslationCreatedAt = "";
let clipboardTranslationModel = "";
let translationPadSourceText = "";
let translationPadTranslatedText = "";
let translationPadTargetLanguage = "";
let translationPadSourceLabel = "";
let translationPadInputTarget = null;
let translationPadSelectionRange = null;
let currentDocMap = null;
let selectedDocMapNodeId = null;
let currentDictionaryResult = null;
let dictionaryRecentResults = [];
let selectedSystemHelpEntryId = null;
let selectedSystemHelpCategory = "all";
let lastTextTarget = null;
let styleSheetFindings = [];
const translationCache = new Map();
let styleSheetSourceOffset = 0;
function projectDisplayName(projectOrName) {
  const value = typeof projectOrName === "string" ? projectOrName : projectOrName?.name;
  return displayNameRewrites.reduce((name, rule) => name.replace(rule.pattern, rule.replacement), String(value || ""));
}

var translations = window.AISystem6Data?.translations || {};
let systemDictionaryEntries = window.AISystem6DictionaryData?.systemDictionaryEntries || [];
let systemDictionaryLoadPromise = null;

function syncSystemDictionaryData() {
  systemDictionaryEntries = window.AISystem6DictionaryData?.systemDictionaryEntries || systemDictionaryEntries || [];
  return systemDictionaryEntries;
}

async function ensureSystemDictionaryData() {
  if (window.AISystem6DictionaryData?.systemDictionaryEntries) return syncSystemDictionaryData();
  systemDictionaryLoadPromise ||= loadClassicScriptOnce("app/data/system-dictionary.js")
    .then(syncSystemDictionaryData)
    .catch((error) => {
      systemDictionaryLoadPromise = null;
      throw error;
    });
  return systemDictionaryLoadPromise;
}

function t(key, ...args) {
  const tables = translations || window.AISystem6Data?.translations || {};
  const table = tables[currentLanguage || "en"] || tables.zh || tables.en || {};
  const value = table[key] ?? tables.en?.[key] ?? key;
  return typeof value === "function" ? value(...args) : value;
}

function updateFilePickerSelectionLabel(files, labelEl) {
  if (!labelEl) return;
  const selectedFiles = Array.from(files || []);
  const emptyKey = labelEl.dataset.filePickerEmpty || "no_files_selected";
  labelEl.textContent = selectedFiles.length === 0
    ? t(emptyKey)
    : selectedFiles.length === 1
      ? t("selected_file", selectedFiles[0].name)
      : t("selected_files_count", selectedFiles.length);
  labelEl.title = selectedFiles.map((file) => file.name).join("\n");
}

function updateFilePickerLabel(input, labelEl) {
  if (!input || !labelEl) return;
  updateFilePickerSelectionLabel(input.files, labelEl);
}

function updateFilePickerLabels() {
  updateFilePickerLabel(filesInput, filesSelectionEl);
  updateFilePickerSelectionLabel(selectedImportFiles, importFilesSelectionEl);
  updateFilePickerSelectionLabel(selectedProjectBackupFile ? [selectedProjectBackupFile] : [], projectBackupSelectionEl);
}

function openTransientFilePicker({ accept = "", multiple = false, onSelect } = {}) {
  const input = document.createElement("input");
  input.type = "file";
  input.hidden = true;
  if (accept) input.accept = accept;
  input.multiple = !!multiple;
  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    input.remove();
    if (files.length) onSelect?.(files);
  }, { once: true });
  input.addEventListener("cancel", () => input.remove(), { once: true });
  document.body.append(input);
  input.click();
}

function syncDocMapDropZoneLabel(message = t("docmap_drop_files")) {
  if (docMapDropZoneEl) docMapDropZoneEl.dataset.dropLabel = message;
}

function applyModernFonts(options = {}) {
  const useModern = modernFontsInput.checked;
  document.body.classList.toggle("use-modern-fonts", useModern || !!liquidGlassInput?.checked);
  if (options.persist !== false) saveDeskState();
}

function applyLiquidGlass(options = {}) {
  const useLiquidGlass = !!liquidGlassInput?.checked;
  document.body.classList.toggle("use-liquid-glass", useLiquidGlass);
  document.body.classList.toggle("use-modern-fonts", useLiquidGlass || modernFontsInput.checked);
  // The modern-font choice only affects the classic UI: Liquid Glass already
  // forces the modern font, so the checkbox is meaningless while glass is on.
  // The checked value is preserved so leaving glass restores the old choice.
  if (modernFontsInput) modernFontsInput.disabled = useLiquidGlass;
  window.AISystem6LiquidGlassOverlay?.setEnabled(useLiquidGlass);
  updateAppearanceMenuLabel();
  try {
    localStorage.setItem("ai-system-6-liquid-glass", String(useLiquidGlass));
  } catch (error) {
    console.warn("Could not cache appearance preference.", error);
  }
  if (options.persist !== false) saveDeskState();
}

function toggleLiquidGlassAppearance() {
  if (!liquidGlassInput) return;
  liquidGlassInput.checked = !liquidGlassInput.checked;
  applyLiquidGlass();
}

function updateAppearanceMenuLabel() {
  const labelKey = liquidGlassInput?.checked ? "retro_interface" : "liquid_glass";
  document.querySelectorAll('[data-action="toggle-liquid-glass"]').forEach((button) => {
    button.textContent = t(labelKey);
    button.classList.remove("is-checked");
  });
}

function applyMenuClock(options = {}) {
  renderSystemClock();
  if (options.persist !== false) saveDeskState();
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage === "zh" ? "zh-Hans" : "en";
  if (typeof syncKeyboardShortcutLabels === "function") syncKeyboardShortcutLabels();
  window.refreshFinderContinuationIndicators?.();

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const value = t(el.dataset.i18n);
    const shortcut = el.dataset.shortcut;

    if (shortcut) {
      el.innerHTML = `${escapeHtml(value)} <span class="shortcut">${escapeHtml(shortcut)}</span>`;
    } else if (value.includes("<")) {
      el.innerHTML = value;
    } else {
      el.textContent = value;
    }
  });
  if (typeof renderKeyCapsShortcuts === "function") renderKeyCapsShortcuts();

  document.querySelectorAll("[data-i18n-count]").forEach((el) => {
    const count = Number(el.dataset.i18nCountValue || 0);
    el.textContent = t(el.dataset.i18nCount, count);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  syncPromptPlaceholder();

  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });

  document.querySelectorAll("[data-i18n-drop-label]").forEach((el) => {
    el.dataset.dropLabel = t(el.dataset.i18nDropLabel);
  });

  if (typeof syncBalloonHelpLanguage === "function") syncBalloonHelpLanguage();
  if (typeof syncGuideWelcomeState === "function") syncGuideWelcomeState();

  document.querySelectorAll("[data-status-key]").forEach((el) => {
    el.textContent = t(el.dataset.statusKey);
  });

  setDictationDestination(dictationIntentDestination);
  // The ask-bar scope rows are rendered from live state, not data-i18n.
  refreshAskBars();
  syncCurrentNotePadPage();
  renderNotePadPage();
  updateTeachTextBoundaries();
  updateTeachTextTranslateButton();
  updateTeachTextBilingualExportButton();
  updateTeachTextDeskState();
  syncTeachTextLabelControl();
  syncTeachTextNameDisplay();
  syncWritingToolsShadeToggle();
  renderRebuildFlow();
  // System Help owns a sizeable lazy module. If it has already been opened,
  // refresh it for the new language; otherwise its first open renders it.
  window.renderSystemHelp?.();
  updateReaderTranslationClipButton();
  updateScrapTranslationControls(scraps.find((item) => item.id === selectedScrapId && isInActiveProject(item)));
  refreshMessageTranslationButtons();
  renderLocalModelState();
  if (typeof refreshCloudUsageDisplay === "function") refreshCloudUsageDisplay();
  if (typeof window.syncCloudCredentialUi === "function") window.syncCloudCredentialUi();
  renderWritingBell();
  renderAlarmClock();
  if (typeof refreshBureaucracyMemeLanguage === "function") refreshBureaucracyMemeLanguage();
  refreshWritingBellStatusLanguage();
  renderPuzzle();
  syncStartupSelectedItemsLabel();
  updateSearchProviderLabels();
  if (!getWindow("notificationCenter")?.classList.contains("is-hidden")) renderNotificationCenter();
  updateNotificationIndicator();
  updateMenuStatus();
  renderAboutMacintosh();
  updateAppearanceMenuLabel();

  document.querySelectorAll("[data-mode-label]").forEach((el) => {
    const value = writerMode ? t("desk_mode") : t("writer_mode");
    const shortcut = el.dataset.shortcut;
    el.innerHTML = shortcut
      ? `${escapeHtml(value)} <span class="shortcut">${escapeHtml(shortcut)}</span>`
      : escapeHtml(value);
  });

  [teachTextFolderInput, chatFolderNameInput].forEach((input) => {
    if (input.value === "General" || input.value === "通用") {
      input.value = t("default_folder");
    }
  });

  updateProjectLabels();
  renderProjectCd();
  // Re-render after the [data-i18n] sweep: it resets the Finder window title to
  // the root folder name, which is wrong while the user is inside a subfolder.
  finderContainerWindowNames.forEach((name) => renderStaticFinderWindow(name));
  if (typeof renderAllFinderNavigationBars === "function") renderAllFinderNavigationBars();
  updateFilePickerLabels();
  updateReviewDeskStats?.();
  if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
  renderClioTalkRunAssembly();
}

function syncPromptPlaceholder() {
  if (!promptInput) return;
  if (typeof clioTalkModelReady === "function" && !clioTalkModelReady()) {
    promptInput.placeholder = t("clio_model_required_placeholder");
    return;
  }
  if (typeof sideAskEnabled !== "undefined" && sideAskEnabled && typeof isMultiFinderMode === "function" && !isMultiFinderMode()) {
    promptInput.placeholder = t(
      sideAskAnchorAppId === "quickDraft"
        ? "quick_draft_cliotalk_placeholder"
        : "sideask_prompt_placeholder"
    );
    return;
  }
  const isCloudActive = typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.provider && cloudConfig.apiKey;
  promptInput.placeholder = isCloudActive ? t("prompt_placeholder_cloud") : t("prompt_placeholder");
}

let selectedDraftIndex = 0;

let speechRecognition = null;
let systemSelectControlSequence = 0;
const systemSelectTypeaheadState = new WeakMap();
let sharedControlBehaviorsInstalled = false;

window.markdownToSystemHtml = markdownToSystemHtml;
window.parseMarkdownDocument = parseMarkdownDocument;

const TRANSLATION_CHUNK_THRESHOLD = 5200;
const TRANSLATION_CHUNK_MAX_LENGTH = 3600;

function closeSystemSelectMenus(except = null, options = {}) {
  document.querySelectorAll(".select-wrap.is-system-select-open").forEach((wrap) => {
    if (wrap === except) return;
    wrap.classList.remove("is-system-select-open");
    const button = wrap.querySelector(":scope > .system-select-button");
    button?.setAttribute("aria-expanded", "false");
    if (options.focusButton && options.wrap === wrap) button?.focus();
  });
}

function systemSelectOptionText(select) {
  return select?.selectedOptions?.[0]?.textContent?.trim()
    || select?.options?.[select.selectedIndex]?.textContent?.trim()
    || "";
}

function systemSelectAccessibleName(select) {
  const labelledBy = (select?.getAttribute("aria-labelledby") || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim())
    .filter(Boolean)
    .join(" ");
  return select?.getAttribute("aria-label")
    || labelledBy
    || select?.closest("label")?.querySelector(":scope > span:not([aria-hidden='true'])")?.textContent?.trim()
    || select?.closest(".control-section")?.querySelector(":scope > h3")?.textContent?.trim()
    || select?.name
    || systemSelectOptionText(select);
}

function refreshSystemSelectControl(select) {
  const wrap = select?.closest(".select-wrap");
  const button = wrap?.querySelector(":scope > .system-select-button");
  const menu = wrap?.querySelector(":scope > .system-select-menu");
  if (!select || !wrap || !button || !menu) return;
  const hidden = select.hidden || select.closest("[hidden]");
  // The label goes in its own element rather than as bare text: the button is a
  // flex container, and text-overflow cannot truncate an anonymous flex item —
  // long model ids ran out under the dropdown arrow instead of ellipsing.
  let label = button.querySelector(":scope > .system-select-label");
  if (!label) {
    label = document.createElement("span");
    label.className = "system-select-label";
    button.replaceChildren(label);
  }
  label.textContent = systemSelectOptionText(select);
  button.disabled = select.disabled;
  button.setAttribute("aria-expanded", String(wrap.classList.contains("is-system-select-open")));
  const accessibleName = systemSelectAccessibleName(select);
  if (accessibleName) {
    button.setAttribute("aria-label", accessibleName);
    menu.setAttribute("aria-label", accessibleName);
  }
  button.title = select.title || select.getAttribute("aria-label") || "";
  button.classList.toggle("is-hidden", !!hidden);
  menu.classList.toggle("is-hidden", !!hidden);
  if (hidden || select.disabled) wrap.classList.remove("is-system-select-open");
}

function renderSystemSelectMenu(select) {
  const wrap = select?.closest(".select-wrap");
  const menu = wrap?.querySelector(":scope > .system-select-menu");
  if (!select || !menu) return;
  menu.replaceChildren();
  [...select.options].forEach((option, optionIndex) => {
    if (option.hidden || option.disabled) return;
    const item = document.createElement("button");
    item.type = "button";
    item.className = "system-select-option";
    item.textContent = option.textContent;
    item.setAttribute("aria-label", option.textContent.trim());
    item.disabled = option.disabled;
    item.dataset.optionIndex = String(optionIndex);
    item.id = `${menu.id}-option-${optionIndex}`;
    item.setAttribute("role", "option");
    const selected = option.value === select.value;
    item.classList.toggle("is-selected", selected);
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
    item.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeSystemSelectMenus();
      refreshSystemSelectControl(select);
      wrap?.querySelector(":scope > .system-select-button")?.focus();
    });
    menu.append(item);
  });
}

function systemSelectEnabledOptions(menu) {
  return [...menu.querySelectorAll(".system-select-option:not(:disabled)")];
}

function focusSystemSelectOption(menu, index) {
  const options = systemSelectEnabledOptions(menu);
  if (!options.length) return;
  const next = options[(index + options.length) % options.length];
  options.forEach((item) => { item.tabIndex = item === next ? 0 : -1; });
  next.focus();
}

function openSystemSelect(select, direction = 0) {
  const wrap = select?.closest(".select-wrap");
  const button = wrap?.querySelector(":scope > .system-select-button");
  const menu = wrap?.querySelector(":scope > .system-select-menu");
  if (!select || !wrap || !button || !menu || select.disabled || select.hidden) return;
  renderSystemSelectMenu(select);
  closeSystemSelectMenus(wrap);
  wrap.classList.add("is-system-select-open");
  button.setAttribute("aria-expanded", "true");
  const options = systemSelectEnabledOptions(menu);
  const selectedIndex = Math.max(0, options.findIndex((item) => item.classList.contains("is-selected")));
  const targetIndex = direction < 0 ? options.length - 1 : direction > 0 ? 0 : selectedIndex;
  queueMicrotask(() => focusSystemSelectOption(menu, targetIndex));
}

function handleSystemSelectTypeahead(menu, key) {
  if (key.length !== 1 || /\s/.test(key)) return false;
  const previous = systemSelectTypeaheadState.get(menu);
  const now = performance.now();
  const query = `${previous && now - previous.time < 650 ? previous.query : ""}${key}`.toLocaleLowerCase();
  systemSelectTypeaheadState.set(menu, { query, time: now });
  const options = systemSelectEnabledOptions(menu);
  const activeIndex = Math.max(-1, options.indexOf(document.activeElement));
  const ordered = [...options.slice(activeIndex + 1), ...options.slice(0, activeIndex + 1)];
  const match = ordered.find((item) => item.textContent.trim().toLocaleLowerCase().startsWith(query));
  if (!match) return true;
  options.forEach((item) => { item.tabIndex = item === match ? 0 : -1; });
  match.focus();
  return true;
}

function initSystemSelectControls() {
  document.querySelectorAll(".select-wrap > select").forEach((select) => {
    const wrap = select.closest(".select-wrap");
    if (!wrap || wrap.classList.contains("has-system-select")) return;
    wrap.classList.add("has-system-select");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "system-select-button";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");

    const menu = document.createElement("div");
    menu.className = "system-select-menu";
    menu.setAttribute("role", "listbox");
    const controlId = select.id || `system-select-${++systemSelectControlSequence}`;
    menu.id = `${controlId}-listbox`;
    button.setAttribute("aria-controls", menu.id);
    const accessibleName = systemSelectAccessibleName(select);
    if (accessibleName) {
      button.setAttribute("aria-label", accessibleName);
      menu.setAttribute("aria-label", accessibleName);
    }
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    select.insertAdjacentElement("afterend", button);
    button.insertAdjacentElement("afterend", menu);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (select.disabled || select.hidden) return;
      const willOpen = !wrap.classList.contains("is-system-select-open");
      if (willOpen) openSystemSelect(select);
      else {
        closeSystemSelectMenus();
        button.focus();
      }
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openSystemSelect(select, event.key === "ArrowUp" ? -1 : 1);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        openSystemSelect(select, event.key === "End" ? -1 : 1);
      }
    });
    menu.addEventListener("keydown", (event) => {
      const options = systemSelectEnabledOptions(menu);
      const current = Math.max(0, options.indexOf(document.activeElement));
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusSystemSelectOption(menu, current + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        focusSystemSelectOption(menu, current - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusSystemSelectOption(menu, 0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusSystemSelectOption(menu, options.length - 1);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        document.activeElement?.click();
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeSystemSelectMenus(null, { focusButton: true, wrap });
      } else if (event.key === "Tab") {
        closeSystemSelectMenus();
      } else if (handleSystemSelectTypeahead(menu, event.key)) {
        event.preventDefault();
      }
    });
    select.addEventListener("change", () => refreshSystemSelectControl(select));
    refreshSystemSelectControl(select);
  });
}

function refreshSystemSelectControls() {
  document.querySelectorAll(".select-wrap.has-system-select > select").forEach(refreshSystemSelectControl);
}

function setControlLoading(control, loading, loadingLabel = "") {
  if (!control) return;
  if (loading) {
    control.dataset.wasDisabled = String(control.disabled);
    control.dataset.loading = "true";
    control.dataset.loadingLabel = loadingLabel || "…";
    control.setAttribute("aria-busy", "true");
    control.disabled = true;
    return;
  }
  const wasDisabled = control.dataset.wasDisabled === "true";
  delete control.dataset.loading;
  delete control.dataset.loadingLabel;
  delete control.dataset.wasDisabled;
  control.removeAttribute("aria-busy");
  control.disabled = wasDisabled;
}

function syncRovingTabStops(tablist) {
  const tabs = [...tablist.querySelectorAll(':scope > [role="tab"]:not(:disabled):not([hidden])')];
  if (!tabs.length) return;
  const selected = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0];
  tabs.forEach((tab) => { tab.tabIndex = tab === selected ? 0 : -1; });
}

function initSharedControlBehaviors() {
  document.querySelectorAll('[role="tablist"]').forEach(syncRovingTabStops);
  if (sharedControlBehaviorsInstalled) return;
  sharedControlBehaviorsInstalled = true;
  document.addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"]');
    const tablist = tab?.closest('[role="tablist"]');
    if (tablist) queueMicrotask(() => syncRovingTabStops(tablist));
  });
  document.addEventListener("keydown", (event) => {
    const tab = event.target.closest('[role="tab"]');
    const tablist = tab?.closest('[role="tablist"]');
    if (!tablist) return;
    const tabs = [...tablist.querySelectorAll(':scope > [role="tab"]:not(:disabled):not([hidden])')];
    const current = tabs.indexOf(tab);
    if (current < 0) return;
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  });
}

function toggleMenuSubItem(item) {
  const isOpen = item.classList.contains("is-open");
  item.parentElement?.querySelectorAll(".menu-item-with-sub.is-open").forEach((sibling) => {
    if (sibling !== item) sibling.classList.remove("is-open");
  });
  item.classList.toggle("is-open", !isOpen);
}

function positionOpenMenu(menu) {
  const popover = menu.querySelector(":scope > .menu-popover");
  if (!popover) return;
  const margin = 4;
  const menuRect = menu.getBoundingClientRect();
  const popoverWidth = popover.getBoundingClientRect().width || popover.scrollWidth || 180;
  const maxLeft = Math.max(margin, window.innerWidth - popoverWidth - margin);
  const left = Math.min(Math.max(menuRect.left, margin), maxLeft);
  menu.style.setProperty("--menu-popover-left", `${Math.round(left)}px`);
}

async function importFilesToMountedTextDisk(files, options = {}) {
  const controller = options.controller;
  const statusEl = options.statusEl || ragStatusEl;
  const source = options.source || "fileFloppy";
  const importProjectId = activeProjectId;
  const embeddingBatchTimeoutMs = 25000;

  function setImportStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function assertImportProjectActive() {
    throwIfAborted(controller?.signal);
    if (!isProjectMounted || activeProjectId !== importProjectId) {
      throw fileDiskAbortError();
    }
  }

  function uniqueMountedFileName(name, usedNames) {
    const raw = String(name || t("untitled")).trim() || t("untitled");
    if (!usedNames.has(raw.toLowerCase())) {
      usedNames.add(raw.toLowerCase());
      return raw;
    }

    const match = raw.match(/^(.*?)(\.[^.]+)?$/);
    const stem = (match?.[1] || raw).trim() || t("untitled");
    const ext = match?.[2] || "";
    let index = 2;
    let candidate = `${stem} ${index}${ext}`;
    while (usedNames.has(candidate.toLowerCase())) {
      index += 1;
      candidate = `${stem} ${index}${ext}`;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
  }

  const chunks = [];
  const mountedFileNames = [];
  const mountedFileTexts = [];
  const nextFileBodies = {};
  const nextFileDiagnostics = {};
  const nextFileSources = {};
  const failures = [];
  if (mountedTextDisk.projectId && mountedTextDisk.projectId !== importProjectId) {
    ejectTextDisk({ silent: true });
  }
  const usedMountedNames = new Set(mountedTextDisk.files.map((name) => name.toLowerCase()));

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];
    assertImportProjectActive();
    setImportStatus(t("file_disk_reading_file", fileIndex + 1, files.length, file.name));

    try {
      const extracted = await extractFileText(file, { signal: controller?.signal });
      const text = extracted?.text || "";
      assertImportProjectActive();
      const mountedName = uniqueMountedFileName(file.name, usedMountedNames);
      const fileChunks = chunkText(text, mountedName);
      if (!fileChunks.length) {
        failures.push({ name: file.name, message: t("file_disk_warn_no_chunks") });
        continue;
      }

      mountedFileNames.push(mountedName);
      mountedFileTexts.push({ name: mountedName, text });
      nextFileBodies[mountedName] = text;
      nextFileDiagnostics[mountedName] = buildMountedFileDiagnostic(
        { name: mountedName, size: file.size },
        text,
        fileChunks
      );
      if (extracted?.videoTranscript?.sourceType === "video_transcript") {
        nextFileSources[mountedName] = {
          id: `${importProjectId || "project"}::${mountedName}`,
          type: "video_transcript",
          sourceName: mountedName,
          blocks: Array.isArray(extracted.videoTranscript.blocks) ? extracted.videoTranscript.blocks : [],
          paragraphs: Array.isArray(extracted.videoTranscript.paragraphs) ? extracted.videoTranscript.paragraphs : [],
        };
      }
      chunks.push(...fileChunks);
    } catch (error) {
      if (isAbortError(error)) throw error;
      failures.push({ name: file.name, message: error.message || String(error) });
    }
  }

  setImportStatus(t("file_disk_extraction_done", mountedFileNames.length, chunks.length, failures.length));
  if (statusEl && failures.length) statusEl.title = formatFileDiskFailureTitle(failures);

  if (!chunks.length) {
    setImportStatus(t("file_disk_mount_failed_all", failures.length || files.length));
    if (failures.length) {
      const summary = formatFileDiskFailureSummary(failures);
      if (summary) setImportStatus(`${statusEl?.textContent || ""} ${summary.replace(/\n/g, " ")}`.trim());
    }
    return { source, mountedFileNames, mountedFileTexts, embeddedChunks: [], failures, embeddingFailed: true };
  }

  setImportStatus(t("embedding_chunks", chunks.length));
  const batchSize = 16;
  const embeddedChunks = [];
  const isCloud = typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudConfig.apiKey;
  const selectedEmbeddingModel = embeddingModelInput?.value?.trim() || "";
  const hasEmbeddingModel = isCloud || !!selectedEmbeddingModel;
  let embeddingFailed = !hasEmbeddingModel;
  if (!isCloud && selectedEmbeddingModel) {
    setImportStatus(t("embedding_model_loading", selectedEmbeddingModel));
    try {
      if (!localLmStudioConnectionEnabled) throw new Error(t("local_connection_waiting"));
      await window.AISystem6LocalLMStudio.loadModel(selectedEmbeddingModel, {
        signal: controller?.signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      embeddingFailed = true;
      setImportStatus(t("keyword_indexed_chunks", chunks.length, mountedFileNames.length));
    }
  }

  for (let index = 0; index < chunks.length; index += batchSize) {
    assertImportProjectActive();
    const batch = chunks.slice(index, index + batchSize);
    try {
      let embeddings = [];
      if (hasEmbeddingModel) {
        const embeddingController = new AbortController();
        let embeddingTimedOut = false;
        const timeoutId = setTimeout(() => {
          embeddingTimedOut = true;
          embeddingController.abort();
        }, embeddingBatchTimeoutMs);
        const cancelEmbedding = () => embeddingController.abort();
        if (controller?.signal) {
          if (controller.signal.aborted) cancelEmbedding();
          else controller.signal.addEventListener("abort", cancelEmbedding, { once: true });
        }
        try {
          embeddings = await embedTexts(batch.map((chunk) => chunkRagEmbeddingText(chunk)), embeddingController.signal);
        } catch (error) {
          if (controller?.signal?.aborted) throw error;
          if (!embeddingTimedOut && !isAbortError(error)) throw error;
          throw new Error("Embedding request timed out.");
        } finally {
          clearTimeout(timeoutId);
          controller?.signal?.removeEventListener?.("abort", cancelEmbedding);
        }
      }
      assertImportProjectActive();
      batch.forEach((chunk, batchIndex) => {
        embeddedChunks.push({
          ...chunk,
          projectId: importProjectId,
          embedding: embeddings[batchIndex] || null,
        });
      });
    } catch (error) {
      if (isAbortError(error) && controller?.signal?.aborted) throw error;
      embeddingFailed = true;
      batch.forEach((chunk) => {
        embeddedChunks.push({
          ...chunk,
          projectId: importProjectId,
          embedding: null,
        });
      });
    }

    setImportStatus(t("embedding_progress", Math.min(index + batchSize, chunks.length), chunks.length));
  }

  assertImportProjectActive();
  removeMountedFileChunks(mountedFileNames, importProjectId);
  mountedTextDisk.projectId = importProjectId;
  Object.assign(mountedTextDisk.fileBodies, nextFileBodies);
  Object.assign(mountedTextDisk.fileDiagnostics, nextFileDiagnostics);
  Object.assign(mountedTextDisk.fileSources, nextFileSources);
  ragChunks.push(...embeddedChunks);
  const existingNames = new Set(mountedTextDisk.files);
  mountedFileNames.forEach((name) => {
    existingNames.add(name);
  });
  mountedTextDisk.files = [...existingNames];
  mountedTextDisk.chunks = getMountedTextDiskChunks().length;
  selectedMountedFile = selectedMountedFile || mountedFileNames[0] || null;
  renderMountedTextDisk();
  saveDeskState();

  return { source, mountedFileNames, mountedFileTexts, embeddedChunks, failures, embeddingFailed };
}

async function insertFilesIntoFileFloppy(files, { source = "fileFloppy", openAfter = "rag" } = {}) {
  if (fileDiskImportController) {
    fileDiskImportController.abort();
    ragStatusEl.textContent = t("file_disk_canceling");
    return null;
  }

  if (!getActiveProject()) {
    ragStatusEl.textContent = t("no_project_mounted");
    openWindow("projects");
    return null;
  }

  const selectedFiles = Array.from(files || []).filter(Boolean);
  if (!selectedFiles.length) {
    ragStatusEl.textContent = t("choose_files");
    return null;
  }

  const controller = new AbortController();
  fileDiskImportController = controller;
  indexFilesButton.disabled = false;
  indexFilesButton.textContent = t("cancel");
  ragStatusEl.textContent = t("reading_files");
  ragStatusEl.title = "";

  try {
    const { mountedFileNames, embeddedChunks, failures, embeddingFailed } = await importFilesToMountedTextDisk(selectedFiles, {
      controller,
      statusEl: ragStatusEl,
      source,
    });
    filesInput.value = "";
    updateFilePickerLabels();
    const baseStatus = embeddingFailed
      ? t("keyword_indexed_chunks", embeddedChunks.length, mountedFileNames.length)
      : t("indexed_chunks", embeddedChunks.length, mountedFileNames.length);
    ragStatusEl.textContent = failures.length
      ? `${baseStatus} ${t("file_disk_failed_count", failures.length)} ${formatFileDiskFailureSummary(failures).replace(/\n/g, " ")}`
      : baseStatus;
    if (failures.length) ragStatusEl.title = formatFileDiskFailureTitle(failures);
    if (openAfter) openWindow(openAfter);
    return { mountedFileNames, embeddedChunks, failures, embeddingFailed };
  } catch (error) {
    ragStatusEl.textContent = isAbortError(error) ? t("file_disk_canceled") : error.message;
    return null;
  } finally {
    fileDiskImportController = null;
    indexFilesButton.disabled = false;
    renderMountedTextDisk();
  }
}

function insertFileFloppyFromWindow() {
  openTransientFilePicker({
    accept: importableFileAccept,
    multiple: true,
    onSelect(files) {
      insertFilesIntoFileFloppy(files, { source: "fileFloppy", openAfter: "textDisk" });
    },
  });
}

async function importDocMapDroppedFiles(files) {
  const droppedFiles = Array.from(files || []).filter(Boolean);
  if (!droppedFiles.length) return;

  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  const controller = new AbortController();
  docMapDropZoneEl?.classList.add("is-importing");
  syncDocMapDropZoneLabel(t("docmap_drop_importing"));
  pushSystemNotification(t("docmap_drop_importing"), {
    state: "running",
    windowName: "docMap",
    actionLabel: t("open"),
  });

  try {
    const result = await importFilesToMountedTextDisk(droppedFiles, {
      controller,
      statusEl: ragStatusEl,
      source: "docMapDrop",
    });
    const { mountedFileNames, embeddedChunks, failures, embeddingFailed } = result;
    const baseStatus = embeddingFailed
      ? t("keyword_indexed_chunks", embeddedChunks.length, mountedFileNames.length)
      : t("indexed_chunks", embeddedChunks.length, mountedFileNames.length);
    const failureSummary = failures.length ? formatFileDiskFailureSummary(failures).replace(/\n/g, " ") : "";
    const statusMessage = failures.length
      ? `${baseStatus} ${t("file_disk_failed_count", failures.length)} ${failureSummary}`.trim()
      : baseStatus;
    ragStatusEl.textContent = statusMessage;
    if (failures.length) ragStatusEl.title = formatFileDiskFailureTitle(failures);

    if (!mountedFileNames.length) {
      pushSystemNotification(ragStatusEl.textContent || t("file_disk_mount_failed_all", failures.length || droppedFiles.length), {
        state: "failed",
        windowName: "textDisk",
        actionLabel: t("open"),
      });
      return;
    }

    const docMapMessage = t("docmap_drop_inserted_floppy", mountedFileNames.length, embeddedChunks.length);
    setStatus(docMapMessage);
    pushSystemNotification(
      failures.length ? `${docMapMessage} ${t("file_disk_failed_count", failures.length)} ${failureSummary}`.trim() : docMapMessage,
      { state: failures.length ? "failed" : "running", windowName: "docMap", actionLabel: t("open") }
    );
    openWindow("docMap");
    await makeDocMapFromMountedFileDrop(mountedFileNames);
  } catch (error) {
    const message = isAbortError(error) ? t("file_disk_canceled") : error.message;
    ragStatusEl.textContent = message;
    setStatus(message);
    pushSystemNotification(message, { state: "failed", windowName: "docMap", actionLabel: t("open") });
  } finally {
    docMapDropZoneEl?.classList.remove("is-importing", "is-dragging");
    syncDocMapDropZoneLabel();
    renderMountedTextDisk();
  }
}

function mountedFileNamesFromDrop(event) {
  const rawData = event?.dataTransfer?.getData("application/json") || event?.dataTransfer?.getData("text/plain");
  if (!rawData) return [];
  try {
    const data = JSON.parse(rawData);
    if (data?.type !== "mounted-file") return [];
    const names = Array.isArray(data.ids) && data.ids.length ? data.ids : [data.id];
    return names
      .map((name) => String(name || "").trim())
      .filter((name) => name && mountedTextDisk.files.includes(name));
  } catch {
    return [];
  }
}

function dropHasFilesOrMountedFiles(event) {
  const types = Array.from(event?.dataTransfer?.types || []);
  return types.includes("Files") || types.includes("application/json") || types.includes("text/plain");
}

function dropEffectForFilesOrMountedFiles(event) {
  const types = Array.from(event?.dataTransfer?.types || []);
  return types.includes("application/json") || types.includes("text/plain") ? "move" : "copy";
}

async function makeDocMapFromMountedFileDrop(fileNames = []) {
  const names = Array.from(new Set(fileNames)).filter((name) => mountedTextDisk.files.includes(name));
  if (!names.length) return false;
  selectedMountedFileNames.clear();
  names.forEach((name) => selectedMountedFileNames.add(name));
  selectedMountedFile = names[0] || null;
  renderMountedTextDisk();
  openWindow("docMap");
  const videoDocMapSource = names.length === 1 ? docMapSourceFromVideoTranscript(names[0]) : null;
  await makeDocMapFromCurrentSource(videoDocMapSource || docMapSourceFromFileFloppy());
  return true;
}

async function importClioStageDroppedFiles(files) {
  const droppedFiles = Array.from(files || []).filter(Boolean);
  if (!droppedFiles.length) return;

  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  const controller = new AbortController();
  clioStageViewportEl?.classList.add("is-importing");
  setStatus(t("clio_stage_drop_importing"));
  pushSystemNotification(t("clio_stage_drop_importing"), {
    state: "running",
    windowName: "clioStage",
    actionLabel: t("open"),
  });

  try {
    const result = await importFilesToMountedTextDisk(droppedFiles, {
      controller,
      statusEl: ragStatusEl,
      source: "clioStageDrop",
    });
    const { mountedFileNames, mountedFileTexts, embeddedChunks, failures, embeddingFailed } = result;
    const baseStatus = embeddingFailed
      ? t("keyword_indexed_chunks", embeddedChunks.length, mountedFileNames.length)
      : t("indexed_chunks", embeddedChunks.length, mountedFileNames.length);
    const failureSummary = failures.length ? formatFileDiskFailureSummary(failures).replace(/\n/g, " ") : "";
    ragStatusEl.textContent = failures.length
      ? `${baseStatus} ${t("file_disk_failed_count", failures.length)} ${failureSummary}`.trim()
      : baseStatus;
    if (failures.length) ragStatusEl.title = formatFileDiskFailureTitle(failures);

    if (!mountedFileTexts.length) {
      const message = ragStatusEl.textContent || t("file_disk_mount_failed_all", failures.length || droppedFiles.length);
      setStatus(message);
      pushSystemNotification(message, { state: "failed", windowName: "textDisk", actionLabel: t("open") });
      return;
    }

    const slidesMessage = t("clio_stage_drop_inserted_floppy", mountedFileNames.length, embeddedChunks.length);
    setStatus(slidesMessage);
    pushSystemNotification(
      failures.length ? `${slidesMessage} ${t("file_disk_failed_count", failures.length)} ${failureSummary}`.trim() : slidesMessage,
      { state: failures.length ? "failed" : "done", windowName: "clioStage", actionLabel: t("open") }
    );
    openWindow("clioStage");
    await ensureSlidesExportModule();
    await generateMarpMarkdownAndOpenClioStage({
      title: mountedFileNames.length === 1 ? mountedFileNames[0] : t("mounted_text_disk"),
      markdown: joinDocMapSourceBlocks(mountedFileTexts),
      folder: preferredFolderName(),
    });
  } catch (error) {
    const message = isAbortError(error) ? t("file_disk_canceled") : error.message;
    ragStatusEl.textContent = message;
    setStatus(message);
    pushSystemNotification(message, { state: "failed", windowName: "clioStage", actionLabel: t("open") });
  } finally {
    clioStageViewportEl?.classList.remove("is-importing", "is-dragging");
    renderMountedTextDisk();
  }
}

wireAppEvents();
boot();
