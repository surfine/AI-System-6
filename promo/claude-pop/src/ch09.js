// ch09 · the bridge (104.00-120.00): THE WINDOW CORRIDOR (three.js: twelve eras, each a lit HOLD at 1:1 on its chanted year,
// then a 3D flight down a neon corridor of duotone desks to the next, the holds shrinking from 2009 and one barrel roll
// 2020 -> 2026 so the bridge winds up, then the twelve fly into the sheet), the 12-up CONTACT SHEET of our own desk, THE
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
// icon row (x >= 302), so every era's chrome stays whole. The tunnel's plate sits on
// the year slab's foot with the tag on a tab; the stay's plate covers ClioTalk's input row: the line, then the riser
// bar and the tag. Pre-inverted colours in the negative.
// The letters are SOLID ink with a 1-px paper halo (ch02/ch03). The beep inverts the tag for a frame.
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
// 104-116: THE NEON CORRIDOR (three.js through stage3d.js, quantised back to hard pixels). The twelve desks hang down a
// tunnel of era-coloured wall bands, alternating left and right, turned toward the flight; a neon ring line every band.
// Year i: HOLD at 1:1 on its word (the lit 2D desk, live; from 2011 the flight's duotone landing: no colour pop) with THE YEAR
// as a black voxel slab of white voxel figures standing out of the chat toward the lens, slammed on the word (1988 stays
// the flat 2D poster: 1988 IS flat; the type takes depth when we leave it); then the FLIGHT: the desk drops to its era's
// NEON DUOTONE (black ink, four steps of the era's hue), the camera pulls back and swings down the corridor, banking into
// each swing and level again on every landing, square onto the next desk, which lights up on its chanted year. The
// destination burns ahead: its edges a neon wireframe, its year in full neon, a vermilion beacon in neon brackets. From
// 2009 the holds shrink; 2020 -> 2026 is the one BARREL ROLL, down a vortex of twisted rings, the two desks upright at
// both ends; then all twelve fly out of the corridor into the 12-up sheet, landing at 116.0 exactly on its cells.
// FLASH-SAFE BY DESIGN (WCAG 2.3.1): every BIG moving surface (duotone desks, wall bands, slab sides) sits under 0.095
// linear luminance however saturated, so it cannot make a flash; what burns at 100% is thin or small (1-px neon edges and
// ring lines, the destination's figures, the beacons); the lit-unlit pair is one flash per chanted year.
// ===================================================================================================
const c09_GAP = 900, c09_SIDE = 430, c09_TURN = .5, c09_ZF = 120, c09_RS = 820, c09_V = n => new THREE.Vector3(...n);
const c09_TWI = i => i < 11 ? 0 : 2 * Math.PI;                 // the camera's roll at each hold: one full turn into 2026
const c09_BANK = i => i >= 10 ? 0 : (i % 2 ? -1 : 1) * (i >= 7 ? .26 : .1);   // the bank into each swing (rad), 0 at both ends
const c09_dep = i => c09_Y[i] + c09_HOLD(i);                   // lights off: on the snare to 2005, then a quarter beat, then a 16th
// each era's NEON (never the writer's vermilion, never a saturated red): the edges and the destination's figures at 100%,
// and the hue of its duotone. c09_tint(c, k): that hue at k x 0.092 linear luminance (a dim surface, as saturated as it gets)
const c09_NEON = ['#33ff66', '#8f6bff', '#ff2bd6', '#ffc400', '#3d9bff', '#00ffc8', '#c8ff00', '#b03cff', '#2f5bff', '#ff5ad2', '#ff6a8f', '#7df9ff'];
const c09_lin = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4, c09_enc = v => v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055;
function c09_tint(c, k) {
  const l = rgb(c).map(v => c09_lin(v / 255)), f = k * .092 / (.2126 * l[0] + .7152 * l[1] + .0722 * l[2]);
  return hex(...l.map(v => Math.floor(255 * c09_enc(Math.min(1, v * f)))));
}
const c09_TINT = c09_NEON.map(n => [0, .2, .42, .7, 1].map(k => c09_tint(n, k)));   // the duotone: black ink, four steps of hue
const c09_WALL = c09_NEON.map(n => [c09_tint(n, .34), c09_tint(n, .13)]);          // the corridor's wall bands, alternating
const c09_mul = (c, v) => hex(...rgb(c).map(x => R(x * v)));                        // a vertex level x a material colour, as GL rounds it
const c09_DIG = [1, 1, .55, .8], c09_SL = ['#2a2a2a', '#2a2a2a', '#404040', '#404040', C.black, C.black];   // figure levels, slab faces
// the flight texture: the era's home desk at its departure in NEON DUOTONE (by luma: black, then four steps of the era's
// hue), bolder and lower in detail than the lit desk, so the turned panels alias less; the writer's vermilion full stop exact
function c09_dimDesk(c, i) {
  frameInto(c, c09_dep(i), i ? c09_desk : c09_desk1988, c09_opt(c09_ERAS[i]));
  const g = c.getContext('2d'), im = g.getImageData(0, 0, FW, FH), d = im.data, T = c09_TINT[i].map(rgb);
  for (let k = 0; k < d.length; k += 4) {
    if (d[k] === 255 && d[k + 1] === 90 && d[k + 2] === 54) continue;
    const y = .299 * d[k] + .587 * d[k + 1] + .114 * d[k + 2], c = T[y < 40 ? 0 : y < 100 ? 1 : y < 165 ? 2 : y < 218 ? 3 : 4];
    d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2];
  }
  g.putImageData(im, 0, 0);
}
// non-indexed geometries with colours, each through a matrix, as one (one draw call)
function c09_merge(parts) {
  const P = [], K = [];
  for (const [g, m] of parts) { const h = g.clone().applyMatrix4(m), p = h.attributes.position.array, k = h.attributes.color.array; for (let j = 0; j < p.length; j++) { P.push(p[j]); K.push(k[j]); } h.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(K, 3)); return g;
}
// 1-px neon lines: a w x h rectangle's edges at z, each cut in n segments (a line with an end behind the eye is not drawn),
// turned by a about the axis; c09_edges: the rectangle at zf and zb and the four edges between (a slab's wireframe)
function c09_loop(P, w, h, z, n = 8, a = 0) {
  const q = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
  for (let e = 0; e < 4; e++) { const A = q[e], B = q[(e + 1) & 3]; for (let s = 0; s < n; s++) P.push(lerp(A[0], B[0], s / n), lerp(A[1], B[1], s / n), z, lerp(A[0], B[0], (s + 1) / n), lerp(A[1], B[1], (s + 1) / n), z); }
  return P;
}
const c09_lineGeo = P => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); return g; };
const c09_edges = (w, h, zf, zb) => { const P = c09_loop(c09_loop([], w, h, zf), w, h, zb); for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.push(x * w / 2, y * h / 2, zf, x * w / 2, y * h / 2, zb); return c09_lineGeo(P); };
const c09_neonMat = i => lineMat3d({ color: c09_NEON[i], fog: false });
// THE YEAR in panel space: a black slab whose front face sits on ClioTalk's rect seen from the hold (the 2D year's slab), white
// figures standing out of it, Chicago at 7 px a font pixel from the hold; origin at the slab's front centre. Two meshes: on its
// word the figures punch OUT of the slab (only brightening pixels, so the slam adds no flash to the light-on)
function c09_yearGeo(i) {
  const fp = (D3 - c09_ZF) / D3, [sx, sy, sw] = c09_SLAB, sh = ERA[c09_ERAS[i]].dock ? 112 : 116, M = () => new THREE.Matrix4();
  const w = sw * fp, h = (sh - 34) * fp, s = 7 * (D3 - c09_ZF) / (D3 + 21), str = String(c09_YEARS[i]), fk = fontKey('chicago');
  const parts = [];
  let x = -tw(str, fk) / 2;
  for (const ch of str) { parts.push([voxGlyph(ch, fk, 3, c09_DIG), M().makeTranslation(x * s, -FONTS[fk].cap * s / 2, 1.5 * s).multiply(M().makeScale(s, s, s))]); x += tw(ch, fk); }
  return { slab: bandGeo([{ w, h, d: 60, pos: [0, 0, -30], cols: c09_SL }]), dig: c09_merge(parts), w, h, out: 3 * s, pos: c09_V([(sx + sw / 2 - FW / 2) * fp, (FH / 2 - sy - (sh - 34) / 2) * fp, c09_ZF]) };
}
// the corridor's bands: from behind the start to past 2026, a band every quarter gap, a twelfth between 2020 and 2026 (the
// vortex: each band turned 30 degrees on from the last, one full turn); zs[k] is band k's near edge, where its ring line runs
const c09_ZS = (() => { const z = []; for (let k = 0; k <= 48; k++) z.push(1800 - 225 * k); for (let k = 1; k <= 12; k++) z.push(-9000 - 75 * k); for (let k = 1; k <= 32; k++) z.push(-9900 - 225 * k); return z; })();
const c09_twz = z => clamp(-z / c09_GAP - 10, 0, 1) * 2 * Math.PI;
function c09_stage() {
  return stage3d('c09 corridor', st => {
    const ext = new Set([C.black, C.white, FIELDS.vermilion]), SLV = c09_SL.map(c => rgb(c)[0] / 255), add = (c, lv) => lv.forEach(v => ext.add(c09_mul(c, v)));
    add(C.white, [...c09_DIG, ...SLV]);
    c09_NEON.forEach((n, i) => { ext.add(n); add(n, SLV); add(c09_TINT[i][4], c09_DIG); for (const c of [...c09_TINT[i], ...c09_WALL[i]]) ext.add(c); });
    st.extra = [...ext];
    st.o.P = c09_ERAS.map((era, i) => {
      const sg = i % 2 ? 1 : -1, g = new THREE.Group(), T = c09_TINT[i];
      g.quaternion.setFromEuler(new THREE.Euler(0, -sg * c09_TURN, 0)); g.position.set(sg * c09_SIDE, 0, -i * c09_GAP);
      const tex = tex3d('c09 duo ' + era, FW, FH, c => c09_dimDesk(c, i), { mip: true }), add = o => (g.add(o), o);
      const face = add(new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), mat3d({ map: tex, solid: true })));
      const box = add(new THREE.Mesh(bandGeo([{ w: FW, h: FH, d: 24, pos: [0, 0, -12.5], cols: [T[2], T[2], T[3], T[3], null, C.black] }]), mat3d({ vc: true, solid: true })));
      const rimF = add(new THREE.LineSegments(c09_lineGeo(c09_loop([], FW, FH, .5)), c09_neonMat(i)));
      const rimB = add(new THREE.LineSegments(c09_edges(FW, FH, .5, -24.5), c09_neonMat(i)));
      const Y = c09_yearGeo(i), yr = new THREE.Group(), mk = gg => { const m = new THREE.Mesh(gg, mat3d({ vc: true, solid: true })); yr.add(m); return m; };
      const slab = mk(Y.slab), dig = mk(Y.dig), yrim = new THREE.LineSegments(c09_lineGeo(c09_loop([], Y.w, Y.h, .5)), c09_neonMat(i));
      yr.add(yrim); yr.position.copy(Y.pos); g.add(yr);
      st.scene.add(g);
      const n = c09_V([0, 0, 1]).applyQuaternion(g.quaternion), c = g.position.clone();
      return { g, face, box, rimF, rimB, yr, slab, dig, yrim, out: Y.out, ybase: Y.pos, c, q: g.quaternion.clone(), n, hold: { pos: c.clone().addScaledVector(n, D3), look: c, tw: c09_TWI(i), fov: 30 } };
    });
    // the tunnel: square wall bands round the axis (inner half-size 820: clear of every panel's corners at any turn), two
    // dim steps of the nearest era's hue alternating, and a 1-px neon ring line at each band's near edge; far ones dissolve by fog
    const ZS = c09_ZS, RS = c09_RS, walls = [], LP = [], LK = [];
    for (let k = 0; k + 1 < ZS.length; k++) {
      const z0 = ZS[k], z1 = ZS[k + 1], L = z0 - z1, zc = (z0 + z1) / 2, j = clamp(R(-zc / c09_GAP), 0, 11), a = c09_twz(z0), c = c09_WALL[j][k & 1];
      walls.push([bandGeo([{ w: 2 * RS, h: 2, d: L, pos: [0, RS + 1, zc], cols: [null, null, null, c, null, null] }, { w: 2 * RS, h: 2, d: L, pos: [0, -RS - 1, zc], cols: [null, null, c, null, null, null] },
        { w: 2, h: 2 * RS, d: L, pos: [-RS - 1, 0, zc], cols: [c, null, null, null, null, null] }, { w: 2, h: 2 * RS, d: L, pos: [RS + 1, 0, zc], cols: [null, c, null, null, null, null] }]), new THREE.Matrix4().makeRotationZ(a)]);
      // the ring line: full neon once a gap (half-way between two desks), the duotone's top step elsewhere (dense far rings
      // all moving at once would cover a flash's area)
      const jr = clamp(R(-z0 / c09_GAP), 0, 11), hot = R(-z0 / c09_GAP * 2) % 2 === 1 && Math.abs(-z0 / c09_GAP * 2 - R(-z0 / c09_GAP * 2)) < 1e-6;
      const n0 = LP.length; c09_loop(LP, 2 * RS - 4, 2 * RS - 4, z0, 8, a); const nc = rgb(hot ? c09_NEON[jr] : c09_TINT[jr][4]).map(v => v / 255);
      for (let m = n0; m < LP.length; m += 3) LK.push(...nc);
    }
    // two meshes on one set of buffers, each drawing a range of bands per frame (c09_wallRange): the near bands solid (half
    // the raster cost of a screen door, and the fog has not begun there), the far ones fogged
    const WG = c09_merge(walls), WF = new THREE.BufferGeometry();
    for (const k in WG.attributes) WF.setAttribute(k, WG.attributes[k]);
    st.o.walls = [new THREE.Mesh(WG, mat3d({ vc: true, solid: true })), new THREE.Mesh(WF, mat3d({ vc: true }))];
    for (const m of st.o.walls) { m.frustumCulled = false; st.scene.add(m); }
    const lg = c09_lineGeo(LP); lg.setAttribute('color', new THREE.Float32BufferAttribute(LK, 3));
    const lm = lineMat3d({ color: C.white }); lm.vertexColors = true;
    st.o.rings = new THREE.LineSegments(lg, lm); st.scene.add(st.o.rings);
    st.scene.fog = new THREE.Fog(0, 3200, 7800);   // only the tunnel takes it (the desks are solid): near bands crisp, far ones dissolve by Bayer
    // the sheet: cell j in panel 2026's plane (col j & 3, row j >> 2), seen from 4 x D3 every desk is a 160 x 90 cell
    const L = st.o.P[11], cell = j => L.c.clone().add(c09_V([((j & 3) - 3) * FW, (2 - (j >> 2)) * FH, 0]).applyQuaternion(L.q));
    st.o.cell = st.o.P.map((_, j) => cell(j));
    const G = L.c.clone().add(c09_V([-1.5 * FW, FH, 0]).applyQuaternion(L.q));
    st.o.sheet = { pos: G.clone().addScaledVector(L.n, 4 * D3), look: G, tw: L.hold.tw, fov: 30 };
    offscreen(FW, FH, () => render3d(st));   // harvest the palette now, from the build state: the same whichever frame comes first
  });
}
// the bands to draw from camera depth z: near [z + 400, z - 3000) solid, far [z - 3000, z - 8000) fogged (24 vertices a band)
const c09_band = z => { let k = 0; while (k < c09_ZS.length - 2 && c09_ZS[k + 1] >= z) k++; return k; };
function c09_wallRange(st, z) {
  const a = c09_band(z + 400), b = c09_band(z - 3000), c = c09_band(z - 8000) + 1, [N, F] = st.o.walls;
  N.geometry.setDrawRange(24 * a, 24 * (b - a)); F.geometry.setDrawRange(24 * b, 24 * (c - b));
}
const c09_mix = (a, b, k) => ({ pos: a.pos.clone().lerp(b.pos, k), look: a.look.clone().lerp(b.look, k), tw: lerp(a.tw, b.tw, k), fov: lerp(a.fov, b.fov, k) });
function c09_aim(cam, s) { cam.position.copy(s.pos); cam.up.set(-Math.sin(s.tw), Math.cos(s.tw), 0); cam.lookAt(s.look); cam.fov = s.fov; cam.updateProjectionMatrix(); }
// the camera of flight i at t: ease in to a pose on the axis looking down the corridor (wider lens), ease out square onto i + 1;
// a bank into the swing on top (sin: level at both ends), and from 2020 the roll of the barrel (M sits half a turn round)
function c09_flightCam(st, i, t) {
  const P = st.o.P, A = P[i].hold, d = c09_dep(i), u = prog(t, d, (i < 11 ? c09_Y[i + 1] : c09_TS) - 2 / FPS);   // settled 2 frames before the word
  if (i === 11) return c09_mix(A, st.o.sheet, 1 - Math.pow(1 - u, 3));
  const B = P[i + 1].hold, zm = (A.pos.z + B.pos.z) / 2, M = { pos: c09_V([0, 0, zm]), look: c09_V([0, 0, zm - 1500]), tw: (A.tw + B.tw) / 2, fov: 40 }, um = .44;
  const s = u < um ? c09_mix(A, M, (u / um) ** 2) : c09_mix(M, B, 1 - Math.pow(1 - (u - um) / (1 - um), 2.5));
  s.tw += c09_BANK(i) * Math.sin(Math.PI * u);
  return s;
}
function c09_tunnel(t) {
  const i = clamp(bsearch(c09_Y, t + 1e-6), 0, 11), Yi = c09_Y[i], era = c09_ERAS[i], d = c09_dep(i), st = i || t >= d - 1e-6 ? c09_stage() : null;
  if (!st || t < d - 1e-6 && i < 8) {   // THE HOLD: the lit desk at 1:1, alive (1988: the crumpling Trash and the flat 2D year)
    ctx.drawImage(frameInto(styleBuf('c9A'), t, i ? c09_desk : c09_desk1988, c09_opt(era)), 0, 0);
    if (!i || !st) { if (t >= Yi - 1e-6) c09_year(t, i); }
    else c09_draw3d(st, t, i, true);
  } else c09_draw3d(st, t, i - (t < d - 1e-6), false);
  if (!i) { punch(c09_T0, c09_NIB[0], c09_NIB[1], [2, 2], t); pixelSort(16, 220, c09_T0, 2, t); }      // owed: the drain's punch, the drop's sort
  const sub = evLast('sub', t); if (sub && sub[0] >= c09_T0 && c09_fr(t, sub[0]) < 2) { FX.dy = 1; FX.shake = 1; }   // the 808 drop at "Eleven."
  const L = lineAt(t, 'chant'); if (L && L.section === c09_SEC.name) c09_chant(t, L, false, false, c09_fr(t, Yi) === 0);
}
// the corridor at t: hold (only year i, lit, slammed, over the 2D desk) or flight (everything in duotone and neon; the
// destination in its neon wireframe, its year in full neon, blinking white on the cowbell; the vermilion full stops down the
// corridor are the beacons, the destination's big, pulsing, in neon brackets)
function c09_draw3d(st, t, i, hold) {
  const P = st.o.P, asm = i === 11 && !hold, cb = evLast('cowbell', t), blink = !hold && cb && cb[0] > c09_dep(i) && c09_fr(t, cb[0]) < 2;
  const cs = hold ? P[i].hold : c09_flightCam(st, i, t), kk = evLast('kick', t);
  if (!hold && kk && kk[0] > c09_dep(i) && !(kk[0] >= c09_Y[i + 1]) && c09_fr(t, kk[0]) < 2) { const u = c09_V([Math.sin(cs.tw) * 10, -Math.cos(cs.tw) * 10, 0]); cs.pos = cs.pos.clone().add(u); cs.look = cs.look.clone().add(u); }   // the kick in flight: the camera dips (the plate does not move)
  c09_aim(st.cam, cs);
  st.o.rings.visible = st.o.walls[0].visible = st.o.walls[1].visible = !hold && !asm;
  c09_wallRange(st, st.cam.position.z);
  P.forEach((p, j) => {
    const dest = !hold && !asm && j === i + 1, lit = hold || (blink && (asm || j === i + 1));
    p.g.position.copy(p.c); p.g.quaternion.copy(p.q);
    p.face.visible = p.box.visible = p.rimF.visible = p.yrim.visible = !hold; p.rimB.visible = dest; p.yr.visible = !hold || j === i;
    p.yr.position.copy(p.ybase);
    matOf(p.slab).color.set(lit ? C.white : c09_NEON[j]);   // in flight the slab's sides take the era's neon at 16-25%
    // the destination's figures burn in full neon while it is far (small: they cannot cover a flash's area); within 3.4 x D3,
    // where the landing's last swing would sweep them across a quarter of the view, they drop to the duotone's top step
    matOf(p.dig).color.set(lit ? C.white : dest && st.cam.position.distanceTo(p.c) > 3.4 * D3 ? c09_NEON[j] : c09_TINT[j][4]);
    const fr = c09_fr(t, c09_Y[j]);   // the punch-out on the word: sunk 90% into the slab, out in 5 frames, 1 over
    p.dig.position.z = j === i + !hold && fr >= 0 && fr < 5 ? -p.out * [.9, .55, .25, .08, -.04][fr] : 0;
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
    const [x, y] = project3d(st, [w.x, w.y, w.z]);
    if (x < -14 || y < -14 || x > FW + 14 || y > FH + 14) return;
    if (j !== i + 1 || asm) { rect(x, y, 2, 2, c09_VER); return; }
    const r = pulse(t, 1, 6) > .5 ? 11 : 8, n = c09_NEON[j];   // the destination: a 4x4 stop on a black rim, neon brackets breathing on the beat
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const cx = x + (sx < 0 ? 0 : 1) + sx * r, cy = y + (sy < 0 ? 0 : 1) + sy * r; rect(sx < 0 ? cx : cx - 3, cy, 4, 1, n); rect(cx, sy < 0 ? cy : cy - 3, 1, 4, n); }
    frame(x - 2, y - 2, 6, 6, C.black); rect(x - 1, y - 1, 4, 4, c09_VER);
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
// seven of the twelve, in order, picked so the desk's light runs DOWN (1991, 1999, 2009, 2011) then UP (2014, 2026: held an
// 8th) and never zig-zags; with the invert on "stay." that is 2 flashes in its second, not 3 (a flash of WCAG 2.3.1 margin)
const c09_FLIP = ['system6', 'system7', 'platinum', 'snowleopard', 'lion', 'yosemite', 'liquidglass'];
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
warmUp(() => { for (const e of c09_ERAS) c09_periodF(e); for (let i = 0; i < 12; i++) c09_thumb(i); if (has3d()) c09_stage(); });   // the corridor is built before the first frame
}
