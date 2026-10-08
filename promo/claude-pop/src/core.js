// core.js: canvas, song data, maths, beat clock, lyrics, colour and dither, pixel text, pixel primitives,
// sprites, product icons, offscreen buffers and whole-frame effects.
//
// The picture is a 640x360 canvas upscaled 3x nearest-neighbour. Nothing here antialiases: draw with these
// helpers (or ctx.fillRect / ctx.drawImage at integer coordinates). Never ctx.arc, ctx.stroke, ctx.fillText,
// gradients, shadowBlur or globalAlpha blends: dither instead.
'use strict';

const W = 640, H = 360, FPS = 60;
const cv = document.getElementById('screen');
let ctx = cv.getContext('2d');           // every helper draws to this; offscreen() swaps it temporarily
ctx.imageSmoothingEnabled = false;
let T = 0;                               // song time of the frame being drawn (main sets it)

// =====================================================================================================
// Song data. data/data.js (written by music/export_timing.py) defines LYRICS, SECTIONS, BEATS, BARS, HITS,
// DUR (and maybe BPM). While the song does not exist yet, safe defaults keep the page working.
// Only window properties are assigned here, so nothing clashes with const declarations in data.js.
// =====================================================================================================
const SONG_MISSING = typeof LYRICS === 'undefined' && typeof DUR === 'undefined';
(function songDefaults() {
  const g = window, num = x => typeof x === 'number' ? x : x && (x.t ?? x.time ?? x.start ?? x.s);
  if (typeof LYRICS === 'undefined') g.LYRICS = [];
  if (typeof DUR === 'undefined') g.DUR = 150;
  if (typeof BPM === 'undefined') {
    const b = typeof BEATS !== 'undefined' && BEATS.length > 1 ? BEATS.map(num) : null;
    g.BPM = b ? 60 * (b.length - 1) / (b[b.length - 1] - b[0]) : 120;
  }
  if (typeof BEATS === 'undefined') g.BEATS = Array.from({ length: Math.ceil(DUR * BPM / 60) + 1 }, (_, i) => i * 60 / BPM);
  if (typeof BARS === 'undefined') g.BARS = BEATS.filter((_, i) => i % 4 === 0);
  if (typeof SECTIONS === 'undefined') g.SECTIONS = [];
  if (typeof HITS === 'undefined') g.HITS = [];
})();
const SPB = 60 / BPM;                    // seconds per beat
const _num = x => typeof x === 'number' ? x : x && +(x.t ?? x.time ?? x.start ?? x.s ?? 0);
const _beatT = BEATS.map(_num), _barT = BARS.map(_num);
// HITS may be [{name, t}], [[name, t]] or {name: t | [t, ...]}: normalised to a sorted [{name, t}].
const _hits = (() => {
  const out = [];
  if (Array.isArray(HITS)) for (const h of HITS) {
    if (Array.isArray(h)) out.push({ name: String(h[0]), t: +h[1] });
    else if (typeof h === 'number') out.push({ name: 'hit', t: h });
    else if (h) out.push({ ...h, name: String(h.name ?? h.id ?? h.kind ?? 'hit'), t: _num(h) });
  } else if (HITS && typeof HITS === 'object') for (const k in HITS) for (const v of [].concat(HITS[k])) out.push({ name: k, t: _num(v) });
  return out.filter(h => isFinite(h.t)).sort((a, b) => a.t - b.t);
})();
// LYRICS lines: {id, section, voice, text, start, end, words: [{w, start, end}]}. Missing fields are filled in.
for (const [i, l] of LYRICS.entries()) {
  l.id = l.id ?? 'l' + i; l.text = l.text ?? (l.words || []).map(w => w.w ?? w.text ?? w.word).join(' ');
  l.voice = l.voice ?? 'lead';
  if (!l.words || !l.words.length) l.words = l.text.split(/\s+/).filter(Boolean).map(w => ({ w }));
  for (const w of l.words) { w.w = w.w ?? w.text ?? w.word ?? ''; }
  const timed = l.words.every(w => isFinite(w.start) && isFinite(w.end));
  if (l.start == null) l.start = timed ? l.words[0].start : 0;
  if (l.end == null) l.end = timed ? l.words[l.words.length - 1].end : l.start + l.words.length * SPB;
  if (!timed) l.words.forEach((w, j, a) => { w.start = l.start + (l.end - l.start) * j / a.length; w.end = l.start + (l.end - l.start) * (j + 1) / a.length; });
  l.words.forEach((w, j) => { w.i = j; w.line = l; });
}
LYRICS.sort((a, b) => a.start - b.start);
// SECTIONS: [{name, start, end, label}] in seconds (converted from beats when needed).
for (const [i, s] of SECTIONS.entries()) {
  if (s.start == null && s.startBeat != null) s.start = s.startBeat * SPB;
  if (s.end == null && s.beats != null && s.start != null) s.end = s.start + s.beats * SPB;
  if (s.end == null) s.end = SECTIONS[i + 1] ? (SECTIONS[i + 1].start ?? SECTIONS[i + 1].startBeat * SPB) : DUR;
}

// =====================================================================================================
// Maths. Every frame is a pure function of time: use hash() for randomness, never Math.random or Date.
// =====================================================================================================
const R = Math.round, fl = Math.floor;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => b === a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)); // 0..1 progress of t through [a, b]
const ease = k => k * k * (3 - 2 * k);                      // smoothstep
const easeIn = k => k * k * k;
const easeOut = k => 1 - (1 - k) ** 3;
const easeInOut = k => k < .5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
const backOut = (k, s = 1.70158) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2;
const elasticOut = k => k <= 0 ? 0 : k >= 1 ? 1 : 2 ** (-10 * k) * Math.sin((k * 10 - .75) * 2.0944) + 1;
const bounceOut = k => { const n = 7.5625, d = 2.75; if (k < 1 / d) return n * k * k; if (k < 2 / d) return n * (k -= 1.5 / d) * k + .75; if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + .9375; return n * (k -= 2.625 / d) * k + .984375; };
const stepped = (k, n) => Math.floor(clamp(k) * n) / n;      // quantise motion (choppy, period-correct animation)
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; // 0..1
const hash2 = (x, y) => hash(x * 57.31 + y * 311.13);
const pick = (seed, arr) => arr[Math.floor(hash(seed) * arr.length) % arr.length];
const noise1 = x => { const i = Math.floor(x), f = x - i; return lerp(hash(i), hash(i + 1), ease(f)); }; // smooth 0..1
// keys(t, [[t0, v0], [t1, v1], ...], easeFn) -> value: eased interpolation through timed keyframes (numbers or arrays)
function keys(t, ks, e = ease) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) if (t < ks[i][0]) {
    const a = ks[i - 1], b = ks[i], k = e(prog(t, a[0], b[0]));
    return Array.isArray(a[1]) ? a[1].map((v, j) => lerp(v, b[1][j], k)) : lerp(a[1], b[1], k);
  }
  return ks[ks.length - 1][1];
}
// track(t, [[t, x, y], ...]) -> [x, y] rounded: an eased path through timed waypoints
const track = (t, ks, e = ease) => keys(t, ks.map(k => [k[0], [k[1], k[2]]]), e).map(R);
function bsearch(arr, t) { // index of the last element <= t (-1 if none)
  let a = 0, b = arr.length;
  while (a < b) { const m = (a + b) >> 1; if (arr[m] <= t) a = m + 1; else b = m; }
  return a - 1;
}
const since = (list, t = T) => { const i = bsearch(list, t); return i < 0 ? Infinity : t - list[i]; };

