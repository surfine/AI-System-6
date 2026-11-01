// Give one fidelity specimen the backdrop its reference was captured on.
//
// Theme Lab's control specimens now sit inside a tab sheet. Aqua's translucent
// controls composite against whatever is behind them, so a specimen cropped
// from a Jaguar dialog is measured against a sheet it never stood on. The fix
// is to paint the specimen's own group with the reference's own backdrop,
// sampled from the reference tile, so the capture context matches the source.
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "canvas";

const [, , theme, specimenId, groupSelector = ".theme-lab-controls"] = process.argv;
if (!theme || !specimenId) {
  console.error("Usage: node normalize-backdrop.mjs <theme> <specimenId> [groupSelector]");
  process.exit(1);
}

const tile = `internal/evidence/drafts/theme-lab-fidelity/${theme}/tiles/${specimenId}-reference.png`;
const image = await loadImage(tile);
const canvas = createCanvas(image.width, image.height);
const context = canvas.getContext("2d");
context.drawImage(image, 0, 0);

function pixel(x, y) {
  return [...context.getImageData(x, y, 1, 1).data].slice(0, 3);
}

function rank(samples) {
  const tally = new Map();
  for (const rgb of samples) tally.set(rgb.join(), (tally.get(rgb.join()) || 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1]);
}

const corners = [
  [0, 0],
  [image.width - 1, 0],
  [0, image.height - 1],
  [image.width - 1, image.height - 1],
];
const samples = corners.map(([x, y]) => pixel(x, y));
// A reference can straddle two surfaces — a list row above a dialog body, say.
// The backdrop is then the colour most of the corners agree on. Corners are the
// first sample because a tight crop puts the control's own outline on the rest
// of the border ring, so the ring alone would report the control, not the wall.
let ranked = rank(samples);
let note = "";
if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
  // Four corners are too few to break a tie, and a striped era backdrop
  // (Aqua's pinstripe) ties by construction: its period puts one stripe on the
  // top corners and another on the bottom. Widen the sample to the whole border
  // ring and take the tone that covers most of it.
  const ring = [];
  for (let x = 0; x < image.width; x += 1) ring.push(pixel(x, 0), pixel(x, image.height - 1));
  for (let y = 0; y < image.height; y += 1) ring.push(pixel(0, y), pixel(image.width - 1, y));
  const ringRanked = rank(ring);
  if (ringRanked.length > 1 && ringRanked[0][1] === ringRanked[1][1]) {
    console.error(`${specimenId}: the reference border splits evenly (${JSON.stringify(samples)}); pick the backdrop by hand.`);
    process.exit(1);
  }
  ranked = ringRanked;
  note = `corners split ${JSON.stringify(samples)}; widened to the border ring`;
} else if (ranked.length > 1) {
  note = "corners disagree; using the majority";
}
const backdrop = `rgb(${ranked[0][0].split(",").join(", ")})`;
if (note) console.log(`${specimenId}: ${note} ${backdrop}`);

const manifestPath = `tests/visual/theme-lab-fidelity/${theme}.json`;
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const specimen = manifest.specimens.find((entry) => entry.id === specimenId);
if (!specimen) {
  console.error(`${specimenId} is not in ${manifestPath}`);
  process.exit(1);
}

specimen.current.setup = specimen.current.setup || [];
const existing = specimen.current.setup.findIndex((step) => step.selector === groupSelector && step.style?.background);
const step = { selector: groupSelector, style: { background: backdrop, backgroundImage: "none" } };
if (existing >= 0) specimen.current.setup[existing] = step;
else specimen.current.setup.unshift(step);

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${specimenId}: ${groupSelector} painted ${backdrop}`);
