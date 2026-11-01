'use strict';
// ch10 · the breakdown, in the negative (120-128): the bass drives spit their disks into the release gate, "It fits.",
// Connect AI…, the model walks off to fetch the pen and is refused, the gate spins up, the nib comes down a cappella
// and cyan floods out of it. Scenes: 'ch10 gate' · 'ch10 model' · 'ch10 pivot' · 'ch10 flood'.
{
// ---- STORYBOARD §4: the home desk, verbatim (c10_ prefix) ----
const MS = ['# The Tide Comes In Twice', 'They never called it renewable energy. They called it the tide, and they billed it by the moon.', 'Twice a day the estuary fills'];
const INV = c => { const [r, g, b] = rgb(c); return hex(255 - r, 255 - g, 255 - b); };   // pre-invert a colour for FX.invert frames
const HINT = ['Sounds like you.', 'Sounds like a mouthpiece.'];   // Review Desk's lens hint as the film captions it (not product UI: the product's hint is 'Sounds like a mouthpiece / missing personal detail. Not a score.'); never a number
const youProp = s => (x, y, w, h) => { const f = 'menu'; text(s, x + w, y + R((h - capH(f)) / 2), { font: f, align: 'right', color: P.menuText }); };
let PERIOD = [0, 0];   // the writer's full stop, screen coordinates, set by every homeDesk call
function c10_homeDesk(t, o = {}) {
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
// the lens (§2.1), centred on (x, y) in screen px and kept inside the screen (as ch06 reads its keys)
function c10_lens(t, keys) {
  let k = null; for (const q of keys) if (q[0] <= t + 1e-6) k = q;
  if (!k || k[3] <= 1) return k;
  const n = k[3], s = screenSize(t), cw = Math.ceil(FW / n), ch = Math.ceil(FH / n);
  const cx = clamp(R(k[1] + s.x - cw / 2), s.x, s.x + s.w - cw), cy = clamp(R(k[2] + s.y - ch / 2), s.y, s.y + s.h - ch);
  const fix = v => { let z = R(v * n / (n - 1)); while (z - Math.floor(z / n) > v) z--; while (z - Math.floor(z / n) < v) z++; return z; };
  stepZoom(n, fix(cx) - s.x, fix(cy) - s.y);
  return k;
}

// ---- the song's clock (data.js only; literals are offsets) ----
const SEC = section('breakdown'), T0 = SEC.start, T1 = SEC.end, FL0 = T1 - 10 / FPS, F = 1 / FPS;
const L1 = lyric('k1'), L2 = lyric('k2'), L3 = lyric('k3'), L4 = lyric('chorus3a');
const at = (L, i) => wordAt(L, i).start;
const TWO = at(L1, 0), FLOP = at(L1, 1), IT = at(L1, 2), FITS = at(L1, 3);
const BRING = at(L2, 0), YOUR = at(L2, 1), OWN = at(L2, 2), MODEL = at(L2, 3);
const IT3 = at(L3, 0), STILL = at(L3, 1), HOLD = at(L3, 3), THE = at(L3, 4), PEN = at(L3, 5);
const IM = at(L4, 0), PIV = hit('pivot'), S16 = SPB / 4;
const SNAP = evTimes('snap').filter(x => x >= T0 && x < T1);               // checkbox ticks
const RIS = evList('riser').filter(r => r[0] >= T0 && r[0] < T1).sort((a, b) => a[0] - b[0]);
const RIS1 = RIS[0] || [PIV, T1], RIS2 = RIS[1] || [T1 - 2 * SPB, T1];
const on = (t, a, b) => t >= a - 1e-6 && t < b - 1e-6;
const fr = (t, a) => Math.floor((t - a) * FPS + 1e-6);

// ---- the stage (screen px) ----
const M1 = { x: 8, y: 26, w: 268, h: 140 }, M2 = { x: 8, y: 204, w: 268, h: 140 };   // the gate; dragged off the page on the pivot
const DRV = [[404, 70, 'A:', 'floppyA'], [404, 150, 'B:', 'floppyB']];
const DLG = { x: 30, y: 34, w: 240, h: 132 };                // Control Panel, over the gate
const CH = { x: 9, y: 237, w: 266 };                         // ClioTalk's client (the home desk's)
const BTN = [142, 250], ROW = [226, 107], OK = [247, 261], HDR = [206, 223];
const HOME = [300, 24], REST = [300, 64], TIP = [240, 150];  // TIP: the nib on the Manuscript's blank paper, inside the 9:16 column
const TIPF = [TIP[0] + 16, TIP[1] + 2], SLOT_Y = [172, 250];   // the lyric slot: under the gate on the Manuscript's strip (2x lens), in ClioTalk's empty client (1x); clear of title bars
const DRAG = PIV + 4 * S16, GRAB = [140, 34], DROP = [140, 34 + M2.y - M1.y];
// the pivot's drag: the gate itself rides the pointer down in four hard 16th steps (126.125-126.5), no outline pop
const gateDY = t => R((M2.y - M1.y) * clamp(Math.floor((t - PIV) / S16 + 1e-6), 0, 4) / 4);
// the lens: the button click low, then the whole Control Panel as a window; the shut into the header and the walk;
// the notice row, its [OK] and the plate at 2x until the pivot; 4x on the nib's descent and the a cappella card
const OPEN = BRING + 4 * F;   // the panel zooms open once the button's press has been seen
const KEYS = [[-1e9, 0, 0, 1], [IT, 150, 120, 2], [BRING, 150, 172, 2], [OPEN, 150, 125, 2], [IT3, 190, 150, 2], [THE, 180, 215, 2], [PIV, 0, 0, 1], [IM, 236, 135, 4]];
const ROWS = ['LM Studio', 'Ollama', 'DeepSeek', 'No model (look around)'];
const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const VERM = INV(FIELDS.vermilion);

// ---- small helpers ----
const c10_dif = (x, y, w, h) => { ctx.save(); ctx.globalCompositeOperation = 'difference'; rect(x, y, w, h, C.white); ctx.restore(); };
// Clio's TEMPORARY plate: 50% paper dither (or, solid, plain paper: black with white letters in the negative),
// marching ants (phase on 8ths), the tag
function c10_ghost(x, y, w, h, t, tag = true, solid = false) {
  x = R(x); y = R(y);
  if (solid) rect(x, y, w, h, C.white); else bayer(x, y, w, h, .5, C.white);
  frame(x, y, w, h, C.white);
  const ph = Math.floor(t * 4) & 3; let i = 0; ctx.fillStyle = C.black;
  const d = (px, py) => { if (((i++ + ph) & 3) < 2) ctx.fillRect(px, py, 1, 1); };
  for (let k = 0; k < w; k++) d(x + k, y); for (let k = 1; k < h; k++) d(x + w - 1, y + k);
  for (let k = w - 2; k >= 0; k--) d(x + k, y + h - 1); for (let k = h - 2; k > 0; k--) d(x, y + k);
  if (tag) { const tg = tw('TEMPORARY', 'small'); rect(x + w - tg - 10, y - 5, tg + 6, 11, C.black); text('TEMPORARY', x + w - tg - 7, y - 3, { font: 'small', color: C.white }); }
}
// sung words in Chicago, each arriving on its note, the newest inverted for 3 frames
function c10_words(ws, x, y, s, t, ol) {
  let px = x;
  ws.forEach(w => {
    const ww = tw(w.w, 'chicago', s);
    if (t >= w.start - 1e-6) {
      if (fr(t, w.start) < 3) { rect(px - s, y - 2 * s, ww + 2 * s, 13 * s, C.black); text(w.w, px, y, { font: 'chicago', scale: s, color: C.white }); }
      else text(w.w, px, y, { font: 'chicago', scale: s, color: C.black, outline: ol ? C.white : undefined });
    }
    px += ww + tw(' ', 'chicago', s);
  });
}
const c10_lineW = (ws, s) => tw(ws.map(w => w.w).join(' '), 'chicago', s);
// a lyric line on its temporary plate, pre-inverted solid (reads black with white letters, as the a cappella card);
// s 2 at 1x (sized to the words sung so far: it stays inside ClioTalk), 1 under the lens
function c10_plate(L, x, y, s, t) { const w = c10_lineW(s > 1 ? L.words.filter(q => q.start <= t + 1e-6) : L.words, s) + 12 * s, h = 12 * s + 8; c10_ghost(x, y, w, h, t, true, true); c10_words(L.words, x + 6 * s, y + 4 + 2 * s, s, t); }
// a 3.5" disk, label side up (black shell, shutter, ruled label)
function c10_disk(x, y, w, h) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  rect(x, y, w, h, C.black); rect(x + w - 3, y, 3, 1, C.white); rect(x + w - 1, y + 1, 1, 2, C.white);
  const sx = x + R(w * .24), sw = R(w * .5), sh = R(h * .38);
  rect(sx, y, sw, sh, C.white); frame(sx, y, sw, sh, C.black); rect(sx + R(sw * .58), y + 2, R(sw * .24), sh - 4, C.black);
  const ly = y + R(h * .5), lh = y + h - 3 - ly; rect(x + 4, ly, w - 8, lh, C.white);
  for (let r = ly + 3; r < ly + lh - 1; r += 3) rect(x + 6, r, w - 12, 1, C.black);
  rect(x + 2, y + h - 6, 3, 3, C.white);
}
// 2x2-cell dither in white over a rect at level k (temporary things leave this way)
function c10_cells(x, y, w, h, k) {
  if (k <= 0) return; ctx.fillStyle = C.white;
  for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i += 2) if (BAYER4[((j >> 1) & 3) * 4 + ((i >> 1) & 3)] < k * 16) ctx.fillRect(x + i, y + j, 2, 2);
}

