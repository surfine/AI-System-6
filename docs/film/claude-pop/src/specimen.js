// specimen.js: the toolkit reel and the style reel.
// The STYLE REEL (style.js: silhouette mode, the dancer, the pen, giant type, beat FX, the camera, the band) is always
// parked at 1000 s, past the end of the video (?style plays it from 0). The toolkit reel: with ?specimen, or when no
// chapter has registered a scene, it tiles 0..DUR (otherwise it is parked once at 1100 s, after the style reel) with:
//   0-36 s   one 3-second scene per era: desktop, menu bar (pulled down), a document window, a dialog, icons,
//            Clio singing at two scales, the pointer, a progress bar, typed text and a sung lyric
//   then     the app windows (each shown in an early era on the left and a late era on the right), the widgets,
//            Clio's expressions, the whole-frame FX and an era-morph tour.
// Reviewers judge the kit here; chapter authors can crib from it.
'use strict';
(function () {
  // With ?specimen, or when no chapter has registered a scene, the reel tiles the song from 0. Otherwise it is parked
  // once at KIT_AT = 1100 s, past the end of the video and the style reel: `node render.mjs sheet 1100 1136 3`.
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

  // =====================================================================================================
  // THE STYLE REEL (style.js), parked at STYLE_AT = 1000 s whatever else is registered (past the end of the video):
  //   node render.mjs sheet 1000 1046.5 0.25 build/style-sheet.png
  // Most shots borrow a stretch of song time (warp: T is the song time inside them), so the beat FX, the band, the
  // dance and the lyric sync run on the real EVENTS and LYRICS (fake lines stand in when the song is missing).
  // The silhouette rule, every frame: ONE hero (a word or a pose), the white pen, and nothing that does not serve them.
  // No glyph of big type may be more than 10% covered: legibilityAudit(1000, 1049) checks it.
  // =====================================================================================================
  const STYLE = [], sadd = (name, dur, fn, opts = {}) => STYLE.push({ name: 'style ' + name, dur, fn, opts });
  const warp = (s0, fn) => (t, l, d) => { const st = s0 + l; T = st; return fn(st, l, d); };
  const lyr = (id, str, t0, t1) => { try { const l = lyric(id); if (!l.placeholder && !SONG_MISSING) return l; } catch (e) { /* not in this song */ } return fakeLine(str, t0, t1); };
  const L1 = {
    pre: lyr('pre1d', 'stay in your hand.', 34, 35), a: lyr('chorus1a', "I'm just your pen pal,", 35.25, 37.25), e: lyr('chorus1a_echo', '(pen pal)', 37.25, 37.75),
    b: lyr('chorus1b', "I'll never hold the pen.", 37.75, 40), c: lyr('chorus1c', 'You say where I land,', 40, 42),
    g: lyr('chorus1g', 'Who holds the pen?', 48, 49.75), h: lyr('chorus1h', 'You do! You do!', 50, 52), la: lyr('q3', 'La la la, la la la la.', 52, 54),
    tmp: lyr('i2', 'Everything I say is temporary.', 8, 11), v2: lyr('v2a', 'Chat is an app. Not the whole computer.', 60, 63.75),
  };
  const DOWN = section('chorus1') ? section('chorus1').start : 36;   // the chorus downbeat ("pen")
  // the writer's rig: the pointer holds the white pen on its long cord; the pen hangs and swings with the beat
  const rig = (t, px, py, o = {}) => {
    const s = o.scale ?? 4, th = (o.swing ?? .3) * Math.sin(beatPhase(t, 2) * Math.PI * 2) + (o.lean ?? 0), len = o.len ?? 60;
    const ax = px + 5, ay = py + 15, ang = Math.atan2(Math.cos(th), Math.sin(th));
    const bx = ax + Math.cos(ang) * len, by = ay + Math.sin(ang) * len;
    return { ax, ay, bx, by, ang, s, tip: [R(bx + Math.cos(ang) * 36 * s), R(by + Math.sin(ang) * 36 * s)] };
  };
  const penRig = (t, px, py, o = {}) => {
    const g = rig(t, px, py, o);
    penCord([[g.ax, g.ay], [g.bx, g.by]], { sag: o.sag ?? 9, swing: o.cordSwing ?? 6, t });
    pen(g.tip[0], g.tip[1], g.ang, g.s, { t });
    CUR = { x: px, y: py, kind: 'arrow', down: o.down };
    return g;
  };
  // the pen lying level across the top of a poster, its cord running up to the pointer (the type keeps the frame below it)
  const penBar = (t, x, y, o = {}) => {
    const s = o.scale ?? 4, bob = R(2 * pulse(t, 1, 6)), tip = [x, y + bob], back = [x - R(36.5 * s), y + bob];
    penCord([[back[0], back[1]], [o.px ?? back[0] - 40, o.py ?? 4]], { sag: 14, swing: 4, t });
    pen(tip[0], tip[1], 0, s, { t });
    CUR = { x: o.px ?? back[0] - 45, y: (o.py ?? 4) - 14, kind: 'arrow' };
  };
  const MS = ['# Pen Pal', 'The engineers at La Rance never called it renewable energy. They called it the tide, and they billed it by the moon.', 'Twice a day the estuary fills.'];
  const fld1 = FIELDS.magenta;

  // ---- 1. flood in: the 1988 desk, the pen touches down at once, and the chorus floods out of its tip in 10 hard
  // one-frame steps onto the downbeat, the tip dragging a white trail; the frame inverts for two frames on the cover ----
  const ptrIn = t => track(t, [[35, 300, 44], [35.25, 236, 40], [DOWN, 520, 16]]);
  const floodT0 = DOWN - 10 / FPS;
  sadd('flood in', 1, warp(35, (t) => {
    UI.menu = { app: 'TeachText' };
    APP.teachText(14, 34, 296, 206, { title: 'Manuscript', lines: MS, typing: { text: 'The pen stays in your hand', t0: 35, t1: 35.8 } });
    clio(470, 176, { scale: 4, mouth: 'sing', expr: 'sing', bob: 1, pose: 'point', point: 'left' });
    kara(L1.a, 320, 300, { align: 'center', plate: true });
    const [px, py] = ptrIn(t), g = penRig(t, px, py, { scale: 3, len: 40, swing: .12 });
    const g0 = rig(floodT0, ...ptrIn(floodT0), { scale: 3, len: 40, swing: .12 });
    overlay(() => {
      inkFlood(floodT0, DOWN, g0.tip[0], g0.tip[1], tt => chorusFrame(Math.max(tt, DOWN), { noFX: true, noPen: true }), { steps: 10 });
      if (t >= floodT0) { const pts = []; for (let tt = floodT0; tt <= t + 1e-6; tt += 1 / FPS) pts.push(rig(tt, ...ptrIn(tt), { scale: 3, len: 40, swing: .12 }).tip); penTrail(pts, { w: 3 }); pen(g.tip[0], g.tip[1], g.ang, 3, { t, flash: false }); }
    });
  }), { era: 'system6' });

  // ---- 2. the chorus, six seconds: one flat magenta field, the hook as the poster, Clio as the hero dancer ----
  const chorusFrame = (t, o = {}) => withEra('system7', () => {
    rect(0, 0, W, H, fld1);
    let d;
    if (t < L1.b.start) {   // PEN / PAL: the type is the hero. Plain black letters, no menu bar; on the echo "(pen pal)"
      const echo = t >= L1.e.start;  // the frame flips: full-bleed black slabs, field letters (slabs first, then letters)
      const ty = { t, words: L1.a, scale: 19, color: echo ? fld1 : C.black, invert: echo, slab: C.black, slabMode: 'bleed', pad: 1, slam: echo ? L1.e.start : null };
      bigTypes([['PEN', { ...ty, x: -8, align: 'left', valign: 'top', y: 4 }], ['PAL', { ...ty, x: W + 8, align: 'right', valign: 'bottom', y: H - 4 }]]);
      d = clioDance(98, H - 8, 5, t, { field: fld1, ground: false });
      if (!o.noPen) penRig(t, 560, 0, { scale: 4, len: 14, swing: .08 });
    } else if (t < L1.c.start) {   // I'LL NEVER / HOLD / THE PEN.: a justified block, a window slab peeking in, Clio beside it
      slabWindow(500, 8, 200, 130, { cut: fld1 });
      bigType(["I'LL NEVER", 'HOLD', 'THE PEN.'], { t, words: L1.b, justify: 438, fitH: 336, lead: 2, color: C.black, x: 8, align: 'left', y: 184 });
      d = clioDance(560, H - 8, 5, t, { field: fld1 });
      penRig(t, 466, -16, { scale: 4, len: 12, swing: .04 });
    } else {                       // YOU SAY / WHERE I / LAND,: Clio is the hero; she jumps and lands where the writer clicks
      bigType(['YOU SAY', 'WHERE I', 'LAND,'], { t, words: L1.c, justify: 300, fitH: 300, lead: 2, color: C.black, x: 10, align: 'left', y: 190 });
      const land = wordAt(L1.c, -1).start, air = t >= land - .5 && t < land;
      d = clioDance(R(lerp(584, 504, easeOut(prog(t, land - .5, land)))), H - 10, 8, t, { field: fld1, pose: air ? 'jump' : t >= land && t < land + .5 ? 'cheer' : undefined, p: air ? prog(t, land - .5, land) : undefined });
      const [px, py] = track(t, [[40, 366, 8], [40.9, 372, 22], [41.2, 384, 20]]);
      penRig(t, px, py, { scale: 4, len: 20, swing: .08, lean: .1 });
      if (t >= land && t < land + .25) clickBurst(504, H - 12, land, { pointer: false, color: C.white, scale: 2 });
    }
    if (!o.noFX) { beatFX(t, { clap: true }); invertFrame(DOWN, 2, t); }
    return d;
  });
  sadd('chorus', 6, warp(36, (t) => { chorusFrame(t); }), { era: 'system7', raw: true });

  // ---- 3. WHO / HOLDS / THE PEN?: a justified block, one letter per 16th, the pen level across the top; then YOU DO! on
  // the two hits: the first black on the field with Clio in the split, the second a full-frame black flip ----
  const whoFrame = t => withEra('system7', () => {
    const youAt = L1.h.words[0].start, again = L1.h.words[2].start, second = t >= again && t < L1.h.words[3].start;   // the strobe: black on the second "you", back on "do!"
    rect(0, 0, W, H, second ? C.black : fld1);
    if (t < youAt - .1) {
      bigType(['WHO', 'HOLDS', 'THE PEN?'], { t, stepIn: { t0: L1.g.start, div: 4 }, justify: W - 16, fitH: H - 64, lead: 2, color: C.black, x: W / 2, valign: 'top', y: 60 });
      penBar(t, 466, 28, { scale: 4, px: 590, py: 6 });
    } else {
      const ln = t >= again ? { words: L1.h.words.slice(2) } : L1.h;
      bigType(['YOU', 'DO!'], { t, words: ln, justify: 330, fitH: H - 24, lead: 1, color: second ? fld1 : C.black, x: 12, align: 'left', y: H / 2 });
      punch(youAt, 170, 90, [2, 2]); punch(again, 170, 90, [2, 2]);
      clioDance(500, H - 14, 7, t, { field: fld1, pose: 'cheer', p: beatPhase(t) });
      penRig(t, 604, -12, { scale: 4, len: 10, swing: .05 });
    }
    beatFX(t, { clap: true });
  });
  sadd('who holds the pen', 4, warp(47.75, t => whoFrame(t)), { era: 'system7', raw: true });

  // ---- 4. the post-chorus flips to the complementary field with a scanline wipe on 16ths: la la la, a new pose every beat ----
  const POST_POSES = ['bounce', 'clap', 'robot', 'shimmy', 'disco', 'kick', 'vogue', 'jump'];
  const postFrame = t => withEra('platinum', () => {
    const fld = FIELDS.lime;
    rect(0, 0, W, H, fld);
    const la = L1.la.words, row = (ws, y) => bigType(ws.map(w => w.w.toUpperCase()).join(' '), { t, words: { words: ws }, justify: W - 24, max: 8, fitH: 64, color: C.black, valign: 'top', y });
    row(la.slice(0, 3), 6); row(la.slice(3), 290);
    clioDance(320, 282, 4, t, { field: fld, pose: POST_POSES[((Math.floor(beatAt(t)) % 8) + 8) % 8], voice: 'choir' });
    penRig(t, 590, 96, { scale: 3, len: 14, swing: .1 });
    beatFX(t);
  });
  sadd('post-chorus', 2, warp(51.5, t => { if (t < 52) whoFrame(t); scanWipe(51.75, 52, postFrame, { band: 4 }); }), { era: 'platinum', raw: true });

  // ---- 5. the pixel dive: into the writer's vermilion full stop of 1988; out of it the 1991 desk grows until it is the frame ----
  const PERIOD = [334, 197];   // the full stop that ends the manuscript, at the same place in every era (windows stay put)
  const eraDesk = (o = {}) => t => {
    UI.menu = { app: 'TeachText' };
    const doc = APP.teachText(146, E.menuH + 14, 208, 206, { title: 'Manuscript', lines: MS.slice(0, 2) });
    if (doc) { const f = 'ui', y = PERIOD[1] - capH(f) + 2; rect(doc.x + 8, y - 4, PERIOD[0] - doc.x - 6, capH(f) + 8, P.win); text('You may now write', PERIOD[0] - 2, y, { font: f, align: 'right', color: P.text }); rect(PERIOD[0], PERIOD[1], 2, 2, FIELDS.vermilion); }
    clio(362, 150, { scale: 4, expr: o.expr || 'sing', mouth: 0, blink: false, look: [0, 0] });
    deskIcons([['hardDisk', 'Hard Disk'], ['fileFloppy', 'File Floppy']], { y: E.menuH + 10 });
  };
  sadd('dive', 4, (t, l) => { const s0 = t - l; diveInto(s0 + 1 / FPS, s0 + 3.5, PERIOD[0], PERIOD[1], eraDesk({ expr: 'surprised' }), eraDesk(), { outer: { era: 'system6' }, inner: { era: 'system7' }, pw: 2 }); }, { raw: true, era: 'system6' });

  // ---- 6. the outro's pull-back: 2026 -> 2014 -> 2002 -> 1988, each inside the full stop of the one before, a step per
  // two beats, then one vermilion dot; half a second of it, no more ----
  const LAYERS = ['liquidglass', 'yosemite', 'aqua', 'system6'].map(era => ({ draw: eraDesk(), era, px: PERIOD[0], py: PERIOD[1], pw: 2 }));
  sadd('pull-back', 4, (t, l) => { const s0 = t - l; pullBack(s0, s0 + 3.5, LAYERS, { dotWeight: .5, dotAt: [PERIOD[0], PERIOD[1]] }); }, { raw: true, era: 'liquidglass' });

  // ---- 7. the band as a drum machine (song 32-38: the riser, the drop, the claps, the bell, the floppies); on the
  // downbeat a scanline wipe turns it into silhouette mode: solid black instruments with cyan cut-outs ----
  sadd('band', 6, warp(32, t => {
    bandGrid(0, 0, W, H, { t });
    overlay(() => scanWipe(DOWN - .25, DOWN, tt => bandGrid(0, 0, W, H, { t: tt, field: FIELDS.cyan }), { band: 4 }));
  }), { era: 'system7', raw: true });

  // ---- 8. the screen grows with history: 512x342 1-bit, then 640x400 in 256 colours, 640x480 in thousands, each held a
  // beat or more; on the key change the bars are punched off (2-frame invert, a 2x punch, 4 hard steps) and it is 16:9 ----
  const scrMap = l => l < 1.25 ? 34.75 + l : l < 2.25 ? 36 + (l - 1.25) : l < 3.25 ? 52 + (l - 2.25) : 127.75 + (l - 3.25);
  sadd('screen', 4.5, (t, l) => {
    const st = scrMap(l), sz = screenSize(st); T = st;
    UI.menu = { app: 'TeachText', prop: (x, y, w, h) => depthChips(x + 2, y + 3, w - 4, h - 6, sz.bits), propW: 60 };
    APP.teachText(14, E.menuH + 12, 250, 170, { title: 'Manuscript', lines: MS });
    const cap = sz.name.replace('x', ' x ') + '   ' + (sz.bits === 1 ? '1-BIT' : sz.bits === 8 ? '256 COLOURS' : sz.bits === 16 ? 'THOUSANDS' : 'MILLIONS');
    const cw = tw(cap, 'chicago', 2) + 24, cx = R(W / 2 - cw / 2), cy = E.dock ? H - 128 : H - 70;
    rect(cx, cy, cw, 52, C.black); text(cap, W / 2, cy + 8, { font: 'chicago', scale: 2, align: 'center', color: C.white }); depthChips(cx + 12, cy + 34, cw - 24, 12, sz.bits);
    clio(W - 140, 70, { scale: 4, mouth: 'sing', bob: 1 });
    CUR = { x: W / 2 + 40, y: H / 2 - 20, kind: 'arrow' };
  }, { screen: (t) => screenSize(scrMap(t - STYLE_AT_OF('screen'))), era: t => songEra(scrMap(t - STYLE_AT_OF('screen'))) });

  // ---- 9. type: a justified block that bleeds off the sides only, PEN over PAL, a slammed slab, ghost words ----
  sadd('type', 4, (t, l) => {
    const pg = Math.min(3, Math.floor(l)), u = l - pg;
    if (pg === 0) { rect(0, 0, W, H, FIELDS.cyan); bigType(['WHO', 'HOLDS', 'THE PEN?'], { t, stepIn: { t0: t - u, div: 16 }, justify: W, bleed: 10, fitH: H - 40, lead: 1 }); }
    else if (pg === 1) { rect(0, 0, W, H, FIELDS.lime); bigType(['PEN', 'PAL'], { t, justify: W - 40, fitH: H - 48, lead: 1, slam: t - u + (u >= .5 ? .5 : 0) }); }
    else if (pg === 2) { rect(0, 0, W, H, C.black); bigType(['YOU', 'DO!'], { t, justify: W - 120, fitH: H - 56, lead: 1, color: C.white, slam: t - u + (u >= .5 ? .5 : 0), shadow: [FIELDS.magenta, 1, 1] }); }
    else { rect(0, 0, W, H, C.white); const ln = L1.tmp, tt = lerp(ln.start, ln.end + .2, u); bigType(['EVERYTHING I SAY', 'IS TEMPORARY.'], { t: tt, words: ln, ghost: true, justify: W - 40, lead: 3, max: 10 }); }
  }, { raw: true, era: 'system6' });

  // ---- 10. the hard beat FX, one after another, on a frozen chorus frame ----
  const deskAqua = t => {
    UI.menu = { app: 'ClioTalk' };
    APP.clioTalk(130, 46, 330, 220, { msgs: [{ who: 'you', text: 'Chat is an app.', at: L1.v2.start, typing: .6 }, { who: 'clio', text: 'Not the whole computer.', at: L1.v2.words[4] ? L1.v2.words[4].start : L1.v2.start + 2 }] });
    clio(476, 150, { scale: 4, mouth: 'sing', expr: 'sing', bob: 2 });
    cursor(t, [[59.5, 560, 40], [60.2, 300, 240, 'click'], [61, 330, 250]]);
  };
  const FXS = [['invert (phrase hit)', () => { FX.invert = (Math.floor(T * FPS) % 8) < 1; }], ['split, palette 2px', () => splitPal(2)], ['pixel sort, type kept', u => pixelSort(40, 300, null, 2)], ['punch 3x 2x', u => punch(0, 320, 150, [3, 3, 3, 2, 2, 2], u)],
    ['scan wipe', u => scanFX(u / .75, { color: C.black, edge: C.white })], ['posterize 2', () => { ctx.drawImage(frameInto(styleBuf('reelB'), 60.5, deskAqua, { era: 'tiger' }), 0, 0); posterize(2); }]];
  sadd('fx', 4.5, (t, l) => {
    const i = Math.min(FXS.length - 1, Math.floor(l / .75)), u = l - i * .75;
    if (i < FXS.length - 1) { T = 39.7; chorusFrame(39.7, { noFX: true }); T = t; }
    FXS[i][1](u);
    overlay(() => { const s = FXS[i][0], w = tw(s, 'monaco') + 10; rect(8, H - 22, w, 14, C.black); text(s, 13, H - 19, { font: 'monaco', color: C.white }); });
  }, { raw: true, era: 'system7' });

  // ---- 11. the dance: every pose (forced) on the beat; for the last two seconds the faces are blacked out (the shape test) ----
  sadd('dance', 4, warp(52, (t, l) => {
    rect(0, 0, W, H, FIELDS.lime);
    const face = l < 2;
    DANCE_POSES.forEach((p, i) => { const x = 80 + (i % 4) * 160, y = 112 + Math.floor(i / 4) * 120; clioDance(x, y, 3, t, { pose: p, field: FIELDS.lime, face, ground: true }); text(p, x - 74, y - 104, { font: 'monaco', color: C.black }); });
    text(face ? 'faces on' : 'faces off: the shape test', W - 8, H - 12, { font: 'monaco', align: 'right', color: C.black });
  }), { raw: true, era: 'platinum' });

  // ---- 12. out of silhouette mode on the beat: the field drains back into the pen tip in 10 hard steps onto the downbeat
  // (pixel-sorted as it goes), the 2002 desk is there and alive, and the landing punches in ----
  sadd('flood out', 2.5, warp(58.5, t => {
    const end = 60, t0 = end - 10 / FPS, g0 = rig(t0, 560, 40, { scale: 3, len: 14 });
    if (t < end) postFrame(t);
    inkFlood(t0, end, g0.tip[0], g0.tip[1], tt => ctx.drawImage(frameInto(styleBuf('reelB'), tt, deskAqua, { era: 'aqua' }), 0, 0), { drain: true, seed: 3, steps: 10 });
    if (t >= t0 && t < end) pixelSort(20, 260, null, 1);
    if (t >= end) { punch(end, 300, 180, [2, 2, 2, 2]); invertFrame(end, 1); }
  }), { raw: true, era: 'platinum' });

  // pre-warm the caches the reel's first frames would build (the floods' shapes, every dance pose): no first-frame hitch
  warmUp(() => {
    const g0 = rig(floodT0, ...ptrIn(floodT0), { scale: 3, len: 40, swing: .12 }); _floodMap(g0.tip[0], g0.tip[1], 4, 7);
    const g1 = rig(60 - 10 / FPS, 560, 40, { scale: 3, len: 14 }); _floodMap(g1.tip[0], g1.tip[1], 4, 3);
  });

  const STYLE_AT = 1000, styleTotal = STYLE.reduce((a, s) => a + s.dur, 0), _styleAt = {};
  { let t = STYLE_AT; for (const s of STYLE) { _styleAt[s.name] = t; t += s.dur; } }
  function STYLE_AT_OF(name) { return _styleAt['style ' + name]; }
  const styleForced = new URLSearchParams(location.search).has('style');
  if (styleForced) SCENES.length = 0;
  { let t = styleForced ? 0 : STYLE_AT; for (const s of STYLE) { scene(s.name, t, t + s.dur, s.fn, s.opts); if (styleForced) _styleAt[s.name] = t; t += s.dur; } }
  window.STYLE_REEL = { at: styleForced ? 0 : STYLE_AT, length: styleTotal, shots: STYLE.map(s => [s.name, _styleAt[s.name], s.dur]) };

  // =====================================================================================================
  // THE 3D REEL (stage3d.js), parked at 1300 s, after the toolkit reel (?s3d plays it from 0): each preset once.
  //   node render.mjs sheet 1300 1321 .25 build/s3d-sheet.png
  // =====================================================================================================
  const S3 = [], s3add = (name, dur, fn, opts = {}) => S3.push({ name: '3d ' + name, dur, fn, opts });
  const yearPlate = (y, at) => withEra('system6', () => bigType(String(y), { scale: 5, invert: true, slab: C.black, color: C.white, pad: 2, x: 24, align: 'left', valign: 'bottom', y: H - 18, slam: at }));
  // ---- 1. the window corridor (the bridge, 104-110): the twelve desks float down a z-tunnel; a half beat each, held, then
  // a whip to the next (the smear is the whip); far panels dissolve in by Bayer; the year slams on each ----
  s3add('corridor', 6, warp(104, t => {
    const r = corridor3d(t, { key: 'reel corridor', desk: eraDesk(), at: 104, t0: 104, step: .5 });
    yearPlate(ERA[APPEARANCES[r.i].id].year, 104 + r.i * .5);
  }), { raw: true, era: 'system6' });
  // ---- 2. the silhouette stage (chorus 1, 36-42): the hook as voxel slabs slamming in z on their words, Clio extruded
  // from her 1-bit sprite as the hero, two card dancers upstage, the white pen hanging from the writer's pointer ----
  const C3 = { c: [0, 250, 0] }, oc = (r, a, h, o = {}) => ({ ...orbit3d(o.c || C3.c, r, a, h), ...o });
  const DANCE3 = [{ pos: [560, -60], size: 9, mode: 'voxel' }, { pos: [-820, -520], size: 7, mode: 'card', seed: 3 }, { pos: [900, -760], size: 7, mode: 'card', seed: 5, flip: true }];
  const PEN3 = (t, x, z) => ({ pos: [x, 720, z], angle: Math.PI / 2 + .25 * Math.sin(beatPhase(t, 2) * Math.PI * 2), size: 1.6 });
  const penCord3 = (st, t, p) => { const a = project3d(st, p.pos), px = a[0] + 6, py = -6; penCord([[a[0], a[1]], [px + 5, py + 15]], { sag: 4, swing: 3, t }); CUR = { x: px, y: py, kind: 'arrow' }; };
  const c1cam = [[35.5, oc(1800, -.6, 120)], [36, oc(1400, -.42, 220), 'snap'], [37.2, oc(1300, -.25, 260), 'lin'], [37.35, oc(1350, .55, 300), 'whip'],
    [37.75, oc(1350, .3, 640), 'snap'], [39.45, oc(1450, .12, 520), 'lin'], [39.5, oc(800, 0, 200, { c: [0, 330, 0] }), 'snap'], [40, oc(1500, -.38, 260, { c: [-80, 250, 0] }), 'whip'], [42, oc(1400, -.08, 360, { c: [-80, 250, 0], roll: .06 }), 'hard']];
  s3add('silhouette stage', 6, warp(36, t => {
    const r = silStage3d(t, { key: 'reel sil c1', field: FIELDS.magenta, cam: c1cam, dancers: DANCE3, pen: PEN3(t, 420, 120), type: [
      { text: ['PEN', 'PAL'], words: L1.a, show: [35, 37.75], size: 24, pos: [-160, 20, 0] },
      { text: ["I'LL NEVER", 'HOLD', 'THE PEN.'], words: L1.b, show: [37.75, 40], size: 12, pos: [-120, 20, 0] },
      { text: ['YOU SAY', 'WHERE I', 'LAND,'], words: L1.c, show: [40, 44], size: 13, pos: [-260, 20, 0], ghost: true }] });
    if (r.stage) penCord3(r.stage, t, PEN3(t, 420, 120));
    beatFX(t, { clap: true }); invertFrame(DOWN, 2, t);
  }), { era: 'system7', raw: true });
  // ---- 3. WHO HOLDS THE PEN? (47.75-51.75): one voxel letter per 16th while the camera rolls back along the block, then
  // YOU DO! slams on its words and the camera cranes down to the floor; Clio in the split ----
  const whoCam = [[47.75, oc(800, .5, 200, { c: [-200, 300, 0], roll: -.12 })], [49.9, oc(1600, -.2, 380, { roll: .04 }), 'hard'], [50, oc(1250, .25, 60, { c: [0, 230, 0] }), 'whip'], [51.75, oc(1400, .45, 140, { c: [0, 230, 0] }), 'lin']];
  s3add('who holds the pen', 4, warp(47.75, t => {
    const r = silStage3d(t, { key: 'reel sil who', field: FIELDS.magenta, cam: whoCam, pen: PEN3(t, 520, 60), dancers: [{ pos: [620, -40], size: 9, pose: t >= 50 ? 'cheer' : undefined, p: beatPhase(t) }], type: [
      { text: ['WHO', 'HOLDS', 'THE PEN?'], stepIn: { t0: L1.g.start, div: 4 }, show: [47.75, 49.95], size: 14, pos: [-80, 20, 0], ghost: true },
      { text: ['YOU', 'DO!'], words: L1.h, show: [49.95, 52], size: 22, pos: [-180, 20, 0] }] });
    if (r.stage) penCord3(r.stage, t, PEN3(t, 520, 60));
    beatFX(t, { clap: true });
  }), { era: 'system7', raw: true });
  // ---- 4. nested desks: 2026 back through every era, each a screen inside the one before's monitor, to the dot ----
  const NEST = ['liquidglass', 'bigsur', 'yosemite', 'lion', 'snowleopard', 'tiger', 'aqua', 'platinum', 'drawingboard', 'nextstep', 'system7', 'system6'];
  const _chrome = new Map();   // per era: the window chrome round a client rect (so the monitor's screen lands exactly on NEST_WIN)
  const chrome = () => { let c = _chrome.get(E.id); if (!c) { offscreen(400, 300, () => { const r = win(0, 0, 300, 200, 'x', {}); c = [r.x, r.y, 300 - r.w, 200 - r.h]; }); _chrome.set(E.id, c); } return c; };
  const monDesk = inner => t => {
    UI.menu = { app: 'TeachText' };
    APP.teachText(20, E.menuH + 14, 300, 214, { title: 'Manuscript', lines: MS });
    if (inner) { const [l, tp, dw, dh] = chrome(), m = NEST_WIN; win(m.x - l, m.y - tp, m.w + dw, m.h + dh, String(ERA[inner].year)); rect(m.x, m.y, m.w, m.h, C.black); }
    deskIcons([['hardDisk', 'Hard Disk'], ['fileFloppy', 'File Floppy']], { y: E.menuH + 10 });
  };
  const LAY = NEST.map((era, i) => ({ era, draw: monDesk(i ? NEST[i - 1] : null), at: 1000, win: i ? NEST_WIN : null }));
  s3add('nested desks', 5, (t, l) => {
    const s0 = t - l, r = nestedDesks3d(t, s0 + .3, s0 + 4.5, { key: 'reel nested', layers: LAY, dot: true });
    if (r.u < NEST.length - 1) yearPlate(ERA[NEST[r.layer]].year, null);
  }, { raw: true, era: 'liquidglass' });
  const R3D_AT = 1300, s3Forced = new URLSearchParams(location.search).has('s3d');
  if (s3Forced) SCENES.length = 0;
  { let t = s3Forced ? 0 : R3D_AT; for (const s of S3) { scene(s.name, t, t + s.dur, s.fn, s.opts); t += s.dur; } }
  window.S3D_REEL = { at: s3Forced ? 0 : R3D_AT, length: S3.reduce((a, s) => a + s.dur, 0), shots: S3.map(s => s.name) };
  if (s3Forced) return;
  if (styleForced) return;

  // ---------------- tile the reel over the whole song ----------------
  const total = REEL.reduce((a, s) => a + s.dur, 0);
  // parked: after the style reel, at KIT_AT = 1100 s (node render.mjs sheet 1100 1136 3 build/kit.png)
  if (parked) { const KIT_AT = 1100; let t = KIT_AT; for (const s of REEL) { scene(s.name, t, t + s.dur, s.fn, s.opts); t += s.dur; } window.SPECIMEN = { length: total, at: KIT_AT }; return; }
  let t = 0, cycle = 0;
  while (t < DUR && total > 0) {
    for (const s of REEL) { if (t >= DUR) break; scene((cycle ? '~' : '') + s.name, t, Math.min(DUR, t + s.dur), s.fn, s.opts); t += s.dur; }
    cycle++;
  }
  window.SPECIMEN = { length: total, at: 0 };
})();
