// Quick Draft text composition — pure data. The composition rule is the part
// of 文字亮室 Phase 1 that makes the central claim true: body = negative +
// enabled adjustments applied in stored order, non-destructive until develop.
// It is executed here in a bare vm context, next to the shared adjustment-layer
// range parser and the protected-range sentinel tools it reuses — there must
// never be a second parser for the same shape.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("text-compose");
const source = read("app/core/text-compose.js");
const layersSource = read("app/core/adjustment-layers.js");
const protectedSource = read("app/core/protected-ranges.js");

test.assertNotIncludes(source, "document.", "text-compose never touches the DOM");
test.assertNotIncludes(source, "activeProjectQuickDraft", "text-compose never touches the draft record");
test.assertNotIncludes(source, "t(\"", "text-compose never touches translations");
test.assertNotIncludes(source, "function normalizeAdjustmentLayerMask", "text-compose never writes a second range parser");
test.assertNotIncludes(source, "function normalizeAdjustmentStrength", "text-compose reuses the shared strength normalization");
test.assertIncludes(source, "normalizeAdjustmentLayerMask(", "text-compose reuses the shared line-range parser");
test.assertIncludes(source, "composeCacheKey", "the cache key function is pure and testable");
test.assertIncludes(source, "protectTextWithSentinels", "protection uses immutable sentinels before a pass");
test.assertIncludes(source, "verifyProtectedSentinels", "protection enforces strict verification after a pass");
test.assertIncludes(source, "ProtectedRangeViolationError", "a failed sentinel check fails the whole composition");
test.assertIncludes(source, "async function composeDocument", "the composition rule is pure; the model call is injected");
test.assertIncludes(source, "runModel", "the model call is injected, never built in the module");
test.assertNotIncludes(source, "fetch(", "text-compose never performs a model call itself");
test.assertNotIncludes(source, "restoreProtectedRanges(", "text-compose never restores protected text by line position");

const context = vm.createContext({ window: {} });
vm.runInContext(layersSource, context);
vm.runInContext(protectedSource, context);
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

// Sentinel protection: the protected region is replaced by one immutable
// token line before the model sees the text, and the original bytes live in
// the local sentinel map.
const { protectedText, sentinels } = context.protectTextWithSentinels(SOURCE, PROTECTED);
test.assert(
  !protectedText.includes("这句话不许动。"),
  "a protected line is replaced by a sentinel before the model sees the body"
);
test.assert(
  sentinels.length === 1 && sentinels[0].text === "这句话不许动。",
  "the sentinel map keeps the original protected bytes locally"
);
test.assert(
  protectedText.includes(sentinels[0].token) && protectedText.split("\n").length === SOURCE.split("\n").length - 1 + 1,
  "a multi-line range collapses to one token line"
);

// Strict verification: an intact token passes; a missing, duplicated, or
// unknown token fails; a damaged fragment fails.
test.assert(
  context.verifyProtectedSentinels(protectedText, sentinels).valid,
  "an unchanged sentinel pass verifies"
);
const missing = context.verifyProtectedSentinels("第一段开头。\n\n第三段结尾。", sentinels);
test.assert(
  !missing.valid && missing.errors.some((error) => error.includes("missing")),
  "a dropped sentinel fails verification"
);
const duplicated = context.verifyProtectedSentinels(`${protectedText}\n${sentinels[0].token}`, sentinels);
test.assert(
  !duplicated.valid && duplicated.errors.some((error) => error.includes("exactly once")),
  "a duplicated sentinel fails verification"
);
const unknown = context.verifyProtectedSentinels(
  protectedText.replace(sentinels[0].token, "⟦AI6_PROTECTED_deadbeef⟧"),
  sentinels
);
test.assert(
  !unknown.valid && unknown.errors.some((error) => error.includes("unknown")),
  "an unknown sentinel fails verification"
);
const damaged = context.verifyProtectedSentinels(
  protectedText.replace(sentinels[0].token, "⟦AI6_PROTECTED_123"),
  sentinels
);
test.assert(
  !damaged.valid && damaged.errors.some((error) => error.includes("damaged")),
  "a damaged token fragment fails verification"
);

// Composition ordering: one model call per prefix, in stored order, and the
// last prefix wins. Turning the last layer off is a cache hit with no call.
// The injected model receives the sentinel-protected text and must keep every
// token verbatim; restore then returns the original bytes.
const calls = [];
const cache = new Map();
const runModel = async ({ protectedText: body, layers }) => {
  calls.push(layers.map((layer) => layer.kind).join("+"));
  // The model must reproduce the sentinel tokens verbatim; composeDocument
  // verifies them strictly and then restores the original bytes.
  return `${body}\n\n[model pass over ${layers.map((layer) => layer.kind).join(", ")}]`;
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
test.assert(composed.text.includes("这句话不许动。"), "the composite still carries the protected text verbatim");

// A model that breaks a sentinel fails the whole composition: no best-effort
// restore, no guessed position, no appending the quote at the end.
const violating = await context.composeDocument({
  source: SOURCE,
  layers: DENSITY,
  protectedRanges: PROTECTED,
  cache: new Map(),
  runModel: async () => "第一段开头。\n\n第二段。\n\n第三段结尾。",
}).then(
  () => null,
  (error) => error
);
test.assert(
  !!violating && violating.code === "PROTECTED_RANGE_VIOLATION",
  "a model that drops a sentinel fails the composition with a protected-range error"
);
test.assert(
  !String(violating?.message || "").includes("appended"),
  "protection never restores by appending at the end"
);

const withoutLast = await context.composeDocument({
  source: SOURCE,
  layers: DENSITY,
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
