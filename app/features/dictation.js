// Feature module: dictation.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



function setDictationDestination(dest) {
  const validDestinations = new Set(["teachtext", "assistant", "questionSheet", "scrapbook", "notepad"]);
  dictationIntentDestination = validDestinations.has(dest) ? dest : "assistant";
  const label = dictationDestinationLabel(dictationIntentDestination);
  const inputLabel = dictationInputTarget ? getInputTargetLabel(dictationInputTarget) : label;
  dictationIntentTargetEl.textContent = t("intent_target", inputLabel);
}

let dictationFieldButton = null;
let dictationFieldButtonTarget = null;
let dictationFieldButtonHideTimer = null;

function getEditableTextTarget(target) {
  if (!target) return null;
  if (target.closest?.('[data-dictation="off"]')) return null;

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    if (target.readOnly || target.disabled || target.closest(".dictation-window")) return null;
    if (["button", "checkbox", "file", "hidden", "radio", "range", "submit"].includes(target.type)) return null;
    return target;
  }

  const editable = target.closest?.("[contenteditable='true'], [contenteditable='']");
  if (!editable || editable.closest(".dictation-window")) return null;
  return editable;
}

function isVisibleTextTarget(target) {
  if (!target) return false;
  if (
    document.body.classList.contains("is-booting")
    || document.body.classList.contains("is-shutting-down")
    || document.body.classList.contains("has-system-modal")
  ) return false;
  if (target.hidden || target.closest?.("[hidden], .is-hidden, .is-app-hidden")) return false;
  const win = target.closest?.(".window");
  if (win?.classList.contains("is-collapsed")) return false;
  return (target.getClientRects?.().length || 0) > 0;
}

function getVisibleEditableTextTarget(target) {
  const textTarget = getEditableTextTarget(target);
  return isVisibleTextTarget(textTarget) ? textTarget : null;
}

function rangeBelongsToTarget(range, target) {
  if (!range || !target) return false;
  const node = range.commonAncestorContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return element === target || target.contains(element);
}

function rememberEditableRange(target) {
  if (!(target instanceof HTMLElement) || !target.isContentEditable) return;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (rangeBelongsToTarget(range, target)) {
    lastEditableRange = range.cloneRange();
  }
}

function getInputTargetLabel(target) {
  if (!target) return dictationDestinationLabel(dictationIntentDestination);

  const labelsById = {
    prompt: t("assistant_prompt"),
    "teachtext-body": t("teachtext_insertion"),
    "question-sheet-body": t("question_sheet"),
    "outline-content": t("outline"),
    "draft-body": t("section_draft"),
    "scrap-body-input": t("scrapbook_note"),
    "note-pad-text": t("note_pad"),
  };
  if (labelsById[target.id]) return labelsById[target.id];
  if (target.closest?.("[data-outline-section]")) return t("outline");

  const explicit = target.dataset.dictationLabel || target.getAttribute("aria-label");
  if (explicit) return explicit;

  const label = target.id ? document.querySelector(`label[for="${CSS.escape(target.id)}"] span, label[for="${CSS.escape(target.id)}"]`) : null;
  if (label?.textContent?.trim()) return label.textContent.trim();

  const windowEl = target.closest(".window");
  const title = windowEl?.querySelector(".title-bar h1, .title-bar h2")?.textContent?.trim();
  return title || dictationDestinationLabel(dictationIntentDestination);
}

function destinationForInputTarget(target) {
  const windowName = target?.closest(".window")?.dataset.window;
  const fieldDestinations = {
    prompt: "assistant",
    "teachtext-body": "teachtext",
    "question-sheet-body": "questionSheet",
    "outline-content": "questionSheet",
    "draft-body": "teachtext",
    "scrap-body-input": "scrapbook",
    "note-pad-text": "notepad",
  };
  const windowDestinations = {
    assistant: "assistant",
    teachText: "teachtext",
    questionSheet: "questionSheet",
    scrapbook: "scrapbook",
    notePad: "notepad",
  };
  return fieldDestinations[target?.id] || windowDestinations[windowName] || null;
}

