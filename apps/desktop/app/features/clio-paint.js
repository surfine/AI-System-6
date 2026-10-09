// Feature module: ClioPaint — the first Claris piece, a 1-bit painting
// surface in the MacPaint lineage, plus 草图变大纲 (sketch to outline).
//
// Lazy-loaded by the Applications finder-item and by open-clio-paint. Its
// stylesheet (styles.clio-paint.css) travels with it — see
// ensureClioPaintModule in app/core/config.js.
//
// Object model, kept deliberately small:
//   - The picture lives in the existing imageAttachments store (DB v5,
//     surface "clioPaint"), one project's worth at a time — no new store, no
//     new persistence boundary. A picture opens at the size it was saved at:
//     the three papers (480x300, the original Macintosh screen 512x342,
//     MacPaint's 576x720 page) are sizes of the same PNG.
//   - Layers (decided by the owner on 2026-10-09, overturning "ClioPaint adds
//     no layer storage format"): a picture is a stack of 1-bit layers, each
//     its own imageAttachments record grouped under the picture
//     (app/core/edit-assets.js: roles sketch-layer / sketch-tracing, bottom
//     first), plus ONE composite record (role sketch-composite) — the
//     picture the Picture Album and every other app sees, and what a sketch
//     read sends. A tracing layer is a guide shown under the picture at
//     reduced strength and never part of the composite. A picture saved before
//     layers (one PNG, no group) opens as a single layer with all of it.
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
//   - The document is a packed 1-bit bitmap, not a canvas: the ACTIVE layer's.
//     Every tool writes bits directly, so nothing is ever antialiased and
//     thresholded back. A history step is only the 64x64 tiles one operation
//     touched (see "Layers and history").
//   - What JS Paint (1j01/jspaint) taught this file, kept because each one is
//     about the drawing loop rather than about features: a paint document
//     earns its keep with a real history (a stack of undo steps with redo,
//     and the step still being drawn held apart so a mis-drag is cancelled
//     instead of committed), a selection that can be MOVED instead of only
//     cleared, and Shift meaning "constrain proportions" while a shape is
//     drawn. History lives and dies with the window: nothing here adds a
//     persistence boundary.

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
            <aside class="clio-paint-layers" id="clio-paint-layers" data-i18n-aria-label="clio_paint_layers_label" aria-label="Layers">
              <div class="clio-paint-layers-list" id="clio-paint-layers-list"></div>
              <div class="clio-paint-layers-actions">
                <button class="btn mini-btn" type="button" data-action="clio-paint-layer-new" data-i18n="clio_paint_layer_btn_new">New</button>
                <button class="btn mini-btn" type="button" data-action="clio-paint-layer-duplicate" data-i18n="clio_paint_layer_btn_duplicate">Copy</button>
                <button class="btn mini-btn" type="button" data-action="clio-paint-layer-merge-down" data-i18n="clio_paint_layer_btn_merge">Merge</button>
                <button class="btn mini-btn" type="button" data-action="clio-paint-layer-delete" data-i18n="clio_paint_layer_btn_delete">Delete</button>
              </div>
            </aside>
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
  get doc() {
    return clioPaintActiveLayer()?.doc || null;
  },
  projectId: "",
  attachmentId: "",
  dirty: false,
  tool: "pencil",
  pattern: 1,
  lineWidth: 1,
  brush: 1,
  grid: false,
  zoom: 1,
  // The picture is a stack of 1-bit layers (bottom first); `doc` is the active
  // layer's packed bitmap, bit `x + y * width` set for ink, and what every
  // tool draws into. See the Layers and history section.
  layers: [],
  activeLayerId: "",
  // The last committed state of the stack, as tiles: what history snapshots,
  // and what "saved" is compared against (`savedSnapshot`).
  snapshot: null,
  savedSnapshot: null,
  historyApi: null,
  // The active layer as it was when the operation now in progress began.
  pending: null,
  // A marquee or lasso region (one coverage mask); once moved or transformed
  // it floats above its layer until it is dropped. See the Selection section.
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
  // Whether any shown tracing layer was drawn on the guide canvas.
  traceShown: false,
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
    layersHost: root.querySelector("#clio-paint-layers-list"),
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

// --- Layers and history ----------------------------------------------------
//
// A picture is a stack of 1-bit layers. A layer is a sheet of ink on nothing:
// a set bit is black, an unset bit is transparent, and the picture is the
// union of every shown ink layer on white paper. (A 1-bit layer has no
// opacity to blend with, so the order of the stack decides which layer a
// merge lands in, not what the page looks like.) A tracing layer is a guide:
// it is drawn under the picture at reduced strength and is never part of the
// picture that is saved, read or exported.
//
// The document the tools draw into is always the ACTIVE layer's packed bitmap
// (`clioPaintState.doc`), so every tool keeps writing bits directly. History
// is kept next to it as snapshots of the whole stack in which a layer is a
// sparse map of 64x64 tiles. A snapshot shares every tile it did not change
// with its neighbours, so a step costs the tiles one operation touched and
// nothing else: a one-pixel stroke on a large page is one tile, where a
// full-picture copy was the whole page. The kernel history
// (app/core/edit-history.js) holds the snapshots, caps them by bytes instead
// of by count, and drops the oldest first.
//
// `pending` is the active layer as it was when the operation now in progress
// began, packed whole. A shape preview repaints from it and Escape puts it
// back without writing a step; committing compares it with the layer, finds
// the tiles that differ, and derives the next snapshot from the last.

// ---- Pure: bits, tiles, layer snapshots, selection masks, bounds ------------
// Nothing between here and "end of pure" reaches the window, the canvas or
// clioPaintState, so the executable contract runs it bare.

const CLIO_PAINT_TILE = 64;
const CLIO_PAINT_TILE_BYTES = (CLIO_PAINT_TILE * CLIO_PAINT_TILE) / 8;
const CLIO_PAINT_HISTORY_LIMIT = 100;
// Four megabytes of tiles: thousands of strokes on a page, a few full clears
// of a large one. Oldest steps go first; the newest always survives.
const CLIO_PAINT_HISTORY_BUDGET = 4 * 1024 * 1024;
const CLIO_PAINT_TILE_OVERHEAD = 32;
const CLIO_PAINT_LAYER_OVERHEAD = 96;

/**
 * One packed bitmap: bit `x + y * width` set for a black pixel.
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

function clioPaintTileKey(tx, ty) {
  return `${tx},${ty}`;
}

function clioPaintTileCoords(key) {
  const [tx, ty] = String(key).split(",").map(Number);
  return { tx, ty };
}

/**
 * The 64x64 tile at (tx, ty) of a packed document, eight bytes a row, or null
 * when it holds no ink. Cells past the page edge read as empty.
 */
function clioPaintExtractTile(doc, tx, ty) {
  const size = CLIO_PAINT_TILE;
  const x0 = tx * size;
  const y0 = ty * size;
  const x1 = Math.min(doc.width, x0 + size);
  const y1 = Math.min(doc.height, y0 + size);
  let tile = null;
  for (let y = y0; y < y1; y += 1) {
    let pixel = y * doc.width + x0;
    for (let x = x0; x < x1; x += 1, pixel += 1) {
      if (!((doc.bits[pixel >> 3] >> (7 - (pixel & 7))) & 1)) continue;
      if (!tile) tile = new Uint8Array(CLIO_PAINT_TILE_BYTES);
      const i = x - x0;
      tile[(y - y0) * (size >> 3) + (i >> 3)] |= 128 >> (i & 7);
    }
  }
  return tile;
}

/** Put a tile (or, for null, an empty one) back into a packed document. */
function clioPaintWriteTile(doc, tx, ty, tile) {
  const size = CLIO_PAINT_TILE;
  const x0 = tx * size;
  const y0 = ty * size;
  const x1 = Math.min(doc.width, x0 + size);
  const y1 = Math.min(doc.height, y0 + size);
  for (let y = y0; y < y1; y += 1) {
    let pixel = y * doc.width + x0;
    for (let x = x0; x < x1; x += 1, pixel += 1) {
      const i = x - x0;
      const on = tile ? (tile[(y - y0) * (size >> 3) + (i >> 3)] >> (7 - (i & 7))) & 1 : 0;
      if (on) doc.bits[pixel >> 3] |= 128 >> (pixel & 7);
      else doc.bits[pixel >> 3] &= ~(128 >> (pixel & 7));
    }
  }
}

/**
 * The tiles in which two packed bitmaps of one size differ. A byte compare
 * finds the differing bytes; only those are opened up into pixels.
 */
function clioPaintChangedTileKeys(before, after, width, height) {
  const keys = new Set();
  const total = width * height;
  const length = Math.min(before.length, after.length);
  for (let i = 0; i < length; i += 1) {
    const diff = before[i] ^ after[i];
    if (!diff) continue;
    for (let bit = 0; bit < 8; bit += 1) {
      if (!(diff & (128 >> bit))) continue;
      const pixel = i * 8 + bit;
      if (pixel >= total) break;
      const y = Math.floor(pixel / width);
      const x = pixel - y * width;
      keys.add(clioPaintTileKey(Math.floor(x / CLIO_PAINT_TILE), Math.floor(y / CLIO_PAINT_TILE)));
    }
  }
  return keys;
}

/** Every tile of a packed document that holds ink, by key. */
function clioPaintTilesOfDoc(doc) {
  const tiles = new Map();
  const cols = Math.ceil(doc.width / CLIO_PAINT_TILE);
  const rows = Math.ceil(doc.height / CLIO_PAINT_TILE);
  for (let ty = 0; ty < rows; ty += 1) {
    for (let tx = 0; tx < cols; tx += 1) {
      const tile = clioPaintExtractTile(doc, tx, ty);
      if (tile) tiles.set(clioPaintTileKey(tx, ty), tile);
    }
  }
  return tiles;
}

/** The next tile map: the previous one with only `keys` re-read from the document. */
function clioPaintDeriveTiles(previous, doc, keys) {
  const tiles = new Map(previous);
  keys.forEach((key) => {
    const { tx, ty } = clioPaintTileCoords(key);
    const tile = clioPaintExtractTile(doc, tx, ty);
    if (tile) tiles.set(key, tile);
    else tiles.delete(key);
  });
  return tiles;
}

