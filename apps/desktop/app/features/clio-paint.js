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
//     no new store, no new persistence boundary. A picture opens at the size
//     it was saved at: the three papers (480x300, the original Macintosh
//     screen 512x342, MacPaint's 576x720 page) are sizes of the same PNG.
//   - Sketch to Outline / Sketch to Image Prompt are one-way, one-time
//     reads. Nothing here writes back to the sketch, and nothing here
//     reaches into the writing route on its own: the writer reviews the
//     result and explicitly applies or copies it. See
//     internal/evidence/drafts/sketch-to-outline/index.html for the prior
//     design draft this reuses evidence from (four loss-stop rules: an
//     always-visible "could not read" note, never inventing more sections
//     than the sketch can support, routing output through the Outline's own
//     validateGeneratedWritingOutline guardrail, and a side-by-side echo so
//     a bad read is visible rather than silently trusted).
//   - The window follows the 2026-09-24 redesign draft
//     (https://claude.ai/artifact/TrFLV24khy4mGME6KHTdmi): the grammar of
//     Claris MacPaint 2.0 (a two-column tool palette whose shapes come in
//     hollow/filled pairs, a line-width box with a check mark, 38 patterns
//     beside a large current-pattern swatch, FatBits with an actual-size
//     inset, double-clicking a tool as its shortcut) and the precision of
//     Photoshop 1.0 (stepped magnification, coordinates while drawing).
//     Observed evidence: MacPaint 2.0's torn-off tool palette (4 columns,
//     actions beside hollow/filled pairs) and its 5x8 pattern palette, and
//     Photoshop 1.0's 2x10 toolbox. The tool glyphs, the 38 patterns and the
//     cursors in this file are ORIGINAL 1-bit drawings in that grammar, not
//     Apple's resources, and nothing here claims to be MacPaint's pixels.
//     Behaviour recalled rather than observed — the double-click shortcuts,
//     the pencil drawing white on black, the lasso lifting only ink — is to
//     be checked against the MacPaint 1.3 source (CHM, 2010) before any of
//     it is called MacPaint's.
//   - The document is a packed 1-bit bitmap, not a canvas. Every tool writes
//     bits directly, so nothing is ever antialiased and thresholded back, and
//     a history step is the picture itself: one bit per pixel.
//   - What JS Paint (1j01/jspaint) taught this file, kept because each one is
//     about the drawing loop rather than about features: a paint document
//     earns its keep with a real history (a stack of undo steps with redo,
//     and the step still being drawn held apart so a mis-drag is cancelled
//     instead of committed), a selection that can be MOVED instead of only
//     cleared, and Shift meaning "constrain proportions" while a shape is
//     drawn. History lives and dies with the window: nothing here adds a
//     persistence boundary, and the picture on disk stays one PNG.

window.AISystem6ClioPaintLoaded = true;

const CLIO_PAINT_CANVAS_W = 480;
const CLIO_PAINT_CANVAS_H = 300;
const CLIO_PAINT_PAPERS = Object.freeze({
  banner: Object.freeze({ width: CLIO_PAINT_CANVAS_W, height: CLIO_PAINT_CANVAS_H, labelKey: "clio_paint_paper_banner" }),
  screen: Object.freeze({ width: 512, height: 342, labelKey: "clio_paint_paper_screen" }),
  page: Object.freeze({ width: 576, height: 720, labelKey: "clio_paint_paper_page" }),
});
// A saved picture opens at its own size, up to this side: past it the PNG is
// not a ClioPaint picture and is scaled down rather than held at any size.
const CLIO_PAINT_MAX_SIDE = 1440;
// Two columns, read across: the first five rows are actions, the last five
// are the same shape hollow and filled. The order is the palette's order.
const CLIO_PAINT_TOOLS = [
  "lasso", "marquee",
  "hand", "text",
  "fill", "spray",
  "brush", "pencil",
  "line", "eraser",
  "rect", "rect-filled",
  "rrect", "rrect-filled",
  "oval", "oval-filled",
  "free", "free-filled",
  "poly", "poly-filled",
];
const CLIO_PAINT_LINE_WIDTHS = [0, 1, 2, 3, 5];
const CLIO_PAINT_ZOOMS = [0.25, 0.5, 1, 2, 4, 8];
const CLIO_PAINT_FATBITS_ZOOM = 8;
const CLIO_PAINT_DESK_MARGIN = 20;
const CLIO_PAINT_GRID = 8;

function clioPaintToolKeySuffix(tool) {
  return String(tool).replace(/-/g, "_");
}

function clioPaintZoomLabel(zoom) {
  return zoom >= 1 ? `${zoom}:1` : `1:${Math.round(1 / zoom)}`;
}

function installClioPaintWindow() {
  if (typeof document === "undefined") return;
  if (document.querySelector('[data-window="clioPaint"]')) return;
  const toolButtons = CLIO_PAINT_TOOLS.map((tool) => `
            <button class="clio-paint-tool" type="button" data-clio-paint-tool="${tool}" aria-pressed="${tool === "pencil"}" data-i18n-aria-label="clio_paint_tool_${clioPaintToolKeySuffix(tool)}" aria-label="${tool}"><span class="clio-paint-glyph" data-clio-paint-glyph="${tool}" aria-hidden="true"></span></button>`).join("");
  const widthButtons = CLIO_PAINT_LINE_WIDTHS.map((width) => `
            <button class="clio-paint-width" type="button" role="radio" data-clio-paint-width="${width}" aria-checked="${width === 1}" ${width ? `aria-label="${width}"` : 'data-i18n-aria-label="clio_paint_width_none_label" aria-label="No border"'}><i class="clio-paint-width-line" aria-hidden="true"></i></button>`).join("");
  const zoomOptions = CLIO_PAINT_ZOOMS.map((zoom) => `<option value="${zoom}"${zoom === 1 ? " selected" : ""}>${clioPaintZoomLabel(zoom)}</option>`).join("");
  window.AISystem6ApplicationShell.createWindow({
    windowName: "clioPaint",
    windowClass: "clio-paint-window",
    labelledBy: "clio-paint-title",
    // Naming law: a Clio- name marks an application (ClioTalk/ClioStage
    // precedent). Untranslated in both languages, so no titleKey.
    title: "ClioPaint",
    statusClass: "compact-status-bar clio-paint-status",
    statusHtml: `
          <span class="status-bar-leading clio-paint-info" id="clio-paint-status-label" aria-live="polite"></span>
          <span class="status-bar-trailing clio-paint-status-actions">
            <span class="clio-paint-saved" id="clio-paint-saved-label"></span>
            <label class="select-wrap clio-paint-zoom-wrap"><select id="clio-paint-zoom" data-i18n-aria-label="clio_paint_zoom_label" aria-label="Magnification">${zoomOptions}</select></label>
            <button class="btn mini-btn details-bar-button clio-paint-read-button" type="button" id="clio-paint-read" aria-haspopup="menu" aria-expanded="false" data-i18n="clio_paint_read_menu">Read Sketch</button>
          </span>`,
    beforePaneHtml: `
          <div class="clio-paint-patternbar" id="clio-paint-patternbar">
            <button class="clio-paint-current" type="button" id="clio-paint-current" data-i18n-aria-label="clio_paint_current_pattern" aria-label="Current pattern"><span class="clio-paint-swatch"></span></button>
            <div class="clio-paint-patterns" id="clio-paint-patterns" role="listbox" data-i18n-aria-label="clio_paint_patterns_label" aria-label="Patterns"></div>
          </div>`,
    paneClass: "clio-paint-pane",
    paneHtml: `
          <div class="clio-paint-body">
            <div class="clio-paint-palette">
              <div class="clio-paint-toolbar" id="clio-paint-toolbar" role="toolbar" data-i18n-aria-label="clio_paint_toolbar_label" aria-label="Paint tools">${toolButtons}
              </div>
              <div class="clio-paint-widths" id="clio-paint-widths" role="radiogroup" data-i18n-aria-label="clio_paint_line_width_label" aria-label="Line width">${widthButtons}
              </div>
              <div class="clio-paint-touchbar">
                <button class="clio-paint-touch-swatch" type="button" id="clio-paint-touch-swatch" aria-haspopup="true" data-i18n-aria-label="clio_paint_patterns_label" aria-label="Patterns"><span class="clio-paint-swatch"></span></button>
                <button class="clio-paint-touch-width" type="button" id="clio-paint-touch-width" aria-haspopup="true" data-clio-paint-width-shown="1" data-i18n-aria-label="clio_paint_line_width_label" aria-label="Line width"><i class="clio-paint-width-line" aria-hidden="true"></i></button>
                <span class="clio-paint-touch-spacer"></span>
                <button class="btn clio-paint-touch-history" type="button" data-action="clio-paint-undo" data-i18n-aria-label="undo" aria-label="Undo"><span class="clio-paint-glyph" data-clio-paint-glyph="undo" aria-hidden="true"></span></button>
                <button class="btn clio-paint-touch-history" type="button" data-action="clio-paint-redo" data-i18n-aria-label="redo" aria-label="Redo"><span class="clio-paint-glyph" data-clio-paint-glyph="redo" aria-hidden="true"></span></button>
              </div>
            </div>
            <div class="clio-paint-viewport window-frame-scroller" id="clio-paint-viewport" tabindex="0" data-clio-paint-tool="pencil" role="img" data-i18n-aria-label="clio_paint_canvas_label" aria-label="Painting canvas">
              <div class="clio-paint-sizer"><canvas class="clio-paint-view" id="clio-paint-view"></canvas></div>
            </div>
            <canvas id="clio-paint-canvas" class="clio-paint-canvas" width="${CLIO_PAINT_CANVAS_W}" height="${CLIO_PAINT_CANVAS_H}" hidden></canvas>
          </div>
          <div class="clio-paint-result" id="clio-paint-result" role="dialog" data-i18n-aria-label="clio_paint_read_menu" aria-label="Read Sketch" hidden>
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
          </div>
          <div class="clio-paint-popover" id="clio-paint-popover" hidden></div>`,
  });
  if (typeof applyLanguage === "function") applyLanguage();
  if (typeof initSystemSelectControls === "function") initSystemSelectControls();
}

installClioPaintWindow();

const clioPaintState = {
  projectId: "",
  attachmentId: "",
  dirty: false,
  tool: "pencil",
  pattern: 1,
  lineWidth: 1,
  brush: 1,
  grid: false,
  zoom: 1,
  // The picture: a packed 1-bit bitmap, bit `x + y * width` set for black.
  doc: null,
  // Undo/redo is a pair of 1-bit step stacks plus the snapshot of whatever is
  // being drawn at this moment. See the History section below.
  history: { past: [], future: [], pending: null },
  // The packed bits of the picture the last time it was saved, loaded or
  // cleared, so undo can tell "back to what is on disk" from "still unsaved".
  savedBits: null,
  // A marquee or lasso region; once moved or transformed it floats above the
  // picture until it is dropped. See the Selection section.
  selection: null,
  duplicateOnDrag: false,
  drawing: null,
  polygon: null,
  hover: null,
  last: null,
  pointers: new Map(),
  gesture: null,
  patterns: [],
  docStale: true,
  floatStale: true,
  ants: 0,
  lastResult: null,
};

function clioPaintElements() {
  const root = document.querySelector('[data-window="clioPaint"]');
  // Controls are looked up inside the window's own root, never by a bare id:
  // a window that is rebuilt (or a second instance) must not be answered with
  // the first instance's nodes, and the ids stay in the markup for labels and
  // ARIA rather than as a global lookup path.
  if (!root) {
    clioPaintElementCache = null;
    return {};
  }
  if (clioPaintElementCache?.root === root) return clioPaintElementCache.elements;
  const elements = {
    root,
    pane: root.querySelector(".clio-paint-pane") || null,
    toolbar: root.querySelector("#clio-paint-toolbar"),
    widths: root.querySelector("#clio-paint-widths"),
    patterns: root.querySelector("#clio-paint-patterns"),
    current: root.querySelector("#clio-paint-current"),
    touchSwatch: root.querySelector("#clio-paint-touch-swatch"),
    touchWidth: root.querySelector("#clio-paint-touch-width"),
    viewport: root.querySelector("#clio-paint-viewport"),
    sizer: root.querySelector(".clio-paint-sizer"),
    view: root.querySelector("#clio-paint-view"),
    canvas: root.querySelector("#clio-paint-canvas"),
    zoom: root.querySelector("#clio-paint-zoom"),
    read: root.querySelector("#clio-paint-read"),
    popover: root.querySelector("#clio-paint-popover"),
    statusLabel: root.querySelector("#clio-paint-status-label"),
    savedLabel: root.querySelector("#clio-paint-saved-label"),
    result: root.querySelector("#clio-paint-result"),
    resultSketchImg: root.querySelector("#clio-paint-result-sketch-img"),
    resultMarkdown: root.querySelector("#clio-paint-result-markdown"),
    resultUnread: root.querySelector("#clio-paint-result-unread"),
    resultApply: root.querySelector("#clio-paint-result-apply"),
  };
  clioPaintElementCache = { root, elements };
  return elements;
}

/** Cached control references; invalidated when the window root changes. */
let clioPaintElementCache = null;

// Everything this window binds lives in one instance registry: listeners,
// timers and the like are released together when the window is really
// destroyed, and a hidden or WindowShade'd window keeps its picture, undo stack
// and unsaved edits because hiding is not destroying.
let clioPaintResources = window.AISystem6InstanceResources.create("clioPaint");

/**
 * The resource set for the CURRENT mount cycle. A destroyed window's set is
 * spent - a disposed registry refuses new registrations on purpose - so the
 * next mount gets its own, rather than quietly reusing a finished one.
 */
function clioPaintInstanceResources() {
  if (clioPaintResources.disposed) {
    clioPaintResources = window.AISystem6InstanceResources.create("clioPaint");
  }
  return clioPaintResources;
}

function disposeClioPaint() {
  clioPaintStopSpray();
  const outcome = clioPaintResources.dispose("clio-paint-disposed");
  const root = document.querySelector('[data-window="clioPaint"]');
  // Written as "false" rather than deleted: a data-* attribute is a string, and
  // a destroyed-then-rebuilt window has to be able to bind again.
  if (root) root.dataset.clioPaintBound = "false";
  const viewport = root?.querySelector("#clio-paint-viewport");
  if (viewport) viewport.dataset.clioPaintWired = "false";
  clioPaintElementCache = null;
  return outcome;
}

// --- 1-bit artwork ---------------------------------------------------------
//
// Glyphs are 16x16 strings, "#" for ink. They are drawn for this window, in
// MacPaint's grammar, and are not transcriptions of Apple's resources.

function clioPaintBitmap(width, height) {
  return { width, height, bits: new Uint8Array(width * height) };
}

function clioPaintBitmapFromRows(rows) {
  const bitmap = clioPaintBitmap(rows[0].length, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) if (row[x] === "#") bitmap.bits[y * bitmap.width + x] = 1;
  });
  return bitmap;
}

/** Bresenham: every pixel from one point to another, inclusive. Pure. */
function clioPaintLinePixels(x0, y0, x1, y1, plot) {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    plot(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/**
 * Whether a pixel lies inside a rectangle, a rounded rectangle or an oval
 * spanning the box x0..x1, y0..y1 (inclusive). The shape tools draw a border by
 * asking this twice — the box, and the box inset by the line width — so a
 * border is exactly as thick as the chosen line on every side. Pure.
 */
function clioPaintShapeContains(kind, x0, y0, x1, y1, x, y, maxRadius = 8) {
  if (x1 < x0 || y1 < y0 || x < x0 || x > x1 || y < y0 || y > y1) return false;
  if (kind === "rect") return true;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const px = x + 0.5;
  const py = y + 0.5;
  if (kind === "oval") {
    const dx = (px - (x0 + w / 2)) / (w / 2);
    const dy = (py - (y0 + h / 2)) / (h / 2);
    return dx * dx + dy * dy <= 1.0001;
  }
  if (kind === "rrect") {
    const r = Math.max(1, Math.min(maxRadius, Math.floor(Math.min(w, h) / 2)));
    const cx = px < x0 + r ? x0 + r : (px > x1 + 1 - r ? x1 + 1 - r : px);
    const cy = py < y0 + r ? y0 + r : (py > y1 + 1 - r ? y1 + 1 - r : py);
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r + 0.01;
  }
  return false;
}

/** Even-odd point-in-polygon, for the lasso, the polygon and the freehand shape. */
function clioPaintPointInPolygon(points, px, py) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function clioPaintShapeGlyph(kind, filled) {
  const glyph = clioPaintBitmap(16, 16);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if (!clioPaintShapeContains(kind, 1, 3, 14, 12, x, y, 3)) continue;
      const inner = clioPaintShapeContains(kind, 2, 4, 13, 11, x, y, 3);
      if (!inner || (filled && (x + y) % 2 === 0)) glyph.bits[y * 16 + x] = 1;
    }
  }
  return glyph;
}