// =====================================================================================================
// Beat clock (from BEATS / BARS, so it follows the song exactly, swing and all).
// =====================================================================================================
function _frac(arr, t, per) { // fractional index of t in a sorted list of onset times
  const n = arr.length;
  if (n < 2) return t / per;
  if (t < arr[0]) return (t - arr[0]) / (arr[1] - arr[0]);
  const i = bsearch(arr, t);
  if (i >= n - 1) return n - 1 + (t - arr[n - 1]) / (arr[n - 1] - arr[n - 2]);
  return i + (t - arr[i]) / (arr[i + 1] - arr[i]);
}
function _time(arr, x, per) { // inverse of _frac
  const n = arr.length;
  if (n < 2) return x * per;
  if (x < 0) return arr[0] + x * (arr[1] - arr[0]);
  const i = Math.floor(x);
  if (i >= n - 1) return arr[n - 1] + (x - n + 1) * (arr[n - 1] - arr[n - 2]);
  return lerp(arr[i], arr[i + 1], x - i);
}
const beatAt = (t = T) => _frac(_beatT, t, SPB);            // fractional beat index (0 = first beat)
const barAt = (t = T) => _frac(_barT, t, SPB * 4);          // fractional bar index
const beatTime = n => _time(_beatT, n, SPB);               // seconds of (fractional) beat n
const barTime = n => _time(_barT, n, SPB * 4);
const beatPhase = (t = T, div = 1) => { const p = beatAt(t) / div; return p - Math.floor(p); }; // 0..1 within div beats
const barPhase = (t = T) => { const p = barAt(t); return p - Math.floor(p); };
const pulse = (t = T, div = 1, sharp = 5) => Math.exp(-sharp * beatPhase(t, div));   // 1 on each beat, decaying
const kick = (t = T, sharp = 9) => Math.exp(-sharp * Math.max(0, t - barTime(Math.floor(barAt(t))))); // 1 on each bar downbeat
const onBeat = (t = T, n = 1) => Math.floor(beatAt(t) / n);  // integer beat counter (in units of n beats)
const beatsIn = (t, t0) => beatAt(t) - beatAt(t0);          // beats elapsed since t0
// named accents from HITS
const hits = name => _hits.filter(h => !name || h.name === name || h.name.startsWith(name + ':')).map(h => h.t);
const hit = (name, nth = 0) => { const l = hits(name); return l.length ? l[Math.min(nth, l.length - 1)] : NaN; };
const hitPulse = (t = T, name, sharp = 8) => { const d = since(hits(name), t); return isFinite(d) ? Math.exp(-sharp * d) : 0; };
const sectionAt = (t = T) => SECTIONS.find(s => t >= s.start && t < s.end) || null;
const section = (name, nth = 0) => SECTIONS.filter(s => s.name === name || (s.name || '').startsWith(name))[nth] || null;

