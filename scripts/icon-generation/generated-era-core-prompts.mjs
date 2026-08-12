// Prompt source for the generated Aqua, Snow Leopard, and Yosemite icon families.
//
// Historical screenshots and extracted resources are research evidence only.
// These prompts describe period materials and the product's fixed object
// meanings without asking the model to copy or trace Apple-owned artwork.

import { ICON_IDS } from "../lib/icon-family-inventory.mjs";

export const CHROMA_KEY = "#FF00FF";
export const MODEL = "gpt-image-2";
export const GENERATION_SIZE = "1024x1024";

export const CORE_OBJECTS = Object.freeze({
  finderApp: {
    label: "Finder / system identity",
    subject: "a compact beige Macintosh computer, front-facing, whose dark screen carries two friendly eyes and a small smile",
    shape: "portrait",
  },
  folder: {
    label: "System folder",
    subject: "the era's system folder as one unmistakable tabbed folder object",
    shape: "landscape",
  },
  hardDisk: {
    label: "Mounted local volume",
    subject: "a mounted local hard-disk volume, clearly hardware rather than a folder or document",
    shape: "landscape",
  },
  trash: {
    label: "Waste basket",
    subject: "an empty waste basket with an open top and a readable woven or perforated body",
    shape: "portrait",
  },
  document: {
    label: "Generic document",
    subject: "a generic white document sheet with one folded top corner and only a few neutral text marks",
    shape: "portrait",
  },
  daHandler: {
    label: "Generic application",
    subject: "a generic desktop application object for the era, distinct from a document, folder, or settings panel",
    shape: "square",
  },
  controlPanel: {
    label: "Settings",
    subject: "the era's settings object, expressed as a compact panel of physical controls rather than a modern gear glyph",
    shape: "square",
  },
  searcher: {
    label: "Searcher",
    subject: "a single magnifying glass overlapping a document page, with the lens and page both readable",
    shape: "portrait",
  },
  teachText: {
    label: "TeachText",
    subject: "writing paper with a pen resting across it, clearly an editable writing object",
    shape: "portrait",
  },
  assistant: {
    label: "ClioTalk",
    subject: "two overlapping speech balloons: the user's turn is a solid filled balloon and the reply is a separate balloon drawn with a clearly dashed outline to show that it remains provisional until saved",
    shape: "square",
  },
  scrapbook: {
    label: "Scrapbook",
    subject: "a bound album opened or angled to show one mounted photographic print, clearly an album rather than a notes page",
    shape: "landscape",
  },
  reviewDesk: {
    label: "Review Desk",
    subject: "a marked manuscript page under a magnifying lens, reduced to one readable proofing object",
    shape: "portrait",
  },
  docMap: {
    label: "DocMap",
    subject: "a document page whose heading lines grow into one simple stem with a few branches and nodes, a document structure map rather than a geographic map",
    shape: "portrait",
  },
  projectDisk: {
    label: "Project Hard Disk",
    subject: "a labelled external storage volume with one restrained project label cue, distinct from the unlabelled local hard disk",
    shape: "landscape",
  },
});

