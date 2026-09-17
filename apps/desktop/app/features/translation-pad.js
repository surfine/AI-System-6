// Lazy feature module: translation-pad.

// Loaded on demand as a classic script; shares the AI System 6 global scope.



/**
 * The host this pad runs in.
 *
 * The pad owns its window root, its own transient state, and the behaviour of
 * its controls. Everything else it needs is a host capability: where the markup
 * it binds is, how a translation is asked for, where a status line lives, and
 * the long-task receipt and file output the desk already owns.
 *
 * The desk is the default host, resolved lazily so the module still loads in a
 * bare VM. The development preview supplies its own through `useHost` before it
 * mounts, which is what lets one component file run in both places instead of a
 * second implementation of the pad appearing beside it.
 */
let translationPadHostOverride = null;

// The pad's own transient state: what the writer has in the pad right now, and
// which field it came from. It belongs to this component, not to the desk's
// global scope, so the same component can run somewhere else with its own state.
let translationPadSourceText = "";
let translationPadTranslatedText = "";
let translationPadTargetLanguage = "";
let translationPadSourceLabel = "";
let translationPadInputTarget = null;
let translationPadSelectionRange = null;

function translationPadDeskHost() {
  return {
    // Ids are unique in the desk, so the document is the root there.
    root: () => document,
    element: (name) => ({
      source: translationPadSourceInput,
      result: translationPadResultInput,
      status: translationPadStatusEl,
      target: translationPadTargetEl,
      clear: translationPadClearButton,
      translate: translationPadTranslateButton,
      send: translationPadSendButton,
    })[name] || null,
    currentLanguage: () => currentLanguage,
    t: (key, ...args) => t(key, ...args),
    setStatus: (message) => setStatus(message),
    openWindow: (name) => openWindow(name),
    beginLongTask: (kind, label) => beginLongTask(kind, label),
    endLongTask: (kind) => endLongTask(kind),
    isAbortError: (error) => isAbortError(error),
    friendlyErrorDetail: (error) => friendlyErrorDetail(error),
    getTranslationTargetForUi: (text) => getTranslationTargetForUi(text),
    translateText: (text, language, options) => translateTextWithLocalModel(text, language, options),
    currentTranslationModel: () => currentTranslationModel(),
    formatTranslationMeta: (...args) => formatTranslationMeta(...args),
    getSelectionContext: () => getSelectionServiceContext(),
    selectionLabel: (context) => selectionLabelForContext(context),
    // The output half stays the desk's: the pad hands the writer's text back to
    // the surface it came from, and only the desk knows those surfaces.
    writeToSource: (options) => writeTranslationPadToSource(options),
    sendToTeachText: () => sendTranslationPadToTeachText(),
  };
}

function translationPadHost() {
  return translationPadHostOverride || translationPadDeskHost();
}

/** The element the pad binds inside whichever root its host names. */
function padEl(name) {
  return translationPadHost().element(name);
}

/** Shorthand: the host in force right now. */
function host() {
  return translationPadHost();
}

function translationPadUiTargetLanguage() {
  return translationPadHost().currentLanguage() === "zh" ? "zh" : "en";
}

/**
 * Which translation run the pad is currently waiting for. Clearing the pad or
 * starting another translation moves it on; an answer from an earlier run is
 * then stale and is not written into the pad.
 */
let translationPadRunId = 0;

function translationPadTargetLabel(language = translationPadUiTargetLanguage()) {
  return language === "zh" ? host().t("to_chinese") : host().t("to_english");
}

function translationPadSetStatus(keyOrText, ...args) {
  if (!padEl("status")) return;
  padEl("status").textContent = args.length ? host().t(keyOrText, ...args) : host().t(keyOrText);
}

function translationPadSourceNeedsTranslation(source) {
  return !!host().getTranslationTargetForUi(String(source || ""));
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
  const source = padEl("source")?.value.trim() || "";
  const hasSource = !!source;
  const hasTranslation = !!translationPadTranslatedText.trim();
  const needsTranslation = translationPadSourceNeedsTranslation(source);
  if (padEl("translate")) padEl("translate").disabled = !hasSource || !needsTranslation;
  if (padEl("clear")) padEl("clear").disabled = !hasSource && !hasTranslation;
  if (padEl("send")) padEl("send").disabled = !hasTranslation;
  // One default at a time, and it is whatever comes next: translate the
  // passage, then send it. A default button that cannot run is not a default.
  padEl("translate")?.classList.toggle("default", !hasTranslation);
  padEl("send")?.classList.toggle("default", hasTranslation);
}

