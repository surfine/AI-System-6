import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

// The edit kernel: the shared history every editor on the desk records into,
// run as written in a bare context.
const test = createFeatureTest("edit-kernel");
const context = vm.createContext({ window: {}, TextEncoder, TextDecoder, atob, btoa });
vm.runInContext(read("app/core/edit-history.js"), context);
const { createEditHistory } = context.window.AISystem6EditHistory;
const eq = (actual, expected, message) => test.assert(JSON.stringify(actual) === JSON.stringify(expected), `${message} (got ${JSON.stringify(actual)})`);

// A document is a frozen object; a change makes a new one.
let doc = Object.freeze({ x: 0, label: "a" });
const writes = [];
const history = createEditHistory({
  read: () => doc,
  write: (snapshot, meta) => { doc = snapshot; writes.push(meta.kind); },
  limit: 3,
});
const set = (patch) => { doc = Object.freeze({ ...doc, ...patch }); };

test.assert(!history.canUndo() && !history.canRedo(), "a new history has nothing either way");
history.change("move", () => set({ x: 10 }));
eq(history.undoLabel(), "move", "a change is one named step");
history.change("nothing", () => {});
eq(history.size().undo, 1, "a change that left the snapshot as it was records nothing");
history.undo();
eq(doc.x, 0, "undo writes the snapshot from before the change");
eq(history.redoLabel(), "move", "the step moves to redo under its name");
history.redo();
eq(doc.x, 10, "redo writes the change back");

// Typing in one field folds into one step; anything else ends the run.
history.change("typing", () => set({ label: "ab" }), { group: "label" });
history.change("typing", () => set({ label: "abc" }), { group: "label" });
history.change("typing", () => set({ label: "abcd" }), { group: "label" });
eq(history.size().undo, 2, "a run in one group is one step");
history.undo();
eq(doc.label, "a", "undoing a run goes back to before the run began");
history.redo();
history.change("move", () => set({ x: 20 }));
history.change("typing", () => set({ label: "z" }), { group: "label" });
eq(history.size().undo, 3, "the same group after another change starts a new step");

// A drag: every frame is computed from the start, and the whole drag is one step.
const before = history.size().undo;
history.begin("drag");
for (const dx of [5, 9, 14]) history.preview((start) => Object.freeze({ ...start, x: start.x + dx }));
eq(doc.x, 34, "a preview frame is the start plus this frame's offset, not the last frame's");
history.commit();
eq(history.size().undo, Math.min(3, before + 1), "a committed drag is one step (within the limit)");
history.undo();
eq(doc.x, 20, "undoing the drag lands where the drag began");
history.begin("drag");
history.preview((start) => Object.freeze({ ...start, x: 999 }));
history.cancel();
eq(doc.x, 20, "a cancelled drag writes the start back");
test.assert(writes.includes("cancel"), "the writer is told the frame was a cancel");
history.begin("drag");
history.commit();
test.assert(history.canRedo(), "a drag that moved nothing records nothing and keeps the redo branch");

// The limit drops the oldest steps.
for (let i = 0; i < 6; i += 1) history.change(`step ${i}`, () => set({ x: i * 100 }));
eq(history.size().undo, 3, "the history keeps at most `limit` steps");
eq(history.undoLabel(), "step 5", "the newest step survives the limit");

// A byte budget for pixel editors: the oldest go first, the newest always stays.
let pixels = "";
const heavy = createEditHistory({
  read: () => pixels,
  write: (snapshot) => { pixels = snapshot; },
  limit: 100,
  weigh: (snapshot) => snapshot.length,
  budget: 10,
});
for (const next of ["aaaa", "bbbb", "cccc"]) heavy.change("paint", () => { pixels = next; });
heavy.change("paint", () => { pixels = "dddd"; });
eq(heavy.size().undo, 2, "steps beyond the byte budget are dropped oldest first");
heavy.undo();
eq(pixels, "cccc", "the newest steps survive the budget");
let big = "xxxxxxxx";
const single = createEditHistory({ read: () => big, write: (snapshot) => { big = snapshot; }, weigh: (snapshot) => snapshot.length, budget: 2 });
single.change("paint", () => { big = "y"; });
test.assert(single.canUndo(), "the step just recorded survives even when it alone is over budget");

// Undo writes back without recording itself, and selection travels with the step.
let selection = ["a"];
let value = 1;
const selecting = createEditHistory({
  read: () => value,
  write: (snapshot) => {
    value = snapshot;
    selecting.change("echo", () => { value += 0; });
  },
  readSelection: () => selection.slice(),
  writeSelection: (next) => { selection = next; },
});
selecting.change("set", () => { value = 2; });
selection = ["b"];
selecting.undo();
eq(value, 1, "undo restores the value");
eq(selection, ["a"], "undo restores the selection the step was made with");
eq(selecting.size().redo, 1, "a change fired from inside write is not recorded");

