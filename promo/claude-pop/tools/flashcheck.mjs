#!/usr/bin/env node
// Photosensitivity check: drives index.html like render.mjs (puppeteer-core, ?render), draws every frame at 60 fps and
// runs the WCAG 2.x general-flash and red-flash tests on the 640x360 canvas, scaled to a 1920x1080 viewing equivalent.
//
//   node tools/flashcheck.mjs [from] [to] [--fps 60] [--span 2] [--area 0.25] [--limit 3] [--json out.json] [--frames out.json] [--quiet]
//
// The tests (WCAG 2.3.1 / Harding), per pixel, on linearised sRGB:
//   general flash  a pair of opposing changes in relative luminance of >= 0.10 where the darker state is < 0.80
//   red flash      a pair of opposing transitions to or from saturated red (R/(R+G+B) >= 0.8), the change in
//                  max(0, (R-G-B) * 320) being > 20
// Per pixel a zig-zag filter turns the luminance into runs (a run ends when the signal retreats 2% from its extreme);
// a run FIRES (one transition, brightening or darkening) the first frame its swing meets the thresholds, so a slow ramp
// counts the same as a hard cut. A frame carries a transition when the pixels firing in it (OR-ed over --span frames,
// "concurrent") cover >= 25% of ANY 341x256 window of a 1024x768 screen. At 1920x1080 that window is the same fraction of
// the screen, 1/3 x 1/3 = 640x360 px of 1920x1080, i.e. 213x120 px of the 640x360 canvas (taken on a 4 px grid as 54x30
// cells, a hair larger, so slightly generous). Consecutive transitions of the same sign merge; opposing pairs are flashes
// (2 transitions = 1 flash). More than --limit (3) flashes in any 1 s window fails. The CRT finish (scanlines, vignette)
// is not in the canvas and moves luminance by a few percent at most; it is ignored.
//
// Exit code 1 if any window fails. CHROME=/path overrides the browser.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.CHROME || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));

const args = process.argv.slice(2), pos = [], flags = {};
for (let i = 0; i < args.length; i++) args[i].startsWith('--') ? (flags[args[i].slice(2)] = (args[i + 1] && !args[i + 1].startsWith('--')) ? args[++i] : '1') : pos.push(args[i]);
const FPS = +flags.fps || 60, SPAN = Math.max(1, +flags.span || 2), AREA = +flags.area || 0.25, LIMIT = +flags.limit || 3, CHUNK = 60;

// the same browser as render.mjs: three.js over file://, WebGL on SwiftShader, 2D canvases on the CPU
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--no-sandbox',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-accelerated-2d-canvas', '--disable-gpu-rasterization'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error('page error:', e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) console.error('console:', m.text()); });