function clioPaintPolygonGlyph(filled) {
  const glyph = clioPaintBitmap(16, 16);
  const points = [{ x: 1, y: 12 }, { x: 4, y: 3 }, { x: 12, y: 3 }, { x: 9, y: 8 }, { x: 14, y: 12 }];
  if (filled) {
    for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
      if ((x + y) % 2 === 0 && clioPaintPointInPolygon(points, x + 0.5, y + 0.5)) glyph.bits[y * 16 + x] = 1;
    }
  }
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    clioPaintLinePixels(point.x, point.y, next.x, next.y, (x, y) => { glyph.bits[y * 16 + x] = 1; });
  });
  return glyph;
}

const CLIO_PAINT_FREE_ROWS = [
  "................", "................", "....####........", "...#....##......", "..#.......#.....", "..#........#....", "...#........##..", "....#.........#.",
  "....#.........#.", "...#.........#..", "..#.........#...", "..#.......##....", "...#######......", "................", "................", "................",
];

function clioPaintFreeGlyph(filled) {
  const glyph = clioPaintBitmapFromRows(CLIO_PAINT_FREE_ROWS);
  if (!filled) return glyph;
  const outline = glyph.bits.slice();
  const inked = (x, y) => outline[y * 16 + x] === 1;
  for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
    if (inked(x, y) || (x + y) % 2) continue;
    let left = false; let right = false; let up = false; let down = false;
    for (let i = 0; i < x; i += 1) if (inked(i, y)) left = true;
    for (let i = x + 1; i < 16; i += 1) if (inked(i, y)) right = true;
    for (let j = 0; j < y; j += 1) if (inked(x, j)) up = true;
    for (let j = y + 1; j < 16; j += 1) if (inked(x, j)) down = true;
    if (left && right && up && down) glyph.bits[y * 16 + x] = 1;
  }
  return glyph;
}

const CLIO_PAINT_GLYPHS = (() => {
  const glyphs = {
    lasso: clioPaintBitmapFromRows([
      "................", ".....######.....", "...##......##...", "..#..........#..", ".#............#.", ".#............#.", ".#............#.", "..#..........#..",
      "...##......##...", ".....###.##.....", ".......##.......", "......#.#.......", "......#.........", ".......#........", "........##......", "..........#.....",
    ]),
    hand: clioPaintBitmapFromRows([
      "......#.........", ".....#.##.......", "....##.#.#......", "...#.#.#.##.....", "...#.#.#.#.#....", "...#.#.#.#.#....", ".###.#.#.#.#....", "#..#.#.#.#.#....",
      "#....#.#.#.#....", ".#.........#....", "..#........#....", "...#.......#....", "....#......#....", ".....#....#.....", "......####......", "................",
    ]),
    text: clioPaintBitmapFromRows([
      "................", "................", "................", ".......##.......", ".......##.......", "......#.##......", "......#.##......", ".....#...##.....",
      ".....#...##.....", "....#######.....", "....#.....##....", "...#......##....", "...#.......##...", "..###.....####..", "................", "................",
    ]),
    fill: clioPaintBitmapFromRows([
      "................", "......#.........", ".....#.#........", "....#...#.......", "...#.#...#......", "..#...#...#.....", ".#.....#...#....", "#.......#...#...",
      ".#.......#.#.#..", "..#.......#...#.", "...#.....#....#.", "....#...#.....#.", ".....#.#......#.", "......#......###", "..............#.", "................",
    ]),
    spray: clioPaintBitmapFromRows([
      "..#.#...........", ".#.#.#..........", "..#.#..###......", ".#.#...#.#......", ".......###......", "......#####.....", ".....#.....#....", ".....#.....#....",
      ".....#.###.#....", ".....#.#.#.#....", ".....#.###.#....", ".....#.....#....", ".....#.....#....", ".....#.....#....", ".....#######....", "................",
    ]),
    brush: clioPaintBitmapFromRows([
      ".......##.......", "......#..#......", "......#..#......", "......#..#......", "......#..#......", "......#..#......", ".....######.....", ".....#....#.....",
      ".....######.....", "....#......#....", "....#......#....", "...#........#...", "...##########...", "...##########...", "....##.##.##....", "................",
    ]),
    pencil: clioPaintBitmapFromRows([
      "...........#....", "..........###...", ".........#.###..", "........#...#...", ".......#...#....", "......#...#.....", ".....#...#......", "....#...#.......",
      "...#.#.#........", "...#..#.........", "..#..#..........", "..###...........", ".###............", ".#..............", "................", "................",
    ]),
    eraser: clioPaintBitmapFromRows([
      "................", "................", "................", ".......#########", "......#.......##", ".....#.......#.#", "....#.......#..#", "...#.......#..#.",
      "..#.......#..#..", ".#########..#...", ".#.......#.#....", ".#.......##.....", ".#########......", "................", "................", "................",
    ]),
    undo: clioPaintBitmapFromRows([
      "................", "................", ".....#..........", "....##..........", "...########.....", "..##########....", "...########.##..", "....##......##..",
      ".....#.......##.", ".............##.", ".............##.", "............##..", "......#######...", "......######....", "................", "................",
    ]),
    rect: clioPaintShapeGlyph("rect", false),
    "rect-filled": clioPaintShapeGlyph("rect", true),
    rrect: clioPaintShapeGlyph("rrect", false),
    "rrect-filled": clioPaintShapeGlyph("rrect", true),
    oval: clioPaintShapeGlyph("oval", false),
    "oval-filled": clioPaintShapeGlyph("oval", true),
    free: clioPaintFreeGlyph(false),
    "free-filled": clioPaintFreeGlyph(true),
    poly: clioPaintPolygonGlyph(false),
    "poly-filled": clioPaintPolygonGlyph(true),
  };
  const marquee = clioPaintBitmap(16, 16);
  let step = 0;
  const dash = (x, y) => { if ((step++ >> 1) % 2 === 0) marquee.bits[y * 16 + x] = 1; };
  for (let x = 1; x <= 14; x += 1) dash(x, 2);
  for (let y = 3; y <= 13; y += 1) dash(14, y);
  for (let x = 13; x >= 1; x -= 1) dash(x, 13);
  for (let y = 12; y >= 3; y -= 1) dash(1, y);
  glyphs.marquee = marquee;
  const line = clioPaintBitmap(16, 16);
  clioPaintLinePixels(2, 13, 13, 2, (x, y) => { line.bits[y * 16 + x] = 1; });
  glyphs.line = line;
  const redo = clioPaintBitmap(16, 16);
  for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) redo.bits[y * 16 + (15 - x)] = glyphs.undo.bits[y * 16 + x];
  glyphs.redo = redo;
  return glyphs;
})();

const CLIO_PAINT_CHECK_GLYPH = clioPaintBitmapFromRows([".......", "......#", ".....#.", "#...#..", ".#.#...", "..#....", "......."]);

/**
 * A bitmap as a PNG data URL: ink black, the rest white or transparent.
 * `scale` repeats each pixel so a glyph used as a CSS mask stays sharp at 1x,
 * 2x and 3x displays alike (96px divides evenly into 16, 32 and 48).
 */
function clioPaintBitmapDataUrl(bitmap, { scale = 1, transparent = false } = {}) {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  if (!transparent) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = "#000";
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      if (bitmap.bits[y * bitmap.width + x]) ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return canvas.toDataURL("image/png");
}

/**
 * A cursor keeps its black pixels and gets a one-pixel white halo, so it reads
 * on ink and on paper alike.
 */
function clioPaintCursorDataUrl(bitmap, scale) {
  const halo = clioPaintBitmap(bitmap.width, bitmap.height);
  const ink = (x, y) => x >= 0 && y >= 0 && x < bitmap.width && y < bitmap.height && bitmap.bits[y * bitmap.width + x] === 1;
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      let near = false;
      for (let j = -1; j <= 1 && !near; j += 1) for (let i = -1; i <= 1; i += 1) if (ink(x + i, y + j)) { near = true; break; }
      if (!near) continue;
      halo.bits[y * bitmap.width + x] = 1;
      ctx.fillStyle = ink(x, y) ? "#000" : "#fff";
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return canvas.toDataURL("image/png");
}

// --- Pattern palette -------------------------------------------------------
//
// Thirty-eight original 8x8 patterns, one byte per row, bit 7 on the left:
// white and black, an ordered-dither density ramp, lines, then textures. The
// families follow MacPaint's palette; the pixels are this file's own, not a
// transcription of Apple's QuickDraw pattern list.

const CLIO_PAINT_BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
];

function clioPaintPatternRows() {
  const bayer = (threshold) => CLIO_PAINT_BAYER.map((row) => row.reduce((byte, value, x) => byte | (value < threshold ? 128 >> x : 0), 0));
  return [
    [0, 0, 0, 0, 0, 0, 0, 0], [255, 255, 255, 255, 255, 255, 255, 255],
    bayer(4), bayer(8), bayer(16), bayer(24), bayer(32), bayer(40), bayer(48), bayer(56),
    [255, 0, 0, 0, 255, 0, 0, 0], [255, 0, 255, 0, 255, 0, 255, 0], [0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88], [0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa],
    [255, 255, 0, 0, 255, 255, 0, 0], [0xcc, 0xcc, 0xcc, 0xcc, 0xcc, 0xcc, 0xcc, 0xcc],
    [0x11, 0x22, 0x44, 0x88, 0x11, 0x22, 0x44, 0x88], [0x88, 0x44, 0x22, 0x11, 0x88, 0x44, 0x22, 0x11], [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
    [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01], [0xff, 0x88, 0x88, 0x88, 0xff, 0x88, 0x88, 0x88], [0xff, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80], [0x81, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x81],
    [0xff, 0x80, 0x80, 0x80, 0xff, 0x08, 0x08, 0x08], [0x00, 0x7f, 0x7f, 0x7f, 0x00, 0xf7, 0xf7, 0xf7], [0xf5, 0x05, 0xf5, 0x05, 0x5f, 0x50, 0x5f, 0x50], [0x14, 0x22, 0x41, 0x80, 0x14, 0x22, 0x41, 0x80],
    [0x3c, 0x42, 0x81, 0x81, 0xc3, 0x24, 0x18, 0x18], [0x10, 0x38, 0x7c, 0x38, 0x10, 0x00, 0x00, 0x00], [0x10, 0x10, 0x7c, 0x10, 0x10, 0x00, 0x00, 0x00], [0x38, 0x44, 0x44, 0x44, 0x38, 0x00, 0x00, 0x00],
    [0x30, 0x48, 0x84, 0x03, 0x00, 0x00, 0x00, 0x00], [0x80, 0x41, 0x22, 0x14, 0x08, 0x00, 0x00, 0x00], [0x80, 0xc0, 0xe0, 0xf0, 0x00, 0x00, 0x00, 0x00], [0x82, 0x10, 0x44, 0x01, 0x28, 0x80, 0x12, 0x40],
    [0x60, 0x02, 0x02, 0x00, 0x0c, 0x00, 0x40, 0x40], [0x80, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00], [0x10, 0x54, 0x38, 0xfe, 0x38, 0x54, 0x10, 0x00],
  ];
}

clioPaintState.patterns = clioPaintPatternRows();

function clioPaintPatternBit(index, x, y) {
  const rows = clioPaintState.patterns[index] || clioPaintState.patterns[1];
  return (rows[y & 7] >> (7 - (x & 7))) & 1;
}

function clioPaintPatternDataUrl(index) {
  const rows = clioPaintState.patterns[index];
  if (!rows) return "";
  const bitmap = clioPaintBitmap(8, 8);
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) bitmap.bits[y * 8 + x] = (rows[y] >> (7 - x)) & 1;
  return clioPaintBitmapDataUrl(bitmap);
}

function renderClioPaintPatterns() {
  const { patterns: container } = clioPaintElements();
  if (!container) return;
  if (container.dataset.clioPaintReady !== "true") {
    container.dataset.clioPaintReady = "true";
    clioPaintState.patterns.forEach((pattern, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clio-paint-pattern";
      button.dataset.clioPaintPattern = String(index);
      button.setAttribute("role", "option");
      button.setAttribute("aria-label", t("clio_paint_pattern", index + 1));
      container.append(button);
    });
  }
  syncClioPaintPatterns();
}

function syncClioPaintPatterns() {
  const { root } = clioPaintElements();
  if (!root) return;
  root.querySelectorAll("[data-clio-paint-pattern]").forEach((button) => {
    const index = Number(button.dataset.clioPaintPattern);
    button.setAttribute("aria-selected", String(index === clioPaintState.pattern));
    button.style.setProperty("--clio-paint-pattern", `url(${clioPaintPatternDataUrl(index)})`);
  });
  const current = `url(${clioPaintPatternDataUrl(clioPaintState.pattern)})`;
  root.querySelectorAll(".clio-paint-swatch").forEach((swatch) => swatch.style.setProperty("--clio-paint-pattern", current));
}

function setClioPaintPattern(index) {
  if (!clioPaintState.patterns[index]) return;
  clioPaintState.pattern = index;
  syncClioPaintPatterns();
}

function renderClioPaintGlyphs() {
  const { root } = clioPaintElements();
  if (!root) return;
  root.querySelectorAll("[data-clio-paint-glyph]").forEach((glyph) => {
    if (glyph.dataset.clioPaintGlyphReady === "true") return;
    const bitmap = CLIO_PAINT_GLYPHS[glyph.dataset.clioPaintGlyph];
    if (!bitmap) return;
    glyph.dataset.clioPaintGlyphReady = "true";
    glyph.style.setProperty("--clio-paint-glyph", `url(${clioPaintBitmapDataUrl(bitmap, { scale: 6, transparent: true })})`);
  });
  root.style?.setProperty?.("--clio-paint-check", `url(${clioPaintBitmapDataUrl(CLIO_PAINT_CHECK_GLYPH, { scale: 6, transparent: true })})`);
}

// --- Tool selection ------------------------------------------------------

function setClioPaintTool(tool) {
  if (!CLIO_PAINT_TOOLS.includes(tool)) return;
  if (tool !== clioPaintState.tool) {
    clioPaintCommitTextInput();
    if (clioPaintState.polygon) finishClioPaintPolygon();
    // Moving between the two selection tools keeps the region; any other tool
    // puts the floating pixels down where they are.
    const keepSelection = ["marquee", "lasso"].includes(tool) && ["marquee", "lasso"].includes(clioPaintState.tool);
    if (!keepSelection) clioPaintDropSelection();
  }
  clioPaintState.tool = tool;
  const { toolbar, viewport } = clioPaintElements();
  if (viewport) {
    viewport.dataset.clioPaintTool = tool;
    viewport.dataset.clioPaintSelection = "";
  }
  toolbar?.querySelectorAll("[data-clio-paint-tool]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.clioPaintTool === tool));
  });
  syncClioPaintCursor();
  showClioPaintInfo();
  requestClioPaintRender();
  if (typeof updateMenuState === "function") updateMenuState();
}

function setClioPaintLineWidth(width, { quiet = false } = {}) {
  if (!CLIO_PAINT_LINE_WIDTHS.includes(width)) return;
  clioPaintState.lineWidth = width;
  const { root, touchWidth } = clioPaintElements();
  root?.querySelectorAll("[data-clio-paint-width]").forEach((button) => {
    button.setAttribute("aria-checked", String(Number(button.dataset.clioPaintWidth) === width));
  });
  if (touchWidth) touchWidth.dataset.clioPaintWidthShown = String(width);
  if (!quiet) clioPaintFlash(width ? t("clio_paint_width_set", width) : t("clio_paint_width_none"));
}

/**
 * Double-clicking a tool is its shortcut, the way MacPaint's palette worked
 * and Photoshop kept for a tool's options: into FatBits from the pencil, the
 * whole page from the grabber, everything from the two selection tools, the
 * brush shapes from the brush, and the whole picture wiped from the eraser —
 * a step Undo takes back, like any other.
 */
function clioPaintDoubleClickTool(tool) {
  if (tool === "pencil") toggleClioPaintFatBits();
  else if (tool === "hand") showClioPaintPage();
  else if (tool === "marquee") selectAllClioPaint();
  else if (tool === "lasso") selectAllClioPaint({ lasso: true });
  else if (tool === "brush") openClioPaintBrushShapes();
  else if (tool === "eraser") eraseAllClioPaint();
}

// --- Document --------------------------------------------------------------

function clioPaintCreateDocument(width, height) {
  return { width, height, bits: new Uint8Array(Math.ceil((width * height) / 8)) };
}

clioPaintState.doc = clioPaintCreateDocument(CLIO_PAINT_CANVAS_W, CLIO_PAINT_CANVAS_H);

function clioPaintGetBit(doc, x, y) {
  if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return 0;
  const pixel = y * doc.width + x;
  return (doc.bits[pixel >> 3] >> (7 - (pixel & 7))) & 1;
}

function clioPaintSetBit(doc, x, y, value) {
  if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
  const pixel = y * doc.width + x;
  if (value) doc.bits[pixel >> 3] |= 128 >> (pixel & 7);
  else doc.bits[pixel >> 3] &= ~(128 >> (pixel & 7));
}

function clioPaintPut(x, y, value) {
  clioPaintSetBit(clioPaintState.doc, x, y, value);
}