// ---- the release gate (hand-drawn: its two Disk bars become the pivot's risers) ----
const gateAt = t => t < PIV - 1e-6 ? M1 : { ...M1, y: M1.y + gateDY(t) };
const SLOT = (i, m = M1) => ({ x: m.x + 13 + i * 52, y: m.y + 40, w: 44, h: 44 });
function c10_gate(t) {
  const piv = t >= PIV - 1e-6, m = gateAt(t);
  const c = win(m.x, m.y, m.w, m.h, 'Two Floppies', { k: prog(t, T0, T0 + .2), from: { x: 412, y: 230, w: 76, h: 58 }, active: true, zoom: false, header: ['Release gate', '', 'boot payload'] });
  if (!c) return;
  rect(c.x, c.y, c.w, c.h, C.white);
  const cnt = t < IT ? 0 : t >= FITS - 1e-6 ? 1 : [.25, .5, .75, .995][Math.min(3, Math.floor((t - IT) / (S16 / 2) + 1e-6))];
  const bytes = R(2902645 * cnt), disk = 1474560;
  const sh = piv && t > T1 - SPB ? (fr(t, 0) & 1 ? 1 : -1) : 0;   // the riser's last beat shakes the bars
  for (let i = 0; i < 2; i++) {
    const s = SLOT(i, m), f = fr(t, (i ? FLOP : TWO) + 10 * F), o = f >= 0 && f < 3 ? 3 - f : 0;
    if (f < 0) { dline(s.x, s.y, s.x + s.w - 1, s.y, C.black); dline(s.x, s.y + s.h - 1, s.x + s.w - 1, s.y + s.h - 1, C.black); dline(s.x, s.y, s.x, s.y + s.h - 1, C.black); dline(s.x + s.w - 1, s.y, s.x + s.w - 1, s.y + s.h - 1, C.black); }
    else c10_disk(s.x + 2, s.y + 2 + o, 40, 40);
    const n = i ? 8 : 16, fill = piv ? Math.floor(prog(t, ...(i ? RIS2 : RIS1)) * n + 1e-6) / n : clamp((bytes - i * disk) / disk);
    const by = s.y + s.h + 6;
    frame(s.x + sh, by, s.w, 9, C.black); rect(s.x + 2 + sh, by + 2, R((s.w - 4) * fill), 5, C.black);
    text('Disk ' + (i + 1), s.x, by + 14, { font: 'small', color: C.black });
  }
  const tx = c.x + 124;
  text(fmt(bytes), tx, c.y + 9, { font: 'chicago', color: C.black });
  text('of ' + fmt(2949120) + ' bytes', tx, c.y + 26, { font: 'small', color: C.black });
  text((bytes / 2949120 * 100).toFixed(1) + '% used', tx, c.y + 38, { font: 'small', color: C.black });
  if (piv) {   // the gate becomes the boot loader
    text('Spinning up…', tx, c.y + 60, { font: 'chicago', color: C.black });
    glyph('spin', tx + 96, c.y + 59, C.black);
  } else if (t >= FITS - 1e-6) {   // PASS, stamped
    const f = fr(t, FITS), o = f < 3 ? 3 - f : 0, sw = tw('PASS', 'chicago', 2) + 14, sx = tx - 2 - o, sy = c.y + 54 - o;
    rect(sx, sy, sw + 2 * o, 28 + 2 * o, C.black); rect(sx + 2, sy + 2, sw + 2 * o - 4, 24 + 2 * o, C.white); frame(sx + 4, sy + 4, sw + 2 * o - 8, 20 + 2 * o, C.black);
    text('PASS', sx + 7 + o, sy + 7 + o, { font: 'chicago', scale: 2, color: C.black });
    text('Release gate', sx + sw + 2 * o + 8, sy + 10, { font: 'small', color: C.black });
  }
  text('Heavy tools load lazily, from a third disk.', c.x + 8, c.y + c.h - 12, { font: 'small', color: C.black });
}
// "Two" / "floppies.": a drive spits its disk (4 frames), the disk flies into its slot (6 frames) and slams
function c10_fly(t, i) {
  const f = fr(t, i ? FLOP : TWO), [dx, dy] = DRV[i];
  if (f < 0 || f >= 10) return;
  const s = SLOT(i);
  if (f < 4) { const y = dy + 15 + [6, 16, 28, 42][f]; c10_disk(dx + 25, y, 50, 46); for (let k = 1; k < 3; k++) rect(dx + 30 + k * 12, y - 6 * k, 2, 4, C.black); return; }
  const k = (f - 3) / 6, x0 = dx + 25, y0 = dy + 57, ww = lerp(50, 40, k), hh = lerp(46, 40, k);
  const pos = kk => [R(lerp(x0, s.x + 2, kk)), R(lerp(y0, s.y + 2, kk) - 70 * Math.sin(Math.PI * kk))];
  for (let j = 2; j >= 1; j--) { const q = pos(Math.max(0, k - j * .08)); frame(q[0], q[1], R(ww), R(hh), C.black); }
  const q = pos(k); c10_disk(q[0], q[1], ww, hh);
}
// a drive whose disk is gone: an empty, dotted bay (the head still plays its note)
function c10_bay(t, i) {
  const [x, y, lab, ch] = DRV[i], hx = floppyDrive(x, y, lab, ch, t, { compact: true }).headX;
  rect(x + 25, y + 25, 50, 36, C.white); rect(x + 25, y + 15, Math.max(0, hx - 4 - x - 25), 10, C.white); rect(hx + 5, y + 15, Math.max(0, x + 75 - hx - 5), 10, C.white);
  dline(x + 25, y + 60, x + 74, y + 60, C.black); dline(x + 25, y + 25, x + 25, y + 60, C.black); dline(x + 74, y + 25, x + 74, y + 60, C.black);
}

