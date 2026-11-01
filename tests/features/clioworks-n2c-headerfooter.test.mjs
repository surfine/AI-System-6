// ClioWorks N2c contract: header, footer and page-number editing round-trip through the
// vendored Quire codec (adapter.headerFooter / setHeaderFooterText / insertHeaderFooterField),
// and the D20 comment ids (0, 3, 7, 9) survive an unrelated edit unchanged.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createQuireEditorVm } from "../helpers/quire-editor-vm.mjs";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-n2c-headerfooter");
process.env.TZ = "UTC";

const ctx = makeContext();
loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js"]);
const open = async (data, name) => { ctx.__bytes = data; return vm.runInContext(`ClioWorksQuireAdapter.open(globalThis.__bytes, { name: ${JSON.stringify(name)} })`, ctx); };
const bytesOf = (path) => new Uint8Array(readFileSync(resolveProjectPath(path)));

const run = async () => {
  // A: a document without header or footer gets both, with text and PAGE / NUMPAGES fields.
  const plain = await open(bytesOf("tests/fixtures/clioworks-s11/quire-s11.docx"), "plain.docx");
  test.assert(plain.headerFooter("hdr") === null && plain.headerFooter("ftr") === null, "the plain fixture has no header or footer");
  plain.setHeaderFooterText("hdr", "default", "搬家清单 · 草稿");
  plain.setHeaderFooterText("ftr", "default", "第 ");
  plain.insertHeaderFooterField("ftr", "default", "PAGE");
  plain.insertHeaderFooterField("ftr", "default", "NUMPAGES");
  test.assert(plain.isDirty() && plain.undoLabel() === "Insert Page Count", "each edit is one named undo step");
  const saved = await plain.save();
  const back = await open(saved.bytes, "plain2.docx");
  const hdr = back.headerFooter("hdr"), ftr = back.headerFooter("ftr");
  test.assert(hdr && hdr.paragraphs[0].text === "搬家清单 · 草稿", "the edited header reads back after save → reopen");
  test.assert(ftr && ftr.paragraphs[0].fields.join() === "PAGE,NUMPAGES", `the footer keeps its PAGE and NUMPAGES fields (got ${ftr && ftr.paragraphs[0].fields.join()})`);

  // A2: a document that already has a header or footer edits it in place (D04 carries one).
  const d04 = await open(bytesOf("tests/fixtures/real-corpus/docx/D04.docx"), "D04.docx");
  const had = ["hdr", "ftr"].map((k) => d04.headerFooter(k)).find(Boolean);
  test.assert(!!had, "D04 carries a header or footer");
  d04.setHeaderFooterText(had.kind, had.type, "Edited here");
  d04.insertHeaderFooterField(had.kind, had.type, "PAGE");
  const d04b = await open((await d04.save()).bytes, "D04b.docx");
  const edited = d04b.headerFooter(had.kind, had.type);
  test.assert(edited && edited.paragraphs[0].text === "Edited here" && edited.paragraphs.some((p) => p.fields.includes("PAGE")), "an existing header or footer takes the edit and the field");

  // B: comment ids stay what the file had; a new comment takes a free id.
  const d20 = await open(bytesOf("tests/fixtures/real-corpus/docx/D20.docx"), "D20.docx");
  const first = d20.paragraphs()[0];
  const textRun = d20.runs(first.id).find((r) => r.kind === "text");
  d20.setRunText(first.id, textRun.runIndex, textRun.text + "!");
  const kept = await open((await d20.save()).bytes, "D20b.docx");
  test.assert(kept.comments().map((c) => c.id).join() === "0,3,7,9", `D20 keeps comment ids 0,3,7,9 (got ${kept.comments().map((c) => c.id).join()})`);
  test.assert(kept.comments().find((c) => c.id === "9").parentId === "7", "the reply still points at its root");
  kept.addComment(kept.paragraphs()[0].id, null, { author: "A", text: "new" });
  const grown = await open((await kept.save()).bytes, "D20c.docx");
  test.assert(grown.comments().map((c) => c.id).sort().join() === "0,1,3,7,9", "a new comment takes a free id; the old ones keep theirs");

  // C: the window — 插入 › 页码 opens the footer in the page view, editable, with a PAGE field; Esc closes it.
  {
    const v = await createQuireEditorVm({ docx: new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-s11.docx"))), name: "搬家清单.docx" });
    v.load(["app/features/clio-write-fonts.js"]);
    const api = v.window.AISystem6ClioWrite;
    const tick = async () => { for (let i = 0; i < 6; i += 1) { await Promise.resolve(); await new Promise((r) => setImmediate(r)); } v.flush(); };
    await api.open(v.record, {});
    await tick();
    const menu = v.menuSets.clioWrite.find((m) => m.id === "insert");
    test.assert(menu && menu.items.filter((i) => i.action).map((i) => i.action).join() === "clio-write-insert-header,clio-write-insert-footer,clio-write-insert-page-number", "the 插入 menu holds 页眉, 页脚, 页码");
    v.menu("clio-write-insert-page-number").run();
    await tick();
    const ftr = v.document.querySelector(".pg-ftr");
    test.assert(api.current().view === "pages" && ftr && v.run("L.layout.hfEdit") !== null, "the footer box is open for editing in the page view");
    const live = v.record.liveAdapter;
    test.assert(live.headerFooter("ftr").paragraphs.some((p) => p.fields.includes("PAGE")) && live.isDirty(), "the page number is in the footer and the document is dirty");
    v.fire(v.document.querySelector("#pages") || v.document.body, "keydown", { key: "Escape" });
    await tick();
    test.assert(v.run("L.layout.hfEdit") === null && v.run("L.ed.readOnly") === true, "Esc closes the footer");
  }

  test.finish();
};
run().catch((error) => { console.error(error); process.exitCode = 1; });
