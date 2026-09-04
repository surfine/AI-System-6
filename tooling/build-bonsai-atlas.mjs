// Build the original Bonsai City 2:1 isometric atlas from checked-in,
// declarative micro-voxel recipes. No external art, network input, canvas
// package, or non-deterministic input participates in this build.

import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { desktopRoot, repositoryRoot } from "./lib/paths.mjs";

const assetsDir = path.join(desktopRoot, "assets", "bonsai");
const generatedDir = path.join(desktopRoot, "app", "generated");
const sourcePath = path.join(assetsDir, "atlas-source.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const geometry = source.geometry;
const directions = ["north", "east", "south", "west"];

// SC2K retune: the atlas is authored on a 64x32 diamond (SimCity 2000's
// tile pitch), so the isometric unit, frame cell, and anchor all come
// directly from the source geometry. No runtime stretch: the art is drawn
// at the SC2K proportion.
const ISO_U = geometry.tileWidth / 2; // 32
const ISO_V = geometry.tileHeight / 2; // 16
const CELL_W = geometry.cellWidth; // 213
const CELL_H = geometry.cellHeight; // 171
const ANCHOR_Y = Math.round(104 * (CELL_H / 128)); // ground line scales with the cell (139)
const ANCHOR_X = Math.floor(geometry.cellWidth / 2) + 12; // 118

function invariant(condition, message) {
  if (!condition) throw new Error(`bonsai-atlas-invalid: ${message}`);
}

invariant(source.schema === "ai-system-6-bonsai-micro-voxel-source-v2", "source schema");
invariant(source.license === "MIT" && source.source === "original", "provenance boundary");
invariant(geometry.tileWidth === 64 && geometry.tileHeight === 32, "2:1 tile geometry (64x32 SC2K)");
invariant(geometry.heightStep === 10, "height step");

function rgba(name) {
  const value = source.palette[name];
  invariant(Array.isArray(value) && value.length === 4, `palette ${name}`);
  return value;
}

function shade(color, amount) {
  return [
    Math.max(0, Math.min(255, color[0] + amount)),
    Math.max(0, Math.min(255, color[1] + amount)),
    Math.max(0, Math.min(255, color[2] + amount)),
    color[3],
  ];
}

function mixToward(color, target, t) {
  return [
    Math.round(color[0] + (target[0] - color[0]) * t),
    Math.round(color[1] + (target[1] - color[1]) * t),
    Math.round(color[2] + (target[2] - color[2]) * t),
    color[3],
  ];
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function expandSprites() {
  const frames = [];
  const add = (entry) => frames.push({
    footprint: [1, 1],
    height: 0,
    state: "normal",
    animation: null,
    variant: 1,
    license: "MIT",
    source: "original",
    ...entry,
  });

  source.terrain.forEach((entry) => add({ category: "terrain", ...entry }));
  source.connectors.forEach((connector) => {
    const shapes = connector.shapes || source.connectorShapes;
    shapes.forEach((shape, index) => add({
      id: `${connector.family}.${shape}`,
      category: "connector",
      kind: connector.family,
      shape,
      color: connector.color,
      accent: connector.accent,
      variant: index + 1,
    }));
  });
  source.scenery.forEach((entry) => add({ category: "scenery", ...entry }));
  for (let mask = 0; mask < 16; mask += 1) {
    add({ id: `terrain.slope.mask-${mask}`, category: "slope", kind: "slope", slopeMask: mask, variant: mask + 1 });
  }

  source.buildingFamilies.forEach((family) => {
    source.buildingStages.forEach((stage) => {
      for (let variant = 1; variant <= source.normalVariantsPerStage; variant += 1) {
        add({
          id: `building.${family.prefix}.${stage.stage}.${variant}.normal`,
          category: "building",
          kind: "building",
          zone: family.zone,
          stage: stage.stage,
          density: stage.density,
          footprint: stage.footprint,
          height: stage.height,
          state: "normal",
          variant,
          base: family.base,
          light: family.light,
        });
      }
    });
    source.buildingStates.filter((state) => state !== "normal").forEach((state, index) => {
      add({
        id: `building.${family.prefix}.2.1.${state}`,
        category: "building",
        kind: "building",
        zone: family.zone,
        stage: 2,
        density: "high",
        footprint: [2, 2],
        height: state === "foundation" ? 6 : state === "construction" ? 34 : 42,
        state,
        variant: index + 1,
        base: family.base,
        light: family.light,
        animation: state === "construction" ? "construction-2" : null,
      });
    });
  });

  source.facilities.forEach((entry) => add({ category: "facility", state: "normal", ...entry }));
  if (Array.isArray(source.catalogSpecials)) source.catalogSpecials.forEach((entry) => add({ category: "catalog", state: "normal", ...entry }));
  source.agents.forEach((entry) => add({ category: "agent", state: "normal", ...entry }));

  // Night variant family: the same silhouettes with dimmed walls and lit
  // windows, generated from the same recipe data so day and night stay
  // geometrically identical. Wind and tower facilities swap their wall
  // windows for a single beacon light.
  if (source.night?.buildings) {
    source.buildingFamilies.forEach((family) => {
      source.buildingStages.forEach((stage) => {
        for (let variant = 1; variant <= source.normalVariantsPerStage; variant += 1) {
          add({
            id: `building.${family.prefix}.${stage.stage}.${variant}.night`,
            category: "building",
            kind: "building",
            zone: family.zone,
            stage: stage.stage,
            density: stage.density,
            footprint: stage.footprint,
            height: stage.height,
            state: "night",
            variant,
            base: family.base,
            light: family.light,
          });
        }
      });
    });
  }
  if (source.night?.facilities) {
    source.facilities.forEach((entry) => add({ ...entry, category: "facility", state: "night", id: `${entry.id}.night` }));
  }
  if (source.night?.catalog) {
    (Array.isArray(source.catalogSpecials) ? source.catalogSpecials : [])
      .forEach((entry) => add({ ...entry, category: "catalog", state: "night", id: `${entry.id}.night` }));
  }
  return frames;
}

const sprites = expandSprites();
const columns = geometry.columns;
const rows = Math.ceil(sprites.length / columns);
const atlasWidth = columns * CELL_W;
const atlasHeight = rows * CELL_H;
const anchor = { x: ANCHOR_X, y: ANCHOR_Y };

function putPixel(buffer, width, height, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= width || y >= height || color[3] === 0) return;
  const offset = (y * width + x) * 4;
  buffer[offset] = color[0];
  buffer[offset + 1] = color[1];
  buffer[offset + 2] = color[2];
  buffer[offset + 3] = color[3];
}

function fillRect(buffer, width, height, x, y, w, h, color) {
  for (let py = Math.floor(y); py < Math.ceil(y + h); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + w); px += 1) putPixel(buffer, width, height, px, py, color);
  }
}