function clioPaintPixel(x, y) {
  return clioPaintGetBit(clioPaintState.doc, x, y);
}

function clioPaintPatternAt(x, y) {
  return clioPaintPatternBit(clioPaintState.pattern, x, y);
}

function clioPaintMarkChanged() {
  clioPaintState.docStale = true;
  requestClioPaintRender();
}

// --- History ---------------------------------------------------------------
//
// A deep undo stack and a 1-bit picture are not in tension, because a step
// does not have to cost what a canvas costs: the same step kept as ImageData
// is 480x300x4 bytes (576 KB), and kept the way the picture is actually made —
// one bit per pixel, black or white — it is 18 KB. The document itself is
// kept in that form, so a step is a copy of it, and sixty of them (~1 MB) are
// affordable where a single raw snapshot would already be most of the budget.
//
// The stack semantics are JS Paint's, which is where this shape was learned:
// undos/redos stacks around a current node (a new edit empties the redo
// stack), and cancel() discarding the node a cancelled operation would have
// left behind. Here the same two ideas wear paint clothes — `past`/`future`
// are stacks of packed steps, and `pending` is the picture as it was when the
// operation now in progress began, which is both what a shape preview
// repaints from and what Escape restores without writing a step at all.

const CLIO_PAINT_HISTORY_LIMIT = 60;

/**
 * One packed step: bit `x + y * width` set for a black pixel.
 * Pure — takes and returns plain data, so it can be checked without a canvas.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} imageData
 * @returns {Uint8Array}
 */
function clioPaintPackImageData(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const bits = new Uint8Array(Math.ceil((width * height) / 8));
  const data = imageData.data;
  const total = width * height;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const i = pixel * 4;
    // A saved picture is already black or white; the alpha test is what keeps
    // a transparent corner white instead of reading as black.
    if (data[i + 3] > 32 && data[i] < 128) bits[pixel >> 3] |= 128 >> (pixel & 7);
  }
  return bits;
}

/** Write packed bits back into an ImageData-shaped object, in place. */
function clioPaintApplyPackedBits(imageData, bits) {
  const total = imageData.width * imageData.height;
  const data = imageData.data;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const value = bits[pixel >> 3] & (128 >> (pixel & 7)) ? 0 : 255;
    const i = pixel * 4;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
  return imageData;
}

function clioPaintBitsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Newest last; anything past the limit falls off the oldest end. */
function clioPaintTrimHistory(history, limit = CLIO_PAINT_HISTORY_LIMIT) {
  while (history.past.length > limit) history.past.shift();
  return history;
}

/**
 * One committed step. A new edit also closes the redo branch, the way every
 * stack-based undo does: what you undid is no longer reachable once you draw
 * something else.
 */
function clioPaintPushHistoryEntry(history, entry, limit = CLIO_PAINT_HISTORY_LIMIT) {
  history.past.push(entry);
  clioPaintTrimHistory(history, limit);
  history.future.length = 0;
  return entry;
}

function clioPaintToolLabelKey(tool) {
  return tool === "move" ? "clio_paint_op_move" : `clio_paint_tool_${clioPaintToolKeySuffix(tool)}`;
}

/**
 * The picture as the writer sees it, packed: the document with any floating
 * selection put down where it floats. This is what a step, a save and the
 * "unsaved" test all compare, so a region that is only lifted and put back
 * never counts as a change.
 */
function clioPaintPackCanvas() {
  const doc = clioPaintState.doc;
  if (!doc) return null;
  const selection = clioPaintState.selection;
  if (!selection?.lifted) return doc.bits.slice();
  const flattened = { width: doc.width, height: doc.height, bits: doc.bits.slice() };
  clioPaintStampSelectionInto(flattened, selection);
  return flattened.bits;
}

/**
 * Remember the picture as it is now, before the tool about to run changes it.
 * Shape previews redraw from this, Escape puts it back, and a committed step
 * keeps it as the state Undo returns to.
 */
function clioPaintSnapshotPending() {
  const doc = clioPaintState.doc;
  if (!doc) return false;
  clioPaintState.history.pending = { width: doc.width, height: doc.height, bits: clioPaintPackCanvas() };
  return true;
}

function clioPaintRestorePending() {
  const pending = clioPaintState.history.pending;
  if (!pending) return false;
  clioPaintState.doc = { width: pending.width, height: pending.height, bits: pending.bits.slice() };
  // The pending picture is the flat one from before the operation, floating
  // pixels included, so a region still hovering over it would be a copy.
  clioPaintState.selection = null;
  clioPaintMarkChanged();
  return true;
}

/** Redraw a preview from the pending picture, leaving the snapshot in place. */
function clioPaintRepaintFromPending() {
  const pending = clioPaintState.history.pending;
  if (!pending) return false;
  clioPaintState.doc.bits.set(pending.bits);
  return true;
}

/**
 * Close the step a tool just finished: the pending snapshot becomes the state
 * Undo returns to, tagged with what the operation was.
 *
 * `coalesce` folds it into the step before it when that step is the same kind
 * of operation, so dragging a selection around — or nudging it ten times — is
 * one row in the menu rather than ten. The earlier snapshot is the one kept,
 * so undoing a run of moves returns to before the run started.
 */
function clioPaintCommitHistory(labelKey, { coalesce = false } = {}) {
  const pending = clioPaintState.history.pending;
  if (!pending) return false;
  const history = clioPaintState.history;
  history.pending = null;
  const now = clioPaintPackCanvas();
  const unchanged = pending.width === clioPaintState.doc.width
    && pending.height === clioPaintState.doc.height
    && clioPaintBitsEqual(pending.bits, now);
  // A click that changed nothing — a fill on an area already that pattern —
  // leaves no row behind for Undo to spend a press on.
  if (unchanged) return false;
  if (coalesce && history.past[history.past.length - 1]?.labelKey === labelKey) {
    history.future.length = 0;
  } else {
    clioPaintPushHistoryEntry(history, { labelKey, bits: pending.bits, width: pending.width, height: pending.height });
  }
  clioPaintSyncDirtyFromSaved();
  syncClioPaintStatus();
  return true;
}

function clioPaintHistoryDepth() {
  return { past: clioPaintState.history.past.length, future: clioPaintState.history.future.length };
}

function clioPaintCanUndo() {
  return clioPaintState.history.past.length > 0;
}

function clioPaintCanRedo() {
  return clioPaintState.history.future.length > 0;
}

function clioPaintApplyStep(step) {
  if (!step?.bits) return false;
  const width = step.width || clioPaintState.doc.width;
  const height = step.height || clioPaintState.doc.height;
  clioPaintState.doc = { width, height, bits: step.bits.slice() };
  clioPaintState.selection = null;
  clioPaintState.drawing = null;
  clioPaintState.polygon = null;
  clioPaintSyncContentSize();
  clioPaintMarkChanged();
  return true;
}

/** Did Undo land back on the picture that is already saved? Say so. */
function clioPaintSyncDirtyFromSaved() {
  const current = clioPaintPackCanvas();
  clioPaintState.dirty = !(current && clioPaintState.savedBits && clioPaintBitsEqual(current, clioPaintState.savedBits));
}

function clioPaintResetHistory() {
  clioPaintState.history = { past: [], future: [], pending: null };
  clioPaintState.selection = null;
  clioPaintState.drawing = null;
  clioPaintState.polygon = null;
  clioPaintState.savedBits = clioPaintPackCanvas();
}

function clioPaintCurrentStep(labelKey) {
  const doc = clioPaintState.doc;
  return { labelKey, bits: clioPaintPackCanvas(), width: doc.width, height: doc.height };
}

function undoClioPaint() {
  cancelClioPaintOperation({ quiet: true });
  const history = clioPaintState.history;
  const step = history.past.pop();
  if (!step) return false;
  history.future.push(clioPaintCurrentStep(step.labelKey));
  clioPaintApplyStep(step);
  clioPaintSyncDirtyFromSaved();
  syncClioPaintStatus();
  setStatus(t("clio_paint_undid", t(step.labelKey)));
  return true;
}

function redoClioPaint() {
  cancelClioPaintOperation({ quiet: true });
  const history = clioPaintState.history;
  const step = history.future.pop();
  if (!step) return false;
  history.past.push(clioPaintCurrentStep(step.labelKey));
  clioPaintTrimHistory(history);
  clioPaintApplyStep(step);
  clioPaintSyncDirtyFromSaved();
  syncClioPaintStatus();
  setStatus(t("clio_paint_redid", t(step.labelKey)));
  return true;
}

/**
 * Escape means "put it back", the way JS Paint's cancel() discards the state a
 * cancelled operation would have left behind: the pending snapshot returns and
 * no step is written, so a mis-drag costs nothing and leaves no trace in the
 * menu. An aborted move drops the marquee too — the pixels are back where they
 * started, so the selection that no longer describes anything goes with them.
 */
function cancelClioPaintOperation({ quiet = false } = {}) {
  const drawing = clioPaintState.drawing;
  const polygon = clioPaintState.polygon;
  if (!drawing && !polygon) return false;
  clioPaintStopSpray();
  const hadPixels = Boolean(clioPaintState.history.pending);
  const wasSelectionWork = drawing?.tool === "move" || drawing?.tool === "marquee" || drawing?.tool === "lasso";
  clioPaintRestorePending();
  clioPaintState.history.pending = null;
  clioPaintState.drawing = null;
  clioPaintState.polygon = null;
  if (wasSelectionWork) clioPaintState.selection = null;
  syncClioPaintStatus();
  requestClioPaintRender();
  // Only a cancelled operation that had pixels under it has anything to
  // report: a marquee that was still being dragged just vanishes.
  if (hadPixels && !quiet) setStatus(t("clio_paint_op_cancelled"));
  return true;
}

/**
 * Text arrives from the browser antialiased; a 1-bit picture keeps a pixel
 * only where the glyph is mostly ink. Returns one flag per pixel.
 */
function clioPaintThreshold(imageData) {
  const total = imageData.width * imageData.height;
  const ink = new Uint8Array(total);
  const data = imageData.data;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const i = pixel * 4;
    const alpha = data[i + 3];
    const lum = alpha === 0 ? 255 : (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    ink[pixel] = alpha > 32 && lum < 150 ? 1 : 0;
  }
  return ink;
}

// --- Drawing engine --------------------------------------------------------

function clioPaintStamp(bitmap, cx, cy, value) {
  const ox = cx - Math.floor(bitmap.width / 2);
  const oy = cy - Math.floor(bitmap.height / 2);
  for (let j = 0; j < bitmap.height; j += 1) {
    for (let i = 0; i < bitmap.width; i += 1) {
      if (!bitmap.bits[j * bitmap.width + i]) continue;
      const x = ox + i;
      const y = oy + j;
      clioPaintPut(x, y, value === "pattern" ? clioPaintPatternAt(x, y) : value);
    }
  }
}

function clioPaintPenLine(from, to, width) {
  if (width <= 0) return;
  const offset = Math.floor((width - 1) / 2);
  clioPaintLinePixels(from.x, from.y, to.x, to.y, (x, y) => {
    for (let j = 0; j < width; j += 1) for (let i = 0; i < width; i += 1) clioPaintPut(x - offset + i, y - offset + j, 1);
  });
}

function clioPaintBrushShape(kind, size) {
  const brush = clioPaintBitmap(size, size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let on = false;
      if (kind === "round") on = (x - c) ** 2 + (y - c) ** 2 <= (size / 2) ** 2 - 0.3;
      else if (kind === "square") on = true;
      else if (kind === "slash") on = Math.abs(x + y - (size - 1)) <= 0.5;
      else if (kind === "back") on = Math.abs(x - y) <= 0.5;
      else if (kind === "hbar") on = Math.abs(y - c) <= 0.5;
      else if (kind === "vbar") on = Math.abs(x - c) <= 0.5;
      if (on) brush.bits[y * size + x] = 1;
    }
  }
  return brush;
}

const CLIO_PAINT_BRUSHES = [
  ["round", 2], ["round", 4], ["round", 6], ["round", 8],
  ["square", 1], ["square", 3], ["square", 5], ["square", 7],
  ["slash", 5], ["slash", 8], ["back", 5], ["back", 8],
  ["hbar", 7], ["vbar", 7], ["hbar", 11], ["round", 11],
].map(([kind, size]) => clioPaintBrushShape(kind, size));

function clioPaintEraserSize() {
  // The eraser keeps its size on the screen, so it covers fewer pixels as the
  // picture is magnified — the square under the pointer is the one that erases.
  return Math.max(2, Math.round(16 / clioPaintState.zoom));
}

function clioPaintBeginStroke(tool, point) {
  clioPaintSnapshotPending();
  const drawing = { tool, last: point };
  if (tool === "pencil") {
    // MacPaint's pencil draws white when it starts on a black pixel, so a
    // single wrong pixel is fixed without reaching for the eraser.
    drawing.value = clioPaintPixel(point.x, point.y) ? 0 : 1;
    clioPaintPut(point.x, point.y, drawing.value);
  } else if (tool === "eraser") {
    drawing.shape = clioPaintBrushShape("square", clioPaintEraserSize());
    clioPaintStamp(drawing.shape, point.x, point.y, 0);
  } else if (tool === "brush") {
    clioPaintStamp(CLIO_PAINT_BRUSHES[clioPaintState.brush], point.x, point.y, "pattern");
  }
  clioPaintState.drawing = drawing;
  clioPaintMarkChanged();
}

function clioPaintStrokeSegment(from, to) {
  const drawing = clioPaintState.drawing;
  if (!drawing) return;
  if (drawing.tool === "pencil") {
    clioPaintLinePixels(from.x, from.y, to.x, to.y, (x, y) => clioPaintPut(x, y, drawing.value));
  } else if (drawing.tool === "eraser") {
    clioPaintLinePixels(from.x, from.y, to.x, to.y, (x, y) => clioPaintStamp(drawing.shape, x, y, 0));
  } else if (drawing.tool === "brush") {
    const brush = CLIO_PAINT_BRUSHES[clioPaintState.brush];
    clioPaintLinePixels(from.x, from.y, to.x, to.y, (x, y) => clioPaintStamp(brush, x, y, "pattern"));
  }
  drawing.last = to;
  clioPaintMarkChanged();
}

function clioPaintEndStroke() {
  const drawing = clioPaintState.drawing;
  if (!drawing) return;
  clioPaintState.drawing = null;
  clioPaintCommitHistory(clioPaintToolLabelKey(drawing.tool));
}

// The spray can keeps spraying while the button is held, even with the pointer
// still, the way an airbrush does: the density comes from how long you stay.
let clioPaintSprayTimer = 0;

function clioPaintSprayAt(point) {
  for (let k = 0; k < 14; k += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * 9;
    const x = Math.round(point.x + Math.cos(angle) * radius);
    const y = Math.round(point.y + Math.sin(angle) * radius);
    clioPaintPut(x, y, clioPaintPatternAt(x, y));
  }
  clioPaintMarkChanged();
}

function clioPaintBeginSpray(point) {
  clioPaintSnapshotPending();
  clioPaintState.drawing = { tool: "spray", at: point };
  clioPaintSprayAt(point);
  clioPaintStopSpray();
  clioPaintSprayTimer = setInterval(() => {
    if (clioPaintState.drawing?.tool === "spray") clioPaintSprayAt(clioPaintState.drawing.at);
    else clioPaintStopSpray();
  }, 40);
}

function clioPaintStopSpray() {
  if (clioPaintSprayTimer) clearInterval(clioPaintSprayTimer);
  clioPaintSprayTimer = 0;
}

function clioPaintBeginShape(tool, point) {
  clioPaintSnapshotPending();
  const filled = tool.endsWith("-filled");
  const kind = tool.replace("-filled", "");
  clioPaintState.drawing = { tool, kind, filled, start: point, current: point, constrain: false };
  clioPaintDrawShape(kind, point, point, filled);
  clioPaintMarkChanged();
}

/**
 * What Shift means while a shape is being drawn — the same convention JS Paint
 * documents for its box and shape tools ("the size shown is affected by
 * holding Shift to constrain proportions"): a line snaps to 45-degree steps,
 * a rectangle to a square, an oval to a circle. Pure, so the rule can be
 * checked without a canvas.
 */
function clioPaintConstrainPoint(start, end, tool, constrain) {
  if (!constrain) return { x: end.x, y: end.y };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (tool === "line") {
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    const length = Math.hypot(dx, dy);
    return {
      x: start.x + Math.round(Math.cos(angle) * length),
      y: start.y + Math.round(Math.sin(angle) * length),
    };
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: start.x + (dx < 0 ? -size : size),
    y: start.y + (dy < 0 ? -size : size),
  };
}

/**
 * A line in black at the chosen width; a box shape as a border exactly the
 * line width thick, and a filled one painted with the current pattern inside
 * it. A hollow shape never has "no border" — it would draw nothing — so the
 * dotted width only means something to the filled half of the palette.
 */
