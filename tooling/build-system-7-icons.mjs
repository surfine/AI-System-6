#!/usr/bin/env node
// System 7 colour icons, derived deterministically from the Classic family.
//
// System 7 did not redraw the Macintosh's objects; it coloured them. The
// native 7.5.3 folder (read pixel by pixel from the running system, see
// internal/evidence/drafts/system-7-reference/README.zh-CN.md) is the System 6
// folder's exact one-bit outline, filled with #ccccff: a solid tab, a body
// dithered #ccccff/white, a white highlight under the top edge and a #9999ff
// shade down the right edge. So this builder never invents a shape:
//
//   1. rasterise the Classic mask and line art at the tier size;
//   2. keep every black line pixel black and everything outside the mask
//      transparent;
//   3. fill the rest from the System 7 palette with the era's lighting rule:
//      a pixel under or right of a line catches the light, a pixel above or
//      left of a line falls in shade, everything else takes the base colour
//      (dithered with white for folders, as the native folder is).
//
// Usage: node tooling/build-system-7-icons.mjs [--check]
//   --check  rebuild in memory and fail if any committed PNG differs.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const classicDir = join(root, "apps/desktop/assets/themes/classic/icons");
const outDir = join(root, "apps/desktop/assets/themes/system-7/icons");
const TIERS = [32, 16];

// base / light / shade, all on System 7's palette (0x33 steps for colour,
// the 0x11 grey ramp for greys). `dither` alternates base with white.
const FOLDER = { base: "#ccccff", light: "#ffffff", shade: "#9999ff", dither: true };
const DISK = { base: "#cccccc", light: "#eeeeee", shade: "#777777" };
const PAPER = { base: "#ffffff", light: "#ffffff", shade: "#cccccc" };
const scheme = (base, light, shade) => ({ base, light, shade });
const SCHEMES = {
  folder: FOLDER, systemFolder: FOLDER, helpFolder: FOLDER, applications: FOLDER, documents: FOLDER,
  hardDisk: DISK, startupDisk: DISK, projectDisk: DISK, localModel: DISK, timeMachine: DISK,
  fileFloppy: scheme("#777777", "#aaaaaa", "#444444"),
  projectDisc: scheme("#dddddd", "#ffffff", "#999999"),
  trash: scheme("#aaaaaa", "#dddddd", "#666666"),
  trashFull: scheme("#aaaaaa", "#dddddd", "#666666"),
  document: PAPER, manuscript: PAPER, outline: PAPER, sectionDrafts: PAPER, rebuildArticle: PAPER,
  chatFile: PAPER, systemFile: PAPER, alias: PAPER, questionSheet: scheme("#ffffcc", "#ffffff", "#cccc99"),
  teachText: scheme("#ffff99", "#ffffcc", "#cccc66"),
  quickDraft: scheme("#ffff99", "#ffffcc", "#cccc66"),
  writingStudio: scheme("#ffcc99", "#ffeecc", "#cc9966"),
  writingDemo: scheme("#ffcc99", "#ffeecc", "#cc9966"),
  writingBell: scheme("#ffcc66", "#ffffcc", "#cc9933"),
  assistant: scheme("#ccffcc", "#eeffee", "#66cc66"),
  reviewDesk: scheme("#ccffcc", "#eeffee", "#66cc66"),
  reader: scheme("#ccccff", "#eeeeff", "#6666cc"),
  docMap: scheme("#ccffff", "#eeffff", "#66cccc"),
  searcher: scheme("#99ccff", "#cceeff", "#3366cc"),
  scrapbook: scheme("#ffcccc", "#ffeeee", "#cc6666"),
  clioPaint: scheme("#ffccff", "#ffeeff", "#cc66cc"),
  clioChart: scheme("#ccffff", "#eeffff", "#339999"),
  clioStage: scheme("#ffcccc", "#ffeeee", "#cc6666"),
  clioProject: scheme("#ccccff", "#eeeeff", "#6666cc"),
  lightroom: scheme("#ffcc99", "#ffeecc", "#cc6633"),
  imagePromptStudio: scheme("#ffccff", "#ffeeff", "#993399"),
  liquidCover: scheme("#99ccff", "#cceeff", "#3366cc"),
  cmfStudio: scheme("#ffcc99", "#ffeecc", "#cc6633"),
  soundscape: scheme("#ccffcc", "#eeffee", "#339966"),
  oneMoreTune: scheme("#ffccff", "#ffeeff", "#cc66cc"),
  micropolis: scheme("#ccffcc", "#eeffee", "#339933"),
  openttd: scheme("#ccffcc", "#eeffee", "#339933"),
  bonsaiCity: scheme("#ccffcc", "#eeffee", "#339933"),
  doom: scheme("#ff9966", "#ffcc99", "#993300"),
  endfieldTerminal: scheme("#ffff99", "#ffffcc", "#999933"),
  bureaucracyMeme: scheme("#ffcccc", "#ffeeee", "#cc6666"),
  cloudModel: scheme("#ccffff", "#ffffff", "#6699cc"),
  cloudModelOff: scheme("#dddddd", "#ffffff", "#999999"),
  chatImport: scheme("#ccffcc", "#eeffee", "#66cc66"),
  importUtility: scheme("#cccccc", "#eeeeee", "#777777"),
  dictionary: scheme("#cc9966", "#ffcc99", "#996633"),
  contextPanel: scheme("#ccccff", "#eeeeff", "#6666cc"),
  finderApp: scheme("#99ccff", "#cceeff", "#3366cc"),
  multiFinderApp: scheme("#99ccff", "#cceeff", "#3366cc"),
  systemHelp: scheme("#ffffcc", "#ffffff", "#cccc66"),
  systemStatus: scheme("#cccccc", "#eeeeee", "#777777"),
  control: scheme("#cccccc", "#eeeeee", "#777777"),
  controlPanel: scheme("#cccccc", "#eeeeee", "#777777"),
  controlStrip: scheme("#cccccc", "#eeeeee", "#777777"),
  chooser: scheme("#cccccc", "#eeeeee", "#777777"),
  daHandler: scheme("#cccccc", "#eeeeee", "#777777"),
};

