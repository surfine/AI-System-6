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

  function c8_base(t, hero, steps, kick = true) {
    rect(0, 0, W, H, FLD);
    invertFrame(T0, 2, t);
    if (evFrames('sub', t) === 0) FX.dy = 1;
    const e = evLast('stab', t), k = evLast('kick', t);   // a kick invert under a stab punch holds through the 3x step (2 frames): a 1-frame one adds a flash
    beatFX(t, { anyCrash: true, kick, kickFrames: e && k && hero && Math.abs(e[0] - k[0]) < 1e-3 ? 2 : 1 });
    if (e && e[0] >= T0 && hero) punch(e[0], ...hero, steps, t);
  }
  let c8_sc = null;
  function c8_meas(str, o) { let r; c8_sc = c8_sc || Object.assign(document.createElement('canvas'), { width: 8, height: 8 }); const sw = W, sh = H; offscreen(8, 8, () => { W = sw; H = sh; r = bigType(str, o); }, c8_sc); W = sw; H = sh; return r; }
  const c8_box = ls => { const x0 = Math.min(...ls.map(l => l.x)), y0 = Math.min(...ls.map(l => l.y)); return { x: x0, y: y0, w: Math.max(...ls.map(l => l.x + l.w)) - x0, h: Math.max(...ls.map(l => l.y + l.h)) - y0 }; };

  // ---- props ----
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
  // THE 3D CHORUS LINE (stage3d.js). One stage for the whole chorus: the lime field is the clear colour and the floor, a
  // black 1 px grid dissolving to the horizon; every lyric a block of black voxel type (each line justified to the block's
  // width, the poster grammar of chorus 1) slamming in z on its sung words, ghosted until then; Clio, the twin and the gang
  // of twelve extruded from their 1-bit sprites; the postmark a giant stamp, the Project CD a disc on the floor; the notice
  // cascade as cards flying out of the depth onto the glass. The writer is NOT in the stage: the pointer, the white pen and
  // its cord stay 2D, on the glass in front of it. Every transform is set from t (one camera key list, below).
  // ===================================================================================================
  const K3 = 'ch08 chorus', PAL3 = [FLD, BLK, WHT];
  const B3 = {   // id: [lines, width, max size, words | per-line stepIn [[t0, div]]]
    just1: [["I'M JUST YOUR"], 560, 9, LA], pp1: [['PEN', 'PAL'], 760, 26, LA],
    hold1: [["I'LL NEVER", 'HOLD', 'THE PEN.'], 860, 30, LB], land: [['YOU SAY', 'WHERE I', 'LAND,'], 780, 20, LC], fade: [['OR I', 'FADE.'], 640, 24, LD],
    just2: [["I'M JUST YOUR"], 560, 9, LE], pp2: [['PEN', 'PAL'], 760, 26, [[LE.words[3].start, 4], [LE.words[4].start, 4]]],
    hold2: [["I'LL NEVER", 'HOLD', 'THE PEN.'], 860, 30, LF],
    who: [['WHO', 'HOLDS', 'THE PEN?'], 820, 26, [[LG.words[0].start, 4], [LG.words[1].start, 8], [LG.words[2].start, 8]]],
    you: [['YOU', 'DO!'], 360, 18, LH]
  };
  // a block: each line its own voxText, sized to the width (capped), stacked; origin = the block's bottom-left on the floor
  function c8_vblock(lines, wd, mx, wt) {
    const g = new THREE.Group(), cap = FONTS.chicago.cap, ls = lines.map(s => { const sz = Math.min(mx, wd / tw(s, 'chicago')); return { v: voxText(s, { size: sz, depth: 3, align: 'left' }), s: sz }; });
    let y = 0;
    for (let i = ls.length - 1; i >= 0; i--) { const l = ls[i]; l.y0 = y; l.y1 = y + cap * l.s; l.v.group.position.set(l.v.w / 2, y + cap * l.s / 2, 0); g.add(l.v.group); y = l.y1 + 2.5 * l.s; }
    const tm = Array.isArray(wt) ? null : _bigWordTimes(ls.map(l => l.v.chars[0]), wt), letters = [];
    ls.forEach((l, li) => { let n = 0; for (const L of l.v.letters) letters.push({ L, li, at: tm ? tm[li][L.ci] : beatTime(beatAt(wt[li][0]) + n++ / wt[li][1]) }); });
    return { g, ls, letters, h: ls[0].y1 };
  }
  const NOTE_N = 14;
  function c8_build(st) {
    st.scene.fog = new THREE.Fog(0, 2600, 6800);
    // the floor grid: 120-unit cells round the stage, every fourth line beyond it, so the horizon stays sparse (a dense band
    // of 1 px lines shimmers under any camera move: flash budget); one segment per cell (an end behind the eye is not drawn)
    const gs = 120, N = 44, M = window.C8M || 15, pts = [];
    for (let i = -N; i <= N; i++) for (let j = -N; j < N; j++) {
      const near = Math.abs(i) <= M && j >= -M && j < M;
      if (near || i % 4 === 0) pts.push(i * gs, 0, j * gs, i * gs, 0, j * gs + gs);
      if (near || i % 4 === 0) pts.push(j * gs, 0, i * gs, j * gs + gs, 0, i * gs);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); st.scene.add(new THREE.LineSegments(lg, lineMat3d()));
    st.o.B = {}; for (const [id, d] of Object.entries(B3)) { const b = c8_vblock(...d); b.g.visible = false; st.scene.add(b.g); st.o.B[id] = b; }
    // the postmarks: a black rubber-stamp disc with (PEN PAL) round the rim and the year, the cancel bars running out one side
    st.o.pm = [2009, 2011].map((yr, k) => {
      const m = card3d(tex3d('c8pm' + yr, 400, 200, () => c8_pmDraw(k ? 300 : 100, 100, yr, k ? -1 : 1)), 400, 200);
      m.geometry.translate(k ? -100 : 100, 0, 0); m.visible = false; st.scene.add(m); return m;
    });
    // the Project CD: a black disc on the floor, the lime ring, hole and glint drawn on its top (it turns as a whole)
    const cd = new THREE.Group(), top = new THREE.Mesh(new THREE.CircleGeometry(300, 48), mat3d({ map: tex3d('c8cd', 200, 200, c8_cdDraw), solid: true }));
    top.rotation.x = -PI / 2; top.position.y = 22; cd.add(top);
    cd.add(new THREE.Mesh(new THREE.CylinderGeometry(300, 300, 22, 48, 1, true).translate(0, 11, 0), mat3d({ color: BLK, solid: true, side: 'double' })));
    cd.visible = false; st.scene.add(cd); st.o.cd = cd;
    // the choir riser (YOU DO!): one black tier the gang of twelve stands on, behind and above the type
    const rs = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat3d({ color: BLK, solid: true })); rs.visible = false; st.scene.add(rs); st.o.riser = rs;
    // the notice cards ride in camera space (children of the camera): at depth c8_d() they sit 1:1 on the glass
    st.scene.add(st.cam);
    const nt = tex3d('c8note', NW, NH, () => c8_noteDraw(0, 0));
    st.o.cards = Array.from({ length: NOTE_N }, () => { const m = card3d(nt, NW, NH, { solid: false }); m.visible = false; st.cam.add(m); return m; });
  }
  const c8_d = () => H / 2 / Math.tan(PI / 12);   // the camera-space depth where the stage is 1:1 with the screen
  function c8_pmDraw(cx, cy, yr, side) {
    const r = 84, s = '(PEN PAL)', rr = r - 29, st = Math.min(.35, 17 / rr);
    for (const dy of [-16, 4]) for (let x = side > 0 ? cx + r - 6 : cx - r + 6 - 4; side > 0 ? x < 400 : x >= 0; x += side * 4) rect(x, cy + dy + R(4 * Math.sin((x - cx) / 11)), 4, 8, BLK);
    disc(cx, cy, r, BLK); ring(cx, cy, r - 7, FLD, 2); ring(cx, cy, r - 12, FLD, 1);
    [...s].forEach((c, i) => { const a = -PI / 2 + (i - (s.length - 1) / 2) * st; text(c, cx + R(Math.cos(a) * rr), cy + R(Math.sin(a) * rr) - 9, { font: 'chicago', scale: 2, color: FLD, align: 'center' }); });
    text(String(yr), cx, cy - 4, { font: 'chicago', scale: 3, color: FLD, align: 'center' });
    rect(cx - 44, cy + 36, 88, 2, FLD); rect(cx - 30, cy + 42, 60, 2, FLD);
  }
  function c8_cdDraw() { disc(100, 100, 99, BLK); ring(100, 100, 76, FLD, 2); disc(100, 100, 18, FLD); disc(100, 100, 7, BLK); for (let j = 0; j < 4; j++) { const b = j * .12; rect(R(100 + Math.cos(b) * 48) - 5, R(100 + Math.sin(b) * 48) - 3, 10, 6, FLD); } }
  function c8_noteDraw(X, Y) {
    rect(X, Y, NW, NH, BLK); frame(X + 3, Y + 3, NW - 6, NH - 6, FLD, 1);
    NROWS.forEach((s, j) => text(s, X + 10, Y + 11 + j * 14, { font: 'chicago', color: FLD }));
    const ok = { x: X + NW - 62, y: Y + NH - 30, w: 46, h: 18 };
    frame(ok.x - 3, ok.y - 3, ok.w + 6, ok.h + 6, FLD, 2); frame(ok.x, ok.y, ok.w, ok.h, FLD, 1);
    text('OK', ok.x + ok.w / 2, ok.y + 5, { font: 'chicago', color: FLD, align: 'center' });
  }

  // ---- THE CAMERA: one key list for the chorus (orbits round a centre; 'cut' between shots, whips on the echoes) ----
  const oc = (r, a, h, o = {}) => ({ ...orbit3d(o.c || [0, 300, 0], r, a, h), roll: o.roll || 0, fov: o.fov || 30 });
  const LINE = (i, k) => k ? [-520 - i * 130, -380 - i * 300] : [520 + i * 130, -380 - i * 300];   // the gang's chorus line, receding (k: mirrored)
  const CAM8 = [   // cuts land on the section's words; between them only slow drifts (a whip or snap flips too much area: flash budget)
    [83.8, oc(1680, -.34, 240, { c: [-40, 330, 0] })], [84.0, oc(1680, -.34, 240, { c: [-40, 330, 0] }), 'cut'], [85.2, oc(1460, -.1, 340, { c: [-40, 330, 0] }), 'lin'],
    // the echo: a cut to the near end of the chorus line, then tracking down it
    [85.25, { pos: [1700, 900, 1100], look: [300, 120, -1500], roll: -.06 }, 'cut'], [85.7, { pos: [1620, 870, 880], look: [240, 120, -1700], roll: -.06 }, 'lin'],
    [85.75, oc(1640, .36, 300, { c: [-60, 300, 0] }), 'cut'], [87.95, oc(1180, .16, 260, { c: [80, 230, 0] }), 'lin'],
    [88.0, oc(1560, -.3, 360, { c: [-20, 260, 0] }), 'cut'], [89.95, oc(1460, -.16, 520, { c: [0, 230, 0] }), 'lin'],
    [90.0, oc(1500, -.24, 380, { c: [-40, 240, 0] }), 'cut'], [91.2, oc(1560, -.34, 300, { c: [-40, 240, 0] }), 'lin'],
    [91.25, oc(1760, .3, 280, { c: [80, 330, 0] }), 'cut'], [93.2, oc(1660, -.2, 380, { c: [40, 330, 0] }), 'lin'],
    [93.25, { pos: [-1700, 900, 1100], look: [-300, 120, -1500], roll: .06 }, 'cut'], [93.7, { pos: [-1620, 870, 880], look: [-240, 120, -1700], roll: .06 }, 'lin'],
    [93.75, oc(1800, -.36, 300, { c: [-160, 300, 0] }), 'cut'], [95.95, oc(1300, -.16, 260, { c: [80, 230, 0] }), 'lin'],
    [96.0, oc(1750, .4, 160, { c: [-120, 340, 0], roll: -.08 }), 'cut'], [97.9, oc(1800, -.12, 300, { c: [-40, 330, 0], roll: .03 }), 'lin'],
    [98.0, oc(1700, -.12, 200, { c: [-60, 170, -100] }), 'cut'], [100, oc(1650, .02, 240, { c: [20, 170, -500] }), 'lin']
  ];
  // per frame: what is on the stage. sh = {blocks: [[id, [x, y, z], ry]], dancers: [{key, pos, y, size, ...clioDance o}], pm: [k, t0, [x, y, z], ry],
  // cd: [x, z, t0 of the turn], cards: [{p0, p1, a0, a1}]}
  function c8_3d(t, sh) {
    const st = stage3d(K3, c8_build); if (!st) { _no3d(); return null; }
    st.bg = FLD;
    aim3d(st.cam, cam3d(t, CAM8)); if (!CAM8.some(k => k[2] === 'cut' && k[0] > t - 1.5 / FPS && k[0] <= t + 1e-6)) whip3d(t, CAM8, { min: .06 });   // a cut is not a whip: no smear on it
    for (const [id, b] of Object.entries(st.o.B)) b.g.visible = false;
    for (const [id, p, ry, o] of sh.blocks || []) {
      const b = st.o.B[id]; b.g.visible = true; b.g.position.set(...(typeof p === 'function' ? p(st) : p)); b.g.rotation.set(0, ry || 0, 0);
      for (const { L, li, at } of b.letters) { slam3d(L, t, at, { ghost: true, from: 80 }); if (o && o.hide && o.hide.includes(li)) L.mesh.visible = false; }
    }
    for (const k in st.o) if (k.startsWith('d|')) st.o[k].g.visible = false;
    for (const d of sh.dancers || []) {
      const g = dancer3d(st, d.key, t, { field: FLD, depth: 5, ...d }); g.visible = true;
      if (d.y) g.position.y = d.y;
      if (d.sy != null) g.scale.y *= d.sy;
    }
    st.o.pm.forEach(m => { m.visible = false; });
    if (sh.pm) {
      const [k, t0, p, ry] = sh.pm, m = st.o.pm[k], f = c8_fr(t, t0);
      if (f >= 0) {
        const rt = evFrames('tambourine', t) < 2 ? (evIndex('tambourine', t) & 1 ? 6 : -6) : 0;
        m.visible = true; m.scale.setScalar(3.2); m.position.set(p[0], p[1] + 320 + (f < 4 ? [1100, 520, 160, 0][f] : rt), p[2]); m.rotation.set(0, (ry || 0) + (f < 4 ? [2.2, 1.1, .4, 0][f] : 0), 0);
        if (f < 2) FX.shake = Math.max(FX.shake || 0, 3 - f);
      }
    }
    st.o.cd.visible = !!sh.cd;
    if (sh.cd) { const [x, z, t0] = sh.cd; st.o.cd.position.set(x, 0, z); st.o.cd.rotation.y = -Math.floor(prog(t, t0, t0 + 2 * SPB) * 16) / 16 * 2 * PI; }
    st.o.cards.forEach(m => { m.visible = false; });
    (sh.cards || []).forEach((c, i) => {
      const m = st.o.cards[i], k = c.k; if (k == null || k < 0 || k > 1) return;
      m.visible = true; m.position.set(...c.p0.map((v, j) => lerp(v, c.p1[j], k))); m.rotation.set(...c.a0.map((v, j) => lerp(v, c.a1[j] || 0, k)));
    });
    st.o.riser.visible = !!sh.riser;
    if (sh.riser) { const [x0, x1, y, z] = sh.riser; st.o.riser.scale.set(x1 - x0, 26, 140); st.o.riser.position.set((x0 + x1) / 2, y - 13, z); }
    st.scene.children[0].visible = !sh.bare;   // the floor grid
    render3d(st, { pal: PAL3, bg: FLD });
    st.scene.updateMatrixWorld(true);
    return st;
  }
  // the screen box of line li of a block (after c8_3d): for punches, selections, hand-offs to 2D type
  function c8_pbox(st, id, li) {
    const b = st.o.B[id], l = b.ls[li], z = 1.5 * l.s, xs = [], ys = [];
    for (const x of [0, l.v.w]) for (const y of [l.y0, l.y1]) { const v = new THREE.Vector3(x, y, z).applyMatrix4(b.g.matrixWorld).project(st.cam); xs.push((v.x + 1) / 2 * W); ys.push((1 - v.y) / 2 * H); }
    const x0 = R(Math.min(...xs)), y0 = R(Math.min(...ys));
    return { x: x0, y: y0, w: R(Math.max(...xs)) - x0, h: R(Math.max(...ys)) - y0, sx: (Math.max(...ys) - Math.min(...ys)) / FONTS.chicago.cap };
  }
  // the gang of twelve on the chorus line: each pops up (scale 0 -> 1 in 4 hard frames) and moves one frame after the one in
  // front of it, a ripple running down the line (it also spreads the changed area over 12 frames: flash budget)
  function c8_gang3(t, on, mir, o = {}) {
    const out = [];
    for (let i = 0; i < 12; i++) {
      const ti = t - i * F1, f = c8_fr(ti, on);
      if (f >= 0) out.push({ key: 'g' + i, pos: LINE(i, mir), size: 8, sy: [.15, .5, .85, 1][Math.min(f, 3)], flip: !!(i & 1) !== !!mir, ...(i & 1 ? { pose: 'pointUp', p: 1 } : c8_pose(ti)), ...o });
    }
    return out;
  }
  const c8_pose = t => { const g = c8_sig(t); return g ? { pose: g.pose, p: g.p } : {}; };
  // the notice cascade in flight: n cards out of the depth, each landing on its 2D copy's spot on at(i); x decoys fly past the glass
  function c8_cards(t, p0, p1, n, t0, x) {
    const D = c8_d(), FL = 12, out = [], at = i => t0 + i * (SPB / 2) / n, pos = i => [R(lerp(p0[0], p1[0], n > 1 ? i / (n - 1) : 1)), R(lerp(p0[1], p1[1], n > 1 ? i / (n - 1) : 1))];
    for (let i = 0; i < n; i++) {
      const [X, Y] = pos(i), f = c8_fr(t, at(i) - FL / FPS), cx = X + NW / 2 - W / 2, cy = -(Y + NH / 2 - H / 2), z0 = -D * 9, s = i & 1 ? 1 : -1;
      out.push({ k: f >= 0 && f < FL ? 1 - (1 - (f + 1) / FL) ** 2 : -1, p0: [cx * 4 + s * 900, cy * 3 - 600, z0], p1: [cx, cy, -D], a0: [1.2 * s, -2.4 * s, .9 * s], a1: [0, 0, 0] });
    }
    for (let j = 0; j < x; j++) {   // the decoys: straight through the glass, past the camera's shoulder
      const f = c8_fr(t, t0 - (j + 1) * SPB / 4 / x - .05), s = j & 1 ? 1 : -1, FL2 = 16;
      out.push({ k: f >= 0 && f < FL2 ? (f + 1) / FL2 : -1, p0: [s * (160 + 90 * j), (j % 3 - 1) * 120, -D * 12], p1: [s * (520 + 60 * j), (j % 3 - 1) * 160, -D * 1.2], a0: [.4 * s, 3 * s, 0], a1: [-.6 * s, -.5 * s, .6 * s] });
    }
    return out;
  }

  // ===================================================================================================
  // 84.0 / 91.25: PEN PAL; the postmark (2009, then 2011) and the gang of twelve on the echo, tracked down the chorus line.
  // From 92: the harmony twin.
  // ===================================================================================================
  function c8_penpal(t, La, Le, first) {
    const tt = first ? Math.max(t, T0) : t, pm = Le.words[0].start, pm2 = Le.words[1].start, mid = pm <= t && t < Le.end, st0 = LE.words[3].start;
    c8_base(t, null);
    let px = W - 56, py = 6, lift = 0, back = null, a;
    if (!first) c8_land0();
    if (!first && t < LE.start + 4 * F1) {   // the pointer flies home from LAND, in four frames, the pen swinging back to hang
      const k = (c8_fr(t, LE.start) + 1) / 4; a = lerp(PI, PI / 2, k); px = R(lerp(c8_ptL[0], px, k)); py = R(lerp(c8_ptL[1], py, k)); back = [px + 5, py + 24];
    }
    if (!first && t >= pm2) { const f = c8_fr(t, pm2); lift = [30, 90, 180][Math.min(2, f)]; py = 6 - Math.min(60, f * 20); }   // lifted out to carry left
    const bx = first ? -470 : -300, pp = first ? 'pp1' : 'pp2', js = first ? 'just1' : 'just2', ds = [];
    if (first) ds.push({ key: 'hero', pos: [470, -40], size: 9, ...c8_pose(tt) });
    else {
      ds.push({ key: 'hero', pos: [660, -140], size: 9, ...c8_pose(t) });
      if (t >= st0) { const f = c8_fr(t, st0); ds.push({ key: 'twin', pos: [-560, 40], size: 8, flip: true, sy: f < 4 ? [.1, .4, .75, 1][f] : 1, ...c8_pose(t) }); }   // THE HARMONY TWIN pops up on the stab
    }
    if (mid) ds.push(...c8_gang3(t, pm, !first));
    const sts = c8_3d(tt, { dancers: ds, blocks: mid ? [] : [[pp, [bx, 0, 0]], [js, s => [bx, s.o.B[pp].h + 50, 0]]], pm: mid ? [first ? 0 : 1, pm, first ? [-260, 0, -1300] : [260, 0, -1300], first ? .25 : -.25] : null });
    if (sts && !mid) { const e = evLast('stab', t), b = c8_pbox(sts, pp, 0); if (e && e[0] >= T0) punch(e[0], R(b.x + b.w / 2), R(b.y + b.h / 2), [2, 2], t); }
    if (!first && t < LE.start + 3 * F1) { const g = c8_land0(); bigType('LAND,', { ...g, ghost: BLK, words: { words: [{ w: 'land', start: 1e9 }] } }); }   // LAND, kept for one beat, dissolving
    if (mid && t >= pm2) c8_air();
    if (t < T0) return;   // under ch07's flood its own pen and pointer are the writer's
    c8_rings(t, px, py);
    const tip = c8_pen(t, px, py, { lift, back, a });
    c8_ripple(t, tip[0], tip[1]);
    c8_copies(t, px, py);
  }
  scene('ch08 pen pal', T0, LB.start, t => c8_penpal(t, LA, LAE, true), OPT);

  // ===================================================================================================
  // 85.75 / 93.75: I'LL NEVER HOLD THE PEN. Attempts 3 (and 4, 5: the twins) on "hold"; on "pen." the camera slams into
  // THE PEN. and the notice CASCADE flies out of the depth onto the glass
  // ===================================================================================================
  function c8_hold(t, L, mir, n) {
    const hold = L.words[2].start, pw = L.words[4].start, st = c8_stab(pw), id = mir ? 'hold2' : 'hold1';
    const P0 = mir ? [2, 4] : [W - 200, 4], P1 = mir ? [20, H - NH - 4] : [W - 180, H - NH - 4];
    c8_base(t, null);
    if (t >= st && c8_fr(t, st) < 3) FX.shake = 2;   // the click on [OK]: a jolt, not a punch (flash budget)
    let px = mir ? 56 : W - 56, py = 6, lift = 0;
    if (t >= hold && t < st) {   // the yank (twice when both reach: one pen, two hands)
      const f = c8_fr(t, hold), two = mir && t >= hold + SPB / 2, f2 = c8_fr(t, hold + SPB / 2);
      lift = two ? (f2 < 2 ? [84, 78][f2] : 72) : f < 2 ? [48, 44][f] : 40; py = two ? -22 : -10;
    } else if (t >= st) { const f = c8_fr(t, st); lift = f < 4 ? [22, 8, -4, 0][f] : 0; }
    if (mir && t < L.start + 4 * F1) lift = [140, 70, 24, 0][c8_fr(t, L.start)] || 0;
    const ds = mir ? [{ key: 'twin', pos: [-560, 120], size: 8, flip: true, ...c8_pose(t) }, { key: 'hero', pos: [-820, -200], size: 9, ...c8_pose(t) }] : [{ key: 'hero', pos: [480, -40], size: 9, ...c8_pose(t) }];
    const sts = c8_3d(t, { dancers: ds, blocks: [[id, [mir ? -300 : -480, 0, 0]]], cards: t >= pw - .4 && t < st ? c8_cards(t, P0, P1, n, pw, n > 4 ? 2 : 0) : null });
    const ok = c8_casc(t, P0, P1, n, pw, st + 9 * F1);   // the clicked notice stays up 9 frames
    c8_okClick(t, ok, st);
    c8_rings(t, px, py);
    const tip = c8_pen(t, px, py, { lift });
    c8_ripple(t, tip[0], tip[1]);
    c8_copies(t, px, py);
  }
  scene('ch08 never hold', LB.start, LC.start, t => c8_hold(t, LB, false, 4), OPT);

  // ===================================================================================================
  // 88.0: YOU SAY WHERE I LAND, — she lands on the Project CD. 90.0: OR I FADE. — the writer's nib taps LAND, and keeps it.
  // ===================================================================================================
  let c8_l0 = null, c8_ptL = [0, 0];
  function c8_land0() {   // LAND, small in the bottom-left corner (its layout at scale 4)
    if (c8_l0) return c8_l0;
    const m = c8_meas('LAND,', { x: 12, y: H - 48, valign: 'top', align: 'left', scale: 4, min: 4, max: 4 });
    c8_ptL = [12 + m.w + 4 + 150, H - 48 + 18 - 20];
    return (c8_l0 = { x: 12, y: H - 48, valign: 'top', align: 'left', scale: 4, min: 4, max: 4, w: m.w, h: m.h });
  }
  const CD3 = [400, 200];
  function c8_land(t) {
    const where = LC.words[2].start, land = LC.words[4].start, fade = LD.words[2].start, faded = t >= LD.start, g = c8_land0(), step = LD.start - SPB / 2;
    c8_base(t, null, undefined, t >= LC.start + .1); splitPal(3, LC.start, 3, [WHT, BLK], t);   // the 88 kick splits, no invert (flash budget: the cascade just shut)
    let hx = 560, hz = 60, hy = 0, o = {};
    if (t >= where && t < land) { const k = Math.floor(prog(t, where, land) * 16) / 16; hx = lerp(560, CD3[0], k); hz = lerp(60, CD3[1], k); hy = 180 * 4 * k * (1 - k) + 22 * k; o = { pose: 'jump', p: k }; }
    else if (t >= land) { hx = CD3[0]; hz = CD3[1]; hy = 22; if (t < land + SPB) o = { pose: 'cheer', p: prog(t, land, land + SPB) }; if (c8_fr(t, land) < 2) FX.shake = Math.max(FX.shake || 0, 2); }
    const sts = c8_3d(t, { dancers: [{ key: 'hero', pos: [hx, hz], y: hy, size: 8, ...(o.pose ? o : c8_pose(t)) }], cd: [CD3[0], CD3[1], land], blocks: [faded ? ['fade', [-560, 0, 0]] : ['land', [-600, 0, 0], 0, t >= step ? { hide: [2] } : null]] });
    // the pointer: the pen level over the spot; on "or" it swings to hang, then carries the pen to LAND, and the nib taps it
    const P0 = [W - 270, 6], clk = LD.words[2].start + SPB / 2;
    let px = P0[0], py = P0[1], a = 0, back = null, kept = t >= clk;
    if (faded) {
      const f = c8_fr(t, LD.start), k = Math.floor(prog(t, LD.words[1].start, clk - SPB / 4) * 6) / 6, ka = clamp(k * 3 - 2, 0, 1);
      a = f < 4 ? [.45, .95, 1.4, 1.75][f] : lerp(PI / 2, PI, ka);
      px = R(lerp(P0[0], c8_ptL[0], k)); py = R(lerp(P0[1], c8_ptL[1], Math.min(1, k * 1.5)));
      if (kept && c8_fr(t, clk) < 3) px -= 3;   // the tap
      back = f < 4 ? [px + 12 - R(7 * (f + 1) / 4), py + 22 + R(7 * (f + 1) / 4)] : [R(px + 5 - 9 * ka), R(py + 29 - 5 * ka)];
    }
    const Lw = () => bigType('LAND,', { ...g, outline: kept ? FLD : null, outlineW: .25 });
    if (faded) {
      const l = sts ? c8_pbox(sts, 'fade', 1) : { x: 8, y: 200, w: 200, h: 60 };
      c8_tag = [clamp(l.x + l.w + 8, 4, W - 90), clamp(l.y, 4, H - 40)];   // beside FADE., clear of the pen's road to LAND,
      if (!kept) Lw();
    } else if (t >= step && sts) {   // 89.75: LAND, leaves the 3D block and steps down to its small corner in four 32nds
      const bl = c8_pbox(sts, 'land', 2), k = Math.min(1, (Math.floor((t - step) / (SPB / 8) + 1e-6) + 1) / 4), sc = Math.max(1, R(lerp(bl.sx, 4, k)));
      bigType('LAND,', { x: R(lerp(bl.x, g.x, k)), y: R(lerp(bl.y, g.y, k)), valign: 'top', align: 'left', scale: sc, min: sc, max: sc });
    }
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
  // 96.0: WHO HOLDS THE PEN? — a letter per 16th as the camera rolls back along the block; the twins point up at the pen
  // ===================================================================================================
  scene('ch08 who', LG.start, LH.start, t => {
    c8_base(t, null, undefined, false); splitPal(3, LG.start, 3, [WHT, BLK], t);   // the 96 kick splits, no invert (flash budget)
    const px = 56, py = 6, up = c8_sig(t) ? c8_pose(t) : { pose: 'pointUp', p: beatPhase(t) };
    c8_3d(t, { blocks: [['who', [-520, 0, 0]]], dancers: [{ key: 'twin', pos: [560, -60], size: 8, flip: true, ...up }, { key: 'hero', pos: [820, -420], size: 9, ...up }] });
    c8_rings(t, px, py);
    const bob = R(2 * pulse(t, 1, 6)), tip = c8_pen(t, px, py, { a: 0, back: [W - 220, 28 + bob], sag: 3, cs: 2 });
    c8_ripple(t, tip[0], tip[1]);
    c8_copies(t, px, py);
  }, OPT);

  // ===================================================================================================
  // 98.0: YOU DO! YOU DO! (shared with the dive's outer frame): the gang of twelve sing it down the chorus line as the camera
  // tracks along it; the hero stays a 2D sprite on the glass (her eye is the dive's pixel), the Two Floppies bar
  // ===================================================================================================
  const c8_you2 = LH.words[2].start;
  let c8_hero = null;
  const c8_RG = () => [-1250, 850, 400, -1300, 6.5];   // the riser: x0, x1, top y, z; the singers' size
  function c8_youDo(t) {
    c8_base(t, null);
    splitPal(3, c8_you2, 3, [WHT, BLK], t);   // the second YOU: a split, not an invert (flash budget)
    // the gang of twelve and the twin sing it from the choir riser, high behind the type, popping up in a ripple from the left
    const t3 = Math.min(t, DIVE0), dv = t >= DIVE0, px = W - 56, py = 6, G = c8_RG(), gang = [];
    for (let i = 0; i < 13; i++) {
      const ti = t3 - i * F1, f = c8_fr(ti, LH.start), tw8 = i === 6;
      if (f >= 0) gang.push({ key: tw8 ? 'twin' : 'g' + (i - (i > 6)), pos: [lerp(G[0], G[1], i / 12), G[3]], y: G[2], size: tw8 ? G[4] + 1 : G[4], sy: [.15, .5, .85, 1][Math.min(f, 3)], flip: !!(i & 1), voice: 'choir', ...c8_pose(ti) });
    }
    const sts = c8_3d(t3, { blocks: [['you', [-520, 0, 0]]], bare: dv, riser: dv ? null : G, dancers: dv ? [] : gang });
    if (sts) { const e = evLast('stab', t); if (e && e[0] >= T0 && t < c8_you2) { const b = c8_pbox(sts, 'you', 0); punch(e[0], R(b.x + b.w / 2), R(b.y + b.h / 2), [2, 2], t); } }
    c8_rings(t, px, py);
    const hero = () => (c8_hero = c8_dancer(W - 160, H - 21, 7, t, { ground: false, ...(t >= c8_you2 ? { eyes: 'dot' } : {}) }));
    if (sts) { const bx = Math.max(...[0, 1].map(i => { const b = c8_pbox(sts, 'you', i); return b.x + b.w; })) + 8; ctx.save(); try { ctx.beginPath(); ctx.rect(bx, -H, 3 * W, 3 * H); ctx.clip(); hero(); } finally { ctx.restore(); } } else hero();   // she never touches the type
    c8_bar(t);
    if (t >= c8_you2 && sts) { const w = LH.words[3].start, l = c8_pbox(sts, 'you', t < w ? 0 : 1), f = c8_fr(t, t < w ? c8_you2 : w), p = f < 3 ? [14, 10, 7][f] : 5; frame(l.x - p, l.y - p, l.w + 2 * p, l.h + 2 * p, VER, 3); }
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
  // deep in the silhouette the black lifts to a mid lime in 4 steps, so the whip never passes through a black frame (flash budget)
  const DIM = '#78a800', c8_lift = t => Math.floor(prog(t, DIVE0, T1 - 3 * F1) * 8 + 1e-6) / 8;
  function c8_youDoL(t) {   // the dive zooms into a still: the outer frame is held at DIVE0 (a pose change magnified is a flash)
    c8_youDo(Math.min(t, DIVE0));
    const a = c8_lift(t); if (a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighten'; rect(0, 0, W, H, mix(BLK, DIM, a)); ctx.restore();
  }
  scene('ch08 dive', DIVE0, T1, t => {
    const D = c8_eye(), pw = D.w;
    diveInto(DIVE0, T1, D.x, D.y, c8_youDoL, 'ch08 lala3', { pw, color: DIM, power: 2, innerAt: 2 * pw, revealAt: 4 * pw + 60, outer: { era: 'lion', raw: true, screen: true }, inner: { era: 'yosemite', raw: true, screen: true } });
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
    // the dive lands on a split, no invert (flash budget)
    if (t >= P2.start) { splitPal(2, P2.start, 3, [WHT, BLK], t); beatFX(t, { snare: false, kick: t >= P2.start + SPB }); punch(P2.start, ...c8_targets()[0], [2, 2], t); }
    c8_record(t);
    const e = evLast('clap', t); if (e && e[0] >= P2.start && c8_fr(t, e[0]) < 14) clickBurst(px, py, e[0], { pointer: false, color: BLK, t });
    const b = c8_bounce(t), tap = b && b !== 'home' && q.words.find(w => c8_fr(t, w.start) >= 0 && c8_fr(t, w.start) < 3);
    if (tap) ring(b[0], b[1], 6 + 4 * c8_fr(t, tap.start), WHT, 2);
    bigType(q.text.toUpperCase(), c8_rowO(q, t));
    // the gang sings along: bounce, mouths on every la; a chop throws E / A and inverts their heads in a ripple
    const ch = evLast('chop', t), cw = evLast('chopWord', t), cf = ch && ch[0] >= P2.start && t < ch[0] + ch[1] ? c8_fr(t, ch[0]) : -1, calm = t >= P2.end - .75 || t < P2.start + 1;   // calm: the first second (out of the dive) and the last 0.75 s sing without inverting heads (flash budget)
    // the hero above the row, singing too: every chop inverts her head for two frames
    const hd = c8_dancer(420, ROWY - 8, 4, t, { field: MAG, pose: 'bounce', voice: 'choir', ground: false, ...(cf >= 0 ? { mouth: { open: .8, shape: cw && cw[2] === 'pen' ? 'E' : 'A' } } : {}) });
    if (cf >= 0 && cf < 2 && !calm) c8_dif(MAG, () => rect(hd.head[0] - 52, hd.head[1] - 8, 104, 88, MAG));
    for (let i = 0; i < 12; i++) {
      const d = c8_dancer(20 + i * 52, H + 8, 2, t, { field: MAG, pose: (i + Math.floor(beatAt(t))) & 1 ? 'clap' : 'bounce', voice: 'choir', ground: false, ...(cf >= 0 ? { mouth: { open: .8, shape: cw && cw[2] === 'pen' ? 'E' : 'A' } } : {}) });
      if (cf >= 0 && cf === i >> 1 && !calm) c8_dif(MAG, () => rect(d.head[0] - 26, d.head[1] - 4, 52, 44, MAG));
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
