import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("repository-layout");

function present(relativePath) {
  try {
    lstatSync(join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function readRoot(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

// These were all owners in an earlier flat layout or local scratch locations
// that repeatedly looked like source. Copies and symlinks are equally unsafe:
// either creates two plausible owners and lets future changes drift.
const retiredRootEntries = [
  ".codex-video-work",
  "ai-desktop-6-promo",
  "app",
  "app.js",
  "app.bundle.js",
  "assets",
  "british-bureaucracy-meme-generator",
  "codex-snapshots",
  "data",
  "deploy",
  "endfield-archive",
  "endfield-terminal.html",
  "eng.traineddata",
  "index.html",
  "liquid-glass-studio",
  "native",
  "ocr",
  "private",
  "scripts",
  "server",
  "shell",
  "src",
  "styles",
  "styles.bundle.css",
  "styles.css",
  "styles.theme-lab.css",
  "system.css-web-reference",
];

for (const relativePath of retiredRootEntries) {
  test.assert(!present(relativePath), `retired root path stays absent: ${relativePath}`);
}

for (const relativePath of [
  "apps/desktop/index.html",
  "apps/desktop/app.js",
  "apps/desktop/styles.css",
  "apps/desktop/app",
  "apps/desktop/assets",
  "apps/desktop/data",
  "apps/desktop/styles",
  "apps/server/server.js",
  "apps/server/assets/ocr/tessdata/eng.traineddata.gz",
  "apps/server/assets/ocr/tessdata/chi_sim.traineddata.gz",
  "apps/server/assets/ocr/tessdata/chi_tra.traineddata.gz",
  "platform/macos/shell",
  "site",
  "tests",
  "tooling",
]) {
  test.assert(present(relativePath), `canonical owner exists: ${relativePath}`);
}

const gitignore = readRoot(".gitignore");
for (const generatedPath of [
  "/apps/desktop/app.bundle.js",
  "/apps/desktop/styles.bundle.css",
  "/apps/desktop/styles.theme-lab.css",
]) {
  test.assertIncludes(gitignore, generatedPath, `generated ignore is anchored: ${generatedPath}`);
}
for (const retiredIgnore of [
  "\nocr/",
  "\napp.bundle.js",
  "\nstyles.bundle.css",
  "\nassets/liquid-cover/test-shot.jpg",
]) {
  test.assertNotIncludes(gitignore, retiredIgnore, `old root ignore cannot hide migration debt: ${retiredIgnore.trim()}`);
}

const quickGate = readRoot("tooling/verify-quick.mjs");
test.assertIncludes(
  quickGate,
  'commandArgs: ["--prefix", "apps/server", "run", "typecheck"]',
  "quick server verification resolves the canonical server package"
);
test.assertNotIncludes(quickGate, '["--prefix", "src"', "quick verification cannot revive src/");

const ocrImporter = readRoot("apps/server/server/importers/image-ocr.js");
test.assertIncludes(
  ocrImporter,
  'path.join(__dirname, "../../assets/ocr/tessdata")',
  "OCR runtime data is owned by apps/server"
);
test.assertNotIncludes(ocrImporter, '"../../../ocr/tessdata"', "OCR cannot escape to the retired root");

const staticServer = readRoot("apps/server/server/static.js");
test.assertNotIncludes(staticServer, '"ocr/"', "the retired OCR root is not publicly mounted");

// Maintainer-only paths do not ship in the curated public snapshot. When the
// private marker exists, enforce the complete internal ownership contract too.
if (present("CLAUDE.md")) {
  for (const relativePath of [
    "platform/macos/native",
    "platform/web",
    "internal/agents",
    "internal/operations",
  ]) {
    test.assert(present(relativePath), `maintainer owner exists: ${relativePath}`);
  }

  const packageJson = readRoot("package.json");
  test.assertIncludes(
    packageJson,
    '"apps/server/assets/ocr/tessdata/*.traineddata.gz"',
    "native packaging carries OCR from the server boundary"
  );
  test.assertNotIncludes(packageJson, '"ocr/tessdata/*.traineddata.gz"', "packaging cannot revive root OCR");

  const snapshotManifest = readRoot("tooling/public-snapshot-manifest.mjs");
  test.assertNotIncludes(
    snapshotManifest,
    '"ocr/tessdata/',
    "the public snapshot cannot preserve the retired OCR tree"
  );

  const nativeExporter = readRoot("tooling/export-native-resources.mjs");
  test.assertIncludes(
    nativeExporter,
    '"apps/desktop/app/generated/ai-prompt-files.js"',
    "native resource export reads the canonical desktop tree"
  );
  test.assertNotIncludes(
    nativeExporter,
    '"app/generated/ai-prompt-files.js"',
    "native export cannot read from the retired app root"
  );
}

test.finish();