function fillPolygon(buffer, width, height, points, color) {
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point[1]))));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...points.map((point) => point[1]))));
  for (let y = minY; y <= maxY; y += 1) {
    const scanY = y + 0.5;
    const xs = [];
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      if ((a[1] <= scanY && b[1] > scanY) || (b[1] <= scanY && a[1] > scanY)) {
        xs.push(a[0] + ((scanY - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let index = 0; index + 1 < xs.length; index += 2) {
      for (let x = Math.ceil(xs[index]); x < Math.ceil(xs[index + 1]); x += 1) putPixel(buffer, width, height, x, y, color);
    }
  }
}

function drawLine(buffer, width, height, x0, y0, x1, y1, color, thickness = 1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    fillRect(buffer, width, height, x0 - Math.floor(thickness / 2), y0 - Math.floor(thickness / 2), thickness, thickness, color);
    if (x0 === x1 && y0 === y1) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}

function diamond(cx, cy, footprintWidth = 1, footprintHeight = 1) {
  const w = Math.min(2.35, footprintWidth);
  const h = Math.min(2.35, footprintHeight);
  return [
    [cx + (-w + h) * ISO_V, cy - (w + h) * (ISO_V / 2)],
    [cx + (w + h) * ISO_V, cy + (w - h) * (ISO_V / 2)],
    [cx + (w - h) * ISO_V, cy + (w + h) * (ISO_V / 2)],
    [cx - (w + h) * ISO_V, cy + (-w + h) * (ISO_V / 2)],
  ];
}

function drawIsoBox(buffer, cx, cy, footprint, heightPx, top, left, right, directionIndex) {
  const base = diamond(cx, cy, footprint[0], footprint[1]);
  const topPoints = base.map(([x, y]) => [x, y - heightPx]);
  const faceA = directionIndex % 2 === 0 ? left : right;
  const faceB = directionIndex % 2 === 0 ? right : left;
  fillPolygon(buffer, atlasWidth, atlasHeight, [topPoints[1], topPoints[2], base[2], base[1]], faceA);
  fillPolygon(buffer, atlasWidth, atlasHeight, [topPoints[2], topPoints[3], base[3], base[2]], faceB);
  fillPolygon(buffer, atlasWidth, atlasHeight, topPoints, top);
  return { base, top: topPoints };
}

// Ground used to be a flat diamond with a few stray dots, which is why a
// hillside read as coloured paper. Now the surface is ordered-dithered between
// two shades of its own colour, the cliff faces fall away with a rock band at
// the cut, and the shoreline gets foam where water meets land.
function drawSlope(buffer, frame, cx, cy, directionIndex) {
  const colors = (source.slopes?.colors || ["grassLight", "grass", "grassDark"]).map(rgba);
  const step = source.slopes?.step || 8;
  const mask = frame.slopeMask & 15;
  // Corner order A(-,-) B(+,-) C(+,+) D(-,+); an edge toward a higher
  // neighbour lifts both of its corners.
  const lift = { A: 0, B: 0, C: 0, D: 0 };
  if (mask & 1) { lift.A = step; lift.B = step; }          // y-1 higher
  if (mask & 2) { lift.B = step; lift.C = step; }          // x+1 higher
  if (mask & 4) { lift.C = step; lift.D = step; }          // y+1 higher
  if (mask & 8) { lift.D = step; lift.A = step; }          // x-1 higher
  const corners = {
    A: isoPoint(cx, cy, -0.5, -0.5, lift.A),
    B: isoPoint(cx, cy, 0.5, -0.5, lift.B),
    C: isoPoint(cx, cy, 0.5, 0.5, lift.C),
    D: isoPoint(cx, cy, -0.5, 0.5, lift.D),
  };
  const base = {
    A: isoPoint(cx, cy, -0.5, -0.5, -step),
    B: isoPoint(cx, cy, 0.5, -0.5, -step),
    C: isoPoint(cx, cy, 0.5, 0.5, -step),
    D: isoPoint(cx, cy, -0.5, 0.5, -step),
  };
  // Skirts first, so the tilted surface sits on solid ground.
  fillPolygon(buffer, atlasWidth, atlasHeight, [corners.B, corners.C, base.C, base.B], shade(colors[1], -22));
  fillPolygon(buffer, atlasWidth, atlasHeight, [corners.C, corners.D, base.D, base.C], shade(colors[2], -32));
  ditherPolygon(buffer, [corners.A, corners.B, corners.C, corners.D],
    shade(colors[1], -6), colors[0], mask ? 0.6 : 0.5);
  // A lit crease along each raised edge reads as the break of slope.
  const seam = shade(colors[0], 30);
  if (mask & 1) drawLine(buffer, atlasWidth, atlasHeight, corners.A[0], corners.A[1], corners.B[0], corners.B[1], seam, 1);
  if (mask & 2) drawLine(buffer, atlasWidth, atlasHeight, corners.B[0], corners.B[1], corners.C[0], corners.C[1], seam, 1);
  if (mask & 4) drawLine(buffer, atlasWidth, atlasHeight, corners.C[0], corners.C[1], corners.D[0], corners.D[1], shade(seam, -20), 1);
  if (mask & 8) drawLine(buffer, atlasWidth, atlasHeight, corners.D[0], corners.D[1], corners.A[0], corners.A[1], shade(seam, -20), 1);
}

function drawTerrain(buffer, frame, cx, cy, directionIndex) {
  const colors = frame.colors.map(rgba);
  // Soil and rock scatter tile-by-tile through the generated map, so at full
  // palette strength the ground read as a pastel checkerboard. Natural soil
  // and rock tops lean toward grass and become subtle ground variation; the
  // dozed lot (terrain.lot) keeps the honest dirt read, and the cliff cut
  // faces keep the full earth tones (they draw from colors[] untouched).
  let topA = colors[1];
  let topB = colors[0];
  if (frame.id === "terrain.soil" || frame.id === "terrain.rock") {
    const toward = frame.id === "terrain.soil" ? 0.58 : 0.55;
    topA = mixToward(colors[1], rgba("grass"), toward);
    topB = mixToward(colors[0], rgba("grassLight"), toward);
  }
  const top = diamond(cx, cy, 1, 1);
  const depth = frame.height || 0;
  const lower = top.map(([x, y]) => [x, y + depth]);
  const seed = hashString(`${frame.id}:${directionIndex}`);

  if (depth) {
    // The two cut faces. The front-right catches less light than the
    // front-left, and both carry a lighter band of exposed rock at the top.
    const faceA = [top[1], top[2], lower[2], lower[1]];
    const faceB = [top[2], top[3], lower[3], lower[2]];
    ditherPolygon(buffer, faceA, shade(colors[1], -22), shade(colors[1], -2), 0.5);
    ditherPolygon(buffer, faceB, shade(colors[2], -30), shade(colors[2], -10), 0.45);
    const band = shade(colors[2], 20);
    drawLine(buffer, atlasWidth, atlasHeight, top[1][0], top[1][1] + 1, top[2][0], top[2][1] + 1, band, 1);
    drawLine(buffer, atlasWidth, atlasHeight, top[2][0], top[2][1] + 1, top[3][0], top[3][1] + 1, shade(band, -14), 1);
  }

  if (frame.kind === "water") {
    // Water is two dithered blues plus three ripple runs, so a lake stops
    // being one flat plate.
    ditherPolygon(buffer, top, colors[1], colors[0], 0.45);
    const crest = shade(colors[0], 26);
    for (let ripple = 0; ripple < 3; ripple += 1) {
      const rx = cx - 16 + ((seed >>> (ripple * 4)) % 22);
      const ry = cy - 6 + ((seed >>> (ripple * 3 + 1)) % 11);
      drawLine(buffer, atlasWidth, atlasHeight, rx, ry, rx + 9, ry + 4, crest, 1);
      drawLine(buffer, atlasWidth, atlasHeight, rx + 2, ry + 3, rx + 7, ry + 5, shade(colors[0], 8), 1);
    }
    return;
  }

  ditherPolygon(buffer, top, topA, topB, frame.kind === "snow" ? 0.62 : 0.5);

  if (frame.kind === "coast") {
    // Sand grades into water, and the foam line sits where they meet.
    const waterEdge = [
      [cx - 24, cy], [cx, cy + 12], [cx + 24, cy], [cx, cy + 4],
    ];
    ditherPolygon(buffer, waterEdge, colors[2], shade(colors[2], 22), 0.5);
    drawLine(buffer, atlasWidth, atlasHeight, cx - 20, cy + 3, cx - 2, cy + 11, rgba("white"), 1);
    drawLine(buffer, atlasWidth, atlasHeight, cx + 2, cy + 11, cx + 20, cy + 3, rgba("white"), 1);
    return;
  }

  // Surface litter: pebbles on rock and soil, tufts on anything that grows.
  const accent = shade(colors[2], directionIndex % 2 === 0 ? 10 : -6);
  for (let dot = 0; dot < 10; dot += 1) {
    const px = cx + ((seed >>> (dot * 3)) % 33) - 16;
    const py = cy + ((seed >>> (dot * 2 + 1)) % 11) - 5;
    // Stay inside the diamond: |dx|/2 + |dy| < 12.
    if (Math.abs(px - cx) / 2 + Math.abs(py - cy) > 10) continue;
    fillRect(buffer, atlasWidth, atlasHeight, px, py, 2, 1, accent);
  }
  if (frame.kind !== "rock" && frame.id !== "terrain.rock" && frame.id !== "terrain.soil" && frame.id !== "terrain.lot") {
    for (let blade = 0; blade < 5; blade += 1) {
      const bx = cx + ((seed >>> (blade * 5 + 3)) % 31) - 15;
      const by = cy + ((seed >>> (blade * 7 + 2)) % 10) - 5;
      if (Math.abs(bx - cx) / 2 + Math.abs(by - cy) > 9) continue;
      drawLine(buffer, atlasWidth, atlasHeight, bx, by, bx, by - 2, shade(colors[2], -16), 1);
      putPixel(buffer, atlasWidth, atlasHeight, bx, by - 3, shade(colors[0], 14));
    }
  }
}

function rotatePort(port, directionIndex) {
  const ports = ["n", "e", "s", "w"];
  return ports[(ports.indexOf(port) + directionIndex) % 4];
}

function connectorPorts(shape) {
  if (shape.startsWith("mask-")) {
    const mask = Number(shape.slice(5)) | 0;
    return ["n", "e", "s", "w"].filter((port, index) => mask & (1 << index));
  }
  // Two-character orientation shapes: "ns" = wide end toward n, narrow end
  // toward s. The wide end is where the onramp meets the highway.
  if (/^[nesw][nesw]$/.test(shape)) {
    return [shape[0], shape[1]];
  }
  if (shape === "straight-ns") return ["n", "s"];
  if (shape === "straight-ew") return ["e", "w"];
  if (shape === "corner-ne") return ["n", "e"];
  if (shape === "tee-n") return ["e", "s", "w"];
  if (shape === "cross") return ["n", "e", "s", "w"];
  return ["n"];
}

function drawConnector(buffer, frame, cx, cy, directionIndex) {
  // A tile's four neighbours are diagonal on screen, not orthogonal: with
  // sx = (x - y) * 24 and sy = (x + y) * 12, the neighbour at y-1 sits at
  // (+24, -12), x+1 at (+24, +12), y+1 at (-24, +12) and x-1 at (-24, -12).
  // Each arm therefore runs to the midpoint of the shared edge — half of that
  // offset — so it meets the neighbour's opposite arm exactly on the tile
  // boundary and the network reads as one continuous ribbon. Drawing the arms
  // straight up/down/left/right aimed them at the diamond's corners instead,
  // where no edge-adjacent neighbour ever is, and every road and power line
  // came out as a field of disconnected studs.
  const points = {
    n: [cx + ISO_V, cy - ISO_V / 2],
    e: [cx + ISO_V, cy + ISO_V / 2],
    s: [cx - ISO_V, cy + ISO_V / 2],
    w: [cx - ISO_V, cy - ISO_V / 2],
  };
  const color = rgba(frame.color);
  const accent = rgba(frame.accent);
  const kind = frame.kind;
  const scale = ISO_V / 12; // 4/3: the tie/pole width scales with the tile
  const thickness = Math.round((kind === "road" ? 9 : kind === "rail" ? 6
    : kind === "highway" || kind.startsWith("bridge-") ? 10
      : kind === "onramp" ? 7 : kind === "subway" ? 8 : kind === "pipe" ? 5 : 3) * scale);
  const ports = connectorPorts(frame.shape).map((port) => rotatePort(port, directionIndex));

  if (kind === "onramp" && ports.length === 2) {
    // A real ramp: the wide end meets the highway (ports[0]), the narrow end
    // the road (ports[1]), tapering through the tile centre — the SC2000
    // unrotated onramp family.
    const wide = points[ports[0]];
    const narrow = points[ports[1]];
    drawLine(buffer, atlasWidth, atlasHeight, cx, cy, wide[0], wide[1], color, 10);
    drawLine(buffer, atlasWidth, atlasHeight, cx, cy, narrow[0], narrow[1], color, 6);
    fillPolygon(buffer, atlasWidth, atlasHeight, [
      [cx, cy - 4], [cx + 7, cy], [cx, cy + 4], [cx - 7, cy],
    ], color);
    const ox = (cy - wide[1]) / 2;
    const oy = (wide[0] - cx) / 2;
    for (const side of [-1, 1]) {
      drawLine(buffer, atlasWidth, atlasHeight,
        cx + ox * side * 0.7, cy + oy * side * 0.7,
        wide[0] + ox * side * 0.7, wide[1] + oy * side * 0.7,
        shade(accent, -8), 1);
    }
    drawLine(buffer, atlasWidth, atlasHeight, cx, cy, narrow[0], narrow[1], accent, 1);
    return;
  }

  if (kind === "highway" || kind === "bridge-highway") {
    drawHighwayDeck(buffer, frame, cx, cy, ports, color, accent);
    return;
  }

  ports.forEach((port) => {
    drawLine(buffer, atlasWidth, atlasHeight, cx, cy, points[port][0], points[port][1], color, thickness);
  });
  if (kind === "pipe") {
    // A conduit reads by its couplings: a lighter band where each arm leaves
    // the tile, and a collar at the joint.
    ports.forEach((port) => {
      const [px, py] = points[port];
      drawLine(buffer, atlasWidth, atlasHeight, cx, cy, px, py, shade(accent, -6), 1);
      fillRect(buffer, atlasWidth, atlasHeight, cx + (px - cx) * 0.62 - 2, cy + (py - cy) * 0.62 - 1, 4, 2, shade(color, -30));
    });
    if (ports.length) fillPolygon(buffer, atlasWidth, atlasHeight, [
      [cx, cy - 3], [cx + 5, cy], [cx, cy + 3], [cx - 5, cy],
    ], shade(accent, -18));
  }
  if (kind === "subway") {
    // A tunnel is a dark bore with lit shoulders, not a painted stripe.
    ports.forEach((port) => {
      const [px, py] = points[port];
      drawLine(buffer, atlasWidth, atlasHeight, cx, cy, px, py, shade(color, -34), 4);
      drawLine(buffer, atlasWidth, atlasHeight, cx, cy, px, py, accent, 1);
    });
  }
  if (kind === "wire") {
    // A power pole with a crossarm at the tile centre, the SC2000/OpenTTD
    // power-line read; the arms pass through it.
    fillRect(buffer, atlasWidth, atlasHeight, cx - 1, cy - 14, 2, 18, color);
    fillRect(buffer, atlasWidth, atlasHeight, cx - 8, cy - 12, 16, 2, color);
    fillRect(buffer, atlasWidth, atlasHeight, cx - 8, cy - 13, 2, 2, accent);
    fillRect(buffer, atlasWidth, atlasHeight, cx + 6, cy - 13, 2, 2, accent);
  }

  // Where arms meet, lay a pad shaped like the tile itself. A square blob is
  // the wrong shape under this projection, so a crossroads used to read as two
  // ribbons overlapping rather than one piece of paved ground. The pad is
  // 2:1 like the tile diamond and grows when three or four arms arrive.
  const junction = ports.length >= 3;
  const padX = thickness * (junction ? 1.6 : 0.8);
  const padY = padX / 2;
  fillPolygon(buffer, atlasWidth, atlasHeight, [
    [cx, cy - padY], [cx + padX, cy], [cx, cy + padY], [cx - padX, cy],
  ], color);

  // Lane markings run down each arm but stop short of a junction, the way
  // real markings give way to the intersection box.
  const markFrom = junction && (kind === "road" || kind === "highway" || kind.startsWith("bridge-")) ? 0.55 : 0;
  ports.forEach((port) => {
    const [px, py] = points[port];
    const startX = cx + (px - cx) * markFrom;
    const startY = cy + (py - cy) * markFrom;
    if (kind === "road") {
      // Centre marking plus quiet curb edges, matching the 3D backend's
      // road curbs so streets read as paved corridors in both views.
      drawLine(buffer, atlasWidth, atlasHeight, startX, startY, px, py, accent, 1);
      const ox = (cy - py) / 2;
      const oy = (px - cx) / 2;
      for (const side of [-1, 1]) {
        drawLine(buffer, atlasWidth, atlasHeight,
          startX + ox * side * 0.72, startY + oy * side * 0.72,
          px + ox * side * 0.72, py + oy * side * 0.72,
          shade(accent, -20), 1);
      }
    } else if (kind === "bridge-rail") {
      // Twin rails on the deck, like the land rails.
      const ox = (cy - py) / 2;
      const oy = (px - cx) / 2;
      for (const side of [-1, 1]) {
        drawLine(buffer, atlasWidth, atlasHeight,
          startX + ox * side * 0.27, startY + oy * side * 0.27,
          px + ox * side * 0.27, py + oy * side * 0.27,
          accent, 2);
      }
    } else if (kind === "onramp") {
      drawLine(buffer, atlasWidth, atlasHeight, startX, startY, px, py, accent, 1);
    } else {
      drawLine(buffer, atlasWidth, atlasHeight, startX, startY, px, py,
        accent, kind === "road" ? 1 : 2);
    }
  });
}

// The highway is an elevated deck, not a thicker road ribbon. The old arm
// renderer treated a two-tile-wide run as a field of junctions: every interior
// tile had three or four ports, so it drew a giant junction pad and suppressed
// its lane markings, and the whole run collapsed into a charcoal slab covered
// in elliptical blobs. The deck fills the tile, shows a cut face toward the
// viewer so it reads raised, carries dual-carriageway markings along the run
// axis, and closes every unconnected edge with a concrete parapet — the
// SC2000 raised-highway read (proportions from observation, art original).
function drawHighwayDeck(buffer, frame, cx, cy, ports, color, accent) {
  const corners = diamond(cx, cy, 1, 1);
  const has = (port) => ports.includes(port);
  const depth = 6;

  // Cut faces toward the viewer (the e and s edges) so the slab reads raised.
  const faceE = [corners[1], corners[2],
    [corners[2][0], corners[2][1] + depth], [corners[1][0], corners[1][1] + depth]];
  const faceS = [corners[2], corners[3],
    [corners[3][0], corners[3][1] + depth], [corners[2][0], corners[2][1] + depth]];
  fillPolygon(buffer, atlasWidth, atlasHeight, faceE, shade(color, -14));
  fillPolygon(buffer, atlasWidth, atlasHeight, faceS, shade(color, -26));

  // Deck surface: worn concrete-grey asphalt, clearly lighter than a street,
  // so the markings and the parapets have somewhere to sit.
  ditherPolygon(buffer, corners, shade(color, 22), shade(color, 34), 0.5);

  const mids = {
    n: [cx + 12, cy - 6], e: [cx + 12, cy + 6],
    s: [cx - 12, cy + 6], w: [cx - 12, cy - 6],
  };
  // The run axis: a full pair wins. An interior tile of a two-wide run has
  // three ports (its own axis plus the sibling carriageway), so "any port on
  // the cross axis" must NOT count as a second run — only a full cross pair
  // makes an interchange.
  const fullNS = has("n") && has("s");
  const fullEW = has("e") && has("w");
  const axes = [];
  if (fullNS || (!fullEW && (has("n") || has("s")))) axes.push(["n", "s"]);
  if (fullEW || (!fullNS && (has("e") || has("w")))) axes.push(["e", "w"]);
  const interchange = fullNS && fullEW;

  axes.forEach(([a, b]) => {
    const from = has(a) ? mids[a] : [cx, cy];
    const to = has(b) ? mids[b] : [cx, cy];
    // Perpendicular basis for lane offsets, as in the road arms.
    const ox = (from[1] - to[1]) / 4;
    const oy = (to[0] - from[0]) / 4;
    if (interchange) {
      // Inside an interchange the lanes give way; a faint seam pair keeps
      // the direction legible without painting a junction blob.
      drawLine(buffer, atlasWidth, atlasHeight, from[0], from[1], to[0], to[1], shade(color, -12), 1);
      return;
    }
    // Dark median pair down the spine of the divided carriageways.
    for (const side of [-1, 1]) {
      drawLine(buffer, atlasWidth, atlasHeight,
        from[0] + ox * side * 0.12, from[1] + oy * side * 0.12,
        to[0] + ox * side * 0.12, to[1] + oy * side * 0.12,
        shade(color, -30), 1);
    }
    // Dashed lane lines, one row per carriageway, broken like real paint.
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    for (const side of [-1, 1]) {
      for (const [t0, t1] of [[0.04, 0.26], [0.4, 0.62], [0.76, 0.98]]) {
        drawLine(buffer, atlasWidth, atlasHeight,
          from[0] + dx * t0 + ox * side * 0.5, from[1] + dy * t0 + oy * side * 0.5,
          from[0] + dx * t1 + ox * side * 0.5, from[1] + dy * t1 + oy * side * 0.5,
          accent, 1);
      }
    }
  });

  // Concrete parapet along every edge that does not continue onto another
  // highway tile: the guard rail that separates deck from air.
  const edgeCorners = {
    n: [corners[0], corners[1]], e: [corners[1], corners[2]],
    s: [corners[2], corners[3]], w: [corners[3], corners[0]],
  };
  const rail = rgba("concrete");
  ["n", "e", "s", "w"].forEach((port) => {
    if (has(port)) return;
    const [p0, p1] = edgeCorners[port];
    const inset = (point, t) => [point[0] + (cx - point[0]) * t, point[1] + (cy - point[1]) * t];
    const [a0, a1] = [inset(p0, 0.08), inset(p1, 0.08)];
    const [b0, b1] = [inset(p0, 0.2), inset(p1, 0.2)];
    drawLine(buffer, atlasWidth, atlasHeight, b0[0], b0[1], b1[0], b1[1], shade(color, -34), 1);
    drawLine(buffer, atlasWidth, atlasHeight, a0[0], a0[1], a1[0], a1[1], rail, 2);
  });
}

// Trees were a flat diamond canopy on a stick, drawn 38px tall — taller than a
// stage-one house — so a forest read as a field of mushrooms and a wooded map
// looked like clip art. They are small, clustered and textured now: a conifer
// is a stack of tiers, a broadleaf is an irregular crown of overlapping lobes,
// and both carry ordered dither so the canopy has a lit and a shaded side.
function drawTree(buffer, frame, cx, cy, directionIndex) {
  const kindByVariant = {
    1: { form: "broadleaf", trunk: 9, crown: 15, leaf: "tree" },
    2: { form: "conifer", trunk: 7, crown: 17, leaf: "tree" },
    3: { form: "sapling", trunk: 5, crown: 8, leaf: "treeLight" },
    4: { form: "broadleaf", trunk: 9, crown: 14, leaf: "red" },
    5: { form: "broadleaf", trunk: 8, crown: 13, leaf: "blossom" },
    6: { form: "conifer", trunk: 7, crown: 15, leaf: "winterCanopy" },
  };
  const spec = kindByVariant[frame.variant] || kindByVariant[1];
  const base = rgba(spec.leaf);
  const lit = shade(base, directionIndex % 2 ? 16 : 26);
  const dark = shade(base, -30);

  // A small contact shadow, sized to the crown, so the tree sits on the tile.
  fillPolygon(buffer, atlasWidth, atlasHeight, [
    [cx - spec.crown * 0.5, cy + 2], [cx, cy + spec.crown * 0.28],
    [cx + spec.crown * 0.5, cy + 2], [cx, cy - spec.crown * 0.22 + 2],
  ], shade(rgba("black"), 58));

  const trunkTop = cy - spec.trunk;
  fillRect(buffer, atlasWidth, atlasHeight, cx - 1, trunkTop, 3, spec.trunk + 3, rgba("trunk"));
  fillRect(buffer, atlasWidth, atlasHeight, cx + 1, trunkTop, 1, spec.trunk + 3, shade(rgba("trunk"), -22));

  if (spec.form === "conifer") {
    // Three tiers narrowing to a point: the silhouette that separates a
    // conifer from a broadleaf at eight pixels wide.
    for (let tier = 0; tier < 3; tier += 1) {
      const w = spec.crown * (1 - tier * 0.26) * 0.5;
      const top = trunkTop - spec.crown * (0.34 + tier * 0.26);
      const bottom = top + spec.crown * 0.42;
      ditherPolygon(buffer, [
        [cx, top], [cx + w, bottom], [cx, bottom + 2], [cx - w, bottom],
      ], dark, lit, 0.52);
    }
    return;
  }

  if (spec.form === "sapling") {
    ditherPolygon(buffer, [
      [cx, trunkTop - spec.crown], [cx + spec.crown * 0.5, trunkTop - spec.crown * 0.4],
      [cx, trunkTop - spec.crown * 0.05], [cx - spec.crown * 0.5, trunkTop - spec.crown * 0.4],
    ], dark, lit, 0.5);
    return;
  }

  // Broadleaf: three overlapping lobes make an irregular crown, which is what
  // stops a row of trees from looking stamped.
  const lobes = [
    { dx: 0, dy: -spec.crown * 0.62, r: spec.crown * 0.56 },
    { dx: -spec.crown * 0.34, dy: -spec.crown * 0.34, r: spec.crown * 0.44 },
    { dx: spec.crown * 0.32, dy: -spec.crown * 0.4, r: spec.crown * 0.46 },
  ];
  lobes.forEach((lobe, index) => {
    const ox = cx + lobe.dx;
    const oy = trunkTop + lobe.dy;
    ditherPolygon(buffer, [
      [ox, oy - lobe.r], [ox + lobe.r, oy - lobe.r * 0.2],
      [ox + lobe.r * 0.7, oy + lobe.r * 0.7], [ox - lobe.r * 0.7, oy + lobe.r * 0.7],
      [ox - lobe.r, oy - lobe.r * 0.2],
    ], dark, index === 0 ? lit : shade(lit, -10), index === 0 ? 0.58 : 0.44);
  });
}

function buildingWindowRects(frame) {
  const height = Math.min(68, frame.height);
  const rows = Math.max(1, Math.floor(height / ISO_V));
  const rects = [];
  for (let row = 0; row < rows; row += 1) {
    const y = ANCHOR_Y - height + 10 + row * 10;
    rects.push({ x: 88, y, w: 5, h: 4 });
    rects.push({ x: 67, y: y + 4, w: 5, h: 4 });
    if (frame.variant % 2 === 0) rects.push({ x: 98, y: y + 5, w: 4, h: 3 });
  }
  return rects;
}

function nightWindowRects(frame) {
  if (frame.kind === "wind") return [{ x: 78, y: 42, w: 4, h: 4 }];
  if (frame.kind === "tower") return [{ x: 78, y: 46, w: 4, h: 4 }];
  return buildingWindowRects(frame);
}

// The 2.5D read for frames that carry no zone grammar: roof edges catch the
// light, the front corner separates the faces, floor lines give rhythm.
function drawFacadeDetails(buffer, cx, cy, box, base, light) {
  drawLine(buffer, atlasWidth, atlasHeight, box.top[1][0], box.top[1][1], box.top[2][0], box.top[2][1], shade(light, 18), 1);
  drawLine(buffer, atlasWidth, atlasHeight, box.top[2][0], box.top[2][1], box.top[3][0], box.top[3][1], shade(light, 10), 1);
  drawLine(buffer, atlasWidth, atlasHeight, box.top[2][0], box.top[2][1], box.base[2][0], box.base[2][1], shade(base, -32), 2);
  const rows = Math.max(1, Math.floor((box.top[2][1] - box.base[2][1]) / ISO_V));
  for (let row = 1; row < rows; row += 1) {
    const f = row / rows;
    const a = [box.top[3][0] + (box.base[3][0] - box.top[3][0]) * f, box.top[3][1] + (box.base[3][1] - box.top[3][1]) * f];
    const b = [box.top[2][0] + (box.base[2][0] - box.top[2][0]) * f, box.top[2][1] + (box.base[2][1] - box.top[2][1]) * f];
    drawLine(buffer, atlasWidth, atlasHeight, a[0], a[1], b[0], b[1], shade(base, -22), 1);
  }
}

// A red torii gate at the water's edge — two pillars, a flared kasagi beam,
// and a dark nuki beam — the signature of piers and marinas.
function drawTorii(buffer, cx, cy, night) {
  const red = night ? shade(rgba("red"), -22) : rgba("red");
  const ink = rgba("black");
  fillRect(buffer, atlasWidth, atlasHeight, cx - 12, cy - 34, 3, 30, red);
  fillRect(buffer, atlasWidth, atlasHeight, cx + 9, cy - 34, 3, 30, red);
  fillRect(buffer, atlasWidth, atlasHeight, cx - 18, cy - 38, 36, 4, red);
  fillRect(buffer, atlasWidth, atlasHeight, cx - 20, cy - 36, 40, 3, red);
  fillRect(buffer, atlasWidth, atlasHeight, cx - 13, cy - 25, 26, 3, ink);
  fillRect(buffer, atlasWidth, atlasHeight, cx - 13, cy - 22, 26, 1, shade(red, -14));
}

// --- structural building vocabulary ----------------------------------------
//
// Every building used to be one extruded box plus a window grid, so three
// families times three stages times four variants produced 36 near-identical
// silhouettes whose only variant difference was a nine-pixel antenna. The
// parts below are what the era's art actually composes: massing, roof form,
// roof furniture, facade treatment, and ordered dither for gradation.

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// Two shades of one colour, mixed by an ordered threshold. This is how an
// indexed palette gets gradation without inventing intermediate colours.
function ditherPolygon(buffer, points, dark, light, mix) {
  const ys = points.map((point) => point[1]);
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(atlasHeight - 1, Math.ceil(Math.max(...ys)));
  for (let y = minY; y <= maxY; y += 1) {
    const scan = y + 0.5;
    const xs = [];
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      if ((a[1] <= scan && b[1] > scan) || (b[1] <= scan && a[1] > scan)) {
        xs.push(a[0] + ((scan - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let index = 0; index + 1 < xs.length; index += 2) {
      for (let x = Math.ceil(xs[index]); x < Math.ceil(xs[index + 1]); x += 1) {
        const threshold = (BAYER4[((y % 4) + 4) % 4][((x % 4) + 4) % 4] + 0.5) / 16;
        putPixel(buffer, atlasWidth, atlasHeight, x, y, mix > threshold ? light : dark);
      }
    }
  }
}

// Tile space: u and v run along the two ground axes, z is pixels upward, and
// the footprint is centred on (cx, cy) the same way diamond() centres it.
function isoPoint(cx, cy, u, v, z) {
  return [cx + (u - v) * ISO_U, cy + (u + v) * ISO_V - z];
}

// One rectangular prism. Returns the anchors a caller needs to put windows and
// doors ON the walls rather than at screen-space guesses.
function drawMass(buffer, cx, cy, mass, paint) {
  const { u0, v0, u1, v1, z0, z1 } = mass;
  const top = [
    isoPoint(cx, cy, u0, v0, z1), isoPoint(cx, cy, u1, v0, z1),
    isoPoint(cx, cy, u1, v1, z1), isoPoint(cx, cy, u0, v1, z1),
  ];
  // Larger u + v is nearer the viewer, so the u1 and v1 walls are the two the
  // camera can see.
  const leftFace = [
    isoPoint(cx, cy, u1, v0, z1), isoPoint(cx, cy, u1, v1, z1),
    isoPoint(cx, cy, u1, v1, z0), isoPoint(cx, cy, u1, v0, z0),
  ];
  const rightFace = [
    isoPoint(cx, cy, u0, v1, z1), isoPoint(cx, cy, u1, v1, z1),
    isoPoint(cx, cy, u1, v1, z0), isoPoint(cx, cy, u0, v1, z0),
  ];
  paint.left(leftFace);
  paint.right(rightFace);
  paint.top(top);
  return {
    top,
    // Face-local frames: anchor is the wall's bottom-near corner, step is how
    // far one pixel along the wall moves on screen.
    left: { anchor: isoPoint(cx, cy, u1, v0, z0), step: [-1, 0.5], span: Math.round((v1 - v0) * ISO_U) },
    right: { anchor: isoPoint(cx, cy, u0, v1, z0), step: [1, 0.5], span: Math.round((u1 - u0) * ISO_U) },
  };
}

// Paint in a wall's own coordinates: u along it, v up it.
function faceStamp(buffer, face, u, v, w, h, color) {
  for (let dv = 0; dv < h; dv += 1) {
    for (let du = 0; du < w; du += 1) {
      const t = u + du;
      const x = face.anchor[0] + t * face.step[0];
      const y = face.anchor[1] + t * face.step[1] - (v + dv);
      putPixel(buffer, atlasWidth, atlasHeight, x, y, color);
      putPixel(buffer, atlasWidth, atlasHeight, x, y + 1, color);
    }
  }
}

function grammarFor(frame) {
  const byZone = source.buildingGrammar?.[frame.zone];
  if (byZone) return byZone[String(frame.stage || 2)] || byZone["2"] || null;
  // Facilities and rewards read by silhouette: a power plant is stacks, a
  // school is a pitched roof, a depot is a long shed with a loading door.
  return source.facilityGrammar?.[frame.id?.replace(/\.night$/, "")] || null;
}

function drawFacadeOpenings(buffer, faces, mass, spec, wall, glass, seed) {
  const height = mass.z1 - mass.z0;
  const ground = spec.groundFloor ? spec.groundFloor.height : 3;
  const floors = Math.max(1, Math.floor((height - ground - 3) / spec.floorHeight));
  ["left", "right"].forEach((key, faceIndex) => {
    const face = faces[key];
    if (face.span < 8) return;
    const columns = Math.max(1, Math.floor((face.span - 6) / spec.columnPitch));
    for (let floor = 0; floor < floors; floor += 1) {
      const v = ground + floor * spec.floorHeight + 2;
      if (spec.banding) {
        faceStamp(buffer, face, 2, v + spec.floorHeight - 3, Math.max(1, face.span - 4), 1, shade(wall, -24));
      }
      for (let column = 0; column < columns; column += 1) {
        const u = 4 + column * spec.columnPitch;
        if (spec.ribbon) {
          faceStamp(buffer, face, u - 1, v - 1, Math.max(2, spec.columnPitch - 2) + 2, spec.windowHeight + 2, shade(wall, -34));
          faceStamp(buffer, face, u, v, Math.max(2, spec.columnPitch - 2), spec.windowHeight, glass);
          continue;
        }
        // A deterministic gap or two keeps a wall from reading as graph paper.
        if (spec.sparseWindows && ((seed >>> ((floor * 3 + column + faceIndex * 5) % 24)) & 7) === 0) continue;
        faceStamp(buffer, face, u - 1, v - 1, spec.windowWidth + 2, spec.windowHeight + 2, shade(wall, -34));
        faceStamp(buffer, face, u, v, spec.windowWidth, spec.windowHeight, glass);
        faceStamp(buffer, face, u, v + spec.windowHeight, spec.windowWidth, 1, shade(wall, 24));
      }
    }
  });
}

function drawGroundFloor(buffer, faces, spec, palette) {
  if (!spec.groundFloor) return;
  const { kind, height } = spec.groundFloor;
  ["left", "right"].forEach((key) => {
    const face = faces[key];
    if (face.span < 10) return;
    const span = Math.max(1, face.span - 6);
    if (kind === "shopfront") {
      faceStamp(buffer, face, 3, 3, span, Math.max(2, height - 4), palette.glassCool);
      faceStamp(buffer, face, 3, height, span, 2, palette.awning);
      faceStamp(buffer, face, 3, height + 2, span, 1, shade(palette.awning, -28));
    } else if (kind === "loading") {
      const door = Math.max(6, Math.round(span * 0.44));
      faceStamp(buffer, face, 4, 2, door, Math.max(2, height - 3), palette.door);
      faceStamp(buffer, face, 4, height - 1, door, 1, shade(palette.door, 30));
    } else {
      faceStamp(buffer, face, Math.max(1, Math.round(span / 2) - 2), 2, 5, Math.max(2, height - 2), palette.door);
    }
  });
}

// Roof furniture is the strongest "this is a city" signal per pixel spent.
function drawRoofClutter(buffer, cx, cy, mass, items, palette, seed) {
  const w = mass.u1 - mass.u0;
  const d = mass.v1 - mass.v0;
  const at = (fu, fv) => ({ u: mass.u0 + w * fu, v: mass.v0 + d * fv });
  const plain = (color) => ({
    top: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(color, 20)),
    left: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(color, -32)),
    right: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(color, -14)),
  });
  items.forEach((item, index) => {
    const jitterA = ((seed >>> (index * 3)) & 7) / 16;
    const jitterB = ((seed >>> (index * 5 + 2)) & 7) / 16;
    if (item === "tank") {
      const c = at(0.24 + jitterA, 0.26 + jitterB);
      const s = Math.min(0.16, Math.max(0.08, (mass.u1 - mass.u0) * 0.1));
      const drum = Math.max(5, Math.min(11, Math.round((mass.z1 - mass.z0) * 0.16)));
      drawMass(buffer, cx, cy, { u0: c.u - s, v0: c.v - s, u1: c.u + s, v1: c.v + s, z0: mass.z1, z1: mass.z1 + 3 }, plain(rgba("steel")));
      drawMass(buffer, cx, cy, { u0: c.u - s, v0: c.v - s, u1: c.u + s, v1: c.v + s, z0: mass.z1 + 3, z1: mass.z1 + 3 + drum }, {
        top: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(rgba("steel"), 30)),
        left: (pts) => ditherPolygon(buffer, pts, shade(rgba("steel"), -30), rgba("steel"), 0.42),
        right: (pts) => ditherPolygon(buffer, pts, shade(rgba("steel"), -12), shade(rgba("steel"), 18), 0.55),
      });
    } else if (item === "bulkhead") {
      const c = at(0.26 + jitterA, 0.6);
      drawMass(buffer, cx, cy, { u0: c.u - 0.2, v0: c.v - 0.2, u1: c.u + 0.2, v1: c.v + 0.2, z0: mass.z1, z1: mass.z1 + 9 }, plain(palette.wall));
    } else if (item === "vents") {
      for (let i = 0; i < 3; i += 1) {
        const c = at(0.2 + i * 0.26, 0.3 + (i % 2) * 0.32);
        drawMass(buffer, cx, cy, { u0: c.u - 0.09, v0: c.v - 0.09, u1: c.u + 0.09, v1: c.v + 0.09, z0: mass.z1, z1: mass.z1 + 3 }, plain(rgba("metal")));
      }
    } else if (item === "chimney") {
      const c = at(0.7, 0.28);
      drawMass(buffer, cx, cy, { u0: c.u - 0.12, v0: c.v - 0.12, u1: c.u + 0.12, v1: c.v + 0.12, z0: mass.z1 - 3, z1: mass.z1 + 8 }, plain(rgba("brick")));
    } else if (item === "stack") {
      const c = at(0.22 + jitterA + index * 0.18, 0.3 + jitterB * 0.5);
      const massHeight = mass.z1 - mass.z0;
      const tall = Math.max(20, Math.round(massHeight * 0.62)) + (((seed >>> (index * 4)) & 3) * 3);
      const r = Math.min(0.2, Math.max(0.1, (mass.u1 - mass.u0) * 0.11));
      const box = { u0: c.u - r, v0: c.v - r, u1: c.u + r, v1: c.v + r, z0: mass.z1, z1: mass.z1 + tall };
      drawMass(buffer, cx, cy, box, {
        top: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(rgba("stack"), 22)),
        left: (pts) => ditherPolygon(buffer, pts, shade(rgba("stack"), -36), shade(rgba("stack"), -8), 0.4),
        right: (pts) => ditherPolygon(buffer, pts, shade(rgba("stack"), -14), shade(rgba("stack"), 10), 0.52),
      });
      drawMass(buffer, cx, cy, { ...box, z0: box.z1 - 9, z1: box.z1 - 7 }, plain(shade(rgba("red"), -34)));
    } else if (item === "coolingTower") {
      // Three explicit drums: a wide foot, a pinched waist, a flared lip, with
      // a dark ring at the mouth. Drawn plainly on purpose — a clever tapered
      // loop rendered as a floating disc because the body faces collapsed.
      const c = at(0.28 + index * 0.4, 0.42);
      const massHeight = mass.z1 - mass.z0;
      const tall = Math.max(26, Math.round(massHeight * 0.7));
      const foot = Math.min(0.42, Math.max(0.24, (mass.u1 - mass.u0) * 0.28));
      const waist = foot * 0.7;
      const lip = foot * 0.92;
      const concrete = rgba("concrete");
      const drum = (radius, z0, z1, tone) => {
        drawMass(buffer, cx, cy, { u0: c.u - radius, v0: c.v - radius, u1: c.u + radius, v1: c.v + radius, z0, z1 }, {
          top: () => {},
          left: (pts) => ditherPolygon(buffer, pts, shade(concrete, -48 + tone), shade(concrete, -18 + tone), 0.44),
          right: (pts) => ditherPolygon(buffer, pts, shade(concrete, -20 + tone), shade(concrete, 16 + tone), 0.56),
        });
      };
      drum(foot, mass.z1, mass.z1 + tall * 0.4, 0);
      drum(waist, mass.z1 + tall * 0.4, mass.z1 + tall * 0.78, 6);
      drum(lip, mass.z1 + tall * 0.78, mass.z1 + tall, 12);
      // The mouth: a dark disc inset from the lip so the rim still reads.
      const mouth = lip * 0.72;
      fillPolygon(buffer, atlasWidth, atlasHeight, [
        isoPoint(cx, cy, c.u - mouth, c.v - mouth, mass.z1 + tall),
        isoPoint(cx, cy, c.u + mouth, c.v - mouth, mass.z1 + tall),
        isoPoint(cx, cy, c.u + mouth, c.v + mouth, mass.z1 + tall),
        isoPoint(cx, cy, c.u - mouth, c.v + mouth, mass.z1 + tall),
      ], shade(rgba("black"), 46));
    } else if (item === "sign") {
      const c = at(0.5, 0.46);
      drawMass(buffer, cx, cy, {
        u0: c.u - w * 0.3, v0: c.v - 0.03, u1: c.u + w * 0.3, v1: c.v + 0.03,
        z0: mass.z1 + 2, z1: mass.z1 + 9,
      }, plain(index % 2 ? rgba("signCool") : rgba("sign")));
    } else if (item === "antenna") {
      const c = at(0.5, 0.5);
      const [px, py] = isoPoint(cx, cy, c.u, c.v, mass.z1);
      fillRect(buffer, atlasWidth, atlasHeight, px, py - 15, 1, 15, shade(rgba("metal"), -8));
      fillRect(buffer, atlasWidth, atlasHeight, px - 2, py - 11, 5, 1, shade(rgba("metal"), -20));
      fillRect(buffer, atlasWidth, atlasHeight, px - 1, py - 16, 2, 2, rgba("red"));
    }
  });
}

