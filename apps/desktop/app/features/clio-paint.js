// Feature module: ClioPaint — the first Claris piece, a 1-bit painting
// surface in the MacPaint lineage, plus 草图变大纲 (sketch to outline).
//
// Lazy-loaded by the Applications finder-item and by open-clio-paint. Its
// stylesheet (styles.clio-paint.css) travels with it — see
// ensureClioPaintModule in app/core/config.js.
//
// Object model, kept deliberately small:
//   - The bitmap is a picture. It lives in the existing imageAttachments
//     store (DB v5, surface "clioPaint"), one project's worth at a time —
//     no new store, no new persistence boundary.
//   - Sketch to Outline / Sketch to Image Prompt are one-way, one-time
//     reads. Nothing here writes back to the sketch, and nothing here
//     reaches into the writing route on its own: the writer reviews the
//     result and explicitly applies or copies it. See
//     internal/evidence/drafts/sketch-to-outline/index.html for the prior
//     design draft this reuses evidence from (four loss-stop rules: an
//     always-visible "could not read" note, never inventing more sections
//     than the sketch can support, routing output through the Outline's own
//     validateGeneratedWritingOutline guardrail, and a side-by-side echo so
//     a bad read is visible rather than silently trusted). That draft argued
//     against building the canvas at all; today's ruling built it anyway,
//     so only its reading-mechanics evidence is reused here.
//   - The tool palette is a plain approximation of the classic paint-program
//     grammar (pencil / eraser / fill / line / rect / oval / marquee /
//     text), not a reproduction of a specific native resource — there is no
//     System 6 MacPaint to draw from, so no fidelity claim is made beyond
//     "the same shape of tool set."

window.AISystem6ClioPaintLoaded = true;

const CLIO_PAINT_CANVAS_W = 480;
const CLIO_PAINT_CANVAS_H = 300;
const CLIO_PAINT_TOOLS = ["pencil", "eraser", "fill", "line", "rect", "oval", "marquee", "text"];

function installClioPaintWindow() {
  if (typeof document === "undefined") return;
  if (document.querySelector('[data-window="clioPaint"]')) return;
  window.AISystem6ApplicationShell.createWindow({
    windowName: "clioPaint",
    windowClass: "clio-paint-window",
    labelledBy: "clio-paint-title",
    // Naming law: a Clio- name marks an application (ClioTalk/ClioStage
    // precedent). Untranslated in both languages, so no titleKey.
    title: "ClioPaint",
    statusClass: "compact-status-bar",
    statusHtml: `
          <span class="status-bar-leading" id="clio-paint-status-label"></span>
          <span class="status-bar-trailing clio-paint-status-actions">
            <button class="btn mini-btn details-bar-button" type="button" id="clio-paint-save" data-action="clio-paint-save" data-i18n="save">Save</button>
            <button class="btn mini-btn details-bar-button" type="button" id="clio-paint-sketch-outline" data-action="clio-paint-sketch-outline" data-i18n="clio_paint_sketch_to_outline">Sketch to Outline</button>
            <button class="btn mini-btn details-bar-button" type="button" id="clio-paint-sketch-prompt" data-action="clio-paint-sketch-prompt" data-i18n="clio_paint_sketch_to_prompt">Sketch to Image Prompt</button>
          </span>`,
    beforePaneHtml: `
          <div class="clio-paint-toolbar" id="clio-paint-toolbar" role="toolbar" data-i18n-aria-label="clio_paint_toolbar_label" aria-label="Paint tools">
            <button class="view-switch-option" type="button" data-clio-paint-tool="pencil" aria-pressed="true" data-i18n="clio_paint_tool_pencil">Pencil</button>
            <button class="view-switch-option" type="button" data-clio-paint-tool="eraser" aria-pressed="false" data-i18n="clio_paint_tool_eraser">Eraser</button>
            <button class="view-switch-option" type="button" data-clio-paint-tool="fill" aria-pressed="false" data-i18n="clio_paint_tool_fill">Fill</button>
            <button class="view-switch-option" type="button" data-clio-paint-tool="line" aria-pressed="false" data-i18n="clio_paint_tool_line">Line</button>
            <button class="view-switch-option" type="button" data-clio-paint-tool="rect" aria-pressed="false" data-i18n="clio_paint_tool_rect">Rectangle</button>
            <button class="view-switch-option" type="button" data-clio-paint-tool="oval" aria-pressed="false" data-i18n="clio_paint_tool_oval">Oval</button>
            <button class="view-switch-option" type="button" data-clio-paint-tool="marquee" aria-pressed="false" data-i18n="clio_paint_tool_marquee">Select</button>
            <button class="view-switch-option" type="button" data-clio-paint-tool="text" aria-pressed="false" data-i18n="clio_paint_tool_text">Text</button>
            <span class="clio-paint-tool-sep" aria-hidden="true"></span>
            <button class="view-switch-option" type="button" id="clio-paint-shape-filled" aria-pressed="false" data-action="clio-paint-shape-filled-toggle" data-i18n="clio_paint_shape_filled">Filled</button>
            <span class="clio-paint-tool-sep" aria-hidden="true"></span>
            <button class="view-switch-option" type="button" data-action="clio-paint-undo" data-i18n="undo">Undo</button>
            <button class="view-switch-option" type="button" data-action="clio-paint-new" data-i18n="clio_paint_new">New</button>
          </div>
          <div class="clio-paint-patterns" id="clio-paint-patterns" role="listbox" data-i18n-aria-label="clio_paint_patterns_label" aria-label="Patterns"></div>`,
    paneClass: "clio-paint-pane",
    paneHtml: `
          <div class="clio-paint-canvas-wrap" id="clio-paint-canvas-wrap">
            <canvas id="clio-paint-canvas" class="clio-paint-canvas" width="${CLIO_PAINT_CANVAS_W}" height="${CLIO_PAINT_CANVAS_H}" tabindex="0" data-clio-paint-tool="pencil" role="img" data-i18n-aria-label="clio_paint_canvas_label" aria-label="Painting canvas"></canvas>
            <div class="clio-paint-marquee" id="clio-paint-marquee" hidden></div>
          </div>
          <div class="clio-paint-result" id="clio-paint-result" hidden>
            <div class="clio-paint-result-echo">
              <div class="clio-paint-result-sketch"><img id="clio-paint-result-sketch-img" alt=""></div>
              <div class="clio-paint-result-output">
                <pre class="clio-paint-result-markdown" id="clio-paint-result-markdown"></pre>
                <div class="clio-paint-result-unread" id="clio-paint-result-unread"></div>
              </div>
            </div>
            <div class="clio-paint-result-actions">
              <button class="btn" type="button" id="clio-paint-result-apply" data-action="clio-paint-result-apply" data-i18n="clio_paint_apply_outline" hidden>Apply to Outline</button>
              <button class="btn" type="button" id="clio-paint-result-copy" data-action="clio-paint-result-copy" data-i18n="copy">Copy</button>
              <button class="btn" type="button" id="clio-paint-result-dismiss" data-action="clio-paint-result-dismiss" data-i18n="close">Close</button>
            </div>
          </div>`,
  });
  if (typeof applyLanguage === "function") applyLanguage();
}

