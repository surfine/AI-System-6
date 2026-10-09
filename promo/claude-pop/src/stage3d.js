// stage3d.js: THE 3D STAGE. three.js pseudo-3D, brought back to the film's material. One WebGL renderer on an offscreen
// canvas draws a three.js scene; every pixel is read back, snapped to the active palette (exact colours pass, the rest go
// to their two nearest palette colours by a 4x4 Bayer threshold) and drawn into the frame nearest-neighbour.
// Rules: a stage is built once (stage3d(key, build)); every transform is set from t each frame (no clocks, no animation
// loops, no Math.random); flat unlit materials, 2-3 hard light bands as per-face colours; cut-outs, fades and fog are
// screen-door Bayer discards, never alpha blends. index.html imports three.js as an ES module (window.THREE); main.js
// calls init3d() before READY. SwiftShader pays ~.13 ms a draw call: merge what does not move (bandGeo). TOOLKIT §13.
'use strict';

const S3D = { ok: false, err: null, stages: new Map(), tex: new Map(), geo: new Map(), dgeo: new Map(), pals: new Map(), img: {} };
const D3 = FH / 2 / Math.tan(Math.PI / 12);   // camera distance at which a 640x360 plane at z = 0 is exactly 1:1 (fov 30)
function init3d() {
  if (S3D.ok || S3D.err) return S3D.ok;
  if (typeof THREE === 'undefined') { S3D.err = window.THREE_ERR || 'three.js did not load'; return false; }
  try {
    THREE.ColorManagement.enabled = false;   // colours and texels pass through untouched (no sRGB round trip)
    const c = document.createElement('canvas'); c.width = FW; c.height = FH;
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: false, preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: false });
    r.setPixelRatio(1); r.setSize(FW, FH, false); r.outputColorSpace = THREE.LinearSRGBColorSpace; r.setScissorTest(true);
    Object.assign(S3D, { ok: true, r, gl: r.getContext(), cv: c, buf: new Uint8Array(FW * FH * 4) });
  } catch (e) { S3D.err = 'WebGL: ' + e.message; }
  return S3D.ok;
}
const has3d = () => S3D.ok || init3d();

// ---- materials: MeshBasicMaterial with the alpha test replaced by a Bayer screen door (map alpha x opacity x fog) ----
const _TH3 = 'float s3dTh(){int x=int(gl_FragCoord.x)&3,y=3-(int(gl_FragCoord.y)&3);int m[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);return(float(m[y*4+x])+.5)/16.;}\n';
function _patch3(sh) {
  sh.fragmentShader = sh.fragmentShader.replace('void main() {', _TH3 + 'void main() {')
    .replace('#include <alphatest_fragment>', '#ifndef S3D_SOLID\n{float a=diffuseColor.a;\n#ifdef USE_FOG\na*=1.-smoothstep(fogNear,fogFar,vFogDepth);\n#endif\nif(a<s3dTh())discard;}\n#endif\ndiffuseColor.a=1.;')
    .replace('#include <fog_fragment>', '');
}
// mat3d(o): flat, unlit. o.map, color, vc, fade, fog, side, solid (no screen door: twice as quick), auto (a door with a
// solid twin, used whenever the mesh is opaque and nearer than the fog)
function mat3d(o = {}) {
  const m = new THREE.MeshBasicMaterial({ map: o.map || null, color: o.color ?? '#ffffff', vertexColors: !!o.vc, fog: !o.solid && o.fog !== false, side: o.side === 'double' ? THREE.DoubleSide : o.side === 'back' ? THREE.BackSide : THREE.FrontSide });
  if (o.solid) m.defines = { S3D_SOLID: '' };
  m.opacity = 1 - (o.fade || 0); m.onBeforeCompile = _patch3; m.customProgramCacheKey = () => o.solid ? 's3ds' : 's3d';
  if (o.auto) m.userData.solid = mat3d({ ...o, auto: false, solid: true });
  return m;
}
const matOf = ob => ob.userData.door || ob.material;   // the material to colour or fade (not its solid twin)
function _twins(st) {
  const fog = st.scene.fog, cp = st.cam.position, c = new THREE.Vector3();
  st.scene.updateMatrixWorld();
  st.scene.traverse(ob => {
    const d = ob.userData.door || (ob.material && ob.material.userData && ob.material.userData.solid && (ob.userData.door = ob.material));
    if (!d) return;
    const s = d.userData.solid, g = ob.geometry; s.color.copy(d.color); s.map = d.map;
    let near = true;
    if (fog) { if (!g.boundingSphere) g.computeBoundingSphere(); c.copy(g.boundingSphere.center).applyMatrix4(ob.matrixWorld); near = c.distanceTo(cp) + g.boundingSphere.radius * ob.matrixWorld.getMaxScaleOnAxis() < fog.near; }
    ob.material = d.opacity >= 1 && near ? s : d;
  });
}
const lineMat3d = (o = {}) => { const m = new THREE.LineBasicMaterial({ color: o.color ?? '#000000', fog: o.fog !== false }); m.onBeforeCompile = _patch3; m.customProgramCacheKey = () => 's3dl'; return m; };
// fade3d(obj, k): screen-door fade of an object and its children (0 solid, .5 the 50% ghost, 1 gone)
function fade3d(ob, k) { ob.visible = k < 1; ob.traverse(o => { for (const m of [].concat(matOf(o) || [])) m.opacity = 1 - k; }); }

