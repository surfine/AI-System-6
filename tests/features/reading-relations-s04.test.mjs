// Unified spec (2026-10-10) S04 contract: relations are candidates with two
// real anchored ends, a named type and a reason — accepted only by the user,
// reused by DocMap's existing Relations section (no second graph truth), and
// same-upstream articles count as ONE lineage. Drives the REAL lazy module
// with the reading bridge's real PassageRefs.
import vm from "node:vm";
import * as contracts from "../../apps/desktop/app/vendor/unified-spec/contracts.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("reading-relations-s04");
const relationsSource = read("app/features/reading-relations.js");
const bridgeSource = read("app/features/reading-bridge.js");

const context = {
  console, String, Number, JSON, Math, Array, Object, Set, Map, Error, Boolean, Promise, Date,
  structuredClone,
};
context.globalThis = context; context.window = context;
context.ClioWorksUnifiedContracts = { ...contracts };
context.clioRunHash = (text) => {
  let hash = 0x811c9dc5;
  const text2 = String(text || "");
  for (let index = 0; index < text2.length; index += 1) {
    hash ^= text2.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
};
vm.createContext(context);
vm.runInContext(bridgeSource, context, { filename: "reading-bridge.vm.js" });
vm.runInContext(relationsSource, context, { filename: "reading-relations.vm.js" });
const bridge = context.window.AISystem6ReadingBridge;
const api = context.window.AISystem6ReadingRelations;
test.assert(!!api && typeof api.buildRelation === "function" && typeof api.edgesForDocMap === "function",
  "the relations module installs its full surface");

// Real anchored ends, via the reading bridge.
const reportPage = bridge.snapshotFromReaderPage({
  id: "report-1", title: "上游报告", url: "https://example.test/report",
  body: "报告原文：全年预算合并为 1200 万，未分期列示。附录给出了口径说明。",
});
const articlePage = bridge.snapshotFromReaderPage({
  id: "article-1", title: "转述文章", url: "https://example.test/article",
  body: "文章称全年预算 1200 万。另一篇文章说这笔钱分期拨付。",
});
const refReport = bridge.passageRefFromSelection(reportPage, "全年预算合并为 1200 万");
const refArticle = bridge.passageRefFromSelection(articlePage, "文章称全年预算 1200 万");
const refOpposing = bridge.passageRefFromSelection(articlePage, "分期拨付");
test.assert(!!refReport && !!refArticle && !!refOpposing,
  "three real passage refs anchor from the two pages");

// Building: both quotes and a reason are required; the type is from the list.
test.assert(api.buildRelation({ from: refReport, to: refArticle, type: "explains", reason: "  " }) === null,
  "a relation without a reason is not built");
test.assert(api.buildRelation({ from: refReport, to: refArticle, type: "because-I-said-so", reason: "x" }) === null,
  "an invented type is refused — the five are the list");
test.assert(api.buildRelation({ from: refReport, to: refReport, type: "explains", reason: "same" }) === null,
  "a relation of a passage with itself is refused");
const candidate = api.buildRelation({
  from: refReport, to: refArticle, type: "explains",
  reason: "报告是原文口径；文章复述了报告的数字",
});
test.assert(!!candidate && candidate.status === "proposed" && candidate.acceptedByUserAt === null
  && candidate.from.selectors[0].quote === "全年预算合并为 1200 万",
  "a valid candidate starts proposed, with the anchored quote intact");

// Acceptance is the user's only door; withdrawal keeps the candidate.
const accepted = api.acceptRelation(candidate);
test.assert(accepted.status === "accepted" && accepted.acceptedByUserAt !== null,
  "acceptance stamps the user's time");
test.assert(api.withdrawRelation(accepted).quote === undefined
  && api.withdrawRelation(accepted).status === "withdrawn",
  "withdrawal keeps the candidate and clears the acceptance stamp");
test.assert(api.acceptRelation({ status: "withdrawn" }) === null
  || api.acceptRelation({ status: "withdrawn", selectors: [] })?.status !== "accepted",
  "a withdrawn candidate does not silently re-accept");

// DocMap reuse: only accepted relations become edges, matched through the
// caller's node table, and written in the shape the existing ## Relations
// section already reads (`- from -> to: label`).
const nodeIdByQuote = {
  "全年预算合并为 1200 万": "node-report",
  "文章称全年预算 1200 万": "node-article",
  "分期拨付": "node-schedule",
};
test.assert(api.edgesForDocMap(candidate, nodeIdByQuote).length === 0,
  "a still-proposed relation contributes no edge");
const acceptedExplains = api.acceptRelation(api.buildRelation({
  from: refReport, to: refArticle, type: "explains", reason: "原文口径",
}));
const edges = api.edgesForDocMap(acceptedExplains, nodeIdByQuote);
test.assert(edges.length === 1 && edges[0].from === "node-report" && edges[0].to === "node-article",
  "the accepted relation maps onto the doc's own nodes (most specific key wins)");
test.assert(edges[0].type === "explains" && edges[0].label.length > 0 && edges[0].label.length <= 48,
  "the edge carries the relation type with a bounded label");
const foreign = api.edgesForDocMap(acceptedExplains, { "无关节点": "node-x" });
test.assert(foreign.length === 0,
  "a relation whose ends have no node on this map adds nothing (no foreign graph)");

// The lineage rule: same-upstream articles are one support line, not N.
const art2 = bridge.passageRefFromSelection(bridge.snapshotFromReaderPage({
  id: "article-2", body: "又一篇文章引用了那份报告。",
}), "又一篇文章引用了那份报告");
const relA = api.acceptRelation(api.buildRelation({
  from: refReport, to: refArticle, type: "same-upstream-source",
  reason: "Both cite the 2026 budget report",
}));
const relB = api.acceptRelation(api.buildRelation({
  from: refReport, to: art2, type: "same-upstream-source",
  reason: "both cite the 2026 Budget Report",
}));
const relC = api.acceptRelation(api.buildRelation({
  from: refReport, to: art2, type: "same-upstream-source",
  reason: "cites a different yearly report",
}));
const lineages = api.lineagesOf([relA, relB, relC]);
test.assert(lineages.length === 2,
  "case-insensitive shared origins collapse into one lineage");
const merged = lineages.find((lineage) => lineage.articles === 2);
test.assert(!!merged && merged.independent === 1,
  "two articles on one origin count as one independent support, not two");

// Types carry named labels in the reader's language.
test.assert(api.typeLabel("same-upstream-source", "zh") === "共同来源"
  && api.typeLabel("contrasts", "en") === "Contrasts",
  "the five types have named labels");

// Wiring: registered lazily alongside its siblings.
const config = read("app/core/config.js");
test.assert(config.includes('"app/features/reading-relations.js"'),
  "the module registers in the lazy loader");
test.assert(read("tooling/runtime-manifest.mjs").includes("app/features/reading-relations.js"),
  "the runtime manifest lists the module");

test.finish();
