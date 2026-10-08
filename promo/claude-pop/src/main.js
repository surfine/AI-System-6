// main.js: the frame loop, the render.mjs contract and the preview player.
// Every frame is a pure function of song time t: pick the scene, set its era, paint the desktop, run the scene,
// add the dock, the menu bar and overlays, then the pointer, then the whole-frame FX.
'use strict';

const QS = new URLSearchParams(location.search);
// the scene covering t (the latest-starting one wins where scenes overlap)
function sceneAt(t) {
  let best = null;
  for (const s of SCENES) if (t >= s.t0 && t < s.t1 && (!best || s.t0 > best.t0 || (s.t0 === best.t0 && s.order > best.order))) best = s;
  return best;
}
// eraFor(scene, t) -> {to, from, k, style}: opts.era is an id, a function of t, or keyframes [[t, id], ...] (song time;
// with opts.eraLocal the key times are seconds from the scene start). Keyframe changes morph over opts.morph seconds.
function eraFor(s, t) {
  if (QS.get('era')) return { to: QS.get('era') };
  let e = s.opts.era, dur = s.opts.morph ?? .5, style = s.opts.morphStyle || 'dissolve';
  if (!e) { e = songEraKeys(); dur = s.opts.morph ?? .35; }       // no era given: follow the song's schedule (data.js ERAS)
  if (typeof e === 'string') return { to: e };
  if (typeof e === 'function') { const r = e(t, t - s.t0); return typeof r === 'string' ? { to: r } : r; }
  const off = s.opts.eraLocal ? s.t0 : 0;
  let i = 0; while (i < e.length - 1 && t >= e[i + 1][0] + off) i++;
  const key = e[i], st = key[0] + off;
  if (i > 0 && t < st + dur && t >= st) return { from: e[i - 1][1], to: key[1], k: prog(t, st, st + dur), style: key[2] || style };
  if (i === 0 && t < st) return { to: key[1] };
  return { to: key[1] };
}
const eraNow = (t = T) => { const s = sceneAt(t); return s ? eraFor(s, t).to : 'system6'; };

// VIEW: where the screen sits inside the frame while a scene with opts.screen draws (style.js screenSize); {0, 0} otherwise
let VIEW = { x: 0, y: 0 };
// resetCtx(): back to the main canvas with a clean state. resetCtx(true) keeps the current target (so a whole scene can be
// rendered into an offscreen canvas: style.js frameInto) and only resets its transform (to the screen offset) and state.
function resetCtx(keep) {
  if (!keep) ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, VIEW.x, VIEW.y); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
}
// screenFor(scene, t) -> the screen rect a scene draws in (opts.screen: true = screenSize(t), a rect, or fn(t) -> rect), or null
function screenFor(s, t) {
  const o = s.opts.screen;
  if (!o || typeof screenSize !== 'function') return null;
  return o === true ? screenSize(t) : typeof o === 'function' ? o(t) : o;
}
// withScreen(rect, fn, clear): draw fn inside the screen rect, with W x H = the screen's size and (0, 0) at its top-left
// (clear: paint the whole frame black first, the bars)
function withScreen(r, fn, clear) {
  if (!r) return fn();
  ctx.setTransform(1, 0, 0, 1, 0, 0); if (clear) rect(0, 0, FW, FH, C.black);
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  VIEW = { x: r.x, y: r.y }; W = r.w; H = r.h; ctx.setTransform(1, 0, 0, 1, r.x, r.y);
  try { return fn(); } finally { ctx.restore(); VIEW = { x: 0, y: 0 }; W = FW; H = FH; ctx.setTransform(1, 0, 0, 1, 0, 0); }
}
function drawScene(s, t, era) {
  setEra(era);
  UI = { menu: { ...(s.opts.menu || {}) }, dock: s.opts.dock, overlays: [] }; CUR = null;
  ctx.save();
  if (!s.opts.raw) desktop(s.opts);
  if (!s.opts.era && songEraEntry(t).inverted) FX.invert = true;  // the schedule's '(inverted)' entries; a scene may unset it
  s.fn(t, t - s.t0, s.t1 - s.t0);
  ctx.restore(); resetCtx(true);
  if (!s.opts.raw) {
    if (UI.dock !== false && (E.dock || E.chrome === 'next')) dock(typeof UI.dock === 'object' && UI.dock ? UI.dock : {});
    if (UI.menubar !== false && s.opts.menubar !== false) menuBar(UI.menu || {});
  }
  for (const f of UI.overlays || []) { ctx.save(); f(); ctx.restore(); }
}
function draw(t) {
  T = t; FX = {}; VIEW = { x: 0, y: 0 }; W = FW; H = FH; resetCtx();
  const s = sceneAt(t);
  if (!s) { rect(0, 0, W, H, C.black); return null; }
  const er = eraFor(s, t), scr = screenFor(s, t), paint = era => withScreen(scr, () => drawScene(s, t, era), true);
  if (er.from && er.k < 1) {
    paint(er.from);
    const before = snap(4);
    FX = {};
    paint(er.to);
    transition(before, er.k, er.style);
  } else paint(er.to);
  if (CUR) withScreen(scr, () => pointer(CUR.x, CUR.y, CUR.kind || 'arrow', CUR));
  if (scr) {   // the screen's black bars (and their punch-off), and FX points given in screen coordinates
    screenBars(scr);
    for (const k of ['zoomAt', 'stepZoomAt']) if (FX[k]) FX[k] = [FX[k][0] + scr.x, FX[k][1] + scr.y];
  }
  applyFX(t);
  return s;
}
function stamp(label) { // a time/scene tag in the corner (contact sheets and the preview HUD)
  setEra('system6');
  const w = tw(label, 'monaco') + 8;
  rect(W - w - 2, H - 15, w, 13, C.black); text(label, W - w + 2, H - 12, { font: 'monaco', color: '#7cff7c' });
}