// ---- ClioTalk: the Connect button, then the read-only notice ----
function c10_well(t) {
  const x = CH.x + 4, y = CH.y + 4, w = CH.w - 8;
  if (t < FITS) return;
  if (t < BRING + .1) { const bw = tw('Connect AI…', 'chicago') + 24; button(BTN[0] - R(bw / 2), BTN[1] - 10, bw, 20, 'Connect AI…', { def: true, pressed: on(t, BRING, BRING + 4 * F) }); return; }
  if (!on(t, THE, PEN + .25)) return;
  const nh = R(40 * (1 - Math.floor(prog(t, PEN, PEN + .2) * 4 + 1e-6) / 4)), f = fr(t, THE), dy = f < 3 ? [6, 3, 1][f] : 0;
  if (nh <= 0) return;
  clipRect(x - 1, y - 6, w + 2, nh + 7, () => {
    c10_ghost(x, y + dy, w, 40, t);
    glyph('flag', x + 8, y + 8 + dy);
    wrap('The drafting manuscript is read-only; use the current Section Draft instead.', w - 70, 'small').forEach((r, i) => text(r, x + 24, y + 8 + dy + i * 12, { font: 'small', color: C.black, outline: C.white }));
    button(x + w - 40, y + 11 + dy, 32, 18, 'OK', { def: true, pressed: on(t, PEN, PEN + .12) });
  });
}

