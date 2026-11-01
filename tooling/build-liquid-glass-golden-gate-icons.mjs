// Apply the Golden Gate correction contract after the Liquid Glass pixel build.
// The correction is a runtime mask and an auditable ledger: source masters and
// runtime PNG bytes stay untouched, so no Apple artwork is copied into product.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "canvas";
import { ICON_IDS } from "./lib/icon-family-inventory.mjs";
import { ADDED_APP_ICON_IDS } from "./lib/added-app-icon-inventory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const themeDir = join(root, "apps/desktop/assets/themes/liquid-glass");
const familyPath = join(themeDir, "liquid-glass-icon-family.json");
const manifestPath = join(themeDir, "liquid-glass-icon-manifest.json");
const evidenceDir = join(root, "internal/evidence/drafts/liquid-glass-golden-gate");
const assetDir = join(themeDir, "icons");
const sizes = [128, 64, 32, 16];
const appearances = ["default", "dark", "clear"];
const ids = [...ICON_IDS, ...ADDED_APP_ICON_IDS];
const core16 = [
  "finderApp", "multiFinderApp", "folder", "hardDisk", "trash", "document",
  "fileFloppy", "projectDisk", "projectDisc", "searcher", "teachText", "scrapbook",
  "assistant", "controlPanel", "reviewDesk", "docMap",
];
const maskableGenres = new Set(["application", "utility", "accessory"]);
const officialSources = [
  {
    title: "macOS 27 Golden Gate",
    url: "https://www.apple.com/os/macos/",
    contentSha256: "0324f17bd031c7d7ee528581bb73974cbd9caa31205fac1e4bf8cd3373669f7b",
    role: "Golden Gate refraction, contrast, and interface icon direction",
  },
  {
    title: "Liquid Glass overview",
    url: "https://developer.apple.com/documentation/technologyoverviews/liquid-glass",
    contentSha256: "14cedfdd5d6f214864a18826ac03c9ac1ec31b2339a5c7b8416760d2f79c2be7",
    role: "layered material and system effect boundary",
  },
  {
    title: "Adopting Liquid Glass",
    url: "https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass",
    contentSha256: "df38af0fc5954034e56357ad6d0f93fe6cd9311818d7ea106023e4e127d01144",
    role: "simple bold layered icon construction and system masking",
  },
  {
    title: "Materials HIG",
    url: "https://developer.apple.com/design/human-interface-guidelines/materials",
    contentSha256: "d62988373c5ea16f191ebcf11b20c3e53b33dcb23caeff20c1bc2990aa19c134",
    role: "material, contrast, and legibility constraints",
  },
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertFamily(family, manifest) {
  if (JSON.stringify(Object.keys(family.icons)) !== JSON.stringify(ids)) {
    throw new Error(`Golden Gate expects ${ids.length} Liquid Glass ids in canonical order`);
  }
  if (JSON.stringify(Object.keys(manifest)) !== JSON.stringify(ids)) {
    throw new Error("Golden Gate compatibility manifest is out of sync with the family");
  }
  for (const id of ids) {
    const entry = family.icons[id];
    if (!entry?.appearanceSizes) throw new Error(`${id}: missing appearanceSizes`);
    for (const size of sizes) for (const appearance of appearances) {
      const relative = entry.appearanceSizes[`${size}-${appearance}`];
      if (!relative || !existsSync(join(themeDir, relative))) throw new Error(`${id}: missing ${size}-${appearance}`);
    }
  }
}

function roundedPath(ctx, x, y, size, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, radius);
  ctx.clip();
}

async function drawIcon(ctx, id, size, appearance, x, y, cell, maskable) {
  const file = join(assetDir, `${id}-${size}-${appearance}.png`);
  const image = await loadImage(file);
  const box = cell <= 24 ? Math.min(cell, size) : Math.min(cell - 24, size);
  const ox = x + (cell - box) / 2;
  const oy = y + 10 + (cell - box) / 2;
  ctx.save();
  if (maskable) roundedPath(ctx, ox, oy, box, box * 0.22);
  ctx.drawImage(image, ox, oy, box, box);
  ctx.restore();
}

