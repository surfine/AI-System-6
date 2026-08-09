// Generates EVERY Platinum painter SVG through one shared Mac OS 9 material
// recipe, so the whole set is a single style:
//
//   1. dark 1px rim around every body part
//   2. per-part semantic gradient bodies
//   3. pastel soft panels (faces, shutters, wells, labels)
//   4. clipped diagonal top-left highlight, bottom-right shade, edge strips
//   5. dark ink details / accents drawn on top
//
// The eight approved reference painters (startup disk, folder, document,
// Applications, Trash, Finder, floppy, hard disk) keep their anatomy and
// colours but are rendered by the same pipeline, so nothing in the set is
// "line-art style" anymore. No Apple artwork is copied -- these are AI
// System 6's own paths.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "app/core/system-icons.js"), "utf8");
const outDir = join(root, "assets/themes/platinum");
mkdirSync(outDir, { recursive: true });

// Per-icon Platinum material palette (body gradient stops). The brief:
// bright but not neon (Marshall McLuhan-era Macintosh), plastic / paper /
// metal / small-object materials, stable front-facing perspective. Each icon
// keeps its subject identity; the shared recipe supplies the keyline, white
// highlight, subtle bevel and pixel-crisp rendering.
const COLORS = {
  assistant: ["#a8c8f5", "#5f8fd8", "#2f58a8"],
  quickDraft: ["#ffffff", "#eef0f6", "#c8cfe0"],
  writingStudio: ["#f2f4fa", "#d8dcea", "#aab2cc"],
  projectDisk: ["#e0e6f0", "#b8c2d4", "#7a8aa8"],
  projectDisc: ["#d8ecf8", "#a4d0ea", "#5f9cc4"],
  cloudModel: ["#a8d8f5", "#6fb0e0", "#3f7fb8"],
  cloudModelOff: ["#c8ccd8", "#989fb0", "#606878"],
  questionSheet: ["#ffffff", "#f2f0f6", "#d0c8de"],
  outline: ["#ffffff", "#eef0f6", "#c8d0e0"],
  sectionDrafts: ["#ffffff", "#eef2f8", "#c4cfe4"],
  manuscript: ["#fbfcfd", "#e4e8f0", "#bcc4d4"],
  reviewDesk: ["#a8c8f0", "#5f8fdc", "#2f5fb0"],
  searcher: ["#b8d4f5", "#78a8e4", "#4078c0"],
  reader: ["#a8c8f2", "#6898e0", "#3060b4"],
  timeMachine: ["#c8ced8", "#98a0b0", "#586078"],
  docMap: ["#a0c4f0", "#5f90dc", "#3060b0"],
  clioStage: ["#a0c0f0", "#5888d8", "#3058ac"],
  clioChart: ["#a8c8f2", "#6090e0", "#3060b4"],
  liquidCover: ["#90c0f0", "#4890d8", "#2860ac"],
  cmfStudio: ["#a0c4f0", "#5c8cdc", "#3058b0"],
  soundscape: ["#c8b8f0", "#9880d8", "#6048ac"],
  scrapbook: ["#ecd8b8", "#d0b088", "#a08050"],
  systemFolder: ["#98bcf0", "#5c88d8", "#3058ac"],
  helpFolder: ["#b8d4f4", "#80a8e8", "#4878c4"],
  importUtility: ["#a8ccf4", "#70a0e4", "#4078c0"],
  controlPanel: ["#d4d8e0", "#a8b0c0", "#747c90"],
  chooser: ["#a0c0f0", "#6090e0", "#3860b8"],
  systemHelp: ["#b0ccf4", "#78a0e8", "#4078c4"],
  dictionary: ["#e4ecf6", "#c0d0e8", "#8ca4cc"],
  teachText: ["#ffffff", "#f0f2f8", "#ccd4e4"],
  writingDemo: ["#a0c4f0", "#5c90e0", "#3060b8"],
  chatFile: ["#d4e4f6", "#a0c0e8", "#6088c8"],
  chatImport: ["#b4d0f4", "#78a4e4", "#4078c4"],
  systemStatus: ["#d0d6de", "#a4acbc", "#70788c"],
  contextPanel: ["#a8ccf4", "#70a0e4", "#4078c4"],
  rebuildArticle: ["#9cc0f0", "#5c8cdc", "#305cb4"],
  bureaucracyMeme: ["#c8c8d8", "#9494b4", "#585878"],
  endfieldTerminal: ["#404854", "#2c323c", "#1c1e26"],
  documents: ["#f2f4f8", "#dce0ec", "#b8c0d4"],
  alias: ["#a0c4f0", "#5c90e0", "#3060b8"],
  systemFile: ["#ffffff", "#eef0f6", "#c8d0e0"],
  multiFinderApp: ["#98bcf0", "#5488dc", "#2858b0"],
  daHandler: ["#b4d0f4", "#78a4e4", "#4078c4"],
  writingBell: ["#e8d0a8", "#c8a068", "#987040"],
};

