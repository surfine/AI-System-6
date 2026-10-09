// Feature module: ClioStage / 讲演台 for Marp-style slides.md.

// Lazy-loaded by the ClioStage app, Reader handoff, and Project CD handoff.

window.AISystem6ClioStageLoaded = true;

// --- deck identity ---------------------------------------------------------
// A slides.md may carry a `<!-- clio-deck: … -->` spec written by the slides
// export path. When it does, the deck's own era CSS renders the frames and each
// page's own `_class` decides its layout; when it does not, everything below
// behaves exactly as it always has.

function clioStageDeckRuntime() {
  return typeof window !== "undefined" ? window.AISystem6SlideThemes || null : null;
}

function clioStagePageLayout(markdown, index) {
  const runtime = clioStageDeckRuntime();
  if (!runtime || !markdown) return { layout: "", surface: "" };
  const page = runtime.pages(markdown)[index];
  if (!page) return { layout: "", surface: "" };
  let surface = page.surface;
  if (!surface && page.layout) {
    const layout = runtime.layoutList().find((entry) => entry.id === page.layout);
    if (layout) surface = layout.surface;
  }
  return { layout: page.layout, surface };
}

const clioStageState = {
  source: null,
  parsed: null,
  deckSpec: null,
  mode: "document",
  index: 0,
  startedAt: 0,
  timerId: 0,
  // A deck being drafted from text: what it is drafted from, the way to run
  // it again, and the failure if it did not come back.
  pending: null,
  // The pages that have arrived while the draft is still being written, and the
  // first of the newest batch (the one the entrance animation starts from).
  streaming: false,
  arrivedFrom: -1,
  // The deck's own history (app/core/edit-history.js): whole-deck Markdown
  // snapshots, made when a deck opens.
  history: null,
  // The selected block of the current page, as its place among the page's blocks.
  selected: -1,
};

// A drafted deck is temporary until the writer saves it: it lives in this
// window only and is not restored after a reload.
function clioStageHasUnsavedDraft() {
  return !!clioStageState.source?.temporary && !!clioStageState.parsed;
}

async function confirmDiscardClioStageDraft() {
  if (!clioStageHasUnsavedDraft()) return true;
  if (typeof showSystemModal !== "function") return true;
  const choice = await showSystemModal(t("clio_stage_discard_draft", clioStageState.source.title || t("clio_stage_label")), "confirm", { defaultAction: "cancel" });
  return choice === "yes";
}

function showClioStagePending({ label = "", retry = null } = {}) {
  openWindow("clioStage");
  clioStageState.pending = { label, retry, failed: "" };
  clioStageState.source = null;
  clioStageState.parsed = null;
  renderClioStagePending();
}

function showClioStageFailed(message) {
  if (!clioStageState.pending) return;
  clioStageState.pending.failed = message || t("clio_stage_open_failed");
  // Half a deck is not a deck: the pages that arrived give way to the failure.
  if (clioStageState.streaming) {
    clioStageState.streaming = false;
    clioStageState.source = null;
    clioStageState.parsed = null;
  }
  renderClioStagePending();
}

function renderClioStagePending() {
  const els = clioStageElements();
  const pending = clioStageState.pending;
  if (!els.viewport || !pending) return;
  els.viewport.className = "clio-stage-viewport";
  els.viewport.replaceChildren();
  const note = document.createElement("div");
  note.className = "empty-folder-note clio-stage-empty-note";
  const text = document.createElement("p");
  text.textContent = pending.failed || t("clio_stage_generating", pending.label || t("untitled"));
  note.append(text);
  if (pending.failed && typeof pending.retry === "function") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn default";
    retry.textContent = t("retry");
    retry.addEventListener("click", () => pending.retry());
    note.append(retry);
  }
  els.viewport.append(note);
  syncClioStageControls();
}

async function saveClioStageDraft() {
  const source = clioStageState.source;
  if (!clioStageHasUnsavedDraft()) return null;
  await ensureSlidesExportModule();
  const file = saveTemporaryClioStageDeck(source.markdown, source.saveTarget || { name: source.sourceLabel || source.title });
  if (!file) return null;
  clioStageState.source = { ...source, title: file.name, sourceKind: "teachText", sourceItemId: file.id, temporary: false };
  syncClioStageControls();
  setStatus(t("clio_stage_saved_as", file.name));
  if (typeof updateMenuState === "function") updateMenuState();
  return file;
}

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
    theme: ["gaia", "uncover", "ink"].includes(String(meta.theme || "").toLowerCase()) ? String(meta.theme).toLowerCase() : "default",
    paginate: /^true$/i.test(meta.paginate || ""),
    header: meta.header || "",
    footer: meta.footer || "",
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
    footer: directives.footer || "",
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

// Opening a deck keeps the structural errors (frontmatter, marp, code fences,
// empty pages) and drops the generation gate's rules about count, rhythm and
// mode: those steer the model that drafts a deck, and a deck the writer has since
// edited -- a page added, a layout changed -- is not theirs to be refused for.
const CLIO_STAGE_OPEN_TOLERATES = /^(?:unreasonable_slide_count|surface_run|too_few_heroes|no_dark_surface|mode_layout_drift|mode_layout_mismatch|first_page_not_hero|unknown_layout)\b/;

async function ensureSlidesMarkdownValidForExport(markdown, name = "slides.md", sourceMarkdown = "", { open = false } = {}) {
  if (typeof validateMarpSlidesMarkdown !== "function" && typeof ensureSlidesExportModule === "function") {
    await ensureSlidesExportModule();
  }
  if (typeof validateMarpSlidesMarkdown !== "function") return true;
  const validation = validateMarpSlidesMarkdown(markdown, sourceMarkdown || markdown);
  const errors = open ? validation.errors.filter((error) => !CLIO_STAGE_OPEN_TOLERATES.test(error)) : validation.errors;
  if (!errors.length) return true;
  const reported = { ...validation, errors };
  const message = typeof formatSlidesValidationError === "function"
    ? formatSlidesValidationError(reported)
    : `Slides Markdown failed validation: ${errors.join(", ")}`;
  setStatus(message);
  // A refused export says why in the status line and keeps the reason in the
  // notification list, so a second attempt can still read it.
  pushSystemNotification(`${name}: ${message}`, { state: "failed" });
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
  // A grey deck control says what ClioStage is waiting for: a deck, the slide
  // or cue view, or the other end of the deck. One reason per control.
  const markStage = (control, blocked, reasonKey) => {
    if (!control) return;
    if (typeof markGrayAffordance === "function") markGrayAffordance(control, blocked, reasonKey);
    else {
      control.disabled = blocked;
      if (blocked && reasonKey) control.dataset.balloonHelpDisabled = reasonKey;
      else delete control.dataset.balloonHelpDisabled;
    }
  };
  const needsSlides = "balloon_clio_stage_needs_slides";
  const slideMode = ["document", "source"].includes(clioStageState.mode);
  [els.source, els.document, els.slide, els.cue].forEach((button) => markStage(button, !hasSlides, needsSlides));
  syncDocMapEntryButton(els.docMap, chooseDocMapSourceCandidate(null, clioStageDocMapSource()));
  [["source", els.source], ["document", els.document], ["slide", els.slide], ["cue", els.cue]]
    .forEach(([mode, button]) => button?.setAttribute("aria-pressed", clioStageState.mode === mode ? "true" : "false"));
  const atStart = !hasSlides || slideMode || clioStageState.index <= 0;
  const atEnd = !hasSlides || slideMode || clioStageState.index >= (clioStageState.parsed?.slides.length || 1) - 1;
  markStage(els.prev, atStart, !hasSlides ? needsSlides : slideMode ? "balloon_clio_stage_slide_mode" : "balloon_clio_stage_first_slide");
  markStage(els.next, atEnd, !hasSlides ? needsSlides : slideMode ? "balloon_clio_stage_slide_mode" : "balloon_clio_stage_last_slide");
  if (els.page) {
    els.page.textContent = hasSlides
      ? `${clioStageState.index + 1} / ${clioStageState.parsed.slides.length}`
      : "0 / 0";
  }
  if (els.status) {
    els.status.textContent = hasSlides && clioStageState.streaming
      ? t("clio_stage_streaming_status", clioStageState.parsed.slides.length)
      : hasSlides
      ? [clioStageState.source?.title || t("clio_stage_label"), clioStageHasUnsavedDraft() ? t("clio_stage_unsaved") : ""].filter(Boolean).join(" · ")
      : clioStageState.pending
        ? (clioStageState.pending.failed || t("clio_stage_generating", clioStageState.pending.label || t("untitled")))
        : t("clio_stage_empty");
  }
  const save = document.querySelector("#clio-stage-save-draft");
  if (save) save.hidden = !clioStageHasUnsavedDraft();
  clioStageSyncEditControls();
  if (els.meta && hasSlides && clioStageState.mode !== "cue") {
    els.meta.textContent = `${clioStageState.parsed.size} · ${clioStageState.parsed.theme} · ${t("clio_stage_slides_count", clioStageState.parsed.slides.length)}`;
  }
}