// =====================================================================================================
// Lyrics. lyric('v1a') or lyric('First words of the line') -> line; wordAt(line, 'word' | index) -> word.
// =====================================================================================================
const _fold = s => String(s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
function lyric(key, nth = 0) {
  const k = _fold(key);
  let found = LYRICS.filter(l => l.id === key);
  if (!found.length) found = LYRICS.filter(l => _fold(l.text).startsWith(k));
  if (!found.length) found = LYRICS.filter(l => _fold(l.text).includes(k));
  const l = found[nth];
  if (l) return l;
  if (!LYRICS._placeholders) LYRICS._placeholders = {};
  if (SONG_MISSING || !LYRICS.length) { // the song is not written yet: a placeholder line so chapters still draw
    const p = LYRICS._placeholders[key + nth];
    if (p) return p;
    const words = String(key).split(/\s+/).filter(Boolean).map((w, i) => ({ w, start: i * .4, end: i * .4 + .35, i }));
    const pl = { id: key, text: String(key), voice: 'lead', start: 0, end: words.length * .4, words, placeholder: true };
    words.forEach(w => w.line = pl);
    return LYRICS._placeholders[key + nth] = pl;
  }
  throw new Error('lyric not found: ' + key);
}
function wordAt(ln, which, nth = 0) {
  if (typeof which === 'number') return ln.words[which < 0 ? ln.words.length + which : which];
  const k = _fold(which);
  let ws = ln.words.filter(w => _fold(w.w) === k);
  if (!ws.length) ws = ln.words.filter(w => _fold(w.w).startsWith(k));
  if (!ws.length) ws = ln.words.filter(w => _fold(w.w).includes(k));
  if (!ws[nth]) throw new Error('word not found: ' + which + ' in "' + ln.text + '"');
  return ws[nth];
}
const lineAt = (t = T, voice) => LYRICS.find(l => t >= l.start && t < l.end && (!voice || l.voice === voice)) || null;
const lastLine = (t = T, voice) => { let r = null; for (const l of LYRICS) if (l.start <= t && (!voice || l.voice === voice)) r = l; return r; };
const nextLine = (t = T, voice) => LYRICS.find(l => l.start > t && (!voice || l.voice === voice)) || null;
const wordNow = (t = T, ln = lineAt(t)) => ln ? ln.words.find(w => t >= w.start && t < w.end) || null : null;
const wordProgress = (w, t = T) => prog(t, w.start, w.end);
const wordP = wordProgress;
const lineProgress = (ln, t = T) => prog(t, ln.start, ln.end);
const wordsSung = (ln, t = T) => ln.words.filter(w => w.start <= t).length;          // words started so far
const wordPulse = (ln, t = T, sharp = 10) => { let d = Infinity; for (const w of ln.words) if (w.start <= t) d = t - w.start; return isFinite(d) ? Math.exp(-sharp * d) : 0; };
// a lyric line's words joined back into rows that fit maxW (for layout); cached
const sungText = (ln, t = T) => ln.words.filter(w => w.start <= t).map(w => w.w).join(' ');

// =====================================================================================================
// Colour. C = named colours. P = the current era's palette roles (eras.js fills it on setEra).
// =====================================================================================================
const C = {
  black: '#000000', white: '#ffffff', g1: '#111111', g2: '#222222', g3: '#333333', g4: '#444444', g5: '#555555',
  g6: '#666666', g7: '#777777', g8: '#888888', g9: '#999999', ga: '#aaaaaa', gb: '#bbbbbb', gc: '#cccccc',
  gd: '#dddddd', ge: '#eeeeee', red: '#dd0000', orange: '#ff6600', yellow: '#ffcc00', green: '#00aa00',
  blue: '#0000dd', cyan: '#00aaff', magenta: '#dd0099', tip: '#ffffcc',
};
let P = { desk: C.white, text: C.black, win: C.white, frame: C.black, face: C.white, hi: C.white, shadow: C.black, sel: C.black, selText: C.white };
const _rgbCache = new Map();
function rgb(c) {
  let v = _rgbCache.get(c);
  if (v) return v;
  const h = c.replace('#', '');
  v = h.length === 3 ? [...h].map(x => parseInt(x + x, 16)) : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  _rgbCache.set(c, v); return v;
}
const hex = (r, g, b) => '#' + [r, g, b].map(v => clamp(R(v), 0, 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, k) => { const x = rgb(a), y = rgb(b); return hex(lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)); };
const lighten = (c, k) => mix(c, '#ffffff', k);
const darken = (c, k) => mix(c, '#000000', k);
const luma = c => { const [r, g, b] = rgb(c); return (r * 299 + g * 587 + b * 114) / 255000; };

// =====================================================================================================
// Dither. Ordered (Bayer 4x4) fills give greys in 1-bit, pseudo-transparency and stepped gradients.
// =====================================================================================================
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BAYER8 = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
const _patCache = new Map();
function _pattern(key, w, h, paint) {
  let p = _patCache.get(key);
  if (p) return p;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), d = g.createImageData(w, h);
  paint(d.data, w, h);
  g.putImageData(d, 0, 0);
  p = ctx.createPattern(c, 'repeat'); p._canvas = c;
  _patCache.set(key, p);
  return p;
}
function _put(data, i, c) { if (!c) return; const v = rgb(c); data[i] = v[0]; data[i + 1] = v[1]; data[i + 2] = v[2]; data[i + 3] = 255; }
// bayerPat(level, c1, c2): a fillStyle; level 0..1 = share of c1 pixels over c2 (c2 null = transparent)
function bayerPat(level, c1, c2 = null) {
  const n = clamp(R(level * 16), 0, 16);
  return _pattern('b' + n + c1 + c2, 4, 4, (d) => { for (let i = 0; i < 16; i++) _put(d, i * 4, BAYER4[i] < n ? c1 : c2); });
}
// noisePat(level, c1, c2): like bayerPat but with an irregular (hashed) threshold: frosted glass instead of a screen
function noisePat(level, c1, c2 = null) {
  const n = clamp(R(level * 32), 0, 32);
  return _pattern('n' + n + c1 + c2, 32, 32, (d) => { for (let i = 0; i < 1024; i++) { const x = i & 31, y = i >> 5, v = (hash2(x * 1.37 + .11, y * 2.21 + .37) * 24 + BAYER4[(y & 3) * 4 + (x & 3)] / 2) / 32 * 32; _put(d, i * 4, v < n ? c1 : c2); } });
}
const frost = (x, y, w, h, c, k) => { ctx.fillStyle = noisePat(k, c, null); ctx.fillRect(R(x), R(y), R(w), R(h)); };
// bayer(x, y, w, h, level, c1, c2): fill a rect with an ordered dither (c2 null leaves those pixels untouched)
function bayer(x, y, w, h, level, c1, c2 = null) {
  if (level <= 0 && !c2) return;
  ctx.fillStyle = level >= 1 ? c1 : level <= 0 ? c2 : bayerPat(level, c1, c2);
  ctx.fillRect(R(x), R(y), R(w), R(h));
}
const dither = (x, y, w, h, c1 = C.black, c2 = C.white) => bayer(x, y, w, h, .5, c1, c2); // 50% checkerboard
const veil = (x, y, w, h, c, k) => bayer(x, y, w, h, k, c, null);  // pseudo-transparent tint of colour c at strength k
// Classic 8x8 one-bit patterns (rows as bytes, MSB = left pixel). patfill(x, y, w, h, 'gray', ink, paper)
const PATS = {
  gray: [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55], ltgray: [0x88, 0x22, 0x88, 0x22, 0x88, 0x22, 0x88, 0x22],
  dkgray: [0x77, 0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77, 0xdd], dots: [0x80, 0, 0, 0, 0x08, 0, 0, 0], grid: [0xff, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80],
  dotgrid: [0x80, 0, 0, 0, 0, 0, 0, 0], hstripe: [0xff, 0, 0xff, 0, 0xff, 0, 0xff, 0], diag: [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
  diag2: [0x11, 0x22, 0x44, 0x88, 0x11, 0x22, 0x44, 0x88], brick: [0xff, 0x80, 0x80, 0x80, 0xff, 0x08, 0x08, 0x08], weave: [0x88, 0x54, 0x22, 0x45, 0x88, 0x15, 0x22, 0x51],
  scales: [0x80, 0x80, 0x41, 0x3e, 0x08, 0x08, 0x14, 0xe3], tweed: [0x84, 0x48, 0x30, 0x0c, 0x02, 0x01, 0x01, 0x02],
};
function patfill(x, y, w, h, pat, ink = C.black, paper = C.white) {
  const bits = typeof pat === 'string' ? PATS[pat] : pat;
  ctx.fillStyle = _pattern('p' + bits.join(',') + ink + paper, 8, 8, d => { for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) _put(d, (yy * 8 + xx) * 4, bits[yy] & (128 >> xx) ? ink : paper); });
  ctx.fillRect(R(x), R(y), R(w), R(h));
}
// Stepped, dithered gradients. stops: ['#fff', '#ccc', ...] evenly spaced, or [[0, '#fff'], [.3, '#ccc'], ...].
// steps = solid bands per stop interval (dithered in between). Cached as a 4px strip pattern.
function _stops(stops) { return typeof stops[0] === 'string' ? stops.map((c, i) => [i / (stops.length - 1), c]) : stops; }
function _gradAt(st, k, steps) {
  let i = 0; while (i < st.length - 2 && k > st[i + 1][0]) i++;
  const a = st[i], b = st[i + 1] || a, f = b[0] === a[0] ? 0 : clamp((k - a[0]) / (b[0] - a[0])), q = f * steps, lo = Math.min(Math.floor(q), steps - 1);
  return [mix(a[1], b[1], lo / steps), mix(a[1], b[1], (lo + 1) / steps), q - lo];
}
function gradPat(len, stops, vertical = true, steps = 4) {
  const st = _stops(stops), key = 'g' + len + (vertical ? 'v' : 'h') + steps + JSON.stringify(st);
  return _pattern(key, vertical ? 4 : len, vertical ? len : 4, (d, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const along = vertical ? y : x, k = len > 1 ? along / (len - 1) : 0, [c0, c1, f] = _gradAt(st, k, steps);
      _put(d, (y * w + x) * 4, BAYER4[(y & 3) * 4 + (x & 3)] < R(f * 16) ? c1 : c0);
    }
  });
}
function vgrad(x, y, w, h, stops, steps = 4) { if (h < 1 || w < 1) return; x = R(x); y = R(y); ctx.save(); ctx.translate(x, y); ctx.fillStyle = gradPat(R(h), stops, true, steps); ctx.fillRect(0, 0, R(w), R(h)); ctx.restore(); }
function hgrad(x, y, w, h, stops, steps = 4) { if (h < 1 || w < 1) return; x = R(x); y = R(y); ctx.save(); ctx.translate(x, y); ctx.fillStyle = gradPat(R(w), stops, false, steps); ctx.fillRect(0, 0, R(w), R(h)); ctx.restore(); }

