// Bonsai City production Canvas 2D renderer / 盆景城市 Canvas 2D 渲染器.
//
// Six same-sized canvas layers consume read-only render snapshots. Container
// geometry is the sole source of CSS size; canvas backing stores never feed
// layout. Static terrain and infrastructure use 16x16 offscreen chunks, while
// agents, feedback, and lighting redraw only when their inputs change.
window.AISystem6BonsaiCanvasRendererLoaded = true;

(function initBonsaiCanvasRenderer() {
  "use strict";

  const MATH = window.AISystem6BonsaiRenderer;
  const LAYERS = Object.freeze(["terrain", "infrastructure", "buildings", "agents", "feedback", "lighting"]);
  const DIRECTIONS = Object.freeze(["north", "east", "south", "west"]);
  const OVERLAYS = Object.freeze(["none", "power", "water", "traffic", "pollution", "land-value", "police", "fire", "education", "health"]);
  const CHUNK_SIZE = 16;
  const MAX_CHUNK_CACHE = 72;
  const OVER = Object.freeze({ NONE: 0, ROAD: 1, WIRE: 2, PARK: 3, ROADWIRE: 4 });
  const ZONE = Object.freeze({ NONE: 0, R: 1, C: 2, I: 3 });

  const state = {
    mounted: false,
    ready: false,
    disposed: false,
    stack: null,
    canvases: {},
    contexts: {},
    createdCanvases: new Set(),
    observer: null,
    cssWidth: 0,
    cssHeight: 0,
    backingWidth: 0,
    backingHeight: 0,
    dpr: 1,
    images: {},
    imagePromises: {},
    imageFailures: {},
    snapshot: null,
    preview: null,
    previewRevision: 0,
    overlay: "none",
    // The four 选项 display switches (M4): buildings / infrastructure /
    // zones visible, and the underground view. The shell passes them through
    // render()'s viewState; they never enter a save.
    display: { buildings: true, infrastructure: true, zones: true, underground: false },
    camera: { zoom: MATH?.DEFAULT_ZOOM || 0.82, rotation: 0, panX: 0, panY: 0 },
    chunkCache: new Map(),
    chunkBuildCount: 0,
    cacheClock: 0,
    visibleTileCount: 0,
    activeRaf: 0,
    lastKeys: {},
  };

  function isCanvas(node) {
    return Boolean(node && String(node.tagName || "").toLowerCase() === "canvas");
  }

  function resolveStack(target) {
    if (!target) throw new Error("bonsai-canvas-mount-target");
    if (!isCanvas(target)) return target;
    if (typeof target.closest === "function") {
      const owned = target.closest("[data-bonsai-map-stack]");
      if (owned) return owned;
    }
    return target.parentElement || target;
  }

  function queryLayer(stack, name) {
    if (typeof stack.querySelector !== "function") return null;
    return stack.querySelector(`canvas[data-bonsai-layer="${name}"]`);
  }

  function createLayer(stack, name, legacyCanvas) {
    let canvas = queryLayer(stack, name);
    if (!canvas && name === "terrain" && isCanvas(legacyCanvas)) canvas = legacyCanvas;
    if (!canvas) {
      canvas = document.createElement("canvas");
      stack.appendChild(canvas);
      state.createdCanvases.add(canvas);
    }
    canvas.dataset.bonsaiLayer = name;
    canvas.setAttribute("aria-hidden", "true");
    const context = canvas.getContext("2d", { alpha: name !== "terrain" });
    if (!context) throw new Error(`bonsai-canvas-context-${name}`);
    context.imageSmoothingEnabled = false;
    state.canvases[name] = canvas;
    state.contexts[name] = context;
  }

  function containerRect() {
    if (!state.stack || typeof state.stack.getBoundingClientRect !== "function") return { width: 1, height: 1 };
    const rect = state.stack.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  function requestedDpr(value) {
    if (Number.isFinite(value) && value > 0) return value;
    const globalDpr = Number(window.devicePixelRatio);
    return Number.isFinite(globalDpr) && globalDpr > 0 ? globalDpr : 1;
  }

  function clearContext(name) {
    const context = state.contexts[name];
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, state.backingWidth, state.backingHeight);
    context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    context.imageSmoothingEnabled = false;
  }

  function clearAllLayers() {
    LAYERS.forEach(clearContext);
  }

  function invalidateView() {
    state.lastKeys = {};
  }

  function resize(width, height, dpr) {
    const measured = containerRect();
    const cssWidth = Math.max(1, Math.round(Number.isFinite(width) ? width : measured.width));
    const cssHeight = Math.max(1, Math.round(Number.isFinite(height) ? height : measured.height));
    const nextDpr = requestedDpr(dpr);
    const backingWidth = Math.max(1, Math.round(cssWidth * nextDpr));
    const backingHeight = Math.max(1, Math.round(cssHeight * nextDpr));
    if (
      cssWidth === state.cssWidth
      && cssHeight === state.cssHeight
      && backingWidth === state.backingWidth
      && backingHeight === state.backingHeight
      && nextDpr === state.dpr
    ) return;

    const dprChanged = nextDpr !== state.dpr;
    state.cssWidth = cssWidth;
    state.cssHeight = cssHeight;
    state.backingWidth = backingWidth;
    state.backingHeight = backingHeight;
    state.dpr = nextDpr;
    LAYERS.forEach((name) => {
      const canvas = state.canvases[name];
      if (!canvas) return;
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;
      state.contexts[name].imageSmoothingEnabled = false;
    });
    if (dprChanged) clearChunkCache();
    invalidateView();
    if (state.snapshot) render(state.snapshot);
  }

  function observeContainer() {
    if (state.observer || typeof ResizeObserver !== "function" || !state.stack) return;
    state.observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === state.stack) || entries[0];
      if (!entry || !entry.contentRect) return;
      resize(entry.contentRect.width, entry.contentRect.height);
    });
    state.observer.observe(state.stack);
  }

  function scheduleRender() {
    if (!state.snapshot || state.activeRaf || state.disposed) return;
    if (typeof requestAnimationFrame !== "function") {
      render(state.snapshot);
      return;
    }
    state.activeRaf = requestAnimationFrame(() => {
      state.activeRaf = 0;
      if (!state.disposed && state.snapshot) render(state.snapshot);
    });
  }

  // The origin serves assets with max-age=86400 and these PNGs keep stable
  // paths, so a release that redraws the atlas would leave returning visitors
  // on yesterday's art for up to a day. The generator records each file's
  // sha256 in the same statement that writes the file, so the digest cannot
  // drift from the bytes; stamping with it changes the URL exactly when the
  // art changes, and a release that leaves the atlas alone keeps the cache.
  function atlasImageUrl(entry) {
    const url = entry && entry.url ? String(entry.url) : "";
    if (!url || url.includes("?")) return url;
    const digest = entry && entry.sha256 ? String(entry.sha256).slice(0, 16) : "";
    return digest ? `${url}?v=${digest}` : url;
  }

  function loadAtlasImages() {
    const atlas = window.AISystem6BonsaiAtlas;
    const direction = DIRECTIONS[state.camera.rotation];
    if (state.imagePromises[direction]) return state.imagePromises[direction];
    if (!atlas || typeof Image !== "function") {
      state.imagePromises[direction] = Promise.resolve();
      return state.imagePromises[direction];
    }
    state.imagePromises[direction] = new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => { if (!state.disposed) state.images[direction] = image; resolve(); };
      image.onerror = () => { if (!state.disposed) state.imageFailures[direction] = true; resolve(); };
      image.src = atlasImageUrl(atlas.directions[direction]);
    });
    state.imagePromises[direction].then(() => {
      if (state.disposed) return;
      if (DIRECTIONS[state.camera.rotation] !== direction) return;
      clearChunkCache();
      invalidateView();
      scheduleRender();
    });
    return state.imagePromises[direction];
  }

  async function mount(target) {
    const stack = resolveStack(target);
    if (state.mounted && stack === state.stack && !state.disposed) return loadAtlasImages();
    if (state.mounted) dispose();
    state.disposed = false;
    state.mounted = true;
    state.stack = stack;
    const legacyCanvas = isCanvas(target) ? target : null;
    LAYERS.forEach((name) => createLayer(stack, name, legacyCanvas));
    resize();
    observeContainer();
    state.ready = true;
    await loadAtlasImages();
  }

  function isReady() {
    return state.ready && !state.disposed;
  }

  function mapSize(snapshot) {
    if (Number.isInteger(snapshot?.size) && snapshot.size > 0) return snapshot.size;
    const layer = snapshot?.alt || snapshot?.height || snapshot?.terrain;
    const root = Math.sqrt(layer?.length || 0);
    return Number.isInteger(root) && root > 0 ? root : 64;
  }

  function gridValue(snapshot, names, index, fallback = 0) {
    for (const name of names) {
      const layer = snapshot?.[name];
      if (layer && layer[index] !== undefined) return layer[index];
    }
    return fallback;
  }

  function altitudeAt(snapshot, index) {
    const value = Number(gridValue(snapshot, ["alt", "height", "elevation"], index, 0));
    return Number.isFinite(value) ? value : 0;
  }

  function isWater(snapshot, index) {
    const terrainType = gridValue(snapshot, ["terrainType"], index, null);
    return Boolean(gridValue(snapshot, ["water"], index, false) || terrainType === "water" || terrainType === 1);
  }

  function isRoad(snapshot, index) {
    const over = gridValue(snapshot, ["over"], index, OVER.NONE);
    return Boolean(gridValue(snapshot, ["road", "roads"], index, false) || over === OVER.ROAD || over === OVER.ROADWIRE);
  }

  function isWire(snapshot, index) {
    const over = gridValue(snapshot, ["over"], index, OVER.NONE);
    return Boolean(gridValue(snapshot, ["wire", "wires", "powerLines"], index, false) || over === OVER.WIRE || over === OVER.ROADWIRE);
  }

  function isRail(snapshot, index) {
    return Boolean(gridValue(snapshot, ["rail", "rails", "railway"], index, false));
  }

  function isTunnel(snapshot, index) {
    return Boolean(gridValue(snapshot, ["tunnel"], index, false));
  }

  function isPipe(snapshot, index) {
    return Boolean(gridValue(snapshot, ["pipe", "pipes", "waterPipes"], index, false));
  }

  function isHighway(snapshot, index) {
    return Boolean(gridValue(snapshot, ["highway"], index, false));
  }

  function isOnramp(snapshot, index) {
    return Boolean(gridValue(snapshot, ["onramp"], index, false));
  }

  function cameraFor(snapshot, originless = false) {
    const size = mapSize(snapshot);
    const zoom = state.camera.zoom;
    const mapCenterY = (size - 1) * (MATH.TILE_H / 2) * zoom;
    return MATH.createCamera({
      size,
      zoom,
      rotation: state.camera.rotation,
      originX: originless ? 0 : state.cssWidth / 2 + state.camera.panX,
      originY: originless ? 0 : state.cssHeight / 2 - mapCenterY + state.camera.panY,
    });
  }

  function projectPoint(snapshot, x, y, altitude, originless = false) {
    return MATH.project(x, y, altitude, cameraFor(snapshot, originless), mapSize(snapshot));
  }

  function visibleTiles(snapshot) {
    const size = mapSize(snapshot);
    const alt = snapshot.alt || snapshot.height || snapshot.elevation || null;
    return MATH.visibleTiles(size, cameraFor(snapshot), {
      left: 0,
      top: 0,
      right: state.cssWidth,
      bottom: state.cssHeight,
    }, alt, { margin: 12, maxAltitude: 8 });
  }

  function atlasFrame(name) {
    return window.AISystem6BonsaiAtlas?.frames?.[name] || null;
  }

  function currentAtlasImage() {
    return state.images[DIRECTIONS[state.camera.rotation]] || null;
  }

  // Placeholder mass for imported tiles the layer model does not render
  // yet: one tinted block per tile, colored by catalog category. Bespoke
  // micro-voxel recipes replace these as the catalog art lands.
  const CATALOG_COLORS = Object.freeze({
    rubble: "#7c7168", radioactive: "#86a03a", construction: "#a08f6a", abandoned: "#6e6258",
    powerPlant: "#6f6f78", service: "#7a6fae", infrastructure: "#8a8f98",
    arcology: "#4f8f7a", dome: "#c0a040", highway: "#4a4a52", bridge: "#4a4a52",
    onramp: "#4a4a52", tunnel: "#5a5148", subRail: "#66707a", parkSmall: "#5f9550",
    residential: "#b75d52", commercial: "#486eaf", industrial: "#b67c3b",
  });
  function fallbackDiamond(context, sx, sy, color, outline) {
    const halfW = (MATH.TILE_W / 2) * state.camera.zoom;
    const halfH = (MATH.TILE_H / 2) * state.camera.zoom;
    context.beginPath();
    context.moveTo(Math.round(sx), Math.round(sy - halfH));
    context.lineTo(Math.round(sx + halfW), Math.round(sy));
    context.lineTo(Math.round(sx), Math.round(sy + halfH));
    context.lineTo(Math.round(sx - halfW), Math.round(sy));
    context.closePath();
    context.fillStyle = color;
    context.fill();
    if (outline) { context.strokeStyle = outline; context.lineWidth = 1; context.stroke(); }
  }

  // SC2000's soft ground shadow: a translucent diamond offset toward the
  // lower-right, under buildings, trees, and landmarks, so tall objects sit
  // on the ground instead of floating on the tile.
  function drawDropShadow(context, point, zoom = state.camera.zoom) {
    context.fillStyle = "rgba(22, 28, 24, 0.2)";
    context.beginPath();
    const ox = point.sx + 3 * zoom;
    const oy = point.sy + 4 * zoom;
    context.moveTo(ox, oy - 6 * zoom);
    context.lineTo(ox + 12 * zoom, oy);
    context.lineTo(ox, oy + 6 * zoom);
    context.lineTo(ox - 12 * zoom, oy);
    context.closePath();
    context.fill();
  }

  function drawSprite(context, name, sx, sy) {
    const frame = atlasFrame(name);
    const image = currentAtlasImage();
    if (!frame || !image) return false;
    const zoom = state.camera.zoom;
    context.drawImage(
      image,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      Math.round(sx - frame.anchor.x * zoom),
      Math.round(sy - frame.anchor.y * zoom),
      Math.round(frame.w * zoom),
      Math.round(frame.h * zoom)
    );
    return true;
  }

  function terrainSprite(snapshot, index) {
    if (isWater(snapshot, index)) return "terrain.water";
    const terrain = gridValue(snapshot, ["terrainType", "terrain"], index, null);
    if (terrain === "coast" || gridValue(snapshot, ["coast", "shore"], index, false)) return "terrain.coast";
    if (terrain === "slope" || gridValue(snapshot, ["slope"], index, false)) {
      // The simulator records THAT a tile is a slope, not which way it falls,
      // so one sprite used to serve every orientation and a hillside read as a
      // staircase. Derive the fall from the neighbours that stand higher and
      // ask for the matching face; mask 0 keeps the flat sprite.
      const size = mapSize(snapshot);
      const x = index % size;
      const y = Math.floor(index / size);
      const here = altitudeAt(snapshot, index);
      let mask = 0;
      if (y > 0 && altitudeAt(snapshot, index - size) > here) mask |= 1;
      if (x < size - 1 && altitudeAt(snapshot, index + 1) > here) mask |= 2;
      if (y < size - 1 && altitudeAt(snapshot, index + size) > here) mask |= 4;
      if (x > 0 && altitudeAt(snapshot, index - 1) > here) mask |= 8;
      const oriented = `terrain.slope.mask-${mask}`;
      return atlasFrame(oriented) ? oriented : "terrain.slope";
    }
    if (terrain === "rock" || terrain === 3) return "terrain.rock";
    if (terrain === "soil" || terrain === 2) return "terrain.soil";
    // Snow: peaks above the snow line always, plus the whole lowland in
    // winter — the OpenTTD-principled terrain read from the snapshot calendar.
    const winter = Math.floor(((Number(snapshot.tick) || 0) % 1500) / 375) === 3;
    if ((terrain === "grass" || terrain === "slope" || terrain === null)
      && (altitudeAt(snapshot, index) >= 24 || winter)) {
      return "terrain.snow";
    }
    return "terrain.grass";
  }

  function connectorMask(snapshot, x, y, predicate) {
    const size = mapSize(snapshot);
    let mask = 0;
    if (y > 0 && predicate(snapshot, (y - 1) * size + x)) mask |= 1;
    if (x < size - 1 && predicate(snapshot, y * size + x + 1)) mask |= 2;
    if (y < size - 1 && predicate(snapshot, (y + 1) * size + x)) mask |= 4;
    if (x > 0 && predicate(snapshot, y * size + x - 1)) mask |= 8;
    return mask;
  }

  function drawTerrainTile(context, snapshot, x, y) {
    const size = mapSize(snapshot);
    const index = y * size + x;
    const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, index), true);
    if (!drawSprite(context, terrainSprite(snapshot, index), point.sx, point.sy)) {
      fallbackDiamond(context, point.sx, point.sy, isWater(snapshot, index) ? "#3979a8" : "#6b9f57", "#385b35");
    }
    drawCliffShadows(context, snapshot, x, y, point);
  }

  // SC2000 stepped-terrain depth: a dark band along each edge that borders a
  // higher tile, so plateaus and cliffs read as stacked ground instead of a
  // flat colour change.
  function drawCliffShadows(context, snapshot, x, y, point) {
    const size = mapSize(snapshot);
    const index = y * size + x;
    const alt = altitudeAt(snapshot, index);
    const zoom = state.camera.zoom;
    const neighbors = [[0, -1, "n"], [1, 0, "e"], [0, 1, "s"], [-1, 0, "w"]];
    const edges = {
      n: [[0, -12], [24, 0], [-3, 2]],
      s: [[-24, 0], [0, 12], [3, -2]],
      e: [[24, 0], [0, 12], [-3, -2]],
      w: [[0, -12], [-24, 0], [3, 2]],
    };
    for (const [dx, dy, dir] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (altitudeAt(snapshot, ny * size + nx) <= alt) continue;
      const [a, b, inward] = edges[dir];
      context.fillStyle = "rgba(15, 20, 17, 0.22)";
      context.beginPath();
      context.moveTo(point.sx + a[0] * zoom, point.sy + a[1] * zoom);
      context.lineTo(point.sx + b[0] * zoom, point.sy + b[1] * zoom);
      context.lineTo(point.sx + (b[0] + inward[0]) * zoom, point.sy + (b[1] + inward[1]) * zoom);
      context.lineTo(point.sx + (a[0] + inward[0]) * zoom, point.sy + (a[1] + inward[1]) * zoom);
      context.closePath();
      context.fill();
    }
  }

  function drawConnector(context, snapshot, x, y, family, predicate) {
    const size = mapSize(snapshot);
    const index = y * size + x;
    if (!predicate(snapshot, index)) return;
    const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, index), true);
    const mask = connectorMask(snapshot, x, y, predicate);
    // Over water, road and rail tiles draw their deck family so crossings
    // read as bridges with guard rails, not floating ribbons.
    const bridgeFamily = isWater(snapshot, index)
      ? (family === "road" ? "bridge-road" : family === "rail" ? "bridge-rail" : null)
      : null;
    const frameFamily = bridgeFamily || family;
    if (!drawSprite(context, `${frameFamily}.mask-${mask}`, point.sx, point.sy)) {
      context.fillStyle = family === "road" ? "#555" : family === "rail" ? "#443c35" : "#292929";
      context.fillRect(point.sx - 9 * state.camera.zoom, point.sy - 2 * state.camera.zoom, 18 * state.camera.zoom, 4 * state.camera.zoom);
    }
    if (family === "road" && isTunnel(snapshot, index)) drawTunnelOverlay(context, snapshot, x, y, point);
  }

  // Road bores: a dark diamond over the tunnel tile plus portal frames at
  // the open ends, matching the 3D backend's tunnel look.
  function drawTunnelOverlay(context, snapshot, x, y, point) {
    const size = mapSize(snapshot);
    const index = y * size + x;
    const zoom = state.camera.zoom;
    context.fillStyle = "rgba(12, 14, 16, 0.48)";
    fallbackDiamond(context, point.sx, point.sy, "rgba(12,14,16,0.48)", null);
    const mask = connectorMask(snapshot, x, y, (snap, i) => isTunnel(snap, i));
    // The four shared-edge midpoints, in the same projection the tiles use.
    const edges = [
      { bit: 1, ex: 12, ey: -6, ok: y > 0 },
      { bit: 2, ex: 12, ey: 6, ok: x < size - 1 },
      { bit: 4, ex: -12, ey: 6, ok: y < size - 1 },
      { bit: 8, ex: -12, ey: -6, ok: x > 0 },
    ];
    context.fillStyle = "#0b0d0f";
    edges.forEach((edge) => {
      if ((mask & edge.bit) || !edge.ok) return;
      const mx = point.sx + edge.ex * zoom;
      const my = point.sy + edge.ey * zoom;
      // A portal lintel lies along the edge, which runs at the tile's own angle.
      context.beginPath();
      context.moveTo(mx - edge.ey * 0.9 * zoom, my + edge.ex * 0.45 * zoom);
      context.lineTo(mx + edge.ey * 0.9 * zoom, my - edge.ex * 0.45 * zoom);
      context.lineWidth = Math.max(1, 3 * zoom);
      context.strokeStyle = "#0b0d0f";
      context.stroke();
    });
  }

  // Highways and onramps draw their bespoke atlas frames now: a
  // direction-aware deck with centre line and edge stripes (bridge deck over
  // water), and a mask-driven ramp wedge. Procedural rects remain only as a
  // graceful fallback.
  function drawHighway(context, snapshot, x, y) {
    const size = mapSize(snapshot);
    const index = y * size + x;
    const highway = isHighway(snapshot, index);
    const onramp = isOnramp(snapshot, index);
    if (!highway && !onramp) return;
    const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, index), true);
    const zoom = state.camera.zoom;
    if (highway) {
      const mask = connectorMask(snapshot, x, y, isHighway);
      const family = isWater(snapshot, index) ? "bridge-highway" : "highway";
      if (family === "highway") {
        // The deck is elevated: a soft ground shadow slides out from under
        // the slab toward the lower-right, the SC2000 raised-object read.
        context.fillStyle = "rgba(22, 28, 24, 0.18)";
        context.beginPath();
        context.moveTo(point.sx + 4 * zoom, point.sy - 7 * zoom);
        context.lineTo(point.sx + 28 * zoom, point.sy + 5 * zoom);
        context.lineTo(point.sx + 4 * zoom, point.sy + 17 * zoom);
        context.lineTo(point.sx - 20 * zoom, point.sy + 5 * zoom);
        context.closePath();
        context.fill();
      }
      if (!drawSprite(context, `${family}.mask-${mask}`, point.sx, point.sy)) {
        context.fillStyle = "#4a4a52";
        context.fillRect(point.sx - 11 * zoom, point.sy - 7 * zoom, 22 * zoom, 8 * zoom);
        context.fillStyle = "#8d8d76";
        context.fillRect(point.sx - 9 * zoom, point.sy - 4 * zoom, 18 * zoom, 1 * zoom);
      }
      return;
    }
    // A ramp has two ends: a highway side (wide) and a road side (narrow).
    // When each side has exactly one neighbour, pick the orientation frame;
    // otherwise fall back to the mask ribbon.
    const hMask = connectorMask(snapshot, x, y, (snap, i) => isHighway(snap, i) || isOnramp(snap, i));
    const rMask = connectorMask(snapshot, x, y, isRoad);
    const dirs = (mask) => ["n", "e", "s", "w"].filter((_, bit) => mask & (1 << bit));
    const hDirs = dirs(hMask);
    const rDirs = dirs(rMask);
    const orientation = hDirs.length === 1 && rDirs.length === 1 ? `onramp.${hDirs[0]}${rDirs[0]}` : null;
    const onrampMask = connectorMask(snapshot, x, y, (snap, i) => isRoad(snap, i) || isHighway(snap, i) || isOnramp(snap, i));
    const onrampFrame = orientation && atlasFrame(orientation) ? orientation : `onramp.mask-${onrampMask}`;
    if (!drawSprite(context, onrampFrame, point.sx, point.sy)) {
      context.fillStyle = "#5a5a60";
      context.beginPath();
      context.moveTo(point.sx - 9 * zoom, point.sy + 1 * zoom);
      context.lineTo(point.sx + 9 * zoom, point.sy - 6 * zoom);
      context.lineTo(point.sx + 9 * zoom, point.sy - 1 * zoom);
      context.lineTo(point.sx - 9 * zoom, point.sy + 3 * zoom);
      context.closePath();
      context.fill();
    }
  }

  function zoneColor(zone) {
    if (zone === ZONE.R || zone === "r" || zone === "residential") return "rgba(199,79,70,0.26)";
    if (zone === ZONE.C || zone === "c" || zone === "commercial") return "rgba(61,99,181,0.26)";
    if (zone === ZONE.I || zone === "i" || zone === "industrial") return "rgba(197,139,54,0.26)";
    if (zone === 4 || zone === "military") return "rgba(122,132,82,0.55)";
    if (zone === 5 || zone === "airport") return "rgba(162,168,174,0.6)";
    if (zone === 6 || zone === "seaport") return "rgba(124,148,158,0.6)";
    return null;
  }

  function normalizeFootprint(value, fallbackWidth = 1, fallbackHeight = fallbackWidth) {
    if (Array.isArray(value)) return { w: Math.max(1, Number(value[0]) || 1), h: Math.max(1, Number(value[1]) || 1) };
    if (value && typeof value === "object") {
      return { w: Math.max(1, Number(value.w || value.width) || 1), h: Math.max(1, Number(value.h || value.height) || 1) };
    }
    return { w: Math.max(1, Number(fallbackWidth) || 1), h: Math.max(1, Number(fallbackHeight) || 1) };
  }

  function drawZone(context, snapshot, x, y) {
    const size = mapSize(snapshot);
    const index = y * size + x;
    const color = zoneColor(gridValue(snapshot, ["zone", "zoneType"], index, ZONE.NONE));
    if (!color) return;
    const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, index), true);
    fallbackDiamond(context, point.sx, point.sy, color, null);
    const zone = gridValue(snapshot, ["zone", "zoneType"], index, ZONE.NONE);
    if (zone === ZONE.R || zone === ZONE.C || zone === ZONE.I) {
      // A whisper of a hatch — three short strokes — so claimed land stays
      // calm and clean rather than busy.
      const zoom = state.camera.zoom;
      context.strokeStyle = "rgba(255,255,255,0.08)";
      context.lineWidth = 1;
      for (let i = -1; i <= 1; i += 1) {
        context.beginPath();
        context.moveTo(point.sx - 9 * zoom + i * 7 * zoom, point.sy - 4 * zoom + i * 3.5 * zoom);
        context.lineTo(point.sx - 9 * zoom + i * 7 * zoom + 18 * zoom, point.sy + 4 * zoom - i * 3.5 * zoom);
        context.stroke();
      }
    }
    if (zone === 5 || zone === "airport") {
      // A runway centre line makes the airport pad read as an airfield. It has
      // to run along the tile's own axes: a screen-axis bar crosses the diamond
      // diagonally and the markings of neighbouring tiles never line up, the
      // same error the tunnel portals used to make.
      const zoom = state.camera.zoom;
      context.strokeStyle = "rgba(245,245,240,0.75)";
      context.lineWidth = Math.max(1, 2 * zoom);
      for (const axis of [{ dx: 12, dy: 6 }, { dx: -12, dy: 6 }]) {
        context.beginPath();
        context.moveTo(point.sx - axis.dx * zoom, point.sy - axis.dy * zoom);
        context.lineTo(point.sx + axis.dx * zoom, point.sy + axis.dy * zoom);
        context.stroke();
      }
      if (hashInt(Number(snapshot.seed) || 0, 0, index) % 7 === 0) drawControlTower(context, point);
    }
    if (zone === 6 || zone === "seaport") {
      if (hashInt(Number(snapshot.seed) || 0, 0, index) % 7 === 0) drawDockCrane(context, point);
    }
  }

  // SC2000 port signatures: a control tower on airport pads, a dock crane on
  // seaport pads — sparse, deterministic per seed and tile.
  function drawControlTower(context, point) {
    const zoom = state.camera.zoom;
    context.fillStyle = "#c8c2b4";
    context.fillRect(point.sx - 3 * zoom, point.sy - 26 * zoom, 6 * zoom, 18 * zoom);
    context.fillStyle = "#e4e0d2";
    context.fillRect(point.sx - 5 * zoom, point.sy - 30 * zoom, 10 * zoom, 5 * zoom);
    context.fillStyle = "#d1483a";
    context.fillRect(point.sx - 1 * zoom, point.sy - 34 * zoom, 2 * zoom, 2 * zoom);
  }

  function drawDockCrane(context, point) {
    const zoom = state.camera.zoom;
    context.strokeStyle = "#8a8a80";
    context.lineWidth = Math.max(1, 1.5 * zoom);
    context.beginPath();
    context.moveTo(point.sx - 8 * zoom, point.sy - 2 * zoom);
    context.lineTo(point.sx - 2 * zoom, point.sy - 18 * zoom);
    context.lineTo(point.sx + 8 * zoom, point.sy - 2 * zoom);
    context.moveTo(point.sx - 2 * zoom, point.sy - 18 * zoom);
    context.lineTo(point.sx + 4 * zoom, point.sy - 18 * zoom);
    context.stroke();
    context.fillStyle = "#d1483a";
    context.fillRect(point.sx + 3 * zoom, point.sy - 12 * zoom, 1.5 * zoom, 6 * zoom);
  }

  function normalizeFacilityKind(kind) {
    const value = String(kind || "").toLowerCase();
    // Exact new kinds first: substring rules below would misfile them.
    for (const exact of ["hydro", "oil", "gas", "nuclear", "solar", "microwave", "fusion", "treatment", "desal", "subway-station", "bus"]) {
      if (value === exact) return exact;
    }
    if (value.includes("coal") || value.includes("power")) return "coal";
    if (value.includes("wind")) return "wind";
    if (value.includes("pump")) return "pump";
    if (value.includes("tower")) return "tower";
    if (value.includes("police")) return "police";
    if (value.includes("fire")) return "fire";
    if (value.includes("school") || value.includes("education")) return "school";
    if (value.includes("clinic") || value.includes("hospital") || value.includes("medical")) return "clinic";
    if (value.includes("station") || value.includes("rail")) return "station";
    return "school";
  }

  function facilityObjects(snapshot) {
    const result = [];
    const lists = Array.isArray(snapshot.facilities) ? [snapshot.facilities] : [snapshot.plants, snapshot.services];
    lists.forEach((list) => {
      if (!Array.isArray(list)) return;
      list.forEach((object) => {
        if (!Number.isFinite(object.x) || !Number.isFinite(object.y)) return;
        const kind = normalizeFacilityKind(object.kind || object.type);
        const frame = atlasFrame(`facility.${kind}`);
        result.push({
          ...object,
          kind,
          footprint: normalizeFootprint(object.footprint || frame?.footprint),
        });
      });
    });
    return result;
  }

  function drawFacility(context, snapshot, object, originless = true) {
    const size = mapSize(snapshot);
    const x = object.x + ((object.footprint?.w || 1) - 1) / 2;
    const y = object.y + ((object.footprint?.h || 1) - 1) / 2;
    const baseX = Math.max(0, Math.min(size - 1, Math.floor(object.x)));
    const baseY = Math.max(0, Math.min(size - 1, Math.floor(object.y)));
    const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, baseY * size + baseX), originless);
    drawDropShadow(context, point);
    drawSprite(context, nightFrame(`facility.${object.kind}`, snapshot), point.sx, point.sy);
  }

  function fnvUpdate(hash, value) {
    hash ^= Number(value) | 0;
    return Math.imul(hash, 16777619) >>> 0;
  }

  function fnvAny(hash, value) {
    if (typeof value !== "string") return fnvUpdate(hash, value);
    for (const char of value) hash = fnvUpdate(hash, char.charCodeAt(0));
    return hash;
  }

  function chunkSignature(snapshot, layer, chunkX, chunkY) {
    const size = mapSize(snapshot);
    const startX = chunkX * CHUNK_SIZE;
    const startY = chunkY * CHUNK_SIZE;
    const endX = Math.min(size, startX + CHUNK_SIZE);
    const endY = Math.min(size, startY + CHUNK_SIZE);
    let hash = 2166136261;
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const index = y * size + x;
        hash = fnvUpdate(hash, altitudeAt(snapshot, index));
        if (layer === "terrain") {
          hash = fnvUpdate(hash, isWater(snapshot, index));
          hash = fnvUpdate(hash, String(gridValue(snapshot, ["terrainType", "terrain"], index, "")).length);
        } else {
          hash = fnvUpdate(hash, isRoad(snapshot, index));
          hash = fnvUpdate(hash, isRail(snapshot, index));
          hash = fnvUpdate(hash, isWire(snapshot, index));
          hash = fnvUpdate(hash, isPipe(snapshot, index));
          hash = fnvUpdate(hash, isHighway(snapshot, index));
          hash = fnvUpdate(hash, isOnramp(snapshot, index));
          hash = fnvAny(hash, gridValue(snapshot, ["zone", "zoneType"], index, 0));
        }
      }
    }
    if (layer === "terrain") {
      hash = fnvUpdate(hash, Math.floor(((Number(snapshot.tick) || 0) % 1500) / 375));
    }
    if (layer === "infrastructure") {
      hash = fnvUpdate(hash, isNight(snapshot) ? 1 : 0);
      // The M4 display switches alter what this chunk draws, so they are part
      // of its identity — otherwise toggling re-composes from stale chunks.
      hash = fnvUpdate(hash, state.display.zones ? 1 : 0);
      hash = fnvUpdate(hash, state.display.infrastructure ? 1 : 0);
      facilityObjects(snapshot).filter((object) => (
        object.x >= startX && object.x < endX && object.y >= startY && object.y < endY
      )).forEach((object) => {
        hash = fnvUpdate(hash, object.x);
        hash = fnvUpdate(hash, object.y);
        for (const char of object.kind) hash = fnvUpdate(hash, char.charCodeAt(0));
      });
    }
    return hash.toString(16);
  }

  function chunkBounds(snapshot, chunkX, chunkY) {
    const size = mapSize(snapshot);
    const startX = chunkX * CHUNK_SIZE;
    const startY = chunkY * CHUNK_SIZE;
    const endX = Math.min(size - 1, startX + CHUNK_SIZE - 1);
    const endY = Math.min(size - 1, startY + CHUNK_SIZE - 1);
    const points = [
      projectPoint(snapshot, startX, startY, 12, true),
      projectPoint(snapshot, endX, startY, 12, true),
      projectPoint(snapshot, startX, endY, 12, true),
      projectPoint(snapshot, endX, endY, 12, true),
      projectPoint(snapshot, startX, startY, 0, true),
      projectPoint(snapshot, endX, endY, 0, true),
    ];
    const marginX = 92 * state.camera.zoom;
    const marginTop = 128 * state.camera.zoom;
    const marginBottom = 42 * state.camera.zoom;
    const minX = Math.floor(Math.min(...points.map((point) => point.sx)) - marginX);
    const maxX = Math.ceil(Math.max(...points.map((point) => point.sx)) + marginX);
    const minY = Math.floor(Math.min(...points.map((point) => point.sy)) - marginTop);
    const maxY = Math.ceil(Math.max(...points.map((point) => point.sy)) + marginBottom);
    return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }

  function makeOffscreen(width, height) {
    const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(width, height) : document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function buildChunk(snapshot, layer, chunkX, chunkY, signature) {
    const bounds = chunkBounds(snapshot, chunkX, chunkY);
    const canvas = makeOffscreen(Math.max(1, Math.round(bounds.width * state.dpr)), Math.max(1, Math.round(bounds.height * state.dpr)));
    const context = canvas.getContext("2d", { alpha: true });
    context.imageSmoothingEnabled = false;
    context.setTransform(state.dpr, 0, 0, state.dpr, -bounds.minX * state.dpr, -bounds.minY * state.dpr);
    const size = mapSize(snapshot);
    const startX = chunkX * CHUNK_SIZE;
    const startY = chunkY * CHUNK_SIZE;
    const endX = Math.min(size, startX + CHUNK_SIZE);
    const endY = Math.min(size, startY + CHUNK_SIZE);
    const tiles = [];
    for (let y = startY; y < endY; y += 1) for (let x = startX; x < endX; x += 1) tiles.push([x, y]);
    tiles.sort((a, b) => MATH.depthKey(a[0], a[1], size, state.camera.rotation) - MATH.depthKey(b[0], b[1], size, state.camera.rotation));
    if (layer === "terrain") {
      tiles.forEach(([x, y]) => drawTerrainTile(context, snapshot, x, y));
    } else {
      tiles.forEach(([x, y]) => {
        if (state.display.zones) drawZone(context, snapshot, x, y);
        if (state.display.infrastructure) {
          drawConnector(context, snapshot, x, y, "road", isRoad);
          drawConnector(context, snapshot, x, y, "rail", isRail);
          drawHighway(context, snapshot, x, y);
          drawConnector(context, snapshot, x, y, "wire", isWire);
          drawConnector(context, snapshot, x, y, "pipe", isPipe);
        }
      });
      if (state.display.infrastructure) {
        MATH.sortByAnchor(facilityObjects(snapshot).filter((object) => (
          object.x >= startX && object.x < endX && object.y >= startY && object.y < endY
        )), size, state.camera.rotation).forEach((object) => drawFacility(context, snapshot, object, true));
      }
    }
    state.chunkBuildCount += 1;
    return { canvas, bounds, signature, used: ++state.cacheClock };
  }

  function trimChunkCache() {
    if (state.chunkCache.size <= MAX_CHUNK_CACHE) return;
    const entries = [...state.chunkCache.entries()].sort((a, b) => a[1].used - b[1].used);
    entries.slice(0, state.chunkCache.size - MAX_CHUNK_CACHE).forEach(([key, entry]) => {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      state.chunkCache.delete(key);
    });
  }

  function clearChunkCache() {
    state.chunkCache.forEach((entry) => {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
    });
    state.chunkCache.clear();
  }

  function chunkFor(snapshot, layer, chunkX, chunkY) {
    const signature = chunkSignature(snapshot, layer, chunkX, chunkY);
    const key = [layer, mapSize(snapshot), state.camera.rotation, state.camera.zoom.toFixed(3), state.dpr, chunkX, chunkY, signature].join(":");
    let entry = state.chunkCache.get(key);
    if (!entry) {
      entry = buildChunk(snapshot, layer, chunkX, chunkY, signature);
      state.chunkCache.set(key, entry);
      trimChunkCache();
    }
    entry.used = ++state.cacheClock;
    return entry;
  }

  function visibleChunks(snapshot, tiles) {
    const chunks = new Map();
    tiles.forEach(([x, y]) => {
      const chunkX = Math.floor(x / CHUNK_SIZE);
      const chunkY = Math.floor(y / CHUNK_SIZE);
      chunks.set(`${chunkX}:${chunkY}`, { chunkX, chunkY });
    });
    const size = mapSize(snapshot);
    facilityObjects(snapshot).forEach((facility) => {
      const x = Math.max(0, Math.min(size - 1, Math.floor(facility.x)));
      const y = Math.max(0, Math.min(size - 1, Math.floor(facility.y)));
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, y * size + x));
      if (point.sx < -100 || point.sx > state.cssWidth + 100 || point.sy < -120 || point.sy > state.cssHeight + 50) return;
      const chunkX = Math.floor(x / CHUNK_SIZE);
      const chunkY = Math.floor(y / CHUNK_SIZE);
      chunks.set(`${chunkX}:${chunkY}`, { chunkX, chunkY });
    });
    return [...chunks.values()].sort((a, b) => {
      const ax = Math.min(size - 1, a.chunkX * CHUNK_SIZE + CHUNK_SIZE - 1);
      const ay = Math.min(size - 1, a.chunkY * CHUNK_SIZE + CHUNK_SIZE - 1);
      const bx = Math.min(size - 1, b.chunkX * CHUNK_SIZE + CHUNK_SIZE - 1);
      const by = Math.min(size - 1, b.chunkY * CHUNK_SIZE + CHUNK_SIZE - 1);
      return MATH.depthKey(ax, ay, size, state.camera.rotation) - MATH.depthKey(bx, by, size, state.camera.rotation);
    });
  }

  function composeChunks(layer, snapshot, chunks) {
    clearContext(layer);
    const context = state.contexts[layer];
    const camera = cameraFor(snapshot);
    if (layer === "terrain") {
      context.fillStyle = "#1b2a20";
      context.fillRect(0, 0, state.cssWidth, state.cssHeight);
    }
    chunks.forEach(({ chunkX, chunkY }) => {
      const entry = chunkFor(snapshot, layer, chunkX, chunkY);
      context.drawImage(entry.canvas, entry.bounds.minX + camera.originX, entry.bounds.minY + camera.originY, entry.bounds.width, entry.bounds.height);
    });
  }

  function normalizeBuildingState(value) {
    if (Number.isFinite(value)) {
      return ["normal", "foundation", "construction", "normal", "declined", "abandoned", "recovering"][Number(value) | 0] || "normal";
    }
    const stateName = String(value || "normal").toLowerCase();
    if (stateName === "decay" || stateName === "decline" || stateName === "declining") return "declined";
    if (["foundation", "construction", "normal", "declined", "abandoned", "recovering"].includes(stateName)) return stateName;
    return "normal";
  }

  // The simulation clock carries a time of day (0..1 per game month). Night is
  // a binary state at the renderer: the buildings layer swaps to lit-window
  // frames at dusk and back at dawn, so the swap costs one redraw per
  // transition instead of a rebuild every tick. The threshold sits where the
  // lighting overlay has already dimmed the scene (darkness >= 0.18).
  function isNight(snapshot) {
    const time = Number.isFinite(snapshot.timeOfDay)
      ? snapshot.timeOfDay
      : ((Number(snapshot.tick) || 0) % 600) / 600;
    const sun = Math.sin(time * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
    return sun < 0.32;
  }

  // Prefer the night variant of a frame id when one exists; otherwise keep
  // the day frame so a missing recipe degrades gracefully to the old look.
  function nightFrame(frameId, snapshot) {
    if (!isNight(snapshot)) return frameId;
    const nightId = `${frameId}.night`;
    return atlasFrame(nightId) ? nightId : frameId;
  }

  function zonePrefix(value) {
    if (value === ZONE.R || value === "r" || value === "residential") return "r";
    if (value === ZONE.C || value === "c" || value === "commercial") return "c";
    if (value === ZONE.I || value === "i" || value === "industrial") return "i";
    return null;
  }

  function buildingObjects(snapshot) {
    const size = mapSize(snapshot);
    const buildings = [];
    const covered = new Set();
    if (Array.isArray(snapshot.buildings)) {
      snapshot.buildings.filter((building) => Number.isFinite(building.x) && Number.isFinite(building.y)).forEach((building) => {
        const footprint = normalizeFootprint(building.footprint, building.w || building.width, building.h || building.height);
        buildings.push({ ...building, footprint });
        for (let dy = 0; dy < footprint.h; dy += 1) for (let dx = 0; dx < footprint.w; dx += 1) covered.add(`${building.x + dx}:${building.y + dy}`);
      });
    }
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (covered.has(`${x}:${y}`)) continue;
        const index = y * size + x;
        const stage = Number(gridValue(snapshot, ["stage", "buildingStage"], index, 0)) | 0;
        const zone = gridValue(snapshot, ["zone", "zoneType"], index, ZONE.NONE);
        const buildingState = gridValue(snapshot, ["buildingState"], index, stage > 0 ? 3 : 0);
        if ((!stage && !buildingState) || !zonePrefix(zone)) continue;
        buildings.push({
          x,
          y,
          zone,
          stage,
          variant: Number(gridValue(snapshot, ["variant", "buildingVariant"], index, 1)) || 1,
          state: buildingState,
          footprint: { w: 1, h: 1 },
        });
      }
    }
    return buildings;
  }

  // How many looks a stage actually has, read from the atlas rather than
  // assumed. This used to be a hard-coded modulo 4, so when the atlas grew to
  // eight variants per stage the extra four could never appear on screen —
  // the art shipped and stayed invisible. Probing keeps the renderer honest
  // if the count changes again.
  let variantsPerStage = 0;
  function buildingVariantCount() {
    if (variantsPerStage) return variantsPerStage;
    let found = 0;
    while (found < 64 && atlasFrame(`building.r.1.${found + 1}.normal`)) found += 1;
    variantsPerStage = Math.max(1, found);
    return variantsPerStage;
  }

  function buildingFrame(building, night = false) {
    const prefix = zonePrefix(building.zone || building.type) || "r";
    const stage = Math.max(1, Math.min(3, Number(building.stage || building.level || 1) | 0));
    const variant = 1 + ((Math.max(1, Number(building.variant) || 1) - 1) % buildingVariantCount());
    const buildState = normalizeBuildingState(building.state || building.status);
    const preferred = buildState === "normal"
      ? (night ? `building.${prefix}.${stage}.${variant}.night` : `building.${prefix}.${stage}.${variant}.normal`)
      : `building.${prefix}.2.1.${buildState}`;
    return atlasFrame(preferred) ? preferred : `building.${prefix}.${stage}.${variant}.normal`;
  }

  function buildingSignature(snapshot) {
    const size = mapSize(snapshot);
    let hash = 2166136261;
    for (let index = 0; index < size * size; index += 1) {
      hash = fnvUpdate(hash, Number(gridValue(snapshot, ["stage", "buildingStage"], index, 0)) || 0);
      hash = fnvUpdate(hash, Number(gridValue(snapshot, ["variant", "buildingVariant"], index, 0)) || 0);
      hash = fnvAny(hash, gridValue(snapshot, ["zone", "zoneType"], index, 0));
      hash = fnvUpdate(hash, Boolean(gridValue(snapshot, ["tree", "trees"], index, false)));
      hash = fnvUpdate(hash, Boolean(gridValue(snapshot, ["park"], index, false)) || gridValue(snapshot, ["over"], index, OVER.NONE) === OVER.PARK);
      hash = fnvUpdate(hash, gridValue(snapshot, ["catalogId"], index, 0));
      hash = fnvUpdate(hash, gridValue(snapshot, ["blaze"], index, 0));
    }
    [snapshot.buildings, snapshot.trees].forEach((list) => {
      if (!Array.isArray(list)) return;
      list.forEach((object) => {
        hash = fnvUpdate(hash, object?.x);
        hash = fnvUpdate(hash, object?.y);
        hash = fnvUpdate(hash, object?.stage || object?.level);
        hash = fnvUpdate(hash, object?.variant);
        hash = fnvAny(hash, object?.zone || object?.state || object?.status || object?.type || "");
      });
    });
    return hash.toString(16);
  }

  function drawBuildings(snapshot, viewKey) {
    const night = isNight(snapshot);
    const season = Math.floor(((Number(snapshot.tick) || 0) % 1500) / 375);
    const key = `${viewKey}:${buildingSignature(snapshot)}:${night ? "n" : "d"}:${season}`;
    if (state.lastKeys.buildings === key) return;
    state.lastKeys.buildings = key;
    clearContext("buildings");
    const context = state.contexts.buildings;
    const size = mapSize(snapshot);
    const scenery = buildingObjects(snapshot).map((building) => ({ ...building, visualKind: "building" }));
    if (Array.isArray(snapshot.trees)) {
      snapshot.trees.forEach((tree, sequence) => {
        if (tree && Number.isFinite(tree.x) && Number.isFinite(tree.y)) {
          scenery.push({ ...tree, visualKind: "tree", variant: tree.variant || 1 + (sequence % 3), footprint: { w: 1, h: 1 } });
        }
      });
    } else {
      for (let index = 0; index < size * size; index += 1) {
        if (!gridValue(snapshot, ["tree", "trees"], index, false)) continue;
        scenery.push({
          x: index % size, y: Math.floor(index / size), visualKind: "tree",
          // Seasons accent the forest, they do not repaint it: one tree in
          // eight blossoms in spring, one in three turns in autumn, and the
          // rest stay green so the woods still read as woods.
          variant: season === 0
            ? ((index % 8) === 0 ? 5 : 1 + (index % 3))
            : season === 3
              ? ((index % 3) === 0 ? 6 : 1 + (index % 3))
              : season === 2
                ? ((index % 3) === 0 ? 4 : 1 + (index % 3))
                : 1 + (index % 3),
          footprint: { w: 1, h: 1 },
        });
      }
    }
    for (let index = 0; index < size * size; index += 1) {
      if (!gridValue(snapshot, ["park"], index, false) && gridValue(snapshot, ["over"], index, OVER.NONE) !== OVER.PARK) continue;
      scenery.push({ x: index % size, y: Math.floor(index / size), visualKind: "tree", variant: 3, footprint: { w: 1, h: 1 } });
    }
    if (snapshot.blaze) {
      for (let index = 0; index < size * size; index += 1) {
        const value = snapshot.blaze[index];
        if (!value) continue;
        scenery.push({ x: index % size, y: Math.floor(index / size), visualKind: "blaze", flooded: value === 6, age: value, footprint: { w: 1, h: 1 } });
      }
    }
    const catalog = window.AISystem6BonsaiCatalog;
    if (catalog && snapshot.catalogId) {
      for (let index = 0; index < size * size; index += 1) {
        const id = snapshot.catalogId[index];
        if (!id) continue;
        if (gridValue(snapshot, ["zone"], index, 0)) continue;
        if (snapshot.facilityAt && snapshot.facilityAt[index] >= 0) continue;
        if (gridValue(snapshot, ["road"], index, 0) || gridValue(snapshot, ["rail"], index, 0) || gridValue(snapshot, ["wire"], index, 0)) continue;
        if (gridValue(snapshot, ["highway"], index, 0) || gridValue(snapshot, ["onramp"], index, 0)) continue;
        if (gridValue(snapshot, ["tree", "trees"], index, false) || gridValue(snapshot, ["park"], index, false)) continue;
        const entry = catalog.entryOf(id);
        if (!entry || entry.category === "clear" || entry.category === "trees") continue;
        scenery.push({ x: index % size, y: Math.floor(index / size), visualKind: "catalog", category: entry.category, size: entry.size,
          label: entry.labelKey.replace("bonsai_catalog_", ""), footprint: { w: 1, h: 1 } });
      }
    }
    MATH.sortByAnchor(scenery, size, state.camera.rotation).forEach((building) => {
      const baseX = Math.max(0, Math.min(size - 1, Math.floor(building.x)));
      const baseY = Math.max(0, Math.min(size - 1, Math.floor(building.y)));
      const footprint = normalizeFootprint(building.footprint, building.width, building.height);
      const x = building.x + ((footprint.w || 1) - 1) / 2;
      const y = building.y + ((footprint.h || 1) - 1) / 2;
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, baseY * size + baseX));
      if (point.sx < -120 || point.sx > state.cssWidth + 120 || point.sy < -130 || point.sy > state.cssHeight + 60) return;
      if (building.visualKind === "building" || building.visualKind === "tree" || building.visualKind === "catalog") {
        drawDropShadow(context, point);
      }
      if (building.visualKind === "blaze") {
        const width = 20 * state.camera.zoom;
        const height = (building.flooded ? 8 : 14 + (building.age || 1) * 3) * state.camera.zoom;
        context.fillStyle = building.flooded ? "rgba(64, 128, 200, 0.75)" : building.age >= 3 ? "#d1481f" : "#e8862a";
        context.fillRect(point.sx - width / 2, point.sy - height, width, height);
        return;
      }
      if (building.visualKind === "catalog") {
        // Bespoke recipe first, then a shared facility frame, then the
        // category-tinted placeholder block.
        if (drawSprite(context, nightFrame(`catalog.${building.label}`, snapshot), point.sx, point.sy)) return;
        const shared = { police: "police", fire: "fire", school: "school", hospital: "clinic", pump: "pump", water_tower: "tower", rail_station: "station" }[building.label];
        if (shared && drawSprite(context, nightFrame(`facility.${shared}`, snapshot), point.sx, point.sy)) return;
        if (drawSprite(context, nightFrame(`catalog.${building.category === "powerPlant" ? "power_plant" : building.category}`, snapshot), point.sx, point.sy)) return;
        const width = 22 * state.camera.zoom;
        const height = (10 + 8 * (building.size || 1)) * state.camera.zoom;
        context.fillStyle = CATALOG_COLORS[building.category] || "#8a8f98";
        context.fillRect(point.sx - width / 2, point.sy - height, width, height);
        context.strokeStyle = "#2f2a26";
        context.strokeRect(point.sx - width / 2, point.sy - height, width, height);
        return;
      }
      if (building.visualKind === "tree") {
        drawSprite(context, `tree.${building.variant === 2 ? "conifer" : building.variant === 3 ? "young" : building.variant === 4 ? "maple" : building.variant === 5 ? "blossom" : building.variant === 6 ? "winter" : "broadleaf"}`, point.sx, point.sy);
        return;
      }
      if (!drawSprite(context, buildingFrame(building, night), point.sx, point.sy)) {
        const color = zonePrefix(building.zone) === "r" ? "#b75d52" : zonePrefix(building.zone) === "c" ? "#486eaf" : "#b67c3b";
        context.fillStyle = color;
        const width = 22 * state.camera.zoom;
        const height = 20 * Math.max(1, building.stage || 1) * state.camera.zoom;
        context.fillRect(point.sx - width / 2, point.sy - height, width, height);
      }
    });
  }

  function hashInt(seed, tick, id) {
    let value = (seed | 0) ^ Math.imul((tick | 0) + 1, 0x45d9f3b) ^ Math.imul((id | 0) + 7, 0x27d4eb2d);
    value ^= value >>> 16;
    value = Math.imul(value, 0x45d9f3b);
    value ^= value >>> 16;
    return value >>> 0;
  }

  // Moving things draw procedurally on the agents layer: aircraft lifted by
  // their record height, boats on the water line, a rotor that alternates
  // with the tick.
  function drawThings(context, snapshot) {
    if (!Array.isArray(snapshot.things) || !snapshot.things.length) return;
    const size = mapSize(snapshot);
    const tick = Number(snapshot.tick) | 0;
    const zoom = state.camera.zoom;
    snapshot.things.forEach((thing) => {
      if (!Number.isFinite(thing.x) || !Number.isFinite(thing.y)) return;
      const tileX = Math.max(0, Math.min(size - 1, Math.floor(thing.x)));
      const tileY = Math.max(0, Math.min(size - 1, Math.floor(thing.y)));
      const point = projectPoint(snapshot, thing.x, thing.y, altitudeAt(snapshot, tileY * size + tileX));
      const lift = (Number(thing.z) || 0) * 5 * zoom;
      if (thing.kind === "airplane") {
        context.fillStyle = "#e4e4d8";
        context.fillRect(point.sx - 7 * zoom, point.sy - lift - 2 * zoom, 14 * zoom, 3 * zoom);
        context.fillRect(point.sx - 2 * zoom, point.sy - lift - 6 * zoom, 4 * zoom, 11 * zoom);
        return;
      }
      if (thing.kind === "helicopter") {
        context.fillStyle = "#c23b30";
        context.fillRect(point.sx - 4 * zoom, point.sy - lift, 8 * zoom, 4 * zoom);
        context.fillStyle = "#2f2a26";
        const span = tick % 2 ? 7 : 4;
        context.fillRect(point.sx - span * zoom, point.sy - lift - 2 * zoom, span * 2 * zoom, 1 * zoom);
        return;
      }
      context.fillStyle = "#5a4632";
      context.fillRect(point.sx - 8 * zoom, point.sy - 3 * zoom, 16 * zoom, 4 * zoom);
      context.fillStyle = "#e8e8e0";
      if (thing.kind === "sailboat") context.fillRect(point.sx - 1 * zoom, point.sy - 10 * zoom, 2 * zoom, 8 * zoom);
      else context.fillRect(point.sx - 3 * zoom, point.sy - 7 * zoom, 6 * zoom, 4 * zoom);
    });
  }

  // Waterfalls (SC2000 mountain signature): a white falling curtain on the
  // water side of any edge where land is at least two levels higher. The
  // flicker rides the tick, so the agents layer's per-tick redraw animates it.
  function drawWaterfalls(context, snapshot) {
    const size = mapSize(snapshot);
    const zoom = state.camera.zoom;
    const tick = Number(snapshot.tick) | 0;
    (typeof MATH.waterfallEdges === "function" ? MATH.waterfallEdges(snapshot) : []).forEach((edge, index) => {
      const point = projectPoint(snapshot, edge.x, edge.y, altitudeAt(snapshot, edge.y * size + edge.x));
      const offset = edge.dir === "e" ? 10 : edge.dir === "w" ? -10 : edge.dir === "n" ? -6 : 6;
      const jitter = ((tick + index * 3) % 4) * zoom;
      const fallHeight = Math.min(72, edge.height * 6) * zoom;
      context.fillStyle = "rgba(226, 244, 255, 0.9)";
      context.fillRect(point.sx + offset * zoom - 2 * zoom, point.sy - fallHeight - 2 * zoom + jitter, 4 * zoom, fallHeight + 4 * zoom);
      context.fillStyle = "#f4fbff";
      context.fillRect(point.sx + offset * zoom - 1 * zoom, point.sy - fallHeight + jitter, 2 * zoom, fallHeight);
      // Splash at the foot of the fall.
      context.fillStyle = "rgba(240, 250, 255, 0.85)";
      context.fillRect(point.sx - 8 * zoom, point.sy - 1 * zoom, 16 * zoom, 2 * zoom);
    });
  }

  // Active tornado and monster disasters ride the snapshot's disaster record
  // and draw on the per-tick agents layer: a swaying gray funnel with a dust
  // ring, and a hulking dark body with eyes.
  function drawDisaster(context, snapshot) {
    const size = mapSize(snapshot);
    const zoom = state.camera.zoom;
    const tick = Number(snapshot.tick) | 0;
    const disaster = snapshot.disaster;
    if (!disaster || (disaster.kind !== "tornado" && disaster.kind !== "monster")) return;
    if (!Number.isFinite(disaster.x) || !Number.isFinite(disaster.y)) return;
    const point = projectPoint(snapshot, disaster.x, disaster.y, altitudeAt(snapshot, Math.max(0, Math.min(size - 1, disaster.y)) * size + Math.max(0, Math.min(size - 1, disaster.x))));
    if (disaster.kind === "tornado") {
      const sway = Math.sin(tick * 0.35) * 3 * zoom;
      context.fillStyle = "#5a5a5a";
      context.beginPath();
      context.moveTo(point.sx - 9 * zoom + sway, point.sy);
      context.lineTo(point.sx + 9 * zoom + sway, point.sy);
      context.lineTo(point.sx + 4 * zoom - sway, point.sy - 34 * zoom);
      context.lineTo(point.sx - 4 * zoom - sway, point.sy - 34 * zoom);
      context.closePath();
      context.fill();
      context.fillStyle = "#e8e8e0";
      context.fillRect(point.sx - 2 * zoom - sway, point.sy - 42 * zoom, 4 * zoom, 10 * zoom);
      context.fillStyle = "rgba(178, 158, 128, 0.55)";
      context.fillRect(point.sx - 15 * zoom, point.sy - 2 * zoom, 30 * zoom, 4 * zoom);
      return;
    }
    context.fillStyle = "#333a33";
    context.fillRect(point.sx - 9 * zoom, point.sy - 16 * zoom, 18 * zoom, 16 * zoom);
    context.fillStyle = "#ff4033";
    context.fillRect(point.sx - 5 * zoom, point.sy - 10 * zoom, 2 * zoom, 2 * zoom);
    context.fillRect(point.sx + 3 * zoom, point.sy - 10 * zoom, 2 * zoom, 2 * zoom);
  }

  // SC2000 construction life: a small tower crane over every construction
  // tile, its jib swinging with the tick.
  function drawConstructionCranes(context, snapshot) {
    const size = mapSize(snapshot);
    const zoom = state.camera.zoom;
    const tick = Number(snapshot.tick) | 0;
    for (let index = 0; index < size * size; index += 1) {
      if (Number(gridValue(snapshot, ["buildingState"], index, 0)) !== 2) continue;
      const x = index % size;
      const y = Math.floor(index / size);
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, index));
      if (point.sx < -80 || point.sx > state.cssWidth + 80 || point.sy < -130 || point.sy > state.cssHeight + 80) continue;
      const swing = Math.sin(tick * 0.45 + index * 0.7) * 5 * zoom;
      context.strokeStyle = "#c8a23a";
      context.lineWidth = Math.max(1, 1.5 * zoom);
      context.beginPath();
      context.moveTo(point.sx, point.sy - 4 * zoom);
      context.lineTo(point.sx, point.sy - 36 * zoom);
      context.lineTo(point.sx + 15 * zoom + swing, point.sy - 31 * zoom);
      context.stroke();
      context.strokeStyle = "#8a8a84";
      context.lineWidth = Math.max(1, zoom);
      context.beginPath();
      context.moveTo(point.sx - 3 * zoom, point.sy - 24 * zoom);
      context.lineTo(point.sx + 12 * zoom + swing, point.sy - 24 * zoom);
      context.stroke();
    }
  }

  // Spring sakura: two pale petals drift down from each blossom tree — a
  // gentle, deterministic fall that stays sparse enough to keep the zen
  // cleanliness.
  function drawSakuraPetals(context, snapshot) {
    const size = mapSize(snapshot);
    const zoom = state.camera.zoom;
    const tick = Number(snapshot.tick) | 0;
    const season = Math.floor(((Number(snapshot.tick) || 0) % 1500) / 375);
    if (season !== 0) return;
    for (let index = 0; index < size * size; index += 1) {
      if (!gridValue(snapshot, ["tree", "trees"], index, false)) continue;
      if (index % 3 !== 0) continue; // blossom trees only, matching the sprite selection
      const x = index % size;
      const y = Math.floor(index / size);
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, index));
      if (point.sx < -60 || point.sx > state.cssWidth + 60 || point.sy < -80 || point.sy > state.cssHeight + 80) continue;
      for (let petal = 0; petal < 2; petal += 1) {
        const phase = (tick * 2 + index * 7 + petal * 13) % 36;
        const px = point.sx + ((phase % 12) - 2) * zoom;
        const py = point.sy + phase * 0.45 * zoom;
        context.fillStyle = "rgba(244, 205, 205, 0.85)";
        context.fillRect(px, py, 2 * zoom, 1.5 * zoom);
      }
    }
  }

  function drawAgents(snapshot, viewKey) {
    const tick = Number(snapshot.tick) | 0;
    const key = `${viewKey}:${tick}:${snapshot.rev ?? "x"}:${snapshot.agentRevision ?? "x"}`;
    if (state.lastKeys.agents === key) return;
    state.lastKeys.agents = key;
    clearContext("agents");
    const context = state.contexts.agents;
    const size = mapSize(snapshot);
    drawThings(context, snapshot);
    drawWaterfalls(context, snapshot);
    drawDisaster(context, snapshot);
    drawConstructionCranes(context, snapshot);
    drawSakuraPetals(context, snapshot);
    if (snapshot.agents && typeof snapshot.agents === "object") {
      const drawFacts = (list, frameFor, verticalOffset = 0) => {
        (Array.isArray(list) ? list : []).forEach((agent, index) => {
          if (!Number.isFinite(agent.x) || !Number.isFinite(agent.y)) return;
          const tileX = Math.max(0, Math.min(size - 1, Math.floor(agent.x)));
          const tileY = Math.max(0, Math.min(size - 1, Math.floor(agent.y)));
          const point = projectPoint(snapshot, agent.x, agent.y, altitudeAt(snapshot, tileY * size + tileX));
          const phase = (Number(agent.phase) || 0) - 0.5;
          drawSprite(context, frameFor(agent, index), point.sx + phase * 8, point.sy + phase * 2 - verticalOffset * state.camera.zoom);
        });
      };
      drawFacts(snapshot.agents.vehicles, (_agent, index) => `agent.car.${1 + (index % 4)}`);
      drawFacts(snapshot.agents.pedestrians, (_agent, index) => `agent.pedestrian.${1 + (index % 2)}`);
      drawFacts(snapshot.agents.trains, (_agent, index) => `agent.train.${1 + (index % 2)}`);
      drawFacts(snapshot.agents.smoke, (_agent, index) => `agent.smoke.${1 + (index % 3)}`, 28);
      drawFacts(snapshot.agents.serviceVehicles, (_agent, index) => `agent.service.${["police", "fire", "medical"][index % 3]}`);
      return;
    }
    const roads = [];
    const rails = [];
    const occupied = [];
    for (let index = 0; index < size * size; index += 1) {
      if (isRoad(snapshot, index)) roads.push(index);
      if (isRail(snapshot, index)) rails.push(index);
      if (Number(gridValue(snapshot, ["stage", "buildingStage"], index, 0)) > 0) occupied.push(index);
    }
    const seed = Number(snapshot.seed) | 0;
    const carCount = Math.min(36, Math.ceil(roads.length / 12));
    for (let id = 0; id < carCount && roads.length; id += 1) {
      const hash = hashInt(seed, tick, id);
      const index = roads[hash % roads.length];
      const x = index % size;
      const y = Math.floor(index / size);
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, index));
      const phase = ((hash >>> 8) % 11 - 5) * 0.55 * state.camera.zoom;
      drawSprite(context, `agent.car.${1 + (id % 4)}`, point.sx + phase, point.sy + phase * 0.25);
    }
    const pedestrianCount = Math.min(18, Math.ceil(occupied.length / 20));
    for (let id = 0; id < pedestrianCount && occupied.length; id += 1) {
      const hash = hashInt(seed ^ 0x51f2, tick, id);
      const index = occupied[hash % occupied.length];
      const point = projectPoint(snapshot, index % size, Math.floor(index / size), altitudeAt(snapshot, index));
      drawSprite(context, `agent.pedestrian.${1 + (id % 2)}`, point.sx + ((hash >>> 7) % 9 - 4), point.sy + 4);
    }
    const trainCount = Math.min(4, Math.ceil(rails.length / 24));
    for (let id = 0; id < trainCount && rails.length; id += 1) {
      const hash = hashInt(seed ^ 0x72a1, tick, id);
      const index = rails[hash % rails.length];
      const point = projectPoint(snapshot, index % size, Math.floor(index / size), altitudeAt(snapshot, index));
      drawSprite(context, `agent.train.${1 + (id % 2)}`, point.sx, point.sy);
    }
    (snapshot.plants || []).slice(0, 8).forEach((plant, id) => {
      if (!String(plant.kind || "").includes("coal")) return;
      const index = Math.floor(plant.y) * size + Math.floor(plant.x);
      const point = projectPoint(snapshot, plant.x, plant.y, altitudeAt(snapshot, index));
      drawSprite(context, `agent.smoke.${1 + (hashInt(seed, tick, id) % 3)}`, point.sx + 8, point.sy - 32 * state.camera.zoom);
    });
  }

  function previewFootprint() {
    if (!state.preview) return [];
    if (Array.isArray(state.preview.footprint)) return state.preview.footprint;
    if (Array.isArray(state.preview.footprint?.tiles)) return state.preview.footprint.tiles;
    if (state.preview.footprint && Number.isFinite(state.preview.footprint.x) && Number.isFinite(state.preview.footprint.y)) {
      const area = state.preview.footprint;
      const tiles = [];
      const width = Math.max(1, Number(area.w || area.width) | 0);
      const height = Math.max(1, Number(area.h || area.height) | 0);
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) tiles.push({ x: area.x + x, y: area.y + y });
      return tiles;
    }
    if (Number.isFinite(state.preview.x) && Number.isFinite(state.preview.y)) return [{ x: state.preview.x, y: state.preview.y }];
    return [];
  }

  function drawFeedback(snapshot, viewKey) {
    const key = `${viewKey}:${state.previewRevision}`;
    if (state.lastKeys.feedback === key) return;
    state.lastKeys.feedback = key;
    clearContext("feedback");
    const context = state.contexts.feedback;
    const size = mapSize(snapshot);
    const accepted = state.preview?.accepted !== false;
    previewFootprint().forEach((tile) => {
      const x = Math.floor(tile.x);
      const y = Math.floor(tile.y);
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, y * size + x));
      fallbackDiamond(context, point.sx, point.sy, accepted ? "rgba(43,177,75,0.34)" : "rgba(205,55,49,0.40)", accepted ? "#2bad4b" : "#c93430");
    });
  }

  function normalizeOverlay(value) {
    const normalized = String(value || "none").toLowerCase().replaceAll("_", "-");
    if (normalized === "landvalue") return "land-value";
    return OVERLAYS.includes(normalized) ? normalized : "none";
  }

  function overlayValue(snapshot, overlay, index) {
    const direct = {
      power: ["powered", "powerCoverage"],
      water: ["watered", "waterCoverage"],
      traffic: ["traffic"],
      pollution: ["pollution"],
      "land-value": ["landValue", "land-value"],
      police: ["policeCovered", "policeCoverage"],
      fire: ["fireCovered", "fireCoverage"],
      education: ["educationCovered", "educationCoverage"],
      health: ["healthCovered", "healthCoverage"],
    }[overlay] || [];
    for (const name of direct) {
      const layer = snapshot?.[name];
      if (layer && layer[index] !== undefined) return Number(layer[index]) || 0;
    }
    const nested = snapshot?.coverage?.[overlay] || snapshot?.overlays?.[overlay];
    return nested && nested[index] !== undefined ? Number(nested[index]) || 0 : 0;
  }

  function overlayBucket(overlay, value) {
    if (["power", "water", "police", "fire", "education", "health"].includes(overlay)) return value ? 1 : 0;
    const divisor = overlay === "traffic" ? 160 : 255;
    return Math.max(0, Math.min(4, Math.floor((value / divisor) * 5)));
  }

  function overlayColor(overlay, bucket) {
    if (overlay === "power") return bucket ? "rgba(247,205,67,0.42)" : "rgba(182,48,45,0.28)";
    if (overlay === "water") return bucket ? "rgba(55,154,211,0.44)" : "rgba(164,61,54,0.25)";
    if (overlay === "police") return bucket ? "rgba(65,105,214,0.42)" : "rgba(83,70,70,0.20)";
    if (overlay === "fire") return bucket ? "rgba(231,91,51,0.42)" : "rgba(83,70,70,0.20)";
    if (overlay === "education") return bucket ? "rgba(230,184,57,0.42)" : "rgba(83,70,70,0.20)";
    if (overlay === "health") return bucket ? "rgba(54,181,147,0.42)" : "rgba(83,70,70,0.20)";
    const heat = {
      traffic: [
        "rgba(70,165,81,0.17)", "rgba(155,184,66,0.25)", "rgba(224,184,57,0.31)", "rgba(224,112,45,0.38)", "rgba(192,46,43,0.48)",
      ],
      pollution: [
        "rgba(80,147,82,0.12)", "rgba(132,145,72,0.23)", "rgba(166,128,65,0.31)", "rgba(145,82,92,0.40)", "rgba(100,48,113,0.49)",
      ],
      "land-value": [
        "rgba(178,54,48,0.38)", "rgba(202,111,47,0.34)", "rgba(206,174,60,0.31)", "rgba(100,163,75,0.35)", "rgba(37,127,74,0.44)",
      ],
    };
    return (heat[overlay] || heat.traffic)[bucket];
  }

  function overlaySignature(snapshot, overlay, tiles) {
    if (overlay === "none") return "none";
    const size = mapSize(snapshot);
    let hash = 2166136261;
    tiles.forEach(([x, y]) => { hash = fnvUpdate(hash, overlayValue(snapshot, overlay, y * size + x)); });
    return hash.toString(16);
  }

  function drawOverlayCells(context, snapshot, overlay, tiles) {
    if (overlay === "none") return;
    const size = mapSize(snapshot);
    const buckets = new Map();
    tiles.forEach(([x, y]) => {
      const index = y * size + x;
      if (isWater(snapshot, index)) return;
      const bucket = overlayBucket(overlay, overlayValue(snapshot, overlay, index));
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket).push(projectPoint(snapshot, x, y, altitudeAt(snapshot, index)));
    });
    const halfW = (MATH.TILE_W / 2) * state.camera.zoom;
    const halfH = (MATH.TILE_H / 2) * state.camera.zoom;
    [...buckets.entries()].sort((a, b) => a[0] - b[0]).forEach(([bucket, points]) => {
      context.beginPath();
      points.forEach(({ sx, sy }) => {
        context.moveTo(Math.round(sx), Math.round(sy - halfH));
        context.lineTo(Math.round(sx + halfW), Math.round(sy));
        context.lineTo(Math.round(sx), Math.round(sy + halfH));
        context.lineTo(Math.round(sx - halfW), Math.round(sy));
        context.closePath();
      });
      context.fillStyle = overlayColor(overlay, bucket);
      context.fill();
    });
  }

  function drawLighting(snapshot, viewKey, tiles) {
    const time = Number.isFinite(snapshot.timeOfDay) ? snapshot.timeOfDay : ((Number(snapshot.tick) || 0) % 600) / 600;
    const lightStep = Math.round(time * 48);
    const key = `${viewKey}:${lightStep}:${state.overlay}:${overlaySignature(snapshot, state.overlay, tiles)}`;
    if (state.lastKeys.lighting === key) return;
    state.lastKeys.lighting = key;
    clearContext("lighting");
    const context = state.contexts.lighting;
    const sun = Math.sin(time * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
    const darkness = Math.max(0, Math.min(0.58, (0.54 - sun) * 0.82));
    if (darkness > 0.01) {
      context.fillStyle = `rgba(13,21,43,${darkness.toFixed(3)})`;
      context.fillRect(0, 0, state.cssWidth, state.cssHeight);
    }
    if (isNight(snapshot)) drawNightWindowGlow(context, snapshot);
    drawWaterShimmer(context, snapshot, tiles);
    drawZenNight(context, snapshot, tiles);
    drawOverlayCells(context, snapshot, state.overlay, tiles);
  }

  // SC2000 water life: faint moving strokes over visible water tiles, driven
  // by the snapshot clock so the surface shimmers without wall-clock reads.
  function drawWaterShimmer(context, snapshot, tiles) {
    const size = mapSize(snapshot);
    const zoom = state.camera.zoom;
    const time = Number.isFinite(snapshot.timeOfDay) ? snapshot.timeOfDay : 0;
    const step = Math.round(time * 48);
    // Winter freezes the lakes: a pale ice sheet over every water tile.
    const winter = Math.floor(((Number(snapshot.tick) || 0) % 1500) / 375) === 3;
    if (winter) {
      context.fillStyle = "rgba(226, 236, 242, 0.4)";
      (Array.isArray(tiles) ? tiles : []).forEach(([x, y]) => {
        if (!isWater(snapshot, y * size + x)) return;
        const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, y * size + x), true);
        context.fillRect(point.sx - 12 * zoom, point.sy - 6 * zoom, 24 * zoom, 12 * zoom);
      });
    }
    context.fillStyle = "rgba(215, 238, 248, 0.32)";
    (Array.isArray(tiles) ? tiles : []).forEach(([x, y]) => {
      const index = y * size + x;
      if (!isWater(snapshot, index)) return;
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, index), true);
      const offset = ((step + ((x * 7 + y * 13) % 5)) % 6) * zoom;
      context.fillRect(point.sx - 10 * zoom, point.sy - 2 * zoom + offset * 0.5, 12 * zoom, 1 * zoom);
    });
  }

  // The zen night: one pale moon and a few far-apart warm lanterns along
  // roads — negative space over decoration. Purely a function of the
  // snapshot clock, drawn after the darkness overlay.
  function drawZenNight(context, snapshot, tiles) {
    if (!isNight(snapshot)) return;
    const size = mapSize(snapshot);
    const zoom = state.camera.zoom;
    const time = Number.isFinite(snapshot.timeOfDay) ? snapshot.timeOfDay : 0;
    const phase = Math.round(time * 48);
    // Moon: pale paper disc in the upper corner.
    const moonX = state.cssWidth * 0.78;
    const moonY = state.cssHeight * 0.16;
    context.fillStyle = "rgba(238, 238, 226, 0.85)";
    context.beginPath();
    context.arc(moonX, moonY, 9 * zoom, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "rgba(238, 238, 226, 0.18)";
    context.beginPath();
    context.arc(moonX, moonY, 16 * zoom, 0, Math.PI * 2);
    context.fill();
    // Lanterns: one warm dot per roughly twelfth road tile, so the light is
    // a path of occasional paper lamps rather than a string of noise.
    (Array.isArray(tiles) ? tiles : []).forEach(([x, y]) => {
      const index = y * size + x;
      if (!isRoad(snapshot, index)) return;
      if (((phase + index * 7 + x * 3 + y * 5) % 12) !== 0) return;
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, index), true);
      context.fillStyle = "rgba(255, 220, 150, 0.9)";
      context.fillRect(point.sx - 1.5 * zoom, point.sy - 4 * zoom, 3 * zoom, 3 * zoom);
      context.fillStyle = "rgba(255, 220, 150, 0.22)";
      context.fillRect(point.sx - 4 * zoom, point.sy - 6.5 * zoom, 8 * zoom, 8 * zoom);
    });
    // Moon reflection: a faint vertical glint on water near the moon's column.
    (Array.isArray(tiles) ? tiles : []).forEach(([x, y]) => {
      const index = y * size + x;
      if (!isWater(snapshot, index)) return;
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, index), true);
      if (Math.abs(point.sx - moonX) > 64 * zoom) return;
      context.fillStyle = "rgba(238, 238, 226, 0.15)";
      context.fillRect(point.sx - 1.5 * zoom, point.sy - 4 * zoom, 3 * zoom, 9 * zoom);
    });
  }

  // Night frames record their lit-window rects in the atlas metadata (cell
  // coordinates in the 160x128 sprite space). The glow pass projects those
  // rects onto the lighting layer after the darkness overlay, so windows
  // stay bright the way SimCity 2000's night mode does while the terrain and
  // walls fall into shadow. One source of truth: the generator paints the
  // same rects into the night frames themselves.
  function drawNightWindowGlow(context, snapshot) {
    const zoom = state.camera.zoom;
    const size = mapSize(snapshot);
    const drawWindows = (point, frameId) => {
      const frame = atlasFrame(frameId);
      if (!frame || !Array.isArray(frame.windows) || !frame.windows.length) return;
      context.fillStyle = "rgba(245,210,104,0.18)";
      frame.windows.forEach((win) => {
        context.fillRect(
          point.sx + (win.x - 80) * zoom - 2 * zoom,
          point.sy + (win.y - 104) * zoom - 2 * zoom,
          (win.w + 4) * zoom,
          (win.h + 4) * zoom,
        );
      });
      context.fillStyle = "#f5d268";
      frame.windows.forEach((win) => {
        context.fillRect(
          point.sx + (win.x - 80) * zoom,
          point.sy + (win.y - 104) * zoom,
          win.w * zoom,
          win.h * zoom,
        );
      });
    };
    const inView = (point) => point.sx >= -120 && point.sx <= state.cssWidth + 120 && point.sy >= -130 && point.sy <= state.cssHeight + 60;
    buildingObjects(snapshot).forEach((building) => {
      const footprint = normalizeFootprint(building.footprint, building.width, building.height);
      const x = building.x + ((footprint.w || 1) - 1) / 2;
      const y = building.y + ((footprint.h || 1) - 1) / 2;
      const baseX = Math.max(0, Math.min(size - 1, Math.floor(building.x)));
      const baseY = Math.max(0, Math.min(size - 1, Math.floor(building.y)));
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, baseY * size + baseX));
      if (!inView(point)) return;
      drawWindows(point, nightFrame(buildingFrame(building, false), snapshot));
    });
    facilityObjects(snapshot).forEach((facility) => {
      const x = facility.x + ((facility.footprint?.w || 1) - 1) / 2;
      const y = facility.y + ((facility.footprint?.h || 1) - 1) / 2;
      const baseX = Math.max(0, Math.min(size - 1, Math.floor(facility.x)));
      const baseY = Math.max(0, Math.min(size - 1, Math.floor(facility.y)));
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, baseY * size + baseX));
      if (!inView(point)) return;
      drawWindows(point, nightFrame(`facility.${facility.kind}`, snapshot));
    });
    if (!window.AISystem6BonsaiCatalog || !snapshot.catalogId) return;
    for (let index = 0; index < size * size; index += 1) {
      const id = snapshot.catalogId[index];
      if (!id) continue;
      if (gridValue(snapshot, ["zone"], index, 0)) continue;
      if (snapshot.facilityAt && snapshot.facilityAt[index] >= 0) continue;
      if (gridValue(snapshot, ["road"], index, 0) || gridValue(snapshot, ["rail"], index, 0) || gridValue(snapshot, ["wire"], index, 0)) continue;
      if (gridValue(snapshot, ["highway"], index, 0) || gridValue(snapshot, ["onramp"], index, 0)) continue;
      if (gridValue(snapshot, ["tree", "trees"], index, false) || gridValue(snapshot, ["park"], index, false)) continue;
      const entry = window.AISystem6BonsaiCatalog.entryOf(id);
      if (!entry || entry.category === "clear" || entry.category === "trees") continue;
      const label = entry.labelKey.replace("bonsai_catalog_", "");
      const x = index % size;
      const y = Math.floor(index / size);
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, index));
      if (!inView(point)) continue;
      drawWindows(point, nightFrame(`catalog.${label}`, snapshot));
    }
  }

  function render(snapshot, viewState) {
    if (!state.ready || state.disposed || !snapshot) return;
    state.snapshot = snapshot;
    if (viewState && typeof viewState === "object") {
      if (Number.isFinite(viewState.zoom)) state.camera.zoom = MATH.clampZoom(viewState.zoom);
      if (Number.isFinite(viewState.rotation)) state.camera.rotation = MATH.normalizeRotation(viewState.rotation);
      if (Number.isFinite(viewState.panX)) state.camera.panX = viewState.panX;
      if (Number.isFinite(viewState.panY)) state.camera.panY = viewState.panY;
      if (viewState.overlay !== undefined) state.overlay = normalizeOverlay(viewState.overlay);
      if (viewState.display && typeof viewState.display === "object") {
        state.display = { ...state.display, ...viewState.display };
      }
    }
    const direction = DIRECTIONS[state.camera.rotation];
    if (!state.images[direction]) loadAtlasImages();
    if (window.AISystem6BonsaiAtlas && typeof Image === "function" && !state.images[direction] && !state.imageFailures[direction]) return;
    const tiles = visibleTiles(snapshot);
    state.visibleTileCount = tiles.length;
    const chunks = visibleChunks(snapshot, tiles);
    const viewKey = [state.cssWidth, state.cssHeight, state.dpr, state.camera.zoom.toFixed(3), state.camera.rotation, state.camera.panX.toFixed(1), state.camera.panY.toFixed(1)].join(":");
    const displayKey = `${state.display.buildings ? "b" : "-"}${state.display.infrastructure ? "i" : "-"}${state.display.zones ? "z" : "-"}${state.display.underground ? "u" : "-"}`;
    const terrainKey = `${viewKey}:${displayKey}:${chunks.map(({ chunkX, chunkY }) => `${chunkX}.${chunkY}.${chunkSignature(snapshot, "terrain", chunkX, chunkY)}`).join("|")}`;
    if (state.lastKeys.terrain !== terrainKey) {
      state.lastKeys.terrain = terrainKey;
      if (state.display.underground) {
        clearContext("terrain");
        const terrainContext = state.contexts.terrain;
        if (terrainContext) {
          terrainContext.setTransform(1, 0, 0, 1, 0, 0);
          terrainContext.fillStyle = "#0d1319";
          terrainContext.fillRect(0, 0, state.backingWidth, state.backingHeight);
          terrainContext.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        }
      } else {
        composeChunks("terrain", snapshot, chunks);
      }
    }
    const infrastructureKey = `${viewKey}:${displayKey}:${chunks.map(({ chunkX, chunkY }) => `${chunkX}.${chunkY}.${chunkSignature(snapshot, "infrastructure", chunkX, chunkY)}`).join("|")}`;
    if (state.lastKeys.infrastructure !== infrastructureKey) {
      state.lastKeys.infrastructure = infrastructureKey;
      if (state.display.infrastructure || state.display.zones) {
        composeChunks("infrastructure", snapshot, chunks);
      } else {
        clearContext("infrastructure");
      }
    }
    if (state.display.buildings && !state.display.underground) {
      drawBuildings(snapshot, viewKey);
    } else {
      clearContext("buildings");
    }
    if (state.display.underground) {
      clearContext("agents");
      clearContext("lighting");
      clearContext("feedback");
    } else {
      drawAgents(snapshot, viewKey);
      drawFeedback(snapshot, viewKey);
      drawLighting(snapshot, viewKey, tiles);
    }
  }

  function pickTile(clientX, clientY, rect) {
    if (!state.snapshot || state.disposed) return null;
    const bounds = rect || containerRect();
    const left = Number(bounds.left) || 0;
    const top = Number(bounds.top) || 0;
    const rectWidth = Math.max(1, Number(bounds.width) || state.cssWidth);
    const rectHeight = Math.max(1, Number(bounds.height) || state.cssHeight);
    const px = (clientX - left) * (state.cssWidth / rectWidth);
    const py = (clientY - top) * (state.cssHeight / rectHeight);
    const size = mapSize(state.snapshot);
    const camera = cameraFor(state.snapshot);
    let tile = MATH.unproject(px, py, camera, 0, size);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (tile.x < 0 || tile.y < 0 || tile.x >= size || tile.y >= size) break;
      tile = MATH.unproject(px, py, camera, altitudeAt(state.snapshot, tile.y * size + tile.x), size);
    }
    if (tile.x < 0 || tile.y < 0 || tile.x >= size || tile.y >= size) return null;
    return { x: tile.x, y: tile.y };
  }

  function setPreview(preview) {
    state.preview = preview && typeof preview === "object" ? preview : null;
    state.previewRevision += 1;
    if (state.snapshot) drawFeedback(state.snapshot, "preview");
  }

  function clearPreview() {
    if (!state.preview) return;
    state.preview = null;
    state.previewRevision += 1;
    if (state.snapshot) drawFeedback(state.snapshot, "preview");
  }

  function rotateBy(quarterTurns) {
    if (!Number.isFinite(quarterTurns) || quarterTurns === 0) return state.camera.rotation;
    const steps = Number.isInteger(quarterTurns) ? quarterTurns : Math.sign(quarterTurns);
    state.camera.rotation = MATH.normalizeRotation(state.camera.rotation + steps);
    clearChunkCache();
    invalidateView();
    if (state.snapshot) render(state.snapshot);
    loadAtlasImages();
    return state.camera.rotation;
  }

  function zoomBy(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return state.camera.zoom;
    state.camera.zoom = MATH.clampZoom(state.camera.zoom * factor);
    clearChunkCache();
    invalidateView();
    if (state.snapshot) render(state.snapshot);
    return state.camera.zoom;
  }

  function panByScreen(dx, dy) {
    if (Number.isFinite(dx)) state.camera.panX += dx;
    if (Number.isFinite(dy)) state.camera.panY += dy;
    invalidateView();
    if (state.snapshot) render(state.snapshot);
    return { x: state.camera.panX, y: state.camera.panY };
  }

  function resetView(options = {}) {
    state.camera.zoom = MATH.clampZoom(Number.isFinite(options.zoom) ? options.zoom : MATH.DEFAULT_ZOOM);
    state.camera.rotation = MATH.normalizeRotation(options.rotation);
    state.camera.panX = Number.isFinite(options.panX) ? options.panX : 0;
    state.camera.panY = Number.isFinite(options.panY) ? options.panY : 0;
    // A tile-coordinate center (spawn flatland or a loaded city's built
    // centroid) converts to the pan that puts that tile at the viewport
    // middle. The map size comes from the caller because the new city's
    // snapshot has not rendered yet when the shell resets the view.
    const center = options.center;
    const centerSize = Number.isInteger(options.size) && options.size > 0
      ? options.size
      : (state.snapshot ? mapSize(state.snapshot) : 0);
    if (center && Number.isFinite(center.x) && Number.isFinite(center.y) && centerSize > 0) {
      const rotated = MATH.rotateTile(center.x, center.y, centerSize, state.camera.rotation);
      const zoom = state.camera.zoom;
      state.camera.panX = -(rotated.x - rotated.y) * (MATH.TILE_W / 2) * zoom;
      state.camera.panY = ((centerSize - 1) - (rotated.x + rotated.y)) * (MATH.TILE_H / 2) * zoom;
    }
    state.overlay = normalizeOverlay(options.overlay);
    clearChunkCache();
    invalidateView();
    if (state.snapshot) render(state.snapshot);
    loadAtlasImages();
  }

  function dispose() {
    if (state.observer) state.observer.disconnect();
    state.observer = null;
    if (state.activeRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(state.activeRaf);
    state.activeRaf = 0;
    clearChunkCache();
    clearAllLayers();
    state.createdCanvases.forEach((canvas) => canvas.remove());
    state.createdCanvases.clear();
    state.canvases = {};
    state.contexts = {};
    state.stack = null;
    state.snapshot = null;
    state.preview = null;
    state.overlay = "none";
    state.images = {};
    state.imagePromises = {};
    state.imageFailures = {};
    state.lastKeys = {};
    state.ready = false;
    state.mounted = false;
    state.disposed = true;
    state.visibleTileCount = 0;
    state.cssWidth = 0;
    state.cssHeight = 0;
    state.backingWidth = 0;
    state.backingHeight = 0;
  }

  function miniMapTerrainColor(snapshot, index) {
    const winter = Math.floor(((Number(snapshot.tick) || 0) % 1500) / 375) === 3;
    if (isWater(snapshot, index)) return winter ? "#dce8ee" : "#356e9a";
    const terrain = gridValue(snapshot, ["terrainType", "terrain"], index, 1);
    const base = terrain === "rock" || terrain === 3 ? [133, 135, 130]
      : terrain === "soil" || terrain === 2 ? [149, 109, 73]
        : [99, 147, 84];
    // SC2000 minimap reads elevation as brightness: lowlands dim, peaks
    // lighten toward the rock band.
    const alt = altitudeAt(snapshot, index);
    const lift = Math.max(-24, Math.min(40, (alt - 4) * 6));
    const channel = (value) => Math.max(32, Math.min(224, value + lift));
    return `rgb(${channel(base[0])},${channel(base[1])},${channel(base[2])})`;
  }

  function miniMapViewportBounds(viewport, size) {
    if (!viewport || typeof viewport !== "object") return null;
    if (Array.isArray(viewport.tiles) && viewport.tiles.length) {
      const xs = viewport.tiles.map((tile) => Number(tile.x)).filter(Number.isFinite);
      const ys = viewport.tiles.map((tile) => Number(tile.y)).filter(Number.isFinite);
      if (!xs.length || !ys.length) return null;
      return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs) + 1, height: Math.max(...ys) - Math.min(...ys) + 1 };
    }
    const x = Number(viewport.x ?? viewport.minX);
    const y = Number(viewport.y ?? viewport.minY);
    const width = Number(viewport.width ?? viewport.w ?? (Number(viewport.maxX) - x + 1));
    const height = Number(viewport.height ?? viewport.h ?? (Number(viewport.maxY) - y + 1));
    if (![x, y, width, height].every(Number.isFinite)) return null;
    return {
      x: Math.max(0, Math.min(size - 1, x)),
      y: Math.max(0, Math.min(size - 1, y)),
      width: Math.max(1, Math.min(size - x, width)),
      height: Math.max(1, Math.min(size - y, height)),
    };
  }

  function renderMiniMap(canvas, snapshot, options = {}) {
    if (!canvas || typeof canvas.getContext !== "function" || !snapshot) return null;
    const rect = typeof canvas.getBoundingClientRect === "function" ? canvas.getBoundingClientRect() : null;
    const cssWidth = Math.max(1, Math.round(Number(options.width) || Number(rect?.width) || Number(canvas.clientWidth) || 160));
    const cssHeight = Math.max(1, Math.round(Number(options.height) || Number(rect?.height) || Number(canvas.clientHeight) || 112));
    const dpr = Math.max(1, Math.min(2, requestedDpr(options.dpr)));
    const backingWidth = Math.max(1, Math.round(cssWidth * dpr));
    const backingHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, backingWidth, backingHeight);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#18251c";
    context.fillRect(0, 0, cssWidth, cssHeight);

    const size = mapSize(snapshot);
    const overlay = normalizeOverlay(options.overlay);
    for (let y = 0; y < size; y += 1) {
      const top = Math.floor((y * cssHeight) / size);
      const bottom = Math.ceil(((y + 1) * cssHeight) / size);
      for (let x = 0; x < size; x += 1) {
        const index = y * size + x;
        const left = Math.floor((x * cssWidth) / size);
        const right = Math.ceil(((x + 1) * cssWidth) / size);
        context.fillStyle = miniMapTerrainColor(snapshot, index);
        context.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
        // SC2000 minimap features: networks as dark lines, buildings and
        // facilities as light pixels, claimed zones as faint tints.
        const featureX = Math.floor((left + right) / 2);
        const featureY = Math.floor((top + bottom) / 2);
        if (isRoad(snapshot, index) || isRail(snapshot, index) || isWire(snapshot, index)
          || gridValue(snapshot, ["highway"], index, false) || isPipe(snapshot, index)) {
          context.fillStyle = "rgba(24,26,24,0.92)";
          context.fillRect(featureX, featureY, 1, 1);
        } else if (Number(gridValue(snapshot, ["stage", "buildingStage"], index, 0)) > 0
          || gridValue(snapshot, ["buildingState"], index, 0) > 0
          || (snapshot.facilityAt && snapshot.facilityAt[index] >= 0)) {
          context.fillStyle = "rgba(232,228,214,0.95)";
          context.fillRect(featureX, featureY, 1, 1);
        } else if (Number(gridValue(snapshot, ["zone", "zoneType"], index, 0)) > 0) {
          context.fillStyle = "rgba(255,255,255,0.28)";
          context.fillRect(featureX, featureY, 1, 1);
        }
        if (overlay !== "none" && !isWater(snapshot, index)) {
          context.fillStyle = overlayColor(overlay, overlayBucket(overlay, overlayValue(snapshot, overlay, index)));
          context.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
        }
      }
    }

    const viewport = miniMapViewportBounds(options.viewport, size);
    if (viewport) {
      const x = (viewport.x / size) * cssWidth;
      const y = (viewport.y / size) * cssHeight;
      const width = (viewport.width / size) * cssWidth;
      const height = (viewport.height / size) * cssHeight;
      context.strokeStyle = "rgba(0,0,0,0.88)";
      context.lineWidth = 3;
      context.strokeRect(x, y, width, height);
      context.strokeStyle = "rgba(255,255,255,0.95)";
      context.lineWidth = 1;
      context.strokeRect(x, y, width, height);
    }
    return Object.freeze({ cssWidth, cssHeight, backingWidth, backingHeight, dpr, tileCount: size * size, overlay });
  }

  function debugStats() {
    const view = Object.freeze({
      rotation: state.camera.rotation,
      zoom: state.camera.zoom,
      panX: state.camera.panX,
      panY: state.camera.panY,
      overlay: state.overlay,
    });
    return Object.freeze({
      cssWidth: state.cssWidth,
      cssHeight: state.cssHeight,
      backingWidth: state.backingWidth,
      backingHeight: state.backingHeight,
      dpr: state.dpr,
      activeRaf: Number(state.activeRaf || 0),
      chunkCacheCount: state.chunkCache.size,
      chunkBuildCount: state.chunkBuildCount,
      visibleTileCount: state.visibleTileCount,
      layerCount: Object.keys(state.canvases).length,
      rotation: state.camera.rotation,
      zoom: state.camera.zoom,
      panX: state.camera.panX,
      panY: state.camera.panY,
      overlay: state.overlay,
      view,
      disposed: state.disposed,
    });
  }

  window.AISystem6BonsaiCanvasRenderer = Object.freeze({
    LAYERS,
    CHUNK_SIZE,
    mount,
    isReady,
    resize,
    render,
    pickTile,
    setPreview,
    clearPreview,
    renderMiniMap,
    rotateBy,
    zoomBy,
    panByScreen,
    resetView,
    dispose,
    debugStats,
  });
})();
