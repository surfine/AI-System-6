// ClioWorks N8 contract: the Review Desk's 回稿 tab — per-paragraph
// candidates, the verbatim message column, the three-way compare. Real code
// in VMs (the S11 path): the REAL vendored engine builds the alignment rows,
// the REAL word-diff core measures rewrites, the REAL markdown-editor's
// mdeApply is the only road into the manuscript, and the REAL word-export
// pipeline answers whether reply findings really become Word comments.
//
//   采纳  each acceptance is ONE whole-body mdeApply (execCommand
//        "insertText") — one undo step named 「采纳回稿：第 N 段」; a paragraph
//        that does not stand exactly once in the manuscript is left alone and
//        said aloud, never guessed at. 不采纳 records a decision; 改一下…
//        walks the same path with the writer's edit. 撤回 takes an acceptance
//        back down the same one-step road (「撤回采纳：第 N 段」, the decision
//        back to 未定); a paragraph the manuscript no longer holds keeps the
//        acceptance — 定位不到，未改.
//   留言  verbatim, who to whom; replies and handled flags persist onto the
//        project record (project.roundTrip) and ride the existing findings
//        pipeline on the next 送审 — only the placed ones are marked carried.
//   对照  送审版 · 现在 · 对方改回, read-only, over the changed rows.
//
// The DOM side is asserted statically (the panel's tab row and placeholder,
// the loader's order, the translations, the stylesheet), the way the N14
// contract treats its windoid.
import vm from "node:vm";
import { createFeatureTest, read, codeOnly } from "../helpers/feature-test-harness.mjs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-n8-review");

// --- context A: the desk — engine, word-diff, editor, the N8 module -----------

function makeDeskContext() {
  const paper = {
    value: "",
    selectionStart: 0,
    selectionEnd: 0,
    focus() {},
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
  };
  // The browser's side of execCommand("insertText"): one recorded call, the
  // selected range replaced. The record is how the contract sees that an
  // acceptance landed as ONE undoable editor step rather than a value write.
  const execInserts = [];
  const statusNotes = [];
  const saves = { count: 0 };
  const store = { "ai-system6-roundtrip-recipient": "落落" };
  const context = {
    console: { warn() {}, log() {}, error() {} },
    Promise, Map, Set, WeakSet, JSON, Math, Date, Number, String, Array, Object, RegExp,
    CSS: { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&") },
    document: {
      execCommand(command, showUi, value) {
        if (command !== "insertText") return false;
        execInserts.push(String(value));
        paper.value = paper.value.slice(0, paper.selectionStart) + String(value) + paper.value.slice(paper.selectionEnd ?? paper.selectionStart);
        return true;
      },
      createElement() { throw new Error("the desk contract draws no DOM"); },
    },
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
    },
    teachTextBodyInput: paper,
    t: (key, ...args) => (args.length ? `t:${key}(${args.join(",")})` : `t:${key}`),
    setStatus: (message) => statusNotes.push(message),
    saveDeskState: () => { saves.count += 1; return true; },
    getActiveProject: () => project,
  };
  const project = {
    id: "project-n8",
    name: "N8",
    archived: false,
    outline: "",
    updatedAt: "",
  };
  context.project = project;
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read("app/vendor/clioworks-v3/manuscript-roundtrip.js"), context, { filename: "engine" });
  vm.runInContext(read("app/core/word-diff.js"), context, { filename: "word-diff" });
  // markdown-editor.js has no top-level statements; it contributes mdeApply.
  vm.runInContext(read("app/core/markdown-editor.js"), context, { filename: "markdown-editor" });
  vm.runInContext(read("app/features/roundtrip-review.js"), context, { filename: "roundtrip-review" });
  return { context, paper, execInserts, statusNotes, saves, project };
}

const desk = makeDeskContext();
const N8 = desk.context.AISystem6RoundtripReview;
const ENGINE = desk.context.AISystem6ManuscriptRoundTrip;
test.assert(!!N8 && Object.isFrozen(N8) && desk.context.AISystem6RoundtripReviewLoaded === true,
  "the roundtrip-review module installs a frozen API and its own Loaded mark");

// --- 1. one real round: engine-aligned rows behind a stubbed lastImport ------