function clioPaintDrawShape(kind, start, end, filled) {
  const width = clioPaintState.lineWidth;
  if (kind === "line") {
    clioPaintPenLine(start, end, Math.max(1, width));
    return;
  }
  const border = filled ? width : Math.max(1, width);
  const x0 = Math.min(start.x, end.x);
  const x1 = Math.max(start.x, end.x);
  const y0 = Math.min(start.y, end.y);
  const y1 = Math.max(start.y, end.y);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (!clioPaintShapeContains(kind, x0, y0, x1, y1, x, y)) continue;
      const inner = border > 0 ? clioPaintShapeContains(kind, x0 + border, y0 + border, x1 - border, y1 - border, x, y) : true;
      if (!inner) clioPaintPut(x, y, 1);
      else if (filled) clioPaintPut(x, y, clioPaintPatternAt(x, y));
    }
  }
}

function clioPaintPreviewShape(point, constrain) {
  const drawing = clioPaintState.drawing;
  if (!drawing || !clioPaintState.history.pending) return;
  // Redraw from the state the shape started from, so the outline that follows
  // the pointer never leaves a trail of earlier outlines behind it.
  clioPaintRepaintFromPending();
  if (constrain !== undefined) drawing.constrain = constrain === true;
  drawing.current = clioPaintConstrainPoint(drawing.start, point, drawing.kind === "line" ? "line" : "rect", drawing.constrain);
  clioPaintDrawShape(drawing.kind, drawing.start, drawing.current, drawing.filled);
  clioPaintMarkChanged();
  clioPaintShowDragSize(drawing.current.x - drawing.start.x, drawing.current.y - drawing.start.y);
}

function clioPaintEndShape() {
  const drawing = clioPaintState.drawing;
  if (!drawing) return;
  clioPaintState.drawing = null;
  clioPaintCommitHistory(clioPaintToolLabelKey(drawing.tool));
}

function clioPaintDrawOutline(points, filled, close) {
  if (!points.length) return;
  if (filled && points.length > 2) {
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    points.forEach((point) => { x0 = Math.min(x0, point.x); x1 = Math.max(x1, point.x); y0 = Math.min(y0, point.y); y1 = Math.max(y1, point.y); });
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
      if (clioPaintPointInPolygon(points, x + 0.5, y + 0.5)) clioPaintPut(x, y, clioPaintPatternAt(x, y));
    }
  }
  const width = filled ? clioPaintState.lineWidth : Math.max(1, clioPaintState.lineWidth);
  for (let i = 0; i < points.length - 1; i += 1) clioPaintPenLine(points[i], points[i + 1], width);
  if (close && points.length > 2) clioPaintPenLine(points[points.length - 1], points[0], width);
}

function clioPaintBeginFreehand(tool, point) {
  clioPaintSnapshotPending();
  clioPaintState.drawing = { tool, points: [point], filled: tool.endsWith("-filled") };
}

function clioPaintExtendFreehand(point) {
  const drawing = clioPaintState.drawing;
  const last = drawing.points[drawing.points.length - 1];
  if (last.x === point.x && last.y === point.y) return;
  drawing.points.push(point);
  clioPaintRepaintFromPending();
  clioPaintDrawOutline(drawing.points, drawing.filled, false);
  clioPaintMarkChanged();
}

function clioPaintEndFreehand() {
  const drawing = clioPaintState.drawing;
  if (!drawing) return;
  clioPaintState.drawing = null;
  clioPaintRepaintFromPending();
  clioPaintDrawOutline(drawing.points, drawing.filled, true);
  clioPaintMarkChanged();
  clioPaintCommitHistory(clioPaintToolLabelKey(drawing.tool));
}

/**
 * A polygon is one click per corner. It closes on a double-click, on Return,
 * or on a click back at its first corner; Escape takes the whole of it back.
 */
function clioPaintPolygonClick(tool, point) {
  const polygon = clioPaintState.polygon;
  if (!polygon) {
    clioPaintSnapshotPending();
    clioPaintState.polygon = { tool, points: [point], filled: tool.endsWith("-filled") };
  } else {
    const first = polygon.points[0];
    const closeEnough = 6 / clioPaintState.zoom;
    if (polygon.points.length > 2 && Math.abs(first.x - point.x) <= closeEnough && Math.abs(first.y - point.y) <= closeEnough) {
      finishClioPaintPolygon();
      return;
    }
    polygon.points.push(point);
  }
  clioPaintRepaintFromPending();
  clioPaintDrawOutline(clioPaintState.polygon.points, clioPaintState.polygon.filled, false);
  clioPaintMarkChanged();
}

function finishClioPaintPolygon() {
  const polygon = clioPaintState.polygon;
  if (!polygon) return false;
  clioPaintState.polygon = null;
  clioPaintRepaintFromPending();
  clioPaintDrawOutline(polygon.points, polygon.filled, true);
  clioPaintMarkChanged();
  clioPaintCommitHistory(clioPaintToolLabelKey(polygon.tool));
  return true;
}

function clioPaintFloodFill(point) {
  const doc = clioPaintState.doc;
  if (point.x < 0 || point.y < 0 || point.x >= doc.width || point.y >= doc.height) return;
  clioPaintSnapshotPending();
  const target = clioPaintPixel(point.x, point.y);
  const seen = new Uint8Array(doc.width * doc.height);
  const same = (x, y) => !seen[y * doc.width + x] && clioPaintGetBit(doc, x, y) === target;
  const stack = [point.x, point.y];
  // Scanline fill over the region the pointer landed in, marked first and
  // painted after: a pattern puts white pixels into a white region, so the
  // region cannot be told apart by colour while it is being painted.
  while (stack.length) {
    const y = stack.pop();
    let x = stack.pop();
    while (x >= 0 && same(x, y)) x -= 1;
    x += 1;
    let spanUp = false;
    let spanDown = false;
    while (x < doc.width && same(x, y)) {
      seen[y * doc.width + x] = 1;
      if (y > 0) {
        const open = same(x, y - 1);
        if (open && !spanUp) { stack.push(x, y - 1); spanUp = true; } else if (!open) spanUp = false;
      }
      if (y < doc.height - 1) {
        const open = same(x, y + 1);
        if (open && !spanDown) { stack.push(x, y + 1); spanDown = true; } else if (!open) spanDown = false;
      }
      x += 1;
    }
  }
  for (let i = 0; i < seen.length; i += 1) {
    if (!seen[i]) continue;
    const x = i % doc.width;
    const y = (i - x) / doc.width;
    clioPaintSetBit(doc, x, y, clioPaintPatternAt(x, y));
  }
  clioPaintMarkChanged();
  clioPaintCommitHistory(clioPaintToolLabelKey("fill"));
}

function eraseAllClioPaint() {
  clioPaintDropSelection();
  clioPaintSnapshotPending();
  clioPaintState.doc.bits.fill(0);
  clioPaintMarkChanged();
  if (clioPaintCommitHistory("clio_paint_op_erase_all")) clioPaintFlash(t("clio_paint_erased_all"));
}

/**
 * While a box is being dragged, the window's own status line says how big it
 * is — JS Paint prints the same figure under the canvas as you size a shape,
 * and it is the difference between drawing a 40-pixel box and guessing.
 */
function clioPaintShowDragSize(width, height) {
  const { statusLabel } = clioPaintElements();
  if (!statusLabel) return;
  statusLabel.textContent = `${t(clioPaintToolLabelKey(clioPaintState.drawing?.tool || clioPaintState.tool))}  ${t("clio_paint_size", String(Math.abs(Math.round(width)) + 1), String(Math.abs(Math.round(height)) + 1))}`;
}

// --- Selection -------------------------------------------------------------
//
// A region from the Select tool is a rectangle and carries everything inside
// it, white included. A region from the Lasso is the outline drawn around it
// and carries only the ink, so it passes over whatever lies beneath. Either
// one stays on the picture until it is moved or changed; from then on it
// floats — the picture underneath keeps its own pixels — until it is put
// down by another tool, a click outside it, or Escape. Putting it down
// changes nothing the writer can see, so it writes no step of its own.

function clioPaintSelectionRect() {
  const selection = clioPaintState.selection;
  if (!selection) return null;
  return { x: selection.x, y: selection.y, w: selection.w, h: selection.h };
}

function clioPaintPointInSelection(point) {
  const selection = clioPaintState.selection;
  if (!selection || selection.w <= 0 || selection.h <= 0) return false;
  const i = point.x - selection.x;
  const j = point.y - selection.y;
  if (i < 0 || j < 0 || i >= selection.w || j >= selection.h) return false;
  if (selection.kind === "rect") return true;
  return clioPaintPointInPolygon(selection.path, i + 0.5, j + 0.5);
}

/**
 * Take the region's pixels off the picture into the selection itself. With
 * `copy` the picture keeps them too — the Option-drag duplicate.
 */
function clioPaintLiftSelection({ copy = false } = {}) {
  const selection = clioPaintState.selection;
  if (!selection || selection.lifted) return selection;
  const { w, h } = selection;
  const bits = new Uint8Array(w * h);
  const mask = new Uint8Array(w * h);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const x = selection.x + i;
      const y = selection.y + j;
      const value = clioPaintPixel(x, y);
      const inside = selection.kind === "rect" || (value && clioPaintPointInPolygon(selection.path, i + 0.5, j + 0.5));
      if (!inside) continue;
      mask[j * w + i] = 1;
      bits[j * w + i] = value;
      if (!copy) clioPaintPut(x, y, 0);
    }
  }
  Object.assign(selection, { lifted: true, bits, mask });
  clioPaintState.floatStale = true;
  clioPaintMarkChanged();
  return selection;
}

function clioPaintStampSelectionInto(doc, selection) {
  if (!selection?.lifted) return;
  for (let j = 0; j < selection.h; j += 1) {
    for (let i = 0; i < selection.w; i += 1) {
      const k = j * selection.w + i;
      if (selection.mask[k]) clioPaintSetBit(doc, selection.x + i, selection.y + j, selection.bits[k]);
    }
  }
}

function clioPaintDropSelection() {
  const selection = clioPaintState.selection;
  if (!selection) return;
  clioPaintStampSelectionInto(clioPaintState.doc, selection);
  clioPaintState.selection = null;
  const { viewport } = clioPaintElements();
  if (viewport) viewport.dataset.clioPaintSelection = "";
  clioPaintMarkChanged();
  if (typeof updateMenuState === "function") updateMenuState();
}

function clioPaintBeginMarquee(point, constrain = false) {
  clioPaintDropSelection();
  clioPaintState.drawing = { tool: "marquee", start: point, current: point, constrain };
  requestClioPaintRender();
}

function clioPaintUpdateMarquee(point, constrain) {
  const drawing = clioPaintState.drawing;
  if (!drawing || drawing.tool !== "marquee") return;
  if (constrain !== undefined) drawing.constrain = constrain === true;
  // Shift makes a square marquee, the same rule a rectangle is drawn under.
  drawing.current = clioPaintConstrainPoint(drawing.start, point, "rect", drawing.constrain);
  clioPaintShowDragSize(drawing.current.x - drawing.start.x, drawing.current.y - drawing.start.y);
  requestClioPaintRender();
}

function clioPaintEndMarquee() {
  const drawing = clioPaintState.drawing;
  clioPaintState.drawing = null;
  if (!drawing) return;
  const doc = clioPaintState.doc;
  const x0 = Math.max(0, Math.min(drawing.start.x, drawing.current.x));
  const y0 = Math.max(0, Math.min(drawing.start.y, drawing.current.y));
  const x1 = Math.min(doc.width - 1, Math.max(drawing.start.x, drawing.current.x));
  const y1 = Math.min(doc.height - 1, Math.max(drawing.start.y, drawing.current.y));
  if (x1 - x0 < 1 && y1 - y0 < 1) {
    requestClioPaintRender();
    return;
  }
  clioPaintState.selection = { kind: "rect", x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, lifted: false };
  requestClioPaintRender();
  if (typeof updateMenuState === "function") updateMenuState();
}

function clioPaintBeginLasso(point) {
  clioPaintDropSelection();
  clioPaintState.drawing = { tool: "lasso", points: [point] };
  requestClioPaintRender();
}

function clioPaintEndLasso() {
  const drawing = clioPaintState.drawing;
  clioPaintState.drawing = null;
  if (!drawing || drawing.points.length < 3) {
    requestClioPaintRender();
    return;
  }
  clioPaintSetLassoSelection(drawing.points);
}

function clioPaintSetLassoSelection(points) {
  const doc = clioPaintState.doc;
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  points.forEach((point) => { x0 = Math.min(x0, point.x); x1 = Math.max(x1, point.x); y0 = Math.min(y0, point.y); y1 = Math.max(y1, point.y); });
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(doc.width - 1, x1); y1 = Math.min(doc.height - 1, y1);
  if (x1 < x0 || y1 < y0) return;
  clioPaintState.selection = {
    kind: "lasso",
    x: x0,
    y: y0,
    w: x1 - x0 + 1,
    h: y1 - y0 + 1,
    path: points.map((point) => ({ x: point.x - x0, y: point.y - y0 })),
    lifted: false,
  };
  requestClioPaintRender();
  if (typeof updateMenuState === "function") updateMenuState();
}

/**
 * Dragging from inside a selection moves those pixels instead of starting a
 * new one: the region is lifted off the picture, follows the pointer, and
 * lands when the drag ends. JS Paint's selection is the same kind of object —
 * a floating canvas dragged from inside itself, with its own history entry
 * for the move — and this is the half of it that a sketch pad actually needs,
 * since placing a box in the right spot is most of sketching. With Option
 * held the drag leaves a copy behind.
 */
function clioPaintBeginSelectionDrag(point) {
  if (!clioPaintPointInSelection(point)) return false;
  const duplicate = clioPaintState.duplicateOnDrag === true;
  clioPaintSnapshotPending();
  const selection = clioPaintState.selection;
  if (duplicate && selection.lifted) clioPaintStampSelectionInto(clioPaintState.doc, selection);
  clioPaintLiftSelection({ copy: duplicate });
  clioPaintState.drawing = { tool: "move", start: point, origin: { x: selection.x, y: selection.y }, duplicate };
  return true;
}

function clioPaintDragSelection(point) {
  const drawing = clioPaintState.drawing;
  const selection = clioPaintState.selection;
  if (!drawing || drawing.tool !== "move" || !selection) return;
  selection.x = drawing.origin.x + (point.x - drawing.start.x);
  selection.y = drawing.origin.y + (point.y - drawing.start.y);
  const { statusLabel } = clioPaintElements();
  if (statusLabel) statusLabel.textContent = `${t("clio_paint_op_move")}  ${t("clio_paint_offset", selection.x - drawing.origin.x, selection.y - drawing.origin.y)}`;
  requestClioPaintRender();
}

function clioPaintEndSelectionDrag() {
  const drawing = clioPaintState.drawing;
  if (!drawing || drawing.tool !== "move") return;
  clioPaintState.drawing = null;
  if (drawing.duplicate) clioPaintCommitHistory("clio_paint_op_duplicate");
  else clioPaintCommitHistory(clioPaintToolLabelKey("move"), { coalesce: true });
  showClioPaintInfo();
}

/**
 * The same move one pixel at a time, for placing a box exactly. It shares the
 * move's history row, so a run of arrows is undone in one step.
 */
function clioPaintNudgeSelection(dx, dy) {
  const selection = clioPaintState.selection;
  if (!selection || selection.w <= 0 || selection.h <= 0) return false;
  clioPaintSnapshotPending();
  clioPaintLiftSelection();
  selection.x += dx;
  selection.y += dy;
  clioPaintCommitHistory(clioPaintToolLabelKey("move"), { coalesce: true });
  requestClioPaintRender();
  return true;
}

function clearClioPaintSelection() {
  const selection = clioPaintState.selection;
  if (!selection) return;
  clioPaintSnapshotPending();
  if (!selection.lifted) clioPaintLiftSelection();
  clioPaintState.selection = null;
  clioPaintMarkChanged();
  clioPaintCommitHistory("clio_paint_op_clear");
  if (typeof updateMenuState === "function") updateMenuState();
}

function selectAllClioPaint({ lasso = false } = {}) {
  clioPaintDropSelection();
  const doc = clioPaintState.doc;
  if (lasso) {
    clioPaintSetLassoSelection([{ x: 0, y: 0 }, { x: doc.width, y: 0 }, { x: doc.width, y: doc.height }, { x: 0, y: doc.height }]);
  } else {
    clioPaintState.selection = { kind: "rect", x: 0, y: 0, w: doc.width, h: doc.height, lifted: false };
  }
  const tool = lasso ? "lasso" : "marquee";
  if (clioPaintState.tool !== tool) {
    const selection = clioPaintState.selection;
    setClioPaintTool(tool);
    clioPaintState.selection = selection;
  }
  requestClioPaintRender();
  if (typeof updateMenuState === "function") updateMenuState();
}

