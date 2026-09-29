// Feature module: Joyride / 兜风 — the third original game.
//
// Drive a car through a Bonsai City town at street level, drawn the way a
// 1996 Macintosh would: the city's own voxel models through a perspective
// camera, rendered small (640 x 480, or the compact Mac's 512 x 342 in black
// and white), quantized to the 8-bit system palette or Atkinson-dithered to
// one bit, and scaled up with nearest pixels.
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
  const core = () => window.AISystem6JoyrideCore;

  const game = {
    prefs: readPrefs(),
    camera: "chase",
    phase: "idle", // idle | loading | ready | driving | paused | failed
    message: "",
    renderer: null,
    rendererSize: "",
    snapshot: null,
    world: null,
    spawns: [],
    car: null,
    paint: 1,
    view: { y: 0, heading: 0, ready: false },
    keys: new Set(),
    touch: { gas: 0, brake: 0, steer: 0 },
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
    const defaults = { depth: null, sound: true, hideMenuBar: true };
    try {
      const stored = JSON.parse(window.localStorage?.getItem(PREFS_KEY) || "null");
      if (!stored || typeof stored !== "object") return defaults;
      return {
        depth: ["mono", "256", "thousands"].includes(stored.depth) ? stored.depth : null,
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

  // --- the window --------------------------------------------------------------

  const WHEEL = `<svg class="joyride-wheel-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="34"/>
    <path d="M16 50h22M62 50h22M50 62v22"/><circle cx="50" cy="50" r="12"/>
  </svg>`;

  function installJoyrideWindow() {
    if (typeof document === "undefined") return null;
    const existing = document.querySelector('[data-window="joyride"]');
    if (existing) return existing;
    const win = window.AISystem6ApplicationShell.createWindow({
      windowName: WINDOW_NAME,
      windowClass: "joyride-window",
      labelledBy: "joyride-title",
      titleKey: "joyride_title",
      title: t("joyride_title"),
      statusClass: "joyride-status",
      statusHtml: `<span class="joyride-status-city" data-joyride-city></span><span class="joyride-status-speed" data-joyride-speed></span>`,
      paneClass: "joyride-pane",
      paneHtml: `
        <div class="joyride-stage" data-joyride-stage tabindex="0" aria-describedby="joyride-message">
          <canvas class="joyride-screen" data-joyride-screen width="640" height="480"></canvas>
          <p class="joyride-message" id="joyride-message" data-joyride-message role="status"></p>
          <div class="joyride-gl" data-joyride-gl hidden></div>
        </div>
        <div class="joyride-controls" data-joyride-controls hidden>
          <div class="joyride-wheel" data-joyride-wheel role="slider" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0" data-i18n-aria-label="joyride_touch_wheel" aria-label="${escapeHtml(t("joyride_touch_wheel"))}">${WHEEL}</div>
          <div class="joyride-buttons">
            <button type="button" class="btn" data-joyride-action="camera" data-i18n="joyride_touch_camera">${escapeHtml(t("joyride_touch_camera"))}</button>
            <button type="button" class="btn" data-joyride-action="pause" data-i18n="joyride_touch_pause">${escapeHtml(t("joyride_touch_pause"))}</button>
          </div>
          <div class="joyride-pedals">
            <button type="button" class="joyride-pedal" data-joyride-pedal="brake" data-i18n="joyride_touch_brake">${escapeHtml(t("joyride_touch_brake"))}</button>
            <button type="button" class="joyride-pedal joyride-pedal-gas" data-joyride-pedal="gas" data-i18n="joyride_touch_gas">${escapeHtml(t("joyride_touch_gas"))}</button>
          </div>
        </div>
        <form class="joyride-prefs" data-joyride-prefs role="dialog" aria-modal="true" aria-labelledby="joyride-prefs-title" hidden>
          <h3 id="joyride-prefs-title" data-i18n="joyride_prefs_title">${escapeHtml(t("joyride_prefs_title"))}</h3>
          <label class="field-row"><span data-i18n="joyride_pref_depth">${escapeHtml(t("joyride_pref_depth"))}</span><span class="select-wrap"><select data-joyride-pref="depth">
            <option value="mono" data-i18n="joyride_depth_mono">${escapeHtml(t("joyride_depth_mono"))}</option>
            <option value="256" data-i18n="joyride_depth_256">${escapeHtml(t("joyride_depth_256"))}</option>
            <option value="thousands" data-i18n="joyride_depth_thousands">${escapeHtml(t("joyride_depth_thousands"))}</option>
          </select></span></label>
          <label class="field-row"><input type="checkbox" data-joyride-pref="sound"><span data-i18n="joyride_pref_sound">${escapeHtml(t("joyride_pref_sound"))}</span></label>
          <label class="field-row"><input type="checkbox" data-joyride-pref="hideMenuBar"><span data-i18n="joyride_pref_hide_menu">${escapeHtml(t("joyride_pref_hide_menu"))}</span></label>
          <p class="joyride-prefs-keys" data-i18n="joyride_pref_keys">${escapeHtml(t("joyride_pref_keys"))}</p>
          <div class="button-row"><button type="submit" class="btn" data-i18n="ok">${escapeHtml(t("ok"))}</button></div>
        </form>`,
    });
    wireWindow(win);
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

  function setMessage(key) {
    game.message = key || "";
    const node = part("message");
    if (!node) return;
    node.textContent = key ? t(key) : "";
    node.hidden = !key;
  }

  function syncStatus() {
    const city = part("city");
    if (city) city.textContent = game.snapshot ? t("joyride_city_demo") : "";
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

  function ensureGame() {
    if (game.loadPromise) return game.loadPromise;
    game.phase = "loading";
    setMessage("joyride_status_loading");
    game.loadPromise = (async () => {
      // Two frames so the message paints before the replay holds the thread.
      await nextFrame();
      await nextFrame();
      const sim = window.AISystem6BonsaiSim;
      const city = core().buildDemoCity(sim);
      // The town is shown at midday whatever tick the replay ended on; the
      // hour belongs to the view, not to the city.
      game.snapshot = { ...sim.buildRenderSnapshot(city), timeOfDay: 0.42 };
      await mountRenderer();
      buildWorld();
      game.spawns = core().spawnPoints(game.world);
      newDrive();
      game.phase = "ready";
      setMessage("joyride_status_ready");
      syncStatus();
      drawFrame();
    })().catch((error) => {
      game.phase = "failed";
      game.loadPromise = null;
      const webgl = error && error.code === window.AISystem6BonsaiVoxelRenderer?.WEBGL_UNAVAILABLE_CODE;
      setMessage(webgl ? "joyride_status_no_webgl" : "joyride_status_failed");
      console.warn("Joyride could not start.", error);
    });
    return game.loadPromise;
  }

  async function mountRenderer() {
    const depth = screenDepth();
    const [width, height] = core().RESOLUTIONS[depth];
    const key = `${width}x${height}`;
    if (game.renderer && game.rendererSize === key) return;
    game.renderer?.dispose();
    const host = part("gl");
    game.renderer = window.AISystem6BonsaiVoxelRendererFactory();
    await game.renderer.mount(host, { street: { width, height } });
    game.rendererSize = key;
    const screen = part("screen");
    screen.width = width;
    screen.height = height;
    game.pixels = new Uint8Array(width * height * 4);
    game.image = screen.getContext("2d").createImageData(width, height);
    screen.dataset.depth = depth;
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
    game.world = world;
  }

  // The shell owns the seed (the core never draws one): a new drive picks a
  // spawn and a paint from it.
  function newDrive() {
    if (!game.world || !game.spawns.length) return;
    const seed = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] : 1;
    const random = core().mulberry32(seed);
    const spawn = game.spawns[Math.floor(random() * game.spawns.length)];
    game.paint = 1 + Math.floor(random() * 4);
    game.car = core().createCar(spawn);
    game.view.ready = false;
    game.carry = 0;
  }

  // --- driving ------------------------------------------------------------------------

  function startDriving() {
    if (!game.car || game.phase === "loading" || game.phase === "failed") return;
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
    const pad = readGamepad();
    if (pad) {
      throttle = Math.max(throttle, pad.throttle);
      brake = Math.max(brake, pad.brake);
      if (Math.abs(pad.steer) > Math.abs(steer)) steer = pad.steer;
    }
    return { throttle, brake, steer };
  }

  // Gamepad API, standard mapping: left stick steers, right trigger (or A)
  // drives, left trigger (or B/X) brakes, Y changes camera, Start pauses.
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
      brake: Math.max(button(6), button(1), button(2)),
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
    let steps = 0;
    while (game.carry >= core().DT && steps < 15) {
      core().stepCar(game.car, input, game.world);
      game.carry -= core().DT;
      steps += 1;
    }
    if (steps === 15) game.carry = 0;
    drawFrame(elapsed);
    updateAudio(input);
    syncStatus();
    game.raf = requestAnimationFrame(tick);
  }

  // --- the picture ----------------------------------------------------------------------

  function cameraPose(elapsed) {
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
      return { eye: [x + fx * 1.1 * M, y + 3.1 * M, z + fz * 1.1 * M], target: [x + fx * 30 * M, y + 2.2 * M, z + fz * 30 * M], fov: 64 };
    }
    if (game.camera === "overhead") {
      return { eye: [x - fx * 8 * M, y + 48 * M, z - fz * 8 * M], target: [x + fx * 6 * M, y, z + fz * 6 * M], fov: 55 };
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
    return { eye: [x - fx * back, y + up, z - fz * back], target: [x + fx * 8 * M, y + 1.8 * M, z + fz * 8 * M], fov: 60 };
  }

  function drawFrame(elapsed = 0) {
    const renderer = game.renderer;
    if (!renderer || !renderer.isReady() || !game.car) return;
    const car = game.car;
    const pose = cameraPose(elapsed);
    renderer.render(game.snapshot, {
      street: {
        ...pose,
        objects: [{ frame: `agent.car.${game.paint}`, x: car.x, y: game.view.y, z: car.z, yaw: car.heading, pitch: car.pitch, roll: car.roll }],
      },
    });
    const pixels = renderer.readPixels(game.pixels);
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
      game.audio = { context, osc, gain, bumped: 0 };
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
    const speed = Math.abs(game.car.speed) / core().METRE;
    audio.osc.frequency.setTargetAtTime(38 + speed * 3.2 + input.throttle * 12, now, 0.08);
    audio.gain.gain.setTargetAtTime(0.025 + input.throttle * 0.03, now, 0.1);
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
    game.prefs = {
      depth: ["mono", "256", "thousands"].includes(depth) ? depth : null,
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
    drawFrame();
  }

  // --- input wiring ------------------------------------------------------------------------------

  const KEYS = Object.freeze({
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  });

  function wireWindow(win) {
    const stage = win.querySelector("[data-joyride-stage]");
    win.addEventListener("keydown", (event) => {
      if (event.target.closest("input, select, textarea, [contenteditable], .joyride-prefs")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = KEYS[event.code];
      const handled = key || ["Escape", "KeyC", "KeyR"].includes(event.code);
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
    win.querySelector("[data-joyride-prefs]").addEventListener("submit", (event) => {
      event.preventDefault();
      applyPrefs();
    });
    win.querySelectorAll("[data-joyride-action]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.joyrideAction === "camera") cycleCamera();
        else togglePause();
      });
    });
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

  function wirePedals(win) {
    win.querySelectorAll("[data-joyride-pedal]").forEach((pedal) => {
      const which = pedal.dataset.joyridePedal;
      const press = (value) => (event) => {
        event.preventDefault();
        if (value && pedal.setPointerCapture && event.pointerId !== undefined) pedal.setPointerCapture(event.pointerId);
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
      wheel.setPointerCapture?.(event.pointerId);
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
        item("joyride-new-drive", "joyride_new_drive", { shortcutId: "new-document" }),
        { type: "separator" },
        { type: "item", action: "close-active-window", labelKey: "close", shortcutId: "close-window", conditionId: "close-active-window" },
      ],
    },
    {
      id: "drive",
      labelKey: "joyride_menu_drive",
      items: [
        item("joyride-pause", "joyride_pause"),
        { type: "separator" },
        ...CAMERAS.map((camera) => item(`joyride-camera-${camera}`, `joyride_camera_${camera}`, { dataset: { joyrideCamera: camera } })),
        { type: "separator" },
        item("joyride-preferences", "joyride_preferences"),
      ],
    },
  ]);

  const ready = () => Boolean(game.car);
  const commands = {
    "open-joyride": { handler: () => openWindow(WINDOW_NAME), isAvailable: () => true },
    "joyride-new-drive": { handler: () => { newDrive(); if (game.phase !== "driving") drawFrame(); }, isAvailable: ready },
    "joyride-pause": { handler: togglePause, isAvailable: ready },
    "joyride-preferences": { handler: openPrefs, isAvailable: () => Boolean(windowElement()) },
  };
  CAMERAS.forEach((camera) => {
    commands[`joyride-camera-${camera}`] = { handler: () => setCamera(camera), isAvailable: () => true };
  });

  window.AISystem6Joyride = Object.freeze({
    attach: attachJoyride,
    // For instruments: the state a screenshot or a replay needs, read-only.
    debugState: () => ({
      phase: game.phase,
      camera: game.camera,
      depth: screenDepth(),
      size: game.rendererSize,
      car: game.car ? { ...game.car } : null,
      clear: game.car && game.world ? core().carIsClear(game.world, game.car) : null,
      world: game.world ? { side: game.world.side, step: game.world.step, carHeight: game.world.carHeight } : null,
    }),
    // The car's footprint against the world a little ahead of it.
    footprint: (ahead = 0.3) => {
      const car = game.car;
      if (!car || !game.world) return null;
      const M = core().METRE;
      return core().footprintReport(game.world, car, car.x + Math.cos(car.heading) * ahead * M, car.z + Math.sin(car.heading) * ahead * M);
    },
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