/** A layer as a snapshot holds it. Tile maps and tiles are never mutated once made. */
function clioPaintLayerRecord({ id, name = "", kind = "ink", visible = true, locked = false, tiles = null }) {
  return {
    id: String(id),
    name: String(name),
    kind: kind === "tracing" ? "tracing" : "ink",
    visible: visible !== false,
    locked: locked === true,
    tiles: tiles || new Map(),
  };
}

function clioPaintSnapshot(width, height, layers) {
  return { width, height, layers };
}

/** A snapshot of live layers ({id, name, kind, visible, locked, doc}), bottom first. */
function clioPaintSnapshotOfLayers(layers, width, height) {
  return clioPaintSnapshot(width, height, layers.map((layer) => clioPaintLayerRecord({ ...layer, tiles: clioPaintTilesOfDoc(layer.doc) })));
}

function clioPaintSnapshotIndex(snapshot, id) {
  return snapshot.layers.findIndex((layer) => layer.id === id);
}

function clioPaintSnapshotReplaceLayer(snapshot, id, patch) {
  const index = clioPaintSnapshotIndex(snapshot, id);
  if (index < 0) return snapshot;
  const layers = snapshot.layers.slice();
  layers[index] = clioPaintLayerRecord({ ...layers[index], ...patch });
  return clioPaintSnapshot(snapshot.width, snapshot.height, layers);
}

function clioPaintSnapshotInsertLayer(snapshot, layer, index) {
  const layers = snapshot.layers.slice();
  layers.splice(Math.max(0, Math.min(layers.length, index)), 0, layer);
  return clioPaintSnapshot(snapshot.width, snapshot.height, layers);
}

function clioPaintSnapshotRemoveLayer(snapshot, id) {
  if (snapshot.layers.length < 2) return null;
  const index = clioPaintSnapshotIndex(snapshot, id);
  if (index < 0) return null;
  return clioPaintSnapshot(snapshot.width, snapshot.height, snapshot.layers.filter((layer) => layer.id !== id));
}

/** Move a layer to `toIndex` in the stack (0 is the bottom). */
function clioPaintSnapshotMoveLayer(snapshot, id, toIndex) {
  const from = clioPaintSnapshotIndex(snapshot, id);
  if (from < 0) return snapshot;
  const to = Math.max(0, Math.min(snapshot.layers.length - 1, toIndex));
  if (to === from) return snapshot;
  const layers = snapshot.layers.slice();
  const [moved] = layers.splice(from, 1);
  layers.splice(to, 0, moved);
  return clioPaintSnapshot(snapshot.width, snapshot.height, layers);
}

/** A copy one above the original. It shares the original's tiles: no pixels are copied. */
function clioPaintSnapshotDuplicateLayer(snapshot, id, newId, name) {
  const index = clioPaintSnapshotIndex(snapshot, id);
  if (index < 0) return null;
  const copy = clioPaintLayerRecord({ ...snapshot.layers[index], id: newId, name, locked: false });
  return clioPaintSnapshotInsertLayer(snapshot, copy, index + 1);
}

/** Two tile maps laid over each other: ink wins. Tiles only one side has are shared as they are. */
function clioPaintMergeTiles(lower, upper) {
  const merged = new Map(lower);
  upper.forEach((tile, key) => {
    const base = merged.get(key);
    if (!base) {
      merged.set(key, tile);
      return;
    }
    const joined = new Uint8Array(tile.length);
    for (let i = 0; i < tile.length; i += 1) joined[i] = base[i] | tile[i];
    merged.set(key, joined);
  });
  return merged;
}

/** The layer folded into the one below it, or null when there is nothing to fold into. */
function clioPaintSnapshotMergeDown(snapshot, id) {
  const index = clioPaintSnapshotIndex(snapshot, id);
  if (index < 1) return null;
  const upper = snapshot.layers[index];
  const lower = snapshot.layers[index - 1];
  // A tracing layer is a guide, not ink: folding it into the picture (or the
  // picture into it) would make the guide part of what is saved.
  if (upper.kind === "tracing" || lower.kind === "tracing") return null;
  const layers = snapshot.layers.slice();
  layers.splice(index - 1, 2, clioPaintLayerRecord({ ...lower, tiles: clioPaintMergeTiles(lower.tiles, upper.tiles) }));
  return clioPaintSnapshot(snapshot.width, snapshot.height, layers);
}

function clioPaintTilesEqual(a, b) {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, tile] of a) {
    const other = b.get(key);
    if (!other) return false;
    if (other !== tile && !clioPaintBitsEqual(tile, other)) return false;
  }
  return true;
}

function clioPaintSnapshotsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.width !== b.width || a.height !== b.height || a.layers.length !== b.layers.length) return false;
  return a.layers.every((layer, index) => {
    const other = b.layers[index];
    return layer.id === other.id && layer.name === other.name && layer.kind === other.kind
      && layer.visible === other.visible && layer.locked === other.locked && clioPaintTilesEqual(layer.tiles, other.tiles);
  });
}

function clioPaintTileSet(snapshot) {
  const set = new Set();
  snapshot.layers.forEach((layer) => layer.tiles.forEach((tile) => set.add(tile)));
  return set;
}

/**
 * What it costs to keep `snapshot` when `other` is its neighbour in the
 * history: the tiles only it holds, in full, plus a small descriptor for the
 * tiles only the neighbour holds (the step must know to drop them).
 */
function clioPaintSnapshotCost(snapshot, other) {
  const mine = clioPaintTileSet(snapshot);
  const theirs = other ? clioPaintTileSet(other) : new Set();
  let bytes = snapshot.layers.length * CLIO_PAINT_LAYER_OVERHEAD;
  mine.forEach((tile) => { if (!theirs.has(tile)) bytes += CLIO_PAINT_TILE_BYTES + CLIO_PAINT_TILE_OVERHEAD; });
  theirs.forEach((tile) => { if (!mine.has(tile)) bytes += CLIO_PAINT_TILE_OVERHEAD; });
  return bytes;
}

// The cost of a snapshot depends on which neighbour it is weighed against, and
// the history asks only for the snapshot. It is recorded when two snapshots
// become neighbours: `older` is the cost as the state before a step, `newer`
// as the state after it (what Redo keeps).
const clioPaintSnapshotCosts = new WeakMap();

function clioPaintLinkSnapshots(previous, next) {
  clioPaintSnapshotCosts.set(previous, { ...(clioPaintSnapshotCosts.get(previous) || {}), older: clioPaintSnapshotCost(previous, next) });
  clioPaintSnapshotCosts.set(next, { ...(clioPaintSnapshotCosts.get(next) || {}), newer: clioPaintSnapshotCost(next, previous) });
}

function clioPaintSnapshotWeight(snapshot, mode = "older") {
  const known = clioPaintSnapshotCosts.get(snapshot)?.[mode];
  return Math.max(1, Number.isFinite(known) ? known : clioPaintSnapshotCost(snapshot, null));
}

/**
 * Bring a list of live layers in line with `next`, reusing every bitmap whose
 * tiles did not change and rewriting only the tiles that did. `previous` is
 * the snapshot the live layers currently show.
 */
function clioPaintLayersFromSnapshot(live, previous, next) {
  const liveById = new Map(live.map((layer) => [layer.id, layer]));
  const previousById = new Map((previous?.layers || []).map((layer) => [layer.id, layer]));
  return next.layers.map((layer) => {
    const existing = liveById.get(layer.id);
    const before = previousById.get(layer.id);
    let doc;
    if (existing && before && existing.doc.width === next.width && existing.doc.height === next.height) {
      doc = existing.doc;
      if (before.tiles !== layer.tiles) {
        const keys = new Set([...before.tiles.keys(), ...layer.tiles.keys()]);
        keys.forEach((key) => {
          if (before.tiles.get(key) === layer.tiles.get(key)) return;
          const { tx, ty } = clioPaintTileCoords(key);
          clioPaintWriteTile(doc, tx, ty, layer.tiles.get(key) || null);
        });
      }
    } else {
      doc = { width: next.width, height: next.height, bits: new Uint8Array(Math.ceil((next.width * next.height) / 8)) };
      layer.tiles.forEach((tile, key) => {
        const { tx, ty } = clioPaintTileCoords(key);
        clioPaintWriteTile(doc, tx, ty, tile);
      });
    }
    return { id: layer.id, name: layer.name, kind: layer.kind, visible: layer.visible, locked: layer.locked, doc };
  });
}

/**
 * The picture and the guides from a list of {kind, visible, bits}: the union
 * of every shown ink layer, and (separately) the union of every shown tracing
 * layer. Either is null when nothing contributes.
 */
function clioPaintComposite(entries) {
  let ink = null;
  let trace = null;
  entries.forEach((entry) => {
    if (!entry.visible) return;
    if (entry.kind === "tracing") {
      if (!trace) trace = new Uint8Array(entry.bits.length);
      for (let i = 0; i < trace.length; i += 1) trace[i] |= entry.bits[i];
    } else {
      if (!ink) ink = new Uint8Array(entry.bits.length);
      for (let i = 0; i < ink.length; i += 1) ink[i] |= entry.bits[i];
    }
  });
  return { ink, trace };
}

