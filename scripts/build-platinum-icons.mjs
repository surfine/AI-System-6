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

// Per-icon Mac OS 9 semantic colours (body gradient stops).
const COLORS = {
  assistant: ["#7fa8e8", "#4a74c8", "#2f519e"],
  quickDraft: ["#ffffff", "#ececf4", "#d0d3e4"],
  writingStudio: ["#f2f2f6", "#dfe2ec", "#bfc4d4"],
  projectDisk: ["#e8e8ea", "#c3c6cd", "#8f949f"],
  projectDisc: ["#dbe7f5", "#a9c6e4", "#6f97c4"],
  cloudModel: ["#a9cdf0", "#6fa5dd", "#3f78bb"],
  cloudModelOff: ["#b9c2d4", "#8b96ad", "#5d6a84"],
  questionSheet: ["#ffffff", "#f0eef5", "#d4d0e2"],
  outline: ["#ffffff", "#eef0f6", "#cfd5e6"],
  sectionDrafts: ["#ffffff", "#edf0f7", "#cbd4e8"],
  manuscript: ["#fbfbfd", "#e6e9f0", "#c4cad9"],
  reviewDesk: ["#a9c6ef", "#6f98d8", "#3f6bb0"],
  searcher: ["#b9d2f2", "#7ea9dd", "#477ab8"],
  reader: ["#aecdf2", "#739fe0", "#3f6cb4"],
  timeMachine: ["#c9ccd6", "#9ba2b2", "#5f6879"],
  docMap: ["#a9c6f0", "#6f98da", "#3f68ad"],
  clioStage: ["#9dbef0", "#5f8fd4", "#3762aa"],
  clioChart: ["#aac9f2", "#6f9adc", "#3c68b2"],
  liquidCover: ["#8fc0ee", "#4f90d4", "#2c64a8"],
  cmfStudio: ["#a5c6ee", "#6694d8", "#3762ae"],
  soundscape: ["#c9b6e8", "#9a7fd4", "#684fa8"],
  scrapbook: ["#ecd9b8", "#d3b98e", "#a9855a"],
  systemFolder: ["#9dbcf0", "#6690d6", "#3a63ab"],
  helpFolder: ["#b9d6f4", "#84b0e4", "#4d7fc0"],
  importUtility: ["#aecdf4", "#7aa6e0", "#4778bd"],
  controlPanel: ["#d6d9e0", "#aeb4c0", "#7a8190"],
  chooser: ["#a5c4f0", "#6c96dc", "#3d66b4"],
  systemHelp: ["#b2cff2", "#7ca6e2", "#4978bf"],
  dictionary: ["#e8eef6", "#c8d6ea", "#9db4d6"],
  teachText: ["#ffffff", "#f0f2f7", "#d2d8e6"],
  writingDemo: ["#a9c9f0", "#6c97dc", "#3c67b4"],
  chatFile: ["#d8e6f6", "#a9c4e6", "#6f97c6"],
  chatImport: ["#b9d2f2", "#7fa9e0", "#4a79bf"],
  systemStatus: ["#d4d7de", "#aab0bd", "#777e8c"],
  contextPanel: ["#aecdf2", "#78a4e0", "#4576bd"],
  rebuildArticle: ["#a5c6f0", "#6793da", "#3863b0"],
  bureaucracyMeme: ["#c9c6d8", "#9b96b4", "#615c7e"],
  endfieldTerminal: ["#1c1e24", "#2b3038", "#3d454f"],
  documents: ["#f4f4f8", "#dfe2ec", "#bfc5d6"],
  alias: ["#a9c9f0", "#6c97dc", "#3c67b4"],
  systemFile: ["#ffffff", "#eff1f6", "#cfd6e6"],
  multiFinderApp: ["#a5c4ee", "#6490d8", "#3761ae"],
  daHandler: ["#b9d2f2", "#7fa9e0", "#4a79bf"],
  writingBell: ["#ecd0a8", "#d0a86f", "#a07440"],
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
        { d: "M3 3h23v2h3v23H3z", kind: "main", colors: ["#e8e8e8", "#dddddd", "#b5b5b5"] },
        { d: "M8 9h15v11H8z", kind: "soft", colors: ["#9ba9e8", "#6f6fd0", "#40409c"] },
        { d: "M9 18h13v2H9z", kind: "ink", color: "#333399" },
        { d: "M8 21h17v2H8zM8 24h11v1H8z", kind: "ink", color: "#111111" },
        { d: "M23 24h2v2h-2z", kind: "accent", color: "#33aa33" },
      ],
      "16": [
        { d: "M2 2h10v1h2v11H2z", kind: "main", colors: ["#e8e8e8", "#dddddd", "#b5b5b5"] },
        { d: "M4 5h7v5H4z", kind: "soft", colors: ["#9ba9e8", "#6f6fd0", "#40409c"] },
        { d: "M4 11h8v1H4z", kind: "ink", color: "#111111" },
        { d: "M11 12h1v1h-1z", kind: "accent", color: "#33aa33" },
      ],
    },
  },
  folder: {
    files: ["folder-32.svg", "folder-16.svg"],
    parts: {
      "32": [
        { d: "M3 5h10v2h7v2h9v19H3z", kind: "main", colors: ["#b7c9ef", "#9999ff", "#5f5fd0"] },
        { d: "M8 14h16v9H8z", kind: "soft", colors: ["#f0f1fd", "#e2e5fa", "#c6cbf0"] },
        { d: "M29 10h2v19h-2zM6 29h23v2H6z", kind: "ink", color: "#333399" },
      ],
      "16": [
        { d: "M2 4h4v1h3v1h5v8H2z", kind: "main", colors: ["#b7c9ef", "#9999ff", "#5f5fd0"] },
        { d: "M4 8h8v4H4z", kind: "soft", colors: ["#f0f1fd", "#e2e5fa", "#c6cbf0"] },
        { d: "M2 12h1v3H2zM13 11h1v4h-1zM2 15h12v1H2z", kind: "ink", color: "#333399" },
      ],
    },
  },
  document: {
    files: ["document-16.svg"],
    parts: {
      "16": [
        { d: "M4 2h5v3h3v9H4z", kind: "main", colors: ["#ffffff", "#f0f1f6", "#c6cbdd"] },
        { d: "M10 2l2 2h-2z", kind: "soft", colors: ["#eef0f8", "#d9ddef", "#b9c0dc"] },
        { d: "M5 7h6v1H5zM5 9h6v1H5zM5 11h4v1H5z", kind: "ink", color: "#6666cc" },
      ],
    },
  },
  applications: {
    files: ["applications-16.svg"],
    parts: {
      "16": [
        { d: "M2 4h4v1h3v1h5v8H2z", kind: "main", colors: ["#f2f4fa", "#d9dfee", "#aab4d0"] },
        { d: "M3 6h10v2H3z", kind: "soft", colors: ["#e2e8fb", "#c6cff0", "#9aa8dd"] },
        { d: "M4 8h3v2H4zM9 8h3v2H9zM4 11h3v2H4zM9 11h3v2H9z", kind: "soft", colors: ["#f6f7fb", "#e8eaf2", "#ccd0de"] },
        { d: "M2 14h12v1H2z", kind: "ink", color: "#333399" },
      ],
    },
  },
  trash: {
    files: ["trash-16.svg"],
    parts: {
      "16": [
        { d: "M4 4h8v9H4z", kind: "main", colors: ["#ededed", "#dddddd", "#b0b0b0"] },
        { d: "M5 5h1v7H5z", kind: "light", color: "#ffffff" },
        { d: "M7 5h1v7H7zM10 5h1v7h-1zM4 13h8v1H4z", kind: "ink", color: "#999999" },
        { d: "M5 2h6v1H5z", kind: "accent", color: "#9999ff" },
      ],
    },
  },
  finderApp: {
    files: ["finder-app-16.svg"],
    parts: {
      "16": [
        { d: "M2 4h4v1h3v1h5v8H2z", kind: "main", colors: ["#f2f4fa", "#d9dfee", "#aab4d0"] },
        { d: "M5 7h7v6H5z", kind: "soft", colors: ["#f0f1f6", "#dfe2ec", "#c2c7d6"] },
        { d: "M6 8h1v1H6zM10 8h1v1h-1zM6 11h1v1h4v-1h1v2H6z", kind: "ink", color: "#111111" },
        { d: "M3 6h1v7H3z", kind: "light", color: "#ccccff" },
      ],
    },
  },
  floppy: {
    files: ["floppy-32.svg"],
    parts: {
      "32": [
        { d: "M1 1h14v17h-14zM16 8h5v10h-5zM22 1h8v17h-8zM4 19h23v12h-23z", kind: "main", colors: ["#8fa5c2", "#6f86a8", "#4a5d7b"] },
        { d: "M7 1h8v9h-8zM16 9h5v1h-5zM22 1h1v9h-1zM7 9h9v1h-9zM22 9h1v1h-1z", kind: "soft", colors: ["#eef1f6", "#c9d0da", "#97a1b1"] },
        { d: "M9 1h1v9h-1zM11 1h1v9h-1zM13 1h1v9h-1z", kind: "ink", color: "#7c8796" },
        { d: "M8 10h15v1h-15zM5 18h22v1h-22z", kind: "ink", color: "#111111" },
        { d: "M6 19h8v9h-8z", kind: "light", color: "#ffffff" },
        { d: "M6 19h8v1h-8zM6 27h8v1h-8z", kind: "light", color: "#d7deef" },
        { d: "M7 21h6v1H7zM7 23h6v1H7zM7 25h4v1H7z", kind: "ink", color: "#6f86a8" },
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
       Dark rim, gradient volume, clipped highlight/shade, ink details.
       No Apple art. -->
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
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.38"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="g-sh" x1="0" y1="0" x2="1" y2="1">
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
    <rect x="0" y="0" width="${edgeW}" height="${size}" fill="#ffffff" fill-opacity="0.2"/>
    <rect x="${size - edgeW}" y="0" width="${edgeW}" height="${size}" fill="#000000" fill-opacity="0.12"/>
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
