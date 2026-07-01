// Event binding for app.js.

function wireAppEvents() {
  findPathResultsEl.addEventListener("click", (event) => {
    const translateButton = event.target.closest("[data-find-path-translate]");
    if (!translateButton) return;
  
    event.preventDefault();
    event.stopPropagation();
    translateFindPathResult(Number(translateButton.dataset.findPathTranslate));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitUserText(promptInput.value.trim());
  });

  promptInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    if (event.shiftKey) return;
    event.preventDefault();
    if (form.requestSubmit) {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  });

  document.getElementById("compose-tools-menu")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-quick-draft-chat-action]");
    if (!button) return;
    const action = button.dataset.quickDraftChatAction || "";
    document.getElementById("compose-tools-menu")?.classList.add("is-hidden");
    document.getElementById("compose-tools-toggle")?.setAttribute("aria-expanded", "false");
    await submitUserText(button.textContent.trim(), { quickDraftAction: action, skipQuickDraftVent: true });
  });

  clearButton.addEventListener("click", () => {
    clearChatToTrash();
    promptInput.focus();
  });

  stopButton.addEventListener("click", stopGeneration);

  retryButton.addEventListener("click", () => {
    if (!lastUserText) {
      setStatus(t("no_retry"));
      return;
    }
  
    submitUserText(lastUserText);
  });

  clipSelectionButton.addEventListener("click", clipAssistantSelection);

  insertScrapButton.addEventListener("click", insertScrapIntoPrompt);

  deleteScrapButton.addEventListener("click", deleteSelectedScrap);

  attachScrapButton.addEventListener("click", toggleClipAttachment);

  sendScrapsToQuestionButton?.addEventListener("click", sendSelectedScrapsToQuestionSheet);

  outlineScrapsButton?.addEventListener("click", outlineSelectedScraps);

  scrapbookAskForm?.addEventListener("submit", askScrapbookQuestion);

  downloadScrapsBilingualButton?.addEventListener("click", downloadSelectedScrapsBilingualMarkdown);

  openScrapSourceButton?.addEventListener("click", openSelectedScrapSourceInReader);

  toggleScrapTranslationButton?.addEventListener("click", toggleScrapTranslationView);

  rebuildFlowSourceInput?.addEventListener("input", () => {
    rebuildFlowSourceInput.dataset.sourceLabel = t("rebuild_pasted_source");
    resetRebuildProgress();
    renderRebuildFlow();
  });

  scrapBodyInput.addEventListener("input", updateSelectedScrapMetadata);

  scrapStackSelect?.addEventListener("change", () => {
    selectedScrapStack = scrapStackSelect.value || "all";
    selectedScrapIds.clear();
    renderScraps();
  });

  teachTextForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveTextDocument();
  });

  teachTextSaveCopyButton?.addEventListener("click", () => {
    saveTextDocument({ asCopy: true });
  });

  teachTextLabelSelect?.addEventListener("change", () => {
    setTeachTextFileLabel(teachTextLabelSelect.value, { announce: true, persist: true });
  });

  [outlinePipelineLabelSelect, draftPipelineLabelSelect].forEach((select) => {
    select?.addEventListener("change", () => {
      setTeachTextFileLabel(select.value === "ai" ? "ai" : "draft", { announce: true, persist: true });
    });
  });

  teachTextTogglePreviewButton.addEventListener("click", toggleTeachTextPreview);

  const syncMdeFocusButton = (button, mode) => {
    const keys = {
      off: "teachtext_focus_off",
      typewriter: "teachtext_focus_typewriter",
      paragraph: "teachtext_focus_paragraph",
    };
    const key = keys[mode] || keys.off;
    button.dataset.i18n = key;
    button.textContent = t(key);
    button.classList.toggle("is-active", mode !== "off");
  };

  document.querySelectorAll("[data-mde-focus-cycle]").forEach((button) => {
    button.addEventListener("click", () => {
      const textarea = document.querySelector(button.dataset.mdeTarget || "");
      if (!textarea) return;
      const container = textarea.closest(".teachtext-editor-container");
      const preview = container?.querySelector(".teachtext-preview");
      if (container?.classList.contains("is-previewing")) {
        container.classList.remove("is-previewing");
        preview?.classList.add("is-hidden");
        textarea.classList.remove("is-hidden");
      }
      const mode = typeof mdeCycleFocusMode === "function" ? mdeCycleFocusMode(textarea) : "off";
      syncMdeFocusButton(button, mode);
      textarea.focus();
    });
  });

  teachTextImageInput?.addEventListener("change", async () => {
    await addTeachTextImageAttachments(teachTextImageInput.files);
    teachTextImageInput.value = "";
  });

  teachTextTranslateButton?.addEventListener("click", translateTeachTextDocument);

  teachTextDocMapButton?.addEventListener("click", () => makeDocMapFromCurrentSource());

  teachTextClipSelectionButton?.addEventListener("click", clipTeachTextSelectionToScrapbook);

  teachTextDownloadMarkdownButton?.addEventListener("click", downloadTeachTextMarkdown);

  teachTextDownloadBilingualButton?.addEventListener("click", downloadTeachTextBilingualMarkdown);

  document.querySelectorAll(".teachtext-command-popover").forEach((popover) => {
    popover.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (button) {
        button.closest(".teachtext-command-submenu")?.removeAttribute("open");
        button.closest(".teachtext-command-menu")?.removeAttribute("open");
      }
    });
  });

  styleSheetResultsEl?.addEventListener("click", (event) => {
    const jumpButton = event.target.closest("[data-style-jump]");
    if (jumpButton) {
      jumpToStyleFinding(Number(jumpButton.dataset.styleJump));
      return;
    }
    const copyButton = event.target.closest("[data-style-copy]");
    if (copyButton) {
      copyStyleFinding(Number(copyButton.dataset.styleCopy));
    }
  });

  // Shared markdown editing shortcuts (bold/italic/link, smart list
  // continuation, Tab indent) for every markdown textarea surface.
  [
    teachTextBodyInput,
    reviewDeskBodyInput,
    questionSheetBodyInput,
    outlineContentEl,
    draftBodyInput,
  ].forEach((el) => attachMarkdownEditor(el));

  // Live markdown highlight overlay. All Markdown writing surfaces share the
  // same 28-em editor measure, typewriter mode, and focus mode implementation.
  [
    teachTextBodyInput,
    reviewDeskBodyInput,
    questionSheetBodyInput,
    outlineContentEl,
    draftBodyInput,
  ].forEach((el) => attachMarkdownHighlight(el));

  teachTextBodyInput.addEventListener("input", () => {
    markTeachTextModified();
    if (typeof noteWritingSurfaceEdit === "function") noteWritingSurfaceEdit("manuscript");
    if (typeof syncTeachTextToLinkedProjectMarkdown === "function") {
      syncTeachTextToLinkedProjectMarkdown();
    }
    syncReviewDeskFromTeachText({ force: true });
    renderClaimCheckSections();
    renderStyleCheckSections();
  });

  ["select", "click", "keyup"].forEach((eventName) => {
    teachTextBodyInput.addEventListener(eventName, () => {
      updateTeachTextTranslateButton();
      updateTeachTextDeskState();
      updateDocMapEntryButtons();
      rememberSelectionServiceContext(undefined, { clearMissing: true });
      updateMenuState();
      scheduleTeachTextTabSave();
    });
  });

  teachTextBodyInput.addEventListener("scroll", () => {
    scheduleTeachTextTabSave();
    syncLinkedManuscriptScrollFrom(teachTextBodyInput, "teachtext");
    syncReviewDeskScrollFrom(teachTextBodyInput);
  });

  teachTextPreviewEl?.addEventListener("scroll", () => {
    syncLinkedManuscriptScrollFrom(teachTextPreviewEl, "teachtext-preview");
  });

  [teachTextNameInput, teachTextFolderInput].forEach((input) => {
    input.addEventListener("input", () => {
      markTeachTextModified();
      updateQuestionSheetManuscriptTitle?.();
      updateReviewDeskStatusTitle?.();
    });
  });

  saveChatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saveDialogMode === "teachtext") {
      const options = pendingTeachTextSaveOptions || {};
      pendingTeachTextSaveOptions = null;
      teachTextNameInput.value = getTeachTextDocumentName({ fallback: chatFileNameInput.value.trim() || t("untitled") });
      teachTextFolderInput.value = chatFolderNameInput.value.trim() || preferredFolderName();
      const saved = await saveTextDocument({ ...options, promptForFolder: false });
      if (saved) {
        closeWindow("saveChat");
        saveDialogMode = "chat";
        const saveWindow = getWindow("saveChat");
        if (saveWindow) saveWindow.dataset.app = "clioTalk";
        openWindow("teachText");
      }
      return;
    }
  
    saveCurrentChatAsFile(chatFileNameInput.value, chatFolderNameInput.value);
  });

  newFolderButton.addEventListener("click", () => {
    const folder = ensureFolder(newFolderNameInput.value);
    selectedChatFileId = null;
    selectedDocumentFolderId = folder.id;
    saveDeskState();
    renderDocuments();
  });

  newProjectDiskButton.addEventListener("click", createProjectFromInput);

  projectDiskNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (isPreparingProjectDisk) {
        createProjectFromInput();
      } else {
        renameSelectedProject();
      }
    }
  });

  projectDiskUpButton?.addEventListener("click", openProjectFinderParentFolder);

  documentsUpButton.addEventListener("click", () => {
    const folder = getSelectedFolder();
    selectedFolderId = folder?.parentId || "all";
    selectedChatFileId = null;
    selectedDocumentFolderId = null;
    renderDocuments();
  });

  openChatFileButton.addEventListener("click", openChatFile);

  insertChatFileButton.addEventListener("click", insertChatFileIntoPrompt);

  downloadChatMarkdownButton.addEventListener("click", downloadChatFileMarkdown);

  trashChatFileButton.addEventListener("click", moveChatFileToTrash);

  restoreTrashButton.addEventListener("click", () => {
    const selected = getSelectedTrashItem();
    const itemIndex = selected ? trashItems.indexOf(selected) : trashItems.findIndex(isInActiveProject);
    const item = itemIndex === -1 ? null : trashItems[itemIndex];
    if (!item) return;
  
    putAwayTrashItem(item);
  });

  emptyTrashButton.addEventListener("click", emptyActiveProjectTrash);

  printDirectoryDownloadButton?.addEventListener("click", downloadPrintedDirectoryMarkdown);

  synthesizeFindPathButton.addEventListener("click", synthesizeFindPath);

  findFileForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    runFindFileSearch();
  });

  findPathForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = findPathQueryInput.value.trim();
    if (!query) return;
  
    findPathResultsEl.replaceChildren();
    findPathResults.length = 0;
    selectedFindPathIndex = null;
    findPathSummaryEl.classList.add("is-hidden");
    findPathSummaryEl.textContent = "";
  
    const waiting = document.createElement("div");
    waiting.className = "empty-folder-note";
    waiting.textContent = t("searching_web", getSearchProviderLabel());
    findPathResultsEl.append(waiting);
    updateFindPathStatusBar();
  
    try {
      const results = await searchFindPath(query);
      findPathResults.length = 0;
      findPathResults.push(...results);
      selectedFindPathIndex = results.length ? 0 : null;
      renderFindPathResults();
    } catch (error) {
      findPathResults.length = 0;
      selectedFindPathIndex = null;
      renderFindPathResults();
      const message = normalizeFindPathErrorMessage(error);
      findPathResultsEl.replaceChildren();
      renderFindPathNotice(`${t("find_path_error", message)} ${t("searcher_error_help")}`, "error");
      setStatus(t("find_path_error", message));
    }
  });

  copyFindPathButton.addEventListener("click", copySelectedFindPath);

  insertFindPathButton.addEventListener("click", insertFindPathIntoTeachText);

  readerFetchButton.addEventListener("click", handleReaderOpenButton);

  readerClipButton.addEventListener("click", clipReaderSelection);

  readerClipTranslateButton?.addEventListener("click", clipReaderSelectionWithTranslation);

  readerDocMapButton?.addEventListener("click", () => makeDocMapFromCurrentSource());

  readerOpenClioStageButton?.addEventListener("click", openCurrentReaderInClioStage);

  readerSendManuscriptButton?.addEventListener("click", sendReaderCopyToManuscript);

  readerAskForm?.addEventListener("submit", askReaderQuestion);

  initReaderSplitHandle();

  document.addEventListener("selectionchange", () => {
    updateReaderTranslationClipButton();
    rememberSelectionServiceContext(undefined, { clearMissing: false });
    updateMenuState();
  });

  document.addEventListener("select", (event) => {
    if (!textControlContextFromElement(event.target)) return;
    rememberSelectionServiceContext(undefined, { clearMissing: false });
    updateMenuState();
  });

  readerUrlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      fetchReaderPage();
    }
  });

  questionSheetBodyInput.addEventListener("input", () => {
    // Question Sheet is not an Outline truth surface, but mark the edit so a
    // stale Manuscript/Draft marker can't make a later command read the wrong
    // surface. The resolver maps "questionSheet" to the Outline default.
    if (typeof noteWritingSurfaceEdit === "function") noteWritingSurfaceEdit("questionSheet");
    savePipelineData();
    refreshTeachTextSurfacePreview("questionSheet");
  });

  outlineContentEl.addEventListener("input", () => {
    if (typeof noteWritingSurfaceEdit === "function") noteWritingSurfaceEdit("outline");
    savePipelineData();
    refreshTeachTextSurfacePreview("outline");
  });

  outlineContentEl.addEventListener("scroll", () => {
    syncLinkedManuscriptScrollFrom(outlineContentEl, "outline");
  });

  outlinePreviewEl?.addEventListener("scroll", () => {
    syncLinkedManuscriptScrollFrom(outlinePreviewEl, "outline-preview");
  });

  draftTitleInput?.addEventListener("input", savePipelineData);

  draftBodyInput.addEventListener("input", () => {
    if (typeof noteWritingSurfaceEdit === "function") noteWritingSurfaceEdit("draft");
    savePipelineData();
    updateDraftVoiceStats();
    refreshTeachTextSurfacePreview("sectionDrafts");
  });

  if (reviewSectionSelectEl) {
    reviewSectionSelectEl.addEventListener("change", () => {
      const index = Number(reviewSectionSelectEl.value || 0);
      selectStyleCheckSection(index);
      selectClaimCheckSection(index);
    });
    reviewDeskBodyInput?.addEventListener("input", () => {
      reviewDeskDirty = true;
      syncReviewDeskToTeachText();
      syncReviewDeskPreview();
      updateReviewDeskStats();
      updateMenuState();
    });
    reviewDeskBodyInput?.addEventListener("scroll", () => {
      syncReviewDeskScrollFrom(reviewDeskBodyInput);
    });
    reviewDeskSplitterEl?.addEventListener("pointerdown", startReviewDeskSplitterDrag);
    reviewDeskSplitterEl?.addEventListener("dblclick", () => setReviewDeskSourceRatio(0.5));
    document.querySelector('[data-action="review-export"]')?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      exportReviewDeskReport();
    });
  } else {
    claimSectionSelectEl?.addEventListener("change", () => {
      selectClaimCheckSection(Number(claimSectionSelectEl.value || 0));
    });
    styleSectionSelectEl?.addEventListener("change", () => {
      selectStyleCheckSection(Number(styleSectionSelectEl.value || 0));
    });
  }

  notePadTextInput.addEventListener("input", () => {
    syncCurrentNotePadPage();
    saveDeskState();
  });

  notePadPrevButton.addEventListener("click", () => goToNotePadPage(notePadPageIndex - 1));

  notePadNextButton.addEventListener("click", goToNextNotePadPage);

  notePadSendTeachTextButton?.addEventListener("click", () => sendNotePadPage("teachtext"));

  notePadSendScrapbookButton?.addEventListener("click", () => sendNotePadPage("scrapbook"));

  notePadSendAssistantButton?.addEventListener("click", () => sendNotePadPage("assistant"));

  clipboardInsertButton.addEventListener("click", insertClipboardIntoTeachText);

  clipboardClearButton.addEventListener("click", clearClipboardWindow);

  clipboardTranslateButton?.addEventListener("click", translateClipboardText);

  clipboardDocMapButton?.addEventListener("click", () => makeDocMapFromCurrentSource());

  clipboardTranslationTeachTextButton?.addEventListener("click", () => sendClipboardTranslation("teachtext"));

  clipboardTranslationScrapbookButton?.addEventListener("click", () => sendClipboardTranslation("scrapbook"));

  clipboardTranslationAssistantButton?.addEventListener("click", () => sendClipboardTranslation("assistant"));

  translationPadSourceInput?.addEventListener("input", syncTranslationPadStateFromInputs);

  translationPadResultInput?.addEventListener("input", syncTranslationPadStateFromInputs);

  translationPadClearButton?.addEventListener("click", clearTranslationPad);

  translationPadTranslateButton?.addEventListener("click", translateTranslationPadSource);

  translationPadSendButton?.addEventListener("click", sendTranslationPad);

  docMapTreeEl?.addEventListener("click", (event) => {
    const jumpButton = event.target.closest("[data-video-docmap-jump]");
    if (jumpButton) {
      const node = (currentDocMap?.nodes || []).find((item) => item.id === jumpButton.dataset.videoDocmapJump);
      selectedDocMapNodeId = node?.id || selectedDocMapNodeId;
      const fileName = currentDocMap?.sourceMeta?.fileName || "";
      if (node && fileName && typeof revealReaderVideoTranscriptRange === "function") {
        revealReaderVideoTranscriptRange(fileName, node.blockIds || []);
      }
      return;
    }
    const button = event.target.closest("[data-docmap-node]");
    if (!button) return;
    selectedDocMapNodeId = button.dataset.docmapNode;
    renderDocMap();
  });

  docMapFitViewButton?.addEventListener("click",()=>{maximizeWindow(getWindow("docMap"));requestAnimationFrame(fitDocMapCanvasToView);});

  docMapZoomOutButton?.addEventListener("click", zoomDocMapOut);

  docMapZoomInButton?.addEventListener("click", zoomDocMapIn);

  docMapCommandSummary?.addEventListener("click", (event) => {
    if (!docMapCommandMenu?.classList.contains("is-disabled")) return;
    event.preventDefault();
  });

  docMapSendQuestionButton?.addEventListener("click", () => {
    docMapCommandMenu?.removeAttribute("open");
    sendDocMapNodeToQuestionSheet();
  });

  docMapAskHkrrButton?.addEventListener("click", () => {
    docMapCommandMenu?.removeAttribute("open");
    askDocMapHkrrTheoryReview();
  });

  docMapInsertOutlineButton?.addEventListener("click", () => {
    docMapCommandMenu?.removeAttribute("open");
    insertDocMapNodeAsOutline();
  });

  docMapSaveButton?.addEventListener("click", () => {
    docMapCommandMenu?.removeAttribute("open");
    saveCurrentDocMap();
  });

  docMapPrintPdfButton?.addEventListener("click", () => {
    docMapCommandMenu?.removeAttribute("open");
    printCurrentDocMapPdf();
  });

  docMapAskForm?.addEventListener("submit", askDocMapQuestion);

  window.addEventListener("resize", () => {
    if (currentDocMap && !document.querySelector('[data-window="docMap"]')?.classList.contains("is-hidden")) {
      requestAnimationFrame(restoreDocMapCanvasView);
    }
    document.querySelectorAll(".window.about-window:not(.is-hidden)")
      .forEach((win) => requestAnimationFrame(() => placeCenteredSystemWindow(win)));
  });

  dictionaryForm?.addEventListener("submit", lookupDictionaryInput);

  systemHelpQueryInput?.addEventListener("input", renderSystemHelp);

  calculatorKeys.addEventListener("click", (event) => {
    const key = event.target.closest("[data-calc]")?.dataset.calc;
    if (key) pressCalculatorKey(key);
  });

  writingBellModeEl?.addEventListener("click", (event) => {
    const mode = event.target.closest("[data-bell-mode]")?.dataset.bellMode;
    if (mode) setWritingBellMode(mode);
  });

  writingBellPresetsEl?.addEventListener("click", (event) => {
    const minutes = Number(event.target.closest("[data-bell-preset]")?.dataset.bellPreset || 0);
    if (minutes) setWritingBellMinutes(minutes);
  });

  writingBellStartButton?.addEventListener("click", startWritingBell);

  writingBellPauseButton?.addEventListener("click", pauseWritingBell);

  writingBellResetButton?.addEventListener("click", resetWritingBell);

  memoryCardsBoardEl?.addEventListener("click", (event) => {
    const cardId = event.target.closest("[data-memory-card]")?.dataset.memoryCard;
    if (cardId) flipMemoryCard(cardId);
  });

  puzzleBoardEl?.addEventListener("click", (event) => {
    const index = Number(event.target.closest("[data-puzzle-index]")?.dataset.puzzleIndex);
    if (Number.isInteger(index)) movePuzzleTile(index);
  });

  characterMapEl.addEventListener("click", (event) => {
    const character = event.target.closest("[data-character]")?.dataset.character;
    if (character) insertCharacter(character);
  });

  document.querySelectorAll(".view-controls").forEach((controls) => {
    controls.addEventListener("click", (event) => {
      const button = event.target.closest(".view-btn");
      if (!button) return;
      toggleViewMode(controls.dataset.viewWindow, button.dataset.view);
    });
  });

  fileInfoCommentsEl.addEventListener("input", () => {
    if (!fileInfoItem) return;
    fileInfoItem.comments = fileInfoCommentsEl.value;
    fileInfoItem.updatedAt = new Date().toISOString();
    saveDeskState();
  });

  fileInfoDownloadMarkdownButton.addEventListener("click", () => {
    if (fileInfoItem) downloadMarkdown(formatInfoItemMarkdown(fileInfoItem), fileInfoItem.name || fileInfoItem.title || t("untitled"));
  });

  document.addEventListener("focusin", (event) => {
    rememberTextTarget(event.target);
    showDictationFieldButtonForTarget(event.target);
  });

  document.addEventListener("focusout", () => {
    scheduleDictationFieldButtonHide();
  });

  document.addEventListener("keyup", (event) => {
    rememberTextTarget(event.target);
    positionDictationFieldButton();
  });

  document.addEventListener("pointerup", (event) => {
    rememberTextTarget(event.target);
    showDictationFieldButtonForTarget(event.target);
  });

  window.addEventListener("resize", () => positionDictationFieldButton());

  window.addEventListener("scroll", () => positionDictationFieldButton(), true);

  [endpointInput, modelInput, searchProviderInput, importerModeInput, ocrEngineInput, contextLengthInput, systemInput, embeddingModelInput].filter(Boolean).forEach((input) => {
    input.addEventListener("input", scheduleSettingsSave);
    input.addEventListener("change", scheduleSettingsSave);
  });

  searchProviderInput?.addEventListener("change", () => {
    updateFindPathStatusBar();
    updateSearchProviderLabels();
  });

  importerModeInput?.addEventListener("change", refreshImporterStatus);

  const handleModelNameChanged = () => {
    activeChatModelIdentifier = "";
    updateContextMaxForCurrentModel();
    updateLocalModelState({ selected: !!modelInput.value.trim(), loaded: false, ready: false });
  };
  document.getElementById("model-select")?.addEventListener("change", (event) => {
    modelInput.value = event.target.value || "";
    handleModelNameChanged();
    scheduleSettingsSave();
  });
  document.getElementById("embedding-model-select")?.addEventListener("change", (event) => {
    embeddingModelInput.value = event.target.value || "";
    scheduleSettingsSave();
  });
  document.getElementById("manual-model-fields")?.addEventListener("change", () => {
    syncLocalModelControls();
    if (typeof syncCloudModelControls === "function") syncCloudModelControls();
    scheduleSettingsSave();
  });
  document.getElementById("enable-image-gen")?.addEventListener("change", (event) => {
    document.body.classList.toggle("image-gen-enabled", event.target.checked);
    scheduleSettingsSave();
  });
  modelInput?.addEventListener("input", handleModelNameChanged);
  modelInput?.addEventListener("change", handleModelNameChanged);

  endpointInput?.addEventListener("input", () => updateLocalModelState({ server: false, models: false, loaded: false, ready: false }));

  contextLengthInput?.addEventListener("input", () => {
    rememberContextLengthForCurrentModel(true);
    renderContextLengthPresets();
    updateLocalModelState({ loaded: false, ready: false });
  });

  contextLengthInput?.addEventListener("change", () => {
    rememberContextLengthForCurrentModel(true);
    normalizeContextLengthInput();
    renderContextLengthPresets();
    updateLocalModelState({ loaded: false, ready: false });
  });

  document.getElementById("context-length-preset")?.addEventListener("change", (event) => {
    const value = event.target.value;
    if (!value) return;
    contextLengthInput.value = value;
    rememberContextLengthForCurrentModel(true);
    normalizeContextLengthInput();
    updateLocalModelState({ loaded: false, ready: false });
    scheduleSettingsSave();
  });

  setupLocalModelButton?.addEventListener("click", setupLocalLmStudioModel);

  findModelsButton?.addEventListener("click", findLmStudioModels);

  loadModelButton.addEventListener("click", loadSelectedLmStudioModel);

  localProviderEl?.addEventListener("change", () => {
    const p = localProviderEl.value;
    const localHttp = `http:${String.fromCharCode(47, 47)}127.0.0.1:`;
    endpointInput.value = p === "lm-studio" ? "/api/chat" : p === "ollama" ? `${localHttp}11434` : `${localHttp}1234`;
    loadModelButton.disabled = p !== "lm-studio";
    loadModelStatusEl.textContent = t(p === "lm-studio" ? "load_model_hint" : p === "ollama" ? "ollama_auto_load_hint" : "custom_auto_load_hint");
    scheduleSettingsSave();
    findLmStudioModels();
  });

  rememberInput.addEventListener("change", saveDeskState);

  document.querySelectorAll(".menu-item-with-sub > button").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = button.closest(".menu-item-with-sub");
      if (!item?.closest(".menu.is-open")) return;
      event.preventDefault();
      event.stopPropagation();
      toggleMenuSubItem(item);
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".select-wrap.has-system-select")) {
      closeSystemSelectMenus();
    }
  
    if (!event.target.closest(".teachtext-command-menu")) {
      closeTeachTextCommandMenus();
    }
  
    if (!event.target.closest(".compose-tools-anchor")) {
      closeComposeToolsMenu();
    }
  
    const subMenuItem = event.target.closest(".menu-item-with-sub");
    const subMenuButton = subMenuItem?.querySelector(":scope > button");
    if (subMenuItem && event.target.closest("button") === subMenuButton) {
      event.preventDefault();
      toggleMenuSubItem(subMenuItem);
      return;
    }
  
    const menuButton = event.target.closest(".menu > button");
    if (menuButton) {
      const menu = menuButton.closest(".menu");
      const isOpen = menu.classList.contains("is-open");
      closeMenus();
      if (!isOpen) {
        updateMenuState();
        menu.classList.add("is-open");
        positionOpenMenu(menu);
      }
      return;
    }
  
    const projectSwitchTarget = event.target.closest("[data-switch-project]");
    if (projectSwitchTarget) {
      const projectId = projectSwitchTarget.dataset.switchProject;
      if (!projectSwitchTarget.disabled && projectId) {
        handleProjectSwitcherChoice(projectId);
      }
      projectSwitchTarget.blur();
      closeMenus();
      return;
    }
  
    const appSwitchTarget = event.target.closest("[data-switch-app]");
    if (appSwitchTarget) {
      const appId = appSwitchTarget.dataset.switchApp;
      if (!appSwitchTarget.disabled && appId) {
        switchToApp(appId);
      }
      appSwitchTarget.blur();
      closeMenus();
      return;
    }
  
    const desktopIconTarget = event.target.closest(".icon-column .desktop-icon");
    if (desktopIconTarget) {
      event.preventDefault();
      closeMenus();
      selectDesktopIcon(desktopIconTarget);
      return;
    }
  
    const openTarget = event.target.closest("[data-open]");
    if (openTarget) {
      closeMenus();
      openWindow(openTarget.dataset.open);
      return;
    }
  
    const staticFinderTarget = event.target.closest("[data-static-finder-action]");
    if (staticFinderTarget) {
      if (event.detail >= 2) {
        handleAction(staticFinderTarget.dataset.staticFinderAction);
        return;
      }
      selectStaticFinderItem(staticFinderTarget.dataset.staticFinderWindow, staticFinderTarget.dataset.staticFinderAction);
      return;
    }
  
    const disabledSubmenuTarget = event.target.closest("[data-submenu-action].is-disabled");
    if (disabledSubmenuTarget) {
      closeMenus();
      return;
    }
  
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      if (actionTarget.disabled || actionTarget.classList.contains("is-disabled")) {
        closeMenus();
        return;
      }
      const action = actionTarget.dataset.action;
      handleAction(action);
      if (action !== "toggle-compose-tools") {
        closeComposeToolsMenu();
      }
      actionTarget.blur();
      closeMenus();
      return;
    }
  
    closeMenus();
  });

  document.addEventListener("pointerdown", startFinderMarquee);

  document.addEventListener("dblclick", (event) => {
    const desktopIconTarget = event.target.closest(".icon-column .desktop-icon");
    if (desktopIconTarget) {
      event.preventDefault();
      closeMenus();
      openDesktopIcon(desktopIconTarget);
      return;
    }
  
    const staticFinderTarget = event.target.closest("[data-static-finder-action]");
    if (!staticFinderTarget) return;
    handleAction(staticFinderTarget.dataset.staticFinderAction);
  });

  window.addEventListener("resize", () => {
    document.querySelectorAll(".menu.is-open").forEach(positionOpenMenu);
  });

  document.querySelector(".menu-bar")?.addEventListener("scroll", () => {
    document.querySelectorAll(".menu.is-open").forEach(positionOpenMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenus();
      closeTeachTextCommandMenus();
      closeComposeToolsMenu();
      return;
    }
  
    const desktopIconTarget = event.target.closest?.(".icon-column .desktop-icon");
    if (event.key === "Enter" && desktopIconTarget) {
      event.preventDefault();
      closeMenus();
      openDesktopIcon(desktopIconTarget);
      return;
    }
  
    if ((event.key === "Delete" || event.key === "Backspace") && !event.metaKey && !event.ctrlKey && !event.altKey && !getActiveEditableElement()) {
      const activeName = document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window || "";
      if (["documents", "projects", "projectCd", "textDisk", "scrapbook"].includes(activeName)) {
        event.preventDefault();
        closeMenus();
        if (activeName === "textDisk") removeSelectedMountedFile();
        else if (activeName === "scrapbook") deleteSelectedScrap();
        else handleAction("move-file-trash");
        return;
      }
    }
  
    runShortcut(event);
  });

  document.querySelectorAll(".window").forEach((win) => {
    win.dataset.app = getWindowAppId(win);
    win.addEventListener("pointerdown", () => focusWindow(win));
  
    win.querySelector(".close-box")?.addEventListener("click", async () => {
      await closeWindow(win.dataset.window);
    });
  
    win.querySelector(".resize-box")?.addEventListener("click", () => {
      zoomWindow(win);
    });
  });

  startupSettingsModal?.addEventListener("close", handleStartupSettingsClose);

  startupModeInputs.forEach((input) => {
    input.addEventListener("change", () => syncStartupOpenOptions(input.value));
  });

  installGrowBoxes();

  document.querySelectorAll(".title-bar").forEach((bar) => {
    bar.addEventListener("dblclick", (event) => {
      if (event.target.closest("button")) return;
      if (bar.closest(".writing-spine-panel")) {
        toggleWritingToolsShade();
        return;
      }
      const win = bar.closest(".window");
      if (win) toggleCollapsed(win);
    });
  
    bar.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const win = bar.closest(".window");
      if (["about", "saveChat"].includes(win?.dataset.window)) return;
      if (!win) return;
      const compactViewport = window.matchMedia("(max-width: 860px)").matches;
      const allowCompactDrag = typeof isDeskAccessoryPlacementWindow === "function"
        ? isDeskAccessoryPlacementWindow(win)
        : getWindowAppId(win) === "accessories";
      if (compactViewport && !allowCompactDrag) return;
  
      focusWindow(win);
      const rect = win.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
  
      bar.setPointerCapture(event.pointerId);
  
      function moveWindow(moveEvent) {
        const maxLeft = window.innerWidth - 80;
        const maxTop = window.innerHeight - 50;
        const left = Math.min(Math.max(0, moveEvent.clientX - offsetX), maxLeft);
        const top = Math.min(Math.max(0, moveEvent.clientY - offsetY), maxTop);
  
        win.style.left = `${left}px`;
        win.style.top = `${top}px`;
        win.style.right = "auto";
        win.style.transform = "none";
      }
  
      function stopMove() {
        bar.removeEventListener("pointermove", moveWindow);
        bar.removeEventListener("pointerup", stopMove);
        bar.removeEventListener("pointercancel", stopMove);
        markWindowUserPositioned?.(win);
        scheduleWorkingSessionSave?.();
      }
  
      bar.addEventListener("pointermove", moveWindow);
      bar.addEventListener("pointerup", stopMove);
      bar.addEventListener("pointercancel", stopMove);
    });
  });

  indexFilesButton.addEventListener("click", async () => {
    await insertFilesIntoFileFloppy(Array.from(filesInput.files || []), { source: "fileFloppy", openAfter: "rag" });
  });

  docMapDropZoneEl?.addEventListener("dragenter", (event) => {
    if (!dropHasFilesOrMountedFiles(event)) return;
    event.preventDefault();
    docMapDropZoneEl.classList.add("is-dragging");
  });

  docMapDropZoneEl?.addEventListener("dragover", (event) => {
    if (!dropHasFilesOrMountedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = dropEffectForFilesOrMountedFiles(event);
    docMapDropZoneEl.classList.add("is-dragging");
  });

  docMapDropZoneEl?.addEventListener("dragleave", (event) => {
    if (!docMapDropZoneEl.contains(event.relatedTarget)) {
      docMapDropZoneEl.classList.remove("is-dragging");
    }
  });

  docMapDropZoneEl?.addEventListener("drop", (event) => {
    if (!dropHasFilesOrMountedFiles(event)) return;
    event.preventDefault();
    docMapDropZoneEl.classList.remove("is-dragging");
    const mountedFileNames = mountedFileNamesFromDrop(event);
    if (mountedFileNames.length) {
      makeDocMapFromMountedFileDrop(mountedFileNames);
      return;
    }
    importDocMapDroppedFiles(event.dataTransfer.files);
  });

  clioStageViewportEl?.addEventListener("dragenter", (event) => {
    event.preventDefault();
    clioStageViewportEl.classList.add("is-dragging");
  });

  clioStageViewportEl?.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    clioStageViewportEl.classList.add("is-dragging");
  });

  clioStageViewportEl?.addEventListener("dragleave", (event) => {
    if (!clioStageViewportEl.contains(event.relatedTarget)) {
      clioStageViewportEl.classList.remove("is-dragging");
    }
  });

  clioStageViewportEl?.addEventListener("drop", (event) => {
    event.preventDefault();
    clioStageViewportEl.classList.remove("is-dragging");
    importClioStageDroppedFiles(event.dataTransfer.files);
  });

  clioStageImportFilesButton?.addEventListener("click", () => {
    clioStageFileInput?.click();
  });

  clioStageFileInput?.addEventListener("change", async () => {
    await importClioStageDroppedFiles(clioStageFileInput.files);
    clioStageFileInput.value = "";
  });

  dictationRecordButton.addEventListener("click", startDictation);

  dictationStopButton.addEventListener("click", stopDictation);

  dictationCleanButton.addEventListener("click", cleanTranscript);

  dictationClearButton.addEventListener("click", clearDictationTranscript);

  dictationSendButton.addEventListener("click", () => sendTranscript());

  dictationRawInput.addEventListener("input", updateDictationTranscriptButtons);

  dictationCleanedInput.addEventListener("input", updateDictationTranscriptButtons);

  downloadProjectCdButton?.addEventListener("click", () => {
    const item = getSelectedProjectCdItem();
    if (item) downloadProjectCdItem(item);
  });

  printProjectCdPdfButton?.addEventListener("click", printSelectedProjectCdPdf);

  pageSetupInputs.forEach((input) => input.addEventListener("change", updatePageSetupFromControls));

  clearProjectCdButton?.addEventListener("click", clearProjectCd);

  exportProjectDiskButton?.addEventListener("click", exportActiveProjectDisk);

  filesInput?.addEventListener("change", updateFilePickerLabels);

  importFilesButton?.addEventListener("click", () => {
    openTransientFilePicker({
      accept: importableFileAccept,
      multiple: true,
      onSelect(files) {
        selectedImportFiles = files;
        updateFilePickerLabels();
        previewImportFiles();
      },
    });
  });

  importDocumentsButton?.addEventListener("click", importReadyFilesToDocuments);

  projectBackupFileButton?.addEventListener("click", () => {
    openTransientFilePicker({
      accept: ".json,application/json",
      onSelect(files) {
        selectedProjectBackupFile = files[0] || null;
        updateFilePickerLabels();
        previewProjectBackupFile();
      },
    });
  });

  importProjectBackupButton?.addEventListener("click", importProjectBackupAsNewProject);

  modernFontsInput.addEventListener("change", applyModernFonts);

  liquidGlassInput?.addEventListener("change", applyLiquidGlass);

  soundEffectsInput.addEventListener("change", () => saveDeskState());

  menuClockInput.addEventListener("change", applyMenuClock);

  docMapLayoutButtons?.forEach((button) => {
    button.addEventListener("click", () => setCurrentDocMapLayout(button.dataset.docmapLayoutOption));
  });

  performanceMeterInput.addEventListener("change", () => {
    updateModelMeterVisibility();
    saveDeskState();
  });

  showResetSystemMenuInput?.addEventListener("change", () => {
    updateMenuState();
    saveDeskState();
  });
}
