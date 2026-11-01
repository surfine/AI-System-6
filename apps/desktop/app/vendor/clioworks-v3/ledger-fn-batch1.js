/* ClioWorks Ledger — function batch 1: worksheet functions the VibeOffice evaluator left as keep-the-saved-value
 * stubs (ODDFPRICE, ODDFYIELD, ODDLPRICE, ODDLYIELD, EUROCONVERT) or lacked (PERCENTOF).
 *
 * Ported from GridCraft (https://github.com/storytold/gridcraft), MIT OR Apache-2.0, Copyright (c) 2026 ArtCraft
 * Team and the GridCraft contributors, commit 75f7056e1b96f7ce30f402310221ca1a6d083a17:
 *   crates/functions/src/financial/securities.rs  (odd_first, odd_last, oddfprice ... oddlyield)
 *   crates/functions/src/financial.rs             (EURO_RATES, euroconvert)
 *   crates/functions/src/math.rs                  (percentof)
 * The arithmetic is upstream's, translated function by function; argument coercion, error values and the registry
 * hookup are this suite's (the evaluator in vibeoffice/ledger/calc.js is not replaced). See docs/clioworks/ADOPTION.md,
 * "gridcraft function batches". Loaded lazily after fn-eng.js by ledger-adapter.js's CALC_MODULES; no boot bytes.
 */
