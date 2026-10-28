/* ClioChart CSV in/out (N15b): 文件 › 导入 CSV… turns a .csv/.tsv into a NEW
 * .xlsx document on the Project Hard Disk (one sheet named after the file,
 * opened in the workbook); 文件 › 导出 CSV… writes the current sheet's
 * displayed values — formulas as their cached results — as UTF-8 with BOM,
 * because Excel on Windows only reads Chinese columns when the BOM is there.
 *
 * The workbook is built through the Ledger model the way N4 builds a blank:
 * the vendored codec loads through the ClioWorks ledger adapter, values go in
 * with sheet.put, and L.xlsxWrite writes the bytes. Import inference is
 * deliberately narrow — a field becomes a NUMBER only when it is a plain
 * decimal with no leading zero and at most 15 digits; 00123 and 18-digit ID
 * numbers stay text, and nothing is ever turned into a date.
 *
 * Parsing is RFC 4180 quoting: commas and newlines inside quotes, "" as an
 * escaped quote. Encoding is UTF-8 (with or without BOM); when UTF-8 decoding
 * produces replacement characters the bytes are read again as GB18030 — the
 * encoding a Chinese Excel writes by default.
 *
 * No DOM of its own. User-visible strings live in the two translation files;
 * the desk shows them through setStatus/showSystemModal.
 */
