// Extending a sealed identity (2026-11-04): a release that went out without
// `mac` used to need a new build stamp and a whole second prepare before the
// Mac chain could follow. The extended receipt lives beside the base one (the
// receipt loader checks the canonical DIRECTORY, not the file name), and the
// publisher inherits the base publish state so only the steps the base could
// not run are left to run.
//
// What this contract holds, without a network or a remote:
//   - an extended receipt validates and carries the base's artifacts;
//   - a base artifact that changed on disk is refused by the loader before a
//     single step runs;
//   - a path the base sealed cannot be re-sealed through an extension;
//   - the extended state inherits completed steps and needs the steps only the
//     new target introduces;
//   - a state that does not descend from the base is refused;
//   - the base state and the base receipt are untouched afterwards.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import {
  PUBLISH_STATE_FILE,
  buildReleaseReceipt,
  canonicalReleaseDirectory,
  createPathManifest,
  initializePublishState,
  loadAndValidateReleaseReceipt,
  loadPublishState,
  updatePublishStep,
  updatePublishTarget,
  writeImmutableReceipt,
} from "../../tooling/lib/release-receipt.mjs";

const test = createFeatureTest("release-extend-sealed-identity");
const sandbox = await mkdtemp(path.join(tmpdir(), "ais6-release-extend-"));

async function rejects(action, pattern, message) {
  try {
    await action();
    test.fail(message);
  } catch (error) {
    test.assert(pattern.test(String(error?.message || error)), message);
  }
}

