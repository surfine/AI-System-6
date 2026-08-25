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
    "police", "fire", "education", "health",
  ]);
  const GOALS = Object.freeze([
    { id: "road", tool: "road" },
    { id: "power", tools: ["coal", "wind"] },
    { id: "wire", tool: "wire" },
    { id: "zone", tools: ["residential-light", "commercial-light", "industrial-light"] },
    { id: "run", run: true },
  ]);
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
    { id: "inspect", labelKey: "bonsai_tool_group_inspect" },
    { id: "pan", labelKey: "bonsai_tool_pan" },
  ]);
  // Rewards left the rail by owner decision (M2 fold): the five reward tools
  // live in 选项 → 奖励 and arm directly from the menu.
  const REWARD_TOOL_IDS = Object.freeze(["mayors-house", "city-hall", "statue", "dome", "arco"]);
  const EVENT_KEYS = Object.freeze({
    "construction-started": "bonsai_event_construction_started",
    "building-completed": "bonsai_event_building_completed",
    "problem-changed": "bonsai_event_problem_changed",
    "budget-settled": "bonsai_event_budget_settled",
    "service-dispatched": "bonsai_event_service_dispatched",
    "history-cleared": "bonsai_history_cleared_simulation",
    milestone: "bonsai_event_milestone",
    broke: "bonsai_event_broke",
    brownout: "bonsai_event_brownout",
  });

  const state = {
    current: null,
    record: null,
    setupPreview: null,
    setupOptions: null,
    playing: false,
    speed: 0,
    lastRunningSpeed: 1,
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
    goalsForced: false,
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
    lastToolByCategory: new Map(TOOL_GROUPS.map((group) => [group.id, group.tools[0]?.id])),
    lastLandscape: typeof window !== "undefined" ? window.innerWidth > window.innerHeight : false,
    completedGoals: new Set(),
    fallbackUndo: [],
    fallbackRedo: [],
    clientSequence: 0,
    inspectorMode: "",
    selectedTile: null,
    overlay: "none",
    // M4 display toggles: the four 选项 view switches (buildings /
    // infrastructure / zones / underground). Session state only — never part
    // of a city save.
    display: { buildings: true, infrastructure: true, zones: true, underground: false },
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

  function setMessage(key, ...args) {
    state.latestMessage = { key, args };
    const target = query("[data-bonsai-status-message]");
    if (!target) return;
    target.textContent = t(key, ...args);
    // On phones the same element is a transient toast; restarting its CSS
    // animation is the only way a new message shows again without replacing
    // the element or touching its aria-live contract.
    target.style.animation = "none";
    void target.offsetWidth;
    target.style.animation = "";
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
        <span class="bonsai-gauge-funds" data-bonsai-status-funds data-bonsai-funds></span>
        <span class="bonsai-gauge-population" data-bonsai-status-population data-bonsai-population></span>
        <span class="bonsai-gauge-rci" data-bonsai-status-rci><canvas class="bonsai-rci-gauge" data-bonsai-rci-gauge width="26" height="14" role="img" aria-label="RCI"></canvas></span>
        <span class="bonsai-gauge-speed bonsai-speed-controls" role="group" aria-label="${t("bonsai_speed")}">
          ${SPEEDS.map((speed) => `<button class="btn mini-btn" type="button" data-bonsai-speed="${speed.value}" aria-pressed="${state.speed === speed.value}" aria-label="${t(`bonsai_speed_${speed.id}`)}" title="${t(`bonsai_speed_${speed.id}`)}">${speed.glyph}</button>`).join("")}
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
              <section class="bonsai-goals" data-bonsai-goals aria-label="${t("bonsai_opening_goals")}"></section>
              <section class="bonsai-tile-balloon" data-bonsai-tile-balloon aria-label="${t("bonsai_tile_inspector")}" hidden></section>
              <section class="bonsai-map-setup" data-bonsai-map-setup aria-labelledby="bonsai-map-setup-title" hidden></section>
              <section class="bonsai-city-browser" data-bonsai-city-browser aria-labelledby="bonsai-city-browser-title" hidden></section>
            </main>
            <aside class="bonsai-sub-palette" data-bonsai-sub-palette aria-label="${t("bonsai_toolbox")}"></aside>
            <aside class="bonsai-inspector" data-bonsai-inspector aria-labelledby="bonsai-inspector-title" hidden></aside>
          </div>
        </div>
      </div>`;
    document.querySelector(".desktop")?.append(win);
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
      button.setAttribute("aria-pressed", String(state.tool === lastTool));
      const label = `${t(category.labelKey)} · ${t(`bonsai_tool_${lastTool.replaceAll("-", "_")}`)}`;
      button.setAttribute("aria-label", label);
      button.title = label;
      // The terrain editor trims the rest of the rail until the city is
      // founded, exactly as the flat toolbox did.
      if (editing && category.id !== "terrain") button.disabled = true;
      const glyph = document.createElement("span");
      glyph.className = "bonsai-rail-glyph";
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = tool.icon;
      button.append(glyph);
      rail.append(button);
    });
  }

  // The sub-palette (M2 §3.4): one category at a time, keeping today's
  // .bonsai-tool markup and data-bonsai-tool attributes. CSS decides whether
  // it is docked (container ≥ 820px) or a sheet (below), via a @container
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
    const controls = document.createElement("div");
    controls.className = "bonsai-tool-grid";
    group.tools.forEach((tool) => {
      const cost = unitCost(tool);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn mini-btn bonsai-tool";
      button.dataset.bonsaiTool = tool.id;
      button.dataset.bonsaiCategory = group.id;
      button.setAttribute("aria-pressed", String(state.tool === tool.id));
      button.setAttribute("aria-label", `${t(`bonsai_tool_${tool.id.replaceAll("-", "_")}`)} · ${t("bonsai_unit_cost", cost)} · ${tool.shortcut || "—"}`);
      const icon = document.createElement("span");
      icon.className = "bonsai-tool-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = tool.icon;
      const label = document.createElement("span");
      label.className = "bonsai-tool-label";
      label.textContent = t(`bonsai_tool_${tool.id.replaceAll("-", "_")}`);
      const meta = document.createElement("span");
      meta.className = "bonsai-tool-meta";
      meta.textContent = `${tool.shortcut || "—"} · $${cost}`;
      button.append(icon, label, meta);
      controls.append(button);
    });
    section.append(heading, controls);
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
        <label><span>${t("bonsai_terrain_preset")}</span><span class="select-wrap"><select data-bonsai-map-terrain>${TERRAIN_PRESETS.map((preset) => `<option value="${preset}">${t(`bonsai_terrain_${preset}`)}</option>`).join("")}</select></span></label>
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
    setup.hidden = false;
    refreshSetupPreview();
  }

  function readSetupOptions() {
    const seedText = query("[data-bonsai-map-seed]")?.value.trim() || "";
    const rawSeed = seedText ? Number(seedText) : NaN;
    const rawSize = Number(query("[data-bonsai-map-size]")?.value);
    const terrainPreset = query("[data-bonsai-map-terrain]")?.value || "balanced";
    return {
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
    try {
      if ((state.dirty || state.saving) && !await flushCurrentCitySave()) return false;
      state.current = sim().createCity(options);
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
      renderer()?.resetView?.({ center: state.current.spawnCenter || null, size: state.current.size, zoom: 0.82 });
      setMessage("bonsai_status_ready");
      showFirstHint();
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

  function renderGoals() {
    const target = query("[data-bonsai-goals]");
    if (!target) return;
    if (!state.current || (state.completedGoals.size === GOALS.length && !state.goalsForced)) {
      target.hidden = true;
      return;
    }
    if (state.goalsForced && (!state.current || state.completedGoals.size === GOALS.length)) {
      target.hidden = false;
      target.innerHTML = `<h3>${t("bonsai_opening_goals")}</h3><ol>${GOALS.map((goal) => {
        const done = state.completedGoals.has(goal.id);
        return `<li class="${done ? "is-complete" : ""}">${done ? "✓" : "□"} ${t(`bonsai_goal_${goal.id}`)}</li>`;
      }).join("")}</ol>`;
      return;
    }
    target.hidden = false;
    target.innerHTML = `<h3>${t("bonsai_opening_goals")}</h3><ol>${GOALS.map((goal) => {
      const done = state.completedGoals.has(goal.id);
      return `<li class="${done ? "is-complete" : ""}">${done ? "✓" : "□"} ${t(`bonsai_goal_${goal.id}`)}</li>`;
    }).join("")}</ol>`;
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
      button.setAttribute("aria-pressed", String(Number(button.dataset.bonsaiSpeed) === speed));
    });
    renderGoals();
    renderStatus();
  }

  function currentDate() {
    try {
      return state.current ? sim().dateOf(state.current) : null;
    } catch {
      return null;
    }
  }

  function demandValue(kind) {
    const source = state.current?.demand || state.current?.rciDemand || {};
    const short = kind[0];
    return Math.round(Number(source[kind] ?? source[short] ?? source[short.toUpperCase()] ?? state.current?.[`${kind}Demand`] ?? 0));
  }

  function renderStatus() {
    const win = bonsaiWindow();
    if (!win) return;
    const date = currentDate();
    const tool = TOOLS.get(state.tool) || TOOLS.get("road");
    const cost = state.tool === "pan" ? 0 : Number(state.previewReceipt?.cost ?? unitCost(tool)) || 0;
    const speedId = state.playing ? SPEEDS.find((entry) => entry.value === state.speed)?.id || "normal" : "pause";
    const values = {
      city: state.record?.name || t("bonsai_city_unnamed"),
      date: date ? `${date.year}-${String((date.month ?? 0) + 1).padStart(2, "0")}-${String(date.day ?? 1).padStart(2, "0")}` : "—",
      speed: t(`bonsai_speed_${speedId}`),
      funds: state.current ? `$${formatMoney(state.current.funds)}` : "—",
      population: state.current ? String(Math.floor(Number(state.current.population) || 0)) : "—",
      tool: t(`bonsai_tool_${tool.id.replaceAll("-", "_")}`),
      cost: state.tool === "pan" ? "—" : `$${formatMoney(cost)}`,
      overlay: state.overlay && state.overlay !== "none" ? t(`bonsai_overlay_${state.overlay.replaceAll("-", "_")}`) : "",
    };
    Object.entries(values).forEach(([name, value]) => {
      const target = win.querySelector(`[data-bonsai-status-${name}]`);
      if (!target) return;
      target.textContent = name === "date" || name === "city" || name === "overlay" ? value : `${t(`bonsai_status_label_${name}`)} ${value}`;
    });
    if (state.current) {
      const r = demandValue("residential");
      const c = demandValue("commercial");
      const i = demandValue("industrial");
      const gauge = win.querySelector("[data-bonsai-rci-gauge]");
      if (gauge) {
        drawRciGauge(gauge, r, c, i);
        gauge.setAttribute("aria-label", `RCI ${r}/${c}/${i}`);
      }
    }
    setMessage(state.latestMessage.key, ...state.latestMessage.args);
  }

  // The RCI demand gauge: three bars on a centre zero line, 26x14 CSS px,
  // 1-bit, told apart by fill pattern (solid / 50% dither / hatch) so it
  // reads in Classic without colour.
  function drawRciGauge(canvas, r, c, i) {
    const dpr = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1));
    const width = 26;
    const height = 14;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(canvas).color || "#000";
    const zeroY = 7;
    const barW = 4;
    const gap = 3;
    const left = 4;
    const values = [r, c, i];
    values.forEach((value, index) => {
      const h = Math.max(-4, Math.min(4, Math.round((Number(value) || 0) / 50)));
      if (h === 0) return;
      const x = left + index * (barW + gap);
      // Bars grow out of the centre line: up for demand, down for oversupply,
      // each sitting flush against the line (up ends at zeroY - 1, down starts
      // at zeroY + 1) so the line never punctures a bar.
      const startY = h > 0 ? zeroY - Math.abs(h) : zeroY + 1;
      const endY = h > 0 ? zeroY : zeroY + 1 + Math.abs(h);
      for (let py = startY; py < endY; py += 1) {
        for (let px = x; px < x + barW; px += 1) {
          // index 0 solid, 1 dither, 2 hatch — colour-free 1-bit patterns.
          const keep = index === 0 ? true : index === 1 ? ((px + py) % 2 === 0) : ((px % 2) === 0);
          if (keep) ctx.fillRect(px, py, 1, 1);
        }
      }
    });
    ctx.fillRect(left - 2, zeroY, 3 * barW + 2 * gap + 4, 1);
  }

  function renderCity(city = state.current) {
    const active = renderer();
    if (!city || !state.rendererMounted || !active?.render) return;
    active.render(sim().buildRenderSnapshot(city), { overlay: state.overlay, display: state.display });
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
    renderGoals();
    renderInspector();
    syncUndoButtons();
    syncNewspaperMenu();
    syncDisplayMenuChecks();
  }

  function handleSimEvent(event) {
    const key = EVENT_KEYS[event?.type];
    if (event?.type === "disaster-started") audioEngine()?.sfx("siren");
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
    const monthBefore = Math.floor((Number(state.current.tick) || 0) / ticksPerMonth);
    sim().advanceTicks(state.current, count);
    state.dirty = true;
    if (Math.floor((Number(state.current.tick) || 0) / ticksPerMonth) !== monthBefore) scheduleAutosave();
    sim().drainEvents?.(state.current)?.forEach(handleSimEvent);
    renderAll();
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

  function zoomAt(factor) {
    renderer()?.zoomBy?.(factor);
    renderCity();
    scheduleSessionCommit();
  }

  function panBy(dx, dy) {
    renderer()?.panByScreen?.(dx, dy);
    renderCity();
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
    if (undo) undo.disabled = !state.current || (coreHistory ? !state.current.undoStack?.length : state.fallbackUndo.length === 0);
    if (redo) redo.disabled = !state.current || (coreHistory ? !state.current.redoStack?.length : state.fallbackRedo.length === 0);
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
      setMessage("bonsai_status_rejected", t("bonsai_rejection_reason", receipt?.code || "invalid"));
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
        zoomAt(distance / Math.max(1, state.multiTouch.distance));
      }
      state.multiTouch = { centerX, centerY, distance };
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
    else if (event.key === "ArrowLeft") panBy(-24, 0);
    else if (event.key === "ArrowRight") panBy(24, 0);
    else if (event.key === "ArrowUp") panBy(0, -24);
    else if (event.key === "ArrowDown") panBy(0, 24);
    else if (event.key === "+" || event.key === "=") zoomAt(1.1);
    else if (event.key === "-") zoomAt(0.9);
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
      zoomAt(event.deltaY < 0 ? 1.1 : 0.9);
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
      bonsai_tile_building: info.building ?? info.stage,
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

  function openGraphs() {
    if (!state.current) return;
    state.inspectorMode = "graphs";
    renderInspector();
    scheduleSessionCommit();
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

  function syncDisplayMenuChecks() {
    document.querySelectorAll(".menu-popover button, .menu-submenu-popover button").forEach((button) => {
      const key = button.dataset.bonsaiDisplay;
      if (!key) return;
      const on = state.display[key] === true;
      button.classList.toggle("is-checked", on);
      if (button.hasAttribute("aria-pressed")) button.setAttribute("aria-pressed", String(on));
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
    state.inspectorMode = "";
    state.selectedTile = null;
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
          ${graphSeriesIds.map((seriesId) => `<label class="bonsai-graph-series-item"><input type="checkbox" data-bonsai-graph-series="${seriesId}"${state.graphSeries.includes(seriesId) ? " checked" : ""}> <span>${t(`bonsai_graph_${seriesId}`)}</span></label>`).join("")}
        </fieldset>
      </div>
      <div class="bonsai-graph-legend" data-bonsai-graph-legend aria-hidden="true">${state.graphSeries.map((seriesId, index) => `<span class="bonsai-graph-legend-item is-pattern-${index}">${t(`bonsai_graph_${seriesId}`)}</span>`).join("")}</div>`;
  }

  function refreshGraphPanel() {
    drawGraphChart(query("[data-bonsai-graph-canvas]"));
    const legend = query("[data-bonsai-graph-legend]");
    if (legend) {
      legend.innerHTML = state.graphSeries.map((seriesId, index) => `<span class="bonsai-graph-legend-item is-pattern-${index}">${t(`bonsai_graph_${seriesId}`)}</span>`).join("");
    }
  }

  function renderMiniMap() {
    const canvas = query("[data-bonsai-minimap]");
    if (!canvas || !state.current || typeof renderer()?.renderMiniMap !== "function") return;
    renderer().renderMiniMap(canvas, sim().buildRenderSnapshot(state.current), { overlay: state.overlay });
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
      <canvas class="bonsai-minimap" data-bonsai-minimap width="1" height="1" aria-label="${t("bonsai_minimap")}"></canvas>
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

  function toggleGoalsCard() {
    state.goalsForced = !state.goalsForced;
    renderGoals();
  }

  function setAudioMode(mode) {
    if (!["music", "sfx", "off"].includes(mode)) return;
    state.audioMode = mode;
    if (mode !== "off") audioEngine();
    syncAudioMode();
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
      setMessage("bonsai_status_rejected", t("bonsai_rejection_reason", receipt?.code || "invalid"));
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
      const bytes = await saveCodec().exportSc2(sim().serialize(state.current));
      const ok = window.AISystem6WebPlatform?.saveArtifact?.({
        blob: new Blob([Uint8Array.from(bytes)], { type: "application/octet-stream" }),
        fileName: `${String(state.record?.name || "bonsai-city").replace(/[^a-z0-9_-]+/gi, "-")}.sc2`,
        mimeType: "application/octet-stream",
      });
      setMessage(ok ? "bonsai_status_exported_sc2" : "bonsai_status_export_failed");
      return ok;
    } catch {
      setMessage("bonsai_status_export_failed");
      return false;
    }
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
        <div class="bonsai-news-stories">${(paper.stories || []).map((story) => {
          const shaped = story.key === "ordinance" ? { ...story, id: t(`bonsai_ordinance_${story.id}`) } : story;
          return `<p class="bonsai-news-story">${t(`bonsai_news_${story.key}`, shaped)}</p>`;
        }).join("") || `<p class="bonsai-news-story">${t("bonsai_news_none")}</p>`}</div>
        <label class="bonsai-ordinance"><input type="checkbox" data-bonsai-policy-newspaper${state.current.paperDelivery ? " checked" : ""}><span>${t("bonsai_news_subscribe")}</span></label>`;
    } else if (state.inspectorMode === "graphs") {
      titleKey = "bonsai_graphs";
      rows = {};
      controls = `
        <canvas class="bonsai-graph-canvas" data-bonsai-graph-canvas aria-label="${t("bonsai_graphs")}"></canvas>
        ${graphControlsMarkup()}`;
    } else if (state.inspectorMode === "population") {
      titleKey = "bonsai_population";
      rows = {
        bonsai_population: state.current.population ?? 0,
        bonsai_jobs: state.current.jobs ?? 0,
        bonsai_commercial_jobs: state.current.cJobs ?? 0,
        bonsai_industrial_jobs: state.current.iJobs ?? 0,
        bonsai_workforce: `${state.current.workforcePercent ?? 0}%`,
        bonsai_unemployed: state.current.unemployed ?? 0,
        bonsai_national_population: state.current.nationalPopulation ?? 0,
      };
    } else if (state.inspectorMode === "industry") {
      titleKey = "bonsai_industry";
      rows = {
        bonsai_industrial_jobs: state.current.iJobs ?? 0,
        bonsai_commercial_jobs: state.current.cJobs ?? 0,
        bonsai_economy_index: state.current.economyIndex ?? 0,
        bonsai_industry_demand: state.current.demand?.i ?? 0,
        bonsai_commerce_demand: state.current.demand?.c ?? 0,
        bonsai_residential_demand: state.current.demand?.r ?? 0,
      };
    } else if (state.inspectorMode === "neighbors") {
      titleKey = "bonsai_neighbors";
      const rail = state.current.railService || {};
      const subway = state.current.subwayService || {};
      const bus = state.current.busService || {};
      rows = {
        bonsai_rail_passengers: rail.passengerCapacity ?? 0,
        bonsai_rail_freight: rail.freightCapacity ?? 0,
        bonsai_rail_stations: rail.connectedStations ?? 0,
        bonsai_subway_passengers: subway.passengerCapacity ?? 0,
        bonsai_subway_stations: subway.connectedStations ?? 0,
        bonsai_bus_capacity: bus.capacity ?? 0,
        bonsai_bus_relief: bus.roadTrafficRelief ?? 0,
        bonsai_national_population: state.current.nationalPopulation ?? 0,
      };
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
        const saveData = await saveCodec().encode(cityAtStart, metadata);
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
        setMessage(unchanged ? "bonsai_status_saved" : "bonsai_status_saved_pending_changes");
        return true;
      } catch {
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
        const saveData = await saveCodec().encode(cityAtStart, metadata);
        await writeCityRecord({
          id: metadata.cityId,
          name: metadata.name,
          createdAt: metadata.createdAt,
          updatedAt: metadata.updatedAt,
          saveData,
        });
        setMessage("bonsai_status_saved_copy");
        return true;
      } catch {
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
      state.completedGoals.clear();
      clearHistory("bonsai_history_cleared_load");
      hideCityBrowser();
      const setup = query("[data-bonsai-map-setup]");
      if (setup) setup.hidden = true;
      renderer()?.resetView?.({ center: builtViewCenter(state.current) || state.current.spawnCenter || null, size: state.current.size, zoom: 0.82 });
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
        [{ id: "starter-town", label: "starter" }, { id: "troubled-mid-size", label: "troubled" }].forEach((example) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "btn";
          button.dataset.bonsaiExample = example.id;
          button.dataset.bonsaiExampleLabel = example.label;
          button.dataset.bonsaiAction = "open";
          button.textContent = t(`bonsai_example_${example.label}`);
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
        ["open", "export", "export-sc2", "delete"].forEach((action) => {
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
        text: JSON.stringify(target.saveData, null, 2),
        fileName: `${String(target.name || "bonsai-city").replace(/[^a-z0-9_-]+/gi, "-")}.bonsai-city.json`,
        mimeType: "application/json",
      });
      setMessage(ok ? "bonsai_status_exported" : "bonsai_status_export_failed");
      return;
    }
    if (action === "export-sc2") {
      try {
        const decoded = await saveCodec().decode(target.saveData);
        const bytes = await saveCodec().exportSc2(sim().serialize(decoded.state));
        const ok = window.AISystem6WebPlatform?.saveArtifact?.({
          blob: new Blob([Uint8Array.from(bytes)], { type: "application/octet-stream" }),
          fileName: `${String(target.name || "bonsai-city").replace(/[^a-z0-9_-]+/gi, "-")}.sc2`,
          mimeType: "application/octet-stream",
        });
        setMessage(ok ? "bonsai_status_exported_sc2" : "bonsai_status_export_failed");
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
      state.completedGoals.clear();
      clearHistory("bonsai_history_cleared_new");
      hideCityBrowser();
      const setup = query("[data-bonsai-map-setup]");
      if (setup) setup.hidden = true;
      selectTool("road");
      renderer()?.resetView?.({ center: builtViewCenter(city) || city.spawnCenter || null, size: city.size, zoom: 0.82 });
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
      const city = await sim().createExampleCity(exampleId);
      if (!city) throw new Error("bonsai-example-missing");
      const createdAt = new Date().toISOString();
      state.current = city;
      state.record = {
        id: makeId(city.seed),
        name: t(`bonsai_example_${label}`),
        createdAt,
        updatedAt: createdAt,
      };
      state.dirty = true;
      scheduleAutosave();
      state.playing = false;
      state.speed = 0;
      state.lastRunningSpeed = 1;
      state.tickCarry = 0;
      state.completedGoals.clear();
      clearHistory("bonsai_history_cleared_new");
      hideCityBrowser();
      const setup = query("[data-bonsai-map-setup]");
      if (setup) setup.hidden = true;
      selectTool("road");
      renderer()?.resetView?.({ center: builtViewCenter(city) || city.spawnCenter || null, size: city.size, zoom: 0.82 });
      setMessage("bonsai_status_ready");
      renderAll();
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
      let decodedState; let importedName;
      if (isSc2) {
        const imported = await saveCodec().importSc2(bytes);
        decodedState = sim().deserialize(imported.payload);
        importedName = imported.name;
      } else {
        const decoded = await saveCodec().parseAndDecode(new TextDecoder().decode(bytes));
        decodedState = decoded.state;
        importedName = decoded.metadata?.name;
      }
      const id = makeId(decodedState?.seed);
      const createdAt = new Date().toISOString();
      const name = importedName || file.name.replace(/\.bonsai-city\.json$|\.json$|\.sc2$|\.scn$/i, "") || t("bonsai_city_unnamed");
      const saveData = await saveCodec().encode(decodedState, { cityId: id, name, createdAt, updatedAt: createdAt });
      await writeCityRecord({ id, name, createdAt, updatedAt: createdAt, saveData });
      clearHistory("bonsai_history_cleared_import");
      setMessage(isSc2 ? "bonsai_status_imported_sc2" : "bonsai_status_imported");
      await openCityBrowser();
    } catch {
      setMessage("bonsai_status_import_failed");
    }
  }

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
      const toolButton = event.target.closest("[data-bonsai-tool]");
      if (toolButton) return selectTool(toolButton.dataset.bonsaiTool);
      if (event.target.closest("[data-bonsai-open-graphs]")) return openGraphs();
      const overlayChip = event.target.closest("[data-bonsai-overlay-chip]");
      if (overlayChip) return setOverlay(overlayChip.dataset.bonsaiOverlayChip);
      if (event.target.closest("[data-bonsai-found-city]")) return foundCity();
      const speedButton = event.target.closest("[data-bonsai-speed]");
      if (speedButton) return setSpeed(Number(speedButton.dataset.bonsaiSpeed));
      if (event.target.closest("[data-bonsai-minimap-toggle]")) return toggleMinimapCard();
      if (event.target.closest("[data-bonsai-inspector-close]")) return closeInspector();
      if (event.target.closest("[data-bonsai-browser-close]")) {
        hideCityBrowser(true);
        if (!state.current) showSetup(state.setupOptions || {});
        return;
      }
      if (event.target.closest("[data-bonsai-browser-new]")) return showSetup();
      if (event.target.closest("[data-bonsai-browser-import]")) return query("[data-bonsai-import-input]")?.click();
      if (event.target.closest("[data-bonsai-policy-bond-issue]")) return submitPolicy({ policy: "bond", action: "issue" });
      const repayButton = event.target.closest("[data-bonsai-policy-bond-repay]");
      if (repayButton) return submitPolicy({ policy: "bond", action: "repay", index: Number(repayButton.dataset.bonsaiPolicyBondRepay) });
      const exampleButton = event.target.closest("[data-bonsai-example]");
      if (exampleButton) return openExampleCity(exampleButton.dataset.bonsaiExample, exampleButton.dataset.bonsaiExampleLabel);
      const scenarioButton = event.target.closest("[data-bonsai-scenario]");
      if (scenarioButton) return openScenarioCity(scenarioButton.dataset.bonsaiScenario);
      const cityAction = event.target.closest("[data-bonsai-city-action]");
      if (cityAction) return handleCityBrowserAction(cityAction);
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
      if (event.target.matches("[data-bonsai-map-size], [data-bonsai-map-terrain], [data-bonsai-map-seed]")) refreshSetupPreview();
      if (event.target.matches("[data-bonsai-import-input]")) {
        importCityFile(event.target.files?.[0]);
        event.target.value = "";
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
          if (state.sessionRestore.tool) selectTool(state.sessionRestore.tool);
          if (state.sessionRestore.overlay) setOverlay(state.sessionRestore.overlay);
          if (state.sessionRestore.view) renderer()?.resetView?.(state.sessionRestore.view);
          if (state.sessionRestore.inspectorMode === "report") openReport();
          else if (state.sessionRestore.inspectorMode === "budget") openBudget();
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
          state.lifecycleUnregister?.();
          state.lifecycleUnregister = null;
          registerLifecycle();
          startLoop();
          throw new Error("bonsai-suspend-save-failed");
        }
      },
      onResume: async () => {
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

  registerSessionAdapter();

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
    isRunning: () => !!state.timer,
    checkpoint,
    debugState,
  });

  // The fourteen buttons that used to live in the command strip now live in
  // the gauge bar or in menus (M1 §3.1). Commands are registered through the
  // runtime exactly like Micropolis; the split follows the Macintosh release
  // of the original game (§12): File, Speed, Options, Disasters, Windows and
  // Newspaper. Items whose destination does not exist yet (人口, 工业, 图表,
  // 邻市, 自动预算, the display toggles) are deliberately not shipped rather
  // than opening nothing.
  const bonsaiMenuCommands = {
    "new-city": () => showSetup(),
    "open-city": () => openCityBrowser(),
    "terrain-editor": () => showSetup({ editor: true }),
    "open-scenario": () => openScenarioBrowser(),
    "save": () => saveCurrentCity(),
    "save-as": () => saveCurrentCityAs(),
    "export-sc2": () => exportCurrentSc2(),
    "undo": () => performUndo(),
    "redo": () => performRedo(),
    "report": () => openReport(),
    "budget": () => openBudget(),
    "news": () => openNews(),
    "open-graphs": () => openGraphs(),
    "open-population": () => openPopulation(),
    "open-industry": () => openIndustry(),
    "open-neighbors": () => openNeighbors(),
    "ordinances": () => openBudget(),
    "toggle-renderer": () => setRendererBackend(state.rendererBackend === "three-voxel" ? "canvas-2d" : "three-voxel"),
    "minimap": () => toggleMinimapCard(),
    "display-buildings": () => setDisplay("buildings"),
    "display-infrastructure": () => setDisplay("infrastructure"),
    "display-zones": () => setDisplay("zones"),
    "display-underground": () => setDisplay("underground"),
    "sound-music": () => setAudioMode("music"),
    "sound-sfx": () => setAudioMode("sfx"),
    "sound-off": () => setAudioMode("off"),
    "subscribe": () => openNews(),
    "extra": () => openNews(),
    "disasters-off": () => submitPolicy({ policy: "disasters", enabled: false }),
  };
  OVERLAYS.forEach((overlay) => { bonsaiMenuCommands[`overlay-${overlay}`] = () => setOverlay(overlay); });
  REWARD_TOOL_IDS.forEach((toolId) => { bonsaiMenuCommands[`reward-${toolId}`] = () => selectTool(toolId); });
  ["fire", "flood", "tornado", "earthquake", "monster"].forEach((kind) => { bonsaiMenuCommands[`disaster-${kind}`] = () => submitDisaster(kind); });
  SPEEDS.forEach((speed) => { bonsaiMenuCommands[`speed-${speed.value}`] = () => setSpeed(speed.value); });

  const commandsNeedingCity = new Set([
    "save", "save-as", "export-sc2", "undo", "redo", "report", "budget", "news", "ordinances", "minimap", "disasters-off",
    "open-graphs", "open-population", "open-industry", "open-neighbors",
    "display-buildings", "display-infrastructure", "display-zones", "display-underground",
    ...OVERLAYS.map((overlay) => `overlay-${overlay}`),
    ...REWARD_TOOL_IDS.map((toolId) => `reward-${toolId}`),
    ...["fire", "flood", "tornado", "earthquake", "monster"].map((kind) => `disaster-${kind}`),
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
    const rewardItems = REWARD_TOOL_IDS.map((toolId) => item(`reward-${toolId}`, `bonsai_tool_${toolId.replaceAll("-", "_")}`));
    const disasterItems = ["fire", "flood", "tornado", "earthquake", "monster"].map((kind) => item(`disaster-${kind}`, `bonsai_tool_disaster_${kind}`));
    // Speed cells borrow registry shortcut ids purely for their ⌘1..⌘4 menu
    // labels; the keys themselves are handled by the shell's window listener
    // (bare digits 1-4 belong to terrain tools through handleMapKey).
    const speedShortcutIds = { 0: "route-question-sheet", 0.25: "route-outline", 1: "route-section-drafts", 4: "route-manuscript" };
    const speedItems = SPEEDS.map((speed) => item(`speed-${speed.value}`, `bonsai_speed_${speed.id}`, speedShortcutIds[speed.value]));
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
          separator,
          submenu("bonsai_menu_data_views", overlayItems),
          separator,
          submenu("bonsai_menu_rewards", rewardItems),
          separator,
          displayItem("buildings"),
          displayItem("infrastructure"),
          displayItem("zones"),
          displayItem("underground"),
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
        handler: () => openWindow(WINDOW_NAME),
        isAvailable: () => true,
      },
    },
  });
})();
