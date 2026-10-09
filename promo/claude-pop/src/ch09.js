// ch09 · the bridge (104.00-120.00): THE WINDOW CORRIDOR (three.js: twelve eras, each a lit HOLD at 1:1 on its chanted year,
// then a dim 3D flight down a corridor of desks to the next, the holds shrinking and the corridor twisting from 2009 so the
// bridge winds up, then the twelve fly into the sheet), the 12-up CONTACT SHEET of our own desk, THE
// FLIP-BOOK (the chrome strobes through history round windows that do not move) and the lock on the negative 1988 that
// ch10 inherits. Scenes: 'ch09 tunnel' (104-116) · 'ch09 sheet' (116-118) · 'ch09 stay' (118-120), all raw full frame.
'use strict';
{
// ---- STORYBOARD §4: the home desk, verbatim (c09_ prefix) ----
const c09_MS = ['# The Tide Comes In Twice', 'They never called it renewable energy. They called it the tide, and they billed it by the moon.', 'Twice a day the estuary fills'];
const c09_INV = c => { const [r, g, b] = rgb(c); return hex(255 - r, 255 - g, 255 - b); };   // pre-invert a colour for FX.invert frames
const c09_HINT = ['Sounds like you.', 'Sounds like a mouthpiece.'];   // Review Desk's lens hint, the product's words; never a number
const c09_youProp = s => (x, y, w, h) => { const f = 'menu'; text(s, x + w, y + R((h - capH(f)) / 2), { font: f, align: 'right', color: P.menuText }); };
let c09_PERIOD = [0, 0];   // the writer's full stop, screen coordinates, set by every homeDesk call
function c09_homeDesk(t, o = {}) {
  const neg = !!o.neg, verm = neg ? c09_INV(FIELDS.vermilion) : FIELDS.vermilion;
  UI.menu = { app: 'AI System 6', prop: c09_youProp(o.hint || c09_HINT[0]), propW: 128, ...(o.menu || {}) };
  const doc = o.doc === false ? null : APP.teachText(8, 30, 268, 164, { title: 'Manuscript', lines: o.lines || c09_MS, ...(o.doc || {}) });
  if (doc) { const r = doc.rows[doc.rows.length - 1]; c09_PERIOD = [r.x + r.w + 1, r.y + capH('doc') - 1]; rect(c09_PERIOD[0], c09_PERIOD[1], 2, 2, verm); }
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
  return { doc, chat, period: c09_PERIOD };
}
const c09_hasScene = n => SCENES.some(s => s.name === n);   // guard before frameInto(…, 'chNN name')

// ---- song times (data.js only; the literals below are offsets, pixels or frame counts) ----
const c09_SEC = section('bridge'), c09_T0 = c09_SEC.start, c09_T1 = c09_SEC.end;
const c09_YEARS = [1988, 1991, 1995, 1998, 1999, 2002, 2005, 2009, 2011, 2014, 2020, 2026];
const c09_ERAS = ['system6', 'system7', 'nextstep', 'drawingboard', 'platinum', 'aqua', 'tiger', 'snowleopard', 'lion', 'yosemite', 'bigsur', 'liquidglass'];
const c09_Y = c09_YEARS.map(y => hit('era_' + y));                          // the chanted years: 104, 105, … 115
const c09_HOLD = i => i <= 6 ? SPB : i === 7 ? SPB / 2 : SPB / 4;          // half a beat to 2005, a quarter for 2009, a 16th from 2011
const c09_TS = hit('contactSheet'), c09_TA = hit('collapse');               // the sheet (116), "And" (118)
const c09_B7 = lyric('b7'), c09_B8 = lyric('b8'), c09_TSTAY = wordAt(c09_B8, 'stay.').start;
const c09_SCR = screenSize(c09_T0);                                         // 608x356: the stage-2 screen, offset (16, 2)
const c09_NIB = [573, 183];                                                 // NIB_HOME_F at 608x356 (§2): the drain's landing punch
const c09_BLK = C.black, c09_WHT = C.white, c09_VER = FIELDS.vermilion;
const c09_fr = (t, at) => Math.floor((t - at) * FPS + 1e-6);

// ---- the desk per era: the home desk, the pointer home, rendered through frameInto inside the historic screen ----
const c09_opt = era => ({ era, screen: true });
const c09_desk = t => c09_homeDesk(t, { cur: [300, 24] });
// 1988 in the tunnel: the crash at 104 is the Trash crumpling IN the Trash (286, 296): the icon's can is wiped to the desktop
// and the crumpling can stands in it (before the pointer and the pen); the icon's own 'Trash' label stays
const c09_crumple = t => () => { clipRect(286, 296, 32, 32, () => desktop()); trashCrumple(276, 276, c09_T0, { t, label: '' }); };
const c09_desk1988 = t => c09_homeDesk(t, { cur: [300, 24], after: t >= c09_T0 - 10 / FPS && t < c09_T0 + 2 * SPB ? c09_crumple(t) : null });
// PERIOD_F(era): the full stop in frame coordinates, read once per era from a dry render (the type metrics move it a few px)
const c09_PF = {};
function c09_periodF(era) {
  let p = c09_PF[era];
  if (!p) { frameInto(styleBuf('c9p'), c09_T0, c09_desk, c09_opt(era)); p = c09_PF[era] = [c09_PERIOD[0] + c09_SCR.x, c09_PERIOD[1] + c09_SCR.y]; }
  return p;
}

// ---- Clio's words on a TEMPORARY plate: 87.5% paper over ink (light enough for the solid letters to read at 1x), marching ants on 8ths, the TEMPORARY tag at (tx, ty) ----
function c09_ghostPlate(x, y, w, h, t, ink, paper, tx, ty, tagInv) {
  rect(x, y, w, h, ink); bayer(x + 1, y + 1, w - 2, h - 2, .875, paper, null); frame(x, y, w, h, paper);
  const ph = Math.floor(beatAt(t) * 2) & 3, seg = (x0, y0, len, hz) => { for (let i = -ph; i < len; i += 4) { const a = Math.max(0, i), b = Math.min(len, i + 2); if (b > a) hz ? rect(x0 + a, y0, b - a, 1, ink) : rect(x0, y0 + a, 1, b - a, ink); } };
  seg(x, y, w, 1); seg(x, y + h - 1, w, 1); seg(x, y, h, 0); seg(x + w - 1, y, h, 0);
  const tg = 'TEMPORARY', tgw = tw(tg, 'small') + 6;
  if (tagInv) [ink, paper] = [paper, ink];
  rect(tx - 1, ty - 1, tgw + 2, 12, paper); rect(tx, ty, tgw, 10, ink); text(tg, tx + 3, ty + 2, { font: 'small', color: paper });
}
// the chant on its plate INSIDE ClioTalk's rect (frame x 24..292): above the Dock band (frame y > 314) and left of the
// icon row (x >= 302), so every era's chrome stays whole. Solid small-font 2x letters (rule 4). The tunnel's plate sits on
// the year slab's foot with the tag on a tab; the stay's plate covers ClioTalk's input row: the line, then the riser
// bar and the tag. Pre-inverted colours in the negative. The letters are SOLID ink with a 1-px paper halo (ch02/ch03), so
// they never melt into the plate's dither; only the plate is temporary. The beep inverts the tag for a frame.
function c09_kara(L, cx, y, t, ink, paper) {   // kara 'pop' (small, 2x), centred, each word with a 1-px halo
  const f = 'small', s = 2, sp = Math.max(s * 3, R(FONTS[fontKey(f)].space * s)), ws = L.words.map(w => tw(w.w, f, s));
  let x = R(cx - (ws.reduce((a, b) => a + b, 0) + sp * (ws.length - 1)) / 2);
  L.words.forEach((w, j) => {
    if (t >= w.start) text(w.w, x, y + R(-3 * s * Math.exp(-14 * (t - w.start)) * Math.cos((t - w.start) * 30)), { font: f, scale: s, color: ink, outline: paper, outlineW: 1 });
    x += ws[j] + sp;
  });
}
function c09_chant(t, L, neg, stay, beep) {
  const ink = neg ? c09_WHT : c09_BLK, paper = neg ? c09_BLK : c09_WHT, x = 24, w = 268, y = stay ? 272 : 284, h = stay ? 40 : 26;
  withEra('system6', () => {
    const tgw = tw('TEMPORARY', 'small') + 6;
    c09_ghostPlate(x, y, w, h, t, ink, paper, x + w - tgw - 6, stay ? y + h - 15 : y - 5, beep);
    c09_kara(L, x + w / 2, y + 6, t, ink, paper);
    const sp = evSpan('riser', t);   // the riser into the breakdown: a bar filling on 16ths, shaking in its last beat
    if (stay && sp && sp[0] >= c09_TA - 1e-6) {
      const N = R((sp[1] - sp[0]) / (SPB / 4)), n = Math.min(N, Math.floor((t - sp[0]) / (SPB / 4) + 1e-6)), bw = w - tgw - 22;
      const bx = x + 8 + (t > sp[1] - SPB ? (c09_fr(t, sp[0]) & 1) : 0), by = y + h - 13;
      rect(bx, by, bw, 6, ink); rect(bx + 1, by + 1, bw - 2, 4, paper); rect(bx + 2, by + 2, R((bw - 4) * n / N), 2, ink);
    }
  });
}

// ---- THE YEAR: poster type slammed over ClioTalk's rect (the chat is the year), white on a black slab. The cowbell jolts the
// figures 2 px right for 2 frames (an invert of the slab would be a flash: it fills a third of the screen's height) ----
const c09_SLAB = [c09_SCR.x + 6, c09_SCR.y + 200, 276];   // its foot follows ClioTalk's (110 high in dock eras: clear of the Dock)
function c09_year(t, i) {
  const cb = evLast('cowbell', t), jolt = !!cb && cb[0] >= c09_T0 && cb[0] < c09_TS && c09_fr(t, cb[0]) < 2 ? 2 : 0;
  const [sx, sy, sw] = c09_SLAB, sh = ERA[c09_ERAS[i]].dock ? 112 : 116;
  rect(sx, sy, sw, sh, c09_BLK);
  bigType(String(c09_YEARS[i]), { scale: 7, color: c09_WHT, invert: true, slab: c09_BLK, pad: 1, x: sx + sw / 2 + jolt, y: sy + 38, slam: c09_Y[i], t });
}

// ---- the contact sheet: twelve 160x90 miniatures of our desk at 116.0, a 4x4 box average Bayer-quantised ----
const c09_CW = FW >> 2, c09_CH = FH >> 2, c09_GY = (FH - 3 * c09_CH) >> 1;   // 160x90 cells, the grid at y 45..315
const c09_cell = i => [(i & 3) * c09_CW, c09_GY + (i >> 2) * c09_CH];
const c09_dark = (S, k) => S[k] * .299 + S[k + 1] * .587 + S[k + 2] * .114 < 128;
function c09_shrink4(src, mono) {   // draws the shrunk frame at (0, 0) of the current target (mono: by luma, else 6 levels a channel)
  const S = src.getContext('2d').getImageData(0, 0, FW, FH).data, w = FW >> 2, h = FH >> 2, od = ctx.createImageData(w, h), o = od.data, st = 51;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let r = 0, g = 0, b = 0, ns = 0, ni = 0;
    for (let y = 0; y < 4; y++) { let k = ((j * 4 + y) * FW + i * 4) * 4; for (let x = 0; x < 4; x++, k += 4) {
      r += S[k]; g += S[k + 1]; b += S[k + 2];
      if (mono && c09_dark(S, k)) { const px = i * 4 + x, py = j * 4 + y; let iso = 1; for (let v = -1; v <= 1 && iso; v++) for (let u = -1; u <= 1; u++) if ((u || v) && px + u >= 0 && px + u < FW && py + v >= 0 && py + v < FH && c09_dark(S, k + (v * FW + u) * 4)) { iso = 0; break; } iso ? ni++ : ns++; }
    } }
    const th = (BAYER4[(j & 3) * 4 + (i & 3)] + .5) / 16 - .5, k = (j * w + i) * 4;
    // 1-bit: the desktop's 25% screen (isolated dots) reads as a light paper tint; outlines (4 dark of 16) stay solid black
    if (mono) r = g = b = (ns ? Math.min(1, ns / 4) : ni ? .125 : 0) > th + .5 ? 0 : 255;
    else { r = clamp(R(r / 16 / st + th) * st, 0, 255); g = clamp(R(g / 16 / st + th) * st, 0, 255); b = clamp(R(b / 16 / st + th) * st, 0, 255); }
    o[k] = r; o[k + 1] = g; o[k + 2] = b; o[k + 3] = 255;
  }
  ctx.putImageData(od, 0, 0);
}
const c09_thumb = i => memo('c9thumb' + i, c09_CW, c09_CH, () => c09_shrink4(frameInto(styleBuf('c9T'), c09_TS, c09_desk, c09_opt(c09_ERAS[i])), ERA[c09_ERAS[i]].depth === 1));
// the sheet at t (before 116.0 it is the 116.0 state: the last dive's inner frame). "Twelve": the roll call, a vermilion rim round
// each thumb per 1/24 s; "eras.": the year plates flash; "One": the twelve full stops blink in unison; "desk.": a white frame in 4 steps
function c09_sheet(t, noLyric) {
  rect(0, 0, FW, FH, c09_BLK);
  const [wTw, wEr, wOne, wDesk] = c09_B7.words;
  for (let i = 0; i < 12; i++) {
    const [x, y] = c09_cell(i);
    ctx.drawImage(c09_thumb(i), x, y);
    const rf = c09_fr(t, wTw.start + i * SPB / 12); if (rf >= 0 && rf < 2) frame(x + 1, y + 1, c09_CW - 2, c09_CH - 2, c09_VER, 2);   // a rim: 12 inverts in .5 s strobe
    const yr = String(c09_YEARS[i]), pw = tw(yr, 'geneva') + 6, ef = c09_fr(t, wEr.start), fl = ef >= 0 && (ef < 3 || (ef >= 15 && ef < 18));
    rect(x + 3, y + c09_CH - 15, pw, 12, fl ? c09_WHT : c09_BLK); text(yr, x + 6, y + c09_CH - 13, { font: 'geneva', color: fl ? c09_BLK : c09_WHT });
    const pf = c09_periodF(c09_ERAS[i]), px = x + (pf[0] >> 2), py = y + (pf[1] >> 2), of = c09_fr(t, wOne.start);
    if (of >= 0 && of < 30 && !((of >> 3) & 1)) rect(px - 1, py - 1, 3, 3, c09_VER); else rect(px, py, 1, 1, c09_VER);
  }
  if (t >= wDesk.start - 1e-6) {
    const n = Math.min(4, Math.floor((t - wDesk.start) / (SPB / 4) + 1e-6) + 1), gh = 3 * c09_CH;
    rect(0, c09_GY - 2, FW, 2, c09_WHT); if (n >= 2) rect(FW - 2, c09_GY - 2, 2, gh + 4, c09_WHT); if (n >= 3) rect(0, c09_GY + gh, FW, 2, c09_WHT); if (n >= 4) rect(0, c09_GY - 2, 2, gh + 4, c09_WHT);
  }
  if (!noLyric) withEra('system6', () => kara(c09_B7, FW / 2, 14, { align: 'center', mode: 'pop', color: c09_WHT, t }));
}
// ===================================================================================================
// 104-116: THE WINDOW CORRIDOR (three.js through stage3d.js, quantised back to hard pixels). The twelve desks hang down a
// black corridor, alternating left and right walls, turned toward the flight; white rectangular rings every half gap.
// Year i: HOLD at 1:1 on its word (the lit 2D desk, live: Clio sings, the drives step, the eject drive kicks) with THE YEAR
// as a black voxel slab of white voxel figures standing out of the chat toward the lens, slammed on the word (1988 stays
// the flat 2D poster: 1988 IS flat; the type takes depth when we leave it); then the FLIGHT: lights off (on the snare to
// 2005), the camera pulls back and swings down the corridor, passes the panel and swings square onto the next one, which
// lights up on its chanted year. From 2009 the holds shrink and the corridor TWISTS a quarter turn a year: the bridge
// winds up a full barrel roll into 2026; then all twelve fly back out of the corridor into the 12-up sheet, landing at
// 116.0 exactly on the 2D sheet's cells. FLASH-SAFE BY MATERIAL (WCAG 2.3.1): everything that moves is DIM (the desks and
// the years at 34%: < 0.1 linear luminance, so no moving pixel can make a flash), only thin rings, the vermilion full stops
// and the static lit holds are bright; the lit-unlit pair is one flash per chanted year. No full-frame invert anywhere.
// ===================================================================================================
const c09_GAP = 900, c09_SIDE = 430, c09_TURN = .5, c09_DIM = .34, c09_ZF = 120, c09_V = n => new THREE.Vector3(...n);
const c09_TWI = i => i <= 7 ? 0 : (i - 7) * Math.PI / 2;     // the twist: a quarter turn per year from 2009, a full one into 2026
const c09_dep = i => c09_Y[i] + c09_HOLD(i);                 // lights off: on the snare to 2005, then a quarter beat, then a 16th
const c09_grey = v => { const c = R(255 * v); return hex(c, c, c); };
const c09_DIG = [1, 1, .55, .8], c09_SL = ['#2a2a2a', '#2a2a2a', '#404040', '#404040', C.black, C.black];   // figure levels, slab faces
const c09_DH = c09_grey(c09_DIM), c09_RD = '#555555';
// a dim panel texture: the era's home desk at its departure, every pixel at 34% except the writer's vermilion full stop
function c09_dimDesk(c, i) {
  frameInto(c, c09_dep(i), i ? c09_desk : c09_desk1988, c09_opt(c09_ERAS[i]));
  const g = c.getContext('2d'), im = g.getImageData(0, 0, FW, FH), d = im.data;
  for (let k = 0; k < d.length; k += 4) if (!(d[k] === 255 && d[k + 1] === 90 && d[k + 2] === 54)) { d[k] = R(d[k] * c09_DIM); d[k + 1] = R(d[k + 1] * c09_DIM); d[k + 2] = R(d[k + 2] * c09_DIM); }
  g.putImageData(im, 0, 0);
}
// non-indexed geometries with colours, each through a matrix, as one (one draw call)
function c09_merge(parts) {
  const P = [], K = [];
  for (const [g, m] of parts) { const h = g.clone().applyMatrix4(m), p = h.attributes.position.array, k = h.attributes.color.array; for (let j = 0; j < p.length; j++) { P.push(p[j]); K.push(k[j]); } h.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(K, 3)); return g;
}
// THE YEAR in panel space: a black slab whose front face sits on ClioTalk's rect seen from the hold (the 2D year's slab), white
// figures standing out of it, Chicago at 7 px a font pixel from the hold; origin at the slab's front centre. Two meshes: on its
// word the figures punch OUT of the slab (only brightening pixels, so the slam adds no flash to the light-on)
function c09_yearGeo(i) {
  const fp = (D3 - c09_ZF) / D3, [sx, sy, sw] = c09_SLAB, sh = ERA[c09_ERAS[i]].dock ? 112 : 116, M = () => new THREE.Matrix4();
  const w = sw * fp, h = (sh - 34) * fp, s = 7 * (D3 - c09_ZF) / (D3 + 21), str = String(c09_YEARS[i]), fk = fontKey('chicago');
  const parts = [];
  let x = -tw(str, fk) / 2;
  for (const ch of str) { parts.push([voxGlyph(ch, fk, 3, c09_DIG), M().makeTranslation(x * s, -FONTS[fk].cap * s / 2, 1.5 * s).multiply(M().makeScale(s, s, s))]); x += tw(ch, fk); }
  return { slab: bandGeo([{ w, h, d: 60, pos: [0, 0, -30], cols: c09_SL }]), dig: c09_merge(parts), out: 3 * s, pos: c09_V([(sx + sw / 2 - FW / 2) * fp, (FH / 2 - sy - (sh - 34) / 2) * fp, c09_ZF]) };
}
function c09_stage() {
  return stage3d('c09 corridor', st => {
    const Z = c09_V([0, 0, 1]), ext = new Set([C.black, C.white, FIELDS.vermilion, c09_RD]);
    for (const k of [1, c09_DIM]) { for (const v of c09_DIG) ext.add(c09_grey(v * k)); for (const c of c09_SL) ext.add(c09_grey(rgb(c)[0] / 255 * k)); }
    st.extra = [...ext];
    st.o.P = c09_ERAS.map((era, i) => {
      const sg = i % 2 ? 1 : -1, tw = c09_TWI(i), g = new THREE.Group();
      g.quaternion.setFromEuler(new THREE.Euler(0, -sg * c09_TURN, tw, 'ZYX')); g.position.set(sg * c09_SIDE, 0, -i * c09_GAP).applyAxisAngle(Z, tw);
      const tex = tex3d('c09 dim ' + era, FW, FH, c => c09_dimDesk(c, i), { mip: true });
      g.add(new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), mat3d({ map: tex, solid: true })));
      const fc = rgb(ERA[era].pal.frame).map(v => v * c09_DIM), sd = hex(...fc.map(v => R(v * .6))), tp = hex(...fc.map(v => R(v * .8)));
      g.add(new THREE.Mesh(bandGeo([{ w: FW, h: FH, d: 24, pos: [0, 0, -12.5], cols: [sd, sd, tp, tp, null, C.black] }]), mat3d({ vc: true, solid: true })));
      const Y = c09_yearGeo(i), yr = new THREE.Group(), mk = gg => yr.add(new THREE.Mesh(gg, mat3d({ vc: true, solid: true })));
      mk(Y.slab); mk(Y.dig); yr.userData.out = Y.out; yr.position.copy(Y.pos); g.add(yr);
      st.scene.add(g);
      const n = Z.clone().applyQuaternion(g.quaternion), c = g.position.clone();
      return { g, yr, ybase: Y.pos, c, q: g.quaternion.clone(), n, hold: { pos: c.clone().addScaledVector(n, D3), look: c, tw, fov: 30 } };
    });
    // rings round the axis every quarter gap, turned with the twist at their depth: a white one between every two panels, the
    // rest dim (#555: under 0.1 linear luminance, so the tunnel's density costs no flash)
    const twz = z => Math.max(0, -z / c09_GAP - 7) * Math.PI / 2;   // = c09_TWI at every panel, and winding on past 2026
    const rs = 780, ring = c => bandGeo([[0, rs, 2 * rs + 3, 3], [0, -rs, 2 * rs + 3, 3], [-rs, 0, 3, 2 * rs], [rs, 0, 3, 2 * rs]].map(([x, y, w, h]) => ({ w, h, d: 3, pos: [x, y, 0], cols: Array(6).fill(c) })));
    const rw = ring(C.white), rd = ring(c09_RD), parts = [];
    for (let k = -8; k < 72; k++) { const z = -(k + 2) * c09_GAP / 4; parts.push([k & 3 ? rd : rw, new THREE.Matrix4().makeTranslation(0, 0, z).multiply(new THREE.Matrix4().makeRotationZ(twz(z)))]); }
    st.o.rings = new THREE.Mesh(c09_merge(parts), mat3d({ vc: true })); st.scene.add(st.o.rings);
    st.scene.fog = new THREE.Fog(0, 2400, 5200);   // only the rings take it (the rest is solid): far rings dissolve by Bayer, no shimmering knot at the vanishing point
    // the sheet: cell j in panel 2026's plane (col j & 3, row j >> 2), seen from 4 x D3 every desk is a 160 x 90 cell
    const L = st.o.P[11], cell = j => L.c.clone().add(c09_V([((j & 3) - 3) * FW, (2 - (j >> 2)) * FH, 0]).applyQuaternion(L.q));
    st.o.cell = st.o.P.map((_, j) => cell(j));
    const G = L.c.clone().add(c09_V([-1.5 * FW, FH, 0]).applyQuaternion(L.q));
    st.o.sheet = { pos: G.clone().addScaledVector(L.n, 4 * D3), look: G, tw: L.hold.tw, fov: 30 };
    offscreen(FW, FH, () => render3d(st));   // harvest the palette now, from the build state: the same whichever frame comes first
  });
}
const c09_mix = (a, b, k) => ({ pos: a.pos.clone().lerp(b.pos, k), look: a.look.clone().lerp(b.look, k), tw: lerp(a.tw, b.tw, k), fov: lerp(a.fov, b.fov, k) });
function c09_aim(cam, s) { cam.position.copy(s.pos); cam.up.set(-Math.sin(s.tw), Math.cos(s.tw), 0); cam.lookAt(s.look); cam.fov = s.fov; cam.updateProjectionMatrix(); }
// the camera of flight i at t: ease in to a pose on the axis looking down the corridor (wider lens), ease out square onto i + 1
function c09_flightCam(st, i, t) {
  const P = st.o.P, A = P[i].hold, d = c09_dep(i), u = prog(t, d, (i < 11 ? c09_Y[i + 1] : c09_TS) - 2 / FPS);   // settled 2 frames before the word
  if (i === 11) return c09_mix(A, st.o.sheet, 1 - Math.pow(1 - u, 3));
  const B = P[i + 1].hold, zm = (A.pos.z + B.pos.z) / 2, M = { pos: c09_V([0, 0, zm]), look: c09_V([0, 0, zm - 1500]), tw: (A.tw + B.tw) / 2, fov: 40 }, um = .44;
  return u < um ? c09_mix(A, M, (u / um) ** 2) : c09_mix(M, B, 1 - Math.pow(1 - (u - um) / (1 - um), 2.5));
}
function c09_tunnel(t) {
  const i = clamp(bsearch(c09_Y, t + 1e-6), 0, 11), Yi = c09_Y[i], era = c09_ERAS[i], d = c09_dep(i), st = i || t >= d - 1e-6 ? c09_stage() : null;
  if (!st || t < d - 1e-6) {   // THE HOLD: the lit desk at 1:1, alive (1988: the crumpling Trash and the flat 2D year, as before)
    ctx.drawImage(frameInto(styleBuf('c9A'), t, i ? c09_desk : c09_desk1988, c09_opt(era)), 0, 0);
    if (!i || !st) { if (t >= Yi - 1e-6) c09_year(t, i); }
    else c09_draw3d(st, t, i, true);
  } else c09_draw3d(st, t, i, false);
  if (!i) { punch(c09_T0, c09_NIB[0], c09_NIB[1], [2, 2], t); pixelSort(16, 220, c09_T0, 2, t); }      // owed: the drain's punch, the drop's sort
  const sub = evLast('sub', t); if (sub && sub[0] >= c09_T0 && c09_fr(t, sub[0]) < 2) { FX.dy = 1; FX.shake = 1; }   // the 808 drop at "Eleven."
  const L = lineAt(t, 'chant'); if (L && L.section === c09_SEC.name) c09_chant(t, L, false, false, c09_fr(t, Yi) === 0);
}
// the corridor at t: hold (only year i, lit, slammed, over the 2D desk) or flight (everything, dim; the destination's year
// blinks lit on the cowbell; the vermilion full stops down the corridor are the beacons, the destination's pulsing)
function c09_draw3d(st, t, i, hold) {
  const P = st.o.P, asm = i === 11 && !hold, cb = evLast('cowbell', t), blink = !hold && cb && cb[0] > c09_dep(i) && c09_fr(t, cb[0]) < 2;
  const cs = hold ? P[i].hold : c09_flightCam(st, i, t), kk = evLast('kick', t);
  if (!hold && kk && kk[0] > c09_dep(i) && c09_fr(t, kk[0]) < 2) { const u = c09_V([Math.sin(cs.tw) * 10, -Math.cos(cs.tw) * 10, 0]); cs.pos = cs.pos.clone().add(u); cs.look = cs.look.clone().add(u); }   // the kick in flight: the camera dips (the plate does not move)
  c09_aim(st.cam, cs);
  st.o.rings.visible = !hold && !asm;
  P.forEach((p, j) => {
    p.g.position.copy(p.c); p.g.quaternion.copy(p.q); p.g.children[0].visible = p.g.children[1].visible = !hold; p.yr.visible = !hold || j === i;
    p.yr.position.copy(p.ybase);
    const lit = hold || (blink && (asm || j === i + 1));
    for (const m of p.yr.children) matOf(m).color.set(lit ? C.white : c09_DH);
    const fr = c09_fr(t, c09_Y[j]), dg = p.yr.children[1];   // the punch-out on the word: sunk 90% into the slab, out in 5 frames, 1 over
    dg.position.z = hold && j === i && fr >= 0 && fr < 5 ? -p.yr.userData.out * [.9, .55, .25, .08, -.04][fr] : 0;
    if (asm && j < 11) {   // into the sheet: from the corridor in a staggered swoop, slerped flat into its cell
      const a = c09_dep(11) + .03 * j, k = 1 - Math.pow(1 - prog(t, a, a + .5), 3);
      p.g.position.lerpVectors(p.c, st.o.cell[j], k).addScaledVector(P[11].n, -900 * Math.sin(Math.PI * k)); p.g.quaternion.slerpQuaternions(p.q, P[11].q, k);
    }
  });
  render3d(st, { bg: hold ? null : C.black });
  if (hold) return;
  P.forEach((p, j) => {   // the beacons: the writer's full stop on every panel that faces the lens
    const pf = c09_periodF(c09_ERAS[j]), w = c09_V([pf[0] + 1 - FW / 2, FH / 2 - pf[1] - 1, .5]);
    p.g.localToWorld(w); const v = w.clone().sub(st.cam.position);
    if (v.dot(c09_V([0, 0, 1]).applyQuaternion(p.g.quaternion)) >= 0 || v.dot(st.cam.getWorldDirection(c09_V([0, 0, 0]))) < 50) return;
    const [x, y] = project3d(st, [w.x, w.y, w.z]), big = j === i + 1 && pulse(t, 1, 6) > .5 ? 2 : 0;
    if (x < -4 || y < -4 || x > FW + 4 || y > FH + 4) return;
    if (big) frame(x - 2, y - 2, 6, 6, C.black);
    rect(x - big / 2, y - big / 2, 2 + big, 2 + big, c09_VER);
  });
}
scene('ch09 tunnel', c09_T0, c09_TS, c09_tunnel, { raw: true, era: 'system6' });