/** The box around a layer's ink, or null when it has none. */
function clioPaintInkBounds(doc) {
  const total = doc.width * doc.height;
  let x0 = Infinity; let y0 = Infinity; let x1 = -1; let y1 = -1;
  for (let i = 0; i < doc.bits.length; i += 1) {
    const byte = doc.bits[i];
    if (!byte) continue;
    for (let bit = 0; bit < 8; bit += 1) {
      if (!(byte & (128 >> bit))) continue;
      const pixel = i * 8 + bit;
      if (pixel >= total) break;
      const y = Math.floor(pixel / doc.width);
      const x = pixel - y * doc.width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Selections are one coverage mask. `cover` is 1 where the region is,
 * `opaque` is 1 where a white pixel travels with it (a rectangle carries its
 * white, a lasso only its ink), both w x h cells at (x, y).
 */
function clioPaintRectSelection(x, y, w, h) {
  return { x, y, w, h, cover: new Uint8Array(w * h).fill(1), opaque: new Uint8Array(w * h).fill(1) };
}

/**
 * Combine a new region with the one already there. "replace" drops the old,
 * "add" is the union, "subtract" takes the new region out of the old, and
 * "intersect" keeps only where both are. A pixel stays opaque in a union if
 * either side carried its white, and in an intersection only if both did.
 * Returns the result cropped to its coverage, or null when nothing is left.
 */
function clioPaintCombineSelection(base, incoming, mode) {
  if (mode === "replace" || !base) return mode === "subtract" || mode === "intersect" ? null : (incoming || null);
  if (!incoming) return mode === "intersect" ? null : base;
  const x0 = Math.min(base.x, incoming.x);
  const y0 = Math.min(base.y, incoming.y);
  const x1 = Math.max(base.x + base.w, incoming.x + incoming.w);
  const y1 = Math.max(base.y + base.h, incoming.y + incoming.h);
  const w = x1 - x0;
  const h = y1 - y0;
  const cover = new Uint8Array(w * h);
  const opaque = new Uint8Array(w * h);
  let minX = Infinity; let minY = Infinity; let maxX = -1; let maxY = -1;
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const px = x0 + i;
      const py = y0 + j;
      const ai = (py - base.y) * base.w + (px - base.x);
      const bi = (py - incoming.y) * incoming.w + (px - incoming.x);
      const a = px >= base.x && px < base.x + base.w && py >= base.y && py < base.y + base.h && base.cover[ai] === 1;
      const b = px >= incoming.x && px < incoming.x + incoming.w && py >= incoming.y && py < incoming.y + incoming.h && incoming.cover[bi] === 1;
      let inside;
      let white;
      if (mode === "add") {
        inside = a || b;
        white = (a && base.opaque[ai] === 1) || (b && incoming.opaque[bi] === 1);
      } else if (mode === "subtract") {
        inside = a && !b;
        white = a && base.opaque[ai] === 1;
      } else {
        inside = a && b;
        white = a && b && base.opaque[ai] === 1 && incoming.opaque[bi] === 1;
      }
      if (!inside) continue;
      const k = j * w + i;
      cover[k] = 1;
      opaque[k] = white ? 1 : 0;
      if (i < minX) minX = i;
      if (i > maxX) maxX = i;
      if (j < minY) minY = j;
      if (j > maxY) maxY = j;
    }
  }
  if (maxX < 0) return null;
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const croppedCover = new Uint8Array(cw * ch);
  const croppedOpaque = new Uint8Array(cw * ch);
  for (let j = 0; j < ch; j += 1) {
    for (let i = 0; i < cw; i += 1) {
      croppedCover[j * cw + i] = cover[(minY + j) * w + minX + i];
      croppedOpaque[j * cw + i] = opaque[(minY + j) * w + minX + i];
    }
  }
  return { x: x0 + minX, y: y0 + minY, w: cw, h: ch, cover: croppedCover, opaque: croppedOpaque };
}

/** Which way a new region combines, from the modifier keys held as it is begun. */
function clioPaintSelectionMode(shift, option) {
  if (shift && option) return "intersect";
  if (option) return "subtract";
  if (shift) return "add";
  return "replace";
}

// ---- end of pure -------------------------------------------------------------

let clioPaintLayerCounter = 0;
// Which end of a step is being weighed: a recorded step weighs the state
// before it ("older"), an Undo pushes the state it leaves onto Redo ("newer").
let clioPaintWeighMode = "older";

function clioPaintNewLayerId() {
  clioPaintLayerCounter += 1;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `layer-${Date.now().toString(36)}-${clioPaintLayerCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

function clioPaintActiveLayer() {
  const layers = clioPaintState.layers;
  return layers.find((layer) => layer.id === clioPaintState.activeLayerId) || layers[layers.length - 1] || null;
}

function clioPaintLayerById(id) {
  return clioPaintState.layers.find((layer) => layer.id === id) || null;
}

function clioPaintDefaultLayerName(kind) {
  const count = (clioPaintState.snapshot?.layers || []).filter((layer) => layer.kind === kind).length + 1;
  return t(kind === "tracing" ? "clio_paint_tracing_name" : "clio_paint_layer_name", count);
}

/**
 * Lay a whole new picture down: layers are {id?, name?, kind?, visible?,
 * locked?, bits?}, bottom first. History starts empty and this is the state
 * "saved" is measured against.
 */
function clioPaintInstallPicture(width, height, entries) {
  const size = Math.ceil((width * height) / 8);
  const layers = (entries.length ? entries : [{}]).map((entry, index) => {
    const kind = entry.kind === "tracing" ? "tracing" : "ink";
    return {
      id: entry.id || clioPaintNewLayerId(),
      name: entry.name || t(kind === "tracing" ? "clio_paint_tracing_name" : "clio_paint_layer_name", index + 1),
      kind,
      visible: entry.visible !== false,
      locked: entry.locked === true,
      doc: { width, height, bits: entry.bits || new Uint8Array(size) },
    };
  });
  clioPaintState.layers = layers;
  const top = layers.slice().reverse().find((layer) => layer.kind !== "tracing") || layers[layers.length - 1];
  clioPaintState.activeLayerId = top.id;
  clioPaintState.snapshot = clioPaintSnapshotOfLayers(layers, width, height);
  clioPaintResetHistory();
  clioPaintMarkChanged();
  renderClioPaintLayers();
}

function clioPaintHistory() {
  if (!clioPaintState.historyApi) {
    clioPaintState.historyApi = window.AISystem6EditHistory.createEditHistory({
      read: () => clioPaintState.snapshot,
      write: (snapshot) => clioPaintShowSnapshot(snapshot),
      equals: (a, b) => a === b,
      limit: CLIO_PAINT_HISTORY_LIMIT,
      weigh: (snapshot) => clioPaintSnapshotWeight(snapshot, clioPaintWeighMode),
      budget: CLIO_PAINT_HISTORY_BUDGET,
      onChange: () => clioPaintNotifyEmbed(),
    });
  }
  return clioPaintState.historyApi;
}

/** Make the live layers show `snapshot`. Never records anything. */
function clioPaintShowSnapshot(snapshot) {
  const previous = clioPaintState.snapshot;
  clioPaintState.layers = clioPaintLayersFromSnapshot(clioPaintState.layers, previous, snapshot);
  clioPaintState.snapshot = snapshot;
  if (!clioPaintState.layers.some((layer) => layer.id === clioPaintState.activeLayerId)) {
    clioPaintState.activeLayerId = clioPaintState.layers[clioPaintState.layers.length - 1]?.id || "";
  }
  clioPaintState.selection = null;
  clioPaintState.drawing = null;
  clioPaintState.polygon = null;
  clioPaintState.pending = null;
  clioPaintMarkChanged();
  renderClioPaintLayers();
}

/**
 * Remember the active layer as it is now, before the tool about to run
 * changes it. Shape previews redraw from this, Escape puts it back, and the
 * commit compares against it to find the tiles that changed.
 */
function clioPaintSnapshotPending() {
  const layer = clioPaintActiveLayer();
  if (!layer) return false;
  clioPaintState.pending = { layerId: layer.id, width: layer.doc.width, height: layer.doc.height, bits: layer.doc.bits.slice() };
  return true;
}

/** Put the layer back the way the operation found it. The pending copy stays. */
function clioPaintRestorePending() {
  const pending = clioPaintState.pending;
  if (!pending) return false;
  const layer = clioPaintLayerById(pending.layerId);
  if (layer) layer.doc.bits.set(pending.bits);
  // A floating region belongs to the operation being undone.
  clioPaintState.selection = null;
  clioPaintMarkChanged();
  return true;
}

/** Redraw a preview from the pending bitmap, leaving the snapshot in place. */
function clioPaintRepaintFromPending() {
  const pending = clioPaintState.pending;
  if (!pending) return false;
  const layer = clioPaintLayerById(pending.layerId);
  if (layer) layer.doc.bits.set(pending.bits);
  return true;
}

/**
 * Close the step a tool just finished: the tiles that differ from the pending
 * bitmap become the next snapshot, and the snapshot before it is what Undo
 * returns to, tagged with what the operation was. A click that changed
 * nothing — a fill on an area already that pattern — writes no step.
 */
function clioPaintCommitHistory(labelKey) {
  const pending = clioPaintState.pending;
  if (!pending) return false;
  clioPaintState.pending = null;
  const layer = clioPaintLayerById(pending.layerId);
  if (!layer) return false;
  const keys = clioPaintChangedTileKeys(pending.bits, layer.doc.bits, layer.doc.width, layer.doc.height);
  if (!keys.size) return false;
  clioPaintHistory().change(labelKey, () => {
    const previous = clioPaintState.snapshot;
    const record = previous.layers.find((entry) => entry.id === layer.id);
    if (!record) return;
    const next = clioPaintSnapshotReplaceLayer(previous, layer.id, { tiles: clioPaintDeriveTiles(record.tiles, layer.doc, keys) });
    clioPaintLinkSnapshots(previous, next);
    clioPaintState.snapshot = next;
  });
  clioPaintAfterEdit();
  return true;
}

function clioPaintAfterEdit() {
  clioPaintSyncDirtyFromSaved();
  syncClioPaintStatus();
  renderClioPaintLayers();
}

function clioPaintHistoryDepth() {
  const size = clioPaintHistory().size();
  return { past: size.undo, future: size.redo, weight: size.weight };
}

function clioPaintCanUndo() {
  return Boolean(clioPaintState.selection?.lifted) || clioPaintHistory().canUndo();
}

function clioPaintCanRedo() {
  return clioPaintHistory().canRedo();
}

// Edit > Undo / Redo reach the picture through the desk's Edit menu route:
// runEditCommand asks the window's registered history when no text field has
// the focus. The picture no longer claims ⌘Z in the capture phase.
registerEditHistory("clioPaint", {
  undo: undoClioPaint,
  redo: redoClioPaint,
  canUndo: clioPaintCanUndo,
  canRedo: clioPaintCanRedo,
  undoLabel: () => (clioPaintState.selection?.lifted ? (clioPaintState.selection.label || "clio_paint_op_move") : clioPaintHistory().undoLabel()),
  redoLabel: () => clioPaintHistory().redoLabel(),
});

/** Did Undo land back on the picture that is already saved? Say so. */
function clioPaintSyncDirtyFromSaved() {
  clioPaintState.dirty = Boolean(clioPaintState.selection?.lifted)
    || !clioPaintSnapshotsEqual(clioPaintState.snapshot, clioPaintState.savedSnapshot);
}

function clioPaintResetHistory() {
  clioPaintState.historyApi = null;
  clioPaintState.selection = null;
  clioPaintState.drawing = null;
  clioPaintState.polygon = null;
  clioPaintState.pending = null;
  clioPaintState.savedSnapshot = clioPaintState.snapshot;
}

function clioPaintToolLabelKey(tool) {
  return tool === "move" ? "clio_paint_op_move" : `clio_paint_tool_${clioPaintToolKeySuffix(tool)}`;
}

function clioPaintTravel(direction) {
  cancelClioPaintOperation({ quiet: true });
  const history = clioPaintHistory();
  const label = direction === "undo" ? history.undoLabel() : history.redoLabel();
  clioPaintState.selection = null;
  // Undo hands the state it leaves to Redo, so that is the end that is weighed.
  clioPaintWeighMode = direction === "undo" ? "newer" : "older";
  let moved = false;
  try {
    moved = history[direction]();
  } finally {
    clioPaintWeighMode = "older";
  }
  if (!moved) return false;
  clioPaintAfterEdit();
  setStatus(t(direction === "undo" ? "clio_paint_undid" : "clio_paint_redid", t(label)));
  return true;
}

function undoClioPaint() {
  cancelClioPaintOperation({ quiet: true });
  // A region still floating has not been written yet, so Undo takes it back.
  if (clioPaintCancelFloat({ quiet: true })) {
    setStatus(t("clio_paint_op_cancelled"));
    return true;
  }
  return clioPaintTravel("undo");
}

function redoClioPaint() {
  return clioPaintTravel("redo");
}

/**
 * Escape means "put it back", the way JS Paint's cancel() discards the state a
 * cancelled operation would have left behind: the pending bitmap returns and
 * no step is written, so a mis-drag costs nothing and leaves no trace in the
 * menu. An aborted move drops the marquee too — the pixels are back where they
 * started, so the selection that no longer describes anything goes with them.
 */
function cancelClioPaintOperation({ quiet = false } = {}) {
  const drawing = clioPaintState.drawing;
  const polygon = clioPaintState.polygon;
  if (!drawing && !polygon) return false;
  clioPaintStopSpray();
  const hadPixels = Boolean(clioPaintState.pending);
  const wasSelectionWork = drawing?.tool === "move" || drawing?.tool === "marquee" || drawing?.tool === "lasso";
  clioPaintRestorePending();
  clioPaintState.pending = null;
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
  if (!drawing || !clioPaintState.pending) return;
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
  if (!clioPaintEditable()) return;
  clioPaintSnapshotPending();
  clioPaintState.doc.bits.fill(0);
  clioPaintMarkChanged();
  // With layers, "everything" is the layer being drawn on.
  const key = clioPaintState.layers.length > 1 ? "clio_paint_erased_layer" : "clio_paint_erased_all";
  if (clioPaintCommitHistory("clio_paint_op_erase_all")) clioPaintFlash(t(key));
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
// A selection is one coverage mask (see clioPaintCombineSelection): the
// Select tool covers a rectangle and carries everything inside it, white
// included; the Lasso covers the outline drawn around it and carries only the
// ink, so it passes over whatever lies beneath. A new region replaces the old
// one, or combines with it while a modifier is held as it is begun: Shift
// adds, Option subtracts, Shift+Option keeps only where both are.
//
// The first move, nudge or effect lifts the region off the layer into a
// FLOAT that hangs above it. Until the float is put down the layer's bitmap
// is not touched: the view shows the layer with the float's source cut out and
// the float laid on top, and nothing has been written to history. It is put
// down by clicking outside it, pressing Return, or choosing another tool —
// that is the one step ("Move", or whichever effect came last) — and Escape
// takes it back as though it had never been lifted. While it is dragged it
// snaps to the page edges and centre and to the content of the other layers;
// holding Option during the drag turns the snapping off.

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
  return selection.cover[j * selection.w + i] === 1;
}

/** The polygon's coverage as a selection: ink only travels (no opaque white). */
function clioPaintLassoSelection(points, width, height) {
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  points.forEach((point) => { x0 = Math.min(x0, point.x); x1 = Math.max(x1, point.x); y0 = Math.min(y0, point.y); y1 = Math.max(y1, point.y); });
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(width - 1, Math.floor(x1)); y1 = Math.min(height - 1, Math.floor(y1));
  if (x1 < x0 || y1 < y0) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const path = points.map((point) => ({ x: point.x - x0, y: point.y - y0 }));
  const cover = new Uint8Array(w * h);
  let any = 0;
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      if (clioPaintPointInPolygon(path, i + 0.5, j + 0.5)) { cover[j * w + i] = 1; any = 1; }
    }
  }
  return any ? { x: x0, y: y0, w, h, cover, opaque: new Uint8Array(w * h) } : null;
}

/** Whether the pointer may change the active layer; if not, say why. */
function clioPaintEditable({ quiet = false } = {}) {
  const layer = clioPaintActiveLayer();
  if (!layer) return false;
  if (layer.locked) {
    if (!quiet) clioPaintFlash(t("clio_paint_layer_locked"));
    return false;
  }
  if (!layer.visible) {
    if (!quiet) clioPaintFlash(t("clio_paint_layer_hidden"));
    return false;
  }
  return true;
}

function clioPaintClearHole(doc, hole) {
  if (!hole) return;
  for (let j = 0; j < hole.h; j += 1) {
    for (let i = 0; i < hole.w; i += 1) {
      if (hole.mask[j * hole.w + i]) clioPaintSetBit(doc, hole.x + i, hole.y + j, 0);
    }
  }
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

/**
 * Take the region's pixels off the layer into the float. The layer itself is
 * left as it is: the hole where they came from is cut out at the end, with
 * the float's new place. With `copy` there is no hole — the Option-drag
 * duplicate. The first lift also takes the pending copy that Escape and the
 * step compare against; `keepPending` is for a lift made in the middle of a
 * float that already holds one.
 */
function clioPaintLiftSelection({ copy = false, keepPending = false } = {}) {
  const selection = clioPaintState.selection;
  if (!selection || selection.lifted) return selection;
  const layer = clioPaintActiveLayer();
  if (!layer) return selection;
  if (!keepPending || !clioPaintState.pending) clioPaintSnapshotPending();
  const { w, h } = selection;
  const bits = new Uint8Array(w * h);
  const mask = new Uint8Array(w * h);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const k = j * w + i;
      if (!selection.cover[k]) continue;
      const value = clioPaintGetBit(layer.doc, selection.x + i, selection.y + j);
      if (!selection.opaque[k] && !value) continue;
      mask[k] = 1;
      bits[k] = value;
    }
  }
  Object.assign(selection, {
    lifted: true,
    layerId: layer.id,
    bits,
    mask,
    hole: copy ? null : { x: selection.x, y: selection.y, w, h, mask: mask.slice() },
    label: selection.label || "clio_paint_op_move",
  });
  clioPaintMarkChanged();
  clioPaintSyncDirtyFromSaved();
  syncClioPaintStatus();
  return selection;
}

/** The layer as the window draws it: with a float, its source cut out and the float on top. */
function clioPaintViewBits(layer) {
  const selection = clioPaintState.selection;
  if (!selection?.lifted || selection.layerId !== layer.id) return layer.doc.bits;
  const view = { width: layer.doc.width, height: layer.doc.height, bits: layer.doc.bits.slice() };
  clioPaintClearHole(view, selection.hole);
  clioPaintStampSelectionInto(view, selection);
  return view.bits;
}

/**
 * Put the float down: cut the hole, lay the float over the layer, and write
 * the one step. A float put down exactly where it came from changes nothing
 * and writes nothing.
 */
function clioPaintDropSelection() {
  const selection = clioPaintState.selection;
  if (!selection) return;
  clioPaintState.selection = null;
  if (selection.lifted) {
    const layer = clioPaintLayerById(selection.layerId);
    if (layer) {
      clioPaintClearHole(layer.doc, selection.hole);
      clioPaintStampSelectionInto(layer.doc, selection);
    }
    if (!clioPaintCommitHistory(selection.label || "clio_paint_op_move")) clioPaintSyncDirtyFromSaved();
  }
  const { viewport } = clioPaintElements();
  if (viewport) viewport.dataset.clioPaintSelection = "";
  clioPaintMarkChanged();
  syncClioPaintStatus();
  if (typeof updateMenuState === "function") updateMenuState();
}

/** Escape on a float: the layer goes back to what it was before the region was lifted. */
function clioPaintCancelFloat({ quiet = false } = {}) {
  const selection = clioPaintState.selection;
  if (!selection?.lifted) return false;
  clioPaintRestorePending();
  clioPaintState.pending = null;
  clioPaintState.selection = null;
  const { viewport } = clioPaintElements();
  if (viewport) viewport.dataset.clioPaintSelection = "";
  clioPaintSyncDirtyFromSaved();
  syncClioPaintStatus();
  requestClioPaintRender();
  if (typeof updateMenuState === "function") updateMenuState();
  if (!quiet) setStatus(t("clio_paint_op_cancelled"));
  return true;
}

function clioPaintSetSelection(selection) {
  clioPaintState.selection = selection ? { ...selection, lifted: false } : null;
  clioPaintState.ants = 0;
  requestClioPaintRender();
  if (typeof updateMenuState === "function") updateMenuState();
}

function clioPaintBeginMarquee(point, mode = "replace") {
  const base = mode !== "replace" && clioPaintState.selection && !clioPaintState.selection.lifted ? clioPaintState.selection : null;
  clioPaintDropSelection();
  clioPaintState.drawing = { tool: "marquee", start: point, current: point, constrain: false, mode, base };
  clioPaintState.selection = base;
  requestClioPaintRender();
}

function clioPaintUpdateMarquee(point, constrain) {
  const drawing = clioPaintState.drawing;
  if (!drawing || drawing.tool !== "marquee") return;
  // Shift at the press means "add", so it only squares the marquee when it is
  // pressed after the drag has begun.
  if (constrain !== undefined) drawing.constrain = constrain === true && drawing.mode === "replace";
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
    // A click with no drag selects nothing; with a modifier it leaves the old region alone.
    clioPaintSetSelection(drawing.mode === "replace" ? null : drawing.base);
    return;
  }
  clioPaintSetSelection(clioPaintCombineSelection(drawing.base, clioPaintRectSelection(x0, y0, x1 - x0 + 1, y1 - y0 + 1), drawing.mode));
}

function clioPaintBeginLasso(point, mode = "replace") {
  const base = mode !== "replace" && clioPaintState.selection && !clioPaintState.selection.lifted ? clioPaintState.selection : null;
  clioPaintDropSelection();
  clioPaintState.drawing = { tool: "lasso", points: [point], mode, base };
  clioPaintState.selection = base;
  requestClioPaintRender();
}

function clioPaintEndLasso() {
  const drawing = clioPaintState.drawing;
  clioPaintState.drawing = null;
  if (!drawing || drawing.points.length < 3) {
    clioPaintSetSelection(drawing && drawing.mode !== "replace" ? drawing.base : null);
    return;
  }
  clioPaintSetLassoSelection(drawing.points, drawing.mode, drawing.base);
}

function clioPaintSetLassoSelection(points, mode = "replace", base = null) {
  const doc = clioPaintState.doc;
  const lasso = clioPaintLassoSelection(points, doc.width, doc.height);
  clioPaintSetSelection(clioPaintCombineSelection(base, lasso, mode));
}

/**
 * The snapper a float is dragged with: the page edges and centre, and the
 * content box of every other layer that has any ink.
 */
function clioPaintMoveSnapper() {
  const create = window.AISystem6EditSnap?.createSnapper;
  const doc = clioPaintState.doc;
  if (typeof create !== "function" || !doc) return null;
  const rects = [];
  clioPaintState.layers.forEach((layer) => {
    if (layer.id === clioPaintState.activeLayerId) return;
    const bounds = clioPaintInkBounds(layer.doc);
    if (bounds) rects.push({ id: layer.id, ...bounds });
  });
  return create({ rects, frame: { x: 0, y: 0, w: doc.width, h: doc.height }, threshold: Math.max(1, Math.round(6 / clioPaintState.zoom)) });
}

/**
 * Dragging from inside a selection moves those pixels instead of starting a
 * new one: the region is lifted into a float, follows the pointer, and stays
 * a float when the drag ends. JS Paint's selection is the same kind of object
 * — a floating canvas dragged from inside itself — and this is the half of it
 * that a sketch pad actually needs, since placing a box in the right spot is
 * most of sketching. With Option held the drag leaves a copy behind.
 */
function clioPaintBeginSelectionDrag(point) {
  if (!clioPaintPointInSelection(point)) return false;
  // On a locked or hidden layer the press is still the selection's: it just
  // cannot pick it up, and must not start a second marquee over it.
  if (!clioPaintEditable()) return true;
  const duplicate = clioPaintState.duplicateOnDrag === true;
  const selection = clioPaintState.selection;
  if (duplicate && selection.lifted) {
    // Leave a copy where the float is, then lift a fresh copy off it.
    const layer = clioPaintLayerById(selection.layerId);
    if (layer) {
      clioPaintClearHole(layer.doc, selection.hole);
      clioPaintStampSelectionInto(layer.doc, selection);
    }
    selection.lifted = false;
    selection.hole = null;
  }
  clioPaintLiftSelection({ copy: duplicate, keepPending: true });
  selection.label = duplicate ? "clio_paint_op_duplicate" : "clio_paint_op_move";
  clioPaintState.drawing = {
    tool: "move",
    start: point,
    origin: { x: selection.x, y: selection.y },
    duplicate,
    snapper: clioPaintMoveSnapper(),
    guides: [],
  };
  return true;
}

function clioPaintDragSelection(point, snapOff = false) {
  const drawing = clioPaintState.drawing;
  const selection = clioPaintState.selection;
  if (!drawing || drawing.tool !== "move" || !selection) return;
  let x = drawing.origin.x + (point.x - drawing.start.x);
  let y = drawing.origin.y + (point.y - drawing.start.y);
  drawing.guides = [];
  if (drawing.snapper) {
    const snapped = drawing.snapper.snap({ x, y, w: selection.w, h: selection.h }, { disabled: snapOff === true });
    x = Math.round(snapped.x);
    y = Math.round(snapped.y);
    drawing.guides = snapped.guides;
  }
  selection.x = x;
  selection.y = y;
  clioPaintMarkChanged();
  const { statusLabel } = clioPaintElements();
  if (statusLabel) statusLabel.textContent = `${t("clio_paint_op_move")}  ${t("clio_paint_offset", selection.x - drawing.origin.x, selection.y - drawing.origin.y)}`;
  requestClioPaintRender();
}

/** The drag ends; the float stays up until it is put down. */
function clioPaintEndSelectionDrag() {
  const drawing = clioPaintState.drawing;
  if (!drawing || drawing.tool !== "move") return;
  clioPaintState.drawing = null;
  showClioPaintInfo();
  requestClioPaintRender();
}

/**
 * The same move one pixel at a time, for placing a box exactly. It is the
 * same float, so a run of arrows and the drop after it are one step.
 */
function clioPaintNudgeSelection(dx, dy) {
  const selection = clioPaintState.selection;
  if (!selection || selection.w <= 0 || selection.h <= 0) return false;
  if (!clioPaintEditable()) return true;
  clioPaintLiftSelection();
  selection.x += dx;
  selection.y += dy;
  clioPaintMarkChanged();
  requestClioPaintRender();
  return true;
}

function clearClioPaintSelection() {
  const selection = clioPaintState.selection;
  if (!selection) return;
  if (!clioPaintEditable()) return;
  if (selection.lifted) {
    // The float is thrown away and the hole it left stays cut.
    const layer = clioPaintLayerById(selection.layerId);
    if (layer) clioPaintClearHole(layer.doc, selection.hole);
  } else {
    clioPaintSnapshotPending();
    const doc = clioPaintState.doc;
    for (let j = 0; j < selection.h; j += 1) {
      for (let i = 0; i < selection.w; i += 1) {
        if (selection.cover[j * selection.w + i]) clioPaintSetBit(doc, selection.x + i, selection.y + j, 0);
      }
    }
  }
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
    clioPaintSetSelection(clioPaintRectSelection(0, 0, doc.width, doc.height));
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

/** Turn every per-cell array of a selection through one cell remap (flip, grow). */
function clioPaintRemapSelection(selection, w, h, place) {
  const next = {};
  ["cover", "opaque", "bits", "mask"].forEach((name) => { next[name] = new Uint8Array(w * h); });
  for (let j = 0; j < selection.h; j += 1) {
    for (let i = 0; i < selection.w; i += 1) {
      const target = place(i, j);
      ["cover", "opaque", "bits", "mask"].forEach((name) => { next[name][target] = selection[name][j * selection.w + i]; });
    }
  }
  return next;
}

// The Edit menu's picture commands. Each works on the selection as it floats,
// so a region can be flipped and then moved, or inverted twice, and the whole
// float is one step that Undo takes back (or Escape never writes).
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
      Object.assign(selection, clioPaintRemapSelection(selection, w, h, (i, j) => j * w + (w - 1 - i)));
    },
  },
  "flip-vertical": {
    labelKey: "clio_paint_op_flip_vertical",
    apply(selection) {
      const { w, h } = selection;
      Object.assign(selection, clioPaintRemapSelection(selection, w, h, (i, j) => (h - 1 - j) * w + i));
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
      const grown = clioPaintRemapSelection(selection, w, h, (i, j) => (j + 1) * w + i + 1);
      const bits = new Uint8Array(w * h);
      const mask = new Uint8Array(w * h);
      for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) {
        const k = j * w + i;
        if (source[k]) {
          // The blot itself is replaced by its outline; where the region
          // carried white, that white stays and hollows it out.
          if (grown.opaque[k]) mask[k] = 1;
          continue;
        }
        let edge = false;
        for (let b = -1; b <= 1 && !edge; b += 1) for (let a = -1; a <= 1; a += 1) {
          const x = i + a;
          const y = j + b;
          if (x >= 0 && y >= 0 && x < w && y < h && source[y * w + x]) { edge = true; break; }
        }
        if (edge) { bits[k] = 1; mask[k] = 1; grown.cover[k] = 1; } else if (grown.opaque[k]) mask[k] = 1;
      }
      Object.assign(selection, { x: selection.x - 1, y: selection.y - 1, w, h, cover: grown.cover, opaque: grown.opaque, bits, mask });
    },
  },
  "fill-selection": {
    labelKey: "clio_paint_op_fill_selection",
    apply(selection) {
      for (let j = 0; j < selection.h; j += 1) for (let i = 0; i < selection.w; i += 1) {
        const k = j * selection.w + i;
        if (selection.cover[k]) selection.mask[k] = 1;
        if (selection.mask[k]) selection.bits[k] = clioPaintPatternAt(selection.x + i, selection.y + j);
      }
    },
  },
};

function applyClioPaintSelectionEffect(name) {
  const effect = CLIO_PAINT_SELECTION_EFFECTS[name];
  if (!effect || !clioPaintState.selection) return false;
  if (!clioPaintEditable()) return false;
  const selection = clioPaintLiftSelection();
  effect.apply(selection);
  selection.label = effect.labelKey;
  clioPaintState.ants = 0;
  clioPaintMarkChanged();
  clioPaintSyncDirtyFromSaved();
  syncClioPaintStatus();
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
  if (!clioPaintEditable()) return;
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

// The hidden canvas holds the PICTURE: every shown ink layer on white, nothing
// else, because that is the canvas a save, a read and an export all encode. The
// guides (tracing layers) are drawn on a second canvas that only the view uses.
let clioPaintTraceCanvas = null;

function clioPaintRefreshDocumentCanvas() {
  const { canvas } = clioPaintElements();
  const ctx = canvas?.getContext?.("2d");
  const doc = clioPaintState.doc;
  if (!canvas || !ctx || !doc) return false;
  if (canvas.width !== doc.width) canvas.width = doc.width;
  if (canvas.height !== doc.height) canvas.height = doc.height;
  const { ink, trace } = clioPaintComposite(clioPaintState.layers.map((layer) => ({ kind: layer.kind, visible: layer.visible, bits: clioPaintViewBits(layer) })));
  const imageData = ctx.createImageData(doc.width, doc.height);
  clioPaintApplyPackedBits(imageData, ink || new Uint8Array(Math.ceil((doc.width * doc.height) / 8)));
  ctx.putImageData(imageData, 0, 0);
  clioPaintState.traceShown = false;
  if (trace && typeof document !== "undefined") {
    if (!clioPaintTraceCanvas) clioPaintTraceCanvas = document.createElement("canvas");
    clioPaintTraceCanvas.width = doc.width;
    clioPaintTraceCanvas.height = doc.height;
    const traceCtx = clioPaintTraceCanvas.getContext("2d");
    if (traceCtx) {
      const guide = traceCtx.createImageData(doc.width, doc.height);
      const total = doc.width * doc.height;
      // A guide is ink at about a third of its strength, on nothing.
      for (let pixel = 0; pixel < total; pixel += 1) {
        if (trace[pixel >> 3] & (128 >> (pixel & 7))) guide.data[pixel * 4 + 3] = 90;
      }
      traceCtx.putImageData(guide, 0, 0);
      clioPaintState.traceShown = true;
    }
  }
  clioPaintState.docStale = false;
  return true;
}

function renderClioPaintView() {
  const { viewport, view, canvas, root } = clioPaintElements();
  if (!viewport || !view || !canvas || root?.classList.contains("is-hidden")) return;
  const ctx = view.getContext?.("2d");
  if (!ctx) return;
  if (clioPaintState.docStale) clioPaintRefreshDocumentCanvas();
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
  const guides = clioPaintState.traceShown && clioPaintTraceCanvas;
  if (guides) {
    // Guides sit under the picture: paper, then the guides, then the ink
    // multiplied over both, so white lets a guide through and black stays black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(origin.x, origin.y, page.width, page.height);
    ctx.drawImage(clioPaintTraceCanvas, origin.x, origin.y, page.width, page.height);
    ctx.globalCompositeOperation = "multiply";
  }
  ctx.drawImage(canvas, origin.x, origin.y, page.width, page.height);
  ctx.globalCompositeOperation = "source-over";
  const selection = clioPaintState.selection;
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
  if (drawing?.tool === "move" && drawing.guides?.length) clioPaintDrawGuides(ctx, origin, zoom, page, drawing.guides);
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
/**
 * The outline of a selection's coverage as unit segments in its own cells,
 * merged into runs. A rectangle needs none. Worked out once per mask, because
 * the marching ants ask for it several times a second.
 */
function clioPaintSelectionSegments(selection) {
  if (!selection?.cover) return null;
  if (selection.outlineFor === selection.cover) return selection.outline;
  const { w, h, cover } = selection;
  let full = true;
  for (let k = 0; k < cover.length; k += 1) if (!cover[k]) { full = false; break; }
  let segments = null;
  if (!full) {
    segments = [];
    const at = (i, j) => (i >= 0 && j >= 0 && i < w && j < h ? cover[j * w + i] : 0);
    for (let j = 0; j <= h; j += 1) {
      let start = -1;
      for (let i = 0; i <= w; i += 1) {
        const edge = i < w && at(i, j - 1) !== at(i, j);
        if (edge && start < 0) start = i;
        if (!edge && start >= 0) { segments.push([start, j, i, j]); start = -1; }
      }
    }
    for (let i = 0; i <= w; i += 1) {
      let start = -1;
      for (let j = 0; j <= h; j += 1) {
        const edge = j < h && at(i - 1, j) !== at(i, j);
        if (edge && start < 0) start = j;
        if (!edge && start >= 0) { segments.push([i, start, i, j]); start = -1; }
      }
    }
  }
  selection.outlineFor = cover;
  selection.outline = segments;
  return segments;
}

function clioPaintDrawAnts(ctx, origin, zoom, region) {
  ctx.save();
  ctx.lineWidth = 1;
  const segments = clioPaintSelectionSegments(region);
  const trace = () => {
    ctx.beginPath();
    if (segments) {
      segments.forEach(([x0, y0, x1, y1]) => {
        ctx.moveTo(Math.round(origin.x + (region.x + x0) * zoom) + 0.5, Math.round(origin.y + (region.y + y0) * zoom) + 0.5);
        ctx.lineTo(Math.round(origin.x + (region.x + x1) * zoom) + 0.5, Math.round(origin.y + (region.y + y1) * zoom) + 0.5);
      });
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

/** The lines a float has snapped to while it is dragged: the page edges and centre, other layers' content. */
function clioPaintDrawGuides(ctx, origin, zoom, page, guides) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = "#000";
  guides.forEach((guide) => {
    ctx.beginPath();
    if (guide.axis === "x") {
      const x = Math.round(origin.x + guide.at * zoom) + 0.5;
      ctx.moveTo(x, origin.y);
      ctx.lineTo(x, origin.y + page.height);
    } else {
      const y = Math.round(origin.y + guide.at * zoom) + 0.5;
      ctx.moveTo(origin.x, y);
      ctx.lineTo(origin.x + page.width, y);
    }
    ctx.stroke();
  });
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
    // Shift adds to the region, Option subtracts, both keep only the overlap;
    // Shift is a combine key here, so a press that wants to MOVE the region
    // carries no Shift (Option alone inside it is the copy-drag).
    const mode = clioPaintSelectionMode(event.shiftKey, event.altKey);
    const moves = !event.shiftKey && clioPaintBeginSelectionDrag(point);
    if (moves) return;
    if (tool === "marquee") clioPaintBeginMarquee(point, mode);
    else clioPaintBeginLasso(point, mode);
    return;
  }
  // Every other tool changes the active layer, so it has to be one that may be
  // changed: not locked, and not hidden where the ink would go unseen.
  if (tool !== "text" && !clioPaintEditable()) return;
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
    clioPaintDragSelection(point, event.altKey);
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
    clioPaintState.pending = null;
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
  // an open popover, then a floating selection (the layer returns to what it
  // was before the region was lifted), then the selection itself.
  if (event.key === "Escape") {
    if (cancelClioPaintOperation()) event.preventDefault();
    else if (closeClioPaintPopover()) event.preventDefault();
    else if (clioPaintCancelFloat()) event.preventDefault();
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
  // Return puts a floating selection down where it is.
  if (event.key === "Enter" && clioPaintState.selection?.lifted) {
    event.preventDefault();
    clioPaintDropSelection();
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
 * ⌘S and ⌘A mean the picture while it is in front, so the window claims them
 * itself, in the capture phase: the desk's shortcut dispatcher is a
 * bubble-phase listener on this same document, and claiming the event
 * (preventDefault) is what stops it from also answering. ⌘Z / ⇧⌘Z are NOT
 * claimed here any more: Undo and Redo arrive through the desk's Edit menu
 * route, which asks the history this window registered (registerEditHistory),
 * and a text field being typed in (the Text tool's input) keeps its own undo.
 */
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

// --- Layers: the panel and its commands --------------------------------------
//
// Every change to the stack goes through clioPaintEditLayers: it derives the
// next snapshot from the last, shows it, and records one step, so adding,
// deleting, duplicating, merging, restacking, renaming, showing and locking
// are all things Undo takes back. Choosing which layer is active is not an
// edit and records nothing.

/**
 * @param {string} labelKey the step's name in the Edit menu
 * @param {(snapshot: any) => ({ snapshot: any, active?: string } | null)} derive
 */
function clioPaintEditLayers(labelKey, derive) {
  cancelClioPaintOperation({ quiet: true });
  clioPaintDropSelection();
  let changed = false;
  clioPaintHistory().change(labelKey, () => {
    const previous = clioPaintState.snapshot;
    const result = derive(previous);
    if (!result?.snapshot || result.snapshot === previous) return;
    clioPaintLinkSnapshots(previous, result.snapshot);
    if (result.active) clioPaintState.activeLayerId = result.active;
    clioPaintShowSnapshot(result.snapshot);
    changed = true;
  });
  if (changed) clioPaintAfterEdit();
  return changed;
}

function selectClioPaintLayer(id) {
  if (!clioPaintLayerById(id) || id === clioPaintState.activeLayerId) return false;
  // A floating region belongs to the layer it was lifted from.
  cancelClioPaintOperation({ quiet: true });
  clioPaintDropSelection();
  clioPaintState.activeLayerId = id;
  syncClioPaintStatus();
  renderClioPaintLayers();
  return true;
}

// ---- Round trips (app/core/edit-embeds.js) ----------------------------------
// A picture from the Picture Album becomes a tracing layer to draw over; the
// sketch goes to ClioStage as a picture that is also an editable copy; and a
// slide's sketch opens here as that copy, every step redrawing the slide.

async function traceClioPaintPicture(record) {
  const doc = clioPaintState.doc;
  const source = record?.originalDataUrl || record?.previewDataUrl || "";
  const bits = source ? await clioPaintDecodeLayerBits(source, doc.width, doc.height) : null;
  if (!bits) {
    clioPaintFlash(t("clio_paint_trace_failed"));
    return false;
  }
  const id = clioPaintNewLayerId();
  const name = String(record.name || clioPaintDefaultLayerName("tracing")).replace(/\.[^.]+$/, "").slice(0, 40);
  const done = clioPaintEditLayers("clio_paint_op_layer_add_tracing", (snapshot) => ({
    snapshot: clioPaintSnapshotInsertLayer(snapshot, clioPaintLayerRecord({ id, name, kind: "tracing", tiles: clioPaintTilesOfDoc({ width: doc.width, height: doc.height, bits }) }), 0),
    active: clioPaintState.activeLayerId,
  }));
  if (done) setStatus(t("clio_paint_traced", name));
  return done;
}

// The picture as other apps see it: the shown ink layers, black on white.
function clioPaintCompositeDataUrl() {
  const doc = clioPaintState.doc;
  const { ink } = clioPaintComposite(clioPaintState.layers.map((layer) => ({ kind: layer.kind, visible: layer.visible, bits: layer.doc.bits })));
  return clioPaintBitmapDataUrl({ width: doc.width, height: doc.height, bits: ink || new Uint8Array(doc.width * doc.height) });
}

let clioPaintEmbedTimer = 0;
function clioPaintNotifyEmbed() {
  if (!clioPaintState.embedOwner) return;
  window.clearTimeout(clioPaintEmbedTimer);
  clioPaintEmbedTimer = window.setTimeout(() => {
    const owner = clioPaintState.embedOwner;
    if (owner) owner({ png: clioPaintCompositeDataUrl() });
  }, 250);
}

async function editClioPaintEmbed(data, { onChange } = {}) {
  await openWindow("clioPaint");
  if (!data?.png || !(await loadClioPaintRecord({ id: "", originalDataUrl: data.png }))) return false;
  clioPaintState.attachmentId = "";
  clioPaintState.embedOwner = typeof onChange === "function" ? onChange : null;
  setStatus(t("clio_paint_embed_opened"));
  return true;
}

async function sendClioPaintToStage() {
  const embeds = window.AISystem6EditEmbeds;
  if (!embeds || typeof ensureClioStageModule !== "function") return false;
  const png = clioPaintCompositeDataUrl();
  const record = clioPaintState.attachmentId ? imageAttachmentById(clioPaintState.attachmentId) : null;
  // A saved picture is the copy's original; an unsaved one has none.
  const source = record && !clioPaintState.dirty ? { app: "clioPaint", fileId: record.id, rev: embeds.contentRev(record.originalDataUrl || "") } : null;
  const title = record?.name ? String(record.name).replace(/\.[^.]+$/, "") : t("clio_paint_label");
  await ensureClioStageModule();
  if (window.AISystem6ClioStage?.confirmDiscard && !(await window.AISystem6ClioStage.confirmDiscard())) return false;
  return !!(await window.AISystem6ClioStage?.open?.({
    title,
    sourceKind: "generated",
    temporary: true,
    markdown: ["---", "marp: true", "theme: default", "paginate: true", "size: 16:9", "---", "", "<!-- _class: evidence light -->", "", `## ${title}`, "",
      embeds.embedMarkdown({ kind: "sketch", alt: title, png, data: { png: record && !clioPaintState.dirty ? record.originalDataUrl : png }, source })].join("\n"),
  }));
}

