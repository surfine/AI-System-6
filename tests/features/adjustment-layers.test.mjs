import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
// Quick Draft adjustment layers — pure data. 铭铭视角 / 落落接收 / HKRR 提亮
// are layers with a switch and a strength parameter; the stack stays in the
// existing workspace record and a layer reads the negative, never another
// layer's output. The pure module is executed here in a bare vm context:
// no DOM, no record, no translations.

import vm from "node:vm";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("adjustment-layers");
const source = read("app/core/adjustment-layers.js");

test.assertNotIncludes(source, "document.", "adjustment-layers never touches the DOM");
test.assertNotIncludes(source, "activeProjectQuickDraft", "adjustment-layers never touches the draft record");
test.assertNotIncludes(source, "t(\"", "adjustment-layers never touches translations");
test.assertNotIncludes(source, "adjustmentStrengthPromptLine", "prompt copy stays beside the prompts that consume it");

const context = vm.createContext({});
vm.runInContext(source, context);

// Defaults: every layer present, off, standard strength, in stack order.
const defaults = context.defaultAdjustmentLayers();
test.assert(
  defaults.map((layer) => layer.kind).join(",") === "mingming,luoluo,hkrr,density",
  "the stack keeps the four layers in canonical order"
);
test.assert(
  defaults.every((layer) => !layer.enabled && layer.strength === 50),
  "fresh layers default to off at standard strength"
);
test.assert(
  context.adjustmentLayer("density", defaults)?.enabled === false
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
test.assert(context.adjustmentStrength("mingming", defaults) === null, "a fresh disabled layer has no strength");
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

// The three adjustment layers are named after real people, so a homophone is a
// misspelling of a person, not a synonym. 铭铭 must never appear as 明明 and
// 落落 must never appear as 洛洛. This was not theoretical: "明明传球 / 洛洛接球"
// had reached CLAUDE.full.md's own prose and a published RELEASE-NOTES entry --
// both names wrong, in text that went out as a GitHub release's "What's new".
// 明明 alone is an ordinary Chinese adverb, so only the layer phrasings are
// checked, and lines that state the rule may quote the wrong form.
{
  // internal/ is absent from the public snapshot, and this test ships in it.
  // Walking a root that is not there threw ENOENT and took the whole public
  // `npm test` down -- the run the snapshot sync makes before it pushes.
  const roots = ["internal", "docs", "apps", "site", "tests", "tooling"].filter((root) => existsSync(root));
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(md|html|js|mjs|json|css)$/.test(entry.name)) continue;
      // This detector necessarily spells the wrong forms, in its comment and in
      // its own pattern. It is the one file that may.
      if (entry.name === "adjustment-layers.test.mjs") continue;
      const text = readFileSync(full, "utf8");
      text.split("\n").forEach((line, index) => {
        if (/never 洛洛|绝不是洛洛|never 明明|绝不是明明/.test(line)) return;
        if (/洛洛接球|洛洛接收|明明传球|明明视角/.test(line)) {
          offenders.push(`${full}:${index + 1}`);
        }
      });
    }
  };
  let scanned = 0;
  const countingWalk = (dir) => { scanned += 1; walk(dir); };
  for (const root of roots) countingWalk(resolveProjectPath(root));
  test.assert(scanned === roots.length, `the homophone walk reached all ${roots.length} roots`);
  test.assert(
    offenders.length === 0,
    offenders.length === 0
      ? "no adjustment layer is written with a homophone of its person's name"
      : `a real person's name is misspelled at: ${offenders.slice(0, 6).join(", ")}`
  );
}

test.finish();
