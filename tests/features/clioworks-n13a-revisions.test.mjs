// ClioWorks N13a contract: Word tracked changes read through the desk's Quire
// adapter resolve one by one. Loads the codecs + quire-adapter + the ported
// quire-review engine in a VM (the same path the S11 contracts use) and drives
// the real corpus D17.docx and D18.docx plus a tracked-changes document the
// vendored codec itself writes. Every resolve must be ONE named undo step that
// undo restores exactly, saving keeps R1's part-level preservation, and the
// reopened file shows the resolved state.
//
// Corpus note: D17 (POI bug56075, "Change Tracking ON") carries the words but
// records no w:ins/w:del of its own — its revision list is empty, which this
// contract asserts rather than assumes; D18 records one deletion and a comment
// range; the six-kind coverage comes from the codec-built sample.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";
import { changedParts, CORPUS } from "../../tooling/clioworks-r1-corpus.mjs";

const test = createFeatureTest("clioworks-n13a-revisions");
process.env.TZ = "UTC"; // the codec reads local clock fields (zip stamps)

const docxBytes = (name) => readFileSync(join(CORPUS, "docx", name));
const sig = (records) => JSON.stringify(records.map((r) => [r.type, r.author, r.paragraphId, r.from, r.to, r.text]));
const kinds = (records) => JSON.stringify(records.map((r) => r.type));

const ctx = makeContext();
loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js", "app/vendor/clioworks-v3/quire-review.js"]);
const review = vm.runInContext("ClioWorksQuireReview", ctx);
const open = async (bytes, name) => {
  ctx.__bytes = bytes;
  return vm.runInContext(`ClioWorksQuireAdapter.open(globalThis.__bytes, { name: ${JSON.stringify(name || "contract.docx")} })`, ctx);
};
const modelOf = async () => (await vm.runInContext("ClioWorksQuireAdapter.loadCodec()", ctx)).D;

/** One resolve → one named undo step → undo restores the exact list → redo brings the result back. */
function assertOneStep(adapter, beforeSig, expectedLabel) {
  test.assert(adapter.canUndo() && adapter.undoLabel() === expectedLabel, `the resolve is one named undo step (${expectedLabel}, got ${adapter.undoLabel() || "none"})`);
  adapter.undo();
  test.assert(sig(review.revisions(adapter)) === beforeSig, `undo restores the exact list (${kinds(review.revisions(adapter))})`);
  adapter.redo();
}

/** A tracked-changes document the vendored codec itself writes: all six kinds. */
async function buildSample() {
  return vm.runInContext(`(async () => {
    const L = await ClioWorksQuireAdapter.loadCodec();
    const D = L.D;
    const doc = D.newDoc();
    const stamp = (id) => ({ author: "Reviewer", date: "2026-02-01T09:00:00Z", id });
    const p1 = D.para([
      D.text("Keep ", {}),
      D.text("new words", { ins: stamp(1) }),
      D.text(" gone words", { del: stamp(2) }),
      D.text(" bold", { chg: Object.assign(stamp(3), { old: {} }) }),
    ], {});
    const p2 = D.para([D.text("Second paragraph", {})], { chg: Object.assign(stamp(4), { old: { jc: "left" } }) });
    const p3 = D.para([D.text("Inserted mark", {})], {});
    p3.mark = { ins: stamp(5) };
    const p4 = D.para([D.text("Deleted mark", {})], {});
    p4.mark = { del: stamp(6) };
    const p5 = D.para([D.text("After", {})], {});
    D.touchList(doc.main);
    doc.main.blocks.push(p1, p2, p3, p4, p5);
    D.reindex(doc);
    return (await L.docx.write(doc, { format: "docx" })).arrayBuffer();
  })()`, ctx);
}

