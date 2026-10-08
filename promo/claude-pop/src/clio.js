// clio.js: CLIO, the AI and the singer. A small speech-balloon creature with two dot eyes and a mouth that sings
// the lyric word by word. She is helpful, she keeps reaching for the pencil, and the writer keeps the pen.
//
//   clio(x, y, opts) -> {x, y, w, h, hand: [x, y], mouth: [x, y], eyes: [x, y]}   (x, y = top-left of her box)
//     scale 1..8 (pixel-doubled) · expr 'happy' | 'sing' | 'wink' | 'surprised' | 'deadpan' | 'shrug' | 'think' | 'sad'
//     mouth 0..1, or {open, shape: 'A'|'E'|'O'|'M'}, or 'sing' (from the lyric timings: singing(T))
//     look [dx, dy] eye direction (-1..1) · pose 'rest' | 'wave' | 'point' | 'shrug' | 'reach' | 'hold' | 'none'
//     point 'left'|'right'|'up'|'down' · reach [screenX, screenY] (the hand stretches there, rubber-hose style)
//     holding 'pencil' | 'floppy' | 'note' | 'record' | 'page' | 'mic' | 'heart' | 'star' · era (look override)
//     bob (px of beat bounce, default 0) · flip · center (x, y is her centre) · blink (default true) · shadow
//   singing(t, voice) -> {open 0..1, shape}: mouth from LYRICS word timings (open on the word, close at its end,
//     wider on open vowels). voice: undefined = lead + chant + spoken (not choir) · 'choir' · '*' = any. Silent words stay shut. Clio's box at scale 1 is CLIO_W x CLIO_H.
'use strict';

const CLIO_W = 32, CLIO_H = 28, CLIO_BX = 5, CLIO_BY = 3, CLIO_BW = 22, CLIO_BH = 17;

