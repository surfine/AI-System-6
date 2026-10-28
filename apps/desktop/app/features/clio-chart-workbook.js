/* ClioChart workbook surface (S11 M1, interface convention B).
 *
 * An xlsx workbook opened from the desk is edited INSIDE the existing ClioChart
 * window: no new window name. The chart's own chrome (details bar and split) is
 * hidden while a workbook is mounted and comes back when it closes. Two modes in
 * one window share one document and one dirty axis: ClioChart Express (read the
 * grid, change a cell's value) and ClioChart (input bar; values and formulas).
 *
 * The document model is the live Ledger adapter the native host puts on the
 * record (record.liveAdapter). This file never parses or writes a package itself
 * and keeps no second model, history or database:
 *   dirty      = adapter.isDirty()                (one source)
 *   undo       = the adapter's codec transactions  (Edit menu, via clio-chart.js)
 *   recalc     = adapter.recalc(), which loads calc on the first edit that stales a cell
 *   save       = AISystem6ClioWorks.saveNativeDocument (the native host writes)
 *   losses     = adapter.exportReport()            (first-save list only when > 0)
 * Every one of those is feature-detected; a missing capability is not drawn, or
 * is answered with a receipt, never faked.
 *
 * Layers: createSession() is the document-facing state (no DOM; driven headless
 * by tests/features/clioworks-s11-m1-workbook-surface.test.mjs); mountSurface()
 * draws it into the window. */
