// apps.js: AI System 6's own app windows, era-aware and parameterised. Chapters compose these.
// Each APP.<name>(x, y, w, h, opts) draws the whole window (via win()) and returns its client rect plus anchors
// (button rects, row positions) so the pointer and Clio can aim at things, or null while the window zooms open.
// Common opts: title, k (opening progress), from (zoom origin), active, win ({...} passed to win()).
'use strict';

const APP = {};
const MANUSCRIPT = ['# The Tide Comes In Twice', '## The bill arrives by moonlight', 'The engineers at La Rance never called it renewable energy. They called it the tide, and they billed it by the moon.',
  '## Both directions count', 'Twice a day the estuary fills, and twice a day it empties. The turbines do not care which direction the water travels.'];
const headFont = () => E.chrome === 'next' ? 'helvB' : E.chrome === 'plat' || E.chrome === 'board' ? 'charcoal' : E.depth <= 4 ? 'chicago' : 'serifB';
const fillClient = (c, col = P.win) => { if (c.round) rrect(c.x, c.y, c.w, c.h, c.round, col); else rect(c.x, c.y, c.w, c.h, col); };
const W_ = (o, extra) => ({ k: o.k, from: o.from, active: o.active, ...extra, ...(o.win || {}) });
const modernEra = () => E.index >= ERA.aqua.index;
// small status glyphs used across apps: 'ok' (tick), 'flag' (caution), 'dot', 'spin'
function glyph(kind, x, y, c = P.text) {
  x = R(x); y = R(y);
  if (kind === 'ok') { const g = E.depth === 1 ? C.black : modernEra() ? '#28a745' : '#007700'; line(x, y + 4, x + 2, y + 7, g, 2); line(x + 2, y + 7, x + 8, y, g, 2); }
  else if (kind === 'flag') { tri(x + 4, y - 1, x + 9, y + 8, x - 1, y + 8, E.depth === 1 ? C.black : '#000000'); tri(x + 4, y + 1, x + 7, y + 7, x + 1, y + 7, E.depth === 1 ? C.white : '#ffcc00'); vline(x + 4, y + 3, 2, C.black); rect(x + 4, y + 6, 1, 1, C.black); }
  else if (kind === 'spin') { const a = Math.floor(T * 8) % 8; for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2; rect(x + 4 + R(Math.cos(an) * 3), y + 4 + R(Math.sin(an) * 3), 1, 1, i === a ? c : E.depth === 1 ? c : mix(c, P.win, .6)); } }
  else disc(x + 4, y + 4, 2, c);
}

// ---------------- TeachText: the manuscript, read-only while drafting ----------------
// opts: lines (paragraphs; '# ' / '## ' headings), words, paras, status, sk, typing {text, t0, t1} (appended paragraph),
//       hiRow (index of a row to select), scrollPx, font
APP.teachText = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'TeachText', W_(o, { header: o.header ?? [`${o.words ?? 79} words · ${o.paras ?? 4} paragraphs`, '', o.modified === false ? '' : 'Modified'], status: o.status ?? 'Read-only, edit in Section Drafts', scroll: o.scroll ?? 'v', sk: o.sk ?? .05, sfrac: o.sfrac ?? .55 }));
  if (!c) return null;
  const font = o.font || 'doc', lh = lineH(font) + 1, x0 = c.x + 12, rows = [];
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c);
    let yy = c.y + 9 - (o.scrollPx || 0);
    const paras = (o.lines || MANUSCRIPT).slice();
    if (o.typing) paras.push('\u0000' + typed(o.typing.text, o.typing.t0, o.typing.t1));
    paras.forEach((p, pi) => {
      const head = /^#+ /.test(p), live = p[0] === '\u0000', s = p.replace(/^#+ /, '').replace('\u0000', '');
      if (head && pi) yy += R(lh * .5);
      const f = head ? headFont() : font, ws = head ? [s] : wrap(s, c.w - 28, f);
      ws.forEach((r, ri) => {
        const ri0 = rows.length;
        if (o.hiRow === ri0) rect(x0 - 2, yy - 3, tw(r, f) + 4, capH(f) + 6, P.sel);
        const ww = text(r, x0, yy, { font: f, color: P.text });
        rows.push({ text: r, x: x0, y: yy, w: ww });
        if (live && ri === ws.length - 1 && o.typing && T < o.typing.t1 + 1.2 && (T < o.typing.t1 || caretOn())) rect(x0 + ww + 1, yy - 2, 1, capH(f) + 4, P.text);
        yy += lh;
      });
      if (!head) yy += R(lh * .35);
    });
  });
  return { ...c, rows, lh };
};