// ===================================================================================================
// 116-118: THE SHEET. Owed: the landing's invert and split, the stab's punch. Twelve eras. One desk.
// ===================================================================================================
scene('ch09 sheet', c09_TS, c09_TA, t => {
  c09_sheet(t);
  splitPal(2, c09_TS, 3, [c09_WHT, c09_BLK], t); punch(c09_TS, FW / 2, FH / 2, [2, 2], t);   // no invert: the sheet lands out of the light
}, { raw: true, era: 'system6' });

// ===================================================================================================
// 118-120: "And" (the kick): the 1988 thumb expands 1x, 2x, 4x on three frames into the desk at 1:1; "your windows": THE
// FLIP-BOOK, the whole desk redrawn in the next era on every 16th while the Manuscript and ClioTalk do not move a pixel;
// "stay.": locked on 1988 and INVERTED, ch10's first scene rendered by name (B9), the nib's tap on the full stop, the
// snare roll whapping the Manuscript. The lyric on its plate and the riser bar under it, pre-inverted in the negative.
// ===================================================================================================
const c09_FLIP = ['system6', 'system7', 'nextstep', 'platinum', 'aqua', 'snowleopard', 'yosemite', 'liquidglass'];
function c09_stay(t) {
  const A = styleBuf('c9A'), fr = c09_fr(t, c09_TA), neg = t >= c09_TSTAY - 1e-6;
  if (fr <= 1) { c09_sheet(t, true); if (fr === 1) ctx.drawImage(c09_thumb(0), 0, 0, c09_CW, c09_CH, c09_CW >> 2, c09_GY, c09_CW * 2, c09_CH * 2); }
  else if (!neg) ctx.drawImage(frameInto(A, t, c09_desk, c09_opt(c09_FLIP[Math.min(c09_FLIP.length - 1, Math.floor((t - c09_TA) / (SPB / 4) + 1e-6))])), 0, 0);
  else {
    ctx.drawImage(c09_hasScene('ch10 gate') ? frameInto(A, t, 'ch10 gate') : frameInto(A, t, tt => c09_homeDesk(tt, { cur: [300, 24], neg: true }), c09_opt('system6')), 0, 0);
    const sn = evLast('snare', t), roll = sn && sn[0] > c09_TSTAY + 1e-6;
    if (roll && c09_fr(t, sn[0]) < 2) {   // the whap: the Manuscript's pixels 2 px down, the desk rows above it filling the strip
      const mx = c09_SCR.x + 6, my = c09_SCR.y + 28, mw = 274, mh = 170;
      ctx.drawImage(A, mx, my, mw, mh, mx, my + 2, mw, mh); ctx.drawImage(A, mx, my - 4, mw, 2, mx, my, mw, 2);
    }
    FX.invert = true;
    const pf = c09_periodF('system6'), bf = c09_fr(t, c09_TSTAY);
    clickBurst(pf[0], pf[1], c09_TSTAY, { pointer: false, color: c09_INV(c09_VER), t });
    if ((bf >= 2 && bf < 6) || (bf >= 9 && bf < 13)) rect(pf[0], pf[1], 2, 2, c09_WHT);   // the dot blinks twice (paper, pre-inverted)
  }
  c09_chant(t, c09_B8, neg, true);
}
scene('ch09 stay', c09_TA, c09_T1, c09_stay, { raw: true, era: 'system6' });
warmUp(() => { for (const e of c09_ERAS) c09_periodF(e); for (let i = 0; i < 12; i++) c09_thumb(i); });
}
