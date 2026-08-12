// Yosemite core icon painter.
//
// The same fourteen semantic objects as the Snow Leopard core, drawn again in
// 2014 language: flatter shading, cleaner colour blocks, free-form silhouettes,
// and a rounded-square container only where the real 10.10 prototype has one.
// The seven AI System 6 objects keep the metaphorKey recorded in
// assets/themes/icon-system-continuity.json, so an object stays the same thing
// across appearances while its artwork is rebuilt from scratch.
//
// Construction rules and the measured board live in
// assets/themes/yosemite/icons/src/yosemite-core-icons.json.
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
const themeDir = join(root, "apps/desktop/assets/themes/yosemite");
const assetDir = join(themeDir, "icons");
const acceptedImagegenSourceDir = join(assetDir, "imagegen-source");
const sourceFile = join(assetDir, "apps/server/yosemite-core-icons.json");
const draftDir = join(root, "internal/evidence/drafts/era-icons");
const source = JSON.parse(readFileSync(sourceFile, "utf8"));
const ids = Object.keys(source.icons);
const sizes = [128, 64, 32, 16];

mkdirSync(assetDir, { recursive: true });
mkdirSync(draftDir, { recursive: true });

// Measured from the reference board: brighter and more cyan than 10.6, with a
// narrow grey range and a few saturated accents.
const P = Object.freeze({
  ink: "#3c4146",
  navy: "#1d3f66",
  white: "#ffffff",
  paper: "#fdfdfd",
  paper2: "#f1f2f3",
  paperEdge: "#c6c8ca",
  rule: "#c9cbcd",
  grey0: "#fbfbfc",
  grey1: "#e7e9ea",
  grey2: "#cfd2d4",
  grey3: "#a9adb1",
  grey4: "#7d8286",
  grey5: "#55595d",
  grey6: "#2c2f32",
  folder0: "#a6e2fb",
  folder1: "#7bd3f9",
  folder2: "#5cc2ee",
  folder3: "#3aa7dc",
  finder0: "#f3f6f8",
  finder1: "#dfe9f1",
  finder2: "#37c2f7",
  finder3: "#1d87f5",
  finder4: "#1668c9",
  blue: "#2d78c4",
  blueLight: "#8cc4ee",
  red: "#f45b69",
  redDeep: "#cf3f4d",
  amber: "#ffbd45",
  green: "#34c84a",
  land: "#e2ecd2",
  water: "#a9d6ef",
  route: "#f0a93c",
});

function linear(ctx, x0, y0, x1, y1, stops) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
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