// ---- Snapping, alignment and distribution (app/core/edit-snap.js) ----------
vm.runInContext(read("app/core/edit-snap.js"), context);
const { createSnapper, alignRects, distributeRects } = context.window.AISystem6EditSnap;
const boxes = [
  { id: "a", x: 0, y: 0, w: 100, h: 40 },
  { id: "b", x: 140, y: 0, w: 100, h: 40 },
  { id: "c", x: 400, y: 200, w: 60, h: 60 },
];
const snapper = createSnapper({ rects: boxes, frame: { w: 800, h: 450 }, threshold: 6 });
let snapped = snapper.snap({ x: 403, y: 100, w: 60, h: 30 });
eq(snapped.x, 400, "a left edge within the threshold lines up with another object's left edge");
test.assert(snapped.guides.some((guide) => guide.axis === "x" && guide.at === 400), "the guide is reported where it lines up");
snapped = snapper.snap({ x: 367, y: 300, w: 66, h: 30 });
eq(snapped.x, 367, "with no edge near, x stays where the pointer put it");
eq(snapper.snap({ x: 397, y: 300, w: 10, h: 10 }).x, 395, "a centre lines up with the frame's centre");
eq(snapper.snap({ x: 403, y: 100, w: 60, h: 30 }, { disabled: true }).x, 403, "Option held: no snapping at all");
// Equal spacing: a and b are 40 apart; a third box to the right of b snaps 40 after it.
const spacing = createSnapper({ rects: boxes.slice(0, 2), threshold: 6 });
const spaced = spacing.snap({ x: 284, y: 5, w: 100, h: 30 });
eq(spaced.x, 280, "the gap after the last neighbour snaps to the gap that already exists");
test.assert(spaced.spacing.some((mark) => mark.gap === 40), "the spacing mark carries the matched gap");
const middle = createSnapper({ rects: [{ id: "l", x: 0, y: 0, w: 50, h: 20 }, { id: "r", x: 250, y: 0, w: 50, h: 20 }], threshold: 6 });
eq(middle.snap({ x: 102, y: 300, w: 100, h: 20 }).x, 102, "objects in another row do not take part in spacing");
eq(middle.snap({ x: 102, y: 0, w: 100, h: 20 }).x, 100, "an object between two neighbours snaps to the middle");
// Bisection over many targets stays exact.
const many = Array.from({ length: 500 }, (_, index) => ({ id: `m${index}`, x: index * 20, y: 1000, w: 10, h: 10 }));
eq(createSnapper({ rects: many, threshold: 3 }).snap({ x: 4001, y: 0, w: 10, h: 4 }).x, 4000, "the lookup finds the nearest of hundreds of targets");

const aligned = alignRects(boxes, "left", "b");
eq(aligned.map((rect) => rect.x), [140, 140, 140], "align left to the key object moves everything else to its edge");
eq(alignRects(boxes, "top").map((rect) => rect.y), [0, 0, 0], "without a key object, the selection's bounds are the reference");
eq(alignRects(boxes, "right", "c").find((rect) => rect.id === "c").x, 400, "the key object itself does not move");
const row = [{ id: "p", x: 0, y: 0, w: 10, h: 10 }, { id: "q", x: 15, y: 0, w: 30, h: 10 }, { id: "r", x: 100, y: 0, w: 20, h: 10 }];
eq(distributeRects(row, "x").map((rect) => rect.x), [0, 40, 100], "distribute spacing keeps the ends and evens the gaps");
eq(distributeRects(row, "x", "centers").map((rect) => rect.x), [0, 43, 100], "distribute centres evens the centres");