function syncTranslationPadStateFromInputs() {
  const nextSource = padEl("source")?.value || "";
  if (nextSource !== translationPadSourceText) {
    translationPadTranslatedText = "";
    if (padEl("result")) padEl("result").value = "";
  }
  translationPadSourceText = nextSource;
  translationPadTranslatedText = padEl("result")?.value || "";
  translationPadTargetLanguage = translationPadUiTargetLanguage();
  if (padEl("target")) padEl("target").textContent = translationPadTargetLabel(translationPadTargetLanguage);
  updateTranslationPadButtons();
}

function clearTranslationPad() {
  // Whatever is in flight belongs to the text that was just cleared, so its
  // answer may not refill the pad when it lands.
  translationPadRunId += 1;
  translationPadSourceText = "";
  translationPadTranslatedText = "";
  translationPadSourceLabel = "";
  translationPadInputTarget = null;
  translationPadSelectionRange = null;
  translationPadTargetLanguage = translationPadUiTargetLanguage();
  if (padEl("source")) padEl("source").value = "";
  if (padEl("result")) padEl("result").value = "";
  if (padEl("target")) padEl("target").textContent = translationPadTargetLabel(translationPadTargetLanguage);
  translationPadSetStatus("ready");
  updateTranslationPadButtons();
}

function openTranslationPad(options = {}) {
  const source = String(options.source || "").trim();
  if (source && !translationPadSourceNeedsTranslation(source)) {
    host().setStatus(host().t("translation_already_interface_language"));
    return false;
  }

  translationPadSourceText = source;
  translationPadTranslatedText = "";
  translationPadTargetLanguage = translationPadUiTargetLanguage();
  translationPadSourceLabel = options.sourceLabel || "";
  translationPadInputTarget = options.inputTarget || null;
  translationPadSelectionRange = options.selectionRange || null;

  if (padEl("source")) padEl("source").value = translationPadSourceText;
  if (padEl("result")) padEl("result").value = "";
  if (padEl("target")) padEl("target").textContent = translationPadTargetLabel(translationPadTargetLanguage);
  translationPadSetStatus(source ? "ready" : "translation_pad_empty");
  updateTranslationPadButtons();
  host().openWindow("translationPad");
  if (source) {
    translateTranslationPadSource();
  } else {
    padEl("source")?.focus();
  }
  return true;
}

function openTranslationPadFromSelection(context = host().getSelectionContext()) {
  if (!context?.text) {
    host().setStatus(host().t("select_text_first"));
    return false;
  }
  const targetLanguage = host().getTranslationTargetForUi(context.text);
  if (!targetLanguage) {
    host().setStatus(host().t("translation_already_interface_language"));
    return false;
  }
  return openTranslationPad({
    source: context.text,
    sourceLabel: host().selectionLabel(context),
    inputTarget: context.inputTarget || null,
    selectionRange: typeof context.start === "number" && typeof context.end === "number"
      ? { start: context.start, end: context.end }
      : null,
  });
}

async function translateTranslationPadSource() {
  const source = padEl("source")?.value.trim() || "";
  if (!source) {
    translationPadSetStatus("translation_pad_empty");
    updateTranslationPadButtons();
    return;
  }
  const targetLanguage = host().getTranslationTargetForUi(source);
  if (!targetLanguage) {
    translationPadSetStatus("translation_already_interface_language");
    host().setStatus(host().t("translation_already_interface_language"));
    updateTranslationPadButtons();
    return;
  }

  translationPadSourceText = source;
  translationPadTargetLanguage = targetLanguage;
  if (padEl("target")) padEl("target").textContent = translationPadTargetLabel(targetLanguage);
  if (!host().beginLongTask("translate-selection", host().t("translating_selection"))) return;
  if (padEl("translate")) padEl("translate").disabled = true;
  translationPadSetStatus("translating_selection");

  // A pad answer belongs to the text it was asked about. Clearing the pad or
  // starting a second translation makes this run's answer stale, and a stale
  // answer landing last would replace the newer one: only the run that is still
  // current may write into the pad.
  const runId = (translationPadRunId += 1);
  const runIsStillCurrent = () => runId === translationPadRunId;

  try {
    const translated = await host().translateText(source, targetLanguage, {
      preserveMarkdown: true,
      title: translationPadSourceLabel || "",
      onProgress: (partial) => {
        if (!runIsStillCurrent()) return;
        translationPadTranslatedText = partial;
        if (padEl("result")) padEl("result").value = partial;
        translationPadSetStatus("translating_selection");
      },
    });
    if (!runIsStillCurrent()) {
      translationPadSetStatus("translation_pad_result_superseded");
      return;
    }
    translationPadTranslatedText = translated.trim();
    if (padEl("result")) padEl("result").value = translationPadTranslatedText;
    translationPadSetStatus("ready");
    host().setStatus(host().t("translation_pad_translated"));
  } catch (error) {
    if (!host().isAbortError(error)) {
      translationPadSetStatus("translation_failed", host().friendlyErrorDetail(error));
      host().setStatus(host().t("translation_failed", host().friendlyErrorDetail(error)));
    }
  } finally {
    host().endLongTask("translate-selection");
    updateTranslationPadButtons();
  }
}