// ---------------- ClioTalk: chat is an app, not the whole computer ----------------
// opts: msgs [{who: 'clio'|'you', text, at (song time it appears), typing (show '...' until at)}], input (string),
//       typing {text, t0, t1} (typed into the field), actions (['Clip', 'Insert', 'Discard'] under Clio's last reply),
//       pressed (action index), sendPressed
APP.clioTalk = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'ClioTalk', W_(o, { header: o.header ?? ['Chat', '', o.model || 'Model: local'] }));
  if (!c) return null;
  const fam = E.chrome, one = E.depth === 1, font = o.font || 'body', lh = lineH(font), ih = 28;
  const out = { bubbles: [], actions: [] };
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c);
    // messages, laid out top-down then shifted up so the latest is visible
    const maxW = R(c.w * .62), items = [];
    for (const m of (o.msgs || [])) {
      const at = m.at ?? -1e9;
      if (T < at - (m.typing ? m.typing : 0)) continue;
      const typingNow = m.typing && T < at, rows = typingNow ? ['   '] : wrap(m.text, maxW - 16, font);
      const bw = typingNow ? 34 : Math.max(...rows.map(r => tw(r, font))) + 16, bh = rows.length * lh + 9;
      items.push({ m, rows, bw, bh, typingNow, pop: clamp((T - (typingNow ? at - m.typing : at)) / .12) });
    }
    let total = 8; for (const it of items) total += it.bh + 8 + (it.m.who === 'clio' && o.actions && it === items[items.length - 1] ? 22 : 0);
    let yy = c.y + 8 - Math.max(0, total - (c.h - ih - 14));
    items.forEach((it, i) => {
      const you = it.m.who === 'you', bx = you ? c.x + c.w - it.bw - 12 : c.x + 34, by = yy;
      const fill = you ? (one ? C.black : fam === 'glass' ? '#4a6f9f' : modernEra() ? P.accent === '#3a7cf0' ? '#3a7cf0' : '#2b8cf6' : fam === 'next' ? NX.d : '#333399') : (one ? C.white : fam === 'glass' ? '#eef1f5' : modernEra() ? '#e9e9eb' : P.face === '#ffffff' ? '#eeeeee' : P.lite);
      const ink = you ? C.white : P.text, r = modernEra() ? 8 : 6;
      if (it.pop > 0) {
        if (!modernEra() || one) rrect(bx + 1, by + 1, it.bw, it.bh, r, C.black);
        rrect(bx, by, it.bw, it.bh, r, one || !modernEra() ? C.black : fill); rrect(bx + 1, by + 1, it.bw - 2, it.bh - 2, r - 1, fill);
        if (it.typingNow) { for (let d = 0; d < 3; d++) { const up = Math.floor(T * 6 + d) % 3 === 0 ? 1 : 0; rect(bx + 9 + d * 7, by + 7 - up, 3, 3, ink); } }
        else it.rows.forEach((r2, j) => text(r2, bx + 8, by + 5 + j * lh, { font, color: ink }));
        if (!you) clio(c.x + 4, by + it.bh - 22, { scale: 1, expr: it.typingNow ? 'think' : 'happy', mouth: i === items.length - 1 && !it.typingNow ? 'sing' : 0, pose: 'none' });
      }
      out.bubbles.push({ x: bx, y: by, w: it.bw, h: it.bh, who: it.m.who });
      yy += it.bh + 8;
      if (!you && o.actions && i === items.length - 1 && !it.typingNow) { // AI output stays temporary until you place it
        let ax = bx;
        o.actions.forEach((a, ai) => { const aw = tw(a, 'small') + 14; out.actions.push(button(ax, yy - 2, aw, 15, a, { pressed: o.pressed === ai })); ax += aw + 5; });
        yy += 22;
      }
    });
    // the input field
    const fy = c.y + c.h - ih - 4, fx = c.x + 8, fw = c.w - 56;
    if (fam === 'mac1' || fam === 'mac7') hline(c.x, fy - 5, c.w, C.black); else hline(c.x, fy - 5, c.w, P.rule);
    let str = o.input ?? '', caret = false;
    if (o.typing) { str = typed(o.typing.text, o.typing.t0, o.typing.t1); caret = T >= o.typing.t0 - .3 && T < o.typing.t1 + .8 ? 'solid' : false; }
    out.input = textField(fx, fy, fw, ih - 6, str, { caret, focus: !!caret, placeholder: o.placeholder || 'Ask Clio. Her replies stay here until you place them.', font: 'small' });
    out.send = button(c.x + c.w - 42, fy + 2, 34, ih - 10, modernEra() ? '↑' : 'Send', { def: !!str, pressed: o.sendPressed, font: 'small' });
  });
  return { ...c, ...out };
};

// ---------------- Scrapbook: one card at a time ----------------
// opts: card {title, body, source}, n, of, kind ('TEXT'), pressed
APP.scrapbook = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'Scrapbook', W_(o, { header: o.header ?? [`${o.of ?? 2} scraps`, '', ''] }));
  if (!c) return null;
  const card = o.card || { title: 'Billed by the moon', body: 'Selected passage: “they billed it by the moon”', source: 'Source: 1966 feasibility report, p. 12' };
  const out = {};
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c, P.face === '#ffffff' ? P.win : P.face);
    out.newScrap = button(c.x + 8, c.y + 6, tw('New Scrap', 'button') + 18, btnH() - 2, 'New Scrap', { pressed: o.pressed === 0 });
    text(card.title, c.x + 10, c.y + 33, { font: headFont(), color: P.text });
    sep(c.x + 8, c.y + 48, c.w - 16);
    const p = panel(c.x + 8, c.y + 54, c.w - 16, c.h - 92);
    para(card.body, p.x + 6, p.y + 6, p.w - 12, { font: 'doc', color: P.text });
    if (card.source) text(card.source, p.x + 6, p.y + p.h - 14, { font: 'small', color: P.textDim });
    // the classic scrapbook footer: a scroll bar with "n / N" and the clip's type
    const fy = c.y + c.h - 32;
    hscroll(c.x + 8, fy, c.w - 16, ((o.n ?? 1) - 1) / Math.max(1, (o.of ?? 2) - 1), .5);
    text(`${o.n ?? 1} / ${o.of ?? 2}`, c.x + 10, fy + 20, { font: 'small', color: P.text });
    text(o.kind || 'TEXT', c.x + c.w - 10, fy + 20, { font: 'small', color: P.text, align: 'right' });
  });
  return { ...c, ...out };
};

// ---------------- Review Desk: drift into a model's voice ----------------
// opts: checks [{label, state: 'ok'|'flag'|'pending', note}], you (0..100, the "Sounds like: YOU" meter), reveal (0..1)
APP.reviewDesk = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'Review Desk', W_(o, { header: o.header ?? [`${o.words ?? 812} words`, o.doc || 'The Tide Comes In Twice', ''] }));
  if (!c) return null;
  const checks = o.checks || [{ label: 'Rhythm', state: 'ok', note: 'uneven, like a person' }, { label: 'Summary language', state: 'ok', note: 'none found' },
    { label: 'Personal detail', state: 'ok', note: 'kept, not flattened' }, { label: 'Press-release hedging', state: 'flag', note: '1 sentence' }];
  const out = { rows: [] };
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c);
    const rh = Math.max(18, lineH('body') + 5), n = Math.ceil(checks.length * clamp(o.reveal ?? 1));
    checks.slice(0, n).forEach((ck, i) => {
      const ry = c.y + 10 + i * rh;
      glyph(ck.state === 'pending' ? 'spin' : ck.state, c.x + 12, ry);
      text(ck.label, c.x + 28, ry, { font: 'body', color: P.text });
      if (ck.note) text(ck.note, c.x + c.w - 12, ry, { font: 'small', color: P.textDim, align: 'right' });
      out.rows.push({ x: c.x + 8, y: ry - 4, w: c.w - 16, h: rh });
    });
    const my = c.y + 14 + checks.length * rh;
    sep(c.x + 8, my, c.w - 16);
    const you = R(o.you ?? 97);
    const lbl = 'Sounds like: YOU ' + you + '%';
    text(lbl, c.x + 12, my + 12, { font: E.depth <= 4 ? 'ui' : headFont(), color: P.text });
    progress(c.x + 12, my + 30, c.w - 24, 12, you / 100);
    text(o.note ?? 'Your roughness is not a defect.', c.x + 12, my + 52, { font: 'small', color: P.textDim });
    out.meter = { x: c.x + 12, y: my + 30, w: c.w - 24, h: 12 };
  });
  return { ...c, ...out };
};