// ---- Word diff (app/core/word-diff.js) --------------------------------------
vm.runInContext(read("app/core/word-diff.js"), context);
const { wordDiff, wordDiffSummary } = context.window.AISystem6WordDiff;
const slices = (a, b, hunks) => hunks.map((hunk) => [hunk.kind, a.slice(hunk.before.start, hunk.before.end), b.slice(hunk.after.start, hunk.after.end)]);
let A = "The quick brown fox jumps over the lazy dog.";
let B = "The quick red fox leaps over the dog.";
eq(slices(A, B, wordDiff(A, B).hunks), [["replace", "brown", "red"], ["replace", "jumps", "leaps"], ["delete", " lazy", ""]], "changed words come back as replace / delete hunks with exact character ranges");
A = "我写了一篇文章，讲本地优先的写作。";
B = "我写了一篇短文章，讲本地优先的写作工具。";
eq(slices(A, B, wordDiff(A, B).hunks), [["insert", "", "短"], ["insert", "", "工具"]], "Chinese is compared character by character");
eq(wordDiff("same", "same").hunks, [], "identical texts have no hunks");
eq(slices("", "new text", wordDiff("", "new text").hunks), [["insert", "", "new text"]], "everything inserted into an empty text is one hunk");
const summary = wordDiffSummary("The quick brown fox jumps over the lazy dog.", "The quick red fox leaps over the dog.", wordDiff("The quick brown fox jumps over the lazy dog.", "The quick red fox leaps over the dog.").hunks);
eq([summary.added, summary.removed, summary.replace, summary.delete], [2, 3, 2, 1], "the summary counts words, not spaces or punctuation");
// A long text with changes everywhere still answers, paragraph by paragraph.
const longA = Array.from({ length: 400 }, (_, index) => `段落${index}：${"字".repeat(40)}${index % 2 ? "旧" : ""}`).join("\n");
const longB = Array.from({ length: 400 }, (_, index) => `段落${index}：${"字".repeat(40)}${index % 2 ? "新" : ""}`).join("\n");
const long = wordDiff(longA, longB);
eq(long.hunks.length, 200, "every changed paragraph is found in a long text");
test.assert(long.hunks.every((hunk) => longA.slice(hunk.before.start, hunk.before.end) === "旧" && longB.slice(hunk.after.start, hunk.after.end) === "新"), "and each hunk is still the exact word that changed");

// ---- Working pictures in the one picture store (app/core/edit-assets.js) ----
vm.runInContext(read("app/core/edit-assets.js"), context);
const assets = context.window.AISystem6EditAssets;
const plain = { id: "p1", projectId: "d", dataUrl: "x" };
const staged = assets.stageAsset({ id: "s1", projectId: "d" }, { app: "liquidCover", group: "cover-1", role: "cover-subject", order: 1 });
const stagedBg = assets.stageAsset({ id: "s0", projectId: "d" }, { app: "liquidCover", group: "cover-1", role: "cover-background", order: 0 });
test.assert(assets.isKeptAsset(plain) && !assets.isKeptAsset(staged), "an ordinary picture is kept; an editor's working picture is staged");
eq(assets.assetsInGroup([staged, plain, stagedBg], "cover-1").map((record) => record.id), ["s0", "s1"], "a group comes back bottom first");
eq(assets.keepGroup([staged, stagedBg], "cover-1", "file-9").map((record) => [record.status, record.origin.fileId]), [["kept", "file-9"], ["kept", "file-9"]], "saving the document keeps its pictures and ties them to the file");
eq(assets.stagedToClear([staged, plain, stagedBg], { app: "clioPaint" }).length, 0, "clearing one app's staged pictures leaves the others");
eq(assets.stagedToClear([staged, plain, stagedBg], {}).length, 2, "clearing all staged pictures never touches a kept one");
let threw = false;
try { assets.stageAsset({ id: "z" }, { app: "x", group: "g", role: "anything" }); } catch { threw = true; }
test.assert(threw, "an unknown role is refused rather than stored");
test.assertIncludes(read("app/core/image-attachments.js"), '(item.status !== "staged" || options.includeStaged)', "the Picture Album leaves staged pictures out");
test.assertIncludes(read("app/features/export-import.js"), 'entry.status !== "staged"', "a disk backup leaves staged pictures out");

