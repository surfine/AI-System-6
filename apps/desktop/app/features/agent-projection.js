/* Office 投影（所有者裁决 D1，ClioTalk/SideAsk 1.0.60）：桌面替引擎读借来的单份
 * Office 文件。引擎在沙盒里只见到纯文本投影；改动由桌面 diff 投影前后算成候选，
 * 再用 native-locate 的三态对位（exact / lost / ambiguous）在 live adapter 里找回
 * 原位。本模块只读不写：任何写回文档的路都归 ClioWorks 自己的修订 / 批注通道。
 *
 *   project(bytes, format[, options]) → { files: [{path, text}], map, manifest }
 *     docx → 正文.md，段落与表格按正文块序落位：段落一行 `{#¶N}` 前缀；表格
 *            规则网格（行列整齐、无合并、格内单段无竖线）投成 Markdown 表，
 *            否则每格每物理行一行 `{#tT.rR.cC}`（同一格多行用同一标记，拼接即
 *            还原格文本；合并格只写一次）。Quire 模型的合并信息在 tcPr（span /
 *            vMerge），adapter 的表格视图不暴露，从 document() 按同一份 rows/cells
 *            顺序取，记进 map.tables[].merges。Word 批注只读列出在 批注.md
 *            （`{#cN} 作者 · 日期：原文锚 → 批注文字`），不产候选。
 *            段落与格的序位（N/T/R/C）都是单次解析内的 1 基计数（Quire 的 id 是
 *            行程内计数器，跨开档无效，所以对位走 TextQuote 上下文）。
 *     xlsx → 每张表一个 `<表名>.csv`（显示值），加一份 `公式.tsv`（`表!地址<TAB>公式`）。
 *     pptx → 每页一个 `第NN页.md`，可编辑文本形状一块 `{#sN}`；备注在 `第NN页-备注.md`。
 *     manifest.json：objectId 占位、源字节 sha256、format、counts。全程无时间戳、
 *     无随机数——同一份字节两次投影逐字节相同。
 *   diff(before, after, map) → 候选列表（docx 段落与表格格 / xlsx 单元格与公式 /
 *     pptx 形状与备注）。
 *   relocate(candidate, currentAdapter) → 用 native-locate 对位；绝不猜。docx 表格
 *     格候选对的是「本表全部格文本行主序 \n 相接」的底稿——投影与对位两次用同一
 *     构造，上方插行只平移偏移，格文本与邻格上下文不变。
 *
 * 三个编解码器共用全局 L（native-host.js 的「codec world」问题）。本模块在
 * window.AISystem6ClioWorks 在场时把开档交给它的 ownCodec()（那套快照归它管）；
 * 不在场时自己维护同款 world 快照。投影读文件与 relocate 对位都只走模型调用，
 * 不碰编解码器的写出面。
 *
 * 无 DOM、无翻译文案：合同在 vm 里裸跑（tests/features/agent-projection.test.mjs）。
 */