function addClioPaintLayer(kind = "ink") {
  const id = clioPaintNewLayerId();
  const name = clioPaintDefaultLayerName(kind);
  return clioPaintEditLayers(kind === "tracing" ? "clio_paint_op_layer_add_tracing" : "clio_paint_op_layer_add", (snapshot) => ({
    snapshot: clioPaintSnapshotInsertLayer(snapshot, clioPaintLayerRecord({ id, name, kind }), clioPaintSnapshotIndex(snapshot, clioPaintState.activeLayerId) + 1),
    active: id,
  }));
}

function deleteClioPaintLayer(id = clioPaintState.activeLayerId) {
  if (clioPaintState.layers.length < 2) {
    clioPaintFlash(t("clio_paint_layer_last"));
    return false;
  }
  return clioPaintEditLayers("clio_paint_op_layer_delete", (snapshot) => {
    const next = clioPaintSnapshotRemoveLayer(snapshot, id);
    if (!next) return null;
    const index = clioPaintSnapshotIndex(snapshot, id);
    return { snapshot: next, active: (next.layers[Math.max(0, index - 1)] || next.layers[0]).id };
  });
}

function duplicateClioPaintLayer(id = clioPaintState.activeLayerId) {
  const copyId = clioPaintNewLayerId();
  return clioPaintEditLayers("clio_paint_op_layer_duplicate", (snapshot) => {
    const source = snapshot.layers.find((layer) => layer.id === id);
    if (!source) return null;
    const next = clioPaintSnapshotDuplicateLayer(snapshot, id, copyId, t("clio_paint_layer_copy_name", source.name));
    return next ? { snapshot: next, active: copyId } : null;
  });
}