// =====================================================================================================
// Pixel primitives. All coordinates are rounded; every shape is built from 1px-tall spans.
// =====================================================================================================
function rect(x, y, w, h, c) { if (w <= 0 || h <= 0) return; ctx.fillStyle = c; ctx.fillRect(R(x), R(y), R(w), R(h)); }
function frame(x, y, w, h, c, t = 1) { x = R(x); y = R(y); w = R(w); h = R(h); rect(x, y, w, t, c); rect(x, y + h - t, w, t, c); rect(x, y + t, t, h - 2 * t, c); rect(x + w - t, y + t, t, h - 2 * t, c); }
const hline = (x, y, w, c) => rect(x, y, w, 1, c);
const vline = (x, y, h, c) => rect(x, y, 1, h, c);
function line(x0, y0, x1, y1, c, w = 1) { // Bresenham, square pen of width w
  x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1); ctx.fillStyle = c;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, o = w >> 1;
  let err = dx - dy;
  for (let n = 0; n < 5000; n++) {
    ctx.fillRect(x0 - o, y0 - o, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}
function dline(x0, y0, x1, y1, c, on = 1, off = 1) { // dotted / dashed Bresenham
  x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1); ctx.fillStyle = c;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (let n = 0; n < 5000; n++) {
    if (n % (on + off) < on) ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}
function path(pts, c, w = 1) { for (let i = 1; i < pts.length; i++) line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c, w); }
// spans: per-row left insets of a shape inside its w x h box (cached); used by every filled shape below
const _spanCache = new Map();
function ovalSpans(w, h) {
  const key = 'o' + w + 'x' + h; let s = _spanCache.get(key);
  if (s) return s;
  s = [];
  for (let j = 0; j < h; j++) { const yy = (j + .5) / h * 2 - 1, hw = w / 2 * Math.sqrt(Math.max(0, 1 - yy * yy)); s.push(clamp(R(w / 2 - hw), 0, Math.floor(w / 2))); }
  _spanCache.set(key, s); return s;
}
function rrSpans(w, h, r) {
  r = Math.max(0, Math.min(R(r), Math.floor(w / 2), Math.floor(h / 2)));
  const key = 'r' + w + 'x' + h + 'r' + r; let s = _spanCache.get(key);
  if (s) return s;
  s = new Array(h).fill(0);
  for (let j = 0; j < r; j++) { const yy = r - j - .5, ins = R(r - Math.sqrt(Math.max(0, r * r - yy * yy))); s[j] = ins; s[h - 1 - j] = ins; }
  _spanCache.set(key, s); return s;
}
function spanFill(x, y, w, s, c) { x = R(x); y = R(y); if (c) ctx.fillStyle = c; for (let j = 0; j < s.length; j++) if (w - 2 * s[j] > 0) ctx.fillRect(x + s[j], y + j, w - 2 * s[j], 1); }
function spanFrame(x, y, w, s, c, t = 1) { // 1px outline of a span shape (t > 1 draws nested outlines)
  x = R(x); y = R(y); ctx.fillStyle = c; const h = s.length;
  for (let j = 0; j < h; j++) {
    if (j < t || j >= h - t) { ctx.fillRect(x + s[j], y + j, w - 2 * s[j], 1); continue; }
    const run = Math.max(t, Math.max(s[j - 1], s[j + 1]) - s[j]);
    ctx.fillRect(x + s[j], y + j, run, 1); ctx.fillRect(x + w - s[j] - run, y + j, run, 1);
  }
}
const oval = (x, y, w, h, c) => spanFill(x, y, R(w), ovalSpans(R(w), R(h)), c);           // filled ellipse in a box
const ovalFrame = (x, y, w, h, c, t = 1) => spanFrame(x, y, R(w), ovalSpans(R(w), R(h)), c, t);
const disc = (cx, cy, r, c) => oval(R(cx) - R(r), R(cy) - R(r), 2 * R(r) + 1, 2 * R(r) + 1, c); // filled circle around a centre
const ring = (cx, cy, r, c, t = 1) => ovalFrame(R(cx) - R(r), R(cy) - R(r), 2 * R(r) + 1, 2 * R(r) + 1, c, t);
const ell = (cx, cy, rx, ry, c) => oval(R(cx) - R(rx), R(cy) - R(ry), 2 * R(rx) + 1, 2 * R(ry) + 1, c);
const rrect = (x, y, w, h, r, c) => spanFill(x, y, R(w), rrSpans(R(w), R(h), r), c);       // rounded rect, pixel corners
const rframe = (x, y, w, h, r, c, t = 1) => spanFrame(x, y, R(w), rrSpans(R(w), R(h), r), c, t);
// gradient-filled span shapes (gel buttons, glass, traffic lights)
function spanGrad(x, y, w, s, stops, steps = 4) { x = R(x); y = R(y); ctx.save(); ctx.translate(x, y); ctx.fillStyle = gradPat(s.length, stops, true, steps); for (let j = 0; j < s.length; j++) if (w - 2 * s[j] > 0) ctx.fillRect(s[j], j, w - 2 * s[j], 1); ctx.restore(); }
const rrectGrad = (x, y, w, h, r, stops, steps) => spanGrad(x, y, R(w), rrSpans(R(w), R(h), r), stops, steps);
const ovalGrad = (x, y, w, h, stops, steps) => spanGrad(x, y, R(w), ovalSpans(R(w), R(h)), stops, steps);
function spanPat(x, y, w, s, style) { ctx.fillStyle = style; x = R(x); y = R(y); for (let j = 0; j < s.length; j++) if (w - 2 * s[j] > 0) ctx.fillRect(x + s[j], y + j, w - 2 * s[j], 1); }
const rrectVeil = (x, y, w, h, r, c, k) => { if (k > 0) spanPat(x, y, R(w), rrSpans(R(w), R(h), r), k >= 1 ? c : bayerPat(k, c, null)); };
function poly(pts, c) { // scanline polygon fill
  ctx.fillStyle = c;
  const ys = pts.map(p => p[1]), y0 = Math.ceil(Math.min(...ys) - .5), y1 = Math.floor(Math.max(...ys) - .5);
  for (let y = y0; y <= y1; y++) {
    const yc = y + .5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + (yc - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) { const a = R(xs[i]), b = R(xs[i + 1]); if (b > a) ctx.fillRect(a, y, b - a, 1); }
  }
}
const tri = (x0, y0, x1, y1, x2, y2, c) => poly([[x0, y0], [x1, y1], [x2, y2]], c);
// arrowhead triangles for scroll arrows, popups, disclosure: dir 'up' | 'down' | 'left' | 'right', size = rows
function arrowTri(x, y, size, dir, c) {
  x = R(x); y = R(y); ctx.fillStyle = c;
  for (let i = 0; i < size; i++) {
    if (dir === 'down') ctx.fillRect(x + i, y + i, 2 * (size - i) - 1, 1);
    else if (dir === 'up') ctx.fillRect(x + size - 1 - i, y + i, 2 * i + 1, 1);
    else if (dir === 'right') ctx.fillRect(x + i, y + i, 1, 2 * (size - i) - 1);
    else ctx.fillRect(x + size - 1 - i, y + i, 1, 2 * i + 1);
  }
}
// clip helpers (integer rects only, so clipping never antialiases)
function clipRect(x, y, w, h, fn) { ctx.save(); ctx.beginPath(); ctx.rect(R(x), R(y), R(w), R(h)); ctx.clip(); try { fn(); } finally { ctx.restore(); } }