async function boot() {
  const fontLoads = Object.values(FONTS).map(f => document.fonts.load(f.css, 'Hg09').catch(() => null));
  preloadIcons();
  await Promise.all(fontLoads);
  await document.fonts.ready;
  initFonts();
  await Promise.all(_loading);
  for (const k in DESKTOPS) deskCanvas(k); // paint every wallpaper once, up front
  metalTexture();
  for (const e of APPEARANCES) eraThumb(e.id);   // the Control Panel thumbnails, built up front (no first-use spike)
  for (const k of ['dissolve', 'bayer', 'wipe', 'blinds', 'iris', 'checker']) _thresholds(k);
  if (typeof styleWarm === 'function') styleWarm();   // style.js: the floods' shapes and every dance pose, built up front
  SCENES.sort((a, b) => a.t0 - b.t0 || a.order - b.order);
  window.SONG_INFO = { missing: SONG_MISSING, scripts: MISSING.slice(), scenes: SCENES.length, dur: DUR, bpm: BPM };
  window.DUR = DUR; // the render.mjs contract reads DUR; make it a window property whether or not data.js declared it

  window.renderFrame = t => { draw(t); return cv.toDataURL('image/png').slice(22); };
  window.renderSheet = (times, cols) => {
    const c = Object.assign(document.createElement('canvas'), { width: cols * W, height: Math.ceil(times.length / cols) * H }), g = c.getContext('2d');
    times.forEach((t, i) => {
      const s = draw(t);
      resetCtx(); stamp(t.toFixed(2) + '  ' + (s ? s.name : '-') + '  ' + (s ? eraFor(s, t).to : ''));
      g.drawImage(cv, (i % cols) * W, Math.floor(i / cols) * H);
    });
    return c.toDataURL('image/png').slice(22);
  };
  window.renderCheck = (t0, t1) => {
    const errors = []; let n = 0, max = 0, maxT = 0, sum = 0;
    for (let t = t0; t < t1; t += 1 / FPS, n++) {
      const a = performance.now();
      try { draw(t); } catch (e) { if (errors.length < 12) errors.push(t.toFixed(3) + ': ' + e.message); resetCtx(); }
      const d = performance.now() - a; sum += d; if (d > max) { max = d; maxT = t; }
    }
    return { frames: n, errors, avgMs: +(sum / Math.max(1, n)).toFixed(2), maxMs: +max.toFixed(1), maxAt: +maxT.toFixed(2) };
  };
  window.READY = true;
  if (QS.has('render')) return;
  preview();
}

// The preview loop below reads performance.now() for its wall clock (play/pause, seeking). That is player state, not
// drawing: draw(t) stays a pure function of song time. renderCheck uses it only to time frames.
function preview() {
  // space = play/pause · arrows = seek 1 s (shift: 5 s) · , . = one frame · h = HUD · ?t=12.5 starts there
  // ?specimen = the toolkit reel · ?era=aqua = force an era. Works without build/song.wav (a silent clock runs).
  const song = document.getElementById('song'), hud = document.getElementById('hud');
  let audioOK = false, vt = clamp(+QS.get('t') || 0, 0, DUR), playing = false, last = performance.now();
  song.addEventListener('canplay', () => { if (!audioOK) { audioOK = true; song.currentTime = vt; } });
  song.addEventListener('error', () => { audioOK = false; });
  song.preload = 'auto'; song.src = 'build/song.wav';
  const now = () => audioOK ? song.currentTime : vt;
  const seek = t => { t = clamp(t, 0, DUR); vt = t; if (audioOK) song.currentTime = t; };
  const toggle = () => { playing = !playing; if (audioOK) { if (playing) song.play().catch(() => { audioOK = false; }); else song.pause(); } };
  addEventListener('keydown', e => {
    if (e.key === ' ') toggle();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') seek(now() + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1));
    else if (e.key === ',' || e.key === '.') { if (playing) toggle(); seek(now() + (e.key === ',' ? -1 : 1) / FPS); }
    else if (e.key === 'h') hud.classList.toggle('off');
    else if (e.key === 'Home') seek(0);
    else return;
    e.preventDefault();
  });
  cv.addEventListener('click', toggle);
  (function loop() {
    const ms = performance.now(), dt = (ms - last) / 1000; last = ms;
    if (!audioOK && playing) { vt += dt; if (vt >= DUR) { vt = DUR; playing = false; } }
    if (audioOK) playing = !song.paused;
    const t = now();
    let s = null;
    try {
      s = draw(t);
      const ln = lineAt(t), sec = sectionAt(t);
      hud.textContent = t.toFixed(2) + ' s   bar ' + (Math.floor(barAt(t)) + 1) + '.' + (Math.floor(beatAt(t)) % 4 + 1) + '   ' + (s ? s.name : '-') + '   ' + E.name + ' ' + E.year +
        (sec ? '   [' + sec.name + ']' : '') + (playing ? '' : '   (space to play)') + (audioOK ? '' : '   (no song.wav: silent clock)') + (ln ? '\n“' + ln.text + '”' : '') +
        (SONG_MISSING ? '\n(data/data.js not found: placeholder timings)' : '');
    } catch (e) { hud.textContent = t.toFixed(2) + '  ' + (s ? s.name : '') + '  ERROR: ' + e.message; console.error(e); }
    requestAnimationFrame(loop);
  })();
}
boot();
