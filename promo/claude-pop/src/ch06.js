// ch06 · verse 2, MultiFinder and Review Desk (60.00-76.00), Aqua. Chat is one window among games; Review Desk
// turns on the singer; the gang flags her; the machine hangs on the stumble; the writer KEEPs their rough line.
// Scenes: 'ch06 chat' · 'ch06 review' · 'ch06 flags' · 'ch06 keep' (one pure frame function, era aqua, screen).
'use strict';
{
// ---- STORYBOARD §4: the home desk, verbatim (c06_ prefix) ----
const c06_MS = ['# The Tide Comes In Twice', 'They never called it renewable energy. They called it the tide, and they billed it by the moon.', 'Twice a day the estuary fills'];
const c06_INV = c => { const [r, g, b] = rgb(c); return hex(255 - r, 255 - g, 255 - b); };
const c06_HINT = ['Sounds like you.', 'Sounds like a mouthpiece.'];
const c06_youProp = s => (x, y, w, h) => { const f = 'menu'; text(s, x + w, y + R((h - capH(f)) / 2), { font: f, align: 'right', color: P.menuText }); };
let c06_PERIOD = [0, 0];
function c06_homeDesk(t, o = {}) {
  const neg = !!o.neg, verm = neg ? c06_INV(FIELDS.vermilion) : FIELDS.vermilion;
  UI.menu = { app: 'AI System 6', prop: c06_youProp(o.hint || c06_HINT[0]), propW: 128, ...(o.menu || {}) };
  const doc = o.doc === false ? null : APP.teachText(8, 30, 268, 164, { title: 'Manuscript', lines: o.lines || c06_MS, ...(o.doc || {}) });
  if (doc) { const r = doc.rows[doc.rows.length - 1]; c06_PERIOD = [r.x + r.w + 1, r.y + capH('doc') - 1]; rect(c06_PERIOD[0], c06_PERIOD[1], 2, 2, verm); }
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
  if (o.top) o.top();   // above the pen (the flags, the gang)
  return { doc, chat, period: c06_PERIOD };
}
// the lens (§2.1), as ch01 reads its keys: the n x crop is CENTRED on (x, y) in screen px, kept inside the screen
function c06_lens(t, keys) {
  let k = null; for (const q of keys) if (q[0] <= t + 1e-6) k = q;
  if (!k || k[3] <= 1) return k;
  const n = k[3], s = screenSize(t), cw = Math.ceil(FW / n), ch = Math.ceil(FH / n);
  const cx = clamp(R(k[1] + s.x - cw / 2), s.x, s.x + s.w - cw), cy = clamp(R(k[2] + s.y - ch / 2), s.y, s.y + s.h - ch);
  const fix = v => { let z = R(v * n / (n - 1)); while (z - Math.floor(z / n) > v) z--; while (z - Math.floor(z / n) < v) z++; return z; };
  stepZoom(n, fix(cx) - s.x, fix(cy) - s.y);
  return k;
}

// ---- song times (data.js only; literals below are offsets) ----
const c06_V = section('verse2');
const [c06_A, c06_B, c06_Q1, c06_F1, c06_Q2, c06_F2, c06_Q3, c06_F3, c06_Q4, c06_K] = ['v2a', 'v2b', 'v2c', 'v2c_flag', 'v2d', 'v2d_flag', 'v2e', 'v2e_flag', 'v2f', 'v2f_keep'].map(id => lyric(id));
const c06_w = (L, s, n) => wordAt(L, s, n || 0).start;
const c06_T = {
  is: c06_w(c06_A, 'is'), an: c06_w(c06_A, 'an'), app: c06_w(c06_A, 'app.'), not: c06_w(c06_A, 'Not'), the: c06_w(c06_A, 'the'), whole: c06_w(c06_A, 'whole'), comp: c06_w(c06_A, 'computer.'), appEnd: wordAt(c06_A, 'app.').end,
  review: c06_B.start, desk: c06_w(c06_B, 'Desk.'), check: c06_w(c06_B, 'Check'), fr: c06_w(c06_B, 'for'), drift: c06_w(c06_B, 'drift.'),
  too: c06_Q1.start, reg: c06_w(c06_Q1, 'regular?'), stall: c06_F1.end, stum: hit('stumble'), gen: c06_Q2.start,
  press: c06_Q3.start, rel: c06_w(c06_Q3, 'release?'), rough: c06_Q4.start, edge: c06_w(c06_Q4, 'edge?'), keep: hit('keepIt'), keepIt: c06_w(c06_K, 'it.'),
};
c06_T.send = c06_T.review + 1 / 4;                                                   // the writer's Return, on the beat after the last key
c06_T.shut = evTimes('snare').find(x => x >= c06_K.end - 1e-6);                     // the snare that closes the sheet
c06_T.groove = evTimes('kick').find(x => x > c06_T.stum);                           // the groove's return
const c06_FL = [[c06_F1, hit('flagIt1')], [c06_F2, hit('flagIt2')], [c06_F3, hit('flagIt3')]];
const c06_LINES = [c06_A, c06_B, c06_Q1, c06_Q2, c06_Q3, c06_Q4, c06_K];
const c06_SPLIT = { v2a: 4, v2b: 2 };
const c06_on = (t, a, b) => t >= a - 1e-6 && t < b - 1e-6;
const c06_fr = (t, a) => Math.floor((t - a) * FPS + 1e-6);
const c06_inFlag = t => c06_FL.some(([L]) => c06_on(t, L.start, L.end));

// ---- the lens: [t, cx, cy, n, plateX, plateY] (screen px); the plate is Chicago 2x at 1x, 1x when zoomed; plateX < 0:
// the plate's right edge at -plateX. From "Review" on, Clio's lines are her bubbles in ClioTalk's well (c06_talk), so
// every key from there frames that well (y 249-274) along with what the line is about ----
const c06_KEYS = [
  [c06_V.start, 0, 0, 1, 26, 238],                 // the landing: the whole Aqua desk; Clio's line in the chat
  [c06_T.an, 342, 122, 2, 290, 190],               // MultiFinder: DOOM (title bar in) and Micropolis open; the line over Clio's head
  [c06_T.appEnd, 150, 236, 2, 22, 240],            // the chat, the writer typing on the hats
  [c06_T.whole, 0, 0, 1, 0, 0],                    // the chat balloons to the whole screen
  [c06_T.comp, 150, 236, 2, 22, 240],              // ...and slams back into its window
  [c06_T.review, 200, 266, 2],                     // low: the Manuscript goes Final, the Dock bounces, the Return, her bubble
  [c06_T.desk + 1 / 2, 150, 184, 2],               // Review Desk's rows 2-4, the meter, the drift gauge, her bubble
  [c06_T.reg + 1 / 4, 150, 130, 2],                // "Too regular?" sung: row 1, the singer's waveform, "Not a score."
  [c06_F1.start, 0, 0, 1, 0, 0],                   // the gang's flag, the whole desk
  [c06_T.stall, 0, 0, 1],                          // the hang, whole: the beachball, the drop, Clio's head
  [c06_T.groove, 160, 184, 2],                     // the groove returns: her bubble and rows 2-3
  [c06_F2.start, 0, 0, 1, 0, 0],
  [c06_F2.end, 280, 110, 2],                       // the flags flying over the games, readable
  [c06_T.press, 160, 184, 2],
  [c06_F3.start, 0, 0, 1, 0, 0],
  [c06_F3.end, 280, 110, 2],
  [c06_T.rough, 124, 214, 3],                      // the two sentences and her bubble
  [c06_K.end, 150, 130, 2],                        // §6 B6
];

// ---- small helpers ----
const c06_RED = '#d8261c';
const c06_dif = (x, y, w, h) => { ctx.save(); ctx.globalCompositeOperation = 'difference'; rect(x, y, w, h, C.white); ctx.restore(); };
// Clio's TEMPORARY plate: 50% paper dither, marching ants (phase on 8ths), the tag; kept = solid white, ants stopped
// base: an opaque paper under the dither (her bubbles in ClioTalk: nothing shows through; light enough never to flash)
function c06_ghost(x, y, w, h, t, kept, tag = true, ink = C.white, base) {
  x = R(x); y = R(y);
  if (kept) { rect(x, y, w, h, C.black); rect(x + 1, y + 1, w - 2, h - 2, C.white); return; }
  if (base) rect(x, y, w, h, base);
  bayer(x, y, w, h, .5, ink); frame(x, y, w, h, C.white);
  const ph = Math.floor(t * 4) & 3; let i = 0; ctx.fillStyle = C.black;
  const d = (px, py) => { if (((i++ + ph) & 3) < 2) ctx.fillRect(px, py, 1, 1); };
  for (let k = 0; k < w; k++) d(x + k, y); for (let k = 1; k < h; k++) d(x + w - 1, y + k);
  for (let k = w - 2; k >= 0; k--) d(x + k, y + h - 1); for (let k = h - 2; k > 0; k--) d(x, y + k);
  if (tag) { const tg = tw('TEMPORARY', 'small'); rect(x + w - tg - 10, y - 5, tg + 6, 11, C.black); text('TEMPORARY', x + w - tg - 7, y - 3, { font: 'small', color: C.white }); }
}
// a lyric's words in Chicago, each popping inverted for 3 frames on its note; `gone` words un-type from the end
function c06_words(ws, x, y, s, t, gone) {
  const n = ws.length - (gone || 0);
  ws.forEach((w, i) => {
    if (i >= n || t < w.start - 1e-6) return;
    const px = x + tw(ws.slice(0, i).map(v => v.w).join(' ') + (i ? ' ' : ''), 'chicago', s), ww = tw(w.w, 'chicago', s);
    if (c06_fr(t, w.start) < 3) { rect(px - s, y - 2 * s, ww + 2 * s, 13 * s, C.black); text(w.w, px, y, { font: 'chicago', scale: s, color: C.white }); }
    else text(w.w, px, y, { font: 'chicago', scale: s, color: C.black, outline: C.white });
  });
}
// a lyric plate: the words on a temporary plate (kept: solid white); returns its rect
function c06_plate(ws, x, y, s, t, gone, kept) {
  const pw = tw(ws.map(v => v.w).join(' '), 'chicago', s) + 12 * s, ph = 22 * s;
  if (x < 0) x = -x - pw;
  c06_ghost(x, y, pw, ph, t, kept);
  c06_words(ws, x + 6 * s, y + 7 * s, s, t, gone);
  return { x, y, w: pw, h: ph };
}
// the chant: the current phrase of the current line ({ws, gone, kept}), or null
function c06_line(t) {
  if (c06_inFlag(t) || c06_on(t, c06_T.whole, c06_T.comp)) return null;
  const L = c06_LINES.filter(l => l.start <= t + 1e-6).pop();
  if (!L) return null;
  const sp = c06_SPLIT[L.id], second = sp && t >= L.words[sp].start - 1e-6, ws = sp ? (second ? L.words.slice(sp) : L.words.slice(0, sp)) : L.words;
  const ev0 = L === c06_K ? L.end : L.end + .25, gone = t >= ev0 ? Math.floor((t - ev0) * 16) + 1 : 0;
  return gone >= ws.length ? null : { ws, gone, kept: L === c06_K && t >= c06_T.keepIt };
}
// before "Review" the line sits on its plate inside the lens crop; from "Review" on it is Clio's bubble (c06_talk)
function c06_chant(t, key) {
  const l = t < c06_T.review - 1e-6 && c06_line(t);
  if (l) c06_plate(l.ws, key[4], key[5], key[3] === 1 ? 2 : 1, t, l.gone, l.kept);
}
const c06_PAPER = '#e8e8ec';
// her sung line as a bubble in ClioTalk's well: Chicago on an opaque temporary plate, 17 px
function c06_say(l, x, y, t) {
  const pw = tw(l.ws.map(v => v.w).join(' '), 'chicago') + 12;
  c06_ghost(x, y, pw, 17, t, l.kept, false, C.white, c06_PAPER);
  c06_words(l.ws, x + 6, y + 4, 1, t, l.gone);
}
// ...or, over her message bubble, the line as the bubble's tag line: a black Chicago tab on the plate's top edge (kept: white)
function c06_tag(l, x, y, t) {
  const ws = l.ws.slice(0, l.ws.length - l.gone).filter(w => t >= w.start - 1e-6), sw = tw(' ', 'chicago');
  if (!ws.length) return;
  const w = tw(ws.map(v => v.w).join(' '), 'chicago') + 8;
  rect(x, y, w, 13, C.black); if (l.kept) rect(x + 1, y + 1, w - 2, 11, C.white);
  let px = x + 4;
  for (const wd of ws) {
    const ww = tw(wd.w, 'chicago'), pop = c06_fr(t, wd.start) < 3;
    if (pop) rect(px - 1, y + 1, ww + 2, 11, l.kept ? C.black : C.white);
    text(wd.w, px, y + 2, { font: 'chicago', color: pop === !!l.kept ? C.white : C.black });
    px += ww + sw;
  }
}
// the gang's call: twelve Clios along the bottom shout "Flag it." on one plate
function c06_gang(t, L) {
  const f = c06_fr(t, L.start);
  for (let i = 0; i < 12; i++) clio(10 + i * 49, 282 + [8, 4, 1][Math.min(2, f >> 1)] * (f < 6), { scale: 1, plain: true, expr: 'surprised', mouth: { open: 1, shape: 'A' }, blink: false, halo: C.white });
  const pw = tw('Flag it.', 'chicago', 3) + 36;
  c06_ghost(R(470 - pw / 2), 214, pw, 66, t, false);
  c06_words(L.words, R(470 - pw / 2) + 18, 235, 3, t, 0);
}
// a flag planted at a row's right end, its pennant (the full flag text) flying out over the games
function c06_flag(x, y, label, at, t) {
  const f = c06_fr(t, at); if (f < 0) return;
  const o = f < 3 ? [3, 2, 1][f] : 0, L = tw(label, 'small') + 14, k = clamp((c06_fr(t, at + .25) + 1) / 4), wv = onBeat(t) & 1;
  rect(x, y - 15 - o, 2, 24 + o, C.black);
  const pw = R(lerp(8, L, k));
  for (let s = 0; s < pw; s += 8) { const dy = (s >> 3) % 2 === wv ? 0 : 1, sw = Math.min(8, pw - s); rect(x + 2 + s, y - 15 - o + dy, sw, 11, C.black); rect(x + 2 + s, y - 14 - o + dy, sw - (s + sw >= pw ? 1 : 0), 9, c06_RED); }
  if (k >= 1) { clipRect(x + 2, y - 16 - o, pw - 4, 13, () => text(label, x + 8, y - 12 - o + (wv ? 0 : 0), { font: 'small', color: C.white })); rect(x + pw - 2, y - 11 - o, 3, 3, C.black); }
}
// the gang's twelve hands, stamping in a short line along the flagged row (rings at the flag, the hands rippling out)
function c06_hands(x, y, at, t) {
  clickBurst(x, y, at, { pointer: false });
  for (let i = 11; i >= 0; i--) { const d = t - at - i / FPS; pointer(x - 4 - i * 8, y - 2 + (i & 1) * 7, 'hand', { down: d >= 0 && d < 5 / FPS }); }
}
// a small red flag glyph
const c06_mini = (x, y) => { rect(x, y, 1, 9, C.black); rect(x + 1, y, 6, 5, C.black); rect(x + 1, y + 1, 5, 3, c06_RED); };
// the KEEP stamp: vermilion Chicago 2x in a vermilion frame, slammed with a 3-frame overshoot
function c06_stamp(x, y, t) {
  const f = c06_fr(t, c06_T.keep); if (f < 0) return;
  const o = f < 3 ? [3, 2, 1][f] : 0, v = FIELDS.vermilion, w = tw('KEEP', 'chicago') + 12;
  rect(x - o, y - o, w + 2 * o, 21 + 2 * o, v); rect(x - o + 2, y - o + 2, w + 2 * o - 4, 17 + 2 * o, C.white);
  text('KEEP', x + 6, y + 6, { font: 'chicago', color: v });
}
// a 2x2-cell dither of colour c over a rect at level k (temporary things leave this way)
function c06_cells(x, y, w, h, k, c) {
  if (k <= 0) return; ctx.fillStyle = c;
  for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i += 2) if (BAYER4[((j >> 1) & 3) * 4 + ((i >> 1) & 3)] < k * 16) ctx.fillRect(x + i, y + j, 2, 2);
}

