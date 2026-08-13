import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "canvas";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(
  root,
  "apps/desktop/assets/themes/classic/icons/src/classic-core-standins.json",
);
const continuityPath = join(root, "apps/desktop/assets/themes/icon-system-continuity.json");
const outputDir = join(root, "apps/desktop/assets/themes/classic/icons");
const draftDir = join(root, "internal/evidence/drafts/era-icons");
const resourceScript = join(
  root,
  ".claude/skills/system6-ui-review/scripts/system6_resources.py",
);

const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const continuity = JSON.parse(readFileSync(continuityPath, "utf8"));
const coreIds = continuity.coreBatches.classic;

if (JSON.stringify(Object.keys(source.icons)) !== JSON.stringify(coreIds)) {
  throw new Error(
    "Classic source order must exactly match the continuity ledger's core batch.",
  );
}

const nativeImagePath = join(root, source.nativeImage.path);
const nativeImageHash = createHash("sha256")
  .update(readFileSync(nativeImagePath))
  .digest("hex");
if (nativeImageHash !== source.nativeImage.sha256) {
  throw new Error(
    `System 6 image hash changed: expected ${source.nativeImage.sha256}, got ${nativeImageHash}`,
  );
}

mkdirSync(outputDir, { recursive: true });
mkdirSync(draftDir, { recursive: true });

function rowsToPath(rows, size, label) {
  const commands = [];
  const occupied = new Set();
  for (const [rowText, runs] of Object.entries(rows || {})) {
    const y = Number(rowText);
    if (!Number.isInteger(y) || y < 0 || y >= size) {
      throw new Error(`${label}: invalid row ${rowText}`);
    }
    for (const run of runs) {
      if (!Array.isArray(run) || run.length !== 2) {
        throw new Error(`${label}: row ${y} has a malformed run`);
      }
      const [start, end] = run.map(Number);
      if (
        !Number.isInteger(start)
        || !Number.isInteger(end)
        || start < 0
        || end < start
        || end >= size
      ) {
        throw new Error(`${label}: row ${y} has an invalid ${start}..${end} run`);
      }
      for (let x = start; x <= end; x += 1) {
        const key = `${x},${y}`;
        if (occupied.has(key)) throw new Error(`${label}: overlapping pixel ${key}`);
        occupied.add(key);
      }
      const width = end - start + 1;
      commands.push(`M${start} ${y}h${width}v1h-${width}z`);
    }
  }
  return commands.join("");
}

function operationsToPath(operations, size, label) {
  const occupied = new Set();
  const addPixel = (x, y) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) {
      throw new Error(`${label}: pixel ${x},${y} is outside the ${size} px canvas`);
    }
    occupied.add(`${x},${y}`);
  };
  const addRect = (x, y, width, height, outline = false) => {
    if (![x, y, width, height].every(Number.isInteger) || width < 1 || height < 1) {
      throw new Error(`${label}: malformed rectangle ${x},${y},${width},${height}`);
    }
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) {
        if (!outline || row === y || row === y + height - 1 || column === x || column === x + width - 1) {
          addPixel(column, row);
        }
      }
    }
  };
  const addLine = (startX, startY, endX, endY) => {
    let x = startX;
    let y = startY;
    const deltaX = Math.abs(endX - startX);
    const deltaY = -Math.abs(endY - startY);
    const stepX = startX < endX ? 1 : -1;
    const stepY = startY < endY ? 1 : -1;
    let error = deltaX + deltaY;
    while (true) {
      addPixel(x, y);
      if (x === endX && y === endY) break;
      const doubled = 2 * error;
      if (doubled >= deltaY) {
        error += deltaY;
        x += stepX;
      }
      if (doubled <= deltaX) {
        error += deltaX;
        y += stepY;
      }
    }
  };
  for (const operation of operations || []) {
    if (!Array.isArray(operation) || typeof operation[0] !== "string") {
      throw new Error(`${label}: malformed drawing operation`);
    }
    const [kind, ...values] = operation;
    if (kind === "rect") addRect(...values, false);
    else if (kind === "outlineRect") addRect(...values, true);
    else if (kind === "line" && values.length === 4) addLine(...values);
    else throw new Error(`${label}: unsupported drawing operation ${kind}`);
  }
  const rows = new Map();
  for (const key of occupied) {
    const [x, y] = key.split(",").map(Number);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(x);
  }
  const commands = [];
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    const columns = rows.get(y).sort((a, b) => a - b);
    let start = columns[0];
    let previous = columns[0];
    const flush = () => {
      const width = previous - start + 1;
      commands.push(`M${start} ${y}h${width}v1h-${width}z`);
    };
    for (const column of columns.slice(1)) {
      if (column !== previous + 1) {
        flush();
        start = column;
      }
      previous = column;
    }
    if (columns.length) flush();
  }
  return commands.join("");
}

