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
const assetDir = join(root, "apps/desktop/assets/themes/aqua/icons");
const acceptedImagegenSourceDir = join(assetDir, "imagegen-source");
const evidenceDir = join(root, "internal/evidence/drafts/theme-lab-fidelity-cache/aqua");
const sourceFile = join(assetDir, "src/aqua-core-icons.json");
const draftDir = join(root, "internal/evidence/drafts/era-icons");
if (!existsSync(sourceFile)) throw new Error(`Missing Aqua core-icon source ledger: ${sourceFile}`);
const source = JSON.parse(readFileSync(sourceFile, "utf8"));
const ids = Object.keys(source.icons);
const sizes = [128, 32, 16];

mkdirSync(assetDir, { recursive: true });
mkdirSync(draftDir, { recursive: true });

const P = Object.freeze({
  ink: "#243442",
  deep: "#315a83",
  blue: "#378dce",
  aqua: "#79c7ef",
  pale: "#dff4ff",
  white: "#ffffff",
  steel0: "#f9fbfd",
  steel1: "#dce5ec",
  steel2: "#9aa8b5",
  steel3: "#657482",
  steel4: "#3f4d59",
  paper: "#fbfcfc",
  paperShadow: "#c4ced6",
  red: "#c94032",
  yellow: "#e7b636",
  green: "#4c9a62",
  leather: "#4f6f8d",
  wood: "#b67b43",
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

function shape(ctx, points, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index][0], points[index][1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function rounded(ctx, x, y, width, height, radius, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function ellipse(ctx, x, y, radiusX, radiusY, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function line(ctx, x0, y0, x1, y1, color, width = 1, cap = "round") {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.stroke();
}

function softShadow(ctx, x, y, radiusX, radiusY, blur, alpha = 0.28) {
  ctx.save();
  ctx.shadowColor = `rgba(22, 35, 48, ${alpha})`;
  ctx.shadowBlur = blur;
  ctx.fillStyle = `rgba(22, 35, 48, ${Math.max(0.06, alpha * 0.45)})`;
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function steel(ctx, y0, y1) {
  return linear(ctx, 0, y0, 0, y1, [[0, P.steel0], [0.19, P.steel1], [0.47, P.steel2], [0.67, "#eef3f6"], [1, P.steel3]]);
}

function aquaBlue(ctx, y0, y1) {
  return linear(ctx, 0, y0, 0, y1, [[0, P.pale], [0.18, "#9ad9f7"], [0.52, P.aqua], [0.78, P.blue], [1, P.deep]]);
}

function paper(ctx, x0, y0, x1, y1) {
  return linear(ctx, x0, y0, x1, y1, [[0, P.white], [0.65, P.paper], [1, P.paperShadow]]);
}

// This product's Finder is the launcher and volume browser, so Jaguar draws
// that browser: an Aqua window with a striped title bar and the writing objects
// inside it.
function drawFinder128(ctx) {
  softShadow(ctx, 64, 110, 44, 7, 9, 0.3);
  rounded(ctx, 12, 20, 104, 86, 8, P.paper, "#7c8b98", 2);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(12, 20, 104, 86, 8);
  ctx.clip();
  ctx.fillStyle = linear(ctx, 0, 20, 0, 42, [[0, "#fdfdfe"], [0.5, "#dfe5eb"], [1, "#b9c3cd"]]);
  ctx.fillRect(12, 20, 104, 22);
  ctx.strokeStyle = "rgba(255,255,255,.7)";
  ctx.lineWidth = 1;
  for (let y = 24; y < 40; y += 3) {
    ctx.beginPath();
    ctx.moveTo(12, y);
    ctx.lineTo(116, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#e8edf2";
  ctx.fillRect(12, 42, 26, 64);
  ctx.restore();
  for (const [index, color, edge] of [[0, "#f26d5f", "#a8352c"], [1, "#f5c04a", "#a8791f"], [2, "#7bc45f", "#3f7a2c"]]) {
    ellipse(ctx, 22 + index * 11, 31, 4.4, 4.4,
      radial(ctx, 20 + index * 11, 29, 0.6, 22 + index * 11, 31, 5, [[0, "#ffffff"], [0.45, color], [1, edge]]), edge, 0.8);
  }
  shape(ctx, [[46, 54], [62, 54], [67, 61], [96, 61], [96, 90], [46, 90]],
    aquaBlue(ctx, 54, 90), "#4f83ab", 1.4);
  shape(ctx, [[50, 64], [92, 64], [90, 72], [52, 72]], "rgba(255,255,255,.45)");
  shape(ctx, [[74, 44], [92, 44], [102, 54], [102, 86], [74, 86]], paper(ctx, 74, 44, 102, 86), P.paperShadow, 1.2);
  ctx.fillStyle = "#b9c2ca";
  for (let index = 0; index < 3; index += 1) ctx.fillRect(79, 60 + index * 8, index === 2 ? 12 : 19, 3);
}

function drawFinder32(ctx) {
  softShadow(ctx, 16, 28, 11, 2, 2.3, 0.28);
  rounded(ctx, 3, 6, 26, 21, 2.4, P.paper, "#78838d", 0.8);
  ctx.fillStyle = linear(ctx, 0, 6, 0, 12, [[0, "#fdfdfe"], [1, "#c2ccd5"]]);
  ctx.beginPath();
  ctx.roundRect(3, 6, 26, 6, [2.4, 2.4, 0, 0]);
  ctx.fill();
  ctx.fillStyle = "#e8edf2";
  ctx.fillRect(3, 12, 6.5, 15);
  for (const [index, color] of [[0, "#ef6a5c"], [1, "#f2bd48"], [2, "#78c15c"]]) ellipse(ctx, 5.4 + index * 3, 9, 1.2, 1.2, color);
  shape(ctx, [[12, 15], [17, 15], [18.4, 17], [25, 17], [25, 24], [12, 24]], aquaBlue(ctx, 15, 24), "#4f83ab", 0.5);
  shape(ctx, [[19, 12.6], [24, 12.6], [26.4, 15], [26.4, 22], [19, 22]], P.white, P.paperShadow, 0.5);
}

function drawFinder16(ctx) {
  softShadow(ctx, 8, 14, 5.6, 1, 1.1, 0.25);
  rounded(ctx, 1.4, 3, 13.2, 10.6, 1.4, P.paper, "#74808a", 0.55);
  ctx.fillStyle = "#c8d1d9";
  ctx.beginPath();
  ctx.roundRect(1.4, 3, 13.2, 3.2, [1.4, 1.4, 0, 0]);
  ctx.fill();
  ctx.fillStyle = "#e8edf2";
  ctx.fillRect(1.4, 6.2, 3.6, 7.4);
  shape(ctx, [[6, 8], [8.6, 8], [9.4, 9], [13, 9], [13, 12.4], [6, 12.4]], "#63aede");
  shape(ctx, [[9.8, 6.6], [12.4, 6.6], [13.6, 7.8], [13.6, 11.4], [9.8, 11.4]], P.white, P.paperShadow, 0.4);
}


function drawFolder128(ctx) {
  softShadow(ctx, 67, 106, 49, 9, 10, 0.28);
  shape(ctx, [[15, 37], [24, 23], [53, 23], [61, 31], [108, 31], [115, 97], [106, 108], [23, 105]], linear(ctx, 0, 23, 0, 108, [[0, "#f4fbff"], [0.18, "#b8def2"], [0.55, "#68b2dd"], [1, "#2f76b3"]]), "#5b87aa", 2);
  shape(ctx, [[18, 43], [112, 40], [104, 101], [25, 101]], linear(ctx, 18, 40, 105, 104, [[0, "#d8f4ff"], [0.24, "#8bd2f2"], [0.68, "#4b9fd3"], [1, "#2f6ea9"]]), "#5b8dad", 1.5);
  shape(ctx, [[23, 47], [106, 45], [101, 58], [27, 60]], "rgba(255,255,255,.42)");
  line(ctx, 28, 97, 99, 97, "rgba(220,246,255,.66)", 2);
}

function drawFolder32(ctx) {
  softShadow(ctx, 16.5, 27, 12, 2.2, 2.3, 0.25);
  shape(ctx, [[3, 9], [6, 5], [13, 5], [15, 7], [27, 7], [29, 25], [26, 28], [6, 27]], aquaBlue(ctx, 5, 28), "#527f9f", 0.8);
  shape(ctx, [[4, 11], [28, 10], [26, 25], [6, 25]], linear(ctx, 4, 10, 26, 25, [[0, "#d8f4ff"], [0.5, "#75bee6"], [1, "#357db8"]]), "#6297b7", 0.5);
  line(ctx, 7, 13, 26, 12.4, "rgba(255,255,255,.65)", 0.8);
}

function drawFolder16(ctx) {
  softShadow(ctx, 8, 13.8, 5.8, 1.1, 1.2, 0.22);
  shape(ctx, [[1.5, 5], [3.5, 2.5], [6.8, 2.5], [8, 4], [14, 4], [14.7, 12.7], [13, 14], [3, 13.5]], aquaBlue(ctx, 2.5, 14), "#4d799b", 0.55);
  shape(ctx, [[2.3, 6], [14, 5.4], [13, 12.2], [3.2, 12.3]], "#65b4df");
  line(ctx, 3.2, 6.6, 13.4, 6.1, "rgba(255,255,255,.65)", 0.55);
}

function drawHardDisk128(ctx) {
  softShadow(ctx, 64, 108, 45, 8, 9, 0.32);
  shape(ctx, [[27, 20], [96, 20], [108, 35], [111, 92], [101, 105], [25, 105], [17, 94], [21, 36]], steel(ctx, 20, 105), "#56616a", 2);
  shape(ctx, [[25, 24], [95, 24], [103, 35], [100, 45], [28, 45], [22, 35]], linear(ctx, 0, 22, 0, 45, [[0, "#ffffff"], [0.45, "#b7c1ca"], [1, "#7e8994"]]), "#7d8790", 1.2);
  ellipse(ctx, 64, 63, 24, 14, radial(ctx, 55, 55, 2, 64, 65, 26, [[0, "#f8fafb"], [0.52, "#c4ccd2"], [1, "#7f8991"]]), "#7a858d", 1.2);
  ellipse(ctx, 64, 63, 7, 4, "#b2bbc2", "#6a757e", 1);
  rounded(ctx, 28, 83, 69, 12, 3, linear(ctx, 0, 83, 0, 95, [[0, "#8c99a5"], [1, "#4a5660"]]));
  line(ctx, 36, 88, 82, 88, "#2c353d", 2);
  ellipse(ctx, 92, 89, 2.2, 2.2, "#5fd26e", "#285132", 0.7);
  for (const [x, y] of [[29, 32], [95, 32], [29, 97], [96, 97]]) ellipse(ctx, x, y, 2.2, 2.2, "#6e7881", "#eef2f4", 0.7);
}

function drawHardDisk32(ctx) {
  softShadow(ctx, 16, 27.2, 11, 2, 2.2, 0.3);
  shape(ctx, [[7, 4], [24, 4], [27, 8], [28, 23], [25, 27], [6, 27], [4, 24], [5, 8]], steel(ctx, 4, 27), "#56616a", 0.75);
  ellipse(ctx, 16, 15, 6, 3.8, "#c3ccd2", "#7b858d", 0.6); ellipse(ctx, 16, 15, 1.8, 1.1, "#8e989f");
  rounded(ctx, 7, 21, 18, 3.6, 0.8, "#586570");
  line(ctx, 9, 22.6, 20, 22.6, "#28323a", 0.7); ellipse(ctx, 23, 22.8, 0.65, 0.65, "#61d370");
}

function drawHardDisk16(ctx) {
  softShadow(ctx, 8, 13.7, 5.4, 1, 1.1, 0.28);
  shape(ctx, [[3.5, 2], [12, 2], [14, 4.5], [14.5, 11.7], [12.5, 14], [3, 14], [2, 12]], steel(ctx, 2, 14), "#53616c", 0.5);
  ellipse(ctx, 8, 7.5, 3.2, 1.8, "#bdc6cc", "#77828a", 0.45);
  ctx.fillStyle = "#4a5660"; ctx.fillRect(4, 10.8, 8, 1.8); ctx.fillStyle = "#65d174"; ctx.fillRect(11.2, 11.3, 0.7, 0.7);
}

function drawTrash128(ctx) {
  softShadow(ctx, 64, 112, 35, 7, 8, 0.28);
  shape(ctx, [[25, 36], [103, 36], [92, 108], [38, 108]], linear(ctx, 0, 34, 0, 109, [[0, "rgba(235,244,250,.78)"], [0.38, "rgba(143,169,188,.68)"], [1, "rgba(69,91,108,.78)"]]), "#566875", 2);
  ellipse(ctx, 64, 36, 39, 10, steel(ctx, 25, 45), "#556572", 2);
  ellipse(ctx, 64, 36, 31, 6.2, "#53626e", "#eef5f8", 1.2);
  for (let index = 0; index < 9; index += 1) {
    const xTop = 32 + index * 8;
    const xBottom = 41 + index * 5.7;
    line(ctx, xTop, 42, xBottom, 103, index % 2 ? "#7d919f" : "#d7e4ea", 2);
  }
  for (const y of [51, 65, 79, 93]) line(ctx, 34 + (y - 42) * 0.12, y, 94 - (y - 42) * 0.12, y, "rgba(65,83,97,.55)", 1.5);
  ellipse(ctx, 65, 106, 27, 5, "#52626f", "#aebdc7", 1.2);
}

function drawTrash32(ctx) {
  softShadow(ctx, 16, 28, 8.2, 1.8, 2, 0.25);
  shape(ctx, [[6, 9], [26, 9], [23, 28], [9, 28]], linear(ctx, 0, 9, 0, 28, [[0, "#dce8ee"], [0.5, "#8fa6b5"], [1, "#536575"]]), "#52616d", 0.7);
  ellipse(ctx, 16, 9, 10, 2.7, "#c8d5dc", "#53636f", 0.8); ellipse(ctx, 16, 9, 7.8, 1.5, "#52616d");
  for (const x of [9, 12, 16, 20, 23]) line(ctx, x, 11, 10 + (x - 9) * 0.7, 26, x % 2 ? "#dce7ec" : "#758a99", 0.7);
  ellipse(ctx, 16, 27, 7, 1.4, "#52616d");
}

function drawTrash16(ctx) {
  softShadow(ctx, 8, 14, 4.2, 0.9, 1, 0.22);
  shape(ctx, [[3, 5], [13, 5], [11.5, 14], [4.5, 14]], linear(ctx, 0, 5, 0, 14, [[0, "#dbe6ec"], [1, "#5f7381"]]), "#52616d", 0.5);
  ellipse(ctx, 8, 5, 5, 1.4, "#bccbd3", "#53636f", 0.5); ellipse(ctx, 8, 5, 3.8, 0.75, "#53636f");
  for (const x of [5, 7, 9, 11]) line(ctx, x, 6.2, 5.5 + (x - 5) * 0.8, 13, x % 2 ? "#dbe5ea" : "#748996", 0.5);
}

function drawDocument128(ctx) {
  softShadow(ctx, 68, 111, 34, 6, 8, 0.24);
  shape(ctx, [[31, 12], [82, 12], [103, 33], [103, 105], [94, 113], [29, 108]], paper(ctx, 29, 12, 103, 113), "#9aa9b3", 1.8);
  shape(ctx, [[82, 12], [103, 33], [82, 33]], linear(ctx, 82, 12, 103, 33, [[0, "#f9fbfc"], [1, "#b8c6cf"]]), "#9caab3", 1.2);
  ctx.fillStyle = "rgba(255,255,255,.74)"; ctx.fillRect(34, 17, 4, 84);
  ctx.fillStyle = "rgba(150,168,181,.14)"; ctx.fillRect(93, 38, 5, 63);
}

function drawDocument32(ctx) {
  softShadow(ctx, 17, 28.3, 8, 1.6, 2, 0.22);
  shape(ctx, [[8, 3], [20, 3], [26, 9], [26, 26], [23, 29], [7, 28]], paper(ctx, 7, 3, 26, 29), "#91a1ac", 0.6);
  shape(ctx, [[20, 3], [26, 9], [20, 9]], "#d3dce2", "#9aa8b1", 0.4);
  line(ctx, 9.5, 5.5, 9.5, 25, "rgba(255,255,255,.85)", 0.8);
}

function drawDocument16(ctx) {
  softShadow(ctx, 8.5, 14.2, 4, 0.8, 1, 0.2);
  shape(ctx, [[4, 1.5], [10, 1.5], [13.5, 5], [13.5, 13.5], [12, 15], [3.5, 14.2]], paper(ctx, 3.5, 1.5, 13.5, 15), "#8798a4", 0.45);
  shape(ctx, [[10, 1.5], [13.5, 5], [10, 5]], "#cbd6dd", "#94a3ad", 0.35);
}

function drawApplication128(ctx) {
  softShadow(ctx, 66, 108, 41, 7, 9, 0.3);
  ctx.save(); ctx.translate(64, 65); ctx.rotate(-0.58); rounded(ctx, -8, -51, 16, 101, 4, linear(ctx, 0, -51, 0, 50, [[0, "#ffe895"], [0.45, P.yellow], [1, "#9e6522"]]), "#765126", 1.5); ctx.restore();
  ctx.save(); ctx.translate(64, 65); ctx.rotate(0.64); rounded(ctx, -7, -52, 14, 105, 3, linear(ctx, 0, -52, 0, 53, [[0, "#ef6d55"], [0.55, P.red], [1, "#7c2c25"]]), "#752c27", 1.5); shape(ctx, [[-7, -52], [0, -64], [7, -52]], "#e6bd79", "#6b4d31", 1); shape(ctx, [[-2, -61], [0, -65], [2, -61]], "#333b42"); ctx.restore();
  ctx.save(); ctx.translate(64, 65); ctx.rotate(0.05); rounded(ctx, -6, -50, 12, 82, 5, steel(ctx, -50, 32), "#66737d", 1.2); shape(ctx, [[-8, 32], [8, 32], [13, 49], [-13, 49]], linear(ctx, 0, 32, 0, 49, [[0, "#5aa4d1"], [1, "#1c5b91"]]), "#324e63", 1); ctx.restore();
  ellipse(ctx, 64, 65, 8, 8, "#e7edf1", "#596773", 1.5);
  ellipse(ctx, 64, 65, 3, 3, "#5d6d79");
}

function drawApplication32(ctx) {
  softShadow(ctx, 16, 27, 10, 1.8, 2, 0.26);
  ctx.save(); ctx.translate(16, 16); ctx.rotate(-0.58); rounded(ctx, -2, -12, 4, 24, 1, "#e5b733", "#775129", 0.6); ctx.restore();
  ctx.save(); ctx.translate(16, 16); ctx.rotate(0.64); rounded(ctx, -1.8, -13, 3.6, 26, 0.8, "#c94736", "#712c26", 0.6); shape(ctx, [[-1.8, -13], [0, -16], [1.8, -13]], "#e6bf78", "#695039", 0.4); ctx.restore();
  ctx.save(); ctx.translate(16, 16); ctx.rotate(0.04); rounded(ctx, -1.6, -12, 3.2, 20, 1, "#bfcbd3", "#5b6974", 0.5); shape(ctx, [[-2, 8], [2, 8], [3.2, 13], [-3.2, 13]], "#2e77ae", "#3a5569", 0.5); ctx.restore();
  ellipse(ctx, 16, 16, 2.2, 2.2, "#eef2f4", "#5c6872", 0.5);
}

function drawApplication16(ctx) {
  softShadow(ctx, 8, 13.8, 5, 0.9, 1, 0.24);
  line(ctx, 3.5, 12.8, 12.5, 3.2, "#d9a92e", 2.2, "butt");
  line(ctx, 3.4, 3.2, 12.7, 13, "#ba3d31", 2.1, "butt");
  line(ctx, 8, 2.2, 8, 11.5, "#aebcc6", 2, "butt");
  shape(ctx, [[6.4, 11], [9.6, 11], [10.7, 14.4], [5.3, 14.4]], "#2f78ae", "#425a6b", 0.45);
  ellipse(ctx, 8, 8, 1.2, 1.2, "#edf2f5", "#54636f", 0.4);
}

function drawControlPanel128(ctx) {
  softShadow(ctx, 64, 110, 40, 7, 8, 0.3);
  rounded(ctx, 18, 25, 92, 65, 10, steel(ctx, 25, 90), "#5d6b76", 2);
  rounded(ctx, 26, 33, 76, 47, 6, linear(ctx, 0, 33, 0, 80, [[0, "#e8f7ff"], [0.48, "#8cc9eb"], [1, "#356f9f"]]), "#61798a", 1.5);
  rounded(ctx, 37, 45, 13, 26, 3, "#bd3734", "#782724", 1);
  rounded(ctx, 57, 39, 17, 32, 4, linear(ctx, 0, 39, 0, 71, [[0, "#8ed0fa"], [1, "#245fab"]]), "#315f8f", 1);
  rounded(ctx, 81, 51, 11, 20, 3, "#f1f4f5", "#65737d", 1);
  shape(ctx, [[48, 90], [80, 90], [86, 105], [42, 105]], steel(ctx, 90, 105), "#5c6872", 1.4);
  rounded(ctx, 34, 104, 60, 6, 3, "#73818c", "#4c5963", 1);
}

function drawControlPanel32(ctx) {
  softShadow(ctx, 16, 27.5, 10, 1.7, 2, 0.27);
  rounded(ctx, 4, 6, 24, 17, 2.5, steel(ctx, 6, 23), "#5c6a75", 0.7);
  rounded(ctx, 6, 8, 20, 12, 1.5, "#9ccde7", "#637986", 0.5);
  rounded(ctx, 9, 11, 3, 6, 0.6, "#bd3734"); rounded(ctx, 14, 9, 4, 8, 0.7, "#3673bd"); rounded(ctx, 21, 12, 2.5, 5, 0.5, "#edf1f3");
  shape(ctx, [[12, 23], [20, 23], [22, 27], [10, 27]], "#a6b2bb", "#606d77", 0.5); line(ctx, 9, 28, 23, 28, "#596771", 1.4);
}

function drawControlPanel16(ctx) {
  softShadow(ctx, 8, 14, 5, 0.8, 1, 0.24);
  rounded(ctx, 2, 3, 12, 9, 1.4, steel(ctx, 3, 12), "#596873", 0.5);
  rounded(ctx, 3, 4, 10, 6.5, 0.8, "#8fc4df", "#637985", 0.35);
  ctx.fillStyle = "#ba3935"; ctx.fillRect(4.3, 6, 1.8, 3.2); ctx.fillStyle = "#3575bc"; ctx.fillRect(7.2, 5, 2, 4.2); ctx.fillStyle = "#eef2f3"; ctx.fillRect(10.5, 6.5, 1.4, 2.7);
  shape(ctx, [[6, 12], [10, 12], [11, 14], [5, 14]], "#8f9ca6");
}

function drawSearcher128(ctx) {
  softShadow(ctx, 67, 109, 39, 7, 9, 0.28);
  ellipse(ctx, 56, 52, 36, 36, radial(ctx, 44, 38, 4, 56, 55, 39, [[0, "#e8fbff"], [0.25, "#a7e0f7"], [0.68, "#4fa2d5"], [1, "#1e5f98"]]), "#677987", 5);
  ellipse(ctx, 49, 43, 17, 10, "rgba(255,255,255,.45)");
  ctx.save(); ctx.translate(84, 82); ctx.rotate(-0.72); rounded(ctx, -7, -5, 14, 46, 6, steel(ctx, -5, 41), "#52606b", 1.5); rounded(ctx, -5, 25, 10, 19, 4, linear(ctx, 0, 25, 0, 44, [[0, "#415462"], [1, "#1f2d37"]])); ctx.restore();
}

function drawSearcher32(ctx) {
  softShadow(ctx, 17, 27.6, 9.5, 1.7, 2, 0.25);
  ellipse(ctx, 13.5, 13.5, 8.5, 8.5, radial(ctx, 10, 9, 1, 14, 14, 9, [[0, "#e8fbff"], [0.45, "#75c5ea"], [1, "#256ba3"]]), "#667986", 1.2);
  ctx.save(); ctx.translate(21, 21); ctx.rotate(-0.72); rounded(ctx, -1.6, -1, 3.2, 10, 1.2, "#7f909b", "#4c5a64", 0.5); ctx.restore();
  ellipse(ctx, 11, 10, 3.4, 2, "rgba(255,255,255,.45)");
}

function drawSearcher16(ctx) {
  softShadow(ctx, 8.5, 14, 4.6, 0.8, 1, 0.22);
  ellipse(ctx, 6.7, 6.7, 4.2, 4.2, "#69b9df", "#596d7a", 0.8);
  ellipse(ctx, 5.5, 5.3, 1.7, 1, "rgba(255,255,255,.55)");
  line(ctx, 9.7, 9.7, 14, 14, "#4d5e6a", 2.2, "round");
}

function drawTeachText128(ctx) {
  softShadow(ctx, 66, 110, 39, 7, 9, 0.27);
  shape(ctx, [[27, 18], [79, 12], [103, 34], [99, 105], [36, 112]], paper(ctx, 27, 12, 103, 112), "#9baab4", 1.6);
  shape(ctx, [[79, 12], [103, 34], [80, 36]], "#d4dfe5", "#9aa8b1", 1);
  for (const [y, width] of [[49, 39], [59, 51], [69, 44], [79, 54]]) line(ctx, 42, y, 42 + width, y - 2, "#7893a6", 2);
  ctx.save(); ctx.translate(69, 79); ctx.rotate(-0.74); rounded(ctx, -5, -42, 10, 79, 4, linear(ctx, 0, -42, 0, 37, [[0, "#d6edfb"], [0.45, "#3a91c8"], [1, "#245c86"]]), "#38576c", 1.2); shape(ctx, [[-5, -42], [0, -53], [5, -42]], steel(ctx, -53, -42), "#576773", 1); ctx.restore();
}

function drawTeachText32(ctx) {
  softShadow(ctx, 16, 27.5, 9.5, 1.7, 2, 0.24);
  shape(ctx, [[7, 5], [19, 3], [26, 9], [25, 26], [9, 28]], paper(ctx, 7, 3, 26, 28), "#91a1ac", 0.6);
  shape(ctx, [[19, 3], [26, 9], [20, 9]], "#d0dbe1", "#97a5ae", 0.4);
  line(ctx, 11, 14, 20, 13.5, "#718da1", 0.8); line(ctx, 11, 18, 22, 17.3, "#718da1", 0.8);
  ctx.save(); ctx.translate(18, 20); ctx.rotate(-0.7); rounded(ctx, -1.2, -8, 2.4, 16, 0.7, "#3385b8", "#36566b", 0.5); ctx.restore();
}

function drawTeachText16(ctx) {
  softShadow(ctx, 8, 14.2, 4.7, 0.8, 1, 0.22);
  shape(ctx, [[3.5, 2.5], [9.5, 1.5], [13.5, 5], [13, 13.5], [4.5, 14.5]], paper(ctx, 3.5, 1.5, 13.5, 14.5), "#8798a4", 0.45);
  shape(ctx, [[9.5, 1.5], [13.5, 5], [10, 5]], "#ccd7de");
  line(ctx, 5.5, 8, 10, 7.7, "#718da1", 0.55); line(ctx, 5.5, 10, 11, 9.6, "#718da1", 0.55);
  line(ctx, 8, 13, 12.7, 7.5, "#2d78a9", 1.4);
}

// ClioTalk is a written conversation kept as a file, with its material
// attached: an illustrated transcript and a second sheet under a chrome clip.
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

// ClioTalk: a written conversation kept as a file. Jaguar paper, an inked
// quotation mark, the two voices below it, and the earlier turn behind.
function drawAssistant128(ctx) {
  softShadow(ctx, 66, 112, 42, 7, 9, 0.3);
  ctx.save();
  ctx.translate(76, 58);
  ctx.rotate(0.08);
  shape(ctx, [[-30, -44], [30, -44], [30, 44], [-30, 44]], "#eef2f5", "#b9c3cb", 1.4);
  ctx.restore();
  ctx.save();
  ctx.translate(56, 62);
  ctx.rotate(-0.05);
  shape(ctx, [[-34, -46], [34, -46], [34, 46], [-34, 46]], paper(ctx, -34, -46, 34, 46), P.paperShadow, 1.6);
  quoteMark(ctx, -22, -34, 7.5, P.deep);
  ctx.fillStyle = "#aebac4";
  ctx.fillRect(-22, 4, 44, 4);
  ctx.fillRect(-22, 13, 34, 4);
  ctx.fillStyle = "#7f8d99";
  ctx.fillRect(-6, 24, 28, 4);
  ctx.fillStyle = "#aebac4";
  ctx.fillRect(-6, 33, 22, 4);
  ctx.restore();
}

function drawAssistant32(ctx) {
  softShadow(ctx, 16, 29, 11, 2, 2.2, 0.26);
  shape(ctx, [[12, 3], [28, 3], [28, 25], [12, 25]], "#eef2f5", "#b4bec6", 0.5);
  shape(ctx, [[4, 6], [21, 6], [21, 28], [4, 28]], P.white, P.paperShadow, 0.6);
  quoteMark(ctx, 6.8, 10, 2.3, P.deep);
  ctx.fillStyle = "#aebac4";
  ctx.fillRect(6.8, 20, 11, 2);
  ctx.fillStyle = "#7f8d99";
  ctx.fillRect(10, 23.8, 8, 2);
}

function drawAssistant16(ctx) {
  softShadow(ctx, 8, 14.6, 5.6, 1, 1.1, 0.24);
  shape(ctx, [[6, 1.4], [14, 1.4], [14, 12], [6, 12]], "#eef2f5", "#adb8c1", 0.4);
  shape(ctx, [[2, 3], [10.6, 3], [10.6, 13.6], [2, 13.6]], P.white, P.paperShadow, 0.5);
  quoteMark(ctx, 3.3, 5, 1.35, P.deep);
  ctx.fillStyle = "#9aa7b2";
  ctx.fillRect(3.3, 10.4, 5.6, 1.4);
}



function drawScrapbook128(ctx) {
  softShadow(ctx, 65, 110, 43, 7, 9, 0.3);
  shape(ctx, [[24, 24], [92, 15], [108, 95], [39, 111]], linear(ctx, 24, 15, 108, 111, [[0, "#7898b2"], [0.42, P.leather], [1, "#29455d"]]), "#263f52", 2);
  shape(ctx, [[34, 28], [86, 21], [97, 88], [45, 99]], "#e7eef2", "#b9c6ce", 1.3);
  shape(ctx, [[43, 39], [75, 34], [82, 62], [49, 68]], linear(ctx, 43, 34, 82, 68, [[0, "#e9f7ff"], [0.5, "#72b8dc"], [1, "#4d865f"]]), "#7c8f99", 1);
  shape(ctx, [[63, 58], [91, 52], [94, 79], [67, 86]], linear(ctx, 63, 52, 94, 86, [[0, "#fff1c5"], [0.6, "#d6a65c"], [1, "#845d37"]]), "#8b755d", 1);
  for (const y of [29, 43, 57, 71, 85, 98]) ellipse(ctx, 30 + (y - 29) * 0.08, y, 4, 2.2, "#c3cdd4", "#4c5d69", 0.8);
  line(ctx, 34, 26, 45, 103, "#1c3345", 3);
}

function drawScrapbook32(ctx) {
  softShadow(ctx, 16, 27.5, 10.5, 1.8, 2, 0.27);
  shape(ctx, [[6, 6], [23, 4], [27, 24], [10, 28]], linear(ctx, 6, 4, 27, 28, [[0, "#7695ae"], [1, "#2d4a61"]]), "#263f52", 0.7);
  shape(ctx, [[9, 8], [21, 6.5], [23.5, 20], [11.5, 22.5]], "#e6edf1", "#aebbc3", 0.5);
  shape(ctx, [[11, 10], [18, 9], [19, 15], [12, 16]], "#68a9c8", "#728a95", 0.4); shape(ctx, [[16, 14], [22, 13], [22.8, 19], [17, 20]], "#d5a55f", "#87745e", 0.4);
  line(ctx, 8, 6, 11, 26, "#1f3547", 1.2);
  for (const y of [8, 13, 18, 23]) ellipse(ctx, 7.3, y, 1, 0.55, "#c1ccd3", "#4b5b67", 0.3);
}

function drawScrapbook16(ctx) {
  softShadow(ctx, 8, 14, 5, 0.9, 1, 0.24);
  shape(ctx, [[3, 3], [11.5, 2], [13.7, 12], [5, 14]], linear(ctx, 3, 2, 14, 14, [[0, "#7897ae"], [1, "#2c4a61"]]), "#253e51", 0.5);
  shape(ctx, [[5, 4.2], [10.8, 3.5], [11.8, 9.7], [6, 11]], "#e5edf1");
  ctx.fillStyle = "#6aa8c5"; ctx.fillRect(6, 5, 3.6, 2.8); ctx.fillStyle = "#d3a25b"; ctx.fillRect(8.3, 7.6, 3.2, 2.7);
  line(ctx, 4, 3.2, 5.5, 13, "#1e3446", 0.8);
}

function drawProjectDisk128(ctx) {
  softShadow(ctx, 65, 108, 47, 8, 9, 0.34);
  shape(ctx, [[20, 32], [32, 20], [98, 20], [109, 32], [112, 92], [101, 105], [26, 105], [16, 94]], steel(ctx, 20, 105), "#4f5d68", 2);
  shape(ctx, [[24, 32], [34, 24], [95, 24], [104, 33], [100, 42], [28, 42]], "#eef3f6", "#87939c", 1.1);
  rounded(ctx, 29, 51, 70, 34, 5, linear(ctx, 0, 51, 0, 85, [[0, "#5ca6dc"], [0.58, "#2f78be"], [1, "#174f91"]]), "#315a80", 1.5);
  rounded(ctx, 41, 59, 46, 18, 2.5, "#d9eef9", "#426b89", 1);
  line(ctx, 48, 66, 80, 66, "#477995", 2); line(ctx, 48, 71, 70, 71, "#6f96aa", 1.5);
  rounded(ctx, 29, 91, 70, 7, 2, "#4b5863"); ellipse(ctx, 93, 94.5, 2, 2, "#5bd16b", "#244d2f", 0.6);
}

function drawProjectDisk32(ctx) {
  softShadow(ctx, 16, 27, 11.5, 2, 2.2, 0.31);
  shape(ctx, [[5, 8], [8, 5], [24, 5], [27, 8], [28, 23], [25, 27], [6, 27], [4, 24]], steel(ctx, 5, 27), "#4f5d68", 0.7);
  rounded(ctx, 7, 12, 18, 9, 1.3, linear(ctx, 0, 12, 0, 21, [[0, "#62a9db"], [1, "#1d5c9d"]]), "#315c80", 0.5);
  rounded(ctx, 10, 14, 12, 4.8, 0.7, "#d7edf7"); line(ctx, 12, 16.2, 20, 16.2, "#507c94", 0.6);
  rounded(ctx, 7, 23, 18, 2.2, 0.5, "#4a5762"); ctx.fillStyle = "#5bd16c"; ctx.fillRect(23, 23.7, 0.8, 0.8);
}

function drawProjectDisk16(ctx) {
  softShadow(ctx, 8, 13.8, 5.5, 1, 1.1, 0.28);
  shape(ctx, [[2.5, 4], [4, 2.5], [12, 2.5], [13.5, 4], [14, 11.5], [12.5, 14], [3, 14], [2, 12]], steel(ctx, 2.5, 14), "#4f5d68", 0.5);
  rounded(ctx, 4, 6, 8, 4, 0.7, "#2f78b8", "#315b7d", 0.35); rounded(ctx, 5.2, 7, 5.6, 1.9, 0.3, "#d7edf7");
  ctx.fillStyle = "#495660"; ctx.fillRect(4, 11.2, 8, 1.2); ctx.fillStyle = "#5bd16c"; ctx.fillRect(11, 11.4, 0.6, 0.6);
}

const recipes = Object.freeze({
  finderApp: { 128: drawFinder128, 32: drawFinder32, 16: drawFinder16 },
  folder: { 128: drawFolder128, 32: drawFolder32, 16: drawFolder16 },
  hardDisk: { 128: drawHardDisk128, 32: drawHardDisk32, 16: drawHardDisk16 },
  trash: { 128: drawTrash128, 32: drawTrash32, 16: drawTrash16 },
  document: { 128: drawDocument128, 32: drawDocument32, 16: drawDocument16 },
  daHandler: { 128: drawApplication128, 32: drawApplication32, 16: drawApplication16 },
  controlPanel: { 128: drawControlPanel128, 32: drawControlPanel32, 16: drawControlPanel16 },
  searcher: { 128: drawSearcher128, 32: drawSearcher32, 16: drawSearcher16 },
  teachText: { 128: drawTeachText128, 32: drawTeachText32, 16: drawTeachText16 },
  assistant: { 128: drawAssistant128, 32: drawAssistant32, 16: drawAssistant16 },
  scrapbook: { 128: drawScrapbook128, 32: drawScrapbook32, 16: drawScrapbook16 },
  projectDisk: { 128: drawProjectDisk128, 32: drawProjectDisk32, 16: drawProjectDisk16 },
});

// Two passes: paint once to find the object, then paint again on the shared
// icon grid so every object in the row carries the same optical size.
function render(size, recipe, id) {
  const scale = 4;
  const px = size * scale;
  const measure = createCanvas(px, px);
  const mctx = measure.getContext("2d");
  mctx.scale(scale, scale);
  recipe(mctx);
  const box = inkBox(mctx, px);
  const working = createCanvas(px, px);
  const ctx = working.getContext("2d");
  let shape = null;
  if (box) {
    const grid = gridTransform("aqua", id, box, px);
    ctx.setTransform(grid.scale, 0, 0, grid.scale, grid.dx, grid.dy);
    shape = grid.shape;
  }
  ctx.scale(scale, scale);
  recipe(ctx);
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
    sourceKind: acceptedImagegenCoreIds.has(id) ? "accepted-imagegen-era-illustration" : "original-independent-aqua-illustration",
    reviewStatus: acceptedImagegenCoreIds.has(id) ? "accepted-imagegen" : "accepted-core",
    sizes: {},
    metrics: {},
  };
  for (const size of sizes) {
    let rendered;
    if (acceptedImagegenCoreIds.has(id)) {
      const source = join(acceptedImagegenSourceDir, `${id}-${size}.png`);
      if (!existsSync(source)) throw new Error(`Aqua ${id}/${size}: missing checked-in accepted Image Gen source ${source}`);
      const image = await loadImage(source);
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, size, size);
      rendered = { canvas, ctx, shape: "square" };
    } else {
      rendered = render(size, recipes[id][size], id);
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
  generatedBy: "tooling/build-aqua-core-icons.mjs",
  coreOnly: true,
  nativeSizes: sizes,
  referenceLedger: "icons/src/aqua-core-icons.json",
  referenceBoard: "internal/evidence/drafts/era-icons/aqua-core-reference-board.png",
  sizeRule: "Runtime selects the authored 16, 32, or 128 px tier by context. Programmatic cores own separately composed compact hints; accepted ImageGen cores use the size provenance recorded in their ledger.",
  selectionRecipe: "Finder selection belongs to the label and view surface; normal and selected states use the same Aqua artwork.",
  icons: generated,
};
writeFileSync(join(assetDir, "aqua-core-icon-family.json"), `${JSON.stringify(family, null, 2)}\n`);
writeFileSync(join(assetDir, "aqua-core-icon-manifest.json"), `${JSON.stringify(runtimeCore, null, 2)}\n`);

const familyFile = join(root, "apps/desktop/assets/themes/aqua/aqua-icon-family.json");
const eraFamily = JSON.parse(readFileSync(familyFile, "utf8"));
eraFamily.runtimeSize = "contextual";
eraFamily.runtimeSizesByContext = { compactMenuList: 16, ordinary: 32, desktopLargeRetina: 128 };
eraFamily.reviewedCore = ids;
eraFamily.coreBuilder = "tooling/build-aqua-core-icons.mjs";
for (const id of ids) {
  eraFamily.icons[id] = {
    ...eraFamily.icons[id],
    genre: source.icons[id].genre,
    physicalMetaphor: source.icons[id].prototype,
    metaphorKey: source.icons[id].metaphorKey,
    semanticMark: "object-owned",
    sourceKind: acceptedImagegenCoreIds.has(id) ? "accepted-imagegen-era-illustration" : "original-independent-aqua-illustration",
    reviewStatus: acceptedImagegenCoreIds.has(id) ? "accepted-imagegen" : "accepted-core",
    sizes: { 16: `icons/${id}-16.png`, 32: `icons/${id}-32.png`, 128: `icons/${id}-128.png` },
    runtimePixelMetrics: generated[id].runtimePixelMetrics,
  };
}
eraFamily.icons.docMap.metaphorKey = "branching-document-map";
eraFamily.icons.docMap.metaphorMetrics = await measureDocMapMetaphor(join(assetDir, "docMap-128.png"), "aqua");
assertDocMapMetaphor(eraFamily.icons.docMap.metaphorMetrics, "aqua/docMap");
writeFileSync(familyFile, `${JSON.stringify(eraFamily, null, 2)}\n`);

const manifestFile = join(root, "apps/desktop/assets/themes/aqua/aqua-icon-manifest.json");
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
    if (!file) throw new Error(`aqua/${iconId}: missing ${cellSize} px sprite source`);
    const image = await loadImage(join(root, "apps/desktop/assets/themes/aqua", file));
    ctx.drawImage(image, (index % 8) * cellSize, Math.floor(index / 8) * cellSize, cellSize, cellSize);
  }
  writeFileSync(join(root, "apps/desktop/assets/themes/aqua/aqua-sprite.png"), canvas.toBuffer("image/png", { compressionLevel: 9 }));
}

function label(ctx, text, x, y, { font = "12px sans-serif", color = "#243442", align = "left" } = {}) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic"; ctx.fillText(text, x, y);
}

async function contactSheet() {
  const cellWidth = 250;
  const cellHeight = 190;
  const canvas = createCanvas(cellWidth * 4, 74 + cellHeight * 3);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#dfe7ed"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  label(ctx, "Aqua core · independent 128 / 32 / 16", 28, 34, { font: "bold 22px sans-serif" });
  label(ctx, "Mac OS X 10.2 Jaguar · object materials, category perspective, native small hints", 28, 57, { color: "#526675" });
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const x = (index % 4) * cellWidth;
    const y = 74 + Math.floor(index / 4) * cellHeight;
    ctx.fillStyle = index % 2 ? "#f5f8fa" : "#ffffff"; ctx.fillRect(x + 7, y + 7, cellWidth - 14, cellHeight - 14);
    const [large, regular, small] = await Promise.all([128, 32, 16].map((size) => loadImage(join(assetDir, `${id}-${size}.png`))));
    ctx.drawImage(large, x + 12, y + 30, 128, 128);
    ctx.drawImage(regular, x + 151, y + 68, 32, 32);
    ctx.drawImage(small, x + 197, y + 76, 16, 16);
    label(ctx, source.icons[id].label, x + 12, y + 24, { font: "bold 12px sans-serif" });
    label(ctx, id, x + 151, y + 121, { font: "10px monospace", color: "#526675" });
    label(ctx, "128 · 32 · 16", x + 151, y + 140, { font: "10px sans-serif", color: "#2f78b8" });
  }
  writeFileSync(join(draftDir, "aqua-core-contact-sheet.png"), canvas.toBuffer("image/png", { compressionLevel: 9 }));
}

function evidencePath(entry) {
  return join(evidenceDir, entry.evidence);
}

async function referenceBoard() {
  const entries = source.referenceBoard;
  const cellWidth = 260;
  const cellHeight = 150;
  const columns = 4;
  const canvas = createCanvas(cellWidth * columns, 84 + Math.ceil(entries.length / columns) * cellHeight);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#dce5eb"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  label(ctx, "Jaguar fixed reference board", 27, 35, { font: "bold 23px sans-serif" });
  label(ctx, "20 system and application prototypes · evidence-only historical art", 27, 60, { color: "#526675" });
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const x = (index % columns) * cellWidth;
    const y = 84 + Math.floor(index / columns) * cellHeight;
    ctx.fillStyle = index % 2 ? "#f4f7f9" : "#ffffff"; ctx.fillRect(x + 7, y + 7, cellWidth - 14, cellHeight - 14);
    const path = evidencePath(entry);
    if (existsSync(path)) {
      const image = await loadImage(path);
      const crop = entry.crop || [0, 0, image.width, image.height];
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image, ...crop, x + 15, y + 22, 64, 64);
    } else {
      label(ctx, "evidence unavailable", x + 15, y + 53, { font: "10px monospace", color: "#9a3f45" });
    }
    label(ctx, entry.label, x + 90, y + 30, { font: "bold 11px sans-serif" });
    label(ctx, entry.perspective, x + 90, y + 49, { font: "10px sans-serif", color: "#2f6f9d" });
    label(ctx, entry.material, x + 90, y + 67, { font: "10px sans-serif", color: "#526675" });
    label(ctx, entry.bbox, x + 15, y + 108, { font: "10px sans-serif", color: "#3e4e59" });
    if (entry.coreId) label(ctx, `core: ${entry.coreId}`, x + 15, y + 126, { font: "10px monospace", color: "#245f91" });
  }
  writeFileSync(join(draftDir, "aqua-core-reference-board.png"), canvas.toBuffer("image/png", { compressionLevel: 9 }));
}

async function normalizedReference(reference) {
  const image = await loadImage(evidencePath(reference));
  const crop = reference.crop || [0, 0, image.width, image.height];
  const canvas = createCanvas(32, 32);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 32, 32);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, ...crop, 0, 0, 32, 32);
  return canvas;
}