// ---- Review Desk: rows, the scan, the drift gauge, the singer's waveform, the flags, the sheet ----
const c06_CK = [['Rhythm', 'rhythm', 'Over-regular rhythm'], ['Summary language', 'generic', 'Generic summary language'], ['Press-release hedging', 'hedging', 'Press-release hedging'], ['Personal detail', 'KEEP', '']];
const c06_ASK = () => [c06_T.too, c06_T.gen, c06_T.press, c06_T.rough];
function c06_checks(t) {
  const ask = c06_ASK();
  return c06_CK.map(([label, note], i) => {
    const asked = t >= ask[i] - 1e-6, done = t >= (i < 3 ? c06_FL[i][1] : c06_T.keep) - 1e-6;   // a plain selected row until the gang stamps it
    return { label, state: done ? (i < 3 ? 'flag' : 'ok') : t >= c06_T.check - 1e-6 ? 'pending' : 'dot', note: done ? note : '' };
  });
}
function c06_review(t) {
  const k = prog(t, c06_T.desk, c06_T.desk + .25);
  const ck = c06_checks(t), rv = Math.ceil(prog(t, c06_T.desk + .25, c06_T.desk + .75) * 4) / 4;
  const rdw = kk => {
    const r = APP.reviewDesk(8, 30, 268, 196, { k: kk, from: [352, 334], doc: 'The Tide Comes In Twice', header: ['812 words', '', 'Not a score.'], checks: ck, reveal: rv, you: 100 });
    if (r && r.meter) { const y = r.meter.y - 18; rect(r.x + 8, y - 3, 170, 16, P.win); text(c06_HINT[0], r.x + 12, y, { font: uiHead(), color: P.text }); }   // the film's caption, not the product's words; no number (§1)
    return r;
  };
  const rd = k < 1 ? rdw(k) : c06_blit('rd', JSON.stringify(ck) + rv, 2, 26, 288, 210, () => rdw(1));
  if (!rd) return null;
  const rows = rd.rows, ask = c06_ASK(), sel = [0, 1, 2, 3].filter(i => t >= ask[i] - 1e-6 && t < (i < 3 ? c06_FL[i][1] : c06_T.shut) - 1e-6).pop();
  // the spinners turn on the live clock over the cached window (so the cache rebuilds only when a row changes)
  rows.forEach((r, i) => { if (ck[i].state === 'pending' && i !== sel) { rect(rd.x + 12, r.y + 4, 9, 9, P.win); glyph('spin', rd.x + 12, r.y + 4); } });
  // the row Review Desk is aiming at: selected
  if (sel != null && rows[sel]) {
    const r = rows[sel], ck = c06_checks(t)[sel];
    rect(r.x, r.y, r.w, r.h, P.sel); glyph(ck.state === 'pending' ? 'spin' : ck.state, rd.x + 12, r.y + 4, C.white);
    text(ck.label, rd.x + 28, r.y + 4, { font: 'body', color: P.selText });
    if (ck.note) text(ck.note, rd.x + rd.w - 12, r.y + 4, { font: 'small', color: P.selText, align: 'right' });
  }
  // "Check for drift.": a scan line sweeps the rows on 16ths
  if (c06_on(t, c06_T.check, c06_T.drift) && rows.length) { const y = rows[0].y + R(Math.floor(prog(t, c06_T.check, c06_T.drift) * 8) / 8 * rows.length * rows[0].h); c06_dif(rd.x + 4, y, rd.w - 8, 2); }
  // the singer's waveform in row 1: sixteen identical bars, every one the same, every 8th
  if (c06_on(t, c06_T.too, c06_FL[0][1] + .5) && rows[0]) {
    const r = rows[0], h = 2 + (t < c06_FL[0][1] ? R(6 * pulse(t, .5, 7)) : 0), on = sel === 0;
    for (let i = 0; i < 16; i++) rect(rd.x + 86 + i * 7, r.y + R(r.h / 2) - (h >> 1), 4, h, on ? P.selText : P.text);
  }
  // the drift gauge at the meter row's right: the needle swings on "drift." and settles on YOU
  if (t >= c06_T.check && rd.meter) {
    const gx = rd.x + rd.w - 26, gy = rd.meter.y - 5, d = t - c06_T.drift - 5 / FPS;   // the first swing holds 5 frames at 20 degrees
    const a = t < c06_T.drift ? 0 : d < 0 ? 20 : Math.round(20 * Math.exp(-5 * d) * Math.cos(14 * d));
    for (let e = -60; e <= 60; e += 10) { const q = (e - 90) * Math.PI / 180; rect(gx + R(Math.cos(q) * 18), gy + R(Math.sin(q) * 18), 1, e % 30 ? 1 : 2, P.text); }
    const q = (a - 90) * Math.PI / 180; line(gx, gy, gx + R(Math.cos(q) * 16), gy + R(Math.sin(q) * 16), c06_RED);
    rect(gx - 1, gy - 1, 3, 3, P.text); text('drift', gx - 21, gy - 9, { font: 'small', color: P.textDim, align: 'right' });
  }
  // the KEEP stamp, filed on row 4 after the sheet closes
  if (t >= c06_T.shut && rows[3]) {
    const r = rows[3], v = FIELDS.vermilion, nw = tw('KEEP', 'small') + 8, x = rd.x + rd.w - 12 - nw + 4;
    rect(x - 2, r.y + 1, nw + 2, r.h - 2, v); rect(x - 1, r.y + 2, nw, r.h - 4, C.white); text('KEEP', x + 3, r.y + 4, { font: 'small', color: v });
  }
  return rd;
}
// the evidence sheet under row 4 (an Aqua sheet): your sentence, solid; her smoothed copy, temporary
function c06_sheet(t, rd, stampOnly) {
  const r = rd.rows[3]; if (!r) return;
  const open = c06_fr(t, c06_T.rough) >= 0 ? 4 : 0, shut = c06_fr(t, c06_T.shut), n = shut >= 0 ? 4 - Math.min(4, shut + 1) : open;
  if (n <= 0) return;
  const x = rd.x + 6, y = r.y + r.h, w = rd.w - 12, H6 = 74, h = R(H6 * n / 4);
  clipRect(x, y, w, h, () => {
    const yy = y + h - H6;
    if (stampOnly) return c06_stamp(x + 20 + tw('Twice a day the estuary fills', 'doc'), yy + 4, t);
    rect(x, yy, w, H6, C.black); rect(x + 1, yy, w - 2, H6 - 1, '#f4f4f6'); hline(x + 1, yy, w - 2, '#9a9aa4');
    // your sentence, jagged and solid, selected on "Rough"
    const s1 = 'Twice a day the estuary fills', w1 = tw(s1, 'doc');
    if (t >= c06_T.rough) {
      rect(x + 8, yy + 6, w1 + 8, capH('doc') + 8, t < c06_T.keep ? P.sel : '#f4f4f6');
      text(s1, x + 12, yy + 10, { font: 'doc', color: t < c06_T.keep ? P.selText : C.black });
      rect(x + 13 + w1, yy + 10 + capH('doc') - 2, 2, 2, FIELDS.vermilion);
      for (let i = 0; i < w1; i += 3) rect(x + 12 + i, yy + 12 + capH('doc') + (hash(i * 3.1) * 3 | 0), 2, 1, C.black);   // the rough edge
    }
    // her smoothed copy, on a temporary plate, wearing flag 4; it dissolves when you keep yours
    if (t >= c06_T.edge && t < c06_T.shut) {
      const s2 = 'The estuary fills twice daily.', w2 = tw(s2, 'doc'), px = x + 8, py = yy + 34;
      c06_ghost(px, py, w2 + 12, capH('doc') + 10, t, false, false);
      text(s2, px + 6, py + 5, { font: 'doc', color: C.black });
      c06_mini(px, py + capH('doc') + 13); text('Personal detail flattened', px + 10, py + capH('doc') + 14, { font: 'small', color: c06_RED });
      c06_cells(px - 1, py - 1, w2 + 30, capH('doc') + 26, Math.floor(prog(t, c06_T.keep, c06_K.end) * 4) / 4, '#f4f4f6');
    }
  });
}
// ClioTalk's message well (the kit's window, our bubbles, at its foot as ch07 has them): her sung line, your Return, then
// her messages on opaque temporary plates with the line as their tag; the flags she has collected at the bubble's corner
const c06_MSG = [['In today’s fast-paced world, the estuary fills.', 27], ['We are excited to announce the tide.', 26]];
function c06_talk(t, c) {
  const bot = c.y + c.h - 37, by0 = bot - 17, l = c06_line(t), pop = at => { const f = c06_fr(t, at); return f < 3 ? [6, 3, 1][f] : 0; };
  clipRect(c.x, c.y, c.w, bot - c.y + 1, () => {
    if (t >= c06_T.gen) {
      const i = t >= c06_T.press ? 1 : 0, [s, n] = c06_MSG[i], at = i ? c06_T.press : c06_T.gen;
      const bw = tw(s, 'small') + 12, bx = c.x + (i ? 30 : 4), by = by0 + pop(at);
      if (i) clio(c.x + 6, by - 8, { scale: 1, expr: 'happy', mouth: 'sing', pose: 'none' });
      c06_ghost(bx, by, bw, 17, t, false, false, C.white, c06_PAPER);
      const nSel = i ? (t < c06_T.rel ? 0 : Math.min(n, R(Math.ceil(prog(t, c06_T.rel, c06_T.rel + .375) * 4) / 4 * n))) : n;
      if (nSel) rect(bx + 5, by + 3, tw(s.slice(0, nSel), 'small') + 2, 11, P.sel);
      text(s.slice(0, nSel), bx + 6, by + 5, { font: 'small', color: P.selText }); text(s.slice(nSel), bx + 6 + tw(s.slice(0, nSel), 'small'), by + 5, { font: 'small', color: C.black });
      const nf = c06_FL.filter(([, h]) => t >= h).length; for (let j = 0; j < nf; j++) c06_mini(bx + bw - 6 - j * 8, by - 8);
      if (l) c06_tag(l, bx + 4, c.y, t);
    } else {
      if (t >= c06_T.send) { const s = 'Check for drift.', bw = tw(s, 'small') + 14, bx = c.x + c.w - bw - 10, by = by0 + pop(c06_T.send); rrect(bx, by, bw, 17, 8, '#2b8cf6'); text(s, bx + 7, by + 5, { font: 'small', color: C.white }); }
      if (l) c06_say(l, c.x + 34, by0, t);
    }
  });
}