installClioPaintWindow();

const clioPaintState = {
  projectId: "",
  attachmentId: "",
  dirty: false,
  tool: "pencil",
  pattern: 1,
  shapeFilled: false,
  undo: null,
  selection: null,
  drawing: null,
  patterns: [],
  lastResult: null,
};

function clioPaintElements() {
  const root = document.querySelector('[data-window="clioPaint"]');
  return {
    root,
    pane: root?.querySelector(".clio-paint-pane") || null,
    toolbar: document.querySelector("#clio-paint-toolbar"),
    patterns: document.querySelector("#clio-paint-patterns"),
    canvas: document.querySelector("#clio-paint-canvas"),
    canvasWrap: document.querySelector("#clio-paint-canvas-wrap"),
    marquee: document.querySelector("#clio-paint-marquee"),
    statusLabel: document.querySelector("#clio-paint-status-label"),
    result: document.querySelector("#clio-paint-result"),
    resultSketchImg: document.querySelector("#clio-paint-result-sketch-img"),
    resultMarkdown: document.querySelector("#clio-paint-result-markdown"),
    resultUnread: document.querySelector("#clio-paint-result-unread"),
    resultApply: document.querySelector("#clio-paint-result-apply"),
  };
}

// --- Pattern palette ---------------------------------------------------
//
// A fresh geometric set (a Bayer-matrix density ramp plus a few hand
// patterns), not a transcription of Apple's QuickDraw pattern list — no
// resource for that shipped with this evidence pass, so nothing here claims
// to be one.

function clioPaintPatternBits() {
  const bits = [];
  bits.push(Array.from({ length: 8 }, () => Array(8).fill(0))); // 0: white
  bits.push(Array.from({ length: 8 }, () => Array(8).fill(1))); // 1: black
  const bayer = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ];
  [8, 16, 24, 32, 40, 48].forEach((threshold) => {
    bits.push(bayer.map((row) => row.map((value) => (value < threshold ? 1 : 0))));
  });
  const grid = (fn) => Array.from({ length: 8 }, (row, y) => Array.from({ length: 8 }, (cell, x) => (fn(x, y) ? 1 : 0)));
  bits.push(grid((x, y) => y % 2 === 0));
  bits.push(grid((x, y) => x % 2 === 0));
  bits.push(grid((x, y) => (x + y) % 4 === 0));
  bits.push(grid((x, y) => (x - y + 8) % 4 === 0));
  bits.push(grid((x, y) => (x + y) % 2 === 0));
  bits.push(grid((x, y) => x % 4 === 0 || y % 4 === 0));
  bits.push(grid((x, y) => x % 4 === 1 && y % 4 === 1));
  return bits;
}

function buildClioPaintPatterns() {
  return clioPaintPatternBits().map((grid, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillStyle = "#000";
    grid.forEach((row, y) => row.forEach((bit, x) => { if (bit) ctx.fillRect(x, y, 1, 1); }));
    return { index, canvas, dataUrl: canvas.toDataURL("image/png") };
  });
}

clioPaintState.patterns = buildClioPaintPatterns();

function renderClioPaintPatterns() {
  const { patterns: container } = clioPaintElements();
  if (!container || container.dataset.clioPaintReady === "true") return;
  container.dataset.clioPaintReady = "true";
  clioPaintState.patterns.forEach((pattern, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "view-switch-option";
    button.dataset.clioPaintPattern = String(index);
    button.setAttribute("aria-pressed", String(index === clioPaintState.pattern));
    button.setAttribute("aria-label", t("clio_paint_pattern", index + 1));
    button.style.backgroundImage = `url(${pattern.dataUrl})`;
    button.style.backgroundSize = "16px 16px";
    container.append(button);
  });
}

function setClioPaintPattern(index) {
  if (!clioPaintState.patterns[index]) return;
  clioPaintState.pattern = index;
  clioPaintElements().patterns?.querySelectorAll("[data-clio-paint-pattern]").forEach((button) => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.clioPaintPattern) === index));
  });
}

