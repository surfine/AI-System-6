// eras.js: the twelve appearances of AI System 6, in song order, and how each one paints itself.
//   APPEARANCES / ERA[id]   year, name, colour depth, palette roles (P), font roles, metrics, icon set, chrome family
//   setEra(id)       makes an era current for the frame (main calls it from the scene's opts.era)
//   desktop(opts)    paints the era's desktop (cached full-screen canvas; opts.desk picks a variant)
//   LOOK[family]     the per-era painters the widget kit dispatches on: window chrome, buttons, scroll bars,
//                    fields, checkboxes, progress bars, menu bar and menu backgrounds, docks, modal frames.
// Every painter is integer-pixel and gradient-free: depth grows with the eras through ordered dither.
'use strict';

// ------------------------------------------------------------------------------------------------
// palettes (roles). Missing roles fall back to BASE_PAL.
// ------------------------------------------------------------------------------------------------
const BASE_PAL = {
  desk: '#808080', deskText: '#000000', deskLabel: '#ffffff', text: '#000000', textDim: '#808080', win: '#ffffff', face: '#ffffff',
  frame: '#000000', hi: '#ffffff', lite: '#ffffff', shadow: '#000000', dark: '#000000', title: '#ffffff', titleText: '#000000',
  titleOff: '#ffffff', titleTextOff: '#000000', sel: '#000000', selText: '#ffffff', listSel: '#000000', listSelText: '#ffffff',
  menu: '#ffffff', menuText: '#000000', menuSel: '#000000', menuSelText: '#ffffff', field: '#ffffff', fieldEdge: '#000000',
  accent: '#000000', accentText: '#ffffff', track: '#ffffff', thumb: '#ffffff', tip: '#ffffff', tipText: '#000000', rule: '#000000',
  red: '#000000', yellow: '#000000', green: '#000000', card: '#ffffff', ink: '#000000', paper: '#ffffff',
};
const CLASSIC_FONTS = { ui: 'chicago', title: 'chicago', menu: 'chicago', button: 'chicago', small: 'geneva', body: 'geneva', doc: 'geneva', label: 'geneva', mono: 'monaco', big: 'chicago', lyric: 'chicago', appName: 'chicago' };
const PLAT_FONTS = { ...CLASSIC_FONTS, ui: 'charcoal', title: 'charcoal', menu: 'charcoal', button: 'charcoal', doc: 'serif', big: 'charcoal', lyric: 'charcoal', appName: 'charcoal' };
const LUCIDA_FONTS = { ui: 'lucida', title: 'lucida', menu: 'lucida', button: 'lucida', small: 'lucida10', body: 'lucida', doc: 'serif', label: 'lucida', mono: 'monaco', big: 'lucidaBig', lyric: 'lucidaBig', appName: 'lucidaB' };
const HELV_FONTS = { ui: 'helv11', title: 'helv11', menu: 'helv', button: 'helv11', small: 'helv11', body: 'helv11', doc: 'serif', label: 'helv11', mono: 'monaco', big: 'helvBig', lyric: 'helvBig', appName: 'helvB' };
const SF_FONTS = { ui: 'sf', title: 'sfB', menu: 'sf', button: 'sf', small: 'sf', body: 'sf', doc: 'serif', label: 'sf', mono: 'monaco', big: 'sfBig', lyric: 'sfBig', appName: 'sfB' };

const APPEARANCES = [
  { id: 'system6', year: 1988, name: 'System 6', icons: 'classic', chrome: 'mac1', depth: 1, menuH: 20, fonts: CLASSIC_FONTS, corners: true,
    pal: {} },
  { id: 'system7', year: 1991, name: 'System 7', icons: 'system-7', chrome: 'mac7', depth: 4, menuH: 20, fonts: CLASSIC_FONTS, corners: true,
    pal: { desk: '#7b80b4', textDim: '#888888', face: '#ffffff', title: '#dddddd', titleOff: '#ffffff', titleTextOff: '#888888', sel: '#ccccff', selText: '#000000',
      listSel: '#ccccff', listSelText: '#000000', track: '#e4e4e4', thumb: '#ccccff', shadow: '#888888', lite: '#eeeeee', hi: '#ffffff', dark: '#444444', tip: '#ffffff', menuSel: '#000000', accent: '#000000', card: '#ffffff' } },
  { id: 'nextstep', year: 1995, name: 'NeXTSTEP', branch: true, icons: 'nextstep', chrome: 'next', depth: 2, menuH: 0, fonts: { ui: 'helv', title: 'helvB', menu: 'helv', button: 'helv', small: 'helv11', body: 'helv', doc: 'serif', label: 'helv11', mono: 'monaco', big: 'helvBig', lyric: 'helvBig', appName: 'helvB' },
    pal: { desk: '#555555', deskText: '#ffffff', deskLabel: '#555555', textDim: '#555555', win: '#ffffff', face: '#aaaaaa', hi: '#ffffff', lite: '#aaaaaa', shadow: '#555555', dark: '#000000',
      title: '#000000', titleText: '#ffffff', titleOff: '#aaaaaa', titleTextOff: '#000000', sel: '#aaaaaa', selText: '#000000', listSel: '#ffffff', listSelText: '#000000',
      menu: '#aaaaaa', menuSel: '#ffffff', menuSelText: '#000000', track: '#555555', thumb: '#aaaaaa', tip: '#ffffff', accent: '#000000', card: '#ffffff', rule: '#555555' } },
  { id: 'drawingboard', year: 1998, name: 'Drawing Board', branch: true, icons: 'platinum', chrome: 'board', depth: 8, menuH: 20, fonts: PLAT_FONTS, corners: true,
    pal: { desk: '#dcd2c2', text: '#2b241e', textDim: '#958671', win: '#f4efe7', face: '#cec7bd', frame: '#3a3129', hi: '#f4efe7', lite: '#e7e3de', shadow: '#958671', dark: '#574c41',
      title: '#c0b6aa', titleText: '#2b241e', titleOff: '#cec7bd', titleTextOff: '#75685a', sel: '#f2d272', selText: '#2b241e', listSel: '#f2d272', listSelText: '#2b241e',
      menu: '#cec7bd', menuText: '#2b241e', menuSel: '#665a4d', menuSelText: '#f4efe7', field: '#f4efe7', fieldEdge: '#574c41', track: '#c0b6aa', thumb: '#ecc867',
      accent: '#3a3129', tip: '#fffcdf', card: '#f4efe7', rule: '#857765', ink: '#3a3129', paper: '#f4efe7' } },
  { id: 'platinum', year: 1999, name: 'Platinum', icons: 'platinum', chrome: 'plat', depth: 8, menuH: 20, fonts: PLAT_FONTS, corners: true,
    pal: { desk: '#4a71ab', deskText: '#000000', textDim: '#888888', face: '#dddddd', hi: '#ffffff', lite: '#eeeeee', shadow: '#999999', dark: '#555555',
      title: '#dddddd', titleOff: '#eeeeee', titleTextOff: '#999999', sel: '#ccccff', selText: '#000000', listSel: '#ccccff', listSelText: '#000000',
      menu: '#dddddd', menuSel: '#3c3cb0', menuSelText: '#ffffff', track: '#bbbbbb', thumb: '#9999ff', tip: '#ffffcc', accent: '#000000', card: '#ffffff', rule: '#999999' } },
  { id: 'aqua', year: 2002, name: 'Aqua', icons: 'aqua', chrome: 'aqua', depth: 24, menuH: 18, fonts: LUCIDA_FONTS, dock: true,
    pal: { desk: '#3d6dc0', deskText: '#ffffff', textDim: '#8a8a8a', face: '#ececec', frame: '#8c8c8c', hi: '#ffffff', lite: '#f5f5f5', shadow: '#a8a8a8', dark: '#6d6d6d',
      title: '#e6e6e6', titleOff: '#f0f0f0', titleTextOff: '#8a8a8a', sel: '#b5d5ff', selText: '#000000', listSel: '#3875d7', listSelText: '#ffffff',
      menu: '#f6f6f6', menuSel: '#3875d7', menuSelText: '#ffffff', fieldEdge: '#7d7d7d', accent: '#3a7cf0', accentText: '#000000', track: '#eaeaea', thumb: '#4f8ef0',
      tip: '#ffffc7', red: '#e0443e', yellow: '#e8a43a', green: '#5bb345', card: '#ffffff', rule: '#b0b0b0' } },
  { id: 'tiger', year: 2005, name: 'Tiger', icons: 'aqua', chrome: 'metal', depth: 24, menuH: 18, fonts: LUCIDA_FONTS, dock: true,
    pal: { desk: '#3a6fc4', deskText: '#ffffff', textDim: '#7a7a7a', face: '#c8c8c8', frame: '#6e6e6e', hi: '#ffffff', lite: '#e4e4e4', shadow: '#8e8e8e', dark: '#5a5a5a',
      title: '#c8c8c8', titleOff: '#d6d6d6', titleTextOff: '#7a7a7a', sel: '#b5d5ff', selText: '#000000', listSel: '#3875d7', listSelText: '#ffffff',
      menu: '#f4f4f4', menuSel: '#3875d7', menuSelText: '#ffffff', fieldEdge: '#7d7d7d', accent: '#3a7cf0', accentText: '#000000', track: '#eaeaea', thumb: '#4f8ef0',
      tip: '#ffffc7', red: '#e0443e', yellow: '#e8a43a', green: '#5bb345', card: '#ffffff', rule: '#a0a0a0' } },
  { id: 'snowleopard', year: 2009, name: 'Snow Leopard', icons: 'snow-leopard', chrome: 'unified', depth: 24, menuH: 18, fonts: LUCIDA_FONTS, dock: true,
    pal: { desk: '#4a1f6b', deskText: '#ffffff', textDim: '#8a8a8a', face: '#e8e8e8', frame: '#6b6b6b', hi: '#ffffff', lite: '#f2f2f2', shadow: '#b0b0b0', dark: '#666666',
      title: '#d3d3d3', titleOff: '#ececec', titleTextOff: '#8a8a8a', sel: '#b5d5ff', selText: '#000000', listSel: '#3d80df', listSelText: '#ffffff',
      menu: '#f2f2f2', menuSel: '#3d80df', menuSelText: '#ffffff', fieldEdge: '#8a8a8a', accent: '#3c82e6', accentText: '#000000', track: '#ececec', thumb: '#5f9bec',
      tip: '#ffffc7', red: '#e2463f', yellow: '#e9a73b', green: '#5fb349', card: '#ffffff', rule: '#b8b8b8' } },
  { id: 'lion', year: 2011, name: 'Lion', icons: 'snow-leopard', chrome: 'lion', depth: 24, menuH: 18, fonts: LUCIDA_FONTS, dock: true,
    pal: { desk: '#0d1a3a', deskText: '#ffffff', textDim: '#8a8a8a', face: '#ececec', frame: '#8b8b8b', hi: '#ffffff', lite: '#f4f4f4', shadow: '#b8b8b8', dark: '#707070',
      title: '#dadada', titleOff: '#efefef', titleTextOff: '#8a8a8a', sel: '#b5d5ff', selText: '#000000', listSel: '#3d80df', listSelText: '#ffffff',
      menu: '#f2f2f2', menuSel: '#3d80df', menuSelText: '#ffffff', fieldEdge: '#9a9a9a', accent: '#3c82e6', accentText: '#000000', track: '#ececec', thumb: '#7f7f7f',
      tip: '#ffffc7', red: '#e2463f', yellow: '#e9a73b', green: '#5fb349', card: '#ffffff', rule: '#bdbdbd' } },
  { id: 'yosemite', year: 2014, name: 'Yosemite', icons: 'yosemite', chrome: 'flat', depth: 24, menuH: 18, fonts: HELV_FONTS, dock: true,
    pal: { desk: '#c98b84', deskText: '#ffffff', textDim: '#9a9a9a', face: '#ececec', frame: '#b4b4b4', hi: '#ffffff', lite: '#f6f6f6', shadow: '#c8c8c8', dark: '#8a8a8a',
      title: '#e6e6e6', titleText: '#4d4d4d', titleOff: '#f6f6f6', titleTextOff: '#b0b0b0', sel: '#b3d7ff', selText: '#000000', listSel: '#0069d9', listSelText: '#ffffff',
      menu: '#f4f4f4', menuSel: '#3d89f5', menuSelText: '#ffffff', fieldEdge: '#c5c5c5', accent: '#0b80ff', accentText: '#ffffff', track: '#f4f4f4', thumb: '#c1c1c1',
      tip: '#f6f6f6', red: '#fc605c', yellow: '#fdbc40', green: '#34c84a', card: '#ffffff', rule: '#d4d4d4' } },
  { id: 'bigsur', year: 2020, name: 'Big Sur', icons: 'big-sur', chrome: 'sur', depth: 24, menuH: 18, fonts: SF_FONTS, dock: true,
    pal: { desk: '#c4495f', deskText: '#ffffff', textDim: '#9a9a9a', face: '#efefef', frame: '#c4c4c4', hi: '#ffffff', lite: '#f8f8f8', shadow: '#cfcfcf', dark: '#8a8a8a',
      title: '#ebe9eb', titleText: '#3c3c3c', titleOff: '#f6f6f6', titleTextOff: '#b0b0b0', sel: '#b3d7ff', selText: '#000000', listSel: '#0063e1', listSelText: '#ffffff',
      menu: '#f4f4f4', menuSel: '#2e7cf6', menuSelText: '#ffffff', fieldEdge: '#cfcfcf', accent: '#0a7cff', accentText: '#ffffff', track: '#f4f4f4', thumb: '#c1c1c1',
      tip: '#f2f2f2', red: '#ff5f57', yellow: '#febc2e', green: '#28c840', card: '#ffffff', rule: '#dadada' } },
  { id: 'liquidglass', year: 2026, name: 'Liquid Glass', icons: 'liquid-glass', chrome: 'glass', depth: 24, menuH: 18, fonts: SF_FONTS, dock: true,
    pal: { desk: '#e7ecf1', deskText: '#1d1d1f', deskLabel: '#f4f6f9', text: '#1d1d1f', textDim: '#9aa1ab', win: '#fbfcfe', face: '#f3f5f8', frame: '#d6dce5', hi: '#ffffff', lite: '#f8fafc', shadow: '#c9d1dc', dark: '#8b95a3',
      title: '#f3f5f8', titleText: '#2a2a2a', titleOff: '#f6f7f9', titleTextOff: '#a6adb7', sel: '#cfe2ff', selText: '#1d1d1f', listSel: '#2c2e33', listSelText: '#ffffff',
      menu: '#f0f2f5', menuSel: '#3b82f6', menuSelText: '#ffffff', fieldEdge: '#d5dbe4', accent: '#5b80b1', accentText: '#ffffff', track: '#eef1f5', thumb: '#b9c1cc',
      tip: '#f6f7f9', red: '#ff5f57', yellow: '#febc2e', green: '#28c840', card: '#fbfcfe', rule: '#e1e6ed' } },
];
const ERA = {};
APPEARANCES.forEach((e, i) => { e.index = i; e.pal = { ...BASE_PAL, ...e.pal }; e.short = String(e.year); ERA[e.id] = e; });
// aliases a chapter may use for the same appearance
Object.assign(ERA, { classic: ERA.system6, system_6: ERA.system6, 'system-7': ERA.system7, next: ERA.nextstep, 'drawing-board': ERA.drawingboard,
  'snow-leopard': ERA.snowleopard, 'big-sur': ERA.bigsur, 'liquid-glass': ERA.liquidglass, glass: ERA.liquidglass });
