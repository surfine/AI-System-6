// ch04 · chorus 1: ONE (36-52) · magenta · 1991. One dancer, one pen, one notice; the dive into the "!".
'use strict';
{
  const LA = lyric('chorus1a'), LAE = lyric('chorus1a_echo'), LB = lyric('chorus1b'), LC = lyric('chorus1c'), LD = lyric('chorus1d'),
    LE = lyric('chorus1e'), LEE = lyric('chorus1e_echo'), LF = lyric('chorus1f'), LG = lyric('chorus1g'), LH = lyric('chorus1h');
  const SEC = section('chorus1'), T0 = SEC.start, T1 = SEC.end, DIVE0 = T1 - 3 / 8;
  const FLD = FIELDS.magenta, BLK = C.black, WHT = C.white, PI = Math.PI, F1 = 1 / FPS;
  const NOTICE = 'The drafting manuscript is read-only; use the current Section Draft instead.';
  const SIGL = [LA, LAE, LB, LC, LD, LE, LEE, LF, LG, LH];
  const STABS = evTimes('stab'), BELLS = evTimes('bell').filter(b => b >= T0 && b < DIVE0);
  const c4_f = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
  const c4_fr = (t, at) => Math.floor((t - at) * FPS + 1e-6);
  const c4_stab = after => STABS.find(s => s > after);   // the first stab after a time

  // ---- THE SIGNATURE MOVE: pen = the scribble, pal = the wave, You = the point, do! = the pen point; crash = star jump ----
  function c4_sig(t) {
    if (evSince('crash', t) < SPB * .9) return null;
    for (const L of SIGL) for (const w of L.words) if (t >= w.start && t < w.end) {
      const f = c4_f(w.w), st = evSince('stab', t);
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
  function c4_scrib(d, k, s) {
    const h = d.hands[0][1] < d.hands[1][1] ? d.hands[0] : d.hands[1], dir = h[0] < d.head[0] ? -1 : 1, u = Math.max(2, R(s * .8)), lw = Math.max(2, R(s / 2));
    const n = Math.min(3, Math.floor(k / (SPB / 4) + 1e-6) + 1);
    for (const [c, w] of [[FLD, lw + 4], [BLK, lw]]) for (let i = 0; i < n; i++) {
      const ox = h[0] + dir * (1 + i * 2) * u, oy = h[1] - (4 + i * 5) * u;
      for (let j = 0; j < 4; j++) line(ox + dir * j * 2 * u, oy - (j & 1) * 3 * u, ox + dir * (j + 1) * 2 * u, oy - ((j + 1) & 1) * 3 * u, c, w);
    }
  }
  function c4_dancer(x, y, s, t, o = {}) {
    const g = o.pose ? null : c4_sig(t);
    const d = clioDance(x, y, s, t, { field: FLD, lyric: false, ...(g ? { pose: g.pose, p: g.p } : {}), ...o });
    if (g && g.k != null) c4_scrib(d, g.k, s);
    return d;
  }

  // ---- the writer: the pointer holds the white pen on its cord. Hanging: the nib at (px + 5 + swing, py + 175) ----
  function c4_pen(t, px, py, o = {}) {
    const sw = o.still ? 0 : R(10 * Math.sin(beatPhase(t, 2) * PI * 2)), a = o.a ?? PI / 2, lift = R(o.lift || 0);
    const [bx, by] = o.back || (a > 1.2 ? [px + 5 + sw, py + 29 - lift] : [px + 12, py + 22]);
    const tip = [R(bx + Math.cos(a) * 146), R(by + Math.sin(a) * 146)];
    penCord([[px + 5, py + 15], [bx, Math.max(py + 17, by - 2)]], { sag: o.sag ?? 22, swing: o.cs ?? 4, t });
    if (a === 0 || a === PI / 2) {   // the two rest angles come from a cached sprite (a scale-4 pen costs ~3 ms to fill)
      const fl = !!fieldAt(t) && evFrames('kick', t) === 0;
      ctx.drawImage(memo('c4pen' + a + fl, 320, 320, () => pen(160, 160, a, 4, { t: fl ? T0 : T0 + .1, flash: fl })), tip[0] - 160, tip[1] - 160);
    } else pen(tip[0], tip[1], a, 4, { t });
    CUR = { x: px, y: py, kind: 'arrow' };
    return tip;
  }
  // white rings rippling from the nib on the "pen" bells
  function c4_ripple(t, x, y) {
    for (const b of BELLS) { const d = t - b; if (d < 0 || d >= .4) continue; for (let j = 0; j < 2; j++) { const dd = d - j * .1; if (dd >= 0) ring(x, y, 10 + 4 * Math.floor(dd * 40), WHT, 2); } }
  }
  // every clap: three square rings at the pointer (drawn under the type) and two stamped pointer copies (drawn last)
  function c4_rings(t, px, py) { const e = evLast('clap', t); if (e && e[0] >= T0 && c4_fr(t, e[0]) < 14) clickBurst(px, py, e[0], { pointer: false, color: BLK, t }); }
  function c4_copies(t, px, py) { const e = evLast('clap', t); if (e && e[0] >= T0 && c4_fr(t, e[0]) < 5) for (let i = 2; i >= 1; i--) pointer(px + 7 * i, py + 4 * i, 'arrow', { down: true }); }

  // the frame every chorus scene starts with: the field, the owed landing, the sub nudge, the beat FX
  function c4_base(t, hero, steps) {
    rect(0, 0, W, H, FLD);
    if (evFrames('sub', t) === 0) FX.dy = 1;
    beatFX(t, { kick: t >= T0 + SPB });   // no invert on the landing: ch03's flood already flashes (flash budget)
    const e = evLast('stab', t); if (e && e[0] >= T0 && hero) punch(e[0], ...hero, steps, t);
  }
  // layout only (no drawing), with letter boxes: bigType into a scratch canvas
  let c4_sc = null;
  function c4_meas(str, o) { let r; c4_sc = c4_sc || Object.assign(document.createElement('canvas'), { width: 8, height: 8 }); offscreen(8, 8, () => { r = bigType(str, o); }, c4_sc); return r; }
  // a block drawn a line at a time (same layout as one call), so each line can step in on its own word
  function c4_lines(lines, o, per, ov = {}) {
    const m = bigType(lines, { ...o, pass: 'slab', invert: false });
    return m.lines.map((l, i) => bigType(lines[i], { ...o, fitH: 0, ...per[i], ...ov, x: l.x, y: l.y, valign: 'top', align: 'left', min: l.sy, max: l.sy }));
  }
  // poster type in three passes: a 2 px field halo (black type stays readable where it crosses Clio), the unsung letters
  // as a 1x1 checker ghost (stems stay whole at phone size), then the sung letters solid. draw(ov): the block, ov on top
  let c4_cv = null;
  const C4_ALL = { t: 1e4, slam: null, stepIn: null, words: null, ghost: false };
  function c4_type(draw) {
    const c = c4_cv = c4_cv && c4_cv.width === W && c4_cv.height === H ? c4_cv : Object.assign(document.createElement('canvas'), { width: W, height: H });
    let m; offscreen(W, H, () => { ctx.clearRect(0, 0, W, H); draw({ ...C4_ALL, color: FLD }); m = [draw({ ghost: false, color: FLD })].flat(2); }, c);
    const ls = m.flatMap(b => b.letters), off = ls.filter(l => !l.on), x0 = Math.max(0, Math.min(...ls.map(l => l.x)) - 48), y0 = Math.max(0, Math.min(...ls.map(l => l.y)) - 48);
    const bw = Math.min(W, Math.max(...ls.map(l => l.x + l.w)) + 48) - x0, bh = Math.min(H, Math.max(...ls.map(l => l.y + l.h)) + 64) - y0;
    if (bw > 0 && bh > 0) for (const dx of [-2, 2]) for (const dy of [-2, 2]) ctx.drawImage(c, x0, y0, bw, bh, x0 + dx, y0 + dy, bw, bh);
    if (off.length) {   // the ghost: the whole block, kept only inside the unsung letters' boxes, through a 1x1 checker
      offscreen(W, H, () => {
        ctx.clearRect(0, 0, W, H); draw(C4_ALL);
        ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = bayerPat(.5, BLK, null);
        ctx.beginPath(); for (const l of off) ctx.rect(l.x, l.y - R(l.h / 9), l.w, R(l.h * 14 / 9)); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }, c);
      ctx.drawImage(c, x0, y0, bw, bh, x0, y0, bw, bh);
    }
    return draw({ ghost: false });
  }
  const c4_box = ls => { const x0 = Math.min(...ls.map(l => l.x)), y0 = Math.min(...ls.map(l => l.y)); return { x: x0, y: y0, w: Math.max(...ls.map(l => l.x + l.w)) - x0, h: Math.max(...ls.map(l => l.y + l.h)) - y0 }; };
  const c4_mid = b => [R(b.x + b.w / 2), R(b.y + b.h / 2)];

  // ---- props ----
  // the postmark: a black rubber stamp, "(PEN PAL)" round its rim, the year in the middle, two wavy cancel bars
  function c4_postmark(t, t0, cx, cy, bars) {
    const fr = c4_fr(t, t0); if (fr < 0) return;
    const r = 84 + [12, 7, 3, 0][Math.min(fr, 3)], yr = String(ERA.system7.year), s = 'PEN PAL';
    if (fr < 2) FX.shake = Math.max(FX.shake || 0, 3 - fr);
    if (bars) for (const dy of [-16, 4]) for (let x = cx + r - 6; x < W + 4; x += 4) rect(x, cy + dy + R(4 * Math.sin((x - cx) / 11)), 4, 8, BLK);
    disc(cx, cy, r, BLK); ring(cx, cy, r - 7, FLD, 2); ring(cx, cy, r - 12, FLD, 1);
    ctx.drawImage(memo('c4rim' + r, 2 * r, 2 * r, () => c4_rim('(' + s + ')', r, r, r - 23)), cx - r, cy - r);
    text(yr, cx, cy - 10, { font: 'chicago', scale: 3, color: FLD, align: 'center' });
    rect(cx - 44, cy + 36, 88, 2, FLD); rect(cx - 30, cy + 42, 60, 2, FLD);
  }
  // rubber-stamp rim lettering: each Chicago 2x glyph spaced by its width along the top arc and turned to face out
  // (inverse-mapped pixel by pixel, so it stays hard)
  function c4_rim(str, cx, cy, rr) {
    const ws = [...str].map(c => tw(c, 'chicago') + 1), tot = ws.reduce((a, b) => a + b, 0);
    let acc = 0;
    [...str].forEach((c, i) => {
      const a = -PI / 2 + (2 * (acc + ws[i] / 2) - tot) / rr; acc += ws[i];
      if (c === ' ') return;
      const g = offscreen(16, 20, () => text(c, 8, 6, { font: 'chicago', color: BLK, align: 'center' })), d = g.getContext('2d').getImageData(0, 0, 16, 20).data;
      const ux = Math.cos(a), uy = Math.sin(a), gx = cx + ux * rr, gy = cy + uy * rr;
      for (let y = -16; y <= 16; y++) for (let x = -16; x <= 16; x++) {   // screen offset -> glyph pixel (right = (-uy, ux), down = -up)
        const u = Math.floor((x * -uy + y * ux) / 2 + 8), v = Math.floor((x * -ux + y * -uy) / 2 + 10.5);
        if (u >= 0 && u < 16 && v >= 0 && v < 20 && d[(v * 16 + u) * 4 + 3] > 0) rect(R(gx) + x, R(gy) + y, 1, 1, FLD);
      }
    });
  }
  // the airmail border: an 8 px diagonal stripe, field and black, round the frame edge
  function c4_air() {
    ctx.drawImage(memo('c4air' + W + 'x' + H, W, H, () => {
      for (let y = 0; y < H; y++) {
        const edge = y < 8 || y >= H - 8;
        for (let x = -16 + ((y % 16)); x < W; x += 16) { if (edge) rect(x, y, 8, 1, BLK); else { if (x < 8) rect(Math.max(0, x), y, Math.min(8, x + 8) - Math.max(0, x), 1, BLK); if (x + 8 > W - 8) rect(Math.max(W - 8, x), y, x + 8 - Math.max(W - 8, x), 1, BLK); } }
      }
    }), 0, 0);
  }
  // the read-only notice as a black slab: the product's sentence in field cut-out Chicago 2x on two lines, the [OK]
  // on a tab under one end (lf: the left); n copies trail (8, 6). Up from t0; zooms shut into its [OK] before t1
  function c4_notice(t, x, y, n, t0, t1, lf) {
    const fr = c4_fr(t, t0), w = W - 24, h = 72, tx = lf ? x : x + w - 80, ok = { x: tx + 12, y: y + 76, w: 56, h: 30 };
    if (fr < 0 || t >= t1) return null;
    const of = c4_fr(t, t1 - 4 * F1);
    if (of >= 0) { const k = (of + 1) / 5; frame(R(lerp(x, ok.x, k)), R(lerp(y, ok.y, k)), R(lerp(w, ok.w, k)), R(lerp(h, ok.h, k)), BLK, 3); return null; }
    const dy = fr < 2 ? [-10, -4][fr] : 0;
    if (fr < 2) FX.shake = Math.max(FX.shake || 0, 2);
    for (let i = n - 1; i >= 0; i--) {
      const X = x + 8 * i, Y = y + 6 * i + dy, TX = tx + 8 * i, TY = Y + h - 6;
      rect(X, Y, w, h, BLK); frame(X + 3, Y + 3, w - 6, h - 6, FLD, 1);
      rect(TX, TY, 80, 48, BLK); vline(TX + 3, TY + 2, 43, FLD); vline(TX + 76, TY + 2, 43, FLD); hline(TX + 3, TY + 44, 74, FLD);
      if (i) continue;
      wrap(NOTICE, 520, 'chicago', 2).forEach((s, j) => text(s, X + 13, Y + 13 + j * 30, { font: 'chicago', scale: 2, color: FLD }));
      frame(ok.x - 3, ok.y - 3 + dy, ok.w + 6, ok.h + 6, FLD, 2); frame(ok.x, ok.y + dy, ok.w, ok.h, FLD, 1);
      text('OK', ok.x + ok.w / 2, ok.y + dy + 6, { font: 'chicago', scale: 2, color: FLD, align: 'center' });
    }
    return ok;
  }
  // the Two Floppies bar: fills on 16ths, stops at 98.4%, one notch short; the count cut out
  function c4_bar(t) {
    const sp = evList('riser').find(r => r[0] >= T0 && r[0] < T1) || [T1 - 2, T1], t0 = sp[0], n = Math.min(16, Math.max(0, Math.floor((t - t0) / (SPB / 4) + 1e-6) + 1));
    if (t < t0) return;
    const x = 8, y = H - 20, w = W - 16, h = 16, ix = x + 34, iw = w - 38, k = n / 16 * .984, bytes = R(2902645 * n / 16);
    rect(x, y - 2, w, h, BLK);
    rect(x + 6, y + 1, 18, 10, FLD); rect(x + 10, y + 1, 9, 4, BLK); rect(x + 16, y + 2, 2, 2, FLD); rect(x + 9, y + 7, 12, 4, BLK);   // a floppy
    rect(ix, y + 1, R(iw * k), 10, FLD);
    if (n >= 16 && (Math.floor(t * FPS) >> 2) & 1) frame(ix + R(iw * k), y + 1, iw - R(iw * k), 10, FLD);
    const s = (bytes + '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' / 2,949,120 B', fx = ix + R(iw * k);
    for (const [cx0, cw, c] of [[ix, fx - ix, BLK], [fx, W - fx, FLD]]) if (cw > 0) clipRect(cx0, y - 2, cw, h, () => {   // black on the fill, field on the bar
      text('TWO FLOPPIES', ix + 6, y + 2, { font: 'chicago', color: c }); text(s, ix + iw - 6, y + 2, { font: 'chicago', color: c, align: 'right' });
    });
  }
  // the fade: everything goes to black in 2x2 cells
  function c4_dith(k) {
    if (k <= 0) return; if (k >= 1) return rect(0, 0, W, H, BLK);
    const q = R(k * 16), w = Math.ceil(W / 2), h = Math.ceil(H / 2);
    ctx.drawImage(memo('c4d' + q + 'x' + W, w, h, () => bayer(0, 0, w, h, q / 16, BLK, null)), 0, 0, w * 2, h * 2);
  }

  // ===================================================================================================
  // 36.0 / 43.25: PEN PAL (and the postmark on the echo)
  // ===================================================================================================
  function c4_penpal(t, La, Le, first) {
    const tt = Math.max(t, La === LA ? T0 : La.start), PW = 300;
    const opt = { t: tt, justify: PW, fitH: H - 92, x: 20, y: 56, valign: 'top', align: 'left' };
    const lay = bigType(['PEN', 'PAL'], { ...opt, pass: 'slab', invert: false, slam: first ? T0 : null });
    const l0 = lay.lines[0];
    c4_base(t, first ? c4_mid(l0) : [l0.x + 4 * l0.sx, R(l0.y + l0.h / 2)], [2, 2]);
    const pm = wordAt(Le, 0).start, pm2 = wordAt(Le, 1).start, mid = pm <= t && t < Le.end;
    let px = W - 56, py = 6, lift = 0;
    if (!first && t >= pm2) { const f = c4_fr(t, pm2); lift = [30, 90, 180][Math.min(2, f)] + 0; py = 6 - Math.min(60, f * 20); }   // the writer lifts the pen out of frame to carry it left
    c4_rings(t, px, py);
    c4_dancer(W - 90, H - 8, 5, t);
    c4_type(ov => [
      bigType("I'M JUST YOUR", { t: tt, words: La, ghost: true, scale: 3, min: 3, x: 20, y: 18, valign: 'top', align: 'left', ...ov }),
      first ? bigType(['PEN', 'PAL'], { ...opt, words: La, ghost: true, slam: T0, ...ov })
        : c4_lines(['PEN', 'PAL'], { ...opt, words: La, ghost: true }, [{ stepIn: { t0: wordAt(La, 'pen').start, div: 4, enter: 'slam' } }, { stepIn: { t0: wordAt(La, 'pal').start, div: 4, enter: 'slam' } }], ov)]);
    if (mid) c4_postmark(t, pm, W - 176, 96, t >= pm2);   // the stamp lands on top of her: the year always reads
    if (mid && t >= pm2) c4_air();
    if (t < T0) return;   // under ch03's flood its own pen and pointer are the writer's
    const tip = c4_pen(t, px, py, { lift });
    c4_ripple(t, tip[0], tip[1]);
    c4_copies(t, px, py);
  }
  scene('ch04 pen pal', T0, LB.start, t => c4_penpal(t, LA, LAE, true), { era: 'system7', raw: true, screen: true });

  // ===================================================================================================
  // 37.75 / 45.75: I'LL NEVER HOLD THE PEN. Attempt on "hold" (the pen yanks up), the notice slams on her on "pen."
  // ===================================================================================================
  function c4_hold(t, L, mir, n) {
    const hold = wordAt(L, 'hold').start, pw = wordAt(L, -1).start, st = c4_stab(pw), J = mir ? W - 204 : W - 190;
    const opt = { t, words: L, ghost: true, justify: J, fitH: H - 24, x: mir ? W - 8 : 8, align: mir ? 'right' : 'left' };
    const inv = t >= pw && c4_fr(t, pw) < 2, need = t >= pw && c4_fr(t, pw) < 4, m = need ? c4_meas(["I'LL NEVER", 'HOLD', 'THE PEN.'], opt) : null;
    const penBox = m ? c4_box(m.letters.slice(-4)) : null;
    c4_base(t, penBox && c4_mid(penBox), [2, 2]);
    punch(pw, ...(penBox ? c4_mid(penBox) : [W / 2, H / 2]), [3, 3, 2, 2], t);
    // the pointer: home, hops 16 px up with the yank on "hold", the pen drops back with a bounce on the stab
    let px = mir ? 56 : W - 56, py = 6, lift = 0;
    if (t >= hold && t < st) { const f = c4_fr(t, hold); lift = f < 2 ? [48, 44][f] : 40; py = -10; }
    else if (t >= st) { const f = c4_fr(t, st); lift = f < 4 ? [22, 8, -4, 0][f] : 0; }
    if (mir && t < L.start + 4 * F1) lift = [140, 70, 24, 0][c4_fr(t, L.start)] || 0;   // dropped in from the top, left
    c4_rings(t, px, py);
    const d = c4_dancer(mir ? 90 : W - 90, H - 8, 5, t, mir ? { flip: true } : {});
    if (inv) { rect(penBox.x - 2 * m.lines[2].sx, penBox.y - 2 * m.lines[2].sy, penBox.w + 4 * m.lines[2].sx, penBox.h + 4 * m.lines[2].sy, BLK); bigType(["I'LL NEVER", 'HOLD', 'THE PEN.'], { ...opt, xor: FLD }); }
    else c4_type(ov => bigType(["I'LL NEVER", 'HOLD', 'THE PEN.'], { ...opt, ...ov }));
    const tip = c4_pen(t, px, py, { lift });
    c4_ripple(t, tip[0], tip[1]);
    c4_copies(t, px, py);
    // top left, over the pen, up the whole half beat; the stab presses [OK] (held), the release on the bar shuts it
    const ok = c4_notice(t, 8, 8, n, pw, pw + SPB, mir), ox = mir ? 48 : W - 56;
    if (t >= st && c4_fr(t, st) < 9) clickBurst(ox, 99, st, { pointer: false, color: c4_fr(t, st) < 4 ? FLD : BLK, t });
    if (ok && t >= st) { rect(ok.x, ok.y, ok.w, ok.h, FLD); text('OK', ok.x + 28, ok.y + 6, { font: 'chicago', scale: 2, color: BLK, align: 'center' }); }
    return d;
  }
  scene('ch04 never hold', LB.start, LC.start, t => c4_hold(t, LB, false, 1), { era: 'system7', raw: true, screen: true });

  // ===================================================================================================
  // 40.0: YOU SAY WHERE I LAND, — the pen held level points at the spot; she jumps and lands under the nib. 42.0: OR I FADE.
  // ===================================================================================================
  function c4_land(t) {
    const where = wordAt(LC, 'where').start, land = wordAt(LC, 'land').start, fade = wordAt(LD, 'fade').start, LX = W - 96;
    const px = LX - 158, py = 6, faded = t >= LD.start;
    const ty = faded ? bigType(['OR I', 'FADE.'], { t, words: LD, pass: 'slab', fit: 210, x: 8, align: 'left', y: H / 2 - 10 })
      : bigType(['YOU SAY', 'WHERE I', 'LAND,'], { t, words: LC, pass: 'slab', fit: 300, x: 8, align: 'left' });
    c4_base(t, c4_mid(ty.lines[faded ? 1 : 0]));
    c4_rings(t, px, py);
    // Clio: the hero at scale 8, pointing at you, then the star jump from the right edge onto the spot
    let x = W - 50, o = {};
    if (t >= where && t < land) { const k = prog(t, where, land); x = R(lerp(W - 50, LX, easeOut(k))); o = { pose: 'jump', p: k }; }
    else if (t >= land) { x = LX; if (t < land + SPB) o = { pose: 'cheer', p: prog(t, land, land + SPB) }; if (c4_fr(t, land) < 2) FX.shake = Math.max(FX.shake || 0, 2); }
    if (t >= where && t < land + 4 * F1) {   // "where": the spot the writer marks under the nib
      for (const dx of [0, 1]) dline(LX + dx, 44, LX + dx, H - 12, BLK, 4, 4);
      rect(LX - 30, H - 10, 22, 4, BLK); rect(LX + 9, H - 10, 22, 4, BLK); rect(LX - 2, H - 16, 4, 12, BLK);
    }
    c4_dancer(x, H - 8, 7, t, o);
    if (faded) { const b = c4_type(ov => bigType(['OR I', 'FADE.'], { t, words: LD, ghost: true, fit: 210, x: 8, align: 'left', y: H / 2 - 10, ...ov })), l = b.lines[1]; c4_tag = [l.x + l.w - tw('TEMPORARY', 'chicago') - 8, l.y + l.h + 2 * l.sy]; }
    else c4_type(ov => bigType(['YOU SAY', 'WHERE I', 'LAND,'], { t, words: LC, ghost: true, fit: 300, x: 8, align: 'left', ...ov }));
    // the fade: 2x2 cells of black on the 16ths from "fade.", the TEMPORARY tag the last thing to go
    if (t >= fade) c4_dith(Math.min(1, (Math.floor((t - fade) / (SPB / 4) + 1e-6) + 1) * .2));
    if (t >= fade && t < LD.end) { const [tx, ty2] = c4_tag, w = tw('TEMPORARY', 'chicago') + 8; rect(tx, ty2, w, 15, BLK); text('TEMPORARY', tx + 4, ty2 + 3, { font: 'chicago', color: FLD }); }
    // the pen: level, its nib over the spot; on "or" it swings down to hang (a pendulum in 4 frames)
    let tip;
    if (!faded) tip = c4_pen(t, px, py, { a: 0, sag: 6 });
    else {
      const f = c4_fr(t, LD.start);
      if (f < 4) { const a = [.45, .95, 1.4, 1.75][f], k = (f + 1) / 4; tip = c4_pen(t, px, py, { a, back: [R(lerp(px + 12, px + 5, k)), R(lerp(py + 22, py + 29, k))] }); }
      else tip = c4_pen(t, px, py);
    }
    c4_ripple(t, tip[0], tip[1]);
    c4_copies(t, px, py);
  }
  let c4_tag = [0, 0];
  scene('ch04 land', LC.start, LE.start, c4_land, { era: 'system7', raw: true, screen: true });

  scene('ch04 pen pal 2', LE.start, LF.start, t => { invertFrame(LE.start, 1, t); c4_penpal(t, LE, LEE, false); }, { era: 'system7', raw: true, screen: true });
  scene('ch04 never hold 2', LF.start, LG.start, t => c4_hold(t, LF, true, 2), { era: 'system7', raw: true, screen: true });

  // ===================================================================================================
  // 48.0: WHO HOLDS THE PEN? — each line steps in a letter at a time from its sung word; the pen lies level across the top
  // ===================================================================================================
  scene('ch04 who', LG.start, LH.start, t => {
    const opt = { t, words: LG, ghost: true, justify: W - 184, fitH: H - 60, x: 8, y: 46, valign: 'top', align: 'left' }, ws = LG.words;
    const lay = bigType(['WHO', 'HOLDS', 'THE PEN?'], { ...opt, pass: 'slab', invert: false });
    c4_base(t, c4_mid(lay.lines[2]));
    const px = 56, py = 6;
    c4_rings(t, px, py);
    const g = c4_sig(t);
    c4_dancer(W - 84, H - 8, 5, t, g ? {} : { pose: 'pointUp', p: beatPhase(t) });
    c4_type(ov => c4_lines(['WHO', 'HOLDS', 'THE PEN?'], opt, [{ stepIn: { t0: ws[0].start, div: 4, enter: 'slam' } }, { stepIn: { t0: ws[1].start, div: 8, enter: 'slam' } }, { stepIn: { t0: ws[2].start, div: 8, enter: 'slam' } }], ov));
    const bob = R(2 * pulse(t, 1, 6)), tip = c4_pen(t, px, py, { a: 0, back: [W - 210, 28 + bob], sag: 3, cs: 2 });
    c4_ripple(t, tip[0], tip[1]);
    c4_copies(t, px, py);
  }, { era: 'system7', raw: true, screen: true });

  // ===================================================================================================
  // 50.0: YOU DO! YOU DO! (shared with the dive's outer frame) and the Two Floppies bar
  // ===================================================================================================
  const c4_you2 = LH.words[2].start;
  const c4_yopt = t => t < c4_you2 ? { t, words: LH, ghost: true, justify: 280, fitH: H - 64, x: 16, align: 'left', y: R((H - 26) / 2), slam: LH.start }
    : { t, words: { words: LH.words.slice(2) }, ghost: true, justify: 280, fitH: H - 92, x: 16, align: 'left', y: R((H - 26) / 2), slam: null };   // "do!" lands solid with no block slam (flash budget)
  function c4_youDo(t) {
    const o = c4_yopt(t), lay = bigType(['YOU', 'DO!'], { ...o, pass: 'slab', invert: false });
    c4_base(t, t < c4_you2 ? c4_mid(lay.lines[0]) : null);   // the 2nd YOU: its 1-frame invert is the hit (flash budget)
    const px = W - 56, py = 6;
    c4_rings(t, px, py);
    c4_dancer(W - 102, H - 21, 7, t, { ground: false });
    c4_bar(t);
    if (c4_fr(t, c4_you2) === 0) { const l = lay.lines[0]; rect(l.x - 2 * l.sx, l.y - 2 * l.sy, l.w + 4 * l.sx, l.h + 4 * l.sy, BLK); bigType(['YOU', 'DO!'], { ...o, xor: FLD }); }
    else c4_type(ov => bigType(['YOU', 'DO!'], { ...o, ...ov }));
    c4_pen(t, px, py);
    c4_copies(t, px, py);
  }
  scene('ch04 you do', LH.start, DIVE0, c4_youDo, { era: 'system7', raw: true, screen: true });

  // ===================================================================================================
  // 51.625: DIVE 1, the whip into the square dot of the "!" (three bells, three ring-flashes round the block)
  // ===================================================================================================
  let c4_dotF = null;
  function c4_dot() {
    if (c4_dotF) return c4_dotF;
    const sz = screenSize(DIVE0), sW = W, sH = H; W = sz.w; H = sz.h;
    try {
      const m = c4_meas(['YOU', 'DO!'], c4_yopt(DIVE0)), b = m.letters.find(l => l.ch === '!'), l = m.lines[1];
      const c = offscreen(24, 24, () => bigType('!', { x: 4, y: 4, valign: 'top', align: 'left', scale: 1, min: 1, max: 1 }));
      const d = c.getContext('2d').getImageData(0, 0, 24, 24).data, on = (x, y) => d[(y * 24 + x) * 4 + 3] > 0;
      let y1 = 0; for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (on(x, y)) y1 = y;
      let y0 = y1; while (y0 > 0 && [...Array(24).keys()].some(x => on(x, y0 - 1))) y0--;
      let x0 = 24, x1 = 0; for (let x = 0; x < 24; x++) if (on(x, y1)) { x0 = Math.min(x0, x); x1 = x; }
      const rx = b.x + (x0 - 4) * l.sx, ry = b.y + (y0 - 4) * l.sy, rw = (x1 - x0 + 1) * l.sx, rh = (y1 - y0 + 1) * l.sy, pw = Math.min(rw, rh);
      c4_dotF = { x: R(rx + rw / 2 - pw / 2 + sz.x), y: R(ry + rh / 2 - pw / 2 + sz.y), w: pw };
    } finally { W = sW; H = sH; }
    return c4_dotF;
  }
  const c4_lime = () => rect(0, 0, W, H, FIELDS.lime);
  scene('ch04 dive', DIVE0, T1, t => {
    const D = c4_dot(), pw = D.w, inner = SCENES.some(s => s.name === 'ch05 lala') ? 'ch05 lala' : c4_lime;
    diveInto(DIVE0, T1, D.x, D.y, c4_youDo, inner, { pw, color: BLK, power: 4, anchor: false, innerAt: 2 * pw, revealAt: 4 * pw + 60, outer: { era: 'system7', raw: true, screen: true }, inner: { era: 'platinum', raw: true, screen: true } });
    // the block's rect (diveInto's own maths), for a white ring-flash on each dive bell
    const k = prog(t, DIVE0, T1), ZH = FH / pw, zz = clamp(Math.exp(k ** 4 * Math.log(ZH)), 1, ZH), zi = zz < 8 ? zz : Math.min(ZH, R(zz)), bs = zi * pw;
    const f = Math.log(zz) / Math.log(ZH), pan = 1 - (1 - f) ** 3, bx = R(lerp(D.x + pw / 2, FW / 2, pan) - bs / 2), by = R(lerp(D.y + pw / 2, FH / 2, pan) - bs / 2), B = R(bs);
    // the surround sinks to black in 2x2 cells as the dot takes the frame (one steady darkening: the flash budget)
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(bx, by, B, B); ctx.clip('evenodd'); c4_dith(k); ctx.restore();
    for (const b of evTimes('bell').filter(b => b >= DIVE0 && b < T1)) { const fr = c4_fr(t, b); if (fr >= 0 && fr < 3) { const g = 3 + fr * 4; frame(bx - g, by - g, B + 2 * g, B + 2 * g, WHT, 2); } }
  }, { era: 'system7', raw: true });
}
