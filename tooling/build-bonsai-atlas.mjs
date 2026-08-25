// Build the original Bonsai City 2:1 isometric atlas from checked-in,
// declarative micro-voxel recipes. No external art, network input, canvas
// package, or non-deterministic input participates in this build.

import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { desktopRoot } from "./lib/paths.mjs";

const assetsDir = path.join(desktopRoot, "assets", "bonsai");
const generatedDir = path.join(desktopRoot, "app", "generated");
const sourcePath = path.join(assetsDir, "atlas-source.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const geometry = source.geometry;
const directions = ["north", "east", "south", "west"];

function invariant(condition, message) {
  if (!condition) throw new Error(`bonsai-atlas-invalid: ${message}`);
}

invariant(source.schema === "ai-system-6-bonsai-micro-voxel-source-v2", "source schema");
invariant(source.license === "MIT" && source.source === "original", "provenance boundary");
invariant(geometry.tileWidth === 48 && geometry.tileHeight === 24, "2:1 tile geometry");
invariant(geometry.heightStep === 8, "height step");

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
const atlasWidth = columns * geometry.cellWidth;
const atlasHeight = rows * geometry.cellHeight;
const anchor = { x: Math.floor(geometry.cellWidth / 2), y: 104 };

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
    [cx + (-w + h) * 12, cy - (w + h) * 6],
    [cx + (w + h) * 12, cy + (w - h) * 6],
    [cx + (w - h) * 12, cy + (w + h) * 6],
    [cx - (w + h) * 12, cy + (-w + h) * 6],
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

function drawTerrain(buffer, frame, cx, cy, directionIndex) {
  const colors = frame.colors.map(rgba);
  const top = diamond(cx, cy, 1, 1);
  const depth = frame.height || 0;
  const lower = top.map(([x, y]) => [x, y + depth]);
  if (depth) {
    // Side faces fall away from the light: the front-right face is darker
    // than the front-left, the SC2000 stepped-terrain read.
    fillPolygon(buffer, atlasWidth, atlasHeight, [top[1], top[2], lower[2], lower[1]], shade(colors[1], -8));
    fillPolygon(buffer, atlasWidth, atlasHeight, [top[2], top[3], lower[3], lower[2]], shade(colors[2], -18));
  }
  fillPolygon(buffer, atlasWidth, atlasHeight, top, colors[0]);
  const accent = directionIndex % 2 === 0 ? colors[1] : colors[2];
  if (frame.kind === "water") {
    drawLine(buffer, atlasWidth, atlasHeight, cx - 13, cy - 2, cx - 2, cy + 3, accent, 2);
    drawLine(buffer, atlasWidth, atlasHeight, cx + 4, cy - 4, cx + 15, cy + 1, accent, 2);
    drawLine(buffer, atlasWidth, atlasHeight, cx - 7, cy - 8, cx + 6, cy - 2, shade(accent, 22), 1);
  } else if (frame.kind === "coast") {
    drawLine(buffer, atlasWidth, atlasHeight, cx - 18, cy + 2, cx + 12, cy + 8, shade(colors[2], -10), 3);
    // Foam where the water meets the shore.
    drawLine(buffer, atlasWidth, atlasHeight, cx - 20, cy + 6, cx + 14, cy + 11, rgba("white"), 1);
  } else {
    const seed = hashString(frame.id);
    for (let dot = 0; dot < 8; dot += 1) {
      const px = cx + ((seed >>> (dot * 3)) % 29) - 14;
      const py = cy + ((seed >>> (dot * 2 + 1)) % 9) - 4;
      fillRect(buffer, atlasWidth, atlasHeight, px, py, 2, 1, accent);
    }
    if (frame.kind !== "rock" && frame.kind !== "soil") {
      for (let blade = 0; blade < 3; blade += 1) {
        const bx = cx + ((seed >>> (blade * 5 + 3)) % 27) - 13;
        const by = cy + ((seed >>> (blade * 7 + 2)) % 8) - 5;
        drawLine(buffer, atlasWidth, atlasHeight, bx, by, bx, by - 2, shade(accent, -12), 1);
      }
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
    n: [cx + 12, cy - 6],
    e: [cx + 12, cy + 6],
    s: [cx - 12, cy + 6],
    w: [cx - 12, cy - 6],
  };
  const color = rgba(frame.color);
  const accent = rgba(frame.accent);
  const kind = frame.kind;
  const thickness = kind === "road" ? 9 : kind === "rail" ? 6
    : kind === "highway" || kind.startsWith("bridge-") ? 10
      : kind === "onramp" ? 7 : 3;
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

  ports.forEach((port) => {
    drawLine(buffer, atlasWidth, atlasHeight, cx, cy, points[port][0], points[port][1], color, thickness);
  });
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
    if (kind === "highway" || kind === "bridge-highway") {
      // A divided highway: two edge stripes, a dark median pair, and dashed
      // lane lines between — the SC2000 raised-deck read.
      const ox = (cy - py) / 2;
      const oy = (px - cx) / 2;
      for (const side of [-1, 1]) {
        drawLine(buffer, atlasWidth, atlasHeight,
          startX + ox * side * 0.72, startY + oy * side * 0.72,
          px + ox * side * 0.72, py + oy * side * 0.72,
          shade(accent, -16), 1);
      }
      for (const side of [-1, 1]) {
        drawLine(buffer, atlasWidth, atlasHeight,
          startX + ox * side * 0.14, startY + oy * side * 0.14,
          px + ox * side * 0.14, py + oy * side * 0.14,
          accent, 1);
      }
      const laneLen = px - startX;
      const laneDy = py - startY;
      for (const side of [-1, 1]) {
        for (const [a, b] of [[0, 0.3], [0.4, 0.7], [0.8, 1]]) {
          drawLine(buffer, atlasWidth, atlasHeight,
            startX + laneLen * a + ox * side * 0.44, startY + laneDy * a + oy * side * 0.44,
            startX + laneLen * b + ox * side * 0.44, startY + laneDy * b + oy * side * 0.44,
            shade(accent, -10), 1);
        }
      }
    } else if (kind === "road") {
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

function drawTree(buffer, frame, cx, cy, directionIndex) {
  const size = frame.variant === 3 ? 13 : frame.variant === 2 ? 20 : 23;
  const height = frame.variant === 3 ? 24 : 38;
  // Soft ground shadow so trees sit on the ground, not on the diamond.
  fillPolygon(buffer, atlasWidth, atlasHeight, [
    [cx - 11, cy + 5], [cx, cy + 9], [cx + 11, cy + 5], [cx, cy + 1],
  ], shade(rgba("black"), 52));
  drawLine(buffer, atlasWidth, atlasHeight, cx, cy + 3, cx, cy - height + 8, rgba("trunk"), 4);
  const leaf = frame.variant === 4
    ? (directionIndex % 2 ? rgba("red") : shade(rgba("red"), 24))
    : frame.variant === 5
      ? (directionIndex % 2 ? rgba("blossom") : shade(rgba("blossom"), 18))
      : frame.variant === 6
        ? (directionIndex % 2 ? rgba("winterCanopy") : shade(rgba("winterCanopy"), 14))
        : directionIndex % 2 ? rgba("tree") : rgba("treeLight");
  fillPolygon(buffer, atlasWidth, atlasHeight, [
    [cx, cy - height - size / 2], [cx + size, cy - height], [cx, cy - height + size / 2], [cx - size, cy - height],
  ], shade(leaf, -18));
  // A smaller highlight canopy offset toward the light gives the crown depth.
  const hl = Math.max(6, size * 0.58);
  fillPolygon(buffer, atlasWidth, atlasHeight, [
    [cx - 4, cy - height - hl / 2 - 4], [cx - 4 + hl, cy - height - 2 - 4], [cx - 4, cy - height + hl / 2 - 4], [cx - 4 - hl, cy - height - 2 - 4],
  ], leaf);
  if (frame.variant !== 2) fillRect(buffer, atlasWidth, atlasHeight, cx - 8, cy - height - 2, 16, 8, shade(leaf, 10));
}

// Window geometry lives in one place: the rects the day painter draws are
// recorded on night frames as cell-relative metadata, so the runtime night
// glow pass can project the same windows without re-deriving the layout.
function buildingWindowRects(frame) {
  const height = Math.min(68, frame.height);
  const rows = Math.max(1, Math.floor(height / 12));
  const rects = [];
  for (let row = 0; row < rows; row += 1) {
    const y = 104 - height + 10 + row * 10;
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

// The 2.5D read: the roof's front edges catch the light, the front corner
// separates the two faces, and floor lines give the facade vertical rhythm.
function drawFacadeDetails(buffer, cx, cy, box, base, light) {
  drawLine(buffer, atlasWidth, atlasHeight, box.top[1][0], box.top[1][1], box.top[2][0], box.top[2][1], shade(light, 18), 1);
  drawLine(buffer, atlasWidth, atlasHeight, box.top[2][0], box.top[2][1], box.top[3][0], box.top[3][1], shade(light, 10), 1);
  drawLine(buffer, atlasWidth, atlasHeight, box.top[2][0], box.top[2][1], box.base[2][0], box.base[2][1], shade(base, -32), 2);
  const rows = Math.max(1, Math.floor((box.top[2][1] - box.base[2][1]) / 12));
  for (let row = 1; row < rows; row += 1) {
    const f = row / rows;
    const a = [box.top[3][0] + (box.base[3][0] - box.top[3][0]) * f, box.top[3][1] + (box.base[3][1] - box.top[3][1]) * f];
    const b = [box.top[2][0] + (box.base[2][0] - box.top[2][0]) * f, box.top[2][1] + (box.base[2][1] - box.top[2][1]) * f];
    drawLine(buffer, atlasWidth, atlasHeight, a[0], a[1], b[0], b[1], shade(base, -22), 1);
  }
}

function drawFrontDoor(buffer, cx, cy, base) {
  fillRect(buffer, atlasWidth, atlasHeight, cx - 4, cy - 3, 8, 12, shade(base, -36));
  fillRect(buffer, atlasWidth, atlasHeight, cx - 5, cy - 4, 10, 2, shade(base, -22));
}

// A red torii gate at the water's edge — two pillars, a flared kasagi beam,
// and a dark nuki beam — the Japanese-Minecraft signature of piers and
// marinas.
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

function drawBuilding(buffer, frame, cx, cy, directionIndex) {
  let base = rgba(frame.base);
  let light = rgba(frame.light);
  if (frame.state === "declined") { base = shade(base, -34); light = shade(light, -42); }
  if (frame.state === "abandoned") { base = rgba("abandoned"); light = shade(base, 22); }
  if (frame.state === "night") { base = shade(base, -58); light = shade(light, -42); }
  if (frame.state === "foundation") {
    drawIsoBox(buffer, cx, cy, frame.footprint, 5, rgba("concrete"), shade(rgba("concrete"), -24), shade(rgba("concrete"), -42), directionIndex);
    return;
  }
  const height = Math.min(68, frame.height);
  const box = drawIsoBox(buffer, cx, cy, frame.footprint, height, light, base, shade(base, -34), directionIndex);
  if (frame.state === "night") {
    const lit = rgba("windowNight");
    const core = shade(lit, 32);
    nightWindowRects(frame).forEach((rect, index) => {
      fillRect(buffer, atlasWidth, atlasHeight, cx + rect.x - 82, cy + rect.y - 106, rect.w + 4, rect.h + 4, shade(lit, -14));
      fillRect(buffer, atlasWidth, atlasHeight, cx + rect.x - 80, cy + rect.y - 104, rect.w, rect.h, index % 2 ? core : lit);
    });
    drawFacadeDetails(buffer, cx, cy, box, base, light);
    if (frame.variant % 3 === 0) drawLine(buffer, atlasWidth, atlasHeight, cx, cy - height - 1, cx, cy - height - 10, rgba("metal"), 2);
    return;
  }
  const windowColor = frame.state === "construction" ? rgba("construction") : frame.state === "abandoned" ? rgba("black") : rgba("glass");
  buildingWindowRects(frame).forEach((rect) => {
    fillRect(buffer, atlasWidth, atlasHeight, cx + rect.x - 80, cy + rect.y - 104, rect.w, rect.h, rect.x === 67 ? shade(windowColor, -18) : windowColor);
  });
  drawFacadeDetails(buffer, cx, cy, box, base, light);
  if (frame.category === "building" && frame.footprint[0] === 1 && frame.footprint[1] === 1
    && frame.state !== "foundation" && frame.state !== "construction") {
    drawFrontDoor(buffer, cx, cy, base);
  }
  if (frame.state === "construction") {
    drawLine(buffer, atlasWidth, atlasHeight, box.top[3][0], box.top[3][1], box.base[3][0], box.base[3][1], rgba("construction"), 2);
    drawLine(buffer, atlasWidth, atlasHeight, box.top[1][0], box.top[1][1], box.base[1][0], box.base[1][1], rgba("construction"), 2);
  }
  if (frame.state === "recovering") fillRect(buffer, atlasWidth, atlasHeight, cx - 10, cy - height - 4, 20, 4, rgba("treeLight"));
  if (frame.variant % 3 === 0) drawLine(buffer, atlasWidth, atlasHeight, cx, cy - height - 1, cx, cy - height - 10, rgba("metal"), 2);
}

function drawFacility(buffer, frame, cx, cy, directionIndex) {
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

function drawAgent(buffer, frame, cx, cy, directionIndex) {
  const palette = [rgba("red"), rgba("commercial"), rgba("yellow"), rgba("white")];
  if (frame.kind === "pedestrian") {
    fillRect(buffer, atlasWidth, atlasHeight, cx - 2, cy - 8, 4, 5, palette[frame.variant % palette.length]);
    fillRect(buffer, atlasWidth, atlasHeight, cx - 1, cy - 3, 2, 6, rgba("black"));
  } else if (frame.kind === "smoke") {
    const gray = shade(rgba("metal"), -frame.variant * 18);
    fillRect(buffer, atlasWidth, atlasHeight, cx - 5, cy - 17, 11, 9, gray);
    fillRect(buffer, atlasWidth, atlasHeight, cx - 9 + frame.variant * 2, cy - 28, 13, 10, shade(gray, 18));
  } else {
    const long = frame.kind === "train" ? 24 : frame.kind === "service" ? 15 : 12;
    const color = frame.kind === "service" ? palette[frame.variant % 3] : palette[(frame.variant - 1) % palette.length];
    const horizontal = directionIndex % 2 === 0;
    fillRect(buffer, atlasWidth, atlasHeight, cx - (horizontal ? long / 2 : 4), cy - (horizontal ? 4 : long / 3), horizontal ? long : 8, horizontal ? 8 : long * 0.66, color);
    fillRect(buffer, atlasWidth, atlasHeight, cx - 3, cy - 5, 6, 3, rgba("glass"));
  }
}

function drawSprite(buffer, frame, slot, directionIndex) {
  const col = slot % columns;
  const row = Math.floor(slot / columns);
  const cx = col * geometry.cellWidth + anchor.x;
  const cy = row * geometry.cellHeight + anchor.y;
  if (frame.category === "terrain") drawTerrain(buffer, frame, cx, cy, directionIndex);
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
for (let directionIndex = 0; directionIndex < directions.length; directionIndex += 1) {
  const direction = directions[directionIndex];
  const pixels = Buffer.alloc(atlasWidth * atlasHeight * 4);
  sprites.forEach((frame, slot) => drawSprite(pixels, frame, slot, directionIndex));
  const png = encodePng(atlasWidth, atlasHeight, pixels);
  const filename = `atlas-${direction}.png`;
  await writeFile(path.join(assetsDir, filename), png);
  files[direction] = { url: `/assets/bonsai/${filename}`, file: `assets/bonsai/${filename}`, sha256: digest(png) };
  if (direction === "north") await writeFile(path.join(assetsDir, "atlas.png"), png);
}

const frames = {};
sprites.forEach((frame, slot) => {
  frames[frame.id] = {
    x: (slot % columns) * geometry.cellWidth,
    y: Math.floor(slot / columns) * geometry.cellHeight,
    w: geometry.cellWidth,
    h: geometry.cellHeight,
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
  atlas: { width: atlasWidth, height: atlasHeight, cellWidth: geometry.cellWidth, cellHeight: geometry.cellHeight, columns, rows },
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
    "Original isometric pixel art generated from project-owned geometric recipes; no pixels copied, traced, sampled, or converted from any external game or artwork.",
    "The generator has no network path and reads only the checked-in source recipe.",
    "All four rotations share frame ids and dimensions; direction-specific light and small asymmetries are generated deliberately.",
  ],
};
await writeFile(path.join(assetsDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);

console.log(`Bonsai atlas: ${sprites.length} frames, ${atlasWidth}x${atlasHeight}, ${directions.length} directions`);