// =====================================================================================================
// Pixel text. Each (string, font, colour) is rasterised once, thresholded to hard pixels and cached.
// text(str, x, y, {font, color, scale, align, outline, shadow}) -> width. y is the TOP OF THE CAPITALS.
// font is a key of FONTS, or an era role ('ui', 'title', 'small', 'body', 'mono', 'menu', 'big', 'lyric').
// =====================================================================================================
const SANS = '"Inter", "Helvetica Neue", "Liberation Sans", Arial, sans-serif';
const FONTS = {
  chicago: { css: '16px Chicago12', thr: 128, lh: 16 },                 // Chicago 12: menus, titles, buttons (1988-1997)
  chicagoFLF: { css: '13px ChicagoFLF', thr: 120, lh: 16 },
  geneva: { css: '16px Geneva9', thr: 128, lh: 12 },                    // Geneva 9: small UI text
  monaco: { css: '16px Monaco9', thr: 128, lh: 12 },                    // Monaco 9
  charcoal: { css: '600 14px Charcoal8', thr: 118, lh: 16 },             // Charcoal-ish condensed face (Platinum)
  helv: { css: '12px "Liberation Sans", Helvetica, Arial, sans-serif', thr: 100, lh: 15 },   // NeXTSTEP / Yosemite Helvetica
  helvB: { css: 'bold 12px "Liberation Sans", Helvetica, Arial, sans-serif', thr: 110, lh: 15 },
  helv11: { css: '11px "Liberation Sans", Helvetica, Arial, sans-serif', thr: 96, lh: 14 },
  helvB11: { css: 'bold 11px "Liberation Sans", Helvetica, Arial, sans-serif', thr: 110, lh: 14 },
  lucida: { css: '11px "DejaVu Sans", "Lucida Grande", Verdana, sans-serif', thr: 100, lh: 14 },  // Aqua-era Lucida Grande
  lucidaB: { css: 'bold 11px "DejaVu Sans", "Lucida Grande", Verdana, sans-serif', thr: 110, lh: 14 },
  lucida10: { css: '10px "DejaVu Sans", "Lucida Grande", Verdana, sans-serif', thr: 96, lh: 13 },
  sf: { css: '11px ' + SANS, thr: 96, lh: 14 },                         // San Francisco-ish (Inter)
  sfB: { css: '600 11px ' + SANS, thr: 105, lh: 14 },
  sf12: { css: '12px ' + SANS, thr: 100, lh: 15 },
  sfB12: { css: '600 12px ' + SANS, thr: 108, lh: 15 },
  serif: { css: '13px "Liberation Serif", "DejaVu Serif", Georgia, serif', thr: 90, lh: 16 },   // manuscript body
  serifB: { css: 'bold 13px "Liberation Serif", "DejaVu Serif", Georgia, serif', thr: 128, lh: 16 },
  serif14: { css: '14px "Liberation Serif", "DejaVu Serif", Georgia, serif', thr: 100, lh: 17 },
  // display sizes (for lyrics and titles that must read at a glance)
  chicagoBig: { css: '26px ChicagoFLF', thr: 128, lh: 30 },
  helvBig: { css: 'bold 22px "Liberation Sans", Helvetica, Arial, sans-serif', thr: 120, lh: 26 },
  lucidaBig: { css: 'bold 20px "DejaVu Sans", "Lucida Grande", Verdana, sans-serif', thr: 120, lh: 24 },
  sfBig: { css: '700 22px ' + SANS, thr: 120, lh: 26 },
  sfHuge: { css: '800 40px ' + SANS, thr: 125, lh: 44 },
};
const defFont = (key, css, thr = 110) => { FONTS[key] = { css, thr }; _initFont(key); };
let FONTROLE = { ui: 'chicago', title: 'chicago', menu: 'chicago', small: 'geneva', body: 'geneva', mono: 'monaco', big: 'chicago', lyric: 'chicago', label: 'geneva', button: 'chicago', doc: 'geneva' };
const fontKey = f => FONTS[f] ? f : FONTS[FONTROLE[f]] ? FONTROLE[f] : 'chicago';
const _mc = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const _tc = new Map();
function _raster(str, key, color) {
  const ck = key + '\u0001' + color + '\u0001' + str;
  let c = _tc.get(ck);
  if (c) return c;
  if (_tc.size > 6000) _tc.clear();
  const f = FONTS[key];
  _mc.font = f.css;
  const w = Math.max(1, Math.ceil(_mc.measureText(str).width) + 4), h = (f.size || 16) * 2 + 4;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = f.css; g.textBaseline = 'alphabetic'; g.fillStyle = '#000';
  g.fillText(str, 1, f.base);
  const d = g.getImageData(0, 0, w, h), [r, gg, b] = rgb(color), px = d.data, thr = f.thr;
  for (let i = 0; i < px.length; i += 4) { const on = px[i + 3] >= thr; px[i] = r; px[i + 1] = gg; px[i + 2] = b; px[i + 3] = on ? 255 : 0; }
  g.putImageData(d, 0, 0);
  _tc.set(ck, c);
  return c;
}
function _initFont(key) { // find the cap top / cap height / width of a space for exact placement
  const f = FONTS[key], m = /(\d+)px/.exec(f.css);
  f.size = m ? +m[1] : 16; f.base = R(f.size * 1.25) + 1;
  const c = _raster('H', key, '#000000'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let top = -1, bot = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { if (top < 0) top = y; bot = y; }
  f.top = Math.max(0, top); f.cap = Math.max(1, bot - top + 1);
  _mc.font = f.css; f.space = _mc.measureText(' ').width;
}
function initFonts() { for (const k in FONTS) _initFont(k); _tc.clear(); }
const _twc = new Map();
function tw(str, font = 'ui', scale = 1) { // width in pixels
  const key = fontKey(font), ck = key + '\u0001' + str;
  let w = _twc.get(ck);
  if (w == null) { _mc.font = FONTS[key].css; w = R(_mc.measureText(String(str)).width); if (_twc.size > 20000) _twc.clear(); _twc.set(ck, w); }
  return w * scale;
}
const capH = (font = 'ui', scale = 1) => FONTS[fontKey(font)].cap * scale;
const lineH = (font = 'ui', scale = 1) => (FONTS[fontKey(font)].lh || R(FONTS[fontKey(font)].size * 1.3)) * scale; // comfortable line pitch
function text(str, x, y, o = {}) {
  str = String(str);
  if (!str) return 0;
  const key = fontKey(o.font || 'ui'), f = FONTS[key], s = o.scale || 1, color = o.color || P.text || C.black, w = tw(str, key, s);
  const x0 = R(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x) - s, y0 = R(y) - f.top * s;
  const put = (col, dx, dy) => { const c = _raster(str, key, col); ctx.drawImage(c, x0 + dx, y0 + dy, c.width * s, c.height * s); };
  if (o.outline) { const oc = o.outline, n = o.outlineW || s; for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) put(oc, dx * n, dy * n); }
  if (o.shadow) { const [sc, sx, sy] = Array.isArray(o.shadow) ? o.shadow : [o.shadow, 1, 1]; put(sc, sx * s, sy * s); }
  if (o.bold) put(color, s, 0);
  put(color, 0, 0);
  return w + (o.bold ? s : 0);
}
// wrap(str, maxW, font, scale) -> rows (cached). '\n' forces a break.
const _wrapc = new Map();
function wrap(str, maxW, font = 'body', scale = 1) {
  const key = fontKey(font), ck = key + '|' + maxW + '|' + scale + '|' + str;
  let rows = _wrapc.get(ck);
  if (rows) return rows;
  rows = [];
  for (const para of String(str).split('\n')) {
    let cur = '';
    for (const word of para.split(' ')) {
      const t = cur ? cur + ' ' + word : word;
      if (cur && tw(t, key, scale) > maxW) { rows.push(cur); cur = word; } else cur = t;
    }
    rows.push(cur);
  }
  if (_wrapc.size > 4000) _wrapc.clear();
  _wrapc.set(ck, rows); return rows;
}
// para(str, x, y, w, {font, color, scale, lh, align, maxRows}) -> height used
function para(str, x, y, w, o = {}) {
  const font = o.font || 'body', s = o.scale || 1, lh = o.lh || lineH(font, s), rows = wrap(str, w, font, s);
  const n = Math.min(rows.length, o.maxRows || 1e9);
  for (let i = 0; i < n; i++) text(rows[i], o.align === 'center' ? x + w / 2 : o.align === 'right' ? x + w : x, y + i * lh, { ...o, font, scale: s });
  return n * lh;
}
// typed(str, t0, t1, t) -> the part of str typed by time t: a human typist, a little uneven, deterministic
function typed(str, t0, t1, t = T) {
  const n = str.length;
  if (t <= t0) return '';
  if (t >= t1) return str;
  let acc = 0; const wts = [];
  for (let i = 0; i < n; i++) { const wgt = .6 + hash(i * 3.7 + n) * .8 + (str[i] === ' ' ? .5 : 0); wts.push(wgt); acc += wgt; }
  let k = prog(t, t0, t1) * acc, i = 0;
  while (i < n && k >= wts[i]) { k -= wts[i]; i++; }
  return str.slice(0, i);
}
const caretOn = (t = T, rate = 2) => Math.floor(t * rate * 2) % 2 === 0;   // blink phase for text carets

