// Complete Classic family build.
//
// Native System 6 resources own the reviewed historical prototypes. Runtime
// artwork is a smooth SVG reconstruction of those objects plus the product's
// documented semantic extensions. The 32 px and 16 px outputs receive separate
// optical stroke/detail treatment for normal and Retina displays.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createRequire } from "node:module";
import { ICON_IDS, ICON_SPECS } from "./lib/icon-family-inventory.mjs";
import { assertDocMapMetaphor, measureDocMapMetaphor } from "./lib/docmap-metaphor-metrics.mjs";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = join(root, "apps/desktop/assets/themes/classic/icons");
const draftDir = join(root, "internal/evidence/drafts/era-icons");
mkdirSync(assetDir, { recursive: true });
mkdirSync(draftDir, { recursive: true });

// Rebuild the native-evidence batch first to preserve provenance and selection
// rules; the complete smooth-vector family below then replaces every shipped
// artwork file at the same stable runtime paths.
await import("./build-classic-core-icons.mjs");

const coreFamily = JSON.parse(readFileSync(join(assetDir, "classic-core-icon-family.json"), "utf8"));
const coreIds = new Set(Object.keys(coreFamily.icons));
const continuity = JSON.parse(readFileSync(join(root, "apps/desktop/assets/themes/icon-system-continuity.json"), "utf8"));
const runtimeSourcePath = join(root, "apps/desktop/app/core/system-icons.js");
const runtimeSource = readFileSync(runtimeSourcePath, "utf8");
const sandbox = { window: { AISystem6Config: {} }, console };
vm.createContext(sandbox);
vm.runInContext(
  `${runtimeSource}\nglobalThis.__classicFamilyPaths = Object.fromEntries(ICON_IDS_FOR_BUILD.map((id) => [id, systemIconPaths[id]]));`,
  Object.assign(sandbox, { ICON_IDS_FOR_BUILD: ICON_IDS }),
  { filename: runtimeSourcePath },
);
const establishedPaths = sandbox.__classicFamilyPaths;

// Smooth traces preserve the real System 6 object's silhouette and visual
// hierarchy while replacing the 1-bit staircase with Retina-safe vector
// geometry. Product-only objects continue through their semantic path source.
const SMOOTH_SYSTEM6_PATHS = Object.freeze({
  startupDisk: `
    <path d="M5 3h20l3 3v23H5z" />
    <path d="M10 3v9h13V3M10 20h13v7H10z" />
    <path class="classic-ink" d="M20 5h2v5h-2z" />
  `,
  hardDisk: `
    <path d="M1 18.5h30v9.5H1z" />
    <circle class="classic-ink" cx="5" cy="23" r=".85" />
  `,
  projectDisk: `
    <path d="M3 10h26v14H3z" />
    <path d="M3 14h26M9 17h14v4H9z" />
    <circle class="classic-ink" cx="7" cy="19" r="1" />
  `,
  fileFloppy: `
    <path d="M5 2.5h20l3 3V30H5z" />
    <path d="M10 2.5v9h13v-9M9 19h14v9H9z" />
    <path class="classic-ink" d="M20 5h2v5h-2z" />
  `,
  folder: `
    <path d="M1 12.5h30v18H1z" />
    <path d="M5 8.5h9l4 4H5z" />
  `,
  document: `
    <path d="M6 3.5h16l5 5V30H6z" />
    <path d="M22 3.5V9h5" />
  `,
  trash: `
    <path d="M8 8h16l-1 21H9z" />
    <path d="M6 6h20M11 3h10v3" />
    <path d="M12 11v14M16 11v14M20 11v14" />
  `,
  trashFull: `
    <path d="M8 10h16l-1 19H9z" />
    <path d="M6 7h20M11 4h10v3" />
    <path d="M12 13v12M16 13v12M20 13v12" />
    <path d="M8 10c2-4 4-4 6 0 2-5 5-5 7 0 2-3 4-3 5 0" />
  `,
  finderApp: `
    <path d="M5.5 3.5h21v23H5.5zM8.5 8.5h15v13H8.5z" />
    <path d="M10.5 11.5h1M10.5 14.5h1M10.5 17.5h1M13.5 11.5h3M13.5 14.5h6M13.5 17.5h4" />
    <path d="M12 26.5h8M9.5 29.5h13M9.5 27v2.5h13V27" />
  `,
  daHandler: `
    <path d="M16 3l13 13-13 13L3 16z" />
    <path d="M9 17l5-2v-4c0-1 2-1 2 0v3l2-3c1-1 2 0 1 1l-1 2 2-2c1-1 2 0 1 1l-2 3h4c2 0 3 1 3 3-2 3-5 5-9 5-3 0-5-2-8-7z" />
  `,
  teachText: `
    <path d="M16 3l13 13-13 13L3 16z" />
    <path class="sys-icon-detail" d="M9 12h10M8 15h9M9 18h7" />
    <path d="M13 23l9-9 3 3-9 9-4 1z" />
  `,
  docMap: `
    <path class="classic-paper" d="M4 5h13v22H4z" />
    <path d="M4 5h13v22H4zM7 10h7M7 14h5" />
    <path d="M17 16h5M22 8v16M22 8h4M22 16h4M22 24h4" />
    <rect x="26" y="6" width="4" height="4" />
    <rect x="26" y="14" width="4" height="4" />
    <rect x="26" y="22" width="4" height="4" />
  `,
  writingBell: `
    <path d="M10 23h12M12 22v-8c0-5 2-8 4-8s4 3 4 8v8M9 22h14" />
    <path d="M14 26c1 2 3 2 4 0M14 5c0-2 4-2 4 0" />
  `,
});