function drawPitchedRoof(buffer, cx, cy, mass, roof, rise) {
  const midV = (mass.v0 + mass.v1) / 2;
  const ridgeA = isoPoint(cx, cy, mass.u0, midV, mass.z1 + rise);
  const ridgeB = isoPoint(cx, cy, mass.u1, midV, mass.z1 + rise);
  const nearL = isoPoint(cx, cy, mass.u0, mass.v1, mass.z1);
  const nearR = isoPoint(cx, cy, mass.u1, mass.v1, mass.z1);
  const farL = isoPoint(cx, cy, mass.u0, mass.v0, mass.z1);
  const farR = isoPoint(cx, cy, mass.u1, mass.v0, mass.z1);
  ditherPolygon(buffer, [farL, farR, ridgeB, ridgeA], shade(roof, -22), shade(roof, 4), 0.45);
  ditherPolygon(buffer, [nearL, nearR, ridgeB, ridgeA], shade(roof, 6), shade(roof, 34), 0.6);
  drawLine(buffer, atlasWidth, atlasHeight, ridgeA[0], ridgeA[1], ridgeB[0], ridgeB[1], shade(roof, 48), 1);
  // Eaves: a dark line under the overhang is what separates one house from the
  // next when a dozen of them sit in a row.
  drawLine(buffer, atlasWidth, atlasHeight, nearL[0], nearL[1] + 1, nearR[0], nearR[1] + 1, shade(roof, -52), 2);
}