// ---------------- Searcher: the live web, as sources you choose ----------------
// opts: query, typing {text, t0, t1}, results [{title, url, snippet}], reveal (0..1), sel, pressed ('search'|0..2)
APP.searcher = (x, y, w, h, o = {}) => {
  const results = o.results || [];
  const shown = Math.floor(results.length * clamp(o.reveal ?? 1));
  const c = win(x, y, w, h, o.title || 'Searcher', W_(o, { header: o.header ?? ['Web Search', 'Automatic', `${shown} results`] }));
  if (!c) return null;
  const out = {};
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c, modernEra() ? P.face : P.win);
    const q = o.typing ? typed(o.typing.text, o.typing.t0, o.typing.t1) : (o.query ?? '');
    const caret = o.typing && T >= o.typing.t0 - .3 && T < o.typing.t1 + .6 ? 'solid' : false;
    out.field = textField(c.x + 8, c.y + 8, c.w - 92, 20, q, { caret, focus: !!caret || !!q, placeholder: 'Search the web' });
    out.search = button(c.x + c.w - 78, c.y + 9, 70, btnH(), 'Search', { def: true, pressed: o.pressed === 'search' });
    const ly = c.y + 38, lh = c.h - 38 - 34, p = panel(c.x + 8, ly, c.w - 16, lh);
    clipRect(p.x, p.y, p.w, p.h, () => {
      if (!shown) { bayer(p.x, p.y + 4, p.w, 34, E.depth === 1 ? .25 : .5, E.depth === 1 ? C.black : mix(P.win, P.text, .08), null); para('No Searcher results yet. Search the web, then open useful sources in Reader.', p.x + 10, p.y + 10, p.w - 20, { font: 'small', align: 'center', color: P.text }); }
      results.slice(0, shown).forEach((r, i) => {
        const ry = p.y + 4 + i * 38;
        if (o.sel === i) rect(p.x, ry - 2, p.w, 36, P.sel);
        text(r.title, p.x + 6, ry + 2, { font: E.depth <= 4 ? 'ui' : 'body', color: E.depth === 1 ? C.black : modernEra() ? '#1a4fc4' : '#000099' });
        text(r.url, p.x + 6, ry + 15, { font: 'small', color: E.depth === 1 ? C.black : '#287a2a' });
        text(r.snippet || '', p.x + 6, ry + 26, { font: 'small', color: P.textDim });
      });
    });
    out.buttons = ['Send To…', 'Clip', 'Reader'].map((b, i) => button(c.x + c.w - 8 - (3 - i) * 66, c.y + c.h - 26, 60, btnH() - 2, b, { pressed: o.pressed === i, disabled: !shown && i > 0, font: 'small' }));
  });
  return { ...c, ...out };
};

// ---------------- Question Sheet / Outline / Section Drafts / Note Pad ----------------
// questionSheet opts: items ['## Theme', '- a bullet', 'plain line'], typing {text, t0, t1} (appended bullet)
APP.questionSheet = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'Question Sheet', W_(o, { header: o.header ?? ['Question Sheet', '', 'Pour it all out first'], scroll: 'v', sk: 0, sfrac: .7 }));
  if (!c) return null;
  const items = (o.items || ['## Theme', '- What did the engineers call it?', '- Who paid, and when?', '## Raw questions', '- Is the moon the client or the clock?']).slice();
  if (o.typing) items.push('- ' + typed(o.typing.text, o.typing.t0, o.typing.t1) + '\u0001');
  const rows = [];
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c);
    let yy = c.y + 10; const lh = lineH('body') + 2;
    items.forEach(it => {
      if (it.startsWith('## ')) { yy += 3; text(it.slice(3), c.x + 10, yy, { font: headFont(), color: P.text }); yy += lineH(headFont()) + 2; return; }
      const bullet = it.startsWith('- '), s = it.replace(/^- /, '').replace('\u0001', ''), live = it.endsWith('\u0001');
      if (bullet) disc(c.x + 15, yy + R(capH('body') / 2), 1, P.text);
      for (const r of wrap(s, c.w - 40, 'body')) { const ww = text(r, c.x + 22, yy, { font: 'body', color: P.text }); rows.push({ x: c.x + 22, y: yy, w: ww }); if (live && caretOn()) rect(c.x + 23 + ww, yy - 2, 1, capH('body') + 4, P.text); yy += lh; }
    });
  });
  return { ...c, rows };
};
// outline opts: items [{text, level, open, done}], sel
APP.outline = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'Outline', W_(o, { header: o.header ?? ['Outline', '', `${(o.items || []).length || 6} parts`] }));
  if (!c) return null;
  const items = o.items || [{ text: 'The bill arrives by moonlight', level: 0, open: true }, { text: 'Who called it the tide', level: 1 }, { text: 'The 1966 report', level: 1 },
    { text: 'Both directions count', level: 0, open: true }, { text: 'Fill, empty, fill', level: 1 }, { text: 'What the turbines ignore', level: 1 }];
  const rows = [];
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c);
    const rh = Math.max(17, lineH('body') + 5);
    items.forEach((it, i) => {
      const ry = c.y + 8 + i * rh, ix = c.x + 10 + it.level * 18;
      if (o.sel === i) rect(c.x + 2, ry - 3, c.w - 4, rh, P.listSel);
      const col = o.sel === i ? P.listSelText : P.text;
      if (!it.level) arrowTri(ix, ry + (it.open ? 1 : -1), 4, it.open ? 'down' : 'right', col);
      else rect(ix + 2, ry + 3, 3, 3, col);
      text((it.level ? '' : (items.slice(0, i + 1).filter(z => !z.level).length) + '. ') + it.text, ix + 12, ry, { font: it.level ? 'body' : (E.depth <= 4 ? 'ui' : 'body'), color: col });
      if (it.done) glyph('ok', c.x + c.w - 20, ry);
      rows.push({ x: c.x, y: ry - 3, w: c.w, h: rh });
    });
  });
  return { ...c, rows };
};
// sectionDrafts opts: sections [names], sel, text (the draft), typing {text, t0, t1}
APP.sectionDrafts = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'Section Drafts', W_(o, { header: o.header ?? ['Section Drafts', '', 'Draft 3'] }));
  if (!c) return null;
  const secs = o.sections || ['The bill arrives', 'Both directions', 'The 1966 report', 'What the moon owes'], lw = Math.min(150, R(c.w * .36));
  const out = {};
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c, modernEra() ? '#f3f3f5' : P.win);
    if (E.chrome === 'glass') rrect(c.x + 4, c.y + 4, lw - 8, c.h - 8, 6, '#eef1f5');
    out.list = listRows(c.x + 4, c.y + 6, lw - 8, secs.map(s => ({ text: s, icon: 'sectionDrafts' })), { sel: o.sel ?? 0, font: 'small', rowH: 20 });
    vline(c.x + lw, c.y, c.h, E.depth === 1 ? C.black : P.rule);
    const ex = c.x + lw + 1, ew = c.w - lw - 1;
    rect(ex, c.y, ew, c.h, P.win);
    let s = o.text ?? 'They called it the tide, and they billed it by the moon. The first invoice is dated a full moon in 1966.';
    let live = false;
    if (o.typing) { s = s + ' ' + typed(o.typing.text, o.typing.t0, o.typing.t1); live = T < o.typing.t1 + 1; }
    const rows = wrap(s, ew - 20, 'doc'), lh = lineH('doc') + 1;
    rows.forEach((r, i) => { const ww = text(r, ex + 10, c.y + 10 + i * lh, { font: 'doc', color: P.text }); if (live && i === rows.length - 1 && (T < o.typing.t1 || caretOn())) rect(ex + 11 + ww, c.y + 8 + i * lh, 1, capH('doc') + 4, P.text); });
    out.editor = { x: ex, y: c.y, w: ew, h: c.h };
  });
  return { ...c, ...out };
};
// notePad opts: text, page (1..8), typing
APP.notePad = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'Note Pad', W_(o, { zoom: false }));
  if (!c) return null;
  clipRect(c.x, c.y, c.w, c.h, () => {
    const paper = E.depth === 1 ? C.white : E.chrome === 'board' ? '#fbf3d5' : modernEra() ? '#fff9c9' : '#ffffcc';
    fillClient(c, paper);
    let s = o.text ?? 'Remember: the moon is the clock, not the client.';
    if (o.typing) s += typed(o.typing.text, o.typing.t0, o.typing.t1);
    const rows = para(s, c.x + 10, c.y + 10, c.w - 24, { font: E.depth <= 4 ? 'geneva' : 'body', color: P.text });
    void rows;
    // the dog-eared corner and the page number
    const fx = c.x + c.w - 1, fy = c.y + c.h - 1;
    tri(fx - 14, fy, fx, fy, fx, fy - 14, E.depth === 1 ? C.white : darken(paper, .1)); line(fx - 14, fy, fx, fy - 14, P.text);
    text(String(o.page ?? 1), c.x + 8, c.y + c.h - 12, { font: 'small', color: P.text });
  });
  return c;
};

