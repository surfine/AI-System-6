#!/usr/bin/env node
// Render-regression guard for Liquid Cover.
//
// WebGL output can't be rendered in plain CI, so this mirrors the project's
// visual-snapshot pattern: a committed downsampled luminance fingerprint of a
// fixed scene, diffed against a fresh capture. It catches the kind of silent
// shader/parameter drift that this feature has repeatedly suffered.
//
// Workflow (needs a running preview + browser):
//   npm run render:capture                 # prints the expression to run in preview_eval
//   # paste into the preview, save the returned JSON to /tmp/lc-render.json
//   npm run render:diff -- /tmp/lc-render.json    # exits 1 on drift, lists drifted cells
//   npm run render:update -- /tmp/lc-render.json  # accept the change (rewrites baseline)
//
// Tolerances allow for GPU / font-rasterization variance; the baseline is
// machine-specific (capture & update on the same machine), exactly like
// tests/visual-snapshot.json.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "tests", "liquid-cover-render-baseline.json");

const MEAN_TOL = 7; // mean per-cell luminance diff allowed
const MAX_TOL = 70; // single-cell luminance diff allowed

// The browser expression that produces a fingerprint. Keep in sync with the
// baseline scene. Renders the deterministic default scene, exports a 1× PNG
// (synchronous render → readable pixels), and downsamples to a 24x16 luma grid.
const CAPTURE_EXPR = `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  if (typeof ensureLiquidCoverModule === "function") await ensureLiquidCoverModule();
  window.AISystem6LiquidCover.open(); await sleep(500);
  const set=(id,v)=>{const e=document.querySelector(id);if(e){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));}};
  const a169=[...document.querySelectorAll('#liquid-cover-app .lc-aspect button')].find(b=>b.dataset.k==='16:9'); if(a169) a169.click();
  const ta=document.querySelector('#lc-text'); ta.value="Liquid\\nGlass"; ta.dispatchEvent(new Event('input',{bubbles:true}));
  set('#lc-font-size','170');
  const bt=document.querySelector('#lc-bg-row'); if(bt&&bt.children[0]) bt.children[0].click();
  await sleep(1200);
  const cv=document.querySelector('#lc-canvas'); const orig=cv.toBlob.bind(cv); let url=null;
  cv.toBlob=function(cb,t){return orig((b)=>{if(b)url=URL.createObjectURL(b);cb(b);},t);};
  const sel=document.querySelector('#lc-export-res'); sel.value='1'; sel.dispatchEvent(new Event('change',{bubbles:true}));
  await sleep(150); document.querySelector('#lc-export').click();
  for(let i=0;i<40;i++){ if(url) break; await sleep(200); } cv.toBlob=orig;
  const img=new Image(); await new Promise(r=>{img.onload=r;img.onerror=r;img.src=url;});
  const W=24,H=16,s=document.createElement('canvas'); s.width=W;s.height=H;
  const sc=s.getContext('2d'); sc.drawImage(img,0,0,W,H);
  const d=sc.getImageData(0,0,W,H).data,lum=[];
  for(let i=0;i<W*H;i++){lum.push(Math.round(0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2]));}
  return { scene:"default", w:W, h:H, lum };
})()`;

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function diff(baseline, candidate) {
  if (candidate.w !== baseline.w || candidate.h !== baseline.h) {
    return { fatal: `grid size ${candidate.w}x${candidate.h} != baseline ${baseline.w}x${baseline.h}` };
  }
  if (candidate.lum.length !== baseline.lum.length) {
    return { fatal: `cell count ${candidate.lum.length} != ${baseline.lum.length}` };
  }
  let total = 0, max = 0;
  const drifted = [];
  for (let i = 0; i < baseline.lum.length; i++) {
    const dd = Math.abs(candidate.lum[i] - baseline.lum[i]);
    total += dd;
    if (dd > max) max = dd;
    if (dd > MAX_TOL) drifted.push({ cell: i, x: i % baseline.w, y: (i / baseline.w) | 0, was: baseline.lum[i], now: candidate.lum[i], diff: dd });
  }
  return { mean: total / baseline.lum.length, max, drifted };
}

const mode = process.argv[2];
if (mode === "--print") {
  process.stdout.write(CAPTURE_EXPR + "\n");
  process.exit(0);
}

const file = process.argv[3];
if ((mode === "--diff" || mode === "--update") && !file) {
  console.error("usage: verify-liquid-render.mjs --diff|--update <captured.json>");
  process.exit(2);
}

if (mode === "--update") {
  const cand = load(file);
  const base = load(BASELINE);
  base.lum = cand.lum; base.w = cand.w; base.h = cand.h;
  writeFileSync(BASELINE, JSON.stringify(base, null, 2).replace(/\n      /g, "").replace(/\[\n {4}/g, "[").replace(/,\n {4}/g, ",").replace(/\n {2}\]/g, "]") + "\n");
  console.log(`Updated baseline from ${file}`);
  process.exit(0);
}

if (mode === "--diff") {
  const base = load(BASELINE);
  const cand = load(file);
  const r = diff(base, cand);
  if (r.fatal) { console.error("FAIL liquid render:", r.fatal); process.exit(1); }
  console.log(`liquid render: mean diff ${r.mean.toFixed(2)} (tol ${MEAN_TOL}), max diff ${r.max} (tol ${MAX_TOL}), ${r.drifted.length} cell(s) over tolerance`);
  if (r.mean > MEAN_TOL || r.drifted.length > 0) {
    for (const d of r.drifted.slice(0, 12)) console.error(`  cell (${d.x},${d.y}): was ${d.was} now ${d.now} (Δ${d.diff})`);
    console.error("Render drifted from baseline. If intentional, accept with: npm run render:update -- " + file);
    process.exit(1);
  }
  console.log("OK liquid render matches baseline.");
  process.exit(0);
}

console.error("usage: verify-liquid-render.mjs --print | --diff <file> | --update <file>");
process.exit(2);
