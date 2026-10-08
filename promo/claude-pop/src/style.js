// style.js: the STYLE KIT. KINETIC PIXEL × SILHOUETTE (VISION.md), on top of the toolkit:
//   1. silhouette mode: silhouette(field, fn) on a flat neon field, keep/cut-outs, and the transitions into and out of
//      it (inkFlood from the pen tip, scanWipe on 16ths)
//   2. clioDance: Clio as a big black dancer with cut-out eyes and a singing mouth, a pose per beat
//   3. the white pen and its long stepped cord (the only white things in silhouette mode)
//   4. bigType: Chicago at its native pixel size, scaled by whole numbers into posters
//   5. hard beat FX (invertFrame, rgbSplit, pixelSort, punch / stepZoom, scan, posterize) and beatFX(t) presets
//   6. the one-take camera: frameInto, diveInto (the pixel dive), pullBack (through nested eras to a dot), and the
//      screen that grows with history (screenSize, scene opt `screen: true`)
//   7. the desk is the band: an instrument you can see for every sound, each driven by data.js EVENTS
// Rules as everywhere: integer pixels, no smoothing, no alpha blends, a pure function of song time.
'use strict';

// =====================================================================================================
// Fields. One flat neon colour per chorus; the writer's vermilion and the pen's white are reserved.
// =====================================================================================================
const FIELDS = { magenta: '#ff2e88', lime: '#b6ff00', cyan: '#00e5ff', vermilion: '#ff5a36', white: '#ffffff', ink: '#000000' };
const FIELD_OF = { chorus1: 'magenta', post1: 'lime', chorus2: 'lime', post2: 'magenta', chorus3: 'cyan', outro: 'magenta' };
const fieldCol = f => FIELDS[f] || f || FIELDS.magenta;
// fieldAt(t) -> the silhouette field of the section at t ('#rrggbb'), or null in desk mode (verses, pre-choruses, bridge)
function fieldAt(t = T) { const s = sectionAt(t); return s && FIELD_OF[s.name] ? FIELDS[FIELD_OF[s.name]] : null; }
const silOn = (t = T) => !!fieldAt(t);

// style buffers: full-frame (or small) canvases reused every frame. read = true for the ones read back per pixel.
const _sbufs = {};
function styleBuf(name, w = FW, h = FH, read = false) {
  let c = _sbufs[name];
  if (!c || c.width !== w || c.height !== h) { c = _sbufs[name] = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d', read ? { willReadFrequently: true } : undefined).imageSmoothingEnabled = false; }
  return c;
}
// paintInto(canvas, fn): clear the canvas and run fn with every helper drawing into it (the scene's coordinates)
function paintInto(c, fn) {
  return offscreen(c.width, c.height, () => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, c.width, c.height); fn(); }, c);
}
const _pack = c => { const v = rgb(c); return (0xff000000 | (v[2] << 16) | (v[1] << 8) | v[0]) >>> 0; };

// =====================================================================================================
// 1. Silhouette mode
// silhouette(field, fn, o) paints the flat field, runs fn into a buffer and lays it down as pure black.
//   o.mode 'solid' (default: every pixel fn drew is ink) | 'stencil' (light pixels become ink, dark ones fall through to
//   the field: a window keeps its frame lines, title stripes and text as neon cut-outs) · o.thr (stencil luma, .5) ·
//   o.invert (stencil the other way) · o.ink (black) · o.bg: false (no field fill: silhouette onto what is there) ·
//   o.keep: fn drawn on top in its true colours · o.key: a name for a STATIC drawing (the desk's windows): the result is
//   cached and later frames cost one drawImage (a stencil is a per-pixel pass, ~10 ms; keep animated things out of it).
// Inside fn: pen() and penCord() keep their white automatically (deferred on top); silKeep(fn) does the same for anything;
// silCut(fn) erases (fn(colour) draws with the colour it is given), so the field shows through.
// =====================================================================================================
const SIL = { active: false, field: null, keeps: null };
const _silCache = new Map();
function silhouette(field, fn, o = {}) {
  const fc = fieldCol(field), ink = o.ink || C.black;
  if (o.bg !== false) rect(0, 0, W, H, fc);
  if (!fn) return fc;
  const stencil = o.mode === 'stencil', ck = o.key != null ? [o.key, E.id, W, H, ink, o.mode, o.thr, o.invert].join('|') : null;
  let c = ck ? _silCache.get(ck) : null;
  if (!c) {
    c = styleBuf(stencil ? 'silS' : 'sil', FW, FH, stencil); const keeps = [];
    const saved = { active: SIL.active, field: SIL.field, keeps: SIL.keeps };
    Object.assign(SIL, { active: true, field: fc, keeps });
    try { paintInto(c, fn); } finally { Object.assign(SIL, saved); }
    const g = c.getContext('2d');
    if (stencil) {
      const w = Math.min(W, FW), h = Math.min(H, FH), d = g.getImageData(0, 0, w, h), u = new Uint32Array(d.data.buffer), thr = (o.thr ?? .5) * 255000, INK = _pack(ink), inv = !!o.invert;
      for (let i = 0; i < u.length; i++) { const v = u[i]; if ((v >>> 24) < 128) { u[i] = 0; continue; } u[i] = (_lum32(v) >= thr) !== inv ? INK : 0; }
      g.putImageData(d, 0, 0);
    } else { g.globalCompositeOperation = 'source-in'; g.fillStyle = ink; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over'; }
    if (ck) { // a static silhouette: keep a copy (and its keeps) for every later frame
      const copy = offscreen(FW, FH, () => ctx.drawImage(c, 0, 0)); copy._keeps = keeps;
      if (_silCache.size > 32) _silCache.delete(_silCache.keys().next().value);
      _silCache.set(ck, c = copy);
    } else c._keeps = keeps;
  }
  ctx.drawImage(c, 0, 0);
  for (const k of c._keeps || []) k();
  if (o.keep) o.keep();
  return fc;
}
const silKeep = fn => { if (SIL.active) SIL.keeps.push(fn); else fn(); };
function silCut(fn, colour) { // a cut-out: erased inside silhouette() (the field shows), drawn in `colour` (default: the field) outside
  if (!SIL.active) return fn(colour || fieldAt() || FIELDS.magenta);
  const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'destination-out';
  try { fn(C.black); } finally { ctx.globalCompositeOperation = op; }
}

// ---- the transitions into and out of silhouette mode ----
// inkFlood(t0, t1, cx, cy, drawB, o): drawB floods over the frame from (cx, cy) (the pen tip) as hard-edged pixel ink:
// fingers, splatter that lands ahead of the front, a wet white lip on the edge. Before t0 nothing is drawn; from t1
// drawB is drawn whole. Call it last (in overlay() to flood over the menu bar and dock too). The flood is complete on t1:
// put t1 on the downbeat. o: block (px of an ink pixel, 4), seed, edge ([lip colour, rim colour]), edgeW (px), drain (the
// reverse: drawB shows OUTSIDE a blob that shrinks back into the pen tip, for leaving silhouette mode), ease, steps (n:
// the flood moves in n hard steps, one per frame when t1 - t0 = n frames: the reel floods in 10 frames onto the downbeat).
const _floodMaps = new Map();
function _angWave(th, seed, ks) { let v = 0, a = 0; for (const [k, amp] of ks) { v += amp * Math.sin(k * th + hash(seed * 17.3 + k) * 6.283); a += amp; } return v / a; }
function _floodMap(cx, cy, block, seed) {
  const key = [R(cx), R(cy), block, seed].join(','); let m = _floodMaps.get(key);
  if (m) return m;
  const mw = Math.ceil(FW / block), mh = Math.ceil(FH / block), a = new Float32Array(mw * mh), drops = [];
  for (let j = 0; j < 46; j++) { const ang = hash(seed + j * 3.1) * 6.283, dist = 24 + hash(seed + j * 7.7) * 420, r = 2.5 + hash(seed + j * 1.3) * (4 + dist / 26) * (j % 3 ? .6 : 1.2); drops.push([cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist * .9, r, dist]); }
  const nd = drops.length, D = new Float64Array(drops.flat());
  const N = 2048, lutB = new Float32Array(N), lutF = new Float32Array(N);   // the edge's shape round the circle, tabulated
  for (let i = 0; i < N; i++) { const th = i / N * 6.2832 - 3.1416; lutB[i] = _angWave(th, seed, [[3, 1], [5, .8], [7, .6], [11, .4], [17, .25]]); const f = Math.max(0, _angWave(th, seed + 9, [[9, 1], [14, .7], [23, .5]]) - .25); lutF[i] = .9 * f * f; }
  let max = 0;
  for (let by = 0; by < mh; by++) for (let bx = 0; bx < mw; bx++) {
    const px = bx * block + block / 2, py = by * block + block / 2, dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy), li = Math.min(N - 1, Math.floor((Math.atan2(dy, dx) + 3.1416) / 6.2832 * N));
    let v = d / (1 + .16 * lutB[li] + lutF[li] * Math.min(1, d / 60));
    for (let j = 0; j < nd; j++) { const r = D[j * 4 + 2], ax = px - D[j * 4], ay = py - D[j * 4 + 1]; if (ax > r || ax < -r || ay > r || ay < -r) continue; const dd = Math.sqrt(ax * ax + ay * ay), dist = D[j * 4 + 3]; if (dd < r) v = Math.min(v, dist * .78 + dist * .22 * dd / r); }
    a[by * mw + bx] = v; if (v > max && bx * block < FW && by * block < FH) max = v;
  }
  m = { a, mw, mh, max, block };
  if (_floodMaps.size > 24) _floodMaps.clear();
  _floodMaps.set(key, m); return m;
}
function inkFlood(t0, t1, cx, cy, drawB, o = {}) {
  const t = o.t ?? T, k = prog(t, t0, t1), drain = !!o.drain;
  if (k <= 0) return 0;
  if (k >= 1) { drawB(t); return 1; }
  FX.wiping = true;
  const kq = o.steps ? Math.min(1, (Math.floor(k * o.steps + 1e-6) + 1) / o.steps) : k;
  const block = o.block || 4, m = _floodMap(cx, cy, block, o.seed ?? 7), kk = (o.ease || (x => 1 - (1 - x) ** 2.2))(drain ? 1 - kq : kq), r = kk * m.max * 1.02;
  const [lip, rim] = o.edge || [C.white, C.black], ew = (o.edgeW ?? 2 * block);
  const mc = styleBuf('flM', m.mw, m.mh, true), ec = styleBuf('flE', m.mw, m.mh, true), mg = mc.getContext('2d'), eg = ec.getContext('2d');
  const md = mg.createImageData(m.mw, m.mh), ed = eg.createImageData(m.mw, m.mh), mu = new Uint32Array(md.data.buffer), eu = new Uint32Array(ed.data.buffer);
  const LIP = _pack(lip), RIM = rim ? _pack(rim) : 0;
  for (let i = 0; i < m.a.length; i++) {
    const v = m.a[i], inside = v <= r;
    mu[i] = inside !== drain ? 0xffffffff : 0;
    if (inside && v > r - ew) eu[i] = drain ? (v > r - ew / 2 ? LIP : RIM) : v > r - ew / 2 ? RIM || LIP : LIP;
  }
  mg.putImageData(md, 0, 0); eg.putImageData(ed, 0, 0);
  const b = styleBuf('flB');
  paintInto(b, () => drawB(t));
  const g = b.getContext('2d');
  g.globalCompositeOperation = 'destination-in'; g.drawImage(mc, 0, 0, m.mw * block, m.mh * block); g.globalCompositeOperation = 'source-over';
  ctx.drawImage(b, 0, 0);
  ctx.drawImage(ec, 0, 0, m.mw * block, m.mh * block);
  return k;
}
// scanWipe(t0, t1, drawB, o): drawB replaces the frame in scanline bands, interlaced (even bands sweep down, then the odd
// ones), the sweep stepping on 16ths with a white write-head on the newest bands. o: band (4 px), div (4 = 16ths; 0 =
// continuous), dir ('down' | 'up'), edge (colour of the write-head; null for none).
function scanWipe(t0, t1, drawB, o = {}) {
  const t = o.t ?? T; let k = prog(t, t0, t1);
  if (k <= 0) return 0;
  if (k >= 1) { drawB(t); return 1; }
  FX.wiping = true;
  const div = o.div ?? 4;
  if (div) { const n = Math.max(1, R((beatAt(t1) - beatAt(t0)) * div)), q = k * n, s = Math.floor(q); k = (s + easeOut(clamp((q - s) * 2.5))) / n; }
  const b = styleBuf('scB'); paintInto(b, () => drawB(t));
  const band = o.band || 4, nb = Math.ceil(H / band), up = o.dir === 'up', half = Math.ceil(nb / 2);
  const order = i => { const j = up ? nb - 1 - i : i; return (j & 1) * half + (j >> 1); }, lim = k * nb, edge = o.edge === undefined ? C.white : o.edge;
  for (let i = 0; i < nb; i++) {
    const ob = order(i); if (ob >= lim) continue;
    const y = i * band, h = Math.min(band, H - y);
    if (edge && ob >= lim - Math.max(2, nb / 16)) rect(0, y, W, h, edge); else ctx.drawImage(b, 0, y, W, h, 0, y, W, h);
  }
  return k;
}

