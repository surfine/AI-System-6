/* ClioWorks v4 (V4-01): native XLSX open/edit/save adapter around the vendored
 * VibeOffice Ledger codec (apps/desktop/app/vendor/vibeoffice/, Apache-2.0,
 * pinned upstream 32ff53a5da0e75ebac11acdb0251cd3d8c7bf408).
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
    'app/vendor/clioworks-v3/ledger-structure.js',
    'app/vendor/vibeoffice/ledger/xlsx-read.js',
    'app/vendor/vibeoffice/ledger/xlsx-write.js',
  ];

  // S11 M1-1: the formula evaluator is the second lazy load point. It is loaded by
  // ensureCalc() (first formula edit or recalc), never at open time. Order matters:
  // fn-core defines C.opt for the later files, fn-stat defines C.special for fn-eng.
  const CALC_MODULES = [
    'app/vendor/vibeoffice/ledger/calc.js',
    'app/vendor/vibeoffice/ledger/fn-core.js',
    'app/vendor/vibeoffice/ledger/fn-lookup.js',
    'app/vendor/vibeoffice/ledger/fn-stat.js',
    'app/vendor/vibeoffice/ledger/fn-fin.js',
    'app/vendor/vibeoffice/ledger/fn-eng.js',
  ];

  let loadPromise = null;
  let calcPromise = null;
  const calcModulesDone = new Set(); // CALC_MODULES already executed; a retry only fetches the missing ones

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

  /** Load the evaluator once (idempotent); resolves true when L.calc exists. */
  function loadCalc() {
    if (calcPromise) return calcPromise;
    calcPromise = (async () => {
      await loadCodec();
      // An evaluator that arrived by another route counts as fully loaded.
      if (!calcModulesDone.size && root.L.calc) CALC_MODULES.forEach((src) => calcModulesDone.add(src));
      for (const src of CALC_MODULES) {
        if (calcModulesDone.has(src)) continue;
        await loadScript(src);
        calcModulesDone.add(src);
      }
      if (!root.L.calc || typeof root.L.calc.changed !== 'function') {
        throw new Error('ledger-adapter: VibeOffice Ledger evaluator incomplete after load');
      }
      return true;
    })().catch((error) => {
      calcPromise = null;
      throw error;
    });
    return calcPromise;
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

  // Outward copies of a cell: plain JSON, never the evaluator's graph links.
  function cloneOut(cell) {
    return cell == null ? cell : JSON.parse(JSON.stringify(cell, (key, value) => (key === '_gnode' ? undefined : value)));
  }

  // Model-internal copy: shallow (values are scalars or immutable XErr), without graph links.
  function copyCell(cell) {
    if (!cell) return {};
    const out = Object.assign({}, cell);
    delete out._gnode;
    delete out.computing;
    return out;
  }

  const THREAD_NS = 'http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments';

  function newGuid() {
    const c = root.crypto;
    const raw = c && typeof c.randomUUID === 'function'
      ? c.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
    return '{' + raw.toUpperCase() + '}';
  }

  function plainKind(entry) {
    const where = String(entry.where || '');
    const id = String(entry.id || '');
    if (/thread/.test(id)) return 'comment-thread';
    if (/chart/.test(id) || /^xl\/charts\//.test(where)) return 'chart';
    if (/^xl\/diagrams\//.test(where)) return 'diagram';
    if (/shape|drawing/.test(id) || /^xl\/drawings\//.test(where)) return 'drawing';
    if (/^xl\/media\//.test(where)) return 'picture';
    if (/sheet-conversion/.test(id)) return 'sheet';
    if (/signature/.test(id)) return 'signature';
    return 'other';
  }

  function lossPlace(entry) {
    const place = String(entry.place || entry.where || '');
    const m = /^(.+)!\$?([A-Za-z]+\$?\d+)$/.exec(place);
    if (m) return { sheet: m[1], ref: m[2].replace(/\$/g, '').toUpperCase() };
    if (place && !/^xl\/|^\[|^\//.test(place)) return { sheet: place, ref: '' };
    return { sheet: '', ref: '' };
  }

  /**
   * Open a native XLSX document.
   * @param {ArrayBuffer|Uint8Array} bytes the untouched original package bytes
   * @param {{name?:string, scopeId?:string, documentId?:string, generation?:number}} meta
   */
  /** workbook.xml text with calcPr fullCalcOnLoad="1": the attribute set on an existing calcPr, or a calcPr
   *  inserted at its schema place (after definedNames, before oleSize and the rest). null if no workbook root. */
  function requestRecalcOnLoad(xml) {
    const root = /<([\w.-]+:)?workbook\b/.exec(xml);
    if (!root) return null;
    const p = (root[1] || '').replace(/\./g, '\\.');
    const existing = new RegExp('<' + p + 'calcPr\\b[^>]*?(/?)>').exec(xml);
    if (existing) {
      const tag = existing[0];
      if (/\sfullCalcOnLoad\s*=\s*["'](1|true)["']/.test(tag)) return xml;
      const fixed = /\sfullCalcOnLoad\s*=/.test(tag)
        ? tag.replace(/(\sfullCalcOnLoad\s*=\s*)(["'])[^"']*\2/, (all, attr, quote) => attr + quote + '1' + quote)
        : tag.replace(/\s*(\/?)>$/, ' fullCalcOnLoad="1"$1>');
      return xml.slice(0, existing.index) + fixed + xml.slice(existing.index + tag.length);
    }
    const after = ['oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'];
    const next = new RegExp('<' + p + '(?:' + after.join('|') + ')\\b|</' + p + 'workbook>').exec(xml);
    if (!next) return null;
    return xml.slice(0, next.index) + '<' + (root[1] || '') + 'calcPr fullCalcOnLoad="1"/>' + xml.slice(next.index);
  }


  async function open(bytes, meta = {}) {
    const L = await loadCodec();
    const original = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes.slice(0);
    const wb = await L.xlsxRead.read(cloneBytes(original), {});
    // Part preservation (R1): the baseline is what the writer makes of the UNEDITED workbook, written
    // once in idle time after open (L.zip.idleBaseline), before any edit or recalculation. Every part
    // the baseline and the edited write agree on keeps its original bytes (L.zip.preserveUntouched).
    const asBuffer = (out) => (out instanceof Uint8Array ? out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) : out);
    const written = async (book) => asBuffer(await L.xlsxWrite.bytes(book, { type: book.type || 'xlsx' }));
    const baseline = L.zip.idleBaseline(() => written(wb), () => editRevision === 0 && calcEpoch === 0);
    // The writer always asks the next reader to recalculate on load; a kept original workbook.xml must
    // still ask whenever a formula is saved without its cached result (stale), or Excel shows blanks.
    const anyStale = () => wb.sheets.some((sh) => (sh.rows || []).some((row) => row && row.cells && row.cells.some((cell) => cell && typeof cell.f === 'string' && cell.dirty)));
    const recalcPatch = (name, bytes) => {
      if (name !== 'xl/workbook.xml' || !anyStale()) return null;
      const next = requestRecalcOnLoad(L.zip.decode(bytes));
      return next ? L.zip.encode(next) : null;
    };
    // ONE dirty source (Amendment 1): isDirty() = editRevision !== savedRevision.
    // "Ever edited" (editRevision > 0) decides save mode and never goes back to false:
    // an undo to the saved state is still an edit unless the bytes compare equal.
    let editRevision = 0;
    let savedRevision = 0;
    let calcEpoch = 0;         // moves when recalculation changes cached results
    let graphStale = true;     // cell objects were replaced since the evaluator graph was built
    let encodeMemo = null;     // { key, out }
    const touchedCells = new Map(); // sheetName -> Set of "A1"
    const precedentCache = new Map(); // "sheet|table|formula" -> refs
    const positionalKeys = new Set(); // cache keys whose refs depend on the cell's own position

    const F = () => L.formula;
    const cellNameOf = (r, c) => F().cellName(r, c);
    const sheetByRef = (sheetId) => findSheet(wb, sheetId);

    /* -------------------------------------------------- dependency scan (calc not needed) */
    const hasRelative = (tree) => {
      let rel = false;
      F().walk(tree, (x) => {
        if ((x.t === 'ref' && (!x.ra || !x.ca)) || (x.t === 'area' && x.kind !== 'cols' && x.kind !== 'rows' && (!x.ra1 || !x.ca1 || !x.ra2 || !x.ca2))) rel = true;
      });
      return rel;
    };
    function precedentsOf(sh, cell, r, c) {
      // A table-relative reference ([@Col]) means a different table at each position.
      let tableKey = '';
      if (String(cell.f).indexOf('[') >= 0) {
        try { const t = wb.tableAt(sh, r, c); tableKey = t ? String(t.name || t.id || t.ref && t.ref.r1) : ''; } catch (error) { tableKey = ''; }
      }
      const baseKey = sh.name + '|' + tableKey + '|' + cell.f;
      // A formula that reads through a relative name means different cells at each position.
      const key = positionalKeys.has(baseKey) ? baseKey + '@' + r + ',' + c : baseKey;
      if (precedentCache.has(key)) return precedentCache.get(key);
      let positional = false;
      const refs = [];
      let ast = null;
      try { ast = F().parse(cell.f); } catch (error) { ast = null; }
      const add = (sheet, r1, c1, r2, c2) => { if (sheet) refs.push({ sheet, r1, c1, r2, c2 }); };
      const visit = (tree, scope, seen, at) => {
        if (!tree) return;
        F().walk(tree, (n) => {
          if (n.t === 'ref' || n.t === 'area') {
            if (n.book != null) return;
            const target = n.sheet != null ? wb.sheetByName(n.sheet) : scope;
            if (!target) return;
            const r1 = n.t === 'ref' ? n.r : Math.min(n.r1, n.r2);
            const r2 = n.t === 'ref' ? n.r : Math.max(n.r1, n.r2);
            const c1 = n.t === 'ref' ? n.c : Math.min(n.c1, n.c2);
            const c2 = n.t === 'ref' ? n.c : Math.max(n.c1, n.c2);
            if (n.sheet2) {
              const a = wb.sheetIndex(target);
              const b = wb.sheetIndex(wb.sheetByName(n.sheet2));
              if (a < 0 || b < 0) return;
              for (let i = Math.min(a, b); i <= Math.max(a, b); i += 1) add(wb.sheets[i], r1, c1, r2, c2);
            } else add(target, r1, c1, r2, c2);
          } else if (n.t === 'name') {
            const def = wb.findName(n.name, wb.sheetIndex(scope));
            if (def && !seen.has(def)) {
              seen.add(def);
              try {
                let named = F().parse(String(def.ref).replace(/^=/, ''));
                // A relative name reads relative to the formula's own cell.
                if (hasRelative(named)) { named = F().shift(named, r, c); positional = true; }
                visit(named, def.scope != null ? wb.sheets[def.scope] : scope, seen);
              } catch (error) { /* unresolved name: no precedent */ }
            } else if (!def) {
              const table = wb.findTable(n.name);
              if (table) add(table.sheet, table.ref.r1, table.ref.c1, table.ref.r2, table.ref.c2);
            }
          } else if (n.t === 'struct') {
            const table = n.table ? wb.findTable(n.table) : wb.tableAt(sh, r, c);
            if (table) add(table.sheet, table.ref.r1, table.ref.c1, table.ref.r2, table.ref.c2);
          }
        });
      };
      visit(ast, sh, new Set());
      if (positional) {
        positionalKeys.add(baseKey);
        precedentCache.set(baseKey + '@' + r + ',' + c, refs);
      } else precedentCache.set(key, refs);
      return refs;
    }

    function formulaCells() {
      const out = [];
      for (const sh of wb.sheets) {
        (sh.rows || []).forEach((row, r) => {
          if (!row || !row.cells) return;
          row.cells.forEach((cell, c) => { if (cell && typeof cell.f === 'string') out.push({ sh, r, c, cell }); });
        });
      }
      return out;
    }

    /**
     * Mark every formula that reads (transitively) a changed cell as not yet recalculated.
     * One reverse index (precedent cell -> readers) is built per call and the closure runs
     * over a queue, so the work is linear in formulas + dependency edges, not passes x formulas
     * x dirty cells. An array-formula master dirties its whole spill range.
     */
    function invalidateDependents(seeds) {
      const formulas = formulaCells();
      const sheetNo = new Map();
      wb.sheets.forEach((sh, i) => sheetNo.set(sh, i));
      const points = new Map();   // "i|r|c" -> entries reading exactly that cell
      const byColumn = new Map(); // "i|c" -> [{ r1, r2, entry }] wide ranges, bucketed per column
      const EXPAND = 64;
      for (const entry of formulas) {
        for (const p of precedentsOf(entry.sh, entry.cell, entry.r, entry.c)) {
          const i = sheetNo.get(p.sheet);
          if (i == null) continue;
          if ((p.r2 - p.r1 + 1) * (p.c2 - p.c1 + 1) <= EXPAND) {
            for (let rr = p.r1; rr <= p.r2; rr += 1) {
              for (let cc = p.c1; cc <= p.c2; cc += 1) {
                const k = i + '|' + rr + '|' + cc;
                const list = points.get(k);
                if (list) list.push(entry); else points.set(k, [entry]);
              }
            }
          } else {
            for (let cc = p.c1; cc <= p.c2; cc += 1) {
              const k = i + '|' + cc;
              const list = byColumn.get(k);
              const item = { r1: p.r1, r2: p.r2, entry };
              if (list) list.push(item); else byColumn.set(k, [item]);
            }
          }
        }
      }
      const hit = new Set();
      const queue = [];
      const readers = (sh, r, c, out) => {
        const i = sheetNo.get(sh);
        if (i == null) return;
        const direct = points.get(i + '|' + r + '|' + c);
        if (direct) for (const e of direct) out.push(e);
        const wide = byColumn.get(i + '|' + c);
        if (wide) for (const w of wide) if (r >= w.r1 && r <= w.r2) out.push(w.entry);
      };
      const area = (sh, cell, r, c) => (cell && cell.af
        ? { sh, r1: cell.af.r1, c1: cell.af.c1, r2: cell.af.r2, c2: cell.af.c2 }
        : { sh, r1: r, c1: c, r2: r, c2: c });
      for (const s of seeds) queue.push(area(s.sh, s.sh.get(s.r, s.c), s.r, s.c));
      const found = [];
      while (queue.length) {
        const a = queue.pop();
        for (let rr = a.r1; rr <= a.r2; rr += 1) {
          for (let cc = a.c1; cc <= a.c2; cc += 1) {
            found.length = 0;
            readers(a.sh, rr, cc, found);
            for (const entry of found) {
              if (hit.has(entry.cell)) continue;
              hit.add(entry.cell);
              queue.push(area(entry.sh, entry.cell, entry.r, entry.c));
            }
          }
        }
      }
      const out = [];
      for (const entry of formulas) {
        if (!hit.has(entry.cell)) continue;
        entry.cell.dirty = true;
        delete entry.cell.v;
        out.push({ sheet: entry.sh.name, ref: cellNameOf(entry.r, entry.c) });
      }
      return out;
    }

    /* ------------------------------------------------------------ evaluator */
    const calcReady = () => !!(root.L && root.L.calc && typeof root.L.calc.changed === 'function');
    const ensureGraph = () => {
      const C = root.L.calc;
      if (!wb.graph || graphStale) { C.rebuild(wb); graphStale = false; }
      return C;
    };
    const toChange = (sheet, ref) => {
      const sh = sheetByRef(sheet);
      const { row, col } = cellAddressParts(ref);
      return { sh, r: row - 1, c: col - 1 };
    };

    /* ----------------------------------------------------------------- undo */
    const history = () => wb.undo;
    function transact(label, fn) {
      history().begin(label || 'cell');
      try { return fn(); } finally { history().end(); }
    }
    // A custom undo step that also tells afterHistory() which cell it touched.
    function recordOp(undo, redo, touch) {
      const cur = history().cur;
      if (cur) cur.ops.push({ undo, redo, touch });
    }
    function afterHistory(t) {
      const changed = [];
      const seen = new Set();
      const note = (sh, r, c) => {
        const k = sh.name + '!' + r + ',' + c;
        if (seen.has(k)) return;
        seen.add(k);
        changed.push({ sheet: sh.name, ref: cellNameOf(r, c), _sh: sh, _r: r, _c: c });
      };
      for (const e of t.cells.values()) note(e.sh, e.r, e.c);
      for (const op of t.ops) for (const x of op.touch || []) note(x.sh, x.r, x.c);
      editRevision += 1;
      graphStale = true;
      encodeMemo = null;
      const seeds = changed.map((x) => ({ sh: x._sh, r: x._r, c: x._c }));
      if (calcReady()) {
        ensureGraph();
        root.L.calc.changed(wb, seeds);
        calcEpoch += 1;
      } else {
        invalidateDependents(seeds);
      }
      for (const x of changed) {
        if (!touchedCells.has(x.sheet)) touchedCells.set(x.sheet, new Set());
        touchedCells.get(x.sheet).add(x.ref);
      }
      return { changed: changed.map(({ sheet, ref }) => ({ sheet, ref })) };
    }

    /* ------------------------------------------------- structure editing (N5a) */
    const Structure = () => root.AISystem6LedgerStructure;
    // True once any structural edit ran in this session. While it holds, the first-save
    // list names the parts that do not follow structural edits (pivot tables, slicers).
    let structureEdited = false;
    const structureKept = () => (structureEdited && Structure() ? Structure().keptKinds(wb, null) : []);

    /**
     * One structural change = one named undo step over a model snapshot pair. A
     * refused or throwing change leaves the model exactly as it was.
     */
    function structureStep(label, apply) {
      const S = Structure();
      if (!S) return { status: 'failed', code: 'NO_STRUCTURE_MODULE' };
      const before = S.snapshot(wb);
      let out;
      try { out = apply(S); } catch (error) {
        try { S.restore(wb, before); } catch (restoreError) { console.warn('ledger-adapter: structure rollback', restoreError); }
        return { status: 'failed', code: 'STRUCTURE_FAILED', message: String(error && error.message || error) };
      }
      if (!out || out.status !== 'ok') {
        try { S.restore(wb, before); } catch (restoreError) { /* nothing was promised */ }
        return out || { status: 'failed', code: 'STRUCTURE_FAILED' };
      }
      const after = S.snapshot(wb);
      history().begin(label);
      history().op(() => S.restore(wb, before), () => S.restore(wb, after));
      history().end();
      structureEdited = true;
      editRevision += 1;
      graphStale = true;
      encodeMemo = null;
      precedentCache.clear();
      positionalKeys.clear();
      const seeds = out.seeds || out.cells || [];
      if (seeds.length) {
        if (calcReady()) {
          ensureGraph();
          root.L.calc.changed(wb, seeds);
          calcEpoch += 1;
        } else invalidateDependents(seeds);
      }
      return out;
    }

    /* --------------------------------------------------------------- comments */
    const T = () => L.threads;
    const isThreaded = (cm) => !!(cm && cm.thread && cm.thread.length && T().active(cm));
    const noteId = (sh, cm) => 'note:' + sh.name + '!' + cellNameOf(cm.r, cm.c);
    function stripAuthor(cm) {
      const text = String(cm.text || '');
      const author = cm.author || '';
      // Excel writes the author line with CRLF ("Author:\r\n"); ours uses LF.
      if (author && text.startsWith(author + ':')) return text.slice(author.length + 1).replace(/^\r?\n/, '');
      return text;
    }
    function commentList(sheetId) {
      const sheets = sheetId == null ? wb.sheets : [findSheet(wb, sheetId)];
      const out = [];
      for (const sh of sheets) {
        const list = Array.from(sh.comments.values()).sort((a, b) => a.r - b.r || a.c - b.c);
        for (const cm of list) {
          const ref = cellNameOf(cm.r, cm.c);
          if (isThreaded(cm)) {
            for (const t of cm.thread) {
              out.push({ id: t.id, sheet: sh.name, ref, author: t.author || '', text: t.text || '', date: t.date || '', done: !!t.done, parentId: t.parent || null, threaded: true });
            }
          } else {
            out.push({ id: noteId(sh, cm), sheet: sh.name, ref, author: cm.author || '', text: stripAuthor(cm), date: cm.cwDate || '', done: false, parentId: null, threaded: false });
          }
        }
      }
      return out;
    }
    function findRoot(id) {
      for (const sh of wb.sheets) {
        for (const cm of sh.comments.values()) {
          if (isThreaded(cm)) {
            if (cm.thread.some((t) => t.id === id)) return { sh, cm };
          } else if (noteId(sh, cm) === id) return { sh, cm };
        }
      }
      return null;
    }
    function knownPerson(author) {
      const wanted = String(author || '');
      for (const sh of wb.sheets) {
        for (const cm of sh.comments.values()) {
          for (const p of (cm.threadKeep && cm.threadKeep.people) || []) {
            const name = /displayName="([^"]*)"/.exec(p.xml);
            if (name && name[1] === wanted) return p;
          }
        }
      }
      return null;
    }

    const api = {
      kind: 'xlsx',
      name: meta.name || 'workbook.xlsx',
      scopeId: meta.scopeId || '',
      documentId: meta.documentId || '',
      generation: Number.isSafeInteger(meta.generation) ? meta.generation : 1,

      /** The single dirty source: the revision moved since the last markSaved(). */
      isDirty: () => editRevision !== savedRevision,
      // The saved revision is the one that was encoded; edits made while the
      // save ran keep the document dirty.
      markSaved(revision) { savedRevision = Number.isSafeInteger(revision) ? revision : editRevision; },
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
          value: cloneOut(cell.v),
          formula: typeof cell.f === 'string' ? cell.f : null,
          style: cell.s ?? null,
          type: cell.t ?? null,
        };
      },

      listCells(sheetId) {
        const sheet = findSheet(wb, sheetId);
        return listSheetCells(sheet).map(({ row, col, cell }) => ({ row, col, cell: cloneOut(cell) }));
      },

      /** The cell as the grid shows it: the number format applied to the cached value. */
      displayText(sheetId, address) {
        const sheet = findSheet(wb, sheetId);
        const cell = sheetCell(sheet, normalizeCellAddress(address));
        if (!cell || cell.v == null || cell.v === '') return '';
        const v = cell.v;
        if (v && typeof v === 'object' && v.e) return String(v.e);
        if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
        if (typeof v === 'number') {
          let code = 'General';
          try { code = wb.styles.get(cell.s || 0).nf || 'General'; } catch (error) { /* default style */ }
          try { return String(L.numfmt.text(code, v)); } catch (error) { return String(v); }
        }
        return String(v);
      },

      /**
       * Edit exactly one cell as one undo transaction. Only the declared fields change.
       * A content edit clears the cell's own cached result and every downstream
       * formula's (cell.v removed, cell.dirty = true) so stale() tells the truth.
       */
      setCell(sheetId, address, next) {
        const sheet = findSheet(wb, sheetId);
        const ref = normalizeCellAddress(address);
        const { row, col } = cellAddressParts(ref);
        const r = row - 1;
        const c = col - 1;
        const before = sheetCell(sheet, ref);
        const after = copyCell(before);
        const has = (k) => Object.prototype.hasOwnProperty.call(next, k);
        if (has('value')) {
          if (next.value == null) delete after.v;
          else after.v = cloneOut(next.value);
        }
        if (has('formula')) {
          if (next.formula == null) delete after.f;
          else after.f = String(next.formula);
        }
        if (has('type')) {
          if (next.type == null) delete after.t;
          else after.t = next.type;
        }
        if (has('style')) {
          if (next.style == null) delete after.s;
          else after.s = next.style;
        }
        if (has('value') || has('formula')) {
          delete after.ast;
          delete after._fsrc;
          delete after.kept;
          delete after.dirty;
          if (typeof after.f === 'string') {
            // The cache lives in `v`: a new or changed formula has no honest result yet.
            delete after.v;
            after.dirty = true;
            after.edited = true;
          }
        }
        transact(next.label || 'cell', () => {
          history().note(sheet, r, c);
          setSheetCell(sheet, ref, Object.keys(after).length ? after : null);
        });
        graphStale = true;
        encodeMemo = null;
        editRevision += 1;
        if (has('value') || has('formula')) invalidateDependents([{ sh: sheet, r, c }]);
        if (!touchedCells.has(sheet.name)) touchedCells.set(sheet.name, new Set());
        touchedCells.get(sheet.name).add(ref);
        return { sheet: sheet.name, ref, before: cloneOut(before) || null, after: cloneOut(after), revision: editRevision };
      },

      touched: () => [...touchedCells.entries()].map(([sheet, refs]) => ({ sheet, refs: [...refs].sort() })),

      /* -------------------------------------------------- structure (N5a) */
      /** What one insert/delete of lines would shift, and what stays as it was. */
      surveyLines(sheetId, axis, at, n) {
        const S = Structure();
        if (!S) return { status: 'failed', code: 'NO_STRUCTURE_MODULE' };
        return S.surveyLines(wb, findSheet(wb, sheetId), axis, at, n);
      },
      insertRows(sheetId, at, n) { return structureStep('insert-rows', (S) => S.insertRows(wb, findSheet(wb, sheetId), at, n)); },
      deleteRows(sheetId, at, n) { return structureStep('delete-rows', (S) => S.deleteRows(wb, findSheet(wb, sheetId), at, n)); },
      insertCols(sheetId, at, n) { return structureStep('insert-cols', (S) => S.insertCols(wb, findSheet(wb, sheetId), at, n)); },
      deleteCols(sheetId, at, n) { return structureStep('delete-cols', (S) => S.deleteCols(wb, findSheet(wb, sheetId), at, n)); },
      /** ⌘D / ⌘R: fill a range from its first row (down) or first column (right). */
      fillRange(sheetId, range, direction) { return structureStep(direction === 'right' ? 'fill-right' : 'fill-down', (S) => S.fill(wb, findSheet(wb, sheetId), range, direction)); },
      insertSheet(name, at) { return structureStep('insert-sheet', (S) => S.insertSheet(wb, name, at)); },
      deleteSheet(sheetId) { return structureStep('delete-sheet', (S) => S.deleteSheet(wb, findSheet(wb, sheetId))); },
      renameSheet(sheetId, next) { return structureStep('rename-sheet', (S) => S.renameSheet(wb, findSheet(wb, sheetId), next)); },

      /**
       * N5b: one named undo step around a model change that is not a cell, on
       * the caller's word (chart drawings). `run` must be atomic by
       * construction — compute everything, then mutate once — and records its
       * own undo/redo pair with history().op(); it returns the seeds whose
       * cached results the change stale (usually none). The transaction only
       * counts when something was actually recorded, so a refused change
       * leaves neither history nor the dirty axis moved.
       */
      applyModelStep(label, run) {
        const undo = history();
        const depth = undo.stack.length;
        undo.begin(label);
        let seeds = [];
        try { seeds = run(undo) || []; }
        catch (error) {
          undo.end();
          return { status: 'failed', code: 'STEP_FAILED', message: String(error && error.message || error) };
        }
        undo.end();
        if (undo.stack.length === depth) return { status: 'failed', code: 'STEP_EMPTY' };
        editRevision += 1;
        graphStale = true;
        encodeMemo = null;
        if (seeds.length) {
          if (calcReady()) {
            ensureGraph();
            root.L.calc.changed(wb, seeds);
            calcEpoch += 1;
          } else invalidateDependents(seeds);
        }
        return { status: 'ok' };
      },
      /** Frozen rows/columns of a sheet, as the file stores them. */
      freeze(sheetId) {
        const sheet = findSheet(wb, sheetId);
        return sheet.view.freeze ? { r: sheet.view.freeze.r, c: sheet.view.freeze.c } : null;
      },
      setFreeze(sheetId, r, c) { return structureStep('freeze', (S) => S.setFreeze(wb, findSheet(wb, sheetId), r, c)); },

      /* ---------------------------------------------------------- evaluator */
      async ensureCalc() { return loadCalc(); },
      calcLoaded: calcReady,

      /** Formula cells of a sheet whose cached result is not current ("尚未重算"). */
      stale(sheetId) {
        const sheet = findSheet(wb, sheetId);
        const out = [];
        (sheet.rows || []).forEach((row, r) => {
          if (!row || !row.cells) return;
          row.cells.forEach((cell, c) => { if (cell && typeof cell.f === 'string' && cell.dirty) out.push(cellNameOf(r, c)); });
        });
        return out;
      },

      /**
       * Recalculate. `changes` = [{ sheet, ref }] names the cells that were edited;
       * their dependents plus anything already stale are evaluated. No changes =
       * everything. Recalculated results are not edits (the revision stays).
       */
      async recalc(changes) {
        await loadCalc();
        const C = ensureGraph();
        const nodes = new Set();
        if (Array.isArray(changes) && changes.length) {
          for (const n of wb.graph.invalidate(changes.map((ch) => toChange(ch.sheet, ch.ref)))) nodes.add(n);
        } else {
          for (const n of wb.graph.byCell.values()) { n.cell.dirty = true; nodes.add(n); }
        }
        for (const n of wb.graph.byCell.values()) if (n.cell.dirty) nodes.add(n);
        const list = [...nodes];
        C.evaluate(list);
        calcEpoch += 1;
        encodeMemo = null;
        return { updated: list.map((n) => ({ sheet: n.sh.name, ref: cellNameOf(n.r, n.c) })) };
      },

      /* ---------------------------------------------------------------- undo */
      canUndo: () => history().canUndo(),
      canRedo: () => history().canRedo(),
      undoLabel: () => history().undoLabel || '',
      redoLabel: () => history().redoLabel || '',
      undo() {
        const t = history().canUndo() ? history().undo() : null;
        return t ? afterHistory(t) : { changed: [] };
      },
      redo() {
        const t = history().canRedo() ? history().redo() : null;
        return t ? afterHistory(t) : { changed: [] };
      },

      /* ------------------------------------------------------------ comments */
      comments: (sheetId) => commentList(sheetId),

      addComment(sheetId, address, { author = '', text = '', date = '' } = {}) {
        const sheet = findSheet(wb, sheetId);
        const ref = normalizeCellAddress(address);
        const { row, col } = cellAddressParts(ref);
        const r = row - 1;
        const c = col - 1;
        const key = L.model.key(r, c);
        const existing = sheet.comments.get(key);
        if (existing) {
          if (isThreaded(existing)) return api.replyComment(sheet.name, existing.thread[0].id, { author, text, date });
          return { status: 'blocked', code: 'COMMENT_EXISTS', id: noteId(sheet, existing) };
        }
        const body = String(text);
        const cm = { r, c, author: String(author), text: author ? author + ':\n' + body : body, visible: false, cwDate: String(date || '') };
        transact('comment-add', () => {
          sheet.comments.set(key, cm);
          if (r > sheet.maxR) sheet.maxR = r;
          if (c > sheet.maxC) sheet.maxC = c;
          recordOp(() => { sheet.comments.delete(key); }, () => { sheet.comments.set(key, cm); }, [{ sh: sheet, r, c }]);
        });
        editRevision += 1;
        encodeMemo = null;
        return { id: noteId(sheet, cm) };
      },

      replyComment(sheetId, rootId, { author = '', text = '', date = '' } = {}) {
        const hit = findRoot(rootId);
        if (!hit) return { status: 'failed', code: 'NO_SUCH_COMMENT' };
        const { sh, cm } = hit;
        if (!isThreaded(cm)) {
          // The vendored codec reads and rewrites threads but cannot start one on a plain note.
          return { status: 'blocked', code: 'LEGACY_NO_REPLY' };
        }
        const root0 = cm.thread.find((t) => !t.parent) || cm.thread[0];
        const part = sh.extra.threadPart;
        const pkg = wb.pkg;
        let person = knownPerson(author);
        const addedPerson = !person;
        if (!person) {
          const pid = newGuid();
          person = { id: pid, xml: '<person xmlns="' + THREAD_NS + '" displayName="' + L.xml.esc(author) + '" id="' + pid + '" userId="' + L.xml.esc(author) + '" providerId="None"/>' };
        }
        const id = newGuid();
        const dT = String(date || new Date().toISOString().replace('Z', ''));
        const body = String(text);
        const reply = { author: String(author), text: body, date: dT, id, parent: root0.id, personId: person.id, done: false, mentions: [] };
        reply.keep = {
          fragment: {
            xml: '<threadedComment xmlns="' + THREAD_NS + '" id="' + id + '" parentId="' + root0.id + '" personId="' + person.id + '" dT="' + dT + '" ref="' + cellNameOf(cm.r, cm.c) + '" done="0"><text>' + L.xml.esc(body) + '</text></threadedComment>',
            deps: [], ids: [], source: pkg && pkg.id, part, record: null,
          },
          values: { id, parent: root0.id, personId: person.id, date: dT, text: body, done: false, mentions: [] },
          ref: cellNameOf(cm.r, cm.c),
        };
        if (!cm.threadKeep) return { status: 'blocked', code: 'THREAD_STATE_MISSING' };
        transact('comment-reply', () => {
          // Register the undo first: every mutation below has its inverse on record.
          recordOp(() => {
            const i = cm.thread.indexOf(reply);
            if (i >= 0) cm.thread.splice(i, 1);
            if (addedPerson) cm.threadKeep.people = (cm.threadKeep.people || []).filter((p) => p !== person);
          }, () => {
            if (!cm.thread.includes(reply)) cm.thread.push(reply);
            if (addedPerson && !(cm.threadKeep.people || []).includes(person)) cm.threadKeep.people = cm.threadKeep.people.concat([person]);
          }, [{ sh, r: cm.r, c: cm.c }]);
          cm.thread.push(reply);
          if (addedPerson) cm.threadKeep.people = (cm.threadKeep.people || []).concat([person]);
        });
        editRevision += 1;
        encodeMemo = null;
        return { id };
      },

      /* -------------------------------------------------------- save / report */

      /**
       * Serialize. Never edited: byte-identical pass-through (original-bytes). Edited:
       * Ledger preserving writer, same package variant as the input. Consecutive calls at
       * the same revision share one encode.
       */
      async save() {
        if (editRevision === 0) return { bytes: cloneBytes(original), mode: 'original-bytes' };
        const out = await encodeCurrent();
        return { bytes: out.bytes.slice(0), mode: 'preserving-edit' };
      },

      /**
       * What saving the current model would convert or lose, from the encode path
       * itself (S11-C1): { converted: [{ sheet, ref, what, kind, detail }], lost: [...] }.
       * `what` is a plain object-kind code the surface translates (diagram, drawing,
       * chart, picture, comment-thread, sheet, signature, other).
       */
      async exportReport() {
        const report = { converted: [], lost: [] };
        // Never edited: save() hands back the original bytes, so nothing is converted or lost.
        if (editRevision === 0) return report;
        const out = await encodeCurrent();
        const seen = new Set();
        for (const entry of out.losses) {
          if (entry.action !== 'conversion' && entry.action !== 'drop') continue;
          const kind = plainKind(entry);
          const place = lossPlace(entry);
          const key = entry.action + '|' + kind + '|' + place.sheet + '|' + place.ref;
          if (seen.has(key)) continue;
          seen.add(key);
          const item = { sheet: place.sheet, ref: place.ref, what: kind, kind, detail: String(entry.what || ''), id: String(entry.id || '') };
          (entry.action === 'drop' ? report.lost : report.converted).push(item);
        }
        // N5a: parts that did not follow a structural edit are named in the first-save
        // list too — the confirmation said so before the change ran, and saving says it again.
        for (const kept of structureKept()) {
          const key = 'kept|' + kept.kind;
          if (seen.has(key)) continue;
          seen.add(key);
          report.lost.push({ sheet: '', ref: '', what: kept.kind, kind: kept.kind, count: kept.count, detail: 'kept-by-structure-edit', id: key });
        }
        return report;
      },

      /** Feature/loss ledger as the codec reports it (doc.losses equivalent). */
      losses: () => (Array.isArray(wb.losses) ? wb.losses.slice() : []),

      originalBytes: () => cloneBytes(original),
      originalBytesEqual: (candidate) => bytesEqual(original, candidate),
    };

    async function encodeCurrent() {
      const key = editRevision + ':' + calcEpoch;
      if (encodeMemo && encodeMemo.key === key) return encodeMemo;
      const base = await baseline.get(); // first: a baseline still being written finishes before this write starts
      let buffer = await written(wb);
      const losses = (Array.isArray(wb.losses) ? wb.losses : []).filter((e) => !e.phase || e.phase === 'save').map((e) => ({ ...e }));
      const merged = base && await L.zip.preserveUntouched({ original, baseline: base, edited: buffer, patch: recalcPatch });
      if (merged) buffer = merged.buffer;
      encodeMemo = { key, bytes: buffer, losses, parts: merged ? { kept: merged.kept, written: merged.written } : null };
      return encodeMemo;
    }

    await baseline.schedule();
    return api;
  }

  root.ClioWorksLedgerAdapter = Object.freeze({ open, loadCodec, loadCalc, MODULES: MODULES.slice(), CALC_MODULES: CALC_MODULES.slice() });
})(typeof window !== 'undefined' ? window : globalThis);