// kara(line, x, y, opts): a lyric line with per-word sync, in the era's own type. Returns {w, h, words: [{x, y, w, word}]}.
//   mode 'select' (default): whole line visible, sung words get the era's selection highlight (drag-select)
//   mode 'type': letters appear as they are sung, with a caret · mode 'color': unsung words dim, sung words full
//   mode 'pop': each word appears on its start with a small bounce · mode 'plain': static line
// opts: font ('lyric'), scale (2), color, dim, hi, hiText, maxW (wrap), align, lh, t, caret, upto (stop at word i)
function kara(ln, x, y, o = {}) {
  const font = fontKey(o.font || 'lyric'), s = o.scale || (FONTS[font].size >= 18 ? 1 : 2), mode = o.mode || 'select', t = o.t ?? T;
  const color = o.color || P.text, cap = capH(font, s), lh = o.lh || cap + 6 * s, sp = Math.max(s * 3, R(FONTS[font].space * s));
  const rows = [[]]; let rw = 0;
  for (const w of ln.words) {
    const ww = tw(w.w, font, s);
    if (rw && rw + ww > (o.maxW || 1e9)) { rows.push([]); rw = 0; }
    rows[rows.length - 1].push({ w, ww, x: rw }); rw += ww + sp;
  }
  let maxW = 0, caretAt = null; const out = [];
  rows.forEach((row, ri) => {
    const last = row[row.length - 1], roww = last ? last.x + last.ww : 0; maxW = Math.max(maxW, roww);
    const x0 = R(o.align === 'center' ? x - roww / 2 : o.align === 'right' ? x - roww : x), yy = R(y + ri * lh);
    if (mode === 'type' && !caretAt) caretAt = [x0, yy];
    for (const { w, ww, x: wx } of row) {
      const p = wordP(w, t), px = x0 + wx;
      out.push({ x: px, y: yy, w: ww, h: cap, word: w });
      if (mode === 'plain') { text(w.w, px, yy, { font, color, scale: s, outline: o.outline, shadow: o.shadow }); continue; }
      if (mode === 'type') {
        if (p <= 0) continue;
        const sub = w.w.slice(0, Math.max(1, Math.ceil(p * w.w.length)));
        text(sub, px, yy, { font, color, scale: s, outline: o.outline, shadow: o.shadow });
        caretAt = [px + tw(sub, font, s) + s, yy];
        continue;
      }
      if (mode === 'pop') {
        if (t < w.start) continue;
        const b = R(-3 * s * Math.exp(-14 * (t - w.start)) * Math.cos((t - w.start) * 30));
        text(w.w, px, yy + b, { font, color, scale: s, outline: o.outline, shadow: o.shadow });
        continue;
      }
      if (mode === 'color') { text(w.w, px, yy, { font, color: p > 0 ? color : (o.dim || P.textDim || C.g8), scale: s, outline: o.outline, shadow: o.shadow }); continue; }
      // select
      text(w.w, px, yy, { font, color, scale: s, outline: o.outline, shadow: o.shadow });
      if (p <= 0) continue;
      const hx = px - s, hy = yy - 2 * s, hw = R(ww * p) + (p >= 1 ? 2 * s + (w !== last.w ? sp - 2 * s : 0) : s), hh = cap + 4 * s;
      clipRect(hx, hy, hw, hh, () => { rect(hx, hy, hw + sp, hh, o.hi || P.sel); text(w.w, px, yy, { font, color: o.hiText || P.selText, scale: s }); });
    }
  });
  if (mode === 'type' && o.caret !== false && caretAt && ((t >= ln.start && t < ln.end + .05) || caretOn(t)))
    rect(caretAt[0], caretAt[1] - s, s, cap + 2 * s, color);
  return { w: maxW, h: (rows.length - 1) * lh + cap, words: out, rows: rows.length };
}

// =====================================================================================================
// Sprites from ASCII art. defSprite('name', `rows`, pal) with pal = {letter: colour}; '.' or ' ' = clear.
// spr('name', x, y, {scale, flip, flipY, tint}) draws it; sprite canvases are cached.
// =====================================================================================================
const SPAL = { K: '#000000', W: '#ffffff', g: '#808080', G: '#c0c0c0', d: '#404040', l: '#e0e0e0', R: '#dd2222', O: '#ff8800', Y: '#ffd200', E: '#22aa33', B: '#2255dd', C: '#55ccff', P: '#aa44cc', N: '#16224a', T: '#d8a070', b: '#7a4a20' };
const SPR = {};
function defSprite(name, art, pal = SPAL) {
  const rows = art.split('\n').map(r => r.replace(/\s+$/, '')).filter(r => r.trim().length).map(r => r.trim());
  const c = document.createElement('canvas'); c.width = Math.max(...rows.map(r => r.length)); c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { const col = pal[ch]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }));
  SPR[name] = c; return c;
}
const _tintc = new Map();
function tinted(c, color) { // a one-colour copy of a canvas (its opaque pixels in color)
  let m = _tintc.get(c); if (!m) _tintc.set(c, m = new Map());
  let o = m.get(color);
  if (o) return o;
  o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const g = o.getContext('2d'); g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, o.width, o.height);
  m.set(color, o); return o;
}
// recolor(canvas, {'#000000': '#1d4fb8', '#ffffff': null}): a copy with colours swapped (null = clear); cached
const _recc = new Map();
function recolor(c, map) {
  const key = JSON.stringify(map); let m = _recc.get(c); if (!m) _recc.set(c, m = new Map());
  let o = m.get(key); if (o) return o;
  o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const g = o.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0);
  const d = g.getImageData(0, 0, o.width, o.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) { if (!px[i + 3]) continue; const hx = hex(px[i], px[i + 1], px[i + 2]); if (hx in map) { const to = map[hx]; if (to == null) px[i + 3] = 0; else { const v = rgb(to); px[i] = v[0]; px[i + 1] = v[1]; px[i + 2] = v[2]; } } }
  g.putImageData(d, 0, 0); m.set(key, o); return o;
}
function spr(name, x, y, o = {}) {
  let c = typeof name === 'string' ? SPR[name] : name;
  if (!c) throw new Error('no sprite: ' + name);
  if (o.tint) c = tinted(c, o.tint);
  const s = o.scale || 1;
  if (!o.flip && !o.flipY) return ctx.drawImage(c, R(x), R(y), c.width * s, c.height * s);
  ctx.save(); ctx.translate(R(x) + (o.flip ? c.width * s : 0), R(y) + (o.flipY ? c.height * s : 0)); ctx.scale(o.flip ? -1 : 1, o.flipY ? -1 : 1);
  ctx.drawImage(c, 0, 0, c.width * s, c.height * s); ctx.restore();
}