// The send: four paragraphs. The return: paragraph 2 rewritten and commented,
// a new paragraph after it, paragraph 4 deleted — the round a reviewer leaves.
const sentParagraphs = [
  { id: "s1", text: "第一段原文，一字未动。" },
  { id: "s2", text: "第二段原稿，等待修改。" },
  { id: "s3", text: "第三段原文，同样未动。" },
  { id: "s4", text: "第四段被删掉的段落。" },
];
const returnedParagraphs = [
  { id: "r1", text: "第一段原文，一字未动。" },
  { id: "r2", text: "第二段被整段改写，换了说法。" },
  { id: "r2b", text: "审稿人新增的一段。" },
  { id: "r3", text: "第三段原文，同样未动。" },
];
const rows = ENGINE.alignParagraphs(sentParagraphs, returnedParagraphs);
const unplaced = ENGINE.attachComments(rows, [
  { author: "落落", text: "这句要保留吗？", anchor: { paragraphId: "r2" } },
  { author: "落落", text: "被删那段上的批注。", anchor: { paragraphId: "gone" } },
]);
test.assert(unplaced.length === 1 && unplaced[0].text === "被删那段上的批注。",
  "the engine reports the comment whose anchor paragraph is gone (the windoid keeps it for the 未挂上 group)");
test.assert(rows.some((row) => row.kind === "removed" && row.sentText === "第四段被删掉的段落。"),
  "the round carries a removed paragraph to decide about");

let importSequence = 0;
desk.context.AISystem6ManuscriptRoundTripUI = {
  lastImport: () => ({
    rows,
    summary: { changedParagraphs: 3, comments: 2 },
    revisionCount: 1,
    item: { id: "file-return-2", name: "采访安排-回稿-第2轮.docx" },
    unplacedComments: unplaced,
  }),
};

const record = N8.syncFromLastImport(desk.project, { now: "2026-11-04T09:00:00.000Z" });
test.assert(!!record && record.version === 1 && record.round === 2 && record.fileName === "采访安排-回稿-第2轮.docx",
  "the record takes its round and file name from the import the N14 UI holds");
test.assert(record.recipient === "落落", "the recipient is read where N14's dialog stored it (localStorage key)");
test.assert(record.rows.length === rows.length && record.rows.every((row) => row.decision === "undecided"),
  "the rows snapshot lands whole, every decision still undecided");
const changedRow = record.rows.find((row) => row.kind === "changed");
test.assert(changedRow.sentText === "第二段原稿，等待修改。" && changedRow.returnedText === "第二段被整段改写，换了说法。",
  "a changed row carries both sides' words verbatim");
test.assert(changedRow.comments.length === 1 && changedRow.comments[0].text === "这句要保留吗？" && changedRow.comments[0].reply === "",
  "the comment hangs on its row, verbatim, unanswered");
test.assert(record.unplacedComments.length === 1, "the unanchored comment lands on the 未挂上 group, not dropped");
test.assert(desk.project.roundTrip === record && desk.saves.count === 1,
  "the first sync writes project.roundTrip through saveDeskState");

// --- 2. decisions: 不采纳 records; 采纳 is one editor step --------------------

desk.paper.value = [
  "# 采访安排",
  "",
  "第一段原文，一字未动。",
  "",
  "第二段原稿，等待修改。",
  "",
  "第三段原文，同样未动。",
  "",
  "第四段被删掉的段落。",
].join("\n");
const before = desk.paper.value;
const insertsBefore = desk.execInserts.length;
const addedRow = record.rows.find((row) => row.kind === "added");
const removedRow = record.rows.find((row) => row.kind === "removed");

test.assert(N8.planAdoption(record, 1, desk.paper.value).status === "lost",
  "an untouched paragraph is not a candidate; nothing can be adopted from it");

test.assert(N8.rejectRow(record, removedRow.index) === true
  && removedRow.decision === "rejected"
  && desk.paper.value === before && desk.execInserts.length === insertsBefore,
  "不采纳 records the decision and never touches the manuscript");

const adoptChanged = N8.adoptRow(record, changedRow.index);
const bodyAfterAccept = before.replace("第二段原稿，等待修改。", "第二段被整段改写，换了说法。");
test.assert(adoptChanged.ok === true
  && desk.execInserts.length === insertsBefore + 1
  && desk.execInserts.at(-1) === bodyAfterAccept,
  "采纳 is ONE whole-body execCommand(\"insertText\") — one undo step, not a value write");
test.assert(desk.paper.value === bodyAfterAccept,
  "the returned paragraph stands exactly where the sent one stood, neighbours and spacing untouched");
