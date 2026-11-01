#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_VERSION = "7.0.0";
const ORIGINAL_SHA256 = "a973c23ce067bc752c0bf602297eac843098e531ac03f3ea34cdf694326a6d02";
const PATCHED_SHA256 = "f9fbf67f6d4f5fa2c3721339bd5b0e5c2a3ae2ec24ccb5b971ebc593346762d9";

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

export function patchTesseractWorker(root = repositoryRoot) {
  const packageFile = path.join(root, "node_modules", "tesseract.js", "package.json");
  const workerFile = path.join(root, "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js");
  const installedVersion = String(JSON.parse(readFileSync(packageFile, "utf8")).version || "");
  if (installedVersion !== EXPECTED_VERSION) {
    throw new Error(`Unsupported tesseract.js version ${installedVersion || "(missing)"}; expected ${EXPECTED_VERSION}.`);
  }

  const current = readFileSync(workerFile, "utf8");
  const currentHash = sha256(current);
  if (currentHash === PATCHED_SHA256) return "already-patched";
  if (currentHash !== ORIGINAL_SHA256) {
    throw new Error(`tesseract.js worker hash mismatch: ${currentHash}; refusing to patch unknown contents.`);
  }

  const matches = current.match(/require\('\.\.'\)/g) || [];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one tesseract.js worker require('..') target; found ${matches.length}.`);
  }
  const patched = current.replace("require('..')", "require('../index.js')");
  if (sha256(patched) !== PATCHED_SHA256) {
    throw new Error("Tesseract worker patch produced unexpected bytes.");
  }
  writeFileSync(workerFile, patched, "utf8");
  if (sha256(readFileSync(workerFile, "utf8")) !== PATCHED_SHA256) {
    throw new Error("Tesseract worker patch could not be verified after writing.");
  }
  return "patched";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Tesseract worker: ${patchTesseractWorker()}`);
}

export const tesseractWorkerPatchContract = Object.freeze({
  version: EXPECTED_VERSION,
  originalSha256: ORIGINAL_SHA256,
  patchedSha256: PATCHED_SHA256,
});
