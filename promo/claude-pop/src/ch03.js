'use strict';
// ch03 · pre-chorus 1, the melt (28-36): the machine fetches and files on a rigid grid, the desk melts as she learns to
// glide, the writer's pen grows over the page, her dotted hand reaches, HAND freezes the world, the nib comes down a
// cappella and chorus 1 floods out of it.
{
// ---- THE HOME DESK (STORYBOARD §4, verbatim, prefixed) ----
const MS = ['# The Tide Comes In Twice', 'They never called it renewable energy. They called it the tide, and they billed it by the moon.', 'Twice a day the estuary fills'];
const INV = c => { const [r, g, b] = rgb(c); return hex(255 - r, 255 - g, 255 - b); };   // pre-invert a colour for FX.invert frames
const HINT = ['Sounds like you.', 'Sounds like a mouthpiece.'];   // Review Desk's lens hint as the film captions it (not product UI: the product's hint is 'Sounds like a mouthpiece / missing personal detail. Not a score.'); never a number
const youProp = s => (x, y, w, h) => { const f = 'menu'; text(s, x + w, y + R((h - capH(f)) / 2), { font: f, align: 'right', color: P.menuText }); };
let PERIOD = [0, 0];   // the writer's full stop, screen coordinates, set by every homeDesk call
function c03_homeDesk(t, o = {}) {
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
// lens(t, keys): keys = [[t, x, y, n], ...] in SCREEN coordinates; the last key at or before t wins (§2.1)
function c03_lens(t, keys) { let k = null; for (const q of keys) if (q[0] <= t) k = q; if (k && k[3] > 1) stepZoom(k[3], k[1], k[2]); return k; }

// ---- the song's clock (every time from data.js) ----
const L1 = lyric('pre1a'), L2 = lyric('pre1b'), L3 = lyric('pre1c'), L4 = lyric('pre1d'), L5 = lyric('chorus1a'), LINES = [L1, L2, L3, L4, L5];
const at = (L, i) => wordAt(L, i).start;
const T0 = section('pre1').start, MELT = hit('melt'), HAND = hit('stop1'), AIR = hit('air1'), DOWN = hit('chorus1'), FL0 = DOWN - 10 / FPS;
const FETCH = at(L1, 2), FILE = at(L1, 5), HUM = at(L2, 2), WHILE = at(L2, 5), BUT = L3.start, PEN = at(L3, 2), PAGE = at(L3, 5), STAY = L4.start;
const PICK = L5.start, YOUR = at(L5, 2), S16 = SPB / 4;
const RISER = evList('riser').find(r => r[0] >= T0 - 1e-6) || [T0, HAND];
// the plate (Clio's words: solid on a temporary plate), the page, the landing point of the nib (screen coordinates)
const PL = { x: 280, y: 140, w: 96, h: 44 }, PL2 = { x: 144, y: 173, w: 96, h: 44 }, PG = { x: 141, y: 104, w: 168, h: 124 }, TIP = [237, 169], DROP = 6;
const TIPF = [TIP[0] + 64, TIP[1] + 9];   // the same pixel in the 512x342 frame: where the magenta comes from
// the lens point stays put on screen (stepZoom): crops 2x x177-497, 3x x168-381 (pen + plate), 3x x140-353 y109-229 (the
// page, the plate, Clio's eyes), 4x x143-303 y127-217 (nib, both hands, plate)
const KEYS = [[T0, 0, 0, 1], [FETCH, 418, 150, 2], [PEN, 284, 49, 3], [PAGE, 242, 167, 3], [HAND, 211, 172, 4]];
let c03_noPen = false;   // set only for the length of one frameInto call (the flood draws its own, moving pen)

// ghostPlate: a 50% dither of paper over the rect, marching ants (phase on 8ths), a TEMPORARY tag
function c03_ghostPlate(x, y, w, h, t, lid = 0) {
  rect(x, y, w, h, C.white); bayer(x, y, w, h, .25, C.black, null);
  const ph = Math.floor(beatAt(t) * 2) & 3, seg = (x0, y0, len, hz) => { for (let i = -ph; i < len; i += 4) { const a = Math.max(0, i), b = Math.min(len, i + 2); if (b > a) hz ? rect(x0 + a, y0, b - a, 1, C.black) : rect(x0, y0 + a, 1, b - a, C.black); } };
  seg(x, y, w, 1); seg(x, y + h - 1, w, 1); seg(x, y, h, 0); seg(x + w - 1, y, h, 0);
  const tg = 'TEMPORARY', tw_ = tw(tg, 'small') + 6;
  const lx = x + w - tw_ - 2;
  if (lid === 1) { rect(lx - 1, y - 11, tw_ + 2, 12, C.black); rect(lx, y - 10, tw_, 10, C.white); }   // flipped open: its white underside
  else if (lid === 2) rect(lx, y - 2, tw_, 3, C.black);   // edge-on, falling
  else { rect(lx, y + 2, tw_, 10, C.black); text(tg, lx + 3, y + 4, { font: 'small', color: C.white }); }
}
// the melt: from 30.0 the desktop's dot screen loosens into noise that drips down from the menu bar in 4 px columns
function c03_melt(t) {
  const k = t < MELT ? 0 : clamp((Math.floor((t - MELT) * 4) + 1) / 10); if (k <= 0) return;
  const top = E.menuH, span = H - top;
  const lens = [];
  for (let i = 0; i < W / 4; i++) lens.push(R(span * clamp(k * 1.6 - hash(i * 7.13) * .55) * (.55 + .45 * hash(i * 3.31 + 1))));
  ctx.fillStyle = noisePat(.2, C.black, C.white); lens.forEach((len, i) => { if (len > 0) ctx.fillRect(i * 4, top, 4, len); });
  lens.forEach((len, i) => { if (len > 6 && hash(i * 5.7) > .55) { rect(i * 4 + 1, top + len - 8, 2, 8, C.black); rect(i * 4, top + len, 4, 3, C.black); rect(i * 4 + 1, top + len + 3, 2, 1, C.black); } });   // the drips' beads
}
// the writer's pen rig: the pointer steps aside on "fetch."; on "pen" the pen grows 1 -> 2 -> 3 and lifts over the page;
// after "I'm" it comes down in 4 hard 16ths until the nib touches the end of the draft on "your"
function c03_rig(t) {
  if (t < PEN) return { px: 300 - R(28 * clamp((Math.floor((t - FETCH) * FPS) + 1) / 4)), py: 24, s: 1, L: 22 };
  if (t < PEN + SPB / 2) return { px: 259, py: 14, s: 2, L: 16 };
  return { px: TIP[0] - 9, py: TIP[1] - 135 - DROP * (4 - clamp(Math.floor((t - PICK) / S16 + 1e-6), 0, 4)), s: 3, L: 10 };
}
const c03_tipY = g => g.py + 15 + g.L + R(36.5 * g.s);
// the pen is static in desk mode (no field, no flash): drawn once per scale and blitted (a scale-3 pen is ~45 polygons)
const c03_pen = (x, y, s) => ctx.drawImage(memo('c03pen' + s, 12 * s, 40 * s, () => pen(6 * s, 38 * s, Math.PI / 2, s, { flash: false })), R(x) - 6 * s, R(y) - 38 * s);
function c03_drawRig(t, g, tf, dx = 0) {
  const ax = g.px + 5, ay = g.py + 15, bx = g.px + 9, by = ay + g.L;
  penCord([[ax, ay], [bx, by]], { sag: 6, swing: g.s > 1 ? 1 : 3, t: tf });
  c03_pen(bx + dx, c03_tipY(g) + (g.dy || 0), g.s);
  CUR = { x: g.px, y: g.py, kind: 'arrow' };
}
// the ghost hand: the pointing hand at 2x in negative, a solid black outline round a 50% check of paper (a temporary hand)
const c03_ghostHand = () => memo('c03hand', 32, 34, () => {
  ctx.drawImage(SPR.ptr_hand, 0, 0, 32, 34); const d = ctx.getImageData(0, 0, 32, 34), a = d.data;
  for (let i = 0; i < a.length; i += 4) { const v = a[i] > 128 ? 0 : 255; a[i] = a[i + 1] = a[i + 2] = v; if (v && ((i >> 2) % 32 + ((i >> 2) >> 5)) & 1) a[i + 3] = 0; }
  ctx.putImageData(d, 0, 0);
});
// the snare whap: the gag window of the moment jumps 2 px on the snare's frame and the next (backbeats, then 8ths, then 16ths)
const c03_whap = t => { const i = evIndex('snare', t), e = evList('snare')[i]; return e && e[0] >= T0 - 1e-6 && t < HAND && evFrames('snare', t) < 2 ? (i & 1 ? 2 : -2) : 0; };

function c03_desk(t) {
  const tf = Math.min(t, HAND), frozen = t >= HAND, hf = frozen ? Math.floor((t - HAND) * FPS + 1e-6) : -1;
  const shakeHint = hf >= 0 && hf < 4 ? (hf & 1 ? 1 : -1) : 0, wh = frozen ? 0 : c03_whap(t), g = c03_rig(t);
  if (t >= PEN && !frozen && evFrames('kick', t) < 2) g.py++;   // four on the floor: the writer's hand dips on every kick
  c03_melt(tf);
  // the riser is Clio's status, in her own window's info strip: Fetching… Filing… Humming… Reaching…
  const n = R((beatAt(RISER[1]) - beatAt(RISER[0])) * 4), rk = Math.floor(prog(tf, RISER[0], RISER[1]) * n + 1e-6) / n;
  const lab = (tf < at(L1, 3) ? 'Fetching… ' : tf < MELT ? 'Filing… ' : tf < BUT ? 'Humming… ' : 'Reaching… ') + R(rk * 100) + '%';
  c03_homeDesk(tf, {
    clio: false, chat: { header: ['Chat', '', lab] },
    menu: { prop: (x, y, w, h) => youProp(HINT[0])(x + shakeHint, y, w, h), clock: clockText(tf) },
    after: () => {
      rect(196, 240, 72, 6, C.black); rect(197, 241, 70, 4, C.white); rect(198, 242, R(68 * rk), 2, C.black);
      c03_fetchFile(t);
      c03_bell(t);
      // the page: Section Drafts zooms open from its desk icon under the pen on "page", whapped by every snare
      const pk = prog(t, PAGE, PAGE + .2);
      const pc = pk > 0 ? win(PG.x + (pk >= 1 ? wh : 0), PG.y, PG.w, PG.h, 'Section Drafts', { k: Math.floor(pk * 4) / 4, from: [420, 306], active: true }) : null;
      if (pc) { rect(pc.x, pc.y, pc.w, pc.h, C.white); text('Twice a day the', pc.x + 8, pc.y + 24, { font: 'doc', color: C.black }); text('estuary fills, and', pc.x + 8, pc.y + 39, { font: 'doc', color: C.black }); }
      if (hf >= 0 && hf < 2) line(288, 293, 308, 284, C.black, 2);   // the choked crash: the Trash lid flips up and slams
      // Clio, in front of the page; from "stay" her arm stretches out and a dotted ghost of her mitten creeps on for the
      // nib, and freezes short of it
      const reach = tf >= STAY, nib = [TIP[0], c03_tipY(c03_rig(HAND))], h0 = [286, 198];
      const rk2 = reach ? Math.min(.86, Math.floor((tf - STAY) * FPS) * 1.2 / Math.hypot(nib[0] - h0[0], nib[1] - h0[1])) : 0;
      const [hx, hy] = [R(lerp(h0[0], nib[0], rk2)), R(lerp(h0[1], nib[1], rk2))];
      clio(286, 196, { scale: 3, mouth: 'sing', expr: frozen ? 'surprised' : 'sing', pose: reach ? 'reach' : undefined, reach: reach ? h0 : undefined, blink: !frozen, bob: frozen ? 0 : undefined });
      c03_plate(t, tf, hf);
      if (rk2 > 0) { dline(h0[0], h0[1], hx + 12, hy + 30, C.black, 2, 2); ctx.drawImage(c03_ghostHand(), hx - 10, hy); }
    },
  });
  if (!c03_noPen) {
    if (t >= YOUR) { const r = Math.min(4, Math.floor((t - YOUR) * FPS)); if (r > 0) disc(TIP[0], TIP[1] + 1, r, C.black); }   // the ink bead
    c03_drawRig(t, g, tf, t >= BUT && t < PAGE + .2 ? wh : 0);
  }
  // camera: the lens; on the HAND hit a 2-step stab punch at the reaching mitten and "hand.", with the jolt
  if (hf >= 0 && hf < 2) { stepZoom([6, 5][hf], 191, 186); FX.shake = 2; }
  else c03_lens(t, KEYS);
}
// "fetch.": a result card flies from the Project Hard Disk into the free zone; "file.": it breaks into four folders that
// drop on 32nds, crooked, and click into exact alignment on the next 8th; on the melt they sag and dissolve
function c03_fetchFile(t) {
  if (t < FETCH || t >= MELT + SPB) return;
  const card = { x: 282, y: 74, w: 118, h: 42 }, k = prog(t, FETCH, FETCH + SPB);
  if (t < FILE) {
    if (k < 1) { zoomRects({ x: 460, y: 22, w: 32, h: 32 }, card, Math.floor(k * 8) / 8); return; }
    const b = t < FETCH + SPB + 2 / FPS ? 2 : 0;
    // a fetched result, not Clio's words: a solid white Searcher card with a solid shadow
    const x = card.x + c03_whap(t), y = card.y + b;
    rect(x + 2, y + 2, card.w, card.h, C.black); rect(x, y, card.w, card.h, C.black); rect(x + 1, y + 1, card.w - 2, card.h - 2, C.white);
    icon('searcher', x + 5, y + 6, { size: 16 });
    ['Lunar billing:', 'a history'].forEach((l, i) => text(l, x + 25, y + 5 + i * 11, { font: 'chicago', color: C.black }));
    text('estuaries.example', x + 25, y + 30, { font: 'small', color: C.black });
    return;
  }
  const al = t >= FILE + SPB / 2, melt = clamp(Math.floor((t - MELT) * 8) / 4);
  for (let i = 0; i < 4; i++) {
    const t0 = FILE + i * S16 / 2, f = Math.floor((t - t0) * FPS); if (f < 0) continue;
    const y0 = 120 + (al ? 0 : [1, -1, 2, 0][i]), x0 = 294 + i * 26 + (al ? 0 : [0, 1, -1, 1][i]);
    const y = (f < 3 ? R(lerp(card.y, y0, (f + 1) / 3)) : y0) + R(melt * (3 + i * 2));
    icon('folder', x0, y, { size: 16 });
    if (melt > 0) { ctx.fillStyle = noisePat(melt, C.white, null); ctx.fillRect(x0, y, 16, 16); }
    if (al && t < FILE + SPB / 2 + 2 / FPS) frame(x0 - 2, y - 2, 20, 20, C.black);
  }
}
// "I can hum for a while.": the Writing Bell opens on the melt; a note glides up out of each sung word into it; its
// timer counts down a second a word and rings on "while."; it zooms shut on the snare of "But"
function c03_bell(t) {
  if (t < MELT || t >= BUT + .15) return;
  const bx = 290, by = 72, bw = 110, bh = 46, k = t < BUT ? prog(t, MELT, MELT + .15) : 1 - prog(t, BUT, BUT + .15);
  const ring = t >= WHILE, rf = Math.floor((t - WHILE) * FPS), sh = ring && rf < 18 ? (rf & 2 ? 1 : -1) : 0;
  for (let i = 2; i < 6; i++) {
    const w = L2.words[i], d = t - w.start; if (d < 0 || d > SPB * .75) continue;
    const u = d / (SPB * .75), ny = R(lerp(PL.y - 4, by + bh - 8, u)), nx = R(PL.x + 10 + (i - 2) * 22 + 5 * Math.sin(u * 9 + i));
    spr('it_note', nx, ny, { scale: 2 });
  }
  const c = win(bx + sh + c03_whap(t), by, bw, bh, '', { k: Math.floor(k * 4) / 4, from: [bx + bw / 2, PL.y], zoom: false, close: false, active: true });
  if (!c) return;
  const tl = tw('Writing Bell', 'title'); rect(c.x - 1 + R((bw - tl) / 2) - 5, by + 1, tl + 10, 17, C.white); text('Writing Bell', c.x - 1 + R(bw / 2), by + 5, { font: 'title', align: 'center', color: C.black });
  rect(c.x, c.y, c.w, c.h, C.white);
  icon('writingBell', c.x + 4 + (ring && rf < 12 ? (rf & 4 ? 2 : -2) : 0), c.y + 5, { size: 16 });
  const left = t < HUM ? 4 : t < at(L2, 3) ? 3 : t < at(L2, 4) ? 2 : t < WHILE ? 1 : 0, inv = ring && rf < 30 && (rf >> 2) % 2 === 0;
  if (inv) rect(c.x + 26, c.y + 2, c.w - 30, c.h - 4, C.black);
  text('0:0' + left, c.x + c.w - 6, c.y + 5, { font: 'chicago', scale: 2, align: 'right', color: inv ? C.white : C.black });
  if (ring) clickBurst(c.x + 12, c.y + 12, WHILE, { pointer: false, ringW: 2, t });
}
// the plate above Clio: the line being sung in two rows, each word popping in solid on its note
function c03_plate(t, tf, hf = -1) {
  let L = L1; for (const l of LINES) if (t >= l.start - 1e-6) L = l;
  const p = t >= PAGE ? PL2 : t >= PEN ? { ...PL, y: PL.y - 40 } : PL, glide = L === L2, lead = L !== L1 && L !== L2;
  c03_ghostPlate(p.x, p.y, p.w, p.h, tf, [1, 2][hf] || 0);   // the choked crash: its tag-lid flips open and slams
  [L.words.slice(0, 3), L.words.slice(3)].forEach((ws, r) => {
    let x = p.x + 5;
    for (const w of ws) {
      const d = t - w.start, held = d >= 0 && t < w.end && t < HAND;
      if (d >= 0) {   // pop in on the note; the glides slide (portamento), the lead's held notes shake (vibrato)
        const b = R(-3 * Math.exp(-14 * d) * Math.cos(d * 30)) + (glide && held ? R(2 * Math.sin(d * 14)) : 0);
        text(w.w, x + (lead && held && w.end - w.start >= SPB ? Math.floor(t * 11) & 1 : 0), p.y + 16 + r * 15 + b, { font: 'chicago', color: C.black, outline: C.white });
      }
      x += tw(w.w, 'chicago') + 4;
    }
  });
}

scene('ch03 fetch', T0, BUT, t => c03_desk(t), { era: 'system6', screen: true });
scene('ch03 pen', BUT, FL0, t => c03_desk(t), { era: 'system6', screen: true });
// the release: 1x (the lens is a frame FX, which frameInto drops), magenta from the nib in 10 hard frames while the pen
// scribbles three zigzags through it (the signature move, planted) with a white trail behind the nib
// the desk under the ink is frozen at the release frame: rendered once (the same picture for all ten frames), at boot
const c03_floodA = () => memo('c03-floodA', FW, FH, () => { c03_noPen = true; try { ctx.drawImage(frameInto(styleBuf('c03A'), FL0, 'ch03 pen'), 0, 0); } finally { c03_noPen = false; } });
scene('ch03 flood', FL0, DOWN, t => {
  ctx.drawImage(c03_floodA(), 0, 0);
  inkFlood(FL0, DOWN, TIPF[0], TIPF[1], tt => { if (hasScene('ch04 pen pal')) ctx.drawImage(frameInto(styleBuf('c03B'), tt, 'ch04 pen pal'), 0, 0); else rect(0, 0, W, H, FIELDS.magenta); }, { steps: 10 });
  // the pen leaves the page and flies to the writer's chorus rig (ch04: pointer (W-56, 6), nib (W-51+swing, 181), scale 4)
  const f = clamp(Math.round((t - FL0) * FPS), 0, 9), sc = screenSize(t), sw = R(10 * Math.sin(beatPhase(t, 2) * Math.PI * 2));
  const nibAt = ff => { const k = easeIn(ff / 9); return [R(lerp(TIPF[0], sc.x + sc.w - 51 + sw, k)), R(lerp(TIPF[1], sc.y + 181, k))]; };
  const tip = nibAt(f), s4 = f >= 7;
  if (f > 0) penTrail([nibAt(Math.max(0, f - 3)), tip], { w: 3 });
  if (s4) { penCord([[tip[0] - sw, tip[1] - 160], [tip[0], tip[1] - 148]], { sag: 22, swing: 4, t }); pen(tip[0], tip[1], Math.PI / 2, 4, { t, flash: false }); CUR = { x: tip[0] - sw - 5, y: tip[1] - 175, kind: 'arrow' }; }
  else c03_drawRig(t, { px: tip[0] - 9, py: tip[1] - 135, s: 3, L: 10 }, HAND);
}, { era: 'system6', raw: true });
warmUp(() => { _floodMap(TIPF[0], TIPF[1], 4, 7); c03_floodA(); });
}
