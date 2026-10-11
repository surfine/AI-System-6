// Unified spec (2026-10-10) P4 contract: the reading DTOs map onto the
// records the desk already has — no parallel store. Reader pages resolve as
// snapshots (the vendored resolvePassage verdicts, honestly: exact, ambiguous,
// lost, stale), selections anchor as PassageRefs with their affixes captured
// before any tool click, "stay here" rides the scrap record itself (one
// object, one identity, Reader/Scrapbook/Finder are views of it), and thread
// citations must live inside the allowed passages. Drives the REAL lazy
// reading bridge with the REAL vendored contracts.
import vm from "node:vm";
import * as contracts from "../../apps/desktop/app/vendor/unified-spec/contracts.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("reading-bridge-p4");
const bridgeSource = read("app/features/reading-bridge.js");

const context = {
  console, String, Number, JSON, Math, Array, Object, Error, Boolean, Promise,
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
const bridge = context.window.AISystem6ReadingBridge;
test.assert(!!bridge && typeof bridge.snapshotFromReaderPage === "function"
  && typeof bridge.resolveRef === "function" && typeof bridge.attachToScrap === "function",
  "the reading bridge installs its full surface");

const page = {
  id: "doc-1",
  title: "来源一",
  url: "https://example.test/one",
  body: "第一段讲的是出发点，以及它为什么重要。\n\n第二段给出了转折：同一句话重复了，同一句话重复了，结尾不同。第三段总结。",
};
const snapshot = bridge.snapshotFromReaderPage(page);
test.assert(snapshot.id === "doc-1" && typeof snapshot.revision === "string" && snapshot.revision.length > 0
  && snapshot.origin.type === "url",
  "a reader page becomes a resolvable snapshot with its own revision");

// A selection anchors exactly where it sits, affixes captured.
const ref = bridge.passageRefFromSelection(snapshot, "同一句话重复了");
test.assert(!!ref && ref.sourceId === "doc-1" && ref.revision === snapshot.revision,
  "the selection anchors to the page's own revision");
const resolved = bridge.resolveRef(ref, snapshot);
test.assert(resolved.status === "found" && resolved.start === snapshot.text.indexOf("同一句话重复了"),
  "the ref resolves found at the true offset");

// A repeated sentence with distinct surroundings stays unambiguous: the
// second occurrence pins itself with `at`, and its own affixes resolve it.
const repeatAt = snapshot.text.indexOf("同一句话重复了", snapshot.text.indexOf("同一句话重复了") + 1);
const lateRef = bridge.passageRefFromSelection(snapshot, "同一句话重复了", { affixLength: 48, at: repeatAt });
test.assert(lateRef.selectors[0].offset === repeatAt,
  "a pinned occurrence anchors at its own offset");
const resolvedLate = bridge.resolveRef(lateRef, snapshot);
test.assert(resolvedLate.status === "found" && resolvedLate.start === repeatAt,
  "affixes disambiguate a repeated sentence (found, the right one)");
const bare = { sourceId: ref.sourceId, revision: snapshot.revision, selectors: [{ quote: "同一句话重复了", prefix: "", suffix: "" }] };
const bareResolved = bridge.resolveRef(bare, snapshot);
test.assert(bareResolved.status === "ambiguous",
  "without affixes the vendored contract says ambiguous — the bridge repeats it, not a guess");
const emptyThrew = (() => {
  const emptied = JSON.parse(JSON.stringify(bare));
  emptied.selectors[0].quote = "";
  try { bridge.resolveRef(emptied, snapshot); return false; }
  catch (error) { return /quote is required/.test(error.message); }
})();
test.assert(emptyThrew,
  "an empty quote is refused outright — the vendored contract's verdict, not a guess");

// Honesty under change: a re-fetch that changed the page invalidates the
// revision first (stale); a same-revision page that lost the quote is lost.
const revised = bridge.snapshotFromReaderPage({ ...page, revision: "next" });
test.assert(bridge.resolveRef(ref, revised).status === "stale",
  "a moved revision resolves stale, not silently re-found");
const sameRevision = { ...snapshot, text: "只剩第三段。" };
test.assert(bridge.resolveRef(ref, sameRevision).status === "lost",
  "a removed quote at the same revision resolves lost, honestly");

// S01 留在这里: the scrap keeps its identity and gains the reading extension
// on the same object — Reader/Scrapbook/Finder are views of one record.
const scrap = { id: "scrap-9", projectId: "proj-1", title: "留在这里", body: "原文摘录", tags: [], createdAt: "2026-10-11T00:00:00Z" };
const kept = bridge.attachToScrap(scrap, {
  originalPassageRefs: [ref],
  userNote: "为什么转折？",
  adoptedInterpretationIds: ["ans-2"],
  readingThreadId: "thread-7",
});
test.assert(kept.id === "scrap-9" && kept.title === "留在这里" && kept.body === "原文摘录",
  "the scrap keeps its own identity");
test.assert(kept.readingScrap.readingThreadId === "thread-7"
  && kept.readingScrap.originalPassageRefs.length === 1
  && kept.readingScrap.adoptedInterpretationIds.length === 1,
  "the thread, the anchored passage and the adopted answer ride one record");
test.assert(JSON.parse(JSON.stringify(kept)).readingScrap.originalPassageRefs[0].selectors[0].quote === "同一句话重复了",
  "the extension survives the desk's own persistence round-trip");
test.assert(bridge.readingExtensionOf({ id: "plain" }) === null,
  "an unextended scrap reads as null, not an empty pose");

// Thread citations must live inside the passages this run was allowed to read.
const allowed = [ref, lateRef];
test.assert(bridge.citationsValid([ref.id], allowed).ok === true,
  "citations inside the allowed passages validate");
const outside = bridge.citationsValid([ref.id, "passage-never-issued"], allowed);
test.assert(outside.ok === false && outside.invalid.length === 1,
  "a citation outside the allowed set is named, not waved through");
test.assert(bridge.citationsValid([], allowed).ok === false,
  "an empty citation list is refused, not treated as all-clear");

test.finish();