(function (root) {
  'use strict';
  if (root.AISystem6ClioChartWorkbook) return;

  // The sheet's own bounds (1,048,576 x 16,384) are the only limit; the grid
  // renders a virtualised window of rows, so a 10,000-row sheet stays light.
  const COL_RENDER_LIMIT = 256;
  const ROW_WINDOW_BUFFER = 8;
  const STEP_KEYS = Object.freeze({
    cell: 'clio_chart_workbook_step_cell',
    formula: 'clio_chart_workbook_step_formula',
    comment: 'clio_chart_workbook_step_comment',
    insert_rows: 'clio_chart_workbook_step_insert_rows',
    delete_rows: 'clio_chart_workbook_step_delete_rows',
    insert_cols: 'clio_chart_workbook_step_insert_cols',
    delete_cols: 'clio_chart_workbook_step_delete_cols',
    insert_sheet: 'clio_chart_workbook_step_insert_sheet',
    delete_sheet: 'clio_chart_workbook_step_delete_sheet',
    rename_sheet: 'clio_chart_workbook_step_rename_sheet',
    fill_down: 'clio_chart_workbook_step_fill_down',
    fill_right: 'clio_chart_workbook_step_fill_right',
    freeze: 'clio_chart_workbook_step_freeze',
    // N11: the desk clipboard's pastes — one named step whichever app the copy
    // came from. The labels ride the adapter's undo stack verbatim (stepKey
    // passes any 'clio_chart_workbook_step_' text through).
    paste: 'clio_chart_workbook_step_paste',
    paste_from_write: 'clio_chart_workbook_step_paste_from_write',
  });
  const STRUCTURE_STEP_KEYS = Object.freeze({
    'insert-rows': STEP_KEYS.insert_rows,
    'delete-rows': STEP_KEYS.delete_rows,
    'insert-cols': STEP_KEYS.insert_cols,
    'delete-cols': STEP_KEYS.delete_cols,
    'fill-down': STEP_KEYS.fill_down,
    'fill-right': STEP_KEYS.fill_right,
    'insert-sheet': STEP_KEYS.insert_sheet,
    'delete-sheet': STEP_KEYS.delete_sheet,
    'rename-sheet': STEP_KEYS.rename_sheet,
    freeze: STEP_KEYS.freeze,
  });
  const STATE_KEYS = Object.freeze({
    empty: 'clio_chart_workbook_state_empty',
    zero: 'clio_chart_workbook_state_zero',
    number: 'clio_chart_workbook_state_number',
    text: 'clio_chart_workbook_state_text',
    error: 'clio_chart_workbook_state_error',
    stale: 'clio_chart_workbook_state_stale',
    formula: 'clio_chart_workbook_state_formula',
  });

  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);
  const fn = (target, name) => !!target && typeof target[name] === 'function';

  /* ------------------------------------------------------------- addresses */

  function colName(c) {
    let n = c + 1;
    let out = '';
    while (n > 0) { const m = (n - 1) % 26; out = String.fromCharCode(65 + m) + out; n = Math.floor((n - 1) / 26); }
    return out;
  }
  function cellRef(r, c) { return colName(c) + (r + 1); }
  function parseAddress(text) {
    const m = /^\s*\$?([A-Za-z]{1,3})\$?([0-9]{1,7})\s*$/.exec(String(text || ''));
    if (!m) return null;
    let c = 0;
    for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
    c -= 1;
    const r = Number(m[2]) - 1;
    if (r < 0 || c < 0 || c >= 16384 || r >= 1048576) return null;
    return { r, c, ref: cellRef(r, c) };
  }
  function parseValue(text) {
    const s = String(text).trim();
    if (s === '') return null;
    if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return Number(s);
    return String(text);
  }
  /**
   * Virtualisation math, pure so a contract can hold it: which rows the DOM
   * holds at one scroll position. `frozenRows` always stay in the DOM, so the
   * window starts no higher than just below them.
   */
  function rowWindow(total, scrollTop, viewportPx, buffer, rowHeightPx, frozenRows = 0) {
    const height = Math.max(1, Number(rowHeightPx) || 24);
    const count = Math.ceil(Math.max(1, viewportPx) / height) + buffer * 2;
    const first = Math.max(frozenRows, Math.floor(scrollTop / height) - buffer);
    const last = Math.min(Math.max(0, total - 1), first + count - 1);
    return { first, last: Math.max(first, last), count: Math.max(first, last) - first + 1 };
  }
  // macOS takes the command key only: Ctrl+E/S/M belong to the text fields there.
  function commandKey(event) {
    const useMeta = typeof shortcutUsesCommandKey === 'function' ? shortcutUsesCommandKey() : /mac|iphone|ipad/i.test(String(typeof navigator !== 'undefined' && (navigator.platform || '')));
    return useMeta ? !!event.metaKey && !event.ctrlKey : !!event.ctrlKey && !event.metaKey;
  }
  function isError(v) { return !!v && typeof v === 'object' && typeof v.e === 'string'; }
  function sameValue(a, b) {
    if (isError(a) || isError(b)) return isError(a) && isError(b) && a.e === b.e;
    return a === b;
  }
  function stepKey(label) {
    const text = String(label || '');
    if (!text) return '';
    if (text.startsWith('clio_chart_workbook_step_')) return text;
    // N3: the find/replace engine's steps (find-replace.js); the batch one
    // carries a count, so it is matched, not listed.
    if (/^全部替换 \d+ 处$/.test(text)) return 'clio_chart_workbook_step_replace_all';
    if (text === '替换') return 'clio_chart_workbook_step_replace';
    if (Object.prototype.hasOwnProperty.call(STRUCTURE_STEP_KEYS, text)) return STRUCTURE_STEP_KEYS[text];
    return /comment/i.test(text) ? STEP_KEYS.comment : STEP_KEYS.cell;
  }
  /** The count a 「全部替换 N 处」 undo label carries, as the translation's args. */
  function stepLabelArgs(label) {
    const m = /^全部替换 (\d+) 处$/.exec(String(label || ''));
    return m ? [Number(m[1])] : [];
  }

  /* ---------------------------------------------------------------- session */

  /**
   * Document-facing state for one mounted workbook.
   * @param {object} initialAdapter the live Ledger adapter (record.liveAdapter)
   * @param {{fileName?:string, mountedName?:string, host?:object, confirmList?:Function, alertFailure?:Function}} opts
   *   host.save(mountedName) and host.revert(mountedName) are the native host's
   *   calls; confirmList(report) answers 'save' or 'cancel' for the first-save list.
   */
  function createSession(initialAdapter, opts = {}) {
    let adapter = initialAdapter;
    const listeners = new Set();
    const host = opts.host || {};
    const visibleSheets = () => {
      const all = fn(adapter, 'sheets') ? adapter.sheets() : [];
      const shown = all.filter((sheet) => !sheet.state || sheet.state === 'visible').map((sheet) => sheet.name);
      return shown.length ? shown : all.map((sheet) => sheet.name);
    };
    const s = {
      mode: 'express',
      sheet: visibleSheets()[0] || '',
      selections: new Map(),
      receipt: { key: '', args: [], kind: 'idle' },
      saving: false,
      confirming: false,
      confirmedLost: 0,
      composing: false,
      closed: false,
      recalcs: 0,
      reverting: false,
    };
    // Formula cells this session set while the adapter cannot say what is stale
    // (no adapter.stale()): their cached value was dropped, so they are "not
    // recalculated" — never the old number, never 0.
    const localStale = new Set();
    let lastRecalc = Promise.resolve(null);

    const notify = () => listeners.forEach((listener) => { try { listener(); } catch (error) { console.error(error); } });
    const isDirty = () => (fn(adapter, 'isDirty') ? !!adapter.isDirty() : false);
    const revision = () => {
      if (fn(adapter, 'getEditRevision')) return Number(adapter.getEditRevision()) || 0;
      if (fn(adapter, 'revision')) return Number(adapter.revision()) || 0;
      return 0;
    };
    const restingReceipt = () => (isDirty() ? { key: 'clio_chart_workbook_receipt_dirty', args: [], kind: 'dirty' } : { key: '', args: [], kind: 'idle' });
    const setReceipt = (key, kind = 'info', args = []) => { s.receipt = { key, args, kind }; notify(); };
    // A refusal or a hint belongs to the moment it was said in. Moving on drops it
    // back to the resting receipt; a refused value never moves the selection, so
    // the reason stays on screen until the writer does something else.
    const settleReceipt = () => {
      if (s.receipt.kind === 'blocked' || s.receipt.kind === 'info') s.receipt = restingReceipt();
    };
    const selection = () => s.selections.get(s.sheet) || { r: 0, c: 0 };

    function staleRefs(sheet) {
      if (fn(adapter, 'stale')) {
        try { return new Set(adapter.stale(sheet) || []); } catch (error) { console.warn('ClioChart workbook: stale()', error); }
      }
      const out = new Set();
      for (const key of localStale) if (key.startsWith(sheet + '!')) out.add(key.slice(sheet.length + 1));
      return out;
    }

    function fallbackText(cell) {
      const v = cell.value;
      if (typeof v !== 'number') return v == null ? '' : String(v);
      const L = root.L;
      try {
        const styles = fn(adapter, 'workbook') ? adapter.workbook().styles : null;
        const code = (styles && cell.style != null && styles.get(cell.style)?.nf) || 'General';
        if (L && L.numfmt && typeof L.numfmt.text === 'function') return L.numfmt.text(code, v);
      } catch (error) { /* default number text below */ }
      return String(v);
    }
    function displayText(sheet, ref, cell) {
      if (fn(adapter, 'displayText')) {
        try { const text = adapter.displayText(sheet, ref); if (text != null) return String(text); } catch (error) { /* fall back */ }
      }
      return fallbackText(cell);
    }

    function finish(v) {
      v.stateLabel = tr(STATE_KEYS[v.state]);
      v.label = tr('clio_chart_workbook_cell_aria', v.ref, v.stateLabel, v.state === 'stale' ? '' : v.text);
      v.numeric = v.state === 'zero' || v.state === 'number' || v.state === 'formula' || v.state === 'error';
      return v;
    }
    /** What one cell shows: the five states of 「ClioChart 深处」c, told apart by text, not colour. */
    function view(sheet, ref, stale = null) {
      const addr = parseAddress(ref);
      const cell = adapter.getCell(sheet, addr.ref);
      const base = { ref: addr.ref, r: addr.r, c: addr.c, formula: null, raw: '', text: '', state: 'empty' };
      if (!cell || !cell.exists) return finish(base);
      const v = cell.value;
      if (cell.formula != null) {
        base.formula = cell.formula;
        base.raw = '=' + cell.formula;
        if ((stale || staleRefs(sheet)).has(addr.ref)) return finish({ ...base, state: 'stale', text: tr(STATE_KEYS.stale) });
        if (isError(v)) return finish({ ...base, state: 'error', text: v.e });
        return finish({ ...base, state: 'formula', text: displayText(sheet, addr.ref, cell) });
      }
      if (v == null || v === '') return finish(base);
      if (isError(v)) return finish({ ...base, state: 'error', text: v.e, raw: v.e });
      if (typeof v === 'number') return finish({ ...base, state: v === 0 ? 'zero' : 'number', text: displayText(sheet, addr.ref, cell), raw: String(v) });
      return finish({ ...base, state: 'text', text: displayText(sheet, addr.ref, cell), raw: String(v) });
    }

    function extent(sheet) {
      let maxR = -1;
      let maxC = -1;
      const book = fn(adapter, 'workbook') ? adapter.workbook() : null;
      const sh = book && Array.isArray(book.sheets) ? book.sheets.find((item) => item.name === sheet) : null;
      if (sh && Number.isInteger(sh.maxR)) { maxR = sh.maxR; maxC = sh.maxC; }
      else if (fn(adapter, 'listCells')) {
        for (const { row, col } of adapter.listCells(sheet)) { maxR = Math.max(maxR, row - 1); maxC = Math.max(maxC, col - 1); }
      }
      const rows = Math.max(maxR + 4, 14);
      const cols = Math.max(maxC + 3, 8);
      // Rows are virtualised, so their number is unbounded. Columns render in
      // the DOM; beyond the render limit the sheet says so instead of hanging.
      return { rows, cols: Math.min(cols, COL_RENDER_LIMIT), truncated: cols > COL_RENDER_LIMIT };
    }

    function calcLoaded() { return fn(adapter, 'calcLoaded') ? !!adapter.calcLoaded() : false; }
    // Any cell, on any sheet, whose cached result the last edit took away (Q-M1-1).
    function anyStale() {
      if (localStale.size) return true;
      if (!fn(adapter, 'stale')) return false;
      const all = fn(adapter, 'sheets') ? adapter.sheets().map((sheet) => sheet.name) : visibleSheets();
      return all.some((name) => staleRefs(name).size > 0);
    }
    function recalc(changes) {
      if (!fn(adapter, 'recalc')) return null;
      s.recalcs += 1;
      let started;
      try { started = Promise.resolve(adapter.recalc(changes)); } catch (error) { started = Promise.reject(error); }
      const run = started
        .then((out) => {
          for (const { sheet, ref } of changes || []) localStale.delete(`${sheet}!${ref}`);
          return out;
        })
        .catch((error) => {
          console.warn('ClioChart workbook: recalc', error);
          s.receipt = { key: 'clio_chart_workbook_receipt_recalc_failed', args: [], kind: 'error' };
          return null;
        })
        .finally(() => {
          s.recalcs -= 1;
          if (typeof opts.onRecalc === 'function') opts.onRecalc();
          notify();
        });
      lastRecalc = run;
      return run;
    }

    /**
     * One entry point for both modes. Express sets values and answers a formula
     * with a receipt (no dialog, no change); full mode also sets formulas.
     */
    function commitCell(ref, text) {
      if (s.closed) return { status: 'blocked', code: 'CLOSED' };
      if (s.reverting) return { status: 'blocked', code: 'REVERTING' };
      if (s.confirming) return { status: 'blocked', code: 'CONFIRM_OPEN' };
      const addr = parseAddress(ref);
      if (!addr) return { status: 'failed', code: 'BAD_ADDRESS' };
      const sheet = s.sheet;
      const before = adapter.getCell(sheet, addr.ref) || { exists: false };
      const body = String(text);
      const trimmed = body.trim();
      const wantsFormula = trimmed.startsWith('=') && trimmed.length > 1;
      if (s.mode === 'express') {
        if (before.exists && before.formula != null) {
          setReceipt('clio_chart_workbook_receipt_formula_cell', 'blocked', [addr.ref]);
          return { status: 'blocked', code: 'FORMULA_CELL' };
        }
        if (trimmed.startsWith('=')) {
          setReceipt('clio_chart_workbook_receipt_express_value_only', 'blocked');
          return { status: 'blocked', code: 'EXPRESS_VALUE_ONLY' };
        }
      }
      let patch;
      if (wantsFormula) {
        const formula = trimmed.slice(1);
        // Re-entering the same formula is not an edit: the cached result and the clean state stay.
        if (before.exists && before.formula === formula) return { status: 'ok', code: 'UNCHANGED' };
        const parser = root.L && root.L.formula;
        if (parser && typeof parser.tryParse === 'function') {
          const parsed = parser.tryParse(formula);
          if (parsed && parsed.error) {
            setReceipt('clio_chart_workbook_receipt_formula_syntax', 'blocked', [addr.ref]);
            return { status: 'blocked', code: 'FORMULA_SYNTAX' };
          }
        }
        patch = { formula, value: null, label: STEP_KEYS.formula };
      } else {
        // Text that is exactly what the cell already shows is not an edit: "007", a long ID or an
        // error cell must not be re-typed into a number or a string by opening and leaving it.
        if (before.exists && before.formula == null && body === view(sheet, addr.ref).raw) return { status: 'ok', code: 'UNCHANGED' };
        const value = parseValue(body);
        if (before.exists && before.formula == null && sameValue(before.value, value)) return { status: 'ok', code: 'UNCHANGED' };
        if (!before.exists && value === null) return { status: 'ok', code: 'UNCHANGED' };
        patch = { value, formula: null, label: STEP_KEYS.cell };
      }
      adapter.setCell(sheet, addr.ref, patch);
      const key = `${sheet}!${addr.ref}`;
      if (wantsFormula) localStale.add(key); else localStale.delete(key);
      // Typing while a save is in flight does not talk over it: 「存储中，仍可输入」 stays until the
      // save answers, and its own ending (saved / saved-older / failed) says what happened.
      if (!s.saving) s.receipt = restingReceipt();
      // Q-M1-1: every edit that leaves a cell "not recalculated" asks for the recalculation, and
      // that is what loads calc.js (a formula edit, a value that feeds a formula, a loaded calc).
      // The cells say 「尚未重算」 until it answers; an edit nothing depends on loads nothing.
      const pending = wantsFormula || calcLoaded() || anyStale() ? recalc([{ sheet, ref: addr.ref }]) : null;
      notify();
      return { status: 'ok', ref: addr.ref, recalc: pending };
    }

    async function readReport() {
      // A document this session never edited is saved as its original bytes: nothing converted, nothing lost.
      if (!isDirty()) return { converted: [], lost: [] };
      if (fn(adapter, 'exportReport')) {
        const report = (await adapter.exportReport()) || {};
        return { converted: Array.isArray(report.converted) ? report.converted : [], lost: Array.isArray(report.lost) ? report.lost : [] };
      }
      // Older adapters: the codec's own loss ledger, counted, never shown as part names (Q3).
      const seen = new Set();
      const lost = [];
      for (const entry of fn(adapter, 'losses') ? adapter.losses() : []) {
        if (!entry || seen.has(entry.id) || (entry.action !== 'drop' && entry.action !== 'conversion')) continue;
        seen.add(entry.id);
        lost.push({ sheet: '', ref: '', what: tr('clio_chart_workbook_lost_unnamed') });
      }
      return { converted: [], lost };
    }

    /** ⌘S. One candidate is never submitted twice; edits made while saving stay dirty. */
    async function save() {
      if (s.closed) return { status: 'blocked', code: 'CLOSED' };
      if (s.reverting) return { status: 'blocked', code: 'REVERTING' };
      if (s.saving) return { status: 'blocked', code: 'SAVE_IN_FLIGHT' };
      if (s.confirming) return { status: 'blocked', code: 'CONFIRM_OPEN' };
      if (!isDirty()) {
        setReceipt('clio_chart_workbook_receipt_nothing', 'info');
        return { status: 'clean' };
      }
      if (!fn(host, 'save')) {
        setReceipt('clio_chart_workbook_receipt_unavailable', 'error');
        return { status: 'failed', reason: 'unavailable' };
      }
      // Claimed before anything is encoded (S11-20).
      s.saving = true;
      setReceipt('clio_chart_workbook_receipt_saving', 'saving');
      let report;
      try { report = await readReport(); } catch (error) {
        s.saving = false;
        setReceipt('clio_chart_workbook_receipt_failed', 'error');
        if (typeof opts.alertFailure === 'function') await opts.alertFailure({ ok: false, reason: 'report-failed', message: String(error && error.message || error) });
        return { status: 'failed', reason: 'report-failed' };
      }
      const count = report.converted.length + report.lost.length;
      // Q2: the list appears only when something is converted or lost, and S11-13:
      // once per session unless the save would now lose more than was accepted.
      const needsList = count > 0 && count > s.confirmedLost;
      if (needsList) {
        s.saving = false;
        s.confirming = true;
        s.receipt = restingReceipt();
        notify();
        let choice = 'cancel';
        try { choice = typeof opts.confirmList === 'function' ? await opts.confirmList(report) : 'cancel'; }
        finally { s.confirming = false; }
        if (choice !== 'save') {
          setReceipt('clio_chart_workbook_receipt_not_saved', 'info');
          return { status: 'cancelled' };
        }
        s.saving = true;
        setReceipt('clio_chart_workbook_receipt_saving', 'saving');
      }
      const rev = revision();
      let result;
      try { result = await host.save(opts.mountedName); } catch (error) {
        result = { ok: false, reason: 'encode-failed', message: String(error && error.message || error) };
      }
      s.saving = false;
      if (!result || !result.ok) {
        setReceipt(result && result.reason === 'unavailable' ? 'clio_chart_workbook_receipt_unavailable' : 'clio_chart_workbook_receipt_failed', 'error');
        if (typeof opts.alertFailure === 'function') await opts.alertFailure(result || { ok: false });
        return { status: 'failed', reason: (result && result.reason) || 'failed' };
      }
      if (needsList) s.confirmedLost = count;
      if (revision() > rev || isDirty()) setReceipt('clio_chart_workbook_receipt_saved_older', 'saved-older');
      else setReceipt('clio_chart_workbook_receipt_saved', 'saved', [opts.fileName || '']);
      return { status: 'ok', mode: result.mode, byteLength: result.byteLength, sha256: result.sha256 };
    }

    /* Edit › Undo / Redo over the adapter's own codec transactions (S11-C2). */
    function canUndo() { return !s.closed && !s.confirming && fn(adapter, 'canUndo') && fn(adapter, 'undo') && !!adapter.canUndo(); }
    function canRedo() { return !s.closed && !s.confirming && fn(adapter, 'canRedo') && fn(adapter, 'redo') && !!adapter.canRedo(); }
    function travel(direction) {
      if (direction === 'undo' ? !canUndo() : !canRedo()) return false;
      const out = adapter[direction]() || {};
      localStale.clear();
      // Undo and redo stale what they touch just as an edit does.
      if (anyStale()) {
        const changed = (Array.isArray(out.changed) ? out.changed : []).filter((item) => item && item.sheet && item.ref);
        recalc(changed.length ? changed : undefined);
      }
      if (s.receipt.kind !== 'saving' && s.receipt.kind !== 'error') s.receipt = restingReceipt();
      if (typeof opts.onHistory === 'function') opts.onHistory(out);
      notify();
      return true;
    }
    const editHistory = Object.freeze({
      undo: () => travel('undo'),
      redo: () => travel('redo'),
      canUndo,
      canRedo,
      undoLabel: () => (canUndo() && fn(adapter, 'undoLabel') ? stepKey(adapter.undoLabel()) : ''),
      redoLabel: () => (canRedo() && fn(adapter, 'redoLabel') ? stepKey(adapter.redoLabel()) : ''),
      // 「全部替换 N 处」 keeps its count in the menu row (undoLabelArgs feeds it).
      undoLabelArgs: () => (canUndo() && fn(adapter, 'undoLabel') ? stepLabelArgs(adapter.undoLabel()) : []),
      redoLabelArgs: () => (canRedo() && fn(adapter, 'redoLabel') ? stepLabelArgs(adapter.redoLabel()) : []),
    });

    function commentsAvailable() {
      return fn(adapter, 'comments') && fn(root.AISystem6ClioChartComments, 'open');
    }

    /** Commands the surface lists. A command that is not wired is not in the list; one that is wired but unavailable carries its reason. */
    function commandState(id) {
      if (s.closed) return { enabled: false, reason: '' };
      switch (id) {
        case 'file.save':
          if (s.reverting) return { enabled: false, reason: tr('clio_chart_workbook_reason_saving') };
          if (s.saving) return { enabled: false, reason: tr('clio_chart_workbook_reason_saving') };
          if (s.confirming) return { enabled: false, reason: tr('clio_chart_workbook_reason_confirming') };
          if (!isDirty()) return { enabled: false, reason: tr('clio_chart_workbook_receipt_nothing') };
          return { enabled: true };
        case 'file.revert':
          if (s.saving || s.confirming || s.reverting) return { enabled: false, reason: tr('clio_chart_workbook_reason_saving') };
          if (!isDirty()) return { enabled: false, reason: tr('clio_chart_workbook_receipt_nothing') };
          return { enabled: true };
        case 'cell.formula':
          return s.mode === 'express' ? { enabled: false, reason: tr('clio_chart_workbook_reason_express_value_only') } : { enabled: true };
        default:
          return { enabled: true };
      }
    }
    function commands() {
      const busy = s.saving || s.confirming || s.reverting;
      const sel = selection();
      const frozen = freezeInfo();
      const structure = structureReady() ? [
        { id: 'structure.rows.above', labelKey: 'clio_chart_workbook_cmd_insert_row_above', shortcut: '' },
        { id: 'structure.rows.below', labelKey: 'clio_chart_workbook_cmd_insert_row_below', shortcut: '' },
        { id: 'structure.rows.delete', labelKey: 'clio_chart_workbook_cmd_delete_rows', shortcut: '' },
        { id: 'structure.cols.left', labelKey: 'clio_chart_workbook_cmd_insert_col_left', shortcut: '' },
        { id: 'structure.cols.right', labelKey: 'clio_chart_workbook_cmd_insert_col_right', shortcut: '' },
        { id: 'structure.cols.delete', labelKey: 'clio_chart_workbook_cmd_delete_cols', shortcut: '' },
        { id: 'structure.fill.down', labelKey: 'clio_chart_workbook_cmd_fill_down', shortcut: '⌘D' },
        { id: 'structure.fill.right', labelKey: 'clio_chart_workbook_cmd_fill_right', shortcut: '⌘R' },
        sel.r > 0 || frozen ? { id: 'structure.freeze.rows', labelKey: 'clio_chart_workbook_cmd_freeze_rows', shortcut: '', checked: !!frozen && frozen.r === sel.r } : null,
        sel.c > 0 || frozen ? { id: 'structure.freeze.cols', labelKey: 'clio_chart_workbook_cmd_freeze_cols', shortcut: '', checked: !!frozen && frozen.c === sel.c } : null,
        frozen ? { id: 'structure.freeze.clear', labelKey: 'clio_chart_workbook_cmd_unfreeze', shortcut: '' } : null,
        { id: 'sheet.insert', labelKey: 'clio_chart_workbook_cmd_insert_sheet', shortcut: '' },
        { id: 'sheet.rename', labelKey: 'clio_chart_workbook_cmd_rename_sheet', shortcut: '' },
        { id: 'sheet.delete', labelKey: 'clio_chart_workbook_cmd_delete_sheet', shortcut: '' },
      ] : [];
      const list = [
        { id: 'file.save', labelKey: 'clio_chart_workbook_cmd_save', shortcut: '⌘S' },
        fn(host, 'revert') ? { id: 'file.revert', labelKey: 'clio_chart_workbook_cmd_revert', shortcut: '' } : null,
        { id: 'view.mode', labelKey: 'clio_chart_workbook_mode_full', shortcut: '⌘E', checked: s.mode === 'full' },
        { id: 'cell.value', labelKey: 'clio_chart_workbook_cmd_edit_value', shortcut: '' },
        { id: 'cell.formula', labelKey: 'clio_chart_workbook_cmd_edit_formula', shortcut: '' },
        commentsAvailable() ? { id: 'comments.open', labelKey: 'clio_chart_workbook_cmd_comments', shortcut: '⌘M' } : null,
        // N3: the shared 查找 / 替换 windoid (features/clioworks-find.js).
        { id: 'find.open', labelKey: 'clioworks_find_replace_menu', shortcut: '⌘F' },
        { id: 'find.next', labelKey: 'find_next', shortcut: '⌘G' },
        ...structure,
      ].filter(Boolean);
      return list.map((command) => {
        const structural = command.id.startsWith('structure.') || command.id.startsWith('sheet.');
        const state = structural && busy ? { enabled: false, reason: tr('clio_chart_workbook_reason_saving') } : commandState(command.id);
        return { ...command, state };
      });
    }

    /** 「复原到上次存储…」: the host re-opens the adapter from the last saved bytes. Not undoable. */
    async function revert() {
      if (!fn(host, 'revert')) return { status: 'failed', reason: 'unavailable' };
      const gate = commandState('file.revert');
      if (!gate.enabled) return { status: 'blocked', reason: gate.reason };
      let result;
      s.reverting = true;
      try { result = await host.revert(opts.mountedName); } catch (error) { result = { ok: false, message: String(error && error.message || error) }; } finally { s.reverting = false; }
      // The host swaps record.liveAdapter in place (Amendment 2); its result carries the same adapter.
      let next = null;
      if (result && result.ok) {
        const onRecord = typeof opts.readAdapter === 'function' ? opts.readAdapter() : null;
        next = onRecord && onRecord !== adapter ? onRecord : result.adapter || onRecord;
      }
      if (!next) {
        setReceipt('clio_chart_workbook_receipt_revert_failed', 'error');
        return { status: 'failed', reason: (result && result.reason) || 'failed' };
      }
      rebind(next);
      setReceipt('clio_chart_workbook_receipt_reverted', 'info');
      return { status: 'ok' };
    }
    function rebind(next) {
      adapter = next;
      localStale.clear();
      const sheets = visibleSheets();
      if (!sheets.includes(s.sheet)) s.sheet = sheets[0] || '';
    }

    /* ------------------------------------------------- structure commands (N5a) */
    const structureReady = () => fn(adapter, 'insertRows') && fn(adapter, 'deleteRows') && fn(adapter, 'insertCols') && fn(adapter, 'deleteCols');
    const BLOCK_MESSAGES = Object.freeze({
      LAST_SHEET: 'clio_chart_workbook_structure_last_sheet',
      EMPTY_NAME: 'clio_chart_workbook_structure_name_empty',
      NAME_TOO_LONG: 'clio_chart_workbook_structure_name_long',
      BAD_NAME_CHARS: 'clio_chart_workbook_structure_name_chars',
      NAME_IN_USE: 'clio_chart_workbook_structure_name_used',
      WOULD_DROP_CELLS: 'clio_chart_workbook_structure_push_off',
      BAD_LINE: 'clio_chart_workbook_receipt_bad_address',
      BAD_COUNT: 'clio_chart_workbook_receipt_bad_address',
    });
    function settleStructure(out) {
      if (out && out.status === 'blocked') {
        setReceipt(BLOCK_MESSAGES[out.code] || 'clio_chart_workbook_receipt_unavailable', 'blocked');
        return out;
      }
      if (!out || out.status !== 'ok') {
        setReceipt('clio_chart_workbook_structure_failed', 'error');
        return out || { status: 'failed' };
      }
      localStale.clear();
      // A structural change can leave the selection past the new bounds; the
      // selection follows the sheet, not the other way round.
      const ext = extent(s.sheet);
      const sel = s.selections.get(s.sheet) || { r: 0, c: 0, r2: 0, c2: 0 };
      s.selections.set(s.sheet, {
        r: Math.max(0, Math.min(sel.r, ext.rows - 1)),
        c: Math.max(0, Math.min(sel.c, ext.cols - 1)),
        r2: Math.max(0, Math.min(sel.r2 == null ? sel.r : sel.r2, ext.rows - 1)),
        c2: Math.max(0, Math.min(sel.c2 == null ? sel.c : sel.c2, ext.cols - 1)),
      });
      if (!s.saving) s.receipt = restingReceipt();
      notify();
      return out;
    }

    /** ⌘D / ⌘R over the selected range. The range needs more than one line in the fill direction. */
    function fill(direction) {
      if (s.closed || s.reverting || s.confirming) return { status: 'blocked', code: 'CLOSED' };
      if (!structureReady() || !fn(adapter, 'fillRange')) return { status: 'blocked', code: 'UNAVAILABLE' };
      const rg = session.range();
      if (direction === 'down' ? rg.r2 === rg.r1 : rg.c2 === rg.c1) {
        setReceipt(direction === 'down' ? 'clio_chart_workbook_receipt_fill_range_down' : 'clio_chart_workbook_receipt_fill_range_right', 'blocked');
        return { status: 'blocked', code: 'FILL_RANGE' };
      }
      if (s.mode === 'express') {
        // Express writes values only: a fill whose source holds formulas would be formula entry.
        for (let c = rg.c1; c <= rg.c2; c += 1) {
          for (let r = rg.r1; r <= rg.r2; r += 1) {
            const isSource = direction === 'down' ? r === rg.r1 : c === rg.c1;
            if (isSource && adapter.getCell(s.sheet, cellRef(r, c)).formula != null) {
              setReceipt('clio_chart_workbook_receipt_express_value_only', 'blocked');
              return { status: 'blocked', code: 'EXPRESS_VALUE_ONLY' };
            }
          }
        }
      }
      return settleStructure(adapter.fillRange(s.sheet, rg, direction));
    }

    /* ---------------------------------- N11: the desk clipboard's workbook half */
    // The selected rectangle as a frozen-in-waiting 表格快照: each cell's
    // computed display text, its raw value and formula, its number format, the
    // merges that fall inside the region (relative to it) and the column
    // widths. The clipboard module clones and freezes this; nothing here
    // keeps a live reference into the sheet.
    function copyRegion() {
      const rg = session.range();
      const book = fn(adapter, 'workbook') ? adapter.workbook() : null;
      const sheetObj = book && Array.isArray(book.sheets) ? book.sheets.find((item) => item && item.name === s.sheet) : null;
      const styles = book && book.styles && typeof book.styles.get === 'function' ? book.styles : null;
      const rows = [];
      for (let r = rg.r1; r <= rg.r2; r += 1) {
        const row = [];
        for (let c = rg.c1; c <= rg.c2; c += 1) {
          const ref = cellRef(r, c);
          const cell = adapter.getCell(s.sheet, ref);
          if (!cell || !cell.exists) { row.push({ text: '', v: null, f: null, nf: null }); continue; }
          let nf = null;
          if (styles && cell.style != null) {
            try { nf = styles.get(cell.style)?.nf || null; } catch (error) { nf = null; }
          }
          const shown = view(s.sheet, ref);
          row.push({
            // A not-yet-recalculated formula shows 「尚未重算」 on screen; the
            // honest copy of it is no text at all (its cached value is gone),
            // never the label and never the old number.
            text: shown.state === 'stale' ? '' : shown.text,
            v: typeof cell.value === 'number' || typeof cell.value === 'string' || typeof cell.value === 'boolean' ? cell.value : null,
            f: typeof cell.formula === 'string' ? cell.formula : null,
            nf,
          });
        }
        rows.push(row);
      }
      const merges = [];
      if (sheetObj && Array.isArray(sheetObj.merges)) {
        for (const m of sheetObj.merges) {
          if (!m || m.r1 > rg.r2 || m.r2 < rg.r1 || m.c1 > rg.c2 || m.c2 < rg.c1) continue;
          const top = Math.max(m.r1, rg.r1);
          const left = Math.max(m.c1, rg.c1);
          merges.push({ r: top - rg.r1, c: left - rg.c1, rs: Math.min(m.r2, rg.r2) - top + 1, cs: Math.min(m.c2, rg.c2) - left + 1 });
        }
      }
      const colWidths = [];
      if (sheetObj && Array.isArray(sheetObj.cols)) {
        for (let c = rg.c1; c <= rg.c2; c += 1) {
          const o = sheetObj.cols[c];
          colWidths.push(o && typeof o.w === 'number' ? o.w : null);
        }
      }
      return {
        sheet: s.sheet,
        origin: { r: rg.r1, c: rg.c1 },
        ref: `${s.sheet}!${cellRef(rg.r1, rg.c1)}:${cellRef(rg.r2, rg.c2)}`,
        rows, merges, colWidths,
      };
    }

    /**
     * Paste a region snapshot at the selection's top-left as ONE named undo
     * step. Formulas ride along in full mode with their relative references
     * shifted by the paste offset — N5a's own fill rule (ledger-structure.js
     * copyForFill), absolute references staying put; Express writes values
     * only, exactly as it refuses typed formulas.
     */
    function pasteRegion(snapshot, options = {}) {
      if (s.closed) return { status: 'blocked', code: 'CLOSED' };
      if (s.reverting) return { status: 'blocked', code: 'REVERTING' };
      if (s.confirming) return { status: 'blocked', code: 'CONFIRM_OPEN' };
      const rows = snapshot && Array.isArray(snapshot.rows) ? snapshot.rows : null;
      if (!rows || !rows.length || !rows.some((row) => Array.isArray(row) && row.length)) return { status: 'failed', code: 'EMPTY' };
      const book = fn(adapter, 'workbook') ? adapter.workbook() : null;
      const undo = book && book.undo && typeof book.undo.begin === 'function' && typeof book.undo.end === 'function' ? book.undo : null;
      if (!undo) return { status: 'blocked', code: 'UNAVAILABLE' };
      const rg = session.range();
      const label = options.label || STEP_KEYS.paste;
      const F = root.L && root.L.formula;
      const dr = snapshot.origin ? rg.r1 - snapshot.origin.r : 0;
      const dc = snapshot.origin ? rg.c1 - snapshot.origin.c : 0;
      let formulas = 0;
      const changed = [];
      undo.begin(label);
      try {
        rows.forEach((row, ri) => {
          if (!Array.isArray(row)) return;
          row.forEach((cell, ci) => {
            const r = rg.r1 + ri;
            const c = rg.c1 + ci;
            const ref = cellRef(r, c);
            let patch;
            if (s.mode === 'full' && cell && typeof cell.f === 'string' && cell.f) {
              let formula = cell.f;
              // N5a's rule: F.toText(F.shift(F.parse(f), dr, dc)); an engine that
              // cannot parse it rides the formula verbatim, as fill does.
              if ((dr || dc) && F && typeof F.parse === 'function' && typeof F.shift === 'function' && typeof F.toText === 'function') {
                try { formula = F.toText(F.shift(F.parse(cell.f), dr, dc)); } catch (error) { formula = cell.f; }
              }
              formulas += 1;
              patch = { formula, value: null, label: STEP_KEYS.formula };
            } else {
              const value = cell && typeof cell.v === 'number' ? cell.v
                : cell && typeof cell.v === 'boolean' ? cell.v
                  : cell && typeof cell.v === 'string' && cell.v ? cell.v
                    : parseValue(cell && typeof cell.text === 'string' ? cell.text : '');
              patch = { value, formula: null, label: STEP_KEYS.cell };
            }
            adapter.setCell(s.sheet, ref, patch);
            changed.push({ sheet: s.sheet, ref });
          });
        });
      } finally {
        undo.end();
      }
      for (const item of changed) {
        if (formulas) localStale.add(`${item.sheet}!${item.ref}`);
      }
      // A paste that staled anything asks for the recalculation, the one
      // commitCell rule (Q-M1-1).
      const pending = formulas || calcLoaded() || anyStale() ? recalc(changed) : null;
      notify();
      return { status: 'ok', cells: changed.length, recalc: pending };
    }

    function sheetStep(run) {
      const out = run();
      const sheets = visibleSheets();
      if (!sheets.includes(s.sheet)) s.sheet = sheets[0] || '';
      return settleStructure(out);
    }

    function freezeInfo() {
      if (!fn(adapter, 'freeze')) return null;
      try { return adapter.freeze(s.sheet); } catch (error) { return null; }
    }
    function setFreeze(r, c) {
      if (!fn(adapter, 'setFreeze')) return { status: 'blocked', code: 'UNAVAILABLE' };
      return settleStructure(adapter.setFreeze(s.sheet, r, c));
    }

    const session = {
      get adapter() { return adapter; },
      get mode() { return s.mode; },
      get sheet() { return s.sheet; },
      get receipt() { return s.receipt; },
      // N11: the desk clipboard's source reference names this workbook — the
      // module reads them off the session, the way the receipts read opts.
      get mountedName() { return opts.mountedName || ''; },
      get fileName() { return opts.fileName || ''; },
      get saving() { return s.saving; },
      get confirming() { return s.confirming; },
      get recalculating() { return s.recalcs > 0; },
      get composing() { return s.composing; },
      set composing(value) { s.composing = !!value; },
      get closed() { return s.closed; },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      notify,
      setReceipt,
      receiptText: () => (s.receipt.key ? tr(s.receipt.key, ...s.receipt.args) : ''),
      sheetNames: visibleSheets,
      selection,
      // Mode never touches the document: no save, no dirty change, selection stays.
      setMode(mode) {
        if (mode !== 'express' && mode !== 'full') throw new Error('ClioChart workbook: unknown mode ' + mode);
        if (mode === s.mode) return;
        s.mode = mode;
        settleReceipt();
        notify();
      },
      toggleMode() { session.setMode(s.mode === 'express' ? 'full' : 'express'); },
      setSheet(name) {
        if (!visibleSheets().includes(name)) return false;
        s.sheet = name;
        settleReceipt();
        notify();
        return true;
      },
      select(r, c, extend = false) {
        const prior = s.selections.get(s.sheet) || { r: 0, c: 0, r2: 0, c2: 0 };
        if (extend) s.selections.set(s.sheet, { r: prior.r, c: prior.c, r2: r, c2: c });
        else s.selections.set(s.sheet, { r, c, r2: r, c2: c });
        settleReceipt();
        notify();
      },
      /** The selected rectangle, normalised: { r1, c1, r2, c2 }. */
      range() {
        const sel = s.selections.get(s.sheet) || { r: 0, c: 0, r2: 0, c2: 0 };
        return {
          r1: Math.min(sel.r, sel.r2 == null ? sel.r : sel.r2),
          c1: Math.min(sel.c, sel.c2 == null ? sel.c : sel.c2),
          r2: Math.max(sel.r, sel.r2 == null ? sel.r : sel.r2),
          c2: Math.max(sel.c, sel.c2 == null ? sel.c : sel.c2),
        };
      },
      view,
      staleRefs,
      extent,
      commitCell,
      save,
      revert,
      rebind,
      isDirty,
      revision,
      calcLoaded,
      commandState,
      commands,
      commentsAvailable,
      editHistory,
      /* structure (N5a); a missing adapter capability is answered, never faked */
      structureReady,
      surveyLines: (axis, at, n) => (fn(adapter, 'surveyLines') ? adapter.surveyLines(s.sheet, axis, at, n) : null),
      insertRows: (at, n) => (structureReady() ? settleStructure(adapter.insertRows(s.sheet, at, n)) : { status: 'blocked', code: 'UNAVAILABLE' }),
      deleteRows: (at, n) => (structureReady() ? settleStructure(adapter.deleteRows(s.sheet, at, n)) : { status: 'blocked', code: 'UNAVAILABLE' }),
      insertCols: (at, n) => (structureReady() ? settleStructure(adapter.insertCols(s.sheet, at, n)) : { status: 'blocked', code: 'UNAVAILABLE' }),
      deleteCols: (at, n) => (structureReady() ? settleStructure(adapter.deleteCols(s.sheet, at, n)) : { status: 'blocked', code: 'UNAVAILABLE' }),
      fill,
      // N11: the desk clipboard's read/write over this sheet (the module in
      // features/clioworks-clipboard.js freezes what copyRegion returns).
      copyRegion,
      pasteRegion,
      insertSheet: () => (fn(adapter, 'insertSheet') ? sheetStep(() => adapter.insertSheet()) : { status: 'blocked', code: 'UNAVAILABLE' }),
      renameSheet: (name) => (fn(adapter, 'renameSheet') ? settleStructure(adapter.renameSheet(s.sheet, name)) : { status: 'blocked', code: 'UNAVAILABLE' }),
      deleteSheet: () => (fn(adapter, 'deleteSheet') ? sheetStep(() => adapter.deleteSheet(s.sheet)) : { status: 'blocked', code: 'UNAVAILABLE' }),
      freezeInfo,
      setFreeze,
      lastRecalc: () => lastRecalc,
      close() { s.closed = true; listeners.clear(); },
    };
    return session;
  }

  /* --------------------------------------------------------------- surface */

  function h(doc, tag, props = {}, children = []) {
    const node = doc.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of [].concat(children)) if (child != null) node.append(child.nodeType ? child : doc.createTextNode(String(child)));
    return node;
  }

  /**
   * Draw a session into the ClioChart window. Returns { unmount, focus, rebind, render }.
   * Everything this changes outside its own subtree (title text, the two hidden
   * chart parts, the window class) is put back by unmount().
   */
  function mountSurface(windowEl, session, opts = {}) {
    const doc = windowEl.ownerDocument;
    const pane = windowEl.querySelector('.clio-chart-pane');
    if (!pane) throw new Error('ClioChart workbook: the ClioChart window has no pane');
    const cleanups = [];
    const on = (target, type, listener, options) => {
      target.addEventListener(type, listener, options);
      cleanups.push(() => target.removeEventListener(type, listener, options));
    };
    let openedMenu = null;
    let cellEditor = null;
    let comments = null;
    let disposed = false;

    /* -- DOM -- */
    const receiptEl = h(doc, 'span', { class: 'status-bar-leading cwk-receipt', role: 'status', 'aria-live': 'polite' });
    const fileEl = h(doc, 'b', { class: 'cwk-file', text: opts.fileName || '' });
    // A pop-up button is the desk's own closed-set select button (.system-select-button), so every
    // appearance dresses it through its pop-up tokens: System 6's square box, Aqua's chevrons, macOS 11's well.
    const popButton = () => h(doc, 'button', { type: 'button', class: 'system-select-button cwk-pop', 'aria-haspopup': 'menu' }, [
      h(doc, 'span', { class: 'system-select-label' }),
    ]);
    const setPopLabel = (button, text) => { button.firstChild.textContent = text; };
    const sheetBtn = popButton();
    const modeBtn = popButton();
    const cmdBtn = popButton();
    const statusBar = h(doc, 'div', { class: 'details-bar app-status-bar cwk-status' }, [
      receiptEl,
      h(doc, 'span', { class: 'status-bar-context cwk-context' }, [fileEl, sheetBtn, modeBtn]),
      h(doc, 'span', { class: 'status-bar-trailing cwk-trailing' }, [cmdBtn]),
    ]);
    const addrEl = h(doc, 'input', { class: 'cwk-addr', type: 'text', spellcheck: 'false', autocomplete: 'off' });
    const cancelBtn = h(doc, 'button', { type: 'button', class: 'btn cwk-bar-button', text: '✕' });
    const okBtn = h(doc, 'button', { type: 'button', class: 'btn cwk-bar-button', text: '✓' });
    const contentEl = h(doc, 'input', { class: 'cwk-content', type: 'text', spellcheck: 'false', autocomplete: 'off' });
    const inputBar = h(doc, 'div', { class: 'cwk-input', hidden: true }, [addrEl, cancelBtn, okBtn, contentEl]);
    const tableEl = h(doc, 'table', { class: 'clio-chart-grid cwk-grid', role: 'grid' });
    const scrollEl = h(doc, 'div', { class: 'cwk-scroll' }, [tableEl]);
    const bodyEl = h(doc, 'div', { class: 'cwk-body' }, [scrollEl]);
    const captionEl = h(doc, 'p', { class: 'cwk-caption' });
    const layer = h(doc, 'div', { class: 'cwk-layer', hidden: true });
    const rootEl = h(doc, 'div', { class: 'clio-chart-workbook', dataset: { mode: session.mode } }, [statusBar, inputBar, bodyEl, captionEl, layer]);
    let tbody = null;
    // The cell the input bar's text belongs to. Moving the selection while the bar
    // has focus must not carry one cell's text into the next.
    let barRef = null;

    /* -- window chrome: hidden by one class on the window, restored on unmount -- */
    const titleEl = windowEl.querySelector('#clio-chart-title');
    const savedTitle = titleEl ? { text: titleEl.textContent, i18n: titleEl.getAttribute('data-i18n') } : null;
    if (titleEl) titleEl.removeAttribute('data-i18n');
    windowEl.classList.add('is-workbook-mounted');
    pane.append(rootEl);

    const cellAt = (r, c) => tbody && tbody.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    const selectedView = () => { const sel = session.selection(); return session.view(session.sheet, cellRef(sel.r, sel.c)); };
    const focusSelected = () => { const sel = session.selection(); cellAt(sel.r, sel.c)?.focus({ preventScroll: false }); };
    const refreshMenus = () => { if (typeof root.updateMenuState === 'function') { try { root.updateMenuState(); } catch (error) { /* menus redraw next time */ } } };

    /* -- pop-up menus: square, 1px shadow, no ▼ (Q1) -- */
    function closeMenu() {
      if (!openedMenu) return;
      const { menu, away } = openedMenu;
      openedMenu = null;
      doc.removeEventListener('pointerdown', away, true);
      menu.remove();
    }
    function openMenu(anchor, items, labelKey, point = null) {
      closeMenu();
      const menu = h(doc, 'div', { class: 'menu-popover cwk-menu', role: 'menu', 'aria-label': tr(labelKey) });
      for (const item of items) {
        const btn = h(doc, 'button', {
          type: 'button',
          role: item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem',
          class: [item.checked ? 'is-checked' : '', item.enabled === false ? 'is-disabled' : ''].filter(Boolean).join(' ') || undefined,
          dataset: { menuCommand: item.id },
        }, [
          h(doc, 'span', { class: 'cwk-menu-label' }, [item.label, item.enabled === false && item.reason ? h(doc, 'small', { text: item.reason }) : null]),
          item.shortcut ? h(doc, 'kbd', { text: item.shortcut }) : null,
        ]);
        if (item.checked !== undefined) btn.setAttribute('aria-checked', String(!!item.checked));
        if (item.enabled === false) btn.setAttribute('aria-disabled', 'true');
        btn.addEventListener('click', () => {
          if (item.enabled === false) return;
          closeMenu();
          anchor.focus();
          if (item.run) item.run();
        });
        menu.append(btn);
      }
      menu.addEventListener('keydown', (event) => {
        const buttons = [...menu.querySelectorAll('button')];
        const index = buttons.indexOf(doc.activeElement);
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); anchor.focus(); }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          buttons[(index + step + buttons.length) % buttons.length]?.focus();
        } else if (event.key === 'Tab') { closeMenu(); }
      });
      const away = (event) => { if (!menu.contains(event.target) && event.target !== anchor) closeMenu(); };
      doc.body.append(menu);
      const rect = anchor.getBoundingClientRect();
      const view = doc.defaultView;
      const x = Math.max(8, Math.min(point ? point.x : rect.left, view.innerWidth - menu.offsetWidth - 8));
      const y = Math.max(8, Math.min(point ? point.y : rect.bottom + 2, view.innerHeight - menu.offsetHeight - 8));
      menu.style.setProperty('--cwk-menu-x', `${x}px`);
      menu.style.setProperty('--cwk-menu-y', `${y}px`);
      doc.addEventListener('pointerdown', away, true);
      openedMenu = { menu, away };
      (menu.querySelector('button:not(.is-disabled)') || menu.querySelector('button'))?.focus();
    }

    /* -- typed input: Q4 leaving commits; ✕ and Esc cancel -- */
    function closeCellEditor(cancel) {
      if (!cellEditor || cellEditor.done) return null;
      const editor = cellEditor;
      editor.done = true;
      cellEditor = null;
      session.composing = false;
      const text = editor.input.value;
      editor.input.remove();
      const out = cancel ? null : session.commitCell(editor.ref, text);
      render();
      return out;
    }
    const barView = () => (barRef ? session.view(session.sheet, barRef) : selectedView());
    function barDirty() { return !inputBar.hidden && contentEl.value !== barView().raw; }
    function commitBar() {
      const v = barView();
      const out = session.commitCell(v.ref, contentEl.value);
      render();
      return out;
    }
    function cancelBar() {
      const v = selectedView();
      contentEl.value = v.raw;
      barRef = v.ref;
      syncBarButtons();
      focusSelected();
    }
    /** Commit whatever is typed on screen. Returns false when the text was refused. */
    function commitPending() {
      if (cellEditor) {
        const out = closeCellEditor(false);
        return !out || out.status === 'ok';
      }
      if (barDirty()) return commitBar().status === 'ok';
      return true;
    }
    function syncBarButtons() {
      const edited = contentEl.value !== barView().raw;
      for (const button of [okBtn, cancelBtn]) {
        button.classList.toggle('is-disabled', !edited);
        button.setAttribute('aria-disabled', String(!edited));
      }
    }

    /** Bring one row into the rendered window (and the viewport) so it can take focus. */
    function ensureRowVisible(r) {
      if (r >= windowState.first && r <= windowState.last) return;
      // A row's place in the scroll geometry is its own index times the row
      // height (frozen rows take flow space; the spacer accounts for the rows
      // the window skips). Aim just under the frozen block; focus() trims the rest.
      scrollEl.scrollTop = Math.max(0, r - frozen().r - ROW_WINDOW_BUFFER) * rowHeight;
      buildGrid();
    }
    function selectCell(r, c, focus = true, extend = false) {
      closeCellEditor(false);
      session.select(r, c, extend);
      ensureRowVisible(session.selection().r);
      render();
      if (focus) focusSelected();
    }
    function moveSelection(dr, dc, extend = false) {
      const ext = session.extent(session.sheet);
      const sel = session.selection();
      selectCell(Math.max(0, Math.min(ext.rows - 1, sel.r + dr)), Math.max(0, Math.min(ext.cols - 1, sel.c + dc)), true, extend);
    }
    function startCellEdit(initial) {
      const v = selectedView();
      if (session.mode === 'express' && v.formula != null) { session.commitCell(v.ref, v.raw); return; }
      if (session.mode === 'full') {
        contentEl.focus();
        if (initial !== undefined) { contentEl.value = initial; contentEl.setSelectionRange(initial.length, initial.length); syncBarButtons(); } else contentEl.select();
        return;
      }
      const td = cellAt(v.r, v.c);
      if (!td || cellEditor) return;
      const input = h(doc, 'input', { class: 'cwk-cellinput', type: 'text', spellcheck: 'false', autocomplete: 'off', 'aria-label': tr('clio_chart_workbook_value_input', v.ref) });
      input.value = initial !== undefined ? initial : v.raw;
      td.replaceChildren(input);
      cellEditor = { input, ref: v.ref, done: false };
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      let composing = false;
      input.addEventListener('compositionstart', () => { composing = true; session.composing = true; });
      input.addEventListener('compositionend', () => { composing = false; session.composing = false; });
      input.addEventListener('keydown', (event) => {
        if (event.isComposing || composing || event.keyCode === 229) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          // A refused value keeps the selection, so the receipt saying why stays on screen.
          const out = closeCellEditor(false);
          if (!out || out.status === 'ok') moveSelection(1, 0); else focusSelected();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeCellEditor(true);
          focusSelected();
        }
      });
      input.addEventListener('blur', () => { if (cellEditor && cellEditor.input === input) closeCellEditor(false); });
    }

    /* -- commands -- */
    async function runSave() {
      if (session.composing) return { status: 'blocked', code: 'IME_COMPOSING' };
      // ⌘S stores what is on screen: a value still being typed is committed first,
      // and a refused one stops the save.
      if (!commitPending()) return { status: 'blocked', code: 'INPUT_REFUSED' };
      const out = await session.save();
      refreshMenus();
      return out;
    }
    function toggleMode() {
      if (session.composing) return;
      // Leaving commits (Q4), in the mode the text was typed in.
      if (!commitPending()) return;
      session.toggleMode();
      refreshMenus();
      if (doc.activeElement === contentEl && inputBar.hidden) focusSelected();
    }
    async function runRevert() {
      if (!session.commandState('file.revert').enabled) return;
      const answer = typeof root.showSystemModal === 'function'
        ? await root.showSystemModal(tr('clio_chart_workbook_revert_confirm', opts.fileName || ''), 'confirm', { defaultAction: 'cancel', confirmKey: 'clio_chart_workbook_revert_button', danger: true })
        : 'cancel';
      if (answer !== 'yes') return;
      closeCellEditor(true);
      const out = await session.revert();
      if (out.status === 'ok') rebindComments();
      render();
      refreshMenus();
    }
    function openComments() {
      if (!session.commentsAvailable()) return;
      // A panel that is already open keeps its unsent draft; reopening would drop it.
      if (comments) { refreshComments(); return; }
      const sel = session.selection();
      commentsAnchor = `${session.sheet}!${cellRef(sel.r, sel.c)}`;
      comments = root.AISystem6ClioChartComments.open({
        host: rootEl,
        adapter: session.adapter,
        sheet: session.sheet,
        ref: cellRef(sel.r, sel.c),
        onChange: () => { session.notify(); refreshMenus(); },
        onClose: () => { comments = null; },
      });
    }
    // The windoid follows the selection: its composer always says which cell a new comment lands on.
    let commentsAnchor = '';
    const anchorNow = () => { const sel = session.selection(); return { sheet: session.sheet, ref: cellRef(sel.r, sel.c) }; };
    function refreshComments() {
      if (!comments || typeof comments.refresh !== 'function') return;
      const anchor = anchorNow();
      commentsAnchor = `${anchor.sheet}!${anchor.ref}`;
      comments.refresh(anchor);
    }
    function rebindComments() {
      if (!comments) return;
      try { comments.close(); } catch (error) { /* already gone */ }
      comments = null;
      openComments();
    }

    /* -- the shared 查找 / 替换 windoid (N3): the window itself lives in the lazy
       find module (features/clioworks-find.js, config.js
       ensureClioWorksFindModule); the surface hands over one cell at a time. -- */
    function openFind(next) {
      const ctx = findContext();
      const api = root.AISystem6ClioWorksFind;
      if (api && typeof api.open === 'function') { if (next) api.next(ctx); else api.open(ctx); return; }
      const ensure = root.AISystem6EnsureClioWorksFindModule;
      if (typeof ensure !== 'function') return;
      ensure().then(() => {
        const found = root.AISystem6ClioWorksFind;
        if (!found || typeof found.open !== 'function') return;
        if (next && typeof found.next === 'function') found.next(ctx);
        else found.open(ctx);
      }).catch((error) => console.warn('ClioChart workbook: find module', error));
    }
    function runCommand(id) {
      if (id === 'file.save') return runSave();
      if (id === 'file.revert') return runRevert();
      if (id === 'view.mode') return toggleMode();
      if (id === 'comments.open') return openComments();
      if (id === 'find.open') return openFind(false);
      if (id === 'find.next') return openFind(true);
      if (id === 'cell.value' || id === 'cell.formula') return startCellEdit();
      if (id === 'structure.rows.above') return applyLines('r', session.selection().r, linesTarget('r'));
      if (id === 'structure.rows.below') return applyLines('r', session.selection().r + 1, linesTarget('r'));
      if (id === 'structure.rows.delete') return applyLines('r', session.range().r1, -linesTarget('r'));
      if (id === 'structure.cols.left') return applyLines('c', session.selection().c, linesTarget('c'));
      if (id === 'structure.cols.right') return applyLines('c', session.selection().c + 1, linesTarget('c'));
      if (id === 'structure.cols.delete') return applyLines('c', session.range().c1, -linesTarget('c'));
      if (id === 'structure.fill.down') return runFill('down');
      if (id === 'structure.fill.right') return runFill('right');
      if (id === 'structure.freeze.rows') return runFreeze('rows');
      if (id === 'structure.freeze.cols') return runFreeze('cols');
      if (id === 'structure.freeze.clear') return runFreeze('clear');
      if (id === 'sheet.insert') return runInsertSheet();
      if (id === 'sheet.rename') return runRenameSheet();
      if (id === 'sheet.delete') return runDeleteSheet();
      return null;
    }

    /* -- structure commands (N5a): the confirmation names what shifts before anything runs -- */
    // A header right-click or ⌘D-sized range can name several lines at once; the
    // selection answers how many when it spans them, otherwise one.
    function linesTarget(axis) {
      const rg = session.range();
      return axis === 'r' ? rg.r2 - rg.r1 + 1 : rg.c2 - rg.c1 + 1;
    }
    const SURVEY_KINDS = Object.freeze({
      formulas: 'clio_chart_workbook_shift_formulas',
      merges: 'clio_chart_workbook_shift_merges',
      names: 'clio_chart_workbook_shift_names',
      tables: 'clio_chart_workbook_shift_tables',
      charts: 'clio_chart_workbook_shift_charts',
      cf: 'clio_chart_workbook_shift_cf',
      dv: 'clio_chart_workbook_shift_dv',
    });
    const KEPT_KINDS = Object.freeze({
      'pivot-table': 'clio_chart_workbook_kept_pivot_table',
      slicer: 'clio_chart_workbook_kept_slicer',
    });
    function surveyLines(shifts, kept) {
      const lines = Object.keys(SURVEY_KINDS)
        .filter((kind) => shifts[kind] > 0)
        .map((kind) => tr(SURVEY_KINDS[kind], shifts[kind]));
      const staying = kept.map((item) => tr(KEPT_KINDS[item.kind] || 'clio_chart_workbook_lost_kind_other', item.count));
      return { lines, staying };
    }
    async function confirmStructure(kindWord, survey) {
      const { lines, staying } = surveyLines(survey.shifts, survey.kept);
      const total = Object.keys(SURVEY_KINDS).reduce((sum, kind) => sum + (survey.shifts[kind] || 0), 0);
      // Nothing shifts and nothing stays: there is nothing to confirm.
      if (!total && !staying.length) return true;
      const message = [
        tr(kindWord),
        lines.length ? tr('clio_chart_workbook_confirm_shifts') + '\n' + lines.join('\n') : '',
        staying.length ? tr('clio_chart_workbook_confirm_kept') + '\n' + staying.join('\n') : '',
      ].filter(Boolean).join('\n\n');
      const answer = typeof root.showSystemModal === 'function'
        ? await root.showSystemModal(message, 'confirm', { defaultAction: 'cancel', confirmKey: 'clio_chart_workbook_confirm_structure', danger: kindWord.indexOf('delete') >= 0 })
        : 'cancel';
      return answer === 'yes';
    }
    function structureWords(axis, at, n) {
      const count = Math.abs(n);
      const label = axis === 'r'
        ? tr(n > 0 ? 'clio_chart_workbook_confirm_insert_rows' : 'clio_chart_workbook_confirm_delete_rows', count, at + 1)
        : tr(n > 0 ? 'clio_chart_workbook_confirm_insert_cols' : 'clio_chart_workbook_confirm_delete_cols', count, at + 1);
      return label + ' · ' + session.sheet;
    }
    async function applyLines(axis, at, signedN) {
      if (session.composing) return { status: 'blocked', code: 'IME_COMPOSING' };
      if (!commitPending()) return { status: 'blocked', code: 'INPUT_REFUSED' };
      const count = Math.abs(signedN);
      const survey = session.surveyLines(axis, at, signedN);
      if (survey && !(await confirmStructure(structureWords(axis, at, signedN), survey))) return { status: 'cancelled' };
      const out = signedN > 0
        ? (axis === 'r' ? session.insertRows(at, count) : session.insertCols(at, count))
        : (axis === 'r' ? session.deleteRows(at, count) : session.deleteCols(at, count));
      render();
      refreshMenus();
      refreshComments();
      return out;
    }
    function runFill(direction) {
      if (session.composing) return { status: 'blocked', code: 'IME_COMPOSING' };
      if (!commitPending()) return { status: 'blocked', code: 'INPUT_REFUSED' };
      const out = session.fill(direction);
      render();
      refreshMenus();
      return out;
    }
    function runFreeze(kind) {
      if (session.composing) return { status: 'blocked', code: 'IME_COMPOSING' };
      const sel = session.selection();
      const frozenNow = session.freezeInfo() || { r: 0, c: 0 };
      if (kind === 'clear') return settleFreeze(0, 0);
      if (kind === 'rows') {
        const rows = frozenNow.r === sel.r ? 0 : sel.r; // the same row freezes or unfreezes that axis
        return settleFreeze(rows, frozenNow.c);
      }
      const cols = frozenNow.c === sel.c ? 0 : sel.c;
      return settleFreeze(frozenNow.r, cols);
    }
    function settleFreeze(r, c) {
      const out = session.setFreeze(r, c);
      render();
      refreshMenus();
      return out;
    }
    async function runInsertSheet() {
      if (session.composing) return { status: 'blocked', code: 'IME_COMPOSING' };
      const out = session.insertSheet();
      render();
      refreshMenus();
      return out;
    }
    async function runRenameSheet() {
      if (session.composing) return { status: 'blocked', code: 'IME_COMPOSING' };
      const name = typeof root.showInputDialog === 'function'
        ? await root.showInputDialog({ title: tr('clio_chart_workbook_rename_title'), message: tr('clio_chart_workbook_rename_message'), defaultValue: session.sheet })
        : null;
      if (name == null) return { status: 'cancelled' };
      const out = session.renameSheet(name);
      render();
      refreshMenus();
      return out;
    }
    async function runDeleteSheet() {
      if (session.composing) return { status: 'blocked', code: 'IME_COMPOSING' };
      const answer = typeof root.showSystemModal === 'function'
        ? await root.showSystemModal(tr('clio_chart_workbook_delete_sheet_confirm', session.sheet), 'confirm', { defaultAction: 'cancel', confirmKey: 'clio_chart_workbook_delete_sheet_button', danger: true })
        : 'cancel';
      if (answer !== 'yes') return { status: 'cancelled' };
      const out = session.deleteSheet();
      render();
      refreshMenus();
      rebindComments();
      return out;
    }

    /* -- first-save list and failure alert -- */
    // The adapter reports a plain object-kind code (diagram, drawing, ...); the list says it in words (Q3).
    const LOSS_KINDS = Object.freeze({
      diagram: 'clio_chart_workbook_lost_kind_diagram',
      drawing: 'clio_chart_workbook_lost_kind_drawing',
      chart: 'clio_chart_workbook_lost_kind_chart',
      picture: 'clio_chart_workbook_lost_kind_picture',
      'comment-thread': 'clio_chart_workbook_lost_kind_comment_thread',
      sheet: 'clio_chart_workbook_lost_kind_sheet',
      signature: 'clio_chart_workbook_lost_kind_signature',
      'pivot-table': 'clio_chart_workbook_lost_kind_pivot_table',
      slicer: 'clio_chart_workbook_lost_kind_slicer',
    });
    function lossName(item) {
      const kind = String(item.kind || item.what || '');
      if (Object.prototype.hasOwnProperty.call(LOSS_KINDS, kind)) return tr(LOSS_KINDS[kind]);
      // Anything else the adapter says is either already words (older adapters) or an unnamed part.
      return kind && /\s|[^\x00-\x7f]/.test(kind) ? kind : tr('clio_chart_workbook_lost_kind_other');
    }
    function confirmList(report) {
      return new Promise((resolve) => {
        const items = (list) => {
          const shown = list.slice(0, 6).map((item) => h(doc, 'li', { text: [item.sheet && item.ref ? `${item.sheet}!${item.ref}` : item.ref || '', lossName(item)].filter(Boolean).join(' · ') }));
          if (list.length > 6) shown.push(h(doc, 'li', { text: tr('clio_chart_workbook_first_save_more', list.length - 6) }));
          return h(doc, 'ul', {}, shown);
        };
        const titleId = `cwk-first-save-${Date.now().toString(36)}`;
        const cancel = h(doc, 'button', { type: 'button', class: 'btn default', dataset: { choice: 'cancel' }, text: tr('cancel') });
        const store = h(doc, 'button', { type: 'button', class: 'btn', dataset: { choice: 'save' }, text: tr('clio_chart_workbook_cmd_save') });
        const dialog = h(doc, 'div', { class: 'cwk-alert', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, [
          h(doc, 'div', { class: 'cwk-alert-in' }, [
            h(doc, 'b', { id: titleId, text: tr('clio_chart_workbook_first_save_title', opts.fileName || '') }),
            report.converted.length ? h(doc, 'p', { text: tr('clio_chart_workbook_first_save_converted', report.converted.length) }) : null,
            report.converted.length ? items(report.converted) : null,
            report.lost.length ? h(doc, 'p', { text: tr('clio_chart_workbook_first_save_lost', report.lost.length) }) : null,
            report.lost.length ? items(report.lost) : null,
            h(doc, 'p', { class: 'cwk-alert-note', text: tr('clio_chart_workbook_first_save_note') }),
            h(doc, 'div', { class: 'cwk-alert-row' }, [cancel, store]),
          ]),
        ]);
        const previous = doc.activeElement;
        layer.replaceChildren(dialog);
        layer.hidden = false;
        const done = (choice) => {
          dialog.remove();
          layer.hidden = true;
          if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus(); else focusSelected();
          resolve(choice);
        };
        dialog.addEventListener('click', (event) => { const button = event.target.closest('button[data-choice]'); if (button) done(button.dataset.choice); });
        dialog.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); done('cancel'); return; }
          if (event.key === 'Tab') {
            event.preventDefault();
            (doc.activeElement === cancel ? store : cancel).focus();
          }
          // ⌘S and ⌘E wait while the question is open.
          if (event.metaKey || event.ctrlKey) { event.preventDefault(); event.stopPropagation(); }
        });
        // Something is converted or lost, so the default is Cancel.
        cancel.focus();
      });
    }
    async function alertFailure() {
      if (typeof root.showSystemModal === 'function') await root.showSystemModal(tr('clio_chart_workbook_save_failed', opts.fileName || ''), 'alert');
    }

    /* -- render -- */
    // The grid is virtualised: only a window of rows lives in the DOM, padded by
    // two spacer rows that hold the scrolled-out height, so a 10,000-row sheet
    // costs the same as a 50-row one. Frozen rows and columns are always in the
    // window and pinned with sticky cells.
    let rowHeight = 24;
    const COL_HEAD_PX = 40;
    const COL_PX = 104;
    const windowState = { first: 0, last: 0 };
    const frozen = () => session.freezeInfo() || { r: 0, c: 0 };
    const measureRowHeight = () => {
      const row = tbody && tbody.querySelector('tr[data-r]');
      if (row && row.offsetHeight > 4) rowHeight = row.offsetHeight;
    };
    const syncWindow = () => {
      const ext = session.extent(session.sheet);
      const next = rowWindow(ext.rows, scrollEl.scrollTop, scrollEl.clientHeight || 320, ROW_WINDOW_BUFFER, rowHeight, frozen().r);
      windowState.first = next.first;
      windowState.last = next.last;
      return { ext, ...next };
    };

    function buildGrid() {
      const { ext, first, last } = syncWindow();
      const colgroup = h(doc, 'colgroup', {}, [h(doc, 'col', { class: 'cwk-col-head' })]);
      const head = h(doc, 'tr', {}, [h(doc, 'th', { scope: 'col', class: 'cwk-corner', 'aria-label': tr('clio_chart_workbook_row_header') })]);
      for (let c = 0; c < ext.cols; c += 1) {
        colgroup.append(h(doc, 'col', { class: 'cwk-col' }));
        head.append(h(doc, 'th', { scope: 'col', dataset: { c }, text: colName(c) }));
      }
      tbody = h(doc, 'tbody');
      const fr = frozen().r;
      for (let r = 0; r < fr; r += 1) appendDataRow(r, ext, r);
      if (first > fr) tbody.append(spacerRow(first - fr, ext));
      for (let r = Math.max(first, fr); r <= last; r += 1) appendDataRow(r, ext);
      if (last < ext.rows - 1) tbody.append(spacerRow(ext.rows - 1 - last, ext));
      tableEl.replaceChildren(colgroup, h(doc, 'thead', {}, [head]), tbody);
      tableEl.dataset.sheet = session.sheet;
      tableEl.dataset.rows = String(ext.rows);
      tableEl.dataset.cols = String(ext.cols);
      tableEl.dataset.truncated = String(ext.truncated);
      measureRowHeight();
    }
    function spacerRow(rows, ext) {
      const row = h(doc, 'tr', { class: 'cwk-spacer', 'aria-hidden': 'true' }, [h(doc, 'td', { colspan: String(ext.cols + 1) })]);
      row.style.setProperty('--cwk-spacer', String(Math.max(0, rows) * rowHeight) + 'px');
      return row;
    }
    function appendDataRow(r, ext, stickyIndex = -1) {
      const fz = frozen();
      const tr_ = h(doc, 'tr', stickyIndex >= 0 ? { dataset: { r, frozen: '1' } } : { dataset: { r } });
      const headCell = h(doc, 'th', { scope: 'row', text: String(r + 1) });
      if (stickyIndex >= 0) { headCell.classList.add('cwk-frozen'); headCell.style.setProperty('--cwk-top', rowHeight + 'px'); }
      tr_.append(headCell);
      for (let c = 0; c < ext.cols; c += 1) {
        const td = h(doc, 'td', { role: 'gridcell', tabindex: '-1', dataset: { r, c } });
        if (stickyIndex >= 0) { td.classList.add('cwk-frozen'); td.style.setProperty('--cwk-top', (stickyIndex + 1) * rowHeight + 'px'); }
        if (c < fz.c) { td.classList.add('cwk-sticky-col'); td.style.setProperty('--cwk-left', (COL_HEAD_PX + c * COL_PX) + 'px'); }
        if (c === fz.c - 1) td.classList.add('cwk-col-split');
        tr_.append(td);
      }
      tbody.append(tr_);
    }
    function windowNeedsRebuild() {
      const ext = session.extent(session.sheet);
      const next = rowWindow(ext.rows, scrollEl.scrollTop, scrollEl.clientHeight || 320, ROW_WINDOW_BUFFER, rowHeight, frozen().r);
      return next.first !== windowState.first || next.last !== windowState.last;
    }
    function render() {
      if (disposed) return;
      const ext = session.extent(session.sheet);
      if (tableEl.dataset.sheet !== session.sheet || Number(tableEl.dataset.rows) !== ext.rows || Number(tableEl.dataset.cols) !== ext.cols) buildGrid();
      else if (windowNeedsRebuild()) buildGrid();
      const sel = session.selection();
      const rg = session.range();
      const stale = session.staleRefs(session.sheet);
      for (const td of tbody.querySelectorAll('td[data-r]')) {
        if (cellEditor && td.contains(cellEditor.input)) continue;
        const r = Number(td.dataset.r);
        const c = Number(td.dataset.c);
        const v = session.view(session.sheet, cellRef(r, c), stale);
        const selected = r === sel.r && c === sel.c;
        const inRange = r >= rg.r1 && r <= rg.r2 && c >= rg.c1 && c <= rg.c2;
        td.replaceChildren(doc.createTextNode(v.text));
        if (v.state === 'formula') td.append(h(doc, 'sup', { 'aria-hidden': 'true', text: 'ƒ' }));
        // The sticky classes set at build time (frozen rows and columns) survive the repaint.
        const sticky = ['cwk-frozen', 'cwk-sticky-col', 'cwk-col-split'].filter((name) => td.classList.contains(name));
        td.className = [...sticky, v.numeric ? 'is-numeric' : '', v.state === 'stale' ? 'is-stale' : '', selected ? 'is-selected' : '', inRange && !selected ? 'is-in-range' : ''].filter(Boolean).join(' ');
        td.dataset.state = v.state;
        td.setAttribute('aria-label', v.label);
        td.setAttribute('aria-selected', String(selected));
        td.tabIndex = selected ? 0 : -1;
      }
      const fz = frozen();
      tableEl.dataset.frozenRows = String(fz.r);
      tableEl.dataset.frozenCols = String(fz.c);
      if (comments) { const a = anchorNow(); if (`${a.sheet}!${a.ref}` !== commentsAnchor) refreshComments(); }
      const express = session.mode === 'express';
      rootEl.dataset.mode = session.mode;
      rootEl.dataset.receiptKind = session.receipt.kind;
      rootEl.dataset.dirty = String(session.isDirty());
      receiptEl.textContent = session.receiptText();
      setPopLabel(sheetBtn, tr('clio_chart_workbook_sheet_popup', session.sheet));
      setPopLabel(modeBtn, tr(express ? 'clio_chart_workbook_mode_express' : 'clio_chart_workbook_mode_full'));
      setPopLabel(cmdBtn, tr('clio_chart_workbook_commands'));
      if (titleEl) titleEl.textContent = tr(express ? 'clio_chart_workbook_title_express' : 'clio_chart_title');
      inputBar.hidden = express;
      const v = selectedView();
      addrEl.value = v.ref;
      if (!express && (barRef !== v.ref || doc.activeElement !== contentEl)) { contentEl.value = v.raw; barRef = v.ref; }
      syncBarButtons();
      captionEl.textContent = [
        tr(express ? (session.commentsAvailable() ? 'clio_chart_workbook_caption_express' : 'clio_chart_workbook_caption_express_plain') : 'clio_chart_workbook_caption_full'),
        fz.r || fz.c ? tr('clio_chart_workbook_caption_frozen', fz.r, fz.c) : '',
        ext.truncated ? tr('clio_chart_workbook_caption_truncated', ext.rows, ext.cols) : '',
      ].filter(Boolean).join(' · ');
    }
    function applyLabels() {
      tableEl.setAttribute('aria-label', tr('clio_chart_workbook_grid_label'));
      addrEl.setAttribute('aria-label', tr('clio_chart_workbook_address_label'));
      contentEl.setAttribute('aria-label', tr('clio_chart_workbook_content_label'));
      cancelBtn.setAttribute('aria-label', tr('clio_chart_workbook_cancel_input'));
      okBtn.setAttribute('aria-label', tr('clio_chart_workbook_accept_input'));
    }

    /* -- wiring -- */
    on(sheetBtn, 'click', () => {
      if (!commitPending()) return;
      openMenu(sheetBtn, [
        ...session.sheetNames().map((name) => ({
          id: `sheet:${name}`, label: name, checked: name === session.sheet,
          run: () => { if (session.setSheet(name)) { scrollEl.scrollTop = 0; buildGrid(); refreshComments(); focusSelected(); } },
        })),
        session.structureReady() ? { id: 'sheet.insert', label: tr('clio_chart_workbook_cmd_insert_sheet'), run: runInsertSheet } : null,
        session.structureReady() ? { id: 'sheet.rename', label: tr('clio_chart_workbook_cmd_rename_sheet'), run: runRenameSheet } : null,
        session.structureReady() ? { id: 'sheet.delete', label: tr('clio_chart_workbook_cmd_delete_sheet'), run: runDeleteSheet } : null,
      ].filter(Boolean), 'clio_chart_workbook_menu_sheets');
    });
    on(modeBtn, 'click', () => openMenu(modeBtn, [
      { id: 'view.mode.express', label: tr('clio_chart_workbook_mode_express'), checked: session.mode === 'express', run: () => { if (session.mode !== 'express') toggleMode(); } },
      { id: 'view.mode.full', label: tr('clio_chart_workbook_mode_full'), shortcut: '⌘E', checked: session.mode === 'full', run: () => { if (session.mode !== 'full') toggleMode(); } },
    ], 'clio_chart_workbook_menu_mode'));
    on(cmdBtn, 'click', () => openMenu(cmdBtn, session.commands().map((command) => ({
      id: command.id, label: tr(command.labelKey), shortcut: command.shortcut, checked: command.checked,
      enabled: command.state.enabled, reason: command.state.reason, run: () => runCommand(command.id),
    })), 'clio_chart_workbook_menu_commands'));
    let barLeaving = null;
    on(okBtn, 'pointerdown', () => { barLeaving = 'ok'; });
    on(cancelBtn, 'pointerdown', () => { barLeaving = 'cancel'; });
    on(okBtn, 'click', () => { barLeaving = null; if (okBtn.classList.contains('is-disabled')) return; const out = commitBar(); if (out.status === 'ok') focusSelected(); });
    on(cancelBtn, 'click', () => { barLeaving = null; if (cancelBtn.classList.contains('is-disabled')) return; cancelBar(); });
    on(contentEl, 'blur', () => {
      const via = barLeaving;
      barLeaving = null;
      if (via || session.composing || disposed || inputBar.hidden || !barDirty()) return;
      commitBar();
    });
    on(contentEl, 'input', syncBarButtons);
    let barComposing = false;
    on(contentEl, 'compositionstart', () => { barComposing = true; session.composing = true; });
    on(contentEl, 'compositionend', () => { barComposing = false; session.composing = false; });
    on(contentEl, 'keydown', (event) => {
      if (event.isComposing || barComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') { event.preventDefault(); const out = commitBar(); if (out.status === 'ok') moveSelection(1, 0); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelBar(); }
    });
    on(addrEl, 'keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        const addr = parseAddress(addrEl.value);
        const ext = session.extent(session.sheet);
        if (!addr || addr.r >= ext.rows || addr.c >= ext.cols) {
          session.setReceipt('clio_chart_workbook_receipt_bad_address', 'blocked');
          addrEl.value = selectedView().ref;
          return;
        }
        selectCell(addr.r, addr.c);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        addrEl.value = selectedView().ref;
        focusSelected();
      }
    });
    on(tableEl, 'click', (event) => {
      const td = event.target.closest('td[data-r]');
      if (td && !(cellEditor && td.contains(cellEditor.input))) selectCell(Number(td.dataset.r), Number(td.dataset.c), true, event.shiftKey);
    });
    on(tableEl, 'dblclick', (event) => { if (event.target.closest('td[data-r]')) startCellEdit(); });
    // The virtualised window follows the scroll: only the rows in sight are rebuilt.
    let scrollTick = false;
    on(scrollEl, 'scroll', () => {
      if (scrollTick || disposed) return;
      scrollTick = true;
      const view = doc.defaultView;
      (view && typeof view.requestAnimationFrame === 'function' ? view.requestAnimationFrame : (fn) => setTimeout(fn, 16))(() => {
        scrollTick = false;
        if (disposed) return;
        if (windowNeedsRebuild()) { buildGrid(); render(); }
      });
    });
    // Row and column headers carry their own menu (insert / delete / freeze).
    on(tableEl, 'contextmenu', (event) => {
      const th = event.target.closest('th');
      if (!th || th.classList.contains('cwk-corner')) return;
      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      if (th.getAttribute('scope') === 'row') {
        const r = Number(th.parentElement.dataset.r);
        if (Number.isInteger(r)) {
          const rg = session.range();
          const many = r >= rg.r1 && r <= rg.r2 && rg.r2 > rg.r1;
          if (!many) selectCell(r, session.selection().c, false);
          const count = many ? rg.r2 - rg.r1 + 1 : 1;
          const at = many ? rg.r1 : r;
          openMenu(th, [
            { id: 'ctx.row.above', label: tr('clio_chart_workbook_menu_insert_row_above', at + 1), run: () => applyLines('r', at, count) },
            { id: 'ctx.row.below', label: tr('clio_chart_workbook_menu_insert_row_below', at + 1), run: () => applyLines('r', at + 1, count) },
            { id: 'ctx.row.delete', label: tr('clio_chart_workbook_menu_delete_rows', count, at + 1, at + count), run: () => applyLines('r', at, -count) },
            at > 0 ? { id: 'ctx.row.freeze', label: tr('clio_chart_workbook_menu_freeze_rows', at), run: () => settleFreeze(at, (session.freezeInfo() || { c: 0 }).c) } : null,
          ].filter(Boolean), 'clio_chart_workbook_menu_rows', point);
        }
      } else if (th.getAttribute('scope') === 'col') {
        const c = Number(th.dataset.c);
        if (Number.isInteger(c)) {
          const rg = session.range();
          const many = c >= rg.c1 && c <= rg.c2 && rg.c2 > rg.c1;
          if (!many) selectCell(session.selection().r, c, false);
          const count = many ? rg.c2 - rg.c1 + 1 : 1;
          const at = many ? rg.c1 : c;
          openMenu(th, [
            { id: 'ctx.col.left', label: tr('clio_chart_workbook_menu_insert_col_left', colName(at)), run: () => applyLines('c', at, count) },
            { id: 'ctx.col.right', label: tr('clio_chart_workbook_menu_insert_col_right', colName(at)), run: () => applyLines('c', at + 1, count) },
            { id: 'ctx.col.delete', label: tr('clio_chart_workbook_menu_delete_cols', count, colName(at), colName(at + count - 1)), run: () => applyLines('c', at, -count) },
            c > 0 ? { id: 'ctx.col.freeze', label: tr('clio_chart_workbook_menu_freeze_cols', at), run: () => settleFreeze((session.freezeInfo() || { r: 0 }).r, at) } : null,
          ].filter(Boolean), 'clio_chart_workbook_menu_cols', point);
        }
      }
    });
    on(tableEl, 'keydown', (event) => {
      if (event.isComposing || event.keyCode === 229 || event.target.closest('input')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const move = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
      if (move) { event.preventDefault(); moveSelection(...move, event.shiftKey); return; }
      if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startCellEdit(); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        session.commitCell(selectedView().ref, '');
        render();
        return;
      }
      if (event.key.length === 1) { event.preventDefault(); startCellEdit(event.key); }
    });
    // ⌘E, ⌘S, ⌘M, ⌘D and ⌘R live on the surface; none is taken while an input method is composing.
    // ⌘Z is left to the desk: Edit › Undo reaches this workbook through clio-chart.js.
    on(rootEl, 'keydown', (event) => {
      if (event.isComposing || event.keyCode === 229 || session.composing) return;
      if (!commandKey(event) || event.altKey || event.shiftKey) return;
      const key = String(event.key || '').toLowerCase();
      if (key === 'e') { event.preventDefault(); toggleMode(); }
      else if (key === 's') { event.preventDefault(); runSave(); }
      else if (key === 'm' && session.commentsAvailable()) { event.preventDefault(); openComments(); }
      else if (key === 'd') { event.preventDefault(); runFill('down'); }
      else if (key === 'r') { event.preventDefault(); runFill('right'); }
      else if (key === 'f') { event.preventDefault(); runCommand('find.open'); }
      else if (key === 'g') { event.preventDefault(); runCommand('find.next'); }
      // N11: ⌘V pastes the desk's own clipboard into the sheet; an empty desk
      // board changes nothing (the grid never took ⌘V before either).
      else if (key === 'v') { event.preventDefault(); pasteFromBoard(); }
      // N11: ⌘C copies the selected region onto the desk board. A keydown is
      // the one copy a grid can promise: the browser only raises a copy event
      // for a document selection, and the cells are not one. A focused field
      // (the address bar, the comment box) keeps its own copy.
      else if (key === 'c' && !inField(event)) { event.preventDefault(); copyFromBoard(); }
    });
    /* -- N11: the desk clipboard's copy and paste. ⌘C arrives as the keydown
       above; this copy listener stands behind it for a copy the browser raises
       on its own (a document selection inside the workbook). -- */
    const inField = (event) => !!(event.target && event.target.closest && event.target.closest('input, textarea, [contenteditable="true"]'));
    on(rootEl, 'copy', (event) => {
      if (cellEditor || inField(event)) return;     // a copy inside a field is that field's own
      const clip = root.AISystem6ClioworksClipboard;
      if (!clip) return;                            // the board module is not loaded: native copy only
      const entry = clip.chartRegionFromSession(session, { fileId: opts.mountedName || opts.fileName || '', fileName: opts.fileName || '' });
      if (!entry) return;
      event.preventDefault();
      try {
        event.clipboardData.setData('text/plain', clip.plainOf(entry));
        event.clipboardData.setData('text/html', clip.htmlOf(entry));
      } catch (error) { /* the desk board already holds the copy */ }
      session.setReceipt('clio_chart_workbook_receipt_copied', 'info', [entry.source.range]);
    });
    function copyFromBoard() {
      if (cellEditor) return;
      const clip = root.AISystem6ClioworksClipboard;
      if (!clip) return;
      const entry = clip.chartRegionFromSession(session, { fileId: opts.mountedName || opts.fileName || '', fileName: opts.fileName || '' });
      if (!entry) return;
      // The system clipboard gets the two public flavours, so a paste outside
      // the desk still has the words; the board itself never leaves the desk.
      clip.writeSystem(clip.plainOf(entry), clip.htmlOf(entry));
      session.setReceipt('clio_chart_workbook_receipt_copied', 'info', [entry.source.range]);
    }
    function pasteFromBoard() {
      if (cellEditor) return;                       // the input bar's own paste is text into that field
      const clip = root.AISystem6ClioworksClipboard;
      if (!clip) return;
      const entry = clip.peek();
      if (!entry) return;                           // empty desk board: current behaviour, nothing
      let out = null;
      if (entry.kind === 'chart-region') {
        out = session.pasteRegion(entry.snapshot, { label: STEP_KEYS.paste });
      } else {
        // A ClioWrite table pastes as its cell texts; anything else (paragraphs,
        // a stage 文字条) is the one cell the selection names, as values.
        const grid = entry.kind === 'write-blocks' ? clip.tableGridOf(entry) : null;
        const single = () => {
          const plain = String(clip.plainOf(entry) || '').split(/\r\n|\r|\n/, 1)[0] || '';
          return plain ? { rows: [[{ text: plain }]] } : null;
        };
        // tableGridOf answers the grid of cell rows; pasteRegion reads a region
        // snapshot, whose rows sit one level down.
        const source = grid ? { rows: grid } : single();
        if (source) out = session.pasteRegion(source, { label: grid ? STEP_KEYS.paste_from_write : STEP_KEYS.paste });
      }
      if (out && out.status === 'ok') {
        session.setReceipt('clio_chart_workbook_receipt_pasted', 'info', [entry.source.fileName || entry.source.fileId, entry.source.range]);
        render();
      } else if (out && out.status === 'blocked') {
        setReceiptBlocked(out.code);
      }
    }
    function setReceiptBlocked(code) {
      const key = code === 'CONFIRM_OPEN' || code === 'REVERTING' ? 'clio_chart_workbook_reason_saving' : code === 'UNAVAILABLE' ? 'clio_chart_workbook_receipt_unavailable' : 'clio_chart_workbook_receipt_nothing';
      session.setReceipt(key, 'blocked');
    }

    let offSession = () => {};
    function teardown() {
      if (disposed) return;
      closeCellEditor(true);
      disposed = true;
      closeMenu();
      if (comments) { try { comments.close(); } catch (error) { /* already gone */ } comments = null; }
      offSession();
      cleanups.splice(0).forEach((off) => { try { off(); } catch (error) { /* gone */ } });
      rootEl.remove();
      windowEl.classList.remove('is-workbook-mounted');
      if (titleEl && savedTitle) {
        if (savedTitle.i18n) {
          titleEl.setAttribute('data-i18n', savedTitle.i18n);
          titleEl.textContent = tr(savedTitle.i18n);
        } else titleEl.textContent = savedTitle.text;
      }
    }
    try {
      offSession = session.subscribe(render);
      applyLabels();
      buildGrid();
      render();
    } catch (error) {
      teardown();
      throw error;
    }

    return {
      root: rootEl,
      render,
      runSave,
      runCommand,
      runFill,
      toggleMode,
      // N11: the desk clipboard's two ends, for the capture key route and the contract.
      pasteFromBoard,
      copyFromBoard,
      commitPending,
      confirmList,
      alertFailure,
      focus: focusSelected,
      // The find windoid's select-a-match: the cell, scrolled into the rendered
      // window, selected and focused (surface selectCell).
      revealCell: (r, c) => { selectCell(r, c, true); },
      afterHistory: () => { render(); refreshComments(); refreshMenus(); },
      afterRecalc: () => { refreshComments(); },
      rebindComments,
      unmount: teardown,
    };
  }

  /* -------------------------------------------------------------- the API */

  let active = null;   // { record, mountedName, fileName, session, surface }
  let opening = null;

  const nativeHost = () => root.AISystem6ClioWorks;
  function hostCalls() {
    return {
      save: fn(nativeHost(), 'saveNativeDocument') ? (name) => nativeHost().saveNativeDocument(name) : (async () => ({ ok: false, reason: 'unavailable' })),
      revert: fn(nativeHost(), 'revertNativeDocument') ? (name) => nativeHost().revertNativeDocument(name) : undefined,
    };
  }

  async function openWorkbook(record, meta = {}) {
    if (opening) await opening.catch(() => null);
    const run = openNow(record, meta);
    opening = run;
    try { return await run; } finally { if (opening === run) opening = null; }
  }

  async function openNow(record, meta) {
    const adapter = record && record.liveAdapter;
    if (!adapter || !fn(adapter, 'getCell') || !fn(adapter, 'setCell')) return { ok: false, reason: 'no-adapter' };
    const mountedName = meta.mountedName || record.mountedName || '';
    const fileName = meta.fileName || record.fileName || mountedName;
    // One session per file (S11-18): a second open brings the first forward.
    if (active && active.mountedName === mountedName) {
      if (typeof root.openWindow === 'function') await root.openWindow('clioChart');
      active.surface.focus();
      return { ok: true, reason: 'focused' };
    }
    if (active) {
      const answer = await closeWorkbook();
      if (answer === 'cancelled') return { ok: false, reason: 'cancelled' };
    }
    if (typeof root.openWindow === 'function') await root.openWindow('clioChart');
    const windowEl = root.document.querySelector('[data-window="clioChart"]');
    if (!windowEl) return { ok: false, reason: 'no-window' };
    // One editable owner per window: a chart that was writing back to a TeachText
    // block, a saved chart document or a slide copy is handed back first.
    const chart = root.AISystem6ClioChart;
    if (chart && fn(chart, 'handBack')) chart.handBack();

    const entry = { record, mountedName, fileName, session: null, surface: null };
    const session = createSession(adapter, {
      fileName,
      mountedName,
      host: hostCalls(),
      readAdapter: () => record.liveAdapter,
      confirmList: (report) => entry.surface.confirmList(report),
      alertFailure: (result) => entry.surface.alertFailure(result),
      onHistory: () => entry.surface && entry.surface.afterHistory(),
      onRecalc: () => entry.surface && entry.surface.afterRecalc(),
    });
    entry.session = session;
    try {
      entry.surface = mountSurface(windowEl, session, { fileName, mountedName });
    } catch (error) {
      session.close();
      windowEl.classList.remove('is-workbook-mounted');
      console.warn('ClioChart workbook: mount', error);
      return { ok: false, reason: 'mount-failed' };
    }
    active = entry;
    entry.surface.focus();
    // N11: the desk clipboard module rides along with the workbook, so the
    // first ⌘C finds it present (the copy event itself is synchronous).
    if (typeof root.AISystem6EnsureClioworksClipboard === 'function') root.AISystem6EnsureClioworksClipboard().catch(() => {});
    if (typeof root.updateMenuState === 'function') { try { root.updateMenuState(); } catch (error) { /* next redraw */ } }
    return { ok: true };
  }

  function unmountActive() {
    const entry = active;
    if (!entry) return;
    active = null;
    entry.surface.unmount();
    entry.session.close();
    if (typeof root.AISystem6ClioWorksFind?.close === 'function') root.AISystem6ClioWorksFind.close();
    if (typeof root.updateMenuState === 'function') { try { root.updateMenuState(); } catch (error) { /* next redraw */ } }
  }

  /** S11-14: three choices, default Cancel, Esc = Cancel. Never closes silently over unsaved work. */
  async function closeWorkbook() {
    const entry = active;
    if (!entry) return 'clean';
    // Typed-but-uncommitted input is committed first; only then is the document judged clean or dirty.
    if (!entry.surface.commitPending()) return 'cancelled';
    if (!entry.session.isDirty()) { unmountActive(); return 'clean'; }
    // The three answers wear the surface's own words (存储 / 不存储 / 取消), not the generic 保存.
    const answer = typeof root.showSystemModal === 'function'
      ? await root.showSystemModal(tr('clio_chart_workbook_unsaved_close', entry.fileName), 'confirm', { defaultAction: 'cancel', confirmKey: 'clio_chart_workbook_cmd_save', altKey: 'clio_chart_workbook_dont_save' })
      : 'cancel';
    if (active !== entry) return 'cancelled';
    if (answer === 'yes') {
      const out = await entry.surface.runSave();
      if (out.status !== 'ok' || entry.session.isDirty()) return 'cancelled';
      unmountActive();
      return 'saved';
    }
    if (answer === 'no') {
      // The edits live only in the in-memory model; dropping it is the discard.
      // The host re-reads the last saved bytes on the next open.
      if (entry.record && entry.record.liveAdapter === entry.session.adapter) entry.record.liveAdapter = null;
      unmountActive();
      return 'discarded';
    }
    return 'cancelled';
  }

  /* ------------------------------------------------- the desk's menu bar */
  // §15.2: the menu bar is the home of every wired command. Each row is a
  // runtime command that answers from the mounted session's own commandState
  // (the greyed row names its reason); a row for a command the host did not
  // wire is not listed (listed() feeds the menus' conditions).
  const MENU_COMMANDS = {
    'clio-chart-workbook-save': ['file.save', 's', 'clio_chart_workbook_cmd_save'],
    'clio-chart-workbook-mode': ['view.mode', 'e', 'clio_chart_workbook_mode_full'],
    'clio-chart-workbook-comment': ['comments.open', 'm', 'clio_chart_workbook_cmd_add_comment'],
    'clio-chart-workbook-revert': ['file.revert', '', 'clio_chart_workbook_cmd_revert'],
    // N3: the shared 查找 / 替换 windoid (features/clioworks-find.js), the keys
    // taken by the surface while a workbook is in front.
    'clio-chart-workbook-find': ['find.open', 'f', 'clioworks_find_replace_menu'],
    'clio-chart-workbook-find-next': ['find.next', 'g', 'find_next'],
  };
  /**
   * The surface the shared find windoid acts through (features/clioworks-find.js):
   * the live Ledger adapter session, the editor's own selection as a rectangle,
   * and the select-a-match that brings one cell forward. Null when no workbook
   * is mounted — the desk's Edit › 查找 rows answer through listed().
   */
  function findContext() {
    if (!active) return null;
    const entry = active;
    const surface = entry.surface;
    const session = entry.session;
    return {
      appId: 'clioChart',
      kind: 'xlsx',
      name: entry.fileName,
      adapter: session.adapter,
      doc: surface.root.ownerDocument,
      pane: surface.root,
      commitPending: () => surface.commitPending(),
      // 选中文字's box: the selected rectangle on the sheet it is on, or nothing
      // (a single cell searches the whole workbook).
      selection: () => {
        if (!surface.commitPending()) return null;
        const rg = session.range();
        return rg.r1 === rg.r2 && rg.c1 === rg.c2 ? null : { sheet: session.sheet, r1: rg.r1, c1: rg.c1, r2: rg.r2, c2: rg.c2 };
      },
      select(match) {
        const loc = match && match.locator;
        if (!loc || loc.row == null || loc.col == null) return false;
        if (session.sheet !== loc.sheet && !session.setSheet(loc.sheet)) return false;
        surface.revealCell(loc.row - 1, loc.col - 1);
        return true;
      },
      // The engine's setCell edits already counted; this is the repaint half.
      afterEdit: () => surface.afterHistory(),
    };
  }
  const listed = (commandId) => !!active && active.session.commands().some((command) => command.id === commandId);
  const chartWindowInFront = () => {
    const win = root.document && root.document.querySelector('.window.is-active[data-window]');
    return !!win && win.dataset.window === 'clioChart';
  };
  const menuCommand = (commandId) => ({
    handler: () => (active ? active.surface.runCommand(commandId) : null),
    isAvailable: () => !!active && listed(commandId) && active.session.commandState(commandId).enabled,
    unavailableReason: () => (active ? active.session.commandState(commandId).reason : ''),
  });
  root.AISystem6Runtime?.registerCommand?.('clio-chart-workbook-save', menuCommand('file.save'));
  root.AISystem6Runtime?.registerCommand?.('clio-chart-workbook-mode', menuCommand('view.mode'));
  root.AISystem6Runtime?.registerCommand?.('clio-chart-workbook-comment', menuCommand('comments.open'));
  root.AISystem6Runtime?.registerCommand?.('clio-chart-workbook-revert', menuCommand('file.revert'));
  root.AISystem6Runtime?.registerCommand?.('clio-chart-workbook-find', menuCommand('find.open'));
  root.AISystem6Runtime?.registerCommand?.('clio-chart-workbook-find-next', menuCommand('find.next'));
  // Save As… (N0) is the host's, not the session's: a new Project Hard Disk
  // file the window then edits, or a download. ⇧⌘S through the desk's table
  // (the capture listener below leaves every ⇧ combination alone).
  root.AISystem6Runtime?.registerCommand?.('clio-chart-workbook-save-as', {
    handler: () => (active && fn(nativeHost(), 'saveNativeDocumentAs') ? nativeHost().saveNativeDocumentAs(active.mountedName) : null),
    isAvailable: () => !!active && !active.session.saving && fn(nativeHost(), 'saveNativeDocumentAs'),
    unavailableReason: () => '',
  });
  // 导入 CSV… / 导出 CSV… (N15b): the parsing, the Ledger build and the BOM
  // live in the lazy CSV module (features/clio-chart-csv.js, riding the ODF
  // import loader with the other import-conversion modules); these rows only
  // pick the file and hand over the mounted session. 导入 needs a mounted
  // project (the new document lands on the Project Hard Disk), 导出 needs the
  // workbook itself.
  async function importCsvWorkbook() {
    if (typeof ensureOdf !== 'function' || typeof openTransientFilePicker !== 'function') return;
    try {
      await ensureOdf();
    } catch (error) {
      console.warn('ClioChart workbook: csv module', error);
      return;
    }
    const csv = root.AISystem6ClioChartCsv;
    if (!csv || typeof csv.importWorkbook !== 'function') return;
    openTransientFilePicker({
      accept: '.csv,.tsv,text/csv,text/tab-separated-values',
      multiple: false,
      onSelect(files) {
        const file = Array.from(files || []).find(Boolean);
        if (file) csv.importWorkbook({ file }).catch((error) => console.warn('ClioChart workbook: csv import', error));
      },
    });
  }
  async function exportCsvSheet() {
    if (!active || typeof ensureOdf !== 'function') return;
    try {
      await ensureOdf();
    } catch (error) {
      console.warn('ClioChart workbook: csv module', error);
      return;
    }
    const csv = root.AISystem6ClioChartCsv;
    if (csv && typeof csv.exportSheet === 'function') {
      await csv.exportSheet({ adapter: active.session.adapter, sheetName: active.session.sheet, fileName: active.fileName || active.mountedName });
    }
  }
  root.AISystem6Runtime?.registerCommand?.('clio-chart-workbook-import-csv', {
    handler: () => importCsvWorkbook(),
    isAvailable: () => (typeof getActiveProject === 'function' ? !!getActiveProject() : true) && typeof openTransientFilePicker === 'function',
    unavailableReason: () => (typeof getActiveProject === 'function' && !getActiveProject() ? tr('no_project_mounted') : ''),
  });
  root.AISystem6Runtime?.registerCommand?.('clio-chart-workbook-export-csv', {
    handler: () => exportCsvSheet(),
    isAvailable: () => !!active && listed('view.mode'),
    unavailableReason: () => (active ? '' : tr('clio_chart_workbook_reason_no_workbook')),
  });
  if (typeof keyboardShortcutRegistry !== 'undefined' && !keyboardShortcutRegistry.some((entry) => entry.id === 'clio-chart-workbook-save-as')) {
    keyboardShortcutRegistry.push({ id: 'clio-chart-workbook-save-as', key: 's', shift: true, action: 'clio-chart-workbook-save-as', display: '⇧⌘S', labelKey: 'clioworks_save_as', keyCaps: true, scope: ['clioChart'] });
  }
  Object.keys(MENU_COMMANDS).forEach((action) => {
    const [, key, labelKey] = MENU_COMMANDS[action];
    if (key && typeof keyboardShortcutRegistry !== 'undefined' && !keyboardShortcutRegistry.some((entry) => entry.id === action)) {
      // Shown in the menus; the keys themselves are taken below, only while a workbook is in front.
      keyboardShortcutRegistry.push({ id: action, key, ...(key === 'm' ? { code: 'KeyM' } : {}), action, display: '⌘' + key.toUpperCase(), labelKey, dispatch: false, scope: ['clioChart'] });
    }
  });
  // Focus outside the grid (the title bar, the window body) still reaches ⌘E, ⌘S,
  // ⌘M, ⌘D and ⌘R while a workbook is in front. Taken in the capture phase, so the
  // desk's Minimize (⌘M) and the chart's reverse sort (⌘R, off while a workbook
  // owns the window) find the event already handled; never while an input
  // method is composing; keys pressed inside the surface are the surface's own.
  if (root.document && fn(root.document, 'addEventListener')) {
    root.document.addEventListener('keydown', (event) => {
      if (!active || event.defaultPrevented || event.isComposing || event.keyCode === 229 || active.session.composing) return;
      if (!commandKey(event) || event.altKey || event.shiftKey) return;
      // A system dialog is a question waiting for its answer: nothing behind it is taken.
      if (root.document.body && root.document.body.classList.contains('has-system-modal')) return;
      if (active.surface.root.contains(event.target) || !chartWindowInFront()) return;
      const key = String(event.key || '').toLowerCase();
      // N11: ⌘V with the focus outside the grid still pastes the desk board.
      if (key === 'v' && fn(active.surface, 'pasteFromBoard')) {
        event.preventDefault();
        active.surface.pasteFromBoard();
        return;
      }
      const fill = key === 'd' ? 'down' : key === 'r' ? 'right' : '';
      if (fill) {
        if (!active.session.structureReady()) return;
        event.preventDefault();
        active.surface.runFill(fill);
        return;
      }
      const commandId = key === 'e' ? 'view.mode' : key === 's' ? 'file.save'
        : key === 'f' ? 'find.open' : key === 'g' ? 'find.next'
          : key === 'm' && active.session.commentsAvailable() ? 'comments.open' : '';
      if (!commandId) return;
      event.preventDefault();
      active.surface.runCommand(commandId);
    }, true);
  }

  root.AISystem6ClioChartWorkbook = Object.freeze({
    listed,
    commandState: (commandId) => (active ? active.session.commandState(commandId) : null),
    open: openWorkbook,
    close: closeWorkbook,
    current: () => (active ? { mountedName: active.mountedName, mode: active.session.mode, dirty: active.session.isDirty() } : null),
    hasUnsaved: () => !!active && active.session.isDirty(),
    // The Edit menu's history while a workbook is mounted (read by clio-chart.js).
    editHistory: () => (active ? active.session.editHistory : null),
    // N3: the surface the shared 查找 / 替换 windoid acts through, or null.
    findContext,
    // The mounted session itself, for the N5b tools (clio-chart-workbook-tools.js):
    // they read the selection and answer through the same receipts the grid shows.
    session: () => (active ? active.session : null),
    createSession,
    parseAddress,
    // Pure virtualisation math, held by contract: which rows are in the DOM.
    rowWindow,
  });
})(typeof window !== 'undefined' ? window : globalThis);
