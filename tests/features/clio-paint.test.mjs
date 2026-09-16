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

import { createFeatureTest, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";
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
  'createLazyModuleLoader("AISystem6ClioPaintLoaded", ["app/core/application-shell.js", "app/features/clio-paint.js"], false, ["styles.clio-paint.css"])',
  "one loader names the shell, the module, and its stylesheet together"
);
test.assertIncludes(actions, '"open-clio-paint",{ensure:ensureClioPaintModule}', "the opener is a lazy command, so the first click loads the module");
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

test.assertIncludes(multiFinder, 'clioPaint: "ClioPaint"', "MultiFinder can name the running application");
test.assertMatches(
  windowManager,
  /mobileFullScreenAppIds = new Set\(\[(?:(?!\]\))[\s\S])*"clioPaint"/,
  "the phone shell covers ClioPaint like its sibling creative labs"
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
test.assertIncludes(source, "saveImageAttachments(", "saving reuses the existing attachment writer");
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

// ---- History: the packing rule and the stack rule, executed ----------------
//
// The undo stack's whole claim is that a step costs one bit per pixel instead
// of four bytes, and that the stacks behave like stacks (newest last, redo
// cleared by a new edit, oldest dropped at the limit). Both are pure, so both
// run here against real buffers rather than being read as strings. The slice
// is the part of the module that needs no canvas: the limit constant, the
// packing pair, the comparison, and the bookkeeping.
const historySlice = source.slice(
  source.indexOf("const CLIO_PAINT_HISTORY_LIMIT"),
  source.indexOf("function clioPaintToolLabelKey")
);
const historyContext = vm.createContext({});
vm.runInContext(historySlice, historyContext);
const packImageData = vm.runInContext("clioPaintPackImageData", historyContext);
const applyPackedBits = vm.runInContext("clioPaintApplyPackedBits", historyContext);
const bitsEqual = vm.runInContext("clioPaintBitsEqual", historyContext);
const pushHistoryEntry = vm.runInContext("clioPaintPushHistoryEntry", historyContext);

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
// to the byte, so a step is 18 KB and not 576 KB.
test.assert(
  packImageData(fakeImageData(480, 300)).length === 18_000,
  "a step of the real 480x300 document packs to 18 KB"
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
  "packing a restored step gives the same step back, so undo cannot drift"
);
test.assert(bitsEqual(pictureBits, pictureBits.slice()) && !bitsEqual(pictureBits, new Uint8Array(pictureBits.length)), "step comparison answers both ways");

// The stack: newest last, a new edit closes the redo branch, the oldest step
// falls off at the limit.
const history = { past: [], future: [] };
pushHistoryEntry(history, { labelKey: "clio_paint_tool_pencil", bits: pictureBits.slice() });
pushHistoryEntry(history, { labelKey: "clio_paint_tool_fill", bits: pictureBits.slice() });
test.assert(history.past.length === 2, "committing a step puts it on the undo stack");
history.future.push(history.past.pop());
test.assert(history.past.length === 1 && history.future.length === 1, "undo moves a step to the redo stack");
pushHistoryEntry(history, { labelKey: "clio_paint_tool_line", bits: pictureBits.slice() });
test.assert(history.future.length === 0, "drawing something new closes the redo branch");

const longHistory = { past: [], future: [] };
for (let step = 1; step <= 70; step += 1) {
  pushHistoryEntry(longHistory, { labelKey: `step-${step}`, bits: pictureBits.slice() });
}
test.assert(longHistory.past.length === 60, "the undo stack stops at sixty steps instead of growing without bound");
test.assert(longHistory.past[0].labelKey === "step-11", "and it is the oldest step that falls off");
test.assert(longHistory.past[59].labelKey === "step-70", "with the newest still last");

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
test.assertIncludes(source, 'data-action="clio-paint-redo"', "the toolbar carries the other half of undo");
test.assertIncludes(source, '"clio-paint-redo",', "Redo is a command like every other Paint command");
test.assert(
  en.includes("clio_paint_nothing_to_redo:") && zh.includes("clio_paint_nothing_to_redo:"),
  "a Redo with an empty stack has an answer in both languages"
);
test.assertMatches(
  source,
  /clioPaintInstanceResources\(\)\.listen\(document, "keydown", handleClioPaintHistoryKeydown, \{ capture: true \}\)/,
  "undo/redo is claimed in the capture phase, which is what reaches the key before the desk's bubble-phase dispatcher"
);
test.assertMatches(
  source,
  /function handleClioPaintHistoryKeydown\(event\)\s*\{[\s\S]*?event\.preventDefault\(\)/,
  "and it claims the key by preventing the default, so the desk does not also answer it"
);
test.assertMatches(
  source,
  /function handleClioPaintHistoryKeydown\(event\)\s*\{[\s\S]*?has-system-modal[\s\S]*?event\.preventDefault\(\)/,
  "a dialog the writer has to answer keeps the key, rather than the picture behind it"
);
test.assert(
  (source.match(/shortcutId: "redo"/g) || []).length === 1,
  "the Paint menu prints the key it actually answers to on its Redo row"
);
test.assertIncludes(source, "clioPaintState.history = { past: [], future: [], pending: null };", "a new or loaded picture starts with an empty history");
test.assertIncludes(source, "clioPaintState.savedBits = clioPaintPackCanvas();", "saving records the picture undo is allowed to call saved");

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
  /tool === "marquee" && !clioPaintBeginSelectionDrag\(point\)\) clioPaintBeginMarquee\(point, event\.shiftKey\)/,
  "and a press anywhere else starts a new marquee instead"
);
test.assertIncludes(source, "clioPaintCommitHistory(clioPaintToolLabelKey(\"move\"), { coalesce: true });", "a move is one history row, however many frames it took");
test.assertIncludes(source, "function clioPaintNudgeSelection(dx, dy)", "the arrow keys move the selection a pixel at a time");
test.assertIncludes(source, "clioPaintState.savedBits = clioPaintPackCanvas();", "the picture on disk stays the reference for 'unsaved'");
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

// The JS Paint borrowings are recorded where the mechanism is, so the next
// reader knows why the shape is what it is.
test.assertIncludes(source, "JS Paint", "the module says which precedent it followed");

test.finish();
