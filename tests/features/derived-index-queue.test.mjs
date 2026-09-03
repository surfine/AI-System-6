import { createRequire } from "node:module";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("derived-index-queue");
const runtime = require("../../apps/desktop/app/shared/derived-index-runtime.js");

const source = {
  projectId: "project-a",
  sourceId: "source-a",
  sourceKind: "project-file",
  sourceVersion: "v1",
  title: "Source A",
  content: "# First\n\nA committed source paragraph with enough material to derive.",
};
const firstSync = runtime.synchronizeDerivedSources(null, [source], {
  now: "2026-07-30T00:00:00.000Z",
});
const key = runtime.sourceKey(source);
test.assert(firstSync.changedSourceKeys.includes(key), "a new committed source is detected by content hash");
test.assert(
  firstSync.state.jobs.filter((job) => job.sourceKey === key && job.status === "pending").length === 4,
  "chunks, gist, DocMap, and embeddings are queued independently"
);
test.assert(
  !JSON.stringify(firstSync.state).includes("A committed source paragraph"),
  "queue state does not duplicate raw source content"
);

const claimed = runtime.claimNextDerivedJob(firstSync.state, {
  now: "2026-07-30T00:00:01.000Z",
});
test.assert(claimed.job?.kind === "chunks", "derived jobs preserve the deterministic product order");
const completed = runtime.completeDerivedJob(claimed.state, claimed.job, [{
  content: "Derived chunk",
  chunkHash: "chunk-a",
}], {
  now: "2026-07-30T00:00:02.000Z",
});
test.assert(completed.sources[key].products.chunks.status === "ready", "completed products retain their source hash");

const changedSource = { ...source, sourceVersion: "v2", content: `${source.content}\n\nChanged.` };
const changedSync = runtime.synchronizeDerivedSources(completed, [changedSource], {
  now: "2026-07-30T00:00:03.000Z",
});
test.assert(changedSync.state.sources[key].products.chunks.stale === true, "content changes invalidate old derived products");
test.assert(
  changedSync.state.jobs.filter((job) =>
    job.sourceKey === key && job.sourceHash === runtime.sourceHash(changedSource) && job.status === "pending"
  ).length === 4,
  "content changes queue a complete replacement product set"
);

const changedClaim = runtime.claimNextDerivedJob(changedSync.state, {
  now: "2026-07-30T00:00:04.000Z",
});
const failed = runtime.failDerivedJob(changedClaim.state, changedClaim.job, new Error("offline"), {
  now: "2026-07-30T00:00:05.000Z",
  retryBaseMs: 1000,
});
test.assert(failed.sources[key].sourceHash === runtime.sourceHash(changedSource), "a failed derived job never rolls back source identity");
test.assert(failed.jobs.find((job) => job.id === changedClaim.job.id)?.status === "failed", "derived failures remain retryable queue state");

const removed = runtime.synchronizeDerivedSources(failed, [], {
  now: "2026-07-30T00:00:06.000Z",
});
test.assert(!removed.state.sources[key], "deleted committed sources are pruned from the derived index");

const gist = runtime.buildDerivedProduct("gist", source);
const docMap = runtime.buildDerivedProduct("docmap", source);
test.assert(gist.coarse.includes("First"), "gist derivation is deterministic and local");
test.assert(docMap.nodes[0]?.title === "First", "DocMap derivation preserves Markdown headings");