// =====================================================================================================
// Images: the product's own icons, loaded before READY. icon(name, x, y, {size, scale, sel, set}).
// classic (System 6) icons are 1-bit SVG + mask, thresholded; later eras are PNGs with hard alpha.
// =====================================================================================================
const ASSET_ROOT = '../../apps/desktop/assets/themes/';
const ICON_NAMES = ['startupDisk', 'hardDisk', 'folder', 'document', 'applications', 'trash', 'trashFull', 'fileFloppy', 'assistant', 'quickDraft',
  'writingStudio', 'projectDisk', 'projectDisc', 'cloudModel', 'cloudModelOff', 'localModel', 'questionSheet', 'outline', 'sectionDrafts', 'manuscript',
  'reviewDesk', 'searcher', 'reader', 'timeMachine', 'docMap', 'scrapbook', 'systemFolder', 'controlPanel', 'dictionary', 'teachText', 'chatFile',
  'writingBell', 'oneMoreTune', 'doom', 'micropolis', 'openttd', 'bonsaiCity', 'lightroom', 'multiFinderApp', 'finderApp', 'soundscape', 'clioStage',
  'clioChart', 'clioPaint', 'imagePromptStudio', 'systemStatus', 'importUtility', 'helpFolder', 'systemHelp', 'chooser', 'alias', 'documents', 'writingDemo'];
const ICON_SETS = ['classic', 'system-7', 'nextstep', 'platinum', 'aqua', 'snow-leopard', 'yosemite', 'big-sur', 'liquid-glass'];
const _iconMissing = { nextstep: ['doom', 'micropolis', 'openttd', 'bonsaiCity', 'lightroom', 'imagePromptStudio'], 'big-sur': ['doom', 'micropolis', 'openttd', 'bonsaiCity', 'lightroom', 'imagePromptStudio'] };
const _iconFallback = { nextstep: ['platinum', 'system-7', 'classic'], 'big-sur': ['yosemite', 'liquid-glass', 'snow-leopard'] };
const ICONS = {};   // ICONS[set][name + '@' + size] = processed canvas
const _loading = [];
function loadImage(src) {
  return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}
function _iconFile(set, name, size, mask) {
  if (set === 'classic') return ASSET_ROOT + 'classic/icons/' + name + (mask ? '-mask-' : '-') + size + '.svg';
  if (set === 'liquid-glass') return ASSET_ROOT + 'liquid-glass/icons/' + name + '-' + size + '-default.png';
  return ASSET_ROOT + set + '/icons/' + name + '-' + size + '.png';
}
function _processIcon(img, mask, size, oneBit) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.drawImage(img, 0, 0, size, size);
  const d = g.getImageData(0, 0, size, size), px = d.data;
  let md = null;
  if (mask) { const mc = document.createElement('canvas'); mc.width = mc.height = size; const mg = mc.getContext('2d', { willReadFrequently: true }); mg.drawImage(mask, 0, 0, size, size); md = mg.getImageData(0, 0, size, size).data; }
  for (let i = 0; i < px.length; i += 4) {
    if (oneBit) { // ink where the drawing is dark and solid; paper wherever the mask covers; clear elsewhere
      const ink = px[i + 3] >= 110 && (px[i] + px[i + 1] + px[i + 2]) / 3 < 128, paper = md ? md[i + 3] >= 128 : px[i + 3] >= 128;
      const v = ink ? 0 : 255; px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = ink || paper ? 255 : 0;
    } else px[i + 3] = px[i + 3] >= 128 ? 255 : 0;
  }
  g.putImageData(d, 0, 0);
  return c;
}
function preloadIcons() {
  for (const set of ICON_SETS) {
    ICONS[set] = {};
    for (const name of ICON_NAMES) {
      if ((_iconMissing[set] || []).includes(name)) continue;
      for (const size of [32, 16]) {
        const oneBit = set === 'classic';
        _loading.push(Promise.all([loadImage(_iconFile(set, name, size)), oneBit ? loadImage(_iconFile(set, name, size, true)) : null]).then(([img, mask]) => {
          if (img) ICONS[set][name + '@' + size] = _processIcon(img, mask, size, oneBit);
        }));
      }
    }
  }
}
const IMAGES = {};
function preloadImage(key, src) { _loading.push(loadImage(src).then(im => { if (im) IMAGES[key] = im; })); }
function iconCanvas(name, size = 32, set) {
  set = set || (typeof E !== 'undefined' ? E.icons : 'classic');
  let c = ICONS[set] && ICONS[set][name + '@' + size];
  if (c) return c;
  for (const s of (_iconFallback[set] || []).concat(['platinum', 'system-7', 'classic'])) { c = ICONS[s] && ICONS[s][name + '@' + size]; if (c) return c; }
  return null;
}
const _selc = new Map();
function _selected(c, oneBit) { // classic: ink and paper swap (the Finder's inverted icon); colour: darkened
  let o = _selc.get(c);
  if (o) return o;
  o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const g = o.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0);
  const d = g.getImageData(0, 0, o.width, o.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3]) { if (oneBit) { const v = 255 - px[i]; px[i] = px[i + 1] = px[i + 2] = v; } else { px[i] >>= 1; px[i + 1] >>= 1; px[i + 2] >>= 1; } }
  g.putImageData(d, 0, 0); _selc.set(c, o); return o;
}
const _dimc = new Map();
function _dimmed(c) { // the open-icon look: a 50% dither of the icon (classic "opened" icon is grey-hatched)
  let o = _dimc.get(c);
  if (o) return o;
  o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const g = o.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0);
  const d = g.getImageData(0, 0, o.width, o.height), px = d.data;
  for (let i = 0, p = 0; i < px.length; i += 4, p++) { const x = p % o.width, y = (p / o.width) | 0; if (px[i + 3] && px[i] < 128 && ((x + y) & 1)) { px[i] = px[i + 1] = px[i + 2] = 255; } else if (px[i + 3] && (x + y) & 1) { px[i] = px[i + 1] = px[i + 2] = 0; } }
  g.putImageData(d, 0, 0); _dimc.set(c, o); return o;
}
// icon(name, x, y, opts) -> true if drawn. opts: size (32 | 16), scale (integer), sel (selected look), open (classic hatched), set
function icon(name, x, y, o = {}) {
  const size = o.size || 32, set = o.set || (typeof E !== 'undefined' ? E.icons : 'classic');
  let c = iconCanvas(name, size, set);
  if (!c) { frame(x, y, size * (o.scale || 1), size * (o.scale || 1), P.text || C.black); return false; }
  if (o.sel) c = _selected(c, set === 'classic');
  else if (o.open) c = _dimmed(c);
  if (o.tint) c = tinted(c, o.tint);
  const s = o.scale || 1;
  ctx.drawImage(c, R(x), R(y), c.width * s, c.height * s);
  return true;
}

