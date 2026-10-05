// Feature module: Joyride / 兜风 — the third original game.
//
// Drive a car through a Bonsai City town at street level, drawn the way a
// 1996 Macintosh would: the city's own voxel models through a perspective
// camera, rendered small (640 x 480, or the compact Mac's 512 x 342 in black
// and white), quantized to the 8-bit system palette or Atkinson-dithered to
// one bit, and scaled up with nearest pixels.
//
// A second way to draw the same drive, the character night drive (字符夜航),
// takes the same town, car and roads into the night and draws every frame as
// characters on the GPU, filling the window or the phone screen instead of
// keeping the old monitor's frame. "Style" (classic or characters) and the
// classic screen's colour depth are separate preferences; V cycles the three
// screens -- black and white, 256 colours, characters -- in place, without
// stopping the car.
//
// This file is the shell: the window, the pedals and wheel, the frame loop
// and the preferences. The picture's arithmetic, the collision world and the
// car's physics are the headless core in joyride-core.js. The city comes from
// the Bonsai City simulation and is only read: Joyride builds its
// demonstration town in memory and never saves into Bonsai City's store.
// See internal/plans/STREETS-GAME-SPEC.zh-CN.md.
window.AISystem6JoyrideLoaded = true;

(function initJoyrideFeature() {
  "use strict";

  const WINDOW_NAME = "joyride";
  const PREFS_KEY = "ai-system6-joyride-prefs";
  const CAMERAS = Object.freeze(["chase", "cockpit", "overhead"]);
  const STYLES = Object.freeze(["classic", "glyph"]);
  // One character cell in CSS pixels: a 9-point monospaced face on a 12-pixel
  // line, small enough that a street reads as a street on a phone.
  const GLYPH_CELL = Object.freeze([7, 12]);
  const core = () => window.AISystem6JoyrideCore;
  const street = () => window.AISystem6JoyrideTraffic;
  const SCORES_KEY = "ai-system6-joyride-scores";
  // The driver's career across shifts (P2; D7 kept it in localStorage: a
  // handful of numbers, no store of its own).
  const CAREER_KEY = "ai-system6-joyride-career";
  const RADIO_STATIONS = Object.freeze([null, "bonsai-fm", "night-line", "static-am"]);

  const game = {
    prefs: readPrefs(),
    camera: "chase",
    phase: "idle", // idle | loading | ready | driving | paused | failed
    message: "",
    renderer: null,
    rendererSize: "",
    snapshot: null,
    world: null,
    ramps: null,
    nightSnapshot: null,
    output: null,
    // Which city: the demonstration town or one of the player's Bonsai
    // City cities, always a read-only snapshot.
    town: null,
    townSerial: 0,
    pendingCity: null,
    intro: null,
    haze: 0,
    areaText: "",
    areaAt: 0,
    // P1: the town around the car, the evening shift, the radio.
    traffic: null,
    shift: false,
    station: null,
    radio: null,
    dashAt: 0,
    news: "",
    newsUntil: 0,
    eventLog: [],
    photos: 0,
    spawns: [],
    car: null,
    paint: 1,
    view: { y: 0, heading: 0, ready: false },
    keys: new Set(),
    touch: { gas: 0, brake: 0, steer: 0, handbrake: 0 },
    skids: [],
    pad: { camera: false, pause: false },
    raf: 0,
    last: 0,
    carry: 0,
    pixels: null,
    image: null,
    speedText: "",
    loadPromise: null,
    audio: null,
  };

  // --- preferences (localStorage, D7) ------------------------------------------

  function readPrefs() {
    const defaults = { depth: null, style: "classic", sound: true, hideMenuBar: true };
    try {
      const stored = JSON.parse(window.localStorage?.getItem(PREFS_KEY) || "null");
      if (!stored || typeof stored !== "object") return defaults;
      return {
        depth: ["mono", "256", "thousands"].includes(stored.depth) ? stored.depth : null,
        style: STYLES.includes(stored.style) ? stored.style : "classic",
        sound: stored.sound !== false,
        hideMenuBar: stored.hideMenuBar !== false,
      };
    } catch {
      return defaults;
    }
  }

  function writePrefs() {
    try {
      window.localStorage?.setItem(PREFS_KEY, JSON.stringify(game.prefs));
    } catch {
      // A private window keeps the choice for this visit only.
    }
  }

  // Until the player picks a screen, the appearance picks it: a one-bit
  // desktop (System 6) gets the black-and-white compact Mac, every other
  // appearance a 256-colour monitor.
  function screenDepth() {
    if (game.prefs.depth) return game.prefs.depth;
    return window.AISystem6Theme?.hasCapability?.("one-bit-chrome") ? "mono" : "256";
  }

  function screenStyle() {
    return STYLES.includes(game.prefs.style) ? game.prefs.style : "classic";
  }

  // --- the window --------------------------------------------------------------

  const WHEEL = `<svg class="joyride-wheel-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="34"/>
    <path d="M16 50h22M62 50h22M50 62v22"/><circle cx="50" cy="50" r="12"/>
  </svg>`;

  function installJoyrideWindow() {
    if (typeof document === "undefined") return null;
    const existing = document.querySelector('[data-window="joyride"]');
    if (existing) {
      syncHostContract();
      return existing;
    }
    const win = window.AISystem6ApplicationShell.createWindow({
      windowName: WINDOW_NAME,
      windowClass: "joyride-window",
      labelledBy: "joyride-title",
      titleKey: "joyride_title",
      title: t("joyride_title"),
      statusClass: "joyride-status",
      statusHtml: `<span class="joyride-status-city" data-joyride-city></span><span class="joyride-status-area" data-joyride-area></span><span class="joyride-status-speed" data-joyride-speed></span>`,
      paneClass: "joyride-pane",
      paneHtml: `
        <div class="joyride-stage" data-joyride-stage tabindex="0" aria-describedby="joyride-message">
          <canvas class="joyride-screen" data-joyride-screen width="640" height="480"></canvas>
          <div class="joyride-gl" data-joyride-gl hidden></div>
          <canvas class="joyride-radar" data-joyride-radar width="128" height="128" aria-hidden="true" hidden></canvas>
          <div class="joyride-banner" data-joyride-banner aria-live="polite" hidden><strong data-joyride-banner-title></strong><span data-joyride-banner-line></span></div>
          <div class="joyride-title" data-joyride-title hidden>
            <div class="joyride-title-card">
              <p class="joyride-title-mark"><span data-i18n="joyride_title_mark">${escapeHtml(t("joyride_title_mark"))}</span><small data-i18n="joyride_title_small">${escapeHtml(t("joyride_title_small"))}</small></p>
              <p class="joyride-title-line" data-i18n="joyride_title_tagline">${escapeHtml(t("joyride_title_tagline"))}</p>
              <div class="button-row">
                <button type="button" class="btn" data-joyride-title-action="city" data-i18n="joyride_open_city">${escapeHtml(t("joyride_open_city"))}</button>
                <button type="button" class="btn" data-joyride-title-action="shift" data-i18n="joyride_start_shift">${escapeHtml(t("joyride_start_shift"))}</button>
                <button type="button" class="btn joyride-title-go" data-joyride-title-action="drive" data-i18n="joyride_title_drive">${escapeHtml(t("joyride_title_drive"))}</button>
              </div>
              <p class="joyride-title-keys" data-i18n="joyride_title_keys">${escapeHtml(t("joyride_title_keys"))}</p>
            </div>
          </div>
          <p class="joyride-message" id="joyride-message" data-joyride-message role="status"></p>
        </div>
        <div class="joyride-dash" data-joyride-dash>
          <span class="joyride-dash-clock" data-joyride-clock></span>
          <span class="joyride-dash-money" data-joyride-money></span>
          <span class="joyride-dash-wanted" data-joyride-wanted></span>
          <span class="joyride-dash-damage" data-joyride-damage></span>
          <span class="joyride-dash-job" data-joyride-job></span>
          <span class="joyride-dash-radio" data-joyride-radio></span>
        </div>
        <div class="joyride-controls" data-joyride-controls hidden>
          <div class="joyride-wheel" data-joyride-wheel role="slider" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0" data-i18n-aria-label="joyride_touch_wheel" aria-label="${escapeHtml(t("joyride_touch_wheel"))}">${WHEEL}</div>
          <div class="joyride-buttons">
            <button type="button" class="btn" data-joyride-action="camera" data-i18n="joyride_touch_camera">${escapeHtml(t("joyride_touch_camera"))}</button>
            <button type="button" class="btn" data-joyride-action="screen" data-i18n="joyride_touch_screen">${escapeHtml(t("joyride_touch_screen"))}</button>
            <button type="button" class="btn" data-joyride-action="radio" data-i18n="joyride_touch_radio">${escapeHtml(t("joyride_touch_radio"))}</button>
            <button type="button" class="btn" data-joyride-action="pause" data-i18n="joyride_touch_pause">${escapeHtml(t("joyride_touch_pause"))}</button>
            <button type="button" class="btn" data-joyride-action="ride" data-i18n="joyride_touch_ride" hidden>${escapeHtml(t("joyride_touch_ride"))}</button>
          </div>
          <div class="joyride-pedals">
            <div class="joyride-pedal-stack">
              <button type="button" class="joyride-pedal joyride-pedal-handbrake" data-joyride-pedal="handbrake" data-i18n="joyride_touch_handbrake">${escapeHtml(t("joyride_touch_handbrake"))}</button>
              <button type="button" class="joyride-pedal" data-joyride-pedal="brake" data-i18n="joyride_touch_brake">${escapeHtml(t("joyride_touch_brake"))}</button>
            </div>
            <button type="button" class="joyride-pedal joyride-pedal-gas" data-joyride-pedal="gas" data-i18n="joyride_touch_gas">${escapeHtml(t("joyride_touch_gas"))}</button>
          </div>
        </div>
        <form class="joyride-prefs" data-joyride-prefs role="dialog" aria-modal="true" aria-labelledby="joyride-prefs-title" hidden>
          <h3 id="joyride-prefs-title" data-i18n="joyride_prefs_title">${escapeHtml(t("joyride_prefs_title"))}</h3>
          <label class="field-row"><span data-i18n="joyride_pref_style">${escapeHtml(t("joyride_pref_style"))}</span><span class="select-wrap"><select data-joyride-pref="style">
            <option value="classic" data-i18n="joyride_style_classic">${escapeHtml(t("joyride_style_classic"))}</option>
            <option value="glyph" data-i18n="joyride_style_glyph">${escapeHtml(t("joyride_style_glyph"))}</option>
          </select></span></label>
          <label class="field-row"><span data-i18n="joyride_pref_depth">${escapeHtml(t("joyride_pref_depth"))}</span><span class="select-wrap"><select data-joyride-pref="depth">
            <option value="mono" data-i18n="joyride_depth_mono">${escapeHtml(t("joyride_depth_mono"))}</option>
            <option value="256" data-i18n="joyride_depth_256">${escapeHtml(t("joyride_depth_256"))}</option>
            <option value="thousands" data-i18n="joyride_depth_thousands">${escapeHtml(t("joyride_depth_thousands"))}</option>
          </select></span></label>
          <label class="field-row"><input type="checkbox" data-joyride-pref="sound"><span data-i18n="joyride_pref_sound">${escapeHtml(t("joyride_pref_sound"))}</span></label>
          <label class="field-row"><input type="checkbox" data-joyride-pref="hideMenuBar"><span data-i18n="joyride_pref_hide_menu">${escapeHtml(t("joyride_pref_hide_menu"))}</span></label>
          <p class="joyride-prefs-keys" data-i18n="joyride_pref_keys">${escapeHtml(t("joyride_pref_keys"))}</p>
          <div class="button-row"><button type="submit" class="btn" data-i18n="ok">${escapeHtml(t("ok"))}</button></div>
        </form>
        <form class="joyride-prefs joyride-shift" data-joyride-shift role="dialog" aria-modal="true" aria-labelledby="joyride-shift-title" hidden>
          <h3 id="joyride-shift-title" data-joyride-shift-title></h3>
          <p class="joyride-prefs-keys" data-joyride-shift-summary></p>
          <div class="joyride-letter" data-joyride-letter hidden>
            <p class="joyride-letter-title" data-i18n="joyride_letter_record">${escapeHtml(t("joyride_letter_record"))}</p>
            <ul class="joyride-letter-facts" data-joyride-letter-facts></ul>
            <label class="joyride-letter-own"><span data-i18n="joyride_letter_own">${escapeHtml(t("joyride_letter_own"))}</span><input type="text" maxlength="140" data-joyride-letter-words autocomplete="off"></label>
            <div class="button-row"><button type="button" class="btn" data-joyride-letter-send data-i18n="joyride_letter_send">${escapeHtml(t("joyride_letter_send"))}</button></div>
            <p class="joyride-prefs-keys" data-joyride-letter-status role="status"></p>
          </div>
          <ol class="joyride-scores" data-joyride-scores></ol>
          <div class="button-row">
            <button type="button" class="btn" data-joyride-shift-close data-i18n="joyride_free_drive">${escapeHtml(t("joyride_free_drive"))}</button>
            <button type="submit" class="btn" data-i18n="joyride_shift_again">${escapeHtml(t("joyride_shift_again"))}</button>
          </div>
        </form>
        <form class="joyride-prefs joyride-cities" data-joyride-cities role="dialog" aria-modal="true" aria-labelledby="joyride-cities-title" hidden>
          <h3 id="joyride-cities-title" data-i18n="joyride_cities_title">${escapeHtml(t("joyride_cities_title"))}</h3>
          <label class="field-row"><span class="select-wrap"><select data-joyride-city-choice></select></span></label>
          <p class="joyride-prefs-keys" data-joyride-cities-note></p>
          <div class="button-row">
            <button type="button" class="btn" data-joyride-cities-cancel data-i18n="cancel">${escapeHtml(t("cancel"))}</button>
            <button type="submit" class="btn" data-i18n="joyride_open">${escapeHtml(t("joyride_open"))}</button>
          </div>
        </form>
        <form class="joyride-prefs joyride-ride" data-joyride-ride role="dialog" aria-modal="true" aria-labelledby="joyride-ride-title" hidden>
          <h3 id="joyride-ride-title" data-joyride-ride-title></h3>
          <label class="field-row"><span class="select-wrap"><select data-joyride-ride-choice></select></span></label>
          <p class="joyride-prefs-keys" data-joyride-ride-note></p>
          <div class="button-row">
            <button type="button" class="btn" data-joyride-ride-cancel data-i18n="cancel">${escapeHtml(t("cancel"))}</button>
            <button type="submit" class="btn" data-i18n="joyride_ride_go">${escapeHtml(t("joyride_ride_go"))}</button>
          </div>
        </form>`,
    });
    wireWindow(win);
    syncHostContract();
    return win;
  }

  function windowElement() {
    return document.querySelector('[data-window="joyride"]');
  }

  function part(name) {
    return windowElement()?.querySelector(`[data-joyride-${name}]`) || null;
  }

  function windowIsVisible() {
    const win = windowElement();
    return Boolean(win && !win.classList.contains("is-hidden") && !win.classList.contains("is-collapsed")
      && !win.classList.contains("is-minimized") && !document.hidden);
  }

  function syncHostContract() {
    // Joyride is a WebGL/JS street shell — no Wasm engine binary (v223 honesty).
    window.AISystem6WasmHostContract?.syncFromPhase?.(windowElement(), game.phase, {
      kind: "joyride",
      wasm: 0,
      binary: 0,
      fail: true,
      crash: true,
    });
  }

  function setMessage(key, ...args) {
    game.message = key || "";
    const node = part("message");
    if (!node) return;
    node.textContent = key ? t(key, ...args) : "";
    node.hidden = !key;
    syncHostContract();
  }

  function syncStatus() {
    const city = part("city");
    if (city) city.textContent = game.town ? game.town.name : "";
    syncArea();
    const speed = part("speed");
    if (speed) {
      const kmh = game.car ? Math.round(Math.abs(game.car.speed) / core().METRE * 3.6) : 0;
      const text = game.car ? t("joyride_speed", kmh) : "";
      if (text !== game.speedText) {
        game.speedText = text;
        speed.textContent = text;
      }
    }
  }

  // --- loading the town ------------------------------------------------------------

  // A frame, or a moment when the page is hidden and frames do not come.
  function nextFrame() {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 50);
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => { clearTimeout(timer); resolve(); });
    });
  }

  // Opening Joyride goes back to the pot last driven (Basin J5) when it is
  // still among Bonsai City's saves -- read in the same read-only way as
  // Open City -- and otherwise to the demonstration town.
  const LAST_TOWN_KEY = "ai-system6-joyride-last-town";
  function rememberTown(source) {
    try {
      if (source.kind === "save" && source.id) window.localStorage?.setItem(LAST_TOWN_KEY, JSON.stringify({ kind: "save", id: source.id }));
      else if (source.kind === "demo") window.localStorage?.removeItem(LAST_TOWN_KEY);
    } catch {
      // Private windows forget; the demonstration town opens next time.
    }
  }
  async function lastTownSource() {
    try {
      const last = JSON.parse(window.localStorage?.getItem(LAST_TOWN_KEY) || "null");
      if (!last || last.kind !== "save" || !last.id) return null;
      const record = (await listBonsaiCities()).find((candidate) => candidate.id === last.id);
      return record ? { kind: "save", id: record.id, name: record.name, saveData: record.saveData } : null;
    } catch {
      return null;
    }
  }

  function ensureGame() {
    if (game.loadPromise) return game.loadPromise;
    const pending = game.pendingCity;
    game.pendingCity = null;
    game.loadPromise = (async () => loadTown(pending || (await lastTownSource()) || { kind: "demo" }))();
    return game.loadPromise;
  }

  // Load a town: the demonstration town (replayed by the simulation), a
  // saved Bonsai City city (decoded from its save record, never written
  // back), or a snapshot Bonsai City handed over ("Drive Its Streets"). The
  // renderer, the collision world and the spawns are rebuilt; the car, the
  // camera and the screen preferences carry over.
  async function loadTown(source) {
    if (game.phase === "driving") pauseDriving("");
    game.phase = "loading";
    game.intro = null;
    setMessage("joyride_status_loading");
    try {
      await nextFrame();
      await nextFrame();
      const sim = window.AISystem6BonsaiSim;
      let snapshot;
      let name;
      let osm = false;
      let transit = null;
      if (source.kind === "save") {
        // Bonsai City stores a save as JSON text or as the envelope itself.
        const envelope = typeof source.saveData === "string" ? JSON.parse(source.saveData) : source.saveData;
        const decoded = await sim.decodeSave(envelope);
        snapshot = sim.buildRenderSnapshot(decoded.state);
        name = source.name || t("joyride_city_unnamed");
        osm = decoded.state?.provenance?.source === "openstreetmap";
        transit = decoded.state?.transitLines || null;
      } else if (source.kind === "snapshot" || source.snapshot) {
        snapshot = source.snapshot;
        name = source.name || t("joyride_city_unnamed");
        osm = source.osm === true;
        transit = source.v === 2 ? source.lines || null : source.transitLines || null;
      } else {
        // The demonstration town: Hezhou, 1952, replayed by the simulation
        // itself (Bonsai City's own recipe), read only through its snapshot.
        const replayed = sim.replayExampleCity("hezhou-1952");
        snapshot = sim.buildRenderSnapshot(replayed);
        name = t("joyride_city_demo");
        transit = replayed?.transitLines || null;
      }
      // Bus and BRT lines laid from a Rootline plan come with the hand-over
      // (Basin J4); the demonstration town reads the Hezhou recipe's own
      // transitLines sidecar, if the replay carries one. The street reads the
      // lanes and stops they imply off its own copy of the snapshot.
      game.transit = transit;
      snapshot = core().streetLayers(snapshot, game.transit);
      // Each town gets its own revision family, so two cities that happen
      // to share a simulation rev never share the renderer's chunks.
      game.townSerial += 1;
      const rev = `town${game.townSerial}:${snapshot.rev ?? 0}`;
      // Midday for the classic screens whatever tick the city stands at; the
      // hour belongs to the view, not to the city. The character drive is
      // the same town after dark.
      game.handoff = source.v === 2 ? { hour: source.hour, date: source.date, ref: source.ref, lines: source.lines || null } : null;
      game.snapshot = { ...snapshot, rev, timeOfDay: game.handoff ? (Number.isFinite(snapshot.timeOfDay) ? snapshot.timeOfDay : source.hour / 24) : 0.42 };
      game.nightSnapshot = { ...snapshot, rev: `${rev}:night`, timeOfDay: 0.03 };
      // A city drawn from OpenStreetMap carries its ODbL credit wherever it
      // is shown, here beside its name.
      game.town = { kind: source.kind || "demo", name: osm ? t("joyride_city_osm", name) : name, id: source.id || null, cityId: source.cityId || source.id || null, fingerprint: source.fingerprint || null, osm };
      await mountRenderer();
      buildWorld();
      applyScreen();
      game.spawns = core().spawnPoints(game.world, { spawns: core().citySpawns(snapshot, source.from) });
      newDrive(source.from ? 0 : null);
      startTraffic(false);
      game.haze = 0;
      game.areaText = "";
      game.phase = "ready";
      setMessage("joyride_status_ready");
      syncStatus();
      if (source.descend) startIntro();
      else if (!game.titleSeen) showTitle();
      else drawFrame();
    } catch (error) {
      game.phase = "failed";
      game.loadPromise = null;
      const webgl = error && error.code === window.AISystem6BonsaiVoxelRenderer?.WEBGL_UNAVAILABLE_CODE;
      setMessage(webgl ? "joyride_status_no_webgl" : "joyride_status_failed");
      console.warn("Joyride could not start.", error);
    }
  }

  // A city handed over before or after the window opens: before, it is the
  // first town loaded; after, it replaces the one on the road.
  function queueCity(city) {
    if (!city || !city.snapshot) return;
    // cityId (the Bonsai City save's record id) and fingerprint (the shared
    // city core's identity) travel with the town, so a letter finds its city.
    const source = { kind: "snapshot", snapshot: city.snapshot, name: city.name, from: city.from, osm: city.osm === true, descend: city.descend !== false, cityId: city.cityId || city.ref?.cityId || null, fingerprint: city.fingerprint || city.ref?.fingerprint || null, transitLines: city.transitLines || city.ref?.transitLines || null };
    // Hand-over v2 (the Basin canon): the mayor's day, season and hour come
    // stamped on the snapshot; Joyride keeps them instead of its own noon.
    // A city handed over from a Bonsai City save is the one to reopen.
    if (source.cityId) rememberTown({ kind: "save", id: source.cityId });
    if (city.v === 2) Object.assign(source, { v: 2, hour: Number.isFinite(city.hour) ? city.hour : 12, date: city.date || null, ref: city.ref || null, lines: city.lines || null });
    if (!game.loadPromise) {
      game.pendingCity = source;
      return;
    }
    game.loadPromise = game.loadPromise.then(() => loadTown(source));
  }

  // From above, the way the mayor sees the city, down to the street behind
  // the car: two and a half seconds, and any pedal takes over at once.
  // "Reduce motion" (the system setting) is respected: the descent lands at
  // once, the title holds still, a knock does not shake the lens.
  function reducedMotion() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function startIntro() {
    if (reducedMotion()) {
      game.intro = null;
      drawFrame();
      return;
    }
    game.intro = { start: performance.now(), duration: 2600 };
    const step = () => {
      if (!game.intro || game.phase === "driving") return;
      drawFrame();
      if (performance.now() - game.intro.start >= game.intro.duration) {
        game.intro = null;
        drawFrame();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // --- the cities a player has --------------------------------------------------------

  // Bonsai City's saves, read in a read-only transaction. Joyride never
  // opens that store for writing.
  async function listBonsaiCities() {
    const store = window.AISystem6Config?.storageConfig?.bonsaiCitiesStoreName || "bonsaiCities";
    if (typeof openAppDb !== "function") return [];
    const db = await openAppDb();
    try {
      if (!db.objectStoreNames.contains(store)) return [];
      const records = await new Promise((resolve, reject) => {
        const request = db.transaction(store, "readonly").objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      return records
        .filter((record) => record && record.id && record.saveData)
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    } finally {
      db.close();
    }
  }

  async function openCities() {
    const form = part("cities");
    if (!form) return;
    if (game.phase === "driving") pauseDriving("");
    closePrefs();
    const select = form.querySelector("[data-joyride-city-choice]");
    const note = form.querySelector("[data-joyride-cities-note]");
    let records = [];
    try {
      records = await listBonsaiCities();
    } catch (error) {
      console.warn("Joyride could not list Bonsai City saves.", error);
    }
    game.cityRecords = records;
    select.innerHTML = [`<option value="demo">${escapeHtml(t("joyride_city_demo"))}</option>`,
      ...records.map((record) => `<option value="${escapeHtml(record.id)}">${escapeHtml(record.name || t("joyride_city_unnamed"))}</option>`)].join("");
    select.value = game.town?.kind === "save" && game.town.id ? game.town.id : "demo";
    note.textContent = t(records.length ? "joyride_cities_note" : "joyride_cities_none");
    form.hidden = false;
    select.focus();
  }

  function closeCities() {
    const form = part("cities");
    if (form) form.hidden = true;
  }

  function chooseCity() {
    const form = part("cities");
    const id = form.querySelector("[data-joyride-city-choice]").value;
    closeCities();
    const record = (game.cityRecords || []).find((candidate) => candidate.id === id);
    const source = record ? { kind: "save", id: record.id, name: record.name, saveData: record.saveData } : { kind: "demo" };
    rememberTown(source);
    game.loadPromise = (game.loadPromise || Promise.resolve()).then(() => loadTown(source));
  }

  // --- the shared world (pot-world, the Basin canon) ----------------------------------
  //
  // When the shared core is loaded, names come from its gazetteer (the same
  // district, street and station names Bonsai City and Rootline show), the
  // letter is composed by it, and a hand-over from the mayor's view is taken
  // as given. Without it Joyride keeps its own names.
  const potWorld = () => window.AISystem6PotWorld || null;
  function uiLanguage() {
    return typeof currentLanguage === "string" && currentLanguage === "zh" ? "zh" : "en";
  }
  function places() {
    const world = potWorld();
    if (!world?.gazetteer || !game.snapshot) return null;
    if (game.placesFor !== game.townSerial) {
      try { game.places = world.gazetteer(game.snapshot); } catch { game.places = null; }
      game.placesFor = game.townSerial;
    }
    return game.places;
  }

  // --- the railway (P3) -----------------------------------------------------------------

  // A station's name: the gazetteer's when the shared core is loaded (named
  // for its district, never renamed by a later station); otherwise from
  // where it stands in the city.
  function stationName(station) {
    if (!station) return "";
    // A planned line's stations carry the names Rootline gave them.
    if (station.name && (station.name.zh || station.name.en)) return station.name[uiLanguage()] || station.name.zh;
    const gazetteer = places();
    if (gazetteer) {
      const facility = (game.snapshot.facilities || []).find((item) => item.x === station.x && item.y === station.y);
      const named = gazetteer.stationName({ kind: station.kind === "subway" ? "subway-station" : "station", x: station.x, y: station.y, builtTick: Number(facility?.builtTick) || 0 });
      if (named) return named[uiLanguage()] || named.zh;
    }
    return t("joyride_station_name", station.kind, t(`joyride_compass_${station.compass}`), station.ordinal);
  }

  // City minutes, at the shift's pace, whether or not a shift is on.
  function cityMinutes(seconds) {
    const { SHIFT } = street();
    const scale = game.traffic?.clock?.scale || (SHIFT.end - SHIFT.start) / SHIFT.realSeconds;
    return Math.max(1, Math.round(seconds * scale / 60));
  }

  // Stopped at a station: say so once, and show the touch button.
  function syncStation(now) {
    if (now - (game.stationAt || 0) < 400) return;
    game.stationAt = now;
    const traffic = game.traffic;
    const here = traffic && game.car && Math.abs(game.car.speed) < 3 * core().METRE / 3.6 ? street().stationHere(traffic, game.car) : null;
    const id = here ? here.id : null;
    if (id && id !== game.stationHint) say("joyride_news_at_station", stationName(here));
    game.stationHint = id;
    const button = windowElement()?.querySelector('[data-joyride-action="ride"]');
    if (button) button.hidden = !id;
  }

  function openRide() {
    const form = part("ride");
    const traffic = game.traffic;
    if (!form || !traffic || !game.car) return;
    const station = street().stationHere(traffic, game.car);
    if (!station) { say("joyride_news_no_station"); return; }
    if (Math.abs(game.car.speed) > 3 * core().METRE / 3.6) { say("joyride_news_stop_first"); return; }
    if (game.phase === "driving") pauseDriving("");
    closePrefs();
    closeCities();
    const rail = window.AISystem6JoyrideRail;
    const options = rail.destinations(traffic.rail, station.id, traffic.seconds);
    form.querySelector("[data-joyride-ride-title]").textContent = t("joyride_ride_title", stationName(station));
    const select = form.querySelector("[data-joyride-ride-choice]");
    const line = traffic.rail.lines.find((candidate) => candidate.id === station.line);
    const lineName = line?.name ? `${line.name[uiLanguage()] || line.name.zh} · ` : "";
    select.innerHTML = options.map((entry) => `<option value="${escapeHtml(entry.station.id)}">${escapeHtml(lineName + t("joyride_ride_option", stationName(entry.station), cityMinutes(entry.times.wait), cityMinutes(entry.times.ride)))}</option>`).join("");
    form.querySelector("[data-joyride-ride-note]").textContent = t(traffic.wanted > 0 ? "joyride_ride_note_wanted" : "joyride_ride_note");
    form.hidden = false;
    select.focus();
  }

  function closeRide() {
    const form = part("ride");
    if (form) form.hidden = true;
  }

  // Wait, ride, come out at the other station: the street there is a new
  // one, and the car is one from the station's car park.
  function rideTo(toId) {
    closeRide();
    const traffic = game.traffic;
    if (!traffic || !game.car) return;
    const result = street().rideTrain(traffic, game.car, toId);
    if (!result.ok) {
      say(`joyride_news_ride_${result.reason.replace("-", "_")}`);
      syncDash();
      part("stage")?.focus({ preventScroll: true });
      return;
    }
    traffic.events.forEach(onStreetEvent);
    traffic.events = [];
    const to = result.to;
    const spawn = core().spawnPoints(game.world, { spawns: core().citySpawns(game.snapshot, { x: to.x + to.w / 2, y: to.y + to.h / 2 }, 1) })[0];
    game.paint = 1 + (game.paint % 4);
    game.car = core().createCar(spawn);
    game.skids = [];
    traffic.graceUntil = traffic.seconds + 5;
    game.view.ready = false;
    game.carry = 0;
    game.stationHint = null;
    game.phase = "paused";
    setMessage("joyride_status_rode", stationName(to));
    drawFrame();
    syncDash();
    part("stage")?.focus({ preventScroll: true });
  }

  // --- a photograph (P3) ------------------------------------------------------------------
  //
  // Spec §7, as Aaron decided on 2026-10-02: the shutter puts the picture in
  // the project's Picture Album (the imageAttachments store ClioPaint uses;
  // no new store) and a text card on the File Floppy, which holds text only.
  // Both carry the city, the hour and, for a real place, the OpenStreetMap
  // credit; the credit is also drawn into the picture, so it travels with
  // the file. Only the player's own shutter does this; nothing suggests it.

  function photoCanvas() {
    return screenStyle() === "glyph" ? part("gl")?.querySelector("canvas") : part("screen");
  }

  // The frame as it is on the screen, with a caption strip under it.
  function photoBlob(caption) {
    const source = photoCanvas();
    if (!source || !source.width || !source.height) return Promise.resolve(null);
    const strip = Math.max(16, Math.round(source.height / 24));
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height + strip;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, source.height, canvas.width, 1);
    ctx.font = `${Math.round(strip * 0.62)}px Geneva, "Helvetica Neue", Arial, sans-serif`;
    ctx.textBaseline = "middle";
    // The pot's seal (Basin canon): 16x16 one-bit, stamped at the strip's
    // right end, when the shared core can draw it for this city.
    let sealWidth = 0;
    const world = potWorld();
    if (typeof world?.sealBits === "function" && game.town?.cityId) {
      try {
        const bits = world.sealBits(game.town.cityId, game.town.name);
        const cell = Math.max(1, Math.floor((strip - 4) / 16));
        const left = canvas.width - 16 * cell - Math.round(strip * 0.4);
        const top = source.height + Math.round((strip - 16 * cell) / 2);
        ctx.fillStyle = "#a01818";
        for (let i = 0; i < 256; i += 1) if (bits[i]) ctx.fillRect(left + (i % 16) * cell, top + Math.floor(i / 16) * cell, cell, cell);
        ctx.fillStyle = "#000";
        sealWidth = 16 * cell + strip * 0.4;
      } catch {
        sealWidth = 0;
      }
    }
    ctx.fillText(caption, Math.round(strip * 0.4), source.height + strip / 2 + 0.5, canvas.width - strip * 0.8 - sealWidth);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  }

  async function takePhoto() {
    if (!game.car || !game.town) return;
    const project = typeof getActiveProject === "function" ? getActiveProject() : null;
    if (!project || typeof buildImageAttachments !== "function") {
      say("joyride_news_photo_no_project");
      syncDash();
      return;
    }
    const clock = game.traffic?.clock;
    const when = clock ? clockText(clock.seconds) : t("joyride_photo_free_drive");
    // With the shared core: the district and the pot's date join the caption.
    const gazetteer = places();
    const district = gazetteer && game.car ? gazetteer.districtAt(Math.floor(game.car.x), Math.floor(game.car.z)) : null;
    const date = game.handoff?.date;
    const extra = [district ? district[uiLanguage()] || district.zh : "", date && Number.isFinite(date.year) ? t("joyride_pot_date", date.year, date.month + 1, date.day) : ""].filter(Boolean).join(" · ");
    const caption = t("joyride_photo_caption", game.town.name, extra ? `${extra} · ${when}` : when);
    const blob = await photoBlob(caption);
    if (!blob) { say("joyride_news_photo_failed"); syncDash(); return; }
    // Numbered from the second photo of a visit, so two from one hour (or a
    // free drive, which has none) are not two files of one name.
    const ordinal = game.photos > 0 ? ` ${game.photos + 1}` : "";
    const name = `${t("joyride_photo_name", game.town.name.split(" · ")[0], when.replace(":", "."))}${ordinal}.png`;
    const built = await buildImageAttachments([new File([blob], name, { type: "image/png" })], { projectId: project.id, surface: "joyride", limit: 1, maxEdge: 1280 });
    const record = built[0];
    if (!record) { say("joyride_news_photo_failed"); syncDash(); return; }
    record.alt = caption;
    // Which city the picture was taken in, so an album can sort by place.
    record.cityId = game.town.cityId || null;
    record.cityName = game.town.name;
    saveImageAttachments([record]);
    project.updatedAt = new Date().toISOString();
    markDeskDirty("projects", project.id);
    const persisted = await saveDeskState();
    // The card on the File Floppy: plain text a writer can search and quote.
    const lines = [
      `# ${t("joyride_photo_card_title", game.town.name.split(" · ")[0], when)}`,
      "",
      `- ${t("joyride_photo_card_city", game.town.name)}`,
      `- ${t("joyride_photo_card_when", when)}`,
      game.areaText ? `- ${t("joyride_photo_card_area", game.areaText)}` : "",
      `- ${t("joyride_photo_card_screen", t(`joyride_style_${screenStyle()}`))}`,
      `- ${t("joyride_photo_card_album", name)}`,
      game.town.osm ? `- ${t("joyride_photo_card_osm")}` : "",
    ].filter((line) => line !== "");
    let carded = false;
    if (typeof insertFilesIntoFileFloppy === "function") {
      // One card at a time: a second insert while the first is still being
      // indexed would cancel it.
      const card = new File([`${lines.join("\n")}\n`], name.replace(/\.png$/, ".md"), { type: "text/markdown" });
      const turn = (game.floppyQueue || Promise.resolve()).then(() => insertFilesIntoFileFloppy([card], { source: "joyride", openAfter: "" })).catch(() => null);
      game.floppyQueue = turn;
      const result = await turn;
      carded = Boolean(result?.mountedFileNames?.length);
    }
    game.photos += 1;
    say(persisted ? (carded ? "joyride_news_photo_saved" : "joyride_news_photo_saved_no_card") : "joyride_news_photo_unsaved", name);
    syncDash();
    chime(1320, 0.05);
  }

  // --- what the street is like here ------------------------------------------------------

  // The five-by-five tiles around the car, read from the city's own layers:
  // what the blocks are zoned for, and how land value, crime and pollution
  // stand. Nothing here is invented; a layer the city lacks is left out.
  function areaAround() {
    const snapshot = game.snapshot;
    const car = game.car;
    if (!snapshot || !car) return null;
    const size = snapshot.size;
    const cx = Math.floor(car.x);
    const cy = Math.floor(car.z);
    const zones = [0, 0, 0, 0];
    let land = 0, landN = 0, crime = 0, crimeN = 0, smog = 0, smogN = 0;
    for (let y = cy - 2; y <= cy + 2; y += 1) {
      for (let x = cx - 2; x <= cx + 2; x += 1) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const i = y * size + x;
        const zone = Number(snapshot.zone?.[i]) || 0;
        if (zone >= 1 && zone <= 3) zones[zone] += 1;
        if (snapshot.landValue && snapshot.landValue[i]) { land += snapshot.landValue[i]; landN += 1; }
        if (snapshot.crime && zone >= 1 && zone <= 3) { crime += snapshot.crime[i]; crimeN += 1; }
        if (snapshot.pollution) { smog += snapshot.pollution[i]; smogN += 1; }
      }
    }
    const zoneIndex = zones.indexOf(Math.max(zones[1], zones[2], zones[3]));
    return {
      zone: zones[zoneIndex] > 0 ? ["", "r", "c", "i"][zoneIndex] : "none",
      land: landN ? land / landN / 255 : null,
      crime: crimeN ? crime / crimeN / 255 : null,
      smog: smogN ? smog / smogN / 255 : 0,
    };
  }

  // Bonsai City's own five steps (its data overlays split 0..255 into
  // fifths), so the street says what the mayor's map shows.
  function level(value) {
    return value === null ? null : Math.max(0, Math.min(4, Math.floor(value * 5)));
  }

  // The five steps are the city's absolute scale; patrols follow where a
  // block stands within its own town. When the two disagree (a quiet town's
  // roughest corner still reads "crime very low") the street says both.
  function crimeStanding(area) {
    const traffic = game.traffic;
    if (!traffic?.here || area.crime === null || traffic.ranges?.crime?.even) return null;
    if (traffic.here.crime >= 0.8) return "worst";
    if (traffic.here.crime <= 0.2) return "best";
    return null;
  }

  function syncArea() {
    const node = part("area");
    if (!node) return;
    const now = performance.now();
    if (now - game.areaAt < 400 && game.areaText) return;
    game.areaAt = now;
    const area = areaAround();
    let text = area ? t("joyride_area", t(`joyride_zone_${area.zone}`), level(area.land), level(area.crime), level(area.smog), crimeStanding(area)) : "";
    const gazetteer = places();
    if (gazetteer && text && game.car) {
      const x = Math.floor(game.car.x), y = Math.floor(game.car.z);
      const where = gazetteer.streetAt(x, y) || gazetteer.districtAt(x, y);
      if (where) text = `${where[uiLanguage()] || where.zh} · ${text}`;
    }
    if (text !== game.areaText) {
      game.areaText = text;
      node.textContent = text;
    }
  }

  async function mountRenderer() {
    if (game.renderer) return;
    const [width, height] = core().RESOLUTIONS[screenDepth()];
    game.renderer = window.AISystem6BonsaiVoxelRendererFactory();
    await game.renderer.mount(part("gl"), { street: { width, height } });
    if (game.rampSurface) game.renderer.setStreetExtras(game.rampSurface.blocks, game.rampSurface);
    else if (game.ramps) game.renderer.setStreetExtras(game.ramps);
  }

  // The screen: the classic small frame read back and converted, or the
  // character drive drawn straight to the WebGL canvas at the stage's size.
  function applyScreen() {
    const renderer = game.renderer;
    if (!renderer || !renderer.isReady()) return;
    const stage = part("stage");
    const style = screenStyle();
    stage.dataset.style = style;
    part("gl").hidden = style !== "glyph";
    renderer.setStreetNight(style === "glyph");
    if (style === "glyph") {
      const rect = stage.getBoundingClientRect();
      game.output = renderer.setStreetOutput({
        mode: "glyph",
        width: Math.max(64, Math.round(rect.width)),
        height: Math.max(64, Math.round(rect.height)),
        dpr: window.devicePixelRatio || 1,
        cell: GLYPH_CELL,
      });
      game.rendererSize = `glyph:${game.output.cols}x${game.output.rows}`;
      return;
    }
    const depth = screenDepth();
    const [width, height] = core().RESOLUTIONS[depth];
    game.output = renderer.setStreetOutput({ mode: "readback", width, height });
    game.rendererSize = `${width}x${height}`;
    const screen = part("screen");
    if (screen.width !== width || screen.height !== height) {
      screen.width = width;
      screen.height = height;
    }
    if (!game.pixels || game.pixels.length !== width * height * 4) {
      game.pixels = new Uint8Array(width * height * 4);
      game.image = screen.getContext("2d").createImageData(width, height);
    }
    screen.dataset.depth = depth;
  }

  // Black and white, 256 colours, characters: the same street drawn three
  // ways, switched in place.
  const SCREENS = Object.freeze([["classic", "mono"], ["classic", "256"], ["glyph", null]]);
  function cycleScreen() {
    const style = screenStyle();
    const depth = screenDepth();
    const at = SCREENS.findIndex(([s, d]) => s === style && (d === null || d === depth));
    const [nextStyle, nextDepth] = SCREENS[(at + 1) % SCREENS.length];
    game.prefs = { ...game.prefs, style: nextStyle, depth: nextDepth || game.prefs.depth };
    writePrefs();
    applyScreen();
    syncMenuChecks();
    if (game.phase !== "driving") drawFrame();
  }

  function setStyle(style) {
    if (!STYLES.includes(style)) return;
    game.prefs = { ...game.prefs, style };
    writePrefs();
    applyScreen();
    syncMenuChecks();
    if (game.phase !== "driving") drawFrame();
  }

  // Collision is derived from what the renderer draws: every chunk's blocks
  // and model voxels, rasterized once per town.
  function buildWorld() {
    const renderer = game.renderer;
    const pure = renderer.pure;
    const snapshot = game.snapshot;
    const world = core().createStreetWorld(snapshot.size, renderer.VOXEL_LAYER);
    const runs = new Map();
    const modelRuns = (index) => {
      if (!runs.has(index)) {
        const voxels = renderer.voxelModelVoxels(index);
        runs.set(index, voxels ? core().modelColumnRuns(voxels) : null);
      }
      return runs.get(index);
    };
    const chunks = Math.ceil(snapshot.size / renderer.CHUNK_SIZE);
    for (let cy = 0; cy < chunks; cy += 1) {
      for (let cx = 0; cx < chunks; cx += 1) {
        core().rasterizeChunk(world, renderer.streetChunkBlocks(snapshot, cx, cy), { surfaceAt: pure.surfaceAt, altStep: pure.ALT_STEP, modelRuns });
      }
    }
    // The carriageway filled where Bonsai City's slope roads leave a kerb or
    // a ridge across it: drawn and solid, like everything else the car meets.
    game.ramps = core().fillCarriageway(world, snapshot);
    core().rasterizeChunk(world, { opaque: game.ramps }, { surfaceAt: pure.surfaceAt, altStep: pure.ALT_STEP, modelRuns });
    // Solid as boxes, drawn as a smooth ramp.
    game.rampSurface = core().rampSurface(world, snapshot, game.ramps);
    renderer.setStreetExtras(game.rampSurface.blocks, game.rampSurface);
    game.world = world;
  }

  // The shell owns the seed (the core never draws one): a new drive picks a
  // spawn and a paint from it.
  function newDrive(index = null) {
    if (!game.world || !game.spawns.length) return;
    const seed = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] : 1;
    const random = core().mulberry32(seed);
    const pick = Math.floor(random() * game.spawns.length);
    const spawn = game.spawns[Number.isInteger(index) && game.spawns[index] ? index : pick];
    game.paint = 1 + Math.floor(random() * 4);
    game.car = core().createCar(spawn);
    game.skids = [];
    // The first pedal is free: the city fines nobody who has not moved yet.
    if (game.traffic) game.traffic.graceUntil = game.traffic.seconds + 5;
    game.view.ready = false;
    game.carry = 0;
  }

  // --- driving ------------------------------------------------------------------------

  function startDriving() {
    if (!game.car || game.phase === "loading" || game.phase === "failed") return;
    hideTitle();
    if (!game.escHinted) {
      game.escHinted = true;
      say("joyride_news_esc_hint");
    }
    game.intro = null;
    closeCities();
    closeRide();
    closeShift();
    closePrefs();
    game.phase = "driving";
    setMessage("");
    game.last = 0;
    ensureAudio();
    syncMenuBar();
    syncMenuChecks();
    if (!game.raf) game.raf = requestAnimationFrame(tick);
    part("stage")?.focus({ preventScroll: true });
  }

  function pauseDriving(messageKey = "joyride_status_paused") {
    if (game.phase !== "driving") return;
    game.phase = "paused";
    game.keys.clear();
    Object.assign(game.touch, { gas: 0, brake: 0, steer: 0 });
    setMessage(messageKey);
    if (game.raf) cancelAnimationFrame(game.raf);
    game.raf = 0;
    silenceAudio();
    syncMenuBar();
    syncMenuChecks();
    drawFrame();
  }

  function togglePause() {
    if (game.phase === "driving") pauseDriving();
    else startDriving();
  }

  function readInput() {
    const keys = game.keys;
    let throttle = keys.has("up") ? 1 : 0;
    let brake = keys.has("down") ? 1 : 0;
    let steer = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
    throttle = Math.max(throttle, game.touch.gas);
    brake = Math.max(brake, game.touch.brake);
    if (game.touch.steer) steer = game.touch.steer;
    let handbrake = Math.max(keys.has("handbrake") ? 1 : 0, game.touch.handbrake || 0);
    const pad = readGamepad();
    if (pad) {
      throttle = Math.max(throttle, pad.throttle);
      brake = Math.max(brake, pad.brake);
      handbrake = Math.max(handbrake, pad.handbrake);
      if (Math.abs(pad.steer) > Math.abs(steer)) steer = pad.steer;
    }
    return { throttle, brake, steer, handbrake };
  }

  // Gamepad API, standard mapping: left stick steers, right trigger (or A)
  // drives, left trigger (or X) brakes, B is the handbrake, Y changes
  // camera, Start pauses.
  function readGamepad() {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return null;
    const pad = [...navigator.getGamepads()].find((candidate) => candidate && candidate.connected);
    if (!pad) return null;
    const button = (index) => (pad.buttons[index] ? pad.buttons[index].value || (pad.buttons[index].pressed ? 1 : 0) : 0);
    const axis = pad.axes[0] || 0;
    const camera = button(3) > 0.5;
    if (camera && !game.pad.camera) cycleCamera();
    game.pad.camera = camera;
    const pause = button(9) > 0.5;
    if (pause && !game.pad.pause) queueMicrotask(togglePause);
    game.pad.pause = pause;
    return {
      steer: Math.abs(axis) < 0.12 ? 0 : axis,
      throttle: Math.max(button(7), button(0)),
      brake: Math.max(button(6), button(2)),
      handbrake: button(1),
    };
  }

  function tick(now) {
    game.raf = 0;
    if (game.phase !== "driving") return;
    if (!windowIsVisible()) {
      pauseDriving();
      return;
    }
    const elapsed = game.last ? Math.min(0.25, (now - game.last) / 1000) : core().DT;
    game.last = now;
    game.carry += elapsed;
    const input = readInput();
    const busCover = Boolean(game.traffic?.job?.bus);
    const drive = busCover ? { ...input, throttle: input.throttle * 0.6, steer: input.steer * 0.7 } : input;
    let steps = 0;
    while (game.carry >= core().DT && steps < 15) {
      const traffic = game.traffic;
      core().stepCar(game.car, drive, game.world, traffic ? street().obstaclesNear(traffic, game.car) : null);
      if (busCover && game.car.speed > 60 * core().METRE / 3.6) game.car.speed = Math.sign(game.car.speed) * 60 * core().METRE / 3.6;
      if (traffic) {
        const before = traffic.clock ? Math.floor(traffic.clock.seconds / 3600) : null;
        street().stepTraffic(traffic, game.car, core().DT).forEach(onStreetEvent);
        const hour = traffic.clock ? Math.floor(traffic.clock.seconds / 3600) : null;
        if (hour !== null && hour !== before && hour !== game.trafficHour && window.AISystem6JoyrideBus && traffic.rail?.lines?.some((line) => line.kind === "bus" || line.kind === "brt")) {
          game.trafficHour = hour;
          const line = window.AISystem6JoyrideBus.trafficLine(traffic.rail, game.snapshot, game.handoff?.tick, uiLanguage());
          if (line) { game.news = line; game.newsUntil = performance.now() + 20000; game.dashAt = 0; }
        }
      }
      game.carry -= core().DT;
      steps += 1;
    }
    if (steps === 15) game.carry = 0;
    game.input = input;
    if (steps) markSkids(input);
    checkWreck(now);
    drawFrame(elapsed, true);
    updateAudio(input);
    syncStatus();
    syncDash();
    syncStation(now);
    drawRadar(now);
    if (game.shift && game.traffic && street().shiftOver(game.traffic.clock)) {
      endShift();
      return;
    }
    game.raf = requestAnimationFrame(tick);
  }

  // --- the town around the car (P1) ---------------------------------------------------

  // A fresh street: free driving (no clock, midday) or an evening shift
  // (17:00 to 20:00, scored). The shell draws the seed; the street is a pure
  // function of it and the car.
  function startTraffic(shift) {
    if (!game.world || !game.snapshot) return;
    const seed = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] : 1;
    game.shift = Boolean(shift);
    game.traffic = street().createTraffic({
      snapshot: game.snapshot, world: game.world, seed,
      clock: game.shift ? street().createClock() : null,
      // Lines laid from a Rootline plan come with the hand-over (Basin J4).
      transit: game.transit || null,
      money: game.shift ? 0 : game.traffic?.money || 0,
      reputation: readCareer().reputation,
    });
    game.news = "";
    syncDash();
  }

  // The player's own car, or the ambulance or fire engine picked up for an
  // emergency job.
  function playerVehicle() {
    const job = game.traffic?.job;
    return job?.vehicle && job.stage >= job.vehicleFrom ? job.vehicle : `agent.car.${game.paint}`;
  }

  // The classic screens follow the shift's hour; free driving stays at
  // midday. After dark the lamps light, which needs the chunks rebuilt once.
  function daySnapshot() {
    const clock = game.traffic?.clock;
    if (!clock) {
      // Free driving keeps the hour the town arrived with: the mayor's view
      // when handed over (noon or midnight), else mid-morning.
      const free = game.handoff ? (Number.isFinite(game.handoff.hour) ? game.handoff.hour / 24 : 0.5) : 0.42;
      if (game.snapshot.timeOfDay !== free || /:dusk$/.test(String(game.snapshot.rev))) {
        game.snapshot = { ...game.snapshot, rev: String(game.snapshot.rev).replace(/:dusk$/, ""), timeOfDay: free };
      }
      return game.snapshot;
    }
    const time = street().timeOfDay(clock);
    const dark = time > 0.77 || time < 0.23;
    const rev = String(game.snapshot.rev).replace(/:dusk$/, "") + (dark ? ":dusk" : "");
    if (game.snapshot.rev !== rev) game.snapshot = { ...game.snapshot, rev };
    game.snapshot.timeOfDay = time;
    return game.snapshot;
  }

  function startShift() {
    if (!game.car) return;
    closeShift();
    newDrive();
    startTraffic(true);
    say("joyride_news_shift_start");
    startDriving();
  }

  function endShift() {
    const traffic = game.traffic;
    pauseDriving("");
    const score = street().shiftScore(traffic);
    const entry = { score, money: Math.round(traffic.money), jobs: traffic.jobsDone, busted: traffic.bustedCount, city: game.town?.name || "", cityKey: cityKey(), day: new Date().toISOString().slice(0, 10) };
    const scores = keepScores(readScores(), entry);
    writeCareer({ shifts: 1 });
    writeScores(scores);
    const board = scores.filter((item) => scoreCity(item) === entry.cityKey).slice(0, 10);
    game.lastRecord = street().letterFacts(traffic);
    game.letterSent = false;
    showScores(t("joyride_shift_over_title"), t("joyride_shift_over", score, entry.money, entry.jobs, entry.busted), board, entry, game.lastRecord);
    game.shift = false;
  }

  // D4: a letter to the mayor. The system lists the shift's record --
  // neutral facts from the diary, each traceable to a tile or a count --
  // and the player may add one line of their own, kept word for word. The
  // system writes no sentence in the driver's voice (Basin canon, ruling 4:
  // a template is still the system speaking). Only the player's Send posts
  // it: to the shared city core when that is loaded, else into Joyride's
  // own queue for Bonsai City to collect. No number in the city changes.
  const LETTERS_KEY = "ai-system6-joyride-letters";
  function letterPlace(fact) {
    const zone = t(`joyride_zone_${fact.zone || "none"}`);
    return fact.compass === "central" ? t("joyride_letter_place_central", zone, fact.zone) : t("joyride_letter_place", t(`joyride_compass_${fact.compass}`), zone, fact.zone);
  }
  function factLine(fact) {
    if (fact.key === "jam") return t("joyride_fact_jam", letterPlace(fact), fact.n);
    if (fact.key === "bus-wait") {
      const station = game.traffic?.rail?.stations?.find((item) => item.x === fact.x && item.y === fact.y);
      return t("joyride_fact_bus_wait", station ? stationName(station) : `${fact.x},${fact.y}`, fact.n);
    }
    return t(`joyride_fact_${fact.key.replace("-", "_")}`, fact.n);
  }
  function sendLetter() {
    const record = game.lastRecord;
    const form = part("shift");
    if (!record || !form || game.letterSent) return;
    const ownWords = (form.querySelector("[data-joyride-letter-words]")?.value || "").slice(0, 140).trim() || null;
    const letter = {
      from: "joyride", kind: "letter-to-the-mayor",
      cityId: game.town?.cityId || null,
      town: { name: game.town?.name || "", id: game.town?.id || null, cityId: game.town?.cityId || null, fingerprint: game.town?.fingerprint || null, kind: game.town?.kind || "demo" },
      writtenAt: new Date().toISOString(),
      facts: record.list.map((fact) => ({ ...fact })),
      ownWords,
    };
    let posted = false;
    const world = window.AISystem6PotWorld;
    try {
      if (typeof world?.letters?.compose === "function" && typeof world?.postLetter === "function" && letter.cityId) {
        // The canon's own letter: the same facts and words, the pot's date.
        const gazetteer = places();
        const car = game.car;
        const district = gazetteer && car ? gazetteer.districtAt(Math.floor(car.x), Math.floor(car.z)) : null;
        const date = game.handoff?.date || {};
        posted = Boolean(world.postLetter(world.letters.compose({
          cityId: letter.cityId, cityName: letter.town.name,
          date: { year: date.year, month: date.month, day: date.day, hour: game.traffic?.clock ? game.traffic.clock.seconds / 3600 : game.handoff?.hour ?? null },
          from: { kind: "driver", districtId: district?.id || null },
          facts: letter.facts.map(({ key, x, y, n }) => ({ key, x, y, n })),
          ownWords: letter.ownWords,
        })));
      } else if (typeof world?.postLetter === "function") posted = Boolean(world.postLetter(letter));
    } catch {
      posted = false;
    }
    if (!posted) {
      try {
        const queue = JSON.parse(window.localStorage?.getItem(LETTERS_KEY) || "[]");
        const list = Array.isArray(queue) ? queue : [];
        list.push(letter);
        window.localStorage?.setItem(LETTERS_KEY, JSON.stringify(list.slice(-20)));
        posted = true;
      } catch {
        posted = false;
      }
    }
    game.letterSent = posted;
    const status = form.querySelector("[data-joyride-letter-status]");
    if (status) status.textContent = t(posted ? "joyride_letter_sent" : "joyride_letter_not_sent");
    const send = form.querySelector("[data-joyride-letter-send]");
    if (send) send.disabled = posted;
    return letter;
  }

  // High scores are kept city by city (the best ten of each); reputation
  // stays one, carried by the driver from town to town.
  function cityKey() {
    return game.town?.cityId || game.town?.fingerprint || game.town?.name || "";
  }
  function scoreCity(item) {
    return item.cityKey || item.city || "";
  }
  function keepScores(list, entry) {
    const all = [...(Array.isArray(list) ? list : []), entry].filter((item) => item && Number.isFinite(item.score));
    const byCity = new Map();
    all.forEach((item) => {
      const key = scoreCity(item);
      if (!byCity.has(key)) byCity.set(key, []);
      byCity.get(key).push(item);
    });
    return [...byCity.values()].flatMap((items) => items.sort((a, b) => b.score - a.score).slice(0, 10));
  }

  function readCareer() {
    try {
      const career = JSON.parse(window.localStorage?.getItem(CAREER_KEY) || "null");
      if (career && typeof career === "object") {
        return {
          reputation: Number(career.reputation) || 0,
          jobs: Number(career.jobs) || 0,
          earned: Number(career.earned) || 0,
          shifts: Number(career.shifts) || 0,
        };
      }
    } catch {
      // Unreadable: start a fresh career.
    }
    return { reputation: 0, jobs: 0, earned: 0, shifts: 0 };
  }

  function writeCareer(change) {
    const career = readCareer();
    const next = {
      reputation: Math.max(-10, Math.min(30, career.reputation + (change.reputation || 0))),
      jobs: career.jobs + (change.jobs || 0),
      earned: career.earned + (change.earned || 0),
      shifts: career.shifts + (change.shifts || 0),
    };
    try {
      window.localStorage?.setItem(CAREER_KEY, JSON.stringify(next));
    } catch {
      // A private window keeps the career for this visit only.
    }
    return next;
  }

  function readScores() {
    try {
      const list = JSON.parse(window.localStorage?.getItem(SCORES_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function writeScores(list) {
    try {
      window.localStorage?.setItem(SCORES_KEY, JSON.stringify(list));
    } catch {
      // A private window keeps the board for this visit only.
    }
  }

  function showScores(title, summary, scores, highlight = null, record = null) {
    const form = part("shift");
    if (!form) return;
    if (game.phase === "driving") pauseDriving("");
    closePrefs();
    closeCities();
    form.querySelector("[data-joyride-shift-title]").textContent = title;
    form.querySelector("[data-joyride-shift-summary]").textContent = summary;
    const letterNode = form.querySelector("[data-joyride-letter]");
    if (letterNode) {
      letterNode.hidden = !record;
      const facts = letterNode.querySelector("[data-joyride-letter-facts]");
      facts.innerHTML = record ? (record.list.length ? record.list : [{ key: "quiet" }]).map((fact) => `<li>${escapeHtml(fact.key === "quiet" ? t("joyride_fact_quiet") : factLine(fact))}</li>`).join("") : "";
      const words = letterNode.querySelector("[data-joyride-letter-words]");
      if (words) words.value = "";
      letterNode.querySelector("[data-joyride-letter-status]").textContent = "";
      const send = letterNode.querySelector("[data-joyride-letter-send]");
      if (send) send.disabled = false;
    }
    const list = form.querySelector("[data-joyride-scores]");
    list.innerHTML = scores.length
      ? scores.map((item) => `<li${item === highlight ? ' class="is-new"' : ""}>${escapeHtml(t("joyride_score_row", item.score, item.jobs, item.city, item.day))}</li>`).join("")
      : `<li>${escapeHtml(t("joyride_scores_empty"))}</li>`;
    form.hidden = false;
    form.querySelector('button[type="submit"]').focus();
  }

  function closeShift() {
    const form = part("shift");
    if (form) form.hidden = true;
  }

  // --- the title ----------------------------------------------------------------------
  //
  // The first town a window opens on starts with a title over a slow orbit
  // of the streets: drive, the evening rush, or another city. Any pedal,
  // arrow or click on the picture goes straight to driving, as before.
  function showTitle() {
    const node = part("title");
    if (!node || !game.car) return;
    game.titleSeen = true;
    game.title = { angle: game.car.heading + Math.PI * 0.75, last: 0 };
    node.hidden = false;
    setMessage("");
    const loop = (now) => {
      if (!game.title || game.phase !== "ready") return;
      const dt = game.title.last ? Math.min(0.1, (now - game.title.last) / 1000) : 0;
      game.title.last = now;
      if (!reducedMotion()) game.title.angle += dt * 0.11;
      if (windowIsVisible()) drawFrame(dt, true);
      game.title.raf = requestAnimationFrame(loop);
    };
    game.title.raf = requestAnimationFrame(loop);
    node.querySelector(".joyride-title-go")?.focus({ preventScroll: true });
  }

  function hideTitle() {
    if (!game.title) return;
    cancelAnimationFrame(game.title.raf);
    game.title = null;
    if (game.titlePose && !reducedMotion()) game.titleExit = { start: performance.now(), duration: 1100, from: game.titlePose };
    const node = part("title");
    if (node) node.hidden = true;
    game.view.ready = false;
  }

  // A card across the picture for a moment: a job taken, what and how long.
  function banner(title, line) {
    const node = part("banner");
    if (!node) return;
    node.querySelector("[data-joyride-banner-title]").textContent = title;
    node.querySelector("[data-joyride-banner-line]").textContent = line;
    node.hidden = false;
    node.classList.remove("is-showing");
    void node.offsetWidth;
    node.classList.add("is-showing");
    clearTimeout(game.bannerTimer);
    game.bannerTimer = setTimeout(() => { node.hidden = true; }, 2600);
  }

  // A line in the dashboard for a few seconds: a job taken, paid, lost.
  function say(key, ...args) {
    game.news = t(key, ...args);
    game.newsUntil = performance.now() + 4500;
    game.dashAt = 0;
  }

  function onStreetEvent(event) {
    game.eventLog.push({ ...event, at: game.traffic ? Math.round(game.traffic.seconds * 10) / 10 : 0 });
    if (game.eventLog.length > 300) game.eventLog.shift();
    const kind = (k) => t(`joyride_job_${k}`);
    if (event.type === "job-start") {
      say("joyride_news_job_start", kind(event.kind));
      const job = game.traffic?.job;
      banner(kind(event.kind), job ? t("joyride_banner_deadline", Math.max(0, Math.round(job.deadline - game.traffic.seconds))) : "");
    }
    else if (event.type === "checkpoint") {
      const job = game.traffic?.job;
      if (job?.vehicle && event.stage === job.vehicleFrom) say(`joyride_news_vehicle_${job.kind}`);
      else say("joyride_news_checkpoint", event.stage);
    }
    else if (event.type === "job-done") {
      say("joyride_news_job_done", kind(event.kind), event.pay, event.tip);
      writeCareer({ reputation: 1, jobs: 1, earned: event.pay + event.tip });
      chime(660, 0.18); chime(990, 0.22, 0.12);
    }
    else if (event.type === "job-failed") { say("joyride_news_job_failed", kind(event.kind)); writeCareer({ reputation: -1 }); chime(220, 0.3); }
    else if (event.type === "wanted") {
      // Say what it was for, when the street names it.
      const why = event.why && !["rode-away", "lost-them"].includes(event.why) ? t(`joyride_why_${event.why.replaceAll("-", "_")}`) : "";
      if (event.level > 0 && why && !why.startsWith("joyride_why_")) say("joyride_news_wanted_why", event.level, why);
      else say(event.level > 0 ? "joyride_news_wanted" : "joyride_news_wanted_clear", event.level);
    }
    else if (event.type === "rider-down") { if (!game.traffic?.events.some((other) => other.type === "wanted")) say("joyride_news_rider_down"); chime(300, 0.12); }
    else if (event.type === "busted") { say("joyride_news_busted", event.fine); chime(180, 0.4); }
    else if (event.type === "camera") {
      say("joyride_news_camera", event.fine);
      if (!reducedMotion()) {
        const stage = windowElement();
        if (stage) {
          stage.style.boxShadow = "inset 0 0 0 100vmax #fff";
          setTimeout(() => { stage.style.boxShadow = ""; }, 80);
        }
        chime(1800, 0.04);
      }
    }
    else if (event.type === "rode") {
      const to = game.traffic?.rail?.stations.find((station) => station.id === event.to);
      say(event.lost ? "joyride_news_rode_lost" : "joyride_news_rode", stationName(to), cityMinutes(event.wait + event.ride));
    }
  }

  const ARROWS = ["\u2191", "\u2197", "\u2192", "\u2198", "\u2193", "\u2199", "\u2190", "\u2196"];
  function clockText(seconds) {
    const h = Math.floor(seconds / 3600) % 24;
    const m = Math.floor(seconds / 60) % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // The dashboard: the hour on a shift, money, the wanted level, the job and
  // its direction, the station. Updated a few times a second.
  function syncDash() {
    const now = performance.now();
    if (now - game.dashAt < 200) return;
    game.dashAt = now;
    const traffic = game.traffic;
    const set = (name, text) => {
      const node = part(name);
      if (node && node.textContent !== text) node.textContent = text;
    };
    const date = game.handoff?.date;
    set("clock", traffic?.clock ? clockText(traffic.clock.seconds) : date && Number.isFinite(date.year) ? t("joyride_pot_date", date.year, date.month + 1, date.day) : "");
    set("money", traffic ? `${t("joyride_money", Math.round(traffic.money))} · ${t("joyride_reputation", traffic.reputation)}` : "");
    set("wanted", traffic && traffic.wanted > 0 ? "\u2605".repeat(traffic.wanted) + "\u2606".repeat(5 - traffic.wanted) : "");
    const damage = Math.round(game.car?.damage || 0);
    set("damage", damage >= 10 ? t("joyride_damage", damage) : "");
    let job = "";
    const stopped = traffic && game.car && Math.abs(game.car.speed) <= 3 * core().METRE / 3.6;
    const here = stopped ? street().stationHere(traffic, game.car) : null;
    if (game.news && now < game.newsUntil) job = game.news;
    else if (traffic?.job && game.car) {
      const bearing = street().jobBearing(traffic, game.car);
      const arrow = ARROWS[(Math.round(bearing.angle / (Math.PI / 4)) + 8) % 8];
      const stage = traffic.job.targets.length > 1 ? ` ${traffic.job.stage + 1}/${traffic.job.targets.length}` : "";
      job = t("joyride_job_line", t(`joyride_job_${traffic.job.kind}`) + stage, arrow, Math.round(bearing.metres), Math.ceil(bearing.left));
    } else if (here && (here.kind === "bus" || here.kind === "brt") && window.AISystem6JoyrideBus) {
      const board = window.AISystem6JoyrideBus.stopBoard(traffic.rail, here.id, traffic.seconds);
      const text = board.map((row) => {
        const name = row.name?.[uiLanguage()] || row.name?.zh || row.line;
        return row.arriving ? `${name} ${t("joyride_stop_arriving")}` : `${name} ${row.minutes ?? ""}${t("joyride_stop_min")}`;
      }).join(" · ");
      job = text ? t("joyride_stop_hud", stationName(here), text) : "";
    } else if (traffic?.phones.some((phone) => phone.ringingUntil > traffic.seconds)) job = t("joyride_phone_ringing");
    set("job", job);
    set("radio", game.station ? t(`joyride_radio_${game.station.replaceAll("-", "_")}`) : "");
  }

  // --- the radio (D5: synthesized stations first) --------------------------------------

  function cycleRadio() {
    const at = RADIO_STATIONS.indexOf(game.station);
    tuneRadio(RADIO_STATIONS[(at + 1) % RADIO_STATIONS.length]);
  }

  function tuneRadio(station) {
    game.station = RADIO_STATIONS.includes(station) ? station : null;
    ensureAudio();
    if (game.audio && !game.radio && window.AISystem6JoyrideRadio && game.station) {
      game.radio = window.AISystem6JoyrideRadio.createRadio(game.audio.context, game.audio.context.destination, { seed: game.traffic?.seed || 1 });
    }
    game.radio?.tune(game.prefs.sound ? game.station : null);
    syncMenuChecks();
    game.dashAt = 0;
    syncDash();
  }

  // A short synthesized tone: a job paid, a job lost.
  function chime(frequency, duration, delay = 0) {
    const audio = game.audio;
    if (!audio || !game.prefs.sound) return;
    const context = audio.context;
    const at = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "square";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, at);
    gain.gain.setTargetAtTime(0, at + duration * 0.6, duration / 4);
    osc.connect(gain).connect(context.destination);
    osc.start(at);
    osc.stop(at + duration);
  }

  // --- the picture ----------------------------------------------------------------------

  // The classic screens are a fixed 4:3 (or 3:2) frame. The character drive
  // fills whatever shape the stage has, so its lens keeps a fixed horizontal
  // view and opens vertically on a tall phone screen, looking a little
  // further down so the road ahead stays in the upper part of the frame.
  function lens(fov, pitchDown = 0) {
    const output = game.output;
    if (screenStyle() !== "glyph" || !output || !output.width) return { fov, drop: 0 };
    const aspect = output.width / output.height;
    const horizontal = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (4 / 3));
    const vertical = (2 * Math.atan(Math.tan(horizontal / 2) / aspect) * 180) / Math.PI;
    const portrait = Math.max(0, Math.min(1, (1 - aspect) / 0.6));
    return { fov: Math.max(36, Math.min(92, vertical)), drop: pitchDown * portrait };
  }

  function cameraPose(elapsed) {
    const pose = streetPose(elapsed);
    if (game.title) {
      // The title: the camera circles the town slowly, high over the car.
      const M = core().METRE;
      const car = game.car;
      const a = game.title.angle;
      const { fov } = lens(50);
      game.titlePose = { eye: [car.x + Math.cos(a) * 72 * M, car.y + 42 * M, car.z + Math.sin(a) * 72 * M], target: [car.x, car.y + 4 * M, car.z], fov };
      return game.titlePose;
    }
    if (game.titleExit) {
      // Leaving the title is one continuous move, not a cut: the lens glides
      // from the orbit down behind the car on an ease that settles without
      // overshoot, while the car already answers the pedals.
      const p = Math.min(1, (performance.now() - game.titleExit.start) / game.titleExit.duration);
      const e = 1 - Math.pow(1 - p, 4);
      const from = game.titleExit.from;
      if (p >= 1) game.titleExit = null;
      const mix = (a, b) => a.map((v, i) => v + (b[i] - v) * e);
      return { eye: mix(from.eye, pose.eye), target: mix(from.target, pose.target), fov: from.fov + (pose.fov - from.fov) * e };
    }
    const intro = game.intro;
    if (!intro) return pose;
    const M = core().METRE;
    const car = game.car;
    const p = Math.max(0, Math.min(1, (performance.now() - intro.start) / intro.duration));
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    // The mayor's view: high over the car, looking down at the block.
    const high = { eye: [car.x - Math.cos(car.heading) * 70 * M, car.y + 110 * M, car.z - Math.sin(car.heading) * 70 * M], target: [car.x, car.y, car.z], fov: 45 };
    const mix = (a, b) => a.map((v, i) => v + (b[i] - v) * e);
    return { eye: mix(high.eye, pose.eye), target: mix(high.target, pose.target), fov: high.fov + (pose.fov - high.fov) * e };
  }

  function streetPose(elapsed) {
    const car = game.car;
    const M = core().METRE;
    const view = game.view;
    // The picture eases over kerbs and swings after the car a little; the
    // physics underneath stays exact.
    if (!view.ready) {
      view.y = car.y;
      view.heading = car.heading;
      view.ready = true;
    }
    const ease = (rate) => 1 - Math.exp(-rate * (elapsed || core().DT));
    view.y += (car.y - view.y) * ease(14);
    let turn = car.heading - view.heading;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    view.heading += turn * ease(game.camera === "chase" ? 5 : 30);
    const fx = Math.cos(view.heading);
    const fz = Math.sin(view.heading);
    const x = car.x;
    const z = car.z;
    const y = view.y;
    if (game.camera === "cockpit") {
      const { fov, drop } = lens(64, 6);
      return { eye: [x + fx * 1.1 * M, y + 3.1 * M, z + fz * 1.1 * M], target: [x + fx * 30 * M, y + (2.2 - drop) * M, z + fz * 30 * M], fov };
    }
    if (game.camera === "overhead") {
      const { fov } = lens(55);
      return { eye: [x - fx * 8 * M, y + 48 * M, z - fz * 8 * M], target: [x + fx * 6 * M, y, z + fz * 6 * M], fov };
    }
    // Chase: behind and above, pulled in when a wall stands between the car
    // and the lens.
    let back = 13 * M;
    const up = 4.5 * M;
    for (let d = 2 * M; d <= back; d += M) {
      const cell = core().cellAt(game.world, x - fx * d, z - fz * d);
      if (cell < 0 || game.world.ground[cell] > y + up - 0.5 * M) {
        back = Math.max(3 * M, d - 1.5 * M);
        break;
      }
    }
    // Speed widens the lens a little and pulls the camera back; a knock
    // shakes it for a few frames.
    const pace = Math.min(1, Math.abs(car.speed) / core().CAR.topSpeed);
    view.pace = (view.pace || 0) + (pace - (view.pace || 0)) * ease(3);
    back *= 1 + 0.18 * view.pace;
    const shake = car.bumped > 0 && !reducedMotion() ? (car.bumped / 12) * 0.35 * M : 0;
    const jitter = shake ? Math.sin(car.tick * 2.7) * shake : 0;
    const { fov, drop } = lens(60 + 10 * view.pace, 3);
    return { eye: [x - fx * back - fz * jitter, y + up + jitter * 0.6, z - fz * back + fx * jitter], target: [x + fx * 8 * M, y + (1.8 - drop) * M, z + fz * 8 * M], fov };
  }

  // --- the radar ---------------------------------------------------------------------
  //
  // A small map in the picture's corner, turned so the car always points up:
  // the streets, railways and water of the town around it, the job's target
  // (pinned to the rim with a pointer when it is further off), police cars,
  // stations and ringing payphones. The town layer is drawn once per town;
  // a frame only turns it and adds the markers.
  const RADAR_PX_PER_TILE = 5;
  function radarTownLayer() {
    const snapshot = game.snapshot;
    if (!snapshot) return null;
    const key = `${game.town?.name}|${snapshot.rev}|${screenStyle()}|${game.traffic?.rail?.lines.length || 0}`;
    if (game.radarLayer && game.radarLayerKey === key) return game.radarLayer;
    const size = snapshot.size;
    const k = RADAR_PX_PER_TILE;
    const canvas = document.createElement("canvas");
    canvas.width = size * k;
    canvas.height = size * k;
    const ctx = canvas.getContext("2d");
    const glyph = screenStyle() === "glyph";
    const at = (layer, i) => Number(snapshot[layer]?.[i]) || 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = y * size + x;
        let fill = null;
        if (at("road", i) || at("onramp", i) || at("highway", i)) fill = glyph ? "#9ad7a0" : "#000";
        else if (at("rail", i)) fill = glyph ? "#5c8f66" : "#555";
        else if (at("water", i)) fill = glyph ? "#0d2a3a" : "#9db4c8";
        else if (at("zone", i)) fill = glyph ? "#13201a" : "#d8d4c8";
        if (!fill) continue;
        ctx.fillStyle = fill;
        if (at("rail", i) && !at("road", i)) ctx.fillRect(x * k + 1, y * k + 1, k - 2, k - 2);
        else ctx.fillRect(x * k, y * k, k, k);
      }
    }
    // Bus and BRT routes in their line colours, with their stops.
    const paintOf = ["#d33a2e", "#2e6ed1", "#e09e1f", "#2e9a54", "#8a4fcc", "#e0702e", "#2eb3bf"];
    // A BRT on an avenue is drawn down the median between its two halves.
    const seamRect = (tile, median, thick) => {
      const x = (tile % size + 0.5 + median[0]) * k, y = (Math.floor(tile / size) + 0.5 + median[1]) * k;
      return median[0] ? [x - thick / 2, y - k / 2, thick, k] : [x - k / 2, y - thick / 2, k, thick];
    };
    (game.traffic?.rail?.lines || []).forEach((line) => {
      if (line.kind !== "bus" && line.kind !== "brt") return;
      ctx.fillStyle = paintOf[Number.isInteger(line.color) ? line.color % 7 : 0];
      line.path.forEach((tile, index) => {
        const median = line.median?.[index];
        if (median) ctx.fillRect(...seamRect(tile, median, 3));
        else ctx.fillRect((tile % size) * k + 1, Math.floor(tile / size) * k + 1, k - 2, k - 2);
      });
    });
    (game.traffic?.rail?.stations || []).forEach((stop) => {
      if (stop.kind !== "bus" && stop.kind !== "brt") return;
      const line = game.traffic.rail.lines.find((candidate) => candidate.id === stop.line);
      const median = line?.median?.[stop.index];
      ctx.fillStyle = "#ffffff";
      if (median) ctx.fillRect(...seamRect(stop.y * size + stop.x, median, 4));
      else ctx.fillRect(stop.x * k + 1, stop.y * k + 1, k - 2, k - 2);
    });
    game.radarLayer = canvas;
    game.radarLayerKey = key;
    return canvas;
  }

  function drawRadar(now) {
    const canvas = part("radar");
    if (!canvas) return;
    const car = game.car;
    const show = Boolean(car && game.snapshot && game.camera !== "overhead");
    if (canvas.hidden === show) canvas.hidden = !show;
    if (!show || now - (game.radarAt || 0) < 50) return;
    game.radarAt = now;
    const layer = radarTownLayer();
    if (!layer) return;
    const glyph = screenStyle() === "glyph";
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height, r = w / 2 - 4, k = RADAR_PX_PER_TILE;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = glyph ? "#050806" : "#f4f1e8";
    ctx.fill();
    ctx.clip();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-car.heading - Math.PI / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layer, -car.x * k, -car.z * k);
    const traffic = game.traffic;
    const dot = (x, z, colour, size) => { ctx.fillStyle = colour; ctx.fillRect(x * k - size / 2, z * k - size / 2, size, size); };
    if (traffic) {
      traffic.rail?.stations.forEach((station) => {
        ctx.strokeStyle = glyph ? "#9ad7a0" : "#000";
        ctx.lineWidth = 1.5;
        ctx.strokeRect((station.x) * k - car.x * k + 0.5, (station.y) * k - car.z * k + 0.5, station.w * k - 1, station.h * k - 1);
      });
      traffic.phones.forEach((phone) => {
        if (phone.ringingUntil > traffic.seconds && Math.floor(now / 300) % 2 === 0) dot(phone.x - car.x, phone.z - car.z, glyph ? "#e8d27a" : "#c08000", 5);
      });
      traffic.cars.forEach((agent) => {
        if (agent.kind !== "police") return;
        const flash = Math.floor(now / 160) % 2 === 0;
        dot(agent.x - car.x, agent.z - car.z, flash ? "#d22" : "#24c", 5);
      });
    }
    ctx.restore();
    // The job's target: on the map, or on the rim pointing toward it.
    const bearing = traffic ? street().jobBearing(traffic, car) : null;
    if (bearing) {
      const metres = bearing.metres;
      const tiles = metres * core().METRE;
      const along = Math.min(tiles * k, r - 6);
      const tx = w / 2 + Math.sin(bearing.angle) * along;
      const ty = h / 2 - Math.cos(bearing.angle) * along;
      ctx.fillStyle = glyph ? "#ffd75e" : "#e0a000";
      ctx.strokeStyle = glyph ? "#000" : "#000";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (tiles * k > r - 6) {
        // A pointer on the rim.
        const a = bearing.angle;
        ctx.moveTo(tx + Math.sin(a) * 6, ty - Math.cos(a) * 6);
        ctx.lineTo(tx + Math.sin(a + 2.4) * 5, ty - Math.cos(a + 2.4) * 5);
        ctx.lineTo(tx + Math.sin(a - 2.4) * 5, ty - Math.cos(a - 2.4) * 5);
      } else {
        ctx.moveTo(tx, ty - 5); ctx.lineTo(tx + 5, ty); ctx.lineTo(tx, ty + 5); ctx.lineTo(tx - 5, ty);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // The car, pointing up (white with a dark edge, so it reads on a
    // black street), and the rim.
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = glyph ? "#9ad7a0" : "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2 - 7);
    ctx.lineTo(w / 2 + 5, h / 2 + 5);
    ctx.lineTo(w / 2, h / 2 + 2);
    ctx.lineTo(w / 2 - 5, h / 2 + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = glyph ? "#9ad7a0" : "#000";
    ctx.stroke();
    // A pale outer ring, so the rim reads on the black letterbox too.
    if (!glyph) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r + 1.75, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#f4f1e8";
      ctx.stroke();
    }
  }

  // --- damage -------------------------------------------------------------------------
  //
  // Spec §3.4: a battered car smokes from under the bonnet; at 100 the
  // engine dies (the core cuts the throttle), and a few seconds later a tow
  // truck takes it to the nearest place a drive can start, for a fee.
  const TOW_FEE = 80;
  function checkWreck(now) {
    const car = game.car;
    if (!car || (car.damage || 0) < 100) { game.towAt = 0; return; }
    if (!game.towAt) {
      game.towAt = now + 3500;
      say("joyride_news_wrecked");
      chime(140, 0.5);
      return;
    }
    if (now < game.towAt) return;
    game.towAt = 0;
    let best = 0, bestD = Infinity;
    game.spawns.forEach((spawn, i) => { const d = Math.hypot(spawn.x - car.x, spawn.z - car.z); if (d < bestD) { bestD = d; best = i; } });
    newDrive(best);
    if (game.traffic) game.traffic.money -= TOW_FEE;
    say("joyride_news_towed", TOW_FEE);
  }

  // Smoke as stacked puffs (the voxel catalogue's smoke models are made
  // for the city view's distance and vanish at street scale): from under a
  // battered car's bonnet, and over every block the city has burning near
  // the car. Each puff is a pure function of its index and the clock.
  function puffBlocks(x, y, z, count, rise, spread, phase, dark, glyph) {
    const M = core().METRE;
    const t = performance.now() / 1000;
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const life = (t * 0.5 + i / count + phase) % 1;
      const size = (0.5 + life * 1.4) * M * (rise > 10 * M ? 2.2 : 1);
      const grey = dark ? 0.12 + life * 0.2 : 0.3 + life * 0.4;
      out.push({
        x: x + (Math.sin(i * 2.1 + phase * 7) * 0.4 + life * 1.1) * spread,
        y: y + life * rise,
        z: z + (Math.cos(i * 1.7 + phase * 5) * 0.4 - life * 0.6) * spread,
        sx: size, sy: size, sz: size, r: grey, g: grey * 0.98, b: grey * 0.96, glow: glyph && dark,
      });
    }
    return out;
  }

  function smokeBlocks(car, glyph) {
    const M = core().METRE;
    const out = [];
    const damage = car.damage || 0;
    if (damage >= 55) {
      const c = Math.cos(car.heading), s = Math.sin(car.heading);
      const front = core().CAR.halfLength * 0.55;
      out.push(...puffBlocks(car.x + c * front, game.view.y + 1.9 * M, car.z + s * front, damage >= 100 ? 14 : damage >= 80 ? 10 : 6, 3.6 * M, 1.6 * M, 0, damage >= 100, glyph));
    }
    const snapshot = game.snapshot;
    if (snapshot?.blaze) {
      const size = snapshot.size;
      street().burningTiles(snapshot).forEach((tile, n) => {
        const x = (tile % size) + 0.5, z = Math.floor(tile / size) + 0.5;
        if (Math.abs(x - car.x) > 14 || Math.abs(z - car.z) > 14 || n > 40) return;
        const top = core().supportAt(game.world, x, z, 1e9);
        out.push(...puffBlocks(x, (Number.isFinite(top) ? top : 0) + 3 * M, z, 10, 26 * M, 3 * M, n * 0.37, true, glyph));
      });
    }
    return out;
  }

  // Flames on a burning block: a few flickering orange glows at its foot.
  function fireBlocks(car) {
    const snapshot = game.snapshot;
    if (!snapshot?.blaze) return [];
    const M = core().METRE;
    const size = snapshot.size;
    const t = performance.now() / 1000;
    const out = [];
    street().burningTiles(snapshot).forEach((tile, n) => {
      const x = (tile % size) + 0.5, z = Math.floor(tile / size) + 0.5;
      if (Math.abs(x - car.x) > 14 || Math.abs(z - car.z) > 14 || n > 40) return;
      const ground = core().supportAt(game.world, x, z, 1e9);
      const base = Number.isFinite(ground) ? ground : 0;
      for (let k = 0; k < 5; k += 1) {
        const flicker = 0.7 + 0.3 * Math.sin(t * 9 + k * 2.3 + n);
        const h = (2.5 + 3 * flicker) * M;
        out.push({ x: x + (k - 2) * 0.16, z: z + Math.sin(k * 1.9 + n) * 0.25, y: base + h / 2, sx: 1.6 * M, sy: h, sz: 1.6 * M, r: 1, g: 0.45 + 0.25 * flicker, b: 0.08, glow: true });
      }
    });
    return out;
  }

  // --- weather --------------------------------------------------------------------------
  //
  // Bonsai City decides the weather (its snapshot carries the day's type);
  // the street shows it. Rain and snow are a fixed set of drops around the
  // lens, each a pure function of its index and the clock, so nothing is
  // stored and nothing is random.
  function streetWeather() {
    const type = game.snapshot?.weather?.type;
    return typeof type === "string" ? type : "clear";
  }

  const RAIN_DROPS = 460;
  function weatherBlocks(eye, glyph) {
    const weather = streetWeather();
    const rain = weather === "rain";
    const snow = weather === "snow" || weather === "blizzard";
    if (!eye || (!rain && !snow)) return [];
    const M = core().METRE;
    const t = performance.now() / 1000;
    const span = 20 * M, high = 11 * M;
    const fall = rain ? 9 * M : weather === "blizzard" ? 2.6 * M : 1.1 * M;
    const wind = (Number(game.snapshot?.weather?.wind) || 8) * 0.02 * M;
    const count = weather === "blizzard" ? RAIN_DROPS * 1.4 : RAIN_DROPS;
    const out = [];
    const hash = (i, k) => {
      let h = Math.imul(i * 374761393 + k * 668265263, 1274126177) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0;
      return (h & 0xffff) / 65536;
    };
    const wrap = (v, m) => ((v % m) + m) % m;
    for (let i = 0; i < count; i += 1) {
      const sway = snow ? Math.sin(t * 1.3 + i) * 0.4 * M : 0;
      const x = eye[0] - span / 2 + wrap(hash(i, 1) * span + wind * t + sway, span);
      const z = eye[2] - span / 2 + wrap(hash(i, 2) * span + sway * 0.7, span);
      const y = eye[1] + high / 2 - wrap(hash(i, 3) * high + fall * t * (0.85 + 0.3 * hash(i, 4)), high);
      out.push(rain
        ? { x, y, z, sx: 0.035 * M, sy: 0.9 * M, sz: 0.035 * M, r: glyph ? 0.55 : 0.68, g: glyph ? 0.7 : 0.74, b: glyph ? 0.85 : 0.82 }
        : { x, y, z, sx: 0.09 * M, sy: 0.09 * M, sz: 0.09 * M, r: 0.95, g: 0.96, b: 0.98, glow: glyph });
    }
    return out;
  }

  // --- tyres and lamps ---------------------------------------------------------------

  const SKID_LIMIT = 900;
  // Rubber on the road where the tyres slide: two dark marks a frame under
  // the rear wheels, the newest SKID_LIMIT kept (several seconds of drift).
  function markSkids(input) {
    const M = core().METRE;
    const car = game.car;
    if (!car || !car.grounded) return;
    const sliding = Math.abs(car.slip || 0) > 1.6 * M;
    const locked = (input.handbrake || 0) > 0 && Math.abs(car.speed) > 4 * M;
    game.skidding = sliding || locked ? Math.min(1, Math.abs(car.slip || 0) / (6 * M) + (locked ? 0.4 : 0)) : 0;
    if (!game.skidding) return;
    const c = Math.cos(car.heading), s = Math.sin(car.heading);
    const back = -core().CAR.halfLength * 0.72, side = core().CAR.halfWidth * 0.78;
    for (const w of [-side, side]) {
      game.skids.push({
        x: car.x + c * back - s * w, z: car.z + s * back + c * w, y: car.y + 0.0025,
        sx: 0.32 * M, sy: 0.003, sz: 0.32 * M, r: 0.09, g: 0.09, b: 0.1,
      });
    }
    if (game.skids.length > SKID_LIMIT) game.skids.splice(0, game.skids.length - SKID_LIMIT);
  }

  // Brake lights (and tail lights after dark) as two small blocks at the
  // back of the car, lit red; reversing shows white.
  function carLamps(car, glyph) {
    const M = core().METRE;
    const input = game.input || {};
    const braking = (input.brake > 0 && car.speed > 0.5 * M) || input.handbrake > 0;
    const reversing = car.speed < -0.5 * M;
    const night = glyph || (game.traffic?.clock && street().timeOfDay(game.traffic.clock) > 0.8);
    if (!braking && !reversing && !night) return [];
    const c = Math.cos(car.heading), s = Math.sin(car.heading);
    const back = -(core().CAR.halfLength + 0.08 * M), side = core().CAR.halfWidth * 0.7;
    const colour = reversing ? [1, 0.98, 0.9] : braking ? [1, 0.1, 0.06] : [0.55, 0.05, 0.04];
    return [-side, side].map((w) => ({
      x: car.x + c * back - s * w, z: car.z + s * back + c * w, y: game.view.y + 1.05 * M,
      sx: 0.42 * M, sy: 0.3 * M, sz: 0.42 * M, r: colour[0], g: colour[1], b: colour[2], glow: braking || reversing || glyph,
    }));
  }

  // Smog where the city is polluted: the street fades out sooner. Clean
  // air sees the whole town; the worst smog closes in to about 80 m.
  function hazeFog(elapsed, glyph) {
    const area = areaAround();
    // From the overlay's second step (51 of 255) the air thickens, until
    // the street ends at about 80 m near the top of the scale.
    const target = area ? Math.max(0, Math.min(1, (area.smog - 0.2) / 0.6)) : 0;
    game.haze += (target - game.haze) * (1 - Math.exp(-2 * (elapsed || core().DT)));
    let far = 200 - (200 - 5) * Math.pow(game.haze, 0.6);
    // The city's own weather: fog closes the street in, rain and snow soften
    // the distance.
    const weather = streetWeather();
    // (In tiles, 16 m each: fog shuts the street in to about 100 m.)
    if (weather === "foggy") far = Math.min(far, 6);
    else if (weather === "blizzard") far = Math.min(far, 8);
    else if (weather === "rain" || weather === "snow") far = Math.min(far, 18);
    const grey = weather === "foggy" || weather === "rain" || weather === "snow" || weather === "blizzard";
    return { near: far * 0.15, far, color: glyph ? [0.03, 0.03, 0.035] : grey ? [0.72, 0.74, 0.76] : [0.66, 0.64, 0.58] };
  }

  // While driving the frame is read back without waiting on the GPU (it
  // lands a frame or two late); a single redraw -- paused, a new camera,
  // a new screen -- reads synchronously so the picture is the current one.
  function drawFrame(elapsed = 0, live = false) {
    const renderer = game.renderer;
    if (!renderer || !renderer.isReady() || !game.car) return;
    const car = game.car;
    const M = core().METRE;
    const pose = cameraPose(elapsed);
    const glyph = screenStyle() === "glyph";
    const fx = Math.cos(car.heading);
    const fz = Math.sin(car.heading);
    const traffic = game.traffic;
    renderer.render(glyph ? game.nightSnapshot : daySnapshot(), {
      street: {
        ...pose,
        objects: [
          { frame: playerVehicle(), x: car.x, y: game.view.y, z: car.z, yaw: car.heading, pitch: car.pitch, roll: car.roll },
          ...(traffic ? street().streetObjects(traffic, car) : []),
        ],
        blocks: [...(traffic ? street().streetBlocks(traffic, car, game.world) : []), ...game.skids, ...carLamps(car, glyph), ...fireBlocks(car), ...smokeBlocks(car, glyph), ...weatherBlocks(pose.eye, glyph)],
        // At night the car carries its own light down the road ahead.
        fog: hazeFog(elapsed, glyph),
        overcast: ["rain", "snow", "blizzard", "foggy", "overcast"].includes(streetWeather()),
        headlight: { from: [car.x + fx * 3 * M, game.view.y + 1.6 * M, car.z + fz * 3 * M], to: [car.x + fx * 30 * M, game.view.y, car.z + fz * 30 * M], intensity: 1.3 },
      },
    });
    // The character drive is already on the canvas; nothing comes back.
    if (glyph) return;
    const pixels = live && renderer.readPixelsAsync ? renderer.readPixelsAsync(game.pixels) : renderer.readPixels(game.pixels);
    if (!pixels) return;
    const { width, height } = game.image;
    core().convertFrame(screenDepth(), pixels, width, height, game.image.data, true);
    part("screen")?.getContext("2d").putImageData(game.image, 0, 0);
  }

  // --- sound ------------------------------------------------------------------------------
  //
  // An engine made the Bonsai City way: synthesized, never sampled. A square
  // wave through a low-pass, its pitch on the road speed, and a thump of
  // noise when the car hits something.

  function ensureAudio() {
    if (!game.prefs.sound || game.audio || typeof AudioContext !== "function") return;
    try {
      const context = new AudioContext({ sampleRate: 22050 });
      const osc = context.createOscillator();
      osc.type = "square";
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      const gain = context.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(context.destination);
      osc.start();
      // A second, sawtooth voice an octave down gives the engine body.
      const body = context.createOscillator();
      body.type = "sawtooth";
      const bodyGain = context.createGain();
      bodyGain.gain.value = 0.7;
      body.connect(bodyGain).connect(filter);
      body.start();
      // The police siren: two tones, swapped on the audio clock.
      const siren = context.createOscillator();
      siren.type = "square";
      const sirenFilter = context.createBiquadFilter();
      sirenFilter.type = "lowpass";
      sirenFilter.frequency.value = 1800;
      const sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      siren.connect(sirenFilter).connect(sirenGain).connect(context.destination);
      siren.start();
      // Tyre squeal: a looped fixed-pattern noise through a narrow band.
      const length = context.sampleRate;
      const noise = context.createBuffer(1, length, context.sampleRate);
      const data = noise.getChannelData(0);
      let seed = 0x6d2b79f5;
      for (let i = 0; i < length; i += 1) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        data[i] = (seed >>> 0) / 4294967296 * 2 - 1;
      }
      const squealSource = context.createBufferSource();
      squealSource.buffer = noise;
      squealSource.loop = true;
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1700;
      band.Q.value = 6;
      const squeal = context.createGain();
      squeal.gain.value = 0;
      squealSource.connect(band).connect(squeal).connect(context.destination);
      squealSource.start();
      // Rain on the roof: the same noise, low and soft.
      const hissSource = context.createBufferSource();
      hissSource.buffer = noise;
      hissSource.loop = true;
      hissSource.playbackRate.value = 0.7;
      const hissFilter = context.createBiquadFilter();
      hissFilter.type = "lowpass";
      hissFilter.frequency.value = 2400;
      const hiss = context.createGain();
      hiss.gain.value = 0;
      hissSource.connect(hissFilter).connect(hiss).connect(context.destination);
      hissSource.start();
      game.audio = { context, osc, body, filter, gain, squeal, band, siren, sirenGain, hiss, bumped: 0 };
    } catch {
      game.audio = null;
    }
  }

  function updateAudio(input) {
    const audio = game.audio;
    if (!audio) return;
    if (!game.prefs.sound) {
      silenceAudio();
      return;
    }
    if (audio.context.state === "suspended") audio.context.resume().catch(() => {});
    const now = audio.context.currentTime;
    game.radio?.pump(now);
    const M = core().METRE;
    // Five gears: the engine climbs through each band and drops back at the
    // change, so acceleration is heard as shifts, not one rising whine.
    const kmh = Math.abs(game.car.speed) / M * 3.6;
    const GEARS = [0, 22, 45, 70, 95, 125];
    let gear = 0;
    while (gear < GEARS.length - 2 && kmh >= GEARS[gear + 1]) gear += 1;
    const share = Math.max(0, Math.min(1, (kmh - GEARS[gear]) / (GEARS[gear + 1] - GEARS[gear])));
    const rpm = 0.18 + 0.82 * share * (gear === 0 ? 1 : 0.75) + (gear === 0 ? 0 : 0.25) + input.throttle * 0.06;
    const pitch = 34 + 96 * rpm;
    audio.osc.frequency.setTargetAtTime(pitch, now, 0.05);
    audio.body?.frequency.setTargetAtTime(pitch / 2, now, 0.05);
    audio.filter?.frequency.setTargetAtTime(520 + 900 * input.throttle + 300 * rpm, now, 0.08);
    audio.gain.gain.setTargetAtTime(0.022 + input.throttle * 0.028, now, 0.1);
    audio.hiss?.gain.setTargetAtTime(streetWeather() === "rain" ? 0.035 : streetWeather() === "blizzard" ? 0.02 : 0, now, 0.4);
    // A chasing police car is heard before it is seen.
    if (audio.siren) {
      const traffic = game.traffic;
      let near = Infinity;
      if (traffic && traffic.wanted > 0) traffic.cars.forEach((agent) => { if (agent.kind === "police") near = Math.min(near, Math.hypot(agent.x - game.car.x, agent.z - game.car.z)); });
      const loud = near < 14 ? (1 - near / 14) * 0.05 : 0;
      audio.sirenGain.gain.setTargetAtTime(loud, now, 0.15);
      audio.siren.frequency.setTargetAtTime(Math.floor(now / 0.45) % 2 ? 880 : 660, now, 0.01);
    }
    if (audio.squeal) {
      audio.squeal.gain.setTargetAtTime((game.skidding || 0) * 0.09, now, 0.05);
      audio.band.frequency.setTargetAtTime(1500 + Math.min(900, Math.abs(game.car.slip || 0) / M * 60), now, 0.1);
    }
    if (game.car.bumped === 12 && audio.bumped !== game.car.tick) {
      audio.bumped = game.car.tick;
      const length = Math.floor(audio.context.sampleRate * 0.12);
      const buffer = audio.context.createBuffer(1, length, audio.context.sampleRate);
      const data = buffer.getChannelData(0);
      // A fixed-pattern noise, not a random one: the thump sounds the same
      // every time, like a sampled one would.
      let seed = 0x2545f491;
      for (let i = 0; i < length; i += 1) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        data[i] = ((seed >>> 0) / 4294967296 * 2 - 1) * (1 - i / length);
      }
      const source = audio.context.createBufferSource();
      const thump = audio.context.createGain();
      thump.gain.value = 0.18;
      source.buffer = buffer;
      source.connect(thump).connect(audio.context.destination);
      source.start();
    }
  }

  function silenceAudio() {
    const audio = game.audio;
    if (!audio) return;
    audio.gain.gain.setTargetAtTime(0, audio.context.currentTime, 0.05);
    audio.squeal?.gain.setTargetAtTime(0, audio.context.currentTime, 0.05);
    audio.sirenGain?.gain.setTargetAtTime(0, audio.context.currentTime, 0.05);
    audio.hiss?.gain.setTargetAtTime(0, audio.context.currentTime, 0.05);
    if (audio.context.state === "running") audio.context.suspend().catch(() => {});
  }

  // --- menu bar, menus, camera ---------------------------------------------------------------

  // The 1996 box hid the menu bar while you drove. Pausing brings it back.
  function syncMenuBar() {
    const hide = game.phase === "driving" && game.prefs.hideMenuBar && windowIsVisible()
      && !document.body.classList.contains("mobile-app-foreground");
    document.body.classList.toggle("joyride-driving", hide);
  }

  function cycleCamera() {
    const next = CAMERAS[(CAMERAS.indexOf(game.camera) + 1) % CAMERAS.length];
    setCamera(next);
  }

  function setCamera(camera) {
    if (!CAMERAS.includes(camera)) return;
    game.camera = camera;
    game.view.ready = false;
    syncMenuChecks();
    if (game.phase !== "driving") drawFrame();
  }

  function syncMenuChecks() {
    document.querySelectorAll(".menu-popover button[data-joyride-camera], .menu-submenu-popover button[data-joyride-camera]").forEach((button) => {
      button.classList.toggle("is-checked", button.dataset.joyrideCamera === game.camera);
    });
    document.querySelectorAll(".menu-popover button[data-joyride-style]").forEach((button) => {
      button.classList.toggle("is-checked", button.dataset.joyrideStyle === screenStyle());
    });
    document.querySelectorAll(".menu-popover button[data-joyride-station]").forEach((button) => {
      button.classList.toggle("is-checked", button.dataset.joyrideStation === (game.station || "off"));
    });
    document.querySelectorAll('.menu-popover button[data-action="joyride-pause"]').forEach((button) => {
      button.textContent = t(game.phase === "driving" ? "joyride_pause" : "joyride_resume");
    });
  }

  // --- preferences dialog -----------------------------------------------------------------------

  function openPrefs() {
    const form = part("prefs");
    if (!form) return;
    if (game.phase === "driving") pauseDriving("");
    form.querySelector('[data-joyride-pref="depth"]').value = screenDepth();
    form.querySelector('[data-joyride-pref="style"]').value = screenStyle();
    form.querySelector('[data-joyride-pref="sound"]').checked = game.prefs.sound;
    form.querySelector('[data-joyride-pref="hideMenuBar"]').checked = game.prefs.hideMenuBar;
    form.hidden = false;
    form.querySelector("select")?.focus();
  }

  function closePrefs() {
    const form = part("prefs");
    if (form) form.hidden = true;
  }

  async function applyPrefs() {
    const form = part("prefs");
    const depth = form.querySelector('[data-joyride-pref="depth"]').value;
    const style = form.querySelector('[data-joyride-pref="style"]').value;
    game.prefs = {
      depth: ["mono", "256", "thousands"].includes(depth) ? depth : null,
      style: STYLES.includes(style) ? style : "classic",
      sound: form.querySelector('[data-joyride-pref="sound"]').checked,
      hideMenuBar: form.querySelector('[data-joyride-pref="hideMenuBar"]').checked,
    };
    writePrefs();
    closePrefs();
    if (!game.prefs.sound) silenceAudio();
    await refreshScreen();
    if (game.phase !== "failed") setMessage(game.phase === "ready" ? "joyride_status_ready" : "joyride_status_paused");
    part("stage")?.focus({ preventScroll: true });
  }

  // A new screen depth may change the resolution, which needs a renderer
  // the new size; the town, world and car stay.
  async function refreshScreen() {
    if (!game.snapshot) return;
    await mountRenderer();
    applyScreen();
    drawFrame();
  }

  // --- input wiring ------------------------------------------------------------------------------

  const KEYS = Object.freeze({
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    Space: "handbrake",
  });

  function wireWindow(win) {
    const stage = win.querySelector("[data-joyride-stage]");
    win.addEventListener("keydown", (event) => {
      if (event.target.closest("input, select, textarea, [contenteditable], .joyride-prefs")) return;
      // Return and Space press the title's buttons; every other key drives.
      if (event.target.closest(".joyride-title") && ["Enter", "NumpadEnter", "Space"].includes(event.code)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = KEYS[event.code];
      const handled = key || ["Escape", "KeyC", "KeyR", "KeyV", "KeyM", "KeyP", "Enter", "NumpadEnter"].includes(event.code);
      if (!handled) return;
      // The desk's own keys (icon arrows, type-to-select) stay out of it.
      event.preventDefault();
      event.stopPropagation();
      if (key) {
        if (game.phase === "ready" || game.phase === "paused") startDriving();
        game.keys.add(key);
      } else if (event.code === "Escape") {
        togglePause();
      } else if (event.code === "KeyC") {
        cycleCamera();
      } else if (event.code === "KeyV") {
        cycleScreen();
      } else if (event.code === "KeyM") {
        cycleRadio();
      } else if (event.code === "Enter" || event.code === "NumpadEnter") {
        openRide();
      } else if (event.code === "KeyP") {
        takePhoto();
      } else {
        newDrive();
        if (game.phase !== "driving") drawFrame();
      }
    });
    win.addEventListener("keyup", (event) => {
      const key = KEYS[event.code];
      if (key) game.keys.delete(key);
    });
    stage.addEventListener("blur", () => game.keys.clear());
    stage.addEventListener("click", () => {
      if (game.phase === "ready" || game.phase === "paused") startDriving();
    });
    win.querySelector("[data-joyride-shift]").addEventListener("submit", (event) => {
      event.preventDefault();
      startShift();
    });
    win.querySelector("[data-joyride-shift-close]").addEventListener("click", () => {
      closeShift();
      startTraffic(false);
      part("stage")?.focus({ preventScroll: true });
    });
    win.querySelector("[data-joyride-cities]").addEventListener("submit", (event) => {
      event.preventDefault();
      chooseCity();
    });
    win.querySelector("[data-joyride-cities-cancel]").addEventListener("click", () => {
      closeCities();
      part("stage")?.focus({ preventScroll: true });
    });
    win.querySelector("[data-joyride-letter-send]").addEventListener("click", () => sendLetter());
    // Return in the line sends the letter rather than the form (whose submit
    // is Another Shift).
    win.querySelector("[data-joyride-letter-words]").addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      sendLetter();
    });
    win.querySelectorAll("[data-joyride-title-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const action = button.dataset.joyrideTitleAction;
        if (action === "city") { hideTitle(); openCities(); }
        else if (action === "shift") { hideTitle(); startShift(); }
        else startDriving();
      });
    });
    win.querySelector("[data-joyride-ride]").addEventListener("submit", (event) => {
      event.preventDefault();
      rideTo(win.querySelector("[data-joyride-ride-choice]").value);
    });
    win.querySelector("[data-joyride-ride-cancel]").addEventListener("click", () => {
      closeRide();
      part("stage")?.focus({ preventScroll: true });
    });
    win.querySelector("[data-joyride-prefs]").addEventListener("submit", (event) => {
      event.preventDefault();
      applyPrefs();
    });
    win.querySelectorAll("[data-joyride-action]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.joyrideAction === "camera") cycleCamera();
        else if (button.dataset.joyrideAction === "screen") cycleScreen();
        else if (button.dataset.joyrideAction === "radio") cycleRadio();
        else if (button.dataset.joyrideAction === "ride") openRide();
        else togglePause();
      });
    });
    // The character drive fills the stage, so it follows the stage's size:
    // a window resized, a phone turned.
    if (typeof ResizeObserver === "function") {
      let pending = 0;
      new ResizeObserver(() => {
        if (pending || screenStyle() !== "glyph") return;
        pending = requestAnimationFrame(() => {
          pending = 0;
          applyScreen();
          if (game.phase !== "driving") drawFrame();
        });
      }).observe(stage);
    }
    wirePedals(win);
    wireWheel(win.querySelector("[data-joyride-wheel]"));
    // Touch controls appear for a coarse pointer, or the first time a finger
    // touches the window.
    const controls = win.querySelector("[data-joyride-controls]");
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    controls.hidden = !coarse;
    win.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") controls.hidden = false;
    }, { passive: true });
  }

  // Keep a finger's later moves on the control it pressed. Capture fails
  // when the pointer is already gone (a very quick tap, a cancelled touch);
  // the press itself still counts.
  function capturePointer(element, event) {
    try {
      if (event.pointerId !== undefined) element.setPointerCapture?.(event.pointerId);
    } catch {
      // Nothing to hold; the control works without capture.
    }
  }

  function wirePedals(win) {
    win.querySelectorAll("[data-joyride-pedal]").forEach((pedal) => {
      const which = pedal.dataset.joyridePedal;
      const press = (value) => (event) => {
        event.preventDefault();
        if (value) capturePointer(pedal, event);
        if (value && (game.phase === "ready" || game.phase === "paused")) startDriving();
        game.touch[which] = value;
        pedal.classList.toggle("is-pressed", Boolean(value));
      };
      pedal.addEventListener("pointerdown", press(1));
      pedal.addEventListener("pointerup", press(0));
      pedal.addEventListener("pointercancel", press(0));
      pedal.addEventListener("contextmenu", (event) => event.preventDefault());
    });
  }

  // The wheel turns with the finger around its centre: half a turn either
  // way is full lock, and letting go lets it spring back.
  function wireWheel(wheel) {
    let grip = null;
    const angleOf = (event) => {
      const rect = wheel.getBoundingClientRect();
      return Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2));
    };
    const show = (steer) => {
      game.touch.steer = steer;
      wheel.style.setProperty("--joyride-wheel-turn", `${steer * 150}deg`);
      wheel.setAttribute("aria-valuenow", steer.toFixed(2));
    };
    wheel.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      capturePointer(wheel, event);
      grip = { start: angleOf(event), from: game.touch.steer };
      if (game.phase === "ready" || game.phase === "paused") startDriving();
    });
    wheel.addEventListener("pointermove", (event) => {
      if (!grip) return;
      let turn = angleOf(event) - grip.start;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      show(Math.max(-1, Math.min(1, grip.from + turn / (Math.PI * 0.83))));
    });
    const release = () => {
      grip = null;
      show(0);
    };
    wheel.addEventListener("pointerup", release);
    wheel.addEventListener("pointercancel", release);
  }

  // --- application glue -----------------------------------------------------------------------------

  function attachJoyride() {
    installJoyrideWindow();
    syncStatus();
    syncMenuChecks();
    if (game.phase === "idle" || game.phase === "failed") ensureGame();
    else if (game.phase === "paused" || game.phase === "ready") {
      setMessage(game.phase === "ready" ? "joyride_status_ready" : "joyride_status_paused");
      refreshScreen();
    }
  }

  installJoyrideWindow();

  document.addEventListener("ai-system6-themechange", () => {
    if (!game.prefs.depth && game.snapshot) refreshScreen();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseDriving();
  });
  // Closing, collapsing or hiding the window stops the car and gives the
  // menu bar back.
  new MutationObserver(() => {
    if (!windowIsVisible()) pauseDriving();
    syncMenuBar();
  }).observe(windowElement(), { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("click", (event) => {
    if (event.target.closest?.(".menu-bar")) syncMenuChecks();
  }, true);

  window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.("joyride", {
    onSuspend: () => pauseDriving(),
  });

  const item = (action, labelKey, extra = {}) => ({ type: "item", action, labelKey, conditionId: action, ...extra });
  window.AISystem6RegisterApplicationMenuSet?.("joyride", [
    {
      id: "file",
      labelKey: "menu_file",
      items: [
        item("joyride-open-city", "joyride_open_city", { shortcutId: "open" }),
        item("joyride-new-drive", "joyride_new_drive", { shortcutId: "new-document" }),
        item("joyride-start-shift", "joyride_start_shift"),
        item("joyride-high-scores", "joyride_high_scores"),
        { type: "separator" },
        item("joyride-take-photo", "joyride_take_photo"),
        // The album the photos go to (the desk's own Picture Album window).
        { type: "item", action: "open-image-manager", labelKey: "joyride_open_album", conditionId: "open-image-manager" },
        { type: "separator" },
        { type: "item", action: "close-active-window", labelKey: "close", shortcutId: "close-window", conditionId: "close-active-window" },
      ],
    },
    {
      id: "drive",
      labelKey: "joyride_menu_drive",
      items: [
        item("joyride-pause", "joyride_pause"),
        item("joyride-ride-train", "joyride_ride_train"),
        { type: "separator" },
        ...CAMERAS.map((camera) => item(`joyride-camera-${camera}`, `joyride_camera_${camera}`, { dataset: { joyrideCamera: camera } })),
        { type: "separator" },
        ...STYLES.map((style) => item(`joyride-style-${style}`, `joyride_style_${style}`, { dataset: { joyrideStyle: style } })),
        item("joyride-next-screen", "joyride_next_screen"),
        { type: "separator" },
        ...RADIO_STATIONS.map((station) => item(`joyride-radio-${station || "off"}`, station ? `joyride_radio_${station.replaceAll("-", "_")}` : "joyride_radio_off", { dataset: { joyrideStation: station || "off" } })),
        { type: "separator" },
        item("joyride-preferences", "joyride_preferences"),
      ],
    },
  ]);

  // Menu rows that act on the drive must have the Joyride window in front.
  // Without a host they used to stay black and no-op — census dead that looked
  // like a clickable primary. Open stays available so the writer can summon it.
  const hostReady = () => {
    const active = document.querySelector(".window.is-active");
    return active?.dataset.window === WINDOW_NAME && Boolean(windowElement());
  };
  const ready = () => hostReady() && Boolean(game.car);
  const joyrideUnavailableReason = () => (
    hostReady() ? "balloon_disabled_menu_context" : "balloon_disabled_menu_host_window"
  );
  const joyrideCommand = (handler, isAvailable) => ({
    handler,
    isAvailable,
    unavailableReason: joyrideUnavailableReason,
  });
  const commands = {
    "open-joyride": { handler: () => openWindow(WINDOW_NAME), isAvailable: () => true },
    "joyride-new-drive": joyrideCommand(() => { newDrive(); if (game.phase !== "driving") drawFrame(); }, ready),
    "joyride-pause": joyrideCommand(togglePause, ready),
    "joyride-preferences": joyrideCommand(openPrefs, hostReady),
    "joyride-open-city": joyrideCommand(openCities, () => hostReady() && game.phase !== "loading"),
  };
  CAMERAS.forEach((camera) => {
    commands[`joyride-camera-${camera}`] = joyrideCommand(() => setCamera(camera), hostReady);
  });
  STYLES.forEach((style) => {
    commands[`joyride-style-${style}`] = joyrideCommand(() => setStyle(style), ready);
  });
  commands["joyride-next-screen"] = joyrideCommand(cycleScreen, ready);
  commands["joyride-start-shift"] = joyrideCommand(startShift, ready);
  commands["joyride-take-photo"] = joyrideCommand(takePhoto, ready);
  commands["joyride-ride-train"] = joyrideCommand(
    openRide,
    () => hostReady() && Boolean(game.traffic && game.car && street().stationHere(game.traffic, game.car))
  );
  commands["joyride-high-scores"] = joyrideCommand(
    () => showScores(t("joyride_high_scores_title"), game.town?.name || "", readScores().filter((item) => scoreCity(item) === cityKey()).sort((a, b) => b.score - a.score).slice(0, 10)),
    hostReady
  );
  RADIO_STATIONS.forEach((station) => {
    commands[`joyride-radio-${station || "off"}`] = joyrideCommand(() => tuneRadio(station), hostReady);
  });

  window.AISystem6Joyride = Object.freeze({
    attach: attachJoyride,
    // Bonsai City's "Drive Its Streets": a read-only snapshot of the city,
    // its name, and the tile the player was looking at.
    queueCity,
    // For instruments: the state a screenshot or a replay needs, read-only.
    debugState: () => ({
      phase: game.phase,
      camera: game.camera,
      depth: screenDepth(),
      style: screenStyle(),
      town: game.town ? { ...game.town } : null,
      area: game.areaText,
      haze: game.haze,
      intro: Boolean(game.intro),
      shift: game.shift,
      station: game.station,
      railStation: game.stationHint,
      photos: game.photos,
      skids: game.skids.length,
      skidding: game.skidding || 0,
      street: game.traffic ? {
        cars: game.traffic.cars.length,
        police: game.traffic.cars.filter((agent) => agent.kind === "police").length,
        pedestrians: game.traffic.pedestrians.length,
        phones: game.traffic.phones.map((phone) => ({ x: phone.x, z: phone.z, ringing: phone.ringingUntil > game.traffic.seconds })),
        job: game.traffic.job ? { kind: game.traffic.job.kind, stage: game.traffic.job.stage, targets: [...game.traffic.job.targets], deadline: game.traffic.job.deadline, minKmh: game.traffic.job.minKmh || 0, stop: game.traffic.job.stop } : null,
        money: game.traffic.money, jobsDone: game.traffic.jobsDone, reputation: game.traffic.reputation,
        wanted: game.traffic.wanted, busted: game.traffic.bustedCount, seconds: game.traffic.seconds,
        clock: game.traffic.clock ? game.traffic.clock.seconds : null,
        signals: game.traffic.signals.size,
      } : null,
      dash: [...(windowElement()?.querySelectorAll("[data-joyride-dash] span") || [])].map((node) => node.textContent).filter(Boolean),
      output: game.output ? { ...game.output } : null,
      size: game.rendererSize,
      car: game.car ? { ...game.car } : null,
      clear: game.car && game.world ? core().carIsClear(game.world, game.car) : null,
      world: game.world ? { side: game.world.side, step: game.world.step, carHeight: game.world.carHeight, ramps: game.ramps ? game.ramps.length : 0 } : null,
    }),
    // The car's footprint against the world a little ahead of it.
    footprint: (ahead = 0.3) => {
      const car = game.car;
      if (!car || !game.world) return null;
      const M = core().METRE;
      return core().footprintReport(game.world, car, car.x + Math.cos(car.heading) * ahead * M, car.z + Math.sin(car.heading) * ahead * M);
    },
    // For instruments (drive checks): the live street, read only, and the
    // street's recent events.
    streetState: () => game.traffic,
    // The live car, for instruments that stage a state (damage, a spot).
    liveCar: () => game.car,
    streetEvents: () => game.eventLog.slice(),
    // One metre column of the collision world, for instruments.
    column: (x, z) => {
      const world = game.world;
      const cell = world ? core().cellAt(world, x, z) : -1;
      if (cell < 0) return null;
      return { ground: world.ground[cell], groundBottom: world.groundBottom[cell], deckBottom: world.deckBottom[cell], deckTop: world.deckTop[cell], water: world.water[cell] };
    },
  });
  window.AISystem6Runtime?.registerApplication({ id: "joyride", windowName: WINDOW_NAME, mount: attachJoyride, restore: attachJoyride, commands });
})();
