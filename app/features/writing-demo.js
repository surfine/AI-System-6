// Feature module: writing-demo.

// Loaded lazily as a classic script; shares the AI System 6 global scope.

let writingDemoRun = null;

const writingDemoCorpus = window.AISystem6Iphone17eDemoCorpus || {};
const writingDemoAppleUrl = writingDemoCorpus.appleNewsroomUrl || "https://www.apple.com.cn/cn/newsroom/2026/03/apple-introduces-iphone-17e/";
const writingDemoSearchKeyword = writingDemoCorpus.searchKeyword || "iPhone 17e";
const writingDemoQuestionSeed = writingDemoCorpus.questionSheet || "";
const writingDemoOutlineSeed = writingDemoCorpus.aaronBulletInput || "";
const writingDemoManuscriptTitle = writingDemoCorpus.manuscriptTitle || "iPhone 17e 视频口播稿";
const writingDemoFinalExportTitle = writingDemoCorpus.finalExportTitle || "iPhone 17e 视频口播稿 - Final";
const writingDemoShortIntent = "我要写一条 iPhone 17e 的 B 站口播稿：有来源、有判断，别变成发布会复读。";

const writingDemoClipSeeds = [
  {
    title: "Clip: A19 / C1X / 256GB / MagSafe",
    cues: ["A19", "C1X", "256GB", "MagSafe", "Qi2"],
  },
  {
    title: "Clip: 浅粉色与外观",
    cues: ["浅粉色", "粉色", "外观", "颜色"],
  },
  {
    title: "Clip: 摄像头与续航",
    cues: ["摄像头", "相机", "48MP", "夜景", "续航", "Qi2"],
  },
];

const writingDemoScriptSteps = [
  {
    id: "sources",
    title: "来源进入项目",
    userVisiblePurpose: "先把 iPhone 17e 的来源带进项目，而不是在浏览器和聊天窗口之间复制粘贴。",
    windows: [{ name: "findPath", slot: "compact" }],
    expectedVisibleChange: "Searcher 选中来源、生成摘要，并把结果送进 Scrapbook。",
    failureMessage: "Searcher 没有把来源变成项目材料。",
  },
  {
    id: "reader",
    title: "阅读变成摘录",
    userVisiblePurpose: "Reader 负责读来源，Scrapbook 负责留下可追踪片段。",
    windows: [{ name: "reader", slot: "wide" }],
    expectedVisibleChange: "Apple 新闻稿打开，关键片段进入 Scrapbook。",
    failureMessage: "Reader 没有生成可用摘录。",
  },
  {
    id: "scrapbook",
    title: "材料篮送入写作",
    userVisiblePurpose: "Scrapbook 不是临时便签，它把来源片段送进写作对象链。",
    windows: [{ name: "scrapbook", slot: "wide" }],
    expectedVisibleChange: "来源摘录被选中并送到问题单。",
    failureMessage: "Scrapbook 没有把材料送入问题单。",
  },
  {
    id: "questionSheet",
    title: "素材变成问题单",
    userVisiblePurpose: "问题单把来源、观众问题、口吻和事实边界放到同一个对象里。",
    windows: [{ name: "questionSheet", slot: "wide" }],
    expectedVisibleChange: "一次短听写进入问题单，并被模型整理成写作任务。",
    failureMessage: "问题单没有形成可用写作边界。",
  },
  {
    id: "outline",
    title: "手工结构进入大纲",
    userVisiblePurpose: "问题单提供写作边界；大纲使用作者已经给定的章节顺序，不把问题单当作唯一上游。",
    windows: [{ name: "outline", slot: "wide" }],
    expectedVisibleChange: "Aaron 给定的大纲进入 Outline，并同步为可起草章节。",
    failureMessage: "给定大纲没有形成可起草结构。",
  },
  {
    id: "sectionDrafts",
    title: "逐节推敲",
    userVisiblePurpose: "章节草稿只精演两节：一节从无到有，一节被润色；其余章节后台验收。",
    windows: [{ name: "sectionDrafts", slot: "wide" }],
    expectedVisibleChange: "第 1 节出现草稿，第 2 节出现润色前后变化。",
    failureMessage: "章节草稿没有展示真实逐节处理。",
  },
  {
    id: "teachText",
    title: "章节合成正文",
    userVisiblePurpose: "TeachText 承接章节草稿，正文是项目对象，不是聊天记录。",
    windows: [{ name: "outline", slot: "leftNarrow" }, { name: "teachText", slot: "rightWide" }],
    expectedVisibleChange: "章节草稿合成为一篇可编辑中文正文。",
    failureMessage: "正文没有达到可用中文稿标准。",
  },
  {
    id: "reviewDesk",
    title: "定稿前审校",
    userVisiblePurpose: "审校台把“我觉得写完了”变成一次代入铭铭视角的交付前检查。",
    windows: [{ name: "teachText", slot: "main" }, { name: "reviewDesk", slot: "side" }],
    expectedVisibleChange: "Review Desk 生成鼓励和铭铭视角检视，再回到正文改稿。",
    failureMessage: "审校台没有生成真实审校结果。",
  },
  {
    id: "reuse",
    title: "成稿继续复用",
    userVisiblePurpose: "Project CD 里的成稿还能被 DocMap 理解、被 ClioStage 改成提纲，并交给 ClioTalk 做后续写作追问。",
    windows: [{ name: "projectCd", slot: "wide" }],
    expectedVisibleChange: "成稿进入 Project CD，并依次打开 DocMap、ClioStage、ClioTalk；ClioTalk 基于成稿回答改稿问题。",
    failureMessage: "成稿复用链路没有跑通。",
  },
];

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
  "guide",
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
  return writingDemoScriptSteps.find((step) => step.id === id) || null;
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