function mergeClioPaintLayerDown(id = clioPaintState.activeLayerId) {
  const merged = clioPaintEditLayers("clio_paint_op_layer_merge", (snapshot) => {
    const next = clioPaintSnapshotMergeDown(snapshot, id);
    if (!next) return null;
    const index = clioPaintSnapshotIndex(snapshot, id);
    return { snapshot: next, active: snapshot.layers[index - 1].id };
  });
  if (!merged) clioPaintFlash(t("clio_paint_layer_cannot_merge"));
  return merged;
}

function moveClioPaintLayer(id, toIndex) {
  return clioPaintEditLayers("clio_paint_op_layer_reorder", (snapshot) => ({ snapshot: clioPaintSnapshotMoveLayer(snapshot, id, toIndex) }));
}

function stepClioPaintLayer(direction) {
  const index = clioPaintState.layers.findIndex((layer) => layer.id === clioPaintState.activeLayerId);
  if (index < 0) return false;
  return moveClioPaintLayer(clioPaintState.activeLayerId, index + direction);
}

function renameClioPaintLayer(id, name) {
  const clean = String(name || "").trim();
  if (!clean) return false;
  return clioPaintEditLayers("clio_paint_op_layer_rename", (snapshot) => ({ snapshot: clioPaintSnapshotReplaceLayer(snapshot, id, { name: clean }) }));
}

