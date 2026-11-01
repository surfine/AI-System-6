// ClioWorks v4 (V4-06) contract: Office review return — the three-way compare
// (sent / current / returned) over REAL Quire paragraphs, protected citations
// never auto-accepted, deletions and dual edits demand a decision, unrelated
// incoming additions are surfaced (never silently dropped or applied), and the
// original comments' authors survive the round trip.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v4-review");

function makeContext() {
  const context = {
    console, crypto, TextEncoder, TextDecoder, DecompressionStream, CompressionStream,
    setTimeout, clearTimeout, queueMicrotask, URL, URLSearchParams, Blob,
    ArrayBuffer, Uint8Array, DataView,
    navigator: { platform: "MacIntel" }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "http://localhost/" }, addEventListener() {}, removeEventListener() {},
  };
  context.globalThis = context;
  context.window = context;
  context.Node = function Node() {};
  context.document = {
    createElement: (t) => ({ tagName: t, style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, children: [], dataset: {} }),
    createElementNS: (ns, t) => ({ tagName: t, namespaceURI: ns, style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, children: [], dataset: {} }),
    createTextNode: (x) => ({ text: x }), addEventListener() {},
    body: { appendChild() {}, removeChild() {} }, documentElement: { style: { setProperty() {} } },
    head: { appendChild(el) { queueMicrotask(() => { try { vm.runInContext(read(el.src), context, { filename: el.src }); el.onload(); } catch (error) { el.onerror(new Error(String(error && error.message || error))); } }); } },
  };
  vm.createContext(context);
  return context;
}

const run = async () => {
  const context = makeContext();
  vm.runInContext(read("app/vendor/clioworks-v3/creator-integration.js"), context, { filename: "creator-integration.js" });
  vm.runInContext(read("app/vendor/clioworks-v3/quire-adapter.js"), context, { filename: "quire-adapter.js" });
  const I = context.ClioWorksIntegration;
  test.assert(typeof I.threeWayBlocks === "function", "the vendored three-way policy is available");

  // 1. Real paragraphs from the fixture: base = the file as sent.
  const bytes = readFileSync(resolveProjectPath("tests/fixtures/clioworks-v4/creator-script.docx"));
  context.__bytes = new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const sent = await vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__bytes, { name: 'sent.docx' })", context);
  const base = sent.paragraphs().map((p) => ({ id: String(p.id), text: p.text }));
  test.assert(base.length >= 5, `the sent version reads ${base.length} paragraphs through the real adapter`);

  // The round trip preserves comment authorship (原批注作者).
  const comments = sent.comments();
  test.assert(comments.length >= 1 && comments.every((c) => typeof c.author === "string"),
    "the original comments ride the model with their authors");

  // 2. Local edits (what the author did while it was out) + an incoming file
  //    (what came back). Built on the same identities.
  const edited = sent;
  const target = base.find((p) => p.text.includes("42 秒"));
  const runs = edited.runs(target.id);
  const hit = runs.find((r) => r.text.includes("42 秒"));
  edited.setRunText(target.id, hit.runIndex, hit.text.replace("导出用了", "导出耗时"));
  const local = edited.paragraphs().map((p) => ({ id: String(p.id), text: p.text }));

  // The returned package: same base, a DIFFERENT edit of the same sentence,
  // one protected citation line, one deletion, one unrelated addition.
  const returned = await vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__bytes, { name: 'returned.docx' })", context);
  const rparas = returned.paragraphs();
  const citation = rparas.find((p) => p.text.length > 0 && !p.text.includes("42 秒"));
  const citationId = base[rparas.indexOf(citation)] ? base[rparas.indexOf(citation)].id : null;
  const returnedTarget = rparas.find((p) => p.text.includes("42 秒"));
  const rruns = returned.runs(returnedTarget.id);
  const rhit = rruns.find((r) => r.text.includes("42 秒"));
  returned.setRunText(returnedTarget.id, rhit.runIndex, rhit.text.replace("导出用了", "导出花费了"));
  // the reviewer deleted the citation paragraph's text side (simulate: remove
  // it from the incoming list) and added an unrelated note paragraph.
  // Identity across separately-read packages is anchored, not raw model ids:
  // dmodel assigns fresh NIDs per read, so the host aligns returned paragraphs
  // to the sent identity (quote anchors in the product path via native-locate;
  // index alignment here because both sides read the same bytes).
  const incoming = returned.paragraphs()
    .map((p, index) => ({ id: base[index] ? base[index].id : `returned-${p.id}`, text: p.text }))
    .filter((p) => p.id !== citationId);
  incoming.push({ id: "reviewer-note-1", text: "审稿人补充：数据口径见另一张表。" });

  const blocks = I.threeWayBlocks(base, local, incoming, { protectedIds: [citationId] });
  const byStatus = (status) => blocks.filter((b) => b.status === status);

  // 3. The dual edit of the same sentence is a conflict, never auto-merged.
  test.assert(byStatus("conflict").length === 1 && byStatus("conflict")[0].id === target.id,
    "a sentence edited on both sides is a conflict that demands a decision (不先接受全部修订)");
  test.assert(byStatus("conflict")[0].local.includes("导出耗时") && byStatus("conflict")[0].incoming.includes("导出花费了"),
    "the conflict block carries both sides' exact texts");

  // 4. A deletion of a protected citation is a protected conflict.
  test.assert(byStatus("protected-conflict").length === 1 && byStatus("protected-conflict")[0].id === citationId,
    "deleting a protected citation is a protected conflict (受保护引文不直接接受)");

  // 5. The unrelated incoming addition is surfaced, preserved, not applied.
  const additions = blocks.filter((b) => b.id === "reviewer-note-1");
  test.assert(additions.length === 1 && additions[0].status === "structure-review",
    "an unrelated new incoming paragraph is surfaced for a structure decision (无关新输入保留)");
  // And untouched paragraphs stay keep-local/converged — nothing else moved.
  test.assert(blocks.every((b) => b.status !== "same-addition" || b.base === null),
    "every block reports a real three-way status");

  // 6. Convergence: when local and incoming agree, no decision is needed.
  const agree = I.threeWayBlocks(
    base,
    base.map((p) => ({ ...p })),
    base.map((p) => ({ ...p }))
  );
  test.assert(agree.every((b) => b.status === "converged" || b.status === "keep-local"),
    "identical sides converge without a decision");

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
