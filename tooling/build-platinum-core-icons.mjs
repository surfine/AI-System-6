import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = join(root, "apps/desktop/assets/themes/platinum/icons");
const coreAssetDir = join(assetDir, "core-evidence");
const sourceFile = join(assetDir, "src/platinum-core-icons.json");
const draftDir = join(root, "internal/evidence/drafts/era-icons");
const historicalRoot = "/private/tmp/macos9-icon-reference/png 64px";
if (!existsSync(sourceFile)) throw new Error(`Missing Platinum core-icon source ledger: ${sourceFile}`);
const source = JSON.parse(readFileSync(sourceFile, "utf8"));
const ids = Object.keys(source.icons);

mkdirSync(assetDir, { recursive: true });
mkdirSync(coreAssetDir, { recursive: true });
mkdirSync(draftDir, { recursive: true });

const C = Object.freeze({
  ink: "#24242b",
  ink2: "#3b3b44",
  deep: "#55555f",
  shadow: "#858590",
  mid: "#b9bac2",
  light: "#dedee3",
  hi: "#f7f7fa",
  white: "#ffffff",
  violetDeep: "#4e4d80",
  violetShadow: "#6d6aab",
  violet: "#aaa6e8",
  violetLight: "#cbc8fa",
  violetHi: "#e5e2ff",
  blue: "#5976bf",
  blueDeep: "#314f93",
  red: "#d14b45",
  green: "#36a85e",
  yellow: "#f1cf55",
  cyan: "#55b7cb",
  magenta: "#c46cbc",
  shadowAlpha: "#00000038",
});

function rect(ctx, x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

function poly(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
}

function pixelLine(ctx, x0, y0, x1, y1, color) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    rect(ctx, x, y, 1, 1, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * error;
    if (e2 >= dy) {
      error += dy;
      x += sx;
    }
    if (e2 <= dx) {
      error += dx;
      y += sy;
    }
  }
}

function shadow(ctx, runs) {
  for (const [x, y, width, height] of runs) rect(ctx, x, y, width, height, C.shadowAlpha);
}

function framedRect(ctx, x, y, width, height, inner, edge = C.ink) {
  rect(ctx, x, y, width, height, edge);
  rect(ctx, x + 1, y + 1, width - 2, height - 2, inner);
}

function dashedLine(ctx, x0, y0, x1, y1, color, dash = 3, gap = 2) {
  const horizontal = y0 === y1;
  const length = horizontal ? Math.abs(x1 - x0) : Math.abs(y1 - y0);
  const direction = horizontal ? Math.sign(x1 - x0) || 1 : Math.sign(y1 - y0) || 1;
  for (let offset = 0; offset <= length; offset += dash + gap) {
    const run = Math.min(dash, length - offset + 1);
    if (horizontal) rect(ctx, x0 + offset * direction, y0, run, 1, color);
    else rect(ctx, x0, y0 + offset * direction, 1, run, color);
  }
}

// Finder is the friendly system identity: a compact Macintosh whose screen
// carries eyes and a small smile. Platinum changes the bevel and palette, not
// the semantic silhouette.
function drawFinder32(ctx) {
  shadow(ctx, [[8, 27, 18, 3], [26, 7, 3, 20]]);
  framedRect(ctx, 5, 3, 22, 24, C.mid, C.ink);
  rect(ctx, 6, 4, 20, 2, C.hi);
  rect(ctx, 6, 6, 2, 19, C.light);
  rect(ctx, 24, 6, 2, 19, C.shadow);
  framedRect(ctx, 8, 6, 16, 14, C.hi, C.deep);
  rect(ctx, 9, 7, 14, 1, C.white);
  rect(ctx, 11, 10, 2, 2, C.blueDeep);
  rect(ctx, 19, 10, 2, 2, C.blueDeep);
  pixelLine(ctx, 12, 15, 14, 17, C.violetDeep);
  pixelLine(ctx, 14, 17, 18, 17, C.violetDeep);
  pixelLine(ctx, 18, 17, 20, 15, C.violetDeep);
  framedRect(ctx, 14, 22, 6, 3, C.light, C.deep);
  framedRect(ctx, 9, 27, 14, 3, C.mid, C.ink2);
  rect(ctx, 10, 27, 12, 1, C.hi);
}

function drawFinder16(ctx) {
  shadow(ctx, [[5, 14, 8, 2], [13, 4, 2, 10]]);
  framedRect(ctx, 2, 1, 12, 13, C.mid, C.ink);
  rect(ctx, 3, 2, 10, 1, C.hi);
  framedRect(ctx, 4, 3, 8, 7, C.hi, C.deep);
  rect(ctx, 5, 5, 1, 1, C.blueDeep);
  rect(ctx, 10, 5, 1, 1, C.blueDeep);
  pixelLine(ctx, 5, 7, 7, 8, C.violetDeep);
  pixelLine(ctx, 7, 8, 10, 7, C.violetDeep);
  rect(ctx, 6, 11, 4, 2, C.light);
  framedRect(ctx, 5, 14, 6, 2, C.mid, C.ink2);
}


function drawFolder32(ctx) {
  shadow(ctx, [[9, 27, 21, 2], [14, 29, 14, 1], [29, 13, 2, 14]]);
  poly(ctx, [[3, 7], [11, 7], [14, 9], [25, 10], [29, 13], [29, 26], [26, 29], [7, 27], [3, 24]], C.ink);
  poly(ctx, [[4, 8], [11, 8], [14, 10], [25, 11], [27, 13], [8, 11], [4, 12]], C.violetHi);
  poly(ctx, [[4, 13], [8, 12], [28, 14], [28, 25], [25, 28], [8, 26], [4, 23]], C.violetShadow);
  poly(ctx, [[6, 14], [26, 15], [26, 24], [24, 26], [9, 25], [6, 22]], C.violet);
  pixelLine(ctx, 7, 14, 26, 15, C.violetHi);
  pixelLine(ctx, 7, 23, 23, 25, C.violetLight);
  rect(ctx, 26, 16, 1, 8, C.violetDeep);
}

