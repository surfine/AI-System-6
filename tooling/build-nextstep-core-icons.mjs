// Builds the NeXTSTEP core-object icon batch and writes its ledger.
//
// Why a separate builder: `build-added-app-icons.mjs` owns the three
// project-original APPLICATIONS, and its own note about NeXTSTEP said only
// those three own artwork. This builder owns the OBJECTS — the folder, the
// page, the drive, the trash — and updates the same family ledger, so the
// coverage note is computed from the files that exist instead of being typed
// by hand. Re-run it after editing `lib/nextstep-core-art.mjs`:
//
//   node tooling/build-nextstep-core-icons.mjs
//
// What it does NOT do: claim native fidelity. Every entry it writes says
// `nativeReplica: false`, `referenceValidated: false` and
// `historicalReviewStatus: "pending"`, because no 3.3 screenshot was measured
// against these shapes. An object whose real counterpart exists is a period
// adaptation, and the ledger has to say so in the same words the rest of the
// pipeline uses.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createCanvas, loadImage } from "canvas";
import { inkBox, shapeClass } from "./lib/icon-grid.mjs";
import { runtimePixelMetrics } from "./lib/icon-pixel-metrics.mjs";
import {
  NEXTSTEP_AUTHORED_ICON_IDS,
  NEXTSTEP_DESK_ICON_IDS,
  NEXTSTEP_FILE_ICON_IDS,
  NEXTSTEP_LAST_ICON_IDS,
  NEXTSTEP_OBJECT_ICON_IDS,
  NEXTSTEP_UTILITY_ICON_IDS,
  nextstepCoreArtwork,
} from "./lib/nextstep-core-art.mjs";
import { ICON_SPECS } from "./lib/icon-family-inventory.mjs";
import { ADDED_APP_ICON_IDS } from "./lib/added-app-icon-inventory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const themeDir = join(root, "apps/desktop/assets/themes/nextstep");
const iconsDir = join(themeDir, "icons");
const familyPath = join(themeDir, "nextstep-icon-family.json");
const manifestPath = join(themeDir, "nextstep-icon-manifest.json");
const evidenceDir = join(root, "internal/evidence/drafts/nextstep-core-icons");
const TIERS = [16, 32, 64, 128];

const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
const json = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