(function (root) {
  'use strict';
  const L = root.L;
  const C = L.calc, M = L.model, NF = L.numfmt;
  const E = M.ERR;
  const { def, opt, isErr } = C;
  const trunc = Math.trunc;

  /* ------------------------------------------------------------------ dates */
  const parts = (v, ctx) => NF.serialToParts(v, ctx.wb.date1904, 0);
  const D2S = (y, m, d, ctx) => NF.dateToSerial(y, m, d, ctx.wb.date1904);
  const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dateOk = (d) => d >= 0 && d <= 2958465;
  /** a date `months` months from an anchor {y, m, d}, keeping end-of-month alignment; null when out of range */
  function shift(anchor, months, eom, ctx) {
    const total = anchor.y * 12 + (anchor.m - 1) + months;
    const y = Math.floor(total / 12), m = (((total % 12) + 12) % 12) + 1;
    if (y < 1900 || y > 9999) return null;
    return D2S(y, m, eom ? dim(y, m) : Math.min(anchor.d, dim(y, m)), ctx);
  }
  /** days between two dates under a basis (30/360 US for 0, European for 4, actual otherwise) */
  const dayCount = (a, b, basis, ctx) => (basis === 0 ? C.days360(a, b, false, ctx) : basis === 4 ? C.days360(a, b, true, ctx) : b - a);
  const span = (from, to, basis, ctx) => (to > from ? dayCount(from, to, basis, ctx) : 0);
  const normalLength = (start, end, freq, basis) => (basis === 1 ? end - start : basis === 3 ? 365 / freq : 360 / freq);
  const MAX_QUASI = 40000; /* most quasi-coupon periods an odd period may span */
  const freqOk = (f) => f === 1 || f === 2 || f === 4;

  /** Σ DC/NL, Σ A/NL over an odd first period, and the periods around settlement; null on #NUM! */
  function oddFirst(ctx, settle, mat, issue, first, freq, basis) {
    if (!(mat > first && first > settle && settle > issue)) return null;
    const anchor = parts(first, ctx), eom = anchor.d === dim(anchor.y, anchor.m), step = 12 / freq;
    let dc = 0, acc = 0, nq = null, frac = 0;
    for (let k = 0; ; k++) {
      if (k >= MAX_QUASI) return null;
      const end = shift(anchor, -k * step, eom, ctx), start = shift(anchor, -(k + 1) * step, eom, ctx);
      if (end == null || start == null) return null;
      const nl = normalLength(start, end, freq, basis);
      if (nl <= 0) return null;
      const from = Math.max(start, issue);
      dc += span(from, end, basis, ctx) / nl;
      acc += span(from, Math.min(settle, end), basis, ctx) / nl;
      if (start <= settle && settle < end) { nq = k; frac = span(settle, end, basis, ctx) / nl; }
      if (start <= issue) break;
    }
    if (nq == null) return null;
    /* coupons after the first coupon, up to maturity: the count of regular periods ending on or after it */
    const am = parts(mat, ctx), meom = am.d === dim(am.y, am.m);
    let n = 0;
    for (let k = 0; ; k++) {
      const d = shift(am, -k * step, meom, ctx);
      if (d == null || k > MAX_QUASI) return null;
      if (d <= first) break;
      n++;
    }
    return { n, nq, frac, dc, acc, freq };
  }
  function oddFirstPrice(t, rate, yld, red) {
    const coupon = (100 * rate) / t.freq, base = 1 + yld / t.freq, lead = t.nq + t.frac;
    let p = red / Math.pow(base, t.n + lead) + (coupon * t.dc) / Math.pow(base, lead);
    for (let k = 1; k <= t.n; k++) p += coupon / Math.pow(base, k + lead);
    return p - coupon * t.acc;
  }
  /** shared argument checks of ODDFPRICE / ODDFYIELD; returns the terms or an error value */
  function oddFirstTerms(ctx, s, m, issue, first, rate, x, red, f, basis) {
    s = trunc(s); m = trunc(m); issue = trunc(issue); first = trunc(first); f = trunc(f); basis = trunc(opt(basis, 0));
    if (![s, m, issue, first].every(dateOk) || !freqOk(f) || basis < 0 || basis > 4 || rate < 0 || red <= 0) return E.NUM;
    return oddFirst(ctx, s, m, issue, first, f, basis) || E.NUM;
  }
  def('ODDFPRICE', 8, 9, 'nnnnnnnnn', (ctx, s, m, issue, first, rate, yld, red, f, basis) => {
    const t = oddFirstTerms(ctx, s, m, issue, first, rate, yld, red, f, basis);
    if (isErr(t)) return t;
    if (yld < 0) return E.NUM;
    const p = oddFirstPrice(t, rate, yld, red);
    return isFinite(p) ? p : E.NUM;
  });
  def('ODDFYIELD', 8, 9, 'nnnnnnnnn', (ctx, s, m, issue, first, rate, pr, red, f, basis) => {
    const t = oddFirstTerms(ctx, s, m, issue, first, rate, pr, red, f, basis);
    if (isErr(t)) return t;
    if (pr <= 0) return E.NUM;
    /* the price falls as the yield rises: bracket the root, then bisect */
    const g = (y) => oddFirstPrice(t, rate, y, red) - pr;
    let lo = -0.999999 * t.freq, hi = 1, guard = 0;
    while (g(hi) > 0 && guard < 60) { hi *= 2; guard++; }
    if (!(g(lo) >= 0 && g(hi) <= 0)) return E.NUM; /* NaN fails both */
    for (let i = 0; i < 200; i++) { const mid = 0.5 * (lo + hi); if (g(mid) > 0) lo = mid; else hi = mid; }
    return 0.5 * (lo + hi);
  });

  /** Σ DC/NL, Σ A/NL and Σ DSC/NL over an odd last period; null on #NUM! */
  function oddLast(ctx, settle, mat, last, freq, basis) {
    if (!(mat > settle && settle > last)) return null;
    const anchor = parts(last, ctx), eom = anchor.d === dim(anchor.y, anchor.m), step = 12 / freq;
    let dc = 0, acc = 0, dsc = 0, start = last;
    for (let k = 1; ; k++) {
      if (k > MAX_QUASI) return null;
      const end = shift(anchor, k * step, eom, ctx);
      if (end == null) return null;
      const nl = normalLength(start, end, freq, basis);
      if (nl <= 0) return null;
      const stop = Math.min(end, mat);
      dc += span(start, stop, basis, ctx) / nl;
      acc += span(start, Math.min(settle, stop), basis, ctx) / nl;
      dsc += span(Math.max(settle, start), stop, basis, ctx) / nl;
      if (end >= mat) break;
      start = end;
    }
    return { dc, acc, dsc };
  }
  function oddLastTerms(ctx, s, m, last, rate, red, f, basis) {
    s = trunc(s); m = trunc(m); last = trunc(last); f = trunc(f); basis = trunc(opt(basis, 0));
    if (![s, m, last].every(dateOk) || !freqOk(f) || basis < 0 || basis > 4 || rate < 0 || red <= 0) return E.NUM;
    const t = oddLast(ctx, s, m, last, f, basis);
    return t ? Object.assign(t, { f }) : E.NUM;
  }
  def('ODDLPRICE', 7, 8, 'nnnnnnnn', (ctx, s, m, last, rate, yld, red, f, basis) => {
    const t = oddLastTerms(ctx, s, m, last, rate, red, f, basis);
    if (isErr(t)) return t;
    if (yld < 0) return E.NUM;
    const coupon = (100 * rate) / t.f;
    const p = (red + t.dc * coupon) / (1 + (t.dsc * yld) / t.f) - t.acc * coupon;
    return isFinite(p) ? p : E.NUM;
  });
  def('ODDLYIELD', 7, 8, 'nnnnnnnn', (ctx, s, m, last, rate, pr, red, f, basis) => {
    const t = oddLastTerms(ctx, s, m, last, rate, red, f, basis);
    if (isErr(t)) return t;
    if (pr <= 0) return E.NUM;
    const coupon = (100 * rate) / t.f, paid = pr + t.acc * coupon;
    if (paid <= 0 || t.dsc <= 0) return E.NUM;
    return ((red + t.dc * coupon - paid) / paid) * (t.f / t.dsc);
  });

  /* -------------------------------------------------------------- EUROCONVERT */
  /* Irrevocable conversion rates in units per euro (Council Regulation (EC) No 2866/98 as amended) and the
     calculation precision in decimals, as Microsoft documents EUROCONVERT. */
  const EURO = {
    BEF: [40.3399, 0], LUF: [40.3399, 0], DEM: [1.95583, 2], ESP: [166.386, 0], FRF: [6.55957, 2], IEP: [0.787564, 2],
    ITL: [1936.27, 0], NLG: [2.20371, 2], ATS: [13.7603, 2], PTE: [200.482, 0], FIM: [5.94573, 2], GRD: [340.75, 0],
    SIT: [239.64, 2], EUR: [1, 2],
  };
  const roundHalfAway = (x, d) => { const k = Math.pow(10, d); return (Math.sign(x) * Math.round(Math.abs(x) * k)) / k; };
  const sigDigits = (x, n) => (x === 0 || !isFinite(x) ? x : Number(x.toPrecision(n)));
  def('EUROCONVERT', 3, 5, 'nssbn', (ctx, x, src, tgt, full, tri) => {
    const a = EURO[String(src).trim().toUpperCase()], b = EURO[String(tgt).trim().toUpperCase()];
    if (!a || !b) return E.VALUE;
    const triangulation = tri === undefined || tri === C.MISSING ? null : trunc(tri);
    if (triangulation != null && triangulation < 3) return E.VALUE;
    const s = String(src).trim().toUpperCase(), t = String(tgt).trim().toUpperCase();
    if (s === t) return x;
    let euros = x / a[0];
    if (s !== 'EUR' && triangulation != null) euros = sigDigits(euros, Math.min(triangulation, 17));
    const out = euros * b[0];
    return opt(full, false) ? out : roundHalfAway(out, b[1]);
  });

  /* ---------------------------------------------------------------- PERCENTOF */
  /* PERCENTOF(data_subset, data_all) = SUM(data_subset) / SUM(data_all); #DIV/0! when the total is 0. */
  def('PERCENTOF', 2, 2, 'rr', (ctx, part, all) => {
    const p = C.nums([part], ctx), a = C.nums([all], ctx);
    if (isErr(p)) return p;
    if (isErr(a)) return a;
    const sum = (xs) => xs.reduce((s, x) => s + x, 0), total = sum(a);
    return total === 0 ? E.DIV0 : sum(p) / total;
  });

  /* ------------------------------------------------------------- FORECAST.ETS */
  /* ETS(A,A,A) additive exponential smoothing over an evenly spaced timeline (Hyndman et al. 2008). Excel does not
     document its optimiser, so fitted parameters, and the last digits of a forecast on noisy data, can differ from
     Excel's; exact data (straight lines, exactly repeating seasons) forecasts exactly either way. */
  const MAX_POINTS = 200000, MAX_SEASON = 8760, MAX_MISSING = 0.3, INIT_POINTS = 10, NM_ITERATIONS = 400;
  const present = (v) => v !== undefined && v !== C.MISSING;
  /** a whole-number option, or null when omitted; #NUM! (as an error value) when not finite */
  const whole = (v) => (!present(v) ? null : isFinite(v) ? trunc(v) : E.NUM);
  /** seasonality: 1 detects, 0 none, 2..8760 the season length */
  function seasonArg(v) {
    const w = whole(v);
    if (w === null || w === 1) return 'detect';
    if (isErr(w)) return w;
    if (w === 0) return 'none';
    return w >= 2 && w <= MAX_SEASON ? w : E.NUM;
  }
  function completionArg(v) { const w = whole(v); return w === null || w === 1 ? true : isErr(w) ? w : w === 0 ? false : E.NUM; }
  const AGG = { 0: 'avg', 1: 'avg', 2: 'count', 3: 'counta', 4: 'max', 5: 'median', 6: 'min', 7: 'sum' };
  function aggregateArg(v) { const w = whole(v); return w === null ? 'avg' : isErr(w) ? w : AGG[w] || E.NUM; }
  /** collect the three options at the given argument positions; an error value on a bad one */
  function etsOptions(args, seasonAt, completionAt, aggregateAt) {
    const season = seasonAt == null ? 'detect' : seasonArg(args[seasonAt]);
    const interpolate = completionArg(args[completionAt]), aggregate = aggregateArg(args[aggregateAt]);
    for (const o of [season, interpolate, aggregate]) if (isErr(o)) return o;
    return { season, interpolate, aggregate };
  }

  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const r = a % b; a = b; b = r; } return a; };
  /** { month: months since year 0, day } of a serial; null for serial day 0 */
  function monthParts(t, ctx) {
    const f = Math.floor(t);
    if (f < 1) return null;
    const d = parts(f, ctx);
    return d && d.d >= 1 ? { month: d.y * 12 + d.m - 1, day: d.d, y: d.y, m: d.m } : null;
  }
  function axisPosition(ax, t, ctx) {
    if (ax.kind === 'lin') return (t - ax.t0) / ax.step;
    const d = monthParts(t, ctx);
    if (!d) return null;
    const dm = dim(d.y, d.m), anchor = ax.day == null ? dm : Math.min(ax.day, dm);
    return ((d.month - ax.month0) + (d.day - anchor + (t - Math.floor(t))) / dm) / ax.step;
  }
  /** the axis of sorted, distinct time stamps: a constant step (missing points allowed) or a constant number of calendar months */
  function detectAxis(times, ctx) {
    if (times.length < 2) return E.NUM;
    let step = Infinity;
    for (let i = 1; i < times.length; i++) step = Math.min(step, times[i] - times[i - 1]);
    if (isFinite(step) && step > 0) {
      let even = true;
      for (let i = 1; i < times.length && even; i++) { const r = (times[i] - times[i - 1]) / step; if (Math.abs(r - Math.round(r)) > 1e-6) even = false; }
      if (even) return { kind: 'lin', t0: times[0], step };
    }
    const months = [];
    let sameDay = null, allSame = true, allEnd = true;
    for (const t of times) {
      if (t !== Math.floor(t)) return E.NUM;
      const d = monthParts(t, ctx);
      if (!d) return E.NUM;
      months.push(d.month);
      if (sameDay == null) sameDay = d.day; else if (sameDay !== d.day) allSame = false;
      if (d.day !== dim(d.y, d.m)) allEnd = false;
    }
    let day;
    if (allSame) day = sameDay; else if (allEnd) day = null; else return E.NUM;
    let g = 0;
    for (let i = 1; i < months.length; i++) { const d = months[i] - months[i - 1]; if (d <= 0) return E.NUM; g = gcd(g, d); }
    const first = monthParts(times[0], ctx);
    if (g <= 0 || !first) return E.NUM;
    return { kind: 'mon', month0: first.month, step: g, day };
  }
  function aggregate(kind, xs) {
    const n = xs.length;
    if (kind === 'count' || kind === 'counta') return n;
    if (!n) return null;
    switch (kind) {
      case 'avg': return xs.reduce((a, b) => a + b, 0) / n;
      case 'sum': return xs.reduce((a, b) => a + b, 0);
      case 'max': return Math.max(...xs);
      case 'min': return Math.min(...xs);
      default: { const s = xs.slice().sort((a, b) => a - b), k = n >> 1; return n % 2 ? s[k] : (s[k - 1] + s[k]) / 2; }
    }
  }
  /** missing points become the straight line between their known neighbours (the nearest known value at either end) */
  function interpolate(slots) {
    const out = [];
    let prev = null, nextAt = 0;
    const nextKnown = (from) => { for (let j = from; j < slots.length; j++) if (slots[j] != null) return j; return -1; };
    nextAt = nextKnown(0);
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] != null) { out.push(slots[i]); prev = i; nextAt = nextKnown(i + 1); continue; }
      const nx = nextAt >= 0 ? nextAt : null;
      if (prev != null && nx != null) out.push(slots[prev] + ((slots[nx] - slots[prev]) * (i - prev)) / (nx - prev));
      else if (prev != null) out.push(slots[prev]);
      else if (nx != null) out.push(slots[nx]);
      else out.push(0);
    }
    return out;
  }
  /** builds the series: pairs values with time stamps, sorts, aggregates duplicates, checks the step, completes missing points */
  function buildSeries(valuesArg, timelineArg, opts, ctx) {
    const va = C.toArr(valuesArg).d.flat(), ta = C.toArr(timelineArg).d.flat();
    if (va.length !== ta.length) return E.NA;
    if (va.length > MAX_POINTS) return E.NUM;
    const points = [];
    for (let i = 0; i < ta.length; i++) {
      const t = ta[i], v = va[i];
      if (isErr(t)) return t;
      if (isErr(v)) return v;
      let value;
      if (typeof v === 'number') value = v; else if (v == null) value = null; else return E.VALUE;
      let time;
      if (typeof t === 'number' && isFinite(t)) time = t;
      else if (t == null && value == null) continue; /* a blank row is ignored */
      else return E.VALUE;
      points.push([time, value]);
    }
    points.sort((a, b) => a[0] - b[0]);
    const times = [];
    for (const [t] of points) if (!times.length || times[times.length - 1] !== t) times.push(t);
    if (times.length < 2) return E.NUM;
    const ax = detectAxis(times, ctx);
    if (isErr(ax)) return ax;
    const first = times[0], last = times[times.length - 1];
    const lastPos = axisPosition(ax, last, ctx);
    if (lastPos == null) return E.NUM;
    const spanN = Math.round(lastPos);
    if (!(spanN >= 1 && spanN < MAX_POINTS)) return E.NUM;
    const len = spanN + 1, slots = new Array(len).fill(null);
    let group = [], groupAt = null;
    const flush = () => { if (groupAt != null) slots[groupAt] = aggregate(opts.aggregate, group); group = []; };
    for (const [t, v] of points) {
      const pp = axisPosition(ax, t, ctx);
      if (pp == null) return E.NUM;
      const p = Math.round(pp);
      if (!(p >= 0 && p < len)) return E.NUM;
      if (groupAt !== p) { flush(); groupAt = p; }
      if (v != null) group.push(v);
    }
    flush();
    const known = slots.filter((x) => x != null).length;
    if (known === 0 || len - known > MAX_MISSING * len) return E.NUM;
    const y = opts.interpolate ? interpolate(slots) : slots.map((x) => (x == null ? 0 : x));
    return { y, ax, step: ax.kind === 'lin' ? ax.step : (last - first) / spanN, ctx };
  }
  /** position of a time stamp relative to the last point (0 = last point, 1 = next step) */
  function horizon(series, t) {
    const pp = axisPosition(series.ax, t, series.ctx);
    if (pp == null) return E.NUM;
    const h = pp - (series.y.length - 1);
    return !isFinite(h) || h < -1e-9 ? E.NUM : Math.max(h, 0);
  }

  /** least-squares line through [x, y] pairs: [intercept, slope] (slope 0 for one point) */
  function line(pts) {
    let n = 0, sx = 0, sy = 0;
    for (const [x, y] of pts) { n++; sx += x; sy += y; }
    if (!n) return [0, 0];
    const mx = sx / n, my = sy / n;
    let sxy = 0, sxx = 0;
    for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) * (x - mx); }
    const b = sxx > 0 ? sxy / sxx : 0;
    return [my - b * mx, b];
  }
  function detrend(y) { const [a, b] = line(y.map((v, i) => [i, v])); return y.map((v, i) => v - (a + b * i)); }
  /** the detected season length, 0 when the series shows none */
  function detectSeason(y) {
    const n = y.length;
    if (n < 4) return 0;
    const r = detrend(y);
    const variance = r.reduce((s, v) => s + v * v, 0), scale = y.reduce((s, v) => s + v * v, 0);
    if (!(isFinite(variance) && variance > 1e-20 * Math.max(scale, Number.MIN_VALUE))) return 0;
    const maxLag = Math.min(n >> 1, MAX_SEASON), acf = [];
    for (let k = 0; k <= Math.min(maxLag + 1, n - 1); k++) { let s = 0; for (let i = k; i < n; i++) s += r[i] * r[i - k]; acf.push(s / variance); }
    const bound = 2 / Math.sqrt(n);
    let best = 0, bestR = bound;
    for (let k = 2; k <= maxLag; k++) {
      if (acf[k - 1] === undefined || acf[k] === undefined) break;
      const next = acf[k + 1] === undefined ? -Infinity : acf[k + 1];
      if (acf[k] > acf[k - 1] && acf[k] >= next && acf[k] > bestR) { best = k; bestR = acf[k]; }
    }
    return best;
  }
  /** initial states (Hyndman et al. 2008, section 2.6.1) */
  function initialStates(y, m) {
    const n = y.length, season = new Array(m).fill(0);
    if (m >= 2) {
      if (n >= 2 * m) {
        /* classical decomposition of the first seasons: a centred moving average as the trend */
        const len = Math.max(Math.min(n, 4 * m), 2 * m), w = y.slice(0, len), prefix = [0];
        let acc = 0;
        for (const v of w) { acc += v; prefix.push(acc); }
        const sum = (a, b) => prefix[b] - prefix[a], h = m >> 1, totals = new Array(m).fill(0), counts = new Array(m).fill(0);
        for (let t = h; t < w.length - h; t++) {
          const ma = m % 2 === 1 ? sum(t - h, t + h + 1) / m : (sum(t - h + 1, t + h) + (w[t - h] + w[t + h]) / 2) / m;
          totals[t % m] += w[t] - ma; counts[t % m]++;
        }
        for (let i = 0; i < m; i++) season[i] = counts[i] > 0 ? totals[i] / counts[i] : 0;
      } else {
        /* under two seasons: deviations from a straight line through the data */
        const r = detrend(y), counts = new Array(m).fill(0);
        r.forEach((v, t) => { season[t % m] += v; counts[t % m]++; });
        for (let i = 0; i < m; i++) if (counts[i] > 0) season[i] /= counts[i];
      }
      const mean = season.reduce((a, b) => a + b, 0) / m;
      for (let i = 0; i < m; i++) season[i] -= mean;
    }
    const adjusted = y.slice(0, Math.min(n, INIT_POINTS)).map((v, t) => [t + 1, v - (m >= 2 ? season[t % m] || 0 : 0)]);
    const [level, trend] = line(adjusted);
    return { level, trend, season };
  }
  /** runs the filter over the data; `errors` collects the one-step errors when given */
  function runFilter(y, init, p, errors) {
    const [alpha, beta, gamma] = p, m = init.season.length, season = init.season.slice();
    let l = init.level, b = init.trend, sse = 0;
    for (let t = 0; t < y.length; t++) {
      const s = m > 0 ? season[t % m] : 0, e = y[t] - (l + b + s);
      if (m > 0) season[t % m] = s + gamma * e;
      l = l + b + alpha * e; b += alpha * beta * e; sse += e * e;
      if (errors) errors.push(e);
    }
    return { level: l, trend: b, season, sse };
  }
  const clamp01 = (p, active) => p.map((v, i) => (i < active ? Math.min(1, Math.max(0, v)) : 0));
  /** minimises the SSE over the active parameters (alpha, beta and, with seasonality, gamma) in [0, 1] */
  function optimise(y, init) {
    const active = init.season.length ? 3 : 2;
    const f = (p) => { const sse = runFilter(y, init, clamp01(p, active)).sse; return isFinite(sse) ? sse : Infinity; };
    const GRID = [0.05, 0.25, 0.5, 0.75, 0.95];
    let best = [[0.5, 0.1, 0.1], Infinity];
    for (const a of GRID) for (const b of GRID) for (const g of active === 3 ? GRID : [GRID[0]]) {
      const p = clamp01([a, b, g], active), v = f(p);
      if (v < best[1]) best = [p, v];
    }
    /* Nelder-Mead from the best grid point, clamped to the box */
    let simplex = [best];
    for (let i = 0; i < active; i++) {
      const p = best[0].slice();
      p[i] = p[i] > 0.5 ? p[i] - 0.1 : p[i] + 0.1;
      const q = clamp01(p, active);
      simplex.push([q, f(q)]);
    }
    const lerp = (a, b, t) => clamp01(a.map((x, i) => x + t * (b[i] - x)), active);
    const byValue = (a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
    for (let it = 0; it < NM_ITERATIONS; it++) {
      simplex.sort(byValue);
      const lo = simplex[0], hi = simplex[simplex.length - 1], second = simplex.length >= 2 ? simplex[simplex.length - 2][1] : hi[1];
      let size = 0;
      for (const s of simplex) { let d = 0; for (let i = 0; i < 3; i++) d = Math.max(d, Math.abs(s[0][i] - lo[0][i])); size = Math.max(size, d); }
      if (Math.abs(hi[1] - lo[1]) <= 1e-12 * Math.abs(lo[1]) + 1e-300 || size < 1e-7) break;
      const k = Math.max(simplex.length - 1, 1), c = [0, 0, 0];
      for (const s of simplex.slice(0, simplex.length - 1)) for (let i = 0; i < 3; i++) c[i] += s[0][i] / k;
      const reflected = lerp(c, hi[0], -1), fr = f(reflected);
      let replace = null;
      if (fr < lo[1]) {
        const expanded = lerp(c, hi[0], -2), fe = f(expanded);
        replace = fe < fr ? [expanded, fe] : [reflected, fr];
      } else if (fr < second) replace = [reflected, fr];
      else { const contracted = lerp(c, hi[0], 0.5), fc = f(contracted); if (fc < hi[1]) replace = [contracted, fc]; }
      if (replace) simplex[simplex.length - 1] = replace;
      else for (let i = 1; i < simplex.length; i++) { const p = lerp(lo[0], simplex[i][0], 0.5); simplex[i] = [p, f(p)]; }
    }
    simplex.sort(byValue);
    return clamp01(simplex[0] ? simplex[0][0] : best[0], active);
  }
  function fit(y, m) {
    m = m >= 2 ? m : 0;
    const init = initialStates(y, m), p = optimise(y, init), errors = [];
    const state = runFilter(y, init, p, errors);
    const [alpha, beta, gamma] = p;
    const at = (k) => {
      const s = m > 0 ? state.season[Math.floor((((y.length - 1 + k) % m) + m) % m)] || 0 : 0;
      return state.level + k * state.trend + s;
    };
    return {
      alpha, beta, gamma, m, errors,
      /** point forecast h steps after the last point (fractional steps interpolate) */
      forecast(h) { const lo = Math.floor(h), a = at(lo); return h === lo ? a : a + (h - lo) * (at(lo + 1) - a); },
      /** standard deviation of the forecast error h steps ahead */
      sd(h) {
        const sigma2 = state.sse / Math.max(y.length, 1), k = Math.max(Math.ceil(h), 1) - 1, a = alpha, b = alpha * beta, g = gamma;
        let sum = k * a * a + a * b * k * (k + 1) + (b * b * k * (k + 1) * (2 * k + 1)) / 6;
        if (m > 0) { const q = Math.floor(k / m); sum += 2 * g * (q * a + (b * m * q * (q + 1)) / 2) + g * g * q; }
        return Math.sqrt(Math.max(sigma2 * (1 + sum), 0));
      },
    };
  }
  function prepare(values, timeline, opts, ctx) {
    const series = buildSeries(values, timeline, opts, ctx);
    if (isErr(series)) return series;
    return { series, m: opts.season === 'detect' ? detectSeason(series.y) : opts.season === 'none' ? 0 : opts.season };
  }

  def('FORECAST.ETS', 3, 6, 'naannnn', (ctx, target, values, timeline, season, completion, agg) => {
    const opts = etsOptions([null, null, null, season, completion, agg], 3, 4, 5);
    if (isErr(opts)) return opts;
    const p = prepare(values, timeline, opts, ctx);
    if (isErr(p)) return p;
    const h = horizon(p.series, target);
    return isErr(h) ? h : fit(p.series.y, p.m).forecast(h);
  });
  def('FORECAST.ETS.CONFINT', 3, 7, 'naannnnn', (ctx, target, values, timeline, level, season, completion, agg) => {
    level = present(level) ? level : 0.95;
    if (!(level > 0 && level < 1)) return E.NUM;
    const opts = etsOptions([null, null, null, null, season, completion, agg], 4, 5, 6);
    if (isErr(opts)) return opts;
    const p = prepare(values, timeline, opts, ctx);
    if (isErr(p)) return p;
    const h = horizon(p.series, target);
    return isErr(h) ? h : C.special.normInv((1 + level) / 2) * fit(p.series.y, p.m).sd(h);
  });
  def('FORECAST.ETS.SEASONALITY', 2, 4, 'aannn', (ctx, values, timeline, completion, agg) => {
    const opts = etsOptions([null, null, undefined, completion, agg], null, 3, 4);
    if (isErr(opts)) return opts;
    const p = prepare(values, timeline, opts, ctx);
    return isErr(p) ? p : p.m;
  });
  def('FORECAST.ETS.STAT', 3, 6, 'aannnnn', (ctx, values, timeline, type, season, completion, agg) => {
    if (!isFinite(type) || !(trunc(type) >= 1 && trunc(type) < 9)) return E.NUM;
    const kind = trunc(type);
    const opts = etsOptions([null, null, null, season, completion, agg], 3, 4, 5);
    if (isErr(opts)) return opts;
    const p = prepare(values, timeline, opts, ctx);
    if (isErr(p)) return p;
    if (kind === 8) return p.series.step;
    const y = p.series.y, f = fit(y, p.m), n = Math.max(f.errors.length, 1);
    const mae = f.errors.reduce((s, e) => s + Math.abs(e), 0) / n;
    switch (kind) {
      case 1: return f.alpha;
      case 2: return f.beta;
      case 3: return f.gamma;
      case 4: {
        let sum = 0;
        for (let i = 1; i < y.length; i++) sum += Math.abs(y[i] - y[i - 1]);
        const d = sum / Math.max(y.length - 1, 1);
        return d === 0 ? E.DIV0 : mae / d;
      }
      case 5: {
        let sum = 0, cnt = 0;
        y.forEach((v, i) => { const e = f.errors[i], denom = (Math.abs(v) + Math.abs(v - e)) / 2; if (denom > 0) { sum += Math.abs(e) / denom; cnt++; } });
        return sum / Math.max(cnt, 1);
      }
      case 6: return mae;
      default: return Math.sqrt(f.errors.reduce((s, e) => s + e * e, 0) / n);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
