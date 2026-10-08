// ui.js: the era-aware widget kit. Every widget asks the current era (eras.js: E, P, LOOK) how to paint itself,
// so the same scene code wears all twelve appearances. All sizes are in 640x360 pixels.
//
// Per-frame UI state a scene may set while drawing (main resets it every frame):
//   UI.menu = {app, menus, open, clock, right, prop}   the menu bar (UI.menubar = false hides it)
//   UI.dock = {items, hover, bounce, open} | false       the dock, in eras that have one
//   CUR = {x, y, kind, down}                             the mouse pointer (the writer); null hides it
//   overlay(fn)                                          draw fn after the menu bar and dock (above everything)
'use strict';

let UI = {}, CUR = null;
const overlay = fn => { (UI.overlays || (UI.overlays = [])).push(fn); };

// ------------------------------------------------------------------------------------------------
// windows
// ------------------------------------------------------------------------------------------------
// win(x, y, w, h, title, opts) -> client rect {x, y, w, h, frame} (null while it is still zooming open)
// opts: k (0..1 opening: classic zoom rects from opts.from, a rect or [x, y]) · active (false = inactive;
//   'main' for NeXT's main-not-key) · scroll ('v' | 'h' | 'vh') · sk / sfrac (vertical scroll position / thumb
//   size) · hk / hfrac · grow · header ('text' or [left, centre, right]) · status (same, at the bottom) · body
//   (fill colour for the client area) · close / zoom / collapse (false hides) · closeHot (pressed) · dirty · hover
//   (lights show glyphs) · noShadow · toolbar (extra px of unified title bar) · pressed ('up'|'down' scroll arrow)
function win(x, y, w, h, title = '', o = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  const k = o.k ?? 1;
  if (k <= 0) return null;
  if (k < 1) { zoomRects(o.from || [x + w / 2, y + h / 2], { x, y, w, h }, k); return null; }
  const L = look(), r = L.win(x, y, w, h, title, o);
  let cx = r.x, cy = r.y, cw = r.w, ch = r.h;
  if (o.body && E.chrome !== 'mac1' && E.chrome !== 'mac7' && E.chrome !== 'glass') rect(cx, cy, cw, ch, o.body);
  if (o.header != null) { const hh = stripH(); infoStrip(cx, cy, cw, hh, o.header, 'top'); cy += hh; ch -= hh; }
  if (o.status != null) { const hh = stripH(); infoStrip(cx, cy + ch - hh, cw, hh, o.status, 'bottom'); ch -= hh; }
  const sc = o.scroll || '', vs = sc.includes('v'), hs = sc.includes('h'), act = o.active !== false;
  const classic = ['mac1', 'mac7', 'plat', 'board'].includes(E.chrome), sw = L.scrollW, bottom0 = cy + ch;
  const corner = (vs && hs) || (o.grow && classic) ? (classic ? 15 : sw) : 0;
  if (vs) {
    if (L.overlayScroll) L.vscroll(cx + cw - 18, cy, ch - (hs ? 12 : 0), o.sk || 0, o.sfrac ?? .3, { active: act });
    else if (L.scrollLeft) { L.vscroll(cx, cy, ch, o.sk || 0, o.sfrac ?? .3, { active: act, pressed: o.pressed }); cx += sw; cw -= sw; }
    else if (classic) { L.vscroll(cx + cw - 15, cy - 1, ch + 2 - corner, o.sk || 0, o.sfrac ?? .3, { active: act, pressed: o.pressed }); cw -= 15; }
    else { L.vscroll(cx + cw - sw, cy, ch - corner, o.sk || 0, o.sfrac ?? .3, { active: act, pressed: o.pressed }); cw -= sw; }
  }
  if (hs) {
    if (L.overlayScroll) L.hscroll(cx, cy + ch - 16, cw - 12, o.hk || 0, o.hfrac ?? .5, { active: act });
    else if (classic) { L.hscroll(cx - 1, cy + ch - 15, cw + 2 - (vs ? 0 : corner), o.hk || 0, o.hfrac ?? .5, { active: act }); ch -= 15; }
    else { L.hscroll(cx, cy + ch - sw, cw, o.hk || 0, o.hfrac ?? .5, { active: act }); ch -= sw; }
  }
  if (corner && classic) L.grow(vs ? cx + cw : cx + cw - 15, bottom0 - 15, { active: act });
  else if (corner && !L.overlayScroll && L.grow) L.grow(cx + cw, cy + ch, { active: act });
  return { x: cx, y: cy, w: cw, h: ch, frame: { x, y, w, h }, round: r.round || 0 };
}
const stripH = () => Math.max(14, lineH('small') + 4);
// infoStrip: the product's thin info line under a title bar ("79 words · 4 paragraphs | Modified") or at the bottom
function infoStrip(x, y, w, h, parts, where = 'top') {
  if (!Array.isArray(parts)) parts = [parts];
  const fam = E.chrome, bg = fam === 'mac1' || fam === 'mac7' ? P.win : fam === 'next' ? NX.l : fam === 'aqua' ? null : fam === 'glass' ? null : P.face;
  if (fam === 'metal') metalFill(x, y, w, new Array(h).fill(0)); else if (bg) rect(x, y, w, h, bg); else if (fam === 'aqua') pinstripe(x, y, w, h);
  hline(x, where === 'top' ? y + h - 1 : y, w, fam === 'mac1' || fam === 'mac7' ? C.black : fam === 'next' ? C.black : P.rule);
  const ty = y + R((h - capH('small')) / 2) - (where === 'top' ? 0 : -1);
  if (parts[0]) text(parts[0], x + 6, ty, { font: 'small', color: P.text });
  if (parts[1]) text(parts[1], x + w / 2, ty, { font: 'small', color: P.text, align: 'center' });
  if (parts[2]) text(parts[2], x + w - 6, ty, { font: 'small', color: P.text, align: 'right' });
}
// zoomRects(from, to, k): the classic expanding outline (from = rect or [x, y]); draws three trailing rects
function zoomRects(from, to, k) {
  const a = Array.isArray(from) ? { x: from[0] - 8, y: from[1] - 6, w: 16, h: 12 } : from;
  for (let i = 0; i < 4; i++) {
    const kk = easeOut(clamp(k - i * .09)); if (kk <= 0) continue;
    const x = R(lerp(a.x, to.x, kk)), y = R(lerp(a.y, to.y, kk)), w = R(lerp(a.w, to.w, kk)), h = R(lerp(a.h, to.h, kk));
    dragOutline(x, y, w, h);
  }
}
// dragOutline(x, y, w, h): the dotted grey outline of a window being dragged (and the zoom rects)
function dragOutline(x, y, w, h, c) {
  const st = bayerPat(.5, c || (E.depth === 1 || luma(P.desk) > .5 ? C.black : C.white), null);
  ctx.fillStyle = st; x = R(x); y = R(y); w = R(w); h = R(h);
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
}
function vscroll(x, y, h, k = 0, frac = .3, o = {}) { look().vscroll(R(x), R(y), R(h), k, frac, o); }
function hscroll(x, y, w, k = 0, frac = .3, o = {}) { look().hscroll(R(x), R(y), R(w), k, frac, o); }
function growBox(x, y, o = {}) { const L = look(); if (L.grow) L.grow(R(x), R(y), o); }
// panel(x, y, w, h, o): a plain inset area (list well, text area) in the era's style
function panel(x, y, w, h, o = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  const fam = E.chrome, fill = o.fill || P.win;
  if (fam === 'mac1' || fam === 'mac7') { frame(x, y, w, h, C.black); rect(x + 1, y + 1, w - 2, h - 2, fill); }
  else if (fam === 'next') { rect(x, y, w, h, fill); hline(x, y, w, NX.d); vline(x, y, h, NX.d); hline(x + 1, y + 1, w - 1, C.black); vline(x + 1, y + 1, h - 1, C.black); hline(x, y + h - 1, w, NX.w); vline(x + w - 1, y, h, NX.w); }
  else if (fam === 'plat' || fam === 'board') { rect(x, y, w, h, fill); hline(x, y, w, P.shadow); vline(x, y, h, P.shadow); hline(x, y + h - 1, w, P.hi); vline(x + w - 1, y, h, P.hi); }
  else if (fam === 'glass') { rrect(x, y, w, h, 7, fill); rframe(x, y, w, h, 7, P.rule); }
  else if (fam === 'sur') { rrect(x, y, w, h, 4, fill); rframe(x, y, w, h, 4, P.rule); }
  else { rect(x, y, w, h, fill); frame(x, y, w, h, P.rule); hline(x, y, w, darken(P.rule, .15)); }
  return { x: x + 2, y: y + 2, w: w - 4, h: h - 4 };
}
// card(x, y, w, h): the raised content card of the later eras (a plain panel before them)
function card(x, y, w, h, o = {}) {
  const fam = E.chrome;
  if (fam === 'glass') { rrect(x, y, w, h, 8, o.fill || P.card); rframe(x, y, w, h, 8, '#e3e8ef'); hline(x + 8, y + h, w - 16, '#e1e6ed'); return; }
  if (fam === 'sur' || fam === 'flat') { rrect(x, y, w, h, 5, o.fill || P.card); rframe(x, y, w, h, 5, P.rule); return; }
  panel(x, y, w, h, o);
}
function sep(x, y, w) { if (E.chrome === 'mac1' || E.chrome === 'mac7') dither(x, y, w, 1, C.black, C.white); else if (E.chrome === 'plat' || E.chrome === 'board') { hline(x, y, w, P.shadow); hline(x, y + 1, w, P.hi); } else hline(x, y, w, P.rule); }

