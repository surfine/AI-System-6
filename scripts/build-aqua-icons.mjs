// Generates the complete Aqua (10.2) and Snow Leopard (10.6) icon sets from
// the shared anatomy in app/core/system-icons.js.
//
// Continuity rule: the object silhouettes and detail lines are the SAME paths
// the Liquid Glass painter and the Yosemite flat family use - only the
// material changes. Aqua gets the glossy candy treatment (saturated object
// colours, top-left gloss, deep bottom shade, thin dark rim); Snow Leopard
// gets the matte silver treatment (cooler, quieter gradients, a soft top
// highlight, no candy gloss). They are two generations of the same skeuomorph
// era, not one artwork recoloured.
//
// No Apple artwork is copied; these are AI System 6's own paths.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "app/core/system-icons.js"), "utf8");

// Semantic object colours (body gradient stops) - the same identities as the
// Platinum set, kept saturated for Aqua and muted toward silver for 10.6.
const COLORS = {
  startupDisk: ["#e8ecf2", "#c9d2de", "#97a4b4"],
  hardDisk: ["#dfe4ea", "#b9c2cd", "#7f8b99"],
  folder: ["#8fc3ef", "#5aa0e0", "#2f72bd"],
  document: ["#ffffff", "#f3f5f8", "#cfd6e0"],
  applications: ["#f4f7fb", "#dce5f0", "#a9bdd4"],
  trash: ["#e8e8e8", "#d0d0d0", "#a0a0a0"],
  finderApp: ["#f2f6fb", "#d6e2f0", "#9db6d2"],
  fileFloppy: ["#cfd8e2", "#a8b6c4", "#6f8196"],
  assistant: ["#7fa8e8", "#4a74c8", "#2f519e"],
  quickDraft: ["#ffffff", "#f0f2f8", "#d4d9e8"],
  writingStudio: ["#f4f5f9", "#e2e5ee", "#c2c8d8"],
  projectDisk: ["#eef0f4", "#cdd2dc", "#9aa2b0"],
  projectDisc: ["#dbe7f5", "#a9c6e4", "#6f97c4"],
  cloudModel: ["#a9cdf0", "#6fa5dd", "#3f78bb"],
  cloudModelOff: ["#c9cfd8", "#a0aab8", "#707b8c"],
  questionSheet: ["#ffffff", "#f4f1fa", "#ddd6ec"],
  outline: ["#ffffff", "#f0f2f8", "#d2d8ea"],
  sectionDrafts: ["#ffffff", "#eff2f9", "#ced6ea"],
  manuscript: ["#fdfdff", "#e9ecf3", "#c8cfdf"],
  reviewDesk: ["#a9c6ef", "#6f98d8", "#3f6bb0"],
  searcher: ["#b9d2f2", "#7ea9dd", "#477ab8"],
  reader: ["#aecdf2", "#739fe0", "#3f6cb4"],
  timeMachine: ["#d3d6df", "#a4abb8", "#687181"],
  docMap: ["#a9c6f0", "#6f98da", "#3f68ad"],
  clioStage: ["#9dbef0", "#5f8fd4", "#3762aa"],
  clioChart: ["#aac9f2", "#6f9adc", "#3c68b2"],
  liquidCover: ["#8fc0ee", "#4f90d4", "#2c64a8"],
  cmfStudio: ["#a5c6ee", "#6694d8", "#3762ae"],
  soundscape: ["#c9b6e8", "#9a7fd4", "#684fa8"],
  scrapbook: ["#f0dcba", "#d4b98f", "#a9855a"],
  systemFolder: ["#9dbcf0", "#6690d6", "#3a63ab"],
  helpFolder: ["#b9d6f4", "#84b0e4", "#4d7fc0"],
  importUtility: ["#aecdf4", "#7aa6e0", "#4778bd"],
  controlPanel: ["#d9dce3", "#b1b7c3", "#7d8594"],
  chooser: ["#a5c4f0", "#6c96dc", "#3d66b4"],
  systemHelp: ["#b2cff2", "#7ca6e2", "#4978bf"],
  dictionary: ["#eef2f8", "#cfd9ea", "#a0b2d0"],
  teachText: ["#ffffff", "#f2f4f8", "#d5dae6"],
  writingDemo: ["#a9c9f0", "#6c97dc", "#3c67b4"],
  chatFile: ["#dce8f6", "#aec6e4", "#7499c6"],
  chatImport: ["#b9d2f2", "#7fa9e0", "#4a79bf"],
  systemStatus: ["#d7dae1", "#adb3c0", "#7a8290"],
  contextPanel: ["#aecdf2", "#78a4e0", "#4576bd"],
  rebuildArticle: ["#a5c6f0", "#6793da", "#3863b0"],
  bureaucracyMeme: ["#cdc9dc", "#a09ab8", "#656081"],
  endfieldTerminal: ["#23262d", "#2f343d", "#3f4853"],
  documents: ["#f7f8fb", "#e3e6ee", "#c3c9d8"],
  alias: ["#a9c9f0", "#6c97dc", "#3c67b4"],
  systemFile: ["#ffffff", "#f1f3f7", "#d2d8e4"],
  multiFinderApp: ["#a5c4ee", "#6490d8", "#3761ae"],
  daHandler: ["#b9d2f2", "#7fa9e0", "#4a79bf"],
  writingBell: ["#f0d2aa", "#d5ab72", "#a87642"],
  trashFull: ["#e8e8e8", "#d0d0d0", "#a0a0a0"],
  control: ["#d9dce3", "#b1b7c3", "#7d8594"],
};