function drawFolder16(ctx) {
  shadow(ctx, [[5, 14, 10, 1], [14, 7, 1, 7]]);
  poly(ctx, [[1, 4], [6, 4], [8, 5], [13, 6], [15, 8], [15, 13], [13, 15], [3, 14], [1, 12]], C.ink);
  poly(ctx, [[2, 5], [6, 5], [8, 6], [13, 7], [14, 8], [3, 7], [2, 8]], C.violetHi);
  poly(ctx, [[2, 8], [14, 9], [14, 12], [12, 14], [4, 13], [2, 12]], C.violet);
  pixelLine(ctx, 3, 8, 13, 9, C.violetLight);
  rect(ctx, 13, 10, 1, 2, C.violetShadow);
}

function drawHardDisk32(ctx) {
  shadow(ctx, [[5, 25, 25, 3], [9, 28, 18, 1]]);
  poly(ctx, [[4, 17], [8, 12], [25, 12], [29, 17], [29, 24], [27, 26], [5, 26], [3, 24], [3, 18]], C.ink);
  poly(ctx, [[5, 17], [9, 13], [24, 13], [27, 17]], C.hi);
  poly(ctx, [[6, 16], [9, 14], [24, 14], [26, 16]], C.light);
  rect(ctx, 4, 18, 24, 6, C.mid);
  rect(ctx, 5, 18, 22, 1, C.white);
  rect(ctx, 5, 23, 22, 2, C.shadow);
  rect(ctx, 7, 21, 2, 2, C.green);
  rect(ctx, 11, 21, 11, 1, C.deep);
  rect(ctx, 24, 20, 2, 3, C.deep);
  rect(ctx, 25, 20, 1, 1, C.hi);
}

function drawHardDisk16(ctx) {
  shadow(ctx, [[3, 13, 12, 2]]);
  poly(ctx, [[1, 8], [4, 5], [12, 5], [15, 8], [15, 13], [14, 14], [2, 14], [1, 13]], C.ink);
  poly(ctx, [[3, 8], [5, 6], [11, 6], [13, 8]], C.hi);
  rect(ctx, 2, 9, 12, 4, C.mid);
  rect(ctx, 3, 9, 10, 1, C.white);
  rect(ctx, 3, 12, 1, 1, C.green);
  rect(ctx, 6, 12, 5, 1, C.deep);
}

function drawTrash32(ctx) {
  shadow(ctx, [[12, 28, 13, 2], [16, 30, 7, 1], [25, 11, 4, 16]]);
  poly(ctx, [[8, 9], [10, 7], [23, 7], [26, 10], [24, 27], [21, 30], [12, 30], [9, 27]], C.ink);
  rect(ctx, 10, 12, 14, 14, C.mid);
  poly(ctx, [[9, 10], [11, 8], [22, 8], [25, 10], [23, 13], [11, 13]], C.light);
  poly(ctx, [[11, 10], [13, 9], [21, 9], [23, 10], [21, 11], [13, 11]], C.white);
  rect(ctx, 11, 12, 12, 1, C.deep);
  rect(ctx, 13, 7, 8, 1, C.ink2);
  rect(ctx, 15, 5, 4, 2, C.ink);
  rect(ctx, 16, 5, 2, 1, C.hi);
  for (const x of [12, 15, 18, 21]) {
    rect(ctx, x, 13, 1, 12, x === 12 ? C.hi : C.shadow);
  }
  poly(ctx, [[10, 26], [23, 26], [21, 29], [12, 29]], C.deep);
}

function drawTrash16(ctx) {
  shadow(ctx, [[6, 14, 7, 1], [13, 7, 1, 7]]);
  poly(ctx, [[4, 5], [6, 3], [11, 3], [13, 5], [12, 14], [11, 15], [6, 15], [5, 14]], C.ink);
  rect(ctx, 5, 7, 7, 6, C.mid);
  poly(ctx, [[5, 5], [7, 4], [10, 4], [12, 5], [11, 7], [6, 7]], C.hi);
  rect(ctx, 6, 6, 5, 1, C.deep);
  rect(ctx, 7, 2, 3, 1, C.ink);
  rect(ctx, 6, 7, 1, 5, C.hi);
  rect(ctx, 8, 7, 1, 5, C.shadow);
  rect(ctx, 10, 7, 1, 5, C.shadow);
  rect(ctx, 6, 13, 5, 1, C.deep);
}

function drawDocument32(ctx) {
  shadow(ctx, [[10, 29, 18, 2], [27, 9, 3, 20]]);
  poly(ctx, [[7, 3], [22, 3], [28, 9], [28, 28], [26, 30], [7, 30]], C.ink);
  poly(ctx, [[8, 4], [21, 4], [21, 10], [27, 10], [27, 28], [8, 28]], C.white);
  poly(ctx, [[22, 4], [27, 9], [22, 9]], C.light);
  rect(ctx, 9, 5, 1, 22, C.hi);
  rect(ctx, 26, 11, 1, 16, C.light);
  rect(ctx, 11, 14, 12, 1, C.light);
  rect(ctx, 11, 18, 10, 1, C.mid);
  rect(ctx, 11, 22, 13, 1, C.light);
}

function drawDocument16(ctx) {
  shadow(ctx, [[6, 15, 8, 1], [13, 5, 2, 9]]);
  poly(ctx, [[3, 1], [10, 1], [14, 5], [14, 14], [13, 15], [3, 15]], C.ink);
  poly(ctx, [[4, 2], [9, 2], [9, 6], [13, 6], [13, 14], [4, 14]], C.white);
  poly(ctx, [[10, 2], [13, 5], [10, 5]], C.light);
  rect(ctx, 6, 8, 5, 1, C.mid);
  rect(ctx, 6, 11, 4, 1, C.light);
}