const DEFAULT_COLORS = ["#b9cdef", "#7fa4dd", "#4574b8"];

const TARGETS = [
  "assistant", "quickDraft", "writingStudio", "projectDisk", "projectDisc",
  "cloudModel", "cloudModelOff", "questionSheet", "outline", "sectionDrafts",
  "manuscript", "reviewDesk", "searcher", "reader", "timeMachine", "docMap",
  "clioStage", "clioChart", "liquidCover", "cmfStudio", "soundscape",
  "scrapbook", "systemFolder", "helpFolder", "importUtility", "controlPanel",
  "chooser", "systemHelp", "dictionary", "teachText", "writingDemo",
  "chatFile", "chatImport", "systemStatus", "contextPanel", "rebuildArticle",
  "bureaucracyMeme", "endfieldTerminal", "documents", "alias", "systemFile",
  "multiFinderApp", "daHandler", "writingBell",
];

// Approved reference painters, encoded as parts. Each part keeps the
// hand-drawn anatomy and palette; the shared recipe supplies rim, volume and
// overlays so the construction is identical to the generated set.
const REFERENCE_ICONS = {
  startupDisk: {
    files: ["startup-disk-32.svg", "startup-disk-16.svg"],
    parts: {
      "32": [
        { d: "M3 3h23v2h3v23H3z", kind: "main", colors: ["#f2f2f4", "#dedee2", "#b0b0ba"] },
        { d: "M8 9h15v11H8z", kind: "soft", colors: ["#a8c0ec", "#7090d4", "#4060a8"] },
        { d: "M9 18h13v2H9z", kind: "ink", color: "#2c2c34" },
        { d: "M8 21h17v2H8zM8 24h11v1H8z", kind: "ink", color: "#1c1c24" },
      ],
      "16": [
        { d: "M2 2h10v1h2v11H2z", kind: "main", colors: ["#f2f2f4", "#dedee2", "#b0b0ba"] },
        { d: "M4 5h7v5H4z", kind: "soft", colors: ["#a8c0ec", "#7090d4", "#4060a8"] },
        { d: "M4 11h8v1H4z", kind: "ink", color: "#1c1c24" },
      ],
    },
  },
  folder: {
    files: ["folder-32.svg", "folder-16.svg"],
    parts: {
      "32": [
        { d: "M3 7h26v21H3z", kind: "main", colors: ["#e0e0ff", "#ccccff", "#b0b0f4"] },
        { d: "M4 3h10v4H4z", kind: "soft", colors: ["#b9b9ff", "#9999ff", "#7070d8"] },
      ],
      "16": [
        { d: "M2 4h12v10H2z", kind: "main", colors: ["#e0e0ff", "#ccccff", "#b0b0f4"] },
        { d: "M2 2h6v2H2z", kind: "soft", colors: ["#b9b9ff", "#9999ff", "#7070d8"] },
      ],
    },
  },
  document: {
    files: ["document-32.svg", "document-16.svg"],
    parts: {
      "32": [
        { d: "M5 2h15v4h7v24H5z", kind: "main", colors: ["#ffffff", "#f4f4f6", "#d0d0da"] },
        { d: "M20 2h7v4h-7z", kind: "soft", colors: ["#e8e8ee", "#d4d4de", "#b8b8c4"] },
        { d: "M7 11h14v1H7zM7 15h17v1H7zM7 19h12v1H7zM7 23h15v1H7z", kind: "ink", color: "#33333c" },
      ],
      "16": [
        { d: "M3 2h6v2h4v10H3z", kind: "main", colors: ["#ffffff", "#f4f4f6", "#d0d0da"] },
        { d: "M9 2h4v2H9z", kind: "soft", colors: ["#e8e8ee", "#d4d4de", "#b8b8c4"] },
        { d: "M5 7h7v1H5zM5 9h7v1H5zM5 11h5v1H5z", kind: "ink", color: "#33333c" },
      ],
    },
  },
  applications: {
    files: ["applications-32.svg", "applications-16.svg"],
    parts: {
      "32": [
        { d: "M3 7h26v21H3z", kind: "main", colors: ["#eeeeF2", "#dedee8", "#bdbdcb"] },
        { d: "M4 3h10v4H4z", kind: "soft", colors: ["#b3b3dd", "#9c9cce", "#7070b0"] },
        { d: "M7 12h7v7H7zM18 12h7v7h-7zM7 21h7v7H7zM18 21h7v7h-7z", kind: "light", color: "#ffffff" },
        { d: "M6 12h9v1H6zM6 19h9v1H6zM6 21h9v1H6zM6 28h9v1H6zM17 12h9v1h-9zM17 19h9v1h-9zM17 21h9v1h-9zM17 28h9v1h-9z", kind: "ink", color: "#8f8fb0" },
      ],
      "16": [
        { d: "M2 4h12v10H2z", kind: "main", colors: ["#eeeeF2", "#dedee8", "#bdbdcb"] },
        { d: "M2 2h6v2H2z", kind: "soft", colors: ["#b3b3dd", "#9c9cce", "#7070b0"] },
        { d: "M4 6h3v3H4zM9 6h3v3H9zM4 10h3v3H4zM9 10h3v3H9z", kind: "light", color: "#ffffff" },
        { d: "M3 6h5v1H3zM3 9h5v1H3zM3 10h5v1H3zM3 13h5v1H3zM8 6h5v1H8zM8 9h5v1H8zM8 10h5v1H8zM8 13h5v1H8z", kind: "ink", color: "#8f8fb0" },
      ],
    },
  },
  trash: {
    files: ["trash-32.svg", "trash-16.svg"],
    parts: {
      "32": [
        { d: "M5 4h22v24H5z", kind: "main", colors: ["#f0f0f0", "#e0e0e0", "#b8b8b8"] },
        { d: "M8 5h1v22H8zM13 5h1v22h-1zM18 5h1v22h-1zM23 5h1v22h-1z", kind: "light", color: "#ffffff" },
        { d: "M5 25h22v1H5z", kind: "ink", color: "#8f8f8f" },
        { d: "M7 2h18v2H7z", kind: "accent", color: "#999999" },
      ],
      "16": [
        { d: "M3 3h10v11H3z", kind: "main", colors: ["#f0f0f0", "#e0e0e0", "#b8b8b8"] },
        { d: "M4 4h1v9H4zM7 4h1v9H7zM10 4h1v9h-1z", kind: "light", color: "#ffffff" },
        { d: "M3 12h10v1H3z", kind: "ink", color: "#8f8f8f" },
        { d: "M4 2h8v1H4z", kind: "accent", color: "#999999" },
      ],
    },
  },
  finderApp: {
    files: ["finder-app-32.svg", "finder-app-16.svg"],
    parts: {
      "32": [
        { d: "M4 4h11v24H4z", kind: "main", colors: ["#ffffff", "#f4f4f6", "#dcdce0"] },
        { d: "M17 4h11v24H17z", kind: "soft", colors: ["#34343c", "#24242c", "#141418"] },
        { d: "M9 10h1v2H9zM6 19q3.5 4.5 7 0", kind: "ink", color: "#1c1c24" },
        { d: "M22 10h1v2h-1zM19 19q3.5 4.5 7 0", kind: "ink", color: "#ffffff" },
      ],
      "16": [
        { d: "M3 4h5v9H3z", kind: "main", colors: ["#ffffff", "#f4f4f6", "#dcdce0"] },
        { d: "M8 4h5v9H8z", kind: "soft", colors: ["#34343c", "#24242c", "#141418"] },
        { d: "M5 6h1v1H5zM5 9h2v1H5zM9 6h1v1H9zM9 9h2v1H9z", kind: "ink", color: "#1c1c24" },
      ],
    },
  },
  floppy: {
    files: ["floppy-32.svg"],
    parts: {
      "32": [
        { d: "M1 1h14v17h-14zM16 8h5v10h-5zM22 1h8v17h-8zM4 19h23v12h-23z", kind: "main", colors: ["#dcdce6", "#cfd1de", "#a6a8ba"] },
        { d: "M7 1h8v9h-8zM16 9h5v1h-5zM22 1h1v9h-1zM7 9h9v1h-9zM22 9h1v1h-1z", kind: "soft", colors: ["#f2f2f7", "#d8dae4", "#b8bcc8"] },
        { d: "M9 1h1v9h-1zM11 1h1v9h-1zM13 1h1v9h-1z", kind: "ink", color: "#8f93a8" },
        { d: "M8 10h15v1h-15zM5 18h22v1h-22z", kind: "ink", color: "#1c1c24" },
        { d: "M6 19h8v9h-8z", kind: "light", color: "#ccffff" },
        { d: "M7 21h6v1H7zM7 23h6v1H7zM7 25h4v1H7z", kind: "ink", color: "#336699" },
      ],
    },
  },
};