// ---- textures from the 2D kit ----
// tex3d(key, w, h, draw, o): a 2D kit drawing as a texture, Nearest; o.mip (box-averaged levels), o.live (a signature)
function tex3d(key, w, h, draw, o = {}) {
  let rec = S3D.tex.get(key);
  if (!rec) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d', { willReadFrequently: true });
    const tx = new THREE.CanvasTexture(c); tx.magFilter = THREE.NearestFilter; tx.generateMipmaps = !!o.mip; tx.minFilter = o.mip ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter;
    rec = { c, tx, sig: {}, cols: null }; tx.userData.rec = rec; S3D.tex.set(key, rec);
  }
  const sig = o.live ?? 0;
  if (rec.sig !== sig) { rec.sig = sig; offscreen(w, h, () => { ctx.clearRect(0, 0, w, h); draw(rec.c); }, rec.c); rec.tx.needsUpdate = true; rec.cols = null; }
  return rec.tx;
}
// deskTex(key, t, src, o): a whole frame through frameInto (src: a scene name or fn(t) with o.era ...), the frame at t
//   drawn once (o.live: redrawn at every t, ~5 ms + its upload); mip on unless o.mip is false
const deskTex = (key, t, src, o = {}) => tex3d(key, FW, FH, c => frameInto(c, t, src, o), { mip: o.mip ?? true, live: o.live ? t : 0 });
const _pkHex = h => { const [r, g, b] = rgb(h); return r | g << 8 | b << 16; };
const _pkF = (r, g, b) => R(r * 255) | R(g * 255) << 8 | R(b * 255) << 16;
function _cols(rec) { // the colours of a texture's opaque texels, counted
  if (rec.cols) return rec.cols;
  const u = new Uint32Array(rec.c.getContext('2d').getImageData(0, 0, rec.c.width, rec.c.height).data.buffer), m = new Map();
  let last = -1, n = 0;
  for (let i = 0; i <= u.length; i++) {
    const c = i < u.length && u[i] >>> 24 >= 128 ? u[i] & 0xffffff : -1;
    if (c === last) { n++; continue; }
    if (last >= 0) m.set(last, (m.get(last) || 0) + n);
    last = c; n = 1;
  }
  return rec.cols = m;
}