function drawApplication32(ctx) {
  shadow(ctx, [[9, 27, 19, 3], [25, 9, 4, 19]]);
  poly(ctx, [[16, 3], [29, 16], [16, 29], [3, 16]], C.ink);
  poly(ctx, [[16, 5], [27, 16], [16, 27], [5, 16]], C.white);
  poly(ctx, [[16, 6], [25, 15], [16, 24], [7, 15]], C.hi);
  poly(ctx, [[7, 17], [12, 17], [15, 14], [17, 14], [17, 11], [19, 11], [19, 14], [21, 12], [23, 13], [21, 16], [24, 15], [25, 17], [22, 20], [19, 23], [14, 23], [12, 21], [8, 21]], C.ink2);
  poly(ctx, [[9, 18], [13, 18], [16, 15], [18, 15], [18, 13], [19, 13], [19, 17], [21, 15], [22, 16], [20, 19], [22, 18], [23, 18], [19, 22], [15, 22], [13, 20], [9, 20]], C.hi);
  rect(ctx, 13, 18, 7, 3, C.violet);
  rect(ctx, 16, 16, 2, 4, C.violetLight);
  rect(ctx, 13, 20, 5, 1, C.violetShadow);
}

function drawApplication16(ctx) {
  shadow(ctx, [[5, 14, 8, 2], [12, 5, 2, 9]]);
  poly(ctx, [[8, 1], [15, 8], [8, 15], [1, 8]], C.ink);
  poly(ctx, [[8, 2], [14, 8], [8, 14], [2, 8]], C.white);
  poly(ctx, [[3, 9], [6, 9], [8, 7], [8, 5], [9, 5], [9, 8], [11, 6], [12, 7], [11, 9], [13, 8], [13, 10], [10, 13], [7, 13], [6, 11], [3, 11]], C.ink2);
  rect(ctx, 6, 10, 4, 2, C.violet);
  rect(ctx, 8, 7, 1, 4, C.violetHi);
  rect(ctx, 4, 10, 3, 1, C.hi);
}

function drawFloppy32(ctx) {
  shadow(ctx, [[9, 28, 20, 2], [28, 7, 2, 21]]);
  poly(ctx, [[5, 4], [25, 4], [29, 8], [29, 27], [27, 29], [5, 29]], C.ink);
  rect(ctx, 6, 5, 21, 22, C.mid);
  rect(ctx, 7, 6, 19, 2, C.hi);
  framedRect(ctx, 10, 5, 13, 9, C.hi, C.deep);
  rect(ctx, 18, 6, 3, 6, C.shadow);
  rect(ctx, 19, 6, 1, 5, C.deep);
  framedRect(ctx, 9, 18, 15, 9, C.white, C.deep);
  rect(ctx, 11, 20, 11, 1, C.blue);
  rect(ctx, 11, 23, 9, 1, C.light);
  rect(ctx, 25, 10, 2, 5, C.deep);
}

function drawFloppy16(ctx) {
  shadow(ctx, [[5, 15, 9, 1], [14, 4, 1, 11]]);
  poly(ctx, [[2, 1], [12, 1], [15, 4], [15, 14], [14, 15], [2, 15]], C.ink);
  rect(ctx, 3, 2, 11, 12, C.mid);
  framedRect(ctx, 5, 2, 6, 5, C.hi, C.deep);
  rect(ctx, 9, 3, 1, 3, C.shadow);
  framedRect(ctx, 5, 9, 7, 5, C.white, C.deep);
  rect(ctx, 6, 10, 5, 1, C.blue);
}

function discRows(size) {
  if (size === 32) return [
    [12, 3, 9], [9, 4, 15], [7, 5, 19], [6, 6, 21], [5, 7, 23], [4, 9, 25],
    [3, 12, 27], [3, 21, 27], [4, 24, 25], [5, 26, 23], [6, 27, 21], [7, 28, 19], [9, 29, 15], [12, 30, 9],
  ];
  return [[6, 1, 5], [4, 2, 9], [3, 3, 11], [2, 4, 13], [1, 6, 15], [1, 10, 15], [2, 12, 13], [3, 13, 11], [4, 14, 9], [6, 15, 5]];
}

function drawDiscBase(ctx, size) {
  const rows = discRows(size);
  const top = new Map(rows.map(([x, y, width]) => [y, [x, width]]));
  const max = size === 32 ? 30 : 15;
  for (let y = 0; y <= max; y += 1) {
    const exact = top.get(y);
    if (exact) rect(ctx, exact[0], y, exact[1], 1, C.ink);
  }
  if (size === 32) {
    for (let y = 4; y <= 29; y += 1) {
      const radius = Math.sqrt(13 * 13 - (y - 16.5) ** 2);
      const x = Math.ceil(16 - radius);
      rect(ctx, x, y, Math.floor(radius * 2), 1, C.light);
    }
  } else {
    for (let y = 2; y <= 14; y += 1) {
      const radius = Math.sqrt(6.5 * 6.5 - (y - 8) ** 2);
      const x = Math.ceil(8 - radius);
      rect(ctx, x, y, Math.floor(radius * 2), 1, C.light);
    }
  }
}

