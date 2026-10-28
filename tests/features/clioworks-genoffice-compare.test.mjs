// ClioWorks 比较→修订 contract (GenOffice compare, the 1.0.60 gap-fill line):
// ClioWrite's 「与另一份比较…」 compares the live document with a second .docx
// and offers the differences as CANDIDATES — adopting one (or all) writes the
// ins/del stamps into the current model as ONE named model command, and from
// there the N13a revision flow accepts or rejects them. Two VMs, the same split
// the N13b contract uses:
//   - the headless makeContext drives the engine half of
//     features/clio-write-compare.js: two docx built by the vendored codec
//     itself (D.newDoc + L.docx.write — the n13a sample's own road), a
//     changed paragraph / a deleted paragraph / an added paragraph / a changed
//     table cell aligned into four candidates, word-level hunks inside the
//     changed ones, adoption as one undo step, 忽略 touching nothing, the marks
//     round-tripping through L.docx.write so n13a revisions() reads them back,
//     and adopt-all + accept-all turning the document into the other file's
//     words (the whole meaning of 比较→修订).
//   - the linkedom editor VM drives the window: the 命令 menu's row, the
//     windoid's Choose (a native file input behind the button), the author
//     question once (N13b's remembered-name mechanism), 逐条 采用为修订 /
//     忽略, and the Edit ▸ Undo step named in the writer's words.
// Pictures are only reported as a fact (no picture diff): the last engine
// block asserts that path and that such a row adopts nothing.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";
import { createQuireEditorVm } from "../helpers/quire-editor-vm.mjs";

const test = createFeatureTest("clioworks-genoffice-compare");
process.env.TZ = "UTC"; // the codec reads local clock fields (zip stamps)
const DOCX = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-s11.docx")));

/* Two documents the vendored codec itself writes (n13a's buildSample road):
 * paragraphs, one 2×2 table with one-paragraph cells, everything a compare
 * needs. The caller hands back the written bytes. */
const BUILD_TWO = `(async () => {
  const L = await ClioWorksQuireAdapter.loadCodec();
  const D = L.D;
  const para = (text) => D.para([D.text(text, {})], {});
  const tbl = (rows) => {
    const t = { t: 'tbl', id: D.nid(), tblPr: { w: { type: 'auto', v: 0 } }, grid: rows[0].map(() => 2400), rows: [] };
    for (const row of rows) t.rows.push({ id: D.nid(), trPr: {}, cells: row.map((text) => ({ id: D.nid(), tcPr: { w: 2400 }, blocks: [para(text)] })) });
    return t;
  };
  const build = (blocks) => {
    const doc = D.newDoc();
    D.touchList(doc.main);
    doc.main.blocks.push(...blocks);
    D.reindex(doc);
    return doc;
  };
  const A1 = '第一段：今天天气好，风也不大。';
  const A2 = '第二段：我们去公园。';
  const A3 = '第三段：明天继续写。';
  const A4 = '最后一段，谢谢大家。';
  const B1 = '第一段：今天天气坏，风也大。';
  const BADD = '新来的一段，请你过目。';
  const docA = build([para(A1), para(A2), tbl([['项目', '数量'], ['纸箱', '20']]), para(A3), para(A4)]);
  const docB = build([para(B1), para(A2), tbl([['项目', '数量'], ['纸盒', '20']]), para(A4), para(BADD)]);
  const write = async (doc) => new Uint8Array(await (await L.docx.write(doc, { format: 'docx' })).arrayBuffer());
  return { a: await write(docA), b: await write(docB) };
})()`;