// ---- geometry ----
// card3d(tex, w, h, o): a flat double-sided card facing +z, cut out where the drawing is clear (o.base: origin at its
//   bottom edge, so it stands on the floor; o.solid for an opaque drawing)
function card3d(tex, w, h, o = {}) { const g = new THREE.PlaneGeometry(w, h); if (o.base) g.translate(0, h / 2, 0); return new THREE.Mesh(g, mat3d({ map: tex, side: 'double', color: o.color, fog: o.fog, solid: o.solid })); }
// bandGeo(boxes) -> one vertex-coloured geometry (one draw call) of boxes {w, h, d, pos, ry, cols: [+x, -x, +y, -y, +z, -z]}
//   (a null colour leaves that face out). Hard light bands: band3(colour) gives [side, side, top, top, front, back].
const band3 = (c, front = c, back = C.black) => [darken(c, .35), darken(c, .35), darken(c, .2), darken(c, .2), front, back];
function bandGeo(boxes) {
  const P = [], K = [];
  for (const b of boxes) {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed(); g.rotateY(b.ry || 0); g.translate(...b.pos);
    const pa = g.attributes.position.array;
    g.groups.forEach((gr, i) => { if (!b.cols[i]) return; const c = rgb(b.cols[i]); for (let k = gr.start; k < gr.start + gr.count; k++) { P.push(pa[k * 3], pa[k * 3 + 1], pa[k * 3 + 2]); K.push(c[0] / 255, c[1] / 255, c[2] / 255); } });
    g.dispose();
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(K, 3));
  return g;
}
// voxel columns: every set cell of a w x h mask (row 0 on top) as a 1 x 1 x d column, exposed faces only, merged into runs;
// origin at mask (ox, oy), y up, centred on z0; each face's vertex colour is its light level (front, back, sides, caps)
function _vox(P, K, mask, w, h, d, ox, oy, z0, lv) {
  const a = d / 2, on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] > 0;
  const q = (g, p) => { for (const i of [0, 1, 2, 0, 2, 3]) { P.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2] + z0); K.push(lv[g], lv[g], lv[g]); } };
  for (let y = 0; y < h; y++) for (let x = 0; x < w;) {
    if (!on(x, y)) { x++; continue; }
    let e = x; while (on(e, y)) e++;
    const X0 = x - ox, X1 = e - ox, Y0 = oy - y - 1, Y1 = oy - y;
    q(0, [X0, Y0, a, X1, Y0, a, X1, Y1, a, X0, Y1, a]); q(1, [X1, Y0, -a, X0, Y0, -a, X0, Y1, -a, X1, Y1, -a]); x = e;
  }
  for (const s of [-1, 1]) {
    for (let x = 0; x < w; x++) for (let y = 0; y < h;) {
      if (!on(x, y) || on(x + s, y)) { y++; continue; }
      let e = y; while (on(x, e) && !on(x + s, e)) e++;
      const X = (s < 0 ? x : x + 1) - ox, Ya = oy - e, Yb = oy - y;
      q(2, s < 0 ? [X, Ya, -a, X, Ya, a, X, Yb, a, X, Yb, -a] : [X, Ya, a, X, Ya, -a, X, Yb, -a, X, Yb, a]); y = e;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w;) {
      if (!on(x, y) || on(x, y + s)) { x++; continue; }
      let e = x; while (on(e, y) && !on(e, y + s)) e++;
      const Y = s < 0 ? oy - y : oy - y - 1, X0 = x - ox, X1 = e - ox;
      q(3, s < 0 ? [X0, Y, a, X1, Y, a, X1, Y, -a, X0, Y, -a] : [X0, Y, -a, X1, Y, -a, X1, Y, a, X0, Y, a]); x = e;
    }
  }
}
const _geo = (P, K) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(K, 3)); return g; };
// voxGeo(mask, w, h, d, ox, oy, levels) -> the voxel geometry, vertex colours = light levels (default LV3: a black front
//   and back, sides at half the material colour, caps at three quarters: draw it with mat3d({color: field, vc: true}))
const LV3 = [0, 0, .5, .75];
function voxGeo(mask, w, h, d = 1, ox = w / 2, oy = h / 2, lv = LV3) { const P = [], K = []; _vox(P, K, mask, w, h, d, ox, oy, 0, lv); return _geo(P, K); }
const maskOf = (c, test = (r, g, b, a) => a >= 128) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, m = new Uint8Array(c.width * c.height); for (let i = 0; i < m.length; i++) m[i] = test(d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]) ? 1 : 0; return m; };
// voxGlyph(ch, font, d, lv): a glyph's 1-bit bitmap (the one bigType scales) as voxels, cached; origin at the pen position
//   on the cap baseline, so letters stand side by side at their advances
function voxGlyph(ch, font = 'chicago', d = 3, lv = LV3) {
  const fk = fontKey(font), key = fk + '|' + ch + '|' + d + '|' + lv; let g = S3D.geo.get(key); if (g) return g;
  const f = FONTS[fk], c = _raster(ch, fk, '#000000');
  g = voxGeo(maskOf(c), c.width, c.height, d, 1, f.top + f.cap, lv); S3D.geo.set(key, g); return g;
}
// voxText(lines, o) -> {group, letters, chars, w, h}: voxel type, one mesh per letter; o.size, depth, lead, align, levels
function voxText(lines, o = {}) {
  const fk = fontKey(o.font || 'chicago'), f = FONTS[fk], s = o.size ?? 10, d = o.depth ?? 3, lead = o.lead ?? 2, group = new THREE.Group(), letters = [];
  lines = (Array.isArray(lines) ? lines : String(lines).split('\n')).map(l => [...(f.ascii ? _asciiFold(l) : l)]);
  const H0 = lines.length * (f.cap + lead) - lead, widths = lines.map(cs => cs.reduce((a, ch) => a + tw(ch, fk), 0)), mw = Math.max(...widths);
  let n = 0;
  lines.forEach((cs, li) => {
    let x = o.align === 'left' ? -mw / 2 : o.align === 'right' ? mw / 2 - widths[li] : -widths[li] / 2;
    const y = H0 / 2 - f.cap - li * (f.cap + lead);
    cs.forEach((ch, ci) => {
      const adv = tw(ch, fk);
      if (ch !== ' ') {
        const m = new THREE.Mesh(voxGlyph(ch, fk, d, o.levels), mat3d({ color: o.color || FIELDS.magenta, vc: true, auto: true }));
        m.scale.setScalar(s); m.position.set(x * s, y * s, 0); group.add(m);
        letters.push({ mesh: m, ch, li, ci, n: n++, base: m.position.clone(), x: x * s, y: y * s, w: adv * s, h: f.cap * s });
      }
      x += adv;
    });
  });
  return { group, letters, chars: lines, w: mw * s, h: H0 * s };
}
const voxColor = (v, c) => v.letters.forEach(L => matOf(L.mesh).color.set(c));
// slam3d(L, t, tIn, o): slam in along z on tIn in hard frame steps; before it hidden, or o.ghost: the 50% ghost
const SLAM3 = [1, .55, .25, .08, -.04, 0];
function slam3d(L, t, tIn, o = {}) {
  const m = L.mesh, fr = tIn == null ? 99 : Math.floor((t - tIn) * FPS + 1e-6);
  m.position.copy(L.base);
  if (fr < 0) { fade3d(m, o.ghost ? .5 : 1); return false; }
  fade3d(m, 0);
  if (fr < SLAM3.length) m.position.z += SLAM3[fr] * (o.from ?? 600);
  return true;
}
// face3d(obj, cam, yaw = true): turn an object's front to the camera (yaw only: it stays upright)
function face3d(ob, cam, yaw = true) {
  const p = new THREE.Vector3(); ob.getWorldPosition(p);
  if (yaw) ob.rotation.set(0, Math.atan2(cam.position.x - p.x, cam.position.z - p.z), 0); else ob.quaternion.copy(cam.quaternion);
}
const _fnv = u => { let h = 2166136261; for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619); return h >>> 0; };
// dancer3d(st, key, t, o): clioDance as an extruded 1-bit voxel sprite (one draw) or a card; o.pos [x, z], o.size
function dancer3d(st, key, t, o = {}) {
  const fld = fieldCol(o.field || fieldAt(t) || 'magenta'), card = o.mode === 'card', px = card ? o.px ?? 3 : 1, M = 3, s = o.size ?? 8;
  const c = styleBuf('dnc' + px, DU.W * px + 2 * M, DU.H * px + 2 * M, true), tk = st.key + '|dc|' + key;
  paintInto(c, () => clioDance(DU.CX * px + M, DU.GY * px + M, px, t, { ...o, field: fld, rim: fld, rimW: card ? 2 : 1, ground: false, shadow: false }));
  let D = st.o['d|' + key];
  if (!D) {
    D = st.o['d|' + key] = { g: new THREE.Group() }; st.scene.add(D.g);
    D.body = card ? card3d(tex3d(tk, c.width, c.height, () => {}), c.width, c.height, { base: true }) : new THREE.Mesh(undefined, mat3d({ vc: true, solid: true }));
    D.g.add(D.body);
  }
  const u = new Uint32Array(c.getContext('2d').getImageData(0, 0, c.width, c.height).data.buffer), hs = _fnv(u);
  if (card) {   // re-uploaded only when the drawing changes; its bottom edge is the canvas's: drop it onto the floor
    tex3d(tk, c.width, c.height, () => ctx.drawImage(c, 0, 0), { live: hs });
    D.g.scale.setScalar(s / px); D.body.position.y = -((DU.H - DU.GY) * px + M);
  } else {
    const dz = o.depth ?? 4, h = hs + '|' + dz;
    let G = S3D.dgeo.get(h);
    if (!G) {
      const ink = new Uint8Array(u.length), rim = new Uint8Array(u.length), P = [], K = [];
      for (let i = 0; i < u.length; i++) if (u[i] >>> 24 >= 128) ((u[i] & 255) + (u[i] >> 8 & 255) + (u[i] >> 16 & 255) < 120 ? ink : rim)[i] = 1;
      _vox(P, K, ink, c.width, c.height, dz, c.width / 2, DU.GY + M, 0, LV3); _vox(P, K, rim, c.width, c.height, 1, c.width / 2, DU.GY + M, -dz / 2 - .5, [1, 1, 1, 1]);
      if (S3D.dgeo.size > 600) { for (const g of S3D.dgeo.values()) g.dispose(); S3D.dgeo.clear(); }
      S3D.dgeo.set(h, G = _geo(P, K));
    }
    D.body.geometry = G; D.body.material.color.set(fld); D.g.scale.setScalar(s);
  }
  const [x, z] = o.pos || [0, 0]; D.g.position.set(x, 0, z);
  if (o.yaw != null) D.g.rotation.set(0, o.yaw, 0); else face3d(D.g, st.cam);
  return D.g;
}