function drawDisc32(ctx) {
  shadow(ctx, [[9, 29, 18, 2], [24, 26, 5, 3]]);
  drawDiscBase(ctx, 32);
  pixelLine(ctx, 7, 8, 14, 14, C.yellow);
  pixelLine(ctx, 10, 6, 15, 14, C.red);
  pixelLine(ctx, 19, 5, 18, 14, C.cyan);
  pixelLine(ctx, 23, 7, 19, 14, C.blue);
  pixelLine(ctx, 27, 13, 20, 16, C.magenta);
  pixelLine(ctx, 25, 23, 20, 18, C.red);
  pixelLine(ctx, 18, 28, 18, 20, C.blue);
  pixelLine(ctx, 8, 25, 14, 19, C.green);
  pixelLine(ctx, 4, 17, 12, 17, C.cyan);
  framedRect(ctx, 13, 13, 7, 7, C.hi, C.shadow);
  rect(ctx, 15, 15, 3, 3, C.white);
  rect(ctx, 16, 16, 1, 1, C.deep);
  pixelLine(ctx, 8, 6, 24, 26, C.white);
}

function drawDisc16(ctx) {
  shadow(ctx, [[5, 14, 8, 2], [12, 13, 2, 1]]);
  drawDiscBase(ctx, 16);
  pixelLine(ctx, 4, 3, 7, 7, C.yellow);
  pixelLine(ctx, 10, 3, 9, 7, C.cyan);
  pixelLine(ctx, 13, 6, 10, 8, C.magenta);
  pixelLine(ctx, 11, 12, 9, 10, C.blue);
  pixelLine(ctx, 4, 12, 7, 10, C.green);
  pixelLine(ctx, 2, 7, 6, 8, C.red);
  framedRect(ctx, 6, 6, 5, 5, C.hi, C.shadow);
  rect(ctx, 8, 8, 1, 1, C.deep);
}

function drawControlPanel32(ctx) {
  shadow(ctx, [[10, 29, 18, 2], [27, 9, 3, 20]]);
  poly(ctx, [[7, 3], [22, 3], [28, 9], [28, 28], [26, 30], [7, 30]], C.ink);
  poly(ctx, [[8, 4], [21, 4], [21, 10], [27, 10], [27, 28], [8, 28]], C.white);
  poly(ctx, [[22, 4], [27, 9], [22, 9]], C.light);
  for (const y of [14, 19, 24]) rect(ctx, 11, y, 13, 1, C.deep);
  framedRect(ctx, 13, 12, 4, 5, C.violet, C.ink2);
  framedRect(ctx, 19, 17, 4, 5, C.blue, C.ink2);
  framedRect(ctx, 12, 22, 4, 5, C.mid, C.ink2);
  rect(ctx, 14, 13, 2, 1, C.violetHi);
  rect(ctx, 20, 18, 2, 1, C.hi);
}

function drawControlPanel16(ctx) {
  shadow(ctx, [[6, 15, 8, 1], [13, 5, 2, 9]]);
  poly(ctx, [[3, 1], [10, 1], [14, 5], [14, 14], [13, 15], [3, 15]], C.ink);
  poly(ctx, [[4, 2], [9, 2], [9, 6], [13, 6], [13, 14], [4, 14]], C.white);
  poly(ctx, [[10, 2], [13, 5], [10, 5]], C.light);
  for (const y of [8, 11, 13]) rect(ctx, 5, y, 7, 1, C.deep);
  rect(ctx, 6, 7, 2, 3, C.violet);
  rect(ctx, 9, 10, 2, 3, C.blue);
  rect(ctx, 6, 12, 2, 2, C.mid);
}

function drawSystem32(ctx) {
  shadow(ctx, [[10, 28, 19, 2], [27, 9, 3, 19]]);
  poly(ctx, [[7, 8], [10, 6], [23, 6], [27, 9], [27, 27], [25, 29], [7, 29]], C.ink);
  rect(ctx, 8, 9, 18, 18, C.mid);
  rect(ctx, 9, 10, 16, 2, C.hi);
  framedRect(ctx, 12, 13, 11, 10, C.hi, C.deep);
  rect(ctx, 13, 14, 9, 1, C.blue);
  rect(ctx, 14, 17, 1, 2, C.violetDeep);
  rect(ctx, 20, 17, 1, 2, C.violetDeep);
  rect(ctx, 16, 20, 4, 1, C.violetDeep);
  rect(ctx, 17, 21, 2, 1, C.violetDeep);
  rect(ctx, 12, 6, 10, 2, C.ink);
  for (const x of [13, 16, 19]) rect(ctx, x, 4, 2, 3, C.ink2);
  for (const y of [10, 14, 18, 22, 26]) rect(ctx, 5, y, 3, 1, C.deep);
  rect(ctx, 23, 12, 2, 13, C.shadow);
}

function drawSystem16(ctx) {
  shadow(ctx, [[5, 15, 9, 1], [13, 5, 2, 10]]);
  poly(ctx, [[3, 4], [5, 3], [12, 3], [14, 5], [14, 14], [13, 15], [3, 15]], C.ink);
  rect(ctx, 4, 5, 9, 9, C.mid);
  framedRect(ctx, 6, 7, 7, 6, C.hi, C.deep);
  rect(ctx, 7, 8, 1, 1, C.blueDeep);
  rect(ctx, 11, 8, 1, 1, C.blueDeep);
  rect(ctx, 8, 11, 3, 1, C.blueDeep);
  rect(ctx, 6, 3, 6, 1, C.ink);
  for (const x of [6, 9, 12]) rect(ctx, x, 1, 1, 2, C.ink2);
  for (const y of [5, 8, 11, 14]) rect(ctx, 2, y, 2, 1, C.deep);
}