// ------------------------------------------------------------------------------------------------
// controls
// ------------------------------------------------------------------------------------------------
// button(x, y, w, h, label, {def, pressed, disabled}) -> rect. Default button: the ring / gel / blue fill of its era.
function button(x, y, w, h, label, o = {}) { x = R(x); y = R(y); look().button(x, y, R(w), R(h), label, o); return { x, y, w, h, cx: x + R(w / 2), cy: y + R(h / 2) }; }
const btnH = () => ({ mac1: 18, mac7: 18, next: 20, plat: 20, board: 20 }[E.chrome] || 18);
function check(x, y, label, on, o = {}) { look().check(R(x), R(y), on, o); if (label) { text(label, x + 18, y + R((12 - capH('ui')) / 2), { color: o.disabled ? P.textDim : P.text, font: o.font || 'ui' }); if (o.disabled && E.depth === 1) bayer(x + 17, y - 1, tw(label, o.font || 'ui') + 2, 14, .5, C.white, null); } return { x, y, w: 18 + (label ? tw(label, o.font || 'ui') : 0), h: 12 }; }
function radio(x, y, label, on, o = {}) { look().radio(R(x), R(y), on, o); if (label) text(label, x + 18, y + R((12 - capH('ui')) / 2), { color: P.text, font: o.font || 'ui' }); return { x, y, w: 18 + (label ? tw(label, o.font || 'ui') : 0), h: 12 }; }
// popup(x, y, w, label, o): a popup-menu button
function popup(x, y, w, label, o = {}) {
  x = R(x); y = R(y); w = R(w); const h = btnH(), fam = E.chrome;
  if (fam === 'mac1' || fam === 'mac7') { rect(x + 1, y + 1, w, h, C.black); rect(x, y, w, h, C.black); rect(x + 1, y + 1, w - 2, h - 2, o.pressed ? C.black : C.white); arrowTri(x + w - 15, y + 7, 5, 'down', o.pressed ? C.white : C.black); }
  else if (fam === 'next') { nxBevel(x, y, w, h); frame(x + w - 14, y + 6, 7, 6, C.black); hline(x + w - 14, y + 12, 8, NX.w); }
  else if (fam === 'plat' || fam === 'board') { look().button(x, y, w, h, '', o); vline(x + w - 18, y + 3, h - 6, P.shadow); vline(x + w - 17, y + 3, h - 6, P.hi); arrowTri(x + w - 13, y + 8, 4, 'down', P.text); }
  else if (fam === 'aqua' || fam === 'metal' || fam === 'unified' || fam === 'lion') { capsule(x, y, w, h, ['#ffffff', '#ececec', '#dedede'], '#8d8d8d', { shine: .5 }); rrect(x + w - 18, y + 1, 17, h - 2, 7, '#3c79de'); rrectGrad(x + w - 17, y + 2, 15, h - 4, 6, ['#6aa2f0', '#2f6bd8', '#5a95ee'], 2); arrowTri(x + w - 12, y + 4, 3, 'up', C.white); arrowTri(x + w - 12, y + 10, 3, 'down', C.white); }
  else { look().button(x, y, w, h, '', o); arrowTri(x + w - 13, y + 5, 3, 'up', P.text); arrowTri(x + w - 13, y + 10, 3, 'down', P.text); }
  text(label, x + 8, y + R((h - capH('ui')) / 2), { font: 'ui', color: o.pressed && (fam === 'mac1' || fam === 'mac7') ? C.white : P.text });
  return { x, y, w, h };
}
// textField(x, y, w, h, str, {caret, focus, placeholder, sel: [a, b], font, align}) -> {x, y, w, h, caretX}
function textField(x, y, w, h, str = '', o = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  look().field(x, y, w, h, o);
  const font = o.font || 'body', ty = y + R((h - capH(font)) / 2), pad = E.chrome === 'glass' ? 8 : 4;
  let s = String(str), cx = x + pad;
  while (s && tw(s, font) > w - 2 * pad - 2) s = s.slice(1);
  if (!s && o.placeholder) text(fitText(o.placeholder, w - 2 * pad - 2, font), x + pad, ty, { font, color: P.textDim });
  if (o.sel && s) { const a = tw(s.slice(0, o.sel[0]), font), b = tw(s.slice(0, o.sel[1]), font); rect(x + pad + a, ty - 2, b - a, capH(font) + 4, P.sel); }
  if (s) cx += text(s, x + pad, ty, { font, color: o.color || P.text });
  if (o.caret && (o.caret === 'solid' || caretOn())) rect(cx + 1, ty - 2, 1, capH(font) + 4, P.text);
  return { x, y, w, h, caretX: cx + 1 };
}
// typedField(x, y, w, h, full, t0, t1, o): a field that a person types full into between t0 and t1
function typedField(x, y, w, h, full, t0, t1, o = {}) { const s = typed(full, t0, t1); return textField(x, y, w, h, s, { caret: (T >= t0 - .5 && T < t1 + 1) ? (T < t1 ? 'solid' : true) : false, focus: T >= t0 - .5, ...o }); }
function progress(x, y, w, h, k, o = {}) { look().progress(R(x), R(y), R(w), R(h), k, o); }
// slider(x, y, w, k, o): a horizontal slider; returns the thumb centre
function slider(x, y, w, k, o = {}) {
  x = R(x); y = R(y); const tx = x + R(clamp(k) * (w - 10)), fam = E.chrome;
  if (fam === 'mac1' || fam === 'mac7') { frame(x, y + 5, w, 4, C.black); poly([[tx, y], [tx + 10, y], [tx + 10, y + 9], [tx + 5, y + 14], [tx, y + 9]], C.black); poly([[tx + 1, y + 1], [tx + 9, y + 1], [tx + 9, y + 9], [tx + 5, y + 13], [tx + 1, y + 9]], C.white); }
  else if (fam === 'next') { rect(x, y + 3, w, 8, NX.d); nxBevel(tx, y, 12, 14); }
  else if (fam === 'plat' || fam === 'board') { panel(x, y + 5, w, 4); bevel(tx, y, 11, 14, P.face, P.hi, P.shadow, P.dark); }
  else { rrect(x, y + 5, w, 4, 2, '#b8b8b8'); rrect(x, y + 5, R(clamp(k) * w), 4, 2, fam === 'glass' ? P.accent : '#3a84f0'); oval(tx - 1, y, 13, 13, '#9a9a9a'); ovalGrad(tx, y + 1, 11, 11, ['#ffffff', '#ececec', '#d8d8d8'], 2); }
  return [tx + 5, y + 7];
}
// tabs(x, y, w, labels, sel): Platinum tabs before Aqua, segmented control from Aqua on
function tabs(x, y, w, labels, sel = 0) {
  const fam = E.chrome, n = labels.length, tw_ = R(w / n);
  if (['mac1', 'mac7', 'next', 'plat', 'board'].includes(fam)) {
    labels.forEach((l, i) => { const tx = x + i * tw_, on = i === sel; rect(tx, y + (on ? 0 : 2), tw_ - 2, 16 - (on ? 0 : 2), on ? (fam === 'mac1' ? C.white : P.face) : (fam === 'mac1' ? C.white : P.lite)); frame(tx, y + (on ? 0 : 2), tw_ - 2, 17 - (on ? 0 : 2), fam === 'next' ? C.black : P.frame === '#000000' ? C.black : P.dark); text(l, tx + tw_ / 2 - 1, y + 5, { font: 'ui', align: 'center', color: on ? P.text : P.textDim }); });
    hline(x, y + 16, w, P.frame); return;
  }
  const r = fam === 'glass' ? 9 : 4, h = 17;
  if (fam === 'glass') { rrect(x, y, w, h, r, '#f9fafc'); rframe(x, y, w, h, r, '#dfe4eb'); }
  else capsule(x, y, w, h, ['#ffffff', '#ececec', '#dedede'], '#8d8d8d', { shine: .5 });
  labels.forEach((l, i) => {
    const tx = x + i * tw_, on = i === sel;
    if (on) { if (fam === 'glass') rrect(tx + 2, y + 2, tw_ - 4, h - 4, r - 2, '#ffffff'); else if (fam === 'aqua' || fam === 'metal' || fam === 'unified' || fam === 'lion') rrectGrad(tx + 1, y + 1, tw_ - 2, h - 2, 3, ['#6aa2f0', '#2f6bd8', '#5a95ee'], 2); else rrect(tx + 1, y + 1, tw_ - 2, h - 2, 3, '#5f5f5f'); }
    else if (i) vline(tx, y + 3, h - 6, '#b0b0b0');
    const light = on && fam !== 'glass';
    text(l, tx + tw_ / 2, y + R((h - capH('ui')) / 2), { font: 'ui', align: 'center', color: light ? C.white : P.text });
  });
}
// groupBox(x, y, w, h, label)
function groupBox(x, y, w, h, label) {
  const fam = E.chrome;
  if (fam === 'mac1' || fam === 'mac7') frame(x, y, w, h, C.black);
  else if (fam === 'next') { frame(x, y, w, h, NX.d); frame(x + 1, y + 1, w - 2, h - 2, NX.w); }
  else if (fam === 'plat' || fam === 'board') { frame(x, y, w, h, P.shadow); frame(x + 1, y + 1, w - 2, h - 2, P.hi); }
  else rrectVeil(x, y, w, h, 5, darken(P.face, .08), 1);
  if (label) { const lw = tw(label, 'ui') + 8; rect(x + 8, y - 6, lw, 12, fam === 'mac1' || fam === 'mac7' ? P.win : fam === 'next' ? NX.l : P.face); text(label, x + 12, y - R(capH('ui') / 2), { font: 'ui', color: P.text }); }
}
// listRows(x, y, w, rows, {sel, rowH, font, stripes, icons}) rows: strings or {text, icon, right, dim}
function listRows(x, y, w, rows, o = {}) {
  const rh = o.rowH || Math.max(16, lineH(o.font || 'body') + 3), font = o.font || 'body', modern = !['mac1', 'mac7', 'next', 'plat', 'board'].includes(E.chrome);
  rows.forEach((r, i) => {
    if (typeof r === 'string') r = { text: r };
    const yy = y + i * rh, on = i === o.sel;
    if (o.stripes && modern && i % 2) rect(x, yy, w, rh, E.chrome === 'glass' ? '#f3f6fa' : '#edf3fe');
    if (on) { if (E.chrome === 'glass') rrect(x + 2, yy, w - 4, rh, 6, P.listSel); else rect(x, yy, w, rh, P.listSel); }
    const col = on ? P.listSelText : r.dim ? P.textDim : P.text;
    let tx = x + 4;
    if (r.icon) { icon(r.icon, x + 3, yy + R((rh - 16) / 2), { size: 16, sel: on && E.depth === 1 }); tx += 20; }
    text(r.text, tx, yy + R((rh - capH(font)) / 2), { font, color: col });
    if (r.right) text(r.right, x + w - 5, yy + R((rh - capH(font)) / 2), { font: 'small', color: on ? P.listSelText : P.textDim, align: 'right' });
  });
  return { rowH: rh, h: rows.length * rh };
}

