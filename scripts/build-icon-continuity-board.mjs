// Cross-era icon continuity board.
//
// One row per semantic object, one column per appearance. The board is the
// acceptance surface for the rule in assets/themes/icon-system-continuity.json:
// a product object keeps one physical metaphor across the six appearances while
// every appearance owns independent artwork.
//
// It also reports which objects still fall back to the shared generated painter,
// so the remaining work is visible instead of implied.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ICON_IDS, ICON_SPECS } from "./lib/icon-family-inventory.mjs";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const continuity = JSON.parse(readFileSync(join(root, "assets/themes/icon-system-continuity.json"), "utf8"));
const draftDir = join(root, "drafts/era-icons");
mkdirSync(draftDir, { recursive: true });

const THEMES = [
  { id: "classic", label: "System 6", dir: "classic", family: "icons/classic-icon-family.json", familyBase: "icons", sizes: [32] },
  { id: "platinum", label: "Mac OS 9", dir: "platinum", family: "platinum-icon-family.json", familyBase: "", sizes: [32] },
  { id: "aqua", label: "10.2 Jaguar", dir: "aqua", family: "aqua-icon-family.json", familyBase: "", sizes: [128, 32] },
  { id: "snow-leopard", label: "10.6 Snow Leopard", dir: "snow-leopard", family: "snow-leopard-icon-family.json", familyBase: "", sizes: [128, 32] },
  { id: "yosemite", label: "10.10 Yosemite", dir: "yosemite", family: "yosemite-icon-family.json", familyBase: "", sizes: [128, 32] },
  { id: "liquid-glass", label: "Liquid Glass", dir: "liquid-glass", family: "liquid-glass-icon-family.json", familyBase: "", sizes: [128, 32] },
];

// The generated fallback family uses a few different file stems for the same
// semantic id; the reviewed cores always use the id itself.
const FALLBACK_STEMS = {
  finderApp: { platinum: "finder-app", yosemite: "finder-app" },
  startupDisk: { platinum: "startup-disk", yosemite: "startup-disk" },
  fileFloppy: { platinum: "floppy" },
};

const familyCache = new Map();
function family(theme) {
  if (!familyCache.has(theme.id)) {
    const path = join(root, "assets/themes", theme.dir, theme.family);
    familyCache.set(theme.id, existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);
  }
  return familyCache.get(theme.id);
}

function resolve(theme, id) {
  const entry = family(theme)?.icons?.[id];
  const reviewed = String(entry?.reviewStatus || "").startsWith("accepted");
  const familyFile = entry?.sizes?.[32] || entry?.sizes?.["32"];
  if (familyFile) {
    const relative = ["assets/themes", theme.dir, theme.familyBase, familyFile].filter(Boolean).join("/");
    if (existsSync(join(root, relative))) return { path: relative, reviewed };
  }
  for (const size of theme.sizes) {
    if (reviewed) {
      // Liquid Glass writes one file per appearance; the board shows Default.
      const appearance = `assets/themes/${theme.dir}/icons/${id}-${size}-default.png`;
      if (existsSync(join(root, appearance))) return { path: appearance, reviewed: true };
      const png = `assets/themes/${theme.dir}/icons/${id}-${size}.png`;
      if (existsSync(join(root, png))) return { path: png, reviewed: true };
      const svg = `assets/themes/${theme.dir}/icons/${id}-${size}.svg`;
      if (existsSync(join(root, svg))) return { path: svg, reviewed: true };
    }
    const stem = FALLBACK_STEMS[id]?.[theme.id] || id;
    const fallback = `assets/themes/${theme.dir}/${stem}-${size}.svg`;
    if (existsSync(join(root, fallback))) return { path: fallback, reviewed: false };
  }
  return null;
}

const ids = ICON_IDS;
const cell = 128;
const rowHeight = 118;
const labelWidth = 150;
const canvas = createCanvas(labelWidth + THEMES.length * cell, 92 + ids.length * rowHeight);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#f1f2f4";
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = "#22262a";
ctx.font = "bold 20px sans-serif";
ctx.fillText("Icon continuity board — one object, six appearances", 18, 34);
ctx.fillStyle = "#5c636b";
ctx.font = "12px sans-serif";
ctx.fillText("Solid frame = accepted era artwork. Dashed frame = generated fallback, not yet reviewed.", 18, 56);