// The Edit menu's picture commands. Each works on the selection as it floats,
// so a region can be flipped and then moved, or inverted twice, and each is
// one step Undo takes back.
const CLIO_PAINT_SELECTION_EFFECTS = {
  invert: {
    labelKey: "clio_paint_op_invert",
    apply(selection) {
      for (let k = 0; k < selection.bits.length; k += 1) if (selection.mask[k]) selection.bits[k] ^= 1;
    },
  },
  "flip-horizontal": {
    labelKey: "clio_paint_op_flip_horizontal",
    apply(selection) {
      const { w, h } = selection;
      const bits = new Uint8Array(w * h);
      const mask = new Uint8Array(w * h);
      for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) {
        bits[j * w + (w - 1 - i)] = selection.bits[j * w + i];
        mask[j * w + (w - 1 - i)] = selection.mask[j * w + i];
      }
      Object.assign(selection, { bits, mask, path: selection.path?.map((point) => ({ x: w - point.x, y: point.y })) });
    },
  },
  "flip-vertical": {
    labelKey: "clio_paint_op_flip_vertical",
    apply(selection) {
      const { w, h } = selection;
      const bits = new Uint8Array(w * h);
      const mask = new Uint8Array(w * h);
      for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) {
        bits[(h - 1 - j) * w + i] = selection.bits[j * w + i];
        mask[(h - 1 - j) * w + i] = selection.mask[j * w + i];
      }
      Object.assign(selection, { bits, mask, path: selection.path?.map((point) => ({ x: point.x, y: h - point.y })) });
    },
  },
  // Trace Edges: every shape in the region becomes its own outline, drawn one
  // pixel outside it, so a solid blot turns into a hollow one.
  "trace-edges": {
    labelKey: "clio_paint_op_trace_edges",
    apply(selection) {
      const w = selection.w + 2;
      const h = selection.h + 2;
      const source = new Uint8Array(w * h);
      for (let j = 0; j < selection.h; j += 1) for (let i = 0; i < selection.w; i += 1) {
        const k = j * selection.w + i;
        source[(j + 1) * w + i + 1] = selection.bits[k] & selection.mask[k];
      }
      const bits = new Uint8Array(w * h);
      const mask = new Uint8Array(w * h);
      for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) {
        if (source[j * w + i]) {
          if (selection.kind === "rect") mask[j * w + i] = 1;
          continue;
        }
        let edge = false;
        for (let b = -1; b <= 1 && !edge; b += 1) for (let a = -1; a <= 1; a += 1) {
          const x = i + a;
          const y = j + b;
          if (x >= 0 && y >= 0 && x < w && y < h && source[y * w + x]) { edge = true; break; }
        }
        if (edge) { bits[j * w + i] = 1; mask[j * w + i] = 1; } else if (selection.kind === "rect") mask[j * w + i] = 1;
      }
      Object.assign(selection, {
        x: selection.x - 1,
        y: selection.y - 1,
        w,
        h,
        bits,
        mask,
        path: selection.path?.map((point) => ({ x: point.x + 1, y: point.y + 1 })),
      });
    },
  },
  "fill-selection": {
    labelKey: "clio_paint_op_fill_selection",
    apply(selection) {
      for (let j = 0; j < selection.h; j += 1) for (let i = 0; i < selection.w; i += 1) {
        const k = j * selection.w + i;
        if (selection.kind === "lasso" && clioPaintPointInPolygon(selection.path, i + 0.5, j + 0.5)) selection.mask[k] = 1;
        if (selection.mask[k]) selection.bits[k] = clioPaintPatternAt(selection.x + i, selection.y + j);
      }
    },
  },
};

function applyClioPaintSelectionEffect(name) {
  const effect = CLIO_PAINT_SELECTION_EFFECTS[name];
  if (!effect || !clioPaintState.selection) return false;
  clioPaintSnapshotPending();
  const selection = clioPaintLiftSelection();
  effect.apply(selection);
  clioPaintState.floatStale = true;
  clioPaintMarkChanged();
  clioPaintCommitHistory(effect.labelKey);
  return true;
}

// --- Text ------------------------------------------------------------------

function clioPaintBeginText(point, event) {
  const { viewport } = clioPaintElements();
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const input = document.createElement("input");
  input.type = "text";
  input.className = "clio-paint-text-input";
  input.setAttribute("aria-label", t("clio_paint_tool_text"));
  input.style.setProperty("--clio-paint-text-x", `${viewport.scrollLeft + event.clientX - rect.left}px`);
  input.style.setProperty("--clio-paint-text-y", `${viewport.scrollTop + event.clientY - rect.top - 9}px`);
  viewport.append(input);
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
  input.addEventListener("keydown", (keyEvent) => {
    if (keyEvent.key === "Enter") { keyEvent.preventDefault(); commit(); viewport.focus({ preventScroll: true }); }
    else if (keyEvent.key === "Escape") { keyEvent.preventDefault(); cancel(); viewport.focus({ preventScroll: true }); }
  });
  input.addEventListener("blur", commit, { once: true });
}

function clioPaintCommitTextInput() {
  clioPaintElements().root?.querySelector(".clio-paint-text-input")?.blur();
}

function clioPaintStampText(point, text) {
  if (typeof document === "undefined") return;
  const scratch = document.createElement("canvas");
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const font = `12px Chicago_12, Chicago, "Songti SC", "PingFang SC", sans-serif`;
  ctx.font = font;
  const width = Math.max(1, Math.ceil(ctx.measureText(text).width) + 4);
  const height = 20;
  scratch.width = width;
  scratch.height = height;
  ctx.font = font;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";
  ctx.fillText(text, 2, 3);
  const ink = clioPaintThreshold(ctx.getImageData(0, 0, width, height));
  clioPaintSnapshotPending();
  for (let j = 0; j < height; j += 1) for (let i = 0; i < width; i += 1) {
    if (ink[j * width + i]) clioPaintPut(point.x - 2 + i, point.y - 3 + j, 1);
  }
  clioPaintMarkChanged();
  clioPaintCommitHistory(clioPaintToolLabelKey("text"));
}

// --- View: magnification, scrolling, rendering ------------------------------
//
// The picture is drawn into a canvas the size of the visible area, which
// stays pinned while the viewport scrolls a sizer as large as the page at the
// current magnification. The window's own System 6 scroll bars scroll that
// viewport like any other document, and the page sits on the desk with its
// edge and shadow, centred when it is smaller than the window.

function clioPaintPageSize() {
  const doc = clioPaintState.doc;
  return { width: Math.round(doc.width * clioPaintState.zoom), height: Math.round(doc.height * clioPaintState.zoom) };
}

function clioPaintPageOrigin() {
  const { viewport } = clioPaintElements();
  const clientWidth = viewport?.clientWidth || 0;
  const clientHeight = viewport?.clientHeight || 0;
  const page = clioPaintPageSize();
  return {
    x: Math.round(Math.max(CLIO_PAINT_DESK_MARGIN, (clientWidth - page.width) / 2)) - (viewport?.scrollLeft || 0),
    y: Math.round(Math.max(CLIO_PAINT_DESK_MARGIN, (clientHeight - page.height) / 2)) - (viewport?.scrollTop || 0),
  };
}

function clioPaintSyncContentSize() {
  const { viewport, sizer } = clioPaintElements();
  if (!viewport || !sizer) return;
  const page = clioPaintPageSize();
  sizer.style.setProperty("--clio-paint-content-w", `${page.width + CLIO_PAINT_DESK_MARGIN * 2}px`);
  sizer.style.setProperty("--clio-paint-content-h", `${page.height + CLIO_PAINT_DESK_MARGIN * 2}px`);
}

function clioPaintEventPoint(event) {
  const { view } = clioPaintElements();
  const rect = view?.getBoundingClientRect?.() || { left: 0, top: 0 };
  const origin = clioPaintPageOrigin();
  const zoom = clioPaintState.zoom;
  return {
    x: Math.floor((event.clientX - rect.left - origin.x) / zoom),
    y: Math.floor((event.clientY - rect.top - origin.y) / zoom),
  };
}

function clioPaintPointOnPage(point) {
  const doc = clioPaintState.doc;
  return !!point && point.x >= 0 && point.y >= 0 && point.x < doc.width && point.y < doc.height;
}

function clioPaintSnapPoint(point) {
  if (!clioPaintState.grid) return point;
  return { x: Math.round(point.x / CLIO_PAINT_GRID) * CLIO_PAINT_GRID, y: Math.round(point.y / CLIO_PAINT_GRID) * CLIO_PAINT_GRID };
}

/**
 * Change magnification keeping the pixel under `anchor` (a client point, or the
 * centre of the view) where it is on the screen.
 */
function setClioPaintZoom(zoom, anchor = null, docPoint = null) {
  if (!CLIO_PAINT_ZOOMS.includes(zoom)) return;
  const { viewport, view, zoom: zoomSelect } = clioPaintElements();
  const rect = view?.getBoundingClientRect?.() || { left: 0, top: 0 };
  const clientWidth = viewport?.clientWidth || 0;
  const clientHeight = viewport?.clientHeight || 0;
  const ax = anchor ? anchor.x - rect.left : clientWidth / 2;
  const ay = anchor ? anchor.y - rect.top : clientHeight / 2;
  const origin = clioPaintPageOrigin();
  const target = docPoint || { x: (ax - origin.x) / clioPaintState.zoom, y: (ay - origin.y) / clioPaintState.zoom };
  clioPaintState.zoom = zoom;
  clioPaintSyncContentSize();
  if (viewport) {
    viewport.scrollLeft = Math.max(0, CLIO_PAINT_DESK_MARGIN + target.x * zoom - ax);
    viewport.scrollTop = Math.max(0, CLIO_PAINT_DESK_MARGIN + target.y * zoom - ay);
  }
  if (zoomSelect && Number(zoomSelect.value) !== zoom) {
    zoomSelect.value = String(zoom);
    zoomSelect.dispatchEvent(new Event("system-select-sync"));
  }
  syncClioPaintCursor();
  requestClioPaintRender();
  if (typeof updateMenuState === "function") updateMenuState();
}

function stepClioPaintZoom(direction, anchor) {
  const index = CLIO_PAINT_ZOOMS.indexOf(clioPaintState.zoom);
  const next = CLIO_PAINT_ZOOMS[Math.max(0, Math.min(CLIO_PAINT_ZOOMS.length - 1, index + direction))];
  setClioPaintZoom(next, anchor);
}

/** FatBits: eight to one around the last place the writer drew, and back. */
function toggleClioPaintFatBits() {
  if (clioPaintState.zoom >= 4) {
    setClioPaintZoom(1, null, clioPaintState.last);
    clioPaintFlash(t("clio_paint_fatbits_off"));
    return;
  }
  const doc = clioPaintState.doc;
  const focus = clioPaintState.last || { x: doc.width / 2, y: doc.height / 2 };
  setClioPaintZoom(CLIO_PAINT_FATBITS_ZOOM, null, { x: focus.x + 0.5, y: focus.y + 0.5 });
  clioPaintFlash(t("clio_paint_fatbits_on"));
}

/** Show Page: the largest magnification at which the whole page fits. */
function showClioPaintPage() {
  const { viewport } = clioPaintElements();
  const doc = clioPaintState.doc;
  const fit = Math.min(
    ((viewport?.clientWidth || 0) - CLIO_PAINT_DESK_MARGIN * 2) / doc.width,
    ((viewport?.clientHeight || 0) - CLIO_PAINT_DESK_MARGIN * 2) / doc.height,
  );
  const zoom = CLIO_PAINT_ZOOMS.filter((candidate) => candidate <= fit).pop() || CLIO_PAINT_ZOOMS[0];
  setClioPaintZoom(zoom);
  if (viewport) { viewport.scrollLeft = 0; viewport.scrollTop = 0; }
  requestClioPaintRender();
}

let clioPaintRenderFrame = 0;

function requestClioPaintRender() {
  if (clioPaintRenderFrame) return;
  const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (callback) => setTimeout(callback, 16);
  clioPaintRenderFrame = schedule(() => {
    clioPaintRenderFrame = 0;
    renderClioPaintView();
  }) || 0;
}

function clioPaintRefreshDocumentCanvas() {
  const { canvas } = clioPaintElements();
  const ctx = canvas?.getContext?.("2d");
  const doc = clioPaintState.doc;
  if (!canvas || !ctx || !doc) return false;
  if (canvas.width !== doc.width) canvas.width = doc.width;
  if (canvas.height !== doc.height) canvas.height = doc.height;
  const imageData = ctx.createImageData(doc.width, doc.height);
  clioPaintApplyPackedBits(imageData, doc.bits);
  ctx.putImageData(imageData, 0, 0);
  clioPaintState.docStale = false;
  return true;
}

let clioPaintFloatCanvas = null;

