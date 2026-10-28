/* ClioWorks 邮件合并 (features/clioworks-mailmerge.js): ClioWrite 文件 › 邮件合并…
 * — one template, one data source, one clean .docx per row.
 *
 * The minimal loop the author settled on 2026-10-26 (spec §3), and nothing
 * past it: the data source is a ClioChart workbook (the mounted session's
 * selected rectangle or its whole sheet, first row = column names) or a CSV
 * file read by the same RFC 4180 parser the workbook's own import uses; the
 * template is the ClioWrite body's own «列名» placeholders; each row becomes
 * one clean Office document through the SAME headless word-export pipeline
 * N14's 送审 travels (one token stream, no second parser), stored in the
 * Project Hard Disk's 邮件合并 folder and offered as one download per file.
 * 「合并到打印」 walks the one road to paper N2b owns — the browser's own
 * print dialog — with every copy rendered into a hidden print stack first.
 * No conditional blocks, no rules, no mail is sent: the output is files.
 *
 * Two halves, one lazy package (config.js ensureClioworksMailMergeModule,
 * riding the shared ClioWrite sheet):
 *   engine — placeholder scanning, row instantiation, file naming, the
 *     docx bytes. Headless and dependency-injected: the contract drives it
 *     in bare VMs the way N11/N14 drive theirs.
 *   UI — the finder-operation-modal dialog (N14 precedent): choose a source,
 *     click a column name to drop «列名» at the caret (the document's own
 *     insert path, ONE named undo step), read which placeholders have no
 *     column (they stay as typed, said aloud), preview the first row, then
 *     生成并存盘 or 合并到打印.
 *
 * Generating never touches the manuscript's model: the template is READ
 * through adapter.blocks(), files are CREATED through the N0 store, and the
 * writer's undo history stays exactly as it was. Desk globals (setStatus,
 * the store's loader, activeProjectId) are lexical bindings of other
 * classic scripts, so they are read bare behind typeof guards. */