// ------------------------------------------------------------------------------------------------
// menus
// ------------------------------------------------------------------------------------------------
defSprite('cmdkey', `
.KK...KK.
K..K.K..K
K..K.K..K
.KKKKKKK.
...K.K...
.KKKKKKK.
K..K.K..K
K..K.K..K
.KK...KK.`);
defSprite('checkmark', `
.......K
......KK
.....KK.
K...KK..
KK.KK...
.KKK....
..K.....`);
const MENUS = ['File', 'Edit', 'Writing', 'Special'];
// menuLayout(o) -> [{label, x, w}] for the menu titles of the current era (use it to place pulled-down menus)
function menuLayout(o = UI.menu || {}) {
  const fam = E.chrome, items = [], modern = E.index >= ERA.aqua.index;
  if (fam === 'next') { const labels = [o.app || 'TeachText'].concat(o.menus || MENUS); labels.forEach((l, i) => items.push({ label: l, x: 0, y: i * 15, w: 104 })); return items; }
  let x = modern ? 10 : 8;
  x += 13 + (modern ? 14 : 10);
  const pad = modern ? 9 : 8;
  const labels = (modern ? [o.app || 'Finder'] : []).concat(o.menus || MENUS);
  labels.forEach((l, i) => { const font = modern && i === 0 ? 'appName' : 'menu', w = tw(l, font) + 2 * pad; items.push({ label: l, x: x - pad, w, font, app: modern && i === 0 }); x += w; });
  return items;
}
// menuIndex(label, o) -> the `open` index of a menu title in the current era. From Aqua on, index 0 is the bold app
// name, so 'Writing' is 2 in System 6 and 3 in Aqua: never hard-code the number (or just set UI.menu.open = 'Writing').
function menuIndex(label, o = UI.menu || {}) { const i = menuLayout(o).findIndex(it => it.label === label); return i < 0 ? undefined : E.chrome === 'next' ? i - 1 : i; }
// menuAt(label | index, o) -> {label, x, w} of that title in the bar (hang a pullMenu under it: pullMenu(m.x, E.menuH - 1, ...))
function menuAt(which, o = UI.menu || {}) { const i = typeof which === 'string' ? menuIndex(which, o) : which; return i == null || E.chrome === 'next' ? null : menuLayout(o)[i] || null; }
// clockText(t): the menu-bar clock (advances a minute every 15 seconds of song)
const clockText = (t = T, base = 16 * 60 + 12) => { const m = base + Math.floor(t / 15), hh = Math.floor(m / 60) % 12 || 12, mm = String(m % 60).padStart(2, '0'); return (E.index >= ERA.lion.index ? 'Thu ' : '') + hh + ':' + mm + ' ' + (Math.floor(m / 60) % 24 < 12 ? 'AM' : 'PM'); };
// menuBar(o): the menu bar (main draws it after the scene, from UI.menu). o.open = index (or label) of a highlighted title,
// o.right = [strings], o.prop = fn(x, y, w, h) drawing the running prop in the right-hand slot (w = o.propW)
function menuBar(o = {}) {
  const fam = E.chrome, L = look(), h = E.menuH;
  if (typeof o.open === 'string') o = { ...o, open: menuIndex(o.open, o) };
  if (fam === 'next') return nextMenu(o);
  L.menubar(h);
  const items = menuLayout(o), modern = E.index >= ERA.aqua.index;
  markGlyph(modern ? 10 : 8, R((h - 13) / 2) - (modern ? 0 : 1));
  items.forEach((it, i) => {
    const on = o.open === i, ty = R((h - capH(it.font)) / 2) - (modern ? 0 : 1);
    if (on) (L.menuTitleSel || L.menuSel).call(L, it.x, 0, it.w, h - 1);
    const light = on && fam !== 'sur' && fam !== 'glass';
    text(it.label, it.x + it.w / 2, ty, { font: it.font, align: 'center', color: light ? P.menuSelText : P.menuText });
  });
  // right side: [prop] [extras] [clock]
  let rx = W - 10;
  const font = 'menu', ty = R((h - capH(font)) / 2) - (modern ? 0 : 1);
  if (o.clock !== false) { const c = typeof o.clock === 'string' ? o.clock : clockText(); rx -= text(c, rx, ty, { font, align: 'right', color: P.menuText }) + 14; }
  for (const r of [].concat(o.right || []).reverse()) rx -= text(r, rx, ty, { font, align: 'right', color: P.menuText }) + 14;
  if (!modern && E.depth > 1 && o.appIcon !== false) { icon(o.appIcon || 'teachText', rx - 6, R((h - 16) / 2), { size: 16 }); rx -= 24; } // System 7's application menu
  if (o.prop) { const pw = o.propW || 90; o.prop(rx - pw, 1, pw, h - 3); rx -= pw + 12; }
  if (E.corners && !o.noCorners) screenCorners();
  return items;
}
const NX_TILE = 40, NX_GAP = 3;  // NeXT dock column: tile size and gap (x = W - NX_TILE - 1)
function nextMenu(o = {}) { // NeXTSTEP's vertical main menu, top-left
  const items = menuLayout(o), w = 104, rh = 15;
  rect(0, 0, w + 1, items.length * rh + 1, C.black);
  items.forEach((it, i) => {
    const y = it.y;
    if (i === 0) { rect(0, 0, w, rh, C.black); text(it.label, 6, 4, { font: 'helvB', color: C.white }); return; }
    nxBevel(0, y, w, rh, NX.l, o.open === i - 1);
    text(it.label, 6, y + 4, { font: 'helv', color: C.black });
    arrowTri(w - 10, y + 4, 4, 'right', C.black);
  });
  // the right side of the screen: the dock column (NX_TILE px tiles) carries the mark, the clock and the running prop
  const dx = W - NX_TILE - 1, ty = i => 1 + i * (NX_TILE + NX_GAP);
  nxBevel(dx, ty(0), NX_TILE, NX_TILE, NX.l); markGlyph(dx + 14, ty(0) + 13);
  if (o.clock !== false) { nxBevel(dx, ty(1), NX_TILE, NX_TILE, NX.l); rect(dx + 5, ty(1) + 5, NX_TILE - 10, NX_TILE - 10, C.black); const c = (typeof o.clock === 'string' ? o.clock : clockText()).split(' ')[0]; text(c, dx + NX_TILE / 2, ty(1) + 15, { font: 'helvB11', align: 'center', color: C.white }); }
  if (o.prop) { nxBevel(dx, ty(2), NX_TILE, NX_TILE, NX.l); o.prop(dx + 3, ty(2) + 3, NX_TILE - 6, NX_TILE - 6); }
  return items;
}
// pullMenu(x, y, items, sel, o): a pulled-down menu. items: 'Label', 'Label\t⌘K', '-' (separator), '~Disabled', '✓Checked'
// Returns {x, y, w, h, rows: [y...]}. Use menuLayout()[i].x for x and E.menuH for y under a menu title.
function pullMenu(x, y, items, sel = -1, o = {}) {
  const L = look(), font = o.font || 'menu', rh = o.rowH || (E.index >= ERA.aqua.index ? 17 : 16), fam = E.chrome;
  const parts = items.map(i => { const dis = i[0] === '~', chk = i[0] === '✓', s = i.replace(/^[~✓]/, '').split('\t'); return { label: s[0], key: s[1], dis, chk, sep: i === '-' }; });
  const kw = Math.max(0, ...parts.map(p => p.key ? tw(p.key.replace('⌘', ''), font) + 14 : 0));
  const w = o.w || Math.max(...parts.map(p => tw(p.label, font))) + 34 + kw;
  let h = 4; for (const p of parts) h += p.sep ? (fam === 'mac1' || fam === 'mac7' ? 8 : 9) : rh;
  x = R(x); y = R(y);
  L.menuBox(x, y, w, h);
  let yy = y + 2; const rows = [];
  parts.forEach((p, i) => {
    rows.push(yy);
    if (p.sep) { const sy = yy + 4; if (fam === 'mac1' || fam === 'mac7') dither(x, sy, w - 2, 1, C.black, P.menu); else if (fam === 'plat' || fam === 'board') { hline(x + 1, sy, w - 3, P.shadow); hline(x + 1, sy + 1, w - 3, P.hi); } else hline(x + 8, sy, w - 16, '#d4d4d4'); yy += fam === 'mac1' || fam === 'mac7' ? 8 : 9; return; }
    const on = i === sel && !p.dis;
    if (on) L.menuSel(x, yy, w - (fam === 'mac1' || fam === 'mac7' ? 2 : 1), rh);
    const col = on ? P.menuSelText : p.dis ? P.textDim : P.menuText, ty = yy + R((rh - capH(font)) / 2);
    if (p.chk) spr(tinted(SPR.checkmark, col), x + 7, ty + 1);
    text(p.label, x + 18, ty, { font, color: col });
    if (p.dis && E.depth === 1) bayer(x + 16, yy + 1, tw(p.label, font) + 4, rh - 2, .5, P.menu, null);
    if (p.key) { const k = p.key.replace('⌘', ''), kx = x + w - 10 - tw(k, font); text(k, kx, ty, { font, color: col }); if (p.key.includes('⌘')) spr(tinted(SPR.cmdkey, col), kx - 12, ty); }
    yy += rh;
  });
  return { x, y, w, h, rows, rowH: rh };
}

