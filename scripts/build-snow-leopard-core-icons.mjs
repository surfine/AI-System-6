// Snow Leopard core icon painter.
//
// Fourteen reviewed Mac OS X 10.6.8 objects. Every object owns three
// independently composed tiers: a large recipe (512 with fine texture, 128
// without), a 32 recipe, and a 16 recipe. The small tiers delete detail, move
// highlights, and thicken structure; they are never reductions of the master.
//
// Construction rules and the measured reference board live in
// assets/themes/snow-leopard/icons/src/snow-leopard-core-icons.json. Historical
// Apple artwork is evidence only: nothing here embeds, traces, or crops it.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");
const { gridTransform, inkBox } = await import("./lib/icon-grid.mjs");
const { runtimePixelMetrics } = await import("./lib/icon-pixel-metrics.mjs");
const { assertDocMapMetaphor, measureDocMapMetaphor } = await import("./lib/docmap-metaphor-metrics.mjs");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const themeDir = join(root, "assets/themes/snow-leopard");
const assetDir = join(themeDir, "icons");
const acceptedImagegenSourceDir = join(assetDir, "imagegen-source");
const sourceFile = join(assetDir, "src/snow-leopard-core-icons.json");
const draftDir = join(root, "drafts/era-icons");
const source = JSON.parse(readFileSync(sourceFile, "utf8"));
const ids = Object.keys(source.icons);
const sizes = [512, 128, 32, 16];

mkdirSync(assetDir, { recursive: true });
mkdirSync(draftDir, { recursive: true });

// Measured from the reference board. Snow Leopard keeps saturation controlled:
// the blues are dusty rather than candied, and the metals hold a wide mid range.
const P = Object.freeze({
  ink: "#232527",
  black: "#0b0b0c",
  white: "#ffffff",
  paper0: "#ffffff",
  paper1: "#fafafa",
  paper2: "#ededed",
  paper3: "#dcdcdc",
  paperEdge: "#b4b4b4",
  paperInk: "#8b8e91",
  steel0: "#fdfdfd",
  steel1: "#e9ebed",
  steel2: "#c9cbcd",
  steel3: "#9b9ea1",
  steel4: "#6d7073",
  steel5: "#43464a",
  steel6: "#2b2d30",
  folderRim: "#b3cddd",
  folderBack: "#98bbd3",
  folderFace: "#8bb2cd",
  folderFront: "#7aa7c8",
  folderDeep: "#6e9ec1",
  folderLine: "#5e8aad",
  finderPale: "#e6eaf9",
  finderLight: "#c7d4f6",
  finderMid: "#8ea4e6",
  finderBlue: "#587bd3",
  finderDeep: "#375bb7",
  mesh0: "#5a5a5e",
  mesh1: "#3a3a3c",
  mesh2: "#272728",
  mesh3: "#141415",
  wood: "#dcae62",
  woodDeep: "#a97c3c",
  pencilRed: "#b4483c",
  pencilPaint: "#e0c14e",
  brass: "#d8c274",
  rubber: "#d98f7f",
  cloth: "#4c6379",
  clothDeep: "#33475a",
  volumeTop: "#7b94b9",
  volumeTopDeep: "#5b759a",
  mapCream: "#f1e9d6",
  mapRoute: "#c08a4a",
  mapWater: "#8fb3c8",
  mapLand: "#c8d3a8",
});

function linear(ctx, x0, y0, x1, y1, stops) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

function radial(ctx, x0, y0, r0, x1, y1, r1, stops) {
  const gradient = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

function path(ctx, points, close = true) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point.length === 6) ctx.bezierCurveTo(...point);
    else if (point.length === 4) ctx.quadraticCurveTo(...point);
    else ctx.lineTo(point[0], point[1]);
  }
  if (close) ctx.closePath();
}

function shape(ctx, points, fill, stroke = null, lineWidth = 1) {
  path(ctx, points);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function rounded(ctx, x, y, width, height, radius, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function ellipse(ctx, x, y, rx, ry, fill, stroke = null, lineWidth = 1, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function line(ctx, x0, y0, x1, y1, color, width = 1, cap = "butt") {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.stroke();
  ctx.lineCap = "butt";
}

// One contact shadow recipe for the whole family: short, low, and owned by the
// artwork. Nothing in the theme CSS adds a second shadow on top of it.
function contact(ctx, x, y, rx, ry, alpha = 0.3, blur = 0) {
  ctx.save();
  if (blur) ctx.filter = `blur(${blur}px)`;
  ctx.fillStyle = `rgba(24, 28, 32, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function clipped(ctx, build, paint) {
  ctx.save();
  build();
  ctx.clip();
  paint();
  ctx.restore();
}

// Deterministic pseudo-random so a rebuild is byte-identical.
function noise(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function fleck(ctx, x, y, width, height, count, colors, seed, scale = 1) {
  const random = noise(seed);
  for (let index = 0; index < count; index += 1) {
    const fx = x + random() * width;
    const fy = y + random() * height;
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    ctx.fillRect(fx, fy, 0.55 * scale, 0.55 * scale);
  }
}

function brushed(ctx, x, y, width, height, count, seed, alpha = 0.16) {
  const random = noise(seed);
  for (let index = 0; index < count; index += 1) {
    const ly = y + random() * height;
    ctx.strokeStyle = random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(64,70,76,${alpha})`;
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(x + random() * width * 0.3, ly);
    ctx.lineTo(x + width - random() * width * 0.3, ly);
    ctx.stroke();
  }
}

function textLines(ctx, x, y, width, rows, gap, color, weight = 0.9, seed = 7) {
  const random = noise(seed);
  for (let index = 0; index < rows; index += 1) {
    const short = 0.62 + random() * 0.38;
    ctx.fillStyle = color;
    ctx.fillRect(x, y + index * gap, width * short, weight);
  }
}

/* ------------------------------------------------------------------ *
 * Finder                                                              *
 * ------------------------------------------------------------------ */

// This product's Finder is the launcher and the volume browser, so 10.6 draws
// that browser: a window with its brushed title bar, a source list, and the
// writing objects inside it.
function finderWindow(ctx, x, y, w, h, fine) {
  contact(ctx, x + w / 2, y + h + 4, w * 0.44, 4, 0.26, fine ? 3 : 2);
  rounded(ctx, x, y, w, h, 5, P.paper1, "#8a8d91", 1.2);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.clip();
  ctx.fillStyle = linear(ctx, 0, y, 0, y + 18, [[0, "#f4f5f6"], [0.5, "#dcdfe2"], [1, "#bfc3c7"]]);
  ctx.fillRect(x, y, w, 18);
  if (fine) brushed(ctx, x, y, w, 18, 40, 313, 0.1);
  ctx.strokeStyle = "#9da1a5";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 18.5);
  ctx.lineTo(x + w, y + 18.5);
  ctx.stroke();
  ctx.fillStyle = "#ccd4dd";
  ctx.fillRect(x, y + 19, 24, h - 19);
  ctx.fillStyle = "rgba(120,132,146,.55)";
  for (let index = 0; index < 4; index += 1) ctx.fillRect(x + 5, y + 27 + index * 9, 14, 3);
  ctx.restore();
  for (const [index, color] of [[0, "#c9564d"], [1, "#d8a63f"], [2, "#65a05a"]]) {
    ellipse(ctx, x + 9 + index * 9, y + 9, 3.4, 3.4, color, "rgba(60,64,68,.35)", 0.7);
  }
}

function drawFinderLarge(ctx, fine) {
  finderWindow(ctx, 12, 22, 104, 84, fine);
  shape(ctx, [[46, 50], [64, 50], [69, 58], [96, 58], [96, 88], [46, 88]],
    linear(ctx, 0, 50, 0, 88, [[0, P.folderRim], [0.4, P.folderFace], [1, P.folderDeep]]), P.folderLine, 1);
  ctx.fillStyle = "rgba(255,255,255,.45)";
  ctx.fillRect(48, 60, 46, 2);
  shape(ctx, [[74, 42], [92, 42], [102, 52], [102, 84], [74, 84]], P.paper0, P.paperEdge, 1);
  ctx.fillStyle = "#c8cbce";
  for (let index = 0; index < (fine ? 4 : 3); index += 1) ctx.fillRect(78, 58 + index * 7, index === 3 ? 12 : 20, 2.6);
}

function drawFinder32(ctx) {
  contact(ctx, 16, 28.4, 11, 1.1, 0.24);
  rounded(ctx, 3, 6, 26, 21, 1.6, P.paper1, "#83868a", 0.7);
  ctx.fillStyle = linear(ctx, 0, 6, 0, 11, [[0, "#f2f3f4"], [1, "#c4c8cc"]]);
  ctx.beginPath();
  ctx.roundRect(3, 6, 26, 5, [1.6, 1.6, 0, 0]);
  ctx.fill();
  ctx.fillStyle = "#ccd4dd";
  ctx.fillRect(3, 11, 6, 16);
  shape(ctx, [[12, 15], [17, 15], [18.4, 17], [25, 17], [25, 24], [12, 24]], P.folderFace, P.folderLine, 0.5);
  shape(ctx, [[19, 12.6], [24, 12.6], [26.4, 15], [26.4, 22], [19, 22]], P.paper0, "#a9acaf", 0.5);
}

function drawFinder16(ctx) {
  contact(ctx, 8, 14.2, 5.6, 0.7, 0.22);
  rounded(ctx, 1.4, 3, 13.2, 10.4, 1, P.paper1, "#7f8286", 0.5);
  ctx.fillStyle = "#c9cdd1";
  ctx.beginPath();
  ctx.roundRect(1.4, 3, 13.2, 3, [1, 1, 0, 0]);
  ctx.fill();
  ctx.fillStyle = "#ccd4dd";
  ctx.fillRect(1.4, 6, 3.4, 7.4);
  shape(ctx, [[6, 8], [8.6, 8], [9.4, 9], [13, 9], [13, 12.4], [6, 12.4]], P.folderFace);
  shape(ctx, [[9.8, 6.6], [12.4, 6.6], [13.6, 7.8], [13.6, 11.4], [9.8, 11.4]], P.paper0, "#a4a7aa", 0.4);
}

/* ------------------------------------------------------------------ *
 * Folder                                                              *
 * ------------------------------------------------------------------ */

function drawFolderLarge(ctx, fine) {
  contact(ctx, 64, 116, 50, 4.2, 0.22, fine ? 3 : 2);
  // Back panel: the raised tab sits on the left, measured from the reference.
  const back = () => path(ctx, [
    [16, 18], [50, 18], [54, 26], [115, 26], [118, 26, 118, 30], [118, 106], [10, 106], [10, 22], [10, 18, 14, 18],
  ]);
  back();
  ctx.fillStyle = linear(ctx, 0, 18, 0, 106, [[0, "#c2d7e4"], [0.3, P.folderRim], [0.7, P.folderBack], [1, "#7fa9c8"]]);
  ctx.fill();
  ctx.strokeStyle = P.folderLine; ctx.lineWidth = 1.1; ctx.stroke();
  // Front flap: wider than the back, with softened corners and a splayed foot.
  const front = () => path(ctx, [
    [6, 44], [121, 44], [125, 44, 125, 48], [120, 108], [119, 113, 114, 113], [14, 113], [9, 113, 8, 108], [3, 48], [2, 44, 6, 44],
  ]);
  front();
  ctx.fillStyle = linear(ctx, 0, 44, 0, 113, [[0, "#a4c4da"], [0.3, P.folderFace], [0.72, P.folderFront], [1, "#6396bc"]]);
  ctx.fill();
  ctx.strokeStyle = P.folderLine; ctx.lineWidth = 1.1; ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.42)";
  ctx.fillRect(10, 46, 108, 2.4);
  // The fleck is part of the 10.6 folder material, so it survives at 128 too,
  // only thinned out; the 512 pass carries the full density.
  clipped(ctx, front, () => fleck(ctx, 2, 44, 124, 70, fine ? 620 : 240,
    ["rgba(255,255,255,.5)", "rgba(64,104,136,.34)"], 20260810, fine ? 1 : 1.4));
  clipped(ctx, back, () => fleck(ctx, 10, 18, 108, 26, fine ? 190 : 80,
    ["rgba(255,255,255,.45)", "rgba(64,104,136,.3)"], 991, fine ? 1 : 1.4));
  line(ctx, 18, 110.4, 110, 110.4, "rgba(46,80,106,.28)", 1.4);
}

