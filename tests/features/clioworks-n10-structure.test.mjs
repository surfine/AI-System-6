// ClioWorks N10 补缺 contract: 换图 and the table's own rows and columns, on the
// real code paths (the n10-sample technique: the REAL editor surface over a
// linkedom document, tests/helpers/quire-editor-vm.mjs).
//   - 换图: with the picture selected (.obj-handles) the 命令 popup grows one
//     「换图…」 row; the chosen file's bytes take the picture's place in the
//     model at the SAME position — the original width and place stand, a
//     different aspect ratio scales the height from that width (h = w·pxH/pxW) —
//     one 「换图」 undo step. In the saved package the new bytes land in one NEW
//     media part and the superseded part is carried byte-identical and
//     unreferenced (the codec's no-silent-drop rule), so no part changes beyond
//     the one-character-edit class plus that one added media part;
//   - 插删行列: six commands listed only while the caret sits inside a table
//     cell, each ONE named undo step, the row's words moving with it, the last
//     row/column taking the table with it, and the cell-words gate untouched;
//   - 合并格: the vertical-merge and spanning-cell behaviour asserted as it is
//     (a merge the new row lands inside spans it; a deleted merge start hands
//     its words down; a spanning cell grows over a new column and keeps its
//     words when a covered column leaves);
//   - R1 real corpus (必跑): D08 (70 rows, a 70-row vertical merge, the _GoBack
//     bookmark inside the table) takes one 插入行 through the app's own popup
//     command — the bookmark moves with its row, and the write-back surface is
//     no larger than the first phase's cell edit in the same context — while
//     the corpus gate's own bare-adapter context (the n10-sample口径) proves
//     插入行 → save stays within the R1 baseline for D04 and D08 both; and a
//     reference the row delete breaks is reported (never silently dropped).
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import AdmZip from "adm-zip";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { createQuireEditorVm } from "../helpers/quire-editor-vm.mjs";
import { changedParts, CORPUS } from "../../tooling/clioworks-r1-corpus.mjs";

const test = createFeatureTest("clioworks-n10-structure");
process.env.TZ = "UTC"; // the codec reads local clock fields (zip stamps)

const SAMPLE = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-n10/quire-n10.docx")));
const zipOf = (bytes) => new AdmZip(Buffer.from(bytes));
const SOURCE_PNG = zipOf(SAMPLE).getEntry("word/media/image1.png").getData();

/* A second PNG built the way the fixture builder draws its own (30×40 px, a
   different aspect ratio than the sample's 60×40): fixed bytes, no binary. */
