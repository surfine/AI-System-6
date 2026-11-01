// ClioWorks v4 (V4-09) contract: the Project CD fixed recipe — a release is
// captured against fixed inputs; every selected document's artifact must be
// present, verified, digest-carried and privacy-checked before the receipt
// exists; public receipts carry identity, never private body text; later edits
// make old artifacts stale instead of silently re-packaging them.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v4-release");

function makeContext() {
  const context = { console, setTimeout, clearTimeout, queueMicrotask };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read("app/vendor/clioworks-v3/creator-integration.js"), context, { filename: "creator-integration.js" });
  return context;
}

const run = async () => {
  const context = makeContext();
  const I = context.ClioWorksIntegration;
  test.assert(typeof I.buildRelease === "function", "the vendored release policy is available");

  const mk = vm.runInContext(`({
    documents: [
      { id: "doc:script", scope: "proj", generation: 2, revision: 5, body: { text: "口播正文（私有内容）。" } },
      { id: "doc:slides", scope: "proj", generation: 1, revision: 9, body: { slides: ["页1"] } },
    ],
    artifact: (over) => Object.assign({ path: "deliver/script.docx", documentId: "doc:script", generation: 2, revision: 5,
      status: "verified", sha256: "a".repeat(64), privateContent: false }, over),
  })`, context);
  const documents = mk.documents;
  const artifact = mk.artifact;

  // 1. A review-profile release with fixed inputs.
  const release = I.buildRelease({
    releaseId: "rel-1",
    documents,
    selectedIds: ["doc:script", "doc:slides"],
    artifacts: [artifact(), Object.assign(artifact({ path: "deliver/slides.pptx", documentId: "doc:slides", generation: 1, revision: 9, sha256: "b".repeat(64) }))],
    profile: "review",
    capturedAt: "2026-10-10T12:00:00.000Z",
  });
  test.assert(release.schema === 1 && release.artifacts.length === 2 && release.profile === "review",
    "a review release captures both selected documents' verified artifacts");
  test.assert(JSON.stringify(release).includes("doc:script") && !JSON.stringify(release).includes("口播正文"),
    "the release receipt carries document identity, never the private body text");

  // 2. Privacy: a private artifact cannot ride a public release silently.
  let privacy = "";
  try {
    I.buildRelease({ releaseId: "rel-2", documents, selectedIds: ["doc:script"], artifacts: [artifact({ privateContent: true })], profile: "public", capturedAt: "2026-10-10T12:00:00.000Z" });
  } catch (e) { privacy = e.code; }
  test.assert(privacy === "PRIVATE_CONTENT", "unapproved private content blocks a public release");
  const disclosed = I.buildRelease({ releaseId: "rel-2b", documents, selectedIds: ["doc:script"], artifacts: [artifact({ privateContent: true })], profile: "public", capturedAt: "2026-10-10T12:00:00.000Z", disclosePrivate: true });
  test.assert(disclosed.artifacts.length === 1, "an explicit disclosure decision is recorded, not implied");

  // 3. Verified-only, digest-carried, path-safe artifacts.
  let unverified = "";
  try { I.buildRelease({ releaseId: "rel-3", documents, selectedIds: ["doc:script"], artifacts: [artifact({ status: "generated" })], profile: "archive", capturedAt: "x" }); } catch (e) { unverified = e.code; }
  test.assert(unverified === "UNVERIFIED_ARTIFACT", "an unverified artifact cannot ship");
  let digest = "";
  try { I.buildRelease({ releaseId: "rel-4", documents, selectedIds: ["doc:script"], artifacts: [artifact({ sha256: "zz" })], profile: "archive", capturedAt: "x" }); } catch (e) { digest = e.code; }
  test.assert(digest === "MISSING_DIGEST", "an artifact without an actual-bytes sha256 digest cannot ship");
  let traversal = "";
  try { I.buildRelease({ releaseId: "rel-5", documents, selectedIds: ["doc:script"], artifacts: [artifact({ path: "../escape.docx" })], profile: "archive", capturedAt: "x" }); } catch (e) { traversal = e.code; }
  test.assert(traversal === "ARTIFACT_PATH", "release paths cannot escape the package");
  let extra = "";
  try { I.buildRelease({ releaseId: "rel-6", documents, selectedIds: ["doc:script"], artifacts: [artifact({ secretField: "私有正文" })], profile: "public", capturedAt: "x" }); } catch (e) { extra = e.code; }
  test.assert(extra === "ARTIFACT_METADATA", "public receipts reject extra metadata fields");

  // 4. New edits do not pollute the old package: a document that moved on
  //    makes its old artifact stale — the old receipt cannot be rebuilt.
  context.__documents = documents;
  const movedOn = vm.runInContext(`([
    Object.assign({}, globalThis.__documents[0], { revision: 6, body: { text: "新的正文。" } }),
    globalThis.__documents[1],
  ])`, context);
  let stale = "";
  try { I.buildRelease({ releaseId: "rel-1", documents: movedOn, selectedIds: ["doc:script", "doc:slides"], artifacts: [artifact(), Object.assign(artifact({ path: "deliver/slides.pptx", documentId: "doc:slides", generation: 1, revision: 9, sha256: "b".repeat(64) }))], profile: "review", capturedAt: "2026-10-10T12:00:00.000Z" }); } catch (e) { stale = e.code; }
  test.assert(stale === "STALE_ARTIFACT", "an edited document invalidates its old artifacts instead of re-packaging them (新编辑不污染旧包)");

  // 5. Selection completeness both ways.
  let unselected = "";
  try { I.buildRelease({ releaseId: "rel-7", documents, selectedIds: ["doc:script"], artifacts: [artifact(), Object.assign(artifact({ path: "x.pptx", documentId: "doc:slides", generation: 1, revision: 9, sha256: "b".repeat(64) }))], profile: "archive", capturedAt: "x" }); } catch (e) { unselected = e.code; }
  test.assert(unselected === "UNSELECTED_ARTIFACT", "an artifact of an unselected document cannot ride the release");
  let missing = "";
  try { I.buildRelease({ releaseId: "rel-8", documents, selectedIds: ["doc:script", "doc:slides"], artifacts: [artifact()], profile: "archive", capturedAt: "x" }); } catch (e) { missing = e.code; }
  test.assert(missing === "MISSING_ARTIFACT", "every selected document needs its artifact before publish (所有选中产物就绪才发布)");

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
