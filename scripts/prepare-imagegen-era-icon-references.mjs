import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "canvas";
import { ICON_SPECS } from "./lib/icon-family-inventory.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(root, "drafts/era-icons/imagegen-redraw/references");
const nativeDir = join(outputRoot, "classic-native");
const platinumDir = join(outputRoot, "platinum-native");
const continuityDir = join(outputRoot, "continuity");
const resourceTool = join(root, ".claude/skills/system6-ui-review/scripts/system6_resources.py");
const nativeImage = join(root, ".claude/skills/system6-ui-review/assets/System 6.0.8 - System Startup.img");
const classicSource = JSON.parse(readFileSync(join(root, "assets/themes/classic/icons/src/classic-core-standins.json"), "utf8"));

mkdirSync(nativeDir, { recursive: true });
mkdirSync(platinumDir, { recursive: true });
mkdirSync(continuityDir, { recursive: true });

const extracted = new Set();
for (const spec of Object.values(classicSource.icons)) {
  const reference = spec.source32?.nativeReference;
  if (!reference || extracted.has(reference.file)) continue;
  const result = spawnSync("python3", [
    resourceTool,
    "--image",
    nativeImage,
    "file-icons",
    reference.file,
    nativeDir,
    "--prefix",
    reference.prefix,
  ], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  extracted.add(reference.file);
}

for (const file of readdirSync(nativeDir).filter((name) => name.endsWith("-art-32.svg"))) {
  const image = await loadImage(join(nativeDir, file));
  const canvas = createCanvas(512, 512);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 512, 512);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, 512, 512);
  writeFileSync(join(nativeDir, file.replace(/\.svg$/, ".png")), canvas.toBuffer("image/png"));
}

const platinumSource = JSON.parse(readFileSync(join(root, "assets/themes/platinum/icons/src/platinum-core-icons.json"), "utf8"));
const platinumHistoricalRoot = "/private/tmp/macos9-icon-reference/png 64px";
for (const entry of platinumSource.referenceBoard) {
  const historical = join(platinumHistoricalRoot, `${entry.referenceId}.png`);
  copyFileSync(historical, join(platinumDir, `${entry.referenceId}.png`));
  const image = await loadImage(historical);
  const canvas = createCanvas(512, 512);
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, 512, 512);
  writeFileSync(join(platinumDir, `${entry.referenceId}-nearest-512.png`), canvas.toBuffer("image/png"));
}

const ERA_ASSETS = {
  aqua: join(root, "assets/themes/aqua"),
  "snow-leopard": join(root, "assets/themes/snow-leopard"),
  yosemite: join(root, "assets/themes/yosemite"),
};
const manifests = Object.fromEntries(Object.entries(ERA_ASSETS).map(([theme, dir]) => [
  theme,
  JSON.parse(readFileSync(join(dir, `${theme}-icon-family.json`), "utf8")),
]));

async function rasterAsset(theme, id, size = 128) {
  const family = manifests[theme];
  const entry = family.icons[id];
  const file = entry.sizes[String(size)] || entry.sizes[Object.keys(entry.sizes).sort((a, b) => Number(b) - Number(a))[0]];
  return loadImage(join(ERA_ASSETS[theme], file));
}

for (const spec of ICON_SPECS) {
  const canvas = createCanvas(960, 360);
  const context = canvas.getContext("2d");
  context.fillStyle = "#f2f2f2";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111";
  context.font = "bold 28px sans-serif";
  context.fillText(`${spec.id} — semantic continuity only`, 24, 38);
  for (const [index, theme] of Object.keys(ERA_ASSETS).entries()) {
    const x = 24 + index * 312;
    context.fillStyle = "#fff";
    context.fillRect(x, 58, 288, 278);
    context.strokeStyle = "#c8c8c8";
    context.strokeRect(x + 0.5, 58.5, 287, 277);
    const image = await rasterAsset(theme, spec.id);
    context.imageSmoothingEnabled = true;
    context.drawImage(image, x + 64, 88, 160, 160);
    context.fillStyle = "#222";
    context.font = "20px sans-serif";
    context.fillText(theme, x + 16, 316);
  }
  writeFileSync(join(continuityDir, `${spec.id}.png`), canvas.toBuffer("image/png"));
}

console.log(`Prepared native Classic exports and ${ICON_SPECS.length} continuity cards in ${outputRoot}`);