// ---- Control Panel: bring your own model ----
function c10_panel(t) {
  if (t >= IT3 + F) {   // "it": the panel holds one frame under the new crop, then zooms shut into the chat's header
    const k = Math.floor(prog(t, IT3, IT3 + 4 * F) * 4 + 1e-6) / 4;
    if (k < 1) zoomRects(DLG, { x: HDR[0], y: HDR[1] - 2, w: 70, h: 12 }, k);
    return;
  }
  const c = win(DLG.x, DLG.y, DLG.w, DLG.h, 'Control Panel', { k: prog(t, OPEN, OPEN + .15), from: { x: BTN[0] - 40, y: BTN[1] - 10, w: 80, h: 20 }, active: true, zoom: false });
  if (!c) return;
  rect(c.x, c.y, c.w, c.h, C.white);
  text('Connect AI', c.x + 12, c.y + 8, { font: 'chicago', color: C.black });
  text('Bring your own model', c.x + c.w - 10, c.y + 10, { font: 'small', color: C.black, align: 'right' });
  hline(c.x + 8, c.y + 22, c.w - 16, C.black);
  const rowT = [BRING, YOUR, OWN, MODEL];
  ROWS.forEach((r, i) => {
    if (t < rowT[i] - 1e-6) return;
    const ry = c.y + 30 + i * 18, ticked = (i === 0 && t >= SNAP[0]) || (i === 1 && t >= SNAP[1]);
    check(c.x + 14, ry, r, ticked);
    if (i === 1 && t >= MODEL) c10_dif(c.x + 8, ry - 3, c.w - 16, 17);
    else if (fr(t, rowT[i]) < 2) frame(c.x + 8, ry - 3, c.w - 16, 17, C.black);   // arrival: the row's border pulses (a partial-area cue)
  });
}