// =====================================================================================================
// 2. clioDance(x, y, scale, t, o): Clio as a dancing silhouette. (x, y) = the ground point between her feet; scale = an
// integer pixel size: 7-8 is the hero (about 200-230 px tall, cropped by the frame edge), 3-4 a supporting dancer. She
// keeps her signature: the speech-balloon body with its kinked tail (the desk Clio's tail, pointing down-left), chunky
// limbs and mitten hands. Twelve extreme poses, each a different shape with the face blacked out (crouch, pencil, Fever
// point, YOU, pirouette, star jump, deep lean, hip throw, high kick, vogue, robot box, split), one per beat, squash on
// the beat and stretch after it, a ground line under her feet. A 2 px halo in the field colour keeps her readable where
// she crosses black type or windows. Poses come from 2-bar phrases (no pose twice in a row) and from the music: a jump
// on crashes and stabs, pointCam on "you", pointUp on "pen", the split on "do".
// o: pose (force one of DANCE_POSES) with p (hold its phase 0..1) · field (the cut-out and halo colour: default fieldAt(t)
//    or magenta) · ink (black) · rim (false | a colour: the halo, default the field) · rimW (halo px, 2) · mouth ('sing' |
//    0..1 | {open, shape}) · voice · eyes (force) · face: false (no cut-outs: the shape test) · flip · steps (8 stop-motion
//    steps per beat; 0 = smooth) · squash (true) · ground (true | a colour: the ground line) · shadow (a bar under a jump)
//    · lyric: false (no word-driven poses) · seed. Returns {x, y, w, h, hands, head, feet, pose}.
// =====================================================================================================
const DANCE_POSES = ['bounce', 'clap', 'pointUp', 'pointCam', 'spin', 'jump', 'shimmy', 'disco', 'kick', 'vogue', 'robot', 'cheer'];
// 2-bar phrases, one pose per beat, never the same pose twice in a row (across the phrase seam too)
const DANCE_PHRASES = [
  ['bounce', 'clap', 'disco', 'pointUp', 'shimmy', 'kick', 'spin', 'jump'],
  ['robot', 'vogue', 'bounce', 'pointCam', 'kick', 'clap', 'shimmy', 'cheer'],
  ['disco', 'bounce', 'robot', 'pointUp', 'spin', 'vogue', 'kick', 'jump'],
  ['shimmy', 'clap', 'bounce', 'disco', 'robot', 'pointCam', 'spin', 'cheer'],
  ['kick', 'robot', 'vogue', 'clap', 'pointUp', 'shimmy', 'bounce', 'jump'],
];
const DU = { W: 96, H: 96, GY: 88, CX: 48, thigh: 6, shin: 6, upper: 8, fore: 7, arm: 3, leg: 4 };   // the unit canvas and limb sizes
// dancePose(t, o) -> {name, p (0..1 within the beat), s (side ±1), beat}
function dancePose(t = T, o = {}) {
  const b = Math.floor(beatAt(t)), p = beatPhase(t), s = (b & 1) ? 1 : -1;
  if (o.pose) return { name: o.pose, p: o.p ?? p, s, beat: b };
  const bar = Math.floor(barAt(t)), inBar = clamp(Math.floor((barAt(t) - bar) * 4), 0, 3);
  let name = DANCE_PHRASES[Math.floor(hash(Math.floor(bar / 2) * 3.7 + (o.seed || 0)) * DANCE_PHRASES.length)][(bar & 1) * 4 + inBar];
  if (o.lyric !== false) {
    const ln = lineAt(t), w = ln && wordNow(t, ln), wf = w ? _fold(w.w) : '';
    if (wf === 'you') name = 'pointCam'; else if (wf === 'pen') name = 'pointUp'; else if (wf === 'do') name = 'cheer';
  }
  for (const ch of ['crash', 'stab']) { const d = evSince(ch, t); if (d < SPB * .9) return { name: 'jump', p: clamp(d / (SPB * .9)), s, beat: b }; }
  return { name, p, s, beat: b };
}
// a pose -> the skeleton (units). Arms and legs: [shoulder|hip, elbow|knee] in radians from hanging straight down,
// positive = outward and up (PI = straight up); the second angle is relative to the first.
function _poseSpec(name, p, s) {
  const u = Math.sin(Math.PI * p), PI = Math.PI;
  const sp = { dx: 0, dy: 0, tilt: 0, bw: 22, bh: 17, arms: [[.35, .2], [.35, .2]], legs: [[.1, 0], [.1, 0]], face: 'front', fdir: 1, eyes: 'dot', hands: ['mitt', 'mitt'], air: false, mouthO: 0, hipX: 4 };
  const L = s < 0 ? 0 : 1, O = 1 - L;   // the leading side alternates every beat
  switch (name) {
    case 'bounce': {       // CROUCH: a deep frog squat on the beat (knees wide, fists low), half up between beats
      const d = p < .5 ? 1 : 1 - (p - .5) * 1.2;
      sp.bw = 22 + R(3 * d); sp.bh = 17 - R(3 * d); sp.hipX = 5;
      sp.legs = [[.25 + .95 * d, -.35 - 1.7 * d], [.25 + .95 * d, -.35 - 1.7 * d]];
      sp.arms = [[.75 + .3 * d, -.9 * d], [.75 + .3 * d, -.9 * d]]; sp.eyes = d > .8 ? 'happy' : 'dot'; break;
    }
    case 'clap': {         // PENCIL: stretched tall on tiptoe, arms straight up, the hands meet overhead on the beat
      const c = p < .3;
      sp.bw = 19; sp.bh = 20; sp.hipX = 3; sp.dy = -2;
      sp.arms = c ? [[PI + .3, .62], [PI + .3, .62]] : [[PI - .05, .45], [PI - .05, .45]];
      sp.legs = [[0, 0], [0, 0]]; sp.eyes = c ? 'happy' : 'dot'; sp.mouthO = c ? 2 : 0; break;
    }
    case 'pointUp': {      // FEVER: one arm stabs the sky on the diagonal, the other fist on the hip, the hip thrown out
      sp.arms[L] = [2.55, 0]; sp.hands[L] = 'point';
      sp.arms[O] = [1.05, -2.25];
      sp.tilt = .2 * (L ? 1 : -1); sp.legs[L] = [.05, 0]; sp.legs[O] = [.55, -1.05];
      sp.eyes = 'happy'; sp.dy = p < .12 ? 1 : 0; break;
    }
    case 'pointCam': {     // YOU: leaning in, a huge mitten pointing out of the frame at you, the other fist on the hip
      sp.bw = 24; sp.bh = 19; sp.arms[L] = [1.75, .25]; sp.hands[L] = 'cam'; sp.arms[O] = [1.05, -2.25];
      sp.tilt = .12 * (L ? 1 : -1); sp.eyes = 'wink'; sp.legs = [[.5, 0], [.5, 0]]; sp.hipX = 5; break;
    }
    case 'spin': {         // PIROUETTE: side-on (the face kept), one foot tucked to the knee, arms in a ring overhead; turns each half beat
      const back = p >= .5; sp.face = 'side'; sp.fdir = (back ? -1 : 1) * s; sp.bw = 14; sp.bh = 19; sp.hipX = 2;
      sp.arms = [[2.75, 1.25], [2.75, 1.25]];
      const tuck = sp.fdir > 0 ? 0 : 1; sp.legs[tuck] = [1.25, -2.6]; sp.legs[1 - tuck] = [0, 0];
      sp.eyes = 'happy'; sp.dy = -1; break;
    }
    case 'jump': {         // STAR JUMP: airborne on the hits, arms and legs flung into an X
      const h = Math.sin(PI * clamp(p * 1.15)); sp.air = h > .05; sp.dy = -R(16 * h);
      sp.legs = [[.5 + .3 * h, 0], [.5 + .3 * h, 0]]; sp.arms = [[2.3 + .25 * h, 0], [2.3 + .25 * h, 0]]; sp.hands = ['mitt', 'mitt'];
      sp.eyes = 'happy'; sp.mouthO = h > .3 ? 3 : 0; sp.bh = 17 + (h > .5 ? 2 : 0); sp.bw = 22 - (h > .5 ? 2 : 0); break;
    }
    case 'shimmy': {       // DEEP LEAN: the whole body tipped over, arms out in one straight line, shoulders on the 16ths
      const sh = Math.floor(p * 4) & 1 ? 1 : 0, d = L ? 1 : -1;
      sp.tilt = (.5 + .05 * sh) * d; sp.arms = [[PI / 2 + .1, 0], [PI / 2 + .1, 0]];
      sp.legs[L] = [.85, -1.1]; sp.legs[O] = [.75, 0]; sp.hipX = 5; sp.eyes = 'happy'; sp.dx = d * 2; break;
    }
    case 'disco': {        // HIP THROW: one arm points down across the floor, the other curls over the head
      sp.arms[L] = [.85, 0]; sp.hands[L] = 'point'; sp.arms[O] = [PI - .25, 1.35];
      sp.tilt = -.22 * (L ? 1 : -1); sp.legs[L] = [.6, 0]; sp.legs[O] = [.15, -.75]; sp.hipX = 5; sp.eyes = 'happy'; break;
    }
    case 'kick': {         // HIGH KICK: the kicking leg out level with the hip, arms out in a T for balance
      const k = clamp(Math.sin(PI * clamp(p * 1.5 + .15)));
      sp.legs[L] = [.3 + 1.35 * k, -.15 * k]; sp.legs[O] = [.08, 0];
      sp.arms = [[PI / 2, .1], [PI / 2, .1]]; sp.tilt = -.24 * k * (L ? 1 : -1); sp.eyes = k > .5 ? 'happy' : 'dot'; break;
    }
    case 'vogue': {        // VOGUE: a flat hand over the head, the other arm dead straight out, the legs crossed
      sp.arms[L] = [PI - .2, 1.55]; sp.arms[O] = [PI / 2 - .05, 0]; sp.hands[O] = 'flat';
      sp.legs[L] = [-.3, 0]; sp.legs[O] = [.4, 0]; sp.tilt = .16 * (L ? 1 : -1); sp.eyes = 'wink'; break;
    }
    case 'robot': {        // ROBOT BOX: right angles everywhere, knees out square, the forearms swapping on the 16ths
      const q = Math.floor(p * 4) & 1;
      sp.arms = [[PI / 2, q ? PI / 2 : -PI / 2], [PI / 2, q ? -PI / 2 : PI / 2]];
      sp.legs = [[PI / 2 - .1, -PI / 2 + .1], [PI / 2 - .1, -PI / 2 + .1]]; sp.hipX = 5; sp.eyes = 'flat'; sp.dx = q ? 1 : -1; break;
    }
    case 'cheer': {        // YOU DO!: down into the full split on the beat, arms up in a V
      const d = p < .6 ? 1 : 1 - (p - .6) * 1.5;
      sp.legs = [[PI / 2 * d + .3 * (1 - d), 0], [PI / 2 * d + .3 * (1 - d), 0]]; sp.hipX = 3;
      sp.arms = [[2.45, 0], [2.45, 0]]; sp.hands = ['point', 'point']; sp.eyes = 'happy'; sp.mouthO = 3; sp.sideTail = d > .5; break;
    }
  }
  return sp;
}
const _danceC = new Map();
const _rot = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; };
function _limb(x0, y0, x1, y1, w) { // a thick Bresenham limb stamped with w x w squares (corners nipped from 4 up: rounder)
  x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, o = w >> 1, nip = w >= 4;
  let err = dx - dy;
  for (let n = 0; n < 200; n++) {
    if (nip) { ctx.fillRect(x0 - o, y0 - o + 1, w, w - 2); ctx.fillRect(x0 - o + 1, y0 - o, w - 2, w); } else ctx.fillRect(x0 - o, y0 - o, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; }
  }
}
// the skeleton in unit coordinates, standing on the ground line (GY): body, joints, hands, feet
function _danceGeom(sp) {
  const { GY, CX } = DU, bw = sp.bw, bh = sp.bh, a = sp.tilt;
  const leg = (cx, cy) => [0, 1].map(i => {
    const sd = i ? 1 : -1, l = sp.legs[i], [hx, hy] = _rot(cx + sd * sp.hipX, cy + bh / 2 - 1, cx, cy, a);
    const kx = hx + sd * DU.thigh * Math.sin(l[0]), ky = hy + DU.thigh * Math.cos(l[0]);
    return { hx, hy, kx, ky, fx: kx + sd * DU.shin * Math.sin(l[0] + l[1]), fy: ky + DU.shin * Math.cos(l[0] + l[1]) };
  });
  let cx = CX + sp.dx, cy = 0, legs = leg(cx, cy);
  const low = Math.max(legs[0].fy, legs[1].fy, cy + bh / 2 + 1);   // the lowest point: a foot, or the seat in a split
  cy += GY - 3 - low + sp.dy;
  legs = leg(cx, cy);
  const sh = [_rot(cx - bw / 2 + 1.5, cy - 1, cx, cy, a), _rot(cx + bw / 2 - 1.5, cy - 1, cx, cy, a)];
  const arms = sp.arms.map((ar, i) => {
    const sd = i ? 1 : -1, [sx, sy] = sh[i], a1 = ar[0] + sd * a, ex = sx + sd * DU.upper * Math.sin(a1), ey = sy + DU.upper * Math.cos(a1);
    const a2 = a1 + ar[1]; return { sx, sy, ex, ey, hx: ex + sd * DU.fore * Math.sin(a2), hy: ey + DU.fore * Math.cos(a2), a2, sd };
  });
  return { cx, cy, x0: cx - bw / 2, y0: cy - bh / 2, legs, arms };
}
// the puppet at unit size (cached by everything that changes it)
function _dancePuppet(sp, mouth, ink, hole, eraseHoles, face = true) {
  const key = JSON.stringify([sp, mouth, ink, hole, eraseHoles, face]);
  let c = _danceC.get(key);
  if (c) return c;
  const anchors = {}, g = _danceGeom(sp);
  c = offscreen(DU.W, DU.H, () => {
    const { cx, cy, x0, y0 } = g, bw = sp.bw, bh = sp.bh, a = sp.tilt, side = sp.face === 'side', d = sp.fdir;
    ctx.fillStyle = ink;
    // legs and boots (behind the body)
    g.legs.forEach((l, i) => {
      const sd = i ? 1 : -1;
      _limb(l.hx, l.hy, l.kx, l.ky, DU.leg); _limb(l.kx, l.ky, l.fx, l.fy, DU.leg);
      const toe = side ? d : sd, bx = R(l.fx) - (toe < 0 ? 5 : 1), by = R(l.fy) - 1;
      ctx.fillRect(bx, by, 7, 3); ctx.fillRect(bx + (toe < 0 ? 0 : 1), by - 1, 6, 1);
      anchors['foot' + i] = [l.fx, l.fy + 2];
    });
    // the body: Clio's speech balloon (rounded rect) with the kinked tail, tilted
    const r = Math.min(5, bw / 2 - .5), pts = [], arc = (ax, ay, a0) => { for (let j = 0; j <= 4; j++) { const an = a0 + j / 4 * Math.PI / 2; pts.push([ax + Math.cos(an) * r, ay + Math.sin(an) * r]); } };
    arc(x0 + bw - r, y0 + r, -Math.PI / 2); arc(x0 + bw - r, y0 + bh - r, 0);
    if (side) { const tx = d > 0 ? x0 + 3 : x0 + bw - 3, td = d > 0 ? -1 : 1; pts.push([tx + td * -5, y0 + bh]); pts.push([tx + td * 4, y0 + bh + 6]); pts.push([tx + td * -1, y0 + bh]); }
    else if (!sp.sideTail) { pts.push([x0 + 12, y0 + bh]); pts.push([x0 + 6, y0 + bh + 3]); pts.push([x0 - 4, y0 + bh + 7]); pts.push([x0 + 2, y0 + bh + 1]); }   // the tail, with its kink
    arc(x0 + r, y0 + bh - r, Math.PI / 2);
    if (sp.sideTail) { pts.push([x0 - 9, y0 + bh - 1]); pts.push([x0 - 4, y0 + bh - 6]); pts.push([x0 - 1, y0 + bh - 10]); }   // sitting: the tail kinks out sideways
    arc(x0 + r, y0 + r, Math.PI);
    poly(pts.map(([x, y]) => _rot(x, y, cx, cy, a)), ink);
    anchors.head = [cx, y0];
    // the face, cut out
    const holeFill = () => { if (eraseHoles) ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = hole; };
    const holeDone = () => { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = ink; };
    if (face) {
      holeFill();
      const eyes = side ? [[d * (bw / 2 - 4), -2.5, 2]] : [[-4.5, -2.5, 2], [4.5, -2.5, 2]];
      eyes.forEach(([ex, ey, ew], i) => {
        const [X, Y] = _rot(cx + ex, cy + ey, cx, cy, a), x = R(X - ew / 2), y = R(Y - 1);
        const kind = sp.eyes === 'wink' && i === eyes.length - 1 ? 'wink' : sp.eyes;
        if (kind === 'happy') { ctx.fillRect(x - 1, y + 1, 1, 2); ctx.fillRect(x, y, ew, 1); ctx.fillRect(x + ew, y + 1, 1, 2); }
        else if (kind === 'wink') { ctx.fillRect(x - 1, y + 1, ew + 2, 1); }
        else if (kind === 'flat') { ctx.fillRect(x - 1, y + 1, ew + 2, 1); ctx.fillRect(x, y + 2, ew, 1); }
        else ctx.fillRect(x, y, ew, 3);
      });
      // the mouth: sings the lyric (open 0..4 by vowel shape) or smiles
      const [MX, MY] = _rot(cx + (side ? d * (bw / 2 - 3.5) : 0), cy + 3, cx, cy, a), mx = R(MX), my = R(MY), mo = Math.max(mouth.open, sp.mouthO), shp = mouth.shape;
      if (mo <= 0) { if (side) ctx.fillRect(mx - (d < 0 ? 0 : 2), my + 1, 3, 1); else { ctx.fillRect(mx - 3, my, 1, 1); ctx.fillRect(mx - 2, my + 1, 5, 1); ctx.fillRect(mx + 3, my, 1, 1); } }
      else {
        const mw = side ? 3 : shp === 'E' ? 6 : shp === 'O' ? 3 + (mo > 2 ? 1 : 0) : 4 + (mo > 1 ? 1 : 0), mh = shp === 'E' ? 1 + Math.min(2, mo) : mo + 1;
        const ox = side ? mx - (d < 0 ? 0 : 2) : mx - Math.floor(mw / 2);
        if (mh <= 2) { ctx.fillRect(ox, my, mw, 1); if (mh === 2) ctx.fillRect(ox + 1, my + 1, Math.max(1, mw - 2), 1); }
        else { const s = ovalSpans(mw, mh); for (let j = 0; j < mh; j++) ctx.fillRect(ox + s[j], my - 1 + j, mw - 2 * s[j], 1); }
      }
      holeDone();
    }
    // arms (in front of the body) and mitten hands
    g.arms.forEach((A, i) => {
      const hand = sp.hands[i], sd = A.sd;
      _limb(A.sx, A.sy, A.ex, A.ey, DU.arm); _limb(A.ex, A.ey, A.hx, A.hy, DU.arm);
      const hx = R(A.hx), hy = R(A.hy);
      if (hand === 'cam') { // a huge mitten pointing out of the frame, the fingertip cut out
        ctx.fillRect(hx - 3, hy - 4, 7, 9); ctx.fillRect(hx - 4, hy - 3, 9, 7); ctx.fillRect(hx + (sd > 0 ? 4 : -6), hy - 6, 3, 5);
        if (face) { holeFill(); ctx.fillRect(hx - 1, hy - 1, 2, 2); holeDone(); }
        anchors['hand' + i] = [hx, hy]; return;
      }
      if (hand === 'flat') { const fx = hx + sd * 3 * Math.sin(A.a2), fy = hy + 3 * Math.cos(A.a2); _limb(hx, hy, fx, fy, 4); anchors['hand' + i] = [fx, fy]; return; }
      ctx.fillRect(hx - 2, hy - 1, 5, 4); ctx.fillRect(hx - 1, hy - 2, 3, 6);                                   // the mitten
      ctx.fillRect(hx - sd * 3 - (sd > 0 ? 1 : 0), hy - 2, 2, 2);                                               // its thumb
      if (hand === 'point') { const fx = hx + sd * 4 * Math.sin(A.a2), fy = hy + 4 * Math.cos(A.a2); _limb(hx, hy, fx, fy, 2); anchors['hand' + i] = [fx, fy]; }
      else anchors['hand' + i] = [hx, hy];
    });
  });
  c._anchors = anchors;
  if (_danceC.size > 2500) _danceC.clear();
  _danceC.set(key, c); return c;
}
// the halo: the puppet's shape in the halo colour (cached on the puppet itself, so it goes when the puppet goes)
function _haloShape(c, col) { const m = c._halo || (c._halo = new Map()); let o = m.get(col); if (!o) m.set(col, o = tinted(c, col)); return o; }
function clioDance(x, y, scale = 7, t = T, o = {}) {
  const s = Math.max(1, R(scale)), fld = fieldCol(o.field || fieldAt(t) || 'magenta'), ink = o.ink || C.black, steps = o.steps ?? 8;
  const ps = dancePose(t, o), pq = steps ? Math.min(.999, Math.floor(ps.p * steps) / steps) : ps.p;
  const sp = _poseSpec(ps.name, pq, ps.s);
  if (o.eyes) sp.eyes = o.eyes;
  if (o.squash !== false && !sp.air) { // squash on the beat, stretch just after it
    if (pq < .125) { sp.bw += 2; sp.bh -= 2; } else if (pq < .375) { sp.bw -= 1; sp.bh += 1; }
  }
  let mouth = o.mouth ?? 'sing';
  if (mouth === 'sing') { const m = singing(t, o.voice); mouth = { open: m.open > .08 ? clamp(Math.ceil(m.open * 4), 1, 4) : 0, shape: m.shape }; }
  else if (typeof mouth === 'number') mouth = { open: mouth > .08 ? clamp(Math.ceil(mouth * 4), 1, 4) : 0, shape: 'A' };
  else mouth = { open: mouth.open > .08 ? clamp(Math.ceil(mouth.open * 4), 1, 4) : 0, shape: mouth.shape || 'A' };
  if (!mouth.open) mouth.shape = 'A';   // a shut mouth is one shape (one cache entry)
  const erase = SIL.active, pup = _dancePuppet(sp, mouth, ink, erase ? C.black : fld, erase, o.face !== false);
  const X = R(x) - DU.CX * s, Y = R(y) - DU.GY * s, flip = !!o.flip, dw = DU.W * s, dh = DU.H * s;
  const blit = (c, ox = 0, oy = 0) => { if (!flip) return ctx.drawImage(c, X + ox, Y + oy, dw, dh); ctx.save(); ctx.translate(X + dw + ox, Y + oy); ctx.scale(-1, 1); ctx.drawImage(c, 0, 0, dw, dh); ctx.restore(); };
  const halo = o.rim === false || erase ? null : o.rim && o.rim !== true ? o.rim : fld, hw = R(o.rimW ?? 2);
  const gnd = o.ground ?? true;
  if (gnd) { const gc = gnd === true ? ink : gnd, gw = 34 * s, gh = 3; if (halo) rect(R(x) - gw / 2 - hw, R(y) - hw, gw + 2 * hw, gh + 2 * hw, halo); rect(R(x) - gw / 2, R(y), gw, gh, gc); }
  if (o.shadow !== false && sp.air) { const sw = (16 - R(-sp.dy / 3)) * s; rect(R(x) - R(sw / 2), R(y) - 2 * s, sw, s, ink); }
  if (halo && hw > 0) { const hc = _haloShape(pup, halo); for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) blit(hc, dx * hw, dy * hw); }
  blit(pup);
  const A = pup._anchors, at = p => p ? [flip ? X + dw - R(p[0] * s) : X + R(p[0] * s), Y + R(p[1] * s)] : null;
  return { x: X, y: Y, w: dw, h: dh, hands: [at(A.hand0), at(A.hand1)], head: at(A.head), feet: [at(A.foot0), at(A.foot1)], pose: ps.name };
}
// the pose-shape test: every pose with the face blacked out, at its key phase, as unit masks; returns the smallest
// pixel difference between any two poses (as a share of the larger shape) and the pair. Distinct shapes score > .25.
function danceShapeTest(phase = .05) {
  const masks = DANCE_POSES.map(n => { const c = _dancePuppet(_poseSpec(n, phase, 1), { open: 0, shape: 'A' }, C.black, C.black, false, false); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, m = new Uint8Array(c.width * c.height); for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 0 ? 1 : 0; return m; });
  let worst = { score: 1, a: null, b: null };
  for (let i = 0; i < masks.length; i++) for (let j = i + 1; j < masks.length; j++) {
    let diff = 0, na = 0, nb = 0; const A = masks[i], B = masks[j];
    for (let k = 0; k < A.length; k++) { na += A[k]; nb += B[k]; diff += A[k] !== B[k]; }
    const sc = diff / Math.max(na, nb); if (sc < worst.score) worst = { score: +sc.toFixed(3), a: DANCE_POSES[i], b: DANCE_POSES[j] };
  }
  return worst;
}