function label(ctx, text, x, y, color = "#263247") {
  ctx.fillStyle = color;
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
}

async function buildBoard(name, boardIds, options = {}) {
  const columns = options.columns || 8;
  const cell = options.cell || 156;
  const header = options.header || 70;
  const rowHeight = options.rowHeight || 154;
  const rows = Math.ceil(boardIds.length / columns);
  const canvas = createCanvas(columns * cell, header + rows * rowHeight);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = options.background || "#edf1f5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#172033";
  ctx.textAlign = "left";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(options.title || `Liquid Glass — ${name}`, 18, 30);
  ctx.fillStyle = "#566274";
  ctx.font = "12px sans-serif";
  ctx.fillText(options.subtitle || "Golden Gate correction • runtime mask is shown only for applications and tools", 18, 51);
  for (let index = 0; index < boardIds.length; index += 1) {
    const id = boardIds[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cell;
    const y = header + row * rowHeight;
    const maskable = maskableGenres.has(family.icons[id].genre);
    ctx.fillStyle = options.cellBackground || "#f8fafc";
    ctx.fillRect(x + 8, y + 6, cell - 16, rowHeight - 30);
    await drawIcon(ctx, id, options.size || 128, options.appearance || "default", x + 8, y + 6, cell - 16, maskable);
    label(ctx, id, x + cell / 2, y + rowHeight - 12);
  }
  writeFileSync(join(evidenceDir, name), canvas.toBuffer("image/png"));
}

async function buildVariantsBoard() {
  const columns = 6;
  const cell = 190;
  const rowHeight = 112;
  const header = 70;
  const canvas = createCanvas(columns * cell, header + ids.length * rowHeight);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e9edf2";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#172033";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("Liquid Glass — Golden Gate variants", 18, 30);
  ctx.fillStyle = "#566274";
  ctx.font = "12px sans-serif";
  ctx.fillText("Default / Dark / Clear stay separate; no tinted runtime tier", 18, 51);
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cell;
    const y = header + row * rowHeight;
    const backgrounds = ["#f7f8fa", "#151a22", "#d8e5ed"];
    for (let variant = 0; variant < appearances.length; variant += 1) {
      const bx = x + 12 + variant * 56;
      ctx.fillStyle = backgrounds[variant];
      ctx.fillRect(bx, y + 6, 50, 72);
      await drawIcon(ctx, id, 32, appearances[variant], bx + 1, y + 7, 48, maskableGenres.has(family.icons[id].genre));
    }
    label(ctx, id, x + 155, y + 54);
  }
  writeFileSync(join(evidenceDir, "golden-gate-variants-board.png"), canvas.toBuffer("image/png"));
}

async function buildSmallBoard() {
  const columns = 4;
  const cell = 220;
  const rowHeight = 96;
  const header = 70;
  const canvas = createCanvas(columns * cell, header + ids.length * rowHeight);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#edf1f5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#172033";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("Liquid Glass — Golden Gate 32 / 16 px", 18, 30);
  ctx.fillStyle = "#566274";
  ctx.font = "12px sans-serif";
  ctx.fillText("True-size optical review; compact tiers keep their own contrast pass", 18, 51);
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cell;
    const y = header + row * rowHeight;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(x + 22, y + 10, 54, 54);
    ctx.fillStyle = "#141a24";
    ctx.fillRect(x + 92, y + 10, 34, 54);
    await drawIcon(ctx, id, 32, "default", x + 23, y + 11, 52, maskableGenres.has(family.icons[id].genre));
    await drawIcon(ctx, id, 16, "default", x + 101, y + 29, 16, maskableGenres.has(family.icons[id].genre));
    label(ctx, id, x + 169, y + 43);
  }
  writeFileSync(join(evidenceDir, "golden-gate-small-size-board.png"), canvas.toBuffer("image/png"));
}

const family = loadJson(familyPath);
const manifest = loadJson(manifestPath);
assertFamily(family, manifest);
mkdirSync(evidenceDir, { recursive: true });

