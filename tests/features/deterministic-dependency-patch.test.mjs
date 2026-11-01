import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createFeatureTest, root as repoRoot } from "../helpers/feature-test-harness.mjs";
import {
  patchTesseractWorker,
  tesseractWorkerPatchContract,
} from "../../tooling/patch-tesseract-worker.mjs";

const test = createFeatureTest("deterministic-dependency-patch");
const temporaryRoot = mkdtempSync(path.join(tmpdir(), "ai-system6-tesseract-patch-"));
const packageRoot = path.join(temporaryRoot, "node_modules", "tesseract.js");
const workerDirectory = path.join(packageRoot, "src", "worker-script", "node");

try {
  mkdirSync(workerDirectory, { recursive: true });
  copyFileSync(path.join(repoRoot, "node_modules", "tesseract.js", "package.json"), path.join(packageRoot, "package.json"));
  const installedWorker = readFileSync(
    path.join(repoRoot, "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js"),
    "utf8"
  );
  const originalWorker = installedWorker.replace("require('../index.js')", "require('..')");
  const fixtureWorker = path.join(workerDirectory, "index.js");
  writeFileSync(fixtureWorker, originalWorker, "utf8");

  test.assert(patchTesseractWorker(temporaryRoot) === "patched", "the known tesseract.js source is patched deterministically");
  test.assert(patchTesseractWorker(temporaryRoot) === "already-patched", "the dependency patch is idempotent");

  writeFileSync(fixtureWorker, `${readFileSync(fixtureWorker, "utf8")}\n// unexpected drift\n`, "utf8");
  let driftRejected = false;
  try {
    patchTesseractWorker(temporaryRoot);
  } catch (error) {
    driftRejected = /hash mismatch/.test(String(error?.message || error));
  }
  test.assert(driftRejected, "unknown dependency contents fail instead of being silently ignored");
  test.assert(tesseractWorkerPatchContract.version === "7.0.0", "the patch pins the supported dependency version");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

test.finish();