// ------------------------------------------------------------------------------------------------
// dialogs and alerts
// ------------------------------------------------------------------------------------------------
// alertIcon(kind, x, y): 32x32 'stop' | 'caution' | 'note' in the era's depth
defSprite('al_caution', `
...............KK...............
..............KWWK..............
.............KWWWWK.............
.............KWWWWK.............
............KWWWWWWK............
............KWWWWWWK............
...........KWWWWWWWWK...........
...........KWWWKKWWWK...........
..........KWWWKKKKWWWK..........
..........KWWWKKKKWWWK..........
.........KWWWWKKKKWWWWK.........
.........KWWWWKKKKWWWWK.........
........KWWWWWKKKKWWWWWK........
........KWWWWWKKKKWWWWWK........
.......KWWWWWWWKKWWWWWWWK.......
.......KWWWWWWWKKWWWWWWWK.......
......KWWWWWWWWKKWWWWWWWWK......
......KWWWWWWWWWWWWWWWWWWK......
.....KWWWWWWWWWKKWWWWWWWWWK.....
.....KWWWWWWWWKKKKWWWWWWWWK.....
....KWWWWWWWWWKKKKWWWWWWWWWK....
....KWWWWWWWWWWKKWWWWWWWWWWK....
...KWWWWWWWWWWWWWWWWWWWWWWWWK...
...KKKKKKKKKKKKKKKKKKKKKKKKKK...`, { K: '#000000', W: '#ffffff' });
defSprite('al_stop', `
..........KKKKKKKKKKKK..........
.........KWWWWWWWWWWWWK.........
........KWWWWWWWWWWWWWWK........
.......KWWWWWWKKWWWWWWWWK.......
......KWWWWKKWKWKKWWWWWWWK......
.....KWWWWKWKWKWKWKWWWWWWWK.....
....KWWWWWKWKWKWKWKWWWWWWWWK....
...KWWWWWWKWKWKWKWKWWWWWWWWWK...
..KWWWWWWWKWWWWWWWKWWKWWWWWWWK..
.KWWWWWWWWKWWWWWWWKWKWKWWWWWWWK.
KWWWWWWWWWKWWWWWWWKKWWKWWWWWWWWK
KWWWWWWWWWKWWWWWWWKWWWKWWWWWWWWK
KWWWWWWWWWKWWWWWWWWWWKWWWWWWWWWK
KWWWWWWWWWKWWWWWWWWWWKWWWWWWWWWK
KWWWWWWWWWWKWWWWWWWWKWWWWWWWWWWK
KWWWWWWWWWWKWWWWWWWWKWWWWWWWWWWK
KWWWWWWWWWWWKWWWWWWKWWWWWWWWWWWK
KWWWWWWWWWWWKWWWWWWKWWWWWWWWWWWK
KWWWWWWWWWWWWKKKKKKWWWWWWWWWWWWK
.KWWWWWWWWWWWWWWWWWWWWWWWWWWWWK.
..KWWWWWWWWWWWWWWWWWWWWWWWWWWK..
...KWWWWWWWWWWWWWWWWWWWWWWWWK...
....KWWWWWWWWWWWWWWWWWWWWWWK....
.....KWWWWWWWWWWWWWWWWWWWWK.....
......KWWWWWWWWWWWWWWWWWWK......
.......KWWWWWWWWWWWWWWWWK.......
........KWWWWWWWWWWWWWWK........
.........KWWWWWWWWWWWWK.........
..........KKKKKKKKKKKK..........`, { K: '#000000', W: '#ffffff' });
function alertIcon(kind, x, y) {
  x = R(x); y = R(y);
  const colour = E.depth > 2;
  if (kind === 'caution') {
    if (!colour) return spr('al_caution', x, y + 4);
    spr(tinted(SPR.al_caution, '#000000'), x, y + 4); poly([[x + 16, y + 6], [x + 28, y + 26], [x + 4, y + 26]], E.chrome === 'board' ? '#ecc867' : '#ffcc00');
    rect(x + 15, y + 11, 2, 8, C.black); rect(x + 15, y + 21, 2, 2, C.black); return;
  }
  if (kind === 'stop') {
    if (!colour) return spr('al_stop', x, y + 2);
    spr(tinted(SPR.al_stop, '#000000'), x, y + 2); poly([[x + 11, y + 3], [x + 21, y + 3], [x + 29, y + 11], [x + 29, y + 21], [x + 21, y + 29], [x + 11, y + 29], [x + 3, y + 21], [x + 3, y + 11]], '#d8322c');
    rect(x + 9, y + 13, 14, 6, C.white); return;
  }
  // note: Clio's balloon, the AI's own glyph
  clio(x + 1, y + 4, { scale: 1, expr: 'deadpan', mouth: 0, plain: true });
}
// dialog(x, y, w, h, o): a modal dialog frame -> client rect. o.title (for eras whose alerts have title bars)
function dialog(x, y, w, h, o = {}) {
  x = R(x); y = R(y);
  const k = o.k ?? 1; if (k <= 0) return null;
  if (k < 1) { zoomRects(o.from || [x + w / 2, y + h / 2], { x, y, w, h }, k); return null; }
  return look().dialog(x, y, R(w), R(h), o);
}
// alert(cx, cy, o): an auto-sized alert centred at (cx, cy).
// o: icon ('caution'|'stop'|'note'|an icon name), text (wrapped) or lines, buttons (['Cancel', 'OK']), def (index; default last),
//    pressed (index), w (width), font, k (opening), title. Returns {x, y, w, h, btn: [rects], text: {x, y}}.
function alert(cx, cy, o = {}) {
  const font = o.font || 'ui', bh = btnH(), btns = o.buttons || ['OK'], def = o.def ?? btns.length - 1;
  const bws = btns.map(b => Math.max(58, tw(b, 'button') + 24));
  const w = o.w || Math.max(260, bws.reduce((a, b) => a + b + 12, 40));
  const iconW = o.icon ? 48 : 0, tw_ = w - iconW - 34;
  const lines = o.lines || wrap(o.text || '', tw_, font), lh = o.lh || lineH(font);
  const top = E.chrome === 'mac1' || E.chrome === 'mac7' || E.chrome === 'plat' || E.chrome === 'board' ? 0 : look().titleH || 0;
  const h = o.h || Math.max(o.icon ? 44 : 0, lines.length * lh) + 30 + bh + 14 + top;
  const x = R(cx - w / 2), y = R(cy - h / 2);
  const c = dialog(x, y, w, h, { k: o.k, from: o.from, title: o.title });
  if (!c) return { x, y, w, h, btn: [] };
  if (o.icon) { if (['caution', 'stop', 'note'].includes(o.icon)) alertIcon(o.icon, c.x + 10, c.y + 10); else icon(o.icon, c.x + 10, c.y + 10); }
  const tx = c.x + 12 + iconW, ty = c.y + 14;
  lines.forEach((l, i) => text(l, tx, ty + i * lh, { font, color: P.text }));
  const btn = []; let bx = c.x + c.w - 14;
  for (let i = btns.length - 1; i >= 0; i--) { bx -= bws[i]; btn[i] = button(bx, c.y + c.h - bh - 12, bws[i], bh, btns[i], { def: i === def, pressed: o.pressed === i, disabled: (o.disabled || []).includes(i) }); bx -= 14; }
  return { x, y, w, h, btn, text: { x: tx, y: ty }, client: c };
}