function translationPadMetadataLine() {
  return `[${host().formatTranslationMeta(
    translationPadTargetLanguage || translationPadUiTargetLanguage(),
    new Date().toISOString(),
    translationPadSourceLabel || host().t("translation_pad"),
    host().currentTranslationModel()
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
  host().setStatus(replace ? host().t("translation_pad_replaced") : host().t("translation_pad_inserted"));
  return true;
}

function sendTranslationPadToTeachText() {
  const translated = translationPadTranslatedText.trim();
  if (!translated) return;
  sendTextToDestination(translated, "teachtext");
  host().setStatus(host().t("translation_pad_sent_teachtext"));
}

function sendTranslationPad() {
  const translated = translationPadTranslatedText.trim();
  if (!translated) return;
  if (translationPadCanWriteToSource()) {
    host().writeToSource({ replace: true });
    return;
  }
  host().sendToTeachText();
}

// The pad's controls, bound once per mount cycle and released together. Like
// ClioPaint, it uses the shared instance registry rather than its own boolean
// and its own addEventListener calls, so a real destroy gives the listeners
// back and the next mount binds again.
let translationPadResources = window.AISystem6InstanceResources.create("translationPad");

function translationPadInstanceResources() {
  if (translationPadResources.disposed) {
    translationPadResources = window.AISystem6InstanceResources.create("translationPad");
  }
  return translationPadResources;
}

function mountTranslationPadRuntime() {
  if (translationPadMounted) return true;
  translationPadMounted = true;
  const resources = translationPadInstanceResources();
  resources.listen(padEl("source"), "input", syncTranslationPadStateFromInputs);
  resources.listen(padEl("result"), "input", syncTranslationPadStateFromInputs);
  resources.listen(padEl("clear"), "click", clearTranslationPad);
  resources.listen(padEl("translate"), "click", translateTranslationPadSource);
  resources.listen(padEl("send"), "click", sendTranslationPad);
  return true;
}

let translationPadMounted = false;

/** Release the pad's bindings. Hiding the window is not destroying it. */
function disposeTranslationPad() {
  translationPadMounted = false;
  return translationPadResources.dispose("translation-pad-disposed");
}

window.AISystem6TranslationPad = Object.freeze({
  open: openTranslationPad,
  mount: mountTranslationPadRuntime,
  dispose: disposeTranslationPad,
  translate: () => translateTranslationPadSource(),
  /**
   * Run this same component under another host — the development preview does.
   * The host names the root the markup lives in, the elements inside it, and the
   * services the pad does not own. `null` puts the desk back.
   */
  useHost: (host = null) => {
    translationPadHostOverride = host;
    return translationPadHost();
  },
  host: () => translationPadHost(),
  clear: clearTranslationPad,
  syncFromInputs: syncTranslationPadStateFromInputs,
  canWriteToSource: () => translationPadCanWriteToSource(),
  send: sendTranslationPad,
  /** Diagnostics: how many bindings this instance still holds. */
  resourceCount: () => (translationPadResources.disposed ? 0 : translationPadResources.size),
});

window.AISystem6Runtime?.registerApplication({id:"translationPad",windowName:"translationPad",mount:mountTranslationPadRuntime,restore:()=>mountTranslationPadRuntime(),commands:{"open-translation-pad":{handler:()=>openTranslationPad(),isAvailable:()=>!0}}});