function drawScrapbook32(ctx) {
  shadow(ctx, [[10, 28, 19, 2], [27, 8, 3, 20]]);
  poly(ctx, [[7, 7], [25, 7], [28, 10], [28, 27], [26, 29], [7, 29]], C.ink);
  rect(ctx, 8, 8, 18, 19, C.mid);
  rect(ctx, 9, 9, 16, 2, C.hi);
  rect(ctx, 23, 11, 3, 15, C.shadow);
  framedRect(ctx, 11, 13, 11, 10, C.white, C.deep);
  poly(ctx, [[12, 21], [15, 17], [18, 20], [20, 16], [21, 22], [12, 22]], C.violet);
  rect(ctx, 18, 15, 2, 2, C.yellow);
  rect(ctx, 7, 8, 3, 19, C.deep);
  for (const y of [8, 12, 16, 20, 24, 27]) {
    rect(ctx, 4, y, 5, 1, C.ink2);
    rect(ctx, 5, y - 1, 1, 2, C.shadow);
  }
}

function drawScrapbook16(ctx) {
  shadow(ctx, [[6, 15, 8, 1], [13, 5, 2, 10]]);
  poly(ctx, [[4, 3], [12, 3], [14, 5], [14, 14], [13, 15], [4, 15]], C.ink);
  rect(ctx, 5, 4, 8, 10, C.mid);
  framedRect(ctx, 7, 7, 5, 5, C.white, C.deep);
  poly(ctx, [[8, 11], [9, 9], [10, 10], [11, 8], [11, 11]], C.violet);
  rect(ctx, 4, 4, 2, 10, C.deep);
  for (const y of [4, 7, 10, 13]) rect(ctx, 2, y, 3, 1, C.ink2);
}

function drawClipboard32(ctx) {
  shadow(ctx, [[11, 29, 17, 2], [27, 10, 3, 19]]);
  poly(ctx, [[8, 8], [11, 5], [14, 5], [14, 3], [21, 3], [21, 5], [24, 5], [27, 8], [27, 28], [25, 30], [8, 30]], C.ink);
  poly(ctx, [[9, 9], [12, 6], [23, 6], [26, 9], [26, 28], [9, 28]], C.white);
  framedRect(ctx, 14, 4, 8, 5, C.mid, C.deep);
  rect(ctx, 16, 5, 4, 1, C.hi);
  poly(ctx, [[10, 11], [18, 17], [25, 11], [25, 26], [10, 26]], C.light);
  poly(ctx, [[10, 11], [18, 19], [25, 11], [18, 16]], C.white);
  pixelLine(ctx, 10, 26, 17, 18, C.shadow);
  pixelLine(ctx, 25, 26, 18, 18, C.shadow);
}

function drawClipboard16(ctx) {
  shadow(ctx, [[6, 15, 8, 1], [13, 5, 2, 9]]);
  poly(ctx, [[3, 4], [6, 2], [7, 2], [7, 1], [11, 1], [11, 2], [13, 3], [14, 5], [14, 14], [13, 15], [3, 15]], C.ink);
  poly(ctx, [[4, 5], [6, 3], [12, 3], [13, 5], [13, 14], [4, 14]], C.white);
  framedRect(ctx, 7, 2, 5, 3, C.mid, C.deep);
  poly(ctx, [[5, 6], [9, 10], [12, 6], [12, 13], [5, 13]], C.light);
  pixelLine(ctx, 5, 13, 9, 9, C.shadow);
  pixelLine(ctx, 12, 13, 9, 9, C.shadow);
}

// ClioTalk exposes the temporary-output rule directly: the user's turn is a
// solid balloon; the model reply stays visibly dashed until the user saves,
// clips, inserts, or exports it.
function drawAssistant32(ctx) {
  shadow(ctx, [[5, 15, 15, 2], [14, 28, 16, 2]]);
  framedRect(ctx, 3, 4, 17, 11, C.white, C.ink);
  poly(ctx, [[7, 14], [7, 18], [12, 14]], C.ink);
  poly(ctx, [[8, 14], [8, 16], [10, 14]], C.white);
  rect(ctx, 7, 8, 9, 1, C.mid);
  rect(ctx, 7, 11, 6, 1, C.shadow);

  rect(ctx, 12, 17, 17, 11, C.light);
  poly(ctx, [[24, 27], [28, 31], [27, 27]], C.light);
  dashedLine(ctx, 12, 17, 28, 17, C.violetDeep);
  dashedLine(ctx, 12, 17, 12, 27, C.violetDeep);
  dashedLine(ctx, 28, 17, 28, 27, C.violetDeep);
  dashedLine(ctx, 12, 27, 28, 27, C.violetDeep);
  pixelLine(ctx, 25, 27, 28, 30, C.violetDeep);
  rect(ctx, 16, 21, 8, 1, C.shadow);
  rect(ctx, 19, 24, 6, 1, C.shadow);
}

function drawAssistant16(ctx) {
  framedRect(ctx, 1, 1, 9, 7, C.white, C.ink);
  poly(ctx, [[3, 7], [3, 10], [6, 7]], C.ink);
  rect(ctx, 3, 4, 5, 1, C.mid);
  rect(ctx, 6, 8, 9, 7, C.light);
  dashedLine(ctx, 6, 8, 14, 8, C.violetDeep, 2, 1);
  dashedLine(ctx, 6, 8, 6, 14, C.violetDeep, 2, 1);
  dashedLine(ctx, 14, 8, 14, 14, C.violetDeep, 2, 1);
  dashedLine(ctx, 6, 14, 14, 14, C.violetDeep, 2, 1);
  pixelLine(ctx, 11, 14, 14, 16, C.violetDeep);
  rect(ctx, 9, 11, 4, 1, C.shadow);
}

