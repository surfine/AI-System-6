// Decode shipped tiers, not just filenames, and verify the state pairs and ledger.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import sharp from "sharp";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dir = join(root, "apps/desktop/assets/themes/big-sur");
const manifest = JSON.parse(readFileSync(join(dir, "big-sur-icon-manifest.json")));
const family = JSON.parse(readFileSync(join(dir, "big-sur-icon-family.json")));
const records = [];
assert.equal(Object.keys(manifest).length, 59);
for (const id of Object.keys(manifest)) {
  assert.equal(manifest[id], `icons/${id}-128.png`);
  for (const size of [16, 32, 64, 128]) {
    const file = `icons/${id}-${size}.png`;
    const bytes = readFileSync(join(dir, file));
    const metadata = await sharp(bytes).metadata();
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(metadata.format, "png", file);
    assert.equal(metadata.width, size, file);
    assert.equal(metadata.height, size, file);
    assert.equal(metadata.space, "srgb", file);
    assert.ok(metadata.icc?.length, `${file}: embedded sRGB profile`);
    assert.ok(metadata.hasAlpha, `${file}: alpha channel`);
    let transparent = 0, opaque = 0;
    for (let i = 3; i < data.length; i += info.channels) {
      if (data[i] === 0) transparent++;
      if (data[i] >= 192) opaque++;
    }
    assert.ok(transparent && opaque, `${file}: visible foreground and transparent margin`);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    assert.equal(sha256, family.icons[id].runtimeSha256[size], `${file}: ledger hash`);
    records.push({ id, size, bytes: bytes.length, sha256, transparentPixels: transparent, foregroundPixels: opaque });
  }
}
for (const [a, b] of [["trash", "trashFull"], ["cloudModel", "cloudModelOff"]]) {
  for (const size of [16, 32, 64, 128]) {
    assert.notEqual(records.find(r => r.id === a && r.size === size).sha256,
      records.find(r => r.id === b && r.size === size).sha256, `${a}/${b}: distinct ${size}px states`);
  }
}
const report = { objects: 59, images: records.length, decoded: true, sRGB: true, alpha: true,
  bytes: records.reduce((sum, r) => sum + r.bytes, 0), records };
writeFileSync(join(root, "internal/evidence/drafts/big-sur-icons/asset-check.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Big Sur: ${report.images} PNGs decoded, sRGB/alpha/dimensions/hashes/state pairs verified; ${report.bytes} bytes.`);
