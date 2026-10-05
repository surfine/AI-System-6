// Feature module: Rootline / 根线 — the second original game.
//
// The shell: the window, its bars and overlays, the menus, the sound and the
// pace. The rules live in rootline-core.js (headless, deterministic); the map
// and the gestures in rootline-view.js (reads the state, issues commands).
// This file owns the seed, the clock that drives the core, and everything the
// player reads around the map.
//
// It opens a city two ways: one grown from a seed (the nursery bed's number,
// kept in a tooltip), or a Bonsai City pot handed over to it (queuePot, or
// File > Open Bonsai City…, which only reads the saves). A pot opens on the
// planning table with the cartographic transition, and its clock waits for
// the first line. Lines are laid as metro, BRT or bus (the picker in the
// bottom bar, or the M key; 1, 2 and 3 stay the speeds).
//
// Spec: internal/plans/TRANSIT-GAME-SPEC.zh-CN.md (§2, §5, §6, §8b);
// internal/plans/BASIN-WORLD.zh-CN.md (lane L3).
window.AISystem6RootlineLoaded = true;

(function initRootlineFeature() {
  "use strict";

  const core = window.AISystem6RootlineCore;
  const View = window.AISystem6RootlineView;
  const World = window.AISystem6PotWorld;
  const Pot = window.AISystem6RootlinePot;
  const BEST_KEY = "ais6.rootline.best";
  const PREFS_KEY = "ais6.rootline.prefs";
  const STEP = 1 / core.RULES.ticksPerSecond;
  const BUSY = new Set(["reading", "working", "waiting"]);
  // Every game offers all three. A pot opens with them; a seeded game starts
  // metro-only (its hash and weekly choices are the ones always recorded)
  // and switches them on with its first bus or BRT line.
  const ALL_MODES = Object.freeze(["metro", "brt", "bus"]);

  const state = {
    game: null,
    view: null,
    seed: "",
    mode: "classic",
    speed: 1,
    screen: "start",
    pause: { user: false, hidden: false, assistant: false },
    raf: 0,
    last: 0,
    acc: 0,
    hudAt: 0,
    eventTick: 0,
    sound: true,
    audio: null,
    lastPluck: 0,
    card: 0,
    crowdWarned: new Set(),
    toastTimer: 0,
    hint: "",
    hintUntil: 0,
    built: false,
    observer: null,
    resizeObserver: null,
    // How the next drawn line is laid: "metro", "brt" or "bus".
    drawMode: "metro",
    // The pot on the table ({ desc, cityId, name, seed }), or null for a
    // city grown from a seed; and a nursery's own name, when it has one.
    pot: null,
    nurseryName: null,
    // The transit modes a seeded city opens with: metro alone (the old
    // game) unless the start panel switches BRT or bus on; a nursery
    // (openNursery) opens with all three already on.
    startModes: ["metro"],
    queued: null,
    hintArgs: [],
    pitches: World.sound.pentatonic(0),
    screenBeforePicker: "",
  };

  // ----- small helpers ------------------------------------------------------

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className, label, onClick) => {
    const node = el("button", `btn ${className || ""}`.trim(), label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  };
  const tf = (key, ...args) => (typeof t === "function" ? t(key, ...args) : key);

  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // A private window keeps no records; the game plays the same.
    }
  }

  function newSeed() {
    const bytes = new Uint32Array(1);
    window.crypto.getRandomValues(bytes);
    return String(100000 + (bytes[0] % 900000));
  }

  function language() {
    return typeof currentLanguage === "string" && currentLanguage === "en" ? "en" : "zh";
  }

  function cityLabel(game) {
    return language() === "en" ? game.city.name.en : game.city.name.zh;
  }

  // A line's name in its own mode: 1号线 / Line 1, 快2线 / BRT 2, 11路 / Route 11.
  function lineLabel(record) {
    const mode = core.modeOfLine(record);
    return World.transit.lineName(mode, mode === "bus" ? record.number : record.slot + 1)[language()];
  }

  function vehiclesLabel(record, count) {
    return tf(core.isRoad(core.modeOfLine(record)) ? "rootline_vehicles_road" : "rootline_vehicles_metro", count);
  }

  function stationLabel(s) {
    if (s.name) return language() === "en" ? s.name.en : s.name.zh;
    return tf(`rootline_kind_${s.kind}`);
  }

  function ink(node) {
    return window.getComputedStyle(node).color || "#000";
  }

  function paintGlyph(canvas, kind, size) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    // The glyph's CSS box is a layout decision, so it lives in the sheet:
    // `.rootline-glyph` reads this custom property. Only the per-instance
    // value travels inline. (css-budget inlineLayoutStyles ratchet.)
    canvas.style.setProperty("--rootline-glyph-size", `${size}px`);
    const c = canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    View.drawGlyph(c, kind, size / 2, size / 2, size * 0.42, ink(canvas));
  }

  function glyph(kind, size = 16) {
    const canvas = el("canvas", "rootline-glyph");
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.kind = kind;
    canvas.dataset.size = String(size);
    requestAnimationFrame(() => paintGlyph(canvas, kind, size));
    return canvas;
  }

  // Line swatches in the bars draw exactly what the map draws.
  function paintSwatch(canvas, slot, mode = "metro") {
    const width = 34;
    const height = 14;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const c = canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, width, height);
    View.strokeLine(c, [{ x: 5, y: height / 2 }, { x: width - 5, y: height / 2 }], slot, 5.5, look(canvas), 1, mode);
  }

  // A mode's badge (the world's pictogram), in the ink of the control it sits in.
  function paintBadge(canvas, mode, size = 14) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.setProperty("--rootline-glyph-size", `${size}px`);
    const c = canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    World.transit.drawBadge(c, mode, size / 2, size / 2, size * 0.42, ink(canvas));
  }

  function badge(mode, size = 14) {
    const canvas = el("canvas", "rootline-glyph rootline-badge");
    canvas.setAttribute("aria-hidden", "true");
    requestAnimationFrame(() => paintBadge(canvas, mode, size));
    return canvas;
  }

  function look(node) {
    const style = window.getComputedStyle(node);
    return {
      mono: View.oneBit(),
      dark: window.AISystem6Theme?.getResolvedColorMode?.() === "dark",
      paper: style.getPropertyValue("--paper").trim() || "#fff",
      ink: style.getPropertyValue("--ink").trim() || "#000",
    };
  }

  const ICONS = {
    train: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="4" width="12" height="8" rx="2" fill="currentColor"/><rect x="4" y="6" width="3" height="2" fill="var(--paper)"/><rect x="9" y="6" width="3" height="2" fill="var(--paper)"/></svg>',
    carriage: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="5" width="6" height="6" rx="1" fill="currentColor"/><rect x="9" y="5" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 8h2" stroke="currentColor" stroke-width="1.5"/></svg>',
    tunnel: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 13V9a6 6 0 0 1 12 0v4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 13V9.5a3 3 0 0 1 6 0V13" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    interchange: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    line: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12h5l4-8h3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bus: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="10" height="10" rx="1.5" fill="currentColor"/><rect x="4.5" y="3.5" width="7" height="4" fill="var(--paper)"/><circle cx="5.5" cy="13.5" r="1.3" fill="currentColor"/><circle cx="10.5" cy="13.5" r="1.3" fill="currentColor"/></svg>',
    avenue: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 4h14M1 12h14" stroke="currentColor" stroke-width="1.6"/><path d="M1 8h14" stroke="currentColor" stroke-width="3"/><path d="M2 8h12" stroke="var(--paper)" stroke-width="1" stroke-dasharray="2 2"/></svg>',
  };

  function icon(name) {
    const span = el("span", `rootline-icon rootline-icon-${name}`);
    span.innerHTML = ICONS[name];
    return span;
  }

  // ----- sound --------------------------------------------------------------
  //
  // Each line has a pitch; a train arriving plays it softly, so a busy network
  // sounds fuller than a quiet one (spec §5). The pitches are the pot's own
  // key: the world's pentatonic, moved to the tonic its seed gives (the same
  // tonic Bonsai City and Joyride take from that seed). A BRT bus adds a
  // breath of air brake; a bus rings its bell, the note set by its route
  // number. Synthesised here, sampled from nothing.

  function audio() {
    if (!state.sound) return null;
    if (!state.audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        state.audio = new Ctx();
      } catch {
        return null;
      }
    }
    if (state.audio.state === "suspended") state.audio.resume().catch(() => {});
    return state.audio;
  }

  // The tonic for a game: a pot's integer seed, else the seed text the
  // nursery bed was planted with.
  function tuneTo(seed) {
    state.pitches = World.sound.pentatonic(World.sound.keyOf(seed));
  }

  let noiseBuffer = null;
  function airBrake(at = 0.05) {
    const ac = audio();
    if (!ac || ac.state !== "running") return;
    if (!noiseBuffer) {
      // A fixed burst of noise from a small LCG: the same hiss every time.
      noiseBuffer = ac.createBuffer(1, Math.round(ac.sampleRate * 0.08), ac.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let seed = 0x1f2e3d;
      for (let i = 0; i < data.length; i += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = seed / 2147483648 - 1;
      }
    }
    const start = ac.currentTime + at;
    const source = ac.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ac.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(2400, start);
    const amp = ac.createGain();
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(0.03, start + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.06);
    source.connect(filter).connect(amp).connect(ac.destination);
    source.start(start);
    source.stop(start + 0.08);
  }

  function tone(freq, { at = 0, length = 0.16, gain = 0.05, type = "triangle" } = {}) {
    const ac = audio();
    if (!ac || ac.state !== "running") return;
    const start = ac.currentTime + at;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(amp).connect(ac.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }

  const sounds = {
    arrive(slot) {
      const now = performance.now();
      if (now - state.lastPluck < 90) return;
      state.lastPluck = now;
      const record = state.game?.lines.find((l) => l.slot === slot);
      const mode = record ? core.modeOfLine(record) : slot >= core.RULES.lineSlots ? "bus" : "metro";
      const pitches = state.pitches;
      if (mode === "bus") {
        // The stop bell: a struck partial over the note, quickly gone.
        const note = pitches[(record ? record.number : core.routeNumber(slot)) % pitches.length] * 2;
        tone(note, { gain: 0.028, length: 0.5, type: "sine" });
        tone(note * 2.76, { gain: 0.009, length: 0.22, type: "sine" });
        return;
      }
      tone(pitches[slot % pitches.length], { gain: 0.035, length: 0.22 });
      if (mode === "brt") airBrake();
    },
    station() { tone(1318.5, { gain: 0.03, length: 0.3, type: "sine" }); tone(1760, { at: 0.08, gain: 0.025, length: 0.4, type: "sine" }); },
    build() { tone(392, { gain: 0.04, length: 0.12, type: "square" }); tone(587.33, { at: 0.06, gain: 0.03, length: 0.16, type: "square" }); },
    reject() { tone(196, { gain: 0.05, length: 0.14, type: "square" }); },
    week() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { at: i * 0.09, gain: 0.04, length: 0.3 })); },
    warn() { tone(220, { gain: 0.06, length: 0.25, type: "sine" }); tone(207.65, { at: 0.18, gain: 0.05, length: 0.3, type: "sine" }); },
    over() { [659.25, 587.33, 523.25, 392].forEach((f, i) => tone(f, { at: i * 0.16, gain: 0.05, length: 0.4, type: "sine" })); },
  };

  // ----- the window ---------------------------------------------------------

  const dom = {};

  function syncHostContract(host = "loading") {
    // Rootline is a pure JS map shell — no Wasm engine binary (v223 honesty).
    const win = document.querySelector('[data-window="rootline"]');
    window.AISystem6WasmHostContract?.apply?.(win, {
      kind: "rootline",
      host,
      wasm: 0,
      binary: 0,
      fail: true,
      crash: true,
    });
  }

  function installRootlineWindow() {
    if (typeof document === "undefined") return;
    const existing = document.querySelector('[data-window="rootline"]');
    if (existing) {
      syncHostContract(state.built ? "ready" : "loading");
      return;
    }
    window.AISystem6ApplicationShell.createWindow({
      windowName: "rootline",
      windowClass: "rootline-window",
      labelledBy: "rootline-title",
      titleKey: "rootline_title",
      title: tf("rootline_title"),
      paneClass: "rootline-pane",
    });
    syncHostContract("loading");
  }

  function build() {
    const win = document.querySelector('[data-window="rootline"]');
    const pane = win?.querySelector(".rootline-pane");
    if (!pane || state.built) return;
    state.built = true;
    pane.textContent = "";

    dom.top = el("div", "rootline-top");
    dom.clock = el("div", "rootline-clock");
    dom.day = el("span", "rootline-day");
    dom.time = el("span", "rootline-time");
    dom.period = el("span", "rootline-period");
    dom.dayline = el("span", "rootline-dayline");
    dom.dayline.setAttribute("aria-hidden", "true");
    dom.dayCursor = el("span", "rootline-dayline-cursor");
    const morning = el("span", "rootline-dayline-peak is-morning");
    const evening = el("span", "rootline-dayline-peak is-evening");
    dom.dayline.append(morning, evening, dom.dayCursor);
    dom.clock.append(dom.day, dom.time, dom.dayline, dom.period);
    dom.city = el("div", "rootline-city");
    dom.score = el("div", "rootline-score");
    dom.delivered = el("span", "rootline-delivered", "0");
    dom.score.append(icon("train"), dom.delivered);
    dom.pauseButton = button("rootline-pause", "", () => togglePause());
    dom.speedButton = button("rootline-speed", "", () => cycleSpeed());
    const controls = el("div", "rootline-controls");
    controls.append(dom.pauseButton, dom.speedButton);
    dom.top.append(dom.clock, dom.city, dom.score, controls);

    dom.map = el("div", "rootline-map");
    dom.canvas = el("canvas", "rootline-canvas");
    dom.canvas.setAttribute("role", "img");
    dom.hint = el("div", "rootline-hint");
    dom.hint.hidden = true;
    dom.card = el("div", "rootline-card");
    dom.card.hidden = true;
    dom.toast = el("div", "rootline-toast");
    dom.toast.setAttribute("role", "status");
    dom.toast.setAttribute("aria-live", "polite");
    dom.overlay = el("div", "rootline-overlay");
    dom.overlay.hidden = true;
    dom.map.append(dom.canvas, dom.hint, dom.card, dom.toast, dom.overlay);

    dom.bottom = el("div", "rootline-bottom");
    // The way the next line is laid: the start panel's segmented choice,
    // here with each mode's badge and what is left of it.
    dom.transit = el("div", "rootline-modes rootline-transit");
    dom.transit.setAttribute("role", "radiogroup");
    dom.transit.hidden = true;
    dom.slots = el("div", "rootline-slots");
    dom.routes = el("div", "rootline-slots rootline-routes");
    dom.routes.hidden = true;
    dom.stock = el("div", "rootline-stock");
    dom.linebar = el("div", "rootline-linebar");
    dom.linebar.hidden = true;
    dom.bottom.append(dom.transit, dom.slots, dom.routes, dom.stock, dom.linebar);

    pane.append(dom.top, dom.map, dom.bottom);

    state.view = View.create({
      canvas: dom.canvas,
      core,
      hooks: {
        game: () => state.game,
        apply: (command) => run(command),
        locked: () => state.screen !== "play",
        onTapStation: (id) => openCard(id),
        onTapLine: (id) => selectLine(id),
        onTapEmpty: () => { closeCard(); selectLine(0); },
        onReject: (reason) => reject(reason),
        onChain: () => tone(880, { gain: 0.015, length: 0.05, type: "sine" }),
        onUserGesture: () => audio(),
        drawMode: () => state.drawMode,
        onIntroEnd: () => renderHud(),
      },
    });

    // Keys belong to the game whenever its window is in front, wherever the
    // focus happens to sit (the start button that had it is gone by then).
    document.addEventListener("keydown", onKey);
    dom.canvas.tabIndex = 0;
    state.observer = new MutationObserver(syncVisibility);
    state.observer.observe(win, { attributes: true, attributeFilter: ["class"] });
    if (typeof ResizeObserver === "function") {
      state.resizeObserver = new ResizeObserver(() => {
        state.view?.resize();
        dockStartPanel();
      });
      state.resizeObserver.observe(dom.map);
    }
    const prefs = readJson(PREFS_KEY, {});
    state.sound = prefs.sound !== false;
    state.mode = prefs.mode === "endless" ? "endless" : "classic";
    state.seed = newSeed();
    // A pot or a nursery queued before the window was built opens now.
    const queued = state.queued;
    state.queued = null;
    if (queued?.kind === "pot") openPot(queued.payload);
    else if (queued?.kind === "nursery") openNursery(queued.seed, queued.name);
    else showStart();
  }

  // ----- pace ---------------------------------------------------------------

  function paused() {
    const p = state.pause;
    return p.user || p.hidden || p.assistant;
  }

  function running() {
    return Boolean(state.game && state.screen === "play" && !state.game.over && !state.game.reward && !paused());
  }

  function windowVisible() {
    const win = document.querySelector('[data-window="rootline"]');
    return Boolean(win) && !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden") && !win.classList.contains("is-collapsed") && !document.hidden;
  }

  function syncVisibility() {
    state.pause.hidden = !windowVisible();
    if (state.pause.hidden) stopLoop();
    else startLoop();
    renderHud();
  }

  function startLoop() {
    if (state.raf || !windowVisible()) return;
    state.last = performance.now();
    state.raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.acc = 0;
  }

  function frame(now) {
    state.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - state.last) / 1000));
    state.last = now;
    if (running()) {
      state.acc += dt * state.speed;
      let steps = 0;
      while (state.acc >= STEP && steps < 12) {
        core.step(state.game);
        state.acc -= STEP;
        steps += 1;
        if (state.game.reward || state.game.over) {
          state.acc = 0;
          break;
        }
      }
    } else {
      state.acc = 0;
    }
    if (state.game) handleEvents();
    state.view?.render(now, dt);
    if (now - state.hudAt > 120) {
      state.hudAt = now;
      renderHud();
      positionCard();
    }
  }

  function handleEvents() {
    const game = state.game;
    for (const event of game.events) {
      if (event.tick <= state.eventTick) continue;
      if (event.type === "arrive" && event.slot >= 0) sounds.arrive(event.slot);
      if (event.type === "station") sounds.station();
      if (event.type === "week") { sounds.week(); showReward(); }
      if (event.type === "over") { sounds.over(); finish(); }
    }
    state.eventTick = game.tick;
    // One warning per crowding episode, when the ring starts to fill.
    for (const s of game.stations) {
      if (s.crowd > 0.02 && !state.crowdWarned.has(s.id)) {
        state.crowdWarned.add(s.id);
        sounds.warn();
        toast(tf("rootline_toast_crowding", tf(`rootline_kind_${s.kind}`)));
      }
      if (s.crowd === 0) state.crowdWarned.delete(s.id);
    }
  }

  function togglePause(force) {
    if (!state.game || state.screen !== "play") return;
    state.pause.user = typeof force === "boolean" ? force : !state.pause.user;
    renderHud();
  }

  function cycleSpeed(force) {
    state.speed = force || (state.speed === 1 ? 2 : state.speed === 2 ? 3 : 1);
    renderHud();
  }

  // ----- commands -----------------------------------------------------------

  function run(command) {
    if (!state.game) return { ok: false, reason: "game" };
    const opening = command.type === "line.create" && core.isRoad(command.mode || "metro") && !state.game.modes;
    const result = opening ? core.applyOpening(state.game, ALL_MODES, command) : core.apply(state.game, command);
    if (!result.ok) {
      reject(result.reason);
      return result;
    }
    if (command.type === "line.create" || command.type === "line.set" || command.type === "line.mode") {
      sounds.build();
      if (state.hint === "first" || state.hint === "planning" || state.hint === "planning_early") setHint("second", 9000);
    }
    if (command.type === "line.create") {
      const record = state.game.lines[state.game.lines.length - 1];
      if (record && !state.game.trains.some((tr) => tr.lineId === record.id)) {
        toast(tf(core.isRoad(core.modeOfLine(record)) ? "rootline_toast_no_bus" : "rootline_toast_no_train"));
      }
    }
    if (command.type === "line.remove" && state.view.selectedLine() === command.lineId) selectLine(0);
    renderHud();
    renderLinebar();
    if (state.card) renderCard();
    return result;
  }

  const REJECTIONS = {
    "no-line": "rootline_reject_no_line",
    tunnel: "rootline_reject_tunnel",
    "no-train": "rootline_reject_no_train",
    "no-carriage": "rootline_reject_no_carriage",
    full: "rootline_reject_full",
    "no-interchange": "rootline_reject_no_interchange",
    "no-route": "rootline_reject_no_route",
    "no-bus": "rootline_reject_no_bus",
    "no-avenue": "rootline_reject_no_avenue",
    avenue: "rootline_reject_avenue",
    bridge: "rootline_reject_bridge",
    road: "rootline_reject_road",
    mode: "rootline_reject_mode",
  };

  function reject(reason) {
    const key = REJECTIONS[reason];
    if (!key) return;
    sounds.reject();
    toast(tf(key));
  }

  function toast(text) {
    if (!dom.toast) return;
    dom.toast.textContent = text;
    dom.toast.classList.add("is-shown");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => dom.toast.classList.remove("is-shown"), 2600);
  }

  function setHint(kind, ms, ...args) {
    state.hint = kind;
    state.hintArgs = args;
    state.hintUntil = ms ? performance.now() + ms : 0;
    if (!dom.hint) return;
    dom.hint.hidden = !kind;
    dom.hint.textContent = kind ? tf(`rootline_hint_${kind}`, ...args) : "";
  }

  // ----- screens ------------------------------------------------------------

  function overlay(className, children) {
    dom.overlay.hidden = false;
    dom.overlay.className = `rootline-overlay ${className}`;
    dom.overlay.textContent = "";
    const panel = el("div", "rootline-panel");
    // The panel takes focus, not its first button. Space is the pause key,
    // and a player reaching for it as the week ends (or the round does)
    // must not choose a reward or restart the city by accident.
    panel.tabIndex = -1;
    panel.setAttribute("role", "dialog");
    const heading = children.find((child) => child.tagName === "H3");
    if (heading) {
      heading.id = `rootline-panel-${className.replace(/\W+/g, "")}`;
      panel.setAttribute("aria-labelledby", heading.id);
    }
    panel.append(...children);
    dom.overlay.append(panel);
    return panel;
  }

  function focusPanel() {
    dom.overlay.querySelector(".rootline-panel")?.focus({ preventScroll: true });
  }

  function hideOverlay() {
    dom.overlay.hidden = true;
    dom.overlay.textContent = "";
  }

  // A record is kept per city -- the pot's own id, or the seed of a city
  // grown from one -- per round mode, and per set of transit modes.
  function bestKey(game) {
    const source = core.isPot(game) ? game.city.key : state.seed;
    return `${game.mode}:${source}${game.modes ? `:${game.modes.join("+")}` : ""}`;
  }

  function bestFor(game) {
    const all = readJson(BEST_KEY, {});
    return all[bestKey(game)] || null;
  }

  // A city grown from the seed. It is metro-only until a road line is laid.
  function seededGame() {
    return core.createGame({ seed: state.seed, mode: state.mode, name: state.nurseryName || undefined });
  }

  // What the start panel opens: the old metro-only game, unless its mode
  // control has BRT or bus switched on (a nursery starts with all three).
  function startPanelGame() {
    return state.startModes.length > 1
      ? core.createGame({ seed: state.seed, mode: state.mode, name: state.nurseryName || undefined, modes: state.startModes.slice() })
      : seededGame();
  }

  function leavePot() {
    state.pot = null;
  }

  function showStart() {
    state.screen = "start";
    closeCard();
    leavePot();
    // A city appears behind the panel before the game starts, so the
    // choice is about something visible.
    state.game = startPanelGame();
    tuneTo(state.seed);
    state.view.reset();
    state.eventTick = 0;
    const title = el("h3", "rootline-start-title", tf("rootline_title"));
    const tag = el("p", "rootline-start-tag", tf("rootline_tagline"));
    const city = el("div", "rootline-start-city");
    // The nursery bed's number is the seed; it stays off the screen, in the
    // name's tooltip, for anyone who wants to plant the same city again.
    const name = el("strong", "", cityLabel(state.game));
    name.title = tf("rootline_seed_tip", state.seed);
    city.append(el("span", "", tf("rootline_city")), name, button("rootline-reroll", tf("rootline_new_city"), () => {
      state.seed = newSeed();
      state.nurseryName = null;
      state.startModes = ["metro"];
      showStart();
    }));
    const modes = el("div", "rootline-modes");
    modes.setAttribute("role", "radiogroup");
    modes.setAttribute("aria-label", tf("rootline_mode"));
    for (const mode of ["classic", "endless"]) {
      const choice = button(`rootline-mode${state.mode === mode ? " is-chosen" : ""}`, tf(`rootline_mode_${mode}`), () => {
        state.mode = mode;
        writeJson(PREFS_KEY, { ...readJson(PREFS_KEY, {}), mode });
        showStart();
      });
      choice.setAttribute("role", "radio");
      choice.setAttribute("aria-checked", String(state.mode === mode));
      modes.append(choice);
    }
    const modeNote = el("p", "rootline-mode-note", tf(`rootline_mode_${state.mode}_note`));
    // The start panel's own transit-mode control: a seeded city opens as the
    // old metro-only game unless BRT or bus is switched on here; a nursery
    // opens with all three already on.
    const extras = el("div", "rootline-modes rootline-start-modes");
    extras.setAttribute("role", "group");
    extras.setAttribute("aria-label", tf("rootline_transit"));
    for (const mode of ["brt", "bus"]) {
      const on = state.startModes.includes(mode);
      const choice = button(`rootline-mode${on ? " is-chosen" : ""}`, tf(`rootline_transit_${mode}`), () => {
        state.startModes = on
          ? state.startModes.filter((m) => m !== mode)
          : ALL_MODES.filter((m) => state.startModes.includes(m) || m === mode);
        showStart();
      });
      choice.setAttribute("role", "checkbox");
      choice.setAttribute("aria-checked", String(on));
      extras.append(choice);
    }
    const best = bestFor(state.game);
    const bestLine = el("p", "rootline-best", best ? tf("rootline_best", best.delivered, best.week) : tf("rootline_best_none"));
    const how = el("ol", "rootline-how");
    for (const key of ["rootline_how_draw", "rootline_how_modes", "rootline_how_edit", "rootline_how_peaks", "rootline_how_week"]) how.append(el("li", "", tf(key)));
    const start = button("rootline-start default", tf("rootline_start"), () => startGame());
    overlay("is-start", [title, tag, city, modes, modeNote, extras, bestLine, how, start]);
    requestAnimationFrame(() => {
      start.focus({ preventScroll: true });
      dockStartPanel();
    });
    renderHud();
    startLoop();
  }

  // On a wide map the start panel docks to the left (99-rootline.css), and
  // the camera frames the city in the space beside it, so the choice is made
  // looking at the city it is about.
  function dockStartPanel() {
    const panel = dom.overlay.querySelector(".rootline-panel");
    if (state.screen !== "start" || !panel) {
      state.view?.setInset(0);
      return;
    }
    const map = dom.map.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const docked = box.left - map.left < map.width * 0.15 && box.right - map.left < map.width * 0.6;
    state.view.setInset(docked ? box.right - map.left + 16 : 0);
  }

  function startGame(seed = state.seed) {
    if (state.pot) {
      startPot(state.pot, null);
      return;
    }
    state.seed = seed;
    state.game = startPanelGame();
    tuneTo(state.seed);
    beginPlay();
    setHint("first");
  }

  function beginPlay() {
    state.view.reset();
    state.eventTick = 0;
    state.crowdWarned.clear();
    state.pause.user = false;
    state.screen = "play";
    state.drawMode = "metro";
    state.view.setInset(0);
    hideOverlay();
    closeCard();
    selectLine(0);
    renderHud();
    startLoop();
    dom.canvas.focus?.({ preventScroll: true });
  }

  // ----- a pot from Bonsai City ------------------------------------------------
  //
  // The hand-over is converted once (rootline-pot.js) and kept with the game;
  // the city's own zones, rail and water play the opening transition, unless
  // the system asks for less motion. The clock waits for the first line.

  function reducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function openPot(payload) {
    let desc = null;
    try {
      const check = World.handoff.validate(payload);
      if (!check.ok) throw new Error(`rootline-pot-invalid:${check.errors.join(",")}`);
      desc = Pot.fromHandoff(payload);
    } catch (error) {
      console.warn("Rootline could not read the pot it was handed.", error);
      toast(tf("rootline_pots_failed"));
      if (!state.game) showStart();
      return false;
    }
    if (desc.sites.length < 2) {
      toast(tf("rootline_pot_small", desc.name[language()]));
      if (!state.game) showStart();
      return false;
    }
    const pot = { desc, cityId: desc.source.cityId, name: desc.name, seed: desc.source.seed };
    startPot(pot, reducedMotion() ? null : Pot.introOf(payload, desc));
    return true;
  }

  function startPot(pot, intro) {
    state.pot = pot;
    state.nurseryName = null;
    state.startModes = ["metro"];
    state.game = core.createGame({ seed: pot.desc.key, mode: state.mode, modes: ALL_MODES, city: pot.desc });
    tuneTo(pot.seed ?? pot.desc.key);
    beginPlay();
    // No transition (less motion asked for, or a restart): the stats say so too.
    state.view.playIntro(intro);
    const year = pot.desc.year;
    if (Number.isInteger(year) && year < 1910) setHint("planning_early", 0, year);
    else setHint("planning");
  }

  // A neighbouring pot, opened as a city grown from its seed and named for it.
  function openNursery(seed, name) {
    state.seed = String(seed);
    state.nurseryName = name && typeof name.zh === "string" && typeof name.en === "string" ? { zh: name.zh, en: name.en } : null;
    // A nursery is a neighbouring pot: it opens with all three modes on.
    state.startModes = ALL_MODES.slice();
    showStart();
    return true;
  }

  // File > Open Bonsai City…: the saves, read in a read-only transaction.
  // Rootline never opens that store for writing.
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

  async function handoffFor(record) {
    const sim = window.AISystem6BonsaiSim;
    const envelope = typeof record.saveData === "string" ? JSON.parse(record.saveData) : record.saveData;
    const decoded = await sim.decodeSave(envelope);
    return World.handoff.fromCity(sim, decoded.state, { record: { id: record.id, name: record.name || "" }, display: {} });
  }

  function savedOn(record) {
    const date = new Date(record.updatedAt || record.createdAt || 0);
    if (Number.isNaN(date.getTime()) || !date.getTime()) return "";
    return tf("rootline_pots_saved", date.toLocaleDateString(language() === "en" ? "en-GB" : "zh-CN"));
  }

  function closePicker() {
    const before = state.screenBeforePicker;
    state.screenBeforePicker = "";
    if (before === "start" || !state.game) { showStart(); return; }
    hideOverlay();
    state.screen = before || "play";
    if (state.screen === "over") { state.screen = "play"; finish(); return; }
    if (state.game.reward) showReward();
    renderHud();
  }

  async function openPotPicker() {
    if (state.screen === "pots") return;
    state.view?.cutIntro();
    state.screenBeforePicker = state.screen;
    state.screen = "pots";
    closeCard();
    const title = el("h3", "", tf("rootline_pots_title"));
    const note = el("p", "rootline-pots-note", tf("rootline_pots_loading"));
    note.setAttribute("role", "status");
    const list = el("div", "rootline-pots");
    list.setAttribute("role", "list");
    const cancel = button("rootline-pots-cancel", tf("rootline_pots_cancel"), () => closePicker());
    const actions = el("div", "rootline-actions");
    actions.append(cancel);
    overlay("is-pots", [title, note, list, actions]);
    focusPanel();
    renderHud();
    let records = [];
    try {
      records = await listBonsaiCities();
    } catch (error) {
      console.warn("Rootline could not list Bonsai City saves.", error);
    }
    if (state.screen !== "pots") return;
    note.textContent = tf(records.length ? "rootline_pots_note" : "rootline_pots_none");
    for (const record of records) {
      const choice = button("rootline-pot", "", async () => {
        if (choice.disabled) return;
        list.querySelectorAll("button").forEach((node) => { node.disabled = true; });
        note.textContent = tf("rootline_pots_opening", record.name || tf("rootline_pots_unnamed"));
        try {
          const payload = await handoffFor(record);
          if (state.screen !== "pots") return;
          state.screenBeforePicker = "";
          openPot(payload);
        } catch (error) {
          console.warn("Rootline could not read that Bonsai City save.", error);
          note.textContent = tf("rootline_pots_failed");
          list.querySelectorAll("button").forEach((node) => { node.disabled = false; });
        }
      });
      choice.setAttribute("role", "listitem");
      choice.append(el("strong", "", record.name || tf("rootline_pots_unnamed")), el("span", "", savedOn(record)));
      list.append(choice);
    }
  }

  // File > Back to Bonsai City. The row does not name the pot: Bonsai City
  // opens the city it last had and does not yet read `bonsaiRecordId`, so a
  // row promising a particular city could land on another one. The id is
  // sent all the same, for the day it does.
  function returnToPot() {
    const cityId = state.pot?.cityId;
    if (!cityId) return;
    window.AISystem6Runtime?.dispatchCommand?.("open-bonsai-city", { bonsaiRecordId: cityId });
  }

  // File > Save as a line-network plan. The drawing becomes the plan the mayor
  // can price and lay: the same stations in the same order, the same legs, in
  // the city's own tile coordinates (spec §8.1). Nothing about the city changes
  // here — the mayor does that when they flip the pot.
  async function potFingerprint(cityId) {
    if (!cityId || typeof openAppDb !== "function") return "unknown";
    try {
      const db = await openAppDb();
      try {
        const records = await window.AISystem6StorageTransactions.runTransaction(
          db, bonsaiCitiesStoreName, "readonly",
          (tx) => idbRequest(tx.objectStore(bonsaiCitiesStoreName).getAll()),
        );
        const record = (records || []).find((item) => item.id === cityId);
        const envelope = typeof record?.saveData === "string" ? JSON.parse(record.saveData) : record?.saveData;
        return typeof envelope?.integrity?.digest === "string" ? envelope.integrity.digest : "unknown";
      } finally {
        db.close();
      }
    } catch {
      return "unknown";
    }
  }

  async function saveTransitPlan() {
    const pot = state.pot;
    const game = state.game;
    const builder = window.AISystem6BasinFlipPot;
    if (!pot?.desc || !game || typeof putStoredTransitPlan !== "function" || typeof builder?.planFrom !== "function") {
      toast(tf("rootline_plan_unavailable"));
      return false;
    }
    const fingerprint = await potFingerprint(pot.cityId);
    const id = `plan-${String(pot.cityId || "seed").slice(0, 40)}-${Date.now().toString(36)}`;
    const plan = builder.planFrom({ pot: pot.desc, game, core, fingerprint, id });
    if (!plan) {
      toast(tf("rootline_plan_empty"));
      return false;
    }
    const shape = World.plans.validate(plan);
    if (!shape.ok) {
      toast(tf("rootline_plan_invalid"));
      return false;
    }
    const digest = await World.plans.digest(plan);
    const record = {
      id,
      cityId: pot.cityId || null,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      plan: { ...plan, id, integrity: { algorithm: "SHA-256", canonicalization: "sorted-json-v1", digest } },
    };
    await putStoredTransitPlan(record);
    toast(tf("rootline_plan_saved", plan.lines.length));
    return true;
  }

  const REWARD_ICON = { line: "line", carriage: "carriage", tunnel: "tunnel", interchange: "interchange", bus: "bus", avenue: "avenue" };

  function showReward() {
    const reward = state.game?.reward;
    if (!reward) return;
    closeCard();
    const title = el("h3", "", tf("rootline_week_over", reward.week - 1));
    const note = el("p", "", tf("rootline_week_train"));
    const choices = el("div", "rootline-rewards");
    reward.options.forEach((option, index) => {
      const card = button("rootline-reward", "", () => {
        run({ type: "reward.choose", index });
        hideOverlay();
        renderHud();
      });
      card.append(icon(REWARD_ICON[option]), el("strong", "", tf(`rootline_reward_${option}`)), el("span", "", tf(`rootline_reward_${option}_note`)));
      choices.append(card);
    });
    overlay("is-reward", [title, note, choices]);
    focusPanel();
  }

  function recordBest(game) {
    const all = readJson(BEST_KEY, {});
    const key = bestKey(game);
    const week = core.clock(game.tick).week;
    const previous = all[key];
    const better = !previous || game.delivered > previous.delivered;
    if (better) {
      all[key] = { delivered: game.delivered, week, seconds: Math.round(game.tick / core.RULES.ticksPerSecond), city: game.city.name };
      writeJson(BEST_KEY, all);
    }
    return { better: better && Boolean(previous), previous };
  }

  function finish() {
    const game = state.game;
    if (!game?.over) return;
    state.screen = "over";
    closeCard();
    selectLine(0);
    const s = core.station(game, game.over.stationId);
    const ck = core.clock(game.tick);
    const { better } = recordBest(game);
    const title = el("h3", "", tf("rootline_over_title", cityLabel(game)));
    const cause = el("p", "rootline-over-cause", s?.name ? tf("rootline_over_cause_named", stationLabel(s)) : tf("rootline_over_cause", tf(`rootline_kind_${s?.kind || "residential"}`)));
    const stats = el("dl", "rootline-stats");
    const stat = (label, value) => stats.append(el("dt", "", label), el("dd", "", value));
    stat(tf("rootline_stat_delivered"), String(game.delivered));
    if (game.deliveredBy) stat(tf("rootline_stat_by_mode"), tf("rootline_stat_by_mode_value", game.deliveredBy.metro, game.deliveredBy.brt, game.deliveredBy.bus));
    stat(tf("rootline_stat_lasted"), tf("rootline_stat_lasted_value", ck.week, tf(`rootline_weekday_${ck.weekday}`)));
    stat(tf("rootline_stat_lines"), String(game.lines.length));
    stat(tf("rootline_stat_stations"), String(game.stations.length));
    // Game time, not wall time: pauses and the speed setting do not count.
    const played = Math.round(game.tick / core.RULES.ticksPerSecond);
    stat(tf("rootline_stat_time"), `${Math.floor(played / 60)}:${String(played % 60).padStart(2, "0")}`);
    const best = bestFor(game);
    const bestLine = el("p", "rootline-best", better ? tf("rootline_new_record") : best ? tf("rootline_best", best.delivered, best.week) : "");
    const again = button("rootline-again default", tf("rootline_again"), () => startGame(state.seed));
    const other = button("rootline-other", tf("rootline_new_city"), () => { state.seed = newSeed(); state.nurseryName = null; state.startModes = ["metro"]; showStart(); });
    const actions = el("div", "rootline-actions");
    actions.append(other, again);
    // Leave the stopped map readable for a moment before the panel covers it.
    setTimeout(() => {
      if (state.game !== game) return;
      overlay("is-over", [title, cause, stats, bestLine, actions]);
      focusPanel();
    }, 1400);
    renderHud();
  }

  // ----- bars -----------------------------------------------------------------

  const WEEKDAYS = 7;

  function renderHud() {
    const game = state.game;
    if (!game || !dom.top) return;
    const ck = core.clock(game.tick);
    const hh = Math.floor(ck.hour);
    const mm = Math.floor((ck.hour - hh) * 60 / 10) * 10;
    const weekday = tf(`rootline_weekday_${ck.weekday % WEEKDAYS}`);
    // A pot's weeks are a rehearsal of the plan, under the pot's own name:
    // 鹤洲 · 排练第1周 周一 06:00.
    dom.day.textContent = state.pot ? tf("rootline_day_label_pot", cityLabel(game), ck.week, weekday) : tf("rootline_day_label", ck.week, weekday);
    dom.time.textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const period = core.periodOf(ck.hour);
    dom.period.textContent = period === "day" ? "" : tf(`rootline_period_${period}`);
    dom.period.dataset.period = period;
    // Position along the day track is a per-instance value; the rule that
    // turns it into a position stays in `.rootline-dayline-cursor`.
    dom.dayCursor.style.setProperty("--rootline-day-x", `${(ck.hour / 24) * 100}%`);
    dom.city.textContent = state.pot ? (game.planning ? tf("rootline_planning") : "") : cityLabel(game);
    dom.city.classList.toggle("is-planning", Boolean(state.pot && game.planning));
    dom.delivered.textContent = String(game.delivered);
    dom.score.title = tf("rootline_stat_delivered");
    const pausedNow = state.pause.user || state.pause.assistant;
    dom.pauseButton.textContent = pausedNow ? tf("rootline_resume") : tf("rootline_pause");
    dom.pauseButton.disabled = state.screen !== "play" || Boolean(game.planning);
    dom.speedButton.textContent = `${state.speed}×`;
    dom.speedButton.title = tf("rootline_speed");
    dom.canvas.setAttribute("aria-label", tf("rootline_map_label", cityLabel(game), ck.week, game.delivered));
    renderTransit();
    renderSlots();
    renderRoutes();
    renderStock();
    if (state.hint && state.hintUntil && performance.now() > state.hintUntil) setHint("");
  }

  // The mode picker: metro, BRT, bus, each with its badge and what is left
  // ("4 lines · 3 trains"). Click or tap one; M steps through them.
  function transitCount(mode, avail) {
    if (mode === "metro") return tf("rootline_transit_count_metro", avail.lines, avail.trains);
    if (mode === "brt") return core.isPot(state.game) ? tf("rootline_transit_count_brt_pot", avail.lines, avail.buses) : tf("rootline_transit_count_brt", avail.avenues, avail.buses);
    return tf("rootline_transit_count_bus", avail.routes, avail.buses);
  }

  // The modes a new line may be laid in: the game's own, or all three in a
  // metro-only game that has not laid a road line yet.
  function offeredModes() {
    return state.game ? state.game.modes || ALL_MODES : null;
  }

  // The stock as the picker counts it: a metro-only game counts the road
  // stock it will get with its first road line.
  function pickerStock(game) {
    const avail = core.available(game);
    return game.modes ? avail : { ...avail, ...core.RULES.startTransit };
  }

  function setDrawMode(mode) {
    if (!offeredModes()?.includes(mode)) return;
    state.drawMode = mode;
    dom.transit.dataset.signature = "";
    renderTransit();
  }

  function cycleDrawMode() {
    const modes = offeredModes();
    if (!modes) return;
    setDrawMode(modes[(modes.indexOf(state.drawMode) + 1) % modes.length]);
    toast(tf("rootline_transit_now", tf(`rootline_transit_${state.drawMode}`)));
  }

  function renderTransit() {
    const game = state.game;
    const modes = offeredModes();
    dom.transit.hidden = !modes;
    if (!modes) return;
    const avail = pickerStock(game);
    const signature = JSON.stringify([state.drawMode, avail, core.isPot(game), document.body.dataset.theme, language()]);
    if (dom.transit.dataset.signature === signature) return;
    dom.transit.dataset.signature = signature;
    dom.transit.textContent = "";
    dom.transit.setAttribute("aria-label", tf("rootline_transit"));
    dom.transit.title = tf("rootline_transit_key");
    for (const mode of modes) {
      const chosen = state.drawMode === mode;
      const choice = button(`rootline-mode${chosen ? " is-chosen" : ""}`, "", () => setDrawMode(mode));
      choice.setAttribute("role", "radio");
      choice.setAttribute("aria-checked", String(chosen));
      choice.dataset.transit = mode;
      const count = transitCount(mode, avail);
      choice.setAttribute("aria-label", `${tf(`rootline_transit_${mode}`)}, ${count}`);
      choice.append(badge(mode, 14), el("span", "rootline-transit-name", tf(`rootline_transit_${mode}`)), el("span", "rootline-transit-count", count));
      dom.transit.append(choice);
    }
  }

  function renderSlots() {
    const game = state.game;
    const avail = core.available(game);
    const signature = JSON.stringify([game.lines.map((l) => [l.slot, l.id, l.mode || ""]), game.owned.lines, state.view.selectedLine(), game.trains.length, document.body.dataset.theme, language()]);
    if (dom.slots.dataset.signature === signature) return;
    dom.slots.dataset.signature = signature;
    dom.slots.textContent = "";
    for (let slot = 0; slot < core.RULES.lineSlots; slot += 1) {
      const record = game.lines.find((l) => l.slot === slot);
      const owned = slot < game.owned.lines || Boolean(record);
      const item = el("button", "rootline-slot");
      item.type = "button";
      const swatch = el("canvas", "rootline-swatch");
      item.append(swatch);
      if (record) {
        const mode = core.modeOfLine(record);
        item.classList.add("is-used");
        if (state.view.selectedLine() === record.id) item.classList.add("is-selected");
        const trains = game.trains.filter((tr) => tr.lineId === record.id && !tr.retiring).length;
        item.append(el("span", "rootline-slot-count", String(trains)));
        item.title = lineLabel(record);
        item.setAttribute("aria-label", tf("rootline_line_summary", lineLabel(record), record.stops.length, vehiclesLabel(record, trains)));
        item.addEventListener("click", () => selectLine(state.view.selectedLine() === record.id ? 0 : record.id));
        requestAnimationFrame(() => paintSwatch(swatch, slot, mode));
      } else if (owned) {
        item.classList.add("is-free");
        item.title = tf("rootline_slot_free");
        item.setAttribute("aria-label", tf("rootline_slot_free"));
        item.addEventListener("click", () => setHint("first", 6000));
        requestAnimationFrame(() => paintSwatch(swatch, slot));
      } else {
        item.classList.add("is-locked");
        item.disabled = true;
        item.setAttribute("aria-label", tf("rootline_slot_locked"));
      }
      dom.slots.append(item);
    }
    if (avail.lines <= 0 && !game.lines.length) dom.slots.classList.add("is-empty");
  }

  // Bus routes: numbers 11-16, ink, a pool of their own beside the slots.
  function renderRoutes() {
    const game = state.game;
    const show = Boolean(game.modes?.includes("bus"));
    dom.routes.hidden = !show;
    if (!show) return;
    const signature = JSON.stringify([game.lines.filter((l) => l.mode === "bus").map((l) => [l.number, l.id]), game.owned.routes, state.view.selectedLine(), game.trains.length, language()]);
    if (dom.routes.dataset.signature === signature) return;
    dom.routes.dataset.signature = signature;
    dom.routes.textContent = "";
    for (let k = 1; k <= core.RULES.routeSlots; k += 1) {
      const slot = core.RULES.lineSlots - 1 + k;
      const number = core.routeNumber(slot);
      const record = game.lines.find((l) => l.slot === slot);
      if (!record && k > game.owned.routes) break;
      const item = el("button", "rootline-slot rootline-route", String(number));
      item.type = "button";
      if (record) {
        item.classList.add("is-used");
        if (state.view.selectedLine() === record.id) item.classList.add("is-selected");
        const buses = game.trains.filter((tr) => tr.lineId === record.id && !tr.retiring).length;
        item.append(el("span", "rootline-slot-count", String(buses)));
        item.title = lineLabel(record);
        item.setAttribute("aria-label", tf("rootline_line_summary", lineLabel(record), record.stops.length, vehiclesLabel(record, buses)));
        item.addEventListener("click", () => selectLine(state.view.selectedLine() === record.id ? 0 : record.id));
      } else {
        item.classList.add("is-free");
        item.title = tf("rootline_route_free");
        item.setAttribute("aria-label", tf("rootline_route_free"));
        item.addEventListener("click", () => { setDrawMode("bus"); setHint("first", 6000); });
      }
      dom.routes.append(item);
    }
  }

  function renderStock() {
    const avail = core.available(state.game);
    const signature = JSON.stringify([avail, language()]);
    if (dom.stock.dataset.signature === signature) return;
    dom.stock.dataset.signature = signature;
    dom.stock.textContent = "";
    const chips = [["train", avail.trains], ["carriage", avail.carriages], ["tunnel", avail.tunnels], ["interchange", avail.interchanges]];
    if (state.game.modes) {
      chips.push(["bus", avail.buses]);
      if (!core.isPot(state.game)) chips.push(["avenue", avail.avenues]);
    }
    for (const [name, value] of chips) {
      const chip = el("span", `rootline-chip${value > 0 ? "" : " is-zero"}`);
      chip.title = tf(`rootline_stock_${name}`);
      chip.setAttribute("aria-label", `${tf(`rootline_stock_${name}`)} ${value}`);
      chip.append(icon(name), el("span", "", String(value)));
      dom.stock.append(chip);
    }
  }

  function selectLine(id) {
    state.view?.setSelectedLine(id);
    renderLinebar();
    if (dom.slots) dom.slots.dataset.signature = "";
    if (dom.routes) dom.routes.dataset.signature = "";
    if (state.game) { renderSlots(); renderRoutes(); }
  }

  // The bus's share of the evening: its speed at 18:00 against a free road.
  function peakSpeed(record) {
    const game = state.game;
    const n = record.loop ? record.stops.length : record.stops.length - 1;
    if (n <= 0) return 100;
    let load = 0;
    for (let i = 0; i < n; i += 1) load += core.legLoad(game, record.stops[i], record.stops[(i + 1) % record.stops.length]);
    const slow = 1 + core.paceOf("bus").peakSlowdown * core.peak(18) * (load / n);
    return Math.round(100 / slow);
  }

  // On a pot a bus or BRT line needs a bus depot within eight tiles when the
  // plan is laid; the plan can be drawn without one.
  function needsDepot(record) {
    const game = state.game;
    if (!core.isPot(game) || !core.isRoad(core.modeOfLine(record))) return false;
    const depots = game.city.depots;
    const n = record.loop ? record.stops.length : record.stops.length - 1;
    for (let i = 0; i < n; i += 1) {
      const a = core.station(game, record.stops[i]);
      const b = core.station(game, record.stops[(i + 1) % record.stops.length]);
      const tiles = a && b ? core.legRoute(game, a, b, core.modeOfLine(record)).tiles : null;
      for (let k = 0; tiles && k < tiles.length; k += 2) {
        if (depots.some((d) => Math.max(Math.abs(d.tx - tiles[k]), Math.abs(d.ty - tiles[k + 1])) <= 8)) return false;
      }
    }
    return true;
  }

  function renderLinebar() {
    const game = state.game;
    const id = state.view?.selectedLine();
    const record = game && id ? core.line(game, id) : null;
    if (!record) {
      dom.linebar.hidden = true;
      dom.linebar.textContent = "";
      return;
    }
    const mode = core.modeOfLine(record);
    const road = core.isRoad(mode);
    const trains = game.trains.filter((tr) => tr.lineId === record.id && !tr.retiring);
    const carriages = trains.reduce((n, tr) => n + tr.carriages, 0);
    dom.linebar.hidden = false;
    dom.linebar.textContent = "";
    const swatch = el("canvas", "rootline-swatch");
    requestAnimationFrame(() => paintSwatch(swatch, record.slot, mode));
    const text = road
      ? tf("rootline_line_detail_road", lineLabel(record), record.stops.length, vehiclesLabel(record, trains.length), record.carried)
      : tf("rootline_line_detail", lineLabel(record), record.stops.length, vehiclesLabel(record, trains.length), carriages, record.carried);
    const label = el("span", "rootline-linebar-label", text);
    const avail = core.available(game);
    const add = button("", tf(road ? "rootline_add_bus" : "rootline_add_train"), () => run({ type: "train.add", lineId: record.id }));
    add.disabled = road ? avail.buses <= 0 : avail.trains <= 0;
    const remove = button("", tf(road ? "rootline_remove_bus" : "rootline_remove_train"), () => run({ type: "train.remove", lineId: record.id }));
    remove.disabled = trains.length === 0;
    const parts = [swatch, label, add, remove];
    if (!road) {
      const car = button("", tf("rootline_add_carriage"), () => run({ type: "carriage.add", lineId: record.id }));
      car.disabled = avail.carriages <= 0 || trains.length === 0;
      parts.push(car);
    } else if (mode === "bus" && game.modes.includes("brt")) {
      parts.push(button("rootline-upgrade", tf("rootline_to_brt"), () => run({ type: "line.mode", lineId: record.id, mode: "brt" })));
    } else if (mode === "brt") {
      parts.push(button("", tf("rootline_to_bus"), () => run({ type: "line.mode", lineId: record.id, mode: "bus" })));
    }
    const demolish = button("rootline-demolish", tf("rootline_remove_line"), () => run({ type: "line.remove", lineId: record.id }));
    const done = button("", tf("rootline_done"), () => selectLine(0));
    parts.push(demolish, done);
    dom.linebar.append(...parts);
    const notes = [];
    if (mode === "bus") notes.push(tf("rootline_peak_speed", peakSpeed(record)));
    if (needsDepot(record)) notes.push(tf("rootline_depot_hint"));
    if (notes.length) dom.linebar.append(el("span", "rootline-linebar-note", notes.join(" · ")));
  }

  // ----- station card ---------------------------------------------------------

  function openCard(id) {
    state.card = id;
    renderCard();
  }

  function closeCard() {
    state.card = 0;
    if (dom.card) {
      dom.card.hidden = true;
      dom.card.textContent = "";
    }
  }

  function renderCard() {
    const game = state.game;
    const s = game && state.card ? core.station(game, state.card) : null;
    if (!s) return closeCard();
    dom.card.hidden = false;
    dom.card.textContent = "";
    const head = el("div", "rootline-card-head");
    head.append(glyph(s.kind, 18), el("strong", "", stationLabel(s)));
    if (s.interchange) head.append(el("span", "rootline-card-tag", tf("rootline_interchange")));
    const close = button("rootline-card-close", "×", () => closeCard());
    close.setAttribute("aria-label", tf("close"));
    head.append(close);
    dom.card.append(head);
    // A pot's station says what it is: its kind, and whether the city
    // already has a station there.
    if (s.name) {
      const site = game.city.sites[s.site];
      dom.card.append(el("p", "rootline-card-kind", site?.existing ? tf("rootline_card_existing", tf(`rootline_kind_${s.kind}`)) : tf(`rootline_kind_${s.kind}`)));
    }
    const cap = core.capacityOf(s);
    const waiting = el("p", "rootline-card-waiting", tf("rootline_card_waiting", s.waiting.length, cap));
    const served = el("p", "", tf("rootline_card_served", s.served));
    const lines = game.lines.filter((l) => l.stops.includes(s.id));
    const through = el("p", "", lines.length ? tf("rootline_card_lines", lines.map(lineLabel)) : tf("rootline_card_unserved"));
    dom.card.append(waiting, served, through);
    // Taking a stop off a line is the one edit a drag cannot express.
    for (const record of lines) {
      const stops = record.stops.filter((id) => id !== s.id);
      const leave = button("rootline-card-leave", tf("rootline_leave_line", lineLabel(record)), () => {
        if (stops.length < 2 || (record.loop && stops.length < 3 && stops.length >= 2)) {
          run(stops.length < 2 ? { type: "line.remove", lineId: record.id } : { type: "line.set", lineId: record.id, stops, loop: false });
        } else {
          run({ type: "line.set", lineId: record.id, stops, loop: record.loop });
        }
        renderCard();
      });
      dom.card.append(leave);
    }
    if (!s.interchange) {
      const avail = core.available(game);
      const upgrade = button("", tf("rootline_upgrade", avail.interchanges), () => run({ type: "station.interchange", stationId: s.id }));
      upgrade.disabled = avail.interchanges <= 0;
      dom.card.append(upgrade);
    }
    positionCard();
  }

  function positionCard() {
    if (!state.card || dom.card.hidden) return;
    const game = state.game;
    const s = game && core.station(game, state.card);
    if (!s) return closeCard();
    const p = state.view.stationScreen(s.id);
    if (!p) return;
    const map = dom.map.getBoundingClientRect();
    const box = dom.card.getBoundingClientRect();
    const left = Math.min(map.width - box.width - 8, Math.max(8, p.x + 22));
    const top = Math.min(map.height - box.height - 8, Math.max(8, p.y - box.height / 2));
    // The card follows the cursor, so its coordinates are per-instance values;
    // `.rootline-card` owns the rule that places it.
    dom.card.style.setProperty("--rootline-card-x", `${Math.round(left)}px`);
    dom.card.style.setProperty("--rootline-card-y", `${Math.round(top)}px`);
    const waitingLine = dom.card.querySelector(".rootline-card-waiting");
    if (waitingLine) waitingLine.textContent = tf("rootline_card_waiting", s.waiting.length, core.capacityOf(s));
  }

  // ----- keyboard ---------------------------------------------------------------

  function onKey(event) {
    if (document.querySelector(".window.is-active")?.dataset.window !== "rootline") return;
    // Any key ends the opening transition early.
    state.view?.cutIntro();
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
    if (event.key === " " && state.screen === "play") {
      event.preventDefault();
      togglePause();
    } else if (["1", "2", "3"].includes(event.key) && state.screen === "play") {
      cycleSpeed(Number(event.key));
    } else if ((event.key === "m" || event.key === "M") && state.screen === "play" && state.game) {
      // M for mode: 1, 2 and 3 are the speeds.
      cycleDrawMode();
    } else if (event.key === "Escape" && state.screen === "pots") {
      closePicker();
    } else if (event.key === "Escape") {
      state.view?.cancelGesture();
      closeCard();
      selectLine(0);
    }
  }

  // ----- the application ---------------------------------------------------------

  installRootlineWindow();

  function attachRootline() {
    installRootlineWindow();
    build();
    syncHostContract(state.built ? "ready" : "loading");
    syncVisibility();
  }

  // Whatever ClioTalk is doing for the writer comes first: while it works, the
  // city holds its breath (spec §6).
  window.AISystem6AssistantActivity?.subscribe?.(() => {
    const busy = BUSY.has(window.AISystem6AssistantActivity.getState?.()?.state);
    if (busy === state.pause.assistant) return;
    state.pause.assistant = busy;
    if (busy && state.screen === "play") toast(tf("rootline_toast_assistant"));
    renderHud();
  });

  document.addEventListener("visibilitychange", () => { if (state.built) syncVisibility(); });

  window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.("rootline", {
    onSuspend: () => {
      state.pause.hidden = true;
      state.view?.cancelGesture();
      stopLoop();
    },
    onResume: () => {
      if (!state.built) return;
      syncVisibility();
    },
    onDispose: () => {
      stopLoop();
      state.audio?.close?.().catch(() => {});
      state.audio = null;
    },
  });

  const item = (command, labelKey) => ({ type: "item", action: `rootline-${command}`, labelKey, conditionId: `rootline-${command}` });
  const separator = { type: "separator" };
  window.AISystem6RegisterApplicationMenuSet?.("rootline", [
    {
      id: "file",
      labelKey: "menu_file",
      items: [
        item("new-city", "rootline_menu_new_city"),
        item("open-pot", "rootline_menu_open_pot"),
        item("return-pot", "rootline_menu_return_pot"),
        item("save-plan", "rootline_menu_save_plan"),
        item("restart", "rootline_menu_restart"),
        separator,
        { type: "item", action: "close-active-window", labelKey: "close", shortcutId: "close-window", conditionId: "close-active-window" },
      ],
    },
    {
      id: "game",
      labelKey: "rootline_menu_game",
      items: [
        item("pause", "rootline_menu_pause"),
        item("speed", "rootline_menu_speed"),
        separator,
        item("mode-classic", "rootline_menu_mode_classic"),
        item("mode-endless", "rootline_menu_mode_endless"),
        separator,
        item("sound", "rootline_menu_sound"),
        item("recenter", "rootline_menu_recenter"),
      ],
    },
  ]);
  const MENU = {
    "new-city": () => { state.seed = newSeed(); state.nurseryName = null; state.startModes = ["metro"]; showStart(); },
    "open-pot": () => openPotPicker(),
    "return-pot": () => returnToPot(),
    "save-plan": () => saveTransitPlan(),
    restart: () => startGame(state.seed),
    pause: () => togglePause(),
    speed: () => cycleSpeed(),
    "mode-classic": () => { state.mode = "classic"; writeJson(PREFS_KEY, { ...readJson(PREFS_KEY, {}), mode: "classic" }); showStart(); },
    "mode-endless": () => { state.mode = "endless"; writeJson(PREFS_KEY, { ...readJson(PREFS_KEY, {}), mode: "endless" }); showStart(); },
    sound: () => {
      state.sound = !state.sound;
      writeJson(PREFS_KEY, { ...readJson(PREFS_KEY, {}), sound: state.sound });
      toast(tf(state.sound ? "rootline_sound_on" : "rootline_sound_off"));
      if (state.sound) audio();
    },
    recenter: () => state.view?.resetCamera(),
  };
  Object.entries(MENU).forEach(([command, handler]) => {
    window.AISystem6Runtime?.registerCommand?.(`rootline-${command}`, {
      handler: () => {
        if (!state.built) attachRootline();
        handler();
      },
      isAvailable: () => {
        const active = document.querySelector(".window.is-active");
        if (active?.dataset.window !== "rootline") return false;
        if (command === "pause") return state.screen === "play" && !state.game?.planning;
        if (command === "restart") return Boolean(state.game);
        if (command === "return-pot") return Boolean(state.pot?.cityId);
        if (command === "open-pot") return state.screen !== "pots";
        if (command === "save-plan") return Boolean(state.pot?.cityId) && Boolean(state.game?.lines?.length);
        return true;
      },
      unavailableReason: () => {
        const active = document.querySelector(".window.is-active");
        return active?.dataset.window !== "rootline"
          ? "balloon_disabled_menu_host_window"
          : "balloon_disabled_menu_context";
      },
    });
  });

  // Language switch: every string the shell painted is drawn again.
  window.renderRootline = () => {
    if (!state.built) return;
    if (dom.slots) dom.slots.dataset.signature = "";
    if (dom.routes) dom.routes.dataset.signature = "";
    if (dom.stock) dom.stock.dataset.signature = "";
    if (dom.transit) dom.transit.dataset.signature = "";
    renderHud();
    renderLinebar();
    if (state.card) renderCard();
    if (state.hint) setHint(state.hint, state.hintUntil ? Math.max(1, state.hintUntil - performance.now()) : 0, ...state.hintArgs);
    if (state.screen === "pots") closePicker();
    else if (state.screen === "start") showStart();
    else if (state.screen === "play" && state.game?.reward) showReward();
    else if (state.screen === "over") {
      state.screen = "play";
      finish();
    }
  };

  // A pot handed over from Bonsai City (world hand-over v2), or a
  // neighbouring pot opened as a nursery: either opens now when the window
  // is up, or as soon as it is built.
  function queue(entry) {
    if (state.built) return entry.kind === "pot" ? openPot(entry.payload) : openNursery(entry.seed, entry.name);
    state.queued = entry;
    return true;
  }

  window.AISystem6Rootline = Object.freeze({
    attach: attachRootline,
    queuePot: (payload) => queue({ kind: "pot", payload }),
    queueNursery: ({ seed, name } = {}) => queue({ kind: "nursery", seed: seed ?? newSeed(), name }),
    // For the contract and for anyone checking a result by hand.
    snapshot: () => (state.game ? { seed: state.seed, source: core.isPot(state.game) ? state.game.city.key : state.seed, mode: state.game.mode, modes: state.game.modes || null, tick: state.game.tick, delivered: state.game.delivered, hash: core.hashGame(state.game), screen: state.screen, planning: Boolean(state.game.planning), drawMode: state.drawMode } : null),
    // How the last opening transition ran, frame by frame (instruments read it).
    introStats: () => state.view?.introStats() || null,
    // A copy of the whole state, for inspection; changing it changes nothing.
    inspect: () => (state.game ? JSON.parse(JSON.stringify(state.game)) : null),
    // Where a station is drawn, in map-relative CSS pixels (for instruments
    // that play through real pointer drags).
    stationScreen: (id) => {
      const p = state.view?.stationScreen(id);
      return p ? { x: p.x, y: p.y } : null;
    },
  });
  window.AISystem6Runtime?.registerApplication({id:"rootline",windowName:"rootline",mount:attachRootline,restore:attachRootline,commands:{"open-rootline":{handler:()=>openWindow("rootline"),isAvailable:()=>!0}}});
})();
