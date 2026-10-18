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

  const MAX_ROWS = 500;
  const MAX_COLS = 26;
  const STEP_KEYS = Object.freeze({
    cell: 'clio_chart_workbook_step_cell',
    formula: 'clio_chart_workbook_step_formula',
    comment: 'clio_chart_workbook_step_comment',
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
    return /comment/i.test(text) ? STEP_KEYS.comment : STEP_KEYS.cell;
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
      return { rows: Math.min(rows, MAX_ROWS), cols: Math.min(cols, MAX_COLS), truncated: rows > MAX_ROWS || cols > MAX_COLS };
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
      const list = [
        { id: 'file.save', labelKey: 'clio_chart_workbook_cmd_save', shortcut: '⌘S' },
        fn(host, 'revert') ? { id: 'file.revert', labelKey: 'clio_chart_workbook_cmd_revert', shortcut: '' } : null,
        { id: 'view.mode', labelKey: 'clio_chart_workbook_mode_full', shortcut: '⌘E', checked: s.mode === 'full' },
        { id: 'cell.value', labelKey: 'clio_chart_workbook_cmd_edit_value', shortcut: '' },
        { id: 'cell.formula', labelKey: 'clio_chart_workbook_cmd_edit_formula', shortcut: '' },
        commentsAvailable() ? { id: 'comments.open', labelKey: 'clio_chart_workbook_cmd_comments', shortcut: '⌘M' } : null,
      ].filter(Boolean);
      return list.map((command) => ({ ...command, state: commandState(command.id) }));
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

    const session = {
      get adapter() { return adapter; },
      get mode() { return s.mode; },
      get sheet() { return s.sheet; },
      get receipt() { return s.receipt; },
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
      select(r, c) {
        s.selections.set(s.sheet, { r, c });
        settleReceipt();
        notify();
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
    function openMenu(anchor, items, labelKey) {
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
      const x = Math.max(8, Math.min(rect.left, view.innerWidth - menu.offsetWidth - 8));
      const y = Math.max(8, Math.min(rect.bottom + 2, view.innerHeight - menu.offsetHeight - 8));
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

    function selectCell(r, c, focus = true) {
      closeCellEditor(false);
      session.select(r, c);
      if (focus) focusSelected();
    }
    function moveSelection(dr, dc) {
      const ext = session.extent(session.sheet);
      const sel = session.selection();
      selectCell(Math.max(0, Math.min(ext.rows - 1, sel.r + dr)), Math.max(0, Math.min(ext.cols - 1, sel.c + dc)));
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
    function runCommand(id) {
      if (id === 'file.save') return runSave();
      if (id === 'file.revert') return runRevert();
      if (id === 'view.mode') return toggleMode();
      if (id === 'comments.open') return openComments();
      if (id === 'cell.value' || id === 'cell.formula') return startCellEdit();
      return null;
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
    function buildGrid() {
      const ext = session.extent(session.sheet);
      const colgroup = h(doc, 'colgroup', {}, [h(doc, 'col', { class: 'cwk-col-head' })]);
      const head = h(doc, 'tr', {}, [h(doc, 'th', { scope: 'col', class: 'cwk-corner', 'aria-label': tr('clio_chart_workbook_row_header') })]);
      for (let c = 0; c < ext.cols; c += 1) {
        colgroup.append(h(doc, 'col', { class: 'cwk-col' }));
        head.append(h(doc, 'th', { scope: 'col', text: colName(c) }));
      }
      tbody = h(doc, 'tbody');
      for (let r = 0; r < ext.rows; r += 1) {
        const tr_ = h(doc, 'tr', {}, [h(doc, 'th', { scope: 'row', text: String(r + 1) })]);
        for (let c = 0; c < ext.cols; c += 1) tr_.append(h(doc, 'td', { role: 'gridcell', tabindex: '-1', dataset: { r, c } }));
        tbody.append(tr_);
      }
      tableEl.replaceChildren(colgroup, h(doc, 'thead', {}, [head]), tbody);
      tableEl.dataset.sheet = session.sheet;
      tableEl.dataset.rows = String(ext.rows);
      tableEl.dataset.cols = String(ext.cols);
      tableEl.dataset.truncated = String(ext.truncated);
    }
    function render() {
      if (disposed) return;
      const ext = session.extent(session.sheet);
      if (tableEl.dataset.sheet !== session.sheet || Number(tableEl.dataset.rows) !== ext.rows || Number(tableEl.dataset.cols) !== ext.cols) buildGrid();
      const sel = session.selection();
      const stale = session.staleRefs(session.sheet);
      for (const td of tbody.querySelectorAll('td')) {
        if (cellEditor && td.contains(cellEditor.input)) continue;
        const r = Number(td.dataset.r);
        const c = Number(td.dataset.c);
        const v = session.view(session.sheet, cellRef(r, c), stale);
        const selected = r === sel.r && c === sel.c;
        td.replaceChildren(doc.createTextNode(v.text));
        if (v.state === 'formula') td.append(h(doc, 'sup', { 'aria-hidden': 'true', text: 'ƒ' }));
        td.className = [v.numeric ? 'is-numeric' : '', v.state === 'stale' ? 'is-stale' : '', selected ? 'is-selected' : ''].filter(Boolean).join(' ');
        td.dataset.state = v.state;
        td.setAttribute('aria-label', v.label);
        td.setAttribute('aria-selected', String(selected));
        td.tabIndex = selected ? 0 : -1;
      }
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
      openMenu(sheetBtn, session.sheetNames().map((name) => ({
        id: `sheet:${name}`, label: name, checked: name === session.sheet,
        run: () => { if (session.setSheet(name)) { refreshComments(); focusSelected(); } },
      })), 'clio_chart_workbook_menu_sheets');
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
      if (td && !(cellEditor && td.contains(cellEditor.input))) selectCell(Number(td.dataset.r), Number(td.dataset.c));
    });
    on(tableEl, 'dblclick', (event) => { if (event.target.closest('td[data-r]')) startCellEdit(); });
    on(tableEl, 'keydown', (event) => {
      if (event.isComposing || event.keyCode === 229 || event.target.closest('input')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const move = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
      if (move) { event.preventDefault(); moveSelection(...move); return; }
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
    // ⌘E, ⌘S and ⌘M live on the surface; none is taken while an input method is composing.
    // ⌘Z is left to the desk: Edit › Undo reaches this workbook through clio-chart.js.
    on(rootEl, 'keydown', (event) => {
      if (event.isComposing || event.keyCode === 229 || session.composing) return;
      if (!commandKey(event) || event.altKey || event.shiftKey) return;
      const key = String(event.key || '').toLowerCase();
      if (key === 'e') { event.preventDefault(); toggleMode(); }
      else if (key === 's') { event.preventDefault(); runSave(); }
      else if (key === 'm' && session.commentsAvailable()) { event.preventDefault(); openComments(); }
    });

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
      toggleMode,
      commitPending,
      confirmList,
      alertFailure,
      focus: focusSelected,
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
      entry.surface = mountSurface(windowEl, session, { fileName });
    } catch (error) {
      session.close();
      windowEl.classList.remove('is-workbook-mounted');
      console.warn('ClioChart workbook: mount', error);
      return { ok: false, reason: 'mount-failed' };
    }
    active = entry;
    entry.surface.focus();
    if (typeof root.updateMenuState === 'function') { try { root.updateMenuState(); } catch (error) { /* next redraw */ } }
    return { ok: true };
  }

  function unmountActive() {
    const entry = active;
    if (!entry) return;
    active = null;
    entry.surface.unmount();
    entry.session.close();
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
  };
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
  Object.keys(MENU_COMMANDS).forEach((action) => {
    const [, key, labelKey] = MENU_COMMANDS[action];
    if (key && typeof keyboardShortcutRegistry !== 'undefined' && !keyboardShortcutRegistry.some((entry) => entry.id === action)) {
      // Shown in the menus; the keys themselves are taken below, only while a workbook is in front.
      keyboardShortcutRegistry.push({ id: action, key, ...(key === 'm' ? { code: 'KeyM' } : {}), action, display: '⌘' + key.toUpperCase(), labelKey, dispatch: false, scope: ['clioChart'] });
    }
  });
  // Focus outside the grid (the title bar, the window body) still reaches ⌘E, ⌘S
  // and ⌘M while a workbook is in front. Taken in the capture phase, so the
  // desk's Minimize (⌘M) finds the event already handled; never while an input
  // method is composing; keys pressed inside the surface are the surface's own.
  if (root.document && fn(root.document, 'addEventListener')) {
    root.document.addEventListener('keydown', (event) => {
      if (!active || event.defaultPrevented || event.isComposing || event.keyCode === 229 || active.session.composing) return;
      if (!commandKey(event) || event.altKey || event.shiftKey) return;
      // A system dialog is a question waiting for its answer: nothing behind it is taken.
      if (root.document.body && root.document.body.classList.contains('has-system-modal')) return;
      if (active.surface.root.contains(event.target) || !chartWindowInFront()) return;
      const key = String(event.key || '').toLowerCase();
      const commandId = key === 'e' ? 'view.mode' : key === 's' ? 'file.save' : key === 'm' && active.session.commentsAvailable() ? 'comments.open' : '';
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
    createSession,
    parseAddress,
  });
})(typeof window !== 'undefined' ? window : globalThis);
