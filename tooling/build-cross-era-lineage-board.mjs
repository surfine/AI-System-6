#!/usr/bin/env node

// Cross-era lineage board — the review surface for the two questions that
// decide whether the six-appearance icon system works:
//
//   read a row across  -> is this one application redrawn by six design teams?
//   read a column down -> is this one Macintosh from one year?
//
// build-icon-continuity-board.mjs already proves *coverage* (every object owns
// accepted artwork in every appearance). This board is about *fidelity*, so it
// renders each appearance from its own native source size instead of one
// common size, and it puts the product icons next to real period Apple artwork
// held in internal/evidence so the column can be judged against evidence
// rather than memory.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(root, "apps", "desktop");
const draftDir = join(root, "internal/evidence/drafts/era-icons");
mkdirSync(draftDir, { recursive: true });

const THEMES = [
  { id: "classic", label: "System 6", dir: "classic", family: "icons/classic-icon-family.json", base: "icons", sizes: [32], smooth: false },
  { id: "platinum", label: "Mac OS 9", dir: "platinum", family: "platinum-icon-family.json", base: "", sizes: [42, 32], smooth: false },
  { id: "aqua", label: "10.2 Jaguar", dir: "aqua", family: "aqua-icon-family.json", base: "", sizes: [128], smooth: true },
  { id: "snow-leopard", label: "10.6 Snow Leopard", dir: "snow-leopard", family: "snow-leopard-icon-family.json", base: "", sizes: [128], smooth: true },
  { id: "yosemite", label: "10.10 Yosemite", dir: "yosemite", family: "yosemite-icon-family.json", base: "", sizes: [128], smooth: true },
  { id: "liquid-glass", label: "Golden Gate 27", dir: "liquid-glass", family: "liquid-glass-icon-family.json", base: "", sizes: [128], smooth: true },
];

// The objects whose lineage carries the product: system objects the historical
// prototype owns, plus the original applications that must stay one identity.
const LINEAGE_ROWS = [
  "finderApp", "folder", "hardDisk", "trash", "document", "daHandler", "controlPanel",
  "assistant", "searcher", "teachText", "scrapbook", "reviewDesk", "docMap", "reader",
  "manuscript", "projectDisk", "fileFloppy",
];

// Real Apple artwork already held as evidence in this repository. Nothing here
// ships; it exists so a column can be checked against the period instead of
// against taste.
const NATIVE_EVIDENCE = {
  classic: {
    label: "System 6 (native ICN#)",
    root: "internal/evidence/drafts/era-icons/imagegen-redraw/references/classic-native",
    pairs: [
      ["folder", "finder-icn-131-art-32.png"],
      ["document", "finder-icn-132-art-32.png"],
      ["trash", "finder-icn-130-art-32.png"],
      ["fileFloppy", "finder-icn-129-art-32.png"],
      ["hardDisk", "hdsc-icn-16646-art-32.png"],
      ["daHandler", "finder-icn-133-art-32.png"],
      ["teachText", "teachtext-icn-128-art-32.png"],
      ["finderApp", "system-icn-3-art-32.png"],
    ],
    nearest: true,
  },
  aqua: {
    label: "10.2 Jaguar (captured Apple artwork)",
    root: "internal/evidence/drafts/theme-lab-fidelity-cache/aqua/icons",
    pairs: [
      ["folder", "folder-generic-1004.png"],
      ["hardDisk", "harddisk-1004.png"],
      ["trash", "trash-1004.png"],
      ["document", "document-generic-1004.png"],
      ["daHandler", "application-generic-1004.png"],
    ],
    nearest: false,
  },
  "snow-leopard": {
    label: "10.6 Snow Leopard (Apple .iconset)",
    root: "internal/evidence/drafts/snow-leopard-icon-reference/iconsets",
    pairs: [
      ["folder", "GenericFolderIcon.iconset/icon_128x128.png"],
      ["trash", "TrashIcon.iconset/icon_128x128.png"],
      ["document", "GenericDocumentIcon.iconset/icon_128x128.png"],
      ["daHandler", "GenericApplicationIcon.iconset/icon_128x128.png"],
      ["finderApp", "FinderIcon.iconset/icon_128x128.png"],
    ],
    nearest: false,
  },
};

const familyCache = new Map();
function family(theme) {
  if (!familyCache.has(theme.id)) {
    const path = join(root, "apps/desktop/assets/themes", theme.dir, theme.family);
    familyCache.set(theme.id, existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);
  }
  return familyCache.get(theme.id);
}

function resolve(theme, id) {
  const entry = family(theme)?.icons?.[id];
  for (const size of theme.sizes) {
    const declared = entry?.sizes?.[size] || entry?.sizes?.[String(size)];
    const candidates = [
      declared && ["assets/themes", theme.dir, theme.base, declared].filter(Boolean).join("/"),
      `assets/themes/${theme.dir}/icons/${id}-${size}-default.png`,
      `assets/themes/${theme.dir}/icons/${id}-${size}.png`,
      `assets/themes/${theme.dir}/icons/${id}-${size}.svg`,
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (existsSync(join(desktopRoot, candidate))) return candidate;
    }
  }
  return null;
}

async function drawCell(ctx, path, x, y, box, { smooth = true, absolute = false } = {}) {
  const image = await loadImage(absolute ? path : join(desktopRoot, path));
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, x, y, box, box);
}