for (const id of ICON_IDS) {
  if (typeof establishedPaths[id] !== "string" || !establishedPaths[id].trim()) {
    throw new Error(`Classic family is missing established semantic artwork for ${id}`);
  }
}

const SMALL_HINTS = Object.freeze({
  // Dense compound objects need a slightly lower coverage threshold so their
  // one-pixel identity marks survive. Sparse hardware uses the stricter pass.
  dense: new Set([
    "applications", "assistant", "bureaucracyMeme", "chooser", "clioChart",
    "cmfStudio", "contextPanel", "docMap", "multiFinderApp", "outline",
    "sectionDrafts", "systemFile", "systemFolder", "timeMachine",
  ]),
  sparse: new Set([
    "alias", "cloudModel", "cloudModelOff", "controlStrip", "localModel",
    "projectDisc", "searcher", "writingBell",
  ]),
});
const VECTOR_SCALE = 1.1;
const VECTOR_TRANSFORM = `translate(16 16) scale(${VECTOR_SCALE}) translate(-16 -16)`;

function sourceSvg(markup, size, transform = VECTOR_TRANSFORM) {
  const small = size === 16;
  const strokeWidth = small ? 1.75 : 1.25;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 8}" height="${size * 8}" viewBox="0 0 32 32" fill="none" stroke="#000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision">`,
    "<style>",
    ".classic-ink{fill:#000;stroke:#000;stroke-width:.25}",
    ".classic-paper{fill:#fff;stroke:none}",
    small ? ".sys-icon-detail{display:none}" : "",
    "</style>",
    `<g transform="${transform}">${markup}</g>`,
    "</svg>",
  ].join("");
}

async function rasterPixels(id, markup, size, transform = VECTOR_TRANSFORM) {
  const supersample = 8;
  const image = await loadImage(Buffer.from(sourceSvg(markup, size, transform)));
  const canvas = createCanvas(size * supersample, size * supersample);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = new Set();
  let threshold = size === 16 ? 0.32 : 0.24;
  if (size === 16 && SMALL_HINTS.dense.has(id)) threshold = 0.38;
  if (size === 16 && SMALL_HINTS.sparse.has(id)) threshold = 0.3;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let ink = 0;
      for (let sy = 0; sy < supersample; sy += 1) {
        for (let sx = 0; sx < supersample; sx += 1) {
          const px = x * supersample + sx;
          const py = y * supersample + sy;
          const offset = (py * canvas.width + px) * 4;
          const alpha = data[offset + 3] / 255;
          const luminance = (data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722) / 255;
          if (alpha > 0.05) ink += alpha * (1 - luminance);
        }
      }
      if (ink / (supersample * supersample) >= threshold) pixels.add(`${x},${y}`);
    }
  }
  if (!pixels.size) throw new Error(`Classic ${id}/${size}: optical hint pass produced no pixels`);
  return pixels;
}

