// Feature module: ClioStage / 讲演台 for Marp-style slides.md.

// Lazy-loaded by the ClioStage app, Reader handoff, and Project CD handoff.

window.AISystem6ClioStageLoaded = true;

const clioStageState = {
  source: null,
  parsed: null,
  mode: "document",
  index: 0,
  startedAt: 0,
  timerId: 0,
};

function clioStageElements() {
  return {
    title: document.querySelector("#clio-stage-title"),
    status: document.querySelector("#clio-stage-status"),
    meta: document.querySelector("#clio-stage-meta"),
    viewport: document.querySelector("#clio-stage-viewport"),
    source: document.querySelector("#clio-stage-source-view"),
    document: document.querySelector("#clio-stage-document-view"),
    slide: document.querySelector("#clio-stage-slide-view"),
    cue: document.querySelector("#clio-stage-cue-view"),
    prev: document.querySelector("#clio-stage-prev"),
    page: document.querySelector("#clio-stage-page"),
    next: document.querySelector("#clio-stage-next"),
    askForm: document.querySelector("#clio-stage-ask-form"),
    docMap: document.querySelector("#clio-stage-docmap"),
    question: document.querySelector("#clio-stage-question"),
  };
}

function markdownFenceMarkerForSlides(line) {
  const match = String(line || "").match(/^\s*(`{3,}|~{3,})/);
  return match ? match[1] : "";
}

function parseClioStageMarpDocument(markdown) {
  const lines = normalizeMarkdownText(markdown).split("\n");
  if (lines[0]?.trim() !== "---") return null;

  const frontmatter = [];
  let endIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      endIndex = index;
      break;
    }
    frontmatter.push(lines[index]);
  }
  if (endIndex < 0) return null;

  const meta = {};
  frontmatter.forEach((line) => {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (match) meta[match[1].toLowerCase()] = match[2].replace(/^["']|["']$/g, "").trim();
  });
  if (!/^true$/i.test(meta.marp || "")) return null;

  const bodyLines = lines.slice(endIndex + 1);
  const slides = splitClioStageSlides(bodyLines).map((slide) => slide.join("\n").trim()).filter(Boolean);
  const normalizedSlides = slides.length ? slides : [bodyLines.join("\n").trim()];
  return {
    body: bodyLines.join("\n").trim(),
    slides: normalizedSlides,
    slideMeta: normalizedSlides.map(extractClioStageSlideMeta),
    size: meta.size === "4:3" ? "4:3" : "16:9",
    theme: ["gaia", "uncover"].includes(String(meta.theme || "").toLowerCase()) ? String(meta.theme).toLowerCase() : "default",
    paginate: /^true$/i.test(meta.paginate || ""),
  };
}

function splitClioStageSlides(lines) {
  const slides = [];
  let current = [];
  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;

  function pushSlide() {
    let start = 0;
    let end = current.length;
    while (start < end && !current[start].trim()) start += 1;
    while (end > start && !current[end - 1].trim()) end -= 1;
    if (start < end) slides.push(current.slice(start, end));
    current = [];
  }

  lines.forEach((line) => {
    const fence = markdownFenceMarkerForSlides(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceChar = fence[0];
        fenceLength = fence.length;
      } else if (fence[0] === fenceChar && fence.length >= fenceLength) {
        inFence = false;
        fenceChar = "";
        fenceLength = 0;
      }
      current.push(line);
      return;
    }
    if (!inFence && line.trim() === "---") {
      pushSlide();
      return;
    }
    current.push(line);
  });
  pushSlide();
  return slides;
}

function extractClioStageSlideMeta(slideMarkdown = "") {
  const directives = {};
  normalizeMarkdownText(slideMarkdown).replace(/<!--([\s\S]*?)-->/g, (match, body) => {
    let currentKey = "";
    String(body || "").split("\n").forEach((line) => {
      const directive = line.trim().match(/^_?([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/);
      if (directive) {
        currentKey = directive[1].toLowerCase();
        directives[currentKey] = directive[2].replace(/^["']|["']$/g, "").trim();
        return;
      }
      if (currentKey && Object.prototype.hasOwnProperty.call(directives, currentKey) && line.trim()) {
        directives[currentKey] = `${directives[currentKey] ? `${directives[currentKey]}\n` : ""}${line.trim()}`;
      }
    });
    return "";
  });
  return {
    notes: directives.notes || "",
    header: directives.header || "",
    class: directives.class || "",
    paginate: directives.paginate ? /^true$/i.test(directives.paginate) : null,
  };
}

function clioStageSlideDirectiveInfo(slideMarkdown = "") {
  const meta = extractClioStageSlideMeta(slideMarkdown);
  const cleaned = normalizeMarkdownText(slideMarkdown).replace(/<!--([\s\S]*?)-->/g, (match, body) => {
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();
  return {
    markdown: cleaned,
    paginate: meta.paginate,
  };
}

function clioStageRenderableSlideMarkdown(slideMarkdown = "") {
  return clioStageSlideDirectiveInfo(slideMarkdown).markdown;
}

function clioStageSlideNotes(index) {
  if (!clioStageState.parsed) return "";
  return clioStageState.parsed.slideMeta?.[index]?.notes || "";
}

function clioStageSlideClasses(index) {
  const allowed = new Set(["lead", "divider", "quote", "contrast", "evidence", "takeaway"]);
  const raw = clioStageState.parsed?.slideMeta?.[index]?.class || "";
  return String(raw)
    .split(/\s+/)
    .map((name) => name.trim().toLowerCase())
    .filter((name) => allowed.has(name))
    .map((name) => `clio-stage-slide-kind-${name}`);
}

async function ensureSlidesMarkdownValidForExport(markdown, name = "slides.md", sourceMarkdown = "") {
  if (typeof validateMarpSlidesMarkdown !== "function" && typeof ensureSlidesExportModule === "function") {
    await ensureSlidesExportModule();
  }
  if (typeof validateMarpSlidesMarkdown !== "function") return true;
  const validation = validateMarpSlidesMarkdown(markdown, sourceMarkdown || markdown);
  if (validation.ok) return true;
  const message = typeof formatSlidesValidationError === "function"
    ? formatSlidesValidationError(validation)
    : `Slides Markdown failed validation: ${validation.errors.join(", ")}`;
  setStatus(message);
  await showSystemModal(`${name}: ${message}`, "alert");
  return false;
}

function clioStageSlideTitle(slide, fallback) {
  const line = clioStageRenderableSlideMarkdown(slide).split("\n").find((entry) => entry.trim());
  if (!line) return fallback;
  return line.replace(/^#{1,6}\s+/, "").replace(/^[-*+]\s+/, "").trim().slice(0, 80) || fallback;
}

function updateClioStageTimer() {
  if (clioStageState.mode !== "cue" || !clioStageState.startedAt) return;
  const elapsed = Math.max(0, Date.now() - clioStageState.startedAt);
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  const { meta } = clioStageElements();
  if (meta && clioStageState.parsed) {
    meta.textContent = `${clioStageState.parsed.size} · ${clioStageState.parsed.theme} · ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
}

function syncClioStageControls() {
  const els = clioStageElements();
  const hasSlides = !!clioStageState.parsed;
  [els.source, els.document, els.slide, els.cue, els.prev, els.next].forEach((button) => {
    if (button) button.disabled = !hasSlides;
  });
  syncDocMapEntryButton(els.docMap, chooseDocMapSourceCandidate(null, clioStageDocMapSource()));
  [["source", els.source], ["document", els.document], ["slide", els.slide], ["cue", els.cue]]
    .forEach(([mode, button]) => button?.setAttribute("aria-pressed", clioStageState.mode === mode ? "true" : "false"));
  if (els.prev) els.prev.disabled = !hasSlides || clioStageState.index <= 0 || ["document", "source"].includes(clioStageState.mode);
  if (els.next) els.next.disabled = !hasSlides || clioStageState.index >= (clioStageState.parsed?.slides.length || 1) - 1 || ["document", "source"].includes(clioStageState.mode);
  if (els.page) {
    els.page.textContent = hasSlides
      ? `${clioStageState.index + 1} / ${clioStageState.parsed.slides.length}`
      : "0 / 0";
  }
  if (els.status) {
    els.status.textContent = hasSlides
      ? `${clioStageState.source?.title || t("clio_stage_label")}`
      : t("clio_stage_empty");
  }
  if (els.meta && hasSlides && clioStageState.mode !== "cue") {
    els.meta.textContent = `${clioStageState.parsed.size} · ${clioStageState.parsed.theme} · ${t("clio_stage_slides_count", clioStageState.parsed.slides.length)}`;
  }
}

function renderClioStageEmpty(message = "") {
  const els = clioStageElements();
  if (!els.viewport) return;
  els.viewport.className = "clio-stage-viewport";
  els.viewport.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty-folder-note clio-stage-empty-note";
  empty.textContent = message || t("clio_stage_empty_hint");
  els.viewport.append(empty);
  syncClioStageControls();
}

function renderClioStageDocument() {
  const els = clioStageElements();
  if (!els.viewport || !clioStageState.parsed) return renderClioStageEmpty();
  els.viewport.className = "clio-stage-viewport clio-stage-document";
  els.viewport.replaceChildren();
  const article = document.createElement("article");
  article.className = "reader-body-content clio-stage-document-body";
  article.innerHTML = markdownToSystemHtml(clioStageRenderableSlideMarkdown(clioStageState.parsed.body || clioStageState.source.markdown));
  els.viewport.append(article);
  syncClioStageControls();
}

function renderClioStageSource() {
  const els = clioStageElements();
  if (!els.viewport || !clioStageState.source?.markdown) return renderClioStageEmpty();
  els.viewport.className = "clio-stage-viewport clio-stage-source";
  els.viewport.replaceChildren();
  const source = document.createElement("pre");
  source.className = "clio-stage-source-code";
  source.textContent = clioStageState.source.markdown;
  els.viewport.append(source);
  syncClioStageControls();
}

function renderClioStageSlide() {
  const els = clioStageElements();
  if (!els.viewport || !clioStageState.parsed) return renderClioStageEmpty();
  els.viewport.className = "clio-stage-viewport clio-stage-slide-mode";
  els.viewport.replaceChildren();
  const frame = document.createElement("section");
  frame.className = `clio-stage-slide-frame clio-stage-slide-${clioStageState.parsed.size.replace(":", "-")}`;
  frame.classList.add(...clioStageSlideClasses(clioStageState.index));
  const body = document.createElement("div");
  body.className = "clio-stage-slide-body";
  if (clioStageState.source?.sourceKind === "clioChart" && clioStageState.source.chartSnapshot?.cloneNode) {
    body.classList.add("clio-stage-chart-slide");
    body.replaceChildren(clioStageState.source.chartSnapshot.cloneNode(true));
  } else {
    body.innerHTML = markdownToSystemHtml(clioStageRenderableSlideMarkdown(clioStageState.parsed.slides[clioStageState.index] || ""));
  }
  frame.append(body);
  els.viewport.append(frame);
  syncClioStageControls();
}

function renderClioStageCue() {
  const els = clioStageElements();
  if (!els.viewport || !clioStageState.parsed) return renderClioStageEmpty();
  if (!clioStageState.startedAt) {
    clioStageState.startedAt = Date.now();
    window.clearInterval(clioStageState.timerId);
    clioStageState.timerId = window.setInterval(updateClioStageTimer, 1000);
  }
  els.viewport.className = "clio-stage-viewport clio-stage-cue-mode";
  els.viewport.replaceChildren();
  const current = document.createElement("section");
  current.className = "clio-stage-cue-current";
  current.innerHTML = markdownToSystemHtml(clioStageRenderableSlideMarkdown(clioStageState.parsed.slides[clioStageState.index] || ""));
  const next = document.createElement("aside");
  next.className = "clio-stage-cue-next";
  const nextSlide = clioStageState.parsed.slides[clioStageState.index + 1] || "";
  next.innerHTML = `<span>${escapeHtml(t("next_slide"))}</span><strong>${escapeHtml(nextSlide ? clioStageSlideTitle(nextSlide, "") : t("end_of_deck"))}</strong>`;
  const notesText = clioStageSlideNotes(clioStageState.index);
  if (notesText) {
    const notes = document.createElement("aside");
    notes.className = "clio-stage-cue-next clio-stage-cue-notes";
    notes.innerHTML = `<span>${escapeHtml(t("clio_stage_notes"))}</span><p>${escapeHtml(notesText)}</p>`;
    els.viewport.append(current, notes, next);
  } else {
    els.viewport.append(current, next);
  }
  syncClioStageControls();
  updateClioStageTimer();
}

function renderClioStage() {
  if (!clioStageState.parsed) return renderClioStageEmpty();
  if (clioStageState.mode === "source") return renderClioStageSource();
  if (clioStageState.mode === "cue") return renderClioStageCue();
  if (clioStageState.mode === "slide") return renderClioStageSlide();
  return renderClioStageDocument();
}

function setClioStageMode(mode) {
  if (!clioStageState.parsed) return;
  clioStageState.mode = ["source", "document", "slide", "cue"].includes(mode) ? mode : "document";
  renderClioStage();
  // Reading the deck is not presenting it: the screen is only held for the
  // two modes a person actually stands in front of, and let go on the way out.
  if (clioStageIsPresenting()) window.AISystem6WebPlatform?.holdScreenWakeLock?.("clioStage");
  else window.AISystem6WebPlatform?.releaseScreenWakeLock?.("clioStage");
}

function showClioStageSlide(index) {
  if (!clioStageState.parsed || ["document", "source"].includes(clioStageState.mode)) return;
  clioStageState.index = Math.max(0, Math.min(clioStageState.parsed.slides.length - 1, Number(index) || 0));
  renderClioStage();
}

async function loadClioStageSource(source) {
  const markdown = normalizeMarkdownText(source?.markdown || "");
  const title = source?.title || t("clio_stage_label");
  const parsed = parseClioStageMarpDocument(markdown);
  clioStageState.source = { ...source, title, markdown };
  clioStageState.parsed = null;
  clioStageState.index = 0;
  clioStageState.mode = "slide";
  clioStageState.startedAt = 0;
  window.clearInterval(clioStageState.timerId);

  if (!parsed) {
    const message = currentLanguage === "zh"
      ? `${title}: 这不是有效的 Marp-style slides.md。`
      : `${title}: This is not a valid Marp-style slides.md document.`;
    renderClioStageEmpty(message);
    setStatus(message);
    return false;
  }

  const valid = await ensureSlidesMarkdownValidForExport(markdown, title, markdown);
  if (!valid) {
    renderClioStageEmpty(currentLanguage === "zh" ? "slides.md 未通过本地校验。" : "slides.md did not pass local validation.");
    return false;
  }

  clioStageState.parsed = parsed;
  renderClioStage();
  setStatus(currentLanguage === "zh" ? `讲演台已打开：${title}` : `ClioStage opened: ${title}`);
  return true;
}

function openClioStage(source = null) {
  openWindow("clioStage");
  if (source?.markdown) {
    loadClioStageSource(source);
  } else {
    renderClioStageEmpty();
  }
}

function handleClioStageKeydown(event) {
  if (!clioStageState.parsed || !["slide", "cue"].includes(clioStageState.mode)) return;
  const win = getWindow("clioStage");
  if (!win || win.classList.contains("is-hidden") || !win.classList.contains("is-active")) return;
  if (getActiveEditableElement()) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showClioStageSlide(clioStageState.index - 1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    showClioStageSlide(clioStageState.index + 1);
  }
}

async function askClioStageQuestion(event) {
  event?.preventDefault();
  const els = clioStageElements();
  const question = (els.question?.value || "").trim();
  if (!question) return;
  if (!clioStageState.parsed || !clioStageState.source?.markdown) {
    setStatus(t("clio_stage_no_slides"));
    return;
  }

  const zh = currentLanguage === "zh";
  const currentSlide = clioStageRenderableSlideMarkdown(clioStageState.parsed.slides[clioStageState.index] || "");
  const prompt = [
    resolveWritingRoutePrompt("other-apps.clio-stage-source-question", zh ? "zh" : "en"),
    typeof sideAskAnswerStyleInstruction === "function" ? sideAskAnswerStyleInstruction() : (zh ? "回答要短、自然，不要写审稿报告。" : "Be brief and natural; do not write a review report."),
    typeof ragGroundingInstruction === "function" ? ragGroundingInstruction(zh ? "幻灯片" : "The slide deck") : (zh ? "幻灯片是主要依据，不是回答边界；请区分原文、推断和需要核对的部分。" : "The deck is primary grounding, not the answer boundary; distinguish source text, inference, and points to check."),
    "",
    `${zh ? "用户问题" : "Question"}:\n${question}`,
    "",
    `${zh ? "当前页" : "Current slide"}: ${clioStageState.index + 1} / ${clioStageState.parsed.slides.length}`,
    currentSlide ? `${zh ? "当前页内容" : "Current slide content"}:\n${currentSlide}` : "",
    "",
    `${zh ? "幻灯片文件" : "Deck"}: ${clioStageState.source.title || t("clio_stage_label")}`,
    "完整 Marp slides.md（按预算裁剪）:",
    clipContextContent(clioStageState.source.markdown, 12000),
  ].filter(Boolean).join("\n");

  const paired = typeof arrangeClioStageAssistantSplit === "function"
    ? await arrangeClioStageAssistantSplit()
    : (await openWindow("assistant"), true);
  if (!paired) return;
  if (els.question) els.question.value = "";
  markAskBarSent("clioStage");
  setStatus(t("clio_stage_question_sent"));
  await submitUserText(prompt, {
    displayText: `${t("clio_stage_label")}: ${question}`,
    skipContext: true,
    taskKind: "clio-stage",
  });
}

// The whole slides.md goes with every question, with the current slide called
// out (see askClioStageQuestion) — the scope row says both.
function describeClioStageAskScope() {
  const slides = clioStageState.parsed?.slides;
  if (!slides?.length || !clioStageState.source?.markdown) {
    return { ready: false };
  }
  return {
    ready: true,
    object: clioStageState.source.title || t("clio_stage_label"),
    range: `${t("ask_scope_whole_deck")} · ${clioStageState.index + 1} / ${slides.length}`,
  };
}

// The deck as a DocMap source. slides.md is Markdown, so the map is the deck's
// own structure — no conversion, and the handoff sits with the question the way
// Reader's and Time Machine's do.
function clioStageDocMapSource() {
  const markdown = clioStageState.source?.markdown || "";
  if (!markdown.trim()) return null;
  return docMapSourceWithRange({
    text: markdown,
    label: clioStageState.source?.title || t("clio_stage_label"),
    scope: "clioStage",
    threshold: typeof docMapMinDocumentChars === "number" ? docMapMinDocumentChars : 0,
  });
}

function makeClioStageDocMap() {
  return withDocMap(() => makeDocMapFromCurrentSource(clioStageDocMapSource() || { text: "", scope: "clioStage" }));
}

function bindClioStageControls() {
  const els = clioStageElements();
  if (!els.viewport || els.viewport.dataset.clioStageReady === "true") return;
  els.viewport.dataset.clioStageReady = "true";
  els.source?.addEventListener("click", () => setClioStageMode("source"));
  els.document?.addEventListener("click", () => setClioStageMode("document"));
  els.slide?.addEventListener("click", () => setClioStageMode("slide"));
  els.cue?.addEventListener("click", () => setClioStageMode("cue"));
  els.prev?.addEventListener("click", () => showClioStageSlide(clioStageState.index - 1));
  els.next?.addEventListener("click", () => showClioStageSlide(clioStageState.index + 1));
  els.askForm?.addEventListener("submit", askClioStageQuestion);
  registerAskBarSource("clioStage", describeClioStageAskScope);
  document.addEventListener("keydown", handleClioStageKeydown);
  syncClioStageControls();
}

bindClioStageControls();

// Called by openWindow for every path that reveals the window, including
// session restore. Without it a restored ClioStage shows an empty viewport with
// no controls synced.
function attachClioStage() {
  if (clioStageState.parsed) renderClioStage();
  else renderClioStageEmpty();
}

// Presenting is the one ClioStage mode that costs anything continuously (the
// cue clock) and the one that must not let the screen dim mid-sentence. The
// elapsed time is wall-clock from startedAt, so stopping the interval loses
// nothing: the returning presenter sees the true time, not a rewound one.
function clioStageIsPresenting() {
  return !!clioStageState.parsed && (clioStageState.mode === "cue" || clioStageState.mode === "slide");
}

window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.("clioStage", {
  onSuspend: () => {
    window.AISystem6WebPlatform?.releaseScreenWakeLock?.("clioStage");
    window.clearInterval(clioStageState.timerId);
    clioStageState.timerId = 0;
  },
  onResume: () => {
    if (clioStageState.startedAt && clioStageState.mode === "cue" && !clioStageState.timerId) {
      clioStageState.timerId = window.setInterval(updateClioStageTimer, 1000);
      updateClioStageTimer();
    }
    if (clioStageIsPresenting()) window.AISystem6WebPlatform?.holdScreenWakeLock?.("clioStage");
  },
  onDispose: () => {
    window.AISystem6WebPlatform?.releaseScreenWakeLock?.("clioStage");
    window.clearInterval(clioStageState.timerId);
    clioStageState.timerId = 0;
  },
});

window.AISystem6ClioStage = {
  open: openClioStage,
  attach: attachClioStage,
  load: loadClioStageSource,
  setMode: setClioStageMode,
  showSlide: showClioStageSlide,
  previous: () => showClioStageSlide(clioStageState.index - 1),
  next: () => showClioStageSlide(clioStageState.index + 1),
  parse: parseClioStageMarpDocument,
  splitSlides: splitClioStageSlides,
  handleKeydown: handleClioStageKeydown,
  setStatus: (message) => {
    const status = clioStageElements().status;
    if (status) status.textContent = message;
  },
};

const CLIO_STAGE_COMMAND_NAMES = [
  "clio-stage-docmap",
  "clio-stage-import",
  "clio-stage-previous",
  "clio-stage-next",
  "clio-stage-source",
  "clio-stage-document",
  "clio-stage-slide",
  "clio-stage-cue",
  "focus-clio-stage-question",
];

function clioStageCommandAvailable(action) {
  if (action === "open-clio-stage") return true;
  const activeWindow = document.querySelector(".window.is-active");
  if (activeWindow?.dataset.window !== "clioStage") return false;
  const controlEnabled = (selector) => {
    const control = document.querySelector(selector);
    return !!control && !control.disabled && !control.hidden && !control.classList.contains("is-disabled");
  };
  switch (action) {
    case "clio-stage-docmap":
      return controlEnabled("#clio-stage-docmap");
    case "clio-stage-previous":
      return controlEnabled("#clio-stage-prev");
    case "clio-stage-next":
      return controlEnabled("#clio-stage-next");
    case "clio-stage-source":
      return controlEnabled("#clio-stage-source-view");
    case "clio-stage-document":
      return controlEnabled("#clio-stage-document-view");
    case "clio-stage-slide":
      return controlEnabled("#clio-stage-slide-view");
    case "clio-stage-cue":
      return controlEnabled("#clio-stage-cue-view");
    case "focus-clio-stage-question":
      return controlEnabled("#clio-stage-question");
    default:
      return true;
  }
}

function runClioStageRuntimeCommand(action) {
  if (action === "open-clio-stage") return openClioStage();
  if (action === "clio-stage-docmap") return makeClioStageDocMap();
  if (action === "focus-clio-stage-question") {
    return document.querySelector("#clio-stage-question")?.focus();
  }
  const command = action.slice("clio-stage-".length);
  if (command === "import") {
    openTransientFilePicker({
      accept: ".md,.markdown,.txt,text/markdown,text/plain",
      multiple: true,
      onSelect: (files) => importClioStageDroppedFiles(files),
    });
    return;
  }
  if (command === "previous") return window.AISystem6ClioStage.previous?.();
  if (command === "next") return window.AISystem6ClioStage.next?.();
  if (["source", "document", "slide", "cue"].includes(command)) {
    return window.AISystem6ClioStage.setMode?.(command);
  }
}

window.AISystem6Runtime?.registerApplication({
  id: "clioStage",
  windowName: "clioStage",
  mount: attachClioStage,
  restore: attachClioStage,
  commands: Object.fromEntries(
    ["open-clio-stage", ...CLIO_STAGE_COMMAND_NAMES].map((action) => [action, {
      handler: () => runClioStageRuntimeCommand(action),
      isAvailable: () => clioStageCommandAvailable(action),
    }])
  ),
});
