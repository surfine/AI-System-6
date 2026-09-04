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
    window.AISystem6ApplicationShell.createWindow({
      windowName: "micropolis",
      windowClass: "micropolis-window",
      labelledBy: "micropolis-title",
      titleKey: "micropolis_label",
      title: "Micropolis",
      statusClass: "micropolis-details-bar",
      statusHtml: '<span data-micropolis-funds></span><span class="micropolis-date" data-micropolis-date></span><span class="micropolis-population" data-micropolis-population></span>'
        + '<span class="micropolis-rci-cell"><button type="button" class="btn micropolis-rci-button" data-micropolis-rci-button aria-label="Demand">'
        + '<canvas class="micropolis-rci" data-micropolis-rci width="32" height="20" role="img" aria-label="RCI"></canvas></button></span>'
        + '<span class="micropolis-status" data-micropolis-status role="status" aria-live="polite"></span>',
      paneClass: "micropolis-pane",
    });
  }

  installMicropolisWindow();

  const MICROPOLIS_VENDOR_BASE = "app/vendor/micropolis/";
  const MICROPOLIS_MAP_WIDTH = 120;
  const MICROPOLIS_MAP_HEIGHT = 100;
  // A finger tap waits this long for a second finger before it builds.
  const MICROPOLIS_TOUCH_TOOL_DELAY_MS = 140;
  const MICROPOLIS_TOUCH_TOOL_SLOP_PX = 8;
  // Classic starting treasuries by difficulty (LEVEL_EASY, LEVEL_MED, LEVEL_HARD).
  const MICROPOLIS_LEVEL_FUNDS = Object.freeze([20000, 10000, 5000]);
  const MICROPOLIS_LEVEL_NAMES = Object.freeze(["easy", "med", "hard"]);

  // A small LCG: the terrain seed is the only state, so a seed reproduces a
  // map on any machine. Used only through the engine's setRandomSource hook.
  function micropolisLcg(seed) {
    let value = seed >>> 0;
    return () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  // Generates terrain from a seed and hands the engine back to Math.random.
  function generateMicropolisSeededMap(seed, width = MICROPOLIS_MAP_WIDTH, height = MICROPOLIS_MAP_HEIGHT) {
    const engine = micropolisEngine();
    const random = engine.Random;
    if (random && typeof random.setRandomSource === "function") random.setRandomSource(micropolisLcg(seed));
    try {
      return engine.MapGenerator(width, height);
    } finally {
      if (random && typeof random.setRandomSource === "function") random.setRandomSource(null);
    }
  }

  function randomMicropolisSeed() {
    return Math.floor(Math.random() * 0xffffffff) >>> 0;
  }

  // Palette order follows the original tool box: look, clear, connect, zone,
  // safety, leisure, transport hubs, power. Costs mirror the engine's tool
  // costs. The query tool is ours (shell-only): it reads the map and the
  // block maps directly, so the jQuery-bound upstream query tool stays out.
  const MICROPOLIS_TOOLS = Object.freeze([
    { id: "query", cost: 0 },
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
    demandHighlight: null,
    demandBlinkTimers: [],
    population: 0,
    classKey: "micropolis_class_village",
    date: { month: 0, year: 1900 },
    // Engine demand valves (residential, commercial, industrial).
    valves: { residential: 0, commercial: 0, industrial: 0 },
    // Data view painted over the map ("" = plain map).
    overlay: "",
    frameCount: 0,
    // Graphs panel: 10- or 120-year range and the series drawn.
    graphRange: "10",
    graphSeries: ["res", "com", "ind"],
    // The seed that generated the current terrain (saved with the city).
    terrainSeed: 0,
    // New City dialog in progress: { seed, map, level }.
    newCity: null,
    // Zoom level index into MICROPOLIS_ZOOM_LEVELS (1x classic, 2x HD).
    zoom: 1,
    // Two-finger distance when a pinch started, in CSS px.
    pinchStartDistance: 0,
    // The last .cty conversion: { direction, fileName, warnings }.
    ctyReport: null,
    // Running scenario state (micropolis-scenarios.js), saved with the city.
    scenario: null,
    // Engine notices, newest first: { key, month, year }.
    notices: [],
    // Options: synthesized sound effects on or off for this session.
    soundEnabled: true,
    audio: null,
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
          <div class="micropolis-viewport" data-micropolis-viewport>
            <div class="micropolis-zoom-layer" data-micropolis-zoom-layer>
              <canvas class="micropolis-overlay" data-micropolis-overlay aria-hidden="true"></canvas>
            </div>
          </div>
          <div class="micropolis-panel is-hidden" data-micropolis-panel></div>
          <p class="micropolis-ticker" data-micropolis-ticker aria-live="polite"></p>
        </div>
        <input type="file" accept=".cty" data-micropolis-cty-input hidden>
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
        <span class="micropolis-tool-cost">${tool.cost > 0 ? `$${tool.cost}` : ""}</span>
      </button>`;
    }).join("")
      + `<div class="micropolis-toolbar-footer" data-micropolis-toolbar-footer>
          <div class="micropolis-armed-tool" data-micropolis-armed-tool></div>
          <button type="button" class="btn micropolis-rci-panel-button" data-micropolis-rci-panel-button aria-label="Demand">
            <canvas class="micropolis-rci-panel" data-micropolis-rci-panel width="58" height="36" role="img" aria-label="RCI"></canvas>
          </button>
        </div>`;
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
    renderMicropolisRci();
  }

  // --- RCI demand gauge --------------------------------------------------------
  //
  // Three bars on a centre zero line, the same 26x14 instrument Bonsai City
  // keeps in its gauge bar. The engine's valves run -2000..2000 (residential)
  // and -1500..1500 (commercial, industrial); a bar is that fraction of the
  // half height, up for demand and down for oversupply.

  const MICROPOLIS_VALVE_RANGES = Object.freeze({ residential: 2000, commercial: 1500, industrial: 1500 });

  // Pure: the three bars as signed fractions in -1..1.
  function micropolisRciBars(valves) {
    // The shared core normalizes -1..1 itself; keep the valve-range mapping
    // here (it is the Micropolis-era scale) and let the core's bars() apply
    // the deadband and clamp.
    const scaled = {
      r: Number(valves && valves.residential) || 0,
      c: Number(valves && valves.commercial) || 0,
      i: Number(valves && valves.industrial) || 0,
    };
    return window.AISystem6CityDemandGauge.bars(scaled);
  }

  function renderMicropolisRci() {
    const canvas = micropolisWindow()?.querySelector("[data-micropolis-rci]");
    if (!canvas) return;
    canvas.setAttribute("aria-label", t("micropolis_rci_label"));
    const cs = getComputedStyle(canvas);
    const values = {
      r: (Number(micropolisState.valves && micropolisState.valves.residential) || 0) / 2000,
      c: (Number(micropolisState.valves && micropolisState.valves.commercial) || 0) / 1500,
      i: (Number(micropolisState.valves && micropolisState.valves.industrial) || 0) / 1500,
    };
    window.AISystem6CityDemandGauge.draw(canvas, "gauge-bar", values, {
      colors: {
        r: cs.getPropertyValue("--city-demand-r") || "#1f9d3a",
        c: cs.getPropertyValue("--city-demand-c") || "#2a55c7",
        i: cs.getPropertyValue("--city-demand-i") || "#d9a900",
      },
      ink: cs.color || "#000",
      highlight: micropolisState.demandHighlight?.id || null,
    });
  }

  function renderMicropolisPanelGauge() {
    const win = micropolisWindow();
    if (!win) return;
    const armed = win.querySelector("[data-micropolis-armed-tool]");
    if (armed) {
      const tool = MICROPOLIS_TOOLS.find((item) => item.id === micropolisState.toolId);
      if (tool) armed.textContent = `${t(`micropolis_tool_${tool.id}`)} · ${tool.cost > 0 ? `$${tool.cost}` : ""}`;
    }
    const canvas = win.querySelector("[data-micropolis-rci-panel]");
    if (!canvas) return;
    const cs = getComputedStyle(canvas);
    const values = {
      r: (Number(micropolisState.valves && micropolisState.valves.residential) || 0) / 2000,
      c: (Number(micropolisState.valves && micropolisState.valves.commercial) || 0) / 1500,
      i: (Number(micropolisState.valves && micropolisState.valves.industrial) || 0) / 1500,
    };
    canvas.setAttribute("aria-label", `${t("city_demand_label")} R ${values.r} C ${values.c} I ${values.i}`);
    window.AISystem6CityDemandGauge.draw(canvas, "micropolis-panel", values, {
      colors: {
        r: cs.getPropertyValue("--city-demand-r") || "#1f9d3a",
        c: cs.getPropertyValue("--city-demand-c") || "#2a55c7",
        i: cs.getPropertyValue("--city-demand-i") || "#d9a900",
      },
      ink: cs.color || "#000",
      highlight: micropolisState.demandHighlight?.id || null,
    });
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

  // The HD (@2x) atlases and the sprite sheet must share one scale, so they
  // load as a pair: if either HD file is missing, both fall back to the
  // classic 1x art together. Mixing scales would break the canvas geometry.
  function loadMicropolisArtPair() {
    return Promise.all([
      loadMicropolisImage("tiles@2x.png"),
      loadMicropolisImage("sprites@2x.png"),
    ]).catch(() => Promise.all([
      loadMicropolisImage("tiles.png"),
      loadMicropolisImage("sprites.png"),
    ]));
  }

  function ensureMicropolisAssets() {
    if (micropolisState.assetsPromise) return micropolisState.assetsPromise;
    const engine = micropolisEngine();
    micropolisState.assetsPromise = loadMicropolisArtPair()
      .then(([tilesImage, spritesImage]) => new Promise((resolve, reject) => {
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

  // The first city of a session starts itself (a desk toy shows a city, not
  // a form); later cities come through the New City dialog.
  function createMicropolisCity(viewport, options = {}) {
    const engine = micropolisEngine();
    const seed = typeof options.seed === "number" ? options.seed : randomMicropolisSeed();
    const level = Number.isInteger(options.level) && options.level >= 0 && options.level < MICROPOLIS_LEVEL_FUNDS.length
      ? options.level
      : engine.Simulation.LEVEL_EASY;
    const map = options.map || generateMicropolisSeededMap(seed);
    const sim = new engine.Simulation(map, level, engine.Simulation.SPEED_MED);
    sim.budget.setFunds(MICROPOLIS_LEVEL_FUNDS[level]);
    finishMicropolisCitySetup(viewport, map, sim, engine.Simulation.SPEED_MED);
    micropolisState.cityId = null;
    micropolisState.cityName = options.name || "";
    micropolisState.createdAt = "";
    micropolisState.terrainSeed = seed;
    micropolisState.scenario = null;
    setMicropolisTicker("micropolis_msg_welcome");
    if (typeof updateMenuState === "function") updateMenuState();
  }

  // --- .cty import and export ----------------------------------------------------
  //
  // The classic city file (micropolis-cty-codec.js) is the external common
  // format shared with Bonsai City. Both directions are lossy and say so:
  // every conversion ends in a panel that lists what the layout could not
  // carry, and what the engine will recompute on its next scan.

  function micropolisCty() {
    return window.AISystem6MicropolisCtyCodec || null;
  }

  function renderMicropolisCtyReport() {
    const panel = micropolisPanelElement();
    const report = micropolisState.ctyReport;
    if (!panel || !report) return;
    const losses = report.warnings.map((code) => `<li>${t(`micropolis_cty_loss_${code.replace(/-/g, "_")}`)}</li>`).join("");
    panel.innerHTML = micropolisPanelShell("micropolis_cty_report_head", `
      <p class="micropolis-panel-note">${t(report.direction === "import" ? "micropolis_cty_imported" : "micropolis_cty_exported", escapeHtml(report.fileName))}</p>
      <p class="micropolis-panel-note">${t("micropolis_cty_losses")}</p>
      <ul class="micropolis-panel-list">${losses}</ul>
    `);
  }

  function showMicropolisCtyReport(direction, fileName, warnings) {
    micropolisState.ctyReport = { direction, fileName, warnings: warnings.slice() };
    openMicropolisPanel("cty-report");
  }

  async function importMicropolisCtyBytes(bytes, fileName) {
    const engine = micropolisEngine();
    const codec = micropolisCty();
    const viewport = micropolisWindow()?.querySelector("[data-micropolis-viewport]");
    if (!engine || !codec || !viewport) return false;
    let decoded;
    try {
      decoded = codec.decodeCty(bytes);
    } catch {
      setMicropolisStatus("micropolis_status_cty_failed");
      return false;
    }
    await ensureMicropolisAssets();
    stopMicropolisLoop();
    micropolisState.starting = true;
    whenMicropolisViewportReady(viewport, () => {
      const saveData = deserializeMicropolisSaveData(decoded.saveData);
      const map = new engine.GameMap(saveData.width, saveData.height);
      const sim = new engine.Simulation(map, saveData._gameLevel, engine.Simulation.SPEED_PAUSED, saveData);
      finishMicropolisCitySetup(viewport, map, sim, saveData._speed);
      engine.BaseTool?.setAutoBulldoze?.(!!saveData.autoBulldoze);
      micropolisState.cityId = null;
      micropolisState.cityName = String(fileName || "").replace(/\.cty$/i, "") || t("micropolis_untitled_city");
      micropolisState.createdAt = "";
      micropolisState.terrainSeed = 0;
      micropolisState.scenario = null;
      micropolisState.dirty = true;
      showMicropolisCtyReport("import", fileName, decoded.warnings);
      if (typeof updateMenuState === "function") updateMenuState();
    });
    return true;
  }

  async function handleMicropolisCtyInput(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    try {
      await importMicropolisCtyBytes(new Uint8Array(await file.arrayBuffer()), file.name);
    } catch {
      setMicropolisStatus("micropolis_status_cty_failed");
    }
  }

  function exportMicropolisCty() {
    const codec = micropolisCty();
    const saveData = serializeMicropolisCity();
    if (!codec || !saveData) return false;
    let bytesOut;
    try {
      bytesOut = codec.encodeCty(saveData);
    } catch {
      setMicropolisStatus("micropolis_status_cty_failed");
      return false;
    }
    const fileName = `${(micropolisState.cityName || t("micropolis_untitled_city")).replace(/[\\/:*?"<>|]+/g, "-")}.cty`;
    const url = URL.createObjectURL(new Blob([bytesOut], { type: "application/octet-stream" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    // Encoding keeps every engine key the layout has a slot for; only the
    // next engine load recomputes effects, so there is no loss list here.
    showMicropolisCtyReport("export", fileName, []);
    return true;
  }

  // Lane D hook: Bonsai City summons a saved Micropolis record by id. The
  // command is Bonsai's lazy command; the payload names the record.
  function openMicropolisRecordInBonsai(recordId) {
    if (!recordId) return Promise.resolve({ ok: false, status: "no-record" });
    const runtime = window.AISystem6Runtime;
    if (!runtime || typeof runtime.dispatchCommand !== "function") return Promise.resolve({ ok: false, status: "no-runtime" });
    return runtime.dispatchCommand("open-bonsai-city", { micropolisRecordId: recordId });
  }

  // --- scenarios ---------------------------------------------------------------
  //
  // Eight original towns (micropolis-scenarios.js). Starting one is a New
  // City with a fixed seed, year, difficulty and a seeded starting town; the
  // frame loop then fires the scripted disasters and judges the goal.

  function micropolisScenarios() {
    return window.AISystem6MicropolisScenarios || null;
  }

  function startMicropolisScenario(id) {
    const scenarios = micropolisScenarios();
    const engine = micropolisEngine();
    const scenario = scenarios?.scenarioById(id);
    const viewport = micropolisWindow()?.querySelector("[data-micropolis-viewport]");
    if (!scenario || !engine || !viewport) return;
    ensureMicropolisAssets().then(() => {
      whenMicropolisViewportReady(viewport, () => {
        stopMicropolisLoop();
        micropolisState.newCity = null;
        closeMicropolisPanel();
        const map = generateMicropolisSeededMap(scenario.seed);
        const sim = new engine.Simulation(map, scenario.level, engine.Simulation.SPEED_MED);
        sim._startingYear = scenario.year;
        const town = scenarios.seedTown(engine, map, sim, scenario.town);
        sim.budget.setFunds(scenario.funds);
        finishMicropolisCitySetup(viewport, map, sim, engine.Simulation.SPEED_MED);
        // Open on the town, not on the map centre.
        const footprint = scenarios.townFootprint(scenarios.TOWN_PRESETS[scenario.town] || scenarios.TOWN_PRESETS.medium);
        micropolisState.canvas?.centreOn(town.origin.x + Math.floor(footprint.width / 2), town.origin.y + Math.floor(footprint.height / 2));
        micropolisState.cityId = null;
        micropolisState.cityName = t(`micropolis_scenario_${scenario.id}_name`);
        micropolisState.createdAt = "";
        micropolisState.terrainSeed = scenario.seed;
        micropolisState.scenario = scenarios.createState(scenario, sim._cityTime);
        micropolisState.dirty = true;
        openMicropolisPanel("scenario");
        if (typeof updateMenuState === "function") updateMenuState();
      });
    }).catch(() => setMicropolisStatus("micropolis_status_assets_failed"));
  }

  function tickMicropolisScenario() {
    const scenarios = micropolisScenarios();
    const { sim, scenario } = micropolisState;
    if (!scenarios || !sim || !scenario || scenario.result) return;
    // The goal is judged a few times a month, not every frame.
    if (micropolisState.frameCount % 20 !== 0) return;
    const before = scenario.result;
    const step = scenarios.tick(sim, scenario);
    step.disasters.forEach((name) => {
      const disaster = MICROPOLIS_DISASTERS[name];
      if (disaster) disaster(sim);
      recordMicropolisNotice(`micropolis_scenario_event_${name}`);
      setMicropolisTicker(`micropolis_scenario_event_${name}`);
    });
    if (step.result && step.result !== before) {
      const key = step.result === "won" ? "micropolis_scenario_won" : "micropolis_scenario_lost";
      recordMicropolisNotice(key);
      setMicropolisTicker(key);
      openMicropolisPanel("scenario");
    }
    if (micropolisState.panel === "scenario" && micropolisState.frameCount % 120 === 0) renderMicropolisScenarioPanel();
  }

  function renderMicropolisScenarioPanel() {
    const panel = micropolisPanelElement();
    const scenarios = micropolisScenarios();
    if (!panel || !scenarios) return;
    const state = micropolisState.scenario;
    const info = state && micropolisState.sim ? scenarios.progress(micropolisState.sim, state) : null;
    if (!info) {
      panel.innerHTML = micropolisPanelShell("micropolis_scenario_head", `<p class="micropolis-panel-note">${t("micropolis_scenario_none")}</p>`);
      return;
    }
    const result = info.result ? `<p class="micropolis-panel-note"><strong>${t(info.result === "won" ? "micropolis_scenario_won" : "micropolis_scenario_lost")}</strong></p>` : "";
    panel.innerHTML = micropolisPanelShell("micropolis_scenario_head", `
      <p class="micropolis-panel-note"><strong>${t(`micropolis_scenario_${state.id}_name`)}</strong> — ${t(`micropolis_scenario_${state.id}_premise`)}</p>
      <div class="micropolis-panel-row"><span>${t("micropolis_scenario_goal")}</span><strong>${t(`micropolis_goal_${info.kind}`, info.target)}</strong></div>
      <div class="micropolis-panel-row"><span>${t("micropolis_scenario_now")}</span><strong>${info.value}</strong></div>
      <div class="micropolis-panel-row"><span>${t("micropolis_scenario_deadline")}</span><strong>${t("micropolis_scenario_years_left", info.yearsLeft)}</strong></div>
      ${result}
    `);
  }

  // --- New City dialog ---------------------------------------------------------
  //
  // Name, difficulty, and a terrain the player accepts or regenerates. The
  // preview paints the candidate map on the game canvas itself; the running
  // city keeps its Simulation and comes back if the dialog is closed.

  function openMicropolisNewCity() {
    const viewport = micropolisWindow()?.querySelector("[data-micropolis-viewport]");
    if (!viewport || !micropolisEngine()) return;
    ensureMicropolisAssets().then(() => {
      whenMicropolisViewportReady(viewport, () => {
        stopMicropolisLoop();
        micropolisState.newCity = {
          seed: randomMicropolisSeed(),
          map: null,
          level: micropolisEngine().Simulation.LEVEL_EASY,
          name: "",
        };
        regenerateMicropolisNewCity(micropolisState.newCity.seed);
        openMicropolisPanel("new-city");
        setMicropolisStatus("micropolis_status_previewing");
      });
    }).catch(() => setMicropolisStatus("micropolis_status_assets_failed"));
  }

  function regenerateMicropolisNewCity(seed) {
    const pending = micropolisState.newCity;
    const viewport = micropolisWindow()?.querySelector("[data-micropolis-viewport]");
    if (!pending || !viewport) return;
    pending.seed = seed >>> 0;
    pending.map = generateMicropolisSeededMap(pending.seed);
    if (!micropolisState.canvas) {
      const layer = viewport.querySelector("[data-micropolis-zoom-layer]") || viewport;
      micropolisState.canvas = new micropolisEngine().GameCanvas("micropolis-canvas", layer);
      observeMicropolisViewport(viewport);
    }
    micropolisState.canvas.init(pending.map, micropolisState.tileSet, micropolisState.spriteSheet);
    const seedField = micropolisWindow()?.querySelector("[data-micropolis-new-seed]");
    if (seedField) seedField.textContent = pending.seed.toString(16).padStart(8, "0");
  }

  function renderMicropolisNewCityPanel() {
    const panel = micropolisPanelElement();
    const pending = micropolisState.newCity;
    if (!panel || !pending) return;
    const levels = MICROPOLIS_LEVEL_NAMES.map((name, index) => `<option value="${index}"${index === pending.level ? " selected" : ""}>${t(`micropolis_level_${name}`, MICROPOLIS_LEVEL_FUNDS[index])}</option>`).join("");
    panel.innerHTML = micropolisPanelShell("micropolis_new_city_head", `
      <label class="micropolis-panel-row"><span>${t("micropolis_new_city_name")}</span>
        <input type="text" class="micropolis-panel-input" data-micropolis-new-name value="${escapeHtml(pending.name)}" placeholder="${t("micropolis_untitled_city")}"></label>
      <div class="micropolis-panel-row"><span>${t("micropolis_new_city_level")}</span>
        <div class="select-wrap"><select data-micropolis-new-level>${levels}</select></div></div>
      <div class="micropolis-panel-row"><span>${t("micropolis_new_city_seed")}</span>
        <span><code data-micropolis-new-seed>${pending.seed.toString(16).padStart(8, "0")}</code>
        <button type="button" class="btn" data-micropolis-new-regenerate>${t("micropolis_new_city_regenerate")}</button></span></div>
      <div class="micropolis-panel-actions"><button type="button" class="btn default" data-micropolis-new-start>${t("micropolis_new_city_start")}</button></div>
    `);
  }

  function startMicropolisNewCity() {
    const pending = micropolisState.newCity;
    const panel = micropolisPanelElement();
    const viewport = micropolisWindow()?.querySelector("[data-micropolis-viewport]");
    if (!pending || !pending.map || !viewport) return;
    const name = String(panel?.querySelector("[data-micropolis-new-name]")?.value || "").trim();
    const level = Number(panel?.querySelector("[data-micropolis-new-level]")?.value);
    micropolisState.newCity = null;
    closeMicropolisPanel();
    createMicropolisCity(viewport, {
      seed: pending.seed,
      map: pending.map,
      level: Number.isInteger(level) && level >= 0 && level <= 2 ? level : 0,
      name,
    });
  }

  // Closing the dialog puts the running city back on the canvas.
  function cancelMicropolisNewCity() {
    micropolisState.newCity = null;
    const { canvas, map } = micropolisState;
    if (canvas && map && micropolisState.sim) {
      canvas.init(map, micropolisState.tileSet, micropolisState.spriteSheet);
      setMicropolisStatus("micropolis_status_ready");
      startMicropolisLoop();
    } else if (!micropolisState.sim && !micropolisState.starting) {
      startMicropolisCity();
    }
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
      // The engine canvas lives in the zoom layer (with the data overlay on
      // top); the layer's size is the viewport's divided by the zoom.
      const layer = viewport.querySelector("[data-micropolis-zoom-layer]") || viewport;
      micropolisState.canvas = new engine.GameCanvas("micropolis-canvas", layer);
      observeMicropolisViewport(viewport);
    }
    micropolisState.canvas.init(map, micropolisState.tileSet, micropolisState.spriteSheet);

    subscribeMicropolisSim(sim);
    subscribeMicropolisSounds(sim, micropolisState.tools);
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
      if (key) {
        setMicropolisTicker(key);
        recordMicropolisNotice(key);
      }
    });
    sim.addEventListener(Messages.FUNDS_CHANGED, () => renderMicropolisHud());
    sim.addEventListener(Messages.VALVES_UPDATED, (valves) => {
      if (valves && typeof valves.residential === "number") micropolisState.valves = valves;
      renderMicropolisRci();
      renderMicropolisPanelGauge();
    });
    if (sim._valves) {
      micropolisState.valves = {
        residential: sim._valves.resValve || 0,
        commercial: sim._valves.comValve || 0,
        industrial: sim._valves.indValve || 0,
      };
    }
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
    // The snow set must match the active tile set's scale; a cross-scale swap
    // would resize the backing store mid-season. No cross-scale fallback:
    // when the matching file is missing, winter simply keeps the green set.
    const hd = (micropolisState.tileSet?.scale || 1) > 1;
    return loadMicropolisImage(hd ? "tilessnow@2x.png" : "tilessnow.png").then((image) => new Promise((resolve) => {
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
    // getSpritesInView expects world pixels (16 per tile); canvasWidth is
    // backing pixels, which carry the tile set's HD scale.
    const scale = micropolisState.tileSet ? micropolisState.tileSet.scale || 1 : 1;
    const sprites = sim.spriteManager.getSpritesInView(
      origin.x, origin.y, canvas.canvasWidth / scale, canvas.canvasHeight / scale,
    );
    canvas.paint(null, sprites.length ? sprites : null, paused);
    micropolisState.frameCount += 1;
    paintMicropolisOverlay();
    if (!paused) tickMicropolisScenario();
    // The city map in the Maps panel follows the simulation about once a second.
    if (micropolisState.panel === "maps" && micropolisState.frameCount % 60 === 0) renderMicropolisMiniMap();
    if (micropolisState.panel === "graphs" && micropolisState.frameCount % 120 === 0) renderMicropolisGraph();
    micropolisState.rafId = requestAnimationFrame(micropolisFrame);
  }

  // --- graphs ------------------------------------------------------------------
  //
  // The classic six series over ten or one hundred and twenty years, drawn
  // as one-bit dashed lines with the legend on the chart itself.

  function renderMicropolisGraphsPanel() {
    const panel = micropolisPanelElement();
    const views = micropolisViews();
    if (!panel || !views) return;
    const ranges = views.GRAPH_RANGES.map((range) => `<label class="micropolis-graph-choice"><input type="radio" name="micropolis-graph-range" value="${range}" data-micropolis-graph-range${range === micropolisState.graphRange ? " checked" : ""}> <span>${t(`micropolis_graph_range_${range}`)}</span></label>`).join("");
    const series = views.GRAPH_SERIES.map((id) => `<label class="micropolis-graph-choice"><input type="checkbox" value="${id}" data-micropolis-graph-series${micropolisState.graphSeries.includes(id) ? " checked" : ""}> <span>${t(`micropolis_graph_${id}`)}</span></label>`).join("");
    panel.innerHTML = micropolisPanelShell("micropolis_graphs_head", `
      <canvas class="micropolis-graph" data-micropolis-graph role="img" aria-label="${t("micropolis_graphs_head")}"></canvas>
      <div class="micropolis-graph-controls" data-micropolis-graph-ranges>${ranges}</div>
      <div class="micropolis-graph-controls">${series}</div>
    `);
    renderMicropolisGraph();
  }

  function renderMicropolisGraph() {
    const canvas = micropolisWindow()?.querySelector("[data-micropolis-graph]");
    const views = micropolisViews();
    const sim = micropolisState.sim;
    if (!canvas || !views || !sim) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const dpr = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1));
    const cssWidth = Math.max(80, Math.round(canvas.clientWidth || 300));
    const cssHeight = Math.max(60, Math.round(canvas.clientHeight || 150));
    if (canvas.width !== Math.round(cssWidth * dpr)) canvas.width = Math.round(cssWidth * dpr);
    if (canvas.height !== Math.round(cssHeight * dpr)) canvas.height = Math.round(cssHeight * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ink = getComputedStyle(canvas).color || "#000";
    const drawn = views.drawGraph(context, sim._census, micropolisState.graphSeries, micropolisState.graphRange, { width: cssWidth, height: cssHeight }, ink);
    context.fillStyle = ink;
    context.font = "10px monospace";
    if (!drawn) {
      context.fillText(t("micropolis_graph_empty"), 12, Math.round(cssHeight / 2));
      return;
    }
    // Legend: a short sample of each pattern before its name, top right.
    let y = 14;
    micropolisState.graphSeries.forEach((id) => {
      const label = t(`micropolis_graph_${id}`);
      const pattern = views.GRAPH_PATTERNS[views.GRAPH_SERIES.indexOf(id) % views.GRAPH_PATTERNS.length];
      const textWidth = context.measureText(label).width;
      const x = cssWidth - 12 - textWidth;
      for (let px = 0; px < 18; px += 1) {
        if (pattern[px % pattern.length] === 1) context.fillRect(x - 22 + px, y - 4, 1, 1);
      }
      context.fillText(label, x, y);
      y += 12;
    });
  }

  // --- notices log -------------------------------------------------------------
  //
  // The ticker shows one line and forgets it; the log keeps the last eighty
  // with the city date they arrived. Same messages, same keys.

  const MICROPOLIS_NOTICE_LIMIT = 80;

  function recordMicropolisNotice(key) {
    const last = micropolisState.notices[0];
    const { month, year } = micropolisState.date;
    micropolisMaybeBlinkDemand(key);
    // The engine repeats a standing message every few months; one line per
    // message per month is enough.
    if (last && last.key === key && last.month === month && last.year === year) return;
    micropolisState.notices.unshift({ key, month, year });
    if (micropolisState.notices.length > MICROPOLIS_NOTICE_LIMIT) micropolisState.notices.length = MICROPOLIS_NOTICE_LIMIT;
    if (micropolisState.panel === "notices") renderMicropolisNoticesPanel();
  }

  function micropolisMaybeBlinkDemand(key) {
    const id = { micropolis_msg_need_residential: "residential", micropolis_msg_need_commercial: "commercial", micropolis_msg_need_industrial: "industrial" }[key];
    if (!id) return;
    micropolisState.demandBlinkTimers.forEach(clearTimeout);
    micropolisState.demandBlinkTimers = [];
    const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      micropolisState.demandHighlight = { id, until: Date.now() + 3000 };
      renderMicropolisRci();
      renderMicropolisPanelGauge();
      return;
    }
    [id, null, id, null].forEach((value, index) => {
      micropolisState.demandBlinkTimers.push(setTimeout(() => {
        micropolisState.demandHighlight = value ? { id: value, until: Date.now() + 1000 } : null;
        renderMicropolisRci();
        renderMicropolisPanelGauge();
      }, index * 250));
    });
  }

  function renderMicropolisNoticesPanel() {
    const panel = micropolisPanelElement();
    if (!panel) return;
    const rows = micropolisState.notices.map((notice) => `
      <li class="micropolis-notice"><span class="micropolis-notice-date">${t("micropolis_date", t(`micropolis_month_${notice.month + 1}`), notice.year)}</span> ${t(notice.key)}</li>`).join("");
    panel.innerHTML = micropolisPanelShell("micropolis_notices_head",
      rows ? `<ul class="micropolis-notice-list">${rows}</ul>` : `<p class="micropolis-panel-note">${t("micropolis_notices_empty")}</p>`);
  }

  // --- options -----------------------------------------------------------------
  //
  // Auto-bulldoze is an engine flag on the tool box (BaseTool), auto-budget
  // an engine flag on the budget, sound a shell flag. A panel with three
  // check boxes: the classic Options menu, minus the check marks the menu
  // bar cannot draw for a lazy app's own state.

  function micropolisAutoBulldoze() {
    const engine = micropolisEngine();
    return !!engine?.BaseTool?.getAutoBulldoze?.();
  }

  function setMicropolisAutoBulldoze(enabled) {
    const engine = micropolisEngine();
    engine?.BaseTool?.setAutoBulldoze?.(!!enabled);
    micropolisState.dirty = true;
  }

  function renderMicropolisOptionsPanel() {
    const panel = micropolisPanelElement();
    if (!panel) return;
    const autoBudget = !!micropolisState.sim?.budget?.autoBudget;
    const check = (name, key, checked) => `<label class="micropolis-panel-row micropolis-panel-check"><input type="checkbox" data-micropolis-option="${name}"${checked ? " checked" : ""} /> ${t(key)}</label>`;
    panel.innerHTML = micropolisPanelShell("micropolis_options_head", `
      ${check("auto-bulldoze", "micropolis_option_auto_bulldoze", micropolisAutoBulldoze())}
      ${check("auto-budget", "micropolis_option_auto_budget", autoBudget)}
      ${check("sound", "micropolis_option_sound", micropolisState.soundEnabled)}
      <p class="micropolis-panel-note">${t("micropolis_option_shortcuts_note")}</p>
    `);
  }

  function applyMicropolisOption(name, enabled) {
    if (name === "auto-bulldoze") setMicropolisAutoBulldoze(enabled);
    else if (name === "auto-budget") {
      micropolisState.sim?.budget?.setAutoBudget(!!enabled);
      micropolisState.dirty = true;
    } else if (name === "sound") {
      micropolisState.soundEnabled = !!enabled;
      micropolisAudioEngine()?.setSfxEnabled?.(micropolisState.soundEnabled);
    }
  }

  // Zoom (C7) and audio (C8) arrive in later milestones; the keyboard and
  // options code above may run before then, so both answer "nothing yet".
  // --- sound -------------------------------------------------------------------
  //
  // Synthesized in micropolis-audio.js; the engine's sound cues arrive as
  // messages on the sprite manager (relayed at bundle time) and on the
  // bulldozer tool. Created on first use so no AudioContext exists until a
  // city makes a sound.

  function micropolisAudioEngine() {
    if (micropolisState.audio) return micropolisState.audio;
    const audio = window.AISystem6MicropolisAudio;
    if (!audio || !micropolisState.soundEnabled) return null;
    micropolisState.audio = audio.createEngine();
    micropolisState.audio.setSfxEnabled(micropolisState.soundEnabled);
    return micropolisState.audio;
  }

  function playMicropolisSfx(name) {
    if (!micropolisState.soundEnabled) return;
    micropolisAudioEngine()?.sfx(name);
  }

  function subscribeMicropolisSounds(sim, tools) {
    const Messages = micropolisEngine().Messages;
    const audio = window.AISystem6MicropolisAudio;
    if (!audio) return;
    for (const cueName of Object.keys(audio.CUE_RECIPES)) {
      const subject = Messages[cueName];
      if (typeof subject !== "string") continue;
      const play = () => { if (micropolisState.soundEnabled) micropolisAudioEngine()?.cue(cueName); };
      sim.spriteManager.addEventListener(subject, play);
      // The bulldozer emits the explosion cues itself when it clears a zone.
      if (tools?.bulldozer?.addEventListener && cueName.startsWith("SOUND_EXPLOSION")) tools.bulldozer.addEventListener(subject, play);
    }
  }

  // --- zoom --------------------------------------------------------------------
  //
  // Two levels, like the classic map: 1x (a 16 px tile) and 2x, where the
  // HD atlas paints one backing pixel per device pixel. The zoom is a CSS
  // custom property on the viewport; the zoom layer's layout size is the
  // viewport divided by it and a transform scales it back, so the engine's
  // backing-store math never changes. Pointer math divides by the zoom.

  const MICROPOLIS_ZOOM_LEVELS = Object.freeze([1, 2]);
  const MICROPOLIS_PINCH_IN = 1.3;
  const MICROPOLIS_PINCH_OUT = 0.77;

  // Pure: the zoom after a step, clamped to the two levels.
  function micropolisNextZoom(current, direction) {
    const index = MICROPOLIS_ZOOM_LEVELS.indexOf(current);
    const next = Math.max(0, Math.min(MICROPOLIS_ZOOM_LEVELS.length - 1, (index < 0 ? 0 : index) + (direction > 0 ? 1 : -1)));
    return MICROPOLIS_ZOOM_LEVELS[next];
  }

  // Pure: what a pinch ratio means: 1 in, -1 out, 0 not yet.
  function micropolisPinchDirection(ratio) {
    if (ratio >= MICROPOLIS_PINCH_IN) return 1;
    if (ratio <= MICROPOLIS_PINCH_OUT) return -1;
    return 0;
  }

  function setMicropolisZoom(level) {
    if (!MICROPOLIS_ZOOM_LEVELS.includes(level) || level === micropolisState.zoom) return;
    micropolisState.zoom = level;
    const viewport = micropolisWindow()?.querySelector("[data-micropolis-viewport]");
    if (viewport) viewport.style.setProperty("--micropolis-zoom", String(level));
    if (micropolisState.canvas && micropolisState.canvas.ready) micropolisState.canvas._pendingDimensionChange = true;
    setMicropolisStatus(level === 1 ? "micropolis_status_ready" : "micropolis_status_zoomed");
    startMicropolisLoop();
    if (typeof updateMenuState === "function") updateMenuState();
  }

  function stepMicropolisZoom(direction) {
    setMicropolisZoom(micropolisNextZoom(micropolisState.zoom, direction));
  }

  // Screen pixels per logical tile: the CSS tile width times the zoom.
  function micropolisScreenTileWidth() {
    return micropolisCssTileWidth() * micropolisState.zoom;
  }

  function micropolisPointerDistance() {
    const points = [...micropolisState.pointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  // --- keyboard ----------------------------------------------------------------
  //
  // One key per tool, the classic way: letters for the connecting tools,
  // digits for the zones and the big buildings. Space pauses; arrows scroll.

  const MICROPOLIS_KEY_TOOLS = Object.freeze({
    q: "query", b: "bulldozer", r: "road", t: "rail", w: "wire", p: "park",
    1: "residential", 2: "commercial", 3: "industrial", 4: "police", 5: "fire",
    6: "stadium", 7: "port", 8: "airport", 9: "coal", 0: "nuclear",
  });
  const MICROPOLIS_KEY_PAN_TILES = 4;

  // Pure: what a key press means, or null when it means nothing here.
  function micropolisKeyAction(key, modifiers = {}) {
    if (modifiers.meta || modifiers.ctrl || modifiers.alt) return null;
    const lower = String(key || "").toLowerCase();
    if (MICROPOLIS_KEY_TOOLS[lower]) return { type: "tool", toolId: MICROPOLIS_KEY_TOOLS[lower] };
    if (key === " ") return { type: "pause" };
    if (key === "ArrowLeft") return { type: "pan", dx: -MICROPOLIS_KEY_PAN_TILES, dy: 0 };
    if (key === "ArrowRight") return { type: "pan", dx: MICROPOLIS_KEY_PAN_TILES, dy: 0 };
    if (key === "ArrowUp") return { type: "pan", dx: 0, dy: -MICROPOLIS_KEY_PAN_TILES };
    if (key === "ArrowDown") return { type: "pan", dx: 0, dy: MICROPOLIS_KEY_PAN_TILES };
    if (key === "+" || key === "=") return { type: "zoom", direction: 1 };
    if (key === "-" || key === "_") return { type: "zoom", direction: -1 };
    if (key === "Escape") return { type: "close-panel" };
    return null;
  }

  function handleMicropolisKeyDown(event) {
    if (event.target.closest("input, select, textarea, [contenteditable]")) return;
    const action = micropolisKeyAction(event.key, { meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey });
    if (!action) return;
    event.preventDefault();
    if (action.type === "tool") {
      micropolisState.toolId = action.toolId;
      setMicropolisStatus("micropolis_status_ready");
      renderMicropolisToolbar();
    } else if (action.type === "pause") {
      toggleMicropolisPause();
    } else if (action.type === "pan") {
      const canvas = micropolisState.canvas;
      if (canvas && canvas.ready) {
        const origin = canvas.getTileOrigin();
        canvas.moveTo(origin.x + action.dx, origin.y + action.dy);
      }
    } else if (action.type === "zoom") {
      stepMicropolisZoom(action.direction);
    } else if (action.type === "close-panel" && micropolisState.panel && micropolisState.panel !== "budget") {
      handleMicropolisPanelClick({ target: micropolisPanelElement().querySelector("[data-micropolis-panel-close]") || micropolisPanelElement() });
    }
  }

  function handleMicropolisPanelChange(event) {
    if (event.target.matches("[data-micropolis-option]")) {
      applyMicropolisOption(event.target.dataset.micropolisOption, event.target.checked);
      return;
    }
    if (event.target.matches("[data-micropolis-graph-range]")) {
      micropolisState.graphRange = event.target.value;
      renderMicropolisGraph();
      return;
    }
    if (event.target.matches("[data-micropolis-graph-series]")) {
      const panel = micropolisPanelElement();
      micropolisState.graphSeries = [...panel.querySelectorAll("[data-micropolis-graph-series]:checked")].map((input) => input.value);
      renderMicropolisGraph();
    }
  }

  // --- data overlays (Maps) ----------------------------------------------------

  function micropolisViews() {
    return window.AISystem6MicropolisViews || null;
  }

  function micropolisOverlayCanvas() {
    return micropolisWindow()?.querySelector("[data-micropolis-overlay]") || null;
  }

  function setMicropolisOverlay(kind) {
    const views = micropolisViews();
    micropolisState.overlay = views && views.OVERLAY_KINDS.includes(kind) ? kind : "";
    const overlay = micropolisOverlayCanvas();
    if (overlay && !micropolisState.overlay) {
      overlay.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
    }
    if (micropolisState.panel === "maps") renderMicropolisMapsPanel();
    paintMicropolisOverlay();
  }

  // Paints the active view over the visible tiles. The overlay canvas is
  // sized in CSS pixels of the zoom layer (one backing pixel per CSS pixel:
  // translucent fills need no HD store) and tracks the engine's tile origin.
  function paintMicropolisOverlay() {
    const { canvas, sim } = micropolisState;
    const overlay = micropolisOverlayCanvas();
    const views = micropolisViews();
    if (!overlay || !views || !canvas || !canvas.ready || !sim || !micropolisState.overlay) return;
    const layer = overlay.parentNode;
    const width = Math.max(16, layer.clientWidth);
    const height = Math.max(16, layer.clientHeight);
    if (overlay.width !== width) overlay.width = width;
    if (overlay.height !== height) overlay.height = height;
    const context = overlay.getContext("2d");
    if (!context) return;
    const tilePx = micropolisCssTileWidth();
    const origin = canvas.getTileOrigin();
    views.drawOverlay(context, sim, micropolisState.overlay, {
      originX: origin.x,
      originY: origin.y,
      tilesX: Math.ceil(width / tilePx),
      tilesY: Math.ceil(height / tilePx),
      tilePx,
    });
  }

  const MICROPOLIS_MINIMAP_SCALE = 2;

  function renderMicropolisMapsPanel() {
    const panel = micropolisPanelElement();
    const views = micropolisViews();
    if (!panel || !views) return;
    const kinds = ["", ...views.OVERLAY_KINDS];
    const buttons = kinds.map((kind) => {
      const selected = kind === micropolisState.overlay;
      const key = kind ? `micropolis_overlay_${kind.replace(/([A-Z])/g, "_$1").toLowerCase()}` : "micropolis_overlay_none";
      return `<button type="button" class="btn micropolis-map-kind${selected ? " is-selected" : ""}" data-micropolis-overlay-kind="${kind}" aria-pressed="${selected}">${t(key)}</button>`;
    }).join("");
    panel.innerHTML = micropolisPanelShell("micropolis_maps_head", `
      <canvas class="micropolis-minimap" data-micropolis-minimap width="${MICROPOLIS_MAP_WIDTH * MICROPOLIS_MINIMAP_SCALE}" height="${MICROPOLIS_MAP_HEIGHT * MICROPOLIS_MINIMAP_SCALE}" role="img" aria-label="${t("micropolis_minimap_label")}"></canvas>
      <div class="micropolis-map-kinds">${buttons}</div>
    `);
    renderMicropolisMiniMap();
  }

  function renderMicropolisMiniMap() {
    const minimap = micropolisWindow()?.querySelector("[data-micropolis-minimap]");
    const views = micropolisViews();
    const { sim, canvas } = micropolisState;
    if (!minimap || !views || !sim) return;
    const context = minimap.getContext("2d");
    if (!context) return;
    views.drawMiniMap(context, sim, micropolisState.overlay, MICROPOLIS_MINIMAP_SCALE, micropolisTileKind);
    if (canvas && canvas.ready) {
      const ink = getComputedStyle(minimap).color || "#000";
      views.drawMiniMapFrame(context, canvas.getTileOrigin(), canvas._wholeTilesInViewX, canvas._wholeTilesInViewY, MICROPOLIS_MINIMAP_SCALE, ink);
    }
  }

  // A tap on the city map scrolls the main view there.
  function centreMicropolisOnMiniMap(event) {
    const minimap = event.currentTarget || event.target;
    const canvas = micropolisState.canvas;
    if (!canvas || !canvas.ready) return;
    const rect = minimap.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * MICROPOLIS_MAP_WIDTH);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * MICROPOLIS_MAP_HEIGHT);
    canvas.centreOn(x, y);
    renderMicropolisMiniMap();
    paintMicropolisOverlay();
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
      if (event.target.closest("[data-micropolis-rci-panel-button]")) {
        if (micropolisState.sim) openMicropolisPanel("evaluation");
        return;
      }
      const button = event.target.closest("[data-micropolis-tool]");
      if (!button) return;
      micropolisState.toolId = button.dataset.micropolisTool;
      setMicropolisStatus("micropolis_status_ready");
      renderMicropolisToolbar();
    });

    win.querySelector("[data-micropolis-panel]")?.addEventListener("click", handleMicropolisPanelClick);
    win.querySelector("[data-micropolis-panel]")?.addEventListener("change", handleMicropolisPanelChange);
    win.addEventListener("keydown", handleMicropolisKeyDown);
    win.querySelector("[data-micropolis-cty-input]")?.addEventListener("change", handleMicropolisCtyInput);
    win.querySelector("[data-micropolis-rci-button]")?.addEventListener("click", () => {
      if (micropolisState.sim) openMicropolisPanel("evaluation");
    });
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

  // Pointer math runs in CSS pixels: one logical tile is 16 CSS px whatever
  // the tile set's HD scale, because the backing store carries the scale.
  function micropolisCssTileWidth() {
    const tileSet = micropolisState.tileSet;
    return tileSet ? tileSet.tileWidth / (tileSet.scale || 1) : 16;
  }

  function micropolisTileFromEvent(event) {
    const canvas = micropolisState.canvas;
    if (!canvas || !canvas.ready) return null;
    const rect = canvas._canvas.getBoundingClientRect();
    const zoom = micropolisState.zoom || 1;
    return canvas.canvasCoordinateToTileCoordinate((event.clientX - rect.left) / zoom, (event.clientY - rect.top) / zoom);
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
      checkMicropolisPinch();
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
    micropolisState.pinchStartDistance = micropolisPointerDistance();
  }

  // Two fingers moving apart or together past the threshold step the zoom.
  function checkMicropolisPinch() {
    if (micropolisState.pointers.size !== 2 || !micropolisState.pinchStartDistance) return;
    const distance = micropolisPointerDistance();
    const direction = micropolisPinchDirection(distance / micropolisState.pinchStartDistance);
    if (!direction) return;
    stepMicropolisZoom(direction);
    micropolisState.pinchStartDistance = distance;
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
    const tileWidth = micropolisScreenTileWidth();
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
    const tileWidth = micropolisScreenTileWidth();
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
    if (micropolisState.toolId === "query") {
      // The query tool looks; it never spends. A drag does not re-query.
      if (!options.draggedOnly) openMicropolisQuery(tileX, tileY);
      return;
    }
    const tool = tools[micropolisState.toolId];
    if (!tool) return;
    if (options.draggedOnly && !tool.isDraggable) return;
    tool.doTool(tileX, tileY, sim.blockMaps);
    tool.modifyIfEnoughFunding(sim.budget);
    if (tool.result === tool.TOOLRESULT_NEEDS_BULLDOZE) {
      setMicropolisStatus("micropolis_status_needs_bulldoze");
      if (!options.draggedOnly) playMicropolisSfx("reject");
    } else if (tool.result === tool.TOOLRESULT_NO_MONEY) {
      setMicropolisStatus("micropolis_status_no_money");
      if (!options.draggedOnly) playMicropolisSfx("reject");
    } else if (tool.result === tool.TOOLRESULT_OK) {
      micropolisState.dirty = true;
      setMicropolisStatus("micropolis_status_ready");
      playMicropolisSfx(micropolisState.toolId === "bulldozer" ? "bulldoze" : "build");
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
      terrainSeed: micropolisState.terrainSeed,
      autoBulldoze: micropolisAutoBulldoze(),
      scenario: micropolisState.scenario ? { ...micropolisState.scenario, fired: [...micropolisState.scenario.fired] } : null,
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
      micropolisState.terrainSeed = Number(record.terrainSeed) || 0;
      if (typeof record.autoBulldoze === "boolean") engine.BaseTool?.setAutoBulldoze?.(record.autoBulldoze);
      micropolisState.scenario = record.scenario && typeof record.scenario.id === "string"
        ? { id: record.scenario.id, startTime: Number(record.scenario.startTime) || 0, fired: Array.isArray(record.scenario.fired) ? record.scenario.fired.slice() : [], result: String(record.scenario.result || "") }
        : null;
      if (micropolisState.scenario) {
        const scenario = micropolisScenarios()?.scenarioById(micropolisState.scenario.id);
        if (scenario) sim._startingYear = scenario.year;
      }
      micropolisState.dirty = false;
      closeMicropolisPanel();
      setMicropolisStatus("micropolis_status_loaded");
      if (typeof updateMenuState === "function") updateMenuState();
    });
  }

  async function deleteMicropolisCity(id) {
    // danger without defaultAction was the one place this pairing was
    // dropped (bonsai-city.js, documents-chat.js, chat-messages.js all keep
    // Cancel as the default next to danger:true) — now that the confirm's
    // Enter reaches its real default button, an unpaired danger dialog would
    // delete the city on a bare Enter.
    const confirmed = await showSystemModal(t("micropolis_delete_city_confirm"), "confirm", { defaultAction: "cancel", danger: true });
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
    else if (kind === "query") renderMicropolisQueryPanel();
    else if (kind === "maps") renderMicropolisMapsPanel();
    else if (kind === "graphs") renderMicropolisGraphsPanel();
    else if (kind === "new-city") renderMicropolisNewCityPanel();
    else if (kind === "notices") renderMicropolisNoticesPanel();
    else if (kind === "scenario") renderMicropolisScenarioPanel();
    else if (kind === "cty-report") renderMicropolisCtyReport();
    else if (kind === "options") renderMicropolisOptionsPanel();
  }

  // --- query tool --------------------------------------------------------------
  //
  // The classic query shows what one tile is and how the neighbourhood
  // scores. Tile families are engine ranges (tileValues); neighbourhood
  // scores come straight from the block maps the simulation already keeps.

  // [firstTile, lastTile, kind] in ascending order; the first match wins.
  function micropolisTileFamilies() {
    const TV = micropolisEngine().TileValues;
    return [
      [TV.DIRT, TV.DIRT, "dirt"],
      [TV.RIVER, TV.LASTRIVEDGE, "water"],
      [TV.TREEBASE, TV.WOODS5, "trees"],
      [TV.RUBBLE, TV.LASTRUBBLE, "rubble"],
      [TV.FLOOD, TV.LASTFLOOD, "flood"],
      [TV.RADTILE, TV.RADTILE, "radioactive"],
      [TV.FIREBASE, TV.LASTFIRE, "fire"],
      [TV.ROADBASE, TV.BRWXXX7, "road"],
      [TV.POWERBASE, TV.LASTPOWER, "wire"],
      [TV.RAILBASE, TV.LASTRAIL, "rail"],
      [TV.RESBASE, TV.HOSPITALBASE - 1, "residential"],
      [TV.HOSPITALBASE, TV.CHURCHBASE - 1, "hospital"],
      [TV.CHURCHBASE, TV.COMBASE - 1, "church"],
      [TV.COMBASE, TV.INDBASE - 1, "commercial"],
      [TV.INDBASE, TV.PORTBASE - 1, "industrial"],
      [TV.PORTBASE, TV.LASTPORT, "port"],
      [TV.AIRPORTBASE, TV.COALBASE - 1, "airport"],
      [TV.COALBASE, TV.LASTPOWERPLANT, "coal"],
      [TV.FIRESTBASE, TV.POLICESTBASE - 1, "fire_station"],
      [TV.POLICESTBASE, TV.STADIUMBASE - 1, "police_station"],
      [TV.STADIUMBASE, TV.NUCLEARBASE - 1, "stadium"],
      [TV.NUCLEARBASE, TV.LASTZONE, "nuclear"],
      [TV.FOUNTAIN, TV.FOUNTAIN, "park"],
      [TV.SMOKEBASE, TV.TINYEXP - 1, "industrial"],
      [TV.COALSMOKE1, TV.COALSMOKE1 + 15, "coal"],
      [TV.FOOTBALLGAME1, TV.FOOTBALLGAME1 + 15, "stadium"],
    ];
  }

  function micropolisTileKind(tileValue) {
    const family = micropolisTileFamilies().find(([first, last]) => tileValue >= first && tileValue <= last);
    return family ? family[2] : "other";
  }

  // Four-step scale the classic query used: none / low / medium / high.
  function micropolisLevel(value, steps) {
    if (value <= steps[0]) return "none";
    if (value <= steps[1]) return "low";
    if (value <= steps[2]) return "medium";
    return "high";
  }

  function micropolisGrowthLevel(value) {
    if (value <= -8) return "declining";
    if (value >= 64) return "booming";
    if (value >= 8) return "growing";
    return "steady";
  }

  // Pure over an engine Simulation: everything the query panel prints.
  function describeMicropolisTile(sim, x, y) {
    const map = sim && sim._map;
    if (!map || !map.testBounds(x, y)) return null;
    const tile = map.getTile(x, y);
    const value = tile.getValue();
    const kind = micropolisTileKind(value);
    const maps = sim.blockMaps;
    const density = maps.populationDensityMap.worldGet(x, y);
    const landValue = maps.landValueMap.worldGet(x, y);
    const crime = maps.crimeRateMap.worldGet(x, y);
    const pollution = maps.pollutionDensityMap.worldGet(x, y);
    const traffic = maps.trafficDensityMap.worldGet(x, y);
    const growth = maps.rateOfGrowthMap.worldGet(x, y);
    const conducts = tile.isConductive() || tile.isZone();
    return {
      x,
      y,
      tileValue: value,
      kind,
      kindKey: `micropolis_query_kind_${kind}`,
      zoneCentre: tile.isZone(),
      power: conducts ? (tile.isPowered() ? "powered" : "unpowered") : "none",
      density,
      landValue,
      crime,
      pollution,
      traffic,
      growth,
      levels: {
        density: micropolisLevel(density, [0, 96, 256]),
        landValue: micropolisLevel(landValue, [0, 40, 120]),
        crime: micropolisLevel(crime, [0, 40, 120]),
        pollution: micropolisLevel(pollution, [0, 40, 120]),
        traffic: micropolisLevel(traffic, [0, 40, 120]),
        growth: micropolisGrowthLevel(growth),
      },
    };
  }

  function openMicropolisQuery(tileX, tileY) {
    const info = describeMicropolisTile(micropolisState.sim, tileX, tileY);
    if (!info) return;
    micropolisState.query = info;
    openMicropolisPanel("query");
  }

  function renderMicropolisQueryPanel() {
    const panel = micropolisPanelElement();
    const info = micropolisState.query;
    if (!panel || !info) return;
    const row = (labelKey, levelKey, raw) => `<div class="micropolis-panel-row"><span>${t(labelKey)}</span>
        <strong>${t(`micropolis_query_level_${levelKey}`)} <span class="micropolis-query-raw">${raw}</span></strong></div>`;
    panel.innerHTML = micropolisPanelShell("micropolis_query_head", `
      <div class="micropolis-panel-row"><span>${t("micropolis_query_position")}</span><strong>${info.x}, ${info.y}</strong></div>
      <div class="micropolis-panel-row"><span>${t("micropolis_query_kind")}</span><strong>${t(info.kindKey)}${info.zoneCentre ? ` · ${t("micropolis_query_zone_centre")}` : ""}</strong></div>
      <div class="micropolis-panel-row"><span>${t("micropolis_query_power")}</span><strong>${t(`micropolis_query_power_${info.power}`)}</strong></div>
      ${row("micropolis_query_density", info.levels.density, info.density)}
      ${row("micropolis_query_land_value", info.levels.landValue, info.landValue)}
      ${row("micropolis_query_crime", info.levels.crime, info.crime)}
      ${row("micropolis_query_pollution", info.levels.pollution, info.pollution)}
      ${row("micropolis_query_traffic", info.levels.traffic, info.traffic)}
      ${row("micropolis_query_growth", info.levels.growth, info.growth)}
    `);
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
          <button type="button" class="btn" data-micropolis-city-bonsai="${record.id}">${t("micropolis_city_open_in_bonsai")}</button>
          <button type="button" class="btn" data-micropolis-city-delete="${record.id}">${t("micropolis_city_delete")}</button>
        </div>`).join("");
      panel.innerHTML = micropolisPanelShell("micropolis_cities_title",
        rows || `<p class="micropolis-panel-note">${t("micropolis_cities_empty")}</p>`);
    });
  }

  function handleMicropolisPanelClick(event) {
    if (event.target.closest("[data-micropolis-panel-close]")) {
      const wasMandatory = micropolisState.mandatoryBudget;
      const wasNewCity = micropolisState.panel === "new-city";
      closeMicropolisPanel();
      if (wasNewCity) cancelMicropolisNewCity();
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
    if (event.target.closest("[data-micropolis-new-regenerate]")) {
      regenerateMicropolisNewCity(randomMicropolisSeed());
      return;
    }
    if (event.target.closest("[data-micropolis-new-start]")) {
      startMicropolisNewCity();
      return;
    }
    const openButton = event.target.closest("[data-micropolis-city-open]");
    if (openButton) {
      loadMicropolisCity(openButton.dataset.micropolisCityOpen);
      return;
    }
    const overlayButton = event.target.closest("[data-micropolis-overlay-kind]");
    if (overlayButton) {
      setMicropolisOverlay(overlayButton.dataset.micropolisOverlayKind);
      return;
    }
    if (event.target.closest("[data-micropolis-minimap]")) {
      centreMicropolisOnMiniMap({ currentTarget: event.target.closest("[data-micropolis-minimap]"), clientX: event.clientX, clientY: event.clientY });
      return;
    }
    const bonsaiButton = event.target.closest("[data-micropolis-city-bonsai]");
    if (bonsaiButton) {
      openMicropolisRecordInBonsai(bonsaiButton.dataset.micropolisCityBonsai);
      return;
    }
    const deleteButton = event.target.closest("[data-micropolis-city-delete]");
    if (deleteButton) deleteMicropolisCity(deleteButton.dataset.micropolisCityDelete);
  }

  // --- commands / public API -------------------------------------------------

  function micropolisSpeedValues() {
    const engine = micropolisEngine();
    if (!engine) return null;
    return {
      slow: engine.Simulation.SPEED_SLOW,
      med: engine.Simulation.SPEED_MED,
      fast: engine.Simulation.SPEED_FAST,
    };
  }

  // The Speed menu is a set of three alternatives, and only one of them is in
  // force. Without this the menu named the three speeds and marked none of
  // them, so choosing Medium after Fast changed the simulation and told the
  // player nothing: the status line reads "Ready" for all three.
  function currentMicropolisSpeedName() {
    const speeds = micropolisSpeedValues();
    if (!speeds || !micropolisState.sim) return "";
    return Object.keys(speeds).find((name) => speeds[name] === micropolisState.speed) || "";
  }

  function setMicropolisSpeed(speedName) {
    const engine = micropolisEngine();
    const sim = micropolisState.sim;
    if (!engine || !sim) return;
    const speed = micropolisSpeedValues()?.[speedName];
    if (typeof speed !== "number") return;
    micropolisState.speed = speed;
    sim.setSpeed(speed);
    setMicropolisStatus("micropolis_status_ready");
    startMicropolisLoop();
    if (typeof updateMenuState === "function") updateMenuState();
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

  // Upstream engine bug, confirmed against graememcc/micropolisJS itself (not
  // just this vendored bundle): DisasterManager.prototype.makeEarthquake
  // calls this.doEarthquake(strength) as its first line, but doEarthquake is
  // never defined anywhere in that project — a `git grep doEarthquake` on the
  // upstream repo turns up only this one call site. The actual earthquake
  // effect (the rubble/fire tile loop) lives entirely in makeEarthquake
  // itself, after this dead call, so the shim below only needs to absorb the
  // missing hook, not reimplement the disaster. Patched here, once per sim
  // instance, rather than in app/vendor/micropolis/micropolis-engine.js —
  // that file is vendored GPL source and is not ours to edit.
  function ensureMicropolisEarthquakeShim(sim) {
    const disasterManager = sim && sim.disasterManager;
    if (disasterManager && typeof disasterManager.doEarthquake !== "function") {
      disasterManager.doEarthquake = () => {};
    }
  }

  // Mirrors the same scan DisasterManager.prototype.makeMeltdown runs
  // upstream (see engine.js: a plain width/height loop for a NUCLEAR tile).
  // Reading it here first lets a city with no power plant get an honest
  // status line instead of the menu command silently doing nothing — a
  // meltdown control is always enabled, so without this check it looks able
  // and produces no observable effect (CLAUDE.md "System Integrity
  // guardrails": a control must never do that).
  function micropolisHasNuclearPlant(sim) {
    const engine = micropolisEngine();
    const map = sim && sim._map;
    const nuclearTile = engine && engine.TileValues && engine.TileValues.NUCLEAR;
    if (!map || typeof nuclearTile !== "number") return false;
    for (let x = 0; x < map.width - 1; x += 1) {
      for (let y = 0; y < map.height - 1; y += 1) {
        if (map.getTileValue(x, y) === nuclearTile) return true;
      }
    }
    return false;
  }

  const MICROPOLIS_DISASTERS = Object.freeze({
    fire: (sim) => sim.disasterManager.makeFire(),
    flood: (sim) => sim.disasterManager.makeFlood(),
    earthquake: (sim) => {
      ensureMicropolisEarthquakeShim(sim);
      sim.disasterManager.makeEarthquake();
    },
    meltdown: (sim) => {
      if (!micropolisHasNuclearPlant(sim)) {
        setMicropolisStatus("micropolis_status_no_nuclear_plant");
        return;
      }
      sim.disasterManager.makeMeltdown();
    },
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
      closeMicropolisPanel();
      openMicropolisNewCity();
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
    if (command === "maps") {
      openMicropolisPanel("maps");
      return;
    }
    if (command === "graphs") {
      openMicropolisPanel("graphs");
      return;
    }
    if (command === "notices") {
      openMicropolisPanel("notices");
      return;
    }
    if (command === "scenario") {
      openMicropolisPanel("scenario");
      return;
    }
    if (command === "import-cty") {
      if (micropolisState.dirty) {
        const confirmed = await showSystemModal(t("micropolis_new_city_confirm"), "confirm");
        if (confirmed !== "yes" && confirmed !== "ok") return;
      }
      micropolisWindow()?.querySelector("[data-micropolis-cty-input]")?.click();
      return;
    }
    if (command === "export-cty") {
      exportMicropolisCty();
      return;
    }
    if (command.startsWith("scenario-")) {
      if (micropolisState.dirty) {
        const confirmed = await showSystemModal(t("micropolis_new_city_confirm"), "confirm");
        if (confirmed !== "yes" && confirmed !== "ok") return;
      }
      startMicropolisScenario(command.slice("scenario-".length));
      return;
    }
    if (command === "zoom-in" || command === "zoom-out") {
      stepMicropolisZoom(command === "zoom-in" ? 1 : -1);
      return;
    }
    if (command === "options") {
      openMicropolisPanel("options");
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
    // The check mark is what tells the player which of the three speeds is
    // running; window-manager.js reads this dataset key in updateMenuState().
    const speedItem = (name, labelKey) => ({
      ...item(`speed-${name}`, labelKey),
      dataset: { micropolisSpeed: name },
    });
    const separator = { type: "separator" };
    const disasters = ["fire", "flood", "tornado", "earthquake", "monster", "crash", "meltdown"];
    const scenarioIds = ["quietwater", "faultline", "ashford", "gridlock", "marrowbay", "harbourheights", "riverbend", "smokestack"];
    window.AISystem6RegisterApplicationMenuSet?.("micropolis", [
      {
        id: "file",
        labelKey: "menu_file",
        items: [
          item("new-city", "micropolis_new_city"),
          item("save-city", "micropolis_save_city"),
          item("open-city", "micropolis_open_city"),
          separator,
          item("import-cty", "micropolis_import_cty"),
          item("export-cty", "micropolis_export_cty"),
          separator,
          {
            type: "submenu",
            labelKey: "micropolis_menu_scenarios",
            items: scenarioIds.map((id) => item(`scenario-${id}`, `micropolis_scenario_${id}_name`)),
          },
          { type: "item", action: "close-active-window", labelKey: "close", shortcutId: "close-window", conditionId: "close-active-window" },
        ],
      },
      {
        id: "city",
        labelKey: "micropolis_menu_city",
        items: [
          item("budget", "micropolis_budget_title"),
          item("evaluation", "micropolis_evaluation_title"),
          item("options", "micropolis_options_title"),
          separator,
          {
            type: "submenu",
            labelKey: "micropolis_menu_disasters",
            items: disasters.map((name) => item(`disaster-${name}`, `micropolis_disaster_${name}`)),
          },
        ],
      },
      {
        id: "view",
        labelKey: "micropolis_menu_view",
        items: [
          item("maps", "micropolis_maps_title"),
          item("graphs", "micropolis_graphs_title"),
          item("notices", "micropolis_notices_title"),
          item("scenario", "micropolis_scenario_title"),
          separator,
          item("zoom-in", "micropolis_zoom_in"),
          item("zoom-out", "micropolis_zoom_out"),
        ],
      },
      {
        id: "speed",
        labelKey: "micropolis_menu_speed",
        items: [
          item("pause", "micropolis_pause"),
          separator,
          speedItem("slow", "micropolis_speed_slow"),
          speedItem("med", "micropolis_speed_med"),
          speedItem("fast", "micropolis_speed_fast"),
        ],
      },
    ]);

    const alwaysAvailable = new Set(["new-city", "open-city", "import-cty", ...scenarioIds.map((id) => `scenario-${id}`)]);
    const commands = [
      "new-city", "save-city", "open-city", "import-cty", "export-cty", "budget", "evaluation", "options", "maps", "graphs", "notices", "scenario", "zoom-in", "zoom-out",
      ...scenarioIds.map((id) => `scenario-${id}`),
      ...disasters.map((name) => `disaster-${name}`),
      "pause", "speed-slow", "speed-med", "speed-fast",
    ];
    commands.forEach((command) => {
      window.AISystem6Runtime?.registerCommand?.(`micropolis-${command}`, {
        handler: () => runMicropolisMenuCommand(command),
        isAvailable: () => {
          const activeWindow = document.querySelector(".window.is-active");
          if (activeWindow?.dataset.window !== "micropolis") return false;
          return alwaysAvailable.has(command) || !!micropolisState.sim;
        },
      });
    });
  }

  registerMicropolisDesktopCommands();

  // The engine is plain JS on one rAF loop, so suspending is exactly stopping
  // that loop — the Simulation object keeps every tile. A city the player
  // already named is written back on the way out; an unnamed city is not,
  // because inventing a save record (or raising a name dialog while the app
  // goes to the background) is not something a suspend may decide.
  window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.("micropolis", {
    onSuspend: async () => {
      window.AISystem6WebPlatform?.releaseScreenWakeLock?.("micropolis");
      stopMicropolisLoop();
      cancelMicropolisPendingTouchTool();
      micropolisState.pointers.clear();
      micropolisState.panning = false;
      if (micropolisState.sim && micropolisState.cityId && micropolisState.dirty) {
        await saveMicropolisCity();
      }
    },
    onResume: () => {
      if (!micropolisWindowVisible()) return;
      // Resume the running city; only a window that never had one starts a
      // city here, and that path is the same one attach() uses.
      if (micropolisState.sim) startMicropolisLoop();
      else if (!micropolisState.starting) startMicropolisCity();
      window.AISystem6WebPlatform?.holdScreenWakeLock?.("micropolis");
    },
    onDispose: () => {
      window.AISystem6WebPlatform?.releaseScreenWakeLock?.("micropolis");
      stopMicropolisLoop();
      micropolisState.audio?.dispose();
      micropolisState.audio = null;
    },
  });

  window.AISystem6Micropolis = Object.freeze({
    open: openMicropolis,
    attach: attachMicropolis,
    render: renderMicropolis,
    runMenuCommand: runMicropolisMenuCommand,
    hasCity: () => !!micropolisState.sim,
    isPaused: () => !!micropolisState.sim && micropolisState.sim.isPaused(),
    currentSpeedName: currentMicropolisSpeedName,
    isDirty: () => micropolisState.dirty,
    serializeCity: serializeMicropolisCity,
    deserializeSaveData: deserializeMicropolisSaveData,
    describeTile: describeMicropolisTile,
    tileKind: micropolisTileKind,
    rciBars: micropolisRciBars,
    setOverlay: setMicropolisOverlay,
    currentOverlay: () => micropolisState.overlay,
    generateSeededMap: generateMicropolisSeededMap,
    keyAction: micropolisKeyAction,
    zoomLevels: MICROPOLIS_ZOOM_LEVELS,
    nextZoom: micropolisNextZoom,
    pinchDirection: micropolisPinchDirection,
    setZoom: setMicropolisZoom,
    currentZoom: () => micropolisState.zoom,
    keyTools: MICROPOLIS_KEY_TOOLS,
    recordNotice: recordMicropolisNotice,
    notices: () => micropolisState.notices.slice(),
    autoBulldoze: micropolisAutoBulldoze,
    startScenario: startMicropolisScenario,
    importCtyBytes: importMicropolisCtyBytes,
    exportCty: exportMicropolisCty,
    openRecordInBonsai: openMicropolisRecordInBonsai,
    currentScenario: () => (micropolisState.scenario ? { ...micropolisState.scenario } : null),
    scenarioIds: () => ["quietwater", "faultline", "ashford", "gridlock", "marrowbay", "harbourheights", "riverbend", "smokestack"],
    setSoundEnabled: (enabled) => applyMicropolisOption("sound", enabled),
    isSoundEnabled: () => micropolisState.soundEnabled,
    setAutoBulldoze: setMicropolisAutoBulldoze,
    levelFunds: MICROPOLIS_LEVEL_FUNDS,
    levelNames: MICROPOLIS_LEVEL_NAMES,
    messageKeys: MICROPOLIS_MESSAGE_KEYS,
    classKeys: MICROPOLIS_CLASS_KEYS,
    problemKeys: MICROPOLIS_PROBLEM_KEYS,
    toolIds: MICROPOLIS_TOOLS.map((tool) => tool.id),
  });
  window.AISystem6Runtime?.registerApplication({id:"micropolis",windowName:"micropolis",mount:attachMicropolis,restore:attachMicropolis,commands:{"open-micropolis":{handler:()=>openMicropolis(),isAvailable:()=>!0}}});
})();
