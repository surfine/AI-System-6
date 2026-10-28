/* ClioWorks N5a: structural editing over the vendored Ledger model — pure
 * functions, no DOM, no adapter state. insert/delete rows and columns shift
 * every reference that points at the changed sheet exactly as Excel does:
 * cell formulas on every sheet (relative, absolute, ranges, whole rows and
 * columns; a deleted reference becomes #REF!), merged cells, defined names,
 * table objects (through the codec's own table shifter), chart series
 * references, conditional-formatting and data-validation ranges, the sheet's
 * autofilter, hyperlinks, comment anchors and array-formula ranges. Shared
 * formulas were expanded to per-cell text when the file was read, so shifting
 * every cell's formula covers them; the writer never re-shares.
 *
 * What these functions do NOT shift, by owner decision (N5a): pivot tables
 * and slicers. The codec ships a pivot shifter (L.pivots.lines) but it calls
 * the un-vendored L.ops, so pivots stay exactly where they were; the caller
 * must say so before the change runs (surveyLines()) and again in the
 * first-save list. Never report success for something not shifted.
 *
 * The vendored codec's reference arithmetic (L.formula.adjust) is reused; the
 * range/point shifters here are the piece its full app keeps in ops.js.
 *
 * Loaded only by the ClioWorks host, right after the codec (see
 * ledger-adapter.js MODULES). Undo is not built here: the adapter wraps each
 * call in one snapshot/restore step (snapshot()/restore()). */