test.assert(changedRow.decision === "accepted" && changedRow.acceptedText === "第二段被整段改写，换了说法。",
  "the row records what was accepted");
test.assert(desk.statusNotes.at(-1) === "t:roundtrip_accept_step(2)",
  `the step is named 「采纳回稿：第 2 段」 in the status line (got ${desk.statusNotes.at(-1)})`);

// 定位不到＝未改：the manuscript has moved on, the candidate stays.
const movedOn = "手稿已经改成了别的样子，那段不在了。";
desk.paper.value = movedOn;
const lostAdopt = N8.adoptRow(record, addedRow.index);
test.assert(lostAdopt.ok === false && lostAdopt.reason === "lost"
  && addedRow.lost === true && addedRow.decision === "undecided"
  && desk.paper.value === movedOn && desk.execInserts.length === insertsBefore + 1,
  "an adoption that cannot locate leaves the manuscript untouched and the candidate undecided, said aloud");
test.assert(desk.statusNotes.at(-1) === "t:roundtrip_lost_note", "the writer is told the paragraph could not be located — no guessing");

// 同样的两段：refuse to pick. A dedicated round and project, so the desk's
// own record is not disturbed by the refusal's bookkeeping.
const ambiguousRecord = N8.freshRecord({
  rows: ENGINE.alignParagraphs([{ id: "a", text: "同一段。" }], [{ id: "b", text: "别的写法。" }]),
  item: { id: "f-amb", name: "t-回稿-第1轮.docx" },
}, { recipient: "", now: "x" });
const scratchProject = { id: "scratch" };
const realGetActiveProject = desk.context.getActiveProject;
desk.context.getActiveProject = () => scratchProject;
desk.paper.value = "同一段。\n\n中间隔了一句。\n\n同一段。";
const ambiguousAdopt = N8.adoptRow(ambiguousRecord, ambiguousRecord.rows[0].index);
desk.context.getActiveProject = realGetActiveProject;
test.assert(ambiguousAdopt.ok === false && ambiguousAdopt.reason === "ambiguous" && ambiguousRecord.rows[0].decision === "undecided",
  "the same words standing twice refuse to pick — the manuscript is not touched");

// 改一下…: the writer's text, the same one-step path, the same step name.
desk.paper.value = bodyAfterAccept;
const adoptEdited = N8.adoptRow(record, addedRow.index, { edit: "我改的新段。" });
test.assert(adoptEdited.ok === true
  && desk.execInserts.at(-1) === bodyAfterAccept.replace("第一段原文，一字未动。", "第一段原文，一字未动。\n\n我改的新段。"),
  "改一下 walks the same whole-body one-step path with the writer's own text");
test.assert(addedRow.decision === "accepted" && addedRow.acceptedText === "我改的新段。" && addedRow.lost === false
  && desk.statusNotes.at(-1) === "t:roundtrip_accept_step(3)",
  "the edited acceptance records under the same step name, 第 N 段 by paragraph number");

// --- 2b. 撤回: one step back to the send words; 定位不到 keeps the acceptance --

const bodyAfterEdit = bodyAfterAccept.replace("第一段原文，一字未动。", "第一段原文，一字未动。\n\n我改的新段。");
test.assert(desk.paper.value === bodyAfterEdit && desk.execInserts.length === insertsBefore + 2,
  "(setup) both acceptances stand in the manuscript as whole-body steps");

const revertEdited = N8.revertRow(record, addedRow.index);
test.assert(revertEdited.ok === true
  && desk.execInserts.length === insertsBefore + 3
  && desk.execInserts.at(-1) === bodyAfterAccept,
  "撤回 is ONE whole-body execCommand(\"insertText\") back to the send words — still one undo step");
test.assert(desk.paper.value === bodyAfterAccept && addedRow.decision === "undecided" && addedRow.acceptedText === "",
  "the manuscript is back where it stood and the row reads 未定 with no accepted text (改一下 acceptances withdraw the same way)");
test.assert(desk.statusNotes.at(-1) === "t:roundtrip_revert_step(3)",
  `the withdraw step is named 「撤回采纳：第 3 段」 (got ${desk.statusNotes.at(-1)})`);

