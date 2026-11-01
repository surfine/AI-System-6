// 1.0.60 ClioTalk 代理（所有者裁决 D1）的 Office 投影合同：桌面用三个 headless
// adapter（Quire/Ledger/Lectern）把借出的单份 docx/xlsx/pptx 读成纯文本投影给
// 引擎，diff 投影前后算候选，native-locate 三态对位回 live adapter。每条断言都
// 按真实语料跑：确定性（同一份字节两次投影逐字节相同）、往返（投影上改一处 →
// diff 一条候选 → 对新开的 adapter 对位 exact）、作者在原文上方动手后仍能找回、
// xlsx 的公式列（公式.tsv 地址<TAB>公式）、pptx 的形状 id 与备注。
// 本 lane 不写回文档；对位结果 exact/lost/ambiguous 从不猜。
import vm from "node:vm";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("agent-projection");
const corpus = (name) => new Uint8Array(readFileSync(resolveProjectPath(`tests/fixtures/real-corpus/${name}`)));
const D01 = corpus("docx/D01.docx");
const D03 = corpus("docx/D03.docx");
const D18 = corpus("docx/D18.docx");
const X07 = corpus("xlsx/X07.xlsx");
const X02 = corpus("xlsx/X02.xlsx");
const P01 = corpus("pptx/P01.pptx");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

const META = { name: "借出.docx", documentId: "agent-projection-contract", generation: 1 };
const PROJECTION_SOURCES = ["app/core/text-quote.js", "app/vendor/clioworks-v3/native-locate.js", "app/features/agent-projection.js"];
const ADAPTERS = {
  docx: ["quire-adapter.js", "ClioWorksQuireAdapter"],
  xlsx: ["ledger-adapter.js", "ClioWorksLedgerAdapter"],
  pptx: ["lectern-adapter.js", "ClioWorksLecternAdapter"],
};

function session() {
  const ctx = makeContext();
  loadScripts(ctx, PROJECTION_SOURCES);
  const run = (code) => vm.runInContext(code, ctx);
  const project = (bytes, format, meta = META) => {
    ctx.__bytes = bytes;
    ctx.__format = format;
    ctx.__meta = meta;
    return run("AISystem6AgentProjection.project(globalThis.__bytes, globalThis.__format, globalThis.__meta)");
  };
  // 同一上下文里再开一份同格式的 live adapter（各自拥有自己的模型与 undo 历史）。
  const openAdapter = (bytes, format, meta = META) => {
    const [file, globalName] = ADAPTERS[format];
    ctx.__openBytes = bytes;
    ctx.__openMeta = meta;
    return run(`(async () => {
      if (!globalThis.${globalName}) {
        await new Promise((resolve, reject) => {
          const el = document.createElement("script");
          el.src = "app/vendor/clioworks-v3/${file}";
          el.onload = () => resolve();
          el.onerror = (e) => reject(new Error("adapter load failed"));
          document.head.appendChild(el);
        });
      }
      return ${globalName}.open(globalThis.__openBytes, globalThis.__openMeta);
    })()`);
  };
  const diff = (before, after, map) => {
    ctx.__before = before;
    ctx.__after = after;
    ctx.__map = map;
    return run("AISystem6AgentProjection.diff(globalThis.__before, globalThis.__after, globalThis.__map)");
  };
  const relocate = (candidate, adapter) => {
    ctx.__candidate = candidate;
    ctx.__adapter = adapter;
    return run("AISystem6AgentProjection.relocate(globalThis.__candidate, globalThis.__adapter)");
  };
  return { ctx, run, project, openAdapter, diff, relocate };
}

