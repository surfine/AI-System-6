// ClioPaint — the first Claris piece, a 1-bit painting surface in the
// MacPaint lineage, plus 草图变大纲 (sketch to outline).
//
// This contract holds four things: the module is lazy and actually
// reachable (not just listed), the window is declared through the registry
// rather than improvised, drawing state round-trips through the EXISTING
// imageAttachments store (no new persistence boundary), and sketch-to-outline
// routes its answer through the Outline's own guardrail and validated funnel
// rather than inventing a second one, with an AI run receipt recorded either
// way. See internal/evidence/drafts/sketch-to-outline/index.html for the
// prior design draft whose reading-mechanics evidence this reuses.

import vm from "node:vm";

import { admissionRows, createFeatureTest, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";
import { lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";
import { lazyStyleBundles } from "../../tooling/style-manifest.mjs";
import { windowInterfaceRegistry } from "../../tooling/interface-guidelines-contract.mjs";

const test = createFeatureTest("clio-paint");

const source = read("app/features/clio-paint.js");
const config = read("app/core/config.js");
const html = read("index.html");
const actions = read("app/core/actions.js");
const multiFinder = read("app/core/multi-finder.js");
const windowManager = read("app/core/window-manager.js");
const icons = read("app/core/system-icons.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// ---- Lazy, and actually reachable -------------------------------------------
test.assert(lazyRuntimePaths.includes("app/features/clio-paint.js"), "the module is a lazy runtime file, not a boot cost");
test.assertIncludes(
  config,
  'createLazyModuleLoader("AISystem6ClioPaintLoaded", ["app/core/application-shell.js", "app/core/edit-history.js", "app/core/edit-snap.js", "app/core/edit-layers.js", "app/core/edit-assets.js", "app/core/edit-embeds.js", "app/features/clio-paint.js"], false, ["styles.clio-paint.css", "styles.edit-kernel.css"])',
  "one loader names the shell, the module, and its stylesheet together"
);
test.assertIncludes(read("app/core/app-admissions.js"), '"open-clio-paint"', "the opener is admitted with its loader, so the first click loads the module");
test.assertIncludes(source, "window.AISystem6ClioPaintLoaded = true;", "the module installs its loaded flag");

const clioPaintStyleBundle = lazyStyleBundles.find((bundle) => bundle.id === "clio-paint");
test.assert(!!clioPaintStyleBundle, "a lazy style bundle is declared for ClioPaint");
test.assert(clioPaintStyleBundle?.output === "styles.clio-paint.css", "its output name matches what the loader requests");

// ---- The window is declared, not improvised ---------------------------------
const record = windowRegistryRecords().clioPaint;
test.assert(!!record, "clioPaint has a window-registry record");
test.assert(record.app === "clioPaint", "and it declares its own application id");
test.assert(record.builtByModule === true, "the markup is built by the module, not shipped in index.html on every boot");
test.assert(!!record.lazy, "the registry knows the window arrives lazily");
test.assertIncludes(source, 'function installClioPaintWindow()', "the module builds its own window, following ClioProject's pattern");
test.assertNotIncludes(html, 'data-window="clioPaint"', "the window is not duplicated as static markup in index.html");

test.assertIncludes(read("app/core/app-admissions.js"), 'multiFinder: "ClioPaint"', "MultiFinder can name the running application from the admission table");
test.assert(
  admissionRows().clioPaint?.phone === 1,
  "the phone shell covers ClioPaint like its sibling creative labs (its admission row)"
);
test.assertIncludes(html, 'data-action="open-clio-paint"', "Applications lists the opener beside the other Clio- applications");
test.assertIncludes(icons, "clioPaint: `", "a system icon is registered for ClioPaint");
test.assert(windowInterfaceRegistry.clioPaint?.role === "creative-lab", "the interface guidelines register ClioPaint as a creative lab");

// ---- The naming law: ClioPaint is untranslated in both languages -----------
test.assertMatches(en, /clio_paint_label: "ClioPaint"/, "the English label is exactly ClioPaint");
test.assertMatches(zh, /clio_paint_label: "ClioPaint/, "the Chinese label keeps ClioPaint untranslated, like its Clio- siblings");

// ---- Storage: the EXISTING imageAttachments store, no new boundary ---------
test.assertIncludes(source, 'surface: "clioPaint"', "pictures are tagged with their own surface on the shared store");
test.assertIncludes(source, "buildImageAttachments(", "saving reuses the existing attachment builder");
test.assertIncludes(source, "assets.saveStaged(", "saving reuses the existing attachment writer, through the edit kernel's staged-picture helper");
test.assertIncludes(source, "assets.keepAssetGroup(pictureId, pictureId)", "and keeps the layers only once the composite is in");
test.assertIncludes(source, "imageAttachmentsForProject(", "loading reuses the existing per-project reader");
test.assertNotMatches(source, /indexedDB\.open|createObjectStore/i, "no new IndexedDB store is introduced");
test.assertIncludes(
  source,
  "if (clioPaintState.attachmentId) record.id = clioPaintState.attachmentId;",
  "re-saving updates the same attachment record instead of piling up copies"
);
test.assertIncludes(
  source,
  "record?.originalDataUrl || canvas.toDataURL",
  "a sketch read uses the lossless original, not the compressed JPEG preview"
);

// ---- Sketch to Outline: the SAME funnel, the SAME guardrail, a receipt -----
test.assertIncludes(source, "ensureOutlineClaimModule", "the Outline's own lazy module is ensured before its entry points are called");
test.assertIncludes(source, "validateGeneratedWritingOutline(markdown)", "the model's answer is checked by the Outline's own guardrail, not a new one");
test.assertIncludes(source, "confirmAndApplyAiOutline(", "applying the result goes through the Outline's own confirm-and-apply entry point");
test.assertNotIncludes(source, "function validateGeneratedWritingOutline", "ClioPaint does not carve its own copy of the guardrail into outline-claim.js");
test.assertNotIncludes(source, "function confirmAndApplyAiOutline", "ClioPaint does not carve its own copy of the apply funnel into outline-claim.js");
test.assertIncludes(source, "window.AISystem6RunReceipts?.createReceipt", "a sketch read opens a run receipt");
test.assertMatches(source, /finishReceipt\(receiptId, \{\s*status: "completed"/, "a successful read closes its receipt");
test.assertMatches(source, /status: "failed", publicErrorReason: rawReason/, "a failed read closes its receipt honestly instead of leaving it running");

// ---- The four loss-stop rules from the evidence draft ----------------------
// (1) the sketch never writes back to itself -- the result panel is a
// one-shot read, dismissible, never bound back to the canvas.
test.assertIncludes(source, "function hideClioPaintResult()", "the result panel is dismissible, not a permanent second surface");
// (2) an always-visible "could not read" acknowledgment, never silently
// dropped -- rendered every time, even when nothing was unreadable.
test.assertIncludes(source, "clio_paint_unread_empty", "the unreadable-parts note renders even when nothing was flagged");
// (3) the model is told not to invent more chapters than it can see boxes for.
test.assertMatches(source, /Do not output more sections than you can clearly make out/, "the prompt tells the model to under-produce rather than invent");
test.assertMatches(source, /章节数不要超过图里能看清的方框数/, "the Chinese prompt carries the same under-produce instruction");
// (4) nothing here reaches into the writing route on its own -- applying is
// one explicit writer click (clio-paint-result-apply), never automatic. The
// apply funnel is called from exactly one place: the dedicated apply command,
// not from the read itself.
test.assert(
  (source.match(/confirmAndApplyAiOutline\(/g) || []).length === 1,
  "the apply funnel is called from exactly one place"
);
test.assertMatches(
  source,
  /async function applyClioPaintOutlineResult\(\)\s*\{[\s\S]*?confirmAndApplyAiOutline\(/,
  "applying the outline is its own explicit command, not folded into the read itself"
);
const sketchReadBody = source.slice(
  source.indexOf("async function clioPaintRunSketchRead"),
  source.indexOf("function runClioPaintSketchToOutline"),
);
test.assertNotIncludes(sketchReadBody, "confirmAndApplyAiOutline(", "the read step never applies the outline on its own");

// ---- Pure logic, executed: the unread-note split and its empty check -------
const pureSlice = source.slice(source.indexOf("function splitClioPaintUnreadNote"), source.indexOf("function renderClioPaintResult"));
const context = vm.createContext({});
vm.runInContext(pureSlice, context);
const splitClioPaintUnreadNote = vm.runInContext("splitClioPaintUnreadNote", context);
const clioPaintUnreadIsEmpty = vm.runInContext("clioPaintUnreadIsEmpty", context);

const withUnread = splitClioPaintUnreadNote("## Setup\n## Payoff\nCould not read: the bottom-left corner");
test.assert(withUnread.markdown === "## Setup\n## Payoff", "the unread line is stripped from the outline markdown");
test.assert(withUnread.unread === "the bottom-left corner", "and captured on its own");
test.assert(!clioPaintUnreadIsEmpty(withUnread.unread), "a real note is not treated as empty");

const withoutUnread = splitClioPaintUnreadNote("## Setup\n## Payoff\nCould not read: none");
test.assert(withoutUnread.markdown === "## Setup\n## Payoff", "a 'none' unread line still comes off the outline");
test.assert(clioPaintUnreadIsEmpty(withoutUnread.unread), "'none' reads as nothing unreadable");
test.assert(clioPaintUnreadIsEmpty(""), "a missing note also reads as nothing unreadable");

const zhUnread = splitClioPaintUnreadNote("## 开场\n## 收尾\n读不出：涂改的那一块");
test.assert(zhUnread.markdown === "## 开场\n## 收尾", "the Chinese unread line is stripped the same way");
test.assert(zhUnread.unread === "涂改的那一块", "and captured the same way");
test.assert(clioPaintUnreadIsEmpty(splitClioPaintUnreadNote("## 开场\n读不出：无").unread), "'无' reads as nothing unreadable");

// ---- New, asked of a picture that is already new ---------------------------
// The window says "New picture." from the moment it opens, so New on an
// untouched canvas repainted nothing and repeated a sentence already on
// screen: to a person that is the same event as a command that is broken.
test.assertIncludes(
  source,
  "const alreadyNew = !clioPaintState.dirty && !clioPaintState.attachmentId;",
  "New asks whether there is anything to clear before it clears it"
);
test.assertIncludes(
  source,
  'statusLabel.textContent = t("clio_paint_status_already_new")',
  "and answers in the window's own status line when there was not"
);
test.assert(
  en.includes("clio_paint_status_already_new:") && zh.includes("clio_paint_status_already_new:"),
  "clio_paint_status_already_new exists in both languages"
);

// ---- Bits, tiles, layers and masks, executed -------------------------------
//
// The picture is a stack of 1-bit layers, and history keeps 64x64 tiles
// instead of whole pictures. All of that arithmetic is pure, so it runs here
// against real buffers: everything between the "Pure" and "end of pure"
// markers needs no canvas, no window and no state.
const tilesSlice = source.slice(
  source.indexOf("// ---- Pure: bits, tiles"),
  source.indexOf("// ---- end of pure")
);
const pureContext = vm.createContext({ console });
vm.runInContext(read("app/core/edit-history.js"), pureContext, { filename: "app/core/edit-history.js" });
vm.runInContext(tilesSlice, pureContext);
vm.runInContext(
  source.slice(source.indexOf("function clioPaintPointInPolygon"), source.indexOf("function clioPaintShapeGlyph")),
  pureContext
);
vm.runInContext(
  source.slice(source.indexOf("/** The polygon's coverage as a selection"), source.indexOf("/** Whether the pointer may change the active layer")),
  pureContext
);
const pure = (name) => vm.runInContext(name, pureContext);
const packImageData = pure("clioPaintPackImageData");
const applyPackedBits = pure("clioPaintApplyPackedBits");
const bitsEqual = pure("clioPaintBitsEqual");

function fakeImageData(width, height) {
  const image = { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
  return image;
}
function setPixel(image, x, y, channels) {
  const [r, g, b, a = 255] = channels;
  const i = (y * image.width + x) * 4;
  image.data[i] = r;
  image.data[i + 1] = g;
  image.data[i + 2] = b;
  image.data[i + 3] = a;
}

// The number the module's own rationale is built on: 480x300 is eight pixels
// to the byte, so a layer is 18 KB and not 576 KB.
test.assert(
  packImageData(fakeImageData(480, 300)).length === 18_000,
  "a layer of the real 480x300 document packs to 18 KB"
);

// A round trip has to make the same decisions packing made: black stays
// black, white stays white, and an antialiased or transparent pixel — which a
// 1-bit picture cannot hold — comes back white rather than becoming an edge.
const pictured = fakeImageData(5, 3);
setPixel(pictured, 0, 0, [0, 0, 0]);
setPixel(pictured, 4, 2, [40, 40, 40]);
setPixel(pictured, 1, 1, [200, 200, 200]);
setPixel(pictured, 2, 1, [0, 0, 0, 0]);
const pictureBits = packImageData(pictured);
const restored = applyPackedBits(fakeImageData(5, 3), pictureBits);
const pixel = (image, x, y) => [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];
test.assert(pictureBits.length === 2, "a 5x3 picture packs into two bytes, not fifteen pixels");
test.assert(pixel(restored, 0, 0).join() === "0,0,0,255", "a black pixel comes back black and opaque");
test.assert(pixel(restored, 4, 2).join() === "0,0,0,255", "a dark pixel comes back black");
test.assert(pixel(restored, 1, 1).join() === "255,255,255,255", "an antialiased edge comes back white, not gray");
test.assert(pixel(restored, 2, 1).join() === "255,255,255,255", "a transparent pixel comes back white, not black");
test.assert(pixel(restored, 3, 0).join() === "255,255,255,255", "everything untouched stays white");
test.assert(
  packImageData(restored).join() === pictureBits.join(),
  "packing a restored layer gives the same layer back, so undo cannot drift"
);
test.assert(bitsEqual(pictureBits, pictureBits.slice()) && !bitsEqual(pictureBits, new Uint8Array(pictureBits.length)), "layer comparison answers both ways");

// Tiles. A page 200x130 is a 4x3 grid of 64-pixel tiles with ragged edges.
vm.runInContext(`
  var W = 200, H = 130;
  var blank = () => ({ width: W, height: H, bits: new Uint8Array(Math.ceil(W * H / 8)) });
  var put = (doc, x, y, v = 1) => { const p = y * W + x; if (v) doc.bits[p >> 3] |= 128 >> (p & 7); else doc.bits[p >> 3] &= ~(128 >> (p & 7)); };
  var get = (doc, x, y) => { const p = y * W + x; return (doc.bits[p >> 3] >> (7 - (p & 7))) & 1; };
`, pureContext);
const run = (code) => vm.runInContext(code, pureContext);

test.assert(
  run(`(() => { const d = blank(); return clioPaintExtractTile(d, 1, 1) === null && clioPaintTilesOfDoc(d).size === 0; })()`),
  "an empty page has no tiles at all, so a blank layer costs nothing to keep"
);
test.assert(
  run(`(() => {
    const d = blank(); put(d, 70, 66); put(d, 199, 129); put(d, 0, 0);
    const keys = [...clioPaintTilesOfDoc(d).keys()].sort().join("|");
    return keys === "0,0|1,1|3,2";
  })()`),
  "ink lands in the tile that holds it, including the ragged last column and row"
);
test.assert(
  run(`(() => {
    const d = blank();
    for (let i = 0; i < 300; i += 1) put(d, (i * 37) % W, (i * 53) % H);
    const copy = blank();
    clioPaintTilesOfDoc(d).forEach((tile, key) => { const { tx, ty } = clioPaintTileCoords(key); clioPaintWriteTile(copy, tx, ty, tile); });
    return clioPaintBitsEqual(d.bits, copy.bits);
  })()`),
  "writing every tile back reproduces the bitmap bit for bit"
);
test.assert(
  run(`(() => {
    const d = blank(); put(d, 10, 10); put(d, 150, 100);
    const tile = clioPaintExtractTile(d, 0, 0);
    clioPaintWriteTile(d, 0, 0, null);
    return get(d, 10, 10) === 0 && get(d, 150, 100) === 1 && tile.length === 512;
  })()`),
  "writing an empty tile clears only that tile, and a tile is 512 bytes (64 rows of 8)"
);

// Changed-tile detection.
const changed = run(`(() => {
  const before = blank();
  const after = blank(); after.bits.set(before.bits); put(after, 130, 2);
  const one = [...clioPaintChangedTileKeys(before.bits, after.bits, W, H)];
  const two = blank(); put(two, 5, 5); put(two, 190, 125);
  const many = [...clioPaintChangedTileKeys(before.bits, two.bits, W, H)].sort();
  return { one, many, none: clioPaintChangedTileKeys(before.bits, before.bits, W, H).size };
})()`);
test.assert(changed.one.length === 1 && changed.one[0] === "2,0", "a one-pixel change names exactly one tile");
test.assert(changed.many.join("|") === "0,0|2,1", "two distant changes name their two tiles, and only those");
test.assert(changed.none === 0, "identical bitmaps differ in no tile");

// Snapshots share what they did not change, and cost what they did.
const costs = run(`(() => {
  const d = blank();
  for (let y = 0; y < 128; y += 7) for (let x = 0; x < 128; x += 5) put(d, x, y);
  const layer = { id: "a", name: "A", kind: "ink", visible: true, locked: false, doc: d };
  const s0 = clioPaintSnapshotOfLayers([layer], W, H);
  // a one-pixel stroke inside a tile that already has ink
  const pending = d.bits.slice();
  put(d, 3, 3);
  const keys = clioPaintChangedTileKeys(pending, d.bits, W, H);
  const s1 = clioPaintSnapshotReplaceLayer(s0, "a", { tiles: clioPaintDeriveTiles(s0.layers[0].tiles, d, keys) });
  clioPaintLinkSnapshots(s0, s1);
  const untouched = [...s0.layers[0].tiles.keys()].filter((key) => s0.layers[0].tiles.get(key) === s1.layers[0].tiles.get(key)).length;
  return {
    tilesBefore: s0.layers[0].tiles.size,
    keys: keys.size,
    shared: untouched,
    older: clioPaintSnapshotWeight(s0, "older"),
    newer: clioPaintSnapshotWeight(s1, "newer"),
    whole: clioPaintSnapshotCost(s0, null),
    equal: clioPaintSnapshotsEqual(s0, s1),
    self: clioPaintSnapshotsEqual(s1, s1),
  };
})()`);
test.assert(costs.keys === 1 && costs.tilesBefore === 4, "the stroke touches one tile of the four that hold ink");
test.assert(costs.shared === costs.tilesBefore - 1, "the next snapshot shares the other tiles by identity instead of copying them");
test.assert(
  costs.older === 96 + (512 + 32) + 32 && costs.newer === costs.older,
  "a one-pixel stroke on a large page costs one tile (plus the note of its replacement), either way you look at it"
);
test.assert(costs.whole > costs.older * 3, "against a full-picture copy, which costs every tile");
test.assert(!costs.equal && costs.self, "snapshots compare by their tiles");

// The history around it: restoring exact bits, and eviction by bytes.
const historyRun = run(`(() => {
  const d = blank();
  const layer = { id: "a", name: "A", kind: "ink", visible: true, locked: false, doc: d };
  let state = { snapshot: clioPaintSnapshotOfLayers([layer], W, H), layers: [layer] };
  let mode = "older";
  const history = AISystem6EditHistory.createEditHistory({
    read: () => state.snapshot,
    write: (snapshot) => { state.layers = clioPaintLayersFromSnapshot(state.layers, state.snapshot, snapshot); state.snapshot = snapshot; },
    equals: (a, b) => a === b,
    limit: 100,
    weigh: (snapshot) => clioPaintSnapshotWeight(snapshot, mode),
    budget: 3000,
  });
  const stroke = (x, y) => {
    const live = state.layers[0].doc;
    const pending = live.bits.slice();
    put(live, x, y);
    const keys = clioPaintChangedTileKeys(pending, live.bits, W, H);
    history.change("stroke", () => {
      const prev = state.snapshot;
      const next = clioPaintSnapshotReplaceLayer(prev, "a", { tiles: clioPaintDeriveTiles(prev.layers[0].tiles, live, keys) });
      clioPaintLinkSnapshots(prev, next);
      state.snapshot = next;
    });
  };
  const travel = (dir) => { mode = dir === "undo" ? "newer" : "older"; try { return history[dir](); } finally { mode = "older"; } };
  const bitsNow = () => [...state.layers[0].doc.bits].join();
  const out = {};
  const empty = bitsNow();
  stroke(3, 3); const one = bitsNow();
  stroke(70, 3); stroke(3, 70); const three = bitsNow();
  out.depth = history.size().undo;
  travel("undo"); travel("undo"); travel("undo");
  out.backToEmpty = bitsNow() === empty && !history.canUndo();
  travel("redo"); out.afterRedo = bitsNow() === one;
  travel("redo"); travel("redo"); out.redoneAll = bitsNow() === three;
  // keep going until the budget bites
  for (let i = 0; i < 40; i += 1) stroke((i * 11) % 190, (i * 17) % 125);
  const size = history.size();
  out.bytes = size.weight;
  out.steps = size.undo;
  out.canUndoAfterEviction = history.canUndo();
  let undone = 0;
  while (history.canUndo()) { travel("undo"); undone += 1; }
  out.undone = undone;
  out.sameDoc = state.layers[0].doc === d;
  return out;
})()`);
test.assert(historyRun.depth === 3, "three strokes are three steps");
test.assert(historyRun.backToEmpty, "undoing every stroke restores the exact empty bitmap");
test.assert(historyRun.afterRedo && historyRun.redoneAll, "redo restores the exact bits again");
test.assert(historyRun.bytes <= 3000 + 700, "past the budget the history holds about a budget of tiles, not forty-three steps' worth");
test.assert(historyRun.steps < 43 && historyRun.steps >= 1, "so the oldest steps were dropped to stay in it");
test.assert(historyRun.undone === historyRun.steps && historyRun.canUndoAfterEviction, "and every step that is left can still be undone");
test.assert(historyRun.sameDoc, "undo rewrites tiles in the layer's own bitmap rather than swapping it out");

// Layer operations are pure functions of a snapshot.
const layerOps = run(`(() => {
  const mk = (id, x, y) => { const d = blank(); put(d, x, y); return { id, name: id, kind: "ink", visible: true, locked: false, doc: d }; };
  const a = mk("a", 3, 3), b = mk("b", 70, 70), c = mk("c", 4, 3);
  const s = clioPaintSnapshotOfLayers([a, b, c], W, H);
  const dup = clioPaintSnapshotDuplicateLayer(s, "b", "b2", "b copy");
  const merged = clioPaintSnapshotMergeDown(s, "c");
  const moved = clioPaintSnapshotMoveLayer(s, "a", 2);
  const removed = clioPaintSnapshotRemoveLayer(s, "b");
  const lastOnly = clioPaintSnapshotRemoveLayer(clioPaintSnapshotOfLayers([a], W, H), "a");
  const tracing = clioPaintSnapshotReplaceLayer(s, "b", { kind: "tracing" });
  const mergeIntoTracing = clioPaintSnapshotMergeDown(tracing, "c");
  const mergeBottom = clioPaintSnapshotMergeDown(s, "a");
  const composite = clioPaintComposite([
    { kind: "ink", visible: true, bits: a.doc.bits },
    { kind: "tracing", visible: true, bits: b.doc.bits },
    { kind: "ink", visible: false, bits: c.doc.bits },
  ]);
  const bitAt = (bits, x, y) => (bits[(y * W + x) >> 3] >> (7 - ((y * W + x) & 7))) & 1;
  const mergedDoc = clioPaintLayersFromSnapshot([a, b, c], s, merged)[1].doc;
  return {
    dupOrder: dup.layers.map((l) => l.id).join(),
    dupShares: dup.layers[2].tiles === dup.layers[1].tiles,
    mergedOrder: merged.layers.map((l) => l.id).join(),
    mergedBoth: bitAt(mergedDoc.bits, 70, 70) === 1 && bitAt(mergedDoc.bits, 4, 3) === 1,
    movedOrder: moved.layers.map((l) => l.id).join(),
    removedOrder: removed.layers.map((l) => l.id).join(),
    lastOnly, mergeIntoTracing, mergeBottom,
    inkHasA: bitAt(composite.ink, 3, 3), inkHasHidden: bitAt(composite.ink, 4, 3), inkHasTracing: bitAt(composite.ink, 70, 70),
    traceHas: bitAt(composite.trace, 70, 70),
    boundsA: JSON.stringify(clioPaintInkBounds(a.doc)),
    boundsEmpty: clioPaintInkBounds(blank()),
    tracingKind: tracing.layers[1].kind,
  };
})()`);
test.assert(layerOps.dupOrder === "a,b,b2,c" && layerOps.dupShares, "a duplicate lands one above its original and shares the original's tiles");
test.assert(layerOps.mergedOrder === "a,b" && layerOps.mergedBoth, "merge down folds the upper layer's ink into the one below");
test.assert(layerOps.movedOrder === "b,c,a" && layerOps.removedOrder === "a,c", "layers restack and delete by id");
test.assert(layerOps.lastOnly === null, "the last layer cannot be deleted");
test.assert(layerOps.mergeIntoTracing === null && layerOps.mergeBottom === null, "nothing merges into a tracing layer or below the bottom");
test.assert(layerOps.inkHasA === 1 && layerOps.inkHasHidden === 0, "the picture is the shown ink layers: a hidden layer is not in it");
test.assert(layerOps.inkHasTracing === 0 && layerOps.traceHas === 1, "a tracing layer is never part of the picture, only of the guides");
test.assert(layerOps.boundsA === '{"x":3,"y":3,"w":1,"h":1}' && layerOps.boundsEmpty === null, "a layer's content box is the box around its ink, null when empty");
test.assert(layerOps.tracingKind === "tracing", "a layer can be turned into a tracing guide");

// Selection masks combine.
const masks = run(`(() => {
  const rect = clioPaintRectSelection;
  const count = (s) => (s ? s.cover.reduce((a, b) => a + b, 0) : 0);
  const a = rect(0, 0, 10, 10), b = rect(5, 5, 10, 10);
  const add = clioPaintCombineSelection(a, b, "add");
  const sub = clioPaintCombineSelection(a, b, "subtract");
  const both = clioPaintCombineSelection(a, b, "intersect");
  const none = clioPaintCombineSelection(rect(0, 0, 3, 3), rect(10, 10, 3, 3), "intersect");
  const swallowed = clioPaintCombineSelection(rect(2, 2, 3, 3), rect(0, 0, 10, 10), "subtract");
  const lasso = clioPaintLassoSelection([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }], 100, 100);
  const lassoOnRect = clioPaintCombineSelection(rect(0, 0, 40, 40), lasso, "subtract");
  const corner = (s, x, y) => s.cover[(y - s.y) * s.w + (x - s.x)];
  return {
    add: [count(add), add.x, add.y, add.w, add.h],
    sub: [count(sub), sub.x, sub.y, sub.w, sub.h, corner(sub, 7, 7), corner(sub, 2, 2)],
    both: [count(both), both.x, both.y, both.w, both.h],
    none, swallowed,
    mode: [clioPaintSelectionMode(false, false), clioPaintSelectionMode(true, false), clioPaintSelectionMode(false, true), clioPaintSelectionMode(true, true)],
    lasso: [count(lasso), lasso.opaque.every((v) => v === 0)],
    lassoHole: count(lassoOnRect),
    replace: clioPaintCombineSelection(a, b, "replace") === b,
    values: add.cover.every((v) => v === 0 || v === 1),
  };
})()`);
test.assert(masks.add.join() === [175, 0, 0, 15, 15].join(), "add is the union of two rectangles, cropped to what is covered");
test.assert(masks.sub.join() === [75, 0, 0, 10, 10, 0, 1].join(), "subtract takes the new region out of the old (the overlap is gone, the rest stays)");
test.assert(masks.both.join() === [25, 5, 5, 5, 5].join(), "intersect keeps only where both cover");
test.assert(masks.none === null && masks.swallowed === null, "a combination that leaves nothing leaves no selection");
test.assert(masks.mode.join() === "replace,add,subtract,intersect", "Shift adds, Option subtracts, both intersect");
test.assert(masks.lasso[0] > 300 && masks.lasso[1], "a lasso covers its polygon and carries only ink (no opaque white)");
test.assert(masks.lassoHole === 1600 - masks.lasso[0], "a lasso subtracted from a rectangle leaves the rectangle minus the polygon");
test.assert(masks.replace && masks.values, "replace swaps the region, and the mask holds only 0 and 1");

// ---- Shift: constrain proportions, executed --------------------------------
//
// What Shift means while a shape is drawn is a rule, not a rendering choice,
// so it is checked as a rule.
const constrainSlice = source.slice(
  source.indexOf("function clioPaintConstrainPoint"),
  source.indexOf("function clioPaintDrawShape")
);
const constrainContext = vm.createContext({});
vm.runInContext(constrainSlice, constrainContext);
const constrainPoint = vm.runInContext("clioPaintConstrainPoint", constrainContext);

const horizontalish = constrainPoint({ x: 10, y: 10 }, { x: 60, y: 14 }, "line", true);
test.assert(horizontalish.y === 10, "a nearly horizontal line snaps flat");
test.assert(horizontalish.x === 60, "and keeps its length");
const diagonal = constrainPoint({ x: 0, y: 0 }, { x: 30, y: 32 }, "line", true);
test.assert(diagonal.x === diagonal.y, "a nearly diagonal line snaps to 45 degrees");
const square = constrainPoint({ x: 10, y: 10 }, { x: 50, y: -5 }, "rect", true);
test.assert(square.x === 50 && square.y === -30, "a rectangle becomes a square, on the side it was dragged to");
const circle = constrainPoint({ x: 20, y: 20 }, { x: 30, y: 45 }, "oval", true);
test.assert(circle.x - 20 === 25 && circle.y - 20 === 25, "an oval becomes a circle");
const freehand = constrainPoint({ x: 10, y: 10 }, { x: 50, y: -5 }, "rect", false);
test.assert(freehand.x === 50 && freehand.y === -5, "with Shift up the shape goes exactly where the pointer is");

// ---- The wiring: what the window claims, and what it leaves alone ----------
test.assertIncludes(source, 'data-action="clio-paint-redo"', "the touch bar carries the other half of undo, for a phone that has no Command-Z");
test.assertIncludes(source, '"clio-paint-redo",', "Redo is a command like every other Paint command");
test.assert(
  en.includes("clio_paint_nothing_to_redo:") && zh.includes("clio_paint_nothing_to_redo:"),
  "a Redo with an empty stack has an answer in both languages"
);
// Undo and Redo arrive through the desk's Edit menu route, not through a key
// the window claims for itself: the capture-phase handler is gone, and the
// window's history is registered where runEditCommand looks for it.
test.assertNotIncludes(source, "handleClioPaintHistoryKeydown", "the window no longer claims Command-Z in the capture phase");
test.assertMatches(
  source,
  /registerEditHistory\("clioPaint", \{\s*undo: undoClioPaint,\s*redo: redoClioPaint,/,
  "Edit > Undo and Redo reach the picture through its registered history"
);
test.assertIncludes(read("app/features/documents-chat.js"), "editHistoryFor()", "and runEditCommand asks that registry when no text field has the focus");
test.assertMatches(
  source,
  /listen\(document, "keydown", handleClioPaintCommandKeydown, \{ capture: true \}\)/,
  "Save and Select All are still claimed by the window, ahead of the desk's dispatcher"
);
test.assertMatches(
  source,
  /function handleClioPaintCommandKeydown\(event\)\s*\{[\s\S]*?key !== "s" && key !== "a"/,
  "and they are the only two keys it claims"
);
test.assert(
  (source.match(/shortcutId: "redo"/g) || []).length === 1,
  "the Paint menu prints the key it actually answers to on its Redo row"
);
test.assertIncludes(source, "clioPaintState.historyApi = null;", "a new or loaded picture starts with an empty history");
test.assertIncludes(source, "clioPaintState.savedSnapshot = snapshot;", "saving records the picture undo is allowed to call saved");
test.assertIncludes(source, "createEditHistory({", "history is the kernel's, not a stack of its own");
test.assertIncludes(source, "budget: CLIO_PAINT_HISTORY_BUDGET", "capped by bytes, oldest steps first");

// Escape cancels the operation under the pointer without writing a step.
const cancelBody = source.slice(
  source.indexOf("function cancelClioPaintOperation"),
  source.indexOf("function clioPaintThreshold")
);
test.assertNotIncludes(cancelBody, "clioPaintCommitHistory(", "a cancelled operation leaves no step behind, so Undo never has to undo it");
test.assertIncludes(cancelBody, "clioPaintRestorePending();", "Escape puts the picture back the way it was");
test.assertMatches(
  source,
  /if \(event\.key === "Escape"\) \{\s*if \(cancelClioPaintOperation\(\)\)/,
  "the window's own Escape handler asks the drawing first, before dropping the marquee"
);

// A selection that can be moved, not only cleared.
test.assertIncludes(source, "function clioPaintBeginSelectionDrag(point)", "a press inside the marquee starts a move");
test.assertMatches(
  source,
  /const moves = !event\.shiftKey && clioPaintBeginSelectionDrag\(point\);\s*if \(moves\) return;\s*if \(tool === "marquee"\) clioPaintBeginMarquee\(point, mode\)/,
  "and a press anywhere else starts a new marquee instead, combining by the modifier held"
);
test.assertIncludes(source, "snapper: clioPaintMoveSnapper()", "a dragged float snaps to the page and to the other layers");
test.assertIncludes(source, "clioPaintDragSelection(point, event.altKey)", "and Option during the drag turns the snapping off");
test.assertIncludes(source, "function clioPaintNudgeSelection(dx, dy)", "the arrow keys move the selection a pixel at a time");
test.assertIncludes(source, "!clioPaintSnapshotsEqual(clioPaintState.snapshot, clioPaintState.savedSnapshot)", "the picture on disk stays the reference for 'unsaved'");
test.assertIncludes(
  source,
  'button.dataset.clioPaintUnavailable = canRun ? "" : control.emptyKey;',
  "a history button that is off records which emptiness turned it off, not just that it is off"
);
test.assertMatches(
  source,
  /function handleClioPaintKeydown\(event\)\s*\{[\s\S]{0,400}?if \(event\.defaultPrevented\) return;/,
  "and Delete, Escape and the arrows stand back from a key an open menu or dialog already answered"
);

// ---- The redesign's structure, executed ------------------------------------
//
// The 2026-09-24 redesign rests on three claims about the palette that are
// rules, not rendering choices, so they run here against the module's own
// data: twenty tools whose last ten are hollow/filled pairs (the reason the
// global "Filled" switch could go), thirty-eight patterns led by white and
// black, and five line widths starting with "no border".
const toolsLiteral = source.slice(source.indexOf("const CLIO_PAINT_TOOLS = ["), source.indexOf("];", source.indexOf("const CLIO_PAINT_TOOLS = [")) + 2);
const tools = vm.runInContext(`${toolsLiteral.replace("const CLIO_PAINT_TOOLS =", "")}`, vm.createContext({}));
test.assert(tools.length === 20, "the palette holds twenty tools, two columns of ten");
test.assert(new Set(tools).size === 20, "and no tool appears twice");
const pairs = tools.slice(10);
test.assert(
  pairs.every((tool, index) => (index % 2 === 0 ? !tool.endsWith("-filled") && pairs[index + 1] === `${tool}-filled` : true)),
  "every row of the lower half is one shape, hollow beside filled"
);
test.assertNotIncludes(source, "shapeFilled", "no global Filled switch survives beside the filled tools");

const patternSlice = source.slice(source.indexOf("const CLIO_PAINT_BAYER"), source.indexOf("clioPaintState.patterns = clioPaintPatternRows();"));
const patternContext = vm.createContext({});
vm.runInContext(patternSlice, patternContext);
const patterns = vm.runInContext("clioPaintPatternRows()", patternContext);
test.assert(patterns.length === 38, "the pattern palette has MacPaint's thirty-eight cells");
test.assert(patterns.every((rows) => rows.length === 8 && rows.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)), "each pattern is eight rows of one byte");
test.assert(patterns[0].every((byte) => byte === 0) && patterns[1].every((byte) => byte === 255), "white and black lead the palette");
test.assert(new Set(patterns.map((rows) => rows.join())).size === 38, "no two cells hold the same pattern");
test.assertMatches(source, /const CLIO_PAINT_LINE_WIDTHS = \[0, 1, 2, 3, 5\];/, "the width box offers no border and four widths");

// ---- A saved picture opens at its own size ----------------------------------
//
// Found while designing the three papers: the loader drew every saved PNG into
// whatever size the canvas already had, so a 576x720 page would have come back
// squeezed into a 480x300 strip. The canvas takes the picture's size.
const loadBody = source.slice(source.indexOf("function loadClioPaintRecord"), source.indexOf("function clioPaintBlankCanvas"));
test.assertIncludes(loadBody, "image.naturalWidth", "loading reads the picture's own width");
test.assertMatches(loadBody, /canvas\.width = width;\s*canvas\.height = height;/, "and sizes the document to it before drawing");
test.assertNotIncludes(loadBody, "drawImage(image, 0, 0, canvas.width, canvas.height)", "instead of stretching it to the canvas it found");
for (const paper of ["clio_paint_paper_banner", "clio_paint_paper_screen", "clio_paint_paper_page"]) {
  test.assert(en.includes(`${paper}:`) && zh.includes(`${paper}:`), `${paper} is named in both languages`);
}

// ---- The menu's check marks come from the module ----------------------------
test.assertIncludes(windowManager, "btn.dataset.clioPaintCheck", "updateMenuState asks one question for every ClioPaint check mark");
test.assertIncludes(windowManager, "window.AISystem6ClioPaint?.menuChecked?.(btn.dataset.clioPaintCheck)", "and the module answers it, so an unloaded module marks nothing");
test.assertIncludes(source, "menuChecked: clioPaintMenuChecked", "the module exposes that answer");

// The JS Paint borrowings are recorded where the mechanism is, so the next
// reader knows why the shape is what it is.
test.assertIncludes(source, "JS Paint", "the module says which precedent it followed");

test.finish();