function drawSearcher32(ctx) {
  shadow(ctx, [[8, 29, 16, 2], [27, 21, 4, 9]]);
  poly(ctx, [[5, 3], [18, 3], [23, 8], [23, 28], [5, 28]], C.ink);
  poly(ctx, [[6, 4], [17, 4], [17, 9], [22, 9], [22, 27], [6, 27]], C.white);
  rect(ctx, 9, 11, 9, 1, C.mid);
  rect(ctx, 9, 15, 7, 1, C.light);
  poly(ctx, [[17, 13], [22, 11], [27, 13], [29, 18], [27, 23], [22, 25], [17, 23], [15, 18]], C.ink2);
  poly(ctx, [[18, 14], [22, 12], [26, 14], [28, 18], [26, 22], [22, 24], [18, 22], [16, 18]], C.cyan);
  poly(ctx, [[18, 15], [21, 13], [24, 14], [19, 19]], C.hi);
  pixelLine(ctx, 27, 23, 31, 27, C.ink);
  pixelLine(ctx, 26, 24, 30, 28, C.deep);
}

function drawSearcher16(ctx) {
  poly(ctx, [[2, 1], [8, 1], [11, 4], [11, 14], [2, 14]], C.ink);
  poly(ctx, [[3, 2], [7, 2], [7, 5], [10, 5], [10, 13], [3, 13]], C.white);
  poly(ctx, [[8, 6], [11, 5], [14, 7], [15, 10], [13, 13], [10, 14], [7, 12], [6, 9]], C.ink2);
  poly(ctx, [[8, 7], [11, 6], [13, 7], [14, 10], [12, 12], [10, 13], [8, 12], [7, 9]], C.cyan);
  pixelLine(ctx, 13, 12, 15, 15, C.ink);
}

function drawTeachText32(ctx) {
  drawDocument32(ctx);
  for (const y of [13, 17, 21]) rect(ctx, 10, y, y === 21 ? 8 : 11, 1, C.shadow);
  pixelLine(ctx, 12, 27, 25, 14, C.blueDeep);
  pixelLine(ctx, 14, 28, 27, 15, C.blue);
  poly(ctx, [[25, 13], [28, 16], [27, 18], [23, 14]], C.hi);
  poly(ctx, [[11, 27], [14, 28], [10, 30]], C.ink2);
}

function drawTeachText16(ctx) {
  drawDocument16(ctx);
  rect(ctx, 5, 8, 5, 1, C.shadow);
  rect(ctx, 5, 11, 4, 1, C.shadow);
  pixelLine(ctx, 6, 14, 13, 7, C.blueDeep);
  pixelLine(ctx, 7, 15, 14, 8, C.blue);
}

function drawReviewDesk32(ctx) {
  drawDocument32(ctx);
  pixelLine(ctx, 10, 22, 14, 26, C.red);
  pixelLine(ctx, 14, 26, 22, 16, C.red);
  poly(ctx, [[18, 13], [23, 11], [28, 14], [30, 19], [28, 24], [23, 27], [18, 25], [16, 19]], C.ink2);
  poly(ctx, [[19, 14], [23, 12], [27, 14], [29, 19], [27, 23], [23, 26], [19, 24], [17, 19]], C.hi);
  poly(ctx, [[19, 15], [22, 13], [25, 14], [20, 19]], C.cyan);
  pixelLine(ctx, 27, 24, 31, 28, C.ink);
}

function drawReviewDesk16(ctx) {
  drawDocument16(ctx);
  pixelLine(ctx, 4, 11, 6, 13, C.red);
  pixelLine(ctx, 6, 13, 10, 8, C.red);
  poly(ctx, [[9, 7], [12, 6], [15, 8], [15, 12], [13, 14], [10, 14], [8, 11]], C.ink2);
  poly(ctx, [[10, 8], [12, 7], [14, 8], [14, 11], [12, 13], [10, 13], [9, 11]], C.cyan);
  pixelLine(ctx, 13, 13, 15, 15, C.ink);
}

function drawDocMap32(ctx) {
  shadow(ctx, [[7, 29, 14, 2], [29, 9, 3, 20]]);
  framedRect(ctx, 4, 3, 15, 26, C.white, C.ink);
  rect(ctx, 7, 9, 9, 1, C.deep);
  rect(ctx, 7, 14, 6, 1, C.shadow);
  pixelLine(ctx, 18, 16, 23, 16, C.ink2);
  pixelLine(ctx, 23, 8, 23, 25, C.ink2);
  for (const y of [8, 16, 25]) {
    pixelLine(ctx, 23, y, 27, y, C.ink2);
    framedRect(ctx, 27, y - 2, 5, 5, y === 16 ? C.violet : C.light, C.deep);
  }
}

function drawDocMap16(ctx) {
  framedRect(ctx, 1, 1, 8, 14, C.white, C.ink);
  rect(ctx, 3, 5, 4, 1, C.deep);
  pixelLine(ctx, 8, 9, 11, 9, C.ink2);
  pixelLine(ctx, 11, 4, 11, 14, C.ink2);
  for (const y of [4, 9, 14]) framedRect(ctx, 12, y - 1, 4, 3, y === 9 ? C.violet : C.light, C.deep);
}

function drawProjectDisk32(ctx) {
  drawHardDisk32(ctx);
  framedRect(ctx, 10, 19, 13, 5, C.blue, C.deep);
  rect(ctx, 12, 20, 9, 1, C.hi);
  rect(ctx, 13, 22, 7, 1, C.blueDeep);
}

function drawProjectDisk16(ctx) {
  drawHardDisk16(ctx);
  framedRect(ctx, 5, 9, 7, 4, C.blue, C.deep);
  rect(ctx, 6, 10, 5, 1, C.hi);
}