// ---- the camera rig: keyframes of t ----
// cam3d(t, keys, o) -> {pos, look, fov, roll}: keys [[t, {pos, look, fov, roll} | orbit3d(c, r, a, h), ease]]; eases
// hard (default), snap, whip, cut, lin, step (16ths) or fn; o.fps: stop-motion sampling
const EASE3 = { hard: k => k < .5 ? 8 * k ** 4 : 1 - 8 * (1 - k) ** 4, snap: k => 1 - (1 - k) ** 5, whip: k => .5 + .5 * Math.tanh(9 * (k - .5)) / Math.tanh(4.5), lin: k => k, cut: k => k >= 1 ? 1 : 0 };
const orbit3d = (c, r, a, h = 0) => ({ orbit: [c[0], c[1], c[2], r, a, h] });
const _l3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const _orbP = o => [o[0] + o[3] * Math.sin(o[4]), o[1] + o[5], o[2] + o[3] * Math.cos(o[4])];
function cam3d(t, ks, o = {}) {
  if (o.fps) t = Math.floor(t * o.fps + 1e-6) / o.fps;
  let acc = { pos: [0, 0, D3], look: [0, 0, 0], fov: 30, roll: 0 };
  const rs = ks.map(k => { acc = { ...acc, ...k[1] }; if (!k[1].orbit) delete acc.orbit; else { acc.pos = _orbP(acc.orbit); if (!k[1].look) acc.look = acc.orbit.slice(0, 3); } return [k[0], acc, k[2]]; });
  let i = 0; while (i < rs.length - 1 && t >= rs[i + 1][0]) i++;
  const A = rs[i], B = rs[i + 1];
  if (!B || t <= A[0]) return A[1];
  const e = B[2] || 'hard', raw = prog(t, A[0], B[0]), ns = Math.max(1, R((B[0] - A[0]) / (SPB / 4)));
  const k = typeof e === 'function' ? e(raw) : e === 'step' ? Math.floor(raw * ns + 1e-6) / ns : EASE3[e](raw), a = A[1], b = B[1];
  const pos = a.orbit && b.orbit ? _orbP(a.orbit.map((v, j) => lerp(v, b.orbit[j], k))) : _l3(a.pos, b.pos, k);
  return { pos, look: _l3(a.look, b.look, k), fov: lerp(a.fov, b.fov, k), roll: lerp(a.roll, b.roll, k) };
}
// aim3d(cam, state): put a THREE camera where cam3d says
function aim3d(cam, s) { cam.position.set(...s.pos); cam.up.set(0, 1, 0); cam.lookAt(...s.look); if (s.roll) cam.rotateZ(s.roll); cam.fov = s.fov ?? 30; cam.updateProjectionMatrix(); }
// whip3d(t, keys, o): on a fast turn the frame smears (a hard pixel sort, palette only, type rows kept) while it whips;
//   returns the turn in radians per frame
function whip3d(t, ks, o = {}) {
  const v = s => { const d = s.look.map((x, j) => x - s.pos[j]), l = Math.hypot(...d); return d.map(x => x / l); };
  const a = v(cam3d(t, ks, o)), b = v(cam3d(t - 1 / FPS, ks, o)), ang = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
  if (ang > (o.min ?? .035) && o.fx !== false) FX.pixelSort = { rows: clamp(R(ang * 400), 8, 40), len: 240, seed: Math.floor(t * FPS), dir: a[0] * b[2] - a[2] * b[0] > 0 ? 1 : -1 };
  return ang;
}