const revertChanged = N8.revertRow(record, changedRow.index);
test.assert(revertChanged.ok === true && desk.paper.value === before && changedRow.decision === "undecided"
  && changedRow.acceptedText === "" && desk.statusNotes.at(-1) === "t:roundtrip_revert_step(2)",
  "a plain 采纳 withdraws the same way — paragraph 2 back to its own send words");
const countsAfterWithdraw = N8.state().counts;
test.assert(countsAfterWithdraw.accepted === 0 && countsAfterWithdraw.rejected === 1 && countsAfterWithdraw.undecided === 2,
  "the summary line follows the withdrawals (no acceptance left standing)");

// The manuscript moved on after the acceptance: nothing changes, the row
// keeps its accepted state and accepted text — said aloud, never guessed at.
const reAccept = N8.adoptRow(record, changedRow.index);
test.assert(reAccept.ok === true, "(setup) paragraph 2 accepted again for the lost case");
desk.paper.value = movedOn;
const lostRevert = N8.revertRow(record, changedRow.index);
test.assert(lostRevert.ok === false && lostRevert.reason === "lost"
  && changedRow.decision === "accepted" && changedRow.acceptedText === "第二段被整段改写，换了说法。"
  && desk.paper.value === movedOn && desk.execInserts.length === insertsBefore + 5,
  "定位不到 leaves the manuscript untouched and the acceptance standing — no state flip");
test.assert(desk.statusNotes.at(-1) === "t:roundtrip_lost_note",
  "the writer is told the withdrawal could not locate the paragraph");
desk.paper.value = bodyAfterEdit; // (the standing anchors the locating section reads)

// --- 3. locating: whitespace folds, the engine's citation fold, no guessing ----

test.assert(N8.locateInBody("开头。\n\n第二 段\t原稿 ，等待修改。\n\n结尾。", "第二段原稿，等待修改。").status === "found",
  "whitespace is folded on both sides before a paragraph is said to match");
test.assert(N8.locateInBody("引一句[S3]的段落。", "引一句[^S3]的段落。").status === "found",
  "the engine's own citation transform ([S3] → [^S3]) folds back before comparing");
const ambiguous = N8.locateInBody("同一段。\n\n同一段。", "同一段。");
test.assert(ambiguous.status === "ambiguous" && ambiguous.count === 2,
  "the same words standing twice refuse to pick — no guessing");
test.assert(N8.locateInBody("手稿已前进，这句话不在了。", "第二段原稿，等待修改。").status === "lost",
  "a paragraph the manuscript no longer holds is lost, with no position");

// 定位不到＝未改：the plan answers lost and the row keeps its decision.
const movedOnPlan = "手稿已经改成了别的样子。";
test.assert(N8.planAdoption(record, changedRow.index, movedOnPlan).status === "lost",
  "an adoption that cannot locate leaves the plan refused");
test.assert(N8.planAdoption(record, addedRow.index, desk.paper.value).status === "ready"
  && N8.planAdoption(record, addedRow.index, desk.paper.value).insert.includes("\n\n审稿人新增的一段。"),
  "an added paragraph lands after the nearest preceding paragraph the manuscript still carries, blank line and all");
test.assert(N8.planAdoption(record, addedRow.index, "开头只有一段。\n\n第二段原稿，等待修改。").status === "ready",
  "the added row anchors on the changed row's own sent words too");
const noAnchor = [{ id: "s0", text: "只有这段" }];
const loneAdded = ENGINE.alignParagraphs(noAnchor, [{ id: "a", text: "新段" }, { id: "s0b", text: "只有这段" }]);
const loneRecord = N8.freshRecord({ rows: loneAdded, item: { id: "f", name: "t-回稿-第1轮.docx" } }, { recipient: "", now: "x" });
test.assert(N8.planAdoption(loneRecord, 1, "只有这段").status === "lost",
  "an added paragraph with no locatable predecessor has no honest place — refused, not appended");

// A removal takes one blank run with it so neighbours do not glue.
const bodyWithRemoval = "第一段。\n\n被删的段。\n\n第三段。";
const removedPlan = N8.planAdoption(
  N8.freshRecord({ rows: ENGINE.alignParagraphs([{ id: "a", text: "第一段。" }, { id: "b", text: "被删的段。" }, { id: "c", text: "第三段。" }], [{ id: "a", text: "第一段。" }, { id: "c", text: "第三段。" }]), item: { id: "f2", name: "t-回稿-第1轮.docx" } }, { recipient: "", now: "x" }),
  2,
  bodyWithRemoval,
);
test.assert(removedPlan.status === "ready" && bodyWithRemoval.slice(0, removedPlan.from) + removedPlan.insert + bodyWithRemoval.slice(removedPlan.to) === "第一段。\n\n第三段。",
  "accepting a removal deletes the paragraph and exactly one blank run, leaving clean spacing");