(function (root) {
  'use strict';
  if (root.AISystem6ClioworksMailMerge) return;

  const OPEN = '«';
  const CLOSE = '»';
  const FOLDER_NAME = '邮件合并';
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const PREVIEW_CHARS = 160;

  const fn = (target, name) => !!target && typeof target[name] === 'function';
  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);
  const status = (text) => { if (typeof setStatus === 'function') setStatus(text); };

  /* ------------------------------------------------------ placeholder scanning */

  /**
   * Every well-formed «列名» in the text, in order of first appearance.
   * A placeholder is « + a non-empty name with no guillemet inside + »: an
   * unterminated «, an empty «» and a nested «a«b»c» all stay as typed
   * (a nested name is not a column name; the scan resumes at the inner «).
   * @param {string} text
   * @returns {Array<{name: string, count: number}>}
   */
  function parsePlaceholders(text) {
    const src = String(text == null ? '' : text);
    const order = [];
    const counts = new Map();
    let i = 0;
    while (i < src.length) {
      const at = src.indexOf(OPEN, i);
      if (at < 0) break;
      const end = src.indexOf(CLOSE, at + 1);
      if (end < 0) break;
      const name = src.slice(at + 1, end);
      if (!name || name.includes(OPEN)) { i = at + 1; continue; }
      if (counts.has(name)) counts.set(name, counts.get(name) + 1);
      else { counts.set(name, 1); order.push(name); }
      i = end + 1;
    }
    return order.map((name) => ({ name, count: counts.get(name) }));
  }

  /* -------------------------------------------------------- the data source */

  /**
   * A first-row-is-names grid (rows of cell texts) into the merge's own
   * table. Only the FIRST column of a name wins; a duplicate or empty name
   * cannot be addressed by a placeholder (the cells still merge by index
   * inside their row). A row whose every cell is empty is not data.
   * @param {Array<Array<{text?:string}|string>>} grid
   * @returns {{columns: string[], records: string[][], indexByName: Map<string, number>}}
   */
  function gridToTable(grid) {
    const rows = (Array.isArray(grid) ? grid : [])
      .map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell && typeof cell === 'object' && cell.text != null ? cell.text : cell == null ? '' : cell)));
    const indexByName = new Map();
    const columns = [];
    if (rows.length) {
      rows[0].forEach((value, index) => {
        const name = String(value).trim();
        if (!name || indexByName.has(name)) return;
        indexByName.set(name, index);
        columns.push(name);
      });
    }
    const records = rows.slice(1).filter((row) => row.some((value) => value !== ''));
    return { columns, records, indexByName };
  }

  /**
   * The mounted ClioChart workbook as a grid: the selected rectangle through
   * the session's own copyRegion (computed display texts, the N11 shape), or
   * the whole sheet through the CSV module's own display-value writer read
   * back by its own parser — both faces the workbook already owns.
   * @returns {{grid: any[][]} & {label?: string, range?: string} | {reason: string}}
   */
  function workbookGrid(session, { whole = false } = {}) {
    if (!fn(session, 'copyRegion')) return { reason: 'no-session' };
    const label = String(session.mountedName || session.fileName || '');
    if (!whole) {
      const region = session.copyRegion();
      if (!region) return { reason: 'no-selection' };
      return { grid: region.rows || [], label, range: region.ref || '' };
    }
    const csv = root.AISystem6ClioChartCsv;
    const adapter = session.adapter;
    if (!csv || !fn(adapter, 'listCells') || typeof session.sheet !== 'string') return { reason: 'no-adapter' };
    let text = '';
    try { text = csv.sheetToCsv(adapter, session.sheet); } catch (error) { return { reason: 'read-failed' }; }
    return { grid: csv.parseCsv(text, ','), label, range: session.sheet };
  }

  /**
   * A chosen .csv/.tsv as a grid — the same decode (UTF-8, then GB18030),
   * the same delimiter rule and the same RFC 4180 parser as the workbook's
   * own 导入 CSV…, reused rather than re-written.
   * @param {File} file
   * @returns {Promise<{grid: string[][], label: string} | {reason: string, message?: string}>}
   */
  async function csvGrid(file) {
    const csv = root.AISystem6ClioChartCsv;
    if (!file || !csv) return { reason: 'no-file' };
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { text } = csv.decodeText(bytes);
      return { grid: csv.parseCsv(text, csv.delimiterFor(file.name, text)), label: String(file.name || '') };
    } catch (error) {
      return { reason: 'read-failed', message: String(error && error.message || error) };
    }
  }

  /* ------------------------------------------------------------ the template */

  /**
   * The ClioWrite body as template Markdown: headings keep their level,
   * lists their bullet/number and indent, tables become GFM pipe tables
   * (a cell's line breaks fold to spaces, its pipes to slashes — the grid
   * is data, not layout). Read-only blocks of other kinds stay out.
   * @param {Array<{kind?: string, text?: string, headingLevel?: number, list?: object, rows?: any[][]}>} blocks
   * @returns {string}
   */
  function templateMarkdownFromBlocks(blocks) {
    const out = [];
    for (const block of Array.isArray(blocks) ? blocks : []) {
      if (!block || block.kind === 'paragraph') {
        const text = String(block && block.text || '');
        if (!text.trim()) { out.push(''); continue; }
        const level = Number(block.headingLevel || 0);
        if (level >= 1 && level <= 3) out.push('#'.repeat(level) + ' ' + text);
        else if (block.list && (block.list.kind === 'bullet' || block.list.kind === 'number')) {
          out.push('  '.repeat(Math.max(0, Number(block.list.level) || 0)) + (block.list.kind === 'bullet' ? '- ' : '1. ') + text);
        } else out.push(text);
      } else if (block.kind === 'table') {
        const cells = (Array.isArray(block.rows) ? block.rows : []).map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell && cell.text != null ? cell.text : '').replace(/\r?\n/g, ' ').replace(/\|/g, '/')));
        if (!cells.length) continue;
        const width = cells.reduce((n, row) => Math.max(n, row.length), 0);
        if (!width) continue;
        const padded = cells.map((row) => { const copy = row.slice(); while (copy.length < width) copy.push(''); return copy; });
        out.push('| ' + padded[0].join(' | ') + ' |');
        out.push('|' + ' --- |'.repeat(width));
        for (let r = 1; r < padded.length; r += 1) out.push('| ' + padded[r].join(' | ') + ' |');
        out.push('');
      }
    }
    return out.join('\n');
  }

  /* ------------------------------------------------------------ instantiation */

  /**
   * One row into one text: every placeholder whose name is a column of the
   * table becomes that cell's text (exact name match, nothing else moves);
   * a placeholder with no column stays exactly as typed and is named. The
   * scan is the same one parsePlaceholders walks, so what the dialog
   * validated is what the replacement did.
   * @param {string} template
   * @param {{indexByName: Map<string, number>}} table
   * @param {string[]} record
   * @returns {{text: string, missing: string[]}}
   */
  function instantiate(template, table, record) {
    const src = String(template == null ? '' : template);
    const indexByName = (table && table.indexByName) || new Map();
    const values = Array.isArray(record) ? record : [];
    const missing = [];
    let out = '';
    let i = 0;
    while (i < src.length) {
      const at = src.indexOf(OPEN, i);
      if (at < 0) break;
      const end = src.indexOf(CLOSE, at + 1);
      if (end < 0) break;
      const name = src.slice(at + 1, end);
      if (!name || name.includes(OPEN)) { out += src.slice(i, at + 1); i = at + 1; continue; }
      if (indexByName.has(name)) {
        out += src.slice(i, at) + String(values[indexByName.get(name)] == null ? '' : values[indexByName.get(name)]);
      } else {
        out += src.slice(i, end + 1);
        if (!missing.includes(name)) missing.push(name);
      }
      i = end + 1;
    }
    out += src.slice(i);
    return { text: out, missing };
  }

  /**
   * Filename-safe, the round-trip engine's own rule plus the fold a joined
   * name needs: illegal runs become one dash each, whitespace collapses to
   * spaces, and leading/trailing separators drop off before the cap.
   * @param {string} text
   * @returns {string}
   */
  function sanitizeName(text) {
    return String(text == null ? '' : text)
      .replace(/[\u0000-\u001F\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/-+/g, '-')
      .replace(/^[- ]+|[- ]+$/g, '')
      .slice(0, 60);
  }

  /**
   * 「<模板名>-<行主键或序号>.docx」. The first column is the row's primary
   * key — the convention a ClioChart/CSV address list already carries (a
   * name, an id); a row whose first cell is empty falls back to its 1-based
   * number, so every file in the folder is unique by construction.
   * @returns {string} the full file name, extension included
   */
  function fileNameFor(templateName, record, index) {
    const stem = sanitizeName(templateName) || '文稿';
    const first = Array.isArray(record) && record.length ? String(record[0] == null ? '' : record[0]).trim() : '';
    const key = sanitizeName(first) || String(Number(index) + 1);
    return `${stem}-${key}.docx`;
  }

  /**
   * The whole batch, said before anything is built: each row's instantiated
   * Markdown, its file name, the placeholders no column answers (they stay
   * as typed — the report line names them once for the whole batch).
   * @param {{markdown: string, templateName: string, table: object}} input
   * @returns {{rows: Array<{markdown: string, missing: string[], fileName: string}>, missingColumns: string[], placeholders: Array<{name: string, count: number}>}}
   */
  function planMerge({ markdown, templateName, table }) {
    const placeholders = parsePlaceholders(markdown);
    const indexByName = (table && table.indexByName) || new Map();
    const missingColumns = placeholders.map((entry) => entry.name).filter((name) => !indexByName.has(name));
    const rows = ((table && table.records) || []).map((record, index) => {
      const one = instantiate(markdown, table, record);
      return { markdown: one.text, missing: one.missing, fileName: fileNameFor(templateName, record, index) };
    });
    return { rows, missingColumns, placeholders };
  }

  /**
   * One instantiated row's .docx bytes through the shared headless pipeline:
   * the product's own lexer (parseMarkdownDocument, the options pinned by
   * contract), the generator's own inspection — a template that cannot
   * build refuses the whole batch, named by the tokens — then
   * buildWordDocumentPackage + packWordDocument, exactly the road N14's
   * 送审 file travels.
   * @param {{markdown: string, pageSetup?: object, title?: string, language?: string}} row
   * @returns {Promise<Uint8Array>}
   */
  async function buildRowBytes({ markdown, pageSetup, title, language }) {
    const word = root.AISystem6WordExport;
    if (!word || typeof root.parseMarkdownDocument !== 'function') throw new Error('clioworks-mailmerge: the word-export pipeline did not load');
    const model = root.parseMarkdownDocument(markdown);
    const inspection = word.inspectWordDocumentStructure(model.tokens);
    if (!inspection.ok) {
      const error = new Error(inspection.problems.map((problem) => `${problem.code}: ${problem.detail}`).join('; '));
      error.problems = inspection.problems;
      throw error;
    }
    const built = word.buildWordDocumentPackage(model.tokens, pageSetup || {}, {
      title: String(title || ''),
      language: String(language || 'en'),
      savedAt: new Date().toISOString(),
    });
    return word.packWordDocument(built.parts);
  }

  /**
   * The page the template's own section properties ask for, in the metrics
   * word-export converts (mm): ClioWrite's pageGeometry (points/cm) mapped
   * across, margins square to the narrowest the file asks for.
   * @param {object} geometry ClioWrite's pageMetricsFrom shape
   * @returns {Record<string, number|string>}
   */
  function pageSetupFromGeometry(geometry) {
    const g = geometry && typeof geometry === 'object' ? geometry : {};
    const mm = (cm) => Math.round(Number(cm) * 10) || 0;
    const margins = g.margins && typeof g.margins === 'object' ? g.margins : {};
    const all = [margins.top, margins.bottom, margins.left, margins.right].map(mm).filter((value) => value > 0);
    return {
      widthMm: mm(g.widthCm) || 210,
      heightMm: mm(g.heightCm) || 297,
      orientation: g.landscape ? 'landscape' : 'portrait',
      marginMm: all.length ? Math.min(...all) : 20,
    };
  }

  /**
   * Store every row's document in the Project Hard Disk's 邮件合并 folder
   * (the N0 store owns naming and the folder), downloading each stored file
   * only after its store confirmed. A row that fails stops the batch and
   * names the file that stopped it; what was stored before stays stored.
   * @param {{plan: object, projectId: string, pageSetup?: object, language?: string, templateName?: string}} input
   * @returns {Promise<{status: string, stored?: object[], stoppedAt?: number, reason?: string}>}
   */
  async function storeDocuments({ plan, projectId, pageSetup, language, templateName }) {
    if (typeof ensureNativeBinariesModule === 'function') { try { await ensureNativeBinariesModule(); } catch (error) { /* named below when the store is missing */ } }
    const store = root.AISystem6NativeBinaries;
    if (!store || !fn(store, 'createProjectDocument')) return { status: 'failed', reason: 'no-store' };
    const stored = [];
    for (let index = 0; index < plan.rows.length; index += 1) {
      const row = plan.rows[index];
      let bytes;
      try {
        bytes = await buildRowBytes({ markdown: row.markdown, pageSetup, title: templateName, language });
      } catch (error) {
        return { status: 'failed', stoppedAt: index, reason: `docx: ${error && error.message || error}`, stored };
      }
      try {
        const item = await store.createProjectDocument({ projectId, name: row.fileName, folderName: FOLDER_NAME, format: 'docx', bytes });
        if (!item) throw new Error('the document did not reach the Project Hard Disk');
        stored.push(item);
        if (fn(root.AISystem6WebPlatform, 'saveArtifact')) {
          root.AISystem6WebPlatform.saveArtifact({ blob: new Blob([bytes], { type: DOCX_MIME }), fileName: item.name, mimeType: DOCX_MIME });
        }
      } catch (error) {
        return { status: 'failed', stoppedAt: index, reason: String(error && error.message || error), stored };
      }
    }
    return { status: 'ok', stored };
  }

  /* --------------------------------------------------------- 合并到打印 (N2b) */

  /**
   * Every copy through the one road to paper N2b owns: the browser's own
   * print dialog over a hidden print stack the @media print sheet shows
   * instead of the desk. The copies print as ONE stack in row order, each
   * behind its own page break — one dialog, one spool, the printer's own
   * collation; the print API's reality (a page can only open its dialog
   * once per user act) makes per-copy dialogs N confirmations for N copies,
   * so the stack is the honest minimum and the report says so. Nothing is
   * stored: printing adds no files beyond what 生成 already made.
   * @param {{plan: object, doConfirm?: Function, doPrint?: Function}} input
   * @returns {Promise<{status: string, copies?: number, reason?: string}>}
   */
  async function printMerged({ plan, doConfirm, doPrint }) {
    const rows = (plan && plan.rows) || [];
    if (!rows.length) return { status: 'blocked', reason: 'no-rows' };
    const count = rows.length;
    const ask = doConfirm || ((message) => (fn(root, 'showSystemModal') ? root.showSystemModal(message, 'confirm', { defaultAction: 'cancel' }) : Promise.resolve('yes')));
    // showSystemModal answers 'yes'/'cancel'; an injected tester may answer a bare boolean.
    const answer = await ask(tr('clioworks_mail_merge_print_confirm', count));
    if (answer !== true && answer !== 'yes') return { status: 'cancelled' };
    const print = doPrint || (() => (typeof root.print === 'function' ? root.print() : undefined));
    const doc = root.document;
    if (!doc || !fn(doc, 'createElement')) return { status: 'failed', reason: 'no-document' };
    const stack = doc.createElement('div');
    stack.id = 'cw-mailmerge-print';
    for (const row of rows) {
      const copy = doc.createElement('section');
      copy.className = 'cw-mailmerge-copy';
      copy.innerHTML = typeof root.markdownToSystemHtml === 'function'
        ? root.markdownToSystemHtml(row.markdown)
        : String(row.markdown || '');
      stack.append(copy);
    }
    (doc.body || doc.documentElement).append(stack);
    const cleanup = () => {
      try { stack.remove(); } catch (error) { /* gone */ }
      try { if (doc.body && doc.body.classList) doc.body.classList.remove('is-cw-mailmerge-printing'); } catch (error) { /* gone */ }
      try { if (typeof root.removeEventListener === 'function') root.removeEventListener('afterprint', cleanup); } catch (error) { /* gone */ }
    };
    try { if (doc.body && doc.body.classList) doc.body.classList.add('is-cw-mailmerge-printing'); } catch (error) { /* printing still works without the class where classList is missing */ }
    if (typeof root.addEventListener === 'function') root.addEventListener('afterprint', cleanup);
    try { print(); } catch (error) { cleanup(); return { status: 'failed', reason: String(error && error.message || error) }; }
    return { status: 'ok', copies: count };
  }

  /* ----------------------------------------------------------------- the UI */

  function h(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of [].concat(children)) if (child != null) node.append(child.nodeType ? child : document.createTextNode(String(child)));
    return node;
  }

  let dialog = null;
  let context = null;          // the ClioWrite surface's handover, set by open()
  let state = null;            // { source, whole, csvFile, csvData, table, label, range }
  let picker = null;

  function applyLanguage(target) {
    if (typeof translateWithin === 'function') { translateWithin(target); return; }
    target.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = tr(element.dataset.i18n); });
  }

  function workbookSession() {
    const books = root.AISystem6ClioChartWorkbook;
    return books && fn(books, 'session') ? books.session() : null;
  }

  function activeProjectIdOf() {
    return typeof activeProjectId !== 'undefined' ? activeProjectId : '';
  }

  function currentTable() { return state && state.table ? state.table : { columns: [], records: [], indexByName: new Map() }; }

  function templateMarkdownNow() {
    return context && fn(context, 'blocks') ? templateMarkdownFromBlocks(context.blocks()) : '';
  }

  /** The dialog's dynamic zones, redrawn from the live template + source. */
  function redraw() {
    if (!dialog || !state) return;
    const markdown = templateMarkdownNow();
    const placeholders = parsePlaceholders(markdown);
    const table = currentTable();
    const workbook = workbookSession();

    dialog.querySelector('[value="workbook"]').disabled = !workbook;
    // The dialog is built once and reopened; its radios say what state says.
    dialog.querySelector('[value="workbook"]').checked = state.source === 'workbook';
    dialog.querySelector('[value="csv"]').checked = state.source === 'csv';
    dialog.querySelector('[value="selection"]').checked = !state.whole;
    dialog.querySelector('[value="sheet"]').checked = !!state.whole;
    const wholeRow = dialog.querySelector('#mm-whole-row');
    wholeRow.hidden = state.source !== 'workbook';
    if (workbook) {
      const name = String(workbook.mountedName || workbook.fileName || '');
      dialog.querySelector('#mm-workbook-label').textContent = tr('clioworks_mail_merge_workbook_label', name || tr('clioworks_mail_merge_workbook_plain'));
    }
    dialog.querySelector('#mm-csv-name').textContent = state.source === 'csv' && state.csvFile ? String(state.csvFile.name || '') : '';

    const rowsLine = dialog.querySelector('#mm-rows');
    rowsLine.textContent = table.records.length ? tr('clioworks_mail_merge_rows', table.records.length, state.label || '') : '';

    const chips = dialog.querySelector('#mm-columns');
    chips.replaceChildren();
    for (const name of table.columns) {
      const chip = h('button', { type: 'button', class: 'btn', text: `«${name}»` });
      chip.addEventListener('click', () => {
        if (context && fn(context, 'insert')) context.insert(`${OPEN}${name}${CLOSE}`);
        redraw();
      });
      chips.append(chip);
    }
    chips.hidden = !table.columns.length;

    const missingLine = dialog.querySelector('#mm-missing');
    const missing = placeholders.map((entry) => entry.name).filter((name) => !table.indexByName.has(name));
    if (!table.columns.length) {
      missingLine.hidden = true;
    } else if (!placeholders.length) {
      missingLine.hidden = false;
      missingLine.textContent = tr('clioworks_mail_merge_no_placeholders');
    } else if (missing.length) {
      missingLine.hidden = false;
      missingLine.textContent = tr('clioworks_mail_merge_missing_columns', missing.length, missing.join('、'));
    } else {
      missingLine.hidden = false;
      missingLine.textContent = tr('clioworks_mail_merge_columns_ok', placeholders.length);
    }

    const preview = dialog.querySelector('#mm-preview');
    if (table.records.length) {
      const first = instantiate(markdown, table, table.records[0]).text.replace(/\s+/g, ' ').trim();
      preview.hidden = false;
      preview.textContent = tr('clioworks_mail_merge_preview', first.slice(0, PREVIEW_CHARS) + (first.length > PREVIEW_CHARS ? '…' : ''));
    } else {
      preview.hidden = true;
    }

    const ready = table.columns.length && table.records.length > 0;
    dialog.querySelector('#mm-generate').disabled = !ready;
    dialog.querySelector('#mm-print').disabled = !ready;
  }

  function adoptSource(next) {
    state.source = next;
    state.table = null;
    state.label = '';
    state.range = '';
    if (next === 'workbook') {
      const grid = workbookGrid(workbookSession(), { whole: state.whole });
      if (grid.reason) status(tr('clioworks_mail_merge_source_failed', tr(`clioworks_mail_merge_reason_${grid.reason}`)));
      else {
        state.table = gridToTable(grid.grid);
        state.label = `${grid.label}${grid.range ? ` ${grid.range}` : ''}`;
      }
    } else if (next === 'csv' && state.csvData) {
      state.table = gridToTable(state.csvData.grid);
      state.label = state.csvData.label;
    }
    redraw();
  }

  function ensureDialog() {
    if (dialog) return dialog;
    picker = h('input', { type: 'file', accept: '.csv,.tsv,text/csv,text/tab-separated-values', style: 'display:none;' });
    picker.addEventListener('change', () => {
      const file = picker.files && picker.files[0];
      picker.value = '';
      if (!file) return;
      csvGrid(file).then((out) => {
        if (out.reason) { status(tr('clioworks_mail_merge_source_failed', String(out.message || out.reason))); return; }
        state.csvFile = file;
        state.csvData = out;
        state.source = 'csv';
        adoptSource('csv');
      });
    });

    const modal = h('dialog', { id: 'clioworks-mailmerge-modal', class: 'finder-operation-modal' });
    const form = h('form', { method: 'dialog' });
    const body = h('section', { class: 'finder-operation-body' });
    body.append(h('h2', { 'data-i18n': 'clioworks_mail_merge_title' }));

    const workbookRadio = h('input', { type: 'radio', name: 'mm-source', value: 'workbook', id: 'mm-source-workbook' });
    const selectionRadio = h('input', { type: 'radio', name: 'mm-whole', value: 'selection', id: 'mm-whole-selection', checked: true });
    const sheetRadio = h('input', { type: 'radio', name: 'mm-whole', value: 'sheet', id: 'mm-whole-sheet' });
    const wholeRow = h('p', { id: 'mm-whole-row', style: 'margin-block:2px 2px;padding-inline-start:22px;' }, [
      h('label', { for: 'mm-whole-selection' }, [selectionRadio, ' ', h('span', { 'data-i18n': 'clioworks_mail_merge_workbook_selection' })]),
      '  ',
      h('label', { for: 'mm-whole-sheet' }, [sheetRadio, ' ', h('span', { 'data-i18n': 'clioworks_mail_merge_workbook_sheet' })]),
    ]);
    body.append(
      h('p', {}, [h('label', { for: 'mm-source-workbook' }, [workbookRadio, ' ', h('span', { id: 'mm-workbook-label' })])]),
      wholeRow,
      h('p', {}, [
        (() => { const csvRadio = h('input', { type: 'radio', name: 'mm-source', value: 'csv', id: 'mm-source-csv' }); return h('label', { for: 'mm-source-csv' }, [csvRadio, ' ', h('span', { 'data-i18n': 'clioworks_mail_merge_source_csv' }), ' ', h('button', { type: 'button', class: 'btn', id: 'mm-choose', 'data-i18n': 'clioworks_mail_merge_choose' }), ' ', h('span', { id: 'mm-csv-name', style: 'word-break:break-all;' })]); })(),
      ]),
      picker,
      h('p', { id: 'mm-rows', role: 'status' }),
      h('p', { id: 'mm-columns-label', 'data-i18n': 'clioworks_mail_merge_columns' }),
      h('div', { id: 'mm-columns', style: 'display:flex;flex-wrap:wrap;gap:4px;max-block-size:96px;overflow:auto;' }),
      h('p', { id: 'mm-missing', class: 'finder-operation-lede', role: 'status' }),
      h('p', { id: 'mm-preview', class: 'finder-operation-lede' }),
      h('p', { class: 'finder-operation-lede', 'data-i18n': 'clioworks_mail_merge_store_to' }),
    );

    const actions = h('div', { class: 'button-row finder-operation-actions' });
    actions.append(
      h('button', { type: 'submit', value: 'cancel', class: 'btn', 'data-i18n': 'cancel' }),
      h('button', { type: 'button', class: 'btn', id: 'mm-print', 'data-i18n': 'clioworks_mail_merge_print' }),
      h('button', { type: 'submit', value: 'ok', class: 'btn default', id: 'mm-generate', 'data-i18n': 'clioworks_mail_merge_generate' }),
    );
    form.append(body, actions);
    modal.append(form);
    document.body.append(modal);

    modal.querySelector('#mm-choose').addEventListener('click', () => picker.click());
    modal.querySelectorAll('input[name="mm-source"]').forEach((radio) => {
      radio.addEventListener('change', () => { if (radio.checked) adoptSource(radio.value); });
    });
    modal.querySelectorAll('input[name="mm-whole"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (!radio.checked || state.source !== 'workbook') return;
        state.whole = radio.value === 'sheet';
        adoptSource('workbook');
      });
    });
    modal.querySelector('#mm-print').addEventListener('click', () => { runPrintFlow(); });
    applyLanguage(modal);
    dialog = modal;
    return dialog;
  }

  function closeDialog() {
    if (dialog && dialog.open) dialog.close('cancel');
  }

  function planNow() {
    return planMerge({
      markdown: templateMarkdownNow(),
      templateName: (context && fn(context, 'name') ? String(context.name() || '') : '') || '文稿',
      table: currentTable(),
    });
  }

  /** 生成并存盘: every row one clean docx in the 邮件合并 folder, then downloads. */
  async function runGenerateFlow() {
    const projectId = activeProjectIdOf();
    if (!projectId || (typeof getActiveProject === 'function' && !getActiveProject())) {
      status(tr('no_project_mounted'));
      return false;
    }
    const plan = planNow();
    if (!plan.rows.length) { status(tr('clioworks_mail_merge_no_source')); return false; }
    const pageSetup = context && fn(context, 'pageGeometry') ? pageSetupFromGeometry(context.pageGeometry()) : {};
    const language = context && fn(context, 'language') ? context.language() : 'en';
    const out = await storeDocuments({ plan, projectId, pageSetup, language, templateName: (context && fn(context, 'name') ? String(context.name() || '') : '') });
    if (out.status !== 'ok') {
      status(tr('clioworks_mail_merge_generate_failed', out.reason || '', (out.stored || []).length));
      return false;
    }
    const missingNote = plan.missingColumns.length
      ? ' ' + tr('clioworks_mail_merge_missing_columns', plan.missingColumns.length, plan.missingColumns.join('、'))
      : '';
    status(tr('clioworks_mail_merge_generated', out.stored.length, FOLDER_NAME) + missingNote);
    return true;
  }

  /** 合并到打印: confirm the count, then the one N2b road over the hidden stack. */
  async function runPrintFlow() {
    const plan = planNow();
    if (!plan.rows.length) { status(tr('clioworks_mail_merge_no_source')); return false; }
    // The dialog steps out of the way first: the confirm and the print stack
    // own the screen from here.
    closeDialog();
    const answer = await printMerged({ plan });
    if (answer.status === 'blocked' || answer.status === 'failed') {
      status(tr('clioworks_mail_merge_print_failed', answer.reason || ''));
      return false;
    }
    return true;
  }

  /**
   * The 文件 › 邮件合并… row: hand the lazy module the live ClioWrite surface
   * (name, blocks, page geometry, the caret insert) and run the modal.
   * @param {{name: Function, blocks: Function, pageGeometry?: Function, language?: Function, insert: Function}} ctx
   */
  async function open(ctx) {
    context = ctx || null;
    state = { source: 'workbook', whole: false, csvFile: null, csvData: null, table: null, label: '', range: '' };
    if (!context || !fn(context, 'blocks')) { status(tr('clioworks_mail_merge_no_document')); return false; }
    const modal = ensureDialog();
    const session = workbookSession();
    state.source = session ? 'workbook' : 'csv';
    adoptSource(state.source);
    if (typeof closeMenus === 'function') closeMenus();
    document.body.classList.add('has-system-modal');
    if (typeof modalScrim !== 'undefined' && modalScrim) modalScrim.classList.remove('is-hidden');
    const choice = await new Promise((resolve) => {
      const settle = () => {
        modal.onclose = null;
        document.body.classList.remove('has-system-modal');
        if (typeof modalScrim !== 'undefined' && modalScrim) modalScrim.classList.add('is-hidden');
        resolve(modal.returnValue === 'ok');
      };
      modal.onclose = settle;
      if (modal.open) modal.close('cancel');
      modal.showModal();
    });
    if (!choice) return false;
    try { return await runGenerateFlow(); } catch (error) {
      status(tr('clioworks_mail_merge_generate_failed', String(error && error.message || error), 0));
      return false;
    }
  }

  root.AISystem6ClioworksMailMerge = Object.freeze({
    FOLDER_NAME,
    parsePlaceholders,
    gridToTable,
    workbookGrid,
    csvGrid,
    templateMarkdownFromBlocks,
    instantiate,
    sanitizeName,
    fileNameFor,
    planMerge,
    buildRowBytes,
    pageSetupFromGeometry,
    storeDocuments,
    printMerged,
    open,
  });
  root.AISystem6ClioworksMailMergeLoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
