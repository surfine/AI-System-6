// Cover Glass distance fields off the main thread. The shared module is run in
// a bare vm (as the page loads it, and as the worker loads it), and the real
// rebuild scheduler and preview pacing are lifted out of liquid-cover.js and
// driven with a fake worker and fake clocks, so these are contracts on
// behaviour rather than on source text.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { parse } from "acorn";

const load = (path) => readFileSync(new URL(`../../apps/desktop/app/${path}`, import.meta.url), "utf8");
const sdfSource = load("features/liquid-cover-sdf.js");
const pageContext = vm.createContext({});
vm.runInContext(sdfSource, pageContext);
const SDF = pageContext.AISystem6LiquidCoverSDF;

// A mask with round and straight edges, well inside a 400x300 canvas.
function mask(width = 400, height = 300) {
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const disc = Math.hypot(x - 150, y - 140) - 38;
      const bar = x >= 200 && x < 290 && y >= 125 && y < 150;
      const a = bar ? 255 : Math.round(255 * Math.min(1, Math.max(0, 0.5 - disc)));
      alpha[y * width + x] = a;
    }
  }
  return alpha;
}

test("a field built by the worker path is bitwise the field the page builds", () => {
  const alpha = mask();
  const page = SDF.alphaToSignedDistance(alpha, 400, 300, true);
  SDF.smoothSDF(page, 400, 300);
  let mn = 0; for (const v of page) if (v < mn) mn = v;
  const worker = SDF.buildField(alpha, 400, 300, {});
  assert.equal(Buffer.compare(Buffer.from(worker.sdf.buffer), Buffer.from(page.buffer)), 0);
  assert.equal(worker.strokeHalfPx, -mn);
});

test("a cropped draft equals the full field inside its box and is far outside it", () => {
  const alpha = mask();
  const full = SDF.buildField(alpha, 400, 300, {});
  const margin = 24;
  const draft = SDF.buildField(alpha, 400, 300, { margin });
  const box = SDF.maskBox(alpha, 400, 300, margin);
  assert.ok(box.width < 400 && box.height < 300, "the crop is smaller than the canvas");
  const r = 1; // smoothing radius at this height; its band at the crop edge is excluded
  let compared = 0;
  for (let y = 0; y < 300; y++) {
    const srcY = 299 - y; // fields are flipped for GL
    for (let x = 0; x < 400; x++) {
      const i = y * 400 + x;
      const inBox = x >= box.x && x < box.x + box.width && srcY >= box.y && srcY < box.y + box.height;
      const deep = x >= box.x + r + 1 && x < box.x + box.width - r - 1 && srcY >= box.y + r + 1 && srcY < box.y + box.height - r - 1;
      if (deep) { assert.equal(draft.sdf[i], full.sdf[i], `pixel ${x},${srcY}`); compared++; }
      else if (!inBox) { assert.equal(draft.sdf[i], SDF.FAR); assert.ok(full.sdf[i] >= margin - 1, "the full field is far there too"); }
    }
  }
  assert.ok(compared > 20000, "most of the box is compared");
  assert.equal(draft.strokeHalfPx, full.strokeHalfPx, "the stroke half-width is measured inside the box");
});

test("a half-size draft reports distances in full-canvas pixels", () => {
  const alpha = mask();
  const one = SDF.buildField(alpha, 400, 300, {});
  const two = SDF.buildField(alpha, 400, 300, { unit: 2 });
  assert.equal(two.strokeHalfPx, one.strokeHalfPx * 2);
  assert.equal(two.sdf[12345], one.sdf[12345] * 2);
});

test("an empty mask is far everywhere and has no stroke", () => {
  const out = SDF.buildField(new Uint8Array(40 * 30), 40, 30, { margin: 5 });
  assert.ok(out.sdf.every((v) => v === SDF.FAR));
  assert.ok(out.strokeHalfPx === 0);
});

test("loaded as a worker, the same file answers one job per message and transfers the field back", () => {
  class WorkerGlobalScope {}
  const self = new WorkerGlobalScope();
  const posted = [];
  self.WorkerGlobalScope = WorkerGlobalScope;
  self.postMessage = (message, transfer) => posted.push({ message, transfer });
  const context = vm.createContext(self);
  vm.runInContext(sdfSource, context);
  const alpha = mask();
  self.onmessage({ data: { id: 7, alpha: alpha.slice().buffer, width: 400, height: 300, unit: 2, margin: 10 } });
  assert.equal(posted.length, 1);
  const { message, transfer } = posted[0];
  assert.equal(message.id, 7);
  assert.equal(transfer[0], message.sdf.buffer, "the field is transferred, not copied");
  const expected = SDF.buildField(alpha, 400, 300, { unit: 2, margin: 10 });
  assert.equal(Buffer.compare(Buffer.from(message.sdf.buffer), Buffer.from(expected.sdf.buffer)), 0);
  assert.equal(message.strokeHalfPx, expected.strokeHalfPx);
});