for (let column = 0; column < THEMES.length; column += 1) {
  ctx.fillStyle = "#3a4048";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(THEMES[column].label, labelWidth + column * cell + cell / 2, 82);
  ctx.textAlign = "left";
}

const report = [];
for (let row = 0; row < ids.length; row += 1) {
  const id = ids[row];
  const y = 92 + row * rowHeight;
  ctx.fillStyle = row % 2 ? "#ffffff" : "#e9ebee";
  ctx.fillRect(0, y, canvas.width, rowHeight);
  ctx.fillStyle = "#22262a";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText(id, 14, y + 26);
  ctx.fillStyle = "#5c636b";
  ctx.font = "11px sans-serif";
  const anchor = continuity.semanticAnchors[id];
  const spec = ICON_SPECS.find((entry) => entry.id === id);
  const words = String(anchor?.role || spec?.body || "").slice(0, 26);
  ctx.fillText(words, 14, y + 44);
  const missing = [];
  const fallbacks = [];
  const accepted = [];
  for (let column = 0; column < THEMES.length; column += 1) {
    const theme = THEMES[column];
    const found = resolve(theme, id);
    const x = labelWidth + column * cell;
    if (!found) {
      missing.push(theme.id);
      ctx.strokeStyle = "#c0483a";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 34, y + 22, 60, 60);
      ctx.fillStyle = "#c0483a";
      ctx.font = "11px sans-serif";
      ctx.fillText("none", x + 34, y + 56);
      continue;
    }
    if (found.reviewed) accepted.push(theme.id); else fallbacks.push(theme.id);
    const image = await loadImage(join(root, found.path));
    ctx.drawImage(image, x + 24, y + 12, 80, 80);
    ctx.strokeStyle = found.reviewed ? "#6f8fae" : "#b6bcc3";
    ctx.lineWidth = found.reviewed ? 1.4 : 1;
    ctx.setLineDash(found.reviewed ? [] : [3, 3]);
    ctx.strokeRect(x + 20.5, y + 8.5, 88, 88);
    ctx.setLineDash([]);
    ctx.fillStyle = "#7b828a";
    ctx.font = "10px sans-serif";
    ctx.fillText(found.reviewed ? "accepted" : "fallback", x + 22, y + 110);
  }
  report.push({ id, missing, fallbacks, accepted });
}

writeFileSync(join(draftDir, "icon-continuity-board.png"), canvas.toBuffer("image/png"));

const summary = {
  schemaVersion: 1,
  generatedBy: "scripts/build-icon-continuity-board.mjs",
  board: "drafts/era-icons/icon-continuity-board.png",
  objects: report.length,
  // Counted from artwork that actually exists, never from the declared batch.
  reviewedByTheme: Object.fromEntries(THEMES.map((theme) => [theme.id, report.filter((entry) => entry.accepted.includes(theme.id)).length])),
  declaredBatch: Object.fromEntries(THEMES.map((theme) => [theme.id, (continuity.coreBatches[theme.id] || []).length])),
  stillFallback: Object.fromEntries(THEMES.map((theme) => [
    theme.id,
    report.filter((entry) => entry.fallbacks.includes(theme.id)).map((entry) => entry.id),
  ])),
  missing: report.filter((entry) => entry.missing.length).map((entry) => ({ id: entry.id, themes: entry.missing })),
};
writeFileSync(join(draftDir, "icon-continuity-report.json"), `${JSON.stringify(summary, null, 2)}\n`);
for (const theme of THEMES) {
  const fallback = summary.stillFallback[theme.id];
  console.log(`${theme.id.padEnd(14)} accepted ${String(summary.reviewedByTheme[theme.id]).padStart(2)}/${ids.length}  declared ${String(summary.declaredBatch[theme.id]).padStart(2)}  fallback: ${fallback.length ? fallback.join(", ") : "none"}`);
}
if (summary.missing.length) console.log("missing artwork:", JSON.stringify(summary.missing));
console.log("board -> drafts/era-icons/icon-continuity-board.png");
