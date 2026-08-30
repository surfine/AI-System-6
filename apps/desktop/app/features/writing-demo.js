// Feature module: writing-demo.

// Loaded lazily as a classic script; shares the AI System 6 global scope.

let writingDemoRun = null;

let writingDemoCorpus = window.AISystem6EvergreenDemoCorpus || {};
let writingDemoCorpusPromise = null;

function writingDemoLanguage() {
  return currentLanguage === "zh" ? "zh" : "en";
}

function writingDemoBilingual(zh, en) {
  return writingDemoLanguage() === "zh" ? zh : en;
}

function writingDemoCorpusText(value, fallbackZh = "", fallbackEn = fallbackZh) {
  const language = writingDemoLanguage();
  if (value && typeof value === "object") return String(value[language] || value.zh || value.en || (language === "zh" ? fallbackZh : fallbackEn));
  return String(value || (language === "zh" ? fallbackZh : fallbackEn));
}

function writingDemoFallbackCorpus() {
  return {
    id: "ai-system6-development-story-fallback",
    version: 0,
    projectName: { zh: "演示项目 - 当聊天框装不下一篇文章", en: "Live Demo - When Chat Cannot Hold an Article" },
    sourceFileName: { zh: "AI System 6 开发记（示范来源）", en: "AI System 6 Development Story (Demo Source)" },
    manuscriptTitle: { zh: "当聊天框装不下一篇文章", en: "When Chat Cannot Hold an Article" },
    finalExportTitle: { zh: "当聊天框装不下一篇文章 - 定稿", en: "When Chat Cannot Hold an Article - Final" },
    shortIntent: {
      zh: "解释为什么 AI 写作需要一台电脑，而不只是更长的聊天框。",
      en: "Explain why AI writing needs a computer rather than a longer chat box.",
    },
    followupQuestions: {
      zh: ["这篇稿子的开头应该留下哪两个动作？", "哪些技术判断必须保留来源边界？"],
      en: ["Which two actions should remain in the opening?", "Which technical judgments need their source boundary?"],
    },
    artifacts: {
      article: {
        zh: "# 当聊天框装不下一篇文章\n\n聊天只是一款应用。来源、问题、大纲、正文与交付物应该各有位置。模型结果先保持临时，直到用户明确保存、摘录、插入或导出。作者不只是验收员；亲眼看到的细节、犹豫和判断，本来就是文章的一部分。",
        en: "# When a Chat Box Cannot Hold an Article\n\nChat is one application. Sources, questions, outline, manuscript, and handoff need different places. Model output remains temporary until the writer saves, clips, inserts, or exports it. A writer is not merely an approver; witnessed detail, hesitation, and judgment belong to the work.",
      },
      outline: {
        zh: "# 当聊天框装不下一篇文章\n\n## 聊天只是一款应用\n\n## 出现过与保存过\n\n## 作者仍然在写",
        en: "# When Chat Cannot Hold an Article\n\n## Chat Is One Application\n\n## Seen and Saved\n\n## The Writer Still Writes",
      },
      clippings: {
        zh: [{ title: "出现过与保存过", text: "屏幕上出现过，和电脑已经保存，是两件不同的事。" }],
        en: [{ title: "Seen and saved", text: "Appearing on screen and being saved by the computer are different events." }],
      },
      teaserManuscript: {
        zh: "# 屏幕上出现过，不等于已经保存\n\n聊天只是一款应用。模型结果先停在临时状态，明确写入后才成为项目的一部分。",
        en: "# Appearing on Screen Is Not the Same as Being Saved\n\nChat is one application. Model output remains temporary until an explicit write makes it part of the project.",
      },
    },
  };
}

async function writingDemoEnsureCorpus() {
  if (window.AISystem6EvergreenDemoCorpus) {
    writingDemoCorpus = window.AISystem6EvergreenDemoCorpus;
    return writingDemoCorpus;
  }
  if (typeof loadClassicScriptOnce !== "function") {
    writingDemoCorpus = writingDemoFallbackCorpus();
    return writingDemoCorpus;
  }
  writingDemoCorpusPromise ||= loadClassicScriptOnce("app/data/evergreen-demo-corpus.js")
    .then(() => {
      writingDemoCorpus = window.AISystem6EvergreenDemoCorpus || writingDemoFallbackCorpus();
      return writingDemoCorpus;
    })
    .catch((error) => {
      writingDemoCorpusPromise = null;
      console.warn("Evergreen demo corpus could not load; using the compact fallback.", error);
      writingDemoCorpus = writingDemoFallbackCorpus();
      return writingDemoCorpus;
    });
  return writingDemoCorpusPromise;
}

function writingDemoScriptSteps() {
  return [
  {
    id: "sources",
    title: writingDemoBilingual("来源进入项目", "Source Enters the Project"),
    userVisiblePurpose: writingDemoBilingual("先让一篇完整文章成为项目文件，不从一次易逝的网页搜索开始。", "Begin with a complete article as a project file, not an expiring web search."),
    windows: [{ name: "teachText", slot: "wide" }],
    expectedVisibleChange: writingDemoBilingual("内置开发记作为有出处的示范来源打开。", "The built-in development story opens as a sourced demo document."),
    failureMessage: writingDemoBilingual("示范来源没有成为项目文件。", "The demo source did not become a project file."),
  },
  {
    id: "reader",
    title: writingDemoBilingual("阅读变成摘录", "Reading Becomes Clippings"),
    userVisiblePurpose: writingDemoBilingual("Reader 负责读来源，Scrapbook 只留下作者明确选择的片段。", "Reader holds the source; Scrapbook keeps only passages the writer explicitly chooses."),
    windows: [{ name: "reader", slot: "wide" }],
    expectedVisibleChange: writingDemoBilingual("开发记打开，关键片段带着 corpus 来源进入 Scrapbook。", "The story opens and selected passages enter Scrapbook with corpus provenance."),
    failureMessage: writingDemoBilingual("Reader 没有生成可用摘录。", "Reader did not produce usable clippings."),
  },
  {
    id: "scrapbook",
    title: writingDemoBilingual("材料篮送入写作", "The Material Basket Enters Writing"),
    userVisiblePurpose: writingDemoBilingual("Scrapbook 不是临时便签，它把被选中的来源片段送进写作对象链。", "Scrapbook is not a scratch pad; it sends selected source passages into the writing route."),
    windows: [{ name: "scrapbook", slot: "wide" }],
    expectedVisibleChange: writingDemoBilingual("来源摘录被选中并送到问题单。", "Source clippings are selected and sent to Question Sheet."),
    failureMessage: writingDemoBilingual("Scrapbook 没有把材料送入问题单。", "Scrapbook did not send material to Question Sheet."),
  },
  {
    id: "questionSheet",
    title: writingDemoBilingual("素材变成问题单", "Material Becomes a Question Sheet"),
    userVisiblePurpose: writingDemoBilingual("问题单把来源、真实接收者、原始问题和事实边界放到同一个对象里。", "Question Sheet holds sources, the real recipient, original questions, and factual boundaries together."),
    windows: [{ name: "questionSheet", slot: "wide" }],
    expectedVisibleChange: writingDemoBilingual("一次短听写进入问题单，并被模型整理成写作任务。", "A short dictation enters Question Sheet and is organized into a writing job."),
    failureMessage: writingDemoBilingual("问题单没有形成可用写作边界。", "Question Sheet did not form a usable writing boundary."),
  },
  {
    id: "outline",
    title: writingDemoBilingual("作者结构进入大纲", "The Writer's Structure Enters Outline"),
    userVisiblePurpose: writingDemoBilingual("问题单提供边界；大纲保留作者已经给定的章节顺序。", "Question Sheet supplies the boundary while Outline keeps the writer's chosen order."),
    windows: [{ name: "outline", slot: "wide" }],
    expectedVisibleChange: writingDemoBilingual("开发记大纲进入 Outline，并接受一次通用结构检查。", "The development-story outline enters Outline and receives one generic structure pass."),
    failureMessage: writingDemoBilingual("给定大纲没有形成可起草结构。", "The supplied outline did not form a draftable structure."),
  },
  {
    id: "sectionDrafts",
    title: writingDemoBilingual("逐节推敲", "Work One Section at a Time"),
    userVisiblePurpose: writingDemoBilingual("章节草稿只精演两节：一节从无到有，一节在作者材料上润色。", "Section Drafts demonstrates two sections: one drafted from nothing and one polished from writer material."),
    windows: [{ name: "sectionDrafts", slot: "wide" }],
    expectedVisibleChange: writingDemoBilingual("第 1 节出现草稿，第 2 节出现润色后的保留。", "Section 1 gains a draft and Section 2 keeps usable text after polishing."),
    failureMessage: writingDemoBilingual("章节草稿没有展示真实逐节处理。", "Section Drafts did not demonstrate real section work."),
  },
  {
    id: "teachText",
    title: writingDemoBilingual("章节合成正文", "Sections Become the Manuscript"),
    userVisiblePurpose: writingDemoBilingual("TeachText 承接章节草稿；正文是项目对象，不是聊天记录。", "TeachText receives the sections; the manuscript is a project object, not a chat reply."),
    windows: [{ name: "outline", slot: "leftNarrow" }, { name: "teachText", slot: "rightWide" }],
    expectedVisibleChange: writingDemoBilingual("章节草稿合成为一篇可编辑正文。", "Section drafts become one editable manuscript."),
    failureMessage: writingDemoBilingual("正文没有达到当前语言的可用标准。", "The manuscript did not meet the usable threshold for the current language."),
  },
  {
    id: "reviewDesk",
    title: writingDemoBilingual("定稿前审校", "Review Before Handoff"),
    userVisiblePurpose: writingDemoBilingual("审校台把“我觉得写完了”变成一次通用的风格与模型嘴替检查。", "Review Desk turns “I think it is done” into a general style and model-mouthpiece check."),
    windows: [{ name: "teachText", slot: "main" }, { name: "reviewDesk", slot: "side" }],
    expectedVisibleChange: writingDemoBilingual("Review Desk 生成鼓励与风格检查，再回到正文改稿。", "Review Desk produces encouragement and a style check before the manuscript is revised."),
    failureMessage: writingDemoBilingual("审校台没有生成真实审校结果。", "Review Desk did not produce a real review result."),
  },
  {
    id: "reuse",
    title: writingDemoBilingual("成稿继续复用", "Reuse the Finished Work"),
    userVisiblePurpose: writingDemoBilingual("Project CD 里的成稿还能被 DocMap 理解、被 ClioStage 改成提纲，并交给 ClioTalk 做后续追问。", "A Project CD manuscript can still be mapped by DocMap, shaped for ClioStage, and questioned through ClioTalk."),
    windows: [{ name: "projectCd", slot: "wide" }],
    expectedVisibleChange: writingDemoBilingual("成稿进入 Project CD，并依次打开 DocMap、ClioStage、ClioTalk。", "The manuscript enters Project CD and then opens in DocMap, ClioStage, and ClioTalk."),
    failureMessage: writingDemoBilingual("成稿复用链路没有跑通。", "The finished-work reuse chain did not complete."),
  },
  ];
}

function writingDemoSleep(ms = 260) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writingDemoPause(ms = 1200) {
  return writingDemoSleep(ms);
}

function writingDemoAssertRunning() {
  if (!writingDemoRun || writingDemoRun.stopped) throw new DOMException("Writing demo stopped", "AbortError");
}

const writingDemoManagedWindows = [
  "control",
  "saveChat",
  "projects",
  "findPath",
  "reader",
  "scrapbook",
  "dictation",
  "questionSheet",
  "outline",
  "sectionDrafts",
  "teachText",
  "reviewDesk",
  "projectCd",
  "docMap",
  "clioStage",
  "assistant",
  "contextPanel",
  "imageManager",
];

const writingDemoUserPreservedWindows = new Set(["notificationCenter"]);

function writingDemoVisibleWindowNames() {
  return Array.from(document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden)"))
    .map((win) => win.dataset.window || "")
    .filter(Boolean);
}

function writingDemoDesktopBounds() {
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect?.();
  const avoidance = typeof getDesktopAvoidanceInsets === "function"
    ? getDesktopAvoidanceInsets({ margin: 18, spineGap: 18, iconGap: 132 })
    : { left: 290, right: 150 };
  const width = desktopRect?.width || window.innerWidth;
  const height = desktopRect?.height || Math.max(620, window.innerHeight - 28);
  return {
    left: Math.max(18, avoidance.left || 18),
    top: Math.max(18, writingSpineAlignedTop?.(18) || 18),
    right: Math.max(132, avoidance.right || 132),
    bottom: Math.max(36, writingDemoCaptionAvoidanceInset()),
    width,
    height,
  };
}

function writingDemoCaptionAvoidanceInset() {
  const caption = document.querySelector(".writing-demo-caption");
  const rect = caption?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return 36;
  return Math.ceil(Math.max(36, window.innerHeight - rect.top + 18));
}

