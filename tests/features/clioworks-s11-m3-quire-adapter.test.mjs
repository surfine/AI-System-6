// ClioWorks S11 M3 (front) contract: the Quire adapter's narrow write surface over the REAL
// vendored codec + ops and the frozen quire-s11.docx. Every S11-4 / S11-23 item is checked the
// way a user experiences it: edit, save, reopen, read back.
//   - the upstream edit layer is vendored byte-for-byte (ops.js with the codec; editor.js,
//     layout.js, drawing.js behind a second lazy point);
//   - isDirty()/markSaved(rev)/getEditRevision() are the single dirty source;
//   - D.doc is bound at open (not first inside save) and each adapter owns its undo history;
//   - undo/redo are one labelled step per edit;
//   - heading 1-3, run text, split/merge, bold/italic/underline, bullet/number/none lists;
//   - comments add / reply / done round-trip with parent and landing range;
//   - the adapter's narrow face still refuses every table and image write (it serves the
//     menu and find/replace); a table cell's words change only through the upstream
//     editor's own path, which reports in via syncExternal (N10);
//   - an unedited document saves as the original bytes and reports no loss.
import vm from "node:vm";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-s11-m3-quire-adapter");
const DOCX = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-s11.docx")));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

// Vendored byte-for-byte from VibeOffice pin 32ff53a5da0e75ebac11acdb0251cd3d8c7bf408.
const VENDORED = {
  "ops.js": "60932bf0147e8e620d89953872d7a65f7101dd432ab9832311a26310f8f35c6e",
  "editor.js": "ef0832a2ea4d2d9048cf260816f5a0c3a75e7e4b9413a741c9a1ff9afacce192",
  "layout.js": "8263bb50c6e2433507a167375b3317c5407c6d575e70d907d9b8008d06f1ccc4",
  "drawing.js": "4e73fec0368ba92f08e610b76b6dc409fba4244ea4e654bc7df89e012f325401",
};

function session() {
  const ctx = makeContext();
  loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js"]);
  const open = async (bytes = DOCX, meta = { name: "搬家清单.docx" }) => {
    ctx.__bytes = bytes;
    ctx.__meta = meta;
    return vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__bytes, globalThis.__meta)", ctx);
  };
  return { ctx, open };
}
const bytesOf = (out) => new Uint8Array(out.bytes);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const byText = (doc, text) => doc.paragraphs().find((p) => p.text.startsWith(text));
const part = (bytes, name) => { const e = new AdmZip(Buffer.from(bytes)).getEntry(name); return e ? e.getData() : null; };

