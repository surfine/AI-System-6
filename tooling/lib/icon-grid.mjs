// One icon grid for every appearance.
//
// The problem this solves: objects drawn to their own taste end up at different
// optical sizes, and a row of them reads as a jumble even when each icon is
// good on its own. Apple's icon grids answer this by giving every object the
// same live area and then allowing a little more or less for shapes that read
// large or small at equal bounds.
//
// The measure used here is the optical size sqrt(width x height) of the ink
// box, not the raw bounding box: a tall sheet and a wide drive can share an
// optical size while keeping their own proportions. Nothing is stretched — the
// artwork is scaled uniformly about the canvas centre, so proportions are the
// object's own and only its presence in the row is normalised.
//
// The margin is deliberate: the target is under the full canvas so every icon
// keeps its breathing space and nothing collides with a neighbour or with a
// selection frame.

// Per era, in that era's own large canvas. A single number cannot serve every
// shape: matching the optical size of a tall object would push it outside the
// canvas, so the grid gives each shape class its own live dimension, which is
// how icon grids have always handled this.
//
//   square    the largest dimension of a roughly square object
//   portrait  the height of a tall object; its width follows its proportions
//   landscape the width of a wide object
//
// The remainder of the canvas is the margin, and it is the point: every object
// keeps its breathing space, and none can collide with a neighbour.
export const ICON_GRID = Object.freeze({
  // Platinum's reviewed core is authentic 1-bit artwork and is never resampled;
  // this entry serves the generated fallback family, which is vector art and
  // has no pixel grid to protect. The proportions match what the pixel core
  // already occupies in a 32 px cell.
  platinum: { canvas: 128, square: 104, portrait: 114, landscape: 114 },
  aqua: { canvas: 128, square: 104, portrait: 114, landscape: 114 },
  "snow-leopard": { canvas: 128, square: 108, portrait: 118, landscape: 118 },
  yosemite: { canvas: 128, square: 104, portrait: 114, landscape: 114 },
  "liquid-glass": { canvas: 128, square: 110, portrait: 118, landscape: 118 },
});

// Shapes that read larger or smaller than their bounds. An open wire basket
// reads small, a bright sheet of paper reads large. These are optical
// corrections so the row looks even, which raw numbers alone cannot deliver.
export const OPTICAL_ALLOWANCE = Object.freeze({
  trash: 1.03,
  searcher: 1.02,
  reviewDesk: 1.02,
  daHandler: 1.02,
  document: 0.95,
  teachText: 0.97,
  folder: 0.98,
});

export function shapeClass(box) {
  const ratio = box.width / box.height;
  if (ratio > 1.15) return "landscape";
  if (ratio < 0.87) return "portrait";
  return "square";
}

export function gridTarget(theme, id, box) {
  const grid = ICON_GRID[theme];
  if (!grid) throw new Error(`icon-grid: no grid for ${theme}`);
  return grid[shapeClass(box)] * (OPTICAL_ALLOWANCE[id] || 1);
}

// Measure the ink box. Faint shadow is ignored on purpose: a soft contact
// shadow is part of the picture but not part of the object's presence, and
// counting it would shrink every object that owns one.
export function inkBox(ctx, size, threshold = 40) {
  const { data } = ctx.getImageData(0, 0, size, size);
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (data[(y * size + x) * 4 + 3] <= threshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// The transform that puts a painted object on the grid: scale it to the target
// optical size, then centre it in the live area. Clamped so a normalisation
// pass can correct a row without redrawing an object at a size its own detail
// was never made for.
export function gridTransform(theme, id, box, unit, { clamp = [0.6, 1.9] } = {}) {
  const grid = ICON_GRID[theme];
  const scaleUnit = unit / grid.canvas;
  const target = gridTarget(theme, id, box) * scaleUnit;
  const fitted = shapeClass(box) === "landscape" ? box.width
    : shapeClass(box) === "portrait" ? box.height
      : Math.max(box.width, box.height);
  let scale = target / fitted;
  scale = Math.min(clamp[1], Math.max(clamp[0], scale));
  // Nothing may leave the canvas, whatever the class says.
  const bound = (grid.canvas - 4) * scaleUnit;
  const longest = Math.max(box.width, box.height) * scale;
  if (longest > bound) scale *= bound / longest;
  const centerX = (box.minX + box.maxX + 1) / 2;
  const centerY = (box.minY + box.maxY + 1) / 2;
  return { scale, dx: unit / 2 - centerX * scale, dy: unit / 2 - centerY * scale, shape: shapeClass(box) };
}
