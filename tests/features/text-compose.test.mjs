// Quick Draft text composition — pure data. The composition rule is the part
// of 文字亮室 Phase 1 that makes the central claim true: body = negative +
// enabled adjustments applied in stored order, non-destructive until develop.
// It is executed here in a bare vm context, next to the shared adjustment-layer
// range parser it reuses — there must never be a second parser for the same
// shape.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("text-compose");
const source = read("app/core/text-compose.js");
const layersSource = read("app/core/adjustment-layers.js");

test.assertNotIncludes(source, "document.", "text-compose never touches the DOM");
test.assertNotIncludes(source, "activeProjectQuickDraft", "text-compose never touches the draft record");
test.assertNotIncludes(source, "t(\"", "text-compose never touches translations");
test.assertNotIncludes(source, "function normalizeAdjustmentLayerMask", "text-compose never writes a second range parser");
test.assertNotIncludes(source, "function normalizeAdjustmentStrength", "text-compose reuses the shared strength normalization");
test.assertIncludes(source, "normalizeAdjustmentLayerMask(", "text-compose reuses the shared line-range parser");
test.assertIncludes(source, "composeCacheKey", "the cache key function is pure and testable");
test.assertIncludes(source, "function subtractProtectedRanges", "protected-range subtraction is pure");
test.assertIncludes(source, "function restoreProtectedRanges", "protection enforcement after a pass is pure");
test.assertIncludes(source, "async function composeDocument", "the composition rule is pure; the model call is injected");
test.assertIncludes(source, "runModel", "the model call is injected, never built in the module");
test.assertNotIncludes(source, "fetch(", "text-compose never performs a model call itself");

const context = vm.createContext({});
vm.runInContext(layersSource, context);
vm.runInContext(source, context);

const SOURCE = "第一段开头。\n\n第二段有一句要保护的判断：\n这句话不许动。\n\n第三段结尾。";
const PROTECTED = [{ start: 4, end: 4 }];
const DENSITY = [{ kind: "density", enabled: true, strength: 75, mask: "1-3" }];

// Cache key: deterministic, and it changes when the source, the stack, or the
// protected ranges change.
const keyA = context.composeCacheKey({ source: SOURCE, layers: DENSITY, protectedRanges: PROTECTED });
test.assert(
  context.composeCacheKey({ source: SOURCE, layers: DENSITY, protectedRanges: PROTECTED }) === keyA,
  "the cache key is deterministic for the same inputs"
);
test.assert(
  context.composeCacheKey({ source: `${SOURCE}\n多了。`, layers: DENSITY, protectedRanges: PROTECTED }) !== keyA,
  "a changed negative changes the cache key"
);
test.assert(
  context.composeCacheKey({ source: SOURCE, layers: [{ ...DENSITY[0], strength: 50 }], protectedRanges: PROTECTED }) !== keyA,
  "a changed strength changes the cache key"
);
test.assert(
  context.composeCacheKey({ source: SOURCE, layers: DENSITY, protectedRanges: [] }) !== keyA,
  "changed protected ranges change the cache key"
);
test.assert(
  context.composeCacheKey({ source: SOURCE, layers: DENSITY, protectedRanges: PROTECTED }) !== keyA.replace(/^tc-/, "tc-a"),
  "the key is not a constant"
);

// Subtraction: the protected line is removed from the source text the model
// can touch, and returned as a quoted block with its stored text.
const subtracted = context.subtractProtectedRanges(SOURCE, PROTECTED);
test.assert(
  !subtracted.sourceText.includes("这句话不许动。"),
  "a protected line is subtracted from the body sent to the model"
);
test.assert(
  subtracted.sourceText.includes("第一段开头。") && subtracted.sourceText.includes("第三段结尾。"),
  "unprotected lines stay in the body sent to the model"
);
test.assert(
  subtracted.protectedBlocks.length === 1
    && subtracted.protectedBlocks[0].text === "这句话不许动。"
    && subtracted.protectedBlocks[0].start === 4
    && subtracted.protectedBlocks[0].end === 4,
  "the protected block quotes the stored text with its range"
);
test.assert(
  JSON.stringify(context.remapRangesAfterSubtraction([{ start: 1, end: 5 }], [{ start: 3, end: 3 }]))
    === JSON.stringify([{ start: 1, end: 2 }, { start: 3, end: 4 }]),
  "a mask remaps onto the subtracted text, splitting around protected lines"
);
test.assert(
  JSON.stringify(context.remapRangesAfterSubtraction([{ start: 3, end: 3 }], [{ start: 3, end: 3 }])) === "[]",
  "a mask that is entirely protected disappears from the prompt"
);

