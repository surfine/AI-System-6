// Bonsai City pure isometric view math / 盆景城市等距视图数学.
//
// The simulation never enters this module. It provides deterministic 48x24
// projection, four quarter-turn rotations, inverse picking, diagonal viewport
// culling, and multi-tile painter anchors for the Canvas 2D renderer.
window.AISystem6BonsaiRendererLoaded = true;

(function initBonsaiRenderer() {
  "use strict";

  const TILE_W = 64;
  const TILE_H = 32;
  const HEIGHT_STEP = 10;
  const MIN_ZOOM = 0.4;
  const MAX_ZOOM = 2.5;
  const DEFAULT_ZOOM = 0.7;
  const ROTATIONS = 4;

  function clampZoom(zoom) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  }

  // How much city a viewport shows at a zoom: the screen length of one tile
  // edge, then how many full diamond widths fit across and how many diamond
  // rows fit down. The voxel backend reports the same readout from the same
  // 48px tile, so the two backends agree on the tile-scale fact.
  function measureFrame(zoom = DEFAULT_ZOOM, cssWidth = 1024, cssHeight = 640) {
    const z = clampZoom(Number.isFinite(zoom) ? zoom : DEFAULT_ZOOM);
    const scale = (TILE_W / Math.SQRT2) * z;
    return {
      zoom: z,
      pxPerTileEdge: scale,
      tilesAcross: cssWidth / (scale * Math.SQRT2),
      tilesDown: cssHeight / (scale * Math.SQRT2 * 0.5),
    };
  }

  function normalizeRotation(rotation) {
    const integer = Number.isFinite(rotation) ? Math.round(rotation) : 0;
    return ((integer % ROTATIONS) + ROTATIONS) % ROTATIONS;
  }

  function createCamera(options = {}) {
    return {
      originX: Number.isFinite(options.originX) ? options.originX : 512,
      originY: Number.isFinite(options.originY) ? options.originY : 96,
      zoom: clampZoom(Number.isFinite(options.zoom) ? options.zoom : DEFAULT_ZOOM),
      rotation: normalizeRotation(options.rotation),
      size: Number.isInteger(options.size) && options.size > 0 ? options.size : 64,
    };
  }

  function rotateTile(x, y, size, rotation = 0) {
    switch (normalizeRotation(rotation)) {
      case 1: return { x: size - 1 - y, y: x };
      case 2: return { x: size - 1 - x, y: size - 1 - y };
      case 3: return { x: y, y: size - 1 - x };
      default: return { x, y };
    }
  }

  function unrotateTile(x, y, size, rotation = 0) {
    return rotateTile(x, y, size, -normalizeRotation(rotation));
  }

  function project(x, y, altitude = 0, camera = createCamera(), mapSize = camera.size || 64) {
    const rotated = rotateTile(x, y, mapSize, camera.rotation);
    const zoom = camera.zoom;
    return {
      sx: camera.originX + (rotated.x - rotated.y) * (TILE_W / 2) * zoom,
      sy: camera.originY + (rotated.x + rotated.y) * (TILE_H / 2) * zoom - altitude * HEIGHT_STEP * zoom,
      rx: rotated.x,
      ry: rotated.y,
    };
  }

  // Inverse projection at a known altitude. The Canvas renderer first samples
  // at altitude zero, then refines with the candidate tile's actual height.
  function unproject(px, py, camera = createCamera(), altitude = 0, mapSize = camera.size || 64) {
    const zoom = camera.zoom;
    const u = (px - camera.originX) / ((TILE_W / 2) * zoom);
    const v = (py - camera.originY + altitude * HEIGHT_STEP * zoom) / ((TILE_H / 2) * zoom);
    // Tile centers can land one IEEE-754 ulp below an integer after the
    // forward/inverse division pair. The epsilon corrects that representable
    // boundary without moving any real point across a tile edge.
    const rotatedX = Math.floor((u + v) / 2 + 1e-9);
    const rotatedY = Math.floor((v - u) / 2 + 1e-9);
    return unrotateTile(rotatedX, rotatedY, mapSize, camera.rotation);
  }

  function depthKey(x, y, mapSize, rotation = 0) {
    const rotated = rotateTile(x, y, mapSize, rotation);
    return rotated.x + rotated.y;
  }

  function paintOrder(size, rotation = 0) {
    const tiles = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const rotated = rotateTile(x, y, size, rotation);
        tiles.push({ x, y, rx: rotated.x, ry: rotated.y });
      }
    }
    tiles.sort((a, b) => ((a.rx + a.ry) - (b.rx + b.ry)) || (a.ry - b.ry) || (a.rx - b.rx));
    return tiles.map((tile) => [tile.x, tile.y]);
  }

  // Cull whole screen-space diagonals before visiting tiles on them. Horizontal
  // bounds are then checked with one tile of overdraw for sprites and slopes.
  function visibleTiles(size, camera, viewport, altitude = null, options = {}) {
    const zoom = camera.zoom;
    const halfW = (TILE_W / 2) * zoom;
    const halfH = (TILE_H / 2) * zoom;
    const margin = Number.isFinite(options.margin) ? options.margin : 12;
    const maxAltitude = Number.isFinite(options.maxAltitude) ? options.maxAltitude : 8;
    const top = (viewport.top || 0) - margin;
    const bottom = (viewport.bottom ?? viewport.height ?? 0) + margin;
    const left = (viewport.left || 0) - margin;
    const right = (viewport.right ?? viewport.width ?? 0) + margin;
    const viewportLeft = viewport.left || 0;
    const viewportTop = viewport.top || 0;
    const viewportRight = viewport.right ?? viewport.width ?? 0;
    const viewportBottom = viewport.bottom ?? viewport.height ?? 0;
    let minWorldX = 0;
    let minWorldY = 0;
    let maxWorldX = size - 1;
    let maxWorldY = size - 1;
    // Optional bounded probes can request a central square, but production
    // culling defaults to the exact screen-space parallelogram so rectangular
    // viewport corners never become blank.
    if (Number.isInteger(options.maxSpan) && options.maxSpan < size) {
      const visibleSpan = Math.max(8, options.maxSpan);
      const center = unproject((viewportLeft + viewportRight) / 2, (viewportTop + viewportBottom) / 2, camera, 0, size);
      minWorldX = Math.max(0, Math.min(size - visibleSpan, center.x - Math.floor(visibleSpan / 2)));
      minWorldY = Math.max(0, Math.min(size - visibleSpan, center.y - Math.floor(visibleSpan / 2)));
      maxWorldX = Math.min(size - 1, minWorldX + visibleSpan - 1);
      maxWorldY = Math.min(size - 1, minWorldY + visibleSpan - 1);
    }
    const firstDiagonal = Math.max(0, Math.floor((top - camera.originY) / halfH));
    const lastDiagonal = Math.min(
      (size - 1) * 2,
      Math.ceil((bottom - camera.originY + maxAltitude * HEIGHT_STEP * zoom) / halfH)
    );
    const result = [];

    for (let diagonal = firstDiagonal; diagonal <= lastDiagonal; diagonal += 1) {
      const minRotatedX = Math.max(0, diagonal - (size - 1));
      const maxRotatedX = Math.min(size - 1, diagonal);
      for (let rotatedX = minRotatedX; rotatedX <= maxRotatedX; rotatedX += 1) {
        const rotatedY = diagonal - rotatedX;
        const original = unrotateTile(rotatedX, rotatedY, size, camera.rotation);
        if (original.x < minWorldX || original.x > maxWorldX || original.y < minWorldY || original.y > maxWorldY) continue;
        const index = original.y * size + original.x;
        const tileAltitude = altitude && Number.isFinite(altitude[index]) ? altitude[index] : 0;
        const sx = camera.originX + (rotatedX - rotatedY) * halfW;
        const sy = camera.originY + diagonal * halfH - tileAltitude * HEIGHT_STEP * zoom;
        if (sx + halfW < left || sx - halfW > right || sy + halfH < top || sy - halfH > bottom) continue;
        result.push([original.x, original.y]);
      }
    }
    return result;
  }

  function objectAnchor(object, size, rotation = 0) {
    const width = Math.max(1, object.footprint?.w || object.width || 1);
    const height = Math.max(1, object.footprint?.h || object.height || 1);
    const anchorX = Number.isFinite(object.anchorX) ? object.anchorX : object.x + (width - 1) / 2;
    const anchorY = Number.isFinite(object.anchorY) ? object.anchorY : object.y + (height - 1) / 2;
    const corners = [
      [object.x, object.y],
      [object.x + width - 1, object.y],
      [object.x, object.y + height - 1],
      [object.x + width - 1, object.y + height - 1],
    ].map(([x, y]) => rotateTile(x, y, size, rotation));
    const near = corners.reduce((best, point) => {
      const key = point.x + point.y;
      return !best || key > best.key || (key === best.key && point.y > best.y) ? { key, x: point.x, y: point.y } : best;
    }, null);
    return { x: anchorX, y: anchorY, depth: near.key, tieY: near.y, tieX: near.x };
  }

  function sortByAnchor(objects, size, rotation = 0) {
    return objects.map((object, sequence) => ({ object, sequence, anchor: objectAnchor(object, size, rotation) }))
      .sort((a, b) => (a.anchor.depth - b.anchor.depth)
        || (a.anchor.tieY - b.anchor.tieY)
        || (a.anchor.tieX - b.anchor.tieX)
        || (a.sequence - b.sequence))
      .map((entry) => entry.object);
  }

  // SC2000 mountain signature: where a water tile meets land at least two
  // altitude levels higher, the shared edge is a waterfall. Pure renderer
  // derivation — the simulation state never changes for a visual. Returns
  // [{ x, y, dir, height }] with dir one of "n" | "e" | "s" | "w" and height
  // in altitude levels, deterministic per snapshot.
  function waterfallEdges(snapshot) {
    const size = Number.isInteger(snapshot?.size) && snapshot.size > 0
      ? snapshot.size
      : Math.floor(Math.sqrt((snapshot?.alt || snapshot?.water || []).length || 0));
    if (!Number.isInteger(size) || size <= 0) return [];
    const isWaterTile = (x, y) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return false;
      const index = y * size + x;
      if (snapshot.water && snapshot.water[index]) return true;
      const terrain = snapshot.terrainType && snapshot.terrainType[index];
      return terrain === "water" || terrain === 1;
    };
    const altitude = (x, y) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return 0;
      const index = y * size + x;
      return Number(snapshot.alt && snapshot.alt[index]) || 0;
    };
    const edges = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!isWaterTile(x, y)) continue;
        const waterAlt = altitude(x, y);
        const neighbors = [[0, -1, "n"], [1, 0, "e"], [0, 1, "s"], [-1, 0, "w"]];
        for (const [dx, dy, dir] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (isWaterTile(nx, ny)) continue;
          const drop = altitude(nx, ny) - waterAlt;
          if (drop >= 2) edges.push({ x, y, dir, height: Math.min(6, drop) });
        }
      }
    }
    return edges;
  }

  // SC2000 stepped-terrain depth: every lower land tile that borders a
  // higher tile casts a shadow band along that shared edge. Pure renderer
  // derivation — the simulation state never changes for a visual. Returns
  // [{ x, y, dir, drop }] on the lower tile, dir toward the higher neighbour.
  function cliffEdges(snapshot) {
    const size = Number.isInteger(snapshot?.size) && snapshot.size > 0
      ? snapshot.size
      : Math.floor(Math.sqrt((snapshot?.alt || []).length || 0));
    if (!Number.isInteger(size) || size <= 0) return [];
    const altitude = (x, y) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return 0;
      const index = y * size + x;
      return Number(snapshot.alt && snapshot.alt[index]) || 0;
    };
    const edges = [];
    const neighbors = [[0, -1, "n"], [1, 0, "e"], [0, 1, "s"], [-1, 0, "w"]];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = y * size + x;
        if (snapshot.water && snapshot.water[index]) continue;
        const alt = altitude(x, y);
        for (const [dx, dy, dir] of neighbors) {
          const drop = altitude(x + dx, y + dy) - alt;
          if (drop >= 1) edges.push({ x, y, dir, drop: Math.min(6, drop) });
        }
      }
    }
    return edges;
  }

  window.AISystem6BonsaiRenderer = Object.freeze({
    TILE_W,
    TILE_H,
    HEIGHT_STEP,
    MIN_ZOOM,
    MAX_ZOOM,
    DEFAULT_ZOOM,
    ROTATIONS,
    clampZoom,
    measureFrame,
    normalizeRotation,
    createCamera,
    rotateTile,
    unrotateTile,
    project,
    unproject,
    depthKey,
    paintOrder,
    visibleTiles,
    objectAnchor,
    sortByAnchor,
    waterfallEdges,
    cliffEdges,
  });
})();