function clioPaintRefreshFloatCanvas() {
  const selection = clioPaintState.selection;
  if (!selection?.lifted || typeof document === "undefined") return null;
  if (!clioPaintFloatCanvas) clioPaintFloatCanvas = document.createElement("canvas");
  clioPaintFloatCanvas.width = selection.w;
  clioPaintFloatCanvas.height = selection.h;
  const ctx = clioPaintFloatCanvas.getContext("2d");
  if (!ctx) return null;
  const imageData = ctx.createImageData(selection.w, selection.h);
  const data = imageData.data;
  for (let k = 0; k < selection.bits.length; k += 1) {
    if (!selection.mask[k]) continue;
    const value = selection.bits[k] ? 0 : 255;
    data[k * 4] = data[k * 4 + 1] = data[k * 4 + 2] = value;
    data[k * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  clioPaintState.floatStale = false;
  return clioPaintFloatCanvas;
}

function renderClioPaintView() {
  const { viewport, view, canvas, root } = clioPaintElements();
  if (!viewport || !view || !canvas || root?.classList.contains("is-hidden")) return;
  const ctx = view.getContext?.("2d");
  if (!ctx) return;
  if (clioPaintState.docStale) clioPaintRefreshDocumentCanvas();
  const float = clioPaintState.selection?.lifted
    ? (clioPaintState.floatStale ? clioPaintRefreshFloatCanvas() : clioPaintFloatCanvas)
    : null;
  const width = viewport.clientWidth || 0;
  const height = viewport.clientHeight || 0;
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  if (view.width !== width * dpr || view.height !== height * dpr) {
    view.width = width * dpr;
    view.height = height * dpr;
    view.style.setProperty("--clio-paint-view-w", `${width}px`);
    view.style.setProperty("--clio-paint-view-h", `${height}px`);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const zoom = clioPaintState.zoom;
  // Magnified, every bit stays a hard square. Reduced, dropping three pixels
  // in four turns a pattern into stripes that are not in the picture, so the
  // overview averages instead — the view only; the picture stays 1-bit.
  ctx.imageSmoothingEnabled = zoom < 1;
  const origin = clioPaintPageOrigin();
  const page = clioPaintPageSize();
  // The page: an edge and a two-pixel shadow, then the picture itself.
  ctx.fillStyle = "#000";
  ctx.fillRect(origin.x + 1, origin.y + 1, page.width + 2, page.height + 2);
  ctx.fillRect(origin.x - 1, origin.y - 1, page.width + 2, page.height + 2);
  ctx.drawImage(canvas, origin.x, origin.y, page.width, page.height);
  const selection = clioPaintState.selection;
  if (float && selection) ctx.drawImage(float, origin.x + selection.x * zoom, origin.y + selection.y * zoom, selection.w * zoom, selection.h * zoom);
  ctx.imageSmoothingEnabled = false;
  if (zoom >= 4) clioPaintDrawFatBitsGrid(ctx, origin, page, width, height);
  if (selection) clioPaintDrawAnts(ctx, origin, zoom, selection);
  const drawing = clioPaintState.drawing;
  if (drawing?.tool === "marquee") {
    const x0 = Math.min(drawing.start.x, drawing.current.x);
    const y0 = Math.min(drawing.start.y, drawing.current.y);
    clioPaintDrawAnts(ctx, origin, zoom, {
      kind: "rect",
      x: x0,
      y: y0,
      w: Math.abs(drawing.current.x - drawing.start.x) + 1,
      h: Math.abs(drawing.current.y - drawing.start.y) + 1,
    });
  }
  if (drawing?.tool === "lasso") clioPaintDrawPath(ctx, origin, zoom, drawing.points, false);
  if (clioPaintState.polygon && clioPaintState.hover) {
    const last = clioPaintState.polygon.points[clioPaintState.polygon.points.length - 1];
    clioPaintDrawPath(ctx, origin, zoom, [last, clioPaintState.hover], false);
  }
  clioPaintDrawFootprint(ctx, origin, zoom);
  if (zoom >= 4) clioPaintDrawInset(ctx, origin, zoom, width, height);
}

function clioPaintDrawFatBitsGrid(ctx, origin, page, width, height) {
  // FatBits: a one-pixel gutter between fat pixels, so each one can be aimed at.
  const zoom = clioPaintState.zoom;
  const x0 = Math.max(origin.x, 0);
  const y0 = Math.max(origin.y, 0);
  const x1 = Math.min(origin.x + page.width, width);
  const y1 = Math.min(origin.y + page.height, height);
  ctx.fillStyle = "#fff";
  const firstColumn = origin.x + zoom - 1 + Math.max(0, Math.floor((x0 - origin.x) / zoom)) * zoom;
  for (let x = firstColumn; x < x1; x += zoom) ctx.fillRect(x, y0, 1, y1 - y0);
  const firstRow = origin.y + zoom - 1 + Math.max(0, Math.floor((y0 - origin.y) / zoom)) * zoom;
  for (let y = firstRow; y < y1; y += zoom) ctx.fillRect(x0, y, x1 - x0, 1);
}

function clioPaintDrawPath(ctx, origin, zoom, points, closed) {
  if (!points.length) return;
  ctx.save();
  ctx.lineWidth = 1;
  const trace = () => {
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = Math.round(origin.x + (point.x + 0.5) * zoom) + 0.5;
      const y = Math.round(origin.y + (point.y + 0.5) * zoom) + 0.5;
      if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    if (closed) ctx.closePath();
  };
  trace();
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  trace();
  ctx.strokeStyle = "#000";
  ctx.setLineDash([2, 2]);
  ctx.stroke();
  ctx.restore();
}

/**
 * Marching ants: black dashes over white, stepping one pixel at a time rather
 * than flowing, the way the marquee has always moved. With reduced motion they
 * stand still.
 */
function clioPaintDrawAnts(ctx, origin, zoom, region) {
  ctx.save();
  ctx.lineWidth = 1;
  const trace = () => {
    ctx.beginPath();
    if (region.kind === "lasso" && region.path) {
      region.path.forEach((point, index) => {
        const x = Math.round(origin.x + (region.x + point.x) * zoom) + 0.5;
        const y = Math.round(origin.y + (region.y + point.y) * zoom) + 0.5;
        if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.closePath();
    } else {
      ctx.rect(Math.round(origin.x + region.x * zoom) + 0.5, Math.round(origin.y + region.y * zoom) + 0.5, Math.max(1, Math.round(region.w * zoom) - 1), Math.max(1, Math.round(region.h * zoom) - 1));
    }
  };
  trace();
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  trace();
  ctx.strokeStyle = "#000";
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -clioPaintState.ants;
  ctx.stroke();
  ctx.restore();
}

/** Brush and eraser show the pixels they will touch, at the current size. */
function clioPaintDrawFootprint(ctx, origin, zoom) {
  const hover = clioPaintState.hover;
  if (!hover || clioPaintState.gesture) return;
  if (clioPaintState.tool === "eraser") {
    const size = clioPaintEraserSize();
    const half = Math.floor(size / 2);
    const x = Math.round(origin.x + (hover.x - half) * zoom);
    const y = Math.round(origin.y + (hover.y - half) * zoom);
    const side = Math.round(size * zoom);
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, side, side);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + 1, y + 1, side - 2, side - 2);
  } else if (clioPaintState.tool === "brush") {
    const brush = CLIO_PAINT_BRUSHES[clioPaintState.brush];
    const bx = hover.x - Math.floor(brush.width / 2);
    const by = hover.y - Math.floor(brush.height / 2);
    const cell = Math.max(1, Math.round(zoom));
    ctx.fillStyle = "#000";
    for (let j = 0; j < brush.height; j += 1) for (let i = 0; i < brush.width; i += 1) {
      if (brush.bits[j * brush.width + i]) ctx.fillRect(Math.round(origin.x + (bx + i) * zoom), Math.round(origin.y + (by + j) * zoom), cell, cell);
    }
  }
}

/** FatBits' small actual-size window, top left, showing the part being edited. */
function clioPaintDrawInset(ctx, origin, zoom, width, height) {
  const { canvas } = clioPaintElements();
  const doc = clioPaintState.doc;
  const w = Math.max(24, Math.floor(width / zoom));
  const h = Math.max(16, Math.floor(height / zoom));
  const sx = Math.floor(-origin.x / zoom);
  const sy = Math.floor(-origin.y / zoom);
  const x = 8;
  const y = 8;
  ctx.fillStyle = "#000";
  ctx.fillRect(x - 1, y - 1, w + 3, h + 3);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, w, h);
  const cx = Math.max(0, sx);
  const cy = Math.max(0, sy);
  const cw = Math.min(doc.width - cx, w - (cx - sx));
  const ch = Math.min(doc.height - cy, h - (cy - sy));
  if (cw > 0 && ch > 0) ctx.drawImage(canvas, cx, cy, cw, ch, x + (cx - sx), y + (cy - sy), cw, ch);
}

// --- Cursors ----------------------------------------------------------------

const CLIO_PAINT_SPRAY_CURSOR = clioPaintBitmapFromRows([
  "................", "................", "......#..#......", "...#........#...", ".....#..#.......", "..#..........#..", "....#.....#.....", ".......#........",
  "..#.....#....#..", "......#.........", "...#.......#....", ".....#..#.......", "........#..#....", "................", "................", "................",
]);

let clioPaintCursorCache = null;

function clioPaintCursors() {
  if (clioPaintCursorCache) return clioPaintCursorCache;
  const supportsImageSet = typeof CSS !== "undefined" && typeof CSS.supports === "function"
    && CSS.supports("cursor", "image-set(url(\"data:,\") 1x) 1 1, auto");
  const make = (bitmap, hx, hy, fallback) => {
    const one = clioPaintCursorDataUrl(bitmap, 1);
    if (!one) return fallback;
    return supportsImageSet
      ? `image-set(url("${one}") 1x, url("${clioPaintCursorDataUrl(bitmap, 2)}") 2x) ${hx} ${hy}, ${fallback}`
      : `url("${one}") ${hx} ${hy}, ${fallback}`;
  };
  clioPaintCursorCache = {
    pencil: make(CLIO_PAINT_GLYPHS.pencil, 1, 13, "crosshair"),
    fill: make(CLIO_PAINT_GLYPHS.fill, 14, 14, "crosshair"),
    spray: make(CLIO_PAINT_SPRAY_CURSOR, 8, 7, "crosshair"),
    lasso: make(CLIO_PAINT_GLYPHS.lasso, 10, 15, "crosshair"),
    hand: make(CLIO_PAINT_GLYPHS.hand, 8, 8, "grab"),
  };
  return clioPaintCursorCache;
}

function syncClioPaintCursor() {
  const { viewport } = clioPaintElements();
  if (!viewport) return;
  const cursor = clioPaintCursors()[clioPaintState.tool];
  if (cursor) viewport.style.setProperty("--clio-paint-cursor", cursor);
  else viewport.style.removeProperty("--clio-paint-cursor");
}

// --- Status line --------------------------------------------------------------

let clioPaintFlashUntil = 0;

/** Tool and pointer position, the reading a MacPaint 2.0 coordinates window gave. */
function showClioPaintInfo(point = null) {
  const { statusLabel } = clioPaintElements();
  if (!statusLabel || Date.now() < clioPaintFlashUntil) return;
  const label = t(clioPaintToolLabelKey(clioPaintState.tool));
  const doc = clioPaintState.doc;
  statusLabel.textContent = clioPaintPointOnPage(point)
    ? `${label}  ${t("clio_paint_coords", point.x, point.y)}`
    : `${label}  ${t("clio_paint_size", String(doc.width), String(doc.height))}`;
}

/** A short answer in the window's own status line, held for a moment. */
function clioPaintFlash(message) {
  const { statusLabel } = clioPaintElements();
  if (!statusLabel) return;
  statusLabel.textContent = message;
  clioPaintFlashUntil = Date.now() + 2400;
}

// --- Pointer ------------------------------------------------------------------

function clioPaintWindowIsInFront() {
  const win = document.querySelector('[data-window="clioPaint"]');
  return !!win && !win.classList.contains("is-hidden") && win.classList.contains("is-active");
}

function handleClioPaintPointerDown(event) {
  const { viewport } = clioPaintElements();
  if (!viewport) return;
  if (event.pointerType === "mouse" && event.button !== undefined && event.button !== 0) return;
  closeClioPaintPopover();
  clioPaintState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (clioPaintState.pointers.size === 2) {
    clioPaintBeginGesture();
    return;
  }
  if (clioPaintState.pointers.size > 2) return;
  // preventDefault below blocks the browser's default focus-change action,
  // which is also what blurs (and so commits) an open text-tool input. Ask
  // it to commit itself first, synchronously, so a second click on the
  // picture cannot leave a typed label stranded.
  clioPaintCommitTextInput();
  event.preventDefault();
  // Capture can be refused — a pointer already gone by the time the handler
  // runs — and a refusal must not cost the press itself.
  try {
    viewport.setPointerCapture?.(event.pointerId);
  } catch {}
  // Focus follows the click: undo, Delete and the arrow keys belong to the
  // document the writer just put the pointer on.
  viewport.focus?.({ preventScroll: true });
  const point = clioPaintEventPoint(event);
  const snapped = clioPaintSnapPoint(point);
  const tool = clioPaintState.tool;
  if (clioPaintPointOnPage(point)) clioPaintState.last = point;
  clioPaintState.duplicateOnDrag = event.altKey === true;
  if (tool === "hand") {
    clioPaintState.drawing = { tool: "pan", scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop, clientX: event.clientX, clientY: event.clientY };
    viewport.dataset.clioPaintGrabbing = "true";
    return;
  }
  if (tool === "marquee" || tool === "lasso") {
    // Pressing inside the selection moves those pixels; pressing anywhere else
    // starts a new one. Its own branch, and it returns: a move that began is
    // not a press any later branch may also answer.
    if (tool === "marquee" && !clioPaintBeginSelectionDrag(point)) clioPaintBeginMarquee(point, event.shiftKey);
    else if (tool === "lasso" && !clioPaintBeginSelectionDrag(point)) clioPaintBeginLasso(point);
    return;
  }
  if (tool === "pencil" || tool === "eraser" || tool === "brush") clioPaintBeginStroke(tool, point);
  else if (tool === "spray") clioPaintBeginSpray(point);
  else if (tool === "fill") {
    // A mouse fills on the press; a finger waits for the lift, so a second
    // finger arriving for a pinch can still call the whole touch off.
    if (event.pointerType === "mouse") clioPaintFloodFill(point);
    else clioPaintState.drawing = { tool: "fill", at: point };
  } else if (tool === "text") clioPaintBeginText(point, event);
  else if (tool === "poly" || tool === "poly-filled") clioPaintPolygonClick(tool, snapped);
  else if (tool === "free" || tool === "free-filled") clioPaintBeginFreehand(tool, point);
  else if (/^(line|rect|rrect|oval)(-filled)?$/.test(tool)) clioPaintBeginShape(tool, snapped);
}

function handleClioPaintPointerMove(event) {
  const { viewport } = clioPaintElements();
  if (!viewport) return;
  if (clioPaintState.pointers.has(event.pointerId)) clioPaintState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (clioPaintState.gesture) {
    clioPaintMoveGesture();
    return;
  }
  const point = clioPaintEventPoint(event);
  clioPaintState.hover = point;
  const drawing = clioPaintState.drawing;
  if (!drawing) {
    // Report what the pointer is over, for the CSS that turns it into a
    // move cursor (96-clio-paint.css).
    viewport.dataset.clioPaintSelection = ["marquee", "lasso"].includes(clioPaintState.tool) && clioPaintPointInSelection(point) ? "inside" : "";
    showClioPaintInfo(point);
    requestClioPaintRender();
    return;
  }
  if (clioPaintPointOnPage(point)) clioPaintState.last = point;
  const tool = drawing.tool;
  if (tool === "pan") {
    viewport.scrollLeft = drawing.scrollLeft - (event.clientX - drawing.clientX);
    viewport.scrollTop = drawing.scrollTop - (event.clientY - drawing.clientY);
  } else if (tool === "pencil" || tool === "eraser" || tool === "brush") {
    clioPaintStrokeSegment(drawing.last, point);
    showClioPaintInfo(point);
  } else if (tool === "spray") {
    drawing.at = point;
    clioPaintSprayAt(point);
    showClioPaintInfo(point);
  } else if (tool === "move") {
    clioPaintDragSelection(point);
  } else if (tool === "marquee") {
    clioPaintUpdateMarquee(clioPaintSnapPoint(point), event.shiftKey);
  } else if (tool === "lasso") {
    const last = drawing.points[drawing.points.length - 1];
    if (last.x !== point.x || last.y !== point.y) drawing.points.push(point);
    requestClioPaintRender();
  } else if (tool === "free" || tool === "free-filled") {
    clioPaintExtendFreehand(point);
  } else if (drawing.kind) {
    clioPaintPreviewShape(clioPaintSnapPoint(point), event.shiftKey);
  }
}

function handleClioPaintPointerUp(event) {
  const { viewport } = clioPaintElements();
  clioPaintState.pointers.delete(event.pointerId);
  if (clioPaintState.gesture) {
    if (clioPaintState.pointers.size === 0) clioPaintState.gesture = null;
    return;
  }
  try {
    if (viewport?.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  } catch {}
  const drawing = clioPaintState.drawing;
  if (!drawing) return;
  const tool = drawing.tool;
  if (tool === "pan") {
    clioPaintState.drawing = null;
    if (viewport) viewport.dataset.clioPaintGrabbing = "";
  } else if (tool === "move") clioPaintEndSelectionDrag();
  else if (tool === "marquee") clioPaintEndMarquee();
  else if (tool === "lasso") clioPaintEndLasso();
  else if (tool === "fill") {
    clioPaintState.drawing = null;
    clioPaintFloodFill(drawing.at);
  } else if (tool === "spray") {
    clioPaintStopSpray();
    clioPaintEndStroke();
  } else if (tool === "pencil" || tool === "eraser" || tool === "brush") clioPaintEndStroke();
  else if (tool === "free" || tool === "free-filled") clioPaintEndFreehand();
  else if (drawing.kind) clioPaintEndShape();
  requestClioPaintRender();
}

// Two fingers pan and pinch. The second finger arriving means the first one was
// never drawing: its stroke is put back, so a pinch leaves no stray line.
function clioPaintBeginGesture() {
  const drawing = clioPaintState.drawing;
  clioPaintStopSpray();
  if (drawing && !["pan", "move", "fill", "marquee", "lasso"].includes(drawing.tool)) {
    clioPaintRestorePending();
    clioPaintState.history.pending = null;
  }
  clioPaintState.drawing = null;
  const [a, b] = [...clioPaintState.pointers.values()];
  clioPaintState.gesture = { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  requestClioPaintRender();
}

function clioPaintMoveGesture() {
  const { viewport } = clioPaintElements();
  const [a, b] = [...clioPaintState.pointers.values()];
  const gesture = clioPaintState.gesture;
  if (!a || !b || !gesture || !viewport) return;
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  viewport.scrollLeft -= x - gesture.x;
  viewport.scrollTop -= y - gesture.y;
  gesture.x = x;
  gesture.y = y;
  // Magnification comes in steps, so a pinch moves one step at a time.
  if (distance / gesture.distance > 1.45) { stepClioPaintZoom(1, { x, y }); gesture.distance = distance; }
  else if (distance / gesture.distance < 0.69) { stepClioPaintZoom(-1, { x, y }); gesture.distance = distance; }
}

function wireClioPaintViewport() {
  const { viewport } = clioPaintElements();
  if (!viewport || viewport.dataset.clioPaintWired === "true") return;
  viewport.dataset.clioPaintWired = "true";
  const resources = clioPaintInstanceResources();
  resources.listen(viewport, "pointerdown", handleClioPaintPointerDown);
  resources.listen(viewport, "pointermove", handleClioPaintPointerMove);
  resources.listen(viewport, "pointerup", handleClioPaintPointerUp);
  resources.listen(viewport, "pointercancel", handleClioPaintPointerUp);
  resources.listen(viewport, "pointerleave", () => {
    if (clioPaintState.drawing) return;
    clioPaintState.hover = null;
    showClioPaintInfo();
    requestClioPaintRender();
  });
  resources.listen(viewport, "dblclick", () => { if (clioPaintState.polygon) finishClioPaintPolygon(); });
  resources.listen(viewport, "scroll", requestClioPaintRender, { passive: true });
  resources.listen(viewport, "wheel", (event) => {
    if (!event.ctrlKey) return;
    // A trackpad pinch arrives as a wheel with Control held.
    event.preventDefault();
    stepClioPaintZoom(event.deltaY < 0 ? 1 : -1, { x: event.clientX, y: event.clientY });
  }, { passive: false });
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      clioPaintSyncContentSize();
      requestClioPaintRender();
    });
    observer.observe(viewport);
    resources.add(() => observer.disconnect(), "resize-observer");
  }
  const ants = setInterval(() => {
    if (!clioPaintState.selection || clioPaintReducedMotion()) return;
    clioPaintState.ants = (clioPaintState.ants + 1) % 8;
    requestClioPaintRender();
  }, 120);
  resources.add(() => clearInterval(ants), "ants");
}

function clioPaintReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches === true;
}

// --- Keyboard -----------------------------------------------------------------