const maskMatrix = {
  schemaVersion: 1,
  target: "macOS 27 Golden Gate Beta 1 Liquid Glass",
  runtimeThemeId: "liquid-glass",
  mask: {
    name: "rounded-rect",
    owner: "apps/desktop/styles/70-liquid-glass.css",
    application: "runtime-only; source PNG remains transparent and unmasked",
    radius: "22%",
    effects: "system mask only; no baked blur, refraction, dynamic light, or tinted tier",
  },
  counts: { objects: ids.length, sizes: sizes.length, appearances: appearances.length, runtimeImages: ids.length * sizes.length * appearances.length },
  maskable: ids.filter((id) => maskableGenres.has(family.icons[id].genre)),
  freeForm: ids.filter((id) => !maskableGenres.has(family.icons[id].genre)),
  core16,
};
writeFileSync(join(evidenceDir, "golden-gate-icon-mask-matrix.json"), `${JSON.stringify(maskMatrix, null, 2)}\n`);

family.target = "macOS 27 Golden Gate Beta 1 Liquid Glass";
family.generatedBy = "tooling/build-liquid-glass-imagegen-icons.mjs + tooling/build-liquid-glass-golden-gate-icons.mjs";
family.completeFamilyMeaning = "All 59 runtime ids resolve to technically accepted artwork. Golden Gate masking is a separate runtime correction; historical review remains per-icon and native evidence is not implied.";
family.correctionStage = "tooling/build-liquid-glass-golden-gate-icons.mjs";
family.correctionEvidence = "internal/evidence/drafts/liquid-glass-golden-gate/golden-gate-icon-mask-matrix.json";
family.runtimeDeliverableCount = ids.length * sizes.length * appearances.length;
// `reviewedFamily` retains its historical meaning for the accepted ImageGen
// core. The Golden Gate correction owns the expanded runtime ledger separately.
family.reviewedFamily = [...ICON_IDS];
family.runtimeFamily = [...ids];
family.goldenGate = {
  target: "Golden Gate",
  officialSources: officialSources.map(({ title, url, role }) => ({ title, url, role })),
  nativeSingleIconEvidence: "pending",
  provenanceRule: "Reference adaptation is recorded honestly; no pixel-level native Golden Gate replica is claimed.",
  maskRule: "application, utility, and accessory use the shared runtime rounded-rectangle mask; file, document, hardware, and trash objects remain free-form.",
  variants: ["default", "dark", "clear"],
  sizes,
};
for (const id of ids) {
  const entry = family.icons[id];
  entry.goldenGate = {
    objectClass: entry.genre,
    runtimeMask: maskableGenres.has(entry.genre) ? "rounded-rect" : "free-form",
    maskAppliedAt: maskableGenres.has(entry.genre) ? "runtime-css" : "none",
    nativeEvidence: "pending",
    provenance: "reference-adapted",
    reviewGate: core16.includes(id) ? "core16-recorded" : "full-family-recorded",
    unresolved: "No verified Golden Gate single-icon asset; visual result is an Apple-guided adaptation.",
  };
}
writeFileSync(familyPath, `${JSON.stringify(family, null, 2)}\n`);

const sourceDigest = sha256(officialSources.map(({ url, contentSha256 }) => `${url}\n${contentSha256}`).join("\n"));
writeFileSync(join(evidenceDir, "golden-gate-official-sources.json"), `${JSON.stringify({
  schemaVersion: 1,
  target: "macOS 27 Golden Gate Beta 1 Liquid Glass",
  reviewedOn: "2026-09-22",
  sourceListSha256: sourceDigest,
  sources: officialSources,
  capturePolicy: "URL and fetched content hashes are retained for audit; Apple artwork and screenshots are not runtime assets.",
}, null, 2)}\n`);

await buildBoard("golden-gate-core16-board.png", core16, { title: "Liquid Glass — Golden Gate core 16", subtitle: "Core gate • rounded mask only on applications and tools" });
await buildBoard("golden-gate-full-board.png", ids, { title: "Liquid Glass — Golden Gate 59-object family", subtitle: "Full family • free-form Finder objects remain identifiable", rowHeight: 142 });
await buildVariantsBoard();
await buildSmallBoard();
console.log(`liquid-glass Golden Gate: ${ids.length} objects, ${maskMatrix.counts.runtimeImages} runtime images, ${maskMatrix.maskable.length} masked`);
