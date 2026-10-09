// Bonsai City System 6 shell / 盆景城市 System 6 外壳.
//
// The shell owns lifecycle, pacing, input, i18n and durable receipts. The
// headless simulation owns every city fact; the Canvas renderer owns every
// map pixel. View state never enters a city save.
window.AISystem6BonsaiCityLoaded = true;

(function initBonsaiCity() {
  "use strict";

  if (window.AISystem6BonsaiCity) return;

  // The base language tables are lazy and can replace the global objects
  // after Bonsai's own translations merged in, which would leave raw keys on
  // screen. Resolve through the global t first, then fall back to Bonsai's
  // frozen snapshot so this window's copy never shows untranslated keys.
  const baseT = typeof window.t === "function" ? window.t : (key) => key;
  function t(key, ...args) {
    const direct = baseT(key, ...args);
    if (direct !== key) return direct;
    const table = window.AISystem6BonsaiTranslations || {};
    const lang = typeof currentLanguage === "string" ? currentLanguage : "en";
    const localeTable = table[lang] || table.en || {};
    const fallback = localeTable[key];
    return typeof fallback === "function" ? fallback(...args) : (fallback ?? direct);
  }

  const WINDOW_NAME = "bonsaiCity";
  const APP_ID = "bonsaiCity";
  const FRAME_MS = 50;
  const MAX_HISTORY = 100;
  const AUTOSAVE_DELAY_MS = 300;
  // The Micropolis touch shape (pendingTouchTool): a short grace delay before
  // the first commit lets a second finger arrive and become a pinch, and a
  // movement slop turns a finger that starts moving into a drag-draw. The
  // constants are tuned for this game's 20 Hz tick and 40px rail cells.
  const BONSAI_TOUCH_TOOL_DELAY_MS = 150;
  // Holding past this without moving or lifting queries the tile instead of
  // building (M3): inspection without disarming.
  const BONSAI_TOUCH_LONG_PRESS_MS = 450;
  const BONSAI_TOUCH_TOOL_SLOP_PX = 10;
  const MAP_LAYERS = Object.freeze([
    "terrain", "infrastructure", "buildings", "agents", "feedback", "lighting",
  ]);
  const SPEEDS = Object.freeze([
    { id: "pause", value: 0, glyph: "⏸" },
    { id: "slow", value: 0.25, glyph: "▸" },
    { id: "normal", value: 1, glyph: "▸▸" },
    { id: "fast", value: 4, glyph: "▸▸▸" },
  ]);
  const TERRAIN_PRESETS = Object.freeze(["balanced", "river", "lake", "coast"]);
  const OVERLAYS = Object.freeze([
    "none", "power", "water", "traffic", "pollution", "land-value",
    "police", "fire", "education", "health", "transit",
  ]);
  const GOALS = Object.freeze([
    { id: "road", tool: "road" },
    { id: "power", tools: ["coal", "wind"] },
    { id: "wire", tool: "wire" },
    { id: "zone", tools: ["residential-light", "commercial-light", "industrial-light"] },
    { id: "run", run: true },
  ]);
  // The pot calendar's month-to-season table, read by the render snapshot and
  // by the hand-over stamp so both name the same season for the same month.
  const BONSAI_SEASON_OF_MONTH = Object.freeze([3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3]);
  // While ClioTalk is reading, working or waiting the city holds its breath,
  // exactly as Rootline holds its own (rootline.js BUSY).
  const BONSAI_ASSISTANT_BUSY = Object.freeze(["reading", "working", "waiting"]);
  // The Neighbours window names a rim side; the shared namer wants its letter.
  const BONSAI_RIM_DIRECTIONS = Object.freeze({ north: "n", east: "e", south: "s", west: "w" });
  const TOOL_GROUPS = Object.freeze([
    {
      id: "terrain",
      tools: [
        { id: "raise", icon: "+", shortcut: "1", gesture: "area", command: "terraform-area", mode: "raise" },
        { id: "lower", icon: "−", shortcut: "2", gesture: "area", command: "terraform-area", mode: "lower" },
        { id: "level", icon: "=", shortcut: "3", gesture: "area", command: "terraform-area", mode: "level" },
        { id: "tree", icon: "♣", shortcut: "4", gesture: "area", command: "terraform-area", mode: "tree" },
      ],
    },
    {
      id: "transport",
      tools: [
        { id: "road", icon: "━", shortcut: "R", gesture: "path", command: "build-path", network: "road" },
        { id: "highway", icon: "═", shortcut: "E", gesture: "path", command: "build-path", network: "highway" },
        // 主干道 has no baked icon or glyph of its own yet: it borrows the
        // highway's two-rail mark, which reads as a road laid two tiles wide.
        { id: "avenue", icon: "═", description: "bonsai_tool_avenue_description", gesture: "path", command: "build-path", network: "avenue" },
        { id: "onramp", icon: "◢", gesture: "path", command: "build-path", network: "onramp" },
        { id: "rail", icon: "╫", shortcut: "Y", gesture: "path", command: "build-path", network: "rail" },
        { id: "station", icon: "S", shortcut: "S", gesture: "point", command: "place-facility", kind: "station" },
        { id: "subway", icon: "◎", gesture: "path", command: "build-path", network: "subway" },
        { id: "subway-station", icon: "▣", gesture: "point", command: "place-facility", kind: "subway-station" },
        { id: "bus", icon: "B", gesture: "point", command: "place-facility", kind: "bus" },
      ],
    },
    {
      id: "zones",
      tools: [
        { id: "residential-light", icon: "r", shortcut: "5", gesture: "area", command: "zone-area", zone: "residential", density: "low" },
        { id: "residential-high", icon: "R", shortcut: "6", gesture: "area", command: "zone-area", zone: "residential", density: "high" },
        { id: "commercial-light", icon: "c", shortcut: "7", gesture: "area", command: "zone-area", zone: "commercial", density: "low" },
        { id: "commercial-high", icon: "C", shortcut: "8", gesture: "area", command: "zone-area", zone: "commercial", density: "high" },
        { id: "industrial-light", icon: "i", shortcut: "9", gesture: "area", command: "zone-area", zone: "industrial", density: "low" },
        { id: "industrial-high", icon: "I", shortcut: "0", gesture: "area", command: "zone-area", zone: "industrial", density: "high" },
        { id: "seaport", icon: "⚓", gesture: "area", command: "zone-area", zone: "seaport" },
        { id: "airport", icon: "✈", gesture: "area", command: "zone-area", zone: "airport" },
        { id: "military", icon: "⚑", gesture: "area", command: "zone-area", zone: "military" },
      ],
    },
    {
      id: "rewards",
      tools: [
        { id: "mayors-house", icon: "⌂", gesture: "point", command: "place-facility", kind: "mayors-house" },
        { id: "city-hall", icon: "◫", gesture: "point", command: "place-facility", kind: "city-hall" },
        { id: "statue", icon: "♜", gesture: "point", command: "place-facility", kind: "statue" },
        { id: "dome", icon: "◍", gesture: "point", command: "place-facility", kind: "dome" },
        { id: "arco", icon: "▲", gesture: "point", command: "place-facility", kind: "arco" },
      ],
    },
    {
      id: "utilities",
      tools: [
        { id: "wire", icon: "⌁", shortcut: "W", gesture: "path", command: "build-path", network: "wire" },
        { id: "pipe", icon: "┄", shortcut: "P", gesture: "path", command: "build-path", network: "pipe" },
        { id: "coal", icon: "C", shortcut: "A", gesture: "point", command: "place-facility", kind: "coal" },
        { id: "hydro", icon: "H", gesture: "point", command: "place-facility", kind: "hydro" },
        { id: "oil", icon: "O", gesture: "point", command: "place-facility", kind: "oil" },
        { id: "gas", icon: "G", gesture: "point", command: "place-facility", kind: "gas" },
        { id: "nuclear", icon: "☢", gesture: "point", command: "place-facility", kind: "nuclear" },
        { id: "wind", icon: "✣", shortcut: "N", gesture: "point", command: "place-facility", kind: "wind" },
        { id: "solar", icon: "☀", gesture: "point", command: "place-facility", kind: "solar" },
        { id: "microwave", icon: "M", gesture: "point", command: "place-facility", kind: "microwave" },
        { id: "fusion", icon: "F", gesture: "point", command: "place-facility", kind: "fusion" },
        { id: "pump", icon: "P", shortcut: "U", gesture: "point", command: "place-facility", kind: "pump" },
        { id: "water-tower", icon: "T", shortcut: "O", gesture: "point", command: "place-facility", kind: "water-tower" },
        { id: "treatment", icon: "≋", gesture: "point", command: "place-facility", kind: "treatment" },
        { id: "desal", icon: "◇", gesture: "point", command: "place-facility", kind: "desal" },
      ],
    },
    {
      id: "services",
      tools: [
        { id: "police", icon: "★", shortcut: "K", gesture: "point", command: "place-facility", kind: "police" },
        { id: "fire", icon: "F", shortcut: "F", gesture: "point", command: "place-facility", kind: "fire" },
        { id: "education", icon: "E", shortcut: "J", gesture: "point", command: "place-facility", kind: "school" },
        { id: "healthcare", icon: "+", shortcut: "H", gesture: "point", command: "place-facility", kind: "clinic" },
        { id: "hospital", icon: "✚", gesture: "point", command: "place-facility", kind: "hospital" },
        { id: "university", icon: "U", gesture: "point", command: "place-facility", kind: "university" },
        { id: "library", icon: "L", gesture: "point", command: "place-facility", kind: "library" },
        { id: "museum", icon: "M", gesture: "point", command: "place-facility", kind: "museum" },
        { id: "prison", icon: "#", gesture: "point", command: "place-facility", kind: "prison" },
      ],
    },
    {
      id: "recreation",
      tools: [
        { id: "park", icon: "♠", shortcut: "G", gesture: "path", command: "build-path", network: "park" },
        { id: "park-big", icon: "♧", gesture: "point", command: "place-facility", kind: "park-big" },
        { id: "zoo", icon: "Z", gesture: "point", command: "place-facility", kind: "zoo" },
        { id: "stadium", icon: "◯", gesture: "point", command: "place-facility", kind: "stadium" },
        { id: "marina", icon: "⛵", gesture: "point", command: "place-facility", kind: "marina" },
      ],
    },
    {
      id: "inspect",
      tools: [
        { id: "query", icon: "?", shortcut: "/", gesture: "point", query: true },
        { id: "demolish", icon: "×", shortcut: "X", gesture: "area", command: "demolish-area" },
      ],
    },
  ]);
  // 手 (Pan) is a tool like any other: arming it makes one finger move the
  // map. It has no sub-palette of its own, so its rail cell arms it directly.
  const PAN_TOOL = Object.freeze({ id: "pan", icon: "手", gesture: "pan" });
  const TOOLS = new Map([
    ...TOOL_GROUPS.flatMap((group) => group.tools.map((tool) => [tool.id, tool])),
    [PAN_TOOL.id, PAN_TOOL],
  ]);
  const CATEGORY_BY_TOOL = new Map();
  TOOL_GROUPS.forEach((group) => group.tools.forEach((tool) => CATEGORY_BY_TOOL.set(tool.id, group.id)));
  CATEGORY_BY_TOOL.set("pan", "pan");
  // The rail order follows §3.4 — 地形 · 交通 · 区域 · 公用事业 · 公共服务 ·
  // 奖励 · 查询与拆除 · 手 — which is deliberately not the TOOL_GROUPS order.
  const RAIL_CATEGORIES = Object.freeze([
    { id: "terrain", labelKey: "bonsai_tool_group_terrain" },
    { id: "transport", labelKey: "bonsai_tool_group_transport" },
    { id: "zones", labelKey: "bonsai_tool_group_zones" },
    { id: "utilities", labelKey: "bonsai_tool_group_utilities" },
    { id: "services", labelKey: "bonsai_tool_group_services" },
    { id: "recreation", labelKey: "bonsai_tool_group_recreation" },
    { id: "rewards", labelKey: "bonsai_tool_group_rewards" },
    { id: "inspect", labelKey: "bonsai_tool_group_inspect" },
    { id: "pan", labelKey: "bonsai_tool_pan" },
  ]);
  const EVENT_KEYS = Object.freeze({
    "construction-started": "bonsai_event_construction_started",
    "building-completed": "bonsai_event_building_completed",
    "problem-changed": "bonsai_event_problem_changed",
    "budget-settled": "bonsai_event_budget_settled",
    "service-dispatched": "bonsai_event_service_dispatched",
    "history-cleared": "bonsai_history_cleared_simulation",
    // A disaster chosen from the menu used to show nothing in the status
    // line: the siren played, the flames drew, the words stayed "Ready".
    "disaster-started": "bonsai_event_disaster_started",
    "disaster-ended": "bonsai_event_disaster_ended",
    milestone: "bonsai_event_milestone",
    broke: "bonsai_event_broke",
    brownout: "bonsai_event_brownout",
  });

  const state = {
    current: null,
    record: null,
    setupPreview: null,
    // The real-place preview: the options key it was made for, the import
    // in flight, and the finished import.
    osm: null,
    setupOptions: null,
    playing: false,
    speed: 0,
    lastRunningSpeed: 1,
    // Down to the street the clock stops, and this remembers what it was so
    // the way back restores it exactly once (returnFromStreets, onResume).
    speedBeforeStreets: null,
    // ClioTalk's turn: while the assistant works the city pauses, and the
    // speed it held is restored unless the player chose a new one meanwhile.
    assistantPaused: false,
    speedBeforeAssistant: null,
    assistantSpeedUserChanged: false,
    assistantApplying: false,
    tickCarry: 0,
    tool: "road",
    dirty: false,
    saving: null,
    saveManager: null,
    writeBoundary: false,
    attached: false,
    rendererMounted: false,
    rendererBackend: "canvas-2d",
    audio: null,
    audioMode: "music",
    audioStarted: false,
    timer: null,
    autosaveTimer: null,
    lifecycleUnregister: null,
    cleanups: [],
    pointerCleanups: [],
    pointers: new Map(),
    gesture: null,
    multiTouch: null,
    spacePressed: false,
    previewReceipt: null,
    latestMessage: { key: "bonsai_status_ready", args: [] },
    firstHintTimer: null,
    // The minimap card is expanded by default on desktop/tablet and starts
    // collapsed on phones — portrait (≤560 wide) and landscape (≤480 tall) —
    // where it opens as a half-height sheet (M3 §3.5).
    minimapCollapsed: typeof window !== "undefined"
      ? window.innerWidth <= 560 || window.innerHeight <= 480
      : true,
    bonsaiMenuSetRegistered: false,
    category: "transport",
    paletteOpen: false,
    pendingTouchTool: null,
    lastPointer: null,
    demandHighlight: null,
    demandBlinkTimers: [],
    lastToolByCategory: new Map(TOOL_GROUPS.map((group) => [group.id, group.tools[0]?.id])),
    lastLandscape: typeof window !== "undefined" ? window.innerWidth > window.innerHeight : false,
    completedGoals: new Set(),
    fallbackUndo: [],
    fallbackRedo: [],
    clientSequence: 0,
    inspectorMode: "",
    // The region a city leaves by: which 120x100 window of a larger Bonsai map
    // becomes the classic map. Session state only, and only while the picker is
    // open -- the choice belongs to one departure, not to the city.
    micropolisDeparture: null,
    selectedTile: null,
    overlay: "none",
    // M4 display toggles: the four 选项 view switches (buildings /
    // infrastructure / zones / underground). Session state only — never part
    // of a city save.
    // Night and the seasons are shown only when asked for: SimCity 2000 has
    // neither, and a city that went dark every 7.5 seconds and repainted its
    // forest every 18 was harder to read than it was pretty.
    display: { buildings: true, infrastructure: true, zones: true, underground: false, night: false, seasons: false, miniature: true, tank: false, studyModel: "none" },
    // 自动预算 (auto-budget): off by default, as in the original game, so
    // January holds the clock with the budget pane open. Session state,
    // never part of a city save. yearEndHold marks that pause.
    autoBudget: false,
    yearEndHold: false,
    // Wall-clock stamp of the last confirmed write; the gauge bar says how
    // long ago, the way OpenTTD's status line reports its IDBFS sync.
    lastSavedAt: 0,
    // M4 graph panel view state: which range and which (up to three) series.
    graphRange: "halfYearly",
    graphSeries: ["residents", "commerce", "industry"],
    sessionRestore: null,
    restorePromise: null,
    counters: { intervals: 0, timeouts: 0, resizeObservers: 0, listeners: 0, activePointers: 0 },
  };
  state.lastToolByCategory.set("pan", "pan");

  const sim = () => window.AISystem6BonsaiSim;
  // One snapshot contract, two backends (phase 9): the voxel backend is
  // selected when chosen and installed; everything else stays Canvas 2D.
  const renderer = () => (state.rendererBackend === "three-voxel" && window.AISystem6BonsaiVoxelRenderer
    ? window.AISystem6BonsaiVoxelRenderer
    : window.AISystem6BonsaiCanvasRenderer);
  const bonsaiWindow = () => document.querySelector(`[data-window="${WINDOW_NAME}"]`);
  const query = (selector) => bonsaiWindow()?.querySelector(selector) || null;
  // A greyed city key carries one reason for the shared shell to read on tap.
  const markGray = (control, unavailable, reasonKey) => {
    if (!control) return;
    if (typeof markGrayAffordance === "function") {
      markGrayAffordance(control, unavailable, reasonKey);
      return;
    }
    control.disabled = !!unavailable;
    if (unavailable && reasonKey) control.dataset.balloonHelpDisabled = reasonKey;
    else delete control.dataset.balloonHelpDisabled;
  };

  function captureSaveGuard(city) {
    return Object.freeze({
      seed: Number(city?.seed) >>> 0,
      size: Number(city?.size) || 0,
      tick: Number(city?.tick) || 0,
      revision: Number(city?.rev ?? city?.revision) || 0,
      commandSequence: Number(city?.nextCommandSequence ?? city?.commandSequence) || 0,
    });
  }

  function matchesSaveGuard(city, stamp) {
    if (!city || !stamp) return false;
    return (Number(city.seed) >>> 0) === stamp.seed
      && (Number(city.size) || 0) === stamp.size
      && (Number(city.tick) || 0) === stamp.tick
      && (Number(city.rev ?? city.revision) || 0) === stamp.revision
      && (Number(city.nextCommandSequence ?? city.commandSequence) || 0) === stamp.commandSequence;
  }

  function saveCodec() {
    if (!state.saveManager) {
      state.saveManager = window.AISystem6BonsaiSaveWorkerManager?.createSaveWorkerManager?.({ sim: sim() }) || null;
    }
    if (!state.saveManager) throw new Error("bonsai-save-manager-missing");
    return state.saveManager;
  }

  function listen(target, type, handler, options, pointerScoped = false) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    state.counters.listeners += 1;
    const cleanup = () => {
      target.removeEventListener(type, handler, options);
      state.counters.listeners = Math.max(0, state.counters.listeners - 1);
    };
    (pointerScoped ? state.pointerCleanups : state.cleanups).push(cleanup);
  }

  function clearCleanupList(list) {
    while (list.length) list.pop()();
  }

  function syncHostContract(host) {
    // Bonsai City is a JS/WebGL sim shell — no Wasm engine binary (v223 honesty).
    const next = host || (
      state.latestMessage?.key === "bonsai_status_renderer_failed"
        || state.latestMessage?.key === "bonsai_status_load_failed"
        ? "fail"
        : state.latestMessage?.key === "bonsai_status_loading"
          ? "loading"
          : state.current || state.rendererMounted
            ? "ready"
            : "loading"
    );
    window.AISystem6WasmHostContract?.apply?.(bonsaiWindow(), {
      kind: "bonsai",
      host: next,
      wasm: 0,
      binary: 0,
      fail: true,
      crash: true,
    });
  }

  function setMessage(key, ...args) {
    state.latestMessage = { key, args };
    maybeDemandBlink(key);
    syncHostContract();
    const target = query("[data-bonsai-status-message]");
    if (!target) return;
    // The ticker repeats its last line while the city keeps asking for the
    // same thing, and rewriting text plus restarting an animation on every
    // tick is layout and paint the frame budget pays for nothing. Write when
    // the message actually changes.
    const next = t(key, ...args);
    if (target.textContent === next) return;
    target.textContent = next;
    // On phones the same element is a transient toast; restarting its CSS
    // animation is the only way a new message shows again without replacing
    // the element or touching its aria-live contract.
    if (window.matchMedia?.("(max-width: 560px)").matches
      && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      target.style.animation = "none";
      void target.offsetWidth;
      target.style.animation = "";
    }
  }

  // Message key -> the demand bar it names. A city that needs more of one kind
  // flashes that bar so the gauge and the ticker use the same word.
  const DEMAND_BAR_BY_MESSAGE = Object.freeze({
    need_residential: "residential",
    need_commercial: "commercial",
    need_industrial: "industrial",
  });
  function maybeDemandBlink(key) {
    const id = DEMAND_BAR_BY_MESSAGE[key];
    if (!id) return;
    blinkDemandBar(id);
  }
  function blinkDemandBar(id) {
    state.demandBlinkTimers.forEach(clearTimeout);
    state.demandBlinkTimers = [];
    const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Draw the highlight once as a long hold; no toggling.
      state.demandHighlight = { id, until: Date.now() + 3000 };
      renderStatus();
      return;
    }
    const seq = [id, null, id, null];
    seq.forEach((value, index) => {
      state.demandBlinkTimers.push(setTimeout(() => {
        state.demandHighlight = value ? { id: value, until: Date.now() + 1000 } : null;
        renderStatus();
      }, index * 250));
    });
  }

  // A gentle first-run hand: after a fresh city is born, a quiet line sits on
  // the map and fades once the player makes their first move or after a few
  // moments — never blocking input, never demanding attention.
  function showFirstHint() {
    const stack = query("[data-bonsai-map-stack]");
    if (!stack || stack.querySelector(".bonsai-first-hint")) return;
    const hint = document.createElement("div");
    hint.className = "bonsai-first-hint";
    hint.setAttribute("role", "status");
    hint.textContent = t("bonsai_first_hint");
    stack.appendChild(hint);
    clearTimeout(state.firstHintTimer);
    state.firstHintTimer = setTimeout(() => dismissFirstHint(), 14000);
  }

  function dismissFirstHint() {
    clearTimeout(state.firstHintTimer);
    state.firstHintTimer = null;
    const stack = query("[data-bonsai-map-stack]");
    const hint = stack?.querySelector(".bonsai-first-hint");
    if (!hint) return;
    hint.classList.add("is-leaving");
    setTimeout(() => hint.remove(), 900);
  }

  const formatMoney = (value) => Math.floor(Number(value) || 0).toLocaleString();

  function makeSeed() {
    if (globalThis.crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
    throw new Error("bonsai-crypto-seed-unavailable");
  }

  function makeId(seed = makeSeed()) {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    state.clientSequence += 1;
    return `bonsai-${(seed >>> 0).toString(36)}-${state.clientSequence}`;
  }

  function defaultMapSize() {
    return navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)")?.matches ? 64 : 96;
  }

  function injectWindowFrame() {
    let win = bonsaiWindow();
    if (win) return win;
    win = document.createElement("section");
    win.className = "window bonsai-window is-hidden";
    win.setAttribute("data-window", "bonsaiCity");
    win.setAttribute("aria-labelledby", "bonsai-city-title");
    win.innerHTML = `
      <div class="title-bar">
        <button class="close-box" type="button" aria-label="${t("close")}" data-i18n-aria-label="close"></button>
        <h2 id="bonsai-city-title">${t("bonsai_city_title")}</h2>
        <button class="resize-box" type="button" aria-label="${t("zoom")}" data-i18n-aria-label="zoom"></button>
        <button class="shade-box" type="button" aria-label="${t("collapse")}" data-i18n-aria-label="collapse"></button>
      </div>
      <div class="details-bar bonsai-details-bar bonsai-gauge">
        <span class="bonsai-gauge-city" data-bonsai-status-city data-bonsai-city-name></span>
        <span class="bonsai-gauge-date" data-bonsai-status-date data-bonsai-date></span>
        <span class="bonsai-gauge-weather" data-bonsai-weather></span>
        <span class="bonsai-gauge-funds" data-bonsai-status-funds data-bonsai-funds></span>
        <span class="bonsai-gauge-saved" data-bonsai-status-saved></span>
        <span class="bonsai-gauge-population" data-bonsai-status-population data-bonsai-population></span>
        <span class="bonsai-gauge-rci" data-bonsai-status-rci><button type="button" class="btn bonsai-rci-button" data-bonsai-rci-button aria-label="Demand"><canvas class="bonsai-rci-gauge" data-bonsai-rci-gauge width="32" height="20" role="img" aria-label="RCI"></canvas></button></span>
        <span class="bonsai-gauge-speed bonsai-speed-controls" role="group" aria-label="${t("bonsai_speed")}">
          ${SPEEDS.map((speed) => `<button class="btn mini-btn${state.speed === speed.value ? " is-selected" : ""}" type="button" data-bonsai-speed="${speed.value}" aria-pressed="${state.speed === speed.value}" aria-label="${t(`bonsai_speed_${speed.id}`)}" title="${t(`bonsai_speed_${speed.id}`)}">${speed.glyph}</button>`).join("")}
        </span>
        <span class="bonsai-gauge-undo-redo">
          <button class="btn mini-btn" type="button" data-bonsai-action="undo" aria-label="${t("bonsai_undo")}">↶</button>
          <button class="btn mini-btn" type="button" data-bonsai-action="redo" aria-label="${t("bonsai_redo")}">↷</button>
        </span>
        <span class="bonsai-gauge-tool" data-bonsai-status-tool></span>
        <span class="bonsai-gauge-cost" data-bonsai-status-cost></span>
        <span class="bonsai-gauge-overlay" data-bonsai-status-overlay></span>
        <span class="bonsai-status-message" data-bonsai-status-message data-bonsai-status role="status" aria-live="polite"></span>
      </div>
      <div class="window-pane bonsai-pane">
        <div class="bonsai-workspace-container">
          <div class="bonsai-workspace">
            <aside class="bonsai-rail" data-bonsai-rail aria-label="${t("bonsai_toolbox")}"></aside>
            <main class="bonsai-map-shell">
              <div class="bonsai-map-stack" data-bonsai-map-stack tabindex="0" aria-label="${t("bonsai_city_map")}">
                ${MAP_LAYERS.map((layer) => `<canvas class="bonsai-map-layer bonsai-map-layer-${layer}" data-bonsai-layer="${layer}" width="1" height="1" aria-hidden="true"></canvas>`).join("")}
              </div>
              <section class="bonsai-minimap-card" data-bonsai-minimap-card aria-label="${t("bonsai_minimap")}" hidden></section>
              <section class="bonsai-tile-balloon" data-bonsai-tile-balloon aria-label="${t("bonsai_tile_inspector")}" hidden></section>
              <p class="bonsai-map-credit" data-bonsai-map-credit hidden></p>
              <section class="bonsai-map-setup" data-bonsai-map-setup aria-labelledby="bonsai-map-setup-title" hidden></section>
              <section class="bonsai-city-browser" data-bonsai-city-browser aria-labelledby="bonsai-city-browser-title" hidden></section>
            </main>
            <aside class="bonsai-sub-palette" data-bonsai-sub-palette aria-label="${t("bonsai_toolbox")}"></aside>
            <aside class="bonsai-palette-footer" data-bonsai-palette-footer>
              <button type="button" class="btn bonsai-rci-panel-button" data-bonsai-rci-panel-button aria-label="Demand"><canvas class="bonsai-rci-panel" data-bonsai-rci-panel width="72" height="44" role="img" aria-label="RCI"></canvas></button>
            </aside>
            <aside class="bonsai-inspector" data-bonsai-inspector aria-labelledby="bonsai-inspector-title" hidden></aside>
          </div>
        </div>
      </div>`;
    document.querySelector(".desktop")?.append(win);
    syncHostContract("loading");
    return win;
  }

  // The rail (M2 §3.4): eight always-visible cells. Each cell wears the glyph
  // of the last tool chosen inside its category, so re-arming a familiar tool
  // is one tap; the armed cell inverts (black fill, paper glyph), the way the
  // native 1-bit control shows selection. 手 (pan) is a cell like any other.
  function buildRail() {
    const rail = query("[data-bonsai-rail]");
    if (!rail) return;
    rail.replaceChildren();
    const editing = state.current && state.current.founded === false;
    RAIL_CATEGORIES.forEach((category) => {
      const lastTool = state.lastToolByCategory.get(category.id);
      const tool = TOOLS.get(lastTool) || TOOLS.get("road");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bonsai-rail-cell";
      button.dataset.bonsaiCategory = category.id;
      if (category.id === "pan") button.dataset.bonsaiTool = "pan";
      setArmed(button, state.tool === lastTool);
      const label = `${t(category.labelKey)} · ${t(`bonsai_tool_${lastTool.replaceAll("-", "_")}`)}`;
      button.setAttribute("aria-label", label);
      button.title = label;
      // The terrain editor trims the rest of the rail until the city is
      // founded, exactly as the flat toolbox did.
      if (editing && category.id !== "terrain") markGray(button, true, "balloon_bonsai_terrain_only");
      button.append(toolIconElement(tool, "bonsai-rail-glyph"));
      rail.append(button);
    });
  }

  // A tool's picture: the icon baked from the same voxel model the map draws
  // (assets/bonsai/tool-icons.png, cell map in the atlas metadata), or its
  // text glyph when the sheet has no cell for it.
  function toolIconElement(tool, className) {
    const icon = document.createElement("span");
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    const sheet = window.AISystem6BonsaiAtlas?.toolIcons;
    const cell = sheet?.icons?.[tool.id];
    if (cell) {
      icon.classList.add("bonsai-tool-sprite");
      icon.style.setProperty("--icon-x", String(cell[0]));
      icon.style.setProperty("--icon-y", String(cell[1]));
      icon.style.setProperty("--icon-columns", String(sheet.columns));
      icon.style.setProperty("--icon-rows", String(sheet.rows));
      icon.style.setProperty("--icon-url", `url("${sheet.url}")`);
    } else {
      icon.textContent = tool.icon;
    }
    return icon;
  }

  // The sub-palette (M2 §3.4): one category at a time. Early-harvest X collapses
  // the tool-button wall into a System 6 select — choose a tool, then act on
  // the map. Rail cells still pick the category. CSS decides whether the
  // column is docked (container ≥ 820px) or a sheet (below), via a @container
  // query on .bonsai-workspace — not a viewport media query.
  function renderSubPalette() {
    const palette = query("[data-bonsai-sub-palette]");
    if (!palette) return;
    palette.replaceChildren();
    palette.classList.toggle("is-open", state.paletteOpen);
    const group = TOOL_GROUPS.find((entry) => entry.id === state.category);
    if (!group) {
      // 手 has no sub-palette; hide the column entirely so the map gets its
      // space back.
      palette.hidden = true;
      return;
    }
    palette.hidden = false;
    const editing = state.current && state.current.founded === false;
    const section = document.createElement("section");
    section.className = "bonsai-tool-group";
    const heading = document.createElement("h3");
    heading.textContent = t(`bonsai_tool_group_${group.id}`);
    const picker = document.createElement("label");
    picker.className = "bonsai-tool-picker";
    const pickerLabel = document.createElement("span");
    pickerLabel.className = "bonsai-tool-picker-label";
    pickerLabel.textContent = t("bonsai_tool_picker");
    const wrap = document.createElement("span");
    wrap.className = "select-wrap";
    const select = document.createElement("select");
    select.dataset.bonsaiToolSelect = "true";
    select.dataset.bonsaiCategory = group.id;
    select.setAttribute("aria-label", t("bonsai_tool_picker"));
    group.tools.forEach((tool) => {
      const cost = unitCost(tool);
      const option = document.createElement("option");
      option.value = tool.id;
      option.selected = state.tool === tool.id;
      const shortcut = tool.shortcut ? ` · ${tool.shortcut}` : "";
      option.textContent = `${t(`bonsai_tool_${tool.id.replaceAll("-", "_")}`)} · $${cost}${shortcut}`;
      if (tool.description) option.title = t(tool.description);
      select.append(option);
    });
    wrap.append(select);
    picker.append(pickerLabel, wrap);
    section.append(heading, picker);
    palette.append(section);
    if (editing && group.id === "terrain") {
      const editor = document.createElement("section");
      editor.className = "bonsai-tool-group";
      const title = document.createElement("h3");
      title.textContent = t("bonsai_terrain_editor");
      const note = document.createElement("p");
      note.className = "bonsai-tool-note";
      note.textContent = t("bonsai_terrain_editor_note");
      const found = document.createElement("button");
      found.type = "button";
      found.className = "btn default";
      found.dataset.bonsaiFoundCity = "true";
      found.textContent = t("bonsai_found_city");
      editor.append(title, note, found);
      palette.append(editor);
    }
  }

  function openCategory(categoryId) {
    if (categoryId === "pan") {
      selectTool("pan");
      return;
    }
    const group = TOOL_GROUPS.find((entry) => entry.id === categoryId);
    if (!group) return;
    state.category = categoryId;
    state.paletteOpen = true;
    const lastTool = state.lastToolByCategory.get(categoryId);
    if (lastTool) selectTool(lastTool, { keepPaletteOpen: true });
    else renderSubPalette();
    buildRail();
  }

  function closePaletteSheet() {
    state.paletteOpen = false;
    const palette = query("[data-bonsai-sub-palette]");
    if (palette) palette.classList.remove("is-open");
  }

  function paletteSheetOpen() {
    const palette = query("[data-bonsai-sub-palette]");
    return state.paletteOpen && !!palette && getComputedStyle(palette).position === "absolute";
  }

  function cancelPendingTouchTool() {
    if (state.pendingTouchTool) {
      window.clearTimeout(state.pendingTouchTool.timer);
      state.pendingTouchTool = null;
    }
  }

  function showSetup(options = {}) {
    state.playing = false;
    state.speed = 0;
    stopLoop();
    hideCityBrowser();
    closeInspector();
    const setup = query("[data-bonsai-map-setup]");
    if (!setup) return;
    const defaults = {
      name: options.name || t("bonsai_city_unnamed"),
      seed: Number.isInteger(options.seed) && options.seed >= 0 && options.seed <= 0xffffffff ? options.seed >>> 0 : (() => {
        try { return makeSeed(); } catch { return ""; }
      })(),
      size: [64, 96, 128].includes(options.size) ? options.size : defaultMapSize(),
      terrainPreset: TERRAIN_PRESETS.includes(options.terrainPreset) ? options.terrainPreset : "balanced",
      editor: options.editor === true,
    };
    state.setupOptions = defaults;
    setup.innerHTML = `
      <div class="bonsai-subwindow-title"><h3 id="bonsai-map-setup-title">${t("bonsai_map_setup")}</h3></div>
      <form class="bonsai-setup-form">
        <label><span>${t("bonsai_city_name")}</span><input type="text" data-bonsai-map-name maxlength="48"></label>
        <label><span>${t("bonsai_map_size")}</span><span class="select-wrap"><select data-bonsai-map-size><option value="64">64 × 64</option><option value="96">96 × 96</option><option value="128">128 × 128</option></select></span></label>
        <label><span>${t("bonsai_terrain_preset")}</span><span class="select-wrap"><select data-bonsai-map-terrain>${TERRAIN_PRESETS.map((preset) => `<option value="${preset}">${t(`bonsai_terrain_${preset}`)}</option>`).join("")}<option value="${OSM_SOURCE}">${t("bonsai_terrain_osm")}</option></select></span></label>
        <fieldset class="bonsai-osm-fields" data-bonsai-osm-fields hidden>
          <legend>${t("bonsai_osm_place")}</legend>
          <div class="bonsai-osm-search">
            <input type="search" data-bonsai-osm-query maxlength="120" placeholder="${escapeHtml(t("bonsai_osm_query_placeholder"))}" aria-label="${escapeHtml(t("bonsai_osm_search_label"))}">
            <button class="btn" type="button" data-bonsai-osm-search>${t("bonsai_osm_search")}</button>
          </div>
          <span class="select-wrap"><select data-bonsai-osm-place aria-label="${escapeHtml(t("bonsai_osm_place"))}">${osmPlaceOptions()}</select></span>
          <label><span>${t("bonsai_osm_coordinates")}</span><input type="text" data-bonsai-osm-coords inputmode="decimal" spellcheck="false" autocomplete="off"></label>
          <label class="bonsai-setup-editor"><input type="checkbox" data-bonsai-osm-buildings> <span>${t("bonsai_osm_buildings")}</span></label>
          <p class="bonsai-osm-credit">${t("bonsai_osm_credit")}</p>
        </fieldset>
        <details class="bonsai-setup-advanced">
          <summary>${t("bonsai_advanced")}</summary>
          <label><span>${t("bonsai_seed")}</span><input type="number" data-bonsai-map-seed min="0" max="4294967295" step="1" value="${defaults.seed}"></label>
          <label class="bonsai-setup-editor"><input type="checkbox" data-bonsai-map-editor> <span>${t("bonsai_start_in_editor")}</span></label>
        </details>
        <p class="bonsai-setup-preview-note" data-bonsai-setup-preview-note></p>
        <div class="button-row bonsai-setup-actions">
          <button class="btn" type="button" data-bonsai-setup-regenerate>${t("bonsai_new_map")}</button>
          <button class="btn" type="button" data-bonsai-action="open">${t("bonsai_open_cities")}</button>
          <button class="btn default" type="submit" data-bonsai-map-create>${t("bonsai_start_city")}</button>
        </div>
      </form>`;
    setup.querySelector("[data-bonsai-map-name]").value = defaults.name;
    setup.querySelector("[data-bonsai-map-size]").value = String(defaults.size);
    setup.querySelector("[data-bonsai-map-terrain]").value = defaults.terrainPreset;
    setup.querySelector("[data-bonsai-map-editor]").checked = defaults.editor;
    const firstPlace = OSM_PLACES[0];
    setup.querySelector("[data-bonsai-osm-coords]").value = formatCoords(firstPlace.lat, firstPlace.lon);
    setup.hidden = false;
    refreshSetupPreview();
  }

  // --- A real place (OpenStreetMap) -------------------------------------------
  //
  // The map square is fixed by the size (16 m a tile): 64, 96 or 128 tiles
  // are about 1.0, 1.5 or 2.0 km a side. The server fetches the features and
  // the heights (the page may not reach another host); the headless importer
  // maps them. Nothing is fetched until the player asks for a preview or
  // starts the city, and a preview is kept for the options it was made for.
  const OSM_SOURCE = "osm";
  const OSM_PLACES = Object.freeze([
    { id: "taipei-xinyi", lat: 25.0330, lon: 121.5654 },
    { id: "shanghai-bund", lat: 31.2400, lon: 121.4900 },
    { id: "hongkong-central", lat: 22.2830, lon: 114.1590 },
    { id: "kyoto-gion", lat: 35.0037, lon: 135.7788 },
    { id: "sanfrancisco-embarcadero", lat: 37.7955, lon: -122.3937 },
  ]);

  function formatCoords(lat, lon) {
    return `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}`;
  }

  function parseCoords(text) {
    const match = String(text || "").trim().match(/^(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const lat = Number(match[1]); const lon = Number(match[2]);
    return lat >= -80 && lat <= 80 && lon >= -180 && lon <= 180 ? { lat, lon } : null;
  }

  function osmPlaceOptions(found = []) {
    const presets = OSM_PLACES.map((place) => `<option value="${place.lat},${place.lon}">${escapeHtml(t(`bonsai_osm_place_${place.id.replace(/-/g, "_")}`))}</option>`).join("");
    const results = found.map((place) => `<option value="${place.lat},${place.lon}">${escapeHtml(place.name)}</option>`).join("");
    return results
      ? `<optgroup label="${escapeHtml(t("bonsai_osm_results"))}">${results}</optgroup><optgroup label="${escapeHtml(t("bonsai_osm_examples"))}">${presets}</optgroup>`
      : presets;
  }

  function osmKey(options) {
    return options.osm ? `${options.osm.lat.toFixed(5)},${options.osm.lon.toFixed(5)},${options.size},${options.osm.buildings ? 1 : 0}` : "";
  }

  function showOsmFields(on) {
    const fields = query("[data-bonsai-osm-fields]");
    if (fields) fields.hidden = !on;
    const regenerate = query("[data-bonsai-setup-regenerate]");
    if (regenerate) regenerate.textContent = t(on ? "bonsai_osm_preview" : "bonsai_new_map");
  }

  function updateMapCredit(city) {
    const credit = query("[data-bonsai-map-credit]");
    if (!credit) return;
    const provenance = city?.provenance;
    const text = provenance?.source === "openstreetmap" ? String(provenance.attribution || "© OpenStreetMap contributors") : "";
    if (credit.textContent !== text) credit.textContent = text;
    credit.hidden = !text;
  }

  // Whether a city's ground came from OpenStreetMap: its exports then carry
  // the ODbL credit in the message the player reads when the file leaves.
  function isOsmCity(payloadOrState) {
    return payloadOrState?.provenance?.source === "openstreetmap";
  }

  function isOsmSaveText(saveData) {
    try {
      const envelope = typeof saveData === "string" ? JSON.parse(saveData) : saveData;
      return isOsmCity(envelope?.payload);
    } catch {
      return false;
    }
  }

  async function searchOsmPlace() {
    const input = query("[data-bonsai-osm-query]");
    const text = input?.value.trim() || "";
    if (text.length < 2) return;
    const direct = parseCoords(text);
    if (direct) {
      query("[data-bonsai-osm-coords]").value = formatCoords(direct.lat, direct.lon);
      refreshSetupPreview();
      return;
    }
    setMessage("bonsai_status_osm_searching");
    try {
      const lang = typeof currentLanguage === "string" && currentLanguage === "zh" ? "zh-CN" : "en";
      const response = await bonsaiOsmRequest("place", { q: text, lang });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(osmErrorKey(data?.code)); return; }
      const places = Array.isArray(data.places) ? data.places : [];
      const select = query("[data-bonsai-osm-place]");
      if (select) select.innerHTML = osmPlaceOptions(places);
      if (!places.length) { setMessage("bonsai_status_osm_no_place"); return; }
      query("[data-bonsai-osm-coords]").value = formatCoords(places[0].lat, places[0].lon);
      setMessage("bonsai_status_osm_found", places.length);
      refreshSetupPreview();
    } catch {
      setMessage("bonsai_status_osm_failed");
    }
  }

  // The server relay is reached through the service layer, as every /api
  // route is (tooling/verify-service-boundary.mjs).
  function bonsaiOsmRequest(route, params) {
    return window.AISystem6Capabilities.requestService("bonsai.osm", { route, params });
  }

  function osmErrorKey(code) {
    if (code === "busy") return "bonsai_status_osm_busy";
    if (code === "daily_limit") return "bonsai_status_osm_daily_limit";
    if (code === "verification_required") return "bonsai_status_osm_verify";
    return "bonsai_status_osm_failed";
  }

  // Fetch, map and preview one square. Resolves to the import, or null when
  // it failed (the status line says why).
  async function loadOsmPreview(options = readSetupOptions()) {
    if (options.source !== OSM_SOURCE) return null;
    if (!options.osm) { setMessage("bonsai_status_osm_bad_coords"); return null; }
    const key = osmKey(options);
    if (state.osm?.key === key && state.osm.imported) return state.osm.imported;
    if (state.osm?.key === key && state.osm.pending) return state.osm.pending;
    const note = query("[data-bonsai-setup-preview-note]");
    setMessage("bonsai_status_osm_fetching");
    if (note) note.textContent = t("bonsai_status_osm_fetching");
    const params = { lat: String(options.osm.lat), lon: String(options.osm.lon), size: String(options.size) };
    const pending = (async () => {
      try {
        const [features, heights] = await Promise.all([
          bonsaiOsmRequest("osm", { ...params, buildings: options.osm.buildings ? "1" : "0" }),
          bonsaiOsmRequest("elevation", params),
        ]);
        const osm = await features.json().catch(() => ({}));
        if (!features.ok) { setMessage(osmErrorKey(osm?.code)); return null; }
        const elevation = heights.ok ? await heights.json().catch(() => null) : null;
        if (note) note.textContent = t("bonsai_status_osm_mapping");
        // One frame so the note paints before the import holds the thread.
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
        const importer = window.AISystem6BonsaiOsmImport;
        const imported = importer.importOsm({
          osm, elevation, sim: sim(), name: options.name, includeBuildings: options.osm.buildings,
          place: query("[data-bonsai-osm-place] option:checked")?.textContent || formatCoords(options.osm.lat, options.osm.lon),
          retrievedAt: new Date().toISOString(),
        });
        if (!elevation) imported.warnings.push("terrain-unavailable");
        if (state.osm?.key === key) state.osm.imported = imported;
        return imported;
      } catch {
        setMessage("bonsai_status_osm_failed");
        return null;
      } finally {
        if (state.osm?.key === key) state.osm.pending = null;
      }
    })();
    state.osm = { key, pending, imported: null };
    const imported = await pending;
    // A preview is shown only while the setup still asks for this square.
    if (imported && osmKey(readSetupOptions()) === key && query("[data-bonsai-map-setup]")?.hidden === false) {
      state.setupPreview = sim().deserialize(imported.payload);
      renderCity(state.setupPreview);
      if (note) note.textContent = osmSummary(options, imported);
      setMessage("bonsai_status_osm_previewed");
    }
    return imported;
  }

  function osmSummary(options, imported) {
    const km = ((options.size * window.AISystem6BonsaiOsmImport.CELL_METERS) / 1000).toFixed(1);
    const stats = imported.stats;
    return t("bonsai_osm_summary", km, stats.roads + stats.highways + stats.onramps, stats.lots, stats.facilities || 0);
  }

  function reportOsmImport(warnings) {
    const lines = (Array.isArray(warnings) ? warnings : []).map((code) => {
      const [name, count] = String(code).split(":");
      return `• ${t(`bonsai_osm_note_${name.replace(/-/g, "_")}`, Number(count) || 0)}`;
    });
    pushSystemNotification(`${t("bonsai_osm_report_intro")}\n${lines.join("\n")}`);
  }

  function readSetupOptions() {
    const seedText = query("[data-bonsai-map-seed]")?.value.trim() || "";
    const rawSeed = seedText ? Number(seedText) : NaN;
    const rawSize = Number(query("[data-bonsai-map-size]")?.value);
    const terrainPreset = query("[data-bonsai-map-terrain]")?.value || "balanced";
    const source = terrainPreset === OSM_SOURCE ? OSM_SOURCE : "generated";
    const coords = source === OSM_SOURCE ? parseCoords(query("[data-bonsai-osm-coords]")?.value) : null;
    return {
      source,
      osm: coords ? { ...coords, buildings: !!query("[data-bonsai-osm-buildings]")?.checked } : null,
      name: query("[data-bonsai-map-name]")?.value.trim() || t("bonsai_city_unnamed"),
      seed: Number.isInteger(rawSeed) && rawSeed >= 0 && rawSeed <= 0xffffffff ? rawSeed >>> 0 : makeSeed(),
      size: rawSize === 64 || rawSize === 128 ? rawSize : 96,
      terrainPreset: TERRAIN_PRESETS.includes(terrainPreset) ? terrainPreset : "balanced",
      founded: !query("[data-bonsai-map-editor]")?.checked,
    };
  }

  function refreshSetupPreview() {
    if (!sim()?.createCity) return;
    const options = readSetupOptions();
    state.setupOptions = options;
    showOsmFields(options.source === OSM_SOURCE);
    if (options.source === OSM_SOURCE) {
      // A real place is fetched on request, not on every keystroke; until
      // then the note says what the square will be.
      const note = query("[data-bonsai-setup-preview-note]");
      const ready = state.osm?.key === osmKey(options) && state.osm.imported;
      if (ready) {
        state.setupPreview = sim().deserialize(state.osm.imported.payload);
        renderCity(state.setupPreview);
      }
      if (note) note.textContent = ready ? osmSummary(options, state.osm.imported)
        : options.osm ? t("bonsai_osm_note_idle", ((options.size * 16) / 1000).toFixed(1)) : t("bonsai_status_osm_bad_coords");
      return;
    }
    try {
      state.setupPreview = sim().createCity(options);
      renderCity(state.setupPreview);
      const note = query("[data-bonsai-setup-preview-note]");
      if (note) note.textContent = t("bonsai_preview_summary_short", options.size, t(`bonsai_terrain_${options.terrainPreset}`));
    } catch (error) {
      setMessage(error?.message === "bonsai-crypto-seed-unavailable"
        ? "bonsai_status_seed_unavailable"
        : "bonsai_status_create_failed");
    }
  }

  async function createCityFromSetup() {
    const options = readSetupOptions();
    let osmImport = null;
    if (options.source === OSM_SOURCE) {
      osmImport = await loadOsmPreview(options);
      if (!osmImport) return false;
    }
    try {
      if ((state.dirty || state.saving) && !await flushCurrentCitySave()) return false;
      state.current = osmImport
        ? sim().deserialize({ ...osmImport.payload, name: options.name })
        : sim().createCity(options);
      state.record = {
        id: makeId(options.seed), name: options.name,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      state.setupPreview = null;
      state.dirty = true;
      scheduleAutosave();
      state.playing = false;
      state.speed = 0;
      state.lastRunningSpeed = 1;
      state.tickCarry = 0;
      state.completedGoals.clear();
      clearHistory("bonsai_history_cleared_new");
      const setup = query("[data-bonsai-map-setup]");
      if (setup) setup.hidden = true;
      selectTool("road");
      renderer()?.resetView?.({ center: state.current.spawnCenter || null, size: state.current.size, zoom: window.AISystem6BonsaiRenderer?.DEFAULT_ZOOM ?? 0.5 });
      if (osmImport) {
        // A real place arrives built: the opening checklist has nothing to
        // teach it, and the report says what came and what did not.
        markOpeningGoalsMet();
        setMessage("bonsai_status_osm_ready");
        reportOsmImport(osmImport.warnings);
      } else {
        setMessage("bonsai_status_ready");
        showFirstHint();
      }
      renderAll();
      scheduleSessionCommit();
      return true;
    } catch (error) {
      setMessage(error?.message === "bonsai-crypto-seed-unavailable"
        ? "bonsai_status_seed_unavailable"
        : "bonsai_status_create_failed");
      return false;
    }
  }

  // A city that arrives already built — a saved game, a scenario, an example —
  // is not a first city, so the opening checklist has nothing left to teach it.
  // Marking every goal met is what keeps the card away; clearing the set here
  // is what used to greet a metropolis with "drag a short road" unticked.
  function markOpeningGoalsMet() {
    GOALS.forEach((goal) => state.completedGoals.add(goal.id));
  }

  // A pressed .btn must also carry .is-selected. The Liquid Glass sheet repaints
  // every .btn that is NOT .default/.is-active/.is-selected/.is-multi-selected
  // with its own dark action ink, at a higher specificity than this app's
  // scoped sheet — so an armed control kept our black background and took the
  // theme's black text, and went invisible. The class is the sanctioned opt-out;
  // raising specificity here would only fight it.
  function setArmed(button, on) {
    if (!button) return;
    button.setAttribute("aria-pressed", String(on));
    button.classList.toggle("is-selected", on);
  }

  // The opening goals are a first-run TEACHING aid, not a score. The museum
  // record for the original defines that game by its refusal of imposed goals,
  // so this list no longer sits on the city: it is a panel the player opens
  // from 窗口 → 开局目标, and the first edition of the newspaper does the real
  // teaching in the game's own voice. A city that arrives already built has
  // every goal marked met (markOpeningGoalsMet), so it never teaches again.
  // The paper teaches, once. A city the player just founded still has opening
  // goals outstanding, and its first edition carries a story naming the five
  // things a mayor does. A city that arrived from disk, a scenario or an
  // example has every goal met already, so its paper never carries it.
  function teachingStory() {
    const city = state.current;
    if (!city) return "";
    const paper = city.newspaper || { edition: 0 };
    if ((paper.edition ?? 0) > 1) return "";
    if (state.completedGoals.size === GOALS.length) return "";
    return `<p class="bonsai-news-story">${t("bonsai_news_first_edition")}</p>`;
  }

  function openGoals() {
    if (!state.current) return;
    state.inspectorMode = "goals";
    renderInspector();
    scheduleSessionCommit();
  }

  function selectTool(toolId, options = {}) {
    if (!TOOLS.has(toolId)) return;
    state.tool = toolId;
    const category = CATEGORY_BY_TOOL.get(toolId) || "transport";
    if (category !== "pan") {
      state.category = category;
      state.lastToolByCategory.set(category, toolId);
    }
    // Picking a tool closes the sheet (docked mode ignores the flag); the
    // rail keeps the palette open when it opened it, so re-arming the last
    // tool of a category stays one tap.
    if (!options.keepPaletteOpen) state.paletteOpen = false;
    buildRail();
    renderSubPalette();
    query("[data-bonsai-map-stack]")?.focus({ preventScroll: true });
    clearPreview();
    renderStatus();
    scheduleSessionCommit();
  }

  function setSpeed(value) {
    const speed = SPEEDS.some((entry) => entry.value === Number(value)) ? Number(value) : 0;
    state.speed = speed;
    state.playing = speed > 0;
    state.tickCarry = 0;
    if (speed > 0) {
      state.yearEndHold = false;
      state.lastRunningSpeed = speed;
      state.completedGoals.add("run");
      if (state.fallbackUndo.length || state.fallbackRedo.length || state.current?.undoStack?.length || state.current?.redoStack?.length) {
        clearHistory("bonsai_history_cleared_simulation");
      }
      startLoop();
    } else {
      stopLoop();
      if (state.dirty) scheduleAutosave();
    }
    query(".bonsai-speed-controls")?.querySelectorAll("[data-bonsai-speed]").forEach((button) => {
      setArmed(button, Number(button.dataset.bonsaiSpeed) === speed);
    });
    renderStatus();
    // The four Speed rows in the menu bar are alternatives, and the gauge
    // buttons above are the only place that said which one is in force. A
    // player who chose the speed from the menu saw nothing there.
    if (typeof updateMenuState === "function") updateMenuState();
    // A speed the player picks while the assistant holds the city is theirs:
    // when ClioTalk goes idle the shell must not overwrite it.
    if (state.assistantPaused && !state.assistantApplying) state.assistantSpeedUserChanged = true;
  }

  function currentDate() {
    try {
      return state.current ? sim().dateOf(state.current) : null;
    } catch {
      return null;
    }
  }

  // The shared world core (pot-world.js) is loaded first by this window's
  // loader; every use is guarded so a page without it still runs.
  function potWorld() {
    return window.AISystem6PotWorld || null;
  }

  function potLanguageIsChinese() {
    return typeof currentLanguage === "string" && currentLanguage.toLowerCase().startsWith("zh");
  }

  // The pot's own calendar in words: 「1952年7月1日 周一 · 小暑」 /
  // "1 July 1952, Monday · Minor Heat". Empty when the core is absent, so the
  // caller can fall back to the ISO stamp.
  function potDateText(city = state.current) {
    const core = potWorld();
    if (!city || typeof core?.calendar?.dateOfTick !== "function") return "";
    const yearFounded = Number.isInteger(city.yearFounded) ? city.yearFounded : undefined;
    const date = core.calendar.dateOfTick(Number(city.tick) || 0, yearFounded);
    const weekday = t(`bonsai_weekday_${date.weekday}`);
    const term = core.calendar.TERMS?.[date.term] || null;
    const termName = term ? (potLanguageIsChinese() ? term[0] : term[1]) : "";
    return t("bonsai_pot_date", date.year, date.month + 1, date.day, weekday, termName);
  }

  // The district a tile stands in, in the player's language, through the
  // shared gazetteer. Empty when the core or the snapshot is unavailable.
  function districtNameAt(tile) {
    const core = potWorld();
    if (!state.current || typeof core?.gazetteer !== "function" || typeof sim()?.buildRenderSnapshot !== "function") return "";
    if (!Number.isInteger(tile?.x) || !Number.isInteger(tile?.y)) return "";
    try {
      const district = core.gazetteer(sim().buildRenderSnapshot(state.current)).districtAt(tile.x, tile.y);
      return district ? (potLanguageIsChinese() ? district.zh : district.en) : "";
    } catch {
      return "";
    }
  }

  // Where the car is put down: the middle of the map view, or the built-up
  // centre when no picker is mounted.
  function streetDepartureTile() {
    if (!state.current) return null;
    let from = builtViewCenter(state.current);
    const stack = query("[data-bonsai-map-stack]");
    const rect = stack?.getBoundingClientRect?.();
    const picked = rect && renderer()?.pickTile?.(rect.left + rect.width / 2, rect.top + rect.height / 2, rect);
    if (picked && Number.isFinite(picked.x) && Number.isFinite(picked.y)) from = { x: picked.x, y: picked.y };
    if (from && Number.isFinite(from.x) && Number.isFinite(from.y)) return from;
    return state.current.spawnCenter || null;
  }

  // The v2 hand-over the street and the roots both receive. Null when the
  // shared core is absent: the shell then keeps its older one-shot hand-over.
  function cityHandoffPayload(from = streetDepartureTile()) {
    const core = potWorld();
    if (!state.current || typeof core?.handoff?.fromCity !== "function") return null;
    const display = { night: Boolean(state.display.night), seasons: Boolean(state.display.seasons), tank: Boolean(state.display.tank) };
    const payload = core.handoff.fromCity(sim(), state.current, { record: state.record, display, from });
    stampHandoffDisplay(payload, display);
    return payload;
  }

  // The core stamps the light and the season from `display`; if a core ever
  // does not, stamp them here exactly as stampedSnapshot() does.
  function stampHandoffDisplay(payload, display) {
    const snapshot = payload?.snapshot;
    if (!snapshot) return;
    const timeOfDay = display.night ? 0 : 0.5;
    if (snapshot.timeOfDay !== timeOfDay) snapshot.timeOfDay = timeOfDay;
    if (!Number.isInteger(snapshot.season) || snapshot.season < 0 || snapshot.season > 3) {
      const date = potWorld()?.calendar?.dateOfTick?.(state.current?.tick, state.current?.yearFounded) || sim()?.dateOf?.(state.current) || null;
      const month = Number(date?.month) || 0;
      snapshot.season = display.seasons ? BONSAI_SEASON_OF_MONTH[month] : 1;
    }
  }

  function demandValue(kind) {
    const source = state.current?.demand || state.current?.rciDemand || {};
    const short = kind[0];
    return Math.round(Number(source[kind] ?? source[short] ?? source[short.toUpperCase()] ?? state.current?.[`${kind}Demand`] ?? 0));
  }

  // The two RCI instruments — the status bar's 32×20 bar and the palette's
  // 72×44 panel — are drawn from the canvas's own computed color, which is the
  // ink of the button they sit in. That button inverts on hover, focus and
  // press (the desk's reversal), so the canvas has to be redrawn when the
  // inversion changes: otherwise the frame, the zero line, the +/− marks and
  // the R/C/I letters keep the ink they were painted with and disappear into
  // the inverted cell, leaving only the three demand bars floating.
  function renderDemandGauges() {
    const win = bonsaiWindow();
    if (!win || !state.current) return;
    const r = demandValue("residential");
    const c = demandValue("commercial");
    const i = demandValue("industrial");
    const drawTier = (selector, tier) => {
      const canvas = win.querySelector(selector);
      if (!canvas) return;
      const style = getComputedStyle(canvas);
      window.AISystem6CityDemandGauge.draw(canvas, tier, { r: r / 200, c: c / 200, i: i / 200 }, {
        colors: {
          r: style.getPropertyValue("--city-demand-r") || "#1f9d3a",
          c: style.getPropertyValue("--city-demand-c") || "#2a55c7",
          i: style.getPropertyValue("--city-demand-i") || "#d9a900",
        },
        ink: style.color || "#000",
        highlight: state.demandHighlight?.id || null,
      });
      canvas.setAttribute("aria-label", `${t("city_demand_label")} R ${r} C ${c} I ${i}`);
    };
    drawTier("[data-bonsai-rci-gauge]", "gauge-bar");
    drawTier("[data-bonsai-rci-panel]", "bonsai-panel");
  }

  function renderStatus() {
    const win = bonsaiWindow();
    if (!win) return;
    // Read gauge colors before changing status text, avoiding an immediate layout flush.
    if (state.current) renderDemandGauges();
    const date = currentDate();
    const tool = TOOLS.get(state.tool) || TOOLS.get("road");
    const cost = state.tool === "pan" ? 0 : Number(state.previewReceipt?.cost ?? unitCost(tool)) || 0;
    const speedId = state.playing ? SPEEDS.find((entry) => entry.value === state.speed)?.id || "normal" : "pause";
    const values = {
      city: state.record?.name || t("bonsai_city_unnamed"),
      // The gauge speaks the pot's own calendar; the ISO stamp stays the
      // fallback for a page whose world core has not loaded.
      date: potDateText(state.current) || (date ? `${date.year}-${String((date.month ?? 0) + 1).padStart(2, "0")}-${String(date.day ?? 1).padStart(2, "0")}` : "—"),
      speed: t(`bonsai_speed_${speedId}`),
      funds: state.current ? `$${formatMoney(state.current.funds)}` : "—",
      population: state.current ? String(Math.floor(Number(state.current.population) || 0)) : "—",
      tool: t(`bonsai_tool_${tool.id.replaceAll("-", "_")}`),
      // A pad on uneven ground is levelled first; the preview shows that part.
      // A subway drag under water names its tunnel share (ruleset 6).
      cost: state.tool === "pan" ? "—" : Number(state.previewReceipt?.levelCost) > 0
        ? `$${formatMoney(cost)} ${t("bonsai_status_level_cost", `$${formatMoney(state.previewReceipt.levelCost)}`)}`
        : Number(state.previewReceipt?.tunnelCost) > 0
          ? `$${formatMoney(cost)} ${t("bonsai_status_tunnel_cost", `$${formatMoney(state.previewReceipt.tunnelCost)}`)}`
          : `$${formatMoney(cost)}`,
      overlay: state.overlay && state.overlay !== "none" ? t(`bonsai_overlay_${state.overlay.replaceAll("-", "_")}`) : "",
      saved: !state.current ? "" : state.lastSavedAt ? t("bonsai_status_saved_ago", Math.max(0, Math.round((Date.now() - state.lastSavedAt) / 1000))) : t("bonsai_status_unsaved"),
    };
    Object.entries(values).forEach(([name, value]) => {
      const target = win.querySelector(`[data-bonsai-status-${name}]`);
      if (!target) return;
      const text = name === "date" || name === "city" || name === "overlay" || name === "saved" ? value : `${t(`bonsai_status_label_${name}`)} ${value}`;
      if (target.textContent !== text) target.textContent = text;
    });
    if (state.current) {
      // Deterministic weather (clean-room SC2K MISC): a pure function of the
      // city seed + calendar, shown live in the gauge bar.
      const weatherEl = win.querySelector("[data-bonsai-weather]");
      if (weatherEl) {
        const weather = sim().weatherOf?.(state.current);
        if (weather) {
          const text = t(`bonsai_weather_${weather.type}`) || weather.type;
          if (weatherEl.textContent !== text) weatherEl.textContent = text;
          weatherEl.setAttribute("title", t("bonsai_weather_detail", weather.temperature, Math.round(weather.wind * 1.609), weather.humidity));
        }
      }
    }
    setMessage(state.latestMessage.key, ...state.latestMessage.args);
  }

  // The snapshot says what the player chose to see: daylight unless the
  // night view is on, and summer unless the seasons are on — then the season
  // follows the city's own calendar (spring from March).
  function stampedSnapshot(city) {
    const snapshot = sim().buildRenderSnapshot(city);
    snapshot.timeOfDay = state.display.night ? 0 : 0.5;
    const month = Number(sim().dateOf?.(city)?.month) || 0;
    snapshot.season = state.display.seasons ? BONSAI_SEASON_OF_MONTH[month] : 1;
    // Problem signs blink at 1 Hz on the shell's clock (the renderer reads
    // no clock of its own).
    snapshot.flagPhase = Math.floor(performance.now() / 500) % 2;
    return snapshot;
  }

  function renderCity(city = state.current) {
    const active = renderer();
    updateMapCredit(city);
    if (!city || !state.rendererMounted || !active?.render) return;
    active.render(stampedSnapshot(city), { overlay: state.overlay, display: state.display });
  }

  // One frame scheduler for the window. The simulation ticks at 20 Hz, but a
  // tick used to redraw the map, the whole minimap, the gauge bar and the open
  // panel's HTML every time — the panel's selects could not even be opened
  // while the city ran. Now a tick only asks for a frame: the map draws once
  // per animation frame, and while the clock runs the gauge bar refreshes at
  // most four times a second, the minimap twice, and a panel only when the
  // player is not working one of its controls.
  const RUNNING_PANEL_MS = 250;
  const RUNNING_MINIMAP_MS = 500;
  const renderQueue = { city: false, panels: false, minimap: false, raf: 0, auxiliary: 0, lastPanels: 0, lastMinimap: 0 };

  function requestRender(parts = { city: true, panels: true, minimap: true }) {
    if (parts.city) renderQueue.city = true;
    if (parts.panels) renderQueue.panels = true;
    if (parts.minimap) renderQueue.minimap = true;
    if (renderQueue.raf) return;
    if (typeof requestAnimationFrame !== "function") {
      flushRender(Date.now());
      return;
    }
    renderQueue.raf = requestAnimationFrame(flushRender);
  }

  function cancelRenderQueue() {
    if (renderQueue.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(renderQueue.raf);
    if (renderQueue.auxiliary) clearTimeout(renderQueue.auxiliary);
    renderQueue.auxiliary = 0;
    renderQueue.raf = 0;
    renderQueue.city = false;
    renderQueue.panels = false;
    renderQueue.minimap = false;
  }

  function panelHasFocus() {
    const panel = query("[data-bonsai-inspector]");
    const active = document.activeElement;
    return !!(panel && active && panel.contains(active) && /^(SELECT|INPUT|TEXTAREA|BUTTON)$/.test(active.tagName));
  }

  function flushRender(now) {
    renderQueue.raf = 0;
    if (!bonsaiWindow()) return;
    const clock = Number.isFinite(now) ? now : Date.now();
    if (renderQueue.city) {
      renderQueue.city = false;
      renderCity();
    }
    // Yield after the map paint: DOM panels and the minimap need not share
    // its animation-frame task. One pending callback coalesces newer ticks.
    if (typeof requestAnimationFrame === "function") {
      if (!renderQueue.auxiliary && (renderQueue.panels || renderQueue.minimap)) {
        renderQueue.auxiliary = setTimeout(() => {
          renderQueue.auxiliary = 0;
          if (bonsaiWindow()) flushAuxiliary(performance.now());
        }, 0);
      }
    } else flushAuxiliary(clock);
  }

  function flushAuxiliary(clock) {
    let pending = false;
    if (renderQueue.panels) {
      if (!state.playing || clock - renderQueue.lastPanels >= RUNNING_PANEL_MS) {
        renderQueue.panels = false;
        renderQueue.lastPanels = clock;
        renderStatus();
        if (!state.playing || !panelHasFocus()) renderInspector();
        syncUndoButtons();
        syncNewspaperMenu();
      } else pending = true;
    }
    if (renderQueue.minimap) {
      if (!state.playing || clock - renderQueue.lastMinimap >= RUNNING_MINIMAP_MS) {
        renderQueue.minimap = false;
        renderQueue.lastMinimap = clock;
        renderMiniMap();
      } else pending = true;
    }
    if (pending && !renderQueue.raf && typeof requestAnimationFrame === "function") renderQueue.raf = requestAnimationFrame(flushRender);
  }

  function renderAll() {
    // The toolbox tracks founded-ness: opening an editor city trims it to
    // the sculpting tools, founding brings the full set back.
    const editing = Boolean(state.current && state.current.founded === false);
    if (editing !== state.toolboxEditing) { state.toolboxEditing = editing; buildRail(); renderSubPalette(); }
    renderCity();
    renderStatus();
    // The minimap is a permanent instrument (M3): every city change redraws
    // it, whether or not any panel is open.
    renderMiniMap();
    renderInspector();
    syncUndoButtons();
    syncNewspaperMenu();
    syncDisplayMenuChecks();
  }

  // One sound per event kind, all synthesized in bonsai-audio.js: placement
  // and demolition play from the tool path (plop / bulldoze / reject); the
  // simulation's own events play from here. Zero audio assets.
  const SFX_BY_EVENT = Object.freeze({
    "disaster-started": "siren",
    "disaster-ended": "allclear",
    "reward-offered": "reward",
    milestone: "milestone",
    "plant-expired": "alarm",
    brownout: "alarm",
  });

  function handleSimEvent(event) {
    const key = EVENT_KEYS[event?.type];
    if (SFX_BY_EVENT[event?.type]) audioEngine()?.sfx(SFX_BY_EVENT[event.type]);
    else if (event?.type === "newspaper-published" && event.payload?.extra) audioEngine()?.sfx("extra");
    else if (event?.type === "policy-changed" && event.payload?.policy === "bond" && event.payload?.action === "issue") audioEngine()?.sfx("cash");
    if (!key) return;
    const payload = event.payload || {};
    const location = Number.isInteger(payload.x) && Number.isInteger(payload.y) ? `${payload.x},${payload.y}` : "";
    setMessage(key, location, payload.action || payload.problem || payload.threshold || "");
  }

  function audioEngine() {
    if (state.audioMode === "off") return null;
    if (!state.audio && window.AISystem6BonsaiAudio) {
      state.audio = window.AISystem6BonsaiAudio.createEngine();
    }
    return state.audio || null;
  }

  function syncAudioMode() {
    const engine = state.audio;
    if (engine) {
      engine.setMusicEnabled(state.audioMode === "music");
      engine.setSfxEnabled(state.audioMode !== "off");
    }
  }

  function tick() {
    if (!state.playing || !state.current || !isWindowVisible()) return;
    state.tickCarry += state.speed;
    const count = Math.floor(state.tickCarry);
    if (count < 1) return;
    state.tickCarry -= count;
    const ticksPerMonth = (Number(sim().TICKS_PER_DAY) || 5) * (Number(sim().DAYS_PER_MONTH) || 25);
    const ticksPerYear = ticksPerMonth * (Number(sim().MONTHS_PER_YEAR) || 12);
    const tickBefore = Number(state.current.tick) || 0;
    const monthBefore = Math.floor(tickBefore / ticksPerMonth);
    sim().advanceTicks(state.current, count);
    state.dirty = true;
    const tickAfter = Number(state.current.tick) || 0;
    if (Math.floor(tickAfter / ticksPerMonth) !== monthBefore) scheduleAutosave();
    sim().drainEvents?.(state.current)?.forEach(handleSimEvent);
    if (Math.floor(tickAfter / ticksPerYear) !== Math.floor(tickBefore / ticksPerYear)) holdForYearEndBudget();
    requestRender();
  }

  // January stops the clock for the budget review, as in the original game,
  // unless 自动预算 (auto-budget) is on: then the previous tax, funding, and
  // ordinance lines apply unchanged and the year rolls on. The hold is a
  // pause with the budget pane open; any speed choice resumes it.
  function holdForYearEndBudget() {
    if (state.autoBudget || !state.current) return;
    setSpeed(0);
    state.yearEndHold = true;
    audioEngine()?.sfx("bell");
    openBudget();
    setMessage("bonsai_status_year_end_budget", sim().dateOf?.(state.current)?.year ?? "");
  }

  function setAutoBudget(on) {
    state.autoBudget = !!on;
    if (state.autoBudget && state.yearEndHold) resumeFromYearEnd();
    if (state.inspectorMode === "budget") renderInspector();
    syncDisplayMenuChecks();
    scheduleSessionCommit();
  }

  function resumeFromYearEnd() {
    if (!state.yearEndHold) return;
    state.yearEndHold = false;
    setSpeed(state.lastRunningSpeed || 1);
  }

  function isWindowVisible() {
    const win = bonsaiWindow();
    return !!win
      && !win.classList.contains("is-hidden")
      && !win.classList.contains("is-app-hidden")
      && !win.classList.contains("is-collapsed")
      && document.visibilityState === "visible";
  }

  function startLoop() {
    if (state.timer || !state.playing || !isWindowVisible()) return;
    state.timer = setInterval(tick, FRAME_MS);
    state.counters.intervals = 1;
  }

  function stopLoop() {
    if (!state.timer) return;
    clearInterval(state.timer);
    state.timer = null;
    state.counters.intervals = 0;
  }

  function clearAutosaveTimer() {
    if (!state.autosaveTimer) return;
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = null;
    state.counters.timeouts = 0;
  }

  function scheduleAutosave(delay = AUTOSAVE_DELAY_MS) {
    clearAutosaveTimer();
    if (!state.current || !state.record || state.writeBoundary) return;
    state.autosaveTimer = setTimeout(async () => {
      state.autosaveTimer = null;
      state.counters.timeouts = 0;
      if (state.dirty && !state.writeBoundary) await saveCurrentCity();
    }, Math.max(0, Number(delay) || 0));
    state.counters.timeouts = 1;
  }

  function runBestEffortAutosave() {
    stopLoop();
    clearAutosaveTimer();
    if (state.dirty && !state.writeBoundary) saveCurrentCity();
  }

  function rectFromTiles(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x) + 1,
      height: Math.abs(a.y - b.y) + 1,
    };
  }

  function linePoints(a, b) {
    const points = [];
    let x = a.x;
    let y = a.y;
    const dx = Math.abs(b.x - a.x);
    const sx = a.x < b.x ? 1 : -1;
    const dy = -Math.abs(b.y - a.y);
    const sy = a.y < b.y ? 1 : -1;
    let error = dx + dy;
    while (true) {
      points.push({ x, y });
      if (x === b.x && y === b.y) break;
      const twice = 2 * error;
      if (twice >= dy) {
        error += dy;
        x += sx;
      }
      if (twice <= dx) {
        error += dx;
        y += sy;
      }
    }
    return points;
  }

  function unitCost(tool) {
    if (!tool) return 0;
    if (typeof sim()?.unitCost === "function" && tool.command) {
      const payload = tool.command === "build-path" ? { network: tool.network, points: [] }
        : tool.command === "zone-area" ? { zone: tool.zone, density: tool.density, x: 0, y: 0, width: 1, height: 1 }
          : tool.command === "place-facility" ? { kind: tool.kind, x: 0, y: 0 }
            : tool.command === "terraform-area" ? { mode: tool.mode, x: 0, y: 0, width: 1, height: 1 }
              : { x: 0, y: 0, width: 1, height: 1 };
      const value = Number(sim().unitCost({ type: tool.command, payload }));
      if (Number.isFinite(value)) return value;
    }
    return 0;
  }

  function commandFor(tool, start, end = start) {
    if (!tool || tool.query || !state.current) return null;
    const rect = rectFromTiles(start, end);
    let payload;
    if (tool.command === "build-path") payload = { network: tool.network, points: linePoints(start, end) };
    else if (tool.command === "zone-area") payload = { zone: tool.zone, density: tool.density, ...rect };
    else if (tool.command === "place-facility") payload = { kind: tool.kind, x: start.x, y: start.y };
    else if (tool.command === "terraform-area") payload = { mode: tool.mode, ...rect };
    else if (tool.command === "demolish-area") payload = rect;
    else if (tool.command === "trigger-disaster") payload = { kind: tool.kind, x: start.x, y: start.y };
    else return null;
    state.clientSequence += 1;
    return {
      schemaVersion: 2,
      type: tool.command,
      payload,
      targetTick: state.current.tick,
      clientCommandId: `bonsai-ui-${state.clientSequence}`,
    };
  }

  function pickTile(event) {
    const stack = query("[data-bonsai-map-stack]");
    if (!stack || !renderer()?.pickTile) return null;
    const tile = renderer().pickTile(event.clientX, event.clientY, stack.getBoundingClientRect());
    return Number.isInteger(tile?.x) && Number.isInteger(tile?.y) ? tile : null;
  }

  // Zoom steps between the fixed levels and keeps the ground under the
  // pointer where it is; without a pointer it zooms about the map's middle.
  function zoomAt(factor, clientPoint = null) {
    const stack = query("[data-bonsai-map-stack]");
    const rect = stack?.getBoundingClientRect?.();
    const anchor = clientPoint && rect ? { x: clientPoint.x - rect.left, y: clientPoint.y - rect.top } : null;
    renderer()?.zoomBy?.(factor, anchor);
    renderCity();
    renderMiniMap();
    scheduleSessionCommit();
  }

  function rotateView(quarterTurns) {
    renderer()?.rotateBy?.(quarterTurns);
    renderCity();
    renderMiniMap();
    scheduleSessionCommit();
  }

  function centerOnCity() {
    if (!state.current) return;
    const center = builtViewCenter(state.current) || state.current.spawnCenter || null;
    if (center) centerViewOnTile(center);
  }

  function panBy(dx, dy) {
    renderer()?.panByScreen?.(dx, dy, { defer: true });
    requestRender({ city: true });
    scheduleSessionCommit();
  }

  function previewGesture(start, end) {
    const tool = TOOLS.get(state.tool);
    if (!state.current || !tool || !start || !end) return clearPreview();
    if (tool.query) {
      state.previewReceipt = { accepted: true, cost: 0, footprint: [{ x: end.x, y: end.y }] };
    } else {
      const command = commandFor(tool, start, end);
      state.previewReceipt = command ? sim().previewCommand(state.current, command) : null;
    }
    if (state.previewReceipt) setRendererPreview(state.previewReceipt);
    else renderer()?.clearPreview?.();
    renderStatus();
  }

  function setRendererPreview(receipt) {
    const footprint = Array.isArray(receipt?.footprint)
      ? receipt.footprint
      : Array.isArray(receipt?.footprint?.tiles) ? receipt.footprint.tiles : [];
    renderer()?.setPreview?.({
      accepted: receipt?.accepted !== false,
      code: receipt?.code || "",
      footprint,
    });
  }

  function clearPreview() {
    state.previewReceipt = null;
    renderer()?.clearPreview?.();
    renderStatus();
  }

  function snapshotForFallbackUndo() {
    if (!state.current) return null;
    try {
      const serialized = sim().serialize(state.current);
      return typeof serialized === "string" ? serialized : JSON.stringify(serialized);
    } catch {
      return null;
    }
  }

  function restoreFallbackSnapshot(snapshot) {
    if (!snapshot) return false;
    try {
      state.current = sim().deserialize(typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot);
      return true;
    } catch {
      return false;
    }
  }

  function recordFallbackUndo(snapshot) {
    if (!snapshot) return;
    state.fallbackUndo.push(snapshot);
    if (state.fallbackUndo.length > MAX_HISTORY) state.fallbackUndo.shift();
    state.fallbackRedo.length = 0;
  }

  function clearHistory(messageKey = "") {
    state.fallbackUndo.length = 0;
    state.fallbackRedo.length = 0;
    sim()?.clearHistory?.(state.current);
    if (messageKey) setMessage(messageKey);
    syncUndoButtons();
  }

  function syncUndoButtons() {
    const coreHistory = typeof sim()?.undo === "function";
    const undo = query('[data-bonsai-action="undo"]');
    const redo = query('[data-bonsai-action="redo"]');
    const undoEmpty = !state.current || (coreHistory ? !state.current.undoStack?.length : state.fallbackUndo.length === 0);
    const redoEmpty = !state.current || (coreHistory ? !state.current.redoStack?.length : state.fallbackRedo.length === 0);
    markGray(undo, undoEmpty, state.current ? "balloon_bonsai_nothing_to_undo" : "balloon_bonsai_needs_city");
    markGray(redo, redoEmpty, state.current ? "balloon_bonsai_nothing_to_redo" : "balloon_bonsai_needs_city");
  }

  function performUndo() {
    if (!state.current) return;
    let changed = false;
    if (typeof sim().undo === "function") {
      const result = sim().undo(state.current);
      changed = result?.accepted ?? result?.ok ?? result === true;
    } else if (state.fallbackUndo.length) {
      const current = snapshotForFallbackUndo();
      changed = restoreFallbackSnapshot(state.fallbackUndo.pop());
      if (changed && current) state.fallbackRedo.push(current);
    }
    if (changed) {
      state.dirty = true;
      scheduleAutosave();
      setMessage("bonsai_status_undone");
      renderAll();
    }
  }

  function performRedo() {
    if (!state.current) return;
    let changed = false;
    if (typeof sim().redo === "function") {
      const result = sim().redo(state.current);
      changed = result?.accepted ?? result?.ok ?? result === true;
    } else if (state.fallbackRedo.length) {
      const current = snapshotForFallbackUndo();
      changed = restoreFallbackSnapshot(state.fallbackRedo.pop());
      if (changed && current) state.fallbackUndo.push(current);
    }
    if (changed) {
      state.dirty = true;
      scheduleAutosave();
      setMessage("bonsai_status_redone");
      renderAll();
    }
  }

  function completeGoalForTool(toolId) {
    GOALS.forEach((goal) => {
      if (goal.tool === toolId || goal.tools?.includes(toolId)) state.completedGoals.add(goal.id);
    });
  }

  function submitGesture(start, end) {
    const tool = TOOLS.get(state.tool);
    if (!state.current || state.writeBoundary || !tool || !start || !end) return;
    if (tool.query) {
      openTileBalloon(end);
      clearPreview();
      return;
    }
    const command = commandFor(tool, start, end);
    if (!command) return;
    const fallbackSnapshot = typeof sim().undo === "function" ? null : snapshotForFallbackUndo();
    const receipt = sim().submitCommand(state.current, command);
    state.previewReceipt = receipt;
    if (!receipt?.accepted) {
      setRendererPreview(receipt || { accepted: false, footprint: [] });
      setMessage("bonsai_rejection_reason", receipt?.code || "invalid");
      audioEngine()?.sfx("reject");
      renderStatus();
      return;
    }
    if (fallbackSnapshot) recordFallbackUndo(fallbackSnapshot);
    state.dirty = true;
    scheduleAutosave();
    dismissFirstHint();
    audioEngine()?.sfx(tool.command === "demolish-area" ? "bulldoze" : "plop");
    completeGoalForTool(tool.id);
    receipt.events?.forEach(handleSimEvent);
    if (!receipt.events?.length) setMessage("bonsai_status_built");
    clearPreview();
    renderAll();
  }

  function beginPointerGesture(event) {
    const stack = query("[data-bonsai-map-stack]");
    const setupOpen = query("[data-bonsai-map-setup]")?.hidden === false;
    const browserOpen = query("[data-bonsai-city-browser]")?.hidden === false;
    if (!stack || !state.current || setupOpen || browserOpen) return;
    state.lastPointer = { x: event.clientX, y: event.clientY };
    // The tile balloon dismisses on the next tap; that tap must not also
    // spend money, the same way the palette sheet swallows its dismiss tap.
    if (tileBalloonOpen()) {
      closeTileBalloon();
      return;
    }
    // A sheet swallows the first outside tap to dismiss it; that tap must not
    // also spend money. Docked mode never matches (its palette is in flow).
    if (paletteSheetOpen()) {
      closePaletteSheet();
      return;
    }
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
    state.counters.activePointers = state.pointers.size;
    stack.setPointerCapture?.(event.pointerId);
    if (state.pointers.size === 2) {
      cancelPendingTouchTool();
      state.gesture = null;
      clearPreview();
      const points = [...state.pointers.values()];
      state.multiTouch = {
        centerX: (points[0].x + points[1].x) / 2,
        centerY: (points[0].y + points[1].y) / 2,
        distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
      };
      return;
    }
    const panning = event.button === 1 || (event.button === 0 && state.spacePressed) || state.tool === "pan";
    if (event.button !== 0 && !panning) return;
    const tile = pickTile(event);
    // Touch shape (Micropolis pendingTouchTool): a tap commits on lift, so a
    // second finger can still arrive and become a pinch at any moment before
    // the lift. Holding past the long-press threshold queries the tile
    // instead of building — inspection without disarming (M3).
    if (event.pointerType === "touch" && !panning) {
      const pending = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        tile,
        longPressed: false,
        timer: 0,
      };
      pending.timer = window.setTimeout(() => {
        if (state.pendingTouchTool !== pending) return;
        state.pendingTouchTool = null;
        if (pending.tile) openTileBalloon(pending.tile, { x: pending.startX, y: pending.startY });
      }, BONSAI_TOUCH_LONG_PRESS_MS);
      state.pendingTouchTool = pending;
      return;
    }
    state.gesture = {
      pointerId: event.pointerId,
      panning,
      lastClient: { x: event.clientX, y: event.clientY },
      startTile: tile,
      endTile: tile,
      cancelled: false,
    };
    stack.classList.toggle("is-panning", panning);
    if (!panning && tile) previewGesture(tile, tile);
    event.preventDefault();
  }

  function movePointerGesture(event) {
    if (!state.pointers.has(event.pointerId)) {
      if (event.pointerType === "mouse" && !state.gesture) {
        const tile = pickTile(event);
        if (tile && TOOLS.get(state.tool)?.gesture === "point") previewGesture(tile, tile);
      }
      return;
    }
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
    state.lastPointer = { x: event.clientX, y: event.clientY };
    // A finger that starts moving becomes a drag-draw once it passes the slop
    // threshold; the pending grace is cancelled so no extra tap commits.
    if (state.pendingTouchTool && event.pointerId === state.pendingTouchTool.pointerId) {
      const moved = Math.hypot(
        event.clientX - state.pendingTouchTool.startX,
        event.clientY - state.pendingTouchTool.startY,
      );
      if (moved > BONSAI_TOUCH_TOOL_SLOP_PX) {
        cancelPendingTouchTool();
        const tile = pickTile(event);
        state.gesture = {
          pointerId: event.pointerId,
          panning: false,
          lastClient: { x: event.clientX, y: event.clientY },
          startTile: tile,
          endTile: tile,
          cancelled: false,
        };
        if (tile) previewGesture(tile, tile);
      }
      return;
    }
    if (state.pointers.size >= 2) {
      const points = [...state.pointers.values()].slice(0, 2);
      const centerX = (points[0].x + points[1].x) / 2;
      const centerY = (points[0].y + points[1].y) / 2;
      const distance = Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y));
      if (state.multiTouch) {
        panBy(centerX - state.multiTouch.centerX, centerY - state.multiTouch.centerY);
        const base = state.multiTouch.baseDistance || state.multiTouch.distance;
        const ratio = distance / Math.max(1, base);
        if (ratio > 1.5 || ratio < 0.67) {
          zoomAt(ratio > 1 ? 2 : 0.5, { x: centerX, y: centerY });
          state.multiTouch = { centerX, centerY, distance, baseDistance: distance };
          event.preventDefault();
          return;
        }
        state.multiTouch = { centerX, centerY, distance, baseDistance: base };
      } else {
        state.multiTouch = { centerX, centerY, distance, baseDistance: distance };
      }
      event.preventDefault();
      return;
    }
    const gesture = state.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.panning) {
      panBy(event.clientX - gesture.lastClient.x, event.clientY - gesture.lastClient.y);
      gesture.lastClient = { x: event.clientX, y: event.clientY };
    } else {
      const tile = pickTile(event);
      if (tile) {
        gesture.endTile = tile;
        previewGesture(gesture.startTile, tile);
      }
    }
    event.preventDefault();
  }

  function endPointerGesture(event) {
    const pending = state.pendingTouchTool;
    if (pending && pending.pointerId === event.pointerId) {
      cancelPendingTouchTool();
      state.pointers.delete(event.pointerId);
      state.counters.activePointers = state.pointers.size;
      if (event.type !== "pointercancel" && pending.tile) submitGesture(pending.tile, pending.tile);
      return;
    }
    const gesture = state.gesture;
    state.pointers.delete(event.pointerId);
    state.counters.activePointers = state.pointers.size;
    if (state.multiTouch) {
      if (state.pointers.size < 2) state.multiTouch = null;
      if (gesture) gesture.cancelled = true;
      state.gesture = null;
      query("[data-bonsai-map-stack]")?.classList.remove("is-panning");
      clearPreview();
      return;
    }
    if (gesture?.pointerId === event.pointerId) {
      if (!gesture.panning && !gesture.cancelled && gesture.startTile && gesture.endTile) {
        submitGesture(gesture.startTile, gesture.endTile);
      }
      state.gesture = null;
      query("[data-bonsai-map-stack]")?.classList.remove("is-panning");
    }
  }

  function cancelPointers() {
    cancelPendingTouchTool();
    state.pointers.clear();
    state.counters.activePointers = 0;
    state.gesture = null;
    state.multiTouch = null;
    query("[data-bonsai-map-stack]")?.classList.remove("is-panning");
    clearPreview();
  }

  function handleMapKey(event) {
    if (event.key === " ") {
      state.spacePressed = event.type === "keydown";
      event.preventDefault();
      return;
    }
    if (event.type !== "keydown") return;
    const key = event.key.toUpperCase();
    if (key === "Q" && !event.metaKey && !event.ctrlKey) renderer()?.rotateBy?.(-1);
    else if (key === "E" && !event.metaKey && !event.ctrlKey) renderer()?.rotateBy?.(1);
    else if (event.key === "Home") centerOnCity();
    else if (event.key === "ArrowLeft") panBy(-24, 0);
    else if (event.key === "ArrowRight") panBy(24, 0);
    else if (event.key === "ArrowUp") panBy(0, -24);
    else if (event.key === "ArrowDown") panBy(0, 24);
    else if (event.key === "+" || event.key === "=") zoomAt(2);
    else if (event.key === "-") zoomAt(0.5);
    else {
      const match = [...TOOLS.values()].find((tool) => tool.shortcut === key);
      if (match) selectTool(match.id);
      else return;
    }
    if (key === "Q" || key === "E") {
      renderCity();
      scheduleSessionCommit();
    }
    event.preventDefault();
  }

  function bindPointerInput() {
    clearCleanupList(state.pointerCleanups);
    const stack = query("[data-bonsai-map-stack]");
    if (!stack) return;
    listen(stack, "pointerdown", beginPointerGesture, undefined, true);
    listen(stack, "pointermove", movePointerGesture, undefined, true);
    listen(stack, "pointerup", endPointerGesture, undefined, true);
    listen(stack, "pointercancel", endPointerGesture, undefined, true);
    listen(stack, "pointerleave", (event) => {
      if (!state.gesture && event.pointerType === "mouse") clearPreview();
    }, undefined, true);
    listen(stack, "wheel", (event) => {
      event.preventDefault();
      const pinch = event.ctrlKey || event.metaKey;
      const trackpadScroll = !pinch && (Math.abs(event.deltaX) > 0 || (event.deltaMode === 0 && Math.abs(event.deltaY) < 40));
      if (trackpadScroll) {
        panBy(-event.deltaX, -event.deltaY);
        return;
      }
      // Wheel notches and pinch deltas accumulate until they add up to one
      // step, and a short rest after a step stops one flick skipping levels.
      const now = Date.now();
      state.wheelZoom = state.wheelZoom || { sum: 0, until: 0 };
      if (now < state.wheelZoom.until) return;
      state.wheelZoom.sum += event.deltaY;
      const threshold = pinch ? 24 : 40;
      if (Math.abs(state.wheelZoom.sum) < threshold) return;
      const factor = state.wheelZoom.sum < 0 ? 2 : 0.5;
      state.wheelZoom = { sum: 0, until: now + 180 };
      zoomAt(factor, { x: event.clientX, y: event.clientY });
    }, { passive: false }, true);
    listen(stack, "contextmenu", (event) => event.preventDefault(), undefined, true);
    listen(stack, "keydown", handleMapKey, undefined, true);
    listen(stack, "keyup", handleMapKey, undefined, true);
  }

  function resizeMap(width, height, dpr = window.devicePixelRatio || 1) {
    const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
    const safeHeight = Math.max(1, Math.floor(Number(height) || 1));
    const safeDpr = Math.max(1, Math.min(3, Number(dpr) || 1));
    query("[data-bonsai-map-stack]")?.querySelectorAll("[data-bonsai-layer]").forEach((canvas) => {
      const backingWidth = Math.max(1, Math.round(safeWidth * safeDpr));
      const backingHeight = Math.max(1, Math.round(safeHeight * safeDpr));
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;
    });
    renderer()?.resize?.(safeWidth, safeHeight, safeDpr);
    renderCity(state.current || state.setupPreview);
  }

  // Tile → screen, using the same shared MATH the Canvas backend projects
  // with (the renderers are not ours to edit; reading the global is enough).
  function tileScreenPoint(tile) {
    const math = window.AISystem6BonsaiRenderer;
    const stats = renderer()?.debugStats?.() || {};
    const size = state.current?.size || 0;
    if (!math?.project || !size || !Number.isInteger(tile?.x) || !Number.isInteger(tile?.y)) return null;
    const zoom = Number.isFinite(stats.zoom) ? stats.zoom : 1;
    const camera = math.createCamera({
      size,
      zoom,
      rotation: Number.isFinite(stats.rotation) ? stats.rotation : 0,
      originX: (Number(stats.cssWidth) || 0) / 2 + (Number(stats.panX) || 0),
      originY: (Number(stats.cssHeight) || 0) / 2 - (size - 1) * (math.TILE_H / 2) * zoom + (Number(stats.panY) || 0),
    });
    const info = sim()?.tileInfo?.(state.current, tile.x, tile.y) || {};
    const altitude = Number(info.altitude ?? info.alt ?? 0) || 0;
    const point = math.project(tile.x, tile.y, altitude, camera, size);
    return Number.isFinite(point?.sx) && Number.isFinite(point?.sy) ? { x: point.sx, y: point.sy } : null;
  }

  // The tile query balloon (M3 §3.6): a small card anchored near the tile
  // instead of a 256px side pane. It dismisses on the next tap or Esc and is
  // never routed through the system Balloon Help.
  function openTileBalloon(tile, anchor = state.lastPointer) {
    if (!state.current || !tile) return;
    state.selectedTile = tile;
    const balloon = query("[data-bonsai-tile-balloon]");
    if (!balloon) return;
    const info = sim().tileInfo?.(state.current, tile.x, tile.y) || {};
    const yesNo = (value) => t(value ? "bonsai_value_yes" : "bonsai_value_no");
    const zoneKeys = ["bonsai_zone_none", "bonsai_zone_residential", "bonsai_zone_commercial", "bonsai_zone_industrial", "bonsai_zone_military", "bonsai_zone_airport", "bonsai_zone_seaport"];
    const densityKeys = ["bonsai_density_none", "bonsai_density_low", "bonsai_density_high"];
    const problemCode = info.problem?.code || info.problem;
    const rows = {
      bonsai_location: `${tile.x}, ${tile.y}`,
      bonsai_tile_terrain: info.terrain ?? info.base,
      bonsai_tile_altitude: info.altitude ?? info.alt,
      bonsai_tile_zone: t(zoneKeys[info.zone] || zoneKeys[0]),
      bonsai_tile_density: t(densityKeys[info.density] || densityKeys[0]),
      // Ruleset 5: the building standing on this tile's lot, what it holds,
      // and the ground it stands on.
      bonsai_tile_building: info.lot?.built
        ? t("bonsai_lot_summary", info.lot.size, t(`bonsai_lot_tier_${info.lot.tier}`), t(`bonsai_lot_state_${info.lot.state}`))
        : (info.lot ? t("bonsai_lot_empty") : "—"),
      ...(info.lot?.built ? { [info.zone === 1 ? "bonsai_tile_residents" : "bonsai_tile_jobs"]: info.zone === 1 ? info.lot.residents : info.lot.jobs } : {}),
      bonsai_tile_land_value: info.landValue ?? "—",
      bonsai_tile_crime: info.crime ?? "—",
      bonsai_tile_pollution: info.pollution ?? "—",
      bonsai_tile_traffic: info.traffic ?? "—",
      ...(info.lot ? { bonsai_tile_commute: info.lot.commuteDistance == null ? t("bonsai_value_no") : t("bonsai_tile_commute_value", info.lot.commuteDistance) } : {}),
      bonsai_catalog_label: info.catalogId
        ? t(window.AISystem6BonsaiCatalog?.entryOf?.(info.catalogId)?.labelKey || "bonsai_catalog_infrastructure")
        : "—",
      bonsai_microsim: info.microsim && info.microsim.stat
        ? `${t(`bonsai_microsim_${info.microsim.stat}`)} ${info.microsim.value}`
        : "—",
      bonsai_tile_power: yesNo(info.powered),
      bonsai_tile_water: yesNo(info.watered ?? info.hasWater),
      bonsai_tile_road: yesNo(info.roadConnected ?? info.roadOk),
      bonsai_tile_problem: problemCode ? t("bonsai_rejection_reason", problemCode) : "—",
      // A plant built before the SC2K 4x4 footprint keeps its 2x2 pad; the
      // balloon says so instead of letting the map lie about its size.
      bonsai_tile_footprint: info.facilityFootprint
        ? `${info.facilityFootprint.w}×${info.facilityFootprint.h}${info.facilityFootprint.legacy ? ` · ${t("bonsai_footprint_legacy")}` : ""}`
        : "—",
      // What runs through this tile, read from the lines the mayor laid: the
      // line that passes here, and the stop that stands here.
      bonsai_tile_transit: transitAtTile(tile) || "—",
    };
    balloon.innerHTML = `
      <div class="bonsai-tile-balloon-title">${t("bonsai_tile_inspector")}<span>${tile.x}, ${tile.y}</span></div>
      <dl>${renderDefinitionRows(rows)}</dl>`;
    const point = tileScreenPoint(tile) || (anchor && Number.isFinite(anchor.x) ? { x: anchor.x, y: anchor.y } : null);
    const shell = query(".bonsai-map-shell");
    const shellRect = shell?.getBoundingClientRect();
    const stackRect = query("[data-bonsai-map-stack]")?.getBoundingClientRect();
    if (point && shellRect && stackRect) {
      const width = Math.min(230, Math.max(140, shellRect.width - 24));
      const height = Math.min(shellRect.height - 24, 260);
      const x = Math.max(4, Math.min(point.x - stackRect.left, shellRect.width - width - 4));
      const y = Math.max(4, Math.min(point.y - stackRect.top + 8, shellRect.height - height - 4));
      balloon.style.setProperty("--balloon-x", `${x}px`);
      balloon.style.setProperty("--balloon-y", `${y}px`);
    }
    balloon.hidden = false;
    scheduleSessionCommit();
  }

  function closeTileBalloon() {
    const balloon = query("[data-bonsai-tile-balloon]");
    if (balloon) balloon.hidden = true;
    state.selectedTile = null;
  }

  function tileBalloonOpen() {
    const balloon = query("[data-bonsai-tile-balloon]");
    return !!balloon && balloon.hidden === false;
  }

  function openReport() {
    if (!state.current) return;
    state.inspectorMode = "report";
    renderInspector();
    scheduleSessionCommit();
  }

  function openBudget() {
    if (!state.current) return;
    state.inspectorMode = "budget";
    renderInspector();
    scheduleSessionCommit();
  }

  function openNews() {
    if (!state.current) return;
    state.inspectorMode = "news";
    renderInspector();
    scheduleSessionCommit();
  }

  // The line passing over one tile, and the stop standing on it.
  function transitAtTile(tile) {
    const sidecar = state.current?.transitLines;
    if (!sidecar || !Array.isArray(sidecar.lines)) return "";
    const names = [];
    for (const line of sidecar.lines) {
      let onTile = false;
      for (let i = 0; i + 1 < line.tiles.length; i += 2) {
        if (line.tiles[i] === tile.x && line.tiles[i + 1] === tile.y) {
          onTile = true;
          break;
        }
      }
      const stop = (line.stations || []).find((station) => station.x === tile.x && station.y === tile.y);
      const label = currentLanguage === "zh" ? line.name?.zh : line.name?.en;
      if (stop) {
        const stopName = currentLanguage === "zh" ? stop.name?.zh : stop.name?.en;
        names.push(`${label} · ${stopName}`);
      } else if (onTile) {
        names.push(label);
      }
    }
    return names.join("、");
  }

  // 本市交通: what the city actually runs, read from the lines the mayor laid.
  // A city with no laid lines has no box — nothing here is invented, and the
  // only city-wide figure is the corridor ridership the simulation keeps.
  function transitBoxMarkup() {
    const sidecar = state.current?.transitLines;
    if (!sidecar || !Array.isArray(sidecar.lines) || !sidecar.lines.length) return "";
    const perDay = Number(sim().TICKS_PER_DAY) || 5;
    const rows = sidecar.lines.map((line) => {
      const mode = line.mode === "bus" ? "bus" : line.mode === "brt" ? "brt" : "metro";
      const name = currentLanguage === "zh" ? line.name?.zh : line.name?.en;
      const stops = (line.stations || [])
        .map((station) => (currentLanguage === "zh" ? station.name?.zh : station.name?.en))
        .filter(Boolean);
      const ends = stops.length >= 2 ? `${stops[0]} → ${stops[stops.length - 1]}` : (stops[0] || "");
      const opened = Number.isInteger(line.laidTick) && state.current.tick - line.laidTick <= 30 * perDay
        ? `<em>${t("bonsai_transit_this_month")}</em>`
        : "";
      return `<li>${escapeHtml(t(`bonsai_transit_mode_${mode}`))} · <strong>${escapeHtml(name || line.id)}</strong> — ${escapeHtml(ends)} `
        + `· ${escapeHtml(t("bonsai_transit_stops", stops.length))}${opened ? ` ${opened}` : ""}</li>`;
    }).join("");
    const riders = Number(state.current.busService?.busRiders) || 0;
    return `<h4 class="bonsai-transit-title">${escapeHtml(t("bonsai_transit_box"))}</h4>`
      + `<ul class="bonsai-transit-lines">${rows}</ul>`
      + `<p class="bonsai-transit-note">${escapeHtml(t("bonsai_transit_riders", formatMoney(riders)))}</p>`;
  }

  function openGraphs() {
    if (!state.current) return;
    state.inspectorMode = "graphs";
    renderInspector();
    scheduleSessionCommit();
  }

  // The Population window's graph button pre-selects the demographic series
  // before handing over to the shared graphs panel.
  function openDemographicGraphs() {
    if (!state.current) return;
    state.graphSeries = [...DEMOGRAPHIC_SERIES];
    openGraphs();
  }

  function openPopulation() {
    if (!state.current) return;
    state.inspectorMode = "population";
    renderInspector();
    scheduleSessionCommit();
  }

  function openIndustry() {
    if (!state.current) return;
    state.inspectorMode = "industry";
    renderInspector();
    scheduleSessionCommit();
  }

  function openNeighbors() {
    if (!state.current) return;
    state.inspectorMode = "neighbors";
    renderInspector();
    scheduleSessionCommit();
  }

  // The advisors (spec 3.12): six voices, each naming the one or two things
  // that matter now; the core says which and where, the words are ours.
  function openAdvisors() {
    if (!state.current) return;
    state.inspectorMode = "advisors";
    renderInspector();
    scheduleSessionCommit();
  }

  function advisorsMarkup() {
    const report = sim().advisorReport?.(state.current);
    if (!report) return "";
    const severity = ["ok", "note", "warn", "urgent"];
    return `<div class="bonsai-advisors">${report.advisors.map((advisor) => `
      <section class="bonsai-advisor" data-bonsai-advisor="${advisor.id}">
        <h4>${t(`bonsai_advisor_${advisor.id}`)}</h4>
        <ul>${advisor.items.map((item) => `
          <li class="bonsai-advice is-${severity[item.severity] || "ok"}" data-bonsai-advice="${item.key}">
            <span>${t(`bonsai_advice_${item.key}`, item.values || {})}</span>
            ${item.at ? `<button class="btn mini-btn" type="button" data-bonsai-advisor-locate="${item.at.x},${item.at.y}">${t("bonsai_advisor_locate")}</button>` : ""}
          </li>`).join("")}</ul>
      </section>`).join("")}</div>`;
  }

  function locateAdvice(button) {
    const [x, y] = String(button.dataset.bonsaiAdvisorLocate || "").split(",").map(Number);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return;
    centerViewOnTile({ x, y });
    openTileBalloon({ x, y });
  }

  function setOverlay(value) {
    state.overlay = OVERLAYS.includes(value) ? value : "none";
    renderCity();
    renderMiniMap();
    updateOverlayChips();
    renderStatus();
    scheduleSessionCommit();
  }

  // The four 选项 display toggles (M4): show buildings / infrastructure /
  // zones, and the underground view. They are view state only; the Canvas
  // backend filters its layers by the same object.
  function setDisplay(key) {
    if (!(key in state.display)) return;
    state.display[key] = !state.display[key];
    renderCity();
    renderStatus();
    syncDisplayMenuChecks();
    scheduleSessionCommit();
  }

  // The study model — the white, basswood or chipboard massing model of an
  // architecture studio — is a 3D presentation, so choosing one from the 2D
  // view opens the 3D view.
  function setStudyModel(kind) {
    state.display.studyModel = kind;
    if (kind !== "none" && state.rendererBackend !== "three-voxel") setRendererBackend("three-voxel");
    renderCity();
    syncDisplayMenuChecks();
    scheduleSessionCommit();
  }

  function syncDisplayMenuChecks() {
    document.querySelectorAll(".menu-popover button, .menu-submenu-popover button").forEach((button) => {
      const key = button.dataset.bonsaiDisplay;
      const study = button.dataset.bonsaiStudy;
      const on = key ? state.display[key] === true
        : study ? state.display.studyModel === study
          : button.dataset.bonsaiAutoBudget ? state.autoBudget : null;
      if (on === null) return;
      button.classList.toggle("is-checked", on);
      if (button.hasAttribute("aria-pressed")) setArmed(button, on);
    });
  }

  // The 报纸 menu's delivered-papers row is dynamic: once an edition exists it
  // names it, so the menu stays honest about what the player can open.
  function syncNewspaperMenu() {
    document.querySelectorAll('[data-action="bonsai-news"]').forEach((button) => {
      const paper = state.current?.newspaper;
      const date = state.current ? sim()?.dateOf?.(state.current) : null;
      if (paper && date) {
        button.textContent = `${t("bonsai_news")} · ${t(paper.extra ? "bonsai_news_edition_extra" : "bonsai_news_edition_regular", paper.edition, date.year)}`;
      } else {
        button.textContent = t("bonsai_news");
      }
    });
  }

  function submitPolicy(payload) {
    if (!state.current || state.writeBoundary) return false;
    state.clientSequence += 1;
    const command = {
      schemaVersion: 2,
      type: "set-policy",
      payload,
      targetTick: state.current.tick,
      clientCommandId: `bonsai-policy-${state.clientSequence}`,
    };
    const fallbackSnapshot = typeof sim().undo === "function" ? null : snapshotForFallbackUndo();
    const receipt = sim().submitCommand(state.current, command);
    if (!receipt?.accepted) {
      setMessage("bonsai_status_policy_failed", t("bonsai_rejection_reason", receipt?.code || "invalid"));
      renderStatus();
      return false;
    }
    if (fallbackSnapshot) recordFallbackUndo(fallbackSnapshot);
    state.dirty = true;
    scheduleAutosave();
    receipt.events?.forEach(handleSimEvent);
    setMessage("bonsai_status_policy_updated");
    renderAll();
    return true;
  }

  // Founding ends the terrain editor: the clock starts, sculpting costs
  // money again, and the full toolbox comes back.
  function foundCity() {
    if (!submitPolicy({ policy: "found-city" })) return;
    buildRail();
    renderSubPalette();
    setMessage("bonsai_status_city_founded");
    renderStatus();
  }

  function closeInspector() {
    // The departure picker is a question the caller is awaiting. Closing the
    // panel is an answer -- "no" -- and if it were not, the send would sit on a
    // promise nobody ever settles.
    const pendingDeparture = state.micropolisDeparture;
    state.micropolisDeparture = null;
    state.inspectorMode = "";
    state.selectedTile = null;
    if (pendingDeparture) pendingDeparture.resolve(null);
    const inspector = query("[data-bonsai-inspector]");
    if (inspector) inspector.hidden = true;
    query(".bonsai-pane")?.classList.remove("has-inspector");
    scheduleSessionCommit();
  }

  function renderDefinitionRows(values) {
    return Object.entries(values).map(([key, value]) => `<dt>${t(key)}</dt><dd>${String(value ?? "—")}</dd>`).join("");
  }

  function selectedOption(value, current) {
    return String(value) === String(current) ? " selected" : "";
  }

  function budgetControlsMarkup() {
    const funding = state.current?.funding || {};
    const taxRates = state.current?.taxRates || { r: 7, c: 7, i: 7 };
    const bonds = state.current?.bonds || [];
    const ordinances = state.current?.ordinances || {};
    const services = sim()?.FUNDING_SERVICES || [];
    const ordinanceIds = sim()?.ORDINANCE_IDS || [];
    const taxSelect = (key) => `<label><span>${t(`bonsai_tax_${key}`)}</span><span class="select-wrap"><select data-bonsai-policy-tax-rate="${key}">${Array.from({ length: 21 }, (_, value) => `<option value="${value}"${selectedOption(value, taxRates[key])}>${value}%</option>`).join("")}</select></span></label>`;
    const section = (summaryKey, body) => `<details class="bonsai-budget-section"><summary>${t(summaryKey)}</summary><div class="bonsai-budget-section-body">${body}</div></details>`;
    return `
      <div class="bonsai-budget-controls">
        ${section("bonsai_tax_rate", `<div class="bonsai-budget-grid">${["r", "c", "i"].map(taxSelect).join("")}</div>`)}
        ${section("bonsai_funding", `<div class="bonsai-budget-grid">${services.map((service) => `<label><span>${t(`bonsai_funding_${service}`)}</span><input type="number" min="0" max="100" step="1" value="${Number(funding[service]) || 0}" data-bonsai-policy-funding="${service}" aria-label="${t(`bonsai_funding_${service}`)}"></label>`).join("")}</div>`)}
        ${section("bonsai_bonds_ordinances", `<div class="bonsai-budget-grid">
          <div class="bonsai-loan-actions"><button class="btn mini-btn" type="button" data-bonsai-policy-bond-issue>${t("bonsai_bond_issue", formatMoney(sim()?.BOND_PRINCIPAL || 10000))}</button></div>
          ${bonds.length ? `<ul class="bonsai-bond-list">${bonds.map((bond, index) => `<li><span>${formatMoney(bond.principal)} · ${bond.rate}%</span><button class="btn mini-btn" type="button" data-bonsai-policy-bond-repay="${index}">${t("bonsai_bond_repay")}</button></li>`).join("")}</ul>` : `<p class="bonsai-bond-empty">${t("bonsai_bond_none")}</p>`}
          ${ordinanceIds.map((id) => `<label class="bonsai-ordinance"><input type="checkbox" data-bonsai-policy-ordinance="${id}"${ordinances[id] ? " checked" : ""}><span>${t(`bonsai_ordinance_${id}`)}</span></label>`).join("")}
          <label class="bonsai-ordinance"><input type="checkbox" data-bonsai-policy-disasters${state.current?.disastersOff ? "" : " checked"}><span>${t("bonsai_disasters_enabled")}</span></label>
          <label class="bonsai-ordinance"><input type="checkbox" data-bonsai-auto-budget${state.autoBudget ? " checked" : ""}><span>${t("bonsai_auto_budget")}</span></label>
          ${state.yearEndHold ? `<div class="bonsai-loan-actions"><button class="btn mini-btn" type="button" data-bonsai-year-end-resume>${t("bonsai_budget_resume")}</button></div>` : ""}
        </div>`)}
      </div>`;
  }

  // The graphs panel (M4): a 1-bit line chart over the XGRP tiers the sim
  // already records. Up to three series, three ranges (10 / 50 / 100 years).
  function graphRangeSpec(range) {
    if (range === "fiveYearly-50") return { tier: "fiveYearly", slice: -10, labelKey: "bonsai_graph_years_50" };
    if (range === "fiveYearly") return { tier: "fiveYearly", slice: -20, labelKey: "bonsai_graph_years_100" };
    return { tier: "halfYearly", slice: -20, labelKey: "bonsai_graph_years_10" };
  }

  // Series ids are camelCase XGRP names; the language tables key their
  // labels in snake_case. Without this bridge, citySize and friends show
  // as raw keys in the series picker.
  function graphSeriesLabel(seriesId) {
    return t(`bonsai_graph_${seriesId.replace(/([A-Z])/g, "_$1").toLowerCase()}`);
  }

  function graphSeriesData(seriesId) {
    const spec = graphRangeSpec(state.graphRange);
    const list = state.current?.graphs?.[spec.tier]?.[seriesId] || [];
    return list.slice(spec.slice).map(Number);
  }

  function drawGraphLine1bit(context, x1, y1, x2, y2, pattern) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))));
    let phase = 0;
    for (let index = 0; index <= steps; index += 1) {
      const x = Math.round(x1 + ((x2 - x1) * index) / steps);
      const y = Math.round(y1 + ((y2 - y1) * index) / steps);
      if (pattern[Math.floor(phase / 2) % pattern.length] === 1) context.fillRect(x, y, 1, 1);
      phase += 1;
    }
  }

  function drawGraphChart(canvas) {
    if (!canvas || !state.current) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const dpr = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1));
    const cssWidth = Math.max(80, Math.round(canvas.clientWidth || 220));
    const cssHeight = Math.max(60, Math.round(canvas.clientHeight || 150));
    if (canvas.width !== Math.round(cssWidth * dpr)) canvas.width = Math.round(cssWidth * dpr);
    if (canvas.height !== Math.round(cssHeight * dpr)) canvas.height = Math.round(cssHeight * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.fillStyle = getComputedStyle(canvas).color || "#000";
    const selected = state.graphSeries.filter((seriesId) => graphSeriesData(seriesId).length > 1);
    if (!selected.length) {
      context.font = "10px monospace";
      context.fillText(t("bonsai_graph_empty"), 8, Math.round(cssHeight / 2));
      return;
    }
    const pad = 8;
    const plotW = cssWidth - pad * 2;
    const plotH = cssHeight - pad * 2;
    context.fillRect(pad, pad, 1, plotH);
    context.fillRect(pad, pad + plotH - 1, plotW, 1);
    context.fillRect(pad + plotW - 1, pad, 1, plotH);
    const patterns = [[1], [1, 0], [1, 1, 0, 0]];
    selected.forEach((seriesId, seriesIndex) => {
      const values = graphSeriesData(seriesId);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = Math.max(1, max - min);
      const step = plotW / Math.max(1, values.length - 1);
      const pattern = patterns[seriesIndex % patterns.length];
      for (let index = 0; index < values.length - 1; index += 1) {
        const x1 = pad + index * step;
        const y1 = pad + plotH - ((values[index] - min) / span) * plotH;
        const x2 = pad + (index + 1) * step;
        const y2 = pad + plotH - ((values[index + 1] - min) / span) * plotH;
        drawGraphLine1bit(context, x1, y1, x2, y2, pattern);
      }
    });
  }

  function graphControlsMarkup() {
    const rangeSpecs = ["halfYearly", "fiveYearly-50", "fiveYearly"];
    const graphSeriesIds = sim()?.GRAPH_SERIES || [];
    const rangeLabel = (range) => t(graphRangeSpec(range).labelKey);
    return `
      <div class="bonsai-graph-controls">
        <fieldset class="bonsai-graph-ranges"><legend>${t("bonsai_graph_range")}</legend>
          ${rangeSpecs.map((range) => `<label><input type="radio" name="bonsai-graph-range" value="${range}"${state.graphRange === range ? " checked" : ""}> <span>${rangeLabel(range)}</span></label>`).join("")}
        </fieldset>
        <fieldset class="bonsai-graph-series"><legend>${t("bonsai_graph_series")}</legend>
          ${graphSeriesIds.map((seriesId) => `<label class="bonsai-graph-series-item"><input type="checkbox" data-bonsai-graph-series="${seriesId}"${state.graphSeries.includes(seriesId) ? " checked" : ""}> <span>${graphSeriesLabel(seriesId)}</span></label>`).join("")}
        </fieldset>
      </div>
      <div class="bonsai-graph-legend" data-bonsai-graph-legend aria-hidden="true">${state.graphSeries.map((seriesId, index) => `<span class="bonsai-graph-legend-item is-pattern-${index}">${graphSeriesLabel(seriesId)}</span>`).join("")}</div>`;
  }

  function refreshGraphPanel() {
    drawGraphChart(query("[data-bonsai-graph-canvas]"));
    const legend = query("[data-bonsai-graph-legend]");
    if (legend) {
      legend.innerHTML = state.graphSeries.map((seriesId, index) => `<span class="bonsai-graph-legend-item is-pattern-${index}">${graphSeriesLabel(seriesId)}</span>`).join("");
    }
  }

  // The three city data windows (Population / Industry / Neighbors) draw in
  // the same 1-bit instrument style as the graphs panel. One shared canvas
  // prep keeps their pixel handling identical to drawGraphChart.
  const DEMOGRAPHIC_SERIES = Object.freeze(["health", "education", "unemployment"]);

  function prepChartCanvas(canvas) {
    if (!canvas || !state.current) return null;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const dpr = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1));
    const width = Math.max(80, Math.round(canvas.clientWidth || 220));
    const height = Math.max(60, Math.round(canvas.clientHeight || 150));
    if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
    if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = getComputedStyle(canvas).color || "#000";
    context.font = "9px monospace";
    return { context, width, height };
  }

  // Age structure: ten ten-year cohorts, oldest on top, bars scaled to the
  // widest cohort — the classic pyramid, folded to one side to fit 240px.
  function drawPopulationPyramid(canvas) {
    const chart = prepChartCanvas(canvas);
    const breakdown = sim().populationBreakdown?.(state.current);
    if (!chart || !breakdown) return;
    const { context, width, height } = chart;
    const cohorts = breakdown.cohorts.slice().reverse();
    if (!breakdown.total) {
      context.fillText(t("bonsai_graph_empty"), 8, Math.round(height / 2));
      return;
    }
    const labelW = 30;
    const countW = 48;
    const rowH = Math.floor((height - 8) / cohorts.length);
    const barMax = Math.max(1, ...cohorts.map((cohort) => cohort.population));
    const barSpan = Math.max(20, width - labelW - countW - 12);
    cohorts.forEach((cohort, index) => {
      const y = 4 + index * rowH;
      const label = cohort.toAge == null ? `${cohort.fromAge}+` : String(cohort.fromAge);
      context.fillText(label, 2, y + rowH - 3);
      const barW = Math.round((cohort.population / barMax) * barSpan);
      context.fillRect(labelW, y + 2, Math.max(cohort.population > 0 ? 1 : 0, barW), Math.max(2, rowH - 4));
      context.fillText(String(cohort.population), labelW + barSpan + 4, y + rowH - 3);
    });
  }

  // Health, education, and unemployment over the half-yearly tier — the two
  // SC2K-style demographic graphs plus the line that explains them.
  function drawDemographicsChart(canvas) {
    const chart = prepChartCanvas(canvas);
    if (!chart) return;
    const { context, width, height } = chart;
    const tier = state.current?.graphs?.halfYearly || {};
    const patterns = [[1], [1, 0], [1, 1, 0, 0]];
    const pad = 8;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;
    const drawn = DEMOGRAPHIC_SERIES.filter((seriesId) => (tier[seriesId] || []).length > 1);
    if (!drawn.length) {
      context.fillText(t("bonsai_graph_empty"), 8, Math.round(height / 2));
      return;
    }
    context.fillRect(pad, pad, 1, plotH);
    context.fillRect(pad, pad + plotH - 1, plotW, 1);
    drawn.forEach((seriesId) => {
      const values = (tier[seriesId] || []).slice(-20).map(Number);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = Math.max(1, max - min);
      const step = plotW / Math.max(1, values.length - 1);
      const pattern = patterns[DEMOGRAPHIC_SERIES.indexOf(seriesId) % patterns.length];
      for (let index = 0; index < values.length - 1; index += 1) {
        drawGraphLine1bit(context,
          pad + index * step, pad + plotH - ((values[index] - min) / span) * plotH,
          pad + (index + 1) * step, pad + plotH - ((values[index + 1] - min) / span) * plotH,
          pattern);
      }
    });
  }

  // Industry mix: one row per sector — name, share bar, share and demand.
  function drawIndustryChart(canvas) {
    const chart = prepChartCanvas(canvas);
    const industry = sim().industryBreakdown?.(state.current);
    if (!chart || !industry) return;
    const { context, width, height } = chart;
    const sectors = industry.sectors;
    const labelW = 78;
    const textW = 58;
    const rowH = Math.floor((height - 6) / sectors.length);
    const barSpan = Math.max(20, width - labelW - textW - 10);
    const ratioMax = Math.max(1, ...sectors.map((sector) => sector.ratio));
    sectors.forEach((sector, index) => {
      const y = 3 + index * rowH;
      const name = t(`bonsai_sector_${sector.id}`);
      context.fillText(name.length > 12 ? `${name.slice(0, 11)}…` : name, 2, y + rowH - 3);
      const barW = Math.round((sector.ratio / ratioMax) * barSpan);
      context.fillRect(labelW, y + 2, Math.max(sector.ratio > 0 ? 1 : 0, barW), Math.max(2, rowH - 4));
      const demand = sector.demand > 0 ? `+${sector.demand}` : String(sector.demand);
      context.fillText(`${sector.ratio}% ${demand}`, labelW + barSpan + 4, y + rowH - 3);
    });
  }

  // Neighbors: the four cities around the map on a compass card. A solid
  // spoke is a built land link to that edge; a dotted spoke is none yet.
  function drawNeighborsMap(canvas) {
    const chart = prepChartCanvas(canvas);
    const report = sim().neighborsReport?.(state.current);
    if (!chart || !report) return;
    const { context, width, height } = chart;
    // Three boxes share a row (west · city · east); the 8px gutters keep the
    // centre card from wiping its neighbours' edges.
    const boxW = Math.min(86, Math.floor((width - 24) / 3));
    const boxH = 24;
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);
    const spots = {
      north: { x: cx, y: 4 + boxH / 2 },
      south: { x: cx, y: height - 4 - boxH / 2 },
      west: { x: 4 + boxW / 2, y: cy },
      east: { x: width - 4 - boxW / 2, y: cy },
    };
    const drawBox = (x, y, title, subtitle) => {
      const left = Math.round(x - boxW / 2);
      const top = Math.round(y - boxH / 2);
      context.clearRect(left, top, boxW, boxH);
      context.strokeStyle = context.fillStyle;
      context.strokeRect(left + 0.5, top + 0.5, boxW, boxH);
      const clipped = title.length > 10 ? `${title.slice(0, 9)}…` : title;
      context.fillText(clipped, left + 4, top + 10);
      context.fillText(subtitle, left + 4, top + 20);
    };
    report.neighbors.forEach((neighbor) => {
      const spot = spots[neighbor.direction];
      if (!spot) return;
      drawGraphLine1bit(context, cx, cy, spot.x, spot.y, neighbor.linked ? [1] : [1, 0, 0]);
    });
    report.neighbors.forEach((neighbor) => {
      const spot = spots[neighbor.direction];
      if (!spot) return;
      drawBox(spot.x, spot.y, t(`bonsai_neighbor_name_${neighbor.nameIndex}`), String(neighbor.population));
    });
    const cityName = String(state.record?.name || t("bonsai_city_unnamed"));
    drawBox(cx, cy, cityName, String((Number(state.current.population) || 0) + (Number(state.current.arcoPopulation) || 0)));
  }

  function renderMiniMap() {
    const canvas = query("[data-bonsai-minimap]");
    if (!canvas || !state.current || typeof renderer()?.renderMiniMap !== "function") return;
    renderer().renderMiniMap(canvas, stampedSnapshot(state.current), {
      overlay: state.overlay,
      // What the camera is looking at, so the map can show it.
      viewport: miniMapViewportBounds(),
    });
  }

  // The minimap is a control, not a picture: it shows where the camera is
  // looking and a click on it moves the view there - Red Alert's map. The
  // bounds come from the same shared MATH the backends project with, so the
  // rectangle and the map agree about where the viewport is.
  function miniMapViewportBounds() {
    const math = window.AISystem6BonsaiRenderer;
    const stats = renderer()?.debugStats?.() || {};
    const size = Number(state.current?.size) || 0;
    const width = Number(stats.cssWidth) || 0;
    const height = Number(stats.cssHeight) || 0;
    if (!math?.visibleTiles || !size || !width || !height) return null;
    const zoom = Number.isFinite(stats.zoom) ? stats.zoom : 1;
    const camera = math.createCamera({
      size,
      zoom,
      rotation: Number.isFinite(stats.rotation) ? stats.rotation : 0,
      originX: width / 2 + (Number(stats.panX) || 0),
      originY: height / 2 - (size - 1) * (math.TILE_H / 2) * zoom + (Number(stats.panY) || 0),
    });
    const tiles = math.visibleTiles(size, camera, { left: 0, top: 0, right: width, bottom: height }, null, { margin: 0, maxAltitude: 0 });
    if (!Array.isArray(tiles) || !tiles.length) return null;
    const xs = tiles.map(([x]) => x);
    const ys = tiles.map(([, y]) => y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: minX,
      y: minY,
      width: Math.max(...xs) - minX + 1,
      height: Math.max(...ys) - minY + 1,
    };
  }

  /** The tile a minimap pointer event points at. */
  function miniMapTileAt(event) {
    const canvas = query("[data-bonsai-minimap]");
    const size = Number(state.current?.size) || 0;
    if (!canvas || !size) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * size);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * size);
    return {
      x: Math.max(0, Math.min(size - 1, x)),
      y: Math.max(0, Math.min(size - 1, y)),
    };
  }

  /**
   * Put the given tile in the middle of the map. Zoom, rotation and the data
   * view are the writer's choices, so they ride along unchanged.
   * @param {{ x: number, y: number }} tile
   */
  function centerViewOnTile(tile) {
    const size = Number(state.current?.size) || 0;
    const stats = renderer()?.debugStats?.() || {};
    if (!size || !Number.isInteger(tile?.x) || !Number.isInteger(tile?.y)) return null;
    if (typeof renderer()?.resetView !== "function") return null;
    renderer().resetView({
      size,
      center: tile,
      zoom: Number.isFinite(stats.zoom) ? stats.zoom : undefined,
      rotation: Number.isFinite(stats.rotation) ? stats.rotation : 0,
      overlay: state.overlay,
    });
    renderMiniMap();
    scheduleSessionCommit();
    return tile;
  }

  function navigateFromMiniMap(event) {
    const tile = miniMapTileAt(event);
    return tile ? centerViewOnTile(tile) : null;
  }

  function updateOverlayChips() {
    query("[data-bonsai-minimap-card]")?.querySelectorAll("[data-bonsai-overlay-chip]").forEach((chip) => {
      chip.setAttribute("aria-pressed", String(chip.dataset.bonsaiOverlayChip === state.overlay));
    });
  }

  // The minimap card floats on the playfield (M3 §3.5): a title row, the
  // shared minimap canvas and the ten data-view chips. The 窗口 → 小地图 menu
  // item and the title row toggle it; it is expanded by default on desktop
  // and starts collapsed on phones, where it opens as a half-height sheet.
  function renderMinimapCard() {
    const card = query("[data-bonsai-minimap-card]");
    if (!card) return;
    card.innerHTML = `
      <div class="bonsai-minimap-title" data-bonsai-minimap-toggle>${t("bonsai_minimap")}</div>
      <canvas class="bonsai-minimap" data-bonsai-minimap width="1" height="1" tabindex="0" aria-label="${t("bonsai_minimap")}"></canvas>
      <div class="bonsai-overlay-chips" role="group" aria-label="${t("bonsai_overlay")}">
        ${OVERLAYS.map((overlay) => `<button class="bonsai-overlay-chip" type="button" data-bonsai-overlay-chip="${overlay}" aria-pressed="${state.overlay === overlay}">${t(`bonsai_overlay_${overlay.replaceAll("-", "_")}`)}</button>`).join("")}
      </div>`;
    card.hidden = false;
    card.classList.toggle("is-collapsed", state.minimapCollapsed);
    renderMiniMap();
  }

  function toggleMinimapCard() {
    state.minimapCollapsed = !state.minimapCollapsed;
    const card = query("[data-bonsai-minimap-card]");
    if (card) {
      card.classList.toggle("is-collapsed", state.minimapCollapsed);
      if (!state.minimapCollapsed) renderMiniMap();
    }
  }

  // Sound: music/effects/off never had a receipt at all — the choice moved
  // state.audioMode and the audio engine's own gain, but nothing on screen
  // said so. setMessage reuses the same labels the menu items already show
  // (bonsai-translations.js), so this is the product's own status line, not
  // new copy.
  const BONSAI_AUDIO_MODE_LABEL_KEYS = Object.freeze({
    music: "bonsai_audio_music",
    sfx: "bonsai_audio_sfx",
    off: "bonsai_audio_off",
  });

  function setAudioMode(mode) {
    if (!["music", "sfx", "off"].includes(mode)) return;
    state.audioMode = mode;
    if (mode !== "off") audioEngine();
    syncAudioMode();
    setMessage(BONSAI_AUDIO_MODE_LABEL_KEYS[mode]);
  }

  function submitDisaster(kind) {
    if (!state.current || state.writeBoundary) return;
    const size = Number(state.current.size) || 64;
    const spawn = state.current.spawnCenter;
    const center = (spawn && Number.isFinite(spawn.x))
      ? { x: Math.max(0, Math.min(size - 1, Math.floor(spawn.x))), y: Math.max(0, Math.min(size - 1, Math.floor(spawn.y))) }
      : { x: Math.floor(size / 2), y: Math.floor(size / 2) };
    const command = commandFor({ gesture: "point", command: "trigger-disaster", kind }, center, center);
    if (!command) return;
    const receipt = sim().submitCommand(state.current, command);
    state.previewReceipt = receipt;
    if (!receipt?.accepted) {
      setMessage("bonsai_rejection_reason", receipt?.code || "invalid");
      renderStatus();
      return;
    }
    state.dirty = true;
    scheduleAutosave();
    receipt.events?.forEach(handleSimEvent);
    renderAll();
  }

  async function exportCurrentSc2() {
    if (!state.current) return false;
    try {
      const payload = sim().serialize(state.current);
      const bytes = await saveCodec().exportSc2(payload);
      const ok = window.AISystem6WebPlatform?.saveArtifact?.({
        blob: new Blob([Uint8Array.from(bytes)], { type: "application/octet-stream" }),
        fileName: `${String(state.record?.name || "bonsai-city").replace(/[^a-z0-9_-]+/gi, "-")}.sc2`,
        mimeType: "application/octet-stream",
      });
      setMessage(ok ? (isOsmCity(state.current) ? "bonsai_status_exported_sc2_osm" : "bonsai_status_exported_sc2") : "bonsai_status_export_failed");
      if (ok) reportSc2Export(payload);
      return ok;
    } catch {
      setMessage("bonsai_status_export_failed");
      return false;
    }
  }

  // --- choosing which region leaves ------------------------------------------
  //
  // A Bonsai map can be larger than the classic 120x100 one, and until now the
  // difference was resolved for the player: the window sat on the spawn centre
  // and whatever fell outside was reported afterwards as a number. That is the
  // right default and a poor only-option, because the part of a city worth
  // taking is not always in the middle of it.
  //
  // The picker is only offered when there is a choice to make -- a map no
  // larger than the classic one embeds whole -- and it answers in the units the
  // conversion uses: the rectangle is in Bonsai tiles, its origin is the origin
  // the exporter receives, and the count under it comes from the exporter's own
  // countCroppedOutside, so the preview cannot disagree with the result.
  function isInt(value) {
    return Number.isInteger(value);
  }

  function micropolisExporter() {
    return window.AISystem6BonsaiMicropolisExport || null;
  }

  function departureNeedsChoice(payload) {
    const exporter = micropolisExporter();
    if (!exporter || !payload || !isInt(payload.size)) return false;
    return payload.size > exporter.CLASSIC_WIDTH || payload.size > exporter.CLASSIC_HEIGHT;
  }

  function clampDepartureOrigin(payload, x, y) {
    const exporter = micropolisExporter();
    const size = payload.size;
    const maxX = Math.max(0, size - exporter.CLASSIC_WIDTH);
    const maxY = Math.max(0, size - exporter.CLASSIC_HEIGHT);
    return { x: clampNumber(Math.round(x), 0, maxX), y: clampNumber(Math.round(y), 0, maxY) };
  }

  function clampNumber(value, low, high) {
    if (!Number.isFinite(value)) return low;
    return Math.min(high, Math.max(low, value));
  }

  // Resolve on the player's answer, so the caller reads as one step.
  function openMicropolisDeparturePicker(payload, meta, kind) {
    const exporter = micropolisExporter();
    const start = exporter.cropWindowFor(payload);
    return new Promise((resolve) => {
      state.micropolisDeparture = {
        payload, meta, kind,
        origin: { x: start.x, y: start.y },
        cropped: exporter.countCroppedOutside(payload, { window: { x: start.x, y: start.y } }),
        resolve,
      };
      state.inspectorMode = "micropolisDeparture";
      renderInspector();
    });
  }

  function closeMicropolisDeparturePicker(answer) {
    const pending = state.micropolisDeparture;
    state.micropolisDeparture = null;
    if (state.inspectorMode === "micropolisDeparture") {
      state.inspectorMode = "";
      renderInspector();
    }
    if (pending) pending.resolve(answer);
  }

  function moveMicropolisDeparture(x, y) {
    const pending = state.micropolisDeparture;
    if (!pending) return;
    const next = clampDepartureOrigin(pending.payload, x, y);
    if (next.x === pending.origin.x && next.y === pending.origin.y) return;
    pending.origin = next;
    pending.cropped = micropolisExporter().countCroppedOutside(pending.payload, { window: { x: next.x, y: next.y } });
    drawMicropolisDeparturePreview(query("[data-bonsai-departure-canvas]"));
    const readout = query("[data-bonsai-departure-readout]");
    if (readout) readout.textContent = departureReadoutText(pending);
  }

  function departureReadoutText(pending) {
    const exporter = micropolisExporter();
    return t(
      "bonsai_micropolis_departure_readout",
      pending.origin.x, pending.origin.y,
      exporter.CLASSIC_WIDTH, exporter.CLASSIC_HEIGHT,
      pending.cropped,
    );
  }

  // A 1-bit plan of the whole map: water, planting, built. Enough to recognise
  // where the city is, which is the only question the rectangle asks.
  function drawMicropolisDeparturePreview(canvas) {
    const pending = state.micropolisDeparture;
    if (!canvas || !pending) return;
    const exporter = micropolisExporter();
    const payload = pending.payload;
    const size = payload.size;
    const scale = Math.max(1, Math.floor(canvas.width / size));
    const inset = Math.floor((canvas.width - size * scale) / 2);
    const insetY = Math.floor((canvas.height - size * scale) / 2);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const styles = getComputedStyle(canvas);
    const paper = styles.getPropertyValue("--paper").trim() || "#ffffff";
    const ink = styles.getPropertyValue("--ink").trim() || "#000000";
    const shade = styles.getPropertyValue("--shade").trim() || "#808080";
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const built = (i) => payload.zone[i] || payload.road[i] || payload.rail[i] || payload.wire[i] || payload.catalogId[i];
    const planted = (i) => payload.tree[i] || payload.park[i];
    for (let by = 0; by < size; by += 1) {
      for (let bx = 0; bx < size; bx += 1) {
        const i = by * size + bx;
        let fill = "";
        if (built(i)) fill = ink;
        else if (payload.water[i]) fill = shade;
        else if (planted(i)) fill = shade;
        if (!fill) continue;
        ctx.fillStyle = fill;
        ctx.fillRect(inset + bx * scale, insetY + by * scale, scale, scale);
      }
    }
    // The rectangle is drawn twice so it reads on both ink and paper.
    const rx = inset + pending.origin.x * scale;
    const ry = insetY + pending.origin.y * scale;
    const rw = exporter.CLASSIC_WIDTH * scale;
    const rh = exporter.CLASSIC_HEIGHT * scale;
    ctx.lineWidth = 3;
    ctx.strokeStyle = paper;
    ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink;
    ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
    canvas.dataset.bonsaiDepartureScale = String(scale);
    canvas.dataset.bonsaiDepartureInsetX = String(inset);
    canvas.dataset.bonsaiDepartureInsetY = String(insetY);
  }

  function bindMicropolisDeparturePreview(canvas) {
    const pending = state.micropolisDeparture;
    if (!canvas || !pending) return;
    const exporter = micropolisExporter();
    const toOrigin = (event) => {
      const rect = canvas.getBoundingClientRect();
      const scale = Number(canvas.dataset.bonsaiDepartureScale) || 1;
      const insetX = Number(canvas.dataset.bonsaiDepartureInsetX) || 0;
      const insetY = Number(canvas.dataset.bonsaiDepartureInsetY) || 0;
      // Pointer coordinates are CSS pixels; the canvas has its own backing size.
      const px = (event.clientX - rect.left) * (canvas.width / rect.width);
      const py = (event.clientY - rect.top) * (canvas.height / rect.height);
      // The rectangle centres on the finger, which is what a drag means here.
      return {
        x: (px - insetX) / scale - exporter.CLASSIC_WIDTH / 2,
        y: (py - insetY) / scale - exporter.CLASSIC_HEIGHT / 2,
      };
    };
    const move = (event) => {
      const next = toOrigin(event);
      moveMicropolisDeparture(next.x, next.y);
    };
    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture?.(event.pointerId);
      canvas.focus({ preventScroll: true });
      event.preventDefault();
      move(event);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (event.buttons === 0) return;
      event.preventDefault();
      move(event);
    });
    canvas.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 10 : 1;
      const current = state.micropolisDeparture?.origin;
      if (!current) return;
      let dx = 0;
      let dy = 0;
      if (event.key === "ArrowLeft") dx = -step;
      else if (event.key === "ArrowRight") dx = step;
      else if (event.key === "ArrowUp") dy = -step;
      else if (event.key === "ArrowDown") dy = step;
      else return;
      event.preventDefault();
      moveMicropolisDeparture(current.x + dx, current.y + dy);
    });
  }

  function renderInspector() {
    const inspector = query("[data-bonsai-inspector]");
    if (!inspector || !state.current || !state.inspectorMode) {
      if (inspector) inspector.hidden = true;
      query(".bonsai-pane")?.classList.remove("has-inspector");
      return;
    }
    let titleKey;
    let rows;
    let controls = "";
    if (state.inspectorMode === "report") {
      titleKey = "bonsai_city_report";
      const report = sim().cityReport?.(state.current) || {};
      rows = {
        bonsai_population: report.population ?? state.current.population,
        bonsai_rating: report.rating,
        bonsai_happiness: report.happiness,
        bonsai_pollution: report.pollution,
        bonsai_crime: report.crime,
        bonsai_fire_risk: report.fireRisk,
        bonsai_traffic: report.traffic ?? report.congestedRoads,
        bonsai_budget_income: `$${formatMoney(report.lastIncome)}`,
        bonsai_budget_expense: `$${formatMoney(report.lastExpense)}`,
        bonsai_tax_rate: `${report.taxRate ?? state.current.taxRate}%`,
        ...(state.current.scenario ? {
          bonsai_scenario: state.current.scenario.id
            ? t(`bonsai_scenario_${state.current.scenario.id.replaceAll("-", "_")}`)
            : t("bonsai_scenario_imported"),
          bonsai_scenario_progress: t(`bonsai_scenario_status_${state.current.scenario.status}`,
            state.current.scenario.elapsedMonths, state.current.scenario.months),
          bonsai_scenario_goals: Object.entries(state.current.scenario.goals || {})
            .map(([key, value]) => `${t(`bonsai_goal_${key}`)} ${value}`).join(" · ") || "—",
        } : {}),
        bonsai_education_quotient: report.eq ?? state.current.eq,
        bonsai_life_expectancy: report.le ?? state.current.le,
        bonsai_unemployed: report.unemployed ?? state.current.unemployed,
        bonsai_history_months: report.history?.length ?? state.current.history?.length ?? 0,
      };
      controls = `<div class="button-row"><button class="btn" type="button" data-bonsai-open-graphs>${t("bonsai_view_graphs")}</button></div>`;
    } else if (state.inspectorMode === "flipPot") {
      titleKey = "bonsai_flip_pot";
      const current = flipPotBill();
      if (!current) {
        rows = { bonsai_flip_none: t("bonsai_flip_none") };
      } else {
        const { record, bill } = current;
        rows = {
          bonsai_flip_plan: String(record.id).slice(-12),
          bonsai_flip_total: `$${formatMoney(bill.total)}`,
          bonsai_flip_upkeep: `$${formatMoney(bill.upkeep)}`,
          bonsai_flip_funds: `$${formatMoney(state.current.funds)}`,
          bonsai_flip_blocked: bill.blocked.length ? String(bill.blocked.length) : t("bonsai_flip_none_blocked"),
        };
        const lineRows = bill.lines.map((line) => {
          const name = currentLanguage === "zh" ? line.name?.zh : line.name?.en;
          const items = line.items.map((item) => (item.kind === "track"
            ? (item.existing ? t("bonsai_flip_track_existing") : t("bonsai_flip_track", item.tiles))
            : item.kind === "station" ? t("bonsai_flip_station")
              : item.kind === "depot" ? t("bonsai_flip_depot") : t("bonsai_flip_stop"))).join(" · ");
          const reasons = line.blocked
            .map((item) => t(`bonsai_flip_reason_${String(item.code).replaceAll("-", "_")}`))
            .filter((label) => label && label !== "undefined")
            .join("、");
          const blocked = line.blocked.length
            ? `<em>${escapeHtml(t("bonsai_flip_cannot", reasons || line.blocked[0].code))}</em>`
            : "";
          return `<li><strong>${escapeHtml(name || line.lineId)}</strong> ${escapeHtml(items)} — $${formatMoney(line.cost)}${blocked ? ` ${blocked}` : ""}</li>`;
        }).join("");
        const needsDepot = bill.blocked.some((item) => item.code === "depot");
        const flipConfirmReason = bill.blocked.length
          ? "bonsai_flip_blocked_note"
          : !bill.affordable
            ? "balloon_bonsai_flip_unaffordable"
            : "";
        controls = [
          `<ul class="bonsai-flip-lines">${lineRows}</ul>`,
          `<div class="button-row">`,
          (needsDepot || state.flipDepot)
            ? `<label class="bonsai-flip-depot"><input type="checkbox" data-bonsai-flip-depot${state.flipDepot ? " checked" : ""}> ${t("bonsai_flip_depot_option")}</label>`
            : "",
          `<button class="btn" type="button" data-bonsai-flip-confirm${flipConfirmReason ? ` disabled data-balloon-help-disabled="${flipConfirmReason}"` : ""}>${t("bonsai_flip_confirm")}</button>`,
          `<button class="btn" type="button" data-bonsai-flip-cancel>${t("close")}</button>`,
          `</div>`,
          bill.blocked.length ? `<p class="bonsai-flip-note">${escapeHtml(t("bonsai_flip_blocked_note"))}</p>` : "",
          !bill.affordable ? `<p class="bonsai-flip-note">${escapeHtml(t("bonsai_flip_short", formatMoney(bill.deficit)))}</p>` : "",
        ].join("");
      }
    } else if (state.inspectorMode === "budget") {
      titleKey = "bonsai_budget";
      const budget = state.current.budget || {};
      const bonds = state.current.bonds || [];
      rows = {
        bonsai_budget_income: `$${formatMoney(state.current.lastIncome ?? budget.income)}`,
        bonsai_budget_expense: `$${formatMoney(state.current.lastExpense ?? budget.expense)}`,
        bonsai_bonds: bonds.length
          ? t("bonsai_bond_summary", bonds.length, formatMoney(bonds.reduce((sum, bond) => sum + bond.principal, 0)))
          : t("bonsai_bond_none"),
        bonsai_history_months: state.current.history?.length ?? 0,
      };
      controls = budgetControlsMarkup();
    } else if (state.inspectorMode === "news") {
      titleKey = "bonsai_news_masthead";
      const paper = state.current.newspaper || { edition: 0, extra: false, stories: [] };
      const date = sim().dateOf?.(state.current) || { year: "" };
      rows = {};
      controls = `
        <div class="bonsai-news-masthead">
          <h3 class="bonsai-news-name">${t("bonsai_news_masthead")}</h3>
          <div class="bonsai-news-edition">${paper.extra
            ? t("bonsai_news_edition_extra", paper.edition, date.year)
            : t("bonsai_news_edition_regular", paper.edition, date.year)}</div>
        </div>
        <div class="bonsai-news-stories">${teachingStory()}${(paper.stories || []).map((story) => {
          const shaped = story.key === "ordinance" ? { ...story, id: t(`bonsai_ordinance_${story.id}`) } : story;
          return `<p class="bonsai-news-story">${t(`bonsai_news_${story.key}`, shaped)}</p>`;
        }).join("") || (teachingStory() ? "" : `<p class="bonsai-news-story">${t("bonsai_news_none")}</p>`)}</div>
        ${transitBoxMarkup()}
        <label class="bonsai-ordinance"><input type="checkbox" data-bonsai-policy-newspaper${state.current.paperDelivery ? " checked" : ""}><span>${t("bonsai_news_subscribe")}</span></label>`;
    } else if (state.inspectorMode === "graphs") {
      titleKey = "bonsai_graphs";
      rows = {};
      controls = `
        <canvas class="bonsai-graph-canvas" data-bonsai-graph-canvas aria-label="${t("bonsai_graphs")}"></canvas>
        ${graphControlsMarkup()}`;
    } else if (state.inspectorMode === "population") {
      titleKey = "bonsai_population";
      const breakdown = sim().populationBreakdown?.(state.current) || null;
      rows = {
        bonsai_population_total: breakdown?.total ?? state.current.population ?? 0,
        ...(breakdown?.arcoPopulation ? { bonsai_arco_population: breakdown.arcoPopulation } : {}),
        bonsai_jobs: state.current.jobs ?? 0,
        bonsai_workforce: `${state.current.workforcePercent ?? 0}%`,
        bonsai_unemployed: state.current.unemployed ?? 0,
        bonsai_education_quotient: state.current.eq ?? 0,
        bonsai_life_expectancy: state.current.le ?? 0,
        bonsai_national_population: state.current.nationalPopulation ?? 0,
      };
      controls = `
        <p class="bonsai-goals-note">${t("bonsai_population_pyramid")}</p>
        <canvas class="bonsai-graph-canvas" data-bonsai-population-pyramid aria-label="${t("bonsai_population_pyramid")}"></canvas>
        <p class="bonsai-goals-note">${t("bonsai_population_trends")}</p>
        <canvas class="bonsai-graph-canvas" data-bonsai-demographics-canvas aria-label="${t("bonsai_population_trends")}"></canvas>
        <div class="bonsai-graph-legend" aria-hidden="true">${DEMOGRAPHIC_SERIES.map((seriesId, index) => `<span class="bonsai-graph-legend-item is-pattern-${index}">${graphSeriesLabel(seriesId)}</span>`).join("")}</div>
        <div class="button-row"><button class="btn" type="button" data-bonsai-open-demographic-graphs>${t("bonsai_view_graphs")}</button></div>`;
    } else if (state.inspectorMode === "industry") {
      titleKey = "bonsai_industry";
      const industry = sim().industryBreakdown?.(state.current) || null;
      rows = {
        bonsai_industrial_jobs: state.current.iJobs ?? 0,
        bonsai_commercial_jobs: state.current.cJobs ?? 0,
        bonsai_economy_index: state.current.economyIndex ?? 0,
        bonsai_industry_demand: state.current.demand?.i ?? 0,
        bonsai_commerce_demand: state.current.demand?.c ?? 0,
        bonsai_residential_demand: state.current.demand?.r ?? 0,
      };
      controls = `
        <p class="bonsai-goals-note">${t("bonsai_industry_mix", industry?.year ?? "")}</p>
        <canvas class="bonsai-graph-canvas" data-bonsai-industry-canvas aria-label="${t("bonsai_industry_mix", industry?.year ?? "")}"></canvas>
        <p class="bonsai-goals-note">${t("bonsai_industry_note")}</p>`;
    } else if (state.inspectorMode === "goals") {
      titleKey = "bonsai_opening_goals";
      rows = {};
      const done = state.completedGoals.size;
      controls = `
        <p class="bonsai-goals-note">${t("bonsai_goals_note")}</p>
        <ol class="bonsai-goals-list">${GOALS.map((goal) => {
          const met = state.completedGoals.has(goal.id);
          return `<li class="${met ? "is-complete" : ""}">${met ? "\u2713" : "\u25a1"} ${t(`bonsai_goal_${goal.id}`)}</li>`;
        }).join("")}</ol>
        <p class="bonsai-goals-note">${t("bonsai_goals_progress", done, GOALS.length)}</p>`;
    } else if (state.inspectorMode === "micropolisDeparture") {
      const pending = state.micropolisDeparture;
      titleKey = pending?.kind === "cty" ? "bonsai_micropolis_departure_title_cty" : "bonsai_micropolis_departure_title";
      rows = {};
      controls = pending ? `
        <p class="bonsai-goals-note">${t("bonsai_micropolis_departure_note")}</p>
        <canvas class="bonsai-departure-canvas" data-bonsai-departure-canvas width="264" height="264"
          tabindex="0" role="application" aria-label="${t("bonsai_micropolis_departure_canvas_label")}"></canvas>
        <p class="bonsai-goals-note" data-bonsai-departure-readout>${departureReadoutText(pending)}</p>
        <div class="bonsai-departure-actions">
          <button class="btn" type="button" data-bonsai-departure-cancel>${t("cancel")}</button>
          <button class="btn default" type="button" data-bonsai-departure-confirm>${t(pending.kind === "cty" ? "bonsai_micropolis_departure_export" : "bonsai_micropolis_departure_send")}</button>
        </div>` : "";
    } else if (state.inspectorMode === "advisors") {
      titleKey = "bonsai_advisors";
      rows = {};
      controls = advisorsMarkup();
    } else if (state.inspectorMode === "neighbors") {
      titleKey = "bonsai_neighbors";
      const report = sim().neighborsReport?.(state.current) || null;
      rows = { bonsai_national_population: state.current.nationalPopulation ?? 0 };
      (report?.neighbors || []).forEach((neighbor) => {
        const name = t(`bonsai_neighbor_name_${neighbor.nameIndex}`);
        rows[`bonsai_neighbor_${neighbor.direction}`] = neighbor.linked
          ? `${name} — ${t("bonsai_neighbor_detail", neighbor.population, neighbor.trade)}`
          : `${name} — ${t("bonsai_neighbor_detail_unlinked", neighbor.population)}`;
      });
      controls = `
        <canvas class="bonsai-graph-canvas" data-bonsai-neighbors-canvas aria-label="${t("bonsai_neighbors")}"></canvas>
        <p class="bonsai-goals-note">${t("bonsai_neighbors_note")}</p>
        <ul class="bonsai-neighbor-actions">${(report?.neighbors || []).map((neighbor) => `<li><button class="btn mini-btn" type="button" data-bonsai-rootline-neighbor="${neighbor.direction}" data-bonsai-neighbor-index="${neighbor.nameIndex}">${t("bonsai_neighbor_look_rootline")}</button></li>`).join("")}</ul>`;
    }
    inspector.innerHTML = `
      <div class="bonsai-subwindow-title">
        <h3 id="bonsai-inspector-title">${t(titleKey)}</h3>
        <button class="btn mini-btn" type="button" data-bonsai-inspector-close aria-label="${t("close")}">×</button>
      </div>
      <dl>${renderDefinitionRows(rows)}</dl>
      ${controls}`;
    inspector.hidden = false;
    query(".bonsai-pane")?.classList.add("has-inspector");
    if (state.inspectorMode === "graphs") {
      drawGraphChart(query("[data-bonsai-graph-canvas]"));
    } else if (state.inspectorMode === "population") {
      drawPopulationPyramid(query("[data-bonsai-population-pyramid]"));
      drawDemographicsChart(query("[data-bonsai-demographics-canvas]"));
    } else if (state.inspectorMode === "industry") {
      drawIndustryChart(query("[data-bonsai-industry-canvas]"));
    } else if (state.inspectorMode === "neighbors") {
      drawNeighborsMap(query("[data-bonsai-neighbors-canvas]"));
    } else if (state.inspectorMode === "micropolisDeparture") {
      const canvas = query("[data-bonsai-departure-canvas]");
      drawMicropolisDeparturePreview(canvas);
      bindMicropolisDeparturePreview(canvas);
      canvas?.focus({ preventScroll: true });
      query("[data-bonsai-departure-cancel]")?.addEventListener("click", () => closeMicropolisDeparturePicker(null));
      query("[data-bonsai-departure-confirm]")?.addEventListener("click", () => {
        const pending = state.micropolisDeparture;
        closeMicropolisDeparturePicker(pending ? { x: pending.origin.x, y: pending.origin.y } : null);
      });
    }
  }

  async function listSavedCities() {
    const db = await openAppDb();
    try {
      const records = await window.AISystem6StorageTransactions.runTransaction(
        db,
        bonsaiCitiesStoreName,
        "readonly",
        (tx) => idbRequest(tx.objectStore(bonsaiCitiesStoreName).getAll())
      );
      return Array.isArray(records) ? records : [];
    } finally {
      db.close();
    }
  }

  // Micropolis saves live in their own `cities` store in the same browser
  // database. Bonsai only reads them, only when the browser panel is open,
  // and only imports one after the user picks it and confirms — the classic
  // SC1→SC2K path: upgrade-only, never back, 召唤而非推送.
  async function listMicropolisSaves() {
    try {
      const db = await openAppDb();
      try {
        const records = await window.AISystem6StorageTransactions.runTransaction(
          db,
          citiesStoreName,
          "readonly",
          (tx) => idbRequest(tx.objectStore(citiesStoreName).getAll())
        );
        return (Array.isArray(records) ? records : [])
          .filter((record) => record && window.AISystem6BonsaiMicropolisCodec?.looksLikeMicropolisSave(record.saveData))
          .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      } finally {
        db.close();
      }
    } catch {
      return [];
    }
  }

  // The import report is the honesty gate of the one-way path. The codec
  // knows what the classic model holds and Bonsai cannot take; without this
  // the player sees only "imported" and must find the missing facts by
  // playing. Every warning code the codec emits gets a line, and an unknown
  // code shows itself rather than disappearing, so a new code can never go
  // silently unreported.
  function reportConversion(warnings, introKey, notePrefix) {
    const prefix = notePrefix || ["bonsai", "micropolis", "note", ""].join("_");
    const codes = Array.isArray(warnings) ? warnings : [];
    if (!codes.length) return;
    const lines = codes.map((code) => {
      const raw = String(code);
      const splitAt = raw.indexOf(":");
      const name = splitAt === -1 ? raw : raw.slice(0, splitAt);
      const count = splitAt === -1 ? 0 : Number(raw.slice(splitAt + 1)) || 0;
      const key = `${prefix}${name.replace(/-/g, "_")}`;
      const text = t(key, count);
      // A code with no sentence shows itself. A missing line must not vanish.
      return `• ${text === key ? raw : text}`;
    });
    // The report is a receipt for work that already finished, not a decision:
    // it reads in the notification list instead of stopping the read.
    pushSystemNotification(`${t(introKey)}\n${lines.join("\n")}`);
  }

  function reportMicropolisImport(warnings, introKey = "bonsai_micropolis_report_intro") {
    reportConversion(warnings, introKey);
  }

  function reportSc2Export(payload) {
    const report = saveCodec().sc2LossReport(payload);
    const notePrefix = ["bonsai", "sc2", "note", ""].join("_");
    reportConversion(report && report.warnings, "bonsai_sc2_report_intro", notePrefix);
  }

  // The way back. Bonsai summons Micropolis cities and can send a city
  // back; both directions are lossy, and the loss report is the honesty
  // gate here as it is on the way in. The record lands in the GPL game's
  // own `cities` store as plain JSON numbers with a provenance stamp; this
  // Bonsai city is not changed.
  async function sendPayloadToMicropolis(payload, meta) {
    const exporter = window.AISystem6BonsaiMicropolisExport;
    if (!exporter || !payload) return false;
    let chosenWindow = null;
    if (departureNeedsChoice(payload)) {
      // There is a real choice here, so it is the player's. The picker is the
      // confirm for this path: its own button sends, and closing it does not.
      chosenWindow = await openMicropolisDeparturePicker(payload, meta, "send");
      if (!chosenWindow) return false;
    } else {
      const window_ = exporter.cropWindowFor(payload);
      const answer = await showSystemModal(
        t("bonsai_micropolis_send_confirm", meta.name || t("bonsai_city_unnamed"), window_.width, window_.height),
        "confirm",
      );
      if (answer !== "yes" && answer !== "ok") return false;
    }
    setMessage("bonsai_status_sending_micropolis");
    try {
      const exportedAt = new Date().toISOString();
      const exported = await saveCodec().exportMicropolis(payload, {
        name: meta.name, cityId: meta.id || null, exportedAt,
        powered: meta.powered ? Array.from(meta.powered) : null, population: meta.population | 0,
        ...(chosenWindow ? { window: chosenWindow } : {}),
      });
      const record = {
        id: crypto.randomUUID ? crypto.randomUUID() : `city-${Date.now()}`,
        name: exported.name || t("bonsai_city_unnamed"),
        createdAt: exportedAt, updatedAt: exportedAt, schemaVersion: 1,
        population: exported.population, saveData: exported.saveData,
      };
      const db = await openAppDb();
      try {
        await window.AISystem6StorageTransactions.runTransaction(
          db, citiesStoreName, "readwrite",
          (tx) => idbRequest(tx.objectStore(citiesStoreName).put(record)),
        );
      } finally {
        db.close();
      }
      setMessage("bonsai_status_sent_micropolis", record.name);
      await reportMicropolisImport(exported.warnings, "bonsai_micropolis_send_report_intro");
      return true;
    } catch {
      setMessage("bonsai_status_export_failed");
      return false;
    }
  }

  // Down to the street: Joyride drives a copy of the city as it stands now
  // (typed arrays included, so nothing Joyride does can reach this city or
  // its save), carrying the mayor's day, season, light and calendar through
  // the shared hand-over. The middle of the map view is where the car is put
  // down, and the clock stops here so the way back can restore it.
  async function driveCurrentStreets() {
    if (!state.current) return false;
    state.speedBeforeStreets = state.speed;
    setSpeed(0);
    const from = streetDepartureTile();
    const payload = cityHandoffPayload(from);
    if (typeof ensureJoyrideModule === "function") await ensureJoyrideModule();
    if (payload) {
      window.AISystem6Joyride?.queueCity?.(payload);
    } else {
      // No shared core on this page: keep the older one-shot hand-over.
      window.AISystem6Joyride?.queueCity?.({
        snapshot: structuredClone(sim().buildRenderSnapshot(state.current)),
        name: String(state.record?.name || t("bonsai_city_unnamed")),
        from,
        osm: isOsmCity(state.current),
        descend: true,
      });
    }
    await openWindow("joyride");
    return true;
  }

  // The way back up: Joyride's and Rootline's File menus call this on the
  // window global. It gives the clock the speed it held when the car left
  // (once — the lifecycle resume hook shares this), puts the view back on
  // the tile the car stopped at, and says where the mayor has returned.
  function resumeFromStreetsSpeed() {
    if (state.speedBeforeStreets === null || state.speedBeforeStreets === undefined) return false;
    const speed = state.speedBeforeStreets;
    state.speedBeforeStreets = null;
    setSpeed(speed ?? 1);
    return true;
  }

  function returnFromStreets({ cityId, tile } = {}) {
    const targetId = cityId || null;
    if (targetId && targetId !== state.record?.id) return false;
    if (!state.current) return false;
    resumeFromStreetsSpeed();
    if (tile && Number.isInteger(tile.x) && Number.isInteger(tile.y)) centerViewOnTile(tile);
    setMessage("bonsai_status_back_from_streets", districtNameAt(tile), potDateText(state.current));
    return true;
  }

  // L3: a neighbouring pot becomes a nursery in Rootline. The button carries
  // the rim side and the name index; the shared namer turns them into the
  // seed and the bilingual name the planting board shows.
  async function lookNeighborInRootline(button) {
    if (!state.current) return false;
    const names = potWorld()?.names;
    const dir = BONSAI_RIM_DIRECTIONS[button?.dataset?.bonsaiRootlineNeighbor] || null;
    const nameIndex = Number(button?.dataset?.bonsaiNeighborIndex);
    const citySeed = Number(state.current.seed);
    if (typeof names?.neighbor !== "function" || !dir || !Number.isInteger(nameIndex) || !Number.isFinite(citySeed)) return false;
    const neighbor = names.neighbor(citySeed, dir, nameIndex);
    if (!neighbor) return false;
    if (typeof ensureRootlineModule === "function") await ensureRootlineModule();
    const queueNursery = window.AISystem6Rootline?.queueNursery;
    if (typeof queueNursery !== "function") { setMessage("bonsai_status_rootline_unavailable"); return false; }
    queueNursery({ seed: neighbor.seed, name: { zh: neighbor.zh, en: neighbor.en } });
    await openWindow("rootline");
    return true;
  }

  // 在根线里规划线网: the same v2 hand-over the street receives, without the
  // pause, queued for Rootline and its window opened.
  async function planTransitInRootline() {
    if (!state.current) return false;
    const payload = cityHandoffPayload();
    if (!payload) { setMessage("bonsai_status_rootline_unavailable"); return false; }
    if (typeof ensureRootlineModule === "function") await ensureRootlineModule();
    const queuePot = window.AISystem6Rootline?.queuePot;
    if (typeof queuePot !== "function") { setMessage("bonsai_status_rootline_unavailable"); return false; }
    queuePot(payload);
    await openWindow("rootline");
    return true;
  }

  // ----- 翻盆: the mayor's bill for a plan the planner saved ------------------
  //
  // The quote comes from app/core/basin-flip-pot.js, which prices every leg and
  // station with the city's own preview calls on a scratch copy — so the money
  // named here is the money the commands below take. The city does not move
  // until the mayor confirms (spec §4).
  async function openFlipPot() {
    if (!state.current) return false;
    // A store that cannot be read (no IndexedDB, a blocked database) means no
    // saved plans to price, said as such, not a rejection nobody catches.
    let list = [];
    try {
      list = typeof listStoredTransitPlans === "function" ? await listStoredTransitPlans(state.record?.id || null) : [];
    } catch {
      list = [];
    }
    const drafts = (list || [])
      .filter((record) => record?.plan && record.status !== "laid")
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    if (!drafts.length) {
      setMessage("bonsai_flip_none");
      return false;
    }
    state.flipPlans = drafts;
    state.flipPlanId = drafts[0].id;
    state.flipDepot = false;
    state.inspectorMode = "flipPot";
    renderInspector();
    scheduleSessionCommit();
    return true;
  }

  function flipPotBill() {
    const flip = window.AISystem6BasinFlipPot;
    const record = (state.flipPlans || []).find((item) => item.id === state.flipPlanId) || null;
    if (!flip || !record || !state.current) return null;
    const bill = flip.quote(sim(), state.current, record.plan, { depot: state.flipDepot === true });
    return { record, bill };
  }

  async function confirmFlipPot() {
    const flip = window.AISystem6BasinFlipPot;
    const current = flipPotBill();
    if (!flip || !current || !state.current) return false;
    const { record } = current;
    const laid = flip.lay(sim(), state.current, record.plan, { depot: state.flipDepot === true });
    if (!laid.ok || laid.blocked.length || (!laid.commands.length && !laid.sidecar)) {
      setMessage("bonsai_flip_blocked");
      return false;
    }
    const before = snapshotForFallbackUndo();
    let spent = 0;
    for (const command of laid.commands) {
      const receipt = sim().submitCommand(state.current, command);
      if (!receipt.accepted) {
        // The preview said this would work. Put the city back so a later
        // refusal cannot leave a half-built avenue and a smaller treasury.
        restoreFallbackSnapshot(before);
        setMessage("bonsai_flip_failed");
        renderInspector();
        return false;
      }
      spent += receipt.cost;
    }
    sim().setTransitLines(state.current, laid.sidecar);
    await saveCurrentCity();
    if (typeof putStoredTransitPlan === "function") {
      await putStoredTransitPlan({ ...record, status: "laid", updatedAt: new Date().toISOString() });
    }
    state.flipPlans = [];
    state.flipPlanId = "";
    state.flipDepot = false;
    closeInspector();
    setMessage("bonsai_flip_laid", formatMoney(spent));
    return true;
  }

  async function sendCurrentToMicropolis() {
    if (!state.current) return false;
    return sendPayloadToMicropolis(sim().serialize(state.current), {
      id: state.record?.id, name: state.record?.name || state.current.name,
      powered: state.current.powered, population: state.current.population,
    });
  }

  async function sendRecordToMicropolis(target) {
    try {
      const decoded = await saveCodec().decode(target.saveData);
      return sendPayloadToMicropolis(sim().serialize(decoded.state), { id: target.id, name: target.name });
    } catch {
      setMessage("bonsai_status_export_failed");
      return false;
    }
  }

  // The .cty export is the file form of the same lossy conversion: the city
  // becomes a Micropolis-format save and then the classic 120x100 file, so
  // a Bonsai city can leave as bytes and come back through the Micropolis
  // import path. The loss report is the honesty gate, as on the way in.
  async function exportPayloadAsCty(payload, meta) {
    const exporter = window.AISystem6BonsaiMicropolisExport;
    const codec = window.AISystem6MicropolisCtyCodec;
    if (!exporter || !codec || !payload) return false;
    let chosenWindow = null;
    if (departureNeedsChoice(payload)) {
      chosenWindow = await openMicropolisDeparturePicker(payload, meta, "cty");
      if (!chosenWindow) return false;
    }
    setMessage("bonsai_status_exporting_cty");
    try {
      const exportedAt = new Date().toISOString();
      const exported = await saveCodec().exportMicropolis(payload, {
        name: meta.name || t("bonsai_city_unnamed"), cityId: meta.id || null, exportedAt,
        powered: meta.powered ? Array.from(meta.powered) : null, population: meta.population | 0,
        ...(chosenWindow ? { window: chosenWindow } : {}),
      });
      const bytes = codec.encodeCty(exported.saveData);
      const fileName = `${String(exported.name || meta.name || t("bonsai_city_unnamed")).replace(/[^a-z0-9_-]+/gi, "-")}.cty`;
      const ok = window.AISystem6WebPlatform?.saveArtifact?.({
        blob: new Blob([bytes], { type: "application/octet-stream" }),
        fileName,
        mimeType: "application/octet-stream",
      });
      setMessage(ok ? (isOsmCity(payload) ? "bonsai_status_exported_cty_osm" : "bonsai_status_exported_cty") : "bonsai_status_export_failed");
      if (ok) await reportMicropolisImport(exported.warnings, "bonsai_micropolis_export_cty_report_intro");
      return Boolean(ok);
    } catch {
      setMessage("bonsai_status_export_failed");
      return false;
    }
  }

  async function exportCurrentAsCty() {
    if (!state.current) return false;
    return exportPayloadAsCty(sim().serialize(state.current), {
      id: state.record?.id, name: state.record?.name || state.current.name,
      powered: state.current.powered, population: state.current.population,
    });
  }

  async function exportRecordAsCty(target) {
    try {
      const decoded = await saveCodec().decode(target.saveData);
      return exportPayloadAsCty(sim().serialize(decoded.state), {
        id: target.id, name: target.name,
        powered: decoded.state.powered, population: decoded.state.population,
      });
    } catch {
      setMessage("bonsai_status_export_failed");
      return false;
    }
  }

  async function importMicropolisRecord(record) {
    const codec = window.AISystem6BonsaiMicropolisCodec;
    if (!codec || !record) return;
    const answer = await showSystemModal(
      t("bonsai_micropolis_import_confirm", record.name || t("bonsai_city_unnamed")),
      "confirm",
    );
    if (answer !== "yes" && answer !== "ok") return;
    setMessage("bonsai_status_importing");
    try {
      const imported = codec.importMicropolis(record.saveData, { name: record.name });
      const decodedState = sim().deserialize(imported.payload);
      const id = makeId(decodedState?.seed);
      const createdAt = new Date().toISOString();
      const name = imported.name || t("bonsai_city_unnamed");
      const saveData = await saveCodec().encodeForStorage(decodedState, { cityId: id, name, createdAt, updatedAt: createdAt });
      await writeCityRecord({ id, name, createdAt, updatedAt: createdAt, saveData });
      clearHistory("bonsai_history_cleared_import");
      setMessage("bonsai_status_imported_micropolis");
      await reportMicropolisImport(imported.warnings);
      await openCityBrowser();
    } catch {
      setMessage("bonsai_status_import_failed");
    }
  }

  async function writeCityRecord(record) {
    const db = await openAppDb();
    try {
      await window.AISystem6StorageTransactions.runTransaction(
        db,
        bonsaiCitiesStoreName,
        "readwrite",
        (tx) => idbRequest(tx.objectStore(bonsaiCitiesStoreName).put(record))
      );
      return true;
    } finally {
      db.close();
    }
  }

  async function deleteCityRecord(id) {
    const db = await openAppDb();
    try {
      await window.AISystem6StorageTransactions.runTransaction(
        db,
        bonsaiCitiesStoreName,
        "readwrite",
        (tx) => idbRequest(tx.objectStore(bonsaiCitiesStoreName).delete(id))
      );
      return true;
    } finally {
      db.close();
    }
  }

  async function saveCurrentCity() {
    if (!state.current || !state.record) return false;
    if (state.saving) return state.saving;
    const cityAtStart = state.current;
    const recordAtStart = state.record;
    const mutationStamp = captureSaveGuard(cityAtStart);
    const metadata = {
      cityId: recordAtStart.id,
      name: recordAtStart.name,
      createdAt: recordAtStart.createdAt,
      updatedAt: new Date().toISOString(),
    };
    state.saving = (async () => {
      setMessage("bonsai_status_saving");
      try {
        const saveData = await saveCodec().encodeForStorage(cityAtStart, metadata);
        await writeCityRecord({
          id: metadata.cityId,
          name: metadata.name,
          createdAt: metadata.createdAt,
          updatedAt: metadata.updatedAt,
          saveData,
        });
        const unchanged = state.current === cityAtStart
          && state.record === recordAtStart
          && matchesSaveGuard(cityAtStart, mutationStamp);
        if (state.record === recordAtStart) state.record.updatedAt = metadata.updatedAt;
        state.dirty = !unchanged;
        state.lastSavedAt = Date.now();
        setMessage(unchanged ? "bonsai_status_saved" : "bonsai_status_saved_pending_changes");
        return true;
      } catch (error) {
        // Keep the player's message plain, but never discard the reason: a
        // refused write (a second window holding the write lease, a quota, a
        // codec fault) is otherwise invisible to anyone debugging it.
        console.error("bonsai-save-failed", error);
        setMessage("bonsai_status_save_failed");
        return false;
      } finally {
        state.saving = null;
      }
    })();
    return state.saving;
  }

  // File → 另存为…: a snapshot copy in the same cities store, under a fresh
  // id, so the current city keeps playing while the copy lands on disk. The
  // browser lists it by its own saved-at timestamp; renaming arrives with the
  // M4 panels, not as a throwaway modal in this milestone.
  async function saveCurrentCityAs() {
    if (!state.current || !state.record) return false;
    if (state.saving) return state.saving;
    const cityAtStart = state.current;
    const recordAtStart = state.record;
    const copyId = makeId();
    const metadata = {
      cityId: copyId,
      name: recordAtStart.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.saving = (async () => {
      setMessage("bonsai_status_saving_copy");
      try {
        const saveData = await saveCodec().encodeForStorage(cityAtStart, metadata);
        await writeCityRecord({
          id: metadata.cityId,
          name: metadata.name,
          createdAt: metadata.createdAt,
          updatedAt: metadata.updatedAt,
          saveData,
        });
        setMessage("bonsai_status_saved_copy");
        return true;
      } catch (error) {
        // Keep the player's message plain, but never discard the reason: a
        // refused write (a second window holding the write lease, a quota, a
        // codec fault) is otherwise invisible to anyone debugging it.
        console.error("bonsai-save-failed", error);
        setMessage("bonsai_status_save_failed");
        return false;
      } finally {
        state.saving = null;
      }
    })();
    return state.saving;
  }

  async function flushCurrentCitySave() {
    if (!state.current || !state.record) return true;
    stopLoop();
    clearAutosaveTimer();
    cancelPointers();
    state.writeBoundary = true;
    try {
      if (state.saving && !await state.saving) return false;
      for (let attempt = 0; state.dirty && attempt < 3; attempt += 1) {
        if (!await saveCurrentCity()) return false;
      }
      return !state.dirty;
    } finally {
      state.writeBoundary = false;
    }
  }

  async function decodeSavedRecord(target) {
    const decoded = await saveCodec().decode(target.saveData);
    return {
      state: decoded.state,
      record: {
        id: target.id,
        name: target.name || decoded.metadata?.name || t("bonsai_city_unnamed"),
        createdAt: target.createdAt || decoded.metadata?.createdAt || new Date().toISOString(),
        updatedAt: target.updatedAt || decoded.metadata?.updatedAt || new Date().toISOString(),
      },
    };
  }

  // A loaded or example city should open looking at what the player built,
  // not at the terrain spawn point the empty map started from. The centroid
  // of built tiles (buildings, roads, zones) is that view; an untouched map
  // falls back to spawnCenter.
  function builtViewCenter(city) {
    if (!city || !city.size || !city.stage) return null;
    const size = city.size;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let index = 0; index < size * size; index += 1) {
      if (!city.stage[index] && !city.road?.[index] && !city.zone?.[index]) continue;
      sumX += index % size;
      sumY += Math.floor(index / size);
      count += 1;
    }
    if (!count) return null;
    return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
  }

  async function openSavedRecord(target) {
    setMessage("bonsai_status_loading");
    try {
      stopLoop();
      if ((state.dirty || state.saving) && !await flushCurrentCitySave()) {
        startLoop();
        return false;
      }
      const decoded = await decodeSavedRecord(target);
      stopLoop();
      state.current = decoded.state;
      state.record = decoded.record;
      state.dirty = false;
      state.playing = false;
      state.speed = 0;
      state.tickCarry = 0;
      markOpeningGoalsMet();
      clearHistory("bonsai_history_cleared_load");
      hideCityBrowser();
      const setup = query("[data-bonsai-map-setup]");
      if (setup) setup.hidden = true;
      renderer()?.resetView?.({ center: builtViewCenter(state.current) || state.current.spawnCenter || null, size: state.current.size, zoom: window.AISystem6BonsaiRenderer?.DEFAULT_ZOOM ?? 0.5 });
      setMessage("bonsai_status_loaded");
      renderAll();
      scheduleSessionCommit();
      return true;
    } catch {
      setMessage("bonsai_status_load_failed");
      return false;
    }
  }

  function hideCityBrowser(resume = false) {
    const browser = query("[data-bonsai-city-browser]");
    if (browser) browser.hidden = true;
    if (resume) startLoop();
  }

  async function openCityBrowser() {
    const browser = query("[data-bonsai-city-browser]");
    if (!browser) return;
    stopLoop();
    if ((state.dirty || state.saving) && !await flushCurrentCitySave()) {
      startLoop();
      return;
    }
    const setup = query("[data-bonsai-map-setup]");
    if (setup) setup.hidden = true;
    browser.hidden = false;
    browser.innerHTML = `
      <div class="bonsai-subwindow-title">
        <h3 id="bonsai-city-browser-title">${t("bonsai_open_cities")}</h3>
        <button class="btn mini-btn" type="button" data-bonsai-browser-close aria-label="${t("close")}">×</button>
      </div>
      <p class="bonsai-browser-status">${t("bonsai_status_loading")}</p>`;
    try {
      const records = await listSavedCities();
      records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const list = document.createElement("div");
      list.className = "bonsai-city-list";
      if (typeof sim()?.createExampleCity === "function") {
        const examples = document.createElement("section");
        examples.className = "bonsai-examples";
        const heading = document.createElement("h4");
        heading.textContent = t("bonsai_examples");
        const actions = document.createElement("div");
        actions.className = "bonsai-example-actions";
        [{ id: "starter-town", label: "starter" }, { id: "troubled-mid-size", label: "troubled" }, { id: "hezhou-1952", label: "hezhou", note: true }].forEach((example) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "btn";
          button.dataset.bonsaiExample = example.id;
          button.dataset.bonsaiExampleLabel = example.label;
          button.dataset.bonsaiAction = "open";
          button.textContent = t(`bonsai_example_${example.label}`);
          if (example.note) button.title = t(`bonsai_example_${example.label}_note`);
          actions.append(button);
        });
        examples.append(heading, actions);
        list.append(examples);
      }
      if (typeof sim()?.createScenarioCity === "function") {
        const scenarios = document.createElement("section");
        scenarios.className = "bonsai-examples";
        const heading = document.createElement("h4");
        heading.textContent = t("bonsai_scenarios");
        const actions = document.createElement("div");
        actions.className = "bonsai-example-actions";
        Object.keys(sim().SCENARIOS || {}).forEach((id) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "btn";
          button.dataset.bonsaiScenario = id;
          button.dataset.bonsaiAction = "open";
          button.textContent = t(`bonsai_scenario_${id.replaceAll("-", "_")}`);
          button.title = t(`bonsai_scenario_${id.replaceAll("-", "_")}_brief`);
          actions.append(button);
        });
        scenarios.append(heading, actions);
        list.append(scenarios);
      }
      // Detected Micropolis saves: shown as a summonable source, imported
      // one-way only after an explicit pick and confirmation.
      const micropolisSaves = window.AISystem6BonsaiMicropolisCodec ? await listMicropolisSaves() : [];
      if (micropolisSaves.length) {
        const section = document.createElement("section");
        section.className = "bonsai-examples";
        const heading = document.createElement("h4");
        heading.textContent = t("bonsai_micropolis_section");
        const note = document.createElement("p");
        note.className = "bonsai-empty-message";
        note.textContent = t("bonsai_micropolis_note");
        section.append(heading, note);
        micropolisSaves.forEach((record) => {
          const row = document.createElement("article");
          row.className = "bonsai-city-row";
          const summary = document.createElement("div");
          summary.className = "bonsai-city-summary";
          const name = document.createElement("strong");
          name.textContent = record.name || t("bonsai_city_unnamed");
          const date = document.createElement("small");
          date.textContent = record.updatedAt ? new Date(record.updatedAt).toLocaleString() : "";
          summary.append(name, date);
          const actions = document.createElement("div");
          actions.className = "bonsai-city-row-actions";
          const button = document.createElement("button");
          button.type = "button";
          button.className = "btn mini-btn";
          button.dataset.bonsaiMicropolisImport = record.id;
          button.textContent = t("bonsai_micropolis_import");
          actions.append(button);
          row.append(summary, actions);
          section.append(row);
        });
        list.append(section);
      }
      if (!records.length) {
        const empty = document.createElement("p");
        empty.className = "bonsai-empty-message";
        empty.textContent = t("bonsai_cities_empty");
        list.append(empty);
      }
      records.forEach((record) => {
        const row = document.createElement("article");
        row.className = "bonsai-city-row";
        row.dataset.bonsaiCityId = record.id;
        const summary = document.createElement("div");
        summary.className = "bonsai-city-summary";
        const name = document.createElement("strong");
        name.textContent = record.name || t("bonsai_city_unnamed");
        const date = document.createElement("small");
        date.textContent = record.updatedAt ? new Date(record.updatedAt).toLocaleString() : "";
        summary.append(name, date);
        const actions = document.createElement("div");
        actions.className = "bonsai-city-row-actions";
        ["open", "export", "export-sc2", "export-cty", "send-micropolis", "delete"].forEach((action) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `btn mini-btn${action === "delete" ? " danger" : ""}`;
          button.dataset.bonsaiCityAction = action;
          button.dataset.bonsaiAction = action;
          button.textContent = t(`bonsai_city_${action.replaceAll("-", "_")}`);
          actions.append(button);
        });
        row.append(summary, actions);
        list.append(row);
      });
      const controls = document.createElement("div");
      controls.className = "button-row bonsai-browser-actions";
      controls.innerHTML = `
        <button class="btn" type="button" data-bonsai-browser-new data-bonsai-action="new">${t("bonsai_new_city")}</button>
        <button class="btn" type="button" data-bonsai-browser-import data-bonsai-action="import">${t("bonsai_import_city")}</button>
        <input class="bonsai-import-input" type="file" accept="application/json,.json,.bonsai-city.json,.sc2,.scn" data-bonsai-import-input hidden>`;
      const title = document.createElement("div");
      title.className = "bonsai-subwindow-title";
      title.innerHTML = `<h3 id="bonsai-city-browser-title">${t("bonsai_open_cities")}</h3><button class="btn mini-btn" type="button" data-bonsai-browser-close aria-label="${t("close")}">×</button>`;
      browser.replaceChildren(title, list, controls);
    } catch {
      browser.innerHTML = `<div class="bonsai-subwindow-title"><h3 id="bonsai-city-browser-title">${t("bonsai_open_cities")}</h3><button class="btn mini-btn" type="button" data-bonsai-browser-close aria-label="${t("close")}">×</button></div><p class="bonsai-empty-message">${t("bonsai_status_load_failed")}</p>`;
      setMessage("bonsai_status_load_failed");
    }
  }

  async function handleCityBrowserAction(button) {
    const row = button.closest("[data-bonsai-city-id]");
    const id = row?.dataset.bonsaiCityId;
    if (!id) return;
    const target = (await listSavedCities()).find((record) => record.id === id);
    if (!target) return;
    const action = button.dataset.bonsaiCityAction;
    if (action === "open") return openSavedRecord(target);
    if (action === "export") {
      const ok = window.AISystem6WebPlatform?.saveArtifact?.({
        text: typeof target.saveData === "string" ? target.saveData : JSON.stringify(target.saveData, null, 2),
        fileName: `${String(target.name || "bonsai-city").replace(/[^a-z0-9_-]+/gi, "-")}.bonsai-city.json`,
        mimeType: "application/json",
      });
      setMessage(ok ? (isOsmSaveText(target.saveData) ? "bonsai_status_exported_osm" : "bonsai_status_exported") : "bonsai_status_export_failed");
      return;
    }
    if (action === "send-micropolis") return sendRecordToMicropolis(target);
    if (action === "export-cty") return exportRecordAsCty(target);
    if (action === "export-sc2") {
      try {
        const decoded = await saveCodec().decode(target.saveData);
        const payload = sim().serialize(decoded.state);
        const bytes = await saveCodec().exportSc2(payload);
        const ok = window.AISystem6WebPlatform?.saveArtifact?.({
          blob: new Blob([Uint8Array.from(bytes)], { type: "application/octet-stream" }),
          fileName: `${String(target.name || "bonsai-city").replace(/[^a-z0-9_-]+/gi, "-")}.sc2`,
          mimeType: "application/octet-stream",
        });
        setMessage(ok ? (isOsmCity(decoded.state) ? "bonsai_status_exported_sc2_osm" : "bonsai_status_exported_sc2") : "bonsai_status_export_failed");
        if (ok) reportSc2Export(payload);
      } catch {
        setMessage("bonsai_status_export_failed");
      }
      return;
    }
    if (action !== "delete") return;
    const answer = await showSystemModal(t("bonsai_delete_confirm", target.name || t("bonsai_city_unnamed")), "confirm", {
      confirmKey: "delete", defaultAction: "cancel", danger: true,
    });
    if (answer !== "yes") return;
    try {
      await deleteCityRecord(target.id);
      if (state.record?.id === target.id) {
        state.current = null;
        state.record = null;
        state.dirty = false;
      }
      setMessage("bonsai_status_deleted");
      await openCityBrowser();
    } catch {
      setMessage("bonsai_status_delete_failed");
    }
  }

  function openScenarioCity(scenarioId) {
    try {
      const city = sim().createScenarioCity(scenarioId);
      const createdAt = new Date().toISOString();
      state.current = city;
      state.record = {
        id: makeId(city.seed),
        name: t(`bonsai_scenario_${scenarioId.replaceAll("-", "_")}`),
        createdAt,
        updatedAt: createdAt,
      };
      state.dirty = true;
      scheduleAutosave();
      state.playing = false;
      state.speed = 0;
      state.lastRunningSpeed = 1;
      state.tickCarry = 0;
      markOpeningGoalsMet();
      clearHistory("bonsai_history_cleared_new");
      hideCityBrowser();
      const setup = query("[data-bonsai-map-setup]");
      if (setup) setup.hidden = true;
      selectTool("road");
      renderer()?.resetView?.({ center: builtViewCenter(city) || city.spawnCenter || null, size: city.size, zoom: city.view?.zoom ?? window.AISystem6BonsaiRenderer?.DEFAULT_ZOOM ?? 0.5 });
      setMessage("bonsai_status_scenario_started");
      openReport();
      renderAll();
      scheduleSessionCommit();
      return true;
    } catch {
      setMessage("bonsai_status_create_failed");
      return false;
    }
  }

  // The File → 打开 scenario… destination: a picker that lists only the
  // scenario briefs, so the item opens exactly the thing it names instead of
  // burying scenarios inside the general city browser.
  async function openScenarioBrowser() {
    const browser = query("[data-bonsai-city-browser]");
    if (!browser) return;
    stopLoop();
    if ((state.dirty || state.saving) && !await flushCurrentCitySave()) {
      startLoop();
      return;
    }
    const setup = query("[data-bonsai-map-setup]");
    if (setup) setup.hidden = true;
    browser.hidden = false;
    const closeRow = document.createElement("div");
    closeRow.className = "bonsai-subwindow-title";
    closeRow.innerHTML = `<h3 id="bonsai-city-browser-title">${t("bonsai_scenarios")}</h3><button class="btn mini-btn" type="button" data-bonsai-browser-close aria-label="${t("close")}">×</button>`;
    const list = document.createElement("div");
    list.className = "bonsai-city-list";
    if (typeof sim()?.createScenarioCity !== "function" || !Object.keys(sim().SCENARIOS || {}).length) {
      const empty = document.createElement("p");
      empty.className = "bonsai-empty-message";
      empty.textContent = t("bonsai_scenarios_empty");
      list.append(empty);
    } else {
      const section = document.createElement("section");
      section.className = "bonsai-examples";
      const heading = document.createElement("h4");
      heading.textContent = t("bonsai_scenarios");
      const actions = document.createElement("div");
      actions.className = "bonsai-example-actions";
      Object.keys(sim().SCENARIOS).forEach((id) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn";
        button.dataset.bonsaiScenario = id;
        button.dataset.bonsaiAction = "open";
        button.textContent = t(`bonsai_scenario_${id.replaceAll("-", "_")}`);
        button.title = t(`bonsai_scenario_${id.replaceAll("-", "_")}_brief`);
        actions.append(button);
      });
      section.append(heading, actions);
      list.append(section);
    }
    browser.replaceChildren(closeRow, list);
  }

  async function openExampleCity(exampleId, label = exampleId) {
    if (typeof sim()?.createExampleCity !== "function") return false;
    try {
      if ((state.dirty || state.saving) && !await flushCurrentCitySave()) return false;
      // One example, one record: the id is derived from the example, so
      // reopening the same example opens the record already saved for it
      // instead of replaying and writing a second record with the same name.
      const recordId = `example-${exampleId}`;
      const saved = (await listSavedCities()).find((record) => record && record.id === recordId);
      if (saved) return openSavedRecord(saved);
      const city = await sim().createExampleCity(exampleId);
      if (!city) throw new Error("bonsai-example-missing");
      const createdAt = new Date().toISOString();
      state.current = city;
      state.record = {
        id: recordId,
        name: t(`bonsai_example_${label}`),
        createdAt,
        updatedAt: createdAt,
      };
      state.dirty = true;
      scheduleAutosave();
      // A new example opens with the clock running, not paused on the map.
      state.playing = true;
      state.speed = 1;
      state.lastRunningSpeed = 1;
      state.tickCarry = 0;
      markOpeningGoalsMet();
      clearHistory("bonsai_history_cleared_new");
      hideCityBrowser();
      const setup = query("[data-bonsai-map-setup]");
      if (setup) setup.hidden = true;
      selectTool("road");
      renderer()?.resetView?.({ center: builtViewCenter(city) || city.spawnCenter || null, size: city.size, zoom: city.view?.zoom ?? window.AISystem6BonsaiRenderer?.DEFAULT_ZOOM ?? 0.5 });
      setMessage("bonsai_status_ready");
      renderAll();
      startLoop();
      scheduleSessionCommit();
      return true;
    } catch {
      setMessage("bonsai_status_create_failed");
      return false;
    }
  }

  async function importCityFile(file) {
    if (!file) return;
    setMessage("bonsai_status_importing");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // A real SC2K city file starts with the ASCII bytes "FORM"; anything
      // else goes through the JSON envelope path. The file itself is source
      // data: it is parsed locally and never uploaded anywhere.
      const isSc2 = bytes.length >= 12 && bytes[0] === 0x46 && bytes[1] === 0x4f && bytes[2] === 0x52 && bytes[3] === 0x4d;
      let decodedState; let importedName; let isMicropolis = false; let micropolisWarnings = null;
      if (isSc2) {
        const imported = await saveCodec().importSc2(bytes);
        decodedState = sim().deserialize(imported.payload);
        importedName = imported.name;
      } else {
        // A Micropolis save (a `cities` record or its bare saveData) is JSON
        // too, so sniff it before the Bonsai envelope path claims the file.
        const text = new TextDecoder().decode(bytes);
        const micropolisCodec = window.AISystem6BonsaiMicropolisCodec;
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { parsed = null; }
        if (micropolisCodec && parsed && (micropolisCodec.looksLikeMicropolisSave(parsed)
          || micropolisCodec.looksLikeMicropolisSave(parsed.saveData))) {
          isMicropolis = true;
          const imported = micropolisCodec.importMicropolis(parsed);
          decodedState = sim().deserialize(imported.payload);
          importedName = imported.name;
          micropolisWarnings = imported.warnings;
        } else {
          const decoded = await saveCodec().parseAndDecode(text);
          decodedState = decoded.state;
          importedName = decoded.metadata?.name;
        }
      }
      const id = makeId(decodedState?.seed);
      const createdAt = new Date().toISOString();
      const name = importedName || file.name.replace(/\.bonsai-city\.json$|\.json$|\.sc2$|\.scn$/i, "") || t("bonsai_city_unnamed");
      const saveData = await saveCodec().encodeForStorage(decodedState, { cityId: id, name, createdAt, updatedAt: createdAt });
      await writeCityRecord({ id, name, createdAt, updatedAt: createdAt, saveData });
      clearHistory("bonsai_history_cleared_import");
      setMessage(isSc2 ? "bonsai_status_imported_sc2" : isMicropolis ? "bonsai_status_imported_micropolis" : "bonsai_status_imported");
      if (isMicropolis) await reportMicropolisImport(micropolisWarnings);
      await openCityBrowser();
    } catch {
      setMessage("bonsai_status_import_failed");
    }
  }

  // Title-bar drag and WindowShade come from the core: wireup.js wires every
  // title bar it is handed, and AISystem6WireWindowChrome hands it the bars
  // of module-built windows too — this window moves by the same contract as
  // every sibling, with nothing local to drift.

  function bindUi() {
    const win = bonsaiWindow();
    if (!win) return;
    listen(win, "pointerdown", () => {
      // Browsers unlock audio on a real gesture; the first press starts the
      // soundtrack when the mode asks for it.
      if (state.audioStarted || state.audioMode === "off") return;
      state.audioStarted = true;
      syncAudioMode();
    });
    listen(window, "resize", () => {
      // Rotation contract (§4): geometry may change, but an open sheet closes
      // and nothing else moves. Docked mode (container ≥ 820px) also closes
      // the now-meaningless sheet flag so a later shrink starts fresh.
      const landscape = window.innerWidth > window.innerHeight;
      if (landscape !== state.lastLandscape) {
        state.lastLandscape = landscape;
        if (state.paletteOpen) closePaletteSheet();
        return;
      }
      const palette = query("[data-bonsai-sub-palette]");
      if (state.paletteOpen && palette && getComputedStyle(palette).position !== "absolute") {
        closePaletteSheet();
      }
    });
    listen(win, "keydown", (event) => {
      if (event.key === "Escape") {
        if (tileBalloonOpen()) {
          event.preventDefault();
          closeTileBalloon();
          return;
        }
        if (paletteSheetOpen()) {
          event.preventDefault();
          closePaletteSheet();
        }
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey) return;
      const key = String(event.key || "").toLowerCase();
      const shift = event.shiftKey;
      const command = key === "n" ? "new-city"
        : key === "s" ? "save"
          : key === "o" ? "open-city"
            : key === "z" ? (shift ? "redo" : "undo")
              : key === "1" ? "speed-0"
                : key === "2" ? "speed-0.25"
                  : key === "3" ? "speed-1"
                    : key === "4" ? "speed-4"
                      : null;
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      runBonsaiMenuCommand(command);
    });
    // The instrument follows the button it sits in: hover, focus and press
    // invert it, so the gauge is redrawn as the inversion comes and goes.
    // The redraw waits a frame: while the pointer event is being dispatched
    // the hover style is not guaranteed to be resolved yet, and a gauge read
    // in that instant keeps the ink of the state the pointer just left.
    let demandRedrawFrame = 0;
    const redrawDemandOnInversion = (event) => {
      if (!event.target?.closest?.("[data-bonsai-rci-button], [data-bonsai-rci-panel-button]")) return;
      if (demandRedrawFrame) return;
      demandRedrawFrame = requestAnimationFrame(() => {
        // Two frames: the browser settles the hover/active style a frame
        // after the pointer event, and the gauge must read the ink of the
        // state the pointer is in, not the one it left.
        demandRedrawFrame = requestAnimationFrame(() => {
          demandRedrawFrame = 0;
          renderDemandGauges();
        });
      });
    };
    state.cleanups.push(() => {
      if (demandRedrawFrame) cancelAnimationFrame(demandRedrawFrame);
      demandRedrawFrame = 0;
    });
    ["pointerover", "pointerout", "pointerdown", "pointerup", "keydown", "keyup"]
      .forEach((type) => listen(win, type, redrawDemandOnInversion, { capture: true }));

    // Red Alert's minimap: a press moves the view to that place, and the arrow
    // keys do the same from the keyboard, one tile (Shift: four) at a time.
    const onMiniMapPointer = (event) => {
      if (!event.target?.closest?.("[data-bonsai-minimap]")) return;
      event.preventDefault();
      navigateFromMiniMap(event);
    };
    listen(win, "pointerdown", onMiniMapPointer, { capture: true });
    listen(win, "keydown", (event) => {
      if (!event.target?.closest?.("[data-bonsai-minimap]")) return;
      const bounds = miniMapViewportBounds();
      if (!bounds) return;
      const next = {
        x: bounds.x + Math.floor(bounds.width / 2),
        y: bounds.y + Math.floor(bounds.height / 2),
      };
      const step = event.shiftKey ? 4 : 1;
      if (event.key === "ArrowLeft") next.x -= step;
      else if (event.key === "ArrowRight") next.x += step;
      else if (event.key === "ArrowUp") next.y -= step;
      else if (event.key === "ArrowDown") next.y += step;
      else return;
      event.preventDefault();
      centerViewOnTile(next);
    }, { capture: true });

    listen(win, "click", (event) => {
      const railCell = event.target.closest(".bonsai-rail-cell");
      if (railCell) {
        const category = railCell.dataset.bonsaiCategory;
        if (!category) return;
        // Re-tapping the open sheet's category dismisses it (docked mode
        // ignores the flag); tapping any other cell opens its palette.
        if (state.category === category && state.paletteOpen) {
          closePaletteSheet();
          const lastTool = state.lastToolByCategory.get(category);
          if (lastTool) selectTool(lastTool);
          return;
        }
        openCategory(category);
        return;
      }
      if (event.target.closest("[data-bonsai-open-graphs]")) return openGraphs();
      // 翻盆: choose the plan, tick the depot, confirm, or walk away.
      const flipPlan = event.target.closest("[data-bonsai-flip-plan]");
      if (flipPlan) {
        state.flipPlanId = flipPlan.dataset.bonsaiFlipPlan;
        state.flipDepot = false;
        return renderInspector();
      }
      if (event.target.closest("[data-bonsai-flip-depot]")) {
        state.flipDepot = !state.flipDepot;
        return renderInspector();
      }
      if (event.target.closest("[data-bonsai-flip-confirm]")) return confirmFlipPot();
      if (event.target.closest("[data-bonsai-flip-cancel]")) return closeInspector();
      const adviceLocate = event.target.closest("[data-bonsai-advisor-locate]");
      if (adviceLocate) return locateAdvice(adviceLocate);
      if (event.target.closest("[data-bonsai-open-demographic-graphs]")) return openDemographicGraphs();
      const nurseryButton = event.target.closest("[data-bonsai-rootline-neighbor]");
      if (nurseryButton) return lookNeighborInRootline(nurseryButton);
      const overlayChip = event.target.closest("[data-bonsai-overlay-chip]");
      if (overlayChip) return setOverlay(overlayChip.dataset.bonsaiOverlayChip);
      if (event.target.closest("[data-bonsai-found-city]")) return foundCity();
      const speedButton = event.target.closest("[data-bonsai-speed]");
      if (speedButton) return setSpeed(Number(speedButton.dataset.bonsaiSpeed));
      if (event.target.closest("[data-bonsai-minimap-toggle]")) return toggleMinimapCard();
      if (event.target.closest("[data-bonsai-rci-button]") || event.target.closest("[data-bonsai-rci-panel-button]")) {
        openReport();
        const demand = query("[data-bonsai-report-demand]");
        if (demand) demand.focus();
        return;
      }
      if (event.target.closest("[data-bonsai-inspector-close]")) return closeInspector();
      if (event.target.closest("[data-bonsai-browser-close]")) {
        hideCityBrowser(true);
        if (!state.current) showSetup(state.setupOptions || {});
        return;
      }
      if (event.target.closest("[data-bonsai-browser-new]")) return showSetup();
      if (event.target.closest("[data-bonsai-browser-import]")) return query("[data-bonsai-import-input]")?.click();
      if (event.target.closest("[data-bonsai-year-end-resume]")) return resumeFromYearEnd();
      if (event.target.closest("[data-bonsai-policy-bond-issue]")) return submitPolicy({ policy: "bond", action: "issue" });
      const repayButton = event.target.closest("[data-bonsai-policy-bond-repay]");
      if (repayButton) return submitPolicy({ policy: "bond", action: "repay", index: Number(repayButton.dataset.bonsaiPolicyBondRepay) });
      const exampleButton = event.target.closest("[data-bonsai-example]");
      if (exampleButton) return openExampleCity(exampleButton.dataset.bonsaiExample, exampleButton.dataset.bonsaiExampleLabel);
      const scenarioButton = event.target.closest("[data-bonsai-scenario]");
      if (scenarioButton) return openScenarioCity(scenarioButton.dataset.bonsaiScenario);
      const micropolisButton = event.target.closest("[data-bonsai-micropolis-import]");
      if (micropolisButton) {
        listMicropolisSaves().then((saves) => importMicropolisRecord(
          saves.find((record) => record.id === micropolisButton.dataset.bonsaiMicropolisImport),
        ));
        return;
      }
      const cityAction = event.target.closest("[data-bonsai-city-action]");
      if (cityAction) return handleCityBrowserAction(cityAction);
      if (event.target.closest("[data-bonsai-osm-search]")) {
        searchOsmPlace();
        return;
      }
      if (event.target.closest("[data-bonsai-setup-regenerate]") && readSetupOptions().source === OSM_SOURCE) {
        loadOsmPreview();
        return;
      }
      if (event.target.closest("[data-bonsai-setup-regenerate]")) {
        const seedInput = query("[data-bonsai-map-seed]");
        try {
          if (seedInput) seedInput.value = String(makeSeed());
        } catch {
          setMessage("bonsai_status_seed_unavailable");
          return;
        }
        refreshSetupPreview();
        return;
      }
      const actionButton = event.target.closest("[data-bonsai-action]");
      if (!actionButton) return;
      const action = actionButton.dataset.bonsaiAction;
      if (action === "new") showSetup();
      else if (action === "save") saveCurrentCity();
      else if (action === "open") openCityBrowser();
      else if (action === "undo") performUndo();
      else if (action === "redo") performRedo();
      else if (action === "report") openReport();
      else if (action === "budget") openBudget();
      else if (action === "news") openNews();
    });
    listen(win, "submit", (event) => {
      if (!event.target.matches(".bonsai-setup-form")) return;
      event.preventDefault();
      // Return in the place field searches; it does not found the city.
      if (document.activeElement?.matches?.("[data-bonsai-osm-query]")) { searchOsmPlace(); return; }
      createCityFromSetup();
    });
    listen(win, "change", (event) => {
      if (event.target.matches("[data-bonsai-graph-range]")) {
        state.graphRange = event.target.value;
        refreshGraphPanel();
        scheduleSessionCommit();
        return;
      }
      if (event.target.matches("[data-bonsai-graph-series]")) {
        const seriesId = event.target.dataset.bonsaiGraphSeries;
        if (event.target.checked) {
          if (state.graphSeries.length >= 3) {
            event.target.checked = false;
            setMessage("bonsai_graph_limit");
            renderStatus();
            return;
          }
          state.graphSeries = [...state.graphSeries, seriesId];
        } else {
          state.graphSeries = state.graphSeries.filter((id) => id !== seriesId);
        }
        refreshGraphPanel();
        scheduleSessionCommit();
        return;
      }
      if (event.target.matches("[data-bonsai-policy-tax]")) {
        submitPolicy({ policy: "tax-rate", taxRate: Number(event.target.value) });
      }
      if (event.target.matches("[data-bonsai-policy-tax-rate]")) {
        submitPolicy({ policy: "tax-rates", [event.target.dataset.bonsaiPolicyTaxRate]: Number(event.target.value) });
      }
      if (event.target.matches("[data-bonsai-policy-ordinance]")) {
        submitPolicy({ policy: "ordinance", id: event.target.dataset.bonsaiPolicyOrdinance, enacted: event.target.checked });
      }
      if (event.target.matches("[data-bonsai-policy-disasters]")) {
        submitPolicy({ policy: "disasters", enabled: event.target.checked });
      }
      if (event.target.matches("[data-bonsai-auto-budget]")) {
        setAutoBudget(event.target.checked);
      }
      if (event.target.matches("[data-bonsai-policy-newspaper]")) {
        submitPolicy({ policy: "newspaper", enabled: event.target.checked });
      }
      if (event.target.matches("[data-bonsai-policy-funding]")) {
        submitPolicy({
          policy: "funding",
          service: event.target.dataset.bonsaiPolicyFunding,
          level: Number(event.target.value),
        });
      }
      if (event.target.matches("[data-bonsai-osm-place]")) {
        const [lat, lon] = String(event.target.value).split(",").map(Number);
        const coords = query("[data-bonsai-osm-coords]");
        if (coords && Number.isFinite(lat) && Number.isFinite(lon)) coords.value = formatCoords(lat, lon);
      }
      if (event.target.matches("[data-bonsai-map-size], [data-bonsai-map-terrain], [data-bonsai-map-seed], [data-bonsai-osm-place], [data-bonsai-osm-coords], [data-bonsai-osm-buildings]")) refreshSetupPreview();
      if (event.target.matches("[data-bonsai-import-input]")) {
        importCityFile(event.target.files?.[0]);
        event.target.value = "";
      }
      if (event.target.matches("[data-bonsai-tool-select]")) {
        selectTool(event.target.value, { keepPaletteOpen: true });
      }
    });
    listen(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") runBestEffortAutosave();
      else startLoop();
    });
    listen(window, "pagehide", runBestEffortAutosave);
    const close = win.querySelector(".close-box");
    listen(close, "click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const wasPlaying = state.playing;
      stopLoop();
      if ((state.dirty || state.saving) && !await flushCurrentCitySave()) {
        // Leave blocked: surface an honest leave/flush failure on the status line.
        setMessage("bonsai_status_leave_failed");
        if (wasPlaying) startLoop();
        return;
      }
      await closeWindow(WINDOW_NAME, true);
      await releaseSurface({ removeWindow: true, save: false });
    });
    bindPointerInput();
  }

  async function restoreOrSetup() {
    if (state.sessionRestore?.cityId) {
      try {
        const records = await listSavedCities();
        const record = records.find((entry) => entry.id === state.sessionRestore.cityId);
        if (record && await openSavedRecord(record)) {
          if (typeof state.sessionRestore.autoBudget === "boolean") state.autoBudget = state.sessionRestore.autoBudget;
          if (state.sessionRestore.tool) selectTool(state.sessionRestore.tool);
          if (state.sessionRestore.overlay) setOverlay(state.sessionRestore.overlay);
          if (state.sessionRestore.view) renderer()?.resetView?.(state.sessionRestore.view);
          if (state.sessionRestore.inspectorMode === "report") openReport();
          else if (state.sessionRestore.inspectorMode === "budget") openBudget();
          else if (state.sessionRestore.inspectorMode === "population") openPopulation();
          else if (state.sessionRestore.inspectorMode === "industry") openIndustry();
          else if (state.sessionRestore.inspectorMode === "neighbors") openNeighbors();
          else if (state.sessionRestore.inspectorMode === "tile" && state.sessionRestore.selectedTile) {
            openTileBalloon(state.sessionRestore.selectedTile);
          }
          return;
        }
      } catch {}
    }
    showSetup();
  }

  function scheduleSessionCommit() {
    if (typeof scheduleWorkingSessionCommit === "function") scheduleWorkingSessionCommit();
  }

  function registerSessionAdapter() {
    if (typeof registerWorkingSessionAdapter !== "function") return;
    registerWorkingSessionAdapter({
      id: "bonsaiCity",
      capture: () => ({
        cityId: state.record?.id || "",
        tool: state.tool,
        overlay: state.overlay,
        inspectorMode: state.inspectorMode,
        selectedTile: state.selectedTile ? { ...state.selectedTile } : null,
        view: renderer()?.debugStats?.()?.view || null,
        autoBudget: state.autoBudget,
      }),
      restore: (value) => {
        state.sessionRestore = value && typeof value === "object" ? value : null;
        if (state.attached && state.sessionRestore?.cityId) {
          Promise.resolve().then(() => restoreOrSetup());
        }
        return true;
      },
      clear: () => undefined,
    });
  }

  function registerLifecycle() {
    if (state.lifecycleUnregister) return;
    state.lifecycleUnregister = window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.(APP_ID, {
      onSuspend: async () => {
        stopLoop();
        cancelPointers();
        if ((state.dirty || state.saving) && !await flushCurrentCitySave()) {
          setMessage("bonsai_status_leave_failed");
          state.lifecycleUnregister?.();
          state.lifecycleUnregister = null;
          registerLifecycle();
          startLoop();
          throw new Error("bonsai-suspend-save-failed");
        }
      },
      onResume: async () => {
        // Give the street-goer their clock back, once: returnFromStreets may
        // already have done it before the window was shown.
        resumeFromStreetsSpeed();
        if (!state.rendererMounted) await mountRenderer();
        startLoop();
        renderAll();
      },
      onDispose: async () => {
        if (!await releaseSurface({ removeWindow: true, save: true })) {
          state.lifecycleUnregister?.();
          state.lifecycleUnregister = null;
          registerLifecycle();
          throw new Error("bonsai-dispose-save-failed");
        }
      },
    }) || null;
  }

  async function mountRenderer() {
    if (state.rendererMounted) return true;
    const target = query("[data-bonsai-map-stack]");
    if (!target || !renderer()?.mount) return false;
    try {
      await renderer().mount(target);
      state.rendererMounted = true;
      const rect = target.getBoundingClientRect();
      resizeMap(rect.width, rect.height);
      return true;
    } catch (error) {
      state.rendererMounted = false;
      // No WebGL is a supported situation, not a failure: fall back to the
      // Canvas backend silently equivalent in gameplay, and say so once.
      if (state.rendererBackend === "three-voxel" && error && error.code === "bonsai-voxel-webgl-unavailable") {
        state.rendererBackend = "canvas-2d";
        setMessage("bonsai_status_webgl_fallback");
        return mountRenderer();
      }
      setMessage("bonsai_status_renderer_failed");
      return false;
    }
  }

  async function setRendererBackend(backend) {
    if (backend !== "three-voxel" && backend !== "canvas-2d") return false;
    if (state.rendererBackend === backend) return true;
    const view = renderer()?.debugStats?.()?.view || null;
    if (state.rendererMounted) { renderer()?.dispose?.(); state.rendererMounted = false; }
    state.rendererBackend = backend;
    const mounted = await mountRenderer();
    if (mounted && view) renderer()?.resetView?.(view);
    renderAll();
    return mounted && state.rendererBackend === backend;
  }

  async function attach() {
    if (state.attached && bonsaiWindow()) {
      registerLifecycle();
      if (!state.rendererMounted) await mountRenderer();
      startLoop();
      renderAll();
      return true;
    }
    injectWindowFrame();
    saveCodec();
    buildRail();
    renderSubPalette();
    renderMinimapCard();
    bindUi();
    state.attached = true;
    registerLifecycle();
    await mountRenderer();
    const restorePromise = restoreOrSetup();
    state.restorePromise = restorePromise;
    try {
      await restorePromise;
    } finally {
      if (state.restorePromise === restorePromise) state.restorePromise = null;
    }
    renderAll();
    return true;
  }

  async function releaseSurface({ removeWindow = false, save = true } = {}) {
    if (state.restorePromise) await state.restorePromise;
    const viewBeforeDispose = renderer()?.debugStats?.()?.view || null;
    const wasPlaying = state.playing;
    stopLoop();
    cancelPointers();
    if (save && (state.dirty || state.saving) && !await flushCurrentCitySave()) {
      if (wasPlaying) startLoop();
      return false;
    }
    clearAutosaveTimer();
    cancelRenderQueue();
    clearTimeout(state.firstHintTimer);
    state.firstHintTimer = null;
    clearCleanupList(state.pointerCleanups);
    clearCleanupList(state.cleanups);
    state.saveManager?.dispose?.();
    state.saveManager = null;
    state.audio?.dispose?.();
    state.audio = null;
    state.audioStarted = false;
    if (state.rendererMounted) renderer()?.dispose?.();
    state.rendererMounted = false;
    state.attached = false;
    state.lifecycleUnregister?.();
    state.lifecycleUnregister = null;
    if (removeWindow) {
      state.sessionRestore = {
        cityId: state.record?.id || "",
        tool: state.tool,
        overlay: state.overlay,
        inspectorMode: state.inspectorMode,
        selectedTile: state.selectedTile ? { ...state.selectedTile } : null,
        view: viewBeforeDispose,
      };
      state.current = null;
      state.setupPreview = null;
      bonsaiWindow()?.remove();
    }
    return true;
  }

  async function detach() {
    return releaseSurface({ removeWindow: true, save: true });
  }

  function refreshLanguage() {
    const setupWasOpen = query("[data-bonsai-map-setup]")?.hidden === false;
    const browserWasOpen = query("[data-bonsai-city-browser]")?.hidden === false;
    const setupOptions = setupWasOpen ? readSetupOptions() : null;
    const title = query("#bonsai-city-title");
    if (title) title.textContent = t("bonsai_city_title");
    buildRail();
    renderSubPalette();
    renderMinimapCard();
    if (setupWasOpen) showSetup(setupOptions);
    if (browserWasOpen) openCityBrowser();
    renderAll();
  }

  function debugState() {
    const current = state.current;
    const rendererStats = renderer()?.debugStats?.() || {};
    return Object.freeze({
      playing: state.playing,
      speed: state.speed,
      tool: state.tool,
      audioMode: state.audioMode,
      backend: state.rendererBackend,
      dirty: state.dirty,
      autoBudget: state.autoBudget,
      yearEndHold: state.yearEndHold,
      graphMonths: state.current?.graphs?.monthly?.residents?.length ?? 0,
      saving: !!state.saving,
      display: Object.freeze({ ...state.display }),
      currentCityId: state.record?.id || "",
      hashInputSummary: Object.freeze({
        seed: Number(current?.seed) >>> 0,
        tick: Number(current?.tick) || 0,
        revision: Number(current?.rev ?? current?.revision) || 0,
        commandSequence: Number(current?.commandSequence ?? current?.nextCommandSequence) || 0,
        size: Number(current?.size) || 0,
      }),
      cleanupCounters: Object.freeze({
        ...state.counters,
        resizeObservers: Number(rendererStats.resizeObserverCount) || 0,
      }),
      overlay: state.overlay,
      // What the map is looking at is user-visible state too: zoom, rotation
      // and pan are how a camera command proves it did something.
      view: Object.freeze({ ...(rendererStats.view || {}) }),
      renderer: Object.freeze({
        ready: !!renderer()?.isReady?.(),
        width: Number(rendererStats.cssWidth ?? rendererStats.width) || 0,
        height: Number(rendererStats.cssHeight ?? rendererStats.height) || 0,
        dpr: Number(rendererStats.dpr) || 0,
        layerCount: Number(rendererStats.layerCount) || 0,
        resourceCount: Number(rendererStats.resourceCount ?? rendererStats.chunkCacheCount) || 0,
        frameCount: Number(rendererStats.frameCount ?? rendererStats.chunkBuildCount) || 0,
      }),
    });
  }

  async function checkpoint() {
    if (!state.current && state.restorePromise) await state.restorePromise;
    if (!state.current || typeof sim()?.checkpoint !== "function") return "";
    return sim().checkpoint(state.current);
  }

  // Whatever ClioTalk is doing for the writer comes first: while it reads,
  // works or waits the city holds its breath, as Rootline does. The speed the
  // clock held is remembered and given back unless the player chose another.
  window.AISystem6AssistantActivity?.subscribe?.(() => {
    const busy = BONSAI_ASSISTANT_BUSY.includes(window.AISystem6AssistantActivity?.getState?.()?.state);
    if (busy === state.assistantPaused) return;
    state.assistantPaused = busy;
    if (busy) {
      state.assistantSpeedUserChanged = false;
      state.speedBeforeAssistant = state.speed;
      if (state.speed > 0) {
        state.assistantApplying = true;
        setSpeed(0);
        state.assistantApplying = false;
      }
    } else {
      const restore = !state.assistantSpeedUserChanged;
      state.assistantSpeedUserChanged = false;
      if (restore && state.speedBeforeAssistant > 0) {
        state.assistantApplying = true;
        setSpeed(state.speedBeforeAssistant);
        state.assistantApplying = false;
      }
    }
  });

  registerSessionAdapter();

  // The language switch repaints this window through its admission row's
  // repaint hook (app-admissions.js).
  window.renderBonsaiCityLanguage = () => refreshLanguage();

  window.AISystem6BonsaiSaveGuard = Object.freeze({
    capture: captureSaveGuard,
    matches: matchesSaveGuard,
  });

  window.AISystem6BonsaiCity = Object.freeze({
    attach,
    detach,
    setSpeed,
    pause: () => setSpeed(0),
    play: () => setSpeed(state.lastRunningSpeed || 1),
    save: saveCurrentCity,
    openCities: openCityBrowser,
    refreshLanguage,
    // The way back from the street (Joyride's and Rootline's return items):
    // restore the clock once, recentre on the stopping tile, say where.
    returnFromStreets,
    isRunning: () => !!state.timer,
    // Empty while no city is loaded, so the Speed menu marks nothing rather
    // than claiming a speed that no simulation is running at.
    currentSpeed: () => (state.current ? String(state.speed) : ""),
    checkpoint,
    debugState,
  });

  // The fourteen buttons that used to live in the command strip now live in
  // the gauge bar or in menus (M1 §3.1). Commands are registered through the
  // runtime exactly like Micropolis; the split follows the Macintosh release
  // of the original game (§12): File, Speed, Options, Disasters, Windows and
  // Newspaper. Every item here has a destination: the city data windows
  // (人口, 工业, 图表, 邻市), the display toggles, and 自动预算 all ship, and
  // tests/features/bonsai-no-dead-ends.test.mjs runs each one to prove it.
  const bonsaiMenuCommands = {
    "new-city": () => showSetup(),
    "open-city": () => openCityBrowser(),
    "terrain-editor": () => showSetup({ editor: true }),
    "open-scenario": () => openScenarioBrowser(),
    "save": () => saveCurrentCity(),
    "save-as": () => saveCurrentCityAs(),
    "export-sc2": () => exportCurrentSc2(),
    "export-cty": () => exportCurrentAsCty(),
    "send-micropolis": () => sendCurrentToMicropolis(),
    "drive-streets": () => driveCurrentStreets(),
    "plan-transit": () => planTransitInRootline(),
    "flip-pot": () => openFlipPot(),
    "undo": () => performUndo(),
    "redo": () => performRedo(),
    "report": () => openReport(),
    "budget": () => openBudget(),
    "news": () => openNews(),
    "open-graphs": () => openGraphs(),
    "open-population": () => openPopulation(),
    "open-industry": () => openIndustry(),
    "open-neighbors": () => openNeighbors(),
    "open-advisors": () => openAdvisors(),
    "open-goals": () => openGoals(),
    "ordinances": () => openBudget(),
    "toggle-renderer": () => setRendererBackend(state.rendererBackend === "three-voxel" ? "canvas-2d" : "three-voxel"),
    "auto-budget": () => setAutoBudget(!state.autoBudget),
    "minimap": () => toggleMinimapCard(),
    "display-buildings": () => setDisplay("buildings"),
    "display-infrastructure": () => setDisplay("infrastructure"),
    "display-zones": () => setDisplay("zones"),
    "display-underground": () => setDisplay("underground"),
    "display-night": () => setDisplay("night"),
    "display-seasons": () => setDisplay("seasons"),
    "display-miniature": () => setDisplay("miniature"),
    "display-tank": () => setDisplay("tank"),
    "study-none": () => setStudyModel("none"),
    "study-white": () => setStudyModel("white"),
    "study-wood": () => setStudyModel("wood"),
    "study-chipboard": () => setStudyModel("chipboard"),
    "zoom-in": () => zoomAt(2),
    "zoom-out": () => zoomAt(0.5),
    "rotate-cw": () => rotateView(1),
    "rotate-ccw": () => rotateView(-1),
    "center-city": () => centerOnCity(),
    "sound-music": () => setAudioMode("music"),
    "sound-sfx": () => setAudioMode("sfx"),
    "sound-off": () => setAudioMode("off"),
    "subscribe": () => openNews(),
    "extra": () => openNews(),
    "disasters-off": () => submitPolicy({ policy: "disasters", enabled: false }),
  };
  OVERLAYS.forEach((overlay) => { bonsaiMenuCommands[`overlay-${overlay}`] = () => setOverlay(overlay); });
  const DISASTER_MENU = ["fire", "flood", "tornado", "earthquake", "monster", "riot", "toxic-spill", "meltdown", "microwave-spill", "volcano", "firestorm", "mass-floods", "pollution-accident", "hurricane", "air-crash"];
  DISASTER_MENU.forEach((kind) => { bonsaiMenuCommands[`disaster-${kind}`] = () => submitDisaster(kind); });
  SPEEDS.forEach((speed) => { bonsaiMenuCommands[`speed-${speed.value}`] = () => setSpeed(speed.value); });

  const commandsNeedingCity = new Set([
    // subscribe/extra both call openNews(), which silently returns without a
    // city (the same guard "news" itself declares below) — without this they
    // stayed enabled with no city loaded and did nothing when chosen.
    // Speed with no city loaded set a field on an absent simulation: no loop
    // to start, no gauge to arm, no date to advance. The four rows stayed
    // black and did nothing when chosen.
    ...SPEEDS.map((speed) => `speed-${speed.value}`),
    "save", "save-as", "export-sc2", "export-cty", "send-micropolis", "drive-streets", "plan-transit", "flip-pot", "undo", "redo", "report", "budget", "news", "subscribe", "extra", "ordinances", "minimap", "disasters-off",
    "open-graphs", "open-population", "open-industry", "open-neighbors", "open-goals", "open-advisors",
    "display-buildings", "display-infrastructure", "display-zones", "display-underground",
    "display-night", "display-seasons", "display-miniature", "display-tank", "study-none", "study-white", "study-wood", "study-chipboard", "zoom-in", "zoom-out", "rotate-cw", "rotate-ccw", "center-city",
    ...OVERLAYS.map((overlay) => `overlay-${overlay}`),
    ...DISASTER_MENU.map((kind) => `disaster-${kind}`),
  ]);

  function runBonsaiMenuCommand(command) {
    const handler = bonsaiMenuCommands[command];
    if (typeof handler !== "function") return;
    if (commandsNeedingCity.has(command) && !state.current) return;
    handler();
  }

  function registerBonsaiMenuSet() {
    if (state.bonsaiMenuSetRegistered) return;
    state.bonsaiMenuSetRegistered = true;
    const item = (command, labelKey, shortcutId = "") => ({
      type: "item",
      action: `bonsai-${command}`,
      labelKey,
      shortcutId,
      conditionId: `bonsai-${command}`,
    });
    const displayItem = (key) => ({ ...item(`display-${key}`, `bonsai_display_${key}`), dataset: { bonsaiDisplay: key } });
    const separator = { type: "separator" };
    const submenu = (labelKey, items) => ({ type: "submenu", labelKey, items });
    const overlayItems = OVERLAYS.map((overlay) => item(`overlay-${overlay}`, `bonsai_overlay_${overlay.replaceAll("-", "_")}`));
    const disasterItems = DISASTER_MENU.map((kind) => item(`disaster-${kind}`, `bonsai_tool_disaster_${kind.replaceAll("-", "_")}`));
    // Speed cells borrow registry shortcut ids purely for their ⌘1..⌘4 menu
    // labels; the keys themselves are handled by the shell's window listener
    // (bare digits 1-4 belong to terrain tools through handleMapKey).
    const speedShortcutIds = { 0: "route-question-sheet", 0.25: "route-outline", 1: "route-section-drafts", 4: "route-manuscript" };
    const speedItems = SPEEDS.map((speed) => ({
      ...item(`speed-${speed.value}`, `bonsai_speed_${speed.id}`, speedShortcutIds[speed.value]),
      // A distinct key from the gauge's own data-bonsai-speed buttons: the
      // menu row and the gauge button state the same choice, but only the
      // gauge is inside .bonsai-speed-controls.
      dataset: { bonsaiSpeedChoice: String(speed.value) },
    }));
    window.AISystem6RegisterApplicationMenuSet?.("bonsaiCity", [
      {
        id: "file",
        labelKey: "menu_file",
        items: [
          item("new-city", "bonsai_new_city", "new-document"),
          item("open-city", "bonsai_open_cities", "open"),
          item("terrain-editor", "bonsai_terrain_editor"),
          item("open-scenario", "bonsai_open_scenario"),
          item("save", "bonsai_save_city", "save"),
          item("save-as", "bonsai_save_as"),
          item("export-sc2", "bonsai_export_sc2"),
          item("export-cty", "bonsai_export_cty"),
          item("send-micropolis", "bonsai_send_micropolis"),
          item("drive-streets", "bonsai_drive_streets"),
          item("plan-transit", "bonsai_plan_transit_rootline"),
          item("flip-pot", "bonsai_flip_pot_menu"),
          separator,
          { type: "item", action: "close-active-window", labelKey: "close", shortcutId: "close-window", conditionId: "close-active-window" },
        ],
      },
      {
        id: "speed",
        labelKey: "bonsai_menu_speed",
        items: speedItems,
      },
      {
        id: "options",
        labelKey: "bonsai_menu_options",
        items: [
          submenu("bonsai_sound", [
            item("sound-music", "bonsai_audio_music"),
            item("sound-sfx", "bonsai_audio_sfx"),
            item("sound-off", "bonsai_audio_off"),
          ]),
          item("toggle-renderer", "bonsai_renderer_switch"),
          { ...item("auto-budget", "bonsai_auto_budget"), dataset: { bonsaiAutoBudget: "1" } },
          separator,
          submenu("bonsai_menu_data_views", overlayItems),
          separator,
          displayItem("buildings"),
          displayItem("infrastructure"),
          displayItem("zones"),
          displayItem("underground"),
          separator,
          item("zoom-in", "bonsai_zoom_in"),
          item("zoom-out", "bonsai_zoom_out"),
          item("rotate-cw", "bonsai_rotate_cw"),
          item("rotate-ccw", "bonsai_rotate_ccw"),
          item("center-city", "bonsai_center"),
          separator,
          displayItem("night"),
          displayItem("seasons"),
          displayItem("miniature"),
          displayItem("tank"),
          submenu("bonsai_study_model", ["none", "white", "wood", "chipboard"].map((kind) => ({ ...item(`study-${kind}`, `bonsai_study_${kind}`), dataset: { bonsaiStudy: kind } }))),
        ],
      },
      {
        id: "disasters",
        labelKey: "bonsai_menu_disasters",
        items: [...disasterItems, separator, item("disasters-off", "bonsai_disasters_off")],
      },
      {
        id: "windows",
        labelKey: "bonsai_menu_windows",
        items: [
          item("minimap", "bonsai_minimap"),
          item("budget", "bonsai_budget"),
          item("report", "bonsai_city_report"),
          item("ordinances", "bonsai_ordinances"),
          item("open-graphs", "bonsai_graphs"),
          item("open-population", "bonsai_population"),
          item("open-industry", "bonsai_industry"),
          item("open-neighbors", "bonsai_neighbors"),
          item("open-advisors", "bonsai_advisors"),
          { type: "separator" },
          item("open-goals", "bonsai_opening_goals"),
        ],
      },
      {
        id: "newspaper",
        labelKey: "bonsai_menu_newspaper",
        items: [
          item("subscribe", "bonsai_newspaper_subscribe"),
          item("extra", "bonsai_newspaper_extra"),
          separator,
          item("news", "bonsai_news"),
        ],
      },
    ]);
    Object.keys(bonsaiMenuCommands).forEach((command) => {
      window.AISystem6Runtime?.registerCommand?.(`bonsai-${command}`, {
        handler: () => runBonsaiMenuCommand(command),
        isAvailable: () => {
          const active = document.querySelector(".window.is-active");
          if (active?.dataset.window !== "bonsaiCity") return false;
          return !commandsNeedingCity.has(command) || !!state.current;
        },
        unavailableReason: () => {
          const active = document.querySelector(".window.is-active");
          return active?.dataset.window !== "bonsaiCity"
            ? "balloon_disabled_menu_host_window"
            : "balloon_disabled_menu_context";
        },
      });
    });
  }

  registerBonsaiMenuSet();

  window.AISystem6Runtime?.registerApplication({
    id: APP_ID,
    windowName: WINDOW_NAME,
    mount: attach,
    restore: attach,
    commands: {
      "open-bonsai-city": {
        // The desktop icon and the Micropolis "Open in Bonsai City" hook both
        // arrive here. When a Micropolis record id rides on the payload, the
        // summon path imports it after the same confirmation the browser's
        // own Micropolis section uses; a plain open stays a plain open.
        handler: async (payload = {}) => {
          await openWindow(WINDOW_NAME);
          // Rootline's return item names the save: open it through the same
          // path the city browser uses. An unknown id changes nothing and
          // says so, like the Micropolis branch below.
          if (payload?.bonsaiRecordId) {
            const target = (await listSavedCities()).find((record) => record.id === payload.bonsaiRecordId);
            if (target) return openSavedRecord(target);
            setMessage("bonsai_status_import_failed");
            return false;
          }
          if (payload?.micropolisRecordId) {
            const saves = await listMicropolisSaves();
            const record = saves.find((candidate) => candidate.id === payload.micropolisRecordId);
            if (record) return importMicropolisRecord(record);
            setMessage("bonsai_status_import_failed");
            return false;
          }
          return true;
        },
        isAvailable: () => true,
      },
    },
  });
})();
