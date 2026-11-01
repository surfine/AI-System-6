// Bonsai City pure isometric view math / 盆景城市等距视图数学.
//
// The simulation never enters this module. It provides deterministic 64x32
// projection, four quarter-turn rotations, inverse picking, diagonal viewport
// culling, and multi-tile painter anchors for the Canvas 2D renderer.
window.AISystem6BonsaiRendererLoaded = true;

(function initBonsaiRenderer() {
  "use strict";

  const TILE_W = 64;
  const TILE_H = 32;
  const HEIGHT_STEP = 10;
  // SC2K zooms in fixed steps, and pixel art only stays crisp at whole-number
  // scales: at 0.5 a 64px sprite lands on exactly one device pixel per
  // artwork pixel on a 2x screen. Four steps, 16/32/64/128 px per tile; the
  // default is the 32px overview the original opens at.
  const ZOOM_LEVELS = Object.freeze([0.25, 0.5, 1, 2]);
  const MIN_ZOOM = ZOOM_LEVELS[0];
  const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  const DEFAULT_ZOOM = 0.5;
  const ROTATIONS = 4;

  function clampZoom(zoom) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  }

  // The nearest step, measured in doublings rather than in raw scale, so 0.7
  // snaps to 0.5 and 0.75 to 1 the way the eye reads them.
  function snapZoom(zoom) {
    const target = Math.log2(clampZoom(Number.isFinite(zoom) ? zoom : DEFAULT_ZOOM));
    let best = ZOOM_LEVELS[0];
    for (const level of ZOOM_LEVELS) {
      if (Math.abs(Math.log2(level) - target) < Math.abs(Math.log2(best) - target)) best = level;
    }
    return best;
  }

  function stepZoom(zoom, steps) {
    const index = ZOOM_LEVELS.indexOf(snapZoom(zoom));
    const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index + Math.trunc(Number(steps) || 0)));
    return ZOOM_LEVELS[next];
  }

  // Keep the ground under the anchor where it is while the scale changes.
  // The renderers place a point at centre + pan + zoom x (its offset from the
  // map centre), so the pan that holds the anchored point still is
  // anchor - centre - (to / from) x (anchor - centre - pan). Zooming used to
  // keep the pan fixed instead, and a few notches of the wheel carried the
  // whole city off the screen.
  function anchoredPan(view, fromZoom, toZoom, anchorX, anchorY, cssWidth, cssHeight) {
    const panX = Number(view?.panX) || 0;
    const panY = Number(view?.panY) || 0;
    if (!(fromZoom > 0) || !(toZoom > 0)) return { panX, panY };
    const ratio = toZoom / fromZoom;
    const offsetX = (Number.isFinite(anchorX) ? anchorX : cssWidth / 2) - cssWidth / 2;
    const offsetY = (Number.isFinite(anchorY) ? anchorY : cssHeight / 2) - cssHeight / 2;
    return {
      panX: offsetX - ratio * (offsetX - panX),
      panY: offsetY - ratio * (offsetY - panY),
    };
  }

  // Night and the seasons are display choices, not the city's clock: the
  // shell stamps the snapshot with what the player asked to see, and both
  // renderers read the stamp. An unstamped snapshot keeps the old clock.
  function seasonOf(snapshot) {
    const stamped = Number(snapshot?.season);
    if (Number.isInteger(stamped) && stamped >= 0 && stamped <= 3) return stamped;
    return Math.floor(((Number(snapshot?.tick) || 0) % 1500) / 375);
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

  // A catalog id is repeated over its entire imported footprint; it is not
  // an independent building on every tile. Claim only complete, level squares.
  function collectCatalogObjects(snapshot, catalog) {
    if (!snapshot?.catalogId || !catalog?.entryOf) return [];
    const size = Number(snapshot.size) || Math.sqrt(snapshot.catalogId.length);
    if (!Number.isInteger(size) || size < 1) return [];
    const grid = (names, i, fallback = 0) => {
      for (const name of names) if (snapshot[name]?.[i] !== undefined) return snapshot[name][i];
      return fallback;
    };
    const eligible = (i) => {
      const over = Number(grid(["over"], i));
      return !grid(["zone", "zoneType"], i)
        && !(snapshot.facilityAt && snapshot.facilityAt[i] >= 0)
        && !grid(["road"], i) && !grid(["rail"], i) && !grid(["wire"], i)
        && !grid(["highway"], i) && !grid(["onramp"], i)
        && !grid(["tree", "trees"], i) && !grid(["park"], i)
        && ![1, 2, 3, 4].includes(over);
    };
    const altitude = (i) => Number(grid(["alt", "height", "elevation"], i));
    const claimed = new Uint8Array(size * size);
    const result = [];
    for (let index = 0; index < size * size; index += 1) {
      if (claimed[index]) continue;
      const id = Number(snapshot.catalogId[index]) || 0;
      const entry = id && catalog.entryOf(id);
      if (!entry || entry.category === "clear" || entry.category === "trees" || !eligible(index)) continue;
      const x = index % size, y = Math.floor(index / size);
      const declared = Math.max(1, Math.floor(Number(entry.size) || 1));
      let complete = x + declared <= size && y + declared <= size;
      for (let dy = 0; complete && dy < declared; dy += 1) for (let dx = 0; dx < declared; dx += 1) {
        const at = (y + dy) * size + x + dx;
        if (claimed[at] || Number(snapshot.catalogId[at]) !== id || !eligible(at) || altitude(at) !== altitude(index)) { complete = false; break; }
      }
      const span = complete ? declared : 1;
      for (let dy = 0; dy < span; dy += 1) for (let dx = 0; dx < span; dx += 1) claimed[(y + dy) * size + x + dx] = 1;
      const fragment = !complete;
      const label = String(entry.labelKey).replace("bonsai_catalog_", "");
      result.push({ x, y, id, category: fragment ? "infrastructure" : entry.category, size: span,
        label: fragment ? "infrastructure" : label, originalLabel: label,
        footprint: { w: span, h: span }, fragment,
        ...(!fragment && (id === 0xc6 || id === 0xc7 || id === 0xc8) ? { spriteId: id === 0xc8 ? "facility.wind" : "facility.hydro" } : {}) });
    }
    return result;
  }

  // Which way a lot faces: the side of its footprint with the most road
  // along it, as quarter turns from the composed front (+z): 0 south (+z),
  // 1 east (+x), 2 north (-z), 3 west (-x). A lot with no road beside it
  // keeps the composed front. The voxel backend turns the whole parcel; the
  // Canvas backend, holding one direction of art at a time, mirrors the
  // sprite when the turn is odd against the view, so a building's long
  // side runs along its street and its door faces it on the two sides the
  // camera sees.
  function streetQuarter(roadAt, x, y, footprint) {
    const w = (footprint && footprint.w) || 1, h = (footprint && footprint.h) || 1;
    const sides = [0, 0, 0, 0];
    for (let k = 0; k < w; k += 1) { sides[0] += roadAt(x + k, y + h) ? 1 : 0; sides[2] += roadAt(x + k, y - 1) ? 1 : 0; }
    for (let k = 0; k < h; k += 1) { sides[1] += roadAt(x + w, y + k) ? 1 : 0; sides[3] += roadAt(x - 1, y + k) ? 1 : 0; }
    let best = 0;
    for (let q = 1; q < 4; q += 1) if (sides[q] > sides[best]) best = q;
    return sides[best] ? best : 0;
  }

  window.AISystem6BonsaiRenderer = Object.freeze({
    collectCatalogObjects,
    streetQuarter,
    TILE_W,
    TILE_H,
    HEIGHT_STEP,
    MIN_ZOOM,
    MAX_ZOOM,
    DEFAULT_ZOOM,
    ZOOM_LEVELS,
    ROTATIONS,
    clampZoom,
    snapZoom,
    stepZoom,
    anchoredPan,
    seasonOf,
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
