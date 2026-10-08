// ch08 · chorus 2: MANY (84-100, lime, 2009/2011) and post-chorus 2 (100-104, magenta, 2014). The twin, the gang of
// twelve, the notice cascade, LAND kept by the nib, the dive into Clio's eye, the gang singing under the bouncing pen.
'use strict';
{
  const LA = lyric('chorus2a'), LAE = lyric('chorus2a_echo'), LB = lyric('chorus2b'), LC = lyric('chorus2c'), LD = lyric('chorus2d'),
    LE = lyric('chorus2e'), LEE = lyric('chorus2e_echo'), LF = lyric('chorus2f'), LG = lyric('chorus2g'), LH = lyric('chorus2h'), Q7 = lyric('q7'), Q8 = lyric('q8');
  const SEC = section('chorus2'), T0 = SEC.start, T1 = SEC.end, DIVE0 = T1 - 3 / 8, P2 = section('post2'), DR0 = P2.end - 10 / FPS;
  const FLD = FIELDS.lime, MAG = FIELDS.magenta, BLK = C.black, WHT = C.white, VER = FIELDS.vermilion, PI = Math.PI, F1 = 1 / FPS;
  const NOTICE = 'The drafting manuscript is read-only; use the current Section Draft instead.';
  const SIGL = [LA, LAE, LB, LC, LD, LE, LEE, LF, LG, LH];
  const STABS = evTimes('stab'), BELLS = evTimes('bell').filter(b => b >= T0 && b < DIVE0);
  const c8_f = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
  const c8_fr = (t, at) => Math.floor((t - at) * FPS + 1e-6);
  const c8_stab = after => STABS.find(s => s > after);
  const c8_has = n => SCENES.some(s => s.name === n);
  const OUT = { outline: FIELDS.lime, outlineW: .25 };
  const OPT = { era: [[T0, 'snowleopard'], [LE.words[3].start, 'lion']], morph: 0, raw: true, screen: true };

  // ---- THE SIGNATURE MOVE: pen = the scribble, pal = the wave, You = the point, do! = the pen point; crash = star jump ----
  function c8_sig(t) {
    if (evSince('crash', t) < SPB * .9) return null;
    for (const L of SIGL) for (const w of L.words) if (t >= w.start && t < w.end) {
      const f = c8_f(w.w), st = evSince('stab', t);
      if (f === 'pen') return st < SPB * .9 && t - st > w.start + 1e-3 ? null : { pose: 'pointUp', p: prog(t, w.start, w.end), k: t - w.start };
      if (f === 'pal') return { pose: 'pointCam' };
      if (f === 'you') return { pose: 'pointCam', p: .5 };
      if (f === 'do') return { pose: 'pointUp', p: 1 };
      if (f === 'hold') return { pose: 'pointUp', p: .5 };
      return null;
    }
    return null;
  }
  // three whole-pixel zigzags written in the air from the raised mitten, one per 16th, haloed in the field
  function c8_scrib(d, k, s, fld) {
    const h = d.hands[0][1] < d.hands[1][1] ? d.hands[0] : d.hands[1], dir = h[0] < d.head[0] ? -1 : 1, u = Math.max(2, R(s * .8)), lw = Math.max(2, R(s / 2));
    const n = Math.min(3, Math.floor(k / (SPB / 4) + 1e-6) + 1);
    for (const [c, w] of [[fld, lw + 4], [BLK, lw]]) for (let i = 0; i < n; i++) {
      const ox = h[0] + dir * (1 + i * 2) * u, oy = h[1] - (4 + i * 5) * u;
      for (let j = 0; j < 4; j++) line(ox + dir * j * 2 * u, oy - (j & 1) * 3 * u, ox + dir * (j + 1) * 2 * u, oy - ((j + 1) & 1) * 3 * u, c, w);
    }
  }
  function c8_dancer(x, y, s, t, o = {}) {
    const g = o.pose ? null : c8_sig(t), fld = o.field || FLD;
    const d = clioDance(x, y, s, t, { field: fld, lyric: false, ...(g ? { pose: g.pose, p: g.p } : {}), ...o });
    if (g && g.k != null) c8_scrib(d, g.k, s, fld);
    return d;
  }
  // THE GANG OF TWELVE: scale 2 along the bottom edge, popping up (and dropping away) in 4 hard frames
  function c8_gang(t, on, off, o = {}) {
    const f = c8_fr(t, on), g = t >= off ? c8_fr(t, off) : -1;
    if (f < 0 || g > 3) return;
    const dy = g >= 0 ? [16, 34, 52, 70][g] : [70, 46, 22, 0][Math.min(f, 3)];
    // two staggered rows: the back six (higher) stretch up in the pen point, the front six do the move with Clio
    for (const r of [1, 0]) for (let i = r; i < 12; i += 2) c8_dancer(20 + i * 52, H - 8 + dy - 30 * r, 2, t, { ground: false, rimW: 3, ...(r ? { pose: 'pointUp', p: 1 } : {}), ...o });
  }

  // ---- the writer: the pointer holds the white pen on its cord. Hanging: the nib at (px + 5 + swing, py + 175) ----
  const c8_spr = (a, fl) => memo('c8pen' + a + fl, 320, 320, () => pen(160, 160, a, 4, { t: fl ? T0 : T0 + .1, flash: fl }));
  function c8_pen(t, px, py, o = {}) {
    const sw = o.still ? 0 : R(10 * Math.sin(beatPhase(t, 2) * PI * 2)), a = o.a ?? PI / 2, lift = R(o.lift || 0);
    const [bx, by] = o.back || (a > 1.2 ? [px + 5 + sw, py + 29 - lift] : [px + 12, py + 22]);
    const tip = [R(bx + Math.cos(a) * 146), R(by + Math.sin(a) * 146)];
    penCord([[px + 5, py + 15], [bx, Math.max(py + 17, by - 2)]], { sag: o.sag ?? 22, swing: o.cs ?? 4, t });
    if (a === 0 || a === PI / 2) ctx.drawImage(c8_spr(a, o.flash !== false && evFrames('kick', t) === 0), tip[0] - 160, tip[1] - 160);
    else pen(tip[0], tip[1], a, 4, { t, flash: false });
    CUR = { x: px, y: py, kind: 'arrow', down: o.down };
    return tip;
  }
  function c8_ripple(t, x, y) {
    for (const b of BELLS) { const d = t - b; if (d < 0 || d >= .4) continue; for (let j = 0; j < 2; j++) { const dd = d - j * .1; if (dd >= 0) ring(x, y, 10 + 4 * Math.floor(dd * 40), WHT, 2); } }
  }
  function c8_rings(t, px, py, col = BLK) { const e = evLast('clap', t); if (e && e[0] >= T0 && c8_fr(t, e[0]) < 14) clickBurst(px, py, e[0], { pointer: false, color: col, t }); }
  function c8_copies(t, px, py) { const e = evLast('clap', t); if (e && e[0] >= T0 && c8_fr(t, e[0]) < 5) for (let i = 2; i >= 1; i--) pointer(px + 7 * i, py + 4 * i, 'arrow', { down: true }); }

  function c8_base(t, hero, steps) {
    rect(0, 0, W, H, FLD);
    invertFrame(T0, 2, t);
    if (evFrames('sub', t) === 0) FX.dy = 1;
    beatFX(t, { anyCrash: true });
    const e = evLast('stab', t); if (e && e[0] >= T0 && hero) punch(e[0], ...hero, steps, t);
  }
  let c8_sc = null;
  function c8_meas(str, o) { let r; c8_sc = c8_sc || Object.assign(document.createElement('canvas'), { width: 8, height: 8 }); const sw = W, sh = H; offscreen(8, 8, () => { W = sw; H = sh; r = bigType(str, o); }, c8_sc); W = sw; H = sh; return r; }
  function c8_lines(lines, o, per) {
    const m = bigType(lines, { ...o, pass: 'slab', invert: false });
    return m.lines.map((l, i) => bigType(lines[i], { ...o, fitH: 0, ...per[i], x: l.x, y: l.y, valign: 'top', align: 'left', min: l.sy, max: l.sy }));
  }
  // the dancers keep clear of the type: drawn through a clip that cuts out each line's box grown by m (they pass behind it)
  function c8_clear(ls, m, fn) {
    ctx.save();
    try { for (const b of ls) { ctx.beginPath(); ctx.rect(-W, -H, 3 * W, 3 * H); ctx.rect(b.x - m, b.y - m, b.w + 2 * m, b.h + 2 * m); ctx.clip('evenodd'); } return fn(); } finally { ctx.restore(); }
  }
  const c8_box = ls => { const x0 = Math.min(...ls.map(l => l.x)), y0 = Math.min(...ls.map(l => l.y)); return { x: x0, y: y0, w: Math.max(...ls.map(l => l.x + l.w)) - x0, h: Math.max(...ls.map(l => l.y + l.h)) - y0 }; };
  const c8_mid = b => [R(b.x + b.w / 2), R(b.y + b.h / 2)];

  // ---- props ----
  // the postmark: a black rubber stamp, "(PEN PAL)" round its rim, the era's year in the middle; the cancel bars rattle on the tambourine
  function c8_postmark(t, t0, cx, cy, bars, yr, r0 = 84, side = 1) {   // side -1: the cancel bars run out to the left edge
    const fr = c8_fr(t, t0); if (fr < 0) return;
    const r = r0 + R([12, 7, 3, 0][Math.min(fr, 3)] * r0 / 84), s = '(PEN PAL)', rt = evFrames('tambourine', t) < 2 ? (evIndex('tambourine', t) & 1 ? 1 : -1) : 0, rr = r - 29, st = Math.min(.35, 17 / rr);
    if (fr < 2) FX.shake = Math.max(FX.shake || 0, 3 - fr);
    if (bars) for (const dy of [-16, 4]) for (let x = side > 0 ? cx + r - 6 : -4; side > 0 ? x < W + 4 : x < cx - r + 6; x += 4) rect(x, cy + dy + rt + R(4 * Math.sin((x - cx) / 11)), 4, 8, BLK);
    disc(cx, cy, r, BLK); ring(cx, cy, r - 7, FLD, 2); ring(cx, cy, r - 12, FLD, 1);
    [...s].forEach((c, i) => { const a = -PI / 2 + (i - (s.length - 1) / 2) * st; text(c, cx + R(Math.cos(a) * rr), cy + R(Math.sin(a) * rr) - 9, { font: 'chicago', scale: 2, color: FLD, align: 'center' }); });
    text(String(yr), cx, cy - 4, { font: 'chicago', scale: 3, color: FLD, align: 'center' });
    rect(cx - 44, cy + 36 + rt, 88, 2, FLD); rect(cx - 30, cy + 42 - rt, 60, 2, FLD);
  }
  function c8_air() {
    ctx.drawImage(memo('c8air' + W + 'x' + H, W, H, () => {
      for (let y = 0; y < H; y++) {
        const edge = y < 8 || y >= H - 8;
        for (let x = -16 + (y % 16); x < W; x += 16) { if (edge) rect(x, y, 8, 1, BLK); else { if (x < 8) rect(Math.max(0, x), y, Math.min(8, x + 8) - Math.max(0, x), 1, BLK); if (x + 8 > W - 8) rect(Math.max(W - 8, x), y, x + 8 - Math.max(W - 8, x), 1, BLK); } }
      }
    }), 0, 0);
  }
  // the read-only notice CASCADE: n black slabs dragged from p0 to p1 over the half beat, the stale copies left behind like a
  // dragged window's trail; the front one carries the product's sentence and an [OK]. On t1 they zoom shut into the front [OK].
  const NROWS = wrap(NOTICE, 152, 'chicago'), NW = 172, NH = 14 + NROWS.length * 14 + 34;
  function c8_casc(t, p0, p1, n, t0, t1) {
    if (t < t0 - 1e-6) return null;
    const pos = i => [R(lerp(p0[0], p1[0], n > 1 ? i / (n - 1) : 1)), R(lerp(p0[1], p1[1], n > 1 ? i / (n - 1) : 1))], at = i => t0 + i * (SPB / 2) / n;
    const m = Math.min(n, Math.floor((t - t0) / ((SPB / 2) / n) + 1e-6) + 1), [fx, fy] = pos(m - 1), ok = { x: fx + NW - 62, y: fy + NH - 30, w: 46, h: 18 };
    if (t >= t1) {
      const of = c8_fr(t, t1);
      if (of < 4) { const k = (of + 1) / 4; frame(R(lerp(fx, ok.x, k)), R(lerp(fy, ok.y, k)), R(lerp(NW, ok.w, k)), R(lerp(NH, ok.h, k)), BLK, 2); }
      return ok;
    }
    if (c8_fr(t, at(m - 1)) < 2) FX.shake = Math.max(FX.shake || 0, 2);
    for (let i = 0; i < m; i++) {
      const [X, y0] = pos(i), f = c8_fr(t, at(i)), Y = y0 + (f < 2 ? [-8, -3][f] : 0);
      rect(X, Y, NW, NH, BLK); frame(X + 3, Y + 3, NW - 6, NH - 6, FLD, 1);
      if (i < m - 1) { rect(X + 3, Y + 3, NW - 6, 14, FLD); continue; }   // the stale copies: only their title stripe
      NROWS.forEach((s, j) => text(s, X + 10, Y + 11 + j * 14, { font: 'chicago', color: FLD }));
      const oy = Y - y0;
      frame(ok.x - 3, ok.y - 3 + oy, ok.w + 6, ok.h + 6, FLD, 2); frame(ok.x, ok.y + oy, ok.w, ok.h, FLD, 1);
      text('OK', ok.x + ok.w / 2, ok.y + oy + 5, { font: 'chicago', color: FLD, align: 'center' });
    }
    return ok;
  }
  function c8_okClick(t, ok, st) {
    if (!ok || t < st) return;
    const f = c8_fr(t, st);
    if (f < 12) clickBurst(ok.x + 23, ok.y + 9, st, { pointer: false, color: VER, t });   // the click, in the writer's vermilion
    if (f < 4) { rect(ok.x, ok.y, ok.w, ok.h, FLD); text('OK', ok.x + 23, ok.y + 5, { font: 'chicago', color: BLK, align: 'center' }); }
  }
  // the Two Floppies bar: fills on 16ths, stops at 98.4%, one notch short (again)
  function c8_bar(t) {
    const sp = evList('riser').find(r => r[0] >= T0 && r[0] < T1) || [T1 - 2, T1], t0 = sp[0], n = Math.min(16, Math.max(0, Math.floor((t - t0) / (SPB / 4) + 1e-6) + 1));
    if (t < t0) return;
    const x = 8, y = H - 20, w = W - 16, ix = x + 34, iw = w - 38, k = n / 16 * .984, bytes = R(2902645 * n / 16);
    rect(x, y - 2, w, 16, BLK);
    rect(x + 6, y + 1, 18, 10, FLD); rect(x + 10, y + 1, 9, 4, BLK); rect(x + 16, y + 2, 2, 2, FLD); rect(x + 9, y + 7, 12, 4, BLK);
    rect(ix, y + 1, R(iw * k), 10, FLD);
    if (n >= 16 && (Math.floor(t * FPS) >> 2) & 1) frame(ix + R(iw * k), y + 1, iw - R(iw * k), 10, FLD);
    c8_dif(FLD, () => { text('TWO FLOPPIES', ix + 6, y + 2, { font: 'chicago', color: FLD }); text(c8_num(bytes) + ' / 2,949,120 B', ix + iw - 6, y + 2, { font: 'chicago', color: FLD, align: 'right' }); });
  }
  const c8_num = v => (v + '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  function c8_dif(c, fn) { ctx.save(); ctx.globalCompositeOperation = 'difference'; try { fn(); } finally { ctx.restore(); } }
  function c8_dith(k) {
    if (k <= 0) return; if (k >= 1) return rect(0, 0, W, H, BLK);
    const q = R(k * 16), w = Math.ceil(W / 2), h = Math.ceil(H / 2);
    ctx.drawImage(memo('c8d' + q + 'x' + W, w, h, () => bayer(0, 0, w, h, q / 16, BLK, null)), 0, 0, w * 2, h * 2);
  }

  // ===================================================================================================
  // 84.0 / 91.25: PEN PAL; the postmark (2009, then 2011) and the gang of twelve on the echo. From 92: the harmony twin.
  // ===================================================================================================
  function c8_penpal(t, La, Le, first) {
    const tt = first ? Math.max(t, T0) : t, pm = Le.words[0].start, pm2 = Le.words[1].start, mid = pm <= t && t < Le.end;
    const tw0 = first ? 20 : 190, PW = first ? 290 : 204, st = LE.words[3].start;
    const opt = { t: tt, justify: PW, fitH: H - 138, x: tw0, y: 54, valign: 'top', align: 'left' }, ol = w => !first && t >= La.words[w].start + SPB ? OUT : {};
    const lay = bigType(['PEN', 'PAL'], { ...opt, pass: 'slab', invert: false, slam: first ? T0 : null }), l0 = lay.lines[0];
    c8_base(t, first ? c8_mid(l0) : [l0.x + 4 * l0.sx, R(l0.y + l0.h / 2)], [2, 2]);
    let px = W - 56, py = 6, lift = 0, back = null, a;
    if (!first) c8_land0();
    if (!first && t < LE.start + 4 * F1) {   // the pointer flies home from LAND, in four frames, the pen swinging back to hang
      const k = (c8_fr(t, LE.start) + 1) / 4; a = lerp(PI, PI / 2, k); px = R(lerp(c8_ptL[0], px, k)); py = R(lerp(c8_ptL[1], py, k)); back = [px + 5, py + 24];
    }
    if (!first && t >= pm2) { const f = c8_fr(t, pm2); lift = [30, 90, 180][Math.min(2, f)]; py = 6 - Math.min(60, f * 20); }   // lifted out to carry left
    c8_rings(t, px, py);
    const so = { t: tt, words: La, ghost: true, scale: 3, min: 3, x: tw0, y: 18, valign: 'top', align: 'left', ...(!first && t >= La.words[3].start ? OUT : {}) };
    if (mid) c8_gang(t, pm, Le.end);   // the twelve behind, Clio haloed in front of them
    c8_clear([...bigType("I'M JUST YOUR", { ...so, pass: 'slab', invert: false }).lines, ...lay.lines], 12, () => {
      if (first) c8_dancer(W - 90, H - 8, 5, t);
      else {
        c8_dancer(W - 72, H - 8, 6, t);
        if (t >= st) { const f = c8_fr(t, st); c8_dancer(72, H - 8 + (f < 4 ? [96, 64, 32, 8][f] : 0), 5, t, { flip: true }); }   // THE HARMONY TWIN rises on the stab
      }
    });
    // the postmark in the clear lime: right of the type in 2009; in 2011 top left, over the twin, off the pen and the hero
    if (mid) c8_postmark(t, pm, first ? W - 160 : 104, first ? 104 : 96, t >= pm2, first ? ERA.snowleopard.year : ERA.lion.year, first ? 84 : 74, first ? 1 : -1);
    bigType("I'M JUST YOUR", so);
    if (first) bigType(['PEN', 'PAL'], { ...opt, words: La, ghost: true, slam: T0 });
    else c8_lines(['PEN', 'PAL'], { ...opt, words: La, ghost: true }, [{ stepIn: { t0: La.words[3].start, div: 4, enter: 'slam' }, ...ol(3) }, { stepIn: { t0: La.words[4].start, div: 4, enter: 'slam' }, ...ol(4) }]);
    if (!first && t < LE.start + 3 * F1) { const g = c8_land0(); bigType('LAND,', { ...g, ghost: BLK, words: { words: [{ w: 'land', start: 1e9 }] } }); }   // LAND, kept for one beat, dissolving
    if (mid && t >= pm2) c8_air();
    if (t < T0) return;   // under ch07's flood its own pen and pointer are the writer's
    const tip = c8_pen(t, px, py, { lift, back, a });
    c8_ripple(t, tip[0], tip[1]);
    c8_copies(t, px, py);
  }
  scene('ch08 pen pal', T0, LB.start, t => c8_penpal(t, LA, LAE, true), OPT);

  // ===================================================================================================
  // 85.75 / 93.75: I'LL NEVER HOLD THE PEN. Attempts 3 (and 4, 5: the twins) on "hold"; the notice CASCADE on "pen."
  // ===================================================================================================
  function c8_hold(t, L, mir, n) {
    const hold = L.words[2].start, pw = L.words[4].start, st = c8_stab(pw), J = mir ? W - 226 : W - 214;
    const opt = { t, words: L, ghost: true, justify: J, fitH: H - 24, x: mir ? W - 8 : 8, align: mir ? 'right' : 'left' };
    const inv = t >= pw && c8_fr(t, pw) < 2, need = (t >= pw && c8_fr(t, pw) < 4) || (t >= st && c8_fr(t, st) < 2), m = need ? c8_meas(["I'LL NEVER", 'HOLD', 'THE PEN.'], opt) : null;
    const penBox = m ? c8_box(m.letters.slice(-4)) : null, P1 = mir ? [20, H - NH - 4] : [W - 180, H - NH - 4];
    c8_base(t, t >= st ? null : penBox && c8_mid(penBox), [2, 2]);
    if (t >= st && c8_fr(t, st) < 3) FX.shake = 2;   // the click on [OK]: a jolt, not a punch (flash budget)
    punch(pw, ...(penBox ? c8_mid(penBox) : [W / 2, H / 2]), [3, 3, 2, 2], t);
    let px = mir ? 56 : W - 56, py = 6, lift = 0;
    if (t >= hold && t < st) {   // the yank (twice when both reach: one pen, two hands)
      const f = c8_fr(t, hold), two = mir && t >= hold + SPB / 2, f2 = c8_fr(t, hold + SPB / 2);
      lift = two ? (f2 < 2 ? [84, 78][f2] : 72) : f < 2 ? [48, 44][f] : 40; py = two ? -22 : -10;
    } else if (t >= st) { const f = c8_fr(t, st); lift = f < 4 ? [22, 8, -4, 0][f] : 0; }
    if (mir && t < L.start + 4 * F1) lift = [140, 70, 24, 0][c8_fr(t, L.start)] || 0;
    c8_rings(t, px, py);
    c8_clear(bigType(["I'LL NEVER", 'HOLD', 'THE PEN.'], { ...opt, pass: 'slab', invert: false }).lines, 12, () => {
      if (mir) { c8_dancer(30, H - 8, 4, t); c8_dancer(170, H - 8, 4, t); }
      else c8_dancer(W - 96, H - 8, 5, t);
    });
    if (inv) { rect(penBox.x - 2 * m.lines[2].sx, penBox.y - 2 * m.lines[2].sy, penBox.w + 4 * m.lines[2].sx, penBox.h + 4 * m.lines[2].sy, BLK); bigType(["I'LL NEVER", 'HOLD', 'THE PEN.'], { ...opt, xor: FLD }); }
    else bigType(["I'LL NEVER", 'HOLD', 'THE PEN.'], opt);
    const ok = c8_casc(t, mir ? [2, 4] : [W - 200, 4], P1, n, pw, st + 9 * F1);   // the clicked notice stays up 9 frames
    c8_okClick(t, ok, st);
    const tip = c8_pen(t, px, py, { lift });
    c8_ripple(t, tip[0], tip[1]);
    c8_copies(t, px, py);
  }
  scene('ch08 never hold', LB.start, LC.start, t => c8_hold(t, LB, false, 4), OPT);

  // ===================================================================================================
  // 88.0: YOU SAY WHERE I LAND, — she lands on the Project CD. 90.0: OR I FADE. — the writer's nib taps LAND, and keeps it.
  // ===================================================================================================
  const LX = W - 112, CDY = H - 24;
  let c8_l0 = null, c8_ptL = [0, 0];
  const c8_big = t => ({ t, words: LC, ghost: true, fit: 330, x: 8, align: 'left' });
  function c8_land0() {   // LAND, small in the bottom-left corner (its layout at scale 4)
    if (c8_l0) return c8_l0;
    const m = c8_meas('LAND,', { x: 12, y: H - 48, valign: 'top', align: 'left', scale: 4, min: 4, max: 4 });
    c8_ptL = [12 + m.w + 4 + 150, H - 48 + 18 - 20];
    return (c8_l0 = { x: 12, y: H - 48, valign: 'top', align: 'left', scale: 4, min: 4, max: 4, w: m.w, h: m.h });
  }
  function c8_cd(t, land) {   // the Project CD lying flat: a black ellipse, a lime hole, a lime glint going round one turn
    ell(LX, CDY, 92, 19, BLK); ell(LX, CDY, 70, 14, FLD); ell(LX, CDY, 68, 13, BLK); ell(LX, CDY, 16, 4, FLD); ell(LX, CDY, 6, 2, BLK);
    const k = Math.floor(prog(t, land, land + 2 * SPB) * 16) / 16, a = k * 2 * PI + PI / 2;
    if (t >= land) for (let j = 0; j < 4; j++) { const b = a + j * .1; rect(R(LX + Math.cos(b) * 44) - 4, R(CDY + Math.sin(b) * 9) - 2, 8, 4, FLD); }
  }
  function c8_land(t) {
    const where = LC.words[2].start, land = LC.words[4].start, fade = LD.words[2].start, faded = t >= LD.start, g = c8_land0();
    const ty = faded ? bigType(['OR I', 'FADE.'], { t, words: LD, pass: 'slab', fit: 230, x: 8, align: 'left', y: 112, valign: 'top' }) : bigType(['YOU SAY', 'WHERE I', 'LAND,'], { ...c8_big(t), pass: 'slab' });
    c8_base(t, c8_mid(ty.lines[faded ? 1 : 0]));
    let x = W - 40, o = { ground: false };
    if (t >= where && t < land) { const k = prog(t, where, land); x = R(lerp(W - 40, LX, easeOut(k))); o.pose = 'jump'; o.p = k; }
    else if (t >= land) { x = LX; if (t < land + SPB) { o.pose = 'cheer'; o.p = prog(t, land, land + SPB); } if (c8_fr(t, land) < 2) FX.shake = Math.max(FX.shake || 0, 2); }
    if (t >= where && t < land + 4 * F1) for (const dx of [0, 1]) dline(LX + dx, 44, LX + dx, CDY - 14, BLK, 4, 4);
    c8_cd(t, land);
    c8_dancer(x, CDY - 4, 8, t, o);
    // the pointer: the pen level over the spot; on "or" it swings to hang, then carries the pen to LAND, and the nib taps it
    const P0 = [LX - 158, 6], clk = LD.words[2].start + SPB / 2;
    let px = P0[0], py = P0[1], a = 0, back = null, kept = t >= clk;
    if (faded) {
      // down first with the pen hanging clear of the type, then it swings level onto LAND, in the last two steps
      const f = c8_fr(t, LD.start), k = Math.floor(prog(t, LD.words[1].start, clk - SPB / 4) * 6) / 6, ka = clamp(k * 3 - 2, 0, 1);
      a = f < 4 ? [.45, .95, 1.4, 1.75][f] : lerp(PI / 2, PI, ka);
      px = R(lerp(P0[0], c8_ptL[0], k)); py = R(lerp(P0[1], c8_ptL[1], Math.min(1, k * 1.5)));
      if (kept && c8_fr(t, clk) < 3) px -= 3;   // the tap
      back = f < 4 ? [px + 12 - R(7 * (f + 1) / 4), py + 22 + R(7 * (f + 1) / 4)] : [R(px + 5 - 9 * ka), R(py + 29 - 5 * ka)];
    }
    const Lw = () => bigType('LAND,', { ...g, outline: kept ? FLD : null, outlineW: .25 });
    if (faded) {
      const b = bigType(['OR I', 'FADE.'], { t, words: LD, ghost: true, fit: 230, x: 8, align: 'left', y: 112, valign: 'top' }), l = b.lines[1];
      c8_tag = [l.x + l.w - tw('TEMPORARY', 'chicago') - 8, l.y + l.h + 2 * l.sy];
      const f = c8_fr(t, LD.start), s = f < 4 ? null : 4;
      if (s) { if (!kept) Lw(); }
      else { const bl = c8_meas(['YOU SAY', 'WHERE I', 'LAND,'], c8_big(LD.start)).lines[2], k = (f + 1) / 4, sc = R(lerp(bl.sx, 4, k)); bigType('LAND,', { x: R(lerp(bl.x, g.x, k)), y: R(lerp(bl.y, g.y, k)), valign: 'top', align: 'left', scale: sc, min: sc, max: sc }); }
    } else bigType(['YOU SAY', 'WHERE I', 'LAND,'], c8_big(t));
    const fd = fade + 3 * F1;   // FADE. lands solid for 3 frames, then the field dithers out
    if (t >= fd) c8_dith(Math.min(1, (Math.floor((t - fd) / (SPB / 4) + 1e-6) + 1) * .2));
    if (t >= fade && t < LD.end) { const [tx, ty2] = c8_tag, w = tw('TEMPORARY', 'chicago') + 8; rect(tx, ty2, w, 15, BLK); text('TEMPORARY', tx + 4, ty2 + 3, { font: 'chicago', color: FLD }); }
    if (kept) {   // the click: a vermilion burst at the nib and a vermilion selection box that snaps round LAND, and stays
      clickBurst(c8_ptL[0] - 150, c8_ptL[1] + 20, clk, { pointer: false, color: VER, t, scale: 1.6 });
      const f = c8_fr(t, clk), p = f < 3 ? [16, 11, 7][f] : 5;
      frame(g.x - p - 2, g.y - p - 2, g.w + 2 * p + 4, g.h + 2 * p + 4, VER, 3); Lw();
    }
    const tip = c8_pen(t, px, py, { a, back, sag: faded ? 22 : 6, down: kept && c8_fr(t, clk) < 5 });
    if (!kept) c8_rings(t, px, py);
    c8_ripple(t, tip[0], tip[1]);
    c8_copies(t, px, py);
  }
  let c8_tag = [0, 0];
  scene('ch08 land', LC.start, LE.start, c8_land, OPT);

  scene('ch08 harmony', LE.start, LF.start, t => { invertFrame(LE.start, 1, t); c8_penpal(t, LE, LEE, false); }, OPT);
  scene('ch08 never hold 2', LF.start, LG.start, t => c8_hold(t, LF, true, 8), OPT);

  // ===================================================================================================
  // 96.0: WHO HOLDS THE PEN? — the pen level across the top; the twins point up at it
  // ===================================================================================================
  scene('ch08 who', LG.start, LH.start, t => {
    const opt = { t, words: LG, ghost: true, justify: W - 252, fitH: H - 60, x: 8, y: 46, valign: 'top', align: 'left', ...OUT }, ws = LG.words;
    const lay = bigType(['WHO', 'HOLDS', 'THE PEN?'], { ...opt, pass: 'slab', invert: false });
    c8_base(t, c8_mid(lay.lines[2]));
    const px = 56, py = 6, g = c8_sig(t), up = g ? {} : { pose: 'pointUp', p: beatPhase(t) };
    c8_rings(t, px, py);
    c8_clear(lay.lines, 14, () => { c8_dancer(W - 194, H - 8, 4, t, { flip: true, ...up }); c8_dancer(W - 64, H - 8, 5, t, up); });
    c8_lines(['WHO', 'HOLDS', 'THE PEN?'], opt, [{ stepIn: { t0: ws[0].start, div: 4, enter: 'slam' } }, { stepIn: { t0: ws[1].start, div: 8, enter: 'slam' } }, { stepIn: { t0: ws[2].start, div: 8, enter: 'slam' } }]);
    const bob = R(2 * pulse(t, 1, 6)), tip = c8_pen(t, px, py, { a: 0, back: [W - 220, 28 + bob], sag: 3, cs: 2 });
    c8_ripple(t, tip[0], tip[1]);
    c8_copies(t, px, py);
  }, OPT);

  // ===================================================================================================
  // 98.0: YOU DO! YOU DO! (shared with the dive's outer frame), the twins, the Two Floppies bar
  // ===================================================================================================
  const c8_you2 = LH.words[2].start;
  const c8_yopt = t => t < c8_you2 ? { t, words: LH, justify: 290, fitH: H - 44, x: 16, align: 'left', y: R((H - 24) / 2), slam: LH.start }
    : { t, words: { words: LH.words.slice(2) }, justify: 296, fitH: H - 64, x: 16, align: 'left', y: R((H - 24) / 2), slam: LH.words[3].start };
  let c8_hero = null;
  function c8_youDo(t) {
    const o = c8_yopt(t), lay = bigType(['YOU', 'DO!'], { ...o, pass: 'slab', invert: false });
    c8_base(t, c8_mid(lay.lines[0]));
    const px = W - 56, py = 6;
    c8_rings(t, px, py);
    c8_clear(lay.lines, 14, () => {
      c8_dancer(W - 34, H - 8, 5, t, { flip: true });
      c8_hero = c8_dancer(W - 160, H - 21, 7, t, { ground: false, ...(t >= c8_you2 ? { eyes: 'dot' } : {}) });
    });
    c8_bar(t);
    if (c8_fr(t, c8_you2) === 0) { const l = lay.lines[0]; rect(l.x - 2 * l.sx, l.y - 2 * l.sy, l.w + 4 * l.sx, l.h + 4 * l.sy, BLK); bigType(['YOU', 'DO!'], { ...o, xor: FLD }); }
    else bigType(['YOU', 'DO!'], o);
    c8_pen(t, px, py);
    c8_copies(t, px, py);
  }
  scene('ch08 you do', LH.start, DIVE0, c8_youDo, OPT);

  // ===================================================================================================
  // 99.625: DIVE 2, the whip into the hero's EYE: the eye is a lime block, and inside the lime the magenta post-chorus grows
  // ===================================================================================================
  let c8_eyeF = null;
  function c8_eye() {   // render the outer frame once, find the hero's two 2x3-unit eye cut-outs, take the one nearer the centre
    if (c8_eyeF) return c8_eyeF;
    const c = frameInto(styleBuf('c8E'), DIVE0, c8_youDo, { era: 'lion', raw: true, screen: true }), d = new Uint32Array(c.getContext('2d').getImageData(0, 0, FW, FH).data.buffer);
    const sz = screenSize(DIVE0), [hx, hy] = c8_hero.head.map((v, i) => v + (i ? sz.y : sz.x)), s = 7, px = (x, y) => d[y * FW + x] & 0xffffff, [fr, fg, fb] = rgb(FLD), F = fr | fg << 8 | fb << 16, K = 0;
    let best = null;
    for (let y = hy; y < hy + 14 * s && y < FH; y++) for (let x = Math.max(1, hx - 14 * s); x < Math.min(FW - 1, hx + 14 * s); x++) {
      if (px(x, y) !== F || px(x - 1, y) !== K || px(x, y - 1) !== K) continue;
      let w = 0; while (px(x + w, y) === F) w++;
      let h = 0; while (y + h < FH && px(x, y + h) === F) h++;
      if (w === 2 * s && h >= 2 * s && px(x + w, y) === K) { const dd = Math.abs(x - FW / 2); if (!best || dd < best.d) best = { x, y: y + R((h - w) / 2), d: dd }; }
    }
    return (c8_eyeF = best ? { x: best.x, y: best.y, w: 2 * s } : { x: hx + sz.x, y: hy + 10, w: 14 });
  }
  scene('ch08 dive', DIVE0, T1, t => {
    const D = c8_eye(), pw = D.w;
    diveInto(DIVE0, T1, D.x, D.y, c8_youDo, 'ch08 lala3', { pw, color: FLD, power: 2, innerAt: 2 * pw, revealAt: 4 * pw + 60, outer: { era: 'lion', raw: true, screen: true }, inner: { era: 'yosemite', raw: true, screen: true } });
    const k = prog(t, DIVE0, T1), ZH = FH / pw, zz = clamp(Math.exp(k * k * Math.log(ZH)), 1, ZH), zi = zz < 8 ? zz : Math.min(ZH, R(zz)), bs = zi * pw;
    const f = Math.log(zz) / Math.log(ZH), pan = 1 - (1 - f) ** 3, bx = R(lerp(D.x + pw / 2, FW / 2, pan) - bs / 2), by = R(lerp(D.y + pw / 2, FH / 2, pan) - bs / 2), B = R(bs);
    for (const b of evTimes('bell').filter(b => b >= DIVE0 && b < T1)) { const fr = c8_fr(t, b); if (fr >= 0 && fr < 3) { const g = 3 + fr * 4; frame(bx - g, by - g, B + 2 * g, B + 2 * g, WHT, 2); } }
  }, { era: 'lion', raw: true });

  // ===================================================================================================
  // 100.0: POST-CHORUS 2, magenta: the record, the la-la line with THE BOUNCING PEN, the gang of twelve singing under it
  // ===================================================================================================
  const ROWY = 185, NIB = [W - 51, 181];
  // each LA lands solid on its note with no overshoot (a stretched slam fused L and A into "LH"): its start is moved 6 frames back once sung
  const c8_rowO = (q, t) => ({ t, words: { ...q, words: q.words.map(w => t >= w.start ? { ...w, start: w.start - 6 / FPS } : w) }, ghost: true, fit: 510, stretch: [1, 2], x: 14, y: ROWY, valign: 'top', align: 'left' });
  let c8_tg = null;
  function c8_targets() {   // the top-centre of each LA: where the nib taps
    if (c8_tg) return c8_tg;
    const m = c8_meas(Q7.text.toUpperCase(), c8_rowO(Q7, 0)), out = []; let i = 0;
    Q7.text.toUpperCase().split(' ').forEach(w => { const ls = m.letters.slice(i, i + w.length).filter(l => /[A-Z]/.test(l.ch)); i += w.length; const b = c8_box(ls); out.push([R(b.x + b.w / 2), b.y - 1]); });
    return (c8_tg = out);
  }
  function c8_keys() {
    const tg = c8_targets(), k = [[DIVE0 + SPB / 4, NIB[0], NIB[1]]];
    for (const q of [Q7, Q8]) q.words.forEach((w, i) => k.push([w.start, ...tg[i]]));
    k.push([Q8.words[6].start + SPB / 2, NIB[0], NIB[1]]);
    return k;
  }
  function c8_bounce(t) {   // a whole-pixel parabola in 8 steps per hop, the nib landing on each note
    const K = c8_keys();
    if (t <= K[0][0]) return null;
    for (let j = 0; j < K.length - 1; j++) if (t < K[j + 1][0]) {
      const [t0, x0, y0] = K[j], [t1, x1, y1] = K[j + 1], k = Math.floor(prog(t, t0, t1) * 8) / 8, hgt = j === K.length - 2 ? 90 : clamp(Math.abs(x1 - x0) / 3 + 18, 24, 80);
      return [R(lerp(x0, x1, k)), R(lerp(y0, y1, k) - hgt * 4 * k * (1 - k))];
    }
    return 'home';
  }
  function c8_record(t) {   // One More Tune's white label, black: only its eleventh groove pulses, on the riff notes
    const cx = 96, cy = 46, e = evLast('riff', t), on = e && e[0] >= P2.start && c8_fr(t, e[0]) < 4;
    ctx.drawImage(memo('c8rec' + on, 240, 160, () => { disc(cx, cy, 98, BLK); ring(cx, cy, 64, MAG, on ? 4 : 2); disc(cx, cy, 28, MAG); text('11', cx, cy - 6, { font: 'chicago', scale: 2, color: BLK, align: 'center' }); line(cx + 126, 4, cx + 52, cy + 40, BLK, 6); rect(cx + 44, cy + 34, 16, 12, BLK); disc(cx + 126, 4, 10, BLK); }), 0, 0);
    const a = Math.floor(beatAt(t) * 4) * PI / 8; rect(R(cx + Math.cos(a) * 22) - 2, R(cy + Math.sin(a) * 22) - 2, 4, 4, BLK);
  }
  function c8_post(t) {
    const q = t < Q8.start ? Q7 : Q8, px = W - 56, py = 6, pin = t >= Q8.words[6].start + SPB / 2, tq = pin ? Q8.words[6].start : t;
    rect(0, 0, W, H, MAG);
    if (t >= P2.start) { invertFrame(P2.start, 1, t); splitPal(2, P2.start, 3, [WHT, BLK], t); beatFX(t, { snare: false }); punch(P2.start, ...c8_targets()[0], [2, 2], t); }
    c8_record(t);
    const e = evLast('clap', t); if (e && e[0] >= P2.start && c8_fr(t, e[0]) < 14) clickBurst(px, py, e[0], { pointer: false, color: BLK, t });
    const b = c8_bounce(t), tap = b && b !== 'home' && q.words.find(w => c8_fr(t, w.start) >= 0 && c8_fr(t, w.start) < 3);
    if (tap) ring(b[0], b[1], 6 + 4 * c8_fr(t, tap.start), WHT, 2);
    bigType(q.text.toUpperCase(), c8_rowO(q, t));
    // the gang sings along: bounce, mouths on every la; a chop throws E / A and inverts their heads in a ripple
    const ch = evLast('chop', t), cw = evLast('chopWord', t), cf = ch && ch[0] >= P2.start && t < ch[0] + ch[1] ? c8_fr(t, ch[0]) : -1;
    // the hero above the row, singing too: every chop inverts her head for two frames
    const hd = c8_dancer(420, ROWY - 8, 4, t, { field: MAG, pose: 'bounce', voice: 'choir', ground: false, ...(cf >= 0 ? { mouth: { open: .8, shape: cw && cw[2] === 'pen' ? 'E' : 'A' } } : {}) });
    if (cf >= 0 && cf < 2) c8_dif(MAG, () => rect(hd.head[0] - 52, hd.head[1] - 8, 104, 88, MAG));
    for (let i = 0; i < 12; i++) {
      const d = c8_dancer(20 + i * 52, H + 8, 2, t, { field: MAG, pose: (i + Math.floor(beatAt(t))) & 1 ? 'clap' : 'bounce', voice: 'choir', ground: false, ...(cf >= 0 ? { mouth: { open: .8, shape: cw && cw[2] === 'pen' ? 'E' : 'A' } } : {}) });
      if (cf >= 0 && cf === i >> 1) c8_dif(MAG, () => rect(d.head[0] - 26, d.head[1] - 4, 52, 44, MAG));
    }
    // the riser into the bridge: "Loading twelve appearances…"
    const sp = evSpan('riser', t);
    if (sp && sp[0] >= P2.start) {
      const n = Math.min(16, Math.floor((t - sp[0]) / (SPB / 4) + 1e-6) + 1), x = 8, y = 286, w = W - 16, sh = t > sp[1] - SPB ? (c8_fr(t, sp[0]) & 1) : 0;
      rect(x + sh, y, w, 16, BLK); rect(x + 3 + sh, y + 3, R((w - 6) * n / 16), 10, MAG);
      c8_dif(MAG, () => { text('Loading twelve appearances…', x + 8 + sh, y + 4, { font: 'chicago', color: MAG }); text(R(n / 16 * 100) + '%', x + w - 8 + sh, y + 4, { font: 'chicago', color: MAG, align: 'right' }); });
    }
    // the pen: hops LA to LA; then home to the rig, frozen there for the drain
    if (b && b !== 'home') {
      penCord([[px + 5, py + 15], [b[0], b[1] - 146]], { sag: 4, swing: 0, t });
      ctx.drawImage(c8_spr(PI / 2, evFrames('kick', t) === 0), b[0] - 160, b[1] - 160);
      CUR = { x: px, y: py, kind: 'arrow' };
    } else c8_pen(tq, px, py, { flash: !pin });
    if (t >= P2.start) c8_copies(t, px, py);
  }
  scene('ch08 lala3', P2.start, Q8.start, c8_post, { era: 'yosemite', raw: true, screen: true });
  scene('ch08 lala4', Q8.start, DR0, c8_post, { era: 'yosemite', raw: true, screen: true });

  // ===================================================================================================
  // 103.833: the drain: the magenta sucks back into the nib in 10 hard steps over the 1988 desk of the bridge
  // ===================================================================================================
  const NIBF = [573, 183];
  scene('ch08 drain', DR0, P2.end, t => {
    ctx.drawImage(memo('c8drainA', FW, FH, () => ctx.drawImage(frameInto(styleBuf('c8A'), DR0, 'ch08 lala4'), 0, 0)), 0, 0);   // frozen: the pen is home
    inkFlood(DR0, P2.end, NIBF[0], NIBF[1], tt => { if (c8_has('ch09 tunnel')) ctx.drawImage(frameInto(styleBuf('c8B'), tt, 'ch09 tunnel'), 0, 0); else rect(0, 0, FW, FH, BLK); }, { drain: true, steps: 10, seed: 5 });
    pixelSort(20, 260, null, 1);
  }, { era: 'yosemite', raw: true });
  warmUp(() => { _floodMap(NIBF[0], NIBF[1], 4, 5); for (const a of [0, PI / 2]) for (const fl of [false, true]) c8_spr(a, fl); });
}
