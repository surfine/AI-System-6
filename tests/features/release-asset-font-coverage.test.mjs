// Two halves of one defect: a font a packaged stylesheet loads has to be in
// the packaging manifest, and a font URL has to carry the build stamp.
//
// Cover Glass's typeface was declared in its own lazy stylesheet and offered in
// its Font menu as bundled, while the manifest's font line carried only
// *.woff2 — the face is an .otf, so the packaged app drew a fallback and said
// it was using the bundled font. The cache-bust list missed the same extension,
// so that URL could not move.
//
// The gate's logic is exercised with patterns of this test's own, so the
// contract holds wherever the tests run — including the public snapshot, where
// package.json's macPackagedAssets section is deliberately not published. The
// assertions that read the real manifest run only where it exists.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";
import { fontCoverageReport, packagedAssetSet } from "../../tooling/lib/font-asset-coverage.mjs";
import { stampCssAssetUrls } from "../../tooling/lib/css-asset-stamp.mjs";

const test = createFeatureTest("release-asset-font-coverage");

const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const patterns = manifest.macPackagedAssets?.assets || [];

// The gate works: with every font kind the sheets need, nothing is refused;
// without the otf pattern, exactly the Cover Glass face is named.
const fixturePatterns = [
  "apps/desktop/assets/fonts/**/*.woff2",
  "apps/desktop/assets/fonts/**/*.otf",
  "system.css-reference/fonts/*.woff",
  "system.css-reference/fonts/*.woff2",
];
const covered = fontCoverageReport({ repoRoot: root, patterns: fixturePatterns });
test.assert(covered.fonts.length >= 8, "every packaged stylesheet's font references are read as files, not as text");
test.assert(
  covered.fonts.includes("apps/desktop/styles.liquid-cover.css -> apps/desktop/assets/fonts/macintosh-skeletal-filled/MacintoshSkeletalFilled.otf"),
  "the Cover Glass typeface is seen as a packaged stylesheet's font"
);
test.assert(covered.failures.length === 0, "fonts the stylesheets load are all matched once the manifest names their kinds");

const withoutOtf = fontCoverageReport({ repoRoot: root, patterns: fixturePatterns.filter((pattern) => !pattern.endsWith(".otf")) });
test.assert(
  withoutOtf.failures.length === 1 && withoutOtf.failures[0].endsWith("MacintoshSkeletalFilled.otf"),
  "a manifest without the otf pattern is refused, naming the font that would have been missing"
);

// Where the manifest is published, it has to cover what the sheets load and
// carry each shipped font's licence and provenance beside it.
if (!patterns.length) {
  test.assert(true, "package.json publishes no macPackagedAssets here (the public snapshot), so the manifest assertions belong to the repository");
} else {
  const real = fontCoverageReport({ repoRoot: root, patterns });
  test.assert(real.failures.length === 0, "every font a packaged stylesheet loads is shipped by the packaging manifest");
  const packaged = packagedAssetSet({ repoRoot: root, patterns });
  for (const notice of [
    "apps/desktop/assets/fonts/macintosh-skeletal-filled/LICENSE",
    "apps/desktop/assets/fonts/macintosh-skeletal-filled/baselines.json",
    "apps/desktop/assets/fonts/barlow-condensed/OFL.txt",
    "apps/desktop/assets/fonts/platinum/OFL.txt",
    "apps/desktop/assets/fonts/smiley-sans/LICENSE.txt",
  ]) {
    test.assert(packaged.has(notice), `a shipped font's licence or provenance file ships with it: ${notice}`);
  }
}

test.assert(
  stampCssAssetUrls('@font-face{src:url("../assets/fonts/macintosh-skeletal-filled/MacintoshSkeletalFilled.otf") format("opentype")}', "20260101.1")
    .includes('MacintoshSkeletalFilled.otf?v=20260101.1'),
  "an .otf a stylesheet loads is stamped with the build like every other asset"
);
test.assert(
  stampCssAssetUrls('url("./assets/fonts/platinum/Asap-Variable.woff2?v=20260101.1")', "20260102.2")
    .includes("Asap-Variable.woff2?v=20260101.1"),
  "an already stamped asset URL is left alone rather than stamped twice"
);
test.assert(
  read("app/features/liquid-cover.js").includes('"Macintosh Skeletal Filled", sans-serif'),
  "Cover Glass still offers the typeface the manifest now ships"
);

test.finish();