function clioPaintCurrentPatternFill(ctx) {
  const pattern = clioPaintState.patterns[clioPaintState.pattern];
  return pattern ? ctx.createPattern(pattern.canvas, "repeat") : "#000";
}

// --- Tool selection ------------------------------------------------------

function setClioPaintTool(tool) {
  if (!CLIO_PAINT_TOOLS.includes(tool)) return;
  clioPaintState.tool = tool;
  clioPaintState.selection = null;
  updateClioPaintMarqueeOverlay();
  const { toolbar, canvas } = clioPaintElements();
  if (canvas) canvas.dataset.clioPaintTool = tool;
  toolbar?.querySelectorAll("[data-clio-paint-tool]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.clioPaintTool === tool));
  });
  if (typeof updateMenuState === "function") updateMenuState();
}

function toggleClioPaintShapeFilled() {
  clioPaintState.shapeFilled = !clioPaintState.shapeFilled;
  document.querySelector("#clio-paint-shape-filled")?.setAttribute("aria-pressed", String(clioPaintState.shapeFilled));
  if (typeof updateMenuState === "function") updateMenuState();
}

// --- Drawing engine --------------------------------------------------------
//
// Every tool ends by thresholding the pixels it touched back to pure black
// or white. Canvas vector strokes antialias; a 1-bit picture cannot, so the
// threshold pass is what actually keeps this a 1-bit surface regardless of
// how a shape was drawn.

function clioPaintCtx() {
  const canvas = clioPaintElements().canvas;
  return canvas ? canvas.getContext("2d", { willReadFrequently: true }) : null;
}

function clioPaintCanvasPoint(event) {
  const canvas = clioPaintElements().canvas;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - rect.left) * scaleX))),
    y: Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - rect.top) * scaleY))),
  };
}

function clioPaintSnapshotUndo() {
  const ctx = clioPaintCtx();
  const canvas = clioPaintElements().canvas;
  if (!ctx || !canvas) return;
  clioPaintState.undo = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function undoClioPaint() {
  const ctx = clioPaintCtx();
  const canvas = clioPaintElements().canvas;
  if (!ctx || !canvas || !clioPaintState.undo) return;
  const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  ctx.putImageData(clioPaintState.undo, 0, 0);
  clioPaintState.undo = current;
  clioPaintState.dirty = true;
  syncClioPaintStatus();
}

function clioPaintThreshold(x, y, w, h) {
  const ctx = clioPaintCtx();
  const canvas = clioPaintElements().canvas;
  if (!ctx || !canvas) return;
  const left = Math.max(0, Math.floor(x - 1));
  const top = Math.max(0, Math.floor(y - 1));
  const right = Math.min(canvas.width, Math.ceil(x + w + 2));
  const bottom = Math.min(canvas.height, Math.ceil(y + h + 2));
  const cw = right - left;
  const ch = bottom - top;
  if (cw <= 0 || ch <= 0) return;
  const imageData = ctx.getImageData(left, top, cw, ch);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    const lum = alpha === 0 ? 255 : (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    const black = alpha > 32 && lum < 168;
    data[i] = data[i + 1] = data[i + 2] = black ? 0 : 255;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, left, top);
}

function clioPaintBeginStroke(tool, point) {
  clioPaintSnapshotUndo();
  clioPaintState.drawing = { tool, last: point, minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
  clioPaintStrokeSegment(point, point);
}

function clioPaintStrokeSegment(from, to) {
  const ctx = clioPaintCtx();
  const state = clioPaintState.drawing;
  if (!ctx || !state) return;
  ctx.strokeStyle = state.tool === "eraser" ? "#fff" : "#000";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1;
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(from.x + 0.5, from.y + 0.5);
  ctx.lineTo(to.x + 0.5, to.y + 0.5);
  ctx.stroke();
  ctx.fillRect(to.x, to.y, 1, 1);
  state.minX = Math.min(state.minX, from.x, to.x);
  state.minY = Math.min(state.minY, from.y, to.y);
  state.maxX = Math.max(state.maxX, from.x, to.x);
  state.maxY = Math.max(state.maxY, from.y, to.y);
}

function clioPaintEndStroke() {
  const state = clioPaintState.drawing;
  if (!state) return;
  clioPaintThreshold(state.minX, state.minY, state.maxX - state.minX, state.maxY - state.minY);
  clioPaintState.drawing = null;
  clioPaintState.dirty = true;
  syncClioPaintStatus();
}

function clioPaintBeginShape(tool, point) {
  clioPaintSnapshotUndo();
  clioPaintState.drawing = { tool, start: point, current: point };
}

function clioPaintDrawShape(ctx, tool, start, end, filled) {
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#000";
  ctx.fillStyle = filled ? clioPaintCurrentPatternFill(ctx) : "#000";
  if (tool === "line") {
    ctx.beginPath();
    ctx.moveTo(start.x + 0.5, start.y + 0.5);
    ctx.lineTo(end.x + 0.5, end.y + 0.5);
    ctx.stroke();
    return;
  }
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  if (tool === "rect") {
    if (filled) ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    return;
  }
  if (tool === "oval") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
    if (filled) ctx.fill();
    ctx.stroke();
  }
}

function clioPaintPreviewShape(point) {
  const ctx = clioPaintCtx();
  const state = clioPaintState.drawing;
  if (!ctx || !state || !clioPaintState.undo) return;
  ctx.putImageData(clioPaintState.undo, 0, 0);
  state.current = point;
  clioPaintDrawShape(ctx, state.tool, state.start, point, clioPaintState.shapeFilled);
}

function clioPaintEndShape() {
  const state = clioPaintState.drawing;
  if (!state) return;
  const x = Math.min(state.start.x, state.current.x);
  const y = Math.min(state.start.y, state.current.y);
  const w = Math.abs(state.current.x - state.start.x);
  const h = Math.abs(state.current.y - state.start.y);
  clioPaintThreshold(x, y, w, h);
  clioPaintState.drawing = null;
  clioPaintState.dirty = true;
  syncClioPaintStatus();
}

function clioPaintFloodFill(point) {
  const ctx = clioPaintCtx();
  const canvas = clioPaintElements().canvas;
  const pattern = clioPaintState.patterns[clioPaintState.pattern];
  if (!ctx || !canvas || !pattern) return;
  clioPaintSnapshotUndo();
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const patternData = pattern.canvas.getContext("2d").getImageData(0, 0, 8, 8).data;
  const patternIsBlack = (x, y) => {
    const pi = (((y % 8) + 8) % 8 * 8 + (((x % 8) + 8) % 8)) * 4;
    return patternData[pi] < 128;
  };
  const startIndex = (point.y * w + point.x) * 4;
  const targetBlack = data[startIndex] < 128;
  const visited = new Uint8Array(w * h);
  const stack = [point.x, point.y];
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const vi = y * w + x;
    if (visited[vi]) continue;
    const pi = vi * 4;
    if ((data[pi] < 128) !== targetBlack) continue;
    visited[vi] = 1;
    const black = patternIsBlack(x, y);
    data[pi] = data[pi + 1] = data[pi + 2] = black ? 0 : 255;
    data[pi + 3] = 255;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  ctx.putImageData(imageData, 0, 0);
  clioPaintState.dirty = true;
  syncClioPaintStatus();
}

function updateClioPaintMarqueeOverlay() {
  const { marquee, canvas } = clioPaintElements();
  const sel = clioPaintState.selection;
  if (!marquee || !canvas) return;
  if (!sel) { marquee.hidden = true; return; }
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width ? rect.width / canvas.width : 1;
  const x = Math.min(sel.x, sel.x + sel.w);
  const y = Math.min(sel.y, sel.y + sel.h);
  const w = Math.abs(sel.w);
  const h = Math.abs(sel.h);
  marquee.style.left = `${x * scale}px`;
  marquee.style.top = `${y * scale}px`;
  marquee.style.width = `${w * scale}px`;
  marquee.style.height = `${h * scale}px`;
  marquee.hidden = !(w > 0 && h > 0);
}

function clioPaintBeginMarquee(point) {
  clioPaintState.selection = { x: point.x, y: point.y, w: 0, h: 0 };
  updateClioPaintMarqueeOverlay();
}

function clioPaintUpdateMarquee(point) {
  const sel = clioPaintState.selection;
  if (!sel) return;
  sel.w = point.x - sel.x;
  sel.h = point.y - sel.y;
  updateClioPaintMarqueeOverlay();
}

function clearClioPaintSelection() {
  const sel = clioPaintState.selection;
  const ctx = clioPaintCtx();
  if (!sel || !ctx) return;
  const x = Math.min(sel.x, sel.x + sel.w);
  const y = Math.min(sel.y, sel.y + sel.h);
  const w = Math.abs(sel.w);
  const h = Math.abs(sel.h);
  if (w <= 0 || h <= 0) return;
  clioPaintSnapshotUndo();
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, w, h);
  clioPaintState.dirty = true;
  syncClioPaintStatus();
}

