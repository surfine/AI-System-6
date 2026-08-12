import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "canvas";
import { ICON_IDS } from "./lib/icon-family-inventory.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = join(root, "internal/evidence/drafts/era-icons/imagegen-redraw");
const rawRoot = join(workRoot, "raw");
const processedRoot = join(workRoot, "processed");
const previewRoot = join(workRoot, "previews");
const themes = ["classic", "platinum"];

function colorDistance(r, g, b, key) {
  return Math.hypot(r - key[0], g - key[1], b - key[2]);
}

function cornerKey(data, width, height) {
  const points = [[1, 1], [width - 2, 1], [1, height - 2], [width - 2, height - 2]];
  return points.reduce((sum, [x, y]) => {
    const offset = (y * width + x) * 4;
    sum[0] += data[offset];
    sum[1] += data[offset + 1];
    sum[2] += data[offset + 2];
    return sum;
  }, [0, 0, 0]).map((value) => value / points.length);
}

async function removeKey(path) {
  const image = await loadImage(path);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height);
  const key = cornerKey(pixels.data, image.width, image.height);
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const distance = colorDistance(pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2], key);
      const alpha = distance <= 38 ? 0 : distance >= 115 ? 255 : Math.round(((distance - 38) / 77) * 255);
      pixels.data[offset + 3] = alpha;
      if (alpha > 40) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) throw new Error(`${path}: chroma removal found no subject`);
  context.putImageData(pixels, 0, 0);
  const padding = Math.max(2, Math.round(Math.max(maxX - minX, maxY - minY) * 0.01));
  return {
    canvas,
    crop: {
      x: Math.max(0, minX - padding),
      y: Math.max(0, minY - padding),
      width: Math.min(image.width - Math.max(0, minX - padding), maxX - minX + 1 + padding * 2),
      height: Math.min(image.height - Math.max(0, minY - padding), maxY - minY + 1 + padding * 2),
    },
  };
}

const platinumPalette = [
  [36, 36, 43], [59, 59, 68], [85, 85, 95], [133, 133, 144],
  [185, 186, 194], [222, 222, 227], [247, 247, 250], [255, 255, 255],
  [78, 77, 128], [109, 106, 171], [170, 166, 232], [203, 200, 250], [229, 226, 255],
  [89, 118, 191], [49, 79, 147], [209, 75, 69], [54, 168, 94], [241, 207, 85],
];