// how Clio dresses in each era: body fill (stops or colour), outline, eye/mouth ink, highlight
function clioLook(id) {
  const e = ERA[id] || E;
  switch (e.chrome) {
    case 'mac1': return { fill: '#ffffff', edge: '#000000', ink: '#000000', mouthIn: '#000000', cheek: null };
    case 'mac7': return { fill: '#ffffff', edge: '#000000', ink: '#000000', mouthIn: '#444444', shade: '#bbbbbb', cheek: '#ccccff' };
    case 'next': return { fill: '#aaaaaa', edge: '#000000', ink: '#000000', mouthIn: '#000000', bevel: ['#ffffff', '#555555'] };
    case 'board': return { fill: '#f4efe7', edge: '#3a3129', ink: '#3a3129', mouthIn: '#574c41', sketch: '#958671', cheek: '#ecc867' };
    case 'plat': return { fill: '#eeeeee', edge: '#000000', ink: '#000000', mouthIn: '#333366', bevel: ['#ffffff', '#999999'], cheek: '#ccccff' };
    case 'aqua': return { stops: ['#e6f1ff', '#b4d4ff', '#7fb2f5', '#a9d0ff'], edge: '#1f4ea8', ink: '#0b1f4a', mouthIn: '#0b1f4a', gloss: .7, cheek: '#ff9fb0' };
    case 'metal': return { stops: ['#f2f2f2', '#d4d4d4', '#bdbdbd', '#cfcfcf'], edge: '#4a4a4a', ink: '#1a1a1a', mouthIn: '#2a2a2a', gloss: .5, cheek: '#f0a0a8' };
    case 'unified': case 'lion': return { stops: ['#ffffff', '#eaf2fd', '#cfe2fb'], edge: '#3f68a8', ink: '#13294f', mouthIn: '#13294f', gloss: .6, cheek: '#ffb3c1' };
    case 'flat': return { fill: '#d3e8ff', edge: '#2b8cf6', ink: '#0b3b7a', mouthIn: '#0b3b7a', cheek: '#ffb0b8' };
    case 'sur': return { stops: ['#86c8ff', '#4a9cff', '#2f86f6'], edge: '#1b6ad6', ink: '#ffffff', mouthIn: '#0b2a5a', cheek: '#ff9fb8', round: 7 };
    case 'glass': return { stops: ['#ffffff', '#f1f6fc', '#dde9f7', '#eef4fb'], glass: true, edge: '#9fb3cc', ink: '#1d1d1f', mouthIn: '#1d1d1f', cheek: '#ffb3c6', round: 7 };
  }
  return { fill: '#ffffff', edge: '#000000', ink: '#000000', mouthIn: '#000000' };
}
// the body + face, cached per (era, expression, mouth, eyes, blink) at scale 1
const _clioCache = new Map();
function _clioBase(eraId, expr, mo, sh, lx, ly, blink) {
  const key = [eraId, expr, mo, sh, lx, ly, blink].join('|');
  let c = _clioCache.get(key);
  if (c) return c;
  const L = clioLook(eraId), bx = CLIO_BX, by = CLIO_BY, bw = CLIO_BW, bh = CLIO_BH, r = L.round || 5;
  c = offscreen(CLIO_W, CLIO_H, () => {
    const tail = d => poly([[bx + 4 + d, by + bh - 2], [bx + 10 - d, by + bh - 2], [bx + 1 + d * .6, by + bh + 5 - d * 1.2]], d ? fillCol : L.edge);
    const fillCol = L.fill || (L.stops ? L.stops[1] : '#ffffff');
    // body
    tail(0);
    rrect(bx, by, bw, bh, r, L.edge);
    if (L.stops) rrectGrad(bx + 1, by + 1, bw - 2, bh - 2, r - 1, L.stops, 3);
    else rrect(bx + 1, by + 1, bw - 2, bh - 2, r - 1, L.fill);
    if (L.glass) { tail(1.4); } else { tail(1.4); }
    if (L.bevel) { hline(bx + r, by + 1, bw - 2 * r, L.bevel[0]); vline(bx + 1, by + r, bh - 2 * r, L.bevel[0]); hline(bx + r, by + bh - 2, bw - 2 * r, L.bevel[1]); vline(bx + bw - 2, by + r, bh - 2 * r, L.bevel[1]); }
    if (L.shade) { hline(bx + r, by + bh - 2, bw - 2 * r, L.shade); vline(bx + bw - 2, by + r, bh - 2 * r, L.shade); }
    if (L.gloss) { const g0 = L.stops ? L.stops[0] : '#ffffff'; rrect(bx + 3, by + 1, bw - 6, 4, 2, mix(g0, '#ffffff', L.gloss)); hline(bx + 5, by + 1, bw - 10, '#ffffff'); }
    if (L.glass) { hline(bx + r - 1, by + 1, bw - 2 * r + 2, '#ffffff'); vline(bx + 1, by + r - 1, bh - 2 * r + 2, '#ffffff'); hline(bx + r, by + bh - 2, bw - 2 * r, '#b9cbe2'); vline(bx + bw - 2, by + r, bh - 2 * r, '#c8d7ea'); rect(bx + 3, by + 3, 2, 1, '#ffffff'); rect(bx + 3, by + 4, 1, 2, '#ffffff'); }
    if (L.sketch) { hline(bx + 2, by - 1, bw - 1, L.sketch); vline(bx - 1, by + 3, bh - 4, L.sketch); hline(bx + bw - 3, by + bh, 5, L.sketch); }
    // face
    const ink = L.ink, ex1 = bx + 6 + lx, ex2 = bx + 14 + lx, ey = by + 5 + ly;
    const eye = (x, kind) => {
      if (kind === 'closed' || blink) { hline(x, ey + 2, 2, ink); return; }
      if (kind === 'happy') { rect(x - 1, ey + 2, 1, 1, ink); rect(x, ey + 1, 2, 1, ink); rect(x + 2, ey + 2, 1, 1, ink); return; }
      if (kind === 'wide') { rect(x - 1, ey, 3, 4, ink); rect(x - 1, ey, 1, 1, L.fill || '#ffffff'); return; }
      if (kind === 'flat') { hline(x - 1, ey + 2, 3, ink); hline(x - 1, ey + 1, 3, L.fill ? mix(L.fill, ink, .35) : ink); return; }
      if (kind === 'wink') { rect(x - 1, ey + 1, 1, 1, ink); rect(x, ey + 2, 2, 1, ink); rect(x - 1, ey + 3, 1, 1, ink); return; }
      if (kind === 'up') { rect(x, ey - 1, 2, 2, ink); return; }
      rect(x, ey, 2, 3, ink);
    };
    const eyes = { happy: ['happy', 'happy'], sing: mo >= 3 ? ['happy', 'happy'] : ['dot', 'dot'], wink: ['dot', 'wink'], surprised: ['wide', 'wide'], deadpan: ['flat', 'flat'],
      shrug: ['flat', 'up'], think: ['up', 'up'], sad: ['dot', 'dot'] }[expr] || ['dot', 'dot'];
    eye(ex1, eyes[0]); eye(ex2, eyes[1]);
    if (expr === 'sad') { rect(ex1 - 1, ey - 2, 2, 1, ink); rect(ex2 + 1, ey - 2, 2, 1, ink); }
    if (expr === 'shrug') { rect(ex1 - 1, ey - 2, 3, 1, ink); }
    if (L.cheek && (expr === 'happy' || expr === 'sing' || expr === 'wink')) { rect(bx + 3, by + 10, 2, 1, L.cheek); rect(bx + bw - 5, by + 10, 2, 1, L.cheek); }
    // mouth
    const mx = bx + 11 + lx, my = by + 11 + Math.max(0, ly);
    if (mo <= 0) {
      if (expr === 'deadpan' || expr === 'think') hline(mx - 2, my + 1, expr === 'think' ? 2 : 4, ink);
      else if (expr === 'sad' || expr === 'shrug') { hline(mx - 1, my, 3, ink); rect(mx - 2, my + 1, 1, 1, ink); rect(mx + 2, my + 1, 1, 1, ink); }
      else if (expr === 'surprised') { oval(mx - 1, my - 1, 3, 4, ink); }
      else { rect(mx - 3, my, 1, 1, ink); hline(mx - 2, my + 1, 5, ink); rect(mx + 3, my, 1, 1, ink); }
    } else {
      const mw = sh === 'E' ? 6 + (mo > 2 ? 1 : 0) : sh === 'O' ? 3 + (mo > 2 ? 1 : 0) : 4 + (mo > 1 ? 1 : 0), mh = sh === 'E' ? Math.max(1, mo - 1) + 1 : sh === 'O' ? mo + 1 : mo + 1;
      const x0 = mx - Math.floor(mw / 2), y0 = my - (sh === 'O' ? 1 : 0);
      if (mh <= 2) rect(x0, y0, mw, mh, L.mouthIn);
      else { oval(x0, y0, mw, mh, L.mouthIn); if (mh >= 4 && mw >= 4) hline(x0 + 1, y0 + mh - 2, mw - 2, L.ink === '#ffffff' ? '#ff8fa3' : E.depth === 1 && eraId === 'system6' ? '#ffffff' : '#e8657a'); }
      if (L.ink === '#ffffff' && mh >= 3) hline(x0 + 1, y0, mw - 2, '#ffffff');
    }
  });
  if (_clioCache.size > 3000) _clioCache.clear();
  _clioCache.set(key, c);
  return c;
}
// items Clio can hold (drawn at her hand)
defSprite('it_pencil', `
.......KK
......KTK
.....KYK.
....KYK..
...KYK...
..KYK....
.KPK.....
KPK......
KK.......`, { K: '#000000', Y: '#f5c518', P: '#ee8a9a', T: '#e8c39e' });
defSprite('it_pencil1', `
.......KK
......KWK
.....KWK.
....KWK..
...KWK...
..KWK....
.KKK.....
KKK......
KK.......`, { K: '#000000', W: '#ffffff' });
defSprite('it_floppy', `
KKKKKKK.
KKWWWKKK
KKWKWKKK
KKKKKKKK
KWWWWWWK
KWKKKKWK
KWWWWWWK
KKKKKKKK`, { K: '#000000', W: '#ffffff' });
defSprite('it_note', `
..KKKK
..KKKK
..K..K
..K..K
..K..K
KKK.KK
KKKKKK
KK.KK.`, { K: '#000000' });
defSprite('it_record', `
..KKKKK..
.KKKKKKK.
KKKWWWKKK
KKWWKWWKK
KKWKKKWKK
KKWWKWWKK
KKKWWWKKK
.KKKKKKK.
..KKKKK..`, { K: '#000000', W: '#ffffff' });
defSprite('it_page', `
KKKKK..
KWWWKK.
KWWWWKK
KWKKKWK
KWWWWWK
KWKKKWK
KWWWWWK
KWKKWWK
KKKKKKK`, { K: '#000000', W: '#ffffff' });
defSprite('it_mic', `
.KKK.
KWKWK
KKWKK
KWKWK
.KKK.
..K..
..K..
.KKK.`, { K: '#000000', W: '#ffffff' });
defSprite('it_heart', `
.KK.KK.
KRRKRRK
KRRRRRK
.KRRRK.
..KRK..
...K...`, { K: '#000000', R: '#e84a5f' });
defSprite('it_star', `
...K...
..KYK..
KKKYKKK
.KYYYK.
.KYKYK.
KK...KK`, { K: '#000000', Y: '#ffd200' });
// scaled-pixel Bresenham (Clio's arms stay chunky at any scale)
function sline(x0, y0, x1, y1, s, c) {
  const u = s >= 4 ? s / 2 : s, g = s / u; // arms are drawn on a grid half as coarse as the body at big scales
  x0 = R(x0 * g); y0 = R(y0 * g); x1 = R(x1 * g); y1 = R(y1 * g); ctx.fillStyle = c; s = u;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (let n = 0; n < 400; n++) {
    ctx.fillRect(x0 * s, y0 * s, s, s);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; }
  }
}
// singing(t, voice) -> {open, shape}: the mouth for the word being sung at t
function singing(t = T, voice) {
  let w = null;
  for (const l of LYRICS) {
    if (t < l.start - .05 || t > l.end + .1) continue;
    if (voice && voice !== '*' && l.voice !== voice) continue;
    if (!voice && l.voice === 'choir') continue;                // Clio sings lead, chant and spoken; the choir is backing
    for (const x of l.words) if (!x.silent && t >= x.start && t < x.end + .02) { w = x; break; }
    if (w) break;
  }
  if (!w) return { open: 0, shape: 'M' };
  const word = _fold(w.w), v = (word.match(/[aeiouy]/) || ['a'])[0], dur = w.end - w.start, el = t - w.start;
  const shape = v === 'a' ? 'A' : v === 'o' || v === 'u' ? 'O' : 'E';
  if (/^[mbp]/.test(word) && el < .05) return { open: 0, shape: 'M' };
  let open = clamp(el / .045) * (1 - clamp((el - dur * .78) / Math.max(.04, dur * .22)) * .75);
  if (dur > .4) open *= .82 + .18 * Math.sin(el * 34);      // vibrato on held notes
  if (w.notes && w.notes.length > 1) {                     // re-articulate on each note of a melisma (beats or seconds)
    const ts = w.notes.map(n => Array.isArray(n) ? (n[1] > DUR ? NaN : beatTime(n[1])) : _num(n)).filter(isFinite);
    const last = ts.filter(x => x <= t).pop(); if (last != null && t - last < .06 && last > w.start + .01) open *= .4 + (t - last) / .06 * .6;
  }
  return { open: clamp(open), shape: shape === 'A' ? 'A' : shape };
}
// clio(x, y, o): draw her. See the header for options.
function clio(x, y, o = {}) {
  const s = Math.max(1, R(o.scale || 1)), eraId = o.era || E.id, L = clioLook(eraId);
  let expr = o.expr || 'happy', m = o.mouth ?? 0, shape = 'A';
  if (m === 'sing') { const sg = singing(o.t ?? T, o.voice); m = sg.open; shape = sg.shape; if (!o.expr) expr = 'sing'; }
  else if (typeof m === 'object') { shape = m.shape || 'A'; m = m.open; }
  const mo = m <= .08 ? 0 : clamp(Math.ceil(m * 4), 1, 4);
  const lk = o.look || [0, 0], lx = clamp(R(lk[0]), -1, 1), ly = clamp(R(lk[1]), -1, 1);
  const tt = o.t ?? T, blink = o.blink !== false && !o.plain && ((tt + (o.seed || 0) * 1.7) % 3.7) < .11 && expr !== 'happy';
  if (o.center) { x -= CLIO_W * s / 2; y -= CLIO_H * s / 2; }
  const bob = o.bob ? -R(pulse(tt, 1, 6) * o.bob) * s : 0;
  x = R(x); y = R(y) + bob;
  const base = _clioBase(eraId, expr, mo, shape, lx, ly, blink);
  if (o.shadow) { const sw = (CLIO_BW - 4) * s; bayer(x + (CLIO_BX + 2) * s, y - bob + (CLIO_H - 2) * s, sw, 2 * s, .5, C.black, null); }
  const flip = !!o.flip;
  ctx.save();
  ctx.translate(x + (flip ? CLIO_W * s : 0), y); if (flip) ctx.scale(-1, 1);
  if (!o.plain) clioArms(o, s, L, 'back');
  ctx.drawImage(base, 0, 0, CLIO_W * s, CLIO_H * s);
  let hand = [CLIO_BX + CLIO_BW + 2, CLIO_BY + 11];
  if (!o.plain) hand = clioArms(o, s, L, 'front', x, y, flip);
  ctx.restore();
  const hx = flip ? x + (CLIO_W - hand[0]) * s : x + hand[0] * s, hy = y + hand[1] * s;
  return { x, y, w: CLIO_W * s, h: CLIO_H * s, hand: [hx, hy], mouth: [x + (CLIO_BX + 11) * s, y + (CLIO_BY + 12) * s], eyes: [x + (CLIO_BX + 11) * s, y + (CLIO_BY + 6) * s] };
}
// arms are drawn every frame at scale (rubber hose); returns the right hand in base coordinates
function clioArms(o, s, L, layer, sx, sy, flip) {
  const ink = L.edge === '#ffffff' ? '#8b95a3' : L.edge, bx = CLIO_BX, by = CLIO_BY, bw = CLIO_BW, tt = o.t ?? T;
  const pose = o.pose || (o.reach ? 'reach' : o.holding ? 'hold' : o.point ? 'point' : o.expr === 'shrug' ? 'shrug' : 'rest');
  if (pose === 'none') return [bx + bw, by + 10];
  const lsh = [bx - 1, by + 10], rsh = [bx + bw, by + 10];
  let lh, rh;
  if (pose === 'shrug') { lh = [bx - 5, by + 4]; rh = [bx + bw + 4, by + 4]; }
  else if (pose === 'wave') { const a = Math.sin(tt * 12) * 2; lh = [bx - 3, by + 14]; rh = [bx + bw + 4 + R(a), by + 1]; }
  else if (pose === 'point') { const d = o.point || 'right'; lh = [bx - 3, by + 14]; rh = d === 'up' ? [bx + bw + 2, by - 4] : d === 'down' ? [bx + bw + 2, by + 20] : d === 'left' ? [bx - 9, by + 9] : [bx + bw + 7, by + 9]; }
  else if (pose === 'reach' && o.reach) {
    lh = [bx - 3, by + 14];
    const tx = (o.reach[0] - sx) / s, ty = (o.reach[1] - sy) / s; rh = [flip ? CLIO_W - tx : tx, ty];
  }
  else if (pose === 'hold') { lh = [bx - 3, by + 14]; rh = [bx + bw + 5, by + 12]; }
  else { lh = [bx - 3, by + 14]; rh = [bx + bw + 2, by + 14]; }
  if (layer === 'back') return rh;
  sline(lsh[0], lsh[1], lh[0], lh[1], s, ink); sline(rsh[0], rsh[1], rh[0], rh[1], s, ink);
  // little round hands
  for (const h of [lh, rh]) { ctx.fillStyle = ink; ctx.fillRect(R(h[0]) * s - (s > 1 ? s : 0), R(h[1]) * s - (s > 1 ? s : 0), s * (s > 1 ? 3 : 2), s * (s > 1 ? 3 : 2)); }
  if (pose === 'point' && (o.point || 'right') === 'right') ctx.fillRect((R(rh[0]) + 1) * s, R(rh[1]) * s, 2 * s, s);
  if (o.holding) {
    const one = (ERA[o.era || E.id] || E).depth <= 2, name = o.holding === 'pencil' && one ? 'it_pencil1' : 'it_' + o.holding, sp = SPR[name];
    if (sp) { const ox = o.holding === 'pencil' ? -2 : -1, oy = o.holding === 'pencil' ? -7 : -sp.height + 2; ctx.drawImage(one && (o.holding === 'heart' || o.holding === 'star') ? tinted(sp, '#000000') : sp, (R(rh[0]) + ox) * s, (R(rh[1]) + oy) * s, sp.width * s, sp.height * s); }
  }
  return rh;
}
// clioSay(x, y, str, o): Clio with a balloon of text above-right of her (her speech is a balloon of its own)
function clioSay(x, y, str, o = {}) {
  const c = clio(x, y, { mouth: 'sing', ...o });
  say(c.x + c.w - 4 * (o.scale || 1), c.y - (o.above ?? 34), str, c.x + c.w - 6 * (o.scale || 1), c.y + 4 * (o.scale || 1), { maxW: o.maxW || 170, font: o.font });
  return c;
}