function toggleClioPaintLayerFlag(id, flag) {
  const layer = clioPaintLayerById(id);
  if (!layer) return false;
  if (flag === "locked") {
    return clioPaintEditLayers(layer.locked ? "clio_paint_op_layer_unlock" : "clio_paint_op_layer_lock", (snapshot) => ({ snapshot: clioPaintSnapshotReplaceLayer(snapshot, id, { locked: !layer.locked }) }));
  }
  return clioPaintEditLayers(layer.visible ? "clio_paint_op_layer_hide" : "clio_paint_op_layer_show", (snapshot) => ({ snapshot: clioPaintSnapshotReplaceLayer(snapshot, id, { visible: !layer.visible }) }));
}

/** Turn the active layer into a tracing guide, or back into ink. */
function toggleClioPaintLayerTracing(id = clioPaintState.activeLayerId) {
  const layer = clioPaintLayerById(id);
  if (!layer) return false;
  return clioPaintEditLayers("clio_paint_op_layer_tracing", (snapshot) => ({
    snapshot: clioPaintSnapshotReplaceLayer(snapshot, id, { kind: layer.kind === "tracing" ? "ink" : "tracing" }),
  }));
}

let clioPaintLayersPanel = null;

/** The layers as the panel lists them: top of the stack first. */
function clioPaintLayerItems() {
  return clioPaintState.layers.slice().reverse().map((layer) => ({
    id: layer.id,
    name: layer.name,
    hidden: !layer.visible,
    locked: layer.locked,
    tag: layer.kind === "tracing" ? "tracing" : "",
  }));
}

