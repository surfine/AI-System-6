// Centralized DOM handle lookup for app.js.

function getElements() {
  const form = document.querySelector("#chat-form");
  const bootScreenEl = document.querySelector("#boot-screen");
  const bootMessageEl = document.querySelector("#boot-message");
  const bootProgressFillEl = document.querySelector("#boot-progress-fill");
  const bootStartupDiskEl = document.querySelector("#boot-startup-disk");
  const bootProjectDiskEl = document.querySelector("#boot-project-disk");
  const bootLocalModelEl = document.querySelector("#boot-local-model");
  const promptInput = document.querySelector("#prompt");
  const composeToolsToggleButton = document.querySelector("#compose-tools-toggle");
  const composeToolsMenuEl = document.querySelector("#compose-tools-menu");
  const messagesEl = document.querySelector("#messages");
  const statusEl = document.querySelector("#status");
  const assistantMeterButton = document.querySelector("#assistant-meter");
  const localProviderEl = document.querySelector("#local-provider");
  const endpointInput = document.querySelector("#endpoint");
  const modelInput = document.querySelector("#model");
  const setupLocalModelButton = document.querySelector("#setup-local-model");
  const findModelsButton = document.querySelector("#find-models");
  const modelPickerStatusEl = document.querySelector("#model-picker-status");
  const modelStatePanelEl = document.querySelector("#model-state-panel");
  const modelStateNextEl = document.querySelector("#model-state-next");
  const searchProviderInput = document.querySelector("#search-provider");
  const importerModeInput = document.querySelector("#importer-mode");
  const ocrEngineInput = document.querySelector("#ocr-engine");
  const importerStatusEl = document.querySelector("#importer-status");
  const contextLengthInput = document.querySelector("#context-length");
  const contextRamStatusEl = document.querySelector("#context-ram-status");
  const loadModelButton = document.querySelector("#load-model");
  const loadModelStatusEl = document.querySelector("#load-model-status");
  const systemInput = document.querySelector("#system");
  const rememberInput = document.querySelector("#remember");
  const clearButton = document.querySelector("#clear");
  const clipSelectionButton = document.querySelector("#clip-selection");
  const retryButton = document.querySelector("#retry");
  const stopButton = document.querySelector("#stop");
  const clockEl = document.querySelector("#clock");
  const filesInput = document.querySelector("#files");
  const filesSelectionEl = document.querySelector("#files-selection");
  const indexFilesButton = document.querySelector("#index-files");
  const ragStatusEl = document.querySelector("#rag-status");
  const mountedTextDiskEl = document.querySelector("#mounted-text-disk");
  const textDiskCountEl = document.querySelector("#text-disk-count");
  const textDiskGridEl = document.querySelector("#text-disk-grid");
  const currentProjectLabelEl = document.querySelector("#current-project-label");
  const projectSwitcherButton = document.querySelector("#project-switcher-button");
  const projectSwitcherLabelEl = document.querySelector("#project-switcher-label");
  const projectSwitcherPopoverEl = document.querySelector("#project-switcher-popover");
  const startupSettingsModal = document.querySelector("#startup-settings-modal");
  const startupModeInputs = document.querySelectorAll("input[name='startup-mode']");
  const startupOpenOptionInputs = document.querySelectorAll("input[name='startup-open']");
  const startupSelectedItemsLabelEl = document.querySelector("#startup-selected-items-label");
  const spineProjectNameEl = document.querySelector("#spine-project-name");
  const spineProjectMetaEl = document.querySelector("#spine-project-meta");
  const spineProjectButtonEl = document.querySelector("#spine-project-button");
  const spineFileFloppyButtonEl = document.querySelector("#spine-file-floppy-button");
  const spineFileFloppyLabelEl = document.querySelector("#spine-file-floppy-label");
  const writingToolsPanelEl = document.querySelector(".writing-spine-panel");
  const writingToolsShadeToggleEl = document.querySelector(".spine-shade-toggle");
  const assistantProjectStatusEl = document.querySelector("#assistant-project-status");
  const activeProjectLabelEl = document.querySelector("#active-project-label");
  const selectedProjectLabelEl = document.querySelector("#selected-project-label");
  const documentsProjectLabelEl = document.querySelector("#documents-project-label");
  const scrapbookProjectLabelEl = document.querySelector("#scrapbook-project-label");
  const trashProjectLabelEl = document.querySelector("#trash-project-label");
  const projectDiskCountEl = document.querySelector("#project-disk-count");
  const projectDiskGridEl = document.querySelector("#project-disk-grid");
  const projectDiskNameInput = document.querySelector("#project-disk-name");
  const newProjectDiskButton = document.querySelector("#new-project-disk");
  const projectDiskUpButton = document.querySelector("#project-disk-up");
  const projectDiskPathEl = document.querySelector("#project-disk-path");
  const embeddingModelInput = document.querySelector("#embedding-model");
  const scrapTitleDisplay = document.querySelector("#scrap-title-display");
  const scrapTagsEl = document.querySelector("#scrap-tags");
  const scrapStackSelect = document.querySelector("#scrap-stack");
  const scrapBodyInput = document.querySelector("#scrap-body-input");
  const scrapSourceInfoEl = document.querySelector("#scrap-source-info");
  const toggleScrapTranslationButton = document.querySelector("#toggle-scrap-translation");
  const insertScrapButton = document.querySelector("#insert-scrap");
  const deleteScrapButton = document.querySelector("#delete-scrap");
  const openScrapSourceButton = document.querySelector("#open-scrap-source");
  const scrapSelectionCountEl = document.querySelector("#scrap-selection-count");
  const sendScrapsToQuestionButton = document.querySelector("#send-scraps-to-question");
  const outlineScrapsButton = document.querySelector("#outline-scraps");
  const scrapbookDocMapButton = document.querySelector("#scrapbook-docmap");
  const scrapbookAskForm = document.querySelector("#scrapbook-ask-form");
  const scrapbookQuestionInput = document.querySelector("#scrapbook-question");
  const downloadScrapsBilingualButton = document.querySelector("#download-scraps-bilingual");
  const scrapListEl = document.querySelector("#scrap-list");
  const scrapCountEl = document.querySelector("#scrap-count");
  const trashListEl = document.querySelector("#trash-list");
  const trashCountEl = document.querySelector("#trash-count");
  const restoreTrashButton = document.querySelector("#restore-trash");
  const emptyTrashButton = document.querySelector("#empty-trash");
  const projectCdCountEl = document.querySelector("#project-cd-count");
  const projectCdGridEl = document.querySelector("#project-cd-grid");
  const downloadProjectCdButton = document.querySelector("#download-project-cd");
  const printProjectCdPdfButton = document.querySelector("#print-project-cd-pdf");
  const clearProjectCdButton = document.querySelector("#clear-project-cd");
  const pageSetupInputs = document.querySelectorAll("[data-page-setup-key]");
  const importFilesButton = document.querySelector("#import-files-button");
  const importFilesSelectionEl = document.querySelector("#import-files-selection");
  const importStatusEl = document.querySelector("#import-status");
  const importPreviewEl = document.querySelector("#import-preview");
  const importDocumentsButton = document.querySelector("#import-documents");
  const projectBackupFileButton = document.querySelector("#project-backup-file-button");
  const projectBackupSelectionEl = document.querySelector("#project-backup-selection");
  const projectBackupPreviewEl = document.querySelector("#project-backup-preview");
  const importProjectBackupButton = document.querySelector("#import-project-backup");
  const modalScrim = document.querySelector("[data-modal-scrim]");
  const documentsCountEl = document.querySelector("#documents-count");
  const documentsFolderLabelEl = document.querySelector("#documents-folder-label");
  const documentIconGridEl = document.querySelector("#document-icon-grid");
  const documentsUpButton = document.querySelector("#documents-up");
  const chatFileTitleEl = document.querySelector("#chat-file-title");
  const chatFileMetaEl = document.querySelector("#chat-file-meta");
  const chatFileBodyEl = document.querySelector("#chat-file-body");
  const openChatFileButton = document.querySelector("#open-chat-file");
  const insertChatFileButton = document.querySelector("#insert-chat-file");
  const chatFileDocMapButton = document.querySelector("#chat-file-docmap");
  const downloadChatMarkdownButton = document.querySelector("#download-chat-markdown");
  const trashChatFileButton = document.querySelector("#trash-chat-file");
  const newFolderNameInput = document.querySelector("#new-folder-name");
  const newFolderButton = document.querySelector("#new-folder");
  const saveChatTitleEl = document.querySelector("#save-chat-title");
  const saveChatForm = document.querySelector("#save-chat-form");
  const chatFileNameInput = document.querySelector("#chat-file-name");
  const chatFolderNameInput = document.querySelector("#chat-folder-name");
  const saveChatHintEl = document.querySelector("#save-chat-hint");
  const folderSuggestionsEl = document.querySelector("#folder-suggestions");
  const teachTextForm = document.querySelector("#teachtext-form");
  const teachTextTitleEl = document.querySelector("#teachtext-title");
  const teachTextStatusEl = document.querySelector("#teachtext-status");
  const teachTextTabsEl = document.querySelector("#teachtext-tabs");
  const teachTextNameInput = document.querySelector("#teachtext-name");
  const teachTextFolderInput = document.querySelector("#teachtext-folder");
  const teachTextLabelSelect = document.querySelector("#teachtext-label");
  const teachTextBodyInput = document.querySelector("#teachtext-body");
  const teachTextBoundaryEl = document.querySelector("#teachtext-boundary");
  const teachTextModeStateEl = document.querySelector("#teachtext-mode-state");
  const teachTextSourceCountEl = document.querySelector("#teachtext-source-count");
  const teachTextSelectionStateEl = document.querySelector("#teachtext-selection-state");
  const teachTextExportStateEl = document.querySelector("#teachtext-export-state");
  const teachTextPreviewEl = document.querySelector("#teachtext-preview");
  const teachTextImageInput = document.querySelector("#teachtext-image-input");
  const teachTextAttachmentsCountEl = document.querySelector("#image-manager-status");
  const teachTextAttachmentDocumentEl = document.querySelector("#image-manager-document");
  const teachTextAttachmentsListEl = document.querySelector("#teachtext-attachments-list");
  const teachTextTogglePreviewButton = document.querySelector("#teachtext-toggle-preview");
  const teachTextSideAskButton = document.querySelector("#teachtext-sideask");
  const teachTextTranslateButton = document.querySelector("#teachtext-translate");
  const teachTextDocMapButton = document.querySelector("#teachtext-docmap");
  const teachTextClipSelectionButton = document.querySelector("#teachtext-clip-selection");
  const teachTextSaveCopyButton = document.querySelector("#teachtext-save-copy");
  const teachTextDownloadMarkdownButton = document.querySelector("#teachtext-download-markdown");
  const teachTextDownloadBilingualButton = document.querySelector("#teachtext-download-bilingual");
  const styleSheetCountEl = document.querySelector("#style-sheet-count");
  const styleSheetResultsEl = document.querySelector("#style-sheet-results");
  const reviewStatusTitleEl = document.querySelector("#review-status-title");
  const reviewDeskBodyInput = document.querySelector("#review-desk-body");
  const reviewDeskPreviewEl = document.querySelector("#review-desk-preview");
  const reviewDeskEmptyNoteEl = document.querySelector("#review-desk-empty-note");
  const reviewDeskSplitterEl = document.querySelector("#review-desk-splitter");
  const reviewSectionSelectEl = document.querySelector("#review-section-source");
  const reviewSectionMetaEl = document.querySelector("#review-section-meta");
  const reviewSectionPreviousButton = document.querySelector("#review-section-prev");
  const reviewSectionNextButton = document.querySelector("#review-section-next");
  const styleSectionSelectEl = reviewSectionSelectEl || document.querySelector("#style-section-source");
  const styleSectionMetaEl = reviewSectionMetaEl || document.querySelector("#style-section-meta");
  const styleSectionPreviousButton = reviewSectionPreviousButton || document.querySelector("#style-section-prev");
  const styleSectionNextButton = reviewSectionNextButton || document.querySelector("#style-section-next");
  const findPathForm = document.querySelector("#find-path-form");
  const findPathQueryInput = document.querySelector("#find-path-query");
  const findPathLimitInput = document.querySelector("#find-path-limit");
  const findPathResultsEl = document.querySelector("#find-path-results");
  const findPathProviderEl = document.querySelector("#find-path-provider");
  const findPathCountEl = document.querySelector("#find-path-count");
  const synthesizeFindPathButton = document.querySelector("#synthesize-find-path");
  const findPathSummaryEl = document.querySelector("#find-path-summary");
  const findFileForm = document.querySelector("#find-file-form");
  const findFileQueryInput = document.querySelector("#find-file-query") || findPathQueryInput;
  const findFileResultsEl = document.querySelector("#find-file-results");
  const findFileCountEl = document.querySelector("#find-file-count");
  const findFileScopeEl = document.querySelector("#find-file-scope");
  const copyFindPathButton = document.querySelector("#copy-find-path");
  const insertFindPathButton = document.querySelector("#insert-find-path");
  const notePadTextInput = document.querySelector("#note-pad-text");
  const notePadPrevButton = document.querySelector("#note-pad-prev");
  const notePadNextButton = document.querySelector("#note-pad-next");
  const notePadPageLabelEl = document.querySelector("#note-pad-page-label");
  const notePadSendTeachTextButton = document.querySelector("#note-pad-send-teachtext");
  const notePadSendScrapbookButton = document.querySelector("#note-pad-send-scrapbook");
  const notePadSendAssistantButton = document.querySelector("#note-pad-send-assistant");
  const clipboardTextInput = document.querySelector("#clipboard-text");
  const clipboardMetaEl = document.querySelector("#clipboard-meta");
  const clipboardInsertButton = document.querySelector("#clipboard-insert");
  const clipboardClearButton = document.querySelector("#clipboard-clear");
  const clipboardTranslateButton = document.querySelector("#clipboard-translate");
  const clipboardTranslationPanel = document.querySelector("#clipboard-translation-panel");
  const clipboardTranslationTextInput = document.querySelector("#clipboard-translation-text");
  const clipboardTranslationTeachTextButton = document.querySelector("#clipboard-translation-teachtext");
  const clipboardTranslationScrapbookButton = document.querySelector("#clipboard-translation-scrapbook");
  const clipboardTranslationAssistantButton = document.querySelector("#clipboard-translation-assistant");
  const clipboardDocMapButton = document.querySelector("#clipboard-docmap");
  const calculatorDisplay = document.querySelector("#calculator-display");
  const calculatorKeys = document.querySelector("#calculator-keys");
  const writingBellTimeEl = document.querySelector("#writing-bell-time");
  const writingBellModeEl = document.querySelector("#writing-bell-mode");
  const writingBellPresetsEl = document.querySelector("#writing-bell-presets");
  const writingBellStartButton = document.querySelector("#writing-bell-start");
  const writingBellPauseButton = document.querySelector("#writing-bell-pause");
  const writingBellResetButton = document.querySelector("#writing-bell-reset");
  const writingBellStatusEl = document.querySelector("#writing-bell-status");
  const memoryCardsBoardEl = document.querySelector("#memory-cards-board");
  const memoryCardsMovesEl = document.querySelector("#memory-cards-moves");
  const memoryCardsTimeEl = document.querySelector("#memory-cards-time");
  const memoryCardsStatusEl = document.querySelector("#memory-cards-status");
  const puzzleBoardEl = document.querySelector("#puzzle-board");
  const puzzleMovesEl = document.querySelector("#puzzle-moves");
  const puzzleStatusEl = document.querySelector("#puzzle-status");
  const characterMapEl = document.querySelector("#character-map");
  const readerTitleEl = document.querySelector("#reader-title");
  const readerUrlInput = document.querySelector("#reader-url-input");
  const readerWorkspaceEl = document.querySelector("#reader-workspace");
  const readerTabsEl = document.querySelector("#reader-tabs");
  const readerSplitHandleEl = document.querySelector("#reader-split-handle");
  const readerFetchButton = document.querySelector("#reader-fetch-button");
  const readerClipButton = document.querySelector("#reader-clip-button");
  const readerClipTranslateButton = document.querySelector("#reader-clip-translate-button");
  const readerDocMapButton = document.querySelector("#reader-docmap-button");
  const readerOpenClioStageButton = document.querySelector("#reader-open-clio-stage");
  const readerSendManuscriptButton = document.querySelector("#reader-send-manuscript");
  const readerAskForm = document.querySelector("#reader-ask-form");
  const readerQuestionInput = document.querySelector("#reader-question");
  const readerContentEl = document.querySelector("#reader-content");
  const readerStatusEl = document.querySelector("#reader-status");
  const readerUrlDisplayEl = document.querySelector("#reader-url-display");
  const dictationRecordButton = document.querySelector("#dictation-record");
  const dictationStopButton = document.querySelector("#dictation-stop");
  const dictationCleanButton = document.querySelector("#dictation-clean");
  const dictationClearButton = document.querySelector("#dictation-clear");
  const dictationSendButton = document.querySelector("#dictation-send");
  const dictationRawInput = document.querySelector("#dictation-raw");
  const dictationCleanedInput = document.querySelector("#dictation-cleaned");
  const dictationStatusEl = document.querySelector("#dictation-status");
  const dictationIntentTargetEl = document.querySelector("#dictation-intent-target");
  const translationPadSourceInput = document.querySelector("#translation-pad-source");
  const translationPadResultInput = document.querySelector("#translation-pad-result");
  const translationPadStatusEl = document.querySelector("#translation-pad-status");
  const translationPadTargetEl = document.querySelector("#translation-pad-target");
  const translationPadClearButton = document.querySelector("#translation-pad-clear");
  const translationPadTranslateButton = document.querySelector("#translation-pad-translate");
  const translationPadSendButton = document.querySelector("#translation-pad-send");
  const questionSheetBodyInput = document.querySelector("#question-sheet-body");
  const questionSheetPreviewEl = document.querySelector("#question-sheet-preview");
  const questionCountEl = document.querySelector("#question-count");
  const questionManuscriptTitleEl = document.querySelector("#question-manuscript-title");
  const outlineNotesEl = document.querySelector("#outline-notes");
  const outlineContentEl = document.querySelector("#outline-content");
  const outlinePreviewEl = document.querySelector("#outline-preview");
  const outlineStatusEl = document.querySelector("#outline-status");
  const outlinePipelineLabelSelect = document.querySelector("#outline-pipeline-label");
  const draftListEl = document.querySelector("#draft-list");
  const draftSectionSelectEl = document.querySelector("#draft-section-source");
  const draftCountEl = document.querySelector("#draft-count");
  const draftPipelineLabelSelect = document.querySelector("#draft-pipeline-label");
  const draftSectionLabelEl = document.querySelector("#draft-section-label");
  const draftTitleInput = document.querySelector("#draft-title");
  const draftBodyInput = document.querySelector("#draft-body");
  const draftPreviewEl = document.querySelector("#draft-preview");
  const claimSectionSelectEl = reviewSectionSelectEl || document.querySelector("#claim-section-source");
  const claimSectionMetaEl = reviewSectionMetaEl || document.querySelector("#claim-section-meta");
  const claimSectionPreviousButton = reviewSectionPreviousButton || document.querySelector("#claim-section-prev");
  const claimSectionNextButton = reviewSectionNextButton || document.querySelector("#claim-section-next");
  const claimResultsEl = document.querySelector("#claim-results");
  const rebuildFlowProjectEl = document.querySelector("#rebuild-flow-project");
  const rebuildFlowSourceMetaEl = document.querySelector("#rebuild-flow-source-meta");
  const rebuildFlowSourceInput = document.querySelector("#rebuild-flow-source");
  const rebuildFlowStatusEl = document.querySelector("#rebuild-flow-status");
  const rebuildFlowProgressBarEl = document.querySelector("#rebuild-flow-progress-bar");
  const rebuildFlowStepsEl = document.querySelector("#rebuild-flow-steps");
  const docMapCountEl = document.querySelector("#docmap-count");
  const docMapTabsEl = document.querySelector("#docmap-tabs");
  const docMapTreeEl = document.querySelector("#docmap-tree");
  const docMapFitViewButton = document.querySelector("#docmap-fit-view");
  const docMapZoomOutButton = document.querySelector("#docmap-zoom-out");
  const docMapZoomInButton = document.querySelector("#docmap-zoom-in");
  const docMapCommandMenu = document.querySelector("#docmap-command-menu");
  const docMapCommandSummary = document.querySelector("#docmap-command-summary");
  const docMapSendQuestionButton = document.querySelector("#docmap-send-question");
  const docMapAskHkrrButton = document.querySelector("#docmap-ask-hkrr");
  const docMapInsertOutlineButton = document.querySelector("#docmap-insert-outline");
  const docMapSaveButton = document.querySelector("#docmap-save");
  const docMapPrintPdfButton = document.querySelector("#docmap-print-pdf");
  const docMapAskForm = document.querySelector("#docmap-ask-form");
  const docMapQuestionInput = document.querySelector("#docmap-question");
  const docMapDropZoneEl = document.querySelector("#docmap-drop-zone");
  const clioStageViewportEl = document.querySelector("#clio-stage-viewport");
  const clioStageImportFilesButton = document.querySelector("#clio-stage-import-files");
  const clioStageFileInput = document.querySelector("#clio-stage-file-input");
  const clioStageAskForm = document.querySelector("#clio-stage-ask-form");
  const clioStageQuestionInput = document.querySelector("#clio-stage-question");
  const dictionaryTermEl = document.querySelector("#dictionary-term");
  const dictionarySourceEl = document.querySelector("#dictionary-source");
  const dictionaryForm = document.querySelector("#dictionary-form");
  const dictionaryQueryInput = document.querySelector("#dictionary-query");
  const dictionaryResultEl = document.querySelector("#dictionary-result");
  const dictionaryRecentEl = document.querySelector("#dictionary-recent");
  const systemHelpQueryInput = document.querySelector("#system-help-query");
  const systemHelpCategoriesEl = document.querySelector("#system-help-categories");
  const systemHelpListEl = document.querySelector("#system-help-list");
  const systemHelpDetailEl = document.querySelector("#system-help-detail");
  const systemHelpCountEl = document.querySelector("#system-help-count");
  const modernFontsInput = document.querySelector("#modern-fonts");
  const liquidGlassInput = document.querySelector("#liquid-glass");
  const soundEffectsInput = document.querySelector("#sound-effects");
  const menuClockInput = document.querySelector("#menu-clock");
  const docMapLayoutToggleButton = document.querySelector("#docmap-layout-toggle");
  const docMapLayoutButtons = document.querySelectorAll("[data-docmap-layout-option]");
  const performanceMeterInput = document.querySelector("#performance-meter");
  const showResetSystemMenuInput = document.querySelector("#show-reset-system-menu");
  const infoProjectNameEl = document.querySelector("#info-project-name");
  const infoProjectCreatedEl = document.querySelector("#info-project-created");
  const infoProjectModifiedEl = document.querySelector("#info-project-modified");
  const infoFileCountEl = document.querySelector("#info-file-count");
  const infoScrapCountEl = document.querySelector("#info-scrap-count");
  const infoRefCountEl = document.querySelector("#info-ref-count");
  const infoWordCountEl = document.querySelector("#info-word-count");
  const exportProjectDiskButton = document.querySelector("#export-project-disk");
  const systemModal = document.querySelector("#system-modal");
  const systemModalMessage = document.querySelector("#system-modal-message");
  const systemModalCancel = document.querySelector("#system-modal-cancel");
  const systemModalNo = document.querySelector("#system-modal-no");
  const systemModalYes = document.querySelector("#system-modal-yes");
  const meterSpeedEl = document.querySelector("#meter-speed");
  const meterTokensEl = document.querySelector("#meter-tokens");
  const meterElapsedEl = document.querySelector("#meter-elapsed");
  const meterStopEl = document.querySelector("#meter-stop");
  const aboutModelEl = document.querySelector("#about-model");
  const aboutVersionEl = document.querySelector("#about-version");
  const statusClockTimeEl = document.querySelector("#status-clock-time");
  const statusClockDateEl = document.querySelector("#status-clock-date");
  const statusModelEl = document.querySelector("#status-model");
  const statusModelStateEl = document.querySelector("#status-model-state");
  const statusCurrentTaskEl = document.querySelector("#status-current-task");
  const statusVersionEl = document.querySelector("#status-version");
  const statusProjectEl = document.querySelector("#status-project");
  const statusTextDiskEl = document.querySelector("#status-text-disk");
  const statusContextEl = document.querySelector("#status-context");
  const statusModeEl = document.querySelector("#status-mode");
  const notificationCenterButton = document.querySelector("#notification-center-button");
  const notificationCenterCountEl = document.querySelector("#notification-center-count");
  const notificationCenterSummaryEl = document.querySelector("#notification-center-summary");
  const notificationCenterListEl = document.querySelector("#notification-center-list");
  const attachedClipsShelfEl = document.querySelector("#attached-clips");
  const attachedClipsToolbarEl = document.querySelector("#attached-clips-toolbar");
  const attachScrapButton = document.querySelector("#attach-scrap-to-assistant");
  const fileInfoNameEl = document.querySelector("#info-file-name");
  const fileInfoKindEl = document.querySelector("#info-file-kind");
  const fileInfoSizeEl = document.querySelector("#info-file-size");
  const fileInfoLocationEl = document.querySelector("#info-file-location");
  const fileInfoFolderEl = document.querySelector("#info-file-folder");
  const fileInfoSourceEl = document.querySelector("#info-file-source");
  const fileInfoContextEl = document.querySelector("#info-file-context");
  const fileInfoCreatedEl = document.querySelector("#info-file-created");
  const fileInfoModifiedEl = document.querySelector("#info-file-modified");
  const fileInfoCommentsEl = document.querySelector("#info-file-comments");
  const fileInfoIconEl = document.querySelector("#info-file-icon");
  const fileInfoDownloadMarkdownButton = document.querySelector("#info-download-markdown");
  const printDirectorySourceEl = document.querySelector("#print-directory-source");
  const printDirectoryMetaEl = document.querySelector("#print-directory-meta");
  const printDirectoryPreviewEl = document.querySelector("#print-directory-preview");
  const printDirectoryDownloadButton = document.querySelector("#print-directory-download");

  return {
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
    statusEl,
    assistantMeterButton,
    localProviderEl,
    endpointInput,
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
    systemInput,
    rememberInput,
    clearButton,
    clipSelectionButton,
    retryButton,
    stopButton,
    clockEl,
    filesInput,
    filesSelectionEl,
    indexFilesButton,
    ragStatusEl,
    mountedTextDiskEl,
    textDiskCountEl,
    textDiskGridEl,
    currentProjectLabelEl,
    projectSwitcherButton,
    projectSwitcherLabelEl,
    projectSwitcherPopoverEl,
    startupSettingsModal,
    startupModeInputs,
    startupOpenOptionInputs,
    startupSelectedItemsLabelEl,
    spineProjectNameEl,
    spineProjectMetaEl,
    spineProjectButtonEl,
    spineFileFloppyButtonEl,
    spineFileFloppyLabelEl,
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
    fileInfoIconEl,
    fileInfoDownloadMarkdownButton,
    printDirectorySourceEl,
    printDirectoryMetaEl,
    printDirectoryPreviewEl,
    printDirectoryDownloadButton,
  };
}