function drawSawtoothRoof(buffer, cx, cy, mass, roof) {
  const teeth = Math.max(2, Math.round((mass.u1 - mass.u0) * 2));
  const step = (mass.u1 - mass.u0) / teeth;
  for (let i = 0; i < teeth; i += 1) {
    const a = mass.u0 + i * step;
    const b = a + step;
    fillPolygon(buffer, atlasWidth, atlasHeight, [
      isoPoint(cx, cy, a, mass.v0, mass.z1), isoPoint(cx, cy, b, mass.v0, mass.z1 + 5),
      isoPoint(cx, cy, b, mass.v1, mass.z1 + 5), isoPoint(cx, cy, a, mass.v1, mass.z1),
    ], shade(roof, -20));
    fillPolygon(buffer, atlasWidth, atlasHeight, [
      isoPoint(cx, cy, b, mass.v0, mass.z1 + 5), isoPoint(cx, cy, b, mass.v1, mass.z1 + 5),
      isoPoint(cx, cy, b, mass.v1, mass.z1), isoPoint(cx, cy, b, mass.v0, mass.z1),
    ], rgba("glassCool"));
  }
}

// A flat roof is a dark deck inside a light rim, not a concrete lid. Painting
// the parapet's whole top face was covering the roof and flattening every
// silhouette into a grey slab.
function drawHippedRoof(buffer, cx, cy, mass, roof, rise) {
  const midU = (mass.u0 + mass.u1) / 2;
  const midV = (mass.v0 + mass.v1) / 2;
  const apexA = isoPoint(cx, cy, midU - (mass.u1 - mass.u0) * 0.18, midV, mass.z1 + rise);
  const apexB = isoPoint(cx, cy, midU + (mass.u1 - mass.u0) * 0.18, midV, mass.z1 + rise);
  const c00 = isoPoint(cx, cy, mass.u0, mass.v0, mass.z1);
  const c10 = isoPoint(cx, cy, mass.u1, mass.v0, mass.z1);
  const c11 = isoPoint(cx, cy, mass.u1, mass.v1, mass.z1);
  const c01 = isoPoint(cx, cy, mass.u0, mass.v1, mass.z1);
  ditherPolygon(buffer, [c00, c10, apexB, apexA], shade(roof, -24), shade(roof, 2), 0.45);
  ditherPolygon(buffer, [c01, c11, apexB, apexA], shade(roof, 8), shade(roof, 36), 0.6);
  fillPolygon(buffer, atlasWidth, atlasHeight, [c10, c11, apexB], shade(roof, -6));
  fillPolygon(buffer, atlasWidth, atlasHeight, [c00, c01, apexA], shade(roof, -34));
  drawLine(buffer, atlasWidth, atlasHeight, apexA[0], apexA[1], apexB[0], apexB[1], shade(roof, 48), 1);
  drawLine(buffer, atlasWidth, atlasHeight, c01[0], c01[1] + 1, c11[0], c11[1] + 1, shade(roof, -52), 2);
}