// =====================================================================================================
// 3. The white pen and its cord. In silhouette mode they are the only white things on screen (inside silhouette() they
// defer themselves on top automatically).
// pen(x, y, angle, scale, o): a fountain pen whose nib tip is at (x, y), pointing along `angle` (radians, 0 = right,
//   PI/2 = down), 36.5 units long x the integer `scale` (4 = 146 px, 5 = 182 px: the chorus size). Pure #ffffff with a
//   1 px black outline and no hatching (only the nib slit), drawn at the frame's own pixel: the precise object against
//   the chunky dancer and type. On each kick it flashes for one frame (a 3 px white bloom outside the outline). o: color
//   (white), ink (the outline and slit, black), outline (a colour, or false), flash (true in silhouette mode; false off),
//   detail (true: the old seams, cap band and clip lines). Returns {tip, back, angle}.
// penCord(points, o): the long cord from the pen's back end to the writer's pointer: hangs between the anchors, swings
//   with the beat, drawn as a stepped pixel staircase, 3 px white with a 1 px black edge ("the white earbud cord").
//   o: w (3 px), sag (px per 100 px of span, 22), swing (px, 10), color (white), outline (black; false for none), t.
// penTrail(points, o): a white stroke the pen tip drags (straight segments, the same staircase): o.w (3), color, outline.
// =====================================================================================================
function pen(x, y, angle = Math.PI * .75, scale = 2, o = {}) {
  const s = Math.max(1, R(scale)), ca = Math.cos(angle), sa = Math.sin(angle), X = R(x), Y = R(y);
  const P_ = (u, v) => [X + (u * ca - v * sa) * s, Y + (u * sa + v * ca) * s];   // u along the pen (+ toward the nib), v across
  const res = { tip: [X, Y], back: P_(-36.5, 0).map(R), angle };
  if (SIL.active && !o._now) { SIL.keeps.push(() => pen(x, y, angle, scale, { ...o, _now: true })); return res; }
  const col = o.color || C.white, ink = o.ink || C.black, ring = o.outline === false ? null : o.outline || ink, quad = (ua, ub, ha, hb) => [P_(ua, -ha), P_(ub, -hb), P_(ub, hb), P_(ua, ha)];
  const parts = [[P_(.4, 0), P_(-7, -2.3), P_(-7, 2.3)], quad(-7, -13, 2.5, 2.7), quad(-13, -34, 3.1, 3.1), quad(-34, -36.5, 2.7, 1.9), quad(-15.5, -31, 4.4, 4.4)];
  const body = (c, dx, dy) => { for (const q of parts) poly(dx || dy ? q.map(([px, py]) => [px + dx, py + dy]) : q, c); };
  const flash = (o.flash ?? !!fieldAt(o.t ?? T)) && evFrames('kick', o.t ?? T) === 0;
  if (flash) for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) if (Math.abs(dx) + Math.abs(dy) >= 4) body(col, dx, dy);
  if (ring) for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) body(ring, dx, dy);
  body(col);
  // the nib slit and its breather hole, one pixel wide whatever the scale
  line(...P_(-.6, 0), ...P_(-4.4, 0), ink); rect(R(P_(-5, 0)[0]) - (s > 2 ? 1 : 0), R(P_(-5, 0)[1]) - (s > 2 ? 1 : 0), s > 2 ? 2 : 1, s > 2 ? 2 : 1, ink);
  if (o.detail) { // the seams, the cap band, the clip's gap
    line(...P_(-7, -2.5), ...P_(-7, 2.5), ink); poly(quad(-12.6, -13.6, 3.2, 3.2), ink); line(...P_(-34, -3), ...P_(-34, 3), ink);
    line(...P_(-15.5, -3.4), ...P_(-30.6, -3.4), ink); line(...P_(-15.5, -4.4), ...P_(-15.5, -3.4), ink);
  }
  return res;
}
// a staircase on a w-px grid through sample points: Bresenham between them, one w x w step at a time
function _stairs(out, w) {
  const steps = [];
  for (let i = 1; i < out.length; i++) {
    let x0 = Math.floor(out[i - 1][0] / w), y0 = Math.floor(out[i - 1][1] / w); const x1 = Math.floor(out[i][0] / w), y1 = Math.floor(out[i][1] / w);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx - dy;
    for (let n = 0; n < 2000; n++) { steps.push(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } else { err += dx; y0 += sy; } }
  }
  return steps;
}
function _stairDraw(steps, w, col, edge) {
  if (edge) { ctx.fillStyle = edge; for (let i = 0; i < steps.length; i += 2) ctx.fillRect(steps[i] * w - 1, steps[i + 1] * w - 1, w + 2, w + 2); }
  ctx.fillStyle = col; for (let i = 0; i < steps.length; i += 2) ctx.fillRect(steps[i] * w, steps[i + 1] * w, w, w);
}
function penCord(pts, o = {}) {
  if (SIL.active && !o._now) { SIL.keeps.push(() => penCord(pts, { ...o, _now: true })); return; }
  const t = o.t ?? T, w = Math.max(1, R(o.w ?? 3)), col = o.color || C.white, sw = Math.sin(beatPhase(t, 2) * Math.PI * 2) * (o.swing ?? 10);
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], span = Math.hypot(bx - ax, by - ay), sag = (o.sag ?? 22) * span / 100;
    const cxp = (ax + bx) / 2 + sw * span / 100, cyp = Math.max(ay, by) + sag;   // the control point hangs below and swings
    const n = Math.max(4, Math.ceil(span / (3 * w)));
    for (let j = i > 1 ? 1 : 0; j <= n; j++) { const k = j / n, q = 1 - k; out.push([q * q * ax + 2 * q * k * cxp + k * k * bx, q * q * ay + 2 * q * k * cyp + k * k * by]); }
  }
  _stairDraw(_stairs(out, w), w, col, o.outline === false ? null : o.outline || C.black);
}
function penTrail(pts, o = {}) {
  if (SIL.active && !o._now) { SIL.keeps.push(() => penTrail(pts, { ...o, _now: true })); return; }
  if (pts.length < 2) return;
  const w = Math.max(1, R(o.w ?? 3));
  _stairDraw(_stairs(pts, w), w, o.color || C.white, o.outline === false ? null : o.outline || C.black);
}