function pathFromSvg(svg, label) {
  const match = svg.match(/<path[^>]*\sd="([^"]*)"/);
  if (!match) throw new Error(`${label}: exported SVG has no path`);
  return match[1];
}

function assetSvg(size, artwork, mask, selected = false) {
  const paper = selected ? "#000000" : "#ffffff";
  const ink = selected ? "#ffffff" : "#000000";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    `  <path fill="${paper}" d="${mask}"/>`,
    `  <path fill="${ink}" d="${artwork}"/>`,
    "</svg>",
    "",
  ].join("\n");
}

function maskSvg(size, mask) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    `  <path fill="#000000" d="${mask}"/>`,
    "</svg>",
    "",
  ].join("\n");
}

function exportedName(spec, role, size) {
  if (spec.type === "ICN#") {
    return `${spec.prefix}-icn-${spec.id}-${role}-${size}.svg`;
  }
  if (spec.type === "SICN") {
    const index = role === "art" ? spec.artIndex : spec.maskIndex;
    return `${spec.prefix}-sicn-${spec.id}-${index}-${size}.svg`;
  }
  throw new Error(`Unsupported native icon type: ${spec.type}`);
}

function exportNativeFile(tempDir, spec) {
  const result = spawnSync(
    "python3",
    [
      resourceScript,
      "--image",
      nativeImagePath,
      "file-icons",
      spec.file,
      tempDir,
      "--prefix",
      spec.prefix,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `Native icon export failed for ${spec.file}:\n${result.stderr || result.stdout}`,
    );
  }
}

function readNativePaths(tempDir, spec, size) {
  const artFile = join(tempDir, exportedName(spec, "art", size));
  const maskFile = join(tempDir, exportedName(spec, "mask", size));
  return {
    artwork: pathFromSvg(readFileSync(artFile, "utf8"), artFile),
    mask: pathFromSvg(readFileSync(maskFile, "utf8"), maskFile),
  };
}

function customPaths(spec, size, label) {
  const buildPath = (value, role) => Array.isArray(value)
    ? operationsToPath(value, size, `${label} ${role}`)
    : rowsToPath(value, size, `${label} ${role}`);
  return {
    artwork: buildPath(spec.art, "artwork"),
    mask: buildPath(spec.mask, "mask"),
  };
}

function pixelDiffCount(first, second) {
  const pixels = new Set([...first, ...second]);
  let count = 0;
  for (const pixel of pixels) {
    if (first.has(pixel) !== second.has(pixel)) count += 1;
  }
  return count;
}

async function rasterizePath(path, size) {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    `<path fill="#000" d="${path}"/>`,
    "</svg>",
  ].join("");
  const image = await loadImage(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  let count = 0;
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  const occupied = new Set();
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;
    const pixel = index / 4;
    const x = pixel % size;
    const y = Math.floor(pixel / size);
    occupied.add(`${x},${y}`);
    count += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    occupied,
    metrics: {
      pixels: count,
      bbox: count ? { minX, minY, maxX, maxY } : null,
    },
  };
}