function clioPaintBeginText(point, clientPoint) {
  const { canvasWrap } = clioPaintElements();
  if (!canvasWrap) return;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "clio-paint-text-input";
  input.style.setProperty("--clio-paint-text-x", `${clientPoint.x}px`);
  input.style.setProperty("--clio-paint-text-y", `${Math.max(0, clientPoint.y - 9)}px`);
  canvasWrap.append(input);
  input.focus();
  let settled = false;
  const commit = () => {
    if (settled) return;
    settled = true;
    const value = input.value;
    input.remove();
    if (value.trim()) clioPaintStampText(point, value.trim());
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    input.remove();
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); commit(); }
    else if (event.key === "Escape") { event.preventDefault(); cancel(); }
  });
  input.addEventListener("blur", commit, { once: true });
}

function clioPaintStampText(point, text) {
  const ctx = clioPaintCtx();
  if (!ctx) return;
  clioPaintSnapshotUndo();
  ctx.font = "14px Monaco, monospace";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#000";
  ctx.fillText(text, point.x, point.y);
  const width = Math.max(8, ctx.measureText(text).width);
  clioPaintThreshold(point.x, point.y, width, 18);
  clioPaintState.dirty = true;
  syncClioPaintStatus();
}

function wireClioPaintCanvas() {
  const { canvas } = clioPaintElements();
  if (!canvas || canvas.dataset.clioPaintWired === "true") return;
  canvas.dataset.clioPaintWired = "true";
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    // preventDefault below blocks the browser's default focus-change action,
    // which is also what blurs (and so commits) an open text-tool input. Ask
    // it to commit itself first, synchronously, so a second click on the
    // canvas cannot leave a typed label stranded off-screen.
    document.querySelector(".clio-paint-text-input")?.blur();
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    const point = clioPaintCanvasPoint(event);
    const tool = clioPaintState.tool;
    if (tool === "pencil" || tool === "eraser") clioPaintBeginStroke(tool, point);
    else if (tool === "fill") clioPaintFloodFill(point);
    else if (tool === "line" || tool === "rect" || tool === "oval") clioPaintBeginShape(tool, point);
    else if (tool === "marquee") clioPaintBeginMarquee(point);
    else if (tool === "text") {
      const rect = canvas.getBoundingClientRect();
      clioPaintBeginText(point, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!clioPaintState.drawing && !clioPaintState.selection) return;
    const point = clioPaintCanvasPoint(event);
    const tool = clioPaintState.tool;
    if ((tool === "pencil" || tool === "eraser") && clioPaintState.drawing) {
      clioPaintStrokeSegment(clioPaintState.drawing.last, point);
      clioPaintState.drawing.last = point;
    } else if ((tool === "line" || tool === "rect" || tool === "oval") && clioPaintState.drawing) {
      clioPaintPreviewShape(point);
    } else if (tool === "marquee" && clioPaintState.selection) {
      clioPaintUpdateMarquee(point);
    }
  });
  const finish = (event) => {
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    const tool = clioPaintState.tool;
    if ((tool === "pencil" || tool === "eraser") && clioPaintState.drawing) clioPaintEndStroke();
    else if ((tool === "line" || tool === "rect" || tool === "oval") && clioPaintState.drawing) clioPaintEndShape();
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
}