async function smoothMaskPixels(markup, size, transform = VECTOR_TRANSFORM) {
  const supersample = 8;
  const resolution = size * supersample;
  const image = await loadImage(Buffer.from(sourceSvg(markup, size, transform)));
  const canvas = createCanvas(resolution, resolution);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, resolution, resolution);
  ctx.drawImage(image, 0, 0, resolution, resolution);
  const data = ctx.getImageData(0, 0, resolution, resolution).data;
  const occupied = new Set();
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      if (data[(y * resolution + x) * 4 + 3] >= 40) occupied.add(`${x},${y}`);
    }
  }
  // A half-pixel optical spread joins anti-aliased edge samples before the
  // flood fill, producing one smooth System 6-style selection silhouette.
  const spread = new Set(occupied);
  const radius = 4;
  for (const key of occupied) {
    const [x, y] = key.split(",").map(Number);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && py >= 0 && px < resolution && py < resolution) spread.add(`${px},${py}`);
      }
    }
  }
  return { pixels: enclosedMask(spread, resolution), resolution };
}

function enclosedMask(art, size) {
  const exterior = new Set();
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const key = `${x},${y}`;
    if (art.has(key) || exterior.has(key)) return;
    exterior.add(key);
    queue.push([x, y]);
  };
  for (let x = 0; x < size; x += 1) { enqueue(x, 0); enqueue(x, size - 1); }
  for (let y = 0; y < size; y += 1) { enqueue(0, y); enqueue(size - 1, y); }
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index];
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }
  const mask = new Set(art);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const key = `${x},${y}`;
      if (!exterior.has(key)) mask.add(key);
    }
  }
  return mask;
}

function pixelsToPath(pixels, size) {
  const commands = [];
  for (let y = 0; y < size; y += 1) {
    let start = -1;
    for (let x = 0; x <= size; x += 1) {
      const occupied = x < size && pixels.has(`${x},${y}`);
      if (occupied && start < 0) start = x;
      if (!occupied && start >= 0) {
        const width = x - start;
        commands.push(`M${start} ${y}h${width}v1h-${width}z`);
        start = -1;
      }
    }
  }
  return commands.join("");
}

function metrics(pixels, size) {
  let minX = size; let minY = size; let maxX = -1; let maxY = -1;
  for (const key of pixels) {
    const [x, y] = key.split(",").map(Number);
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { pixels: pixels.size, bbox: { minX, minY, maxX, maxY } };
}

async function svgInkPixels(svg, size) {
  const supersample = 8;
  const image = await loadImage(Buffer.from(svg));
  const canvas = createCanvas(size * supersample, size * supersample);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = new Set();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let ink = 0;
      for (let sy = 0; sy < supersample; sy += 1) {
        for (let sx = 0; sx < supersample; sx += 1) {
          const px = x * supersample + sx;
          const py = y * supersample + sy;
          const offset = (py * canvas.width + px) * 4;
          const alpha = data[offset + 3] / 255;
          const luminance = (data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722) / 255;
          ink += alpha * (1 - luminance);
        }
      }
      if (ink / (supersample * supersample) >= 0.24) pixels.add(`${x},${y}`);
    }
  }
  return pixels;
}