const CLIO_PAINT_NUDGE_KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function handleClioPaintKeydown(event) {
  // An event somebody nearer the writer has already answered — a menu being
  // walked with the arrow keys, a dialog taking Escape — is not this window's
  // to act on. Delete, Escape and the arrow keys all reach the document even
  // while a menu or a dialog is up.
  if (event.defaultPrevented) return;
  if (!clioPaintWindowIsInFront()) return;
  if (typeof getActiveEditableElement === "function" && getActiveEditableElement()) return;
  if (document.body.classList.contains("has-system-modal")) return;
  // Escape is "put it back": first the operation still under the pointer, then
  // an open popover, then the selection itself.
  if (event.key === "Escape") {
    if (cancelClioPaintOperation()) event.preventDefault();
    else if (closeClioPaintPopover()) event.preventDefault();
    else if (clioPaintState.selection) {
      clioPaintDropSelection();
      event.preventDefault();
    }
    return;
  }
  if (event.key === "Enter" && clioPaintState.polygon) {
    event.preventDefault();
    finishClioPaintPolygon();
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && clioPaintState.selection) {
    event.preventDefault();
    clearClioPaintSelection();
    return;
  }
  const nudge = CLIO_PAINT_NUDGE_KEYS[event.key];
  if (nudge && clioPaintState.selection && !event.metaKey && !event.ctrlKey) {
    const step = event.shiftKey ? 8 : 1;
    if (clioPaintNudgeSelection(nudge[0] * step, nudge[1] * step)) event.preventDefault();
  }
}

/**
 * ⌘Z / ⇧⌘Z / ⌘Y (and the Ctrl spellings) for the picture itself.
 *
 * The desk's own undo is about the focused text field, so over a painting it
 * answered "there is nothing to edit here" and undid nothing. A paint document
 * has to own the key while its window is the one in front — the same rule this
 * window already follows for Delete and Escape, which it reads wherever the
 * focus happens to be.
 *
 * The listener is registered in the CAPTURE phase for a reason that is easy to
 * lose: the desk's shortcut dispatcher is a bubble-phase listener on this same
 * document, so a bubble-phase listener here would run second, after the desk
 * had already answered. Capture runs first, and claiming the event
 * (preventDefault) is what stops the desk from also answering it — runShortcut
 * returns early on a prevented event. Registering on the window element
 * instead would only hear keys that land inside the window, which is not true
 * at the moment the window opens. (ClioChart claims the same key from its own
 * grid, which is focused whenever it is being used: the same rule, reached
 * from the other side.)
 */
function handleClioPaintHistoryKeydown(event) {
  if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey) return;
  const key = String(event.key).toLowerCase();
  if (key !== "z" && key !== "y") return;
  if (!clioPaintWindowIsInFront()) return;
  // A field being typed in keeps its own undo, and so does a dialog the writer
  // has to answer before anything behind it moves.
  if (typeof getActiveEditableElement === "function" && getActiveEditableElement()) return;
  if (document.body.classList.contains("has-system-modal")) return;
  const redo = event.shiftKey || key === "y";
  event.preventDefault();
  if (!(redo ? redoClioPaint() : undoClioPaint())) {
    setStatus(t(redo ? "clio_paint_nothing_to_redo" : "clio_paint_nothing_to_undo"));
  }
}

/** ⌘S and ⌘A mean the picture while it is in front, claimed the same way. */
function handleClioPaintCommandKeydown(event) {
  if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
  const key = String(event.key).toLowerCase();
  if (key !== "s" && key !== "a") return;
  if (!clioPaintWindowIsInFront()) return;
  if (typeof getActiveEditableElement === "function" && getActiveEditableElement()) return;
  if (document.body.classList.contains("has-system-modal")) return;
  event.preventDefault();
  if (key === "s") saveClioPaintPicture();
  else selectAllClioPaint();
}

// --- Popovers ---------------------------------------------------------------
//
// One small panel inside the window for the few choices that need more room
// than a menu row: the Read Sketch commands, the brush shapes, the pattern
// editor, and — on a phone, where the pattern bar and the width box are not
// shown — the patterns in MacPaint 2.0's torn-off 5x8 arrangement and the
// widths. It wears the menu tokens, so every appearance dresses it the way it
// dresses its menus.

let clioPaintPopoverAnchor = null;

function openClioPaintPopover(anchor, build, { align = "start" } = {}) {
  const { popover, pane } = clioPaintElements();
  if (!popover || !pane || !anchor) return;
  if (clioPaintPopoverAnchor === anchor && !popover.hidden) {
    closeClioPaintPopover();
    return;
  }
  closeClioPaintPopover();
  popover.replaceChildren();
  popover.className = "clio-paint-popover";
  build(popover);
  popover.hidden = false;
  clioPaintPopoverAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");
  const paneRect = pane.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const below = anchorRect.bottom - paneRect.top + 2;
  const above = anchorRect.top - paneRect.top - popRect.height - 2;
  // Measured against the pane's inside, not its box: the pane's right and
  // bottom borders are the reserve under the window's scroll bar lanes, and a
  // panel reaching into them would be drawn under the bars.
  const innerWidth = pane.clientWidth || paneRect.width;
  const innerHeight = pane.clientHeight || paneRect.height;
  const top = below + popRect.height <= innerHeight || above < 0 ? below : above;
  const leftEdge = align === "end" ? anchorRect.right - paneRect.left - popRect.width : anchorRect.left - paneRect.left;
  const left = Math.max(2, Math.min(leftEdge, innerWidth - popRect.width - 2));
  popover.style.setProperty("--clio-paint-pop-x", `${Math.round(left)}px`);
  popover.style.setProperty("--clio-paint-pop-y", `${Math.round(top)}px`);
  popover.querySelector("button:not([disabled])")?.focus({ preventScroll: true });
}

function closeClioPaintPopover() {
  const { popover } = clioPaintElements();
  if (!popover || popover.hidden) return false;
  popover.hidden = true;
  popover.replaceChildren();
  clioPaintPopoverAnchor?.setAttribute("aria-expanded", "false");
  clioPaintPopoverAnchor = null;
  return true;
}

function clioPaintPopoverButton(labelText, onChoose, { role = "menuitem" } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "clio-paint-popover-item";
  button.setAttribute("role", role);
  button.textContent = labelText;
  button.addEventListener("click", () => {
    closeClioPaintPopover();
    onChoose();
  });
  return button;
}

function openClioPaintReadMenu() {
  const { read } = clioPaintElements();
  openClioPaintPopover(read, (popover) => {
    popover.setAttribute("role", "menu");
    popover.append(
      clioPaintPopoverButton(t("clio_paint_sketch_to_outline"), runClioPaintSketchToOutline),
      clioPaintPopoverButton(t("clio_paint_sketch_to_prompt"), runClioPaintSketchToImagePrompt),
    );
  }, { align: "end" });
}

function openClioPaintBrushShapes() {
  const { toolbar } = clioPaintElements();
  const anchor = toolbar?.querySelector('[data-clio-paint-tool="brush"]');
  openClioPaintPopover(anchor, (popover) => {
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", t("clio_paint_brush_shape"));
    const grid = document.createElement("div");
    grid.className = "clio-paint-brush-grid";
    CLIO_PAINT_BRUSHES.forEach((brush, index) => {
      const cell = clioPaintBitmap(16, 16);
      const ox = Math.floor((16 - brush.width) / 2);
      const oy = Math.floor((16 - brush.height) / 2);
      for (let y = 0; y < brush.height; y += 1) for (let x = 0; x < brush.width; x += 1) {
        if (brush.bits[y * brush.width + x]) cell.bits[(oy + y) * 16 + ox + x] = 1;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clio-paint-brush-choice";
      button.setAttribute("aria-pressed", String(index === clioPaintState.brush));
      button.setAttribute("aria-label", t("clio_paint_brush", index + 1));
      const glyph = document.createElement("span");
      glyph.className = "clio-paint-glyph";
      glyph.style.setProperty("--clio-paint-glyph", `url(${clioPaintBitmapDataUrl(cell, { scale: 6, transparent: true })})`);
      button.append(glyph);
      button.addEventListener("click", () => {
        clioPaintState.brush = index;
        closeClioPaintPopover();
        if (clioPaintState.tool !== "brush") setClioPaintTool("brush");
        clioPaintFlash(t("clio_paint_brush", index + 1));
      });
      grid.append(button);
    });
    popover.append(grid);
  });
}

/** Edit Pattern: the chosen pattern as eight-by-eight fat bits, and a preview. */
function openClioPaintPatternEditor(index = clioPaintState.pattern) {
  const { current, touchSwatch } = clioPaintElements();
  const anchor = current?.offsetParent ? current : touchSwatch;
  const rows = [...(clioPaintState.patterns[index] || [])];
  if (rows.length !== 8) return;
  openClioPaintPopover(anchor, (popover) => {
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", t("clio_paint_edit_pattern"));
    const editor = document.createElement("div");
    editor.className = "clio-paint-pattern-editor";
    const grid = document.createElement("div");
    grid.className = "clio-paint-pattern-cells";
    const preview = document.createElement("span");
    preview.className = "clio-paint-pattern-preview";
    const bitAt = (x, y) => (rows[y] >> (7 - x)) & 1;
    const sync = () => {
      grid.querySelectorAll("button").forEach((cell) => {
        cell.setAttribute("aria-pressed", String(bitAt(Number(cell.dataset.x), Number(cell.dataset.y)) === 1));
      });
      const bitmap = clioPaintBitmap(8, 8);
      for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) bitmap.bits[y * 8 + x] = bitAt(x, y);
      preview.style.setProperty("--clio-paint-pattern", `url(${clioPaintBitmapDataUrl(bitmap)})`);
    };
    let paintValue = null;
    const put = (cell) => {
      const x = Number(cell.dataset.x);
      const y = Number(cell.dataset.y);
      if (paintValue) rows[y] |= 128 >> x;
      else rows[y] &= ~(128 >> x);
      sync();
    };
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "clio-paint-pattern-cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.setAttribute("aria-label", `${x + 1}, ${y + 1}`);
      cell.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        paintValue = bitAt(x, y) ? 0 : 1;
        put(cell);
      });
      cell.addEventListener("pointerenter", () => { if (paintValue !== null) put(cell); });
      cell.addEventListener("keydown", (event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        paintValue = bitAt(x, y) ? 0 : 1;
        put(cell);
        paintValue = null;
      });
      grid.append(cell);
    }
    grid.addEventListener("pointerup", () => { paintValue = null; });
    grid.addEventListener("pointerleave", () => { paintValue = null; });
    const actions = document.createElement("div");
    actions.className = "clio-paint-popover-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = t("cancel");
    cancel.addEventListener("click", closeClioPaintPopover);
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "btn";
    ok.textContent = t("ok");
    ok.addEventListener("click", () => {
      clioPaintState.patterns[index] = rows;
      closeClioPaintPopover();
      setClioPaintPattern(index);
      clioPaintFlash(t("clio_paint_pattern_edited", index + 1));
    });
    actions.append(cancel, ok);
    editor.append(grid, preview);
    popover.append(editor, actions);
    sync();
  });
}

function openClioPaintTouchPatterns() {
  const { touchSwatch } = clioPaintElements();
  openClioPaintPopover(touchSwatch, (popover) => {
    popover.setAttribute("role", "listbox");
    popover.setAttribute("aria-label", t("clio_paint_patterns_label"));
    const grid = document.createElement("div");
    grid.className = "clio-paint-touch-patterns";
    const big = document.createElement("span");
    big.className = "clio-paint-swatch clio-paint-touch-current";
    grid.append(big);
    clioPaintState.patterns.forEach((pattern, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clio-paint-pattern";
      button.dataset.clioPaintPattern = String(index);
      button.setAttribute("role", "option");
      button.setAttribute("aria-label", t("clio_paint_pattern", index + 1));
      button.addEventListener("click", () => {
        setClioPaintPattern(index);
        closeClioPaintPopover();
      });
      grid.append(button);
    });
    popover.append(grid);
    syncClioPaintPatterns();
  });
}

function openClioPaintTouchWidths() {
  const { touchWidth } = clioPaintElements();
  openClioPaintPopover(touchWidth, (popover) => {
    popover.setAttribute("role", "radiogroup");
    popover.setAttribute("aria-label", t("clio_paint_line_width_label"));
    CLIO_PAINT_LINE_WIDTHS.forEach((width) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clio-paint-width clio-paint-touch-width-choice";
      button.setAttribute("role", "radio");
      button.dataset.clioPaintWidth = String(width);
      button.setAttribute("aria-checked", String(width === clioPaintState.lineWidth));
      button.setAttribute("aria-label", width ? t("clio_paint_width_set", width) : t("clio_paint_width_none_label"));
      const line = document.createElement("i");
      line.className = "clio-paint-width-line";
      button.append(line);
      button.addEventListener("click", () => {
        setClioPaintLineWidth(width);
        closeClioPaintPopover();
      });
      popover.append(button);
    });
  });
}

// --- Save / load through the existing imageAttachments store ---------------
//
// One picture belongs to one project. Save reuses the same attachment id on
// every subsequent save (an update, not a growing pile of copies); New
// clears the id so the next Save starts a fresh record. Opening the window
// auto-loads the project's most recent clioPaint picture, so "reload and
// reopen" lands on the same picture without a separate Open dialog.

/**
 * The two history controls on the touch bar and what a step that cannot run
 * says about itself. A button that will do nothing because there is nothing
 * behind it is shown as unavailable, rather than left looking identical to one
 * that works and then doing nothing.
 */
const CLIO_PAINT_HISTORY_CONTROLS = [
  { action: "clio-paint-undo", canRun: clioPaintCanUndo, emptyKey: "clio_paint_nothing_to_undo" },
  { action: "clio-paint-redo", canRun: clioPaintCanRedo, emptyKey: "clio_paint_nothing_to_redo" },
];

function syncClioPaintHistoryButtons() {
  const { root } = clioPaintElements();
  if (!root) return;
  CLIO_PAINT_HISTORY_CONTROLS.forEach((control) => {
    const button = root.querySelector(`.clio-paint-touchbar [data-action="${control.action}"]`);
    if (!button) return;
    const canRun = control.canRun();
    button.disabled = !canRun;
    button.dataset.clioPaintUnavailable = canRun ? "" : control.emptyKey;
    button.title = canRun ? "" : t(control.emptyKey);
  });
}

function syncClioPaintStatus() {
  const { savedLabel } = clioPaintElements();
  syncClioPaintHistoryButtons();
  if (typeof updateMenuState === "function") updateMenuState();
  if (!savedLabel) return;
  savedLabel.textContent = clioPaintState.dirty
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

/** The picture a save or a read should see: the selection put down, the canvas current. */
function clioPaintFlattenForExport() {
  cancelClioPaintOperation({ quiet: true });
  clioPaintDropSelection();
  clioPaintRefreshDocumentCanvas();
}

async function saveClioPaintPicture() {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return false;
  }
  clioPaintFlattenForExport();
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
  // The picture on disk is now this picture, so undo can land back on it.
  clioPaintState.savedBits = clioPaintPackCanvas();
  project.updatedAt = new Date().toISOString();
  markDeskDirty("projects", project.id);
  // The picture is already attached in memory (usable by sketch-read etc.
  // regardless of persistence), but "Picture saved." is a durable claim -
  // only say it once the desk save actually lands.
  const persisted = await saveDeskState();
  syncClioPaintStatus();
  setStatus(persisted ? t("clio_paint_saved") : t("clio_paint_saved_unsaved"));
  return true;
}

/**
 * Open a saved picture at the size it was saved at. Drawing it into whatever
 * size the canvas happened to be would stretch a 576x720 page into a 480x300
 * strip — so the canvas takes the picture's size, not the other way round.
 */
function loadClioPaintRecord(record) {
  const { canvas } = clioPaintElements();
  const ctx = canvas?.getContext?.("2d", { willReadFrequently: true });
  if (!canvas || !ctx || !record) return Promise.resolve(false);
  const dataUrl = record.originalDataUrl || record.previewDataUrl || "";
  if (!dataUrl) return Promise.resolve(false);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const naturalWidth = image.naturalWidth || image.width || CLIO_PAINT_CANVAS_W;
      const naturalHeight = image.naturalHeight || image.height || CLIO_PAINT_CANVAS_H;
      const scale = Math.min(1, CLIO_PAINT_MAX_SIDE / Math.max(naturalWidth, naturalHeight));
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      clioPaintState.doc = { width, height, bits: clioPaintPackImageData(ctx.getImageData(0, 0, width, height)) };
      clioPaintState.attachmentId = record.id;
      clioPaintResetHistory();
      clioPaintState.dirty = false;
      clioPaintSyncContentSize();
      clioPaintMarkChanged();
      syncClioPaintStatus();
      showClioPaintInfo();
      resolve(true);
    };
    image.onerror = () => resolve(false);
    image.src = dataUrl;
  });
}

function clioPaintBlankCanvas(paper = null) {
  const size = paper || { width: clioPaintState.doc?.width || CLIO_PAINT_CANVAS_W, height: clioPaintState.doc?.height || CLIO_PAINT_CANVAS_H };
  clioPaintState.doc = clioPaintCreateDocument(size.width, size.height);
  clioPaintState.attachmentId = "";
  clioPaintResetHistory();
  clioPaintState.dirty = false;
  hideClioPaintResult();
  clioPaintSyncContentSize();
  clioPaintMarkChanged();
  syncClioPaintStatus();
  showClioPaintInfo();
}