const manifest = read("tooling/runtime-manifest.mjs");
const persistence = read("app/core/persistence-status.js");
const boot = read("app/core/boot.js");
const adapter = read("app/core/derived-index-queue.js");
test.assertIncludes(manifest, '"app/shared/derived-index-runtime.js"', "the pure queue runtime loads with the app");
test.assertIncludes(manifest, '"app/core/derived-index-queue.js"', "the post-commit browser adapter loads with the app");
// The guard is what matters, not whether it is a single statement: other work
// now shares the same `if (saved)` block (see live-progress: whatever is
// persisted is announced).
test.assertMatches(
  persistence,
  /persistDeskState\(\)\)\s*\.then\(\(saved\) => \{\s*if \(saved\) \{?\s*(?:\/\/[^\n]*\n\s*)*window\.AISystem6DerivedIndexQueue\?\.afterProjectCommit\(\)/,
  "derived work starts only after the source transaction succeeds"
);
test.assertIncludes(boot, "AISystem6DerivedIndexQueue.restore()", "durable pending jobs resume at startup");
test.assertIncludes(adapter, 'const derivedIndexStorageKey = "derived-index:v1"', "derived products use a versioned IndexedDB record");
test.assertIncludes(adapter, "fromDerivedIndex: true", "ready derived chunks are published to retrieval");
test.assertIncludes(adapter, "rebuildDerivedIndexProject", "the queue exposes an explicit project rebuild path");
test.assertNotIncludes(adapter, "saveDeskState(", "derived products cannot recursively save or mutate source stores");

// A picture the writer had read is searchable material.
//
// The album has stored that reading on the picture record for a long time, and
// nothing ever read it back: visionNotes was written in exactly one place and
// consumed in none. A photographed whiteboard sat in the project as an untitled
// thumbnail while the only description of it that existed could not be found.
const queueSource = read("app/core/derived-index-queue.js");
test.assertIncludes(queueSource, 'sourceKind: "picture"',
  "a picture is a kind of source the index knows about");
test.assertIncludes(queueSource, "content: picture.visionNotes",
  "and what it indexes is the reading, which is the only text a picture has");
test.assertIncludes(queueSource, 'String(picture?.visionNotes || "").trim()',
  "a picture with no reading stays out of the index, because there is nothing to match on");

// --- Notification language survives a push before the language settles ----
//
// The queue runs on a background timer and can push a notification before the
// writer's language preference has settled, or the notification can sit in
// Notification Center across a later language switch. Rendering the message
// once, at push time, froze it in whatever language happened to be current at
// that instant. The fix: hand pushSystemNotification a translation key + args
// and let it re-render at DRAW time, in the persistence-status.js patch this
// file's adapter depends on.
const persistenceSource = read("app/core/persistence-status.js");
test.assertMatches(
  queueSource,
  /function updateDerivedIndexNotification\(messageKey, messageArgs, state\) \{/,
  "the notification helper takes a translation key + args, not a pre-rendered string"
);
test.assertIncludes(
  queueSource,
  "derivedIndexNotificationId = pushSystemNotification(t(messageKey, ...messageArgs), {\n    messageKey,\n    messageArgs,",
  "the push carries its own key + args alongside the current-language render"
);
test.assertNotMatches(
  queueSource,
  /updateDerivedIndexNotification\(\s*t\(/,
  "no call site pre-renders the message before handing it to the notification helper"
);
test.assertIncludes(
  persistenceSource,
  "function renderSystemNotificationText(item)",
  "the Notification Center owns one function that decides how a notification's text is drawn"
);
test.assertMatches(
  persistenceSource,
  /message\.textContent = renderSystemNotificationText\(item\);/,
  "the rendered list draws through that function rather than reading the stored snapshot directly"
);
test.assertMatches(
  persistenceSource,
  /messageKey: item\.messageKey \|\| "",\s*\n\s*messageArgs: item\.messageKey \? \(item\.messageArgs \|\| \[\]\) : \[\],/,
  "the durable record carries the key + args, not only the rendered snapshot"
);
test.assertMatches(
  persistenceSource,
  /messageKey: String\(item\?\.messageKey \|\| ""\),\s*\n\s*messageArgs: Array\.isArray\(item\?\.messageArgs\) \? item\.messageArgs : \[\],/,
  "restoring a notification is tolerant of an older record with no key (it keeps its frozen rendered text)"
);

test.finish();