// =====================================================================================================
// 4. bigType(text, o): giant pixel type. Chicago is rasterised at its native size (the pixel font: one font pixel = one
// canvas pixel, caps 9 px tall) and every font pixel becomes an exact sx x sy block (integers, 4..24), so the pixels stay
// square and crisp at poster size.
//   text: a string ('\n' stacks lines) or an array of lines.
//   o.x, o.y (default the centre), align ('center' | 'left' | 'right'), valign ('middle' | 'top' | 'bottom': o.y is the
//   block's middle / top of the first cap line / baseline of the last line) · scale (8) · fit (true = W, or px: each line
//   gets the largest integer scale that fits that width: a poster stack) · justify (true | px: every line is stretched
//   sideways, by a whole x factor plus whole-pixel letter spacing, to exactly that width: a justified block; implies fit)
//   · bleed (px: fit wider than the frame, so the type crops off the SIDE edges; the stack still fits the height) · fitH
//   (true = H, or px: the biggest lines step down until the stack fits that height) · min / max (4 / 24) · lead (native px
//   between lines, 2) · track (native px between letters, 0) · stretch [sx, sy] (integer x / y factors) · color (black) ·
//   outline (colour, outlineW native px) · shadow ([colour, dx, dy] in native px: a hard drop) · invert (slabs in o.slab,
//   black, behind the lines: white-on-black or field-on-black) · pad (native px of slab round the letters, 2; never more
//   than half the gap to the next line, so a slab cannot eat its neighbour) · slabMode ('line': a slab per line; 'block':
//   one slab round the block; 'bleed': one full-width slab from x 0 to W over the block's rows) · xor (true | a field: the
//   letters swap field and black wherever they fall, so type can run across black silhouettes)
//   pass: 'slab' | 'type' (draw only the slabs / only the letters: bigTypes() uses it so every slab of several blocks
//   is down before any letter)
//   timing: t · slam (a time: the whole block lands with an integer scale overshoot +3 +2 +1 0) · stepIn ({t0, div: 4,
//   enter: 'slam' | 'drop' | 'flash'}: one letter per 16th) · words (a lyric line: each word appears on its sung start,
//   slamming in; with ghost: colour, unsung words show as 50% dithered ghost type)
// Returns {x, y, w, h, lines: [{x, y, w, h, sx, sy}], letters: [{ch, x, y, w, h, on}], slabs: [{x, y, w, h}]}.
// Every line it draws is listed in FX.typeRows, so the pixel sort of a drop leaves the words alone.
// bigTypes([[text, o], ...]): several blocks, all their slabs first, then all their letters.
// =====================================================================================================
const _ghostC = new Map();
function _ghost(c) { // a 50% checker-dithered copy of a glyph raster (AI output: temporary until kept)
  let o = _ghostC.get(c); if (o) return o;
  o = offscreen(c.width, c.height, () => { ctx.drawImage(c, 0, 0); ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = bayerPat(.5, C.black, null); ctx.fillRect(0, 0, c.width, c.height); ctx.globalCompositeOperation = 'source-over'; });
  if (_ghostC.size > 2000) _ghostC.clear();
  _ghostC.set(c, o); return o;
}
// the sung start of each letter's word: the text's words are matched to the line's words (in order, by their letters;
// by position when they do not match), so 'PEN PAL' takes its times from "I'm just your pen pal,"
function _bigWordTimes(chars, ln) {
  if (!ln || !ln.words) return [];
  const lw = ln.words, tws = []; chars.forEach(cs => cs.join('').split(' ').forEach(w => { if (w) tws.push(w); }));
  const times = []; let j = 0;
  tws.forEach((w, k) => { const f = _fold(w); let m = -1; for (let q = j; q < lw.length; q++) if (_fold(lw[q].w) === f) { m = q; break; } if (m < 0) m = Math.min(lw.length - 1, tws.length === lw.length ? k : j); times.push(lw[m].start); j = m + 1; });
  let k = 0; return chars.map(cs => { const row = []; let inW = false; cs.forEach(ch => { if (ch === ' ') { if (inW) k++; inW = false; row.push(null); } else { inW = true; row.push(times[Math.min(k, times.length - 1)]); } }); if (inW) k++; return row; });
}
// ---- the legibility audit: legibilityAudit(t0, t1, step) draws frames (without their FX) and checks every glyph of big
// type: the share of its pixels drawn over after it landed (covered), the share not in its dominant colour (split: a
// glyph half on the menu bar, half on the field), and whether it is cropped at the top or bottom edge. ----
let _LEG = null;
const _gmask = new Map();
function _glyphMask(ch, font, top0, rows) {
  const key = font + '\u0001' + ch; let m = _gmask.get(key); if (m) return m;
  const c = _raster(ch, font, '#000000'), d = c.getContext('2d').getImageData(0, top0, c.width, rows).data; m = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) m.push(x, y);
  _gmask.set(key, m); return m;
}
function _legLog(ch, font, top0, rows, ox, oy, sx, sy) {
  if (ctx.canvas !== cv) return;
  const tr = ctx.getTransform(), m = _glyphMask(ch, font, top0, rows), pts = [];
  let vcrop = 0, n = 0;
  for (let i = 0; i < m.length; i += 2) {
    const X = R(tr.e + ox + m[i] * sx + sx / 2), Y = R(tr.f + oy + m[i + 1] * sy + sy / 2); n++;
    if (Y < 0 || Y >= FH) { vcrop++; continue; } if (X < 0 || X >= FW) continue; pts.push(X, Y);
  }
  if (!pts.length) return;
  let x0 = FW, y0 = FH, x1 = 0, y1 = 0; for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
  const d = new Uint32Array(ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data.buffer), bw = x1 - x0 + 1, before = [];
  for (let i = 0; i < pts.length; i += 2) before.push(d[(pts[i + 1] - y0) * bw + pts[i] - x0]);
  _LEG.push({ ch, pts, before, n, vcrop, t: T });
}
function legibilityAudit(t0, t1, step = 1 / FPS, o = {}) {
  const bad = [], keepFX = applyFX; let frames = 0, glyphs = 0, worst = { covered: 0, split: 0 };
  try {
    for (let t = t0; t < t1 - 1e-9; t += step) {
      _LEG = []; applyFX = () => {}; frames++;
      try { draw(t); } finally { applyFX = keepFX; }
      if (FX.wiping && !o.wipes) continue;   // a transition is replacing the frame on purpose
      const u = new Uint32Array(cv.getContext('2d').getImageData(0, 0, FW, FH).data.buffer), s = sceneAt(t);
      for (const g of _LEG) {
        glyphs++;
        const cnt = new Map(); let cov = 0;
        for (let i = 0, j = 0; i < g.pts.length; i += 2, j++) { const v = u[g.pts[i + 1] * FW + g.pts[i]]; if (v !== g.before[j]) cov++; cnt.set(v, (cnt.get(v) || 0) + 1); }
        const N = g.pts.length / 2, covered = cov / N, split = 1 - Math.max(...cnt.values()) / N, vcrop = g.vcrop / g.n;
        if (covered > worst.covered) worst.covered = +covered.toFixed(2);
        if (split > worst.split) worst.split = +split.toFixed(2);
        if (covered > (o.maxCovered ?? .1) || split > (o.maxSplit ?? .1) || vcrop > 0) bad.push({ t: +t.toFixed(3), scene: s && s.name, ch: g.ch, at: [g.pts[0], g.pts[1]], covered: +covered.toFixed(2), split: +split.toFixed(2), vcrop: +vcrop.toFixed(2) });
      }
    }
  } finally { _LEG = null; }
  return { frames, glyphs, worst, failures: bad.length, bad: bad.slice(0, o.limit ?? 40) };
}
function bigType(str, o = {}) {
  const t = o.t ?? T, font = fontKey(o.font || 'chicago'), f = FONTS[font], cap = f.cap, lines = Array.isArray(str) ? str.slice() : String(str).split('\n');
  const lead = o.lead ?? 2, track = o.track ?? 0, [stx, sty] = (o.stretch || [1, 1]).map(v => Math.max(1, R(v))), mn = o.min ?? 4, mx = o.max ?? 24;
  const chars = lines.map(s => [...(f.ascii ? _asciiFold(s) : s)]);
  const adv = ch => tw(ch, font);
  const natW = chars.map(cs => cs.reduce((a, ch, i) => a + adv(ch) + (i ? track : 0), 0));
  // slam: an integer overshoot of the whole block
  let extra = 0;
  if (o.slam != null && isFinite(o.slam)) { const fr = Math.floor((t - o.slam) * FPS); if (fr >= 0 && fr < 8) extra = [3, 3, 2, 2, 1, 1, 0, 0][fr]; }
  const jW = o.justify ? (o.justify === true ? (o.fit && o.fit !== true ? o.fit : W) : o.justify) + 2 * (o.bleed || 0) : 0;
  const fitW = o.fit || o.justify ? (jW || (o.fit === true ? W : o.fit)) + (jW ? 0 : 2 * (o.bleed || 0)) : 0;
  const base = natW.map(nw => clamp(fitW ? Math.floor(fitW / Math.max(1, nw)) : R(o.scale || 8), mn, mx));
  const fitHv = o.fitH ? (o.fitH === true ? H : o.fitH) : o.bleed ? H : 0;   // bleed crops the sides only: the stack always fits the height
  if (fitHv) { // shrink the biggest lines a step at a time until the stack fits the height
    const hOf = b => b.reduce((a, s, i) => a + cap * s * sty + (i < b.length - 1 ? lead * Math.min(s, b[i + 1]) * sty : 0), 0);
    for (let g = 0; g < 400 && hOf(base) > fitHv; g++) { let mi = 0; base.forEach((s, i) => { if (s > base[mi]) mi = i; }); if (base[mi] <= mn) break; base[mi]--; }
  }
  const scales = base.map(s => s + extra);
  const L = scales.map((s, i) => {
    const sy = s * sty, nl = chars[i].length;
    if (!jW) return { sx: s * stx, sy, w: natW[i] * s * stx, h: cap * sy, sp: 0, rem: 0, n: nl };
    const bsx = Math.max(base[i], Math.floor(jW / Math.max(1, natW[i]))), sx = bsx + extra;
    // the remainder: whole letters one x step wider (widest first, then left to right) while they fit, the rest as spacing
    let rem = Math.max(0, jW - natW[i] * bsx); const wide = new Set(), order = chars[i].map((ch, k) => [adv(ch), k]).filter(([a, k]) => chars[i][k] !== ' ').sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    for (const [a, k] of order) if (a <= rem) { wide.add(k); rem -= a; }
    return { sx, sy, w: natW[i] * sx + (jW - natW[i] * bsx), h: cap * sy, rem, n: nl, wide };
  });
  const gap = i => lead * Math.min(L[i].sy, L[i + 1] ? L[i + 1].sy : L[i].sy);
  const totH = L.reduce((a, l, i) => a + l.h + (i < L.length - 1 ? gap(i) : 0), 0), maxW = Math.max(...L.map(l => l.w));
  const ax = o.x ?? W / 2, al = o.align || 'center', va = o.valign || 'middle';
  let y = R(va === 'top' ? (o.y ?? 0) : va === 'bottom' ? (o.y ?? H) - totH : (o.y ?? H / 2) - totH / 2);
  const out = { x: 0, y, w: maxW, h: totH, lines: [], letters: [], slabs: [] };
  L.forEach((l, li) => { l.x = R(al === 'center' ? ax - l.w / 2 : al === 'right' ? ax - l.w : ax); l.y = y; out.lines.push(l); out.x = li ? Math.min(out.x, l.x) : l.x; y += l.h + (li < L.length - 1 ? gap(li) : 0); });
  const pass = o.pass || 'all';
  // the slabs, all of them before any letter (a slab never lands on a neighbouring line's letters)
  if (o.invert && pass !== 'type') {
    const pad = o.pad ?? 2, slab = o.slab || C.black, mode = o.slabMode || 'line';
    const padT = i => i === 0 ? pad * L[i].sy : Math.min(pad * L[i].sy, Math.floor(gap(i - 1) / 2));
    const padB = i => i === L.length - 1 ? pad * L[i].sy : Math.min(pad * L[i].sy, Math.ceil(gap(i) / 2));
    if (mode === 'line') L.forEach((l, i) => { const px = pad * l.sx, r = { x: l.x - px, y: l.y - padT(i), w: l.w + 2 * px, h: l.h + padT(i) + padB(i) }; rect(r.x, r.y, r.w, r.h, slab); out.slabs.push(r); });
    else {
      const top = L[0].y - padT(0), bot = L[L.length - 1].y + L[L.length - 1].h + padB(L.length - 1), px = pad * Math.max(...L.map(l => l.sx));
      const r = mode === 'bleed' ? { x: 0, y: top, w: W, h: bot - top } : { x: out.x - px, y: top, w: maxW + 2 * px, h: bot - top };
      rect(r.x, r.y, r.w, r.h, slab); out.slabs.push(r);
    }
  }
  if (pass === 'slab') return out;
  // the letters
  const wordStart = _bigWordTimes(chars, o.words);
  let n = 0;
  const xor = o.xor ? fieldCol(o.xor === true ? fieldAt(t) || 'magenta' : o.xor) : null, color = xor || o.color || C.black, rows = cap + 5, top0 = f.top - 1;
  if (xor) { ctx.save(); ctx.globalCompositeOperation = 'difference'; }   // XOR type: black on the field, field on black
  const trF = ctx.getTransform().f;
  chars.forEach((cs, li) => {
    const l = L[li], x0 = l.x, y0 = l.y;
    if (FX && ctx.canvas === cv) (FX.typeRows || (FX.typeRows = [])).push([R(trF + y0), R(trF + y0 + l.h)]);
    let gi = 0;
    const spacing = k => l.rem && l.n > 1 ? Math.floor((k + 1) * l.rem / (l.n - 1)) - Math.floor(k * l.rem / (l.n - 1)) : 0;
    let px0 = x0;
    cs.forEach((ch, ci) => {
      const lsx = l.sx + (l.wide && l.wide.has(ci) ? 1 : 0), a = adv(ch), lx = px0; px0 += a * lsx + track * l.sx + spacing(gi++);
      if (ch === ' ') return;
      let on = true, ex = 0, dy = 0, flash = false, ghost = false;
      const tIn = o.stepIn ? beatTime(beatAt(o.stepIn.t0) + n / (o.stepIn.div || 4)) : wordStart[li] ? wordStart[li][ci] : null;
      n++;
      if (tIn != null) {
        const fr = Math.floor((t - tIn) * FPS + 1e-6);
        if (fr < 0) { if (o.ghost && wordStart[li]) ghost = true; else { on = false; } }
        else {
          const enter = (o.stepIn && o.stepIn.enter) || 'slam';
          if (enter === 'slam' && fr < 6) ex = [2, 2, 1, 1, 0, 0][fr];
          else if (enter === 'drop' && fr < 6) dy = -[3, 3, 2, 1, 1, 0][fr] * cap * l.sy / 4;
          else if (enter === 'flash' && fr < 3) flash = true;
        }
      }
      const lw = a * lsx, rec = { ch, x: lx, y: y0, w: lw, h: l.h, on };
      out.letters.push(rec);
      if (!on) return;
      const sx = lsx + ex * stx, sy = l.sy + ex * sty, gx = R(lx + lw / 2 - a * sx / 2), gy = R(y0 + l.h / 2 - cap * sy / 2 + dy);
      const put = (col, ox, oy, gh) => { let c = _raster(ch, font, col); if (gh) c = _ghost(c); ctx.drawImage(c, 0, top0, c.width, rows, gx - sx + ox, gy - sy + oy, c.width * sx, rows * sy); };
      if (o.shadow) { const [sc, sdx, sdy] = o.shadow; put(sc, sdx * sx, sdy * sy, ghost); }
      if (o.outline) { const ow = o.outlineW ?? 1; for (const [dx2, dy2] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) put(o.outline, dx2 * ow * sx, dy2 * ow * sy, ghost); }
      put(flash ? (o.flashColor || C.white) : ghost ? (o.ghost === true ? color : o.ghost) : color, 0, 0, ghost);
      if (_LEG && !ghost) _legLog(ch, font, top0, rows, gx - sx, gy - sy, sx, sy);
    });
  });
  if (xor) ctx.restore();
  return out;
}
function bigTypes(blocks) {
  blocks.forEach(([s, o]) => bigType(s, { ...o, pass: 'slab' }));
  return blocks.map(([s, o]) => bigType(s, { ...o, pass: 'type' }));
}

