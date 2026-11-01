// Cover Glass, the pure half: the compositing plan, the cover document and the
// canvas variants. The model is executed here in a bare vm context, and so is
// the staged-to-kept hand-off through the edit kernel, so these are contracts
// on behaviour rather than on source text.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const load = (path) => readFileSync(new URL(`../../apps/desktop/app/${path}`, import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(load("features/liquid-cover-model.js"), context);
vm.runInContext(load("core/edit-assets.js"), context);
const M = context.AISystem6CoverModel;
const plain = (value) => JSON.parse(JSON.stringify(value));
const check = { deepEqual: (actual, expected, message) => assert.deepStrictEqual(plain(actual), plain(expected), message) };

const picture = (id, over = {}) => ({ id, kind: "picture", role: "layer", assetId: `a-${id}`, ...over });
const adjust = (id, over = {}) => ({ id, kind: "adjust", adjust: { type: "brightnessContrast", brightness: 20, contrast: 0 }, ...over });
const stack = (items) => items.map((item) => M.normalizeStackLayer(item));

test("an adjustment layer in the middle applies only to the layers beneath it", () => {
  const plan = M.compositingPlan({ stack: stack([picture("a"), adjust("adj"), picture("b")]), glassSlot: 3 });
  check.deepEqual(plan.backdrop.map((step) => step.id), ["a", "adj", "b"], "steps keep the stack order");
  const step = plan.backdrop.find((entry) => entry.id === "adj");
  check.deepEqual(step.appliesTo, ["a"], "only the layer under it");
  assert.equal(step.appliesTo.includes("b"), false);
});

test("an adjustment above the glass reaches the glass and every picture under it", () => {
  const plan = M.compositingPlan({ stack: stack([picture("bg", { role: "background" }), picture("subject"), adjust("grade")]), glassSlot: 1 });
  check.deepEqual(plan.backdrop.map((step) => step.id), ["bg"]);
  check.deepEqual(plan.foreground.map((step) => step.id), ["subject", "grade"]);
  check.deepEqual(plan.foreground[1].appliesTo, ["bg", "glass", "subject"]);
  check.deepEqual(plan.order, ["bg", "glass", "subject"]);
});

test("the same plan is what draws every layer: hidden, transparent and identity layers are skipped", () => {
  const plan = M.compositingPlan({
    stack: stack([
      picture("a"), picture("hidden", { hidden: true }), picture("clear", { opacity: 0 }),
      adjust("flat", { adjust: { type: "blur", radius: 0 } }), adjust("grade", { adjust: { type: "hueSaturation", hue: 30 } }),
    ]),
    glassSlot: 5,
  });
  check.deepEqual(plan.backdrop.map((step) => step.id), ["a", "grade"]);
  check.deepEqual(plan.backdrop[1].appliesTo, ["a"], "a skipped layer is not something the adjustment reaches");
});

test("a clipped layer is limited to the layer under it, and goes with it when that one is hidden", () => {
  const plan = M.compositingPlan({
    stack: stack([
      picture("base"), picture("texture", { clip: true, blend: "multiply" }),
      picture("gone", { hidden: true }), picture("onGone", { clip: true }),
      picture("free"),
    ]),
    glassSlot: 5,
  });
  check.deepEqual(plan.backdrop.map((step) => step.id), ["base", "texture", "free"]);
  assert.equal(plan.backdrop[1].clipTo.id, "base");
  assert.equal(plan.backdrop[1].blend, "multiply");
  assert.equal(plan.backdrop[2].clipTo, null);
  const clippedAdjust = M.compositingPlan({ stack: stack([picture("p"), picture("q"), adjust("a", { clip: true })]), glassSlot: 3 });
  check.deepEqual(clippedAdjust.backdrop[2].appliesTo, ["q"], "a clipped adjustment changes its base only");
});

test("a clip with nothing to clip to is reported and ignored", () => {
  const plan = M.compositingPlan({ stack: stack([picture("first", { clip: true })]), glassSlot: 1 });
  assert.equal(plan.backdrop[0].clipTo, null);
  assert.equal(plan.issues[0].reason, "clip-no-base");
});

test("a cut-out keeps source, mask and transform apart on the layer", () => {
  const layer = M.normalizeStackLayer(picture("cut", { maskId: "mask-1", x: 0.3, y: 0.6, scale: 1.4, rotation: 12, placement: "free" }));
  assert.equal(layer.assetId, "a-cut");
  assert.equal(layer.maskId, "mask-1");
  const [step] = M.compositingPlan({ stack: [layer], glassSlot: 0 }).foreground;
  assert.equal(step.hasMask, true);
  check.deepEqual(plain(step.placement), { mode: "free", x: 0.3, y: 0.6, scale: 1.4, rotation: 12 });
});