// ---- The embed envelope (app/core/edit-embeds.js) ---------------------------
vm.runInContext(read("app/core/edit-embeds.js"), context);
const embedsKit = context.window.AISystem6EditEmbeds;
const diagramData = { kind: "flow", nodes: [{ id: "n1", label: "提问" }], edges: [], groups: [] };
const sourceLink = { app: "docMap", fileId: "f1", ref: "branch-2", rev: embedsKit.contentRev({ a: 1 }) };
const block = embedsKit.embedMarkdown({ kind: "diagram", alt: "流程", svg: "<svg>流程</svg>", data: diagramData, source: sourceLink });
const pageText = `## 标题\n\n${block}\n\n正文`;
let found = embedsKit.parseEmbeds(pageText);
eq(found.length, 1, "a page with one embed has one");
eq(found[0].kind, "diagram", "the kind comes back");
eq(found[0].data, diagramData, "the copy's data comes back exactly, Chinese included");
eq(found[0].source, sourceLink, "and so does the link to its original");
eq(pageText.slice(found[0].image.start, found[0].image.end).startsWith("![流程](data:image/svg+xml;base64,"), true, "the embed knows which picture it labels");
const redrawnPage = embedsKit.replaceEmbed(pageText, 0, { data: { ...diagramData, nodes: [{ id: "n1", label: "提问" }, { id: "n2", label: "提纲" }] }, svg: "<svg>new</svg>" });
found = embedsKit.parseEmbeds(redrawnPage);
eq(found[0].data.nodes.length, 2, "replacing an embed writes the new copy");
eq(embedsKit.fromBase64(redrawnPage.match(/base64,([A-Za-z0-9+/=]+)\)/)[1]), "<svg>new</svg>", "and redraws its picture");
test.assert(redrawnPage.startsWith("## 标题") && redrawnPage.endsWith("正文"), "and leaves the rest of the page alone");
eq(found[0].source, sourceLink, "the link to the original survives an edit");
// Old pages keep working.
const legacy = `![x](data:image/svg+xml;base64,PHN2Zz4=)\n\n<!-- clio-diagram-data: ${embedsKit.toBase64(JSON.stringify(diagramData))} -->\n\n![y](data:image/svg+xml;base64,PHN2Zz4=)\n\n<!-- clio-chart: | a | b | / | --- | --- | / | x | 1 | -->`;
const old = embedsKit.parseEmbeds(legacy);
eq(old.map((embed) => [embed.kind, embed.legacy]), [["diagram", true], ["chart", true]], "the two older comments are read as embeds of the same kinds");
eq(old[1].data.markdown, "| a | b |\n| --- | --- |\n| x | 1 |", "the old chart comment unfolds back into its table");
test.assert(embedsKit.replaceEmbed(legacy, 0, { data: diagramData }).includes("<!-- clio-embed diagram:"), "an edited old page is written in the new form");
// Source sync is offered, never applied.
eq(embedsKit.sourceState(found[0], sourceLink.rev), "current", "an unchanged original needs nothing");
eq(embedsKit.sourceState(found[0], "other"), "changed", "a changed original is reported");
eq(embedsKit.sourceState(found[0], null), "missing", "a deleted original is reported as missing");
eq(embedsKit.sourceState({ source: { ...sourceLink, kept: "other" } }, "other"), "current", "Keep silences the change it was shown");
eq(embedsKit.sourceState({ source: null }, "anything"), "current", "an embed with no original is never out of date");
test.assert(embedsKit.parseEmbeds("<!-- clio-embed diagram: !!!notbase64 -->").length === 0, "a broken envelope is ignored, not guessed at");

// Wiring: the Edit menu asks the window's registered history.
const windowManager = read("app/core/window-manager.js");
const editRouting = read("app/features/documents-chat.js");
test.assertIncludes(windowManager, "function registerEditHistory(windowName, history)", "windows register their history by name");
test.assertIncludes(windowManager, '"undo": hasEditableFocus || isTeachText || isAssistant || !!editHistoryFor(winName)?.canUndo()', "Undo is live while the window's history has a step");
test.assertIncludes(editRouting, "editHistoryFor()", "Edit > Undo / Redo reach the registered history when no field is the target");
test.assertIncludes(windowManager, "t(`${command}_step`, t(step))", "the menu names the step it would take back");
for (const file of ["app/features/clio-stage.js", "app/features/clio-chart.js"]) {
  test.assertIncludes(read(file), "registerEditHistory(", `${file} registers its history`);
}
// Every embed kind has an editor on ClioStage, and every original an embed can
// link back to has a reader for Sync.
const stageSource = read("app/features/clio-stage.js");
const editors = stageSource.slice(stageSource.indexOf("const CLIO_STAGE_EMBED_EDITORS"), stageSource.indexOf("// Which embed a double-clicked picture is"));
for (const kind of ["diagram", "chart", "cover", "sketch"]) test.assertMatches(editors, new RegExp(`\\n  ${kind}: async`), `ClioStage opens a ${kind} embed in its editor`);
const sources = stageSource.slice(stageSource.indexOf("const CLIO_STAGE_EMBED_SOURCES"), stageSource.indexOf("async function clioStageCheckEmbedSources"));
for (const app of ["clioChart", "docMap", "clioProject", "clioPaint", "liquidCover"]) test.assertMatches(sources, new RegExp(`\\n  ${app}: async`), `a copy from ${app} can be checked against its original`);
test.assertIncludes(read("app/features/liquid-cover.js"), 'embeds.embedMarkdown({ kind: "cover"', "Cover Glass sends a cover as an editable copy");
test.assertIncludes(read("app/features/liquid-cover.js"), "if (!(await saveCover())) return false;", "and saves it first, so the pictures the copy points at are kept");
test.assertIncludes(read("app/features/clio-paint.js"), 'embeds.embedMarkdown({ kind: "sketch"', "ClioPaint sends a sketch as an editable copy");
test.assertNotIncludes(read("app/features/clio-diagram.js"), 'event.key.toLowerCase() === "z"', "the canvas no longer answers ⌘Z itself; the Edit menu's one route does");

test.finish();