function extractBlock(id) {
  const bt = String.fromCharCode(96);
  const re = new RegExp("^  " + id + ": " + bt + "\\n([\\s\\S]*?)^  " + bt + ",?", "m");
  const m = re.exec(source);
  return m ? m[1] : null;
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---- colour helpers --------------------------------------------------------
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function mix(a, b, t) {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  return "#" + ar.map((v, i) => Math.round(v + (br[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function stopsFor(triple, toward, t) {
  return triple.map((c) => mix(c, toward, t));
}

// ---- source-block element classification ----------------------------------
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

function promoteLoneSoft(mainParts, softParts) {
  if (mainParts.length === 0 && softParts.length > 0) {
    mainParts.push(softParts.shift());
  }
}

// Canonical part: { d } (path data) or { shape } (raw <rect|circle|ellipse/>).
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
      rawParts.push({ element, kind, colors: COLORS[id] });
    } else if (kind === "accent" || (kind === "ink" && mainCount > 0)) {
      rawParts.push({ element, kind: "accent" });
    } else if (kind === "ink") {
      rawParts.push({ element, kind: "main", colors: COLORS[id] });
    } else {
      rawParts.push({ element, kind: "detail" });
    }
  }
  const mainParts = rawParts.filter((p) => p.kind === "main");
  const softParts = rawParts.filter((p) => p.kind === "soft");
  promoteLoneSoft(mainParts, softParts);
  return rawParts.map((p) => toPart(p.element, p.kind, p.colors));
}

// ---- the shared painter ----------------------------------------------------
function renderIcon({ id, size, parts, sourceComment }) {
  const bodyParts = parts.filter((p) => p.kind === "main");
  const softParts = parts.filter((p) => p.kind === "soft");
  const markParts = parts.filter((p) => ["ink", "light", "accent"].includes(p.kind));
  const detailParts = parts.filter((p) => p.kind === "detail");

  const mainColors = bodyParts[0]?.colors || DEFAULT_COLORS;
  const softColors = softParts[0]?.colors || stopsFor(mainColors, "#ffffff", 0.45);
  const mainGradient = stopsFor(mainColors, "#ffffff", 0);
  const softGradient = stopsFor(softColors, "#ffffff", 0);
  const inkDefault = mix(mainColors[2], "#111111", 0.45);

  const strokeW = size === 32 ? 1 : 0.8;
  const edgeW = size === 32 ? 2 : 1;

  const fillShape = (p, fill) => {
    if (p.d) return `<path d="${p.d}" fill="${fill}" stroke="#111" stroke-width="${strokeW}" />`;
    return p.shape.replace(/\/>$/, ` fill="${fill}" stroke="#111" stroke-width="${strokeW}" />`);
  };
  const clipShape = (p) => (p.d ? `<path d="${p.d}" />` : p.shape);

  const bodySvg = [
    ...bodyParts.map((p) => fillShape(p, "url(#g-body)")),
    ...softParts.map((p) => fillShape(p, "url(#g-soft)")),
  ].join("\n    ");
  const clipBody = [...bodyParts, ...softParts].map(clipShape).join("\n      ");
  const markSvg = markParts
    .map((p) => {
      const fill = p.color || (p.kind === "accent" ? inkDefault : "#111111");
      if (p.d) return `<path d="${p.d}" fill="${fill}" stroke="#111" stroke-width="${size === 32 ? 0.8 : 0.6}" />`;
      return p.shape.replace(/\/>$/, ` fill="${fill}" stroke="#111" stroke-width="${size === 32 ? 0.8 : 0.6}" />`);
    })
    .join("\n  ");
  const detailSvgText = detailParts
    .map((p) => `<path d="${p.d}" fill="none" stroke="#111" stroke-width="${strokeW}" stroke-linecap="square" />`)
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">
  <!-- Platinum painter (shared recipe)${sourceComment ? " " + sourceComment : ""}.
       Black keyline, white highlight, subtle bevel, pixel-crisp edges,
       material palette, restrained shading. No Apple art. -->
  <defs>
    <linearGradient id="g-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${mainGradient[0]}"/>
      <stop offset="0.5" stop-color="${mainGradient[1]}"/>
      <stop offset="1" stop-color="${mainGradient[2]}"/>
    </linearGradient>
    <linearGradient id="g-soft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${softGradient[0]}"/>
      <stop offset="0.5" stop-color="${softGradient[1]}"/>
      <stop offset="1" stop-color="${softGradient[2]}"/>
    </linearGradient>
    <linearGradient id="g-hi" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="g-sh" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0.6" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.2"/>
    </linearGradient>
    <clipPath id="cp-body">
      ${clipBody}
    </clipPath>
  </defs>
  ${bodySvg}
  <g clip-path="url(#cp-body)">
    <rect x="0" y="0" width="${size}" height="${size}" fill="url(#g-hi)"/>
    <rect x="0" y="0" width="${size}" height="${size}" fill="url(#g-sh)"/>
    <rect x="0" y="0" width="${edgeW}" height="${size}" fill="#ffffff" fill-opacity="0.32"/>
    <rect x="0" y="0" width="${size}" height="${edgeW}" fill="#ffffff" fill-opacity="0.24"/>
    <rect x="${size - edgeW}" y="0" width="${edgeW}" height="${size}" fill="#000000" fill-opacity="0.2"/>
    <rect x="0" y="${size - edgeW}" width="${size}" height="${edgeW}" fill="#000000" fill-opacity="0.16"/>
  </g>
  ${markSvg}
  ${detailSvgText}
</svg>
`;
}

const manifest = {};

for (const id of TARGETS) {
  const parts = buildFromSourceBlock(id);
  if (!parts) {
    console.log(`skip ${id}: no path block`);
    continue;
  }
  const file = `${id}-32.svg`;
  const svg = renderIcon({
    id,
    size: 32,
    parts,
    sourceComment: `: AI System 6's own ${escapeXml(id)} silhouette`,
  });
  writeFileSync(join(outDir, file), svg);
  manifest[id] = file;
  console.log(`built ${file}`);
}

for (const [iconId, icon] of Object.entries(REFERENCE_ICONS)) {
  for (const [size, parts] of Object.entries(icon.parts)) {
    const file = icon.files.find((f) => f.includes(`-${size}.svg`));
    if (!file) continue;
    const svg = renderIcon({
      id: iconId,
      size: Number(size),
      parts,
      sourceComment: `: approved reference painter ${escapeXml(iconId)}`,
    });
    writeFileSync(join(outDir, file), svg);
    manifest[iconId] = file;
    console.log(`built ${file}`);
  }
}

writeFileSync(
  join(outDir, "platinum-icon-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`manifest: ${Object.keys(manifest).length} icons`);