const run = async () => {
  // 1. The vendored edit layer is the upstream bytes, and the lazy split is as declared.
  for (const [name, digest] of Object.entries(VENDORED)) {
    test.assert(sha(readFileSync(resolveProjectPath(`app/vendor/vibeoffice/quire/${name}`))) === digest, `${name} is byte-identical to the pinned upstream file`);
  }
  {
    const { ctx } = session();
    const mods = vm.runInContext("ClioWorksQuireAdapter.MODULES", ctx);
    const editor = vm.runInContext("ClioWorksQuireAdapter.EDITOR_MODULES", ctx);
    test.assert(mods.some((m) => m.endsWith("quire/ops.js")), "ops.js loads with the codec (the write surface needs it)");
    test.assert(editor.map((m) => m.split("/").pop()).join() === "layout.js,drawing.js,editor.js,fields.js", "layout.js, drawing.js, editor.js and fields.js are the second lazy point, in dependency order");
    test.assert(!mods.some((m) => editor.includes(m)), "the contentEditable layer is not in the codec list");
  }

  const { ctx, open } = session();
  const doc = await open();

  // 2. D.doc is bound by open(), before any save.
  test.assert(vm.runInContext("L.D.doc", ctx) === doc.document(), "open() binds the model's global document");

  // 3. Unedited: one dirty source, original bytes, no loss report.
  test.assert(doc.isDirty() === false && doc.getEditRevision() === 0, "a fresh document is clean at revision 0");
  const untouched = await doc.save();
  test.assert(untouched.mode === "original-bytes" && same(bytesOf(untouched), DOCX), "an unedited save returns the original bytes");
  const emptyReport = await doc.exportReport();
  test.assert(emptyReport.converted.length === 0 && emptyReport.lost.length === 0, "an unedited document reports nothing converted or lost");

  // 4. Read surface.
  const paras = doc.paragraphs();
  test.assert(paras.length === 12, `twelve top-level paragraphs (got ${paras.length})`);
  test.assert(byText(doc, "搬家清单").headingLevel === 1 && byText(doc, "先装箱").headingLevel === 2 && byText(doc, "再叫车").headingLevel === 3, "heading levels 1-3 are read");
  test.assert(byText(doc, "这个周末").headingLevel === 0 && byText(doc, "这个周末").list === null, "body text is level 0 and not a list");
  const styled = byText(doc, "普通的一句");
  test.assert(styled.runs.map((r) => `${r.b ? "b" : ""}${r.i ? "i" : ""}${r.u ? "u" : ""}`).join("|") === "|b|i|u", "run formatting reads as plain|bold|italic|underline");
  test.assert(byText(doc, "胶带").list.kind === "bullet" && byText(doc, "周六上午").list.kind === "number", "bullet and numbered paragraphs are told apart");
  test.assert(doc.tables().length === 1 && doc.tables()[0].rows[1][0].text === "纸箱" && doc.tables()[0].readOnly === true, "the table is readable and marked read-only");
  test.assert(doc.blocks().filter((b) => b.kind === "table").length === 1 && doc.blocks().length === 13, "blocks() lists the table among the paragraphs");
  const pic = byText(doc, "新书架");
  test.assert(pic.runs[0].kind === "image" && pic.runs[0].readOnly === true, "the picture run is selectable and read-only");
  const comment0 = doc.comments()[0];
  test.assert(comment0.author === "阿澄" && comment0.parentId === null && comment0.anchor.quote === "纸箱" && comment0.anchor.paragraphId === byText(doc, "先把").id, "the existing comment reads with its landing range and no parent");

  // 5. Read-only refusals leave the document untouched.
  {
    const cellParagraph = doc.tables()[0].rows[1][0].paragraphIds[0];
    const refusals = [
      ["setRunText on a table cell paragraph", doc.setRunText(cellParagraph, 0, "改"), "READ_ONLY_TABLE"],
      ["splitParagraph in a table", doc.splitParagraph(cellParagraph, 1), "READ_ONLY_TABLE"],
      ["toggleRunStyle in a table", doc.toggleRunStyle(cellParagraph, "b"), "READ_ONLY_TABLE"],
      ["setList in a table", doc.setList(cellParagraph, "bullet"), "READ_ONLY_TABLE"],
      ["addComment in a table", doc.addComment(cellParagraph, { from: 0, to: 1 }, { text: "x" }), "READ_ONLY_TABLE"],
      ["setRunText on the picture run", doc.setRunText(pic.id, 0, "x"), "READ_ONLY_IMAGE"],
      ["toggleRunStyle across the picture", doc.toggleRunStyle(pic.id, "b"), "READ_ONLY_IMAGE"],
      ["mergeParagraph into the table", doc.mergeParagraph(byText(doc, "周六下午").id), "READ_ONLY_TABLE"],
    ];
    for (const [what, result, code] of refusals) test.assert(result && result.status === "blocked" && result.code === code, `${what} is refused (${code})`);
    test.assert(doc.isDirty() === false && doc.getEditRevision() === 0 && (await doc.save()).mode === "original-bytes", "refused writes leave the document clean and byte-identical");
  }

  // 5b. N10: the narrow face still refuses the table (it serves the menu and the
  // find/replace surface); the opened door is the upstream editor's own path,
  // which reports through syncExternal — the same accounting a keystroke takes.
  {
    const cellParagraph = doc.tables()[0].rows[0][0].paragraphIds[0];
    const D = await vm.runInContext("(async () => (await ClioWorksQuireAdapter.loadCodec()).D)()", ctx);
    const cell = D.byId(doc.document(), Number(cellParagraph));
    const before = doc.tables()[0].rows[0][0].text;
    const rev = doc.getEditRevision();
    vm.runInContext("globalThis.__cellEdit = () => { L.D.touch(globalThis.__cell); globalThis.__cell.runs[0].text = '好' + globalThis.__cell.runs[0].text; }", ctx);
    ctx.__cell = cell;
    vm.runInContext("L.D.tx('Typing', globalThis.__cellEdit)", ctx);   // what E.edit runs on a keystroke
    test.assert(doc.syncExternal() === true && doc.isDirty() && doc.getEditRevision() === rev + 1,
      "an upstream-path edit inside a cell is counted exactly once through syncExternal()");
    test.assert(doc.undoLabel() === "Typing" && doc.tables()[0].rows[0][0].text === "好" + before,
      "the cell edit is one named undo step (the adapter's narrow face still says READ_ONLY_TABLE)");
    doc.undo();
    test.assert(doc.tables()[0].rows[0][0].text === before && doc.canRedo(), "undo restores the cell's words");
    doc.redo();
    doc.undo();
    doc.markSaved(doc.getEditRevision());   // leave the document clean for the sections below
    test.assert(!doc.isDirty(), "(cleanup) the N10 probe leaves the document clean");
  }

  // 6. Edits: one undo step each, dirty source moves, save + reopen reads back.
  const reopen = async () => open(bytesOf(await doc.save()));
  const rev0 = doc.getEditRevision();
  const lastP = byText(doc, "最后一段");
  const r1 = doc.setRunText(lastP.id, 0, "最后一段，现在改过了。");
  test.assert(r1.after === "最后一段，现在改过了。" && doc.isDirty() && doc.getEditRevision() === rev0 + 1, "setRunText marks dirty and moves the revision once");
  test.assert(doc.undoLabel() === "Typing" && doc.canUndo() && !doc.canRedo(), "the edit is one labelled undo step");
  doc.undo();
  test.assert(byText(doc, "最后一段").text === "最后一段，什么格式都没有。" && doc.canRedo() && doc.redoLabel() === "Typing", "undo restores the text and offers redo");
  doc.redo();
  test.assert(byText(doc, "最后一段").text === "最后一段，现在改过了。", "redo reapplies it");
  const revSaved = doc.getEditRevision();
  doc.markSaved(revSaved);
  test.assert(doc.isDirty() === false, "markSaved(rev) clears dirty");
  doc.markSaved(revSaved - 1);
  test.assert(doc.isDirty() === true, "an edit that landed after the saved revision keeps the document dirty");
  doc.markSaved(doc.getEditRevision());
  doc.undo();
  test.assert(doc.isDirty() === true, "undo after a save is an edit, not a silent return to clean");
  doc.redo();
  doc.markSaved(doc.getEditRevision());

  // 6a. setRunText round trip.
  {
    const again = await reopen();
    test.assert(byText(again, "最后一段").text === "最后一段，现在改过了。" && (await doc.save()).mode === "preserving-edit", "a run-text edit survives save and reopen through the preserving writer");
    test.assert(again.tables().length === 1 && again.tables()[0].rows[1][1].text === "20" && byText(again, "新书架").runs[0].kind === "image", "table and picture come through the save unchanged");
    test.assert(same(part(bytesOf(await doc.save()), "word/media/image1.png"), part(DOCX, "word/media/image1.png")), "the picture part keeps its original bytes");
    // F3: an untouched picture paragraph is re-emitted as its original XML, inner namespace
    // declarations included (the writer used to drop xmlns:wp / xmlns:a / xmlns:pic: 904 -> 611 bytes).
    const drawingOf = (bytes) => part(bytes, "word/document.xml").toString("utf8").match(/<w:drawing>[\s\S]*?<\/w:drawing>/)?.[0] || "";
    const savedDrawing = drawingOf(bytesOf(await doc.save()));
    test.assert(drawingOf(DOCX) !== "" && savedDrawing === drawingOf(DOCX), `the untouched <w:drawing> is byte-identical after a text edit elsewhere (${drawingOf(DOCX).length} -> ${savedDrawing.length} bytes)`);
  }

  // 6b. Headings.
  {
    const p = byText(doc, "这个周末");
    doc.setHeading(p.id, 1);
    test.assert(doc.undoLabel() === "Heading 1" && byText(doc, "这个周末").headingLevel === 1, "setHeading(1) makes a heading as one step");
    const again = await reopen();
    test.assert(byText(again, "这个周末").headingLevel === 1, "heading 1 survives save and reopen");
    doc.setHeading(byText(doc, "这个周末").id, 3);
    doc.setHeading(byText(doc, "这个周末").id, 0);
    test.assert(byText(doc, "这个周末").headingLevel === 0 && (await reopen(), byText(await reopen(), "这个周末").headingLevel === 0), "setHeading(0) returns it to body text and that survives a save");
    test.assert(doc.setHeading(p.id, 4).code === "BAD_LEVEL", "only levels 0-3 are accepted");
  }

  // 6c. Bold / italic / underline over a range, on and off.
  {
    const p = byText(doc, "先把");
    const full = p.text.length;
    const on = doc.toggleRunStyle(p.id, "b", { from: 0, to: 2 });
    test.assert(on.on === true && byText(doc, "先把").runs.some((r) => r.kind === "text" && r.b && r.text === "先把"), "toggleRunStyle turns bold on for the range only");
    const again = await reopen();
    test.assert(byText(again, "先把").runs.filter((r) => r.b).map((r) => r.text).join("") === "先把", "bold on the range survives save and reopen");
    const off = doc.toggleRunStyle(byText(doc, "先把").id, "b", { from: 0, to: 2 });
    test.assert(off.on === false && !byText(doc, "先把").runs.some((r) => r.b), "toggling again turns it off");
    doc.toggleRunStyle(byText(doc, "先把").id, "i");
    doc.toggleRunStyle(byText(doc, "先把").id, "u", { from: 0, to: full });
    const view = byText(await reopen(), "先把");
    test.assert(view.runs.filter((r) => r.kind === "text").every((r) => r.i && r.u && !r.b), `whole-paragraph italic and underline survive a save (${JSON.stringify(view.runs.map((r) => [r.b, r.i, r.u]))})`);
    // Heading text is bold from its style; turning bold off is explicit and survives.
    const h = byText(doc, "先装箱");
    doc.toggleRunStyle(h.id, "b");
    test.assert(!byText(doc, "先装箱").runs.some((r) => r.kind === "text" && r.b) && !byText(await reopen(), "先装箱").runs.some((r) => r.kind === "text" && r.b), "bold can be switched off even where the heading style supplies it");
    test.assert(doc.toggleRunStyle(p.id, "x").code === "BAD_STYLE_KEY" && doc.toggleRunStyle(p.id, "b", { from: 3, to: 3 }).code === "BAD_RANGE", "unknown keys and empty ranges are refused");
  }

  // 6d. Split and merge.
  {
    const p = byText(doc, "最后一段");
    const split = doc.splitParagraph(p.id, 4);
    test.assert(doc.undoLabel() === "Split Paragraph" && byText(doc, "最后一段").text === "最后一段" && doc.paragraphs().some((q) => q.id === split.newParagraphId && q.text === "，现在改过了。"), "splitParagraph cuts at the offset and returns the new paragraph id");
    const count = doc.paragraphs().length;
    const again = await reopen();
    test.assert(again.paragraphs().length === count && byText(again, "，现在改过了").text === "，现在改过了。", "the split survives save and reopen");
    const merged = doc.mergeParagraph(p.id);
    test.assert(merged.removedId === split.newParagraphId && byText(doc, "最后一段").text === "最后一段，现在改过了。" && doc.paragraphs().length === count - 1, "mergeParagraph joins it back");
    doc.undo();
    test.assert(doc.paragraphs().length === count, "undo of a merge restores the paragraph");
    doc.redo();
    test.assert(doc.splitParagraph(p.id, 99).code === "BAD_OFFSET", "an offset outside the paragraph is refused");
    test.assert(doc.mergeParagraph(doc.paragraphs().slice(-1)[0].id).code === "NO_NEXT_PARAGRAPH", "the last paragraph has nothing to merge with");
  }

  // 6e. Lists: new, changed, removed.
  {
    const p = byText(doc, "这个周末");
    doc.setList(p.id, "bullet");
    test.assert(byText(doc, "这个周末").list.kind === "bullet" && doc.undoLabel() === "Bullets", "a plain paragraph becomes a bullet item (new list)");
    test.assert(byText(await reopen(), "这个周末").list.kind === "bullet", "the new bullet survives save and reopen");
    const both = [byText(doc, "胶带").id, byText(doc, "旧报纸").id];
    doc.setList(both, "number");
    const converted = await reopen();
    test.assert(byText(converted, "胶带").list.kind === "number" && byText(converted, "旧报纸").list.kind === "number" && byText(converted, "胶带").list.numId === byText(converted, "旧报纸").list.numId, "a bullet group becomes one numbered list (modify)");
    test.assert(byText(converted, "周六上午").list.kind === "number" && byText(converted, "周六上午").list.numId !== byText(converted, "胶带").list.numId, "the other numbered list is a separate list");
    doc.setList(both, "none");
    test.assert(byText(await reopen(), "旧报纸").list === null, "removing the list survives a save");
    const noop = doc.getEditRevision();
    doc.setList(both, "none");
    test.assert(doc.getEditRevision() === noop, "asking for what already is changes nothing");
    test.assert(doc.setList(p.id, "roman").code === "BAD_LIST_KIND", "unknown list kinds are refused");
  }

  // 6f. Comments: add, reply, done.
  {
    const target = byText(doc, "搬家清单");
    const added = doc.addComment(target.id, { from: 0, to: 2 }, { author: "小禾", text: "标题再想想", date: "2026-10-16T08:00:00Z" });
    test.assert(added.id && added.anchor.quote === "搬家" && doc.undoLabel() === "Insert Comment", "addComment lands on the range as one step");
    const rootId = doc.comments().find((c) => c.text === "纸箱数量再确认一下").id;
    const reply = doc.replyComment(rootId, { author: "小禾", text: "已确认 20 个", date: "2026-10-16T08:05:00Z" });
    test.assert(reply.parentId === rootId && doc.comments().find((c) => c.id === reply.id).anchor.quote === "纸箱", "replyComment joins the thread and shares the root's range");
    const rr = doc.replyComment(reply.id, { author: "阿澄", text: "好", date: "2026-10-16T08:06:00Z" });
    test.assert(rr.parentId === rootId, "a reply to a reply joins the root's thread");
    doc.setCommentDone(rootId, true);
    const again = await reopen();
    const list = again.comments();
    const root = list.find((c) => c.text === "纸箱数量再确认一下");
    const kids = list.filter((c) => c.parentId === root.id).map((c) => c.text).sort();
    test.assert(root.author === "阿澄" && root.done === true && kids.join("|") === "好|已确认 20 个", "the thread keeps root, replies and the done flag across a save");
    const fresh = list.find((c) => c.text === "标题再想想");
    test.assert(fresh.author === "小禾" && fresh.parentId === null && fresh.anchor.quote === "搬家" && fresh.date === "2026-10-16T08:00:00Z", "the new comment keeps author, date and landing range");
    doc.undo();
    test.assert(doc.comments().find((c) => c.id === rootId).done === false, "undo of resolve reopens the thread");
    doc.redo();
    test.assert(doc.replyComment("nope", { text: "x" }).code === "NO_SUCH_COMMENT" && doc.addComment(target.id, { from: 0, to: 1 }, { text: "  " }).code === "EMPTY_COMMENT", "unknown parents and empty comments are refused");
  }

  // 7. After all that, the table and picture still match the original, and the report reads the encode path.
  {
    const out = bytesOf(await doc.save());
    test.assert(same(part(out, "word/media/image1.png"), part(DOCX, "word/media/image1.png")), "the picture still has its original bytes after many edits");
    const again = await open(out);
    test.assert(JSON.stringify(again.tables()[0].rows.map((r) => r.map((c) => c.text))) === '[["项目","数量"],["纸箱","20"]]', "the table text is unchanged after many edits");
    const report = await doc.exportReport();
    test.assert(Array.isArray(report.converted) && Array.isArray(report.lost), "exportReport lists converted and lost from the encode path");
  }

  // 8. A second document in the same page keeps its own undo history and document binding.
  {
    const other = await open();
    test.assert(other.canUndo() === false && vm.runInContext("L.D.doc", ctx) === other.document(), "a second open starts with empty history and rebinds the model");
    other.setRunText(byText(other, "最后一段").id, 0, "另一份");
    test.assert(other.undoLabel() === "Typing" && doc.canUndo() && byText(doc, "最后一段").text !== "另一份", "edits on one document do not touch the other's text or history");
    doc.undo();
    test.assert(other.canUndo() && byText(other, "另一份").text === "另一份", "undo on one document leaves the other's step alone");
  }

  // 9. The upstream editor layer loads behind its own lazy point.
  {
    const { ctx: c2 } = session();
    const before = vm.runInContext("typeof L", c2);
    test.assert(before === "undefined", "nothing is loaded before the adapter is asked");
    try {
      await vm.runInContext("ClioWorksQuireAdapter.loadEditor()", c2);
      test.assert(vm.runInContext("!!(L.layout && L.ed && L.drawing)", c2), "loadEditor() brings up layout, drawing and the contentEditable editor");
    } catch (error) {
      test.assert(false, `loadEditor() rejected: ${error && error.message}`);
    }
  }

  // 9b. F9: a frozen docx whose ordinary edits DO fill the first-save list (quire-convert-s11.docx:
  // an emptied table grid and an unmatched bookmark; generate-quire-convert.mjs builds it).
  {
    const CONVERT = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-convert-s11.docx")));
    const plain = (i) => /\s/.test(i.detail) && /^[A-Z][^<>{}]*[.)]$/.test(i.detail) && i.where === "word/document.xml" && !!i.id && !!i.kind;
    for (const [label, change] of [
      ["Express typing", (d) => d.setRunText(byText(d, "最后一段").id, 0, "最后一段，改过。")],
      ["a full-mode bold", (d) => d.toggleRunStyle(byText(d, "普通的一句").id, "b", { from: 0, to: 2 })],
    ]) {
      const { open: openConvert } = session();
      const d = await openConvert(CONVERT, { name: "quire-convert-s11.docx" });
      const quiet = await d.exportReport();
      test.assert(quiet.converted.length === 0 && quiet.lost.length === 0, `quire-convert-s11.docx reports nothing before ${label}`);
      change(d);
      const report = await d.exportReport();
      const kinds = (list) => list.map((i) => i.kind).sort().join(",");
      test.assert(kinds(report.converted) === "content,table" && kinds(report.lost) === "range",
        `after ${label} the first-save list has the rebuilt table grid and bookmark tidy-up as converted and the orphan bookmark as lost (${JSON.stringify(report)})`);
      test.assert([...report.converted, ...report.lost].every(plain), `after ${label} every item is a plain sentence located in word/document.xml`);
      test.assert(report.converted.some((i) => /table column widths/.test(i.detail)) && report.lost.some((i) => /^Bookmark/.test(i.detail)), `after ${label} the items name the table widths and the bookmark`);
      const table = report.converted.find((i) => i.kind === "table");
      const mark = report.lost[0];
      const marks = report.converted.find((i) => i.kind === "content");
      test.assert(table.subject === "table-widths" && table.place && table.place.type === "table", `after ${label} the table-width item says it is the table (${JSON.stringify(table)})`);
      test.assert(mark.subject === "bookmark" && mark.place && mark.place.type === "paragraph" && mark.place.n === 1 && mark.place.quote === "搬家清单", `after ${label} the orphan bookmark is located at paragraph 1 with its words (${JSON.stringify(mark.place)})`);
      test.assert(marks.subject === "bookmarks" && marks.count === 1, `after ${label} the tidy-up item is the bookmarks, counted (${JSON.stringify(marks)})`);
    }
  }

  // 10. The fixture lab has a docx branch and says it is not the real editor.
  {
    const fixture = read("app/vendor/clioworks-v3/fixture.js");
    test.assertIncludes(fixture, "adapterKind === 'docx'", "the lab has an adapter=docx branch");
    test.assertIncludes(fixture, "NOT the real editor", "the lab keeps the house disclaimer");
    test.assertIncludes(fixture, "fixture-files/quire-s11.docx", "the docx branch reads the lab-served frozen copy");
    const manifest = JSON.parse(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/MANIFEST.json"), "utf8"));
    const entry = manifest.files.find((f) => f.name === "quire-s11.docx");
    test.assert(entry && entry.sha256 === sha(Buffer.from(DOCX)) && sha(readFileSync(resolveProjectPath("app/vendor/clioworks-v3/fixture-files/quire-s11.docx"))) === entry.sha256, "MANIFEST names the docx and the served copy is the same bytes");
  }

  test.finish();
};

run();
