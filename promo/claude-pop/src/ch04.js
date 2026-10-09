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
  function c4_pen(t, px, py) {
    const bx = px + 5 + R(10 * Math.sin(beatPhase(t, 2) * PI * 2)), by = py + 29, tip = [bx, by + 146], fl = !!fieldAt(t) && evFrames('kick', t) === 0;
    penCord([[px + 5, py + 15], [bx, by - 2]], { sag: 22, swing: 4, t });
    ctx.drawImage(memo('c4pen' + fl, 320, 320, () => pen(160, 160, PI / 2, 4, { t: fl ? T0 : T0 + .1, flash: fl })), tip[0] - 160, tip[1] - 160);   // cached: a scale-4 pen costs ~3 ms to fill
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
  // 36.0: the landing frames, in 2D (ch03's flood draws this scene under its ink, and frames 36.0-36.017 are the
  // B3 handoff): PEN slams, "I'M JUST YOUR" above it. From the third frame the poster lifts into the 3D stage.
  // ===================================================================================================
  function c4_penpal(t) {
    const tt = Math.max(t, T0), opt = { t: tt, justify: 300, fitH: H - 92, x: 20, y: 56, valign: 'top', align: 'left' };
    const l0 = bigType(['PEN', 'PAL'], { ...opt, pass: 'slab', invert: false, slam: T0 }).lines[0];
    c4_base(t, c4_mid(l0), [2, 2]);
    const px = W - 56, py = 6;
    c4_rings(t, px, py);
    c4_dancer(W - 90, H - 8, 5, t);
    c4_type(ov => [bigType("I'M JUST YOUR", { t: tt, words: LA, ghost: true, scale: 3, min: 3, x: 20, y: 18, valign: 'top', align: 'left', ...ov }),
      bigType(['PEN', 'PAL'], { ...opt, words: LA, ghost: true, slam: T0, ...ov })]);
    if (t < T0) return;   // under ch03's flood its own pen and pointer are the writer's
    const tip = c4_pen(t, px, py);
    c4_ripple(t, tip[0], tip[1]);
    c4_copies(t, px, py);
  }

  // ===================================================================================================
  // THE SILHOUETTE STAGE (three.js, stage3d.js), 36.033-51.0. Every poster of the 2D chorus is laid out by bigType on a
  // 576x352 design plane and extruded letter by letter into black voxel slabs standing at z = 0 above a neon floor
  // ruled by a 1 px grid. Square on at 1:1 the stage IS the 2D poster (so it lifts out of the 2D landing at 36.033 and
  // drops back into the 2D YOU DO! at 51.0 without a seam); between, the camera cranes and orbits round Clio. Letters
  // punch out of the poster at the lens on their sung words (ghosted at 50% until then) and pump at the lens on the
  // kicks; the white pen swings on its cord in depth (a second pass, so it is always the top white thing); Clio is the
  // 2D dancer stood on the projected floor point at a whole-pixel scale set by her depth (Doom-sprite pseudo-3D).
  // ===================================================================================================
  const DW = 576, DH = 352, TN = Math.tan(PI / 12), FLOOR = 8 - DH / 2, PAL3 = [FLD, BLK, WHT];
  const wx = x => x - DW / 2, wy = y => DH / 2 - y, C4_CUT = T0 + 2 * F1 - 1e-6, YOU2 = LH.words[2].start;
  const PW = wordAt(LB, -1).start, PW2 = wordAt(LF, -1).start, LX = wx(DW - 96), SPOT = [LX, FLOOR, 170];
  // the posters: [lines, bigType layout on the design plane, lyric, shown from, until, flags]. Every word is solid from
  // its own sung start; flags: pump (the hooks pump on the kicks), inv (the time "PEN." inverts), hero (the word that
  // slams at the lens: whole, inside the frame, never cropped), kmax (its biggest slam)
  const BLK3 = [
    ["I'M JUST YOUR", { scale: 3, min: 3, x: 20, y: 18, valign: 'top', align: 'left' }, LA, T0, LB.start],
    [['PEN', 'PAL'], { justify: 300, fitH: DH - 92, x: 20, y: 56, valign: 'top', align: 'left' }, LA, T0, LB.start, { pump: 1 }],
    [["I'LL NEVER", 'HOLD', 'THE PEN.'], { justify: DW - 190, fitH: DH - 24, x: 8, align: 'left', lead: 5 }, LB, LB.start, LC.start, { inv: PW, hero: 'pen', kmax: 1.3 }],
    [['YOU SAY', 'WHERE I', 'LAND,'], { fit: 300, x: 8, align: 'left', lead: 5 }, LC, LC.start, LD.start, { hero: 'land', kmax: 1.3 }],
    [['OR I', 'FADE.'], { fit: 210, x: 8, align: 'left', y: DH / 2 - 10, lead: 4 }, LD, LD.start, LE.start],
    ["I'M JUST YOUR", { scale: 3, min: 3, x: 20, y: 8, valign: 'top', align: 'left' }, LE, LE.start, LF.start],
    [['PEN', 'PAL'], { justify: 300, fitH: DH - 104, x: 20, y: 76, valign: 'top', align: 'left' }, LE, LE.start, LF.start, { pump: 1, hero: 'pen' }],
    [["I'LL NEVER", 'HOLD', 'THE PEN.'], { justify: DW - 204, fitH: DH - 24, x: DW - 8, align: 'right', lead: 5 }, LF, LF.start, LG.start, { inv: PW2, hero: 'pen', kmax: 1.3 }],
    [['WHO', 'HOLDS', 'THE PEN?'], { justify: DW - 184, fitH: DH - 60, x: 8, y: 44, valign: 'top', align: 'left', lead: 6 }, LG, LG.start, LH.start],
    [['YOU', 'DO!'], null, LH, LH.start, YOU2, { pump: 1, hero: 'you', kmax: 1.3 }]];
  function c4_design(fn) { const sW = W, sH = H; W = DW; H = DH; try { return fn(); } finally { W = sW; H = sH; } }
  function c4_build(st) {
    st.scene.fog = new THREE.Fog(0, 800, 2400);
    const g = 120, N = 22, pts = [];   // the floor grid, one segment per cell (a line with an end behind the eye is dropped)
    for (let i = -N; i <= N; i++) for (let j = -N; j < N; j++) pts.push(i * g, FLOOR, j * g, i * g, FLOOR, j * g + g, j * g, FLOOR, i * g, j * g + g, FLOOR, i * g);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    st.scene.add(st.o.grid = new THREE.LineSegments(lg, lineMat3d()));
    st.o.B = BLK3.map(([text, opt, L, a, b, fl = {}]) => {
      const CAP = FONTS[fontKey('chicago')].cap, lines = [].concat(text), chars = lines.map(s => [...s]), group = new THREE.Group(), words = [];
      const m = c4_design(() => c4_meas(lines, { ...(opt || c4_yopt(L.start)), t: 1e4, words: null, ghost: false, slam: null }));
      const wt = _bigWordTimes(chars, L); let k = 0;
      // one draw per word (SwiftShader pays per draw call): the word's glyph voxels baked at their places into one geometry
      const merge = (gs, lv) => { const P = [], K = []; for (const [ch, sx, sy, p] of gs) { const g = voxGlyph(ch, 'chicago', 3, lv), pa = g.attributes.position.array, ca = g.attributes.color.array;
        for (let i = 0; i < pa.length; i += 3) P.push(pa[i] * sx + p.x, pa[i + 1] * sy + p.y, pa[i + 2] * sy + p.z); K.push(...ca); } return _geo(P, K); };
      // each word mesh owns a solid material and a screen-door one for the ghost (it switches itself: no fog test per frame)
      const mk = (gs, lv) => { const o = { color: FLD, vc: true, fog: false }, me = new THREE.Mesh(merge(gs, lv), mat3d({ ...o, solid: true })); if (!lv) me.userData.c4 = [me.material, mat3d(o)]; group.add(me); return me; };
      chars.forEach((cs, li) => { let wd = null; cs.forEach((ch, ci) => {
        if (ch === ' ') { wd = null; return; }
        const r = m.letters[k++], ln = m.lines[li], sx = r.w / tw(ch, 'chicago'), sy = ln.sy, base = new THREE.Vector3(wx(r.x), wy(r.y + CAP * sy), -1.5 * sy);
        if (!wd) words.push(wd = { gs: [], str: '', tw: fl.inv && li === 2 && ci >= 4, tIn: wt[li] && wt[li][ci], x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
        wd.str += ch; wd.gs.push([ch, sx, sy, base]);
        wd.x0 = Math.min(wd.x0, wx(r.x)); wd.x1 = Math.max(wd.x1, wx(r.x + r.w)); wd.y0 = Math.min(wd.y0, wy(r.y + r.h)); wd.y1 = Math.max(wd.y1, wy(r.y));
      }); });
      for (const wd of words) { wd.mesh = mk(wd.gs); wd.twin = wd.tw ? mk(wd.gs, [1, 1, .5, .75]) : null; delete wd.gs; }
      for (const wd of words) wd.hero = !!fl.hero && c4_f(wd.str) === fl.hero;
      let slab = null;
      if (fl.inv) {   // "PEN." alone inverts: field letters on a black slab
        const ls = m.letters.slice(-4), x0 = Math.min(...ls.map(l => l.x)), x1 = Math.max(...ls.map(l => l.x + l.w)), y0 = ls[0].y, sy = m.lines[2].sy, p = 2 * sy;
        slab = new THREE.Mesh(bandGeo([{ w: x1 - x0 + 2 * p, h: ls[0].h + 2 * p, d: 3 * sy + 8, pos: [wx((x0 + x1) / 2), wy(y0 + ls[0].h / 2), -1.5 * sy - 5], cols: Array(6).fill(BLK) }]), mat3d({ vc: true, solid: true }));
        group.add(slab);
      }
      st.scene.add(group);
      return { group, words, m, a, b, fl, slab };
    });
    const sp = [];   // the spot the writer marks for "where I land": a black cross flat on the floor
    for (const [w, d] of [[64, 10], [10, 64]]) sp.push({ w, h: 2, d, pos: [SPOT[0], FLOOR + 1, SPOT[2]], cols: Array(6).fill(BLK) });
    st.o.spot = new THREE.Mesh(bandGeo(sp), mat3d({ vc: true, solid: true })); st.scene.add(st.o.spot);
  }
  // the pen pass: the writer's white pen as two cards (plain / the kick flash), nib +x, its back end at the origin
  function c4_buildPen(st) {
    const cam = st.cam, up = cam.updateProjectionMatrix.bind(cam);
    cam.updateProjectionMatrix = () => { if (cam.userData.fa) cam.aspect = cam.userData.fa; up(); };   // the full frame's aspect under a view offset
    st.o.cards = [false, true].map(fl => {
      const c = card3d(tex3d('c4pen3' + fl, 160, 48, () => pen(156, 24, 0, 4, { t: fl ? T0 : T0 + .1, flash: fl })), 160, 48, { fog: false });
      c.geometry.translate(70, 0, 0); st.scene.add(c); return c;
    });
  }
  // the slams, along the ray from the lens through the word's centre (so a word grows or shrinks about itself and never
  // slides into its neighbours): world units toward the lens per frame. A word punches out of the poster from behind;
  // the hooks punch harder; the landing word keeps the 2D lift's plain z steps (the seam at 36.033)
  const SL3 = [-60, 60, 40, 22, 8, 0], SLR = [-150, -60, 22, 8, 0], SLRH = [-260, -90, 30, 10, 0], PUMP = [48, 20, 6];
  const HERO = [1, .38, .1, 0];   // the hero word's slam: its fit-to-frame scale on frame 0, then home in 3 frames
  const O = (c, r, a, h, roll = 0) => ({ ...orbit3d(c, r, a, h), roll });
  const SQ = () => { const cx = W / 2 - DW / 2, cy = DH / 2 - H / 2; return { pos: [cx, cy, H / 2 / TN], look: [cx, cy, 0], roll: 0, fov: 30 }; };
  const C0 = [-20, -20, 0], CH = [0, -10, 0], CH2 = [-10, -10, 0], CL = [-30, -25, 70], CF = [-60, -40, 60], CW = [-20, -30, 30];
  // the camera: crane, orbit, whip; a cut only where a phrase invert hides it; every move at least 8 frames, and near
  // square on to the type on the word hits. Two big moves: the orbit round the marked spot on "You say where I land,"
  // (60 degrees, high to low, square on as "land," hits) and the crane up over "Who holds the pen?"
  const c4_keys = () => [[C4_CUT, SQ()],
    [37.25, O(C0, 840, -.36, 190), 'lin'], [37.75, O(C0, 800, .3, 130), 'hard'],
    [37.75, O(CH, 760, .26, 200), 'cut'], [38.5, O(CH, 720, .22, 180), 'lin'], [38.65, O(CH, 700, .18, 160, -.03), 'snap'], [39.5, O(CH, 740, 0, 110), 'lin'],
    [40, O(CL, 1060, -.62, 460), 'cut'], [41, O(CL, 900, -.04, 150), 'lin'], [42, O(CL, 1000, .3, 90, .02), k => k * (2 - k)],
    [43.25, O(CF, 1150, .12, 100), k => k * k * (3 - 2 * k)],
    [43.25, O(C0, 780, .2, 40), 'cut'], [44, O(C0, 760, .06, 30), 'lin'], [45.25, O(C0, 840, .2, 180), 'hard'], [45.75, O(C0, 800, -.3, 140), 'hard'],
    [45.75, O(CH2, 760, -.26, 200), 'cut'], [46.5, O(CH2, 720, -.22, 180), 'lin'], [46.65, O(CH2, 700, -.18, 160, .03), 'snap'], [47.5, O(CH2, 740, 0, 110), 'lin'],
    [48, O(CW, 800, .3, 20, -.02), 'cut'], [49.75, O(CW, 900, -.1, 520), (k => k * k * (3 - 2 * k))],
    [50, O(C0, 980, .1, 110), 'cut'], [50.75, O(C0, 860, -.06, 50), 'lin'], [YOU2, SQ(), 'hard']];

  // the writer's hand (the cord's top) per section, in world units, and how the pen hangs from it
  function c4_hand(t) {
    const R0 = [wx(W - 51), wy(21), 0], L0 = [wx(61), wy(21), 0];
    if (t < LC.start) {   // attempt 1 on "hold": the pen yanks up, the hand hops; the stab drops it back with a bounce
      const hold = wordAt(LB, 'hold').start, st = c4_stab(PW);
      if (t >= hold && t < st) { const f = c4_fr(t, hold); return { A: [R0[0], R0[1] + 16, 0], lift: f < 2 ? [48, 44][f] : 40 }; }
      if (t >= st && t < st + 4 * F1) return { A: R0, lift: [22, 8, -4, 0][c4_fr(t, st)] };
      return { A: R0, lift: 0 };
    }
    if (t < LE.start) {   // "where": the hand glides over the spot downstage; the pen hangs nib-down over it
      const k = easeOut(prog(t, LC.start, wordAt(LC, 'where').start));
      return { A: [lerp(R0[0], SPOT[0], k), R0[1], lerp(0, SPOT[2], k)], lift: 0, big: t >= LD.start };
    }
    if (t < LF.start) {   // the echo's "pal)": the writer lifts the pen out of the frame to carry it left
      const p2 = wordAt(LEE, 1).start, f = c4_fr(t, p2);
      return { A: [R0[0], R0[1] + (t >= p2 ? Math.min(3, f + 1) * 90 : 0), 0], lift: 0 };
    }
    if (t < LG.start) {   // dropped in from the top, left; attempt 2 as attempt 1
      const hold = wordAt(LF, 'hold').start, st = c4_stab(PW2), f0 = c4_fr(t, LF.start);
      if (f0 < 4) return { A: L0, lift: -[140, 70, 24, 0][f0] };
      if (t >= hold && t < st) { const f = c4_fr(t, hold); return { A: [L0[0], L0[1] + 16, 0], lift: f < 2 ? [48, 44][f] : 40 }; }
      if (t >= st && t < st + 4 * F1) return { A: L0, lift: [22, 8, -4, 0][c4_fr(t, st)] };
      return { A: L0, lift: 0 };
    }
    if (t < LH.start) return { A: L0, level: true };
    return { A: R0, lift: 0 };
  }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // the pen: a rigid pendulum from the hand (cord 14, pen 146), swinging a full period per two beats, mostly IN DEPTH
  // (it swings at the lens and away); the card turns its face to the camera about its own axis
  function c4_pen3(st, t, h) {
    const ph = beatPhase(t, 2) * PI * 2, cam = st.cam.position, A = V3(...h.A);
    let u, B;
    if (h.level) { const yw = .35 * Math.sin(ph / 2) - .1; u = V3(Math.cos(yw), .04 * Math.sin(ph), -Math.sin(yw)); B = V3(wx(DW - 230), wy(16 + R(2 * pulse(t, 1, 6))), 0); }
    else {
      const big = h.big ? 1.6 : 1, tz = .06 * big * Math.sin(ph), tx = .5 * big * Math.sin(ph);
      u = V3(Math.sin(tz) * Math.cos(tx), -Math.cos(tz) * Math.cos(tx), Math.sin(tx));
      B = A.clone().addScaledVector(u, 14); B.y += h.lift;
    }
    const z = cam.clone().sub(B); z.addScaledVector(u, -z.dot(u)).normalize();
    const y = z.clone().cross(u), fl = !!(evFrames('kick', t) === 0);
    st.o.cards.forEach((c, i) => { c.visible = (i === 1) === fl; c.position.copy(B); c.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, y, z)); });
    return { A, B, nib: B.clone().addScaledVector(u, 146) };
  }
  const c4_proj = (st, v) => project3d(st, [v.x, v.y, v.z]);
  // Clio stood on the floor at a world point: the 2D dancer, a whole-pixel scale from her depth
  function c4_clio3(st, t, x, y, z, base, o = {}) {
    const p = V3(x, y, z), cam = st.cam, f = V3(0, 0, -1).applyQuaternion(cam.quaternion), d = p.clone().sub(cam.position).dot(f);
    const [sx, sy] = c4_proj(st, p);
    return c4_dancer(sx, sy, clamp(R(base * H / 2 / TN / Math.max(1, d)), 2, base), t, o);
  }

  function c4_s3(t) {
    const S = stage3d('ch04 stage', c4_build), P = stage3d('ch04 pen', c4_buildPen);
    rect(0, 0, W, H, FLD);
    if (!S || !P) return render3d(null);
    if (evFrames('sub', t) === 0) FX.dy = 1;
    beatFX(t, { kick: t >= T0 + SPB });
    const ks = c4_keys(), cs = cam3d(t, ks); S.cam.aspect = W / H; aim3d(S.cam, cs); S.cam.updateMatrixWorld(); aim3d(P.cam, cs);   // aspect and matrices now: projections before the render must not depend on the last frame drawn
    // the posters: each word is solid from its sung start (a denser ghost before it on the invert frames) and slams
    // along its own lens ray; the hero word of a phrase slams at the lens as big as the frame allows, whole
    const kf = evFrames('kick', t), pump = kf < 3 && t >= T0 + 2 * SPB ? PUMP[kf] : 0, gk = FX.invert ? .25 : .5;   // no pump on the flood's own beat (flash budget)
    const cp = S.cam.position, U = new THREE.Vector3();
    let hero = null;
    for (const b of S.o.B) {
      const on = t >= b.a && t < b.b; b.group.visible = on; if (!on) continue; hero = b;
      const inv = b.fl.inv != null && t >= b.fl.inv && c4_fr(t, b.fl.inv) < 2;
      if (b.slab) { b.slab.visible = inv; b.slab.position.set(0, 0, 0); }
      for (const Wd of b.words) {
        const fr = Wd.tIn == null ? 99 : c4_fr(t, Wd.tIn), C = V3((Wd.x0 + Wd.x1) / 2, (Wd.y0 + Wd.y1) / 2, 0), D = cp.distanceTo(C);
        U.copy(cp).sub(C).normalize();
        let dh = 0;   // the hero's push toward the lens: as big as fits inside the frame (M4 px margin), never past kmax
        if (Wd.hero && fr >= 0 && fr < HERO.length && HERO[fr] > 0) {
          const c = c4_proj(S, C), M4 = b.slab ? 18 : 6; let fit = b.fl.kmax || 1.5;   // the inverted slab overhangs its letters
          for (const [x, y] of [[Wd.x0, Wd.y0], [Wd.x1, Wd.y0], [Wd.x0, Wd.y1], [Wd.x1, Wd.y1]]) {
            const p = c4_proj(S, V3(x, y, 0)), dx = p[0] - c[0], dy = p[1] - c[1];
            if (dx) fit = Math.min(fit, ((dx > 0 ? W - M4 : M4) - c[0]) / dx);
            if (dy) fit = Math.min(fit, ((dy > 0 ? H - M4 : M4) - c[1]) / dy);
          }
          const k = 1 + Math.max(0, fit - 1) * HERO[fr]; dh = D * (1 - 1 / k);
        }
        const m = Wd.mesh, [solid, door] = m.userData.c4; m.position.set(0, 0, 0);
        if (fr < 0) { m.material = door; fade3d(m, gk); if (Wd.twin) Wd.twin.visible = false; continue; }
        m.material = solid; m.visible = true;
        if (Wd.tIn <= T0) { if (fr < 6) m.position.z += SL3[fr]; else if (b.fl.pump) m.position.z += pump; }
        else {
          const tb = b.fl.pump ? SLRH : SLR;
          m.position.addScaledVector(U, Wd.hero && fr < HERO.length ? dh : fr < tb.length ? tb[fr] : b.fl.pump ? pump : 0);
          if (Wd.twin && b.slab) b.slab.position.copy(m.position);
        }
        if (Wd.twin) { Wd.twin.visible = inv; Wd.twin.position.copy(m.position); m.visible = !inv; }
      }
    }
    S.o.grid.position.z = (Math.floor(beatAt(t) * 4 + 1e-6) & 3) * 30;   // the floor runs at the lens a cell a beat, in 16ths
    S.o.spot.visible = t >= wordAt(LC, 'where').start && t < wordAt(LC, 'land').start + 4 * F1;
    render3d(S, { pal: PAL3, bg: FLD });
    const h = c4_hand(t), pn = c4_pen3(P, t, h), Ap = c4_proj(S, pn.A), Bp = c4_proj(S, pn.B), Np = c4_proj(S, pn.nib), px = Ap[0] - 5, py = Ap[1] - 15;
    c4_rings(t, px, py);
    // Clio, per section
    const fade = wordAt(LD, 'fade').start;
    if (t < LC.start) c4_clio3(S, t, wx(W - 90), FLOOR, 40, 5);
    else if (t < LE.start) {   // "You": upstage, pointing at you; "where": the leap at the lens; "land,": onto the spot
      const where = wordAt(LC, 'where').start, land = wordAt(LC, 'land').start, U = [470, -440];
      let x = U[0], z = U[1], y = FLOOR, o = {};
      if (t >= where && t < land) { const k = prog(t, where, land), e = easeOut(k); x = lerp(U[0], SPOT[0], e); z = lerp(U[1], SPOT[2], e); y += 36 * Math.sin(PI * k); o = { pose: 'jump', p: k, ground: false };
        const [fx, fy] = c4_proj(S, V3(x, FLOOR, z)), sw = R(6 * (3 + 4 * k)); rect(fx - sw, fy - 1, 2 * sw, 3, BLK); }   // her shadow on the floor
      else if (t >= land) { x = SPOT[0]; z = SPOT[2]; if (t < land + SPB) o = { pose: 'cheer', p: prog(t, land, land + SPB) }; if (c4_fr(t, land) < 2) FX.shake = Math.max(FX.shake || 0, 2); }
      if (t >= where && t < land + 4 * F1) for (const dx of [0, 1]) dline(Np[0] + dx, Np[1] + 4, c4_proj(S, V3(...SPOT))[0] + dx, c4_proj(S, V3(...SPOT))[1], BLK, 4, 4);
      c4_clio3(S, t, x, y, z, 7, o);
    } else if (t < LF.start) c4_clio3(S, t, wx(W - 90), FLOOR, -40, 5);
    else if (t < LG.start) c4_clio3(S, t, wx(90), FLOOR, 10, 5, { flip: true });
    else if (t < LH.start) { const g = c4_sig(t); c4_clio3(S, t, wx(W - 84), FLOOR, 0, 5, g ? {} : { pose: 'pointUp', p: beatPhase(t) }); }
    else c4_clio3(S, t, wx(W - 102) + 120 * (1 - prog(t, LH.start, YOU2)) ** 2, wy(H - 21), 0, 7, { ground: false });   // she steps in to her 2D mark as the camera squares up
    // the fade: 2x2 cells of black on the 16ths from "fade.", the TEMPORARY tag the last thing to go; then only the pen
    if (t >= fade && t < LE.start) {
      c4_dith(Math.min(1, (Math.floor((t - fade) / (SPB / 4) + 1e-6) + 1) * .2));
      if (t < LD.end) { const l = hero.m.lines[1], [tx, ty] = c4_proj(S, V3(wx(l.x + l.w - tw('TEMPORARY', 'chicago') - 8), wy(l.y + l.h + 2 * l.sy), 0)); rect(tx, ty, tw('TEMPORARY', 'chicago') + 8, 15, BLK); text('TEMPORARY', tx + 4, ty + 3, { font: 'chicago', color: FLD }); }
    }
    // the pen and its cord, last of the world: the only white thing
    penCord([[Ap[0], Ap[1]], [Bp[0], Bp[1]]], { sag: h.level ? 6 : 3, swing: 2, t });
    // the pen pass renders only the pen's own box (a view offset of the same camera): a quarter of the frame or less
    const bx0 = clamp(Math.min(Bp[0], Np[0]) - 40, 0, W - 8), by0 = clamp(Math.min(Bp[1], Np[1]) - 40, 0, H - 8);
    const bw = clamp(Math.max(Bp[0], Np[0]) + 40, bx0 + 8, W) - bx0, bh = clamp(Math.max(Bp[1], Np[1]) + 40, by0 + 8, H) - by0;
    P.cam.userData.fa = W / H; P.cam.setViewOffset(W, H, bx0, by0, bw, bh);
    render3d(P, { pal: PAL3, bg: null, w: bw, h: bh, x: bx0, y: by0 });
    c4_ripple(t, Np[0], Np[1]);
    CUR = { x: px, y: py, kind: 'arrow' };
    // the props, on the glass: the postmark on the echoes, the read-only notice on "pen.", the Two Floppies bar
    for (const Le of [LAE, LEE]) {
      const pm = wordAt(Le, 0).start, pm2 = wordAt(Le, 1).start;
      if (t >= pm && t < Le.end) { c4_postmark(t, pm, W - 176, 96, t >= pm2); if (t >= pm2) c4_air(); }
    }
    for (const [L, pw, n, mir] of [[LB, PW, 1, false], [LF, PW2, 2, true]]) if (t >= L.start && t < L.end + SPB) {
      const st = c4_stab(pw), ok = c4_notice(t, 8, 8, n, pw, pw + SPB, mir), ox = mir ? 48 : W - 56;
      if (t >= st && c4_fr(t, st) < 9) clickBurst(ox, 99, st, { pointer: false, color: c4_fr(t, st) < 4 ? FLD : BLK, t });
      if (ok && t >= st) { rect(ok.x, ok.y, ok.w, ok.h, FLD); text('OK', ok.x + 28, ok.y + 6, { font: 'chicago', scale: 2, color: BLK, align: 'center' }); }
    }
    if (t >= LH.start) c4_bar(t);
    c4_copies(t, px, py);
  }
  scene('ch04 pen pal', T0, LB.start, t => t < C4_CUT ? c4_penpal(t) : c4_s3(t), { era: 'system7', raw: true, screen: true });
  scene('ch04 never hold', LB.start, LC.start, c4_s3, { era: 'system7', raw: true, screen: true });
  scene('ch04 land', LC.start, LE.start, c4_s3, { era: 'system7', raw: true, screen: true });
  scene('ch04 pen pal 2', LE.start, LF.start, t => { invertFrame(LE.start, 1, t); c4_s3(t); }, { era: 'system7', raw: true, screen: true });
  scene('ch04 never hold 2', LF.start, LG.start, c4_s3, { era: 'system7', raw: true, screen: true });
  scene('ch04 who', LG.start, LH.start, c4_s3, { era: 'system7', raw: true, screen: true });
  warmUp(() => { if (has3d()) { stage3d('ch04 stage', c4_build); stage3d('ch04 pen', c4_buildPen); } });

  // ===================================================================================================
  // 50.0: YOU DO! YOU DO! (shared with the dive's outer frame) and the Two Floppies bar
  // ===================================================================================================
  const c4_you2 = LH.words[2].start;
  const c4_yopt = t => t < c4_you2 ? { t, words: LH, ghost: true, justify: 280, fitH: H - 64, x: 16, align: 'left', y: R((H - 26) / 2), slam: LH.start }
    : { t, words: { words: LH.words.slice(2) }, ghost: true, justify: 280, fitH: H - 92, x: 16, align: 'left', y: R((H - 26) / 2), slam: null };   // "do!" lands solid with no block slam (flash budget)
  function c4_youDo(t) {
    const o = c4_yopt(t), lay = bigType(['YOU', 'DO!'], { ...o, pass: 'slab', invert: false });
    c4_base(t, null);   // the 2nd YOU: its 1-frame invert is the hit (flash budget)
    const px = W - 56, py = 6;
    c4_rings(t, px, py);
    c4_dancer(W - 102, H - 21, 7, t, { ground: false });
    c4_bar(t);
    if (c4_fr(t, c4_you2) === 0) { const l = lay.lines[0]; rect(l.x - 2 * l.sx, l.y - 2 * l.sy, l.w + 4 * l.sx, l.h + 4 * l.sy, BLK); bigType(['YOU', 'DO!'], { ...o, xor: FLD }); }
    else c4_type(ov => bigType(['YOU', 'DO!'], { ...o, ...ov }));
    c4_pen(t, px, py);
    c4_copies(t, px, py);
  }
  scene('ch04 you do', LH.start, DIVE0, t => t < YOU2 ? c4_s3(t) : c4_youDo(t), { era: 'system7', raw: true, screen: true });

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