function drawFolder32(ctx) {
  contact(ctx, 16, 28.6, 12.5, 1.2, 0.22);
  shape(ctx, [[3, 7], [3.6, 5], [13, 5], [14.4, 7], [29, 7], [29.4, 26], [2.6, 26]],
    linear(ctx, 0, 5, 0, 26, [[0, P.folderRim], [0.4, P.folderBack], [1, P.folderDeep]]), P.folderLine, 0.6);
  shape(ctx, [[1.2, 11], [30.8, 11], [29.4, 27.4], [2.6, 27.4]],
    linear(ctx, 0, 11, 0, 27.4, [[0, P.folderFace], [0.6, P.folderFront], [1, "#6a9abe"]]), P.folderLine, 0.6);
  ctx.fillStyle = "rgba(255,255,255,.45)";
  ctx.fillRect(2.4, 11.8, 27.2, 0.9);
}

function drawFolder16(ctx) {
  contact(ctx, 8, 14.4, 6.4, 0.7, 0.2);
  shape(ctx, [[1.6, 3.4], [6.8, 3.4], [7.6, 4.6], [14.4, 4.6], [14.6, 12.6], [1.4, 12.6]],
    linear(ctx, 0, 3.4, 0, 12.6, [[0, P.folderBack], [1, P.folderDeep]]), P.folderLine, 0.5);
  shape(ctx, [[0.8, 6.4], [15.2, 6.4], [14.6, 13.6], [1.4, 13.6]],
    linear(ctx, 0, 6.4, 0, 13.6, [[0, P.folderFace], [1, "#6d9dc0"]]), P.folderLine, 0.5);
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.fillRect(1.6, 6.9, 13, 0.7);
}

/* ------------------------------------------------------------------ *
 * Hard disk                                                           *
 * ------------------------------------------------------------------ */

function drawHardDiskLarge(ctx, fine) {
  contact(ctx, 64, 114, 44, 4.4, 0.28, fine ? 3 : 2);
  // Bare drive from a shallow top view, as it is drawn on the 10.6 desktop.
  shape(ctx, [[20, 14], [108, 14], [110, 96], [104, 108], [24, 108], [18, 96]],
    linear(ctx, 20, 14, 108, 108, [[0, "#f4f5f6"], [0.32, "#dfe1e3"], [0.62, "#c2c5c8"], [1, "#a2a5a9"]]), "#8a8d91", 1.2);
  if (fine) {
    clipped(ctx, () => path(ctx, [[20, 14], [108, 14], [110, 96], [104, 108], [24, 108], [18, 96]]),
      () => brushed(ctx, 18, 14, 92, 94, 150, 4242, 0.12));
  }
  // Dark label bar along the top edge.
  rounded(ctx, 30, 20, 68, 12, 1.6, linear(ctx, 0, 20, 0, 32, [[0, "#4d5054"], [1, "#25272a"]]), "#7c7f83", 0.8);
  ctx.fillStyle = "rgba(255,255,255,.5)";
  for (let x = 34; x < 88; x += 3.4) ctx.fillRect(x, 23, 1.6, 6);
  ctx.fillStyle = "#c8cbce";
  ctx.fillRect(90, 23, 4, 6);
  // Actuator sweep and platter dome.
  ctx.save();
  ctx.beginPath();
  ctx.arc(64, 66, 40, Math.PI * 0.86, Math.PI * 0.14, false);
  ctx.strokeStyle = "rgba(255,255,255,.55)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
  ellipse(ctx, 62, 64, 32, 26, radial(ctx, 50, 50, 4, 62, 66, 36, [[0, "#fbfbfc"], [0.45, "#dcdee1"], [1, "#b0b3b7"]]), "#9c9fa3", 1);
  ellipse(ctx, 62, 64, 10, 8, linear(ctx, 52, 56, 72, 72, [[0, "#f0f1f2"], [1, "#c0c3c6"]]), "#a5a8ac", 0.9);
  ctx.strokeStyle = "rgba(120,124,128,.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(96, 40);
  ctx.quadraticCurveTo(82, 58, 74, 70);
  ctx.stroke();
  // Front connector edge.
  rounded(ctx, 22, 92, 84, 14, 1.4, linear(ctx, 0, 92, 0, 106, [[0, "#b9bcc0"], [0.5, "#8f9296"], [1, "#5e6165"]]), "#7a7d81", 0.8);
  ctx.fillStyle = "#3b3e42";
  ctx.fillRect(30, 95, 20, 8);
  for (let x = 56; x < 92; x += 3) ctx.fillRect(x, 95, 1.5, 8);
  ellipse(ctx, 98, 99, 2, 2, "#e8c14a", "#9b7f28", 0.6);
  for (const [x, y] of [[26, 20], [102, 20], [26, 102], [102, 102]]) {
    ellipse(ctx, x, y, 2.6, 2.6, radial(ctx, x - 1, y - 1, 0.4, x, y, 3, [[0, "#fdfdfd"], [1, "#9fa2a6"]]), "#83868a", 0.6);
  }
}

function drawHardDisk32(ctx) {
  contact(ctx, 16, 28.4, 11, 1.2, 0.26);
  shape(ctx, [[5, 4], [27, 4], [27.6, 24], [25, 27], [7, 27], [4.4, 24]],
    linear(ctx, 5, 4, 27, 27, [[0, "#f2f3f4"], [0.4, "#d5d7da"], [1, "#a7aaae"]]), "#878a8e", 0.6);
  rounded(ctx, 8, 6.4, 16, 3.4, 0.5, "#3a3d41");
  ctx.fillStyle = "rgba(255,255,255,.55)";
  for (let x = 9.4; x < 20; x += 1.6) ctx.fillRect(x, 7.2, 0.8, 1.8);
  ellipse(ctx, 15.4, 16.2, 8, 6.2, radial(ctx, 12, 13, 1, 15.4, 16.4, 9, [[0, "#fafafb"], [0.5, "#dadce0"], [1, "#aeb1b5"]]), "#9a9da1", 0.5);
  ellipse(ctx, 15.4, 16.2, 2.4, 1.9, "#c6c9cc", "#a1a4a8", 0.4);
  rounded(ctx, 5.6, 22.4, 20.8, 3.6, 0.5, linear(ctx, 0, 22.4, 0, 26, [[0, "#adb0b4"], [1, "#66696d"]]));
  ctx.fillStyle = "#35383c";
  ctx.fillRect(7.6, 23.4, 5, 2);
  for (let x = 14; x < 22; x += 1.4) ctx.fillRect(x, 23.4, 0.7, 2);
  ctx.fillStyle = "#e8c14a";
  ctx.fillRect(23.6, 23.6, 1.4, 1.6);
}

function drawHardDisk16(ctx) {
  contact(ctx, 8, 14.3, 5.6, 0.7, 0.24);
  shape(ctx, [[2.2, 2], [13.8, 2], [14.2, 12], [12.6, 13.6], [3.4, 13.6], [1.8, 12]],
    linear(ctx, 2, 2, 14, 13.6, [[0, "#f1f2f3"], [0.45, "#d2d4d7"], [1, "#a4a7ab"]]), "#83868a", 0.5);
  ctx.fillStyle = "#3c3f43";
  ctx.fillRect(3.6, 3.2, 8.8, 1.8);
  ellipse(ctx, 7.6, 8.4, 4.2, 3.2, "#dcdee1", "#9b9ea2", 0.4);
  ctx.fillStyle = "#6b6e72";
  ctx.fillRect(2.6, 11, 10.8, 2);
  ctx.fillStyle = "#2f3236";
  ctx.fillRect(3.6, 11.5, 3, 1);
  ctx.fillStyle = "#e8c14a";
  ctx.fillRect(11.6, 11.5, 1, 1);
}

/* ------------------------------------------------------------------ *
 * Trash                                                               *
 * ------------------------------------------------------------------ */

