/* ClioWorks v4 (V4-01): native XLSX open/edit/save adapter around the vendored
 * VibeOffice Ledger codec (apps/desktop/app/vendor/vibeoffice/, Apache-2.0,
 * pinned upstream 4c011173838de5d65e8ea0407684ba820a277273).
 *
 * Contract (INTEROPERABILITY.zh-CN):
 *  - Unchanged bytes pass through untouched: save() returns the original
 *    ArrayBuffer when the workbook was never modified (original-bytes mode).
 *  - After a real edit, the Ledger preserving writer rebuilds only owned parts;
 *    unknown parts and relationships keep original bytes (preserving-edit).
 *  - This adapter never goes through the plain-text importer and never
 *    overwrites the source record with extracted text.
 *
 * Loaded only by the ClioWorks host (lazy, classic script). No UI here: the
 * adapter exposes a document model to the CreatorPorts documents/editors ports;
 * S01/S11 screens and menu wiring live in the host layer. */
(function (root) {
  'use strict';

  const MODULES = [
    'app/vendor/vibeoffice/common/zip.js',
    'app/vendor/vibeoffice/common/xml.js',
    'app/vendor/vibeoffice/common/opc.js',
    'app/vendor/vibeoffice/common/opc-order.js',
    'app/vendor/vibeoffice/common/numfmt.js',
    'app/vendor/vibeoffice/common/crypto.js',
    'app/vendor/vibeoffice/common/dml.js',
    'app/vendor/vibeoffice/common/charts.js',
    'app/vendor/vibeoffice/ledger/xml.js',
    'app/vendor/vibeoffice/ledger/formula.js',
    'app/vendor/vibeoffice/ledger/model.js',
    'app/vendor/vibeoffice/ledger/preserve.js',
    'app/vendor/vibeoffice/ledger/extensions.js',
    'app/vendor/vibeoffice/ledger/pivots.js',
    'app/vendor/vibeoffice/ledger/threads.js',
    'app/vendor/vibeoffice/ledger/objects.js',
    'app/vendor/vibeoffice/ledger/slicers.js',
    'app/vendor/vibeoffice/ledger/tables.js',
    'app/vendor/vibeoffice/ledger/xchart.js',
    'app/vendor/vibeoffice/ledger/xlsx-read.js',
    'app/vendor/vibeoffice/ledger/xlsx-write.js',
  ];

  let loadPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('ledger-adapter: failed to load ' + src));
      document.head.appendChild(el);
    });
  }

  /** Load the vendored Ledger codec once. Rejects leave no partial retry state. */
  function loadCodec() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      for (const src of MODULES) await loadScript(src);
      const L = root.L;
      if (!L || !L.xlsxRead || !L.xlsxWrite || !L.model) {
        throw new Error('ledger-adapter: VibeOffice Ledger codec incomplete after load');
      }
      return L;
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  }

  function bytesEqual(a, b) {
    if (a === b) return true;
    if (!a || !b || a.byteLength !== b.byteLength) return false;
    const x = new Uint8Array(a);
    const y = new Uint8Array(b);
    for (let i = 0; i < x.length; i += 1) {
      if (x[i] !== y[i]) return false;
    }
    return true;
  }

  function cloneBytes(bytes) {
    return bytes.slice(0);
  }

  /** Deep-clone the workbook cell value (values are plain JSON scalars/objects). */
  function cloneCell(cell) {
    return cell == null ? cell : JSON.parse(JSON.stringify(cell));
  }

  function cellKey(ref) {
    return String(ref || '');
  }

  function normalizeCellAddress(address) {
    const match = /^([A-Za-z]+)([0-9]+)$/.exec(String(address || '').trim());
    if (!match) throw new Error('ledger-adapter: invalid cell address ' + address);
    return match[1].toUpperCase() + match[2];
  }

  function columnToIndex(letters) {
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n; // 1-based
  }

  function cellAddressParts(address) {
    const normalized = normalizeCellAddress(address);
    const split = normalized.match(/^([A-Z]+)(\d+)$/);
    return { col: columnToIndex(split[1]), row: Number(split[2]) };
  }

  function findSheet(wb, sheetId) {
    const sheets = wb && wb.sheets;
    if (!Array.isArray(sheets) || !sheets.length) throw new Error('ledger-adapter: workbook has no sheets');
    if (sheetId == null) return sheets[0];
    const found = sheets.find((sheet) => sheet && (sheet.name === sheetId || sheet.id === sheetId));
    if (!found) throw new Error('ledger-adapter: unknown sheet ' + sheetId);
    return found;
  }

  // VibeOffice Ledger Sheet: sparse `rows` array (0-based) of { cells: [] }
  // with 0-based column keys. sheet.get(r, c) reads; edits go through the
  // adapter so the preservation keep-map stays coherent.
  function sheetCell(sheet, address) {
    const { row, col } = cellAddressParts(address);
    return sheet.get(row - 1, col - 1);
  }

  function setSheetCell(sheet, address, cell) {
    const { row, col } = cellAddressParts(address);
    const r = row - 1;
    const c = col - 1;
    if (cell == null) {
      const rowObj = sheet.row(r);
      if (rowObj) delete rowObj.cells[c];
      return;
    }
    const rowObj = sheet.rowObj(r);
    rowObj.cells[c] = cell;
    if (r > sheet.maxR) sheet.maxR = r;
    if (c > sheet.maxC) sheet.maxC = c;
  }

  function listSheetCells(sheet) {
    const out = [];
    const rows = sheet.rows || [];
    for (let r = 0; r < rows.length; r += 1) {
      const rowObj = rows[r];
      if (!rowObj || !rowObj.cells) continue;
      const cells = rowObj.cells;
      for (const key in cells) {
        const cell = cells[key];
        if (cell) out.push({ row: r + 1, col: Number(key) + 1, cell });
      }
    }
    return out;
  }

  /**
   * Open a native XLSX document.
   * @param {ArrayBuffer|Uint8Array} bytes the untouched original package bytes
   * @param {{name?:string, scopeId?:string, documentId?:string, generation?:number}} meta
   */
  async function open(bytes, meta = {}) {
    const L = await loadCodec();
    const original = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes.slice(0);
    const wb = await L.xlsxRead.read(cloneBytes(original), {});
    let dirty = false;
    let editRevision = 0;
    const touchedCells = new Map(); // sheetName -> Set of "A1"

    const api = {
      kind: 'xlsx',
      name: meta.name || 'workbook.xlsx',
      scopeId: meta.scopeId || '',
      documentId: meta.documentId || '',
      generation: Number.isSafeInteger(meta.generation) ? meta.generation : 1,

      /** True when no edit has touched the model; save() then returns original bytes. */
      isDirty: () => dirty,
      getEditRevision: () => editRevision,

      workbook: () => wb,
      sheets: () => (wb.sheets || []).map((sheet) => ({ name: sheet.name, id: sheet.id, state: sheet.state || 'visible' })),

      /** Read one cell as the model holds it: value / formula / style stay distinct. */
      getCell(sheetId, address) {
        const sheet = findSheet(wb, sheetId);
        const ref = normalizeCellAddress(address);
        const cell = sheetCell(sheet, ref);
        if (!cell) return { ref, exists: false };
        return {
          ref,
          exists: true,
          value: cloneCell(cell.v),
          formula: typeof cell.f === 'string' ? cell.f : null,
          style: cell.s ?? null,
          type: cell.t ?? null,
        };
      },

      listCells(sheetId) {
        const sheet = findSheet(wb, sheetId);
        return listSheetCells(sheet).map(({ row, col, cell }) => ({ row, col, cell: cloneCell(cell) }));
      },

      /**
       * Edit exactly one cell. A formula string keeps the formula; only the
       * declared field changes. Returns the applied patch description.
       */
      setCell(sheetId, address, next) {
        const sheet = findSheet(wb, sheetId);
        const ref = normalizeCellAddress(address);
        const before = sheetCell(sheet, ref);
        const after = before ? cloneCell(before) : {};
        if (Object.prototype.hasOwnProperty.call(next, 'value')) {
          if (next.value == null) delete after.v;
          else after.v = cloneCell(next.value);
        }
        if (Object.prototype.hasOwnProperty.call(next, 'formula')) {
          if (next.formula == null) delete after.f;
          else after.f = String(next.formula);
        }
        if (Object.prototype.hasOwnProperty.call(next, 'type')) {
          if (next.type == null) delete after.t;
          else after.t = next.type;
        }
        if (Object.prototype.hasOwnProperty.call(next, 'style')) {
          if (next.style == null) delete after.s;
          else after.s = next.style;
        }
        // A cached result never outlives a content edit.
        if (Object.prototype.hasOwnProperty.call(next, 'value') || Object.prototype.hasOwnProperty.call(next, 'formula')) {
          delete after.c;
        }
        setSheetCell(sheet, ref, Object.keys(after).length ? after : null);
        dirty = true;
        editRevision += 1;
        if (!touchedCells.has(sheet.name)) touchedCells.set(sheet.name, new Set());
        touchedCells.get(sheet.name).add(ref);
        return { sheet: sheet.name, ref, before: cloneCell(before) || null, after: cloneCell(after) };
      },

      touched: () => [...touchedCells.entries()].map(([sheet, refs]) => ({ sheet, refs: [...refs].sort() })),

      /**
       * Serialize. Unmodified: byte-identical pass-through. Modified: Ledger
       * preserving writer, same package variant as the input.
       */
      async save() {
        if (!dirty) return { bytes: cloneBytes(original), mode: 'original-bytes' };
        const out = await L.xlsxWrite.bytes(wb, { type: wb.type || 'xlsx' });
        const buffer = out instanceof Uint8Array ? out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) : out;
        return { bytes: buffer, mode: 'preserving-edit' };
      },

      /** Feature/loss ledger as the codec reports it (doc.losses equivalent). */
      losses: () => (Array.isArray(wb.losses) ? wb.losses.slice() : []),

      originalBytes: () => cloneBytes(original),
      originalBytesEqual: (candidate) => bytesEqual(original, candidate),
    };
    return api;
  }

  root.ClioWorksLedgerAdapter = Object.freeze({ open, loadCodec, MODULES: MODULES.slice() });
})(typeof window !== 'undefined' ? window : globalThis);