// The first fourteen objects remain a named historical review subset. The
// remaining definitions extend that same evidence and generation contract to
// the complete semantic inventory without weakening the original core gates.
export const REMAINING_OBJECTS = Object.freeze({
  startupDisk: {
    label: "Startup Disk",
    subject: "a bootable system disk volume with one small illuminated startup indicator in a lower corner, clearly distinct from the plain local hard disk; no arrow, upload symbol, download symbol, or large badge",
    shape: "square",
  },
  applications: {
    label: "Applications folder",
    subject: "a tabbed applications folder with a compact inset grid of four distinct application tiles, still unmistakably a folder",
    shape: "landscape",
  },
  fileFloppy: {
    label: "File Floppy",
    subject: "one 3.5-inch floppy disk with a readable metal shutter and label panel, clearly removable storage rather than a hard drive",
    shape: "square",
  },
  quickDraft: {
    label: "Quick Draft",
    subject: "one loose draft sheet with a pencil crossing a few rough horizontal marks, visibly provisional rather than a finished manuscript",
    shape: "portrait",
  },
  writingStudio: {
    label: "Writing Studio",
    subject: "a compact mechanical typewriter with one blank manuscript sheet emerging from the carriage",
    shape: "landscape",
  },
  projectDisc: {
    label: "Project CD",
    subject: "one optical project disc partly seated in a compact protective sleeve, with a small blank project tab and visible rainbow diffraction",
    shape: "square",
  },
  cloudModel: {
    label: "Cloud Model",
    subject: "a compact remote server unit paired with one active cloud-shaped status light, clearly a network model service rather than local hardware",
    shape: "square",
  },
  cloudModelOff: {
    label: "Cloud Model Offline",
    subject: "the same compact remote server concept with an unlit cloud-shaped status light and one visibly unplugged network cable",
    shape: "square",
  },
  questionSheet: {
    label: "Question Sheet",
    subject: "one white worksheet with a large centred question mark and two short blank response lines, no other text",
    shape: "portrait",
  },
  outline: {
    label: "Outline",
    subject: "three stacked index cards showing only indented bullets and horizontal hierarchy bars, clearly an outline rather than prose",
    shape: "landscape",
  },
  sectionDrafts: {
    label: "Section Drafts",
    subject: "three staggered draft pages with distinct coloured section tabs and rough line blocks, clearly separate sections of one work",
    shape: "portrait",
  },
  manuscript: {
    label: "Manuscript",
    subject: "a substantial bound manuscript stack with a cloth spine and one bookmark, clearly a finished long-form document",
    shape: "portrait",
  },
  reader: {
    label: "Reader",
    subject: "an open reading book with one restrained highlighted passage block and a slim reading marker, no legible words",
    shape: "landscape",
  },
  timeMachine: {
    label: "Time Machine",
    subject: "a compact archive drawer behind a round clock face with one restrained backward-history arrow",
    shape: "square",
  },
  clioStage: {
    label: "ClioStage",
    subject: "a small presentation stage with side curtains, a blank projection screen, and one focused overhead light",
    shape: "landscape",
  },
  clioChart: {
    label: "ClioChart",
    subject: "a standing presentation easel carrying one simple bar-and-line chart with no labels or numbers",
    shape: "portrait",
  },
  liquidCover: {
    label: "Cover Glass",
    subject: "a book-cover sheet partly overlaid by one clear glass lens panel, with the opaque cover and transparent material both readable",
    shape: "portrait",
  },
  cmfStudio: {
    label: "CMF Studio",
    subject: "a fan of colour, material, and finish swatches with one metal chip, one fabric chip, and restrained colour samples",
    shape: "landscape",
  },
  soundscape: {
    label: "Soundscape",
    subject: "one compact loudspeaker emitting two controlled waveform ribbons, clearly an audio environment tool",
    shape: "square",
  },
  systemFolder: {
    label: "System Folder",
    subject: "a system folder carrying one small inset mechanical wheel badge, unmistakably the operating-system folder",
    shape: "landscape",
  },
  helpFolder: {
    label: "Help Folder",
    subject: "a help folder carrying one large clean question-mark badge, with no other text",
    shape: "landscape",
  },
  importUtility: {
    label: "Import Utility",
    subject: "an inbox tray receiving one document sheet from above through a single downward arrow",
    shape: "portrait",
  },
  chooser: {
    label: "Chooser",
    subject: "two small desktop computers joined by one cable, with one machine visibly selected by a compact pointer tab",
    shape: "landscape",
  },
  systemHelp: {
    label: "System Help",
    subject: "a closed reference book with one large question mark on the cover and a single bookmark, no other text",
    shape: "portrait",
  },
  dictionary: {
    label: "Dictionary",
    subject: "a thick indexed reference book with stepped edge tabs and one bookmark, no letters or words",
    shape: "portrait",
  },
  writingDemo: {
    label: "Writing Demo",
    subject: "a document sheet with a single inset triangular play mark and two neutral writing lines, no text",
    shape: "portrait",
  },
  chatFile: {
    label: "Chat File",
    subject: "a document sheet carrying two small overlapping speech balloons, clearly a saved conversation file",
    shape: "portrait",
  },
  chatImport: {
    label: "Chat Import",
    subject: "an inbox tray receiving one speech balloon through a single downward arrow",
    shape: "square",
  },
  systemStatus: {
    label: "System Status",
    subject: "a compact desktop monitor showing one simple activity trace beside three physical status lights, no numbers or text",
    shape: "landscape",
  },
  contextPanel: {
    label: "Context Panel",
    subject: "a small index-card box with three raised source cards and distinct coloured tabs, clearly curated context rather than a folder",
    shape: "landscape",
  },
  rebuildArticle: {
    label: "Rebuild Article",
    subject: "a compact tabletop printing press feeding one manuscript sheet through its rollers, clearly reconstructing a document",
    shape: "landscape",
  },
  bureaucracyMeme: {
    label: "Bureaucracy Meme",
    subject: "a red rubber office stamp pressed over a small stack of blank administrative forms, no seals or words",
    shape: "landscape",
  },
  endfieldTerminal: {
    label: "Endfield Terminal",
    subject: "a compact dark terminal monitor with one green prompt block and two short luminous command lines, no legible characters",
    shape: "landscape",
  },
  documents: {
    label: "Documents folder",
    subject: "a documents folder with three visible paper sheets rising behind its front panel",
    shape: "landscape",
  },
  alias: {
    label: "Alias",
    subject: "a white document sheet carrying one small curled shortcut arrow at its lower corner, clearly a reference rather than the original",
    shape: "portrait",
  },
  systemFile: {
    label: "System File",
    subject: "a white system document sheet with one small inset mechanical wheel badge and no text",
    shape: "portrait",
  },
  multiFinderApp: {
    label: "MultiFinder",
    subject: "two overlapping compact Macintosh computers with friendly dark screens, clearly a paired Finder environment",
    shape: "landscape",
  },
  writingBell: {
    label: "Writing Bell",
    subject: "a compact brass desk bell with one small pen-nib relief on its base, clearly a writing accessory",
    shape: "landscape",
  },
  trashFull: {
    label: "Full Waste Basket",
    subject: "a waste basket filled with several crumpled paper sheets rising above the rim, clearly the full state of the empty basket",
    shape: "portrait",
  },
  control: {
    label: "Control",
    subject: "a compact physical control board with two round knobs, one toggle, and one small indicator light",
    shape: "square",
  },
  localModel: {
    label: "Local Model",
    subject: "one processor chip mounted on a compact circuit board with short visible traces, clearly local compute rather than a cloud service",
    shape: "square",
  },
  controlStrip: {
    label: "Control Strip",
    subject: "a narrow horizontal strip containing four distinct physical control modules, including a slider, a status light, and two compact toggles",
    shape: "landscape",
  },
});