// The song's own appearance schedule (data.js ERAS: [{name: '1991 System 7', start, note}]) mapped to ids.
// A scene without opts.era follows it: songEra(t) -> id; ERA_SCHEDULE[i] = {id, start, name, note, inverted}.
function eraIdFromName(name) {
  const y = /(\d{4})/.exec(name || ''), byYear = y && APPEARANCES.find(e => e.year === +y[1]);
  if (byYear) return byYear.id;
  const n = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
  const e = APPEARANCES.find(e => n.includes(e.name.toLowerCase().replace(/[^a-z]/g, '')) || n.includes(e.id));
  return e ? e.id : null;
}
const ERA_SCHEDULE = (typeof ERAS !== 'undefined' && Array.isArray(ERAS) ? ERAS : []).map(e => ({ id: eraIdFromName(e.name), start: +e.start || 0, name: e.name, note: e.note || '', inverted: /invert/i.test(e.name || '') })).filter(e => e.id).sort((a, b) => a.start - b.start);
const songEraEntry = (t = T) => { let r = null; for (const e of ERA_SCHEDULE) if (e.start <= t + 1e-6) r = e; return r || ERA_SCHEDULE[0] || { id: 'system6', start: 0, inverted: false }; };
const songEra = (t = T) => songEraEntry(t).id;
const songEraKeys = () => ERA_SCHEDULE.length ? ERA_SCHEDULE.map(e => [e.start, e.id]) : [[0, 'system6']];
let E = APPEARANCES[0];
function setEra(id) { E = (typeof id === 'object' && id) ? id : ERA[id] || ERA.system6; P = E.pal; FONTROLE = E.fonts; return E; }
const eraIndex = id => (ERA[id] || ERA.system6).index;
const eraNext = (id, d = 1) => APPEARANCES[clamp(eraIndex(id) + d, 0, APPEARANCES.length - 1)].id;
const ONEBIT = () => E.depth === 1;
setEra('system6');

