// Lazy feature module: translation-pad.

// Loaded on demand as a classic script; shares the AI System 6 global scope.



function translationPadUiTargetLanguage() {
  return currentLanguage === "zh" ? "zh" : "en";
}

function translationPadTargetLabel(language = translationPadUiTargetLanguage()) {
  return language === "zh" ? t("to_chinese") : t("to_english");
}

function translationPadSetStatus(keyOrText, ...args) {
  if (!translationPadStatusEl) return;
  translationPadStatusEl.textContent = args.length ? t(keyOrText, ...args) : t(keyOrText);
}

function translationPadSourceNeedsTranslation(source) {
  return !!getTranslationTargetForUi(String(source || ""));
}

function translationPadCanWriteToSource() {
  return !!translationPadInputTarget
    && !!translationPadSelectionRange
    && typeof translationPadSelectionRange.start === "number"
    && typeof translationPadSelectionRange.end === "number"
    && (
      translationPadInputTarget instanceof HTMLTextAreaElement
      || translationPadInputTarget instanceof HTMLInputElement
    )
    && !translationPadInputTarget.readOnly
    && !translationPadInputTarget.disabled;
}

function updateTranslationPadButtons() {
  const source = translationPadSourceInput?.value.trim() || "";
  const hasSource = !!source;
  const hasTranslation = !!translationPadTranslatedText.trim();
  const needsTranslation = translationPadSourceNeedsTranslation(source);
  if (translationPadTranslateButton) translationPadTranslateButton.disabled = !hasSource || !needsTranslation;
  if (translationPadClearButton) translationPadClearButton.disabled = !hasSource && !hasTranslation;
  if (translationPadSendButton) translationPadSendButton.disabled = !hasTranslation;
  // One default at a time, and it is whatever comes next: translate the
  // passage, then send it. A default button that cannot run is not a default.
  translationPadTranslateButton?.classList.toggle("default", !hasTranslation);
  translationPadSendButton?.classList.toggle("default", hasTranslation);
}

function syncTranslationPadStateFromInputs() {
  const nextSource = translationPadSourceInput?.value || "";
  if (nextSource !== translationPadSourceText) {
    translationPadTranslatedText = "";
    if (translationPadResultInput) translationPadResultInput.value = "";
  }
  translationPadSourceText = nextSource;
  translationPadTranslatedText = translationPadResultInput?.value || "";
  translationPadTargetLanguage = translationPadUiTargetLanguage();
  if (translationPadTargetEl) translationPadTargetEl.textContent = translationPadTargetLabel(translationPadTargetLanguage);
  updateTranslationPadButtons();
}

function clearTranslationPad() {
  translationPadSourceText = "";
  translationPadTranslatedText = "";
  translationPadSourceLabel = "";
  translationPadInputTarget = null;
  translationPadSelectionRange = null;
  translationPadTargetLanguage = translationPadUiTargetLanguage();
  if (translationPadSourceInput) translationPadSourceInput.value = "";
  if (translationPadResultInput) translationPadResultInput.value = "";
  if (translationPadTargetEl) translationPadTargetEl.textContent = translationPadTargetLabel(translationPadTargetLanguage);
  translationPadSetStatus("ready");
  updateTranslationPadButtons();
}

function openTranslationPad(options = {}) {
  const source = String(options.source || "").trim();
  if (source && !translationPadSourceNeedsTranslation(source)) {
    setStatus(t("translation_already_interface_language"));
    return false;
  }

  translationPadSourceText = source;
  translationPadTranslatedText = "";
  translationPadTargetLanguage = translationPadUiTargetLanguage();
  translationPadSourceLabel = options.sourceLabel || "";
  translationPadInputTarget = options.inputTarget || null;
  translationPadSelectionRange = options.selectionRange || null;

  if (translationPadSourceInput) translationPadSourceInput.value = translationPadSourceText;
  if (translationPadResultInput) translationPadResultInput.value = "";
  if (translationPadTargetEl) translationPadTargetEl.textContent = translationPadTargetLabel(translationPadTargetLanguage);
  translationPadSetStatus(source ? "ready" : "translation_pad_empty");
  updateTranslationPadButtons();
  openWindow("translationPad");
  if (source) {
    translateTranslationPadSource();
  } else {
    translationPadSourceInput?.focus();
  }
  return true;
}