// ---- the scheduler in liquid-cover.js, driven with a fake worker ----
const coverSource = load("features/liquid-cover.js");
const functions = new Map(), declarations = new Map();
(function walk(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration") functions.set(node.id.name, coverSource.slice(node.start, node.end));
  if (node.type === "VariableDeclaration") for (const d of node.declarations) if (d.id.type === "Identifier") declarations.set(d.id.name, coverSource.slice(d.start, d.end));
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") walk(value);
})(parse(coverSource, { ecmaVersion: "latest", sourceType: "script" }));
const lift = (names) => names.map((name) => { assert.ok(functions.has(name), "production function exists: " + name); return functions.get(name); }).join("\n");
const schedulerSource = ["SDF_SETTLE_MS", "SDF_WORKER_TIMEOUT_MS", "sdfState", "sdfJobs", "sdfQueued"].map((n) => "const " + declarations.get(n) + ";").join("\n")
  + "\n" + ["sdfWorker", "sdfWorkerFailed", "sdfJobSeq"].map((n) => "let " + declarations.get(n) + ";").join("\n")
  + "\n" + lift(["rebuildLayerSDF", "sdfStateOf", "supersedeLayerSDF", "sdfWorkerReady", "dropSdfWorker", "draftMarginPx", "requestLayerSDF", "postLayerSDF", "onLayerSDFResult"])
  + "\nthis.api = { requestLayerSDF, rebuildLayerSDF, worker: () => sdfWorker };";

function scheduler({ workerThrows = false } = {}) {
  const uploads = [], timers = new Map();
  let timerSeq = 0;
  class FakeWorker {
    constructor(url) { if (workerThrows) throw new Error("no worker"); this.url = url; this.posted = []; }
    postMessage(message, transfer) { this.posted.push({ message, transfer }); }
    terminate() { this.terminated = true; }
    reply(index = 0, over = {}) {
      const { message } = this.posted[index];
      this.onmessage({ data: { id: message.id, width: message.width, height: message.height, sdf: new Float32Array(1), strokeHalfPx: 3, ...over } });
    }
  }
  const layers = [{ text: "A" }, { text: "B" }];
  const context = vm.createContext({
    layers, renderer: { setLayerSDF: (i, sdf, w, h) => uploads.push({ i, w, h, sync: sdf.length > 1 }) },
    EXPORT_W: 200, EXPORT_H: 100, renderScale: 2, pngExportInFlight: false, motionExporting: false,
    Worker: FakeWorker, lazyScriptUrl: (src) => src + "?v=test",
    rasterizeLayer: (_L, scale) => ({ alpha: new Uint8Array(200 * scale * 100 * scale), width: 200 * scale, height: 100 * scale }),
    measureAlphaBounds: () => ({ left: 0, right: 0, bottom: 0, top: 0 }),
    alphaToSignedDistance: (_a, w, h) => new Float32Array(w * h), smoothSDF: () => {},
    $: (id) => ({ "lc-shadow-expand": { value: "20" }, "lc-merge": { value: "0" } })[id], currentDPR: () => 4,
    scheduleRender: () => {},
    setTimeout: (fn, ms) => { timers.set(++timerSeq, { fn, ms }); return timerSeq; }, clearTimeout: (id) => timers.delete(id),
  });
  vm.runInContext(schedulerSource, context);
  // fire(): the settle timers; fire(Infinity): the worker watchdog as well
  const fire = (upTo = 1000) => { const due = [...timers].filter(([, t]) => t.ms <= upTo); due.forEach(([id]) => timers.delete(id)); due.forEach(([, t]) => t.fn()); };
  return { ...context.api, context, uploads, fire, layers };
}

test("dragging posts half-size drafts, keeps only the newest waiting, then settles to the exact field", () => {
  const s = scheduler();
  s.requestLayerSDF(0, true); s.requestLayerSDF(0, true); s.requestLayerSDF(0, true);
  const w = s.worker();
  assert.equal(w.url, "app/features/liquid-cover-sdf.js?v=test", "the worker is the shared module at the build-stamped URL");
  assert.equal(w.posted.length, 1, "one job in flight per layer");
  assert.deepEqual([w.posted[0].message.width, w.posted[0].message.unit], [100, 2], "a draft is half size in full-canvas units");
  assert.equal(w.posted[0].message.margin, Math.ceil(20 * 4 * 0.5) + 4, "the crop covers what the shadow reads");
  assert.equal(w.posted[0].transfer[0], w.posted[0].message.alpha, "the mask is transferred");
  w.reply(0);
  assert.equal(w.posted.length, 2, "the newest waiting draft goes next; the middle one was dropped");
  assert.deepEqual(s.uploads, [{ i: 0, w: 100, h: 50, sync: false }]);
  w.reply(1);
  s.fire(); // input settled
  assert.equal(w.posted.length, 3);
  assert.deepEqual([w.posted[2].message.width, w.posted[2].message.unit, w.posted[2].message.margin], [200, 1, -1], "the settled field is full size and uncropped");
  w.reply(2);
  assert.deepEqual(s.uploads.at(-1), { i: 0, w: 200, h: 100, sync: false });
});