try {
  const version = "9.9.9-beta.1";
  const build = "20261104.1";
  const commit = "a".repeat(40);
  const tree = "b".repeat(40);
  const repositoryRoot = path.join(sandbox, "repo");
  await mkdir(repositoryRoot, { recursive: true });
  await writeFile(path.join(repositoryRoot, "source.txt"), "source bytes\n");
  const input = await createPathManifest(repositoryRoot, "source.txt");

  const releaseDirectory = canonicalReleaseDirectory(repositoryRoot, { version, build, commit });
  await mkdir(path.join(releaseDirectory, "artifacts", "browser"), { recursive: true });
  await writeFile(path.join(releaseDirectory, "artifacts", "browser", "app.bundle.js"), "browser\n");
  const baseArtifact = await createPathManifest(releaseDirectory, "artifacts/browser");

  const base = buildReleaseReceipt({
    createdAt: "2026-11-04T00:00:00.000Z",
    source: { commit, tree, branch: "main", clean: true, submodules: [] },
    release: {
      version,
      build,
      targets: ["github", "web"],
      publicBase: "c".repeat(40),
      acceptances: { newPublicPaths: [], removedPublicPaths: [] },
    },
    environment: { platform: "darwin", arch: "arm64", node: "v24.0.0", npm: "11.0.0" },
    gate: {
      schema: { version: 1, required: ["base"] },
      checks: [{ name: "base", command: "npm run verify:release", exitCode: 0, durationMs: 1 }],
    },
    inputs: [input],
    artifacts: [baseArtifact],
  });
  const baseReceiptPath = await writeImmutableReceipt(releaseDirectory, base);
  const baseReceiptBytes = await readFile(baseReceiptPath, "utf8");
  const baseSha = (await loadAndValidateReleaseReceipt(baseReceiptPath, { repositoryRoot })).receiptSha256;

  // The base published the snapshot and the deploy; the Mac chain could not run.
  await initializePublishState(baseReceiptPath, { betaTag: null });
  await updatePublishTarget(baseReceiptPath, "github", { status: "running" });
  await updatePublishStep(baseReceiptPath, "github", "snapshot", { status: "running" });
  await updatePublishStep(baseReceiptPath, "github", "snapshot", { status: "completed", result: { commit } });
  await updatePublishTarget(baseReceiptPath, "github", { status: "completed" });
  await updatePublishTarget(baseReceiptPath, "web", { status: "running" });
  await updatePublishStep(baseReceiptPath, "web", "deploy", { status: "running" });
  await updatePublishStep(baseReceiptPath, "web", "deploy", { status: "completed", result: { build } });
  await updatePublishTarget(baseReceiptPath, "web", { status: "completed" });
  const baseStateBytes = await readFile(path.join(releaseDirectory, PUBLISH_STATE_FILE), "utf8");

  // --- The extended receipt -------------------------------------------------
  await mkdir(path.join(releaseDirectory, "artifacts", "mac"), { recursive: true });
  await writeFile(path.join(releaseDirectory, "artifacts", "mac", "AI System 6 Beta.zip"), "zip bytes\n");
  const macArtifact = await createPathManifest(releaseDirectory, "artifacts/mac");
  const extended = buildReleaseReceipt({
    createdAt: "2026-11-04T01:00:00.000Z",
    source: { commit, tree, branch: "main", clean: true, submodules: [] },
    release: {
      version,
      build,
      targets: ["github", "mac", "web"],
      publicBase: "c".repeat(40),
      extends: {
        baseReceipt: "release-receipt.json",
        baseReceiptSha256: baseSha,
        baseTargets: ["github", "web"],
        addedTargets: ["mac"],
      },
      acceptances: { newPublicPaths: [], removedPublicPaths: [] },
    },
    environment: { platform: "darwin", arch: "arm64", node: "v24.0.0", npm: "11.0.0" },
    gate: {
      schema: { version: 1, required: ["base"] },
      checks: [{ name: "base", command: "npm run verify:release", exitCode: 0, durationMs: 1 }],
    },
    inputs: [input],
    artifacts: [baseReceiptArtifact(baseArtifact), macArtifact],
  });
  const extendedPath = path.join(releaseDirectory, "release-receipt-extended-1.json");
  await writeFile(extendedPath, `${JSON.stringify(extended, null, 2)}\n`, { flag: "wx" });
  const loadedExtended = await loadAndValidateReleaseReceipt(extendedPath, { repositoryRoot });
  test.assert(loadedExtended.receipt.release.targets.includes("mac"), "an extended receipt validates in the base receipt's own directory");
  test.assert(
    loadedExtended.receipt.artifacts.some((manifest) => manifest.path === "artifacts/browser")
      && loadedExtended.receipt.artifacts.some((manifest) => manifest.path === "artifacts/mac"),
    "the extended receipt carries the base artifacts and its own"
  );

  // --- The base cannot be revised through an extension ----------------------
  await writeFile(path.join(releaseDirectory, "artifacts", "browser", "app.bundle.js"), "rewritten\n");
  await rejects(
    () => loadAndValidateReleaseReceipt(extendedPath, { repositoryRoot }),
    /artifact changed/i,
    "a base artifact that changed after sealing is refused by the loader"
  );
  await writeFile(path.join(releaseDirectory, "artifacts", "browser", "app.bundle.js"), "browser\n");

  // --- The inherited publish state ------------------------------------------
  const inherited = (await loadPublishState(baseReceiptPath)).state;
  const extendedState = await initializePublishState(extendedPath, {
    betaTag: "v9.9.9-beta.2",
    inherited,
  });
  const github = extendedState.state.targets.github;
  const web = extendedState.state.targets.web;
  test.assert(
    github.steps.snapshot.status === "completed" && web.steps.deploy.status === "completed",
    "steps the base completed are inherited as completed, not re-run"
  );
  test.assert(
    github.steps["mac-beta"]?.status === "pending" && web.steps.ota?.status === "pending",
    "the steps only a mac release introduces start pending"
  );
  test.assert(
    github.status === "pending" && web.status === "pending",
    "a target with a pending step is not completed"
  );
  test.assert(
    extendedState.state.receiptSha256s.length === 2
      && extendedState.state.receiptSha256s[0] === baseSha
      && extendedState.state.receiptSha256s[1] === loadedExtended.receiptSha256,
    "the state names the lineage, base first"
  );
  test.assert(
    extendedState.state.targets.github.steps.snapshot.result?.commit === commit,
    "an inherited step keeps the evidence it completed with"
  );

  // The extended state is its own file: the base state is untouched, and the
  // state a receipt-less extension would have shared is gone.
  test.assert(
    await readFile(path.join(releaseDirectory, PUBLISH_STATE_FILE), "utf8") === baseStateBytes,
    "the base publish state is not rewritten"
  );
  test.assert(
    await readFile(path.join(releaseDirectory, "publish-state-extended-1.json"), "utf8") !== "",
    "the extended state lives in its own file"
  );

  // --- A state that does not descend from the base is refused ---------------
  // A second extension of the same base gets its own file, so the lineage
  // check is reached rather than short-circuited by an existing state.
  const secondExtended = buildReleaseReceipt({
    createdAt: "2026-11-04T02:00:00.000Z",
    source: { commit, tree, branch: "main", clean: true, submodules: [] },
    release: {
      version,
      build,
      targets: ["github", "mac", "web"],
      publicBase: "c".repeat(40),
      extends: {
        baseReceipt: "release-receipt.json",
        baseReceiptSha256: baseSha,
        baseTargets: ["github", "web"],
        addedTargets: ["mac"],
      },
      acceptances: { newPublicPaths: [], removedPublicPaths: [] },
    },
    environment: { platform: "darwin", arch: "arm64", node: "v24.0.0", npm: "11.0.0" },
    gate: {
      schema: { version: 1, required: ["base"] },
      checks: [{ name: "base", command: "npm run verify:release", exitCode: 0, durationMs: 1 }],
    },
    inputs: [input],
    artifacts: [baseArtifact, macArtifact],
  });
  const secondPath = path.join(releaseDirectory, "release-receipt-extended-2.json");
  await writeFile(secondPath, `${JSON.stringify(secondExtended, null, 2)}\n`, { flag: "wx" });
  const stranger = { ...inherited, receiptSha256s: ["d".repeat(64)], betaTag: null };
  await rejects(
    () => initializePublishState(secondPath, {
      betaTag: "v9.9.9-beta.3",
      inherited: stranger,
    }),
    /does not descend/i,
    "an inherited state must descend from the receipt it extends"
  );
} finally {
  await rm(sandbox, { recursive: true, force: true });
}

// The manifest of a base artifact, re-used in the extended receipt.
function baseReceiptArtifact(manifest) {
  return manifest;
}

test.finish();