// Semantic identity, in this project's own vocabulary (see ICON_SPECS): the
// object and what it is a picture OF, not a claim about anyone's native art.
const OBJECT_LABELS = {
  finderApp: { genre: "application", semantic: "The workspace application", metaphor: "Files standing beside their folder" },
  folder: { genre: "file", semantic: "A folder", metaphor: "A folder with its tab" },
  document: { genre: "document", semantic: "A document", metaphor: "A page with a turned corner" },
  hardDisk: { genre: "hardware", semantic: "A mounted disk", metaphor: "A drive face with its slot" },
  trash: { genre: "hardware", semantic: "The trash, empty", metaphor: "An empty can with a lid" },
  trashFull: { genre: "hardware", semantic: "The trash, full", metaphor: "A can with its lid and contents" },
  searcher: { genre: "application", semantic: "The search application", metaphor: "A magnifier over a page" },
  dictionary: { genre: "application", semantic: "The dictionary", metaphor: "A lexicon with its bookmark" },
  systemHelp: { genre: "application", semantic: "System help", metaphor: "A page that asks the question" },
  importUtility: { genre: "application", semantic: "The import utility", metaphor: "A tray taking something in" },
  controlPanel: { genre: "application", semantic: "The control panel", metaphor: "A panel of sliders" },
  chooser: { genre: "application", semantic: "The chooser", metaphor: "A plug meeting its socket" },
  writingStudio: { genre: "application", semantic: "The writing studio", metaphor: "A typewriter with its sheet" },
  assistant: { genre: "application", semantic: "The assistant", metaphor: "A reply beside the page it answers" },
  quickDraft: { genre: "document", semantic: "A quick draft", metaphor: "A page and the pencil in it" },
  projectDisk: { genre: "hardware", semantic: "A project disk", metaphor: "A drive face carrying a project" },
  projectDisc: { genre: "hardware", semantic: "A project disc", metaphor: "A disc with its spindle hole" },
  questionSheet: { genre: "document", semantic: "The question sheet", metaphor: "A numbered page" },
  outline: { genre: "document", semantic: "The outline", metaphor: "An indented list" },
  sectionDrafts: { genre: "document", semantic: "Section drafts", metaphor: "Sheets stacked behind the front one" },
  manuscript: { genre: "document", semantic: "The manuscript", metaphor: "A bound stack of pages" },
  reviewDesk: { genre: "document", semantic: "The review desk", metaphor: "A page that has been checked" },
  scrapbook: { genre: "document", semantic: "The scrapbook", metaphor: "A pinned picture on its page" },
  reader: { genre: "application", semantic: "The reader", metaphor: "A page under a lens" },
  startupDisk: { genre: "hardware", semantic: "The startup disk", metaphor: "A drive face badged as the system's own" },
  applications: { genre: "file", semantic: "The applications folder", metaphor: "A folder holding one application" },
  fileFloppy: { genre: "hardware", semantic: "A floppy disk", metaphor: "A 3.5-inch disk with its shutter" },
  systemFolder: { genre: "file", semantic: "A system folder", metaphor: "A folder marked as the system's" },
  helpFolder: { genre: "file", semantic: "A help folder", metaphor: "A folder that asks a question" },
  documents: { genre: "file", semantic: "A documents folder", metaphor: "A folder with sheets fanning out of it" },
  teachText: { genre: "application", semantic: "The text editor", metaphor: "A page with the caret in it" },
  writingDemo: { genre: "document", semantic: "A writing demonstration", metaphor: "A page under a play mark" },
  chatFile: { genre: "document", semantic: "A saved conversation", metaphor: "A page carrying a reply" },
  chatImport: { genre: "utility", semantic: "An imported conversation", metaphor: "A reply arriving in a tray" },
  systemFile: { genre: "document", semantic: "A system file", metaphor: "A page marked as the system's" },
  alias: { genre: "document", semantic: "An alias", metaphor: "A page pointing somewhere else" },
  docMap: { genre: "application", semantic: "The document map", metaphor: "A page of linked nodes" },
  rebuildArticle: { genre: "utility", semantic: "Rebuild an article", metaphor: "A page turning through a cycle" },
  bureaucracyMeme: { genre: "application", semantic: "The bureaucracy desk", metaphor: "A stamp and its pad" },
  endfieldTerminal: { genre: "utility", semantic: "The terminal", metaphor: "A screen with its prompt" },
  clioStage: { genre: "application", semantic: "The slide stage", metaphor: "A slide frame ready to play" },
  clioChart: { genre: "application", semantic: "The chart studio", metaphor: "An easel carrying a bar chart" },
  liquidCover: { genre: "application", semantic: "The cover studio", metaphor: "A bound cover with its spine" },
  cmfStudio: { genre: "application", semantic: "The colour studio", metaphor: "Three swatches laid out" },
  soundscape: { genre: "application", semantic: "The soundscape", metaphor: "A speaker with its waves" },
  multiFinderApp: { genre: "application", semantic: "The application switcher", metaphor: "Two windows stacked" },
  cloudModel: { genre: "utility", semantic: "A hosted model", metaphor: "A cloud carrying a chip" },
  cloudModelOff: { genre: "utility", semantic: "No hosted model", metaphor: "The same cloud, struck through" },
  timeMachine: { genre: "utility", semantic: "The archive", metaphor: "A clock with a returning arrow" },
  systemStatus: { genre: "utility", semantic: "System status", metaphor: "A monitor showing its reading" },
  contextPanel: { genre: "utility", semantic: "The context panel", metaphor: "A box with its index column" },
  daHandler: { genre: "utility", semantic: "Desk accessory handling", metaphor: "A briefcase for the accessories" },
  writingBell: { genre: "accessory", semantic: "The writing bell", metaphor: "A bell that can be rung" },
  control: { genre: "utility", semantic: "The control board", metaphor: "A panel of knobs" },
  localModel: { genre: "utility", semantic: "A local model", metaphor: "A chip with its pins" },
  controlStrip: { genre: "utility", semantic: "The control strip", metaphor: "A bar of small controls" },
};

async function context(svg, size) {
  const image = await loadImage(Buffer.from(svg));
  const ctx = createCanvas(size, size).getContext("2d");
  ctx.drawImage(image, 0, 0, size, size);
  return ctx;
}

function canonicalCount() {
  return ICON_SPECS.length;
}

