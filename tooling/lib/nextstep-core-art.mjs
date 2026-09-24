// NeXTSTEP 3.3 core object artwork: code-native period adaptation.
//
// What this file may and may not claim, in the same vocabulary the rest of the
// icon pipeline uses:
//
//   * These are ORIGINAL constructions in the era's grammar, not reproductions.
//     `nativeReplica: false` and `referenceValidated: false` are written into
//     the family ledger by the builder, and no historical screenshot was
//     measured to author them. The pack that asked for this batch says the same
//     thing in the same words: an object that is a same-era analogue, or an
//     object whose real counterpart exists but was not overlain, is not a
//     "restored" icon and must not be labelled as one.
//   * The grammar is taken from the 3.3 visual guide, not from a modern Mac:
//     flat grays (no gradients), a 1px dark outline, a light bevel on the top
//     and left edge with a dark bevel on the bottom and right, hard corners,
//     and a silhouette that reads at 16px before it reads as detail.
//   * Applications keep the plate the three project-original applications
//     already use. Files, folders, disks and the trash are SHAPED objects -- a
//     page is not a plate, a folder has its tab, a drive has its face -- because
//     one generic square for every kind of thing is exactly the failure the
//     appearance review names.
//
// Every object draws from the same 32x32 grid and the same six inks:
//   paper #f4f4f4 · body #d2d2d2 · shade #9c9c9c · deep #5f5f5f
//   outline #1b1b1b · gloss #ffffff

const PAPER = "#f4f4f4";
const BODY = "#d2d2d2";
const SHADE = "#9c9c9c";
const DEEP = "#5f5f5f";
const OUTLINE = "#1b1b1b";
const GLOSS = "#ffffff";

// Batch one: the objects every desktop shows, whatever the era -- the workspace
// application, the folder, the page, the drive, the trash. They are what a
// person sees before they open anything, which is why they come first.
export const NEXTSTEP_OBJECT_ICON_IDS = Object.freeze([
  "finderApp",
  "folder",
  "document",
  "hardDisk",
  "trash",
  "trashFull",
]);

// Batch two: the era's own utility applications -- the ones the 3.3 guide puts
// in the Dock as shipped applications. They keep the application plate the
// three project-original applications already wear and carry a grayscale glyph:
// the plate says "application", the glyph says which one, and gray rather than
// colour keeps the era's system objects apart from the project's own AI apps,
// which are the ones that may not pretend to have a 1995 counterpart.
export const NEXTSTEP_UTILITY_ICON_IDS = Object.freeze([
  "searcher",
  "dictionary",
  "systemHelp",
  "importUtility",
  "controlPanel",
  "chooser",
]);

// Batch three: the desk's own working objects -- what this project puts on a
// NeXTSTEP desktop. They cannot be "period" in the way a folder can: none of
// them existed in 1995. So they borrow the era's object and lighting habits
// (the plate, the flat grays, the 1px outline, the light top-left bevel) and
// say so in the ledger -- original, no native counterpart claimed, historical
// review open. That is the same vocabulary the three project-original
// applications already use, and it is why they are gray rather than colour.
export const NEXTSTEP_DESK_ICON_IDS = Object.freeze([
  "writingStudio",
  "assistant",
  "quickDraft",
  "projectDisk",
  "projectDisc",
  "questionSheet",
  "outline",
  "sectionDrafts",
  "manuscript",
  "reviewDesk",
  "scrapbook",
  "reader",
]);

// Batch four: the files and the desk's teaching surfaces -- a floppy, folders
// that say what they hold, and the several kinds of page this desk writes on.
// The rule for telling them apart is the object each one IS, not a decoration:
// a folder with a gear is not a drive with a slot, and a page under a play
// triangle is not a page with a caret in it.
export const NEXTSTEP_FILE_ICON_IDS = Object.freeze([
  "startupDisk",
  "applications",
  "fileFloppy",
  "systemFolder",
  "helpFolder",
  "documents",
  "teachText",
  "writingDemo",
  "chatFile",
  "chatImport",
  "systemFile",
  "alias",
  "docMap",
  "rebuildArticle",
  "bureaucracyMeme",
  "endfieldTerminal",
]);

// Batch five: what was left -- the labs this project invented, the machine's
// own status objects, and the two kinds of control surface. Applications keep
// the plate; a bell is a bell, a chip is a chip, a clock is a clock. This is
// the batch that finishes the era's object list, so the ledger's note stops
// talking about a fallback once it lands.
export const NEXTSTEP_LAST_ICON_IDS = Object.freeze([
  "clioStage",
  "clioChart",
  "liquidCover",
  "cmfStudio",
  "soundscape",
  "multiFinderApp",
  "cloudModel",
  "cloudModelOff",
  "timeMachine",
  "systemStatus",
  "contextPanel",
  "daHandler",
  "writingBell",
  "control",
  "localModel",
  "controlStrip",
]);

/** Everything this module authors, in the order the batches landed. */
export const NEXTSTEP_AUTHORED_ICON_IDS = Object.freeze([
  ...NEXTSTEP_OBJECT_ICON_IDS,
  ...NEXTSTEP_UTILITY_ICON_IDS,
  ...NEXTSTEP_DESK_ICON_IDS,
  ...NEXTSTEP_FILE_ICON_IDS,
  ...NEXTSTEP_LAST_ICON_IDS,
]);