async function writingDemoProbeSearch() {
  const label = "Searcher";
  try {
    const results = await writingDemoWithTimeout(searchFindPath(writingDemoSearchKeyword), 20000, "search_timeout");
    return { label, ok: Array.isArray(results) && results.length > 0, error: Array.isArray(results) && results.length ? null : "搜索结果为空" };
  } catch (error) {
    return { label, ok: false, error };
  }
}

async function writingDemoProbeReader() {
  const label = "Reader";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`/api/reader?url=${encodeURIComponent(writingDemoAppleUrl)}`, { signal: controller.signal });
    if (!response.ok) throw new Error(serviceErrorDetail(response.status, await response.text()));
    const data = await response.json();
    return { label, ok: !!String(data?.text || "").trim(), error: data?.text ? null : "Reader 正文为空" };
  } catch (error) {
    return { label, ok: false, error };
  } finally {
    clearTimeout(timer);
  }
}

async function writingDemoRunPreflight() {
  const results = [];
  setStatus(currentLanguage === "zh" ? "正在预检实战演示关键能力..." : "Checking live demo prerequisites...");
  writingDemoShowCaption(currentLanguage === "zh"
    ? "演示预检：先确认模型、搜索、阅读和关键生成任务可用；不通过就不开始录屏流程。"
    : "Demo preflight: checking model, search, reader, and generation tasks before recording.");
  const model = await writingDemoPreflightModel();
  results.push({ label: currentLanguage === "zh" ? "模型通道" : "Model route", ok: model.ok, error: model.error });
  if (!model.ok) return results;
  results.push(await writingDemoProbeSearch());
  results.push(await writingDemoProbeReader());
  const zhProbe = "请用一句自然简体中文回答：OK，实战演示预检通过。";
  results.push(await writingDemoProbeModel("问题单整理", zhProbe, "organize-question-sheet", { maxTokens: 64 }));
  results.push(await writingDemoProbeModel("章节起草", zhProbe, "draft-section", { maxTokens: 64 }));
  results.push(await writingDemoProbeModel("HKRR", zhProbe, "hkrr", { maxTokens: 64 }));
  results.push(await writingDemoProbeModel("DocMap", "请输出一个极简 Markdown 大纲：# 预检\n## 主线\n- OK", "docmap", { maxTokens: 96 }));
  results.push(await writingDemoProbeModel("Marp", "请输出 2 页极简 Marp Markdown，每页不超过 1 行。", "marp", { maxTokens: 160 }));
  results.push(await writingDemoProbeModel("ClioTalk 写作追问", zhProbe, "writing-demo-rag", { maxTokens: 64 }));
  return results;
}

