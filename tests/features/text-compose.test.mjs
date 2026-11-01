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
for (const [field, value] of [["language", "en"], ["targetFormat", "bili-dynamic"], ["targetDuration", "500w"], ["modelId", "other-model"], ["promptVersion", 2]]) {
  test.assert(context.composeCacheKey({ source: SOURCE, layers: DENSITY, protectedRanges: PROTECTED, [field]: value }) !== keyA, `${field} changes the cache key`);
}

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
  protectedText.replace(sentinels[0].token, "⟦AI6_PROTECTED_99_deadbeef⟧"),
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

// Composition is layer by layer: one model call per layer, each layer reading
// the output of the one before it. The injected model receives the sentinel-
// protected text and must keep every token verbatim; restore then returns the
// original bytes.
const calls = [];
const cache = new Map();
const runModel = async ({ input, layer }) => {
  calls.push(layer.kind);
  // The model must reproduce the sentinel tokens verbatim; composeDocument
  // verifies them strictly and then restores the original bytes.
  return `${input}\n\n[${layer.kind} pass]`;
};
const composed = await context.composeDocument({
  source: SOURCE,
  layers: [{ kind: "density", enabled: true, strength: 75, mask: "1-3" }, { kind: "mingming", enabled: true, strength: 50 }],
  protectedRanges: PROTECTED,
  cache,
  runModel,
});
test.assert(calls.join("|") === "density|mingming", "two enabled layers are two model calls, in stored order");
test.assert(
  composed.text.indexOf("[density pass]") >= 0 && composed.text.indexOf("[density pass]") < composed.text.indexOf("[mingming pass]"),
  "the second layer read the first layer's output, so its pass sits after it"
);
test.assert(composed.steps.length === 2 && composed.steps.every((step) => step.cached === false), "a fresh stack makes one real call per layer");
test.assert(
  composed.steps[1].input === composed.steps[0].output,
  "each step's input is the previous step's output, as the writer's text"
);
test.assert(composed.text.includes("这句话不许动。"), "the composite still carries the protected text verbatim");
test.assert(!composed.steps.some((step) => step.input.includes("⟦AI6_PROTECTED") || step.output.includes("⟦AI6_PROTECTED")), "the steps shown to the writer carry the protected text, never a sentinel");

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

// A layer that hands back nothing must not erase the text.
const empty = await context.composeDocument({
  source: SOURCE,
  layers: DENSITY,
  protectedRanges: PROTECTED,
  cache: new Map(),
  runModel: async ({ input }) => input.replace(/[^⟦AI6_PROTECTED_0-9a-f⟧]/g, "").trim() && "   ",
}).then(() => null, (error) => error);
test.assert(!!empty && (empty.code === "EMPTY_LAYER_OUTPUT" || empty.code === "PROTECTED_RANGE_VIOLATION"), "a layer that returns nothing fails the run instead of erasing the text");
const emptyNoProtection = await context.composeDocument({
  source: SOURCE,
  layers: DENSITY,
  cache: new Map(),
  runModel: async () => "   ",
}).then(() => null, (error) => error);
test.assert(emptyNoProtection?.code === "EMPTY_LAYER_OUTPUT", "an empty layer output is its own named failure");

