// Feature module: dictation-pad — the Dictation Pad window.
//
// Lazy on purpose. The field-targeting service in dictation.js is what the desk
// needs at boot; this is the long-dump surface for when there is no field to
// speak into, and it costs nothing until the window is opened.
//
// Every entry point into this half goes through withDictationPad() in the
// service, because a bare reference to one of these functions resolves at boot
// and takes the whole action registry down with it.

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
  dictationShapeButton.disabled = !hasRaw || !!speechRecognition;
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

// Shape is the other half of Organize, and the half that needs nothing: no
// model, no network, no waiting. It gives ten minutes of talking paragraphs, a
// list where the speaker counted things off, and a question with its answer
// under it — and it changes not one word, which app/core/dictation-shape.js
// proves before anything lands.
//
// The transcript is rewritten in place because nothing in it changes except
// where the lines break. It goes through mdeApply, i.e.
// execCommand("insertText"), so the field's own undo puts the run-on back with
// one Cmd+Z, like any other edit the writer made.
function shapeDictationTranscript() {
  const raw = dictationRawInput.value;
  if (!raw.trim() || speechRecognition) return;

  const shaped = shapeDictationText(raw);
  // The gate said no. Nothing lands, and the pad says why rather than leaving
  // the writer to compare two long transcripts by eye.
  if (shaped === null) {
    dictationStatusEl.textContent = t("dictation_shape_refused");
    return;
  }
  if (shaped === raw) {
    dictationStatusEl.textContent = t("dictation_shape_none");
    return;
  }

  // Back to the top afterwards: the writer pressed this to see a shape, and
  // replacing the whole field would otherwise leave them at the far end of it.
  mdeApply(dictationRawInput, { from: 0, to: raw.length, insert: shaped, selStart: 0 });
  dictationRawInput.scrollTop = 0;
  updateDictationTranscriptButtons();
  dictationStatusEl.textContent = t("dictation_shaped", dictationShapeBlockCount(shaped));
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

  // With no field to speak into, Send used to do nothing at all: the message
  // went to a status line inside ClioTalk, which is usually closed, and the
  // writer's sentence sat there unmoved. A spoken thought is never dropped —
  // it goes to the pad that always exists, which is also where it can be
  // picked up later.
  appendToNotePad(text);
  setStatus(t("dictation_inserted", t("note_pad")));
  clearDictationTranscript();
}

window.AISystem6DictationPadLoaded = true;