(function (root) {
  'use strict';

  const LIMITS = () => {
    const M = root.L && root.L.model;
    return { MAXR: (M && M.MAXR) || 1048576, MAXC: (M && M.MAXC) || 16384 };
  };

  const sheetOf = (wb, sheetId) => {
    if (!wb || !Array.isArray(wb.sheets)) throw new Error('ledger-structure: workbook has no sheets');
    if (sheetId == null) return wb.sheets[0];
    if (typeof sheetId === 'object') {
      if (wb.sheets.includes(sheetId)) return sheetId;
      throw new Error('ledger-structure: sheet is not in this workbook');
    }
    const found = wb.sheets.find((sheet) => sheet && (sheet.name === sheetId || sheet.id === sheetId));
    if (!found) throw new Error('ledger-structure: unknown sheet ' + sheetId);
    return found;
  };

  /* ------------------------------------------------- range and point shifting */

  /**
   * One range under one structural change. Insert (n > 0): a range at or after
   * the line moves; a range the line lands inside grows, exactly as
   * L.formula.adjust grows formula areas. Delete (n < 0): a fully deleted range
   * answers null, a clipped one shrinks, one below moves up.
   * @param {{r1:number,c1:number,r2:number,c2:number}} rg
   * @param {'r'|'c'} axis 'r' moves rows, 'c' moves columns
   * @param {number} at 0-based line the change starts at
   * @param {number} n count; negative deletes
   */
  function shiftRange(rg, axis, at, n) {
    if (!rg) return rg;
    const { MAXR, MAXC } = LIMITS();
    const lim = axis === 'r' ? MAXR : MAXC;
    const k1 = axis === 'r' ? 'r1' : 'c1';
    const k2 = axis === 'r' ? 'r2' : 'c2';
    const out = { r1: rg.r1, c1: rg.c1, r2: rg.r2, c2: rg.c2 };
    if (n > 0) {
      if (out[k1] >= at) { out[k1] += n; out[k2] += n; }
      else if (out[k2] >= at) out[k2] += n;
      if (out[k1] >= lim) return null;
      if (out[k2] >= lim) out[k2] = lim - 1;
      return out;
    }
    const d0 = at;
    const d1 = at - n - 1;
    if (out[k2] < d0) return out;
    if (out[k1] > d1) { out[k1] += n; out[k2] += n; return out; }
    if (out[k1] >= d0 && out[k2] <= d1) return null;
    out[k1] = out[k1] < d0 ? out[k1] : d0;
    out[k2] = out[k2] > d1 ? out[k2] + n : d0 - 1;
    return out;
  }

  /** One 0-based coordinate under one change; null when the line itself was deleted. */
  function shiftPoint(x, at, n) {
    if (n > 0) return x >= at ? x + n : x;
    if (x < at) return x;
    if (x >= at - n) return null;
    return x + n;
  }

  /* -------------------------------------------------------- formula rewriting */

  /**
   * One formula text under one structural change on another (or the same) sheet.
   * `home` names the sheet the formula lives on, for unqualified references.
   * @returns {{text:string, changed:boolean}} the original text when nothing moves
   */
  function shiftFormula(formula, change, home) {
    const F = root.L && root.L.formula;
    if (!F || typeof formula !== 'string' || !formula.trim()) return { text: formula, changed: false };
    try {
      const ast = F.parse(formula);
      const out = F.adjust(ast, change, home);
      if (!out.changed) return { text: formula, changed: false };
      return { text: F.toText(out.ast), changed: true };
    } catch (error) {
      return { text: formula, changed: false };
    }
  }

  /**
   * Rewrite every formula in the workbook that points at the changed sheet.
   * A changed formula loses its cached result and its parse cache, and is
   * marked not-yet-recalculated; an unchanged formula keeps its cached value.
   * @returns {{cells:Array<{sh:object,r:number,c:number}>, formulas:number}}
   */
  function rewriteFormulas(wb, change) {
    const F = root.L && root.L.formula;
    if (!F) return { cells: [], formulas: 0 };
    const cells = [];
    for (const sh of wb.sheets) {
      (sh.rows || []).forEach((row, r) => {
        if (!row || !row.cells) return;
        row.cells.forEach((cell, c) => {
          if (!cell || typeof cell.f !== 'string') return;
          const out = shiftFormula(cell.f, change, sh.name);
          if (!out.changed) return;
          cell.f = out.text;
          delete cell.ast;
          delete cell._fsrc;
          delete cell.v;
          cell.dirty = true;
          cells.push({ sh, r, c });
        });
      });
    }
    return { cells, formulas: cells.length };
  }

  /* ------------------------------------------------------- what will happen */

  const sameRange = (a, b) => !!a && !!b && a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2;

  /**
   * Count, before anything runs, what one insert/delete of lines would shift
   * and what stays as it was. The counts the confirmation shows and the
   * kept-as-is list both come from here.
   */
  function surveyLines(wb, sheetId, axis, at, n) {
    const sh = sheetOf(wb, sheetId);
    const change = { sheet: sh.name, axis, at, n };
    const F = root.L && root.L.formula;
    const shifts = { formulas: 0, merges: 0, names: 0, tables: 0, charts: 0, cf: 0, dv: 0 };
    if (F) {
      for (const sheet of wb.sheets) {
        (sheet.rows || []).forEach((row) => {
          if (!row || !row.cells) return;
          row.cells.forEach((cell) => {
            if (!cell || typeof cell.f !== 'string') return;
            if (shiftFormula(cell.f, change, sheet.name).changed) shifts.formulas += 1;
          });
        });
      }
      shifts.charts = countChartsToShift(wb, sh, change);
    }
    for (const merge of sh.merges || []) {
      const next = shiftRange(merge, axis, at, n);
      if (!next || !sameRange(next, merge)) shifts.merges += 1;
    }
    for (const name of wb.names || []) {
      const home = name.scope != null && wb.sheets[name.scope] ? wb.sheets[name.scope].name : undefined;
      if (shiftFormula(String(name.ref || '').replace(/^=/, ''), change, home).changed) shifts.names += 1;
    }
    for (const table of wb.tables || []) {
      if (table.sheet !== sh) continue;
      const next = shiftRange(table.ref, axis, at, n);
      if (!next || !sameRange(next, table.ref)) shifts.tables += 1;
    }
    for (const cf of sh.cf || []) {
      for (const rg of cf.ranges || []) {
        const next = shiftRange(rg, axis, at, n);
        if (!next || !sameRange(next, rg)) shifts.cf += 1;
      }
    }
    for (const dv of sh.dv || []) {
      for (const rg of dv.ranges || []) {
        const next = shiftRange(rg, axis, at, n);
        if (!next || !sameRange(next, rg)) shifts.dv += 1;
      }
    }
    return { sheet: sh.name, axis, at, n, shifts, kept: keptKinds(wb, sh) };
  }

  /** Chart drawings (on any sheet) with at least one reference into the changed sheet. */
  function countChartsToShift(wb, sh, change) {
    const F = root.L && root.L.formula;
    const XC = root.L && root.L.xchart;
    if (!F) return 0;
    let count = 0;
    const adjust = (ast) => F.adjust(ast, change, sh.name);
    for (const sheet of wb.sheets) {
      for (const d of sheet.drawings || []) {
        if (d.kind !== 'chart' || !d.chart) continue;
        const touches = (d.chart.refs || []).some((text) => {
          try { return !!adjust(F.parse(String(text).replace(/^\(|\)$/g, ''))).changed; } catch (error) { return false; }
        });
        if (touches) count += 1;
      }
    }
    void XC;
    return count;
  }

  /** The kinds this module does not shift, with counts: pivot tables and slicers. */
  function keptKinds(wb, sh) {
    const out = [];
    const pivots = wb.extra && wb.extra.pivots;
    if (pivots) {
      const count = (pivots.tables || []).filter((t) => sh == null || wb.sheets.find((s) => s.id === t.sheet) === sh).length;
      if (count) out.push({ kind: 'pivot-table', count });
    }
    const slicers = wb.extra && wb.extra.slicers;
    const slicerCount = slicers && Array.isArray(slicers.groups) ? slicers.groups.length : 0;
    if (slicerCount) out.push({ kind: 'slicer', count: slicerCount });
    return out;
  }

  /* --------------------------------------------------------- snapshot / undo */

  // Undo support: the adapter snapshots the model around one structural call
  // and swaps the snapshot back. Cell `keep` objects (preserved source XML)
  // are immutable, so they are shared by reference; everything else is cloned
  // again on each restore so a replayed snapshot stays pristine.
  const cloneCell = (cell) => (cell ? Object.assign({}, cell) : cell);
  const cloneRow = (row) => (row ? Object.assign({}, row, { cells: row.cells.map(cloneCell) }) : row);
  const cloneCol = (col) => (col ? Object.assign({}, col) : col);
  const cloneRange = (rg) => (rg ? { r1: rg.r1, c1: rg.c1, r2: rg.r2, c2: rg.c2 } : rg);

  function chartSnapshots(wb) {
    const out = [];
    for (const sh of wb.sheets) {
      for (const d of sh.drawings || []) {
        if (d.kind !== 'chart' || !d.chart) continue;
        out.push({
          chart: d.chart,
          refs: (d.chart.refs || []).slice(),
          series: (d.chart.series || []).map((s) => ({ nameRef: s.nameRef, catRef: s.catRef, valRef: s.valRef })),
        });
      }
    }
    return out;
  }

  /** Everything the structural functions touch, cloned for one undo step. */
  function snapshot(wb) {
    return {
      sheets: wb.sheets.slice(),
      active: wb.active,
      names: (wb.names || []).map((n) => Object.assign({}, n)),
      tables: (wb.tables || []).map((t) => Object.assign({}, t, {
        ref: cloneRange(t.ref),
        columns: (t.columns || []).map((c) => Object.assign({}, c)),
        filter: t.filter ? { cols: (t.filter.cols || []).map((c) => Object.assign({}, c)) } : t.filter,
      })),
      charts: chartSnapshots(wb),
      perSheet: wb.sheets.map((sh) => ({
        sh,
        name: sh.name,
        rows: (sh.rows || []).map(cloneRow),
        cols: (sh.cols || []).map(cloneCol),
        colTail: sh.colTail ? { from: sh.colTail.from, o: Object.assign({}, sh.colTail.o) } : null,
        merges: (sh.merges || []).map(cloneRange),
        cf: (sh.cf || []).map((entry) => ({ entry, ranges: (entry.ranges || []).map(cloneRange) })),
        dv: (sh.dv || []).map((entry) => ({ entry, snapshot: ownSnapshot(entry) })),
        links: (sh.links || []).map((link) => ({ link, snapshot: ownSnapshot(link) })),
        autoFilter: sh.autoFilter ? ownSnapshot(sh.autoFilter) : null,
        comments: sh.comments ? [...sh.comments.entries()].map(([key, cm]) => [key, Object.assign({}, cm)]) : null,
        freeze: sh.view.freeze ? { r: sh.view.freeze.r, c: sh.view.freeze.c, top: sh.view.freeze.top ? { ...sh.view.freeze.top } : null } : null,
        top: sh.view.top ? { ...sh.view.top } : null,
        rowBreaks: (sh.print && sh.print.rowBreaks || []).slice(),
        colBreaks: (sh.print && sh.print.colBreaks || []).slice(),
        sortState: sh.sortState ? ownSnapshot(sh.sortState) : null,
        maxR: sh.maxR,
        maxC: sh.maxC,
      })),
    };
  }

  /** Own enumerable properties of an object, one level, `keep` fields by reference. */
  function ownSnapshot(obj) {
    const out = {};
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      out[key] = Array.isArray(value) ? value.slice() : value && typeof value === 'object' ? Object.assign({}, value) : value;
    }
    return out;
  }

  /** Put one snapshot back. Installs clones, so the snapshot can be replayed. */
  function restore(wb, snap) {
    wb.sheets = snap.sheets.slice();
    wb.active = snap.active;
    wb.names = snap.names.map((n) => Object.assign({}, n));
    wb.tables = snap.tables.map((t) => Object.assign({}, t, {
      ref: cloneRange(t.ref),
      columns: t.columns.map((c) => Object.assign({}, c)),
      filter: t.filter ? { cols: t.filter.cols.map((c) => Object.assign({}, c)) } : t.filter,
    }));
    for (const chart of snap.charts) {
      chart.chart.refs = chart.refs.slice();
      (chart.chart.series || []).forEach((s, i) => {
        const back = chart.series[i];
        if (!back) return;
        s.nameRef = back.nameRef;
        s.catRef = back.catRef;
        s.valRef = back.valRef;
      });
    }
    for (const entry of snap.perSheet) {
      const sh = entry.sh;
      sh.name = entry.name;
      sh.rows = entry.rows.map(cloneRow);
      sh.cols = entry.cols.map(cloneCol);
      sh.colTail = entry.colTail ? { from: entry.colTail.from, o: Object.assign({}, entry.colTail.o) } : null;
      sh.merges = entry.merges.map(cloneRange);
      sh.cf = entry.cf.map((x) => {
        x.entry.ranges = x.ranges.map(cloneRange);
        return x.entry;
      });
      sh.dv = entry.dv.map((x) => Object.assign(x.entry, ownSnapshot(x.snapshot)));
      sh.links = entry.links.map((x) => Object.assign(x.link, ownSnapshot(x.snapshot)));
      sh.autoFilter = entry.autoFilter ? ownSnapshot(entry.autoFilter) : null;
      if (entry.comments && sh.comments) {
        sh.comments.clear();
        for (const [key, cm] of entry.comments) sh.comments.set(key, Object.assign({}, cm));
      }
      sh.view.freeze = entry.freeze ? { r: entry.freeze.r, c: entry.freeze.c, top: entry.freeze.top ? { ...entry.freeze.top } : null } : null;
      sh.view.top = entry.top ? { ...entry.top } : sh.view.top;
      if (sh.print) {
        sh.print.rowBreaks = entry.rowBreaks.slice();
        sh.print.colBreaks = entry.colBreaks.slice();
      }
      sh.sortState = entry.sortState ? ownSnapshot(entry.sortState) : null;
      sh.maxR = entry.maxR;
      sh.maxC = entry.maxC;
    }
  }

  /* ------------------------------------------------------ insert/delete lines */

  /**
   * Move the cells themselves. `at` is 0-based; n > 0 inserts n blank lines
   * before it, n < 0 deletes -n lines starting there. Returns the cells that
   * moved or vanished (the changed band), for staleness marking.
   */
  function moveLines(wb, sh, axis, at, n) {
    const { MAXR } = LIMITS();
    const seeds = [];
    if (axis === 'r') {
      if (n > 0) {
        sh.rows = sh.rows.slice(0, at).concat(new Array(n), sh.rows.slice(at));
        if (sh.maxR >= at) sh.maxR += n;
      } else {
        const count = Math.min(-n, MAXR - at);
        sh.rows.splice(at, count);
        if (sh.maxR >= at + count - 1) sh.maxR = Math.max(-1, sh.maxR - count);
      }
      for (let r = at; r < sh.rows.length; r += 1) {
        const row = sh.rows[r];
        if (!row || !row.cells) continue;
        for (const key in row.cells) if (row.cells[key]) seeds.push({ sh, r, c: Number(key) });
      }
    } else {
      const map = n > 0
        ? (c) => (c >= at ? c + n : c)
        : (c) => (c < at ? c : c < at - n ? null : c + n);
      (sh.rows || []).forEach((row) => {
        if (!row || !row.cells) return;
        const next = [];
        for (const key in row.cells) {
          const c = Number(key);
          const to = map(c);
          if (to == null) continue;
          next[to] = row.cells[key];
        }
        row.cells = next;
      });
      if (sh.cols) sh.cols = n > 0
        ? sh.cols.slice(0, at).concat(new Array(n), sh.cols.slice(at))
        : sh.cols.slice(0, at).concat(sh.cols.slice(at - n));
      if (sh.colTail) sh.colTail.from = Math.max(0, shiftPoint(sh.colTail.from, at, n) ?? 0);
      if (n > 0) {
        if (sh.maxC >= at) sh.maxC += n;
      } else if (sh.maxC >= at - n - 1) sh.maxC = Math.max(-1, sh.maxC + n);
      (sh.rows || []).forEach((row, r) => {
        if (!row || !row.cells) return;
        for (const key in row.cells) {
          const c = Number(key);
          if (c >= at && row.cells[key]) seeds.push({ sh, r, c });
        }
      });
    }
    void wb;
    return seeds;
  }

  /** Array-formula anchors and follower links on one sheet under one change. */
  function shiftArrayRanges(sh, axis, at, n) {
    (sh.rows || []).forEach((row) => {
      if (!row || !row.cells) return;
      for (const key in row.cells) {
        const cell = row.cells[key];
        if (!cell) continue;
        if (cell.af) {
          const next = shiftRange(cell.af, axis, at, n);
          if (next) cell.af = next;
          else { delete cell.af; delete cell.am; }
        }
        if (cell.am) {
          const moved = axis === 'r' ? shiftPoint(cell.am.r, at, n) : shiftPoint(cell.am.c, at, n);
          if (moved == null) delete cell.am;
          else if (axis === 'r') cell.am = { r: moved, c: cell.am.c };
          else cell.am = { r: cell.am.r, c: moved };
        }
      }
    });
  }

  /** Shift the range-bearing extras of one sheet (merges, cf, dv, links, filter). */
  function shiftSheetRanges(sh, axis, at, n, change) {
    sh.merges = (sh.merges || []).map((m) => shiftRange(m, axis, at, n)).filter(Boolean);
    sh.cf = (sh.cf || []).filter((entry) => {
      entry.ranges = (entry.ranges || []).map((rg) => shiftRange(rg, axis, at, n)).filter(Boolean);
      return entry.ranges.length > 0;
    });
    sh.dv = (sh.dv || []).filter((entry) => {
      entry.ranges = (entry.ranges || []).map((rg) => shiftRange(rg, axis, at, n)).filter(Boolean);
      for (const key of ['f1', 'f2']) {
        if (typeof entry[key] !== 'string') continue;
        const out = shiftFormula(entry[key], change, sh.name);
        if (out.changed) entry[key] = out.text;
      }
      return entry.ranges.length > 0;
    });
    sh.links = (sh.links || []).filter((link) => {
      link.ref = shiftRange(link.ref, axis, at, n);
      return !!link.ref;
    });
    if (sh.autoFilter) {
      const next = shiftRange(sh.autoFilter.ref, axis, at, n);
      if (!next) sh.autoFilter = null;
      else {
        sh.autoFilter.ref = next;
        sh.autoFilter.cols = (sh.autoFilter.cols || [])
          .map((col) => {
            const moved = axis === 'c' ? shiftPoint(col.col, at, n) : col.col;
            return moved == null ? null : Object.assign({}, col, { col: moved });
          })
          .filter(Boolean);
      }
    }
    if (sh.sortState && sh.sortState.ref) {
      const next = shiftRange(sh.sortState.ref, axis, at, n);
      if (next) sh.sortState.ref = next;
      else sh.sortState = null;
    }
    // Comment anchors live in a Map keyed by row*16384+col.
    if (sh.comments && sh.comments.size && root.L.model) {
      const moved = new Map();
      for (const cm of sh.comments.values()) {
        cm.r = axis === 'r' ? shiftPoint(cm.r, at, n) : cm.r;
        cm.c = axis === 'c' ? shiftPoint(cm.c, at, n) : cm.c;
        if (cm.r == null || cm.c == null) continue;
        moved.set(root.L.model.key(cm.r, cm.c), cm);
      }
      sh.comments.clear();
      for (const [key, cm] of moved) sh.comments.set(key, cm);
    }
    if (sh.view.freeze) {
      const frozen = axis === 'r' ? sh.view.freeze.r : sh.view.freeze.c;
      if (frozen > at) {
        const next = Math.max(0, frozen + n);
        if (axis === 'r') sh.view.freeze.r = next;
        else sh.view.freeze.c = next;
      }
    }
    if (sh.view.top) {
      if (axis === 'r') sh.view.top.r = Math.max(0, shiftPoint(sh.view.top.r, at, n) ?? 0);
      else sh.view.top.c = Math.max(0, shiftPoint(sh.view.top.c, at, n) ?? 0);
    }
    if (sh.print) {
      if (axis === 'r') sh.print.rowBreaks = sh.print.rowBreaks.map((r) => shiftPoint(r, at, n)).filter((x) => x != null);
      else sh.print.colBreaks = sh.print.colBreaks.map((c) => shiftPoint(c, at, n)).filter((x) => x != null);
    }
  }

  /**
   * Insert or delete lines on one sheet and shift every reference that points
   * at it. Callers get { seeds, formulas, kept } back: seeds are the cells that
   * moved (for staleness), kept lists what was not shifted.
   */
  function changeLines(wb, sheetId, axis, at, n) {
    const sh = sheetOf(wb, sheetId);
    const { MAXR, MAXC } = LIMITS();
    const lim = axis === 'r' ? MAXR : MAXC;
    if (!Number.isInteger(at) || at < 0 || at >= lim) return { status: 'blocked', code: 'BAD_LINE' };
    if (!Number.isInteger(n) || n === 0) return { status: 'blocked', code: 'BAD_COUNT' };
    if (n > 0) {
      const last = axis === 'r' ? sh.maxR : sh.maxC;
      if (last >= 0 && last + n >= lim) return { status: 'blocked', code: 'WOULD_DROP_CELLS' };
    }
    const F = root.L && root.L.formula;
    if (!F) return { status: 'failed', code: 'NO_FORMULA_ENGINE' };
    if (!(root.L.tableKeep && typeof root.L.tableKeep.shift === 'function')) {
      // Without the table shifter the table objects themselves would stay put:
      // refuse rather than corrupt (never report success for something not shifted).
      return { status: 'failed', code: 'NO_TABLE_SHIFTER' };
    }
    const change = { sheet: sh.name, axis, at, n };
    const seeds = moveLines(wb, sh, axis, at, n);
    shiftArrayRanges(sh, axis, at, n);
    shiftSheetRanges(sh, axis, at, n, change);
    const { cells } = rewriteFormulas(wb, change);
    for (const name of wb.names || []) {
      const home = name.scope != null && wb.sheets[name.scope] ? wb.sheets[name.scope].name : undefined;
      const raw = String(name.ref || '');
      const out = shiftFormula(raw.replace(/^=/, ''), change, home);
      if (out.changed) name.ref = (raw.startsWith('=') ? '=' : '') + out.text;
    }
    root.L.tableKeep.shift(sh, axis, at, n, shiftRange);
    const XC = root.L && root.L.xchart;
    if (XC && typeof XC.adjust === 'function') {
      for (const sheet of wb.sheets) {
        for (const d of sheet.drawings || []) {
          if (d.kind === 'chart' && d.chart) XC.adjust(d.chart, (ast) => F.adjust(ast, change, sheet.name));
        }
      }
    }
    const seen = new Set(seeds.map((s) => s.sh.id + ':' + s.r + ':' + s.c));
    for (const seed of cells) {
      const key = seed.sh.id + ':' + seed.r + ':' + seed.c;
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push(seed);
    }
    return { status: 'ok', sheet: sh.name, axis, at, n, seeds, formulas: cells.length, kept: keptKinds(wb, sh) };
  }

  /* -------------------------------------------------------------------- fill */

  function copyForFill(F, src, dr, dc) {
    if (!src) return null;
    const out = Object.assign({}, src);
    delete out._gnode;
    delete out.computing;
    if (typeof src.f === 'string') {
      try {
        out.f = F.toText(F.shift(F.parse(src.f), dr, dc));
        delete out.v;
        delete out.ast;
        delete out._fsrc;
        out.dirty = true;
        out.edited = true;
      } catch (error) { /* an unparseable formula rides along verbatim */ }
      delete out.af;
      delete out.am;
    }
    return out;
  }

  /**
   * Fill a rectangular range from its first row (down) or first column
   * (right). Formulas shift their relative references by the fill offset, as
   * copy does; absolute references stay. Returns the cells that were written.
   */
  function fillRange(wb, sheetId, range, direction) {
    const F = root.L && root.L.formula;
    if (!F) return { status: 'failed', code: 'NO_FORMULA_ENGINE' };
    const sh = sheetOf(wb, sheetId);
    const r1 = Math.min(range.r1, range.r2);
    const c1 = Math.min(range.c1, range.c2);
    const r2 = Math.max(range.r1, range.r2);
    const c2 = Math.max(range.c1, range.c2);
    const down = direction !== 'right';
    const written = [];
    const put = (r, c, cell) => {
      if (cell == null) {
        const row = sh.rows[r];
        if (row && row.cells) delete row.cells[c];
        return;
      }
      sh.rowObj(r).cells[c] = cell;
      if (r > sh.maxR) sh.maxR = r;
      if (c > sh.maxC) sh.maxC = c;
      written.push({ sh, r, c });
    };
    if (down) {
      for (let c = c1; c <= c2; c += 1) {
        const src = sh.get(r1, c);
        for (let r = r1 + 1; r <= r2; r += 1) put(r, c, copyForFill(F, src, r - r1, 0));
      }
    } else {
      for (let r = r1; r <= r2; r += 1) {
        const src = sh.get(r, c1);
        for (let c = c1 + 1; c <= c2; c += 1) put(r, c, copyForFill(F, src, 0, c - c1));
      }
    }
    return { status: 'ok', sheet: sh.name, cells: written };
  }

  /* ----------------------------------------------------------------- sheets */

  /** Point every formula, defined name and chart reference at a sheet's new (or deleted: to = null) name. */
  function rewriteForSheetName(wb, from, to) {
    const F = root.L && root.L.formula;
    if (!F) return;
    for (const sheet of wb.sheets) {
      (sheet.rows || []).forEach((row) => {
        if (!row || !row.cells) return;
        row.cells.forEach((cell) => {
          if (!cell || typeof cell.f !== 'string') return;
          try {
            const out = F.renameSheet(F.parse(cell.f), from, to);
            if (!out.changed) return;
            cell.f = F.toText(out.ast);
            delete cell.ast;
            delete cell._fsrc;
            delete cell.v;
            cell.dirty = true;
          } catch (error) { /* leave unparseable formulas verbatim */ }
        });
      });
    }
    for (const name of wb.names || []) {
      try {
        const raw = String(name.ref || '');
        const out = F.renameSheet(F.parse(raw.replace(/^=/, '')), from, to);
        if (out.changed) name.ref = (raw.startsWith('=') ? '=' : '') + F.toText(out.ast);
      } catch (error) { /* keep */ }
    }
    const XC = root.L && root.L.xchart;
    if (XC && typeof XC.rename === 'function') {
      for (const sheet of wb.sheets) {
        for (const d of sheet.drawings || []) {
          if (d.kind === 'chart' && d.chart) XC.rename(d.chart, from, to);
        }
      }
    }
  }

  function insertSheet(wb, name, at) {
    const sh = wb.addSheet(name, at);
    return { status: 'ok', sheet: sh.name };
  }

  function deleteSheet(wb, sheetId) {
    const sh = sheetOf(wb, sheetId);
    if (wb.sheets.length <= 1) return { status: 'blocked', code: 'LAST_SHEET' };
    const index = wb.sheets.indexOf(sh);
    wb.sheets.splice(index, 1);
    wb.tables = (wb.tables || []).filter((t) => t.sheet !== sh);
    wb.names = (wb.names || []).filter((n) => n.scope !== index)
      .map((n) => (n.scope != null && n.scope > index ? Object.assign({}, n, { scope: n.scope - 1 }) : n));
    if (wb.active >= wb.sheets.length) wb.active = wb.sheets.length - 1;
    else if (wb.active > index) wb.active -= 1;
    rewriteForSheetName(wb, sh.name, null);
    return { status: 'ok', sheet: sh.name, kept: keptKinds(wb, null) };
  }

  function renameSheet(wb, sheetId, next) {
    const sh = sheetOf(wb, sheetId);
    const name = String(next || '').trim();
    if (!name) return { status: 'blocked', code: 'EMPTY_NAME' };
    if (name.length > 31) return { status: 'blocked', code: 'NAME_TOO_LONG' };
    if (/[\\/?*[\]:]/.test(name)) return { status: 'blocked', code: 'BAD_NAME_CHARS' };
    const clash = wb.sheetByName(name);
    if (clash && clash !== sh) return { status: 'blocked', code: 'NAME_IN_USE' };
    const from = sh.name;
    sh.name = name;
    rewriteForSheetName(wb, from, name);
    return { status: 'ok', sheet: name, from };
  }

  /* ------------------------------------------------------------------ freeze */

  /** Freeze `r` rows and `c` columns (0 each clears that axis; both 0 unfreezes). */
  function setFreeze(wb, sheetId, r, c) {
    const sh = sheetOf(wb, sheetId);
    const rows = Math.max(0, Math.min(Number(r) || 0, sh.maxR >= 0 ? sh.maxR + 1 : 0));
    const cols = Math.max(0, Math.min(Number(c) || 0, sh.maxC >= 0 ? sh.maxC + 1 : 0));
    sh.view.freeze = rows || cols ? { r: rows, c: cols, top: null } : null;
    return { status: 'ok', sheet: sh.name, freeze: sh.view.freeze ? { ...sh.view.freeze } : null };
  }

  // The vendored codec's own app keeps its range shifter in ops.js, which is not
  // vendored. Its table maintenance needs exactly one entry of it at write time
  // (tables.js patches queryTable autoFilter/sortState ranges through
  // L.ops.shiftRange when a table's ref moved with a structural edit). This
  // module owns range shifting, so it fills that one missing entry — no other
  // L.ops member is invented here.
  if (root.L) {
    const ops = root.L.ops || (root.L.ops = {});
    if (typeof ops.shiftRange !== 'function') ops.shiftRange = shiftRange;
  }

  root.AISystem6LedgerStructure = Object.freeze({
    insertRows: (wb, sheet, at, n) => changeLines(wb, sheet, 'r', at, n),
    deleteRows: (wb, sheet, at, n) => changeLines(wb, sheet, 'r', at, -n),
    insertCols: (wb, sheet, at, n) => changeLines(wb, sheet, 'c', at, n),
    deleteCols: (wb, sheet, at, n) => changeLines(wb, sheet, 'c', at, -n),
    shiftFormula,
    shiftRange,
    fill: fillRange,
    insertSheet,
    deleteSheet,
    renameSheet,
    setFreeze,
    surveyLines,
    keptKinds,
    snapshot,
    restore,
  });
})(typeof window !== 'undefined' ? window : globalThis);
