// specimen.js: the toolkit reel. With ?specimen, or when no chapter has registered a scene, it tiles 0..DUR with:
// one 3-second scene per era (desktop, menu bar, a document window, a dialog, icons, Clio at two scales, the pointer,
// a progress bar, typed text, a sung lyric), then the app windows, the widgets, Clio's expressions and the FX.
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
  const MANUSCRIPT = ['# The Tide Comes In Twice', '', '## The bill arrives by moonlight', 'The engineers at La Rance never called it', 'renewable energy. They called it the tide,', 'and they billed it by the moon.', '', '## Both directions count', 'Twice a day the estuary fills, and twice', 'a day it empties.'];
  const ICONS_R = [['startupDisk', 'Startup Disk'], ['fileFloppy', 'File Floppy'], ['assistant', 'ClioTalk'], ['oneMoreTune', 'One More Tune'], ['trash', 'Trash']];
  const LYR = ['I will never be your voice', 'Twelve appearances, one desk', 'You keep the pen, I keep time', 'Chat is an app, not the computer'];

  const REEL = [];
  const add = (name, dur, fn, opts = {}) => REEL.push({ name, dur, fn, opts });

  // ---------------- one scene per era ----------------
  ERAS.forEach((e, ei) => add('era ' + e.id, 3, (t, l, d) => {
    const s0 = t - l, ln = fakeLine(LYR[ei % LYR.length], s0 + .25, s0 + 2.6);
    UI.menu = { app: 'TeachText', open: l > 1.55 && l < 2.25 ? 2 : undefined, propW: 66, prop: (x, y, w, h) => { text(e.year + '', x + w, y + R((h - capH('menu')) / 2) + 1, { font: 'menu', align: 'right', color: P.menuText }); } };
    const top = E.menuH + 10, left = E.chrome === 'next' ? 116 : 14;
    deskIcons(ICONS_R, { sel: l > .3 && l < 1.2 ? 2 : -1, gap: 50, y: E.chrome === 'next' ? 190 : top });
    // a document window
    const c = win(left, top, 316, 200, 'Manuscript', { header: ['79 words · 4 paragraphs', '', 'Modified'], status: 'Read-only, edit in Section Drafts', scroll: 'v', sk: .15, sfrac: .4, active: l < 2.4 });
    if (c) clipRect(c.x, c.y, c.w, c.h, () => {
      rect(c.x, c.y, c.w, c.h, P.win);
      const font = 'doc', lh = lineH(font) + 1;
      MANUSCRIPT.forEach((s, i) => { const hd = s.startsWith('#'); text(s.replace(/^#+ /, ''), c.x + 10, c.y + 8 + i * lh, { font: hd && FONTS[fontKey(font)] && E.depth > 1 ? 'serifB' : font, color: P.text }); });
      const k = kara(ln, c.x + 10, c.y + c.h - 30, { scale: FONTS[fontKey('lyric')].size >= 18 ? 1 : 1, font: E.depth === 1 ? 'chicago' : 'ui', maxW: c.w - 20 });
      void k;
    });
    // the big sung line, in the era's display type
    // a dialog with buttons, a progress bar, a typed field
    const al = alert(468, 236, { icon: 'caution', w: 268, text: 'Save the manuscript before ' + e.name + ' arrives?', buttons: ['Cancel', 'Save'], pressed: l > 2.45 && l < 2.62 ? 1 : undefined });
    if (al.client) { progress(al.text.x, al.text.y + 30, 150, 12, prog(l, .2, 2.4)); }
    // Clio at two scales
    clio(al.x + al.w - 40, al.y - 30, { scale: 1, mouth: 'sing', t: t - s0 + (ln.start - s0) * 0 , expr: 'sing' });
    const big = clio(E.dock ? 28 : 24, 222, { scale: 4, mouth: singingFake(ln, t), expr: l > 2.4 ? 'wink' : 'sing', pose: l > 1.4 ? 'reach' : 'rest', reach: [300, 200], holding: 'pencil', bob: 1 });
    void big;
    if (UI.menu.open != null) { const m = menuLayout(UI.menu)[UI.menu.open]; if (m && E.chrome !== 'next') pullMenu(m.x, E.menuH - 1, ['Question Sheet', 'Outline', 'Section Drafts\t⌘D', '-', '~Manuscript', 'Review Desk\t⌘R', '-', '✓' + e.name], R(prog(l, 1.6, 2.2) * 5)); }
    cursor(t, [[s0, 330, 120], [s0 + .7, 600, 150, 'click'], [s0 + 1.55, 120, 8, 'press'], [s0 + 2.25, 140, 60], [s0 + 2.45, al.btn[1] ? al.btn[1].cx : 500, al.btn[1] ? al.btn[1].cy : 300, 'click']]);
    // the line, big, along the bottom
    const font = 'lyric', y = E.dock ? 300 : 318;
    kara(ln, 330, y - 10, { font, align: 'center', mode: 'select', maxW: 600 });
  }, { era: e.id }));

  function singingFake(ln, t) { // singing() for a fake line
    const w = ln.words.find(w => t >= w.start && t < w.end);
    if (!w) return 0;
    const el = t - w.start, dur = w.end - w.start;
    return clamp(el / .05) * (1 - clamp((el - dur * .75) / (dur * .25)) * .8);
  }

  // ---------------- tile the reel over the whole song ----------------
  const total = REEL.reduce((a, s) => a + s.dur, 0);
  let t = 0, cycle = 0;
  while (t < DUR) {
    for (const s of REEL) { if (t >= DUR) break; scene((cycle ? '~' : '') + s.name, t, Math.min(DUR, t + s.dur), s.fn, s.opts); t += s.dur; }
    cycle++; if (total <= 0) break;
  }
})();