function stopWritingDemo() {
  if (!writingDemoRun) return;
  writingDemoStopModalAutoAccept();
  writingDemoRun.stopped = true;
  activeAbortController?.abort?.();
  writingDemoClearHighlights();
  writingDemoClearCaption();
  setStatus(t("writing_demo_stopped"));
  writingDemoSetButtons(false);
}

function writingDemoKeydown(event) {
  if (event.key === "Escape" && writingDemoRun) stopWritingDemo();
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

  throw new Error(currentLanguage === "zh" ? "等待模型生成超时。" : "Timed out waiting for model generation.");
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

function writingDemoAssertChineseManuscript(text, label = t("teachtext")) {
  const value = writingDemoRequireText(text, label);
  const chineseCount = writingDemoChineseCharCount(value);
  const latinCount = writingDemoLatinWordCount(value);
  if (chineseCount < 260 || latinCount > Math.max(36, chineseCount * 0.35)) {
    throw new Error(currentLanguage === "zh"
      ? `${label} 没有形成可用的中文视频稿，演示已停止。`
      : `${label} is not a usable Chinese video script; demo stopped.`);
  }
  return value;
}

function writingDemoAssertChineseSectionDraft(text, label = t("section_drafts")) {
  const value = writingDemoRequireText(text, label);
  const chineseCount = writingDemoChineseCharCount(value);
  const latinCount = writingDemoLatinWordCount(value);
  if (chineseCount < 120 || latinCount > Math.max(36, chineseCount * 0.45)) {
    throw new Error(currentLanguage === "zh"
      ? `${label} 没有形成可用的中文章节草稿，演示已停止。`
      : `${label} is not a usable Chinese section draft; demo stopped.`);
  }
  return value;
}

function writingDemoAssertDocMapReadyManuscript(text) {
  const value = writingDemoAssertChineseManuscript(text, t("teachtext"));
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

  throw new Error(currentLanguage === "zh" ? "模型动作没有写入预期结果。" : "Model action did not write the expected result.");
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
  const outline = writingDemoRequireText(writingDemoOutlineSeed, t("outline"));
  if (!project) throw new Error(currentLanguage === "zh" ? "没有当前项目，无法写入大纲。" : "No active project for the demo outline.");
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
  if (!text) throw new Error(currentLanguage === "zh" ? `${label} 没有生成内容。` : `${label} did not generate content.`);
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
  if (!project?.drafts?.length) throw new Error(currentLanguage === "zh" ? "章节草稿没有可用章节。" : "No section draft is available.");
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
  const seededSections = String(writingDemoOutlineSeed || "")
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
  if (!settled) throw new Error(currentLanguage === "zh" ? "等待演示动作超时。" : "Timed out waiting for demo action.");
  if (failure) throw failure;
  return value;
}

async function writingDemoReaderFetchWithTimeout(url, ms = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(`/api/reader?url=${encodeURIComponent(url)}`, { signal: controller.signal });
    if (!response.ok) throw new Error(serviceErrorDetail(response.status, await response.text()));
    const data = await response.json();
    const readerDoc = { ...data, kind: "web", source: data.url };
    createReaderWebDocumentTab(readerDoc, { forceNew: true });
    openReaderDocument(readerDoc);
    return readerDoc;
  } finally {
    clearTimeout(timer);
  }
}