export async function buildNextstepCoreIcons() {
  mkdirSync(iconsDir, { recursive: true });
  mkdirSync(evidenceDir, { recursive: true });
  const family = readJson(familyPath);
  const manifest = readJson(manifestPath);
  family.icons ||= {};
  const written = {};

  for (const id of NEXTSTEP_AUTHORED_ICON_IDS) {
    const sizes = {};
    const runtimeSha256 = {};
    const metrics = {};
    let grid = null;
    let quality = null;
    for (const size of TIERS) {
      const svg = nextstepCoreArtwork(id, size);
      const content = await sharp(Buffer.from(svg)).toColourspace("srgb").withIccProfile("srgb")
        .png({ compressionLevel: 9 }).toBuffer();
      const rel = `icons/${id}-${size}.png`;
      writeFileSync(join(themeDir, rel), content);
      sizes[size] = rel;
      runtimeSha256[`${size}-default`] = hash(content);
      const ctx = await context(content, size);
      const ink = inkBox(ctx, size);
      metrics[size] = { ...pixelBounds(ctx, size), sha256: hash(content), ink, gridShape: shapeClass(ink) };
      if (size === 128) {
        grid = { canvas: 128, shape: shapeClass(ink), fitted: Math.max(ink.width, ink.height) / 128, method: "measured-output-no-resampling" };
        quality = runtimePixelMetrics(ctx, 128);
      }
    }
    const label = OBJECT_LABELS[id];
    const item = {
      genre: label.genre,
      semanticIdentity: label.semantic,
      physicalMetaphor: label.metaphor,
      label: id,
      provenanceClass: "C",
      sourceKind: "original-code-native-period-adaptation",
      authoringMethod: "independently authored era-specific SVG construction",
      generationStatus: "technically-clean",
      historicalReviewStatus: "pending",
      eraGrammarReview: "original-period-adaptation-reviewed",
      reviewStatus: "technically-clean",
      runtimeAsset: true,
      nativeReplica: false,
      referenceValidated: false,
      sourceNote: "Period adaptation of a NeXTSTEP 3.3 object. The shape follows the era's grammar "
        + "(flat grays, 1px outline, light top-left bevel, dark bottom-right bevel, hard corners); "
        + "no native screenshot was measured against it, so no replica is claimed.",
      sourceReferences: ["apps/desktop/assets/themes/era-icon-reference.json"],
      sizes,
      runtimeSha256,
      sizePolicy: "16 and 32 px carry their own compact construction (thicker outlines, fewer inner marks); 64 and 128 px carry the full silhouette.",
      metrics,
    };
    if (grid) item.grid = grid;
    if (quality) item.runtimePixelMetrics = quality;
    family.icons[id] = item;
    manifest[id] = sizes[128];
    written[id] = item;
  }

  // The coverage note is derived, not typed: this is the number a later reader
  // will quote, and a hand-written total is exactly how "three of 59" becomes a
  // false claim about an unmeasured object.
  const owned = Object.keys(family.icons).length;
  const authoredObjects = NEXTSTEP_AUTHORED_ICON_IDS.length;
  family.schemaVersion ||= 1;
  family.target ||= "nextstep";
  family.coreBuilder = "tooling/build-nextstep-core-icons.mjs";
  family.coreIconIds = [...NEXTSTEP_OBJECT_ICON_IDS];
  family.utilityIconIds = [...NEXTSTEP_UTILITY_ICON_IDS];
  family.deskIconIds = [...NEXTSTEP_DESK_ICON_IDS];
  family.fileIconIds = [...NEXTSTEP_FILE_ICON_IDS];
  family.lastIconIds = [...NEXTSTEP_LAST_ICON_IDS];
  // The denominator is the same one the continuity ledger and the provenance
  // matrix use: the canonical objects plus the project-original applications
  // (COMPLETE_ICON_IDS). A note counted against a different total is how "the
  // other 47" and "the other 50" end up describing the same desktop. And when
  // the batch that finishes the list lands, the family says so instead of
  // announcing a fallback of zero.
  const fallback = canonicalCount() + ADDED_APP_ICON_IDS.length - owned;
  family.completeFamily = fallback === 0;
  family.coverageNote = fallback === 0
    ? `${ADDED_APP_ICON_IDS.length} applications and ${authoredObjects} objects own NeXTSTEP artwork; `
      + `every one of the ${owned} runtime objects the appearance maps is authored.`
    : `${ADDED_APP_ICON_IDS.length} applications and ${authoredObjects} objects own NeXTSTEP artwork; the other `
      + `${fallback} semantic objects use Classic.`;
  json(familyPath, family);
  json(manifestPath, manifest);
  json(join(evidenceDir, "nextstep-core-additions.json"), written);
  console.log(`nextstep: ${NEXTSTEP_AUTHORED_ICON_IDS.length} authored objects written (${Object.keys(family.icons).length}/${canonicalCount() + ADDED_APP_ICON_IDS.length} owned)`);
}

/** Alpha bounding box, in the same shape the other icon ledgers record. */
function pixelBounds(ctx, size) {
  const { data } = ctx.getImageData(0, 0, size, size);
  let pixels = 0;
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      if (data[i + 3] <= 40) continue;
      pixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { pixels, bbox: { minX, minY, maxX, maxY } };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await buildNextstepCoreIcons();
}