// ------------------------------------------------------------------------------------------------
// desktop objects
// ------------------------------------------------------------------------------------------------
// deskIcon(x, y, name, label, {sel, open, set, labelW}): 32px icon at (x, y), label centred beneath. -> {x, y, w, h, cx, cy}
function deskIcon(x, y, name, label, o = {}) {
  x = R(x); y = R(y);
  const fam = E.chrome, font = 'label', lw = tw(label, font), lx = clamp(x + 16 - R(lw / 2), 4, W - lw - 5), ly = y + 36, ch = capH(font); // the label never runs off the screen
  if (o.sel && !['mac1', 'mac7', 'next', 'plat', 'board'].includes(fam)) rrect(x - 4, y - 3, 40, 38, 4, fam === 'glass' ? mix(P.desk, '#ffffff', .6) : shade(.32));
  icon(name, x, y, { sel: o.sel && ['mac1', 'mac7', 'next', 'plat', 'board'].includes(fam), open: o.open, set: o.set });
  if (!label) return { x, y, w: 32, h: 32, cx: x + 16, cy: y + 16 };
  if (fam === 'mac1' || fam === 'mac7') { rect(lx - 2, ly - 2, lw + 4, ch + 4, o.sel ? C.black : C.white); text(label, lx, ly, { font, color: o.sel ? C.white : C.black }); }
  else if (fam === 'next') { if (o.sel) rect(lx - 2, ly - 2, lw + 4, ch + 4, C.white); text(label, lx, ly, { font, color: o.sel ? C.black : C.white }); }
  else if (fam === 'plat' || fam === 'board') { rect(lx - 2, ly - 2, lw + 4, ch + 4, o.sel ? C.black : P.desk === '#4a71ab' ? '#ffffff' : P.hi); text(label, lx, ly, { font, color: o.sel ? C.white : C.black }); }
  else if (fam === 'glass') { rrect(lx - 5, ly - 3, lw + 10, ch + 7, 5, o.sel ? '#2c2e33' : '#f7f9fc'); text(label, lx, ly, { font, color: o.sel ? C.white : P.text }); }
  else { if (o.sel) rrect(lx - 4, ly - 2, lw + 8, ch + 5, 4, P.listSel); text(label, lx, ly, { font, color: C.white, shadow: o.sel ? null : ['#000000', 0, 1] }); }
  return { x, y, w: 32, h: 32 + ch + 6, cx: x + 16, cy: y + 16 };
}
function trashIcon(x, y, full = false, o = {}) { return deskIcon(x, y, full ? 'trashFull' : 'trash', o.label ?? 'Trash', o); }
// deskIcons(list, o): a column of desktop icons down the right edge (as on the product's desktop)
function deskIcons(list, o = {}) {
  const x = o.x ?? (E.chrome === 'next' ? W - 100 : W - 52), y0 = o.y ?? E.menuH + 10, gap = o.gap ?? 54;
  return list.map((it, i) => deskIcon(x, y0 + i * gap, it[0], it[1], { sel: o.sel === i || it[2] }));
}

