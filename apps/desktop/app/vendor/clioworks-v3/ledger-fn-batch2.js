/* ClioWorks Ledger — function batch 2: REGEXTEST, REGEXEXTRACT, REGEXREPLACE, GROUPBY, PIVOTBY.
 *
 * Ported from GridCraft (https://github.com/storytold/gridcraft), MIT OR Apache-2.0, Copyright (c) 2026 ArtCraft
 * Team and the GridCraft contributors, commit 75f7056e1b96f7ce30f402310221ca1a6d083a17:
 *   crates/functions/src/text.rs     (regextest, regexextract, regexreplace, template)
 *   crates/functions/src/dynamic.rs  (parse_agg, aggregate, prepare, distinct_keys, groupby, pivotby)
 * The arithmetic and layout rules are upstream's, translated function by function; coercion, error values and the
 * registry hookup are this suite's. Regular expressions run on the JavaScript engine, not Rust's `regex` crate (see
 * docs/clioworks/ADOPTION.md, "gridcraft function batches"). Results are plain arrays: no spill-semantics change.
 * Loaded lazily after ledger-fn-batch1.js by ledger-adapter.js's CALC_MODULES; no boot bytes.
 */
(function (root) {
  'use strict';
  const L = root.L;
  const C = L.calc, M = L.model;
  const E = M.ERR;
  const { def, isErr, MISSING } = C;
  const trunc = Math.trunc;
  const present = (v) => v !== undefined && v !== MISSING && v !== null;
  const MAX_TEXT = 32767, MAX_CELLS = 10000000;

  /* ------------------------------------------------------------------ REGEX* */
  function build(pattern, sensitive) {
    if (pattern.length > MAX_TEXT) return null;
    try { return new RegExp(pattern, 'gu' + (sensitive ? 'i' : '')); } catch (e) { return null; }
  }
  /** [case_sensitivity]: 0 case-sensitive (default), 1 insensitive; anything else is an error */
  const caseArg = (v) => { const n = present(v) ? trunc(v) : 0; return n === 0 ? false : n === 1 ? true : null; };
  def('REGEXTEST', 2, 3, 'ssn', (ctx, s, p, ci) => {
    const c = caseArg(ci), re = c == null ? null : build(p, c);
    return re ? re.test(s) : E.VALUE;
  });
  def('REGEXEXTRACT', 2, 4, 'ssnn', (ctx, s, p, mode, ci) => {
    const c = caseArg(ci), re = c == null ? null : build(p, c);
    if (!re) return E.VALUE;
    mode = present(mode) ? trunc(mode) : 0;
    if (mode === 0) { const m = re.exec(s); return m ? m[0] : E.NA; }
    if (mode === 1) { const all = [...s.matchAll(re)].map((m) => [m[0]]); return all.length ? new C.Arr(all) : E.NA; }
    if (mode === 2) {
      const m = re.exec(s);
      if (!m) return E.NA;
      if (m.length <= 1) return m[0];
      return new C.Arr([m.slice(1).map((g) => g === undefined ? '' : g)]);
    }
    return E.VALUE;
  });
  /** a replacement as pieces, the way Rust's Captures::expand reads it: `$$` is `$`, `$name` takes the longest run of
      [_0-9A-Za-z], `${name}` ends at `}`, a digit name is a group number, a `$` that starts no reference is itself */
  function template(rep) {
    const out = [];
    let lit = '', rest = rep, i;
    while ((i = rest.indexOf('$')) >= 0) {
      lit += rest.slice(0, i); rest = rest.slice(i + 1);
      if (rest[0] === '$') { lit += '$'; rest = rest.slice(1); continue; }
      let name, after, braced = false;
      const b = rest[0] === '{' ? rest.indexOf('}') : -1;
      if (b >= 0) { name = rest.slice(1, b); after = rest.slice(b + 1); braced = true; }
      else { const m = /^[_0-9A-Za-z]*/.exec(rest)[0]; name = m; after = rest.slice(m.length); }
      if (!braced && name === '') { lit += '$'; continue; }
      if (lit) { out.push(lit); lit = ''; }
      out.push(/^\d+$/.test(name) ? { i: +name } : { n: name });
      rest = after;
    }
    lit += rest;
    if (lit) out.push(lit);
    return out;
  }
  const expand = (m, pieces) => pieces.map((p) => (typeof p === 'string' ? p : p.i !== undefined ? m[p.i] || '' : (m.groups && m.groups[p.n]) || '')).join('');
  def('REGEXREPLACE', 3, 5, 'sssnn', (ctx, s, p, rep, occ, ci) => {
    const c = caseArg(ci), re = c == null ? null : build(p, c);
    if (!re) return E.VALUE;
    const pieces = template(rep.replace(/\$(\d+)/g, '${$1}')), o = present(occ) ? trunc(occ) : 0, limit = MAX_TEXT * 4;
    const matches = [...s.matchAll(re)];
    let out = '', last = 0;
    const take = o === 0 ? matches : (() => { const k = Math.abs(o), i = o > 0 ? k - 1 : matches.length - k; return matches[i] ? [matches[i]] : []; })();
    for (const m of take) {
      out += s.slice(last, m.index) + expand(m, pieces);
      if (out.length > limit) return E.VALUE;
      last = m.index + m[0].length;
    }
    out += s.slice(last);
    return out.length > MAX_TEXT ? E.VALUE : out;
  });

  /* --------------------------------------------------------- GROUPBY / PIVOTBY */
  const AGG_NUM = { 1: 'avg', 101: 'avg', 2: 'count', 102: 'count', 3: 'counta', 103: 'counta', 4: 'max', 104: 'max', 5: 'min', 105: 'min',
    6: 'prod', 106: 'prod', 7: 'stdevs', 107: 'stdevs', 8: 'stdevp', 108: 'stdevp', 9: 'sum', 109: 'sum', 10: 'vars', 110: 'vars',
    11: 'varp', 111: 'varp', 12: 'median' };
  const AGG_NAME = { SUM: 'sum', AVERAGE: 'avg', COUNT: 'count', COUNTA: 'counta', MAX: 'max', MIN: 'min', PRODUCT: 'prod', MEDIAN: 'median',
    'STDEV.S': 'stdevs', STDEV: 'stdevs', 'STDEV.P': 'stdevp', STDEVP: 'stdevp', 'VAR.S': 'vars', VAR: 'vars', 'VAR.P': 'varp', VARP: 'varp' };
  /** the function argument: a built-in aggregation name ('SUM', a bare SUM, or a code number) or a LAMBDA; error value otherwise */
  function aggArg(node, ctx) {
    if (node && node.t === 'name') { const k = AGG_NAME[String(node.name).toUpperCase().replace(/^_XLFN\./, '')]; if (k) return { kind: k }; }
    const v = C.ev(node, ctx), x = v instanceof C.Arr ? v.d[0][0] : v;
    if (isErr(x)) return x;
    if (x && x.lambda) return { lambda: x };
    if (typeof x === 'number') return AGG_NUM[trunc(x)] ? { kind: AGG_NUM[trunc(x)] } : E.VALUE;
    if (typeof x === 'string') { const k = AGG_NAME[x.trim().toUpperCase().replace(/^_XLFN\./, '')]; return k ? { kind: k } : E.VALUE; }
    return E.VALUE;
  }
  function aggregate(kind, vals) {
    if (kind === 'counta') return vals.filter((v) => v != null).length;
    const xs = [];
    for (const v of vals) {
      if (typeof v === 'number') xs.push(v);
      else if (isErr(v) && kind !== 'count') return v;
    }
    const n = xs.length, sum = xs.reduce((a, b) => a + b, 0);
    const variance = (d) => { if (n - d <= 0) return E.DIV0; const m = sum / n; return xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - d); };
    switch (kind) {
      case 'sum': return sum;
      case 'count': return n;
      case 'avg': return n ? sum / n : E.DIV0;
      case 'max': return n ? Math.max(...xs) : 0;
      case 'min': return n ? Math.min(...xs) : 0;
      case 'prod': return n ? xs.reduce((a, b) => a * b, 1) : 0;
      case 'median': { if (!n) return E.NUM; const s = xs.slice().sort((a, b) => a - b), m = n >> 1; return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
      case 'vars': return variance(1);
      case 'varp': return variance(0);
      case 'stdevs': { const v = variance(1); return isErr(v) ? v : Math.sqrt(v); }
      default: { const v = variance(0); return isErr(v) ? v : Math.sqrt(v); }
    }
  }
  const aggregateWith = (f, vals, ctx) => (f.lambda ? C.scalarOut(C.callLambda(f.lambda, [new C.Arr(vals.map((v) => [v]))], ctx), ctx) : aggregate(f.kind, vals));
  const arr = (v) => C.toArr(v);
  const get = (A, r, c) => (A.d[r] && A.d[r][c] !== undefined ? A.d[r][c] : null);
  const rowKey = (k) => k.map((v) => { const s = v == null ? 'e' : typeof v === 'number' ? 'n' + (v === 0 ? 0 : v) : typeof v === 'string' ? 't' + v.toLowerCase() : typeof v === 'boolean' ? 'b' + v : 'x' + (v.e || ''); return s.length + ':' + s; }).join('');
  const keyRow = (A, r) => Array.from({ length: A.cols }, (_, c) => get(A, r, c));
  /** compare key rows; a blank stays last even when descending */
  function cmpKeys(a, b, orders) {
    for (let i = 0; i < orders.length; i++) {
      const x = a[i], y = b[i];
      if (x === undefined || y === undefined) continue;
      let o = C.compare(x, y);
      if (orders[i] < 0) { if (x == null && y == null) o = 0; else if (x == null) o = 1; else if (y == null) o = -1; else o = -o; }
      if (o) return o;
    }
    return 0;
  }
  /** distinct keys in first-seen order, then sorted (sort = +-column index within the key; 0 or none: all ascending) */
  function distinctKeys(keys, sort) {
    const seen = new Set(), out = [];
    for (const k of keys) { const s = rowKey(k); if (!seen.has(s)) { seen.add(s); out.push(k); } }
    const width = out.length ? out[0].length : 0, i = Math.abs(sort);
    if (sort !== 0 && i >= 1 && i <= width) {
      const asc = new Array(width).fill(1);
      return out.sort((a, b) => cmpKeys([a[i - 1]], [b[i - 1]], [Math.sign(sort)]) || cmpKeys(a, b, asc));
    }
    return out.sort((a, b) => cmpKeys(a, b, new Array(width).fill(1)));
  }
  const optCount = (v) => (present(v) ? (isFinite(v) && Math.abs(v) <= 1e15 ? trunc(v) : E.NUM) : null);
  const truthy = (v) => (isErr(v) ? v : v == null ? false : typeof v === 'string' ? E.VALUE : !!v);
  /** field_headers: 0 none, 1 present but hidden, 2 generate, 3 present and shown; omitted = automatic */
  function prepare(fields, values, fh, filter) {
    const n = values.rows;
    for (const f of fields) if (f.rows !== n) return E.VALUE;
    const isText = (v) => typeof v === 'string';
    const firstText = Array.from({ length: values.cols }, (_, c) => get(values, 0, c)).every(isText);
    const secondNot = n > 1 && Array.from({ length: values.cols }, (_, c) => get(values, 1, c)).some((v) => !isText(v));
    let mode;
    if (fh == null) mode = firstText && secondNot ? 3 : 0;
    else if (fh >= 0 && fh <= 3) mode = fh; else return E.VALUE;
    const hasHdr = mode === 1 || mode === 3, show = mode >= 2;
    const fieldHeaders = [];
    let k = 0;
    for (const f of fields) for (let c = 0; c < f.cols; c++) { k++; fieldHeaders.push(hasHdr ? get(f, 0, c) : 'Field ' + k); }
    const valueHeaders = Array.from({ length: values.cols }, (_, c) => (hasHdr ? get(values, 0, c) : 'Value ' + (c + 1)));
    const rows = [];
    const flat = filter ? filter.d.flat() : null;
    for (let r = hasHdr ? 1 : 0; r < n; r++) {
      if (flat) { const t = truthy(flat[r] === undefined ? null : flat[r]); if (isErr(t)) return t; if (!t) continue; }
      rows.push(r);
    }
    return { fieldHeaders, valueHeaders, show, rows };
  }
  const fromRows = (rows) => {
    const h = rows.length, w = Math.max(0, ...rows.map((r) => r.length));
    if (!h || !w) return E.CALC;
    if (h * w > MAX_CELLS) return E.NUM;
    return new C.Arr(rows.map((r) => { const o = r.slice(); while (o.length < w) o.push(null); return o; }));
  };
  const optArr = (v) => (present(v) ? arr(v) : null);
  const errOf = (...vs) => vs.find((v) => isErr(v));

  def('GROUPBY', 3, 8, 'aalvvvav', (ctx, rfArg, valArg, fnode, fhArg, totalArg, sortArg, filterArg) => {
    const rf = arr(rfArg), vals = arr(valArg), f = aggArg(fnode, ctx);
    if (isErr(f)) return f;
    const fh = optCount(fhArg), total = optCount(totalArg), sort = optCount(sortArg);
    const bad = errOf(fh, total, sort); if (bad) return bad;
    const filter = optArr(filterArg);
    const p = prepare([rf], vals, fh, filter);
    if (isErr(p)) return p;
    const totalDepth = total == null ? 1 : total, sortOrder = sort == null ? 1 : sort;
    const keys = p.rows.map((r) => keyRow(rf, r)), groups = new Map();
    keys.forEach((k, i) => { const s = rowKey(k); if (!groups.has(s)) groups.set(s, []); groups.get(s).push(p.rows[i]); });
    const aggRow = (rows) => Array.from({ length: vals.cols }, (_, col) => aggregateWith(f, rows.map((r) => get(vals, r, col)), ctx));
    const ordered = distinctKeys(keys, Math.abs(sortOrder) <= rf.cols ? sortOrder : 0);
    const lines = ordered.map((k) => k.concat(aggRow(groups.get(rowKey(k)) || [])));
    if (Math.abs(sortOrder) > rf.cols) { const ci = Math.abs(sortOrder) - 1; lines.sort((a, b) => cmpKeys([a[ci]], [b[ci]], [Math.sign(sortOrder)])); }
    const out = [];
    if (p.show) out.push(p.fieldHeaders.concat(p.valueHeaders));
    const totalLine = ['Total'];
    while (totalLine.length < rf.cols) totalLine.push(null);
    totalLine.push(...aggRow(p.rows));
    if (totalDepth < 0) { out.push(totalLine); out.push(...lines); } else { out.push(...lines); if (totalDepth > 0) out.push(totalLine); }
    return fromRows(out);
  });

  def('PIVOTBY', 4, 11, 'aaalvvvvvav', (ctx, rfArg, cfArg, valArg, fnode, fhArg, rtArg, rsArg, ctArg, csArg, filterArg) => {
    const rf = arr(rfArg), cf = arr(cfArg), vals = arr(valArg), f = aggArg(fnode, ctx);
    if (isErr(f)) return f;
    const fh = optCount(fhArg), rt = optCount(rtArg), rs = optCount(rsArg), ct = optCount(ctArg), cs = optCount(csArg);
    const bad = errOf(fh, rt, rs, ct, cs); if (bad) return bad;
    const rowTotal = rt == null ? 1 : rt, rowSort = rs == null ? 1 : rs, colTotal = ct == null ? 1 : ct, colSort = cs == null ? 1 : cs;
    const p = prepare([rf, cf], vals, fh, optArr(filterArg));
    if (isErr(p)) return p;
    const rkeys = p.rows.map((r) => keyRow(rf, r)), ckeys = p.rows.map((r) => keyRow(cf, r));
    const rk = distinctKeys(rkeys, Math.abs(rowSort) <= rf.cols ? rowSort : 0), ck = distinctKeys(ckeys, Math.abs(colSort) <= cf.cols ? colSort : 0);
    const cell = new Map();
    rkeys.forEach((r, i) => { const s = rowKey(r) + '|' + rowKey(ckeys[i]); if (!cell.has(s)) cell.set(s, []); cell.get(s).push(p.rows[i]); });
    const agg = (rows, c) => (rows.length ? aggregateWith(f, rows.map((r) => get(vals, r, c)), ctx) : null);
    const rowsFor = (r, c) => {
      const rs2 = r && rowKey(r), cs2 = c && rowKey(c);
      return p.rows.filter((_, i) => (!rs2 || rs2 === rowKey(rkeys[i])) && (!cs2 || cs2 === rowKey(ckeys[i])));
    };
    let cols = ck.map((k) => k);
    if (colTotal > 0) cols.push(null); else if (colTotal < 0) cols.unshift(null);
    const lead = rf.cols, valueRow = vals.cols > 1 || p.show, headerRows = cf.cols + (valueRow ? 1 : 0);
    const bodyRows = rk.length + (rowTotal !== 0 ? 1 : 0);
    if ((headerRows + bodyRows) * (cols.length * vals.cols + lead) > MAX_CELLS) return E.NUM;
    const out = [];
    for (let level = 0; level < cf.cols; level++) {
      const line = new Array(lead).fill(null);
      for (const c of cols) for (let v = 0; v < vals.cols; v++) line.push(c ? (c[level] === undefined ? null : c[level]) : level === 0 ? 'Total' : null);
      out.push(line);
    }
    if (valueRow) {
      const line = p.show ? p.fieldHeaders.slice(0, lead) : [];
      while (line.length < lead) line.push(null);
      for (let i = 0; i < cols.length; i++) line.push(...p.valueHeaders);
      out.push(line);
    }
    const body = (r) => {
      const line = r ? r.slice() : ['Total'];
      while (line.length < lead) line.push(null);
      for (const c of cols) {
        const rows = r && c ? cell.get(rowKey(r) + '|' + rowKey(c)) || [] : rowsFor(r, c);
        for (let v = 0; v < vals.cols; v++) line.push(agg(rows, v));
      }
      return line;
    };
    if (rowTotal < 0) out.push(body(null));
    for (const k of rk) out.push(body(k));
    if (rowTotal > 0) out.push(body(null));
    return fromRows(out);
  });
})(typeof window !== 'undefined' ? window : globalThis);