function handleClioPaintKeydown(event) {
  const win = document.querySelector('[data-window="clioPaint"]');
  if (!win || win.classList.contains("is-hidden") || !win.classList.contains("is-active")) return;
  if (typeof getActiveEditableElement === "function" && getActiveEditableElement()) return;
  if ((event.key === "Delete" || event.key === "Backspace") && clioPaintState.tool === "marquee" && clioPaintState.selection) {
    event.preventDefault();
    clearClioPaintSelection();
  } else if (event.key === "Escape" && clioPaintState.selection) {
    clioPaintState.selection = null;
    updateClioPaintMarqueeOverlay();
  }
}

// --- Save / load through the existing imageAttachments store ---------------
//
// One picture belongs to one project. Save reuses the same attachment id on
// every subsequent save (an update, not a growing pile of copies); New
// clears the id so the next Save starts a fresh record. Opening the window
// auto-loads the project's most recent clioPaint picture, so "reload and
// reopen" lands on the same picture without a separate Open dialog.

function syncClioPaintStatus() {
  const { statusLabel } = clioPaintElements();
  if (!statusLabel) return;
  statusLabel.textContent = clioPaintState.dirty
    ? t("clio_paint_status_unsaved")
    : (clioPaintState.attachmentId ? t("clio_paint_status_saved") : t("clio_paint_status_new"));
}

function setClioPaintBusy(busy) {
  const { pane } = clioPaintElements();
  if (pane) pane.dataset.clioPaintBusy = String(!!busy);
}

function clioPaintCanvasBlob() {
  const { canvas } = clioPaintElements();
  return new Promise((resolve, reject) => {
    if (!canvas || typeof canvas.toBlob !== "function") { reject(new Error("clio_paint_encode_failed")); return; }
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("clio_paint_encode_failed"))), "image/png");
  });
}

async function saveClioPaintPicture() {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return false;
  }
  let blob;
  try {
    blob = await clioPaintCanvasBlob();
  } catch {
    setStatus(t("clio_paint_no_picture"));
    return false;
  }
  const file = new File([blob], "ClioPaint.png", { type: "image/png" });
  const built = await buildImageAttachments([file], { projectId: project.id, surface: "clioPaint", limit: 1 });
  const record = built[0];
  if (!record) return false;
  if (clioPaintState.attachmentId) record.id = clioPaintState.attachmentId;
  saveImageAttachments([record]);
  clioPaintState.attachmentId = record.id;
  clioPaintState.projectId = project.id;
  clioPaintState.dirty = false;
  project.updatedAt = new Date().toISOString();
  // The picture is already attached in memory (usable by sketch-read etc.
  // regardless of persistence), but "Picture saved." is a durable claim -
  // only say it once the desk save actually lands.
  const persisted = await saveDeskState();
  syncClioPaintStatus();
  setStatus(persisted ? t("clio_paint_saved") : t("clio_paint_saved_unsaved"));
  return true;
}

function loadClioPaintRecord(record) {
  const { canvas } = clioPaintElements();
  const ctx = clioPaintCtx();
  if (!canvas || !ctx || !record) return Promise.resolve(false);
  const dataUrl = record.originalDataUrl || record.previewDataUrl || "";
  if (!dataUrl) return Promise.resolve(false);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      clioPaintThreshold(0, 0, canvas.width, canvas.height);
      clioPaintState.attachmentId = record.id;
      clioPaintState.undo = null;
      clioPaintState.selection = null;
      clioPaintState.dirty = false;
      updateClioPaintMarqueeOverlay();
      syncClioPaintStatus();
      resolve(true);
    };
    image.onerror = () => resolve(false);
    image.src = dataUrl;
  });
}

function clioPaintBlankCanvas() {
  const { canvas } = clioPaintElements();
  const ctx = clioPaintCtx();
  if (!canvas || !ctx) return;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  clioPaintState.attachmentId = "";
  clioPaintState.undo = null;
  clioPaintState.selection = null;
  clioPaintState.dirty = false;
  hideClioPaintResult();
  updateClioPaintMarqueeOverlay();
  syncClioPaintStatus();
}

