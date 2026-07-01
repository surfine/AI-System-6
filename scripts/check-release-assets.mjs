import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const requiredAssets = [
  "app.bundle.js",
  "styles.bundle.css",
  "app/vendor/markmap/d3.min.js",
  "app/vendor/markmap/markmap-lib.js",
  "app/vendor/markmap/markmap-view.js",
  "ocr/tessdata/eng.traineddata.gz",
  "ocr/tessdata/chi_sim.traineddata.gz",
  "ocr/tessdata/chi_tra.traineddata.gz",
  "system.css-reference/cursors/watch.png",
  "system.css-reference/fonts/ChicagoFLF.woff2",
  "system.css-reference/fonts/ChiKareGo2.woff2",
  "system.css-reference/fonts/monaco.woff2",
];

const missing = [];
const empty = [];

for (const asset of requiredAssets) {
  const fullPath = join(root, asset);
  if (!existsSync(fullPath)) {
    missing.push(asset);
    continue;
  }
  if (statSync(fullPath).size <= 0) empty.push(asset);
}

if (!missing.length && !empty.length) {
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

console.error("\nThese assets are intentionally not tracked in git. Restore them from the local asset cache before building a release.");
process.exit(1);
