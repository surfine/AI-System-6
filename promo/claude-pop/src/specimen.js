// specimen.js: the toolkit reel. With ?specimen, or when no chapter has registered a scene, it tiles 0..DUR (otherwise
// it is parked once at 1000 s, past the end of the video) with:
//   0-36 s   one 3-second scene per era: desktop, menu bar (pulled down), a document window, a dialog, icons,
//            Clio singing at two scales, the pointer, a progress bar, typed text and a sung lyric
//   then     the app windows (each shown in an early era on the left and a late era on the right), the widgets,
//            Clio's expressions, the whole-frame FX and an era-morph tour.
// Reviewers judge the kit here; chapter authors can crib from it.
'use strict';
(function () {
  // With ?specimen, or when no chapter has registered a scene, the reel tiles the song from 0. Otherwise it is parked
  // once at SPECIMEN_AT = 1000 s, past the end of the video, so `node render.mjs sheet 1000 1036 3` still shows it.
  const forced = new URLSearchParams(location.search).has('specimen'), parked = !forced && SCENES.length > 0;
  if (forced) SCENES.length = 0;

  // a fake sung line with even word timings (the specimen must not depend on the song)
  const fakeLine = (str, t0, t1) => {
    const ws = str.split(' '), d = (t1 - t0) / ws.length;
    const l = { id: 'spec', text: str, voice: 'lead', start: t0, end: t1, words: ws.map((w, i) => ({ w, start: t0 + i * d, end: t0 + (i + .94) * d, i })) };
    l.words.forEach(w => w.line = l); return l;
  };
  const fakeSing = (ln, t) => {
    const w = ln.words.find(w => t >= w.start && t < w.end); if (!w) return 0;
    const el = t - w.start, dur = w.end - w.start, v = (w.w.toLowerCase().match(/[aeiouy]/) || ['a'])[0];
    return { open: clamp(el / .04) * (1 - clamp((el - dur * .8) / (dur * .2)) * .6), shape: v === 'a' ? 'A' : v === 'o' || v === 'u' ? 'O' : 'E' }; // open on the vowel
  };
  const ICONS_R = [['startupDisk', 'Startup Disk'], ['fileFloppy', 'File Floppy'], ['assistant', 'ClioTalk'], ['oneMoreTune', 'One More Tune'], ['trash', 'Trash']];
  const LYR = ['I will never be your voice', 'Twelve looks, and one desk', 'You keep the pen, I keep time', 'Chat is an app, not the computer'];
  const REEL = [];
  const add = (name, dur, fn, opts = {}) => REEL.push({ name, dur, fn, opts });

  // ---------------- one scene per era ----------------
  APPEARANCES.forEach((e, ei) => add('era ' + e.id, 3, (t, l) => {
    const s0 = t - l, ln = fakeLine(LYR[ei % LYR.length], s0 + .3, s0 + 2.5), next = e.chrome === 'next';
    // open by label: from Aqua on index 0 is the bold app name, so 'Writing' is 2 in System 6 and 3 in Aqua
    UI.menu = { app: 'TeachText', open: l > 1.5 && l < 2.25 ? 'Writing' : undefined, propW: 40, prop: (x, y, w, h) => text(String(e.year), x + w, y + R((h - capH('menu')) / 2) + 1, { font: 'menu', align: 'right', color: next ? C.black : P.menuText }) };
    const top = E.menuH + 10, left = next ? 116 : 12;
    deskIcons(ICONS_R, { sel: l > .5 && l < 1.3 ? 1 : -1, gap: next ? 50 : 52, y: next ? 12 : top });   // NeXT: x = W - 100, clear of the dock column
    const doc = APP.teachText(left, top, 300, 182, { title: 'Manuscript', active: l < 2.3, typing: { text: 'The moon sends the invoice.', t0: s0 + .2, t1: s0 + 1.6 } });
    // a dialog with buttons and a progress bar
    // the dialog sits in the lower middle, clear of the icon column (and of NeXT's dock column)
    const alW = 220, alLines = wrap('Save before ' + e.name + ' arrives?', alW - 82, 'ui').concat(['']);
    const al = alert(next ? 400 : 430, 200, { icon: 'caution', w: alW, lines: alLines, buttons: ['Cancel', 'Save'], pressed: l > 2.45 && l < 2.62 ? 1 : undefined });
    if (al.client) progress(al.text.x, al.text.y + (alLines.length - 1) * lineH('ui') + 2, alW - 82, 10, prog(l, .1, 2.4));
    // the small Clio perches 6px above the dialog's rim (a white halo in 1-bit so she reads on the dot screen)
    clio(al.x + al.w - 46, al.y - 6 - CLIO_H, { scale: 1, mouth: fakeSing(ln, t), expr: l > 2.5 ? 'wink' : 'happy', pose: 'wave', halo: E.depth === 1 });
    // Clio, big, singing the line and reaching for the pencil
    clio(next ? 120 : 14, 216, { scale: 4, mouth: fakeSing(ln, t), expr: l > 2.5 ? 'wink' : 'sing', pose: l > 1.2 && l < 2.4 ? 'reach' : 'hold', reach: [doc ? doc.x + 150 : 200, doc ? doc.y + doc.h - 10 : 190], holding: 'pencil', bob: 1 });
    const wm = menuAt('Writing');   // hang the pull-down under its own title (null in NeXT, whose menus are a column)
    if (UI.menu.open != null && wm) pullMenu(wm.x, E.menuH - 1, ['Question Sheet', 'Outline', 'Section Drafts\t⌘D', '-', '~Manuscript', 'Review Desk\t⌘R', '-', '✓' + e.name], R(prog(l, 1.55, 2.2) * 5));
    const ok = al.btn[1] || { cx: 500, cy: 280 }, wx = wm ? wm.x + R(wm.w / 2) : 60, wy = wm ? 8 : 52;
    cursor(t, [[s0, 330, 150], [s0 + .5, next ? 556 : W - 36, next ? 78 : E.menuH + 72, 'click'], [s0 + 1.5, wx, wy, 'press'], [s0 + 2.25, wx + 20, next ? 52 : 70], [s0 + 2.45, ok.cx, ok.cy, 'click']], l > .9 && l < 1.45 ? 'ibeam' : 'arrow');
    kara(ln, 340, E.dock ? 284 : 312, { align: 'center', maxW: 560, plate: true });
  }, { era: e.id }));

  // ---------------- the apps: early era on the left, late era on the right ----------------
  // split(a, b, fnA, fnB, {app, menubar}): era a on the left half, era b on the right. Each half keeps its own menu bar
  // (the mark and the first titles, clipped to the half; NeXT's menu column is left out) unless menubar: false.
  const split = (a, b, fnA, fnB, so = {}) => (t, l, d) => {
    const base = E.id;
    const half = (era, fn, ox) => clipRect(ox, 0, W / 2, H, () => {
      setEra(era); desktop({}); fn(t, l, d, ox);
      if (so.menubar !== false && E.chrome !== 'next') { ctx.save(); ctx.translate(ox, 0); menuBar({ app: so.app || 'Finder', clock: false, noCorners: true }); ctx.restore(); }
    });
    half(a, fnA, 0); half(b, fnB, W / 2);
    setEra(base); UI.menubar = false; UI.dock = false;
    rect(W / 2, 0, 1, H, C.black);
    const ly = so.labelY ?? H - 14;
    overlay(() => { setEra('system6'); const lab = ERA[a].name + ' / ' + ERA[b].name, lw = tw(lab, 'monaco') + 8; rect(W / 2 - R(lw / 2), ly, lw, 12, C.black); text(lab, W / 2, ly + 3, { font: 'monaco', align: 'center', color: C.white }); });
  };
  const both = (a, b, fn, so) => split(a, b, fn, fn, so);
  const APPNAME = { teachText: 'TeachText', clioTalk: 'ClioTalk', scrapbook: 'Scrapbook', reviewDesk: 'Review Desk', searcher: 'Searcher', questionSheet: 'Question Sheet',
    outline: 'Outline', sectionDrafts: 'Section Drafts', notePad: 'Note Pad', finder: 'Finder', projectCD: 'Finder', oneMoreTune: 'One More Tune', controlPanel: 'Control Panel',
    doom: 'DOOM', writingBell: 'Writing Bell' };
  const tl = (l, d) => l / d;
  const apps = [
    ['teachText', 'system6', 'bigsur', (t, l, d, ox) => { APP.teachText(ox + 8, 22, 304, 300, { k: prog(l, 0, .35), from: [ox + 40, 60], typing: { text: 'Twice a day the bill arrives, and twice a day it is paid.', t0: t - l + .5, t1: t - l + 2.4 }, hiRow: l > 2.6 ? 1 : -1 }); }],
    ['clioTalk', 'system7', 'liquidglass', (t, l, d, ox) => { const s0 = t - l; APP.clioTalk(ox + 8, 26, 304, 300, { msgs: [{ who: 'you', text: 'Tighten my second paragraph?', at: s0 + 1 }, { who: 'clio', text: 'Here is a tighter version. It stays here until you place it.', at: s0 + 1.8, typing: .5 }], actions: ['Clip', 'Insert', 'Discard'], pressed: l > 2.7 ? 0 : -1, typing: l < 1 ? { text: 'Tighten my second paragraph?', t0: s0 + .1, t1: s0 + .9 } : { text: 'No thanks, I keep the pen.', t0: s0 + 2.1, t1: s0 + 2.9 } }); }],
    ['scrapbook', 'system6', 'aqua', (t, l, d, ox) => { APP.scrapbook(ox + 30, 30, 260, 280, { n: l > 1.5 ? 2 : 1, of: 2, card: l > 1.5 ? { title: 'Ebb and flood', body: '“the barrage generates on both tides”', source: 'Source: site visit notes, 2024' } : undefined }); }],
    ['reviewDesk', 'platinum', 'yosemite', (t, l, d, ox) => { APP.reviewDesk(ox + 14, 34, 292, 250, { reveal: prog(l, .1, 1.6), you: R(lerp(60, 97, easeOut(prog(l, .3, 2.6)))) }); }],
    ['searcher', 'system7', 'tiger', (t, l, d, ox) => { const s0 = t - l; APP.searcher(ox + 10, 26, 300, 290, { typing: { text: 'tidal power La Rance', t0: s0 + .1, t1: s0 + 1.1 }, pressed: l > 1.15 && l < 1.3 ? 'search' : -1, reveal: prog(l, 1.3, 2.2), sel: l > 2.5 ? 1 : -1, results: [{ title: 'La Rance Tidal Power Station', url: 'en.wikipedia.org', snippet: 'Opened 1966, the first of its kind.' }, { title: 'Billing the tide', url: 'archive.example.org', snippet: 'A 1966 feasibility report.' }, { title: 'Estuary tables', url: 'tides.example.org', snippet: 'Twice a day, both ways.' }] }); }],
    ['questionSheet', 'nextstep', 'snowleopard', (t, l, d, ox) => { const s0 = t - l; APP.questionSheet(ox + 10, 26, 300, 280, { typing: { text: 'Does the turbine care which way?', t0: s0 + .3, t1: s0 + 2.2 } }); }],
    ['outline', 'drawingboard', 'lion', (t, l, d, ox) => { APP.outline(ox + 10, 30, 300, 250, { sel: Math.floor(l * 2) % 6 }); }],
    ['sectionDrafts', 'platinum', 'bigsur', (t, l, d, ox) => { const s0 = t - l; APP.sectionDrafts(ox + 6, 30, 308, 260, { sel: 1, typing: { text: 'The turbines do not care.', t0: s0 + .3, t1: s0 + 2 } }); }],
    ['notePad + about', 'system6', 'aqua', (t, l, d, ox) => { APP.notePad(ox + 10, 24, 180, 130, { page: 1 + Math.floor(l), typing: { text: ' Check the 1966 report.', t0: t - l + .2, t1: t - l + 1.5 } }); APP.about(ox + 20, 150, 290, 200, { used: prog(l, .2, 1.5) }); }],
    ['finder + fileFloppy', 'system7', 'snowleopard', (t, l, d, ox) => { APP.finder(ox + 8, 24, 300, 160, { sel: Math.floor(l * 2) % 6, open: 0 }); APP.fileFloppy(ox + 20, 196, 290, 150, { ocr: prog(l, .2, 2.6), current: 'scan-p12.pdf' }); }],
    ['projectCD + floppies', 'platinum', 'liquidglass', (t, l, d, ox) => { APP.projectCD(ox + 8, 26, 304, 140, { burn: prog(l, .1, 2.4) }); APP.floppyMeter(ox + 8, 186, 304, 150, { count: easeOut(prog(l, .2, 1.8)) }); }],
    ['oneMoreTune', 'system6', 'liquidglass', (t, l, d, ox) => { // deck card OMT-002: the answer reveals the ad line
      APP.oneMoreTune(ox + 4, 26, 312, 304, { track: 3, done: [0, 1, 2], year: 2008, label: ox ? 'Liquid Glass' : 'System 6', song: 'New Soul', artist: 'Yael Naïm', sub: l > 2 ? 'Envelope' : undefined,
        options: ['iPod nano', 'MacBook Air', 'iPhone'], answer: l > 2 ? 1 : undefined, wrong: l > 1.4 ? 0 : undefined, nextPressed: l > 2.7, arm: easeOut(prog(l, 0, .6)) }); }],
    ['controlPanel', 'system7', 'yosemite', (t, l, d, ox) => { APP.controlPanel(ox + 6, 24, 308, 300, { sel: Math.floor(l * 4) % 12 }); }],
    ['doom + micropolis', 'system6', 'platinum', (t, l, d, ox) => { APP.doom(ox + 10, 22, 300, 170, { walk: t * 1.5, fire: Math.max(0, 1 - ((l * 2) % 1) * 4), imp: prog(l, 0, 3) }); APP.micropolis(ox + 10, 200, 300, 150, { built: prog(l, 0, 3), tool: 'R', cursor: [10 + Math.floor(l * 3), 6] }); }],
    ['writingBell + clio', 'aqua', 'liquidglass', (t, l, d, ox) => { APP.writingBell(ox + 20, 30, 160, 90, { seconds: 1500 - Math.floor(l * 60) }); clioSay(ox + 60, 210, 'Want me to take it from here?', { scale: 2, expr: 'happy', above: 50 }); }],
  ];
  apps.forEach(([name, a, b, fn]) => add('app ' + name, 3, both(a, b, fn, { app: APPNAME[name.split(' ')[0]] }), { era: a }));

  // ---------------- widgets ----------------
  const widgetEras = [['system6', 'platinum'], ['nextstep', 'aqua'], ['drawingboard', 'snowleopard'], ['system7', 'liquidglass']];
  widgetEras.forEach(([a, b]) => add('widgets ' + a + '/' + b, 3, both(a, b, (t, l, d, ox) => {
    const x = ox + 14, pw = win(ox + 4, 8, 312, 344, 'Controls', { body: E.chrome === 'aqua' ? undefined : P.face === '#ffffff' ? P.win : P.face, zoom: false });
    void pw;
    button(x, 38, 74, btnH(), 'OK', { def: true }); button(x + 88, 38, 74, btnH(), 'Cancel', { pressed: (l * 2) % 1 > .7 }); button(x + 176, 38, 80, btnH(), 'Disabled', { disabled: true });
    check(x, 68, 'Keep the pen', true); check(x + 120, 68, 'Let Clio write', false, { disabled: true });
    radio(x, 86, 'Draft', Math.floor(l) % 2 === 0); radio(x + 120, 86, 'Final', Math.floor(l) % 2 === 1);
    popup(x, 104, 150, 'Appearance');
    slider(x + 170, 106, 110, (Math.sin(l * 2) + 1) / 2);
    textField(x, 132, 180, 20, typed('Your roughness is not a defect.', t - l + .2, t - l + 2.2), { caret: 'solid', focus: true });
    progress(x, 162, 120, 12, prog(l, 0, 3)); progress(x + 140, 162, 120, 12, 0, { indeterminate: true });
    tabs(x, 186, 250, ['Themes', 'Fonts', 'Sound'], Math.floor(l) % 3);
    vscroll(x + 268, 210, 110, (Math.sin(l * 2) + 1) / 2, .3); hscroll(x, 318, 250, (Math.cos(l * 2) + 1) / 2, .3);
    groupBox(x, 214, 240, 96, 'Review');
    listRows(x + 6, 224, 228, [{ text: 'Rhythm', icon: 'reviewDesk', right: 'ok' }, { text: 'Summary language', icon: 'searcher', right: 'none' }, { text: 'Hedging', icon: 'chatFile', right: '1' }], { sel: Math.floor(l * 2) % 3, stripes: true });
    deskIcon(x + 184, 270, 'folder', 'Sources', { sel: (l % 1) > .5 });
  }, { menubar: false }), { era: a }));
  add('menus + pointers', 3, both('system7', 'bigsur', (t, l, d, ox) => {
    const items = menuLayout({ app: 'TeachText' }), m = items[Math.min(items.length - 1, 1 + Math.floor(l) % 3)];
    pullMenu(ox + 10, 24, ['Undo Typing\t⌘Z', '-', 'Cut\t⌘X', 'Copy\t⌘C', 'Paste\t⌘V', '~Ask Clio to Write It', '-', '✓Keep the Pen'], Math.floor(l * 3) % 8); void m;
    const kinds = ['arrow', 'ibeam', 'hand', 'grab', 'pencil', 'cross', 'watch', 'busy'];
    kinds.forEach((k, i) => { const px = ox + 206 + (i % 4) * 28, py = 40 + Math.floor(i / 4) * 34; rect(px - 12, py - 12, 26, 28, P.win); frame(px - 12, py - 12, 26, 28, P.rule); pointer(px, py, k); });
    balloon(ox + 170, 120, 140, 50, ox + 200, 190, {}); text('Balloon Help: this is', ox + 180, 130, { font: 'small' }); text('the Close box.', ox + 180, 142, { font: 'small' });
    tooltip(ox + 170, 210, 'Searcher: the live web');
    const k = (l % 1.5) / 1.5; zoomRects([ox + 40, 300], { x: ox + 20, y: 200, w: 140, h: 100 }, k);
    dragOutline(ox + 180 + R(Math.sin(l * 3) * 10), 250, 120, 70);
  }), { era: 'system7' });
  add('dock + desk', 3, both('aqua', 'liquidglass', (t, l, d, ox) => {
    deskIcons([['hardDisk', 'Hard Disk'], ['fileFloppy', 'File Floppy'], ['projectDisc', 'Project CD']], { x: ox + 266, sel: Math.floor(l) % 3 });
    APP.finder(ox + 10, 30, 240, 150, { sel: Math.floor(l * 2) % 6 });
    clipRect(ox, 0, W / 2, H, () => dock({ hover: Math.floor(l * 3) % 8, bounce: { i: 1, t0: t - l + .3 }, open: [0, 2, 4] }));
  }, { app: 'Finder', labelY: 206 }), { era: 'aqua' });

  // ---------------- Clio ----------------
  ['system6', 'platinum', 'aqua', 'liquidglass'].forEach(eid => add('clio ' + eid, 3, (t, l) => {
    const ln = fakeLine('Ah oh ee la la la, I keep time', t - l + .2, t - l + 2.8);
    const exprs = ['happy', 'sing', 'wink', 'surprised', 'deadpan', 'shrug', 'think', 'sad'];
    // captions: on a 1-bit desk a dither-outlined label is unreadable, so they get a white plate there
    const caption = (str, cx, y, font = 'small') => {
      if (E.depth === 1) { const w = tw(str, font) + 8, h = capH(font) + 6; rect(R(cx - w / 2), y - 3, w, h, C.white); frame(R(cx - w / 2), y - 3, w, h, C.black); }
      text(str, cx, y, { font, align: 'center', color: E.depth === 1 ? C.black : P.deskText });
    };
    exprs.forEach((ex, i) => { const x = 16 + (i % 4) * 78, y = 30 + Math.floor(i / 4) * 80; clio(x, y, { scale: 2, expr: ex, mouth: ex === 'sing' ? fakeSing(ln, t) : 0 }); caption(ex, x + 32, y + 60); });
    ['pencil', 'floppy', 'note', 'record', 'mic', 'heart'].forEach((it, i) => clio(16 + i * 52, 200, { scale: 1, holding: it, expr: 'happy' }));
    clio(30, 236, { scale: 2, pose: 'point', point: 'right', expr: 'wink' }); clio(110, 236, { scale: 2, pose: 'shrug', expr: 'shrug' }); clio(190, 236, { scale: 2, pose: 'wave', expr: 'happy' });
    // the big one reaches for the pencil, but never down into the lyric's zone (reach y < 280)
    clio(350, 34, { scale: 8, mouth: fakeSing(ln, t), expr: 'sing', bob: 1, pose: 'reach', reach: [276 + R(Math.sin(l * 2) * 10), 250 + R(Math.cos(l * 2) * 6)], holding: 'pencil', shadow: true });
    kara(ln, W / 2 + 40, 314, { align: 'center', mode: 'pop', maxW: 600, plate: true });
    caption(ERA[eid].name, 50, H - 18, 'ui');
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
  ['dissolve', 'bayer', 'wipe', 'blinds', 'iris', 'checker'].forEach((st, i) => add('morph ' + st, 1.5, (t, l) => { fxDesk(t, l); }, { era: [[0, APPEARANCES[i * 2].id], [0.2, APPEARANCES[i * 2 + 1].id, st]], eraLocal: true, morph: 1.1 }));

  // ---------------- the era tour: windows stay put, the computer changes around them ----------------
  add('tour', 12, (t, l) => {
    const s0 = t - l;
    APP.teachText(14, E.menuH + 12, 300, 200, { title: 'Manuscript' });
    APP.clioTalk(330, E.menuH + 40, 260, 210, { msgs: [{ who: 'you', text: 'Change the era.' }, { who: 'clio', text: 'Done. Your files stayed put.' }] });
    clio(40, 250, { scale: 3, mouth: 'sing', expr: 'happy', bob: 1 });
    cursor(t, [[s0, 200, 200], [s0 + 6, 420, 120], [s0 + 12, 200, 200]]);
  }, { era: APPEARANCES.map((e, i) => [i, e.id]), eraLocal: true, morph: .45 });

  // ---------------- tile the reel over the whole song ----------------
  const total = REEL.reduce((a, s) => a + s.dur, 0);
  if (parked) { let t = 1000; for (const s of REEL) { scene(s.name, t, t + s.dur, s.fn, s.opts); t += s.dur; } window.SPECIMEN = { length: total, at: 1000 }; return; }
  let t = 0, cycle = 0;
  while (t < DUR && total > 0) {
    for (const s of REEL) { if (t >= DUR) break; scene((cycle ? '~' : '') + s.name, t, Math.min(DUR, t + s.dur), s.fn, s.opts); t += s.dur; }
    cycle++;
  }
  window.SPECIMEN = { length: total, at: 0 };
})();