(function (root) {
  'use strict';
  if (root.AISystem6AgentProjection) return;

  const ADAPTERS = {
    docx: { script: 'app/vendor/clioworks-v3/quire-adapter.js', global: 'ClioWorksQuireAdapter' },
    xlsx: { script: 'app/vendor/clioworks-v3/ledger-adapter.js', global: 'ClioWorksLedgerAdapter' },
    pptx: { script: 'app/vendor/clioworks-v3/lectern-adapter.js', global: 'ClioWorksLecternAdapter' },
  };
  const BODY_FILE = '正文.md';
  const COMMENTS_FILE = '批注.md';
  const FORMULA_FILE = '公式.tsv';
  const MANIFEST_FILE = 'manifest.json';

  function textQuote() {
    const tq = root.AISystem6TextQuote;
    if (!tq || typeof tq.createAnchor !== 'function') throw new Error('agent-projection: app/core/text-quote.js is required');
    return tq;
  }
  function nativeLocate() {
    const nl = root.AISystem6NativeLocate;
    if (!nl || typeof nl.resolveLocation !== 'function') throw new Error('agent-projection: app/vendor/clioworks-v3/native-locate.js is required');
    return nl;
  }

  // 投影器搭 config.js 的 ensureAgentCloudModule 懒链（floppy 预算只给得起一个
  // 路径）；两个前置文件在首次 project() 时由这里带上——与 codec 的运行期脚本
  // 装载同款模式。两个文件都有安装守卫，重复装载无害。relocate 是同步面：调用
  // 前必须跑过一次 project()（或另行预载），否则如实抛错，绝不装作 lost。
  async function ensurePrereqs() {
    await loadScriptOnce('app/core/text-quote.js');
    await loadScriptOnce('app/vendor/clioworks-v3/native-locate.js');
  }

  /* --------------------------------------------------------------- 字节与加载 */
  function cloneBytes(bytes) {
    return bytes instanceof Uint8Array
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : bytes.slice(0);
  }

  async function sha256Hex(buffer) {
    const subtle = root.crypto && root.crypto.subtle;
    if (!subtle || typeof subtle.digest !== 'function') return null;
    const digest = await subtle.digest('SHA-256', buffer);
    let out = '';
    for (const b of new Uint8Array(digest)) out += b.toString(16).padStart(2, '0');
    return out;
  }

  const scriptPromises = new Map();
  function loadScriptOnce(src) {
    if (scriptPromises.has(src)) return scriptPromises.get(src);
    const promise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve(true);
      el.onerror = () => { scriptPromises.delete(src); reject(new Error('agent-projection: failed to load ' + src)); };
      document.head.appendChild(el);
    });
    scriptPromises.set(src, promise);
    return promise;
  }

  // 与 native-host.js 的 codec world 同一套纪律：每个格式的 L 名字集合在它自己
  // 的编解码器装完那一刻快照；之后任何该格式的操作先把名字集合切回去。三个
  // 格式只读不改模型之外的东西，切名字足以保证读对的实现。
  const worlds = new Map();
  async function ownCodec(format) {
    const spec = ADAPTERS[format];
    if (!spec) throw new Error('agent-projection: unsupported format ' + format);
    const host = root.AISystem6ClioWorks;
    if (host && typeof host.ownCodec === 'function') return host.ownCodec(format);
    if (!root[spec.global]) await loadScriptOnce(spec.script);
    const factory = root[spec.global];
    if (!factory || typeof factory.open !== 'function') throw new Error('agent-projection: ' + spec.global + ' did not install');
    if (typeof factory.loadCodec === 'function') await factory.loadCodec();
    if (!worlds.has(format)) {
      const L = root.L;
      const names = new Map();
      if (L && typeof L === 'object') for (const key of Object.keys(L)) names.set(key, L[key]);
      worlds.set(format, names);
    }
    const names = worlds.get(format);
    const L = root.L;
    if (L && typeof L === 'object') {
      for (const key of Object.keys(L)) if (!names.has(key)) delete L[key];
      for (const [key, value] of names) L[key] = value;
    }
    return factory;
  }

  /* -------------------------------------------------------------- 小工具 */
  function colName(c) {
    let s = '';
    for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  function csvField(value) {
    const s = String(value == null ? '' : value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const s = String(text == null ? '' : text);
    const push = () => { row.push(field); rows.push(row); row = []; field = ''; };
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];
      if (inQuotes) {
        if (ch === '"') {
          if (s[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\r') { if (s[i + 1] === '\n') i += 1; push(); }
      else if (ch === '\n') push();
      else field += ch;
    }
    if (field !== '' || row.length) push();
    return rows;
  }

  function safeStem(name, taken) {
    const stem = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'sheet';
    let candidate = stem;
    let n = 2;
    while (taken.has(candidate)) candidate = stem + '-' + n++;
    taken.add(candidate);
    return candidate;
  }

  const pad2 = (n) => String(n).padStart(2, '0');

  function identityOf(adapter) {
    return { documentId: adapter.documentId || '', generation: adapter.generation || 1 };
  }

  function textLocation(map, anchor) {
    return {
      documentId: map.identity.documentId,
      generation: map.identity.generation,
      kind: 'text',
      quote: { ...anchor, unit: 'utf16' },
    };
  }

  /* ------------------------------------------------------------------ project */
  // 表格视图（tables()）不暴露合并信息；从模型里按 id 找同表、按同一份 rows/cells
  // 顺序取 tcPr 的 span（gridSpan）与 vMerge。取不到（结构对不上）就按无合并处理，
  // 此时只会走逐格形态，格仍然一格格写，不会把跨占的格位复写。
  function tableSpanInfo(doc, view) {
    const blocks = doc && doc.main && Array.isArray(doc.main.blocks) ? doc.main.blocks : [];
    const model = blocks.find((b) => b && b.t === 'tbl' && String(b.id) === String(view.id));
    if (!model || !Array.isArray(model.rows) || model.rows.length !== view.rows.length) return null;
    const cells = model.rows.map((row, r) => {
      if (!Array.isArray(row.cells) || row.cells.length !== view.rows[r].length) return null;
      return row.cells.map((c) => {
        const tc = c && c.tcPr ? c.tcPr : {};
        return {
          span: Number.isSafeInteger(tc.span) && tc.span > 1 ? tc.span : 1,
          vMerge: tc.vMerge === 'restart' || tc.vMerge === 'continue' ? tc.vMerge : null,
        };
      });
    });
    if (cells.some((row) => row === null)) return null;
    return {
      gridCols: Array.isArray(model.grid) ? model.grid.length : 0,
      cells,
      shifted: model.rows.some((row) => row.trPr && (row.trPr.gridBefore || row.trPr.gridAfter)),
    };
  }

  // 规则网格 = 行列整齐、无横纵合并、格内单段、无竖线（Markdown 表格的转义面），
  // 也没有整行全是连字符的格（会被当成 Markdown 分隔行）。
  function regularGrid(view, spanInfo) {
    if (!spanInfo || spanInfo.shifted || !view.rows.length) return false;
    const len = view.rows[0].length;
    if (!len || spanInfo.gridCols !== len) return false;
    return view.rows.every((row, r) => row.length === len && row.every((c, ci) => {
      const sp = spanInfo.cells[r][ci];
      return sp.span === 1 && !sp.vMerge && c.text.indexOf('\n') < 0 && c.text.indexOf('|') < 0 && !/^-+$/.test(c.text);
    }));
  }

  // 格锚的底稿：本表全部格文本按行主序 \n 相接。relocate 用同一构造重建（见那边
  // 的注释），空格造不出锚（TextQuote 不收空白引文），如实留 null。
  function cellAnchorMap(view, tq) {
    const base = view.rows.map((row) => row.map((c) => c.text).join('\n')).join('\n');
    const anchors = [];
    let at = 0;
    for (const row of view.rows) {
      for (const c of row) {
        anchors.push(c.text ? tq.createAnchor(base, at, at + c.text.length) : null);
        at += c.text.length + 1;
      }
    }
    return anchors;
  }

  function pushDocxTable(lines, tables, view, spanInfo, ordinal, tq) {
    const regular = regularGrid(view, spanInfo);
    const anchors = cellAnchorMap(view, tq);
    const cells = [];
    const merges = [];
    let k = 0;
    view.rows.forEach((row, r) => row.forEach((c, ci) => {
      cells.push({ row: r + 1, cell: ci + 1, anchor: anchors[k] || null });
      const sp = spanInfo ? spanInfo.cells[r][ci] : null;
      if (sp && (sp.span > 1 || sp.vMerge)) {
        merges.push(sp.vMerge ? { row: r + 1, cell: ci + 1, span: sp.span, vMerge: sp.vMerge } : { row: r + 1, cell: ci + 1, span: sp.span });
      }
      k += 1;
    }));
    const table = {
      id: view.id,
      rows: view.rows.length,
      cols: spanInfo ? spanInfo.gridCols : (view.rows[0] ? view.rows[0].length : 0),
      regular,
      cells,
    };
    if (merges.length) table.merges = merges;
    tables.push(table);
    if (regular) {
      view.rows.forEach((row, r) => {
        if (r === 1) lines.push('|' + row.map(() => '---').join('|') + '|');
        lines.push('|' + row.map((c) => c.text).join('|') + '|');
      });
    } else {
      // 逐格形态：格内每个物理行都带同一 {#tT.rR.cC} 标记，diff 把同标各行按 \n
      // 接回原文本；合并格的文本只在它的格位出现一次。
      view.rows.forEach((row, r) => row.forEach((c, ci) => {
        const marker = '{#t' + ordinal + '.r' + (r + 1) + '.c' + (ci + 1) + '}';
        for (const part of c.text.split('\n')) lines.push(marker + part);
      }));
    }
    lines.push('');
  }

  function projectDocx(adapter) {
    const tq = textQuote();
    const paragraphs = adapter.paragraphs();
    const plain = paragraphs.map((p) => p.text).join('\n');
    const entries = [];
    let at = 0;
    let drawings = 0;
    paragraphs.forEach((p, i) => {
      entries.push({
        ordinal: i + 1,
        anchor: tq.createAnchor(plain, at, at + p.text.length),
        headingLevel: p.headingLevel || 0,
        list: p.list || null,
      });
      at += p.text.length + 1;
      for (const run of p.runs) if (run.kind === 'image') drawings += 1;
    });
    const doc = typeof adapter.document === 'function' ? adapter.document() : null;
    const lines = [];
    const tables = [];
    let cells = 0;
    let tableOrdinal = 0;
    // blocks() 按正文块序给段落与（只读）表格；段落视图的 index 就是 paragraphs()
    // 的序位，map.paragraphs[].ordinal 与 {#¶N} 沿用它。
    for (const block of adapter.blocks()) {
      if (block && block.kind === 'paragraph') lines.push('{#¶' + (block.index + 1) + '}' + block.text);
      else if (block && block.kind === 'table') {
        tableOrdinal += 1;
        cells += block.rows.reduce((n, row) => n + row.length, 0);
        pushDocxTable(lines, tables, block, tableSpanInfo(doc, block), tableOrdinal, tq);
      }
    }
    const comments = adapter.comments();
    const files = [{ path: BODY_FILE, text: lines.join('\n') + (lines.length ? '\n' : '') }];
    if (comments.length) {
      files.push({
        path: COMMENTS_FILE,
        text: comments.map((c, i) => '{#c' + (i + 1) + '} ' + (c.author || '') + ' · ' + (c.date || '') + '：' + ((c.anchor && c.anchor.quote) || '') + ' → ' + (c.text || '')).join('\n') + '\n',
      });
    }
    const map = {
      format: 'docx',
      identity: identityOf(adapter),
      bodyFile: BODY_FILE,
      paragraphs: entries,
      tables,
      drawings,
      comments: comments.length,
      warnings: adapter.warnings(),
    };
    if (comments.length) map.commentsFile = COMMENTS_FILE;
    const counts = { paragraphs: paragraphs.length, tables: tables.length, cells, drawings, comments: map.comments };
    return { files, map, counts };
  }

  function projectXlsx(adapter) {
    const taken = new Set([FORMULA_FILE, MANIFEST_FILE]);
    const sheets = [];
    const files = [];
    const formulaLines = [];
    let cells = 0;
    let formulas = 0;
    for (const sheet of adapter.sheets()) {
      const list = adapter.listCells(sheet.name);
      const file = safeStem(sheet.name, taken) + '.csv';
      let maxR = 0;
      let maxC = 0;
      const display = new Map();
      for (const { row, col } of list) {
        if (row > maxR) maxR = row;
        if (col > maxC) maxC = col;
      }
      for (const { row, col } of list) display.set(row + ',' + col, adapter.displayText(sheet.name, colName(col) + row));
      const rowsText = [];
      for (let r = 1; r <= maxR; r += 1) {
        const fields = [];
        let last = 0;
        for (let c = 1; c <= maxC; c += 1) {
          fields.push(csvField(display.get(r + ',' + c)));
          if (display.has(r + ',' + c)) last = fields.length;
        }
        rowsText.push(fields.slice(0, last).join(','));
      }
      files.push({ path: file, text: rowsText.join('\n') + (rowsText.length ? '\n' : '') });
      const formulaByAddress = {};
      const ordered = list
        .filter(({ cell }) => cell && typeof cell.f === 'string')
        .sort((a, b) => a.row - b.row || a.col - b.col);
      for (const { row, col, cell } of ordered) {
        const address = colName(col) + row;
        formulaByAddress[address] = cell.f;
        formulaLines.push(sheet.name + '!' + address + '\t' + cell.f);
      }
      cells += list.length;
      formulas += ordered.length;
      // 只存 name——Ledger 的 sheet id 也是开档时 L.uid 生成的，跨开档无效。
      sheets.push({ name: sheet.name, state: sheet.state || 'visible', file, rows: maxR, cols: maxC, cells: list.length, formulas: ordered.length, formulaByAddress });
    }
    if (formulaLines.length) files.push({ path: FORMULA_FILE, text: formulaLines.join('\n') + '\n' });
    const map = {
      format: 'xlsx',
      identity: identityOf(adapter),
      sheets,
      formulaFile: formulaLines.length ? FORMULA_FILE : null,
    };
    const counts = { sheets: sheets.length, cells, formulas };
    return { files, map, counts };
  }

  function projectPptx(adapter) {
    const tq = textQuote();
    const slides = [];
    const files = [];
    let shapes = 0;
    let notes = 0;
    const skipped = {};
    const note = (kind) => { skipped[kind] = (skipped[kind] || 0) + 1; };
    const count = adapter.slideCount();
    const allSlides = adapter.slides();
    // 页 id 和形状 id 都是开档时 L.uid 生成的（时间+随机），文件自己的 cNvPr id
    // 在读档末尾被删（pptx-read.js delete x.numId）——跨开档无效。锚落在
    // documentText（全部 run 按 \n 相接）上：每个投影形状记它全部 run 的 span。
    const deckText = nativeLocate().documentText(adapter);
    const partOf = (slideIndex) => adapter.runs(slideIndex).map((run) => ({ shapeId: run.shapeId, text: run.text }));
    const spans = [];
    let at = 0;
    for (let index = 0; index < count; index += 1) {
      for (const part of partOf(index)) {
        spans.push({ slideIndex: index, shapeId: part.shapeId, start: at, end: at + part.text.length });
        at += part.text.length + 1;
      }
    }
    const spanOf = (slideIndex, shapeId) => {
      const own = spans.filter((s) => s.slideIndex === slideIndex && s.shapeId === shapeId);
      if (!own.length) return null;
      return { start: own[0].start, end: own[own.length - 1].end };
    };
    for (let index = 0; index < count; index += 1) {
      const page = index + 1;
      const slide = allSlides[index];
      const pageFile = '第' + pad2(page) + '页.md';
      const lines = [];
      const shapeEntries = [];
      const pageSkipped = {};
      const noteHere = (kind) => { note(kind); pageSkipped[kind] = (pageSkipped[kind] || 0) + 1; };
      for (const shape of adapter.shapes(slide.id)) {
        if (!shape.editable) { noteHere(shape.kind); continue; }
        const paras = shape.paragraphs || [];
        if (paras.some((para) => para.runs.some((run) => run.field))) { noteHere('field'); continue; }
        const text = paras.map((para) => para.runs.map((run) => run.text).join('')).join('\n');
        if (!text.trim()) { noteHere('empty'); continue; }
        const span = spanOf(index, shape.id);
        pushShapeBlock(lines, shapeEntries, shape, paras, text, span ? tq.createAnchor(deckText, span.start, span.end) : null);
      }
      files.push({ path: pageFile, text: lines.join('\n') + (lines.length ? '\n' : '') });
      const notesText = typeof adapter.notes(slide.id) === 'string' ? adapter.notes(slide.id) : '';
      const notesFile = '第' + pad2(page) + '页-备注.md';
      if (notesText) {
        notes += 1;
        files.push({ path: notesFile, text: notesText + '\n' });
      }
      shapes += shapeEntries.length;
      // 只存 page 与序位：页 id / 形状 id 是每次开档 L.uid 生成的（同 Quire 段落
      // id 的处境），不进投影产物，relocate 的 exact 结果里才给当前会话的 id。
      slides.push({ page, file: pageFile, notesFile, hidden: !!slide.hidden, shapes: shapeEntries, notes: !!notesText, skipped: pageSkipped });
    }
    const map = {
      format: 'pptx',
      identity: identityOf(adapter),
      slides,
    };
    const counts = { slides: count, shapes, notes, skipped: { ...skipped } };
    return { files, map, counts };
  }

  function pushShapeBlock(lines, shapeEntries, shape, paras, text, anchor) {
    const ordinal = shapeEntries.length + 1;
    lines.push('{#s' + ordinal + '}', text);
    shapeEntries.push({ ordinal, kind: shape.kind, paragraphs: paras.length, anchor: anchor || null });
  }

  async function project(bytes, format, options = {}) {
    await ensurePrereqs();
    const factory = await ownCodec(format);
    const raw = cloneBytes(bytes);
    const meta = {
      name: options.name || ({ docx: 'document.docx', xlsx: 'workbook.xlsx', pptx: 'presentation.pptx' })[format] || 'document',
      scopeId: options.scopeId || '',
      documentId: options.documentId || '',
      generation: Number.isSafeInteger(options.generation) && options.generation >= 1 ? options.generation : 1,
    };
    const adapter = await factory.open(raw, meta);
    let out;
    if (format === 'docx') out = projectDocx(adapter);
    else if (format === 'xlsx') out = projectXlsx(adapter);
    else if (format === 'pptx') out = projectPptx(adapter);
    else throw new Error('agent-projection: unsupported format ' + format);
    const manifest = {
      schema: 1,
      objectId: options.objectId || null,
      format,
      name: meta.name,
      sha256: await sha256Hex(raw),
      identity: { documentId: meta.documentId, generation: meta.generation },
      counts: out.counts,
    };
    const files = out.files.concat([{ path: MANIFEST_FILE, text: JSON.stringify(manifest, null, 2) + '\n' }]);
    return { files, map: out.map, manifest };
  }

  /* --------------------------------------------------------------------- diff */
  function filesOf(projection) {
    const files = Array.isArray(projection) ? projection : projection && projection.files;
    if (!Array.isArray(files)) throw new Error('agent-projection: diff needs projections with a files list');
    const byPath = new Map();
    for (const file of files) {
      if (file && typeof file.path === 'string') byPath.set(file.path, String(file.text == null ? '' : file.text));
    }
    return byPath;
  }

  // 正文.md 的解析面（diff 用）：段落行、逐格行（同一格多行按 \n 接回）、Markdown
  // 表区域（连续的 | 行，分隔行不占行位）。批注.md 不进 diff——批注只读，不产候选。
  function parseDocxBody(text) {
    const paragraphs = [];
    const cells = new Map();
    const regions = [];
    let region = null;
    for (const line of String(text == null ? '' : text).split('\n')) {
      const pm = /^\{#¶(\d+)\}/.exec(line);
      if (pm) {
        region = null;
        paragraphs.push({ ordinal: Number(pm[1]), text: line.slice(pm[0].length) });
        continue;
      }
      const cm = /^\{#t(\d+)\.r(\d+)\.c(\d+)\}/.exec(line);
      if (cm) {
        region = null;
        const key = cm[0];
        const part = line.slice(cm[0].length);
        const existing = cells.get(key);
        if (existing) existing.text += '\n' + part;
        else cells.set(key, { table: Number(cm[1]), row: Number(cm[2]), cell: Number(cm[3]), text: part });
        continue;
      }
      if (line.length > 1 && line.charAt(0) === '|' && line.charAt(line.length - 1) === '|') {
        if (!region) {
          region = [];
          regions.push(region);
        }
        // Markdown 分隔行（|---|---|）只标表头界，不算数据行。
        if (!/^\|(?:-+\|)+-+\|$/.test(line)) region.push(line.slice(1, -1).split('|'));
        continue;
      }
      region = null;
    }
    return { paragraphs, cells, regions };
  }

  function pushCellCandidates(candidates, map, ordinal, beforeCells, afterCells) {
    const keys = new Set([...beforeCells.keys(), ...afterCells.keys()]);
    const table = map.tables[ordinal - 1];
    for (const key of keys) {
      const before = beforeCells.has(key) ? beforeCells.get(key) : '';
      const after = afterCells.has(key) ? afterCells.get(key) : '';
      if (before === after) continue;
      const dot = key.indexOf('.');
      const row = Number(key.slice(0, dot));
      const cell = Number(key.slice(dot + 1));
      const entry = table ? table.cells.find((e) => e.row === row && e.cell === cell) || null : null;
      candidates.push({
        format: 'docx',
        kind: 'table-cell',
        table: ordinal,
        row,
        cell,
        before,
        after,
        location: entry && entry.anchor ? textLocation(map, entry.anchor) : null,
      });
    }
  }

  function diffDocx(before, after, map) {
    const beforeBody = parseDocxBody(filesOf(before).get(map.bodyFile));
    const afterBody = parseDocxBody(filesOf(after).get(map.bodyFile));
    const afterPara = new Map(afterBody.paragraphs.map((line) => [line.ordinal, line.text]));
    const candidates = [];
    for (const line of beforeBody.paragraphs) {
      const next = afterPara.get(line.ordinal);
      if (next === undefined || next === line.text) continue;
      const entry = map.paragraphs.find((p) => p.ordinal === line.ordinal) || null;
      candidates.push({
        format: 'docx',
        ordinal: line.ordinal,
        before: line.text,
        after: next,
        location: entry && entry.anchor ? textLocation(map, entry.anchor) : null,
      });
    }
    let regionIndex = 0;
    for (let t = 0; t < map.tables.length; t += 1) {
      const ordinal = t + 1;
      if (map.tables[t].regular) {
        // 规则表没有格标记：区域按文档序对齐 map.tables 里的 regular 表。
        const gridOf = (regions) => {
          const out = new Map();
          (regions[regionIndex] || []).forEach((row, r) => (row || []).forEach((text, c) => out.set((r + 1) + '.' + (c + 1), text)));
          return out;
        };
        pushCellCandidates(candidates, map, ordinal, gridOf(beforeBody.regions), gridOf(afterBody.regions));
        regionIndex += 1;
      } else {
        const pick = (body) => {
          const out = new Map();
          for (const c of body.cells.values()) if (c.table === ordinal) out.set(c.row + '.' + c.cell, c.text);
          return out;
        };
        pushCellCandidates(candidates, map, ordinal, pick(beforeBody), pick(afterBody));
      }
    }
    return candidates;
  }

  function cellCandidate(map, sheet, address, before, after, kind, formulaCell) {
    return {
      format: 'xlsx',
      kind,
      sheet,
      address,
      before,
      after,
      formulaCell: !!formulaCell,
      location: {
        documentId: map.identity.documentId,
        generation: map.identity.generation,
        kind: 'cell-range',
        sheetId: sheet,
        range: address,
      },
    };
  }

  function gridValue(grid, r, c) {
    const row = grid[r - 1];
    return row && c <= row.length ? row[c - 1] : '';
  }

  function diffXlsx(before, after, map) {
    const filesBefore = filesOf(before);
    const filesAfter = filesOf(after);
    const candidates = [];
    for (const sheet of map.sheets) {
      const gridBefore = parseCsv(filesBefore.get(sheet.file));
      const gridAfter = parseCsv(filesAfter.get(sheet.file));
      const rows = Math.max(gridBefore.length, gridAfter.length);
      for (let r = 1; r <= rows; r += 1) {
        const cols = Math.max(gridBefore[r - 1] ? gridBefore[r - 1].length : 0, gridAfter[r - 1] ? gridAfter[r - 1].length : 0);
        for (let c = 1; c <= cols; c += 1) {
          const valueBefore = gridValue(gridBefore, r, c);
          const valueAfter = gridValue(gridAfter, r, c);
          if (valueBefore === valueAfter) continue;
          candidates.push(cellCandidate(map, sheet.name, colName(c) + r, valueBefore, valueAfter, 'value', sheet.formulaByAddress[colName(c) + r]));
        }
      }
    }
    if (map.formulaFile) {
      const parseFormula = (files) => {
        const out = new Map();
        for (const line of (files.get(map.formulaFile) || '').split('\n')) {
          if (!line) continue;
          const tab = line.indexOf('\t');
          if (tab < 0) continue;
          out.set(line.slice(0, tab), line.slice(tab + 1));
        }
        return out;
      };
      const formulasBefore = parseFormula(filesBefore);
      const formulasAfter = parseFormula(filesAfter);
      const keys = new Set([...formulasBefore.keys(), ...formulasAfter.keys()]);
      for (const key of keys) {
        const formulaBefore = formulasBefore.has(key) ? formulasBefore.get(key) : null;
        const formulaAfter = formulasAfter.has(key) ? formulasAfter.get(key) : null;
        if (formulaBefore === formulaAfter) continue;
        const bang = key.lastIndexOf('!');
        if (bang < 0) continue;
        candidates.push(cellCandidate(map, key.slice(0, bang), key.slice(bang + 1), formulaBefore, formulaAfter, 'formula', true));
      }
    }
    return candidates;
  }

  function parseShapeBlocks(text) {
    const out = [];
    let current = null;
    const lines = String(text == null ? '' : text).split('\n');
    // The writer ends the file with exactly one '\n'; a genuine trailing empty
    // paragraph inside the last shape is a second one and must survive.
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    for (const line of lines) {
      const m = /^\{#s(\d+)\}$/.exec(line);
      if (m) {
        if (current) out.push(current);
        current = { ordinal: Number(m[1]), text: '' };
      } else if (current) {
        current.text += (current.text ? '\n' : '') + line;
      }
    }
    if (current) out.push(current);
    return out;
  }

  function diffPptx(before, after, map) {
    const filesBefore = filesOf(before);
    const filesAfter = filesOf(after);
    const candidates = [];
    for (const slide of map.slides) {
      const blocksBefore = new Map(parseShapeBlocks(filesBefore.get(slide.file)).map((b) => [b.ordinal, b.text]));
      const blocksAfter = new Map(parseShapeBlocks(filesAfter.get(slide.file)).map((b) => [b.ordinal, b.text]));
      for (const shape of slide.shapes) {
        const textBefore = blocksBefore.has(shape.ordinal) ? blocksBefore.get(shape.ordinal) : null;
        const textAfter = blocksAfter.has(shape.ordinal) ? blocksAfter.get(shape.ordinal) : null;
        if (textBefore === textAfter) continue;
        candidates.push({
          format: 'pptx',
          slide: slide.page,
          shape: shape.ordinal,
          before: textBefore,
          after: textAfter,
          location: shape.anchor
            ? textLocation(map, shape.anchor)
            : null,
        });
      }
      const notesBefore = filesBefore.has(slide.notesFile) ? filesBefore.get(slide.notesFile) : '';
      const notesAfter = filesAfter.has(slide.notesFile) ? filesAfter.get(slide.notesFile) : '';
      if (notesBefore !== notesAfter) {
        candidates.push({
          format: 'pptx',
          kind: 'notes',
          slide: slide.page,
          shape: null,
          before: notesBefore.replace(/\n$/, ''),
          after: notesAfter.replace(/\n$/, ''),
          location: null,
        });
      }
    }
    return candidates;
  }

  function diff(before, after, map) {
    if (!before || !after || !map || !map.format) throw new Error('agent-projection: diff needs before, after and a map');
    if (map.format === 'docx') return diffDocx(before, after, map);
    if (map.format === 'xlsx') return diffXlsx(before, after, map);
    if (map.format === 'pptx') return diffPptx(before, after, map);
    throw new Error('agent-projection: unsupported map format ' + map.format);
  }

  /* ----------------------------------------------------------------- relocate */
  function relocate(candidate, currentAdapter) {
    if (!candidate || !currentAdapter) throw new Error('agent-projection: relocate needs a candidate and a live adapter');
    if (candidate.format === 'pptx' && candidate.kind === 'notes') {
      // 备注没有自己的 location kind，页 id 又是每次开档重生成的：按它在投影里的
      // 页码对位（上方插页会平移，那时如实报错位由调用方重投影）。
      const slides = typeof currentAdapter.slides === 'function' ? currentAdapter.slides() : [];
      const found = slides[candidate.slide - 1] || null;
      return found
        ? { resolution: 'exact', slide: found.id, index: found.index, via: 'page' }
        : { resolution: 'lost', reason: 'slide-not-found' };
    }
    if (candidate.format === 'docx' && candidate.kind === 'table-cell') {
      if (!candidate.location) return { resolution: 'lost', reason: 'no-anchor' };
      const tables = typeof currentAdapter.tables === 'function' ? currentAdapter.tables() : [];
      const table = tables[(candidate.table || 0) - 1];
      if (!table) return { resolution: 'lost', reason: 'table-not-found' };
      // 与投影时同一构造：本表全部格文本行主序 \n 相接。表格只读，上方插行只
      // 平移偏移，格文本与邻格上下文不变，TextQuote 仍唯一命中；native-locate
      // 对这份底稿回答 exact / lost / ambiguous，绝不猜。
      const base = table.rows.map((row) => row.map((c) => c.text).join('\n')).join('\n');
      try {
        const result = nativeLocate().resolveLocation(candidate.location, base);
        if (result.resolution === 'exact') {
          // 底稿偏移按行主序数回所在格，并带上该格当前会话的段落 id（写修订用）。
          let at = 0;
          for (let r = 0; r < table.rows.length; r += 1) {
            for (let c = 0; c < table.rows[r].length; c += 1) {
              const len = table.rows[r][c].text.length;
              if (result.start >= at && result.start < at + len) {
                return { ...result, row: r + 1, cell: c + 1, paragraphIds: table.rows[r][c].paragraphIds || [] };
              }
              at += len + 1;
            }
          }
        }
        return result;
      } catch (error) {
        return { resolution: 'lost', reason: 'resolve-failed', detail: String((error && error.message) || error) };
      }
    }
    if (!candidate.location) return { resolution: 'lost', reason: 'no-anchor' };
    const locate = nativeLocate();
    try {
      const result = locate.resolveLocation(candidate.location, currentAdapter);
      if (result.resolution === 'exact' && currentAdapter.kind === 'pptx') {
        // deck 文本上的偏移按 runs 的顺序数回所在页与所在形状；形状 id 只在当前
        // 这次开档里有意义，所以叫 sessionShapeId。
        let at = 0;
        for (let index = 0; index < currentAdapter.slideCount(); index += 1) {
          const runs = currentAdapter.runs(index);
          for (const run of runs) {
            const len = run.text.length;
            if (result.start < at + len + 1) {
              return { ...result, slide: index, page: index + 1, sessionShapeId: run.shapeId };
            }
            at += len + 1;
          }
        }
      }
      return result;
    } catch (error) {
      return { resolution: 'lost', reason: 'resolve-failed', detail: String((error && error.message) || error) };
    }
  }

  root.AISystem6AgentProjection = Object.freeze({ project, diff, relocate });
})(typeof window !== 'undefined' ? window : globalThis);