// ------------------------------------------------------------------------------------------------
// shared painting helpers
// ------------------------------------------------------------------------------------------------
// bevel(x, y, w, h, face, hi, sh, outer): a raised box (swap hi/sh for sunken); outer draws a 1px frame around it
function bevel(x, y, w, h, face, hi, sh, outer) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  if (outer) { frame(x, y, w, h, outer); x++; y++; w -= 2; h -= 2; }
  if (face) rect(x, y, w, h, face);
  rect(x, y, w - 1, 1, hi); rect(x, y, 1, h - 1, hi);
  rect(x + 1, y + h - 1, w - 1, 1, sh); rect(x + w - 1, y + 1, 1, h - 1, sh);
}
const topSpans = (w, h, r) => { const key = 't' + w + 'x' + h + 'r' + r; let s = _spanCache.get(key); if (s) return s; const full = rrSpans(w, 2 * r + 2, r); s = new Array(h).fill(0); for (let j = 0; j < Math.min(r, h); j++) s[j] = full[j]; _spanCache.set(key, s); return s; };
// soft window shadow made of dithered veils (no alpha)
function winShadow(x, y, w, h, r, size = 2, k = .28) {
  for (let i = size; i >= 1; i--) rrectVeil(x - i + 1, y + i - 1 + Math.ceil(size / 2), w + 2 * i - 2, h + 1, r + i, C.black, k * (1 - (i - 1) / size) * .9);
}
// traffic-light lamp (Aqua gel, Leopard gloss, Yosemite flat, Big Sur, Liquid Glass): d = diameter
function lamp(x, y, d, color, style = 'gel', o = {}) {
  x = R(x); y = R(y);
  if (o.off) color = style === 'flat' || style === 'sur' || style === 'glass' ? '#d0d0d0' : '#b9b9b9';
  const edge = darken(color, style === 'gel' ? .5 : .22);
  oval(x, y, d, d, edge);
  if (style === 'gel' || style === 'gloss') {
    ovalGrad(x + 1, y + 1, d - 2, d - 2, [darken(color, .25), color, lighten(color, .55)], 3);
    oval(x + 2, y + 1, d - 4, R(d * .38), lighten(color, .75));
    if (style === 'gel') rect(x + R(d / 2) - 1, y + 1, 2, 1, C.white);
  } else if (style === 'glass') {
    oval(x + 1, y + 1, d - 2, d - 2, color);
    oval(x + 2, y + 1, d - 4, 2, lighten(color, .45));
  } else oval(x + 1, y + 1, d - 2, d - 2, color);
  if (o.glyph) { const c = darken(color, .65), m = R(d / 2) + x, n = R(d / 2) + y; if (o.glyph === 'x') { rect(m - 2, n - 2, 1, 1, c); rect(m + 1, n - 2, 1, 1, c); rect(m - 1, n - 1, 2, 2, c); rect(m - 2, n + 1, 1, 1, c); rect(m + 1, n + 1, 1, 1, c); } else if (o.glyph === '-') rect(m - 2, n - 1, 4, 1, c); else if (o.glyph === '+') { rect(m - 2, n - 1, 4, 1, c); rect(m - 1, n - 2, 1, 3, c); } else if (o.glyph === 'dot') rect(m - 1, n - 1, 2, 2, c); }
}
function lamps(x, y, d, gap, style, o = {}) { // the three window lights; returns the x after them
  const off = o.active === false;
  lamp(x, y, d, P.red, style, { off, glyph: o.dirty ? 'dot' : o.hover ? 'x' : null });
  lamp(x + gap, y, d, P.yellow, style, { off: off || o.noMin, glyph: o.hover ? '-' : null });
  lamp(x + 2 * gap, y, d, P.green, style, { off: off || o.noZoom, glyph: o.hover ? '+' : null });
  return x + 2 * gap + d;
}
// brushed metal texture (Tiger), built once
let _metalTex = null;
function metalTexture() {
  if (_metalTex) return _metalTex;
  _metalTex = offscreen(W, H, () => {
    const d = ctx.createImageData(W, H), px = d.data;
    for (let y = 0; y < H; y++) {
      const row = (hash(y * 3.17) - .5) * 14, base = 214 - y * .18;
      let run = 0;
      for (let x = 0; x < W; x++) {
        if (x % 37 === 0) run = (hash(y * 91.7 + x * .37) - .5) * 10;
        const v = clamp(base + row + run + (hash2(x, y) - .5) * 6 + ((BAYER4[(y & 3) * 4 + (x & 3)] - 7.5) * .8), 0, 255), i = (y * W + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = R(v / 3) * 3; px[i + 3] = 255;
      }
    }
    ctx.putImageData(d, 0, 0);
  });
  return _metalTex;
}
function metalFill(x, y, w, s) { // brushed metal inside a span shape
  x = R(x); y = R(y); const tex = metalTexture();
  for (let j = 0; j < s.length; j++) { const yy = clamp(y + j, 0, H - 1), a = s[j]; if (w - 2 * a > 0) ctx.drawImage(tex, clamp(x + a, 0, W - 1), yy, Math.min(w - 2 * a, W), 1, x + a, y + j, w - 2 * a, 1); }
}
// the menu-bar mark: our own floppy glyph (never an apple)
defSprite('mark_floppy', `
KKKKKKKKKKKK.
KKKWWWWWWKKKK
KKKWWWKKWKKKK
KKKWWWKKWKKKK
KKKWWWWWWKKKK
KKKKKKKKKKKKK
KWWWWWWWWWWWK
KWKKKKKKKKKWK
KWWWWWWWWWWWK
KWKKKKKKKKKWK
KWWWWWWWWWWWK
KWWWWWWWWWWWK
KKKKKKKKKKKKK`);
function markGlyph(x, y, o = {}) {
  const fam = E.chrome, K = '#000000', Wh = '#ffffff';
  const map = { aqua: { [K]: '#1d4fb8', [Wh]: '#a9cbff' }, metal: { [K]: '#1d4fb8', [Wh]: '#a9cbff' }, unified: { [K]: '#2e2e2e', [Wh]: '#d8d8d8' }, lion: { [K]: '#2e2e2e', [Wh]: '#d8d8d8' },
    flat: { [K]: '#1d1d1f', [Wh]: null }, sur: { [K]: '#1d1d1f', [Wh]: null }, glass: { [K]: '#1d1d1f', [Wh]: null }, board: { [K]: P.ink, [Wh]: P.paper }, next: { [K]: K, [Wh]: '#aaaaaa' } }[fam];
  let c = SPR.mark_floppy;
  if (o.inverted) c = recolor(c, { [K]: Wh, [Wh]: K }); else if (map) c = recolor(c, map);
  spr(c, x, y);
  return 13;
}

// ------------------------------------------------------------------------------------------------
// desktops: each painted once into a full-screen canvas
// ------------------------------------------------------------------------------------------------
// field(fn, step): per-pixel colour function quantised with a Bayer offset (the dithered-wallpaper look)
function ditherField(fn, step = 20) {
  const d = ctx.createImageData(W, H), px = d.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = fn(x, y), off = (BAYER4[(y & 3) * 4 + (x & 3)] + .5) / 16 * step, i = (y * W + x) * 4;
    px[i] = clamp(Math.floor((r + off) / step) * step, 0, 255); px[i + 1] = clamp(Math.floor((g + off) / step) * step, 0, 255); px[i + 2] = clamp(Math.floor((b + off) / step) * step, 0, 255); px[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
}
const _ramp = (stops, k) => { const st = _stops(stops); let i = 0; while (i < st.length - 2 && k > st[i + 1][0]) i++; const a = st[i], b = st[i + 1] || a; const f = b[0] === a[0] ? 0 : clamp((k - a[0]) / (b[0] - a[0])); const p = rgb(a[1]), q = rgb(b[1]); return [lerp(p[0], q[0], f), lerp(p[1], q[1], f), lerp(p[2], q[2], f)]; };
const _add = (c, k, tint = [255, 255, 255]) => [lerp(c[0], tint[0], k), lerp(c[1], tint[1], k), lerp(c[2], tint[2], k)];
const _star = (x, y, dens = .996) => { const h = hash2(x, y); return h > dens ? (h - dens) / (1 - dens) : 0; };
const DESKTOPS = {
  system6() { patfill(0, 0, W, H, 'gray', C.black, C.white); },
  system7() { patfill(0, 0, W, H, 'gray', '#6f74aa', '#8a8fc2'); },
  nextstep() { rect(0, 0, W, H, '#555555'); },
  drawingboard() {
    ditherField((x, y) => { const n = (hash2(x >> 1, y >> 1) - .5) * 8; const k = 222 + n - y * .02; return [k, k - 9, k - 24]; }, 6);
    for (let x = 0; x < W; x += 8) dline(x, 0, x, H, x % 32 ? '#d3c7b4' : '#c4b59d', 1, x % 32 ? 1 : 0);
    for (let y = 0; y < H; y += 8) dline(0, y, W, y, y % 32 ? '#d3c7b4' : '#c4b59d', 1, y % 32 ? 1 : 0);
    const ink = '#8f8070';
    for (const [cx, cy] of [[14, 30], [W - 14, 30], [14, H - 14], [W - 14, H - 14]]) { hline(cx - 8, cy, 17, ink); vline(cx, cy - 8, 17, ink); ring(cx, cy, 4, ink); }
    frame(6, 22, W - 12, H - 28, '#a89880');
    for (let i = 0; i < 46; i++) { const a = i / 46 * Math.PI * 1.15 + 2.6; rect(R(520 + Math.cos(a) * 90), R(250 + Math.sin(a) * 90), 1, 1, '#b4a48d'); } // a compass arc left on the board
    line(470, 330, 600, 300, '#b9aa93'); line(470, 331, 600, 301, '#cdbfa9');
  },
  platinum() { // Azul: soft blue waves
    ditherField((x, y) => { const v = Math.sin(x * .021 + y * .065 + Math.sin(y * .018 + x * .006) * 2.4) * .5 + .5, w = Math.sin(x * .05 - y * .03) * .08; return _ramp(['#34558c', '#4a71ab', '#5f87c2', '#7aa0d6'], clamp(v * .85 + w + .05)); }, 14);
  },
  aqua() {
    ditherField((x, y) => {
      let c = _ramp([[0, '#1f4ea3'], [.45, '#4f86d6'], [.7, '#3f74c8'], [1, '#2a5cb0']], y / H);
      const s1 = Math.exp(-(((y - (150 + 70 * Math.sin(x * .007 + .6))) / 26) ** 2)), s2 = Math.exp(-(((y - (250 + 50 * Math.sin(x * .009 + 2.1))) / 14) ** 2));
      c = _add(c, s1 * .32, [190, 220, 255]); c = _add(c, s2 * .22, [210, 230, 255]);
      return c;
    }, 12);
  },
  tiger() {
    ditherField((x, y) => {
      let c = _ramp([[0, '#163f8f'], [.5, '#3c74c8'], [1, '#1d4a9a']], y / H);
      const curve = 330 - x * .42 + 30 * Math.sin(x * .012), d = (y - curve) / 22, glow = Math.exp(-d * d);
      c = _add(c, glow * .55, [200, 235, 255]); c = _add(c, Math.exp(-(((y - curve + 40) / 60) ** 2)) * .18, [140, 190, 255]);
      return c;
    }, 12);
  },
  snowleopard() {
    ditherField((x, y) => {
      let c = _ramp([[0, '#2a0d40'], [.55, '#5e2275'], [1, '#331046']], y / H);
      const g = Math.exp(-(((x - 430) / 210) ** 2 + ((y - 190) / 120) ** 2)); c = _add(c, g * .55, [214, 92, 178]);
      const g2 = Math.exp(-(((x - 520) / 80) ** 2 + ((y - 150) / 50) ** 2)); c = _add(c, g2 * .35, [255, 190, 235]);
      const s = _star(x, y, .9965); if (s) c = _add(c, .4 + s * .6);
      return c;
    }, 12);
  },
  lion() {
    ditherField((x, y) => {
      let c = _ramp([[0, '#040817'], [.6, '#0c1a3c'], [1, '#132a55']], y / H);
      const dx = x - 400, dy = y - 215, u = dx * .94 + dy * .34, v = -dx * .34 + dy * .94, r = Math.sqrt((u / 150) ** 2 + (v / 34) ** 2);
      c = _add(c, Math.exp(-r * r * 2.2) * .5, [120, 160, 230]); c = _add(c, Math.exp(-r * r * 18) * .85, [255, 236, 205]);
      const s = _star(x, y, .993); if (s) c = _add(c, .35 + s * .65);
      return c;
    }, 12);
  },
  linen() { ditherField((x, y) => { const n = (hash2(x, y) - .5) * 14 + ((x + y) % 3 === 0 ? 7 : 0) - ((x - y + 999) % 4 === 0 ? 6 : 0) + Math.sin(y * .9) * 3; const v = 66 + n; return [v, v + 2, v + 6]; }, 6); },
  yosemite() {
    ditherField((x, y) => {
      const ridge = 250 - 70 * Math.exp(-(((x - 120) / 120) ** 2)) - 26 * noise1(x / 60) - 12 * noise1(x / 17);
      if (y > ridge) { const k = clamp((y - ridge) / 120); return _ramp(['#4d5269', '#2f3447', '#23273a'], k); }
      return _ramp([[0, '#f2ab8e'], [.35, '#e39a8f'], [.62, '#b58d9f'], [.85, '#7e7c98'], [1, '#5f6784']], y / H);
    }, 12);
  },
  bigsur() {
    ditherField((x, y) => {
      const b = [70 + 18 * Math.sin(x * .011 + 1), 150 + 30 * Math.sin(x * .008 + 2.4), 225 + 26 * Math.sin(x * .01 + .3), 300 + 20 * Math.sin(x * .013 + 4)];
      const cols = [['#f7b49a', '#f28a8c'], ['#ef6d86', '#e0455e'], ['#c23a62', '#8c3a8f'], ['#6a3aa0', '#4a2f92'], ['#3a2a7a', '#2a2366']];
      let i = 0; while (i < b.length && y > b[i]) i++;
      const top = i ? b[i - 1] : 0, bot = i < b.length ? b[i] : H, k = clamp((y - top) / Math.max(1, bot - top));
      let c = _ramp(cols[i], k); c = _add(c, Math.exp(-((y - top) / 4)) * .18 * (i > 0), [255, 220, 220]);
      return c;
    }, 12);
  },
  liquidglass() {
    ditherField((x, y) => {
      let c = _ramp(['#eef2f6', '#e6ebf1', '#edf0f4'], y / H);
      c = _add(c, Math.exp(-(((x - 120) / 160) ** 2 + ((y - 90) / 110) ** 2)) * .35, [214, 232, 255]);
      c = _add(c, Math.exp(-(((x - 540) / 160) ** 2 + ((y - 300) / 100) ** 2)) * .3, [255, 226, 238]);
      if (x % 16 === 0 || y % 16 === 0) c = _add(c, .05, [150, 165, 185]);
      return c;
    }, 6);
  },
};
const _deskCache = {};
function deskCanvas(name) { return _deskCache[name] || (_deskCache[name] = offscreen(W, H, () => (DESKTOPS[name] || DESKTOPS.system6)())); }
// desktop(opts): paint the current era's desktop. opts.desk = a DESKTOPS name or a colour; opts.deskFn = custom painter
function desktop(o = {}) {
  if (o.deskFn) return o.deskFn();
  if (o.desk && o.desk[0] === '#') return rect(0, 0, W, H, o.desk);
  ctx.drawImage(deskCanvas(o.desk || E.id), 0, 0);
}
function screenCorners(c = C.black) { // the rounded corners of a compact Mac screen
  const s = [4, 2, 1, 1];
  for (let j = 0; j < 4; j++) { rect(0, j, s[j], 1, c); rect(W - s[j], j, s[j], 1, c); rect(0, H - 1 - j, s[j], 1, c); rect(W - s[j], H - 1 - j, s[j], 1, c); }
}

// ------------------------------------------------------------------------------------------------
// LOOK: the painters per chrome family. Each window painter returns the inner rect (below the title bar,
// inside the frame). ui.js composes these into widgets. Families inherit from each other.
// ------------------------------------------------------------------------------------------------
const LOOK = {};
// ---- System 6: 1-bit ----
LOOK.mac1 = {
  titleH: 19, scrollW: 16, overlayScroll: false, radius: 0,
  win(x, y, w, h, title, o) {
    const act = o.active !== false, th = this.titleH;
    if (!o.noShadow) { rect(x + 1, y + h, w, 1, C.black); rect(x + w, y + 1, 1, h, C.black); }
    rect(x, y, w, h, P.frame); rect(x + 1, y + 1, w - 2, h - 2, o.body || P.win);
    rect(x + 1, y + 1, w - 2, th - 2, act ? P.title : P.titleOff); hline(x, y + th - 1, w, P.frame);
    this.titleBar(x, y, w, th, title, o, act);
    return { x: x + 1, y: y + th, w: w - 2, h: h - th - 1 };
  },
  titleBar(x, y, w, th, title, o, act) {
    if (act) for (let i = 0; i < 6; i++) hline(x + 2, y + 4 + 2 * i, w - 4, C.black);
    if (title) {
      const tw_ = Math.min(tw(title, 'title'), w - 64), cx = x + R(w / 2);
      if (act) rect(cx - R(tw_ / 2) - 7, y + 1, tw_ + 14, th - 2, P.title);
      clipRect(cx - R(tw_ / 2) - 2, y + 1, tw_ + 4, th - 2, () => text(title, cx, y + 5, { font: 'title', align: 'center', color: act ? P.titleText : P.titleTextOff }));
    }
    if (act && o.close !== false) { rect(x + 7, y + 3, 13, 13, P.title); this.box(x + 8, y + 4, o.closeHot ? 'closeHot' : 'close'); }
    if (act && o.zoom !== false) { rect(x + w - 20, y + 3, 13, 13, P.title); this.box(x + w - 19, y + 4, o.zoomHot ? 'zoomHot' : 'zoom'); }
  },
  box(x, y, kind) {
    frame(x, y, 11, 11, C.black); rect(x + 1, y + 1, 9, 9, C.white);
    if (kind === 'zoom' || kind === 'zoomHot') { frame(x, y, 7, 7, C.black); }
    if (kind === 'closeHot' || kind === 'zoomHot') { for (let i = 0; i < 4; i++) { rect(x + 5, y + 1 + i, 1, 1, C.black); rect(x + 5, y + 9 - i, 1, 1, C.black); rect(x + 1 + i, y + 5, 1, 1, C.black); rect(x + 9 - i, y + 5, 1, 1, C.black); } rect(x + 2, y + 2, 1, 1, C.black); rect(x + 8, y + 2, 1, 1, C.black); rect(x + 2, y + 8, 1, 1, C.black); rect(x + 8, y + 8, 1, 1, C.black); }
  },
  arrow(x, y, dir, o = {}) { // 16x16 arrow box, hollow arrow
    frame(x, y, 16, 16, C.black); rect(x + 1, y + 1, 14, 14, o.pressed ? C.black : C.white);
    const c = o.pressed ? C.white : C.black, f = o.pressed ? C.black : C.white;
    const rows = ['....K....', '...KWK...', '..KWWWK..', '.KWWWWWK.', 'KKKWWWKKK', '..KWWWK..', '..KWWWK..', '..KKKKK..'];
    rows.forEach((r, j) => [...r].forEach((ch, i) => {
      if (ch === '.') return; const col = ch === 'K' ? c : f;
      if (dir === 'up') rect(x + 4 + i, y + 4 + j, 1, 1, col); else if (dir === 'down') rect(x + 4 + i, y + 11 - j, 1, 1, col);
      else if (dir === 'left') rect(x + 4 + j, y + 4 + i, 1, 1, col); else rect(x + 11 - j, y + 4 + i, 1, 1, col);
    }));
  },
  vscroll(x, y, h, k, frac, o = {}) {
    frame(x, y, 16, h, C.black);
    if (o.active === false) { rect(x + 1, y + 1, 14, h - 2, C.white); return; }
    dither(x + 1, y + 16, 14, h - 32, C.black, C.white);
    this.arrow(x, y, 'up', { pressed: o.pressed === 'up' }); this.arrow(x, y + h - 16, 'down', { pressed: o.pressed === 'down' });
    if (frac < 1) { const ty = y + 15 + R((h - 46) * clamp(k)); frame(x, ty, 16, 16, C.black); rect(x + 1, ty + 1, 14, 14, C.white); }
  },
  hscroll(x, y, w, k, frac, o = {}) {
    frame(x, y, w, 16, C.black);
    if (o.active === false) { rect(x + 1, y + 1, w - 2, 14, C.white); return; }
    dither(x + 16, y + 1, w - 32, 14, C.black, C.white);
    this.arrow(x, y, 'left'); this.arrow(x + w - 16, y, 'right');
    if (frac < 1) { const tx = x + 15 + R((w - 46) * clamp(k)); frame(tx, y, 16, 16, C.black); rect(tx + 1, y + 1, 14, 14, C.white); }
  },
  grow(x, y, o = {}) { frame(x, y, 16, 16, C.black); rect(x + 1, y + 1, 14, 14, C.white); if (o.active === false) return; frame(x + 3, y + 3, 7, 7, C.black); rect(x + 4, y + 4, 5, 5, C.white); frame(x + 5, y + 5, 8, 8, C.black); rect(x + 6, y + 6, 6, 6, C.white); frame(x + 3, y + 3, 7, 7, C.black); },
  button(x, y, w, h, label, o = {}) {
    const r = Math.min(R(h / 2) - 1, 7);
    if (o.def) { rframe(x - 4, y - 4, w + 8, h + 8, r + 4, C.black, 3); }
    rrect(x, y, w, h, r, C.black); rrect(x + 1, y + 1, w - 2, h - 2, r - 1, o.pressed ? C.black : C.white);
    const col = o.pressed ? C.white : C.black;
    text(label, x + w / 2, y + R((h - capH('button')) / 2), { font: 'button', align: 'center', color: col });
    if (o.disabled) bayer(x + 2, y + 2, w - 4, h - 4, .5, C.white, null);
  },
  field(x, y, w, h, o = {}) { frame(x, y, w, h, C.black); rect(x + 1, y + 1, w - 2, h - 2, C.white); if (o.focus && E.depth > 1) {} },
  check(x, y, on, o = {}) { frame(x, y, 12, 12, C.black); rect(x + 1, y + 1, 10, 10, o.pressed ? C.black : C.white); if (on) { line(x, y, x + 11, y + 11, o.pressed ? C.white : C.black); line(x + 11, y, x, y + 11, o.pressed ? C.white : C.black); } },
  radio(x, y, on, o = {}) { oval(x, y, 12, 12, C.black); oval(x + 1, y + 1, 10, 10, o.pressed ? C.black : C.white); if (on) oval(x + 3, y + 3, 6, 6, o.pressed ? C.white : C.black); },
  progress(x, y, w, h, k, o = {}) { frame(x, y, w, h, C.black); rect(x + 1, y + 1, w - 2, h - 2, C.white); if (o.indeterminate) { const sh = R((o.t ?? T) * 24) % 16; clipRect(x + 1, y + 1, w - 2, h - 2, () => { ctx.save(); ctx.translate(sh, 0); patfill(x - 15, y + 1, w + 16, h - 2, 'diag2', C.black, C.white); ctx.restore(); }); } else rect(x + 1, y + 1, R((w - 2) * clamp(k)), h - 2, C.black); },
  menubar(h) { rect(0, 0, W, h - 1, P.menu); hline(0, h - 1, W, C.black); },
  menuTitleSel(x, y, w, h) { rect(x, y, w, h, P.menuSel); },
  menuBox(x, y, w, h) { rect(x + 1, y + 1, w, h, C.black); rect(x - 1, y, w, h, C.black); rect(x, y, w - 2, h - 1, P.menu); },
  menuSel(x, y, w, h) { rect(x, y, w, h, P.menuSel); },
  dialog(x, y, w, h, o = {}) { // the modal dialog frame: black, white, thick black
    rect(x, y, w, h, C.black); rect(x + 1, y + 1, w - 2, h - 2, C.white); rect(x + 3, y + 3, w - 6, h - 6, C.black); rect(x + 5, y + 5, w - 10, h - 10, o.body || P.win);
    return { x: x + 5, y: y + 5, w: w - 10, h: h - 10 };
  },
  dock() {},
};
// ---- System 7: four-bit greys ----
LOOK.mac7 = {
  ...LOOK.mac1,
  titleBar(x, y, w, th, title, o, act) {
    if (act) for (let i = 0; i < 6; i++) { hline(x + 2, y + 3 + 2 * i, w - 4, '#999999'); hline(x + 2, y + 4 + 2 * i, w - 4, C.white); }
    if (act) { hline(x + 1, y + 1, w - 2, C.white); vline(x + 1, y + 1, th - 3, C.white); }
    if (title) {
      const tw_ = Math.min(tw(title, 'title'), w - 80), cx = x + R(w / 2);
      if (act) rect(cx - R(tw_ / 2) - 7, y + 2, tw_ + 14, th - 3, P.title);
      clipRect(cx - R(tw_ / 2) - 2, y + 1, tw_ + 4, th - 2, () => text(title, cx, y + 5, { font: 'title', align: 'center', color: act ? P.titleText : P.titleTextOff }));
    }
    if (act && o.close !== false) { rect(x + 7, y + 2, 13, 14, P.title); this.box(x + 8, y + 4, o.closeHot ? 'closeHot' : 'close'); }
    if (act && o.zoom !== false) { rect(x + w - 20, y + 2, 13, 14, P.title); this.box(x + w - 19, y + 4, o.zoomHot ? 'zoomHot' : 'zoom'); }
    if (act && o.collapse) { rect(x + w - 34, y + 2, 13, 14, P.title); this.box(x + w - 33, y + 4, 'shade'); }
  },
  box(x, y, kind) {
    frame(x, y, 11, 11, C.black); rect(x + 1, y + 1, 9, 9, '#dddddd'); hline(x + 1, y + 1, 8, C.white); vline(x + 1, y + 1, 8, C.white); hline(x + 2, y + 9, 8, '#888888'); vline(x + 9, y + 2, 8, '#888888');
    if (kind === 'zoom' || kind === 'zoomHot') { frame(x, y, 7, 7, C.black); }
    if (kind === 'shade') { hline(x + 1, y + 4, 9, C.black); hline(x + 1, y + 6, 9, C.black); }
    if (kind === 'closeHot' || kind === 'zoomHot') rect(x + 1, y + 1, 9, 9, '#777777');
  },
  arrow(x, y, dir, o = {}) {
    frame(x, y, 16, 16, C.black); bevel(x + 1, y + 1, 14, 14, o.pressed ? '#888888' : '#dddddd', o.pressed ? '#666666' : C.white, o.pressed ? '#aaaaaa' : '#999999');
    const rows = ['....K....', '...KWK...', '..KWWWK..', '.KWWWWWK.', 'KKKWWWKKK', '..KWWWK..', '..KWWWK..', '..KKKKK..'];
    rows.forEach((r, j) => [...r].forEach((ch, i) => {
      if (ch === '.') return; const col = ch === 'K' ? C.black : '#aaaaaa';
      if (dir === 'up') rect(x + 4 + i, y + 4 + j, 1, 1, col); else if (dir === 'down') rect(x + 4 + i, y + 11 - j, 1, 1, col);
      else if (dir === 'left') rect(x + 4 + j, y + 4 + i, 1, 1, col); else rect(x + 11 - j, y + 4 + i, 1, 1, col);
    }));
  },
  thumb(x, y, w, h) { frame(x, y, w, h, C.black); bevel(x + 1, y + 1, w - 2, h - 2, P.thumb, '#eeeeff', '#8888cc'); },
  vscroll(x, y, h, k, frac, o = {}) {
    frame(x, y, 16, h, C.black);
    if (o.active === false) { rect(x + 1, y + 1, 14, h - 2, C.white); return; }
    rect(x + 1, y + 16, 14, h - 32, P.track); vline(x + 1, y + 16, h - 32, '#bbbbbb'); hline(x + 1, y + 16, 14, '#bbbbbb');
    this.arrow(x, y, 'up', { pressed: o.pressed === 'up' }); this.arrow(x, y + h - 16, 'down', { pressed: o.pressed === 'down' });
    if (frac < 1) this.thumb(x, y + 15 + R((h - 46) * clamp(k)), 16, 16);
  },
  hscroll(x, y, w, k, frac, o = {}) {
    frame(x, y, w, 16, C.black);
    if (o.active === false) { rect(x + 1, y + 1, w - 2, 14, C.white); return; }
    rect(x + 16, y + 1, w - 32, 14, P.track); hline(x + 16, y + 1, w - 32, '#bbbbbb');
    this.arrow(x, y, 'left'); this.arrow(x + w - 16, y, 'right');
    if (frac < 1) this.thumb(x + 15 + R((w - 46) * clamp(k)), y, 16, 16);
  },
  grow(x, y, o = {}) { frame(x, y, 16, 16, C.black); rect(x + 1, y + 1, 14, 14, '#eeeeee'); if (o.active === false) return; frame(x + 5, y + 5, 8, 8, C.black); rect(x + 6, y + 6, 6, 6, '#cccccc'); frame(x + 3, y + 3, 7, 7, C.black); rect(x + 4, y + 4, 5, 5, C.white); },
  button(x, y, w, h, label, o = {}) {
    const r = Math.min(R(h / 2) - 1, 7);
    if (o.def) rframe(x - 4, y - 4, w + 8, h + 8, r + 4, C.black, 3);
    rrect(x, y, w, h, r, C.black); rrect(x + 1, y + 1, w - 2, h - 2, r - 1, o.pressed ? C.black : C.white);
    text(label, x + w / 2, y + R((h - capH('button')) / 2), { font: 'button', align: 'center', color: o.pressed ? C.white : o.disabled ? '#999999' : C.black });
  },
  check(x, y, on, o = {}) { frame(x, y, 12, 12, C.black); rect(x + 1, y + 1, 10, 10, o.pressed ? '#cccccc' : C.white); if (on) { line(x + 1, y + 1, x + 10, y + 10, C.black); line(x + 10, y + 1, x + 1, y + 10, C.black); } },
  progress(x, y, w, h, k, o = {}) { frame(x, y, w, h, C.black); rect(x + 1, y + 1, w - 2, h - 2, '#eeeeee'); if (o.indeterminate) { const sh = R((o.t ?? T) * 24) % 16; clipRect(x + 1, y + 1, w - 2, h - 2, () => { ctx.save(); ctx.translate(sh, 0); patfill(x - 15, y + 1, w + 16, h - 2, 'diag2', '#444477', '#ccccff'); ctx.restore(); }); } else { rect(x + 1, y + 1, R((w - 2) * clamp(k)), h - 2, '#444477'); } },
};
// ---- NeXTSTEP: 2-bit greys, black title bars, scrollers on the left ----
const NX = { k: '#000000', d: '#555555', l: '#aaaaaa', w: '#ffffff' };
function nxBevel(x, y, w, h, face = NX.l, pressed = false) { // NeXT raised bevel: white, then black + dark grey
  x = R(x); y = R(y); w = R(w); h = R(h);
  rect(x, y, w, h, pressed ? NX.w : face);
  const a = pressed ? NX.k : NX.w, b = pressed ? NX.w : NX.k;
  hline(x, y, w - 1, a); vline(x, y, h - 1, a); hline(x, y + h - 1, w, b); vline(x + w - 1, y, h, b);
  if (!pressed) { hline(x + 1, y + h - 2, w - 2, NX.d); vline(x + w - 2, y + 1, h - 2, NX.d); }
}
LOOK.next = {
  ...LOOK.mac1, titleH: 19, scrollW: 18, scrollLeft: true,
  win(x, y, w, h, title, o) {
    const act = o.active === undefined ? true : o.active, th = this.titleH;
    if (!o.noShadow) { rect(x + 2, y + h, w, 2, C.black); rect(x + w, y + 2, 2, h, C.black); }
    rect(x, y, w, h, C.black); rect(x + 1, y + 1, w - 2, h - 2, o.body || NX.l);
    const tbg = act === true ? NX.k : act === 'main' ? NX.d : NX.l, tfg = act === true || act === 'main' ? NX.w : NX.k;
    rect(x + 1, y + 1, w - 2, th - 1, tbg);
    if (title) clipRect(x + 22, y + 1, w - 44, th - 1, () => text(title, x + w / 2, y + 6, { font: 'title', align: 'center', color: tfg }));
    if (o.close !== false) this.tbtn(x + 4, y + 3, 'mini', o);
    if (o.close !== false) this.tbtn(x + w - 17, y + 3, o.dirty ? 'dirty' : 'close', o);
    const resize = o.resize !== false ? 8 : 0;
    if (resize) { const ry = y + h - 1 - resize; hline(x + 1, ry, w - 2, C.black); rect(x + 1, ry + 1, w - 2, resize - 1, NX.l); hline(x + 1, ry + 1, w - 2, NX.w); for (const dx of [26, w - 27]) { vline(x + dx, ry + 1, resize - 1, C.black); vline(x + dx + 1, ry + 1, resize - 1, NX.w); } }
    return { x: x + 1, y: y + th, w: w - 2, h: h - th - 1 - resize };
  },
  tbtn(x, y, kind, o = {}) {
    nxBevel(x, y, 13, 13, NX.l, o.closeHot && kind !== 'mini');
    if (kind === 'mini') { frame(x + 3, y + 3, 6, 6, C.black); hline(x + 4, y + 4, 4, NX.w); }
    else if (kind === 'dirty') { rect(x + 4, y + 4, 4, 4, C.black); rect(x + 5, y + 3, 2, 6, C.black); rect(x + 3, y + 5, 6, 2, C.black); }
    else for (let i = 0; i < 7; i++) { rect(x + 3 + i, y + 3 + i, 2, 1, C.black); rect(x + 9 - i, y + 3 + i, 2, 1, C.black); }
  },
  vscroll(x, y, h, k, frac, o = {}) { // NeXT scroller: dark track, dimpled knob, both arrows at the bottom
    rect(x, y, 18, h, C.black); rect(x + 1, y + 1, 16, h - 2, NX.d);
    const ah = 17, ty = y + 1, th = h - 2 - 2 * ah, kh = Math.max(14, R(th * clamp(frac || .3, .1, 1))), ky = ty + R((th - kh) * clamp(k));
    nxBevel(x + 1, ky, 16, kh); ring(x + 9, ky + R(kh / 2), 2, NX.d); rect(x + 8, ky + R(kh / 2) - 1, 2, 2, NX.w);
    for (const [i, dir] of [[0, 'up'], [1, 'down']]) { const by = y + h - 1 - (2 - i) * ah; nxBevel(x + 1, by, 16, ah - 1, NX.l, o.pressed === dir); arrowTri(x + 5, by + (dir === 'up' ? 5 : 6), 4, dir, C.black); }
  },
  hscroll(x, y, w, k, frac) { rect(x, y, w, 18, C.black); rect(x + 1, y + 1, w - 2, 16, NX.d); const kw = Math.max(14, R((w - 36) * clamp(frac || .3, .1, 1))); nxBevel(x + 1 + R((w - 36 - kw) * clamp(k)), y + 1, kw, 16); },
  grow() {},
  button(x, y, w, h, label, o = {}) {
    nxBevel(x, y, w, h, NX.l, o.pressed);
    const cx = x + w / 2 - (o.def ? 8 : 0);
    text(label, cx, y + R((h - capH('button')) / 2), { font: 'button', align: 'center', color: o.disabled ? NX.d : C.black });
    if (o.def) { const rx = x + w - 15, ry = y + R(h / 2) - 3; vline(rx + 8, ry, 5, C.black); hline(rx + 1, ry + 4, 8, C.black); arrowTri(rx, ry + 2, 3, 'left', C.black); } // the return-key glyph
  },
  field(x, y, w, h) { rect(x, y, w, h, NX.w); hline(x, y, w, NX.d); vline(x, y, h, NX.d); hline(x + 1, y + 1, w - 2, C.black); vline(x + 1, y + 1, h - 2, C.black); },
  check(x, y, on, o = {}) { nxBevel(x, y, 13, 13, NX.l, o.pressed); if (on) { line(x + 3, y + 6, x + 5, y + 9, C.black, 2); line(x + 5, y + 9, x + 10, y + 3, C.black, 2); } },
  radio(x, y, on) { oval(x, y, 13, 13, NX.d); oval(x + 1, y + 1, 11, 11, NX.w); oval(x + 2, y + 2, 10, 10, C.black); oval(x + 2, y + 2, 9, 9, NX.l); if (on) { oval(x + 4, y + 4, 5, 5, NX.w); } },
  progress(x, y, w, h, k) { rect(x, y, w, h, NX.d); hline(x, y, w, C.black); vline(x, y, h, C.black); rect(x + 1, y + 1, R((w - 1) * clamp(k)), h - 1, NX.w); },
  menubar() {},
  menuBox(x, y, w, h) { rect(x, y, w, h, C.black); },
  menuSel(x, y, w, h) { rect(x, y, w, h, NX.w); },
  dialog(x, y, w, h, o = {}) { const r = this.win(x, y, w, h, o.title || '', { ...o, close: false, resize: false }); return r; },
};
// ---- Platinum (Mac OS 8/9) ----
LOOK.plat = {
  ...LOOK.mac1, titleH: 20, scrollW: 16,
  win(x, y, w, h, title, o) {
    const act = o.active !== false, th = this.titleH;
    rect(x, y, w, h, P.frame);
    rect(x + 1, y + 1, w - 2, h - 2, act ? P.face : P.titleOff);
    if (act) { hline(x + 1, y + 1, w - 3, P.hi); vline(x + 1, y + 1, h - 3, P.hi); hline(x + 2, y + h - 2, w - 3, P.shadow); vline(x + w - 2, y + 2, h - 3, P.shadow); }
    this.titleBar(x, y, w, th, title, o, act);
    // content well: a 1px sunken edge inside a 3px frame
    const ix = x + 4, iy = y + th, iw = w - 8, ih = h - th - 4;
    hline(ix - 1, iy - 1, iw + 2, P.shadow); vline(ix - 1, iy - 1, ih + 2, P.shadow); hline(ix - 1, iy + ih, iw + 2, P.hi); vline(ix + iw, iy - 1, ih + 2, P.hi);
    rect(ix, iy, iw, ih, o.body || P.win);
    return { x: ix, y: iy, w: iw, h: ih };
  },
  ridges(x, y, w, a, b) { for (let i = 0; i < 6; i++) { hline(x, y + 2 * i, w, a); hline(x + 1, y + 2 * i + 1, w, b); } },
  titleBar(x, y, w, th, title, o, act) {
    const tw_ = title ? Math.min(tw(title, 'title'), w - 90) : 0, cx = x + R(w / 2), l = x + 24, r = x + w - (o.collapse !== false ? 40 : 24);
    if (act) {
      if (title) { this.ridges(l, y + 4, cx - R(tw_ / 2) - 8 - l, P.hi, P.shadow); this.ridges(cx + R(tw_ / 2) + 8, y + 4, r - cx - R(tw_ / 2) - 8, P.hi, P.shadow); }
      else this.ridges(l, y + 4, r - l, P.hi, P.shadow);
      if (o.close !== false) this.box(x + 7, y + 4, o.closeHot ? 'closeHot' : 'close');
      if (o.zoom !== false) this.box(x + w - 20, y + 4, 'zoom');
      if (o.collapse !== false) this.box(x + w - 36, y + 4, 'shade');
    }
    if (title) clipRect(cx - R(tw_ / 2) - 2, y + 1, tw_ + 4, th - 2, () => text(title, cx, y + 6, { font: 'title', align: 'center', color: act ? P.titleText : P.titleTextOff }));
  },
  box(x, y, kind) {
    frame(x, y, 12, 12, P.dark);
    if (kind === 'closeHot') { rect(x + 1, y + 1, 10, 10, P.shadow); hline(x + 1, y + 1, 10, P.dark); vline(x + 1, y + 1, 10, P.dark); return; }
    vgrad(x + 1, y + 1, 10, 10, [P.hi, P.lite, P.face, P.shadow], 2); hline(x + 1, y + 1, 9, P.hi); vline(x + 1, y + 1, 9, P.hi); hline(x + 2, y + 10, 9, P.shadow); vline(x + 10, y + 2, 9, P.shadow);
    if (kind === 'zoom') { frame(x + 2, y + 2, 6, 6, P.dark); }
    if (kind === 'shade') { hline(x + 2, y + 5, 8, P.dark); hline(x + 2, y + 7, 8, P.dark); }
  },
  arrow(x, y, dir, o = {}) {
    frame(x, y, 16, 16, P.dark); bevel(x + 1, y + 1, 14, 14, o.pressed ? P.shadow : P.face, o.pressed ? P.dark : P.hi, o.pressed ? P.face : P.shadow);
    if (dir === 'up') arrowTri(x + 4, y + 5, 4, 'up', C.black); else if (dir === 'down') arrowTri(x + 4, y + 7, 4, 'down', C.black);
    else if (dir === 'left') arrowTri(x + 5, y + 4, 4, 'left', C.black); else arrowTri(x + 7, y + 4, 4, 'right', C.black);
  },
  thumb(x, y, w, h, vertical = true) {
    frame(x, y, w, h, P.dark); bevel(x + 1, y + 1, w - 2, h - 2, P.thumb, lighten(P.thumb, .55), darken(P.thumb, .35));
    const cx = x + R(w / 2), cy = y + R(h / 2);
    for (let i = -2; i <= 2; i += 2) { if (vertical) { hline(cx - 3, cy + i, 6, lighten(P.thumb, .6)); hline(cx - 2, cy + i + 1, 6, darken(P.thumb, .45)); } else { vline(cx + i, cy - 3, 6, lighten(P.thumb, .6)); vline(cx + i + 1, cy - 2, 6, darken(P.thumb, .45)); } }
  },
  vscroll(x, y, h, k, frac, o = {}) {
    frame(x, y, 16, h, P.dark);
    if (o.active === false) { rect(x + 1, y + 1, 14, h - 2, P.face); return; }
    rect(x + 1, y + 16, 14, h - 32, P.track); vline(x + 1, y + 16, h - 32, P.shadow); vline(x + 2, y + 16, h - 32, darken(P.track, .12)); vline(x + 14, y + 16, h - 32, lighten(P.track, .3));
    this.arrow(x, y, 'up', { pressed: o.pressed === 'up' }); this.arrow(x, y + h - 16, 'down', { pressed: o.pressed === 'down' });
    if (frac < 1) { const th_ = Math.max(16, R((h - 30) * clamp(frac || .2, .1, 1))); this.thumb(x, y + 15 + R((h - 30 - th_) * clamp(k)), 16, th_); }
  },
  hscroll(x, y, w, k, frac, o = {}) {
    frame(x, y, w, 16, P.dark);
    if (o.active === false) { rect(x + 1, y + 1, w - 2, 14, P.face); return; }
    rect(x + 16, y + 1, w - 32, 14, P.track); hline(x + 16, y + 1, w - 32, P.shadow);
    this.arrow(x, y, 'left'); this.arrow(x + w - 16, y, 'right');
    if (frac < 1) { const tw2 = Math.max(16, R((w - 30) * clamp(frac || .2, .1, 1))); this.thumb(x + 15 + R((w - 30 - tw2) * clamp(k)), y, tw2, 16, false); }
  },
  grow(x, y, o = {}) { frame(x, y, 16, 16, P.dark); rect(x + 1, y + 1, 14, 14, P.face); if (o.active === false) return; for (let i = 0; i < 3; i++) { line(x + 5 + 3 * i, y + 13, x + 13, y + 5 + 3 * i, P.hi); line(x + 6 + 3 * i, y + 13, x + 13, y + 6 + 3 * i, P.shadow); } },
  button(x, y, w, h, label, o = {}) {
    if (o.def) { rframe(x - 3, y - 3, w + 6, h + 6, 5, P.dark, 1); rframe(x - 2, y - 2, w + 4, h + 4, 4, P.face, 2); hline(x - 1, y - 2, w + 2, P.hi); hline(x - 1, y + h + 1, w + 2, P.shadow); }
    rframe(x, y, w, h, 3, P.dark);
    const pr = o.pressed;
    rrect(x + 1, y + 1, w - 2, h - 2, 2, pr ? P.dark : P.face);
    if (!pr) { hline(x + 2, y + 1, w - 4, P.hi); vline(x + 1, y + 2, h - 4, P.hi); hline(x + 2, y + h - 2, w - 4, P.shadow); vline(x + w - 2, y + 2, h - 4, P.shadow); }
    text(label, x + w / 2, y + R((h - capH('button')) / 2), { font: 'button', align: 'center', color: pr ? C.white : o.disabled ? P.textDim : P.text });
  },
  field(x, y, w, h, o = {}) { rect(x, y, w, h, P.field); hline(x, y, w, P.shadow); vline(x, y, h, P.shadow); hline(x + 1, y + 1, w - 2, P.dark); vline(x + 1, y + 1, h - 2, P.dark); hline(x, y + h - 1, w, P.hi); vline(x + w - 1, y, h, P.hi); if (o.focus) frame(x - 2, y - 2, w + 4, h + 4, '#8888cc', 2); },
  check(x, y, on, o = {}) { frame(x, y, 12, 12, P.dark); bevel(x + 1, y + 1, 10, 10, o.pressed ? P.shadow : P.face, o.pressed ? P.dark : P.hi, o.pressed ? P.face : P.shadow); if (on) { line(x + 3, y + 5, x + 5, y + 8, C.black, 2); line(x + 5, y + 8, x + 10, y + 1, C.black, 2); } },
  radio(x, y, on, o = {}) { oval(x, y, 12, 12, P.dark); ovalGrad(x + 1, y + 1, 10, 10, [P.hi, P.face, P.shadow], 2); if (on) oval(x + 4, y + 4, 4, 4, C.black); },
  progress(x, y, w, h, k, o = {}) {
    frame(x, y, w, h, P.dark); rect(x + 1, y + 1, w - 2, h - 2, '#cccccc'); hline(x + 1, y + 1, w - 2, P.shadow);
    if (o.indeterminate) { const sh = R((o.t ?? T) * 30) % 16; clipRect(x + 1, y + 1, w - 2, h - 2, () => { ctx.save(); ctx.translate(sh, 0); patfill(x - 15, y + 1, w + 16, h - 2, 'diag2', '#6666cc', '#ccccff'); ctx.restore(); }); return; }
    const fw = R((w - 2) * clamp(k)); if (fw > 0) { vgrad(x + 1, y + 1, fw, h - 2, ['#ccccff', '#7777dd', '#5555bb'], 3); }
  },
  menubar(h) { rect(0, 0, W, h, P.menu); hline(0, 0, W, P.hi); hline(0, h - 2, W, P.shadow); hline(0, h - 1, W, C.black); },
  menuBox(x, y, w, h) { rect(x + 1, y + 1, w, h, darken(P.desk, .5)); rect(x, y, w, h, P.dark); rect(x, y, w - 1, h - 1, P.face); hline(x, y, w - 1, P.hi); vline(x, y, h - 1, P.hi); },
  menuSel(x, y, w, h) { rect(x, y, w, h, P.menuSel); },
  dialog(x, y, w, h, o = {}) {
    rect(x, y, w, h, C.black); bevel(x + 1, y + 1, w - 2, h - 2, P.face, P.hi, P.shadow); frame(x + 3, y + 3, w - 6, h - 6, P.shadow); bevel(x + 4, y + 4, w - 8, h - 8, o.body || P.face, P.hi, P.lite);
    return { x: x + 5, y: y + 5, w: w - 10, h: h - 10 };
  },
};
// ---- Drawing Board (1998 beta theme): Platinum's geometry, redrawn in pencil on drafting paper ----
function pencil(x0, y0, x1, y1, seed, c = P.ink) { // a hand-drawn line: overshoots its ends, wavers by a pixel
  const n = 2 + R(hash(seed) * 2);
  if (y0 === y1) { const a = x0 - n, b = x1 + R(hash(seed + 1) * 3); for (let x = a; x <= b; x += 6) { const dy = hash(seed + x * .37) > .86 ? 1 : 0; rect(x, y0 + dy, Math.min(6, b - x + 1), 1, c); } }
  else { const a = y0 - n, b = y1 + R(hash(seed + 1) * 3); for (let y = a; y <= b; y += 6) { const dx = hash(seed + y * .37) > .86 ? 1 : 0; rect(x0 + dx, y, 1, Math.min(6, b - y + 1), c); } }
}
LOOK.board = {
  ...LOOK.plat,
  win(x, y, w, h, title, o) {
    const r = LOOK.plat.win.call(this, x, y, w, h, title, o), sd = x * 7 + y * 13;
    pencil(x, y, x + w - 1, y, sd); pencil(x, y + h - 1, x + w - 1, y + h - 1, sd + 3); pencil(x, y, x, y + h - 1, sd + 5); pencil(x + w - 1, y, x + w - 1, y + h - 1, sd + 7);
    hline(x + 3, y + h, w - 2, '#958671'); vline(x + w, y + 3, h - 2, '#958671');
    return r;
  },
  ridges(x, y, w, a, b) { for (let i = 0; i < 6; i++) { const sd = x + y * 3 + i * 17; hline(x + R(hash(sd) * 3), y + 2 * i, w - R(hash(sd + 1) * 5), '#75685a'); if (hash(sd + 2) > .5) hline(x + 2, y + 2 * i + 1, R(w * .3), '#f4efe7'); } },
  box(x, y, kind) {
    rect(x + 1, y + 1, 10, 10, P.hi); pencil(x, y, x + 11, y, x + y, P.ink); pencil(x, y + 11, x + 11, y + 11, x + y + 2, P.ink); pencil(x, y, x, y + 11, x + y + 4, P.ink); pencil(x + 11, y, x + 11, y + 11, x + y + 6, P.ink);
    if (kind === 'zoom') { hline(x + 2, y + 6, 5, P.ink); vline(x + 6, y + 2, 5, P.ink); }
    if (kind === 'shade') { hline(x + 2, y + 5, 8, P.ink); hline(x + 3, y + 7, 7, P.ink); }
    if (kind === 'closeHot') { line(x + 2, y + 2, x + 9, y + 9, P.ink); line(x + 9, y + 2, x + 2, y + 9, P.ink); }
  },
  button(x, y, w, h, label, o = {}) {
    if (o.def) { rframe(x - 3, y - 3, w + 6, h + 6, 6, P.ink, 2); }
    rrect(x, y, w, h, 4, o.pressed ? P.dark : P.face); rframe(x, y, w, h, 4, P.ink);
    if (!o.pressed) { hline(x + 3, y + 1, w - 6, P.hi); hline(x + 3, y + h - 2, w - 6, P.shadow); }
    hline(x + 4 + R(hash(x) * 4), y + h, w - 8, '#a59888');
    text(label, x + w / 2, y + R((h - capH('button')) / 2), { font: 'button', align: 'center', color: o.pressed ? P.hi : o.disabled ? P.textDim : P.text });
  },
  menubar(h) { rect(0, 0, W, h, P.menu); hline(0, h - 2, W, P.shadow); pencil(0, h - 1, W, h - 1, 77, P.ink); },
  thumb(x, y, w, h, vertical = true) { rect(x + 1, y + 1, w - 2, h - 2, P.thumb); frame(x, y, w, h, P.ink); const cx = x + R(w / 2), cy = y + R(h / 2); for (let i = -2; i <= 2; i += 2) { if (vertical) hline(cx - 3, cy + i, 7, '#a07a20'); else vline(cx + i, cy - 3, 7, '#a07a20'); } },
};
// ---- Aqua (2002): gel, pinstripes, traffic lights ----
const pinstripe = (x, y, w, h, a = '#e9e9e9', b = '#f5f5f5') => patfill(x, y, w, h, 'hstripe', a, b);
function capsule(x, y, w, h, stops, edge, o = {}) { // a gel/glass pill
  const r = Math.floor(h / 2);
  rrect(x, y, w, h, r, edge); rrectGrad(x + 1, y + 1, w - 2, h - 2, r - 1, stops, o.steps || 3);
  if (o.shine !== false) rrectVeil(x + 3, y + 1, w - 6, Math.max(2, R(h * .38)), r - 2, C.white, o.shine ?? .55);
}
LOOK.aqua = {
  ...LOOK.mac1, titleH: 19, scrollW: 15, radius: 5, lampD: 11, lampGap: 15, lampStyle: 'gel',
  win(x, y, w, h, title, o) {
    const act = o.active !== false, th = this.titleH, r = this.radius;
    if (!o.noShadow) winShadow(x, y, w, h, r, 3, act ? .3 : .2);
    const s = topSpans(w, h, r);
    spanFill(x, y, w, s, '#7a7a7a');
    const inner = topSpans(w - 2, h - 2, r - 1);
    this.body(x + 1, y + 1, w - 2, h - 2, inner, o, act);
    this.titleBar(x, y, w, th, title, o, act);
    return { x: x + 1, y: y + th, w: w - 2, h: h - th - 1 };
  },
  body(x, y, w, h, s, o, act) { spanFill(x, y, w, s, '#f0f0f0'); pinstripe(x, y + s.findIndex(v => v === 0), w, h - s.findIndex(v => v === 0)); if (o.body) rect(x, y + this.titleH - 1, w, h - this.titleH + 1, o.body); },
  titleBar(x, y, w, th, title, o, act) {
    const s = topSpans(w - 2, th - 1, this.radius - 1);
    spanPat(x + 1, y + 1, w - 2, s, _pattern('ps' + (act ? 1 : 0), 4, 2, d => { for (let i = 0; i < 8; i++) _put(d, i * 4, i < 4 ? (act ? '#e4e4e4' : '#f2f2f2') : (act ? '#f3f3f3' : '#fafafa')); }));
    rrectVeil(x + 2, y + 1, w - 4, 6, 3, C.white, .5);
    hline(x + 1, y + th - 1, w - 2, act ? '#9a9a9a' : '#c8c8c8');
    lamps(x + 8, y + 4, this.lampD, this.lampGap, this.lampStyle, { active: act, hover: o.hover, dirty: o.dirty, noMin: o.noMin, noZoom: o.zoom === false });
    if (title) winTitle(x, w, title, y + 6, x + 8 + 2 * this.lampGap + this.lampD + 8, act ? P.titleText : P.titleTextOff, { shadow: this.engrave ? [C.white, 0, 1] : null });
  },
  vscroll(x, y, h, k, frac, o = {}) {
    hgrad(x, y, 15, h, ['#c9c9c9', '#eeeeee', '#fbfbfb', '#e8e8e8'], 2); vline(x, y, h, '#a5a5a5');
    const ah = 14, tr = h - 2 * ah, kh = Math.max(18, R(tr * clamp(frac || .3, .1, 1))), ky = y + 1 + R((tr - kh - 2) * clamp(k));
    if (frac < 1) this.thumbV(x + 2, ky, 12, kh);
    for (const [i, dir] of [[0, 'up'], [1, 'down']]) { const by = y + h - (2 - i) * ah; rect(x, by, 15, ah, '#f2f2f2'); hgrad(x + 1, by, 14, ah, ['#d9d9d9', '#fdfdfd', '#e4e4e4'], 2); hline(x, by, 15, '#a5a5a5'); arrowTri(x + 4, by + (dir === 'up' ? 4 : 6), 4, dir, '#2c2c2c'); }
  },
  thumbV(x, y, w, h) { rrect(x, y, w, h, 6, '#2a56b8'); hgrad(x + 1, y + 1, w - 2, h - 2, ['#3d72d8', '#7fb0f5', '#b9d8ff', '#6fa3ef', '#3b6fd6'], 2); rrSpans(w - 2, h - 2, 5).forEach((a, j) => { if (a) { rect(x + 1, y + 1 + j, a, 1, '#2a56b8'); rect(x + w - 1 - a, y + 1 + j, a, 1, '#2a56b8'); } }); rrectVeil(x + 2, y + 2, w - 4, 5, 2, C.white, .6); },
  hscroll(x, y, w, k, frac) { vgrad(x, y, w, 15, ['#c9c9c9', '#eeeeee', '#fbfbfb', '#e8e8e8'], 2); hline(x, y, w, '#a5a5a5'); if (frac < 1) { const kw = Math.max(18, R((w - 30) * clamp(frac || .3, .1, 1))); capsule(x + 1 + R((w - 30 - kw) * clamp(k)), y + 2, kw, 12, ['#3d72d8', '#7fb0f5', '#b9d8ff', '#3b6fd6'], '#2a56b8'); } },
  grow(x, y) { for (let i = 0; i < 3; i++) { line(x + 5 + 3 * i, y + 13, x + 13, y + 5 + 3 * i, '#8a8a8a'); line(x + 6 + 3 * i, y + 13, x + 13, y + 6 + 3 * i, C.white); } },
  button(x, y, w, h, label, o = {}) {
    const blue = o.def && !o.disabled, pul = blue ? (Math.sin((o.t ?? T) * Math.PI * 1.6) * .5 + .5) : 0;
    if (o.pressed) capsule(x, y, w, h, ['#1d4fb5', '#3b78dd', '#6aa6f2', '#9dcbff'], '#163f93');
    else if (blue) capsule(x, y, w, h, [mix('#2a64d6', '#5b9bf4', pul * .6), mix('#4f8ef0', '#7fb6fa', pul * .6), '#8cc2ff', '#c7e3ff'], '#21499e');
    else capsule(x, y, w, h, ['#f9f9f9', '#e9e9e9', '#dcdcdc', '#f4f4f4'], o.disabled ? '#b8b8b8' : '#8d8d8d', { shine: .7 });
    text(label, x + w / 2, y + R((h - capH('button')) / 2), { font: 'button', align: 'center', color: o.disabled ? P.textDim : C.black });
  },
  field(x, y, w, h, o = {}) { if (o.focus) rrect(x - 3, y - 3, w + 6, h + 6, 3, '#86b4f0'); rect(x, y, w, h, P.field); hline(x, y, w, '#6f6f6f'); vline(x, y, h, '#a0a0a0'); vline(x + w - 1, y, h, '#a0a0a0'); hline(x, y + h - 1, w, '#c4c4c4'); hline(x + 1, y + 1, w - 2, '#dadada'); },
  check(x, y, on, o = {}) { rrect(x, y, 12, 12, 2, '#6f6f6f'); rrectGrad(x + 1, y + 1, 10, 10, 1, on ? ['#3d72d8', '#7fb0f5', '#b9d8ff'] : ['#ffffff', '#e8e8e8', '#f6f6f6'], 2); if (on) { line(x + 3, y + 5, x + 5, y + 8, C.black, 2); line(x + 5, y + 8, x + 10, y + 1, C.black, 2); } },
  radio(x, y, on) { oval(x, y, 12, 12, '#6f6f6f'); ovalGrad(x + 1, y + 1, 10, 10, on ? ['#3d72d8', '#7fb0f5', '#b9d8ff'] : ['#ffffff', '#e2e2e2', '#f6f6f6'], 2); if (on) oval(x + 4, y + 4, 4, 4, '#0b1f4a'); },
  progress(x, y, w, h, k, o = {}) {
    rrect(x, y, w, h, R(h / 2), '#8a8a8a'); rrectGrad(x + 1, y + 1, w - 2, h - 2, R(h / 2) - 1, ['#d9d9d9', '#f6f6f6', '#ffffff', '#e0e0e0'], 2);
    if (o.indeterminate) { // the barber pole
      const sh = R((o.t ?? T) * 40) % 16, s = rrSpans(w - 2, h - 2, R(h / 2) - 1);
      ctx.save(); ctx.translate(sh, 0); spanPat(x + 1 - sh, y + 1, w - 2, s, _pattern('barber' + h, 16, 16, d => { for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) _put(d, (yy * 16 + xx) * 4, ((xx + yy) & 15) < 8 ? '#4f8ef0' : '#d7e8ff'); })); ctx.restore();
      rrectVeil(x + 2, y + 1, w - 4, R(h * .4), 2, C.white, .5); return;
    }
    const fw = R((w - 2) * clamp(k)); if (fw > 2) { rrectGrad(x + 1, y + 1, fw, h - 2, Math.min(R(h / 2) - 1, R(fw / 2)), ['#3d72d8', '#6fa3ef', '#a9d0ff', '#4f8ef0'], 3); rrectVeil(x + 2, y + 1, fw - 2, R(h * .4), 2, C.white, .5); }
  },
  menubar(h) { pinstripe(0, 0, W, h - 1, '#f2f2f2', '#fdfdfd'); hline(0, h - 1, W, '#9a9a9a'); veil(0, h, W, 1, C.black, .25); },
  menuTitleSel(x, y, w, h) { vgrad(x, y, w, h, ['#5a95ee', '#2f6bd8', '#3a7ae6'], 3); },
  menuBox(x, y, w, h) { veil(x + 1, y + 2, w, h, C.black, .3); rect(x, y, w, h, '#c4c4c4'); pinstripe(x + 1, y, w - 2, h - 1, '#f4f4f4', '#fcfcfc'); },
  menuSel(x, y, w, h) { vgrad(x, y, w, h, ['#5a95ee', '#2f6bd8', '#3a7ae6'], 3); },
  dialog(x, y, w, h, o = {}) { return this.win(x, y, w, h, o.title || '', { ...o, noMin: true, zoom: false }); },
  dock(x, y, w, h) { rrectVeil(x, y, w, h, 6, '#eef4ff', .75); rframe(x, y, w, h, 6, '#ffffff'); hline(x + 6, y + 1, w - 12, '#ffffff'); hline(x + 6, y + h - 2, w - 12, '#b9c8dc'); },
};
// ---- Tiger (2005): brushed metal ----
LOOK.metal = {
  ...LOOK.aqua, radius: 5, engrave: true,
  win(x, y, w, h, title, o) {
    const act = o.active !== false, th = this.titleH, r = this.radius;
    if (!o.noShadow) winShadow(x, y, w, h, r, 3, act ? .3 : .2);
    const s = rrSpans(w, h, r);
    spanFill(x, y, w, s, '#5d5d5d'); metalFill(x + 1, y + 1, w - 2, rrSpans(w - 2, h - 2, r - 1));
    if (!act) spanPat(x + 1, y + 1, w - 2, rrSpans(w - 2, h - 2, r - 1), bayerPat(.25, '#ffffff', null));
    lamps(x + 8, y + 4, this.lampD, this.lampGap, 'gel', { active: act, hover: o.hover, dirty: o.dirty, noMin: o.noMin, noZoom: o.zoom === false });
    if (title) winTitle(x, w, title, y + 6, x + 8 + 2 * this.lampGap + this.lampD + 8, act ? '#1a1a1a' : '#6a6a6a', { shadow: [C.white, 0, 1] });
    // the content sits in a sunken well inside the metal
    const ix = x + 6, iy = y + th + 1, iw = w - 12, ih = h - th - 8;
    hline(ix - 1, iy - 1, iw + 2, '#6c6c6c'); vline(ix - 1, iy - 1, ih + 2, '#8a8a8a'); vline(ix + iw, iy - 1, ih + 2, '#8a8a8a'); hline(ix - 1, iy + ih, iw + 2, '#e8e8e8');
    rect(ix, iy, iw, ih, o.body || P.win);
    return { x: ix, y: iy, w: iw, h: ih };
  },
  menubar(h) { vgrad(0, 0, W, h - 1, ['#ffffff', '#f2f2f2', '#e6e6e6'], 3); hline(0, h - 1, W, '#8e8e8e'); veil(0, h, W, 1, C.black, .25); },
  menuBox(x, y, w, h) { veil(x + 1, y + 2, w, h, C.black, .3); rect(x, y, w, h, '#c4c4c4'); rect(x + 1, y, w - 2, h - 1, '#f7f7f7'); veil(x + 1, y, w - 2, h - 1, '#ffffff', .5); },
  dock(x, y, w, h) { rrectVeil(x, y, w, h, 6, '#f2f5fa', .75); rframe(x, y, w, h, 6, '#ffffff'); hline(x + 6, y + h - 2, w - 12, '#b9c8dc'); },
};
// ---- Snow Leopard (2009): unified grey gradient title bars, the glass dock shelf ----
LOOK.unified = {
  ...LOOK.aqua, radius: 5, lampD: 11, lampGap: 14, lampStyle: 'gloss', titleH: 20, engrave: true,
  win(x, y, w, h, title, o) {
    const act = o.active !== false, th = this.titleH + (o.toolbar || 0), r = this.radius;
    if (!o.noShadow) winShadow(x, y, w, h, r, 4, act ? .32 : .2);
    spanFill(x, y, w, topSpans(w, h, r), act ? '#5f5f5f' : '#8f8f8f');
    rect(x + 1, y + th, w - 2, h - th - 1, o.body || P.face);
    spanGrad(x + 1, y + 1, w - 2, topSpans(w - 2, th - 1, r - 1), act ? this.tstops : this.tstopsOff, 4);
    hline(x + 2, y + 1, w - 4, act ? '#f4f4f4' : '#fbfbfb');
    hline(x + 1, y + th - 1, w - 2, act ? '#515151' : '#9d9d9d');
    lamps(x + 8, y + 4, this.lampD, this.lampGap, this.lampStyle, { active: act, hover: o.hover, dirty: o.dirty, noMin: o.noMin, noZoom: o.zoom === false });
    if (o.fullscreen) this.fsGlyph(x + w - 16, y + 5);
    if (title) winTitle(x, w, title, y + 6, x + 8 + 2 * this.lampGap + this.lampD + 8, act ? '#222222' : '#8a8a8a', { shadow: [act ? '#ececec' : '#f6f6f6', 0, 1] });
    return { x: x + 1, y: y + th, w: w - 2, h: h - th - 1 };
  },
  tstops: ['#e9e9e9', '#d6d6d6', '#c3c3c3', '#b3b3b3'], tstopsOff: ['#f6f6f6', '#ececec', '#e3e3e3'],
  fsGlyph(x, y) { const c = '#5a5a5a'; line(x + 3, y + 7, x + 7, y + 3, c); rect(x + 6, y + 2, 3, 1, c); rect(x + 8, y + 2, 1, 3, c); line(x + 1, y + 9, x + 2, y + 8, c); rect(x, y + 7, 1, 3, c); rect(x, y + 9, 3, 1, c); },
  button(x, y, w, h, label, o = {}) {
    if (o.pressed) capsule(x, y, w, h, ['#9cc4f7', '#5d97ec', '#3c7ce0'], '#2a5bb5', { shine: .3 });
    else if (o.def && !o.disabled) { const pul = Math.sin((o.t ?? T) * Math.PI * 1.6) * .5 + .5; capsule(x, y, w, h, [mix('#b9d7fb', '#d6e8ff', pul * .5), '#6aa7f2', '#3c82e6', '#7bb8f8'], '#2a5bb5', { shine: .45 }); }
    else capsule(x, y, w, h, ['#ffffff', '#f3f3f3', '#e2e2e2', '#f2f2f2'], o.disabled ? '#c2c2c2' : '#8a8a8a', { shine: .5 });
    text(label, x + w / 2, y + R((h - capH('button')) / 2), { font: 'button', align: 'center', color: o.disabled ? P.textDim : C.black });
  },
  thumbV(x, y, w, h) { rrect(x, y, w, h, 6, '#3a6fc8'); hgrad(x + 1, y + 1, w - 2, h - 2, ['#5a92e6', '#9cc4f7', '#cfe3ff', '#8ab8f2', '#4d86dd'], 2); rrSpans(w - 2, h - 2, 5).forEach((a, j) => { if (a) { rect(x + 1, y + 1 + j, a, 1, '#3a6fc8'); rect(x + w - 1 - a, y + 1 + j, a, 1, '#3a6fc8'); } }); },
  menubar(h) { frost(0, 0, W, h - 1, '#f6f6f6', .9); hline(0, 0, W, '#ffffff'); hline(0, h - 1, W, '#7e7e7e'); veil(0, h, W, 1, C.black, .3); },
  menuBox(x, y, w, h) { veil(x + 2, y + 3, w, h, C.black, .3); rrect(x, y, w, h, 4, '#bdbdbd'); rrectVeil(x + 1, y, w - 2, h - 1, 3, '#f7f7f7', .95); },
  menuSel(x, y, w, h) { vgrad(x, y, w, h, ['#6b9ef1', '#3d80df', '#2a6cd4'], 3); },
  menuTitleSel(x, y, w, h) { vgrad(x, y, w, h, ['#6b9ef1', '#3d80df', '#2a6cd4'], 3); },
  dock(x, y, w, h) { // the 3D glass shelf
    const top = y + h - 14, inset = 18;
    poly([[x + inset, top], [x + w - inset, top], [x + w, y + h], [x, y + h]], '#c7d0de');
    for (let j = 0; j < 14; j++) { const k = j / 13, a = R(lerp(inset, 0, k)); veil(x + a, top + j, w - 2 * a, 1, j < 3 ? '#ffffff' : '#7b8aa3', j < 3 ? .6 : .25 + k * .25); }
    hline(x + inset, top, w - 2 * inset, '#ffffff'); hline(x, y + h - 1, w, '#e9eef7'); hline(x, y + h - 2, w, '#9aa6ba');
  },
};
// ---- Lion (2011) ----
LOOK.lion = {
  ...LOOK.unified, lampD: 10, lampGap: 14, overlayScroll: true, scrollW: 0,
  tstops: ['#ececec', '#dcdcdc', '#cdcdcd', '#c4c4c4'], tstopsOff: ['#f6f6f6', '#efefef', '#e8e8e8'],
  win(x, y, w, h, title, o) { return LOOK.unified.win.call(this, x, y, w, h, title, { fullscreen: true, ...o }); },
  vscroll(x, y, h, k, frac, o = {}) { if (frac >= 1 || o.hidden) return; const kh = Math.max(16, R(h * clamp(frac || .3, .1, 1))), ky = y + R((h - kh) * clamp(k)); rrect(x + 7, ky + 2, 6, kh - 4, 3, '#2b2b2b'); rrectVeil(x + 8, ky + 3, 4, kh - 6, 2, '#9a9a9a', .5); },
  hscroll(x, y, w, k, frac, o = {}) { if (frac >= 1 || o.hidden) return; const kw = Math.max(16, R(w * clamp(frac || .3, .1, 1))); rrect(x + R((w - kw) * clamp(k)) + 2, y + 7, kw - 4, 6, 3, '#2b2b2b'); },
  dock(x, y, w, h) { LOOK.unified.dock(x, y, w, h); },
};
// ---- Yosemite (2014): flat, translucent, Helvetica Neue ----
LOOK.flat = {
  ...LOOK.lion, radius: 5, lampD: 11, lampGap: 15, lampStyle: 'flat', titleH: 20, engrave: false,
  win(x, y, w, h, title, o) {
    const act = o.active !== false, th = this.titleH + (o.toolbar || 0), r = this.radius;
    if (!o.noShadow) winShadow(x, y, w, h, r, 3, act ? .24 : .15);
    spanFill(x, y, w, topSpans(w, h, r), act ? '#a9a9a9' : '#c9c9c9');
    rect(x + 1, y + th, w - 2, h - th - 1, o.body || P.face);
    spanGrad(x + 1, y + 1, w - 2, topSpans(w - 2, th - 1, r - 1), act ? ['#ececec', '#e3e3e3'] : ['#f6f6f6', '#f6f6f6'], 2);
    hline(x + 1, y + th - 1, w - 2, act ? '#c6c6c6' : '#dedede');
    lamps(x + 8, y + 4, this.lampD, this.lampGap, 'flat', { active: act, hover: o.hover, dirty: o.dirty, noMin: o.noMin, noZoom: o.zoom === false });
    if (title) winTitle(x, w, title, y + 6, x + 8 + 2 * this.lampGap + this.lampD + 8, act ? P.titleText : P.titleTextOff);
    return { x: x + 1, y: y + th, w: w - 2, h: h - th - 1 };
  },
  button(x, y, w, h, label, o = {}) {
    const blue = o.def && !o.disabled;
    if (blue || o.pressed) { rrect(x, y, w, h, 3, o.pressed ? '#0a5fc8' : '#0b70e0'); rrectGrad(x + 1, y + 1, w - 2, h - 2, 2, o.pressed ? ['#3d8cf0', '#0866d6'] : ['#6cb3fa', '#0b80ff'], 3); }
    else { rrect(x, y + 1, w, h, 3, '#a8a8a8'); rrect(x, y, w, h, 3, '#c8c8c8'); rrect(x + 1, y + 1, w - 2, h - 2, 2, '#ffffff'); }
    text(label, x + w / 2, y + R((h - capH('button')) / 2), { font: 'button', align: 'center', color: blue || o.pressed ? C.white : o.disabled ? P.textDim : '#262626' });
  },
  field(x, y, w, h, o = {}) { if (o.focus) rrect(x - 3, y - 3, w + 6, h + 6, 4, '#7fb4f6'); rect(x, y, w, h, '#ffffff'); frame(x, y, w, h, '#c5c5c5'); hline(x, y, w, '#adadad'); },
  check(x, y, on, o = {}) { rrect(x, y, 12, 12, 2, on ? '#0b70e0' : '#b5b5b5'); rrect(x + 1, y + 1, 10, 10, 2, on ? '#2b8cf6' : '#ffffff'); if (on) { line(x + 3, y + 6, x + 5, y + 8, C.white); line(x + 5, y + 8, x + 9, y + 3, C.white); line(x + 3, y + 5, x + 5, y + 7, C.white); line(x + 5, y + 7, x + 9, y + 2, C.white); } },
  radio(x, y, on) { oval(x, y, 12, 12, on ? '#0b70e0' : '#b5b5b5'); oval(x + 1, y + 1, 10, 10, on ? '#2b8cf6' : C.white); if (on) oval(x + 4, y + 4, 4, 4, C.white); },
  progress(x, y, w, h, k, o = {}) {
    const hh = Math.min(h, 6), yy = y + R((h - hh) / 2);
    rrect(x, yy, w, hh, R(hh / 2), '#dcdcdc');
    if (o.indeterminate) { const p = ((o.t ?? T) * .8) % 1.4 - .2, a = clamp(p - .2) * w, b = clamp(p + .1) * w; if (b > a) rrect(x + R(a), yy, R(b - a), hh, R(hh / 2), '#2b8cf6'); return; }
    const fw = R(w * clamp(k)); if (fw > 0) rrect(x, yy, Math.max(fw, hh), hh, R(hh / 2), '#2b8cf6');
  },
  vscroll(x, y, h, k, frac, o = {}) { if (frac >= 1 || o.hidden) return; const kh = Math.max(16, R(h * clamp(frac || .3, .1, 1))), ky = y + R((h - kh) * clamp(k)); rrect(x + 8, ky + 2, 6, kh - 4, 3, '#a0a0a0'); },
  menubar(h) { frost(0, 0, W, h, '#f6f6f6', .86); hline(0, h - 1, W, '#cfcfcf'); },
  menuBox(x, y, w, h) { veil(x + 2, y + 3, w, h, C.black, .2); rrect(x, y, w, h, 5, '#cfcfcf'); rrectVeil(x + 1, y + 1, w - 2, h - 2, 4, '#f6f6f6', .9); },
  menuSel(x, y, w, h) { rect(x, y, w, h, P.menuSel); },
  menuTitleSel(x, y, w, h) { rect(x, y, w, h, P.menuSel); },
  dock(x, y, w, h) { const s = rrSpans(w, h, 4); spanPat(x, y, w, s, noisePat(.78, '#f4f4f4', null)); spanFrame(x, y, w, s, '#e2e2e2'); },
};
// ---- Big Sur (2020): rounded, roomier, SF ----
LOOK.sur = {
  ...LOOK.flat, radius: 8, titleH: 24, lampD: 11, lampGap: 16,
  win(x, y, w, h, title, o) {
    const act = o.active !== false, th = this.titleH + (o.toolbar || 0), r = this.radius;
    if (!o.noShadow) winShadow(x, y, w, h, r, 4, act ? .26 : .15);
    const s = rrSpans(w, h, r);
    spanFill(x, y, w, s, act ? '#b9b9b9' : '#d6d6d6');
    spanFill(x + 1, y + 1, w - 2, rrSpans(w - 2, h - 2, r - 1), o.body || '#ffffff');
    spanFill(x + 1, y + 1, w - 2, topSpans(w - 2, th - 1, r - 1), act ? P.title : P.titleOff);
    hline(x + 1, y + th - 1, w - 2, act ? '#d6d6d6' : '#e6e6e6');
    lamps(x + 10, y + R((this.titleH - this.lampD) / 2), this.lampD, this.lampGap, 'flat', { active: act, hover: o.hover, dirty: o.dirty, noMin: o.noMin, noZoom: o.zoom === false });
    if (title) winTitle(x, w, title, y + R((this.titleH - capH('title')) / 2), x + 10 + 2 * this.lampGap + this.lampD + 8, act ? P.titleText : P.titleTextOff);
    return { x: x + 1, y: y + th, w: w - 2, h: h - th - 1 - 3, round: r };
  },
  button(x, y, w, h, label, o = {}) {
    const blue = o.def && !o.disabled;
    if (blue || o.pressed) { rrect(x, y, w, h, 5, o.pressed ? '#0060d0' : '#0a6fe6'); rrectGrad(x + 1, y + 1, w - 2, h - 2, 4, o.pressed ? ['#2a7ff0', '#0a65d8'] : ['#3f97ff', '#0a7cff'], 2); }
    else { rrect(x, y + 1, w, h, 5, '#c2c2c2'); rrect(x, y, w, h, 5, '#d4d4d4'); rrect(x + 1, y + 1, w - 2, h - 2, 4, '#ffffff'); }
    text(label, x + w / 2, y + R((h - capH('button')) / 2), { font: 'button', align: 'center', color: blue || o.pressed ? C.white : o.disabled ? P.textDim : '#262626' });
  },
  menuBox(x, y, w, h) { veil(x + 2, y + 4, w, h, C.black, .2); rrect(x, y, w, h, 7, '#c9c9c9'); rrectVeil(x + 1, y + 1, w - 2, h - 2, 6, '#f4f4f4', .92); },
  menuSel(x, y, w, h) { rrect(x + 4, y, w - 8, h, 4, P.menuSel); },
  menuTitleSel(x, y, w, h) { rrect(x, y + 1, w, h - 2, 4, '#c9c9cf'); },
  dock(x, y, w, h) { const s = rrSpans(w, h, 10); spanPat(x, y, w, s, noisePat(.72, '#f6f2f4', null)); spanFrame(x, y, w, s, '#f3eef1'); },
};
// ---- Liquid Glass (2026): translucent everything, by dither ----
LOOK.glass = {
  ...LOOK.sur, radius: 12, titleH: 24, lampD: 11, lampGap: 16,
  win(x, y, w, h, title, o) {
    const act = o.active !== false, r = this.radius, th = this.titleH + (o.toolbar || 0);
    if (!o.noShadow) winShadow(x, y, w, h, r, 5, act ? .2 : .12);
    const s = rrSpans(w, h, r);
    spanPat(x, y, w, s, noisePat(.9, act ? '#f6f8fb' : '#f1f3f6', null));
    spanFrame(x, y, w, s, act ? '#ffffff' : '#f4f6f9');
    // rim light: bright top-left, cool bottom-right
    hline(x + r, y + h - 1, w - 2 * r, '#cdd5e0'); vline(x + w - 1, y + r, h - 2 * r, '#d9e0ea');
    hline(x + r, y + 1, w - 2 * r, '#ffffff');
    lamps(x + 12, y + R((this.titleH - this.lampD) / 2) + 1, this.lampD, this.lampGap, 'glass', { active: act, hover: o.hover, dirty: o.dirty, noMin: o.noMin, noZoom: o.zoom === false });
    if (title) winTitle(x, w, title, y + R((this.titleH - capH('title')) / 2) + 1, x + 12 + 2 * this.lampGap + this.lampD + 8, act ? P.titleText : P.titleTextOff);
    if (o.body) rrect(x + 6, y + th, w - 12, h - th - 6, 7, o.body);
    return { x: x + 6, y: y + th, w: w - 12, h: h - th - 6, round: 7 };
  },
  button(x, y, w, h, label, o = {}) {
    const blue = o.def && !o.disabled, r = Math.floor(h / 2);
    if (blue || o.pressed) { rrect(x, y, w, h, r, '#4d6f9e'); rrectGrad(x + 1, y + 1, w - 2, h - 2, r - 1, o.pressed ? ['#55779f', '#3f6190'] : ['#86a5cc', '#5f84b5', '#557aab'], 3); hline(x + r, y + 1, w - 2 * r, '#b9cce6'); }
    else { rrectVeil(x, y, w, h, r, '#ffffff', .8); rframe(x, y, w, h, r, '#d7dde6'); hline(x + r, y + 1, w - 2 * r, '#ffffff'); }
    text(label, x + w / 2, y + R((h - capH('button')) / 2), { font: 'button', align: 'center', color: blue || o.pressed ? C.white : o.disabled ? P.textDim : '#1d1d1f' });
  },
  field(x, y, w, h, o = {}) { const r = Math.min(R(h / 2), 7); if (o.focus) rframe(x - 2, y - 2, w + 4, h + 4, r + 2, '#8fb3e6', 2); rrectVeil(x, y, w, h, r, '#ffffff', .85); rframe(x, y, w, h, r, '#dfe4eb'); },
  progress(x, y, w, h, k, o = {}) { const hh = Math.min(h, 6), yy = y + R((h - hh) / 2); rrectVeil(x, yy, w, hh, 3, '#9aa4b2', .4); const fw = o.indeterminate ? R(w * .3) : R(w * clamp(k)), fx = o.indeterminate ? x + R((((o.t ?? T) * .7) % 1) * (w - fw)) : x; if (fw > 0) rrect(fx, yy, Math.max(hh, fw), hh, 3, '#5b80b1'); },
  menubar(h) { frost(0, 0, W, h, '#f6f8fb', .55); },
  menuBox(x, y, w, h) { winShadow(x, y, w, h, 10, 3, .14); const s = rrSpans(w, h, 10); spanPat(x, y, w, s, bayerPat(.9, '#f7f9fc', null)); spanFrame(x, y, w, s, '#ffffff'); },
  menuSel(x, y, w, h) { rrect(x + 5, y, w - 10, h, 6, P.menuSel); },
  menuTitleSel(x, y, w, h) { rrectVeil(x, y + 1, w, h - 2, 6, '#ffffff', .9); rframe(x, y + 1, w, h - 2, 6, '#ffffff'); },
  dock(x, y, w, h) { const s = rrSpans(w, h, 14); spanPat(x, y, w, s, noisePat(.7, '#f9fbfd', null)); spanFrame(x, y, w, s, '#ffffff'); hline(x + 14, y + 1, w - 28, '#ffffff'); hline(x + 14, y + h - 1, w - 28, '#c9d1dc'); },
};
const look = () => LOOK[E.chrome];
// winTitle(x, y, w, title, ty, left, color, o): a centred title that slides right (and clips) when the window is narrow
function winTitle(x, w, title, ty, left, color, extra = {}) {
  const tw_ = tw(title, 'title'), room = x + w - 8 - left;
  let cx = x + R(w / 2);
  if (cx - tw_ / 2 < left) cx = left + R(Math.min(tw_, room) / 2);
  clipRect(left, ty - 4, room, capH('title') + 8, () => text(title, cx, ty, { font: 'title', align: 'center', color, ...extra }));
}