async function newClioPaintPicture({ skipConfirm = false } = {}) {
  if (!skipConfirm && clioPaintState.dirty) {
    const answer = await showSystemModal(t("clio_paint_new_confirm"), "confirm");
    if (answer !== "yes") return;
  }
  // The window says "New picture." from the moment it opens, and a blank
  // canvas cleared again is still blank, so New on an untouched picture
  // repainted nothing and repeated a sentence already on screen: the same
  // event as a command that is broken. Say what really happened instead.
  const alreadyNew = !clioPaintState.dirty && !clioPaintState.attachmentId;
  clioPaintBlankCanvas();
  if (alreadyNew) {
    const { statusLabel } = clioPaintElements();
    if (statusLabel) statusLabel.textContent = t("clio_paint_status_already_new");
  }
}

async function autoLoadClioPaintForProject() {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  const projectId = project?.id || "";
  if (!projectId) return;
  if (clioPaintState.projectId === projectId && (clioPaintState.attachmentId || clioPaintState.dirty)) return;
  clioPaintState.projectId = projectId;
  const recent = typeof imageAttachmentsForProject === "function"
    ? imageAttachmentsForProject(projectId, { surface: "clioPaint", limit: 1 })
    : [];
  if (recent[0]) await loadClioPaintRecord(recent[0]);
  else clioPaintBlankCanvas();
}

// --- Sketch to Outline / Sketch to Image Prompt -----------------------------

function clioPaintReadGoesToCloud() {
  return typeof cloudConfig !== "undefined" && cloudConfig?.active === true
    && typeof cloudCredentialReady === "function" && cloudCredentialReady();
}

async function confirmClioPaintCloudRead() {
  const answer = await showSystemModal(t("clio_paint_cloud_confirm"), "confirm", { confirmKey: "send", defaultAction: "cancel" });
  return answer === "yes";
}

function clioPaintSketchToOutlinePrompt() {
  const zh = currentLanguage === "zh";
  return zh
    ? [
      "你会看到一张手绘的框图草图：方框代表章节，箭头代表顺序，最粗的箭头代表主线。",
      "把它转写成不超过 7 个 `## ` 二级标题，只输出章节标题本身，不要正文、不要工作清单式标题（如核验/下一步/风险/备注）。",
      "章节数不要超过图里能看清的方框数——看不清就少给，不要编。",
      "如果图里有一部分你认不出来（涂改、太潦草、没画完），在最后单独一行写：",
      "读不出：<简短说明，没有就写“无”>",
      "先给章节标题，最后一行才是「读不出」。不要输出其他解释。",
    ].join("\n")
    : [
      "You will see a hand-drawn box-and-arrow sketch: boxes are chapters, arrows are order, the thickest arrow is the main line.",
      "Transcribe it into at most 7 `## ` second-level headings, titles only — no body text, no work-list headings (like verify / next steps / risks / notes).",
      "Do not output more sections than you can clearly make out as boxes in the sketch. Under-produce rather than invent.",
      "If part of the sketch is unreadable (scribbled out, too messy, unfinished), say so on its own final line:",
      "Could not read: <short note, or 'none'>",
      "Chapter titles first, the unreadable line last. No other explanation.",
    ].join("\n");
}

function clioPaintSketchToPromptPrompt() {
  const zh = currentLanguage === "zh";
  return zh
    ? "你会看到一张手绘草图。把它转写成一段给图像生成模型用的提示词，描述画面的构图、主体和氛围。不要提到这是手绘草图，不要加多余解释，只输出提示词本身。"
    : "You will see a hand-drawn sketch. Turn it into one image-generation prompt describing the composition, subject, and mood. Do not mention that it is a hand-drawn sketch, and do not add explanation — output only the prompt text.";
}

function splitClioPaintUnreadNote(raw) {
  const lines = String(raw || "").split("\n");
  let unread = "";
  const last = lines[lines.length - 1] || "";
  const match = last.match(/^(?:读不出|could not read)\s*[:：]\s*(.*)$/i);
  if (match) {
    unread = match[1].trim();
    lines.pop();
  }
  return { markdown: lines.join("\n").trim(), unread };
}

function clioPaintUnreadIsEmpty(unread) {
  return !unread || /^(none|无|没有|nothing)$/i.test(unread.trim());
}

function renderClioPaintResult({ kind, sketchDataUrl, markdown = "", promptText = "", unread = "" }) {
  const els = clioPaintElements();
  if (!els.result) return;
  clioPaintState.lastResult = { kind, markdown, promptText };
  if (els.resultSketchImg) els.resultSketchImg.src = sketchDataUrl || "";
  if (els.resultMarkdown) els.resultMarkdown.textContent = kind === "outline" ? markdown : promptText;
  if (els.resultUnread) {
    els.resultUnread.textContent = clioPaintUnreadIsEmpty(unread)
      ? t("clio_paint_unread_empty")
      : `${t("clio_paint_unread_label")}: ${unread}`;
  }
  if (els.resultApply) els.resultApply.hidden = kind !== "outline";
  els.result.hidden = false;
}

function hideClioPaintResult() {
  const { result } = clioPaintElements();
  if (result) result.hidden = true;
}