function crc32(bytes) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const chunk = (type, data) => {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
};
function bandPng(width, height, rows) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolour RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const line = y * (1 + width * 3);
    raw[line] = 0;
    const [rr, gg, bb] = rows[Math.min(rows.length - 1, Math.floor((y / height) * rows.length))];
    for (let x = 0; x < width; x += 1) {
      raw[line + 1 + x * 3] = rr;
      raw[line + 2 + x * 3] = gg;
      raw[line + 3 + x * 3] = bb;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const TALL_PNG = bandPng(30, 40, [[0x79, 0x1f, 0x4e], [0x1f, 0x79, 0x4e]]); // 30×40 px, aspect 0.75

const v = await createQuireEditorVm({ docx: SAMPLE, name: "quire-n10.docx" });
const w = v.window;
const doc = v.document;
const api = w.AISystem6ClioWrite;
const E = () => v.run("L.ed");
const D = () => v.run("L.D");
const pages = () => doc.querySelector("#pages");
const byText = (adapter, text) => adapter.paragraphs().find((p) => p.text.startsWith(text));
const tick = async () => { for (let i = 0; i < 8; i += 1) { await Promise.resolve(); await new Promise((r) => setImmediate(r)); } v.flush(); };
const imgRun = (adapter, text) => { const p = D().byId(adapter.document(), Number(byText(adapter, text).id)); return p.runs.find((r) => r.t === "img"); };
const cellCaret = (adapter, row, col, offset = 0) => {
  const p = D().byId(adapter.document(), Number(adapter.tables()[0].rows[row][col].paragraphIds[0]));
  E().setSel(D().pos(p, offset), D().pos(p, offset));
  return p;
};
/** the caret into a cell, then let the rAF-throttled 'sel' event land (the
    popup's rows read the session's bookmark, which the event refreshes). */
const inCell = async (adapter, row, col, offset = 0) => { cellCaret(adapter, row, col, offset); await tick(); };
/** click the 命令 popup open, then its row for `id`; false when the row is not listed. */
function menuCommand(id) {
  const button = doc.querySelector(".cw-trailing .cw-pop");
  if (!button) throw new Error("the 命令 popup button is missing");
  v.fire(button, "click");
  const row = doc.querySelector(`[data-menu-command="${id}"]`);
  if (!row) { doc.querySelector(".cw-menu")?.remove(); return false; }
  v.fire(row, "click");
  return true;
}
async function fresh(mode = "express") {
  v.modal.answers.length = 0;
  if (api.current()) { if (api.current().dirty) v.modal.answers.push("no"); await api.close(); }
  v.record.liveAdapter = await v.openAdapter();
  const out = await api.open(v.record, {});
  if (!out.ok) throw new Error("open failed: " + JSON.stringify(out));
  if (mode === "full") v.fire(doc.querySelector(".cw-scroller"), "keydown", { key: "e", metaKey: true });
  return v.record.liveAdapter;
}

try {
  // ---- 换图: the popup grows the row only with the picture selected ----
  {
    const adapter = await fresh("express");
    const bodyText = byText(adapter, "这份文件给作者过目");
    E().setSel(D().pos(D().byId(adapter.document(), Number(bodyText.id)), 4), D().pos(D().byId(adapter.document(), Number(bodyText.id)), 4));
    await tick();
    test.assert(api.commandState("image.replace") && api.commandState("image.replace").enabled === false,
      "换图 is not offered while the caret is plain text");
    const img = pages().querySelector(".img");
    v.fire(img, "mousedown", { button: 0, clientX: 4, clientY: 4 });
    await tick();
    test.assert(!!E().objSel && api.commandState("image.replace").enabled === true,
      "with the picture selected (.obj-handles) 换图 is offered");
    test.assert(menuCommand("image.replace") === true, "the 命令 popup lists the 换图… row");
  }

  // ---- 换图: same aspect keeps the size exactly; bytes swap at the same position ----
  {
    const adapter = await fresh("express");
    const item = imgRun(adapter, "上面是一张测试图");
    const before = { media: String(item.media), w: item.w, h: item.h };   // snapshot: the item is live
    const img = pages().querySelector(".img");
    v.fire(img, "mousedown", { button: 0, clientX: 4, clientY: 4 });
    await tick();
    const out = await api.replaceImage(new w.Blob([SOURCE_PNG], { type: "image/png" }));
    const after = imgRun(adapter, "上面是一张测试图");
    test.assert(out.status === "ok" && after.w === before.w && after.h === before.h,
      `a same-aspect replacement keeps w/h exactly (${before.w}×${before.h} → ${after.w}×${after.h})`);
    test.assert(String(after.media) !== before.media, "the picture now rides a new media entry (the bytes were replaced)");
    test.assert(api.editHistory().undoLabel() === "clio_write_step_replace_image", "the replace is one step named 「换图」");
    api.editHistory().undo();
    const restored = imgRun(adapter, "上面是一张测试图");
    test.assert(String(restored.media) === before.media && restored.w === before.w && restored.h === before.h,
      "one Undo takes the original media entry and size back");
  }

  // ---- 换图: a different aspect scales the height from the original width ----
  {
    const adapter = await fresh("express");
    const img = pages().querySelector(".img");
    v.fire(img, "mousedown", { button: 0, clientX: 4, clientY: 4 });
    await tick();
    const out = await api.replaceImage(new w.Blob([TALL_PNG], { type: "image/png" }));
    const after = imgRun(adapter, "上面是一张测试图");
    test.assert(out.status === "ok" && after.w === 90 && after.h === 120,
      `a 30×40 replacement keeps the width 90 and scales the height by the pixels (h = 90·40/30 = 120; got ${after.w}×${after.h})`);
    // The codec round trip: the new bytes in one NEW media part at the picture's
    // position; the superseded part is carried byte-identical and unreferenced.
    const written = await v.run('(async () => (await L.docx.write(L.D.doc, { format: "docx" })).arrayBuffer())()');
    const wz = zipOf(written);
    test.assert(wz.getEntry("word/media/image2.png") && wz.getEntry("word/media/image2.png").getData().equals(TALL_PNG),
      "L.docx.write emits the new bytes in the picture's own new media part");
    test.assert(wz.getEntry("word/media/image1.png").getData().equals(SOURCE_PNG),
      "the superseded part keeps its exact bytes (carried, never silently dropped)");
    test.assert(!wz.readAsText("word/_rels/document.xml.rels").includes("image1.png"),
      "the document's relationships point only at the new part (the old one rides unreferenced)");
    const ext = [...wz.readAsText("word/document.xml").matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => `${m[1]}x${m[2]}`);
    test.assert(ext.includes("1143000x1524000"), `the w:extent is 90×120 pt in EMU (${ext.join(",")})`);
  }

  // ---- 换图 save: no part changes beyond the one-character-edit class + the one added media part ----
  {
    // the floor: the same class the N10 first phase proved (a one-character cell edit)
    const floorAdapter = await fresh("express");
    await inCell(floorAdapter, 2, 1);
    v.fire(pages(), "beforeinput", { inputType: "insertText", data: "五" });
    await tick();
    const floorSaved = await floorAdapter.save();
    const floor = changedParts(SAMPLE, floorSaved.bytes);
    // the replace
    const adapter = await fresh("express");
    const img = pages().querySelector(".img");
    v.fire(img, "mousedown", { button: 0, clientX: 4, clientY: 4 });
    await tick();
    await api.replaceImage(new w.Blob([TALL_PNG], { type: "image/png" }));
    const saved = await adapter.save();
    const changed = changedParts(SAMPLE, saved.bytes);
    test.assert(changed.every((name) => floor.includes(name) || name === "+word/media/image2.png"),
      `the replace save changes no part beyond the cell-edit class plus the one added media part (floor ${floor.join(", ")}; got ${changed.join(", ")})`);
    test.assert(zipOf(saved.bytes).getEntry("word/media/image2.png").getData().equals(TALL_PNG)
      && zipOf(saved.bytes).getEntry("word/media/image1.png").getData().equals(SOURCE_PNG),
      "the save stores the new bytes in the new part and the old part byte-identical");
  }

  // ---- 插删行列: the rows are listed only inside a table, each command one named step ----
  {
    const adapter = await fresh("express");
    const view = () => adapter.tables()[0].rows.map((r) => r.map((c) => c.text));
    const asBefore = JSON.stringify(view());
    // not inside a table: the rows are absent and the gate names the table
    const bodyText = byText(adapter, "这份文件给作者过目");
    E().setSel(D().pos(D().byId(adapter.document(), Number(bodyText.id)), 4), D().pos(D().byId(adapter.document(), Number(bodyText.id)), 4));
    await tick();
    const gate = api.commandState("table.row-above");
    test.assert(gate && gate.enabled === false && gate.reason === "clio_write_reason_not_in_table",
      "outside a table the structure command is refused naming the table");
    test.assert(menuCommand("table.row-above") === false, "the 命令 popup lists no structure rows outside a table");
    // 在上方插入行: an empty row takes the caret row's shape; the words move down with their row
    await inCell(adapter, 1, 0, 1);
    test.assert(menuCommand("table.row-above") === true, "with the caret in a cell the popup lists 在上方插入行");
    test.assert(view().length === 4 && view()[1].join("|") === "|" && view()[2][0] === "纸箱",
      "an empty row is inserted above and 纸箱 moves down with its row");
    test.assert(adapter.tables()[0].rows[1].length === 2 && adapter.tables()[0].rows[1][1].text === "",
      "the new row mirrors the caret row's cells (two empty cells)");
    test.assert(api.editHistory().undoLabel() === "clio_write_step_insert_row", "the insert is one step named 「插入行」");
    api.editHistory().undo();
    test.assert(JSON.stringify(view()) === asBefore, "one Undo takes the row back out");
    // 在下方插入行
    await inCell(adapter, 1, 0);
    menuCommand("table.row-below");
    test.assert(view().length === 4 && view()[2].join("|") === "|" && view()[1][0] === "纸箱", "在下方插入行 lands below the caret row");
    api.editHistory().undo();
    // 在右侧插入列 / 在左侧插入列
    await inCell(adapter, 1, 0);
    menuCommand("table.column-right");
    test.assert(view()[0].length === 3 && view()[1].join("|") === "纸箱||20", `a column is inserted at the caret cell's right edge (${view()[1].join("|")})`);
    test.assert(api.editHistory().undoLabel() === "clio_write_step_insert_column", "the insert is one step named 「插入列」");
    api.editHistory().undo();
    await inCell(adapter, 1, 1);
    menuCommand("table.column-left");
    test.assert(view()[1].join("|") === "纸箱||20", "在左侧插入列 lands at the caret cell's left edge");
    api.editHistory().undo();
    // 删除行: the words of the OTHER rows stand; the caret lands in the same column
    await inCell(adapter, 1, 0);
    menuCommand("table.delete-row");
    test.assert(view().length === 2 && view()[0][0] === "项目" && view()[1][0] === "胶带",
      "删除行 takes the caret row and leaves the others' words");
    test.assert(api.editHistory().undoLabel() === "clio_write_step_delete_row", "the delete is one step named 「删除行」");
    api.editHistory().undo();
    test.assert(JSON.stringify(view()) === asBefore, "one Undo brings the row and its words back");
    // 删除列
    await inCell(adapter, 1, 1);
    menuCommand("table.delete-column");
    test.assert(view()[0].join("|") === "项目" && view()[1].join("|") === "纸箱", "删除列 takes the caret column from every row");
    test.assert(api.editHistory().undoLabel() === "clio_write_step_delete_column", "the delete is one step named 「删除列」");
    api.editHistory().undo();
    // the last row going takes the table with it (and Undo brings it back)
    await inCell(adapter, 0, 0);
    menuCommand("table.delete-row");
    await inCell(adapter, 0, 0);
    menuCommand("table.delete-row");
    await inCell(adapter, 0, 0);
    menuCommand("table.delete-row");
    test.assert(adapter.tables().length === 0, "deleting the last row deletes the table itself");
    api.editHistory().undo();
    test.assert(adapter.tables().length === 1 && adapter.tables()[0].rows.length === 1,
      "one Undo brings the table and its last row back");
    // the last column going takes the table too
    await inCell(adapter, 0, 0);
    menuCommand("table.delete-column");
    await inCell(adapter, 0, 0);
    menuCommand("table.delete-column");
    test.assert(adapter.tables().length === 0, "deleting the last column deletes the table itself");
    api.editHistory().undo();
    test.assert(adapter.tables().length === 1, "one Undo brings it back");
  }

  // ---- 插删行列: the cell-words gate inside the new row is the old one ----
  {
    const adapter = await fresh("express");
    await inCell(adapter, 1, 0);
    menuCommand("table.row-above");
    const receipt = () => doc.querySelector(".cw-receipt").textContent;
    await inCell(adapter, 1, 0);
    const rev = adapter.getEditRevision();
    v.fire(pages(), "beforeinput", { inputType: "insertText", data: "新" });
    await tick();
    test.assert(adapter.tables()[0].rows[1][0].text === "新" && adapter.getEditRevision() === rev + 1,
      "typing into the new row's cell lands there and is counted once");
    await inCell(adapter, 1, 0, 1);
    v.fire(pages(), "keydown", { key: "Enter" });
    await tick();
    test.assert(adapter.tables()[0].rows.length === 4 && receipt().startsWith("clio_write_receipt_refused:clio_write_reason_table"),
      "Enter inside the new row's cell is still refused naming the table (the words gate is unchanged)");
  }

  // ---- 合并格: the vertical merge a new row lands inside spans it; a deleted start hands its words down ----
  {
    const adapter = await fresh("express");
    // a two-row vertical merge in column 0 (rows 1-2), the way a merged file reads:
    // the restart holds the words, the continuation is empty
    v.run(`(() => { const D = L.D; const t = D.doc.main.blocks.find((b) => b.t === 'tbl');
      D.tx('Merge', () => { D.touchTbl(t);
        t.rows[1].cells[0].tcPr.vMerge = 'restart';
        t.rows[2].cells[0].tcPr.vMerge = 'continue';
        t.rows[2].cells[0].blocks = [D.para()];
      });
    })()`);
    const raw = () => v.run(`(() => { const t = L.D.doc.main.blocks.find((b) => b.t === 'tbl');
      return t.rows.map((r) => r.cells.map((c) => (c.tcPr.vMerge ? (c.tcPr.vMerge === 'restart' ? 'R' : 'c') : '.')));
    })()`);
    // the caret inside the merge (a continuation cell), a row inserted below: the merge spans it
    await inCell(adapter, 2, 0);
    menuCommand("table.row-below");
    test.assert(raw()[3][0] === "c" && raw()[2][0] === "c" && raw()[1][0] === "R",
      "a new row inside a vertical merge is a continuation of it (the merge spans the new row)");
    api.editHistory().undo();
    // above the merge's first row: plain cells
    await inCell(adapter, 0, 0);
    menuCommand("table.row-below");
    test.assert(raw()[1][0] === "." && raw()[2][0] === "R", "a new row above a merge's first row is plain (the merge does not reach up)");
    api.editHistory().undo();
    // 删除行 on the merge's first row: the continuation takes the restart and the words
    await inCell(adapter, 1, 0);
    menuCommand("table.delete-row");
    const after = raw();
    test.assert(after.length === 2 && after[1][0] === "R", "deleting the merge's first row leaves the merge with a new restart below");
    test.assert(adapter.tables()[0].rows[1][0].text === "纸箱",
      "the merged cell keeps its words: the continuation below takes the restart's blocks (纸箱 came down)");
    api.editHistory().undo();
  }

  // ---- 合并格: a spanning cell grows over a new column and keeps its words when a covered column leaves ----
  {
    const adapter = await fresh("express");
    // the header row becomes one cell spanning both columns
    v.run(`(() => { const D = L.D; const t = D.doc.main.blocks.find((b) => b.t === 'tbl');
      D.tx('Merge', () => { D.touchTbl(t); t.rows[0].cells[0].tcPr.span = 2; t.rows[0].cells.splice(1, 1); });
    })()`);
    const shape = () => v.run(`(() => { const t = L.D.doc.main.blocks.find((b) => b.t === 'tbl');
      return t.rows.map((r) => r.cells.map((c) => c.tcPr.span || 1));
    })()`);
    const view = () => adapter.tables()[0].rows.map((r) => r.map((c) => c.text));
    await inCell(adapter, 1, 0);
    menuCommand("table.column-right");
    test.assert(shape()[0][0] === 3 && shape()[1].length === 3,
      "a cell spanning the new column's edge extends over it (span 2 → 3) while other rows gain a cell");
    // a new column inserted beside a spanning cell (not under it): the fresh cell
    // is ONE column wide, never a copy of the neighbour's span
    v.run(`(() => { const D = L.D; const t = D.doc.main.blocks.find((b) => b.t === 'tbl');
      D.tx('Merge', () => { D.touchTbl(t); t.rows[1].cells[0].tcPr.span = 2; t.rows[1].cells.splice(1, 1); });
    })()`);
    test.assert(shape()[1].join(",") === "2,1", "row 1 now leads with one cell spanning two columns");
    await inCell(adapter, 2, 1);
    menuCommand("table.column-right");
    test.assert(shape()[1].join(",") === "2,1,1",
      `the fresh cell beside a spanning cell is one column wide (${shape()[1].join(",")})`);
    api.editHistory().undo();
    api.editHistory().undo();
    api.editHistory().undo();   // …and the first column, back to the two-column table
    await inCell(adapter, 1, 0);
    menuCommand("table.delete-column");
    test.assert(shape()[0][0] === 1 && view()[0][0] === "项目" && view()[1][0] === "20",
      "a spanning cell whose covered column leaves shrinks and keeps its words (项目 stayed)");
    api.editHistory().undo();
  }

  // ---- R1 real corpus (必跑): D08 takes one 插入行 through the app's own popup command ----
  {
    const bytes = new Uint8Array(readFileSync(join(CORPUS, "docx", "D08.docx")));
    v.modal.answers.length = 0;
    if (api.current()) { if (api.current().dirty) v.modal.answers.push("no"); await api.close(); }
    v.record.liveAdapter = await v.openAdapter(bytes, "D08.docx");
    const opened = await api.open(v.record, { mountedName: "D08.docx", fileName: "D08.docx" });
    test.assert(opened.ok, "D08 mounts in the editor window");
    const adapter = v.record.liveAdapter;
    const marks = () => v.run(`(() => { const D = L.D; let n = 0;
      for (const p of D.allParas(D.doc)) for (const r of p.runs) if (r.t === 'bs' || r.t === 'be') n++;
      return n; })()`);
    const bookmarksBefore = marks();
    // the caret in row 2 (inside the 70-row vertical merge's span, plain column 0), insert below
    await inCell(adapter, 2, 0);
    test.assert(menuCommand("table.row-below") === true, "the popup lists 在下方插入行 inside D08's table");
    test.assert(adapter.tables()[0].rows.length === 71, "the row is inserted (70 → 71)");
    test.assert(marks() === bookmarksBefore, "the table's bookmark markers moved with their row (count unchanged)");
    const savedInsert = await adapter.save();
    api.editHistory().undo();
    test.assert(adapter.tables()[0].rows.length === 70, "one Undo takes D08's row back out");
    // the editor context's write-back surface: the row insert may change no MORE of the
    // package than the first phase's own edit class (one character typed into a cell)
    const p2 = D().byId(adapter.document(), Number(adapter.tables()[0].rows[2][0].paragraphIds[0]));
    v.context.__p = p2;
    v.run('L.ed.setSel(L.D.pos(globalThis.__p, 0), L.D.pos(globalThis.__p, 0))');
    v.fire(pages(), "beforeinput", { inputType: "insertText", data: "字" });
    await tick();
    const savedCell = await adapter.save();
    const insertChanged = changedParts(bytes, savedInsert.bytes);
    const cellChanged = changedParts(bytes, savedCell.bytes);
    test.assert(insertChanged.every((name) => cellChanged.includes(name)),
      `D08: the row insert's write-back surface is within the phase-1 cell edit's own (insert ${insertChanged.join(", ")}; cell ${cellChanged.join(", ")})`);
    api.editHistory().undo();
  }

  // ---- a reference the row delete breaks is reported, never silently dropped ----
  // D08's own bookmark sits inside one vertically merged cell (its start and end share
  // the merged content, which a member row's delete survives), so the broken-range
  // case is built where each cell's paragraphs are unambiguous: the sample's table.
  {
    const adapter = await fresh("express");
    v.run(`(() => { const D = L.D; const t = D.doc.main.blocks.find((b) => b.t === 'tbl');
      D.tx('Mark', () => { D.touchTbl(t);
        const a = t.rows[1].cells[0].blocks[0];
        const b = t.rows[2].cells[0].blocks[0];
        D.touch(a); D.touch(b);
        a.runs.unshift(D.item('bs', { id: '7', name: 'rowmark' }));
        b.runs.push(D.item('be', { id: '7' }));
      });
    })()`);
    const markers = () => v.run(`(() => { const t = L.D.doc.main.blocks.find((b) => b.t === 'tbl'); let n = 0;
      for (const row of t.rows) for (const cell of row.cells) for (const b of cell.blocks) if (b.t === 'p') for (const r of b.runs) if (r.t === 'bs' || r.t === 'be') n++;
      return n; })()`);
    test.assert(markers() === 2, "the bookmark's start sits in row 1's cell, its end in row 2's");
    await inCell(adapter, 1, 0);
    menuCommand("table.delete-row");
    test.assert(markers() === 1, "deleting the start's row takes the start with it; the end stays below");
    const report = await adapter.exportReport();
    test.assert(report.lost.some((item) => /^range:/.test(String(item.id))),
      `the broken bookmark is reported in the first-save list (${report.lost.map((i) => i.id).join(", ")})`);
  }

  // ---- R1 real corpus, the n10-sample口径: the bare adapter context (the corpus gate's own),
  //       one 插入行 composed the way the app composes it, saved — within the baseline ----
  {
    const { makeContext, loadScripts } = await import("../fixtures/clioworks-s11/vm-context.mjs");
    const ctx = makeContext();
    loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js"]);
    const openBytes = async (rawBytes, name) => {
      ctx.__bytes = rawBytes;
      return vm.runInContext(`ClioWorksQuireAdapter.open(globalThis.__bytes, { name: ${JSON.stringify(name)} })`, ctx);
    };
    const baseline = JSON.parse(readFileSync(join(CORPUS, "baseline.json"), "utf8")).files;
    for (const id of ["D04", "D08"]) {
      const bytes = new Uint8Array(readFileSync(join(CORPUS, "docx", `${id}.docx`)));
      const d = await openBytes(bytes, `${id}.docx`);
      ctx.__a = d;
      // the caret's row, mirrored empty the way tableCommand composes it: spans and widths
      // kept, vMerge 'continue' where the new row lands inside a merge, no repeated header
      const out = vm.runInContext(`(() => { const a = globalThis.__a; const D = L.D; const doc = a.document();
        let done = false;
        a.modelCommand('插入行', () => {
          const tbl = doc.main.blocks.find((b) => b.t === 'tbl');
          const row = tbl.rows[1];
          D.touchTbl(tbl);
          const cells = row.cells.map((cell) => {
            const first = cell.blocks.find((block) => block.t === 'p');
            const para = D.para([], first ? L.clone(first.pPr) : {}, first ? L.clone(first.rPr) : {});
            const tcPr = L.clone(cell.tcPr || {});
            const vm = tcPr.vMerge;
            if (vm === 'continue') tcPr.vMerge = 'continue'; else delete tcPr.vMerge;
            return D.cell([para], tcPr);
          });
          const trPr = L.clone(row.trPr || {}); delete trPr.header;
          tbl.rows.splice(2, 0, D.row(cells, trPr));
        });
        return { rows: a.tables()[0].rows.length, undo: a.undoLabel(), dirty: a.isDirty() };
      })()`, ctx);
      test.assert(out.rows === d.tables()[0].rows.length && out.undo === "插入行" && out.dirty === true,
        `${id}: the composed 插入行 is one named model command on the adapter's own face`);
      const saved = await d.save();
      const floor = baseline.find((row) => row.id === id).changed_parts;
      const changed = changedParts(bytes, saved.bytes);
      test.assert(changed.every((name) => floor.includes(name)),
        `${id}: 插入行 → save changes no package part beyond the R1 baseline's own edit (got ${changed.join(", ")})`);
      d.undo();
      test.assert(d.tables()[0].rows.length === out.rows - 1, `${id}: one Undo takes the row back out`);
    }
  }
} catch (error) {
  test.assert(false, `the contract ran to the end: ${error && error.stack || error}`);
}
test.finish();