// ---------------- Finder windows: disks, the File Floppy, the Project CD ----------------
// finder opts: title, items [[icon, label], ...], sel, used (K), free (K), cols, open (index shown hatched/open)
APP.finder = (x, y, w, h, o = {}) => {
  const items = o.items || [['manuscript', 'Manuscript'], ['questionSheet', 'Question Sheet'], ['outline', 'Outline'], ['sectionDrafts', 'Section Drafts'], ['scrapbook', 'Scrapbook'], ['folder', 'Sources']];
  const c = win(x, y, w, h, o.title || 'Project Hard Disk', W_(o, { header: o.header ?? [`${items.length} items`, `${o.used ?? 2835}K in disk`, `${o.free ?? 45}K available`], scroll: o.scroll ?? 'vh', sk: 0, sfrac: 1, hfrac: 1 }));
  if (!c) return null;
  const out = { icons: [] }, gap = o.gap || 86, cols = o.cols || Math.max(1, Math.floor((c.w - 10) / gap));
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c);
    items.forEach((it, i) => {
      const ix = c.x + R(gap / 2) - 12 + (i % cols) * gap, iy = c.y + 10 + Math.floor(i / cols) * 62;
      const saved = E; const lbl = it[1];
      const r = finderIcon(ix, iy, it[0], lbl, { sel: o.sel === i, open: o.open === i });
      out.icons.push(r); void saved;
    });
  });
  return { ...c, ...out };
};
// an icon inside a window (labels sit on the window's paper, not the desktop)
function finderIcon(x, y, name, label, o = {}) {
  const one = ['mac1', 'mac7', 'next', 'plat', 'board'].includes(E.chrome);
  if (o.sel && !one) rrect(x - 3, y - 3, 38, 38, 4, '#d6d6d6');
  icon(name, x, y, { sel: o.sel && one, open: o.open });
  while (label.length > 4 && tw(label, 'label') > (o.maxW || 80)) label = label.slice(0, -2) + '…';
  const lw = tw(label, 'label'), lx = x + 16 - R(lw / 2), ly = y + 36;
  if (o.sel) { if (one) rect(lx - 2, ly - 2, lw + 4, capH('label') + 4, C.black); else rrect(lx - 3, ly - 2, lw + 6, capH('label') + 5, 3, P.listSel); }
  text(label, lx, ly, { font: 'label', color: o.sel ? (one ? C.white : P.listSelText) : P.text });
  return { x, y, w: 32, h: 32, cx: x + 16, cy: y + 16 };
}
// fileFloppy opts: items, ocr (0..1 progress of the OCR/transcription import), current (label being imported)
APP.fileFloppy = (x, y, w, h, o = {}) => {
  const items = o.items || [['document', 'scan-p12.pdf'], ['soundscape', 'interview.m4a'], ['document', 'tide-table.png'], ['chatFile', 'notes.txt']];
  const r = APP.finder(x, y, w, h, { title: 'File Floppy', items, used: o.used ?? 1302, free: o.free ?? 138, scroll: '', ...o, header: o.header ?? [`${items.length} items`, 'OCR + transcription', `${o.free ?? 138}K available`] });
  if (!r) return null;
  if (o.ocr != null && o.ocr < 1) { const py = r.y + r.h - 22; rect(r.x, py - 4, r.w, 26, P.win); text('Importing ' + (o.current || 'scan-p12.pdf') + '…', r.x + 10, py, { font: 'small', color: P.text }); progress(r.x + r.w - 130, py - 2, 120, 11, o.ocr); }
  return r;
};
// projectCD opts: burn (progress 0..1; omitted = indeterminate), doc (the manuscript's title), spin (bool)
APP.projectCD = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'Project CD', W_(o, { header: o.header ?? ['Project CD', '', o.burn >= 1 ? 'Finished' : 'Writing…'] }));
  if (!c) return null;
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c, modernEra() ? P.face : P.win);
    const r = Math.min(R(c.h * .36), 46), cx = c.x + 18 + r, cy = c.y + 12 + r;
    disc(cx, cy, r, E.depth === 1 ? C.black : '#9aa3ad');
    if (E.depth === 1) { for (let i = 0; i < 3; i++) ring(cx, cy, r - 3 - i * 6, C.white); }
    else { ell(cx, cy, r - 1, r - 1, '#dfe4ea'); const a = (o.spin === false ? 0 : T * 7); for (let i = 0; i < 4; i++) { const an = a + i * Math.PI / 2; for (let j = 6; j < r - 2; j += 2) rect(cx + R(Math.cos(an) * j), cy + R(Math.sin(an) * j), 2, 2, ['#f7a8c8', '#a8e0f7', '#f7eba8', '#c1f7a8'][i]); } }
    disc(cx, cy, R(r * .3), E.depth === 1 ? C.white : '#f4f6f8'); disc(cx, cy, 3, E.depth === 1 ? C.black : '#7a828c');
    const tx = cx + r + 16;
    text(o.doc || 'The Tide Comes In Twice', tx, c.y + 16, { font: headFont(), color: P.text });
    text(o.burn >= 1 ? 'Manuscript, sources, review: one disc.' : 'Writing manuscript, sources, review…', tx, c.y + 34, { font: 'small', color: P.textDim });
    progress(tx, c.y + 50, c.x + c.w - tx - 14, 12, o.burn ?? .4, { indeterminate: o.burn == null });
    text(o.burn >= 1 ? 'Ready to share' : o.burn == null ? '' : R(o.burn * 100) + '%', tx, c.y + 70, { font: 'small', color: P.text });
  });
  return c;
};