// =====================================================================================================
// 5. Hard beat FX. Each sets fields on FX (core.js applies them to the finished frame, palette only, on the grid). `at` is
// the hit time: given, the effect fires only for its frames after it; omitted, it fires on this frame.
// =====================================================================================================
const _within = (at, frames, t = T) => at == null || (t - at >= -1e-6 && t - at < frames / FPS - 1e-6);   // exactly `frames` frames on n/FPS times
function invertFrame(at, frames = 1, t = T) { if (_within(at, frames, t)) { FX.invert = true; return true; } return false; }
function rgbSplit(px = 2, at, frames = 3, dy = 0, t = T) { if (_within(at, frames, t)) { FX.rgbSplit = [px, dy]; return true; } return false; }
// splitPal(px, at, frames, colours): the same hard 2 px split, but its fringes are the frame's own palette: colours[0]
// (white) trails the dark shapes, colours[1] (black) leads them. The silhouette-mode split: no red and blue on a neon field.
function splitPal(px = 2, at, frames = 3, cols = [C.white, C.black], t = T) { if (_within(at, frames, t)) { FX.rgbSplit = [px, 0, cols]; return true; } return false; }
function pixelSort(rows = 14, length = 200, at, frames = 2, t = T) {
  if (!_within(at, frames, t)) return false;
  FX.pixelSort = { rows, len: length, seed: R((at ?? t) * 7) + Math.floor((t - (at ?? t)) * FPS) * 3 + 1, dir: hash(at ?? t) > .5 ? 1 : -1 }; return true;
}
// punch(at, x, y, steps): an integer zoom punch-in at (x, y) that steps back out (default 3x, 2x, 2x for two frames each)
function punch(at, x = W / 2, y = H / 2, steps = [3, 3, 2, 2, 2, 2], t = T) {
  const fr = Math.floor((t - at) * FPS + 1e-6); if (fr < 0 || fr >= steps.length || steps[fr] < 2) return false;
  FX.stepZoom = steps[fr]; FX.stepZoomAt = [x, y]; return true;
}
const stepZoom = (n, x = W / 2, y = H / 2) => { FX.stepZoom = n; FX.stepZoomAt = [x, y]; };
const posterize = p => { FX.posterize = p; };
const scanFX = (k, o = {}) => { FX.scan = { k, ...o }; };
const isDownbeat = te => Math.abs(barAt(te) - Math.round(barAt(te))) < .02;
const inChorus = tt => /chorus/.test((sectionAt(tt) || {}).name || '');
// isPhraseHit(t): a bar downbeat that starts a phrase of the section (each section split into 4 phrases: 4 key hits)
function isPhraseHit(te) {
  const s = sectionAt(te); if (!s || !isDownbeat(te)) return false;
  const b0 = Math.round(barAt(s.start)), nb = Math.max(1, Math.round(barAt(s.end)) - b0), ph = Math.max(1, Math.round(nb / 4));
  return (Math.round(barAt(te)) - b0) % ph === 0;
}
// isDrop(t): a crash on the start of a section (the drops), not a fill inside one
const isDrop = te => SECTIONS.some(s => Math.abs(s.start - te) < .1) || hits('drop').some(h => Math.abs(h - te) < .1);
// beatFX(t, o): the presets, driven by EVENTS. kick -> a 1-frame invert on the 4 phrase downbeats of a chorus (o.kickEvery:
// 'bar' for every downbeat); snare -> a 2 px split for 3 frames (in silhouette mode in the field's own palette: white and
// black fringes, never red and blue); crash -> a pixel-sort smear for 2 frames on drops only, the type's rows left
// alone. o: kick / snare / crash: false to skip one; anywhere: true (kick inverts outside choruses too); split (px);
// rgb: true (the red/blue split even in silhouette mode); stab: true (an integer punch-in on stabs, at o.punchAt);
// clap: true (a 2 px shake on claps). Returns the names that fired this frame.
function beatFX(t = T, o = {}) {
  const fired = [], last = n => evLast(n, t), every = o.kickEvery === 'bar' ? isDownbeat : isPhraseHit;
  if (o.kick !== false) { const e = last('kick'); if (e && every(e[0]) && (o.anywhere || inChorus(e[0])) && invertFrame(e[0], o.kickFrames || 1, t)) fired.push('kick'); }
  if (o.snare !== false) { const e = last('snare'), pal = !o.rgb && fieldAt(t); if (e && (pal ? splitPal(o.split ?? 2, e[0], 3, [C.white, C.black], t) : rgbSplit(o.split ?? 2, e[0], 3, 0, t))) fired.push('snare'); }
  if (o.crash !== false) { const e = last('crash'); if (e && (o.anyCrash || isDrop(e[0])) && pixelSort(o.sortRows ?? 16, o.sortLen ?? 220, e[0], 2, t)) fired.push('crash'); }
  if (o.stab) { const e = last('stab'); if (e && punch(e[0], ...(o.punchAt || [W / 2, H / 2]), undefined, t)) fired.push('stab'); }
  if (o.clap) { const e = last('clap'); if (e && _within(e[0], 3, t)) { FX.shake = Math.max(FX.shake || 0, 2); fired.push('clap'); } }
  return fired;
}
// finishAt(t) -> {vignette, scanlines}: the CRT finish this frame wants. render.mjs's ffmpeg finish (vignette PI/5, a 10%
// scanline grid) darkens the corners of a flat neon field to plum and olive; silhouette mode asks for no vignette and a
// lighter grid. render.mjs does not read this yet (the request is in TOOLKIT §12.5); window.FINISH_AT(t) exposes it.
function finishAt(t = T) { return fieldAt(t) ? { vignette: false, scanlines: .05 } : { vignette: true, scanlines: .1 }; }
window.FINISH_AT = finishAt;

// =====================================================================================================
// 6. The one-take camera.
// frameInto(canvas, t, src, o): render a whole frame (desktop, scene, dock, menu bar, overlays, pointer) into a canvas:
//   src = a registered scene's name, a scene object, or fn(t) (with o.era, o.desk, o.raw, o.menu, o.dock, o.screen as
//   scene opts). A `screen` scene is drawn inside its historic screen with black bars, exactly as main draws it. Its FX are
//   dropped. Everything the frame touches (UI, CUR, FX, the era, W x H, VIEW) is restored afterwards.
// diveInto(t0, t1, px, py, drawOuter, drawInner, o): the pixel dive. A nearest-neighbour zoom into pixel (px, py) of the
//   outer frame at a constant log rate (scale = exp(k * u): it moves from the first frame), the pixel sliding to the
//   centre as it grows. The pixel is a square block in the writer's vermilion; the inner frame fades into it early (a
//   square window cut from the centre of the inner frame, shrunk by a box average and Bayer-quantised, never a
//   nearest-neighbour shrink), four short dithered vermilion stubs and a pulsing 2 px marker hold the eye on it, and
//   as the block reaches the frame's height the inner frame is 1:1 in it; on t1 (put it on a beat) the sides punch open
//   with a 1-frame invert and a 2 px split, and the inner frame IS the frame. Before t0 it draws the outer frame, after
//   t1 the inner one: use it in a raw scene that spans the dive. o: pw (the host is a pw x pw group: 2 for a 2x2 full
//   stop), innerAt (block px where the inner shows, 3), revealAt (block px where it is fully itself, 48), mark ([x, y]
//   in the inner frame: the marker, default (px, py)), anchor (false: no stubs or marker), hitFX (false: no landing FX),
//   outer / inner (frameInto opts), levels (Bayer levels per channel for the miniature, 6; 2 in 1-bit eras).
// pullBack(t0, t1, layers, o): the outro, the dive in reverse. layers[0] is the frame we start in; layers[i] = {draw, px,
//   py, pw, era, ...} where (px, py) is the pixel (pw x pw group) of layer i that holds layer i - 1. Each layer step snaps
//   in on its own beat (the sides close, a 1-frame split) and zooms out at a constant log rate; last comes a single
//   vermilion dot on black (o.dot: false to stop at the outermost layer; o.dotAt [x, y], o.dotColor, o.dotWeight: the
//   dot step's share of a layer step, .6). o.ease (k -> k) shapes the whole move. At most two frames are rendered per frame.
// =====================================================================================================
function frameInto(c, t, src, o = {}) {
  const s = typeof src === 'string' ? SCENES.find(x => x.name === src)
    : typeof src === 'function' ? { name: 'frame', fn: src, t0: o.t0 ?? 0, t1: 1e9, opts: { era: o.era, desk: o.desk, deskFn: o.deskFn, raw: o.raw, menu: o.menu, dock: o.dock, menubar: o.menubar, screen: o.screen } } : src;
  if (!s) throw new Error('frameInto: no scene ' + src);
  const sv = { ctx, UI, CUR, FX, E, T, W, H, VIEW: typeof VIEW !== 'undefined' ? VIEW : null };
  ctx = c.getContext('2d'); W = FW; H = FH; if (sv.VIEW) VIEW = { x: 0, y: 0 }; T = t; FX = {};
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
    rect(0, 0, FW, FH, C.black);
    const era = o.era || (s.opts.era ? eraFor(s, t).to : songEra(t)), scr = screenFor(s, t);
    withScreen(scr, () => { drawScene(s, t, era); if (CUR) pointer(CUR.x, CUR.y, CUR.kind || 'arrow', CUR); }, true);
    if (scr) screenBars(scr);
  } finally { ctx = sv.ctx; UI = sv.UI; CUR = sv.CUR; FX = sv.FX; setEra(sv.E); T = sv.T; W = sv.W; H = sv.H; if (sv.VIEW) VIEW = sv.VIEW; }
  return c;
}
const _pixAt = (c, x, y) => { const d = c.getContext('2d').getImageData(clamp(R(x), 0, c.width - 1), clamp(R(y), 0, c.height - 1), 1, 1).data; return hex(d[0], d[1], d[2]); };
const _layerSrc = L => typeof L === 'function' || typeof L === 'string' ? L : L.scene || L.draw;
// the miniature: the centre square (FH x FH) of a frame shrunk to bs x bs by a box average, then Bayer-quantised to
// `levels` per channel (2 = black and white by luma): small text turns into an even dither, never moire or broken strokes
function _miniInner(src, bs, levels) {
  const S = FH, x0 = (FW - FH) / 2, n = Math.max(1, R(bs)), out = styleBuf('mini', n, n, true), g = out.getContext('2d');
  const sd = src.getContext('2d').getImageData(x0, 0, S, S).data, od = g.createImageData(n, n), o = od.data;
  const edges = new Int32Array(n + 1); for (let i = 0; i <= n; i++) edges[i] = Math.min(S, Math.floor(i * S / n));
  const rs = new Float64Array(n), gs = new Float64Array(n), bsum = new Float64Array(n), cnt = new Float64Array(n), mono = levels <= 2, st = 255 / (Math.max(2, levels) - 1);
  for (let j = 0; j < n; j++) {
    rs.fill(0); gs.fill(0); bsum.fill(0); cnt.fill(0);
    for (let y = edges[j]; y < Math.max(edges[j] + 1, edges[j + 1]); y++) {
      let i = 0; const row = y * S * 4;
      for (let x = 0; x < S; x++) { while (i < n - 1 && x >= edges[i + 1]) i++; const k = row + x * 4; rs[i] += sd[k]; gs[i] += sd[k + 1]; bsum[i] += sd[k + 2]; cnt[i]++; }
    }
    for (let i = 0; i < n; i++) {
      const th = (BAYER4[(j & 3) * 4 + (i & 3)] + .5) / 16 - .5, k = (j * n + i) * 4, c = cnt[i] || 1;
      let r = rs[i] / c, gg = gs[i] / c, b = bsum[i] / c;
      if (mono) { const v = (r * .299 + gg * .587 + b * .114) / 255 + th > .5 ? 255 : 0; r = gg = b = v; }
      else { r = clamp(R(r / st + th) * st, 0, 255); gg = clamp(R(gg / st + th) * st, 0, 255); b = clamp(R(b / st + th) * st, 0, 255); }
      o[k] = r; o[k + 1] = gg; o[k + 2] = b; o[k + 3] = 255;
    }
  }
  g.putImageData(od, 0, 0); return out;
}
// one frame of a dive: zoom z (1 .. FH / pw) into pixel (px, py) of `outer`; `inner` (canvas or null) lives in that pixel
function _diveDraw(z, px, py, outer, inner, col, o = {}) {
  const pw = o.pw || 1, ZH = FH / pw, zz = clamp(z, 1, ZH), zi = zz < 8 ? zz : Math.min(ZH, R(zz)), bs = zi * pw, B = R(bs), f = Math.log(zz) / Math.log(ZH), pan = 1 - (1 - f) ** 3;
  const cx = lerp(px + pw / 2, FW / 2, pan), cy = lerp(py + pw / 2, FH / 2, pan), bx = R(cx - bs / 2), by = R(cy - bs / 2);
  rect(0, 0, FW, FH, C.black);
  const sx0 = Math.max(0, px - Math.ceil(bx / zi) - 1), sx1 = Math.min(FW, px + Math.ceil((FW - bx) / zi) + 1);
  const sy0 = Math.max(0, py - Math.ceil(by / zi) - 1), sy1 = Math.min(FH, py + Math.ceil((FH - by) / zi) + 1);
  if (sx1 > sx0 && sy1 > sy0) ctx.drawImage(outer, sx0, sy0, sx1 - sx0, sy1 - sy0, R(bx + (sx0 - px) * zi), R(by + (sy0 - py) * zi), R((sx1 - sx0) * zi), R((sy1 - sy0) * zi));
  rect(bx, by, B, B, col);
  const innerAt = o.innerAt ?? 3, revealAt = o.revealAt ?? 48;
  if (inner && B >= innerAt) {
    if (B >= FH) ctx.drawImage(inner, (FW - FH) / 2, 0, FH, FH, bx, by, B, B);
    else ctx.drawImage(_miniInner(inner, B, o.levels ?? 6), bx, by);
    const rev = prog(Math.log(B), Math.log(innerAt), Math.log(revealAt));
    if (rev < 1) bayer(bx, by, B, B, 1 - rev, col, null);
  }
  if (o.anchor !== false) { // the eye's anchor: short vermilion stubs (24 px, 25% dither) at the block while it is small, and a pulsing 2 px marker
    const ray = 1 - prog(Math.log(Math.max(1, B)), Math.log(6), Math.log(140)), mcx = R(bx + B / 2), mcy = R(by + B / 2), L = 24;
    if (ray > 0) for (const [x, y, w, h] of [[bx - 2 - L, mcy - 1, L, 2], [bx + B + 2, mcy - 1, L, 2], [mcx - 1, by - 2 - L, 2, L], [mcx - 1, by + B + 2, 2, L]]) bayer(x, y, w, h, .25, FIELDS.vermilion, null);
    const mk = o.mark || [px, py], ms = Math.max(2, R(pw * B / FH)) + (pulse(o.t ?? T, 1, 6) > .5 ? 2 : 0);
    const mx = R(bx + (mk[0] - (FW - FH) / 2) * B / FH + (pw * B / FH) / 2 - ms / 2), my = R(by + mk[1] * B / FH + (pw * B / FH) / 2 - ms / 2);
    if (B >= innerAt && B < FH) { frame(mx - 1, my - 1, ms + 2, ms + 2, C.black); rect(mx, my, ms, ms, FIELDS.vermilion); }
  }
  return { zi, bx, by, bs: B };
}
// the landing on the beat: the frame inverts for a frame and splits for three (palette fringes)
function _landFX(at, t) { invertFrame(at, 1, t); splitPal(2, at, 3, [C.white, C.black], t); }
function diveInto(t0, t1, px, py, drawOuter, drawInner, o = {}) {
  const t = o.t ?? T, k = prog(t, t0, t1), A = styleBuf('camA', FW, FH, true), B = styleBuf('camB', FW, FH, true);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  try {
    if (k >= 1) { ctx.drawImage(frameInto(B, t, drawInner, o.inner), 0, 0); if (o.hitFX !== false) _landFX(t1, t); return 1; }
    frameInto(A, t, drawOuter, o.outer);
    if (k <= 0) { ctx.drawImage(A, 0, 0); return 0; }
    const pw = o.pw || 1, ZH = FH / pw, u = o.ease ? o.ease(k) : o.power ? Math.pow(k, o.power) : k, z = Math.exp(u * Math.log(ZH)), col = o.color || _pixAt(A, px, py);
    _diveDraw(z, R(px), R(py), A, R(z * pw) >= (o.innerAt ?? 3) ? frameInto(B, t, drawInner, o.inner) : null, col, { ...o, t, levels: o.levels ?? ((ERA[(o.inner || {}).era] || {}).depth === 1 ? 2 : 6) });
    return k;
  } finally { ctx.restore(); }
}
function pullBack(t0, t1, layers, o = {}) {
  const t = o.t ?? T, dot = o.dot !== false, nl = layers.length - 1, dw = dot ? (o.dotWeight ?? .6) : 0, A = styleBuf('camA', FW, FH, true), B = styleBuf('camB', FW, FH, true);
  const total = nl + dw, k = (o.ease || (x => x))(prog(t, t0, t1)), g = clamp(k) * total;
  let seg = Math.min(nl - (dot ? 0 : 1), Math.floor(g)), u = g - seg, segLen = 1;
  if (dot && seg >= nl) { seg = nl; u = dw > 0 ? (g - nl) / dw : 1; segLen = dw; }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  try {
    const inner = layers[seg], outerL = layers[seg + 1], L0 = typeof inner === 'object' && !inner.call ? inner : {};
    if (total <= 0) { ctx.drawImage(frameInto(A, t, _layerSrc(layers[0]), L0), 0, 0); return 0; }
    // the host: the next layer out, or the dot
    let host, hx, hy, pw = 1, hostEra;
    if (outerL) { const HL = typeof outerL === 'object' ? outerL : {}; host = frameInto(A, t, _layerSrc(outerL), HL); hx = HL.px ?? FW / 2; hy = HL.py ?? FH / 2; pw = HL.pw || 1; }
    else { [hx, hy] = (o.dotAt || [FW / 2, FH / 2]).map(R); host = paintInto(A, () => { rect(0, 0, FW, FH, C.black); rect(hx, hy, 1, 1, o.dotColor || FIELDS.vermilion); }); }
    if (k >= 1) { ctx.drawImage(host, 0, 0); return 1; }
    hostEra = L0.era;
    const ZH = FH / pw, z = Math.exp((1 - u) * Math.log(ZH)), col = _pixAt(host, hx, hy);
    const innerC = R(z * pw) >= (o.innerAt ?? 3) ? frameInto(B, t, _layerSrc(inner), L0) : null;
    _diveDraw(z, R(hx), R(hy), host, innerC, col, { ...o, pw, t, mark: o.mark || [L0.px ?? hx, L0.py ?? hy], levels: (ERA[hostEra] || {}).depth === 1 ? 2 : 6 });
    const segT = t0 + (t1 - t0) * (seg / total);   // each layer step snaps in on its start: a 1-frame split
    if (o.hitFX !== false && seg > 0 && segLen === 1) splitPal(2, segT, 2, [C.white, C.black], t);
    return k;
  } finally { ctx.restore(); }
}