const recipes = Object.freeze({
  finderApp: { 32: drawFinder32, 16: drawFinder16 },
  folder: { 32: drawFolder32, 16: drawFolder16 },
  hardDisk: { 32: drawHardDisk32, 16: drawHardDisk16 },
  trash: { 32: drawTrash32, 16: drawTrash16 },
  document: { 32: drawDocument32, 16: drawDocument16 },
  daHandler: { 32: drawApplication32, 16: drawApplication16 },
  fileFloppy: { 32: drawFloppy32, 16: drawFloppy16 },
  projectDisc: { 32: drawDisc32, 16: drawDisc16 },
  controlPanel: { 32: drawControlPanel32, 16: drawControlPanel16 },
  systemFile: { 32: drawSystem32, 16: drawSystem16 },
  scrapbook: { 32: drawScrapbook32, 16: drawScrapbook16 },
  clipboard: { 32: drawClipboard32, 16: drawClipboard16 },
  assistant: { 32: drawAssistant32, 16: drawAssistant16 },
  searcher: { 32: drawSearcher32, 16: drawSearcher16 },
  teachText: { 32: drawTeachText32, 16: drawTeachText16 },
  reviewDesk: { 32: drawReviewDesk32, 16: drawReviewDesk16 },
  docMap: { 32: drawDocMap32, 16: drawDocMap16 },
  projectDisk: { 32: drawProjectDisk32, 16: drawProjectDisk16 },
});

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
      const alpha = data[offset + 3];
      if (!alpha) continue;
      pixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]},${alpha}`);
    }
  }
  return {
    pixels,
    colors: colors.size,
    bbox: { minX, minY, maxX, maxY },
  };
}

const generated = {};
const runtimeCore = {};
for (const id of ids) {
  generated[id] = {
    ...source.icons[id],
    sourceKind: "measured-independent-pixel-construction",
    reviewStatus: "accepted-core",
    sizes: {},
    metrics: {},
  };
  for (const size of [32, 16]) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    recipes[id][size](ctx);
    const filename = `${id}-${size}.png`;
    const buffer = canvas.toBuffer("image/png", { compressionLevel: 9, filters: canvas.PNG_FILTER_NONE });
    writeFileSync(join(coreAssetDir, filename), buffer);
    generated[id].sizes[size] = `icons/core-evidence/${filename}`;
    generated[id].metrics[size] = {
      ...metrics(ctx, size),
      sha256: createHash("sha256").update(buffer).digest("hex"),
      bytes: buffer.length,
    };
    if (size === 32) runtimeCore[id] = `icons/core-evidence/${filename}`;
  }
}

const family = {
  schemaVersion: 1,
  target: source.target,
  generatedBy: "tooling/build-platinum-core-icons.mjs",
  coreOnly: true,
  nativeSizes: [32, 16],
  referenceLedger: "icons/src/platinum-core-icons.json",
  referenceBoard: "internal/evidence/drafts/era-icons/platinum-core-reference-board.png",
  selectionRecipe: "Use the same native artwork in normal and selected Finder states; selection belongs to the Finder label/state surface.",
  icons: generated,
};
writeFileSync(join(assetDir, "platinum-core-icon-family.json"), `${JSON.stringify(family, null, 2)}\n`);
writeFileSync(join(assetDir, "platinum-core-icon-manifest.json"), `${JSON.stringify(runtimeCore, null, 2)}\n`);

const familyFile = join(root, "apps/desktop/assets/themes/platinum/platinum-icon-family.json");
const eraFamily = JSON.parse(readFileSync(familyFile, "utf8"));
eraFamily.reviewedCore = ids;
eraFamily.coreBuilder = "tooling/build-platinum-core-icons.mjs";
const completeImagegenFamily = eraFamily.completeFamily === true
  && eraFamily.imageGenerationMode === "built-in-imagegen-one-call-per-asset";
if (!completeImagegenFamily) {
  for (const id of ids) {
    if (!eraFamily.icons[id]) continue;
    eraFamily.icons[id] = {
      ...eraFamily.icons[id],
      genre: source.icons[id].genre,
      physicalMetaphor: source.icons[id].prototype,
      semanticMark: "object-owned",
      sourceKind: "measured-independent-pixel-construction",
      reviewStatus: "accepted-core",
      sizes: { 16: `icons/core-evidence/${id}-16.png`, 32: `icons/core-evidence/${id}-32.png` },
    };
  }
}

writeFileSync(familyFile, `${JSON.stringify(eraFamily, null, 2)}\n`);

function label(ctx, text, x, y, { font = "12px sans-serif", color = "#24242b", align = "left" } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}

async function contactSheet() {
  const cellWidth = 250;
  const cellHeight = 116;
  const canvas = createCanvas(cellWidth * 4, 72 + cellHeight * Math.ceil(ids.length / 4));
  const ctx = canvas.getContext("2d");
  rect(ctx, 0, 0, canvas.width, canvas.height, "#d7d7d7");
  label(ctx, "Platinum core · independent 32 px / 16 px", 28, 34, { font: "bold 22px sans-serif" });
  label(ctx, "Mac OS 9 object grammar · no shared badge template · nearest-neighbor presentation", 28, 56, { color: "#55555f" });
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const x = (index % 4) * cellWidth;
    const y = 72 + Math.floor(index / 4) * cellHeight;
    rect(ctx, x + 8, y + 8, cellWidth - 16, cellHeight - 16, index % 2 ? "#ededed" : "#f6f6f6");
    rect(ctx, x + 8, y + 8, cellWidth - 16, 1, "#ffffff");
    rect(ctx, x + 8, y + cellHeight - 9, cellWidth - 16, 1, "#858590");
    const icon32 = await loadImage(join(coreAssetDir, `${id}-32.png`));
    const icon16 = await loadImage(join(coreAssetDir, `${id}-16.png`));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(icon32, x + 22, y + 29, 64, 64);
    ctx.drawImage(icon16, x + 105, y + 53, 32, 32);
    label(ctx, source.icons[id].label, x + 150, y + 44, { font: "bold 12px sans-serif" });
    label(ctx, id, x + 150, y + 62, { font: "11px monospace", color: "#55555f" });
    label(ctx, "32 / 16", x + 150, y + 80, { font: "11px sans-serif", color: "#6d6aab" });
  }
  writeFileSync(join(draftDir, "platinum-core-contact-sheet.png"), canvas.toBuffer("image/png"));
}

async function referenceBoard() {
  const entries = source.referenceBoard;
  const cellWidth = 260;
  const cellHeight = 136;
  const columns = 3;
  const canvas = createCanvas(cellWidth * columns, 82 + Math.ceil(entries.length / columns) * cellHeight);
  const ctx = canvas.getContext("2d");
  rect(ctx, 0, 0, canvas.width, canvas.height, "#c7c7c7");
  label(ctx, "Platinum fixed reference board", 26, 34, { font: "bold 23px sans-serif" });
  label(ctx, "18 native object prototypes · Apple artwork remains evidence-only", 26, 58, { color: "#4e4e55" });
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const x = (index % columns) * cellWidth;
    const y = 82 + Math.floor(index / columns) * cellHeight;
    rect(ctx, x + 8, y + 8, cellWidth - 16, cellHeight - 16, "#eeeeee");
    rect(ctx, x + 8, y + 8, cellWidth - 16, 1, "#ffffff");
    rect(ctx, x + 8, y + cellHeight - 9, cellWidth - 16, 1, "#777777");
    const referencePath = join(historicalRoot, `${entry.referenceId}.png`);
    if (existsSync(referencePath)) {
      const image = await loadImage(referencePath);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, x + 18, y + 24, 64, 64);
    }
    label(ctx, `${entry.label} · #${entry.referenceId}`, x + 94, y + 35, { font: "bold 12px sans-serif" });
    label(ctx, entry.nativeSize === 32 ? "native 32 + 16 family" : `native ${entry.nativeSize}`, x + 94, y + 53, { color: "#55555f" });
    label(ctx, entry.perspective, x + 94, y + 72, { color: "#4e4d80" });
    label(ctx, entry.outline, x + 94, y + 90, { color: "#55555f" });
    if (entry.coreId) label(ctx, `core: ${entry.coreId}`, x + 18, y + 109, { font: "10px monospace", color: "#314f93" });
  }
  writeFileSync(join(draftDir, "platinum-core-reference-board.png"), canvas.toBuffer("image/png"));
}