function nearestColor(r, g, b) {
  let best = platinumPalette[0];
  let bestDistance = Infinity;
  for (const candidate of platinumPalette) {
    const distance = colorDistance(r, g, b, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function renderClassicSize(keyed, size) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  const sourceContext = keyed.canvas.getContext("2d");
  const source = sourceContext.getImageData(0, 0, keyed.canvas.width, keyed.canvas.height).data;
  const margin = size === 16 ? 1 : 2;
  const available = size - margin * 2;
  const scale = Math.min(available / keyed.crop.width, available / keyed.crop.height);
  const width = Math.max(1, Math.round(keyed.crop.width * scale));
  const height = Math.max(1, Math.round(keyed.crop.height * scale));
  const left = Math.floor((size - width) / 2);
  const top = Math.floor((size - height) / 2);
  const output = context.createImageData(size, size);
  for (let targetY = 0; targetY < height; targetY += 1) {
    for (let targetX = 0; targetX < width; targetX += 1) {
      const sourceLeft = Math.floor(keyed.crop.x + (targetX / width) * keyed.crop.width);
      const sourceRight = Math.max(sourceLeft + 1, Math.ceil(keyed.crop.x + ((targetX + 1) / width) * keyed.crop.width));
      const sourceTop = Math.floor(keyed.crop.y + (targetY / height) * keyed.crop.height);
      const sourceBottom = Math.max(sourceTop + 1, Math.ceil(keyed.crop.y + ((targetY + 1) / height) * keyed.crop.height));
      let opaque = 0;
      let black = 0;
      let samples = 0;
      for (let y = sourceTop; y < sourceBottom; y += 1) {
        for (let x = sourceLeft; x < sourceRight; x += 1) {
          const offset = (y * keyed.canvas.width + x) * 4;
          samples += 1;
          if (source[offset + 3] < 48) continue;
          opaque += 1;
          const luminance = source[offset] * 0.2126 + source[offset + 1] * 0.7152 + source[offset + 2] * 0.0722;
          if (luminance < 128) black += 1;
        }
      }
      if (opaque / samples < 0.035) continue;
      const targetOffset = ((top + targetY) * size + left + targetX) * 4;
      const value = black / samples >= (size === 16 ? 0.035 : 0.08) ? 0 : 255;
      output.data[targetOffset] = value;
      output.data[targetOffset + 1] = value;
      output.data[targetOffset + 2] = value;
      output.data[targetOffset + 3] = 255;
    }
  }
  context.putImageData(output, 0, 0);
  return canvas;
}

function renderSize(theme, keyed, size) {
  if (theme === "classic") return renderClassicSize(keyed, size);
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  const margin = size === 16 ? 1 : 2;
  const available = size - margin * 2;
  const scale = Math.min(available / keyed.crop.width, available / keyed.crop.height);
  const width = Math.max(1, Math.round(keyed.crop.width * scale));
  const height = Math.max(1, Math.round(keyed.crop.height * scale));
  const x = Math.floor((size - width) / 2);
  const y = Math.floor((size - height) / 2);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(keyed.canvas, keyed.crop.x, keyed.crop.y, keyed.crop.width, keyed.crop.height, x, y, width, height);
  const imageData = context.getImageData(0, 0, size, size);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = imageData.data[index + 3];
    if (alpha < 48) {
      imageData.data[index + 3] = 0;
      continue;
    }
    const [r, g, b] = nearestColor(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]);
    imageData.data[index] = r;
    imageData.data[index + 1] = g;
    imageData.data[index + 2] = b;
    imageData.data[index + 3] = alpha < 150 ? 128 : 255;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

for (const theme of themes) {
  const rawDir = join(rawRoot, theme);
  const outputDir = join(processedRoot, theme);
  mkdirSync(outputDir, { recursive: true });
  if (!existsSync(rawDir)) continue;
  for (const file of readdirSync(rawDir).filter((name) => name.endsWith(".png"))) {
    const id = file.replace(/\.png$/, "");
    const keyed = await removeKey(join(rawDir, file));
    const outputSizes = theme === "platinum" ? [42, 32, 16] : [32, 16];
    for (const size of outputSizes) {
      writeFileSync(join(outputDir, `${id}-${size}.png`), renderSize(theme, keyed, size).toBuffer("image/png"));
    }
  }
}

mkdirSync(previewRoot, { recursive: true });
const availableIds = ICON_IDS.filter((id) => themes.some((theme) => existsSync(join(processedRoot, theme, `${id}-32.png`))));
const cellWidth = 176;
const cellHeight = 112;
const canvas = createCanvas(cellWidth * 2, 54 + cellHeight * availableIds.length);
const context = canvas.getContext("2d");
context.fillStyle = "#d7d7d7";
context.fillRect(0, 0, canvas.width, canvas.height);
context.fillStyle = "#111";
context.font = "bold 20px sans-serif";
context.fillText("Image Gen redraw — native-size proof", 12, 30);
for (const [row, id] of availableIds.entries()) {
  for (const [column, theme] of themes.entries()) {
    const x = column * cellWidth;
    const y = 54 + row * cellHeight;
    context.fillStyle = row % 2 ? "#f0f0f0" : "#ffffff";
    context.fillRect(x, y, cellWidth, cellHeight);
    const path42 = join(processedRoot, theme, `${id}-42.png`);
    const path32 = join(processedRoot, theme, `${id}-32.png`);
    const path16 = join(processedRoot, theme, `${id}-16.png`);
    if (existsSync(path32)) {
      const image32 = await loadImage(path32);
      const image16 = await loadImage(path16);
      context.imageSmoothingEnabled = false;
      const primary = existsSync(path42) ? await loadImage(path42) : image32;
      context.drawImage(primary, x + 12, y + 12, 64, 64);
      context.drawImage(image16, x + 88, y + 28, 32, 32);
    }
    context.fillStyle = "#222";
    context.font = "12px sans-serif";
    context.fillText(`${theme} / ${id}`, x + 12, y + 94);
  }
}
writeFileSync(join(previewRoot, "native-size-proof.png"), canvas.toBuffer("image/png"));
console.log(`Processed ${availableIds.length} semantic objects; proof -> ${join(previewRoot, "native-size-proof.png")}`);