// ---------------- Two Floppies: the release gate ----------------
// opts: count (0..1 how much of the payload has been counted), bytes (default 2,902,645), budget (2,949,120), pass
APP.floppyMeter = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'Two Floppies', W_(o, { zoom: false, header: o.header ?? ['Release gate', '', 'boot payload'] }));
  if (!c) return null;
  const budget = o.budget ?? 2949120, bytes = R((o.bytes ?? 2902645) * clamp(o.count ?? 1)), disk = 1474560;
  const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c, modernEra() ? P.face : P.win);
    for (let i = 0; i < 2; i++) {
      const fx = c.x + 14 + i * 84, fy = c.y + 12, fill = clamp((bytes - i * disk) / disk);
      icon('fileFloppy', fx + 18, fy, { scale: 1 });
      const bx = fx, by = fy + 40;
      if (E.depth === 1) { frame(bx, by, 68, 10, C.black); rect(bx + 1, by + 1, R(66 * fill), 8, C.black); } else progress(bx, by, 68, 10, fill);
      text('Disk ' + (i + 1), bx, by + 16, { font: 'small', color: P.text });
    }
    const tx = c.x + 186;
    text(fmt(bytes), tx, c.y + 16, { font: E.depth <= 4 ? 'ui' : headFont(), color: P.text, scale: E.depth <= 4 ? 1 : 1 });
    text('of ' + fmt(budget) + ' bytes', tx, c.y + 34, { font: 'small', color: P.textDim });
    const pct = (bytes / budget * 100).toFixed(1) + '%';
    text(pct + ' of two 1.44 MB floppies', tx, c.y + 50, { font: 'small', color: P.text });
    const pass = o.pass ?? bytes <= budget;
    if ((o.count ?? 1) >= 1) text(pass ? 'Release gate: PASS' : 'Release gate: FAIL', tx, c.y + 68, { font: E.depth <= 4 ? 'ui' : 'body', color: E.depth === 1 ? C.black : pass ? '#1e7b34' : '#c0392b' });
    text('Heavy tools load lazily, from a third disk.', c.x + 14, c.y + c.h - 16, { font: 'small', color: P.textDim });
  });
  return c;
};