test("a synchronous rebuild supersedes work in flight, and a stale result never lands", () => {
  const s = scheduler();
  s.requestLayerSDF(1, true);
  s.rebuildLayerSDF(1); // undo, aspect change or export
  s.fire(); // the cancelled settle timer must not run
  const w = s.worker();
  w.reply(0);
  assert.deepEqual(s.uploads, [{ i: 1, w: 200, h: 100, sync: true }], "only the synchronous field was uploaded");
  assert.equal(w.posted.length, 1, "no settle job followed");
});

test("a worker that stops answering is dropped and the layer rebuilt synchronously", () => {
  const s = scheduler();
  s.requestLayerSDF(0, false);
  const w = s.worker();
  s.fire(Infinity);
  assert.ok(w.terminated);
  assert.deepEqual(s.uploads, [{ i: 0, w: 200, h: 100, sync: true }]);
});

test("a deleted layer's waiting job is never sent", () => {
  const s = scheduler();
  s.requestLayerSDF(1, true); s.requestLayerSDF(1, true);
  const L = s.layers[1];
  s.layers.splice(1, 1);
  s.worker().reply(0);
  assert.equal(s.worker().posted.length, 1);
  assert.deepEqual(s.uploads, []);
  assert.ok(L);
});

test("a result for another canvas size or a removed layer is dropped", () => {
  const s = scheduler();
  s.requestLayerSDF(0, false);
  s.context.EXPORT_W = 400;
  s.worker().reply(0);
  s.context.EXPORT_W = 200;
  s.requestLayerSDF(1, false);
  s.layers.splice(1, 1);
  s.worker().reply(1);
  assert.deepEqual(s.uploads, []);
});

test("during an export, and without a worker, rebuilds stay synchronous", () => {
  const s = scheduler();
  s.context.pngExportInFlight = true;
  s.requestLayerSDF(0, true);
  assert.deepEqual(s.uploads, [{ i: 0, w: 200, h: 100, sync: true }]);
  const none = scheduler({ workerThrows: true });
  none.requestLayerSDF(0, true);
  assert.deepEqual(none.uploads, [{ i: 0, w: 200, h: 100, sync: true }]);
});

test("a worker that fails rebuilds its waiting layers synchronously and is not used again", () => {
  const s = scheduler();
  s.requestLayerSDF(0, true);
  const w = s.worker();
  w.onerror({ preventDefault() {} });
  assert.ok(w.terminated);
  assert.deepEqual(s.uploads, [{ i: 0, w: 200, h: 100, sync: true }]);
  s.requestLayerSDF(1, true);
  assert.equal(s.worker(), null);
  assert.equal(s.uploads.length, 2);
});

// ---- motion preview pacing ----
const pacing = vm.createContext({});
vm.runInContext(lift(["nextMotionPreviewDue"]) + "\nthis.next = nextMotionPreviewDue;", pacing);
function rendersIn(hz, seconds, jitterMs, stallFrom = 0) {
  const period = 1000 / hz, frameMs = 1000 / 30;
  let due = 0, renders = 0, burst = 0;
  for (let k = 1; k * period <= seconds * 1000; k++) {
    const now = k * period + (k % 2 ? jitterMs : -jitterMs);
    if (stallFrom && now > stallFrom && now < stallFrom + 300) continue; // no frames while stalled
    const next = pacing.next(now, due, frameMs);
    if (next) { renders++; due = next; if (stallFrom && now >= stallFrom + 300 && now < stallFrom + 300 + period * 3) burst++; }
  }
  return { renders, burst };
}

test("the preview delivers 30 fps on 60, 75, 120 and 144 Hz displays despite timestamp jitter", () => {
  for (const hz of [60, 75, 120, 144]) {
    const { renders } = rendersIn(hz, 3, 0.3);
    assert.ok(renders >= 88 && renders <= 91, `${hz} Hz: ${renders} renders in 3 s`);
  }
  assert.ok(rendersIn(60, 3, 0.3).renders > 72, "the old rule gave about 68 here");
});

test("after a stall the preview resumes at its pace instead of rendering a burst", () => {
  assert.equal(rendersIn(60, 3, 0.3, 1000).burst, 1, "one render in the three frames after the stall");
});
