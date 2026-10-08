// ch05 · post-chorus 1: the band, the bouncing pen (52-60) · lime · 1999 Platinum. ONE HERO: the white pen hops LA to LA.
'use strict';
{
  const SEC = section('post1'), T0 = SEC.start, T1 = SEC.end, DR0 = T1 - 10 / FPS;
  const Q = ['q3', 'q4', 'q5', 'q6'].map(id => lyric(id)), ST = Q[1].start, WIPE0 = ST - SPB / 2;
  const FLD = FIELDS.lime, BLK = C.black, WHT = C.white, PI = Math.PI;
  const SW = 608, SH = 356;   // the Platinum screen: laid out once for it, centred while the screen still grows (51.6-52.5)
  const PX = SW - 56, PY = 6, HOME = [SW - 51, 181], NIBF = [573, 183];
  const ROW = 169;            // bandGrid's typing row (scale 2 at 608x356): the la-la plate covers it
  const BAR = [ROW - 12, 104];   // the stage's la-la band: one tall row (y, h) through the record's centre
  const REC = [150, ROW + 40, 150], ARM = [330, 40], NA = -50 * PI / 180, CLX = 500, CLS = 3;
  const CW = 340, CX = SW - 8 - CW, CY = 280;   // the quiz card
  const LALA = 'LA LA LA, LA LA LA LA.';
  const c5_fr = (t, at) => Math.floor((t - at) * FPS + 1e-6);
  const c5_has = n => SCENES.some(s => s.name === n);
  const c5_dif = (fn) => { ctx.save(); ctx.globalCompositeOperation = 'difference'; try { fn(); } finally { ctx.restore(); } };
  const C5W = ((typeof EVENTS !== 'undefined' && EVENTS.chopWord) || []).map(e => [+e[0], +e[1], String(e[2]).toLowerCase()]).filter(e => e[0] >= T0 && e[0] < T1);
  const c5_chop = t => { const i = bsearch(C5W.map(e => e[0]), t + 1e-9); return i < 0 ? null : C5W[i]; };   // EV numbers its fields: read the word here
  const c5_q = t => Q[clamp(bsearch(Q.map(q => q.start), t), 0, 3)];

  // the composition is drawn in a fixed 608x356 frame, centred in the screen of the moment (a no-op from 52.5 on)
  function c5_fix(fn) {
    const dx = R((W - SW) / 2), dy = R((H - SH) / 2), w = W, h = H;
    ctx.save(); ctx.translate(dx, dy); W = SW; H = SH;
    try { return fn(dx, dy); } finally { W = w; H = h; ctx.restore(); }
  }
  // ---- the la-la type: one row on a full-width black band (the grid's typing row, then taller across the record) ----
  const c5_bandO = st => ({ scale: 4, min: 4, max: 4, stretch: [1, st ? 2 : 1], color: FLD, x: SW / 2, y: ROW + 4, valign: 'top' });
  const WORDS = LALA.split(' '), PUSH = [[2, 1, 1], [4, 2, 1]];   // the nib presses each LA down on its note (px per frame)
  const c5_push = (t, w, st) => { const f = c5_fr(t, w.start); return f >= 0 && f < 3 ? PUSH[st][f] : 0; };
  let c5_L = [];
  function c5_lay(st) {   // per word: [x, y] of its first letter, and the comma's box (its tail hangs below the band)
    if (c5_L[st]) return c5_L[st];
    const m = c5_meas(LALA, c5_bandO(st)), xs = []; let i = 0;
    WORDS.forEach(w => { xs.push(m.letters[i].x); i += w.length; });
    return (c5_L[st] = { xs, y: m.y, m, cm: m.letters.find(l => l.ch === ',') });
  }
  // the la-la row: a black band, each LA drawn on its own: unsung = hollow (outlined), sung = solid, pressed down by the nib on its note
  function c5_row(t, q, st) {
    const L = c5_lay(st), sy = st ? 8 : 4, [y0, h] = st ? BAR : [ROW - 4, 48];
    rect(0, y0, SW, h, BLK); rect(L.cm.x - 4, y0 + h - 2, L.cm.w + 8, L.y + 11 * sy + PUSH[st][0] + 2 - (y0 + h) + 2, BLK);
    q.words.forEach((w, i) => {
      const on = t >= w.start - 1e-6;
      bigType(WORDS[i], { ...c5_bandO(st), x: L.xs[i], y: L.y + c5_push(t, w, st), align: 'left', ...(on ? {} : { color: BLK, outline: FLD }) });
    });
  }
  let c5_sc = null;
  function c5_meas(str, o) { let r; c5_sc = c5_sc || Object.assign(document.createElement('canvas'), { width: 8, height: 8 }); const w = W, h = H; W = SW; H = SH; try { offscreen(8, 8, () => { r = bigType(str, o); }, c5_sc); } finally { W = w; H = h; } return r; }
  // the top-centre of each LA: where the nib taps
  function c5_tg(m) {
    const out = []; let w = [];
    for (const l of m.letters) { if (l.ch === 'L' && w.length) { out.push(w); w = []; } if (/[LA]/.test(l.ch)) w.push(l); }
    out.push(w);
    return out.map(ls => [R((ls[0].x + ls[ls.length - 1].x + ls[ls.length - 1].w) / 2), ls[0].y - 1]);
  }
  let c5_K = null;
  function c5_keys() {   // [time, nib x, nib y]: LA to LA, the band row, then the stage block three times, then home
    if (c5_K) return c5_K;
    const band = c5_tg(c5_lay(0).m), stage = c5_tg(c5_lay(1).m), K = [];
    Q.forEach((q, j) => q.words.forEach((w, i) => K.push([w.start, ...(j ? stage : band)[i]])));
    K.push([Q[3].words[6].start + SPB / 2, ...HOME]);
    return (c5_K = K);
  }
  // the bounce: a whole-pixel parabola in 8 steps per hop, nib-first; the pen leans into the hop and lands upright on the note
  function c5_nib(t) {
    const K = c5_keys(), j = bsearch(K.map(k => k[0]), t);
    if (j < 0) return [K[0][1], K[0][2], PI / 2, -1];
    if (j >= K.length - 1) return [HOME[0], HOME[1], PI / 2, K.length - 1];
    const [t0, x0, y0] = K[j], [t1, x1, y1] = K[j + 1], k = Math.floor(prog(t, t0, t1) * 8) / 8, d = x1 - x0;
    const hgt = j === K.length - 2 ? 60 : clamp(Math.abs(d) / 4 + 20 + (t1 - t0 > .3 ? 18 : 0), 24, 70);
    const lean = k > 0 && Math.abs(d) > 8 ? Math.sign(d) * (k > .2 && k < .8 ? 2 : 1) : 0;
    return [R(lerp(x0, x1, k)), R(lerp(y0, y1, k) - hgt * 4 * k * (1 - k)), PI / 2 - lean * .16, j];
  }
  const c5_spr = (a, fl) => memo('c5pen' + a.toFixed(2) + fl, 320, 320, () => pen(160, 160, a, 4, { t: T0, flash: fl }));
  // the writer: the pointer at the top right holds the cord; the pen bounces at its end (frozen at home for the drain)
  function c5_pen(t, dx, dy) {
    const [x, y0, a, j] = c5_nib(t), home = j >= c5_keys().length - 1, fl = !home && evFrames('kick', t) === 0;
    const y = y0 + (j >= 0 && !home ? c5_push(t, { start: c5_keys()[j][0] }, j < 7 ? 0 : 1) : 0);
    const bx = R(x - Math.cos(a) * 146), by = R(y - Math.sin(a) * 146), ce = evLast('clap', t), dn = ce && ce[0] >= T0 && c5_fr(t, ce[0]) < 5;
    const tap = j >= 0 && !home ? c5_fr(t, c5_keys()[j][0]) : 99;
    const pyb = PY + (tap < 3 ? 2 : 0);   // the writer's hand dips with every tap
    if (home) penCord([[PX + 5, PY + 15], [HOME[0], PY + 27]], { sag: 22, swing: 4, t: Q[3].words[6].start });
    else penCord([[PX + 5, pyb + 15], [bx, by]], { sag: 5, swing: 0, t });
    ctx.drawImage(c5_spr(a, fl), x - 160, y - 160);
    if (tap < 4) for (const s of [-1, 1]) { const ox = x + s * (7 + 4 * tap), oy = y - 3 - 2 * tap; rect(ox - 2, oy - 1, 5, 4, BLK); rect(ox - 1, oy, 3, 2, WHT); }   // the tap's spark
    CUR = { x: PX + dx, y: (home ? PY : pyb) + dy, kind: 'arrow', down: dn };
  }
  // ---- the band's pads (bandGrid's own layout at 608x356, scale 2). Only the kick (and the crash) may fill its pad,
  // at most one every .7 s from the landing on (the flash budget); every other hit gets its pad flipped back (a
  // difference with the field undoes the black/lime swap) and is marked by a black outline that closes in instead ----
  const c5_PADS = (() => {
    const g = 7, rest = SH - 4 * g - 32 - 44 - 12, r1 = R(rest * .58), r2 = rest - r1, y1 = g + 16, y2 = y1 + r1 + g + 60;
    const p1 = R((SW - 4 * g) / 3), p2 = R((SW - 5 * g) / 4), x2 = i => g + i * (p2 + g);
    return [[g, y1, p1, r1, 'floppyA'], [2 * g + p1, y1, p1, r1, 'floppyB'], [3 * g + 2 * p1, y1, SW - 4 * g - 2 * p1, r1, 'kick'],
      [x2(0), y2, p2, r2, 'snare'], [x2(1), y2, p2, r2, 'clap'], [x2(2), y2, p2, r2, 'crash'], [x2(3), y2, SW - 2 * g - 3 * (p2 + g), r2, 'bell']];
  })();
  const C5_INV = (() => { let l = T0; return evTimes('kick').filter(x => x > T0 + 1e-6 && x < ST - 1e-6 && x - l >= .7 && (l = x)); })();
  function c5_band(t) {
    bandGrid(0, 0, SW, SH, { t, field: FLD });
    for (const [px, py, pw, ph, ch] of c5_PADS) {
      const hf = evFrames(ch, t); if (hf >= 4) continue;
      const e = evLast(ch, t), fill = (ch === 'kick' || ch === 'crash') && C5_INV.some(x => Math.abs(x - e[0]) < 1e-6);
      if (fill) continue;
      const sl = hf < 3 ? [4, 2, 1][hf] : 0;
      if (hf < 2) c5_dif(() => rect(px - sl + 3, py - sl + 3, pw + 2 * sl - 6, ph + 2 * sl - 6, FLD));
      const i = 4 + 3 * hf; frame(px + i, py + i, pw - 2 * i, ph - 2 * i, BLK, 3);
    }
  }
  function c5_claps(t) { const e = evLast('clap', t); if (e && e[0] >= T0 && c5_fr(t, e[0]) < 14) clickBurst(PX, PY, e[0], { pointer: false, color: BLK, t }); }

  // ---- the stage: One More Tune's record (black, only its eleventh groove lit), the tonearm, the quiz card, Clio ----
  function c5_record(t) {
    const [cx, cy, r] = REC, ke = evLast('kick', t), dip = ke && ke[0] >= ST && c5_fr(t, ke[0]) < 2 ? 2 : 0, y = cy + dip;
    const re = evLast('riff', t), on = re && re[0] >= T0 && t < re[0] + re[2], gr = r - 9, sc = evLast('chop', t), scr = sc && sc[0] >= T0 && t < sc[0] + sc[1];
    const a = (scr ? Math.floor(sc[0] * 8) - 2 * c5_fr(t, sc[0]) : Math.floor(t * 8)) * 25 * PI / 180;   // a chop scratches the platter back
    disc(cx, y, r, BLK);
    ring(cx, y, gr, FLD, on ? 6 : 3);                                                 // the eleventh groove, outside the ten
    for (const da of [0, PI]) disc(R(cx + Math.cos(a + da) * gr), R(y + Math.sin(a + da) * gr), 8, BLK);   // gaps turning with the platter
    text('ONE MORE TUNE', cx, y + 62, { font: 'chicago', color: FLD, align: 'center' });
    const nx = R(cx + Math.cos(NA) * gr), ny = R(y + Math.sin(NA) * gr) - (on ? 1 : 0);
    line(ARM[0], ARM[1], nx + 6, ny - 6, FLD, 9); line(ARM[0], ARM[1], nx + 6, ny - 6, BLK, 5);
    disc(ARM[0], ARM[1], 15, FLD); disc(ARM[0], ARM[1], 12, BLK); disc(ARM[0], ARM[1], 4, FLD);
    rect(nx - 6, ny - 9, 16, 12, FLD); rect(nx - 4, ny - 7, 12, 8, BLK); rect(nx - 1, ny, 2, 3, BLK);
  }
  function c5_card(t) {   // slides up from the bottom right on the first LA; the answer stamps on the fifth
    const k = Math.floor(prog(t, ST, ST + SPB / 2) * 5) / 5, y = R(lerp(SH + 20, CY, 1 - (1 - k) ** 2)), ans = Q[1].words[4].start;
    if (y >= SH) return;
    rect(CX, y, CW, SH - y, BLK); frame(CX + 3, y + 3, CW - 6, SH - y, FLD, 1);
    text('Track 11 · Name the ad.', CX + 12, y + 11, { font: 'chicago', scale: 2, color: FLD });
    const bx = CX + 12, by = y + 37, bw = tw('Not in the deck.', 'chicago', 2) + 20;
    if (t < ans) { frame(bx, by, bw, 22, FLD, 1); if (caretOn(t)) rect(bx + 6, by + 3, 3, 16, FLD); return; }
    const f = c5_fr(t, Math.max(ans, ...Q.slice(2).map(q => q.start).filter(s => s <= t))), g = f < 3 ? 3 - f : 0;   // stamps, and bumps on each phrase downbeat
    if (f < 1) FX.shake = Math.max(FX.shake || 0, 2);
    rrect(bx - g, by - g, bw + 2 * g, 22 + 2 * g, 6, FLD);
    text('Not in the deck.', bx + 10, by + 3, { font: 'chicago', scale: 2, color: BLK });
  }
  // three whole-pixel zigzags written in the air beside the raised mitten, one per third of the chop, stacked down the
  // empty lime right of her arm like lines of handwriting (THE SCRIBBLE): x <= h + 4u + 8u, clear of the frame edge
  function c5_scrib(d, k, dur) {
    const h = d.hands[0][1] < d.hands[1][1] ? d.hands[0] : d.hands[1], u = CLS, n = Math.min(3, Math.floor(k / (dur / 3) + 1e-6) + 1);
    for (const [c, w] of [[FLD, 8], [BLK, 4]]) for (let i = 0; i < n; i++) {
      const ox = h[0] + 3 * u + (i & 1) * u, oy = h[1] + (3 + i * 5) * u;
      for (let j = 0; j < 4; j++) line(ox + j * 2 * u, oy - (j & 1) * 3 * u, ox + (j + 1) * 2 * u, oy - ((j + 1) & 1) * 3 * u, c, w);
    }
  }
  // Clio pops up from behind the la-la band on the first LA and stands ON it, whole, in the free lime right of the
  // tonearm (scale 3: head to feet between y 40 and the band); sings it (choir); on each chop: E / A, the signature
  // (pen = the scribble, pal = the wave) and her head inverts for a frame
  function c5_clio(t) {
    const k = Math.floor(prog(t, ST, ST + SPB / 2) * 5) / 5;
    const ch = c5_chop(t), live = ch && ch[0] >= T0 && t < ch[0] + ch[1], pn = live && ch[2] === 'pen';
    const off = R(130 * (1 - k) ** 2) - 3 + (pn ? 8 : 0);   // feet on the band's top edge; dips to thrust the pen arm up
    if (off >= 130) return;
    const o = live ? { pose: pn ? 'pointUp' : 'pointCam', p: pn ? prog(t, ch[0], ch[0] + ch[1]) : .5, mouth: { open: .8, shape: pn ? 'E' : 'A' } } : { pose: 'bounce' };
    clipRect(0, 0, SW, BAR[0], () => {
      const d = clioDance(CLX, BAR[0] + off, CLS, t, { field: FLD, voice: 'choir', ground: false, lyric: false, ...o });
      if (pn) c5_scrib(d, t - ch[0], ch[1]);
      if (live && c5_fr(t, ch[0]) === 0) c5_dif(() => rect(d.head[0] - 13 * CLS, d.head[1] - 13 * CLS, 26 * CLS, 25 * CLS, FLD));
    });
  }
  function c5_stage(t) {
    rect(0, 0, SW, SH, FLD);
    c5_record(t);
    c5_clio(t);
    c5_row(t, c5_q(Math.max(t, ST)), 1);
    c5_claps(t);
    c5_card(t);
  }

  // ===================================================================================================
  // 52.0: THE BAND SHOWCASE: the drum machine full frame in lime, the la-la on a black plate across its typing row,
  // the pen bouncing LA to LA (B4: the dive from ch04 lands here; this frame is drawn as the dive's inner from 51.7)
  // ===================================================================================================
  scene('ch05 lala', T0, ST, t => {
    const tt = Math.max(t, T0);
    c5_fix((dx, dy) => {
      c5_band(t);
      c5_row(t, Q[0], 0);
      c5_claps(t);
      if (t >= WIPE0) scanWipe(WIPE0, ST, c5_stage, { band: 4, edge: BLK });   // the grid wipes to the stage on the last two 16ths
      c5_pen(tt, dx, dy);
      if (t >= T0) {
        invertFrame(T0, 1, t); splitPal(2, T0, 3, [WHT, BLK], t);   // owed: the landing
        beatFX(t, { anywhere: true, snare: false });                  // the drop's sort on the crash; the phrase invert
        punch(T0, c5_keys()[0][1] + dx, c5_keys()[0][2] + dy, [2], t);   // the stab: one 2x frame on the pen landing on LA1
      }
    });
  }, { era: 'platinum', raw: true, screen: true });

  // ===================================================================================================
  // 54.0-59.833: THE STAGE. 54 "Name the ad." · 56 the organ returns (the groove), the chops · 58 the stutter, the hop home
  // ===================================================================================================
  const c5_post = t => {   // the cut at 54 is the scan wipe and a split, never a black frame: no phrase invert on 54
    c5_stage(t); c5_pen(t, 0, 0); beatFX(t, { anywhere: true, kick: t >= Q[2].start - 1e-6 }); splitPal(2, ST, 3, [WHT, BLK], t);
  };
  scene('ch05 name the ad', ST, Q[2].start, c5_post, { era: 'platinum', raw: true, screen: true });
  scene('ch05 chops', Q[2].start, Q[3].start, c5_post, { era: 'platinum', raw: true, screen: true });
  scene('ch05 stutter', Q[3].start, DR0, c5_post, { era: 'platinum', raw: true, screen: true });

  // ===================================================================================================
  // 59.833: the drain: the lime sucks back into the nib at home, pixel-sorted, over the live Aqua desk (B5)
  // ===================================================================================================
  scene('ch05 drain', DR0, T1, t => {
    ctx.drawImage(frameInto(styleBuf('c5A'), t, 'ch05 stutter'), 0, 0);
    inkFlood(DR0, T1, NIBF[0], NIBF[1], tt => { if (c5_has('ch06 chat')) ctx.drawImage(frameInto(styleBuf('c5B'), tt, 'ch06 chat'), 0, 0); else rect(0, 0, FW, FH, BLK); }, { drain: true, steps: 10, seed: 3 });
    pixelSort(20, 260, null, 1);
  }, { era: 'platinum', raw: true });
  warmUp(() => { _floodMap(NIBF[0], NIBF[1], 4, 3); c5_keys(); for (let l = -2; l <= 2; l++) for (const f of [0, 1]) c5_spr(PI / 2 - l * .16, !!f); });
}