function openTranslationPadFromSelection(context = getSelectionServiceContext()) {
  if (!context?.text) {
    setStatus(t("select_text_first"));
    return false;
  }
  const targetLanguage = getTranslationTargetForUi(context.text);
  if (!targetLanguage) {
    setStatus(t("translation_already_interface_language"));
    return false;
  }
  return openTranslationPad({
    source: context.text,
    sourceLabel: selectionLabelForContext(context),
    inputTarget: context.inputTarget || null,
    selectionRange: typeof context.start === "number" && typeof context.end === "number"
      ? { start: context.start, end: context.end }
      : null,
  });
}

async function translateTranslationPadSource() {
  const source = translationPadSourceInput?.value.trim() || "";
  if (!source) {
    translationPadSetStatus("translation_pad_empty");
    updateTranslationPadButtons();
    return;
  }
  const targetLanguage = getTranslationTargetForUi(source);
  if (!targetLanguage) {
    translationPadSetStatus("translation_already_interface_language");
    setStatus(t("translation_already_interface_language"));
    updateTranslationPadButtons();
    return;
  }

  translationPadSourceText = source;
  translationPadTargetLanguage = targetLanguage;
  if (translationPadTargetEl) translationPadTargetEl.textContent = translationPadTargetLabel(targetLanguage);
  if (!beginLongTask("translate-selection", t("translating_selection"))) return;
  if (translationPadTranslateButton) translationPadTranslateButton.disabled = true;
  translationPadSetStatus("translating_selection");

  try {
    const translated = await translateTextWithLocalModel(source, targetLanguage, {
      preserveMarkdown: true,
      title: translationPadSourceLabel || "",
      onProgress: (partial) => {
        translationPadTranslatedText = partial;
        if (translationPadResultInput) translationPadResultInput.value = partial;
        translationPadSetStatus("translating_selection");
      },
    });
    translationPadTranslatedText = translated.trim();
    if (translationPadResultInput) translationPadResultInput.value = translationPadTranslatedText;
    translationPadSetStatus("ready");
    setStatus(t("translation_pad_translated"));
  } catch (error) {
    if (!isAbortError(error)) {
      translationPadSetStatus("translation_failed", friendlyErrorDetail(error));
      setStatus(t("translation_failed", friendlyErrorDetail(error)));
    }
  } finally {
    endLongTask("translate-selection");
    updateTranslationPadButtons();
  }
}

function translationPadMetadataLine() {
  return `[${formatTranslationMeta(
    translationPadTargetLanguage || translationPadUiTargetLanguage(),
    new Date().toISOString(),
    translationPadSourceLabel || t("translation_pad"),
    currentTranslationModel()
  )}]`;
}

function writeTranslationPadToSource({ replace = false } = {}) {
  const translated = translationPadTranslatedText.trim();
  if (!translated || !translationPadCanWriteToSource()) return false;
  const target = translationPadInputTarget;
  const range = translationPadSelectionRange;
  const insertText = replace ? translated : `\n\n${translationPadMetadataLine()}\n${translated}`;
  const start = replace ? range.start : range.end;
  const end = replace ? range.end : range.end;
  target.focus();
  target.setRangeText(insertText, start, end, "end");
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  if (target === teachTextBodyInput) markTeachTextModified();
  setStatus(replace ? t("translation_pad_replaced") : t("translation_pad_inserted"));
  return true;
}

function sendTranslationPadToTeachText() {
  const translated = translationPadTranslatedText.trim();
  if (!translated) return;
  sendTextToDestination(translated, "teachtext");
  setStatus(t("translation_pad_sent_teachtext"));
}

function sendTranslationPad() {
  const translated = translationPadTranslatedText.trim();
  if (!translated) return;
  if (translationPadCanWriteToSource()) {
    writeTranslationPadToSource({ replace: true });
    return;
  }
  sendTranslationPadToTeachText();
}

let tpmounted=!1;function mountTranslationPadRuntime(){if(tpmounted)return!0;tpmounted=!0;translationPadSourceInput?.addEventListener("input",syncTranslationPadStateFromInputs);translationPadResultInput?.addEventListener("input",syncTranslationPadStateFromInputs);translationPadClearButton?.addEventListener("click",clearTranslationPad);translationPadTranslateButton?.addEventListener("click",translateTranslationPadSource);translationPadSendButton?.addEventListener("click",sendTranslationPad);return!0}
window.AISystem6Runtime?.registerApplication({id:"translationPad",windowName:"translationPad",mount:mountTranslationPadRuntime,restore:()=>mountTranslationPadRuntime(),commands:{"open-translation-pad":{handler:()=>openTranslationPad(),isAvailable:()=>!0}}});