const objectDefinitions = { ...CORE_OBJECTS, ...REMAINING_OBJECTS };
const missingDefinitions = ICON_IDS.filter((id) => !objectDefinitions[id]);
const unexpectedDefinitions = Object.keys(objectDefinitions).filter((id) => !ICON_IDS.includes(id));
if (missingDefinitions.length || unexpectedDefinitions.length) {
  throw new Error(`Generated icon prompt inventory mismatch: missing ${missingDefinitions.join(", ") || "none"}; unexpected ${unexpectedDefinitions.join(", ") || "none"}`);
}

export const GENERATION_OBJECTS = Object.freeze(Object.fromEntries(
  ICON_IDS.map((id) => [id, objectDefinitions[id]]),
));

export const ERAS = Object.freeze({
  aqua: {
    label: "Aqua / 2002",
    sizes: [128, 32, 16],
    style: [
      "Early-2000s candy-colour desktop icon illustration.",
      "Three-quarter object view unless the subject explicitly calls for a frontal face.",
      "Saturated fills, a real broad specular gloss band, and a dark saturated rim; never use a neutral grey hairline as the outer edge.",
      "One soft elliptical contact shadow may sit directly beneath the object, but there is no floor plane.",
      "Light comes from upper left at roughly 35 degrees; keep that direction identical across the family.",
      "High material depth and confident silhouette, with no decorative background tile.",
    ],
    palette: "cobalt blue, cyan, leaf green, warm amber, clean white, and deep saturated blue-violet rims",
  },
  "snow-leopard": {
    label: "Snow Leopard / 2009",
    sizes: [512, 128, 32, 16],
    style: [
      "Late-2000s desktop icon illustration with neutral overhead light and precise contours.",
      "Restrained saturation and one convincing material texture per object: brushed metal, paper fibre, translucent plastic, leather, or wire mesh as appropriate.",
      "No candy gloss band; reflections are narrow and physically tied to the material.",
      "A tight contact shadow may sit directly beneath the object, but there is no floor plane.",
      "Keep perspective shallow and consistent across related objects, with realistic but compact depth.",
      "Fine detail belongs only where it reinforces the silhouette and must not become noise.",
    ],
    palette: "neutral silver, graphite, paper white, muted cobalt, restrained cyan, warm leather brown, and small controlled colour accents",
  },
  yosemite: {
    label: "Yosemite / 2014",
    sizes: [128, 64, 32, 16],
    style: [
      "Mid-2010s flat desktop icon illustration, frontal and optically centred.",
      "Use one confident saturated colour block per icon with at most a shallow two-stop gradient.",
      "Use a hairline only on white objects where the silhouette otherwise disappears.",
      "Minimal object-owned overlap shadow only; no floating card shadow and no floor plane.",
      "Geometric clarity, compact depth, and free-form silhouettes rather than one shared container.",
      "The result must feel 2014, not a current mobile-app badge.",
    ],
    palette: "clear cyan-blue, coral, leaf green, warm yellow, cool grey, and clean white with restrained dark accents",
  },
});