const hex = (value) => [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));

async function bitmap(file, size) {
  const { data, info } = await sharp(readFileSync(file), { density: 72 * (size / 32) * 4 })
    .resize(size, size, { kernel: "nearest" })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const dark = new Uint8Array(size * size);
  for (let index = 0; index < size * size; index += 1) {
    const [r, g, b, a] = data.subarray(index * info.channels, index * info.channels + 4);
    dark[index] = a >= 128 && (r + g + b) / 3 < 128 ? 1 : 0;
  }
  return dark;
}

async function buildIcon(id, size) {
  const art = await bitmap(join(classicDir, `${id}-${size}.svg`), size);
  const mask = await bitmap(join(classicDir, `${id}-mask-${size}.svg`), size);
  const colours = SCHEMES[id] || PAPER;
  const [base, light, shade, white] = [colours.base, colours.light, colours.shade, "#ffffff"].map(hex);
  const out = Buffer.alloc(size * size * 4);
  const line = (x, y) => x >= 0 && y >= 0 && x < size && y < size && art[y * size + x] === 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const inside = mask[index] === 1 || art[index] === 1;
      if (!inside) continue;
      let rgb;
      if (art[index] === 1) rgb = [0, 0, 0];
      else if (line(x + 1, y) || line(x, y + 1)) rgb = shade;
      else if (line(x - 1, y) || line(x, y - 1)) rgb = light;
      else rgb = colours.dither && (x + y) % 2 === 1 ? white : base;
      out.set([...rgb, 255], index * 4);
    }
  }
  return sharp(out, { raw: { width: size, height: size, channels: 4 } }).png({ palette: false }).toBuffer();
}

const check = process.argv.includes("--check");
const ids = readdirSync(classicDir)
  .filter((name) => /-32\.svg$/.test(name) && !name.includes("-mask-"))
  .map((name) => name.replace(/-32\.svg$/, ""))
  .sort();
mkdirSync(outDir, { recursive: true });
let differences = 0;
for (const id of ids) {
  for (const size of TIERS) {
    const png = await buildIcon(id, size);
    const target = join(outDir, `${id}-${size}.png`);
    if (check) {
      if (!existsSync(target) || !readFileSync(target).equals(png)) {
        differences += 1;
        console.error(`NO  ${id}-${size}.png differs from the Classic-derived build`);
      }
    } else {
      writeFileSync(target, png);
    }
  }
}
// The family ledger the release gate reads (tooling/lib/generated-era-runtime-
// assets.mjs): one entry per object, naming exactly the PNG tiers built above.
const familyPath = join(dirname(outDir), "system-7-icon-family.json");
const family = `${JSON.stringify({
  schemaVersion: 1,
  target: "system-7",
  generatedBy: "tooling/build-system-7-icons.mjs",
  sourceBoundary: "Classic mask and line art coloured on the System 7 palette; no native System 7 artwork",
  icons: Object.fromEntries(ids.map((id) => [id, { sizes: Object.fromEntries(TIERS.slice().reverse().map((size) => [String(size), `icons/${id}-${size}.png`])) }])),
}, null, 2)}\n`;
if (check) {
  if (!existsSync(familyPath) || readFileSync(familyPath, "utf8") !== family) {
    differences += 1;
    console.error("NO  system-7-icon-family.json differs from the built icon set");
  }
} else {
  writeFileSync(familyPath, family);
}
const unknown = ids.filter((id) => !SCHEMES[id]);
if (unknown.length) console.log(`note: paper colours for ${unknown.join(", ")}`);
if (check && differences) process.exit(1);
console.log(`${check ? "OK  checked" : "Built"} ${ids.length * TIERS.length} System 7 icons (${ids.length} objects x ${TIERS.join("/")} px)`);
