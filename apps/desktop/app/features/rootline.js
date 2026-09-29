// Feature module: Rootline / 根线 — the second original game.
//
// The shell: the window, its bars and overlays, the menus, the sound and the
// pace. The rules live in rootline-core.js (headless, deterministic); the map
// and the gestures in rootline-view.js (reads the state, issues commands).
// This file owns the seed, the clock that drives the core, and everything the
// player reads around the map.
//
// Spec: internal/plans/TRANSIT-GAME-SPEC.zh-CN.md (§2, §5, §6, §8b).
window.AISystem6RootlineLoaded = true;

(function initRootlineFeature() {
  "use strict";

  const core = window.AISystem6RootlineCore;
  const View = window.AISystem6RootlineView;
  const BEST_KEY = "ais6.rootline.best";
  const PREFS_KEY = "ais6.rootline.prefs";
  const STEP = 1 / core.RULES.ticksPerSecond;
  const BUSY = new Set(["reading", "working", "waiting"]);

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

  function cityLabel(game) {
    const lang = typeof currentLanguage === "string" ? currentLanguage : "zh";
    return lang === "en" ? game.city.name.en : game.city.name.zh;
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
  function paintSwatch(canvas, slot) {
    const width = 34;
    const height = 14;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const c = canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, width, height);
    View.strokeLine(c, [{ x: 5, y: height / 2 }, { x: width - 5, y: height / 2 }], slot, 5.5, look(canvas));
  }

  function look(node) {
    const style = window.getComputedStyle(node);
    return {
      mono: (document.body.dataset.theme || "classic") === "classic",
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
  };

  function icon(name) {
    const span = el("span", `rootline-icon rootline-icon-${name}`);
    span.innerHTML = ICONS[name];
    return span;
  }

  // ----- sound --------------------------------------------------------------
  //
  // Each line has a pitch; a train arriving plays it softly, so a busy network
  // sounds fuller than a quiet one (spec §5). Synthesised here, sampled from
  // nothing.

  const PITCHES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];

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
      tone(PITCHES[slot % PITCHES.length], { gain: 0.035, length: 0.22 });
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

  function installRootlineWindow() {
    if (typeof document === "undefined") return;
    if (document.querySelector('[data-window="rootline"]')) return;
    window.AISystem6ApplicationShell.createWindow({
      windowName: "rootline",
      windowClass: "rootline-window",
      labelledBy: "rootline-title",
      titleKey: "rootline_title",
      title: tf("rootline_title"),
      paneClass: "rootline-pane",
    });
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
    dom.slots = el("div", "rootline-slots");
    dom.stock = el("div", "rootline-stock");
    dom.linebar = el("div", "rootline-linebar");
    dom.linebar.hidden = true;
    dom.bottom.append(dom.slots, dom.stock, dom.linebar);

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
      },
    });

    // Keys belong to the game whenever its window is in front, wherever the
    // focus happens to sit (the start button that had it is gone by then).
    document.addEventListener("keydown", onKey);
    dom.canvas.tabIndex = 0;
    state.observer = new MutationObserver(syncVisibility);
    state.observer.observe(win, { attributes: true, attributeFilter: ["class"] });
    if (typeof ResizeObserver === "function") {
      state.resizeObserver = new ResizeObserver(() => state.view?.resize());
      state.resizeObserver.observe(dom.map);
    }
    const prefs = readJson(PREFS_KEY, {});
    state.sound = prefs.sound !== false;
    state.mode = prefs.mode === "endless" ? "endless" : "classic";
    state.seed = newSeed();
    showStart();
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
    const result = core.apply(state.game, command);
    if (!result.ok) {
      reject(result.reason);
      return result;
    }
    if (command.type === "line.create" || command.type === "line.set") {
      sounds.build();
      if (state.hint === "first") setHint("second", 9000);
    }
    if (command.type === "line.create") {
      const record = state.game.lines[state.game.lines.length - 1];
      if (record && !state.game.trains.some((tr) => tr.lineId === record.id)) toast(tf("rootline_toast_no_train"));
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

  function setHint(kind, ms) {
    state.hint = kind;
    state.hintUntil = ms ? performance.now() + ms : 0;
    if (!dom.hint) return;
    dom.hint.hidden = !kind;
    dom.hint.textContent = kind ? tf(`rootline_hint_${kind}`) : "";
  }

  // ----- screens ------------------------------------------------------------

  function overlay(className, children) {
    dom.overlay.hidden = false;
    dom.overlay.className = `rootline-overlay ${className}`;
    dom.overlay.textContent = "";
    const panel = el("div", "rootline-panel");
    panel.append(...children);
    dom.overlay.append(panel);
    return panel;
  }

  function hideOverlay() {
    dom.overlay.hidden = true;
    dom.overlay.textContent = "";
  }

  function bestFor(seed, mode) {
    const all = readJson(BEST_KEY, {});
    return all[`${mode}:${seed}`] || null;
  }

  function showStart() {
    state.screen = "start";
    closeCard();
    // A city appears behind the panel before the game starts, so the
    // choice is about something visible.
    state.game = core.createGame({ seed: state.seed, mode: state.mode });
    state.view.reset();
    state.eventTick = 0;
    const title = el("h3", "rootline-start-title", tf("rootline_title"));
    const tag = el("p", "rootline-start-tag", tf("rootline_tagline"));
    const city = el("div", "rootline-start-city");
    const name = el("strong", "", cityLabel(state.game));
    const number = el("span", "rootline-start-number", `#${state.seed}`);
    city.append(el("span", "", tf("rootline_city")), name, number, button("rootline-reroll", tf("rootline_new_city"), () => {
      state.seed = newSeed();
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
    const best = bestFor(state.seed, state.mode);
    const bestLine = el("p", "rootline-best", best ? tf("rootline_best", best.delivered, best.week) : tf("rootline_best_none"));
    const how = el("ol", "rootline-how");
    for (const key of ["rootline_how_draw", "rootline_how_edit", "rootline_how_peaks", "rootline_how_week"]) how.append(el("li", "", tf(key)));
    const start = button("rootline-start default", tf("rootline_start"), () => startGame());
    overlay("is-start", [title, tag, city, modes, modeNote, bestLine, how, start]);
    requestAnimationFrame(() => start.focus({ preventScroll: true }));
    renderHud();
    startLoop();
  }

  function startGame(seed = state.seed) {
    state.seed = seed;
    state.game = core.createGame({ seed, mode: state.mode });
    state.view.reset();
    state.eventTick = 0;
    state.crowdWarned.clear();
    state.pause.user = false;
    state.screen = "play";
    hideOverlay();
    closeCard();
    selectLine(0);
    setHint("first");
    renderHud();
    startLoop();
    dom.canvas.focus?.({ preventScroll: true });
  }

  const REWARD_ICON = { line: "line", carriage: "carriage", tunnel: "tunnel", interchange: "interchange" };

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
    choices.querySelector("button")?.focus({ preventScroll: true });
  }

  function recordBest(game) {
    const all = readJson(BEST_KEY, {});
    const key = `${game.mode}:${state.seed}`;
    const week = core.clock(game.tick).week;
    const previous = all[key];
    const better = !previous || game.delivered > previous.delivered;
    if (better) {
      all[key] = { delivered: game.delivered, week, city: game.city.name };
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
    const cause = el("p", "rootline-over-cause", tf("rootline_over_cause", tf(`rootline_kind_${s?.kind || "residential"}`)));
    const stats = el("dl", "rootline-stats");
    const stat = (label, value) => stats.append(el("dt", "", label), el("dd", "", value));
    stat(tf("rootline_stat_delivered"), String(game.delivered));
    stat(tf("rootline_stat_lasted"), tf("rootline_stat_lasted_value", ck.week, tf(`rootline_weekday_${ck.weekday}`)));
    stat(tf("rootline_stat_lines"), String(game.lines.length));
    stat(tf("rootline_stat_stations"), String(game.stations.length));
    const best = bestFor(state.seed, game.mode);
    const bestLine = el("p", "rootline-best", better ? tf("rootline_new_record") : best ? tf("rootline_best", best.delivered, best.week) : "");
    const again = button("rootline-again default", tf("rootline_again"), () => startGame(state.seed));
    const other = button("rootline-other", tf("rootline_new_city"), () => { state.seed = newSeed(); showStart(); });
    const actions = el("div", "rootline-actions");
    actions.append(other, again);
    // Leave the stopped map readable for a moment before the panel covers it.
    setTimeout(() => {
      if (state.game !== game) return;
      overlay("is-over", [title, cause, stats, bestLine, actions]);
      again.focus({ preventScroll: true });
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
    dom.day.textContent = tf("rootline_day_label", ck.week, tf(`rootline_weekday_${ck.weekday % WEEKDAYS}`));
    dom.time.textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const period = core.periodOf(ck.hour);
    dom.period.textContent = period === "day" ? "" : tf(`rootline_period_${period}`);
    dom.period.dataset.period = period;
    // Position along the day track is a per-instance value; the rule that
    // turns it into a position stays in `.rootline-dayline-cursor`.
    dom.dayCursor.style.setProperty("--rootline-day-x", `${(ck.hour / 24) * 100}%`);
    dom.city.textContent = cityLabel(game);
    dom.delivered.textContent = String(game.delivered);
    dom.score.title = tf("rootline_stat_delivered");
    const pausedNow = state.pause.user || state.pause.assistant;
    dom.pauseButton.textContent = pausedNow ? tf("rootline_resume") : tf("rootline_pause");
    dom.pauseButton.disabled = state.screen !== "play";
    dom.speedButton.textContent = `${state.speed}×`;
    dom.speedButton.title = tf("rootline_speed");
    dom.canvas.setAttribute("aria-label", tf("rootline_map_label", cityLabel(game), ck.week, game.delivered));
    renderSlots();
    renderStock();
    if (state.hint && state.hintUntil && performance.now() > state.hintUntil) setHint("");
  }

  function renderSlots() {
    const game = state.game;
    const avail = core.available(game);
    const signature = JSON.stringify([game.lines.map((l) => [l.slot, l.id]), game.owned.lines, state.view.selectedLine(), game.trains.length, document.body.dataset.theme]);
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
        item.classList.add("is-used");
        if (state.view.selectedLine() === record.id) item.classList.add("is-selected");
        const trains = game.trains.filter((tr) => tr.lineId === record.id && !tr.retiring).length;
        item.append(el("span", "rootline-slot-count", String(trains)));
        item.title = tf("rootline_line_name", slot + 1);
        item.setAttribute("aria-label", tf("rootline_line_summary", slot + 1, record.stops.length, trains));
        item.addEventListener("click", () => selectLine(state.view.selectedLine() === record.id ? 0 : record.id));
        requestAnimationFrame(() => paintSwatch(swatch, slot));
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

  function renderStock() {
    const avail = core.available(state.game);
    const signature = JSON.stringify(avail);
    if (dom.stock.dataset.signature === signature) return;
    dom.stock.dataset.signature = signature;
    dom.stock.textContent = "";
    for (const [name, value] of [["train", avail.trains], ["carriage", avail.carriages], ["tunnel", avail.tunnels], ["interchange", avail.interchanges]]) {
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
    if (state.game) renderSlots();
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
    const trains = game.trains.filter((tr) => tr.lineId === record.id && !tr.retiring);
    const carriages = trains.reduce((n, tr) => n + tr.carriages, 0);
    dom.linebar.hidden = false;
    dom.linebar.textContent = "";
    const swatch = el("canvas", "rootline-swatch");
    requestAnimationFrame(() => paintSwatch(swatch, record.slot));
    const label = el("span", "rootline-linebar-label", tf("rootline_line_detail", record.slot + 1, record.stops.length, trains.length, carriages, record.carried));
    const avail = core.available(game);
    const add = button("", tf("rootline_add_train"), () => run({ type: "train.add", lineId: record.id }));
    add.disabled = avail.trains <= 0;
    const remove = button("", tf("rootline_remove_train"), () => run({ type: "train.remove", lineId: record.id }));
    remove.disabled = trains.length === 0;
    const car = button("", tf("rootline_add_carriage"), () => run({ type: "carriage.add", lineId: record.id }));
    car.disabled = avail.carriages <= 0 || trains.length === 0;
    const demolish = button("rootline-demolish", tf("rootline_remove_line"), () => run({ type: "line.remove", lineId: record.id }));
    const done = button("", tf("rootline_done"), () => selectLine(0));
    dom.linebar.append(swatch, label, add, remove, car, demolish, done);
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
    head.append(glyph(s.kind, 18), el("strong", "", tf(`rootline_kind_${s.kind}`)));
    if (s.interchange) head.append(el("span", "rootline-card-tag", tf("rootline_interchange")));
    const close = button("rootline-card-close", "×", () => closeCard());
    close.setAttribute("aria-label", tf("close"));
    head.append(close);
    const cap = core.capacityOf(s);
    const waiting = el("p", "", tf("rootline_card_waiting", s.waiting.length, cap));
    const served = el("p", "", tf("rootline_card_served", s.served));
    const lines = game.lines.filter((l) => l.stops.includes(s.id));
    const through = el("p", "", lines.length ? tf("rootline_card_lines", lines.map((l) => l.slot + 1)) : tf("rootline_card_unserved"));
    dom.card.append(head, waiting, served, through);
    // Taking a stop off a line is the one edit a drag cannot express.
    for (const record of lines) {
      const stops = record.stops.filter((id) => id !== s.id);
      const leave = button("rootline-card-leave", tf("rootline_leave_line", record.slot + 1), () => {
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
    const waitingLine = dom.card.querySelector("p");
    if (waitingLine) waitingLine.textContent = tf("rootline_card_waiting", s.waiting.length, core.capacityOf(s));
  }

  // ----- keyboard ---------------------------------------------------------------

  function onKey(event) {
    if (document.querySelector(".window.is-active")?.dataset.window !== "rootline") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
    if (event.key === " " && state.screen === "play") {
      event.preventDefault();
      togglePause();
    } else if (["1", "2", "3"].includes(event.key) && state.screen === "play") {
      cycleSpeed(Number(event.key));
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
    "new-city": () => { state.seed = newSeed(); showStart(); },
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
        if (command === "pause") return state.screen === "play";
        if (command === "restart") return Boolean(state.game);
        return true;
      },
    });
  });

  // Language switch: every string the shell painted is drawn again.
  window.renderRootline = () => {
    if (!state.built) return;
    if (dom.slots) dom.slots.dataset.signature = "";
    if (dom.stock) dom.stock.dataset.signature = "";
    renderHud();
    renderLinebar();
    if (state.card) renderCard();
    if (state.hint) setHint(state.hint, Math.max(0, state.hintUntil - performance.now()));
    if (state.screen === "start") showStart();
    else if (state.screen === "play" && state.game?.reward) showReward();
    else if (state.screen === "over") {
      state.screen = "play";
      finish();
    }
  };

  window.AISystem6Rootline = Object.freeze({
    attach: attachRootline,
    // For the contract and for anyone checking a result by hand.
    snapshot: () => (state.game ? { seed: state.seed, mode: state.game.mode, tick: state.game.tick, delivered: state.game.delivered, hash: core.hashGame(state.game), screen: state.screen } : null),
    // A copy of the whole state, for inspection; changing it changes nothing.
    inspect: () => (state.game ? JSON.parse(JSON.stringify(state.game)) : null),
  });
  window.AISystem6Runtime?.registerApplication({id:"rootline",windowName:"rootline",mount:attachRootline,restore:attachRootline,commands:{"open-rootline":{handler:()=>openWindow("rootline"),isAvailable:()=>!0}}});
})();