// Caches. A window that does not change between two keys is drawn once into a one-slot canvas and blitted (identical
// pixels; the key is a function of t, so every frame is still a function of t alone). DOOM, the expensive one, runs at 12 fps.
const c06_gc = {};
function c06_blit(name, key, x0, y0, w, h, fn) {
  const c = c06_gc[name] || (c06_gc[name] = { cv: offscreen(w, h, () => {}), k: null, r: null });
  if (c.k !== key) { const g = c.cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); offscreen(w, h, () => { ctx.setTransform(1, 0, 0, 1, -x0, -y0); c.r = fn(); }, c.cv); c.k = key; }
  ctx.drawImage(c.cv, x0, y0); return c.r;
}
// MultiFinder: DOOM and Micropolis beside the chat, opening from it
function c06_doom(t, ox = 0, oy = 0) {   // (ox, oy): drawn shifted, untransformed (its pattern fills do not follow a transform)
  const dc = APP.doom(284 - ox, 30 - oy, 116, 100, { k: prog(t, c06_T.an, c06_T.an + .1), from: [120 - ox, 250 - oy], walk: t * 1.5, imp: c06_on(t, c06_T.desk + .5, c06_T.fr) ? clamp(t - c06_T.desk - .5) : false, fire: c06_on(t, c06_T.check, c06_T.check + .2) ? 1 - (t - c06_T.check) * 5 : 0 });
  if (!dc) return;
  const f = c06_fr(t, c06_T.an + .1), hy = dc.y + dc.h - 16;   // the product's IWAD prompt first, then the game; a HUD that fits 116 px
  // the IWAD prompt for 4 frames as a small box over the view, clear of the pen (a whole black client cut to the game flashed)
  if (f < 4) { rect(dc.x + 34, dc.y + 26, 76, 30, C.black); (f < 2 ? ['Choose a', 'local IWAD'] : ['Local IWAD', 'ready']).forEach((s, i) => text(s, dc.x + 40, dc.y + 31 + i * 12, { font: 'small', color: C.white })); }
  if (f >= 0) { rect(dc.x, hy + 1, dc.w - 24, 15, '#5a5a5a'); text('AMMO 50', dc.x + 5, hy + 5, { font: 'small', color: '#ff4a3a' }); text('100%', dc.x + 62, hy + 5, { font: 'small', color: '#ff4a3a' }); }
}
const c06_micro = (t, k) => APP.micropolis(284, 136, 116, 52, { k, from: [120, 250], title: 'Micropol…', built: prog(t, c06_T.app, c06_V.end), header: ['/go/micropolis', '', ''], win: { zoom: false, collapse: false } });
function c06_games(t) {
  if (t < c06_T.an + .2) c06_doom(t); else { const q = Math.floor(t * 12 + 1e-6); c06_blit('d', q, 278, 26, 136, 110, () => { ctx.setTransform(1, 0, 0, 1, 0, 0); c06_doom(q / 12, 278, 26); }); }
  if (t < c06_T.app + .1) { if (t >= c06_T.app) c06_micro(t, prog(t, c06_T.app, c06_T.app + .1)); } else {   // MultiFinder redraws it top-down over 12 frames (a light window cut in whole over the desk would flash)
    const m = Math.floor(t * 4 + 1e-6), rv = prog(t, c06_T.app + .1, c06_T.app + .1 + 12 / FPS), d = () => c06_blit('m', m, 278, 132, 136, 70, () => c06_micro(m / 4, 1));
    if (rv < 1) clipRect(278, 132, 136, R(70 * rv), d); else d();
  }
}
// the Manuscript, static until Review Desk covers it (the home desk's own window and full stop)
function c06_manuscript(t) {
  const st = t >= c06_T.review ? 'Final' : undefined, doc = c06_blit('ms', st || '-', 2, 26, 288, 184, () => APP.teachText(8, 30, 268, 164, { title: 'Manuscript', lines: c06_MS, status: st }));
  const r = doc.rows[doc.rows.length - 1];
  c06_PERIOD = [r.x + r.w + 1, r.y + capH('doc') - 1]; rect(c06_PERIOD[0], c06_PERIOD[1], 2, 2, FIELDS.vermilion);
  return doc;
}
// ---- the writer's hand ----
const c06_PTR = [[0, 300, 24], [c06_T.edge + .25, 300, 24], [c06_T.keep, 219, 168, "click"], [c06_T.shut, 219, 168], [c06_T.shut + .35, 300, 24]];
// the chat swells to the whole screen on "whole" and slams back on "computer."
const c06_HOME = { x: 8, y: 202, w: 268, h: 110 };
function c06_balloon(t) {
  const f = c06_fr(t, c06_T.whole), full = { x: 2, y: E.menuH + 4, w: W - 4, h: 312 - E.menuH - 6 }, k = Math.min(1, (f >> 1) / 3 + 1 / 3);
  const r = { x: R(lerp(c06_HOME.x, full.x, k)), y: R(lerp(c06_HOME.y, full.y, k)), w: R(lerp(c06_HOME.w, full.w, k)), h: R(lerp(c06_HOME.h, full.h, k)) };
  if (k < 1) zoomRects(c06_HOME, r, 1);
  APP.clioTalk(r.x, r.y, r.w, r.h, { hero: false, msgs: [], input: typeLine('Check for drift.', c06_V.start, c06_T.review + .125, undefined, { t }).str });
  const s = Math.max(2, R(5 * k)), pw = tw('Not the whole', 'chicago', s) + 12 * s;
  c06_ghost(R(r.x + r.w / 2 - pw / 2), R(r.y + r.h / 2 - 11 * s - 8), pw, 22 * s, t, false, true, '#8f99ab');   // a darker paper: the dither reads on white
  c06_words(c06_A.words.slice(4, 7), R(r.x + r.w / 2 - pw / 2) + 6 * s, R(r.y + r.h / 2 - 11 * s - 8) + 7 * s, s, t, 0);
}