async function comparisonBoard() {
  const scale = 3;
  const pane = 32 * scale;
  const rowHeight = 124;
  const canvas = createCanvas(600, 70 + ids.length * rowHeight);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#dce5eb"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  label(ctx, "Aqua core comparison", 22, 31, { font: "bold 21px sans-serif" });
  for (const [index, heading] of ["Reference", "Current", "50% overlay", "Difference"].entries()) label(ctx, heading, 132 + index * 114, 54, { font: "11px sans-serif", color: "#526675", align: "center" });
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const y = 70 + index * rowHeight;
    ctx.fillStyle = index % 2 ? "#f2f6f8" : "#ffffff"; ctx.fillRect(8, y + 5, canvas.width - 16, rowHeight - 10);
    label(ctx, source.icons[id].label, 18, y + 31, { font: "bold 12px sans-serif" });
    label(ctx, id, 18, y + 49, { font: "10px monospace", color: "#526675" });
    const reference = await normalizedReference(source.icons[id].comparison);
    const currentImage = await loadImage(join(assetDir, `${id}-32.png`));
    const current = createCanvas(32, 32);
    const currentCtx = current.getContext("2d"); currentCtx.fillStyle = "#ffffff"; currentCtx.fillRect(0, 0, 32, 32); currentCtx.drawImage(currentImage, 0, 0);
    const overlay = createCanvas(32, 32); const overlayCtx = overlay.getContext("2d"); overlayCtx.drawImage(reference, 0, 0); overlayCtx.globalAlpha = 0.5; overlayCtx.drawImage(current, 0, 0);
    const difference = createCanvas(32, 32); const differenceCtx = difference.getContext("2d");
    const refData = reference.getContext("2d").getImageData(0, 0, 32, 32); const curData = currentCtx.getImageData(0, 0, 32, 32); const diffData = differenceCtx.createImageData(32, 32);
    for (let pixel = 0; pixel < refData.data.length; pixel += 4) {
      const magnitude = Math.min(255, Math.abs(refData.data[pixel] - curData.data[pixel]) + Math.abs(refData.data[pixel + 1] - curData.data[pixel + 1]) + Math.abs(refData.data[pixel + 2] - curData.data[pixel + 2]));
      diffData.data[pixel] = magnitude > 18 ? 231 : 255; diffData.data[pixel + 1] = magnitude > 18 ? 55 : 255; diffData.data[pixel + 2] = magnitude > 18 ? 61 : 255; diffData.data[pixel + 3] = 255;
    }
    differenceCtx.putImageData(diffData, 0, 0);
    for (const [column, image] of [reference, current, overlay, difference].entries()) ctx.drawImage(image, 84 + column * 114, y + 14, pane, pane);
  }
  writeFileSync(join(draftDir, "aqua-core-comparison-board.png"), canvas.toBuffer("image/png", { compressionLevel: 9 }));
}

await rebuildSprite();
await Promise.all([contactSheet(), referenceBoard()]);
const comparisonEvidenceAvailable = ids.every((id) => existsSync(evidencePath(source.icons[id].comparison)));
if (comparisonEvidenceAvailable) {
  await comparisonBoard();
} else {
  console.warn(`Aqua comparison evidence is unavailable under ${evidenceDir}; production assets and the evidence inventory were still built.`);
}
console.log(`Built ${ids.length} Aqua core icons at independent 128 px, 32 px, and 16 px sizes.`);