// ---- in the page: the per-pixel state machines. Returns per frame [gUp, gDn, rUp, rDn] = the largest window fraction ----
function pageSetup(span, area) {
  const W = FW, H = FH, N = W * H, B = 4, BW = W / B, BH = H / B, WW = 54, WH = 30, WIN = WW * WH * B * B;
  const lin = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const mk = () => ({
    dir: new Int8Array(N), start: new Float32Array(N), ext: new Float32Array(N), fired: new Uint8Array(N),
    startSat: new Uint8Array(N), extSat: new Uint8Array(N),
  });
  const S = {
    g: mk(), r: mk(), init: false, f: 0,
    // block counts of the events fired in each of the last `span` frames: [kind][slot][block]
    cnt: [0, 1, 2, 3].map(() => Array.from({ length: span }, () => new Int32Array(BW * BH))),
    integ: new Int32Array((BW + 1) * (BH + 1)), sum: new Int32Array(BW * BH),
  };
  function windowMax(sum) {  // largest window fraction (0..1) of a block-count grid
    let total = 0; for (let i = 0; i < sum.length; i++) total += sum[i];
    if (total < area * WIN * 0.999) return total / WIN;   // cannot reach the threshold anywhere: cheap upper bound
    const I = S.integ, w1 = BW + 1;
    for (let y = 0; y < BH; y++) { let row = 0; for (let x = 0; x < BW; x++) { row += sum[y * BW + x]; I[(y + 1) * w1 + x + 1] = I[y * w1 + x + 1] + row; } }
    let best = 0;
    for (let y = 0; y + WH <= BH; y++) for (let x = 0; x + WW <= BW; x++) {
      const v = I[(y + WH) * w1 + x + WW] - I[y * w1 + x + WW] - I[(y + WH) * w1 + x] + I[y * w1 + x];
      if (v > best) best = v;
    }
    return best / WIN;
  }
  const EPS_G = 0.02, EPS_R = 4;
  S.frame = () => {
    const d = cv.getContext('2d').getImageData(0, 0, W, H).data, slot = S.f % span;
    const cg0 = S.cnt[0][slot], cg1 = S.cnt[1][slot], cr0 = S.cnt[2][slot], cr1 = S.cnt[3][slot];
    cg0.fill(0); cg1.fill(0); cr0.fill(0); cr1.fill(0);
    const g = S.g, r = S.r, first = !S.init;
    let meanL = 0;
    for (let p = 0, q = 0; p < N; p++, q += 4) {
      const R = lin[d[q]], G = lin[d[q + 1]], Bl = lin[d[q + 2]];
      const L = 0.2126 * R + 0.7152 * G + 0.0722 * Bl;
      meanL += L;
      const blk = ((p / W | 0) >> 2) * BW + ((p % W) >> 2);
      let V = (R - G - Bl) * 320; if (V < 0) V = 0;
      const sum = R + G + Bl, sat = sum > 0 && R / sum >= 0.8 ? 1 : 0;
      if (first) { g.start[p] = g.ext[p] = L; r.start[p] = r.ext[p] = V; r.startSat[p] = r.extSat[p] = sat; continue; }
      // general flash
      let dr = g.dir[p], e = g.ext[p];
      if (dr === 0) { if (L - e >= EPS_G) { g.dir[p] = 1; g.ext[p] = L; g.fired[p] = 0; } else if (e - L >= EPS_G) { g.dir[p] = -1; g.ext[p] = L; g.fired[p] = 0; } }
      else if (dr === 1) { if (L > e) g.ext[p] = L; else if (e - L >= EPS_G) { g.dir[p] = -1; g.start[p] = e; g.ext[p] = L; g.fired[p] = 0; } }
      else { if (L < e) g.ext[p] = L; else if (L - e >= EPS_G) { g.dir[p] = 1; g.start[p] = e; g.ext[p] = L; g.fired[p] = 0; } }
      dr = g.dir[p];
      if (dr !== 0 && !g.fired[p]) {
        const s = g.start[p], x = g.ext[p], sw = x > s ? x - s : s - x;
        if (sw >= 0.1 - 1e-6 && (s < x ? s : x) < 0.8) { g.fired[p] = 1; if (dr > 0) cg0[blk]++; else cg1[blk]++; }
      }
      // red flash
      dr = r.dir[p]; e = r.ext[p];
      if (dr === 0) { if (V - e >= EPS_R) { r.dir[p] = 1; r.ext[p] = V; r.extSat[p] = sat; r.fired[p] = 0; } else if (e - V >= EPS_R) { r.dir[p] = -1; r.ext[p] = V; r.extSat[p] = sat; r.fired[p] = 0; } }
      else if (dr === 1) { if (V > e) { r.ext[p] = V; r.extSat[p] = sat; } else if (e - V >= EPS_R) { r.dir[p] = -1; r.start[p] = e; r.startSat[p] = r.extSat[p]; r.ext[p] = V; r.extSat[p] = sat; r.fired[p] = 0; } }
      else { if (V < e) { r.ext[p] = V; r.extSat[p] = sat; } else if (V - e >= EPS_R) { r.dir[p] = 1; r.start[p] = e; r.startSat[p] = r.extSat[p]; r.ext[p] = V; r.extSat[p] = sat; r.fired[p] = 0; } }
      dr = r.dir[p];
      if (dr !== 0 && !r.fired[p]) {
        const s = r.start[p], x = r.ext[p], sw = x > s ? x - s : s - x;
        if (sw > 20 && (r.startSat[p] || r.extSat[p])) { r.fired[p] = 1; if (dr > 0) cr0[blk]++; else cr1[blk]++; }
      }
    }
    S.init = true; S.f++;
    const out = [];
    for (let k = 0; k < 4; k++) {
      const s = S.sum; s.fill(0);
      for (let sl = 0; sl < span; sl++) { const c = S.cnt[k][sl]; for (let i = 0; i < s.length; i++) s[i] += c[i]; }
      out.push(windowMax(s));
    }
    out.push(meanL / N);
    return out;
  };
  window.__fc = S;
}
const analyse = (t0, n, fps) => {
  const S = window.__fc, out = [];
  for (let i = 0; i < n; i++) {
    try { draw(t0 + i / fps); } catch (e) { resetCtx(); }
    out.push(S.frame());
  }
  return out;
};

await page.goto(pathToFileURL(path.join(ROOT, 'index.html')) + '?render');
await page.waitForFunction('window.READY === true || !!window.READY_ERROR', { timeout: 90000 });
if (await page.evaluate('window.READY_ERROR || null')) { console.error(await page.evaluate('window.READY_ERROR')); await browser.close(); process.exit(1); }
const END = await page.evaluate('typeof END !== "undefined" ? END : DUR + 3');
const from = pos[0] !== undefined ? +pos[0] : 0, to = pos[1] !== undefined ? +pos[1] : END;
const scenes = await page.evaluate(() => SCENES.map(s => ({ name: s.name, t0: s.t0, t1: s.t1 })));
await page.evaluate(pageSetup, SPAN, AREA);

// chapter ranges from the scene-name prefixes ("ch04 pen pal" -> ch04)
const chOf = n => (/^(ch\d\d)\b/.exec(n) || [])[1] || 'toolkit/other';
const chapters = {};
for (const s of scenes) { const c = chOf(s.name), r = chapters[c] || (chapters[c] = [Infinity, -Infinity]); r[0] = Math.min(r[0], s.t0); r[1] = Math.max(r[1], s.t1); }
const chaptersAt = (a, b) => Object.entries(chapters).filter(([, r]) => r[0] < b && r[1] > a).map(([c]) => c);
const scenesAt = (a, b) => scenes.filter(s => s.t0 < b && s.t1 > a).map(s => s.name);