function rememberTextTarget(target) {
  const textTarget = getVisibleEditableTextTarget(target);
  if (!textTarget) return;
  lastTextTarget = textTarget;
  rememberEditableRange(textTarget);
}

function ensureDictationFieldButton() {
  if (dictationFieldButton) return dictationFieldButton;
  dictationFieldButton = document.createElement("button");
  dictationFieldButton.type = "button";
  dictationFieldButton.id = "dictation-field-button";
  dictationFieldButton.className = "dictation-field-button is-hidden";
  dictationFieldButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  dictationFieldButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = getVisibleEditableTextTarget(dictationFieldButtonTarget) || getCurrentInputTarget();
    if (!target) {
      hideDictationFieldButton();
      return;
    }
    rememberTextTarget(target);
    const dest = openDictationPad({ target });
    setStatus(t("intent_ready", getInputTargetLabel(target) || dictationDestinationLabel(dest)));
    hideDictationFieldButton();
  });
  document.body.appendChild(dictationFieldButton);
  return dictationFieldButton;
}

function updateDictationFieldButtonLabel() {
  const button = ensureDictationFieldButton();
  const title = t("compose_voice_input");
  button.textContent = title;
  button.title = title;
  button.setAttribute("aria-label", title);
}

function hideDictationFieldButton() {
  if (!dictationFieldButton) return;
  dictationFieldButton.classList.add("is-hidden");
  dictationFieldButtonTarget = null;
}

function scheduleDictationFieldButtonHide() {
  window.clearTimeout(dictationFieldButtonHideTimer);
  dictationFieldButtonHideTimer = window.setTimeout(() => {
    const activeTarget = getVisibleEditableTextTarget(document.activeElement);
    if (!activeTarget) hideDictationFieldButton();
  }, 120);
}

function hasAdjacentControlToRight(rect, buttonWidth) {
  const probeX = rect.right + Math.min(buttonWidth, 56) / 2 + 6;
  const probeY = rect.top + Math.min(rect.height - 2, 18);
  if (probeX >= window.innerWidth || probeY >= window.innerHeight) return false;
  const element = document.elementFromPoint(probeX, probeY);
  return !!element?.closest?.("button, [role='button'], input[type='button'], input[type='submit']");
}

// Dictation positions a floating control against an editable field and needs
// strict inset overlap semantics. The window manager owns the gap-based
// rectsOverlap; the concatenated bundle keeps only one definition per name, so
// this one must not share that name.
function dictationRectsOverlap(a, b, inset = 0) {
  return a.left < b.right - inset
    && a.right > b.left + inset
    && a.top < b.bottom - inset
    && a.bottom > b.top + inset;
}

function dictationButtonWouldCoverControl(candidate, target) {
  const candidateRect = {
    left: candidate.left,
    top: candidate.top,
    right: candidate.left + candidate.width,
    bottom: candidate.top + candidate.height,
  };
  const controls = document.querySelectorAll("button, [role='button'], summary, select, input[type='button'], input[type='submit']");
  return [...controls].some((control) => {
    if (control === dictationFieldButton || control === target || target.contains?.(control)) return false;
    if (control.closest?.(".is-hidden") || control.hidden || control.disabled) return false;
    const rect = control.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return dictationRectsOverlap(candidateRect, rect, 2);
  });
}