async function clioPaintRunSketchRead({ intent, promptText, kind }) {
  if (clioPaintState.dirty) {
    const saved = await saveClioPaintPicture();
    if (!saved) return;
  }
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  const { canvas } = clioPaintElements();
  if (!project || !canvas) {
    setStatus(t("no_project_mounted"));
    return;
  }
  const record = clioPaintState.attachmentId ? imageAttachmentById(clioPaintState.attachmentId) : null;
  const pngDataUrl = record?.originalDataUrl || canvas.toDataURL("image/png");
  if (!pngDataUrl) {
    setStatus(t("clio_paint_no_picture"));
    return;
  }

  if (clioPaintReadGoesToCloud() && !(await confirmClioPaintCloudRead())) {
    setStatus(t("clio_paint_cloud_declined"));
    return;
  }

  setClioPaintBusy(true);
  setStatus(t("clio_paint_reading"));
  let receiptId = "";
  if (typeof window.AISystem6RunReceipts?.createReceipt === "function") {
    try {
      const created = await window.AISystem6RunReceipts.createReceipt({
        projectId: project.id,
        sourceAppId: "clioPaint",
        intent,
        inputObjectIds: record ? [record.id] : [],
      });
      if (created?.ok) receiptId = created.receiptId;
    } catch (error) {
      console.warn("ClioPaint run receipt creation failed; the read continues.", error);
    }
  }

  try {
    const messages = [{ role: "user", content: promptText }];
    attachImagesToModelMessages(messages, [{ inlineDataUrl: pngDataUrl }], { limit: 1 });
    const result = await sendLocalModelTask({
      payload: {
        model: "",
        messages,
        temperature: kind === "outline" ? 0.2 : 0.4,
        max_tokens: 700,
        stream: false,
        ai_system6_task_kind: intent,
      },
      signal: typeof getLongTaskSignal === "function" ? getLongTaskSignal() : null,
      taskKind: intent,
      streamPreference: "json",
    });
    const raw = String(result?.text || "").trim();
    if (!raw) throw new Error(t("clio_paint_read_empty"));

    if (kind === "outline") {
      if (typeof ensureOutlineClaimModule === "function") await ensureOutlineClaimModule();
      const { markdown, unread } = splitClioPaintUnreadNote(raw);
      const validated = validateGeneratedWritingOutline(markdown);
      renderClioPaintResult({ kind, sketchDataUrl: pngDataUrl, markdown: validated, unread });
    } else {
      renderClioPaintResult({ kind, sketchDataUrl: pngDataUrl, promptText: raw, unread: "" });
    }
    if (receiptId) {
      await window.AISystem6RunReceipts.finishReceipt(receiptId, {
        status: "completed",
        affectedObjectIds: record ? [record.id] : [],
      });
    }
    setStatus(t("clio_paint_read_done"));
  } catch (error) {
    if (typeof isAbortError === "function" && isAbortError(error)) return;
    // The receipt keeps the raw reason for diagnostics; the status line gets
    // the localized, actionable version so the writer never sees a bare code.
    const rawReason = error?.message || String(error);
    if (receiptId) {
      try {
        await window.AISystem6RunReceipts.finishReceipt(receiptId, { status: "failed", publicErrorReason: rawReason });
      } catch (receiptError) {
        console.warn("ClioPaint run receipt failure recording failed.", receiptError);
      }
    }
    setStatus(t("clio_paint_read_failed", friendlyErrorDetail(error)));
  } finally {
    setClioPaintBusy(false);
  }
}

function runClioPaintSketchToOutline() {
  return clioPaintRunSketchRead({
    intent: "clio-paint-sketch-to-outline",
    promptText: clioPaintSketchToOutlinePrompt(),
    kind: "outline",
  });
}

function runClioPaintSketchToImagePrompt() {
  return clioPaintRunSketchRead({
    intent: "clio-paint-sketch-to-image-prompt",
    promptText: clioPaintSketchToPromptPrompt(),
    kind: "prompt",
  });
}

async function applyClioPaintOutlineResult() {
  if (!clioPaintState.lastResult?.markdown || clioPaintState.lastResult.kind !== "outline") return;
  if (typeof ensureOutlineClaimModule === "function") await ensureOutlineClaimModule();
  const applied = await confirmAndApplyAiOutline(
    clioPaintState.lastResult.markdown,
    "clio_paint_outline_confirm",
    "clio_paint_outline_applied",
  );
  if (applied) hideClioPaintResult();
}

async function copyClioPaintResult() {
  const last = clioPaintState.lastResult;
  const text = last?.kind === "outline" ? last.markdown : last?.promptText;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus(t(last.kind === "outline" ? "clio_paint_outline_copied" : "clio_paint_prompt_copied"));
  } catch {
    setStatus(t("clio_paint_copy_failed"));
  }
}

// --- Commands, menus, wiring -------------------------------------------

const CLIO_PAINT_COMMAND_NAMES = [
  "clio-paint-new",
  "clio-paint-save",
  "clio-paint-sketch-outline",
  "clio-paint-sketch-prompt",
  "clio-paint-undo",
  "clio-paint-clear-selection",
  "clio-paint-shape-filled-toggle",
  "clio-paint-result-apply",
  "clio-paint-result-copy",
  "clio-paint-result-dismiss",
  ...CLIO_PAINT_TOOLS.map((tool) => `clio-paint-tool-${tool}`),
];

function clioPaintCommandAvailable(action) {
  if (action === "open-clio-paint") return true;
  const activeWindow = document.querySelector(".window.is-active");
  if (activeWindow?.dataset.window !== "clioPaint") return false;
  if (action === "clio-paint-undo") return !!clioPaintState.undo;
  if (action === "clio-paint-clear-selection") return clioPaintState.tool === "marquee" && !!clioPaintState.selection;
  if (["clio-paint-result-apply", "clio-paint-result-copy", "clio-paint-result-dismiss"].includes(action)) {
    return !clioPaintElements().result?.hidden;
  }
  return true;
}