function writingDemoCaptionTopLimit() {
  const caption = document.querySelector(".writing-demo-caption");
  const rect = caption?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return 0;
  return Math.floor(rect.top - 18);
}

function writingDemoFrameFor(slot = "main") {
  const bounds = writingDemoDesktopBounds();
  const gap = 18;
  const availableWidth = Math.max(520, bounds.width - bounds.left - bounds.right - gap);
  const availableHeight = Math.max(420, bounds.height - bounds.top - bounds.bottom);
  const mainWidth = Math.min(760, Math.max(560, Math.round(availableWidth * 0.58)));
  const sideWidth = Math.max(360, availableWidth - mainWidth - gap);
  const leftNarrowWidth = Math.max(360, Math.round(availableWidth * 0.42));
  const rightWideWidth = Math.max(420, availableWidth - leftNarrowWidth - gap);

  if (slot === "side") {
    return {
      left: bounds.left + mainWidth + gap,
      top: bounds.top,
      width: sideWidth,
      height: availableHeight,
    };
  }
  if (slot === "leftNarrow") {
    return {
      left: bounds.left,
      top: bounds.top,
      width: leftNarrowWidth,
      height: availableHeight,
    };
  }
  if (slot === "rightWide") {
    return {
      left: bounds.left + leftNarrowWidth + gap,
      top: bounds.top,
      width: rightWideWidth,
      height: availableHeight,
    };
  }
  if (slot === "wide") {
    return {
      left: bounds.left,
      top: bounds.top,
      width: availableWidth,
      height: availableHeight,
    };
  }
  if (slot === "compact") {
    return {
      left: bounds.left,
      top: bounds.top,
      width: Math.min(620, availableWidth),
      height: Math.min(680, availableHeight),
    };
  }
  return {
    left: bounds.left,
    top: bounds.top,
    width: mainWidth,
    height: availableHeight,
  };
}

function writingDemoPlaceWindow(name, slot = "main") {
  const win = getWindow(name);
  if (!win) return;
  if (writingDemoRun?.windowSlots) writingDemoRun.windowSlots.set(name, slot);
  const frame = writingDemoFrameFor(slot);
  if (typeof placeWindowForExplicitLayout === "function") placeWindowForExplicitLayout(win, {
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height,
    maxHeight: "",
  });
  writingDemoClampWindowAboveCaption(win);
  if (name === "docMap") {
    requestAnimationFrame(() => {
      renderDocMap?.();
      requestAnimationFrame(() => restoreDocMapCanvasView?.());
    });
  }
}

function writingDemoClampWindowAboveCaption(win) {
  const limit = writingDemoCaptionTopLimit();
  if (!limit || !win) return;
  const rect = win.getBoundingClientRect?.();
  if (!rect || rect.height <= 0 || rect.bottom <= limit) return;
  const nextHeight = Math.max(320, Math.floor(limit - rect.top));
  if (nextHeight < rect.height && typeof setInlineStyleValue === "function") {
    setInlineStyleValue(win, "height", `${nextHeight}px`);
  }
}

function writingDemoFocusWindow(name, slot = "") {
  const win = getWindow(name);
  if (!win) return null;
  const recordedSlot = slot || writingDemoRun?.windowSlots?.get(name) || "";
  if (recordedSlot) writingDemoPlaceWindow(name, recordedSlot);
  else writingDemoClampWindowAboveCaption(win);
  focusWindow(win);
  return win;
}

function writingDemoElementIsFrontmostInWindow(element, win) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0 || !win) return false;
  const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
  const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
  const topElement = document.elementFromPoint(x, y);
  const popover = element.closest(".teachtext-command-popover, .teachtext-command-subpopover");
  return !!(topElement && (
    topElement === element
    || element.contains(topElement)
    || (popover && popover.contains(topElement))
  ));
}

async function writingDemoEnsureCommandVisible(windowName, element, options = {}) {
  const win = getWindow(windowName);
  if (!win || !element) return;
  if (writingDemoElementIsFrontmostInWindow(element, win)) return;
  writingDemoFocusWindow(windowName, options.slot || "");
  await writingDemoSleep(120);
}

function writingDemoCommandMenuCandidates(win, selectors = []) {
  return Array.from(win?.querySelectorAll?.(".teachtext-command-menu") || [])
    .map((menu) => {
      const summary = menu.querySelector("summary") || menu;
      const rect = summary.getBoundingClientRect?.();
      const visible = !!(rect && rect.width > 0 && rect.height > 0);
      const hasAction = selectors.length ? !!menu.querySelector(selectors.join(", ")) : true;
      return {
        menu,
        summary,
        visible,
        hasAction,
        frontmost: visible && writingDemoElementIsFrontmostInWindow(summary, win),
        top: rect?.top || 0,
      };
    })
    .filter((item) => item.visible && item.hasAction)
    .sort((a, b) => Number(b.frontmost) - Number(a.frontmost) || b.top - a.top);
}

function writingDemoReflowVisibleWindowsForCaption() {
  if (!writingDemoRun?.windowSlots) return;
  writingDemoVisibleWindowNames().forEach((name) => {
    const slot = writingDemoRun.windowSlots.get(name);
    const win = getWindow(name);
    if (slot && win) writingDemoPlaceWindow(name, slot);
    else if (win && writingDemoManagedWindows.includes(name)) writingDemoClampWindowAboveCaption(win);
  });
}

async function writingDemoStage(windows = [], options = {}) {
  writingDemoAssertRunning();
  await writingDemoDrainSystemModals({ timeoutMs: 2400, quietMs: 300 });
  const entries = (Array.isArray(windows) ? windows : [windows])
    .map((entry) => typeof entry === "string" ? { name: entry, slot: "main" } : entry)
    .filter((entry) => entry?.name);
  const keep = new Set(entries.map((entry) => entry.name));

  const visibleNames = new Set([...writingDemoVisibleWindowNames(), ...writingDemoManagedWindows]);
  for (const name of visibleNames) {
    if (writingDemoUserPreservedWindows.has(name)) continue;
    if (!keep.has(name)) await closeWindow(name, true);
  }

  for (const entry of entries) {
    await openWindow(entry.name, { skipFinderMode: true, skipPlacement: true });
    writingDemoPlaceWindow(entry.name, entry.slot || "main");
  }
  if (entries.length) focusWindow(getWindow(entries[entries.length - 1].name));
  await writingDemoPause(options.pauseMs ?? 1200);
}

function writingDemoClearHighlights() {
  document.querySelectorAll(".writing-demo-highlight").forEach((node) => node.remove());
}

function writingDemoClearCaption() {
  document.querySelectorAll(".writing-demo-caption").forEach((node) => node.remove());
}

function writingDemoShowCaption(text) {
  writingDemoClearCaption();
  const caption = document.createElement("div");
  caption.className = "writing-demo-caption";
  caption.textContent = text;
  caption.style.zIndex = "var(--z-demo-overlay)";
  document.body.append(caption);
  writingDemoReflowVisibleWindowsForCaption();
}

async function writingDemoHighlightElement(element, label = "", options = {}) {
  writingDemoAssertRunning();
  if (!element) return;
  writingDemoClearHighlights();
  element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  await writingDemoSleep(80);
  const rect = element.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return;
  const ring = document.createElement("div");
  ring.className = "writing-demo-highlight";
  ring.style.setProperty("left", `${Math.max(0, rect.left - 5)}px`);
  ring.style.setProperty("top", `${Math.max(0, rect.top - 5)}px`);
  ring.style.setProperty("width", `${rect.width + 10}px`);
  ring.style.setProperty("height", `${rect.height + 10}px`);
  ring.style.zIndex = "var(--z-demo-highlight)";
  if (label) {
    const tag = document.createElement("div");
    tag.className = "writing-demo-highlight-label";
    tag.textContent = label;
    ring.append(tag);
  }
  document.body.append(ring);
  await writingDemoPause(options.ms ?? 850);
  if (options.keep !== true) ring.remove();
}

function writingDemoSelectedLocalModelName() {
  return (activeChatModelIdentifier || modelInput?.value || "").trim();
}

function writingDemoHasLiveModel() {
  const selectedLocalModel = writingDemoSelectedLocalModelName();
  return !!selectedLocalModel;
}

function writingDemoIsCloudActive() {
  return typeof cloudConfig !== "undefined"
    && cloudConfig
    && cloudConfig.active
    && cloudConfig.provider
    && cloudCredentialReady()
    && cloudConfig.model;
}

function writingDemoHasConfiguredModel() {
  return writingDemoHasLiveModel() || writingDemoIsCloudActive();
}

function writingDemoAssertModelAvailable() {
  if (!writingDemoHasConfiguredModel()) {
    throw new Error(currentLanguage === "zh"
      ? "演示未检测到可用模型。请先启动 LM Studio 或配置云端模型。"
      : "No model available for the demo. Start LM Studio or configure a cloud model first.");
  }
}

function writingDemoGetModelName() {
  if (writingDemoIsCloudActive()) return (cloudConfig?.model || "").trim();
  return writingDemoSelectedLocalModelName();
}

function writingDemoModelRouteLabel() {
  const modelName = writingDemoGetModelName();
  if (writingDemoIsCloudActive()) {
    const provider = cloudConfig?.provider === "deepseek" ? "DeepSeek" : (cloudConfig?.provider || t("cloud_model"));
    return `${provider}${modelName ? ` / ${modelName}` : ""}`;
  }
  return `${t("local_lm_studio")}${modelName ? ` / ${modelName}` : ""}`;
}

function writingDemoModelProfile() {
  const modelName = writingDemoGetModelName().toLowerCase();
  const cloud = writingDemoIsCloudActive();
  const flashCloud = cloud && /(?:flash|lite|mini|small)/i.test(modelName);
  const constrained = flashCloud;
  return {
    constrained,
    organizeAttempts: constrained ? 3 : (cloud ? 2 : 1),
    organizeMaxTokens: constrained ? 760 : 650,
    organizeContextBudget: 5000,
    organizeContextTopK: 6,
    organizeContextItemLimit: 800,
    organizeTemperature: 0.25,
    organizeRetryTemperature: 0.12,
    sectionMinChars: constrained ? 180 : 260,
    sectionTimeoutMs: constrained ? 220000 : 180000,
    finalRewriteAttempts: constrained ? 4 : 2,
    finalMaxTokens: constrained ? 3200 : 2600,
    finalTemperature: 0.42,
    finalRetryTemperature: 0.28,
    assistantMaxTokens: constrained ? 220 : 260,
  };
}

async function writingDemoPreflightModel() {
  if (!writingDemoHasConfiguredModel()) {
    return {
      ok: false,
      error: new Error(currentLanguage === "zh"
        ? "实战演示需要可用模型（本地或云端）。请先启动 LM Studio 或配置云端模型。"
        : "The live demo needs an available model (local or cloud). Start LM Studio or configure a cloud model first."),
    };
  }
  const modelName = writingDemoGetModelName();
  if (!writingDemoHasLiveModel() && !writingDemoIsCloudActive()) {
    return {
      ok: false,
      error: new Error(currentLanguage === "zh"
        ? "未检测到可用本地模型名称。请先启动 LM Studio 并加载本地模型。"
        : "No local model is selected. Start LM Studio and load a local model first."),
    };
  }
  if (!modelName) {
    return {
      ok: false,
      error: new Error(currentLanguage === "zh"
        ? "未检测到可用于该模型通道的模型名称。"
        : "No usable model name is selected for the active route."),
    };
  }
  if (!beginLongTask("writing-demo-preflight", t("writing_demo_preflight"))) {
    return { ok: false, error: new Error(t("task_already_running", localModelState.task || t("working_locally"))) };
  }
  try {
    const response = await writingDemoWithTimeout(fetchModelPayload({
      model: modelName,
      messages: withMarkdownModelMessages([
        {
          role: "user",
          content: currentLanguage === "zh"
            ? "AI System 6 实战演示预检：请只回复“OK”。"
            : "AI System 6 live demo preflight: reply with OK only.",
        },
      ]),
      temperature: 0,
      max_tokens: 12,
      ai_system6_task_kind: "writing-demo-preflight",
      stream: false,
    }, getLongTaskSignal()), 30000, "writing_demo_preflight_timeout");
    const data = await readChatJson(response);
    const text = data?.choices?.[0]?.message?.content || "";
    return { ok: !!String(text).trim(), error: null };
  } catch (error) {
    activeAbortController?.abort?.();
    if (!isAbortError(error)) console.warn("Writing demo model preflight failed", error);
    return { ok: false, error };
  } finally {
    endLongTask("writing-demo-preflight");
  }
}

function writingDemoSetButtons(running) {
  document.querySelectorAll('[data-action="play-writing-demo"], [data-static-finder-action="play-writing-demo"]').forEach((button) => {
    const label = running ? t("writing_demo_stop") : t("guide_play_demo");
    // Finder items carry a leading icon span; replacing textContent wholesale
    // would erase the icon, leaving "Stop Live Demo" without one while the
    // play item keeps it. Swap only the label span when present.
    const labelEl = button.querySelector("span[data-i18n]") || button;
    labelEl.textContent = label;
    button.dataset.demoRunning = running ? "true" : "false";
  });
}