function positionDictationFieldButton(target = dictationFieldButtonTarget) {
  const textTarget = getVisibleEditableTextTarget(target);
  if (!textTarget || textTarget.closest(".is-hidden")) {
    hideDictationFieldButton();
    return;
  }

  const rect = textTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    hideDictationFieldButton();
    return;
  }

  const button = ensureDictationFieldButton();
  updateDictationFieldButtonLabel();
  dictationFieldButtonTarget = textTarget;

  const gap = 4;
  const margin = 4;
  const buttonWidth = button.offsetWidth || 48;
  const buttonHeight = button.offsetHeight || 28;
  const canSitOutside = window.innerWidth - rect.right >= buttonWidth + gap + margin;
  const rightSideHasControl = hasAdjacentControlToRight(rect, buttonWidth);
  const candidates = [
    !rightSideHasControl && canSitOutside
      ? { left: rect.right + gap, top: rect.top + gap, width: buttonWidth, height: buttonHeight }
      : null,
    { left: rect.right - buttonWidth - gap, top: rect.top - buttonHeight - gap, width: buttonWidth, height: buttonHeight },
    { left: rect.right - buttonWidth - gap, top: rect.top + gap, width: buttonWidth, height: buttonHeight },
    rect.left >= buttonWidth + gap + margin
      ? { left: rect.left - buttonWidth - gap, top: rect.top + gap, width: buttonWidth, height: buttonHeight }
      : null,
    canSitOutside
      ? { left: rect.right + gap, top: rect.top + gap, width: buttonWidth, height: buttonHeight }
      : null,
  ].filter(Boolean);

  const clampedCandidates = candidates.map((candidate) => ({
    ...candidate,
    left: clampNumber(candidate.left, margin, Math.max(margin, window.innerWidth - buttonWidth - margin)),
    top: clampNumber(candidate.top, 28, Math.max(28, window.innerHeight - buttonHeight - margin)),
  }));
  const selected = clampedCandidates.find((candidate) => !dictationButtonWouldCoverControl(candidate, textTarget))
    || clampedCandidates[0]
    || {
      left: clampNumber(rect.right - buttonWidth - gap, margin, Math.max(margin, window.innerWidth - buttonWidth - margin)),
      top: clampNumber(rect.top + gap, 28, Math.max(28, window.innerHeight - buttonHeight - margin)),
    };

  button.style.left = `${selected.left}px`;
  button.style.top = `${selected.top}px`;
  button.classList.remove("is-hidden");
}

function showDictationFieldButtonForTarget(target) {
  const textTarget = getVisibleEditableTextTarget(target);
  if (!textTarget) {
    scheduleDictationFieldButtonHide();
    return;
  }
  window.clearTimeout(dictationFieldButtonHideTimer);
  rememberTextTarget(textTarget);
  positionDictationFieldButton(textTarget);
}

function getCurrentInputTarget() {
  const activeTarget = getVisibleEditableTextTarget(document.activeElement);
  if (activeTarget) return activeTarget;
  const previousTarget = document.contains(lastTextTarget) ? getVisibleEditableTextTarget(lastTextTarget) : null;
  if (previousTarget) return previousTarget;
  lastTextTarget = null;
  return null;
}

function defaultInputTargetForDestination(dest) {
  if (dest === "assistant") return promptInput;
  if (dest === "teachtext") return teachTextBodyInput;
  if (dest === "questionSheet") return questionSheetBodyInput;
  if (dest === "scrapbook") return scrapBodyInput;
  if (dest === "notepad") return notePadTextInput;
  return null;
}