function runClioPaintCommand(action) {
  if (action === "open-clio-paint") return openClioPaint();
  if (action === "clio-paint-new") return newClioPaintPicture();
  if (action === "clio-paint-save") return saveClioPaintPicture();
  if (action === "clio-paint-sketch-outline") return runClioPaintSketchToOutline();
  if (action === "clio-paint-sketch-prompt") return runClioPaintSketchToImagePrompt();
  if (action === "clio-paint-undo") return undoClioPaint();
  if (action === "clio-paint-clear-selection") return clearClioPaintSelection();
  if (action === "clio-paint-shape-filled-toggle") return toggleClioPaintShapeFilled();
  if (action === "clio-paint-result-apply") return applyClioPaintOutlineResult();
  if (action === "clio-paint-result-copy") return copyClioPaintResult();
  if (action === "clio-paint-result-dismiss") return hideClioPaintResult();
  if (action.startsWith("clio-paint-tool-")) return setClioPaintTool(action.slice("clio-paint-tool-".length));
}

function bindClioPaintControls() {
  const els = clioPaintElements();
  if (!els.root || els.root.dataset.clioPaintBound === "true") return;
  els.root.dataset.clioPaintBound = "true";
  els.toolbar?.addEventListener("click", (event) => {
    const toolButton = event.target.closest("[data-clio-paint-tool]");
    if (toolButton) setClioPaintTool(toolButton.dataset.clioPaintTool);
  });
  els.patterns?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-clio-paint-pattern]");
    if (button) setClioPaintPattern(Number(button.dataset.clioPaintPattern));
  });
  wireClioPaintCanvas();
  document.addEventListener("keydown", handleClioPaintKeydown);
}

async function openClioPaint() {
  await openWindow("clioPaint");
}

async function attachClioPaint() {
  renderClioPaintPatterns();
  bindClioPaintControls();
  updateClioPaintMarqueeOverlay();
  await autoLoadClioPaintForProject();
  syncClioPaintStatus();
}

// The eight tools are alternatives, and only the toolbar said which one was
// held: the toolbar buttons carry aria-pressed, the menu rows carried nothing.
// Choosing a tool from the Paint menu changed the pointer and marked no row.
function clioPaintToolMenuItem(tool, labelKey) {
  return {
    type: "item",
    action: `clio-paint-tool-${tool}`,
    labelKey,
    conditionId: `clio-paint-tool-${tool}`,
    dataset: { clioPaintToolChoice: tool },
  };
}

window.AISystem6RegisterApplicationMenuSet?.("clioPaint", [
  {
    id: "file",
    labelKey: "menu_file",
    items: [
      { type: "item", action: "clio-paint-new", labelKey: "clio_paint_new", conditionId: "clio-paint-new" },
      { type: "item", action: "clio-paint-save", labelKey: "save", conditionId: "clio-paint-save" },
      { type: "separator" },
      { type: "item", action: "clio-paint-sketch-outline", labelKey: "clio_paint_sketch_to_outline", conditionId: "clio-paint-sketch-outline" },
      { type: "item", action: "clio-paint-sketch-prompt", labelKey: "clio_paint_sketch_to_prompt", conditionId: "clio-paint-sketch-prompt" },
      { type: "separator" },
      { type: "item", action: "close-active-window", labelKey: "close", shortcutId: "close-window", conditionId: "close-active-window" },
    ],
  },
  {
    id: "edit",
    labelKey: "menu_edit",
    items: [
      { type: "item", action: "clio-paint-undo", labelKey: "undo", conditionId: "clio-paint-undo" },
      { type: "separator" },
      { type: "item", action: "clio-paint-clear-selection", labelKey: "clear", conditionId: "clio-paint-clear-selection" },
    ],
  },
  {
    id: "paint",
    labelKey: "menu_paint",
    items: [
      clioPaintToolMenuItem("pencil", "clio_paint_tool_pencil"),
      clioPaintToolMenuItem("eraser", "clio_paint_tool_eraser"),
      clioPaintToolMenuItem("fill", "clio_paint_tool_fill"),
      clioPaintToolMenuItem("line", "clio_paint_tool_line"),
      clioPaintToolMenuItem("rect", "clio_paint_tool_rect"),
      clioPaintToolMenuItem("oval", "clio_paint_tool_oval"),
      clioPaintToolMenuItem("marquee", "clio_paint_tool_marquee"),
      clioPaintToolMenuItem("text", "clio_paint_tool_text"),
      { type: "separator" },
      { type: "item", action: "clio-paint-shape-filled-toggle", labelKey: "clio_paint_shape_filled", conditionId: "clio-paint-shape-filled-toggle", dataset: { clioPaintFilled: "on" } },
    ],
  },
]);

window.AISystem6ClioPaint = Object.freeze({
  open: openClioPaint,
  attach: attachClioPaint,
  currentTool: () => clioPaintState.tool,
  shapeFilled: () => clioPaintState.shapeFilled === true,
  setTool: setClioPaintTool,
  setPattern: setClioPaintPattern,
  save: saveClioPaintPicture,
  newPicture: newClioPaintPicture,
  sketchToOutline: runClioPaintSketchToOutline,
  sketchToImagePrompt: runClioPaintSketchToImagePrompt,
});

window.AISystem6Runtime?.registerApplication({
  id: "clioPaint",
  windowName: "clioPaint",
  mount: attachClioPaint,
  restore: attachClioPaint,
  commands: Object.fromEntries(
    ["open-clio-paint", ...CLIO_PAINT_COMMAND_NAMES].map((action) => [action, {
      handler: () => runClioPaintCommand(action),
      isAvailable: () => clioPaintCommandAvailable(action),
    }])
  ),
});