// ---------------- One More Tune: the white-label record ----------------
// opts: track (0..9 current position), done ([indices answered]), year, label (era name on the label), title, artist,
//       options ([strings]), answer (index marked right), wrong (index struck out), spin (default true), arm (0..1)
APP.oneMoreTune = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'One More Tune', W_(o, { body: E.depth === 1 ? C.white : '#14223a' }));
  if (!c) return null;
  const one = E.depth === 1, out = {};
  clipRect(c.x, c.y, c.w, c.h, () => {
    if (!one) { fillClient(c, '#0d1626'); vgrad(c.x, c.y, R(c.w * .45), c.h, ['#163a66', '#0d1d36', '#0b1322'], 3); } else fillClient(c, C.white);
    // the record
    const r = Math.min(R(c.h * .4), R(c.w * .17)), cx = c.x + 14 + r, cy = c.y + R(c.h / 2);
    if (!one) for (let i = 0; i < 48; i++) { const an = i / 48 * Math.PI * 2; rect(cx + R(Math.cos(an) * (r + 6)), cy + R(Math.sin(an) * (r + 6)), 1, 1, '#3d5d86'); }
    disc(cx, cy, r, C.black);
    for (let rr = r - 3; rr > r * .42; rr -= 3) ring(cx, cy, rr, one ? (rr % 6 ? '#000000' : '#555555') : '#1f1f1f');
    if (one) for (let rr = r - 4; rr > r * .45; rr -= 6) { for (let a = 0; a < 40; a++) { const an = a / 40 * Math.PI * 2; if (a % 2) rect(cx + R(Math.cos(an) * rr), cy + R(Math.sin(an) * rr), 1, 1, C.white); } }
    const ang = o.spin === false ? 0 : T * Math.PI * 2 * (33.3 / 60);
    for (let k = -2; k <= 2; k++) { const an = ang + k * .05; for (let j = R(r * .5); j < r - 2; j += 1) rect(cx + R(Math.cos(an) * j), cy + R(Math.sin(an) * j), 1, 1, one ? (k === 0 ? C.white : C.black) : '#3a3a3a'); } // the sheen sweeps round
    const lr = R(r * .4), lab = one ? C.white : (o.labelColor || '#1a8cff');
    disc(cx, cy, lr, lab); if (one) ring(cx, cy, lr, C.black);
    const tx = cx + R(Math.cos(ang + 1.2) * lr * .55), ty = cy + R(Math.sin(ang + 1.2) * lr * .55);
    rect(tx - 1, ty - 1, 3, 3, one ? C.black : '#ffffff'); // a mark on the label, so the spin reads
    text(String(o.year ?? 1988), cx, cy - R(lr * .45), { font: one ? 'chicago' : 'sfB', align: 'center', color: one ? C.black : C.white });
    if (o.label) text(o.label, cx, cy + R(lr * .25), { font: 'small', align: 'center', color: one ? C.black : C.white });
    disc(cx, cy, 2, one ? C.black : '#0b0b0b');
    // the tonearm
    const ax = cx + r + 14, ay = cy - r + 6, arm = clamp(o.arm ?? 1), tipx = R(lerp(ax + 4, cx + r * .72, arm)), tipy = R(lerp(ay + 60, cy + r * .2, arm));
    disc(ax, ay, 6, one ? C.black : '#c9ced6'); disc(ax, ay, 3, one ? C.white : '#5d6570');
    line(ax, ay, tipx, tipy, one ? C.black : '#d4d9e0', 3); rect(tipx - 4, tipy - 3, 8, 8, one ? C.black : '#2a2d33');
    out.record = { cx, cy, r };
    // the right side: ten track positions, the question, the answers
    const rx = c.x + R(c.w * .48), ink = one ? C.black : C.white, dim = one ? C.black : '#9aa7b8';
    text('A', rx, c.y + 14, { font: 'small', color: dim }); text('B', rx + 82, c.y + 14, { font: 'small', color: dim });
    for (let i = 0; i < 10; i++) {
      const dx = rx + 10 + (i % 5) * 13 + (i >= 5 ? 82 : 0), dy = c.y + 12, cur = i === (o.track ?? 0), dn = (o.done || []).includes(i);
      ovalFrame(dx, dy, 10, 10, cur ? (one ? C.black : '#1a8cff') : dim); if (cur || dn) oval(dx + 2, dy + 2, 6, 6, one ? C.black : cur ? '#1a8cff' : '#5d6b7d');
    }
    text(o.song || 'Which ad was this?', rx, c.y + 40, { font: one ? 'chicago' : 'sfBig', color: ink });
    if (o.artist) text(o.artist, rx, c.y + 66, { font: 'body', color: dim });
    const opts = o.options || [];
    out.options = [];
    opts.forEach((s, i) => {
      const oy = c.y + c.h - 30 - (opts.length - i) * 24, ow = c.x + c.w - 12 - rx;
      const right = o.answer === i, wrong = o.wrong === i;
      if (one) { rrect(rx, oy, ow, 20, 6, C.black); rrect(rx + 1, oy + 1, ow - 2, 18, 5, right ? C.black : C.white); }
      else { rrect(rx, oy, ow, 20, 7, right ? '#f4f6f8' : '#1b2638'); rframe(rx, oy, ow, 20, 7, right ? '#ffffff' : '#34445c'); }
      const col = one ? (right ? C.white : C.black) : right ? '#111111' : '#dfe6ef';
      text(String(i + 1), rx + 10, oy + 6, { font: 'small', color: one ? col : '#8796aa' });
      const lw = text(s, rx + 26, oy + 6, { font: 'body', color: col });
      if (wrong) hline(rx + 25, oy + 9, lw + 2, col);
      if (right) glyph('ok', rx + ow - 18, oy + 5);
      out.options.push({ x: rx, y: oy, w: ow, h: 20 });
    });
    out.next = button(rx, c.y + c.h - 26, c.x + c.w - 12 - rx, 20, 'Next tune', { def: false });
  });
  return { ...c, ...out };
};

// ---------------- Control Panel: Appearance (the twelve eras) ----------------
// opts: sel (era index or id), pressed ('apply'), scrollTo
APP.controlPanel = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'Appearance', W_(o, { zoom: false, header: o.header ?? ['Control Panel', '', 'Twelve appearances'] }));
  if (!c) return null;
  const sel = typeof o.sel === 'string' ? eraIndex(o.sel) : (o.sel ?? E.index), out = {};
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c, modernEra() ? P.face : P.win);
    const lw = R(c.w * .5), rh = Math.max(15, Math.min(18, R((c.h - 16) / 12)));
    const p = panel(c.x + 8, c.y + 8, lw, rh * 12 + 4);
    out.rows = [];
    APPEARANCES.forEach((e, i) => {
      const ry = p.y + i * rh, on = i === sel;
      if (on) { if (E.chrome === 'glass') rrect(p.x, ry, p.w, rh, 5, P.listSel); else rect(p.x, ry, p.w, rh, P.listSel); }
      const col = on ? P.listSelText : P.text;
      text(String(e.year), p.x + 6, ry + R((rh - capH('small')) / 2), { font: 'small', color: col });
      text(e.name + (e.branch ? '  (branch)' : ''), p.x + 40, ry + R((rh - capH('small')) / 2), { font: 'small', color: on ? col : e.branch ? P.textDim : col });
      out.rows.push({ x: p.x, y: ry, w: p.w, h: rh });
    });
    // a thumbnail of the selected appearance: its desktop, shrunk, with a tiny window
    const tx = c.x + lw + 20, tw2 = c.x + c.w - 10 - tx, th = R(tw2 * 9 / 16);
    frame(tx - 1, c.y + 9, tw2 + 2, th + 2, P.text);
    ctx.drawImage(eraThumb(APPEARANCES[sel].id), tx, c.y + 10, tw2, th);
    text(APPEARANCES[sel].year + '  ' + APPEARANCES[sel].name, tx, c.y + th + 20, { font: E.depth <= 4 ? 'ui' : 'body', color: P.text });
    text('The files and windows stay put.', tx, c.y + th + 36, { font: 'small', color: P.textDim });
    out.apply = button(c.x + c.w - 80, c.y + c.h - 28, 70, btnH(), 'Apply', { def: true, pressed: o.pressed === 'apply' });
  });
  return { ...c, ...out };
};
// eraThumb(id): a cached 160x90 picture of an era's desktop with a window and a menu bar
const _thumbs = {};
function eraThumb(id) {
  if (_thumbs[id]) return _thumbs[id];
  const saved = E;
  const big = offscreen(W, H, () => { setEra(id); desktop({}); win(60, 60, 300, 180, 'Manuscript', { noShadow: false }); win(260, 120, 240, 150, 'ClioTalk', {}); clio(420, 220, { scale: 3, expr: 'happy' }); menuBar({ app: 'TeachText', clock: false }); });
  setEra(saved);
  return _thumbs[id] = offscreen(160, 90, () => {
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(big, 0, 0, W, H, 0, 0, 160, 90); ctx.imageSmoothingEnabled = false;
    const d = ctx.getImageData(0, 0, 160, 90), px = d.data, one = ERA[id].depth === 1, step = one ? 255 : 24;
    for (let i = 0, p = 0; i < px.length; i += 4, p++) { const off = (BAYER4[((p / 160 | 0) & 3) * 4 + (p % 160 & 3)] + .5) / 16 * step; for (let ch = 0; ch < 3; ch++) px[i + ch] = clamp(Math.floor((px[i + ch] + off) / step) * step, 0, 255); if (one) px[i + 1] = px[i + 2] = px[i]; px[i + 3] = 255; }
    ctx.putImageData(d, 0, 0);
  });
}

