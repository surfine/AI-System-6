// Unified spec (2026-10-10) S05 contract: new revisions and old snapshots
// coexist; annotations remember what they were based on; only SEMANTIC
// changes become candidates (an ad slot never notifies); a dead anchor keeps
// its original words flagged, and re-anchoring needs the reader's explicit
// confirmation; checks run when the reader asks — automatic checks need a
// named opt-in that does not exist by default. Drives the REAL lazy module
// with the REAL vendored resolvePassage and the reading bridge.
import vm from "node:vm";
import * as contracts from "../../apps/desktop/app/vendor/unified-spec/contracts.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("source-versions-s05");
const versionsSource = read("app/features/source-versions.js");
const bridgeSource = read("app/features/reading-bridge.js");

const context = { console, String, Number, JSON, Math, Array, Object, Set, Map, Error, Boolean, Promise, Date, RegExp };
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
vm.runInContext(versionsSource, context, { filename: "source-versions.vm.js" });
const bridge = context.window.AISystem6ReadingBridge;
const api = context.window.AISystem6SourceVersions;
test.assert(!!api && typeof api.compareRevisions === "function" && typeof api.deadAnchor === "function",
  "the versions module installs its full surface");

// Coexistence: an annotation remembers its revision.
const page = bridge.snapshotFromReaderPage({
  id: "doc-1", url: "https://example.test/a",
  body: "报告口径：全年合并为 1200 万。附录给出分期说明。",
});
const ref = bridge.passageRefFromSelection(page, "全年合并为 1200 万");
const annotation = api.annotateProvenance(
  { id: "note-1", sourceId: "doc-1", quote: "全年合并为 1200 万", prefix: ref.selectors[0].prefix, suffix: ref.selectors[0].suffix },
  page,
);
test.assert(annotation.basedOnRevision === page.revision && annotation.quote === "全年合并为 1200 万",
  "the annotation records what it was based on");
// A re-fetch is a fresh page object — the site served new content, so the
// snapshot hashes the new body into a new revision. (Spreading the old
// snapshot keeps its old revision — correct: a revision you carry with you
// is the one you recorded.)
const current = bridge.snapshotFromReaderPage({
  id: "doc-1", url: "https://example.test/a",
  body: "报告口径已更正：全年 1500 万。附录给出分期说明。",
});
test.assert(current.revision !== page.revision,
  "the re-fetched page honestly carries a different revision");
const stale = api.annotationIsStale(annotation, current);
test.assert(stale.stale === true,
  "against a new revision the annotation says stale (the resolver's verdict)");

// Only SEMANTIC changes become candidates.
const adShuffle = api.compareRevisions(
  "正文第一段。广告位A 正文第二段。订阅我们！",
  "正文第一段。广告位B 正文第二段。登录查看更多",
);
test.assert(adShuffle.changed === false && adShuffle.reason === "no-semantic-change",
  "an ad/noise shuffle is no semantic change — nothing notifies");
const realChange = api.compareRevisions(
  "报告口径：全年合并为 1200 万。",
  "报告口径已更正：全年 1500 万。",
);
test.assert(realChange.changed === true && realChange.candidateForReview === true
  && realChange.added.some((sentence) => sentence.includes("1500 万")),
  "a real correction becomes a review candidate with its added sentence");
test.assert(api.compareRevisions("同一段话。", "同一段话。").changed === false,
  "identical text is no change at all");

// Dead anchors keep the original words, flagged; re-anchoring needs consent.
const dead = api.deadAnchor({ quote: "全年合并为 1200 万" });
test.assert(dead.status === "dead-anchor" && dead.quote === "全年合并为 1200 万",
  "the dead anchor shows the original with the flag");
const offered = api.deadAnchor({ quote: "全年合并为 1200 万" }, { at: 12 });
test.assert(offered.suggestion.at === 12 && offered.suggestion.needsConfirmation === true
  && offered.suggestion.confirmed === false,
  "a suggested position is an offer needing confirmation");
const confirmed = api.deadAnchor({ quote: "全年合并为 1200 万" }, { at: 12, confirmedByUser: "reader" });
test.assert(confirmed.suggestion.confirmed === true && !confirmed.suggestion.needsConfirmation,
  "only the reader's confirmation makes the re-anchor real");

// The refresh rule: the reader asks; automatic needs an explicit opt-in.
const manual = api.checkProvenance({});
test.assert(manual.requestedBy === "reader" && manual.automaticAllowed === false,
  "the default check is the reader's own act");
const auto = api.checkProvenance({ requestedBy: "background", automaticOptIn: { frequency: "weekly" } });
test.assert(auto.automaticAllowed === true && auto.frequency === "weekly",
  "an automatic check is only legal with a named opt-in and frequency");
const autoNoFreq = api.checkProvenance({ requestedBy: "background" });
test.assert(autoNoFreq.automaticAllowed === false,
  "an automatic check without a stated frequency is refused");

// Wiring: registered lazily.
test.assert(read("app/core/config.js").includes('"app/features/source-versions.js"'),
  "the module registers in the lazy loader");
test.assert(read("tooling/runtime-manifest.mjs").includes("app/features/source-versions.js"),
  "the runtime manifest lists the module");

test.finish();