// A raised centre block on a flat roof: the stepped-parapet skyline.
function drawRoofStep(buffer, cx, cy, mass, wall) {
  const s = 0.2;
  drawMass(buffer, cx, cy, {
    u0: mass.u0 + s, v0: mass.v0 + s, u1: mass.u1 - s, v1: mass.v1 - s,
    z0: mass.z1 + 2, z1: mass.z1 + 8,
  }, {
    top: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, rgba("parapet")),
    left: (pts) => ditherPolygon(buffer, pts, shade(wall, -34), wall, 0.44),
    right: (pts) => ditherPolygon(buffer, pts, shade(wall, -12), shade(wall, 20), 0.52),
  });
}

function drawFlatRoof(buffer, cx, cy, mass, wall) {
  drawMass(buffer, cx, cy, { ...mass, z0: mass.z1, z1: mass.z1 + 2 }, {
    top: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, rgba("parapet")),
    left: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(wall, -36)),
    right: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(wall, -18)),
  });
  const rim = 0.09;
  const deck = rgba("roofDeck");
  const inner = [
    isoPoint(cx, cy, mass.u0 + rim, mass.v0 + rim, mass.z1 + 2),
    isoPoint(cx, cy, mass.u1 - rim, mass.v0 + rim, mass.z1 + 2),
    isoPoint(cx, cy, mass.u1 - rim, mass.v1 - rim, mass.z1 + 2),
    isoPoint(cx, cy, mass.u0 + rim, mass.v1 - rim, mass.z1 + 2),
  ];
  ditherPolygon(buffer, inner, shade(deck, -14), shade(deck, 12), 0.5);
}

// Massing: where the silhouettes come from. A variant picks one of these, so
// four buildings of the same stage no longer share an outline.
function massesFor(frame, grammar, seed) {
  const fw = Math.min(2.35, frame.footprint[0]);
  const fd = Math.min(2.35, frame.footprint[1]);
  const inset = grammar.inset ?? 0.07;
  const u0 = -fw / 2 + inset, v0 = -fd / 2 + inset;
  const u1 = fw / 2 - inset, v1 = fd / 2 - inset;
  const height = Math.min(70, frame.height);
  const forms = grammar.massing;
  const form = forms[(frame.variant - 1) % forms.length];
  const wobble = ((seed >>> 6) & 7) / 40;
  if (form === "setback" && height > 24) {
    const split = height * (0.5 + wobble);
    const s = 0.14 + wobble;
    return [
      { u0, v0, u1, v1, z0: 0, z1: split },
      { u0: u0 + s, v0: v0 + s, u1: u1 - s, v1: v1 - s, z0: split, z1: height },
    ];
  }
  if (form === "twin" && fw > 1.2) {
    const mid = (u0 + u1) / 2;
    const gap = 0.08;
    return [
      { u0, v0, u1: mid - gap, v1, z0: 0, z1: height },
      { u0: mid + gap, v0, u1, v1, z0: 0, z1: height * (0.6 + wobble) },
    ];
  }
  if (form === "wing") {
    const cut = v0 + (v1 - v0) * (0.54 + wobble);
    return [
      { u0, v0, u1, v1: cut, z0: 0, z1: height },
      { u0, v0: cut, u1, v1, z0: 0, z1: Math.max(10, height * (0.44 + wobble)) },
    ];
  }
  if (form === "courtyard" && fw > 1.2) {
    // Four bars around a light well: the block that reads as a real perimeter.
    const t = 0.26 + wobble * 0.4;
    return [
      { u0, v0, u1, v1: v0 + (v1 - v0) * t, z0: 0, z1: height },
      { u0, v0: v1 - (v1 - v0) * t, u1, v1, z0: 0, z1: height * (0.9 + wobble) },
      { u0, v0, u1: u0 + (u1 - u0) * t, v1, z0: 0, z1: height * (0.86 + wobble) },
      { u0: u1 - (u1 - u0) * t, v0, u1, v1, z0: 0, z1: height * (0.94 + wobble) },
    ];
  }
  if (form === "podium" && height > 30) {
    // A wide skirt with a slim tower: the downtown silhouette.
    const skirt = Math.max(10, height * (0.26 + wobble));
    const s = 0.3 + wobble;
    return [
      { u0, v0, u1, v1, z0: 0, z1: skirt },
      { u0: u0 + s, v0: v0 + s, u1: u1 - s, v1: v1 - s, z0: skirt, z1: height },
    ];
  }
  if (form === "stepped" && height > 26) {
    const s = 0.13 + wobble * 0.5;
    const a = height * (0.4 + wobble);
    const b = height * (0.72 + wobble * 0.5);
    return [
      { u0, v0, u1, v1, z0: 0, z1: a },
      { u0: u0 + s, v0: v0 + s, u1: u1 - s, v1: v1 - s, z0: a, z1: b },
      { u0: u0 + s * 2, v0: v0 + s * 2, u1: u1 - s * 2, v1: v1 - s * 2, z0: b, z1: height },
    ];
  }
  if (form === "gable") {
    // A house with a projecting front gable — the small-lot silhouette.
    const t = 0.42 + wobble;
    return [
      { u0, v0, u1, v1, z0: 0, z1: height },
      { u0: u0 + (u1 - u0) * 0.22, v0: v1 - 0.06, u1: u0 + (u1 - u0) * 0.72, v1: v1 + 0.16, z0: 0, z1: height * t },
    ];
  }
  return [{ u0, v0, u1, v1, z0: 0, z1: height }];
}

function drawBuilding(buffer, frame, cx, cy, directionIndex) {
  let base = rgba(frame.base);
  let light = rgba(frame.light);
  const night = frame.state === "night";
  if (frame.state === "declined") { base = shade(base, -34); light = shade(light, -42); }
  if (frame.state === "abandoned") { base = rgba("abandoned"); light = shade(base, 22); }
  if (night) { base = shade(base, -58); light = shade(light, -42); }
  if (frame.state === "foundation") {
    drawIsoBox(buffer, cx, cy, frame.footprint, 5, rgba("concrete"), shade(rgba("concrete"), -24), shade(rgba("concrete"), -42), directionIndex);
    return;
  }

  const grammar = grammarFor(frame);
  if (!grammar) {
    // Facilities and catalog pieces that carry no zone keep the plain box.
    const height = Math.min(68, frame.height);
    const box = drawIsoBox(buffer, cx, cy, frame.footprint, height, light, base, shade(base, -34), directionIndex);
    drawFacadeDetails(buffer, cx, cy, box, base, light);
    return;
  }

  const seed = hashString(`${frame.id}:${directionIndex}`);
  const drift = (((seed >>> 9) & 15) - 7) * 2;
  const walls = grammar.walls;
  const chosen = walls?.length ? rgba(walls[((frame.variant - 1) * 5) % walls.length]) : base;
  let wall = shade(chosen, drift);
  if (frame.state === "declined") wall = shade(wall, -34);
  if (frame.state === "abandoned") wall = rgba("abandoned");
  if (night) wall = shade(wall, -58);
  const wallLight = shade(wall, 26);
  const glass = night ? rgba("windowNight") : frame.state === "abandoned" ? rgba("black")
    : frame.state === "construction" ? rgba("construction") : rgba("glass");
  const palette = {
    glassCool: night ? shade(rgba("glassCool"), -46) : rgba("glassCool"),
    awning: frame.zone === "commercial" && (frame.variant % 2) ? rgba("awningAlt") : rgba("awning"),
    door: rgba("door"),
    wall,
  };

  const masses = massesFor(frame, grammar, seed);
  // Painter order: the mass whose far corner is deepest is laid down first.
  masses.sort((a, b) => (a.u0 + a.v0) - (b.u0 + b.v0));
  const tallest = Math.max(...masses.map((mass) => mass.z1));

  masses.forEach((mass) => {
    const faces = drawMass(buffer, cx, cy, mass, {
      top: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(wallLight, 8)),
      left: (pts) => ditherPolygon(buffer, pts, shade(wall, -34), wall, 0.44),
      right: (pts) => ditherPolygon(buffer, pts, shade(wall, -12), wallLight, 0.52),
    });
    const rhythms = grammar.rhythms;
    const rhythm = rhythms?.length ? rhythms[((frame.variant - 1) * 7) % rhythms.length] : {};
    drawFacadeOpenings(buffer, faces, mass, { ...grammar, ...rhythm }, wall, glass, seed);
    if (mass.z1 === tallest) drawGroundFloor(buffer, faces, grammar, palette);

    // Massing, roof, wall colour and window rhythm are indexed by different
    // primes, so twenty-four variants sample the combinations instead of
    // marching through them in lockstep.
    const roofForm = grammar.roof[((frame.variant - 1) * 3) % grammar.roof.length];
    const roofSet = grammar.roofColors;
    const roofColor = night ? rgba("roofDark")
      : roofSet?.length ? rgba(roofSet[((frame.variant - 1) * 11) % roofSet.length]) : rgba("roofTile");
    if (roofForm === "pitched") drawPitchedRoof(buffer, cx, cy, mass, roofColor, grammar.roofRise || 8);
    else if (roofForm === "hipped") drawHippedRoof(buffer, cx, cy, mass, roofColor, grammar.roofRise || 8);
    else if (roofForm === "sawtooth") drawSawtoothRoof(buffer, cx, cy, mass, roofColor);
    else if (roofForm === "stepped") { drawFlatRoof(buffer, cx, cy, mass, wall); drawRoofStep(buffer, cx, cy, mass, wall); }
    else drawFlatRoof(buffer, cx, cy, mass, wall);

    if (mass.z1 === tallest && grammar.clutter?.length && frame.state !== "construction") {
      const massHeight = mass.z1 - mass.z0;
      const massWidth = Math.min(mass.u1 - mass.u0, mass.v1 - mass.v0);
      // Tall furniture needs a tall building under it; a small roof gets vents
      // and a chimney and nothing more.
      const allowed = grammar.clutter.filter((item) => {
        if (item === "stack" || item === "coolingTower") return massHeight >= 26;
        if (item === "tank") return massHeight >= 34 && massWidth >= 0.9;
        if (item === "antenna") return massHeight >= 44;
        if (item === "sign") return massWidth >= 0.9;
        if (item === "bulkhead") return massHeight >= 22;
        return true;
      });
      if (allowed.length) {
        const identity = allowed.some((item) => item === "stack" || item === "coolingTower");
        const cap = identity ? allowed.length : massHeight >= 44 ? allowed.length : massHeight >= 26 ? 2 : 1;
        const count = identity
          ? Math.min(allowed.length, 3)
          : 1 + ((seed >>> 3) % Math.max(1, Math.min(cap, allowed.length)));
        const items = [];
        for (let i = 0; i < count; i += 1) items.push(allowed[(frame.variant - 1 + i) % allowed.length]);
        drawRoofClutter(buffer, cx, cy, mass, items, palette, seed);
      }
    }
  });

  if (frame.state === "construction") {
    const height = Math.min(70, frame.height);
    drawLine(buffer, atlasWidth, atlasHeight, cx - 22, cy + 2, cx - 12, cy - height, rgba("construction"), 2);
    drawLine(buffer, atlasWidth, atlasHeight, cx + 22, cy + 2, cx + 12, cy - height, rgba("construction"), 2);
  }
  if (frame.state === "recovering") {
    fillRect(buffer, atlasWidth, atlasHeight, cx - 10, cy - Math.min(70, frame.height) - 6, 20, 4, rgba("treeLight"));
  }
}

