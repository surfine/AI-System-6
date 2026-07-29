import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("license");
const license = read("LICENSE");

test.assertIncludes(license, "MIT License", "the repository declares the MIT License");
test.assertIncludes(
  license,
  "Copyright (c) 2026 AI System 6 contributors",
  "the MIT notice identifies the project contributors"
);
test.assertIncludes(
  license,
  "The above copyright notice and this permission notice shall be included",
  "the redistribution notice is preserved"
);

for (const path of [
  "package.json",
  "src/package.json",
  "ai-desktop-6-promo/package.json",
  "british-bureaucracy-meme-generator/package.json",
  "endfield-archive/package.json",
]) {
  const manifest = JSON.parse(read(path));
  test.assert(manifest.license === "MIT", `${path} publishes under MIT`);
}

const rootPackage = JSON.parse(read("package.json"));
test.assert(rootPackage.pkg?.assets?.includes("LICENSE"), "packaged desktop builds include the MIT notice");

test.finish();