function insertTextIntoInputTarget(target, text) {
  if (!target || !text) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    target.focus();
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (!(target instanceof HTMLElement) || !target.isContentEditable) return false;

  target.focus();
  const selection = window.getSelection();
  const range = lastEditableRange && rangeBelongsToTarget(lastEditableRange, target)
    ? lastEditableRange.cloneRange()
    : document.createRange();

  if (!lastEditableRange || !rangeBelongsToTarget(lastEditableRange, target)) {
    range.selectNodeContents(target);
    range.collapse(false);
  }

  selection.removeAllRanges();
  selection.addRange(range);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  lastEditableRange = range.cloneRange();
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function inferDictationDestination() {
  const inputTarget = getCurrentInputTarget();
  const inputDestination = destinationForInputTarget(inputTarget);
  if (inputDestination) return inputDestination;

  const activeWindow = document.querySelector(".window.is-active:not(.is-hidden)");
  const windowName = activeWindow?.dataset.window;
  const windowDestinations = {
    teachText: "teachtext",
    assistant: "assistant",
    questionSheet: "questionSheet",
    outline: "questionSheet",
    sectionDrafts: "teachtext",
    claimCheck: "teachtext",
    scrapbook: "scrapbook",
    notePad: "notepad",
  };

  return windowDestinations[windowName] || (writerMode ? "teachtext" : "assistant");
}

function openDictationPad(options = {}) {
  dictationInputTarget = getVisibleEditableTextTarget(options.target) || getCurrentInputTarget();
  const dest = options.dest || destinationForInputTarget(dictationInputTarget) || inferDictationDestination();
  dictationInputTarget = dictationInputTarget || getVisibleEditableTextTarget(defaultInputTargetForDestination(dest));
  setDictationDestination(dest);
  openWindow("dictation");
  dictationRawInput.focus();
  return dest;
}

function invokeIntentKey() {
  const dest = openDictationPad();
  setStatus(t("intent_ready", dictationDestinationLabel(dest)));
}

function startDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setStatus("Speech recognition not supported in this browser.");
    return;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.lang = currentLanguage === "zh" ? "zh-CN" : "en-US";

  speechRecognition.onstart = () => {
    dictationStatusEl.textContent = t("listening");
    dictationRecordButton.disabled = true;
    dictationStopButton.disabled = false;
  };

  speechRecognition.onresult = (event) => {
    let interimTranscript = "";
    let finalTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    if (finalTranscript) {
      dictationRawInput.value += (dictationRawInput.value ? " " : "") + finalTranscript;
      updateDictationTranscriptButtons();
    }
  };

  speechRecognition.onerror = (event) => {
    console.error("Speech recognition error", event.error);
    stopDictation();
  };

  speechRecognition.onend = () => {
    stopDictation();
  };

  speechRecognition.start();
}

function stopDictation() {
  if (speechRecognition) {
    speechRecognition.stop();
    speechRecognition = null;
  }
  dictationStatusEl.textContent = t("ready");
  dictationRecordButton.disabled = false;
  dictationStopButton.disabled = true;
  updateDictationTranscriptButtons();
}

function hasDictationTranscript() {
  return !!(dictationRawInput.value.trim() || dictationCleanedInput.value.trim());
}

function updateDictationTranscriptButtons() {
  const hasRaw = !!dictationRawInput.value.trim();
  const hasAny = hasDictationTranscript();
  dictationCleanButton.disabled = !hasRaw || !!speechRecognition;
  dictationClearButton.disabled = !hasAny || !!speechRecognition;
  dictationSendButton.disabled = !hasAny;
}

function clearDictationTranscript() {
  dictationRawInput.value = "";
  dictationCleanedInput.value = "";
  updateDictationTranscriptButtons();
  dictationStatusEl.textContent = t("ready");
}

function dictationCleanProfile(dest = dictationIntentDestination) {
  const profiles = {
    assistant: {
      zh: "整理成可以发给 ClioTalk 的清楚问题或请求。保留说话者自己的判断、犹豫和限制；不要替说话者扩写成完整方案。",
      en: "Shape it into a clear question or request for ClioTalk. Keep the speaker's judgment, hesitations, and limits; do not expand it into a full answer.",
    },
    questionSheet: {
      zh: "整理成 Question Sheet 上游意图。可用普通短行保留：真实问题、收件人、反对意见、必须记住的点、术语区分、交付摩擦、输出规则。它们只是可保留的线索，不是必须输出的栏目。不要加 # Question Sheet、粗体标签、表格或空栏目。",
      en: "Shape it into upstream Question Sheet intent. Use plain short lines to preserve real questions, recipient, objections, must-remember points, term distinctions, handoff friction, and output rules. These are possible clues, not required headings. Do not add a # Question Sheet heading, bold labels, tables, or empty sections.",
    },
    teachtext: {
      zh: "整理成可以插入 TeachText 的正文草稿。保持第一人称、具体细节和不确定处；只修转写错误、标点和段落，不新增事实或论点。",
      en: "Shape it into manuscript text suitable for TeachText. Keep first person, concrete details, and uncertainty; only fix STT errors, punctuation, and paragraphing, without adding facts or claims.",
    },
    scrapbook: {
      zh: "整理成 Scrapbook 笔记。保留可追溯的观察、引用感强的原话和来源线索；不要把它扩写成文章或总结。",
      en: "Shape it into a Scrapbook note. Preserve traceable observations, quote-like phrasing, and source leads; do not expand it into an article or summary.",
    },
    notepad: {
      zh: "轻度整理成个人便签。保留跳跃、未完成想法和粗糙表达，只让它更容易回看。",
      en: "Lightly clean it as a private note. Keep jumps, unfinished thoughts, and rough phrasing; only make it easier to revisit.",
    },
  };
  return profiles[dest] || profiles.assistant;
}