async function writingDemoNarrate(message, windowName = "") {
  writingDemoAssertRunning();
  const text = currentLanguage === "zh" ? `演示：${message}` : `Demo: ${message}`;
  setStatus(text);
  writingDemoShowCaption(text);
  await writingDemoPause(1500);
}

function writingDemoStep(id) {
  return writingDemoScriptSteps().find((step) => step.id === id) || null;
}

async function writingDemoRunScriptStep(id, action) {
  const step = writingDemoStep(id);
  if (!step) return action();
  try {
    await writingDemoNarrate(`${step.title}：${step.userVisiblePurpose}`);
    return await action(step);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error(`${step.failureMessage} ${error?.message || ""}`.trim());
  }
}

function writingDemoFormatPreflightFailures(results = []) {
  return results
    .filter((item) => !item.ok)
    .map((item) => `- ${item.label}: ${item.error?.message || item.error || "未通过"}`)
    .join("\n");
}

async function writingDemoProbeModel(label, prompt, taskKind, options = {}) {
  const modelName = writingDemoGetModelName();
  if (!modelName) return { label, ok: false, error: currentLanguage === "zh" ? "未检测到模型名称" : "No model name" };
  const controller = new AbortController();
  let timer = null;
  try {
    const response = await Promise.race([
      fetchModelPayload({
        model: modelName,
        messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens ?? 96,
        ai_system6_task_kind: taskKind,
        stream: false,
      }, controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(currentLanguage === "zh" ? "探针请求超时" : "Probe timed out"));
        }, options.timeoutMs ?? 25000);
      }),
    ]);
    const data = await readChatJson(response);
    const text = stripRebuildMarkdownFence(data?.choices?.[0]?.message?.content || "").trim();
    return { label, ok: !!text, error: text ? null : (currentLanguage === "zh" ? "模型没有返回文本" : "No model text returned") };
  } catch (error) {
    return { label, ok: false, error };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function writingDemoRunPreflight() {
  const results = [];
  setStatus(writingDemoBilingual("正在预检实战演示关键能力...", "Checking live demo prerequisites..."));
  writingDemoShowCaption(writingDemoBilingual(
    "演示预检：来源已经离线定稿；这里只确认当前模型能完成关键写作任务。",
    "Demo preflight: the source is editorially fixed offline; only the active model's writing tasks are checked."
  ));
  const model = await writingDemoPreflightModel();
  results.push({ label: writingDemoBilingual("模型通道", "Model route"), ok: model.ok, error: model.error });
  if (!model.ok) return results;
  const probe = writingDemoBilingual(
    "请用一句自然简体中文回答：OK，实战演示预检通过。",
    "Reply in one natural English sentence: OK, the live demo preflight passed."
  );
  results.push(await writingDemoProbeModel(writingDemoBilingual("问题单整理", "Question Sheet"), probe, "organize-question-sheet", { maxTokens: 64 }));
  results.push(await writingDemoProbeModel(writingDemoBilingual("章节起草", "Section Draft"), probe, "draft-section", { maxTokens: 64 }));
  results.push(await writingDemoProbeModel(writingDemoBilingual("风格审校", "Style Review"), probe, "style", { maxTokens: 64 }));
  results.push(await writingDemoProbeModel("DocMap", writingDemoBilingual("请输出极简 Markdown：# 预检\n## 主线\n- OK", "Return minimal Markdown: # Preflight\n## Through-line\n- OK"), "docmap", { maxTokens: 96 }));
  results.push(await writingDemoProbeModel("Marp", writingDemoBilingual("请输出 2 页极简 Marp Markdown，每页不超过 1 行。", "Return a minimal two-slide Marp deck, one line per slide."), "marp", { maxTokens: 160 }));
  results.push(await writingDemoProbeModel(writingDemoBilingual("ClioTalk 写作追问", "ClioTalk Follow-up"), probe, "writing-demo-rag", { maxTokens: 64 }));
  return results;
}

function stopWritingDemo() {
  if (!writingDemoRun || writingDemoRun.mode === "teaser") return;
  writingDemoStopModalAutoAccept();
  writingDemoRun.stopped = true;
  activeAbortController?.abort?.();
  writingDemoClearHighlights();
  writingDemoClearCaption();
  setStatus(t("writing_demo_stopped"));
  writingDemoSetButtons(false);
}

function writingDemoKeydown(event) {
  if (event.key !== "Escape" || !writingDemoRun) return;
  if (writingDemoRun.mode === "teaser") stopTeaserDemo();
  else stopWritingDemo();
}

function writingDemoSetTeaserButtons(running) {
  document.querySelectorAll('[data-action="play-teaser-demo"], [data-static-finder-action="play-teaser-demo"]').forEach((button) => {
    const labelEl = button.querySelector("span[data-i18n]") || button;
    labelEl.textContent = running ? t("teaser_demo_stop") : t("guide_play_teaser_demo");
    button.dataset.demoRunning = running ? "true" : "false";
  });
}

async function writingDemoTypeInto(input, text, { replace = true, delay = 4 } = {}) {
  writingDemoAssertRunning();
  if (!input) return;
  await writingDemoHighlightElement(input, currentLanguage === "zh" ? "输入" : "Type", { ms: 650 });
  input.focus();
  if (replace) input.value = "";
  for (const char of String(text || "")) {
    writingDemoAssertRunning();
    input.value += char;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (delay) await writingDemoSleep(delay);
  }
}

async function writingDemoCommandMenu(windowName, action = "", options = {}) {
  writingDemoAssertRunning();
  openWindow(windowName, { skipFinderMode: true, skipPlacement: true });
  const win = writingDemoFocusWindow(windowName, options.slot || "");
  if (!win) return;
  const menuActionMap = {
    "make-docmap": "#teachtext-docmap",
    "docmap-send-question": "#docmap-send-question",
    "docmap-hkrr-review": "#docmap-ask-hkrr",
    "docmap-insert-outline": "#docmap-insert-outline",
    "docmap-save": "#docmap-save",
  };
  const selectors = [
    action ? `[data-action="${action}"]` : "",
    action ? menuActionMap[action] : "",
    action ? `#${action}` : "",
  ].filter(Boolean);
  const menuCandidate = writingDemoCommandMenuCandidates(win, selectors)[0]
    || writingDemoCommandMenuCandidates(win)[0];
  const menu = menuCandidate?.menu;
  if (!menu) return;
  const summary = menuCandidate.summary || menu.querySelector("summary") || menu;
  await writingDemoHighlightElement(summary, currentLanguage === "zh" ? "打开命令菜单" : "Open Commands", { ms: 700 });
  writingDemoFocusWindow(windowName, options.slot || "");
  await writingDemoEnsureCommandVisible(windowName, summary, options);
  menu.open = true;
  await writingDemoSleep(120);
  const button = action ? menu.querySelector(selectors.join(", ")) : null;
  if (!button) {
    await writingDemoSleep(520);
    menu.open = false;
    return;
  }
  writingDemoFocusWindow(windowName, options.slot || "");
  await writingDemoEnsureCommandVisible(windowName, button, options);
  button.focus();
  await writingDemoHighlightElement(button, currentLanguage === "zh" ? "选择命令" : "Choose Command", { ms: 1000 });
  if (options.execute) {
    button.click();
  }
  await writingDemoPause(900);
  menu.open = false;
}

function writingDemoAcceptSystemModal() {
  if (!systemModal?.open) return false;
  systemModal.close("yes");
  return true;
}

function writingDemoShouldAutoAcceptSystemModal() {
  if (!systemModal?.open) return false;
  const text = String(systemModal.textContent || "");
  return /AI\s*(?:起草|润色|协助|整理|改写)结果/.test(text)
    || /是否替换当前(?:章节草稿|大纲|大纲窗口内容)/.test(text)
    || /铭铭视角改写后的文案/.test(text)
    || /整理后的大纲|补全后的大纲|Structured Outline|Mingming-lens rewrite/.test(text);
}

function writingDemoAutoAcceptSystemModal() {
  if (!writingDemoShouldAutoAcceptSystemModal()) return false;
  return writingDemoAcceptSystemModal();
}

function writingDemoStartModalAutoAccept() {
  if (!writingDemoRun) return;
  clearInterval(writingDemoRun.modalAutoAcceptTimer);
  writingDemoRun.modalAutoAcceptTimer = setInterval(() => {
    try {
      writingDemoAutoAcceptSystemModal();
    } catch {
      // The explicit demo waits still surface real failures.
    }
  }, 180);
}

function writingDemoStopModalAutoAccept() {
  if (!writingDemoRun?.modalAutoAcceptTimer) return;
  clearInterval(writingDemoRun.modalAutoAcceptTimer);
  writingDemoRun.modalAutoAcceptTimer = 0;
}

async function writingDemoDrainSystemModals({ timeoutMs = 5000, quietMs = 700 } = {}) {
  const startedAt = Date.now();
  let quietSince = 0;
  while (Date.now() - startedAt < timeoutMs) {
    writingDemoAssertRunning();
    if (systemModal?.open && writingDemoShouldAutoAcceptSystemModal()) {
      quietSince = 0;
      await writingDemoHighlightElement(systemModal.querySelector(".default, [value='yes'], button") || systemModal, currentLanguage === "zh" ? "确认继续" : "Confirm", { ms: 700 });
      writingDemoAutoAcceptSystemModal();
      await writingDemoSleep(260);
      continue;
    }
    if (systemModal?.open) return;
    if (!quietSince) quietSince = Date.now();
    if (Date.now() - quietSince >= quietMs) return;
    await writingDemoSleep(120);
  }
}

async function writingDemoWaitForAiResult({ timeoutMs = 140000, acceptModals = true } = {}) {
  const startedAt = Date.now();
  let sawBusy = false;
  let idleSince = 0;

  while (Date.now() - startedAt < timeoutMs) {
    writingDemoAssertRunning();
    if (acceptModals && systemModal?.open) {
      await writingDemoHighlightElement(systemModal.querySelector(".default, [value='yes'], button") || systemModal, currentLanguage === "zh" ? "确认继续" : "Confirm", { ms: 1100 });
      writingDemoAcceptSystemModal();
      idleSince = 0;
      await writingDemoSleep(220);
      continue;
    }

    const busy = !!activeAbortController
      || !!activeLongTasks?.size
      || !!localModelState?.running;
    if (busy) {
      sawBusy = true;
      idleSince = 0;
      await writingDemoSleep(260);
      continue;
    }

    idleSince = idleSince || Date.now();
    if (Date.now() - idleSince > (sawBusy ? 900 : 1200)) return true;
    await writingDemoSleep(180);
  }

  throw new Error(t("timed_out_waiting_for_model_generation"));
}

function writingDemoResultText(value) {
  return String(typeof value === "function" ? value() : value || "").trim();
}

function writingDemoLooksPending(text) {
  const value = String(text || "").trim();
  if (value.length > 140) return false;
  return /^(?:正在|等待|Reviewing|Loading|Generating|Checking|Running)|整理中|生成中/i.test(value);
}

function writingDemoLooksFailed(text) {
  return /Load failed|没有响应|Cloud API returned|LM Studio returned|connection_error|failed|失败/i.test(String(text || ""));
}

function writingDemoOutlineText() {
  return String(outlineContentEl?.value || getActiveProject()?.outline || "").trim();
}

function writingDemoDraftText(index = selectedDraftIndex) {
  const project = getActiveProject();
  const draft = project?.drafts?.[Math.max(0, Number(index) || 0)];
  if (Number(index) === Number(selectedDraftIndex)) {
    return String(draftBodyInput?.value || draft?.body || "").trim();
  }
  return String(draft?.body || "").trim();
}

function writingDemoReviewText() {
  return String(claimResultsEl?.innerText || styleSheetResultsEl?.innerText || "").trim();
}

function writingDemoChineseCharCount(text = "") {
  return (String(text || "").match(/[\u3400-\u9fff]/g) || []).length;
}

function writingDemoLatinWordCount(text = "") {
  return (String(text || "").match(/[A-Za-z]{3,}/g) || []).length;
}

function writingDemoAssertManuscriptLanguage(text, label = t("teachtext")) {
  const value = writingDemoRequireText(text, label);
  const chineseCount = writingDemoChineseCharCount(value);
  const latinCount = writingDemoLatinWordCount(value);
  const invalid = currentLanguage === "zh"
    ? chineseCount < 260 || latinCount > Math.max(36, chineseCount * 0.35)
    : latinCount < 90 || chineseCount > Math.max(24, latinCount * 0.2);
  if (invalid) {
    throw new Error(writingDemoBilingual(
      `${label} 没有形成可用的中文正文，演示已停止。`,
      `${label} is not a usable English manuscript; demo stopped.`
    ));
  }
  return value;
}

function writingDemoAssertSectionDraftLanguage(text, label = t("section_drafts")) {
  const value = writingDemoRequireText(text, label);
  const chineseCount = writingDemoChineseCharCount(value);
  const latinCount = writingDemoLatinWordCount(value);
  const invalid = currentLanguage === "zh"
    ? chineseCount < 120 || latinCount > Math.max(36, chineseCount * 0.45)
    : latinCount < 55 || chineseCount > Math.max(18, latinCount * 0.25);
  if (invalid) {
    throw new Error(writingDemoBilingual(
      `${label} 没有形成可用的中文章节草稿，演示已停止。`,
      `${label} is not a usable English section draft; demo stopped.`
    ));
  }
  return value;
}

function writingDemoAssertDocMapReadyManuscript(text) {
  const value = writingDemoAssertManuscriptLanguage(text, t("teachtext"));
  const minChars = Number.isFinite(docMapMinDocumentChars) ? docMapMinDocumentChars : 800;
  if (value.length < minChars) {
    throw new Error(currentLanguage === "zh"
      ? `最终稿只有 ${value.length} 个字符，低于 DocMap 最低要求 ${minChars}，演示已停止。`
      : `The final draft has ${value.length} characters, below DocMap's ${minChars} character minimum; demo stopped.`);
  }
  return value;
}

async function writingDemoWaitForExpectedResult(options = {}, before = "") {
  if (typeof options.readResult !== "function") return true;
  const timeoutMs = options.resultTimeoutMs || options.timeoutMs || 140000;
  const minLength = Number.isFinite(options.minResultLength) ? options.minResultLength : 1;
  const startedAt = Date.now();
  const initial = String(before || "");

  while (Date.now() - startedAt < timeoutMs) {
    writingDemoAssertRunning();
    const text = writingDemoResultText(options.readResult);
    const changed = !options.requireChanged || text !== initial;
    const longEnough = text.length >= minLength;
    const notPending = !writingDemoLooksPending(text);
    if (writingDemoLooksFailed(text)) {
      throw new Error(text.slice(0, 240));
    }
    if (changed && longEnough && notPending) return true;
    await writingDemoSleep(260);
  }

  throw new Error(t("model_action_did_not_write_the"));
}

async function writingDemoWaitForActionCompletion(options = {}, before = "") {
  if (typeof options.readResult !== "function") {
    await writingDemoWaitForAiResult(options);
    return true;
  }
  const timeoutMs = options.resultTimeoutMs || options.timeoutMs || 140000;
  const minLength = Number.isFinite(options.minResultLength) ? options.minResultLength : 1;
  const startedAt = Date.now();
  const initial = String(before || "");
  let lastFocusAt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    writingDemoAssertRunning();
    if (options.focusWindowName && Date.now() - lastFocusAt > 900) {
      writingDemoFocusWindow(options.focusWindowName, options.slot || "wide");
      lastFocusAt = Date.now();
    }
    if (options.acceptModals !== false && systemModal?.open) {
      await writingDemoHighlightElement(systemModal.querySelector(".default, [value='yes'], button") || systemModal, currentLanguage === "zh" ? "确认继续" : "Confirm", { ms: 1100 });
      writingDemoAcceptSystemModal();
      await writingDemoSleep(220);
      continue;
    }

    const text = writingDemoResultText(options.readResult);
    const changed = !options.requireChanged || text !== initial;
    const longEnough = text.length >= minLength;
    const notPending = !writingDemoLooksPending(text);
    if (writingDemoLooksFailed(text)) throw new Error(text.slice(0, 240));
    if (changed && longEnough && notPending) return true;
    await writingDemoSleep(260);
  }

  const actionLabel = options.actionLabel || options.action || "";
  throw new Error(currentLanguage === "zh"
    ? `${actionLabel ? `${actionLabel}：` : ""}模型动作没有写入预期结果。`
    : `${actionLabel ? `${actionLabel}: ` : ""}Model action did not write the expected result.`);
}