// ---- the model's name walks off to fetch the pen; it never reaches it ----
function c10_walker(t) {
  if (!on(t, STILL, PEN + .25)) return;
  const w = tw('Ollama', 'chicago') + 12, ex = REST[0] + 9 - w + 6, ey = REST[1] + 76;
  const n = Math.floor(prog(t, STILL, HOLD) * 22 + 1e-6), k = n / 22, step = n & 1;
  const x = R(lerp(HDR[0], ex, k)); let y = R(lerp(HDR[1] - 4, ey, Math.min(1, k * 1.7))) - (n < 22 ? step : 0);   // up behind the plate, then across
  const jf = fr(t, HOLD); if (jf >= 0) y -= jf < 8 ? [6, 9, 10, 9, 6, 3, 1, 0][jf] : 0;
  rect(x + 8 + step * 2, y + 17, 2, 5, C.black); rect(x + w - 10 - step * 2, y + 17, 2, 5, C.black);   // legs
  if (on(t, HOLD, PEN)) { for (let j = 0; j < 14; j += 2) rect(x + w - 4, y - 2 - j, 2, 1, C.black); rect(x + w - 6, y - 18, 6, 3, C.black); }   // the reach, short of the pen
  c10_ghost(x, y, w, 17, t, false);
  text('Ollama', x + 6, y + 5, { font: 'chicago', color: C.black });
  c10_cells(x - 1, y - 1, w + 2, 24, Math.floor(prog(t, PEN, PEN + .25) * 4) / 4);
}