// ---- the screen grows with history ----
// screenSize(t) -> {x, y, w, h, stage, name, bits, full, punch}: the centred screen the desk is drawn in. 1988: the compact
// Mac's 512x342 at 1:1 in black; from the first System 7 era a wider screen (576x352), from Platinum wider again
// (608x356): each growth steps out on 16ths over one beat. `bits` is the colour depth of the stage (1, 8, 16, 24). On the
// final key change (HITS keyChange / reboot, else the start of chorus3) the bars are punched off on the downbeat (punch =
// {k 0..1, fr, from: the old rect}) and the desk is the full 16:9 frame from then on. Pixels are never scaled.
// Use it with scene(..., {screen: true}) (main then draws the whole scene inside, with W x H = the screen's size), or
// call letterbox(t) in an overlay to crop a full-frame scene to it. depthChips(x, y, w, h, bits) draws the palette of a
// colour depth as a strip of chips (2 chips, then 256, then thousands, then millions): the palette grows each step.
const SCREENS = [{ name: '512x342', w: 512, h: 342, bits: 1 }, { name: '640x400', w: 576, h: 352, bits: 8 }, { name: '640x480', w: 608, h: 356, bits: 16 }, { name: '16:9', w: 640, h: 360, bits: 24 }];
let _scrKeys = null;
function screenKeys() {
  if (_scrKeys) return _scrKeys;
  let punchT = hit('keyChange'); if (!isFinite(punchT)) punchT = hit('reboot');
  if (!isFinite(punchT)) { const c3 = section('chorus3'); punchT = c3 ? c3.start : DUR * .83; }
  const at = idx => { const e = ERA_SCHEDULE.find(e => eraIndex(e.id) >= idx); return e ? e.start : null; };
  const k = [[-1e9, 0]], s1 = at(ERA.system7.index), s2 = at(ERA.platinum.index);
  if (s1 != null && s1 < punchT) k.push([s1, 1]);
  if (s2 != null && s2 < punchT && s2 > (s1 ?? -1)) k.push([s2, 2]);
  k.push([punchT, 3]);
  return _scrKeys = k;
}
const _scrRect = s => ({ x: (FW - s.w) / 2, y: (FH - s.h) / 2, w: s.w, h: s.h });
function screenSize(t = T) {
  const ks = screenKeys(); let i = 0; while (i + 1 < ks.length && t >= ks[i + 1][0]) i++;
  const [ts, st] = ks[i], cur = SCREENS[st], prev = SCREENS[i > 0 ? ks[i - 1][1] : st];
  if (st === 3) { const fr = Math.floor((t - ts) * FPS + 1e-6); return { ..._scrRect(cur), stage: 3, name: cur.name, bits: cur.bits, full: true, punch: fr >= 0 && fr < 18 ? { k: fr / 18, fr, from: _scrRect(prev) } : null }; }
  const g = i > 0 ? Math.min(1, (Math.floor((beatAt(t) - beatAt(ts)) * 4) + 1) / 4) : 1;
  const w = R(lerp(prev.w, cur.w, g) / 2) * 2, h = R(lerp(prev.h, cur.h, g) / 2) * 2;
  return { x: (FW - w) / 2, y: (FH - h) / 2, w, h, stage: st, name: cur.name, bits: cur.bits, full: false, punch: null };
}
// screenBars(r): main calls it after a screen scene. On the punch: frames 0-1 the frame inverts and punches in 2x; then
// the bars, thick black frames with a white bezel line on their inner edge, slide off the edges in 4 hard steps (one
// every 2 frames) with speed lines behind them, and the frame shakes
function screenBars(r) {
  if (!r || !r.punch) return;
  const { fr, from: f } = r.punch, step = fr < 2 ? 0 : Math.min(4, Math.floor((fr - 2) / 2) + 1), e = step / 4, ox = R(e * (f.x + 40)), oy = R(e * (f.y + 30)), col = C.black;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fr < 2) { FX.invert = true; FX.stepZoom = 2; FX.stepZoomAt = [FW / 2, FH / 2]; }
  if (step >= 4) return;
  const bar = (x, y, w, h, ex, ey, ew, eh) => { rect(x, y, w, h, col); rect(ex, ey, ew, eh, C.white); };
  bar(-ox, 0, f.x, FH, f.x - ox - 2, 0, 2, FH); bar(FW - f.x + ox, 0, f.x, FH, FW - f.x + ox, 0, 2, FH);
  bar(0, -oy, FW, f.y, 0, f.y - oy - 2, FW, 2); bar(0, FH - f.y + oy, FW, f.y, 0, FH - f.y + oy, FW, 2);
  if (step > 0) for (let y = 3; y < FH; y += 7) { const len = 10 + Math.floor(hash(y * 1.7) * 30); rect(f.x - ox, y, len, 1, C.black); rect(FW - f.x + ox - len, y, len, 1, C.black); }
  if (fr < 10) FX.shake = Math.max(FX.shake || 0, 4 - fr * .4);
}
// letterbox(t | rect): black bars outside the screen rect, for a full-frame scene (draw it in an overlay); plus the punch
function letterbox(r = screenSize(T)) {
  if (typeof r === 'number') r = screenSize(r);
  if (!r) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  rect(0, 0, r.x, FH, C.black); rect(r.x + r.w, 0, FW - r.x - r.w, FH, C.black); rect(0, 0, FW, r.y, C.black); rect(0, r.y + r.h, FW, FH - r.y - r.h, C.black);
  ctx.restore(); screenBars(r);
}
function depthChips(x, y, w, h, bits = 1) {
  rect(x, y, w, h, C.black);
  const ix = x + 1, iy = y + 1, iw = w - 2, ih = h - 2;
  if (bits <= 1) { rect(ix, iy, iw >> 1, ih, C.white); return; }
  if (bits <= 8) { const n = 16, cw = iw / n; for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { const v = i * 16 + j * 8; rect(ix + R(i * cw), iy + R(j * ih / 2), R((i + 1) * cw) - R(i * cw), R((j + 1) * ih / 2) - R(j * ih / 2), hex(...[(v >> 5) * 36, ((v >> 2) & 7) * 36, (v & 3) * 85].map(c => clamp(c, 0, 255)))); } return; }
  for (let i = 0; i < iw; i++) { const hue = i / iw * 6, k = bits <= 16 ? Math.floor(hue * 6) / 6 : hue, c = [0, 0, 0].map((_, j) => { const d = Math.abs(((k - j * 2) % 6 + 6) % 6 - 3); return clamp(R((d - 1) * 255), 0, 255); }); rect(ix + i, iy, 1, ih, hex(...c)); }
}

