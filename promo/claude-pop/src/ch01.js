// ch01.js: boot and intro (0.00-12.00). One white pixel blinks with the boot chord, the negative Manuscript grows
// round it, Clio's first words ghost in, the pen drops in on its word and lands on the full stop, the raster writes
// the day side (the dot comes out vermilion), the drop: chat is an app for eight seconds (Save it. Clip it. Insert
// it. Export it.; Everything I say is temporary.), the four copies fly home, the signature move is planted on the chops.
'use strict';
{
  // ===================== THE HOME DESK (STORYBOARD §4, verbatim; names prefixed) =====================
  const c01_MS = ['# The Tide Comes In Twice', 'They never called it renewable energy. They called it the tide, and they billed it by the moon.', 'Twice a day the estuary fills'];
  const c01_INV = c => { const [r, g, b] = rgb(c); return hex(255 - r, 255 - g, 255 - b); };   // pre-invert a colour for FX.invert frames
  const c01_HINT = ['Sounds like you.', 'Sounds like a mouthpiece.'];   // Review Desk's lens hint, the product's words; never a number
  const c01_youProp = s => (x, y, w, h) => { const f = 'menu'; text(s, x + w, y + R((h - capH(f)) / 2), { font: f, align: 'right', color: P.menuText }); };
  let c01_PERIOD = [0, 0];   // the writer's full stop, screen coordinates, set by every homeDesk call
  // o: hint (HINT[0]), neg (true in FX.invert frames: the dot and the pen are pre-inverted), lines, doc (teachText opts or false;
  //    pass {status: 'Final'} from 63.75 on), msgs / actions / input / chat (clioTalk opts or false), clio (clio opts or false),
  //    cur ([x, y, kind]), menu, after (fn drawn between the windows and the pointer: gag windows go here, so the pen stays on top)
  function c01_homeDesk(t, o = {}) {
    const neg = !!o.neg, verm = neg ? c01_INV(FIELDS.vermilion) : FIELDS.vermilion;
    UI.menu = { app: 'AI System 6', prop: c01_youProp(o.hint || c01_HINT[0]), propW: 128, ...(o.menu || {}) };
    const doc = o.doc === false ? null : APP.teachText(8, 30, 268, 164, { title: 'Manuscript', lines: o.lines || c01_MS, ...(o.doc || {}) });
    if (doc) { const r = doc.rows[doc.rows.length - 1]; c01_PERIOD = [r.x + r.w + 1, r.y + capH('doc') - 1]; rect(c01_PERIOD[0], c01_PERIOD[1], 2, 2, verm); }
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
    return { doc, chat, period: c01_PERIOD };
  }
  const c01_hasScene = n => SCENES.some(s => s.name === n);   // guard before frameInto(…, 'chNN name')

  // ===================== times, all from the song (the only literal numbers are offsets) =====================
  const S_BOOT = section('boot'), S_INTRO = section('intro');
  const T_BOOT = hit('boot'), T_DROP = hit('drop'), T_PEN = hit('teaserPen');
  const L0 = lyric('boot'), L1 = lyric('i1'), L2 = lyric('i2');
  const T_PB0 = T_BOOT + SPB;                                   // the pull-back starts a beat in (the dot blinks two 8ths first)
  const T_REVEAL = L0.start;                                    // "I'm": the negative at 1:1, the sides open
  const T_WIPE = wordAt(L0, 'pal.').start;                      // "pal.": the raster writes the day side
  const T_LAND = T_PEN + SPB / 2;                               // the nib lands on the full stop
  const STEP = SPB / 10;                                        // one hard step of the pointer's lift (4 of them)
  const T_SHUT = evTimes('snare').filter(s => s >= T_DROP && s < S_INTRO.end).pop();   // the snare that shuts the big chat
  const T_TEMP = wordAt(L2, 'temporary.').start;                // the plate starts to go
  const L2T = { ...L2, words: L2.words.map(w => w.start === T_TEMP ? { ...w, end: T_TEMP + 3 / FPS } : w) };   // "temporary." types whole in 3 frames
  const T_FLICK = T_SHUT - SPB;                                 // the line is over: half a beat on the machine room before the shut
  const LX = 196, LY = 217;                                     // the 2x lens on the big chat: the plates' left ends to Clio's right edge
  const VERBS = ['Save', 'Clip', 'Insert', 'Export'];
  const T_PRESS = [wordAt(L1, 'it.').start, wordAt(L1, 'Clip').start, wordAt(L1, 'Insert').start, wordAt(L1, 'Export').start];
  const T_LANDS = T_PRESS.map(p => evTimes('snare').find(s => s > p));   // each copy lands on the next snare
  // where the copies land: icon, label, icon x y (the home desk's), lens key for the half-beat hop
  const ICONS = [['hardDisk', 'Project Hard Disk', 460, 22, 460, 40], ['scrapbook', 'Scrapbook', 336, 296, 336, 300], ['sectionDrafts', 'Section Drafts', 404, 296, 404, 300], ['projectDisc', 'Project CD', 466, 296, 466, 300]];
  const HOME_CHAT = { x: 8, y: 202, w: 268, h: 116 }, BIG_CHAT = { x: 8, y: 30, w: 268, h: 288 };
  const TXT0 = ["I'M JUST YOUR", 'PEN PAL.'], TYPED = 'Tighten it. Keep my words.';   // 26 keys, one per hat (16ths)
  const NEG = { era: 'system6', raw: true, screen: true };
  const c01_A = styleBuf('c01A'), c01_B = styleBuf('c01B');

  // ===================== local helpers =====================
  // the big chat's stack, from a dry render (cached): the replies hug the input; the whole stack sits in one 2x crop
  let c01_L = null;
  const c01_lay = () => c01_L || (c01_L = withEra('system6', () => {
    let c; offscreen(FW, FH, () => { c = APP.clioTalk(BIG_CHAT.x, BIG_CHAT.y, BIG_CHAT.w, BIG_CHAT.h, { k: 1, hero: false, input: '', placeholder: ' ', msgs: [] }); });
    const inp = c.input, X = c.x + 28, Wp = c.w - 32, P2 = { x: X, y: inp.y - 4 - 52, w: Wp, h: 52 }, PY = P2.y - 3 - 16, P1 = { x: X, y: PY - 3 - 74, w: Wp, h: 74 };
    let px = X; const pills = VERBS.map(v => { const w = tw(v, 'small') + 16, r = { x: px, w, cx: px + R(w / 2), cy: PY + 8 }; px += w + 8; return r; });
    return { inp, P1, P2, PY, pills, rest: [inp.x + inp.w - 24, inp.y + R(inp.h / 2)] };
  }));
  // the full stop of the 1988 Manuscript, screen coordinates, from a dry render (159, 137); cached once
  let c01_P0 = null;
  const c01_periodS = () => c01_P0 || (c01_P0 = withEra('system6', () => { let d; offscreen(FW, FH, () => { d = APP.teachText(8, 30, 268, 164, { title: 'Manuscript', lines: c01_MS }); }); const r = d.rows[d.rows.length - 1]; return [r.x + r.w + 1, r.y + capH('doc') - 1]; }));
  // negMs: the NEGATIVE Manuscript alone on black (a keyed stencil: white lines and type, the paper falls through), plus its white full stop
  const c01_negMs = () => { const P0 = c01_periodS(); silhouette(C.black, () => APP.teachText(8, 30, 268, 164, { title: 'Manuscript', lines: c01_MS }), { mode: 'stencil', invert: true, ink: C.white, key: 'c1-negms' }); rect(P0[0], P0[1], 2, 2, C.white); };
  // lens(t, keys): keys [[t, x, y, n]] in screen coordinates; the last key at or before t wins; the n x crop is CENTRED on (x, y),
  // kept inside the screen, in whole pixels (the kit's stepZoom keeps its point put: the point is solved for the crop). Call it last.
  const c01_lens = (t, keys) => {
    let k = null; for (const q of keys) if (q[0] <= t) k = q;
    if (!k || k[3] <= 1) return k;
    const n = k[3], s = screenSize(t), cw = Math.ceil(FW / n), chh = Math.ceil(FH / n);
    const cx = clamp(R(k[1] + s.x - cw / 2), s.x, s.x + s.w - cw), cy = clamp(R(k[2] + s.y - chh / 2), s.y, s.y + s.h - chh);
    const fix = v => { let z = R(v * n / (n - 1)); while (z - Math.floor(z / n) > v) z--; while (z - Math.floor(z / n) < v) z++; return z; };
    stepZoom(n, fix(cx) - s.x, fix(cy) - s.y);
    return k;
  };
  // the writer's rig: the pointer at (cx, cy) holds the cord, the pen hangs with its nib at (nx, ny) (the home desk's own lines)
  const c01_rig = (t, cx, cy, nx, ny, down) => { penCord([[cx + 5, cy + 15], [nx, ny - 37]], { sag: 6, swing: 3, t }); pen(nx, ny, Math.PI / 2, 1, { t }); CUR = { x: cx, y: cy, kind: 'arrow', down }; };
  // nibRipple: the ripple loop of bellRing without the icon: rings from the nib for a couple of frames
  const c01_nibRipple = (x, y, t0, col, t = T, frames = 2) => { const d = t - t0; if (d < 0 || d >= frames / FPS) return; const r = 5 + Math.floor(d * FPS) * 3; for (const sd of [-1, 1]) for (let j = -2; j <= 2; j++) rect(x + sd * r + R(-j * j * sd), y + j * 3 - 1, 2, 2, col); };
  // ghostPlate: Clio's words live on this until kept: a 50% dither (o.lvl), marching ants on 8ths, a TEMPORARY tag in the corner
  const c01_ghostPlate = (x, y, w, h, o = {}) => {
    const t = o.t ?? T, lvl = o.lvl ?? .5;
    rect(x, y, w, h, C.white); if (lvl > 0) bayer(x, y, w, h, lvl, C.black, null);
    if (o.ants !== false) {
      const ph = Math.floor(beatAt(t) * 2) & 3, per = 2 * (w + h) - 4;
      for (let i = 0; i < per; i++) {
        if (((i + ph) & 3) > 1) continue;
        const p = i < w ? [x + i, y] : i < w + h - 1 ? [x + w - 1, y + i - w + 1] : i < 2 * w + h - 2 ? [x + 2 * w + h - 3 - i, y + h - 1] : [x, y + per - i];
        rect(p[0], p[1], 1, 1, C.black);
      }
    }
    if (o.tag !== false) { const s = 'TEMPORARY', tw_ = tw(s, 'geneva') + 6; rect(x + w - tw_ - 3, y - 4, tw_, 11, C.black); text(s, x + w - tw_, y - 2, { font: 'geneva', color: C.white }); }
  };
  // thin(fn, rect, lvl): fn's drawing kept only in 2x2 cells of an ordered dither at lvl (the letters of a reply dissolving)
  const c01_thin = (fn, x, y, w, h, lvl) => {
    const b = styleBuf('c01T', w, h);
    paintInto(b, () => { ctx.translate(-x, -y); fn(); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = bayerPat(lvl, C.black, null); ctx.fillRect(0, 0, Math.ceil(w / 2), Math.ceil(h / 2)); });
    ctx.drawImage(b, x, y);
  };
  // scribble(hand, dir, n): THE SCRIBBLE, desk size: n whole-pixel zigzags written in the air from the mitten (12 px tall at 2x)
  const c01_scribble = ([hx, hy], d, n) => { const pts = [[hx, hy]]; for (let i = 1; i <= 2 * n; i++) pts.push([hx + 6 * i * d, hy - 6 - (i & 1 ? 6 : 0) - 2 * i]); path(pts, C.white, 6); path(pts, C.black, 3); };
  // the chop that is sounding at t: [t, dur, 'pen' | 'pal'] or null (the raw EVENTS list: the kit's normaliser drops the word)
  const CHOPS = ((typeof EVENTS !== 'undefined' && EVENTS.chopWord) || []).map(e => [+e[0], +e[1], String(e[2]).toLowerCase()]).sort((a, b) => a[0] - b[0]);
  const c01_chop = t => { let r = null; for (const e of CHOPS) { if (e[0] > t) break; r = e; } return r && t < r[0] + r[1] ? r : null; };
  // Clio on the desk, with the signature mime on the chops: the inverted PEN / PAL tag in her balloon, the point-up scribble, the wave
  // flip: she turns to the big chat and steps 16 px in (so the 2x crop holds her whole); bob: the kick, 2 px then 1 px
  const c01_clio = (t, flip) => {
    const ch = c01_chop(t), word = ch ? ch[2] : null, isPen = word === 'pen', kf = flip ? evFrames('kick', t) : 9;
    const cl = clio(flip && t >= T_DROP + SPB / 2 ? 270 : 286, 196 + (kf < 2 ? 2 : kf < 4 ? 1 : 0), { scale: 3, mouth: ch ? { open: 1, shape: isPen ? 'E' : 'A' } : 'sing', expr: 'sing', flip, look: flip ? [1, 0] : [0, 0], ...(ch ? (isPen ? { pose: 'point', point: 'up' } : { pose: 'wave' }) : {}) });
    if (!ch) return cl;
    const fr = Math.floor((t - ch[0]) * FPS + 1e-6), s = word.toUpperCase(), w = tw(s, 'chicago') + 8, tx = cl.mouth[0] - R(w / 2), ty = cl.mouth[1] - 36 - (fr < 2 ? 1 : 0);
    frame(tx - 1, ty - 1, w + 2, 15, C.white); rect(tx, ty, w, 13, C.black); text(s, tx + 4, ty + 2, { font: 'chicago', color: C.white });
    if (isPen) c01_scribble(cl.hand, flip ? -1 : 1, 3);
    return cl;
  };

  // ===================== ch01 boot (0-4): the pixel, the negative, the first words, the pen, the raster =====================
  scene('ch01 boot', S_BOOT.start, T_DROP, t => {
    const PS = c01_periodS(), sc = screenSize(t), PF = [PS[0] + sc.x, PS[1] + sc.y];   // the full stop in frame coordinates (223, 146)
    const PTR0 = [PS[0] + 1 - 9, -4];   // where the raster will find the pointer: at the top edge, the cord's owner
    if (t < T_PB0) {   // black; one white pixel where the full stop will be, blinking with the chord on the 8ths
      rect(0, 0, FW, FH, C.black);
      const e8 = Math.floor((t - T_BOOT) / (SPB / 4));
      if (e8 % 2 === 0) rect(PF[0], PF[1], 1, 1, C.white);   // 1x1, no rays: the cross waits for vermilion
      return;
    }
    if (t < T_REVEAL) {   // the pull-back, reversed in time: the dot stays, the negative Manuscript grows round it, white on black
      pullBack(T_PB0, T_REVEAL, [{ draw: c01_negMs, px: PF[0], py: PF[1], pw: 2, ...NEG }], { t: T_PB0 + T_REVEAL - t, dotAt: PF, dotColor: C.white, dotWeight: .5, anchor: false, hitFX: false });
      return;
    }
    // "I'm": the negative at 1:1, the sides open; the window never moves again
    ctx.drawImage(frameInto(c01_A, t, c01_negMs, NEG), 0, 0);
    invertFrame(T_REVEAL, 1); splitPal(2, T_REVEAL, 3, [C.white, C.black]);
    // Clio's first words in the black right of the window: each arrives on its note as white ghost dither and stays ghost
    // (nothing was kept): one pass draws every word ghost, a second hides the unsung ones under solid black
    const TY = { fit: 372, x: 268, y: 256, align: 'left', valign: 'middle' };
    bigType(TXT0, { ...TY, words: { words: L0.words.map(w => ({ ...w, start: 1e9 })) }, ghost: true, color: C.white });
    bigType(TXT0, { ...TY, words: { words: L0.words.map(w => ({ ...w, start: w.start <= t ? 1e9 : -1e9 })) }, color: C.black });
    // the riser [3,4]: a 1 px white write-head line along the top, filling on 16ths
    const rs = evSpan('riser', t);
    if (rs) rect(0, 0, R(FW * Math.floor(prog(t, rs[0], rs[1]) * 8 + 1e-6) / 8), 1, C.white);
    // "pal.": the raster writes the positive desk top-down in interlaced bands round the pen; the dot comes out vermilion
    if (t >= T_WIPE) scanWipe(T_WIPE, T_DROP, tt => { if (c01_hasScene('ch01 drop')) ctx.drawImage(frameInto(c01_B, tt, 'ch01 drop'), 0, 0); }, { band: 4 });
    // "pen": the white pen drops in from the top edge on its cord, 8 px a frame, and its nib lands on the full stop with a white ring
    if (t >= T_PEN) {
      const NF = R((T_LAND - T_PEN) * FPS), fr = Math.floor((t - T_PEN) * FPS + 1e-6), nx = PF[0] + 1, ny = PF[1] - 1 - 8 * Math.max(0, NF - fr);
      penCord([[PTR0[0] + 5 + sc.x, PTR0[1] + 15 + sc.y], [nx, ny - 37]], { sag: 6, swing: 3, t });
      pen(nx, ny, Math.PI / 2, 1, { t });
      c01_nibRipple(nx, PF[1], T_LAND, C.white, t);
      c01_nibRipple(nx, PF[1], T_WIPE + 3 * SPB / 4, FIELDS.vermilion, t, 3);   // the stop resolves vermilion: the one colour arrives
      invertFrame(T_PEN, 1);
    }
  }, { raw: true });

  // ===================== ch01 drop (4-12): chat is an app; the four buttons; everything I say is temporary; the mime =====================
  scene('ch01 drop', T_DROP, S_INTRO.end, t => {
    const PS = c01_periodS(), big = t < T_SHUT, k = prog(t, T_DROP, T_DROP + 4 * STEP), lifted = t >= T_DROP + 4 * STEP;
    const LY_ = c01_lay(), { P1, P2, PY } = LY_, PL0 = LY_.pills[0];
    const sendHit = t > T_LANDS[3] + SPB / 2 && evFrames('snare', t) < 2;   // snares with no landing: Send blinks
    c01_homeDesk(t, {
      clio: false, doc: big && k >= 1 ? false : undefined, chat: big && k >= 1 ? false : undefined,
      after: () => {
        if (big) {   // ClioTalk zooms from its home rect to the whole left column: for eight seconds chat is the whole left column
          const c = APP.clioTalk(BIG_CHAT.x, BIG_CHAT.y, BIG_CHAT.w, BIG_CHAT.h, { k, from: HOME_CHAT, hero: false, input: '', placeholder: ' ', msgs: [], sendPressed: sendHit });
          if (c) {
            const inp = c.input;
            // reply 1: SOLID Chicago 2x typed word by word on a temporary plate
            c01_ghostPlate(P1.x, P1.y, P1.w, P1.h, { t });
            kara(L1, P1.x + 8, P1.y + 5, { mode: 'type', font: 'chicago', scale: 2, maxW: 214, lh: 22, color: C.black, outline: C.white, caret: t < L1.end });
            // the four pills under it; the pressed one on its verb; they grey out one per 8th as the second reply goes
            const pressed = T_PRESS.findIndex(tp => t >= tp && t < tp + 4 / FPS);
            LY_.pills.forEach((q, i) => button(q.x, PY, q.w, 16, VERBS[i], { pressed: pressed === i, disabled: t >= T_TEMP + i * SPB / 2, font: 'small' }));
            // reply 2: typed solid on its plate ("temporary." pops in whole on its onset); on "temporary." the plate thins 50% -> 25% -> 12% -> 6% -> gone on the 8ths, the letters
            // with it in 2x2 cells (it was never kept); the TEMPORARY tag is the last pixel to leave
            if (t >= L2.start) {
              const fi = t < T_TEMP ? -1 : Math.floor((t - T_TEMP) / (SPB / 2) + 1e-6), PL = [.5, .25, .12, .06], LL = [1, .5, .25, .12];
              const words = () => kara(L2T, P2.x + 8, P2.y + 5, { mode: 'type', font: 'chicago', scale: 2, maxW: 222, lh: 24, color: C.black, outline: C.white, caret: t < L2.end });
              if (fi < 4) { c01_ghostPlate(P2.x, P2.y, P2.w, P2.h, { t, lvl: fi < 0 ? .5 : PL[fi] }); if (fi < 1) words(); else c01_thin(words, P2.x, P2.y, P2.w, P2.h, LL[fi]); }
              else if (t < T_TEMP + 4 * SPB / 2 + 2 / FPS) c01_ghostPlate(P2.x, P2.y, P2.w, P2.h, { t, lvl: 0, ants: false });
            }
            // the writer's line, one solid key per hat into the input, retyped every two bars
            const bar0 = barTime(Math.floor(barAt(t) / 2) * 2);
            typeLine(TYPED, bar0, bar0 + 8 * SPB, null, { x: inp.x + 4, y: inp.y + R((inp.h - capH('small')) / 2), font: 'small', color: C.black, paper: C.white });
            // on each verb a COPY of the plate lifts off its pill, flies and lands on the next snare as a close-zoom into its icon:
            // a copy was kept (the lens hops to the icon a 16th early, so the arrival is in frame)
            T_PRESS.forEach((tp, i) => {
              const tl = T_LANDS[i], [, , ix, iy] = ICONS[i], cw = 76, chh = 18, q = LY_.pills[i];
              if (t < tp + 4 / FPS || t >= tl) return;   // the pressed pill shows its 4 frames, then the copy comes off it
              const to = { x: ix - 22, y: iy + 7, w: cw, h: chh };
              if (t < tl - SPB / 5) {
                const [x, y] = track(t, [[tp + 4 / FPS, q.x, PY - 1], [tp + SPB / 5, q.x + 10, PY - 6], [tl - SPB / 5, to.x, to.y]]);
                rect(x, y, cw, chh, C.white); frame(x, y, cw, chh, C.black); dragOutline(x - 2, y - 2, cw + 4, chh + 4);
                text(VERBS[i] + ' it.', x + 4, y + 4, { font: 'chicago', color: C.black });
              } else zoomRects(to, { x: ix, y: iy, w: 32, h: 32 }, prog(t, tl - SPB / 5, tl));
            });
          }
        } else zoomRects(BIG_CHAT, HOME_CHAT, prog(t, T_SHUT, T_SHUT + 4 * STEP) * (t < T_SHUT + 4 * STEP ? 1 : 0));   // the snare: the big chat zooms shut; the Manuscript is back
        // the landings: the icon inverts two frames; the Project CD spins up in four
        // (the landing icon is redrawn, label and all, through its lens hop, so its label sits over its neighbour's)
        T_LANDS.forEach((tl, i) => {
          const fr = Math.floor((t - tl) * FPS + 1e-6), [name, label, ix, iy] = ICONS[i];
          if (fr >= 0 && t < tl + SPB / 2) deskIcon(ix, iy, name, label, { sel: fr < 2 });
          if (i === 3 && fr >= 2 && fr < 6) { const wd = [14, 4, 14, 32][fr - 2]; ctx.drawImage(deskCanvas(E.id), ix, iy, 32, 32, ix, iy, 32, 32); ctx.drawImage(iconCanvas(name, 32), ix + R((32 - wd) / 2), iy, wd, 32); }
        });
        c01_clio(t, big);   // she turns to the chat while it is up (the mime's scribble lands over the window's edge)
      },
    });
    // the writer: at the drop the pointer lifts from the full stop straight to the Save pill in four hard steps; it presses each
    // pill on its verb, rests on the chat input while the writer types, and glides home on the last beat before the shut
    if (!lifted) {
      const q = t < T_DROP ? 0 : Math.min(1, (Math.floor((t - T_DROP) / STEP + 1e-6) + 1) / 4), PTR0 = [PS[0] + 1 - 9, -4];
      c01_rig(t, R(lerp(PTR0[0], PL0.cx, q)), R(lerp(PTR0[1], PL0.cy, q)), R(lerp(PS[0] + 1, PL0.cx + 9, q)), R(lerp(PS[1] - 1, PL0.cy + 74, q)), false);
    } else {
      const RS = LY_.rest, m = mousePath(t, [[T_DROP + 4 * STEP, PL0.cx, PL0.cy], ...T_PRESS.map((tp, i) => [tp, LY_.pills[i].cx, LY_.pills[i].cy, 'click']), [T_LANDS[3], RS[0], RS[1]], [T_SHUT - SPB / 2, RS[0], RS[1]], [T_SHUT, 300, 24]]);
      c01_rig(t, m.x, m.y, m.x + 9, m.y + 74, m.down);
    }
    // the drop: a pixel-sort smear for two frames and a one-frame invert
    invertFrame(T_DROP, 1); pixelSort(16, 220, T_DROP, 2);
    // the lens: 1x for the drop, 2x on the big chat from the off-beat; a 16th before each landing snare a hop to the icon, back on
    // the next 8th; when the line is over, half a beat on the machine room (Clio, drive B, the eject drive's kick); 1x from the shut
    c01_lens(t, [[T_DROP + SPB / 2, LX, LY, 2], ...T_LANDS.flatMap((tl, i) => [[tl - SPB / 4, ICONS[i][4], ICONS[i][5], 2], [tl + SPB / 2, LX, LY, 2]]), [T_FLICK, 352, 212, 2], [T_SHUT, 0, 0, 1]]);
  }, { era: 'system6', screen: true });
}