// ------------------------------------------------------------------------------------------------
// balloons and tooltips
// ------------------------------------------------------------------------------------------------
// balloon(x, y, w, h, tx, ty, o): System 7 Balloon Help (and the speech of later eras) with a tail pointing at
// (tx, ty). Returns the text rect. o.fill / o.edge override colours.
function balloon(x, y, w, h, tx, ty, o = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  const fam = E.chrome, classic = ['mac1', 'mac7', 'next', 'plat', 'board'].includes(fam), r = classic ? 8 : fam === 'glass' ? 12 : 9;
  const fill = o.fill || (classic ? C.white : fam === 'glass' ? '#f8fafc' : '#ffffff'), edge = o.edge || (classic ? C.black : fam === 'glass' ? '#ffffff' : '#9a9a9a');
  const tail = (c, d) => {
    if (tx == null) return;
    const left = tx < x + w / 2, bx = clamp(left ? x + 18 : x + w - 18, x + r, x + w - r), below = ty > y + h, above = ty < y;
    if (below) poly([[bx - 8 + d, y + h - 2], [bx + 4 - d, y + h - 2], [tx + (left ? d : -d), ty - d * 2]], c);
    else if (above) poly([[bx - 8 + d, y + 2], [bx + 4 - d, y + 2], [tx + (left ? d : -d), ty + d * 2]], c);
    else { const ex = tx < x ? x + 2 : x + w - 2, cy = clamp(ty, y + r + 4, y + h - r - 4); poly([[ex, cy - 6 + d], [ex, cy + 4 - d], [tx + (tx < x ? d * 2 : -d * 2), ty]], c); }
  };
  if (!classic) winShadow(x, y, w, h, r, 2, .2); else rrect(x + 2, y + 2, w, h, r, C.black);
  tail(edge, 0); rrect(x, y, w, h, r, edge); rrect(x + 1, y + 1, w - 2, h - 2, r - 1, fill); tail(fill, 1.5);
  return { x: x + 8, y: y + 7, w: w - 16, h: h - 14 };
}
// say(x, y, str, tx, ty, o): an auto-sized balloon holding text -> rect
function say(x, y, str, tx, ty, o = {}) {
  const font = o.font || 'ui', maxW = o.maxW || 180, rows = wrap(str, maxW, font, o.scale || 1), lh = lineH(font, o.scale || 1);
  const w = Math.max(...rows.map(r => tw(r, font, o.scale || 1))) + 18, h = rows.length * lh + 12;
  const bx = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
  const b = balloon(bx, y, w, h, tx, ty, o);
  rows.forEach((r, i) => text(r, b.x + 1, b.y + i * lh + 1, { font, scale: o.scale || 1, color: o.color || P.text }));
  return { x: R(bx), y, w, h };
}
function tooltip(x, y, str, o = {}) {
  const font = o.font || 'small', w = tw(str, font) + 10, h = capH(font) + 8, fam = E.chrome;
  if (fam === 'glass' || fam === 'sur') { rrect(x, y, w, h, 4, '#cfcfcf'); rrect(x + 1, y + 1, w - 2, h - 2, 3, P.tip); }
  else { rect(x, y, w, h, C.black); rect(x + 1, y + 1, w - 2, h - 2, P.tip); }
  text(str, x + 5, y + 4, { font, color: C.black });
  return { w, h };
}