// ---- the writer's hand ----
const PATH = [[-1e9, ...HOME], [FITS, ...HOME], [BRING, ...BTN, 'click'], [OWN, ...BTN], [MODEL, ...ROW], [SNAP[1], ...ROW, 'click'], [SNAP[1] + .25, ...ROW], [IT3 + .25, ...REST],
  [HOLD, ...REST], [HOLD + F, REST[0], REST[1] - 20], [THE, REST[0], REST[1] - 20], [PEN, ...OK, 'click'], [PEN + .2, ...OK], [PIV, ...GRAB, 'press'], [DRAG, ...DROP], [DRAG + .55, ...HOME]];
function c10_hand(t) {
  if (on(t, PIV, DRAG)) return { x: GRAB[0], y: GRAB[1] + gateDY(t), down: true };
  if (t < IM) return mousePath(t, PATH);
  // a cappella: the nib comes down onto the paper in hard 16th steps and touches on the flood's first frame
  const k = t >= FL0 - 1e-6 ? 1 : [0, .3, .55, .78, .93][Math.min(4, Math.floor((t - IM) / S16 + 1e-6))];
  return { x: R(lerp(HOME[0], TIP[0] - 9, k)), y: R(lerp(HOME[1], TIP[1] - 74, k)), down: false };
}
// the lens hint, hung down from the menu bar into the 2x crop (the bar itself is out of it): the flip reads up close
function c10_hintTag(t) {
  const flip = on(t, THE, PEN), str = HINT[flip ? 1 : 0], f = fr(t, flip ? THE : PEN), w = tw(HINT[1], 'small') + 8;
  const x = 337 - w + (f < 6 ? (f & 1 ? -1 : 1) : 0), y = 123;   // a tab hanging from the crop's top edge
  rect(x, y, w, 15, C.white); frame(x, y, w, 15, C.black); text(str, x + w - 4, y + 5, { font: 'small', color: C.black, align: 'right' });
}
// "I'm just your": Clio's a cappella card under the descending nib
function c10_card(t) {
  const ws = L4.words.slice(0, 3), x = 166, y = 156, bw = c10_lineW(ws, 1) + 14;
  c10_ghost(x, y, bw, 20, t);
  c10_words(ws, x + 7, y + 6, 1, t);
}

// ---- the frame ----
function c10_frame(t) {
  FX.invert = true;   // the negative (the bars turn white)
  const live = t >= T0 - 1e-6, b = Math.floor(beatAt(t) + 1e-6);
  // the riser shakes the desk's dot pattern a pixel on every beat
  if (on(t, PIV, T1) && fr(t, beatTime(b)) < 2) ctx.drawImage(deskCanvas(E.id), b & 1 ? -1 : 1, 0);
  const p = live ? c10_hand(t) : { x: HOME[0], y: HOME[1], down: false }, key = KEYS.filter(k => k[0] <= t + 1e-6).pop(), s = key[3] > 1 ? 1 : 2;
  const o = {
    neg: true, hint: HINT[on(t, THE, PEN) ? 1 : 0], cur: [p.x, p.y],
    chat: t >= FITS ? { header: ['Chat', '', t >= IT3 + 4 * F ? 'Ollama · ready' : 'No model'] } : {},
    clio: { voice: 'lead', look: !live ? undefined : t < BRING ? [-2, -1] : t < IT3 ? [-2, 0] : t < PIV ? [-1, -1] : [-1, -2] },
    after: () => {
      if (!live) return;
      if (t >= TWO) c10_bay(t, 0);
      if (t >= FLOP) c10_bay(t, 1);
      if (t >= SNAP[2]) glyph('ok', HDR[0] - 12, HDR[1] - 1, C.black);
      c10_well(t);
      c10_gate(t);
      c10_panel(t);
      // the lyric slot under the gate (Clio's lines; "Two floppies. It fits." is the machine's)
      c10_walker(t);   // under the lyric plate: it never covers a sung word
      const L = t < BRING ? L1 : t < IT3 ? L2 : L3;
      if (t >= TWO && t < L3.end && s < 2) rect(9, 178, 266, 15, C.white);   // the Manuscript's strip, under the lens plate
      if (t >= TWO && t < L3.end) c10_plate(L, (s < 2 ? 8 + clamp(R(key[1] - FW / 4), 0, W - FW / 2) : 16), SLOT_Y[s - 1], s, t);
      c10_fly(t, 0); c10_fly(t, 1);
      // the third disk: heavy tools wait half outside the frame, lazily
      if (on(t, FITS, BRING + 4 * F)) {
        const f = Math.min(fr(t, FITS), 3), g = fr(t, BRING), x = 320 - [4, 10, 14, 16][f] + (g >= 0 ? [4, 10, 16, 24][g] : 0);
        icon('fileFloppy', x, 112);
        if (g < 0) for (const [str, yy] of [['heavy tools', 147], ['(lazy)', 158]]) { const sw = tw(str, 'small'); rect(318 - sw - 2, yy - 2, sw + 4, 11, C.black); text(str, 318 - sw, yy, { font: 'small', color: C.white }); }
      }
      if (on(t, THE, PIV)) c10_hintTag(t);
      if (t >= IM) c10_card(t);
      // the writer's clicks, in the writer's colour (pre-inverted)
      if (on(t, SNAP[1], SNAP[1] + .25)) clickBurst(...ROW, SNAP[1], { pointer: false, color: VERM });
      if (on(t, PEN, PEN + .25)) clickBurst(...OK, PEN, { pointer: false, color: VERM });
    },
  };
  if (on(t, THE, PEN)) { const f = fr(t, THE); o.menu = { prop: (x, y, w, h) => youProp(HINT[1])(x + (f < 6 ? (f & 1 ? -1 : 1) : 0), y, w, h) }; }
  c10_homeDesk(t, o);
  if (CUR) CUR.down = p.down;
  if (!live) return;
  if (fr(t, FITS) === 0) FX.invert = false;                                         // PASS: one positive frame
  for (const a of [TWO, FLOP]) if (on(t, a + 10 * F, a + 12 * F)) FX.shake = 1;     // the disks slam home
  c10_lens(t, KEYS);
}

