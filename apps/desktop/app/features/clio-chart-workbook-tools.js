// Lazy feature module: ClioWorks N5b — 制图 (Make Chart), 粘贴函数 (Paste
// Function) and column type conversion for the mounted ClioChart workbook.
//
// The chart dialog turns the selected range into a real Ledger chart object —
// the same shape a chart read from a file has (sheet.drawings + chart model
// with nameRef/catRef/valRef references) — as ONE named undo step, and the
// grid shows it as an anchored box drawn by the vendored SVG renderer
// (L.chart.render) post-processed into 1-bit patterns. The saved package
// carries xl/charts/chartN.xml + a drawing part, so Excel and Numbers open it.
//
// Everything that touches the document model is a pure function here (no DOM),
// so tests/features/clioworks-n5b-chart-tools.test.mjs can run it in the vm
// fixture the codec tests use. The dialogs and the grid overlay are the only
// DOM half, built on demand like office-new.js does.
//
// Loaded through ensureClioChartWorkbookTools (config.js): the vendored suite
// core first (L.h/L.s/L.color — the chart renderer and dml read from it),
// then this module.

(function (root) {
  'use strict';
  if (root.AISystem6ClioChartWorkbookTools) return;

  /* Named undo steps. The labels start with clio_chart_workbook_step_ so the
     workbook surface's stepKey() passes them straight to t(). */
  const STEP_LABELS = Object.freeze({
    insertChart: 'clio_chart_workbook_step_insert_chart',
    deleteChart: 'clio_chart_workbook_step_delete_chart',
    convertColumn: 'clio_chart_workbook_step_convert_column',
  });

  // The grid's own constants (84-clio-chart-workbook.css col widths and the
  // surface's row measure); the overlay only falls back to these.
  const COL_HEAD_PX = 40;
  const COL_PX = 104;
  const ROW_PX = 24;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------ addresses */

  function colName(c) {
    let n = c + 1;
    let out = '';
    while (n > 0) { const m = (n - 1) % 26; out = String.fromCharCode(65 + m) + out; n = Math.floor((n - 1) / 26); }
    return out;
  }
  function cellRef(r, c) { return colName(c) + (r + 1); }

  const F = () => (root.L && root.L.formula) || null;
  const sheetOf = (wb, sheetId) => {
    if (!wb || !Array.isArray(wb.sheets)) return null;
    if (sheetId == null) return wb.sheets[0];
    return wb.sheets.find((sheet) => sheet && (sheet.name === sheetId || sheet.id === sheetId)) || null;
  };
  const cellValue = (sh, r, c) => {
    const row = sh && sh.rows && sh.rows[r];
    const cell = row && row.cells ? row.cells[c] : null;
    if (!cell) return null;
    const v = cell.v;
    if (v && typeof v === 'object' && typeof v.e === 'string') return v.e;
    return v == null ? null : v;
  };
  const cellIsBlank = (sh, r, c) => { const v = cellValue(sh, r, c); return v == null || v === ''; };
  const cellIsNumber = (sh, r, c) => typeof cellValue(sh, r, c) === 'number';
  const cellText = (sh, r, c) => {
    const v = cellValue(sh, r, c);
    return v == null ? '' : String(v);
  };

  /* The colours the renderer paints with when a series has none of its own:
     the mapping from these to the 1-bit patterns below must stay exact. */
  const palette = () => {
    const XC = root.L && root.L.xchart;
    return (XC && XC.PAL2003) || ['#9999FF', '#993366', '#FFFFCC', '#CCFFFF', '#660066', '#FF8080', '#0066CC', '#CCCCFF', '#000080', '#FF00FF', '#FFFF00', '#00FFFF', '#800080', '#800000', '#008080', '#0000FF'];
  };

  /* ------------------------------------------------- chart kinds (the six) */

  const CHART_KINDS = Object.freeze([
    Object.freeze({ id: 'col', labelKey: 'clio_chart_workbook_kind_col', stacked: 'colStacked' }),
    Object.freeze({ id: 'bar', labelKey: 'clio_chart_workbook_kind_bar', stacked: 'barStacked' }),
    Object.freeze({ id: 'line', labelKey: 'clio_chart_workbook_kind_line', stacked: null }),
    Object.freeze({ id: 'area', labelKey: 'clio_chart_workbook_kind_area', stacked: 'areaStacked' }),
    Object.freeze({ id: 'pie', labelKey: 'clio_chart_workbook_kind_pie', stacked: null }),
    Object.freeze({ id: 'scatter', labelKey: 'clio_chart_workbook_kind_scatter', stacked: null }),
  ]);

  /* --------------------------------------------------- ranges and regions */

  function clampRange(sh, rg) {
    const maxR = Math.max(0, sh.maxR);
    const maxC = Math.max(0, sh.maxC);
    return {
      r1: Math.max(0, Math.min(rg.r1, rg.r2)),
      c1: Math.max(0, Math.min(rg.c1, rg.c2)),
      r2: Math.min(maxR, Math.max(rg.r1, rg.r2)),
      c2: Math.min(maxC, Math.max(rg.c1, rg.c2)),
    };
  }

  /**
   * The block of non-blank cells a single cell belongs to (the Chart Wizard's
   * current region): walk out from (r, c) while a border row or column still
   * holds a value.
   */
  function currentRegion(sh, r, c) {
    let r1 = r, r2 = r, c1 = c, c2 = c;
    for (;;) {
      let grew = false;
      if (r1 > 0) {
        for (let cc = c1; cc <= c2; cc += 1) if (!cellIsBlank(sh, r1 - 1, cc)) { r1 -= 1; grew = true; break; }
      }
      if (c1 > 0) {
        for (let rr = r1; rr <= r2; rr += 1) if (!cellIsBlank(sh, rr, c1 - 1)) { c1 -= 1; grew = true; break; }
      }
      if (r2 < sh.maxR) {
        for (let cc = c1; cc <= c2; cc += 1) if (!cellIsBlank(sh, r2 + 1, cc)) { r2 += 1; grew = true; break; }
      }
      if (c2 < sh.maxC) {
        for (let rr = r1; rr <= r2; rr += 1) if (!cellIsBlank(sh, rr, c2 + 1)) { c2 += 1; grew = true; break; }
      }
      if (!grew) break;
    }
    return { r1, c1, r2, c2 };
  }

  /* ------------------------------------------------- series from a range */

  const refOf = (sh, rg) => {
    const Fx = F();
    return Fx && sh ? Fx.quoteSheet(sh.name) + '!' + Fx.absRangeName(rg) : '';
  };

  function readRangeVals(sh, r1, c1, r2, c2) {
    const vals = [];
    for (let r = r1; r <= r2; r += 1) {
      for (let c = c1; c <= c2; c += 1) {
        const v = cellValue(sh, r, c);
        vals.push(typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0);
      }
    }
    return vals;
  }

  /**
   * Series from one range, header detection like the Chart Wizard: a text
   * first row/column names the series, a text first column names the
   * categories. Values are the cells' own values (formulas contribute their
   * cached result, exactly what the grid shows).
   * @returns {{series:Array, byRows:boolean}}
   */
  function seriesFromRange(sh, rg, byRows) {
    const box = clampRange(sh, rg);
    let hasHeadRow = false;
    let hasHeadCol = false;
    if (box.r2 > box.r1) {
      let txt = 0;
      for (let c = box.c1; c <= box.c2; c += 1) if (!cellIsNumber(sh, box.r1, c) && !cellIsBlank(sh, box.r1, c)) txt += 1;
      hasHeadRow = txt > 0 && (cellIsBlank(sh, box.r1, box.c1) || txt >= (box.c2 - box.c1 + 1) / 2);
    }
    if (box.c2 > box.c1) {
      let txt = 0;
      for (let r = box.r1 + (hasHeadRow ? 1 : 0); r <= box.r2; r += 1) if (!cellIsNumber(sh, r, box.c1) && !cellIsBlank(sh, r, box.c1)) txt += 1;
      hasHeadCol = txt > 0 || (hasHeadRow && cellIsBlank(sh, box.r1, box.c1));
    }
    const r0 = box.r1 + (hasHeadRow ? 1 : 0);
    const c0 = box.c1 + (hasHeadCol ? 1 : 0);
    if (byRows == null) byRows = box.c2 - c0 > box.r2 - r0; // series across the shorter axis
    const pal = palette();
    const series = [];
    if (!byRows) {
      for (let c = c0; c <= box.c2; c += 1) {
        series.push({
          name: hasHeadRow ? cellText(sh, box.r1, c) : 'Series' + (c - c0 + 1),
          nameRef: hasHeadRow ? refOf(sh, { r1: box.r1, c1: c, r2: box.r1, c2: c }) : null,
          catRef: hasHeadCol ? refOf(sh, { r1: r0, c1: box.c1, r2: box.r2, c2: box.c1 }) : null,
          valRef: refOf(sh, { r1: r0, c1: c, r2: box.r2, c2: c }),
          vals: readRangeVals(sh, r0, c, box.r2, c),
          color: pal[(c - c0) % 8],
        });
      }
    } else {
      for (let r = r0; r <= box.r2; r += 1) {
        series.push({
          name: hasHeadCol ? cellText(sh, r, box.c1) : 'Series' + (r - r0 + 1),
          nameRef: hasHeadCol ? refOf(sh, { r1: r, c1: box.c1, r2: r, c2: box.c1 }) : null,
          catRef: hasHeadRow ? refOf(sh, { r1: box.r1, c1: c0, r2: box.r1, c2: box.c2 }) : null,
          valRef: refOf(sh, { r1: r, c1: c0, r2: r, c2: box.c2 }),
          vals: readRangeVals(sh, r, c0, r, box.c2),
          color: pal[(r - r0) % 8],
        });
      }
    }
    return { series, byRows };
  }

  /** One reference's cells, walked without the evaluator: AST ref/area nodes only. */
  function refAreas(home, text) {
    const Fx = F();
    if (!Fx || !text) return null;
    let ast = null;
    try { ast = Fx.parse(String(text).replace(/^\(|\)$/g, '')); } catch (error) { return null; }
    const out = [];
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.t === 'ref' || node.t === 'area') {
        if (node.book != null) return;
        const target = node.sheet != null ? sheetByNameOrHome(home, node.sheet) : home;
        if (!target) return;
        const r1 = node.t === 'ref' ? node.r : Math.min(node.r1, node.r2);
        const r2 = node.t === 'ref' ? node.r : Math.max(node.r1, node.r2);
        const c1 = node.t === 'ref' ? node.c : Math.min(node.c1, node.c2);
        const c2 = node.t === 'ref' ? node.c : Math.max(node.c1, node.c2);
        if ((r2 - r1 + 1) * (c2 - c1 + 1) > 40000) return;
        out.push({ sheet: target, r1, c1, r2, c2 });
        return;
      }
      for (const key of Object.keys(node)) {
        const v = node[key];
        if (v && typeof v === 'object') visit(v);
      }
    };
    visit(ast);
    return out.length ? out : null;
  }
  const sheetByNameOrHome = (home, name) => {
    const wb = home && home.wb;
    return (wb && wb.sheetByName(name)) || (String(name) === home.name ? home : null);
  };

  /**
   * Bring one chart's cached values up to the cells' current values (the
   * references stay in the model; the cache is what the renderer plots).
   * Non-numeric cell values plot as 0, like the vendored resolver's.
   */
  function resolveChart(home, chart) {
    if (!chart || !Array.isArray(chart.series)) return chart;
    let cats = null;
    for (const sr of chart.series) {
      if (!sr) continue;
      const vals = refAreas(home, sr.valRef);
      if (vals) {
        const flat = [];
        for (const a of vals) {
          const byCol = a.r2 - a.r1 >= a.c2 - a.c1;
          if (byCol) for (let r = a.r1; r <= a.r2; r += 1) for (let c = a.c1; c <= a.c2; c += 1) flat.push(plotValue(cellValue(a.sheet, r, c)));
          else for (let c = a.c1; c <= a.c2; c += 1) for (let r = a.r1; r <= a.r2; r += 1) flat.push(plotValue(cellValue(a.sheet, r, c)));
        }
        sr.vals = flat;
      }
      const names = refAreas(home, sr.nameRef);
      if (names) {
        const a = names[0];
        const text = cellText(a.sheet, a.r1, a.c1);
        if (text) sr.name = text;
      }
      if (!cats && sr.catRef) {
        const texts = catTexts(home, sr.catRef);
        if (texts) cats = chart.kind === 'scatter' ? texts.map((x) => Number(x) || 0) : texts;
      }
    }
    if (cats) chart.cats = cats;
    return chart;
  }
  const plotValue = (v) => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0);

  /** The texts one reference holds, column-major like the reader's; null when unreadable. */
  function catTexts(home, text) {
    const areas = refAreas(home, text);
    if (!areas) return null;
    const texts = [];
    for (const a of areas) {
      const byCol = a.r2 - a.r1 >= a.c2 - a.c1;
      if (byCol) for (let r = a.r1; r <= a.r2; r += 1) texts.push(cellText(a.sheet, r, a.c1));
      else for (let c = a.c1; c <= a.c2; c += 1) texts.push(cellText(a.sheet, a.r1, c));
    }
    return texts;
  }

  /* --------------------------------------------------- the drawing object */

  const nextChartName = (sh) => 'Chart ' + ((sh.drawings || []).filter((d) => d && d.kind === 'chart').length + 1);
  const nextChartId = (sh) => 2 + (sh.drawings || []).reduce((max, d) => Math.max(max, (d && d.id) || 0), 0);

  /**
   * The chart drawing for one selection: an anchored two-cell box holding the
   * Ledger chart model — the same structure a chart read from a file has.
   * @param {{kind:string,stacked:boolean,byRows:boolean,title:string,legend:boolean}} spec
   */
  function buildChartDrawing(sh, rg, spec) {
    const box = clampRange(sh, rg);
    const from = seriesFromRange(sh, box, spec.byRows);
    const chart = {
      kind: spec.stacked ? spec.kind + 'Stacked' : spec.kind,
      title: String(spec.title || ''),
      legend: spec.legend ? 'r' : 'none',
      gridY: true,
      labels: false,
      fsz: 10,
      cats: [],
      series: from.series,
      dirty: true,
      imported: false,
    };
    const catCache = (from.series.find((sr) => sr.catRef) || {}).catRef;
    if (catCache) {
      const texts = catTexts(sh, catCache);
      if (texts) chart.cats = texts;
    }
    if (chart.kind === 'pie' || chart.kind === 'doughnut') {
      const pal = palette();
      const sliceCount = Math.max(chart.cats.length, chart.series[0] ? chart.series[0].vals.length : 0);
      chart.pieColors = Array.from({ length: sliceCount }, (_, i) => pal[i % 8]);
    }
    const startC = Math.min(box.c2 + 2, 16300);
    const startR = Math.max(0, box.r1);
    const drawing = {
      kind: 'chart',
      name: nextChartName(sh),
      id: nextChartId(sh),
      anchor: {
        type: 'two', editAs: 'twoCell',
        from: { r: startR, c: startC, rOff: 0, cOff: 0 },
        to: { r: Math.min(startR + 12, 1048570), c: Math.min(startC + 8, 16383), rOff: 0, cOff: 0 },
      },
      chart,
    };
    return drawing;
  }

  /**
   * Insert one chart drawing as ONE named undo step. The adapter's
   * applyModelStep owns the revision/dirty bookkeeping; the op pair owns the
   * array membership, so undo/redo replay by identity.
   */
  function insertChartDrawing(adapter, sheetId, drawing) {
    if (!adapter || typeof adapter.applyModelStep !== 'function') return { status: 'blocked', code: 'UNAVAILABLE' };
    return adapter.applyModelStep(STEP_LABELS.insertChart, (undo) => {
      const sh = sheetOf(adapter.workbook(), sheetId);
      if (!sh) throw new Error('clio-chart-workbook-tools: unknown sheet');
      sh.drawings.push(drawing);
      undo.op(
        () => { const i = sh.drawings.indexOf(drawing); if (i >= 0) sh.drawings.splice(i, 1); },
        () => { if (!sh.drawings.includes(drawing)) sh.drawings.push(drawing); },
      );
      return [];
    });
  }

  /** Delete one chart drawing as ONE named undo step. */
  function deleteChartDrawing(adapter, sheetId, drawing) {
    if (!adapter || typeof adapter.applyModelStep !== 'function') return { status: 'blocked', code: 'UNAVAILABLE' };
    return adapter.applyModelStep(STEP_LABELS.deleteChart, (undo) => {
      const sh = sheetOf(adapter.workbook(), sheetId);
      if (!sh) throw new Error('clio-chart-workbook-tools: unknown sheet');
      const i = sh.drawings.indexOf(drawing);
      if (i < 0) return [];
      sh.drawings.splice(i, 1);
      undo.op(
        () => { if (!sh.drawings.includes(drawing)) sh.drawings.splice(Math.min(i, sh.drawings.length), 0, drawing); },
        () => { const k = sh.drawings.indexOf(drawing); if (k >= 0) sh.drawings.splice(k, 1); },
      );
      return [];
    });
  }

  /* --------------------------------------------------- column conversion */

  const DATE_NF = Object.freeze({ zh: 'yyyy"年"m"月"d"日"', en: 'm/d/yyyy' });

  /** Excel 1900-system day serial for a calendar date. */
  function dateSerial(y, m, d) {
    return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  /** 2026-10-24, 2026/10/24, 2026年10月24日, and 10/24/2026 (slash form by locale, the other order as fallback). */
  function parseDateText(text, locale) {
    const s = String(text || '').trim();
    let m = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/.exec(s);
    if (m) return validDate(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) {
      const zhFirst = locale === 'zh';
      const primary = validDate(+m[3], zhFirst ? +m[2] : +m[1], zhFirst ? +m[1] : +m[2]);
      if (primary != null) return primary;
      return validDate(+m[3], zhFirst ? +m[1] : +m[2], zhFirst ? +m[2] : +m[1]);
    }
    return null;
  }
  function validDate(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 9999) return null;
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
    return dateSerial(y, mo, d);
  }

  /** A number as text: plain, thousands separators, full-width digits. */
  function parseNumberText(text) {
    let s = String(text || '').trim()
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/．/g, '.');
    const parenthesised = /^\(.*\)$/.test(s);
    if (parenthesised) s = s.slice(1, -1).trim();
    if (/^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?([eE][+-]?\d+)?$/.test(s)) {
      const n = Number(s.replace(/,/g, ''));
      if (Number.isFinite(n)) return parenthesised ? -n : n;
    }
    return null;
  }

  /**
   * Convert one range (or one whole used column) between text and number /
   * date as ONE named undo step: every cell goes through adapter.setCell, so
   * the adapter's dependency and dirty bookkeeping holds, and the outer
   * transaction the undo knows is one step named 转换列类型. Cells that cannot
   * convert stay unchanged and are counted.
   * @param {'text-number'|'text-date'|'number-text'} mode
   * @param {{locale?:string, display?:(r:number,c:number,v:number)=>string}} opts
   * @returns {{status:'ok', converted:number, unconverted:number}|{status:'blocked'|'failed', code?:string}}
   */
  function convertRange(adapter, sheetId, rg, mode, opts = {}) {
    if (!adapter || typeof adapter.setCell !== 'function') return { status: 'blocked', code: 'UNAVAILABLE' };
    const wb = adapter.workbook();
    const sh = sheetOf(wb, sheetId);
    if (!sh) return { status: 'failed', code: 'NO_SHEET' };
    const box = rg.r1 === rg.r2 && rg.c1 === rg.c2
      ? { r1: 0, c1: rg.c1, r2: Math.max(0, sh.maxR), c2: rg.c1 } // one cell means its whole used column
      : clampRange(sh, rg);
    const locale = opts.locale === 'zh' ? 'zh' : 'en';
    const display = typeof opts.display === 'function' ? opts.display : (r, c, v) => String(v);
    let converted = 0;
    let unconverted = 0;
    wb.undo.begin(STEP_LABELS.convertColumn);
    try {
      (sh.rows || []).forEach((row, r) => {
        if (!row || !row.cells || r < box.r1 || r > box.r2) return;
        row.cells.forEach((cell, c) => {
          if (!cell || c < box.c1 || c > box.c2) return;
          if (typeof cell.f === 'string') return; // a formula's value is not text to convert
          const v = cell.v;
          let patch = null;
          if (mode === 'number-text') {
            if (typeof v !== 'number') return;
            patch = { value: display(r, c, v), formula: null, label: STEP_LABELS.convertColumn };
          } else {
            if (typeof v !== 'string' || v === '') return;
            if (mode === 'text-number') {
              const n = parseNumberText(v);
              if (n == null) { unconverted += 1; return; }
              patch = { value: n, formula: null, label: STEP_LABELS.convertColumn };
            } else {
              const serial = parseDateText(v, locale);
              if (serial == null) { unconverted += 1; return; }
              const base = sh.styleAt ? sh.styleAt(r, c) : (cell.s || 0);
              let style = cell.s;
              try { style = wb.styles.derive(base, { nf: DATE_NF[locale] }); } catch (error) { style = null; }
              patch = { value: serial, style, formula: null, label: STEP_LABELS.convertColumn };
            }
          }
          adapter.setCell(sh.name, cellRef(r, c), patch);
          converted += 1;
        });
      });
    } finally {
      wb.undo.end();
    }
    return { status: 'ok', converted, unconverted };
  }

  /* ------------------------------------------------------- paste function */

  /**
   * Every worksheet function the vendored evaluator implements, read from the
   * engine's own registry at runtime — never a hand list. The evaluator must
   * be loaded first (adapter.ensureCalc()).
   * @returns {Array<{name:string,min:number,max:number,kinds:string}>} sorted by name
   */
  function enumerateFunctions() {
    const C = root.L && root.L.calc;
    if (!C || !C.FN) return [];
    return Object.keys(C.FN)
      .map((name) => {
        const def = C.FN[name];
        return { name, min: def.min, max: def.max, kinds: String(def.kinds || 'v') };
      })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  const kindArg = (def, i) => def.kinds[Math.min(i, def.kinds.length - 1)] || 'v';

  /** The signature line, e.g. 「VLOOKUP(值, 区域, 数, [逻辑])」, in the UI language. */
  function functionSignature(def, tr) {
    const words = [];
    const required = Math.min(def.min, 4);
    for (let i = 0; i < required; i += 1) words.push(tr('clio_chart_workbook_fn_arg_' + kindArg(def, i)));
    if (def.min > 4) words.push('…');
    if (def.max > def.min) words.push('[' + tr('clio_chart_workbook_fn_arg_' + kindArg(def, def.min)) + (def.max > def.min + 1 ? '…' : '') + ']');
    return def.name + '(' + words.join(', ') + ')';
  }

  const CATEGORY_RULES = Object.freeze([
    ['logical', /^(IF|IFERROR|IFNA|IFS|SWITCH|AND|OR|XOR|NOT|TRUE|FALSE|LET|LAMBDA|MAP|REDUCE|SCAN|BYROW|BYCOL|MAKEARRAY)($|[.(])/],
    ['lookup', /(LOOKUP|^INDEX$|^MATCH$|^CHOOSE$|^ROW$|^ROWS$|^COLUMN$|^COLUMNS$|^ADDRESS$|^OFFSET$|^INDIRECT$|^FILTER$|^SORT|^UNIQUE$|^TRANSPOSE$|^FORMULATEXT$|^HYPERLINK$|^CELL$)/],
    ['date', /(DATE|TIME|^NOW$|^TODAY$|^WEEK|^WORKDAY|^YEAR|^MONTH|^DAY$|^HOUR$|^MINUTE$|^SECOND$|^EOMONTH|^EDATE|^DATEDIF|^DAYS)/],
    ['text', /^(CONCAT|TEXTJOIN|TEXT$|LEFT|RIGHT|MID|LEN|TRIM|SUBSTITUTE|REPLACE|FIND|SEARCH|EXACT|UPPER|LOWER|PROPER|VALUE|CHAR|CODE|UNICHAR|UNICODE|REPT|SPLIT|JOIN|CLEAN|^T$|FIXED|DOLLAR|NUMBERVALUE|REGEX|ARRAYTOTEXT|VALUETOTEXT)/],
    ['info', /^(IS[A-Z]|ISERR|ISNA|NA$|ERRORTYPE|ERROR\.TYPE|TYPE$|^N$|^S$|SHEET$|SHEETS$)/],
    ['stat', /^(AVERAGE|MEDIAN|MODE|COUNT|COUNTA|COUNTIF|COUNTIFS|COUNTBLANK|MAX|MIN|LARGE|SMALL|RANK|STDEV|VAR|NORM|BINOM|POISSON|T\.DIST|T\.INV|CHISQ|F\.DIST|F\.INV|CORREL|COVAR|PERCENTILE|QUARTILE|FORECAST|TREND|GROWTH|LINEST|LOGEST|SLOPE|INTERCEPT|RSQ|STEYX|GEOMEAN|HARMEAN|TRIMMEAN|FREQUENCY|Z\.TEST|CONFIDENCE)/],
    ['fin', /^(PV|FV|NPV|XNPV|IRR|XIRR|MIRR|RATE|PMT|PPMT|IPMT|NPER|CUMIPMT|CUMPRINC|SLN|SYD|DB|DDB|VDB|EFFECT|NOMINAL|DISC|INTRATE|RECEIVED|PRICE|YIELD|DURATION|MDURATION|ACCRINT|TBILL)/],
    ['eng', /^(IM[A-Z]|BESSEL|ERF|ERFC|DELTA|GESTEP|BIN2|DEC2|HEX2|OCT2|COMPLEX|IMSUM|CONVERT$|BITAND|BITOR|BITXOR|BITLSHIFT|BITRSHIFT)/],
    ['math', /^(SUM|SUMIF|SUMIFS|SUMPRODUCT|SUMSQ|SUMX2MY2|SUMX2PY2|SUMXMY2|PRODUCT|ROUND|ROUNDUP|ROUNDDOWN|TRUNC|INT|ABS|SIGN|MOD|QUOTIENT|^PI$|SQRT|EXP|LN|LOG|LOG10|POWER|MROUND|CEILING|FLOOR|EVEN|ODD|GCD|LCM|FACT|MULTINOMIAL|COMBIN|COMBINA|RANDBETWEEN|^RAND$|RANDARRAY|SEQUENCE|SERIESSUM|DEGREES|RADIANS|COS|SIN|TAN|ACOS|ASIN|ATAN|ATAN2|COSH|SINH|TANH|ACOSH|ASINH|ATANH|SEC|CSC|COT)/],
  ]);
  /** One category id per function, best effort: the described forty are exact. */
  function functionCategory(name) {
    for (const [id, re] of CATEGORY_RULES) if (re.test(name)) return id;
    return 'other';
  }
  const CATEGORIES = Object.freeze(['logical', 'lookup', 'date', 'text', 'stat', 'math', 'fin', 'eng', 'info', 'other']);

  /* ------------------------------------------------------- 1-bit patterns */

  // One pattern per series, in palette order: solid black first, then the
  // classic 1-bit hatchings. Defined here (not in the vendored renderer) and
  // spliced into the rendered SVG before the fills are rewritten.
  const PATTERN_SHAPES = Object.freeze([
    'solid', 'hatch', 'dots', 'crosshatch', 'vhatch', 'hhatch', 'dense', 'checker',
  ]);
  const PATTERN_SIZE = 6;

  function patternElement(doc, id, kind) {
    const p = doc.createElementNS(SVG_NS, 'pattern');
    p.setAttribute('id', id);
    p.setAttribute('patternUnits', 'userSpaceOnUse');
    p.setAttribute('width', String(PATTERN_SIZE));
    p.setAttribute('height', String(PATTERN_SIZE));
    const line = (x1, y1, x2, y2, w) => {
      const el = doc.createElementNS(SVG_NS, 'line');
      el.setAttribute('x1', String(x1)); el.setAttribute('y1', String(y1));
      el.setAttribute('x2', String(x2)); el.setAttribute('y2', String(y2));
      el.setAttribute('stroke', '#000');
      el.setAttribute('stroke-width', String(w || 1));
      return el;
    };
    const rect = (x, y, w, h) => {
      const el = doc.createElementNS(SVG_NS, 'rect');
      el.setAttribute('x', String(x)); el.setAttribute('y', String(y));
      el.setAttribute('width', String(w)); el.setAttribute('height', String(h));
      el.setAttribute('fill', '#000');
      return el;
    };
    const S = PATTERN_SIZE;
    switch (kind) {
      case 'hatch': p.append(line(0, S, S, 0), line(-1, 1, 1, -1), line(S - 1, S + 1, S + 1, S - 1)); break;
      case 'dense': p.append(line(0, S, S, 0), line(0, S / 2, S / 2, 0), line(S / 2, S, S, S / 2)); break;
      case 'crosshatch': p.append(line(0, S, S, 0), line(0, 0, S, S)); break;
      case 'vhatch': p.append(line(1, 0, 1, S)); break;
      case 'hhatch': p.append(line(0, 1, S, 1)); break;
      case 'dots': p.append(rect(2, 2, 1.6, 1.6)); break;
      case 'checker': p.append(rect(0, 0, S / 2, S / 2), rect(S / 2, S / 2, S / 2, S / 2)); break;
      default: p.append(rect(0, 0, S, S)); break; // solid
    }
    return p;
  }

  /**
   * Post-process one rendered chart SVG into 1 bit: series fills and strokes
   * become the pattern of their palette slot, greys become black or paper, and
   * gridlines become dotted black. The vendored renderer is untouched.
   */
  function oneBit(svg, uid) {
    const doc = svg.ownerDocument;
    const defs = doc.createElementNS(SVG_NS, 'defs');
    PATTERN_SHAPES.forEach((kind, i) => defs.append(patternElement(doc, uid + '-' + i, kind)));
    svg.insertBefore(defs, svg.firstChild);
    const byColor = new Map(palette().map((hex, i) => [hex.toUpperCase(), `url(#${uid}-${i % PATTERN_SHAPES.length})`]));
    const paint = (value) => {
      if (!value) return value;
      const upper = String(value).toUpperCase();
      if (upper === 'NONE') return value;
      if (byColor.has(upper)) return byColor.get(upper);
      if (upper === '#FFFFFF' || upper === '#FFF' || upper === 'WHITE') return value;
      return '#FFFFFF'; // any other colour reads as paper in 1 bit
    };
    for (const el of svg.querySelectorAll('*')) {
      const fill = el.getAttribute && el.getAttribute('fill');
      if (fill) el.setAttribute('fill', paint(fill));
      const stroke = el.getAttribute && el.getAttribute('stroke');
      if (stroke) {
        const upper = String(stroke).toUpperCase();
        if (upper === '#888' || upper === '#888888') { el.setAttribute('stroke', '#000'); el.setAttribute('stroke-dasharray', '1.5,1.5'); }
        else if (byColor.has(upper)) el.setAttribute('stroke', byColor.get(upper));
        else if (upper !== '#000' && upper !== '#000000' && upper !== 'NONE') el.setAttribute('stroke', '#000');
      }
    }
    return svg;
  }

  /**
   * One chart as a 1-bit <svg>: live values from the cells, then the vendored
   * renderer, then the pattern rewrite. Browser-only (needs the DOM).
   */
  function renderChart1Bit(wb, sh, chart, w, h, zoom) {
    const L = root.L;
    if (!L || !L.chart || typeof L.chart.render !== 'function' || !root.document || !root.document.createElementNS) return null;
    // The renderer reads L.render.fillCSS for the chart and plot backgrounds;
    // the module that owns L.render does not ride the ClioWorks load list, so
    // the same fallback XC.render installs gets installed here (solid → its colour).
    if (!L.render) L.render = {};
    if (typeof L.render.fillCSS !== 'function') L.render.fillCSS = (f) => (f && f.t === 'solid' ? f.color || f.c || '#FFFFFF' : 'none');
    resolveChart(sh, chart);
    const model = {
      kind: chart.kind, title: chart.title || '', legend: chart.legend, cats: (chart.cats || []).slice(),
      gridY: chart.gridY !== false, labels: !!chart.labels, fsz: Math.max(6, (chart.fsz || 10) * (96 / 72) * (zoom || 1)),
      series: (chart.series || []).map((sr) => ({ name: sr.name, vals: (sr.vals || []).slice(), color: sr.color })),
      bg: { t: 'solid', color: '#FFFFFF' },
    };
    if (chart.kind !== 'pie' && chart.kind !== 'doughnut' && !chart.imported) model.plotBg = { t: 'solid', color: '#C0C0C0' };
    if (chart.pieColors) model.pieColors = chart.pieColors.slice();
    let svg;
    try { svg = L.chart.render(model, w, h, null); } catch (error) { console.warn('clio-chart-workbook-tools: render', error); return null; }
    if (!svg || typeof svg.querySelectorAll !== 'function') return null; // no real DOM (a bare vm), nothing to post-process
    return oneBit(svg, 'cwkpat' + Math.floor(Math.random() * 1e9).toString(36));
  }

  /* ================================================================ UI === */

  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);
  const isZhLocale = () => {
    const language = typeof root.currentLanguage === 'string' ? root.currentLanguage : (typeof currentLanguage === 'string' ? currentLanguage : '');
    return language === 'zh';
  };
  const workbookApi = () => root.AISystem6ClioChartWorkbook || null;
  const activeSession = () => {
    const api = workbookApi();
    return api && typeof api.session === 'function' ? api.session() : null;
  };
  const workbookRoot = () => {
    const doc = root.document;
    if (!doc || !doc.querySelector) return null;
    return doc.querySelector('[data-window="clioChart"] .clio-chart-workbook');
  };

  /* ------------------------------------------------------------ overlay */

  // The grid overlay: one box per chart drawing of the current sheet, drawn by
  // the same renderer as the preview. It scrolls with the sheet (it lives in
  // the scroll element) and paints over cells but under the sticky headers —
  // both for free from paint order, with no z-index of its own.
  const overlays = new WeakMap();

  function ensureOverlay(session) {
    if (!session || session.closed || typeof session.subscribe !== 'function') return null;
    const existing = overlays.get(session);
    if (existing) return existing;
    const rootEl = workbookRoot();
    const scrollEl = rootEl && rootEl.querySelector('.cwk-scroll');
    const grid = rootEl && rootEl.querySelector('.cwk-grid');
    if (!rootEl || !scrollEl || !grid) return null;
    const doc = rootEl.ownerDocument;
    const layer = doc.createElement('div');
    layer.className = 'cwk-charts';
    scrollEl.append(layer);
    const state = { session, layer, grid, detached: false };
    let selected = null; // the selected drawing object
    let off = () => {};
    const detach = () => {
      if (state.detached) return;
      state.detached = true;
      try { off(); } catch (error) { /* the session is gone */ }
      layer.remove();
      overlays.delete(session);
    };
    const render = () => {
      if (state.detached || session.closed) { detach(); return; }
      drawBoxes();
    };
    const geometry = () => {
      const head = grid.querySelector('thead th');
      const row = grid.querySelector('tbody tr[data-r]');
      const headH = head && head.offsetHeight ? head.offsetHeight : ROW_PX;
      const rowH = row && row.offsetHeight ? row.offsetHeight : ROW_PX;
      return { headH, rowH };
    };
    function drawBoxes() {
      const adapter = session.adapter;
      const wb = adapter && typeof adapter.workbook === 'function' ? adapter.workbook() : null;
      const sh = wb ? sheetOf(wb, session.sheet) : null;
      const drawings = sh && Array.isArray(sh.drawings) ? sh.drawings.filter((d) => d && d.kind === 'chart' && d.chart) : [];
      if (selected && !drawings.includes(selected)) selected = null;
      layer.replaceChildren();
      const { headH, rowH } = geometry();
      for (const drawing of drawings) {
        const a = drawing.anchor || {};
        const from = a.from || { r: 0, c: 0 };
        const to = a.type === 'two' && a.to ? a.to : { r: from.r + 12, c: from.c + 8 };
        const x = COL_HEAD_PX + from.c * COL_PX;
        const y = headH + from.r * rowH;
        const w = Math.max(60, (to.c - from.c + 1) * COL_PX);
        const h = Math.max(60, (to.r - from.r + 1) * rowH);
        const box = doc.createElement('div');
        box.className = 'cwk-chartbox' + (selected === drawing ? ' is-selected' : '');
        box.setAttribute('role', 'img');
        box.setAttribute('aria-label', tr('clio_chart_workbook_chart_aria', drawing.name || ''));
        box.tabIndex = 0;
        box.style.setProperty('--cwk-chart-x', x + 'px');
        box.style.setProperty('--cwk-chart-y', y + 'px');
        box.style.setProperty('--cwk-chart-w', w + 'px');
        box.style.setProperty('--cwk-chart-h', h + 'px');
        const svg = renderChart1Bit(wb, sh, drawing.chart, w, h, rowH / 20);
        if (svg) box.append(svg);
        else box.textContent = drawing.name || '';
        box.addEventListener('click', () => {
          if (selected === drawing) {
            selected = null;
            session.setReceipt('', 'idle');
          } else {
            selected = drawing;
            session.setReceipt('clio_chart_workbook_receipt_chart_selected', 'info', [drawing.name || '']);
          }
          drawBoxes();
          if (selected) box.focus();
        });
        box.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); selected = null; session.setReceipt('', 'idle'); drawBoxes(); }
          else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            event.stopPropagation();
            removeChart(session, drawing);
          }
        });
        layer.append(box);
      }
    }
    off = session.subscribe(render);
    state.selectedDrawing = () => selected;
    state.clearSelection = () => { selected = null; };
    state.render = render;
    state.detach = detach;
    overlays.set(session, state);
    render();
    return state;
  }

  async function removeChart(session, drawing) {
    const out = deleteChartDrawing(session.adapter, session.sheet, drawing);
    await recalcStale(session);
    if (out && out.status === 'ok') session.setReceipt('clio_chart_workbook_receipt_chart_deleted', 'info', [drawing.name || '']);
    session.notify();
    return out;
  }

  /* ------------------------------------------------------------ dialogs */

  // A dialog is built on demand and removed on close (office-new's shape): the
  // boot budget counts every byte of the page, and these exist only when asked.
  function openDialog(el, onSettle) {
    if (typeof root.closeMenus === 'function') { try { root.closeMenus(); } catch (error) { /* menus are optional */ } }
    if (typeof root.playSystemSound === 'function') { try { root.playSystemSound('alert'); } catch (error) { /* a sound is a courtesy */ } }
    root.document.body.classList.add('has-system-modal');
    const scrim = root.document.getElementById('modal-scrim');
    if (scrim) scrim.classList.remove('is-hidden');
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      el.onclose = null;
      root.document.body.classList.remove('has-system-modal');
      if (scrim) scrim.classList.add('is-hidden');
      el.remove();
      if (typeof onSettle === 'function') onSettle(value);
    };
    el.onclose = () => settle(el.returnValue || 'cancel');
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); try { el.close('cancel'); } catch (error) { settle('cancel'); } }
    });
    if (el.open) el.close('cancel');
    root.document.body.append(el);
    el.showModal();
    return settle;
  }

  function dialogFrame(id, titleKey) {
    const doc = root.document;
    const dialog = doc.createElement('dialog');
    dialog.id = id;
    dialog.className = 'cwk-dialog';
    const form = doc.createElement('form');
    form.method = 'dialog';
    const head = doc.createElement('b');
    head.className = 'cwk-dialog-title';
    head.textContent = tr(titleKey);
    form.append(head);
    dialog.append(form);
    const row = (className, ...kids) => {
      const div = doc.createElement('div');
      div.className = className;
      div.append(...kids.filter(Boolean));
      return div;
    };
    const labeled = (labelKey, input) => {
      const label = doc.createElement('label');
      label.className = 'cwk-dialog-field';
      const b = doc.createElement('span');
      b.textContent = tr(labelKey);
      label.append(b, input);
      return label;
    };
    const check = (labelKey, checked, onChange) => {
      const label = doc.createElement('label');
      label.className = 'cwk-dialog-check';
      const input = doc.createElement('input');
      input.type = 'checkbox';
      input.checked = !!checked;
      input.addEventListener('change', () => onChange(input.checked));
      const span = doc.createElement('span');
      span.textContent = tr(labelKey);
      label.append(input, span);
      return label;
    };
    const radio = (groupName, value, labelKey, checked, onChange) => {
      const label = doc.createElement('label');
      label.className = 'cwk-dialog-check';
      const input = doc.createElement('input');
      input.type = 'radio';
      input.name = groupName;
      input.value = value;
      input.checked = !!checked;
      input.addEventListener('change', () => { if (input.checked) onChange(value); });
      const span = doc.createElement('span');
      span.textContent = tr(labelKey);
      label.append(input, span);
      return label;
    };
    return { dialog, form, row, labeled, check, radio };
  }

  function dialogButtons(form, okTextKey) {
    const doc = root.document;
    const actions = doc.createElement('div');
    actions.className = 'cwk-dialog-actions';
    const cancel = doc.createElement('button');
    cancel.type = 'submit';
    cancel.value = 'cancel';
    cancel.className = 'btn';
    cancel.textContent = tr('cancel');
    const ok = doc.createElement('button');
    ok.type = 'submit';
    ok.value = 'ok';
    ok.className = 'btn default';
    ok.textContent = tr(okTextKey);
    actions.append(cancel, ok);
    form.append(actions);
    return { actions, cancel, ok };
  }

  /* -- 制图… ------------------------------------------------------------ */

  // Small static 1-bit icons for the six projections: black bars, lines and
  // dots on paper, the way the Chart Wizard's own list drew them.
  function kindIcon(kind) {
    const bars = (pts, horiz) => pts.map(([x, y, w, hh]) => (horiz
      ? `<rect x="${y}" y="${x}" width="${hh}" height="${w}" fill="#000"/>`
      : `<rect x="${x}" y="${16 - hh - y}" width="${w}" height="${hh}" fill="#000"/>`)).join('');
    let body = '';
    if (kind === 'col') body = bars([[3, 0, 5, 8], [10, 0, 5, 12], [17, 0, 5, 6]], false);
    else if (kind === 'bar') body = bars([[3, 0, 5, 8], [10, 0, 5, 12], [17, 0, 5, 6]], true);
    else if (kind === 'line') body = '<polyline points="2,13 9,8 15,10 22,3" fill="none" stroke="#000" stroke-width="1.5"/>';
    else if (kind === 'area') body = '<polygon points="2,15 2,9 9,4 15,7 22,2 22,15" fill="#000"/>';
    else if (kind === 'pie') body = '<circle cx="12" cy="8" r="6.5" fill="#000"/><path d="M12,8 L12,1.5 A6.5,6.5 0 0 1 18.5,8 Z" fill="#fff" stroke="#000" stroke-width="1"/>';
    else if (kind === 'scatter') body = [[4, 12], [8, 8], [13, 10], [17, 4], [21, 6]].map(([x, y]) => `<rect x="${x - 1}" y="${y - 1}" width="2.5" height="2.5" fill="#000"/>`).join('');
    return `<svg width="24" height="16" viewBox="0 0 24 16" aria-hidden="true">${body}</svg>`;
  }

  function openChartDialog(session) {
    if (!session || session.closed) return { status: 'blocked', code: 'CLOSED' };
    const adapter = session.adapter;
    if (!adapter || typeof adapter.applyModelStep !== 'function' || typeof adapter.workbook !== 'function') {
      session.setReceipt('clio_chart_workbook_receipt_unavailable', 'blocked');
      session.notify();
      return { status: 'blocked', code: 'UNAVAILABLE' };
    }
    const doc = root.document;
    const { dialog, form, row, labeled, check, radio } = dialogFrame('cwk-chart-dialog', 'clio_chart_workbook_cmd_chart');
    const state = { kind: 'col', stacked: false, byRows: false, title: '', legend: true };

    const kindList = doc.createElement('div');
    kindList.className = 'cwk-kindlist';
    kindList.setAttribute('role', 'radiogroup');
    kindList.setAttribute('aria-label', tr('clio_chart_workbook_chart_kind'));
    const stackedBox = check('clio_chart_workbook_kind_stacked', state.stacked, (v) => { state.stacked = v; drawPreview(); });
    const refreshStacked = () => {
      const def = CHART_KINDS.find((k) => k.id === state.kind) || CHART_KINDS[0];
      stackedBox.hidden = !def.stacked;
      if (!def.stacked) state.stacked = false;
    };
    for (const def of CHART_KINDS) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'cwk-kind';
      button.dataset.kind = def.id;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(def.id === state.kind));
      button.innerHTML = kindIcon(def.id);
      const span = doc.createElement('span');
      span.textContent = tr(def.labelKey);
      button.append(span);
      button.addEventListener('click', () => {
        state.kind = def.id;
        for (const other of kindList.querySelectorAll('.cwk-kind')) {
          other.classList.toggle('is-on', other === button);
          other.setAttribute('aria-checked', String(other === button));
        }
        refreshStacked();
        drawPreview();
      });
      kindList.append(button);
    }
    refreshStacked();
    kindList.querySelector('.cwk-kind').classList.add('is-on');

    const seriesRow = row('cwk-dialog-row',
      radio('cwk-by', 'rows', 'clio_chart_workbook_series_rows', state.byRows, () => { state.byRows = true; drawPreview(); }),
      radio('cwk-by', 'cols', 'clio_chart_workbook_series_cols', !state.byRows, () => { state.byRows = false; drawPreview(); }));
    const seriesWord = doc.createElement('span');
    seriesWord.textContent = tr('clio_chart_workbook_chart_series_in');
    seriesRow.prepend(seriesWord);

    const titleInput = doc.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'cwk-dialog-input';
    titleInput.addEventListener('input', () => { state.title = titleInput.value; drawPreview(); });

    const legendBox = check('clio_chart_workbook_chart_legend', state.legend, (v) => { state.legend = v; drawPreview(); });

    const preview = doc.createElement('div');
    preview.className = 'cwk-preview';

    form.append(
      row('cwk-dialog-row', kindList, stackedBox),
      seriesRow,
      labeled('clio_chart_workbook_chart_title_field', titleInput),
      row('cwk-dialog-row', legendBox),
      labeled('clio_chart_workbook_chart_preview', preview),
    );
    const { ok } = dialogButtons(form, 'clio_chart_workbook_chart_insert');

    const wb = adapter.workbook();
    const sh = sheetOf(wb, session.sheet);
    const rg = session.range();
    const box = rg.r1 === rg.r2 && rg.c1 === rg.c2 ? currentRegion(sh, rg.r1, rg.c1) : rg;

    const draftSpec = () => ({ kind: state.kind, stacked: state.stacked, byRows: state.byRows, title: state.title, legend: state.legend });
    function drawPreview() {
      preview.replaceChildren();
      const chart = buildChartDrawing(sh, box, draftSpec()).chart;
      const hasData = chart.series.some((sr) => (sr.vals || []).some((v) => v !== 0));
      if (!hasData) {
        const hint = doc.createElement('p');
        hint.className = 'cwk-dialog-hint';
        hint.textContent = tr('clio_chart_workbook_receipt_no_chart_data');
        preview.append(hint);
        ok.disabled = true;
        return;
      }
      ok.disabled = false;
      const svg = renderChart1Bit(wb, sh, chart, 300, 190, 0.75);
      if (svg) preview.append(svg);
    }
    drawPreview();

    openDialog(dialog, (value) => {
      if (value !== 'ok') return { status: 'cancelled' };
      const drawing = buildChartDrawing(sh, box, draftSpec());
      const out = insertChartDrawing(adapter, session.sheet, drawing);
      if (out.status !== 'ok') {
        session.setReceipt('clio_chart_workbook_receipt_unavailable', 'blocked');
      } else {
        ensureOverlay(session);
        session.setReceipt('clio_chart_workbook_receipt_chart_done', 'info', [drawing.name]);
      }
      session.notify();
      return out;
    });
    return { status: 'ok' };
  }

  /* -- 粘贴函数… --------------------------------------------------------- */

  const DESCRIBED = Object.freeze([
    'SUM', 'AVERAGE', 'COUNT', 'COUNTA', 'COUNTIF', 'SUMIF', 'IF', 'IFS', 'AND', 'OR',
    'NOT', 'VLOOKUP', 'XLOOKUP', 'INDEX', 'MATCH', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'INT', 'ABS',
    'MAX', 'MIN', 'MEDIAN', 'LEFT', 'RIGHT', 'MID', 'LEN', 'TRIM', 'CONCAT', 'TEXTJOIN',
    'TEXT', 'VALUE', 'DATE', 'TODAY', 'NOW', 'YEAR', 'MONTH', 'DAY', 'IFERROR', 'UNIQUE',
  ]);

  function openPasteFunctionDialog(session) {
    if (!session || session.closed) return { status: 'blocked', code: 'CLOSED' };
    const adapter = session.adapter;
    if (!adapter || typeof adapter.ensureCalc !== 'function') {
      session.setReceipt('clio_chart_workbook_receipt_unavailable', 'blocked');
      session.notify();
      return { status: 'blocked', code: 'UNAVAILABLE' };
    }
    // The evaluator is the workbook's own second lazy load; the dialog waits
    // for it so the list it shows is the engine's, not a hand list.
    Promise.resolve(adapter.ensureCalc()).then(() => {
      if (session.closed) return { status: 'cancelled' };
      const fns = enumerateFunctions();
      if (!fns.length) {
        session.setReceipt('clio_chart_workbook_receipt_unavailable', 'blocked');
        session.notify();
        return { status: 'blocked' };
      }
      return showPasteFunctionDialog(session, fns);
    }).catch((error) => {
      console.warn('clio-chart-workbook-tools: paste function', error);
      session.setReceipt('clio_chart_workbook_receipt_unavailable', 'blocked');
      session.notify();
      return { status: 'failed' };
    });
    return { status: 'ok' };
  }

  function showPasteFunctionDialog(session, fns) {
    const doc = root.document;
    const { dialog, form, row } = dialogFrame('cwk-fn-dialog', 'clio_chart_workbook_cmd_paste_function');
    const state = { category: 'all', pick: null, query: '' };

    const search = doc.createElement('input');
    search.type = 'text';
    search.className = 'cwk-dialog-input';
    search.setAttribute('aria-label', tr('clio_chart_workbook_fn_search'));
    search.setAttribute('placeholder', tr('clio_chart_workbook_fn_search'));
    search.addEventListener('input', () => { state.query = search.value.trim().toUpperCase(); drawList(); });

    const cats = doc.createElement('div');
    cats.className = 'cwk-cats';
    const catButton = (id, labelKey) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'cwk-cat' + (state.category === id ? ' is-on' : '');
      button.textContent = tr(labelKey);
      button.addEventListener('click', () => {
        state.category = id;
        for (const other of cats.querySelectorAll('.cwk-cat')) other.classList.toggle('is-on', other === button);
        drawList();
      });
      return button;
    };
    cats.append(catButton('all', 'clio_chart_workbook_fn_all'));
    for (const id of CATEGORIES) cats.append(catButton(id, 'clio_chart_workbook_fn_cat_' + id));

    const list = doc.createElement('div');
    list.className = 'cwk-fnlist';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', tr('clio_chart_workbook_cmd_paste_function'));

    const detail = doc.createElement('p');
    detail.className = 'cwk-fn-detail';

    const { ok } = dialogButtons(form, 'clio_chart_workbook_fn_insert');
    ok.disabled = true;
    form.append(row('cwk-dialog-row', search), row('cwk-dialog-row', cats), row('cwk-dialog-row', list), row('cwk-dialog-row', detail));

    const byName = new Map(fns.map((def) => [def.name, def]));
    const matches = () => fns.filter((def) =>
      (state.category === 'all' || functionCategory(def.name) === state.category)
      && (!state.query || def.name.toUpperCase().indexOf(state.query) >= 0));

    function choose(def) {
      state.pick = def.name;
      ok.disabled = false;
      const described = DESCRIBED.includes(def.name);
      detail.textContent = functionSignature(def, tr) + (described ? ' — ' + tr('clio_chart_workbook_fn_desc_' + def.name) : '');
      for (const other of list.querySelectorAll('.cwk-fn')) {
        const on = other.dataset.fn === def.name;
        other.classList.toggle('is-on', on);
        other.setAttribute('aria-selected', String(on));
        if (on && typeof other.scrollIntoView === 'function') other.scrollIntoView({ block: 'nearest' });
      }
    }
    function insert() {
      if (!state.pick) return;
      const name = state.pick;
      try { dialog.close('ok'); } catch (error) { dialog.remove(); }
      insertIntoBar(session, '=' + name + '(');
    }
    ok.addEventListener('click', (event) => { event.preventDefault(); insert(); });
    list.addEventListener('dblclick', (event) => {
      const item = event.target.closest && event.target.closest('.cwk-fn');
      if (!item) return;
      state.pick = item.dataset.fn;
      insert();
    });

    function drawList() {
      list.replaceChildren();
      const rows = matches();
      if (!rows.length) {
        const empty = doc.createElement('p');
        empty.className = 'cwk-dialog-hint';
        empty.textContent = tr('clio_chart_workbook_fn_none');
        list.append(empty);
        return;
      }
      const frag = doc.createDocumentFragment();
      for (const def of rows) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'cwk-fn' + (state.pick === def.name ? ' is-on' : '');
        button.dataset.fn = def.name;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(state.pick === def.name));
        button.textContent = functionSignature(def, tr);
        button.addEventListener('click', () => choose(def));
        frag.append(button);
      }
      list.append(frag);
    }
    drawList();
    search.focus();
    openDialog(dialog);
    return { status: 'ok' };
  }

  /** Put 「=NAME(」 at the caret of the workbook's input bar (full mode). */
  function insertIntoBar(session, text) {
    if (session.mode === 'express') session.setMode('full');
    const rootEl = workbookRoot();
    const bar = rootEl && rootEl.querySelector('.cwk-content');
    if (!bar) return false;
    bar.focus();
    const start = bar.selectionStart == null ? bar.value.length : bar.selectionStart;
    const end = bar.selectionEnd == null ? start : bar.selectionEnd;
    bar.value = bar.value.slice(0, start) + text + bar.value.slice(end);
    const caret = start + text.length;
    try { bar.setSelectionRange(caret, caret); } catch (error) { /* a read-only bar keeps the text */ }
    return true;
  }

  /* -- 列类型转换 -------------------------------------------------------- */

  async function recalcStale(session) {
    const adapter = session.adapter;
    if (!adapter || typeof adapter.ensureCalc !== 'function' || typeof adapter.recalc !== 'function') return;
    let staleCount = 0;
    if (typeof adapter.stale === 'function' && Array.isArray(adapter.sheets)) {
      for (const sheet of adapter.sheets()) staleCount += (adapter.stale(sheet.name) || []).length;
    }
    if (!staleCount && !(typeof adapter.calcLoaded === 'function' && adapter.calcLoaded())) return;
    try {
      await adapter.ensureCalc();
      await adapter.recalc();
    } catch (error) {
      console.warn('clio-chart-workbook-tools: recalc', error);
      session.setReceipt('clio_chart_workbook_receipt_recalc_failed', 'error');
    }
  }

  async function runConvert(session, mode) {
    if (!session || session.closed) return { status: 'blocked', code: 'CLOSED' };
    const adapter = session.adapter;
    if (!adapter || typeof adapter.setCell !== 'function') {
      session.setReceipt('clio_chart_workbook_receipt_unavailable', 'blocked');
      session.notify();
      return { status: 'blocked', code: 'UNAVAILABLE' };
    }
    const rg = session.range();
    const out = convertRange(adapter, session.sheet, rg, mode, {
      locale: isZhLocale() ? 'zh' : 'en',
      // 数字→文字 shows what the cell shows: the number format applied, like
      // the grid reads it. A missing displayText falls back to String(v).
      display: (r, c, v) => {
        try {
          const text = adapter.displayText(session.sheet, cellRef(r, c));
          return text != null && text !== '' ? String(text) : String(v);
        } catch (error) { return String(v); }
      },
    });
    if (out.status === 'ok') {
      await recalcStale(session);
      session.setReceipt('clio_chart_workbook_receipt_converted', 'info', [out.converted, out.unconverted]);
    } else {
      session.setReceipt('clio_chart_workbook_receipt_unavailable', 'blocked');
    }
    session.notify();
    return out;
  }

  /* --------------------------------------------------------- the commands */

  const sessionReady = (session) => !!session && !session.closed && !!session.adapter;

  const chartAvailable = () => {
    const session = activeSession();
    return sessionReady(session) && typeof session.adapter.applyModelStep === 'function' && typeof session.adapter.workbook === 'function';
  };
  const pasteFunctionAvailable = () => {
    const session = activeSession();
    return sessionReady(session) && typeof session.adapter.ensureCalc === 'function';
  };
  const convertAvailable = () => {
    const session = activeSession();
    return sessionReady(session) && typeof session.adapter.setCell === 'function';
  };
  const deleteChartAvailable = () => {
    const session = activeSession();
    if (!sessionReady(session)) return false;
    const state = overlays.get(session);
    return !!(state && state.selectedDrawing && state.selectedDrawing());
  };

  if (root.AISystem6Runtime && typeof root.AISystem6Runtime.registerCommand === 'function') {
    root.AISystem6Runtime.registerCommand('clio-chart-workbook-chart', {
      handler: () => { const session = activeSession(); ensureOverlay(session); return openChartDialog(session); },
      isAvailable: chartAvailable,
      unavailableReason: () => tr('clio_chart_workbook_reason_chart_off'),
    });
    root.AISystem6Runtime.registerCommand('clio-chart-workbook-paste-function', {
      handler: () => { const session = activeSession(); ensureOverlay(session); return openPasteFunctionDialog(session); },
      isAvailable: pasteFunctionAvailable,
      unavailableReason: () => tr('clio_chart_workbook_reason_chart_off'),
    });
    root.AISystem6Runtime.registerCommand('clio-chart-workbook-convert-text-number', {
      handler: () => { const session = activeSession(); ensureOverlay(session); return runConvert(session, 'text-number'); },
      isAvailable: convertAvailable,
      unavailableReason: () => tr('clio_chart_workbook_reason_chart_off'),
    });
    root.AISystem6Runtime.registerCommand('clio-chart-workbook-convert-text-date', {
      handler: () => { const session = activeSession(); ensureOverlay(session); return runConvert(session, 'text-date'); },
      isAvailable: convertAvailable,
      unavailableReason: () => tr('clio_chart_workbook_reason_chart_off'),
    });
    root.AISystem6Runtime.registerCommand('clio-chart-workbook-convert-number-text', {
      handler: () => { const session = activeSession(); ensureOverlay(session); return runConvert(session, 'number-text'); },
      isAvailable: convertAvailable,
      unavailableReason: () => tr('clio_chart_workbook_reason_chart_off'),
    });
    root.AISystem6Runtime.registerCommand('clio-chart-workbook-chart-delete', {
      handler: () => {
        const session = activeSession();
        const state = session && overlays.get(session);
        const drawing = state && state.selectedDrawing && state.selectedDrawing();
        if (!drawing) return { status: 'blocked', code: 'NO_SELECTION' };
        state.clearSelection();
        return removeChart(session, drawing);
      },
      isAvailable: deleteChartAvailable,
      unavailableReason: () => tr('clio_chart_workbook_reason_chart_off'),
    });
  }

  /* -------------------------------------------------------------- the API */

  root.AISystem6ClioChartWorkbookTools = Object.freeze({
    // model (DOM-free, vm-testable)
    chartKinds: () => CHART_KINDS.map((k) => ({ id: k.id, labelKey: k.labelKey, stacked: k.stacked })),
    currentRegion,
    seriesFromRange,
    resolveChart,
    buildChartDrawing,
    insertChartDrawing,
    deleteChartDrawing,
    convertRange,
    dateSerial,
    parseDateText,
    parseNumberText,
    enumerateFunctions,
    functionSignature,
    functionCategory,
    categories: () => CATEGORIES.slice(),
    describedFunctions: () => DESCRIBED.slice(),
    // rendering (browser)
    renderChart1Bit,
    // UI
    ensureOverlay,
    openChartDialog: () => openChartDialog(activeSession()),
    openPasteFunction: () => openPasteFunctionDialog(activeSession()),
    runConvert: (mode) => runConvert(activeSession(), mode),
  });
  root.AISystem6ClioChartWorkbookToolsLoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