// ---------------- DOOM: a tiny corridor, in the era's depth ----------------
// opts: walk (distance walked, e.g. T * 2), fire (0..1 muzzle flash), imp (0..1 how close the imp is), health, ammo
APP.doom = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'DOOM', W_(o, { body: C.black }));
  if (!c) return null;
  clipRect(c.x, c.y, c.w, c.h, () => {
    const one = E.depth === 1, hud = 16, vw = c.w, vh = c.h - hud, cx = c.x + R(vw / 2), cy = c.y + R(vh / 2);
    const wall = one ? [C.black, C.white] : ['#4a2a12', '#8a5a2a'], floor = one ? [C.black, C.white] : ['#2c2c2c', '#5a5a5a'], ceil = one ? [C.black, C.white] : ['#1a1a1a', '#3a3a3a'];
    rect(c.x, c.y, vw, vh, C.black);
    const ph = ((o.walk ?? T * 2) % 1 + 1) % 1, frames = [];
    for (let i = 0; i < 8; i++) { const d = i + 1 - ph, s = 1 / d; frames.push({ hw: R(vw / 2 * s * 1.1), hh: R(vh / 2 * s * 1.1), i, d }); }
    for (let i = frames.length - 1; i > 0; i--) {
      const a = frames[i - 1], b = frames[i], shade = clamp(1 - b.d / 8), lvl = (b.i + Math.floor(o.walk ?? T * 2)) % 2 ? shade : shade * .7;
      poly([[cx - a.hw, cy + a.hh], [cx + a.hw, cy + a.hh], [cx + b.hw, cy + b.hh], [cx - b.hw, cy + b.hh]], one ? C.black : floor[0]);
      poly([[cx - a.hw, cy + a.hh], [cx + a.hw, cy + a.hh], [cx + b.hw, cy + b.hh], [cx - b.hw, cy + b.hh]], bayerPat(lvl * .5, floor[1], floor[0]));
      poly([[cx - a.hw, cy - a.hh], [cx + a.hw, cy - a.hh], [cx + b.hw, cy - b.hh], [cx - b.hw, cy - b.hh]], bayerPat(lvl * .35, ceil[1], ceil[0]));
      poly([[cx - a.hw, cy - a.hh], [cx - b.hw, cy - b.hh], [cx - b.hw, cy + b.hh], [cx - a.hw, cy + a.hh]], bayerPat(lvl * .85, wall[1], wall[0]));
      poly([[cx + a.hw, cy - a.hh], [cx + b.hw, cy - b.hh], [cx + b.hw, cy + b.hh], [cx + a.hw, cy + a.hh]], bayerPat(lvl * .75, wall[1], wall[0]));
      if (b.i % 2 === 0) { vline(cx - b.hw, cy - b.hh, 2 * b.hh, one ? C.white : '#b07a3a'); vline(cx + b.hw, cy - b.hh, 2 * b.hh, one ? C.white : '#b07a3a'); }
    }
    // the imp, coming closer
    const imp = clamp(o.imp ?? .4), is = Math.max(1, R(1 + imp * 3)), sp = SPR.doom_imp;
    if (o.imp !== false) ctx.drawImage(one ? sp : recolor(sp, { '#000000': '#3a1a0a', '#ffffff': '#c8642a' }), cx - R(sp.width * is / 2), cy + R(vh * .08 * is) - sp.height * is + 8, sp.width * is, sp.height * is);
    // the gun, bobbing
    const bob = R(Math.abs(Math.sin((o.walk ?? T * 2) * Math.PI)) * 3), g = SPR.doom_gun;
    if ((o.fire || 0) > .05) { const fy = c.y + vh - 30 - bob, fr = R(3 + o.fire * 5), fc = one ? C.white : '#ffdd55'; poly([[cx, fy - fr * 2], [cx + fr, fy], [cx, fy + fr], [cx - fr, fy]], fc); poly([[cx - fr * 2, fy - 1], [cx + fr * 2, fy - 1], [cx, fy + 2]], fc); }
    ctx.drawImage(one ? g : recolor(g, { '#ffffff': '#9a9a9a' }), cx - g.width, c.y + vh - g.height * 2 + bob + 2, g.width * 2, g.height * 2);
    // HUD
    rect(c.x, c.y + vh, vw, hud, one ? C.white : '#5a5a5a'); hline(c.x, c.y + vh, vw, one ? C.black : '#8a8a8a');
    text('AMMO ' + (o.ammo ?? 50), c.x + 6, c.y + vh + 4, { font: 'small', color: one ? C.black : '#d82a2a' });
    text('HEALTH ' + (o.health ?? 100) + '%', c.x + R(vw / 2), c.y + vh + 4, { font: 'small', color: one ? C.black : '#d82a2a', align: 'center' });
    clio(c.x + vw - 22, c.y + vh - 4, { scale: 1, expr: 'surprised', pose: 'none', plain: true }); // Clio's face in the status bar
  });
  return c;
};
defSprite('doom_imp', `
..K....K..
..KK..KK..
...KKKK...
..KWKKWK..
..KKKKKK..
...KWWK...
.KKKKKKKK.
K.KKKKKK.K
K.KKKKKK.K
..KK..KK..
..KK..KK..
.KKK..KKK.`, { K: '#000000', W: '#ffffff' });
defSprite('doom_gun', `
....KK....
...KWWK...
...KWWK...
...KWWK...
..KKWWKK..
.KWWWWWWK.
.KWWKKWWK.
KWWWWWWWWK
KWWWWWWWWK`, { K: '#000000', W: '#ffffff' });

