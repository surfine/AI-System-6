// Quick Draft adjustment layers — pure data. 明明传球 / 洛洛接球 / HKRR 抬升
// are layers with a switch and a strength parameter; the stack stays in the
// existing workspace record and a layer reads the negative, never another
// layer's output. The pure module is executed here in a bare vm context:
// no DOM, no record, no translations.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("adjustment-layers");
const source = read("app/core/adjustment-layers.js");

test.assertNotIncludes(source, "document.", "adjustment-layers never touches the DOM");
test.assertNotIncludes(source, "activeProjectQuickDraft", "adjustment-layers never touches the draft record");
test.assertNotIncludes(source, "t(\"", "adjustment-layers never touches translations");
test.assertNotIncludes(source, "adjustmentStrengthPromptLine", "prompt copy stays beside the prompts that consume it");

const context = vm.createContext({});
vm.runInContext(source, context);

// Defaults: every layer present, on, standard strength, in stack order.
const defaults = context.defaultAdjustmentLayers();
test.assert(
  defaults.map((layer) => layer.kind).join(",") === "mingming,luoluo,hkrr,density",
  "the stack keeps the four layers in canonical order"
);
test.assert(
  defaults.every((layer) => layer.enabled && layer.strength === 50),
  "fresh layers default to on at standard strength"
);
test.assert(
  context.adjustmentLayer("density", defaults)?.enabled === true
    && context.adjustmentLayer("density", defaults)?.strength === 50,
  "density is a fourth adjustment kind with standard defaults"
);

// Normalization: partial records fill defaults, unknown kinds drop, bad
// strengths coerce to standard, and a disabled switch survives.
const partial = context.normalizeAdjustmentLayers([
  { kind: "luoluo", strength: 25 },
  { kind: "hkrr", enabled: false },
  { kind: "unknown" },
]);
test.assert(
  partial.length === 4 && partial.map((layer) => layer.kind).join(",") === "luoluo,hkrr,mingming,density",
  "the stored order is preserved and missing layers fill in at the end"
);
test.assert(partial[0].strength === 25, "an explicit strength is kept");
test.assert(partial[1].enabled === false, "a disabled layer stays off");
test.assert(partial[2].kind === "mingming" && partial[2].strength === 50, "a missing layer fills in with standard defaults");
test.assert(partial.every((layer) => layer.kind !== "unknown"), "unknown kinds are dropped");
const normalizedPartial = context.normalizeAdjustmentLayers(partial);
test.assert(
  JSON.stringify(context.normalizeAdjustmentLayers(normalizedPartial)) === JSON.stringify(normalizedPartial),
  "normalization is idempotent"
);
const reordered = context.normalizeAdjustmentLayers([
  { kind: "hkrr" },
  { kind: "mingming" },
  { kind: "luoluo" },
]);
test.assert(
  reordered.map((layer) => layer.kind).join(",") === "hkrr,mingming,luoluo,density",
  "a reordered stack keeps the user's order"
);
test.assert(
  defaults.every((layer) => Array.isArray(layer.mask) && layer.mask.length === 0),
  "fresh layers carry an empty mask (whole body)"
);

// Strength lookup: enabled layers report a strength, disabled layers have none
// (off is not "zero-strength on"), and out-of-enum values fall back to
// standard.
test.assert(context.adjustmentStrength("mingming", defaults) === 50, "an enabled layer reports its strength");
test.assert(context.adjustmentStrength("hkrr", partial) === null, "a disabled layer has no strength");
test.assert(
  context.adjustmentStrength("luoluo", [{ kind: "luoluo", enabled: true, strength: 99 }]) === 50,
  "a strength outside the enum coerces to standard"
);
test.assert(context.adjustmentLayer("unknown", defaults) === null, "an unknown kind is never returned as a layer");

// Masks: "3-5, 8" parses to sorted, merged, 1-based inclusive ranges; bad and
// empty input means no mask; ranges clamp to the current body at use time.
const mask = context.normalizeAdjustmentLayerMask("3-5, 8, 2-4");
test.assert(
  JSON.stringify(mask) === JSON.stringify([{ start: 2, end: 5 }, { start: 8, end: 8 }]),
  "mask text parses into merged line ranges"
);
test.assert(
  JSON.stringify(context.normalizeAdjustmentLayerMask("abc")) === "[]"
    && JSON.stringify(context.normalizeAdjustmentLayerMask("")) === "[]",
  "invalid or empty mask text means no mask"
);
test.assert(
  JSON.stringify(context.normalizeAdjustmentLayerMask([{ start: 3, end: 5 }])) === JSON.stringify([{ start: 3, end: 5 }]),
  "mask arrays pass through normalized"
);
test.assert(
  JSON.stringify(context.adjustmentLayerMaskRanges({ mask: "1-9" }, 4)) === JSON.stringify([{ start: 1, end: 4 }]),
  "mask ranges clamp to the current line count"
);
test.assert(
  JSON.stringify(context.adjustmentLayerMaskRanges({ mask: "3-5" }, 0)) === "[]",
  "an empty body has no masked lines"
);
test.assert(
  context.adjustmentMaskSummary([{ start: 3, end: 5 }, { start: 8, end: 8 }]) === "3-5, 8",
  "mask summaries collapse single lines and keep ranges"
);
const maskedLayer = context.normalizeAdjustmentLayers([{ kind: "luoluo", mask: "3-5" }]);
test.assert(
  JSON.stringify(maskedLayer[0].mask) === JSON.stringify([{ start: 3, end: 5 }]),
  "layer normalization keeps the stored mask"
);

test.finish();