// --- 4. the rewrite measure behind 口吻提示 -----------------------------------

const measure = N8.rewriteMeasure("交通费按实报销，住宿另议。", "差旅费用按公司标准统一报销，相关事宜另行通知。");
const light = N8.rewriteMeasure("本次访谈分三轮进行。", "本次访谈分两轮进行。");
test.assert(measure.heavy === true && light.heavy === false && light.edits >= 1,
  "the word-diff core tells a wholesale rewrite from a small edit (提示只挂在改写整段的行上)");

// --- 5. messages: verbatim, replies, handled, carried --------------------------

const commentId = "r" + changedRow.index + "-0";
test.assert(N8.setReply(record, commentId, "保留，别删。") === true, "a reply lands on the comment it answers");
test.assert(changedRow.comments[0].reply === "保留，别删。" && !!changedRow.comments[0].repliedAt,
  "the reply keeps the writer's words verbatim and stamps when");
test.assert(N8.setDone(record, commentId, true) === true && changedRow.comments[0].done === true,
  "标为已处理 flips the handled flag");

const findings = N8.replyFindingsFromRecord(record);
test.assert(findings.length === 1 && findings[0].note === "保留，别删。" && findings[0].anchor === changedRow.acceptedText,
  "the reply becomes a word-export finding anchored on the accepted paragraph (the manuscript's own current words)");
test.assert(findings[0].author === "t:review_comment_writer", "the finding's author is the writer label, passed through t()");
const replyOnUnplaced = record.unplacedComments[0];
N8.setReply(record, "u0", "这段我另有安排。");
const findingsAfter = N8.replyFindingsFromRecord(record);
test.assert(findingsAfter.length === 1,
  "a reply on an unanchored comment produces no finding — it has no paragraph to hang on and stays visibly pending");

test.assert(N8.markCarriedInRecord(record, "采访安排-送审-第3轮.docx", ["别的回复"]) === 0, "a reply the pipeline did not place is not marked carried");
test.assert(N8.markCarriedInRecord(record, "采访安排-送审-第3轮.docx", ["保留，别删。"]) === 1 && changedRow.comments[0].carriedIn === "采访安排-送审-第3轮.docx",
  "the placed reply is stamped carried with the send that carried it");
test.assert(N8.replyFindingsFromRecord(record).length === 0, "a carried reply never rides twice");

// --- 6. persistence: the record on the project, and back ----------------------

const persisted = JSON.parse(JSON.stringify(desk.project.roundTrip));
test.assert(persisted.rows.find((row) => row.index === changedRow.index).decision === "accepted"
  && persisted.rows.find((row) => row.kind === "removed").decision === "rejected"
  && persisted.unplacedComments[0].reply === "这段我另有安排。",
  "decisions, replies and carried stamps survive a JSON round trip on project.roundTrip");
const reopened = N8.readRecord({ roundTrip: persisted });
test.assert(!!reopened && reopened.rows.length === persisted.rows.length && N8.replyFindingsFromRecord(reopened).length === 0,
  "a rehydrated record reads back with its state, and carried replies stay carried");
test.assert(N8.readRecord({ roundTrip: { version: 9, rows: [] } }) === null && N8.readRecord({ roundTrip: { version: 1, rows: [{ index: 1 }] } }) === null && N8.readRecord({}) === null,
  "a record this tab did not write (wrong version, missing fields) reads as none — opened as far as it can, never invented");

// A fresh import replaces the record as the newest round; the same file keeps it.
const keptAfterSame = N8.syncFromLastImport(desk.project, { now: "2026-11-05T09:00:00.000Z" });
test.assert(keptAfterSame === desk.project.roundTrip && keptAfterSame.rows.find((row) => row.index === changedRow.index).decision === "accepted",
  "reopening with the same import keeps every decision already made");
