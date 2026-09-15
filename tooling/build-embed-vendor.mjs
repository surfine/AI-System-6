// Vendors the transformers.js browser build used by the in-browser embedding
// fallback (app/core/embed-in-browser.js).
//
// Source priority:
//   1. node_modules/@huggingface/transformers (the normal path, offline-capable)
//   2. the pinned jsdelivr URL for the same version (fresh checkout fallback)
//
// The output is committed, like every other app/vendor file, so a build only
// needs network when the vendored file is missing or stale.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { desktopRoot, repositoryRoot } from "./lib/paths.mjs";

const VERSION = "4.2.0";
const PACKAGE_PATH = join(
  repositoryRoot,
  "node_modules",
  "@huggingface",
  "transformers",
  "dist",
  "transformers.min.js"
);
const URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${VERSION}/dist/transformers.min.js`;
const OUTPUT_PATH = join(desktopRoot, "app", "vendor", "embed", "transformers.min.js");
const MARKER = "export{Fm as ASTFeatureExtractor";

let source = "";
try {
  source = readFileSync(PACKAGE_PATH, "utf8");
} catch {
  console.log(`[embed-vendor] ${PACKAGE_PATH} not found; fetching v${VERSION} from jsdelivr`);
  const response = await fetch(URL);
  if (!response.ok) {
    throw new Error(`[embed-vendor] could not fetch transformers.js v${VERSION}: HTTP ${response.status}`);
  }
  source = await response.text();
}

if (!source.includes(MARKER) || !source.includes("pipeline")) {
  throw new Error("[embed-vendor] fetched transformers.min.js failed its shape check (missing pipeline export)");
}

const output = [
  `/*! @huggingface/transformers v${VERSION} | Apache-2.0 | https://github.com/huggingface/transformers.js */`,
  "/* Vendored by tooling/build-embed-vendor.mjs. Source of truth: the npm package above; do not edit by hand. */",
  source.replace(/^\/\/!.*\n?/u, ""),
  "",
].join("\n");

mkdirSync(join(desktopRoot, "app", "vendor", "embed"), { recursive: true });
writeFileSync(OUTPUT_PATH, output, "utf8");
console.log(`[embed-vendor] wrote ${OUTPUT_PATH} (${output.length} bytes)`);
