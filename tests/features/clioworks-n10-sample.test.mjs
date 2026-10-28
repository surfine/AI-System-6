// ClioWorks N10 contract: the first sample, on the real code paths.
//   - the sample docx (tests/fixtures/clioworks-n10/quire-n10.docx, built by
//     generate-docx.mjs next to it) is opened in the REAL editor surface
//     (tests/helpers/quire-editor-vm.mjs: layout.js, drawing.js, editor.js and
//     clio-write.js with its capture gate, over a linkedom document);
//   - 门一: typing inside a table cell goes through E.edit → D.tx → doc-changed →
//     adapter.syncExternal() (the one write-back path), one named undo step, and a
//     save keeps the untouched <w:drawing> byte-identical;
//   - 门二: the insert command puts {t:'img', media, w, h} at the caret — L.docx.write
//     round-trips a w:drawing plus a NEW media part with the exact source bytes and the
//     pixel-derived w:extent — a clipboard screenshot takes the same command, and a
//     corner drag resizes with the aspect locked as one 「Resize Picture」 step;
//   - the floor under it all: two REAL R1 corpus files (D04, D08) take a one-character
//     cell edit, and the saved package changes no part beyond the R1 baseline's own
//     edit (tooling/clioworks-r1-corpus.mjs's CORPUS/changedParts, the n13a technique).
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { createQuireEditorVm } from "../helpers/quire-editor-vm.mjs";
import { changedParts, CORPUS } from "../../tooling/clioworks-r1-corpus.mjs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-n10-sample");
process.env.TZ = "UTC"; // the codec reads local clock fields (zip stamps)

const SAMPLE = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-n10/quire-n10.docx")));
const zipOf = (bytes) => new AdmZip(Buffer.from(bytes));
const drawingOf = (bytes) => zipOf(bytes).readAsText("word/document.xml").match(/<w:drawing>[\s\S]*?<\/w:drawing>/g) || [];
const SOURCE_PNG = zipOf(SAMPLE).getEntry("word/media/image1.png").getData();

const v = await createQuireEditorVm({ docx: SAMPLE, name: "quire-n10.docx" });
const w = v.window;
const doc = v.document;
const api = w.AISystem6ClioWrite;
const E = () => v.run("L.ed");
const D = () => v.run("L.D");
const pages = () => doc.querySelector("#pages");
const receipt = () => doc.querySelector(".cw-receipt").textContent;
const byText = (adapter, text) => adapter.paragraphs().find((p) => p.text.startsWith(text));
const tick = async () => { for (let i = 0; i < 8; i += 1) { await Promise.resolve(); await new Promise((r) => setImmediate(r)); } v.flush(); };
const settle = async (done) => { for (let i = 0; i < 300 && !done(); i += 1) await tick(); };

async function fresh(mode = "express") {
  v.modal.answers.length = 0;
  if (api.current()) { if (api.current().dirty) v.modal.answers.push("no"); await api.close(); }
  v.record.liveAdapter = await v.openAdapter();
  const out = await api.open(v.record, {});
  if (!out.ok) throw new Error("open failed: " + JSON.stringify(out));
  if (mode === "full") v.fire(doc.querySelector(".cw-scroller"), "keydown", { key: "e", metaKey: true });
  if (api.current().mode !== mode) throw new Error("mode " + mode + " not reached");
  return v.record.liveAdapter;
}
const cellCaret = (adapter, row, col, offset = 0) => {
  const p = D().byId(adapter.document(), Number(adapter.tables()[0].rows[row][col].paragraphIds[0]));
  E().setSel(D().pos(p, offset), D().pos(p, offset));
  return p;
};
const imageItem = (adapter, text) => {
  const p = D().byId(adapter.document(), Number(byText(adapter, text).id));
  const it = p.runs.find((r) => r.t === "img");
  return { w: it.w, h: it.h };
};