desk.context.AISystem6ManuscriptRoundTripUI.lastImport = () => ({
  rows: ENGINE.alignParagraphs(sentParagraphs, returnedParagraphs),
  item: { id: "file-return-3", name: "采访安排-回稿-第3轮.docx" },
  unplacedComments: [],
});
const replaced = N8.syncFromLastImport(desk.project, { now: "2026-11-06T09:00:00.000Z" });
test.assert(replaced !== keptAfterSame && replaced.round === 3 && replaced.rows.every((row) => row.decision === "undecided"),
  "a new import becomes the newest round, decisions starting undecided");

// --- 7. 三方对照: 送审版 · 现在 · 对方改回, read-only --------------------------

const body = [
  "# 采访安排",
  "",
  "第一段原文，一字未动。",
  "",
  "我改过的第二段。",
  "",
  "审稿人新增的一段。",
  "",
  "第三段原文，同样未动。",
].join("\n");
const compareRound = N8.syncFromLastImport(desk.project, { now: "2026-11-06T09:00:00.000Z" });
const changedAgain = compareRound.rows.find((row) => row.kind === "changed");
changedAgain.decision = "accepted";
changedAgain.acceptedText = "我改过的第二段。";
const threeWay = N8.threeWayRows(compareRound, body);
test.assert(threeWay.length === 3 && threeWay.every((row) => ["changed", "added", "removed"].includes(row.kind)),
  "only the changed/added/removed paragraphs are compared, never the untouched ones");
const acceptedCompare = threeWay.find((row) => row.kind === "changed");
test.assert(acceptedCompare.current === "我改过的第二段。" && acceptedCompare.currentStatus === "accepted",
  "the accepted paragraph's 「现在」 column shows the accepted text");
const addedCompare = threeWay.find((row) => row.kind === "added");
test.assert(addedCompare.current === "审稿人新增的一段。" && addedCompare.currentStatus === "returned",
  "an added paragraph the writer took by hand reads from the returned words");
const removedCompare = threeWay.find((row) => row.kind === "removed");
test.assert(removedCompare.current === "" && removedCompare.currentStatus === "gone",
  "a removed paragraph that is gone from the manuscript says so, with no text invented");
const freshThreeWay = N8.threeWayRows(compareRound, "整篇手稿都换成新的了。");
test.assert(freshThreeWay.every((row) => row.currentStatus === "gone"),
  "a manuscript that moved past the round shows every column honestly gone");

// --- 8. the replies really fit the existing Word comment pipeline -------------
// The same assembly the N14 contract uses: the real word-export generator in
// the S11 VM, the real marked lexer for the manuscript's tokens.

const markedContext = vm.createContext({});
markedContext.globalThis = markedContext;
markedContext.self = markedContext;
markedContext.window = markedContext;
vm.runInContext(read("app/vendor/marked.umd.js"), markedContext);
const wordCtx = makeContext();
loadScripts(wordCtx, ["app/features/word-export.js"]);
const wordApi = wordCtx.AISystem6WordExport;
const manuscriptWithReply = "第一段原文，一字未动。\n\n我改过的第二段。\n\n第三段原文，同样未动。";
const lexed = vm.runInContext(`marked.lexer(${JSON.stringify(manuscriptWithReply)}, { gfm: true, breaks: false })`, markedContext);
const planned = wordApi.planWordComments(lexed, [{ anchor: "我改过的第二段。", note: "保留，别删。", author: "作者" }], {});
test.assert(planned.requested === 1 && planned.placed === 1 && planned.skipped.length === 0,
  `the reply finding really becomes one Word comment through the existing pipeline (got placed ${planned.placed}/${planned.requested})`);
const plannedAway = wordApi.planWordComments(lexed, [{ anchor: "已经不在手稿里的段落。", note: "x", author: "作者" }], {});
test.assert(plannedAway.placed === 0 && plannedAway.skipped[0].reason.length > 0,
  "a finding whose anchor the manuscript no longer holds is skipped with its reason named — it stays pending, never forced in");

// --- 9. the eager side and the assembly, statically ----------------------------