// =====================================================================================================
// 7. The desk is the band. Every sound has a cause you can see; every instrument reads EVENTS (core.js ev*), so a chapter
// can drop the whole band in. The time argument of a hit instrument is the hit (omit it: the last event of its channel);
// they all draw the state at T (o.t to override). 1-bit by default: o.ink / o.paper recolour them. In silhouette mode pass
// {ink: field, paper: black}: the instruments become solid black shapes with neon cut-out detail. Sizes are at scale 1;
// o.scale (integer) pixel-doubles.
//   floppyDrive(x, y, label, note, t, o)  bass: a 3.5" drive with the cover off (100x84 with its label; o.compact: 100x72,
//       no label line): the disk in it, the read head on its lead screw sliding to the pitch (a tick per semitone, midi
//       28-64 = o.lo..o.hi, low on the left), buzzing while the note sounds, the screw turning, the light on, the note name.
//       note: a channel name ('floppyA') or a midi number (null = idle); t = now. -> {midi, on, headX}
//   ejectDisk(x, y, t0, o)        kick: a drive seen from above (76x58) spits the disk out of its slot, label end first,
//       on the hit and swallows it again over the beat; the drive dips a pixel (the kick is pitched down)
//   windowCloseZoom(x, y, w, h, t0, o)  snare: a window with a solid body that zooms shut into its icon on the hit (thick
//       zoom outlines) and zooms open again. o.title, o.icon ([x, y] where it closes to, or false), o.body(client),
//       o.solid (true: the body is a filled pattern), o.thick (outline px, 3)
//   clickBurst(x, y, t0, o)       clap: the hand pointer clicks (squashes) and three concentric square rings burst from the
//       hot spot, 4 px thick (o.ringW). o.kind ('hand'), o.scale (the pointer, 1), o.rings (3), o.copies (a stack of
//       pointers clicking together), o.pointer: false, o.color
//   typeLine(text, t0, t1, keystrokes, o)  hats: each keystroke (default: the hat hits in [t0, t1)) types one more
//       character; the newest key pops for two frames. o.x, o.y to draw (font, scale, color, caret) -> {str, n, w}
//   trashCrumple(x, y, t0, o)     crash: Empty Trash (52x56, its label below): the lid flips open on its hinge, the can
//       bulges, three paper wads leap out and fall; o.label ('' for none)
//   progressRiser(t0, t1, o)      riser: a progress bar that fills on 16ths and shakes in its last beat. o.x, o.y, o.w, o.h,
//       o.label, o.font, o.idle (draw the empty bar between risers) (default span: the riser covering t)
//   bellRing(x, y, t0, midi, o)   glockenspiel: the Writing Bell swings and rings rings; a note leaps up by pitch
//   bandGrid(x, y, w, h, o)       the whole band as a drum machine: a pad per instrument (A and B floppies, kick; snare,
//       clap, crash, bell) in bold black frames with Chicago tabs, each pad slamming (a 3-frame overshoot) and inverting on
//       its own hit, the hats typing o.typed ('YOU KEEP THE PEN') in 4x type across the middle, the riser a full-width
//       12 px bar along the bottom. o.field: silhouette mode (a field colour: pads on the field, solid black instruments
//       with neon cut-outs). Instruments run at scale 2 from 600 px wide, scale 1 below.
//   deskBand(x, y, o)             bandGrid in a 400x210 rack at scale 1
// =====================================================================================================
const _ink = o => o.ink || C.black, _paper = o => o.paper || C.white;
function _scaled(x, y, w, h, o, fn) { // draw fn at scale 1 into a small buffer, then pixel-double it into place
  const s = Math.max(1, R(o.scale || 1));
  if (s === 1) { ctx.save(); ctx.translate(R(x), R(y)); try { return fn(); } finally { ctx.restore(); } }
  const c = styleBuf('band' + w + 'x' + h, w, h); let r;
  paintInto(c, () => { r = fn(); });
  ctx.drawImage(c, R(x), R(y), w * s, h * s); return r;
}
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = m => NOTE_NAMES[((R(m) % 12) + 12) % 12] + (Math.floor(R(m) / 12) - 1);
// a 3.5" disk seen from above (label side up): the shell with its clipped corner, the metal shutter (open: the dithered
// media shows in its window), the label with ruled lines, the write-protect hole. (x, y) top-left, w x h ~ 46 x 48.
function _disk35(x, y, w, h, ink, paper, open = true) {
  rect(x, y, w, h, ink); rect(x + w - 3, y, 3, 1, paper); rect(x + w - 2, y + 1, 2, 1, paper); rect(x + w - 1, y + 2, 1, 1, paper);   // the clipped corner
  const sx = x + R(w * .22), sw = R(w * .5), sh = R(h * .36);
  rect(sx, y, sw, sh, paper); frame(sx, y, sw, sh, ink); rect(sx + 2, y + sh - 3, sw - 4, 1, ink);                            // the shutter
  if (open) { rect(sx + 4, y + 3, R(sw * .36), sh - 8, ink); bayer(sx + 5, y + 4, R(sw * .36) - 2, sh - 10, .5, paper, null); } // its window, the media
  const ly = y + R(h * .5), lh = h - R(h * .5) - 3; rect(x + 4, ly, w - 8, lh, paper); for (let r = ly + 3; r < ly + lh - 1; r += 3) rect(x + 6, r, w - 12, 1, ink);
  rect(x + 2, y + h - 6, 3, 3, paper);                                                                                              // write-protect hole
}
function floppyDrive(x, y, label = 'A:', note = 'floppyA', t = T, o = {}) {
  const ink = _ink(o), paper = _paper(o), ch = typeof note === 'string' ? note : null;
  const ev = ch ? evNote(ch, t) : note != null ? [t, note, 1] : null, on = !!ev, midi = ev ? ev[1] : ch ? (evLast(ch, t) || [0, 40])[1] : 40;
  const prevE = ch ? evList(ch)[evIndex(ch, t) - 1] : null, lo = o.lo ?? 28, hi = o.hi ?? 64, X0 = 30, X1 = 70;
  const pos = m => X0 + R(clamp((m - lo) / (hi - lo)) * (X1 - X0));
  let hx = pos(midi);
  if (ev && prevE && t - ev[0] < 3 / FPS) hx = R(lerp(pos(prevE[1]), hx, (Math.floor((t - ev[0]) * FPS) + 1) / 3));   // a 3-frame seek
  const fr = Math.floor(t * FPS), buzz = on ? ((fr + R(midi)) & 1 ? 1 : -1) : 0, sc = Math.max(1, R(o.scale || 1));
  return _scaled(x, y, 100, o.compact ? 72 : 84, o, () => {
    // the chassis, cover off; the disk in it
    rect(0, 0, 100, 72, ink); rect(1, 1, 98, 70, paper); for (const [sx, sy] of [[3, 3], [95, 3], [3, 57], [95, 57]]) rect(sx, sy, 2, 2, ink);
    _disk35(25, 15, 50, 46, ink, paper, true);
    // the pitch ruler over the rail: a tick per semitone, taller on every C
    for (let m = lo; m <= hi; m++) rect(pos(m), m % 12 === 0 ? 1 : 2, 1, m % 12 === 0 ? 2 : 1, ink);
    // the stepper motor and its lead screw; the thread scrolls while the head moves
    rect(4, 4, 12, 11, ink); rect(5, 5, 10, 9, paper); rect(8, 7, 4, 5, ink); if (on) rect(8 + ((fr >> 1) & 3) % 3, 7, 1, 1, paper);
    rect(16, 7, 70, 1, ink); rect(16, 11, 70, 1, ink); for (let xx = 16; xx < 86; xx += 3) rect(xx + (on ? (fr >> 1) % 3 : 0), 8, 1, 3, ink);
    rect(86, 4, 4, 11, ink);
    // the head carriage, its arm down to the disk's window, the head on the media
    const H0 = hx + buzz;
    rect(H0 - 5, 4, 11, 11, ink); rect(H0 - 3, 6, 7, 3, paper); rect(H0 - 1, 15, 3, 4, ink); rect(H0 - 3, 19, 7, 5, ink); rect(H0 - 1, 20, 3, 3, on ? ink : paper);
    if (on) { rect(H0 - 8, 7, 1, 4, ink); rect(H0 + 8, 7, 1, 4, ink); rect(H0 - 10, 8, 1, 2, ink); rect(H0 + 10, 8, 1, 2, ink); }   // the buzz
    // the bezel: the slot, the eject button, the activity light
    rect(0, 62, 100, 10, ink); rect(1, 63, 98, 8, paper); rect(8, 66, 62, 2, ink); rect(76, 65, 9, 4, ink); rect(77, 66, 7, 2, paper);
    rect(88, 65, 5, 4, ink); if (!on) rect(89, 66, 3, 2, paper); else if (o.led) rect(89, 66, 3, 2, o.led);
    if (!o.compact) { text(label, 1, 75, { font: 'chicago', color: o.labelColor || ink }); if (on) text(noteName(midi), 99, 75, { font: 'chicago', color: o.labelColor || ink, align: 'right' }); }
    return { midi, on, headX: x + H0 * sc };
  });
}
function ejectDisk(x, y, t0, o = {}) {
  const t = o.t ?? T, at = t0 ?? (evLast('kick', t) || [-1e9])[0], fr = Math.floor((t - at) * FPS + 1e-6), ink = _ink(o), paper = _paper(o);
  const out = fr < 0 || fr > 26 ? 0 : fr < 3 ? [8, 15, 19][fr] : R(19 * (1 - easeIn((fr - 3) / 23))), dip = fr >= 0 && fr < 3 ? 1 : 0;
  _scaled(x, y, 76, 58, o, () => {
    const by = dip;
    // the drive from above: its body, a vent, the front bezel with the slot
    rect(2, by, 72, 26, ink); rect(3, by + 1, 70, 24, paper); for (let i = 0; i < 5; i++) rect(10 + i * 12, by + 5, 8, 1, ink);
    rect(0, by + 24, 76, 10, ink); rect(1, by + 25, 74, 8, paper); rect(14, by + 28, 48, 2, ink);
    rect(64, by + 27, 7, 4, ink); rect(65, by + 28, 5, 2, paper);                                       // the eject button
    rect(5, by + 27, 5, 4, ink); if (!(fr >= 0 && fr < 8)) rect(6, by + 28, 3, 2, paper);               // the light, on while it moves
    // the disk spat out of the slot, label end first
    if (out > 0) clipRect(0, by + 30, 76, 28, () => _disk35(17, by + 30 + out - 46, 42, 46, ink, paper, false));
  });
  return out;
}
// a 1-bit window in two colours (the band's and the slab windows'): frame, striped title bar, close and zoom boxes
function _bitWin(x, y, w, h, ink, paper, o = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h); const tb = o.tb ?? 19;
  rect(x, y, w, h, ink); rect(x + 1, y + 1, w - 2, tb - 2, paper);
  for (let yy = y + 4; yy < y + tb - 3; yy += 2) rect(x + 2, yy, w - 4, 1, ink);
  const box = (bx) => { rect(bx - 1, y + 4, 13, tb - 7, paper); frame(bx, y + 5, 11, tb - 9, ink); };
  box(x + 8); if (w > 60) box(x + w - 20);
  if (o.title) { const tw_ = tw(o.title, 'chicago') + 12; rect(x + R((w - tw_) / 2), y + 2, tw_, tb - 4, paper); text(o.title, x + R(w / 2), y + 5, { font: 'chicago', align: 'center', color: ink }); }
  rect(x, y + tb - 1, w, 1, ink);
  const c = { x: x + 1, y: y + tb, w: w - 2, h: h - tb - 1 };
  if (o.solid) patfill(c.x, c.y, c.w, c.h, o.pattern || 'dkgray', ink, paper); else rect(c.x, c.y, c.w, c.h, paper);
  return c;
}
// slabWindow(x, y, w, h, o): a window as a silhouette: a solid black slab with only its title bar stripes and its
// close and zoom boxes cut out (o.cut: the field). For the desk in silhouette mode, instead of a stencilled window full
// of tiny text. o.ink (black), o.tb (title bar px, 19).
function slabWindow(x, y, w, h, o = {}) {
  const ink = o.ink || C.black, cut = o.cut || fieldAt() || FIELDS.magenta, tb = o.tb ?? 19;
  x = R(x); y = R(y); w = R(w); h = R(h);
  rect(x, y, w, h, ink);
  for (let yy = y + 4; yy < y + tb - 3; yy += 2) rect(x + 24, yy, w - 48, 1, cut);
  frame(x + 8, y + 5, 11, tb - 9, cut); if (w > 60) frame(x + w - 19, y + 5, 11, tb - 9, cut);
  rect(x + 2, y + tb, w - 4, 1, cut);
  return { x: x + 1, y: y + tb + 1, w: w - 2, h: h - tb - 2 };
}
function windowCloseZoom(x, y, w, h, t0, o = {}) {
  const t = o.t ?? T, at = t0 ?? (evLast('snare', t) || [-1e9])[0], d = t - at, ic = o.icon || [x + w / 2 - 8, y + h + 6], to = { x: ic[0], y: ic[1], w: 16, h: 12 };
  const ink = _ink(o), paper = _paper(o), lc = o.lineColor || ink, th = o.thick ?? 3, from = { x, y, w, h };
  const shut = d >= 0 && d < .16, gone = d >= .16 && d < .3, open = d >= .3 && d < .4;
  const outline = k => { const r = { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), w: lerp(from.w, to.w, k), h: lerp(from.h, to.h, k) }; for (let j = 0; j < 3; j++) { const kk = clamp(k - j * .14); if (j && kk <= 0) continue; const q = { x: lerp(from.x, to.x, kk), y: lerp(from.y, to.y, kk), w: lerp(from.w, to.w, kk), h: lerp(from.h, to.h, kk) }; frame(q.x, q.y, q.w, q.h, lc, j ? 1 : th); } return r; };
  if (shut) outline(easeOut(d / .16));
  else if (open) outline(1 - easeOut((d - .3) / .1));
  else if (!gone) { const c = o.win ? win(x, y, w, h, o.title || 'Snare', { active: true, zoom: false, ...o.win }) : _bitWin(x, y, w, h, ink, paper, { title: o.title ?? 'Snare', solid: o.solid !== false }); if (c && o.body) o.body(c); }
  if (o.icon !== false) { rect(ic[0], ic[1] - 2, 16, 13, shut || gone ? ink : paper); frame(ic[0], ic[1] - 2, 16, 13, ink); rect(ic[0] + 2, ic[1] + 1, 12, 1, shut || gone ? paper : ink); }
  return d;
}
function clickBurst(x, y, t0, o = {}) {
  const t = o.t ?? T, at = t0 ?? (evLast('clap', t) || [-1e9])[0], fr = Math.floor((t - at) * FPS + 1e-6), ink = o.color || _ink(o), n = o.copies || 1, rw = o.ringW ?? 4, nr = o.rings ?? 3, s = o.scale || 1;
  const down = fr >= 0 && fr < 5;
  if (fr >= 0 && fr < 14) for (let j = 0; j < nr; j++) {   // three square rings, launched a frame apart, stepping out
    const f = fr - j * 2; if (f < 0 || f > 9) continue;
    const r = R((6 + f * 5) * s * .7 + j * rw * 2);
    frame(R(x) - r, R(y) - r, 2 * r, 2 * r, ink, Math.max(1, rw - (f > 6 ? 2 : 0)));
  }
  if (o.pointer !== false) for (let i = n - 1; i >= 0; i--) { const lag = i * .008, dn = t - at - lag >= 0 && t - at - lag < 5 / FPS; pointer(x + i * 6, y + i * 3, o.kind || 'hand', { down: dn, scale: s }); }
  return down;
}
function typeLine(text_, t0, t1, keystrokes, o = {}) {
  const t = o.t ?? T, ks = keystrokes || evTimes('hat').filter(k => k >= t0 && k < t1);
  const n = Math.min(text_.length, bsearch(ks, t + 1e-9) + 1), str = text_.slice(0, n);
  if (o.x == null) return { str, n, w: 0 };
  const font = o.font || 'monaco', s = o.scale || 1, col = o.color || _ink(o), w = tw(str, font, s);
  text(str, o.x, o.y, { font, scale: s, color: col });
  const last = n > 0 ? ks[n - 1] : -1e9, pop = t - last < 2 / FPS;
  if (pop && n > 0) { const ch = str[n - 1], px = o.x + tw(str.slice(0, -1), font, s), cw = Math.max(s * 4, tw(ch, font, s)); rect(px - s, o.y - 2 * s, cw + 2 * s, capH(font, s) + 4 * s, col); text(ch, px, o.y, { font, scale: s, color: o.paper || C.white }); }
  if (o.caret !== false && (t < t1 || caretOn(t))) rect(o.x + w + s, o.y - s, s, capH(font, s) + 2 * s, col);
  return { str, n, w };
}
function trashCrumple(x, y, t0, o = {}) {
  const t = o.t ?? T, at = t0 ?? (evLast('crash', t) || [-1e9])[0], d = t - at, fr = Math.floor(d * FPS + 1e-6), ink = _ink(o), paper = _paper(o), s = Math.max(1, R(o.scale || 1));
  _scaled(x, y, 52, 56, o, () => {
    const hitN = fr >= 0 && fr < 24, bulge = fr >= 0 && fr < 6 ? 2 : 0, open = hitN ? [1, 1, 1, .9, .8, .7, .6, .5, .45, .4, .35, .3, .26, .22, .18, .15, .12, .1, .08, .06, .04, .03, .02, .01][fr] : 0;
    const bx = 15 - bulge, bw = 22 + 2 * bulge, by = 24 + (bulge ? 1 : 0), bh = 28 - (bulge ? 1 : 0);
    rect(bx, by, bw, bh, ink); rect(bx + 1, by + 1, bw - 2, bh - 2, paper);
    for (let i = 0; i < 4; i++) rect(R(bx + 4 + i * (bw - 9) / 3), by + 4, 1, bh - 8, ink);
    // the lid: hinged at its left end, it flips up on the crash
    const px = 12, py = 22, a = -1.1 * open, R_ = (u, v) => _rot(px + u, py + v, px, py, a);
    poly([R_(0, -3), R_(28, -3), R_(28, 0), R_(0, 0)], ink); poly([R_(1, -2), R_(27, -2), R_(27, -1), R_(1, -1)], paper);
    poly([R_(10, -6), R_(18, -6), R_(18, -3), R_(10, -3)], ink);
    // paper wads leap out on the hit and fall away
    if (d >= 0 && d < 1.1) for (let j = 0; j < 3; j++) {
      const vx = [-16, 4, 18][j], vy = [-62, -80, -54][j], tt = d * 1.6, wx = R(26 + vx * tt), wy = R(18 + vy * tt + 95 * tt * tt);
      const wc = o.wad || ink; if (wy < 54) { rect(wx, wy + 1, 5, 3, wc); rect(wx + 1, wy, 3, 5, wc); rect(wx + 1, wy + 1, 1, 1, paper); rect(wx + 3, wy + 3, 1, 1, paper); }
    }
  });
  // the label, below the can and outside the scaled box (so it shows at any scale)
  const lab = o.label ?? (d >= 0 && d < 1.5 ? 'Empty' : 'Trash');
  if (lab) text(lab, R(x) + 26 * s, R(y) + 56 * s + 2, { font: 'geneva', align: 'center', color: o.labelColor || ink });
  return d;
}
function progressRiser(t0, t1, o = {}) {
  const t = o.t ?? T;
  if (t0 == null) { const sp = evSpan('riser', t) || evLast('riser', t); if (!sp && !o.idle) return 0; t0 = sp ? sp[0] : t + 1; t1 = sp ? sp[1] ?? sp[0] + SPB * 4 : t + 2; }
  const live = t >= t0 - 1e-9, k = live ? prog(t, t0, t1) : 0, n = Math.max(1, R((beatAt(t1) - beatAt(t0)) * 4)), ks = Math.floor(k * n) / n, ink = _ink(o), paper = _paper(o);
  const x = o.x ?? 20, y = o.y ?? 300, w = o.w ?? 200, h = o.h ?? 12, last = live && t > t1 - SPB && t < t1, sh = last ? ((Math.floor(t * FPS) & 1) ? 1 : -1) : 0;
  if (live && t > t1 + (o.hold ?? .4) && !o.idle) return k;
  const kk = live && t > t1 + (o.hold ?? .4) ? 0 : ks;
  if (o.label !== false) { text(o.label || 'Filling the riser…', x + sh, y - 13, { font: o.font || 'geneva', color: ink }); text(R(kk * 100) + '%', x + w + sh, y - 13, { font: o.font === 'chicago' ? 'chicago' : 'monaco', color: ink, align: 'right' }); }
  rect(x + sh, y, w, h, ink); rect(x + sh + 1, y + 1, w - 2, h - 2, paper);
  const fw = R((w - 4) * kk); rect(x + sh + 2, y + 2, fw, h - 4, ink);
  if (last && (Math.floor(t * FPS) >> 1) & 1) rect(x + sh + 2, y + 2, fw, h - 4, paper);
  return k;
}
// an icon in two colours: its dark pixels -> ink, its light ones -> paper (a colour icon goes 1-bit; in silhouette mode
// the bell becomes a black shape with field cut-outs)
const _icInk = new Map();
function _iconInk(c, ink, paper) {
  let m = _icInk.get(c); if (!m) _icInk.set(c, m = new Map());
  const key = ink + paper; let o = m.get(key); if (o) return o;
  const [ir, ig, ib] = rgb(ink), [pr, pg, pb] = rgb(paper);
  o = offscreen(c.width, c.height, () => { ctx.drawImage(c, 0, 0); const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data; for (let i = 0; i < px.length; i += 4) { if (px[i + 3] < 128) { px[i + 3] = 0; continue; } const dark = px[i] * .299 + px[i + 1] * .587 + px[i + 2] * .114 < 128; px[i] = dark ? ir : pr; px[i + 1] = dark ? ig : pg; px[i + 2] = dark ? ib : pb; px[i + 3] = 255; } ctx.putImageData(d, 0, 0); });
  m.set(key, o); return o;
}
function bellRing(x, y, t0, midi, o = {}) {
  const t = o.t ?? T, e = t0 == null ? evLast('bell', t) : [t0, midi], at = e ? e[0] : -1e9, m = midi ?? (e && e[1]) ?? 74, d = t - at, ink = o.ink || P.text || C.black, rc = o.ringColor || ink;
  const swing = d >= 0 && d < .5 ? R(Math.sin(d * 40) * 3 * (1 - d / .5)) : 0, s = o.scale || 1;
  const ic = o.paper ? iconCanvas(o.icon || 'writingBell', 32) : null;
  if (ic) ctx.drawImage(_iconInk(ic, ink, o.paper), R(x + swing), R(y), 32 * s, 32 * s);   // two colours: the band's 1-bit
  else icon(o.icon || 'writingBell', x + swing, y, { scale: s });
  const cx = x + 16 * s, cy = y + 12 * s;
  if (d >= 0 && d < .45) {
    const r = R(18 * s + d * 60 * s);
    for (const sd of [-1, 1]) for (let j = -3; j <= 3; j++) rect(cx + sd * r + R(-Math.abs(j) * Math.abs(j) * .5 * sd), cy + j * 3 * s, 2 * s, 2 * s, rc);
    const ny = R(cy - 20 * s - d * 70 - (m - 70) * 2), nx = cx + 18 * s;
    spr('it_note', nx, ny, { scale: s, tint: rc });
  }
  return d;
}
function bandGrid(x, y, w, h, o = {}) {
  const t = o.t ?? T, s = o.scale ?? (w >= 600 ? 2 : 1), fld = o.field ? fieldCol(o.field) : null;
  const K = C.black, Lt = fld || C.white, sw = c => c === K ? Lt : K;   // an inverted pad swaps black and the light colour (sw(bg) is also the colour that reads on a pad)
  const base = fld ? { bg: fld, ink: fld, paper: K } : { bg: C.white, ink: K, paper: C.white };
  const g = 4 * s - 1, tabH = s > 1 ? 16 : 12, typH = s > 1 ? 44 : 22, rizH = s > 1 ? 12 : 8;
  const r1h = R((h - 4 * g - 2 * tabH - typH - rizH) * .58), r2h = h - 4 * g - 2 * tabH - typH - rizH - r1h;
  const y1 = y + g + tabH, yT = y1 + r1h + g, y2 = yT + typH + tabH, yR = y2 + r2h + g;
  rect(x, y, w, h, base.bg);
  const pad = (px, py, pw, ph, label, ch, art) => {
    const hf = evFrames(ch, t), slam = hf < 3 ? [4, 2, 1][hf] * (s > 1 ? 1 : .5) : 0, inv = hf < 2, cs = inv ? { bg: sw(base.bg), ink: sw(base.ink), paper: sw(base.paper) } : base;
    const sl = R(slam);
    // the tab, outside the art: top-left, Chicago
    const lw = tw(label, 'chicago') + 12; rect(px, py - tabH, lw, tabH, K); text(label, px + 6, py - tabH + R((tabH - capH('chicago')) / 2), { font: 'chicago', color: fld || C.white });
    rect(px - sl, py - sl, pw + 2 * sl, ph + 2 * sl, K); rect(px - sl + 3, py - sl + 3, pw + 2 * sl - 6, ph + 2 * sl - 6, cs.bg);
    clipRect(px + 3, py + 3, pw - 6, ph - 6, () => art(px + 3, py + 3 + sl, pw - 6, ph - 6, cs));
  };
  // row 1: the bass floppies and the kick
  const c1 = 3, pw1 = R((w - (c1 + 1) * g) / c1);
  const fl = (lab, ch) => (px, py, pw, ph, cs) => { const fw = 100 * s, fh = 72 * s; floppyDrive(px + R((pw - fw) / 2), py + R((ph - fh) / 2), lab, ch, t, { scale: s, compact: true, ink: cs.ink, paper: cs.paper }); };
  const nn = ch => { const e = evNote(ch, t) || evLast(ch, t); return e ? ' ' + noteName(e[1]) : ''; };
  pad(x + g, y1, pw1, r1h, 'A:' + nn('floppyA'), 'floppyA', fl('A:', 'floppyA'));
  pad(x + 2 * g + pw1, y1, pw1, r1h, 'B:' + nn('floppyB'), 'floppyB', fl('B:', 'floppyB'));
  pad(x + 3 * g + 2 * pw1, y1, w - 4 * g - 2 * pw1, r1h, 'KICK', 'kick', (px, py, pw, ph, cs) => ejectDisk(px + R((pw - 76 * s) / 2), py + R((ph - 58 * s) / 2), null, { scale: s, ink: cs.ink, paper: cs.paper, t }));
  // the hats: YOU KEEP THE PEN typed across the middle, one key per hat
  const ts = s > 1 ? 4 : 2, txt = o.typed || 'YOU KEEP THE PEN', bar0 = barTime(Math.floor(barAt(t) / 2) * 2), tx = x + R((w - tw(txt, 'chicago', ts)) / 2);
  rect(x + g, yT, w - 2 * g, typH, base.bg === C.white ? C.white : base.bg);
  typeLine(txt, bar0, bar0 + 8 * SPB, null, { x: tx, y: yT + R((typH - capH('chicago', ts)) / 2), font: 'chicago', scale: ts, color: K, paper: fld || C.white, t });
  // row 2: snare, clap, crash, bell
  const c2 = 4, pw2 = R((w - (c2 + 1) * g) / c2), px2 = i => x + g + i * (pw2 + g);
  pad(px2(0), y2, pw2, r2h, 'SNARE', 'snare', (px, py, pw, ph, cs) => { const ww = R(pw * .7), wh = R(ph * .72); windowCloseZoom(px + R((pw - ww) / 2) - 8, py + R((ph - wh) / 2) - 2, ww, wh, null, { t, ink: cs.ink, paper: cs.paper, lineColor: sw(cs.bg), title: '', icon: [px + pw - 22, py + ph - 16] }); });
  pad(px2(1), y2, pw2, r2h, 'CLAP', 'clap', (px, py, pw, ph, cs) => {
    const hx = px + R(pw / 2), hy = py + R(ph / 2), at = (evLast('clap', t) || [-1e9])[0], fr = Math.floor((t - at) * FPS + 1e-6);
    clickBurst(hx, hy, at, { t, color: sw(cs.bg), pointer: false, scale: s, ringW: 2 * s });
    const pc = tinted(SPR.ptr_hand, sw(cs.bg)), ps = s + 1, sq = fr >= 0 && fr < 5 ? ps : 0;   // a solid hand: the silhouette of the pointer
    ctx.drawImage(pc, hx - 5 * ps + sq, hy - ps + sq, pc.width * ps, (pc.height - (sq ? 1 : 0)) * ps);
  });
  pad(px2(2), y2, pw2, r2h, 'CRASH', 'crash', (px, py, pw, ph, cs) => trashCrumple(px + R((pw - 52 * s) / 2), py + ph - 56 * s + 2 * s, null, { scale: s, ink: cs.ink, paper: cs.paper, wad: sw(cs.bg), label: '', t }));
  pad(px2(3), y2, w - 2 * g - 3 * (pw2 + g), r2h, 'BELL', 'bell', (px, py, pw, ph, cs) => bellRing(px + R((pw - 32 * s) / 2), py + R((ph - 32 * s) / 2) + 4 * s, null, null, { scale: s, ink: cs.ink, paper: cs.paper, ringColor: sw(cs.bg), t }));
  // the riser: one chunky bar along the bottom, its label in a tab at the left
  const rl = 'RISER', rlw = tw(rl, 'chicago') + 12;
  rect(x + g, yR, rlw, rizH, K); if (rizH >= 12) text(rl, x + g + 6, yR + R((rizH - capH('chicago')) / 2), { font: 'chicago', color: fld || C.white });
  progressRiser(null, null, { x: x + g + rlw + 4, y: yR, w: w - 2 * g - rlw - 4, h: rizH, label: false, idle: true, hold: 9, ink: K, paper: fld || C.white, t });
}
function deskBand(x, y, o = {}) { return bandGrid(x, y, 400, 210, { ...o, scale: 1 }); }

// =====================================================================================================
// Warm-up. warmUp(fn) registers a cache-building job; main calls styleWarm() once at boot (before READY), so the first
// frame of a flood or of a new dance pose does not hitch in the preview. Every dance pose at every stop-motion step is
// built here (mouth shut, both sides, squash variants: the frames a dancer mostly shows).
// =====================================================================================================
const _warm = [];
const warmUp = fn => { _warm.push(fn); };
function styleWarm() {
  for (const f of _warm) { try { f(); } catch (e) { /* a warm-up is an optimisation only */ } }
  const c = styleBuf('warm', 8, 8), m = { open: 0, shape: 'A' };
  offscreen(8, 8, () => { for (const n of DANCE_POSES) for (const sd of [-1, 1]) for (let i = 0; i < 8; i++) { const sp = _poseSpec(n, i / 8, sd); if (!sp.air) { if (i < 1) { sp.bw += 2; sp.bh -= 2; } else if (i < 3) { sp.bw -= 1; sp.bh += 1; } } _dancePuppet(sp, m, C.black, FIELDS.lime, false, true); } }, c);
}
