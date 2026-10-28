// ClioWorks N11 contract: the desk's own memory clipboard on the real code paths.
//   - the board module (features/clioworks-clipboard.js) driven headless: a 带来源
//     副本 freezes in depth (a later source edit cannot change what a paste will
//     read), the source reference is complete (app, file id, file name, range,
//     copied-at), and what leaves the desk is only text/plain and a simple
//     text/html — the internal snapshot and its reference appear in neither;
//   - ClioChart's workbook half over the REAL ledger-adapter: copyRegion freezes
//     the selected rectangle, pasteRegion lands it at the selection as ONE named
//     undo step (values in Express, relative formulas shifted by the paste
//     offset in full mode, the N5a rule), and a ClioWrite table pastes as its
//     cell texts under its own step name;
//   - ClioWrite's real editor surface (the n10/n13b linkedom VM): a copy puts
//     the frozen blocks on the board while the system clipboard keeps its exact
//     behaviour; a paste reads the desk board FIRST — a ClioChart region becomes
//     a docx table in ClioWrite's own model, another document's paragraphs come
//     over as blocks, a deck's 文字条 lands as plain text — each one named step
//     with the source on the status line; the system clipboard's text is
//     outranked, and an empty board falls back to today's plain-text paste;
//   - ClioStage (the page-block model's real runtime): a copied 文字条 carries
//     its lines and where they came from; a paste appends a ClioChart region as
//     one GFM 表格 block and ClioWrite paragraphs 一段一条, one named deck step
//     each.
// The three VMs share entries by plain JSON — what the board itself carries.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, resolveProjectPath, read } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";
import { createQuireEditorVm } from "../helpers/quire-editor-vm.mjs";

const test = createFeatureTest("clioworks-n11-clipboard");
const XLSX = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/budget-s11.xlsx")));
const DOCX = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-s11.docx")));
const SHEET = "预算";
const SOURCE_FILE = "预算.xlsx";