// Open-air pieces: a low lawn or apron with markings and planting, rather than
// a solid slab the height of a building. A park drawn as a green box is the
// single flattest thing on the map.
function drawOpenAir(buffer, frame, cx, cy, directionIndex) {
  const id = frame.id.replace(/\.night$/, "");
  const night = frame.state === "night";
  const seed = hashString(`${id}:${directionIndex}`);
  const foot = frame.footprint?.[0] || 1;
  const pad = { u0: -foot / 2 + 0.05, v0: -foot / 2 + 0.05, u1: foot / 2 - 0.05, v1: foot / 2 - 0.05, z0: 0, z1: 3 };
  const lawn = night ? shade(rgba("grass"), -46) : rgba("grass");
  const apron = night ? shade(rgba("concrete"), -50) : rgba("concrete");
  const surface = id === "catalog.runway" || id === "catalog.tarmac" ? apron : lawn;
  drawMass(buffer, cx, cy, pad, {
    top: (pts) => ditherPolygon(buffer, pts, shade(surface, -12), shade(surface, 12), 0.5),
    left: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(surface, -34)),
    right: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(surface, -18)),
  });
  if (id === "catalog.runway") {
    // A centre line with dashes, running along the tile's own axis.
    const a = isoPoint(cx, cy, pad.u0, 0, pad.z1);
    const b = isoPoint(cx, cy, pad.u1, 0, pad.z1);
    drawLine(buffer, atlasWidth, atlasHeight, a[0], a[1], b[0], b[1], shade(rgba("white"), night ? -60 : 0), 2);
    return;
  }
  if (id === "catalog.tarmac") {
    for (let i = -1; i <= 1; i += 1) {
      const a = isoPoint(cx, cy, pad.u0, i * 0.3, pad.z1);
      const b = isoPoint(cx, cy, pad.u1, i * 0.3, pad.z1);
      drawLine(buffer, atlasWidth, atlasHeight, a[0], a[1], b[0], b[1], shade(rgba("yellow"), night ? -50 : -10), 1);
    }
    return;
  }
  // Park and zoo grounds: a winding path plus planting, so the piece reads as
  // somewhere you could walk.
  const path = shade(rgba("sand"), night ? -50 : 0);
  const pa = isoPoint(cx, cy, pad.u0, pad.v1 * 0.2, pad.z1);
  const pb = isoPoint(cx, cy, pad.u1 * 0.2, pad.v0, pad.z1);
  const pc = isoPoint(cx, cy, pad.u1, pad.v1 * 0.35, pad.z1);
  drawLine(buffer, atlasWidth, atlasHeight, pa[0], pa[1], pb[0], pb[1], path, 3);
  drawLine(buffer, atlasWidth, atlasHeight, pb[0], pb[1], pc[0], pc[1], path, 3);
  const planting = 4 + (seed % 3);
  for (let i = 0; i < planting; i += 1) {
    const fu = ((seed >>> (i * 3)) % 100) / 100 - 0.5;
    const fv = ((seed >>> (i * 5 + 1)) % 100) / 100 - 0.5;
    const [tx, ty] = isoPoint(cx, cy, fu * foot * 0.8, fv * foot * 0.8, pad.z1);
    drawTree(buffer, { ...frame, variant: 1 + (i % 3), kind: "tree" }, tx, ty, directionIndex);
  }
}

// The rewards are trophies. A stadium, a dome and an arcology drawn as ordinary
// blocks with roof furniture look like offices, so each gets its own body.
function drawDomeShell(buffer, cx, cy, radius, baseZ, height, skin, glassTone) {
  const steps = 6;
  for (let step = 0; step < steps; step += 1) {
    const t = step / steps;
    const tNext = (step + 1) / steps;
    // A hemisphere sampled as stacked drums: radius follows the circle.
    const r0 = radius * Math.cos((t * Math.PI) / 2);
    const r1 = radius * Math.cos((tNext * Math.PI) / 2);
    const r = Math.max(r1, r0 * 0.98);
    drawMass(buffer, cx, cy, {
      u0: -r, v0: -r, u1: r, v1: r,
      z0: baseZ + height * t, z1: baseZ + height * tNext,
    }, {
      top: (pts) => { if (step === steps - 1) ditherPolygon(buffer, pts, shade(skin, -6), shade(skin, 26), 0.6); },
      left: (pts) => ditherPolygon(buffer, pts, shade(skin, -40), shade(skin, -6), 0.42 + t * 0.2),
      right: (pts) => ditherPolygon(buffer, pts, shade(skin, -14), shade(skin, 20), 0.54 + t * 0.2),
    });
    // Meridian glazing every other band gives the shell its scale.
    if (step % 2 === 0) {
      const [gx, gy] = isoPoint(cx, cy, 0, r, baseZ + height * t);
      fillRect(buffer, atlasWidth, atlasHeight, gx - 3, gy - 3, 6, 2, glassTone);
    }
  }
}

function drawStadium(buffer, frame, cx, cy, directionIndex) {
  const night = frame.state === "night";
  const foot = Math.min(2.35, frame.footprint?.[0] || 3);
  const outer = foot / 2 - 0.08;
  const inner = outer * 0.56;
  const wall = night ? shade(rgba("concrete"), -52) : rgba("concrete");
  const pitch = night ? shade(rgba("grass"), -50) : rgba("grass");
  // A raked bowl: four stand segments around an open pitch.
  const stands = [
    { u0: -outer, v0: -outer, u1: outer, v1: -inner },
    { u0: -outer, v0: inner, u1: outer, v1: outer },
    { u0: -outer, v0: -inner, u1: -inner, v1: inner },
    { u0: inner, v0: -inner, u1: outer, v1: inner },
  ];
  // The pitch sits low, inside the ring.
  drawMass(buffer, cx, cy, { u0: -inner, v0: -inner, u1: inner, v1: inner, z0: 0, z1: 3 }, {
    top: (pts) => ditherPolygon(buffer, pts, shade(pitch, -10), shade(pitch, 14), 0.55),
    left: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(pitch, -30)),
    right: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(pitch, -18)),
  });
  stands.forEach((stand, index) => {
    drawMass(buffer, cx, cy, { ...stand, z0: 0, z1: 22 + (index % 2) * 4 }, {
      top: (pts) => ditherPolygon(buffer, pts, shade(wall, -12), shade(wall, 16), 0.5),
      left: (pts) => ditherPolygon(buffer, pts, shade(wall, -40), shade(wall, -6), 0.44),
      right: (pts) => ditherPolygon(buffer, pts, shade(wall, -18), shade(wall, 14), 0.56),
    });
  });
  // Floodlight masts at the corners; lit at night.
  [[-outer, -outer], [outer, -outer], [-outer, outer], [outer, outer]].forEach(([u, v]) => {
    const [px, py] = isoPoint(cx, cy, u, v, 26);
    fillRect(buffer, atlasWidth, atlasHeight, px - 1, py - 12, 2, 12, rgba("metal"));
    fillRect(buffer, atlasWidth, atlasHeight, px - 4, py - 15, 9, 3, night ? rgba("windowNight") : shade(rgba("white"), -14));
  });
}

function drawArcology(buffer, frame, cx, cy, directionIndex) {
  const night = frame.state === "night";
  const foot = Math.min(2.35, frame.footprint?.[0] || 3);
  const skin = night ? shade(rgba("comTeal"), -50) : rgba("comTeal");
  const lit = night ? rgba("windowNight") : rgba("glassCool");
  const tiers = 5;
  const height = 78;
  for (let tier = 0; tier < tiers; tier += 1) {
    const t = tier / tiers;
    const r = (foot / 2 - 0.06) * (1 - t * 0.62);
    const z0 = height * t;
    const z1 = height * ((tier + 1) / tiers);
    drawMass(buffer, cx, cy, { u0: -r, v0: -r, u1: r, v1: r, z0, z1 }, {
      top: (pts) => { if (tier === tiers - 1) ditherPolygon(buffer, pts, shade(skin, -8), shade(skin, 24), 0.6); },
      left: (pts) => ditherPolygon(buffer, pts, shade(skin, -42), shade(skin, -8), 0.44),
      right: (pts) => ditherPolygon(buffer, pts, shade(skin, -16), shade(skin, 18), 0.56),
    });
    // A lit band at every setback: the megastructure's signature.
    const [bx, by] = isoPoint(cx, cy, 0, r, z1 - 3);
    fillRect(buffer, atlasWidth, atlasHeight, bx - Math.round(r * 20), by - 2, Math.max(4, Math.round(r * 40)), 2, lit);
  }
  const [tx, ty] = isoPoint(cx, cy, 0, 0, height);
  fillRect(buffer, atlasWidth, atlasHeight, tx - 1, ty - 16, 2, 16, rgba("metal"));
  fillRect(buffer, atlasWidth, atlasHeight, tx - 2, ty - 18, 5, 3, rgba("red"));
}

function drawFacility(buffer, frame, cx, cy, directionIndex) {
  const bare = frame.id.replace(/\.night$/, "");
  const openAir = ["catalog.park_big", "catalog.runway", "catalog.tarmac"];
  if (openAir.includes(bare)) {
    drawOpenAir(buffer, frame, cx, cy, directionIndex);
    return;
  }
  if (bare === "catalog.stadium") { drawStadium(buffer, frame, cx, cy, directionIndex); return; }
  if (bare === "catalog.arcology") { drawArcology(buffer, frame, cx, cy, directionIndex); return; }
  if (bare === "catalog.dome") {
    const night = frame.state === "night";
    const skin = night ? shade(rgba("parapet"), -52) : rgba("parapet");
    const foot = Math.min(2.35, frame.footprint?.[0] || 2);
    drawMass(buffer, cx, cy, { u0: -foot / 2 + 0.1, v0: -foot / 2 + 0.1, u1: foot / 2 - 0.1, v1: foot / 2 - 0.1, z0: 0, z1: 8 }, {
      top: () => {},
      left: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(skin, -40)),
      right: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(skin, -18)),
    });
    drawDomeShell(buffer, cx, cy, foot / 2 - 0.14, 8, 30, skin, night ? rgba("windowNight") : rgba("glassCool"));
    return;
  }
  if (frame.id === "catalog.pier" || frame.id === "catalog.marina"
    || frame.id === "catalog.pier.night" || frame.id === "catalog.marina.night") {
    drawBuilding(buffer, { ...frame, stage: 2 }, cx, cy, directionIndex);
    drawTorii(buffer, cx, cy, frame.state === "night");
    return;
  }
  if (frame.id === "catalog.church" || frame.id === "catalog.church.night") {
    // Zen temple: a tiered pagoda silhouette — three stacked roofs narrowing
    // to a spire, the Japanese Minecraft reading of the landmark.
    const night = frame.state === "night";
    const wall = night ? shade(rgba(frame.base), -30) : rgba(frame.base);
    const roof = night ? rgba("roofDark") : rgba("roofTile");
    const roofW = [34, 26, 18];
    const bodyW = [22, 16, 11];
    let baseY = cy - 4;
    for (let tier = 0; tier < 3; tier += 1) {
      const bodyTop = baseY - (16 - tier * 3);
      fillRect(buffer, atlasWidth, atlasHeight, cx - bodyW[tier] / 2, bodyTop, bodyW[tier], 16 - tier * 3, wall);
      fillPolygon(buffer, atlasWidth, atlasHeight, [
        [cx, bodyTop - 5], [cx + roofW[tier] / 2, bodyTop + 2], [cx, bodyTop + 9], [cx - roofW[tier] / 2, bodyTop + 2],
      ], roof);
      baseY = bodyTop - 5;
    }
    drawLine(buffer, atlasWidth, atlasHeight, cx, baseY - 2, cx, baseY - 14, rgba("metal"), 2);
    return;
  }
  if (frame.kind === "wind") {
    drawLine(buffer, atlasWidth, atlasHeight, cx, cy + 5, cx, cy - 54, rgba("metal"), 5);
    const rotor = directionIndex % 2 ? 9 : 0;
    drawLine(buffer, atlasWidth, atlasHeight, cx - 20, cy - 45 - rotor, cx + 20, cy - 63 + rotor, rgba("white"), 4);
    drawLine(buffer, atlasWidth, atlasHeight, cx - 8, cy - 67 + rotor, cx + 8, cy - 41 - rotor, rgba("white"), 4);
    if (frame.state === "night") fillRect(buffer, atlasWidth, atlasHeight, cx - 2, cy - 62, 4, 4, rgba("windowNight"));
    return;
  }
  if (frame.kind === "tower") {
    drawLine(buffer, atlasWidth, atlasHeight, cx - 15, cy + 7, cx - 7, cy - 40, rgba("metal"), 4);
    drawLine(buffer, atlasWidth, atlasHeight, cx + 15, cy + 7, cx + 7, cy - 40, rgba("metal"), 4);
    fillRect(buffer, atlasWidth, atlasHeight, cx - 15, cy - 55, 30, 17, rgba("pipe"));
    if (frame.state === "night") fillRect(buffer, atlasWidth, atlasHeight, cx - 2, cy - 58, 4, 4, rgba("windowNight"));
    return;
  }
  drawBuilding(buffer, { ...frame, state: frame.state === "night" ? "night" : "normal", stage: 2 }, cx, cy, directionIndex);
  if (frame.id === "facility.clinic") {
    fillRect(buffer, atlasWidth, atlasHeight, cx - 3, cy - frame.height - 11, 6, 15, rgba("red"));
    fillRect(buffer, atlasWidth, atlasHeight, cx - 8, cy - frame.height - 6, 16, 6, rgba("red"));
  }
}