function sampleState() {
  const stackLayers = stack([
    picture("bg", { role: "background", placement: "cover", builtinUrl: "/assets/liquid-cover/bg-1.jpg" }),
    picture("subject", { role: "subject", placement: "free", x: 0.7, y: 0.4, scale: 0.8, maskId: "m-subject", blend: "overlay", opacity: 0.8 }),
    adjust("grade"),
  ]);
  return {
    id: "cover-1", title: "Launch", variant: "16:9", w: 1280, h: 720,
    variants: { "16:9": { w: 1280, h: 720, layout: {} }, "1:1": { w: 1080, h: 1080, layout: { title: { cx: 0.5, cy: 0.7, fontSize: 120, rotation: 0 } } } },
    glassSlot: 1,
    background: { kind: "builtin", url: "/assets/liquid-cover/bg-1.jpg" },
    stack: stackLayers,
    layers: [{ id: "title", name: "", text: "Hello\nWorld", font: "Arial", fontSize: 170, fontWeight: 800, letterSpacing: 2, rotation: 0, cx: 0.4, cy: 0.5, renderMode: "glass", solidColor: "#ffffff", refThickness: 20, tintColor: "#123456", tintAlpha: 5, hidden: false, locked: false, parentId: null }],
    controls: { "lc-refraction": "55", "lc-merge": "0" },
    body: 30, preset: "clear",
  };
}

test("cover document round trip: serialize, parse, identical layers", () => {
  const state = sampleState();
  const doc = M.serializeCover(state);
  const text = JSON.stringify(doc);
  const parsed = M.parseCover(text);
  assert.equal(parsed.ok, true);
  check.deepEqual(plain(parsed.doc.stack), plain(state.stack), "stack layers come back exactly");
  check.deepEqual(plain(parsed.doc.layers[0]), { ...plain(state.layers[0]), shapeKind: null, shapeAssetId: "" });
  assert.equal(parsed.doc.glassSlot, 1);
  check.deepEqual(plain(parsed.doc.glass.controls), state.controls);
  check.deepEqual(plain(parsed.doc.variants["1:1"].layout.title), { cx: 0.5, cy: 0.7, fontSize: 120, rotation: 0 });
  check.deepEqual(M.serializeCover(parsed.doc.variants ? { ...parsed.doc, controls: parsed.doc.glass.controls, body: parsed.doc.glass.body, preset: parsed.doc.glass.preset, w: 1280, h: 720 } : {}), doc, "a second round trip changes nothing");
});

test("a damaged or newer document is refused or repaired, never half-opened", () => {
  assert.equal(M.parseCover("{not json").ok, false);
  assert.equal(M.parseCover({ v: 99, layers: [] }).reason, "newer-version");
  assert.equal(M.parseCover({ v: 1 }).reason, "empty");
  const repaired = M.parseCover({ v: 1, layers: [{ id: "t", text: "x", cx: 99, tintColor: "red", fontSize: "big" }, { text: "no id" }], stack: [{ id: "p", kind: "picture", opacity: 9, blend: "bogus" }, { kind: "?" }] });
  assert.equal(repaired.ok, true);
  assert.equal(repaired.doc.layers.length, 1);
  assert.equal(repaired.doc.layers[0].cx, 1.5);
  assert.equal(repaired.doc.layers[0].tintColor, "#ffffff");
  assert.equal(repaired.doc.layers[0].fontSize, 170);
  assert.equal(repaired.doc.stack[0].opacity, 1);
  assert.equal(repaired.doc.stack[0].blend, "normal");
});

