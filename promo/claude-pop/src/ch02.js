// ch02 · verse 1, the route (12.00-28.00). Clio chants the route; the desk obeys, the writer works.
// Scenes: 'ch02 spin' · 'ch02 ask' · 'ch02 clip' · 'ch02 outline' (one pure frame function, era system6, screen).
'use strict';
{
// ---- STORYBOARD §4: the home desk, verbatim (c02_ prefix) ----
const c02_MS = ['# The Tide Comes In Twice', 'They never called it renewable energy. They called it the tide, and they billed it by the moon.', 'Twice a day the estuary fills'];
const c02_INV = c => { const [r, g, b] = rgb(c); return hex(255 - r, 255 - g, 255 - b); };
const c02_HINT = ['Sounds like you.', 'Sounds like a mouthpiece.'];
const c02_youProp = s => (x, y, w, h) => { const f = 'menu'; text(s, x + w, y + R((h - capH(f)) / 2), { font: f, align: 'right', color: P.menuText }); };
let c02_PERIOD = [0, 0];
function c02_homeDesk(t, o = {}) {
  const neg = !!o.neg, verm = neg ? c02_INV(FIELDS.vermilion) : FIELDS.vermilion;
  UI.menu = { app: 'AI System 6', prop: c02_youProp(o.hint || c02_HINT[0]), propW: 128, ...(o.menu || {}) };
  const doc = o.doc === false ? null : APP.teachText(8, 30, 268, 164, { title: 'Manuscript', lines: o.lines || c02_MS, ...(o.doc || {}) });
  if (doc) { const r = doc.rows[doc.rows.length - 1]; c02_PERIOD = [r.x + r.w + 1, r.y + capH('doc') - 1]; rect(c02_PERIOD[0], c02_PERIOD[1], 2, 2, verm); }
  const chatH = E.dock ? 110 : 116;
  const chat = o.chat === false ? null : APP.clioTalk(8, 202, 268, chatH, { msgs: o.msgs || [], actions: o.actions, hero: false, input: o.input, ...(o.chat || {}) });
  deskIcon(460, 22, 'hardDisk', 'Project Hard Disk');
  floppyDrive(404, 70, 'A:', 'floppyA', t, { compact: true });
  floppyDrive(404, 150, 'B:', 'floppyB', t, { compact: true });
  ejectDisk(412, 230, undefined, { t });
  if (!E.dock) { deskIcon(336, 296, 'scrapbook', 'Scrapbook'); deskIcon(404, 296, 'sectionDrafts', 'Section Drafts'); deskIcon(466, 296, 'projectDisc', 'Project CD'); trashIcon(286, 296, false); }
  if (o.clio !== false) clio(286, 196, { scale: 3, mouth: 'sing', expr: 'sing', ...(o.clio || {}) });
  if (o.after) o.after({ doc, chat });
  if (o.cur) {
    const [cx, cy] = o.cur; CUR = { x: cx, y: cy, kind: o.cur[2] || 'arrow' };
    penCord([[cx + 5, cy + 15], [cx + 9, cy + 37]], { sag: 6, swing: 3, t });
    pen(cx + 9, cy + 74, Math.PI / 2, 1, neg ? { t, color: C.black, outline: C.white, flash: false } : { t });
  }
  return { doc, chat, period: c02_PERIOD };
}
// STORYBOARD §2.1, verbatim
function c02_lens(t, keys) { let k = null; for (const q of keys) if (q[0] <= t) k = q; if (k && k[3] > 1) stepZoom(k[3], k[1], k[2]); return k; }

// ---- song times (data.js only; the literals below are offsets) ----
const c02_V = section('verse1'), [c02_A, c02_B, c02_C, c02_E, c02_D] = ['v1a', 'v1b', 'v1c', 'v1c_echo', 'v1d'].map(id => lyric(id));
const c02_w = (L, s, n) => wordAt(L, s, n || 0).start;
const c02_ev = (name, t) => evTimes(name).find(x => x >= t - 1e-6);
const c02_T = {
  spin: c02_w(c02_A, 'Spin'), the1: c02_w(c02_A, 'the'), hard: c02_w(c02_A, 'hard'), disk: c02_w(c02_A, 'disk.'), feed: c02_w(c02_A, 'Feed'), the2: c02_w(c02_A, 'the', 1), floppy: c02_w(c02_A, 'floppy.'),
  ask: c02_w(c02_B, 'Ask'), quest: c02_w(c02_B, 'question.'), search: c02_w(c02_B, 'Search'), it1: c02_w(c02_B, 'it.'), read: c02_w(c02_B, 'Read'), it2: c02_w(c02_B, 'it.', 1),
  clip: c02_w(c02_C, 'Clip'), the3: c02_w(c02_C, 'the'), proof: c02_w(c02_C, 'proof.'), proofEnd: wordAt(c02_C, 'proof.').end, scrap: c02_w(c02_C, 'Scrapbook.'), keep: c02_w(c02_C, 'Keep'), it3: c02_w(c02_C, 'it.'),
  echo: c02_E.start, echoIt: wordAt(c02_E, 1).start,
  outline: c02_w(c02_D, 'Outline'), it4: c02_w(c02_D, 'it.'), draft: c02_w(c02_D, 'Draft'), it5: c02_w(c02_D, 'it.', 1), your: c02_w(c02_D, 'Your'), words: c02_w(c02_D, 'words.'), not: c02_w(c02_D, 'Not'), mine: c02_w(c02_D, 'mine.'),
};
c02_T.shutReader = c02_ev('snare', c02_T.proofEnd); c02_T.shutScrap = c02_ev('snare', c02_T.it4); c02_T.shutDrafts = c02_ev('snare', c02_T.words); c02_T.shutRoute = c02_ev('snare', c02_T.mine + .01); c02_T.beep = c02_ev('cowbell', c02_T.shutRoute);
c02_T.ms = c02_T.shutDrafts;                                          // the route reaches the Manuscript as Section Drafts saves
const c02_qKeys = Array.from({ length: 19 }, (_, i) => c02_T.ask + i / 8);          // "Who bills the tide?" on 16ths, done on "it."
const c02_dKeys = Array.from({ length: 10 }, (_, i) => c02_T.your - .125 + i / 16);  // "Your words" on 32nds: "Your" on "Your", done before the save
const c02_on = (t, a, b) => t >= a - 1e-6 && t < b - 1e-6;
const c02_fr = (t, a) => Math.floor((t - a) * FPS + .5);   // nearest frame

// ---- the lens: [t, anchorX, anchorY, n, plateCentreX, plateTop, plateMaxW], built from the crop's top-left (screen px) ----
// The chant plate never sits on a window's title bar: it rides above Clio (two rows, as §5 ch02 draws it) or on blank paper.
function c02_key(t, L, Tp, n, pcx, py, mw = 1e9) {
  if (n < 2) return [t, 0, 0, 1, pcx, py, mw];
  const solve = (want, off) => { for (let z = want; z < want * 2 + n; z++) if (z - Math.floor(z / n) === want) return z - off; return want - off; };
  return [t, solve(L + 64, 64), solve(Tp + 9, 9), n, pcx, py, mw];
}
const c02_KEYS = [
  c02_key(c02_T.spin, 192, 0, 2, 340, 140, 116),     // the Hard Disk icon spins; the menu-bar hint, drive A; the plate above Clio
  c02_key(c02_T.hard, 80, 48, 2, 340, 140, 116),     // the Route: its stops, the plate above Clio (x 282-398, off every window)
  c02_key(c02_T.feed, 80, 48, 2, 340, 140, 116),     // the pointer takes the File Floppy...
  c02_key(c02_T.the2, 160, 48, 2, 340, 140, 116),    // ...to drive A's slot
  c02_key(c02_T.floppy + .5, 80, 48, 2, 340, 140, 116), // the File Floppy is read (OCR)
  c02_key(c02_T.ask, 0, 48, 2, 90, 166),             // the Question Sheet: the plate on its blank paper, the pen right of it
  c02_key(c02_T.search, 0, 162, 2, 188, 171),        // Searcher, Reader: the plate above them, the hand below
  c02_key(c02_T.proofEnd, 96, 162, 2, 188, 171),     // the drag to the Scrapbook icon
  c02_key(c02_T.scrap, 0, 162, 2, 188, 171),         // the Scrapbook card
  c02_key(c02_T.echo, 0, 0, 1, 352, 30),             // the gang, the whole desk
  c02_key(c02_T.outline, 0, 48, 2, 160, 166),        // the Outline (the plate on its blank paper)
  c02_key(c02_T.draft, 0, 162, 2, 188, 171),         // Section Drafts: your words
  c02_key(c02_T.shutDrafts, 160, 162, 2, 320, 171),  // Drafts saves into its icon
  c02_key(c02_T.not, 60, 96, 2, 150, 154),           // Clio's I-beam reaches for the manuscript
  c02_key(c02_T.mine, 240, 0, 3, 347, 94),           // the hint, taught once, big
  c02_key(c02_T.shutRoute, 0, 96, 2, 150, 150),      // the Route closes; the notice, the bonked I-beam
  c02_key(c02_T.beep, 0, 0, 1, 180, 150),            // 1x for the beep and the hand-off
];

// ---- the writer's hand ----
const c02_RD = [8, 202, 268, 116];   // gag windows open over ClioTalk
const c02_PTR = [
  [c02_T.spin, 300, 24], [c02_T.feed - .25, 112, 92], [c02_T.feed, 112, 92, 'press'], [c02_T.floppy - .125, 443, 96, 'press'], [c02_T.floppy, 443, 138],
  [c02_T.ask, 184, 142, 'click'], [c02_T.search - .05, 184, 142], [c02_T.search, 196, 251], [c02_T.it1, 242, 251, 'click'], [c02_T.read - .1, 70, 288], [c02_T.read, 70, 288, 'click'],
  [c02_T.it2, 20, 274, 'press'], [c02_T.it2 + .25, 154, 274], [c02_T.clip - .1, 243, 302], [c02_T.clip, 243, 302, 'click'],
  [c02_T.the3 + .05, 120, 270, 'press'], [c02_T.proof + .4, 180, 292, 'press'], [c02_T.proof + .8, 240, 300, 'press'], [c02_T.proof + 1.2, 300, 306, 'press'], [c02_T.scrap, 352, 312], [c02_T.keep - .1, 44, 268], [c02_T.keep, 44, 268, 'click'],
  [c02_T.draft, 206, 281, 'click'], [c02_T.mine + .3, 210, 290], [c02_T.beep, 248, 261, 'click'], [c02_T.beep + .08, 248, 261], [c02_T.beep + .2, 300, 24],
];

// ---- small local helpers ----
const c02_dif = (x, y, w, h) => { ctx.save(); ctx.globalCompositeOperation = 'difference'; rect(x, y, w, h, C.white); ctx.restore(); };
// a window zooming shut: a 3 px outline and two thin trailing ones shrink into the target
function c02_shut(f, to, k) {
  for (let j = 0; j < 3; j++) { const kk = clamp(easeIn(k) - j * .14); if (j && kk <= 0) continue; frame(R(lerp(f[0], to[0], kk)), R(lerp(f[1], to[1], kk)), R(lerp(f[2], 16, kk)), R(lerp(f[3], 12, kk)), C.black, j ? 1 : 3); }
}
// Clio's TEMPORARY plate: opaque paper (nothing under it reads through), marching ants (phase on 8ths), the tag;
// kept = solid white in a solid black frame, ants stopped
function c02_ghost(x, y, w, h, t, kept) {
  x = R(x); y = R(y);
  if (kept) { rect(x, y, w, h, C.black); rect(x + 1, y + 1, w - 2, h - 2, C.white); return; }
  rect(x, y, w, h, C.white);
  const ph = Math.floor(t * 4) & 3; let i = 0; ctx.fillStyle = C.black;
  const d = (px, py) => { if (((i++ + ph) & 3) < 2) ctx.fillRect(px, py, 1, 1); };
  for (let k = 0; k < w; k++) d(x + k, y); for (let k = 1; k < h; k++) d(x + w - 1, y + k);
  for (let k = w - 2; k >= 0; k--) d(x + k, y + h - 1); for (let k = h - 2; k > 0; k--) d(x, y + k);
  const tg = tw('TEMPORARY', 'small'); rect(x + w - tg - 10, y - 5, tg + 6, 11, C.black); text('TEMPORARY', x + w - tg - 7, y - 3, { font: 'small', color: C.white });
}
// a phrase's layout: words wrap into rows no wider than mw; {pos: [[x, row]], w, n}
function c02_lay(ws, s, mw = 1e9) {
  const pos = [], rows = [''];
  ws.forEach(v => { const r = rows[rows.length - 1]; if (r && tw(r + ' ' + v.w, 'chicago', s) > mw) rows.push('');
    const q = rows[rows.length - 1]; pos.push([q ? tw(q + ' ', 'chicago', s) : 0, rows.length - 1]); rows[rows.length - 1] = q ? q + ' ' + v.w : v.w; });
  return { pos, w: Math.max(...rows.map(r => tw(r, 'chicago', s))), n: rows.length };
}
// words of a lyric line laid out on a plate, each popping inverted for 3 frames on its note; `gone` words un-type from the end
function c02_words(ws, lay, x, y, s, t, gone) {
  const n = ws.length - (gone || 0);
  ws.forEach((w, i) => {
    if (i >= n || t < w.start - 1e-6) return;
    const px = x + lay.pos[i][0], ww = tw(w.w, 'chicago', s); const py = y + lay.pos[i][1] * 14 * s;
    if (c02_fr(t, w.start) < 3) { rect(px - s, py - 2 * s, ww + 2 * s, 13 * s, C.black); text(w.w, px, py, { font: 'chicago', scale: s, color: C.white }); }
    else text(w.w, px, py, { font: 'chicago', scale: s, color: C.black, outline: C.white });
  });
}
const c02_SPLIT = { v1a: 4, v1b: 3, v1c: 3, v1d: 4 };   // words in each line's first phrase
// the chant plate: the current phrase of the current line, placed inside the lens crop
function c02_chant(t, key) {
  if (t >= c02_T.beep - 1e-6) return;   // the line is done; the beep frame stays clean
  if (c02_on(t, c02_T.echo, c02_T.outline)) return c02_echoPlate(t, key);
  const L = [c02_A, c02_B, c02_C, c02_D].filter(l => l.start <= t + 1e-6).pop();
  if (!L) return;
  const sp = c02_SPLIT[L.id], second = t >= L.words[sp].start - 1e-6, ws = second ? L.words.slice(sp) : L.words.slice(0, sp);
  const ev0 = L === c02_D ? L.end : L.end + .25, gone = t >= ev0 ? Math.floor((t - ev0) * 16) + 1 : 0;
  if (gone >= ws.length) return;
  const lay = c02_lay(ws, 1, (key[6] || 1e9) - 12), pw = lay.w + 12, px = R(key[4] - pw / 2);
  c02_ghost(px, key[5], pw, lay.n * 14 + 6, t, false);
  c02_words(ws, lay, px + 6, key[5] + 5, 1, t, gone);
}
// the gang's echo: twelve copies crowding the bottom edge, one plate "(Keep it.)" at 2x above Clio, off the drives
function c02_echoPlate(t, key) {
  const ws = c02_E.words, s = 2, pw = tw('(Keep it.)', 'chicago', s) + 16, px = R(key[4] - pw / 2);
  c02_ghost(px, key[5], pw, 40, t, false);
  c02_words(ws, c02_lay(ws, s), px + 8, key[5] + 11, s, t, 0);
}
function c02_gang(t) {
  const f = c02_fr(t, c02_T.echo);
  for (let i = 0; i < 12; i++) clio(4 + i * 42, 302 + [16, 8, 2][Math.min(2, f >> 1)] * (f < 6) + (i & 1) * 4, { scale: 2, plain: true, expr: 'sing', mouth: 'sing', voice: 'choir', blink: false });
}
// the Route's header: a subway map of the eight stops
function c02_map(c, cur) {
  const y = c.y - 16, x0 = c.x + 46, x1 = c.x + c.w - 12, cy = y + 7, X = i => R(x0 + i * (x1 - x0) / 7);
  rect(c.x, y, c.w, 15, C.white); text('Route', c.x + 7, y + 4, { font: 'small', color: C.black });
  hline(x0, cy, X(Math.max(0, cur)) - x0, C.black);
  for (let x = X(Math.max(0, cur)); x < x1; x += 2) rect(x, cy, 1, 1, C.black);
  for (let i = 0; i < 8; i++) {
    const x = X(i);
    if (i === cur) { rect(x - 3, cy - 3, 7, 7, C.black); rect(x - 1, cy - 1, 3, 3, C.white); }
    else { rect(x - 2, cy - 2, 5, 5, C.black); if (i > cur) rect(x - 1, cy - 1, 3, 3, C.white); }
  }
  return [X(Math.max(0, cur)), cy];
}
// route stop index at t: HD 0, File Floppy 1, Question Sheet 2, Outline 3, Section Drafts 4, Manuscript 5
const c02_stop = t => t < c02_T.hard ? -1 : t < c02_T.feed ? 0 : t < c02_T.ask ? 1 : t < c02_T.outline ? 2 : t < c02_T.draft ? 3 : t < c02_T.ms ? 4 : 5;
// the eight stops as a snake: → → → ↓ ← ← ←
const c02_GRID = [0, 1, 2, 3, 7, 6, 5, 4];
function c02_grid(t, k) {
  const st = c02_stop(t), scan = prog(t, c02_T.floppy, c02_T.floppy + 1), ocr = c02_on(t, c02_T.floppy, c02_T.floppy + 1);
  const items = [['hardDisk', 'Hard Disk'], ['fileFloppy', ocr ? 'OCR ' + R(Math.floor(scan * 8) / 8 * 100) + '%' : 'File Floppy'], ['questionSheet', 'Question Sheet'], ['outline', 'Outline'],
    ['projectDisc', 'Project CD'], ['reviewDesk', 'Review Desk'], ['manuscript', 'Manuscript'], ['sectionDrafts', 'Section Drafts']];
  const g = APP.finder(8, 30, 268, 164, { title: 'Project Hard Disk', items, sel: st >= 0 ? c02_GRID.indexOf(st) : undefined, open: t >= c02_T.floppy ? 1 : undefined, header: ['', '', ''], scroll: '', gap: 64, cols: 4, k, from: [476, 38] });
  if (!g) return null;
  // the arrows of the route, solid once walked
  const I = g.icons, seg = (i, a, b, dir) => { const done = st > i; if (dir === 'down') { (done ? vline : (x, y, h, c) => { for (let q = 0; q < h; q += 2) rect(x, y + q, 1, 1, c); })(a[0], a[1], b[1] - a[1], C.black); arrowTri(a[0] - 2, b[1] - 2, 3, 'down', C.black); return; }
    const x0 = Math.min(a[0], b[0]), w = Math.abs(b[0] - a[0]); if (done) hline(x0, a[1], w, C.black); else for (let q = 0; q < w; q += 2) rect(x0 + q, a[1], 1, 1, C.black);
    if (dir === 'right') arrowTri(b[0] - 2, a[1] - 2, 3, 'right', C.black); else for (let q = 0; q < 3; q++) rect(b[0] + q, a[1] - q, 1, 2 * q + 1, C.black); };
  for (let i = 0; i < 3; i++) seg(i, [I[i].x + 36, I[i].cy], [I[i + 1].x - 4, I[i].cy], 'right');
  seg(3, [I[3].cx, I[3].y + 46], [I[3].cx, I[7].y - 2], 'down');
  for (let i = 4; i < 7; i++) { const a = I[c02_GRID.indexOf(i)], b = I[c02_GRID.indexOf(i + 1)]; seg(i, [a.x - 4, a.cy], [b.x + 36, a.cy], 'left'); }
  if (ocr) { const y = I[1].y + Math.floor(scan * 16) * 2 % 32; c02_dif(I[1].x - 2, y, 36, 1); }   // the OCR scanline
  return g;
}
// small windows of the route's summoned apps, sized to sit over ClioTalk
function c02_searcher(t) {
  const n = [0, .25, .5].filter(d => t >= c02_T.it1 + d - 1e-6).length;
  const c = win(...c02_RD, 'Searcher', { k: prog(t, c02_T.search, c02_T.search + .12), from: [40, 172], header: ['Web Search', '', n + (n === 1 ? ' result' : ' results')] });
  if (!c) return;
  const q = typeLine('Who bills the tide?', c02_T.ask, c02_T.ask + 3, c02_qKeys, { t }).str;
  textField(c.x + 6, c.y + 5, c.w - 72, 18, q, { focus: true, font: 'small' });
  button(c.x + c.w - 60, c.y + 5, 54, 18, 'Search', { def: true, pressed: c02_on(t, c02_T.it1, c02_T.it1 + .1) });
  ['La Rance tidal power station', 'Lunar billing: a history', 'Estuaries, twice daily'].slice(0, n).forEach((s, i) => {
    const y = c.y + 30 + i * 17, sel = i === 1 && t >= c02_T.read;
    if (sel) rect(c.x + 2, y - 3, c.w - 4, 15, C.black);
    text(s, c.x + 10, y, { font: 'ui', color: sel ? C.white : C.black });
  });
}
function c02_reader(t) {
  const c = win(...c02_RD, 'Reader', { k: prog(t, c02_T.read, c02_T.read + .12), from: { x: 9, y: 265, w: 266, h: 15 }, header: ['Lunar billing: a history', '', 'Source'] });
  if (!c) return;
  ['Opened in 1966, the barrage turns twice a day.', 'The engineers never sent a bill for energy.'].forEach((s, i) => text(s, c.x + 10, c.y + 6 + i * 12, { font: 'body', color: C.black }));
  const S = 'They billed it by the moon.', sw = tw(S, 'ui'), y = c.y + 32, k = clamp(Math.floor(prog(t, c02_T.it2, c02_T.it2 + .25) * 8) / 8);
  text(S, c.x + 10, y, { font: 'ui', color: C.black });
  if (k > 0) clipRect(c.x + 8, y - 3, R((sw + 4) * k), 15, () => { rect(c.x + 8, y - 3, sw + 4, 15, C.black); text(S, c.x + 10, y, { font: 'ui', color: C.white }); });
  if (c02_on(t, c02_T.the3, c02_T.proof)) dragOutline(c.x + 6, y - 6, sw + 8, 19);
  button(c.x + c.w - 56, c.y + c.h - 24, 48, 18, 'Clip', { pressed: c02_on(t, c02_T.clip, c02_T.clip + .12) });
}
function c02_scrapbook(t) {
  const c = win(...c02_RD, 'Scrapbook', { k: prog(t, c02_T.scrap, c02_T.scrap + .15), from: [352, 312], header: [t >= c02_T.echoIt ? '2 scraps' : '1 scrap', '', t >= c02_T.echoIt ? '2 / 2' : '1 / 1'] });
  if (!c) return;
  const two = t >= c02_T.echoIt, kept = t >= c02_T.keep, body = two ? 'High water twice a day.' : 'They billed it by the moon.';
  text(two ? 'Tide table' : 'Lunar billing', c.x + 10, c.y + 4, { font: 'ui', color: C.black });
  c02_ghost(c.x + 8, c.y + 18, c.w - 16, 21, t, kept);
  text(body, c.x + 15, c.y + 24, { font: 'ui', color: C.black });
  if (c02_fr(t, c02_T.keep) >= 0 && c02_fr(t, c02_T.keep) < 2) c02_dif(c.x + 8, c.y + 18, c.w - 16, 21);
  text(two ? 'tides.example/rance' : 'estuaries.example/lunar-billing', c.x + 10, c.y + 43, { font: 'small', color: C.black });
  const f = c02_fr(t, c02_T.it3);
  if (f >= 0) { const o = [3, 2, 1][f] || 0, s = 'evidence you chose to keep', sw = tw(s, 'ui'); rect(c.x + c.w - sw - 22 - o, c.y + 55 - o, sw + 12 + 2 * o, 15 + 2 * o, C.black); text(s, c.x + c.w - sw - 16, c.y + 58, { font: 'ui', color: C.white }); }
}
function c02_drafts(t) {
  const d = APP.sectionDrafts(...c02_RD, { k: prog(t, c02_T.draft, c02_T.draft + .15), from: [420, 312], sel: t >= c02_T.it5 ? 1 : 0, text: 'They billed it by the moon.' });
  if (!d) return;
  const e = d.editor, end = c02_dKeys[9];
  typeLine('Your words', c02_T.draft, end + .01, c02_dKeys, { t, x: e.x + 10, y: e.y + 40, font: 'chicago', color: C.black, paper: C.white, caret: t < end + .06 });
}
// the read-only notice in ClioTalk: the product's sentence, an [OK] the writer presses
function c02_notice(t, c) {
  const k = 1 - Math.floor(prog(t, c02_T.beep, c02_T.beep + .2) * 4) / 4, h = R(40 * k);
  if (h <= 0) return;
  const x = c.x + 4, y = c.y + 4, w = c.w - 8;
  clipRect(x - 1, y - 6, w + 2, h + 7, () => {
    c02_ghost(x, y, w, 40, t, false);
    glyph('flag', x + 8, y + 8);
    wrap('The drafting manuscript is read-only; use the current Section Draft instead.', w - 70, 'small').forEach((r, i) => text(r, x + 24, y + 8 + i * 12, { font: 'small', color: C.black, outline: C.white }));
    button(x + w - 40, y + 11, 32, 18, 'OK', { def: true, pressed: c02_on(t, c02_T.beep, c02_T.beep + .12) });
  });
}
// Clio's own I-beam (black, 2 px stem, white halo): it reaches the full stop pd in three 16ths of "Not",
// bonks off it and sits there, refused, until the beep. She tries to write where only the writer writes.
function c02_clioBeam(t, pd) {
  const k = Math.min(3, Math.floor((t - c02_T.not) * 16) + 1) / 3, f = c02_fr(t, c02_T.not + .125);
  let x = R(lerp(334, pd[0] + 5, k)), y = R(lerp(241, pd[1] - 4, k));
  if (f >= 0) x += f < 8 ? [6, 4, -1, 1, -1, 1, 0, 0][f] + 3 : 3;
  rect(x - 4, y - 8, 10, 18, C.white);
  rect(x, y - 7, 2, 16, C.black); rect(x - 3, y - 7, 8, 1, C.black); rect(x - 3, y + 8, 8, 1, C.black);
}
// the writer's I-beam while typing: vermilion, the one colour
function c02_beam(x, y) {
  rect(x - 3, y - 8, 7, 18, C.white);
  const v = FIELDS.vermilion; rect(x, y - 7, 1, 15, v); rect(x - 2, y - 7, 2, 1, v); rect(x + 1, y - 7, 2, 1, v); rect(x - 2, y + 7, 2, 1, v); rect(x + 1, y + 7, 2, 1, v);
}
// an icon spinning on its vertical axis: full, half, edge, half (mirrored) ...
function c02_spin(t, x, y, name) {
  const f = Math.floor(c02_fr(t, c02_T.spin) / 3), W8 = [32, 20, 4, 20, 32, 20, 4, 20];
  if (f < 0 || f >= 8) return false;
  clipRect(x, y, 32, 32, () => desktop());
  const ic = iconCanvas(name, 32), w = W8[f]; if (!ic) return true;
  ctx.save(); ctx.translate(x + 16, 0); if (f >= 3 && f < 7) ctx.scale(-1, 1); ctx.drawImage(ic, -w / 2, y, w, 32); ctx.restore();
  return true;
}

// ---- the frame ----
function c02_frame(t) {
  t = Math.max(t, c02_V.start - 1 / FPS);
  const key = c02_lens(t, c02_KEYS) || [0, 0, 0, 1, 256, 150];
  const p = mousePath(t, c02_PTR), st = c02_stop(t), typing = c02_on(t, c02_T.ask, c02_T.it1) || c02_on(t, c02_T.draft + .13, c02_T.shutDrafts);
  const refused = c02_on(t, c02_T.mine, c02_T.beep), sh = c02_fr(t, c02_T.mine);
  const look = t < c02_T.beep - .1 ? [clamp(R((p.x - 334) / 60), -2, 2), clamp(R((p.y - 230) / 60), -2, 2)] : undefined;
  const o = {
    cur: [p.x, p.y, c02_on(t, c02_T.it2, c02_T.it2 + .3) ? 'ibeam' : 'arrow'],
    hint: refused ? c02_HINT[1] : c02_HINT[0],
    clio: { expr: refused ? 'surprised' : 'sing', bob: t >= hit('riffReturns') && t < c02_T.beep ? 1 : 0, look },
    after: ({ chat }) => {
      let pd = c02_PERIOD;
      // the desktop icons the route touches
      if (t >= c02_T.spin && t < c02_T.shutRoute + .16 && !c02_spin(t, 460, 22, 'hardDisk')) deskIcon(460, 22, 'hardDisk', 'Project Hard Disk', { open: t >= c02_T.the1 });
      const inv = (a, x, y) => { const f = c02_fr(t, a); if (f >= 0 && f < 2) c02_dif(x, y, 32, 32); };
      inv(c02_T.shutRoute + .16, 460, 22); inv(c02_T.scrap, 336, 296); inv(c02_T.shutScrap + .16, 336, 296); inv(c02_T.shutDrafts + .16, 404, 296);
      // the Route window
      if (t < c02_T.ask) { const g = c02_grid(t, prog(t, c02_T.spin, c02_T.spin + .2)); if (g) c02_map(g, st); }
      else if (t < c02_T.shutRoute) {
        const ts = t < c02_T.outline ? c02_T.ask : t < c02_T.ms ? c02_T.outline : c02_T.ms;
        const nOut = [0, 1, 2, 3, 4].filter(i => t >= c02_T.outline + i / 8 - 1e-6).length;
        const c = t < c02_T.outline
          ? APP.questionSheet(8, 30, 268, 164, { title: 'Question Sheet', header: ['', '', ''], items: ['## Questions', '- What did the engineers call it?', '- Is the moon the client or the clock?', '- Who reads the meter at night?'] })
          : t < c02_T.ms
            ? APP.outline(8, 30, 268, 164, { title: 'Outline', header: ['', '', ''], items: [{ text: 'The tide', level: 0, open: nOut > 1 }, { text: 'Who bills the tide?', level: 1 }, { text: 'The bill', level: 0, open: nOut > 3 }, { text: 'They billed it by the moon.', level: 1 }, { text: 'Both directions', level: 0 }].slice(0, nOut) })
            : APP.teachText(8, 30, 268, 164, { title: 'Manuscript', lines: c02_MS, header: ['', '', ''] });
        const m = c02_map(c, st);
        if (t < c02_T.outline) {   // the writer's question, typed solid, one key per 16th
          const r = c.rows[c.rows.length - 1], y = r.y + 14;
          disc(c.x + 15, y + 4, 1, C.black);
          typeLine('Who bills the tide?', c02_T.ask, c02_T.ask + 3, c02_qKeys, { t, x: c.x + 22, y, font: 'chicago', color: C.black, paper: C.white, caret: t < c02_T.read });
        }
        if (t >= c02_T.ms) { const r = c.rows[c.rows.length - 1]; pd = [r.x + r.w + 1, r.y + capH('doc') - 1]; rect(...pd, 2, 2, FIELDS.vermilion); }
        if (t < ts + .1) zoomRects(m, c, prog(t, ts, ts + .1));
      } else if (t < c02_T.shutRoute + .16) c02_shut([8, 30, 268, 164], [468, 32], prog(t, c02_T.shutRoute, c02_T.shutRoute + .16));
      // the read-only strip flashes while she is refused
      if (refused && (Math.floor((t - c02_T.mine) * 8) & 1) === 0) c02_dif(9, 177, 266, 16);
      // gag windows over ClioTalk
      if (c02_on(t, c02_T.search, c02_T.read + .12)) c02_searcher(t);
      if (c02_on(t, c02_T.read, c02_T.shutReader)) c02_reader(t);
      else if (c02_on(t, c02_T.shutReader, c02_T.shutReader + .16)) c02_shut(c02_RD, [200, 50], prog(t, c02_T.shutReader, c02_T.shutReader + .16));
      if (c02_on(t, c02_T.scrap, c02_T.shutScrap)) c02_scrapbook(t);
      else if (c02_on(t, c02_T.shutScrap, c02_T.shutScrap + .16)) c02_shut(c02_RD, [344, 302], prog(t, c02_T.shutScrap, c02_T.shutScrap + .16));
      if (c02_on(t, c02_T.draft, c02_T.shutDrafts)) c02_drafts(t);
      else if (c02_on(t, c02_T.shutDrafts, c02_T.shutDrafts + .16)) c02_shut(c02_RD, [412, 302], prog(t, c02_T.shutDrafts, c02_T.shutDrafts + .16));
      if (chat && c02_on(t, c02_T.mine, c02_T.beep + .2)) c02_notice(t, chat);
      // the File Floppy dragged to drive A, swallowed on "floppy."
      if (c02_on(t, c02_T.feed, c02_T.floppy)) trail(t, 2, 1 / 30, tt => { const q = mousePath(tt, c02_PTR); dragOutline(q.x - 16, q.y - 16, 32, 32); dragOutline(q.x - 26, q.y + 20, 52, 11); });
      const sf = c02_fr(t, c02_T.floppy);
      if (sf >= 0 && sf < 3) { clipRect(404, 143, 100, 40, () => { const y = 143 - sf * 8; rect(431, y, 24, 24, C.black); rect(436, y + 14, 14, 10, C.white); }); c02_dif(404, 132, 100, 10); }
      // the clipping dragged from the Reader to the Scrapbook icon
      if (c02_on(t, c02_T.proof, c02_T.scrap)) trail(t, 2, 1 / 30, (tt, i) => { const q = mousePath(tt, c02_PTR), w = tw('They billed it by the moon.', 'ui') + 8; if (!i) rect(q.x - 30, q.y - 8, w, 15, C.white); dragOutline(q.x - 30, q.y - 8, w, 15); if (!i) text('They billed it by the moon.', q.x - 26, q.y - 5, { font: 'ui', color: C.black }); });
      if (c02_on(t, c02_T.echo, c02_T.outline)) c02_gang(t);
      c02_chant(t, key);
      if (c02_on(t, c02_T.not, c02_T.beep)) c02_clioBeam(t, pd);   // over the plate: her reach is the gag
    },
  };
  if (refused) o.menu = { prop: (x, y, w, h) => c02_youProp(c02_HINT[1])(x + (sh < 6 ? (sh & 1 ? -1 : 1) : 0), y, w, h) };
  c02_homeDesk(t, o);
  if (CUR) CUR.down = p.down;
  if (typing) { const c = CUR; CUR = null; overlay(() => c02_beam(c.x, c.y)); }
  if (c02_fr(t, c02_T.beep) >= 0 && c02_fr(t, c02_T.beep) < 2) overlay(() => c02_dif(0, 0, W, E.menuH));
}
for (const [n, a, b] of [['ch02 spin', c02_V.start, c02_B.start], ['ch02 ask', c02_B.start, c02_C.start], ['ch02 clip', c02_C.start, c02_D.start], ['ch02 outline', c02_D.start, c02_V.end]])
  scene(n, a, b, c02_frame, { era: 'system6', screen: true });
}