{
  const panelSource = read("app/features/review-comments.js");
  test.assert(panelSource.includes('["roundtrip", "roundtrip_tab"]'), "the panel's tab row carries the third 回稿 tab");
  test.assert(panelSource.includes('dataset.rcBody = "roundtrip"'), "the panel builds the 回稿 placeholder container and nothing more");
  test.assert(panelSource.includes('ensureRoundtripReviewModule') && panelSource.includes('AISystem6RoundtripReview?.show(host)'),
    "the tab delegates its content to the lazy module; no candidate logic lives in the panel");
  const configSource = read("app/core/config.js");
  test.assert(configSource.includes('"AISystem6RoundtripReviewLoaded", ["app/vendor/clioworks-v3/manuscript-roundtrip.js", "app/features/manuscript-roundtrip.js", "app/core/word-diff.js", "app/features/roundtrip-review.js"]'),
    "config.js loads the tab behind the engine and N14's UI, word-diff, then the tab's own file");
  const manifest = read("tooling/runtime-manifest.mjs");
  test.assert(manifest.includes('"app/features/roundtrip-review.js"'), "the tab is a lazy runtime path, not boot payload");

  const moduleSource = read("app/features/roundtrip-review.js");
  test.assert(moduleSource.includes("mdeApply(paper, { from: 0, to: body.length,"),
    "adoption rides mdeApply's whole-body replace — the one-step-undo path applyRestoredBody established");
  test.assert(moduleSource.includes("typeof root.mdeApply !== 'function'"), "without the editor's apply there is no adoption (no raw value write)");
  test.assert(moduleSource.includes("revertRow") && moduleSource.includes("'revert'"),
    "an accepted card offers 撤回 through the same one-step road (revertRow behind the revert action)");
  test.assert(moduleSource.includes("openReturnImport?.()"), "the empty tab's button opens N14's import windoid");
  test.assert(moduleSource.includes('dataset.action = \'style-check-manuscript\''),
    "the tone hint jumps to the existing style check through its own command, and never rewrites");
  test.assert(!/[^(]\b(color|background)\s*:\s*(?!var\()/.test(moduleSource), "the module draws no colours of its own; the stylesheet owns appearance");

  const roundtripUiSource = codeOnly(read("app/features/manuscript-roundtrip.js"));
  test.assert(roundtripUiSource.includes("const unplacedComments = ENGINE.attachComments(rows, comments);") && roundtripUiSource.includes("unplacedComments }"),
    "the import windoid keeps the unanchored comments on its record for the 未挂上 group");
  test.assert(roundtripUiSource.includes("pendingReplyFindings?.()") && roundtripUiSource.includes("{ findings: replyFindings }"),
    "送审 passes the pending replies through word-export's findings pipeline");
  test.assert(roundtripUiSource.includes("markRepliesCarried?.(item.name, carried)"),
    "only after the store confirms does the send mark the placed replies carried");

  const translationsEn = read("app/data/translations-en.js");
  const translationsZh = read("app/data/translations-zh.js");
  for (const key of ["roundtrip_tab", "roundtrip_accept_step", "roundtrip_revert_step", "roundtrip_lost_note", "roundtrip_tone_hint", "roundtrip_compare_col_now"]) {
    test.assert(new RegExp(`${key}:`).test(translationsEn), `translations-en.js carries ${key}`);
    test.assert(new RegExp(`${key}:`).test(translationsZh), `translations-zh.js carries ${key}`);
  }
  test.assert(/roundtrip_accept_step: \(index\) => `采纳回稿：第 \$\{index\} 段`/.test(translationsZh),
    "the undo step's zh label is exactly 「采纳回稿：第 N 段」");
  test.assert(/roundtrip_revert_step: \(index\) => `撤回采纳：第 \$\{index\} 段`/.test(translationsZh),
    "the withdraw step's zh label is exactly 「撤回采纳：第 N 段」");
  test.assert(/roundtrip_revert: "撤回"/.test(translationsZh) && /roundtrip_revert: "Withdraw"/.test(translationsEn),
    "the withdraw button is labelled 撤回 / Withdraw");
  test.assert(/roundtrip_tab: "回稿"/.test(translationsZh), "the tab's zh label is 回稿");

  const styleSource = read("styles/99-review-comments.css");
  const roundtripCss = styleSource.slice(styleSource.indexOf("---- 回稿"));
  test.assert(roundtripCss.includes(".roundtrip-candidates") && roundtripCss.includes(".roundtrip-compare-table"),
    "the 回稿 styles live in the panel's own lazy sheet, scoped .roundtrip-*");
  test.assert(moduleSource.includes("review-diff-del") && moduleSource.includes("review-diff-ins") && !/#([0-9a-f]{3,6})\b/.test(roundtripCss),
    "the candidate diff reuses the panel's black-white del/ins pair — no colour arrives with the reviewer's markup");
}

test.finish();
