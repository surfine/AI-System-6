import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generatedEraCompatibilityManifestReport,
  themeLabPackagedAssetReport,
  themeStandalonePackagedAssets,
} from "./lib/generated-era-runtime-assets.mjs";
import { resolveProjectPath } from "./lib/paths.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const requiredAssets = [
  "app.bundle.js",
  "styles.bundle.css",
  "styles.theme-lab.css",
  "app/vendor/markmap/d3.min.js",
  "app/vendor/markmap/markmap-lib.js",
  "app/vendor/markmap/markmap-view.js",
  "apps/server/assets/ocr/tessdata/eng.traineddata.gz",
  "apps/server/assets/ocr/tessdata/chi_sim.traineddata.gz",
  "apps/server/assets/ocr/tessdata/chi_tra.traineddata.gz",
  "apps/desktop/assets/cursors/system6-watch.png",
  "apps/desktop/assets/themes/snow-leopard/radio-selected.svg",
  "system.css-reference/fonts/ChicagoFLF.woff2",
  "system.css-reference/fonts/ChiKareGo2.woff2",
  "system.css-reference/fonts/monaco.woff2",
];

const missing = [];
const empty = [];
const packaging = [];

for (const asset of requiredAssets) {
  const fullPath = resolveProjectPath(asset);
  if (!existsSync(fullPath)) {
    missing.push(asset);
    continue;
  }
  if (statSync(fullPath).size <= 0) empty.push(asset);
}

const packageInfo = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const packageAssets = new Set(packageInfo.pkg?.assets || []);
for (const report of generatedEraCompatibilityManifestReport(root)) {
  for (const file of report.files) if (file.bytes <= 0) empty.push(file.relativePath);
  console.log(`OK  ${report.eraId} compatibility manifest tier ${report.tier} is complete (${report.files.length} files, ${report.bytes} bytes)`);
  if (process.argv.includes("--list-icon-assets")) {
    for (const file of report.files) console.log(`    ${file.relativePath}`);
  }
}

for (const report of themeLabPackagedAssetReport(root)) {
  if (!packageAssets.has(report.pattern)) packaging.push(`${report.eraId}: pkg.assets is missing complete Theme Lab family ${report.pattern}`);
  const packagedEraIconPatterns = [...packageAssets].filter((entry) => entry.startsWith(`apps/desktop/assets/themes/${report.eraId}/icons/`));
  if (JSON.stringify(packagedEraIconPatterns) !== JSON.stringify([report.pattern])) {
    packaging.push(`${report.eraId}: pkg.assets must contain exactly the complete Theme Lab family, found ${packagedEraIconPatterns.join(", ")}`);
  }
  for (const file of report.files) if (file.bytes <= 0) empty.push(file.relativePath);
  console.log(`OK  ${report.eraId} packaged Theme Lab family is complete (${report.files.length} files, ${report.bytes} bytes)`);
}

for (const file of themeStandalonePackagedAssets(root)) {
  if (!packageAssets.has(file.packagePattern)) packaging.push(`pkg.assets is missing root theme PNG family ${file.packagePattern} required by ${file.packagePath}`);
  if (file.bytes <= 0) empty.push(file.relativePath);
  console.log(`OK  packaged standalone theme asset ${file.packagePath} (${file.bytes} bytes)`);
}

if (!missing.length && !empty.length && !packaging.length) {
  console.log(`OK  release assets present (${requiredAssets.length})`);
  process.exit(0);
}

if (missing.length) {
  console.error("Missing release assets:");
  missing.forEach((asset) => console.error(`- ${asset}`));
}

if (empty.length) {
  console.error("Empty release assets:");
  empty.forEach((asset) => console.error(`- ${asset}`));
}

if (packaging.length) {
  console.error("Invalid packaged icon assets:");
  packaging.forEach((message) => console.error(`- ${message}`));
}

console.error("\nRestore missing generated assets through their owning build, or restore vendored assets from source control before releasing.");
process.exit(1);