async function comparisonBoard() {
  const scale = 3;
  const pane = 32 * scale;
  const rowHeight = 126;
  const canvas = createCanvas(590, 68 + ids.length * rowHeight);
  const ctx = canvas.getContext("2d");
  rect(ctx, 0, 0, canvas.width, canvas.height, "#d5d5d5");
  label(ctx, "Platinum core comparison", 22, 31, { font: "bold 21px sans-serif" });
  for (const [index, heading] of ["Reference", "Current", "50% overlay", "Pixel difference"].entries()) {
    label(ctx, heading, 126 + index * 112, 53, { font: "11px sans-serif", color: "#4e4e55", align: "center" });
  }
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const y = 68 + index * rowHeight;
    rect(ctx, 8, y + 5, canvas.width - 16, rowHeight - 10, index % 2 ? "#eeeeee" : "#f7f7f7");
    label(ctx, source.icons[id].label, 18, y + 31, { font: "bold 12px sans-serif" });
    label(ctx, id, 18, y + 49, { font: "10px monospace", color: "#55555f" });
    const current = await loadImage(join(coreAssetDir, `${id}-32.png`));
    const referencePath = join(historicalRoot, `${source.icons[id].referenceId}.png`);
    const reference = existsSync(referencePath) ? await loadImage(referencePath) : current;
    const refCanvas = createCanvas(32, 32);
    const refCtx = refCanvas.getContext("2d");
    refCtx.imageSmoothingEnabled = false;
    refCtx.drawImage(reference, 0, 0, 32, 32);
    const curCanvas = createCanvas(32, 32);
    curCanvas.getContext("2d").drawImage(current, 0, 0);
    const overlay = createCanvas(32, 32);
    const overlayCtx = overlay.getContext("2d");
    overlayCtx.drawImage(refCanvas, 0, 0);
    overlayCtx.globalAlpha = 0.5;
    overlayCtx.drawImage(curCanvas, 0, 0);
    overlayCtx.globalAlpha = 1;
    const diff = createCanvas(32, 32);
    const diffCtx = diff.getContext("2d");
    const refData = refCtx.getImageData(0, 0, 32, 32);
    const curData = curCanvas.getContext("2d").getImageData(0, 0, 32, 32);
    const diffData = diffCtx.createImageData(32, 32);
    for (let p = 0; p < refData.data.length; p += 4) {
      const magnitude = Math.min(255,
        Math.abs(refData.data[p] - curData.data[p]) +
        Math.abs(refData.data[p + 1] - curData.data[p + 1]) +
        Math.abs(refData.data[p + 2] - curData.data[p + 2]) +
        Math.abs(refData.data[p + 3] - curData.data[p + 3]));
      diffData.data[p] = magnitude;
      diffData.data[p + 1] = magnitude > 28 ? 42 : 255;
      diffData.data[p + 2] = magnitude > 28 ? 118 : 255;
      diffData.data[p + 3] = magnitude ? 255 : 0;
    }
    diffCtx.putImageData(diffData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    for (const [column, image] of [refCanvas, curCanvas, overlay, diff].entries()) {
      ctx.drawImage(image, 78 + column * 112, y + 13, pane, pane);
    }
  }
  writeFileSync(join(draftDir, "platinum-core-comparison-board.png"), canvas.toBuffer("image/png"));
}

await contactSheet();
if (existsSync(historicalRoot)) {
  await referenceBoard();
  await comparisonBoard();
} else {
  console.warn(`Historical reference cache unavailable at ${historicalRoot}; production assets were still built.`);
}

console.log(`Built ${ids.length} Platinum core icons at independent 32 px and 16 px sizes.`);
