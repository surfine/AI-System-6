import { createCanvas } from "canvas";
import { keyHueFringePixels } from "../../tooling/lib/icon-pixel-metrics.mjs";

export function yosemitePaintFringeOutsidePigment(ctx, size) {
  const image = ctx.getImageData(0, 0, size, size);
  const original = new Uint8ClampedArray(image.data);
  const scale = size / 128;
  const opaque = (x, y) => x >= 0 && y >= 0 && x < size && y < size
    && original[(y * size + x) * 4 + 3] >= 240;
  // The inspected RGBA master has 11 intentional purple-pigment samples at
  // x22..43/y69..84, alpha252/253. Exempt only the bounded paint interior;
  // translucent samples and samples touching transparency remain inspected.
  for (let y = Math.ceil(65 * scale); y <= Math.floor(90 * scale); y += 1) {
    for (let x = Math.ceil(18 * scale); x <= Math.floor(48 * scale); x += 1) {
      if (opaque(x, y) && opaque(x - 1, y) && opaque(x + 1, y)
        && opaque(x, y - 1) && opaque(x, y + 1)) image.data[(y * size + x) * 4 + 3] = 0;
    }
  }
  const filtered = createCanvas(size, size).getContext("2d");
  filtered.putImageData(image, 0, 0);
  return keyHueFringePixels(filtered, size);
}