// Moving things were screen-axis rectangles: a car was a 12x8 box drawn flat
// against the screen while the road it sat on ran diagonally, so traffic read
// as confetti scattered over the street. They are small oriented prisms now,
// aligned with the tile axis the road follows, with a cabin, a windscreen and
// a contact shadow.
function drawAgent(buffer, frame, cx, cy, directionIndex) {
  const palette = [rgba("red"), rgba("commercial"), rgba("yellow"), rgba("white")];

  if (frame.kind === "pedestrian") {
    fillPolygon(buffer, atlasWidth, atlasHeight, [
      [cx - 3, cy + 1], [cx, cy + 3], [cx + 3, cy + 1], [cx, cy - 1],
    ], shade(rgba("black"), 58));
    const shirt = palette[frame.variant % palette.length];
    fillRect(buffer, atlasWidth, atlasHeight, cx - 1, cy - 7, 3, 4, shirt);
    fillRect(buffer, atlasWidth, atlasHeight, cx - 1, cy - 9, 3, 2, shade(rgba("sand"), -10));
    fillRect(buffer, atlasWidth, atlasHeight, cx, cy - 3, 2, 4, rgba("black"));
    return;
  }

  if (frame.kind === "smoke") {
    // Dithered puffs that thin out as they rise, rather than two flat bars.
    const gray = shade(rgba("metal"), -frame.variant * 10);
    const puffs = [
      { x: cx - 1, y: cy - 12, r: 6, mix: 0.62 },
      { x: cx - 4 + frame.variant * 2, y: cy - 21, r: 7, mix: 0.46 },
      { x: cx - 7 + frame.variant * 3, y: cy - 30, r: 8, mix: 0.3 },
    ];
    puffs.forEach((puff) => {
      ditherPolygon(buffer, [
        [puff.x, puff.y - puff.r], [puff.x + puff.r, puff.y],
        [puff.x, puff.y + puff.r * 0.8], [puff.x - puff.r, puff.y],
      ], shade(gray, -18), shade(gray, 22), puff.mix);
    });
    return;
  }

  // Vehicles run along one of the two ground axes, chosen by the rotation so a
  // car always points the way its road goes.
  const alongU = directionIndex % 2 === 0;
  const long = frame.kind === "train" ? 0.92 : frame.kind === "service" ? 0.52 : 0.44;
  const wide = frame.kind === "train" ? 0.22 : 0.24;
  const body = frame.kind === "service" ? palette[frame.variant % 3] : palette[(frame.variant - 1) % palette.length];
  const mass = alongU
    ? { u0: -long / 2, v0: -wide / 2, u1: long / 2, v1: wide / 2, z0: 1, z1: frame.kind === "train" ? 9 : 6 }
    : { u0: -wide / 2, v0: -long / 2, u1: wide / 2, v1: long / 2, z0: 1, z1: frame.kind === "train" ? 9 : 6 };

  fillPolygon(buffer, atlasWidth, atlasHeight, [
    isoPoint(cx, cy, mass.u0, mass.v0, 0), isoPoint(cx, cy, mass.u1, mass.v0, 0),
    isoPoint(cx, cy, mass.u1, mass.v1, 0), isoPoint(cx, cy, mass.u0, mass.v1, 0),
  ], shade(rgba("black"), 56));

  drawMass(buffer, cx, cy, mass, {
    top: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(body, 22)),
    left: (pts) => ditherPolygon(buffer, pts, shade(body, -34), body, 0.46),
    right: (pts) => ditherPolygon(buffer, pts, shade(body, -14), shade(body, 16), 0.56),
  });

  // A cabin band and a windscreen so the thing has a front.
  const cabin = alongU
    ? { u0: -long * 0.12, v0: mass.v0, u1: long * 0.3, v1: mass.v1, z0: mass.z1, z1: mass.z1 + 3 }
    : { u0: mass.u0, v0: -long * 0.12, u1: mass.u1, v1: long * 0.3, z0: mass.z1, z1: mass.z1 + 3 };
  drawMass(buffer, cx, cy, cabin, {
    top: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(body, 8)),
    left: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, rgba("glass")),
    right: (pts) => fillPolygon(buffer, atlasWidth, atlasHeight, pts, shade(rgba("glass"), -18)),
  });

  if (frame.kind === "service") {
    const [lx, ly] = isoPoint(cx, cy, 0, 0, mass.z1 + 4);
    fillRect(buffer, atlasWidth, atlasHeight, lx - 2, ly - 1, 5, 2, frame.variant === 2 ? rgba("red") : rgba("white"));
  }
  if (frame.kind === "train") {
    // Coach joints, so a train is not one long slab.
    for (const t of [-0.18, 0.18]) {
      const a = alongU ? isoPoint(cx, cy, long * t, mass.v0, mass.z1) : isoPoint(cx, cy, mass.u0, long * t, mass.z1);
      const b = alongU ? isoPoint(cx, cy, long * t, mass.v1, mass.z1) : isoPoint(cx, cy, mass.u1, long * t, mass.z1);
      drawLine(buffer, atlasWidth, atlasHeight, a[0], a[1], b[0], b[1], shade(body, -40), 1);
    }
  }
}