// =====================================================================================================
// Buffers. offscreen(w, h, fn) runs drawing code into a new canvas (cache it yourself); snap(i) copies the
// frame drawn so far into buffer i (0..2 are free for scenes; 3+ are used by main and the FX).
// memo(key, w, h, fn) = offscreen() cached by key: use it for anything expensive and static.
// =====================================================================================================
function offscreen(w, h, fn, into) {
  const c = into || Object.assign(document.createElement('canvas'), { width: w, height: h }), old = ctx;
  ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  try { fn(); } finally { ctx = old; }
  return c;
}
const _memo = new Map();
function memo(key, w, h, fn) { let c = _memo.get(key); if (!c) { c = offscreen(w, h, fn); _memo.set(key, c); } return c; }
const _snaps = [];
function buffer(i) { return _snaps[i] || (_snaps[i] = Object.assign(document.createElement('canvas'), { width: W, height: H })); }
function snap(i = 0) {
  const c = buffer(i), g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'copy'; g.drawImage(cv, 0, 0); g.globalCompositeOperation = 'source-over';
  return c;
}

// =====================================================================================================
// Whole-frame effects. A scene sets fields on FX while drawing; main applies them to the finished frame
// (pointer included) in this order: dissolve · glitch · wobble · tilt/zoom/shake/dx/dy · invert · flash · crt.
//   FX.shake = px · FX.dx, FX.dy = px slide · FX.zoom = factor (FX.zoomAt = [x, y]) · FX.tilt = radians
//   FX.glitch = 0..1 row tearing · FX.wobble = px · FX.invert = true | 0..1 (dithered) · FX.flash = [colour, 0..1] (dithered)
//   FX.crt = 0..1 power-off collapse · FX.dissolve = {from: canvas, k: 0..1, style: 'dissolve'|'bayer'|'wipe'|'blinds'|'iris'|'checker'}
// =====================================================================================================
let FX = {};
const _thr = {};
function _thresholds(style) { // per-pixel order 0..255 in which a transition reveals the new frame
  if (_thr[style]) return _thr[style];
  const a = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v;
    if (style === 'bayer') v = BAYER8[(y & 7) * 8 + (x & 7)] * 4 + 2;
    else if (style === 'wipe') v = clamp(x / W * 230 + hash2(x >> 1, y >> 1) * 25, 0, 255);
    else if (style === 'blinds') v = ((y % 12) / 12) * 240 + hash2(x, y) * 15;
    else if (style === 'iris') v = clamp(Math.hypot(x - W / 2, (y - H / 2) * 1.6) / 370 * 240 + hash2(x, y) * 15, 0, 255);
    else if (style === 'checker') { const cx = x >> 4, cy = y >> 4; v = ((cx + cy) & 1) * 128 + ((y & 15) / 16) * 120 + hash2(x, y) * 7; }
    else v = hash2(x * 1.13 + .5, y * 1.71 + .25) * 256; // HyperCard-style random dissolve
    a[y * W + x] = clamp(fl(v), 0, 255);
  }
  return _thr[style] = a;
}
const _maskC = document.createElement('canvas'); _maskC.width = W; _maskC.height = H;
const _maskG = _maskC.getContext('2d', { willReadFrequently: true });
const _maskD = _maskG.createImageData(W, H), _maskU = new Uint32Array(_maskD.data.buffer);
// transition(from, k, style): on top of the current frame, keep `from` where it has not been revealed yet
function transition(from, k, style = 'dissolve') {
  if (k >= 1) return;
  const th = _thresholds(style), lim = R(clamp(k) * 256), U = _maskU;
  for (let i = 0; i < U.length; i++) U[i] = th[i] >= lim ? 0xff000000 : 0;
  _maskG.putImageData(_maskD, 0, 0);
  const tmp = buffer(5), g = tmp.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'copy'; g.drawImage(from, 0, 0);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(_maskC, 0, 0); g.globalCompositeOperation = 'source-over';
  ctx.drawImage(tmp, 0, 0);
}
function applyFX(t) {
  const f = FX, fr = Math.floor(t * FPS);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (f.dissolve && f.dissolve.from) transition(f.dissolve.from, f.dissolve.k, f.dissolve.style);
  if (f.glitch || f.wobble) {
    const s = snap(3);
    for (let y = 0; y < H; y += 2) {
      let dx = 0;
      if (f.wobble) dx += Math.sin(y * .07 + t * 9) * f.wobble;
      if (f.glitch) { const band = Math.floor(y / 10); if (hash(band * 7.3 + fr) < f.glitch * .6) dx += (hash(band + fr * 3.1) - .5) * 140 * f.glitch; }
      if (R(dx)) ctx.drawImage(s, 0, y, W, 2, R(dx), y, W, 2);
    }
  }
  if (f.tilt || (f.zoom && f.zoom !== 1) || f.shake || f.dx || f.dy) {
    const s = snap(3), sh = f.shake || 0, z = f.zoom || 1, [zx, zy] = f.zoomAt || [W / 2, H / 2];
    rect(0, 0, W, H, f.bg || C.black);
    ctx.save();
    ctx.translate(R(zx + (f.dx || 0) + (hash(fr) - .5) * 2 * sh), R(zy + (f.dy || 0) + (hash(fr + 99) - .5) * 2 * sh));
    if (f.tilt) ctx.rotate(f.tilt);
    ctx.scale(z, z);
    ctx.drawImage(s, -zx, -zy);
    ctx.restore();
  }
  if (f.invert) {
    ctx.save(); ctx.globalCompositeOperation = 'difference';
    if (f.invert === true || f.invert >= 1) rect(0, 0, W, H, C.white); else bayer(0, 0, W, H, f.invert, C.white, null);
    ctx.restore();
  }
  if (f.flash && f.flash[1] > 0) bayer(0, 0, W, H, clamp(f.flash[1]), f.flash[0], null);
  if (f.crt > 0) crtOff(f.crt);
}
function crtOff(k) { // the picture collapses to a line, then to a dot, then black
  const s = snap(3);
  rect(0, 0, W, H, C.black);
  if (k < .55) {
    const e = easeIn(k / .55), h = Math.max(2, R(H * (1 - e))), y = R((H - h) / 2);
    ctx.drawImage(s, 0, 0, W, H, 0, y, W, h);
    if (e > .4) bayer(0, y, W, h, (e - .4) / .6, C.white, null);
  } else if (k < .9) {
    const e = easeOut((k - .55) / .35), w = Math.max(2, R(W * (1 - e)));
    rect(R((W - w) / 2), H / 2 - 1, w, 2, C.white);
  } else {
    const e = (k - .9) / .1;
    if (e < .7) rect(W / 2 - 1, H / 2 - 1, 3, 2, C.white);
  }
}