(function (root) {
  'use strict';

  const BOM = '\uFEFF';

  /* ------------------------------------------------------------- decoding */

  /**
   * Bytes → text. UTF-8 (BOM stripped) unless it decodes with replacement
   * characters, then GB18030/GBK. Returns { text, encoding }.
   */
  function decodeText(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    let body = data;
    if (body.length >= 3 && body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) body = body.subarray(3);
    const utf8 = new TextDecoder('utf-8'); // non-fatal: replacement characters, never a throw
    const text = utf8.decode(body);
    if (!text.includes('\uFFFD')) return { text, encoding: 'utf-8' };
    try {
      const gb = new TextDecoder('gb18030');
      return { text: gb.decode(body), encoding: 'gb18030' };
    } catch (error) {
      return { text, encoding: 'utf-8' };
    }
  }

  /* -------------------------------------------------------------- parsing */

  function delimiterFor(name, text) {
    const ext = (String(name || '').match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
    if (ext === 'tsv' || ext === 'tab') return '\t';
    if (ext === 'csv') return ',';
    // No telling extension: a first line with tabs and no commas is a TSV.
    const head = String(text || '').split(/\r\n|\r|\n/, 1)[0] || '';
    return head.includes('\t') && !head.includes(',') ? '\t' : ',';
  }

  /** One RFC 4180 record stream over `text`. A terminator on the last line ends the table; it does not open an empty row. */
  function parseCsv(text, delimiter = ',') {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let sawAnything = false;
    const endField = () => { row.push(field); field = ''; };
    const endRow = () => { endField(); rows.push(row); row = []; sawAnything = false; };
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 1; }
          else inQuotes = false;
        } else field += c;
        continue;
      }
      if (c === '"') { inQuotes = true; sawAnything = true; continue; }
      if (c === delimiter) { endField(); sawAnything = true; continue; }
      if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i += 1;
        endRow();
        continue;
      }
      field += c;
      sawAnything = true;
    }
    // A final record without its terminator still lands; a text that ended on
    // a terminator (sawAnything false since the last endRow) adds nothing.
    if (sawAnything || field !== '' || row.length) endRow();
    return rows;
  }

  /* ---------------------------------------------------- value inference */

  /**
   * A CSV field becomes a number only when it is a plain decimal the Ledger
   * model can hold exactly: no leading zero (00123 stays a code), at most 15
   * digits (a 18-digit ID number stays text), no thousands separators, no
   * dates. Everything else stays the text it is.
   */
  function numericValue(field) {
    const raw = String(field ?? '');
    if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(raw)) return null;
    const unsigned = raw.replace(/^[+-]/, '');
    if (/^0\d/.test(unsigned)) return null;
    if (unsigned.replace('.', '').replace(/^-/, '').length > 15) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  /* ------------------------------------------------------- the xlsx bytes */

  function codec() {
    const adapter = root.ClioWorksLedgerAdapter;
    if (!adapter || typeof adapter.loadCodec !== 'function') {
      return Promise.reject(new Error('clio-chart-csv: the ClioWorks ledger adapter did not load'));
    }
    return adapter.loadCodec().then(() => root.L);
  }

  /** The xlsx codec through its owner: the host's ownCodec first (it snapshots the codec worlds, the ownership N4 taught), the bare adapter as the desk-free fallback. */
  async function ensureLedgerAdapter() {
    if (typeof root.ensureClioWorksLedgerModule === 'function') await root.ensureClioWorksLedgerModule();
    const host = root.AISystem6ClioWorks;
    if (host && typeof host.ownCodec === 'function') {
      await host.ownCodec('xlsx');
      return root.L;
    }
    return codec();
  }

  /** The one sheet's name: the file's stem, made legal for Excel (≤31 chars, no :\/?*[]), unique by construction here. */
  function sheetNameFor(fileName) {
    let name = String(fileName || '').replace(/\.[^.]+$/, '').replace(/[\\/?*[\]:]/g, '_').trim();
    if (!name) name = 'Sheet1';
    return name.slice(0, 31);
  }

  /**
   * Parsed rows → a real .xlsx's bytes, built on the Ledger model the same way
   * N4's blank workbook is. Empty fields make no cell at all.
   */
  async function buildWorkbookBytes(rows, sheetName) {
    const L = await ensureLedgerAdapter();
    const wb = new L.model.Workbook({});
    const sheet = wb.addSheet(sheetName);
    (rows || []).forEach((fields, r) => {
      (fields || []).forEach((field, c) => {
        if (field == null || field === '') return;
        const value = numericValue(field);
        sheet.put(r, c, value == null ? { v: field } : { v: value });
      });
    });
    return L.xlsxWrite.bytes(wb, { type: 'xlsx' });
  }

  /* ------------------------------------------------------------- exporting */

  function csvField(text) {
    const value = String(text ?? '');
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }

  /** 0-based column index → letters (0 → A, 25 → AA). */
  function columnName(index) {
    let n = Math.max(0, Math.floor(index));
    let out = '';
    do {
      out = String.fromCharCode(65 + (n % 26)) + out;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return out;
  }

  /**
   * One sheet → CSV text of its DISPLAYED values: a formula exports its cached
   * result (displayText reads value + number format), an error exports its
   * error text. The empty rectangle corners come from the sheet's own extent.
   * Returns the text WITHOUT the BOM; the desk adds it when writing.
   */
  function sheetToCsv(adapter, sheetName) {
    if (!adapter || typeof adapter.listCells !== 'function') throw new Error('clio-chart-csv: the workbook is not mounted');
    const cells = adapter.listCells(sheetName) || [];
    let maxR = -1;
    let maxC = -1;
    const at = new Map();
    for (const { row, col, cell } of cells) {
      if (!cell || cell.v == null || cell.v === '') continue;
      maxR = Math.max(maxR, row - 1);
      maxC = Math.max(maxC, col - 1);
      at.set(`${row - 1}:${col - 1}`, cell);
    }
    const lines = [];
    for (let r = 0; r <= maxR; r += 1) {
      const fields = [];
      for (let c = 0; c <= maxC; c += 1) {
        const cell = at.get(`${r}:${c}`);
        if (!cell) { fields.push(''); continue; }
        const ref = `${columnName(c)}${r + 1}`;
        let text = '';
        try { text = adapter.displayText(sheetName, ref); } catch (error) { text = ''; }
        if (text == null) text = String(cell.v ?? '');
        fields.push(csvField(text));
      }
      lines.push(fields.join(','));
    }
    return lines.join('\r\n') + (lines.length ? '\r\n' : '');
  }

  /* ------------------------------------------------------- the desk flows */

  function tr(key, ...args) {
    return typeof root.t === 'function' ? root.t(key, ...args) : key;
  }
  function status(text) {
    if (typeof root.setStatus === 'function') root.setStatus(text);
  }

  /**
   * 导入 CSV…: one dropped or chosen .csv/.tsv becomes a NEW .xlsx on the
   * Project Hard Disk and opens in the workbook — bytes first, item second
   * (the N0 order), the document's linked text source after. The original CSV
   * is never consumed: the caller keeps it wherever it came from.
   * @returns {Promise<{ok: boolean, item?: object, reason?: string, message?: string}>}
   */
  async function importWorkbook({ file, projectId, folderId = null }) {
    if (!file) return { ok: false, reason: 'no-file' };
    if (typeof root.getActiveProject === 'function' && !root.getActiveProject()) {
      if (typeof root.openWindow === 'function') root.openWindow('projects');
      status(tr('no_project_mounted'));
      return { ok: false, reason: 'no-project' };
    }
    // activeProjectId is a top-level let in the boot bundle: a global lexical
    // binding later scripts read by bare name (the way office-new.js does),
    // never as a window property.
    const project = projectId || (typeof activeProjectId !== 'undefined' ? activeProjectId : '');
    if (!project) {
      if (typeof root.openWindow === 'function') root.openWindow('projects');
      status(tr('no_project_mounted'));
      return { ok: false, reason: 'no-project' };
    }
    let text = '';
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      text = decodeText(bytes).text;
    } catch (error) {
      status(tr('clioworks_csv_import_failed', file.name, String(error?.message || error)));
      return { ok: false, reason: 'read-failed', message: String(error?.message || error) };
    }
    const delimiter = delimiterFor(file.name, text);
    let rows = parseCsv(text, delimiter);
    // A sheet of nothing is still a document: keep one empty row so the
    // workbook opens on a grid instead of failing to open at all.
    if (!rows.length) rows = [[]];
    let bytes;
    const sheet = sheetNameFor(file.name);
    try {
      bytes = await buildWorkbookBytes(rows, sheet);
    } catch (error) {
      status(tr('clioworks_csv_import_failed', file.name, String(error?.message || error)));
      return { ok: false, reason: 'encode-failed', message: String(error?.message || error) };
    }
    if (typeof root.ensureNativeBinariesModule === 'function') await root.ensureNativeBinariesModule();
    const store = root.AISystem6NativeBinaries;
    if (!store) {
      status(tr('clioworks_csv_import_failed', file.name, 'the native document store did not load'));
      return { ok: false, reason: 'no-store' };
    }
    const name = `${String(file.name || '').replace(/\.[^.]+$/, '') || '未命名'}.xlsx`;
    try {
      const item = await store.createProjectDocument({ projectId: project, name, folderId, format: 'xlsx', bytes });
      if (!item) throw new Error('the new document did not reach the Project Hard Disk');
      try { await store.refreshLinkedReference(item.id, bytes); } catch (error) { /* made again on its first save */ }
      if (typeof root.ensureClioWorksLedgerModule === 'function') await root.ensureClioWorksLedgerModule();
      const host = root.AISystem6ClioWorks;
      let opened = false;
      if (host && typeof host.openNativeDocument === 'function') {
        opened = (await host.openNativeDocument(item).catch(() => null))?.ok !== false;
      }
      if (typeof root.renderProjectDisks === 'function') { try { root.renderProjectDisks(); } catch (error) { /* repaints on the next render */ } }
      if (typeof root.renderDocuments === 'function') { try { root.renderDocuments(); } catch (error) { /* repaints on the next render */ } }
      status(tr('clioworks_csv_imported', item.name, sheet, rows.length));
      return { ok: true, item, opened };
    } catch (error) {
      status(tr('clioworks_csv_import_failed', name, String(error?.message || error)));
      return { ok: false, reason: 'store-failed', message: String(error?.message || error) };
    }
  }

  /**
   * 导出 CSV…: the mounted sheet's displayed values as UTF-8 WITH BOM through
   * the platform's saveArtifact. Returns { ok, fileName, saved }.
   */
  async function exportSheet({ adapter, sheetName, fileName }) {
    if (!adapter || !sheetName) return { ok: false, reason: 'no-sheet' };
    let csv = '';
    try {
      csv = sheetToCsv(adapter, sheetName);
    } catch (error) {
      status(tr('clioworks_csv_export_failed', sheetName, String(error?.message || error)));
      return { ok: false, reason: 'serialize-failed', message: String(error?.message || error) };
    }
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
    const name = String(fileName || 'sheet').replace(/\.(xlsx|csv|tsv)$/i, '') + '.csv';
    const platform = root.AISystem6WebPlatform;
    const saved = platform && typeof platform.saveArtifact === 'function'
      ? !!platform.saveArtifact({ blob, fileName: name, mimeType: 'text/csv;charset=utf-8' })
      : false;
    status(saved ? tr('clioworks_csv_exported', name) : tr('clioworks_csv_export_refused', name));
    return { ok: saved, fileName: name };
  }

  root.AISystem6ClioChartCsv = Object.freeze({
    decodeText,
    parseCsv,
    delimiterFor,
    numericValue,
    sheetNameFor,
    buildWorkbookBytes,
    sheetToCsv,
    importWorkbook,
    exportSheet,
  });
  root.AISystem6ClioChartCsvLoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