// ------------------------------------------------------------------------------------------------
// the dock
// ------------------------------------------------------------------------------------------------
const DOCK_DEFAULT = ['finderApp', 'writingStudio', 'teachText', 'searcher', 'assistant', 'scrapbook', 'reviewDesk', 'oneMoreTune', '|', 'folder', 'trash'];
// dock(o): o.items (icon names, '|' = divider, or {icon, running}), o.hover (index: magnified + label), o.bounce
// ({i, t0}: the launch bounce), o.open (indices with a running light), o.hide (0..1 slides it away)
function dock(o = {}) {
  if (!E.dock && E.chrome !== 'next') return null;
  const items = (o.items || DOCK_DEFAULT).map(it => typeof it === 'string' ? { icon: it } : it);
  if (E.chrome === 'next') { // NeXT's dock: a column of tiles down the right edge, under the clock
    const dx = W - NX_TILE - 1; let y = 1 + 3 * (NX_TILE + NX_GAP);
    items.filter(i => i.icon !== '|').slice(0, 4).forEach(it => { nxBevel(dx, y, NX_TILE, NX_TILE, NX.l); icon(it.icon, dx + 4, y + 4); y += NX_TILE + NX_GAP; }); return null;
  }
  const n = items.length, gap = 4, sz = 32, divW = 10;
  let w = 10; for (const it of items) w += it.icon === '|' ? divW : sz + gap;
  w += 6 - gap;
  const h = 42, x = R((W - w) / 2), floor = E.chrome === 'sur' || E.chrome === 'glass' ? 4 : 0, y = H - h - floor + R((o.hide || 0) * (h + 6));
  if (E.chrome === 'unified' || E.chrome === 'lion') look().dock(x - 12, y + 12, w + 24, h - 12); else look().dock(x, y, w, h);
  let ix = x + 8; const pos = [];
  items.forEach((it, i) => {
    if (it.icon === '|') { const dx = ix + R(divW / 2) - 3; for (let yy = y + 6; yy < y + h - 4; yy += 2) rect(dx, yy, 1, 1, E.chrome === 'glass' ? '#c9d1dc' : '#ffffff'); ix += divW; pos.push(null); return; }
    let iy = y + 4;
    if (o.bounce && o.bounce.i === i) { const b = T - o.bounce.t0; if (b >= 0 && b < 1.6) iy -= R(Math.abs(Math.sin(b * Math.PI * 2.5)) * 14 * (1 - b / 1.6)); }
    const big = o.hover === i;
    if (big) icon(it.icon, ix - 8, iy - 22, { scale: 2 }); else icon(it.icon, ix, iy);
    if (it.running || (o.open || []).includes(i)) { const lx = ix + 15; if (E.chrome === 'unified' || E.chrome === 'lion') { rect(lx - 1, y + h - 4, 4, 2, '#9fc8f0'); rect(lx, y + h - 4, 2, 2, '#e4f2ff'); } else if (E.chrome === 'aqua' || E.chrome === 'metal') arrowTri(lx - 2, y + h - 4, 3, 'up', '#222222'); else rect(lx, y + h - 3, 2, 2, E.chrome === 'glass' ? '#4a4f57' : '#2a2a2a'); }
    if (big && it.label) tooltip(ix + 16 - R(tw(it.label, 'small') / 2) - 5, iy - 42, it.label);
    pos.push({ x: ix, y: iy, cx: ix + 16, cy: iy + 16 });
    ix += sz + gap;
  });
  return { x, y, w, h, pos };
}