function renderClioStageEmpty(message = "") {
  const els = clioStageElements();
  if (!els.viewport) return;
  els.viewport.className = "clio-stage-viewport";
  els.viewport.replaceChildren();
  // Goal #2/#6: empty deck names Reader / TeachText in the hint — make those
  // steps tappable in-pane (Import Files stays in the details bar).
  const empty = document.createElement("div");
  empty.className = "empty-folder-note clio-stage-empty-note empty-next-note";
  const text = document.createElement("p");
  text.textContent = message || t("clio_stage_empty_hint");
  const teachText = document.createElement("button");
  teachText.type = "button";
  teachText.className = "btn default";
  teachText.dataset.action = "open-teachtext";
  teachText.textContent = t("teachtext");
  const reader = document.createElement("button");
  reader.type = "button";
  reader.className = "btn";
  reader.dataset.action = "open-reader";
  reader.textContent = t("reader");
  empty.append(text, teachText, reader);
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

// --- the page on the stage ----------------------------------------------------
// The stage draws a page with the very markup and CSS the printed sheet uses
// (slideDeckPageHtml / slideDeckPageCss in slide-themes.js), inside a shadow
// root: the desk's CSS never reaches the page and the page's never reaches the
// desk. The page keeps its real size (1280 x 720, 960 x 720 for 4:3) and is
// scaled as one piece to the room it has, so what the writer edits here is
// what the PDF is — the owner's decision of 2026-10-09.
const CLIO_STAGE_PAGE_CHROME_CSS = `
:host { display: block; position: relative; flex: none;
  width: calc(var(--clio-page-w, 1280px) * var(--clio-page-scale, 1));
  height: calc(var(--clio-page-h, 720px) * var(--clio-page-scale, 1)); }
.clio-stage-page-scale { width: var(--clio-page-w, 1280px); height: var(--clio-page-h, 720px);
  transform: scale(var(--clio-page-scale, 1)); transform-origin: 0 0; }
section.is-editable [data-clio-block] { cursor: text; }
section.is-editable [data-clio-block]:hover { outline: calc(1px / var(--clio-page-scale, 1)) dashed currentColor; outline-offset: 4px; }
.is-block-selected, .is-editing { outline: calc(2px / var(--clio-page-scale, 1)) dashed currentColor; outline-offset: 4px; }
.is-editing { outline-style: solid; }
.clio-stage-handles { position: absolute; top: var(--handle-y); left: var(--handle-x);
  width: var(--handle-w); height: var(--handle-h); pointer-events: none; z-index: 2; }
.clio-stage-handle { position: absolute; box-sizing: border-box; padding: 0;
  width: calc(20px / var(--clio-page-scale, 1)); height: calc(20px / var(--clio-page-scale, 1));
  border: calc(1px / var(--clio-page-scale, 1)) solid var(--ink, #000); background-color: var(--paper, #fff);
  pointer-events: auto; touch-action: none; }
.clio-stage-handle-move { top: calc(-12px / var(--clio-page-scale, 1)); left: calc(-12px / var(--clio-page-scale, 1));
  background-image: radial-gradient(var(--ink, #000) 1.2px, transparent 1.6px); background-size: 6px 6px; cursor: move; }
.clio-stage-handle-width { top: calc(50% - 10px / var(--clio-page-scale, 1)); right: calc(-12px / var(--clio-page-scale, 1)); cursor: ew-resize;
  background-image: linear-gradient(90deg, transparent 30%, var(--ink, #000) 30% 40%, transparent 40% 60%, var(--ink, #000) 60% 70%, transparent 70%); }
.clio-stage-guides { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.clio-stage-guide { position: absolute; background: currentColor; }
.clio-stage-guide.is-x { top: 0; bottom: 0; left: var(--at); width: calc(1px / var(--clio-page-scale, 1)); }
.clio-stage-guide.is-y { left: 0; right: 0; top: var(--at); height: calc(1px / var(--clio-page-scale, 1)); }
`;
const clioStagePageCssCache = new Map();

function clioStagePageHost() {
  return clioStageElements().viewport?.querySelector(".clio-stage-page-host") || null;
}

/** The page on the stage: the sheet's <section>, inside the host's shadow root. */
function clioStageFrameElement() {
  return clioStagePageHost()?.shadowRoot?.querySelector("section.clio-print-page") || null;
}

function clioStageMountPage(host, index) {
  const runtime = clioStageDeckRuntime();
  const model = clioStageModel();
  const markdown = clioStageState.source?.markdown || "";
  const page = model ? model.page(markdown, index) : null;
  if (!runtime || page === null || page === undefined) return null;
  const era = clioStageState.deckSpec?.era || runtime.defaultSpec().era;
  const canvas = runtime.pageCanvas(markdown, clioStageState.deckSpec);
  const directives = runtime.pageDirectives(markdown).pages[index] || {};
  if (!clioStagePageCssCache.has(era)) clioStagePageCssCache.set(era, runtime.pageCss(era));
  const root = host.shadowRoot || host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${clioStagePageCssCache.get(era)}${CLIO_STAGE_PAGE_CHROME_CSS}</style><div class="clio-stage-page-scale">${runtime.pageHtml({
    page, index, count: clioStageState.parsed.slides.length, era, canvas, ...directives,
  })}</div>`;
  const box = model.placementCanvas(canvas);
  host.style.setProperty("--clio-page-w", `${box.width}px`);
  host.style.setProperty("--clio-page-h", `${box.height}px`);
  clioStageScalePage(host);
  return root.querySelector("section.clio-print-page");
}

// The whole page fits the room it is given; the type keeps its printed size.
function clioStageScalePage(host) {
  const room = host?.parentElement;
  if (!room) return;
  const width = parseFloat(host.style.getPropertyValue("--clio-page-w")) || 1280;
  const height = parseFloat(host.style.getPropertyValue("--clio-page-h")) || 720;
  // The room is measured with the page out of the way: a page at its last
  // scale can hold the room open and so decide its own size.
  host.style.setProperty("--clio-page-scale", "0.01");
  const across = room.clientWidth / width;
  const down = room.clientHeight / height;
  const scale = Math.max(0.1, (down > 0 ? Math.min(across, down) : across) || 1);
  host.style.setProperty("--clio-page-scale", scale.toFixed(4));
  host.dataset.clioFitScale = scale.toFixed(4);
}

function renderClioStageSlide() {
  const els = clioStageElements();
  if (!els.viewport || !clioStageState.parsed) return renderClioStageEmpty();
  clioStageEndSession();
  els.viewport.className = "clio-stage-viewport clio-stage-slide-mode has-rail";
  els.viewport.replaceChildren();
  // The page rail sits beside the slide (above it in a narrow window); the
  // stage around the page is its own room, so the page scales against the
  // room the rail leaves, not the whole viewport.
  const shell = document.createElement("div");
  shell.className = "clio-stage-edit-shell";
  const room = document.createElement("div");
  room.className = "clio-stage-edit-stage";
  const host = document.createElement("div");
  host.className = "clio-stage-page-host";
  if (clioStageState.streaming && clioStageState.index >= clioStageState.arrivedFrom) host.classList.add("is-arriving");
  room.append(host);
  const rail = clioStageBuildRail();
  shell.append(rail, room);
  els.viewport.append(shell);
  clioStageRevealThumb(rail);
  const frame = clioStageMountPage(host, clioStageState.index);
  clioStageSlideContext = null;
  if (frame) clioStageBindSlideBlocks(frame, frame);
  observeClioStageFit();
  if (frame && clioStageState.selected >= 0) clioStageSelectBlock(frame, clioStageState.selected);
  syncClioStageControls();
  clioStageSyncDeckHealth();
  clioStageCheckEmbedSources();
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
  // The prompter shows the page as it is printed, read-only.
  const currentHost = document.createElement("div");
  currentHost.className = "clio-stage-page-host";
  current.append(currentHost);
  const next = document.createElement("aside");
  next.className = "clio-stage-cue-next";
  const nextSlide = clioStageState.parsed.slides[clioStageState.index + 1] || "";
  next.innerHTML = `<span>${escapeHtml(t("next_slide"))}</span><strong>${escapeHtml(nextSlide ? clioStageSlideTitle(nextSlide, "") : t("end_of_deck"))}</strong>`;
  const notesText = clioStageSlideNotes(clioStageState.index);
  if (notesText) {
    const notes = document.createElement("aside");
    notes.className = "clio-stage-cue-next clio-stage-cue-notes";
    // Speaker notes are markdown too -- rendering them as escaped source
    // put literal ** marks on the prompter.
    notes.innerHTML = `<span>${escapeHtml(t("clio_stage_notes"))}</span>`;
    const notesBody = document.createElement("div");
    notesBody.className = "clio-stage-cue-notes-body";
    notesBody.innerHTML = markdownToSystemHtml(notesText);
    notes.append(notesBody);
    els.viewport.append(current, notes, next);
  } else {
    els.viewport.append(current, next);
  }
  clioStageMountPage(currentHost, clioStageState.index);
  observeClioStageFit();
  syncClioStageControls();
  updateClioStageTimer();
}

// --- the deck's own numbers, on the status line ----------------------------
// A page that overflows, or that the window had to shrink under the reading
// floor, says so where the writer is already looking. The overflow is measured
// with the fit transform lifted, because the fit is exactly what hides it.
function clioStageDeckHealth() {
  const runtime = clioStageDeckRuntime();
  const markdown = clioStageState.source?.markdown || "";
  const spec = clioStageState.deckSpec;
  if (!runtime || !spec) return null;
  const frame = clioStageFrameElement();
  const floor = runtime.fontFloor(spec);
  const page = clioStagePageLayout(markdown, clioStageState.index);
  // The carrier receipt: what every page actually declares, taken from the text
  // rather than from what a prompt intended. The viewer shows one page; the
  // receipt is what a reviewer reads.
  const receipt = runtime.receipt(markdown);
  const health = {
    spec,
    floor,
    page: clioStageState.index + 1,
    layout: page.layout,
    overflow: 0,
    whitespace: 0,
    smallest: 0,
    scale: 1,
    receipt,
    pageEntry: receipt[clioStageState.index] || null,
  };
  if (!frame) return health;
  // Measured on the page at its printed size: where its content ends against
  // the page's own box, and the smallest type it sets.
  const box = frame.getBoundingClientRect();
  const scale = box.width / (frame.offsetWidth || box.width || 1) || 1;
  const kids = Array.from(frame.children).filter((element) => !element.matches(".slide-print-head, .slide-print-foot, .clio-stage-handles, .clio-stage-guides"));
  const bottom = kids.length ? Math.max(...kids.map((element) => element.getBoundingClientRect().bottom)) : box.top;
  const inner = parseFloat(window.getComputedStyle(frame).paddingBottom) || 0;
  health.overflow = Math.max(0, Math.round((bottom - box.bottom) / scale + inner));
  health.whitespace = Math.max(0, Math.round((box.bottom - bottom) / scale - inner));
  let smallest = Infinity;
  frame.querySelectorAll("p, li, td, blockquote, h1, h2, h3, figcaption").forEach((node) => {
    const size = parseFloat(window.getComputedStyle(node).fontSize) || 0;
    if (size > 0) smallest = Math.min(smallest, size);
  });
  health.scale = scale;
  health.smallest = Number.isFinite(smallest) ? Math.round(smallest) : 0;
  return health;
}

// The restyle route: the same deck, another era. The body is untouched — this
// is the one action that changes a deck's identity without regenerating a word
// of it. When the window was opened on a project document the file is updated
// too; when it was handed a copy (Reader, a ClioChart page) the status line says
// the change is in this window only, because that is the truth.
async function clioStageRestyleEra(eraId) {
  const runtime = clioStageDeckRuntime();
  if (!runtime || !clioStageState.source?.markdown || clioStageState.streaming) {
    setStatus(t("clio_stage_no_slides"));
    return false;
  }
  // What the writer has typed reaches the deck before the new era is written over it.
  clioStageEndSession();
  clioStageFlushPersist();
  const spec = { ...(clioStageState.deckSpec || runtime.defaultSpec()), era: eraId };
  const next = runtime.restyle(clioStageState.source.markdown, spec);
  const file = clioStageSourceFile();
  if (file) clioStageWriteFileBody(file, next);
  const reloaded = await loadClioStageSource({ ...clioStageState.source, markdown: next });
  if (!reloaded) return false;
  const era = runtime.byId(eraId);
  setStatus(file
    ? t("clio_stage_restyled_saved", era ? era.label : eraId, file.name)
    : t("clio_stage_restyled_preview", era ? era.label : eraId));
  return true;
}

function clioStageSyncDeckHealth() {
  const health = clioStageDeckHealth();
  const status = clioStageElements().status;
  if (!health || !status) return;
  if (clioStageState.mode !== "slide" || clioStageState.streaming) return;
  const zh = currentLanguage === "zh";
  const title = clioStageState.source?.title || t("clio_stage_label");
  const parts = [title];
  if (health.pageEntry && health.pageEntry.job) parts.push(health.pageEntry.job);
  else if (health.layout) parts.push(health.layout);
  if (health.smallest && health.smallest < health.floor.body) {
    parts.push(zh ? `正文 ${health.smallest}px，低于 ${health.floor.body}px` : `body ${health.smallest}px, under ${health.floor.body}px`);
  }
  if (health.overflow > 0) {
    parts.push(zh ? `溢出 ${health.overflow}px` : `overflows ${health.overflow}px`);
  } else if (health.whitespace > 260) {
    parts.push(zh ? `底部空 ${health.whitespace}px` : `${health.whitespace}px empty below`);
  }
  parts.push(`${clioStageState.index + 1} / ${clioStageState.parsed?.slides.length || 1}`);
  status.textContent = parts.join(" · ");
}

function refitClioStage() {
  const els = clioStageElements();
  if (!els.viewport) return;
  if (clioStageState.mode === "slide" || clioStageState.mode === "cue") clioStageScalePage(clioStagePageHost());
  clioStageRedrawSelection();
}

// The page follows the window: a resize re-scales it (clioStageScalePage).
let clioStageFitObserver = null;

function observeClioStageFit() {
  const els = clioStageElements();
  if (!els.viewport || typeof ResizeObserver !== "function") return;
  if (!clioStageFitObserver) clioStageFitObserver = new ResizeObserver(() => refitClioStage());
  clioStageFitObserver.disconnect();
  clioStageFitObserver.observe(els.viewport);
}

function renderClioStage() {
  if (!clioStageState.parsed) return renderClioStageEmpty();
  if (clioStageState.mode === "source") return renderClioStageSource();
  if (clioStageState.mode === "cue") return renderClioStageCue();
  if (clioStageState.mode === "print") return renderClioStagePrint();
  if (clioStageState.mode === "slide") return renderClioStageSlide();
  return renderClioStageDocument();
}

function setClioStageMode(mode) {
  if (!clioStageState.parsed) return;
  clioStageState.mode = ["source", "document", "slide", "cue", "print"].includes(mode) ? mode : "document";
  renderClioStage();
  // Reading the deck is not presenting it: the screen is only held for the
  // two modes a person actually stands in front of, and let go on the way out.
  if (clioStageIsPresenting()) window.AISystem6WebPlatform?.holdScreenWakeLock?.("clioStage");
  else window.AISystem6WebPlatform?.releaseScreenWakeLock?.("clioStage");
}

function showClioStageSlide(index) {
  if (!clioStageState.parsed || ["document", "source"].includes(clioStageState.mode)) return;
  const next = Math.max(0, Math.min(clioStageState.parsed.slides.length - 1, Number(index) || 0));
  if (next !== clioStageState.index) clioStageState.selected = -1;
  clioStageState.index = next;
  renderClioStage();
}

async function loadClioStageSource(source) {
  const markdown = normalizeMarkdownText(source?.markdown || "");
  const title = source?.title || t("clio_stage_label");
  const parsed = parseClioStageMarpDocument(markdown);
  // Whatever the writer was typing reaches its file before another deck replaces it.
  clioStageEndSession();
  clioStageFlushPersist();
  clioStageState.pending = null;
  clioStageState.streaming = false;
  clioStageState.arrivedFrom = -1;
  clioStageState.selected = -1;
  clioStageState.history = clioStageNewHistory();
  clioStageState.source = { ...source, title, markdown };
  clioStageState.parsed = null;
  const deckRuntime = clioStageDeckRuntime();
  // cleanSpec, not the raw reader: the era becomes a class name on every frame
  // and the print sheet's markup, and the file that named it may not be ours.
  const deckSpecLine = deckRuntime ? deckRuntime.parseSpec(markdown) : null;
  clioStageState.deckSpec = deckRuntime ? (deckSpecLine ? deckRuntime.cleanSpec(deckSpecLine) : deckRuntime.defaultSpec()) : null;
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

  const valid = await ensureSlidesMarkdownValidForExport(markdown, title, markdown, { open: true });
  if (!valid) {
    renderClioStageEmpty(currentLanguage === "zh" ? "slides.md 未通过本地校验。" : "slides.md did not pass local validation.");
    return false;
  }

  clioStageState.parsed = parsed;
  renderClioStage();
  setStatus(t("cliostage_opened", title));
  return true;
}

// A saved deck from a folder: the file is the deck, edits save back into it.
function openClioStageFile(file) {
  if (!file?.body) return Promise.resolve(false);
  return openClioStage({ markdown: file.body, title: file.name, sourceKind: "teachText", sourceItemId: file.id, temporary: false });
}

async function openClioStage(source = null) {
  openWindow("clioStage");
  if (!source?.markdown) {
    if (clioStageState.pending) renderClioStagePending();
    else if (!clioStageState.parsed) renderClioStageEmpty();
    return false;
  }
  // A drafted deck asked before it started drafting; anything else replacing
  // an unsaved draft asks now.
  if (!source.temporary && !(await confirmDiscardClioStageDraft())) return false;
  return loadClioStageSource(source);
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
// The deck as a PDF: one page per slide, the deck's own era CSS inline, the
// deck title and page number in the footer. Same shape as DocMap's print sheet
// (a standalone document written into a popup, then the browser's own print).
// The print sheet: the one HTML both the PDF and Print Preview show, so what
// the writer previews is exactly what the PDF will be.
function clioStagePrintSheet() {
  const runtime = clioStageDeckRuntime();
  const markdown = clioStageState.source?.markdown || "";
  if (!runtime || !markdown.trim() || !clioStageState.parsed?.slides?.length) return null;
  const spec = clioStageState.deckSpec || runtime.parseSpec(markdown) || runtime.defaultSpec();
  return { runtime, spec, html: runtime.printHtml({ title: clioStageState.source?.title || t("clio_stage_label"), markdown, spec }) };
}

function renderClioStagePrint() {
  const els = clioStageElements();
  const sheet = clioStagePrintSheet();
  if (!els.viewport || !sheet) return renderClioStageEmpty();
  clioStageEndSession();
  els.viewport.className = "clio-stage-viewport clio-stage-print-mode";
  const frame = document.createElement("iframe");
  frame.className = "clio-stage-print-preview";
  frame.title = t("clio_stage_print_preview");
  // The sheet is shown, never run: no script in it executes here.
  frame.setAttribute("sandbox", "");
  els.viewport.replaceChildren(frame);
  // The sheet's pages are printed millimetres; on screen they are zoomed to
  // the window's width so a whole page shows. The zoom is screen-only.
  const size = sheet.runtime.printSizes[sheet.spec.canvas] || sheet.runtime.printSizes["16:9"];
  const zoom = Math.max(0.2, Math.min(1, (frame.clientWidth - 32) / (size.width * 3.78)));
  frame.srcdoc = sheet.html.replace(/<\/head>/i, `<style>@media screen { html { zoom: ${zoom.toFixed(3)}; } }</style></head>`);
  syncClioStageControls();
}

function clioStageExportPdf() {
  const sheet = clioStagePrintSheet();
  if (!sheet) {
    setStatus(t("clio_stage_empty"));
    return false;
  }
  const { runtime, spec, html } = sheet;
  const sizes = runtime.printSizes[spec.canvas] || runtime.printSizes["16:9"];
  const popup = window.open("", "_blank", `width=${Math.round(sizes.width * 3.6)},height=${Math.round(sizes.height * 3.6)}`);
  if (!popup) {
    const blocked = t("clio_stage_pdf_blocked");
    setStatus(blocked);
    pushSystemNotification(blocked, { state: "failed" });
    return false;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  setStatus(t("clio_stage_pdf_ready", clioStageState.parsed.slides.length, spec.canvas));
  setTimeout(() => {
    try {
      popup.focus();
      popup.print();
    } catch (error) {
      setStatus(t("clio_stage_pdf_blocked"));
    }
  }, 140);
  return true;
}

function describeClioStageAskScope() {
  const slides = clioStageState.parsed?.slides;
  if (!slides?.length || !clioStageState.source?.markdown || clioStageState.streaming) {
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

// --- editing the deck on the page --------------------------------------------
// Slide View is where a deck is edited: text in place, the page list in the rail,
// the layout in the toolbar, blocks placed by hand. Every edit is a new Markdown
// text for the whole deck -- the page-block model in slide-themes.js does the
// rewriting -- so Source View, the saved file and the undo history all read one
// string. Cue View and a deck still arriving are for looking at, not editing.

const CLIO_STAGE_HISTORY_LIMIT = 100;
const CLIO_STAGE_TYPING_PAUSE_MS = 600;
let clioStageSaveTimer = 0;
let clioStageSession = null;
let clioStageSlideContext = null;
let clioStageDragFrom = -1;

function clioStageModel() {
  return clioStageDeckRuntime()?.model || null;
}

function clioStageCanEdit() {
  const source = clioStageState.source;
  return !!(clioStageState.parsed && source?.markdown && clioStageState.mode === "slide"
    && !source.streaming && clioStageModel());
}

function clioStageCurrentPage() {
  const model = clioStageModel();
  return model && clioStageState.source?.markdown ? model.page(clioStageState.source.markdown, clioStageState.index) : null;
}

function clioStageCurrentPlacement() {
  const page = clioStageCurrentPage();
  return page === null ? {} : clioStageModel().parsePlacement(page, clioStageState.parsed?.size);
}

function clioStageNormalizeText(text) {
  return String(text || "").replace(/ /g, " ").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

// --- history: whole-deck snapshots (app/core/edit-history.js) -----------------
function clioStageNewHistory() {
  return window.AISystem6EditHistory.createEditHistory({
    read: () => clioStageState.source?.markdown || "",
    write: (snapshot) => clioStageApplyMarkdown(snapshot, { record: false }),
    limit: CLIO_STAGE_HISTORY_LIMIT,
  });
}

function clioStagePushHistory(markdown, label = "edit_step_change") {
  if (markdown) clioStageState.history?.record(label, markdown);
}

function clioStageCanUndo() {
  return !!clioStageState.history?.canUndo() && !clioStageState.source?.streaming;
}

function clioStageCanRedo() {
  return !!clioStageState.history?.canRedo() && !clioStageState.source?.streaming;
}

function clioStageStepHistory(command) {
  const history = clioStageState.history;
  if (!history || !clioStageState.source?.markdown || clioStageState.source.streaming) return false;
  // Typing still open is committed first, so it is a step of its own.
  clioStageEndSession();
  if (!history[command]()) {
    setStatus(t(command === "undo" ? "clio_stage_nothing_to_undo" : "clio_stage_nothing_to_redo"));
    return false;
  }
  if (typeof updateMenuState === "function") updateMenuState();
  return true;
}

const undoClioStage = () => clioStageStepHistory("undo");
const redoClioStage = () => clioStageStepHistory("redo");

registerEditHistory("clioStage", () => (clioStageState.source?.streaming || !clioStageState.history ? null : {
  undo: undoClioStage,
  redo: redoClioStage,
  canUndo: clioStageCanUndo,
  canRedo: clioStageCanRedo,
  undoLabel: () => clioStageState.history.undoLabel(),
  redoLabel: () => clioStageState.history.redoLabel(),
}));

// --- writing the deck back ------------------------------------------------------
function clioStageSourceFile() {
  const id = clioStageState.source?.sourceItemId;
  return id && typeof chatFiles !== "undefined" ? chatFiles.find((entry) => entry.id === id) || null : null;
}

function clioStageWriteFileBody(file, body) {
  file.body = body;
  file.updatedAt = new Date().toISOString();
  if (typeof markDeskDirty === "function") markDeskDirty("chatFiles", file.id);
  if (typeof saveDeskState === "function") saveDeskState();
  if (typeof renderDocuments === "function") renderDocuments();
  if (typeof renderProjectDisks === "function") renderProjectDisks();
}

// A temporary draft stays temporary and a copy (Reader, a chart) stays in this
// window; only a deck that is a project document is written to its file.
function clioStagePersist(mode) {
  const source = clioStageState.source;
  if (!source || source.temporary || source.streaming) return;
  if (!clioStageSourceFile()) {
    if (!source.copyNoted) {
      source.copyNoted = true;
      setStatus(t("clio_stage_edit_copy_only"));
    }
    return;
  }
  window.clearTimeout(clioStageSaveTimer);
  if (mode === "debounce") {
    clioStageSaveTimer = window.setTimeout(clioStageFlushPersist, CLIO_STAGE_TYPING_PAUSE_MS);
    return;
  }
  clioStageFlushPersist();
}

function clioStageFlushPersist() {
  window.clearTimeout(clioStageSaveTimer);
  clioStageSaveTimer = 0;
  const source = clioStageState.source;
  const file = clioStageSourceFile();
  if (!file || !source || source.temporary || source.streaming || file.body === source.markdown) return;
  clioStageWriteFileBody(file, source.markdown);
}

// The one door every edit passes through. `render: false` is for typing, where
// the element the writer is in must not be replaced under them.
function clioStageApplyMarkdown(next, { index, record = true, label, render = true, save = "now" } = {}) {
  const source = clioStageState.source;
  if (!source || !next || next === source.markdown) return false;
  const parsed = parseClioStageMarpDocument(next);
  if (!parsed) return false;
  if (record) clioStagePushHistory(source.markdown, label);
  const previousIndex = clioStageState.index;
  source.markdown = next;
  clioStageState.parsed = parsed;
  clioStageState.index = Math.max(0, Math.min(parsed.slides.length - 1, index === undefined ? previousIndex : index));
  if (clioStageState.index !== previousIndex) clioStageState.selected = -1;
  clioStagePersist(save);
  if (render) renderClioStage();
  else {
    syncClioStageControls();
    clioStageRefreshRail();
  }
  if (typeof updateMenuState === "function") updateMenuState();
  return true;
}

// --- the page list ----------------------------------------------------------------
function clioStageEditDeck(change, options) {
  const model = clioStageModel();
  if (!clioStageCanEdit()) return false;
  clioStageEndSession();
  const next = change(model, clioStageState.source.markdown);
  return next ? clioStageApplyMarkdown(next, options) : false;
}

function clioStageAddSlide() {
  return clioStageEditDeck(
    (model, markdown) => model.addPage(markdown, clioStageState.index, t("clio_stage_new_slide_title")),
    { index: clioStageState.index + 1, label: "edit_step_add_page" }
  );
}

function clioStageDuplicateSlide() {
  return clioStageEditDeck((model, markdown) => model.duplicatePage(markdown, clioStageState.index), { index: clioStageState.index + 1, label: "edit_step_duplicate" });
}

function clioStageDeleteSlide() {
  if (clioStageCanEdit() && clioStageState.parsed.slides.length < 2) {
    setStatus(t("clio_stage_last_slide_kept"));
    return false;
  }
  return clioStageEditDeck((model, markdown) => model.deletePage(markdown, clioStageState.index), {
    index: Math.min(clioStageState.index, clioStageState.parsed.slides.length - 2),
    label: "edit_step_delete_page",
  });
}

function clioStageMovePage(from, to) {
  const current = clioStageState.index;
  const following = from === current ? to : from < current && to >= current ? current - 1 : from > current && to <= current ? current + 1 : current;
  return clioStageEditDeck((model, markdown) => model.movePage(markdown, from, to), { index: following, label: "edit_step_move_page" });
}

function clioStageSetLayout(layoutId) {
  return clioStageEditDeck((model, markdown) => {
    const page = model.page(markdown, clioStageState.index);
    return page === null ? null : model.withPage(markdown, clioStageState.index, model.withLayout(page, layoutId));
  }, { label: "edit_step_layout" });
}

function clioStageSetPlacement(placement) {
  return clioStageEditDeck((model, markdown) => {
    const page = model.page(markdown, clioStageState.index);
    return page === null ? null : model.withPage(markdown, clioStageState.index, model.withPlacement(page, placement, clioStageState.parsed.size));
  }, { label: "edit_step_move" });
}

function clioStageResetPlacement() {
  if (!Object.keys(clioStageCurrentPlacement()).length) return false;
  clioStageState.selected = -1;
  return clioStageSetPlacement({});
}

function clioStageThumbTitle(slide) {
  return clioStageSlideTitle(slide, "").replace(/^(?:>\s*|\d{1,9}[.)]\s+)/, "").replace(/[*_`]/g, "").trim();
}