async function makeContactSheet(iconResults) {
  const rowHeight = 282;
  const canvas = createCanvas(1420, 58 + rowHeight * iconResults.length);
  const context = canvas.getContext("2d");
  context.fillStyle = "#bfbfbf";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000000";
  context.font = "bold 22px sans-serif";
  context.fillText("Classic core icon lab - native replicas, masks, independent 16px hints", 18, 30);
  context.font = "12px sans-serif";
  context.fillText("Normal / selected use the same artwork and separate mask. Zoom columns use nearest-neighbor only.", 18, 49);

  const zoomColumns = [
    [500, 1, "100%"],
    [554, 2, "200%"],
    [646, 4, "400%"],
    [806, 8, "800%"],
  ];
  for (const [x, , label] of zoomColumns) {
    context.font = "bold 12px sans-serif";
    context.fillText(label, x, 52);
  }

  for (let index = 0; index < iconResults.length; index += 1) {
    const icon = iconResults[index];
    const y = 58 + index * rowHeight;
    context.fillStyle = index % 2 ? "#dedede" : "#ececec";
    context.fillRect(0, y, canvas.width, rowHeight - 2);
    context.fillStyle = "#000000";
    context.font = "bold 16px sans-serif";
    context.fillText(icon.label, 16, y + 28);
    context.font = "12px monospace";
    context.fillText(icon.id, 16, y + 48);
    context.font = "11px sans-serif";
    context.fillText(icon.sourceKind, 16, y + 67);

    const largeNormal = await loadImage(
      `data:image/svg+xml;base64,${Buffer.from(assetSvg(32, icon.large.artwork, icon.large.mask)).toString("base64")}`,
    );
    const largeSelected = await loadImage(
      `data:image/svg+xml;base64,${Buffer.from(assetSvg(32, icon.large.artwork, icon.large.mask, true)).toString("base64")}`,
    );
    const smallNormal = await loadImage(
      `data:image/svg+xml;base64,${Buffer.from(assetSvg(16, icon.small.artwork, icon.small.mask)).toString("base64")}`,
    );
    const smallSelected = await loadImage(
      `data:image/svg+xml;base64,${Buffer.from(assetSvg(16, icon.small.artwork, icon.small.mask, true)).toString("base64")}`,
    );

    context.imageSmoothingEnabled = false;
    const stateTiles = [
      [210, largeNormal, 32, "32 normal"],
      [286, largeSelected, 32, "32 selected"],
      [366, smallNormal, 32, "16 normal"],
      [442, smallSelected, 32, "16 selected"],
    ];
    for (const [x, image, drawSize, label] of stateTiles) {
      context.fillStyle = "#ffffff";
      context.fillRect(x - 5, y + 18, 42, 42);
      context.drawImage(image, x, y + 23, drawSize, drawSize);
      context.fillStyle = "#000000";
      context.font = "10px sans-serif";
      context.fillText(label, x - 4, y + 77);
    }

    for (const [x, scale] of zoomColumns) {
      const drawSize = 32 * scale;
      context.fillStyle = "#ffffff";
      context.fillRect(x - 2, y + 16, drawSize + 4, drawSize + 4);
      context.drawImage(largeNormal, x, y + 18, drawSize, drawSize);
    }

    context.fillStyle = "#000000";
    context.font = "11px monospace";
    context.fillText(
      `32 bbox ${icon.metrics[32].art.bbox.minX},${icon.metrics[32].art.bbox.minY}-${icon.metrics[32].art.bbox.maxX},${icon.metrics[32].art.bbox.maxY}`,
      1082,
      y + 32,
    );
    context.fillText(
      `black ${icon.metrics[32].art.pixels} / mask ${icon.metrics[32].mask.pixels}`,
      1082,
      y + 50,
    );
    context.fillText(
      `16 black ${icon.metrics[16].art.pixels} / mask ${icon.metrics[16].mask.pixels}`,
      1082,
      y + 68,
    );
  }
  writeFileSync(
    join(draftDir, "classic-core-contact-sheet.png"),
    canvas.toBuffer("image/png"),
  );
}