function renderClioPaintLayers() {
  if (typeof document === "undefined") return;
  const { layersHost } = clioPaintElements();
  const kit = window.AISystem6EditLayers;
  if (!layersHost || !kit) return;
  if (!clioPaintLayersPanel || clioPaintLayersPanel.host !== layersHost) {
    layersHost.replaceChildren();
    clioPaintLayersPanel = {
      host: layersHost,
      panel: kit.createLayersPanel({
        host: layersHost,
        label: t("clio_paint_layers_label"),
        items: clioPaintLayerItems,
        selection: () => [clioPaintState.activeLayerId],
        onSelect: (ids) => { if (ids[ids.length - 1]) selectClioPaintLayer(ids[ids.length - 1]); },
        onToggle: (id, flag) => toggleClioPaintLayerFlag(id, flag),
        onRename: (id, name) => renameClioPaintLayer(id, name),
        // The panel counts from the top; the stack counts from the bottom.
        onReorder: (id, toIndex) => moveClioPaintLayer(id, clioPaintState.layers.length - 1 - toIndex),
      }),
    };
  } else {
    clioPaintLayersPanel.panel.render();
  }
  syncClioPaintLayerButtons();
}

function syncClioPaintLayerButtons() {
  const { root } = clioPaintElements();
  if (!root) return;
  root.querySelectorAll(".clio-paint-layers-actions [data-action]").forEach((button) => {
    const availability = clioPaintCommandAvailability(button.dataset.action, { ignoreWindow: true });
    button.disabled = !availability.available;
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
    // The empty-history grey already explains itself in title/copy; route the
    // same reason through the shared shell so a tap on touch answers too.
    if (typeof markGrayAffordance === "function") {
      markGrayAffordance(button, !canRun, control.emptyKey);
    } else {
      button.disabled = !canRun;
      if (!canRun) button.dataset.balloonHelpDisabled = control.emptyKey;
      else delete button.dataset.balloonHelpDisabled;
    }
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

/** One layer as a transparent PNG: black where there is ink, nothing elsewhere. */
function clioPaintLayerBlob(layer) {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") { reject(new Error("clio_paint_encode_failed")); return; }
    const canvas = document.createElement("canvas");
    canvas.width = layer.width;
    canvas.height = layer.height;
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof canvas.toBlob !== "function") { reject(new Error("clio_paint_encode_failed")); return; }
    const image = ctx.createImageData(layer.width, layer.height);
    const total = layer.width * layer.height;
    for (let pixel = 0; pixel < total; pixel += 1) {
      if (layer.bits[pixel >> 3] & (128 >> (pixel & 7))) image.data[pixel * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("clio_paint_encode_failed"))), "image/png");
  });
}

/**
 * Save the picture. The record the Picture Album and the other apps see is
 * the composite (the shown ink layers on white — never a tracing layer); each
 * layer is its own record beside it, in one group named for the picture. The
 * layers are written as staged working pictures first and kept once the
 * composite is in, so a save that fails halfway leaves nothing in the album.
 */
async function saveClioPaintPicture() {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return false;
  }
  clioPaintFlattenForExport();
  const assets = window.AISystem6EditAssets;
  const snapshot = clioPaintState.snapshot;
  const layers = clioPaintState.layers.map((layer) => ({
    id: layer.id, name: layer.name, kind: layer.kind, visible: layer.visible, locked: layer.locked,
    width: layer.doc.width, height: layer.doc.height, bits: layer.doc.bits.slice(),
  }));
  let blob;
  let layerBlobs;
  try {
    blob = await clioPaintCanvasBlob();
    layerBlobs = await Promise.all(layers.map(clioPaintLayerBlob));
  } catch {
    setStatus(t("clio_paint_no_picture"));
    return false;
  }
  const file = new File([blob], "ClioPaint.png", { type: "image/png" });
  const built = await buildImageAttachments([file], { projectId: project.id, surface: "clioPaint", limit: 1 });
  const record = built[0];
  if (!record) return false;
  if (clioPaintState.attachmentId) record.id = clioPaintState.attachmentId;
  const pictureId = record.id;
  const parts = [];
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    const layerFile = new File([layerBlobs[index]], `${layer.name || "Layer"}.png`, { type: "image/png" });
    const [layerRecord] = await buildImageAttachments([layerFile], { projectId: project.id, surface: "clioPaint", limit: 1 });
    if (!layerRecord) return false;
    layerRecord.id = layer.id;
    layerRecord.layer = { name: layer.name, kind: layer.kind, visible: layer.visible, locked: layer.locked };
    parts.push(assets.stageAsset(layerRecord, {
      app: "clioPaint", fileId: pictureId, group: pictureId, role: layer.kind === "tracing" ? "sketch-tracing" : "sketch-layer", order: index,
    }));
  }
  const composite = assets.stageAsset(record, { app: "clioPaint", fileId: pictureId, group: pictureId, role: "sketch-composite", order: layers.length });
  // Everything is built; what follows is synchronous, so no half-saved picture
  // is ever visible to the rest of the desk.
  assets.saveStaged([...parts, composite]);
  assets.keepAssetGroup(pictureId, pictureId);
  const live = new Set(layers.map((layer) => layer.id));
  assets.groupOf(pictureId)
    .filter((entry) => (entry.role === "sketch-layer" || entry.role === "sketch-tracing") && !live.has(entry.id))
    .forEach((entry) => removeImageAttachment(entry.id));
  clioPaintState.attachmentId = pictureId;
  clioPaintState.projectId = project.id;
  // The picture on disk is now this picture, so undo can land back on it.
  clioPaintState.savedSnapshot = snapshot;
  clioPaintSyncDirtyFromSaved();
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