function compareNativeAnatomy(runtimePixels, nativePixels, size) {
  let intersection = 0;
  for (const pixel of runtimePixels) if (nativePixels.has(pixel)) intersection += 1;
  const union = new Set([...runtimePixels, ...nativePixels]).size;
  const runtimeBounds = metrics(runtimePixels, size).bbox;
  const nativeBounds = metrics(nativePixels, size).bbox;
  const coveredWithin = (source, target, radius) => {
    let covered = 0;
    for (const pixel of source) {
      const [x, y] = pixel.split(",").map(Number);
      let match = false;
      for (let dy = -radius; dy <= radius && !match; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > radius * radius) continue;
          if (target.has(`${x + dx},${y + dy}`)) { match = true; break; }
        }
      }
      if (match) covered += 1;
    }
    return covered / source.size;
  };
  const nativeCoveredByRuntime = coveredWithin(nativePixels, runtimePixels, 2);
  const runtimeCoveredByNative = coveredWithin(runtimePixels, nativePixels, 2);
  const tolerantF1 = (2 * nativeCoveredByRuntime * runtimeCoveredByNative)
    / (nativeCoveredByRuntime + runtimeCoveredByNative);
  const bboxEdgeMaxDeltaPx = Math.max(
    Math.abs(runtimeBounds.minX - nativeBounds.minX),
    Math.abs(runtimeBounds.minY - nativeBounds.minY),
    Math.abs(runtimeBounds.maxX - nativeBounds.maxX),
    Math.abs(runtimeBounds.maxY - nativeBounds.maxY),
  );
  return {
    method: "32px thresholded ink: exact IoU is diagnostic; two-pixel bidirectional tolerant F1 plus bounding-box delta gates smooth-trace anatomy",
    nativeInkPixels: nativePixels.size,
    runtimeInkPixels: runtimePixels.size,
    inkIntersectionOverUnion: Number((intersection / union).toFixed(4)),
    nativeCoveredByRuntimeWithin2px: Number(nativeCoveredByRuntime.toFixed(4)),
    runtimeCoveredByNativeWithin2px: Number(runtimeCoveredByNative.toFixed(4)),
    tolerantF1Within2px: Number(tolerantF1.toFixed(4)),
    bboxEdgeMaxDeltaPx,
  };
}

function assetSvg(size, markup, transform = VECTOR_TRANSFORM) {
  const small = size === 16;
  const strokeWidth = small ? 1.75 : 1.25;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" stroke="#000000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision">`,
    "  <style>",
    "    .classic-ink{fill:#000000;stroke:#000000;stroke-width:.25}",
    "    .classic-paper{fill:#ffffff;stroke:none}",
    small ? "    .sys-icon-detail{display:none}" : "",
    "  </style>",
    `  <g transform="${transform}">${markup}</g>`,
    "</svg>",
    "",
  ].filter(Boolean).join("\n");
}