async function writingDemoGenerateAssistantAnswer({ displayText, prompt, taskKind = "writing-demo", maxTokens = 900, timeoutMs = 45000 }) {
  writingDemoAssertModelAvailable();
  const publicText = String(displayText || "").trim();
  if (publicText) addMessage("user", publicText);
  const modelName = writingDemoGetModelName();
  if (!modelName) throw new Error(currentLanguage === "zh" ? "演示未配置模型。" : "Demo model is not configured.");
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
  if (typeof openDictationPad === "function") openDictationPad({ dest: destination, target: options.target || null });
  else openWindow("dictation");
  if (destination && getWindow(destination)) {
    await writingDemoStage([{ name: destination, slot: "main" }, { name: "dictation", slot: "side" }], { pauseMs: 800 });
  } else {
    await writingDemoStage([{ name: "dictation", slot: "compact" }], { pauseMs: 800 });
  }
  dictationRawInput.value = "";
  dictationCleanedInput.value = "";
  dictationStatusEl.textContent = currentLanguage === "zh" ? "演示听写中..." : "Demo dictation...";
  await writingDemoTypeInto(dictationRawInput, raw, { delay: 2 });
  await writingDemoSleep(180);
  if (options.cleanWithModel && typeof cleanTranscript === "function") {
    await cleanTranscript();
  } else {
    dictationCleanedInput.value = cleaned;
    dictationCleanedInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
  dictationStatusEl.textContent = currentLanguage === "zh" ? "已整理听写。" : "Dictation cleaned.";
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
  const baseName = currentLanguage === "zh"
    ? (writingDemoCorpus.projectNameZh || t("writing_live_project_name"))
    : (writingDemoCorpus.projectNameEn || t("writing_live_project_name"));
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

async function writingDemoSearch() {
  await writingDemoStage([{ name: "findPath", slot: "compact" }]);
  await writingDemoTypeInto(findPathQueryInput, writingDemoSearchKeyword, { delay: 12 });
  findPathResultsEl.replaceChildren();
  findPathResults.length = 0;
  selectedFindPathIndex = null;
  findPathSummaryEl.classList.add("is-hidden");
  findPathSummaryEl.textContent = "";
  try {
    const results = await writingDemoWithTimeout(searchFindPath(writingDemoSearchKeyword), 20000, "search_timeout");
    if (!Array.isArray(results) || !results.length) throw new Error(currentLanguage === "zh" ? "搜索结果为空。" : "Search returned no results.");
    findPathResults.push(...results);
  } catch (error) {
    throw new Error(currentLanguage === "zh"
      ? `Searcher 未拿到可用结果：${error?.message || "未知错误"}`
      : `Searcher could not return usable results: ${error?.message || "Unknown error"}`);
  }
  const appleIndex = findPathResults.findIndex((result) => /apple/i.test(`${result.title} ${result.site}`));
  selectedFindPathIndex = appleIndex >= 0 ? appleIndex : 0;
  renderFindPathResults();
  await writingDemoHighlightElement(findPathResultsEl.querySelector(".find-path-result.is-selected") || findPathResultsEl.querySelector(".find-path-result"), currentLanguage === "zh" ? "选中结果" : "Select Result", { ms: 1200 });
  try {
    await writingDemoHighlightElement(synthesizeFindPathButton, currentLanguage === "zh" ? "点击 Synthesize" : "Click Synthesize", { ms: 1000 });
    await writingDemoWithTimeout(synthesizeFindPath(), 45000, "search_synthesis_timeout");
  } catch (error) {
    throw new Error(currentLanguage === "zh"
      ? `Searcher 摘要生成失败：${error?.message || "未知错误"}`
      : `Searcher synthesis failed: ${error?.message || "Unknown error"}`);
  }
  if (!findPathSummaryEl.textContent.trim()) {
    throw new Error(currentLanguage === "zh" ? "Searcher 未返回可读总结。" : "Searcher summary is empty.");
  }
  findPathSummaryEl.classList.remove("is-hidden");
  await writingDemoHighlightElement(findPathSummaryEl, currentLanguage === "zh" ? "AI 总结" : "AI Summary", { ms: 1400 });
  await writingDemoHighlightElement(document.querySelector('[data-action="clip-selected-find-path"]'), currentLanguage === "zh" ? "摘录到 Scrapbook" : "Clip to Scrapbook", { ms: 1000 });
  clipSelectedFindPath();
  await writingDemoPause(900);
}

function writingDemoReaderClip(seed) {
  const passage = String(seed?.text || "").trim();
  if (!passage) return null;
  const title = currentReaderPage?.title || `Apple introduces ${writingDemoSearchKeyword}`;
  const capturedAt = new Date().toISOString();
  const sourceText = String(currentReaderPage?.text || "");
  const hitIndex = sourceText.toLowerCase().indexOf(passage.toLowerCase().slice(0, 20));
  const scrap = createScrap(seed.title, [
    "Selected passage:",
    passage,
    "",
    "---",
    `Source: ${title}`,
    "Site: Apple Newsroom",
    `URL: ${writingDemoAppleUrl}`,
    `Time: ${new Date(capturedAt).toLocaleString()}`,
    "",
    "Context before:",
    hitIndex >= 0
      ? sourceText.slice(Math.max(0, hitIndex - 140), hitIndex)
      : "[source start]",
    "",
    "Context after:",
    hitIndex >= 0
      ? sourceText.slice(Math.min(sourceText.length, hitIndex + passage.length), Math.min(sourceText.length, hitIndex + passage.length + 140))
      : "[source end]",
  ].join("\n"), {
    reveal: false,
    selectedText: passage,
    source: {
      type: "reader-clip",
      readerKind: "web",
      title,
      url: writingDemoAppleUrl,
      site: "Apple Newsroom",
      capturedAt,
      sourceTitle: title,
    },
  });
  if (scrap) {
    scrap.tags = [...new Set(["reader-clip", "web", ...(scrap.tags || [])])];
  }
  return scrap;
}

function writingDemoExtractReaderSnippet(text, cues) {
  const sourceText = String(text || "");
  const lowerSource = sourceText.toLowerCase();
  let index = -1;

  for (const cue of cues) {
    const needle = String(cue || "").trim();
    if (!needle) continue;
    const hit = lowerSource.indexOf(needle.toLowerCase());
    if (hit >= 0) {
      index = hit;
      break;
    }
  }

  if (index < 0) return "";
  const start = Math.max(0, index - 140);
  const end = Math.min(sourceText.length, index + 560);
  return sourceText.slice(start, end).trim();
}

function writingDemoGetReaderClips(sourceText) {
  return writingDemoClipSeeds
    .map((seed) => {
      const snippet = writingDemoExtractReaderSnippet(sourceText, seed.cues);
      return snippet ? { ...seed, text: snippet } : null;
    })
    .filter(Boolean)
    .slice(0, 3);
}

async function writingDemoReader() {
  await writingDemoStage([{ name: "reader", slot: "wide" }]);
  await writingDemoTypeInto(readerUrlInput, writingDemoAppleUrl, { delay: 1 });
  try {
    await writingDemoReaderFetchWithTimeout(writingDemoAppleUrl);
  } catch {
    throw new Error(currentLanguage === "zh" ? "Reader 无法打开目标网页。" : "Reader failed to open the target page.");
  }
  if (!currentReaderPage?.text?.trim()) {
    throw new Error(currentLanguage === "zh" ? "Reader 页面解析结果为空。" : "Reader page has no text content.");
  }
  await writingDemoPause(1200);
  const readerClips = writingDemoGetReaderClips(currentReaderPage.text);
  if (!readerClips.length) {
    throw new Error(currentLanguage === "zh" ? "未抽取到可用 Reader 摘录。" : "No usable Reader clips could be extracted.");
  }
  readerClips.forEach(writingDemoReaderClip);
  renderScraps();
  saveDeskState();
  await writingDemoHighlightElement(readerContentEl || getWindow("reader"), currentLanguage === "zh" ? "摘录 3 段来源" : "Clip 3 Passages", { ms: 1400 });
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
    writingDemoShortIntent,
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
  writingDemoShowCaption("演示：问题单只是写作边界和参考；现在切到大纲，使用作者给定的章节结构。");
  await writingDemoClickActionButton("advance-question-to-outline", currentLanguage === "zh" ? "到大纲" : "To Outline");
  if (getWindow("outline")?.classList.contains("is-hidden")) {
    throw new Error(currentLanguage === "zh" ? "点击到大纲后，大纲窗口没有打开。" : "The Outline window did not open after To Outline.");
  }
}

async function writingDemoOutline() {
  await writingDemoStage([{ name: "outline", slot: "wide" }]);
  writingDemoInstallSeedOutline();
  writingDemoRequireText(writingDemoOutlineText(), t("outline"));
  writingDemoShowCaption(currentLanguage === "zh"
    ? "演示：大纲来自作者给定结构；现在执行「若是铭铭会怎么写」，看它如何把结构改成更可交付的口播形状。"
    : "Demo: the Outline starts from the author-provided structure; now run What Would Mingming Write to reshape it for handoff.");
  await writingDemoRunAction("outline", "mingming-outline", {
    readResult: writingDemoOutlineText,
    minResultLength: 600,
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
      writingDemoShowCaption(`演示：第 ${index + 1} 节，先从空章节开始，点击「AI 起草」。`);
      writingDemoFocusWindow("sectionDrafts", "wide");
      await writingDemoRunAction("sectionDrafts", "draft-current-section", {
        readResult: () => writingDemoDraftText(index),
        minResultLength: profile.sectionMinChars,
        requireChanged: false,
        resultTimeoutMs: profile.sectionTimeoutMs,
      });
      writingDemoAssertChineseSectionDraft(
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
      writingDemoShowCaption("演示：第 2 节已有作者大纲材料；现在只点击「AI 润色」，不再重复起草。");
      await writingDemoHighlightElement(draftBodyInput, currentLanguage === "zh" ? "已有草稿" : "Draft exists", { ms: 900 });
      writingDemoFocusWindow("sectionDrafts", "wide");
      await writingDemoRunAction("sectionDrafts", "polish-draft", {
        readResult: () => writingDemoDraftText(index),
        minResultLength: profile.sectionMinChars,
        requireChanged: false,
        resultTimeoutMs: profile.sectionTimeoutMs,
      });
      writingDemoAssertChineseSectionDraft(
        await writingDemoEnsureVisibleDraftContent(index, currentLanguage === "zh" ? "AI 润色后保留" : "Polish Kept"),
        currentLanguage === "zh" ? `章节 ${index + 1}` : `Section ${index + 1}`
      );
    }
    writingDemoAssertChineseSectionDraft(
      await writingDemoEnsureVisibleDraftContent(index),
      currentLanguage === "zh" ? `章节 ${index + 1}` : `Section ${index + 1}`
    );
  }
  writingDemoShowCaption("演示：章节草稿验收完成，下一步合成为 TeachText 正文。");
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
  teachTextNameInput.value = writingDemoManuscriptTitle;
  teachTextTitleEl.textContent = teachTextNameInput.value;
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
  if (!beginLongTask("writing-demo-rewrite", currentLanguage === "zh" ? "正在根据铭铭视角改出定稿..." : "Rewriting final draft with Mingming-perspective feedback...")) return;
  try {
    const prompt = `你是 AI System 6 的中文视频稿编辑。请根据铭铭视角审校反馈，把下面这篇 iPhone 17e 口播稿改成更适合 B 站观众的一版定稿。

要求：
- 保留事实边界，只使用原稿、Reader/Scrapbook 摘录和审校反馈中支持的信息。
- 更口语、更有节奏，更像视频口播，减少论文腔和发布会腔。
- 开头要更容易留住观众；结尾要给出清楚购买建议。
- 定稿至少 ${targetChars} 个中文字符，保留 4-6 个自然段或 Markdown 小节，不能压缩成短摘要。
- 不要输出解释、修改说明或审校报告，只返回完整 Markdown 正文。

铭铭视角审校反馈：
${clipContextContent(review, 4200)}

当前正文：
${clipContextContent(manuscript, 12000)}`;
    let content = "";
    let lastError = null;
    for (let attempt = 0; attempt < profile.finalRewriteAttempts; attempt += 1) {
      const messages = attempt === 0
        ? withMarkdownModelMessages([{ role: "user", content: prompt }])
        : withMarkdownModelMessages([{
          role: "user",
          content: `上一次定稿太短，不能进入 DocMap：${lastError?.message || "低于最低长度"}。

请在不编造新事实的前提下，把下面短稿扩写成至少 ${targetChars} 个中文字符的完整 B 站口播定稿。保留已有判断，补足过渡、观众疑问、购买建议和来源边界。只返回完整 Markdown 正文。

铭铭视角审校反馈：
${clipContextContent(review, 2600)}

短稿：
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
  writingDemoShowCaption("演示：先点「夸夸我」，确认审校台不是只会挑刺，也能保留作者状态。");
  await writingDemoCommandMenu("reviewDesk", "ai-praise");
  writingDemoFocusWindow("reviewDesk", "side");
  if (typeof praiseReviewDeskText !== "function") {
    throw new Error(currentLanguage === "zh" ? "审校台夸夸我功能不可用。" : "Review Desk praise is not available.");
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
  writingDemoShowCaption("演示：再对当前节执行「代入铭铭视角」，检查视频感、接收压力和交付轻重。");
  await writingDemoRunAction("reviewDesk", "review-mingming-section", {
    timeoutMs: 120000,
    readResult: writingDemoReviewText,
    minResultLength: 30,
    requireChanged: false,
    resultTimeoutMs: 120000,
    stage: [{ name: "teachText", slot: "main" }, { name: "reviewDesk", slot: "side" }],
  });
  writingDemoRequireText(writingDemoReviewText(), "铭铭视角");
  writingDemoShowCaption("演示：带着铭铭视角反馈回到 TeachText，改出更适合 B 站观众的定稿。");
  await writingDemoRewriteFinalWithReview();
}

async function writingDemoProjectCdAndDocMap() {
  const item = await addProjectCdItem(writingDemoAssertDocMapReadyManuscript(teachTextBodyInput.value), writingDemoFinalExportTitle, {
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
    writingDemoShowCaption("演示：Project CD 选中成稿，现在让 DocMap 读取这份 Markdown 的结构。");
    setStatus(currentLanguage === "zh" ? "演示：正在从 Project CD 成稿生成 DocMap..." : "Demo: generating DocMap from Project CD...");
    await ensureDocMapModule();
    await makeDocMapFromCurrentSource();
    await writingDemoWaitForAiResult({ timeoutMs: 140000, acceptModals: false });
    if (!currentDocMap) throw new Error(currentLanguage === "zh" ? "DocMap 没有生成，演示已停止。" : "DocMap was not generated; demo stopped.");
    await writingDemoStage([{ name: "projectCd", slot: "side" }, { name: "docMap", slot: "main" }]);
    writingDemoShowCaption("演示：DocMap 已经理解成稿结构；现在就文章主线问一个问题。");
    docMapQuestionInput.value = "这篇稿子的主线是什么？";
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
  writingDemoShowCaption("演示：同一份 Project CD 成稿，现在生成 3-5 页 ClioStage 提纲。");
  setStatus(currentLanguage === "zh" ? "演示：正在生成短 Marp 提纲..." : "Demo: generating a short Marp outline...");
  const sourceName = item?.title || writingDemoManuscriptTitle;
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
    ...bodySections.map((section, index) => `## 幻灯 ${index + 1}\n\n${section}`),
  ].join("\n\n");
  const file = await writingDemoAwaitWithModalAccept(generateMarpMarkdownAndOpenClioStage({
    title: sourceName,
    name: sourceName,
    markdown: sourceText,
    folder: preferredFolderName(),
    demoBrief: true,
    maxTokens: 900,
  }), { timeoutMs: 180000, acceptModals: true });
  if (!file) throw new Error(currentLanguage === "zh" ? "ClioStage 没有生成 Marp，演示已停止。" : "ClioStage did not generate Marp; demo stopped.");
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
  writingDemoShowCaption("演示：ClioTalk 在这里不是另一个聊天入口，而是接住 Project CD 成稿，继续问改稿和剪辑问题。");
  attachSelectedProjectCdToAssistantContext();
  rememberInput.checked = true;
  await writingDemoStage([{ name: "assistant", slot: "main" }]);
  const attachedScrap = [...attachedClipIds]
    .map((id) => scraps.find((scrap) => scrap.id === id && isInActiveProject(scrap)))
    .find((scrap) => scrap?.source?.type === "project-cd");
  const ragContext = clipContextContent(attachedScrap?.body || item?.body || "", 4200);
  const questions = [
    "如果把这篇稿子剪成 20 秒 B 站开头，应该抓哪两段，为什么？",
    "正文里哪些判断必须保留原文依据，避免评论区质疑？",
  ];
  for (const question of questions) {
    writingDemoAssertRunning();
    writingDemoShowCaption(`演示：ClioTalk 追问成稿 - ${question}`);
    await writingDemoGenerateAssistantAnswer({
      displayText: question,
      taskKind: "writing-demo-rag",
      maxTokens: writingDemoModelProfile().assistantMaxTokens,
      prompt: `你是 AI System 6 的 ClioTalk。你现在处在写作流程收尾阶段：Project CD 已有最终稿，用户需要围绕成稿继续做剪辑、事实边界和改稿决策。请只根据当前 Project CD 成稿上下文回答用户问题。

要求：
- 先用“写作用途：”说明这个回答会帮助用户做什么写作/剪辑决策。
- 再用 2-4 条短 bullet 直接回答用户问题。
- 最后用“依据：”列 1-2 个来自成稿的段落/句群线索。
- 总长控制在 220 字以内。
- 自然简体中文，不要编造成稿之外的信息。

用户问题：
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
  writingDemoShowCaption("演示：右侧 Context Panel 显示 ClioTalk 引用了当前项目里的 Project CD 成稿。");
  await writingDemoStage([{ name: "assistant", slot: "main" }, { name: "contextPanel", slot: "side" }]);
}

async function playWritingDemo() {
  if (writingDemoRun) {
    stopWritingDemo();
    return;
  }
  writingDemoRun = { stopped: false, windowSlots: new Map(), modalAutoAcceptTimer: 0 };
  writingDemoStartModalAutoAccept();
  document.body.classList.add("writing-demo-recording");
  window.addEventListener("keydown", writingDemoKeydown);
  writingDemoSetButtons(true);
  setStatus(t("writing_demo_running"));
  let terminalStatus = "";
  try {
    const preflightResults = await writingDemoRunPreflight();
    const preflightFailures = preflightResults.filter((item) => !item.ok);
    if (preflightFailures.length) {
      terminalStatus = currentLanguage === "zh" ? "演示准备失败。" : "Live demo preflight failed.";
      setStatus(terminalStatus);
      const failureText = writingDemoFormatPreflightFailures(preflightResults);
      if (preflightFailures.some((item) => item.label === (currentLanguage === "zh" ? "模型通道" : "Model route"))) {
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
    await writingDemoNarrate(`预检通过：${writingDemoModelRouteLabel()}。正式录屏只展示写作主线，后面的生成都走真实 LLM。`, "modelMeter");
    await writingDemoNarrate("新建一块演示项目硬盘，后续所有材料都归入这个项目。", "projects");
    writingDemoCreateProject();
    await writingDemoRunScriptStep("sources", writingDemoSearch);
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

window.AISystem6WritingDemo = {
  play: playWritingDemo,
  stop: stopWritingDemo,
};
window.AISystem6WritingDemoLoaded = true;