// The basket wall is woven wire, so the artwork is mostly open: a mid-value
// ground with two crossing families of thin bright and dark strands, not a
// black bucket with lines on it.
function meshWeave(ctx, top, bottom, topRadius, footRadius, fine) {
  const strands = fine ? 44 : 26;
  ctx.lineWidth = fine ? 0.7 : 0.9;
  for (let index = 0; index < strands; index += 1) {
    const angle = (index / strands) * Math.PI * 2;
    const lean = 0.62;
    const front = Math.sin(angle) > -0.2;
    ctx.strokeStyle = front ? "rgba(240,243,246,.7)" : "rgba(168,174,180,.34)";
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(angle) * topRadius, top + Math.sin(angle) * (topRadius * 0.26));
    ctx.lineTo(64 + Math.cos(angle + lean) * footRadius, bottom + Math.sin(angle + lean) * (footRadius * 0.24));
    ctx.stroke();
    ctx.strokeStyle = front ? "rgba(22,22,23,.62)" : "rgba(70,70,74,.34)";
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(angle) * topRadius, top + Math.sin(angle) * (topRadius * 0.26));
    ctx.lineTo(64 + Math.cos(angle - lean) * footRadius, bottom + Math.sin(angle - lean) * (footRadius * 0.24));
    ctx.stroke();
  }
  const hoops = fine ? 9 : 6;
  for (let index = 1; index < hoops; index += 1) {
    const t = index / hoops;
    ctx.strokeStyle = "rgba(210,216,222,.3)";
    ctx.lineWidth = fine ? 0.7 : 0.9;
    ctx.beginPath();
    ctx.ellipse(64, top + (bottom - top) * t, topRadius + (footRadius - topRadius) * t,
      (topRadius + (footRadius - topRadius) * t) * 0.25, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawTrashLarge(ctx, fine) {
  contact(ctx, 64, 122, 34, 3.8, 0.28, fine ? 3 : 2);
  const top = 20;
  const bottom = 112;
  const topRadius = 46;
  const footRadius = 36;
  const wall = () => path(ctx, [
    [64 - topRadius, top], [64 - footRadius, bottom],
    [64, bottom + footRadius * 0.24, 64 + footRadius, bottom],
    [64 + topRadius, top],
  ]);
  // Wall ground: dark at the base where the far side stacks up, open above.
  wall();
  ctx.fillStyle = linear(ctx, 0, top, 0, bottom, [[0, "#86898d"], [0.35, "#5b5e62"], [0.78, "#3a3d41"], [1, "#26282b"]]);
  ctx.fill();
  clipped(ctx, wall, () => {
    ctx.fillStyle = "rgba(240,244,248,.2)";
    ctx.fillRect(64 - topRadius, top, 24, bottom - top);
    meshWeave(ctx, top, bottom, topRadius, footRadius, fine);
  });
  // Foot band.
  ellipse(ctx, 64, bottom + 1, footRadius - 1, (footRadius - 1) * 0.26,
    linear(ctx, 64 - footRadius, 0, 64 + footRadius, 0,
      [[0, "#8d9297"], [0.22, P.steel0], [0.5, "#c8ccd0"], [0.8, "#eef1f3"], [1, "#63676b"]]), "#54585c", 1);
  ellipse(ctx, 64, bottom - 1.4, footRadius - 6, (footRadius - 6) * 0.24, "#2a2c2f");
  // Rim band, then the open mouth with the far wall visible inside.
  ellipse(ctx, 64, top, topRadius, topRadius * 0.28,
    linear(ctx, 64 - topRadius, 0, 64 + topRadius, 0,
      [[0, "#8d9297"], [0.2, P.steel0], [0.46, "#d7dbdf"], [0.74, P.steel0], [1, "#6a6e72"]]), "#5b5f63", 1.1);
  ellipse(ctx, 64, top + 1.6, topRadius - 6, (topRadius - 6) * 0.26,
    linear(ctx, 0, top - 8, 0, top + 12, [[0, "#1d1d1e"], [1, "#45484c"]]));
  clipped(ctx, () => ctx.ellipse(64, top + 1.6, topRadius - 6, (topRadius - 6) * 0.26, 0, 0, Math.PI * 2), () => {
    const strands = fine ? 26 : 15;
    ctx.strokeStyle = "rgba(176,182,188,.4)";
    ctx.lineWidth = fine ? 0.7 : 0.9;
    for (let index = 0; index < strands; index += 1) {
      const angle = (index / strands) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(64, top + 1.6);
      ctx.lineTo(64 + Math.cos(angle) * (topRadius - 4), top + 1.6 + Math.sin(angle) * ((topRadius - 4) * 0.28));
      ctx.stroke();
    }
  });
  ctx.strokeStyle = "rgba(255,255,255,.66)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(64, top, topRadius, topRadius * 0.28, 0, Math.PI * 1.06, Math.PI * 1.74);
  ctx.stroke();
}

// At 32 the weave becomes six crossing strands over a mid ground: any finer and
// it turns into gray mush at true size.
function drawTrash32(ctx) {
  contact(ctx, 16, 29.4, 9, 1.1, 0.26);
  const wall = () => path(ctx, [[4.6, 6], [7.6, 26.4], [16, 28, 24.4, 26.4], [27.4, 6]]);
  wall();
  ctx.fillStyle = linear(ctx, 0, 6, 0, 27, [[0, "#717478"], [0.45, "#4b4e52"], [1, "#2a2c2f"]]);
  ctx.fill();
  clipped(ctx, wall, () => {
    ctx.lineWidth = 0.8;
    for (let index = 0; index < 6; index += 1) {
      const x = 5.4 + index * 4.3;
      ctx.strokeStyle = "rgba(232,236,240,.5)";
      ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x + 5.4, 27); ctx.stroke();
      ctx.strokeStyle = "rgba(18,18,19,.6)";
      ctx.beginPath(); ctx.moveTo(x + 5.4, 6); ctx.lineTo(x, 27); ctx.stroke();
    }
  });
  ellipse(ctx, 16, 26.6, 8.4, 2.1, linear(ctx, 8, 0, 24, 0, [[0, "#8e9398"], [0.3, P.steel0], [0.75, "#dfe2e5"], [1, "#63676b"]]), "#54585c", 0.5);
  ellipse(ctx, 16, 25.6, 5.6, 1.3, "#2b2d30");
  ellipse(ctx, 16, 6, 11.4, 3.1, linear(ctx, 5, 0, 27, 0, [[0, "#8e9398"], [0.24, P.steel0], [0.55, "#d9dce0"], [0.8, P.steel0], [1, "#6a6e72"]]), "#5b5f63", 0.5);
  ellipse(ctx, 16, 6.5, 8.8, 2.2, linear(ctx, 0, 4, 0, 9, [[0, "#1f1f21"], [1, "#4a4d51"]]));
}

function drawTrash16(ctx) {
  contact(ctx, 8, 14.6, 4.6, 0.7, 0.24);
  const wall = () => path(ctx, [[2.6, 3.6], [4.2, 13.2], [8, 14, 11.8, 13.2], [13.4, 3.6]]);
  wall();
  ctx.fillStyle = linear(ctx, 0, 3.6, 0, 13.4, [[0, "#6d7074"], [0.5, "#4a4d51"], [1, "#2c2e31"]]);
  ctx.fill();
  clipped(ctx, wall, () => {
    ctx.lineWidth = 0.7;
    for (const x of [3.4, 6.4, 9.4]) {
      ctx.strokeStyle = "rgba(234,238,242,.55)";
      ctx.beginPath(); ctx.moveTo(x, 3.6); ctx.lineTo(x + 3, 13.4); ctx.stroke();
      ctx.strokeStyle = "rgba(18,18,19,.55)";
      ctx.beginPath(); ctx.moveTo(x + 3, 3.6); ctx.lineTo(x, 13.4); ctx.stroke();
    }
  });
  ellipse(ctx, 8, 13.2, 4.2, 1.1, linear(ctx, 4, 0, 12, 0, [[0, "#8d9297"], [0.35, P.steel0], [1, "#63676b"]]), "#54585c", 0.4);
  ellipse(ctx, 8, 3.6, 5.6, 1.6, linear(ctx, 2, 0, 14, 0, [[0, "#8d9297"], [0.3, P.steel0], [0.7, "#dcdfe2"], [1, "#6a6e72"]]), "#585c60", 0.4);
  ellipse(ctx, 8, 3.9, 4.1, 1.1, "#26282b");
}

/* ------------------------------------------------------------------ *
 * Generic document                                                    *
 * ------------------------------------------------------------------ */

function sheetWithCurl(ctx, x, y, w, h, cut, fine, fill) {
  shape(ctx, [[x, y], [x + w - cut, y], [x + w, y + cut], [x + w, y + h], [x, y + h]],
    fill || linear(ctx, x, y, x + w, y + h, [[0, P.paper0], [0.55, P.paper1], [1, P.paper2]]), P.paperEdge, 1);
  // The curl is lit from above and drops a short shadow onto the page.
  ctx.save();
  ctx.filter = fine ? "blur(1.6px)" : "blur(1px)";
  ctx.fillStyle = "rgba(40,44,48,.28)";
  shape(ctx, [[x + w - cut, y + 2], [x + w - 2, y + cut + 2], [x + w - cut - 4, y + cut + 6]], "rgba(40,44,48,.3)");
  ctx.restore();
  shape(ctx, [[x + w - cut, y], [x + w, y + cut], [x + w - cut, y + cut]],
    linear(ctx, x + w - cut, y, x + w, y + cut, [[0, "#ffffff"], [0.5, "#ededed"], [1, "#c4c4c4"]]), "#b0b0b0", 0.8);
}

function drawDocumentLarge(ctx, fine) {
  contact(ctx, 64, 124, 40, 3.6, 0.22, fine ? 3 : 2);
  sheetWithCurl(ctx, 20, 3, 88, 118, 30, fine);
  if (fine) {
    clipped(ctx, () => ctx.rect(20, 3, 88, 118), () => {
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.fillRect(20, 3, 88, 30);
    });
  }
}

function drawDocument32(ctx) {
  contact(ctx, 16, 30.4, 9.6, 1, 0.2);
  shape(ctx, [[6, 1.6], [22.4, 1.6], [26, 5.4], [26, 29], [6, 29]],
    linear(ctx, 6, 1.6, 26, 29, [[0, P.paper0], [0.6, P.paper1], [1, P.paper2]]), "#a8a8a8", 0.6);
  shape(ctx, [[22.4, 1.6], [26, 5.4], [22.4, 5.4]], "#dcdcdc", "#a8a8a8", 0.5);
}

function drawDocument16(ctx) {
  contact(ctx, 8, 15, 4.8, 0.6, 0.18);
  shape(ctx, [[3, 1], [11, 1], [13, 3], [13, 14.4], [3, 14.4]],
    linear(ctx, 3, 1, 13, 14.4, [[0, P.paper0], [0.6, P.paper1], [1, P.paper2]]), "#9c9c9c", 0.5);
  shape(ctx, [[11, 1], [13, 3], [11, 3]], "#d4d4d4", "#9c9c9c", 0.4);
}

/* ------------------------------------------------------------------ *
 * Generic application                                                 *
 * ------------------------------------------------------------------ */

function drawApplicationLarge(ctx, fine) {
  contact(ctx, 66, 114, 46, 4.2, 0.24, fine ? 3 : 2);
  // Two rotated sheets, then large drawing tools crossing the lower right.
  ctx.save();
  ctx.translate(54, 54);
  ctx.rotate(-0.14);
  shape(ctx, [[-44, -44], [34, -44], [34, 44], [-44, 44]], "#f4f4f2", "#c6c6c2", 1);
  ctx.restore();
  ctx.save();
  ctx.translate(62, 50);
  ctx.rotate(0.04);
  shape(ctx, [[-40, -42], [40, -42], [40, 42], [-40, 42]], P.white, "#bebeba", 1);
  clipped(ctx, () => ctx.rect(-40, -42, 80, 84), () => {
    ctx.fillStyle = linear(ctx, 0, -42, 0, 42, [[0, "#ffffff"], [1, "#ececea"]]);
    ctx.fillRect(-40, -42, 80, 84);
    if (fine) fleck(ctx, -40, -42, 80, 84, 240, ["rgba(0,0,0,.03)", "rgba(255,255,255,.5)"], 77);
  });
  ctx.restore();
  // Brush lies furthest back, handle up and to the left, tip down and right.
  ctx.save();
  ctx.translate(96, 78);
  ctx.rotate(-0.62);
  rounded(ctx, -4.6, -44, 9.2, 46, 2.6,
    linear(ctx, -4.6, 0, 4.6, 0, [[0, "#d86152"], [0.36, "#a8402f"], [1, "#71241a"]]), "#5f1e14", 0.9);
  rounded(ctx, -5, 1, 10, 10, 1.4,
    linear(ctx, -5, 0, 5, 0, [[0, "#f4e9bc"], [0.45, P.brass], [1, "#937c30"]]), "#78641f", 0.8);
  shape(ctx, [[-3.8, 10], [3.8, 10], [2.2, 26], [-2.2, 26]],
    linear(ctx, 0, 10, 0, 26, [[0, "#8a6a44"], [1, "#3d2e1e"]]), "#2e2317", 0.7);
  ctx.restore();
  // Wooden ruler.
  ctx.save();
  ctx.translate(78, 84);
  ctx.rotate(-0.6);
  rounded(ctx, -38, -7.5, 76, 15, 2,
    linear(ctx, 0, -7.5, 0, 7.5, [[0, "#f4dda6"], [0.32, P.wood], [1, P.woodDeep]]), "#87611e", 1);
  ctx.fillStyle = "rgba(96,68,26,.7)";
  for (let x = -32; x < 36; x += 6) ctx.fillRect(x, -7.5, 1, x % 12 === 0 ? 6 : 4);
  ctx.fillStyle = "rgba(255,255,255,.35)";
  ctx.fillRect(-36, -6.6, 72, 1.8);
  ctx.restore();
  // Pencil in front.
  ctx.save();
  ctx.translate(60, 92);
  ctx.rotate(0.46);
  rounded(ctx, -34, -6.4, 52, 12.8, 1.4,
    linear(ctx, 0, -6.4, 0, 6.4, [[0, "#fbf0b4"], [0.4, P.pencilPaint], [1, "#a98c26"]]), "#856f1e", 1);
  shape(ctx, [[18, -6.4], [33, 0], [18, 6.4]],
    linear(ctx, 18, 0, 33, 0, [[0, "#eeddb0"], [1, "#c19a63"]]), "#8f7745", 0.8);
  shape(ctx, [[28, -2.6], [33, 0], [28, 2.6]], "#2c2d30");
  rounded(ctx, -39, -6.4, 7, 12.8, 1.8, linear(ctx, -39, 0, -32, 0, [[0, "#eaa898"], [1, "#bf7062"]]), "#9c5a4d", 0.8);
  ctx.fillStyle = linear(ctx, 0, -6.4, 0, 6.4, [[0, "#e6e9ec"], [0.5, "#a9adb1"], [1, "#74787c"]]);
  ctx.fillRect(-33, -6.4, 5.4, 12.8);
  ctx.restore();
}

function drawApplication32(ctx) {
  contact(ctx, 16.6, 29, 11, 1.2, 0.22);
  ctx.save();
  ctx.translate(14.5, 15);
  ctx.rotate(-0.13);
  shape(ctx, [[-11, -12], [8, -12], [8, 11], [-11, 11]], "#f3f3f1", "#c4c4c0", 0.5);
  ctx.restore();
  ctx.save();
  ctx.translate(16, 14.4);
  ctx.rotate(0.05);
  shape(ctx, [[-10, -11.5], [10, -11.5], [10, 11.5], [-10, 11.5]], P.white, "#bdbdb9", 0.5);
  ctx.restore();
  ctx.save();
  ctx.translate(18, 19.4);
  ctx.rotate(-0.62);
  rounded(ctx, -9.5, -2.2, 19, 4.4, 0.8, linear(ctx, 0, -2.2, 0, 2.2, [[0, "#eed596"], [1, P.woodDeep]]), "#8b6530", 0.4);
  ctx.restore();
  ctx.save();
  ctx.translate(13.6, 20);
  ctx.rotate(0.72);
  rounded(ctx, -8.5, -2, 13.5, 4, 0.7, linear(ctx, 0, -2, 0, 2, [[0, "#f5e498"], [1, "#b99a2f"]]), "#8a7322", 0.4);
  shape(ctx, [[5, -2], [9.4, 0], [5, 2]], "#d2ad74", "#8f7745", 0.35);
  ctx.fillStyle = "#2f3033";
  ctx.fillRect(8.2, -0.6, 1.2, 1.2);
  rounded(ctx, -9.6, -2, 1.8, 4, 0.6, P.rubber);
  ctx.restore();
  ctx.save();
  ctx.translate(22.4, 18.6);
  ctx.rotate(-1.02);
  rounded(ctx, -1.8, -8.4, 3.6, 12, 0.8, linear(ctx, -1.8, 0, 1.8, 0, [[0, "#c4503f"], [1, "#7d2b1f"]]), "#6d2418", 0.35);
  rounded(ctx, -2, 3, 4, 2.6, 0.5, P.brass);
  shape(ctx, [[-1.4, 5.4], [1.4, 5.4], [0.9, 9.4], [-0.9, 9.4]], "#5b452c");
  ctx.restore();
}

// At 16 the generic application keeps one sheet and one unmistakable pencil:
// three overlapping tools turn to mush at this size.
function drawApplication16(ctx) {
  contact(ctx, 8.2, 14.6, 5.6, 0.7, 0.2);
  shape(ctx, [[2.2, 1.6], [10.4, 1.6], [10.4, 12.6], [2.2, 12.6]], P.white, "#a8a8a4", 0.5);
  ctx.save();
  ctx.translate(9, 9.6);
  ctx.rotate(-0.72);
  rounded(ctx, -6.4, -1.6, 10, 3.2, 0.6, P.wood, "#8b6530", 0.4);
  ctx.restore();
  ctx.save();
  ctx.translate(8.4, 10.6);
  ctx.rotate(-0.72);
  rounded(ctx, -5.4, -1.7, 9, 3.4, 0.6, P.pencilPaint, "#84701e", 0.4);
  shape(ctx, [[3.6, -1.7], [6.6, 0], [3.6, 1.7]], "#d8b47c", "#8f7745", 0.35);
  ctx.fillStyle = "#2c2d30";
  ctx.fillRect(5.4, -0.5, 1.2, 1);
  ctx.fillStyle = P.rubber;
  ctx.fillRect(-6.2, -1.7, 1.4, 3.4);
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * System Preferences                                                  *
 * ------------------------------------------------------------------ */

function gear(ctx, x, y, radius, teeth, fill, stroke, lineWidth, inner) {
  ctx.beginPath();
  for (let index = 0; index < teeth * 2; index += 1) {
    const angle = (index / (teeth * 2)) * Math.PI * 2;
    const r = index % 2 === 0 ? radius : radius * 0.78;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  if (inner) ellipse(ctx, x, y, radius * 0.3, radius * 0.3, inner, stroke, lineWidth * 0.8);
}

function drawControlPanelLarge(ctx, fine) {
  contact(ctx, 64, 116, 42, 4, 0.26, fine ? 3 : 2);
  rounded(ctx, 10, 12, 108, 100, 9,
    linear(ctx, 0, 12, 0, 112, [[0, "#fbfbfc"], [0.3, "#dcdee0"], [0.6, "#b8bbbe"], [1, "#eceeef"]]), "#8b8e91", 1.4);
  if (fine) {
    clipped(ctx, () => ctx.roundRect(10, 12, 108, 100, 9), () => brushed(ctx, 10, 12, 108, 100, 130, 8181, 0.14));
  }
  rounded(ctx, 20, 22, 88, 80, 3, linear(ctx, 0, 22, 0, 102, [[0, "#7c7f83"], [0.45, "#63666a"], [1, "#4a4d51"]]), "#3a3d41", 1);
  clipped(ctx, () => ctx.roundRect(20, 22, 88, 80, 3), () => {
    // Punched panel: 10.6 states this as a dense perforation over mid steel,
    // not a flat black rectangle.
    const step = fine ? 3 : 4;
    for (let y = 24; y < 102; y += step) {
      for (let x = 22; x < 108; x += step) {
        ctx.fillStyle = "rgba(28,30,33,.55)";
        ctx.fillRect(x, y, 1.4, 1.4);
        ctx.fillStyle = "rgba(255,255,255,.16)";
        ctx.fillRect(x + 1.4, y + 1.4, 0.9, 0.9);
      }
    }
  });
  const steelFill = linear(ctx, 0, 30, 0, 96, [[0, "#ffffff"], [0.3, "#e4e6e9"], [0.66, "#b6b9bd"], [1, "#83868a"]]);
  gear(ctx, 76, 44, 21, 9, steelFill, "#5c5f63", 1.2, "#cfd2d5");
  gear(ctx, 45, 71, 27, 11, steelFill, "#5c5f63", 1.3, "#cfd2d5");
  gear(ctx, 89, 82, 16, 8, steelFill, "#5c5f63", 1.1, "#cfd2d5");
  ctx.fillStyle = "rgba(255,255,255,.26)";
  ctx.fillRect(22, 24, 84, 5);
}

function drawControlPanel32(ctx) {
  contact(ctx, 16, 29, 10.5, 1.1, 0.24);
  rounded(ctx, 2.6, 3.4, 26.8, 25, 2.4, linear(ctx, 0, 3.4, 0, 28.4, [[0, "#fafafb"], [0.35, "#d6d8da"], [1, "#e8eaeb"]]), "#878a8e", 0.6);
  rounded(ctx, 5.4, 6.2, 21.2, 19.4, 1, linear(ctx, 0, 6, 0, 25.6, [[0, "#494c50"], [1, "#2c2f33"]]), "#212427", 0.5);
  clipped(ctx, () => ctx.roundRect(5.4, 6.2, 21.2, 19.4, 1), () => {
    for (let y = 7; y < 25.6; y += 2) for (let x = 6; x < 26.6; x += 2) {
      ctx.fillStyle = "rgba(0,0,0,.4)";
      ctx.fillRect(x, y, 0.8, 0.8);
    }
  });
  const steelFill = linear(ctx, 0, 8, 0, 24, [[0, "#fafbfb"], [0.4, "#d2d5d8"], [1, "#8e9195"]]);
  gear(ctx, 19.4, 12.4, 5.4, 8, steelFill, "#6c6f73", 0.5, "#c5c8cb");
  gear(ctx, 12.2, 19, 6.6, 9, steelFill, "#6c6f73", 0.5, "#c5c8cb");
  gear(ctx, 22.4, 21.4, 4, 7, steelFill, "#6c6f73", 0.45, "#c5c8cb");
}

// Two gears, six teeth each: at 16 more teeth read as a grey disc.
function drawControlPanel16(ctx) {
  contact(ctx, 8, 14.6, 5.4, 0.7, 0.22);
  rounded(ctx, 1, 1.6, 14, 12.8, 1.4, linear(ctx, 0, 1.6, 0, 14.4, [[0, "#fbfbfc"], [0.4, "#d8dade"], [1, "#eceeef"]]), "#7f8286", 0.6);
  rounded(ctx, 2.6, 3.2, 10.8, 9.6, 0.6, "#55585c", "#3a3d41", 0.4);
  const steelFill = linear(ctx, 0, 3.6, 0, 12.6, [[0, "#ffffff"], [0.5, "#d4d7da"], [1, "#8b8e92"]]);
  gear(ctx, 9.8, 6.6, 3.2, 6, steelFill, "#4e5155", 0.4, null);
  gear(ctx, 5.8, 10, 3.6, 6, steelFill, "#4e5155", 0.4, null);
}

/* ------------------------------------------------------------------ *
 * Searcher                                                            *
 * ------------------------------------------------------------------ */

// A real lens: dark machined ring with a chrome bevel, tinted glass with one
// crescent highlight, and a handle that leaves the ring at a clear angle.
function lens(ctx, x, y, radius, ringWidth, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const grip = radius * 1.5;
  rounded(ctx, -radius * 0.2, radius * 0.7, radius * 0.4, grip, radius * 0.16,
    linear(ctx, -radius * 0.2, 0, radius * 0.2, 0, [[0, "#a4a8ad"], [0.32, "#54585c"], [0.7, "#2a2d30"], [1, "#17191c"]]), "#131518", radius * 0.05);
  ctx.fillStyle = "rgba(255,255,255,.3)";
  ctx.fillRect(-radius * 0.14, radius * 0.9, radius * 0.1, grip * 0.7);
  ctx.restore();
  ellipse(ctx, x, y, radius + ringWidth, radius + ringWidth,
    linear(ctx, x - radius, y - radius, x + radius, y + radius,
      [[0, "#9ea3a8"], [0.28, "#42464a"], [0.55, "#787c80"], [0.8, "#2c2f32"], [1, "#16181b"]]), "#121417", radius * 0.06);
  ellipse(ctx, x, y, radius + ringWidth * 0.4, radius + ringWidth * 0.4, null, "rgba(255,255,255,.5)", radius * 0.05);
  ellipse(ctx, x, y, radius, radius,
    radial(ctx, x - radius * 0.34, y - radius * 0.42, radius * 0.08, x, y, radius * 1.2,
      [[0, "rgba(255,255,255,.9)"], [0.4, "rgba(226,239,247,.5)"], [0.82, "rgba(150,180,200,.42)"], [1, "rgba(96,130,155,.6)"]]));
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,.62)";
  ctx.beginPath();
  ctx.ellipse(x - radius * 0.32, y - radius * 0.44, radius * 0.56, radius * 0.26, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.28)";
  ctx.beginPath();
  ctx.ellipse(x + radius * 0.34, y + radius * 0.44, radius * 0.3, radius * 0.14, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSearcherLarge(ctx, fine) {
  contact(ctx, 62, 116, 42, 4.2, 0.24, fine ? 3 : 2);
  ctx.save();
  ctx.translate(58, 62);
  ctx.rotate(-0.1);
  shape(ctx, [[-40, -48], [38, -48], [38, 46], [-40, 46]], P.white, "#b6b6b2", 1);
  clipped(ctx, () => ctx.rect(-40, -48, 78, 94), () => {
    textLines(ctx, -30, -34, 58, 12, 6.4, "#b9bcc0", fine ? 1.8 : 2.2, 12);
    ctx.fillStyle = "#7f8388";
    ctx.fillRect(-30, -42, 34, 4);
  });
  ctx.restore();
  lens(ctx, 82, 78, 26, 5, 0.85);
}

function drawSearcher32(ctx) {
  contact(ctx, 15.6, 29, 10.6, 1.1, 0.22);
  ctx.save();
  ctx.translate(14.4, 15);
  ctx.rotate(-0.1);
  shape(ctx, [[-10, -12], [9.6, -12], [9.6, 11.4], [-10, 11.4]], P.white, "#b0b0ac", 0.5);
  ctx.fillStyle = "#b7babe";
  for (let index = 0; index < 5; index += 1) ctx.fillRect(-7.4, -8 + index * 3.4, 14, 1);
  ctx.restore();
  ellipse(ctx, 21, 19.4, 7.4, 7.4, linear(ctx, 14, 12, 28, 27, [[0, "#82878d"], [0.4, "#3c4044"], [1, "#222528"]]), "#1d2023", 0.5);
  ellipse(ctx, 21, 19.4, 5.4, 5.4, radial(ctx, 19, 17.4, 0.6, 21, 19.4, 6.4, [[0, "rgba(255,255,255,.9)"], [0.5, "rgba(213,229,240,.5)"], [1, "rgba(122,152,174,.55)"]]));
  ctx.save();
  ctx.translate(21, 19.4);
  ctx.rotate(0.85);
  rounded(ctx, -1.4, 6.4, 2.8, 6.4, 0.9, linear(ctx, -1.4, 0, 1.4, 0, [[0, "#93989d"], [0.45, "#474b4f"], [1, "#25282b"]]), "#1c1f22", 0.4);
  ctx.restore();
}

// Searcher at 16 is a lens over a page: the page loses two of its three lines
// so the dark ring stays the dominant mark.
function drawSearcher16(ctx) {
  contact(ctx, 8, 14.7, 5.4, 0.7, 0.2);
  shape(ctx, [[1.4, 1.2], [9.6, 1.2], [9.6, 11.6], [1.4, 11.6]], P.white, "#a4a4a0", 0.5);
  ctx.fillStyle = "#b0b3b7";
  ctx.fillRect(2.8, 3.2, 5, 1);
  ctx.fillRect(2.8, 5.4, 3.4, 1);
  ctx.save();
  ctx.translate(10, 9.2);
  ctx.rotate(0.85);
  rounded(ctx, -1, 3.4, 2, 4.4, 0.7, "#2c3033");
  ctx.restore();
  ellipse(ctx, 10, 9.2, 4.6, 4.6, "#23262a", "#141619", 0.4);
  ellipse(ctx, 10, 9.2, 3, 3, radial(ctx, 8.8, 8, 0.3, 10, 9.2, 3.6, [[0, "rgba(255,255,255,.95)"], [1, "rgba(126,156,178,.62)"]]));
}

/* ------------------------------------------------------------------ *
 * TeachText                                                           *
 * ------------------------------------------------------------------ */

function drawTeachTextLarge(ctx, fine) {
  contact(ctx, 64, 116, 44, 4.2, 0.24, fine ? 3 : 2);
  ctx.save();
  ctx.translate(52, 60);
  ctx.rotate(-0.16);
  shape(ctx, [[-34, -44], [36, -44], [36, 44], [-34, 44]], "#f0e5a8", "#cbbe7c", 1);
  ctx.restore();
  ctx.save();
  ctx.translate(64, 58);
  ctx.rotate(0.04);
  shape(ctx, [[-38, -46], [38, -46], [38, 46], [-38, 46]], P.white, "#b8b8b4", 1);
  clipped(ctx, () => ctx.rect(-38, -46, 76, 92), () => {
    ctx.fillStyle = "#8f9296";
    ctx.fillRect(-28, -38, 22, 3);
    textLines(ctx, -28, -28, 56, fine ? 13 : 9, fine ? 4.6 : 6.6, "#b1b4b8", fine ? 1.6 : 2.2, 31);
    ctx.fillStyle = "#a4a7ab";
    ctx.fillRect(-28, 30, 24, 2.6);
    ctx.fillRect(-28, 36, 18, 2.6);
  });
  ctx.restore();
  // Slim steel pen across the lower right.
  ctx.save();
  ctx.translate(88, 82);
  ctx.rotate(-0.86);
  rounded(ctx, -5, -40, 10, 56, 4, linear(ctx, -5, 0, 5, 0, [[0, "#fcfcfd"], [0.32, "#cfd2d5"], [0.62, "#8f9296"], [1, "#5a5d61"]]), "#4c4f53", 0.9);
  rounded(ctx, -5.2, -18, 10.4, 5, 1.2, linear(ctx, -5, 0, 5, 0, [[0, "#f2f3f4"], [1, "#7c7f83"]]), "#54575b", 0.7);
  shape(ctx, [[-4.4, 16], [4.4, 16], [1.4, 34], [-1.4, 34]],
    linear(ctx, 0, 16, 0, 34, [[0, "#c9ccd0"], [0.7, "#7f8286"], [1, "#3a3d41"]]), "#4b4e52", 0.7);
  shape(ctx, [[-1, 30], [1, 30], [0.5, 36], [-0.5, 36]], "#22252a");
  ctx.restore();
}

function drawTeachText32(ctx) {
  contact(ctx, 16, 29.2, 11, 1.1, 0.22);
  ctx.save();
  ctx.translate(13.4, 15);
  ctx.rotate(-0.16);
  shape(ctx, [[-8.6, -11], [9, -11], [9, 11], [-8.6, 11]], "#efe4a6", "#c8bb79", 0.5);
  ctx.restore();
  ctx.save();
  ctx.translate(16, 14.6);
  ctx.rotate(0.04);
  shape(ctx, [[-9.6, -11.6], [9.6, -11.6], [9.6, 11.6], [-9.6, 11.6]], P.white, "#b2b2ae", 0.5);
  ctx.fillStyle = "#b4b7bb";
  for (let index = 0; index < 5; index += 1) ctx.fillRect(-7, -8 + index * 3.2, 14, 1);
  ctx.restore();
  ctx.save();
  ctx.translate(22.6, 20.6);
  ctx.rotate(-0.86);
  rounded(ctx, -1.6, -10.4, 3.2, 15, 1.3, linear(ctx, -1.6, 0, 1.6, 0, [[0, "#fbfbfc"], [0.4, "#c3c6ca"], [1, "#63666a"]]), "#4e5155", 0.4);
  shape(ctx, [[-1.4, 4.6], [1.4, 4.6], [0.5, 9.4], [-0.5, 9.4]], "#7d8084", "#4b4e52", 0.35);
  ctx.restore();
}

function drawTeachText16(ctx) {
  contact(ctx, 8, 14.7, 5.6, 0.7, 0.2);
  shape(ctx, [[1.2, 2.4], [8.4, 1.6], [9.2, 12], [2, 12.8]], "#eee2a2", "#c5b876", 0.4);
  shape(ctx, [[2.6, 1.4], [11.4, 1.4], [11.4, 12.6], [2.6, 12.6]], P.white, "#a8a8a4", 0.5);
  ctx.fillStyle = "#b0b3b7";
  for (let index = 0; index < 4; index += 1) ctx.fillRect(4, 3.6 + index * 2.2, 6, 0.8);
  ctx.save();
  ctx.translate(11.4, 9.6);
  ctx.rotate(-0.86);
  rounded(ctx, -0.9, -5.4, 1.8, 8, 0.7, linear(ctx, -0.9, 0, 0.9, 0, [[0, "#f6f7f8"], [1, "#6b6e72"]]));
  shape(ctx, [[-0.8, 2.6], [0.8, 2.6], [0.3, 5.4], [-0.3, 5.4]], "#54575b");
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * ClioTalk                                                            *
 * ------------------------------------------------------------------ */

// ClioTalk is a written conversation that becomes a file, and material is
// attached to it. The object is therefore a transcript with two visible voices
// and an attached sheet held under a clip: not a telephone, and not a balloon.
function binderClip(ctx, x, y, width, height, fine) {
  const body = () => path(ctx, [
    [x - width / 2, y], [x + width / 2, y], [x + width * 0.34, y + height], [x - width * 0.34, y + height],
  ]);
  body();
  ctx.fillStyle = linear(ctx, 0, y, 0, y + height, [[0, "#8d9298"], [0.35, "#585d63"], [1, "#2c3036"]]);
  ctx.fill();
  ctx.strokeStyle = "#22262b";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.4)";
  ctx.fillRect(x - width / 2 + 2, y + 1.5, width - 4, height * 0.18);
  // Two wire arms hooked over the top edge.
  ctx.strokeStyle = "#b9bec4";
  ctx.lineWidth = fine ? 2.4 : 3;
  ctx.lineCap = "round";
  for (const direction of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + direction * width * 0.2, y + 2);
    ctx.quadraticCurveTo(x + direction * width * 0.5, y - height * 0.44, x + direction * width * 0.1, y - height * 0.5);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

// A written conversation kept as a file: 10.6 paper, an inked quotation mark,
// the two voices below it, and the earlier turn behind.
function quoteMark(ctx, x, y, unit, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, unit, unit * 1.7, unit * 0.5);
  ctx.roundRect(x + unit * 1.7, y, unit, unit * 1.7, unit * 0.5);
  ctx.moveTo(x, y + unit * 1.7);
  ctx.lineTo(x + unit, y + unit * 1.7);
  ctx.lineTo(x + unit * 0.3, y + unit * 3.1);
  ctx.closePath();
  ctx.moveTo(x + unit * 1.7, y + unit * 1.7);
  ctx.lineTo(x + unit * 2.7, y + unit * 1.7);
  ctx.lineTo(x + unit * 2, y + unit * 3.1);
  ctx.closePath();
  ctx.fill();
}

function drawAssistantLarge(ctx, fine) {
  contact(ctx, 64, 114, 44, 4.2, 0.24, fine ? 3 : 2);
  ctx.save();
  ctx.translate(74, 58);
  ctx.rotate(0.07);
  shape(ctx, [[-32, -44], [32, -44], [32, 44], [-32, 44]], "#f3f2ee", "#c9c7c0", 1);
  ctx.restore();
  ctx.save();
  ctx.translate(56, 62);
  ctx.rotate(-0.05);
  shape(ctx, [[-34, -46], [34, -46], [34, 46], [-34, 46]], P.white, "#b6b6b2", 1);
  clipped(ctx, () => ctx.rect(-34, -46, 68, 92), () => {
    quoteMark(ctx, -22, -34, 7, "#4a5560");
    ctx.fillStyle = "#c8cbcf";
    ctx.fillRect(-22, 2, 44, 3);
    ctx.fillRect(-22, 10, 36, 3);
    ctx.fillStyle = "#9aa0a6";
    ctx.fillRect(-8, 20, 30, 3);
    ctx.fillStyle = "#c8cbcf";
    ctx.fillRect(-8, 28, 24, 3);
    if (fine) {
      ctx.fillStyle = "#d8dbde";
      ctx.fillRect(-22, 38, 32, 3);
    }
  });
  ctx.restore();
}

function drawAssistant32(ctx) {
  contact(ctx, 16, 29, 11, 1.1, 0.22);
  shape(ctx, [[12, 3], [28, 3], [28, 25], [12, 25]], "#f2f1ed", "#c4c2bc", 0.5);
  shape(ctx, [[4, 6], [21, 6], [21, 28], [4, 28]], P.white, "#aeaeaa", 0.6);
  quoteMark(ctx, 7, 10, 2.2, "#4a5560");
  ctx.fillStyle = "#c6c9cd";
  ctx.fillRect(7, 20, 11, 1.8);
  ctx.fillStyle = "#9aa0a6";
  ctx.fillRect(10, 23.6, 8, 1.8);
}

function drawAssistant16(ctx) {
  contact(ctx, 8, 14.6, 5.6, 0.7, 0.2);
  shape(ctx, [[6, 1.4], [14, 1.4], [14, 12], [6, 12]], "#f1f0ec", "#bcbab4", 0.4);
  shape(ctx, [[2, 3], [10.6, 3], [10.6, 13.6], [2, 13.6]], P.white, "#a6a6a2", 0.5);
  quoteMark(ctx, 3.4, 5, 1.3, "#4a5560");
  ctx.fillStyle = "#c2c6ca";
  ctx.fillRect(3.4, 10.4, 5.6, 1.2);
}


function drawScrapbookLarge(ctx, fine) {
  contact(ctx, 66, 112, 44, 4.2, 0.26, fine ? 3 : 2);
  ctx.save();
  ctx.translate(64, 60);
  ctx.rotate(-0.05);
  // A closed album seen slightly from the right: page block, then cloth cover.
  shape(ctx, [[-30, -46], [40, -42], [40, 44], [-30, 48]], "#efece1", "#c7c4b8", 1);
  ctx.strokeStyle = "rgba(150,146,132,.7)";
  ctx.lineWidth = fine ? 0.7 : 0.9;
  const leaves = fine ? 11 : 6;
  for (let index = 1; index <= leaves; index += 1) {
    const x = 39 - index * (fine ? 1.4 : 2.4);
    ctx.beginPath();
    ctx.moveTo(x, -41 + index * 0.3);
    ctx.lineTo(x, 43 - index * 0.2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.translate(64, 60);
  ctx.rotate(-0.05);
  const cover = () => path(ctx, [[-34, -48], [36, -44], [36, 42], [-34, 46]]);
  cover();
  ctx.fillStyle = linear(ctx, -34, -48, 36, 46, [[0, "#63798d"], [0.4, P.cloth], [1, P.clothDeep]]);
  ctx.fill();
  ctx.strokeStyle = "#223546"; ctx.lineWidth = 1.2; ctx.stroke();
  // Spine with two raised bands.
  shape(ctx, [[-34, -48], [-22, -47], [-22, 45], [-34, 46]],
    linear(ctx, -34, 0, -22, 0, [[0, "#2b3f52"], [0.5, "#465c71"], [1, "#243748"]]), "#1c2e3f", 1);
  ctx.fillStyle = "rgba(255,255,255,.2)";
  ctx.fillRect(-33, -30, 11, 3);
  ctx.fillRect(-33, 24, 11, 3);
  if (fine) clipped(ctx, cover, () => fleck(ctx, -34, -48, 70, 94, 420, ["rgba(255,255,255,.14)", "rgba(0,0,0,.1)"], 66));
  // A mounted print with paper corners, tilted on the cover.
  ctx.save();
  ctx.translate(8, -4);
  ctx.rotate(0.08);
  contact(ctx, 1, 27, 24, 3, 0.28, fine ? 2 : 1.4);
  shape(ctx, [[-24, -26], [24, -26], [24, 26], [-24, 26]], P.white, "#c2c2be", 0.9);
  shape(ctx, [[-20, -22], [20, -22], [20, 12], [-20, 12]],
    linear(ctx, 0, -22, 0, 12, [[0, "#a8cbe2"], [0.55, "#7aa6c6"], [1, "#4f7ea3"]]), "#3f6a8c", 0.7);
  shape(ctx, [[-20, 2], [-7, -9], [3, 3], [11, -3], [20, 6], [20, 12], [-20, 12]], "#61856a");
  ellipse(ctx, 11, -14, 4.4, 4.4, "#f4e4a8");
  ctx.fillStyle = "#b9b6ac";
  ctx.fillRect(-14, 17, 28, 2.4);
  for (const [cx, cy, flip] of [[-24, -26, 1], [24, -26, -1]]) {
    shape(ctx, [[cx, cy], [cx + 9 * flip, cy], [cx, cy + 9]], "#e3e0d5", "#c2bfb4", 0.6);
  }
  if (fine) fleck(ctx, -20, -22, 40, 34, 110, ["rgba(255,255,255,.22)", "rgba(0,0,0,.06)"], 505);
  ctx.restore();
  ctx.restore();
}

function drawScrapbook32(ctx) {
  contact(ctx, 16, 28.8, 11, 1.2, 0.24);
  ctx.save();
  ctx.translate(16, 15.4);
  ctx.rotate(-0.06);
  shape(ctx, [[-10.5, -11], [10, -11], [10, 11.5], [-10.5, 11.5]],
    linear(ctx, -10.5, -11, 10, 11.5, [[0, "#5d768c"], [0.5, P.cloth], [1, P.clothDeep]]), "#25384a", 0.5);
  shape(ctx, [[-10.5, -11], [-7.5, -11], [-7.5, 11.5], [-10.5, 11.5]], "#334759", "#1e3042", 0.4);
  shape(ctx, [[-7, -10], [9, -10], [9, 10.5], [-7, 10.5]], "#f2f0e9", "#cdcbc2", 0.4);
  ctx.save();
  ctx.translate(1.4, -0.6);
  ctx.rotate(0.09);
  shape(ctx, [[-6, -6.6], [6, -6.6], [6, 6.6], [-6, 6.6]], P.white, "#bebeba", 0.4);
  shape(ctx, [[-4.8, -5.4], [4.8, -5.4], [4.8, 3.4], [-4.8, 3.4]], "#6f9ec1", "#3f6a8c", 0.35);
  shape(ctx, [[-4.8, 1], [-1.4, -1.8], [1, 1], [3, -0.4], [4.8, 1.8], [4.8, 3.4], [-4.8, 3.4]], "#5b7f63");
  ctx.restore();
  ctx.restore();
}

function drawScrapbook16(ctx) {
  contact(ctx, 8, 14.4, 5.6, 0.7, 0.22);
  shape(ctx, [[1.4, 1.6], [14, 1.6], [14, 13.4], [1.4, 13.4]], P.cloth, "#25384a", 0.5);
  shape(ctx, [[1.4, 1.6], [3.6, 1.6], [3.6, 13.4], [1.4, 13.4]], "#33475a");
  shape(ctx, [[4.2, 2.6], [13, 2.6], [13, 12.4], [4.2, 12.4]], "#f1efe8", "#cbc9c0", 0.4);
  shape(ctx, [[5.4, 4], [11.8, 4], [11.8, 9.4], [5.4, 9.4]], "#6f9ec1", "#3f6a8c", 0.35);
  shape(ctx, [[5.4, 7.6], [7.6, 5.8], [9.4, 7.6], [10.6, 6.6], [11.8, 8], [11.8, 9.4], [5.4, 9.4]], "#5b7f63");
}

/* ------------------------------------------------------------------ *
 * Review Desk                                                         *
 * ------------------------------------------------------------------ */

function drawReviewDeskLarge(ctx, fine) {
  contact(ctx, 64, 116, 44, 4.2, 0.24, fine ? 3 : 2);
  ctx.save();
  ctx.translate(56, 58);
  ctx.rotate(-0.11);
  shape(ctx, [[-36, -46], [36, -46], [36, 44], [-36, 44]], "#f7f7f5", "#c5c5c1", 1);
  ctx.restore();
  ctx.save();
  ctx.translate(64, 56);
  ctx.rotate(0.05);
  shape(ctx, [[-36, -46], [36, -46], [36, 46], [-36, 46]], P.white, "#b6b6b2", 1);
  clipped(ctx, () => ctx.rect(-36, -46, 72, 92), () => {
    textLines(ctx, -27, -36, 54, fine ? 12 : 8, fine ? 5.6 : 8, "#bbbec2", fine ? 1.6 : 2.2, 41);
    // Proof marks: 10.6 states correction as red ink on paper.
    ctx.strokeStyle = "#c0483a";
    ctx.lineWidth = fine ? 1.6 : 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-16, -22);
    ctx.lineTo(6, -22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.quadraticCurveTo(2, -12, 10, -4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-22, 14);
    ctx.lineTo(-14, 22);
    ctx.lineTo(0, 6);
    ctx.stroke();
    ctx.lineCap = "butt";
  });
  ctx.restore();
  // Red pencil below, lens above: the two review tools.
  ctx.save();
  ctx.translate(46, 96);
  ctx.rotate(-0.24);
  rounded(ctx, -34, -5, 56, 10, 1.4, linear(ctx, 0, -5, 0, 5, [[0, "#d97a6c"], [0.42, P.pencilRed], [1, "#7f2f26"]]), "#6d281f", 0.9);
  shape(ctx, [[22, -5], [34, 0], [22, 5]], linear(ctx, 22, 0, 34, 0, [[0, "#e6d4a6"], [1, "#c09a63"]]), "#8f7745", 0.7);
  shape(ctx, [[30, -2.2], [34, 0], [30, 2.2]], "#2f3033");
  ctx.restore();
  lens(ctx, 92, 74, 20, 4, 0.9);
}

function drawReviewDesk32(ctx) {
  contact(ctx, 16, 29.2, 11, 1.1, 0.22);
  ctx.save();
  ctx.translate(14, 14.4);
  ctx.rotate(-0.11);
  shape(ctx, [[-9, -11.4], [9, -11.4], [9, 11], [-9, 11]], "#f5f5f3", "#c0c0bc", 0.5);
  ctx.restore();
  ctx.save();
  ctx.translate(16, 14);
  ctx.rotate(0.05);
  shape(ctx, [[-9, -11.4], [9, -11.4], [9, 11.4], [-9, 11.4]], P.white, "#b0b0ac", 0.5);
  ctx.fillStyle = "#bbbec2";
  for (let index = 0; index < 4; index += 1) ctx.fillRect(-6.6, -8.4 + index * 3, 13, 1);
  ctx.strokeStyle = "#c0483a";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-4.4, -1);
  ctx.lineTo(3.4, -1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-5.4, 5);
  ctx.lineTo(-3, 7.4);
  ctx.lineTo(1.4, 2.6);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(11.4, 24);
  ctx.rotate(-0.24);
  rounded(ctx, -8.6, -1.6, 14.6, 3.2, 0.6, linear(ctx, 0, -1.6, 0, 1.6, [[0, "#d5766a"], [1, "#83322a"]]), "#6d281f", 0.35);
  shape(ctx, [[6, -1.6], [9.4, 0], [6, 1.6]], "#d2ad74");
  ctx.restore();
  ellipse(ctx, 23.4, 18.4, 6, 6, linear(ctx, 18, 12, 29, 25, [[0, "#82878d"], [0.45, "#3c4044"], [1, "#222528"]]), "#1d2023", 0.5);
  ellipse(ctx, 23.4, 18.4, 4.2, 4.2, radial(ctx, 21.8, 16.8, 0.5, 23.4, 18.4, 5, [[0, "rgba(255,255,255,.9)"], [1, "rgba(126,156,178,.55)"]]));
  ctx.save();
  ctx.translate(23.4, 18.4);
  ctx.rotate(0.9);
  rounded(ctx, -1.2, 5.2, 2.4, 5, 0.8, "#3c4044", "#1f2225", 0.35);
  ctx.restore();
}

// Review Desk at 16 drops the lens entirely: the red mark and the red pencil
// are what separate it from Searcher at this size.
function drawReviewDesk16(ctx) {
  contact(ctx, 8, 14.7, 5.6, 0.7, 0.2);
  shape(ctx, [[2.2, 1.2], [12, 1.2], [12, 11], [2.2, 11]], P.white, "#a8a8a4", 0.5);
  ctx.fillStyle = "#bcbfc3";
  ctx.fillRect(3.6, 2.8, 6.8, 1);
  ctx.fillRect(3.6, 4.8, 4.6, 1);
  ctx.strokeStyle = "#bc4436";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(4, 7.6);
  ctx.lineTo(5.6, 9.2);
  ctx.lineTo(9.4, 5);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.save();
  ctx.translate(7.6, 12);
  ctx.rotate(-0.26);
  rounded(ctx, -6, -1.6, 10, 3.2, 0.6, P.pencilRed, "#6d281f", 0.4);
  shape(ctx, [[4, -1.6], [6.8, 0], [4, 1.6]], "#d8b47c", "#8f7745", 0.35);
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * DocMap                                                              *
 * ------------------------------------------------------------------ */

function drawDocMapLarge(ctx, fine) {
  contact(ctx, 64, 114, 44, 4.2, 0.24, fine ? 3 : 2);
  // The page, then its own headings growing into the map the tool renders.
  ctx.save();
  ctx.translate(40, 62);
  ctx.rotate(-0.04);
  shape(ctx, [[-26, -44], [26, -44], [26, 44], [-26, 44]], P.white, "#b6b6b2", 1);
  clipped(ctx, () => ctx.rect(-26, -44, 52, 88), () => {
    ctx.fillStyle = "#9aa0a6";
    ctx.fillRect(-16, -32, 26, 4);
    ctx.fillStyle = "#c8cbcf";
    ctx.fillRect(-16, -20, 20, 3);
    ctx.fillRect(-16, -12, 24, 3);
    if (fine) {
      ctx.fillStyle = "#d8dbde";
      ctx.fillRect(-16, -4, 18, 3);
      ctx.fillRect(-16, 4, 22, 3);
    }
  });
  ctx.restore();
  ctx.strokeStyle = "#5a6570";
  ctx.lineWidth = fine ? 2.6 : 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(66, 64);
  ctx.lineTo(82, 64);
  ctx.moveTo(82, 40);
  ctx.lineTo(82, 88);
  ctx.moveTo(82, 40);
  ctx.lineTo(94, 40);
  ctx.moveTo(82, 64);
  ctx.lineTo(94, 64);
  ctx.moveTo(82, 88);
  ctx.lineTo(94, 88);
  ctx.stroke();
  ctx.lineCap = "butt";
  for (const [y, radius] of [[40, 8], [64, 10], [88, 8]]) {
    ellipse(ctx, 100, y, radius, radius,
      radial(ctx, 96, y - 4, 1, 100, y, radius + 2, [[0, "#fbfcfc"], [0.5, "#cdd3d9"], [1, "#93a0ac"]]), "#6d7883", 1);
    ellipse(ctx, 97.4, y - 3, radius * 0.42, radius * 0.28, "rgba(255,255,255,.65)");
  }
}

function drawDocMap32(ctx) {
  contact(ctx, 16, 29, 11, 1.1, 0.22);
  shape(ctx, [[3, 5], [15, 5], [15, 27], [3, 27]], P.white, "#aeaeaa", 0.6);
  ctx.fillStyle = "#9aa0a6";
  ctx.fillRect(5.6, 8.4, 7, 1.8);
  ctx.fillStyle = "#c8cbcf";
  ctx.fillRect(5.6, 12.4, 5.4, 1.6);
  ctx.strokeStyle = "#5a6570";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(15, 16);
  ctx.lineTo(20, 16);
  ctx.moveTo(20, 9.6);
  ctx.lineTo(20, 22.4);
  ctx.moveTo(20, 9.6);
  ctx.lineTo(23, 9.6);
  ctx.moveTo(20, 22.4);
  ctx.lineTo(23, 22.4);
  ctx.stroke();
  ctx.lineCap = "butt";
  for (const [x, y, r] of [[25, 9.6, 2.6], [26, 16, 3], [25, 22.4, 2.6]]) {
    ellipse(ctx, x, y, r, r, linear(ctx, x - r, y - r, x + r, y + r, [[0, "#f6f8f9"], [1, "#9aa6b1"]]), "#6d7883", 0.5);
  }
}

function drawDocMap16(ctx) {
  contact(ctx, 8, 14.6, 5.6, 0.7, 0.2);
  shape(ctx, [[1.4, 2.6], [7.6, 2.6], [7.6, 13.4], [1.4, 13.4]], P.white, "#a6a6a2", 0.5);
  ctx.fillStyle = "#9aa0a6";
  ctx.fillRect(2.8, 4.6, 3.6, 1.2);
  ctx.strokeStyle = "#5a6570";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(7.6, 8);
  ctx.lineTo(10.4, 8);
  ctx.moveTo(10.4, 4.6);
  ctx.lineTo(10.4, 11.4);
  ctx.stroke();
  for (const [x, y, r] of [[12.4, 4.6, 2], [13, 8, 2.4], [12.4, 11.4, 2]]) {
    ellipse(ctx, x, y, r, r, "#c3ccd4", "#6d7883", 0.4);
  }
}



/* ------------------------------------------------------------------ *
 * Project Hard Disk                                                   *
 * ------------------------------------------------------------------ */

function drawProjectDiskLarge(ctx, fine) {
  contact(ctx, 64, 112, 44, 4.2, 0.28, fine ? 3 : 2);
  // External volume: a rounded coated enclosure standing on a pale steel foot,
  // in the same shallow top view as the internal drive.
  const body = () => path(ctx, [
    [22, 26], [22, 20, 28, 20], [100, 20], [106, 20, 106, 26], [109, 86], [19, 86],
  ]);
  body();
  ctx.fillStyle = linear(ctx, 22, 20, 60, 86,
    [[0, "#9db1cc"], [0.3, P.volumeTop], [0.75, "#6b85aa"], [1, P.volumeTopDeep]]);
  ctx.fill();
  ctx.strokeStyle = "#41597a"; ctx.lineWidth = 1.2; ctx.stroke();
  clipped(ctx, body, () => {
    // A flat coated face: one narrow top sheen, not an Aqua dome.
    ctx.fillStyle = "rgba(255,255,255,.34)";
    ctx.fillRect(22, 21, 84, 7);
    ctx.fillStyle = "rgba(30,48,72,.18)";
    ctx.fillRect(19, 74, 90, 12);
    if (fine) brushed(ctx, 19, 20, 90, 66, 80, 606, 0.08);
  });
  // A small written label, the way a working project volume is marked.
  shape(ctx, [[38, 50], [90, 50], [90, 70], [38, 70]], "#f7f6f1", "#c6c4bc", 0.9);
  ctx.fillStyle = "#7f8388";
  ctx.fillRect(43, 55, 22, 3);
  ctx.fillStyle = "#b9bcc0";
  ctx.fillRect(43, 62, 34, 2.4);
  // Pale foot with the activity light.
  ctx.fillStyle = "rgba(24,34,50,.4)";
  ctx.fillRect(19, 85, 90, 2);
  shape(ctx, [[19, 87], [109, 87], [107, 100], [103, 104], [25, 104], [21, 100]],
    linear(ctx, 0, 87, 0, 104, [[0, "#fbfbfc"], [0.42, "#dfe1e3"], [1, "#a4a7ab"]]), "#878a8e", 1);
  ellipse(ctx, 96, 95, 2.4, 2.4, "#e8c14a", "#9b7f28", 0.7);
  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.fillRect(24, 88.2, 80, 1.6);
}

function drawProjectDisk32(ctx) {
  contact(ctx, 16, 28.6, 11, 1.2, 0.26);
  shape(ctx, [[5, 4.4], [27, 4.4], [27.4, 21.6], [4.6, 21.6]],
    linear(ctx, 5, 4.4, 27, 21.6, [[0, "#a3b7d2"], [0.4, P.volumeTop], [1, P.volumeTopDeep]]), "#465f80", 0.6);
  ctx.fillStyle = "rgba(255,255,255,.34)";
  ctx.fillRect(6.4, 5.6, 19, 2);
  shape(ctx, [[9, 9], [23, 9], [23, 17.4], [9, 17.4]], "#f7f6f1", "#c7c5bd", 0.5);
  ctx.fillStyle = "#84888c";
  ctx.fillRect(10.6, 10.6, 7, 1.2);
  ctx.fillStyle = "#bcbfc3";
  ctx.fillRect(10.6, 13.4, 11, 1);
  ctx.fillRect(10.6, 15.2, 8, 1);
  shape(ctx, [[4.6, 21.6], [27.4, 21.6], [26.4, 26], [5.6, 26]],
    linear(ctx, 0, 21.6, 0, 26, [[0, "#fafbfb"], [0.5, "#dcdee0"], [1, "#a9acb0"]]), "#8a8d91", 0.5);
  ctx.fillStyle = "#e8c14a";
  ctx.fillRect(23.4, 23, 1.6, 1.6);
}

function drawProjectDisk16(ctx) {
  contact(ctx, 8, 14.4, 5.6, 0.7, 0.24);
  shape(ctx, [[2, 2.4], [14, 2.4], [14.2, 11], [1.8, 11]],
    linear(ctx, 2, 2.4, 14, 11, [[0, "#a8bbd5"], [0.45, P.volumeTop], [1, P.volumeTopDeep]]), "#465f80", 0.5);
  shape(ctx, [[4.2, 4.4], [11.8, 4.4], [11.8, 9], [4.2, 9]], "#f7f6f1", "#c5c3bb", 0.4);
  ctx.fillStyle = "#8b8f93";
  ctx.fillRect(5.2, 5.4, 4, 1);
  ctx.fillStyle = "#bcbfc3";
  ctx.fillRect(5.2, 7.2, 5.6, 1);
  shape(ctx, [[1.8, 11], [14.2, 11], [13.6, 13.6], [2.4, 13.6]],
    linear(ctx, 0, 11, 0, 13.6, [[0, "#f8f9fa"], [1, "#a9acb0"]]), "#888b8f", 0.4);
  ctx.fillStyle = "#e8c14a";
  ctx.fillRect(11.6, 11.8, 1.2, 1.2);
}

/* ------------------------------------------------------------------ */

const recipes = Object.freeze({
  finderApp: { large: drawFinderLarge, 32: drawFinder32, 16: drawFinder16 },
  folder: { large: drawFolderLarge, 32: drawFolder32, 16: drawFolder16 },
  hardDisk: { large: drawHardDiskLarge, 32: drawHardDisk32, 16: drawHardDisk16 },
  trash: { large: drawTrashLarge, 32: drawTrash32, 16: drawTrash16 },
  document: { large: drawDocumentLarge, 32: drawDocument32, 16: drawDocument16 },
  daHandler: { large: drawApplicationLarge, 32: drawApplication32, 16: drawApplication16 },
  controlPanel: { large: drawControlPanelLarge, 32: drawControlPanel32, 16: drawControlPanel16 },
  searcher: { large: drawSearcherLarge, 32: drawSearcher32, 16: drawSearcher16 },
  teachText: { large: drawTeachTextLarge, 32: drawTeachText32, 16: drawTeachText16 },
  assistant: { large: drawAssistantLarge, 32: drawAssistant32, 16: drawAssistant16 },
  scrapbook: { large: drawScrapbookLarge, 32: drawScrapbook32, 16: drawScrapbook16 },
  reviewDesk: { large: drawReviewDeskLarge, 32: drawReviewDesk32, 16: drawReviewDesk16 },
  docMap: { large: drawDocMapLarge, 32: drawDocMap32, 16: drawDocMap16 },
  projectDisk: { large: drawProjectDiskLarge, 32: drawProjectDisk32, 16: drawProjectDisk16 },
});

// 512 and 128 share one large construction: 512 carries the fine texture pass,
// 128 drops it so the material stays readable instead of turning to noise.
// 32 and 16 run their own recipes in their own coordinate space.
// Two passes: paint once to find the object, then paint again on the shared
// icon grid so a row of these reads as one family instead of a jumble.
function render(id, size) {
  const supersample = size >= 512 ? 2 : 4;
  const unit = size >= 128 ? 128 : size;
  const px = size * supersample;
  const paint = (target) => {
    if (size >= 128) recipes[id].large(target, size >= 512);
    else recipes[id][size](target);
  };
  const measure = createCanvas(px, px);
  const mctx = measure.getContext("2d");
  mctx.scale(px / unit, px / unit);
  paint(mctx);
  const box = inkBox(mctx, px);
  const working = createCanvas(px, px);
  const ctx = working.getContext("2d");
  let shape = null;
  if (box) {
    const grid = gridTransform("snow-leopard", id, box, px);
    ctx.setTransform(grid.scale, 0, 0, grid.scale, grid.dx, grid.dy);
    shape = grid.shape;
  }
  ctx.scale(px / unit, px / unit);
  paint(ctx);
  const canvas = createCanvas(size, size);
  const output = canvas.getContext("2d");
  output.imageSmoothingEnabled = true;
  output.imageSmoothingQuality = "high";
  output.drawImage(working, 0, 0, size, size);
  return { canvas, ctx: output, shape };
}

function metrics(ctx, size) {
  const { data } = ctx.getImageData(0, 0, size, size);
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  let pixels = 0;
  const colors = new Set();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      if (!data[offset + 3]) continue;
      pixels += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]},${data[offset + 3]}`);
    }
  }
  return { pixels, colors: colors.size, bbox: { minX, minY, maxX, maxY }, ink: inkBox(ctx, size) };
}

const generated = {};
const runtimeCore = {};
const acceptedImagegenCoreIds = new Set(["assistant", "finderApp"]);
for (const id of ids) {
  generated[id] = {
    ...source.icons[id],
    sourceKind: acceptedImagegenCoreIds.has(id) ? "accepted-imagegen-era-illustration" : "original-measured-snow-leopard-reconstruction",
    reviewStatus: acceptedImagegenCoreIds.has(id) ? "accepted-imagegen" : "accepted-core",
    sizes: {},
    metrics: {},
  };
  for (const size of sizes) {
    let rendered;
    if (acceptedImagegenCoreIds.has(id)) {
      const source = join(acceptedImagegenSourceDir, `${id}-${size}.png`);
      if (!existsSync(source)) throw new Error(`Snow Leopard ${id}/${size}: missing checked-in accepted Image Gen source ${source}`);
      const image = await loadImage(source);
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, size, size);
      rendered = { canvas, ctx, shape: "square" };
    } else {
      rendered = render(id, size);
    }
    const { canvas, ctx, shape } = rendered;
    const filename = `${id}-${size}.png`;
    const buffer = canvas.toBuffer("image/png", { compressionLevel: 9 });
    writeFileSync(join(assetDir, filename), buffer);
    generated[id].sizes[size] = `icons/${filename}`;
    generated[id].metrics[size] = {
      ...metrics(ctx, size),
      gridShape: shape,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      bytes: buffer.length,
    };
    if (size === 128) generated[id].runtimePixelMetrics = runtimePixelMetrics(ctx, size);
    if (size === 32) runtimeCore[id] = `icons/${filename}`;
  }
}

const family = {
  schemaVersion: 1,
  target: source.target,
  generatedBy: "scripts/build-snow-leopard-core-icons.mjs",
  coreOnly: true,
  nativeSizes: sizes,
  referenceLedger: "icons/src/snow-leopard-core-icons.json",
  referenceBoard: "drafts/era-icons/snow-leopard-core-reference-board.png",
  sizeRule: "Runtime surfaces downscale the 128 px tier. For the twelve programmatic cores, 512 carries fine texture while 32 and 16 are separately composed review hints; accepted Image Gen cores use separately processed ledger artifacts.",
  selectionRecipe: "Finder selection belongs to the label and the view surface; normal and selected states use the same artwork.",
  icons: generated,
};
writeFileSync(join(assetDir, "snow-leopard-core-icon-family.json"), `${JSON.stringify(family, null, 2)}\n`);
writeFileSync(join(assetDir, "snow-leopard-core-icon-manifest.json"), `${JSON.stringify(runtimeCore, null, 2)}\n`);

const familyFile = join(themeDir, "snow-leopard-icon-family.json");
const eraFamily = JSON.parse(readFileSync(familyFile, "utf8"));
eraFamily.runtimeSize = 128;
eraFamily.reviewedCore = ids;
eraFamily.coreBuilder = "scripts/build-snow-leopard-core-icons.mjs";
for (const id of ids) {
  eraFamily.icons[id] = {
    ...eraFamily.icons[id],
    genre: source.icons[id].genre,
    physicalMetaphor: source.icons[id].prototype,
    metaphorKey: source.icons[id].metaphorKey,
    semanticMark: "object-owned",
    sourceKind: acceptedImagegenCoreIds.has(id) ? "accepted-imagegen-era-illustration" : "original-measured-snow-leopard-reconstruction",
    reviewStatus: acceptedImagegenCoreIds.has(id) ? "accepted-imagegen" : "accepted-core",
    sizes: Object.fromEntries(sizes.map((size) => [size, `icons/${id}-${size}.png`])),
    runtimePixelMetrics: generated[id].runtimePixelMetrics,
  };
}
eraFamily.icons.docMap.metaphorMetrics = await measureDocMapMetaphor(join(assetDir, "docMap-128.png"), "snow-leopard");
assertDocMapMetaphor(eraFamily.icons.docMap.metaphorMetrics, "snow-leopard/docMap");
writeFileSync(familyFile, `${JSON.stringify(eraFamily, null, 2)}\n`);

const manifestFile = join(themeDir, "snow-leopard-icon-manifest.json");
const eraManifest = JSON.parse(readFileSync(manifestFile, "utf8"));
for (const id of ids) eraManifest[id] = runtimeCore[id];
writeFileSync(manifestFile, `${JSON.stringify(eraManifest, null, 2)}\n`);

async function rebuildSprite() {
  const entries = Object.entries(eraManifest);
  const cellSize = 128;
  const canvas = createCanvas(8 * cellSize, Math.ceil(entries.length / 8) * cellSize);
  const ctx = canvas.getContext("2d");
  for (let index = 0; index < entries.length; index += 1) {
    const [iconId] = entries[index];
    const file = eraFamily.icons[iconId]?.sizes?.[cellSize];
    if (!file) throw new Error(`snow-leopard/${iconId}: missing ${cellSize} px sprite source`);
    const image = await loadImage(join(themeDir, file));
    ctx.drawImage(image, (index % 8) * cellSize, Math.floor(index / 8) * cellSize, cellSize, cellSize);
  }
  writeFileSync(join(themeDir, "snow-leopard-sprite.png"), canvas.toBuffer("image/png", { compressionLevel: 9 }));
}

function label(ctx, text, x, y, { font = "12px sans-serif", color = "#2b2f33", align = "left" } = {}) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic"; ctx.fillText(text, x, y);
}

async function contactSheet() {
  const cellWidth = 250;
  const cellHeight = 196;
  const columns = 4;
  const rows = Math.ceil(ids.length / columns);
  const canvas = createCanvas(cellWidth * columns, 74 + cellHeight * rows);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#dfe1e4"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  label(ctx, "Snow Leopard core · independent 512 / 128 / 32 / 16", 28, 34, { font: "bold 22px sans-serif" });
  label(ctx, "Mac OS X 10.6.8 · measured prototypes, one lighting world, hinted small art", 28, 57, { color: "#5a6069" });
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const x = (index % columns) * cellWidth;
    const y = 74 + Math.floor(index / columns) * cellHeight;
    ctx.fillStyle = index % 2 ? "#f4f6f7" : "#ffffff"; ctx.fillRect(x + 7, y + 7, cellWidth - 14, cellHeight - 14);
    const [large, regular, small] = await Promise.all([128, 32, 16]
      .map((size) => loadImage(join(assetDir, `${id}-${size}.png`))));
    ctx.drawImage(large, x + 12, y + 32, 128, 128);
    ctx.drawImage(regular, x + 152, y + 70, 32, 32);
    ctx.drawImage(small, x + 198, y + 78, 16, 16);
    label(ctx, source.icons[id].label, x + 14, y + 26, { font: "bold 13px sans-serif" });
    label(ctx, id, x + 152, y + 118, { font: "12px monospace", color: "#5a6069" });
    label(ctx, "512 · 128 · 32 · 16", x + 152, y + 134, { font: "11px sans-serif", color: "#7b828a" });
  }
  writeFileSync(join(draftDir, "snow-leopard-core-contact-sheet.png"), canvas.toBuffer("image/png"));
}

async function referenceBoard() {
  const entries = source.referenceBoard;
  const cellWidth = 260;
  const cellHeight = 132;
  const columns = 3;
  const rows = Math.ceil(entries.length / columns);
  const canvas = createCanvas(cellWidth * columns, 76 + cellHeight * rows);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#eceef0"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  label(ctx, "Snow Leopard reference board", 24, 34, { font: "bold 21px sans-serif" });
  label(ctx, "Measured 10.6 evidence: silhouette, perspective, material, palette. Evidence stays local.", 24, 56, { color: "#5a6069" });
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const x = (index % columns) * cellWidth;
    const y = 76 + Math.floor(index / columns) * cellHeight;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(x + 8, y + 6, cellWidth - 16, cellHeight - 14);
    label(ctx, entry.label, x + 16, y + 26, { font: "bold 13px sans-serif" });
    label(ctx, entry.coreId ? `→ ${entry.coreId}` : "family control only", x + 16, y + 44, { font: "12px monospace", color: "#4f7ba6" });
    const palette = entry.measured?.palette || [];
    for (let swatch = 0; swatch < palette.length; swatch += 1) {
      ctx.fillStyle = palette[swatch];
      ctx.fillRect(x + 16 + swatch * 18, y + 54, 16, 16);
      ctx.strokeStyle = "#b7bcc1"; ctx.lineWidth = 1;
      ctx.strokeRect(x + 16.5 + swatch * 18, y + 54.5, 15, 15);
    }
    label(ctx, entry.perspective || "", x + 16, y + 88, { font: "11px sans-serif", color: "#5a6069" });
    label(ctx, entry.material || "", x + 16, y + 104, { font: "11px sans-serif", color: "#5a6069" });
  }
  writeFileSync(join(draftDir, "snow-leopard-core-reference-board.png"), canvas.toBuffer("image/png"));
}

async function comparisonBoard() {
  // Blind family board: the new core mixed with the previously generated
  // fallback family, at true Finder sizes, on three backgrounds.
  const backgrounds = [["Light desktop", "#e8eaec"], ["Medium gray", "#9a9ea2"], ["Finder list", "#ffffff"]];
  const canvas = createCanvas(ids.length * 64 + 160, backgrounds.length * 96 + 70);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f2f3f5"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  label(ctx, "Snow Leopard core · three backgrounds, true sizes", 24, 34, { font: "bold 18px sans-serif" });
  for (let row = 0; row < backgrounds.length; row += 1) {
    const [name, fill] = backgrounds[row];
    const y = 54 + row * 96;
    ctx.fillStyle = fill; ctx.fillRect(150, y, ids.length * 64, 88);
    label(ctx, name, 24, y + 40, { font: "12px sans-serif", color: "#3c4147" });
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const [regular, small] = await Promise.all([32, 16].map((size) => loadImage(join(assetDir, `${id}-${size}.png`))));
      ctx.drawImage(regular, 150 + index * 64 + 8, y + 12, 32, 32);
      ctx.drawImage(small, 150 + index * 64 + 22, y + 52, 16, 16);
    }
  }
  writeFileSync(join(draftDir, "snow-leopard-core-comparison-board.png"), canvas.toBuffer("image/png"));
}

await rebuildSprite();
await contactSheet();
await referenceBoard();
await comparisonBoard();

if (!existsSync(join(assetDir, "finderApp-512.png"))) throw new Error("Snow Leopard core build produced no artwork");
console.log(`OK  Snow Leopard core: ${ids.length} objects × ${sizes.join("/")} px, sprite and boards rebuilt`);