function maskSvg(size, maskPath, viewBoxSize = size) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="geometricPrecision">`,
    `  <path fill="#000000" d="${maskPath}"/>`,
    "</svg>",
    "",
  ].join("\n");
}

const generated = {};
for (const spec of ICON_SPECS) {
  const markup = SMOOTH_SYSTEM6_PATHS[spec.id] || establishedPaths[spec.id];
  const coreEvidence = coreFamily.icons[spec.id] || null;
  const semanticAnchor = continuity.semanticAnchors[spec.id] || null;
  const directlyTraced = Boolean(coreEvidence?.nativeReference)
    && coreEvidence.sourceKind === "native-resource-replica";
  const vectorTransform = directlyTraced ? "translate(0 0)" : VECTOR_TRANSFORM;
  const nativeSvg = directlyTraced
    ? readFileSync(join(assetDir, `${spec.id}-32.svg`), "utf8")
    : null;
  const nativeInk = nativeSvg ? await svgInkPixels(nativeSvg, 32) : null;
  const classicHistoricalReviewStatus = semanticAnchor?.reviewStatusByEra?.classic || null;
  const classicProvenanceClass = semanticAnchor?.provenanceClassByEra?.classic || null;
  const entry = {
    label: spec.id,
    genre: spec.genre,
    physicalMetaphor: spec.body,
    semanticMark: spec.symbol,
    metaphorKey: semanticAnchor?.metaphorKey,
    sourceKind: directlyTraced
      ? "system6-prototype-smooth-vector-trace"
      : coreEvidence?.nativeReference
        ? "system6-evidence-semantic-vector-adaptation"
        : "product-semantic-smooth-vector",
    authoringMethod: "deterministic smooth SVG reconstruction",
    generationStatus: "technically-clean",
    // Direct native evidence may support a comparison without automatically
    // promoting an object outside the audited priority 16. Historical status
    // is owned by the continuity ledger, never inferred from source kind.
    historicalReviewStatus: classicHistoricalReviewStatus || "pending",
    blindMixStatus: ["finderApp", "multiFinderApp"].includes(spec.id) ? "not-run" : null,
    provenanceClass: classicProvenanceClass || (directlyTraced ? "A" : coreIds.has(spec.id) ? "B" : "C"),
    runtimeAsset: true,
    reviewStatus: classicHistoricalReviewStatus || "pending",
    nativePrototype: coreEvidence?.nativeReference || null,
    sourceNote: directlyTraced
      ? "The original System 6 resource owns silhouette, anatomy, proportions, and object grammar. Per the project-specific Retina exception, runtime replaces only the bitmap staircase with smooth SVG edges."
      : "A smooth, period-grounded SVG construction preserves the documented product metaphor; 16 px hides secondary detail and uses its own optical stroke.",
    sizes: {}, masks: {}, metrics: {},
  };
  for (const size of [32, 16]) {
    const art = await rasterPixels(spec.id, markup, size, vectorTransform);
    const mask = enclosedMask(art, size);
    const smoothMask = await smoothMaskPixels(markup, size, vectorTransform);
    const maskPath = pixelsToPath(smoothMask.pixels, smoothMask.resolution);
    const artworkFile = `${spec.id}-${size}.svg`;
    const maskFile = `${spec.id}-mask-${size}.svg`;
    writeFileSync(join(assetDir, artworkFile), assetSvg(size, markup, vectorTransform));
    writeFileSync(join(assetDir, maskFile), maskSvg(size, maskPath, smoothMask.resolution));
    entry.sizes[size] = artworkFile;
    entry.masks[size] = maskFile;
    entry.metrics[size] = {
      art: metrics(art, size),
      mask: metrics(mask, size),
      inkPixels: art.size,
      inkCoverage: Number((art.size / (size * size)).toFixed(4)),
    };
    if (size === 32 && nativeInk) {
      entry.referenceComparison = compareNativeAnatomy(art, nativeInk, size);
      entry.referenceComparison.thresholds = {
        minimumTolerantF1Within2px: 0.62,
        maximumBboxEdgeDeltaPx: 4,
      };
      const passes = entry.referenceComparison.tolerantF1Within2px >= 0.62
        && entry.referenceComparison.bboxEdgeMaxDeltaPx <= 4;
      entry.referenceComparison.result = passes ? "pass" : "fail";
      if (!passes) {
        throw new Error(
          `Classic ${spec.id}: smooth runtime anatomy drifted from native evidence `
          + `(F1 ${entry.referenceComparison.tolerantF1Within2px}, bbox delta ${entry.referenceComparison.bboxEdgeMaxDeltaPx})`,
        );
      }
    }
  }
  generated[spec.id] = entry;
}
generated.docMap.metaphorKey = "branching-document-map";
generated.docMap.physicalMetaphor = "one document page whose heading lines grow into a stem and three right-side branches";
generated.docMap.metaphorMetrics = await measureDocMapMetaphor(join(assetDir, "docMap-32.svg"), "classic");
assertDocMapMetaphor(generated.docMap.metaphorMetrics, "classic/docMap");

const family = {
  schemaVersion: 2,
  target: "Macintosh System 6-grounded smooth Retina SVG desktop object family",
  generatedBy: "tooling/build-classic-family-icons.mjs",
  sharedGeometryAcrossEras: false,
  completeFamily: true,
  completeFamilyMeaning: "All 56 runtime ids have artwork and masks. This does not mean all 56 have passed historical review.",
  runtimeAsset: true,
  runtimeSize: "contextual",
  runtimeSizesByContext: { compactMenuList: 16, ordinaryDesktop: 32 },
  compatibilityManifest: "icons/classic-icon-manifest.json",
  compatibilityManifestMeaning: "Stable 32 px semantic mapping only; app/core/system-icons.js selects the authored 16 or 32 px SVG by rendering context.",
  runtimeDispatch: "apps/desktop/app/core/system-icons.js",
  nativeSizes: [32, 16],
  objects: ICON_IDS.length,
  referenceValidated: Object.entries(generated).filter(([, icon]) => icon.historicalReviewStatus === "reference-validated").map(([id]) => id),
  historicallyReviewed: Object.entries(generated).filter(([, icon]) => ["reference-validated", "historically-reviewed"].includes(icon.historicalReviewStatus)).map(([id]) => id),
  pendingHistoricalReview: Object.entries(generated).filter(([, icon]) => icon.historicalReviewStatus === "pending").map(([id]) => id),
  fallback: [],
  sourceBoundary: "Native System 6 resources own anatomy wherever a counterpart exists. Runtime files use the user's explicit smooth-Retina SVG exception; the evidence layer remains exact one-bit and non-runtime. Product-only artwork may use generated candidates, but authoring acceptance never implies historical validation.",
  classicRetinaException: "Smooth vector edge expression is intentional for present-day high-density displays. It is not an exact pixel replica and may not alter native silhouette, anatomy, proportions, or mask logic.",
  imageGenerationMode: "candidate-only; deterministic SVG is the runtime source",
  sizePolicy: "32 px and 16 px are separate smooth SVG outputs with independent optical stroke/detail policies; runtime selects the authored size.",
  selectionRecipe: coreFamily.selectionRecipe,
  icons: generated,
};
writeFileSync(join(assetDir, "classic-icon-family.json"), `${JSON.stringify(family, null, 2)}\n`);
writeFileSync(join(assetDir, "classic-icon-manifest.json"), `${JSON.stringify(Object.fromEntries(ICON_IDS.map((id) => [id, `${id}-32.svg`])), null, 2)}\n`);

async function contactSheet() {
  const columns = 7;
  const cellWidth = 180;
  const cellHeight = 104;
  const rows = Math.ceil(ICON_IDS.length / columns);
  const canvas = createCanvas(columns * cellWidth, 64 + rows * cellHeight);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#c6c6c6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";
  ctx.font = "bold 21px sans-serif";
  ctx.fillText("Classic smooth-vector family · 56 objects", 16, 28);
  ctx.font = "11px sans-serif";
  ctx.fillText("System 6-grounded geometry · independently hinted 32 px and 16 px SVG", 16, 48);
  for (let index = 0; index < ICON_IDS.length; index += 1) {
    const id = ICON_IDS[index];
    const x = (index % columns) * cellWidth;
    const y = 64 + Math.floor(index / columns) * cellHeight;
    ctx.fillStyle = index % 2 ? "#ededed" : "#dedede";
    ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
    const [large, small2x, small1x] = await Promise.all([
      loadImage(Buffer.from(readFileSync(join(assetDir, `${id}-32.svg`), "utf8")
        .replace('width="32" height="32"', 'width="64" height="64"'))),
      loadImage(Buffer.from(readFileSync(join(assetDir, `${id}-16.svg`), "utf8")
        .replace('width="16" height="16"', 'width="32" height="32"'))),
      loadImage(join(assetDir, `${id}-16.svg`)),
    ]);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(large, x + 10, y + 12, 64, 64);
    ctx.drawImage(small2x, x + 86, y + 28, 32, 32);
    ctx.drawImage(small1x, x + 128, y + 36, 16, 16);
    ctx.fillStyle = "#111";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(id, x + 8, y + 92, cellWidth - 16);
    ctx.fillStyle = "#666";
    ctx.font = "9px sans-serif";
    ctx.fillText(generated[id].nativePrototype ? "native-evidence vector" : "semantic vector", x + 84, y + 72);
  }
  writeFileSync(join(draftDir, "classic-contact-sheet.png"), canvas.toBuffer("image/png"));
}

await contactSheet();

for (const id of ICON_IDS) {
  for (const size of [32, 16]) {
    if (!existsSync(join(assetDir, `${id}-${size}.svg`)) || !existsSync(join(assetDir, `${id}-mask-${size}.svg`))) {
      throw new Error(`Classic ${id}/${size}: family output is incomplete`);
    }
  }
}

const familyHash = createHash("sha256").update(readFileSync(join(assetDir, "classic-icon-family.json"))).digest("hex");
console.log(`OK  Classic family: ${ICON_IDS.length} objects × 32/16 px, no fallback (${familyHash.slice(0, 12)})`);