const SC = [['ch10 gate', T0, BRING], ['ch10 model', BRING, PIV], ['ch10 pivot', PIV, FL0]];
for (const [n, a, b] of SC) scene(n, a, b, c10_frame, { era: 'system6', screen: true });
// the release to 1x: the frozen negative, cyan from the nib in 10 hard frames
scene('ch10 flood', FL0, T1, t => {
  ctx.drawImage(memo('c10-neg', FW, FH, () => { ctx.drawImage(frameInto(styleBuf('c10A'), FL0, 'ch10 pivot'), 0, 0); c10_dif(0, 0, FW, FH); }), 0, 0);
  inkFlood(FL0, T1, TIPF[0], TIPF[1], tt => { if (hasScene('ch11 reboot')) ctx.drawImage(frameInto(styleBuf('c10B'), tt, 'ch11 reboot'), 0, 0); else rect(0, 0, FW, FH, FIELDS.cyan); }, { steps: 10, seed: 7 });
  // the pen leaves the page for the chorus rig (B10: pointer (W/2 - 5, 6), pen scale 4), dragging a white trail
  const f = clamp(fr(t, FL0), 0, 9), sw = R(10 * Math.sin(beatPhase(t, 2) * Math.PI * 2)), k = easeIn(f / 9);
  const nib = kk => [R(lerp(TIPF[0], FW / 2 + sw, kk)), R(lerp(TIPF[1], 181, kk))], tip = nib(k), sc = [1, 1, 2, 2, 3, 3, 4, 4, 4, 4][f];
  if (f > 0 && f < 8) penTrail([[...TIPF], tip], { w: 3 });
  if (sc > 1) penCord([[FW / 2, 21], [FW / 2 + R(sw / 2), 33], [tip[0], tip[1] - 36.5 * sc]], { sag: 10, swing: 4, t });
  pen(tip[0], tip[1], Math.PI / 2, sc, { t, flash: false });
  if (sc > 1) CUR = { x: FW / 2 - 5, y: 6, kind: 'arrow' };
}, { era: 'system6', raw: true });
warmUp(() => _floodMap(TIPF[0], TIPF[1], 4, 7));
}