async function buildLineageBoard() {
  const cell = 150;
  const box = cell - 24;
  const labelWidth = 156;
  const rowHeight = cell;
  const canvas = createCanvas(labelWidth + THEMES.length * cell, 84 + LINEAGE_ROWS.length * rowHeight);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#16181b";
  ctx.font = "bold 21px sans-serif";
  ctx.fillText("Cross-era lineage board", 16, 32);
  ctx.fillStyle = "#5c636b";
  ctx.font = "12px sans-serif";
  ctx.fillText("Row: one application redrawn by six design teams.   Column: one Macintosh from one year.", 16, 54);
  ctx.fillText("Every appearance is rendered from its own native source size, never rescaled from a shared master.", 16, 70);
  ctx.textAlign = "center";
  ctx.fillStyle = "#22262a";
  ctx.font = "bold 13px sans-serif";
  for (const [column, theme] of THEMES.entries()) {
    ctx.fillText(theme.label, labelWidth + column * cell + cell / 2, 82 - 4);
  }
  ctx.textAlign = "left";

  const missing = [];
  for (const [row, id] of LINEAGE_ROWS.entries()) {
    const y = 84 + row * rowHeight;
    ctx.fillStyle = row % 2 ? "#ffffff" : "#f1f2f4";
    ctx.fillRect(0, y, canvas.width, rowHeight);
    ctx.fillStyle = "#16181b";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(id, 14, y + cell / 2);
    for (const [column, theme] of THEMES.entries()) {
      const path = resolve(theme, id);
      const x = labelWidth + column * cell + 12;
      if (!path) {
        missing.push(`${theme.id}/${id}`);
        ctx.fillStyle = "#c0483a";
        ctx.font = "12px sans-serif";
        ctx.fillText("none", x, y + cell / 2);
        continue;
      }
      await drawCell(ctx, path, x, y + 12, box, { smooth: theme.smooth });
      ctx.strokeStyle = "#d5d8dc";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y + 11.5, box + 1, box + 1);
    }
  }
  writeFileSync(join(draftDir, "cross-era-lineage-board.png"), canvas.toBuffer("image/png"));
  return missing;
}

async function buildMixedBoard() {
  const cell = 150;
  const box = cell - 26;
  const eras = Object.entries(NATIVE_EVIDENCE);
  const columns = Math.max(...eras.map(([, era]) => era.pairs.length)) * 2;
  const rowHeight = cell + 46;
  const canvas = createCanvas(24 + columns * cell, 40 + eras.length * rowHeight);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#16181b";
  ctx.font = "bold 21px sans-serif";
  ctx.fillText("Mixed-era check — real Apple artwork (green) beside AI System 6 (red)", 16, 28);

  const report = [];
  for (const [index, [themeId, era]] of eras.entries()) {
    const theme = THEMES.find((entry) => entry.id === themeId);
    const y = 44 + index * rowHeight;
    ctx.fillStyle = "#22262a";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(era.label, 14, y + 2);
    for (const [pair, [id, file]] of era.pairs.entries()) {
      const nativePath = join(root, era.root, file);
      const oursPath = resolve(theme, id);
      const baseX = 14 + pair * 2 * cell;
      for (const [slot, entry] of [["Apple", nativePath], ["ours", oursPath]].entries()) {
        const [tag, source] = entry;
        const x = baseX + slot * cell;
        if (!source || (tag === "Apple" && !existsSync(source))) {
          ctx.fillStyle = "#c0483a";
          ctx.font = "12px sans-serif";
          ctx.fillText("missing", x + 8, y + cell / 2);
          report.push({ theme: themeId, id, missing: tag });
          continue;
        }
        await drawCell(ctx, source, x + 8, y + 16, box, {
          smooth: tag === "Apple" ? !era.nearest : theme.smooth,
          absolute: tag === "Apple",
        });
        ctx.strokeStyle = tag === "Apple" ? "#1f8a5b" : "#b0392c";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 7.5, y + 15.5, box + 1, box + 1);
        ctx.fillStyle = tag === "Apple" ? "#1f8a5b" : "#b0392c";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(`${tag} ${id}`, x + 8, y + cell + 22);
      }
    }
  }
  writeFileSync(join(draftDir, "cross-era-mixed-check.png"), canvas.toBuffer("image/png"));
  return report;
}

const missing = await buildLineageBoard();
const mixed = await buildMixedBoard();
writeFileSync(join(draftDir, "cross-era-lineage-report.json"), `${JSON.stringify({
  schemaVersion: 1,
  generatedBy: "tooling/build-cross-era-lineage-board.mjs",
  lineageBoard: "internal/evidence/drafts/era-icons/cross-era-lineage-board.png",
  mixedBoard: "internal/evidence/drafts/era-icons/cross-era-mixed-check.png",
  rows: LINEAGE_ROWS,
  appearances: THEMES.map((theme) => theme.id),
  nativeEvidenceEras: Object.keys(NATIVE_EVIDENCE),
  missingArtwork: missing,
  missingEvidence: mixed,
}, null, 2)}\n`);
console.log(`lineage board -> internal/evidence/drafts/era-icons/cross-era-lineage-board.png (${LINEAGE_ROWS.length} objects × ${THEMES.length} appearances)`);
console.log(`mixed check   -> internal/evidence/drafts/era-icons/cross-era-mixed-check.png (${Object.keys(NATIVE_EVIDENCE).length} eras with native evidence)`);
if (missing.length) console.log("missing artwork:", missing.join(", "));
if (mixed.length) console.log("missing evidence:", JSON.stringify(mixed));
