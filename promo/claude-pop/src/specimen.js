// specimen.js: the toolkit reel. With ?specimen, or when no chapter has registered a scene, it tiles 0..DUR with:
//   0-36 s   one 3-second scene per era: desktop, menu bar (pulled down), a document window, a dialog, icons,
//            Clio singing at two scales, the pointer, a progress bar, typed text and a sung lyric
//   then     the app windows (each shown in an early era on the left and a late era on the right), the widgets,
//            Clio's expressions, the whole-frame FX and an era-morph tour.
// Reviewers judge the kit here; chapter authors can crib from it.
'use strict';
(function () {
  const forced = new URLSearchParams(location.search).has('specimen');
  if (!forced && SCENES.length) return;
  if (forced) SCENES.length = 0;

  // a fake sung line with even word timings (the specimen must not depend on the song)
  const fakeLine = (str, t0, t1) => {
    const ws = str.split(' '), d = (t1 - t0) / ws.length;
    const l = { id: 'spec', text: str, voice: 'lead', start: t0, end: t1, words: ws.map((w, i) => ({ w, start: t0 + i * d, end: t0 + (i + .85) * d, i })) };
    l.words.forEach(w => w.line = l); return l;
  };
  const fakeSing = (ln, t) => {
    const w = ln.words.find(w => t >= w.start && t < w.end); if (!w) return 0;
    const el = t - w.start, dur = w.end - w.start, v = (w.w.toLowerCase().match(/[aeiouy]/) || ['a'])[0];
    return { open: clamp(el / .05) * (1 - clamp((el - dur * .75) / (dur * .25)) * .8), shape: v === 'a' ? 'A' : v === 'o' || v === 'u' ? 'O' : 'E' };
  };
  const ICONS_R = [['startupDisk', 'Startup Disk'], ['fileFloppy', 'File Floppy'], ['assistant', 'ClioTalk'], ['oneMoreTune', 'One More Tune'], ['trash', 'Trash']];
  const LYR = ['I will never be your voice', 'Twelve looks, and one desk', 'You keep the pen, I keep time', 'Chat is an app, not the computer'];
  const REEL = [];
  const add = (name, dur, fn, opts = {}) => REEL.push({ name, dur, fn, opts });

  // ---------------- one scene per era ----------------
  ERAS.forEach((e, ei) => add('era ' + e.id, 3, (t, l) => {
    const s0 = t - l, ln = fakeLine(LYR[ei % LYR.length], s0 + .3, s0 + 2.5), next = e.chrome === 'next';
    UI.menu = { app: 'TeachText', open: l > 1.5 && l < 2.25 ? 2 : undefined, propW: 40, prop: (x, y, w, h) => text(String(e.year), x + w, y + R((h - capH('menu')) / 2) + 1, { font: 'menu', align: 'right', color: next ? C.black : P.menuText }) };
    const top = E.menuH + 10, left = next ? 116 : 12;
    deskIcons(ICONS_R, { sel: l > .5 && l < 1.3 ? 1 : -1, gap: next ? 46 : 52, y: next ? 150 : top });
    const doc = APP.teachText(left, top, 300, 182, { title: 'Manuscript', active: l < 2.3, typing: { text: 'The moon sends the invoice.', t0: s0 + .2, t1: s0 + 1.6 } });
    // a dialog with buttons and a progress bar
    const al = alert(next ? 446 : 452, 196, { icon: 'caution', w: 250, text: 'Save the manuscript before ' + e.name + ' arrives?', buttons: ['Cancel', 'Save'], pressed: l > 2.45 && l < 2.62 ? 1 : undefined });
    if (al.client) progress(al.text.x, al.text.y + 30, 140, 12, prog(l, .1, 2.4));
    clio(al.x + al.w - 52, al.y - 26, { scale: 1, mouth: fakeSing(ln, t), expr: 'sing', pose: 'wave' });
    // Clio, big, singing the line and reaching for the pencil
    clio(next ? 120 : 14, 216, { scale: 4, mouth: fakeSing(ln, t), expr: l > 2.5 ? 'wink' : 'sing', pose: l > 1.2 && l < 2.4 ? 'reach' : 'hold', reach: [doc ? doc.x + 150 : 200, doc ? doc.y + doc.h - 10 : 190], holding: 'pencil', bob: 1 });
    if (UI.menu.open != null && !next) { const m = menuLayout(UI.menu)[UI.menu.open]; if (m) pullMenu(m.x, E.menuH - 1, ['Question Sheet', 'Outline', 'Section Drafts\t⌘D', '-', '~Manuscript', 'Review Desk\t⌘R', '-', '✓' + e.name], R(prog(l, 1.55, 2.2) * 5)); }
    const ok = al.btn[1] || { cx: 500, cy: 280 };
    cursor(t, [[s0, 330, 150], [s0 + .5, W - 36, E.menuH + 72, 'click'], [s0 + 1.5, next ? 60 : 210, next ? 30 : 8, 'press'], [s0 + 2.25, next ? 60 : 230, 70], [s0 + 2.45, ok.cx, ok.cy, 'click']], l > .9 && l < 1.45 ? 'ibeam' : 'arrow');
    kara(ln, 340, 312 - (E.dock ? 12 : 0), { align: 'center', maxW: 560 });
  }, { era: e.id }));

  // ---------------- the apps: early era on the left, late era on the right ----------------
  const split = (a, b, fnA, fnB) => (t, l, d) => {
    const base = E.id;
    clipRect(0, 0, W / 2, H, () => { setEra(a); desktop({}); fnA(t, l, d, 0); });
    clipRect(W / 2, 0, W / 2, H, () => { setEra(b); desktop({}); fnB(t, l, d, W / 2); });
    setEra(base); UI.menubar = false; UI.dock = false;
    rect(W / 2, 0, 1, H, C.black);
    overlay(() => { setEra('system6'); const lab = ERA[a].name + ' / ' + ERA[b].name; rect(W / 2 - tw(lab, 'monaco') / 2 - 4, 2, tw(lab, 'monaco') + 8, 12, C.black); text(lab, W / 2, 5, { font: 'monaco', align: 'center', color: C.white }); });
  };
  const both = (a, b, fn) => split(a, b, fn, fn);
  const tl = (l, d) => l / d;
  const apps = [
    ['teachText', 'system6', 'bigsur', (t, l, d, ox) => { APP.teachText(ox + 8, 22, 304, 300, { k: prog(l, 0, .35), from: [ox + 40, 60], typing: { text: 'Twice a day the bill arrives, and twice a day it is paid.', t0: t - l + .5, t1: t - l + 2.4 }, hiRow: l > 2.6 ? 1 : -1 }); }],
    ['clioTalk', 'system7', 'liquidglass', (t, l, d, ox) => { const s0 = t - l; APP.clioTalk(ox + 8, 22, 304, 300, { msgs: [{ who: 'you', text: 'Tighten my second paragraph?', at: s0 + .1 }, { who: 'clio', text: 'Here is a tighter version. It stays here until you place it.', at: s0 + 1.2, typing: .7 }], actions: ['Clip', 'Insert', 'Discard'], pressed: l > 2.5 ? 0 : -1, typing: { text: 'No thanks, I keep the pen.', t0: s0 + 1.8, t1: s0 + 2.9 } }); }],
    ['scrapbook', 'system6', 'aqua', (t, l, d, ox) => { APP.scrapbook(ox + 30, 30, 260, 280, { n: l > 1.5 ? 2 : 1, of: 2, card: l > 1.5 ? { title: 'Ebb and flood', body: '“the barrage generates on both tides”', source: 'Source: site visit notes, 2024' } : undefined }); }],
    ['reviewDesk', 'platinum', 'yosemite', (t, l, d, ox) => { APP.reviewDesk(ox + 14, 34, 292, 250, { reveal: prog(l, .1, 1.6), you: R(lerp(60, 97, easeOut(prog(l, .3, 2.6)))) }); }],
    ['searcher', 'system7', 'tiger', (t, l, d, ox) => { const s0 = t - l; APP.searcher(ox + 10, 26, 300, 290, { typing: { text: 'tidal power La Rance', t0: s0 + .1, t1: s0 + 1.1 }, pressed: l > 1.15 && l < 1.3 ? 'search' : -1, reveal: prog(l, 1.3, 2.2), sel: l > 2.5 ? 1 : -1, results: [{ title: 'La Rance Tidal Power Station', url: 'en.wikipedia.org', snippet: 'Opened 1966, the first of its kind.' }, { title: 'Billing the tide', url: 'archive.example.org', snippet: 'A 1966 feasibility report.' }, { title: 'Estuary tables', url: 'tides.example.org', snippet: 'Twice a day, both ways.' }] }); }],
    ['questionSheet', 'nextstep', 'snowleopard', (t, l, d, ox) => { const s0 = t - l; APP.questionSheet(ox + 10, 26, 300, 280, { typing: { text: 'Does the turbine care which way?', t0: s0 + .3, t1: s0 + 2.2 } }); }],
    ['outline', 'drawingboard', 'lion', (t, l, d, ox) => { APP.outline(ox + 10, 30, 300, 250, { sel: Math.floor(l * 2) % 6 }); }],
    ['sectionDrafts', 'platinum', 'bigsur', (t, l, d, ox) => { const s0 = t - l; APP.sectionDrafts(ox + 6, 30, 308, 260, { sel: 1, typing: { text: 'The turbines do not care.', t0: s0 + .3, t1: s0 + 2 } }); }],
    ['notePad + about', 'system6', 'aqua', (t, l, d, ox) => { APP.notePad(ox + 10, 24, 180, 130, { page: 1 + Math.floor(l), typing: { text: ' Check the 1966 report.', t0: t - l + .2, t1: t - l + 1.5 } }); APP.about(ox + 20, 150, 290, 200, { used: prog(l, .2, 1.5) }); }],
    ['finder + fileFloppy', 'system7', 'snowleopard', (t, l, d, ox) => { APP.finder(ox + 8, 24, 300, 160, { sel: Math.floor(l * 2) % 6, open: 0 }); APP.fileFloppy(ox + 20, 196, 290, 150, { ocr: prog(l, .2, 2.6), current: 'scan-p12.pdf' }); }],
    ['projectCD + floppies', 'platinum', 'liquidglass', (t, l, d, ox) => { APP.projectCD(ox + 8, 26, 304, 140, { k: prog(l, .1, 2.4) }); APP.floppyMeter(ox + 8, 186, 304, 150, { k: easeOut(prog(l, .2, 1.8)) }); }],
    ['oneMoreTune', 'system6', 'liquidglass', (t, l, d, ox) => { APP.oneMoreTune(ox + 4, 30, 312, 220, { track: 3, done: [0, 1, 2], year: ox ? 2026 : 1988, label: ox ? 'Liquid Glass' : 'System 6', song: 'Name the ad', options: ['A pocket player', 'A thin laptop', 'A tiny music box'], answer: l > 2 ? 1 : undefined, wrong: l > 1.4 ? 0 : undefined }); }],
    ['controlPanel', 'system7', 'yosemite', (t, l, d, ox) => { APP.controlPanel(ox + 6, 24, 308, 300, { sel: Math.floor(l * 4) % 12 }); }],
    ['doom + micropolis', 'system6', 'platinum', (t, l, d, ox) => { APP.doom(ox + 10, 22, 300, 170, { walk: t * 1.5, fire: Math.max(0, 1 - ((l * 2) % 1) * 4), imp: prog(l, 0, 3) }); APP.micropolis(ox + 10, 200, 300, 150, { k: prog(l, 0, 3), tool: 'R', cursor: [10 + Math.floor(l * 3), 6] }); }],
    ['writingBell + clio', 'aqua', 'liquidglass', (t, l, d, ox) => { APP.writingBell(ox + 20, 30, 160, 90, { seconds: 1500 - Math.floor(l * 60) }); clioSay(ox + 60, 210, 'Want me to take it from here?', { scale: 2, expr: 'happy', above: 50 }); }],
  ];
  apps.forEach(([name, a, b, fn]) => add('app ' + name, 3, both(a, b, fn), { era: a }));

  // ---------------- widgets ----------------
  const widgetEras = [['system6', 'platinum'], ['nextstep', 'aqua'], ['drawingboard', 'snowleopard'], ['system7', 'liquidglass']];
  widgetEras.forEach(([a, b]) => add('widgets ' + a + '/' + b, 3, both(a, b, (t, l, d, ox) => {
    const x = ox + 14;
    button(x, 28, 74, btnH(), 'OK', { def: true }); button(x + 88, 28, 74, btnH(), 'Cancel', { pressed: (l * 2) % 1 > .7 }); button(x + 176, 28, 80, btnH(), 'Disabled', { disabled: true });
    check(x, 62, 'Keep the pen', true); check(x + 120, 62, 'Let Clio write', false, { disabled: true });
    radio(x, 82, 'Draft', Math.floor(l) % 2 === 0); radio(x + 120, 82, 'Final', Math.floor(l) % 2 === 1);
    popup(x, 102, 150, 'Twelve appearances');
    slider(x + 170, 104, 110, (Math.sin(l * 2) + 1) / 2);
    textField(x, 132, 180, 20, typed('Your roughness is not a defect.', t - l + .2, t - l + 2.2), { caret: 'solid', focus: true });
    progress(x, 162, 120, 12, prog(l, 0, 3)); progress(x + 140, 162, 120, 12, 0, { indeterminate: true });
    tabs(x, 186, 250, ['Themes', 'Fonts', 'Sound'], Math.floor(l) % 3);
    vscroll(x + 262, 206, 120, (Math.sin(l * 2) + 1) / 2, .3); hscroll(x, 320, 250, (Math.cos(l * 2) + 1) / 2, .3);
    groupBox(x, 214, 240, 96, 'Review');
    listRows(x + 6, 224, 228, [{ text: 'Rhythm', icon: 'reviewDesk', right: 'ok' }, { text: 'Summary language', icon: 'searcher', right: 'none' }, { text: 'Hedging', icon: 'chatFile', right: '1' }], { sel: Math.floor(l * 2) % 3, stripes: true });
    deskIcon(x + 184, 270, 'folder', 'Sources', { sel: (l % 1) > .5 });
  }), { era: a }));
  add('menus + pointers', 3, both('system7', 'bigsur', (t, l, d, ox) => {
    const items = menuLayout({ app: 'TeachText' }), m = items[Math.min(items.length - 1, 1 + Math.floor(l) % 3)];
    pullMenu(ox + 10, 24, ['Undo Typing\t⌘Z', '-', 'Cut\t⌘X', 'Copy\t⌘C', 'Paste\t⌘V', '~Ask Clio to Write It', '-', '✓Keep the Pen'], Math.floor(l * 3) % 8); void m;
    const kinds = ['arrow', 'ibeam', 'hand', 'grab', 'pencil', 'cross', 'watch', 'busy'];
    kinds.forEach((k, i) => { const px = ox + 190 + (i % 4) * 30, py = 40 + Math.floor(i / 4) * 34; rect(px - 12, py - 12, 26, 28, P.win); frame(px - 12, py - 12, 26, 28, P.rule); pointer(px, py, k); });
    balloon(ox + 170, 120, 140, 50, ox + 200, 190, {}); text('Balloon Help: this is', ox + 180, 130, { font: 'small' }); text('the Close box.', ox + 180, 142, { font: 'small' });
    tooltip(ox + 170, 210, 'Searcher: the live web');
    const k = (l % 1.5) / 1.5; zoomRects([ox + 40, 300], { x: ox + 20, y: 200, w: 140, h: 100 }, k);
    dragOutline(ox + 180 + R(Math.sin(l * 3) * 10), 250, 120, 70);
  }), { era: 'system7' });
  add('dock + desk', 3, both('aqua', 'liquidglass', (t, l, d, ox) => {
    deskIcons([['hardDisk', 'Project Hard Disk'], ['fileFloppy', 'File Floppy'], ['projectDisc', 'Project CD']], { x: ox + 270, sel: Math.floor(l) % 3 });
    APP.finder(ox + 10, 30, 240, 150, { sel: Math.floor(l * 2) % 6 });
    clipRect(ox, 0, W / 2, H, () => dock({ hover: Math.floor(l * 3) % 8, bounce: { i: 1, t0: t - l + .3 }, open: [0, 2, 4] }));
  }), { era: 'aqua' });

  // ---------------- Clio ----------------
  ['system6', 'platinum', 'aqua', 'liquidglass'].forEach(eid => add('clio ' + eid, 3, (t, l) => {
    const ln = fakeLine('Ah oh ee la la la, I keep time', t - l + .2, t - l + 2.8);
    const exprs = ['happy', 'sing', 'wink', 'surprised', 'deadpan', 'shrug', 'think', 'sad'];
    exprs.forEach((ex, i) => { const x = 16 + (i % 4) * 78, y = 30 + Math.floor(i / 4) * 80; clio(x, y, { scale: 2, expr: ex, mouth: ex === 'sing' ? fakeSing(ln, t) : 0 }); text(ex, x + 32, y + 60, { font: 'small', align: 'center', color: E.depth === 1 ? C.black : P.deskText, outline: E.depth === 1 ? C.white : null }); });
    ['pencil', 'floppy', 'note', 'record', 'mic', 'heart'].forEach((it, i) => clio(16 + i * 52, 200, { scale: 1, holding: it, expr: 'happy' }));
    clio(30, 236, { scale: 2, pose: 'point', point: 'right', expr: 'wink' }); clio(110, 236, { scale: 2, pose: 'shrug', expr: 'shrug' }); clio(190, 236, { scale: 2, pose: 'wave', expr: 'happy' });
    const big = clio(350, 34, { scale: 8, mouth: fakeSing(ln, t), expr: 'sing', bob: 1, pose: 'reach', reach: [300 + R(Math.sin(l * 2) * 40), 320], holding: 'pencil', shadow: true });
    kara(ln, big.x + big.w / 2, 300, { align: 'center', mode: 'pop', maxW: 280 });
    text(ERA[eid].name, 16, H - 20, { font: 'ui', color: E.depth === 1 ? C.black : P.deskText, outline: E.depth === 1 ? C.white : null });
  }, { era: eid, dock: false }));

  // ---------------- FX ----------------
  const fxDesk = (t, l) => { APP.teachText(40, 40, 330, 220, { title: 'Manuscript' }); clio(420, 150, { scale: 4, expr: 'surprised' }); CUR = { x: 300, y: 200, kind: 'arrow' }; };
  const fx = [
    ['shake', (t, l) => { FX.shake = 6 * pulse(t, 1, 4); }], ['flash', (t, l) => { FX.flash = [C.white, Math.exp(-((l * 2) % 1) * 5)]; }],
    ['invert', (t, l) => { FX.invert = Math.floor(l * 4) % 2 === 1; }], ['glitch', (t, l) => { FX.glitch = .6; }], ['wobble', (t, l) => { FX.wobble = 6; }],
    ['tilt', (t, l) => { FX.tilt = Math.sin(l * 2) * .12; }], ['zoom', (t, l) => { FX.zoom = 1 + easeInOut(prog(l, 0, 1.5)) * 1; FX.zoomAt = [460, 200]; }],
    ['slide', (t, l) => { FX.dx = -R(easeIn(prog(l, .3, 1.4)) * W); }], ['crt off', (t, l) => { FX.crt = prog(l, .1, 1.4); }],
  ];
  fx.forEach(([name, f]) => add('fx ' + name, 1.5, (t, l, d) => { fxDesk(t, l); f(t, l, d); }, { era: name === 'invert' ? 'system6' : name === 'glitch' ? 'platinum' : name === 'zoom' ? 'system6' : 'aqua' }));
  ['dissolve', 'bayer', 'wipe', 'blinds', 'iris', 'checker'].forEach((st, i) => add('morph ' + st, 1.5, (t, l) => { fxDesk(t, l); }, { era: [[0, ERAS[i * 2].id], [0.2, ERAS[i * 2 + 1].id, st]], eraLocal: true, morph: 1.1 }));

  // ---------------- the era tour: windows stay put, the computer changes around them ----------------
  add('tour', 12, (t, l) => {
    const s0 = t - l;
    APP.teachText(14, E.menuH + 12, 300, 200, { title: 'Manuscript' });
    APP.clioTalk(330, E.menuH + 40, 260, 210, { msgs: [{ who: 'you', text: 'Change the era.' }, { who: 'clio', text: 'Done. Your files stayed put.' }] });
    clio(40, 250, { scale: 3, mouth: 'sing', expr: 'happy', bob: 1 });
    cursor(t, [[s0, 200, 200], [s0 + 6, 420, 120], [s0 + 12, 200, 200]]);
  }, { era: ERAS.map((e, i) => [i, e.id]), eraLocal: true, morph: .45 });

  // ---------------- tile the reel over the whole song ----------------
  const total = REEL.reduce((a, s) => a + s.dur, 0);
  let t = 0, cycle = 0;
  while (t < DUR && total > 0) {
    for (const s of REEL) { if (t >= DUR) break; scene((cycle ? '~' : '') + s.name, t, Math.min(DUR, t + s.dur), s.fn, s.opts); t += s.dur; }
    cycle++;
  }
  window.SPECIMEN = { length: total };
})();