// ---- quantise and composite ----
// a palette record: exact colours (a 24-bit bitset) pass through; any other colour (binned 5 bits a channel) goes to the
// nearest candidate a and the partner b whose segment a-b passes closest, mixed k/16 by the Bayer threshold
function _palRec(cand, exact, key) {
  let q = S3D.pals.get(key); if (q) return q;
  const n = Math.min(cand.length, 2047), pc = new Uint32Array(n), L = new Float32Array(n * 3), bits = new Uint8Array(1 << 21);
  for (let i = 0; i < n; i++) { const c = cand[i]; pc[i] = (c | 0xff000000) >>> 0; L[i * 3] = (c & 255) * 1.732; L[i * 3 + 1] = (c >> 8 & 255) * 2; L[i * 3 + 2] = (c >> 16 & 255) * 1.414; }
  for (const c of exact || cand) bits[c >> 3] |= 1 << (c & 7);
  q = { n, pc, L, bits, bins: new Int32Array(32768).fill(-1) };
  if (S3D.pals.size > 16) S3D.pals.clear();
  S3D.pals.set(key, q); return q;
}
function _pair(q, r, g, b) {
  const x = r * 1.732, y = g * 2, z = b * 1.414, L = q.L; let a = 0, ad = 1e18;
  for (let i = 0; i < q.n; i++) { const dx = L[i * 3] - x, dy = L[i * 3 + 1] - y, dz = L[i * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d < ad) { ad = d; a = i; } }
  const ax = L[a * 3], ay = L[a * 3 + 1], az = L[a * 3 + 2]; let bi = a, bk = 0, be = ad;
  for (let i = 0; i < q.n; i++) {
    const ex = L[i * 3] - ax, ey = L[i * 3 + 1] - ay, ez = L[i * 3 + 2] - az, len = ex * ex + ey * ey + ez * ez; if (!len) continue;
    let k = ((x - ax) * ex + (y - ay) * ey + (z - az) * ez) / len; if (k <= 0) continue; k = Math.min(1, k);
    const px = ax + ex * k - x, py = ay + ey * k - y, pz = az + ez * k - z, e = px * px + py * py + pz * pz;
    if (e < be) { be = e; bi = i; bk = k; }
  }
  return a | bi << 11 | R(bk * 16) << 22;
}
function _quant(q, src, out, w, h, bayer, alpha) {
  const { bins, pc, bits } = q;
  for (let y = 0; y < h; y++) {
    const s0 = (h - 1 - y) * w, o0 = y * w, br = (y & 3) * 4;   // GL rows run bottom-up
    for (let x = 0; x < w; x++) {
      const v = src[s0 + x];
      if (alpha && v >>> 24 < 128) { out[o0 + x] = 0; continue; }
      const c = v & 0xffffff;
      if (bits[c >> 3] & 1 << (c & 7)) { out[o0 + x] = c | 0xff000000; continue; }
      const bin = (c & 0xf8) << 7 | c >> 6 & 0x3e0 | c >> 19 & 0x1f;
      let e = bins[bin]; if (e < 0) e = bins[bin] = _pair(q, (c & 0xf8) | 4, (c >> 8 & 0xf8) | 4, (c >> 16 & 0xf8) | 4);
      out[o0 + x] = pc[(e >>> 22) > (bayer ? BAYER4[br + (x & 3)] : 7.5) ? e >> 11 & 2047 : e & 2047];
    }
  }
}
// the stage's own palette: every colour its textures use (all pass exactly), its plain and vertex colours; the 2047 most
// used are the dither candidates
function _stagePal(st) {
  const m = new Map(), add = (c, n) => m.set(c, (m.get(c) || 0) + n);
  st.scene.traverse(ob => {
    for (const mt of [].concat(ob.material || [])) {
      const rec = mt.map && mt.map.userData.rec, k = mt.color, va = mt.vertexColors && ob.geometry && ob.geometry.attributes.color;
      if (rec) for (const [c, n] of _cols(rec)) add(c, n);
      else if (va) for (let i = 0; i < va.count; i += 6) add(_pkF(va.getX(i) * k.r, va.getY(i) * k.g, va.getZ(i) * k.b), 1e9);
      else if (k) add(_pkF(k.r, k.g, k.b), 1e9);
    }
  });
  for (const c of st.extra || []) add(_pkHex(c), 1e9);
  const all = [...m].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  return _palRec(all.slice(0, 2047), all, 'st|' + st.key);
}
// stage3d(key, build) -> the stage {key, scene, cam, o (your objects), pal, extra, bg}, built once by build(st)
function stage3d(key, build) {
  let st = S3D.stages.get(key);
  if (!st && has3d()) { st = { key, scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(30, FW / FH, 4, 40000), o: {} }; build(st); S3D.stages.set(key, st); }
  return st || null;
}
// render3d(st, o): render, read back, quantise, draw. o.div, o.w, o.h, o.x, o.y, o.pal, o.bayer, o.bg (null: transparent)
function render3d(st, o = {}) {
  if (!st || !has3d()) return _no3d();
  const { r, gl } = S3D, div = o.div || st.div || 1, w = R((o.w || W) / div), h = R((o.h || H) / div), bg = o.bg === undefined ? st.bg ?? C.black : o.bg;
  st.cam.aspect = w / h; st.cam.updateProjectionMatrix(); _twins(st);
  r.setViewport(0, FH - h, w, h); r.setScissor(0, FH - h, w, h); r.setClearColor(bg == null ? 0 : bg, bg == null ? 0 : 1);
  r.render(st.scene, st.cam);
  gl.readPixels(0, FH - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(S3D.buf.buffer, 0, w * h * 4));
  const p = o.pal || st.pal, q = p ? _palRec(p.map(_pkHex), null, p.join()) : st._q || (st._q = _stagePal(st));
  const k = w + 'x' + h, buf = styleBuf('s3d' + k, w, h, true), img = S3D.img[k] || (S3D.img[k] = buf.getContext('2d').createImageData(w, h));
  _quant(q, new Uint32Array(S3D.buf.buffer, 0, w * h), new Uint32Array(img.data.buffer), w, h, o.bayer !== false, bg == null);
  buf.getContext('2d').putImageData(img, 0, 0);
  ctx.drawImage(buf, o.x || 0, o.y || 0, w * div, h * div);
  return st;
}
function _no3d() { rect(0, 0, W, H, C.black); text('3D stage off: ' + (S3D.err || 'no WebGL'), 12, 12, { font: 'monaco', color: C.white }); return null; }
// project3d(st, [x, y, z], o) -> [x, y] in the frame (same o.w, o.h, o.x, o.y as render3d): pin 2D work to a 3D point
function project3d(st, p, o = {}) { const v = new THREE.Vector3(...p).project(st.cam); return [R((o.x || 0) + (v.x + 1) / 2 * (o.w || W)), R((o.y || 0) + (1 - v.y) / 2 * (o.h || H))]; }