// Restoration: a changed protected line is put back and reported; an intact
// one is left alone and never reported as restored.
const untouched = context.restoreProtectedRanges(SOURCE, SOURCE, PROTECTED);
test.assert(untouched.text === SOURCE && untouched.restored.length === 0, "an intact protected line is not reported as restored");
const tampered = context.restoreProtectedRanges(
  "第一段开头。\n\n第二段有一句要保护的判断：\n这句话被模型改了。\n\n第三段结尾。",
  SOURCE,
  PROTECTED
);
test.assert(tampered.text.includes("这句话不许动。"), "a changed protected line is restored byte-identical");
test.assert(tampered.restored.length === 1 && tampered.restored[0].start === 4, "the restored range is reported");
const vanished = context.restoreProtectedRanges("第一段开头。\n\n第三段结尾。", SOURCE, PROTECTED);
test.assert(vanished.text.includes("这句话不许动。"), "a protected line the model dropped is put back");
test.assert(vanished.restored.length === 1, "a dropped protected line is reported as restored");

// Composition ordering: one model call per prefix, in stored order, and the
// last prefix wins. Turning the last layer off is a cache hit with no call.
const calls = [];
const cache = new Map();
const runModel = async ({ layers }) => {
  calls.push(layers.map((layer) => layer.kind).join("+"));
  return `${SOURCE}\n\n[model pass over ${layers.map((layer) => layer.kind).join(", ")}]`;
};
const composed = await context.composeDocument({
  source: SOURCE,
  layers: [{ kind: "density", enabled: true, strength: 75, mask: "1-3" }, { kind: "mingming", enabled: true, strength: 50 }],
  protectedRanges: PROTECTED,
  cache,
  runModel,
});
test.assert(
  calls.join("|") === "density|density+mingming",
  "layers compose in stored order, one model call per prefix"
);
test.assert(
  composed.text.includes("[model pass over density, mingming]"),
  "the last enabled layer's output is the composite"
);
test.assert(composed.prefixes.length === 2 && composed.prefixes.every((prefix) => !prefix.cached), "a fresh stack makes real model calls");
test.assert(composed.text.includes("这句话不许动。"), "the composite still carries the protected text");

const withoutLast = await context.composeDocument({
  source: SOURCE,
  layers: [{ kind: "density", enabled: true, strength: 75, mask: "1-3" }],
  protectedRanges: PROTECTED,
  cache,
  runModel,
});
test.assert(
  withoutLast.prefixes.length === 1 && withoutLast.prefixes[0].cached === true,
  "switching the last layer off returns the cached prefix with no model call"
);
test.assert(
  withoutLast.text.includes("[model pass over density]"),
  "the composite without the last layer is the shorter prefix's output"
);
test.assert(calls.length === 2, "no new model call happened for the cache hit");

// An empty or all-disabled stack returns the negative untouched, with no call.
const noLayers = await context.composeDocument({ source: SOURCE, layers: [], protectedRanges: PROTECTED, cache, runModel });
test.assert(noLayers.text === SOURCE && noLayers.prefixes.length === 0, "no enabled layers means the composite is the negative");
const disabled = await context.composeDocument({
  source: SOURCE,
  layers: [{ kind: "density", enabled: false, strength: 75 }],
  protectedRanges: PROTECTED,
  cache,
  runModel,
});
test.assert(disabled.text === SOURCE && disabled.prefixes.length === 0, "a disabled layer is not part of the composite");

test.finish();