async function writingDemoRunAction(windowName, action, options = {}) {
  writingDemoAssertModelAvailable();
  const actionOptions = { ...options, action, actionLabel: options.actionLabel || action, focusWindowName: options.focusWindowName || windowName };
  const beforeResult = typeof options.readResult === "function" ? writingDemoResultText(options.readResult) : "";
  await writingDemoDrainSystemModals({ timeoutMs: 2400, quietMs: 300 });
  await writingDemoCommandMenu(windowName, action);
  await writingDemoPause(options.beforeRunPauseMs ?? 450);
  handleAction(action);
  if (windowName && getWindow(windowName)) writingDemoFocusWindow(windowName, options.slot || "wide");
  const startedAt = Date.now();
  while (Date.now() - startedAt < (options.startupTimeoutMs || 5000)) {
    writingDemoAssertRunning();
    const busy = !!activeAbortController
      || !!activeLongTasks?.size
      || !!localModelState?.running
      || !!systemModal?.open;
    if (busy) break;
    if (windowName && getWindow(windowName)) writingDemoFocusWindow(windowName, options.slot || "wide");
    await writingDemoSleep(120);
  }
  const ok = await writingDemoWaitForActionCompletion(actionOptions, beforeResult);
  if (options.acceptModals !== false) await writingDemoDrainSystemModals({ timeoutMs: 7000, quietMs: 900 });
  if (Array.isArray(options.stage)) {
    for (const entry of options.stage) {
      if (entry?.name && getWindow(entry.name)) writingDemoPlaceWindow(entry.name, entry.slot || "main");
    }
    const last = options.stage[options.stage.length - 1];
    if (last?.name) focusWindow(getWindow(last.name));
  } else if (windowName && getWindow(windowName)) {
    writingDemoPlaceWindow(windowName, options.slot || "wide");
    focusWindow(getWindow(windowName));
  }
  return ok;
}

async function writingDemoClickActionButton(action, label = "") {
  writingDemoAssertRunning();
  const button = document.querySelector(`[data-action="${action}"]`);
  if (!button) {
    throw new Error(currentLanguage === "zh"
      ? `没有找到演示按钮：${action}`
      : `Demo button was not found: ${action}`);
  }
  await writingDemoHighlightElement(button, label || (currentLanguage === "zh" ? "点击按钮" : "Click"), { ms: 900 });
  button.click();
  await writingDemoPause(700);
}

function writingDemoInstallSeedOutline() {
  const project = getActiveProject();
  const outline = writingDemoRequireText(writingDemoCorpusText(writingDemoCorpus.artifacts?.outline), t("outline"));
  if (!project) throw new Error(t("no_active_project_for_the_demo"));
  if (typeof setProjectOutlineMarkdown === "function") setProjectOutlineMarkdown(project, outline);
  else {
    project.outline = outline;
    project.outlineSections = typeof extractOutlineSections === "function" ? extractOutlineSections(outline) : [];
  }
  project.outlineCritique = "";
  if (outlineContentEl) {
    outlineContentEl.value = outline;
    outlineContentEl.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (typeof syncDraftsFromProjectOutline === "function") syncDraftsFromProjectOutline(project);
  if (typeof syncOutlineDomFromProject === "function") syncOutlineDomFromProject(project);
  if (typeof renderPipeline === "function") renderPipeline();
  if (typeof savePipelineData === "function") savePipelineData();
  return writingDemoRequireText(writingDemoOutlineText(), t("outline"));
}

function writingDemoRequireText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(t("demo_step_generated_nothing", label));
  return text;
}

function writingDemoSyncDraftSelection(index) {
  const project = getActiveProject();
  if (!project?.drafts?.length) return null;
  const nextIndex = Math.max(0, Math.min(project.drafts.length - 1, Number(index) || 0));
  selectedDraftIndex = nextIndex;
  if (draftSectionSelectEl) draftSectionSelectEl.value = String(nextIndex);
  renderPipeline();
  return project.drafts[nextIndex] || null;
}

async function writingDemoEnsureDraftContent(index, label = "") {
  const project = getActiveProject();
  if (!project?.drafts?.length) throw new Error(t("no_section_draft_is_available"));
  const draft = writingDemoSyncDraftSelection(index);
  const current = String(draft?.body || draftBodyInput?.value || "").trim();
  if (current) return current;
  throw new Error(currentLanguage === "zh"
    ? `章节 ${index + 1} 没有收到模型草稿，演示已停止。`
    : `Section ${index + 1} did not receive a model draft; demo stopped.`);
}