// =====================================================================================================
// Presets. Each builds its stage once (o.key names the build: give a new key when the content changes) and sets every
// transform from t. They render and composite; draw 2D (lyrics, the pen cord, FX) after them.
// =====================================================================================================
// corridor3d(t, o): THE WINDOW CORRIDOR: era panels down a z-tunnel, a panel per o.step held then whipped (TOOLKIT §13.1)
function corridor3d(t, o = {}) {
  const eras = o.eras || APPEARANCES.map(e => e.id), gap = o.gap ?? 900, side = o.side ?? 300, turn = o.turn ?? .5;
  const st = stage3d(o.key || 'corridor', st => {
    st.scene.fog = new THREE.Fog(0, ...(o.fog || [gap * 1.3, gap * 3.4]));
    const boxes = [];
    st.o.poses = eras.map((era, i) => {
      const tex = o.tex ? o.tex(era, i) : deskTex('cor|' + st.key + '|' + era, o.at ?? 0, o.desk, { era }), fc = ERA[era].pal.frame, sg = i % 2 ? 1 : -1, ry = -sg * turn;
      const n = [Math.sin(ry), 0, Math.cos(ry)], c = [sg * side, 0, -i * gap], m = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), mat3d({ map: tex, auto: true }));
      m.position.set(c[0] + n[0] * 12.5, 0, c[2] + n[2] * 12.5); m.rotation.y = ry; st.scene.add(m);
      boxes.push({ w: FW, h: FH, d: 24, pos: c, ry, cols: band3(fc, null) });
      const dd = D3 * (o.fill ?? 1.12);
      return { pos: [c[0] + n[0] * dd, 0, c[2] + n[2] * dd], look: c, roll: sg * (o.roll ?? .05), fov: 30 };
    });
    if (o.ring !== false) for (let i = 0; i < eras.length * 2; i++) { // rectangular rings round the axis, every half gap
      const rw = 2 * side + FW + 260, rh = FH + 280, z = -i * gap / 2 + gap / 4, cols = Array(6).fill(o.ring || C.white);
      for (const [x, y, w, h] of [[0, rh / 2, rw, 4], [0, -rh / 2, rw, 4], [-rw / 2, 0, 4, rh], [rw / 2, 0, 4, rh]]) boxes.push({ w, h, d: 4, pos: [x, y, z], cols });
    }
    st.scene.add(new THREE.Mesh(bandGeo(boxes), mat3d({ vc: true })));
  });
  if (!st) return _no3d();
  const P = st.o.poses, t0 = o.t0 ?? 0, step = o.step ?? .5, hold = o.hold ?? .5;
  const ks = o.cam || P.flatMap((p, i) => [[t0 + i * step, p, 'whip'], [t0 + (i + hold) * step, { ...p, pos: _l3(p.pos, p.look, .04) }, 'lin']]);
  const cs = cam3d(t, ks, o); aim3d(st.cam, cs);
  if (o.whip !== false) whip3d(t, ks, o);
  render3d(st, { div: o.div, pal: o.pal });
  return { stage: st, i: clamp(Math.floor((t - t0) / step + 1e-6), 0, P.length - 1), cam: cs };
}