function drawSprite(buffer, frame, slot, directionIndex) {
  const col = slot % columns;
  const row = Math.floor(slot / columns);
  const cx = col * CELL_W + anchor.x;
  const cy = row * CELL_H + anchor.y;
  if (frame.category === "slope") drawSlope(buffer, frame, cx, cy, directionIndex);
  else if (frame.category === "terrain") drawTerrain(buffer, frame, cx, cy, directionIndex);
  else if (frame.category === "connector") drawConnector(buffer, frame, cx, cy, directionIndex);
  else if (frame.kind === "tree") drawTree(buffer, frame, cx, cy, directionIndex);
  else if (frame.kind === "pipe") drawConnector(buffer, { ...frame, shape: "cross", color: "pipe", accent: "waterLight" }, cx, cy, directionIndex);
  else if (frame.category === "building") drawBuilding(buffer, frame, cx, cy, directionIndex);
  else if (frame.category === "facility" || frame.category === "catalog") drawFacility(buffer, frame, cx, cy, directionIndex);
  else if (frame.category === "agent") drawAgent(buffer, frame, cx, cy, directionIndex);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    let current = (crc ^ buffer[index]) & 0xff;
    for (let bit = 0; bit < 8; bit += 1) current = current & 1 ? (current >>> 1) ^ 0xedb88320 : current >>> 1;
    crc = (crc >>> 8) ^ current;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    pixels.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

await mkdir(assetsDir, { recursive: true });
await mkdir(generatedDir, { recursive: true });

const files = {};
let northPixelBuffer = null;
for (let directionIndex = 0; directionIndex < directions.length; directionIndex += 1) {
  const direction = directions[directionIndex];
  const pixels = Buffer.alloc(atlasWidth * atlasHeight * 4);
  sprites.forEach((frame, slot) => drawSprite(pixels, frame, slot, directionIndex));
  if (direction === "north") northPixelBuffer = pixels;
  const png = encodePng(atlasWidth, atlasHeight, pixels);
  const filename = `atlas-${direction}.png`;
  await writeFile(path.join(assetsDir, filename), png);
  files[direction] = { url: `/assets/bonsai/${filename}`, file: `assets/bonsai/${filename}`, sha256: digest(png) };
  if (direction === "north") await writeFile(path.join(assetsDir, "atlas.png"), png);
}

const frames = {};
sprites.forEach((frame, slot) => {
  frames[frame.id] = {
    x: (slot % columns) * CELL_W,
    y: Math.floor(slot / columns) * CELL_H,
    w: CELL_W,
    h: CELL_H,
    footprint: { w: frame.footprint[0], h: frame.footprint[1] },
    anchor,
    height: frame.height,
    state: frame.state,
    animation: frame.animation,
    variant: frame.variant,
    category: frame.category,
    zone: frame.zone || null,
    stage: frame.stage || 0,
    density: frame.density || null,
    license: frame.license,
    source: frame.source,
    ...(frame.state === "night" ? { windows: nightWindowRects(frame) } : {}),
  };
});

const metadata = {
  schema: "ai-system-6-bonsai-atlas-v2",
  version: 2,
  geometry: {
    tileWidth: geometry.tileWidth,
    tileHeight: geometry.tileHeight,
    heightStep: geometry.heightStep,
  },
  atlas: { width: atlasWidth, height: atlasHeight, cellWidth: CELL_W, cellHeight: CELL_H, columns, rows },
  directions: files,
  frames,
  completeness: {
    frameCount: sprites.length,
    normalBuildingVariants: sprites.filter((frame) => frame.category === "building" && frame.state === "normal").length,
    nightFrames: sprites.filter((frame) => frame.state === "night").length,
    buildingStates: [...new Set(sprites.filter((frame) => frame.category === "building").map((frame) => frame.state))],
    categories: [...new Set(sprites.map((frame) => frame.category))],
  },
  license: "MIT",
  source: "original",
};

await writeFile(path.join(assetsDir, "atlas-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);

const generated = `// Generated by tooling/build-bonsai-atlas.mjs. Do not edit by hand.\n` +
  `// Original MIT-clean art; source and provenance live under assets/bonsai/.\n` +
  `(function installBonsaiAtlas(){\"use strict\";const data=${JSON.stringify(metadata)};` +
  `Object.freeze(data.geometry);Object.freeze(data.atlas);Object.values(data.directions).forEach(Object.freeze);` +
  `Object.freeze(data.directions);Object.values(data.frames).forEach((frame)=>{Object.freeze(frame.footprint);Object.freeze(frame.anchor);Object.freeze(frame);});` +
  `Object.freeze(data.frames);Object.freeze(data.completeness.buildingStates);Object.freeze(data.completeness.categories);Object.freeze(data.completeness);` +
  `window.AISystem6BonsaiAtlas=Object.freeze(data);})();\n`;
await writeFile(path.join(generatedDir, "bonsai-atlas.js"), generated);

const provenance = {
  asset: "Bonsai City Canvas 2D isometric atlas family",
  files: Object.values(files).map(({ file, sha256 }) => ({ file, sha256 })),
  metadata: "assets/bonsai/atlas-metadata.json",
  sourceFile: "assets/bonsai/atlas-source.json",
  author: "AI System 6 (original, agent-authored)",
  date: source.authoredAt,
  tool: "tooling/build-bonsai-atlas.mjs (JSON micro-voxel recipes + deterministic PNG encoder)",
  license: "MIT",
  source: "original",
  notes: [
    "Original isometric pixel art composed from project-owned grammar: massing (single, setback, twin, wing, courtyard, podium, stepped, gable), roof form (flat deck with parapet, pitched, hipped, sawtooth, stepped), roof furniture (tank, stair bulkhead, vents, chimney, stack, sign, antenna), facade treatment (punched or ribbon windows, floor banding, shopfront, loading bay, door) and ordered-dither shading.",
    "No pixels copied, traced, sampled, measured from, or converted from any external game or artwork; the reference authorized by the 2026-08-24 amendment was not consulted for this build.",
    "Massing, roof form, wall colour and window rhythm are indexed by different primes of the variant number, so twenty-four variants per stage sample the combinations instead of repeating a handful of silhouettes.",
    "The generator has no network path and no wall clock, and reads only the checked-in source recipe; a rebuild is byte-identical.",
    "All four rotations share frame ids and dimensions; direction-specific light and small asymmetries are generated deliberately.",
  ],
};
await writeFile(path.join(assetsDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);

// --- review preview -------------------------------------------------------
//
// A generated street so the art can be judged the way a player sees it: many
// buildings at once, in isometric order, on textured ground. This is review
// evidence, not a shipped asset, and it is rebuilt from the same buffers the
// atlas was drawn from.
{
  const evidenceDir = path.join(repositoryRoot, "internal", "evidence");
  // A fresh public clone has no internal/ tree and the public gate forbids
  // creating one; these previews are maintainer evidence, so they are only
  // written where that evidence directory already exists.
  const writesEvidence = existsSync(evidenceDir);
  const slotOf = new Map(sprites.map((frame, slot) => [frame.id, slot]));
  const northPixels = northPixelBuffer;
  const previewCols = 26;
  const previewRows = 26;
  const previewWidth = 1500;
  const previewHeight = 1000;
  const preview = Buffer.alloc(previewWidth * previewHeight * 4);
  // A quiet ground so the city, not the page, carries the picture.
  for (let i = 0; i < previewWidth * previewHeight; i += 1) {
    preview[i * 4] = 14; preview[i * 4 + 1] = 18; preview[i * 4 + 2] = 22; preview[i * 4 + 3] = 255;
  }
  const blit = (frameId, sx, sy) => {
    const slot = slotOf.get(frameId);
    if (slot === undefined) return;
    const col = slot % columns;
    const row = Math.floor(slot / columns);
    const ox = col * CELL_W;
    const oy = row * CELL_H;
    for (let y = 0; y < CELL_H; y += 1) {
      const py = sy + y - 104;
      if (py < 0 || py >= previewHeight) continue;
      for (let x = 0; x < CELL_W; x += 1) {
        const px = sx + x - 80;
        if (px < 0 || px >= previewWidth) continue;
        const from = ((oy + y) * atlasWidth + (ox + x)) * 4;
        if (northPixels[from + 3] === 0) continue;
        const to = (py * previewWidth + px) * 4;
        preview[to] = northPixels[from];
        preview[to + 1] = northPixels[from + 1];
        preview[to + 2] = northPixels[from + 2];
        preview[to + 3] = 255;
      }
    }
  };
  const BLOCK = 6;
  // The same neighbour rule the renderer uses: bit 0 is y-1, bit 1 is x+1,
  // bit 2 is y+1, bit 3 is x-1. Getting this order wrong is what turns a
  // network into a field of disconnected studs.
  const maskAt = (test, x, y) => {
    let mask = 0;
    if (test(x, y - 1)) mask |= 1;
    if (test(x + 1, y)) mask |= 2;
    if (test(x, y + 1)) mask |= 4;
    if (test(x - 1, y)) mask |= 8;
    return mask;
  };
  const inMap = (x, y) => x >= 0 && y >= 0 && x <= previewCols && y <= previewRows;
  const isStreet = (x, y) => inMap(x, y) && (x % BLOCK === 0 || y % BLOCK === 0);
  const isRail = (x, y) => inMap(x, y) && y === 3;
  const isWire = (x, y) => inMap(x, y) && x === 4;
  const isPipe = (x, y) => inMap(x, y) && (y === 9 || x === 15);
  const originX = previewWidth / 2;
  const originY = 130;
  const zoneOrder = ["r", "c", "i"];
  // Which tiles a building occupies, so a 3x3 tower is placed once and its
  // neighbours keep their distance the way the real renderer spaces them.
  const occupied = new Set();
  const plan = new Map();
  for (let by = 0; by <= previewRows; by += 1) {
    for (let bx = 0; bx <= previewCols; bx += 1) {
      if (bx % BLOCK === 0 || by % BLOCK === 0) continue;
      const blockX = Math.floor(bx / BLOCK);
      const blockY = Math.floor(by / BLOCK);
      const zone = zoneOrder[(blockX + blockY) % 3];
      const stage = 1 + ((blockX * 2 + blockY) % 3);
      const side = stage === 1 ? 1 : stage === 2 ? 2 : 3;
      // Lay the plot on the block's own lattice so footprints never overlap.
      const localX = bx % BLOCK;
      const localY = by % BLOCK;
      if ((localX - 1) % side !== 0 || (localY - 1) % side !== 0) continue;
      if (localX - 1 + side > BLOCK - 1 || localY - 1 + side > BLOCK - 1) continue;
      let free = true;
      for (let dy = 0; dy < side && free; dy += 1) {
        for (let dx = 0; dx < side; dx += 1) if (occupied.has(`${bx + dx},${by + dy}`)) { free = false; break; }
      }
      if (!free) continue;
      for (let dy = 0; dy < side; dy += 1) for (let dx = 0; dx < side; dx += 1) occupied.add(`${bx + dx},${by + dy}`);
      const variant = 1 + ((bx * 7 + by * 13) % source.normalVariantsPerStage);
      // A multi-tile sprite is anchored on its far corner, the same corner the
      // renderer anchors on.
      plan.set(`${bx},${by}`, `building.${zone}.${stage}.${variant}.normal`);
    }
  }
  for (let sum = 0; sum <= previewCols + previewRows; sum += 1) {
    for (let x = 0; x <= previewCols; x += 1) {
      const y = sum - x;
      if (y < 0 || y > previewRows) continue;
      const sx = originX + (x - y) * 24;
      const sy = originY + (x + y) * 12;
      const street = isStreet(x, y);
      blit(street ? "terrain.lot" : "terrain.grass", sx, sy);
      if (street) {
        blit(`road.mask-${maskAt(isStreet, x, y)}`, sx, sy);
      }
      // The other networks share the streets, the way a player lays them.
      if (isRail(x, y)) blit(`rail.mask-${maskAt(isRail, x, y)}`, sx, sy);
      if (isWire(x, y)) blit(`wire.mask-${maskAt(isWire, x, y)}`, sx, sy);
      if (isPipe(x, y)) blit(`pipe.mask-${maskAt(isPipe, x, y)}`, sx, sy);
      if (street) continue;
      const frameId = plan.get(`${x},${y}`);
      if (frameId) blit(frameId, sx, sy);
    }
  }
  // A second sheet for the things a player places by hand: every facility and
  // reward at game scale, on grass, plus a junction of each network.
  {
    const sheetW = 1500;
    const sheetH = 1500;
    const sheet = Buffer.alloc(sheetW * sheetH * 4);
    for (let i = 0; i < sheetW * sheetH; i += 1) {
      sheet[i * 4] = 14; sheet[i * 4 + 1] = 18; sheet[i * 4 + 2] = 22; sheet[i * 4 + 3] = 255;
    }
    const blitTo = (target, targetW, targetH, frameId, sx, sy) => {
      const slot = slotOf.get(frameId);
      if (slot === undefined) return false;
      const ox = (slot % columns) * CELL_W;
      const oy = Math.floor(slot / columns) * CELL_H;
      for (let y = 0; y < CELL_H; y += 1) {
        const py = sy + y - 104;
        if (py < 0 || py >= targetH) continue;
        for (let x = 0; x < CELL_W; x += 1) {
          const px = sx + x - 80;
          if (px < 0 || px >= targetW) continue;
          const from = ((oy + y) * atlasWidth + (ox + x)) * 4;
          if (northPixels[from + 3] === 0) continue;
          const to = (py * targetW + px) * 4;
          sheet[to] = northPixels[from];
          sheet[to + 1] = northPixels[from + 1];
          sheet[to + 2] = northPixels[from + 2];
          sheet[to + 3] = 255;
        }
      }
      return true;
    };
    const ids = [
      ...source.facilities.map((entry) => entry.id),
      ...source.catalogSpecials.map((entry) => entry.id),
    ];
    const perRow = 8;
    ids.forEach((id, index) => {
      const col = index % perRow;
      const row = Math.floor(index / perRow);
      const sx = 110 + col * 172;
      const sy = 120 + row * 132;
      // Two tiles of ground so the piece has something to stand on.
      blitTo(sheet, sheetW, sheetH, "terrain.grass", sx, sy);
      blitTo(sheet, sheetW, sheetH, id, sx, sy);
    });
    // Trees, building states and a night sample: the rows a reviewer needs
    // that a city view does not show.
    {
      const rowY = 120 + Math.ceil(ids.length / perRow) * 132;
      const trees = ["tree.broadleaf", "tree.conifer", "tree.young", "tree.maple", "tree.blossom", "tree.winter"];
      trees.forEach((id, index) => {
        const sx = 110 + index * 92;
        blitTo(sheet, sheetW, sheetH, "terrain.grass", sx, rowY);
        blitTo(sheet, sheetW, sheetH, id, sx, rowY);
      });
      // A small stand, so a forest can be judged as a forest.
      for (let i = 0; i < 12; i += 1) {
        const tx = 700 + (i % 6) * 24 - Math.floor(i / 6) * 24;
        const ty = rowY + Math.floor(i / 6) * 12 + (i % 6) * 12 - 30;
        blitTo(sheet, sheetW, sheetH, "terrain.grass", tx, ty);
        blitTo(sheet, sheetW, sheetH, trees[i % trees.length], tx, ty);
      }
      const states = ["foundation", "construction", "normal", "declined", "abandoned", "recovering"];
      states.forEach((state, index) => {
        const sx = 1030 + (index % 3) * 110;
        const sy = rowY + Math.floor(index / 3) * 76 - 30;
        blitTo(sheet, sheetW, sheetH, "terrain.lot", sx, sy);
        blitTo(sheet, sheetW, sheetH, state === "normal" ? "building.r.2.1.normal" : `building.r.2.1.${state}`, sx, sy);
      });
      // Slope faces: one per neighbour-height mask, so a hillside is a slope
      // and not a staircase.
      [0, 1, 2, 4, 8, 3, 6, 12, 9, 5].forEach((mask, index) => {
        const sx = 110 + index * 76;
        const sy = rowY + 60;
        blitTo(sheet, sheetW, sheetH, `terrain.slope.mask-${mask}`, sx, sy);
      });

      // Moving things, on a road so their orientation can be judged.
      source.agents.forEach((entry, index) => {
        const sx = 700 + (index % 7) * 76;
        const sy = rowY + 96 + Math.floor(index / 7) * 70;
        blitTo(sheet, sheetW, sheetH, "terrain.lot", sx, sy);
        if (entry.kind === "car" || entry.kind === "service") blitTo(sheet, sheetW, sheetH, "road.mask-10", sx, sy);
        if (entry.kind === "train") blitTo(sheet, sheetW, sheetH, "rail.mask-10", sx, sy);
        blitTo(sheet, sheetW, sheetH, entry.id, sx, sy);
      });
      const nights = ["building.r.3.2.night", "building.c.3.4.night", "building.i.2.3.night", "facility.coal.night"];
      nights.forEach((id, index) => {
        const sx = 150 + index * 130;
        const sy = rowY + 150;
        blitTo(sheet, sheetW, sheetH, "terrain.lot", sx, sy);
        blitTo(sheet, sheetW, sheetH, id, sx, sy);
      });
    }

    // A junction sample for each network, along the bottom.
    const networks = ["road", "rail", "wire", "pipe", "highway"];
    networks.forEach((family, index) => {
      const sx = 150 + index * 260;
      const sy = sheetH - 120;
      for (let step = -2; step <= 2; step += 1) {
        blitTo(sheet, sheetW, sheetH, "terrain.grass", sx + step * 24, sy + step * 12);
        blitTo(sheet, sheetW, sheetH, "terrain.grass", sx - step * 24, sy + step * 12);
      }
      blitTo(sheet, sheetW, sheetH, `${family}.mask-15`, sx, sy);
      blitTo(sheet, sheetW, sheetH, `${family}.mask-5`, sx + 24, sy + 12);
      blitTo(sheet, sheetW, sheetH, `${family}.mask-10`, sx - 24, sy + 12);
    });
    if (writesEvidence) {
      const sheetPng = encodePng(sheetW, sheetH, sheet);
      await writeFile(path.join(evidenceDir, "bonsai-facility-preview.png"), sheetPng);
      console.log(`Bonsai facility sheet: ${ids.length} pieces, ${sheetPng.length} bytes`);
    }
  }

  if (writesEvidence) {
    const previewPng = encodePng(previewWidth, previewHeight, preview);
    await writeFile(path.join(evidenceDir, "bonsai-city-preview.png"), previewPng);
    console.log(`Bonsai preview: ${previewWidth}x${previewHeight}, ${previewPng.length} bytes`);
  }
}

console.log(`Bonsai atlas: ${sprites.length} frames, ${atlasWidth}x${atlasHeight}, ${directions.length} directions`);