try {
  // ---- 门一: the words inside a cell, through the editor's own path ----
  {
    for (const mode of ["express", "full"]) {
      const adapter = await fresh(mode);
      cellCaret(adapter, 1, 0);
      const rev = adapter.getEditRevision();
      v.fire(pages(), "beforeinput", { inputType: "insertText", data: "两" });
      await tick();
      test.assert(adapter.tables()[0].rows[1][0].text === "两纸箱" && adapter.isDirty() && adapter.getEditRevision() === rev + 1,
        `${mode}: typing in a table cell lands in the cell's words and is counted once`);
      test.assert(api.editHistory().undoLabel() === "clio_write_step_typing", `${mode}: the cell's typing is one step named 「键入」`);
      api.editHistory().undo();
      test.assert(adapter.tables()[0].rows[1][0].text === "纸箱", `${mode}: one Undo takes the cell's words back`);
      // the structure stays shut: Enter inside a cell is refused naming the table.
      cellCaret(adapter, 1, 0, 1);
      v.fire(pages(), "keydown", { key: "Enter" });
      await tick();
      test.assert(adapter.tables()[0].rows.length === 3 && adapter.tables()[0].rows[1][0].text === "纸箱" && receipt().startsWith("clio_write_receipt_refused:clio_write_reason_table"),
        `${mode}: Enter inside the cell (structure) is refused and names the table`);
    }
  }

  // ---- 门一 save: the cell's words change, the untouched drawing's bytes do not ----
  {
    const adapter = await fresh("express");
    cellCaret(adapter, 2, 1);
    v.fire(pages(), "beforeinput", { inputType: "insertText", data: "五" });
    await tick();
    v.fire(doc.querySelector(".cw-scroller"), "keydown", { key: "s", metaKey: true });
    await settle(() => !/clio_write_receipt_saving/.test(receipt()));
    const saved = v.working();
    test.assert(receipt().startsWith("clio_write_receipt_saved") && !adapter.isDirty(), `⌘S stores the cell's edit (${receipt()})`);
    const back = await v.openAdapter(saved.slice(), "reread.docx");
    test.assert(back.tables()[0].rows[2][1].text === "五5" && back.tables()[0].rows[1][0].text === "纸箱", "the saved package reads back with the cell's new word");
    test.assert(drawingOf(saved).length === 1 && drawingOf(saved)[0] === drawingOf(SAMPLE)[0],
      "the untouched <w:drawing> keeps its exact bytes through the cell edit and save");
    test.assert(zipOf(saved).getEntry("word/media/image1.png").getData().equals(SOURCE_PNG), "the untouched picture part keeps its exact bytes");
  }

  // ---- 门二: the insert command, through L.docx.write and through ⌘S ----
  {
    const adapter = await fresh("express");
    const p = D().byId(adapter.document(), Number(byText(adapter, "这份文件给作者过目").id));
    E().setSel(D().pos(p, 4), D().pos(p, 4));
    const blob = new w.Blob([SOURCE_PNG], { type: "image/png" });
    const out = await api.insertImage(blob);
    test.assert(out.status === "ok" && out.w === 45 && out.h === 30,
      `插入 › 图片… puts a 60×40 px picture at 45×30 pt (got ${JSON.stringify(out)})`);
    test.assert(api.editHistory().undoLabel() === "clio_write_step_insert_image", "the insert is one step named 「插入图片」");
    // The codec's own round trip: a NEW media part and the pixel-derived extent.
    const written = await v.run('(async () => (await L.docx.write(L.D.doc, { format: "docx" })).arrayBuffer())()');
    const wz = zipOf(written);
    const media = wz.getEntries().map((e) => e.entryName).filter((n) => n.startsWith("word/media/")).sort();
    test.assert(media.join(",") === "word/media/image1.png,word/media/image2.png",
      `L.docx.write emits the original media part plus the inserted one (${media.join(",")})`);
    test.assert(wz.getEntry("word/media/image2.png").getData().equals(SOURCE_PNG), "the inserted media part carries the exact source bytes");
    const extents = [...wz.readAsText("word/document.xml").matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => `${m[1]}x${m[2]}`);
    test.assert(extents.includes("571500x381000") && extents.includes("1143000x762000"),
      `w:extent is the pixels in EMU (45×30 pt = 571500×381000) beside the original 90×60 pt (${extents.join(",")})`);
    // ⌘S through the real native host, then reopen: the picture is a first-class item again.
    v.fire(doc.querySelector(".cw-scroller"), "keydown", { key: "s", metaKey: true });
    await settle(() => !/clio_write_receipt_saving/.test(receipt()));
    const stored = v.working();
    const sz = zipOf(stored);
    test.assert(sz.getEntry("word/media/image2.png") && sz.getEntry("word/media/image2.png").getData().equals(SOURCE_PNG) && sz.getEntry("word/media/image1.png").getData().equals(SOURCE_PNG),
      "⌘S stores both media parts with their exact bytes");
    const back = await v.openAdapter(stored.slice(), "with-picture.docx");
    const withPic = byText(back, "这份文件给作者过目");
    test.assert(!!withPic && withPic.runs.some((r) => r.kind === "image"), "the stored package reads back with the inserted picture as an image run");
    api.editHistory().undo();
    test.assert(!byText(adapter, "这份文件给作者过目").runs.some((r) => r.kind === "image"), "one Undo takes the inserted picture out again");
  }

  // ---- 门二: a screenshot on the clipboard takes the same command ----
  {
    const adapter = await fresh("express");
    const p = D().byId(adapter.document(), Number(byText(adapter, "上面是一张测试图").id));
    E().setSel(D().pos(p, 0), D().pos(p, 0));
    const blob = new w.Blob([SOURCE_PNG], { type: "image/png" });
    v.fire(pages(), "paste", { clipboardData: {
      getData: () => "",
      items: [{ kind: "file", type: "image/png", getAsFile: () => blob }],
    } });
    await tick();
    test.assert(byText(adapter, "上面是一张测试图").runs.filter((r) => r.kind === "image").length === 2,
      "a clipboard picture file item lands at the caret (the paragraph now holds two pictures)");
    test.assert(api.editHistory().undoLabel() === "clio_write_step_paste_image", "the paste is one step named 「粘贴图片」");
    // Text paste keeps its behaviour exactly: plain text, nothing else.
    E().setSel(D().pos(p, 0), D().pos(p, 0));
    v.fire(pages(), "paste", { clipboardData: { getData: () => "贴字", items: [] } });
    await tick();
    test.assert(byText(adapter, "贴字上面是一张测试图") && api.editHistory().undoLabel() === "clio_write_step_paste",
      "a text paste still lands as plain text, one 「粘贴」 step");
  }

  // ---- 门二: a corner drag resizes, one step, aspect locked ----
  {
    const adapter = await fresh("full");
    const before = imageItem(adapter, "上面是一张测试图");
    const img = pages().querySelector(".img");
    v.fire(img, "mousedown", { button: 0, clientX: 4, clientY: 4 });
    await tick();
    const handle = doc.querySelector(".obj-handles .oh-se");
    test.assert(!!handle && !!E().objSel, "the picture is selected and its corner handle is there");
    if (handle) {
      v.fire(handle, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
      v.fire(doc, "pointermove", { clientX: 400, clientY: 400, buttons: 1 });
      v.fire(doc, "pointerup", { button: 0, clientX: 400, clientY: 400 });
    }
    await tick();
    const after = imageItem(adapter, "上面是一张测试图");
    test.assert(after.w > before.w && after.h > before.h && Math.abs(after.w / after.h - before.w / before.h) < 0.01,
      `the corner drag grows the picture with the aspect locked (${before.w}×${before.h} → ${after.w}×${after.h})`);
    test.assert(api.editHistory().undoLabel() === "clio_write_step_resize_picture", "the resize is one step named 「调整图片大小」");
    api.editHistory().undo();
    const restored = imageItem(adapter, "上面是一张测试图");
    test.assert(restored.w === before.w && restored.h === before.h, "one Undo restores w/h exactly");
    // and a resized picture saves with the new extent, its media bytes untouched.
    v.fire(img, "mousedown", { button: 0, clientX: 4, clientY: 4 });
    await tick();
    const handle2 = doc.querySelector(".obj-handles .oh-se");
    if (handle2) {
      v.fire(handle2, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
      v.fire(doc, "pointermove", { clientX: 250, clientY: 250, buttons: 1 });
      v.fire(doc, "pointerup", { button: 0, clientX: 250, clientY: 250 });
    }
    await tick();
    const saved = await adapter.save();
    const extents = [...zipOf(saved.bytes).readAsText("word/document.xml").matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => `${m[1]}x${m[2]}`);
    test.assert(!extents.includes("1143000x762000") && zipOf(saved.bytes).getEntry("word/media/image1.png").getData().equals(SOURCE_PNG),
      `the resized picture saves with a new w:extent and the same media bytes (${extents.join(",")})`);
  }

  // ---- typing still never lands on a picture ----
  {
    const adapter = await fresh("express");
    const img = pages().querySelector(".img");
    v.fire(img, "mousedown", { button: 0, clientX: 4, clientY: 4 });
    await tick();
    v.fire(pages(), "beforeinput", { inputType: "insertText", data: "字" });
    test.assert(receipt().startsWith("clio_write_receipt_refused:clio_write_reason_image") && !adapter.isDirty(),
      `typing with the picture selected is refused naming the picture (${receipt()})`);
    v.fire(pages(), "keydown", { key: "ArrowRight" });
    test.assert(E().objSel === null, "an arrow key hands the caret back");
    v.fire(doc, "pointerup", { button: 0, clientX: 4, clientY: 4 });
  }

  // ---- the floor: two REAL R1 corpus files take a one-character cell edit ----
  {
    const baseline = JSON.parse(readFileSync(join(CORPUS, "baseline.json"), "utf8")).files;
    const ctx = makeContext();
    loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js"]);
    const openBytes = async (bytes, name) => {
      ctx.__bytes = bytes;
      return vm.runInContext(`ClioWorksQuireAdapter.open(globalThis.__bytes, { name: ${JSON.stringify(name)} })`, ctx);
    };
    for (const id of ["D04", "D08"]) {
      const bytes = new Uint8Array(readFileSync(join(CORPUS, "docx", `${id}.docx`)));
      const d = await openBytes(bytes, `${id}.docx`);
      // the first cell with a text run, the way the editor would find the caret's paragraph
      ctx.__adapter = d;
      const cellId = vm.runInContext(`(() => {
        const a = globalThis.__adapter; const D = L.D;
        for (const t of a.tables()) for (const row of t.rows) for (const c of row) for (const pid of c.paragraphIds) {
          const p = D.byId(a.document(), Number(pid));
          const run = p.runs.find((r) => r.t === 'text' && r.text);
          if (run) return String(p.id);
        }
        return null;
      })()`, ctx);
      test.assert(!!cellId, `${id}: a table cell with words is found`);
      const before = d.tables().map((t) => t.rows.map((r) => r.map((c) => c.text)));
      vm.runInContext(`(() => {
        const D = L.D; const p = D.byId(D.doc, ${Number(cellId)});
        D.tx('Typing', () => { D.touch(p); const run = p.runs.find((r) => r.t === 'text' && r.text); run.text = '改' + run.text; });
      })()`, ctx);
      test.assert(d.syncExternal() === true && d.undoLabel() === "Typing" && JSON.stringify(d.tables().map((t) => t.rows.map((r) => r.map((c) => c.text)))) !== JSON.stringify(before),
        `${id}: the upstream-path cell edit is counted once through syncExternal, one named step`);
      const saved = await d.save();
      const floor = baseline.find((row) => row.id === id).changed_parts;
      const changed = changedParts(bytes, saved.bytes);
      test.assert(changed.every((name) => floor.includes(name)),
        `${id}: the cell edit changes no package part beyond the R1 baseline's own edit (got ${changed.join(", ")})`);
      d.undo();
      test.assert(JSON.stringify(d.tables().map((t) => t.rows.map((r) => r.map((c) => c.text)))) === JSON.stringify(before), `${id}: undo restores the cell's words`);
    }
  }
} catch (error) {
  test.assert(false, `the contract ran to the end: ${error && error.stack || error}`);
}
test.finish();