// ---- the frame ----
// the stall overrides the kit's clock (T) for this frame's drawing only, and hands main's T back afterwards (the
// pointer, drawn by main, keeps the live clock: the beachball spins while the desk hangs)
function c06_frame(t) { const T0 = T; try { c06_draw(t); } finally { T = T0; } }
function c06_draw(t) {
  t = Math.max(t, c06_V.start - 1 / FPS);
  const stalled = c06_on(t, c06_T.stall, c06_T.stum);               // the hang: the frame repeats
  if (stalled) T = t = c06_T.stall;
  const hung = c06_on(t, c06_T.stall, c06_T.groove), td = hung ? c06_T.stall : t;   // the machine room frozen until the groove returns
  const key = (window.C06_NOLENS ? null : c06_lens(t, c06_KEYS)) || c06_KEYS.filter(k => k[0] <= t + 1e-6).pop() || c06_KEYS[0];
  const p = mousePath(t, c06_PTR), whole = c06_on(t, c06_T.whole, c06_T.comp), rdOn = t >= c06_T.desk;
  const typed = typeLine('Check for drift.', c06_V.start, c06_T.review + .125, undefined, { t });
  const flag = c06_FL.find(([L]) => c06_on(t, L.start, L.end));
  let rdF = null;   // this frame's Review Desk, handed from `after` to `top`
  const pop = c06_on(t, c06_T.stum, c06_T.stum + 4 / FPS);           // Clio's head pops off on the first tom (4 frames, so it reads at 1x)
  const o = {
    cur: [p.x, p.y, hung ? 'ball' : 'arrow'],
    hint: whole ? c06_HINT[1] : c06_HINT[0],
    doc: false,   // the Manuscript is blitted from its cache in `after` (identical pixels), and not at all under Review Desk
    chat: false,   // ClioTalk too is blitted in `after` (its input changes only on the hats)
    clio: pop ? false : { expr: flag ? 'surprised' : t >= c06_T.keep ? 'happy' : 'sing', look: rdOn ? [-2, -1] : undefined },
    after: () => {
      const doc = t < c06_T.desk + .25 ? c06_manuscript(t) : null, inp = t < c06_T.send ? typed.str : '';
      const chat = rdOn ? null : c06_blit('ch', inp, 2, 198, 288, 124, () => APP.clioTalk(8, 202, 268, 110, { msgs: [], hero: false, input: inp }));
      // MultiFinder: the games open from the chat and play all verse
      if (t >= c06_T.an) c06_games(t);
      // "Review": the Manuscript is Final (its strip flashes)
      if (doc && c06_fr(t, c06_T.review) >= 0 && c06_fr(t, c06_T.review) < 2) c06_dif(doc.x, doc.y + doc.h, doc.w, stripH());
      let rd = null;
      if (rdOn) {
        rd = c06_review(t);
        if (t < c06_T.desk + .1) zoomRects(c06_HOME, { x: 8, y: 230, w: 268, h: 82 }, prog(t, c06_T.desk, c06_T.desk + .1));
        const ct = c06_blit('ct', 1, 2, 226, 288, 96, () => APP.clioTalk(8, 230, 268, 82, { hero: false, msgs: [], win: { header: null } }));
        if (ct) c06_talk(t, ct);
      } else if (chat) {
        if (t >= c06_T.review) c06_talk(t, chat);
        if (t < c06_T.send) {   // the writer's keys: the newest pops inverted, a vermilion caret
          const fx = chat.input.x + 4, fy = chat.input.y + R((chat.input.h - capH('small')) / 2), w = tw(typed.str, 'small');
          if (typed.n && c06_fr(t, evTimes('hat').filter(k => k >= c06_V.start)[typed.n - 1]) < 2) { const cw = tw(typed.str.slice(-1), 'small'); rect(fx + w - cw - 1, fy - 2, cw + 2, capH('small') + 4, P.text); text(typed.str.slice(-1), fx + w - cw, fy, { font: 'small', color: C.white }); }
          if (t >= c06_V.start && (t < c06_T.review + .125 || caretOn(t))) rect(fx + w + 1, fy - 2, 1, capH('small') + 4, FIELDS.vermilion);
        }
      }
      // the evidence sheet; the KEEP click's rings go under the stamp, so the slam reads
      if (rd && t >= c06_T.rough) {
        c06_sheet(t, rd);
        if (c06_on(t, c06_T.keep, c06_T.keep + .25)) clickBurst(p.x, p.y, c06_T.keep, { pointer: false, color: FIELDS.vermilion });
        c06_sheet(t, rd, true);
      }
      if (pop) { const e = { scale: 3, mouth: 'sing', expr: 'surprised' }; clipRect(280, 170, 120, 70, () => clio(286, 188, e)); clipRect(280, 248, 120, 62, () => clio(286, 196, e)); }   // the head 8 px off its body
      if (whole) c06_balloon(t);
      if (c06_on(t, c06_T.comp, c06_T.comp + 2 / FPS)) zoomRects({ x: 2, y: E.menuH + 4, w: W - 4, h: 312 - E.menuH - 6 }, c06_HOME, (c06_fr(t, c06_T.comp) + 1) / 2);
      c06_chant(t, key);
      rdF = rd;
    },
    top: () => {   // over the pen: the flags (their full text), the gang, their hands
      const rd = rdF;
      if (rd) c06_FL.forEach(([L, h], i) => { const r = rd.rows[i]; if (r) c06_flag(rd.x + rd.w - 6, r.y + 12, c06_CK[i][2], h, t); });
      if (flag && rd) { c06_gang(t, flag[0]); c06_hands(rd.x + rd.w - 5, rd.rows[c06_FL.indexOf(flag)].y + 4, flag[1], t); }
    },
  };
  if (whole) { const sh = c06_fr(t, c06_T.whole); o.menu = { prop: (x, y, w, h) => c06_youProp(c06_HINT[1])(x + (sh < 8 ? (sh & 1 ? -1 : 1) : 0), y, w, h) }; }
  UI.dock = { bounce: { i: 6, t0: c06_T.review }, open: rdOn ? [4, 6] : [4] };
  c06_homeDesk(td, o);
  if (CUR) CUR.down = p.down;
  // band and landing
  if (c06_on(t, c06_T.comp, c06_T.comp + 4 / FPS)) FX.shake = 2;
  if (c06_on(t, c06_T.stum, c06_T.groove)) FX.dy = [4, 2, 0][Math.min(2, Math.floor((t - c06_T.stum) * 8))];
  punch(hit('verse2'), 557, 181, [2, 2]); invertFrame(hit('verse2'), 1);
}
const c06_S = [['ch06 chat', c06_V.start, c06_B.start], ['ch06 review', c06_B.start, c06_Q1.start], ['ch06 flags', c06_Q1.start, c06_Q4.start], ['ch06 keep', c06_Q4.start, c06_V.end]];
for (const [n, a, b] of c06_S) scene(n, a, b, c06_frame, { era: 'aqua', screen: true });
}