test("the readable body names the size, the layers and what was cut out", () => {
  const body = M.coverMarkdown(M.serializeCover(sampleState()));
  assert.match(body, /^# Launch/);
  assert.match(body, /1280 × 720 \(16:9\)/);
  assert.match(body, /Sizes: 16:9, 1:1/);
  assert.match(body, /Subject \(overlay, 80%, cut out\)/);
  assert.match(body, /Text: Hello/);
  const lines = body.split("\n").filter((line) => line.startsWith("- ") && !line.includes(":") || /Adjustment|Subject|Text|Background/.test(line));
  assert.ok(lines.findIndex((line) => line.includes("Adjustment")) < lines.findIndex((line) => line.includes("Text:")), "top of the stack is listed first");
});

test("variant switching keeps layer identity and each size remembers its arrangement", () => {
  const glass = { id: "title", cx: 0.5, cy: 0.5, fontSize: 170, rotation: 0 };
  const pic = M.normalizeStackLayer(picture("subject", { x: 0.7, y: 0.5, scale: 1 }));
  const items = [glass, pic];
  const variants = { "16:9": { w: 1280, h: 720, layout: {} } };
  const objects = items.slice();
  // First visit to 1:1 starts from the current arrangement.
  let result = M.switchVariant(variants, "16:9", "1:1", items, [1080, 1080]);
  assert.equal(result.created, true);
  glass.cy = 0.8; glass.fontSize = 120; pic.x = 0.5; pic.scale = 1.3;
  // Back to 16:9: the wide arrangement returns.
  result = M.switchVariant(variants, "1:1", "16:9", items, [1280, 720]);
  assert.equal(result.created, false);
  assert.equal(glass.cy, 0.5); assert.equal(glass.fontSize, 170); assert.equal(pic.x, 0.7); assert.equal(pic.scale, 1);
  // And the square one is still as it was left.
  M.switchVariant(variants, "16:9", "1:1", items, [1080, 1080]);
  assert.equal(glass.cy, 0.8); assert.equal(glass.fontSize, 120); assert.equal(pic.x, 0.5); assert.equal(pic.scale, 1.3);
  items.forEach((item, index) => assert.equal(item, objects[index], "the same layer objects throughout"));
  assert.equal(Object.keys(variants).length, 2);
});

test("saving keeps the cover's staged pictures; closing without saving clears them", () => {
  const A = context.AISystem6EditAssets;
  const records = [
    A.stageAsset({ id: "bg-1", name: "bg" }, { app: "liquidCover", group: "cover-1", role: "cover-background", order: 0 }),
    A.stageAsset({ id: "subject-1", name: "subject" }, { app: "liquidCover", group: "cover-1", role: "cutout-source", order: 1 }),
    A.stageAsset({ id: "mask-1", name: "mask" }, { app: "liquidCover", group: "cover-1", role: "cutout-mask", order: 2 }),
    A.stageAsset({ id: "other", name: "elsewhere" }, { app: "liquidCover", group: "cover-2", role: "cover-layer" }),
    { id: "album-1", name: "plain picture" },
  ];
  check.deepEqual(A.stagedToClear(records, { group: "cover-1" }).map((r) => r.id), ["bg-1", "subject-1", "mask-1"]);
  assert.equal(A.isKeptAsset(records[0]), false, "staged pictures stay out of the album and backups");
  const kept = A.keepGroup(records, "cover-1", "file-9");
  check.deepEqual(kept.map((r) => r.status), ["kept", "kept", "kept"]);
  assert.ok(kept.every((r) => r.origin.fileId === "file-9"));
  assert.ok(kept.every((r) => A.isKeptAsset(r)), "after saving the pictures are in the library");
  const assetIds = M.coverAssetIds({ background: { assetId: "bg-1" }, stack: [{ assetId: "subject-1", maskId: "mask-1" }], layers: [] });
  check.deepEqual(assetIds.sort(), ["bg-1", "mask-1", "subject-1"], "the document names exactly the pictures to keep");
});

// ---- the cut-out's model files ----------------------------------------------
// The page's policy refuses huggingface.co, so the model arrives as files the
// writer chose. The import is all or nothing, and the answer to "can I cut out
// now?" is always stated, never guessed.
function cutoutFixture() {
  const stored = new Map();
  const cache = {
    put: async (url, response) => { stored.set(url, response); },
    match: async (url) => stored.get(url),
    keys: async () => [...stored.keys()].map((url) => ({ url })),
    delete: async () => true,
  };
  const sandbox = {
    window: {}, location: { origin: "http://desk.test" }, URL, Response, Request,
    fetch: async () => { throw new Error("offline"); },
    caches: { open: async () => cache, delete: async () => true },
    document: {},
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(load("features/liquid-cover-cutout.js"), ctx);
  return { api: sandbox.window.AISystem6CoverCutout, stored, ctx };
}
const modelFile = (name, size = 4) => new File([new Uint8Array(size)], name);

test("with no model files the cut-out says plainly what is missing", async () => {
  const { api } = cutoutFixture();
  const status = await api.status();
  assert.equal(status.ready, false);
  check.deepEqual(status.missing, ["config.json", "preprocessor_config.json", "onnx/model_quantized.onnx"]);
});

test("a partial set of model files is refused and nothing is kept", async () => {
  const { api, stored } = cutoutFixture();
  const result = await api.importFiles([modelFile("config.json"), modelFile("model_quantized.onnx")]);
  assert.equal(result.ok, false);
  check.deepEqual(result.missing, ["preprocessor_config.json"]);
  assert.equal(stored.size, 0, "a half-imported model is never stored");
});

test("the complete set is kept, and then a cut-out can run from it", async () => {
  const { api, stored } = cutoutFixture();
  const result = await api.importFiles([modelFile("config.json"), modelFile("preprocessor_config.json"), modelFile("model_quantized.onnx", 64)]);
  assert.equal(result.ok, true);
  assert.equal(stored.size, 3);
  const status = await api.status();
  assert.equal(status.ready, true);
  assert.equal(status.source, "imported");
  assert.equal(status.dtype, "q8", "the quantized weights are what was chosen");
});