// ------------------------------------------------------------------------------------------------
// the mouse pointer (the writer)
// ------------------------------------------------------------------------------------------------
const PTR = { // pointer art and hot spots
  arrow: [`
W...........
WW..........
WKW.........
WKKW........
WKKKW.......
WKKKKW......
WKKKKKW.....
WKKKKKKW....
WKKKKKKKW...
WKKKKKKKKW..
WKKKKKWWWWW.
WKKWKKW.....
WKW.WKKW....
WW..WKKW....
W....WKKW...
.....WKKW...
......WW....`, 0, 0],
  ibeam: [`
WWW.WWW
WKKWKKW
WWWKWWW
..WKW..
..WKW..
..WKW..
..WKW..
..WKW..
..WKW..
..WKW..
..WKW..
WWWKWWW
WKKWKKW
WWW.WWW`, 3, 7],
  hand: [`
....WW..........
...WKKW.........
...WKKW.........
...WKKW.........
...WKKWWW.......
...WKKWKKWWW....
...WKKWKKWKKWW..
WW.WKKWKKWKKWKW.
WKWWKKKKKKKKWKKW
WKKWKKKKKKKKKKKW
.WKKKKKKKKKKKKKW
..WKKKKKKKKKKKKW
..WKKKKKKKKKKKW.
...WKKKKKKKKKKW.
....WKKKKKKKKW..
.....WKKKKKKKW..
.....WWWWWWWWW..`, 5, 0],
  grab: [`
................
................
................
....WWWWWWWW....
...WKKWKKWKKWW..
...WKKWKKWKKWKW.
..WWKKKKKKKKWKKW
.WKWKKKKKKKKKKKW
.WKKKKKKKKKKKKKW
..WKKKKKKKKKKKKW
..WKKKKKKKKKKKKW
...WKKKKKKKKKKW.
....WKKKKKKKKW..
.....WKKKKKKKW..
.....WWWWWWWWW..`, 8, 6],
  pencil: [`
..........WWW
.........WKKKW
........WKWKKW
.......WKWWKW.
......WKWWKW..
.....WKWWKW...
....WKWWKW....
...WKWWKW.....
..WKWWKW......
.WKKWKW.......
.WKKKW........
WKKWW.........
WKW...........
WW............`, 0, 13],
  cross: [`
.....WKW.....
.....WKW.....
.....WKW.....
.....WKW.....
WWWWWWKWWWWWW
KKKKKK.KKKKKK
WWWWWWKWWWWWW
.....WKW.....
.....WKW.....
.....WKW.....
.....WKW.....`, 6, 5],
};
for (const k in PTR) defSprite('ptr_' + k, PTR[k][0], { K: '#000000', W: '#ffffff' });
defSprite('ptr_watch', `
....WWWWWWW.....
....WKKKKKW.....
....WKKKKKW.....
..WWKKKKKKKWW...
.WKKWWWWWWWKKW..
WKKWWWWWWWWWKKW.
WKWWWWWWWWWWWKWW
WKWWWWWWWWWWWKKW
WKWWWWWWWWWWWKKW
WKWWWWWWWWWWWKWW
WKKWWWWWWWWWKKW.
.WKKWWWWWWWKKW..
..WWKKKKKKKWW...
....WKKKKKW.....
....WKKKKKW.....
....WWWWWWW.....`, { K: '#000000', W: '#ffffff' });
const _ballc = {};
function beachball(step) { // the spinning wait cursor of the Aqua eras, 12 rotation steps, cached
  step = ((step % 12) + 12) % 12;
  return _ballc[step] || (_ballc[step] = offscreen(17, 17, () => {
    const cols = ['#2f7bf5', '#45c4f4', '#7ad64a', '#f5d63a', '#f5873a', '#e5413e', '#b04ad6'];
    oval(0, 0, 17, 17, '#333333');
    for (let y = 1; y < 16; y++) for (let x = 1; x < 16; x++) { const dx = x - 8, dy = y - 8; if (dx * dx + dy * dy > 56) continue; const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1 + step / 12) % 1; rect(x, y, 1, 1, cols[Math.floor(a * cols.length)]); }
    oval(4, 2, 7, 3, '#ffffff'); bayer(4, 2, 7, 3, .5, '#ffffff', null);
  }));
}
// pointer(x, y, kind, o): draw the pointer with its hot spot at (x, y). kind: 'arrow' | 'ibeam' | 'hand' | 'grab' |
// 'pencil' | 'cross' | 'watch' | 'busy' (era's wait cursor) | 'ball'. o.down squashes it (a click); o.scale enlarges it.
function pointer(x, y, kind = 'arrow', o = {}) {
  x = R(x); y = R(y);
  const s = o.scale || 1;
  if (kind === 'busy') kind = E.index >= ERA.aqua.index ? 'ball' : E.chrome === 'next' ? 'ball' : 'watch';
  if (kind === 'ball') { const c = beachball(Math.floor(T * 14)); ctx.drawImage(c, x - 8 * s, y - 8 * s, 17 * s, 17 * s); return; }
  if (kind === 'watch') {
    const c = SPR.ptr_watch; ctx.drawImage(c, x - 7 * s, y - 8 * s, 16 * s, 16 * s);
    const a = T * 6, cx = x - 7 * s + 7 * s, cy = y - 8 * s + 8 * s; // the hand sweeps
    line(cx, cy, cx + R(Math.cos(a) * 3 * s), cy + R(Math.sin(a) * 3 * s), C.black, s); line(cx, cy, cx + R(Math.cos(a / 12) * 2 * s), cy + R(Math.sin(a / 12) * 2 * s), C.black, s);
    return;
  }
  const art = PTR[kind] || PTR.arrow, c = SPR['ptr_' + (PTR[kind] ? kind : 'arrow')], hx = art[1], hy = art[2];
  const sq = o.down ? 1 : 0;
  ctx.drawImage(c, x - hx * s + sq, y - hy * s + sq, c.width * s, (c.height - sq) * s);
}
// mousePath(t, keys, o) -> {x, y, down}: the writer's hand. keys: [[t, x, y, action?], ...]; action: 'click' (press
// on arrival), 'dbl' (double click), 'press' (hold until the next key: a drag), 'release'. Moves ease in and out,
// bow slightly and overshoot a few pixels before settling, as a person's hand does.
function mousePath(t, keys, o = {}) {
  if (!keys.length) return null;
  let i = 0; while (i < keys.length - 1 && t >= keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1];
  let x = a[1], y = a[2], down = false;
  if (b && t > a[0]) {
    const dur = Math.max(.05, b[0] - a[0]), mv = Math.min(dur, o.moveTime ?? Math.max(.25, Math.min(.8, Math.hypot(b[1] - a[1], b[2] - a[2]) / 500))), k = prog(t, b[0] - mv, b[0]);
    if (k > 0) {
      const dist = Math.hypot(b[1] - a[1], b[2] - a[2]), over = Math.min(6, dist * .04) / Math.max(1, dist), bow = (hash(i * 3.1 + a[1]) - .5) * .18;
      const e = k < .85 ? easeInOut(k / .85) * (1 + over) : 1 + over * (1 - easeOut((k - .85) / .15));
      const px = -(b[2] - a[2]), py = b[1] - a[1], bw = Math.sin(Math.PI * clamp(e)) * bow;
      x = lerp(a[1], b[1], e) + px * bw; y = lerp(a[2], b[2], e) + py * bw;
    }
    if (a[3] === 'press') down = true;
  }
  const act = a[3], since0 = t - a[0];
  if (act === 'click' && since0 >= 0 && since0 < .13) down = true;
  if (act === 'dbl' && since0 >= 0 && ((since0 < .09) || (since0 > .16 && since0 < .25))) down = true;
  if (act === 'press' && since0 >= 0) down = true;
  return { x: R(x), y: R(y), down };
}
// trail(t, n, dt, fn): the stale copies a dragged window leaves on a busy machine. Calls fn(t - i*dt, i) for
// i = n..1 (oldest first), then fn(t, 0) on top. fn draws the window at its position for that time.
function trail(t, n, dt, fn) { for (let i = n; i >= 1; i--) fn(t - i * dt, i); fn(t, 0); }
// cursor(t, keys, kind): mousePath() straight into CUR (the usual one-liner in a scene)
function cursor(t, keys, kind = 'arrow', o = {}) { const p = mousePath(t, keys, o); if (p) CUR = { ...p, kind: o.kind || kind }; return p; }