async function writingDemoEnsureVisibleDraftContent(index, label = "") {
  const text = await writingDemoEnsureDraftContent(index, label);
  writingDemoSyncDraftSelection(index);
  if (draftBodyInput && !String(draftBodyInput.value || "").trim()) {
    draftBodyInput.value = text;
    draftBodyInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const visibleText = String(draftBodyInput?.value || "").trim();
  if (!visibleText) {
    throw new Error(currentLanguage === "zh"
      ? `章节 ${index + 1} 草稿没有显示在当前窗口，演示已停止。`
      : `Section ${index + 1} draft is not visible in the active window; demo stopped.`);
  }
  return visibleText;
}

function writingDemoSeedDraftFromOutline(index = selectedDraftIndex) {
  const project = getActiveProject();
  const draft = writingDemoSyncDraftSelection(index);
  const seededSections = writingDemoCorpusText(writingDemoCorpus.artifacts?.outline)
    .split(/(?=^##\s+)/m)
    .map((section) => section.trim())
    .filter((section) => /^##\s+/m.test(section));
  const source = String(draft?.sourceMarkdown || seededSections[index] || "").trim();
  if (!project || !draft || !source) return "";
  const seed = source
    .split(/\r?\n/)
    .filter((line) => !/^\s*#{1,6}\s+/.test(line))
    .join("\n")
    .replace(/^\s*[-*+]\s*/gm, "- ")
    .trim();
  if (!seed) return "";
  draft.body = seed;
  draft.updatedAt = new Date().toISOString();
  saveDeskState();
  renderPipeline();
  writingDemoSyncDraftSelection(index);
  draft.body = seed;
  if (draftBodyInput) {
    draftBodyInput.value = seed;
    draftBodyInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
  saveDeskState();
  return seed;
}

async function writingDemoWithTimeout(promise, ms, label = "") {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label || "demo_timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function writingDemoAwaitWithModalAccept(promise, { timeoutMs = 140000, acceptModals = true } = {}) {
  let settled = false;
  let value;
  let failure;
  Promise.resolve(promise).then((result) => {
    settled = true;
    value = result;
  }, (error) => {
    settled = true;
    failure = error;
  });
  const startedAt = Date.now();
  while (!settled && Date.now() - startedAt < timeoutMs) {
    writingDemoAssertRunning();
    if (acceptModals && systemModal?.open) {
      await writingDemoHighlightElement(systemModal.querySelector(".default, [value='yes'], button") || systemModal, currentLanguage === "zh" ? "确认继续" : "Confirm", { ms: 900 });
      writingDemoAcceptSystemModal();
    }
    await writingDemoSleep(180);
  }
  if (!settled) throw new Error(t("timed_out_waiting_for_demo_action"));
  if (failure) throw failure;
  return value;
}

async function writingDemoGenerateAssistantAnswer({ displayText, prompt, taskKind = "writing-demo", maxTokens = 900, timeoutMs = 45000 }) {
  writingDemoAssertModelAvailable();
  const publicText = String(displayText || "").trim();
  if (publicText) addMessage("user", publicText);
  const modelName = writingDemoGetModelName();
  if (!modelName) throw new Error(t("demo_model_is_not_configured"));
  const controller = new AbortController();
  let timer = null;
  try {
    const response = await Promise.race([
      fetchModelPayload({
        model: modelName,
        messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
        temperature: 0.25,
        max_tokens: maxTokens,
        ai_system6_task_kind: taskKind,
        stream: false,
      }, controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(currentLanguage === "zh" ? "模型短问答超时。" : "Short model answer timed out."));
        }, timeoutMs);
      }),
    ]);
    const data = await readChatJson(response);
    const answer = stripRebuildMarkdownFence(data?.choices?.[0]?.message?.content || "").trim();
    writingDemoRequireText(answer, "ClioTalk");
    addMessage("assistant", answer);
    return answer;
  } finally {
    clearTimeout(timer);
  }
}

async function writingDemoDictate(destination, raw, cleaned = raw, options = {}) {
  writingDemoAssertRunning();
  // The pad's interior is lazy and the demo drives it directly, so it waits for
  // the module instead of sliding past a typeof guard into a half-run scene.
  if (typeof ensureDictationPadModule === "function") await ensureDictationPadModule();
  if (typeof openDictationPad === "function") openDictationPad({ dest: destination, target: options.target || null });
  else openWindow("dictation");
  if (destination && getWindow(destination)) {
    await writingDemoStage([{ name: destination, slot: "main" }, { name: "dictation", slot: "side" }], { pauseMs: 800 });
  } else {
    await writingDemoStage([{ name: "dictation", slot: "compact" }], { pauseMs: 800 });
  }
  dictationRawInput.value = "";
  dictationCleanedInput.value = "";
  dictationStatusEl.textContent = t("demo_dictation");
  await writingDemoTypeInto(dictationRawInput, raw, { delay: 2 });
  await writingDemoSleep(180);
  if (options.cleanWithModel && typeof cleanTranscript === "function") {
    await cleanTranscript();
  } else {
    dictationCleanedInput.value = cleaned;
    dictationCleanedInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
  dictationStatusEl.textContent = t("dictation_cleaned");
  await writingDemoSleep(900);
  if (options.send !== false && typeof sendTranscript === "function") sendTranscript();
  if (options.closeAfterSend !== false) {
    await writingDemoSleep(450);
    await closeWindow("dictation", true);
    if (destination && getWindow(destination)) {
      await writingDemoStage([{ name: destination, slot: "wide" }], { pauseMs: 650 });
    }
  }
}

function writingDemoCreateProject() {
  const baseName = writingDemoCorpusText(writingDemoCorpus.projectName, "演示项目 - 当聊天框装不下一篇文章", "Live Demo - When Chat Cannot Hold an Article");
  const name = typeof uniqueProjectName === "function" ? uniqueProjectName(baseName) : `${baseName} ${new Date().toLocaleTimeString()}`;
  const project = createProjectRecord(name);
  const previousProjectId = activeProjectId;
  if (typeof parkConversationInProject === "function") parkConversationInProject(previousProjectId);
  isProjectMounted = true;
  projects.unshift(project);
  activeProjectId = project.id;
  selectedProjectId = project.id;
  selectedFolderId = "all";
  if (typeof clearProjectTransientState === "function") clearProjectTransientState();
  if (typeof closeProjectScopedWindows === "function") closeProjectScopedWindows();
  if (typeof scheduleWorkspaceRender === "function") scheduleWorkspaceRender({ projectReferences: true, mountedTextDisk: true, menuState: true });
  if (typeof resetAssistantForProject === "function") resetAssistantForProject(project.name);
  if (typeof loadActiveProjectReferences === "function") loadActiveProjectReferences();
  saveDeskState();
  openWindow("projects", { skipFinderMode: true, skipPlacement: true });
  writingDemoPlaceWindow("projects", "compact");
  setStatus(t("project_created", project.name));
  return project;
}

function writingDemoCreateCorpusProjectFile(name, body, artifactKind = "demo-source") {
  const folder = ensureFolder(t("documents"), null);
  const now = new Date().toISOString();
  const file = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    folderId: folder.id,
    type: "text",
    artifactKind,
    name: nextAvailableFileName(name, folder.id),
    body: String(body || "").trim(),
    label: "demo",
    demo: { kind: "evergreen", corpusId: writingDemoCorpus.id || "", corpusVersion: writingDemoCorpus.version || 0 },
    createdAt: now,
    updatedAt: now,
  };
  chatFiles.unshift(file);
  selectedChatFileId = file.id;
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  return file;
}

async function writingDemoSource() {
  const article = writingDemoRequireText(writingDemoCorpusText(writingDemoCorpus.artifacts?.article), writingDemoBilingual("示范来源", "Demo source"));
  const name = writingDemoCorpusText(writingDemoCorpus.sourceFileName, "AI System 6 开发记（示范来源）", "AI System 6 Development Story (Demo Source)");
  const file = writingDemoCreateCorpusProjectFile(name, article);
  openTextFile(file.id);
  await writingDemoStage([{ name: "teachText", slot: "wide" }]);
  writingDemoShowCaption(writingDemoBilingual(
    "演示：来源是一篇离线定稿的开发记；它先成为文件，不假装刚刚搜索过网络。",
    "Demo: the source is an editorially fixed offline development story. It becomes a file without pretending a live web search happened."
  ));
  await writingDemoHighlightElement(teachTextBodyInput || getWindow("teachText"), writingDemoBilingual("示范来源文件", "Demo source file"), { ms: 1300 });
}

function writingDemoReaderClip(seed) {
  const passage = String(seed?.text || "").trim();
  if (!passage) return null;
  const title = currentReaderPage?.title || writingDemoCorpusText(writingDemoCorpus.sourceFileName, "AI System 6 开发记", "AI System 6 Development Story");
  const capturedAt = new Date().toISOString();
  const sourceText = String(currentReaderPage?.text || "");
  const hitIndex = sourceText.toLowerCase().indexOf(passage.toLowerCase().slice(0, 20));
  const scrap = createScrap(seed.title, [
    writingDemoBilingual("所选段落：", "Selected passage:"),
    passage,
    "",
    "---",
    `${writingDemoBilingual("来源", "Source")}: ${title}`,
    `Corpus: ${writingDemoCorpus.id || "ai-system6-development-story"} v${writingDemoCorpus.version || 0}`,
    `${writingDemoBilingual("时间", "Time")}: ${new Date(capturedAt).toLocaleString()}`,
    "",
    writingDemoBilingual("前文：", "Context before:"),
    hitIndex >= 0
      ? sourceText.slice(Math.max(0, hitIndex - 140), hitIndex)
      : writingDemoBilingual("[来源开头]", "[source start]"),
    "",
    writingDemoBilingual("后文：", "Context after:"),
    hitIndex >= 0
      ? sourceText.slice(Math.min(sourceText.length, hitIndex + passage.length), Math.min(sourceText.length, hitIndex + passage.length + 140))
      : writingDemoBilingual("[来源结尾]", "[source end]"),
  ].join("\n"), {
    reveal: false,
    selectedText: passage,
    source: {
      type: "reader-clip",
      readerKind: "demo-corpus",
      title,
      capturedAt,
      sourceTitle: title,
      corpusId: writingDemoCorpus.id || "",
      corpusVersion: writingDemoCorpus.version || 0,
    },
  });
  if (scrap) {
    scrap.tags = [...new Set(["reader-clip", "demo-corpus", ...(scrap.tags || [])])];
  }
  return scrap;
}

async function writingDemoReader() {
  await writingDemoStage([{ name: "reader", slot: "wide" }]);
  const article = writingDemoCorpusText(writingDemoCorpus.artifacts?.article);
  await openReaderDocument({
    kind: "demoCorpus",
    title: writingDemoCorpusText(writingDemoCorpus.sourceFileName, "AI System 6 开发记", "AI System 6 Development Story"),
    text: article,
    source: `Demo Corpus: ${writingDemoCorpus.id || "ai-system6-development-story"} v${writingDemoCorpus.version || 0}`,
  }, { status: writingDemoBilingual("正在阅读离线示范来源", "Reading the offline demo source") });
  if (!currentReaderPage?.text?.trim()) {
    throw new Error(t("reader_demo_source_is_empty"));
  }
  await writingDemoPause(1200);
  const readerClips = Array.isArray(writingDemoCorpus.artifacts?.clippings?.[writingDemoLanguage()])
    ? writingDemoCorpus.artifacts.clippings[writingDemoLanguage()].slice(0, 3)
    : [];
  if (!readerClips.length) {
    throw new Error(t("no_usable_reader_clips_could_be"));
  }
  readerClips.forEach(writingDemoReaderClip);
  renderScraps();
  saveDeskState();
  await writingDemoHighlightElement(readerContentEl || getWindow("reader"), writingDemoBilingual(`摘录 ${readerClips.length} 段来源`, `Clip ${readerClips.length} Passages`), { ms: 1400 });
  await writingDemoPause(900);
}

async function writingDemoScrapbook() {
  await writingDemoStage([{ name: "scrapbook", slot: "wide" }]);
  const demoScraps = scraps
    .filter((scrap) => isInActiveProject(scrap))
    .filter((scrap) => scrap.tags?.includes("reader-clip") || scrap.tags?.includes("search-result"));
  selectedScrapIds.clear();
  demoScraps.slice(0, 4).forEach((scrap) => selectedScrapIds.add(scrap.id));
  selectedScrapId = selectedScrapIds.values().next().value || selectedScrapId;
  renderScraps();
  await writingDemoHighlightElement(document.querySelector("#send-scraps-to-question") || getWindow("scrapbook"), currentLanguage === "zh" ? "送到问题单" : "To Question Sheet", { ms: 1000 });
  sendSelectedScrapsToQuestionSheet();
  await writingDemoPause(900);
}

async function writingDemoQuestionSheet() {
  const profile = writingDemoModelProfile();
  await writingDemoStage([{ name: "questionSheet", slot: "wide" }]);
  await writingDemoDictate(
    "questionSheet",
    writingDemoCorpusText(writingDemoCorpus.shortIntent),
    "",
    { cleanWithModel: true }
  );
  const roughQuestionSheet = String(questionSheetBodyInput?.value || "").trim();
  await writingDemoCommandMenu("questionSheet", "organize-question-sheet");
  const organized = await organizeQuestionSheetCore({
    sourceMarkdown: roughQuestionSheet,
    taskId: "writing-demo-organize-question-sheet",
    statusLabel: currentLanguage === "zh" ? "正在整理演示问题单..." : "Organizing demo Question Sheet...",
    modelName: writingDemoGetModelName(),
    maxAttempts: profile.organizeAttempts,
    maxTokens: profile.organizeMaxTokens,
    sourceBudget: 1400,
    contextBudget: profile.organizeContextBudget,
    contextTopK: profile.organizeContextTopK,
    contextItemLimit: profile.organizeContextItemLimit,
    temperature: profile.organizeTemperature,
    retryTemperature: profile.organizeRetryTemperature,
    timeoutMs: profile.constrained ? 120000 : (writingDemoIsCloudActive() ? 90000 : 45000),
  });
  if (organized.trim() === roughQuestionSheet.trim()) {
    throw new Error(currentLanguage === "zh"
      ? "整理问题失败：模型没有实质改写原始输入。"
      : "Question Sheet organization failed: the model did not materially rewrite the original input.");
  }
  applyOrganizedQuestionSheet(organized);
  writingDemoRequireText(questionSheetBodyInput.value, t("question_sheet"));
  writingDemoShowCaption(writingDemoBilingual(
    "演示：问题单只是写作边界和参考；现在切到大纲，使用作者给定的章节结构。",
    "Demo: Question Sheet is the writing boundary and reference; now move to the writer's supplied structure in Outline."
  ));
  await writingDemoClickActionButton("advance-question-to-outline", currentLanguage === "zh" ? "到大纲" : "To Outline");
  if (getWindow("outline")?.classList.contains("is-hidden")) {
    throw new Error(t("the_outline_window_did_not_open"));
  }
}

async function writingDemoOutline() {
  await writingDemoStage([{ name: "outline", slot: "wide" }]);
  writingDemoInstallSeedOutline();
  writingDemoRequireText(writingDemoOutlineText(), t("outline"));
  writingDemoShowCaption(writingDemoBilingual(
    "演示：大纲来自作者给定结构；现在执行一次通用结构检查，不把私人写作镜头当作产品主线。",
    "Demo: the Outline begins with the writer's structure; now run a generic structure pass rather than making a private style lens the product route."
  ));
  await writingDemoRunAction("outline", "structure-outline", {
    readResult: writingDemoOutlineText,
    minResultLength: currentLanguage === "zh" ? 240 : 360,
    requireChanged: true,
    resultTimeoutMs: 180000,
  });
  writingDemoRequireText(writingDemoOutlineText(), t("outline"));
  advanceOutlineToSectionDrafts();
}

async function writingDemoSectionDrafts() {
  const profile = writingDemoModelProfile();
  const project = getActiveProject();
  advanceOutlineToSectionDrafts();
  await writingDemoStage([{ name: "sectionDrafts", slot: "wide" }]);
  const draftCount = Math.min(Math.max(project?.drafts?.length || 0, 1), 2);
  const visibleCount = Math.min(draftCount, 2);
  for (let index = 0; index < draftCount; index += 1) {
    writingDemoAssertRunning();
    writingDemoSyncDraftSelection(index);
    if (index === 0 && index < visibleCount) {
      const draft = project?.drafts?.[index];
      if (draft) draft.body = "";
      if (draftBodyInput) draftBodyInput.value = "";
      renderPipeline();
      writingDemoFocusWindow("sectionDrafts", "wide");
      writingDemoShowCaption(writingDemoBilingual(
        `演示：第 ${index + 1} 节，先从空章节开始，点击「AI 起草」。`,
        `Demo: Section ${index + 1} begins empty; now run AI Draft.`
      ));
      writingDemoFocusWindow("sectionDrafts", "wide");
      await writingDemoRunAction("sectionDrafts", "draft-current-section", {
        readResult: () => writingDemoDraftText(index),
        minResultLength: profile.sectionMinChars,
        requireChanged: false,
        resultTimeoutMs: profile.sectionTimeoutMs,
      });
      writingDemoAssertSectionDraftLanguage(
        await writingDemoEnsureVisibleDraftContent(index, currentLanguage === "zh" ? "AI 起草已写入" : "AI Draft Inserted"),
        currentLanguage === "zh" ? `章节 ${index + 1}` : `Section ${index + 1}`
      );
    } else if (index === 1) {
      const seed = writingDemoSeedDraftFromOutline(index);
      if (!seed) {
        throw new Error(currentLanguage === "zh"
          ? "第 2 节没有可润色的作者大纲材料，演示已停止。"
          : "Section 2 has no author outline material to polish; demo stopped.");
      }
      await writingDemoEnsureVisibleDraftContent(index, currentLanguage === "zh" ? "第 2 节已有草稿" : "Section 2 Draft Ready");
      writingDemoFocusWindow("sectionDrafts", "wide");
      writingDemoShowCaption(writingDemoBilingual(
        "演示：第 2 节已有作者大纲材料；现在只点击「AI 润色」，不再重复起草。",
        "Demo: Section 2 already contains writer material; use AI Polish without drafting it again."
      ));
      await writingDemoHighlightElement(draftBodyInput, currentLanguage === "zh" ? "已有草稿" : "Draft exists", { ms: 900 });
      writingDemoFocusWindow("sectionDrafts", "wide");
      await writingDemoRunAction("sectionDrafts", "polish-draft", {
        readResult: () => writingDemoDraftText(index),
        minResultLength: profile.sectionMinChars,
        requireChanged: false,
        resultTimeoutMs: profile.sectionTimeoutMs,
      });
      writingDemoAssertSectionDraftLanguage(
        await writingDemoEnsureVisibleDraftContent(index, currentLanguage === "zh" ? "AI 润色后保留" : "Polish Kept"),
        currentLanguage === "zh" ? `章节 ${index + 1}` : `Section ${index + 1}`
      );
    }
    writingDemoAssertSectionDraftLanguage(
      await writingDemoEnsureVisibleDraftContent(index),
      currentLanguage === "zh" ? `章节 ${index + 1}` : `Section ${index + 1}`
    );
  }
  writingDemoShowCaption(writingDemoBilingual(
    "演示：章节草稿验收完成，下一步合成为 TeachText 正文。",
    "Demo: the section drafts passed their checks; next they become one TeachText manuscript."
  ));
  selectedDraftIndex = 0;
  renderPipeline();
}

async function writingDemoTeachText() {
  const project = getActiveProject();
  const manuscript = (project?.drafts || [])
    .map((draft) => String(draft.body || "").trim())
    .filter(Boolean)
    .join("\n\n");
  writingDemoAssertDocMapReadyManuscript(manuscript);
  const tab = typeof ensureTeachTextManuscriptTab === "function" ? ensureTeachTextManuscriptTab(project) : null;
  if (tab && typeof setActiveDocumentTab === "function") setActiveDocumentTab("teachText", tab.id);
  teachTextDocumentRole = "manuscript";
  activeTextFileId = null;
  teachTextFileLabel = "final";
  setTeachTextWorkflowState("final");
  teachTextNameInput.value = writingDemoCorpusText(writingDemoCorpus.manuscriptTitle, "当聊天框装不下一篇文章", "When Chat Cannot Hold an Article");
  if (typeof syncTeachTextWindowTitle === "function") syncTeachTextWindowTitle();
  teachTextBodyInput.value = manuscript;
  setTeachTextStatus("modified");
  updateTeachTextBoundaries();
  syncTeachTextLabelControl();
  captureActiveTeachTextTabState();
  saveDeskState();
  await writingDemoStage([{ name: "outline", slot: "leftNarrow" }, { name: "teachText", slot: "rightWide" }]);
  await writingDemoHighlightElement(teachTextBodyInput, currentLanguage === "zh" ? "合成正文" : "Merged Manuscript", { ms: 1500 });
}

async function writingDemoRewriteFinalWithReview() {
  const profile = writingDemoModelProfile();
  const manuscript = writingDemoRequireText(teachTextBodyInput.value, t("teachtext"));
  const review = writingDemoRequireText(writingDemoReviewText(), t("review_desk"));
  const minChars = Number.isFinite(docMapMinDocumentChars) ? docMapMinDocumentChars : 800;
  const targetChars = Math.max(minChars + 180, 980);
  if (!beginLongTask("writing-demo-rewrite", writingDemoBilingual("正在根据审校反馈改出定稿...", "Rewriting the final draft from Review Desk feedback..."))) return;
  try {
    const prompt = currentLanguage === "zh"
      ? `你是 AI System 6 的中文长文编辑。请根据审校台反馈，把下面这篇开发记改成一版可以交付的定稿。

要求：
- 保留事实边界，只使用原稿、Reader/Scrapbook 摘录和审校反馈中支持的信息。
- 保留第一人称观察、真实犹豫和作者判断，不要漂洗成模型嘴替或发布会文案。
- 让技术机制回答它替写作者挡住了什么风险；不要堆功能清单。
- 定稿至少 ${targetChars} 个中文字符，保留 4-7 个自然段或 Markdown 小节，不能压缩成短摘要。
- 不要输出解释、修改说明或审校报告，只返回完整 Markdown 正文。

审校台反馈：
${clipContextContent(review, 4200)}

当前正文：
${clipContextContent(manuscript, 12000)}`
      : `You are the long-form editor inside AI System 6. Use the Review Desk feedback to turn the development story below into a finished manuscript.

Requirements:
- Preserve factual boundaries. Use only information supported by the manuscript, Reader/Scrapbook clippings, and review.
- Keep first-person observation, genuine hesitation, and the writer's judgment. Do not wash the piece into model-mouthpiece prose or launch copy.
- Make each technical mechanism answer which risk it removes from the writer; do not create a feature inventory.
- Return at least 160 English words and ${targetChars} characters, in 4–7 natural paragraphs or Markdown sections. Do not compress it into a short summary.
- Return the complete Markdown manuscript only, with no explanation or change report.

REVIEW DESK FEEDBACK:
${clipContextContent(review, 4200)}

CURRENT MANUSCRIPT:
${clipContextContent(manuscript, 12000)}`;
    let content = "";
    let lastError = null;
    for (let attempt = 0; attempt < profile.finalRewriteAttempts; attempt += 1) {
      const messages = attempt === 0
        ? withMarkdownModelMessages([{ role: "user", content: prompt }])
        : withMarkdownModelMessages([{
          role: "user",
          content: currentLanguage === "zh"
            ? `上一次定稿没有通过语言或长度检查：${lastError?.message || "低于最低长度"}。

请在不编造新事实的前提下，把下面短稿扩写成至少 ${targetChars} 个中文字符的完整开发记。保留作者判断，补足过渡、读者疑问、机制后果和来源边界。只返回完整 Markdown 正文。

审校台反馈：
${clipContextContent(review, 2600)}

短稿：
${clipContextContent(content || manuscript, 10000)}`
            : `The previous draft failed its language or length check: ${lastError?.message || "below the minimum"}.

Without inventing facts, expand the short draft into a complete development story of at least 160 English words and ${targetChars} characters. Keep the writer's judgment and restore transitions, reader questions, consequences, and source boundaries. Return the complete Markdown manuscript only.

REVIEW DESK FEEDBACK:
${clipContextContent(review, 2600)}

SHORT DRAFT:
${clipContextContent(content || manuscript, 10000)}`,
        }]);
      if (attempt > 0) {
        updateLocalModelState({
          running: true,
          task: currentLanguage === "zh" ? "正在扩写演示定稿..." : "Expanding demo final draft...",
        });
      }
      const response = await fetchModelPayload({
        model: writingDemoGetModelName(),
        messages,
        temperature: attempt === 0 ? profile.finalTemperature : profile.finalRetryTemperature,
        max_tokens: profile.finalMaxTokens,
        ai_system6_task_kind: "writing-demo-rewrite",
        stream: false,
      }, getLongTaskSignal());
      const data = await readChatJson(response);
      content = stripRebuildMarkdownFence(data?.choices?.[0]?.message?.content || "").trim();
      try {
        writingDemoAssertDocMapReadyManuscript(content);
        break;
      } catch (error) {
        lastError = error;
        if (attempt >= profile.finalRewriteAttempts - 1) throw error;
      }
    }
    teachTextBodyInput.value = content;
    setTeachTextWorkflowState("final");
    teachTextFileLabel = "final";
    setTeachTextStatus("modified");
    syncTeachTextLabelControl();
    updateTeachTextBoundaries();
    captureActiveTeachTextTabState();
    saveDeskState();
    openWindow("teachText");
  } finally {
    endLongTask("writing-demo-rewrite");
  }
}

async function writingDemoReviewDesk() {
  openReviewDesk("style");
  await writingDemoStage([{ name: "teachText", slot: "main" }, { name: "reviewDesk", slot: "side" }]);
  writingDemoShowCaption(writingDemoBilingual(
    "演示：先点「夸夸我」，确认审校台不是只会挑刺，也能保留作者状态。",
    "Demo: begin with Encourage Me, so Review Desk preserves the writer's footing before it identifies risks."
  ));
  await writingDemoCommandMenu("reviewDesk", "ai-praise");
  writingDemoFocusWindow("reviewDesk", "side");
  if (typeof praiseReviewDeskText !== "function") {
    throw new Error(t("review_desk_praise_is_not_available"));
  }
  const beforePraise = writingDemoReviewText();
  await writingDemoAwaitWithModalAccept(praiseReviewDeskText(), { timeoutMs: 120000 });
  await writingDemoWaitForExpectedResult({
    actionLabel: "review-desk-praise",
    readResult: writingDemoReviewText,
    minResultLength: 30,
    requireChanged: Boolean(beforePraise),
    resultTimeoutMs: 120000,
  }, beforePraise);
  writingDemoRequireText(writingDemoReviewText(), t("review_desk"));
  if (typeof selectClaimCheckSection === "function") selectClaimCheckSection(0);
  else if (typeof selectStyleCheckSection === "function") selectStyleCheckSection(0);
  writingDemoShowCaption(writingDemoBilingual(
    "演示：再对当前节执行通用风格检查，寻找模型嘴替、结构与可读性风险。",
    "Demo: now run the generic style check for model-mouthpiece, structure, and readability risks."
  ));
  await writingDemoRunAction("reviewDesk", "review-style-section", {
    timeoutMs: 120000,
    readResult: writingDemoReviewText,
    minResultLength: 30,
    requireChanged: true,
    resultTimeoutMs: 120000,
    stage: [{ name: "teachText", slot: "main" }, { name: "reviewDesk", slot: "side" }],
  });
  writingDemoRequireText(writingDemoReviewText(), t("review_desk"));
  writingDemoShowCaption(writingDemoBilingual(
    "演示：带着审校反馈回到 TeachText，改出仍然属于作者的定稿。",
    "Demo: return to TeachText with the review and make a final draft that still belongs to its writer."
  ));
  await writingDemoRewriteFinalWithReview();
}

async function writingDemoProjectCdAndDocMap() {
  const finalTitle = writingDemoCorpusText(writingDemoCorpus.finalExportTitle, "当聊天框装不下一篇文章 - 定稿", "When Chat Cannot Hold an Article - Final");
  const item = await addProjectCdItem(writingDemoAssertDocMapReadyManuscript(teachTextBodyInput.value), finalTitle, {
    sourceDocumentId: activeTextFileId || "",
    sourceKind: "markdown",
  });
  writingDemoRequireText(item?.body, "Project CD");
  await writingDemoStage([{ name: "projectCd", slot: "wide" }]);
  if (item) {
    selectedProjectCdItemId = item.id;
    selectedProjectCdItemIds.clear();
    selectedProjectCdItemIds.add(item.id);
    renderProjectCd();
    await writingDemoHighlightElement(projectCdGridEl?.querySelector(`[data-project-cd-item-id="${item.id}"]`) || projectCdGridEl, currentLanguage === "zh" ? "选中最终稿" : "Select Final Draft", { ms: 1200 });
    writingDemoShowCaption(writingDemoBilingual(
      "演示：Project CD 选中成稿，现在让 DocMap 读取这份 Markdown 的结构。",
      "Demo: the finished manuscript is selected on Project CD; now DocMap reads its Markdown structure."
    ));
    setStatus(t("demo_generating_docmap_from_project_cd"));
    await ensureDocMapModule();
    await makeDocMapFromCurrentSource();
    await writingDemoWaitForAiResult({ timeoutMs: 140000, acceptModals: false });
    if (!currentDocMap) throw new Error(t("docmap_was_not_generated_demo_stopped"));
    await writingDemoStage([{ name: "projectCd", slot: "side" }, { name: "docMap", slot: "main" }]);
    writingDemoShowCaption(writingDemoBilingual(
      "演示：DocMap 已经理解成稿结构；现在就文章主线问一个问题。",
      "Demo: DocMap now holds the manuscript structure; ask one question about its through-line."
    ));
    docMapQuestionInput.value = writingDemoBilingual("这篇稿子的主线是什么？", "What is the through-line of this manuscript?");
    docMapQuestionInput.dispatchEvent(new Event("input", { bubbles: true }));
    await writingDemoHighlightElement(docMapQuestionInput, currentLanguage === "zh" ? "询问 DocMap" : "Ask DocMap", { ms: 1000 });
    await askDocMapQuestion({ preventDefault() {} });
    await writingDemoWaitForAiResult({ timeoutMs: 120000, acceptModals: false });
  }
  return item;
}

async function writingDemoClioStage(item) {
  await writingDemoStage([{ name: "projectCd", slot: "compact" }]);
  await ensureSlidesExportModule();
  writingDemoShowCaption(writingDemoBilingual(
    "演示：同一份 Project CD 成稿，现在生成 3-5 页 ClioStage 提纲。",
    "Demo: the same Project CD manuscript now becomes a concise 3–5 slide ClioStage deck."
  ));
  setStatus(t("demo_generating_a_short_marp_outline"));
  const sourceName = item?.title || writingDemoCorpusText(writingDemoCorpus.manuscriptTitle, "当聊天框装不下一篇文章", "When Chat Cannot Hold an Article");
  const sourceBody = String(item?.body || "").trim();
  const bodySections = sourceBody
    ? sourceBody
        .split(/\n{2,}/)
        .map((section) => section.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];
  const sourceText = [
    `# ${sourceName}`,
    ...bodySections.map((section, index) => `## ${writingDemoBilingual("幻灯", "Slide")} ${index + 1}\n\n${section}`),
  ].join("\n\n");
  const file = await writingDemoAwaitWithModalAccept(generateMarpMarkdownAndOpenClioStage({
    title: sourceName,
    name: sourceName,
    markdown: sourceText,
    folder: preferredFolderName(),
    demoBrief: true,
    maxTokens: 900,
  }), { timeoutMs: 180000, acceptModals: true });
  if (!file) throw new Error(t("cliostage_did_not_generate_marp_demo"));
  await writingDemoStage([{ name: "clioStage", slot: "wide" }]);
  window.AISystem6ClioStage?.setMode?.("slide");
  window.AISystem6ClioStage?.showSlide?.(0);
  await writingDemoPause(1500);
}

async function writingDemoClioTalk(item) {
  await writingDemoStage([{ name: "projectCd", slot: "compact" }]);
  if (item) {
    selectedProjectCdItemId = item.id;
    selectedProjectCdItemIds.clear();
    selectedProjectCdItemIds.add(item.id);
    renderProjectCd();
  }
  writingDemoShowCaption(writingDemoBilingual(
    "演示：ClioTalk 在这里不是另一个聊天入口，而是接住 Project CD 成稿，继续问改稿和剪辑问题。",
    "Demo: ClioTalk is not another starting point here; it receives the Project CD manuscript for editing and handoff questions."
  ));
  attachSelectedProjectCdToAssistantContext();
  rememberInput.checked = true;
  await writingDemoStage([{ name: "assistant", slot: "main" }]);
  const attachedScrap = [...attachedClipIds]
    .map((id) => scraps.find((scrap) => scrap.id === id && isInActiveProject(scrap)))
    .find((scrap) => scrap?.source?.type === "project-cd");
  const ragContext = clipContextContent(attachedScrap?.body || item?.body || "", 4200);
  const questions = Array.isArray(writingDemoCorpus.followupQuestions?.[writingDemoLanguage()])
    ? writingDemoCorpus.followupQuestions[writingDemoLanguage()]
    : writingDemoFallbackCorpus().followupQuestions[writingDemoLanguage()];
  for (const question of questions) {
    writingDemoAssertRunning();
    writingDemoShowCaption(writingDemoBilingual(`演示：ClioTalk 追问成稿 - ${question}`, `Demo: ClioTalk asks the manuscript — ${question}`));
    await writingDemoGenerateAssistantAnswer({
      displayText: question,
      taskKind: "writing-demo-rag",
      maxTokens: writingDemoModelProfile().assistantMaxTokens,
      prompt: currentLanguage === "zh"
        ? `你是 AI System 6 的 ClioTalk。写作流程已经到收尾阶段：Project CD 里有最终稿。请只根据当前成稿回答剪辑、事实边界和改稿问题。

要求：
- 先用“写作用途：”说明这个回答会帮助用户做什么决定。
- 再用 2-4 条短项目符号直接回答。
- 最后用“依据：”列 1-2 个来自成稿的段落或句群线索。
- 总长控制在 220 字以内。
- 不要编造成稿之外的信息。

用户问题：
${question}

PROJECT CD CONTEXT:
${ragContext}`
        : `You are ClioTalk inside AI System 6 at the end of the writing route. Project CD holds the final manuscript. Answer editing, factual-boundary, and handoff questions from that manuscript only.

Requirements:
- Begin with “Writing use:” and name the decision this answer supports.
- Answer directly in 2–4 short bullets.
- End with “Basis:” and name one or two passages or sentence groups from the manuscript.
- Stay under 140 words.
- Invent nothing outside the manuscript.

USER QUESTION:
${question}

PROJECT CD CONTEXT:
${ragContext}`,
    });
    await writingDemoSleep(260);
  }
  if (attachedScrap) {
    lastContextBudget = {
      usedChars: Math.min((attachedScrap.body || "").length, 9000),
      budgetChars: 12000,
      promptTokens: 0,
      contextTokens: 0,
      availableOutputTokens: 0,
      budgetSource: "writing-demo-project-cd",
    };
    lastRetrievedContextItems = [{
      id: attachedScrap.id,
      projectId: activeProjectId,
      kind: "scrap",
      type: "curated",
      title: attachedScrap.title,
      content: clipContextContent(attachedScrap.body || "", 900),
      citationId: "[PCD]",
      included: true,
      excluded: false,
    }];
    if (typeof renderContextPanel === "function") renderContextPanel();
  }
  writingDemoShowCaption(writingDemoBilingual(
    "演示：右侧 Context Panel 显示 ClioTalk 引用了当前项目里的 Project CD 成稿。",
    "Demo: Context Panel shows that ClioTalk used the current project's Project CD manuscript."
  ));
  await writingDemoStage([{ name: "assistant", slot: "main" }, { name: "contextPanel", slot: "side" }]);
}

async function playWritingDemo() {
  if (writingDemoRun) {
    if (writingDemoRun.mode === "teaser") stopTeaserDemo();
    else stopWritingDemo();
    return;
  }
  writingDemoRun = { stopped: false, mode: "full", windowSlots: new Map(), modalAutoAcceptTimer: 0 };
  writingDemoStartModalAutoAccept();
  document.body.classList.add("writing-demo-recording");
  window.addEventListener("keydown", writingDemoKeydown);
  writingDemoSetButtons(true);
  setStatus(t("writing_demo_running"));
  let terminalStatus = "";
  try {
    await writingDemoEnsureCorpus();
    const preflightResults = await writingDemoRunPreflight();
    const preflightFailures = preflightResults.filter((item) => !item.ok);
    if (preflightFailures.length) {
      terminalStatus = currentLanguage === "zh" ? "演示准备失败。" : "Live demo preflight failed.";
      setStatus(terminalStatus);
      const failureText = writingDemoFormatPreflightFailures(preflightResults);
      if (preflightFailures.some((item) => item.label === (t("model_route")))) {
        openWindow("control");
      }
      await showSystemModal(
        currentLanguage === "zh"
          ? `演示准备失败，未进入正式录屏流程：\n\n${failureText}`
          : `Live demo preflight failed before recording:\n\n${failureText}`,
        "alert"
      );
      return;
    }
    await ensureWritingFlowModule();
    await ensureSlidesExportModule();
    await writingDemoStage([], { pauseMs: 250 });
    await writingDemoNarrate(writingDemoBilingual(
      `预检通过：${writingDemoModelRouteLabel()}。来源已经离线定稿，后面的写作动作走真实模型。`,
      `Preflight passed: ${writingDemoModelRouteLabel()}. The source is fixed offline; the writing actions ahead use the live model.`
    ), "modelMeter");
    await writingDemoNarrate(writingDemoBilingual(
      "新建一块演示项目硬盘，后续所有材料都归入这个项目。",
      "Create a demo Project Hard Disk so every material ahead belongs to one visible project."
    ), "projects");
    writingDemoCreateProject();
    await writingDemoRunScriptStep("sources", writingDemoSource);
    await writingDemoRunScriptStep("reader", writingDemoReader);
    await writingDemoRunScriptStep("scrapbook", writingDemoScrapbook);
    await writingDemoRunScriptStep("questionSheet", writingDemoQuestionSheet);
    await writingDemoRunScriptStep("outline", writingDemoOutline);
    await writingDemoRunScriptStep("sectionDrafts", writingDemoSectionDrafts);
    await writingDemoRunScriptStep("teachText", writingDemoTeachText);
    await writingDemoRunScriptStep("reviewDesk", writingDemoReviewDesk);
    await writingDemoRunScriptStep("reuse", async () => {
      const item = await writingDemoProjectCdAndDocMap();
      await writingDemoClioStage(item);
      await writingDemoClioTalk(item);
      return item;
    });
    terminalStatus = t("writing_demo_done");
    setStatus(terminalStatus);
  } catch (error) {
    if (error?.name === "AbortError") {
      terminalStatus = t("writing_demo_stopped");
    } else {
      console.error("Writing demo failed", error);
      terminalStatus = t("writing_demo_failed", error.message || String(error));
      try {
        await showSystemModal(terminalStatus, "alert");
      } catch {
        // Status text below remains visible if the modal cannot open.
      }
    }
  } finally {
    writingDemoStopModalAutoAccept();
    writingDemoRun = null;
    document.body.classList.remove("writing-demo-recording");
    window.removeEventListener("keydown", writingDemoKeydown);
    writingDemoClearHighlights();
    writingDemoClearCaption();
    writingDemoSetButtons(false);
    if (terminalStatus) setStatus(terminalStatus);
  }
}

// ---- Teaser mode ----------------------------------------------------------
// A seeded, deterministic 15–30s walkthrough that needs no model or network.
// It reuses the demo corpus, window staging, captions, and stop/cleanup
// machinery; seeded content is always labeled Demo and never claims live
// search, model calls, or tool calls. The full demo uses the same source but
// runs real writing operations after its model preflight.

const teaserDemoScenePauseMs = 5600;
const teaserDemoManagedWindows = ["projects", "documents", "teachText", "scrapbook", "reviewDesk", "projectCd"];

function teaserDemoSeededSourceText() {
  const article = writingDemoCorpusText(writingDemoCorpus.artifacts?.article);
  return [
    writingDemoBilingual("演示材料：以下内容为离线定稿，不代表实时搜索结果。", "Demo material: editorially fixed offline, not a live search result."),
    "",
    article,
  ].join("\n");
}

function teaserDemoClippingText() {
  const clips = writingDemoCorpus.artifacts?.clippings?.[writingDemoLanguage()] || [];
  return String(clips[1]?.text || clips[0]?.text || writingDemoFallbackCorpus().artifacts.clippings[writingDemoLanguage()][0].text);
}

function teaserDemoManuscriptBody() {
  return writingDemoCorpusText(writingDemoCorpus.artifacts?.teaserManuscript);
}

function teaserDemoClone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

const teaserDemoDurableCollections = [
  ["projects", projects],
  ["chatFolders", chatFolders],
  ["chatFiles", chatFiles],
  ["scraps", scraps],
  ["trashItems", trashItems],
  ["projectCdItems", projectCdItems],
  ["projectReferences", projectReferences],
];

function teaserDemoSnapshotDurable() {
  return Object.fromEntries(teaserDemoDurableCollections.map(([name, collection]) => [name, teaserDemoClone(collection)]));
}

function teaserDemoSnapshot() {
  const visible = Array.from(document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden)"))
    .map((win) => {
      const rect = win.getBoundingClientRect();
      return {
        name: win.dataset.window || "",
        left: win.style.left || "",
        top: win.style.top || "",
        width: win.style.width || "",
        height: win.style.height || "",
        collapsed: win.classList.contains("is-collapsed"),
      };
    })
    .filter((entry) => entry.name);
  return {
    projectId: typeof activeProjectId !== "undefined" ? activeProjectId : "",
    isProjectMounted: typeof isProjectMounted !== "undefined" ? isProjectMounted : true,
    selectedProjectId: typeof selectedProjectId !== "undefined" ? selectedProjectId : null,
    selectedFolderId: typeof selectedFolderId !== "undefined" ? selectedFolderId : "all",
    selectedChatFileId: typeof selectedChatFileId !== "undefined" ? selectedChatFileId : null,
    selectedDocumentFolderId: typeof selectedDocumentFolderId !== "undefined" ? selectedDocumentFolderId : null,
    selectedProjectRootItemId: typeof selectedProjectRootItemId !== "undefined" ? selectedProjectRootItemId : null,
    visible,
    durable: teaserDemoSnapshotDurable(),
  };
}

async function teaserDemoRestore(snapshot) {
  if (!snapshot) return;
  const errors = [];
  const durable = snapshot.durable || {};
  teaserDemoManagedWindows.forEach((name) => {
    try {
      if (typeof closeWindow === "function") closeWindow(name, true);
    } catch (error) {
      errors.push(`close ${name}: ${error?.message || error}`);
    }
  });
  // Durable collections are restored wholesale: every demo-created record
  // disappears and the pre-run state is deep-equivalent to the snapshot.
  teaserDemoDurableCollections.forEach(([name, collection]) => {
    try {
      collection.splice(0, collection.length, ...(Array.isArray(durable[name]) ? durable[name] : []));
    } catch (error) {
      errors.push(`${name}: ${error?.message || error}`);
    }
  });
  try {
    if (typeof isProjectMounted !== "undefined") isProjectMounted = snapshot.isProjectMounted === true;
    if (typeof activeProjectId !== "undefined") activeProjectId = snapshot.projectId;
    if (typeof selectedProjectId !== "undefined") selectedProjectId = snapshot.selectedProjectId ?? null;
    if (typeof selectedFolderId !== "undefined") selectedFolderId = snapshot.selectedFolderId ?? "all";
    if (typeof selectedChatFileId !== "undefined") selectedChatFileId = snapshot.selectedChatFileId ?? null;
    if (typeof selectedDocumentFolderId !== "undefined") selectedDocumentFolderId = snapshot.selectedDocumentFolderId ?? null;
    if (typeof selectedProjectRootItemId !== "undefined") selectedProjectRootItemId = snapshot.selectedProjectRootItemId ?? null;
  } catch (error) {
    errors.push(`session restore: ${error?.message || error}`);
  }
  try {
    if (typeof clearProjectTransientState === "function") clearProjectTransientState();
    if (typeof scheduleWorkspaceRender === "function") scheduleWorkspaceRender({ projectReferences: true, mountedTextDisk: true, menuState: true });
    if (typeof renderDocuments === "function") renderDocuments();
    if (typeof renderTeachTextTabs === "function") renderTeachTextTabs();
    if (typeof renderProjectDisks === "function") renderProjectDisks();
    if (typeof renderScraps === "function") renderScraps();
    if (typeof renderTrash === "function") renderTrash();
    if (typeof renderProjectCd === "function") renderProjectCd();
    if (typeof renderProjectReferences === "function") renderProjectReferences();
    window.AISystem6AssistantActivity?.resetForProject?.(snapshot.projectId || "");
    if (typeof saveDeskState === "function") await saveDeskState();
  } catch (error) {
    errors.push(`render/persist restore: ${error?.message || error}`);
  }
  snapshot.visible.forEach((entry) => {
    if (!entry.name || typeof openWindow !== "function") return;
    try {
      openWindow(entry.name, { skipFinderMode: true, skipPlacement: true });
      const win = typeof getWindow === "function" ? getWindow(entry.name) : null;
      if (!win) return;
      if (entry.left && typeof setInlineStyleValue === "function") setInlineStyleValue(win, "left", entry.left);
      if (entry.top && typeof setInlineStyleValue === "function") setInlineStyleValue(win, "top", entry.top);
      if (entry.width && typeof setInlineStyleValue === "function") setInlineStyleValue(win, "width", entry.width);
      if (entry.height && typeof setInlineStyleValue === "function") setInlineStyleValue(win, "height", entry.height);
      if (entry.collapsed) win.classList.add("is-collapsed");
    } catch (error) {
      errors.push(`open ${entry.name}: ${error?.message || error}`);
    }
  });
  if (errors.length) {
    console.warn("Teaser rollback encountered issues.", errors);
    if (typeof setStatus === "function") setStatus(t("teaser_restore_warning"));
  }
}

function teaserDemoEnsureDemoProject() {
  const baseName = writingDemoBilingual("30 秒演示 - 一篇文章如何留下", "Teaser Demo - How an Article Stays");
  const name = typeof uniqueProjectName === "function" ? uniqueProjectName(baseName) : `${baseName} ${new Date().toLocaleTimeString()}`;
  const project = createProjectRecord(name);
  // Marker for cleanup/assertion only; rollback removes the whole demo project.
  project.teaserDemo = { seeded: true, kind: "teaser" };
  if (typeof parkConversationInProject === "function") parkConversationInProject(activeProjectId);
  isProjectMounted = true;
  projects.unshift(project);
  activeProjectId = project.id;
  selectedProjectId = project.id;
  selectedFolderId = "all";
  if (typeof selectedChatFileId !== "undefined") selectedChatFileId = null;
  if (typeof clearProjectTransientState === "function") clearProjectTransientState();
  if (typeof closeProjectScopedWindows === "function") closeProjectScopedWindows();
  if (typeof scheduleWorkspaceRender === "function") scheduleWorkspaceRender({ projectReferences: true, mountedTextDisk: true, menuState: true });
  if (typeof resetAssistantForProject === "function") resetAssistantForProject(project.name);
  if (typeof loadActiveProjectReferences === "function") loadActiveProjectReferences();
  if (typeof saveDeskState === "function") saveDeskState();
  return project;
}

function teaserDemoCreateProjectFile(name, body) {
  const folder = typeof ensureFolder === "function" ? ensureFolder(t("documents"), null) : null;
  const now = new Date().toISOString();
  const file = {
    id: typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `teaser-${Date.now()}`,
    projectId: activeProjectId,
    folderId: folder?.id || null,
    type: "text",
    artifactKind: "teaser-demo",
    name: typeof nextAvailableFileName === "function" ? nextAvailableFileName(name, folder?.id || null) : name,
    body,
    label: "demo",
    demo: { kind: "teaser", seeded: true, corpusId: writingDemoCorpus.id || "", corpusVersion: writingDemoCorpus.version || 0 },
    createdAt: now,
    updatedAt: now,
  };
  chatFiles.unshift(file);
  if (typeof saveDeskState === "function") saveDeskState();
  if (typeof renderDocuments === "function") renderDocuments();
  if (typeof renderProjectDisks === "function") renderProjectDisks();
  return file;
}

async function teaserDemoSceneSource() {
  writingDemoAssertRunning();
  await writingDemoStage([{ name: "teachText", slot: "wide" }], { pauseMs: 500 });
  const sourceFile = teaserDemoCreateProjectFile(
    writingDemoCorpusText(writingDemoCorpus.sourceFileName, "AI System 6 开发记 (Demo)", "AI System 6 Development Story (Demo)"),
    teaserDemoSeededSourceText()
  );
  if (!sourceFile) throw new Error(t("teaser_source_file_creation_failed"));
  sourceFile.demo.role = "source";
  selectedChatFileId = sourceFile.id;
  openTextFile(sourceFile.id);
  await writingDemoPause(500);
  writingDemoShowCaption(writingDemoBilingual(
    "一篇离线定稿的开发记，作为真实文件进入了这台 1988 年的电脑。（演示素材）",
    "An editorially fixed development story enters this 1988 desktop as a real file. (Demo material)"
  ));
  await writingDemoPause(teaserDemoScenePauseMs);
}

async function teaserDemoSceneTransform() {
  writingDemoAssertRunning();
  // Clipping objects live in the lazy finder-objects module; a fresh desk has
  // not loaded it yet, and the bare-name guard below would read that as
  // "creation failed" and end the tour one scene in.
  if (typeof ensureFinderObjectsModule === "function") await ensureFinderObjectsModule();
  const clipping = typeof createClippingFile === "function"
    ? createClippingFile({
        text: teaserDemoClippingText(),
        sourceTitle: writingDemoCorpusText(writingDemoCorpus.sourceFileName, "AI System 6 开发记 (Demo)", "AI System 6 Development Story (Demo)"),
        sourceType: "teaser-demo",
        folderId: null,
      })
    : null;
  if (!clipping) throw new Error(t("teaser_clipping_creation_failed"));
  await writingDemoStage([{ name: "teachText", slot: "wide" }], { pauseMs: 400 });
  selectedChatFileId = clipping.id;
  openTextFile(clipping.id);
  await writingDemoPause(500);
  writingDemoShowCaption(currentLanguage === "zh"
    ? "来源片段变成独立的摘录对象，材料开始在应用之间移动。"
    : "A selection becomes its own clipping object — material now moves between apps.");
  await writingDemoPause(teaserDemoScenePauseMs);
  const manuscript = teaserDemoCreateProjectFile(
    `${writingDemoCorpusText(writingDemoCorpus.manuscriptTitle, "当聊天框装不下一篇文章", "When Chat Cannot Hold an Article")} (Demo)`,
    teaserDemoManuscriptBody()
  );
  manuscript.demo.role = "manuscript";
  selectedChatFileId = manuscript.id;
  openTextFile(manuscript.id);
  await writingDemoPause(600);
  writingDemoShowCaption(currentLanguage === "zh"
    ? "摘录插入正文：同一段材料，从来源变成了文稿的一部分。"
    : "The clipping is now part of the manuscript — the same material, transformed.");
  await writingDemoPause(teaserDemoScenePauseMs);
}

async function teaserDemoSceneResult() {
  writingDemoAssertRunning();
  await writingDemoStage([{ name: "documents", slot: "wide" }], { pauseMs: 500 });
  const manuscript = chatFiles.find((file) =>
    file?.projectId === activeProjectId
    && file?.artifactKind === "teaser-demo"
    && file?.demo?.kind === "teaser"
    && file?.demo?.role === "manuscript"
  );
  if (manuscript) {
    selectedChatFileId = manuscript.id;
    selectedFolderId = manuscript.folderId || "all";
    if (typeof renderDocuments === "function") renderDocuments();
  }
  await writingDemoPause(500);
  writingDemoShowCaption(currentLanguage === "zh"
    ? "结果没有消失在聊天里：它成了项目硬盘里的文稿。"
    : "The result did not vanish into a chat line — it is now a file on the disk.");
  await writingDemoPause(teaserDemoScenePauseMs);
  writingDemoShowCaption("The AI has a desktop now. · AI System 6");
  await writingDemoPause(2400);
}

function stopTeaserDemo() {
  if (!writingDemoRun || writingDemoRun.mode !== "teaser") return;
  writingDemoRun.stopped = true;
  activeAbortController?.abort?.();
  writingDemoClearHighlights();
  writingDemoClearCaption();
  setStatus(t("teaser_demo_stopped"));
  writingDemoSetTeaserButtons(false);
}

async function playTeaserDemo() {
  if (writingDemoRun) {
    if (writingDemoRun.mode === "teaser") stopTeaserDemo();
    else stopWritingDemo();
    return;
  }
  const snapshot = teaserDemoSnapshot();
  writingDemoRun = { stopped: false, mode: "teaser", windowSlots: new Map(), modalAutoAcceptTimer: 0 };
  document.body.classList.add("teaser-demo-running");
  window.addEventListener("keydown", writingDemoKeydown);
  writingDemoSetTeaserButtons(true);
  setStatus(t("teaser_demo_running"));
  let terminalStatus = "";
  let completedRun = false;
  try {
    await writingDemoEnsureCorpus();
    teaserDemoEnsureDemoProject();
    await writingDemoStage([], { pauseMs: 250 });
    await teaserDemoSceneSource();
    await teaserDemoSceneTransform();
    await teaserDemoSceneResult();
    terminalStatus = t("teaser_demo_done");
    completedRun = true;
    setStatus(terminalStatus);
  } catch (error) {
    if (error?.name === "AbortError") {
      terminalStatus = t("teaser_demo_stopped");
    } else {
      console.error("Teaser demo failed", error);
      terminalStatus = t("teaser_demo_failed", error?.message || String(error));
    }
  } finally {
    writingDemoRun = null;
    document.body.classList.remove("teaser-demo-running");
    window.removeEventListener("keydown", writingDemoKeydown);
    writingDemoClearHighlights();
    writingDemoClearCaption();
    writingDemoSetTeaserButtons(false);
    await teaserDemoRestore(snapshot);
    if (terminalStatus) setStatus(terminalStatus);
  }
  // The closing beat runs after the desk is restored and the demo run is
  // cleared, so the card is a real question and not a scene the demo's own
  // modal auto-accept could swallow. An aborted run shows no card and does
  // not complete the introduction: the visitor has not met the product.
  if (completedRun) await showTeaserClosingCard();
}

async function showTeaserClosingCard() {
  // Watching the tour to the end counts as being introduced, whichever
  // button follows. Replay stays in the Apple menu.
  if (typeof completeClioOnboarding === "function") await completeClioOnboarding("toured");
  if (typeof showSystemModal !== "function") return;
  const choice = await showSystemModal(t("teaser_closing_message"), "confirm", {
    confirmKey: "teaser_closing_look_around",
    altKey: "teaser_closing_draft_one",
    hideCancel: true,
  });
  if (choice === "no" && typeof handleAction === "function") handleAction("open-quick-draft");
}

window.AISystem6WritingDemo = {
  play: playWritingDemo,
  stop: stopWritingDemo,
  playTeaser: playTeaserDemo,
  stopTeaser: stopTeaserDemo,
};
window.AISystem6WritingDemoLoaded = true;