// silStage3d(t, o): THE SILHOUETTE STAGE: field floor and grid, voxel type slamming on its words, dancers, the white pen
function silStage3d(t, o = {}) {
  const fld = fieldCol(o.field || fieldAt(t) || 'magenta');
  const st = stage3d(o.key || 'sil', st => {
    st.scene.fog = new THREE.Fog(0, ...(o.fog || [1800, 4600]));
    const g = o.grid ?? 120, N = 40, pts = [];   // one segment per cell: a line with an end behind the eye is not drawn
    for (let i = -N; i <= N; i++) for (let j = -N; j < N; j++) pts.push(i * g, 0, j * g, i * g, 0, j * g + g, j * g, 0, i * g, j * g + g, 0, i * g);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    st.scene.add(new THREE.LineSegments(lg, lineMat3d()));
    st.o.type = (o.type || []).map(T3 => { const v = voxText(T3.text, { size: T3.size ?? 22, depth: T3.depth ?? 3, align: T3.align }); st.scene.add(v.group); return v; });
    if (o.pen) { const s = o.pen.scale ?? 4; st.o.pen = card3d(tex3d('pen3d|' + s, 40 * s, 12 * s, () => pen(39 * s, 6 * s, 0, s, { flash: false })), 40 * s, 12 * s); st.o.pen.geometry.translate(17.5 * s, 0, 0); st.scene.add(st.o.pen); }
  });
  if (!st) return _no3d();
  st.bg = fld;
  const ks = o.cam || [[0, orbit3d([0, 220, 0], 1500, .3 * Math.sin(beatAt(t) * Math.PI / 16), 60)]], cs = cam3d(t, ks, o); aim3d(st.cam, cs);
  (o.type || []).forEach((T3, bi) => {
    const v = st.o.type[bi], on = !T3.show || (t >= T3.show[0] && t < T3.show[1]);
    v.group.visible = on; if (!on) return;
    v.group.position.set(...(T3.pos || [0, 0, 0])); v.group.position.y += v.h / 2; v.group.rotation.set(...(T3.rot || [0, 0, 0]));
    voxColor(v, fld);
    const ws = T3.words ? _bigWordTimes(v.chars, T3.words) : null;
    v.letters.forEach(L => slam3d(L, t, T3.stepIn ? beatTime(beatAt(T3.stepIn.t0) + L.n / (T3.stepIn.div || 4)) : ws ? ws[L.li][L.ci] : T3.at, { ghost: T3.ghost, from: T3.from }));
  });
  (o.dancers || []).forEach((d, i) => { const g = dancer3d(st, i, t, { field: fld, ...d }); g.visible = !d.show || (t >= d.show[0] && t < d.show[1]); });
  if (st.o.pen) { const p = o.pen; st.o.pen.position.set(...p.pos); st.o.pen.scale.setScalar(p.size ?? 2); st.o.pen.rotation.set(0, p.yaw ?? 0, -(p.angle ?? Math.PI / 2)); }
  if (o.whip !== false && o.cam) whip3d(t, ks, o);
  render3d(st, { div: o.div, pal: [fld, C.black, C.white] });
  return { stage: st, type: st.o.type, cam: cs };
}