const tStub = (ctx) => { ctx.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key); };
const isIso = (value) => /^\d{4}-\d{2}-\d{2}T/.test(String(value || ""));
/** Carry an entry between worlds the way the process memory does: plain data. */
const carry = (entry) => JSON.parse(JSON.stringify(entry));
const run = async () => {
  /* ============ Part A: the board module, headless ============ */
  let chartEntry = null;      // produced in Part B, pasted in Parts C and D
  let writeEntry = null;      // produced in Part C (whole-document copy), pasted in Parts B and D
  let writeWordsEntry = null; // produced in Part C (a two-word selection), repasted in Part C
  {
    const ctx = makeContext();
    tStub(ctx);
    loadScripts(ctx, ["app/features/clioworks-clipboard.js"]);
    const clip = ctx.AISystem6ClioworksClipboard;
    test.assert(!!clip && clip.KINDS.join(",") === "chart-region,write-blocks,stage-text", "(setup) the board module loads headless and names its three kinds");

    // A1: put freezes in depth; the source app cannot edit what a paste will read.
    const live = { rows: [[{ text: "甲", v: 1 }]], extra: { nested: ["旧"] } };
    const entry = clip.put("chart-region", live, { appId: "clioChart", fileId: "文件", fileName: "预算.xlsx", range: "预算!A1:B2" });
    live.rows[0][0].text = "改";
    live.extra.nested[0] = "改";
    test.assert(clip.peek() === entry && entry.snapshot.rows[0][0].text === "甲" && entry.snapshot.extra.nested[0] === "旧",
      "a snapshot frozen in depth: a later edit of the source changes nothing a paste will read");
    test.assert(Object.isFrozen(entry) && Object.isFrozen(entry.snapshot) && Object.isFrozen(entry.snapshot.rows) && Object.isFrozen(entry.source),
      "the entry, its snapshot and its source reference are frozen objects");
    test.assert(entry.source.appId === "clioChart" && entry.source.fileId === "文件" && entry.source.fileName === "预算.xlsx"
      && entry.source.range === "预算!A1:B2" && isIso(entry.source.copiedAt),
      "the source reference is complete: app, file id, file name, range, copied-at");
    test.assert(clip.put("no-such-kind", {}) === null && clip.put("stage-text", null) === null && clip.writeBlocks([], "x") === null && clip.stageText(["", "  "]) === null,
      "an unknown kind and empty snapshots put nothing");

    // A2: the downgrade is only text/plain and text/html; no internal field travels.
    const marked = clip.put("chart-region", { rows: [[{ text: "甲" }]] }, { appId: "clioChart", fileId: "MARKER-ID", fileName: "MARKER-NAME", range: "MARKER-RANGE", copiedAt: "MARKER-TIME" });
    const plain = clip.plainOf(marked);
    const html = clip.htmlOf(marked);
    test.assert(plain === "甲" && html === "<table><tr><td>甲</td></tr></table>", "a chart region downgrades to TSV and a simple <table>");
    const leaked = JSON.stringify({ plain, html });
    test.assert(!/MARKER/.test(leaked) && !leaked.includes("fileId") && !leaked.includes("copiedAt") && !leaked.includes("snapshot") && !leaked.includes("appId"),
      "the downgrade carries no internal field and no piece of the source reference");
    const words = clip.put("write-blocks", {
      blocks: [
        { t: "p", runs: [{ t: "text", text: "<第一段>" }] },
        { t: "tbl", rows: [{ cells: [{ blocks: [{ runs: [{ t: "text", text: "乙" }] }] }] }] },
      ],
      plain: "<第一段>",
    }, { appId: "clioWrite", fileId: "MARKER-ID", fileName: "文档.docx", range: "paragraphs:2", copiedAt: "MARKER-TIME" });
    test.assert(clip.plainOf(words) === "<第一段>" && clip.htmlOf(words) === "<p>&lt;第一段&gt;</p><table><tr><td>乙</td></tr></table>",
      "write blocks downgrade to <p> and <table>, with the words escaped");
    const lines = clip.put("stage-text", { lines: ["甲", "乙"] }, { appId: "clioStage", fileId: "deck", fileName: "季度汇报.md", range: "p1#1", copiedAt: "MARKER-TIME" });
    test.assert(clip.plainOf(lines) === "甲\n乙" && clip.htmlOf(lines) === "<p>甲</p><p>乙</p>", "a 文字条 downgrades to its lines as <p>s");
    test.assert(!/MARKER/.test(JSON.stringify({ a: clip.plainOf(words), b: clip.htmlOf(words), c: clip.plainOf(lines), d: clip.htmlOf(lines) })),
      "none of the three kinds leaks the source reference");
    test.assert(clip.sourceText(lines) === "clioworks_clip_source:季度汇报.md|p1#1|MARKER-TIME",
      "sourceText names the file, the range and the time for a receipt or Info row");

    // A3: the board holds one entry at a time; clear empties it; an empty board answers null.
    clip.put("stage-text", { lines: ["第二条"] }, { appId: "clioStage" });
    test.assert(clip.peek().kind === "stage-text" && clip.peek() !== lines, "a new copy replaces the board's one entry");
    test.assert(clip.tableGridOf(clip.peek()) === null && clip.tableGridOf(marked) === null,
      "only a write-blocks entry with a table offers a grid to the workbook");
    clip.clear();
    test.assert(clip.peek() === null && clip.plainOf() === "" && clip.htmlOf() === "" && clip.sourceText() === "" && clip.tableGridOf() === null,
      "an empty board answers null and empty strings — every reader falls back to the system clipboard");
    // The system-clipboard write stays quiet where there is no real DOM to do it.
    test.assert(await clip.writeSystem("甲", "<p>甲</p>") === false, "writeSystem refuses quietly without a real document (the board copy is not lost)");
  }

  /* ============ Part B: ClioChart's workbook half, real ledger-adapter ============ */
  const openWorkbook = async () => {
    const ctx = makeContext();
    tStub(ctx);
    loadScripts(ctx, ["app/vendor/clioworks-v3/ledger-adapter.js", "app/features/clio-chart-workbook.js", "app/features/clioworks-clipboard.js"]);
    ctx.__bytes = XLSX;
    const led = await vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__bytes, { name: '预算.xlsx' })", ctx);
    const session = ctx.AISystem6ClioChartWorkbook.createSession(led, {
      fileName: SOURCE_FILE, mountedName: SOURCE_FILE, host: null, confirmList: () => "cancel", alertFailure: () => {},
    });
    return { ctx, led, session, clip: ctx.AISystem6ClioworksClipboard };
  };
  {
    const { led, session, clip } = await openWorkbook();
    led.setCell(SHEET, "A1", { value: "数量" });
    led.setCell(SHEET, "B1", { value: "单价" });
    led.setCell(SHEET, "A2", { value: 10 });
    led.setCell(SHEET, "B2", { value: 25 });

    // B1: the copy — the selected rectangle as a snapshot with its source.
    session.select(0, 0);
    session.select(1, 1, true);
    chartEntry = carry(clip.chartRegionFromSession(session));
    test.assert(chartEntry && chartEntry.kind === "chart-region", "(setup) ⌘C's builder puts the selected region on the board");
    test.assert(chartEntry.source.appId === "clioChart" && chartEntry.source.fileId === SOURCE_FILE && chartEntry.source.fileName === SOURCE_FILE
      && chartEntry.source.range === `${SHEET}!A1:B2` && isIso(chartEntry.source.copiedAt),
      "a workbook copy names the app, the file and the exact range it came from");
    test.assert(chartEntry.snapshot.rows[0][0].text === "数量" && String(chartEntry.snapshot.rows[1][1].text) === "25"
      && chartEntry.snapshot.rows[1][0].v === 10,
      "the 表格快照 holds each cell's display text and its raw value");

    // B2: the freeze holds against the source's own edits.
    led.setCell(SHEET, "A2", { value: 999 });
    const again = clip.peek();
    test.assert(again.snapshot.rows[1][0].v === 10 && again.snapshot.rows[1][0].text === "10",
      "editing the source cell afterwards cannot change the frozen copy");
    led.undo();
    test.assert(led.getCell(SHEET, "A2").value === 10, "(setup) the source edit is taken back");

    // B3: the paste — one named step in the target workbook's own history.
    const beforeA5 = session.view(SHEET, "A5").text;
    const beforeB6 = session.view(SHEET, "B6").text;
    session.select(4, 0);
    const out = session.pasteRegion(clip.peek().snapshot, { label: "clio_chart_workbook_step_paste" });
    test.assert(out.status === "ok" && session.view(SHEET, "A5").text === "数量" && String(session.view(SHEET, "B6").text) === "25",
      "the region lands at the selection with its texts and values");
    test.assert(session.editHistory.canUndo() && session.editHistory.undoLabel() === "clio_chart_workbook_step_paste",
      "the paste is ONE step named 「粘贴」, not one step per cell");
    session.editHistory.undo();
    test.assert(session.view(SHEET, "A5").text === beforeA5 && session.view(SHEET, "B6").text === beforeB6,
      "one Undo takes the whole pasted region back");
    session.editHistory.redo();
    test.assert(session.view(SHEET, "A5").text === "数量", "(setup) Redo puts the region back");

    // B4: full mode — a formula rides along with its relative references shifted (N5a's rule).
    led.setCell(SHEET, "C2", { formula: "A2*B2", value: null });
    session.setMode("full");
    session.select(1, 2);
    clip.chartRegionFromSession(session);
    session.select(4, 2);
    test.assert(session.pasteRegion(clip.peek().snapshot, { label: "clio_chart_workbook_step_paste" }).status === "ok"
      && led.getCell(SHEET, "C5").formula === "A5*B5",
      "a pasted formula is shifted by the paste offset, absolute references staying put");
    session.setMode("express");
    session.select(6, 2);
    const express = session.pasteRegion(clip.peek().snapshot, { label: "clio_chart_workbook_step_paste" });
    test.assert(express.status === "ok" && led.getCell(SHEET, "C7").formula == null,
      "Express pastes the region's values only — it never writes a formula");
    // The value carried for a not-yet-recalculated formula cell is its cached value or nothing:
    // the cell's own snapshot never invents a number.
    test.assert(chartEntry.snapshot.rows[1][1].v === 25, "(setup) value cells carry their number");
  }

  /* ============ Part C: ClioWrite's real editor surface ============ */
  {
    const v = await createQuireEditorVm({ docx: DOCX, name: "写作.docx" });
    v.load(["app/features/clioworks-clipboard.js"]);
    const w = v.window;
    const clip = w.AISystem6ClioworksClipboard;
    const doc = v.document;
    const api = w.AISystem6ClioWrite;
    const D = () => v.run("L.D");
    const E = () => v.run("L.ed");
    const scroller = () => doc.querySelector(".cw-scroller");
    // The editor's own copy/paste listeners sit on its contentEditable host (#pages,
    // inside the scroller): ⌘C/⌘V reach the desk the way the browser delivers them.
    const pages = () => doc.querySelector("#pages");
    const receipt = () => doc.querySelector(".cw-receipt").textContent;
    const byText = (adapter, text) => adapter.paragraphs().find((p) => p.text.startsWith(text));
    const modelOf = (adapter, text) => D().byId(adapter.document(), Number(byText(adapter, text).id));
    const tick = async () => { for (let i = 0; i < 6; i += 1) { await Promise.resolve(); await new Promise((r) => setImmediate(r)); } v.flush(); };
    const out = await api.open(v.record, {});
    test.assert(out.ok, "(setup) the document is mounted in the editor VM");
    const adapter = v.record.liveAdapter;

    // C1: the copy — the frozen blocks go to the board; the system clipboard stays upstream's.
    const para = modelOf(adapter, "这个周末");
    test.assert(!!para, "(setup) the fixture's paragraph is there");
    E().setSel(D().pos(para, 0), D().pos(para, 2));
    const flavours = [];
    v.fire(pages(), "copy", { clipboardData: { setData: (kind, value) => flavours.push([kind, String(value)]) } });
    test.assert(clip.peek() && clip.peek().kind === "write-blocks" && clip.peek().snapshot.plain === "这个",
      "⌘C with a selection puts the frozen blocks on the desk board");
    writeWordsEntry = carry(clip.peek());
    test.assert(writeWordsEntry.source.appId === "clioWrite" && writeWordsEntry.source.fileId === "doc-1"
      && writeWordsEntry.source.fileName === "写作.docx" && writeWordsEntry.source.range === "paragraphs:1",
      "a ClioWrite copy names the app, the file and the paragraph range");
    test.assert(flavours.some(([kind, value]) => kind === "text/plain" && value.includes("这个")),
      "the system clipboard keeps its exact behaviour (the upstream handler still filled it)");
    v.fire(doc.querySelector("#pages"), "beforeinput", { inputType: "insertText", data: "好" });
    await tick();
    test.assert(clip.peek().snapshot.plain === "这个" && clip.peek().snapshot.blocks[0].runs[0].text === "这个",
      "typing into the source afterwards cannot change the frozen copy");

    // C2: ClioChart → ClioWrite — the region becomes a docx table, ONE named step,
    // and the system clipboard's text is outranked by the desk board.
    clip.clear();
    clip.put(chartEntry.kind, chartEntry.snapshot, chartEntry.source);
    const tablesBefore = adapter.tables().length;
    const parasBefore = adapter.paragraphs().length;
    const caret = modelOf(adapter, "最后一段");
    test.assert(!!caret, "(setup) a body paragraph for the caret");
    E().setSel(D().pos(caret, 0));
    v.fire(pages(), "paste", { clipboardData: { getData: () => "系统剪贴板上的字", items: [] } });
    await tick();
    const tables = adapter.tables();
    test.assert(tables.length === tablesBefore + 1 && tables[tables.length - 1].rows[0][0].text === "数量" && tables[tables.length - 1].rows[1][1].text === "25",
      "the ClioChart region lands as a docx table in ClioWrite's own model");
    test.assert(!adapter.paragraphs().some((p) => p.text.includes("系统剪贴板上的字")),
      "the desk board outranks the system clipboard: the system text is not pasted");
    test.assert(api.editHistory().undoLabel() === "clio_write_step_paste_table",
      "the paste is one step named 「粘贴：来自 ClioChart 的表格」");
    test.assert(receipt().startsWith("clio_write_receipt_paste_from:") && receipt().includes(SOURCE_FILE) && receipt().includes("A1:B2"),
      `the status line says where the table came from (${receipt()})`);
    api.editHistory().undo();
    test.assert(adapter.tables().length === tablesBefore && adapter.paragraphs().length === parasBefore,
      "one Undo takes the pasted table out of the document");

    // C3: ClioWrite → ClioWrite — another document's paragraphs come over as blocks.
    clip.clear();
    clip.put(writeWordsEntry.kind, writeWordsEntry.snapshot, writeWordsEntry.source);
    const other = modelOf(adapter, "最后一段");
    E().setSel(D().pos(other, 0));
    v.fire(pages(), "paste", { clipboardData: { getData: () => "", items: [] } });
    await tick();
    test.assert(!!byText(adapter, "这个最后一段") && api.editHistory().undoLabel() === "clio_write_step_paste_paragraphs",
      "the copied paragraphs land as blocks, one step named 「粘贴：来自 ClioWrite 的段落」");
    api.editHistory().undo();
    test.assert(byText(adapter, "最后一段") && !byText(adapter, "这个最后一段"), "(setup) the paragraphs' paste is taken back");

    // C4: ClioStage → ClioWrite — a 文字条 lands as its plain text.
    clip.clear();
    clip.put("stage-text", { lines: ["第一行", "第二行"] }, { appId: "clioStage", fileId: "deck-1", fileName: "季度汇报.md", range: "p1#1", copiedAt: new Date().toISOString() });
    E().setSel(D().pos(modelOf(adapter, "最后一段"), 0));
    v.fire(pages(), "paste", { clipboardData: { getData: () => "", items: [] } });
    await tick();
    test.assert(byText(adapter, "第一行 第二行") && api.editHistory().undoLabel() === "clio_write_step_paste",
      "a deck's 文字条 pastes as plain text, the same 「粘贴」 step a system paste takes");
    test.assert(receipt().startsWith("clio_write_receipt_paste_flattened"), "(setup) Express keeps the lines in one paragraph, the receipt says so");
    api.editHistory().undo();

    // C5: an empty desk board — today's plain-text paste, unchanged.
    clip.clear();
    E().setSel(D().pos(modelOf(adapter, "最后一段"), 0));
    v.fire(pages(), "paste", { clipboardData: { getData: () => "纯系统文本", items: [] } });
    await tick();
    test.assert(byText(adapter, "纯系统文本最后一段") && api.editHistory().undoLabel() === "clio_write_step_paste",
      "an empty board falls back to the system clipboard's plain text, exactly as before");
    api.editHistory().undo();

    // C6: the whole-document copy — a real table in the blocks, for the workbook and the deck.
    const paras = adapter.paragraphs();
    const first = D().byId(adapter.document(), Number(paras[0].id));
    const last = D().byId(adapter.document(), Number(paras[paras.length - 1].id));
    E().setSel(D().pos(first, 0), D().pos(last, D().plen(last)));
    v.fire(pages(), "copy", { clipboardData: { setData: () => {} } });
    writeEntry = carry(clip.peek());
    test.assert(writeEntry && writeEntry.kind === "write-blocks" && writeEntry.snapshot.blocks.some((block) => block && block.t === "tbl"),
      "(setup) a copy across the document carries the table as a tbl block");
    const grid = clip.tableGridOf(clip.peek());
    const modelTable = adapter.tables()[0].rows.map((row) => row.map((cell) => String(cell.text)));
    test.assert(Array.isArray(grid) && grid.length === modelTable.length
      && grid.some((row, ri) => row.some((cell, ci) => cell && cell.text && modelTable[ri][ci] === cell.text)),
      "(setup) tableGridOf reads the docx table's cells back as a grid of texts");
  }

  /* ============ Part B2: ClioWrite → ClioChart, the grid paste ============ */
  {
    const { led, session, clip } = await openWorkbook();
    clip.put(writeEntry.kind, writeEntry.snapshot, writeEntry.source);
    const grid = clip.tableGridOf(clip.peek());
    test.assert(Array.isArray(grid) && grid.length >= 1 && grid.every((row) => Array.isArray(row)),
      "(setup) the ClioWrite copy offers the workbook its table as a grid");
    session.select(7, 0);
    const beforeA8 = session.view(SHEET, "A8").text;
    // The surface wraps tableGridOf's grid in the region-snapshot shape it pastes.
    const out = session.pasteRegion({ rows: grid }, { label: "clio_chart_workbook_step_paste_from_write" });
    test.assert(out.status === "ok" && session.view(SHEET, "A8").text === String(grid[0][0].text),
      "the ClioWrite table's texts land in the sheet's cells");
    test.assert(session.editHistory.undoLabel() === "clio_chart_workbook_step_paste_from_write",
      "that paste is one step named 「粘贴：来自 ClioWrite 的表格」");
    session.editHistory.undo();
    test.assert(session.view(SHEET, "A8").text === beforeA8, "one Undo takes the pasted grid back");
  }

  /* ============ Part D: ClioStage, the page-block model's real runtime ============ */
  const DECK = ["---", "marp: true", "---", "", "# 开场", "", "第一页的一段", "", "---", "", "## 收尾", ""].join("\n");
  {
    const ctx = makeContext();
    tStub(ctx);
    ctx.currentLanguage = "en";
    ctx.escapeHtml = (value) => String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    ctx.markdownToSystemHtml = (markdown) => `<p>${String(markdown).trim()}</p>`;
    ctx.registerEditHistory = () => {};
    ctx.setStatus = () => {};
    ctx.updateMenuState = () => {};
    ctx.clearInterval = () => {};
    // The window's controls bind from the real index.html; this world edits the deck
    // through the board, so the element lookups answer nothing (bindClioStageControls
    // stands down on the missing viewport and the keydown listener is not attached).
    ctx.document.querySelector = () => null;
    loadScripts(ctx, ["app/core/markdown.js", "app/core/edit-history.js", "app/features/slide-themes.js", "app/features/clioworks-clipboard.js", "app/features/clio-stage.js"]);
    // The drawing paths are the windoid's own; the board contract only edits the deck.
    ctx.renderClioStage = () => {};
    ctx.renderClioStageEmpty = () => {};
    ctx.syncClioStageControls = () => {};
    ctx.clioStageRefreshRail = () => {};
    ctx.ensureSlidesMarkdownValidForExport = async () => true;
    const stage = ctx.AISystem6ClioStage;
    const clip = ctx.AISystem6ClioworksClipboard;
    const opened = await stage.load({ markdown: DECK, title: "季度汇报.md", sourceItemId: "deck-1", temporary: true });
    test.assert(opened === true && stage.canEdit(), "(setup) the deck opens editable in slide mode");

    // D1: the copy — the selected 文字条 with its lines and where they came from.
    vm.runInContext("clioStageState.selected = 1", ctx);   // the page's second content block: the paragraph
    stage.clipboardCopy();
    const stageEntry = clip.peek();
    test.assert(stageEntry && stageEntry.kind === "stage-text" && stageEntry.snapshot.lines.join("|") === "第一页的一段",
      "a selected 文字条 copies its lines onto the board");
    test.assert(stageEntry.source.appId === "clioStage" && stageEntry.source.fileId === "deck-1"
      && stageEntry.source.fileName === "季度汇报.md" && stageEntry.source.range === "p1#1",
      "the copy names the deck, the page and the block it came from");

    // D2: ClioChart → ClioStage — the region appends as one GFM 表格 block, one named step.
    clip.clear();
    clip.put(chartEntry.kind, chartEntry.snapshot, chartEntry.source);
    const before = vm.runInContext("clioStageState.source.markdown", ctx);
    stage.clipboardPaste();
    const after = vm.runInContext("clioStageState.source.markdown", ctx);
    const model = ctx.AISystem6SlideThemes.model;
    const page = model.page(after, 0);
    test.assert(page.includes("| 数量 | 单价 |") && page.includes("| 10 | 25 |"),
      "the ClioChart region lands on the page as a GFM table with the region's cells");
    test.assert(after !== before && model.pageCount(after) === model.pageCount(before),
      "the paste appends to the current page and adds no page");
    test.assert(stage.canUndo() && vm.runInContext("clioStageState.history.undoLabel()", ctx) === "edit_step_paste_table",
      "the paste is one deck step named 「粘贴：来自 ClioChart 的表格」");
    stage.undo();
    test.assert(vm.runInContext("clioStageState.source.markdown", ctx) === before, "one Undo takes the table off the page");

    // D3: ClioWrite → ClioStage — paragraphs come over 一段一条.
    clip.clear();
    clip.put(writeEntry.kind, writeEntry.snapshot, writeEntry.source);
    stage.clipboardPaste();
    const deckAfter = vm.runInContext("clioStageState.source.markdown", ctx);
    const pageAfter = model.page(deckAfter, 0);
    const paragraphs = model.contentBlocks(model.parseBlocks(pageAfter)).filter((entry) => entry.block.type === "paragraph");
    const words = writeEntry.snapshot.blocks.filter((block) => block && block.t === "p")
      .map((block) => (block.runs || []).map((r) => (r && r.t === "text" ? r.text : "")).join("")).filter(Boolean);
    test.assert(words.length >= 2 && words.every((word) => paragraphs.some((entry) => entry.block.raw.includes(word))),
      "the copied paragraphs land on the page 一段一条 (one text block each)");
    test.assert(vm.runInContext("clioStageState.history.undoLabel()", ctx) === "edit_step_paste_items",
      "that paste is one deck step named 「粘贴：来自 ClioWrite 的段落」");
    stage.undo();
    test.assert(vm.runInContext("clioStageState.source.markdown", ctx) === before, "(setup) the deck is taken back");
  }

  /* ============ wiring the menus and keys cannot skip the board ============ */
  {
    const source = read("app/features/clio-chart-workbook.js");
    test.assert(/key === 'c' && !inField\(event\)/.test(source) && /clip\.writeSystem\(clip\.plainOf\(entry\), clip\.htmlOf\(entry\)\)/.test(source),
      "the workbook's ⌘C skips a focused field, puts the board copy and downgrades for the system clipboard");
    test.assert(/on\(rootEl, 'copy', \(event\) => \{/.test(source) && /inField\(event\)\) return/.test(source),
      "a copy the browser raises on its own reaches the board too, but a field's own copy never does");
    test.assert(/key === 'v'/.test(source) && /pasteFromBoard\(\)/.test(source) && /const entry = clip\.peek\(\);\s*\n\s*if \(!entry\) return;/s.test(source.slice(source.indexOf("function pasteFromBoard"))),
      "⌘V reads the board first and stands down when it is empty (today's behaviour)");
    test.assert(source.includes("copyFromBoard,") && source.includes("pasteFromBoard,"), "the surface exports the board's two ends for the capture route");
    test.assert(source.includes("paste: 'clio_chart_workbook_step_paste'") && source.includes("paste_from_write: 'clio_chart_workbook_step_paste_from_write'"),
      "the workbook's paste steps are named in STEP_KEYS");
    test.assert(source.includes("const source = grid ? { rows: grid } : single();"),
      "the write-table grid rides the region-snapshot shape pasteRegion reads");
    const write = read("app/features/clio-write.js");
    test.assert(/if \(pasteFromDeskBoard\(event\)\) return;/.test(write) && /const entry = clip\.peek\(\);\s*\n\s*if \(!entry\) return false;/.test(write),
      "ClioWrite's paste reads the board first and falls through when it is empty");
    test.assert(write.includes("'粘贴：来自 ClioChart 的表格': 'clio_write_step_paste_table'")
      && write.includes("'粘贴：来自 ClioWrite 的段落': 'clio_write_step_paste_paragraphs'"),
      "ClioWrite's app-to-app pastes are named in STEP_KEYS");
    const stage = read("app/features/clio-stage.js");
    test.assert(stage.includes('label: "edit_step_paste_table"') && stage.includes('label: "edit_step_paste_items"'),
      "the deck's app-to-app pastes name their steps");
    test.assert(stage.includes('clioStageSelectionKey(event) && !event.altKey && !event.shiftKey') && stage.includes("clioStageClipboardCopy()") && stage.includes("clioStageClipboardPaste()"),
      "⌘C / ⌘V outside an edit session reach the board's two ends");
    for (const lang of ["en", "zh"]) {
      const ctx = { window: {} };
      vm.runInNewContext(read(`app/data/translations-${lang}.js`), ctx);
      const table = Object.values(ctx.window)[0];
      const keys = ["clio_write_step_paste_table", "clio_write_step_paste_paragraphs", "clio_write_receipt_paste_from",
        "clio_chart_workbook_step_paste", "clio_chart_workbook_step_paste_from_write", "clio_chart_workbook_receipt_copied",
        "clio_chart_workbook_receipt_pasted", "edit_step_paste_table", "edit_step_paste_items",
        "clioworks_clip_source", "clioworks_clip_copied", "clioworks_clip_pasted"];
      const missing = keys.filter((key) => table[key] == null);
      test.assert(missing.length === 0, `${lang}: every N11 string is translated${missing.length ? ` — missing ${missing.join(", ")}` : ""}`);
    }
  }

  test.finish();
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