async function newClioPaintPicture({ skipConfirm = false, paper = "banner" } = {}) {
  const size = CLIO_PAINT_PAPERS[paper] || CLIO_PAINT_PAPERS.banner;
  if (!skipConfirm && clioPaintState.dirty) {
    const answer = await showSystemModal(t("clio_paint_new_confirm"), "confirm");
    if (answer !== "yes") return;
  }
  // The window says "New picture." from the moment it opens, and a blank
  // canvas cleared again is still blank, so New on an untouched picture
  // repainted nothing and repeated a sentence already on screen: the same
  // event as a command that is broken. Say what really happened instead.
  const alreadyNew = !clioPaintState.dirty && !clioPaintState.attachmentId;
  const sameSize = clioPaintState.doc.width === size.width && clioPaintState.doc.height === size.height;
  clioPaintBlankCanvas(size);
  setClioPaintZoom(1);
  if (alreadyNew && sameSize) {
    const { statusLabel } = clioPaintElements();
    if (statusLabel) statusLabel.textContent = t("clio_paint_status_already_new");
    clioPaintFlashUntil = Date.now() + 2400;
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
  if (typeof updateMenuState === "function") updateMenuState();
}

function hideClioPaintResult() {
  const { result } = clioPaintElements();
  if (result) result.hidden = true;
  if (typeof updateMenuState === "function") updateMenuState();
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
  clioPaintFlattenForExport();
  const record = clioPaintState.attachmentId ? imageAttachmentById(clioPaintState.attachmentId) : null;
  const pngDataUrl = record?.originalDataUrl || canvas.toDataURL("image/png");
  if (!pngDataUrl) {
    setStatus(t("clio_paint_no_picture"));
    return;
  }
  // The model call is long, and the writer may switch projects or open another
  // picture while it runs. Remember which picture this answer is about and ask
  // again before anything is shown: a late answer must not land on whatever
  // the window happens to display now, and it must not be applied to it later
  // through the result panel.
  const requestTarget = { projectId: project.id, attachmentId: clioPaintState.attachmentId || "" };
  const answerStillBelongsToTheOpenPicture = () => {
    const active = typeof getActiveProject === "function" ? getActiveProject() : null;
    return Boolean(active)
      && active.id === requestTarget.projectId
      && (clioPaintState.attachmentId || "") === requestTarget.attachmentId;
  };

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

    if (!answerStillBelongsToTheOpenPicture()) {
      // The run really answered, so its receipt says completed; the answer is
      // simply not shown, because the sketch it describes is no longer the one
      // open. It stays recoverable from Run Records instead of overwriting the
      // panel of a picture it was never about.
      if (receiptId) {
        await window.AISystem6RunReceipts.finishReceipt(receiptId, {
          status: "completed",
          affectedObjectIds: [],
          publicErrorReason: "",
        });
      }
      setStatus(t("clio_paint_result_superseded"));
      return;
    }

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

const CLIO_PAINT_SELECTION_COMMANDS = {
  "clio-paint-clear-selection": null,
  "clio-paint-invert": "invert",
  "clio-paint-trace-edges": "trace-edges",
  "clio-paint-flip-horizontal": "flip-horizontal",
  "clio-paint-flip-vertical": "flip-vertical",
  "clio-paint-fill-selection": "fill-selection",
};

const CLIO_PAINT_COMMAND_NAMES = [
  "clio-paint-new",
  "clio-paint-new-screen",
  "clio-paint-new-page",
  "clio-paint-save",
  "clio-paint-sketch-outline",
  "clio-paint-sketch-prompt",
  "clio-paint-undo",
  "clio-paint-redo",
  "clio-paint-select-all",
  ...Object.keys(CLIO_PAINT_SELECTION_COMMANDS),
  "clio-paint-fatbits",
  "clio-paint-show-page",
  "clio-paint-actual-size",
  "clio-paint-grid",
  "clio-paint-brush-shape",
  "clio-paint-edit-pattern",
  "clio-paint-result-apply",
  "clio-paint-result-copy",
  "clio-paint-result-dismiss",
  ...CLIO_PAINT_TOOLS.map((tool) => `clio-paint-tool-${tool}`),
];

function clioPaintCommandAvailable(action) {
  return clioPaintCommandAvailability(action).available;
}

/**
 * The same question, answered with the reason a disabled row can show: which
 * precondition is missing, not merely "no". Cheap and side-effect free, so a
 * menu can ask while drawing, and the command asks the same thing where it
 * runs.
 *
 * @param {string} action
 * @returns {{ available: boolean, reason: string }}
 */
function clioPaintCommandAvailability(action) {
  if (action === "open-clio-paint") return { available: true, reason: "" };
  const activeWindow = document.querySelector(".window.is-active");
  if (activeWindow?.dataset.window !== "clioPaint") {
    return { available: false, reason: "clio_paint_needs_window" };
  }
  if (action === "clio-paint-undo" && !clioPaintCanUndo()) {
    return { available: false, reason: "clio_paint_nothing_to_undo" };
  }
  if (action === "clio-paint-redo" && !clioPaintCanRedo()) {
    return { available: false, reason: "clio_paint_nothing_to_redo" };
  }
  if (action in CLIO_PAINT_SELECTION_COMMANDS && !clioPaintState.selection) {
    return { available: false, reason: "clio_paint_no_selection" };
  }
  if (["clio-paint-result-apply", "clio-paint-result-copy", "clio-paint-result-dismiss"].includes(action)) {
    return clioPaintElements().result?.hidden
      ? { available: false, reason: "clio_paint_no_result" }
      : { available: true, reason: "" };
  }
  return { available: true, reason: "" };
}

function runClioPaintCommand(action) {
  if (action === "open-clio-paint") return openClioPaint();
  if (action === "clio-paint-new") return newClioPaintPicture({ paper: "banner" });
  if (action === "clio-paint-new-screen") return newClioPaintPicture({ paper: "screen" });
  if (action === "clio-paint-new-page") return newClioPaintPicture({ paper: "page" });
  if (action === "clio-paint-save") return saveClioPaintPicture();
  if (action === "clio-paint-sketch-outline") return runClioPaintSketchToOutline();
  if (action === "clio-paint-sketch-prompt") return runClioPaintSketchToImagePrompt();
  if (action === "clio-paint-undo") return undoClioPaint();
  if (action === "clio-paint-redo") return redoClioPaint();
  if (action === "clio-paint-select-all") return selectAllClioPaint();
  if (action === "clio-paint-clear-selection") return clearClioPaintSelection();
  if (CLIO_PAINT_SELECTION_COMMANDS[action]) return applyClioPaintSelectionEffect(CLIO_PAINT_SELECTION_COMMANDS[action]);
  if (action === "clio-paint-fatbits") return toggleClioPaintFatBits();
  if (action === "clio-paint-show-page") return showClioPaintPage();
  if (action === "clio-paint-actual-size") return setClioPaintZoom(1);
  if (action === "clio-paint-grid") {
    clioPaintState.grid = !clioPaintState.grid;
    clioPaintFlash(t(clioPaintState.grid ? "clio_paint_grid_on" : "clio_paint_grid_off"));
    if (typeof updateMenuState === "function") updateMenuState();
    return clioPaintState.grid;
  }
  if (action === "clio-paint-brush-shape") return openClioPaintBrushShapes();
  if (action === "clio-paint-edit-pattern") return openClioPaintPatternEditor();
  if (action === "clio-paint-result-apply") return applyClioPaintOutlineResult();
  if (action === "clio-paint-result-copy") return copyClioPaintResult();
  if (action === "clio-paint-result-dismiss") return hideClioPaintResult();
  if (action.startsWith("clio-paint-tool-")) return setClioPaintTool(action.slice("clio-paint-tool-".length));
}

/** Which menu rows carry a check mark, asked by updateMenuState(). */
function clioPaintMenuChecked(key) {
  if (key === "fatbits") return clioPaintState.zoom >= 4;
  if (key === "grid") return clioPaintState.grid === true;
  if (key === "actual-size") return clioPaintState.zoom === 1;
  return false;
}

function bindClioPaintControls() {
  const els = clioPaintElements();
  if (!els.root || els.root.dataset.clioPaintBound === "true") return;
  els.root.dataset.clioPaintBound = "true";
  const resources = clioPaintInstanceResources();
  // A tool is taken on the press, not the release, so the palette answers as
  // fast as the hand; the click that follows (and a keyboard click) lands on
  // the same choice.
  const chooseTool = (event) => {
    const toolButton = event.target.closest?.("[data-clio-paint-tool]");
    if (toolButton) setClioPaintTool(toolButton.dataset.clioPaintTool);
  };
  resources.listen(els.toolbar, "pointerdown", chooseTool);
  resources.listen(els.toolbar, "click", chooseTool);
  resources.listen(els.toolbar, "dblclick", (event) => {
    const toolButton = event.target.closest?.("[data-clio-paint-tool]");
    if (toolButton) clioPaintDoubleClickTool(toolButton.dataset.clioPaintTool);
  });
  resources.listen(els.widths, "click", (event) => {
    const button = event.target.closest?.("[data-clio-paint-width]");
    if (button) setClioPaintLineWidth(Number(button.dataset.clioPaintWidth));
  });
  resources.listen(els.patterns, "click", (event) => {
    const button = event.target.closest?.("[data-clio-paint-pattern]");
    if (button) setClioPaintPattern(Number(button.dataset.clioPaintPattern));
  });
  resources.listen(els.patterns, "dblclick", (event) => {
    const button = event.target.closest?.("[data-clio-paint-pattern]");
    if (button) openClioPaintPatternEditor(Number(button.dataset.clioPaintPattern));
  });
  resources.listen(els.current, "dblclick", () => openClioPaintPatternEditor());
  resources.listen(els.touchSwatch, "click", openClioPaintTouchPatterns);
  resources.listen(els.touchWidth, "click", openClioPaintTouchWidths);
  resources.listen(els.read, "click", openClioPaintReadMenu);
  resources.listen(els.zoom, "change", () => setClioPaintZoom(Number(els.zoom.value)));
  resources.listen(document, "pointerdown", (event) => {
    const { popover } = clioPaintElements();
    if (!popover || popover.hidden) return;
    if (popover.contains(event.target) || clioPaintPopoverAnchor?.contains(event.target)) return;
    closeClioPaintPopover();
  });
  wireClioPaintViewport();
  // The Paint menu's shortcuts are handled while the window is the active one,
  // so this listener follows the instance rather than the document's lifetime.
  resources.listen(document, "keydown", handleClioPaintKeydown);
  // Undo/redo has to get there before the desk's dispatcher, which is why it
  // is the one listener here registered in the capture phase (see
  // handleClioPaintHistoryKeydown); Save and Select All follow it.
  clioPaintInstanceResources().listen(document, "keydown", handleClioPaintHistoryKeydown, { capture: true });
  clioPaintInstanceResources().listen(document, "keydown", handleClioPaintCommandKeydown, { capture: true });
}

async function openClioPaint() {
  await openWindow("clioPaint");
}

async function attachClioPaint() {
  renderClioPaintGlyphs();
  renderClioPaintPatterns();
  bindClioPaintControls();
  setClioPaintLineWidth(clioPaintState.lineWidth, { quiet: true });
  syncClioPaintCursor();
  await autoLoadClioPaintForProject();
  clioPaintSyncContentSize();
  syncClioPaintStatus();
  showClioPaintInfo();
  requestClioPaintRender();
}

const clioPaintPaperItem = (paper, action) => ({
  type: "item",
  action,
  labelKey: CLIO_PAINT_PAPERS[paper].labelKey,
  conditionId: action,
});

const clioPaintCheckItem = (action, labelKey, check) => ({
  type: "item",
  action,
  labelKey,
  conditionId: action,
  dataset: { clioPaintCheck: check },
});

window.AISystem6RegisterApplicationMenuSet?.("clioPaint", [
  {
    id: "file",
    labelKey: "menu_file",
    items: [
      {
        type: "submenu",
        labelKey: "clio_paint_new",
        items: [
          clioPaintPaperItem("banner", "clio-paint-new"),
          clioPaintPaperItem("screen", "clio-paint-new-screen"),
          clioPaintPaperItem("page", "clio-paint-new-page"),
        ],
      },
      { type: "item", action: "clio-paint-save", labelKey: "save", shortcutId: "save", conditionId: "clio-paint-save" },
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
      // shortcutId is display only (the key itself is claimed inside the
      // window, see handleClioPaintHistoryKeydown); the row still dispatches
      // its own Paint command.
      { type: "item", action: "clio-paint-undo", labelKey: "undo", shortcutId: "undo", conditionId: "clio-paint-undo" },
      { type: "item", action: "clio-paint-redo", labelKey: "redo", shortcutId: "redo", conditionId: "clio-paint-redo" },
      { type: "separator" },
      { type: "item", action: "clio-paint-clear-selection", labelKey: "clear", conditionId: "clio-paint-clear-selection" },
      { type: "item", action: "clio-paint-select-all", labelKey: "select_all", shortcutId: "select-all", conditionId: "clio-paint-select-all" },
      { type: "separator" },
      { type: "item", action: "clio-paint-fill-selection", labelKey: "clio_paint_op_fill_selection", conditionId: "clio-paint-fill-selection" },
      { type: "item", action: "clio-paint-invert", labelKey: "clio_paint_op_invert", conditionId: "clio-paint-invert" },
      { type: "item", action: "clio-paint-trace-edges", labelKey: "clio_paint_op_trace_edges", conditionId: "clio-paint-trace-edges" },
      { type: "item", action: "clio-paint-flip-horizontal", labelKey: "clio_paint_op_flip_horizontal", conditionId: "clio-paint-flip-horizontal" },
      { type: "item", action: "clio-paint-flip-vertical", labelKey: "clio_paint_op_flip_vertical", conditionId: "clio-paint-flip-vertical" },
    ],
  },
  {
    id: "paint",
    labelKey: "menu_paint",
    items: [
      clioPaintCheckItem("clio-paint-fatbits", "clio_paint_fatbits", "fatbits"),
      { type: "item", action: "clio-paint-show-page", labelKey: "clio_paint_show_page", conditionId: "clio-paint-show-page" },
      clioPaintCheckItem("clio-paint-actual-size", "clio_paint_actual_size", "actual-size"),
      clioPaintCheckItem("clio-paint-grid", "clio_paint_grid", "grid"),
      { type: "separator" },
      { type: "item", action: "clio-paint-brush-shape", labelKey: "clio_paint_brush_shape", conditionId: "clio-paint-brush-shape" },
      { type: "item", action: "clio-paint-edit-pattern", labelKey: "clio_paint_edit_pattern", conditionId: "clio-paint-edit-pattern" },
    ],
  },
]);

window.AISystem6ClioPaint = Object.freeze({
  open: openClioPaint,
  attach: attachClioPaint,
  currentTool: () => clioPaintState.tool,
  menuChecked: clioPaintMenuChecked,
  setTool: setClioPaintTool,
  setPattern: setClioPaintPattern,
  setLineWidth: (width) => setClioPaintLineWidth(Number(width), { quiet: true }),
  setZoom: (zoom) => setClioPaintZoom(Number(zoom)),
  undo: undoClioPaint,
  redo: redoClioPaint,
  save: saveClioPaintPicture,
  newPicture: newClioPaintPicture,
  sketchToOutline: runClioPaintSketchToOutline,
  sketchToImagePrompt: runClioPaintSketchToImagePrompt,
  /**
   * Release everything this window bound (listeners, timers, cached nodes).
   * Hiding or WindowShade'ing the window is NOT a reason to call this: the
   * picture, undo stack and unsaved edits belong to the open window. It is for
   * a real destroy, and it is safe to call twice.
   */
  dispose: disposeClioPaint,
  /** Diagnostics: how many resources this instance still holds. */
  resourceCount: () => (clioPaintResources.disposed ? 0 : clioPaintResources.size),
  /** A read-only snapshot of what this window currently holds. */
  state: () => {
    // How many steps the two stacks hold — counts, never the packed bits: a
    // step is not an object anyone outside this window can act on.
    const depth = clioPaintHistoryDepth();
    return {
      projectId: clioPaintState.projectId,
      attachmentId: clioPaintState.attachmentId,
      dirty: clioPaintState.dirty === true,
      tool: clioPaintState.tool,
      pattern: clioPaintState.pattern,
      lineWidth: clioPaintState.lineWidth,
      zoom: clioPaintState.zoom,
      width: clioPaintState.doc.width,
      height: clioPaintState.doc.height,
      hasSelection: Boolean(clioPaintState.selection),
      undoDepth: depth.past,
      redoDepth: depth.future,
      hasResult: Boolean(clioPaintState.lastResult),
    };
  },
  /** The current result as a copy, never the live record. */
  result: () => (clioPaintState.lastResult ? { ...clioPaintState.lastResult } : null),
  /** Whether a Paint command can run now, and what it is waiting for. */
  commandAvailability: (action) => clioPaintCommandAvailability(String(action || "")),
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
      unavailableReason: () => clioPaintCommandAvailability(action).reason,
    }])
  ),
});