const nFrames = Math.round((to - from) * FPS), frames = [];
const t00 = Date.now();
await page.evaluate(analyse, Math.max(0, from - 1 / FPS), 1, FPS);   // prime the filter with the frame before `from`
for (let i = 0; i < nFrames; i += CHUNK) {
  const n = Math.min(CHUNK, nFrames - i);
  const res = await page.evaluate(analyse, from + i / FPS, n, FPS);
  frames.push(...res);
  if (!flags.quiet && (i % 1200 === 0)) console.error(`${(from + i / FPS).toFixed(0)} s / ${to.toFixed(0)} s  (${((Date.now() - t00) / 1000).toFixed(0)} s elapsed)`);
}
await browser.close();

// ---- node side: transitions -> flashes per second ----
function analyseKind(name, upI, dnI) {
  const trans = [];   // {f, sign}
  let last = 0;
  frames.forEach((fr, f) => {
    const up = fr[upI], dn = fr[dnI];
    if (up < AREA && dn < AREA) return;
    const sign = up >= dn ? 1 : -1;
    if (sign !== last) { trans.push({ f, sign, area: Math.max(up, dn) }); last = sign; }
  });
  const T = f => from + f / FPS;
  const fail = [];   // per starting transition, count in [t, t+1)
  let peak = 0, peakAt = 0;
  for (let i = 0; i < trans.length; i++) {
    let j = i; while (j + 1 < trans.length && trans[j + 1].f - trans[i].f < FPS) j++;
    const flashes = (j - i + 1) / 2;
    if (flashes > peak) { peak = flashes; peakAt = T(trans[i].f); }
    if (flashes > LIMIT) fail.push({ i, j, flashes });
  }
  // merge overlapping failing windows into spans
  const spans = [];
  for (const w of fail) {
    const a = T(trans[w.i].f), b = T(trans[w.j].f);
    const s = spans[spans.length - 1];
    if (s && a <= s.t1 + 1e-9) { s.t1 = Math.max(s.t1, b); s.peak = Math.max(s.peak, w.flashes); s.transitions.push(...trans.slice(w.i, w.j + 1).map(x => x.f).filter(f => !s.transitions.includes(f))); }
    else spans.push({ t0: a, t1: b, peak: w.flashes, transitions: trans.slice(w.i, w.j + 1).map(x => x.f) });
  }
  for (const s of spans) {
    s.transitions.sort((x, y) => x - y);
    s.times = s.transitions.map(f => +T(f).toFixed(3));
    s.meanL = s.transitions.map(f => +frames[f][4].toFixed(2));
    s.area = s.transitions.map(f => +Math.max(frames[f][upI], frames[f][dnI]).toFixed(2));
    s.chapters = chaptersAt(s.t0, s.t1 + 1e-3);
    s.scenes = scenesAt(s.t0, s.t1 + 1e-3);
    s.windowFrom = +s.t0.toFixed(3); s.windowTo = +(s.t1 + 1 / FPS).toFixed(3);
    delete s.transitions;
  }
  return { name, transitions: trans.length, peakFlashesPerSecond: peak, peakAt: +peakAt.toFixed(3), failingSpans: spans };
}
const general = analyseKind('general flash', 0, 1), red = analyseKind('red flash', 2, 3);
const report = { range: [from, to], fps: FPS, span: SPAN, areaThreshold: AREA, limitPerSecond: LIMIT, chapters, general, red };
if (flags.json) fs.writeFileSync(path.resolve(flags.json), JSON.stringify(report, null, 1));
if (flags.frames) fs.writeFileSync(path.resolve(flags.frames), JSON.stringify({ from, fps: FPS, cols: ['gUp', 'gDn', 'rUp', 'rDn', 'meanL'], frames: frames.map(f => f.map(v => +v.toFixed(3))) }));

console.log(`flashcheck ${from}..${to} s at ${FPS} fps, ${nFrames} frames; concurrent window ${SPAN} frame(s); area >= ${AREA * 100}% of a 1/3 x 1/3 screen window; fail if > ${LIMIT} flashes in 1 s`);
let failed = false;
for (const k of [general, red]) {
  console.log(`\n${k.name}: ${k.transitions} transitions, peak ${k.peakFlashesPerSecond} flashes/s at ${k.peakAt} s -> ${k.failingSpans.length ? 'FAIL' : 'pass'}`);
  for (const s of k.failingSpans) {
    failed = true;
    console.log(`  FAIL ${s.windowFrom.toFixed(3)}-${s.windowTo.toFixed(3)} s  peak ${s.peak} flashes/s  chapters ${s.chapters.join(', ')}`);
    console.log(`       scenes: ${s.scenes.join(' | ')}`);
    console.log(`       transitions at: ${s.times.join(' ')}`);
    console.log(`       mean luminance then: ${s.meanL.join(' ')}   window area: ${s.area.join(' ')}`);
  }
}
process.exitCode = failed ? 1 : 0;
