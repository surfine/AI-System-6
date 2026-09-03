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
  "styles.draft-desk.css",
  "styles.control-strip.css",
  "styles.micropolis.css",
  "app/vendor/micropolis/micropolis-engine.js",
  "app/vendor/micropolis/tiles.png",
  "app/vendor/micropolis/tilessnow.png",
  "app/vendor/micropolis/sprites.png",
  "app/vendor/micropolis/LICENSE",
  "app/vendor/micropolis/COPYING",
  "app/vendor/micropolis/NOTICE.md",
  "styles.openttd.css",
  "styles.bonsai.css",
  "styles.cmf-studio.css",
  "styles.endfield-terminal.css",
  "styles.bureaucracy-meme.css",
  "styles.time-machine.css",
  "styles.clio-chart.css",
  "styles.clio-paint.css",
  "styles.soundscape.css",
  "styles.liquid-cover.css",
  "styles.image-prompt-studio.css",
  "app/features/bonsai-save-worker.js",
  "app/features/bonsai-sc2-codec.js",
  "app/features/bonsai-catalog.js",
  "app/features/bonsai-audio.js",
  "app/features/bonsai-renderer-voxel.js",
  "app/features/bonsai-save-worker-manager.js",
  "app/features/bonsai-renderer-canvas.js",
  "app/generated/bonsai-atlas.js",
  "assets/bonsai/atlas-north.png",
  "assets/bonsai/atlas-east.png",
  "assets/bonsai/atlas-south.png",
  "assets/bonsai/atlas-west.png",
  "assets/bonsai/atlas-metadata.json",
  "assets/bonsai/provenance.json",
  "assets/openttd/index.html",
  "assets/openttd/shell.js",
  "assets/openttd/openttd.js",
  "assets/openttd/openttd.wasm",
  "assets/openttd/openttd.data",
  "assets/doom/index.html",
  "assets/doom/shell.js",
  "assets/doom/wad-picker.js",
  "assets/doom/touch-controls.js",
  "assets/doom/touch-controls.css",
  "assets/doom/chocolate-doom.js",
  "assets/doom/chocolate-doom.wasm",
  "assets/doom/ENGINE-COPYING.txt",
  "assets/doom/SOURCE.txt",
  "assets/doom/chocolate-doom-3.1.1-source.tar.gz",
  "assets/doom/chocolate-doom-3.1.1-ai-system6.patch",
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
const packageAssets = new Set(packageInfo.macPackagedAssets?.assets || []);
for (const pattern of [
  "apps/desktop/styles.micropolis.css",
  "apps/desktop/styles.openttd.css",
  "apps/desktop/styles.bonsai.css",
  "apps/desktop/styles.cmf-studio.css",
  "apps/desktop/styles.endfield-terminal.css",
  "apps/desktop/styles.bureaucracy-meme.css",
  "apps/desktop/styles.time-machine.css",
  "apps/desktop/styles.clio-chart.css",
  "apps/desktop/styles.clio-paint.css",
  "apps/desktop/styles.soundscape.css",
  "apps/desktop/styles.liquid-cover.css",
  "apps/desktop/styles.image-prompt-studio.css",
  "apps/desktop/app/**/*.js",
  "apps/desktop/assets/bonsai/**/*",
  "apps/desktop/app/vendor/micropolis/**/*",
  "apps/desktop/assets/openttd/**/*",
  "apps/desktop/assets/doom/**/*",
]) {
  if (!packageAssets.has(pattern)) packaging.push(`macPackagedAssets is missing game payload ${pattern}`);
}
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
