// Golden Gate is a runtime correction over the existing Liquid Glass family.
// This contract owns the mask boundary and the 59-object evidence ledger.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ADDED_APP_ICON_IDS } from "../../tooling/lib/added-app-icon-inventory.mjs";
import { ICON_IDS } from "../../tooling/lib/icon-family-inventory.mjs";
import { createFeatureTest, exists, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("liquid-glass-golden-gate-icons");
const family = JSON.parse(read("assets/themes/liquid-glass/liquid-glass-icon-family.json"));
const matrix = JSON.parse(read("internal/evidence/drafts/liquid-glass-golden-gate/golden-gate-icon-mask-matrix.json"));
const sources = JSON.parse(read("internal/evidence/drafts/liquid-glass-golden-gate/golden-gate-official-sources.json"));
const ids = [...ICON_IDS, ...ADDED_APP_ICON_IDS];
const sizes = [128, 64, 32, 16];
const appearances = ["default", "dark", "clear"];
const maskable = new Set(matrix.maskable);
const freeForm = new Set(matrix.freeForm);

function png(relativePath) {
  const bytes = readFileSync(resolveProjectPath(relativePath));
  test.assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${relativePath} is a PNG`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

// One target string across both accepted stages: the Image Gen family build
// and this correction. It names the Beta 1 reference the Finder work cites.
test.assert(family.target === "macOS 27 Golden Gate Beta 1 Liquid Glass", "the family target is Golden Gate Beta 1");
test.assert(family.runtimeDeliverableCount === 708, "59 objects × 4 sizes × 3 appearances is recorded");
test.assert(JSON.stringify(Object.keys(family.icons)) === JSON.stringify(ids), "the family keeps the 56 + 3 canonical order");
test.assert(JSON.stringify(family.runtimeFamily) === JSON.stringify(ids), "the expanded runtime ledger keeps the 56 + 3 canonical order");
test.assert(matrix.counts.runtimeImages === 708, "the mask matrix records all 708 runtime images");
test.assert(matrix.mask.name === "rounded-rect", "the correction uses a named rounded-rectangle mask");
test.assert(matrix.mask.application.includes("runtime-only"), "the mask is applied at runtime");
test.assert(matrix.mask.effects.includes("no baked blur"), "static PNGs do not bake dynamic Liquid Glass effects");
test.assert(matrix.maskable.length === 37 && matrix.freeForm.length === 22, "mask and free-form classes cover all 59 objects");
test.assert(matrix.maskable.every((id) => !matrix.freeForm.includes(id)), "mask classes do not overlap");
test.assert(matrix.core16.length === 16, "the core gate records exactly 16 objects");
test.assert(sources.sources.length === 4 && sources.sources.every(({ url, contentSha256 }) => url.startsWith("https://") && /^[a-f0-9]{64}$/.test(contentSha256)), "official source URLs and fetched hashes are recorded");

for (const id of ids) {
  const entry = family.icons[id];
  test.assert(entry.goldenGate, `${id} records Golden Gate correction metadata`);
  test.assert(entry.goldenGate.nativeEvidence === "pending", `${id} does not claim an unverified native Golden Gate icon`);
  test.assert(entry.goldenGate.runtimeMask === (maskable.has(id) ? "rounded-rect" : "free-form"), `${id} has the expected mask decision`);
  test.assert(entry.goldenGate.maskAppliedAt === (maskable.has(id) ? "runtime-css" : "none"), `${id} records where its mask is applied`);
  for (const size of sizes) for (const appearance of appearances) {
    const relative = `assets/themes/liquid-glass/${entry.appearanceSizes[`${size}-${appearance}`]}`;
    const result = png(relative);
    test.assert(result.width === size && result.height === size, `${id}/${size}-${appearance} has its declared size`);
    test.assert(entry.metrics[`${size}-${appearance}`].sha256 === result.sha256, `${id}/${size}-${appearance} hash is pinned`);
  }
  const variantHashes = appearances.map((appearance) => png(`assets/themes/liquid-glass/${entry.appearanceSizes[`32-${appearance}`]}`).sha256);
  test.assert(new Set(variantHashes).size === 3, `${id} keeps Default, Dark, and Clear independent`);
}

for (const id of ["folder", "document", "hardDisk", "startupDisk", "fileFloppy", "projectDisk", "projectDisc", "trash", "trashFull"]) {
  test.assert(freeForm.has(id), `${id} keeps its free-form silhouette`);
}
const icons = read("app/core/system-icons.js");
const css = read("styles/70-liquid-glass.css");
test.assertIncludes(icons, "liquidGlassRoundedRectIconIds", "runtime owns an explicit Golden Gate mask vocabulary");
test.assertIncludes(icons, "liquid-glass-rounded", "direct SVG redraws retain the runtime mask decision");
test.assertIncludes(css, "body.use-liquid-glass .sys-icon-svg.liquid-glass-rounded", "the mask is scoped to Liquid Glass");
test.assertIncludes(css, "clip-path: inset(0 round 22%)", "the mask has a documented shared radius");
test.assertNotIncludes(css, "body.use-liquid-glass .sys-icon[data-system-icon=\"folder\"]", "free-form objects are not individually boxed");
test.assertNotIncludes(read("apps/desktop/assets/themes/liquid-glass/liquid-glass-icon-family.json"), "tinted", "the family does not add a tinted runtime tier");
for (const file of [
  "internal/evidence/drafts/liquid-glass-golden-gate/golden-gate-core16-board.png",
  "internal/evidence/drafts/liquid-glass-golden-gate/golden-gate-full-board.png",
  "internal/evidence/drafts/liquid-glass-golden-gate/golden-gate-variants-board.png",
  "internal/evidence/drafts/liquid-glass-golden-gate/golden-gate-small-size-board.png",
]) test.assert(exists(file), `${file} exists`);

test.finish();
