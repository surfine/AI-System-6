// ch12 · outro and tail (144-157): the pull-back ON THE VERBS (magenta → 2014 → 2009 → 2002 → 1988, one layer per chant
// verb, the four verbs a column of buttons the pointer presses, the la-la on a black band with the bouncing pen, the
// record with its eleventh track), "It was always your voice." on a still 1988 desk, Return, the Save dialog, the CRT
// collapse, the dot landing as the full stop of "You may now write." and the end card weighing the film's own source.
'use strict';
{
// ---- THE HOME DESK (STORYBOARD §4, verbatim, prefixed) ----
const c12_MS = ['# The Tide Comes In Twice', 'They never called it renewable energy. They called it the tide, and they billed it by the moon.', 'Twice a day the estuary fills'];
const c12_INV = c => { const [r, g, b] = rgb(c); return hex(255 - r, 255 - g, 255 - b); };   // pre-invert a colour for FX.invert frames
const c12_HINT = ['Sounds like you.', 'Sounds like a mouthpiece.'];   // Review Desk's lens hint, the product's words; never a number
const c12_youProp = s => (x, y, w, h) => { const f = 'menu'; text(s, x + w, y + R((h - capH(f)) / 2), { font: f, align: 'right', color: P.menuText }); };
let c12_PERIOD = [0, 0];   // the writer's full stop, screen coordinates, set by every homeDesk call
function c12_homeDesk(t, o = {}) {
  const neg = !!o.neg, verm = neg ? c12_INV(FIELDS.vermilion) : FIELDS.vermilion;
  UI.menu = { app: 'AI System 6', prop: c12_youProp(o.hint || c12_HINT[0]), propW: 128, ...(o.menu || {}) };
  const doc = o.doc === false ? null : APP.teachText(8, 30, 268, 164, { title: 'Manuscript', lines: o.lines || c12_MS, ...(o.doc || {}) });
  if (doc) { const r = doc.rows[doc.rows.length - 1]; c12_PERIOD = [r.x + r.w + 1, r.y + capH('doc') - 1]; rect(c12_PERIOD[0], c12_PERIOD[1], 2, 2, verm); }
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
  return { doc, chat, period: c12_PERIOD };
}
const c12_hasScene = n => SCENES.some(s => s.name === n);   // guard before frameInto(…, 'chNN name')
// lens(t, keys): keys = [[t, x, y, n], ...] in SCREEN coordinates; the last key at or before t wins (§2.1)
function c12_lens(t, keys) { let k = null; for (const q of keys) if (q[0] <= t) k = q; if (k && k[3] > 1) stepZoom(k[3], k[1], k[2]); return k; }

// ---- the song's clock (every time from data.js) ----
const OUT = section('outro'), T0 = OUT.start, END = DUR + 3.0;
const L1 = lyric('o1'), LA1 = lyric('o_la1'), LA2 = lyric('o_la2'), L2 = lyric('o2'), L3 = lyric('o3');
const V = L1.words;                                   // Save it. Clip it. Insert it. Export it.
const VOICE = L2.start, RET = hit('returnKey'), SAVE = hit('saveDialog'), CLICK = hit('saveClick'), EXPO = hit('exportCD');
const F1 = 1 / FPS, CRT0 = CLICK + 3 * F1, CRT1 = CRT0 + 9 * F1, DOT1 = CRT1 + 6 * F1, CARD = DOT1 + 8 * F1;
const MAG = FIELDS.magenta, VER = FIELDS.vermilion, BLK = C.black, WHT = C.white, PI = Math.PI;
const c12_fr = (t, at) => Math.floor((t - at) * FPS + 1e-6);
const c12_dif = fn => { ctx.save(); ctx.globalCompositeOperation = 'difference'; try { fn(); } finally { ctx.restore(); } };
const c12_num = v => (v + '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const c12_W = typeof WEIGHT !== 'undefined' && WEIGHT && WEIGHT.bytes ? WEIGHT : null;   // the film's own weight, or nothing
const POST_POSES = ['bounce', 'clap', 'robot', 'shimmy', 'disco', 'kick', 'vogue', 'jump'];

// ===================================================================================================
// THE PULL-BACK ON THE VERBS (144-148)
// ===================================================================================================
// the magenta world: the field and Clio alone on it, the AI's stage that shrinks into the writer's dot
function c12_mag(t) {
  rect(0, 0, W, H, MAG);
  const hot = evSince('crash', t) < SPB * .9, o = hot ? {} : { pose: POST_POSES[((Math.floor(beatAt(t)) % 8) + 8) % 8] };
  clioDance(W / 2, H - 8, 7, t, { field: MAG, voice: 'choir', lyric: false, ...o });
}
const c12_desk = t => c12_homeDesk(t, { doc: { status: 'Final' } });   // the desk layers: no pointer (the overlay's pointer is the writer's hand)
// NESTED DESKS (three.js, stage3d.js): each desk holds the world before it on a MONITOR, a window whose screen stands out
// of the desk as a box. Every verb press kicks the camera back one desk: a flight out through the monitor, swinging round
// its box, onto the next desk at 1:1 on a la; it holds there, lit and live (the drives play), until the next press. 1988
// holds with 2002 still on its monitor, then the monitor zoom-closes into the writer's full stop on the beep. The shrinking
// desks are frozen at the press that left them. FLASH-SAFE BY MATERIAL (WCAG 2.3.1, as ch09): a flight is NIGHT, a deep
// magenta duotone (no moving pixel can swing 0.1 in luminance); only the holds are lit: one flash a verb (off, then on).
const DN = 16, MON = { x: 286, y: 70, w: 112, h: 63 }, RHO = FW / MON.w, MZ = 30, MB = 4;   // the screen: the same rect on every desk (the windows never move)
const MCX = MON.x + MON.w / 2 - FW / 2, MCY = FH / 2 - MON.y - MON.h / 2;
const LAYS = [['liquidglass', 2026], ['yosemite', 2014], ['snowleopard', 2009], ['aqua', 2002], ['system6', 1988]];
const STEP = [V[1].start, V[2].start + 2 * F1, V[4].start + 2 * F1, V[6].start + 2 * F1];   // the kicks: Save "it.", Clip, Insert, Export
const LAND = [LA1.words[3].start + 3 * F1, LA1.words[5].start, LA2.words[1].start, LA2.words[5].start];   // lights on, on a la (the first a second after ch11's dive flashes)
const SHUT0 = V[7].start + 3 * F1, SHUT1 = evTimes('cowbell').find(c => c > SHUT0) ?? SHUT0 + .25, NITE = rgb('#a0006a');   // the flight's ink: 0.085 linear at most   // the monitor closes into the full stop by the beep
let c12_PF = null;   // the 1988 full stop, read back from a dry render
const c12_period = () => c12_PF || (frameInto(styleBuf('c12m'), T0, c12_desk, { era: 'system6' }), c12_PF = c12_PERIOD.slice());
const c12_CH = {}, c12_chrome = () => c12_CH[E.id] || offscreen(400, 300, () => { const r = win(0, 0, 300, 200, 'x'); c12_CH[E.id] = [r.x, r.y, 300 - r.w, 200 - r.h]; }) && c12_CH[E.id];   // the window chrome round a client rect
const c12_mdesk = yr => t => c12_homeDesk(t, { doc: { status: 'Final' }, after: () => {   // the desk with its monitor: the year it holds in the title
  const [l, tp, dw, dh] = c12_chrome(); win(MON.x - l, MON.y - tp, MON.w + dw, MON.h + dh, String(yr), { active: true }); rect(MON.x, MON.y, MON.w, MON.h, BLK);
} });
const c12_draw = i => i ? c12_mdesk(LAYS[i - 1][1]) : c12_mag, c12_o = i => ({ era: LAYS[i][0], raw: !i });
const c12_static = i => deskTex('c12s' + i, STEP[i], c12_draw(i), c12_o(i));   // frozen at the press that leaves it (mip: it shrinks)
const c12_live = (i, t, plain) => tex3d('c12live', FW, FH, c => frameInto(c, t, plain ? c12_desk : c12_draw(i), c12_o(i)), { live: t + '|' + i + plain });
const MCOL = { yosemite: ['#d4d4d8', '#9c9ca2', '#6a6a70'], snowleopard: ['#3a3a3e', '#202024', '#9a9aa0'], aqua: ['#e8e8ec', '#b0b0b8', '#7c7c86'], system6: [WHT, WHT, BLK] };   // front, top, sides
function c12_stage() {
  return stage3d('c12 nest', st => {
    st.o.P = LAYS.map((_, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), mat3d({ map: c12_static(Math.min(i, 3)), solid: true })); st.scene.add(m); return m; });
    st.o.B = LAYS.map(([era], i) => {   // the monitor box round layer i's screen: 4 bars, MZ deep, in hard bands
      if (!i) return null;
      const [f, tp, sd] = MCOL[era], w = MON.w, h = MON.h, b = MB, c = [sd, sd, tp, sd, f, null];
      const m = new THREE.Mesh(bandGeo([[0, (h + b) / 2, w + 2 * b, b], [0, -(h + b) / 2, w + 2 * b, b], [-(w + b) / 2, 0, b, h], [(w + b) / 2, 0, b, h]].map(([x, y, bw, bh]) => ({ w: bw, h: bh, d: MZ, pos: [x, y, MZ / 2], cols: c }))), mat3d({ vc: true, solid: true }));
      st.scene.add(m); return m;
    });
    st.extra = [VER, BLK, WHT];
    offscreen(FW, FH, () => render3d(st));   // harvest the palette now, from the build state: the same whichever frame comes first
  });
}
// u: 0 = the magenta world at 1:1 .. 4 = 1988 at 1:1; a flight eases out (fast on the press, settling as it lands)
const c12_k = t => { let k = -1; while (k < 3 && t >= STEP[k + 1]) k++; return k; }, c12_fly = t => { const k = c12_k(t); return k >= 0 && t < LAND[k]; };
const c12_u = t => { const k = c12_k(t); return k < 0 ? 0 : t >= LAND[k] ? k + 1 : k + 1 - (1 - prog(t, STEP[k], LAND[k])) ** 3; };
function c12_pull(t) {
  const u = c12_u(t), shut = t >= SHUT0 ? prog(t, SHUT0, SHUT1) : 0, [px, py] = c12_period();
  const zf = e => (2 / MON.w) ** e, zw = e => (1 - zf(e)) / (1 - 2 / MON.w);   // the close: the screen shrinks at a constant rate, its rect sliding in step
  if (u <= 0 || shut >= 1) {   // 1:1: the 2D frame (and the full stop taking the closed monitor: a ring for 4 frames)
    ctx.drawImage(frameInto(styleBuf('c12A'), t, u ? c12_desk : c12_mag, c12_o(u ? 4 : 0)), 0, 0);
    const f = c12_fr(t, SHUT1); if (u && f < 4) ring(px + 1, py + 1, 5 + 3 * f, VER, 1);
    return;
  }
  const st = c12_stage(); if (!st) return;
  const j = Math.min(3, Math.ceil(u) - 1), ph = u - j, O = j + 1;   // a hold is the end of its flight: the desk held is live
  st.o.P.forEach((m, i) => { m.visible = false; if (i < O) matOf(m).map = c12_static(i); if (st.o.B[i]) st.o.B[i].visible = false; });
  matOf(st.o.P[O]).map = c12_live(O, t, shut > 0);
  let s = RHO ** (1 - ph), p = [MCX, MCY, MZ].map(v => -(1 - ph ** 1.6) * s * v);   // the pan lags the pull: the world just left stays nearer the middle
  for (let i = O; i >= 0 && s * FW >= 2; i--) {   // each desk, then its monitor's box and the world inside it, smaller
    const P_ = st.o.P[i]; P_.visible = true; P_.scale.setScalar(s); P_.position.set(...p);
    if (!i) break;
    const sh = i === 4 ? shut : 0, f = zf(sh), ax = lerp(MCX, px + 1 - FW / 2, zw(sh)), ay = lerp(MCY, FH / 2 - py - 1, zw(sh)), B = st.o.B[i];
    B.visible = true; B.scale.setScalar(s * f); B.position.set(p[0] + s * ax, p[1] + s * ay, p[2]);
    p = [p[0] + s * ax, p[1] + s * ay, p[2] + s * MZ * f]; s *= f / RHO;
  }
  const sw = .2 * Math.sin(PI * ph) * (j % 2 ? 1 : -1), el = sw * .5;   // the swing round the box, alternating per kick
  aim3d(st.cam, { pos: [D3 * Math.sin(sw) * Math.cos(el), D3 * Math.sin(el), D3 * Math.cos(sw) * Math.cos(el)], look: [0, 0, 0], fov: 30, roll: sw * .25 });
  render3d(st, { bg: BLK });
  if (c12_fly(t)) {   // the flight: the night duotone (luma in 4 Bayer-dithered steps of a deep magenta), smeared on the kick's first 2 frames
    const y0 = SLAB.band, h = BAND.y - y0, im = ctx.getImageData(0, y0, FW, h), d = im.data;
    for (let i = 0, n = 0; i < d.length; i += 4, n++) {
      const v = Math.min(3, Math.floor((d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 85 + (BAYER4[((y0 + (n / FW | 0)) & 3) * 4 + (n % FW & 3)] + .5) / 16)) / 3;
      d[i] = R(NITE[0] * v); d[i + 1] = R(NITE[1] * v); d[i + 2] = R(NITE[2] * v);
    }
    ctx.putImageData(im, 0, y0);
    const k = c12_k(t), f = c12_fr(t, STEP[k]); if (k && f < 2) FX.pixelSort = { rows: 16, len: 220, seed: k * 7 + f, dir: k % 2 ? 1 : -1, keep: [[0, y0], [BAND.y, FH]] };
  }
  for (const k of LAND) splitPal(2, k, 2, [WHT, BLK], t);   // lights on, with the 2-frame split
  if (shut) for (let k = 0; k < 4; k++) {   // the Finder's zoom rects, inverted, trailing the screen into the full stop
    const e = shut - k * .15; if (e <= 0) continue;
    const w_ = zw(e), x = lerp(MON.x - 1, px, w_), y = lerp(MON.y - 19, py, w_), w = lerp(MON.w + 2, 2, w_), h = lerp(MON.h + 20, 2, w_);
    if (w > 4) c12_dif(() => frame(R(x), R(y), R(w), R(h), WHT));
  }
}

// ---- the overlay: the verb column, the la-la band with the bouncing pen, the record ----
const SLAB = { band: 32, y: 3, h: 26, pad: 8, gap: 10, s: 2 };   // the verbs in a row on a black band along the top: the desk keeps the middle
let c12_SL = null;
function c12_slabs() {   // one button per verb: [verb, 'IT.'] in Chicago 2x on a black slab (each under 25% of any 213x120 window)
  if (c12_SL) return c12_SL;
  const S = [0, 2, 4, 6].map(i => { const verb = V[i].w.toUpperCase(), it = V[i + 1].w.toUpperCase(); return { verb, it, tv: V[i].start, ti: V[i + 1].start, w: tw(verb + ' ' + it, 'chicago', SLAB.s) + 2 * SLAB.pad, h: SLAB.h, y: SLAB.y, vw: tw(verb + ' ', 'chicago', SLAB.s) }; });
  let x = R((FW - S.reduce((a, s) => a + s.w, 0) - 3 * SLAB.gap) / 2);
  for (const s of S) { s.x = x; x += s.w + SLAB.gap; }
  return (c12_SL = S);
}
const c12_press = s => [s.x + s.w - 10, s.y + 12];   // where the pointer sits to press a slab
function c12_column(t) {
  rect(0, 0, FW, SLAB.band, BLK);
  for (const s of c12_slabs()) {
    const f = c12_fr(t, s.tv); if (f < 0) continue;
    const g = f < 3 ? [4, 2, 1][f] : 0, ins = f >= 3 && f < 7 ? 1 : 0;   // the slam's overshoot, then the press (a 1 px inset)
    const bx = s.x - g + ins, by = s.y - g + ins, bw = s.w + 2 * g - 2 * ins, bh = s.h + 2 * g - 2 * ins;
    rect(bx - 1, by - 1, bw + 2, bh + 2, MAG); rect(bx, by, bw, bh, BLK);   // a magenta keyline: the button on the black band
    const ty = s.y + R((s.h - capH('chicago', SLAB.s)) / 2) + ins, tx = s.x + SLAB.pad + ins;
    text(s.verb, tx, ty, { font: 'chicago', scale: SLAB.s, color: f === 0 ? WHT : MAG });
    const fi = c12_fr(t, s.ti); if (fi >= 0) text(s.it, tx + s.vw, ty, { font: 'chicago', scale: SLAB.s, color: fi === 0 ? WHT : MAG });
  }
}
// the la-la: magenta condensed Chicago on a full-width black band along the bottom; each LA lights on its note
const BAND = { y: FH - 96, h: 96 }, ROWX = 200, ROWY = FH - 80;
const TXT = LA1.text.toUpperCase(), TXTS = TXT.replace(',', ' ');   // the row is drawn without its comma: the comma is its own glyph (below)
const c12_rowO = (q, t) => ({ t, words: q, ghost: true, scale: 3, min: 3, max: 3, stretch: [1, 2], color: MAG, x: ROWX, y: ROWY, valign: 'top', align: 'left' });
let c12_sc = null;
function c12_meas(str, o) { let r; c12_sc = c12_sc || Object.assign(document.createElement('canvas'), { width: 8, height: 8 }); const sw = W, sh = H; offscreen(8, 8, () => { W = sw; H = sh; r = bigType(str, o); }, c12_sc); W = sw; H = sh; return r; }
const c12_box = ls => { const x0 = Math.min(...ls.map(l => l.x)), y0 = Math.min(...ls.map(l => l.y)); return { x: x0, y: y0, w: Math.max(...ls.map(l => l.x + l.w)) - x0, h: Math.max(...ls.map(l => l.y + l.h)) - y0 }; };
let c12_tg = null;
function c12_targets() {   // the top-centre of each LA: where the nib taps
  if (c12_tg) return c12_tg;
  const m = c12_meas(TXTS, c12_rowO(LA1, 0)), out = []; let i = 0;
  TXTS.split(' ').forEach(w => { if (!w) return; const ls = m.letters.slice(i, i + w.length).filter(l => /[A-Z]/.test(l.ch)); i += w.length; const b = c12_box(ls); out.push([R(b.x + b.w / 2), b.y - 4]); });   // letters hold no spaces
  return (c12_tg = out);
}
let c12_cmm = null;
function c12_row(q, t) {   // the la-la row; the comma lit with "la," on its own, never slammed (its tail would leave the frame)
  bigType(TXTS, c12_rowO(q, t));
  c12_cmm = c12_cmm || c12_meas(TXT, c12_rowO(LA1, 0)).letters.find(l => l.ch === ',');
  const w = q.words[2], on = t >= w.start - 1e-6;
  bigType(',', { ...c12_rowO(q, on ? Math.max(t, w.start + 6 * F1) : t), words: { words: [w] }, x: c12_cmm.x });
}
const HOMEP = [300, 24], HOMENIB = [HOMEP[0] + 9, HOMEP[1] + 74];   // the desk's pointer home and the nib of the pen hanging from it
let c12_K = null;
function c12_keys() {   // [time, nib x, nib y]: LA to LA on every sung la, then the hop home (the pen shrinking to the desk's size)
  if (c12_K) return c12_K;
  const tg = c12_targets(), k = [];
  for (const q of [LA1, LA2]) q.words.forEach((w, i) => k.push([w.start, ...tg[i]]));
  k.push([LA2.words[6].start + 3 * SPB / 4, ...HOMENIB]);
  return (c12_K = k);
}
function c12_bounce(t) {   // -> [x, y, scale] or null (home): a whole-pixel parabola in 8 steps per hop, the nib landing on each note
  const K = c12_keys();
  if (t < K[0][0]) return [K[0][1], K[0][2], 4];
  for (let j = 0; j < K.length - 1; j++) if (t < K[j + 1][0]) {
    const [t0, x0, y0] = K[j], [t1, x1, y1] = K[j + 1], k = Math.floor(prog(t, t0, t1) * 8) / 8, last = j === K.length - 2;
    const hgt = last ? 110 : clamp(Math.abs(x1 - x0) / 3 + 18, 24, 80), s = last ? [4, 4, 3, 3, 2, 2, 1, 1][R(k * 8)] : 4;
    return [R(lerp(x0, x1, k)), R(lerp(y0, y1, k) - hgt * 4 * k * (1 - k)), s];
  }
  return null;
}
// the writer's hand: from slab to slab down the column on the verbs, then home to the desk's (300, 24) as the pen hops home
function c12_ptr(t) {
  const S = c12_slabs(), ks = S.map(s => [s.tv, ...c12_press(s)]), K = c12_keys(), th = K[K.length - 1][0];
  ks.push([LA2.words[6].start, ...c12_press(S[3])], [th, ...HOMEP]);
  const [x, y] = track(t, ks), e = S.find(s => c12_fr(t, s.tv) >= 0 && c12_fr(t, s.tv) < 5);
  return { x, y, down: !!e };
}
const c12_spr = (s, fl) => memo('c12pen' + s + fl, 320, 320, () => pen(160, 160, PI / 2, s, { t: fl ? T0 : T0 + .1, flash: fl }));
function c12_tap(t) {   // the bell on every la: a white ring from the nib (under the type, so no LA is covered)
  const b = c12_bounce(t), q = t < LA2.start ? LA1 : LA2, w = q.words.find(w => c12_fr(t, w.start) >= 0 && c12_fr(t, w.start) < 3);
  if (b && w && b[2] === 4) ring(b[0], b[1], 6 + 4 * c12_fr(t, w.start), WHT, 2);
}
function c12_pen(t) {
  const p = c12_ptr(t), b = c12_bounce(t);
  CUR = { x: p.x, y: p.y, kind: 'arrow', down: p.down };
  if (!b) {   // home: the desk's own rig (identical to homeDesk's: the seam at 148.0)
    penCord([[p.x + 5, p.y + 15], [p.x + 9, p.y + 37]], { sag: 6, swing: 3, t });
    pen(p.x + 9, p.y + 74, PI / 2, 1, { t });
    return;
  }
  const [x, y, s] = b;
  penCord([[p.x + 5, p.y + 15], [x, y - R(36.5 * s)]], { sag: 2, swing: 0, w: 2, t });
  ctx.drawImage(c12_spr(s, evFrames('kick', t) === 0), x - 160, y - 160);
}
// One More Tune's white label, black, half sunk in the band: only its eleventh groove is lit, pulsing on the riff's bells;
// the label spins; on "Export it." the answer to "Name the ad." stamps across it: "This one."
const REC = [76, 318, 66];
function c12_record(t) {
  const [cx, cy, r] = REC, on = evFrames('bell', t) < 3;
  disc(cx, cy, r, BLK); ring(cx, cy, r - 2, MAG, 1);
  ring(cx, cy, r - 12, MAG, on ? 4 : 2);                           // the eleventh groove, outside the ten
  for (let i = 0; i < 2; i++) ring(cx, cy, r - 20 - i * 3, MAG, 1); // the ten, faint and close (the label covers the rest)
  disc(cx, cy, 42, MAG);
  text('11', cx, cy - 27, { font: 'chicago', scale: 2, color: BLK, align: 'center' });
  const f = c12_fr(t, EXPO);
  if (f < 0) { text('PEN PAL', cx, cy - 2, { font: 'chicago', color: BLK, align: 'center' }); text('AI SYSTEM 6', cx, cy + 13, { font: 'geneva', color: BLK, align: 'center' }); }
  const a = Math.floor(beatAt(t) * 4) * PI / 8; rect(R(cx + Math.cos(a) * 38) - 2, R(cy + Math.sin(a) * 38) - 2, 4, 4, BLK);
  if (f >= 0) {   // "This one.": the label's lines stamped over by the answer, a black pill on the label, condensed Chicago 1x2
    const g = f < 3 ? [3, 2, 1][f] : 0, w = 96, x = cx - w / 2, y = cy - 4, im = memo('c12this', 64, 12, () => text('THIS ONE.', 1, 1, { font: 'chicago', color: MAG }));
    rrect(x - g, y - g, w + 2 * g, 28 + 2 * g, 6, BLK); ctx.drawImage(im, cx - 32, y + 4, 64, 24);
  }
}
function c12_over(t) {
  rect(0, BAND.y, FW, BAND.h, BLK);
  const q = t < LA2.start ? LA1 : LA2;
  c12_tap(t);
  c12_row(q, t);
  c12_record(t);
  c12_column(t);
  c12_pen(t);
}
scene('ch12 lala', T0, VOICE, t => {
  if (t < T0) c12_mag(t);   // under ch11's dive: the magenta world whole
  else c12_pull(t);
  c12_over(t);
  if (t >= T0) {
    splitPal(2, T0, 3, [WHT, BLK], t);   // owed: the landing of dive 3 (the split only: no full-frame invert, the flash budget)
    beatFX(t, { kick: false, snare: false });   // the drop's sort on the crash
    const cb = evLast('cowbell', t), S = c12_slabs()[3];   // the cowbell: the system beep flashes the button just pressed
    if (cb && cb[0] >= T0 && c12_fr(t, cb[0]) === 0) c12_dif(() => rect(S.x - 1, S.y - 1, S.w + 2, S.h + 2, WHT));
  }
}, { era: 'liquidglass', raw: true, screen: true });

// ===================================================================================================
// 148-151: "It was always your voice." on a still, quiet 1988 desk; the writer's I-beam; Return
// ===================================================================================================
// Clio's TEMPORARY plate: a 50% paper dither, marching ants (phase on 8ths), the tag; kept = solid white, ants stopped
function c12_ghost(x, y, w, h, t, kept, tag = true, rim = 0, opaque = false) {
  x = R(x); y = R(y);
  if (kept) { rect(x, y, w, h, BLK); rect(x + 1, y + 1, w - 2, h - 2, WHT); return; }
  if (opaque) { rect(x, y, w, h, WHT); bayer(x, y, w, h, .125, BLK); } else bayer(x, y, w, h, .5, WHT);   // opaque: paper with a light screen, nothing shows through frame(x, y, w, h, WHT); if (rim) rect(x + rim, y + rim, w - 2 * rim, h - 2 * rim, WHT);   // rim: a dithered edge round a white field
  const ph = Math.floor(beatAt(t) * 2) & 3, seg = (x0, y0, len, hz) => { for (let i = -ph; i < len; i += 4) { const a = Math.max(0, i), b = Math.min(len, i + 2); if (b > a) hz ? rect(x0 + a, y0, b - a, 1, BLK) : rect(x0, y0 + a, 1, b - a, BLK); } };
  seg(x, y, w, 1); seg(x, y + h - 1, w, 1); seg(x, y, h, 0); seg(x + w - 1, y, h, 0);
  if (tag) { const tg = tw('TEMPORARY', 'small') + 6; rect(x + w - tg - 2, y - 11, tg, 11, BLK); text('TEMPORARY', x + w - tg + 1, y - 9, { font: 'small', color: WHT }); }
}
// a lyric's sung words in Chicago, each popping inverted for 2 frames on its note; a held note's last word pulses with the vibrato
function c12_words(ws, x, y, s, t, o = {}) {
  ws.forEach((w, i) => {
    if (t < w.start - 1e-6) return;
    const px = x + tw(ws.slice(0, i).map(v => v.w).join(' ') + (i ? ' ' : ''), 'chicago', s), ww = tw(w.w, 'chicago', s), f = c12_fr(t, w.start);
    const vib = o.vib && i === ws.length - 1 && t < w.end && w.end - w.start > .4 && Math.sin((t - w.start) * 34) > 0 ? -1 : 0;
    if (f < 2) { rect(px - s, y - 2 * s + vib, ww + 2 * s, capH('chicago', s) + 4 * s, BLK); text(w.w, px, y + vib, { font: 'chicago', scale: s, color: WHT }); }
    else text(w.w, px, y + vib, { font: 'chicago', scale: s, color: BLK });
  });
}
function c12_plate(L, cx, y, s, t, kept, o = {}) {   // the line centred at cx on its ghost plate (s = Chicago scale; o: rim, w, h)
  const tw_ = tw(L.text, 'chicago', s), w = o.w || tw_ + 8 * s, h = o.h || capH('chicago', s) + 6 * s, x = R(cx - w / 2);
  c12_ghost(x, y, w, h, t, kept, true, o.rim, o.opaque);
  c12_words(L.words, R(cx - tw_ / 2), y + R((h - capH('chicago', s)) / 2), s, t, { vib: true });
}
// the writer's vermilion caret (an I-beam, 2 px) after the full stop, then at the start of the new line after Return
function c12_caret(t, doc) {
  const ch = capH('doc'), [px, py] = c12_PERIOD;
  let x = px + 4, y = py - ch + 1;
  const f = c12_fr(t, RET); let col = VER;
  if (f >= 0) {
    const r = doc.rows[doc.rows.length - 1]; x = r.x; y = r.y + doc.lh;
    if (f < 2) { rect(x - 5, y - 4, 12, ch + 10, VER); col = WHT; }   // the keystroke: a 2-frame vermilion slab round the caret
    if (f < 30) c12_retKey(x + 12, y - 3, f);
    if (f >= 30 && (t - RET) % .5 >= .3) return;                       // then a slow blink: 18 frames on, 12 off
  }
  rect(x, y, 2, ch + 2, col); rect(x - 2, y - 1, 6, 1, col); rect(x - 2, y + ch + 2, 6, 1, col);
}
function c12_retKey(x, y, f) {   // the Return key beside the caret: pops (+2), pressed (a 1 px inset) for 6 frames, gone at 30
  const g = f < 2 ? 2 - f : 0, d = f >= 2 && f < 6 ? 1 : 0;
  rect(x - g, y - g + d, 22 + 2 * g, 15 + 2 * g - d, BLK); rect(x + 1, y + 1 + d, 20, 11 - d, WHT);
  const ax = x + 5, ay = y + 7 + d;   // the return arrow: down from the top right, left along the bottom, the head
  rect(ax + 10, ay - 4, 2, 6, BLK); rect(ax + 2, ay, 10, 2, BLK); rect(ax + 1, ay - 2, 1, 6, BLK); rect(ax, ay - 1, 1, 4, BLK);
}
const PARK = [520, 100];   // after Return the hand leaves the page: right, off the 3x crop and off the Save dialog's crop
function c12_pointer(t) {   // the writer's hand: home, a click in the manuscript, a click after the full stop (the I-beam appears)
  const [px, py] = c12_PERIOD.length ? c12_PERIOD : [159, 137];
  const p = mousePath(t, [[VOICE, HOMEP[0], HOMEP[1]], [L2.words[2].start, 150, 100, 'click'], [L2.words[4].start, px + 16, py - 3, 'click'], [RET, px + 16, py - 3], [RET + .2, ...PARK]]);
  return { ...p, kind: t >= L2.words[2].start - .15 && t < SAVE ? 'ibeam' : 'arrow' };
}
function c12_claps(t) { const e = evLast('clap', t); if (e && e[0] >= VOICE && c12_fr(t, e[0]) < 14) { const p = c12_pointer(t); clickBurst(p.x, p.y, e[0], { pointer: false, color: VER, t }); } }
const c12_clioO = t => t >= RET + SPB ? { mouth: { open: .6, shape: 'O' }, blink: false, bob: 0, t: RET + SPB } : {};   // frozen on the held "voice" (the grain loop)
function c12_voice(t, o = {}) {
  const p = c12_pointer(t);
  const d = c12_homeDesk(t, {
    cur: [p.x, p.y, p.kind], doc: { status: 'Final' }, clio: c12_clioO(t),
    after: ({ doc }) => {
      if (t >= L2.words[4].start) c12_caret(t, doc);
      const f = c12_fr(t, VOICE); if (f >= 1 && f < 3) c12_dif(() => rect(8, 30, 268, 19, WHT));   // the Manuscript opens: its title bar flickers on the stab
      if (o.after) o.after(doc);
    },
  });
  if (p.down) CUR.down = true;
  c12_claps(t);
  return d;
}
scene('ch12 voice', VOICE, RET, t => {
  c12_voice(t);
  c12_plate(L2, 456, 271, 2, t, false, { h: 26, opaque: true });   // in the clear strip between Clio and the icon row
  const f = c12_fr(t, VOICE);   // the stab: the overlay's bands drop in a 16-frame Bayer dissolve (no frame-wide invert)
  if (f < DN) { const k = (DN - 1 - f) / DN; bayer(0, BAND.y, FW, BAND.h, k, BLK); UI.overlays.push(() => bayer(0, 0, FW, SLAB.band, k, BLK)); }   // the top band over the menu bar
}, { era: 'system6', screen: true });
const RLENS = [12, 163];   // 3x crop x 8-222, y 109-229: the new line's caret, the Final strip and the plate below it
scene('ch12 return', RET, SAVE, t => {
  c12_voice(t);
  c12_plate(L2, 115, 206, 1, t, false, { rim: 3, w: 210, h: 23 });   // a caption band under the Final strip, filling the crop's foot
  c12_lens(t, [[RET, ...RLENS, 4], [RET + 2 * F1, ...RLENS, 3]]);   // Return punches 4x for 2 frames, then holds 3x
}, { era: 'system6', screen: true });

// ===================================================================================================
// 151-153.3: the Save dialog: "This song is temporary." typed as spoken on a temporary plate; the URL; the film's weight;
// the pointer travels to [Save] and clicks it at 153.25: the plate turns solid white (kept)
// ===================================================================================================
const DLG = { cx: 320, cy: 170, w: 300, h: 188 };   // 2x on it: the dialog's client is the frame, its thick border just outside
function c12_dialog(t) {
  const kept = t >= CLICK, k = prog(t, SAVE, SAVE + .2), dn = kept && c12_fr(t, CLICK) < 5;
  const a = alert(DLG.cx, DLG.cy, { icon: 'note', w: DLG.w, h: DLG.h, font: 'small', text: 'Save changes to the song "Pen Pal" before quitting?', buttons: ["Don't Save", 'Cancel', 'Save'], def: 2, k, pressed: dn ? 2 : undefined });
  if (!a.client) return null;
  const c = a.client, x = c.x + 12, y = a.text.y + 2 * lineH('small') + 3, pw = c.w - 24, ph = 58;
  c12_ghost(x, y, pw, ph, t, kept);   // line 2: her spoken line, solid Chicago 2x on ants, typed as spoken, two rows
  kara(L3, x + 8, y + 6, { mode: 'type', font: 'chicago', scale: 2, lh: 28, maxW: pw - 16, color: BLK, t });
  text('system6.aaronlau.me', x, y + ph + 8, { font: 'small', color: BLK });   // line 3: the one call to action
  if (c12_W) {   // line 4: the film weighing its own source (the number is real or it is not shown)
    const k2 = c12_W.bytes / c12_W.floppy;
    text('Source: ' + c12_num(c12_W.bytes) + ' of ' + c12_num(c12_W.floppy) + ' bytes (' + R(k2 * 100) + '%)', x, y + ph + 22, { font: 'small', color: BLK });
    const bx = x, by = y + ph + 36; frame(bx, by, 160, 8, BLK); rect(bx + 2, by + 2, R(156 * k2), 4, BLK);
  }
  const b = a.btn[2]; rframe(b.x - 4, b.y - 4, b.w + 8, b.h + 8, 11, VER, 3);   // the Save button under the pointer: the writer's ring
  return b;
}
scene('ch12 save', SAVE, CRT0, t => {
  let btn = null;
  const d = c12_homeDesk(t, { doc: { status: 'Final' }, clio: c12_clioO(t), after: ({ doc }) => { c12_caret(t, doc); btn = c12_dialog(t); } });
  const to = btn ? [btn.x + btn.w - 7, btn.y + btn.h - 4] : [DLG.cx + 124, DLG.cy + 72];   // the tip on the button's edge, off the word
  const [x, y] = track(t, [[SAVE, ...PARK], [SAVE + 1, to[0], to[1]]]), dn = t >= CLICK && c12_fr(t, CLICK) < 5;
  CUR = { x, y, kind: 'arrow', down: dn };
  penCord([[x + 5, y + 15], [x + 9, y + 37]], { sag: 6, swing: 3, t }); pen(x + 9, y + 74, PI / 2, 1, { t });
  if (t >= CLICK) clickBurst(x, y, CLICK, { pointer: false, color: VER, t });
  c12_lens(t, [[SAVE, DLG.cx, DLG.cy, 2]]);
}, { era: 'system6', screen: true });

// ===================================================================================================
// 153.3-157: the CRT collapses to a line, a dot, black; a vermilion dot flies and lands as the full stop of
// "You may now write."; the end card weighs the film and holds to END
// ===================================================================================================
const CARDT = 'You may now write', CARDY = 140;
let c12_cm = null;
function c12_cardLine() { return c12_cm || (c12_cm = c12_meas(CARDT, { scale: 3, min: 3, max: 3, x: FW / 2, y: CARDY, valign: 'top' })); }
function c12_floppy(x, y, c) {   // a 3.5" floppy, 24 x 24, white on black
  rect(x, y, 24, 24, c); rect(x + 2, y + 2, 20, 20, BLK); rect(x + 6, y + 2, 12, 9, c); rect(x + 12, y + 4, 3, 5, BLK); rect(x + 4, y + 15, 16, 7, c);
}
scene('ch12 end card', CRT0, END, t => {
  rect(0, 0, W, H, BLK);
  if (t < CRT1) {   // the Save dialog, kept, under the power-off
    ctx.drawImage(frameInto(styleBuf('c12A'), t, 'ch12 save'), 0, 0);
    stepZoom(2, DLG.cx, DLG.cy); FX.crt = Math.min(.97, prog(t, CRT0, CRT1) * 1.09);
    return;
  }
  const m = c12_cardLine(), last = m.letters[m.letters.length - 1], dx = last.x + last.w + 3, dy = last.y + last.h - 6;
  if (t < DOT1) { const [x, y] = track(t, [[CRT1, FW / 2, FH / 2], [DOT1, dx + 3, dy + 3]]), s = [2, 2, 4, 4, 6, 6][Math.min(5, c12_fr(t, CRT1))]; rect(x - R(s / 2), y - R(s / 2), s, s, VER); return; }
  bigType(CARDT, { scale: 3, min: 3, max: 3, color: WHT, x: FW / 2, y: CARDY, valign: 'top' });
  rect(dx, dy, 6, 6, VER);   // the dot, landed: the full stop
  if (t < CARD) return;
  if ((t - CARD) % 1 < .5) rect(dx + 14, last.y - 3, 3, last.h + 6, VER);   // the writer's caret after it, waiting: on half a second, off half
  text('AI SYSTEM 6 · 1988 OBJECTS / 2026 INTELLIGENCE', FW / 2, 194, { font: 'geneva', scale: 2, color: WHT, align: 'center' });   // the tagline (BRIEF §2), phone-legible
  text('system6.aaronlau.me', FW / 2, 224, { font: 'chicago', scale: 2, color: WHT, align: 'center' });
  if (c12_W) {   // the Two Floppies meter, one floppy: the source of this whole film
    const k = c12_W.bytes / c12_W.floppy, n = Math.min(8, c12_fr(t, CARD) + 1), kk = Math.floor(k * 8 * n / 8 * 100) / 100, x = R((FW - 280) / 2), y = 284;
    c12_floppy(x, y - 8, WHT);
    frame(x + 40, y, 240, 10, WHT); rect(x + 42, y + 2, R(236 * Math.min(k, kk)), 6, WHT);
    text('The source of this whole film: ' + c12_num(c12_W.bytes) + ' of ' + c12_num(c12_W.floppy) + ' bytes · one floppy', FW / 2, y + 22, { font: 'chicago', color: WHT, align: 'center' });
  }
}, { era: 'system6', raw: true });
window.__c12 = { c12_pull, c12_draw, c12_o, c12_desk, c12_u, STEP, LAND };
warmUp(() => { if (c12_stage()) for (let i = 0; i < 4; i++) c12_static(i); c12_period(); c12_keys(); c12_slabs(); for (const s of [1, 2, 3, 4]) for (const f of [0, 1]) c12_spr(s, !!f); });
}