const SHARED_NEGATIVE = [
  "Do not copy, trace, quote, embed, or recreate any named Apple icon or logo.",
  "No Apple logo, brand text, watermark, caption, label text, letters, numbers, or UI screenshot.",
  "No Big Sur styling, no squircle container, no rounded-square badge unless the subject itself physically requires a panel, and no SF Symbols outline-glyph language.",
  "No modern 3D emoji, clay render, isometric room, photorealistic product shot, vector-outline icon, sticker border, or neon glow.",
  "Do not add extra objects, decorative stars, sparkles, people, robots, magic wands, brains, or generic AI marks.",
  "Keep the complete subject inside generous clear padding; no crop and no canvas-edge contact.",
];

function sizeGuidance(profile) {
  if (profile === "tiny") {
    return [
      "This source will be reduced to a true 16 px icon.",
      "Use the same subject and era materials, but keep only the primary silhouette and at most two internal cues.",
      "Make gaps and the thinnest important strokes broad enough to survive reduction; remove texture and tiny highlights.",
    ];
  }
  if (profile === "small") {
    return [
      "This source will be reduced to a true 32 px icon.",
      "Keep the primary silhouette plus only the most important secondary cue; simplify texture and avoid hairline interior detail.",
    ];
  }
  return [
    "This is the large master source; preserve a crisp, instantly readable silhouette and controlled period material detail.",
    "The composition must remain legible when viewed at approximately 32 px even though the source is large.",
  ];
}

export function buildPrompt(eraId, iconId, profile = "master") {
  const era = ERAS[eraId];
  const object = GENERATION_OBJECTS[iconId];
  if (!era) throw new Error(`unknown era: ${eraId}`);
  if (!object) throw new Error(`unknown icon: ${iconId}`);
  if (!new Set(["master", "small", "tiny"]).has(profile)) throw new Error(`unknown profile: ${profile}`);

  return [
    "Use case: stylized-concept",
    `Asset type: ${era.label} desktop application icon source with removable background`,
    `Primary request: Create one original icon for ${object.label}.`,
    `Subject: ${object.subject}.`,
    "Scene/backdrop: one isolated object only, centred on a perfectly flat solid #FF00FF chroma-key background for background removal.",
    "Style/medium:",
    ...era.style.map((line) => `- ${line}`),
    `Color palette: ${era.palette}. Do not use #FF00FF or nearby magenta anywhere in the subject.`,
    "Scale adaptation:",
    ...sizeGuidance(profile).map((line) => `- ${line}`),
    "Transparency preparation:",
    "- The background is one uniform #FF00FF colour with no gradient, texture, reflection, lighting variation, horizon, floor, or shadow cast onto it.",
    "- Keep every part of the subject separated from the background with crisp edges and approximately 12% empty padding on every side.",
    "- A compact contact shadow explicitly allowed by the era style is part of the isolated icon, not a background or floor.",
    "Constraints / anti-drift:",
    ...SHARED_NEGATIVE.map((line) => `- ${line}`),
  ].join("\n");
}

export function promptRecord(eraId, iconId, profile = "master") {
  return {
    schemaVersion: 1,
    era: eraId,
    icon: iconId,
    profile,
    model: MODEL,
    generationSize: GENERATION_SIZE,
    chromaKey: CHROMA_KEY,
    prompt: buildPrompt(eraId, iconId, profile),
  };
}

export function allMasterPromptRecords() {
  return Object.keys(ERAS).flatMap((eraId) =>
    Object.keys(GENERATION_OBJECTS).map((iconId) => promptRecord(eraId, iconId, "master")));
}