const run = async () => {
  /* ============ Part A: the engine, headless (makeContext) ============ */
  {
    const ctx = makeContext();
    ctx.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key);
    loadScripts(ctx, [
      "app/vendor/clioworks-v3/quire-adapter.js",
      "app/vendor/clioworks-v3/quire-review.js",
      "app/core/word-diff.js",
      "app/features/clio-write-compare.js",
      "app/features/clio-write.js",
    ]);
    const compare = ctx.AISystem6ClioWriteCompare;
    const review = ctx.ClioWorksQuireReview;
    const bytes = await vm.runInContext(BUILD_TWO, ctx);
    const open = async (u8, name) => {
      ctx.__bytes = u8;
      return vm.runInContext(`ClioWorksQuireAdapter.open(globalThis.__bytes.slice().buffer, { name: ${JSON.stringify(name)} })`, ctx);
    };
    const a = await open(bytes.a, "本稿.docx");
    const b = await open(bytes.b, "另一份.docx");

    // A1: the step names map, the way 「全部替换 N 处」 does.
    test.assert(ctx.AISystem6ClioWrite.stepKey("比较：采用全部") === "clio_write_step_compare_all"
      && ctx.AISystem6ClioWrite.stepKey("比较：采用第 3 条") === "clio_write_step_compare_one",
      "the adoption step labels map into the Edit menu's step keys");

    // A2: four candidates in reading order — changed, table cell, deleted, added.
    const out = compare.compare(a, b);
    const rows = out.candidates;
    test.assert(rows.length === 4 && JSON.stringify(rows.map((r) => r.kind)) === '["changed","cell","removed","added"]',
      `a changed paragraph, a changed cell, a deleted paragraph and an added paragraph are the four candidates (got ${JSON.stringify(rows.map((r) => r.kind))})`);
    test.assert(out.summary.total === 4 && out.summary.changed === 1 && out.summary.cells === 1 && out.summary.removed === 1 && out.summary.added === 1,
      "the summary counts each kind once");
    const changed = rows[0];
    test.assert(changed.before.includes("好") && changed.after.includes("坏") && changed.hunks.length >= 2
      && changed.hunks.some((hunk) => changed.before.slice(hunk.before.start, hunk.before.end) === "好"),
      "the changed paragraph carries word-level hunks (好→坏 among them), not a whole-paragraph swap");
    const cell = rows[1];
    test.assert(cell.row === 2 && cell.column === 1 && cell.before === "纸箱" && cell.after === "纸盒",
      "the table difference is a cell-aligned mark (row 2, column 1, 纸箱→纸盒)");
    const removed = rows[2];
    test.assert(removed.before === "第三段：明天继续写。" && !!removed.paragraphId, "the deleted paragraph names the paragraph it would strike");
    const added = rows[3];
    test.assert(added.after === "新来的一段，请你过目。" && added.anchorParaId === String(a.paragraphs().find((p) => p.text.startsWith("最后一段")).id),
      "the added paragraph anchors after the last matched paragraph (最后一段)");

    // A3: 采用为修订 is ONE named undo step whose stamps the N13a list reads.
    const beforeRevision = a.getEditRevision();
    test.assert(compare.apply(a, [], "林比较", "比较：采用第 1 条") === 0 && a.getEditRevision() === beforeRevision,
      "adopting nothing (the 忽略 road) touches nothing and raises no step");
    const taken = compare.apply(a, [changed], "林比较", "比较：采用第 1 条");
    test.assert(taken === 1 && a.canUndo() && a.undoLabel() === "比较：采用第 1 条",
      "adopting one candidate is one undo step named 「比较：采用第 1 条」");
    const stamped = review.revisions(a);
    test.assert(stamped.length >= 3 && stamped.every((r) => r.author === "林比较")
      && stamped.some((r) => r.type === "del" && r.text.includes("好")) && stamped.some((r) => r.type === "ins" && r.text.includes("坏")),
      `the marks are ordinary revisions with the compare's author (${stamped.map((r) => r.type + ":" + r.text.slice(0, 3)).join(", ")})`);
    a.undo();
    test.assert(review.revisions(a).length === 0 && a.paragraphs().find((p) => p.text.startsWith("第一段")).text === "第一段：今天天气好，风也不大。",
      "undo takes the marks back exactly");
    a.redo();
    test.assert(review.revisions(a).length === stamped.length, "redo brings the adopted marks back");
    test.assert(!review.revisions(a).some((r) => r.paragraphId === removed.paragraphId),
      "the candidates left undecided (忽略) keep their paragraphs untouched");

    // A4: adopt the rest as ONE step — the cell, the deleted paragraph and the
    // added paragraph all stamp; undo once takes the whole batch down.
    const rest = [cell, removed, added];
    const takenAll = compare.apply(a, rest, "林比较", "比较：采用全部");
    test.assert(takenAll === 3 && a.undoLabel() === "比较：采用全部",
      "「比较：采用全部」 is one step for the whole batch");
    const cellPara = () => vm.runInContext(`L.D.byId(globalThis.__docA, ${JSON.stringify(Number(cell.paragraphId))})`, ctx);
    ctx.__docA = a.document();
    test.assert(!!cellPara() && cellPara().runs.some((r) => r.rPr && r.rPr.del) && cellPara().runs.some((r) => r.rPr && r.rPr.ins),
      "the cell difference lands as paragraph-level del/ins marks inside the table cell");
    const struckPara = vm.runInContext(`L.D.byId(globalThis.__docA, ${JSON.stringify(Number(removed.paragraphId))})`, ctx);
    test.assert(struckPara.runs.every((r) => !globalThisLen(r) || (r.rPr && r.rPr.del)) && struckPara.mark && struckPara.mark.del,
      "the deleted paragraph is struck whole, its paragraph mark included");
    const inserted = a.paragraphs().find((p) => p.text.startsWith("新来的一段"));
    test.assert(!!inserted && a.document().main.blocks.some((blk) => blk.t === "p" && String(blk.id) === inserted.id && blk.mark && blk.mark.ins),
      "the added paragraph stands after its anchor, its runs and mark inserted");
    a.undo();
    test.assert(review.revisions(a).length === stamped.length && !a.paragraphs().some((p) => p.text.startsWith("新来的一段")),
      "one undo takes the whole batch down — inserted paragraph included, the earlier adopted marks untouched");
    a.redo();

    // A5: the marks round-trip — save, reopen, n13a revisions() reads them back.
    const saved = await a.save();
    test.assert(saved.mode === "preserving-edit", "the compared document saves as a preserving edit");
    const reopened = await open(new Uint8Array(saved.bytes), "再开.docx");
    const list = review.revisions(reopened);
    test.assert(list.length >= 6 && list.every((r) => r.author === "林比较") && list.some((r) => r.type === "mins"),
      `w:ins / w:del survive L.docx.write and read back as revisions (${list.length} records, ${[...new Set(list.map((r) => r.type))].join(", ")})`);
    test.assert(reopened.paragraphs().some((p) => p.text.startsWith("新来的一段")), "the inserted paragraph survived the round trip");

    // A6: 比较→修订 end to end — accept everything after adopting everything,
    // and the document's words become the other file's words.
    review.resolveAll(reopened, true, "Accept All Changes");
    const finalTexts = () => reopened.paragraphs().map((p) => p.text);
    const texts = finalTexts();
    test.assert(texts.some((t) => t.startsWith("第一段：今天天气坏，风也大。")) && !texts.some((t) => t.includes("明天继续写")) && texts.some((t) => t.startsWith("新来的一段")),
      "adopt-all + accept-all turns this document into the other file's words");
    const cells = reopened.tables()[0].rows.map((row) => row.map((c) => c.text));
    test.assert(JSON.stringify(cells) === JSON.stringify([["项目", "数量"], ["纸盒", "20"]]),
      "the accepted table cell carries the other file's words (cell-aligned mark)");

    // A7: a picture difference is only reported; adopting it does nothing. The
    // picture is injected into one model directly (a text compare never carries
    // picture bytes); the compare reads models, so that is the honest fixture.
    const PLAIN_DOC = `(async () => {
      const L = await ClioWorksQuireAdapter.loadCodec();
      const D = L.D;
      const doc = D.newDoc();
      D.touchList(doc.main);
      doc.main.blocks.push(D.para([D.text('带图的一句话。', {})], {}));
      D.reindex(doc);
      return new Uint8Array(await (await L.docx.write(doc, { format: 'docx' })).arrayBuffer());
    })()`;
    const plainBytes = await vm.runInContext(PLAIN_DOC, ctx);
    const plain = await open(plainBytes, "无图.docx");
    const withImage = await open(plainBytes, "有图.docx");
    withImage.modelCommand("Typing", () => {
      const D = ctx.L.D;
      const doc = withImage.document();
      // the write→read round trip adds an empty section paragraph ahead of the
      // words; the picture joins the paragraph that actually carries them.
      const p = doc.main.blocks.find((blk) => blk.t === "p" && blk.runs.some((r) => r.t === "text" && r.text && r.text.includes("带图")));
      D.touch(p);
      p.runs.push(D.item("img", { media: "x", w: 10, h: 10 }));
    });
    const imageOut = compare.compare(plain, withImage);
    test.assert(imageOut.candidates.length === 1 && imageOut.candidates[0].kind === "image" && imageOut.candidates[0].adoptable === false,
      "a picture-only difference is one candidate that only reports the fact");
    const rev = plain.getEditRevision();
    test.assert(compare.apply(plain, imageOut.candidates, "林比较", "比较：采用全部") === 0 && plain.getEditRevision() === rev,
      "a reported picture difference adopts nothing and raises no step");
  }

  /* ============ Part B: the window, the real editor VM (linkedom) ============ */
  {
    const v = await createQuireEditorVm({ docx: DOCX, name: "搬家清单.docx" });
    v.load(["app/vendor/clioworks-v3/quire-review.js", "app/core/word-diff.js", "app/features/clio-write-compare.js"]);
    const w = v.window;
    const doc = v.document;
    const api = w.AISystem6ClioWrite;
    const asks = [];
    const answers = ["窗口比较者"];
    w.showInputDialog = async ({ defaultValue }) => { asks.push(defaultValue); return answers.shift() ?? null; };
    const drain = async () => { for (let i = 0; i < 40; i += 1) { await Promise.resolve(); await new Promise((r) => setImmediate(r)); } v.flush(); };
    const live = () => v.record.liveAdapter;

    const out = await api.open(v.record, {});
    test.assert(out.ok, "(setup) the document is mounted");

    // B1: the 命令 menu carries the row.
    v.fire(doc.querySelector(".cw-trailing .cw-pop"), "click");
    const row = doc.querySelector('.cw-menu [data-menu-command="compare.open"]');
    test.assert(!!row, "the 命令 menu lists 「与另一份比较…」");
    row.dispatchEvent(v.make("click"));
    await drain();
    const windoid = doc.querySelector(".cw-compare-windoid");
    test.assert(!!windoid && windoid.textContent.includes("clio_write_compare_hint"),
      "the compare windoid opens beside the revisions rows and asks for the second file");

    // B2: build the other file from the same fixture (one paragraph edited, one
    // more edited), then pick it through the windoid's own Choose input.
    v.context.__baseDocx = DOCX;
    const otherBytes = await v.run(`(async () => {
      const adapter = await ClioWorksQuireAdapter.open(new Uint8Array(globalThis.__baseDocx).slice().buffer, { name: '另一份.docx' });
      const D = L.D;
      const doc = adapter.document();
      const byText = (start) => doc.main.blocks.find((blk) => blk.t === 'p' && blk.runs.map((r) => r.text || '').join('').startsWith(start));
      adapter.modelCommand('Typing', () => {
        const one = byText('这个周末');
        D.touch(one); one.runs[0].text = '下个周末才把东西搬到新家，先看安排。';
        const last = byText('最后一段');
        D.touch(last); last.runs[0].text = '最后一段，改了一点。';
      });
      const saved = await adapter.save();
      return new Uint8Array(saved.bytes);
    })()`);
    // The throwaway adapter bound the model; the live window's own next step rebinds.
    live().canUndo();
    const picker = windoid.querySelector("input[data-compare-pick]");
    test.assert(!!picker, "the native file input sits behind the Choose button");
    picker.files = [{ name: "另一份.docx", arrayBuffer: async () => otherBytes.buffer.slice(otherBytes.byteOffset, otherBytes.byteOffset + otherBytes.byteLength) }];
    picker.dispatchEvent(v.make("change"));
    await drain();
    test.assert(asks.length === 1 && asks[0] === "" && windoid.textContent.includes("clio_write_compare_author_line:窗口比较者"),
      "the first compare asks for the revision name once (N13b's remembered-name road) and shows it");
    const cards = [...windoid.querySelectorAll(".cw-compare")];
    test.assert(cards.length === 2 && cards.every((card) => card.querySelector("del") && card.querySelector("ins")),
      "two changed paragraphs arrive as candidates with struck and underlined words (1-bit, the document's own marks)");

    // B3: adopt one, ignore the other — one named step, the ignored one untouched.
    const adoptButton = cards[0].querySelector(".windoid-actions .btn");
    test.assert(adoptButton && adoptButton.textContent === "clio_write_compare_adopt", "(setup) the first card offers 采用为修订");
    adoptButton.dispatchEvent(v.make("click"));
    await drain();
    test.assert(api.editHistory().undoLabel() === "clio_write_step_compare_one" && JSON.stringify(api.editHistory().undoLabelArgs()) === "[1]",
      "adopting one candidate is the Edit menu's 「采用比较第 1 条」 step");
    const list = w.ClioWorksQuireReview.revisions(live());
    test.assert(list.length >= 2 && list.every((r) => r.author === "窗口比较者"),
      "the adopted marks are revisions the N13a windoid can now accept or reject");
    const ignoreButton = [...windoid.querySelectorAll(".cw-compare")].find((card) => card.textContent.includes("clio_write_compare_ignore"))?.querySelector(".windoid-actions .btn:last-child");
    test.assert(!!ignoreButton, "(setup) the undecided card still offers 忽略");
    ignoreButton.dispatchEvent(v.make("click"));
    await drain();
    const ignoredCard = [...windoid.querySelectorAll(".cw-compare")].find((card) => card.textContent.includes("clio_write_compare_ignored"));
    test.assert(!!ignoredCard && w.ClioWorksQuireReview.revisions(live()).length === list.length,
      "忽略 only records the decision — the document is unchanged");

    // B4: the adopted marks survive save → reopen (n13a reads them back).
    const savedB = await live().save();
    v.__savedB = new Uint8Array(savedB.bytes);
    const reopenedB = await v.openAdapter(v.__savedB, "比较后.docx");
    const listB = w.ClioWorksQuireReview.revisions(reopenedB);
    test.assert(listB.length >= 2 && listB.every((r) => r.author === "窗口比较者") && listB.some((r) => r.text.includes("先看")),
      "the compare's revision marks round-trip through the window's own save");

    doc.querySelector(".cw-compare-windoid .windoid-close").dispatchEvent(v.make("click"));
  }

  test.finish();
};

/* ilen without reaching into the VM's closures: text runs carry .text.length,
 * every other item is one character; markers are zero. */
function globalThisLen(run) {
  if (!run) return 0;
  if (run.t === "text") return String(run.text || "").length;
  if (["cs", "ce", "bs", "be", "fb", "fs", "fe", "perm", "sdts", "sdte"].includes(run.t)) return 0;
  return 1;
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