const DEFAULT_COLORS = ["#9fc3ee", "#6ba0e0", "#3a74bd"];

const TARGETS = [
  "startupDisk", "hardDisk", "folder", "document", "applications", "trash",
  "finderApp", "fileFloppy", "assistant", "quickDraft", "writingStudio",
  "projectDisk", "projectDisc", "cloudModel", "cloudModelOff", "questionSheet",
  "outline", "sectionDrafts", "manuscript", "reviewDesk", "searcher", "reader",
  "timeMachine", "docMap", "clioStage", "clioChart", "liquidCover", "cmfStudio",
  "soundscape", "scrapbook", "systemFolder", "helpFolder", "importUtility",
  "controlPanel", "chooser", "systemHelp", "dictionary", "teachText",
  "writingDemo", "chatFile", "chatImport", "systemStatus", "contextPanel",
  "rebuildArticle", "bureaucracyMeme", "endfieldTerminal", "documents",
  "alias", "systemFile", "multiFinderApp", "daHandler", "writingBell",
  "trashFull", "control",
];

// Aliases: objects with no dedicated source block reuse the nearest sibling
// silhouette (same policy as the Platinum/Yosemite wiring).
const ALIASES = { hardDisk: "startupDisk", control: "controlPanel" };

function extractBlock(id) {
  const bt = String.fromCharCode(96);
  const re = new RegExp("^  " + id + ": " + bt + "\\n([\\s\\S]*?)^  " + bt + ",?", "m");
  const m = re.exec(source);
  return m ? m[1] : null;
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function mix(a, b, t) {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  return "#" + ar.map((v, i) => Math.round(v + (br[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

function classifyElement(element) {
  const cls = (element.match(/class="([^"]*)"/) || [])[1] || "";
  const tag = (element.match(/^<(\w+)/) || [])[1] || "path";
  const d = (element.match(/d="([^"]*)"/) || [])[1] || "";
  const closed = /[zZ]/.test(d) || tag !== "path";
  if (!closed) return "detail";
  if (cls.includes("icon-fill-soft")) return "soft";
  if (cls.includes("icon-accent")) return "accent";
  if (cls.includes("classic-ink")) return "ink";
  if (tag === "circle" || tag === "ellipse") {
    const r = /r="([\d.]+)"/.exec(element);
    const rx = /rx="([\d.]+)"/.exec(element);
    const radius = r ? Number(r[1]) : rx ? Number(rx[1]) : 0;
    return radius >= 4 ? "soft" : "accent";
  }
  return "main";
}

function elementBodyCount(elements) {
  return elements.filter((e) => ["main", "soft"].includes(classifyElement(e))).length;
}

function toPart(element, kind, colors) {
  const d = (element.match(/d="([^"]*)"/) || [])[1] || "";
  if (d) return { d, kind, colors };
  const tag = (element.match(/^<(\w+)/) || [])[1] || "path";
  const attrs = element
    .replace(/^<(\w+)/, "")
    .replace(/\/?>$/, "")
    .replace(/class="[^"]*"/g, "")
    .replace(/fill="[^"]*"/g, "")
    .trim();
  return { shape: `<${tag} ${attrs}/>`, kind, colors };
}

function buildFromSourceBlock(id) {
  const block = extractBlock(id);
  if (!block) return null;
  const elements = block.match(/<[^>]+>/g) || [];
  const bodies = elements.filter((e) => !/^<\//.test(e));
  const mainCount = elementBodyCount(bodies);
  const rawParts = [];
  for (const element of bodies) {
    const kind = classifyElement(element);
    if (kind === "main" || kind === "soft") {
      rawParts.push({ element, kind, colors: COLORS[id] || DEFAULT_COLORS });
    } else if (kind === "accent" || (kind === "ink" && mainCount > 0)) {
      rawParts.push({ element, kind: "accent" });
    } else if (kind === "ink") {
      rawParts.push({ element, kind: "main", colors: COLORS[id] || DEFAULT_COLORS });
    } else {
      rawParts.push({ element, kind: "detail" });
    }
  }
  const mainParts = rawParts.filter((p) => p.kind === "main");
  const softParts = rawParts.filter((p) => p.kind === "soft");
  if (mainParts.length === 0 && softParts.length > 0) {
    mainParts.push(softParts.shift());
  }
  return rawParts.map((p) => toPart(p.element, p.kind, p.colors));
}

// ---- material recipes ------------------------------------------------------
// AQUA 10.2: glossy candy. Saturated body, diagonal top-left gloss, deep
// bottom shade, thin dark rim, top-left white edge light.
function renderAqua(id, parts, size = 32) {
  const bodyParts = parts.filter((p) => p.kind === "main");
  const softParts = parts.filter((p) => p.kind === "soft");
  const markParts = parts.filter((p) => ["ink", "light", "accent"].includes(p.kind));
  const detailParts = parts.filter((p) => p.kind === "detail");
  const mainColors = bodyParts[0]?.colors || DEFAULT_COLORS;
  const softColors = softParts[0]?.colors || mainColors.map((c) => mix(c, "#ffffff", 0.45));
  const strokeW = 1;
  const inkDefault = mix(mainColors[2], "#111111", 0.35);
  const fillShape = (p, fill) => p.d
    ? `<path d="${p.d}" fill="${fill}" stroke="#1d1d1d" stroke-width="${strokeW}" />`
    : p.shape.replace(/\/>$/, ` fill="${fill}" stroke="#1d1d1d" stroke-width="${strokeW}" />`);
  const clipShape = (p) => (p.d ? `<path d="${p.d}" />` : p.shape);
  const bodySvg = [
    ...bodyParts.map((p) => fillShape(p, "url(#g-body)")),
    ...softParts.map((p) => fillShape(p, "url(#g-soft)")),
  ].join("\n    ");
  const clipBody = [...bodyParts, ...softParts].map(clipShape).join("\n      ");
  const markSvg = markParts
    .map((p) => {
      const fill = p.color || (p.kind === "accent" ? inkDefault : "#222222");
      return p.d
        ? `<path d="${p.d}" fill="${fill}" stroke="#222222" stroke-width="0.8" />`
        : p.shape.replace(/\/>$/, ` fill="${fill}" stroke="#222222" stroke-width="0.8" />`);
    })
    .join("\n  ");
  const detailSvg = detailParts
    .map((p) => `<path d="${p.d}" fill="none" stroke="#333333" stroke-width="1" stroke-linecap="square" />`)
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="geometricPrecision">
  <!-- Aqua 10.2 painter (shared recipe): saturated object, glossy top-left
       light, deep bottom shade, thin dark rim. Same anatomy as the Liquid
       Glass painter and the Yosemite flat family. No Apple art. -->
  <defs>
    <linearGradient id="g-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${mix(mainColors[0], "#ffffff", 0.08)}"/>
      <stop offset="0.45" stop-color="${mainColors[1]}"/>
      <stop offset="1" stop-color="${mix(mainColors[2], "#000000", 0.12)}"/>
    </linearGradient>
    <linearGradient id="g-soft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${softColors[0]}"/>
      <stop offset="1" stop-color="${softColors[2]}"/>
    </linearGradient>
    <linearGradient id="g-gloss" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="0.3" stop-color="#ffffff" stop-opacity="0.42"/>
      <stop offset="0.7" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="g-spec" cx="0.24" cy="0.2" r="0.52">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="g-shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.3"/>
    </linearGradient>
    <clipPath id="cp-body">
      ${clipBody}
    </clipPath>
  </defs>
  ${bodySvg}
  <g clip-path="url(#cp-body)">
    <rect x="0" y="0" width="${size}" height="${size}" fill="url(#g-gloss)"/>
    <rect x="0" y="0" width="${size}" height="${size}" fill="url(#g-spec)"/>
    <rect x="0" y="0" width="${size}" height="${size}" fill="url(#g-shade)"/>
    <rect x="1" y="0" width="${size - 2}" height="1" fill="#ffffff" fill-opacity="0.55"/>
    <rect x="0" y="1" width="1" height="${size - 2}" fill="#ffffff" fill-opacity="0.4"/>
  </g>
  ${markSvg}
  ${detailSvg}
</svg>
`;
}

// SNOW LEOPARD 10.6: matte silver. Cooler muted body, soft top highlight,
// gentle bottom shade, soft rim. Distinctly quieter than Aqua.
function renderSnowLeopard(id, parts, size = 32) {
  const bodyParts = parts.filter((p) => p.kind === "main");
  const softParts = parts.filter((p) => p.kind === "soft");
  const markParts = parts.filter((p) => ["ink", "light", "accent"].includes(p.kind));
  const detailParts = parts.filter((p) => p.kind === "detail");
  const mainColors = bodyParts[0]?.colors || DEFAULT_COLORS;
  const softColors = softParts[0]?.colors || mainColors.map((c) => mix(c, "#ffffff", 0.5));
  // 10.6 objects read as pale silver-blue, not the saturated 10.2 candy.
  const SILVER = ["#f5f7f9", "#e3e7ec", "#c7cdd6"];
  const silverBody = mainColors.map((c, i) => mix(c, SILVER[i], 0.58));
  const silverSoft = softColors.map((c, i) => mix(c, SILVER[i], 0.45));
  const strokeW = 1;
  const inkDefault = mix(mainColors[2], "#222222", 0.5);
  const fillShape = (p, fill) => p.d
    ? `<path d="${p.d}" fill="${fill}" stroke="#4d4d4d" stroke-width="${strokeW}" />`
    : p.shape.replace(/\/>$/, ` fill="${fill}" stroke="#4d4d4d" stroke-width="${strokeW}" />`);
  const clipShape = (p) => (p.d ? `<path d="${p.d}" />` : p.shape);
  const bodySvg = [
    ...bodyParts.map((p) => fillShape(p, "url(#g-body)")),
    ...softParts.map((p) => fillShape(p, "url(#g-soft)")),
  ].join("\n    ");
  const clipBody = [...bodyParts, ...softParts].map(clipShape).join("\n      ");
  const markSvg = markParts
    .map((p) => {
      const fill = p.color || (p.kind === "accent" ? inkDefault : "#3c3c3c");
      return p.d
        ? `<path d="${p.d}" fill="${fill}" stroke="#3c3c3c" stroke-width="0.8" />`
        : p.shape.replace(/\/>$/, ` fill="${fill}" stroke="#3c3c3c" stroke-width="0.8" />`);
    })
    .join("\n  ");
  const detailSvg = detailParts
    .map((p) => `<path d="${p.d}" fill="none" stroke="#4a4a4a" stroke-width="1" stroke-linecap="square" />`)
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="geometricPrecision">
  <!-- Snow Leopard 10.6 painter (shared recipe): matte silver body, soft top
       highlight, gentle shade, quiet rim. Same anatomy, quieter generation. -->
  <defs>
    <linearGradient id="g-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${silverBody[0]}"/>
      <stop offset="0.5" stop-color="${silverBody[1]}"/>
      <stop offset="1" stop-color="${silverBody[2]}"/>
    </linearGradient>
    <linearGradient id="g-soft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${silverSoft[0]}"/>
      <stop offset="1" stop-color="${silverSoft[2]}"/>
    </linearGradient>
    <linearGradient id="g-hi" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.38"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="g-sh" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.6" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.16"/>
    </linearGradient>
    <clipPath id="cp-body">
      ${clipBody}
    </clipPath>
  </defs>
  ${bodySvg}
  <g clip-path="url(#cp-body)">
    <rect x="0" y="0" width="${size}" height="${size}" fill="url(#g-hi)"/>
    <rect x="0" y="0" width="${size}" height="${size}" fill="url(#g-sh)"/>
    <rect x="1" y="0" width="${size - 2}" height="1" fill="#ffffff" fill-opacity="0.55"/>
  </g>
  ${markSvg}
  ${detailSvg}
</svg>
`;
}

const aquaDir = join(root, "assets/themes/aqua");
const slDir = join(root, "assets/themes/snow-leopard");
mkdirSync(aquaDir, { recursive: true });
mkdirSync(slDir, { recursive: true });

const aquaManifest = {};
const slManifest = {};
let built = 0;
for (const id of TARGETS) {
  const parts = buildFromSourceBlock(id);
  if (!parts) {
    const source = ALIASES[id];
    if (!source || !buildFromSourceBlock(source)) {
      console.log(`skip ${id}: no path block`);
      continue;
    }
    const srcParts = buildFromSourceBlock(source);
    const aquaFile = `${id}-32.svg`;
    const slFile = `${id}-32.svg`;
    writeFileSync(join(aquaDir, aquaFile), renderAqua(id, srcParts));
    writeFileSync(join(slDir, slFile), renderSnowLeopard(id, srcParts));
    aquaManifest[id] = aquaFile;
    slManifest[id] = slFile;
    built += 1;
    continue;
  }
  const aquaFile = `${id}-32.svg`;
  const slFile = `${id}-32.svg`;
  writeFileSync(join(aquaDir, aquaFile), renderAqua(id, parts));
  writeFileSync(join(slDir, slFile), renderSnowLeopard(id, parts));
  aquaManifest[id] = aquaFile;
  slManifest[id] = slFile;
  built += 1;
}
writeFileSync(join(aquaDir, "aqua-icon-manifest.json"), `${JSON.stringify(aquaManifest, null, 2)}\n`);
writeFileSync(join(slDir, "snow-leopard-icon-manifest.json"), `${JSON.stringify(slManifest, null, 2)}\n`);
console.log(`built ${built} Aqua + ${built} Snow Leopard icons`);

// Compose one sprite per theme so the production CSS needs only a shared
// background-image plus short background-position rules. The sprite is a
// separate asset and does not count against the floppy budget.
const SPRITE_COLS = 8;
const SPRITE_CELL = 32;
const spriteCss = [];
let allIds = [];
for (const [theme, dir, manifestFile, varName] of [
  ["aqua", aquaDir, "aqua-icon-manifest.json", "--aqua-icon"],
  ["snow-leopard", slDir, "snow-leopard-icon-manifest.json", "--snow-icon"],
]) {
  const manifest = JSON.parse(readFileSync(join(dir, manifestFile), "utf8"));
  const ids = Object.keys(manifest);
  const rows = Math.ceil(ids.length / SPRITE_COLS);
  const canvas = createCanvas(SPRITE_COLS * SPRITE_CELL, rows * SPRITE_CELL);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const positions = {};
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const img = await loadImage(join(dir, manifest[id]));
    const col = i % SPRITE_COLS;
    const row = Math.floor(i / SPRITE_COLS);
    ctx.drawImage(img, col * SPRITE_CELL, row * SPRITE_CELL, SPRITE_CELL, SPRITE_CELL);
    positions[id] = { x: -col * SPRITE_CELL, y: -row * SPRITE_CELL };
  }
  const spriteFile = `${theme}-sprite.png`;
  writeFileSync(join(dir, spriteFile), canvas.toBuffer("image/png"));
  allIds = ids;
  spriteCss.push(
    `body[data-theme="${theme}"] .sys-icon {\n` +
    `  ${varName}: url("./assets/themes/${theme}/${spriteFile}");\n` +
    `  --sprite-size: ${canvas.width}px ${canvas.height}px;\n` +
    `}\n`,
  );
  writeFileSync(join(dir, `${theme}-sprite-positions.json`), `${JSON.stringify(positions, null, 2)}\n`);
  console.log(`sprite ${theme}: ${ids.length} icons -> ${spriteFile} (${canvas.width}x${canvas.height})`);
}
const sharedList = allIds.map((id) => `[data-system-icon="${id}"]`).join(",");
// Transport glyphs and menu chrome keep the inline painter, not the sprite.
const TRANSPORT = ["play", "pause", "previousTrack", "nextTrack", "shuffleTracks", "repeatTracks", "speaker"];
// :where() keeps the exclusion list specificity-free so 66-theme-lab's own
// icon rules (loaded later) can still win for the Theme Lab fixtures.
const notTransport = `:not(:where(${TRANSPORT.map((id) => `[data-system-icon="${id}"]`).join(", ")}))`;
const sharedPositions = allIds
  .map((id) => {
    const manifest = JSON.parse(readFileSync(join(aquaDir, "aqua-icon-manifest.json"), "utf8"));
    // Positions are identical across themes (same id order); read aqua's.
    const positions = JSON.parse(readFileSync(join(aquaDir, "aqua-sprite-positions.json"), "utf8"));
    const { x, y } = positions[id];
    const px = (v) => (v === 0 ? "0" : `${v}px`);
    return `[data-system-icon="${id}"]{--sp:${px(x)} ${px(y)}}`;
  })
  .join("\n");
const fullCss = `/* Aqua branch complete icon sets (${allIds.length} objects). Continuity: the
   same silhouettes as the Liquid Glass painter / Yosemite flat family;
   material is the era generation (10.2 glossy candy vs 10.6 matte silver).
   Icons live in per-theme PNG sprites. Transport glyphs and menu chrome keep
   the inline painter. Position rules are theme-independent: --sp is consumed
   only by the Aqua/SL sprite rule, so other appearances ignore it.
   No Apple art; AI System 6 paths. */
:where(body[data-theme="aqua"], body[data-theme="snow-leopard"])
  .sys-icon[data-system-icon]${notTransport} {
  border: 0;
  border-radius: 0;
  background-color: transparent;
  background-image: var(--aqua-icon, var(--snow-icon, none));
  background-repeat: no-repeat;
  background-position: var(--sp, center);
  background-size: var(--sprite-size, contain);
  box-shadow: none;
}
body[data-theme="aqua"] .sys-icon {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
}
:where(body[data-theme="aqua"], body[data-theme="snow-leopard"])
  .sys-icon[data-system-icon]${notTransport} .sys-icon-svg {
  display: none;
}
${spriteCss.join("\n")}
/* Shared sprite positions (theme-independent). */
${sharedPositions}
`;
writeFileSync(join(root, "drafts", "aqua-sprite-css.txt"), fullCss);
console.log("full sprite CSS -> drafts/aqua-sprite-css.txt");