async function makeReferenceBoard(iconResults) {
  const direct = iconResults.filter((icon) => icon.nativeEvidence);
  const columns = 4;
  const cellWidth = 420;
  const cellHeight = 330;
  const rows = Math.ceil(direct.length / columns);
  const canvas = createCanvas(columns * cellWidth, 52 + rows * cellHeight);
  const context = canvas.getContext("2d");
  context.fillStyle = "#c8c8c8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000000";
  context.font = "bold 22px sans-serif";
  context.fillText("Classic evidence board - native reference vs shipped replica", 18, 30);
  context.imageSmoothingEnabled = false;
  for (let index = 0; index < direct.length; index += 1) {
    const icon = direct[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth;
    const y = 52 + row * cellHeight;
    const referenceArt = await loadImage(
      `data:image/svg+xml;base64,${Buffer.from(maskSvg(32, icon.nativeEvidence.artwork)).toString("base64")}`,
    );
    const standInArt = await loadImage(
      `data:image/svg+xml;base64,${Buffer.from(maskSvg(32, icon.large.artwork)).toString("base64")}`,
    );
    const standInMask = await loadImage(
      `data:image/svg+xml;base64,${Buffer.from(maskSvg(32, icon.large.mask)).toString("base64")}`,
    );
    context.fillStyle = "#eeeeee";
    context.fillRect(x + 8, y + 8, cellWidth - 16, cellHeight - 16);
    context.fillStyle = "#000000";
    context.font = "bold 15px sans-serif";
    context.fillText(icon.label, x + 18, y + 30);
    context.font = "11px monospace";
    context.fillText(icon.nativeLabel, x + 18, y + 48);
    context.fillStyle = "#ffffff";
    context.fillRect(x + 18, y + 60, 112, 112);
    context.fillRect(x + 150, y + 60, 112, 112);
    context.fillRect(x + 282, y + 60, 112, 112);
    context.drawImage(referenceArt, x + 18, y + 60, 112, 112);
    context.drawImage(standInArt, x + 150, y + 60, 112, 112);
    context.drawImage(standInMask, x + 282, y + 60, 112, 112);
    context.fillStyle = "#000000";
    context.font = "11px sans-serif";
    context.fillText("native evidence", x + 18, y + 190);
    context.fillText("runtime replica", x + 150, y + 190);
    context.fillText("runtime mask", x + 282, y + 190);
    context.font = "10px monospace";
    context.fillText(`${icon.replica32 ? "required exact" : "semantic adaptation"} diff: ${icon.referenceDiffPixels} pixels`, x + 18, y + 220);
    context.fillText(icon.replica32
      ? "native one-bit runs are vectorized into the runtime SVG"
      : "native geometry is evidence; the product contract owns the semantic mark", x + 18, y + 240);
  }
  writeFileSync(
    join(draftDir, "classic-core-reference-board.png"),
    canvas.toBuffer("image/png"),
  );
}

const tempDir = mkdtempSync(join(tmpdir(), "ai-system6-classic-icons-"));
try {
  const nativeSpecs = [];
  for (const icon of Object.values(source.icons)) {
    for (const sizeSource of [icon.source32, icon.source16]) {
      if (sizeSource.nativeReference) nativeSpecs.push(sizeSource.nativeReference);
    }
  }
  const exportedFiles = new Set();
  for (const spec of nativeSpecs) {
    const key = `${spec.file}\0${spec.prefix}`;
    if (exportedFiles.has(key)) continue;
    exportedFiles.add(key);
    exportNativeFile(tempDir, spec);
  }

  const iconResults = [];
  const familyManifest = {
    schemaVersion: 1,
    target: "System 6-era monochrome Macintosh Finder",
    generatedBy: "tooling/build-classic-core-icons.mjs",
    nativeImageSha256: nativeImageHash,
    coreOnly: true,
    selectionRecipe: "Invert artwork and paper within the separate mask; never ship a selected bitmap.",
    icons: {},
  };
  const runtimeManifest = {};

  for (const id of coreIds) {
    const icon = source.icons[id];
    const nativeReference = icon.source32.nativeReference || null;
    const nativeEvidence = nativeReference
      ? readNativePaths(tempDir, nativeReference, 32)
      : null;
    // Finder is deliberately a friendly Macintosh in the product continuity
    // contract. System ICN# 3 supplies its physical geometry, but it is not a
    // smiling Finder face, so this one object remains a documented adaptation.
    const replica32 = Boolean(nativeEvidence) && id !== "finderApp";
    const large = replica32 ? nativeEvidence : customPaths(icon.source32, 32, `${id} 32`);
    const nativeReference16 = icon.source16.nativeReference || null;
    const nativeEvidence16 = nativeReference16
      ? readNativePaths(tempDir, nativeReference16, 16)
      : null;
    const small = nativeEvidence16 || customPaths(icon.source16, 16, `${id} 16`);
    const rasters = {
      32: {
        art: await rasterizePath(large.artwork, 32),
        mask: await rasterizePath(large.mask, 32),
      },
      16: {
        art: await rasterizePath(small.artwork, 16),
        mask: await rasterizePath(small.mask, 16),
      },
    };
    const metrics = Object.fromEntries([32, 16].map((size) => [size, {
      art: rasters[size].art.metrics,
      mask: rasters[size].mask.metrics,
    }]));
    for (const size of [32, 16]) {
      const metric = metrics[size];
      if (!metric.art.pixels || !metric.mask.pixels) throw new Error(`${id}/${size}: empty bitmap`);
      const outsideMask = [...rasters[size].art.occupied]
        .filter((pixel) => !rasters[size].mask.occupied.has(pixel));
      if (outsideMask.length) {
        throw new Error(`${id}/${size}: artwork escapes its mask at ${outsideMask.slice(0, 8).join(" ")}`);
      }
    }

    let referenceDiffPixels = null;
    if (nativeReference) {
      const nativeRasters = {
        art: await rasterizePath(nativeEvidence.artwork, 32),
        mask: await rasterizePath(nativeEvidence.mask, 32),
      };
      referenceDiffPixels = pixelDiffCount(rasters[32].art.occupied, nativeRasters.art.occupied)
        + pixelDiffCount(rasters[32].mask.occupied, nativeRasters.mask.occupied);
      if (replica32 && referenceDiffPixels !== 0) {
        throw new Error(`${id}: runtime replica differs from its native reference by ${referenceDiffPixels} pixels`);
      }
      if (!replica32 && referenceDiffPixels === 0) {
        throw new Error(`${id}: semantic adaptation unexpectedly became an exact native copy`);
      }
    }

    const largeFile = `${id}-32.svg`;
    const smallFile = `${id}-16.svg`;
    const largeMaskFile = `${id}-mask-32.svg`;
    const smallMaskFile = `${id}-mask-16.svg`;
    writeFileSync(join(outputDir, largeFile), assetSvg(32, large.artwork, large.mask));
    writeFileSync(join(outputDir, smallFile), assetSvg(16, small.artwork, small.mask));
    writeFileSync(join(outputDir, largeMaskFile), maskSvg(32, large.mask));
    writeFileSync(join(outputDir, smallMaskFile), maskSvg(16, small.mask));

    const sourceKind = replica32
      ? "native-resource-replica"
      : nativeReference
        ? "reference-guided-semantic-adaptation"
      : "period-metaphor-stand-in";
    const nativeLabel = nativeReference
      ? `${nativeReference.file}, ${nativeReference.type} ${nativeReference.id}`
      : "custom System 6-era pixel construction";
    runtimeManifest[id] = largeFile;
    familyManifest.icons[id] = {
      label: icon.label,
      sourceKind,
      nativeReference: nativeReference ? {
        file: nativeReference.file,
        type: nativeReference.type,
        id: nativeReference.id,
      } : null,
      nativeReference16: nativeReference16 ? {
        file: nativeReference16.file,
        type: nativeReference16.type,
        id: nativeReference16.id,
        artIndex: nativeReference16.artIndex,
        maskIndex: nativeReference16.maskIndex,
      } : null,
      referenceDiffPixels,
      sizes: {
        32: largeFile,
        16: smallFile,
      },
      masks: {
        32: largeMaskFile,
        16: smallMaskFile,
      },
      metrics,
    };
    iconResults.push({
      id,
      label: icon.label,
      large,
      small,
      metrics,
      sourceKind,
      nativeLabel,
      nativeEvidence,
      referenceDiffPixels,
      replica32,
    });
  }

  writeFileSync(
    join(outputDir, "classic-core-icon-manifest.json"),
    `${JSON.stringify(runtimeManifest, null, 2)}\n`,
  );
  writeFileSync(
    join(outputDir, "classic-core-icon-family.json"),
    `${JSON.stringify(familyManifest, null, 2)}\n`,
  );

  await makeReferenceBoard(iconResults);
  await makeContactSheet(iconResults);
  console.log(
    `classic: ${iconResults.length} core icons built at 32/16 with separate masks`,
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