// nestedDesks3d(t, t0, t1, o): NESTED DESKS: each layer a screen in the next one's monitor, a continuous pull-back
const NEST_WIN = { x: 360, y: 176, w: 192, h: 108 };
function nestedDesks3d(t, t0, t1, o = {}) {
  const Ls = o.layers, n = Ls.length, dw = o.dot ? o.dotWeight ?? .6 : 0, total = n - 1 + dw, dz = o.depth ?? 36, bz = o.bezel ?? 5;
  const uAt = tt => (o.ease || (k => k))(prog(tt, t0, t1)) * total, u = uAt(t);
  const st = stage3d(o.key || 'nested', st => {
    st.extra = [FIELDS.vermilion, C.black];
    st.o.L = Ls.map((L, i) => {
      const g = new THREE.Group(), win = L.win || NEST_WIN, fc = ERA[L.era].pal.frame;
      g.add(new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), mat3d({ map: deskTex('nest|' + st.key + '|' + i, L.at ?? t0, L.draw, { era: L.era }), solid: true })));
      const c = [win.x + win.w / 2 - FW / 2, FH / 2 - win.y - win.h / 2];
      if (i > 0) g.add(new THREE.Mesh(bandGeo([[0, (win.h + bz) / 2, win.w + 2 * bz, bz], [0, -(win.h + bz) / 2, win.w + 2 * bz, bz], [-(win.w + bz) / 2, 0, bz, win.h], [(win.w + bz) / 2, 0, bz, win.h]]
        .map(([x, y, w, h]) => ({ w, h, d: dz, pos: [c[0] + x, c[1] + y, dz / 2], cols: [darken(fc, .45), darken(fc, .45), darken(fc, .25), darken(fc, .25), fc, null] }))), mat3d({ vc: true, solid: true })));
      st.scene.add(g); return { g, c, rho: FW / win.w, L, i };
    });
  });
  if (!st) return _no3d();
  const A = st.o.L, dot = u > n - 1 + 1e-9, j = dot ? n - 1 : Math.min(n - 2, Math.floor(u)), ph = dot ? (u - (n - 1)) / (dw || 1) : u - j;
  A.forEach(l => { l.g.visible = false; });
  const place = (l, s, p) => { l.g.visible = s * FW >= 2; l.g.scale.setScalar(s); l.g.position.set(...p); };
  let s, p;
  if (dot) { s = Math.exp(ph * Math.log(3 / FW)); p = [0, 0, 0]; place(A[j], s, p); }
  else { const O = A[j + 1]; s = Math.pow(O.rho, 1 - ph); p = [O.c[0], O.c[1], dz].map(v => -(1 - ph) * s * v); place(O, s, p); }
  for (let i = dot ? j : j + 1; i > Math.max(0, j - 2); i--) { const l = A[i]; p = [p[0] + s * l.c[0], p[1] + s * l.c[1], p[2] + s * dz]; s /= l.rho; place(A[i - 1], s, p); }
  for (const l of A) if (l.L.live && l.g.visible) deskTex('nest|' + st.key + '|' + l.i, t, l.L.draw, { era: l.L.era, live: true });
  const sw = dot ? 0 : (o.swing ?? .12) * Math.sin(Math.PI * ph), a = sw * (j % 2 ? 1 : -1), e = sw * .4;
  aim3d(st.cam, { pos: [D3 * Math.sin(a) * Math.cos(e), D3 * Math.sin(e), D3 * Math.cos(a) * Math.cos(e)], look: [0, 0, 0], fov: 30 });
  render3d(st, { div: o.div, bg: C.black });
  if (dot && s * FW < 3) rect(R(W / 2) - 1, R(H / 2) - 1, 2, 2, FIELDS.vermilion);
  if (o.hitFX !== false && Math.floor(u + 1e-9) > Math.floor(uAt(t - 2 / FPS) + 1e-9) && u < n - 1 + 1e-9) FX.rgbSplit = [2, 0, [C.white, C.black]];
  return { stage: st, u, layer: dot ? n - 1 : ph < .5 ? j : j + 1 };
}