/** A layer picture decoded back into packed bits at the picture's size, or null. */
function clioPaintDecodeLayerBits(dataUrl, width, height) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof document === "undefined") { resolve(null); return; }
    const image = new Image();
    image.onload = () => {
      const scratch = document.createElement("canvas");
      scratch.width = width;
      scratch.height = height;
      const ctx = scratch.getContext("2d", { willReadFrequently: true });
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(image, 0, 0, width, height);
      resolve(clioPaintPackImageData(ctx.getImageData(0, 0, width, height)));
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

/**
 * Open a saved picture at the size it was saved at. Drawing it into whatever
 * size the canvas happened to be would stretch a 576x720 page into a 480x300
 * strip — so the canvas takes the picture's size, not the other way round.
 * A picture saved with layers opens as those layers; one saved before layers
 * existed (a single PNG, no group) opens as one layer holding all of it.
 */
function loadClioPaintRecord(record) {
  const { canvas } = clioPaintElements();
  const ctx = canvas?.getContext?.("2d", { willReadFrequently: true });
  if (!canvas || !ctx || !record) return Promise.resolve(false);
  const dataUrl = record.originalDataUrl || record.previewDataUrl || "";
  if (!dataUrl) return Promise.resolve(false);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = async () => {
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
      const flat = clioPaintPackImageData(ctx.getImageData(0, 0, width, height));
      let entries = [];
      const parts = (window.AISystem6EditAssets?.groupOf(record.id) || [])
        .filter((part) => part.role === "sketch-layer" || part.role === "sketch-tracing");
      if (parts.length) {
        const decoded = await Promise.all(parts.map((part) => clioPaintDecodeLayerBits(part.originalDataUrl || part.previewDataUrl, width, height)));
        if (decoded.every(Boolean)) {
          entries = parts.map((part, index) => ({
            id: part.id,
            name: part.layer?.name,
            kind: part.role === "sketch-tracing" ? "tracing" : (part.layer?.kind || "ink"),
            visible: part.layer?.visible !== false,
            locked: part.layer?.locked === true,
            bits: decoded[index],
          }));
        }
      }
      // No layers on record (a picture from before layers), or a layer that
      // would not decode: the picture itself still opens, as one layer.
      if (!entries.length) entries = [{ bits: flat }];
      clioPaintInstallPicture(width, height, entries);
      clioPaintState.embedOwner = null;
      clioPaintState.attachmentId = record.id;
      clioPaintState.dirty = false;
      window.AISystem6EditAssets?.clearStagedAssets({ app: "clioPaint" });
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
  clioPaintInstallPicture(size.width, size.height, [{}]);
  clioPaintState.attachmentId = "";
  clioPaintState.dirty = false;
  window.AISystem6EditAssets?.clearStagedAssets({ app: "clioPaint" });
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

// The Layer menu and the panel's buttons. Each runs on the active layer.
const CLIO_PAINT_LAYER_COMMANDS = {
  "clio-paint-layer-new": () => addClioPaintLayer("ink"),
  "clio-paint-layer-new-tracing": () => addClioPaintLayer("tracing"),
  "clio-paint-send-stage": () => sendClioPaintToStage(),
  "clio-paint-layer-duplicate": () => duplicateClioPaintLayer(),
  "clio-paint-layer-delete": () => deleteClioPaintLayer(),
  "clio-paint-layer-merge-down": () => mergeClioPaintLayerDown(),
  "clio-paint-layer-toggle-visible": () => toggleClioPaintLayerFlag(clioPaintState.activeLayerId, "hidden"),
  "clio-paint-layer-toggle-lock": () => toggleClioPaintLayerFlag(clioPaintState.activeLayerId, "locked"),
  "clio-paint-layer-toggle-tracing": () => toggleClioPaintLayerTracing(),
  "clio-paint-layer-move-up": () => stepClioPaintLayer(1),
  "clio-paint-layer-move-down": () => stepClioPaintLayer(-1),
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
  ...Object.keys(CLIO_PAINT_LAYER_COMMANDS),
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
function clioPaintCommandAvailability(action, { ignoreWindow = false } = {}) {
  if (action === "open-clio-paint") return { available: true, reason: "" };
  const activeWindow = document.querySelector(".window.is-active");
  if (!ignoreWindow && activeWindow?.dataset.window !== "clioPaint") {
    return { available: false, reason: "clio_paint_needs_window" };
  }
  if (action in CLIO_PAINT_LAYER_COMMANDS) {
    const layers = clioPaintState.layers;
    const index = layers.findIndex((layer) => layer.id === clioPaintState.activeLayerId);
    if (action === "clio-paint-layer-delete" && layers.length < 2) return { available: false, reason: "clio_paint_layer_last" };
    if (action === "clio-paint-layer-move-up" && index >= layers.length - 1) return { available: false, reason: "clio_paint_layer_edge" };
    if (action === "clio-paint-layer-move-down" && index <= 0) return { available: false, reason: "clio_paint_layer_edge" };
    if (action === "clio-paint-layer-merge-down" && (index < 1 || layers[index].kind === "tracing" || layers[index - 1].kind === "tracing")) {
      return { available: false, reason: "clio_paint_layer_cannot_merge" };
    }
    return { available: true, reason: "" };
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
  if (CLIO_PAINT_LAYER_COMMANDS[action]) return CLIO_PAINT_LAYER_COMMANDS[action]();
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
  // A picture dragged from the Picture Album becomes a tracing layer.
  resources.listen(els.root, "dragover", (event) => {
    if ([...(event.dataTransfer?.types || [])].includes("application/x-ais6-picture")) event.preventDefault();
  });
  resources.listen(els.root, "drop", (event) => {
    const id = event.dataTransfer?.getData("application/x-ais6-picture");
    if (!id) return;
    event.preventDefault();
    traceClioPaintPicture(imageAttachmentById(id));
  });
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
  // Save and Select All have to get there before the desk's dispatcher (see
  // handleClioPaintCommandKeydown), so they are registered in the capture phase.
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
  renderClioPaintLayers();
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
      { type: "item", action: "clio-paint-send-stage", labelKey: "clio_paint_send_stage", conditionId: "clio-paint-send-stage" },
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
      // shortcutId is display only (the key itself arrives through the desk's
      // Edit menu route and the history registered above); the row still
      // dispatches its own Paint command.
      { type: "item", action: "clio-paint-undo", labelKey: "undo", shortcutId: "undo", conditionId: "clio-paint-undo", dataset: { editStep: "undo" } },
      { type: "item", action: "clio-paint-redo", labelKey: "redo", shortcutId: "redo", conditionId: "clio-paint-redo", dataset: { editStep: "redo" } },
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
    id: "layer",
    labelKey: "clio_paint_menu_layer",
    items: [
      { type: "item", action: "clio-paint-layer-new", labelKey: "clio_paint_layer_new", conditionId: "clio-paint-layer-new" },
      { type: "item", action: "clio-paint-layer-new-tracing", labelKey: "clio_paint_layer_new_tracing", conditionId: "clio-paint-layer-new-tracing" },
      { type: "item", action: "clio-paint-layer-duplicate", labelKey: "clio_paint_layer_duplicate", conditionId: "clio-paint-layer-duplicate" },
      { type: "item", action: "clio-paint-layer-delete", labelKey: "clio_paint_layer_delete", conditionId: "clio-paint-layer-delete" },
      { type: "separator" },
      { type: "item", action: "clio-paint-layer-merge-down", labelKey: "clio_paint_layer_merge_down", conditionId: "clio-paint-layer-merge-down" },
      { type: "item", action: "clio-paint-layer-toggle-tracing", labelKey: "clio_paint_layer_toggle_tracing", conditionId: "clio-paint-layer-toggle-tracing" },
      { type: "separator" },
      { type: "item", action: "clio-paint-layer-toggle-visible", labelKey: "clio_paint_layer_toggle_visible", conditionId: "clio-paint-layer-toggle-visible" },
      { type: "item", action: "clio-paint-layer-toggle-lock", labelKey: "clio_paint_layer_toggle_lock", conditionId: "clio-paint-layer-toggle-lock" },
      { type: "separator" },
      { type: "item", action: "clio-paint-layer-move-up", labelKey: "clio_paint_layer_move_up", conditionId: "clio-paint-layer-move-up" },
      { type: "item", action: "clio-paint-layer-move-down", labelKey: "clio_paint_layer_move_down", conditionId: "clio-paint-layer-move-down" },
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

// The module installs with a one-layer picture, so there is always a document.
clioPaintInstallPicture(CLIO_PAINT_CANVAS_W, CLIO_PAINT_CANVAS_H, [{}]);

window.AISystem6ClioPaint = Object.freeze({
  open: openClioPaint,
  attach: attachClioPaint,
  editEmbed: editClioPaintEmbed,
  trace: traceClioPaintPicture,
  compositeDataUrl: clioPaintCompositeDataUrl,
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
      hasFloat: Boolean(clioPaintState.selection?.lifted),
      layerCount: clioPaintState.layers.length,
      activeLayer: clioPaintState.activeLayerId,
      undoDepth: depth.past,
      redoDepth: depth.future,
      hasResult: Boolean(clioPaintState.lastResult),
    };
  },
  /** The layers, bottom first, without their bitmaps. */
  layers: () => clioPaintState.layers.map((layer) => ({ id: layer.id, name: layer.name, kind: layer.kind, visible: layer.visible, locked: layer.locked })),
  /** Whether a bit of the active layer is ink: the picture can be read back headless. */
  pixel: (x, y) => clioPaintPixel(Number(x), Number(y)),
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
