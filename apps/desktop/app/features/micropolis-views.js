// Micropolis views / Micropolis 视图 — the data overlays, the city map, and
// the history graphs of the classic game, drawn by AI System 6.
//
// Lazy-loaded with the Micropolis shell. Everything here is a pure read of an
// engine Simulation (its block maps, its tile flags, its census histories):
// no engine code is copied, no upstream UI module is referenced. The shell
// owns the canvases; this module owns what gets painted on them.
window.AISystem6MicropolisViewsLoaded = true;

(function initMicropolisViews() {
  "use strict";

  // The eight classic data views, in the order the Maps panel lists them.
  const OVERLAY_KINDS = Object.freeze([
    "density", "landValue", "crime", "pollution", "traffic", "power", "police", "fire",
  ]);

  // Tint per view: one hue, alpha scaled by the value. Power is the one
  // two-state view: powered green, conductive-but-dark red.
  const OVERLAY_TINTS = Object.freeze({
    density: [40, 80, 220],
    landValue: [30, 150, 60],
    crime: [220, 30, 30],
    pollution: [120, 80, 20],
    traffic: [240, 150, 20],
    police: [40, 80, 220],
    fire: [220, 60, 30],
    powerOn: [40, 200, 60],
    powerOff: [230, 40, 40],
  });

  // Block-map readers: name, range, and the full-value ceiling in engine units.
  const BLOCK_MAP_VIEWS = Object.freeze({
    density: { map: "populationDensityMap", max: 510 },
    landValue: { map: "landValueMap", max: 250 },
    crime: { map: "crimeRateMap", max: 250 },
    pollution: { map: "pollutionDensityMap", max: 255 },
    traffic: { map: "trafficDensityMap", max: 240 },
    police: { map: "policeStationEffectMap", max: 1000 },
    fire: { map: "fireStationEffectMap", max: 1000 },
  });

  // Pure: a sampler (x, y) -> 0..1 for one view over one simulation.
  function overlaySampler(sim, kind) {
    if (!sim) return () => 0;
    if (kind === "power") {
      const map = sim._map;
      return (x, y) => {
        if (!map.testBounds(x, y)) return 0;
        const tile = map.getTile(x, y);
        if (!(tile.isConductive() || tile.isZone())) return 0;
        return tile.isPowered() ? 1 : 0.5;
      };
    }
    const view = BLOCK_MAP_VIEWS[kind];
    if (!view) return () => 0;
    const blockMap = sim.blockMaps[view.map];
    return (x, y) => {
      if (!sim._map.testBounds(x, y)) return 0;
      const value = blockMap.worldGet(x, y);
      return Math.max(0, Math.min(1, value / view.max));
    };
  }

  // Pure: the fill colour for a sampled value, or null for "paint nothing".
  function overlayColor(kind, value) {
    if (value <= 0) return null;
    if (kind === "power") {
      const rgb = value >= 1 ? OVERLAY_TINTS.powerOn : OVERLAY_TINTS.powerOff;
      return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.55)`;
    }
    const rgb = OVERLAY_TINTS[kind];
    if (!rgb) return null;
    const alpha = 0.12 + value * 0.6;
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(2)})`;
  }

  // Paints one view over the visible tiles. view = { originX, originY,
  // tilesX, tilesY, tilePx } in the overlay canvas's own pixels.
  function drawOverlay(context, sim, kind, view) {
    const sample = overlaySampler(sim, kind);
    context.clearRect(0, 0, view.tilesX * view.tilePx, view.tilesY * view.tilePx);
    let painted = 0;
    for (let ty = 0; ty < view.tilesY; ty += 1) {
      for (let tx = 0; tx < view.tilesX; tx += 1) {
        const color = overlayColor(kind, sample(view.originX + tx, view.originY + ty));
        if (!color) continue;
        context.fillStyle = color;
        context.fillRect(tx * view.tilePx, ty * view.tilePx, view.tilePx, view.tilePx);
        painted += 1;
      }
    }
    return painted;
  }

  // The city map's base tones: water, trees, open land, built. Read from the
  // tile family the shell classifies, so the two never disagree.
  const MINIMAP_TONES = Object.freeze({
    water: "#2d5fbf",
    trees: "#2f7a3a",
    dirt: "#c9b98a",
    rubble: "#8a8a8a",
    road: "#3c3c3c",
    rail: "#5a4a3a",
    wire: "#c9b98a",
    residential: "#5fa85f",
    commercial: "#5f7fd0",
    industrial: "#c9c04a",
    other: "#9a9a9a",
  });

  // Paints the whole city at pixelsPerTile, then the view tint on top.
  function drawMiniMap(context, sim, kind, pixelsPerTile, tileKind) {
    const map = sim && sim._map;
    if (!map) return;
    const sample = kind ? overlaySampler(sim, kind) : null;
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const family = tileKind(map.getTileValue(x, y));
        context.fillStyle = MINIMAP_TONES[family] || MINIMAP_TONES.other;
        context.fillRect(x * pixelsPerTile, y * pixelsPerTile, pixelsPerTile, pixelsPerTile);
        if (!sample) continue;
        const color = overlayColor(kind, sample(x, y));
        if (!color) continue;
        context.fillStyle = color;
        context.fillRect(x * pixelsPerTile, y * pixelsPerTile, pixelsPerTile, pixelsPerTile);
      }
    }
  }

  // Draws the viewport rectangle on the city map.
  function drawMiniMapFrame(context, origin, tilesX, tilesY, pixelsPerTile, ink) {
    context.strokeStyle = ink;
    context.lineWidth = 1;
    context.strokeRect(
      origin.x * pixelsPerTile + 0.5,
      origin.y * pixelsPerTile + 0.5,
      tilesX * pixelsPerTile - 1,
      tilesY * pixelsPerTile - 1,
    );
  }

  // --- graphs ----------------------------------------------------------------

  // The six classic series; each names the census history it reads.
  const GRAPH_SERIES = Object.freeze(["res", "com", "ind", "crime", "pollution", "money"]);
  const GRAPH_RANGES = Object.freeze(["10", "120"]);

  // Pure: one series oldest -> newest. The engine keeps index 0 as the
  // newest sample, so the array is reversed for drawing.
  function graphSeries(census, seriesId, range) {
    const name = `${seriesId}Hist${range === "120" ? "120" : "10"}`;
    const history = census && Array.isArray(census[name]) ? census[name] : [];
    return history.slice().reverse().map((value) => Number(value) || 0);
  }

  // One-bit dashed lines: each series gets a pattern, never a colour.
  const GRAPH_PATTERNS = Object.freeze([[1], [1, 0], [1, 1, 0, 0], [1, 1, 1, 0], [1, 0, 0, 0], [1, 1, 0, 1, 0, 0]]);

  function drawLine1bit(context, x1, y1, x2, y2, pattern) {
    const steps = Math.max(1, Math.round(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))));
    for (let index = 0; index <= steps; index += 1) {
      if (pattern[index % pattern.length] !== 1) continue;
      const x = Math.round(x1 + ((x2 - x1) * index) / steps);
      const y = Math.round(y1 + ((y2 - y1) * index) / steps);
      context.fillRect(x, y, 1, 1);
    }
  }

  // Draws the selected series into a size = { width, height } chart. Returns
  // the number of series drawn (0 when no history exists yet).
  function drawGraph(context, census, seriesIds, range, size, ink) {
    const pad = 8;
    const plotW = size.width - pad * 2;
    const plotH = size.height - pad * 2;
    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = ink;
    context.fillRect(pad, pad, 1, plotH);
    context.fillRect(pad, pad + plotH - 1, plotW, 1);
    let drawn = 0;
    seriesIds.forEach((seriesId) => {
      const values = graphSeries(census, seriesId, range);
      if (values.length < 2) return;
      const max = Math.max(1, ...values);
      const step = plotW / (values.length - 1);
      const pattern = GRAPH_PATTERNS[GRAPH_SERIES.indexOf(seriesId) % GRAPH_PATTERNS.length];
      for (let index = 0; index < values.length - 1; index += 1) {
        const x1 = pad + index * step;
        const y1 = pad + plotH - (values[index] / max) * (plotH - 1);
        const x2 = pad + (index + 1) * step;
        const y2 = pad + plotH - (values[index + 1] / max) * (plotH - 1);
        drawLine1bit(context, x1, y1, x2, y2, pattern);
      }
      drawn += 1;
    });
    return drawn;
  }

  window.AISystem6MicropolisViews = Object.freeze({
    OVERLAY_KINDS,
    GRAPH_SERIES,
    GRAPH_RANGES,
    GRAPH_PATTERNS,
    overlaySampler,
    overlayColor,
    drawOverlay,
    drawMiniMap,
    drawMiniMapFrame,
    graphSeries,
    drawGraph,
  });
})();
