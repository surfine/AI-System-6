// ch11 · chorus 3 in A (128-144) · cyan · 2026, full frame. The key-change punch, THE CHORUS LINE in twelve era hats on a
// revolving three.js stage, the silent pen (flat 2D, 1-bit and vermilion), the give-back, the throw, the dive into the ink bead.
'use strict';
{
  // ---- STORYBOARD §4: the home desk, verbatim (c11_ prefix). Used once: the 2026 desk showing through the LAND bar ----
  const MS = ['# The Tide Comes In Twice', 'They never called it renewable energy. They called it the tide, and they billed it by the moon.', 'Twice a day the estuary fills'];
  const INV = c => { const [r, g, b] = rgb(c); return hex(255 - r, 255 - g, 255 - b); };   // pre-invert a colour for FX.invert frames
  const HINT = ['Sounds like you.', 'Sounds like a mouthpiece.'];   // Review Desk's lens hint, the product's words; never a number
  const youProp = s => (x, y, w, h) => { const f = 'menu'; text(s, x + w, y + R((h - capH(f)) / 2), { font: f, align: 'right', color: P.menuText }); };
  let PERIOD = [0, 0];   // the writer's full stop, screen coordinates, set by every homeDesk call
  function c11_homeDesk(t, o = {}) {
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

  // ---- the song's clock (data.js only; literals are offsets) ----
  const LA = lyric('chorus3a'), LAE = lyric('chorus3a_echo'), LB = lyric('chorus3b'), LC = lyric('chorus3c'), LD = lyric('chorus3d'),
    LE = lyric('chorus3e'), LEE = lyric('chorus3e_echo'), LF = lyric('chorus3f'), LG = lyric('chorus3g'), LH = lyric('chorus3h');
  const SEC = section('chorus3'), T0 = SEC.start, T1 = SEC.end, DIVE0 = T1 - 3 / 8;
  const BAND_OUT = hit('bandOut'), KEY = hit('keystroke'), SLAM = hit('slamBack');
  const HOLD1 = LB.words[2].start, THE1 = LB.words[3].start, PEN1 = LB.words[4].start;
  const FLD = FIELDS.cyan, MAG = FIELDS.magenta, VER = FIELDS.vermilion, BLK = C.black, WHT = C.white, PI = Math.PI, F1 = 1 / FPS, S16 = SPB / 4;
  const SIGL = [LA, LAE, LB, LC, LD, LE, LEE, LF, LG, LH];
  const STABS = evTimes('stab'), BELLS = evTimes('bell').filter(b => b >= T0 && b < DIVE0);
  const c11_f = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
  const c11_fr = (t, at) => Math.floor((t - at) * FPS + 1e-6);
  const c11_stab = after => STABS.find(s => s > after);
  const OPT = { era: 'liquidglass', raw: true, screen: t => c11_scr(t) };
  const c11_num = v => (v + '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  function c11_dif(c, fn) { ctx.save(); ctx.globalCompositeOperation = 'difference'; try { fn(); } finally { ctx.restore(); } }
  const c11_box = ls => { const x0 = Math.min(...ls.map(l => l.x)), y0 = Math.min(...ls.map(l => l.y)); return { x: x0, y: y0, w: Math.max(...ls.map(l => l.x + l.w)) - x0, h: Math.max(...ls.map(l => l.y + l.h)) - y0 }; };
  const c11_mid = b => [R(b.x + b.w / 2), R(b.y + b.h / 2)];

  // ---- THE SIGNATURE MOVE: pen = the scribble, pal = the wave, You = the point, do! = the pen point ----
  function c11_sig(t) {
    if (evSince('crash', t) < SPB * .9) return null;
    for (const L of SIGL) for (const w of L.words) if (t >= w.start && t < w.end) {
      const f = c11_f(w.w), st = evSince('stab', t);
      if (f === 'pen') return st < SPB * .9 && t - st > w.start + 1e-3 ? null : { pose: 'pointUp', p: prog(t, w.start, w.end), k: t - w.start };
      if (f === 'pal') return { pose: 'pointCam' };
      if (f === 'you') return { pose: 'pointCam', p: .5 };
      if (f === 'do') return { pose: 'pointUp', p: 1 };
      if (f === 'hold') return { pose: 'pointUp', p: .5 };
      return null;
    }
    return null;
  }
  // three zigzags written in the air from the raised mitten, one per 16th
  function c11_scrib(d, k, s) {
    const h = d.hands[0][1] < d.hands[1][1] ? d.hands[0] : d.hands[1], dir = h[0] < d.head[0] ? -1 : 1, u = Math.max(2, R(s * .8)), lw = Math.max(2, R(s / 2));
    const n = Math.min(3, Math.floor(k / S16 + 1e-6) + 1);
    for (const [c, w] of [[FLD, lw + 4], [BLK, lw]]) for (let i = 0; i < n; i++) {
      const ox = h[0] + dir * (1 + i * 2) * u, oy = h[1] - (4 + i * 5) * u;
      for (let j = 0; j < 4; j++) line(ox + dir * j * 2 * u, oy - (j & 1) * 3 * u, ox + dir * (j + 1) * 2 * u, oy - ((j + 1) & 1) * 3 * u, c, w);
    }
  }
  function c11_dancer(x, y, s, t, o = {}) {
    const g = o.pose ? null : c11_sig(t);
    const d = clioDance(x, y, s, t, { field: FLD, lyric: false, ...(g ? { pose: g.pose, p: g.p } : {}), ...o });
    if (g && g.k != null) c11_scrib(d, g.k, s);
    return d;
  }
  // true when the kit raises the left arm this beat
  const c11_leftUp = t => (Math.floor(beatAt(t)) & 1) === 0;

  // ---- THE CHORUS LINE: twelve in unison, each in one era's hat: one puppet painted once a frame (halo, scribble). It sinks
  // in 4 hard frames when the hero needs the frame alone and pops back in 4 ----
  const LN = 12, LPX = 52, LX0 = 26, LS = 3, LBW = 300, LBH = 320;
  function c11_dy(t, down, up) {
    if (up != null && t >= up) { const f = c11_fr(t, up); return f < 4 ? [112, 76, 40, 14][f] : 0; }
    if (down != null && t >= down) { const f = c11_fr(t, down); return f < 4 ? [20, 48, 84, 120][f] : 140; }
    return 0;
  }
  let c11_ldy = 140;   // this frame's line offset (140: no line), read by the writer's corner word
  const c11_pup = (t, o) => { const b = styleBuf('c11line', LBW, LBH, true); let d; paintInto(b, () => { d = c11_dancer(LBW / 2, LBH - 26, LS, t, { ground: false, voice: '*', seed: 0, ...(o.dance || {}) }); }); return { b, d }; };
  // 3D from the key change's fifth frame (the stage, below); 2D before it (ch10's flood) and without WebGL. No 3D in the
  // silent pen: the world goes with the sound and slams back with it
  function c11_line(t, o = {}) {
    const dy = c11_ldy = Math.min(140, o.dy || 0);
    if (t >= CUT3 && (t < BAND_OUT || t >= SLAM) && c11_stage(t, o, o.sink ?? dy)) return;
    if (dy >= 140) return;
    const { b, d } = c11_pup(t, o);
    for (let i = 0; i < LN; i++) { const ox = LX0 + i * LPX - LBW / 2, oy = H - 8 + dy - (LBH - 26); ctx.drawImage(b, ox, oy); c11_hat(i, d.head[0] + ox, d.head[1] + oy); }
  }
  // the era hats: a 16x8-unit silhouette per era, its trait cut out in the field, a 2 px field halo; (cx, y) = the head's top
  const HW = 16 * LS, HH = 8 * LS;
  const c11_hatC = i => memo('c11hat' + i, HW + 16, HH + 8, () => { for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) c11_hatArt(i, 8 + dx, 4 + dy, FLD); c11_hatArt(i, 8, 4); });
  function c11_hat(i, cx, y) { ctx.drawImage(c11_hatC(i), R(cx - HW / 2) - 8, R(y) - HH + LS - 4); }
  function c11_hatArt(i, x, y, K = BLK) {
    const w = HW, F = FLD, id = APPEARANCES[i].id;
    switch (id) {
      case 'system6': rect(x, y + 6, w, 18, K); for (const r of [9, 15]) rect(x + 3, y + r, w - 6, 3, F); break;                          // the racing stripes
      case 'system7': rect(x, y + 6, w, 18, K); bayer(x + 3, y + 9, w - 6, 12, .5, F, null); break;                                          // the shaded band
      case 'nextstep': rect(x + 9, y, w - 18, 20, K); rect(x, y + 18, w, 6, K); rect(x + 9, y + 13, w - 18, 2, F); break;                    // the black bar, a top hat
      case 'drawingboard': rect(x, y + 10, w - 12, 12, K); poly([[x + w - 12, y + 10], [x + w, y + 16], [x + w - 12, y + 22]], K); rect(x + 7, y + 10, 2, 12, F); break;   // the pencil
      case 'platinum': rect(x + 2, y + 4, w - 4, 20, K); rect(x + 5, y + 7, w - 10, 2, F); rect(x + 5, y + 7, 2, 14, F); break;              // the bevel
      case 'aqua': rrect(x, y + 6, w, 18, 9, K); rrect(x + 8, y + 8, w - 16, 5, 3, F); break;                                               // the pill, its gel
      case 'tiger': rect(x, y + 6, w, 18, K); for (let r = y + 9; r < y + 22; r += 3) for (let c = x + 3; c < x + w - 3; c += 2) if (hash(c * 3.1 + r * 7.7) < .55) rect(c, r, 2, 1, F); break;   // brushed metal
      case 'snowleopard': rrect(x + 2, y + 2, w - 4, 22, 11, K); bayer(x + 8, y + 5, w - 16, 7, .5, F, null); break;                          // the gloss dome
      case 'lion': rect(x, y + 17, w, 7, K); for (let j = 0; j < 3; j++) { disc(x + 8 + j * 16, y + 13, 7, K); disc(x + 8 + j * 16, y + 13, 2, F); } break;   // the three lamps
      case 'yosemite': rect(x - 4, y + 18, w + 8, 6, K); rect(x + 6, y + 10, w - 12, 6, K); break;                                           // flat bars
      case 'bigsur': rrect(x, y + 6, w, 18, 8, K); rframe(x + 3, y + 9, w - 6, 12, 5, F, 1); break;                                          // the rounded bar
      default: poly([[x, y + 14], [x + 12, y + 3], [x + w - 12, y + 3], [x + w, y + 14], [x + w - 12, y + 24], [x + 12, y + 24]], K); bayer(x + 10, y + 17, w - 20, 5, .25, F, null); line(x + 12, y + 9, x + 20, y + 7, F, 2); break;   // the glass lozenge, a glint
    }
  }

  // ---- THE REVOLVING STAGE (three.js): a turntable (cyan top ruled with rings, twelve spokes and hour marks, a black drum
  // ringed with marquee bulbs) on a floor grid. The twelve are CARDS: the 2D puppet, its 2 px field halo included, and each
  // one's era hat, painted by the 2D kit once a frame and stood up in the world parallel to the lens. Nearest, no mips: a
  // dancer stays the crisp puppet of the 2D line at any distance (shrunk at most 2x, every 3 px unit keeps a pixel), solid
  // black, and its cyan halo cuts it off the one behind; only the floor, the table's rings and the fog dither. A world unit
  // is a pixel of the 2D line: at CUT3 the camera sits where the 3D line lands exactly on the 2D one. Two formations: the
  // LINE across the diameter and the RING (the twelve round the rim like the hours of a music box). The camera keys are in
  // the table's frame (c11_cam), so an orbit is an orbit of the line, whatever the table does ----
  const CUT3 = T0 + 4 * F1, PX3 = 60, RT = 420, DRUM = 56, NB = 60, RING = 260, P3 = [FLD, BLK, WHT];
  function c11_top() {
    const c = 192; disc(c, c, c - 1, FLD);
    for (const [r, w] of [[c - 4, 4], [R(RING * c / RT) + 22, 2], [R(RING * c / RT) - 22, 2], [70, 3]]) ring(c, c, r, BLK, w);
    for (let i = 0; i < 12; i++) { const a = i * PI / 6; line(R(c + 70 * Math.cos(a)), R(c + 70 * Math.sin(a)), R(c + (c - 6) * Math.cos(a)), R(c + (c - 6) * Math.sin(a)), BLK, 2); }
    for (let i = 0; i < 12; i++) { const a = (i + .5) * PI / 6, r = RING * c / RT; rect(R(c + r * Math.cos(a)) - 3, R(c + r * Math.sin(a)) - 3, 6, 6, BLK); }   // the hour marks
    disc(c, c, 26, BLK); disc(c, c, 10, FLD);
  }
  function c11_build(st) {
    st.scene.fog = new THREE.Fog(0, 1500, 3600);   // set from the camera each frame: the grid dissolves just past the table
    // the dance floor: a round patch of grid round the table (a segment per cell: an end behind the eye drops a line)
    const g = 150, N = 5, pts = [], inF = (x, z) => Math.hypot(x, z) < N * g;
    for (let i = -N; i <= N; i++) for (let j = -N; j < N; j++) { if (inF(i * g, j * g + g / 2)) pts.push(i * g, -DRUM, j * g, i * g, -DRUM, j * g + g); if (inF(j * g + g / 2, i * g)) pts.push(j * g, -DRUM, i * g, j * g + g, -DRUM, i * g); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); st.scene.add(new THREE.LineSegments(lg, lineMat3d()));
    st.o.floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-PI / 2).translate(0, -DRUM - 1, 0), mat3d({ color: FLD, solid: true })); st.scene.add(st.o.floor);   // only while the table rises through it
    const T = st.o.turn = new THREE.Group(); st.scene.add(T);
    T.add(new THREE.Mesh(new THREE.CircleGeometry(RT, 72).rotateX(-PI / 2), mat3d({ map: tex3d('c11top', 384, 384, c11_top, { mip: true }), solid: true })));
    T.add(new THREE.Mesh(new THREE.CylinderGeometry(RT, RT, DRUM, 72, 1, true).translate(0, -DRUM / 2, 0), mat3d({ color: BLK, solid: true })));
    st.o.bulbs = [0, 1, 2].map(k => { const b = []; for (let i = k; i < NB; i += 3) { const a = i / NB * 2 * PI; b.push({ w: 12, h: 12, d: 4, pos: [Math.sin(a) * (RT + 1), -DRUM / 2, Math.cos(a) * (RT + 1)], ry: a, cols: Array(6).fill(WHT) }); } const q = new THREE.Mesh(bandGeo(b), mat3d({ vc: true, solid: true })); T.add(q); return q; });
    // the twelve: one card geometry (origin at the puppet's ground point), one instanced draw for the bodies, a card per hat
    const pg = new THREE.PlaneGeometry(LBW, LBH).translate(0, LBH / 2 - 26, 0);
    st.o.body = new THREE.InstancedMesh(pg, mat3d({ map: tex3d('c11pup', LBW, LBH, () => {}), fog: false, side: 'double' }), LN); st.o.body.frustumCulled = false; st.scene.add(st.o.body);
    st.o.D = Array.from({ length: LN }, (_, i) => {
      const d = new THREE.Group(), hat = new THREE.Mesh(new THREE.PlaneGeometry(HW + 16, HH + 8), mat3d({ map: tex3d('c11hat' + i, HW + 16, HH + 8, () => ctx.drawImage(c11_hatC(i), 0, 0)), fog: false, side: 'double' }));
      d.add(hat); st.scene.add(d); return { d, hat };
    });
  }
  // keys: [[t, value, ease]], eased INTO a key (EASE3 names)
  const c11_kf = (t, ks) => { let i = 0; while (i < ks.length - 1 && t >= ks[i + 1][0]) i++; const a = ks[i], b = ks[i + 1]; return !b || t <= a[0] ? a[1] : lerp(a[1], b[1], EASE3[b[2] || 'lin'](prog(t, a[0], b[0]))); };
  // an orbit of the table (r, azimuth a from the line's front, height h), looking at (0, ly, 0) in the table's frame
  // (side: the look point that far to the camera's right, so the table sits left of centre)
  const OB = (r, a, h, ly, side = 0, roll = 0) => ({ ...orbit3d([0, 0, 0], r, a, h), look: [side * Math.cos(a), ly, -side * Math.sin(a)], roll });
  const CUTK = { pos: [0, 172, D3], look: [0, 172, 0], roll: 0 };   // the 2D line exactly: ground at y 352, 52 px apart, 1:1
  let CAM3 = null, TURN3 = null, FORM3 = null, SP3 = null;
  function c11_keys() {
    if (CAM3) return;
    const PAL1 = LA.words[4].start, PW = LF.words[4].start;
    CAM3 = [[CUT3, CUTK],
      // the crane: up and back off the hat line to the music box (lower left, under PEN and left of PAL), the line opening
      // into the ring; the ring revolves past the lens, then settles low under THE for the silent pen
      [CUT3 + 11 * F1, OB(900, -.5, 400, 230, 200), 'snap'], [PAL1, OB(1100, -.9, 500, 168, 350), 'hard'], [LB.start, OB(1100, .9, 500, 168, 350), 'lin'], [LB.start + .5, OB(1100, 1.2, 480, 175, 240), 'lin'], [BAND_OUT, OB(1100, 1.5, 480, 175, 240), 'lin'],
      // the slam back: low, three-quarter, the line slanting away behind the hero
      [SLAM, OB(860, -.55, 250, 190), 'cut'], [LD.start, OB(780, -.4, 230, 190), 'lin'], [LE.start - F1, OB(760, -.35, 230, 190), 'lin'],
      // THE HERO ORBIT: a half turn and more round the line, broadside, end-on (a column at the lens) on "pen", broadside from behind
      [LE.start, OB(1250, -.25, 360, 250), 'cut'], [LEE.start, OB(1250, PI - .1, 360, 250), 'lin'], [LF.start - F1, OB(1250, PI + .1, 360, 250), 'lin'],
      // the give-back: down low, the empty stage a marquee drum along the bottom behind the hero; on WHO the twelve pop up
      // through its traps as the camera pushes in to the hat line
      [LF.start, OB(1300, PI + .4, 70, 220, -250), 'cut'], [PW + .25, OB(1300, PI + .2, 70, 220, -250), 'lin'], [LG.start + .25, OB(880, PI, 200, 216), 'hard'],
      [LH.start, OB(880, PI, 200, 216), 'lin'], [LH.start + 4 * F1, OB(1050, PI, 200, 235, -20), 'hard'], [DO2, OB(1030, PI - .05, 200, 235, -20), 'lin']];
    // the table spins under the camera keys (the floor drifts); its own revolve is in the keys' azimuths
    TURN3 = [[CUT3, 0], [T1, .9, 'lin']];
    // the line's spacing: the 2D line's 52 at the cut, opening to 60, wider in the close shots so every silhouette reads
    SP3 = [[PAL1, 60], [LE.start, 60], [LE.start + F1, 66, 'cut'], [LF.start, 66], [LG.start, 76, 'cut']];
    FORM3 = [[CUT3, 0], [CUT3 + .15, 0], [PAL1, 1, 'hard'], [LB.start + 8 * F1, 1], [LB.start + 9 * F1, 0, 'cut']];
  }
  // the dancer's place on the table: the line (spacing px) or the ring, the even ones to the front half, the odd to the back
  function c11_place(i, px, ox, k) {
    const j = i >> 1, a = (-75 + 30 * j) * PI / 180, s = i & 1 ? -1 : 1, lx = (i - 5.5) * px + ox;
    return [lerp(lx, RING * Math.sin(a), k), lerp(0, s * RING * Math.cos(a), k)];
  }
  function c11_stage(t, o, sink) {
    const st = stage3d('ch11 stage', c11_build); if (!st) return false;
    c11_keys();
    const S = st.o, th = c11_kf(t, TURN3), c = Math.cos(th), s = Math.sin(th), rot = p => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
    const ks = cam3d(t, CAM3), cs = { ...ks, pos: rot(ks.pos), look: rot(ks.look) };
    aim3d(st.cam, cs);
    const d0 = Math.hypot(...cs.pos); st.scene.fog.near = d0; st.scene.fog.far = d0 + 560;
    const sl = c11_fr(t, SLAM), ty = sl >= 0 && sl < 5 ? [-320, -120, 28, 8, 0][sl] : 0;
    S.turn.rotation.y = th; S.turn.position.y = ty; S.floor.visible = ty < 0;
    S.bulbs.forEach((q, j) => matOf(q).color.set(j === Math.floor(beatAt(t) * 4 + 1e-6) % 3 ? WHT : FLD));   // chasing on the 16ths
    const on = sink < 140;
    S.body.visible = on; S.D.forEach(D => { D.d.visible = on; });
    if (on) {
      const pp = c11_pup(t, o), u = new Uint32Array(pp.b.getContext('2d').getImageData(0, 0, LBW, LBH).data.buffer);
      let h = 2166136261; for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619);
      tex3d('c11pup', LBW, LBH, () => ctx.drawImage(pp.b, 0, 0), { live: h >>> 0 });
      const yaw = Math.atan2(cs.pos[0] - cs.look[0], cs.pos[2] - cs.look[2]), cp = new THREE.Vector3(...cs.pos), v = new THREE.Vector3();
      const sp = EASE3.hard(prog(t, CUT3, LA.words[4].start)), px = t < LA.words[4].start ? lerp(LPX, PX3, sp) : c11_kf(t, SP3), ox = lerp(LX0 + 5.5 * LPX - W / 2, 0, sp), fk = c11_kf(t, FORM3);
      const [hx, hy] = [pp.d.head[0] - LBW / 2, LBH - 26 - pp.d.head[1] + 9];
      S.D.forEach((D, i) => {
        const [lx, lz] = c11_place(i, px, ox, fk), p = rot([lx, ty - sink, lz]);
        // drawn in the 2D line's order: each a hair nearer the lens along its own ray, scaled to keep its size exactly
        v.set(...p).sub(cp); const k = 1 - .2 * i / v.length();
        D.d.position.copy(cp).addScaledVector(v, k); D.d.rotation.set(0, yaw, 0); D.d.scale.setScalar(k);
        D.hat.position.set(hx, hy, .1);
        D.d.updateMatrix(); S.body.setMatrixAt(i, D.d.matrix);
      });
      S.body.instanceMatrix.needsUpdate = true;
    }
    render3d(st, { pal: P3, bg: null });
    return true;
  }

  // ---- the writer: the pointer holds the white pen on its cord. Hanging: the nib at (px + 5 + swing, py + 175) ----
  const c11_spr = (a, fl) => memo('c11pen' + a + fl, 320, 320, () => pen(160, 160, a, 4, { t: fl ? T0 : T0 + .1, flash: fl }));
  function c11_pen(t, px, py, o = {}) {
    const sw = o.still ? 0 : R((o.swing ?? 6) * Math.sin(beatPhase(t, 2) * PI * 2)), a = o.a ?? PI / 2, lift = R(o.lift || 0);
    const [bx, by] = o.back || (a > 1.2 ? [px + 5 + sw, py + 29 - lift] : [px + 12, py + 22]);
    const tip = [R(bx + Math.cos(a) * 146), R(by + Math.sin(a) * 146)];
    penCord([[px + 5, py + 15], [bx, Math.max(py + 17, by - 2)]], { sag: o.sag ?? 22, swing: o.cs ?? 4, t });
    if (a === 0 || a === PI / 2) ctx.drawImage(c11_spr(a, o.flash !== false && evFrames('kick', t) === 0), tip[0] - 160, tip[1] - 160);
    else pen(tip[0], tip[1], a, 4, { t, flash: false });
    CUR = { x: px, y: py, kind: 'arrow', down: o.down };
    return tip;
  }
  // white rings rippling from the nib on the "pen" bells
  function c11_ripple(t, x, y) {
    for (const b of BELLS) { const d = t - b; if (d < 0 || d >= .4) continue; for (let j = 0; j < 2; j++) { const dd = d - j * .1; if (dd >= 0) ring(x, y, 10 + 4 * Math.floor(dd * 40), WHT, 2); } }
  }
  // every clap: square rings at the pointer (under the type) and TWELVE pointer copies (drawn last)
  function c11_rings(t, px, py) { const e = evLast('clap', t); if (e && e[0] >= T0 && c11_fr(t, e[0]) < 14) c11_dif(FLD, () => clickBurst(px, py, e[0], { pointer: false, color: FLD, t })); }
  function c11_copies(t, px, py, n = 12) { const e = evLast('clap', t); if (e && e[0] >= T0 && c11_fr(t, e[0]) < 5) for (let i = n - 1; i >= 1; i--) { const k = Math.ceil(i / 2); pointer(px + (i & 1 ? 3 : 1) * k, py + 2 + 3 * k, 'arrow', { down: true }); } }

  // every chorus frame starts here: the field, the owed split, the beat FX. Flash safety: no white flash or owed invert at the
  // key change (the punch-off is the hit), the phrase invert only at 136, no stab punch on 128 or the slam back
  function c11_base(t, hero, steps) {
    rect(0, 0, W, H, FLD); c11_ldy = 140;
    splitPal(2, T0, 3, [WHT, BLK], t);
    if (t < BAND_OUT || t >= SLAM) beatFX(t, { anyCrash: true, kick: t >= LE.start && t < LF.start });   // the band is out between "the" and the slam back
    const e = evLast('stab', t); if (e && hero && e[0] > T0 && e[0] !== SLAM) punch(e[0], ...hero, steps, t);
  }
  // the punch-off without the invert, 2x and shake: the stage-2 bars slide off in 4 frames
  const c11_scr = t => { const r = screenSize(t); return r && r.punch ? { ...r, punch: null } : r; };
  function c11_bars(t) {
    const f = c11_fr(t, T0); if (f < 0 || f >= 4) return;
    const bw = R((FW - SCREENS[2].w) / 2 * (1 - (f + 1) / 4)), bh = R((FH - SCREENS[2].h) / 2 * (1 - (f + 1) / 4));
    rect(0, 0, bw, H, BLK); rect(W - bw, 0, bw, H, BLK); rect(0, 0, W, bh, BLK); rect(0, H - bh, W, bh, BLK);
    for (let y = 3; y < H; y += 7) { const len = 6 + Math.floor(hash(y * 1.7) * 18); rect(bw, y, len, 1, BLK); rect(W - bw - len, y, len, 1, BLK); }
  }
  let c11_sc = null;
  function c11_meas(str, o) { let r; c11_sc = c11_sc || Object.assign(document.createElement('canvas'), { width: 8, height: 8 }); const sw = W, sh = H; offscreen(8, 8, () => { W = sw; H = sh; r = bigType(str, o); }, c11_sc); W = sw; H = sh; return r; }
  function c11_lines(lines, o, per) {
    const m = bigType(lines, { ...o, pass: 'slab', invert: false });
    return m.lines.map((l, i) => bigType(lines[i], { ...o, fitH: 0, ...per[i], x: l.x, y: l.y, valign: 'top', align: 'left', min: l.sy, max: l.sy }));
  }

  // ---- props ----
  // the postmark: a black stamp, PEN PAL and the year cut out, wavy cancel bars the tambourine rattles
  function c11_postmark(t, t0, cx, cy) {
    const fr = c11_fr(t, t0); if (fr < 0) return;
    const r = 66 + [10, 6, 3, 0][Math.min(fr, 3)], rt = evFrames('tambourine', t) < 2 ? (evIndex('tambourine', t) & 1 ? 1 : -1) : 0;
    if (fr < 2) FX.shake = Math.max(FX.shake || 0, 3 - fr);
    for (const dy of [-14, 6]) for (let x = cx + r - 6; x < W + 4; x += 4) rect(x, cy + dy + rt + R(3 * Math.sin((x - cx) / 10)), 4, 7, BLK);
    disc(cx, cy, r, BLK); ring(cx, cy, r - 5, FLD, 2); ring(cx, cy, r - 9, FLD, 1);
    text('PEN PAL', cx, cy - 24, { font: 'chicago', scale: 2, color: FLD, align: 'center' });
    text(String(ERA.liquidglass.year), cx, cy + 2, { font: 'chicago', scale: 2, color: FLD, align: 'center' });
    rect(cx - 36, cy + 26 + rt, 72, 2, FLD); rect(cx - 24, cy + 31 - rt, 48, 2, FLD);
  }
  function c11_air() {
    ctx.drawImage(memo('c11air' + W + 'x' + H, W, H, () => {
      for (let y = 0; y < H; y++) {
        const edge = y < 8 || y >= H - 8;
        for (let x = -16 + (y % 16); x < W; x += 16) { if (edge) rect(x, y, 8, 1, BLK); else { if (x < 8) rect(Math.max(0, x), y, Math.min(8, x + 8) - Math.max(0, x), 1, BLK); if (x + 8 > W - 8) rect(Math.max(W - 8, x), y, x + 8 - Math.max(W - 8, x), 1, BLK); } }
      }
    }), 0, 0);
  }
  // the Two Floppies bar: fills on 16ths, stops at 98.4% for the third time
  function c11_bar(t) {
    const sp = evList('riser').find(r => r[0] >= T0 && r[0] < T1) || [T1 - 2, T1], t0 = sp[0], n = Math.min(16, Math.max(0, Math.floor((t - t0) / S16 + 1e-6) + 1));
    if (t < t0) return;
    const x = 8, y = H - 20, w = W - 16, ix = x + 34, iw = w - 38, k = n / 16 * .984, bytes = R(2902645 * n / 16);
    rect(x, y - 2, w, 16, BLK);
    rect(x + 6, y + 1, 18, 10, FLD); rect(x + 10, y + 1, 9, 4, BLK); rect(x + 16, y + 2, 2, 2, FLD); rect(x + 9, y + 7, 12, 4, BLK);
    rect(ix, y + 1, R(iw * k), 10, FLD);
    if (n >= 16 && (Math.floor(t * FPS) >> 2) & 1) frame(ix + R(iw * k), y + 1, iw - R(iw * k), 10, FLD);
    c11_dif(FLD, () => { text('TWO FLOPPIES', ix + 6, y + 2, { font: 'chicago', color: FLD }); text(c11_num(bytes) + ' / 2,949,120 B', ix + iw - 6, y + 2, { font: 'chicago', color: FLD, align: 'right' }); });
  }
  function c11_dith(k) {
    if (k <= 0) return; if (k >= 1) return rect(0, 0, W, H, BLK);
    const q = R(k * 16), w = Math.ceil(W / 2), h = Math.ceil(H / 2);
    ctx.drawImage(memo('c11d' + q + 'x' + W, w, h, () => bayer(0, 0, w, h, q / 16, BLK, null)), 0, 0, w * 2, h * 2);
  }
  // the 2026 desk as a sparse stencil (dark pixels, one in eight) right of the type: the glass is translucent
  function c11_glass() {
    return memo('c11glass', FW, FH, () => {
      const c = frameInto(styleBuf('c11G'), LC.words[4].start, tt => c11_homeDesk(tt, { cur: [300, 24] }), { era: 'liquidglass' });
      const d = c.getContext('2d').getImageData(0, 0, FW, FH), u = new Uint32Array(d.data.buffer);
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const i = y * FW + x, v = u[i], l = (v & 255) * .299 + ((v >> 8) & 255) * .587 + ((v >> 16) & 255) * .114; u[i] = x >= 290 && l < 112 && BAYER4[(y & 3) * 4 + (x & 3)] < 2 ? 0xff000000 : 0; }
      ctx.putImageData(d, 0, 0);
    });
  }
  // built at boot (no first-use hitch): the glass, the dither steps, the stage with its shaders and hats
  warmUp(() => { const sw = W, sh = H; try { W = FW; H = FH; c11_glass(); paintInto(styleBuf('c11warm', 8, 8), () => { for (const k of [.2, .4, .6, .8]) c11_dith(k); }); if (has3d()) paintInto(styleBuf('c11w3'), () => c11_stage(CUT3, {}, 0)); } finally { W = sw; H = sh; } });
  // the writer's typed word stays bottom left from the slam back (it slides there from the slot in 4 steps)
  const CORNER = () => [12, Math.min(H - 52, H - 171 + c11_ldy)];
  function c11_corner(t) {
    if (t < SLAM) return;
    const f = c11_fr(t, SLAM), [cx, cy] = CORNER(), s = c11_slot(), k = Math.min(1, (f + 1) / 4);
    const x = R(lerp(s.x, cx, k)), y = R(lerp(s.y, cy, k));
    rect(x - 4, y - 4, 98, 35, BLK);   // on its own black label
    bigType('PEN.', { x, y, valign: 'top', align: 'left', scale: 3, min: 3, max: 3, color: VER });
  }

  // ===================================================================================================
  // 128.0 / 135.25: PEN PAL round the pen at the top centre (the 9:16 column); the line star-jumps on the crash, then
  // scribbles and waves; the postmark 2026 and the airmail border on the echo
  // ===================================================================================================
  const PENO = () => ({ justify: 260, x: 284, y: 38, valign: 'top', align: 'right' }), PALO = () => ({ justify: 230, x: W - 254, y: 126, valign: 'top', align: 'left' });
  function c11_penpal(t, La, Le, first) {
    const tt = first ? Math.max(t, T0) : t, pm = Le.words[0].start, pm2 = Le.words[1].start, mid = pm <= t && t < Le.end;
    const lay = bigType('PEN', { ...PENO(), t: tt, pass: 'slab', invert: false }), l0 = lay.lines[0];
    c11_base(t, first ? c11_mid(l0) : [l0.x + 4 * l0.sx, R(l0.y + l0.h / 2)], [2, 2]);
    if (!first) invertFrame(La.start, 1, t);   // the sax
    let px = W / 2 - 5, py = 6;
    if (!first && t < La.start + 4 * F1) px = R(lerp(PXF, px, (c11_fr(t, La.start) + 1) / 4));   // the pointer hops home from the fade
    c11_rings(t, px, py);
    c11_line(tt, { dy: first ? 0 : c11_dy(t, null, La.start) });
    if (mid) c11_postmark(t, pm, W - 154, 70);
    bigType("I'M JUST YOUR", { t: tt, words: La, ghost: true, scale: 3, min: 3, max: 3, x: 24, y: 8, valign: 'top', align: 'left' });
    if (first) { bigType('PEN', { ...PENO(), t: tt, words: La, ghost: true }); bigType('PAL', { ...PALO(), t: tt, words: La, ghost: true }); }   // no block slam: it would overshoot into the bars
    else {
      bigType('PEN', { ...PENO(), t, words: La, ghost: true, stepIn: { t0: La.words[3].start, div: 4, enter: 'slam' } });
      bigType('PAL', { ...PALO(), t, words: La, ghost: true, stepIn: { t0: La.words[4].start, div: 4, enter: 'drop' } });
    }
    if (mid && t >= pm2) c11_air();
    c11_corner(t);
    if (t < T0) return;   // under ch10's flood its own pen and pointer are the writer's
    const tip = c11_pen(t, px, py);
    c11_ripple(t, tip[0], tip[1]);
    c11_copies(t, px, py);
    if (first) c11_bars(t);
  }
  scene('ch11 reboot', T0, LB.start, t => c11_penpal(t, LA, LAE, true), OPT);

  // ===================================================================================================
  // 129.75: I'LL NEVER HOLD THE [PEN.]: the line sinks, the hero; on "hold" the writer hoists the pen out of the frame.
  // 131.25: THE SILENCE IS DRAWN: 1-bit paper, a held 2x punch, a vermilion I-beam; 131.625: one keystroke types PEN.
  // ===================================================================================================
  const COL = () => ({ x: R((W - 202) / 2), w: 202 }), SLOTY = 160;
  const ZX = 384, ZY = SLOTY + 20;   // the 2x view: x 192..512, y 90..270
  const LOWPY = t => R(ZY / 2) - 177 + c11_fr(t, KEY);   // the nib re-enters a pixel a frame
  let c11_sl = null;
  function c11_slot() {   // the second line laid out once: THE's letter boxes and the PEN. box (the slot)
    if (c11_sl) return c11_sl;
    const m = c11_meas('THE PEN.', { justify: COL().w, x: COL().x, y: SLOTY, valign: 'top', align: 'left' });
    return (c11_sl = { the: m.letters.slice(0, 3), pen: m.letters.slice(3), ...c11_box(m.letters.slice(3)), sy: m.lines[0].sy });
  }
  const c11_glyph = (l, o) => bigType(l.ch, { x: l.x, y: l.y, valign: 'top', align: 'left', justify: l.w, min: 3, max: 3, ...o });
  function c11_silent(t) {
    const frozen = t >= BAND_OUT, tt = frozen ? BAND_OUT : t, s = c11_slot();
    c11_base(t, null);
    if (frozen) { FX.posterize = [WHT, BLK, VER]; stepZoom(2, ZX, ZY); }
    let px = W / 2 - 5, py = 6;
    if (t >= HOLD1) py = 6 - [0, 46, 96, 146, 186][Math.min(4, Math.floor((t - HOLD1) / S16 + 1e-6) + 1)];
    if (t >= KEY) py = LOWPY(t);
    c11_rings(t, px, py);
    c11_line(t, { dy: c11_dy(t, LB.start, null) });
    const f0 = c11_fr(t, LB.start), rise = f0 < 4 ? [96, 64, 32, 8][f0] : 0, up = t >= HOLD1;
    // the hero pops up right of the slot, reaches on "hold", freezes when the band drops
    c11_dancer(W / 2 + 100, H - 2 + rise, 5, tt, up ? { pose: 'pointUp', p: .5, flip: c11_leftUp(tt), ...(frozen ? { mouth: { open: .6, shape: 'E' } } : {}) } : {});
    if (!frozen) {   // the line goes with the colour
      bigType("I'LL NEVER", { t, words: LB, ghost: true, x: 16, y: 40, valign: 'top', align: 'left', scale: 4, min: 4, max: 4, ...c11_outl(t, LB, "I'LL NEVER", 4) });
      bigType('HOLD', { t, words: LB, ghost: true, x: W - 16, y: 56, valign: 'top', align: 'right', scale: 8, min: 8, max: 8, stepIn: { t0: HOLD1, div: 4, enter: 'drop' }, ...c11_outl(t, LB, 'HOLD', 8) });
    }
    for (const l of s.the) c11_glyph(l, { t, words: { words: [{ w: l.ch, start: THE1, end: PEN1 }] }, ghost: true });
    if (frozen) {
      const kf = c11_fr(t, KEY), typed = kf >= 0, down = typed && kf < 2;
      if (down) rect(s.x - 4, s.y - 4, s.w + 8, s.h + 8, BLK);   // key-down
      if (typed) for (const l of s.pen) c11_glyph(l, { color: down ? WHT : VER, y: l.y - (kf < 2 ? [2, 1][kf] : 0) });
      const on = Math.floor((t - (typed ? KEY : BAND_OUT)) / S16 + 1e-6) % 2 === 0;
      if (on) rect(typed ? s.x + s.w + 4 : s.x - 6, s.y - 2, 4, s.h + 4, VER);
    }
    if (t >= KEY) { const tip = c11_pen(t, px, py, { still: true, cs: 0 }); c11_ripple(t, tip[0], tip[1]); }
    else if (t < HOLD1 + 4 * S16) { const tip = c11_pen(t, px, py, up ? { still: true, cs: 0 } : {}); c11_ripple(t, tip[0], tip[1]); }
    else CUR = null;
    c11_copies(t, px, py);
  }
  scene('ch11 silent pen', LB.start, LC.start, c11_silent, OPT);

  // ===================================================================================================
  // 132.0: THE SLAM BACK, YOU SAY WHERE I LAND: the hero points, jumps, lands in the split; the 2026 desk shows through on
  // LAND. 134.0: OR I FADE.: only the writer's word survives
  // ===================================================================================================
  const LX = 476, PXL = LX - 158, PXF = LX - 62;
  const c11_lcO = t => ({ t, words: LC, ghost: true, fit: 280, fitH: 146, x: 8, y: 52, valign: 'top', align: 'left' });
  // a 2 px field outline keeps black type off black shapes (off while a word of the line slams in)
  const c11_outl = (t, L, str, sy) => L.words.some(w => str.split(' ').some(x => c11_f(x) === c11_f(w.w)) && t >= w.start && t < w.start + 4 * F1) ? {} : { outline: FLD, outlineW: 2 / sy };
  let c11_tag = [0, 0];
  function c11_land(t) {
    const where = LC.words[2].start, land = LC.words[4].start, faded = t >= LD.start, fade = LD.words[2].start, PX = PXL;
    const lay = faded ? bigType(['OR I', 'FADE.'], { t, words: LD, pass: 'slab', fit: 230, x: 8, align: 'left', y: 112, valign: 'top' }) : bigType(['YOU SAY', 'WHERE I', 'LAND,'], { ...c11_lcO(t), pass: 'slab' });
    const sf = c11_fr(t, SLAM);
    c11_base(t, sf < 2 ? null : c11_mid(lay.lines[faded ? 1 : 0]));
    if (t >= land && t < LC.end) ctx.drawImage(c11_glass(), 0, 0);
    let px = PX, py = 6, a = 0, back = null, sag = 6;
    if (t >= land + SPB / 2) px = PX + [24, 48, 72, 96][Math.min(3, Math.floor((t - land - SPB / 2) / S16 + 1e-6))];
    if (sf < 4) { const k = (sf + 1) / 4, y0 = LOWPY(SLAM); px = R(lerp(W / 2 - 5, PX, k)); py = R(lerp(y0, 6, k)); a = lerp(PI / 2, 0, k); back = [R(lerp(W / 2, PX + 12, k)), R(lerp(y0 + 29, 28, k))]; }
    else if (faded) { const f = c11_fr(t, LD.start); sag = 22; if (f < 4) { a = [.45, .95, 1.4, 1.75][f]; const k = (f + 1) / 4; back = [R(lerp(px + 12, px + 5, k)), R(lerp(py + 22, py + 29, k))]; } else a = PI / 2; }
    if (!faded) c11_rings(t, px, py);
    c11_line(t, { dy: faded ? c11_dy(t, LD.start, null) : 16, sink: faded ? c11_dy(t, LD.start, null) : 0, dance: t < land ? { pose: 'cheer', p: 1 } : {} });   // the twelve hold the star jump while she crosses (flash safety)
    let x = W - 50, o = { ground: false };
    if (t >= where && t < land) { const k = prog(t, where, land); x = R(lerp(W - 50, LX, easeOut(k))); o.pose = 'jump'; o.p = k < .5 ? .3 : .7; }
    else if (t >= land) { x = LX; if (t < land + SPB) { o.pose = 'cheer'; o.p = prog(t, land, land + SPB); } if (c11_fr(t, land) < 2) FX.shake = Math.max(FX.shake || 0, 2); }
    if (t >= where && t < land + 4 * F1) for (const dx of [0, 1]) dline(LX + dx, 44, LX + dx, H - 12, BLK, 4, 4);
    c11_dancer(x, H - 8, 8, t, o);
    // the fade: 2x2 cells of black on the 16ths
    const k = t >= fade ? Math.min(1, (Math.floor((t - fade) / S16 + 1e-6) + 1) * .2) : 0;
    c11_dith(k);
    const LL = faded ? ['OR I', 'FADE.'] : ['YOU SAY', 'WHERE I', 'LAND,'], per = lay.lines.map((l, i) => c11_outl(t, faded ? LD : LC, LL[i], l.sy));
    if (faded && k < 1) { const l = c11_lines(LL, { t, words: LD, ghost: true, fit: 230, x: 8, align: 'left', y: 112, valign: 'top' }, per)[1].lines[0]; c11_tag = [l.x + l.w - tw('TEMPORARY', 'chicago') - 8, l.y + l.h + 2 * l.sy]; }
    else if (!faded) c11_lines(LL, c11_lcO(t), per);
    if (t >= fade && k < 1) { const [tx, ty] = c11_tag, w = tw('TEMPORARY', 'chicago') + 8; rect(tx, ty, w, 15, BLK); text('TEMPORARY', tx + 4, ty + 3, { font: 'chicago', color: FLD }); }
    c11_corner(t);
    const tip = c11_pen(t, px, py, { a, back, sag });
    c11_ripple(t, tip[0], tip[1]);
    c11_copies(t, px, py);
  }
  scene('ch11 land', LC.start, LE.start, c11_land, OPT);
  scene('ch11 line', LE.start, LF.start, t => c11_penpal(t, LE, LEE, false), OPT);

  // ===================================================================================================
  // 137.75: THE GIVE-BACK: on "hold" the writer lets go, the pen falls, Clio catches it; on "the" the pointer comes down;
  // on "pen." the click and the pen is back. No notice: she does not try again
  // ===================================================================================================
  let c11_gm = null;
  function c11_give(t) {
    const hold = LF.words[2].start, the = LF.words[3].start, pw = LF.words[4].start, st = c11_stab(pw), drop = hold + 2 * F1;
    // the block, laid out once: I'LL NEVER at 4, HOLD at 5, THE PEN. at 6
    if (!c11_gm) {
      const L = [["I'LL NEVER", 4], ['HOLD', 5], ['THE PEN.', 6]].map(([str, k]) => ({ str, k, m: c11_meas(str, { x: 8, y: 0, valign: 'top', align: 'left', scale: k, min: k, max: k }) }));
      let y = R((H - L.reduce((a, l) => a + l.m.h, 0) - 28) / 2) + 4;
      for (const l of L) { l.y = y; y += l.m.h + 14; }
      const b = c11_box(L[2].m.letters.slice(-4)); b.y += L[2].y;
      c11_gm = { L, pen: b };
    }
    const penBox = c11_gm.pen, inv = t >= pw && c11_fr(t, pw) < 2;
    c11_base(t, t >= st ? null : c11_mid(penBox), [2, 2]);
    const [mx, my] = c11_mid(penBox); punch(pw, R((6 * mx - W) / 4), R((6 * my - H) / 4), [3, 3, 2, 2], t);   // PEN. centred in the 3x view
    const PX = W - 56; let px = PX, py = 6;
    if (t < LF.start + 4 * F1) px = R(lerp(W / 2 - 5, PX, (c11_fr(t, LF.start) + 1) / 4));
    if (t >= the && t < pw) py = 6 + [8, 18, 30, 40][Math.min(3, Math.floor((t - the) / (S16 / 2) + 1e-6))];
    else if (t >= pw) py = 6 + (c11_fr(t, pw) < 3 ? [30, 14, 4][c11_fr(t, pw)] : 0);
    if (t < pw) c11_rings(t, px, py);
    c11_line(t, { dy: c11_dy(t, LF.start, null), sink: 140 });   // in 3D the twelve drop through the traps on the cut
    const hx = PX + 5 - 83, hold_ = t >= hold && t < st, f0 = c11_fr(t, LF.start), rise = f0 < 4 ? [96, 64, 32, 8][f0] : 0;
    const d = c11_dancer(hx, H - 8 + rise, 5, t, hold_ ? { pose: 'pointUp', p: .5, flip: c11_leftUp(t) } : {});
    if (inv) rect(penBox.x - 8, penBox.y - 8, penBox.w + 16, penBox.h + 16, BLK);   // type-only invert
    for (const l of c11_gm.L) {
      const o = { t, words: LF, ghost: true, x: 8, y: l.y, valign: 'top', align: 'left', scale: l.k, min: l.k, max: l.k };
      bigType(l.str, inv && l.k === 6 ? { ...o, xor: FLD } : { ...o, ...c11_outl(t, LF, l.str, l.k) });
    }
    // the pen falls 8 px a frame until her mitten stops it; it snaps back up on "pen."
    const hand = hold_ ? d.hands[0] : null, hy = hand ? hand[1] : 72;   // pointUp's raised mitten
    let tip;
    if (t < hold || t >= pw + 3 * F1) tip = c11_pen(t, px, py, t >= pw ? { lift: c11_fr(t, pw) < 6 ? [0, 0, 0, 14, 6, 0][c11_fr(t, pw)] : 0 } : {});
    else if (t < drop) tip = c11_pen(t, px, py, { lift: 40, still: true });
    else {
      const by = Math.min(hy - 22, py + 29 - 40 + 8 * c11_fr(t, drop)), caught = by >= hy - 22, bx = px + 5;
      if (caught && c11_fr(t, pw) >= 0) { const k = (c11_fr(t, pw) + 1) / 3; tip = c11_pen(t, px, py, { back: [bx, R(lerp(by, py + 29, k))], still: true }); }
      else {
        penCord([[px + 5, py + 15], [bx, by - 2]], { sag: caught ? 30 : 48, swing: 0, t });   // slack: the writer let go
        ctx.drawImage(c11_spr(PI / 2, evFrames('kick', t) === 0), bx - 160, by + 146 - 160); tip = [bx, by + 146];
        CUR = { x: px, y: py, kind: 'arrow' };
        if (caught && c11_fr(t, hold) < 20) FX.shake = Math.max(FX.shake || 0, 1);   // the catch
      }
    }
    if (c11_fr(t, pw) >= 4 && c11_fr(t, pw) < 14) clickBurst(px + 5, py + 29, pw + 4 * F1, { pointer: false, color: VER, t });
    c11_ripple(t, tip[0], tip[1]);
    c11_corner(t);
    if (t < pw) c11_copies(t, px, py);
  }
  scene('ch11 give back', LF.start, LG.start, c11_give, OPT);

  // ===================================================================================================
  // 140.0: WHO HOLDS THE PEN?, a letter per 16th; the pen level across the top; all twelve point up at it
  // ===================================================================================================
  scene('ch11 who', LG.start, LH.start, t => {
    const opt = { t, words: LG, ghost: true, justify: W - 16, fitH: 134, x: 8, y: 48, valign: 'top', align: 'left' }, ws = LG.words;
    const lay = bigType(['WHO', 'HOLDS', 'THE PEN?'], { ...opt, pass: 'slab', invert: false });
    c11_base(t, c11_mid(lay.lines[2]));
    const px = 60, py = 4, g = c11_sig(t);
    c11_rings(t, px, py);
    c11_line(t, { dy: c11_dy(t, null, LG.start), dance: g ? {} : { pose: 'pointUp', p: beatPhase(t) } });
    c11_lines(['WHO', 'HOLDS', 'THE PEN?'], opt, [{ stepIn: { t0: ws[0].start, div: 4, enter: 'slam' } }, { stepIn: { t0: ws[1].start, div: 8, enter: 'slam' } }, { stepIn: { t0: ws[2].start, div: 8, enter: 'slam' } }]);
    const bob = R(2 * pulse(t, 1, 6)), tip = c11_pen(t, px, py, { a: 0, back: [W - 186, 24 + bob], sag: 3, cs: 2 });
    c11_ripple(t, tip[0], tip[1]);
    c11_corner(t);
    c11_copies(t, px, py);
  }, OPT);

  // ===================================================================================================
  // 142.0: YOU DO! YOU DO! (the dive's outer frame too); the twelve point at you, then up at the pen. 143.5: THE THROW
  // ===================================================================================================
  const YOU2 = LH.words[2].start, DO2 = LH.words[3].start, NIB = () => [R(W / 2), R(H / 2)];
  function c11_youDo(t) {
    const second = t >= YOU2, Lw = second ? { words: LH.words.slice(2) } : LH, s0 = second ? LH.words[2].start : LH.start, s1 = second ? DO2 : LH.words[1].start;
    const yo = { t, words: Lw, ghost: true, justify: second ? 288 : 264, x: 280, y: 22, valign: 'top', align: 'right', slam: s0 };
    const dO = { t, words: Lw, ghost: true, justify: second ? 260 : 240, x: W - 16 - (second ? 260 : 240), y: 116, valign: 'top', align: 'left', ...(second ? { stepIn: { t0: DO2, div: 8, enter: 'slam' } } : { slam: s1 }) };   // the second DO! a letter a 32nd: the throw is its hit (flash budget)
    const lay = bigType('YOU', { ...yo, pass: 'slab', invert: false }), l0 = lay.lines[0];
    c11_base(t, null);   // no stab punch: the slams are the hit (flash safety)
    const thrown = t >= DO2, tf = c11_fr(t, DO2), [nx, ny] = NIB();
    let px = W / 2 + 3, py = 6;
    if (thrown) { px = W / 2 - 5; py = 6 + (tf < 3 ? [10, 6, 2][tf] : 0); }   // the flick
    c11_rings(t, thrown ? nx : px, thrown ? ny : py);
    const df = c11_fr(t, LH.words[1].start);   // DO! slams the line down into the stage (its overshoot never meets a hat)
    // and the line goes down its traps before the throw, a few pixels a frame (gone at once, it was a flash with DO!'s slam)
    if (!thrown) c11_line(t, { dy: 20, sink: Math.max(df >= 0 && df < 8 ? [30, 26, 20, 14, 9, 5, 2, 1][df] : 0, R(150 * easeIn(prog(t, YOU2 + SPB / 2, DO2)))) });
    c11_bar(t);
    if (c11_fr(t, YOU2) < 2) { rect(l0.x - 2 * l0.sx, l0.y - 2 * l0.sy, l0.w + 4 * l0.sx, l0.h + 4 * l0.sy, BLK); bigType('YOU', { ...yo, xor: FLD }); }   // the E5
    else bigType('YOU', yo);
    bigType('DO!', dO);
    c11_corner(t);
    if (!thrown) c11_pen(t, px, py, { still: true, cs: 0 });
    else {   // the pen at the lens, 4 → 32 on the 16ths, an ink bead on the nib
      const s = [4, 8, 16, 32][Math.min(3, Math.floor((t - DO2) / S16 + 1e-6))];
      penCord([[px + 5, py + 15], [px + 9, py + 52]], { sag: 40, swing: 12, t });   // the empty cord dangles
      pen(nx, ny, PI / 2 + .1, s, { t, flash: false });
      rect(nx - s / 2, ny - s / 2, s, s, VER);
      CUR = { x: px, y: py, kind: 'arrow' };
    }
    c11_copies(t, px, py);
  }
  scene('ch11 you do', LH.start, DIVE0, c11_youDo, OPT);

  // ===================================================================================================
  // 143.625: DIVE 3 into the ink bead; inside it the magenta outro grows on the three bells
  // ===================================================================================================
  const c11_mag = () => rect(0, 0, W, H, MAG);
  scene('ch11 dive', DIVE0, T1, t => {
    const pw = 8, [nx, ny] = NIB(), D = { x: nx - pw / 2, y: ny - pw / 2 }, inner = hasScene('ch12 lala') ? 'ch12 lala' : c11_mag;
    diveInto(DIVE0, T1, D.x, D.y, c11_youDo, inner, { pw, color: VER, power: 2, innerAt: 2 * pw, revealAt: 4 * pw + 60, outer: OPT, inner: OPT });
    const k = prog(t, DIVE0, T1), ZH = FH / pw, zz = clamp(Math.exp(k * k * Math.log(ZH)), 1, ZH), zi = zz < 8 ? zz : Math.min(ZH, R(zz)), bs = zi * pw;
    const f = Math.log(zz) / Math.log(ZH), pan = 1 - (1 - f) ** 3, bx = R(lerp(D.x + pw / 2, FW / 2, pan) - bs / 2), by = R(lerp(D.y + pw / 2, FH / 2, pan) - bs / 2), B = R(bs);
    for (const b of evTimes('bell').filter(b => b >= DIVE0 && b < T1)) { const fr = c11_fr(t, b); if (fr >= 0 && fr < 3) { const g = 3 + fr * 4; frame(bx - g, by - g, B + 2 * g, B + 2 * g, WHT, 2); } }
  }, { era: 'liquidglass', raw: true });
}