const fileOf = (projection, path) => projection.files.find((f) => f.path === path);
const setText = (projection, path, text) => ({
  files: projection.files.map((f) => (f.path === path ? { path: f.path, text } : f)),
});
const json = (value) => JSON.stringify(value);
const colName = (c) => {
  let s = "";
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const run = async () => {
  // 1. 确定性：同一份 docx 在两个全新上下文里投影，逐字节相同；manifest 的
  //    sha256 与源字节一致。
  {
    const a = await session().project(D01, "docx");
    const b = await session().project(D01, "docx");
    test.assert(json(a) === json(b), "the same docx bytes project byte-identically in a fresh context (files, map, manifest)");
    test.assert(a.manifest.sha256 === sha(Buffer.from(D01)), "manifest.sha256 is the sha256 of the source bytes");
    test.assert(a.manifest.objectId === null && a.manifest.format === "docx", "manifest.json carries the objectId placeholder and the format");
    const body = fileOf(a, "正文.md");
    test.assert(!!body && /^\{#¶1\}/.test(body.text), "正文.md marks every paragraph with a {#¶N} ordinal");
    test.assert(a.map.paragraphs.length === 3 && a.map.tables.length === 1, "D01 reads as 3 paragraphs and 1 table, and the table is listed as a projection loss");
    test.assert(!json(a).includes('"projectedAt"') && !json(a).includes('"date"'), "the projection carries no timestamp, so determinism is structural");
  }

  // 2. docx 往返：在投影上改一段 → diff 出一条候选 → 对新开的 adapter 对位 exact。
  {
    const s = session();
    const projection = await s.project(D01, "docx");
    const entry = projection.map.paragraphs.find((p) => p.anchor);
    const body = fileOf(projection, "正文.md");
    const marked = "{#¶" + entry.ordinal + "}";
    const line = body.text.split("\n").find((l) => l.startsWith(marked));
    const after = setText(projection, "正文.md", body.text.replace(line + "\n", line.replace(entry.anchor.quote, entry.anchor.quote + "（引擎改）") + "\n"));
    const candidates = s.diff(projection, after, projection.map);
    test.assert(candidates.length === 1, `editing one paragraph in the projection yields exactly one candidate (got ${candidates.length})`);
    const [candidate] = candidates;
    test.assert(candidate.ordinal === entry.ordinal && candidate.before === entry.anchor.quote && candidate.after === entry.anchor.quote + "（引擎改）", "the candidate names the changed paragraph by ordinal with before/after text");
    test.assert(candidate.location && candidate.location.kind === "text" && candidate.location.quote.quote === entry.anchor.quote, "the candidate carries a TextQuote location for the live document");
    const adapter = await s.openAdapter(D01, "docx");
    const resolved = s.relocate(candidate, adapter);
    test.assert(resolved.resolution === "exact", `relocate finds the edited paragraph in a freshly opened adapter (got ${json(resolved).slice(0, 120)})`);
  }

  // 3. 作者在原文上动手之后：上方插入一段（splitParagraph(…, 0)）→ exact 且 moved；
  //    改上一段的尾巴（前缀上下文失效）→ exact；把原文删掉 → lost。
  {
    const s = session();
    const projection = await s.project(D01, "docx");
    const entry = projection.map.paragraphs[1]; // 「考 生 基 本 信 息 表」，前缀来自上一段
    const candidate = {
      format: "docx",
      ordinal: entry.ordinal,
      before: entry.anchor.quote,
      after: "改写后的话",
      location: { documentId: projection.map.identity.documentId, generation: projection.map.identity.generation, kind: "text", quote: { ...entry.anchor, unit: "utf16" } },
    };
    const adapter = await s.openAdapter(D01, "docx");
    const target = adapter.paragraphs()[entry.ordinal - 1];
    const split = adapter.splitParagraph(target.id, 0);
    test.assert(split.newParagraphId && adapter.paragraphs().length === 4, "the writer inserts an empty paragraph above the target");
    const afterInsert = s.relocate(candidate, adapter);
    test.assert(afterInsert.resolution === "exact" && afterInsert.moved === true, `after an insert above, relocate still lands exactly (got ${json(afterInsert).slice(0, 120)})`);
    const previous = adapter.paragraphs()[0];
    const runIndex = previous.runs.findIndex((r) => r.kind === "text" && r.text);
    adapter.setRunText(previous.id, runIndex, previous.runs[runIndex].text + "（作者补了一句）");
    const afterNeighborEdit = s.relocate(candidate, adapter);
    test.assert(afterNeighborEdit.resolution === "exact", `after the paragraph above is edited, relocate falls back to one-sided context and stays exact (got ${json(afterNeighborEdit).slice(0, 160)})`);
    const adapter2 = await s.openAdapter(D01, "docx");
    const target2 = adapter2.paragraphs()[entry.ordinal - 1];
    const run2 = target2.runs.findIndex((r) => r.kind === "text" && r.text);
    adapter2.setRunText(target2.id, run2, "原文已经被改掉了");
    const lost = s.relocate(candidate, adapter2);
    test.assert(lost.resolution === "lost", `when the quoted words are gone, relocate says lost (got ${json(lost).slice(0, 120)})`);
  }

  // 4. xlsx：值单元格往返（X07 两张表）；公式.tsv 列（X02）；公式候选对位。
  {
    const s = session();
    const projection = await s.project(X07, "xlsx");
    test.assert(projection.map.sheets.length === 2 && projection.map.sheets.every((sh) => sh.file.endsWith(".csv")), "X07 projects one <sheet>.csv per sheet");
    test.assert(projection.map.formulaFile === null && !fileOf(projection, "公式.tsv"), "a workbook with no formulas ships no 公式.tsv");
    const sheet = projection.map.sheets[0];
    const csv = fileOf(projection, sheet.file).text;
    // 找网格里第一个非空单元格，整行重建地改它（不靠字符串全局替换碰巧命中）。
    const rows = csv.split("\n");
    let editRow = -1;
    let editCol = -1;
    for (let r = 0; r < rows.length && editRow < 0; r += 1) {
      const fields = rows[r].split(",");
      for (let c = 0; c < fields.length; c += 1) {
        if (fields[c] !== "") { editRow = r; editCol = c; break; }
      }
    }
    test.assert(editRow >= 0, "the projected sheet has at least one non-empty cell to edit");
    const fields = rows[editRow].split(",");
    fields[editCol] = "投影改的";
    rows[editRow] = fields.join(",");
    const after = setText(projection, sheet.file, rows.join("\n"));
    const candidates = s.diff(projection, after, projection.map);
    const address = colName(editCol + 1) + (editRow + 1);
    test.assert(candidates.length === 1 && candidates[0].kind === "value" && candidates[0].sheet === sheet.name && candidates[0].address === address, `editing one cell in the projection yields one value candidate at ${address} (got ${json(candidates).slice(0, 160)})`);
    const adapter = await s.openAdapter(X07, "xlsx");
    const resolved = s.relocate(candidates[0], adapter);
    test.assert(resolved.resolution === "exact", `the value candidate relocates exactly against a fresh adapter (got ${json(resolved).slice(0, 120)})`);

    const withFormulas = await s.project(X02, "xlsx");
    const tsv = fileOf(withFormulas, "公式.tsv");
    test.assert(!!tsv, "a workbook with formulas ships 公式.tsv");
    const lines = tsv.text.split("\n").filter(Boolean);
    test.assert(lines.length === 16 && lines.every((l) => /^[^\t]+![A-Z]+\d+\t.+$/.test(l)), `公式.tsv holds one sheet!address<TAB>formula line per formula (got ${lines.length})`);
    test.assert(withFormulas.map.sheets.reduce((n, sh) => n + sh.formulas, 0) === 16, "the map counts every formula per sheet");
    const targetLine = lines[0];
    const [cellKey, formula] = targetLine.split("\t");
    const [sheetName, formulaAddress] = cellKey.split("!");
    const afterFormula = setText(withFormulas, "公式.tsv", tsv.text.replace(targetLine, cellKey + "\t" + formula + "+0"));
    const formulaCandidates = s.diff(withFormulas, afterFormula, withFormulas.map);
    test.assert(formulaCandidates.length === 1 && formulaCandidates[0].kind === "formula" && formulaCandidates[0].address === formulaAddress && formulaCandidates[0].sheet === sheetName, `editing a formula line yields one formula candidate named by sheet and address (got ${json(formulaCandidates).slice(0, 160)})`);
    test.assert(formulaCandidates[0].formulaCell === true, "the formula candidate is marked as a formula cell so the writer never overwrites it with a value");
    const ledger = await s.openAdapter(X02, "xlsx");
    const resolvedFormula = s.relocate(formulaCandidates[0], ledger);
    test.assert(resolvedFormula.resolution === "exact", `the formula candidate relocates exactly against a fresh adapter (got ${json(resolvedFormula).slice(0, 120)})`);
    test.assert(s.diff(projection, projection, projection.map).length === 0, "diffing a projection against itself yields no candidates");
  }

  // 5. pptx：形状块按文本对位。Lectern 的形状/页 id 和 Ledger 的 sheet id 都是
  //    开档时 L.uid（时间+随机）生成的，跨开档无效——投影产物里没有任何会话性
  //    id，锚是 deck 文本上的 TextQuote；relocate 的 exact 结果才给当前会话的 id。
  {
    const s = session();
    const projection = await s.project(P01, "pptx");
    test.assert(projection.map.slides.length === 2 && projection.map.slides.every((sl) => sl.shapes.length === 2), "P01 projects 2 slides with their editable text shapes");
    test.assert(projection.map.slides.every((sl) => sl.shapes.every((shape) => shape.anchor && !("sessionShapeId" in shape) && !("id" in sl))), "the projection carries no session-scoped ids, only TextQuote anchors");
    const page = projection.map.slides[0];
    const pageText = fileOf(projection, page.file).text;
    test.assert(pageText.includes("{#s1}\n") && pageText.includes("{#s2}\n"), "第NN页.md marks each shape with a {#sN} block");
    test.assert(!!fileOf(projection, page.notesFile) && page.notes === true, "the slide's speaker notes ride 第NN页-备注.md");
    const shape = page.shapes[0];
    const block = parseBlock(pageText, shape.ordinal);
    const after = setText(projection, page.file, pageText.replace("{#s" + shape.ordinal + "}\n" + block, "{#s" + shape.ordinal + "}\n" + block + "（引擎改）"));
    const candidates = s.diff(projection, after, projection.map);
    test.assert(candidates.length === 1 && candidates[0].shape === shape.ordinal && candidates[0].slide === 1, `editing one shape block yields one candidate named by page and shape ordinal (got ${json(candidates).slice(0, 160)})`);
    const adapter = await s.openAdapter(P01, "pptx");
    const resolved = s.relocate(candidates[0], adapter);
    test.assert(resolved.resolution === "exact" && resolved.page === 1 && typeof resolved.sessionShapeId === "string", `the shape candidate relocates exactly onto page 1 and hands back the current session's shape id (got ${json(resolved).slice(0, 200)})`);

    const notesFile = page.notesFile;
    const notesBefore = fileOf(projection, notesFile).text;
    const afterNotes = setText(projection, notesFile, notesBefore.replace(/\n$/, "") + "（引擎补了一句）\n");
    const notesCandidates = s.diff(projection, afterNotes, projection.map);
    test.assert(notesCandidates.length === 1 && notesCandidates[0].kind === "notes" && notesCandidates[0].shape === null, "editing a notes file yields one notes candidate");
    const notesResolved = s.relocate(notesCandidates[0], adapter);
    test.assert(notesResolved.resolution === "exact" && notesResolved.index === 0, `a notes candidate relocates to its slide by page (got ${json(notesResolved).slice(0, 120)})`);
  }

  // 6. docx 表格（L2b）：D01 的 19 行不规则表逐格进正文（{#tT.rR.cC}，格内换行
  //    逐行带标），合并格写一次并在 map.tables 注明；覆盖率 ≥95%；格编辑往返
  //    exact；作者在表上方插一行后 relocate 仍 exact。
  {
    const s = session();
    const projection = await s.project(D01, "docx");
    const table = projection.map.tables[0];
    const body = fileOf(projection, "正文.md").text;
    test.assert(table.rows === 19 && table.cells.length === 101, "D01's map lists the irregular table with every one of its 101 cells");
    test.assert(table.regular === false && Array.isArray(table.merges) && table.merges.length > 0 && table.merges.every((m) => m.span > 1 || m.vMerge), "the irregular table is marked irregular and its merged/spanned cells are noted in map.tables");
    test.assert(body.includes("{#t1.r1.c1}姓名\n") && body.includes("{#t1.r4.c7}基层工作\n{#t1.r4.c7}年限\n") && body.includes("{#t1.r4.c8}x年\n"), "正文.md carries one {#tN.rR.cC} line per cell at the table's document position");
    const adapter = await s.openAdapter(D01, "docx");
    const live = adapter.tables()[0];
    const total = adapter.paragraphs().reduce((n, p) => n + p.text.length, 0) + live.rows.reduce((n, row) => n + row.reduce((m, c) => m + c.text.length, 0), 0);
    test.assert(total > 0 && projectBodyCoverage(body) / total >= 0.95, `D01 coverage is ≥95% of paragraph+table text (got ${(projectBodyCoverage(body) / total * 100).toFixed(1)}%)`);
    const after = setText(projection, "正文.md", body.replace("{#t1.r4.c8}x年\n", "{#t1.r4.c8}x年（引擎改）\n"));
    const candidates = s.diff(projection, after, projection.map);
    test.assert(candidates.length === 1 && candidates[0].kind === "table-cell" && candidates[0].table === 1 && candidates[0].row === 4 && candidates[0].cell === 8, `editing one cell line yields one table-cell candidate named by table/row/cell (got ${json(candidates).slice(0, 200)})`);
    test.assert(candidates[0].before === "x年" && candidates[0].after === "x年（引擎改）" && candidates[0].location && candidates[0].location.kind === "text", "the cell candidate carries before/after text and a TextQuote location over the cell");
    const fresh = await s.openAdapter(D01, "docx");
    const resolved = s.relocate(candidates[0], fresh);
    test.assert(resolved.resolution === "exact" && resolved.row === 4 && resolved.cell === 8, `a cell edit relocates exactly onto the live table cell (got ${json(resolved).slice(0, 200)})`);
    s.ctx.__adapter = adapter;
    s.run(`(function () {
      const docModel = globalThis.__adapter.document();
      const tbl = docModel.main.blocks.find((b) => b.t === "tbl");
      globalThis.__adapter.modelCommand("Contract Row Insert", () => {
        tbl.rows.unshift(L.D.row([L.D.cell([L.D.para([])])]));
        L.D.touchTbl(tbl);
      });
    })()`);
    const afterInsert = s.relocate(candidates[0], adapter);
    test.assert(afterInsert.resolution === "exact", `after a row is inserted above, the cell still relocates exactly (got ${json(afterInsert).slice(0, 200)})`);
  }

  // 7. docx 规则网格（D03 第一张 8×6 表）：投成 Markdown 表，格编辑同样往返。
  {
    const s = session();
    const projection = await s.project(D03, "docx");
    const table = projection.map.tables[0];
    const body = fileOf(projection, "正文.md").text;
    test.assert(table.regular === true && table.rows === 8 && table.cells.length === 48 && !table.merges, "D03's regular 8×6 grid is marked regular with all 48 cells and no merges");
    test.assert(body.includes("|资料分类|资料项目|资料项目名称|袋   次|页   号|备   注|\n|---|---|---|---|---|---|\n"), "the regular grid rides a Markdown table with its separator row");
    const after = setText(projection, "正文.md", body.replace("|资料分类|", "|资料分类（引擎改）|"));
    const candidates = s.diff(projection, after, projection.map);
    test.assert(candidates.length === 1 && candidates[0].kind === "table-cell" && candidates[0].table === 1 && candidates[0].row === 1 && candidates[0].cell === 1, `editing one Markdown cell yields one table-cell candidate (got ${json(candidates).slice(0, 200)})`);
    const adapter = await s.openAdapter(D03, "docx");
    const resolved = s.relocate(candidates[0], adapter);
    test.assert(resolved.resolution === "exact" && resolved.row === 1 && resolved.cell === 1, `the Markdown cell candidate relocates exactly onto the live cell (got ${json(resolved).slice(0, 200)})`);
  }

  // 8. docx 批注（D18）：只读列出在 批注.md（{#cN} 作者 · 日期：原文锚 → 批注文字），
  //    引擎看得见；批注不产 diff 候选。
  {
    const s = session();
    const projection = await s.project(D18, "docx");
    const commentsFile = fileOf(projection, "批注.md");
    test.assert(!!commentsFile && projection.map.commentsFile === "批注.md" && projection.map.comments === 1, "D18's Word comment rides 批注.md and stays counted in the map");
    test.assert(commentsFile.text === "{#c1} Miklos Vajna · 2026-01-22T09:45:00Z：bbb → x\n", "批注.md lists the comment as {#cN} author · date：anchor → text");
    test.assert(s.diff(projection, projection, projection.map).length === 0, "the comments file yields no diff candidates");
  }

  test.finish();
};

function parseBlock(pageText, ordinal) {
  const marker = "{#s" + ordinal + "}\n";
  const start = pageText.indexOf(marker) + marker.length;
  const next = pageText.indexOf("\n{#s", start);
  return pageText.slice(start, next < 0 ? pageText.length : next + 1).replace(/\n$/, "");
}

// 投影正文里落在 {#¶}/{#t} 行上的字符数：同一格的续行按接回的换行补 1。覆盖率的
// 分母是 live adapter 的段落 + 表格文本总长。
function projectBodyCoverage(body) {
  let covered = 0;
  let previous = null;
  for (const line of body.split("\n")) {
    const pm = /^\{#¶\d+\}/.exec(line);
    const cm = /^\{#t\d+\.r\d+\.c\d+\}/.exec(line);
    if (pm) { covered += line.length - pm[0].length; previous = null; }
    else if (cm) {
      if (previous === cm[0]) covered += 1;
      covered += line.length - cm[0].length;
      previous = cm[0];
    } else previous = null;
  }
  return covered;
}

run();
