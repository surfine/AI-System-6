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
  const OVERLAYS = Object.freeze(["none", "power", "water", "traffic", "pollution", "land-value", "police", "fire", "education", "health", "transit"]);

  // The 「线网」 overlay's colours, indexed by the tile category the snapshot
  // derived: nothing, the seven line colours, a bus, an avenue with no depot
  // in reach, an avenue corridor in service, and a station.
  const TRANSIT_COLORS = Object.freeze([
    "rgba(0,0,0,0)",
    "rgba(214,58,52,0.55)",
    "rgba(49,94,201,0.55)",
    "rgba(232,168,44,0.55)",
    "rgba(58,152,88,0.55)",
    "rgba(150,74,178,0.55)",
    "rgba(52,150,168,0.55)",
    "rgba(196,104,44,0.55)",
    "rgba(120,120,120,0.52)",
    "rgba(150,60,60,0.22)",
    "rgba(196,52,44,0.45)",
    "rgba(18,18,18,0.78)",
  ]);
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
    camera: { zoom: MATH?.DEFAULT_ZOOM || 0.5, rotation: 0, panX: 0, panY: 0 },
    chunkCache: new Map(),
    chunkBuildCount: 0,
    cacheClock: 0,
    visibleTileCount: 0,
    activeRaf: 0,
    lastKeys: {},
    // Everything the layers derive from the city's content — the sorted
    // scenery list, facilities, construction sites, waterfall edges — is
    // built once per content revision and reused by every frame until the
    // city changes. Panning used to rebuild and re-sort the whole map's
    // trees and buildings on every frame.
    derived: null,
    derivedBuilds: 0,
    buildingsDraws: 0,
    chunkSignatures: new Map(),
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

  // The canvas stops at 2x.
  //
  // Every sprite in the atlas is 1-bit-era artwork authored at 1x, so a third
  // device pixel buys nothing but work: on a phone at DPR 3 the backing store
  // is 1170x2532, and simply compositing the layers measured 50-115ms a frame
  // in the acceptance gate. Capping at 2x is a renderer resolution, not a
  // product one — the sim, the save format and the artwork are untouched — and
  // it is still twice the density the art was drawn for.
  const MAX_CANVAS_DPR = 2;

  function requestedDpr(value) {
    const asked = Number.isFinite(value) && value > 0
      ? value
      : (Number(window.devicePixelRatio) > 0 ? Number(window.devicePixelRatio) : 1);
    return Math.min(asked, MAX_CANVAS_DPR);
  }

  function clearContext(name) {
    const context = state.contexts[name];
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, state.backingWidth, state.backingHeight);
    context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    context.imageSmoothingEnabled = spriteSmoothing();
  }

  // Pixel art stays nearest-neighbour when it is drawn at or above its own
  // size; drawn smaller (the far zoom step, or the overview on a 1x screen)
  // nearest-neighbour drops whole rows of pixels and the city shimmers, so
  // the downscale is filtered instead.
  function spriteSmoothing() {
    return state.camera.zoom * state.dpr < 1;
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

  // `offset` quarter turns from the camera's own direction: 0 is the atlas
  // the camera looks through; 2, the opposite one, is fetched lazily for the
  // buildings whose street lies behind them (see buildingFacing).
  function loadAtlasImages(offset = 0) {
    const atlas = window.AISystem6BonsaiAtlas;
    const direction = DIRECTIONS[(state.camera.rotation + offset) % 4];
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
      const current = DIRECTIONS[state.camera.rotation];
      const opposite = DIRECTIONS[(state.camera.rotation + 2) % 4];
      if (direction !== current && direction !== opposite) return;
      if (direction === current) clearChunkCache();
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

  function isSubway(snapshot, index) {
    return Boolean(gridValue(snapshot, ["subway", "subwayTiles"], index, false));
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

  function drawSprite(context, name, sx, sy, mirror = false, offset = 0) {
    const frame = atlasFrame(name);
    let image = offset ? state.images[DIRECTIONS[(state.camera.rotation + offset) % 4]] : currentAtlasImage();
    if (!image && offset) {
      // The opposite atlas is still on its way: draw from the camera's own
      // one for now; the load repaints the buildings when it lands.
      loadAtlasImages(offset);
      image = currentAtlasImage();
    }
    if (!frame || !image) return false;
    const zoom = state.camera.zoom;
    if (mirror) {
      // Mirrored about the anchor: the two faces the camera sees swap, so
      // a building composed facing +z faces the side streets instead.
      context.save();
      context.translate(Math.round(sx), 0);
      context.scale(-1, 1);
      context.drawImage(image, frame.x, frame.y, frame.w, frame.h,
        Math.round(-frame.anchor.x * zoom), Math.round(sy - frame.anchor.y * zoom), Math.round(frame.w * zoom), Math.round(frame.h * zoom));
      context.restore();
      return true;
    }
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
      const oriented = `terrain.slope.mask-${higherNeighbours(snapshot, index)}`;
      return atlasFrame(oriented) ? oriented : "terrain.slope";
    }
    if (terrain === "rock" || terrain === 3) return "terrain.rock";
    if (terrain === "soil" || terrain === 2) return "terrain.soil";
    // Snow: peaks above the snow line always, plus the whole lowland in
    // winter — the OpenTTD-principled terrain read from the snapshot calendar.
    const winter = MATH.seasonOf(snapshot) === 3;
    if ((terrain === "grass" || terrain === "slope" || terrain === null)
      && (altitudeAt(snapshot, index) >= 24 || winter)) {
      return "terrain.snow";
    }
    return "terrain.grass";
  }

  // The world-space mask of the neighbours that stand higher than a tile:
  // bit 1 y-1, 2 x+1, 4 y+1, 8 x-1 — the edges a slope sprite lifts.
  function higherNeighbours(snapshot, index) {
    const size = mapSize(snapshot);
    const x = index % size;
    const y = Math.floor(index / size);
    const here = altitudeAt(snapshot, index);
    let mask = 0;
    if (y > 0 && altitudeAt(snapshot, index - size) > here) mask |= 1;
    if (x < size - 1 && altitudeAt(snapshot, index + 1) > here) mask |= 2;
    if (y < size - 1 && altitudeAt(snapshot, index + size) > here) mask |= 4;
    if (x > 0 && altitudeAt(snapshot, index - 1) > here) mask |= 8;
    return mask;
  }

  // The lifted edges of the ground a network piece lies on: the edges the
  // terrain sprite lifts on a slope tile, none elsewhere (a cliff stays a
  // step, as the ground does).
  function groundLift(snapshot, index) {
    if (isWater(snapshot, index)) return 0;
    const terrain = gridValue(snapshot, ["terrainType", "terrain"], index, null);
    if (terrain !== "slope" && !gridValue(snapshot, ["slope"], index, false)) return 0;
    return higherNeighbours(snapshot, index);
  }

  // Corner heights, in height steps, of a tile whose edges in the world-space
  // mask are lifted by `levels`, turned to the screen: corners A (top),
  // B (right), C (bottom), D (left) of the diamond.
  function liftedCorners(worldMask, levels = 1) {
    const r = state.camera.rotation;
    const mask = ((worldMask << r) | (worldMask >>> (4 - r))) & 15;
    const corners = [0, 0, 0, 0];
    if (mask & 1) { corners[0] = levels; corners[1] = levels; }
    if (mask & 2) { corners[1] = levels; corners[2] = levels; }
    if (mask & 4) { corners[2] = levels; corners[3] = levels; }
    if (mask & 8) { corners[3] = levels; corners[0] = levels; }
    return corners;
  }

  // A flat tile sprite laid on a tilted tile. SC2K has a network piece for
  // every slope; here the flat piece is cut into the four screen quadrants
  // around the tile centre — one arm each — and every quadrant is drawn under
  // the affine map that lays the flat tile onto that quarter of the surface:
  // the plane through the centre and the quadrant's two corners. Each arm so
  // ends at the height of its edge, where the neighbour's arm begins.
  // `corners` are heights in steps for A (top), B (right), C (bottom),
  // D (left); `center` defaults to their mean.
  const SURFACE_QUADRANTS = Object.freeze([
    { sx: 1, sy: -1, p: [[-0.5, -0.5], [0.5, -0.5]], c: [0, 1] },
    { sx: 1, sy: 1, p: [[0.5, -0.5], [0.5, 0.5]], c: [1, 2] },
    { sx: -1, sy: 1, p: [[0.5, 0.5], [-0.5, 0.5]], c: [2, 3] },
    { sx: -1, sy: -1, p: [[-0.5, 0.5], [-0.5, -0.5]], c: [3, 0] },
  ]);
  function drawOnSurface(context, name, sx, sy, corners, center = null) {
    if (corners.every((value) => value === corners[0]) && (center === null || center === corners[0])) {
      return drawSprite(context, name, sx, sy - corners[0] * MATH.HEIGHT_STEP * state.camera.zoom);
    }
    if (!atlasFrame(name) || !currentAtlasImage()) return false;
    const zoom = state.camera.zoom;
    const K = MATH.HEIGHT_STEP * zoom;
    const hw = (MATH.TILE_W / 2) * zoom;
    const hh = (MATH.TILE_H / 2) * zoom;
    const c = center === null ? (corners[0] + corners[1] + corners[2] + corners[3]) / 4 : center;
    const reach = 240 * zoom;
    SURFACE_QUADRANTS.forEach((quadrant) => {
      // z = c + a*du + b*dv through the two corners of this quadrant.
      const [[u1, v1], [u2, v2]] = quadrant.p;
      const z1 = corners[quadrant.c[0]] - c;
      const z2 = corners[quadrant.c[1]] - c;
      const det = u1 * v2 - u2 * v1;
      const a = (z1 * v2 - z2 * v1) / det;
      const b = (u1 * z2 - u2 * z1) / det;
      const m = -K * (a - b) / (2 * hw);
      const n = 1 - K * (a + b) / (2 * hh);
      context.save();
      context.transform(1, m, 0, n, 0, -m * sx - n * sy + sy - K * c);
      context.beginPath();
      context.rect(quadrant.sx > 0 ? sx : sx - reach, quadrant.sy > 0 ? sy : sy - reach, reach, reach);
      context.clip();
      drawSprite(context, name, sx, sy);
      context.restore();
    });
    return true;
  }

  // The lift in pixels (at zoom 1) of the ground at a screen offset from the
  // tile centre, for corner heights A (top), B (right), C (bottom), D (left):
  // bilinear across the tile, so it is exact along every edge.
  function surfaceLift(corners, dx, dy) {
    if (!corners.some(Boolean)) return 0;
    const du = (dx / (MATH.TILE_W / 2) + dy / (MATH.TILE_H / 2)) / 2;
    const dv = (dy / (MATH.TILE_H / 2) - dx / (MATH.TILE_W / 2)) / 2;
    const s = Math.max(0, Math.min(1, du + 0.5));
    const t = Math.max(0, Math.min(1, dv + 0.5));
    const z = corners[0] * (1 - s) * (1 - t) + corners[1] * s * (1 - t) + corners[2] * s * t + corners[3] * (1 - s) * t;
    return z * MATH.HEIGHT_STEP;
  }

  // A bridge deck rides at the height of its banks, not on the water: walk
  // each connected arm across the water to the first dry tile and take the
  // highest bank. A run with no bank yet sits one step over the water.
  function bridgeDeckAltitude(snapshot, x, y, predicate) {
    const size = mapSize(snapshot);
    let bank = -Infinity;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      for (let nx = x + dx, ny = y + dy, steps = 0; nx >= 0 && ny >= 0 && nx < size && ny < size && steps < size; nx += dx, ny += dy, steps += 1) {
        const i = ny * size + nx;
        if (!predicate(snapshot, i)) break;
        if (!isWater(snapshot, i)) { bank = Math.max(bank, altitudeAt(snapshot, i)); break; }
      }
    }
    const here = altitudeAt(snapshot, y * size + x);
    return Number.isFinite(bank) ? Math.max(bank, here + 1) : here + 1;
  }

  function drawPier(context, sx, top, bottom, zoom) {
    if (bottom - top < 2) return;
    context.fillStyle = "#6f7278";
    context.fillRect(sx - 2 * zoom, top, 2 * zoom, bottom - top);
    context.fillStyle = "#54565c";
    context.fillRect(sx, top, 2 * zoom, bottom - top);
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
    const sprite = terrainSprite(snapshot, index);
    // Fractional zoom rounds independently trimmed sprites to device pixels.
    // A small continuous bed closes subpixel gaps between adjacent diamonds.
    const halfW = MATH.TILE_W * state.camera.zoom / 2 + 0.75;
    const halfH = MATH.TILE_H * state.camera.zoom / 2 + 0.75;
    context.fillStyle = sprite === "terrain.snow" ? "#dce8ee" : isWater(snapshot, index) ? "#4b8191" : "#7d9463";
    context.beginPath();
    context.moveTo(point.sx, point.sy - halfH);
    context.lineTo(point.sx + halfW, point.sy);
    context.lineTo(point.sx, point.sy + halfH);
    context.lineTo(point.sx - halfW, point.sy);
    context.closePath();
    context.fill();
    if (!drawSprite(context, sprite, point.sx, point.sy)) {
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
    const halfW = MATH.TILE_W / 2, halfH = MATH.TILE_H / 2;
    const edges = {
      n: [[0, -halfH], [halfW, 0], [-3, 2]],
      s: [[-halfW, 0], [0, halfH], [3, -2]],
      e: [[halfW, 0], [0, halfH], [-3, -2]],
      w: [[0, -halfH], [-halfW, 0], [3, 2]],
    };
    for (const [dx, dy, dir] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (altitudeAt(snapshot, ny * size + nx) <= alt) continue;
      const ports = ["n", "e", "s", "w"];
      const [a, b, inward] = edges[ports[(ports.indexOf(dir) + state.camera.rotation) % 4]];
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
    // A street reaches out to the onramp that climbs from it.
    const mask = connectorMask(snapshot, x, y, family === "road" ? (snap, i) => isRoad(snap, i) || isOnramp(snap, i) : predicate);
    // Over water, road and rail tiles draw their deck family so crossings
    // read as bridges with guard rails, not floating ribbons. The deck rides
    // at the height of its banks and stands on a pier.
    const bridgeFamily = isWater(snapshot, index)
      ? (family === "road" ? "bridge-road" : family === "rail" ? "bridge-rail" : null)
      : null;
    const frameFamily = bridgeFamily || family;
    const ground = altitudeAt(snapshot, index);
    const deck = bridgeFamily ? bridgeDeckAltitude(snapshot, x, y, predicate) : ground;
    const point = projectPoint(snapshot, x, y, deck, true);
    if (bridgeFamily) {
      const zoom = state.camera.zoom;
      drawPier(context, point.sx, point.sy + 2 * zoom, point.sy + (deck - ground) * MATH.HEIGHT_STEP * zoom + 4 * zoom, zoom);
    }
    // On a slope the piece is laid on the tilted ground, so a hillside road,
    // railway or power line climbs with the hill instead of stepping.
    // A wire or pipe that shares a tile with a road draws the same frame over
    // it (the SC2000 wire-over-road look).
    const corners = bridgeFamily ? [0, 0, 0, 0] : liftedCorners(groundLift(snapshot, index));
    // A power line that shares its tile with a street or a railway stands its
    // pole on the kerb — the atlas's `wire.side` frames — instead of in the
    // middle of the carriageway. The conductors still run along the tile's
    // centre line, so they meet the neighbouring pieces exactly as before; if
    // the kerbside frame is ever missing, the centred one is the fallback.
    const kerbside = family === "wire" && (isRoad(snapshot, index) || isRail(snapshot, index));
    let spriteDrawn = kerbside
      ? drawOnSurface(context, `${frameFamily}.side.mask-${mask}`, point.sx, point.sy, corners)
      : false;
    if (!spriteDrawn) spriteDrawn = drawOnSurface(context, `${frameFamily}.mask-${mask}`, point.sx, point.sy, corners);
    if (!spriteDrawn) {
      const overlay = (family === "wire" || family === "pipe") && isRoad(snapshot, index);
      context.fillStyle = family === "road" ? "#555" : family === "rail" ? "#443c35" : "#292929";
      const w = overlay ? 4 : 18;
      const h = overlay ? 2 : 4;
      context.fillRect(point.sx - (w / 2) * state.camera.zoom, point.sy - (h / 2) * state.camera.zoom, w * state.camera.zoom, h * state.camera.zoom);
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
    // Half the neighbour offset on a 64x32 tile. These were written for the
    // old 48x24 tile and put the portals a quarter of the way inside the edge.
    const qx = MATH.TILE_W / 4;
    const qy = MATH.TILE_H / 4;
    const edges = [
      { bit: 1, ex: qx, ey: -qy, ok: y > 0 },
      { bit: 2, ex: qx, ey: qy, ok: x < size - 1 },
      { bit: 4, ex: -qx, ey: qy, ok: y < size - 1 },
      { bit: 8, ex: -qx, ey: -qy, ok: x > 0 },
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

  // --- avenues (the Basin avenue layer) --------------------------------------
  //
  // An avenue is two road tiles side by side, one carriageway each way, with
  // its BRT in the middle of the road, Yichang's and Guangzhou's way. The
  // snapshot's `avenue` layer holds each half's direction of travel (1 north,
  // 2 east, 4 south, 8 west); the median is on the driver's left, against the
  // other half, and a half its partner does not answer is an ordinary street.
  // A half is painted from the centre line out, in metres of its 16: the
  // median to 1.5, the red BRT lane to 5, a barrier to 5.5, two general lanes
  // to 11.5, the green non-motorised lane to 13 (bicycles and e-bikes), the
  // sidewalk to 15 and a verge. Each tile is classified pixel by pixel at the
  // atlas's own scale, so it is as crisp as the sprite art and scales with it.
  const AVENUE_LEFT = Object.freeze({ 1: [-1, 0], 2: [0, -1], 4: [1, 0], 8: [0, 1] });
  const AVENUE_AHEAD = Object.freeze({ 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] });
  const AVENUE_BACK = Object.freeze({ 1: 4, 2: 8, 4: 1, 8: 2 });
  // The atlas palette's road, concrete, grass and paint, with the bus lane's
  // red and the slow lane's green.
  const AVENUE_PAINT = Object.freeze({
    asphalt: [81, 87, 87], brt: [158, 60, 48], paint: [226, 224, 212], dash: [196, 194, 182],
    barrier: [206, 204, 192], slow: [86, 128, 100], kerb: [146, 144, 134], walk: [178, 176, 164],
    verge: [108, 139, 87], hedge: [78, 106, 65], parapet: [196, 194, 186], zebra: [236, 236, 226],
  });
  // Metres out from the median where each part ends.
  const AVENUE_BANDS = Object.freeze({ median: 1.5, brt: 5, barrier: 5.5, lanes: 11.5, slow: 13, walk: 15, edge: 16 });
  // Metres along from the tile centre: half a side street's mouth (a street
  // sprite is about 6.7 m across), the crossing box where the median and the
  // barrier open, and the outer edge of the zebras on either side of it.
  const AVENUE_MOUTH = 3.5;
  const AVENUE_BOX = 4.5;
  const AVENUE_ZEBRA = 6.5;
  // The sprite is the 64x32 diamond plus a pixel of overlap all round, so
  // neighbouring tiles meet without a seam at any zoom.
  const AVENUE_SPRITE = Object.freeze({ w: 66, h: 34, ax: 33, ay: 17, bleed: 1 / 32 });
  const avenueSprites = new Map();

  function avenueDirAt(snapshot, x, y) {
    const raw = snapshot.avenue;
    const size = mapSize(snapshot);
    if (!raw || x < 0 || y < 0 || x >= size || y >= size) return 0;
    const dir = Number(raw[y * size + x]) || 0;
    const left = AVENUE_LEFT[dir];
    if (!left || !isRoad(snapshot, y * size + x)) return 0;
    const px = x + left[0], py = y + left[1];
    if (px < 0 || py < 0 || px >= size || py >= size) return 0;
    return Number(raw[py * size + px]) === AVENUE_BACK[dir] && isRoad(snapshot, py * size + px) ? dir : 0;
  }

  // What a half meets. Along its run, ahead and behind: the avenue going on
  // (2), another street (1), or nothing (0: the avenue ends at a kerb). At
  // its outer kerb, a side street's mouth; at its own or its partner's, a
  // crossing, where the median opens. A parallel avenue alongside is its own
  // carriageway behind its own kerb, not a side street.
  function avenueFlags(snapshot, x, y, dir) {
    const size = mapSize(snapshot);
    const L = AVENUE_LEFT[dir], F = AVENUE_AHEAD[dir];
    const street = (tx, ty) => tx >= 0 && ty >= 0 && tx < size && ty < size && (isRoad(snapshot, ty * size + tx) || isOnramp(snapshot, ty * size + tx));
    const along = (k) => (avenueDirAt(snapshot, x + F[0] * k, y + F[1] * k) === dir ? 2 : street(x + F[0] * k, y + F[1] * k) ? 1 : 0);
    const sideStreet = (tx, ty) => {
      if (!street(tx, ty)) return false;
      const other = avenueDirAt(snapshot, tx, ty);
      return !other || Boolean(other & 5) !== Boolean(dir & 5);
    };
    const outer = sideStreet(x - L[0], y - L[1]);
    return { ahead: along(1), behind: along(-1), outer, crossing: outer || sideStreet(x + 2 * L[0], y + 2 * L[1]), bridge: isWater(snapshot, y * size + x) };
  }

  // The colour of one point of a half, `a` metres out from the median and
  // `s` along the tile (-0.5..0.5, positive the way its traffic runs).
  function avenueColour(a, s, flags) {
    const P = AVENUE_PAINT, B = AVENUE_BANDS;
    const m = s * 16;
    const along = Math.abs(m);
    const finish = flags.bridge ? P.parapet : P.verge;
    // Where nothing lies beyond, the carriageway stops 3 m short of the edge
    // behind a kerb, a sidewalk and the verge.
    const end = Math.min(flags.ahead === 0 ? 8 - m : 99, flags.behind === 0 ? 8 + m : 99);
    if (end < 3) {
      if (end < 1 || a >= B.walk) return finish;
      return end > 2.6 && a < B.slow ? P.kerb : P.walk;
    }
    // The outer side: a side street's mouth, with a zebra for the sidewalk
    // across it; otherwise the kerb, the sidewalk and the verge (a parapet
    // on a bridge).
    if (a >= B.slow) {
      if (flags.outer && along < AVENUE_MOUTH) return a >= B.slow + 0.3 && a < B.walk - 0.3 && Math.floor(m + 8) % 2 === 0 ? P.zebra : P.asphalt;
      if (a >= B.walk) return flags.bridge && a >= B.edge - 0.45 ? P.kerb : finish;
      return a < B.slow + 0.4 || (flags.outer && along < AVENUE_MOUTH + 0.4) ? P.kerb : P.walk;
    }
    const box = flags.crossing && along < AVENUE_BOX;
    // The median stops 3 m short of where the avenue does not go on, so
    // traffic can turn round its nose.
    const nose = (flags.ahead !== 2 && m > 3) || (flags.behind !== 2 && m < -3);
    let colour;
    if (a < B.median) colour = box || nose ? P.asphalt : flags.bridge || a >= 0.75 ? P.walk : P.hedge;
    else if (a < B.brt) colour = P.brt;
    else if (a < B.barrier) colour = box ? P.asphalt : P.barrier;
    else if (a < B.lanes) colour = !box && a >= 8.25 && a < 8.75 && (m + 8) % 8 >= 1 && (m + 8) % 8 < 5 ? P.dash : P.asphalt;
    else colour = a < B.lanes + 0.4 ? P.paint : P.slow;
    // Zebras across the whole carriageway, median included, either side of
    // the crossing box.
    if (flags.crossing && along >= AVENUE_BOX && along < AVENUE_ZEBRA && Math.floor(a) % 2 === 0) colour = P.zebra;
    return colour;
  }

  // A half's pixels at the atlas scale, RGBA, the tile centre at the anchor.
  // The inverse of the 2:1 projection turns each pixel back into a point of
  // the tile for the camera's quarter turn.
  function avenueTilePixels(dir, rotation, flags) {
    const { w, h, ax, ay, bleed } = AVENUE_SPRITE;
    const out = new Uint8ClampedArray(w * h * 4);
    const L = AVENUE_LEFT[dir], F = AVENUE_AHEAD[dir];
    const turn = ((rotation % 4) + 4) % 4;
    for (let py = 0; py < h; py += 1) {
      for (let px = 0; px < w; px += 1) {
        const dx = px + 0.5 - ax, dy = py + 0.5 - ay;
        const ru = (dx / (MATH.TILE_W / 2) + dy / (MATH.TILE_H / 2)) / 2;
        const rv = (dy / (MATH.TILE_H / 2) - dx / (MATH.TILE_W / 2)) / 2;
        const u = turn === 0 ? ru : turn === 1 ? rv : turn === 2 ? -ru : -rv;
        const v = turn === 0 ? rv : turn === 1 ? -ru : turn === 2 ? -rv : ru;
        if (Math.abs(u) > 0.5 + bleed || Math.abs(v) > 0.5 + bleed) continue;
        const colour = avenueColour((0.5 - (u * L[0] + v * L[1])) * 16, u * F[0] + v * F[1], flags);
        const k = (py * w + px) * 4;
        out[k] = colour[0]; out[k + 1] = colour[1]; out[k + 2] = colour[2]; out[k + 3] = 255;
      }
    }
    return out;
  }

  // A half laid on its tilted surface, at the atlas scale: the surface
  // between the four corners (heights in steps, A top, B right, C bottom,
  // D left) is bilinear, which is exact along every edge, so it meets its
  // neighbours, and keeps every line parallel to the run straight within the
  // tile, so lanes climb without bowing. The flat tile is sampled four times
  // finer than its pixels and each sample is dropped where the surface puts
  // it, nearer samples over farther ones; the tile centre at the base height
  // lands on the anchor, `lift` pixels lower than the flat sprite's.
  function avenueWarpedPixels(dir, rotation, flags, corners) {
    const { w, ax, ay, bleed } = AVENUE_SPRITE;
    const step = MATH.HEIGHT_STEP;
    const lift = Math.ceil(Math.max(0, ...corners) * step);
    const h = AVENUE_SPRITE.h + lift;
    const anchorY = ay + lift;
    const out = new Uint8ClampedArray(w * h * 4);
    const depth = new Float32Array(w * h).fill(-Infinity);
    const L = AVENUE_LEFT[dir], F = AVENUE_AHEAD[dir];
    const turn = ((rotation % 4) + 4) % 4;
    const [A, B, C, D] = corners;
    const samples = 4 * MATH.TILE_W;
    const span = 1 + 2 * bleed;
    for (let i = 0; i < samples; i += 1) {
      const ru = -0.5 - bleed + ((i + 0.5) / samples) * span;
      const s = Math.max(0, Math.min(1, ru + 0.5));
      for (let j = 0; j < samples; j += 1) {
        const rv = -0.5 - bleed + ((j + 0.5) / samples) * span;
        const t = Math.max(0, Math.min(1, rv + 0.5));
        const z = A * (1 - s) * (1 - t) + B * s * (1 - t) + C * s * t + D * (1 - s) * t;
        const px = Math.floor((ru - rv) * (MATH.TILE_W / 2) + ax);
        const py = Math.floor((ru + rv) * (MATH.TILE_H / 2) - z * step + anchorY);
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const k = py * w + px;
        if (ru + rv < depth[k]) continue;
        depth[k] = ru + rv;
        const u = turn === 0 ? ru : turn === 1 ? rv : turn === 2 ? -ru : -rv;
        const v = turn === 0 ? rv : turn === 1 ? -ru : turn === 2 ? -rv : ru;
        const colour = avenueColour((0.5 - (u * L[0] + v * L[1])) * 16, u * F[0] + v * F[1], flags);
        out[k * 4] = colour[0]; out[k * 4 + 1] = colour[1]; out[k * 4 + 2] = colour[2]; out[k * 4 + 3] = 255;
      }
    }
    return { width: w, height: h, anchorX: ax, anchorY, lift, pixels: out };
  }

  // One canvas per kind of half; null where the canvas cannot take pixels,
  // and the tile then draws as the street it also is.
  function avenueSprite(dir, rotation, flags, corners = null) {
    const tilted = corners && corners.some(Boolean);
    const key = `${dir}:${rotation}:${flags.ahead}${flags.behind}${flags.outer ? 1 : 0}${flags.crossing ? 1 : 0}${flags.bridge ? 1 : 0}${tilted ? `:${corners.join(",")}` : ""}`;
    if (avenueSprites.has(key)) return avenueSprites.get(key);
    const art = tilted ? avenueWarpedPixels(dir, rotation, flags, corners)
      : { width: AVENUE_SPRITE.w, height: AVENUE_SPRITE.h, anchorX: AVENUE_SPRITE.ax, anchorY: AVENUE_SPRITE.ay, pixels: null };
    let sprite = null;
    const canvas = makeOffscreen(art.width, art.height);
    const context = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    if (context && typeof context.createImageData === "function" && typeof context.putImageData === "function") {
      const image = context.createImageData(art.width, art.height);
      image.data.set(art.pixels || avenueTilePixels(dir, rotation, flags));
      context.putImageData(image, 0, 0);
      sprite = { canvas, width: art.width, height: art.height, anchorX: art.anchorX, anchorY: art.anchorY };
    }
    if (avenueSprites.size >= 512) avenueSprites.clear();
    avenueSprites.set(key, sprite);
    return sprite;
  }

  // The deck a half rides on a bridge: both halves share one, at the higher
  // bank either of them reaches.
  function avenueDeckAltitude(snapshot, x, y, dir) {
    const size = mapSize(snapshot);
    const L = AVENUE_LEFT[dir];
    let deck = isWater(snapshot, y * size + x) ? bridgeDeckAltitude(snapshot, x, y, isRoad) : -Infinity;
    if (isWater(snapshot, (y + L[1]) * size + x + L[0])) deck = Math.max(deck, bridgeDeckAltitude(snapshot, x + L[0], y + L[1], isRoad));
    return deck;
  }

  // A half's own corner heights, absolute, in world order NW, NE, SE, SW:
  // the pair's deck on a bridge, the tilted ground elsewhere.
  function avenueNaturalCorners(snapshot, x, y, dir) {
    const index = y * mapSize(snapshot) + x;
    if (isWater(snapshot, index)) { const deck = avenueDeckAltitude(snapshot, x, y, dir); return [deck, deck, deck, deck]; }
    const ground = altitudeAt(snapshot, index);
    const mask = groundLift(snapshot, index);
    return [mask & 9 ? 1 : 0, mask & 3 ? 1 : 0, mask & 6 ? 1 : 0, mask & 12 ? 1 : 0].map((lift) => ground + lift);
  }

  // One surface for the whole avenue: each grid vertex an avenue touches
  // stands at the highest height any avenue half meeting there gives it, so
  // both halves of a pair share their median edge, a run meets the next tile
  // on it, and the first tile on land rises to meet the deck. Each half's
  // pieces are planes through its corners, so they then join edge to edge.
  // World order NW, NE, SE, SW, absolute heights.
  function avenueWorldCorners(snapshot, x, y) {
    const offsets = [[0, 0], [1, 0], [1, 1], [0, 1]];
    return offsets.map(([ox, oy]) => {
      const vx = x + ox, vy = y + oy;
      let height = -Infinity;
      offsets.forEach(([cx, cy], corner) => {
        // The tile whose corner `corner` is this vertex.
        const tx = vx - cx, ty = vy - cy;
        const dir = avenueDirAt(snapshot, tx, ty);
        if (dir) height = Math.max(height, avenueNaturalCorners(snapshot, tx, ty, dir)[corner]);
      });
      return height;
    });
  }

  // Where a half is drawn from: its base altitude (the deck on a bridge, the
  // ground elsewhere) and its corners in steps above it, turned to the
  // screen (A top, B right, C bottom, D left).
  function avenueSurface(snapshot, x, y, dir) {
    const index = y * mapSize(snapshot) + x;
    const base = isWater(snapshot, index) ? avenueDeckAltitude(snapshot, x, y, dir) : altitudeAt(snapshot, index);
    const world = avenueWorldCorners(snapshot, x, y);
    const turn = ((state.camera.rotation % 4) + 4) % 4;
    return { base, world, corners: [0, 1, 2, 3].map((i) => world[(i - turn + 4) % 4] - base) };
  }

  function drawAvenueTile(context, snapshot, x, y) {
    const dir = avenueDirAt(snapshot, x, y);
    if (!dir) return false;
    const flags = avenueFlags(snapshot, x, y, dir);
    const index = y * mapSize(snapshot) + x;
    const zoom = state.camera.zoom;
    const ground = altitudeAt(snapshot, index);
    const { base, corners } = avenueSurface(snapshot, x, y, dir);
    // A flat half is the flat sprite; a tilted one is drawn already laid on
    // its surface (avenueWarpedPixels), never sheared after the fact.
    const sprite = avenueSprite(dir, state.camera.rotation, flags, corners);
    if (!sprite) return false;
    const point = projectPoint(snapshot, x, y, base, true);
    if (flags.bridge) drawPier(context, point.sx, point.sy + 2 * zoom, point.sy + (base - ground) * MATH.HEIGHT_STEP * zoom + 4 * zoom, zoom);
    context.drawImage(sprite.canvas, 0, 0, sprite.width, sprite.height,
      Math.round(point.sx - sprite.anchorX * zoom), Math.round(point.sy - sprite.anchorY * zoom),
      Math.round(sprite.width * zoom), Math.round(sprite.height * zoom));
    if (isTunnel(snapshot, index)) drawTunnelOverlay(context, snapshot, x, y, point);
    return true;
  }

  // What the renderer makes of one avenue tile at the current quarter turn,
  // for contracts: the half's direction, what it meets, the surface it is
  // laid on, its flat pixels, and (`laid`) the pixels it is drawn with on
  // that surface, which are the flat ones where the half lies flat.
  function avenueTile(snapshot, x, y) {
    const dir = avenueDirAt(snapshot, x, y);
    if (!dir) return null;
    const flags = avenueFlags(snapshot, x, y, dir);
    const surface = avenueSurface(snapshot, x, y, dir);
    const pixels = avenueTilePixels(dir, state.camera.rotation, flags);
    const laid = surface.corners.some(Boolean) ? avenueWarpedPixels(dir, state.camera.rotation, flags, surface.corners)
      : { width: AVENUE_SPRITE.w, height: AVENUE_SPRITE.h, anchorX: AVENUE_SPRITE.ax, anchorY: AVENUE_SPRITE.ay, lift: 0, pixels };
    return Object.freeze({ dir, ...flags, base: surface.base, worldCorners: Object.freeze(surface.world), corners: Object.freeze(surface.corners), width: AVENUE_SPRITE.w, height: AVENUE_SPRITE.h, anchorX: AVENUE_SPRITE.ax, anchorY: AVENUE_SPRITE.ay,
      paint: AVENUE_PAINT, pixels, laid: Object.freeze(laid) });
  }

  // Highways stand on piers, SC2K-style: the deck rides HIGHWAY_DECK_STEPS
  // over the ground (over its banks on a bridge), roads and railways pass
  // underneath, and onramps climb from the street to the deck. The deck and
  // the ramps are elevated objects, so they are drawn with the buildings and
  // sorted with them (drawElevatedHighway); the ground keeps only the
  // shadow the deck throws.
  const HIGHWAY_DECK_STEPS = 1;
  function drawHighway(context, snapshot, x, y) {
    const size = mapSize(snapshot);
    const index = y * size + x;
    if (!isHighway(snapshot, index) || isWater(snapshot, index)) return;
    const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, index), true);
    const zoom = state.camera.zoom;
    context.fillStyle = "rgba(22, 28, 24, 0.18)";
    context.beginPath();
    context.moveTo(point.sx + 4 * zoom, point.sy - 7 * zoom);
    context.lineTo(point.sx + 28 * zoom, point.sy + 5 * zoom);
    context.lineTo(point.sx + 4 * zoom, point.sy + 17 * zoom);
    context.lineTo(point.sx - 20 * zoom, point.sy + 5 * zoom);
    context.closePath();
    context.fill();
  }

  const onHighway = (snapshot, index) => isHighway(snapshot, index) || isOnramp(snapshot, index);

  // Two highways that cross — both running on past the crossing, not a T —
  // make an interchange: the world-x run climbs over the world-y run. A tile
  // of the crossing has highway on all four sides and at least two tiles of
  // highway beyond it in every direction.
  function highwayRunLength(snapshot, x, y, dx, dy, limit) {
    const size = mapSize(snapshot);
    let length = 0;
    for (let nx = x + dx, ny = y + dy; length < limit && nx >= 0 && ny >= 0 && nx < size && ny < size && isHighway(snapshot, ny * size + nx); nx += dx, ny += dy) length += 1;
    return length;
  }
  function isInterchange(snapshot, x, y) {
    const size = mapSize(snapshot);
    if (x < 0 || y < 0 || x >= size || y >= size || !isHighway(snapshot, y * size + x)) return false;
    return [[0, -1], [1, 0], [0, 1], [-1, 0]].every(([dx, dy]) => highwayRunLength(snapshot, x, y, dx, dy, 2) >= 2);
  }
  // The upper run's deck height at an edge `e` tiles out from the crossing:
  // two decks up over it, easing down to one over two tiles.
  const INTERCHANGE_RAMP_TILES = 2;
  const upperDeck = (e) => HIGHWAY_DECK_STEPS * (1 + Math.max(0, 1 - e / INTERCHANGE_RAMP_TILES));
  // A world-x highway tile within the ramp of an interchange: its distance in
  // tiles (1 = next to the crossing) and the world edge that faces it.
  function interchangeApproach(snapshot, x, y) {
    for (const [dx, edge] of [[1, 2], [-1, 8]]) {
      for (let d = 1; d <= INTERCHANGE_RAMP_TILES; d += 1) {
        const size = mapSize(snapshot);
        const nx = x + dx * d;
        if (nx < 0 || nx >= size || !isHighway(snapshot, y * size + nx)) break;
        if (isInterchange(snapshot, nx, y)) return { d, edge };
      }
    }
    return null;
  }
  function drawElevatedHighway(context, snapshot, item, point) {
    const size = mapSize(snapshot);
    const x = Number.isFinite(item.tileX) ? item.tileX : Math.floor(item.x);
    const y = Number.isFinite(item.tileY) ? item.tileY : Math.floor(item.y);
    const index = y * size + x;
    const zoom = state.camera.zoom;
    const K = MATH.HEIGHT_STEP * zoom;
    const ground = altitudeAt(snapshot, index);
    const water = isWater(snapshot, index);
    const base = water ? bridgeDeckAltitude(snapshot, x, y, onHighway) : ground;
    const baseY = point.sy - (base - ground) * K;
    const slope = water ? [0, 0, 0, 0] : liftedCorners(groundLift(snapshot, index));
    if (!item.onramp) {
      const mask = connectorMask(snapshot, x, y, isHighway);
      const family = water ? "bridge-highway" : "highway";
      if (isInterchange(snapshot, x, y)) {
        // The crossing: the world-y deck below; the world-x deck over it
        // comes as its own item, after the whole block.
        // Each deck joins its own run and the sibling carriageway beside it.
        if (item.visualKind === "highway-upper") {
          const upperMask = 10 | (isInterchange(snapshot, x, y - 1) ? 1 : 0) | (isInterchange(snapshot, x, y + 1) ? 4 : 0);
          drawOnSurface(context, `${family}.mask-${upperMask}`, point.sx, baseY, slope.map((value) => value + upperDeck(0)));
          return;
        }
        const lowerMask = 5 | (isInterchange(snapshot, x + 1, y) ? 2 : 0) | (isInterchange(snapshot, x - 1, y) ? 8 : 0);
        drawPier(context, point.sx, baseY - upperDeck(0) * K + 4 * zoom, point.sy + 2 * zoom, zoom);
        drawOnSurface(context, `${family}.mask-${lowerMask}`, point.sx, baseY, slope.map((value) => value + HIGHWAY_DECK_STEPS));
        return;
      }
      const approach = interchangeApproach(snapshot, x, y);
      let deck = slope.map((value) => value + HIGHWAY_DECK_STEPS);
      if (approach) {
        const inner = liftedCorners(approach.edge, 1);
        deck = inner.map((onInner, corner) => slope[corner] + upperDeck(onInner ? approach.d - 1 : approach.d));
      }
      drawPier(context, point.sx, baseY - Math.max(...deck) * K + 4 * zoom, point.sy + 2 * zoom, zoom);
      if (!drawOnSurface(context, `${family}.mask-${mask}`, point.sx, baseY, deck)) {
        context.fillStyle = "#4a4a52";
        context.fillRect(point.sx - 11 * zoom, baseY - HIGHWAY_DECK_STEPS * K - 7 * zoom, 22 * zoom, 8 * zoom);
      }
      return;
    }
    // A ramp has two ends: a highway side (wide) and a road side (narrow).
    // When each side has exactly one neighbour, pick the orientation frame;
    // otherwise fall back to the mask ribbon. The ramp climbs from the road
    // edge at street level to the highway edge at deck level.
    const hMask = connectorMask(snapshot, x, y, isHighway);
    const rMask = connectorMask(snapshot, x, y, isRoad);
    const dirs = (mask) => ["n", "e", "s", "w"].filter((_, bit) => mask & (1 << bit));
    const hDirs = dirs(hMask);
    const rDirs = dirs(rMask);
    const orientation = hDirs.length === 1 && rDirs.length === 1 ? `onramp.${hDirs[0]}${rDirs[0]}` : null;
    const onrampMask = connectorMask(snapshot, x, y, (snap, i) => isRoad(snap, i) || isHighway(snap, i) || isOnramp(snap, i));
    const onrampFrame = orientation && atlasFrame(orientation) ? orientation : `onramp.mask-${onrampMask}`;
    const high = liftedCorners(hMask, HIGHWAY_DECK_STEPS);
    const low = liftedCorners(rMask, 1);
    // Corners on the highway edge stand at the deck; corners on the road
    // edge at the street; a corner shared by both, or by neither, halfway.
    const corners = high.map((value, corner) => {
      if (value && low[corner]) return HIGHWAY_DECK_STEPS / 2;
      if (value) return value;
      if (low[corner]) return 0;
      return hMask ? HIGHWAY_DECK_STEPS / 2 : 0;
    }).map((value, corner) => value + slope[corner]);
    drawPier(context, point.sx, baseY - (HIGHWAY_DECK_STEPS / 2) * K + 4 * zoom, point.sy + 2 * zoom, zoom);
    if (!drawOnSurface(context, onrampFrame, point.sx, baseY, corners)) {
      context.fillStyle = "#5a5a60";
      context.fillRect(point.sx - 9 * zoom, baseY - K - 3 * zoom, 18 * zoom, 5 * zoom);
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
    // On a slope the tint lies on the tilted ground, like the network pieces.
    const corners = liftedCorners(groundLift(snapshot, index));
    const zoom = state.camera.zoom;
    const lift = (dx, dy) => surfaceLift(corners, dx / zoom, dy / zoom) * zoom;
    if (corners.some(Boolean)) {
      const halfW = (MATH.TILE_W / 2) * zoom;
      const halfH = (MATH.TILE_H / 2) * zoom;
      const K = MATH.HEIGHT_STEP * zoom;
      context.beginPath();
      context.moveTo(point.sx, point.sy - halfH - corners[0] * K);
      context.lineTo(point.sx + halfW, point.sy - corners[1] * K);
      context.lineTo(point.sx, point.sy + halfH - corners[2] * K);
      context.lineTo(point.sx - halfW, point.sy - corners[3] * K);
      context.closePath();
      context.fillStyle = color;
      context.fill();
    } else {
      fallbackDiamond(context, point.sx, point.sy, color, null);
    }
    const zone = gridValue(snapshot, ["zone", "zoneType"], index, ZONE.NONE);
    if (zone === ZONE.R || zone === ZONE.C || zone === ZONE.I) {
      // A whisper of a hatch — three short strokes — so claimed land stays
      // calm and clean rather than busy.
      context.strokeStyle = "rgba(255,255,255,0.08)";
      context.lineWidth = 1;
      for (let i = -1; i <= 1; i += 1) {
        const x0 = -9 * zoom + i * 7 * zoom; const y0 = -4 * zoom + i * 3.5 * zoom;
        const x1 = x0 + 18 * zoom; const y1 = 4 * zoom - i * 3.5 * zoom;
        context.beginPath();
        context.moveTo(point.sx + x0, point.sy + y0 - lift(x0, y0));
        context.lineTo(point.sx + x1, point.sy + y1 - lift(x1, y1));
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
      for (const axis of [{ dx: MATH.TILE_W / 4, dy: MATH.TILE_H / 4 }, { dx: -MATH.TILE_W / 4, dy: MATH.TILE_H / 4 }]) {
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

  // Civic buildings, leisure and rewards draw the original catalog art the
  // atlas already carries; everything else has a facility frame.
  const FACILITY_SPRITES = Object.freeze({
    hospital: "catalog.hospital", university: "catalog.college", library: "catalog.library", museum: "catalog.museum",
    prison: "catalog.prison", zoo: "catalog.zoo", stadium: "catalog.stadium", marina: "catalog.marina", "park-big": "catalog.park_big",
    "mayors-house": "catalog.mayors_house", "city-hall": "catalog.city_hall", statue: "catalog.statue", dome: "catalog.dome",
    arco: "catalog.arcology", "arco-plymouth": "catalog.arcology", "arco-forest": "catalog.arcology", "arco-darco": "catalog.arcology", "arco-launch": "catalog.arcology",
  });
  // A coal plant takes a 4x4 pad; one from an older save or a .sc2 import
  // keeps its 2x2 footprint and the 2x2 art drawn for it.
  function facilitySprite(kind, footprint = null) {
    if (kind === "coal" && footprint && footprint.w === 2 && footprint.h === 2) return "facility.coal-2x2";
    return FACILITY_SPRITES[kind] || `facility.${kind}`;
  }
  function normalizeFacilityKind(kind) {
    const value = String(kind || "").toLowerCase();
    // Exact new kinds first: substring rules below would misfile them.
    for (const exact of ["hydro", "oil", "gas", "nuclear", "solar", "microwave", "fusion", "treatment", "desal", "subway-station", "bus", ...Object.keys(FACILITY_SPRITES)]) {
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
        const frame = atlasFrame(facilitySprite(kind, object.footprint));
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
    drawSprite(context, nightFrame(facilitySprite(object.kind, object.footprint), snapshot), point.sx, point.sy);
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

  // A chunk's identity is a hash of what it draws. Hashing is not free — a
  // visible screen holds a few thousand tiles — so each chunk is hashed once
  // per content revision of the city it belongs to and remembered until the
  // city changes, the display switches change, or another city is shown. A
  // snapshot without a revision number is hashed every time, as before.
  function chunkSignature(snapshot, layer, chunkX, chunkY) {
    const owner = snapshot.alt || snapshot.terrain || snapshot;
    const revision = Number.isFinite(snapshot.rev) ? snapshot.rev : null;
    const flags = [MATH.seasonOf(snapshot), isNight(snapshot) ? 1 : 0, state.display.zones ? 1 : 0,
      state.display.infrastructure ? 1 : 0, state.display.underground ? 1 : 0].join("");
    const memo = state.chunkSignatureMemo;
    if (revision === null || !memo || memo.owner !== owner || memo.revision !== revision || memo.flags !== flags) {
      state.chunkSignatureMemo = revision === null ? null : { owner, revision, flags };
      state.chunkSignatures.clear();
    }
    const memoKey = `${layer}:${chunkX}:${chunkY}`;
    if (state.chunkSignatureMemo && state.chunkSignatures.has(memoKey)) return state.chunkSignatures.get(memoKey);
    const signature = computeChunkSignature(snapshot, layer, chunkX, chunkY);
    if (state.chunkSignatureMemo) state.chunkSignatures.set(memoKey, signature);
    return signature;
  }

  function computeChunkSignature(snapshot, layer, chunkX, chunkY) {
    const size = mapSize(snapshot);
    const startX = chunkX * CHUNK_SIZE;
    const startY = chunkY * CHUNK_SIZE;
    const endX = Math.min(size, startX + CHUNK_SIZE);
    const endY = Math.min(size, startY + CHUNK_SIZE);
    const alt = snapshot.alt || snapshot.height || snapshot.elevation || null;
    const water = snapshot.water || null;
    const terrain = snapshot.terrainType || snapshot.terrain || null;
    const networks = layer === "terrain" ? [] : [
      snapshot.road || snapshot.roads, snapshot.rail || snapshot.rails, snapshot.wire || snapshot.wires,
      snapshot.pipe || snapshot.pipes, snapshot.subway, snapshot.highway, snapshot.onramp, snapshot.over,
      // Widening a street into an avenue changes no other layer.
      snapshot.avenue,
    ].filter(Boolean);
    const zone = snapshot.zone || snapshot.zoneType || null;
    let hash = 2166136261;
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const index = y * size + x;
        hash = fnvUpdate(hash, alt ? alt[index] : 0);
        if (layer === "terrain") {
          hash = fnvUpdate(hash, water ? water[index] : 0);
          hash = fnvAny(hash, terrain ? terrain[index] : 0);
        } else {
          for (let n = 0; n < networks.length; n += 1) hash = fnvUpdate(hash, networks[n][index]);
          hash = fnvAny(hash, zone ? zone[index] : 0);
        }
      }
    }
    if (layer === "terrain") {
      hash = fnvUpdate(hash, MATH.seasonOf(snapshot));
    }
    if (layer === "infrastructure") {
      hash = fnvUpdate(hash, isNight(snapshot) ? 1 : 0);
      // The M4 display switches alter what this chunk draws, so they are part
      // of its identity — otherwise toggling re-composes from stale chunks.
      hash = fnvUpdate(hash, state.display.zones ? 1 : 0);
      hash = fnvUpdate(hash, state.display.infrastructure ? 1 : 0);
      hash = fnvUpdate(hash, state.display.underground ? 1 : 0);
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
      // All four ground corners: after a quarter turn the lowest corner on
      // screen is (endX, startY) or (startX, endY), and leaving it out cut
      // the chunk canvas short — a black triangle under every chunk.
      projectPoint(snapshot, startX, startY, 0, true),
      projectPoint(snapshot, endX, startY, 0, true),
      projectPoint(snapshot, startX, endY, 0, true),
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
    context.imageSmoothingEnabled = spriteSmoothing();
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
          if (state.display.underground) {
            // Subways and tunnels are the only networks that live below the
            // surface; they draw on the dark underground view and never on
            // the daylight map (the SC2000 underground display). The water
            // above shows as a faint blue, so a line under a river reads as
            // the tunnel it is (subways may cross water from rule set v6).
            const index = y * mapSize(snapshot) + x;
            if (isWater(snapshot, index)) {
              const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, index), true);
              fallbackDiamond(context, point.sx, point.sy, "rgba(52, 96, 140, 0.42)", null);
            }
            drawConnector(context, snapshot, x, y, "subway", isSubway);
            drawConnector(context, snapshot, x, y, "pipe", isPipe);
          } else {
            // An avenue half paints its own cross-section; any other street
            // is the atlas's piece.
            if (!drawAvenueTile(context, snapshot, x, y)) drawConnector(context, snapshot, x, y, "road", isRoad);
            drawConnector(context, snapshot, x, y, "rail", isRail);
            drawHighway(context, snapshot, x, y);
            drawConnector(context, snapshot, x, y, "wire", isWire);
            // Water pipes are buried: like the subway they show on the
            // underground view only, as in SC2K.
          }
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
    state.sceneryRaster = null;
    state.sceneryExtents = null;
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
    const size = mapSize(snapshot);
    const columns = Math.ceil(size / CHUNK_SIZE);
    tiles.forEach(([x, y]) => {
      const chunkX = Math.floor(x / CHUNK_SIZE);
      const chunkY = Math.floor(y / CHUNK_SIZE);
      const key = chunkY * columns + chunkX;
      if (!chunks.has(key)) chunks.set(key, { chunkX, chunkY });
    });
    sceneryFor(snapshot).facilities.forEach((facility) => {
      const x = Math.max(0, Math.min(size - 1, Math.floor(facility.x)));
      const y = Math.max(0, Math.min(size - 1, Math.floor(facility.y)));
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, y * size + x));
      if (point.sx < -100 || point.sx > state.cssWidth + 100 || point.sy < -120 || point.sy > state.cssHeight + 50) return;
      const chunkX = Math.floor(x / CHUNK_SIZE);
      const chunkY = Math.floor(y / CHUNK_SIZE);
      const key = chunkY * columns + chunkX;
      if (!chunks.has(key)) chunks.set(key, { chunkX, chunkY });
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

  // The per-tile layers, resolved once per pass.
  //
  // Every one of these loops used to call gridValue(snapshot, ["stage",
  // "buildingStage"], index, 0) for every tile — re-resolving the same two
  // names, and then the same array, sixteen thousand times a pass, with five
  // such passes on every simulation tick (one for the signature, one for the
  // buildings, one each for trees, parks and blaze). A 128x128 city therefore
  // paid roughly a hundred thousand name lookups per tick before a sprite was
  // drawn, which is what the acceptance gate's frame-cost contract measures and
  // what the player feels as a stutter. The arrays do not change between
  // passes; they are named once, here.
  function gridLayers(snapshot) {
    return {
      stage: snapshot?.stage || snapshot?.buildingStage || null,
      variant: snapshot?.variant || snapshot?.buildingVariant || null,
      zone: snapshot?.zone || snapshot?.zoneType || null,
      buildingState: snapshot?.buildingState || null,
      trees: snapshot?.tree || snapshot?.trees || null,
      park: snapshot?.park || null,
      over: snapshot?.over || null,
      catalogId: snapshot?.catalogId || null,
      blaze: snapshot?.blaze || null,
    };
  }

  function layerAt(layer, index, fallback = 0) {
    return layer && layer[index] !== undefined ? layer[index] : fallback;
  }

  function buildingObjects(snapshot) {
    const size = mapSize(snapshot);
    const layers = gridLayers(snapshot);
    const buildings = [];
    const covered = new Uint8Array(size * size);
    if (Array.isArray(snapshot.buildings)) {
      snapshot.buildings.filter((building) => Number.isFinite(building.x) && Number.isFinite(building.y)).forEach((building) => {
        const footprint = normalizeFootprint(building.footprint, building.w || building.width, building.h || building.height);
        const status = normalizeBuildingState(building.state || building.status);
        const prefix = zonePrefix(building.zone || building.type) || "r";
        // A lot that is not standing normally shows its state at its own
        // size. Where the atlas has no state frame for that size, each cell
        // gets the one-tile construction or abandoned sprite instead of a
        // 2x2 frame drawn over a different footprint.
        const transient = status === "foundation" || status === "construction" || status === "recovering" || status === "abandoned";
        if (transient && footprint.w !== 2 && !atlasFrame(`building.${prefix}.${footprint.w}.1.${status}`)) {
          const spriteId = status === "abandoned" ? "catalog.abandoned" : "catalog.construction";
          for (let dy = 0; dy < footprint.h; dy += 1) for (let dx = 0; dx < footprint.w; dx += 1) {
            buildings.push({ ...building, x: building.x + dx, y: building.y + dy, w: 1, h: 1, footprint: { w: 1, h: 1 }, spriteId });
          }
        } else buildings.push({ ...building, footprint });
        for (let dy = 0; dy < footprint.h; dy += 1) for (let dx = 0; dx < footprint.w; dx += 1) {
          const cx = building.x + dx;
          const cy = building.y + dy;
          if (cx >= 0 && cy >= 0 && cx < size && cy < size) covered[cy * size + cx] = 1;
        }
      });
    }
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (covered[y * size + x]) continue;
        const index = y * size + x;
        const stage = Number(layerAt(layers.stage, index, 0)) | 0;
        const zone = layerAt(layers.zone, index, ZONE.NONE);
        const buildingState = layerAt(layers.buildingState, index, stage > 0 ? 3 : 0);
        if ((!stage && !buildingState) || !zonePrefix(zone)) continue;
        buildings.push({
          x,
          y,
          zone,
          stage,
          variant: Number(layerAt(layers.variant, index, 1)) || 1,
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
    // A declining building still stands: it keeps its own look unless the
    // atlas has a declined frame at its size.
    const sized = `building.${prefix}.${stage}.1.${buildState}`;
    const preferred = buildState === "normal"
      ? (night ? `building.${prefix}.${stage}.${variant}.night` : `building.${prefix}.${stage}.${variant}.normal`)
      : atlasFrame(sized) ? sized : stage === 2 ? `building.${prefix}.2.1.${buildState}` : `building.${prefix}.${stage}.${variant}.normal`;
    return atlasFrame(preferred) ? preferred : `building.${prefix}.${stage}.${variant}.normal`;
  }

  // The scenery the buildings layer draws — grown buildings, trees, parks,
  // blazes and imported landmarks — sorted into painter order and projected to
  // rotated map coordinates once per content revision, rotation, season and
  // night flag. A frame only culls and draws; before, every pan rebuilt the
  // whole map's list, sorted it, and hashed every tile to decide whether it
  // had to. A snapshot without a revision number is rebuilt every time.
  function treeSpriteVariant(season, index) {
    // Seasons accent the forest, they do not repaint it: one tree in
    // eight blossoms in spring, one in three turns in autumn, and the
    // rest stay green so the woods still read as woods.
    return season === 0
      ? ((index % 8) === 0 ? 5 : 1 + (index % 3))
      : season === 3
        ? ((index % 3) === 0 ? 6 : 1 + (index % 3))
        : season === 2
          ? ((index % 3) === 0 ? 4 : 1 + (index % 3))
          : 1 + (index % 3);
  }

  function sceneryFor(snapshot) {
    const owner = snapshot.alt || snapshot.terrain || snapshot;
    const revision = Number.isFinite(snapshot.rev) ? snapshot.rev : null;
    const season = MATH.seasonOf(snapshot);
    const night = isNight(snapshot);
    const key = `${revision}:${state.camera.rotation}:${season}:${night ? "n" : "d"}`;
    const cached = state.derived;
    if (revision !== null && cached && cached.owner === owner && cached.key === key) return cached;
    const size = mapSize(snapshot);
    const layers = gridLayers(snapshot);
    const scenery = buildingObjects(snapshot).map((building) => ({ ...building, visualKind: "building" }));
    if (Array.isArray(snapshot.trees)) {
      snapshot.trees.forEach((tree, sequence) => {
        if (tree && Number.isFinite(tree.x) && Number.isFinite(tree.y)) {
          scenery.push({ ...tree, visualKind: "tree", variant: tree.variant || 1 + (sequence % 3), footprint: { w: 1, h: 1 } });
        }
      });
    } else if (layers.trees) {
      for (let index = 0; index < size * size; index += 1) {
        if (!layers.trees[index]) continue;
        scenery.push({ x: index % size, y: Math.floor(index / size), visualKind: "tree", variant: treeSpriteVariant(season, index), footprint: { w: 1, h: 1 } });
      }
    }
    for (let index = 0; index < size * size; index += 1) {
      if (!layerAt(layers.park, index, false) && layerAt(layers.over, index, OVER.NONE) !== OVER.PARK) continue;
      scenery.push({ x: index % size, y: Math.floor(index / size), visualKind: "park", variant: 1 + (index % 2), footprint: { w: 1, h: 1 } });
    }
    const constructionSites = [];
    if (layers.blaze || layers.buildingState) {
      for (let index = 0; index < size * size; index += 1) {
        const value = layers.blaze ? layers.blaze[index] : 0;
        if (value) scenery.push({ x: index % size, y: Math.floor(index / size), visualKind: "blaze", flooded: value === 6, age: value, footprint: { w: 1, h: 1 } });
        if (layers.buildingState && Number(layers.buildingState[index]) === 2) constructionSites.push(index);
      }
    }
    const catalog = window.AISystem6BonsaiCatalog;
    MATH.collectCatalogObjects(snapshot, catalog).forEach((object) => scenery.push({ ...object, visualKind: "catalog" }));
    // Highway decks and onramps stand above the ground, so they sort with
    // the buildings: a tower behind the deck stays behind it.
    const upperDecks = [];
    for (let index = 0; index < size * size; index += 1) {
      const highway = isHighway(snapshot, index);
      if (!highway && !isOnramp(snapshot, index)) continue;
      const x = index % size;
      const y = Math.floor(index / size);
      scenery.push({ x, y, visualKind: "highway", onramp: !highway, footprint: { w: 1, h: 1 } });
      // An interchange's upper deck is drawn after every lower deck of its
      // crossing block: it sorts as the whole 2x2 block, drawn at its tile.
      if (highway && isInterchange(snapshot, x, y)) {
        const blockX = isInterchange(snapshot, x - 1, y) ? x - 1 : x;
        const blockY = isInterchange(snapshot, x, y - 1) ? y - 1 : y;
        upperDecks.push({ x: blockX, y: blockY, tileX: x, tileY: y, visualKind: "highway-upper", footprint: { w: 2, h: 2 } });
      }
    }
    scenery.push(...upperDecks);
    const items = MATH.sortByAnchor(scenery, size, state.camera.rotation).map((object) => {
      if (Number.isFinite(object.tileX)) {
        const rotated = MATH.rotateTile(object.tileX, object.tileY, size, state.camera.rotation);
        return { object, rx: rotated.x, ry: rotated.y, alt: altitudeAt(snapshot, object.tileY * size + object.tileX) };
      }
      const baseX = Math.max(0, Math.min(size - 1, Math.floor(object.x)));
      const baseY = Math.max(0, Math.min(size - 1, Math.floor(object.y)));
      const footprint = normalizeFootprint(object.footprint, object.width, object.height);
      const rotated = MATH.rotateTile(object.x + ((footprint.w || 1) - 1) / 2, object.y + ((footprint.h || 1) - 1) / 2, size, state.camera.rotation);
      return { object, rx: rotated.x, ry: rotated.y, alt: altitudeAt(snapshot, baseY * size + baseX) };
    });
    const blossoms = [];
    if (season === 0 && layers.trees) {
      for (let index = 0; index < size * size; index += 3) if (layers.trees[index]) blossoms.push(index);
    }
    state.derived = {
      owner, key, items, constructionSites, blossoms,
      facilities: facilityObjects(snapshot),
      waterfalls: typeof MATH.waterfallEdges === "function" ? MATH.waterfallEdges(snapshot) : [],
      serial: (state.derivedBuilds += 1),
    };
    return state.derived;
  }

  // Sprite anchors can sit far below the viewport while their towers remain
  // visible. Cache conservative atlas extents; symmetric X also covers mirrors.
  function sceneryInView(point, margin = 0) {
    if (!state.sceneryExtents) {
      const extent = { x: 120, above: 130, below: 60 };
      for (const frame of Object.values(window.AISystem6BonsaiAtlas?.frames || {})) {
        if (!frame.anchor) continue;
        extent.x = Math.max(extent.x, frame.anchor.x, frame.w - frame.anchor.x);
        extent.above = Math.max(extent.above, frame.anchor.y);
        extent.below = Math.max(extent.below, frame.h - frame.anchor.y);
      }
      state.sceneryExtents = extent;
    }
    const { x, above, below } = state.sceneryExtents;
    const zoom = state.camera.zoom;
    return point.sx >= -margin - x * zoom && point.sx <= state.cssWidth + margin + x * zoom
      && point.sy >= -margin - below * zoom && point.sy <= state.cssHeight + margin + above * zoom;
  }

  function drawBuildings(snapshot, viewKey) {
    const night = isNight(snapshot);
    const derived = sceneryFor(snapshot);
    const showBuildings = state.display.buildings;
    const showHighways = state.display.infrastructure;
    const key = `${viewKey}:${derived.serial}:${showBuildings ? "b" : "-"}${showHighways ? "h" : "-"}`;
    if (state.lastKeys.buildings === key) return;
    state.lastKeys.buildings = key;
    clearContext("buildings");
    state.buildingsDraws += 1;
    const context = state.contexts.buildings;
    // Keep one overscanned painter-ordered image. Small camera moves only
    // composite it; a content change or leaving its margin repaints it.
    const margin = 128;
    const rasterKey = `${derived.serial}:${showBuildings}:${showHighways}:${state.cssWidth}:${state.cssHeight}:${state.dpr}:${state.camera.zoom}:${state.camera.rotation}`;
    let raster = state.sceneryRaster;
    let dx = raster ? state.camera.panX - raster.panX : 0;
    let dy = raster ? state.camera.panY - raster.panY : 0;
    if (!raster || raster.key !== rasterKey || Math.abs(dx) > margin || Math.abs(dy) > margin) {
      const width = state.cssWidth + 2 * margin;
      const height = state.cssHeight + 2 * margin;
      const canvas = raster?.canvas || makeOffscreen(1, 1);
      const backingWidth = Math.ceil(width * state.dpr);
      const backingHeight = Math.ceil(height * state.dpr);
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;
      const paint = canvas.getContext("2d", { alpha: true });
      paint.setTransform(1, 0, 0, 1, 0, 0);
      paint.clearRect(0, 0, backingWidth, backingHeight);
      paint.setTransform(state.dpr, 0, 0, state.dpr, margin * state.dpr, margin * state.dpr);
      paint.imageSmoothingEnabled = spriteSmoothing();
      const camera = cameraFor(snapshot);
      const halfW = (MATH.TILE_W / 2) * state.camera.zoom;
      const halfH = (MATH.TILE_H / 2) * state.camera.zoom;
      const lift = MATH.HEIGHT_STEP * state.camera.zoom;
      for (const item of derived.items) {
        const point = { sx: camera.originX + (item.rx - item.ry) * halfW,
          sy: camera.originY + (item.rx + item.ry) * halfH - item.alt * lift };
        if (!sceneryInView(point, margin)) continue;
        if (String(item.object.visualKind).startsWith("highway") ? !showHighways : !showBuildings) continue;
        drawSceneryItem(paint, snapshot, item.object, point, night);
      }
      raster = { key: rasterKey, canvas, width, height, panX: state.camera.panX, panY: state.camera.panY };
      state.sceneryRaster = raster;
      state.sceneryRasterBuilds = (state.sceneryRasterBuilds || 0) + 1;
      dx = 0; dy = 0;
    }
    context.drawImage(raster.canvas, dx - margin, dy - margin, raster.width, raster.height);
  }

  // A planned building faces its street (shared rule): the art holds one
  // view direction, so a lot whose street runs east or west is drawn
  // mirrored, which lays its long side along that street.
  // Which way a building's front turns: toward its street, quarter k (0 = the
  // authored +y front). A frame from atlas direction d shows the model as the
  // camera at d sees it, so a building turned k quarters is the frame from
  // direction d − k. Two atlases cover it with mirroring: k 0 the camera's
  // own frame, k 1 that frame mirrored, k 2 the opposite atlas's frame, k 3
  // the opposite frame mirrored — the front always on the street side.
  function buildingFacing(snapshot, building) {
    if (typeof MATH.streetQuarter !== "function") return { mirror: false, offset: 0 };
    const size = mapSize(snapshot);
    const footprint = building.footprint || { w: building.w || 1, h: building.h || 1 };
    const k = ((MATH.streetQuarter((tx, ty) => tx >= 0 && ty >= 0 && tx < size && ty < size && isRoad(snapshot, ty * size + tx),
      Math.floor(building.x), Math.floor(building.y), footprint) % 4) + 4) % 4;
    return { mirror: k % 2 === 1, offset: k >= 2 ? 2 : 0 };
  }


  function drawSceneryItem(context, snapshot, building, point, night) {
    if (building.visualKind === "highway" || building.visualKind === "highway-upper") {
      drawElevatedHighway(context, snapshot, building, point);
      return;
    }
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
      if (building.spriteId && drawSprite(context, nightFrame(building.spriteId, snapshot), point.sx, point.sy)) return;
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
    if (building.visualKind === "park") {
      // A park tile draws its own lawn-and-bench or fountain frame; an atlas
      // without them falls back to the young tree parks used to be.
      if (!drawSprite(context, `park.small.${building.variant || 1}`, point.sx, point.sy)) drawSprite(context, "tree.young", point.sx, point.sy);
      return;
    }
    if (building.visualKind === "tree") {
      drawSprite(context, `tree.${building.variant === 2 ? "conifer" : building.variant === 3 ? "young" : building.variant === 4 ? "maple" : building.variant === 5 ? "blossom" : building.variant === 6 ? "winter" : "broadleaf"}`, point.sx, point.sy);
      return;
    }
    if (building.spriteId && drawSprite(context, nightFrame(building.spriteId, snapshot), point.sx, point.sy)) return;
    const facing = buildingFacing(snapshot, building);
    if (!drawSprite(context, buildingFrame(building, night), point.sx, point.sy, facing.mirror, facing.offset)) {
      const color = zonePrefix(building.zone) === "r" ? "#b75d52" : zonePrefix(building.zone) === "c" ? "#486eaf" : "#b67c3b";
      context.fillStyle = color;
      const width = 22 * state.camera.zoom;
      const height = 20 * Math.max(1, building.stage || 1) * state.camera.zoom;
      context.fillRect(point.sx - width / 2, point.sy - height, width, height);
    }
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
    (sceneryFor(snapshot).waterfalls || []).forEach((edge, index) => {
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
    for (const index of sceneryFor(snapshot).constructionSites) {
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
    if (MATH.seasonOf(snapshot) !== 0) return;
    const size = mapSize(snapshot);
    const zoom = state.camera.zoom;
    const tick = Number(snapshot.tick) | 0;
    // Blossom trees only, matching the sprite selection; the derived list
    // holds them, so a frame never walks the whole map to find them.
    for (const index of sceneryFor(snapshot).blossoms) {
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

  // Where a car or a train rides: on a bridge, the deck; on a slope, the
  // middle of the tilted piece.
  function travelAltitude(snapshot, x, y) {
    const index = y * mapSize(snapshot) + x;
    // An avenue half rides the pair's one surface.
    const dir = avenueDirAt(snapshot, x, y);
    if (dir) return avenueWorldCorners(snapshot, x, y).reduce((sum, value) => sum + value, 0) / 4;
    if (isWater(snapshot, index)) {
      if (isRoad(snapshot, index)) return bridgeDeckAltitude(snapshot, x, y, isRoad);
      if (isRail(snapshot, index)) return bridgeDeckAltitude(snapshot, x, y, isRail);
    }
    const corners = liftedCorners(groundLift(snapshot, index));
    return altitudeAt(snapshot, index) + (corners[0] + corners[1] + corners[2] + corners[3]) / 4;
  }

  // --- traffic, the 3D backend's rules ------------------------------------
  // bonsai-renderer-voxel.js (collectAgentBlocks) places every vehicle fact
  // on its road tile: the axis the street runs along, a direction that
  // alternates between neighbouring facts, a right-hand lane, and a roll
  // forward through the five ticks between deals; streets also carry cars in
  // proportion to their traffic count. The same numbers here put each vehicle
  // in the same lane, facing the same way, as the 3D view. Headings are world
  // directions: px/nx along ±x, py/ny along ±y.
  const TRAFFIC_CAP = 360;
  function trafficHash(index) {
    let x = index | 0;
    x = (x ^ (x >>> 16)) | 0;
    x = Math.imul(x, 0x45d9f3b) | 0;
    x = (x ^ (x >>> 16)) | 0;
    return x >>> 0;
  }

  function trafficPlacements(snapshot) {
    const agents = snapshot.agents;
    const size = mapSize(snapshot);
    const tick = Number(snapshot.tick) | 0;
    const streets = Boolean(snapshot.road);
    const inMap = (tx, ty) => tx >= 0 && ty >= 0 && tx < size && ty < size;
    const drivable = (snap, i) => isRoad(snap, i) || isOnramp(snap, i) || isHighway(snap, i);
    const placed = [];
    const headingOf = (F) => (F[0] > 0 ? "px" : F[0] < 0 ? "nx" : F[1] > 0 ? "py" : "ny");
    const frameFor = (agent, index, predicate, laneOffset, travel, avenueLanes = false) => {
      const tx = Math.max(0, Math.min(size - 1, Math.floor(agent.x)));
      const ty = Math.max(0, Math.min(size - 1, Math.floor(agent.y)));
      const seed = trafficHash(index * 977 + 13);
      // On an avenue a vehicle keeps to its own half and that half's way,
      // in one of its two general lanes (7 m or 10 m out from the median);
      // the BRT lane is left to the buses. The 3D view keeps the street rule.
      const dir = avenueLanes && streets ? avenueDirAt(snapshot, tx, ty) : 0;
      if (dir) {
        const L = AVENUE_LEFT[dir], F = AVENUE_AHEAD[dir];
        const out = 0.5 - ((seed >>> 3) & 1 ? 10 : 7) / 16;
        const ahead = ((((Number(agent.phase) || 0) + (tick % 5) * travel) % 1) - 0.5) * 0.9;
        return { wx: tx + 0.5 + L[0] * out + F[0] * ahead, wy: ty + 0.5 + L[1] * out + F[1] * ahead, heading: headingOf(F) };
      }
      const mask = streets ? connectorMask(snapshot, tx, ty, predicate) : 0;
      const ew = Boolean(mask & 10), ns = Boolean(mask & 5);
      const alongX = ew && ns ? Boolean(seed & 1) : ew;
      const sign = streets ? ((index + (seed >>> 5)) & 1 ? 1 : -1) : 1;
      const lane = streets ? laneOffset * sign : 0;
      const along = streets ? (((Number(agent.phase) || 0) + (tick % 5) * travel) % 1) - 0.5 : 0;
      return {
        wx: tx + 0.5 + (alongX ? along * 0.9 * sign : -lane),
        wy: ty + 0.5 + (alongX ? lane : along * 0.9 * sign),
        heading: alongX ? (sign > 0 ? "px" : "nx") : (sign > 0 ? "py" : "ny"),
      };
    };
    const flow = [];
    if (streets && snapshot.traffic) {
      const wanted = [];
      let total = 0;
      for (let i = 0; i < size * size; i += 1) {
        if (!drivable(snapshot, i) || isTunnel(snapshot, i)) continue;
        const count = Math.min(3, Math.floor((Number(snapshot.traffic[i]) || 0) / 40));
        if (count) { wanted.push([i, count]); total += count; }
      }
      const keep = Math.min(1, TRAFFIC_CAP / Math.max(1, total));
      wanted.forEach(([i, count]) => {
        for (let j = 0; j < count; j += 1) {
          const h = trafficHash(i * 13 + j * 7 + 1);
          if ((h % 1000) / 1000 >= keep) continue;
          flow.push({ x: i % size, y: Math.floor(i / size), phase: (j + ((h >>> 10) % 100) / 100) / count });
        }
      });
    }
    const vehicles = (Array.isArray(agents.vehicles) ? agents.vehicles : [])
      .filter((agent) => !streets || !isTunnel(snapshot, Math.floor(agent.y) * size + Math.floor(agent.x)));
    [...vehicles, ...flow].forEach((agent, index) => {
      if (!Number.isFinite(agent?.x) || !Number.isFinite(agent?.y)) return;
      placed.push({ ...frameFor(agent, index, drivable, 0.12, 0.18, true), frame: `agent.car.${1 + (index % 4)}` });
    });
    (Array.isArray(agents.trains) ? agents.trains : []).forEach((agent, index) => {
      if (!Number.isFinite(agent?.x) || !Number.isFinite(agent?.y)) return;
      placed.push({ ...frameFor(agent, index, isRail, 0, 0.1), frame: `agent.train.${1 + (index % 2)}` });
    });
    const services = ["police", "fire", "medical"];
    (Array.isArray(agents.serviceVehicles) ? agents.serviceVehicles : []).forEach((agent, index) => {
      if (!Number.isFinite(agent?.x) || !Number.isFinite(agent?.y)) return;
      let spot = agent;
      if (streets) {
        const ax = Math.floor(agent.x), ay = Math.floor(agent.y);
        spot = null;
        for (let r = 0; r <= 3 && !spot; r += 1) {
          for (let dy = -r; dy <= r && !spot; dy += 1) for (let dx = -r; dx <= r && !spot; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !inMap(ax + dx, ay + dy)) continue;
            if (isRoad(snapshot, (ay + dy) * size + ax + dx)) spot = { ...agent, x: ax + dx, y: ay + dy };
          }
        }
        if (!spot) return;
      }
      const kind = agent.kind || services[index % services.length];
      placed.push({ ...frameFor(spot, index + 5, drivable, 0.12, 0.2, true), frame: `agent.service.${kind}` });
    });
    // People walk the sidewalk of the street nearest their building, on the
    // building's side; with no street near they stay home.
    (Array.isArray(agents.pedestrians) ? agents.pedestrians : []).forEach((agent, index) => {
      if (!Number.isFinite(agent?.x) || !Number.isFinite(agent?.y)) return;
      const ax = Math.floor(agent.x), ay = Math.floor(agent.y);
      let wx = ax + 0.5, wy = ay + 0.5, heading = null;
      if (streets) {
        let best = Infinity, spot = null;
        for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) {
          if ((!dx && !dy) || !inMap(ax + dx, ay + dy)) continue;
          const i = (ay + dy) * size + ax + dx;
          const d = Math.hypot(dx, dy);
          if (d < best && isRoad(snapshot, i) && !isWater(snapshot, i)) { best = d; spot = { tx: ax + dx, ty: ay + dy, dx, dy }; }
        }
        if (!spot) return;
        const walk = (((Number(agent.phase) || 0) + (tick % 5) * 0.06) % 1) - 0.5;
        // An avenue's only sidewalk is at its outer kerb, 14 m from the median.
        const dir = avenueDirAt(snapshot, spot.tx, spot.ty);
        if (dir) {
          const L = AVENUE_LEFT[dir], F = AVENUE_AHEAD[dir];
          const out = 0.5 - 14 / 16;
          placed.push({ wx: spot.tx + 0.5 + L[0] * out + F[0] * walk * 0.8, wy: spot.ty + 0.5 + L[1] * out + F[1] * walk * 0.8,
            heading: F[0] ? "px" : "py", frame: `agent.pedestrian.${1 + (index % 2)}` });
          return;
        }
        const mask = connectorMask(snapshot, spot.tx, spot.ty, isRoad);
        const ew = Boolean(mask & 10), ns = Boolean(mask & 5);
        const alongX = ew && ns ? Math.abs(spot.dy) >= Math.abs(spot.dx) : ew || !ns;
        const side = (delta) => (delta ? -Math.sign(delta) : ((trafficHash(index * 31) & 1) ? 1 : -1)) * 0.38;
        wx = spot.tx + 0.5 + (alongX ? walk * 0.8 : side(spot.dx));
        wy = spot.ty + 0.5 + (alongX ? side(spot.dy) : walk * 0.8);
        heading = alongX ? "px" : "py";
      }
      placed.push({ wx, wy, heading, frame: `agent.pedestrian.${1 + (index % 2)}` });
    });
    return placed;
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
          const point = projectPoint(snapshot, agent.x, agent.y, travelAltitude(snapshot, tileX, tileY));
          const phase = (Number(agent.phase) || 0) - 0.5;
          drawSprite(context, frameFor(agent, index), point.sx + phase * 8, point.sy + phase * 2 - verticalOffset * state.camera.zoom);
        });
      };
      // Vehicles drive in their lane along the street and face the way they
      // go; people walk the sidewalk. Placement is the 3D backend's, number
      // for number, so a car is in the same lane in both views.
      trafficPlacements(snapshot)
        .sort((a, b) => (a.wx + a.wy) - (b.wx + b.wy))
        .forEach((agent) => {
          const tx = Math.max(0, Math.min(size - 1, Math.floor(agent.wx)));
          const ty = Math.max(0, Math.min(size - 1, Math.floor(agent.wy)));
          const point = projectPoint(snapshot, agent.wx - 0.5, agent.wy - 0.5, travelAltitude(snapshot, tx, ty));
          const headed = agent.heading ? `${agent.frame}.${agent.heading}` : agent.frame;
          drawSprite(context, atlasFrame(headed) ? headed : agent.frame, point.sx, point.sy);
        });
      drawFacts(snapshot.agents.smoke, (_agent, index) => `agent.smoke.${1 + (index % 3)}`, 28);
      return;
    }
    const roads = [];
    const rails = [];
    const occupied = [];
    const layers = gridLayers(snapshot);
    for (let index = 0; index < size * size; index += 1) {
      if (isRoad(snapshot, index)) roads.push(index);
      if (isRail(snapshot, index)) rails.push(index);
      if (Number(layerAt(layers.stage, index, 0)) > 0) occupied.push(index);
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

  // Problem flags (spec 3.11): a small pixel sign over a building or zoned
  // plot that is short of power or water, has no road, cannot commute, or
  // stands abandoned — the SC2K lightning bolt and its siblings. Drawn in
  // the view only, blinking at 1 Hz between full and half strength so a
  // paused city still shows them.
  const FLAG_ICONS = Object.freeze({
    power: { color: "#f2d21b", rows: ["...##..", "..##...", ".##....", "#####..", "..##...", ".##....", "##....."] },
    water: { color: "#3f8fe0", rows: ["...#...", "..###..", ".#####.", ".#####.", "#######", ".#####.", "..###.."] },
    road: { color: "#d8453a", rows: ["..###..", ".#...#.", "#...###", "#..#..#", "###...#", ".#...#.", "..###.."] },
    commute: { color: "#ef8a2c", rows: ["...#...", "...##..", "######.", "...##..", "...#...", "#.#.#.#", "......."] },
    abandoned: { color: "#9a7a55", rows: ["#.....#", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#...#.", "#.....#"] },
  });
  const FLAG_BY_PROBLEM = Object.freeze({ 1: "road", 2: "power", 3: "water", 7: "commute" });
  // The shell stamps the blink phase from its clock; a bare snapshot blinks
  // with the simulation (ten ticks a half-period at normal speed).
  function flagPhase(snapshot) {
    if (snapshot.flagPhase === 0 || snapshot.flagPhase === 1) return snapshot.flagPhase;
    return Math.floor((Number(snapshot.tick) || 0) / 10) % 2;
  }
  function problemFlags(snapshot) {
    const revision = Number.isFinite(snapshot.rev) ? snapshot.rev : null;
    const owner = snapshot.problemCode || snapshot;
    if (revision !== null && state.flagCache && state.flagCache.owner === owner && state.flagCache.revision === revision) return state.flagCache.flags;
    const flags = []; const size = mapSize(snapshot); const codes = snapshot.problemCode; const covered = new Uint8Array(size * size);
    for (const building of Array.isArray(snapshot.buildings) ? snapshot.buildings : []) {
      const w = building.w || 1; const anchor = building.y * size + building.x;
      for (let dy = 0; dy < w; dy += 1) for (let dx = 0; dx < w; dx += 1) covered[anchor + dy * size + dx] = 1;
      const icon = building.state === 5 ? "abandoned" : codes ? FLAG_BY_PROBLEM[codes[anchor]] : null;
      if (icon && (icon !== "water" || w > 1 || building.state !== 3)) flags.push({ x: building.x + (w - 1) / 2, y: building.y + (w - 1) / 2, tile: anchor, icon });
    }
    if (codes && snapshot.zone) {
      // Empty zoned land: one sign per 2x2 patch, so a dark district reads as
      // dark without a sign on every tile.
      for (let index = 0; index < size * size; index += 1) {
        const x = index % size; const y = (index - x) / size;
        if (covered[index] || (x & 1) || (y & 1) || !snapshot.zone[index] || snapshot.zone[index] > 3) continue;
        const icon = FLAG_BY_PROBLEM[codes[index]];
        if (icon && icon !== "water") flags.push({ x, y, tile: index, icon });
      }
    }
    state.flagCache = { owner, revision, flags };
    return flags;
  }
  function drawProblemFlags(context, snapshot) {
    if (!context || state.display.flags === false) return;
    const size = mapSize(snapshot);
    const pixel = Math.max(1, Math.round(2 * state.camera.zoom));
    const bright = flagPhase(snapshot) === 0;
    const alpha = context.globalAlpha;
    context.globalAlpha = bright ? 1 : 0.55;
    for (const flag of problemFlags(snapshot)) {
      const point = projectPoint(snapshot, flag.x, flag.y, altitudeAt(snapshot, flag.tile));
      if (point.sx < -20 || point.sy < -40 || point.sx > state.cssWidth + 20 || point.sy > state.cssHeight + 20) continue;
      const icon = FLAG_ICONS[flag.icon];
      const left = Math.round(point.sx - 3.5 * pixel); const top = Math.round(point.sy - (22 * state.camera.zoom) - 7 * pixel);
      context.fillStyle = "#111";
      context.fillRect(left - pixel, top - pixel, 9 * pixel, 9 * pixel);
      context.fillStyle = "#fff";
      context.fillRect(left, top, 7 * pixel, 7 * pixel);
      context.fillStyle = icon.color;
      icon.rows.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx += 1) if (row[rx] === "#") context.fillRect(left + rx * pixel, top + ry * pixel, pixel, pixel); });
    }
    context.globalAlpha = alpha === undefined ? 1 : alpha;
  }

  function drawFeedback(snapshot, viewKey) {
    const blink = flagPhase(snapshot);
    const key = `${viewKey}:${state.previewRevision}:${snapshot.rev ?? "x"}:${blink}:${state.display.flags === false ? 0 : 1}`;
    if (state.lastKeys.feedback === key) return;
    state.lastKeys.feedback = key;
    clearContext("feedback");
    const context = state.contexts.feedback;
    const size = mapSize(snapshot);
    drawProblemFlags(context, snapshot);
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
    if (overlay === "transit") {
      const layer = snapshot?.transitLayer;
      return layer && layer[index] !== undefined ? Number(layer[index]) || 0 : 0;
    }
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
    if (overlay === "transit") return Math.max(0, Math.min(TRANSIT_COLORS.length - 1, Math.round(value)));
    if (["power", "water", "police", "fire", "education", "health"].includes(overlay)) return value ? 1 : 0;
    const divisor = overlay === "traffic" ? 160 : 255;
    return Math.max(0, Math.min(4, Math.floor((value / divisor) * 5)));
  }

  function overlayColor(overlay, bucket) {
    if (overlay === "transit") return TRANSIT_COLORS[bucket] || TRANSIT_COLORS[0];
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
    // Overlay values only change when the city does, so a revision number
    // stands in for hashing every visible tile on every frame.
    const overlayIdentity = state.overlay === "none" ? "none"
      : Number.isFinite(snapshot.rev) ? `r${snapshot.seed}:${snapshot.size}:${snapshot.rev}` : overlaySignature(snapshot, state.overlay, tiles);
    // At night the street lights are part of the layer, so a street built
    // in the dark lights up without waiting for the clock.
    const nightIdentity = isNight(snapshot) && Number.isFinite(snapshot.rev) ? `n${snapshot.rev}` : "";
    const key = `${viewKey}:${lightStep}:${state.overlay}:${overlayIdentity}:${nightIdentity}`;
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
    drawAvenueLamps(context, snapshot, tiles);
    drawTransitStops(context, snapshot, tiles);
    drawTransitBuses(context, snapshot);
    drawZenNight(context, snapshot, tiles);
    drawOverlayCells(context, snapshot, state.overlay, tiles);
  }

  // An avenue is lit from its median: one post for the pair on every other
  // tile of the run, its head 9 m up and its light falling on both
  // carriageways. Drawn after the darkness overlay, like the windows.
  // 站牌 and the buses that run the lines the mayor laid. A stop is a pole and
  // a plate standing on its own tile; a bus's place is a pure function of the
  // snapshot clock, so the same tick always draws it in the same spot. Both
  // read the city's own record — a city that laid nothing draws neither.
  function drawTransitStops(context, snapshot, tiles) {
    const sidecar = snapshot.transitLines;
    if (!sidecar || !Array.isArray(sidecar.lines) || !sidecar.lines.length) return;
    const zoom = state.camera.zoom;
    const visible = new Set((Array.isArray(tiles) ? tiles : []).map(([x, y]) => `${x},${y}`));
    const stops = new Map();
    for (const line of sidecar.lines) {
      for (const station of line.stations || []) {
        if (station.kind !== "bus-stop") continue;
        if (!visible.has(`${station.x},${station.y}`)) continue;
        stops.set(`${station.x},${station.y}`, station);
      }
    }
    if (!stops.size) return;
    const pole = Math.max(1, Math.round(1.5 * zoom));
    const plateWidth = Math.max(2, Math.round(5 * zoom));
    const plateHeight = Math.max(1, Math.round(2 * zoom));
    for (const station of stops.values()) {
      const { sx, sy } = projectPoint(snapshot, station.x, station.y, travelAltitude(snapshot, station.x, station.y));
      context.fillStyle = "rgba(24,24,24,0.85)";
      context.fillRect(sx - pole / 2, sy - 10 * zoom, pole, 10 * zoom);
      context.fillStyle = "rgba(246,244,236,0.95)";
      context.fillRect(sx - plateWidth / 2, sy - 12 * zoom, plateWidth, plateHeight);
    }
  }

  function drawTransitBuses(context, snapshot) {
    const sidecar = snapshot.transitLines;
    if (!sidecar || !Array.isArray(sidecar.lines) || !sidecar.lines.length) return;
    const zoom = state.camera.zoom;
    const tick = Number(snapshot.tick) || 0;
    const body = Math.max(2, Math.round(3 * zoom));
    const height = Math.max(1, Math.round(2 * zoom));
    const sharedPlaces = window.AISystem6PotWorld?.transit?.rubberPlaces;
    for (const line of sidecar.lines) {
      const mode = line.mode === "bus" ? "bus" : line.mode === "brt" ? "brt" : "metro";
      if (mode === "metro") continue;                     // the metro runs under the pot
      const places = typeof sharedPlaces === "function" ? sharedPlaces(line, tick) : null;
      const drawn = places || (() => {
        const stops = (line.tiles || []).length / 2;
        if (stops < 2) return [];
        const count = Math.max(1, Math.min(6, Number(line.vehicles) || 2));
        const local = [];
        for (let index = 0; index < count; index += 1) {
          const phase = (tick / (stops * 3) + index / count) % 1;
          const step = Math.floor(phase * stops);
          local.push({ x: line.tiles[step * 2], y: line.tiles[step * 2 + 1] });
        }
        return local;
      })();
      for (const place of drawn) {
        const { sx, sy } = projectPoint(snapshot, place.x, place.y, travelAltitude(snapshot, place.x, place.y));
        context.fillStyle = mode === "brt" ? "rgba(192,60,48,0.95)" : "rgba(70,86,150,0.95)";
        context.fillRect(sx - body / 2, sy - height - 1, body, height);
      }
    }
  }

  function drawAvenueLamps(context, snapshot, tiles) {
    if (!isNight(snapshot) || !snapshot.avenue) return;
    const size = mapSize(snapshot);
    const zoom = state.camera.zoom;
    const halfW = (MATH.TILE_W / 2) * zoom;
    const halfH = (MATH.TILE_H / 2) * zoom;
    const diamond = (sx, sy, scale) => {
      context.moveTo(sx, sy - halfH * scale);
      context.lineTo(sx + halfW * scale, sy);
      context.lineTo(sx, sy + halfH * scale);
      context.lineTo(sx - halfW * scale, sy);
      context.closePath();
    };
    const lamps = [];
    (Array.isArray(tiles) ? tiles : []).forEach(([x, y]) => {
      const dir = avenueDirAt(snapshot, x, y);
      if (!dir) return;
      const L = AVENUE_LEFT[dir];
      // Once a pair (from its smaller half), on the run's even tiles.
      if ((y + L[1]) * size + x + L[0] < y * size + x || (L[0] ? y : x) % 2) return;
      lamps.push(projectPoint(snapshot, x + L[0] / 2, y + L[1] / 2, travelAltitude(snapshot, x, y)));
    });
    if (!lamps.length) return;
    context.fillStyle = "rgba(255, 214, 140, 0.12)";
    context.beginPath();
    lamps.forEach(({ sx, sy }) => diamond(sx, sy, 0.95));
    context.fill();
    context.fillStyle = "rgba(255, 220, 156, 0.16)";
    context.beginPath();
    lamps.forEach(({ sx, sy }) => diamond(sx, sy, 0.5));
    context.fill();
    const head = Math.max(1, 2 * zoom);
    context.fillStyle = "rgba(255, 232, 176, 0.95)";
    lamps.forEach(({ sx, sy }) => context.fillRect(sx - head / 2, sy - 9 * zoom - head / 2, head, head));
  }

  // SC2000 water life: faint moving strokes over visible water tiles, driven
  // by the snapshot clock so the surface shimmers without wall-clock reads.
  function drawWaterShimmer(context, snapshot, tiles) {
    const size = mapSize(snapshot);
    const zoom = state.camera.zoom;
    const time = Number.isFinite(snapshot.timeOfDay) ? snapshot.timeOfDay : 0;
    const step = Math.round(time * 48);
    // Winter freezes the lakes: a pale ice sheet over every water tile.
    const winter = MATH.seasonOf(snapshot) === 3;
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
      // Avenues carry their own lamps (drawAvenueLamps).
      if (!isRoad(snapshot, index) || avenueDirAt(snapshot, x, y)) return;
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
    const drawWindows = (point, frameId, mirror = false) => {
      const frame = atlasFrame(frameId);
      if (!frame || !Array.isArray(frame.windows) || !frame.windows.length) return;
      // A mirrored building's windows mirror with it about the sprite axis.
      const left = (win) => mirror ? -(win.x - 80) - win.w : win.x - 80;
      context.fillStyle = "rgba(245,210,104,0.18)";
      frame.windows.forEach((win) => {
        context.fillRect(
          point.sx + left(win) * zoom - 2 * zoom,
          point.sy + (win.y - 104) * zoom - 2 * zoom,
          (win.w + 4) * zoom,
          (win.h + 4) * zoom,
        );
      });
      context.fillStyle = "#f5d268";
      frame.windows.forEach((win) => {
        context.fillRect(
          point.sx + left(win) * zoom,
          point.sy + (win.y - 104) * zoom,
          win.w * zoom,
          win.h * zoom,
        );
      });
    };
    const inView = (point) => sceneryInView(point);
    const camera = cameraFor(snapshot);
    const halfW = (MATH.TILE_W / 2) * zoom;
    const halfH = (MATH.TILE_H / 2) * zoom;
    const derived = sceneryFor(snapshot);
    derived.items.forEach((item) => {
      if (item.object.visualKind !== "building") return;
      const point = { sx: camera.originX + (item.rx - item.ry) * halfW, sy: camera.originY + (item.rx + item.ry) * halfH - item.alt * MATH.HEIGHT_STEP * zoom };
      if (!inView(point)) return;
      drawWindows(point, nightFrame(buildingFrame(item.object, false), snapshot), buildingFacing(snapshot, item.object).mirror);
    });
    derived.facilities.forEach((facility) => {
      const x = facility.x + ((facility.footprint?.w || 1) - 1) / 2;
      const y = facility.y + ((facility.footprint?.h || 1) - 1) / 2;
      const baseX = Math.max(0, Math.min(size - 1, Math.floor(facility.x)));
      const baseY = Math.max(0, Math.min(size - 1, Math.floor(facility.y)));
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, baseY * size + baseX));
      if (!inView(point)) return;
      drawWindows(point, nightFrame(facilitySprite(facility.kind, facility.footprint), snapshot));
    });
    MATH.collectCatalogObjects(snapshot, window.AISystem6BonsaiCatalog).forEach((object) => {
      const x = object.x + (object.footprint.w - 1) / 2;
      const y = object.y + (object.footprint.h - 1) / 2;
      const point = projectPoint(snapshot, x, y, altitudeAt(snapshot, object.y * size + object.x));
      if (inView(point)) drawWindows(point, nightFrame(object.spriteId || `catalog.${object.label}`, snapshot));
    });
  }

  function render(snapshot, viewState) {
    if (!state.ready || state.disposed || !snapshot) return;
    state.snapshot = snapshot;
    if (viewState && typeof viewState === "object") {
      if (Number.isFinite(viewState.zoom)) state.camera.zoom = MATH.snapZoom(viewState.zoom);
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
    if ((state.display.buildings || state.display.infrastructure) && !state.display.underground) {
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

  // Rotation turns the map about the ground at the middle of the view, the
  // way SC2K does. The pan is a screen offset, so keeping it across a turn
  // swung the city to wherever that offset pointed in the new orientation.
  function rotateBy(quarterTurns) {
    if (!Number.isFinite(quarterTurns) || quarterTurns === 0) return state.camera.rotation;
    const steps = Number.isInteger(quarterTurns) ? quarterTurns : Math.sign(quarterTurns);
    const size = state.snapshot ? mapSize(state.snapshot) : 0;
    const middle = size && state.cssWidth
      ? MATH.unproject(state.cssWidth / 2, state.cssHeight / 2, cameraFor(state.snapshot), 0, size)
      : null;
    state.camera.rotation = MATH.normalizeRotation(state.camera.rotation + steps);
    if (middle && middle.x >= 0 && middle.y >= 0 && middle.x < size && middle.y < size) {
      const rotated = MATH.rotateTile(middle.x, middle.y, size, state.camera.rotation);
      state.camera.panX = -(rotated.x - rotated.y) * (MATH.TILE_W / 2) * state.camera.zoom;
      state.camera.panY = ((size - 1) - (rotated.x + rotated.y)) * (MATH.TILE_H / 2) * state.camera.zoom;
    }
    clearChunkCache();
    invalidateView();
    if (state.snapshot) render(state.snapshot);
    loadAtlasImages();
    return state.camera.rotation;
  }

  // Zoom moves between the fixed steps and holds the ground under the anchor
  // (a CSS point inside the map; the middle when absent). Chunk caches are
  // keyed by step, so returning to a step reuses what was drawn there.
  function zoomBy(factor, anchor = null) {
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return state.camera.zoom;
    const from = state.camera.zoom;
    let to = MATH.snapZoom(MATH.clampZoom(from * factor));
    if (to === from) to = MATH.stepZoom(from, factor > 1 ? 1 : -1);
    return setZoom(to, anchor);
  }

  function setZoom(level, anchor = null) {
    const from = state.camera.zoom;
    const to = MATH.snapZoom(level);
    if (to === from) return from;
    const pan = MATH.anchoredPan(state.camera, from, to, anchor?.x, anchor?.y, state.cssWidth, state.cssHeight);
    state.camera.zoom = to;
    state.camera.panX = pan.panX;
    state.camera.panY = pan.panY;
    invalidateView();
    if (state.snapshot) render(state.snapshot);
    return state.camera.zoom;
  }

  function panByScreen(dx, dy, options = {}) {
    if (Number.isFinite(dx)) state.camera.panX += dx;
    if (Number.isFinite(dy)) state.camera.panY += dy;
    invalidateView();
    if (!options.defer && state.snapshot) render(state.snapshot);
    return { x: state.camera.panX, y: state.camera.panY };
  }

  function resetView(options = {}) {
    state.camera.zoom = MATH.snapZoom(Number.isFinite(options.zoom) ? options.zoom : MATH.DEFAULT_ZOOM);
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
    state.derived = null;
    state.chunkSignatures.clear();
    state.chunkSignatureMemo = null;
  }

  function miniMapTerrainColor(snapshot, index) {
    const winter = MATH.seasonOf(snapshot) === 3;
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

  // The minimap's SC2000 feature pixels: networks read as dark lines, buildings
  // and facilities as light pixels, claimed zones as faint tints. Painter order
  // is authoritative — the first match wins, exactly as the original inline
  // if/else-if chain did.
  const MINI_MAP_FEATURE_COLORS = Object.freeze({
    network: "rgba(24,26,24,0.92)",
    building: "rgba(232,228,214,0.95)",
    zone: "rgba(255,255,255,0.28)",
  });

  function miniMapFeatureKind(snapshot, index) {
    if (isRoad(snapshot, index) || isRail(snapshot, index) || isWire(snapshot, index)
      || gridValue(snapshot, ["highway"], index, false) || isPipe(snapshot, index)) return "network";
    if (Number(gridValue(snapshot, ["stage", "buildingStage"], index, 0)) > 0
      || gridValue(snapshot, ["buildingState"], index, 0) > 0
      || (snapshot.facilityAt && snapshot.facilityAt[index] >= 0)) return "building";
    if (Number(gridValue(snapshot, ["zone", "zoneType"], index, 0)) > 0) return "zone";
    return null;
  }

  // Two rasterizers paint the same picture. The bitmap path writes one CSS
  // resolution ImageData and uploads it once; the direct path keeps the
  // original per-tile fillRect calls for contexts that cannot round-trip
  // ImageData (test doubles, older shims).
  //
  // Minimap colors arrive as generated strings — `rgb(r,g,b)` from the
  // elevation lift, plus a small fixed set of rgba overlays and tints — so the
  // parsed channels are memoised. The distinct-string set is bounded by the
  // palette, so the cache cannot grow with map size or frame count.
  const MINI_MAP_COLOR_CACHE = new Map();

  function parseMiniMapColor(value) {
    const key = String(value);
    const cached = MINI_MAP_COLOR_CACHE.get(key);
    if (cached) return cached;
    let parsed = [0, 0, 0, 1];
    const text = key.trim();
    if (text.startsWith("#")) {
      const hex = text.slice(1);
      if (hex.length === 3 || hex.length === 6) {
        const step = hex.length === 3 ? 1 : 2;
        const channels = [];
        for (let i = 0; i < 3; i += 1) {
          const chunk = hex.slice(i * step, (i + 1) * step);
          channels.push(parseInt(step === 1 ? chunk + chunk : chunk, 16));
        }
        if (channels.every(Number.isFinite)) parsed = [channels[0], channels[1], channels[2], 1];
      }
    } else {
      const match = text.match(/^rgba?\(([^)]+)\)$/i);
      if (match) {
        const channels = match[1].split(",").map((part) => Number(part.trim()));
        const alpha = Number.isFinite(channels[3]) ? channels[3] : 1;
        if (channels.length >= 3 && channels.slice(0, 3).every(Number.isFinite)) {
          parsed = [channels[0], channels[1], channels[2], Math.max(0, Math.min(1, alpha))];
        }
      }
    }
    const frozen = Object.freeze(parsed);
    MINI_MAP_COLOR_CACHE.set(key, frozen);
    return frozen;
  }

  // Canvas fillRect covers [x, x+width) x [y, y+height), clipped to the
  // surface, with `Math.max(1, ...)` keeping a sliver for sub-pixel spans. The
  // raster rect keeps that geometry and composites with source-over.
  function miniMapRasterRect(data, cssWidth, cssHeight, left, top, right, bottom, color) {
    const alpha = color[3];
    const x0 = Math.max(0, left);
    const y0 = Math.max(0, top);
    const x1 = Math.min(cssWidth, left + Math.max(1, right - left));
    const y1 = Math.min(cssHeight, top + Math.max(1, bottom - top));
    if (x0 >= x1 || y0 >= y1) return;
    const opaque = alpha >= 1;
    const inv = 1 - alpha;
    for (let y = y0; y < y1; y += 1) {
      let offset = (y * cssWidth + x0) * 4;
      for (let x = x0; x < x1; x += 1) {
        if (opaque) {
          data[offset] = color[0];
          data[offset + 1] = color[1];
          data[offset + 2] = color[2];
        } else {
          data[offset] = Math.round(color[0] * alpha + data[offset] * inv);
          data[offset + 1] = Math.round(color[1] * alpha + data[offset + 1] * inv);
          data[offset + 2] = Math.round(color[2] * alpha + data[offset + 2] * inv);
        }
        data[offset + 3] = 255;
        offset += 4;
      }
    }
  }

  // One CSS-resolution scratch canvas per target, reused across frames and
  // resized only when the minimap's CSS size changes.
  const MINI_MAP_SCRATCH = new WeakMap();

  function createMiniMapScratch(factory) {
    const candidates = [];
    // A host may hand the minimap its own scratch surface (a worker-friendly
    // offscreen canvas, or a test double's real bitmap canvas); otherwise the
    // document's own canvas is used.
    if (typeof factory === "function") {
      try { candidates.push(factory()); } catch (_) { /* host factory failed */ }
    }
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      try { candidates.push(document.createElement("canvas")); } catch (_) { /* no document canvas */ }
    }
    if (typeof OffscreenCanvas === "function") {
      try { candidates.push(new OffscreenCanvas(1, 1)); } catch (_) { /* no offscreen canvas */ }
    }
    for (const candidate of candidates) {
      if (!candidate || typeof candidate.getContext !== "function") continue;
      const context = candidate.getContext("2d");
      if (context && typeof context.createImageData === "function" && typeof context.putImageData === "function") {
        return { canvas: candidate, context };
      }
    }
    return null;
  }

  function miniMapScratchFor(canvas, cssWidth, cssHeight, factory) {
    let scratch = MINI_MAP_SCRATCH.get(canvas);
    if (!scratch) {
      scratch = createMiniMapScratch(factory);
      if (!scratch) return null;
      MINI_MAP_SCRATCH.set(canvas, scratch);
    }
    if (scratch.canvas.width !== cssWidth) scratch.canvas.width = cssWidth;
    if (scratch.canvas.height !== cssHeight) scratch.canvas.height = cssHeight;
    if (!scratch.image || scratch.image.width !== cssWidth || scratch.image.height !== cssHeight) {
      scratch.image = scratch.context.createImageData(cssWidth, cssHeight);
      scratch.contentKey = null;
    }
    return scratch;
  }

  function rasterizeMiniMap(image, snapshot, size, overlay, cssWidth, cssHeight) {
    const data = image.data;
    // Engine snapshots use complete typed grids. Read these directly; sparse
    // host snapshots still use the alias-aware compatibility helpers below.
    const { terrain, alt, water, road, rail, wire, pipe, over, highway, stage, buildingState, facilityAt, zone } = snapshot;
    const direct = !snapshot.terrainType && [terrain, alt, water, road, rail, wire, pipe, over, highway, stage, buildingState, facilityAt, zone]
      .every((grid) => ArrayBuffer.isView(grid) && grid.length === size * size);
    const winter = MATH.seasonOf(snapshot) === 3;
    const waterColor = parseMiniMapColor(winter ? "#dce8ee" : "#356e9a");
    const landColor = [0, 0, 0, 1];
    const networkColor = parseMiniMapColor(MINI_MAP_FEATURE_COLORS.network);
    const buildingColor = parseMiniMapColor(MINI_MAP_FEATURE_COLORS.building);
    const zoneColor = parseMiniMapColor(MINI_MAP_FEATURE_COLORS.zone);
    const background = parseMiniMapColor("#18251c");
    for (let offset = 0; offset < data.length; offset += 4) {
      data[offset] = background[0];
      data[offset + 1] = background[1];
      data[offset + 2] = background[2];
      data[offset + 3] = 255;
    }
    for (let y = 0; y < size; y += 1) {
      const top = Math.floor((y * cssHeight) / size);
      const bottom = Math.ceil(((y + 1) * cssHeight) / size);
      for (let x = 0; x < size; x += 1) {
        const index = y * size + x;
        const left = Math.floor((x * cssWidth) / size);
        const right = Math.ceil(((x + 1) * cssWidth) / size);
        const wet = direct ? !!water[index] : isWater(snapshot, index);
        let terrainColor;
        let featureColor;
        if (direct) {
          const type = terrain[index];
          const altitude = Number(alt[index]);
          const lift = Math.max(-24, Math.min(40, ((Number.isFinite(altitude) ? altitude : 0) - 4) * 6));
          landColor[0] = Math.max(32, Math.min(224, (type === 3 ? 133 : type === 2 ? 149 : 99) + lift));
          landColor[1] = Math.max(32, Math.min(224, (type === 3 ? 135 : type === 2 ? 109 : 147) + lift));
          landColor[2] = Math.max(32, Math.min(224, (type === 3 ? 130 : type === 2 ? 73 : 84) + lift));
          terrainColor = wet ? waterColor : landColor;
          const network = road[index] || rail[index] || wire[index] || pipe[index] || highway[index]
            || over[index] === OVER.ROAD || over[index] === OVER.WIRE || over[index] === OVER.ROADWIRE;
          featureColor = network ? networkColor : stage[index] > 0 || buildingState[index] > 0 || facilityAt[index] >= 0
            ? buildingColor : zone[index] > 0 ? zoneColor : null;
        } else {
          terrainColor = parseMiniMapColor(miniMapTerrainColor(snapshot, index));
          const feature = miniMapFeatureKind(snapshot, index);
          featureColor = feature ? parseMiniMapColor(MINI_MAP_FEATURE_COLORS[feature]) : null;
        }
        miniMapRasterRect(data, cssWidth, cssHeight, left, top, right, bottom, terrainColor);
        if (featureColor) {
          const featureX = Math.floor((left + right) / 2);
          const featureY = Math.floor((top + bottom) / 2);
          miniMapRasterRect(data, cssWidth, cssHeight, featureX, featureY, featureX + 1, featureY + 1, featureColor);
        }
        if (overlay !== "none" && !wet) {
          const color = overlayColor(overlay, overlayBucket(overlay, overlayValue(snapshot, overlay, index)));
          miniMapRasterRect(data, cssWidth, cssHeight, left, top, right, bottom, parseMiniMapColor(color));
        }
      }
    }
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
    const size = mapSize(snapshot);
    const overlay = normalizeOverlay(options.overlay);
    // Real 2D contexts round-trip ImageData; context doubles and older shims do
    // not, and they keep the direct per-tile fillRect path.
    const canRasterize = typeof context.createImageData === "function" && typeof context.putImageData === "function" && typeof context.drawImage === "function";
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, backingWidth, backingHeight);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = false;

    // Batch tile painting into one upload; the DPR transform keeps pixels crisp.
    const scratch = canRasterize ? miniMapScratchFor(canvas, cssWidth, cssHeight, options.createScratchCanvas) : null;
    if (scratch) {
      // The default map follows the same content-revision contract as scenery.
      // Dynamic overlays can change between revisions and always repaint.
      const owner = snapshot.alt || snapshot.terrain || snapshot;
      const contentKey = overlay === "none" && Number.isFinite(snapshot.rev)
        ? `${snapshot.rev}:${size}:${MATH.seasonOf(snapshot)}` : null;
      if (contentKey === null || scratch.owner !== owner || scratch.contentKey !== contentKey) {
        rasterizeMiniMap(scratch.image, snapshot, size, overlay, cssWidth, cssHeight);
        scratch.context.putImageData(scratch.image, 0, 0);
        scratch.owner = owner;
        scratch.contentKey = contentKey;
      }
      context.drawImage(scratch.canvas, 0, 0, cssWidth, cssHeight, 0, 0, cssWidth, cssHeight);
    } else {
      context.fillStyle = "#18251c";
      context.fillRect(0, 0, cssWidth, cssHeight);
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
          const feature = miniMapFeatureKind(snapshot, index);
          if (feature) {
            const featureX = Math.floor((left + right) / 2);
            const featureY = Math.floor((top + bottom) / 2);
            context.fillStyle = MINI_MAP_FEATURE_COLORS[feature];
            context.fillRect(featureX, featureY, 1, 1);
          }
          if (overlay !== "none" && !isWater(snapshot, index)) {
            context.fillStyle = overlayColor(overlay, overlayBucket(overlay, overlayValue(snapshot, overlay, index)));
            context.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
          }
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
    return Object.freeze({ cssWidth, cssHeight, backingWidth, backingHeight, dpr, tileCount: size * size, overlay, rasterized: Boolean(scratch) });
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
      derivedBuilds: state.derivedBuilds,
      buildingsDraws: state.buildingsDraws,
      sceneryRasterBuilds: state.sceneryRasterBuilds || 0,
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
    avenueTile,
    rotateBy,
    zoomBy,
    setZoom,
    panByScreen,
    resetView,
    dispose,
    debugStats,
  });
})();