const run = async () => {
  // D17: the corpus file whose name promises tracked changes records none.
  const d17 = await open(docxBytes("D17.docx"), "D17.docx");
  test.assert(review.revisions(d17).length === 0, "D17 records no w:ins/w:del, so the revision list is empty");
  test.assert(review.resolveAll(d17, true, "Accept All Changes") === 0 && !d17.canUndo(), "resolving an empty list raises no undo step");

  // D18: one deletion and a comment range, from a real LibreOffice round-trip file.
  const d18 = await open(docxBytes("D18.docx"), "D18.docx");
  const d18list = review.revisions(d18);
  test.assert(d18list.length === 1 && d18list[0].type === "del" && d18list[0].author === "Miklos Vajna" && d18list[0].text === "Aaa bbb ccc",
    `D18 lists one deletion by Miklos Vajna of "Aaa bbb ccc" (got ${d18list.length ? `${d18list[0].type} ${d18list[0].author} ${JSON.stringify(d18list[0].text)}` : "none"})`);
  test.assert(d18.comments().length === 1, "D18 carries its comment alongside the revision");

  // Rejecting the deletion keeps the text and removes the mark, as one undo step.
  const beforeReject = sig(review.revisions(d18));
  review.resolve(d18, [d18list[0]], false, "Reject Revision");
  test.assert(review.revisions(d18).length === 0, "rejecting the deletion leaves no revisions");
  test.assert(d18.paragraphs()[0].text === "Aaa bbb ccc", "the deleted text stands again");
  assertOneStep(d18, beforeReject, "Reject Revision");

  // Accepting it drops the text; the comment range survives the resolved runs.
  const d18b = await open(docxBytes("D18.docx"), "D18b.docx");
  review.resolve(d18b, review.revisions(d18b), true, "Accept All Changes");
  test.assert(review.revisions(d18b).length === 0, "accept-all leaves zero revisions");
  test.assert(d18b.paragraphs()[0].text === "", "the accepted deletion is gone from the text");
  test.assert(d18b.comments().length === 1, "the comment survives its resolved range");

  // Save → the resolved state persists. Part preservation follows the R1 baseline:
  // the vendored writer renumbers comment ids, so on D18 any model edit (R1's minimal
  // one included) already rewrites more than document.xml — the merged output is
  // discarded and the parts R1's baseline records are the floor. This edit must
  // change no part beyond that; on the codec-built sample below the merge holds and
  // exactly one part may differ.
  const saved18 = await d18b.save();
  test.assert(saved18.mode === "preserving-edit", "the resolved document saves as a preserving edit");
  const baseline18 = JSON.parse(readFileSync(join(CORPUS, "baseline.json"), "utf8")).files.find((row) => row.id === "D18");
  const changed = changedParts(docxBytes("D18.docx"), saved18.bytes);
  test.assert(changed.every((name) => baseline18.changed_parts.includes(name)),
    `no part changes beyond the R1 baseline's own edit (got ${changed.join(", ") || "nothing"})`);
  const d18c = await open(saved18.bytes, "D18c.docx");
  test.assert(review.revisions(d18c).length === 0 && d18c.comments().length === 1, "save → reopen shows the resolved state and keeps the comment");

  // The codec-built sample: all six kinds on one document.
  const sample = await open(await buildSample(), "sample.docx");
  const sampleList = review.revisions(sample);
  test.assert(kinds(sampleList) === JSON.stringify(["ins", "del", "chg", "pchg", "mins", "mdel"]), `the sample lists all six kinds in story order (got ${kinds(sampleList)})`);

  // Accepting one insertion keeps its text and removes its mark.
  const insRecord = sampleList.find((r) => r.type === "ins");
  const keepPara = () => sample.paragraphs().find((p) => p.text.startsWith("Keep"));
  const beforeAccept = sig(review.revisions(sample));
  review.resolve(sample, [insRecord], true, "Accept Revision");
  test.assert(!review.revisions(sample).some((r) => r.type === "ins" && r.text === insRecord.text), "the accepted insertion's mark is gone");
  test.assert(keepPara().text === "Keep new words gone words bold", "the inserted text stands (with the not-yet-resolved deletion still shown)");
  assertOneStep(sample, beforeAccept, "Accept Revision");

  // Rejecting one deletion keeps the text and removes the mark.
  const delRecord = review.revisions(sample).find((r) => r.type === "del");
  const beforeDel = sig(review.revisions(sample));
  review.resolve(sample, [delRecord], false, "Reject Revision");
  test.assert(!review.revisions(sample).some((r) => r.type === "del"), "the rejected deletion's mark is gone");
  test.assert(keepPara().text.includes(" gone words"), "the deleted text stands again");
  assertOneStep(sample, beforeDel, "Reject Revision");

  // A run-format change (chg): accept keeps the run, reject restores the old rPr.
  const chgRecord = review.revisions(sample).find((r) => r.type === "chg");
  const beforeChg = sig(review.revisions(sample));
  review.resolve(sample, [chgRecord], false, "Reject Revision");
  test.assert(keepPara().text.includes(" bold"), "the formatted run keeps its text after the format is rejected");
  assertOneStep(sample, beforeChg, "Reject Revision");

  // A paragraph-format change (pchg): rejecting restores the old paragraph properties.
  const pchgRecord = review.revisions(sample).find((r) => r.type === "pchg");
  const D = await modelOf();
  const sampleDoc = sample.document();
  const beforePchg = sig(review.revisions(sample));
  review.resolve(sample, [pchgRecord], false, "Reject Revision");
  D.reindex(sampleDoc);
  const pchgPara = D.byId(sampleDoc, Number(pchgRecord.paragraphId));
  test.assert(pchgPara && pchgPara.pPr.jc === "left", "rejecting the paragraph-format revision restores the old paragraph properties");
  assertOneStep(sample, beforePchg, "Reject Revision");

  // A paragraph-mark insertion: accepting clears the mark and keeps the paragraph.
  const minsRecord = review.revisions(sample).find((r) => r.type === "mins");
  const paraCount = sample.paragraphs().length;
  const beforeMins = sig(review.revisions(sample));
  review.resolve(sample, [minsRecord], true, "Accept Revision");
  test.assert(sample.paragraphs().length === paraCount, "accepting an inserted paragraph mark keeps the paragraph");
  test.assert(!review.revisions(sample).some((r) => r.type === "mins"), "the paragraph mark's insertion mark is gone");
  assertOneStep(sample, beforeMins, "Accept Revision");

  // A paragraph-mark deletion: accepting joins the paragraph with the next one.
  const mdelRecord = review.revisions(sample).find((r) => r.type === "mdel");
  const beforeMdel = sig(review.revisions(sample));
  const countBeforeJoin = sample.paragraphs().length;
  review.resolve(sample, [mdelRecord], true, "Accept Revision");
  test.assert(sample.paragraphs().length === countBeforeJoin - 1, "accepting a deleted paragraph mark joins the paragraphs");
  test.assert(sample.paragraphs().some((p) => p.text === "Deleted markAfter"), "the joined paragraph carries both halves");
  assertOneStep(sample, beforeMdel, "Accept Revision");

  // Everything resolves as ONE step, and undo brings the whole list back.
  const sample2 = await open(await buildSample(), "sample-all.docx");
  const allBefore = sig(review.revisions(sample2));
  test.assert(review.revisions(sample2).length === 6, `the fresh sample lists six revisions (${review.revisions(sample2).length})`);
  review.resolveAll(sample2, true, "Accept All Changes");
  test.assert(review.revisions(sample2).length === 0, "accept-all leaves zero revisions");
  test.assert(sample2.paragraphs().some((p) => p.text === "Keep new words bold") && sample2.paragraphs().some((p) => p.text === "Deleted markAfter"),
    "the plain text is exactly the accepted state");
  test.assert(sample2.canUndo() && sample2.undoLabel() === "Accept All Changes", "the whole batch is one named undo step (Accept All Changes)");
  sample2.undo();
  test.assert(sig(review.revisions(sample2)) === allBefore, `undo restores the exact list (${kinds(review.revisions(sample2))})`);

  // The resolved document saves, reopens clean, and keeps its plain text. The
  // sample's parts are the writer's own, so the merge holds: document.xml is the
  // only part the resolution has any business changing.
  sample2.redo();
  const sampleBytes = (await sample2.save()).bytes;
  const sampleChanged = changedParts(await buildSample(), sampleBytes);
  // docProps/core.xml carries the save time, so it differs whenever the clock
  // has moved on since the sample was built; it is the only other part allowed.
  const contentChanged = sampleChanged.filter((part) => part !== "docProps/core.xml");
  test.assert(JSON.stringify(contentChanged) === JSON.stringify(["word/document.xml"]), `only word/document.xml differs from the unedited sample, besides the save time (got ${sampleChanged.join(", ")})`);
  const savedSample = await open(sampleBytes, "sample-saved.docx");
  test.assert(review.revisions(savedSample).length === 0, "save → reopen shows zero revisions");
  test.assert(savedSample.paragraphs().some((p) => p.text === "Keep new words bold") && savedSample.paragraphs().some((p) => p.text === "Second paragraph"),
    "the resolved text is what the accepted state says");

  // The lazy windoid module installs its API on its own; ClioWrite maps the steps.
  const uiCtx = makeContext();
  loadScripts(uiCtx, ["app/features/clio-write-review.js"]);
  test.assert(vm.runInContext("typeof AISystem6ClioWriteReview.open === 'function' && typeof AISystem6ClioWriteReview.refresh === 'function' && AISystem6ClioWriteReviewLoaded === true", uiCtx),
    "the review windoid module loads alone and installs open/refresh/close");
  const cwCtx = makeContext();
  loadScripts(cwCtx, ["app/features/clio-write.js"]);
  test.assert(vm.runInContext("AISystem6ClioWrite.stepKey('Accept Revision')", cwCtx) === "clio_write_step_accept_revision"
    && vm.runInContext("AISystem6ClioWrite.stepKey('Accept All Changes')", cwCtx) === "clio_write_step_accept_all",
    "ClioWrite names the review steps in the Edit menu's words");

  test.finish();
};

run();
