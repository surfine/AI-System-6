// Unified spec (2026-10-10) R07 contract: comparison lists differences
// first (object/date/definition/condition), explains only what names its
// basis, never adjudicates a contradiction without same-object evidence —
// it returns the open question that would settle it instead — and "凭什么 /
// 怎样推翻" produce evidence paths, not verdicts. Drives the REAL lazy
// module with the reading bridge's real anchored refs.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("reading-compare-r07");
const compareSource = read("app/features/reading-compare.js");
const bridgeSource = read("app/features/reading-bridge.js");

const context = { console, String, Number, JSON, Math, Array, Object, Set, Map, Error, Boolean, Promise, Date };
context.globalThis = context; context.window = context;
context.clioRunHash = (t) => "h";
vm.createContext(context);
vm.runInContext(bridgeSource, context, { filename: "reading-bridge.vm.js" });
vm.runInContext(compareSource, context, { filename: "reading-compare.vm.js" });
const bridge = context.window.AISystem6ReadingBridge;
const api = context.window.AISystem6ReadingCompare;
test.assert(!!api && typeof api.buildComparison === "function" && typeof api.adjudicate === "function",
  "the compare module installs its full surface");

// Real anchored sides: two reader tabs of one source and a scrap.
const tabA = bridge.snapshotFromReaderPage({ id: "doc-1", title: "标签一", body: "全年预算 1200 万，一次性计列。" });
const tabB = bridge.snapshotFromReaderPage({ id: "doc-2", title: "标签二", body: "该项目预算分两期，每期 600 万。" });
const scrapSide = { id: "scrap-1", body: "传scraps里的记录：预算以季度拨付。" };
const refA = bridge.passageRefFromSelection(tabA, "全年预算 1200 万");
const refB = bridge.passageRefFromSelection(tabB, "每期 600 万");
test.assert(!!refA && !!refB, "both sides anchor");

// Differences first — the four facets, honestly unknown where a side is mute.
const dateRow = api.buildDifference({
  facet: "date",
  sides: [{ label: "标签一", says: "2026 全年" }, { label: "标签二", says: "2026 全年" }],
});
test.assert(dateRow.differs === false, "matching statements say no difference");
const conditionRow = api.buildDifference({
  facet: "condition",
  sides: [{ label: "标签一", says: "一次性计列" }, { label: "标签二", says: "分两期" }],
});
test.assert(conditionRow.differs === true, "opposing statements name the difference");
const muteRow = api.buildDifference({
  facet: "definition",
  sides: [{ label: "标签一", says: "合并口径" }, { label: "标签二", quote: "无此句", says: "" }],
});
test.assert(muteRow.differs === null,
  "a side with no statement leaves the facet honestly unknown, not guessed");
test.assert(api.buildDifference({ facet: "vibes", sides: [] }) === null,
  "an invented facet is refused");
test.assert(api.buildDifference({ facet: "date", sides: [{ label: "只有一边" }] }) === null,
  "one side is not a comparison");

// The comparison: explanation must name its basis.
const comparison = api.buildComparison({
  sides: [{ label: "Reader 标签一", ref: refA }, { label: "Reader 标签二", ref: refB }],
  differences: [conditionRow, dateRow],
  explanation: "两处口径不同：一次性与分期的记账条件不同。",
});
test.assert(!!comparison && comparison.sides.length === 2
  && comparison.sides[0].quote === "全年预算 1200 万",
  "the comparison carries anchored quotes per side");
test.assert(comparison.explanationRestsOn.join(",") === "condition",
  "the explanation rests on the differing facets it actually has");
test.assert(api.buildComparison({ sides: [{ label: "单边", ref: refA }] }) === null,
  "one anchored side is not a comparison");

// 没有依据不裁定矛盾: differing sides stay unsettled with the open question.
const unsettled = api.adjudicate(conditionRow);
test.assert(unsettled.verdict === "unsettled" && unsettled.needs.includes("same-object-evidence")
  && unsettled.openQuestion.includes("同一个对象"),
  "without evidence the module returns the settling question, not a verdict");
const conflict = api.adjudicate(conditionRow, { sameObjectEvidence: "同一项目号 P-2026-04" });
test.assert(conflict.verdict === "conflict", "same-object evidence is what makes it a conflict");
test.assert(api.adjudicate(dateRow).verdict === "no-difference",
  "matching rows need no adjudication");

// 凭什么 / 怎样推翻: evidence paths, not verdicts.
const paths = api.challengePaths({
  claim: "全年预算为 1200 万",
  supportingRef: refA,
});
test.assert(!!paths && paths.support.quote === "全年预算 1200 万",
  "the path names its supporting quote");
test.assert(paths.confirmPath.includes("独立") && paths.refutePath.includes("相悖"),
  "confirm and refute are questions to run");
test.assert(api.challengePaths({ claim: "x" }) === null,
  "a claim without a supporting anchor builds no path");

// Wiring: registered lazily.
test.assert(read("app/core/config.js").includes('"app/features/reading-compare.js"'),
  "the module registers in the lazy loader");
test.assert(read("tooling/runtime-manifest.mjs").includes("app/features/reading-compare.js"),
  "the runtime manifest lists the module");

test.finish();
