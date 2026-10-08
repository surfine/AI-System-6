'use strict';
// ch07 · pre-chorus 2 (76-84), Tiger. The desk re-skins to brushed metal on the stab; Review Desk re-checks and re-flags;
// her smoothed copy melts as the low-pass closes and drops when she won't; the pen grows over the page, two dotted hands
// reach, HAND freezes the world, and the writer brings the pen down LEVEL like a rubber stamp: PEN PAL · 2009, and lime
// floods out of the postmark.
{
// ---- THE HOME DESK (STORYBOARD §4, verbatim, prefixed) ----
const MS = ['# The Tide Comes In Twice', 'They never called it renewable energy. They called it the tide, and they billed it by the moon.', 'Twice a day the estuary fills'];
const INV = c => { const [r, g, b] = rgb(c); return hex(255 - r, 255 - g, 255 - b); };   // pre-invert a colour for FX.invert frames
const HINT = ['Sounds like you.', 'Sounds like a mouthpiece.'];   // Review Desk's lens hint, the product's words; never a number
const youProp = s => (x, y, w, h) => { const f = 'menu'; text(s, x + w, y + R((h - capH(f)) / 2), { font: f, align: 'right', color: P.menuText }); };
let PERIOD = [0, 0];   // the writer's full stop, screen coordinates, set by every homeDesk call
function c07_homeDesk(t, o = {}) {
  const neg = !!o.neg, verm = neg ? INV(FIELDS.vermilion) : FIELDS.vermilion;
  UI.menu = { app: 'AI System 6', prop: youProp(o.hint || HINT[0]), propW: 128, ...(o.menu || {}) };
  const doc = o.doc === false ? null : APP.teachText(8, 30, 268, 164, { title: 'Manuscript', lines: o.lines || MS, ...(o.doc || {}) });
  if (doc) { const r = doc.rows[doc.rows.length - 1]; PERIOD = [r.x + r.w + 1, r.y + capH('doc') - 1]; rect(PERIOD[0], PERIOD[1], 2, 2, verm); }
  const chatH = E.dock ? 110 : 116;   // the dock covers y > 312
  const chat = o.chat === false ? null : APP.clioTalk(8, 202, 268, chatH, { msgs: o.msgs || [], actions: o.actions, hero: false, input: o.input, ...(o.chat || {}) });
  deskIcon(460, 22, 'hardDisk', 'Project Hard Disk');
  floppyDrive(404, 70, 'A:', 'floppyA', t, { compact: true });
  floppyDrive(404, 150, 'B:', 'floppyB', t, { compact: true });
  ejectDisk(412, 230, undefined, { t });
  if (!E.dock) { deskIcon(336, 296, 'scrapbook', 'Scrapbook'); deskIcon(404, 296, 'sectionDrafts', 'Section Drafts'); deskIcon(466, 296, 'projectDisc', 'Project CD'); trashIcon(286, 296, false); }
  if (o.clio !== false) clio(286, 196, { scale: 3, mouth: 'sing', expr: 'sing', ...(o.clio || {}) });
  if (o.after) o.after({ doc, chat });   // gag windows, alerts, plates: BEFORE the pointer and the pen
  if (o.cur) {
    const [cx, cy] = o.cur; CUR = { x: cx, y: cy, kind: o.cur[2] || 'arrow' };
    penCord([[cx + 5, cy + 15], [cx + 9, cy + 37]], { sag: 6, swing: 3, t });
    pen(cx + 9, cy + 74, Math.PI / 2, 1, neg ? { t, color: C.black, outline: C.white, flash: false } : { t });
  }
  return { doc, chat, period: PERIOD };
}
const hasScene = n => SCENES.some(s => s.name === n);   // guard before frameInto(…, 'chNN name')
// the lens, read as ch01 and ch06 read it: the n x crop CENTRED on (x, y) in screen px, kept inside the screen
function c07_lens(t, keys) {
  let k = null; for (const q of keys) if (q[0] <= t + 1e-6) k = q;
  if (!k || k[3] <= 1) return k;
  const n = k[3], s = screenSize(t), cw = Math.ceil(FW / n), ch = Math.ceil(FH / n);
  const cx = clamp(R(k[1] + s.x - cw / 2), s.x, s.x + s.w - cw), cy = clamp(R(k[2] + s.y - ch / 2), s.y, s.y + s.h - ch);
  const fix = v => { let z = R(v * n / (n - 1)); while (z - Math.floor(z / n) > v) z--; while (z - Math.floor(z / n) < v) z++; return z; };
  stepZoom(n, fix(cx) - s.x, fix(cy) - s.y);
  return k;
}

// ---- the song's clock (every time from data.js; literals are offsets) ----
const LA = lyric('pre2a'), LB = lyric('pre2b'), LC = lyric('pre2c'), LD = lyric('pre2d'), LP = lyric('chorus2a'), LINES = [LA, LB, LC, LD, LP];
const at = (L, i) => L.words[i].start;
const T0 = section('pre2').start, DOWN = hit('chorus2'), FL0 = DOWN - 10 / FPS, HAND = hit('stop2'), SMOOTH = hit('smooth'), S16 = SPB / 4, S8 = SPB / 2;
const CAN = at(LA, 1), CHECK = at(LA, 2), FLAG = at(LA, 5), COULD = at(LB, 1), IT = at(LB, 3), WONT = at(LB, 5);
const BUT = LC.start, PEN = at(LC, 2), AND = at(LC, 3), PAGE = at(LC, 5), STAY = LD.start, PICK = LP.start, YOUR = at(LP, 2);
const RISER = evList('riser').find(r => r[0] >= T0 - 1e-6) || [T0, HAND];
const BELL = (evList('bell').find(b => b[0] >= T0) || [WONT])[0];
const SHUT = evTimes('snare').find(x => x >= BUT - 1e-6);   // the snare that closes the sheet
const RESTAMP = [0, 1, 2].map(i => FLAG + i * S16);          // "flag.": the three flags re-stamp, rat-a-tat
const fr = (t, a) => Math.floor((t - a) * FPS + 1e-6);
const on = (t, a, b) => t >= a - 1e-6 && t < b - 1e-6;
const RED = '#d8261c', VER = FIELDS.vermilion, YEAR = ERA.snowleopard.year;
// the page, the postmark (its centre is where the lime comes from), the plate's split per line (screen px)
const PG = { x: 156, y: 104, w: 216, h: 120 }, TIP = [264, 170], TIPF = [TIP[0] + 16, TIP[1] + 2], PMR = 40;
const LIFT = [TIP[0] + 12, TIP[1] - 52], SPLIT = { pre2a: 3, pre2b: 4, pre2c: 3, pre2d: 2 }, NIB = [294, 150];   // NIB: where the grown pen hangs
// the lens: [t, cx, cy, n, plateX, plateY]; the plate is Chicago 2x at 1x, 1x when zoomed
const KEYS = [
  [T0, 0, 0, 1, 300, 264],                  // the stab: the Tiger wipe seen whole (the plate on clear desk under Clio)
  [CHECK, 175, 160, 2, 184, 212],           // Review Desk: the ticks down the rows, the meter filling
  [FLAG, 290, 155, 2, 184, 205],            // the re-stamped flags whole, and the machine room: A:/B: step on 78.0
  [COULD, 115, 214, 3, 26, 238],            // the sheet: your sentence, her smoothed offer melting
  [WONT, 150, 240, 2, 26, 238],             // the offer drops behind the plate, the Writing Bell rings in the dock
  [BUT, 250, 112, 2, 152, 64],              // the sheet shuts; the writer takes the pen over to the free space
  [PEN, 250, 125, 3, 152, 70],              // the pen grows over the page
  [HAND, 276, 150, 4, 204, 112],            // HAND: the punch at the nib (6x, 5x), then
  [HAND + 2 / FPS, 0, 0, 1, 100, 170],      // the jolt seen whole for 4 frames: the hint shakes, the Trash bulges
  [HAND + 6 / FPS, 276, 150, 4, 204, 112],  // frozen: the nib, the hands, the page
  [YOUR, 270, 160, 3, 166, 104],            // the stamp pressed and lifted: the postmark read before the flood
];
let c07_noPen = false;   // set only inside the flood's frameInto (the flood draws its own, flying pen)

// ---- small helpers ----
const dif = (x, y, w, h) => { ctx.save(); ctx.globalCompositeOperation = 'difference'; rect(x, y, w, h, C.white); ctx.restore(); };
// Clio's TEMPORARY plate (as ch06): 50% paper dither on a flat grey (nothing shows through), marching ants on 8ths, the tag on its top edge
function c07_ghost(x, y, w, h, t, tag = true) {
  const ph = Math.floor(t * 4) & 3;
  ctx.drawImage(memo('c07gh' + [w, h, ph, tag], w, h + 6, () => c07_ghostAt(0, 6, w, h, ph, tag)), R(x), R(y) - 6);
}
function c07_ghostAt(x, y, w, h, ph, tag) {
  rect(x, y, w, h, '#c4c4c8'); bayer(x, y, w, h, .5, C.white); frame(x, y, w, h, C.white);
  let i = 0; ctx.fillStyle = C.black;
  const d = (px, py) => { if (((i++ + ph) & 3) < 2) ctx.fillRect(px, py, 1, 1); };
  for (let k = 0; k < w; k++) d(x + k, y); for (let k = 1; k < h; k++) d(x + w - 1, y + k);
  for (let k = w - 2; k >= 0; k--) d(x + k, y + h - 1); for (let k = h - 2; k > 0; k--) d(x, y + k);
  if (tag) { const tg = tw('TEMPORARY', 'small'); rect(x + w - tg - 10, y - 5, tg + 6, 11, C.black); text('TEMPORARY', x + w - tg - 7, y - 3, { font: 'small', color: C.white }); }
}
// the sung line on its plate: two rows (the line's two phrases), each word popping inverted for 3 frames on its note
function c07_plate(t, key) {
  let L = null; for (const l of LINES) if (t >= l.start - 1e-6) L = l;
  if (!L) return;
  const s = key[3] === 1 ? 2 : 1, ws = L.words.filter(w => w.start < DOWN - 1e-6), sp = SPLIT[L.id] || ws.length, rows = [ws.slice(0, sp), ws.slice(sp)].filter(r => r.length);
  const sung = r => r.filter((w, i) => !i || t >= w.start - 1e-6), shown = rows.filter((r, j) => !j || t >= r[0].start - 1e-6);   // the plate grows with the line
  const rw = r => tw(sung(r).map(w => w.w).join(' '), 'chicago', s), pw = Math.max(tw('TEMPORARY', 'small') + 16, ...shown.map(rw)) + 12 * s, ph = (shown.length * 14 + 8) * s;
  c07_ghost(key[4], key[5], pw, ph, t);
  rows.forEach((r, j) => r.forEach((w, i) => {
    if (t < w.start - 1e-6) return;
    const px = key[4] + 6 * s + tw(r.slice(0, i).map(v => v.w).join(' ') + (i ? ' ' : ''), 'chicago', s), py = key[5] + (7 + j * 14) * s, ww = tw(w.w, 'chicago', s);
    const held = t < w.end && t < HAND && L === LC && w.end - w.start >= S8 * 2 ? Math.floor(t * 11) & 1 : 0;   // the lead's vibrato
    if (fr(t, w.start) < 3) { rect(px - s, py - 2 * s, ww + 2 * s, 13 * s, C.black); text(w.w, px, py, { font: 'chicago', scale: s, color: C.white }); }
    else text(w.w, px + held, py, { font: 'chicago', scale: s, color: C.black, outline: C.white });
  }));
}
// a 2x2-cell dither of colour c over a rect at level k (temporary things leave, and get smoothed, this way)
const PATS = new Map();
function cells(x, y, w, h, k, c) {
  if (k <= 0) return; let p = PATS.get(k + c);
  if (!p) PATS.set(k + c, p = ctx.createPattern(offscreen(8, 8, () => { for (let j = 0; j < 8; j += 2) for (let i = 0; i < 8; i += 2) if (BAYER4[(j >> 1) * 4 + (i >> 1)] < k * 16) rect(i, j, 2, 2, c); }), 'repeat'));
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = p; ctx.fillRect(0, 0, w, h); ctx.restore();
}

// ---- Review Desk, as ch06 left it (§6 B6), then re-checked and re-flagged ----
const CK = [['Rhythm', 'rhythm', 'Over-regular rhythm'], ['Summary language', 'generic', 'Generic summary language'], ['Press-release hedging', 'hedging', 'Press-release hedging'], ['Personal detail', 'KEEP', '']];
// a row's state: flagged (B6) -> spinning on "can" -> ticked down the rows on "check." -> flagged again on "flag."
const rowState = (i, t) => t < CAN ? (i < 3 ? 'flag' : 'ok') : t < CHECK + i * S8 ? 'pending' : i < 3 && t >= RESTAMP[i] ? 'flag' : 'ok';
// the gang's flag at a row's end: its pennant (the full flag text) flies out over the games and shivers on the tambourine
function c07_flag(x, y, label, t, i) {
  const y0 = t >= PEN ? PEN : on(t, CAN, RESTAMP[i]) ? CAN : 0; if (y0) { const f = fr(t, y0); if (f > 2) return; y += [4, 10, 18][f]; }   // pulled out on "can", and for good on "pen"
  const f = fr(t, RESTAMP[i]), o = f >= 0 && f < 3 ? [5, 3, 1][f] : 0, L = tw(label, 'small') + 14;
  const ti = evIndex('tambourine', Math.min(t, HAND)), wv = (ti >= 0 && evList('tambourine')[ti][0] >= T0 - 1e-6 ? ti : onBeat(t)) & 1;
  cache('fl' + [i, y, o, wv, f === 0], x - 2, y - 24, L + 8, 40, () => c07_flagAt(x, y, label, o, wv, L, f));
}
function c07_flagAt(x, y, label, o, wv, L, f) {
  rect(x, y - 15 - o, 2, 24 + o, C.black);
  for (let s = 0; s < L; s += 8) { const dy = (s >> 3) % 2 === wv ? 0 : 1, sw = Math.min(8, L - s); rect(x + 2 + s, y - 15 - o + dy, sw, 11, C.black); rect(x + 2 + s, y - 14 - o + dy, sw - (s + sw >= L ? 1 : 0), 9, RED); }
  clipRect(x + 2, y - 16 - o, L - 4, 13, () => text(label, x + 8, y - 12 - o, { font: 'small', color: C.white })); rect(x + L - 2, y - 11 - o, 3, 3, C.black);
  if (f === 0) dif(x - 1, y - 16 - o, L + 4, 26 + o);   // the re-stamp: one frame inverted
}
// cache(key, x, y, w, h, fn): a static stretch of the desk drawn once per state and stamped (x, y on the 8 px grid)
const cache = (key, x, y, w, h, fn) => ctx.drawImage(memo('c07' + key, w, h, () => { ctx.translate(-x, -y); fn(); }), x, y);
let RDG = null;   // Review Desk's geometry (rows, meter), the same every frame
function c07_review(t, tf) {
  const n = R((beatAt(RISER[1]) - beatAt(RISER[0])) * 4), rk = Math.floor(prog(tf, RISER[0], RISER[1]) * n + 1e-6) / n;
  const sel = [0, 1, 2, 3].find(i => on(tf, CHECK + i * S8, CHECK + (i + 1) * S8)) ?? -1;
  cache('rd' + CK.map((c, i) => rowState(i, tf)).join() + sel + rk, 0, 24, 288, 208, () => { RDG = c07_reviewWin(tf, sel, rk); });
  const rd = RDG;
  rd.rows.slice(0, 3).forEach((r, i) => c07_flag(rd.x + rd.w - 6, r.y + 12, CK[i][2], tf, i));
  return rd;
}
function c07_reviewWin(tf, sel, rk) {
  const rd = APP.reviewDesk(8, 30, 268, 196, { doc: 'The Tide Comes In Twice', header: ['812 words', '', 'Not a score.'], checks: CK.map(([label, note], i) => ({ label, note, state: rowState(i, tf) })), you: 100 });
  const rows = rd.rows;
  // "check.": the row being checked is selected for its 8th, the tick lands on the note
  rows.forEach((r, i) => {
    if (i === sel) { rect(r.x, r.y, r.w, r.h, P.sel); glyph('ok', rd.x + 12, r.y + 4, C.white); text(CK[i][0], rd.x + 28, r.y + 4, { font: 'body', color: P.selText }); text(CK[i][1], rd.x + rd.w - 12, r.y + 4, { font: 'small', color: P.selText, align: 'right' }); }
  });
  // the singer's waveform in row 1: sixteen identical bars, as ch06 left it
  for (let i = 0; i < 16; i++) rect(rd.x + 86 + i * 7, rows[0].y + 8, 4, 2, sel === 0 ? P.selText : P.text);
  // the KEEP stamp on row 4
  const r4 = rows[3], nw = tw('KEEP', 'small') + 8, kx = rd.x + rd.w - 12 - nw + 4;
  rect(kx - 2, r4.y + 1, nw + 2, r4.h - 2, VER); rect(kx - 1, r4.y + 2, nw, r4.h - 4, sel === 3 ? P.sel : C.white); text('KEEP', kx + 3, r4.y + 4, { font: 'small', color: VER });
  // the riser is Review Desk's own meter row: "Reviewing…", filling on 16ths
  const m = rd.meter;
  rect(m.x - 2, m.y - 20, 150, 16, P.win); text('Reviewing… ' + R(rk * 100) + '%', m.x, m.y - 18, { font: uiHead(), color: P.text });
  rect(m.x - 1, m.y - 1, m.w + 2, m.h + 2, P.win); progress(m.x, m.y, m.w, m.h, rk);
  // the drift gauge, settled on YOU
  const gx = rd.x + rd.w - 40, gy = m.y - 8;
  for (let d = -60; d <= 60; d += 10) { const q = (d - 90) * Math.PI / 180; rect(gx + R(Math.cos(q) * 13), gy + R(Math.sin(q) * 13), 1, d % 30 ? 1 : 2, P.text); }
  vline(gx, gy - 11, 11, RED); rect(gx - 1, gy - 1, 3, 3, P.text);
  return { x: rd.x, y: rd.y, w: rd.w, h: rd.h, rows, meter: m };
}
// the evidence sheet drops from row 4 again: your sentence (solid, jagged) and her new offer, which the low-pass smooths
// away on "smooth" (corners round, the fill flattens, the letters lose their pixels) and which drops on "won't."
function c07_sheet(t, tf, rd) {
  const r = rd.rows[3], open = Math.min(4, fr(t, LB.start) + 1), shut = fr(t, SHUT), n = shut >= 0 ? 4 - Math.min(4, shut + 1) : open;
  if (n <= 0 || t < LB.start) return;
  const x = rd.x + 6, y = r.y + r.h, w = rd.w - 12, SH = 84, h = R(SH * n / 4);
  clipRect(x, y, w, h, () => {
    const yy = y + h - SH;
    rect(x, yy, w, SH, C.black); rect(x + 1, yy, w - 2, SH - 1, '#f4f4f6'); hline(x + 1, yy, w - 2, '#9a9aa4');
    const s1 = 'Twice a day the estuary fills', w1 = tw(s1, 'doc');
    text(s1, x + 8, yy + 6, { font: 'doc', color: C.black }); rect(x + 9 + w1, yy + 6 + capH('doc') - 2, 2, 2, VER);
    for (let i = 0; i < w1; i += 3) rect(x + 8 + i, yy + 8 + capH('doc') + (hash(i * 3.1) * 3 | 0), 2, 1, C.black);   // the rough edge, kept
    if (tf >= IT) { const f = fr(t, IT); if (f >= 6 || (f & 2) === 0) rect(x + 6, yy + 12 + capH('doc'), w1 + 6, 2, VER); }   // "it.": the writer's mark
    text('KEEP', x + w - 8, yy + 6, { font: 'small', color: VER, align: 'right' });
  });
  return { x, y };
}
// her offer: "The estuary fills twice daily." on a temporary plate (doc type at 2x), smoothed on the four 16ths of "smooth"
function c07_offer(t, sx, sy) {
  if (t < COULD || t >= WONT + 6 / FPS) return;
  const pf = fr(t, COULD), pop = pf < 3 ? [4, 2, 1][pf] : 0, df = fr(t, WONT), drop = df >= 0 ? R(6 * df * df + 4 * df) : 0;
  const st = t < SMOOTH ? 0 : Math.min(4, Math.floor((t - SMOOTH) / S16 + 1e-6) + 1);   // the low-pass, in 4 hard steps
  const x = sx + 2, y = sy + 32 + drop - pop, w = 184, h = 48, rr = [6, 8, 10, 12, 14][st];
  if (st === 0) c07_ghost(x, y, w, h, t, df < 0);
  else {   // the plate goes round and flat grey, the ants stop
    rrect(x, y, w, h, rr, '#8e8e93'); rrect(x + 1, y + 1, w - 2, h - 2, rr - 1, ['#f4f4f6', '#dcdce0', '#cfcfd4', '#c6c6cb', '#c2c2c6'][st]);
    const tg = tw('TEMPORARY', 'small'); if (df < 0) { rect(x + w - tg - 10, y - 5, tg + 6, 11, C.black); text('TEMPORARY', x + w - tg - 7, y - 3, { font: 'small', color: C.white }); }
  }
  const ink = st ? ['#000000', '#26262a', '#3a3a40', '#505056', '#5c5c62'][st] : C.black;
  text('The estuary fills', x + 8, y + 6, { font: 'doc', scale: 2, color: ink });
  text('twice daily.', x + 8, y + 27, { font: 'doc', scale: 2, color: ink });
  if (st) cells(x + 4, y + 4, w - 8, h - 8, [0, .5, .75, .875, .875][st], ['#f4f4f6', '#dcdce0', '#cfcfd4', '#c6c6cb', '#c2c2c6'][st]);   // the consonants smoothed off
}

// ---- ClioTalk, shrunk under Review Desk (B6): her last bubble, three flags at its corner ----
const mini = (x, y) => { rect(x, y, 1, 9, C.black); rect(x + 1, y, 6, 5, C.black); rect(x + 1, y + 1, 5, 3, RED); };
function c07_talk(t) {
  const sg = singing(t), mk = (Math.floor(t * 4) & 3) + '|' + R((sg ? sg.open : 0) * 4) + (sg && sg.shape);
  cache('talk' + mk, 0, 224, 288, 96, () => c07_talkWin(t));
  return { tail: [42, 266] };
}
function c07_talkWin(t) {
  const c = APP.clioTalk(8, 230, 268, 82, { hero: false, msgs: [], win: { header: null } });
  if (!c) return null;
  const bot = c.y + c.h - 37, s = 'We are excited to announce the tide.', bw = tw(s, 'small') + 12, bx = c.x + 30, by = bot - 18, n = 26;
  clipRect(c.x, c.y, c.w, bot - c.y + 1, () => {
    c07_ghost(bx, by, bw, 17, t, false);
    rect(bx + 5, by + 3, tw(s.slice(0, n), 'small') + 2, 11, P.sel);
    text(s.slice(0, n), bx + 6, by + 5, { font: 'small', color: P.selText }); text(s.slice(n), bx + 6 + tw(s.slice(0, n), 'small'), by + 5, { font: 'small', color: C.black });
    clio(c.x + 6, by - 8, { scale: 1, expr: 'happy', mouth: 'sing', pose: 'none' });
    for (let j = 0; j < 3; j++) mini(bx + bw - 6 - j * 8, by - 8);
  });
  return { tail: [bx + 4, by + 17] };
}

// ---- the page: Section Drafts opens under the pen on "page", whapped by every snare, its scroll thumb rattling ----
const whap = t => { const i = evIndex('snare', t), e = evList('snare')[i]; return e && e[0] >= PAGE - 1e-6 && t < HAND && fr(t, e[0]) < 2 ? (i & 1 ? 2 : -2) : 0; };
function c07_page(t, tf) {
  if (t < AND) return null;
  if (t < PAGE) { const k = Math.floor(prog(t, AND, PAGE) * 4 + 1) / 4; zoomRects({ x: NIB[0] - 4, y: NIB[1], w: 8, h: 8 }, PG, k * .35); return null; }   // the outline creeps out of the nib
  const k = Math.min(1, Math.floor(prog(t, PAGE, PAGE + .2) * 4 + 1e-6) / 4), ti = evIndex('tambourine', tf);
  const sk = .1 + (ti & 1) * .06 + (on(tf, PAGE, HAND) && fr(tf, evList('tambourine')[ti][0]) < 2 ? .03 : 0);
  const n = R((beatAt(RISER[1]) - beatAt(RISER[0])) * 4), rk = Math.floor(prog(tf, RISER[0], RISER[1]) * n + 1e-6) / n;
  const wh = k >= 1 ? whap(t) : 0;
  cache('pg' + [k, wh, sk, rk], 136, 96, 256, 136, () => {
    const c = win(PG.x + wh, PG.y, PG.w, PG.h, 'Section Drafts', { k, from: NIB, active: true, scroll: 'v', sk, sfrac: .4, status: ['Reviewing… ' + R(rk * 100) + '%', '', 'Draft 3'] });
    if (!c) return;
    rect(c.x, c.y, c.w, c.h, C.white);
    for (let y = c.y + 16; y < c.y + c.h - 2; y += 14) hline(c.x + 4, y, c.w - 8, '#a9c4ec');   // a fresh sheet of letter paper
  });
}
// the postmark the level pen leaves on the page: a black rubber stamp, PEN PAL round its rim, the year, two cancel bars
function c07_postmark(cx, cy) {
  for (const dy of [-9, 5]) for (let x = cx + PMR - 4; x < cx + PMR + 54; x += 3) rect(x, cy + dy + R(3 * Math.sin((x - cx) / 7)), 3, 4, C.black);
  disc(cx, cy, PMR, C.black); ring(cx, cy, PMR - 4, C.white, 1); ring(cx, cy, PMR - 19, C.white, 1);
  [...'PEN PAL'].forEach((ch, i) => { const a = -Math.PI / 2 + (i - 3) * .29; text(ch, cx + R(Math.cos(a) * (PMR - 11)), cy + R(Math.sin(a) * (PMR - 11)) - 4, { font: 'chicago', color: C.white, align: 'center' }); });
  text(String(YEAR), cx, cy - 4, { font: 'chicago', color: C.white, align: 'center' });
  for (const sx of [-1, 1]) rect(cx + sx * 31 - 2, cy - 2, 4, 4, C.white);   // the two stars on the rim between PEN PAL and the year
  [...'AIRMAIL'].forEach((ch, i) => { const a = Math.PI / 2 - (i - 3) * .24; text(ch, cx + R(Math.cos(a) * (PMR - 11)), cy + R(Math.sin(a) * (PMR - 11)) - 4, { font: 'small', color: C.white, align: 'center' }); });
}

// ---- the writer's pen rig: home; slid over the free space on "But"; grown 1 -> 2 -> 3 on "pen"; frozen by HAND; then
//      gripped and turned LEVEL about its nib on the 16ths of "I'm just", and lowered onto the page like a rubber stamp ----
const HALF = Math.PI / 2;
function c07_rig(t) {
  if (t < BUT) return { px: 300, py: 24, s: 1, L: 22, a: HALF };
  if (t < PEN) { const k = clamp((fr(t, BUT) + 1) / 8); return { px: R(lerp(300, NIB[0] - 9, k)), py: R(lerp(24, 20, k)), s: 1, L: 22, a: HALF }; }
  if (t < PEN + S8) return { px: NIB[0] - 9, py: 20, s: 2, L: 16, a: HALF };
  if (t < PICK) return { px: NIB[0] - 9, py: NIB[1] - 135, s: 3, L: 10, a: HALF };
  const k = Math.min(4, Math.floor((t - PICK) / S16 + 1e-6) + 1);
  if (t < YOUR - S16 / 2) return { tip: NIB, a: HALF + HALF * k / 4, s: 3, lvl: true };   // the cap end swings up and over
  // then the level pen is slid over the page in a 32nd, pressed flat on "your" and lifted off the postmark
  return { tip: t < YOUR ? [NIB[0] - 43, NIB[1] + 4] : fr(t, YOUR) < 2 ? [TIP[0] - 55, TIP[1]] : LIFT, a: Math.PI, s: 3, lvl: true };
}
const tipOf = g => g.lvl ? g.tip : [g.px + 9, g.py + 15 + g.L + R(36.5 * g.s)];
// the pen as a cached sprite per angle and scale (a scale-3 pen is ~2 ms of polygons)
const c07_pen = (tip, a, s) => ctx.drawImage(memo('c07pen' + a.toFixed(3) + s, 320, 320, () => pen(160, 160, a, s, { t: T0, flash: false })), tip[0] - 160, tip[1] - 160);
function c07_drawRig(t, g, tf) {
  const tip = tipOf(g);
  if (!g.lvl) {
    penCord([[g.px + 5, g.py + 15], [g.px + 9, g.py + 15 + g.L]], { sag: 6, swing: g.s > 1 ? 1 : 3, t: tf });
    c07_pen(tip, HALF, g.s); CUR = { x: g.px, y: g.py, kind: 'arrow' };
    return tip;
  }
  const L = R(36.5 * g.s), ca = Math.cos(g.a), sa = Math.sin(g.a), back = [R(tip[0] - ca * L), R(tip[1] - sa * L)], mid = [R(tip[0] - ca * L / 2), R(tip[1] - sa * L / 2)];
  penCord([[back[0], back[1] - 120], back], { sag: 0, swing: 0, t: tf });   // the cord dangles from the cap end
  c07_pen(tip, g.a, g.s);
  CUR = { x: mid[0] - 7, y: mid[1] - 12, kind: 'grab' };   // the writer's hand grips the barrel: the handle of a stamp
  return tip;
}
// the frame
function c07_desk(t) {
  const tf = Math.min(t, HAND), frozen = t >= HAND, hf = frozen ? fr(t, HAND) : -1, shakeHint = hf >= 0 && hf < 6 ? (hf & 1 ? 1 : -1) : 0, g = c07_rig(t);
  const key = c07_lens(t, KEYS) || KEYS.filter(k => k[0] <= t + 1e-6).pop();
  if (hf >= 0 && hf < 2) stepZoom([6, 5][hf], NIB[0], NIB[1]);   // the stab: a punch at the nib, then the jolt at 1x
  if (hf >= 0 && hf < 5) FX.shake = 2;
  // the band in view: four on the floor fire DOOM's shotgun (the ammo counts the kicks); the Writing Bell launches into
  // the dock and rings on "won't."
  const kf = fr(tf, (evLast('kick', tf) || [-9])[0]), fire = kf >= 0 && kf < 3 ? 3 - kf : 0, bellIn = t >= BELL - 1e-6;
  UI.dock = { open: [4, 6], items: bellIn ? DOCK_DEFAULT.slice(0, 5).concat('writingBell', DOCK_DEFAULT.slice(5)) : undefined, bounce: bellIn ? { i: 5, t0: BELL } : undefined };
  c07_homeDesk(tf, {
    doc: false, chat: false, clio: false,   // the Manuscript lies under Review Desk (B6): not drawn
    menu: { prop: (x, y, w, h) => youProp(HINT[0])(x + shakeHint, y, w, h), clock: clockText(tf) },
    after: () => {
      const q = Math.floor(tf * FPS / 4), ammo = 50 - evIn('kick', T0, tf + 1e-6).length;
      ctx.drawImage(memo('c07doom' + q + '|' + fire + '|' + ammo, 136, 120, () => {   // DOOM redraws every 4th frame
        const dc = APP.doom(8, 8, 116, 100, { walk: q * 4 / FPS * 1.5, fire: fire / 3 });
        if (dc) { const hy = dc.y + dc.h - 16; rect(dc.x, hy + 1, dc.w - 24, 15, '#5a5a5a'); text('AMMO ' + ammo, dc.x + 5, hy + 5, { font: 'small', color: '#ff4a3a' }); text('100%', dc.x + 62, hy + 5, { font: 'small', color: '#ff4a3a' }); }
      }), 276, 22);
      cache('micro', 280, 128, 128, 72, () => APP.micropolis(284, 136, 116, 52, { built: 1, header: ['/go/micropolis', '', ''], win: { zoom: false, collapse: false } }));
      const rd = c07_review(t, tf);
      const talk = c07_talk(t);
      const sh = c07_sheet(t, tf, rd);
      if (sh) c07_offer(t, sh.x, sh.y);
      c07_page(t, tf);
      if (t >= YOUR - 1e-6) c07_postmark(TIP[0], TIP[1]);
      // Clio, in front of the page: sings, shrugs on "won't.", and from "stay" reaches with a dotted hand; a second dotted
      // hand crawls out of her chat bubble's tail. Stop-motion, 2 frames a step; both freeze short of the nib on HAND.
      const reach = tf >= STAY, h0 = [300, 214], sk = clamp(Math.floor((tf - STAY) * FPS / 2 + 1) * 2 / FPS / (HAND - STAY)) * .94;
      clio(286, 196, { scale: 3, mouth: 'sing', expr: frozen ? 'surprised' : t >= WONT && t < BUT ? 'shrug' : t < CHECK ? 'happy' : 'sing', look: [-2, -1], pose: reach ? 'reach' : t >= WONT && t < BUT ? 'shrug' : undefined, reach: reach ? h0 : undefined, blink: !frozen, bob: frozen ? 0 : undefined });
      const back = t < PICK ? 1 : 1 - clamp((fr(t, PICK) + 1) / 4);   // the writer takes the pen: the hands snap back
      if (reach && back > 0) for (const a of [h0, talk ? talk.tail : [44, 266]]) {
        const hx = R(lerp(a[0], NIB[0], sk * back)), hy = R(lerp(a[1], NIB[1] + 3, sk * back));
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dline(a[0] + dx, a[1] + dy, hx + dx, hy + dy, C.black, 3, 3);
        pointer(hx - 6, hy - 1, 'hand'); bayer(hx - 6, hy - 1, 18, 20, .5, C.white, null);   // her hand: dithered, temporary
      }
    },
  });
  if (!c07_noPen) c07_drawRig(t, g, tf);
  // overlays: the Aqua side of the wipe (ch06's own frame, going on as it would), the bell's rings, the choked Trash, the plate
  overlay(() => {
    if (t < T0 + .35 && hasScene('ch06 keep')) {
      const e = Math.min(W, Math.floor((t - T0) / .35 * 20 + 1e-6) * R(W / 20)), b = frameInto(styleBuf('c07W'), t, 'ch06 keep');
      ctx.drawImage(b, e + 16, 2, W - e, H, e, 0, W - e, H);
      if (e > 0 && e < W) { rect(e - 3, 0, 2, H, '#ffffff'); rect(e - 1, 0, 1, H, '#2a2a2a'); for (let y = 0; y < H; y += 6) rect(e - 9 - (hash(y) * 6 | 0), y, 6, 1, '#d8d8dc'); }
    }
    if (bellIn) {
      const d = t - BELL, ix = 95 + 8 + 5 * 36, iy = H - 38;
      if (d >= 0 && d < .6) for (let j = 0; j < 3; j++) { const dd = d - j * .08; if (dd > 0) ring(ix + 16, iy + 12, 14 + R(Math.floor(dd * FPS) * 3.7), j ? P.text : C.white, 2); }
      if (d >= 0 && d < 1.6) bellRing(ix, iy - R(Math.abs(Math.sin(d * Math.PI * 2.5)) * 14 * (1 - d / 1.6)), BELL, 74, { t });
    }
    if (hf >= 0 && hf < 6) { const tx = 95 + 8 + 10 * 36 + 10, b2 = hf < 5 ? 2 : 0; icon('trash', tx - b2, H - 38 - b2, { size: 32, scale: 1 }); if (b2) frame(tx - 2, H - 40, 36, 36, P.text); }
    if (!c07_noPen) c07_plate(t, key);   // the flood draws its own
  });
}
scene('ch07 check', T0, BUT, c07_desk, { era: 'tiger', screen: true });
scene('ch07 pen', BUT, FL0, c07_desk, { era: 'tiger', screen: true });
// the release: 1x, the stamped page, and LIME floods out of the postmark in 10 hard frames while the pen lifts off it
// and flies up to the writer's chorus rig (ch08: pointer (W-56, 6), the nib at (W-51 + swing, 181), scale 4)
scene('ch07 flood', FL0, DOWN, t => {
  ctx.drawImage(memo('c07-floodA', FW, FH, () => { c07_noPen = true; try { ctx.drawImage(frameInto(styleBuf('c07A'), FL0, 'ch07 pen'), 0, 0); } finally { c07_noPen = false; } }), 0, 0);
  inkFlood(FL0, DOWN, TIPF[0], TIPF[1], tt => { if (hasScene('ch08 pen pal')) ctx.drawImage(frameInto(styleBuf('c07B'), tt, 'ch08 pen pal'), 0, 0); else rect(0, 0, W, H, FIELDS.lime); }, { steps: 10, seed: 2 });
  // the pen lifts off the stamp, turns to hang nib-down and flies to the chorus rig, growing to scale 4 on the way
  const f = clamp(Math.round((t - FL0) * FPS), 0, 9);
  // the postmark stays on the paper as the ink wells out from under it; it breaks up in the last two frames
  ctx.save(); ctx.translate(16, 2); if (f < 8) c07_postmark(TIP[0], TIP[1]); c07_plate(t, [0, 0, 0, 1, 320, 40]); ctx.restore();   // "your" stays sung, in the clear lime
  const sc = screenSize(t), sw = R(10 * Math.sin(beatPhase(t, 2) * Math.PI * 2));
  const p0 = [LIFT[0] + 16, LIFT[1] + 2 - [0, 8][Math.min(f, 1)]], p1 = [sc.x + sc.w - 51 + sw, sc.y + 181], k = f < 2 ? 0 : easeOut((f - 1) / 8);
  const tip = [R(lerp(p0[0], p1[0], k)), R(lerp(p0[1], p1[1], k))], a = f < 2 ? Math.PI : Math.PI - HALF * clamp((f - 1) / 5);
  if (f >= 6) { penCord([[tip[0] - sw, tip[1] - 160], [tip[0], tip[1] - 148]], { sag: 22, swing: 4, t }); c07_pen(tip, HALF, 4); CUR = { x: tip[0] - sw - 5, y: tip[1] - 175, kind: 'arrow' }; }
  else c07_drawRig(t, { tip, a, s: 3, lvl: true }, HAND);
}, { era: 'tiger', raw: true });
warmUp(() => _floodMap(TIPF[0], TIPF[1], 4, 2));
}
