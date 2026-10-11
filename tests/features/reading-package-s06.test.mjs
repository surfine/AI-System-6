// Unified spec (2026-10-10) S06 contract: the annotated reading package.
// Own-work and authorized full text travel whole; anything else travels as
// the reader's excerpts plus the link. The manifest maps the desk's own ids;
// an integrity hash covers the manifest. Import refuses path traversal,
// oversize packs, unknown schemas, dangerous URLs and duplicate ids across
// every id space. A receiver's annotations land under fresh owner/layer ids
// pointing at — never replacing — the sender's layer. And the package makes
// no Office-fidelity promise. Drives the REAL lazy module.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("reading-package-s06");
const source = read("app/features/reading-package.js");

const context = { console, String, Number, JSON, Math, Array, Object, Set, Map, Error, Boolean, Promise, Date, RegExp };
context.globalThis = context; context.window = context;
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
vm.runInContext(source, context, { filename: "reading-package.vm.js" });
const api = context.window.AISystem6ReadingPackage;
test.assert(!!api && typeof api.buildManifest === "function" && typeof api.validateImport === "function",
  "the package module installs its full surface");

// Distribution: own-work and authorized travel whole; the rest as excerpts.
test.assert(api.distributionFor({ distribution: "own-work" }).includeFullText === true,
  "own-work travels whole");
test.assert(api.distributionFor({ distribution: "authorized-full" }).includeFullText === true,
  "authorized full text travels whole");
const excerpt = api.distributionFor({ distribution: "excerpt-only" });
test.assert(excerpt.includeFullText === false && excerpt.carryExcerpts === true && excerpt.carryLink === true,
  "excerpt-only travels as excerpts plus the link");
const unknown = api.distributionFor({ distribution: "unknown" });
test.assert(unknown.includeFullText === false && unknown.recordedAs === "unknown",
  "an unknown distribution never upgrades itself to full text");
test.assert(api.distributionFor({}).includeFullText === false,
  "a missing distribution defaults to not-full-text");

// The manifest maps the desk's own records.
const manifest = api.buildManifest({
  project: { id: "proj-1" },
  sources: [
    { id: "doc-1", title: "自己的文档", distribution: "own-work", origin: { type: "file", locator: "reports/a.md" } },
    { id: "doc-2", title: "别人的报道", distribution: "excerpt-only", excerpts: [{ id: "passage-9" }] },
  ],
  threads: [{ id: "thread-1" }],
  notes: [{ id: "note-1" }],
  relations: [{ id: "relation-1" }],
  readingOrder: ["doc-1", "doc-2"],
});
test.assert(!!manifest && manifest.schema === "reading-package" && manifest.projectId === "proj-1",
  "the manifest builds with its schema");
test.assert(manifest.sources[0].includesFullText === true && manifest.sources[1].includesFullText === false,
  "distribution decisions ride each source entry");
test.assert(manifest.sources[1].excerptIds.join(",") === "passage-9",
  "the excerpt ids travel with the entry");
test.assert(manifest.readingOrder.join(",") === "doc-1,doc-2",
  "the reading order travels");
test.assert(api.buildManifest({ project: {} }) === null,
  "a manifest without its project is refused");
const hash = api.integrityHash(manifest);
test.assert(typeof hash === "string" && hash.length > 0 && hash === api.integrityHash(manifest),
  "the integrity hash is deterministic over the manifest");

// Import: the five refusals.
const good = api.validateImport({ manifest, sources: [] });
test.assert(good.ok === true, "an honest pack imports clean");

const traversal = api.validateImport({
  manifest,
  sources: [{ name: "../../../etc/passwd" }],
});
test.assert(traversal.ok === false && traversal.problems.some((problem) => problem.reason === "path traversal"),
  "a path-traversal name is refused");

const oversize = api.validateImport({
  manifest,
  // The declared size is what a sender states before the body ships; a
  // declaration past the wire cap is refused before anything else runs.
  declaredSizeBytes: 600 * 1024 * 1024,
});
test.assert(oversize.ok === false && oversize.problems.some((problem) => problem.reason === "oversize"),
  "an oversize pack is refused before anything else runs");

const wrongSchema = api.validateImport({
  manifest: { ...manifest, schema: "something-else" },
});
test.assert(wrongSchema.ok === false && wrongSchema.problems.some((problem) => problem.reason === "unknown schema"),
  "an unknown schema is refused");

const dangerous = api.validateImport({
  manifest,
  sources: [{ url: "javascript:alert(1)" }, { url: "file:///etc/passwd" }, { url: "data:text/html,x" }],
});
test.assert(dangerous.ok === false && dangerous.problems.filter((problem) => problem.reason === "dangerous url").length === 3,
  "javascript:, file: and data: urls are all refused");
const safeUrl = api.validateImport({ manifest, sources: [{ url: "https://example.test/a" }] });
test.assert(safeUrl.ok === true, "an https link travels");

const duplicate = api.validateImport({
  manifest: api.buildManifest({
    project: { id: "proj-1" },
    sources: [{ id: "doc-1" }],
    threads: [{ id: "doc-1" }],
  }),
});
test.assert(duplicate.ok === false && duplicate.problems.some((problem) => problem.reason.startsWith("duplicate id")),
  "an id shared across id spaces is refused");

// Receiving: fresh owner/layer, sender's layer preserved upstream.
const received = api.receiveAnnotation(
  { id: "note-1", layerId: "layer-sender", quote: "原句" },
  "receiver-a",
);
test.assert(received.ownerId === "receiver-a" && received.layerId !== "layer-sender",
  "the receiver's annotation lands under a fresh layer id");
test.assert(received.upstreamLayerId === "layer-sender",
  "the sender's layer travels as the upstream reference, not overwritten");
test.assert(api.receiveAnnotation({ id: "n" }, "  ") === null,
  "an anonymous receiver receives nothing");

// The honest scope note.
test.assert(api.coexistenceNote().includes("无损编辑") && api.coexistenceNote().includes("既有对象 ID"),
  "the pack says it is no Office-fidelity promise and keeps ClioWorks ids");

test.finish();
