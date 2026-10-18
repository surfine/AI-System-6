/* ClioWorks S11 M0: the fifth fixture adapter, "workbook". Loaded ONLY by the
 * clioworks-v3 fixture (?fixture=clioworks-v3&adapter=workbook[&file=<name>]).
 * It is NOT the real editor; the real adapter replaces it.
 *
 * What is real here: the document model is the REAL Ledger adapter (ledger-adapter.js)
 * around the vendored VibeOffice codec. Nothing in this file fakes a workbook model.
 * What is fixture-only: the grid view, the status bar and the first-save list are the
 * candidate interface conventions (S11 spec section 15) under review, and ⌘S only
 * produces bytes and records them (mode, length, sha-256); no real file is written.
 *
 * Not in M0 (stays out of the interface, never greyed as if wired): comments,
 * calc.js recalculation, undo/redo, restore-to-last-save, export, Excel round trip.
 *
 * The file has two layers: openSession() is the pure model (also driven headless by
 * tests/features/clioworks-s11-workbook-fixture.test.mjs); createWorkbookIntegration()
 * is the DOM view and the NativeEditorAdapter + HostMenuPort shape for mountNative. */
(function (root) {
  'use strict';

  const TITLES = Object.freeze({ express: 'ClioChart Express', full: 'ClioChart' });
  const MODE_LABELS = Object.freeze({ express: 'Express', full: '完整编辑' });
  const STATE_LABELS = Object.freeze({
    empty: '空格', zero: '数字零', number: '数', text: '文字', error: '公式出错',
    stale: '尚未重算', formula: '公式算出的数',
  });
  // Package parts the model regenerates on every edit-save; a part outside this set that
  // comes back byte-identical is "kept as is" (只保留).
  const MODEL_OWNED = /^(\[Content_Types\]\.xml|.*\.rels|xl\/workbook\.xml|xl\/worksheets\/sheet\d+\.xml|xl\/sharedStrings\.xml|xl\/styles\.xml|xl\/theme\/.*|docProps\/.*)$/;

  const COMMANDS = Object.freeze([
    { id: 'file.save', label: '存储', shortcut: '⌘S', modifies: true },
    { id: 'view.mode', label: '完整编辑', shortcut: '⌘E', modifies: false },
    { id: 'cell.value', label: '改这格的值', shortcut: '', modifies: true },
    { id: 'cell.formula', label: '改这格的公式', shortcut: '', modifies: true },
  ]);

  const L = () => root.L;
  const cellName = (r, c) => L().formula.cellName(r, c);
  function parseAddress(text) {
    const m = /^\s*([A-Za-z]{1,3})([0-9]{1,7})\s*$/.exec(String(text || ''));
    if (!m) return null;
    const col = L().formula.colIndex(m[1]); // already 0-based
    const row = Number(m[2]) - 1;
    return row >= 0 && col >= 0 && col < 16384 && row < 1048576 ? { r: row, c: col, ref: cellName(row, col) } : null;
  }
  function bytesEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }
  async function sha256Hex(bytes) {
    const subtle = root.crypto && root.crypto.subtle;
    if (!subtle) return '';
    const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
    return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /* ------------------------------------------------------------------ model */

  async function openSession(bytes, meta = {}, options = {}) {
    const Ledger = root.ClioWorksLedgerAdapter;
    if (!Ledger) throw new Error('workbook-adapter: ledger-adapter.js must be loaded first');
    const led = await Ledger.open(bytes, meta);
    const wb = led.workbook();
    const listeners = new Set();
    const sheetNames = led.sheets().filter((s) => s.state === 'visible').map((s) => s.name);
    const s = {
      mode: 'express',
      sheet: sheetNames[0] || led.sheets()[0].name,
      selections: new Map(), // sheet name -> { r, c }
      selectionEpoch: 0,
      receipt: '', receiptKind: 'idle',
      saving: false, savedRev: 0, confirmedLost: -1,
      saved: [], composing: false, closed: false,
    };
    const changed = new Set();        // "sheet!r,c" keys of cells whose content the user changed
    const formulaEdited = new Set();  // subset: cells whose formula the user set
    const depCache = new Map();       // "sheet!r,c|f" -> refs
    let staleKeys = new Set();
    let originalParts = null;
    let prepared = null;              // { rev, out, plan }

    const notify = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    // A refusal or a hint is about the moment it was said in; moving on or switching mode
    // drops it back to the resting receipt instead of leaving a stale reason on screen.
    const settleReceipt = () => {
      if (s.receiptKind === 'blocked' || s.receiptKind === 'info') {
        s.receipt = led.getEditRevision() > s.savedRev ? '有未保存的修改' : '';
        s.receiptKind = led.getEditRevision() > s.savedRev ? 'dirty' : 'idle';
      }
    };
    const setReceipt = (text, kind = 'info') => { s.receipt = text; s.receiptKind = kind; notify(); };
    const keyOf = (sheet, r, c) => `${sheet}!${r},${c}`;
    const sheetObj = (name) => wb.sheets.find((sh) => sh.name === name);
    const selection = () => s.selections.get(s.sheet) || { r: 0, c: 0 };

    /* ---- dependency / "尚未重算" ------------------------------------------ */
    function refsOf(sheet, r, c, f, ast) {
      const k = `${keyOf(sheet, r, c)}|${f}`;
      if (depCache.has(k)) return depCache.get(k);
      const out = [];
      const tree = ast || L().formula.tryParse(f).ast;
      if (tree) {
        L().formula.walk(tree, (n) => {
          if (!n || typeof n !== 'object') return;
          const sh = n.sheet || sheet;
          if (n.t === 'ref') out.push({ sheet: sh, r1: n.r, c1: n.c, r2: n.r, c2: n.c });
          else if (n.t === 'area') out.push({ sheet: sh, r1: Math.min(n.r1, n.r2), c1: Math.min(n.c1, n.c2), r2: Math.max(n.r1, n.r2), c2: Math.max(n.c1, n.c2) });
        });
      }
      depCache.set(k, out);
      return out;
    }
    // calc.js is not wired into setCell yet (M1): a formula the user set, and every
    // formula that reads a changed or stale cell, has no honest cached value.
    function recomputeStale() {
      const formulas = [];
      for (const { name } of led.sheets()) {
        for (const { row, col, cell } of led.listCells(name)) {
          if (typeof cell.f === 'string') formulas.push({ sheet: name, r: row - 1, c: col - 1, f: cell.f, ast: cell.ast });
        }
      }
      const stale = new Set();
      for (const key of formulaEdited) stale.add(key);
      const hits = (refs, test) => refs.some((ref) => {
        for (const key of test) {
          const m = /^(.*)!(\d+),(\d+)$/.exec(key);
          if (m[1] === ref.sheet && +m[2] >= ref.r1 && +m[2] <= ref.r2 && +m[3] >= ref.c1 && +m[3] <= ref.c2) return true;
        }
        return false;
      });
      let grew = true;
      while (grew) {
        grew = false;
        for (const fc of formulas) {
          const key = keyOf(fc.sheet, fc.r, fc.c);
          if (stale.has(key)) continue;
          const refs = refsOf(fc.sheet, fc.r, fc.c, fc.f, fc.ast);
          if (hits(refs, changed) || hits(refs, stale)) { stale.add(key); grew = true; }
        }
      }
      staleKeys = stale;
    }

    /* ---- cell reading ----------------------------------------------------- */
    function formatNumber(styleIndex, value) {
      let code = 'General';
      try { code = wb.styles.get(styleIndex).nf || 'General'; } catch (e) { /* default style */ }
      try { return L().numfmt.text(code, value); } catch (e) { return String(value); }
    }
    function view(sheet, ref) {
      const addr = parseAddress(ref);
      const cell = led.getCell(sheet, addr.ref);
      const base = { ref: addr.ref, r: addr.r, c: addr.c, formula: null, raw: '', text: '', state: 'empty' };
      if (!cell.exists) return finish(base);
      base.formula = cell.formula;
      const v = cell.value;
      const isStale = cell.formula != null && staleKeys.has(keyOf(sheet, addr.r, addr.c));
      if (cell.formula != null) {
        base.raw = '=' + cell.formula;
        if (isStale) return finish({ ...base, state: 'stale', text: '尚未重算' });
        if (v && typeof v === 'object' && v.e) return finish({ ...base, state: 'error', text: v.e });
        if (typeof v === 'number') return finish({ ...base, state: 'formula', text: formatNumber(cell.style, v) });
        return finish({ ...base, state: v == null || v === '' ? 'formula' : 'formula', text: v == null ? '' : String(v) });
      }
      if (v == null || v === '') return finish(base);
      if (v && typeof v === 'object' && v.e) return finish({ ...base, state: 'error', text: v.e, raw: v.e });
      if (typeof v === 'number') return finish({ ...base, state: v === 0 ? 'zero' : 'number', text: formatNumber(cell.style, v), raw: String(v) });
      return finish({ ...base, state: 'text', text: String(v), raw: String(v) });
    }
    function finish(v) {
      v.label = `${v.ref}，${STATE_LABELS[v.state]}${v.text ? '，' + v.text : ''}`;
      v.numeric = v.state === 'zero' || v.state === 'number' || v.state === 'formula' || v.state === 'error';
      return v;
    }
    function extent(sheetName) {
      const sh = sheetObj(sheetName);
      const rows = Math.max((sh && sh.maxR >= 0 ? sh.maxR + 1 : 0) + 3, 14);
      const cols = Math.min(26, Math.max((sh && sh.maxC >= 0 ? sh.maxC + 1 : 0) + 2, 8));
      return { rows, cols };
    }

    /* ---- editing ---------------------------------------------------------- */
    function parseValue(text) {
      const t = String(text).trim();
      if (t === '') return { value: null };
      if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return { value: Number(t) };
      return { value: String(text) };
    }
    // One entry point for both modes. Express sets values only and answers a formula
    // cell with a receipt (no dialog, no change); full mode also sets formulas.
    function commitCell(ref, text) {
      const addr = parseAddress(ref);
      if (!addr) return { status: 'failed', code: 'BAD_ADDRESS' };
      const sheet = s.sheet;
      const before = led.getCell(sheet, addr.ref);
      const body = String(text);
      if (s.mode === 'express') {
        if (before.exists && before.formula != null) {
          const message = `${addr.ref} 是公式格 · 要改公式，⌘E 到完整编辑`;
          setReceipt(message, 'blocked');
          return { status: 'blocked', code: 'FORMULA_CELL', message };
        }
        if (body.trim().startsWith('=')) {
          const message = 'Express 只改值 · 要输入公式，⌘E 到完整编辑';
          setReceipt(message, 'blocked');
          return { status: 'blocked', code: 'EXPRESS_VALUE_ONLY', message };
        }
      }
      const key = keyOf(sheet, addr.r, addr.c);
      let patch;
      if (body.trim().startsWith('=') && body.trim().length > 1) {
        const formulaText = body.trim().slice(1);
        const parsed = L().formula.tryParse(formulaText);
        if (parsed.error) {
          const message = `${addr.ref} 的公式写不通，没有改动`;
          setReceipt(message, 'blocked');
          return { status: 'blocked', code: 'FORMULA_SYNTAX', message, detail: String(parsed.error.message || parsed.error) };
        }
        // Re-entering the same formula is not an edit: keep its cached result and the clean state.
        if (before.exists && before.formula === formulaText) return { status: 'ok', code: 'UNCHANGED' };
        // The old cached result must not ride along: drop it with the formula edit.
        patch = { formula: formulaText, value: null };
        formulaEdited.add(key);
      } else {
        const parsed = parseValue(body);
        if (before.exists && before.value === parsed.value && before.formula == null) return { status: 'ok', code: 'UNCHANGED' };
        if (!before.exists && parsed.value === null) return { status: 'ok', code: 'UNCHANGED' };
        patch = { value: parsed.value, formula: null };
        formulaEdited.delete(key);
      }
      led.setCell(sheet, addr.ref, patch);
      changed.add(key);
      recomputeStale();
      prepared = null;
      setReceipt('有未保存的修改', 'dirty');
      return { status: 'ok', ref: addr.ref, stale: [...staleKeys].filter((k) => k.startsWith(sheet + '!')).length };
    }

    /* ---- save ------------------------------------------------------------- */
    function hasUnsaved() { return led.getEditRevision() > s.savedRev; }
    async function originalPartMap() {
      if (!originalParts) originalParts = await L().zip.read(new Uint8Array(led.originalBytes()));
      return originalParts;
    }
    function classLabel(entry) {
      const place = entry.place || entry.where || '';
      if (String(entry.id || '').startsWith('unreferenced:')) return `${place}：存储后没有任何引用，会丢`;
      return entry.action === 'drop' ? `${place}：无法保留` : `${place}：会被转换`;
    }
    // The four classes of the first-save list (spec 15.3 / S11-C1).
    async function buildPlan(out) {
      const lossEntries = led.losses();
      const seen = new Set();
      const lost = [];
      for (const e of lossEntries) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        if (e.action === 'drop' || e.action === 'conversion') lost.push(e);
      }
      const lostParts = new Set(lost.map((e) => e.where));
      let editable = 0;
      for (const { name } of led.sheets()) editable += led.listCells(name).length;
      editable += led.sheets().length;
      const kept = [];
      if (out.mode === 'preserving-edit') {
        const before = await originalPartMap();
        const after = await L().zip.read(new Uint8Array(out.bytes));
        for (const [name, data] of before) {
          if (MODEL_OWNED.test(name) || lostParts.has(name)) continue;
          if (after.has(name) && bytesEqual(data, after.get(name))) kept.push(name);
        }
      }
      return {
        counts: { editable, kept: kept.length, approx: staleKeys.size, lost: lost.length },
        kept, lost: lost.map(classLabel),
        approxCells: [...staleKeys].map((k) => k.split('!')[1]),
        defaultButton: lost.length > 0 ? 'cancel' : 'save',
        mode: out.mode,
      };
    }
    async function prepareSave() {
      const rev = led.getEditRevision();
      if (prepared && prepared.rev === rev) return prepared;
      const out = await led.save();
      prepared = { rev, out, plan: await buildPlan(out) };
      return prepared;
    }
    // Needs the first-save confirmation when this save would list something the writer
    // has not shown before. Pass { confirm: true } after the user pressed 存储.
    async function save(opts = {}) {
      if (s.saving) return { status: 'blocked', code: 'SAVE_IN_FLIGHT', message: '正在存储，请稍候' };
      const rev = led.getEditRevision();
      // Claimed before encoding: the same candidate is never submitted twice (S11-20).
      s.saving = true;
      setReceipt('存储中，仍可输入', 'saving');
      let prep;
      try { prep = await prepareSave(); } catch (error) {
        s.saving = false;
        setReceipt(`没存成：${String(error && error.message || error)}`, 'error');
        return { status: 'failed', code: 'ENCODE_FAILED', message: String(error && error.message || error) };
      }
      const needsList = prep.out.mode === 'preserving-edit' && (s.confirmedLost < 0 || prep.plan.counts.lost > s.confirmedLost);
      if (needsList && !opts.confirm) {
        s.saving = false;
        s.receipt = '有未保存的修改';
        s.receiptKind = 'dirty';
        notify();
        return { status: 'needs-confirm', plan: prep.plan };
      }
      try {
        const bytes = new Uint8Array(prep.out.bytes);
        const info = { name: led.name, mode: prep.out.mode, byteLength: bytes.length, sha256: await sha256Hex(bytes), rev };
        if (options.sink) await options.sink(bytes, info);
        s.saved.push(info);
        s.savedRev = rev;
        if (needsList) s.confirmedLost = prep.plan.counts.lost;
        s.saving = false;
        if (led.getEditRevision() > rev) setReceipt('已存储较早的修改，还有新修改', 'saved-older');
        else setReceipt(`已存到「${led.name}」`, 'saved');
        return { status: 'ok', mode: prep.out.mode, info };
      } catch (error) {
        s.saving = false;
        const message = String(error && error.message || error);
        setReceipt(`没存成：${message}，修改还在窗口里`, 'error');
        return { status: 'failed', code: 'SINK_FAILED', message };
      }
    }

    /* ---- commands --------------------------------------------------------- */
    // Wired-but-unavailable commands are returned disabled with a reason; commands that
    // are not wired in M0 (undo, comments, restore, export) are simply not in COMMANDS.
    function commandState(id) {
      if (s.closed) return { enabled: false, reason: '文件已关闭' };
      switch (id) {
        case 'file.save':
          if (s.saving) return { enabled: false, reason: '正在存储，请稍候' };
          if (!hasUnsaved()) return { enabled: false, reason: '没有未存的修改' };
          return { enabled: true };
        case 'view.mode': return { enabled: true };
        case 'cell.value': return { enabled: true };
        case 'cell.formula':
          return s.mode === 'express' ? { enabled: false, reason: 'Express 只改值，⌘E 到完整编辑' } : { enabled: true };
        default: return { enabled: false, reason: '此命令尚未接入' };
      }
    }

    const session = {
      ledger: led,
      get mode() { return s.mode; },
      get sheet() { return s.sheet; },
      get receipt() { return s.receipt; },
      get receiptKind() { return s.receiptKind; },
      get saving() { return s.saving; },
      get composing() { return s.composing; },
      set composing(v) { s.composing = !!v; },
      get selectionEpoch() { return s.selectionEpoch; },
      selection,
      sheetNames: () => sheetNames.slice(),
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      setReceipt,
      // Mode never touches the document: no save, no dirty change, selection stays.
      setMode(mode) {
        if (mode !== 'express' && mode !== 'full') throw new Error('workbook-adapter: unknown mode ' + mode);
        if (mode === s.mode) return;
        s.mode = mode;
        settleReceipt();
        notify();
      },
      toggleMode() { session.setMode(s.mode === 'express' ? 'full' : 'express'); },
      setSheet(name) {
        if (!sheetNames.includes(name)) throw new Error('workbook-adapter: unknown sheet ' + name);
        s.sheet = name;
        notify();
      },
      select(r, c) {
        s.selections.set(s.sheet, { r, c });
        s.selectionEpoch += 1;
        settleReceipt();
        notify();
      },
      view, extent, commitCell, save, prepareSave, hasUnsaved, commandState,
      isDirty: () => led.isDirty(),
      editRevision: () => led.getEditRevision(),
      staleCells: () => [...staleKeys],
      losses: () => led.losses(),
      saved: () => s.saved.slice(),
      commands: () => COMMANDS.map((c) => ({ ...c, state: commandState(c.id) })),
      close() { s.closed = true; notify(); },
    };
    recomputeStale();
    return session;
  }

  /* ------------------------------------------------------------------- view */

  const STYLE_ID = 'cwb-style';
  const CSS = `
.cwb{display:flex;flex-direction:column;position:absolute;inset:0;min-inline-size:0;min-block-size:0;background:var(--paper,#fff);color:var(--ink,#000);font:12px var(--ui-font,sans-serif)}
.cwb-bar{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:10px;flex:none;padding:3px 8px;border-block-end:1px solid var(--ink,#000)}
.cwb-receipt{min-inline-size:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cwb-mid{display:flex;gap:8px;align-items:center}
.cwb-right{justify-self:end}
.cwb-pop{box-shadow:1px 1px 0 var(--ink,#000);font-weight:700}
.cwb-input{display:flex;align-items:center;gap:8px;flex:none;padding:3px 8px;border-block-end:1px solid var(--ink,#000)}
.cwb-input[hidden]{display:none}
.cwb .cwb-input .cwb-addr{flex:none;inline-size:64px;min-inline-size:0;font:12px ui-monospace,monospace;border:1px solid var(--ink,#000);padding:0 6px;box-sizing:border-box}
.cwb .cwb-input .cwb-content{flex:1 1 0;inline-size:auto;min-inline-size:0;box-sizing:border-box;font:12px ui-monospace,monospace;border:2px solid var(--ink,#000);padding:0 6px;line-height:18px;background:var(--field-bg,#fff);color:inherit}
.cwb-scroll{flex:1;min-block-size:0;overflow:auto}
.cwb-grid{border-collapse:collapse;table-layout:fixed;min-inline-size:100%}
.cwb-grid th,.cwb-grid td{border:1px solid color-mix(in srgb,var(--ink,#000) 35%,transparent);block-size:24px;padding:0 7px;white-space:nowrap;overflow:hidden;text-overflow:clip;box-sizing:border-box}
.cwb-grid th{font-size:11px;font-weight:700;text-align:center;border-color:var(--ink,#000);background:var(--paper,#fff)}
.cwb-grid col.c0{inline-size:36px}.cwb-grid col.cn{inline-size:110px}
.cwb-grid td.num{text-align:end;font-family:ui-monospace,monospace}
.cwb-grid td.is-selected{box-shadow:inset 0 0 0 2px var(--ink,#000)}
.cwb-grid td.is-stale{outline:2px dashed var(--ink,#000);outline-offset:-3px;font-size:11px}
.cwb-grid td[data-state=text]{text-align:start}
.cwb-grid td:focus-visible{outline:2px solid var(--system-focus-outline,var(--ink,#000));outline-offset:-2px}
.cwb-grid td.is-stale:focus-visible{outline-style:dashed}
.cwb-grid sup{font-size:9px}
.cwb-cellinput{inline-size:100%;block-size:100%;box-sizing:border-box;border:0;padding:0;margin:0;font:inherit;background:var(--field-bg,#fff);color:inherit;outline:2px solid var(--ink,#000)}
.cwb-cap{flex:none;display:flex;justify-content:space-between;gap:12px;padding:2px 8px;font-size:11px;border-block-start:1px solid var(--ink,#000)}
.cwb-layer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:5}
.cwb-layer[hidden]{display:none}
.cwb-alert{background:var(--paper,#fff);color:var(--ink,#000);border:1px solid var(--ink,#000);padding:1px;max-inline-size:min(440px,92%)}
.cwb-alert>.in{border:2px solid var(--ink,#000);padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.cwb-alert dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0}
.cwb-alert dt{font-weight:700}
.cwb-alert dd{margin:0}
.cwb-alert ul{margin:2px 0 0;padding-inline-start:16px}
.cwb-alert .row{display:flex;justify-content:flex-end;gap:10px}
.cwb-alert .btn.default{outline:3px solid var(--ink,#000);outline-offset:1px;border-radius:11px}
.cwb-menu{position:fixed}
.cwb-menu button[aria-checked=true]::before{content:"✓ "}
.cwb-menu kbd{margin-inline-start:16px;font:inherit;opacity:.7}
.cwb-menu small{display:block;font-size:11px;opacity:.8}
`;

  function h(doc, tag, props = {}, children = []) {
    const node = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const child of [].concat(children)) if (child != null) node.append(child.nodeType ? child : doc.createTextNode(String(child)));
    return node;
  }

  async function createWorkbookIntegration(hostWindow, { bytes, name = 'budget-s11.xlsx', sink, confirmFirstSave } = {}) {
    const doc = hostWindow.document;
    const session = await openSession(bytes, { name, documentId: 'fixture:' + name, generation: 1 }, { sink });
    let disposed = false;
    const listeners = new Set();
    const cleanups = [];
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)); };
    const notifyHost = () => { if (!disposed) listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); };
    session.subscribe(() => { if (!disposed) { render(); notifyHost(); } });

    const state = {
      kind: 'chart', documentId: 'fixture:' + name, sessionId: 'cwb-' + Math.random().toString(36).slice(2, 8),
      generation: 1, readonly: false, writeAllowed: true, closed: false, canUndo: false, canRedo: false,
    };
    const supported = ['file.save', 'view.mode', 'cell.value', 'cell.formula'];

    /* dom refs, filled by mountEditor */
    let root_, receiptEl, nameEl, sheetBtn, modeBtn, cmdBtn, inputBar, addrEl, okBtn, cancelBtn, contentEl, tbody, tableEl, capEl, layer;
    let titleEl = null, savedTitle = null, hidden = [];
    let openedMenu = null;
    let cellEditor = null;

    const cellAt = (r, c) => tbody && tbody.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    function closeMenu() { if (openedMenu) { openedMenu.remove(); openedMenu = null; } }
    function openMenu(anchor, items, label) {
      closeMenu();
      const menu = h(doc, 'div', { class: 'menu-popover cw3-more-menu cwb-menu', role: 'menu', 'aria-label': label });
      for (const item of items) {
        const btn = h(doc, 'button', {
          type: 'button', role: item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem',
          title: item.reason || '', dataset: { menuCommand: item.id },
        }, [h(doc, 'span', { text: item.label }), item.shortcut ? h(doc, 'kbd', { text: item.shortcut }) : null,
          item.enabled === false && item.reason ? h(doc, 'small', { text: item.reason }) : null]);
        if (item.checked !== undefined) btn.setAttribute('aria-checked', String(!!item.checked));
        if (item.enabled === false) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
        btn.addEventListener('click', () => { closeMenu(); item.run && item.run(); });
        menu.append(btn);
      }
      doc.body.append(menu);
      menu.style.display = 'block';
      const rect = anchor.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(rect.left, hostWindow.innerWidth - menu.offsetWidth - 8)) + 'px';
      menu.style.top = Math.max(8, Math.min(rect.bottom + 2, hostWindow.innerHeight - menu.offsetHeight - 8)) + 'px';
      openedMenu = menu;
      menu.querySelector('button:not(:disabled)')?.focus();
      const close = (e) => { if (!menu.contains(e.target) && e.target !== anchor) { closeMenu(); doc.removeEventListener('pointerdown', close, true); } };
      doc.addEventListener('pointerdown', close, true);
      menu.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeMenu(); anchor.focus(); }
      });
    }

    /* ---- commands, shared by shortcut, popup and mountNative ---- */
    function toggleMode() { session.toggleMode(); }
    let confirming = false;
    async function runSave() {
      // ⌘S stores what is on screen: a value still being typed is committed first.
      if (cellEditor) {
        const typed = closeCellEditor(false);
        if (typed && typed.status !== 'ok') return typed;
      } else if (contentEl && session.mode === 'full' && contentEl.value !== selectedCell().raw) {
        const typed = commitBar();
        if (typed.status !== 'ok') return typed;
      }
      if (confirming) return { status: 'blocked', code: 'SAVE_IN_FLIGHT', message: '正在等存储确认' };
      const first = await session.save();
      if (first.status !== 'needs-confirm') return first;
      confirming = true;
      let choice;
      try { choice = await (confirmFirstSave ? confirmFirstSave(first.plan) : askKeepList(first.plan)); }
      finally { confirming = false; }
      if (choice !== 'save') { session.setReceipt('没有存储', 'info'); return { status: 'cancelled' }; }
      return session.save({ confirm: true });
    }
    function askKeepList(plan) {
      return new Promise((resolve) => {
        const c = plan.counts;
        const defaultSave = plan.defaultButton === 'save';
        const lostList = plan.lost.slice(0, 4);
        const dialog = h(doc, 'div', { class: 'cwb-alert', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'cwb-alert-title' }, [
          h(doc, 'div', { class: 'in' }, [
            h(doc, 'b', { id: 'cwb-alert-title', text: `第一次存储「${name}」，先看一下哪些会变` }),
            h(doc, 'dl', {}, [
              h(doc, 'dt', { text: `仍可编辑 ${c.editable}` }), h(doc, 'dd', { text: '单元格与工作表，存下来照样能改' }),
              h(doc, 'dt', { text: `只保留 ${c.kept}` }), h(doc, 'dd', { text: '原样带回，在这里改不了' }),
              h(doc, 'dt', { text: `近似显示 ${c.approx}` }), h(doc, 'dd', { text: c.approx ? `${c.approx} 个公式格存下的是尚未重算的缓存` : '没有' }),
              h(doc, 'dt', { text: `转换或丢失 ${c.lost}` }),
              h(doc, 'dd', {}, c.lost ? [h(doc, 'ul', {}, lostList.map((t) => h(doc, 'li', { text: t })))] : ['没有']),
            ]),
            h(doc, 'div', { class: 'row' }, [
              h(doc, 'button', { type: 'button', class: 'btn' + (defaultSave ? '' : ' default'), dataset: { choice: 'cancel' }, text: '取消' }),
              h(doc, 'button', { type: 'button', class: 'btn' + (defaultSave ? ' default' : ''), dataset: { choice: 'save' }, text: '存储' }),
            ]),
          ]),
        ]);
        layer.append(dialog);
        layer.hidden = false;
        const prevFocus = doc.activeElement;
        const done = (choice) => { dialog.remove(); layer.hidden = true; prevFocus && prevFocus.focus && prevFocus.focus(); resolve(choice); };
        dialog.addEventListener('click', (e) => { const b = e.target.closest('button[data-choice]'); if (b) done(b.dataset.choice); });
        dialog.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') { e.preventDefault(); done('cancel'); }
          if (e.key === 'Tab') {
            const bs = [...dialog.querySelectorAll('button')];
            const i = bs.indexOf(doc.activeElement);
            e.preventDefault();
            bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
          }
        });
        dialog.querySelector('.btn.default').focus();
      });
    }

    /* ---- editing UI ---- */
    function selectedCell() { const sel = session.selection(); return session.view(session.sheet, cellName(sel.r, sel.c)); }
    function selectCell(r, c, focus = true) {
      closeCellEditor(true);
      session.select(r, c);
      const td = cellAt(r, c);
      if (td && focus) td.focus({ preventScroll: false });
    }
    function startCellEdit(initial) {
      const v = selectedCell();
      if (session.mode === 'express' && v.formula != null) { session.commitCell(v.ref, v.raw); return; }
      if (session.mode === 'full') {
        contentEl.focus();
        if (initial !== undefined) { contentEl.value = initial; contentEl.setSelectionRange(initial.length, initial.length); syncBarState(); } else contentEl.select();
        return;
      }
      const td = cellAt(v.r, v.c);
      if (!td || cellEditor) return;
      const input = h(doc, 'input', { class: 'cwb-cellinput', type: 'text', 'aria-label': `${v.ref} 的值`, value: initial !== undefined ? initial : v.raw });
      input.value = initial !== undefined ? initial : v.raw;
      td.textContent = '';
      td.append(input);
      cellEditor = { input, ref: v.ref, done: false };
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      let composing = false;
      input.addEventListener('compositionstart', () => { composing = true; session.composing = true; });
      input.addEventListener('compositionend', () => { composing = false; session.composing = false; });
      input.addEventListener('keydown', (e) => {
        if (e.isComposing || composing || e.keyCode === 229) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          // A refused value keeps the selection, so the receipt saying why stays on screen.
          const out = closeCellEditor(false);
          if (!out || out.status === 'ok') moveSelection(1, 0);
        }
        else if (e.key === 'Escape') { e.preventDefault(); closeCellEditor(true); td.focus(); }
      });
      input.addEventListener('blur', () => closeCellEditor(false));
    }
    function closeCellEditor(cancel) {
      if (!cellEditor || cellEditor.done) return;
      const ed = cellEditor;
      ed.done = true;
      cellEditor = null;
      const text = ed.input.value;
      ed.input.remove();
      const out = cancel ? null : session.commitCell(ed.ref, text);
      render();
      const sel = session.selection();
      cellAt(sel.r, sel.c)?.focus();
      return out;
    }
    function moveSelection(dr, dc) {
      const ext = session.extent(session.sheet);
      const sel = session.selection();
      selectCell(Math.max(0, Math.min(ext.rows - 1, sel.r + dr)), Math.max(0, Math.min(ext.cols - 1, sel.c + dc)));
    }
    function syncBarState() {
      if (!contentEl) return;
      const v = selectedCell();
      const edited = contentEl.value !== v.raw;
      okBtn.disabled = !edited;
      cancelBtn.disabled = !edited;
    }
    function commitBar() {
      const v = selectedCell();
      const out = session.commitCell(v.ref, contentEl.value);
      render();
      if (out.status === 'ok') cellAt(v.r, v.c)?.focus();
      return out;
    }
    function cancelBar() { contentEl.value = selectedCell().raw; syncBarState(); cellAt(...Object.values(session.selection()))?.focus(); }

    /* ---- render ---- */
    function buildGrid() {
      const ext = session.extent(session.sheet);
      tableEl.replaceChildren();
      const colgroup = h(doc, 'colgroup', {}, [h(doc, 'col', { class: 'c0' })]);
      const head = h(doc, 'tr', {}, [h(doc, 'th', { scope: 'col', 'aria-label': '行号' })]);
      for (let c = 0; c < ext.cols; c += 1) {
        colgroup.append(h(doc, 'col', { class: 'cn' }));
        head.append(h(doc, 'th', { scope: 'col', text: L().formula.colName(c) }));
      }
      tbody = h(doc, 'tbody');
      for (let r = 0; r < ext.rows; r += 1) {
        const tr = h(doc, 'tr', {}, [h(doc, 'th', { scope: 'row', text: String(r + 1) })]);
        for (let c = 0; c < ext.cols; c += 1) tr.append(h(doc, 'td', { role: 'gridcell', tabindex: '-1', dataset: { r, c } }));
        tbody.append(tr);
      }
      tableEl.append(colgroup, h(doc, 'thead', {}, [head]), tbody);
      tableEl.dataset.sheet = session.sheet;
    }
    function render() {
      if (!root_ || disposed) return;
      if (tableEl.dataset.sheet !== session.sheet) buildGrid();
      const sel = session.selection();
      for (const td of tbody.querySelectorAll('td')) {
        if (cellEditor && td.contains(cellEditor.input)) continue;
        const r = +td.dataset.r, c = +td.dataset.c;
        const v = session.view(session.sheet, cellName(r, c));
        td.replaceChildren();
        td.append(doc.createTextNode(v.text));
        if (v.state === 'formula') td.append(h(doc, 'sup', { 'aria-hidden': 'true', text: 'ƒ' }));
        td.className = [v.numeric ? 'num' : '', v.state === 'stale' ? 'is-stale' : '', r === sel.r && c === sel.c ? 'is-selected' : ''].filter(Boolean).join(' ');
        td.dataset.state = v.state;
        td.setAttribute('aria-label', v.label);
        td.setAttribute('aria-selected', String(r === sel.r && c === sel.c));
        td.tabIndex = r === sel.r && c === sel.c ? 0 : -1;
      }
      const express = session.mode === 'express';
      receiptEl.textContent = session.receipt;
      root_.dataset.receiptKind = session.receiptKind;
      sheetBtn.textContent = `工作表：${session.sheet}`;
      modeBtn.textContent = MODE_LABELS[session.mode];
      root_.dataset.mode = session.mode;
      inputBar.hidden = express;
      if (titleEl) titleEl.textContent = TITLES[session.mode];
      const v = selectedCell();
      addrEl.value = v.ref;
      if (!express && doc.activeElement !== contentEl) contentEl.value = v.raw;
      syncBarState();
      capEl.firstChild.textContent = express
        ? 'Express：只改单元格的值 · 要改公式，⌘E 到完整编辑'
        : '完整编辑：值与公式 · 公式改过的格显示「尚未重算」，重算在后续增量';
      const last = session.saved().slice(-1)[0];
      root_.dataset.saveMode = last ? last.mode : '';
    }

    function openCommands(anchor) {
      const items = session.commands().map((c) => {
        if (c.id === 'view.mode') return { id: c.id, label: c.label, shortcut: c.shortcut, checked: session.mode === 'full', enabled: true, run: toggleMode };
        const run = c.id === 'file.save' ? () => runSave()
          : () => { if (c.id === 'cell.formula') startCellEdit(); else startCellEdit(); };
        return { id: c.id, label: c.label, shortcut: c.shortcut, enabled: c.state.enabled, reason: c.state.reason, run };
      });
      openMenu(anchor, items, '命令');
    }

    /* ---- NativeEditorAdapter ---- */
    const adapter = {
      getContext() {
        return {
          ...state, editRevision: session.editRevision(), selectionEpoch: session.selectionEpoch,
          composing: session.composing, saving: session.saving, dirty: session.hasUnsaved(), mode: session.mode,
          supported, active: !state.closed, mayRestoreFocus: !session.composing, modalOpen: false,
        };
      },
      async execute(command) {
        if (disposed) return { status: 'blocked', code: 'DISPOSED' };
        if (session.composing) return { status: 'blocked', code: 'IME_COMPOSING', message: '输入法组字中，命令延后。' };
        const gate = session.commandState(command);
        if (!gate.enabled) return { status: 'blocked', code: 'COMMAND_DISABLED', message: gate.reason };
        if (command === 'view.mode') { toggleMode(); return { status: 'ok' }; }
        if (command === 'file.save') {
          const out = await runSave();
          return out.status === 'ok' ? { status: 'ok' } : out.status === 'cancelled' ? { status: 'cancelled' } : { status: out.status === 'blocked' ? 'blocked' : 'failed', code: out.code, message: out.message };
        }
        if (command === 'cell.value' || command === 'cell.formula') { startCellEdit(); return { status: 'ok' }; }
        return { status: 'blocked', code: 'NOT_WIRED', message: '此命令尚未接入真实能力，保持停用。' };
      },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      mountEditor(target) {
        if (!doc.getElementById(STYLE_ID)) doc.head.append(h(doc, 'style', { id: STYLE_ID, text: CSS }));
        receiptEl = h(doc, 'span', { class: 'cwb-receipt', 'aria-live': 'polite', role: 'status' });
        nameEl = h(doc, 'b', { text: name });
        sheetBtn = h(doc, 'button', { type: 'button', class: 'btn cwb-pop', 'aria-haspopup': 'menu' });
        modeBtn = h(doc, 'button', { type: 'button', class: 'btn cwb-pop', 'aria-haspopup': 'menu' });
        cmdBtn = h(doc, 'button', { type: 'button', class: 'btn', 'aria-haspopup': 'menu', text: '命令…' });
        const bar = h(doc, 'div', { class: 'cwb-bar' }, [receiptEl, h(doc, 'span', { class: 'cwb-mid' }, [nameEl, sheetBtn, modeBtn]), h(doc, 'span', { class: 'cwb-right' }, [cmdBtn])]);
        addrEl = h(doc, 'input', { class: 'cwb-addr', type: 'text', 'aria-label': '单元格地址' });
        cancelBtn = h(doc, 'button', { type: 'button', class: 'btn', 'aria-label': '取消输入', text: '✕' });
        okBtn = h(doc, 'button', { type: 'button', class: 'btn', 'aria-label': '确认输入', text: '✓' });
        contentEl = h(doc, 'input', { class: 'cwb-content', type: 'text', 'aria-label': '单元格内容' });
        inputBar = h(doc, 'div', { class: 'cwb-input', hidden: true }, [addrEl, cancelBtn, okBtn, contentEl]);
        tableEl = h(doc, 'table', { class: 'cwb-grid', role: 'grid', 'aria-label': '工作表' });
        const scroll = h(doc, 'div', { class: 'cwb-scroll' }, [tableEl]);
        capEl = h(doc, 'div', { class: 'cwb-cap' }, [h(doc, 'span')]);
        layer = h(doc, 'div', { class: 'cwb-layer', hidden: true });
        root_ = h(doc, 'div', { class: 'cwb', dataset: { cwbMounted: 'true' } }, [bar, inputBar, scroll, capEl, layer]);
        target.append(root_);
        buildGrid();

        titleEl = doc.getElementById('clio-chart-title');
        if (titleEl) savedTitle = titleEl.textContent;

        on(sheetBtn, 'click', () => openMenu(sheetBtn, session.sheetNames().map((n) => ({ id: 'sheet:' + n, label: n, checked: n === session.sheet, run: () => { session.setSheet(n); } })), '工作表'));
        on(modeBtn, 'click', () => openMenu(modeBtn, [{ id: 'view.mode', label: '完整编辑', shortcut: '⌘E', checked: session.mode === 'full', run: toggleMode }], '模式'));
        on(cmdBtn, 'click', () => openCommands(cmdBtn));
        on(okBtn, 'click', commitBar);
        on(cancelBtn, 'click', cancelBar);
        let barLeaving = null;
        on(okBtn, 'pointerdown', () => { barLeaving = 'ok'; });
        on(cancelBtn, 'pointerdown', () => { barLeaving = 'cancel'; });
        on(contentEl, 'blur', () => {
          const via = barLeaving;
          barLeaving = null;
          if (via || session.composing || contentEl.value === selectedCell().raw) return;
          commitBar();
        });
        on(contentEl, 'input', syncBarState);
        let barComposing = false;
        on(contentEl, 'compositionstart', () => { barComposing = true; session.composing = true; });
        on(contentEl, 'compositionend', () => { barComposing = false; session.composing = false; });
        on(contentEl, 'keydown', (e) => {
          if (e.isComposing || barComposing || e.keyCode === 229) return;
          if (e.key === 'Enter') { e.preventDefault(); const out = commitBar(); if (out.status === 'ok') moveSelection(1, 0); }
          else if (e.key === 'Escape') { e.preventDefault(); cancelBar(); }
        });
        on(addrEl, 'keydown', (e) => {
          if (e.isComposing || e.keyCode === 229) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            const addr = parseAddress(addrEl.value);
            const ext = session.extent(session.sheet);
            if (!addr || addr.r >= ext.rows || addr.c >= ext.cols) { session.setReceipt('找不到这个地址', 'blocked'); addrEl.value = selectedCell().ref; return; }
            selectCell(addr.r, addr.c);
          } else if (e.key === 'Escape') { addrEl.value = selectedCell().ref; cellAt(...Object.values(session.selection()))?.focus(); }
        });
        on(tbody.parentNode, 'click', (e) => {
          const td = e.target.closest('td[data-r]');
          if (td) selectCell(+td.dataset.r, +td.dataset.c);
        });
        on(tableEl, 'dblclick', (e) => { if (e.target.closest('td[data-r]')) startCellEdit(); });
        on(tableEl, 'keydown', (e) => {
          if (e.isComposing || e.keyCode === 229 || e.target.closest('input')) return;
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          const move = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
          if (move) { e.preventDefault(); moveSelection(...move); return; }
          if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startCellEdit(); return; }
          if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); const v = selectedCell(); session.commitCell(v.ref, ''); render(); return; }
          if (e.key.length === 1) { e.preventDefault(); startCellEdit(e.key); }
        });
        // ⌘E and ⌘S live on the surface; neither is taken while an input method is composing.
        on(root_, 'keydown', (e) => {
          if (e.isComposing || e.keyCode === 229 || session.composing) return;
          if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
          const key = e.key.toLowerCase();
          if (key === 'e') { e.preventDefault(); toggleMode(); }
          else if (key === 's') { e.preventDefault(); if (session.commandState('file.save').enabled) runSave(); else session.setReceipt(session.commandState('file.save').reason, 'info'); }
        });
        session.select(0, 0);
        render();
        return {
          dispose() {
            closeMenu();
            cleanups.splice(0).forEach((off) => { try { off(); } catch (e) { /* gone */ } });
            if (titleEl && savedTitle !== null) titleEl.textContent = savedTitle;
            root_.remove();
            root_ = null;
          },
        };
      },
      readSelection() { return { sheet: session.sheet, ...session.selection() }; },
      restoreSelection(mark) {
        if (mark && mark.sheet === session.sheet && Number.isInteger(mark.r)) session.select(mark.r, mark.c);
      },
    };

    const menuPort = { bind() { return () => closeMenu(); } };

    function dispose() {
      if (disposed) return;
      disposed = true;
      closeMenu();
      listeners.clear();
      session.close();
    }

    return {
      adapter, menuPort, session, dispose,
      catalog: COMMANDS,
      resolveCommand: (id) => session.commandState(id),
      hideEngineChrome() {
        for (const sel of ['.clio-chart-details-bar', '#clio-chart-split']) {
          const el = doc.querySelector(sel);
          if (el && el.style.display !== 'none') { hidden.push([el, el.style.display]); el.style.display = 'none'; }
        }
      },
      restoreEngineChrome() { for (const [el, d] of hidden.splice(0)) el.style.display = d; },
    };
  }

  root.ClioWorksWorkbook = Object.freeze({
    open: openSession, create: createWorkbookIntegration, COMMANDS, TITLES, MODE_LABELS, STATE_LABELS,
  });
})(typeof window !== 'undefined' ? window : globalThis);
