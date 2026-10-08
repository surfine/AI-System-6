#!/usr/bin/env node
// Draws index.html frame by frame in headless Chromium at 640x360; ffmpeg upscales 3x with
// nearest-neighbour, adds the CRT finish and muxes the song.
//
//   node render.mjs video [--from 0] [--to DUR] [--fps 60] [--out build/claude-pop.mp4]
//   node render.mjs still 23.6 [build/still.png]        one frame at 1920x1080, as it appears in the video
//   node render.mjs sheet 22 38 0.5 [build/sheet.png]   contact sheet: a frame every 0.5 s, 640x360 tiles (--cols 3)
//   node render.mjs check [t0] [t1]                     draw every frame of a range; report exceptions and draw times
//
// CHROME=/path/to/chrome overrides the browser. The song is read from build/song.wav (music/build_song.py).
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
const SONG = path.join(ROOT, 'build/song.wav');
const CRT = 'scale=1920:1080:flags=neighbor,drawgrid=x=-1:y=2:w=1922:h=3:t=1:c=black@0.10,vignette=PI/5';

const args = process.argv.slice(2), mode = args[0], pos = [], flags = {};
for (let i = 1; i < args.length; i++) args[i].startsWith('--') ? flags[args[i].slice(2)] = args[++i] : pos.push(args[i]);
if (!['video', 'still', 'sheet', 'check'].includes(mode)) { console.error('usage: node render.mjs video|still|sheet|check ... (see the top of render.mjs)'); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error('page error:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto(pathToFileURL(path.join(ROOT, 'index.html')) + '?render');
await page.waitForFunction('window.READY === true', { timeout: 30000 });
const frame = async t => Buffer.from(await page.evaluate(t => renderFrame(t), t), 'base64');
const ffmpeg = a => spawn('ffmpeg', ['-y', '-v', 'error', ...a.map(String)], { cwd: ROOT, stdio: ['pipe', 'inherit', 'inherit'] });
const done = async ff => { ff.stdin.end(); const [code] = await once(ff, 'close'); if (code) throw new Error('ffmpeg exited with ' + code); };
const outPath = (p, def) => { p = path.resolve(ROOT, p || def); fs.mkdirSync(path.dirname(p), { recursive: true }); return p; };

try {
  if (mode === 'still') {
    const out = outPath(pos[1], 'build/still.png'), ff = ffmpeg(['-f', 'image2pipe', '-c:v', 'png', '-i', '-', '-vf', CRT, '-frames:v', 1, out]);
    ff.stdin.write(await frame(+pos[0])); await done(ff);
    console.log(out);
  } else if (mode === 'check') {
    const r = await page.evaluate((a, b) => renderCheck(a, b), +pos[0] || 0, pos[1] ? +pos[1] : await page.evaluate('DUR'));
    console.log(JSON.stringify(r, null, 1));
    if (r.errors.length) process.exitCode = 1;
  } else if (mode === 'sheet') {
    const [t0, t1, step] = pos.map(Number), times = [], out = outPath(pos[3], 'build/sheet.png');
    for (let t = t0; t < t1 - 1e-6; t += step) times.push(+t.toFixed(3));
    fs.writeFileSync(out, Buffer.from(await page.evaluate((ts, c) => renderSheet(ts, c), times, +flags.cols || 3), 'base64'));
    console.log(out, times.length + ' frames');
  } else {
    const fps = +flags.fps || 60, from = +flags.from || 0, to = +flags.to || await page.evaluate('DUR'), n = Math.round((to - from) * fps);
    const out = outPath(flags.out, 'build/claude-pop.mp4');
    const audio = fs.existsSync(SONG) ? ['-ss', from, '-t', to - from, '-i', SONG] : [];
    if (!audio.length) console.warn('no build/song.wav: rendering a silent video');
    const ff = ffmpeg(['-f', 'image2pipe', '-framerate', fps, '-c:v', 'png', '-i', '-', ...audio, '-vf', CRT,
      '-c:v', 'libx264', '-preset', flags.preset || 'slow', '-crf', flags.crf || 14, '-pix_fmt', 'yuv420p',
      ...(audio.length ? ['-c:a', 'aac', '-b:a', '256k', '-shortest'] : []), '-movflags', '+faststart', out]);
    const start = Date.now();
    for (let i = 0; i < n; i++) {
      let png;
      try { png = await frame(from + i / fps); } catch (e) { throw new Error(`frame at t=${(from + i / fps).toFixed(3)} failed: ${e.message}`); }
      if (!ff.stdin.write(png)) await once(ff.stdin, 'drain');
      if (i % 600 === 0) console.log(`${(from + i / fps).toFixed(0)} s / ${to.toFixed(0)} s  (${((Date.now() - start) / 1000).toFixed(0)} s elapsed)`);
    }
    await done(ff);
    console.log(out);
  }
} finally { await browser.close(); }