// The per-layer cache is the point of running layer by layer. The key of a
// layer names what the layer READ and how it is set -- never a later layer.
const STACK = ["clean", "mingming", "hkrr"].map((kind) => ({ kind, enabled: true, strength: 50 }));
const layered = new Map();
const layeredCalls = [];
const layeredModel = async ({ input, layer }) => { layeredCalls.push(layer.kind); return `${input}|${layer.kind}:${layer.strength}`; };
await context.composeDocument({ source: "原稿", layers: STACK, cache: layered, runModel: layeredModel });
test.assert(layeredCalls.join(",") === "clean,mingming,hkrr" && layered.size === 3, "three layers are three calls and three cache entries");
layeredCalls.length = 0;
await context.composeDocument({ source: "原稿", layers: STACK, cache: layered, runModel: layeredModel });
test.assert(layeredCalls.length === 0, "the same stack again asks the model nothing");
// Change layer 3: layers 1 and 2 must not run again.
layeredCalls.length = 0;
const changedThird = [STACK[0], STACK[1], { ...STACK[2], strength: 75 }];
const afterChange = await context.composeDocument({ source: "原稿", layers: changedThird, cache: layered, runModel: layeredModel });
test.assert(layeredCalls.join(",") === "hkrr", "changing layer 3 re-runs layer 3 and nothing before it");
test.assert(afterChange.steps[0].cached === true && afterChange.steps[1].cached === true && afterChange.steps[2].cached === false, "layers 1 and 2 are reported as reused");
// Change layer 1: everything after it reads different input, so everything re-runs.
layeredCalls.length = 0;
await context.composeDocument({ source: "原稿", layers: [{ ...STACK[0], strength: 75 }, STACK[1], STACK[2]], cache: layered, runModel: layeredModel });
test.assert(layeredCalls.join(",") === "clean,mingming,hkrr", "changing layer 1 re-runs the layers after it, because they read its output");
// Turn layer 2 off: layer 3 now reads layer 1's output, a different input.
layeredCalls.length = 0;
await context.composeDocument({ source: "原稿", layers: [STACK[0], { ...STACK[1], enabled: false }, STACK[2]], cache: layered, runModel: layeredModel });
test.assert(layeredCalls.join(",") === "hkrr", "dropping a middle layer re-runs only the layers after it");
// A layer that failed keeps what finished before it.
const failing = new Map();
let failures = 0;
await context.composeDocument({
  source: "原稿",
  layers: STACK,
  cache: failing,
  runModel: async ({ input, layer }) => {
    if (layer.kind === "hkrr") { failures += 1; throw new Error("model went away"); }
    return `${input}|${layer.kind}`;
  },
}).catch(() => {});
test.assert(failures === 1 && failing.size === 2, "a failing layer leaves the layers before it in the cache");
// The key is a function of input, kind, step, scope and context.
const k = (over = {}) => context.layerCacheKey({ input: "甲", kind: "luoluo", step: 2, scope: [], ...over });
test.assert(k() === k(), "a layer key is deterministic");
test.assert(k({ input: "乙" }) !== k(), "the input is in the key");
test.assert(k({ kind: "hkrr" }) !== k(), "the kind is in the key");
test.assert(k({ step: 3 }) !== k(), "the step is in the key");
test.assert(k({ strength: 75 }) === k({ step: 3 }), "a percentage and its stop are the same dial");
test.assert(k({ scope: [{ start: 1, end: 2 }] }) !== k(), "the scope is in the key");
test.assert(k({ modelId: "other" }) !== k(), "the model is in the key");
// The plan says how many calls a run will make before it makes any.
const planCache = new Map();
const planned = context.planLayerRun({ source: "原稿", layers: STACK, cache: planCache });
test.assert(planned.total === 3 && planned.calls === 3 && planned.cached === 0, "a plan over an empty cache counts every layer as a call");
await context.composeDocument({ source: "原稿", layers: STACK.slice(0, 2), cache: planCache, runModel: layeredModel });
const plannedLater = context.planLayerRun({ source: "原稿", layers: STACK, cache: planCache });
test.assert(plannedLater.total === 3 && plannedLater.cached === 2 && plannedLater.calls === 1, "a plan counts the cached prefix and the one layer still to call");
const plannedFull = context.planLayerRun({ source: "原稿", layers: STACK.slice(0, 2), cache: planCache });
test.assert(plannedFull.calls === 0 && plannedFull.text === "原稿|clean:50|mingming:50", "a fully cached stack is rebuilt with no call, and the plan carries the text");

const withoutLast = await context.composeDocument({
  source: SOURCE,
  layers: DENSITY,
  protectedRanges: PROTECTED,
  cache,
  runModel,
});
test.assert(withoutLast.steps.length === 1 && withoutLast.steps[0].cached === true, "the shorter stack is the first layer's entry again: no second call");
test.assert(calls.join("|") === "density|mingming", "the shorter stack caused no additional model call");
test.assert(withoutLast.text.includes("[density pass]") && !withoutLast.text.includes("[mingming pass]"), "the composite without the last layer is the shorter stack's output");

const duplicateSource = "同一句。\n中间。\n同一句。";
const duplicateProtected = context.protectTextWithSentinels(duplicateSource, [{ start: 1, end: 1 }, { start: 3, end: 3 }]);
test.assert(duplicateProtected.sentinels.length === 2 && duplicateProtected.sentinels[0].token !== duplicateProtected.sentinels[1].token, "equal text in separate protected regions gets occurrence-unique sentinels");
test.assert(context.verifyProtectedSentinels(duplicateProtected.protectedText, duplicateProtected.sentinels).valid, "duplicate protected text verifies when both occurrence tokens survive");
test.assert(context.restoreProtectedSentinels(duplicateProtected.protectedText, duplicateProtected.sentinels) === duplicateSource, "both equal protected regions restore exactly");
test.assert([1, 2, 3].every(() => context.isProtectedToken(duplicateProtected.sentinels[0].token)), "protected token tests are stateless across repeated calls");

const fourCalls = [];
await context.composeDocument({ source: "正文", layers: ["mingming", "luoluo", "hkrr", "density"].map((kind) => ({ kind, enabled: true, strength: 50 })), runModel: async ({ input, layer }) => { fourCalls.push(layer.kind); return input; } });
test.assert(fourCalls.length === 4, "four enabled layers are four model calls");

// A scope that covers nothing the layer can reach costs no call.
let scopedCalls = 0;
const scoped = await context.composeDocument({
  source: SOURCE,
  layers: [{ kind: "density", enabled: true, strength: 50, mask: "4" }],
  protectedRanges: PROTECTED,
  runModel: async ({ input }) => { scopedCalls += 1; return input; },
});
test.assert(scopedCalls === 0 && scoped.steps[0].skipped === true, "a layer scoped only to protected lines is skipped without a call");

// An empty or all-disabled stack returns the negative untouched, with no call.
const noLayers = await context.composeDocument({ source: SOURCE, layers: [], protectedRanges: PROTECTED, cache, runModel });
test.assert(noLayers.text === SOURCE && noLayers.steps.length === 0, "no enabled layers means the composite is the negative");
const disabled = await context.composeDocument({
  source: SOURCE,
  layers: [{ kind: "density", enabled: false, strength: 75 }],
  protectedRanges: PROTECTED,
  cache,
  runModel,
});
test.assert(disabled.text === SOURCE && disabled.steps.length === 0, "a disabled layer is not part of the composite");

test.finish();