function clioStageLayoutLabel(layout) {
  return currentLanguage === "zh" ? layout.zh : layout.en;
}

function clioStageBuildRail() {
  const parsed = clioStageState.parsed;
  const runtime = clioStageDeckRuntime();
  const editable = clioStageCanEdit();
  const layouts = runtime ? runtime.layoutList() : [];
  const rail = document.createElement("nav");
  rail.className = "clio-stage-rail";
  rail.setAttribute("aria-label", t("clio_stage_rail_label"));
  const tools = document.createElement("div");
  tools.className = "clio-stage-rail-tools";
  [
    ["add", "clio_stage_rail_add", "clio_stage_slide_add", clioStageAddSlide],
    ["duplicate", "clio_stage_rail_duplicate", "clio_stage_slide_duplicate", clioStageDuplicateSlide],
    ["delete", "clio_stage_rail_delete", "clio_stage_slide_delete", clioStageDeleteSlide],
  ].forEach(([id, label, title, run]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn mini-btn clio-stage-rail-button";
    button.dataset.clioStageRail = id;
    button.textContent = t(label);
    button.title = t(title);
    button.setAttribute("aria-label", t(title));
    button.disabled = !editable || (id === "delete" && parsed.slides.length < 2);
    button.addEventListener("click", run);
    tools.append(button);
  });
  const list = document.createElement("ol");
  list.className = "clio-stage-thumbs";
  parsed.slides.forEach((slide, index) => {
    const classes = runtime ? runtime.pageClasses(slide) : { layout: "", surface: "" };
    const layout = layouts.find((entry) => entry.id === classes.layout);
    const surface = classes.surface || layout?.surface || "";
    const title = clioStageThumbTitle(slide) || t("untitled");
    const item = document.createElement("li");
    item.className = "clio-stage-thumb-item";
    if (clioStageState.streaming && index >= clioStageState.arrivedFrom) item.classList.add("is-arriving");
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "clio-stage-thumb";
    thumb.dataset.surface = surface;
    thumb.setAttribute("aria-label", t("clio_stage_thumb_label", index + 1, title));
    if (index === clioStageState.index) thumb.setAttribute("aria-current", "true");
    const number = document.createElement("span");
    number.className = "clio-stage-thumb-number";
    number.textContent = String(index + 1);
    const name = document.createElement("span");
    name.className = "clio-stage-thumb-title";
    name.textContent = title;
    const kind = document.createElement("span");
    kind.className = "clio-stage-thumb-layout";
    kind.textContent = layout ? clioStageLayoutLabel(layout) : "";
    thumb.append(number, name, kind);
    thumb.addEventListener("click", () => showClioStageSlide(index));
    if (editable) {
      // Alt + arrow moves the page: the same reorder, for a keyboard.
      thumb.addEventListener("keydown", (event) => {
        if (!event.altKey || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const to = index + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1);
        if (to >= 0 && to < parsed.slides.length) clioStageMovePage(index, to);
      });
      item.draggable = true;
      item.addEventListener("dragstart", (event) => {
        clioStageDragFrom = index;
        event.dataTransfer?.setData("text/plain", String(index));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      item.addEventListener("dragend", () => {
        clioStageDragFrom = -1;
        list.querySelectorAll(".is-drop-before, .is-drop-after").forEach((node) => node.classList.remove("is-drop-before", "is-drop-after"));
      });
      item.addEventListener("dragover", (event) => {
        if (clioStageDragFrom < 0) return;
        event.preventDefault();
        const box = item.getBoundingClientRect();
        const across = window.getComputedStyle(list).flexDirection === "row";
        const after = across ? event.clientX - box.left > box.width / 2 : event.clientY - box.top > box.height / 2;
        item.classList.toggle("is-drop-after", after);
        item.classList.toggle("is-drop-before", !after);
      });
      item.addEventListener("dragleave", () => item.classList.remove("is-drop-before", "is-drop-after"));
      item.addEventListener("drop", (event) => {
        if (clioStageDragFrom < 0) return;
        event.preventDefault();
        const from = clioStageDragFrom;
        const after = item.classList.contains("is-drop-after");
        clioStageDragFrom = -1;
        let to = index + (after ? 1 : 0);
        if (from < to) to -= 1;
        if (to !== from) clioStageMovePage(from, to);
        else item.classList.remove("is-drop-before", "is-drop-after");
      });
    }
    item.append(thumb);
    list.append(item);
  });
  rail.append(tools, list);
  return rail;
}

// Titles and counts change while the writer types; the rail follows without
// being rebuilt around the focused text.
function clioStageRefreshRail() {
  const viewport = clioStageElements().viewport;
  const old = viewport?.querySelector(".clio-stage-rail");
  if (!old || !clioStageState.parsed) return;
  const scroller = old.querySelector(".clio-stage-thumbs");
  const left = scroller?.scrollLeft || 0;
  const top = scroller?.scrollTop || 0;
  const fresh = clioStageBuildRail();
  old.replaceWith(fresh);
  const next = fresh.querySelector(".clio-stage-thumbs");
  if (next) {
    next.scrollLeft = left;
    next.scrollTop = top;
  }
  clioStageRevealThumb(fresh);
}

function clioStageRevealThumb(rail) {
  const list = rail?.querySelector(".clio-stage-thumbs");
  const current = list?.querySelector("[aria-current]")?.parentElement;
  if (!list || !current) return;
  if (current.offsetTop < list.scrollTop) list.scrollTop = current.offsetTop;
  else if (current.offsetTop + current.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = current.offsetTop + current.offsetHeight - list.clientHeight;
  if (current.offsetLeft < list.scrollLeft) list.scrollLeft = current.offsetLeft;
  else if (current.offsetLeft + current.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = current.offsetLeft + current.offsetWidth - list.clientWidth;
}

// --- layout select and Reset Layout, summoned with the module ----------------------
function clioStageEnsureEditControls() {
  if (document.querySelector("#clio-stage-layout")) return;
  const toolbar = document.querySelector(".clio-stage-toolbar");
  if (!toolbar) return;
  const field = document.createElement("span");
  field.className = "clio-stage-layout-field";
  field.setAttribute("role", "group");
  field.setAttribute("aria-labelledby", "clio-stage-layout-label");
  field.hidden = true;
  const label = document.createElement("span");
  label.id = "clio-stage-layout-label";
  label.className = "clio-stage-layout-label";
  const wrap = document.createElement("span");
  wrap.className = "select-wrap";
  const select = document.createElement("select");
  select.id = "clio-stage-layout";
  select.addEventListener("change", () => {
    if (select.value) clioStageSetLayout(select.value);
  });
  wrap.append(select);
  field.append(label, wrap);
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "btn clio-stage-reset-layout";
  reset.id = "clio-stage-reset-layout";
  reset.hidden = true;
  reset.addEventListener("click", clioStageResetPlacement);
  toolbar.append(field, reset);
}

function clioStageSyncEditControls() {
  const select = document.querySelector("#clio-stage-layout");
  const reset = document.querySelector("#clio-stage-reset-layout");
  if (!select || !reset) return;
  const field = select.closest(".clio-stage-layout-field");
  const show = clioStageCanEdit();
  field.hidden = !show;
  reset.hidden = !show || !Object.keys(clioStageCurrentPlacement()).length;
  if (!show) return;
  if (select.dataset.language !== currentLanguage) {
    select.dataset.language = currentLanguage;
    const none = document.createElement("option");
    none.value = "";
    none.textContent = t("clio_stage_layout_none");
    select.replaceChildren(none, ...clioStageDeckRuntime().layoutList().map((layout) => {
      const option = document.createElement("option");
      option.value = layout.id;
      option.textContent = clioStageLayoutLabel(layout);
      return option;
    }));
    document.querySelector("#clio-stage-layout-label").textContent = t("clio_stage_layout_label");
    select.setAttribute("aria-label", t("clio_stage_layout_label"));
    reset.textContent = t("clio_stage_reset_layout");
    if (typeof initSystemSelectControls === "function") initSystemSelectControls();
  }
  const page = clioStageState.parsed.slides[clioStageState.index] || "";
  select.value = clioStageDeckRuntime().pageClasses(page).layout || "";
  if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
}

// --- the slide: blocks, selection, text in place -------------------------------------
const CLIO_STAGE_BLOCK_TAGS = {
  heading: /^H[1-6]$/,
  paragraph: /^P$/,
  image: /^P$/,
  list: /^[UO]L$/,
  quote: /^BLOCKQUOTE$/,
  table: /^TABLE$/,
  fence: /^PRE$/,
};

// Rendered children and source blocks pair by position. A page whose rendering
// does not line up one for one (raw HTML, a setext heading) stays view-only
// rather than editing the wrong block.
function clioStageBindSlideBlocks(frame, body) {
  clioStageSlideContext = null;
  const model = clioStageModel();
  const source = clioStageState.source;
  const page = model && source?.markdown ? model.page(source.markdown, clioStageState.index) : null;
  if (page === null) return;
  const content = model.contentBlocks(model.parseBlocks(page));
  // The page's own header and footer are not blocks of its text.
  const kids = Array.from(body.children).filter((element) => !element.matches(".slide-print-head, .slide-print-foot"));
  const lines = (block) => block.raw.split("\n")[0];
  const fits = kids.length === content.length && kids.every((element, at) => {
    const block = content[at].block;
    const pattern = CLIO_STAGE_BLOCK_TAGS[block.type] || (/^\s*(`{3,}|~{3,})/.test(lines(block)) ? CLIO_STAGE_BLOCK_TAGS.fence : null);
    return !pattern || pattern.test(element.tagName);
  });
  if (!fits) return;
  const size = clioStageState.parsed.size;
  const box = model.placementCanvas(size);
  const placement = model.parsePlacement(page, size);
  // A placed block already stands where the sheet prints it (the page markup
  // carries its position); only its number is added here.
  kids.forEach((element, at) => { element.dataset.clioBlock = String(at); });
  clioStageSlideContext = { content, placement, box };
  if (clioStageCanEdit()) {
    frame.classList.add("is-editable");
    frame.addEventListener("click", (event) => clioStageFrameClick(event, frame));
  }
}


// Inline, because the deck's own rules give a paragraph a footnote margin and a
// text measure, and a placed block means exactly the position and width it says.
function clioStageStylePlaced(element, entry, box) {
  element.classList.add("clio-stage-placed");
  element.style.position = "absolute";
  element.style.margin = "0";
  element.style.maxWidth = "none";
  element.style.boxSizing = "border-box";
  element.style.left = `${(entry.x / box.width) * 100}%`;
  element.style.top = `${(entry.y / box.height) * 100}%`;
  if (typeof entry.w === "number") element.style.width = `${(entry.w / box.width) * 100}%`;
  else element.style.removeProperty("width");
}

// Where the frame is on the screen, and how many screen pixels one slide unit is.
// The frame itself is never scaled by the fit (that scales its body), but the
// window may be, so the measured box is compared with the layout box.
function clioStageFrameMetrics(frame) {
  const model = clioStageModel();
  const box = model.placementCanvas(clioStageState.parsed?.size);
  const rect = frame.getBoundingClientRect();
  const k = frame.offsetWidth ? rect.width / frame.offsetWidth : 1;
  return {
    box,
    k,
    originX: rect.left + frame.clientLeft * k,
    originY: rect.top + frame.clientTop * k,
    unitX: (frame.clientWidth * k) / box.width,
    unitY: (frame.clientHeight * k) / box.height,
  };
}

function clioStageFrameClick(event, frame) {
  if (event.target.closest(".clio-stage-handles") || !clioStageCanEdit()) return;
  const block = event.target.closest("[data-clio-block]");
  if (!block || !frame.contains(block)) {
    clioStageEndSession();
    clioStageSelectBlock(frame, -1);
    return;
  }
  clioStageSelectBlock(frame, Number(block.dataset.clioBlock));
  clioStageBeginEdit(block, event);
}

function clioStageSelectBlock(frame, index) {
  clioStageState.selected = index;
  frame.querySelectorAll(".is-block-selected").forEach((element) => element.classList.remove("is-block-selected"));
  const element = index >= 0 ? frame.querySelector(`[data-clio-block="${index}"]`) : null;
  element?.classList.add("is-block-selected");
  clioStageDrawHandles(frame, element);
}

function clioStageRedrawSelection() {
  const frame = clioStageFrameElement();
  if (!frame || clioStageState.selected < 0) return;
  clioStageDrawHandles(frame, frame.querySelector(`[data-clio-block="${clioStageState.selected}"]`));
}

function clioStageDrawHandles(frame, element) {
  let layer = frame.querySelector(".clio-stage-handles");
  if (!element || !clioStageSlideContext || !clioStageCanEdit()) {
    layer?.remove();
    return;
  }
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "clio-stage-handles";
    ["move", "width"].forEach((mode) => {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = `clio-stage-handle clio-stage-handle-${mode}`;
      handle.setAttribute("aria-label", t(mode === "move" ? "clio_stage_handle_move" : "clio_stage_handle_width"));
      handle.addEventListener("pointerdown", (event) => clioStageStartDrag(event, frame, mode));
      layer.append(handle);
    });
    frame.append(layer);
  }
  const m = clioStageFrameMetrics(frame);
  const rect = element.getBoundingClientRect();
  layer.style.setProperty("--handle-x", `${(rect.left - m.originX) / m.k}px`);
  layer.style.setProperty("--handle-y", `${(rect.top - m.originY) / m.k}px`);
  layer.style.setProperty("--handle-w", `${rect.width / m.k}px`);
  layer.style.setProperty("--handle-h", `${rect.height / m.k}px`);
}

// A block leaves the flow when its handle first moves, not when it is clicked, so
// selecting a block is free. Pointer deltas are screen pixels: dividing by the
// frame's measured unit turns them into slide units whatever the window size,
// the page zoom or the fit the body is currently under.
function clioStageStartDrag(event, frame, mode) {
  const index = clioStageState.selected;
  const element = frame.querySelector(`[data-clio-block="${index}"]`);
  const context = clioStageSlideContext;
  const model = clioStageModel();
  if (!element || !context || !model || event.button > 0) return;
  event.preventDefault();
  event.stopPropagation();
  clioStageEndSession();
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  const m = clioStageFrameMetrics(frame);
  if (!m.unitX || !m.unitY) return;
  const rect = element.getBoundingClientRect();
  const existing = context.placement[String(index)];
  const start = existing
    ? { x: existing.x, y: existing.y, w: existing.w === undefined ? rect.width / m.unitX : existing.w }
    : { x: (rect.left - m.originX) / m.unitX, y: (rect.top - m.originY) / m.unitY, w: rect.width / m.unitX };
  let live = null;
  const height = rect.height / m.unitY;
  // The block lines up with the page's edges and centre and with the other
  // blocks (app/core/edit-snap.js); Option held places it freely.
  const unitRect = (other) => {
    const box = other.getBoundingClientRect();
    return { x: (box.left - m.originX) / m.unitX, y: (box.top - m.originY) / m.unitY, w: box.width / m.unitX, h: box.height / m.unitY };
  };
  const snapper = window.AISystem6EditSnap?.createSnapper({
    rects: [...frame.querySelectorAll("[data-clio-block]")].filter((other) => other !== element).map(unitRect),
    frame: { w: m.box.width, h: m.box.height },
    threshold: 6 / m.unitX,
  });
  const onMove = (move) => {
    const dx = (move.clientX - event.clientX) / m.unitX;
    const dy = (move.clientY - event.clientY) / m.unitY;
    if (!live && Math.hypot(move.clientX - event.clientX, move.clientY - event.clientY) < 3) return;
    let entry = mode === "move" ? { x: start.x + dx, y: start.y + dy, w: start.w } : { x: start.x, y: start.y, w: start.w + dx };
    let guides = null;
    if (snapper && mode === "move") {
      guides = snapper.snap({ ...entry, h: height }, { disabled: move.altKey });
      entry = { ...entry, x: guides.x, y: guides.y };
    } else if (snapper) {
      // Resizing moves the right edge only: snap that edge alone.
      guides = snapper.snap({ x: entry.x + entry.w, y: entry.y, w: 0, h: height }, { disabled: move.altKey });
      guides.guides = guides.guides.filter((guide) => guide.axis === "x");
      guides.spacing = [];
      entry = { ...entry, w: guides.x - entry.x };
    }
    live = model.cleanPlacement({ [index]: entry }, clioStageState.parsed.size)[index];
    if (!live) return;
    clioStageStylePlaced(element, live, m.box);
    clioStageDrawHandles(frame, element);
    clioStageDrawGuides(frame, guides?.guides || [], m.box);
  };
  const onEnd = () => {
    clioStageDrawGuides(frame, [], m.box);
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onEnd);
    handle.removeEventListener("pointercancel", onEnd);
    if (live) clioStageSetPlacement({ ...context.placement, [index]: live });
  };
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onEnd);
  handle.addEventListener("pointercancel", onEnd);
}

// Guides across the page where a dragged block lined up, in page units.
function clioStageDrawGuides(frame, guides, box) {
  let layer = frame.querySelector(".clio-stage-guides");
  if (!guides.length) {
    layer?.remove();
    return;
  }
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "clio-stage-guides";
    layer.setAttribute("aria-hidden", "true");
    frame.append(layer);
  }
  layer.replaceChildren(...guides.map((guide) => {
    const line = document.createElement("div");
    line.className = `clio-stage-guide is-${guide.axis}`;
    line.style.setProperty("--at", `${(guide.at / (guide.axis === "x" ? box.width : box.height)) * 100}%`);
    return line;
  }));
}

function clioStageBeginEdit(blockElement, event) {
  const entry = clioStageSlideContext?.content[Number(blockElement.dataset.clioBlock)];
  if (!entry?.block.editable) return;
  let target = blockElement;
  let item = -1;
  if (entry.block.type === "list") {
    const row = event.target.closest("li");
    if (!row || row.parentElement !== blockElement) return;
    item = Array.from(blockElement.children).indexOf(row);
    if (!entry.block.items[item]?.editable || row.querySelector("ul, ol")) return;
    target = row;
  }
  if (clioStageSession?.target === target) return;
  clioStageEndSession();
  const session = {
    target,
    block: Number(blockElement.dataset.clioBlock),
    item,
    original: clioStageNormalizeText(target.textContent),
    before: clioStageState.source.markdown,
    changed: false,
    cancelled: false,
    timer: 0,
  };
  clioStageSession = session;
  try { target.contentEditable = "plaintext-only"; } catch (error) { /* older engines: plain "true" below */ }
  if (target.contentEditable !== "plaintext-only") target.contentEditable = "true";
  target.classList.add("is-editing");
  session.onInput = () => {
    window.clearTimeout(session.timer);
    session.timer = window.setTimeout(() => clioStageCommitSession(session), CLIO_STAGE_TYPING_PAUSE_MS);
  };
  session.onKeydown = (key) => {
    if (key.isComposing) return;
    if (key.key === "Enter") { key.preventDefault(); target.blur(); }
    else if (key.key === "Escape") { key.preventDefault(); session.cancelled = true; target.blur(); }
  };
  // Pasted text is text: one line, no markup, whatever the clipboard carried.
  session.onPaste = (paste) => {
    paste.preventDefault();
    const text = (paste.clipboardData || window.clipboardData)?.getData("text/plain") || "";
    document.execCommand("insertText", false, clioStageNormalizeText(text));
  };
  session.onBlur = () => clioStageEndSession();
  target.addEventListener("input", session.onInput);
  target.addEventListener("keydown", session.onKeydown);
  target.addEventListener("paste", session.onPaste);
  target.addEventListener("blur", session.onBlur);
  target.focus({ preventScroll: true });
  clioStagePlaceCaret(target, event.clientX, event.clientY);
}

function clioStagePlaceCaret(target, x, y) {
  let range = null;
  // The page lives in a shadow root; the caret search is told to look inside it.
  const root = target.getRootNode();
  const shadowRoots = typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot ? [root] : [];
  if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(x, y, { shadowRoots });
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
    }
  } else if (typeof document.caretRangeFromPoint === "function") {
    range = document.caretRangeFromPoint(x, y);
  }
  if (!range || !target.contains(range.startContainer)) {
    range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
  }
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

// Typing is committed after a pause and once more on leaving, never per key, and
// the element being typed in is left alone: the deck text is rewritten behind it.
function clioStageCommitSession(session) {
  window.clearTimeout(session.timer);
  if (!session.target.isConnected || !clioStageCanEdit()) return false;
  const text = clioStageNormalizeText(session.target.textContent);
  if (text === session.original) return false;
  const model = clioStageModel();
  const markdown = clioStageState.source.markdown;
  const page = model.page(markdown, clioStageState.index);
  const edited = page === null ? null : model.editBlockText(model.parseBlocks(page), session.block, text, session.item);
  if (!edited) return false;
  const next = model.withPage(markdown, clioStageState.index, model.serializeBlocks(edited));
  if (!clioStageApplyMarkdown(next, { record: false, render: false, save: "debounce" })) return false;
  session.original = text;
  session.changed = true;
  return true;
}

function clioStageEndSession() {
  const session = clioStageSession;
  if (!session) return;
  clioStageSession = null;
  session.target.removeEventListener("input", session.onInput);
  session.target.removeEventListener("keydown", session.onKeydown);
  session.target.removeEventListener("paste", session.onPaste);
  session.target.removeEventListener("blur", session.onBlur);
  window.clearTimeout(session.timer);
  if (session.target.isConnected) {
    session.target.removeAttribute("contenteditable");
    session.target.classList.remove("is-editing");
  }
  const source = clioStageState.source;
  if (session.cancelled) {
    if (source && source.markdown !== session.before) clioStageApplyMarkdown(session.before, { record: false, render: false, save: "now" });
    if (clioStageState.mode === "slide") renderClioStage();
    return;
  }
  const committed = clioStageCommitSession(session);
  // The text typed was refused (emptied, or the block no longer takes text):
  // put back what the deck says.
  if (!committed && !session.changed && clioStageNormalizeText(session.target.textContent) !== session.original && clioStageState.mode === "slide") renderClioStage();
  if (session.changed && source && source.markdown !== session.before) {
    clioStagePushHistory(session.before, "edit_step_typing");
    clioStagePersist("now");
    if (typeof updateMenuState === "function") updateMenuState();
  }
  refitClioStage();
}

// --- a deck still arriving ------------------------------------------------------------
// Generation writes the deck a page at a time. Whatever pages a following `---`
// has closed are drawn in the rail and on the stage as they come, read-only; the
// final open() replaces all of it with the finished, editable deck.
function showClioStageStreaming(markdownSoFar, { label = "" } = {}) {
  const model = clioStageModel();
  const first = !clioStageState.streaming;
  if (first && !clioStageState.pending) openWindow("clioStage");
  const pending = clioStageState.pending || { label, retry: null, failed: "" };
  pending.label = label || pending.label;
  pending.failed = "";
  clioStageState.pending = pending;
  clioStageState.streaming = true;
  const complete = model ? model.completePages(normalizeMarkdownText(markdownSoFar)) : "";
  const parsed = complete ? parseClioStageMarpDocument(complete) : null;
  if (!parsed) {
    clioStageState.source = null;
    clioStageState.parsed = null;
    renderClioStagePending();
    return false;
  }
  const previous = clioStageState.parsed?.slides.length || 0;
  const following = first || !clioStageState.parsed || clioStageState.index >= previous - 1;
  clioStageState.source = { markdown: complete, title: pending.label || t("clio_stage_label"), streaming: true, temporary: false };
  clioStageState.parsed = parsed;
  clioStageState.arrivedFrom = previous;
  const runtime = clioStageDeckRuntime();
  const deckSpecLine = runtime ? runtime.parseSpec(complete) : null;
  clioStageState.deckSpec = runtime ? (deckSpecLine ? runtime.cleanSpec(deckSpecLine) : runtime.defaultSpec()) : null;
  if (first) clioStageState.mode = "slide";
  clioStageState.index = following ? parsed.slides.length - 1 : Math.min(clioStageState.index, parsed.slides.length - 1);
  clioStageState.selected = -1;
  renderClioStage();
  return true;
}

function bindClioStageControls() {
  const els = clioStageElements();
  if (!els.viewport || els.viewport.dataset.clioStageReady === "true") return;
  els.viewport.dataset.clioStageReady = "true";
  clioStageEnsureExportButton();
  clioStageEnsureEditControls();
  els.source?.addEventListener("click", () => setClioStageMode("source"));
  els.document?.addEventListener("click", () => setClioStageMode("document"));
  els.slide?.addEventListener("click", () => setClioStageMode("slide"));
  els.cue?.addEventListener("click", () => setClioStageMode("cue"));
  els.prev?.addEventListener("click", () => showClioStageSlide(clioStageState.index - 1));
  els.next?.addEventListener("click", () => showClioStageSlide(clioStageState.index + 1));
  els.askForm?.addEventListener("submit", askClioStageQuestion);
  // A drawing ClioChart made for this deck opens on its canvas from a
  // double-click; edits there redraw the picture on this page.
  els.viewport?.addEventListener("dblclick", (event) => {
    // The page is in a shadow root: the real target is the first in the path.
    const path = event.composedPath();
    const image = path.find((node) => node.tagName === "IMG");
    const frame = path.find((node) => node.classList?.contains("clio-print-page"));
    if (!image || !frame) return;
    editClioStagePageEmbed([...frame.querySelectorAll("img")].indexOf(image));
  });
  registerAskBarSource("clioStage", describeClioStageAskScope);
  document.addEventListener("keydown", handleClioStageKeydown);
  syncClioStageControls();
}

// The deck's print button belongs to ClioStage, so it arrives with the module
// rather than sitting in the shell's permanent payload. It lands in the details
// bar the window already renders, beside the import button.
function clioStageEnsureExportButton() {
  if (document.querySelector("#clio-stage-export-pdf")) return;
  const bar = document.querySelector(".clio-stage-details-bar");
  if (!bar) return;
  const save = document.createElement("button");
  save.className = "btn details-bar-button default";
  save.type = "button";
  save.id = "clio-stage-save-draft";
  save.hidden = true;
  save.setAttribute("data-action", "clio-stage-save-draft");
  save.setAttribute("data-i18n", "clio_stage_save_draft");
  save.textContent = t("clio_stage_save_draft");
  bar.insertBefore(save, bar.querySelector("#clio-stage-status"));
  const button = document.createElement("button");
  button.className = "btn details-bar-button";
  button.type = "button";
  button.id = "clio-stage-export-pdf";
  button.setAttribute("data-action", "clio-stage-export-pdf");
  button.setAttribute("data-i18n", "print_pdf");
  button.textContent = t("print_pdf");
  bar.insertBefore(button, bar.querySelector("#clio-stage-status"));
}

bindClioStageControls();

// Called by openWindow for every path that reveals the window, including
// session restore. Without it a restored ClioStage shows an empty viewport with
// no controls synced.
function attachClioStage() {
  if (clioStageState.parsed) renderClioStage();
  else if (clioStageState.pending) renderClioStagePending();
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
    clioStageEndSession();
    clioStageFlushPersist();
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
    clioStageEndSession();
    clioStageFlushPersist();
    window.AISystem6WebPlatform?.releaseScreenWakeLock?.("clioStage");
    window.clearInterval(clioStageState.timerId);
    clioStageState.timerId = 0;
  },
});

// --- embeds on a page (app/core/edit-embeds.js) ------------------------------
// Whatever another editor drew on a page — a concept drawing, a chart, a
// cover, a sketch — is a copy that opens back in that editor from a
// double-click. Each change there redraws the picture here as one undoable
// deck edit; the editor never reaches past this page.
function clioStageEmbedPalette() {
  const runtime = clioStageDeckRuntime();
  const era = runtime?.byId(clioStageState.deckSpec?.era || runtime.defaultSpec().era);
  const tokens = era?.tokens || {};
  return { ink: tokens.ink || "#111111", tint: tokens.tint || "#e8e8e8", muted: tokens.muted || "#555555", paper: "transparent", body: tokens.body || "" };
}

// The editor for each kind of embed: it opens a copy of embed.data and calls
// onChange(nextData, { svg } | { png }) whenever the copy changes.
const CLIO_STAGE_EMBED_EDITORS = {
  diagram: async (embed, onChange, context) => {
    await ensureClioChartModule();
    await openWindow("clioChart");
    const api = window.AISystem6ClioDiagram;
    const chart = window.AISystem6ClioChart;
    if (!api || !chart) return false;
    chart.showDiagramMode?.();
    api.onStatus = (message) => chart.setStatus?.(message);
    api.load(embed.data, {
      temporary: false,
      source: { label: context.title, text: context.sourceText },
      onChange: (next) => onChange(structuredClone(next), { svg: api.svg(next, clioStageEmbedPalette(), { fit: true }) }),
    });
    return true;
  },
  cover: async (embed, onChange) => {
    await ensureLiquidCoverModule();
    const glass = window.AISystem6CoverGlass;
    return !!glass?.editEmbed && glass.editEmbed(embed.data, { onChange: (data, png) => onChange(data, { png }) });
  },
  sketch: async (embed, onChange) => {
    await ensureClioPaintModule();
    const paint = window.AISystem6ClioPaint;
    return !!paint?.editEmbed && paint.editEmbed(embed.data, { onChange: (data) => onChange(data, { png: data.png }) });
  },
  chart: async (embed, onChange, context) => {
    await ensureClioChartModule();
    const chart = window.AISystem6ClioChart;
    if (!chart?.editEmbed) return false;
    return chart.editEmbed(embed.data, {
      title: context.title,
      onChange: (data, table) => {
        const projection = table.config?.projection && table.config.projection !== "source" ? table.config.projection : "";
        const shown = projection ? table : chart.orientForChart(table);
        const svg = chart.projectionSvg(shown, projection || chart.deckProjection(shown), clioStageEmbedPalette(), { omitHeading: context.hasHeading, fit: true });
        onChange(data, { svg });
      },
    });
  },
};

// The originals an embed can be copied from, by app. Each returns the
// original's data now — in the shape the copy was made from, so contentRev()
// compares like with like — or null when the original is gone.
const CLIO_STAGE_EMBED_SOURCES = {
  clioChart: async (source) => {
    const file = chatFiles.find((item) => item.id === source.fileId);
    return file?.clioDiagram ? structuredClone(file.clioDiagram) : null;
  },
  docMap: async (source) => {
    const file = chatFiles.find((item) => item.id === source.fileId);
    if (!file?.docMap) return null;
    await ensureDocMapModule();
    return window.AISystem6DocMapEmbeds?.branchDiagram(file.docMap, source.ref || "central") || null;
  },
  liquidCover: async (source) => {
    const file = chatFiles.find((item) => item.id === source.fileId && item.artifactKind === "cover");
    return file?.cover ? structuredClone(file.cover) : null;
  },
  clioPaint: async (source) => {
    const record = typeof imageAttachmentById === "function" ? imageAttachmentById(source.fileId) : null;
    return record?.originalDataUrl || null;
  },
  clioProject: async (source) => {
    const project = typeof projects !== "undefined" ? projects.find((item) => item.id === source.fileId) : null;
    if (!project) return null;
    await ensureClioProjectModule();
    return window.AISystem6ClioProjectWindow?.timelineDiagram?.(project) || null;
  },
};

// A copy whose original moved on says so under the page, with Sync (take the
// original, one undoable step) and Keep (stay as is until it changes again).
// Nothing here ever writes without the writer's click.
async function clioStageCheckEmbedSources() {
  const kit = window.AISystem6EditEmbeds;
  const model = clioStageModel();
  const source = clioStageState.source;
  if (!kit || !model || !source?.markdown || clioStageState.mode !== "slide") return;
  const index = clioStageState.index;
  const page = model.page(source.markdown, index) || "";
  const checks = await Promise.all(kit.parseEmbeds(page).map(async (embed, ordinal) => {
    const read = embed.source && CLIO_STAGE_EMBED_SOURCES[embed.source.app];
    if (!read) return null;
    const original = await read(embed.source).catch(() => undefined);
    if (original === undefined) return null;
    const rev = original === null ? null : kit.contentRev(original);
    const state = kit.sourceState(embed, rev);
    return state === "current" ? null : { ordinal, embed, original, rev, state };
  }));
  const host = clioStageElements().viewport;
  host?.querySelector(".clio-stage-embed-sync")?.remove();
  const stale = checks.filter(Boolean);
  // The page may have changed while the originals were being read.
  if (!host || !stale.length || clioStageState.index !== index || clioStageState.source?.markdown !== source.markdown) return;
  const bar = document.createElement("div");
  bar.className = "clio-stage-embed-sync";
  bar.setAttribute("role", "status");
  stale.forEach((item) => {
    const row = document.createElement("p");
    row.textContent = t(item.state === "missing" ? "clio_stage_embed_original_missing" : "clio_stage_embed_original_changed", t(`clio_stage_embed_app_${item.embed.source.app}`));
    if (item.state === "changed") {
      const sync = document.createElement("button");
      sync.type = "button";
      sync.className = "btn";
      sync.textContent = t("clio_stage_embed_sync");
      sync.addEventListener("click", () => clioStageResolveEmbedSource(index, item, "sync"));
      const keep = document.createElement("button");
      keep.type = "button";
      keep.className = "btn";
      keep.textContent = t("clio_stage_embed_keep");
      keep.addEventListener("click", () => clioStageResolveEmbedSource(index, item, "keep"));
      row.append(" ", sync, " ", keep);
    }
    bar.append(row);
  });
  host.append(bar);
}

function clioStageResolveEmbedSource(index, item, choice) {
  const kit = window.AISystem6EditEmbeds;
  const model = clioStageModel();
  const current = model?.page(clioStageState.source?.markdown || "", index);
  if (!kit || current === null || current === undefined) return false;
  let redrawn;
  if (choice === "sync" && item.embed.kind === "cover") {
    // A cover is drawn by Cover Glass: the original opens there as the
    // slide's copy, and its first picture is written back as the sync.
    const nextSource = { ...item.embed.source, rev: item.rev, kept: undefined };
    CLIO_STAGE_EMBED_EDITORS.cover({ data: { doc: item.original } }, (data, picture) => {
      const page = model.page(clioStageState.source?.markdown || "", index);
      const next = page === null ? null : kit.replaceEmbed(page, item.ordinal, { data, ...picture, source: nextSource });
      if (next && next !== page) clioStageApplyMarkdown(model.withPage(clioStageState.source.markdown, index, next), { index, label: "edit_step_sync" });
    }).then(async (opened) => {
      const png = opened ? await window.AISystem6CoverGlass?.renderDataUrl?.() : "";
      const page = model.page(clioStageState.source?.markdown || "", index);
      const next = png && page !== null ? kit.replaceEmbed(page, item.ordinal, { data: { doc: item.original }, png, source: nextSource }) : null;
      if (next) clioStageApplyMarkdown(model.withPage(clioStageState.source.markdown, index, next), { index, label: "edit_step_sync" });
    });
    return true;
  }
  if (choice === "sync" && item.embed.kind === "sketch") {
    // A sketch's original is its saved picture.
    redrawn = kit.replaceEmbed(current, item.ordinal, { data: { png: item.original }, png: item.original, source: { ...item.embed.source, rev: item.rev, kept: undefined } });
  } else if (choice === "sync") {
    const diagram = window.AISystem6ClioDiagram;
    // A saved drawing keeps its own placement; a branch or a plan is laid out.
    const placed = Number.isFinite(item.original?.nodes?.[0]?.x);
    const data = !placed && diagram?.layout ? diagram.layout(structuredClone(item.original)) : structuredClone(item.original);
    const svg = diagram?.svg ? diagram.svg(data, clioStageEmbedPalette(), { fit: true }) : "";
    redrawn = kit.replaceEmbed(current, item.ordinal, { data, ...(svg ? { svg } : {}), source: { ...item.embed.source, rev: item.rev, kept: undefined } });
  } else {
    redrawn = kit.replaceEmbed(current, item.ordinal, { data: item.embed.data, source: { ...item.embed.source, kept: item.rev } });
  }
  if (!redrawn) return false;
  return clioStageApplyMarkdown(model.withPage(clioStageState.source.markdown, index, redrawn), { index, label: choice === "sync" ? "edit_step_sync" : "edit_step_change" });
}

// Which embed a double-clicked picture is: the nth picture on the page is the
// nth Markdown image, and an embed belongs to the picture just before it.
function clioStageEmbedForImage(page, imageOrdinal) {
  const images = [...String(page || "").matchAll(/!\[[^\]]*\]\(/g)].map((match) => match.index);
  const at = images[imageOrdinal];
  if (at === undefined) return -1;
  return window.AISystem6EditEmbeds.parseEmbeds(page).findIndex((embed) => embed.image?.start === at);
}

async function editClioStagePageEmbed(imageOrdinal = 0) {
  const source = clioStageState.source;
  const model = clioStageModel();
  if (!source || !model || !clioStageCanEdit()) return false;
  const index = clioStageState.index;
  const page = model.page(source.markdown, index);
  const ordinal = clioStageEmbedForImage(page, imageOrdinal);
  const embed = ordinal >= 0 ? window.AISystem6EditEmbeds.parseEmbeds(page)[ordinal] : null;
  const editor = embed && CLIO_STAGE_EMBED_EDITORS[embed.kind];
  if (!editor) return false;
  const opened = await editor(embed, (data, picture) => {
    const current = model.page(clioStageState.source?.markdown || "", index);
    const redrawn = current === null ? null : window.AISystem6EditEmbeds.replaceEmbed(current, ordinal, { data, ...picture });
    if (redrawn && redrawn !== current) clioStageApplyMarkdown(model.withPage(clioStageState.source.markdown, index, redrawn), { index, label: "edit_step_drawing" });
  }, { title: source.title, sourceText: source.sourceText || "", hasHeading: /^#{1,3}\s/m.test(page) });
  if (opened) setStatus(t("clio_stage_drawing_opened", index + 1));
  return !!opened;
}

// --- one-line edits from SideAsk --------------------------------------------
// The writer says what to change about this page; the model returns the page
// (or the pages it should become); the deck's own gates run on the result;
// nothing lands until the writer accepts the side-by-side.
function clioStageProposalPrompt(page, instruction, selectedText) {
  const zh = currentLanguage === "zh";
  return [
    `${zh ? "指令" : "Instruction"}: ${instruction}`,
    selectedText ? `${zh ? "选中的部分" : "Selected part"}: ${selectedText}` : "",
    `${zh ? "返回一行 JSON" : "Return one line of JSON"}: {"reply":"","pages":["<this page in Marp Markdown, keeping its <!-- _class --> and notes lines>"]}. ${zh ? "要拆成几页就给几项；只改这一页。" : "Give one item per resulting page; change only this page."}`,
    `${zh ? "这一页" : "This page"}:\n${page}`,
    clioStageState.source?.sourceText ? `${zh ? "来源文字" : "Source text"}:\n${String(clioStageState.source.sourceText).slice(0, 6000)}` : "",
  ].filter(Boolean).join("\n");
}

async function proposeClioStageEdit(instruction) {
  const text = String(instruction || "").trim();
  const source = clioStageState.source;
  const model = clioStageModel();
  if (!text || !source?.markdown || !model || !clioStageCanEdit()) return false;
  const index = clioStageState.index;
  const page = model.page(source.markdown, index);
  if (page === null) return false;
  const blocks = model.contentBlocks(model.parseBlocks(page));
  const selectedText = clioStageState.selected >= 0 ? blocks[clioStageState.selected]?.raw || "" : "";
  await ensureClioChartModule();
  await ensureSlidesExportModule();
  if (!beginLongTask("clio-stage-edit", t("clio_edit_working"))) return false;
  renderClioStageProposal({ pending: true, instruction: text, index });
  try {
    const answer = await window.AISystem6ClioChart.requestEditJson(clioStageProposalPrompt(page, text, selectedText), 2000);
    const pages = (Array.isArray(answer?.pages) ? answer.pages : [])
      .map((item) => normalizeMarkdownText(String(item || "")).trim())
      .filter((item) => item && !/^---\s*$/m.test(item));
    if (!pages.length) throw new Error(answer?.reply || t("clio_chart_prose_unreadable"));
    const next = model.withPage(source.markdown, index, pages.join("\n\n---\n\n"));
    // Numbers and quotes are checked against the source and the deck as it is:
    // an edit may move what the deck already says, never add to it.
    const allowed = `${source.sourceText || ""}\n${source.markdown}`;
    const blocked = typeof marpDeckGroundingErrors === "function" ? marpDeckGroundingErrors(next, allowed) : [];
    renderClioStageProposal({ instruction: text, index, reply: String(answer.reply || "").slice(0, 160), pages, next, blocked });
    endLongTask("clio-stage-edit");
    return true;
  } catch (error) {
    if (!isAbortError(error)) markActiveLongTaskFailed(error?.message || "");
    renderClioStageProposal({ instruction: text, index, failed: isAbortError(error) ? t("stopped") : (error?.message || t("clio_chart_prose_unreadable")) });
    endLongTask("clio-stage-edit");
    return false;
  }
}

function renderClioStageProposal(state) {
  const pane = clioStageElements().viewport?.parentElement;
  if (!pane) return;
  pane.querySelector(".clio-stage-proposal")?.remove();
  if (!state) return;
  const panel = document.createElement("section");
  panel.className = "clio-stage-proposal";
  panel.setAttribute("aria-live", "polite");
  const head = document.createElement("p");
  const title = document.createElement("b");
  title.textContent = t("clio_edit_proposal_for", state.instruction);
  head.append(title);
  panel.append(head);
  const actions = document.createElement("div");
  actions.className = "clio-stage-proposal-actions";
  const discard = document.createElement("button");
  discard.type = "button";
  discard.className = "btn";
  discard.textContent = t(state.next && !state.blocked?.length ? "clio_edit_discard" : "close");
  discard.addEventListener("click", () => panel.remove());
  if (state.pending || state.failed) {
    const line = document.createElement("p");
    line.textContent = state.failed || t("clio_edit_working");
    panel.append(line);
    if (state.failed) { actions.append(discard); panel.append(actions); }
    pane.append(panel);
    return;
  }
  const model = clioStageModel();
  const pair = document.createElement("div");
  pair.className = "clio-stage-proposal-pair";
  const column = (key, pages) => {
    const figure = document.createElement("figure");
    pages.forEach((page) => {
      const sheet = document.createElement("div");
      sheet.className = "clio-stage-proposal-page reader-body-content";
      sheet.innerHTML = markdownToSystemHtml(clioStageRenderableSlideMarkdown(page));
      figure.append(sheet);
    });
    const caption = document.createElement("figcaption");
    caption.textContent = t(key);
    figure.append(caption);
    return figure;
  };
  pair.append(column("clio_edit_now", [model.page(clioStageState.source.markdown, state.index) || ""]), column("clio_edit_proposed", state.pages));
  panel.append(pair);
  if (state.reply) {
    const reply = document.createElement("p");
    reply.textContent = state.reply;
    panel.append(reply);
  }
  if (state.blocked?.length) {
    const gate = document.createElement("p");
    gate.className = "clio-stage-proposal-refused";
    gate.textContent = t("clio_edit_blocked", state.blocked.map((error) => (typeof marpSkillValidationErrorLabel === "function" ? marpSkillValidationErrorLabel(error) : error)).join("；"));
    panel.append(gate);
    actions.append(discard);
  } else {
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "btn default";
    accept.textContent = t("clio_edit_accept");
    accept.addEventListener("click", () => {
      panel.remove();
      clioStageEndSession();
      if (clioStageApplyMarkdown(state.next, { index: state.index, label: "edit_step_accept" })) setStatus(t("clio_edit_accepted"));
    });
    actions.append(discard, accept);
  }
  panel.append(actions);
  pane.append(panel);
}

// What SideAsk reads first: this page, and the part selected on it.
function clioStageSideAskContext() {
  const source = clioStageState.source;
  const model = clioStageModel();
  if (!source?.markdown || !model) return null;
  const page = model.page(source.markdown, clioStageState.index) || "";
  const blocks = model.contentBlocks(model.parseBlocks(page));
  return {
    index: clioStageState.index,
    count: model.pageCount(source.markdown),
    page,
    selected: clioStageState.selected >= 0 ? blocks[clioStageState.selected]?.raw || "" : "",
  };
}

window.AISystem6ClioStage = {
  open: openClioStage,
  openFile: openClioStageFile,
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
  exportPdf: clioStageExportPdf,
  showPending: showClioStagePending,
  showStreaming: showClioStageStreaming,
  showFailed: showClioStageFailed,
  undo: undoClioStage,
  redo: redoClioStage,
  canUndo: clioStageCanUndo,
  canRedo: clioStageCanRedo,
  addSlide: clioStageAddSlide,
  duplicateSlide: clioStageDuplicateSlide,
  deleteSlide: clioStageDeleteSlide,
  movePage: clioStageMovePage,
  setLayout: clioStageSetLayout,
  resetPlacement: clioStageResetPlacement,
  canEdit: clioStageCanEdit,
  confirmDiscard: confirmDiscardClioStageDraft,
  hasUnsavedDraft: clioStageHasUnsavedDraft,
  saveDraft: saveClioStageDraft,
  proposeEdit: proposeClioStageEdit,
  editPageDrawing: editClioStagePageEmbed,
  sideAskContext: clioStageSideAskContext,
  deckSpec: () => clioStageState.deckSpec,
  health: clioStageDeckHealth,
};

const CLIO_STAGE_COMMAND_NAMES = [
  "clio-stage-docmap",
  "clio-stage-save-draft",
  "clio-stage-import",
  "clio-stage-export-pdf",
  "clio-stage-print-preview",
  "clio-stage-restyle-classic",
  "clio-stage-restyle-platinum",
  "clio-stage-restyle-aqua",
  "clio-stage-restyle-snow-leopard",
  "clio-stage-restyle-yosemite",
  "clio-stage-restyle-big-sur",
  "clio-stage-restyle-liquid-glass",
  "clio-stage-restyle-nextstep",
  "clio-stage-add-slide",
  "clio-stage-duplicate-slide",
  "clio-stage-delete-slide",
  "clio-stage-reset-layout",
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
  // "#clio-stage-docmap" is the one button here that also carries its own
  // data-action, so the generic menu-availability sweep in window-manager.js
  // toggles its "is-disabled" class from THIS function's own return value
  // every updateMenuState() cycle. Reading that class back here would close
  // a loop on itself: once a session starts with no deck loaded, the class
  // starts true, this function forever sees it as true, and the sweep keeps
  // reapplying it — the button never recovers even after syncDocMapEntryButton
  // correctly clears the .disabled property once a real deck is loaded. Only
  // the DOM-native .disabled/.hidden are load-bearing; the class is an output
  // of this computation, not an input to it.
  const controlEnabled = (selector) => {
    const control = document.querySelector(selector);
    return !!control && !control.disabled && !control.hidden;
  };
  switch (action) {
    case "clio-stage-docmap":
      return controlEnabled("#clio-stage-docmap");
    case "clio-stage-save-draft":
      return clioStageHasUnsavedDraft();
    case "clio-stage-add-slide":
    case "clio-stage-duplicate-slide":
      return clioStageCanEdit();
    case "clio-stage-print-preview":
      return !!clioStageState.parsed?.slides?.length;
    case "clio-stage-delete-slide":
      return clioStageCanEdit() && clioStageState.parsed.slides.length > 1;
    case "clio-stage-reset-layout":
      return clioStageCanEdit() && Object.keys(clioStageCurrentPlacement()).length > 0;
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
  if (command === "export-pdf") return clioStageExportPdf();
  if (command === "print-preview") return window.AISystem6ClioStage.setMode?.("print");
  if (command === "save-draft") return saveClioStageDraft();
  if (command === "add-slide") return clioStageAddSlide();
  if (command === "duplicate-slide") return clioStageDuplicateSlide();
  if (command === "delete-slide") return clioStageDeleteSlide();
  if (command === "reset-layout") return clioStageResetPlacement();
  if (command.startsWith("restyle-")) return clioStageRestyleEra(command.slice("restyle-".length));
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
