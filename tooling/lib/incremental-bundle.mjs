// Content-addressed build cache for the expensive app bundle step.
//
// The release pipeline runs `build:app` several times (verify:release,
// verify:ship's own build, each browser gate's rebuild, and the two deploy
// payload builders). The bundle step is the slow part — esbuild minifies
// ~1.7 MB of concatenated classic scripts on every run even when nothing
// changed. This cache makes the bundle step skip when the full input set
// (every source file, the build identity, and the bundler version) is
// byte-identical to the last successful build.
//
// The gate never weakens: the digest covers every file that reaches the
// bundle, so a stale bundle is only possible if a source changes without its
// bytes changing. The cache is written only after a successful build, and
// release identity (source commit env) is part of the key.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repositoryRoot } from "./paths.mjs";

const CACHE_DIR = join(repositoryRoot, "dist", "build-cache");

/**
 * Digest over a deterministic list of absolute input files plus scalar extras
 * (build identity, environment, tool versions). Files are hashed by full
 * content, so mtimes and git state cannot produce a false hit.
 */
export function bundleInputsDigest(inputFiles, extra = []) {
  const hash = createHash("sha256");
  for (const file of inputFiles) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  for (const item of extra) {
    hash.update(String(item));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function bundleCacheHit(key, digest) {
  const cachePath = join(CACHE_DIR, `${key}.hash`);
  return existsSync(cachePath) && readFileSync(cachePath, "utf8") === digest;
}

export function markBundleBuilt(key, digest) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, `${key}.hash`), digest, "utf8");
}