const rect = (x, y, w, h, fill, stroke = "none", width = 1) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const line = (x1, y1, x2, y2, stroke, width = 1) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"/>`;
const path = (d, fill = "none", stroke = "none", width = 1) =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="miter" stroke-linecap="butt"/>`;

/**
 * A raised panel: the body, then the two bevel lines that make it read as a
 * physical face in this era's grammar. `bevel` is the width of the light and
 * dark edges, which is the one value the compact sizes change (a 16px object
 * keeps the silhouette and drops to a single visible bevel).
 */
function panel(x, y, w, h, { face = BODY, bevel = 2, outline = OUTLINE } = {}) {
  if (!w || !h) return "";
  return rect(x, y, w, h, face, outline, 1)
    + path(`M${x + 1} ${y + h}V${y + 1}H${x + w}`, "none", GLOSS, bevel)
    + path(`M${x + w - 1} ${y + 1}V${y + h - 1}H${x}`, "none", SHADE, bevel);
}

/** The 3.3 application plate: three project-original apps already use it. */
function plate() {
  return rect(1, 1, 30, 30, "#171717")
    + rect(2, 2, 27, 27, "#9a9a9a")
    + path("M2 29V2H29", "none", GLOSS, 2)
    + path("M4 29H29V4", "none", "#424242", 2);
}

function appGlyph(tiny) {
  // Workspace: files standing in a column beside their folder, the object the
  // Workspace Manager put on screen.
  const out = [];
  out.push(panel(tiny ? 8 : 7, tiny ? 9 : 8, tiny ? 9 : 10, tiny ? 14 : 16, { face: PAPER, bevel: tiny ? 2 : 2 }));
  if (!tiny) {
    out.push(line(10, 13, 14, 13, SHADE));
    out.push(line(10, 16, 14, 16, SHADE));
    out.push(line(10, 19, 13, 19, SHADE));
  } else {
    out.push(line(10, 15, 14, 15, SHADE, 2));
  }
  out.push(panel(tiny ? 17 : 17, tiny ? 12 : 11, tiny ? 6 : 7, tiny ? 11 : 13, { face: BODY, bevel: 2 }));
  return out.join("");
}

function folder(tiny) {
  // One silhouette, not a body with a hook on top: the tab turns into the
  // front face the way a folder actually folds.
  const out = [path("M4 27V8c0-.55.45-1 1-1h6.4c.4 0 .77.24.94.6L14 11h12c.55 0 1 .45 1 1v15z", BODY, OUTLINE, 1)];
  out.push(path("M5 10h7l1.8 3H27", "none", GLOSS, 1));
  out.push(path("M5 26h21", "none", SHADE, 1));
  if (!tiny) out.push(path("M6 15h21", "none", SHADE, 1));
  return out.join("");
}

function document(tiny) {
  const out = [];
  // The page, with the top-right corner turned down: the shape that says
  // "document" in this era without a word.
  out.push(path("M8 3h11l6 6v20H8z", PAPER, OUTLINE, 1));
  out.push(path("M19 3v6h6", "none", SHADE, 1));
  out.push(path("M9 4h10v4l-1 1H9z", "none", GLOSS, 1));
  if (tiny) {
    out.push(line(11, 15, 21, 15, SHADE, 2));
    out.push(line(11, 20, 21, 20, SHADE, 2));
  } else {
    for (const y of [14, 17, 20, 23]) out.push(line(11, y, 22, y, SHADE));
  }
  return out.join("");
}

function hardDisk(tiny) {
  return [
    panel(3, tiny ? 10 : 9, 26, tiny ? 13 : 15, { face: BODY, bevel: 2 }),
    rect(tiny ? 6 : 6, tiny ? 13 : 12, tiny ? 20 : 20, tiny ? 4 : 5, SHADE, OUTLINE, 1),
    tiny ? "" : line(8, 14, 8, 16, DEEP),
    `<circle cx="26" cy="20" r="1.4" fill="${DEEP}" stroke="${OUTLINE}" stroke-width="0.6"/>`,
    path("M3 27h26", "none", DEEP, 2),
  ].join("");
}

function trash({ full, tiny }) {
  const out = [];
  if (full) {
    out.push(path("M11 9c0-3 3-4 4-2 1-3 5-2 5 1 3-1 4 1 3 3z", PAPER, OUTLINE, 1));
  }
  out.push(panel(7, tiny ? 10 : 9, 18, tiny ? 15 : 17, { face: SHADE, bevel: 2 }));
  out.push(rect(5, tiny ? 8 : 7, 22, 3, BODY, OUTLINE, 1));
  out.push(path("M13 6h6", "none", OUTLINE, 2));
  if (tiny) {
    out.push(line(16, 12, 16, 23, DEEP, 1));
  } else {
    for (const x of [12, 16, 20]) out.push(line(x, 12, x, 24, DEEP));
  }
  return out.join("");
}

// --- Batch two: the era's utility applications -------------------------------
//
// Inside the plate, one grayscale mark each. At 16px the mark is the whole
// story: a magnifier, a book, a question mark, an arrow going into a tray, a
// slider, a plug. Anything finer than that turns into noise at the size the
// Dock actually draws.

function magnifier(tiny) {
  const r = tiny ? 4.5 : 5.5;
  return `<circle cx="${tiny ? 15 : 14.5}" cy="${tiny ? 14 : 13.5}" r="${r}" fill="none" stroke="${PAPER}" stroke-width="${tiny ? 2 : 2.4}"/>`
    + line(tiny ? 18 : 18.4, tiny ? 17 : 17.4, tiny ? 23 : 23.5, tiny ? 22 : 22.5, PAPER, tiny ? 3 : 3.4);
}

function book(tiny) {
  return [
    path("M8 8h13a3 3 0 0 1 3 3v13H11a3 3 0 0 0-3 3z", PAPER, OUTLINE, 1),
    line(tiny ? 11 : 11, tiny ? 13 : 12, tiny ? 21 : 21, tiny ? 13 : 12, SHADE, tiny ? 2 : 1.4),
    tiny ? "" : line(11, 16, 21, 16, SHADE, 1.4),
    tiny ? "" : line(11, 19, 21, 19, SHADE, 1.4),
  ].join("");
}

function question(tiny) {
  return [
    rect(tiny ? 8 : 7, tiny ? 8 : 7, tiny ? 16 : 18, tiny ? 17 : 18, PAPER, OUTLINE, 1),
    path(tiny ? "M13 13c0-2 5-2 5 0 0 1.4-2.4 1.6-2.4 3.2" : "M12 12.5c0-2.2 5.6-2.2 5.6 0 0 1.6-2.6 1.8-2.6 3.6",
      "none", OUTLINE, tiny ? 1.8 : 2),
    `<circle cx="${tiny ? 15.5 : 15}" cy="${tiny ? 20.5 : 21}" r="${tiny ? 1.3 : 1.5}" fill="${OUTLINE}"/>`,
  ].join("");
}

function tray(tiny) {
  return [
    rect(tiny ? 8 : 7, tiny ? 15 : 16, tiny ? 16 : 18, tiny ? 9 : 9, PAPER, OUTLINE, 1),
    path(tiny ? "M16 7v7m0 0-3-3m3 3 3-3" : "M16 6v8.5m0 0-3.2-3.2M16 14.5l3.2-3.2", "none", OUTLINE, tiny ? 2 : 2.2),
  ].join("");
}

function slider(tiny) {
  const out = [
    rect(tiny ? 7 : 6, tiny ? 9 : 9, tiny ? 18 : 20, tiny ? 15 : 15, PAPER, OUTLINE, 1),
  ];
  for (const y of tiny ? [13, 19] : [13, 17, 21]) out.push(line(9, y, 23, y, SHADE, tiny ? 1.6 : 1.2));
  out.push(rect(tiny ? 12 : 13, tiny ? 11 : 11, tiny ? 5 : 6, tiny ? 4 : 4, DEEP, OUTLINE, 1));
  if (!tiny) out.push(rect(10, 19, 6, 4, DEEP, OUTLINE, 1));
  return out.join("");
}

function plug(tiny) {
  return [
    rect(tiny ? 8 : 7, tiny ? 10 : 10, tiny ? 10 : 11, tiny ? 12 : 12, PAPER, OUTLINE, 1),
    line(tiny ? 18 : 18, tiny ? 16 : 16, tiny ? 24 : 25, tiny ? 16 : 16, OUTLINE, tiny ? 2 : 2.4),
    `<circle cx="${tiny ? 24.5 : 25.5}" cy="${tiny ? 16 : 16}" r="${tiny ? 2 : 2.4}" fill="${DEEP}"/>`,
    tiny ? "" : line(10, 13, 15, 13, SHADE, 1.2),
  ].join("");
}

function utilityGlyph(id, tiny) {
  if (id === "searcher") return magnifier(tiny);
  if (id === "dictionary") return book(tiny);
  if (id === "systemHelp") return question(tiny);
  if (id === "importUtility") return tray(tiny);
  if (id === "controlPanel") return slider(tiny);
  return plug(tiny);
}

// --- Batch three: this desk's own objects ------------------------------------
//
// Each mark names the object the way this desk uses it: the writing studio is a
// typewriter, the question sheet is a numbered page, the outline is an indented
// list, the scrapbook is a pinned picture. They are deliberately not the same
// shape twice -- a page with a check is a review, a page with a lens is a
// reading, a stack of sheets is a set of drafts.

function typewriter(tiny) {
  return [
    rect(tiny ? 8 : 7, tiny ? 14 : 15, tiny ? 16 : 18, tiny ? 10 : 10, PAPER, OUTLINE, 1),
    path(tiny ? "M12 14v-4h8v4" : "M11 15v-5h10v5", "none", OUTLINE, tiny ? 2 : 1.6),
    tiny ? "" : line(10, 18, 22, 18, SHADE, 1.2),
    tiny ? line(12, 21, 20, 21, SHADE, 2) : line(10, 21, 22, 21, SHADE, 1.2),
  ].join("");
}

function bubble(tiny) {
  return [
    tiny ? "" : path("M8 8h16v9H14l-4 4v-4H8z", PAPER, OUTLINE, 1),
    tiny ? path("M8 9h16v8H13l-4 3z", PAPER, OUTLINE, 1) : "",
    path(tiny ? "M11 15h10" : "M11 12h10", "none", SHADE, tiny ? 2 : 1.2),
  ].join("");
}

function pagePencil(tiny) {
  return [
    rect(tiny ? 8 : 8, tiny ? 7 : 6, tiny ? 12 : 13, tiny ? 18 : 20, PAPER, OUTLINE, 1),
    tiny ? line(11, 12, 17, 12, SHADE, 2) : line(10, 11, 18, 11, SHADE, 1.2),
    tiny ? "" : line(10, 15, 18, 15, SHADE, 1.2),
    path(tiny ? "M16 24l6-6 2 2-6 6h-2z" : "M15 26l7-7 2.4 2.4-7 7H15z", DEEP, OUTLINE, 1),
  ].join("");
}

function driveFace(tiny, marked) {
  const out = [panel(3, tiny ? 11 : 10, 26, tiny ? 12 : 14, { face: BODY, bevel: 2 })];
  out.push(rect(6, tiny ? 14 : 13, 20, tiny ? 4 : 5, SHADE, OUTLINE, 1));
  if (!tiny) out.push(`<circle cx="26" cy="21" r="1.3" fill="${DEEP}"/>`);
  if (marked) out.push(tiny ? line(10, 20, 14, 20, DEEP, 2) : line(9, 22, 15, 22, DEEP, 1.4));
  return out.join("");
}

function disc(tiny) {
  return `<circle cx="16" cy="16" r="${tiny ? 9 : 10}" fill="${BODY}" stroke="${OUTLINE}" stroke-width="1"/>`
    + `<circle cx="16" cy="16" r="${tiny ? 3 : 3.4}" fill="${PAPER}" stroke="${OUTLINE}" stroke-width="1"/>`
    + (tiny ? "" : `<circle cx="16" cy="16" r="6.4" fill="none" stroke="${SHADE}" stroke-width="1"/>`);
}

function numberedPage(tiny) {
  return [
    rect(tiny ? 8 : 8, tiny ? 7 : 6, tiny ? 16 : 16, tiny ? 18 : 20, PAPER, OUTLINE, 1),
    tiny ? line(11, 12, 21, 12, SHADE, 2) : line(11, 11, 21, 11, SHADE, 1.2),
    tiny ? line(11, 17, 21, 17, SHADE, 2) : line(11, 16, 21, 16, SHADE, 1.2),
    tiny ? "" : line(11, 21, 21, 21, SHADE, 1.2),
    `<circle cx="9.3" cy="11" r="0.9" fill="${OUTLINE}"/>`,
    `<circle cx="9.3" cy="16" r="0.9" fill="${OUTLINE}"/>`,
    tiny ? "" : `<circle cx="9.3" cy="21" r="0.9" fill="${OUTLINE}"/>`,
  ].join("");
}

function indented(tiny) {
  const rows = tiny ? [[10, 12, 20], [14, 17, 20]] : [[9, 10, 23], [13, 14, 23], [13, 18, 23], [17, 22, 23]];
  return rows.map(([x, y, x2]) => line(x, y, x2, y, y > 15 ? PAPER : DEEP, tiny ? 2 : 1.6)).join("");
}

function stackedSheets(tiny) {
  return [
    rect(tiny ? 11 : 12, tiny ? 6 : 5, tiny ? 11 : 12, tiny ? 13 : 14, SHADE, OUTLINE, 1),
    path(tiny ? "M9 9h11v13H9z" : "M9 9h12v14H9z", PAPER, OUTLINE, 1),
    tiny ? line(11, 14, 18, 14, SHADE, 2) : line(11, 13, 19, 13, SHADE, 1.2),
    tiny ? "" : line(11, 17, 19, 17, SHADE, 1.2),
  ].join("");
}

function boundStack(tiny) {
  return [
    rect(tiny ? 8 : 7, tiny ? 9 : 8, tiny ? 16 : 18, tiny ? 15 : 16, PAPER, OUTLINE, 1),
    rect(tiny ? 8 : 7, tiny ? 9 : 8, tiny ? 4 : 4, tiny ? 15 : 16, SHADE, OUTLINE, 1),
    tiny ? "" : line(13, 13, 23, 13, SHADE, 1.2),
    tiny ? "" : line(13, 17, 23, 17, SHADE, 1.2),
  ].join("");
}

function checkedPage(tiny) {
  return [
    rect(tiny ? 8 : 8, tiny ? 7 : 6, tiny ? 16 : 16, tiny ? 18 : 20, PAPER, OUTLINE, 1),
    path(tiny ? "M11 16l3 3 6-7" : "M11 16.5l3.4 3.4L22 11", "none", DEEP, tiny ? 2.4 : 2.6),
  ].join("");
}

function pinnedPicture(tiny) {
  return [
    rect(tiny ? 8 : 7, tiny ? 8 : 7, tiny ? 16 : 18, tiny ? 17 : 18, PAPER, OUTLINE, 1),
    rect(tiny ? 11 : 10, tiny ? 12 : 11, tiny ? 10 : 12, tiny ? 9 : 10, SHADE, OUTLINE, 1),
    `<circle cx="${tiny ? 16 : 16}" cy="${tiny ? 8 : 7}" r="${tiny ? 1.4 : 1.6}" fill="${DEEP}" stroke="${OUTLINE}" stroke-width="0.6"/>`,
  ].join("");
}

function readingLens(tiny) {
  return [
    rect(tiny ? 8 : 7, tiny ? 7 : 6, tiny ? 13 : 14, tiny ? 18 : 20, PAPER, OUTLINE, 1),
    `<circle cx="${tiny ? 19 : 20}" cy="${tiny ? 18 : 19}" r="${tiny ? 4 : 4.6}" fill="none" stroke="${DEEP}" stroke-width="${tiny ? 2 : 2.2}"/>`,
    tiny ? "" : line(22.6, 22.4, 26, 25.8, DEEP, 2.2),
  ].join("");
}

function deskGlyph(id, tiny) {
  if (id === "writingStudio") return typewriter(tiny);
  if (id === "assistant") return bubble(tiny);
  if (id === "quickDraft") return pagePencil(tiny);
  if (id === "projectDisk") return driveFace(tiny, true);
  if (id === "projectDisc") return disc(tiny);
  if (id === "questionSheet") return numberedPage(tiny);
  if (id === "outline") return indented(tiny);
  if (id === "sectionDrafts") return stackedSheets(tiny);
  if (id === "manuscript") return boundStack(tiny);
  if (id === "reviewDesk") return checkedPage(tiny);
  if (id === "scrapbook") return pinnedPicture(tiny);
  return readingLens(tiny);
}

// --- Batch four: files, and the pages this desk writes on --------------------
//
// Shapes first, marks second: a folder is a folder in every one of these, and
// only the mark inside says which folder. That keeps the 16px tier readable --
// at that size the silhouette is the whole message and the mark is one stroke.

function folderWith(mark, tiny) {
  const out = [
    path("M5 26V9c0-.55.45-1 1-1h6.4c.4 0 .77.24.94.6L15 12h10c.55 0 1 .45 1 1v13z", BODY, OUTLINE, 1),
    path("M6 11h7l1.7 3H26", "none", GLOSS, 1),
    path("M6 25h20", "none", SHADE, 1),
  ];
  out.push(mark(tiny));
  return out.join("");
}

function squareMark(tiny) {
  return rect(tiny ? 13 : 13, tiny ? 15 : 15, tiny ? 7 : 8, tiny ? 7 : 8, PAPER, OUTLINE, 1);
}

function gearMark(tiny) {
  const r = tiny ? 3.4 : 3.8;
  const out = [`<circle cx="16" cy="19" r="${r}" fill="${PAPER}" stroke="${OUTLINE}" stroke-width="1"/>`];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    out.push(line(16 + dx * r, 19 + dy * r, 16 + dx * (r + 2), 19 + dy * (r + 2), OUTLINE, tiny ? 2 : 1.6));
  }
  return out.join("");
}

function questionMark(tiny) {
  return [
    rect(tiny ? 12 : 12, tiny ? 14 : 14, tiny ? 8 : 9, tiny ? 9 : 10, PAPER, OUTLINE, 1),
    path(tiny ? "M14 17c0-1.4 3.6-1.4 3.6 0 0 1-1.7 1.1-1.7 2.2" : "M14.5 16.5c0-1.6 3.9-1.6 3.9 0 0 1.1-1.8 1.2-1.8 2.4",
      "none", OUTLINE, tiny ? 1.4 : 1.6),
    `<circle cx="${tiny ? 15.8 : 16.4}" cy="${tiny ? 21 : 21.5}" r="${tiny ? 0.9 : 1}" fill="${OUTLINE}"/>`,
  ].join("");
}

function documentMark(tiny) {
  return rect(tiny ? 13 : 13, tiny ? 15 : 15, tiny ? 7 : 8, tiny ? 7 : 9, PAPER, OUTLINE, 1);
}

function fanOfSheets(tiny) {
  return [
    rect(tiny ? 15 : 15, tiny ? 14 : 14, tiny ? 8 : 9, tiny ? 10 : 11, SHADE, OUTLINE, 1),
    rect(tiny ? 11 : 10, tiny ? 15 : 15, tiny ? 10 : 11, tiny ? 10 : 11, PAPER, OUTLINE, 1),
  ].join("");
}

function pageWith(mark, tiny) {
  return [
    path("M9 5h11l6 6v16H9z", PAPER, OUTLINE, 1),
    path("M20 5v6h6", "none", SHADE, 1),
    mark(tiny),
  ].join("");
}

function caretMark(tiny) {
  return [
    tiny ? line(12, 15, 20, 15, SHADE, 2) : line(12, 14, 20, 14, SHADE, 1.6),
    tiny ? line(12, 20, 20, 20, SHADE, 2) : line(12, 18, 20, 18, SHADE, 1.6),
    tiny ? "" : line(12, 22, 17, 22, SHADE, 1.6),
    tiny ? "" : path("M13 24v4", "none", OUTLINE, 2),
  ].join("");
}

function playMark(tiny) {
  return [
    tiny ? line(12, 15, 20, 15, SHADE, 2) : line(12, 14, 20, 14, SHADE, 1.6),
    path(tiny ? "M13.5 18.5l5 3-5 3z" : "M13 18l6.5 4-6.5 4z", DEEP, OUTLINE, 1),
  ].join("");
}

function chatMark(tiny) {
  return [
    path(tiny ? "M11 14h10v6h-6l-2 2v-2h-2z" : "M11 13h10v7h-6l-2.4 2.4V20H11z", PAPER, OUTLINE, 1),
  ].join("");
}

function gearPageMark(tiny) {
  return gearMark(tiny);
}

function aliasMark(tiny) {
  return [
    tiny ? line(12, 15, 20, 15, SHADE, 2) : line(12, 14, 20, 14, SHADE, 1.6),
    path(tiny ? "M13 21c3 0 5-2 5-5" : "M12.5 22c4 0 6.5-2.5 6.5-6", "none", DEEP, tiny ? 2 : 2.2),
    path(tiny ? "M17 16l1.6 4 4-1.6" : "M18 15l2 5 5-2", "none", DEEP, tiny ? 2 : 2.2),
  ].join("");
}

function treeMark(tiny) {
  return [
    `<circle cx="12" cy="16" r="${tiny ? 1.6 : 1.8}" fill="${DEEP}"/>`,
    `<circle cx="${tiny ? 21 : 22}" cy="${tiny ? 13 : 12.5}" r="${tiny ? 1.6 : 1.8}" fill="${DEEP}"/>`,
    `<circle cx="${tiny ? 21 : 22}" cy="${tiny ? 21 : 21.5}" r="${tiny ? 1.6 : 1.8}" fill="${DEEP}"/>`,
    line(13.4, 16, 20, 13.4, SHADE, tiny ? 1.4 : 1.6),
    line(13.4, 16, 20, 21, SHADE, tiny ? 1.4 : 1.6),
  ].join("");
}

function cycleMark(tiny) {
  return [
    path(tiny ? "M12 18h6a3 3 0 0 1 0 6" : "M12 18h6.5a3.2 3.2 0 0 1 0 6.4", "none", DEEP, tiny ? 2 : 2.2),
    path(tiny ? "M14 15l-3 3 3 3" : "M14.4 15l-3.4 3 3.4 3", "none", DEEP, tiny ? 2 : 2.2),
  ].join("");
}

function stampMark(tiny) {
  return [
    rect(tiny ? 12 : 11.5, tiny ? 13 : 12.5, tiny ? 8 : 9, tiny ? 8 : 9, PAPER, OUTLINE, 1),
    rect(tiny ? 10 : 9.5, tiny ? 21 : 21.5, tiny ? 12 : 13, tiny ? 4 : 4, DEEP, OUTLINE, 1),
  ].join("");
}

function terminalMark(tiny) {
  return [
    rect(tiny ? 10 : 9.5, tiny ? 14 : 13.5, tiny ? 12 : 13, tiny ? 9 : 10, "#2b2b2b", OUTLINE, 1),
    path(tiny ? "M12 18h4" : "M12 17h4.5", "none", PAPER, tiny ? 2 : 1.8),
    path(tiny ? "M12.5 21l2.5-1.5-2.5-1.5" : "M12.5 21l3-2-3-2", "none", PAPER, tiny ? 1.6 : 1.8),
  ].join("");
}

function fileGlyph(id, tiny) {
  if (id === "startupDisk") return driveFace(tiny, true);
  if (id === "applications") return folderWith(squareMark, tiny);
  if (id === "systemFolder") return folderWith(gearMark, tiny);
  if (id === "helpFolder") return folderWith(questionMark, tiny);
  if (id === "documents") return folderWith(fanOfSheets, tiny);
  if (id === "fileFloppy") {
    return [
      rect(7, 7, 18, 18, BODY, OUTLINE, 1),
      path("M7 25V7h11l7 7v11z", "none", GLOSS, 1),
      rect(11, 8, 10, 6, PAPER, OUTLINE, 1),
      rect(12, 17, 8, 7, SHADE, OUTLINE, 1),
    ].join("");
  }
  if (id === "teachText") return pageWith(caretMark, tiny);
  if (id === "writingDemo") return pageWith(playMark, tiny);
  if (id === "chatFile") return pageWith(chatMark, tiny);
  if (id === "systemFile") return pageWith(gearPageMark, tiny);
  if (id === "alias") return pageWith(aliasMark, tiny);
  if (id === "docMap") return pageWith(treeMark, tiny);
  if (id === "rebuildArticle") return pageWith(cycleMark, tiny);
  if (id === "bureaucracyMeme") return stampMark(tiny);
  if (id === "endfieldTerminal") return terminalMark(tiny);
  // chatImport: a message arriving in a tray, which is not the same object as
  // the import utility's tray-with-an-arrow.
  return [
    rect(9, 17, 14, 9, PAPER, OUTLINE, 1),
    path(tiny ? "M11 17v-4h8v4" : "M11 17v-4.5h10V17", "none", OUTLINE, tiny ? 2 : 1.6),
    path(tiny ? "M13 8h7v4h-4l-2 2v-2h-1z" : "M12.5 7.5h7.5V13h-4.5l-2 2v-2h-1z", PAPER, OUTLINE, 1),
  ].join("");
}

// --- Batch five: the labs, the machine's status objects, the control surfaces -

function cloudShape(tiny) {
  return path(tiny ? "M9 21c-3 0-4-4-1-5-1-4 5-6 7-3 3-2 8 0 7 4 3 0 3 4 0 4z"
    : "M9 22c-3.4 0-4.4-4.4-1.2-5.6C7 12 13.6 10 15.8 13.4 19 11 24.4 13.4 23 17c3.4.2 3.4 5 0 5z",
  PAPER, OUTLINE, 1);
}

function cloudModel(tiny, off) {
  const out = [cloudShape(tiny)];
  const cx = tiny ? 16 : 16;
  const cy = tiny ? 18 : 19;
  if (off) {
    out.push(line(cx - 5, cy + 5, cx + 5, cy - 5, OUTLINE, tiny ? 2.4 : 2.6));
    return out.join("");
  }
  out.push(rect(cx - 3.4, cy - 3.4, 6.8, 6.8, SHADE, OUTLINE, 1));
  out.push(line(cx - 3.4, cy - 1.2, cx + 3.4, cy - 1.2, GLOSS, 1));
  if (!tiny) out.push(line(cx - 3.4, cy + 1.2, cx + 3.4, cy + 1.2, GLOSS, 1));
  return out.join("");
}

function clockFace(tiny) {
  const r = tiny ? 9 : 10;
  const out = [`<circle cx="16" cy="16" r="${r}" fill="${PAPER}" stroke="${OUTLINE}" stroke-width="1"/>`];
  out.push(line(16, 16, 16, tiny ? 11 : 10.5, OUTLINE, tiny ? 1.8 : 1.6));
  out.push(line(16, 16, tiny ? 20 : 20.5, 16, OUTLINE, tiny ? 1.8 : 1.6));
  out.push(path(tiny ? "M8 24a10 10 0 0 1-1-9" : "M8.6 24.6A10.4 10.4 0 0 1 6.6 13", "none", DEEP, tiny ? 2 : 2.2));
  if (!tiny) out.push(path("M6.6 17.6l0-4.6 4.6.8", "none", DEEP, 2.2));
  return out.join("");
}

function monitor(tiny) {
  return [
    rect(tiny ? 7 : 6, tiny ? 9 : 8, tiny ? 18 : 20, tiny ? 13 : 14, PAPER, OUTLINE, 1),
    rect(tiny ? 10 : 9, tiny ? 12 : 11, tiny ? 12 : 14, tiny ? 7 : 8, SHADE, OUTLINE, 1),
    tiny ? line(12, 15, 18, 15, PAPER, 2) : line(11, 14, 18, 14, PAPER, 1.6),
    tiny ? "" : line(11, 17.5, 15, 17.5, PAPER, 1.6),
    path(tiny ? "M13 22v3h6v-3" : "M12.5 22v3.5h7V22", "none", OUTLINE, tiny ? 2 : 1.6),
    tiny ? "" : line(10, 25.5, 22, 25.5, OUTLINE, 1.6),
  ].join("");
}

function indexBox(tiny) {
  return [
    rect(tiny ? 7 : 6.5, tiny ? 9 : 8.5, tiny ? 18 : 19, tiny ? 15 : 16, PAPER, OUTLINE, 1),
    rect(tiny ? 18 : 19, tiny ? 11 : 11, tiny ? 6 : 6, tiny ? 11 : 11, SHADE, OUTLINE, 1),
    tiny ? line(10, 14, 16, 14, SHADE, 2) : line(10, 13, 17, 13, SHADE, 1.6),
    tiny ? line(10, 19, 16, 19, SHADE, 2) : line(10, 17, 17, 17, SHADE, 1.6),
  ].join("");
}

function briefcase(tiny) {
  return [
    rect(tiny ? 7 : 6.5, tiny ? 13 : 13, tiny ? 18 : 19, tiny ? 11 : 12, BODY, OUTLINE, 1),
    path(tiny ? "M13 13v-3h6v3" : "M12.5 13V9.4h7V13", "none", OUTLINE, tiny ? 2 : 1.6),
    tiny ? line(7, 19, 25, 19, OUTLINE, 1.6) : line(6.5, 19, 25.5, 19, OUTLINE, 1.6),
  ].join("");
}

function bell(tiny) {
  return [
    path(tiny ? "M10 22c1-2 1.6-4 1.6-6 0-3 1.6-5 4.4-5s4.4 2 4.4 5c0 2 .6 4 1.6 6z"
      : "M9.5 22.5c1.4-2.2 2-4.4 2-6.6 0-3.2 1.9-5.4 4.5-5.4s4.5 2.2 4.5 5.4c0 2.2.6 4.4 2 6.6z",
    PAPER, OUTLINE, 1),
    tiny ? line(9, 22, 23, 22, OUTLINE, 2) : line(8.6, 22.5, 23.4, 22.5, OUTLINE, 1.8),
    `<circle cx="16" cy="${tiny ? 24 : 25}" r="${tiny ? 1.8 : 2}" fill="${DEEP}"/>`,
  ].join("");
}

function knobBoard(tiny) {
  return [
    rect(tiny ? 6 : 5.5, tiny ? 12 : 11.5, tiny ? 20 : 21, tiny ? 13 : 14, BODY, OUTLINE, 1),
    `<circle cx="${tiny ? 12 : 11.5}" cy="${tiny ? 18 : 18.5}" r="${tiny ? 3.4 : 3.8}" fill="${PAPER}" stroke="${OUTLINE}" stroke-width="1"/>`,
    `<circle cx="${tiny ? 20 : 20.5}" cy="${tiny ? 18 : 18.5}" r="${tiny ? 3.4 : 3.8}" fill="${PAPER}" stroke="${OUTLINE}" stroke-width="1"/>`,
    line(tiny ? 12 : 11.5, tiny ? 18 : 18.5, tiny ? 12 : 11.5, tiny ? 15 : 15.4, DEEP, tiny ? 2 : 1.8),
    line(tiny ? 20 : 20.5, tiny ? 18 : 18.5, tiny ? 22 : 23, tiny ? 21 : 21.4, DEEP, tiny ? 2 : 1.8),
  ].join("");
}

function chip(tiny) {
  const pins = [];
  for (const offset of tiny ? [-4, 4] : [-5, 0, 5]) {
    pins.push(line(16 + offset, tiny ? 9 : 8, 16 + offset, tiny ? 12 : 11.5, OUTLINE, tiny ? 1.6 : 1.4));
    pins.push(line(16 + offset, tiny ? 20 : 20.5, 16 + offset, tiny ? 23 : 24, OUTLINE, tiny ? 1.6 : 1.4));
    pins.push(line(tiny ? 9 : 8, 16 + offset, tiny ? 12 : 11.5, 16 + offset, OUTLINE, tiny ? 1.6 : 1.4));
    pins.push(line(tiny ? 20 : 20.5, 16 + offset, tiny ? 23 : 24, 16 + offset, OUTLINE, tiny ? 1.6 : 1.4));
  }
  return [
    rect(tiny ? 11 : 11.5, tiny ? 11 : 11.5, tiny ? 10 : 9, tiny ? 10 : 9, BODY, OUTLINE, 1),
    rect(tiny ? 14 : 14, tiny ? 14 : 14, tiny ? 4 : 4, tiny ? 4 : 4, DEEP),
    ...pins,
  ].join("");
}

function stripSurface(tiny) {
  const out = [rect(tiny ? 5 : 4.5, tiny ? 14 : 13.5, tiny ? 22 : 23, tiny ? 9 : 10, BODY, OUTLINE, 1)];
  for (const [index, x] of (tiny ? [10, 16, 22] : [9.5, 16, 22.5]).entries()) {
    out.push(`<circle cx="${x}" cy="${tiny ? 18 : 18.5}" r="${tiny ? 1.8 : 2}" fill="${index === 1 ? DEEP : PAPER}" stroke="${OUTLINE}" stroke-width="0.8"/>`);
  }
  return out.join("");
}

function labGlyph(id, tiny) {
  if (id === "clioStage") {
    return [
      rect(tiny ? 7 : 6.5, tiny ? 11 : 10.5, tiny ? 18 : 19, tiny ? 13 : 14, PAPER, OUTLINE, 1),
      path(tiny ? "M14 15l5 3-5 3z" : "M13.6 14.6l6 3.9-6 3.9z", DEEP, OUTLINE, 1),
    ].join("");
  }
  if (id === "clioChart") {
    return [
      rect(tiny ? 7 : 6.5, tiny ? 9 : 8.5, tiny ? 18 : 19, tiny ? 14 : 15, PAPER, OUTLINE, 1),
      rect(tiny ? 10 : 9.5, tiny ? 17 : 16.5, tiny ? 3 : 3.4, tiny ? 5 : 6, DEEP),
      rect(tiny ? 15 : 14.6, tiny ? 13 : 12.5, tiny ? 3 : 3.4, tiny ? 9 : 10, SHADE),
      rect(tiny ? 20 : 19.7, tiny ? 15 : 15, tiny ? 3 : 3.4, tiny ? 7 : 7.5, DEEP),
      path(tiny ? "M10 23l-3 4M22 23l3 4" : "M10 23.5l-3.4 4.5M22 23.5l3.4 4.5", "none", OUTLINE, tiny ? 1.8 : 1.6),
    ].join("");
  }
  if (id === "liquidCover") {
    return [
      rect(tiny ? 9 : 8.5, tiny ? 7 : 6.5, tiny ? 15 : 16, tiny ? 19 : 20, PAPER, OUTLINE, 1),
      rect(tiny ? 9 : 8.5, tiny ? 7 : 6.5, tiny ? 4 : 4, tiny ? 19 : 20, SHADE, OUTLINE, 1),
      tiny ? line(14, 13, 22, 13, SHADE, 2) : line(14, 12, 23, 12, SHADE, 1.6),
      tiny ? line(14, 18, 22, 18, SHADE, 2) : line(14, 16.5, 23, 16.5, SHADE, 1.6),
    ].join("");
  }
  if (id === "cmfStudio") {
    return [
      rect(tiny ? 8 : 7.5, tiny ? 12 : 11.5, tiny ? 6 : 7, tiny ? 6 : 7, PAPER, OUTLINE, 1),
      rect(tiny ? 15 : 15, tiny ? 9 : 8.5, tiny ? 6 : 7, tiny ? 6 : 7, SHADE, OUTLINE, 1),
      rect(tiny ? 12 : 12, tiny ? 19 : 19, tiny ? 6 : 7, tiny ? 6 : 7, DEEP, OUTLINE, 1),
    ].join("");
  }
  if (id === "soundscape") {
    return [
      path(tiny ? "M11 14h3l4-3v10l-4-3h-3z" : "M10.5 13.8h3.2l4.3-3.3v11l-4.3-3.3h-3.2z", PAPER, OUTLINE, 1),
      path(tiny ? "M20 14a4 4 0 0 1 0 4" : "M20 13.4a4.4 4.4 0 0 1 0 5.2", "none", DEEP, tiny ? 2 : 2.2),
      tiny ? "" : path("M22.4 11.6a7.4 7.4 0 0 1 0 8.8", "none", SHADE, 1.8),
    ].join("");
  }
  if (id === "multiFinderApp") {
    return [
      rect(tiny ? 12 : 12, tiny ? 8 : 7.5, tiny ? 12 : 13, tiny ? 12 : 13, SHADE, OUTLINE, 1),
      rect(tiny ? 8 : 7.5, tiny ? 12 : 11.5, tiny ? 12 : 13, tiny ? 12 : 13, PAPER, OUTLINE, 1),
      tiny ? "" : line(9.5, 15, 18, 15, SHADE, 1.4),
    ].join("");
  }
  if (id === "cloudModel") return cloudModel(tiny, false);
  if (id === "cloudModelOff") return cloudModel(tiny, true);
  if (id === "timeMachine") return clockFace(tiny);
  if (id === "systemStatus") return monitor(tiny);
  if (id === "contextPanel") return indexBox(tiny);
  if (id === "daHandler") return briefcase(tiny);
  if (id === "writingBell") return bell(tiny);
  if (id === "control") return knobBoard(tiny);
  if (id === "localModel") return chip(tiny);
  return stripSurface(tiny);
}

function isPlated(id) {
  return NEXTSTEP_UTILITY_ICON_IDS.includes(id)
    || NEXTSTEP_DESK_ICON_IDS.includes(id)
    || NEXTSTEP_FILE_ICON_IDS.includes(id)
    || id === "finderApp"
    || ["clioStage", "clioChart", "liquidCover", "cmfStudio", "soundscape", "multiFinderApp"].includes(id);
}

/**
 * @param {string} id one of NEXTSTEP_CORE_ICON_IDS
 * @param {number} size the pixel size the artwork is authored for
 * @returns {string} an SVG document
 */
export function nextstepCoreArtwork(id, size) {
  if (!NEXTSTEP_AUTHORED_ICON_IDS.includes(id)) throw new Error(`Not a NeXTSTEP authored object: ${id}`);
  if (!Number.isFinite(size) || size < 1 || size > 1024) throw new Error("Icon size must be between 1 and 1024");
  const tiny = size <= 16;
  const art = NEXTSTEP_UTILITY_ICON_IDS.includes(id) ? plate() + utilityGlyph(id, tiny)
    : NEXTSTEP_DESK_ICON_IDS.includes(id) ? plate() + deskGlyph(id, tiny)
    : NEXTSTEP_FILE_ICON_IDS.includes(id) ? plate() + fileGlyph(id, tiny)
    : NEXTSTEP_LAST_ICON_IDS.includes(id) ? (isPlated(id) ? plate() : "") + labGlyph(id, tiny)
    : id === "finderApp" ? plate() + appGlyph(tiny)
    : id === "folder" ? folder(tiny)
      : id === "document" ? document(tiny)
        : id === "hardDisk" ? hardDisk(tiny)
          : trash({ full: id === "trashFull", tiny });
  const crisp = tiny ? ' shape-rendering="crispEdges"' : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"${crisp}>`
    + `<title>${id}: original NeXTSTEP 3.3 period adaptation</title>${art}</svg>`;
}
