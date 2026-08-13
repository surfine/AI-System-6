// Feature module: Micropolis / Micropolis 城市模拟 — the desk toy with a city
// inside.
//
// Lazy-loaded together with the GPL engine bundle
// (app/vendor/micropolis/micropolis-engine.js, window.MicropolisEngine).
// This file owns every user-facing surface: window interior, tool palette,
// HUD, ticker, input, and language. The engine owns the simulation. All
// strings here are original AI System 6 copy; none come from upstream
// text.js (license boundary, see app/vendor/micropolis/NOTICE.md).
window.AISystem6MicropolisLoaded = true;

(function initMicropolisFeature() {
  "use strict";

  function installMicropolisWindow() {
    if (typeof document === "undefined") return;
    if (document.querySelector('[data-window="micropolis"]')) return;
    document.querySelector(".desktop")?.insertAdjacentHTML("beforeend", `
      <section class="window micropolis-window is-hidden" data-window="micropolis" aria-labelledby="micropolis-title">
        <div class="title-bar">
          <button class="close-box" aria-label="${t("close")}" data-i18n-aria-label="close"></button>
          <h2 id="micropolis-title">Micropolis</h2>
          <button class="resize-box" aria-label="${t("zoom")}" data-i18n-aria-label="zoom"></button>
          <button class="shade-box" aria-label="${t("collapse")}" data-i18n-aria-label="collapse"></button>
        </div>
        <div class="details-bar micropolis-details-bar">
          <span data-micropolis-funds></span><span data-micropolis-date></span><span data-micropolis-population></span>
          <span class="micropolis-status" data-micropolis-status role="status" aria-live="polite"></span>
        </div>
        <div class="window-pane micropolis-pane"></div>
      </section>`);
  }

  installMicropolisWindow();

  const MICROPOLIS_VENDOR_BASE = "app/vendor/micropolis/";
  const MICROPOLIS_MAP_WIDTH = 120;
  const MICROPOLIS_MAP_HEIGHT = 100;
  // A finger tap waits this long for a second finger before it builds.
  const MICROPOLIS_TOUCH_TOOL_DELAY_MS = 140;
  const MICROPOLIS_TOUCH_TOOL_SLOP_PX = 8;

  // Palette order follows the original tool box: clear, connect, zone, safety,
  // leisure, transport hubs, power. Costs mirror the engine's tool costs.
  const MICROPOLIS_TOOLS = Object.freeze([
    { id: "bulldozer", cost: 1 },
    { id: "road", cost: 10 },
    { id: "rail", cost: 20 },
    { id: "wire", cost: 5 },
    { id: "park", cost: 10 },
    { id: "residential", cost: 100 },
    { id: "commercial", cost: 100 },
    { id: "industrial", cost: 100 },
    { id: "police", cost: 500 },
    { id: "fire", cost: 500 },
    { id: "stadium", cost: 5000 },
    { id: "port", cost: 3000 },
    { id: "airport", cost: 10000 },
    { id: "coal", cost: 3000 },
    { id: "nuclear", cost: 5000 },
  ]);

  // Engine message constants (by export name) -> our translation keys.
  // Resolved into a subject->key map once the engine is present.
  const MICROPOLIS_MESSAGE_KEYS = Object.freeze({
    WELCOME: "micropolis_msg_welcome",
    BLACKOUTS_REPORTED: "micropolis_msg_blackouts",
    EARTHQUAKE: "micropolis_msg_earthquake",
    EXPLOSION_REPORTED: "micropolis_msg_explosion",
    FIRE_REPORTED: "micropolis_msg_fire",
    FIRE_STATION_NEEDS_FUNDING: "micropolis_msg_fire_funding",
    FLOODING_REPORTED: "micropolis_msg_flooding",
    HEAVY_TRAFFIC: "micropolis_msg_heavy_traffic",
    HELICOPTER_CRASHED: "micropolis_msg_helicopter_crashed",
    HIGH_CRIME: "micropolis_msg_high_crime",
    HIGH_POLLUTION: "micropolis_msg_high_pollution",
    MONSTER_SIGHTED: "micropolis_msg_monster",
    NEED_AIRPORT: "micropolis_msg_need_airport",
    NEED_ELECTRICITY: "micropolis_msg_need_electricity",
    NEED_FIRE_STATION: "micropolis_msg_need_fire_station",
    NEED_MORE_COMMERCIAL: "micropolis_msg_need_commercial",
    NEED_MORE_INDUSTRIAL: "micropolis_msg_need_industrial",
    NEED_MORE_RAILS: "micropolis_msg_need_rails",
    NEED_MORE_RESIDENTIAL: "micropolis_msg_need_residential",
    NEED_MORE_ROADS: "micropolis_msg_need_roads",
    NEED_POLICE_STATION: "micropolis_msg_need_police_station",
    NEED_SEAPORT: "micropolis_msg_need_seaport",
    NEED_STADIUM: "micropolis_msg_need_stadium",
    NO_MONEY: "micropolis_msg_no_money",
    NOT_ENOUGH_POWER: "micropolis_msg_not_enough_power",
    NUCLEAR_MELTDOWN: "micropolis_msg_meltdown",
    PLANE_CRASHED: "micropolis_msg_plane_crashed",
    POLICE_NEEDS_FUNDING: "micropolis_msg_police_funding",
    REACHED_CAPITAL: "micropolis_msg_reached_capital",
    REACHED_CITY: "micropolis_msg_reached_city",
    REACHED_MEGALOPOLIS: "micropolis_msg_reached_megalopolis",
    REACHED_METROPOLIS: "micropolis_msg_reached_metropolis",
    REACHED_TOWN: "micropolis_msg_reached_town",
    ROAD_NEEDS_FUNDING: "micropolis_msg_road_funding",
    SHIP_CRASHED: "micropolis_msg_ship_crashed",
    TAX_TOO_HIGH: "micropolis_msg_tax_too_high",
    TORNADO_SIGHTED: "micropolis_msg_tornado",
    TRAFFIC_JAMS: "micropolis_msg_traffic_jams",
    TRAIN_CRASHED: "micropolis_msg_train_crashed",
  });

  const MICROPOLIS_CLASS_KEYS = Object.freeze({
    VILLAGE: "micropolis_class_village",
    TOWN: "micropolis_class_town",
    CITY: "micropolis_class_city",
    CAPITAL: "micropolis_class_capital",
    METROPOLIS: "micropolis_class_metropolis",
    MEGALOPOLIS: "micropolis_class_megalopolis",
  });

  const micropolisState = {
    sim: null,
    map: null,
    tools: null,
    canvas: null,
    tileSet: null,
    snowTileSet: null,
    snowing: false,
    spriteSheet: null,
    cityId: null,
    cityName: "",
    panel: "",
    mandatoryBudget: false,
    toolId: "road",
    speed: 0, // engine speed constant while running; set on first city
    rafId: 0,
    built: false,
    bound: false,
    starting: false,
    dirty: false,
    assetsPromise: null,
    messageSubjectToKey: null,
    lastMessageKey: "",
    lastStatusKey: "",
    population: 0,
    classKey: "micropolis_class_village",
    date: { month: 0, year: 1900 },
    // Pointer bookkeeping: id -> {x, y, tileX, tileY}
    pointers: new Map(),
    panning: false,
    panLastX: 0,
    panLastY: 0,
    panRemainderX: 0,
    panRemainderY: 0,
    pendingTouchTool: null,
  };

  function micropolisEngine() {
    return window.MicropolisEngine || null;
  }

  function micropolisWindow() {
    return typeof getWindow === "function" ? getWindow("micropolis") : null;
  }

  function micropolisPane() {
    return micropolisWindow()?.querySelector(".micropolis-pane") || null;
  }

  function micropolisWindowVisible() {
    const win = micropolisWindow();
    return !!win && !win.classList.contains("is-hidden") && !document.hidden;
  }

  // --- interior markup -------------------------------------------------------

  function buildMicropolisPane() {
    const pane = micropolisPane();
    if (!pane || micropolisState.built) return;
    pane.insertAdjacentHTML(
      "beforeend",
      `<div class="micropolis-layout" data-micropolis-root>
        <div class="micropolis-toolbar" role="toolbar" data-micropolis-toolbar></div>
        <div class="micropolis-map-area">
          <div class="micropolis-viewport" data-micropolis-viewport></div>
          <div class="micropolis-panel is-hidden" data-micropolis-panel></div>
          <p class="micropolis-ticker" data-micropolis-ticker aria-live="polite"></p>
        </div>
      </div>`,
    );
    micropolisState.built = true;
    renderMicropolisToolbar();
    renderMicropolisHud();
    bindMicropolisEvents();
  }

  function renderMicropolisToolbar() {
    const toolbar = micropolisWindow()?.querySelector("[data-micropolis-toolbar]");
    if (!toolbar) return;
    toolbar.innerHTML = MICROPOLIS_TOOLS.map((tool) => {
      const selected = tool.id === micropolisState.toolId;
      return `<button type="button" class="micropolis-tool${selected ? " is-selected" : ""}"
        data-micropolis-tool="${tool.id}" aria-pressed="${selected}">
        <span class="micropolis-tool-name">${t(`micropolis_tool_${tool.id}`)}</span>
        <span class="micropolis-tool-cost">$${tool.cost}</span>
      </button>`;
    }).join("");
  }

  function renderMicropolisHud() {
    const win = micropolisWindow();
    if (!win) return;
    const funds = win.querySelector("[data-micropolis-funds]");
    const date = win.querySelector("[data-micropolis-date]");
    const population = win.querySelector("[data-micropolis-population]");
    if (funds) funds.textContent = t("micropolis_funds", micropolisState.sim ? micropolisState.sim.budget.totalFunds : 0);
    if (date) date.textContent = t("micropolis_date", t(`micropolis_month_${micropolisState.date.month + 1}`), micropolisState.date.year);
    if (population) {
      population.textContent = `${t("micropolis_population", micropolisState.population)} · ${t(micropolisState.classKey)}`;
    }
    renderMicropolisStatus();
    renderMicropolisTicker();
  }

  function setMicropolisStatus(key) {
    micropolisState.lastStatusKey = key || "";
    renderMicropolisStatus();
  }

  function renderMicropolisStatus() {
    const status = micropolisWindow()?.querySelector("[data-micropolis-status]");
    if (status) status.textContent = micropolisState.lastStatusKey ? t(micropolisState.lastStatusKey) : "";
  }

  function setMicropolisTicker(key) {
    micropolisState.lastMessageKey = key || "";
    renderMicropolisTicker();
  }

  function renderMicropolisTicker() {
    const ticker = micropolisWindow()?.querySelector("[data-micropolis-ticker]");
    if (ticker) ticker.textContent = micropolisState.lastMessageKey ? t(micropolisState.lastMessageKey) : "";
  }

  // --- assets ----------------------------------------------------------------

  function loadMicropolisImage(name) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Micropolis asset failed: ${name}`));
      image.src = typeof lazyScriptUrl === "function"
        ? lazyScriptUrl(MICROPOLIS_VENDOR_BASE + name)
        : MICROPOLIS_VENDOR_BASE + name;
    });
  }

  function ensureMicropolisAssets() {
    if (micropolisState.assetsPromise) return micropolisState.assetsPromise;
    const engine = micropolisEngine();
    micropolisState.assetsPromise = Promise.all([
      loadMicropolisImage("tiles.png"),
      loadMicropolisImage("sprites.png"),
    ]).then(([tilesImage, spritesImage]) => new Promise((resolve, reject) => {
      const tileSet = new engine.TileSet(
        tilesImage,
        () => {
          micropolisState.tileSet = tileSet;
          micropolisState.spriteSheet = spritesImage;
          resolve(tileSet);
        },
        () => reject(new Error("Micropolis tile set rejected the tile image")),
      );
    })).catch((error) => {
      micropolisState.assetsPromise = null;
      throw error;
    });
    return micropolisState.assetsPromise;
  }

  // --- city lifecycle --------------------------------------------------------

  function startMicropolisCity() {
    const engine = micropolisEngine();
    const viewport = micropolisWindow()?.querySelector("[data-micropolis-viewport]");
    if (!engine || !viewport) return;
    if (micropolisState.starting) return;
    micropolisState.starting = true;
    setMicropolisStatus("micropolis_status_generating");
    ensureMicropolisAssets().then(() => {
      whenMicropolisViewportReady(viewport, () => createMicropolisCity(viewport));
    }).catch(() => {
      micropolisState.starting = false;
      setMicropolisStatus("micropolis_status_assets_failed");
    });
  }

  // GameCanvas needs a visible, sized parent; run the callback once the
  // viewport has real geometry. A hidden window drops the request (the
  // visibility handler restarts city creation on reveal).
  function whenMicropolisViewportReady(viewport, run) {
    const attempt = () => {
      if (!micropolisWindowVisible() || viewport.clientWidth < 64 || viewport.clientHeight < 64) {
        if (micropolisWindowVisible()) requestAnimationFrame(attempt);
        else micropolisState.starting = false;
        return;
      }
      run();
    };
    attempt();
  }

  function createMicropolisCity(viewport) {
    const engine = micropolisEngine();
    const map = engine.MapGenerator(MICROPOLIS_MAP_WIDTH, MICROPOLIS_MAP_HEIGHT);
    const sim = new engine.Simulation(map, engine.Simulation.LEVEL_EASY, engine.Simulation.SPEED_MED);
    finishMicropolisCitySetup(viewport, map, sim, engine.Simulation.SPEED_MED);
    micropolisState.cityId = null;
    micropolisState.cityName = "";
    micropolisState.createdAt = "";
    setMicropolisTicker("micropolis_msg_welcome");
  }

  function finishMicropolisCitySetup(viewport, map, sim, speed) {
    const engine = micropolisEngine();
    micropolisState.map = map;
    micropolisState.sim = sim;
    micropolisState.tools = engine.createTools(map);
    micropolisState.speed = typeof speed === "number" && speed !== engine.Simulation.SPEED_PAUSED
      ? speed
      : engine.Simulation.SPEED_MED;
    sim.setSpeed(micropolisState.speed);
    micropolisState.population = sim.evaluation?.cityPop || 0;
    micropolisState.classKey = MICROPOLIS_CLASS_KEYS[sim.evaluation?.cityClass] || "micropolis_class_village";
    micropolisState.date = { month: 0, year: 1900 };
    micropolisState.mandatoryBudget = false;
    micropolisState.snowing = false;
    micropolisState.dirty = false;

    if (!micropolisState.canvas) {
      micropolisState.canvas = new engine.GameCanvas("micropolis-canvas", viewport);
      observeMicropolisViewport(viewport);
    }
    micropolisState.canvas.init(map, micropolisState.tileSet, micropolisState.spriteSheet);

    subscribeMicropolisSim(sim);
    setMicropolisStatus("micropolis_status_ready");
    renderMicropolisHud();
    micropolisState.starting = false;
    startMicropolisLoop();
  }

  function subscribeMicropolisSim(sim) {
    const engine = micropolisEngine();
    const Messages = engine.Messages;
    if (!micropolisState.messageSubjectToKey) {
      const map = {};
      for (const [name, key] of Object.entries(MICROPOLIS_MESSAGE_KEYS)) {
        if (typeof Messages[name] === "string") map[Messages[name]] = key;
      }
      micropolisState.messageSubjectToKey = map;
    }
    sim.addEventListener(Messages.FRONT_END_MESSAGE, (message) => {
      const key = micropolisState.messageSubjectToKey[message?.subject];
      if (key) setMicropolisTicker(key);
    });
    sim.addEventListener(Messages.FUNDS_CHANGED, () => renderMicropolisHud());
    sim.addEventListener(Messages.DATE_UPDATED, (date) => {
      if (date && typeof date.month === "number") micropolisState.date = date;
      syncMicropolisSeason();
      renderMicropolisHud();
    });
    sim.addEventListener(Messages.POPULATION_UPDATED, (population) => {
      micropolisState.population = Number(population) || 0;
      renderMicropolisHud();
    });
    sim.addEventListener(Messages.CLASSIFICATION_UPDATED, (cityClass) => {
      micropolisState.classKey = MICROPOLIS_CLASS_KEYS[cityClass] || "micropolis_class_village";
      renderMicropolisHud();
    });
    // A mandatory budget pauses the simulation (awaitingValues) until the
    // budget panel approves or dismisses it.
    sim.addEventListener(Messages.BUDGET_NEEDED, () => {
      micropolisState.mandatoryBudget = true;
      openMicropolisPanel("budget");
    });
  }

  // Upstream seasons: snow may arrive in November and melts in February.
  function syncMicropolisSeason() {
    const canvas = micropolisState.canvas;
    if (!canvas || !canvas.ready) return;
    const month = micropolisState.date.month;
    if (!micropolisState.snowing && month === 10 && Math.random() < 0.1) {
      ensureMicropolisSnowTileSet().then((snowTileSet) => {
        if (snowTileSet && micropolisState.date.month === 10) {
          micropolisState.snowing = true;
          canvas.changeTileSet(snowTileSet);
        }
      });
    } else if (micropolisState.snowing && month === 1) {
      micropolisState.snowing = false;
      canvas.changeTileSet(micropolisState.tileSet);
    }
  }

  function ensureMicropolisSnowTileSet() {
    if (micropolisState.snowTileSet) return Promise.resolve(micropolisState.snowTileSet);
    const engine = micropolisEngine();
    return loadMicropolisImage("tilessnow.png").then((image) => new Promise((resolve) => {
      const snowTileSet = new engine.TileSet(
        image,
        () => {
          micropolisState.snowTileSet = snowTileSet;
          resolve(snowTileSet);
        },
        () => resolve(null),
      );
    })).catch(() => null);
  }

  // --- game loop -------------------------------------------------------------

  function startMicropolisLoop() {
    if (micropolisState.rafId || !micropolisState.sim) return;
    micropolisState.rafId = requestAnimationFrame(micropolisFrame);
  }

  function stopMicropolisLoop() {
    if (micropolisState.rafId) cancelAnimationFrame(micropolisState.rafId);
    micropolisState.rafId = 0;
  }

  function micropolisFrame() {
    micropolisState.rafId = 0;
    const { sim, canvas } = micropolisState;
    if (!sim || !canvas || !canvas.ready) return;
    if (!micropolisWindowVisible()) return;
    sim.simTick();
    const paused = sim.isPaused();
    if (!paused) sim.spriteManager.moveObjects(sim._constructSimData());
    const origin = canvas.getTileOrigin();
    const sprites = sim.spriteManager.getSpritesInView(origin.x, origin.y, canvas.canvasWidth, canvas.canvasHeight);
    canvas.paint(null, sprites.length ? sprites : null, paused);
    micropolisState.rafId = requestAnimationFrame(micropolisFrame);
  }

  function observeMicropolisViewport(viewport) {
    // The engine only re-measures on window.resize; our windows resize without
    // firing it. Nudge the canvas whenever the viewport box changes.
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => {
      if (micropolisState.canvas && micropolisState.canvas.ready) {
        micropolisState.canvas._pendingDimensionChange = true;
      }
    });
    observer.observe(viewport);
  }

  // --- input -----------------------------------------------------------------

  function bindMicropolisEvents() {
    if (micropolisState.bound) return;
    const win = micropolisWindow();
    const viewport = win?.querySelector("[data-micropolis-viewport]");
    const toolbar = win?.querySelector("[data-micropolis-toolbar]");
    if (!win || !viewport || !toolbar) return;
    micropolisState.bound = true;

    toolbar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-micropolis-tool]");
      if (!button) return;
      micropolisState.toolId = button.dataset.micropolisTool;
      setMicropolisStatus("micropolis_status_ready");
      renderMicropolisToolbar();
    });

    win.querySelector("[data-micropolis-panel]")?.addEventListener("click", handleMicropolisPanelClick);
    viewport.addEventListener("pointerdown", handleMicropolisPointerDown);
    viewport.addEventListener("pointermove", handleMicropolisPointerMove);
    viewport.addEventListener("pointerup", handleMicropolisPointerUp);
    viewport.addEventListener("pointercancel", handleMicropolisPointerUp);
    viewport.addEventListener("wheel", handleMicropolisWheel, { passive: false });

    // Pause the loop while the window is closed; restart on reveal. A city
    // whose creation died while the window was hidden restarts here too.
    const onVisibilityFlip = () => {
      if (!micropolisWindowVisible()) {
        stopMicropolisLoop();
        return;
      }
      if (micropolisState.sim) startMicropolisLoop();
      else if (!micropolisState.starting) startMicropolisCity();
    };
    const observer = new MutationObserver(onVisibilityFlip);
    observer.observe(win, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", onVisibilityFlip);
  }

  function micropolisTileFromEvent(event) {
    const canvas = micropolisState.canvas;
    if (!canvas || !canvas.ready) return null;
    const rect = canvas._canvas.getBoundingClientRect();
    return canvas.canvasCoordinateToTileCoordinate(event.clientX - rect.left, event.clientY - rect.top);
  }

  function handleMicropolisPointerDown(event) {
    const viewport = event.currentTarget;
    if (!micropolisState.sim) return;
    try {
      viewport.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that vanished between down and capture must not kill the
      // handler; the tool still applies.
    }
    micropolisState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (micropolisState.pointers.size === 2) {
      // Second finger: this is a pan, not a build.
      cancelMicropolisPendingTouchTool();
      beginMicropolisPan();
      return;
    }

    // Middle mouse pans; anything else is the current tool.
    if (event.pointerType === "mouse" && event.button === 1) {
      micropolisState.panning = true;
      micropolisState.panLastX = event.clientX;
      micropolisState.panLastY = event.clientY;
      event.preventDefault();
      return;
    }

    if (event.pointerType === "touch") {
      // Give a second finger a beat to arrive before building.
      const tile = micropolisTileFromEvent(event);
      micropolisState.pendingTouchTool = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        timer: window.setTimeout(() => {
          micropolisState.pendingTouchTool = null;
          if (tile) applyMicropolisToolAt(tile.x, tile.y);
        }, MICROPOLIS_TOUCH_TOOL_DELAY_MS),
      };
      return;
    }

    const tile = micropolisTileFromEvent(event);
    if (tile) {
      micropolisState.pointers.get(event.pointerId).tileX = tile.x;
      micropolisState.pointers.get(event.pointerId).tileY = tile.y;
      applyMicropolisToolAt(tile.x, tile.y);
    }
  }

  function handleMicropolisPointerMove(event) {
    const entry = micropolisState.pointers.get(event.pointerId);
    if (entry) {
      entry.x = event.clientX;
      entry.y = event.clientY;
    }

    if (micropolisState.pendingTouchTool && event.pointerId === micropolisState.pendingTouchTool.pointerId) {
      const moved = Math.hypot(
        event.clientX - micropolisState.pendingTouchTool.startX,
        event.clientY - micropolisState.pendingTouchTool.startY,
      );
      if (moved > MICROPOLIS_TOUCH_TOOL_SLOP_PX) {
        // A moving finger draws with the tool right away (roads, rails, ...).
        cancelMicropolisPendingTouchTool();
        const tile = micropolisTileFromEvent(event);
        if (tile) applyMicropolisToolAt(tile.x, tile.y);
      }
    }

    if (micropolisState.panning) {
      panMicropolisBy(event.clientX, event.clientY);
      return;
    }

    if (!micropolisState.pointers.has(event.pointerId) || micropolisState.pendingTouchTool) return;
    if (micropolisState.pointers.size !== 1) return;
    if (event.pointerType === "mouse" && event.buttons !== 1) return;
    const tile = micropolisTileFromEvent(event);
    if (!tile) return;
    const last = micropolisState.pointers.get(event.pointerId);
    if (last.tileX === tile.x && last.tileY === tile.y) return;
    last.tileX = tile.x;
    last.tileY = tile.y;
    applyMicropolisToolAt(tile.x, tile.y, { draggedOnly: true });
  }

  function handleMicropolisPointerUp(event) {
    micropolisState.pointers.delete(event.pointerId);
    if (micropolisState.pendingTouchTool && event.pointerId === micropolisState.pendingTouchTool.pointerId) {
      // The finger lifted before the delay: it was a tap. Build once.
      cancelMicropolisPendingTouchTool();
      if (event.type === "pointerup") {
        const tile = micropolisTileFromEvent(event);
        if (tile) applyMicropolisToolAt(tile.x, tile.y);
      }
    }
    if (micropolisState.pointers.size < 2) micropolisState.panning = false;
  }

  function cancelMicropolisPendingTouchTool() {
    if (micropolisState.pendingTouchTool) {
      window.clearTimeout(micropolisState.pendingTouchTool.timer);
      micropolisState.pendingTouchTool = null;
    }
  }

  function beginMicropolisPan() {
    const points = [...micropolisState.pointers.values()];
    micropolisState.panning = true;
    micropolisState.panLastX = (points[0].x + points[1].x) / 2;
    micropolisState.panLastY = (points[0].y + points[1].y) / 2;
    micropolisState.panRemainderX = 0;
    micropolisState.panRemainderY = 0;
  }

  function panMicropolisBy(clientX, clientY) {
    const canvas = micropolisState.canvas;
    if (!canvas || !canvas.ready) return;
    let x = clientX;
    let y = clientY;
    if (micropolisState.pointers.size === 2) {
      const points = [...micropolisState.pointers.values()];
      x = (points[0].x + points[1].x) / 2;
      y = (points[0].y + points[1].y) / 2;
    }
    const tileWidth = micropolisState.tileSet ? micropolisState.tileSet.tileWidth : 16;
    micropolisState.panRemainderX += micropolisState.panLastX - x;
    micropolisState.panRemainderY += micropolisState.panLastY - y;
    micropolisState.panLastX = x;
    micropolisState.panLastY = y;
    const dxTiles = Math.trunc(micropolisState.panRemainderX / tileWidth);
    const dyTiles = Math.trunc(micropolisState.panRemainderY / tileWidth);
    if (!dxTiles && !dyTiles) return;
    micropolisState.panRemainderX -= dxTiles * tileWidth;
    micropolisState.panRemainderY -= dyTiles * tileWidth;
    const origin = canvas.getTileOrigin();
    canvas.moveTo(origin.x + dxTiles, origin.y + dyTiles);
  }

  function handleMicropolisWheel(event) {
    const canvas = micropolisState.canvas;
    if (!canvas || !canvas.ready) return;
    event.preventDefault();
    micropolisState.panRemainderX += event.deltaX;
    micropolisState.panRemainderY += event.deltaY;
    const tileWidth = micropolisState.tileSet ? micropolisState.tileSet.tileWidth : 16;
    const dxTiles = Math.trunc(micropolisState.panRemainderX / tileWidth);
    const dyTiles = Math.trunc(micropolisState.panRemainderY / tileWidth);
    if (!dxTiles && !dyTiles) return;
    micropolisState.panRemainderX -= dxTiles * tileWidth;
    micropolisState.panRemainderY -= dyTiles * tileWidth;
    const origin = canvas.getTileOrigin();
    canvas.moveTo(origin.x + dxTiles, origin.y + dyTiles);
  }

  function applyMicropolisToolAt(tileX, tileY, options = {}) {
    const { sim, tools } = micropolisState;
    if (!sim || !tools) return;
    const tool = tools[micropolisState.toolId];
    if (!tool) return;
    if (options.draggedOnly && !tool.isDraggable) return;
    tool.doTool(tileX, tileY, sim.blockMaps);
    tool.modifyIfEnoughFunding(sim.budget);
    if (tool.result === tool.TOOLRESULT_NEEDS_BULLDOZE) setMicropolisStatus("micropolis_status_needs_bulldoze");
    else if (tool.result === tool.TOOLRESULT_NO_MONEY) setMicropolisStatus("micropolis_status_no_money");
    else if (tool.result === tool.TOOLRESULT_OK) {
      micropolisState.dirty = true;
      setMicropolisStatus("micropolis_status_ready");
    }
    renderMicropolisHud();
    startMicropolisLoop();
  }

  // --- city persistence ------------------------------------------------------
  //
  // City saves live in their own IndexedDB store ("cities", database version
  // 3). They are desk-toy state, not project data: project backups, recovery
  // bundles, and Project CD exports deliberately do not carry them.

  function serializeMicropolisCity() {
    const sim = micropolisState.sim;
    if (!sim) return null;
    const saveData = {};
    sim.save(saveData);
    // The engine stores tiles as {value} wrappers; persist plain numbers.
    saveData.map = saveData.map.map((tile) => tile.value);
    return saveData;
  }

  function deserializeMicropolisSaveData(stored) {
    const saveData = { ...stored };
    saveData.map = stored.map.map((value) => ({ value }));
    return saveData;
  }

  async function withMicropolisCityStore(mode, operation) {
    const db = await openAppDb();
    try {
      return await window.AISystem6StorageTransactions.runTransaction(
        db,
        [citiesStoreName],
        mode,
        (tx) => operation(tx.objectStore(citiesStoreName)),
      );
    } finally {
      db.close();
    }
  }

  async function saveMicropolisCity() {
    const saveData = serializeMicropolisCity();
    if (!saveData) return;
    let name = micropolisState.cityName;
    if (!name) {
      name = await showInputDialog({
        title: t("micropolis_save_city"),
        message: t("micropolis_city_name_prompt"),
        defaultValue: t("micropolis_untitled_city"),
      });
      if (name === null) return;
      name = name.trim() || t("micropolis_untitled_city");
    }
    const now = new Date().toISOString();
    const record = {
      id: micropolisState.cityId || (crypto.randomUUID ? crypto.randomUUID() : `city-${Date.now()}`),
      name,
      createdAt: micropolisState.createdAt || now,
      updatedAt: now,
      schemaVersion: 1,
      population: micropolisState.population,
      saveData,
    };
    try {
      await withMicropolisCityStore("readwrite", (store) => idbRequest(store.put(record)));
    } catch {
      setMicropolisStatus("micropolis_status_save_failed");
      return;
    }
    micropolisState.cityId = record.id;
    micropolisState.cityName = record.name;
    micropolisState.createdAt = record.createdAt;
    micropolisState.dirty = false;
    setMicropolisStatus("micropolis_status_saved");
    if (typeof updateMenuState === "function") updateMenuState();
  }

  async function listMicropolisCities() {
    try {
      const records = await withMicropolisCityStore("readonly", (store) => idbRequest(store.getAll()));
      return (Array.isArray(records) ? records : [])
        .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
    } catch {
      return [];
    }
  }

  async function loadMicropolisCity(id) {
    const engine = micropolisEngine();
    const viewport = micropolisWindow()?.querySelector("[data-micropolis-viewport]");
    if (!engine || !viewport) return;
    let record = null;
    try {
      record = await withMicropolisCityStore("readonly", (store) => idbRequest(store.get(id)));
    } catch {
      record = null;
    }
    if (!record || !record.saveData) {
      setMicropolisStatus("micropolis_status_load_failed");
      return;
    }
    await ensureMicropolisAssets();
    stopMicropolisLoop();
    micropolisState.starting = true;
    whenMicropolisViewportReady(viewport, () => {
      const saveData = deserializeMicropolisSaveData(record.saveData);
      const map = new engine.GameMap(saveData.width, saveData.height);
      const sim = new engine.Simulation(map, saveData._gameLevel, engine.Simulation.SPEED_PAUSED, saveData);
      finishMicropolisCitySetup(viewport, map, sim, saveData._speed);
      micropolisState.cityId = record.id;
      micropolisState.cityName = record.name;
      micropolisState.createdAt = record.createdAt;
      micropolisState.dirty = false;
      closeMicropolisPanel();
      setMicropolisStatus("micropolis_status_loaded");
      if (typeof updateMenuState === "function") updateMenuState();
    });
  }

  async function deleteMicropolisCity(id) {
    const confirmed = await showSystemModal(t("micropolis_delete_city_confirm"), "confirm", { danger: true });
    if (confirmed !== "yes" && confirmed !== "ok") return;
    try {
      await withMicropolisCityStore("readwrite", (store) => idbRequest(store.delete(id)));
    } catch {
      setMicropolisStatus("micropolis_status_save_failed");
      return;
    }
    if (micropolisState.cityId === id) {
      micropolisState.cityId = null;
      micropolisState.cityName = "";
    }
    renderMicropolisCitiesPanel();
  }

  // --- in-pane panels (budget, evaluation, saved cities) ---------------------

  function micropolisPanelElement() {
    return micropolisWindow()?.querySelector("[data-micropolis-panel]") || null;
  }

  function closeMicropolisPanel() {
    micropolisState.panel = "";
    const panel = micropolisPanelElement();
    if (panel) {
      panel.classList.add("is-hidden");
      panel.innerHTML = "";
    }
  }

  function openMicropolisPanel(kind) {
    micropolisState.panel = kind;
    const panel = micropolisPanelElement();
    if (!panel) return;
    panel.classList.remove("is-hidden");
    if (kind === "budget") renderMicropolisBudgetPanel();
    else if (kind === "evaluation") renderMicropolisEvaluationPanel();
    else if (kind === "cities") renderMicropolisCitiesPanel();
  }

  function micropolisPanelShell(titleKey, body) {
    return `<div class="micropolis-panel-head">
        <strong>${t(titleKey)}</strong>
        <button type="button" class="btn micropolis-panel-close" data-micropolis-panel-close>${t("micropolis_panel_close")}</button>
      </div>
      <div class="micropolis-panel-body">${body}</div>`;
  }

  function micropolisPercentSelect(name, value) {
    const current = Math.round(value * 10) * 10;
    const options = [];
    for (let percent = 0; percent <= 100; percent += 10) {
      options.push(`<option value="${percent}"${percent === current ? " selected" : ""}>${percent}%</option>`);
    }
    return `<div class="select-wrap"><select data-micropolis-budget-percent="${name}">${options.join("")}</select></div>`;
  }

  function renderMicropolisBudgetPanel() {
    const panel = micropolisPanelElement();
    const sim = micropolisState.sim;
    if (!panel || !sim) return;
    const budget = sim.budget;
    const taxOptions = [];
    for (let rate = 0; rate <= 20; rate += 1) {
      taxOptions.push(`<option value="${rate}"${rate === budget.cityTax ? " selected" : ""}>${rate}%</option>`);
    }
    panel.innerHTML = micropolisPanelShell("micropolis_budget_head", `
      ${micropolisState.mandatoryBudget ? `<p class="micropolis-panel-note">${t("micropolis_budget_mandatory")}</p>` : ""}
      <div class="micropolis-panel-row"><span>${t("micropolis_budget_tax")}</span>
        <div class="select-wrap"><select data-micropolis-budget-tax>${taxOptions.join("")}</select></div></div>
      <div class="micropolis-panel-row"><span>${t("micropolis_budget_road")}</span>${micropolisPercentSelect("road", budget.roadPercent)}</div>
      <div class="micropolis-panel-row"><span>${t("micropolis_budget_fire")}</span>${micropolisPercentSelect("fire", budget.firePercent)}</div>
      <div class="micropolis-panel-row"><span>${t("micropolis_budget_police")}</span>${micropolisPercentSelect("police", budget.policePercent)}</div>
      <label class="micropolis-panel-row micropolis-panel-check"><input type="checkbox" data-micropolis-budget-auto${budget.autoBudget ? " checked" : ""} /> ${t("micropolis_budget_auto")}</label>
      <div class="micropolis-panel-actions"><button type="button" class="btn default" data-micropolis-budget-approve>${t("micropolis_budget_approve")}</button></div>
    `);
  }

  function applyMicropolisBudgetPanel() {
    const panel = micropolisPanelElement();
    const sim = micropolisState.sim;
    if (!panel || !sim) return;
    const budget = sim.budget;
    const tax = Number(panel.querySelector("[data-micropolis-budget-tax]")?.value);
    if (Number.isFinite(tax)) budget.setTax(tax);
    for (const select of panel.querySelectorAll("[data-micropolis-budget-percent]")) {
      const fraction = Number(select.value) / 100;
      if (!Number.isFinite(fraction)) continue;
      if (select.dataset.micropolisBudgetPercent === "road") budget.roadPercent = fraction;
      else if (select.dataset.micropolisBudgetPercent === "fire") budget.firePercent = fraction;
      else if (select.dataset.micropolisBudgetPercent === "police") budget.policePercent = fraction;
    }
    budget.setAutoBudget(!!panel.querySelector("[data-micropolis-budget-auto]")?.checked);
    if (micropolisState.mandatoryBudget) {
      micropolisState.mandatoryBudget = false;
      budget.doBudgetWindow();
    }
    micropolisState.dirty = true;
    closeMicropolisPanel();
    setMicropolisTicker("micropolis_msg_budget_applied");
    renderMicropolisHud();
    startMicropolisLoop();
  }

  const MICROPOLIS_PROBLEM_KEYS = Object.freeze([
    "micropolis_problem_crime",
    "micropolis_problem_pollution",
    "micropolis_problem_housing",
    "micropolis_problem_taxes",
    "micropolis_problem_traffic",
    "micropolis_problem_unemployment",
    "micropolis_problem_fire",
  ]);

  function renderMicropolisEvaluationPanel() {
    const panel = micropolisPanelElement();
    const sim = micropolisState.sim;
    if (!panel || !sim) return;
    const evaluation = sim.evaluation;
    const problems = (evaluation.problemOrder || [])
      .filter((index) => index >= 0 && index < MICROPOLIS_PROBLEM_KEYS.length)
      .slice(0, 4)
      .map((index) => `<li>${t(MICROPOLIS_PROBLEM_KEYS[index])}</li>`)
      .join("");
    panel.innerHTML = micropolisPanelShell("micropolis_eval_head", `
      <div class="micropolis-panel-row"><span>${t("micropolis_eval_approval")}</span><strong>${evaluation.cityYes}%</strong></div>
      <div class="micropolis-panel-row"><span>${t("micropolis_eval_score")}</span><strong>${evaluation.cityScore} (${evaluation.cityScoreDelta >= 0 ? "+" : ""}${evaluation.cityScoreDelta})</strong></div>
      <div class="micropolis-panel-row"><span>${t("micropolis_eval_population")}</span><strong>${evaluation.cityPop}</strong></div>
      <div class="micropolis-panel-row"><span>${t("micropolis_eval_class")}</span><strong>${t(micropolisState.classKey)}</strong></div>
      ${problems ? `<p class="micropolis-panel-note">${t("micropolis_eval_problems")}</p><ul class="micropolis-panel-list">${problems}</ul>` : ""}
    `);
  }

  function renderMicropolisCitiesPanel() {
    const panel = micropolisPanelElement();
    if (!panel) return;
    listMicropolisCities().then((records) => {
      if (micropolisState.panel !== "cities") return;
      const rows = records.map((record) => `
        <div class="micropolis-panel-row micropolis-city-row">
          <span class="micropolis-city-name">${escapeHtml(record.name)}</span>
          <span class="micropolis-city-meta">${t("micropolis_population", record.population || 0)} · ${String(record.updatedAt || "").slice(0, 10)}</span>
          <button type="button" class="btn" data-micropolis-city-open="${record.id}">${t("micropolis_city_open")}</button>
          <button type="button" class="btn" data-micropolis-city-delete="${record.id}">${t("micropolis_city_delete")}</button>
        </div>`).join("");
      panel.innerHTML = micropolisPanelShell("micropolis_cities_title",
        rows || `<p class="micropolis-panel-note">${t("micropolis_cities_empty")}</p>`);
    });
  }

  function handleMicropolisPanelClick(event) {
    if (event.target.closest("[data-micropolis-panel-close]")) {
      const wasMandatory = micropolisState.mandatoryBudget;
      closeMicropolisPanel();
      if (wasMandatory) {
        // Closing a mandatory budget without approving keeps the current
        // rates; the simulation must not stay frozen on awaitingValues.
        micropolisState.mandatoryBudget = false;
        micropolisState.sim?.budget.doBudgetWindow();
        startMicropolisLoop();
      }
      return;
    }
    if (event.target.closest("[data-micropolis-budget-approve]")) {
      applyMicropolisBudgetPanel();
      return;
    }
    const openButton = event.target.closest("[data-micropolis-city-open]");
    if (openButton) {
      loadMicropolisCity(openButton.dataset.micropolisCityOpen);
      return;
    }
    const deleteButton = event.target.closest("[data-micropolis-city-delete]");
    if (deleteButton) deleteMicropolisCity(deleteButton.dataset.micropolisCityDelete);
  }

  // --- commands / public API -------------------------------------------------

  function setMicropolisSpeed(speedName) {
    const engine = micropolisEngine();
    const sim = micropolisState.sim;
    if (!engine || !sim) return;
    const speeds = {
      slow: engine.Simulation.SPEED_SLOW,
      med: engine.Simulation.SPEED_MED,
      fast: engine.Simulation.SPEED_FAST,
    };
    const speed = speeds[speedName];
    if (typeof speed !== "number") return;
    micropolisState.speed = speed;
    sim.setSpeed(speed);
    setMicropolisStatus("micropolis_status_ready");
    startMicropolisLoop();
  }

  function toggleMicropolisPause() {
    const engine = micropolisEngine();
    const sim = micropolisState.sim;
    if (!engine || !sim) return;
    if (sim.isPaused()) {
      sim.setSpeed(micropolisState.speed || engine.Simulation.SPEED_MED);
      setMicropolisStatus("micropolis_status_ready");
    } else {
      sim.setSpeed(engine.Simulation.SPEED_PAUSED);
      setMicropolisStatus("micropolis_status_paused");
    }
    startMicropolisLoop();
  }

  const MICROPOLIS_DISASTERS = Object.freeze({
    fire: (sim) => sim.disasterManager.makeFire(),
    flood: (sim) => sim.disasterManager.makeFlood(),
    earthquake: (sim) => sim.disasterManager.makeEarthquake(),
    meltdown: (sim) => sim.disasterManager.makeMeltdown(),
    crash: (sim) => sim.disasterManager.makeCrash(),
    tornado: (sim) => sim.spriteManager.makeTornado(),
    monster: (sim) => sim.spriteManager.makeMonster(),
  });

  async function runMicropolisMenuCommand(command) {
    if (command === "new-city") {
      if (micropolisState.dirty) {
        const confirmed = await showSystemModal(t("micropolis_new_city_confirm"), "confirm");
        if (confirmed !== "yes" && confirmed !== "ok") return;
      }
      stopMicropolisLoop();
      closeMicropolisPanel();
      startMicropolisCity();
      return;
    }
    if (command === "save-city") {
      await saveMicropolisCity();
      return;
    }
    if (command === "open-city") {
      openMicropolisPanel("cities");
      return;
    }
    if (command === "budget") {
      openMicropolisPanel("budget");
      return;
    }
    if (command === "evaluation") {
      openMicropolisPanel("evaluation");
      return;
    }
    if (command.startsWith("disaster-")) {
      const disaster = MICROPOLIS_DISASTERS[command.slice("disaster-".length)];
      if (disaster && micropolisState.sim) {
        disaster(micropolisState.sim);
        micropolisState.dirty = true;
        startMicropolisLoop();
      }
      return;
    }
    if (command === "pause") {
      toggleMicropolisPause();
      return;
    }
    if (command.startsWith("speed-")) setMicropolisSpeed(command.slice("speed-".length));
  }

  // Called by openWindow for every path that reveals the window, so a restored
  // window is live before the user touches anything.
  function attachMicropolis() {
    buildMicropolisPane();
    if (!micropolisState.sim && !micropolisState.starting) {
      // Let openWindow finish revealing the window first; the canvas needs a
      // sized, visible parent.
      requestAnimationFrame(() => startMicropolisCity());
    } else {
      startMicropolisLoop();
    }
    renderMicropolisHud();
  }

  function openMicropolis() {
    if (typeof openWindow === "function") openWindow("micropolis");
  }

  // Re-render hook for applyLanguage: rebuild every text the module painted.
  function renderMicropolis() {
    if (!micropolisState.built) return;
    renderMicropolisToolbar();
    renderMicropolisHud();
  }

  function registerMicropolisDesktopCommands() {
    const item = (command, labelKey) => ({
      type: "item",
      action: `micropolis-${command}`,
      labelKey,
      conditionId: `micropolis-${command}`,
    });
    const separator = { type: "separator" };
    const disasters = ["fire", "flood", "tornado", "earthquake", "monster", "crash", "meltdown"];
    window.AISystem6RegisterApplicationMenuSet?.("micropolis", [
      {
        id: "file",
        labelKey: "menu_file",
        items: [
          item("new-city", "micropolis_new_city"),
          item("save-city", "micropolis_save_city"),
          item("open-city", "micropolis_open_city"),
          { type: "item", action: "close-active-window", labelKey: "close", shortcutId: "close-window", conditionId: "close-active-window" },
        ],
      },
      {
        id: "city",
        labelKey: "micropolis_menu_city",
        items: [
          item("budget", "micropolis_budget_title"),
          item("evaluation", "micropolis_evaluation_title"),
          separator,
          {
            type: "submenu",
            labelKey: "micropolis_menu_disasters",
            items: disasters.map((name) => item(`disaster-${name}`, `micropolis_disaster_${name}`)),
          },
        ],
      },
      {
        id: "speed",
        labelKey: "micropolis_menu_speed",
        items: [
          item("pause", "micropolis_pause"),
          separator,
          item("speed-slow", "micropolis_speed_slow"),
          item("speed-med", "micropolis_speed_med"),
          item("speed-fast", "micropolis_speed_fast"),
        ],
      },
    ]);

    const alwaysAvailable = new Set(["new-city", "open-city"]);
    const commands = [
      "new-city", "save-city", "open-city", "budget", "evaluation",
      ...disasters.map((name) => `disaster-${name}`),
      "pause", "speed-slow", "speed-med", "speed-fast",
    ];
    window.AISystem6RegisterApplicationCommands?.(Object.fromEntries(commands.map((command) => [
      `micropolis-${command}`,
      {
        handler: () => runMicropolisMenuCommand(command),
        isAvailable: () => alwaysAvailable.has(command) || !!micropolisState.sim,
      },
    ])));
  }

  registerMicropolisDesktopCommands();

  window.AISystem6Micropolis = Object.freeze({
    open: openMicropolis,
    attach: attachMicropolis,
    render: renderMicropolis,
    runMenuCommand: runMicropolisMenuCommand,
    hasCity: () => !!micropolisState.sim,
    isPaused: () => !!micropolisState.sim && micropolisState.sim.isPaused(),
    isDirty: () => micropolisState.dirty,
    serializeCity: serializeMicropolisCity,
    deserializeSaveData: deserializeMicropolisSaveData,
    messageKeys: MICROPOLIS_MESSAGE_KEYS,
    classKeys: MICROPOLIS_CLASS_KEYS,
    problemKeys: MICROPOLIS_PROBLEM_KEYS,
    toolIds: MICROPOLIS_TOOLS.map((tool) => tool.id),
  });
})();