function ellipse(ctx, x, y, rx, ry, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function clipped(ctx, build, paint) {
  ctx.save();
  build();
  ctx.clip();
  paint();
  ctx.restore();
}

// Yosemite keeps a shadow only where one object sits on another, and keeps it
// short and light. There is no family-wide floor shadow.
function contact(ctx, x, y, rx, ry, alpha = 0.16, blur = 0) {
  ctx.save();
  if (blur) ctx.filter = `blur(${blur}px)`;
  ctx.fillStyle = `rgba(46, 54, 62, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function rules(ctx, x, y, width, rows, gap, color = P.rule, weight = 2) {
  ctx.fillStyle = color;
  for (let index = 0; index < rows; index += 1) {
    const short = index % 3 === 2 ? 0.62 : 1;
    ctx.fillRect(x, y + index * gap, width * short, weight);
  }
}

/* Finder ---------------------------------------------------------------- */

// Finder in this product is the launcher and the volume browser, so 10.10 draws
// that browser: a flat window with a coloured title bar and the writing objects
// visible inside it.
function drawFinderLarge(ctx, fine) {
  rounded(ctx, 12, 20, 104, 88, 4, P.white, "#b9c2ca", 1);
  ctx.fillStyle = linear(ctx, 12, 20, 12, 38, [[0, P.finder2], [1, P.finder3]]);
  ctx.beginPath();
  ctx.roundRect(12, 20, 104, 18, [4, 4, 0, 0]);
  ctx.fill();
  if (fine) {
    ctx.fillStyle = "rgba(255,255,255,.55)";
    for (let index = 0; index < 3; index += 1) ellipse(ctx, 22 + index * 9, 29, 3, 3, "rgba(255,255,255,.6)");
  }
  // A folder and a page, the two objects the browser always shows.
  shape(ctx, [[26, 54], [44, 54], [49, 61], [66, 61], [66, 92], [26, 92]],
    linear(ctx, 0, 54, 0, 92, [[0, P.folder1], [1, P.folder3]]), "rgba(20,96,140,.3)", 1);
  shape(ctx, [[76, 48], [94, 48], [104, 58], [104, 92], [76, 92]], P.paper2, "#b0b8bf", 1);
  ctx.fillStyle = "#c9ced3";
  for (let index = 0; index < 3; index += 1) ctx.fillRect(81, 64 + index * 8, index === 2 ? 12 : 18, 3);
}

function drawFinder32(ctx) {
  rounded(ctx, 3, 5, 26, 22, 1.6, P.white, "#b0b9c1", 0.7);
  ctx.fillStyle = linear(ctx, 3, 5, 3, 11, [[0, P.finder2], [1, P.finder3]]);
  ctx.beginPath();
  ctx.roundRect(3, 5, 26, 6, [1.6, 1.6, 0, 0]);
  ctx.fill();
  shape(ctx, [[7, 14], [13, 14], [15, 16.4], [20, 16.4], [20, 24], [7, 24]], P.folder2);
  shape(ctx, [[22, 13], [26, 13], [28, 15], [28, 24], [22, 24]], P.paper2, "#aab3ba", 0.5);
}

function drawFinder16(ctx) {
  rounded(ctx, 1.4, 2.6, 13.2, 11, 1, P.white, "#a8b1b9", 0.5);
  ctx.fillStyle = P.finder3;
  ctx.beginPath();
  ctx.roundRect(1.4, 2.6, 13.2, 3.2, [1, 1, 0, 0]);
  ctx.fill();
  shape(ctx, [[3.4, 7.6], [6.6, 7.6], [7.6, 8.8], [10, 8.8], [10, 12], [3.4, 12]], P.folder2);
  shape(ctx, [[11, 7], [13, 7], [14, 8], [14, 12], [11, 12]], P.paper2, "#a4adb4", 0.4);
}

/* Folder ---------------------------------------------------------------- */

function drawFolderLarge(ctx, fine) {
  const back = () => path(ctx, [[10, 26], [12, 22, 16, 22], [48, 22], [54, 30], [112, 30], [118, 30, 118, 36], [118, 100], [10, 100]]);
  back();
  ctx.fillStyle = linear(ctx, 0, 22, 0, 100, [[0, P.folder0], [1, P.folder2]]);
  ctx.fill();
  const front = () => path(ctx, [[6, 44], [122, 44], [122, 100], [118, 106, 112, 106], [16, 106], [10, 106, 6, 100]]);
  front();
  ctx.fillStyle = linear(ctx, 0, 44, 0, 106, [[0, P.folder1], [0.6, P.folder2], [1, P.folder3]]);
  ctx.fill();
  ctx.strokeStyle = "rgba(24,110,158,.16)";
  ctx.lineWidth = 1;
  front();
  ctx.stroke();
  // The pale inner panel is the 10.10 folder's one internal detail, and it
  // covers most of the front rather than sitting as a small plate.
  if (fine) {
    rounded(ctx, 22, 54, 84, 42, 3, "rgba(255,255,255,.34)", "rgba(255,255,255,.55)", 1.6);
  } else {
    rounded(ctx, 22, 54, 84, 42, 3, "rgba(255,255,255,.34)");
  }
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.fillRect(10, 45.4, 108, 2);
}

function drawFolder32(ctx) {
  shape(ctx, [[2.6, 6.4], [12.4, 6.4], [14, 8.4], [29.4, 8.4], [29.4, 25], [2.6, 25]],
    linear(ctx, 0, 6.4, 0, 25, [[0, P.folder0], [1, P.folder2]]));
  shape(ctx, [[1.6, 11.4], [30.4, 11.4], [30.4, 25.6], [1.6, 25.6]],
    linear(ctx, 0, 11.4, 0, 25.6, [[0, P.folder1], [1, P.folder3]]), "rgba(20,96,140,.24)", 0.6);
  rounded(ctx, 7, 14.6, 18, 8, 1, "rgba(255,255,255,.34)");
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.fillRect(2.6, 11.8, 26.8, 0.9);
}

function drawFolder16(ctx) {
  shape(ctx, [[1.2, 3.4], [6.4, 3.4], [7.4, 4.6], [14.8, 4.6], [14.8, 12.6], [1.2, 12.6]],
    linear(ctx, 0, 3.4, 0, 12.6, [[0, P.folder0], [1, P.folder2]]));
  shape(ctx, [[0.8, 6], [15.2, 6], [15.2, 13.2], [0.8, 13.2]],
    linear(ctx, 0, 6, 0, 13.2, [[0, P.folder1], [1, P.folder3]]), "rgba(20,96,140,.28)", 0.5);
  ctx.fillStyle = "rgba(255,255,255,.42)";
  ctx.fillRect(4, 8, 8, 3);
}

/* Hard disk ------------------------------------------------------------- */

function drawHardDiskLarge(ctx, fine) {
  // Flattened volume: one shallow top face, one body, one thin seam.
  shape(ctx, [[24, 30], [104, 30], [110, 44], [18, 44]], linear(ctx, 0, 30, 0, 44, [[0, P.grey0], [1, P.grey2]]));
  rounded(ctx, 18, 44, 92, 54, 5, linear(ctx, 0, 44, 0, 98, [[0, "#eef1f3"], [0.5, "#d4d9dd"], [1, "#aeb4b9"]]));
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.fillRect(22, 45.6, 84, 2);
  rounded(ctx, 30, 56, 68, 26, 3, "rgba(255,255,255,.62)", "rgba(120,130,138,.28)", 1);
  ctx.fillStyle = "rgba(122,132,140,.22)";
  ctx.fillRect(18, 88, 92, 10);
  if (fine) {
    ctx.strokeStyle = "rgba(90,98,106,.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(18, 44.5);
    ctx.lineTo(110, 44.5);
    ctx.stroke();
  }
  ellipse(ctx, 98, 90, 3, 3, P.green);
  rounded(ctx, 18, 44, 92, 54, 5, null, "rgba(84,92,100,.28)", 1);
}

function drawHardDisk32(ctx) {
  shape(ctx, [[7, 7], [25, 7], [27.4, 11], [4.6, 11]], linear(ctx, 0, 7, 0, 11, [[0, P.grey0], [1, P.grey2]]));
  rounded(ctx, 4.6, 11, 22.8, 14, 1.6, linear(ctx, 0, 11, 0, 25, [[0, P.grey1], [1, P.grey3]]), "rgba(84,92,100,.32)", 0.6);
  rounded(ctx, 9, 14.6, 14, 5, 1, "rgba(255,255,255,.6)");
  ctx.fillStyle = P.green;
  ctx.fillRect(23.4, 21.4, 2, 2);
}

function drawHardDisk16(ctx) {
  shape(ctx, [[3.6, 3.4], [12.4, 3.4], [13.8, 5.6], [2.2, 5.6]], P.grey1);
  rounded(ctx, 2.2, 5.6, 11.6, 7.4, 1, linear(ctx, 0, 5.6, 0, 13, [[0, P.grey1], [1, P.grey3]]), "rgba(84,92,100,.36)", 0.5);
  ctx.fillStyle = "rgba(255,255,255,.62)";
  ctx.fillRect(4.4, 7.4, 7.2, 2.4);
  ctx.fillStyle = P.green;
  ctx.fillRect(11.4, 10.6, 1.4, 1.4);
}

/* Trash ----------------------------------------------------------------- */

function drawTrashLarge(ctx, fine) {
  const top = 26;
  const bottom = 108;
  const wall = () => path(ctx, [[32, top], [96, top], [88, bottom], [40, bottom]]);
  wall();
  ctx.fillStyle = linear(ctx, 0, top, 0, bottom, [[0, P.grey1], [0.58, P.grey3], [1, P.grey4]]);
  ctx.fill();
  ctx.strokeStyle = "rgba(96,104,112,.34)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  clipped(ctx, wall, () => {
    ctx.strokeStyle = "rgba(76,84,92,.72)";
    ctx.lineWidth = fine ? 2.6 : 3;
    for (let index = 0; index < 5; index += 1) {
      const x = 40 + index * 12;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + 2.6, bottom);
      ctx.stroke();
    }
  });
  ellipse(ctx, 64, top, 32, 7, linear(ctx, 32, 0, 96, 0, [[0, P.grey2], [0.5, P.grey0], [1, P.grey2]]), "rgba(96,104,112,.36)", 1.2);
  ellipse(ctx, 64, top, 25, 4.6, "rgba(160,168,176,.35)");
  ellipse(ctx, 64, bottom, 24, 4.6, "rgba(206,212,218,.9)", "rgba(96,104,112,.3)", 1);
}

function drawTrash32(ctx) {
  const wall = () => path(ctx, [[8.4, 7], [23.6, 7], [21.6, 26], [10.4, 26]]);
  wall();
  ctx.fillStyle = linear(ctx, 0, 7, 0, 26, [[0, P.grey0], [1, P.grey2]]);
  ctx.fill();
  ctx.strokeStyle = "rgba(96,104,112,.4)";
  ctx.lineWidth = 0.7;
  ctx.stroke();
  clipped(ctx, wall, () => {
    ctx.strokeStyle = "rgba(120,128,136,.4)";
    ctx.lineWidth = 1.1;
    for (const x of [12.4, 16, 19.6]) {
      ctx.beginPath(); ctx.moveTo(x, 7); ctx.lineTo(x + 0.6, 26); ctx.stroke();
    }
  });
  ellipse(ctx, 16, 7, 7.8, 2, P.grey0, "rgba(96,104,112,.42)", 0.6);
  ellipse(ctx, 16, 26, 5.8, 1.4, "rgba(206,212,218,.9)");
}

function drawTrash16(ctx) {
  const wall = () => path(ctx, [[4.4, 4], [11.6, 4], [10.6, 13.2], [5.4, 13.2]]);
  wall();
  ctx.fillStyle = linear(ctx, 0, 4, 0, 13.2, [[0, P.grey0], [1, P.grey2]]);
  ctx.fill();
  ctx.strokeStyle = "rgba(96,104,112,.48)";
  ctx.lineWidth = 0.6;
  ctx.stroke();
  clipped(ctx, wall, () => {
    ctx.strokeStyle = "rgba(120,128,136,.45)";
    ctx.lineWidth = 0.8;
    for (const x of [6.6, 8, 9.4]) { ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x + 0.3, 13.2); ctx.stroke(); }
  });
  ellipse(ctx, 8, 4, 3.9, 1.1, P.grey0, "rgba(96,104,112,.5)", 0.5);
}

/* Generic document ------------------------------------------------------ */

function sheet(ctx, x, y, w, h, cut, fill) {
  shape(ctx, [[x, y], [x + w - cut, y], [x + w, y + cut], [x + w, y + h], [x, y + h]],
    fill || linear(ctx, 0, y, 0, y + h, [[0, P.white], [1, P.paper2]]), P.paperEdge, 1);
  shape(ctx, [[x + w - cut, y], [x + w, y + cut], [x + w - cut, y + cut]], P.grey1, P.paperEdge, 1);
}

function drawDocumentLarge(ctx) {
  sheet(ctx, 20, 3, 88, 119, 32);
  rules(ctx, 32, 42, 60, 5, 13, "#626b73", 5);
}

function drawDocument32(ctx) {
  shape(ctx, [[6, 2], [22, 2], [26, 6], [26, 30], [6, 30]], linear(ctx, 0, 2, 0, 30, [[0, P.white], [1, P.paper2]]), "#b4b6b8", 0.7);
  shape(ctx, [[22, 2], [26, 6], [22, 6]], P.grey1, "#b4b6b8", 0.6);
}

function drawDocument16(ctx) {
  shape(ctx, [[3, 1], [11, 1], [13, 3], [13, 15], [3, 15]], linear(ctx, 0, 1, 0, 15, [[0, P.white], [1, P.paper2]]), "#a8aaac", 0.6);
  shape(ctx, [[11, 1], [13, 3], [11, 3]], P.grey1, "#a8aaac", 0.5);
}

/* Generic application --------------------------------------------------- */

function drawApplicationLarge(ctx, fine) {
  sheet(ctx, 22, 12, 76, 100, 0, linear(ctx, 0, 12, 0, 112, [[0, P.white], [1, P.paper2]]));
  if (fine) rules(ctx, 34, 30, 52, 4, 12, "#dfe1e3", 3);
  contact(ctx, 74, 100, 34, 5, 0.14, 3);
  // Ruler and pencil, flattened into clean colour blocks.
  ctx.save();
  ctx.translate(72, 78);
  ctx.rotate(-0.6);
  rounded(ctx, -40, -8, 80, 16, 3, linear(ctx, 0, -8, 0, 8, [[0, "#f0d9a6"], [1, "#d9b271"]]), "rgba(140,104,44,.4)", 1);
  ctx.fillStyle = "rgba(140,104,44,.5)";
  for (let x = -32; x < 36; x += 8) ctx.fillRect(x, -8, 1.6, 5);
  ctx.restore();
  ctx.save();
  ctx.translate(58, 88);
  ctx.rotate(0.48);
  rounded(ctx, -34, -7, 54, 14, 2, linear(ctx, 0, -7, 0, 7, [[0, "#ffd76b"], [1, P.amber]]), "rgba(160,110,20,.35)", 1);
  shape(ctx, [[20, -7], [36, 0], [20, 7]], "#f0d6a8", "rgba(140,104,44,.4)", 1);
  shape(ctx, [[31, -2.6], [36, 0], [31, 2.6]], P.grey6);
  rounded(ctx, -39, -7, 7, 14, 2, P.red);
  ctx.restore();
}

function drawApplication32(ctx) {
  shape(ctx, [[5, 3], [24, 3], [24, 27], [5, 27]], P.white, "#b4b6b8", 0.7);
  ctx.save();
  ctx.translate(17, 19);
  ctx.rotate(-0.6);
  rounded(ctx, -10, -2.4, 20, 4.8, 1, "#e3bd80", "rgba(140,104,44,.45)", 0.5);
  ctx.restore();
  ctx.save();
  ctx.translate(14.4, 21.4);
  ctx.rotate(0.48);
  rounded(ctx, -8.6, -2.2, 14, 4.4, 0.8, P.amber, "rgba(160,110,20,.4)", 0.5);
  shape(ctx, [[5.4, -2.2], [9.4, 0], [5.4, 2.2]], "#efd6a8");
  ctx.fillStyle = P.grey6;
  ctx.fillRect(8, -0.7, 1.4, 1.4);
  ctx.restore();
}

function drawApplication16(ctx) {
  shape(ctx, [[2.4, 1.6], [11, 1.6], [11, 13.4], [2.4, 13.4]], P.white, "#a8aaac", 0.6);
  ctx.save();
  ctx.translate(8.4, 9.4);
  ctx.rotate(-0.66);
  rounded(ctx, -6, -1.7, 11.4, 3.4, 0.7, "#e3bd80", "rgba(140,104,44,.5)", 0.4);
  ctx.restore();
  ctx.save();
  ctx.translate(7.6, 11);
  ctx.rotate(-0.66);
  rounded(ctx, -5, -1.8, 9, 3.6, 0.7, P.amber, "rgba(160,110,20,.45)", 0.4);
  shape(ctx, [[4, -1.8], [7, 0], [4, 1.8]], "#f0d9ac");
  ctx.restore();
}

/* Settings -------------------------------------------------------------- */

function gear(ctx, x, y, radius, teeth, fill, stroke, hole) {
  ctx.beginPath();
  for (let index = 0; index < teeth * 2; index += 1) {
    const angle = (index / (teeth * 2)) * Math.PI * 2;
    const r = index % 2 === 0 ? radius : radius * 0.76;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  if (hole) ellipse(ctx, x, y, radius * 0.3, radius * 0.3, hole);
}

function drawControlPanelLarge(ctx, fine) {
  rounded(ctx, 8, 14, 112, 100, 18, linear(ctx, 0, 14, 0, 114, [[0, "#747a7d"], [0.5, "#4e5558"], [1, "#252b2e"]]));
  rounded(ctx, 8, 14, 112, 100, 18, null, "rgba(30,32,32,.4)", 1.2);
  if (fine) {
    ctx.fillStyle = "rgba(255,255,255,.14)";
    ctx.beginPath();
    ctx.roundRect(12, 18, 104, 34, [14, 14, 30, 30]);
    ctx.fill();
  }
  gear(ctx, 88, 44, 20, 8, "#e3e6e5", "rgba(20,22,23,.68)", "#6f7678");
  gear(ctx, 92, 92, 16, 8, "#d7dbda", "rgba(20,22,23,.68)", "#687073");
  gear(ctx, 56, 68, 38, 11, "#f4f6f5", "rgba(20,22,23,.68)", null);
  // The centre wheel carries three spokes, the way the real 10.10 icon does.
  ctx.strokeStyle = "#596164";
  ctx.lineWidth = 9;
  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(56, 68);
    ctx.lineTo(56 + Math.cos(angle) * 26, 68 + Math.sin(angle) * 26);
    ctx.stroke();
  }
  ellipse(ctx, 56, 68, 10, 10, "#8e918f", "rgba(30,32,32,.35)", 1.4);
}

function drawControlPanel32(ctx) {
  rounded(ctx, 2.4, 4, 27.2, 24, 4.6, linear(ctx, 0, 4, 0, 28, [[0, "#9a9d9c"], [1, "#545756"]]), "rgba(30,32,32,.45)", 0.6);
  gear(ctx, 19, 12.6, 6, 8, "#eceeed", "rgba(40,42,42,.4)", null);
  gear(ctx, 12.6, 19.4, 7.2, 9, "#f6f8f7", "rgba(40,42,42,.4)", "#8f9291");
}

function drawControlPanel16(ctx) {
  rounded(ctx, 1, 2, 14, 12, 2.6, linear(ctx, 0, 2, 0, 14, [[0, "#969998"], [1, "#545756"]]), "rgba(30,32,32,.5)", 0.5);
  // Five broad teeth and an open centre survive the 16 px raster; the large
  // gear's denser tooth count collapsed into a solid grey blob here.
  gear(ctx, 10, 6, 2.8, 5, "#eff1f0", "rgba(40,42,42,.45)", "#737877");
  gear(ctx, 6, 10, 3.2, 5, "#fbfcfb", "rgba(40,42,42,.45)", "#737877");
}

/* Searcher -------------------------------------------------------------- */

function lens(ctx, x, y, radius, ring, angle, fine) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  rounded(ctx, -radius * 0.18, radius * 0.8, radius * 0.36, radius * 1.25, radius * 0.16,
    linear(ctx, -radius * 0.2, 0, radius * 0.2, 0, [[0, P.grey3], [1, P.grey5]]), "rgba(50,56,62,.35)", 1);
  ctx.restore();
  ellipse(ctx, x, y, radius + ring, radius + ring,
    linear(ctx, x - radius, y - radius, x + radius, y + radius, [[0, P.grey2], [0.55, P.grey4], [1, P.grey5]]), "rgba(50,56,62,.4)", 1);
  ellipse(ctx, x, y, radius, radius,
    linear(ctx, x - radius, y - radius, x + radius, y + radius, [[0, "#dcefff"], [0.55, P.blueLight], [1, "#4f9fd8"]]));
  if (fine) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.beginPath();
    ctx.ellipse(x - radius * 0.3, y - radius * 0.4, radius * 0.52, radius * 0.24, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawSearcherLarge(ctx, fine) {
  sheet(ctx, 16, 10, 78, 100, 0);
  rules(ctx, 28, 28, 54, 5, 13, "#d5d8da", 4);
  contact(ctx, 82, 84, 26, 5, 0.14, 3);
  lens(ctx, 86, 76, 26, 5, 0.86, fine);
}

function drawSearcher32(ctx) {
  shape(ctx, [[3, 3], [21, 3], [21, 27], [3, 27]], P.white, "#b4b6b8", 0.7);
  ctx.fillStyle = "#d2d5d7";
  for (let index = 0; index < 3; index += 1) ctx.fillRect(6, 7 + index * 4.4, 12, 1.8);
  ellipse(ctx, 21.4, 19.6, 8.2, 8.2, P.grey4, "rgba(50,56,62,.4)", 0.7);
  ellipse(ctx, 21.4, 19.6, 6, 6, linear(ctx, 15, 13, 28, 26, [[0, "#dcefff"], [0.55, P.blueLight], [1, "#4f9fd8"]]));
  ctx.save();
  ctx.translate(21.4, 19.6);
  ctx.rotate(0.86);
  rounded(ctx, -1.5, 6.8, 3, 6, 1, P.grey3, "rgba(70,76,82,.35)", 0.5);
  ctx.restore();
}

function drawSearcher16(ctx) {
  shape(ctx, [[1.4, 1.6], [9.6, 1.6], [9.6, 12.4], [1.4, 12.4]], P.white, "#a8aaac", 0.6);
  ctx.fillStyle = "#cfd2d4";
  ctx.fillRect(3.2, 3.6, 5, 1.4);
  ctx.fillRect(3.2, 6, 3.4, 1.4);
  ctx.save();
  ctx.translate(10.2, 9.4);
  ctx.rotate(0.86);
  rounded(ctx, -1, 3.4, 2, 4.2, 0.8, P.grey4);
  ctx.restore();
  ellipse(ctx, 10.2, 9.4, 4.9, 4.9, P.grey4, "rgba(50,56,62,.45)", 0.5);
  ellipse(ctx, 10.2, 9.4, 3.4, 3.4, linear(ctx, 7, 6, 14, 13, [[0, "#dcefff"], [1, "#4f9fd8"]]));
}

/* TeachText ------------------------------------------------------------- */

function drawTeachTextLarge(ctx, fine) {
  sheet(ctx, 22, 6, 84, 116, 0);
  rules(ctx, 32, 22, 64, fine ? 9 : 6, fine ? 11 : 16, "#626b73", 4.5);
  contact(ctx, 84, 104, 24, 4, 0.13, 3);
  // One slim pen, flattened: barrel, grip band, nib.
  ctx.save();
  ctx.translate(88, 74);
  ctx.rotate(-0.72);
  rounded(ctx, -5, -46, 10, 62, 5, linear(ctx, -5, 0, 5, 0, [[0, P.grey0], [0.45, P.grey2], [1, P.grey4]]), "rgba(70,76,82,.3)", 1);
  rounded(ctx, -5.2, -12, 10.4, 6, 1.6, P.blue);
  shape(ctx, [[-4.4, 16], [4.4, 16], [1.2, 34], [-1.2, 34]], linear(ctx, 0, 16, 0, 34, [[0, P.grey3], [1, P.grey5]]));
  ctx.restore();
}

function drawTeachText32(ctx) {
  shape(ctx, [[5, 2], [27, 2], [27, 30], [5, 30]], P.white, "#b4b6b8", 0.7);
  ctx.fillStyle = "#cfd2d5";
  for (let index = 0; index < 4; index += 1) ctx.fillRect(8, 9 + index * 4.2, 16, 1.8);
  ctx.save();
  ctx.translate(22.6, 19.4);
  ctx.rotate(-0.72);
  rounded(ctx, -1.8, -11, 3.6, 16, 1.6, linear(ctx, -1.8, 0, 1.8, 0, [[0, P.grey0], [1, P.grey4]]), "rgba(70,76,82,.35)", 0.5);
  ctx.fillStyle = P.blue;
  ctx.fillRect(-1.8, -3, 3.6, 2.4);
  shape(ctx, [[-1.6, 5], [1.6, 5], [0.5, 9.6], [-0.5, 9.6]], P.grey4);
  ctx.restore();
}

function drawTeachText16(ctx) {
  shape(ctx, [[2.4, 1], [13, 1], [13, 15], [2.4, 15]], P.white, "#a8aaac", 0.6);
  ctx.fillStyle = "#cbced1";
  for (let index = 0; index < 3; index += 1) ctx.fillRect(4.4, 5 + index * 2.6, 6.4, 1.2);
  ctx.save();
  ctx.translate(11.4, 9.4);
  ctx.rotate(-0.72);
  rounded(ctx, -1, -5.6, 2, 8.4, 0.9, linear(ctx, -1, 0, 1, 0, [[0, P.grey1], [1, P.grey4]]));
  ctx.fillStyle = P.blue;
  ctx.fillRect(-1, -1.6, 2, 1.4);
  shape(ctx, [[-0.9, 2.8], [0.9, 2.8], [0.3, 5.8], [-0.3, 5.8]], P.grey5);
  ctx.restore();
}

/* ClioTalk --------------------------------------------------------------- */

// A written conversation kept as a file: a record sheet opened by a quotation
// mark, with the two voices below it and the earlier turn behind.
function quoteMark(ctx, x, y, unit, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, unit, unit * 1.7, unit * 0.5);
  ctx.roundRect(x + unit * 1.6, y, unit, unit * 1.7, unit * 0.5);
  ctx.moveTo(x, y + unit * 1.7);
  ctx.lineTo(x + unit, y + unit * 1.7);
  ctx.lineTo(x + unit * 0.35, y + unit * 3);
  ctx.closePath();
  ctx.moveTo(x + unit * 1.6, y + unit * 1.7);
  ctx.lineTo(x + unit * 2.6, y + unit * 1.7);
  ctx.lineTo(x + unit * 1.95, y + unit * 3);
  ctx.closePath();
  ctx.fill();
}

function drawAssistantLarge(ctx, fine) {
  sheet(ctx, 34, 14, 66, 92, 0, linear(ctx, 0, 14, 0, 106, [[0, "#f4f6f8"], [1, "#e7ebef"]]));
  sheet(ctx, 20, 26, 70, 94, 0);
  quoteMark(ctx, 32, 40, 9, P.blue);
  ctx.fillStyle = "#c4c9ce";
  ctx.fillRect(32, 82, 44, 5);
  ctx.fillRect(32, 94, 32, 5);
  ctx.fillStyle = "#9aa1a8";
  ctx.fillRect(46, 88, 30, 5);
  if (fine) {
    ctx.fillStyle = "#d7dbdf";
    ctx.fillRect(32, 104, 38, 4);
  }
}

function drawAssistant32(ctx) {
  shape(ctx, [[9, 3], [27, 3], [27, 26], [9, 26]], P.paper2, "#b4b6b8", 0.6);
  shape(ctx, [[4, 6], [22, 6], [22, 29], [4, 29]], P.white, "#a8aaac", 0.7);
  quoteMark(ctx, 7.5, 10, 2.6, P.blue);
  ctx.fillStyle = "#c2c7cc";
  ctx.fillRect(7.5, 21, 11, 1.8);
  ctx.fillRect(11, 24.4, 8, 1.8);
}

function drawAssistant16(ctx) {
  shape(ctx, [[4.6, 1.4], [13.4, 1.4], [13.4, 12.4], [4.6, 12.4]], P.paper2, "#aaacae", 0.5);
  shape(ctx, [[2, 3], [10.8, 3], [10.8, 14], [2, 14]], P.white, "#a0a2a4", 0.5);
  quoteMark(ctx, 3.6, 5, 1.5, P.blue);
  ctx.fillStyle = "#bfc4c9";
  ctx.fillRect(3.6, 11, 5.6, 1.2);
}

/* Scrapbook ------------------------------------------------------------- */

function drawScrapbookLarge(ctx, fine) {
  // Flat bound album: cover, spine band, page edge, one mounted print.
  rounded(ctx, 20, 14, 90, 100, 4, linear(ctx, 20, 14, 110, 114, [[0, "#5f88b0"], [1, "#3d6790"]]));
  ctx.fillStyle = "#2f5679";
  ctx.fillRect(20, 14, 14, 100);
  ctx.fillStyle = "rgba(255,255,255,.25)";
  ctx.fillRect(24, 30, 6, 68);
  ctx.fillStyle = "#f2f3f2";
  ctx.fillRect(104, 20, 8, 88);
  if (fine) {
    ctx.strokeStyle = "rgba(150,156,162,.5)";
    ctx.lineWidth = 1;
    for (let x = 106; x < 112; x += 2) {
      ctx.beginPath(); ctx.moveTo(x, 22); ctx.lineTo(x, 106); ctx.stroke();
    }
  }
  rounded(ctx, 42, 34, 56, 60, 2, P.white, "rgba(60,70,80,.18)", 1);
  rounded(ctx, 47, 39, 46, 38, 1, linear(ctx, 0, 39, 0, 77, [[0, "#a9d6ef"], [1, "#6cb0d8"]]));
  shape(ctx, [[47, 66], [60, 52], [70, 64], [78, 57], [93, 71], [93, 77], [47, 77]], "#7fb583");
  ellipse(ctx, 82, 48, 5, 5, P.amber);
  ctx.fillStyle = "#c9ccce";
  ctx.fillRect(52, 83, 36, 4);
}

function drawScrapbook32(ctx) {
  rounded(ctx, 5, 4, 22, 24, 1.4, linear(ctx, 5, 4, 27, 28, [[0, "#5f88b0"], [1, "#3d6790"]]));
  ctx.fillStyle = "#2f5679";
  ctx.fillRect(5, 4, 3.4, 24);
  ctx.fillStyle = "#f2f3f2";
  ctx.fillRect(25.4, 5.6, 2, 20.8);
  rounded(ctx, 11, 9, 13, 14, 0.6, P.white);
  rounded(ctx, 12.2, 10.2, 10.6, 8.4, 0.5, "#8cc4e6");
  shape(ctx, [[12.2, 16], [15, 13.4], [17.4, 16], [19.4, 14.4], [22.8, 17.4], [22.8, 18.6], [12.2, 18.6]], "#7fb583");
  ctx.fillStyle = P.amber;
  ctx.fillRect(19.6, 11.4, 2.2, 2.2);
}

function drawScrapbook16(ctx) {
  rounded(ctx, 2, 2, 12, 12, 0.8, linear(ctx, 2, 2, 14, 14, [[0, "#5f88b0"], [1, "#3d6790"]]));
  ctx.fillStyle = "#2f5679";
  ctx.fillRect(2, 2, 2, 12);
  ctx.fillStyle = "#f2f3f2";
  ctx.fillRect(13, 3, 1.2, 10);
  rounded(ctx, 5, 4.6, 7, 7, 0.4, P.white);
  ctx.fillStyle = "#8cc4e6";
  ctx.fillRect(5.8, 5.4, 5.4, 4);
  shape(ctx, [[5.8, 8.4], [7.4, 6.8], [8.8, 8.4], [9.8, 7.4], [11.2, 8.8], [11.2, 9.4], [5.8, 9.4]], "#7fb583");
}

/* Review Desk ----------------------------------------------------------- */

function drawReviewDeskLarge(ctx, fine) {
  sheet(ctx, 16, 8, 80, 104, 0);
  rules(ctx, 28, 24, 54, fine ? 6 : 4, fine ? 12 : 17, "#d7dadd", 3);
  ctx.strokeStyle = P.red;
  ctx.lineWidth = fine ? 4 : 4.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(30, 62);
  ctx.lineTo(40, 74);
  ctx.lineTo(64, 44);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(30, 90);
  ctx.lineTo(58, 90);
  ctx.stroke();
  ctx.lineCap = "butt";
  contact(ctx, 84, 92, 24, 5, 0.14, 3);
  lens(ctx, 88, 84, 22, 5, 0.9, fine);
}

function drawReviewDesk32(ctx) {
  shape(ctx, [[3, 2], [21, 2], [21, 26], [3, 26]], P.white, "#b4b6b8", 0.7);
  ctx.fillStyle = "#d7dadd";
  for (let index = 0; index < 3; index += 1) ctx.fillRect(6, 6 + index * 4, 12, 1.6);
  ctx.strokeStyle = P.red;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(6.6, 17.4);
  ctx.lineTo(9.4, 20.4);
  ctx.lineTo(15.4, 13.4);
  ctx.stroke();
  ctx.lineCap = "butt";
  ellipse(ctx, 22, 21, 7.4, 7.4, P.grey4, "rgba(50,56,62,.4)", 0.7);
  ellipse(ctx, 22, 21, 5.4, 5.4, linear(ctx, 16, 15, 28, 27, [[0, "#dcefff"], [1, "#4f9fd8"]]));
  ctx.save();
  ctx.translate(22, 21);
  ctx.rotate(0.9);
  rounded(ctx, -1.4, 6, 2.8, 5, 0.9, P.grey3);
  ctx.restore();
}

function drawReviewDesk16(ctx) {
  shape(ctx, [[1.6, 1.2], [11.4, 1.2], [11.4, 11.6], [1.6, 11.6]], P.white, "#a8aaac", 0.6);
  ctx.fillStyle = "#d3d6d9";
  ctx.fillRect(3.2, 3, 6.4, 1.2);
  ctx.fillStyle = "#d3d6d9";
  ctx.fillRect(3.2, 5.2, 4.2, 1.2);
  ctx.strokeStyle = P.red;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(3.6, 8.4);
  ctx.lineTo(5.4, 10.2);
  ctx.lineTo(9.4, 5.8);
  ctx.stroke();
  ctx.lineCap = "butt";
  ellipse(ctx, 11.4, 10.4, 4.4, 4.4, P.grey4, "rgba(50,56,62,.45)", 0.5);
  ellipse(ctx, 11.4, 10.4, 3, 3, linear(ctx, 8, 7, 15, 14, [[0, "#dcefff"], [1, "#4f9fd8"]]));
}

/* DocMap ----------------------------------------------------------------- */

// The document's own structure: a page whose headings branch into the map the
// tool actually renders.
function drawDocMapLarge(ctx, fine) {
  sheet(ctx, 14, 22, 46, 84, 0);
  ctx.fillStyle = "#c9ced3";
  ctx.fillRect(24, 36, 26, 5);
  ctx.fillRect(24, 48, 20, 4);
  if (fine) {
    ctx.fillStyle = "#dde1e5";
    ctx.fillRect(24, 58, 24, 4);
    ctx.fillRect(24, 68, 18, 4);
  }
  ctx.strokeStyle = P.blue;
  ctx.lineWidth = 4.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(60, 64);
  ctx.lineTo(80, 64);
  ctx.moveTo(80, 38);
  ctx.lineTo(80, 90);
  ctx.moveTo(80, 38);
  ctx.lineTo(94, 38);
  ctx.moveTo(80, 64);
  ctx.lineTo(94, 64);
  ctx.moveTo(80, 90);
  ctx.lineTo(94, 90);
  ctx.stroke();
  ctx.lineCap = "butt";
  for (const y of [38, 64, 90]) {
    rounded(ctx, 94, y - 8, 20, 16, 8, y === 64 ? P.blue : "#8fc0ea", "rgba(20,70,120,.25)", 1);
  }
}

function drawDocMap32(ctx) {
  shape(ctx, [[3, 5], [16, 5], [16, 27], [3, 27]], P.white, "#aeb0b2", 0.6);
  ctx.fillStyle = "#c9ced3";
  ctx.fillRect(6, 9, 7, 1.8);
  ctx.fillRect(6, 13, 5, 1.6);
  ctx.strokeStyle = P.blue;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(16, 16);
  ctx.lineTo(21, 16);
  ctx.moveTo(21, 9);
  ctx.lineTo(21, 23);
  ctx.moveTo(21, 9);
  ctx.lineTo(24, 9);
  ctx.moveTo(21, 23);
  ctx.lineTo(24, 23);
  ctx.stroke();
  ctx.lineCap = "butt";
  for (const [y, fill] of [[9, "#8fc0ea"], [16, P.blue], [23, "#8fc0ea"]]) {
    rounded(ctx, y === 16 ? 22 : 24, y - 2.6, 6, 5.2, 2.6, fill);
  }
}

function drawDocMap16(ctx) {
  shape(ctx, [[1.4, 2.4], [8, 2.4], [8, 13.6], [1.4, 13.6]], P.white, "#a6a8aa", 0.5);
  ctx.fillStyle = "#c6cbd0";
  ctx.fillRect(3, 4.6, 3.6, 1.2);
  ctx.strokeStyle = P.blue;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(8, 8);
  ctx.lineTo(10.4, 8);
  ctx.moveTo(10.4, 4.4);
  ctx.lineTo(10.4, 11.6);
  ctx.stroke();
  for (const [x, y, r, fill] of [[12.6, 4.4, 2.2, "#8fc0ea"], [13.2, 8, 2.4, P.blue], [12.6, 11.6, 2.2, "#8fc0ea"]]) {
    ellipse(ctx, x, y, r, r, fill);
  }
}

/* Project Hard Disk ------------------------------------------------------ */

function drawProjectDiskLarge(ctx, fine) {
  shape(ctx, [[24, 28], [104, 28], [110, 42], [18, 42]], linear(ctx, 0, 28, 0, 42, [[0, "#8dc0e6"], [1, "#68a6d4"]]));
  rounded(ctx, 18, 42, 92, 52, 5, linear(ctx, 0, 42, 0, 94, [[0, "#7ab2dd"], [0.6, "#4f92c6"], [1, "#3576ae"]]));
  ctx.fillStyle = "rgba(255,255,255,.45)";
  ctx.fillRect(22, 43.6, 84, 2);
  rounded(ctx, 34, 54, 60, 26, 2, "rgba(255,255,255,.9)");
  ctx.fillStyle = "#8f9498";
  ctx.fillRect(40, 60, 26, 3.6);
  ctx.fillStyle = "#c2c6c9";
  ctx.fillRect(40, 68, 40, 3);
  if (fine) {
    ctx.strokeStyle = "rgba(24,70,110,.24)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(18, 42.5);
    ctx.lineTo(110, 42.5);
    ctx.stroke();
  }
  ellipse(ctx, 98, 86, 3, 3, P.green);
  rounded(ctx, 18, 42, 92, 52, 5, null, "rgba(24,70,110,.28)", 1);
}

function drawProjectDisk32(ctx) {
  shape(ctx, [[7, 6.6], [25, 6.6], [27.4, 10.6], [4.6, 10.6]], "#7fb5e0");
  rounded(ctx, 4.6, 10.6, 22.8, 14, 1.6, linear(ctx, 0, 10.6, 0, 24.6, [[0, "#79b1dc"], [1, "#3576ae"]]), "rgba(24,70,110,.32)", 0.6);
  rounded(ctx, 9, 13.6, 14, 6.4, 0.8, "rgba(255,255,255,.92)");
  ctx.fillStyle = "#8f9498";
  ctx.fillRect(10.4, 15, 7, 1.4);
  ctx.fillStyle = "#c2c6c9";
  ctx.fillRect(10.4, 17.4, 10, 1.2);
  ctx.fillStyle = P.green;
  ctx.fillRect(23.4, 21, 2, 2);
}

function drawProjectDisk16(ctx) {
  shape(ctx, [[3.6, 3], [12.4, 3], [13.8, 5.2], [2.2, 5.2]], "#7fb5e0");
  rounded(ctx, 2.2, 5.2, 11.6, 7.6, 1, linear(ctx, 0, 5.2, 0, 12.8, [[0, "#79b1dc"], [1, "#3576ae"]]), "rgba(24,70,110,.36)", 0.5);
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.fillRect(4.4, 7, 7.2, 3.4);
  ctx.fillStyle = "#8f9498";
  ctx.fillRect(5.2, 7.8, 3.4, 1);
  ctx.fillStyle = P.green;
  ctx.fillRect(11.4, 10.6, 1.4, 1.4);
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

// 128 and 64 share the large construction; 128 keeps the finest detail. 32 and
// 16 run their own recipes in their own coordinate space.
// Two passes: paint once to find the object, then paint again on the shared
// icon grid so a row of these reads as one family instead of a jumble.
function render(id, size) {
  const supersample = 4;
  const unit = size >= 64 ? 128 : size;
  const px = size * supersample;
  const paint = (target) => {
    if (size >= 64) recipes[id].large(target, size >= 128);
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
    const grid = gridTransform("yosemite", id, box, px);
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
    sourceKind: acceptedImagegenCoreIds.has(id) ? "accepted-imagegen-era-illustration" : "original-measured-yosemite-reconstruction",
    reviewStatus: acceptedImagegenCoreIds.has(id) ? "accepted-imagegen" : "accepted-core",
    sizes: {},
    metrics: {},
  };
  for (const size of sizes) {
    let rendered;
    if (acceptedImagegenCoreIds.has(id)) {
      const source = join(acceptedImagegenSourceDir, `${id}-${size}.png`);
      if (!existsSync(source)) throw new Error(`Yosemite ${id}/${size}: missing checked-in accepted Image Gen source ${source}`);
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
  generatedBy: "tooling/build-yosemite-core-icons.mjs",
  coreOnly: true,
  nativeSizes: sizes,
  referenceLedger: "icons/src/yosemite-core-icons.json",
  referenceBoard: "internal/evidence/drafts/era-icons/yosemite-core-reference-board.png",
  sizeRule: "Runtime surfaces downscale the 128 px master. The twelve programmatic cores own separately composed 64 px, 32 px, and 16 px review hints; accepted Image Gen cores use separately processed ledger artifacts.",
  continuityRule: source.continuityRule,
  selectionRecipe: "Finder selection belongs to the label and the view surface; normal and selected states use the same artwork.",
  icons: generated,
};
writeFileSync(join(assetDir, "yosemite-core-icon-family.json"), `${JSON.stringify(family, null, 2)}\n`);
writeFileSync(join(assetDir, "yosemite-core-icon-manifest.json"), `${JSON.stringify(runtimeCore, null, 2)}\n`);

const familyFile = join(themeDir, "yosemite-icon-family.json");
const eraFamily = JSON.parse(readFileSync(familyFile, "utf8"));
eraFamily.runtimeSize = 128;
eraFamily.reviewedCore = ids;
eraFamily.coreBuilder = "tooling/build-yosemite-core-icons.mjs";
for (const id of ids) {
  eraFamily.icons[id] = {
    ...eraFamily.icons[id],
    genre: source.icons[id].genre,
    physicalMetaphor: source.icons[id].prototype,
    metaphorKey: source.icons[id].metaphorKey,
    semanticMark: "object-owned",
    sourceKind: acceptedImagegenCoreIds.has(id) ? "accepted-imagegen-era-illustration" : "original-measured-yosemite-reconstruction",
    reviewStatus: acceptedImagegenCoreIds.has(id) ? "accepted-imagegen" : "accepted-core",
    sizes: Object.fromEntries(sizes.map((size) => [size, `icons/${id}-${size}.png`])),
    runtimePixelMetrics: generated[id].runtimePixelMetrics,
  };
}
eraFamily.icons.docMap.metaphorMetrics = await measureDocMapMetaphor(join(assetDir, "docMap-128.png"), "yosemite");
assertDocMapMetaphor(eraFamily.icons.docMap.metaphorMetrics, "yosemite/docMap");
writeFileSync(familyFile, `${JSON.stringify(eraFamily, null, 2)}\n`);

const manifestFile = join(themeDir, "yosemite-icon-manifest.json");
const eraManifest = JSON.parse(readFileSync(manifestFile, "utf8"));
for (const id of ids) eraManifest[id] = runtimeCore[id];
writeFileSync(manifestFile, `${JSON.stringify(eraManifest, null, 2)}\n`);

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
  ctx.fillStyle = "#e6eaee"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  label(ctx, "Yosemite core · independent 128 / 64 / 32 / 16", 28, 34, { font: "bold 22px sans-serif" });
  label(ctx, "OS X 10.10 · flattened but object-specific; the seven custom objects keep their metaphor", 28, 57, { color: "#5a6069" });
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const x = (index % columns) * cellWidth;
    const y = 74 + Math.floor(index / columns) * cellHeight;
    ctx.fillStyle = index % 2 ? "#f6f8fa" : "#ffffff"; ctx.fillRect(x + 7, y + 7, cellWidth - 14, cellHeight - 14);
    const [large, medium, regular, small] = await Promise.all([128, 64, 32, 16]
      .map((size) => loadImage(join(assetDir, `${id}-${size}.png`))));
    ctx.drawImage(large, x + 12, y + 32, 128, 128);
    ctx.drawImage(medium, x + 146, y + 42, 64, 64);
    ctx.drawImage(regular, x + 146, y + 112, 32, 32);
    ctx.drawImage(small, x + 186, y + 120, 16, 16);
    label(ctx, source.icons[id].label, x + 14, y + 26, { font: "bold 13px sans-serif" });
    label(ctx, id, x + 146, y + 160, { font: "12px monospace", color: "#5a6069" });
    label(ctx, "128 · 64 · 32 · 16", x + 146, y + 176, { font: "11px sans-serif", color: "#7b828a" });
  }
  writeFileSync(join(draftDir, "yosemite-core-contact-sheet.png"), canvas.toBuffer("image/png"));
}

async function referenceBoard() {
  const entries = source.referenceBoard;
  const cellWidth = 260;
  const cellHeight = 120;
  const columns = 3;
  const rows = Math.ceil(entries.length / columns);
  const canvas = createCanvas(cellWidth * columns, 76 + cellHeight * rows);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#eef1f4"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  label(ctx, "Yosemite reference board", 24, 34, { font: "bold 21px sans-serif" });
  label(ctx, "Measured 10.10 evidence: silhouette, container decision, palette. Evidence stays local.", 24, 56, { color: "#5a6069" });
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const x = (index % columns) * cellWidth;
    const y = 76 + Math.floor(index / columns) * cellHeight;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(x + 8, y + 6, cellWidth - 16, cellHeight - 14);
    label(ctx, entry.label, x + 16, y + 26, { font: "bold 13px sans-serif" });
    label(ctx, entry.coreId ? `→ ${entry.coreId}` : "family control only", x + 16, y + 44, { font: "12px monospace", color: "#3f7bb0" });
    const palette = entry.measured?.palette || [];
    for (let swatch = 0; swatch < palette.length; swatch += 1) {
      ctx.fillStyle = palette[swatch];
      ctx.fillRect(x + 16 + swatch * 18, y + 54, 16, 16);
      ctx.strokeStyle = "#c3c8cd"; ctx.lineWidth = 1;
      ctx.strokeRect(x + 16.5 + swatch * 18, y + 54.5, 15, 15);
    }
    label(ctx, entry.silhouette || "", x + 16, y + 88, { font: "11px sans-serif", color: "#5a6069" });
    label(ctx, `container: ${entry.container || "free-form"}`, x + 16, y + 104, { font: "11px sans-serif", color: "#5a6069" });
  }
  writeFileSync(join(draftDir, "yosemite-core-reference-board.png"), canvas.toBuffer("image/png"));
}

await contactSheet();
await referenceBoard();

if (!existsSync(join(assetDir, "finderApp-128.png"))) throw new Error("Yosemite core build produced no artwork");
console.log(`OK  Yosemite core: ${ids.length} objects × ${sizes.join("/")} px, boards rebuilt`);
