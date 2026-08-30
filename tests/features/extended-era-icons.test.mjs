import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createFeatureTest, exists, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("extended-era-icons");
const renderer = read("app/core/system-icons.js");
const extensions = [
  ["lightroom", "lightroom-icon-extension.json", "文字亮室"],
  ["imagePromptStudio", "image-prompt-studio-icon-extension.json", "Image Prompt Studio"],
];

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(resolveProjectPath(path))).digest("hex");
}

for (const [iconId, manifestName, label] of extensions) {
  const manifest = JSON.parse(read(`assets/themes/${manifestName}`));
  test.assert(Object.keys(manifest.eras).length === 6, `${label} records all six appearance eras`);
  test.assertIncludes(renderer, `"${iconId}"`, `${label} participates in the complete-era raster painter`);
  test.assertNotIncludes(renderer, `${iconId}: "`, `${label} no longer borrows another application's modern icon`);
  for (const [era, entry] of Object.entries(manifest.eras)) {
    test.assert(exists(entry.source), `${label} retains its reviewed ${era} source master`);
    test.assert(fileSha256(entry.source) === entry.sourceSha256, `${label} pins the ${era} source hash`);
    for (const asset of Object.values(entry.assets)) {
      const path = `assets/themes/${era}/${asset.file}`;
      test.assert(exists(path), `${label} ships ${era}/${asset.file}`);
      test.assert(fileSha256(path) === asset.sha256, `${label} pins ${era}/${asset.file}`);
    }
  }
}

test.assertIncludes(read("package.json"), '"build:lightroom-era-icons"', "文字亮室 has a reproducible extension builder");
test.assertIncludes(read("package.json"), '"build:image-prompt-studio-era-icons"', "Image Prompt Studio has a reproducible extension builder");

test.finish();