// ---------------- Micropolis: a little city grid ----------------
// opts: built (0..1 how built-up the city is), seed, cursor ([col, row] of the tool), tool ('R'|'C'|'I'|'#'|'~'), year
APP.micropolis = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'Micropolis', W_(o, { header: o.header ?? ['Funds $' + (20000 - R(clamp(o.built ?? .5) * 14000)), 'Pop. ' + R(clamp(o.built ?? .5) * 4800), (o.year ?? 1900) + ''] }));
  if (!c) return null;
  const one = E.depth === 1, ts = 8, tb = 22, gx = c.x + tb, cols = Math.floor((c.w - tb) / ts), rows = Math.floor(c.h / ts), seed = o.seed ?? 7, k = clamp(o.built ?? .5);
  clipRect(c.x, c.y, c.w, c.h, () => {
    rect(c.x, c.y, tb, c.h, one ? C.white : P.face); vline(c.x + tb - 1, c.y, c.h, one ? C.black : P.rule);
    ['R', 'C', 'I', '#', '~'].forEach((t, i) => { const bx = c.x + 3, by = c.y + 4 + i * 18; frame(bx, by, 15, 15, P.text); text(t, bx + 8, by + 4, { font: 'small', align: 'center', color: P.text }); if (o.tool === t) bayer(bx + 1, by + 1, 13, 13, .5, one ? C.black : '#3a7cf0', null); });
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const px = gx + i * ts, py = c.y + j * ts, river = Math.abs(i - (cols * .7 + Math.sin(j * .5) * 3)) < 1.6;
      if (river) { patfill(px, py, ts, ts, 'weave', one ? C.black : '#2a5db0', one ? C.white : '#4a85d8'); continue; }
      const road = i % 6 === 0 || j % 5 === 0, order = hash(i * 13.1 + j * 7.7 + seed), built = order < k;
      if (road && order < k + .25) { rect(px, py, ts, ts, one ? C.black : '#5a5a5a'); if (!one) { if (i % 6 === 0) vline(px + 3, py, ts, '#e8d25a'); else hline(px, py + 3, ts, '#e8d25a'); } else rect(px + 3, py + 3, 2, 2, C.white); continue; }
      patfill(px, py, ts, ts, 'dots', one ? C.black : '#5f8f3a', one ? C.white : '#7aa84a');
      if (built && !road) {
        const zone = 'RCI'[Math.floor(hash(i * 3.3 + j * 5.1) * 3)], zc = one ? C.white : { R: '#6ac46a', C: '#5a8ae8', I: '#e8c84a' }[zone];
        rect(px, py, ts - 1, ts - 1, zc); frame(px, py, ts - 1, ts - 1, one ? C.black : darken(zc, .4));
        if (order < k * .6) rect(px + 2, py + 2, 3, 3, one ? C.black : darken(zc, .55));
      }
    }
    if (o.cursor) { const [ci, cj] = o.cursor; dragOutline(gx + ci * ts - 1, c.y + cj * ts - 1, ts * 3 + 2, ts * 3 + 2, one ? C.black : C.white); }
  });
  return c;
};

// ---------------- About AI System 6 ----------------
// opts: memory bars [{name, kb, icon}], used (0..1 animates the bars)
APP.about = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'About AI System 6', W_(o, { zoom: false, scroll: '' }));
  if (!c) return null;
  const one = E.depth === 1;
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c, modernEra() ? P.face : P.win);
    const s = 3, mx = c.x + 14, my = c.y + 12;
    spr(markGlyphCanvas(), mx, my, { scale: s });
    text('AI System 6', mx + 13 * s + 12, my + 2, { font: E.depth <= 4 ? 'chicago' : headFont(), scale: E.depth <= 4 ? 2 : 1, color: P.text });
    text('1988 OBJECTS / 2026 INTELLIGENCE', mx + 13 * s + 12, my + 26, { font: 'small', color: P.text });
    text('A local-first writing desk. The AI never becomes your voice.', c.x + 14, c.y + 64, { font: 'small', color: P.textDim });
    sep(c.x + 10, c.y + 78, c.w - 20);
    const bars = o.memory || [{ name: 'TeachText', kb: 312, icon: 'teachText' }, { name: 'ClioTalk', kb: 220, icon: 'assistant' }, { name: 'Review Desk', kb: 268, icon: 'reviewDesk' }, { name: 'Searcher', kb: 180, icon: 'searcher' }, { name: 'System', kb: 1840, icon: 'systemFolder' }];
    text('Two floppies: 2,902,645 of 2,949,120 bytes', c.x + 14, c.y + 86, { font: 'small', color: P.text });
    const max = Math.max(...bars.map(b => b.kb)), bw = c.w - 190;
    bars.forEach((b, i) => {
      const by = c.y + 104 + i * 18;
      icon(b.icon, c.x + 14, by - 4, { size: 16 });
      text(b.name, c.x + 36, by, { font: 'small', color: P.text });
      text(b.kb + 'K', c.x + 150, by, { font: 'small', color: P.text, align: 'right' });
      const bx = c.x + 160, fillW = R(bw * b.kb / max * clamp(o.used ?? 1));
      if (one) { frame(bx, by - 2, bw, 10, C.black); patfill(bx + 1, by - 1, fillW, 8, 'gray', C.black, C.white); rect(bx + 1, by - 1, R(fillW * .6), 8, C.black); }
      else progress(bx, by - 2, bw, 10, b.kb / max * clamp(o.used ?? 1));
    });
  });
  return c;
};
function markGlyphCanvas() { const fam = E.chrome; return fam === 'aqua' || fam === 'metal' ? recolor(SPR.mark_floppy, { '#000000': '#1d4fb8', '#ffffff': '#a9cbff' }) : fam === 'board' ? recolor(SPR.mark_floppy, { '#000000': P.ink, '#ffffff': P.paper }) : SPR.mark_floppy; }

// ---------------- the Writing Bell: a gentle timer ----------------
APP.writingBell = (x, y, w, h, o = {}) => {
  const c = win(x, y, w, h, o.title || 'Writing Bell', W_(o, { zoom: false }));
  if (!c) return null;
  clipRect(c.x, c.y, c.w, c.h, () => {
    fillClient(c, modernEra() ? P.face : P.win);
    const left = Math.max(0, o.seconds ?? 25 * 60 - Math.floor(T)), mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
    text(mm + ':' + ss, c.x + c.w / 2, c.y + 12, { font: E.depth <= 4 ? 'chicago' : 'sfBig', scale: E.depth <= 4 ? 2 : 1, align: 'center', color: P.text });
    progress(c.x + 12, c.y + c.h - 22, c.w - 24, 10, 1 - left / (25 * 60));
  });
  return c;
};