function buildDictationCleanMessages(raw, options = {}) {
  const dest = options.dest || dictationIntentDestination || "assistant";
  const targetLabel = options.targetLabel || dictationDestinationLabel(dest);
  const isChinese = currentLanguage === "zh";
  const profile = dictationCleanProfile(dest);
  const language = isChinese ? "zh" : "en";
  const projectId = typeof activeProjectId === "undefined" ? null : activeProjectId;
  const resolved = window.AISystem6PromptFilesRuntime?.resolvePromptFile?.("other-apps.dictation-clean", projectId, language);
  const record = window.AISystem6PromptFiles?.find?.((item) => item.id === "other-apps.dictation-clean");
  const base = resolved?.status === "ready"
    ? resolved.body
    : (isChinese ? record?.body : record?.en) || "";
  window.AISystem6PromptFilesRuntime?.recordPromptRun?.(projectId, "other-apps.dictation-clean", resolved);
  const system = [
    base,
    isChinese ? `目标位置：${targetLabel}` : `Target surface: ${targetLabel}`,
    isChinese ? profile.zh : profile.en,
    isChinese
      ? "只返回整理后的正文，不要解释过程，不要加代码围栏。"
      : "Return only the cleaned text. Do not explain your process. Do not use code fences.",
  ].filter(Boolean).join("\n");
  const user = isChinese
    ? `原始听写文本：\n${raw}`
    : `Raw dictation transcript:\n${raw}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

async function cleanTranscript() {
  const raw = dictationRawInput.value.trim();
  if (!raw) return;

  dictationCleanButton.disabled = true;
  dictationStatusEl.textContent = t("cleaning_transcript");

  try {
    const targetLabel = dictationInputTarget
      ? getInputTargetLabel(dictationInputTarget)
      : dictationDestinationLabel(dictationIntentDestination);

    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages(buildDictationCleanMessages(raw, {
        dest: dictationIntentDestination,
        targetLabel,
      })),
      temperature: 0.25,
      max_tokens: 900,
      ai_system6_task_kind: "dictation-clean",
    }, getLongTaskSignal());

    const data = await readChatJson(response);
    const cleaned = data?.choices?.[0]?.message?.content;

    if (cleaned) {
      dictationCleanedInput.value = cleaned.trim();
      updateDictationTranscriptButtons();
    }
  } catch (error) {
    console.error("Clean transcript failed", error);
    setStatus(t("reader_error", error.message));
  } finally {
    updateDictationTranscriptButtons();
    dictationStatusEl.textContent = t("ready");
  }
}

function sendTranscript() {
  const text = dictationCleanedInput.value.trim() || dictationRawInput.value.trim();
  if (!text) return;
  if (dictationInputTarget && insertTextIntoInputTarget(dictationInputTarget, text)) {
    const label = getInputTargetLabel(dictationInputTarget);
    if (dictationInputTarget === teachTextBodyInput) {
      markTeachTextModified();
    }
    setStatus(t("dictation_inserted", label));
    clearDictationTranscript();
    return;
  }

  setStatus(t("select_text_first"));
}
