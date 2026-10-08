// ch09 · the bridge (104.00-120.00): THE TUNNEL (twelve eras, each a HOLD at 1:1 and a WHIP into the writer's vermilion
// full stop, the holds shrinking from 2009 so the bridge winds up), the 12-up CONTACT SHEET of our own desk, THE
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
const c09_sheetMark = () => { const [x, y] = c09_cell(5), pf = c09_periodF(c09_ERAS[5]); return [x + (pf[0] >> 2), y + (pf[1] >> 2)]; };   // the 2002 thumb's dot, inside the dive's centre square

// ===================================================================================================
// 104-116: THE TUNNEL. Year i: HOLD at 1:1 (the era whole, THE YEAR slammed over the chat, the chant on its plate), then the
// WHIP into the full stop, built flash-safe (WCAG 2.3.1): the desk HOLDS STILL while its vermilion full stop opens, a square
// of the light inside the dot (PL, linear luminance .83: the white desk going into it is no flash, only its dark pixels
// lift) growing from PERIOD_F to the whole frame on a power curve; then the next era (the sheet after 2026) opens at 1:1 out
// of ITS full stop inside that light. No zoom of the desk's dithers (a nearest-neighbour zoom shimmers every pixel), no
// black plunge, no full-frame invert on the landing: each pixel changes at most twice a dive (desk, light, desk), one flash
// a second at most. The beep is the plate's TEMPORARY tag inverting a frame; the year's slam is the landing.
// ===================================================================================================
const c09_PL = '#ffe6e0';
function c09_open(u, p, src) {   // a square from p (u 0..1, exponential, panning to the centre); src: a frame shown at 1:1, else PL
  if (u <= 0) return;
  const B = 2 * Math.pow((FW + 8) / 2, u), cx = lerp(p[0] + 1, FW / 2, u), cy = lerp(p[1] + 1, FH / 2, u);
  const bx = R(cx - B / 2), by = R(cy - B / 2), bw = R(B), x0 = Math.max(0, bx), y0 = Math.max(0, by), x1 = Math.min(FW, bx + bw), y1 = Math.min(FH, by + bw);
  if (x1 <= x0 || y1 <= y0) return;
  if (src) ctx.drawImage(src, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0); else rect(x0, y0, x1 - x0, y1 - y0, c09_PL);
  if (u < 1) frame(bx - 2, by - 2, bw + 4, bw + 4, c09_VER, 2);   // the dot's rim
}
function c09_tunnel(t) {
  const i = clamp(bsearch(c09_Y, t + 1e-6), 0, 11), Yi = c09_Y[i], era = c09_ERAS[i], hold = c09_HOLD(i), outer = i ? c09_desk : c09_desk1988;
  if (t < Yi + hold - 1e-6) ctx.drawImage(frameInto(styleBuf('c9A'), t, outer, c09_opt(era)), 0, 0);
  else {
    const last = i === 11, W1 = last ? c09_TS : c09_Y[i + 1], k = prog(t, Yi + hold, W1), k1 = Math.pow(clamp(k / .4), 1.5), k2 = Math.pow(clamp((k - .4) / .6), .6);   // the dot opens (40%); the next era opens out of it (60%, quick to show)
    const pB = last ? c09_sheetMark() : c09_periodF(c09_ERAS[i + 1]);
    if (k1 < 1) { ctx.drawImage(frameInto(styleBuf('c9A'), t, outer, c09_opt(era)), 0, 0); c09_open(k1, c09_periodF(era), null); }
    else {
      rect(0, 0, FW, FH, c09_PL);
      if (k2 > 0) c09_open(k2, pB, frameInto(styleBuf('c9B'), t, last ? c09_sheet : c09_desk, last ? { raw: true, era: 'system6' } : c09_opt(c09_ERAS[i + 1])));
      if (R(2 * Math.pow((FW + 8) / 2, k2)) < 8) rect(pB[0], pB[1], 2, 2, c09_VER);   // the next full stop, where it opens
    }
  }
  if (i) splitPal(2, Yi, 3, [c09_WHT, c09_BLK], t);   // the landing beep: the palette split (no invert; at 104 the drop's sort is the hit)
  if (!i) { punch(c09_T0, c09_NIB[0], c09_NIB[1], [2, 2], t); pixelSort(16, 220, c09_T0, 2, t); }      // owed: the drain's punch, the drop's sort
  const sub = evLast('sub', t); if (sub && sub[0] >= c09_T0 && c09_fr(t, sub[0]) < 2) { FX.dy = 1; FX.shake = 1; }   // the 808 drop at "Eleven."
  if (t >= Yi - 1e-6) c09_year(t, i);
  const L = lineAt(t, 'chant'); if (L && L.section === c09_SEC.name) c09_chant(t, L, false, false, c09_fr(t, Yi) === 0);
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
