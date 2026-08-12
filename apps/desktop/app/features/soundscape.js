(function initSoundscapeFeature() {
  "use strict";

  const STORAGE_KEY = "ai-system-6-soundscape-v1";
  const SCHEMA_VERSION = 2;
  const MAX_SAVED_MOMENTS = 48;
  const SYSTEM_POLL_MS = 1500;
  const GAMDL_POLL_MS = 1500;
  const REPEAT_MODES = Object.freeze(["off", "all", "one"]);
  const PANELS = Object.freeze(["queue", "style", "saved"]);
  const STYLE_PRESETS = Object.freeze({
    standard: Object.freeze({ x: 50, y: 54, intensity: 24 }),
    coldMist: Object.freeze({ x: 22, y: 74, intensity: 42 }),
    warmWood: Object.freeze({ x: 78, y: 65, intensity: 48 }),
    nightSail: Object.freeze({ x: 31, y: 28, intensity: 58 }),
    sunlight: Object.freeze({ x: 84, y: 82, intensity: 56 }),
    pulse: Object.freeze({ x: 68, y: 14, intensity: 76 }),
  });

  // The field draws a 34px grid over a 240px square, so seven bands per axis
  // put every name change on a line the user can already see. Each cell is a
  // real colour - hue from x, contour density from y - so it gets a real name
  // instead of a coordinate. The six preset buttons are six landmarks on this
  // chart, not a separate vocabulary: their coordinates land on their own
  // cells, and they keep their existing translation keys.
  const CHART_BANDS = 7;
  const CHART_CELLS = Object.freeze([
    // Row 1: densest contours, hardest colour.
    ["cell_deep_sea", "cell_ink_blue", "cell_graphite", "cell_type_metal", "style_pulse", "cell_ochre", "cell_ember"],
    ["cell_indigo", "cell_whetstone", "style_night_sail", "cell_charcoal", "cell_sealing_wax", "cell_brass", "cell_rust"],
    ["cell_ice_lake", "cell_celadon", "cell_glass", "cell_inkstone", "cell_kraft", "cell_resin", "cell_amber"],
    ["cell_steel", "cell_slate", "cell_lead", "style_standard", "cell_hemp", "cell_leather", "cell_honey"],
    ["cell_snow_blue", "cell_washed_blue", "cell_thin_smoke", "cell_linen", "cell_bone", "style_warm_wood", "cell_hay"],
    ["cell_thin_ice", "style_cold_mist", "cell_moonlight", "cell_xuan_paper", "cell_oat", "style_sunlight", "cell_dusk"],
    // Row 7: sparsest contours, closest to paper.
    ["cell_frost", "cell_breath", "cell_mica", "cell_chalk", "cell_eggshell", "cell_fine_sand", "cell_almond"],
  ].map((row) => Object.freeze(row.map((key) => `soundscape_${key}`))));

  const ENTER_SCENE_STEPS = Object.freeze([
    Object.freeze({ key: "soundscape_style_whisper", fallback: "Touch" }),
    Object.freeze({ key: "soundscape_style_present", fallback: "Present" }),
    Object.freeze({ key: "soundscape_style_around", fallback: "Around" }),
    Object.freeze({ key: "soundscape_style_immersive", fallback: "Immersed" }),
  ]);

  const localAudio = new Audio();
  localAudio.preload = "metadata";
  const sessionLocalUrls = new Map();

  let initialized = false;
  let runtimeInitialized = false;
  let systemMusicConnected = false;
  let systemRequestInFlight = false;
  let systemPollTimer = 0;
  let styleDragging = false;
  let lastProgressRender = 0;
  let searchResults = [];
  let gamdlJobTimer = 0;
  let activeGamdlJobId = "";
  const playerListeners = new Set();
  let playerNotifyFrame = 0;

  const defaultState = () => ({
    schemaVersion: SCHEMA_VERSION,
    source: "none",
    queue: [],
    currentIndex: -1,
    position: 0,
    volume: 32,
    muted: false,
    shuffle: false,
    shuffleKind: "songs",
    repeat: "off",
    playerState: "stopped",
    activePanel: "queue",
    style: { preset: "standard", ...STYLE_PRESETS.standard },
    saved: [],
    selectedSavedId: "",
    projectLinks: {},
  });

  function clamp(value, min = 0, max = 100) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  const SHUFFLE_KINDS = Object.freeze(["songs", "albums", "groupings"]);

  function normalizeShuffleKind(value) {
    return SHUFFLE_KINDS.includes(value) ? value : "songs";
  }

  function normalizeRepeat(value) {
    return REPEAT_MODES.includes(value) ? value : "off";
  }

  function normalizeStyle(style, invertLegacyY = false) {
    const fallback = STYLE_PRESETS.standard;
    const y = clamp(style?.y ?? fallback.y);
    return {
      preset: style?.preset || "standard",
      x: Math.round(clamp(style?.x ?? fallback.x)),
      y: Math.round(invertLegacyY ? 100 - y : y),
      intensity: Math.round(clamp(style?.intensity ?? fallback.intensity)),
    };
  }

  function normalizeSource(value) {
    return value === "apple" ? "system" : value;
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return defaultState();
      const fallback = defaultState();
      const legacyStyleAxis = Number(parsed.schemaVersion) < SCHEMA_VERSION;
      const queue = Array.isArray(parsed.queue)
        ? parsed.queue.map((item) => ({
          ...item,
          source: normalizeSource(item.source),
          unavailable: item.source === "local",
        }))
        : [];
      const saved = Array.isArray(parsed.saved)
        ? parsed.saved.slice(0, MAX_SAVED_MOMENTS).map((moment) => ({
          ...moment,
          source: normalizeSource(moment.source),
          repeat: normalizeRepeat(moment.repeat),
          style: normalizeStyle(moment.style, legacyStyleAxis),
          queue: Array.isArray(moment.queue)
            ? moment.queue.map((item) => ({ ...item, source: normalizeSource(item.source) }))
            : [],
        }))
        : [];
      return {
        ...fallback,
        ...parsed,
        schemaVersion: SCHEMA_VERSION,
        source: normalizeSource(parsed.source),
        queue,
        saved,
        repeat: normalizeRepeat(parsed.repeat),
        muted: Boolean(parsed.muted),
        shuffle: Boolean(parsed.shuffle),
        shuffleKind: normalizeShuffleKind(parsed.shuffleKind),
        activePanel: PANELS.includes(parsed.activePanel) ? parsed.activePanel : "queue",
        style: normalizeStyle(parsed.style, legacyStyleAxis),
        projectLinks: parsed.projectLinks && typeof parsed.projectLinks === "object" ? parsed.projectLinks : {},
      };
    } catch {
      return defaultState();
    }
  }

  let state = loadState();

  function ui(id) {
    return document.getElementById(id);
  }

  function translate(key, fallback, ...args) {
    if (typeof t !== "function") return fallback;
    const value = t(key, ...args);
    return value && value !== key ? value : fallback;
  }

  function setStatus(message) {
    const target = ui("soundscape-status");
    if (target) target.textContent = message;
  }

  function safeId() {
    return window.crypto?.randomUUID?.() || `soundscape-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  // System 6 has no slider. Position uses a dithered scroll-bar track and level
  // uses the Sound control panel's segment cells, so both are drawn here rather
  // than delegated to a browser-native range input. Both keep role="slider",
  // aria-valuenow, and full keyboard control.

  // Pointer capture throws when the id is no longer active; a dropped capture
  // must not abort the drag handler.
  function capturePointer(element, pointerId) {
    try {
      element.setPointerCapture?.(pointerId);
    } catch {
      /* the drag still works without capture */
    }
  }

  function releasePointer(element, pointerId) {
    try {
      element.releasePointerCapture?.(pointerId);
    } catch {
      /* already released */
    }
  }

  function isControlDisabled(element) {
    return element.getAttribute("aria-disabled") === "true";
  }

  function pointerRatio(element, event) {
    const rect = element.getBoundingClientRect();
    if (!rect.width) return 0;
    return clamp(((event.clientX - rect.left) / rect.width) * 100) / 100;
  }

  function bindDragControl(element, handlers) {
    if (!element) return;
    let dragging = false;
    const apply = (event) => handlers.onInput(pointerRatio(element, event));
    element.addEventListener("pointerdown", (event) => {
      if (isControlDisabled(element)) return;
      dragging = true;
      capturePointer(element, event.pointerId);
      apply(event);
    });
    element.addEventListener("pointermove", (event) => {
      if (dragging) apply(event);
    });
    element.addEventListener("pointerup", (event) => {
      if (!dragging) return;
      dragging = false;
      releasePointer(element, event.pointerId);
      handlers.onCommit();
    });
    element.addEventListener("keydown", (event) => {
      if (isControlDisabled(element)) return;
      const step = event.shiftKey ? 0.1 : 0.02;
      const delta = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[event.key];
      const jump = { Home: 0, End: 1 }[event.key];
      if (delta === undefined && jump === undefined) return;
      event.preventDefault();
      handlers.onInput(jump === undefined ? clamp((handlers.ratio() + delta) * 100) / 100 : jump);
      handlers.onCommit();
    });
  }

  function renderTrack(element, ratio) {
    if (!element) return;
    element.style.setProperty("--system-track-position", `${clamp(ratio * 100)}%`);
  }

  function segmentCount(element) {
    return Number(element.dataset.segments) || 12;
  }

  function renderSegments(element, value) {
    if (!element) return;
    const count = segmentCount(element);
    if (element.childElementCount !== count) {
      element.replaceChildren(...Array.from({ length: count }, () => document.createElement("span")));
    }
    const filled = Math.round((clamp(value) / 100) * count);
    Array.from(element.children).forEach((cell, index) => {
      cell.classList.toggle("is-on", index < filled);
    });
    element.setAttribute("aria-valuenow", String(Math.round(clamp(value))));
    element.setAttribute("aria-valuetext", translate("soundscape_level_of", `${filled} of ${count}`, filled, count));
  }

  function segmentValueFromRatio(element, ratio) {
    const count = segmentCount(element);
    const index = Math.min(count, Math.max(0, Math.ceil(ratio * count)));
    return clamp((index / count) * 100);
  }

  function formatDuration(seconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
  }

  function formatMomentTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function serializeQueue(queue = state.queue) {
    return queue.map((item) => ({
      id: item.id,
      source: normalizeSource(item.source),
      persistentId: item.persistentId || "",
      title: item.title || "",
      artist: item.artist || "",
      album: item.album || "",
      artwork: item.artwork || "",
      duration: Number(item.duration) || 0,
      query: item.query || "",
      unavailable: item.source === "local",
    }));
  }

  function persist() {
    const snapshot = {
      ...state,
      schemaVersion: SCHEMA_VERSION,
      position: currentPosition(),
      queue: serializeQueue(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    window.AISystem6ControlStrip?.refreshStrip?.();
    notifyPlayerListeners();
  }

  function currentItem() {
    return state.queue[state.currentIndex] || null;
  }

  function hasQueue() {
    return Boolean(currentItem() || state.queue.length || (state.source === "system" && systemMusicConnected));
  }

  function canSaveMoment() {
    return Boolean(currentItem());
  }

  function selectedMoment() {
    return state.saved.find((moment) => moment.id === state.selectedSavedId) || null;
  }

  function activeProject() {
    if (typeof isProjectMounted !== "undefined" && !isProjectMounted) return null;
    return typeof getActiveProject === "function" ? getActiveProject() : null;
  }

  function canLinkProject() {
    return Boolean(selectedMoment() && activeProject());
  }

  function currentPosition() {
    if (state.source === "local") return Number(localAudio.currentTime) || state.position || 0;
    return state.position || 0;
  }

  function currentDuration() {
    if (state.source === "local") return Number(localAudio.duration) || Number(currentItem()?.duration) || 0;
    return Number(currentItem()?.duration) || 0;
  }

  function isPlaying() {
    if (state.source === "local") return !localAudio.paused && !localAudio.ended;
    if (state.source === "system") return state.playerState === "playing";
    return false;
  }

  function sourceLabel() {
    if (state.source === "system") return translate("soundscape_system_source", "Music on This Mac");
    if (state.source === "local") return translate("soundscape_local_source", "Local Audio");
    if (state.source === "gamdl") return translate("soundscape_gamdl_source", "Apple Music");
    return translate("soundscape_no_source", "No source");
  }

  function updateSourceLabel() {
    const target = ui("soundscape-source");
    if (target) target.textContent = sourceLabel();
  }

  // Names change on a grid line, so a pointer resting exactly on one would
  // flicker between two names. A band is only left once the value is past the
  // shared edge by 1.5%.
  const lastBand = { col: null, row: null, step: null };

  function bandIndex(value, bands, slot) {
    const width = 100 / bands;
    const at = clamp(value);
    const raw = Math.min(bands - 1, Math.max(0, Math.floor(at / width)));
    const prev = lastBand[slot];
    // Only a drag can rest on an edge. A preset button or a restored moment is
    // a jump, and must land on the band it actually names.
    if (!styleDragging || prev === null || prev === raw) {
      lastBand[slot] = raw;
      return raw;
    }
    const edge = Math.max(prev, raw) * width;
    if (Math.abs(at - edge) < 1.5) return prev;
    lastBand[slot] = raw;
    return raw;
  }

  // Read-only band lookup for styles that are not the live one (saved moments).
  function staticBand(value, bands) {
    return Math.min(bands - 1, Math.max(0, Math.floor(clamp(value) / (100 / bands))));
  }

  function cellName(style = state.style, live = false) {
    const col = live ? bandIndex(style.x, CHART_BANDS, "col") : staticBand(style.x, CHART_BANDS);
    const row = live ? bandIndex(style.y, CHART_BANDS, "row") : staticBand(style.y, CHART_BANDS);
    const key = CHART_CELLS[row][col];
    return translate(key, key);
  }

  function enterSceneWord(style = state.style, live = false) {
    const steps = ENTER_SCENE_STEPS.length;
    const index = live
      ? bandIndex(style.intensity, steps, "step")
      : staticBand(style.intensity, steps);
    const step = ENTER_SCENE_STEPS[index];
    return translate(step.key, step.fallback);
  }

  function styleSummary(style = state.style, live = false) {
    return `${cellName(style, live)} · ${enterSceneWord(style, live)}`;
  }

  // The colour name carries no information for a screen reader or a colour
  // blind reader, so the axis words stay alive as the accessible description.
  function styleWords(style = state.style) {
    const temperature = style.x < 38
      ? translate("soundscape_cold", "Cold")
      : style.x > 62
        ? translate("soundscape_warm", "Warm")
        : translate("soundscape_style_neutral", "Neutral");
    const energy = style.y < 34
      ? translate("soundscape_tension", "Tension")
      : style.y > 68
        ? translate("soundscape_calm", "Calm")
        : translate("soundscape_style_focus", "Focused");
    return [temperature, energy, enterSceneWord(style)];
  }

  function styleDescription(style = state.style, live = false) {
    const [temperature, energy] = styleWords(style);
    return `${cellName(style, live)}（${temperature}、${energy}）· ${enterSceneWord(style, live)}`;
  }

  // The swatch walks the same cold -> paper -> warm ramp as the sensory field.
  // Interpolating hue instead would pass through green and disagree with the
  // field the user actually set the value in.
  function mixChannels(from, to, ratio) {
    return from.map((value, index) => Math.round(value + (to[index] - value) * ratio));
  }

  function styleColor(style = state.style) {
    const [red, green, blue] = cellChannels(style);
    return `rgb(${red} ${green} ${blue})`;
  }

  // A flat colour can only report x, so the swatch used to look identical all
  // the way down the neutral column. The swatch is instead a crop of the field
  // at this point - the same hue wash, the same contour density, the same mist
  // - which is what the icon's square viewfinder already promises.
  // One place computes a cell's colour, mirroring the field's own background in
  // styles/88-soundscape.css: cold -> neutral mid -> warm across x, then a
  // lightness wash toward paper down y. If these drift apart, the swatch stops
  // being a crop of the field.
  const FIELD_COLD = Object.freeze([88, 168, 236]);
  const FIELD_MID = Object.freeze([172, 170, 162]);
  const FIELD_WARM = Object.freeze([244, 168, 62]);
  const FIELD_PAPER = Object.freeze([242, 242, 238]);

  function overPaper(channels, alpha) {
    return channels.map((value) => Math.round(255 - alpha * (255 - value)));
  }

  function cellChannels(style = state.style) {
    const across = clamp(style.x) / 100;
    const down = clamp(style.y) / 100;
    const mid = overPaper(FIELD_MID, 0.85);
    const hue = across < 0.5
      ? mixChannels(mid, overPaper(FIELD_COLD, 0.8), 1 - across / 0.5)
      : mixChannels(mid, overPaper(FIELD_WARM, 0.8), (across - 0.5) / 0.5);
    return mixChannels(hue, FIELD_PAPER, 0.85 * down);
  }

  function fieldCrop(style = state.style) {
    const [red, green, blue] = cellChannels(style);
    const down = clamp(style.y) / 100;
    const gap = (5 + 11 * down).toFixed(1);
    const contour = (0.34 - 0.14 * down).toFixed(3);
    return [
      `repeating-linear-gradient(0deg, rgba(16, 17, 20, ${contour}) 0 1px, transparent 1px ${gap}px)`,
      `rgb(${red} ${green} ${blue})`,
    ].join(", ");
  }

  // Enter Scene decides how far the sensory colour reaches into the window:
  // deck fills, then the drawer paper, then the window shell. Each stage is
  // one quarter of the control, so the surface lights up on the same cell the
  // word changes on.
  function reachAt(intensity, from) {
    return Math.min(1, Math.max(0, (clamp(intensity) - from) / 25)).toFixed(3);
  }

  function updateStyleVisuals() {
    const root = document.querySelector(".soundscape-window");
    if (!root) return;
    root.style.setProperty("--ss-field-x", `${state.style.x}%`);
    root.style.setProperty("--ss-field-y", `${state.style.y}%`);
    root.style.setProperty("--ss-crop", fieldCrop());
    root.style.setProperty("--ss-tint", styleColor());
    root.style.setProperty("--ss-reach-deck", reachAt(state.style.intensity, 25));
    root.style.setProperty("--ss-reach-drawer", reachAt(state.style.intensity, 50));
    root.style.setProperty("--ss-reach-frame", reachAt(state.style.intensity, 75));

    const words = ui("soundscape-style-words");
    if (words) {
      words.textContent = styleSummary(state.style, true);
      words.setAttribute("aria-label", styleDescription(state.style, true));
    }
    const field = ui("soundscape-style-field");
    if (field) field.setAttribute("aria-valuetext", styleDescription(state.style, true));
    renderSegments(ui("soundscape-intensity"), state.style.intensity);
    document.querySelectorAll("[data-soundscape-style]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.soundscapeStyle === state.style.preset);
    });
  }

  function setStyle(nextStyle, persistNow = true) {
    state.style = normalizeStyle({ ...state.style, ...nextStyle });
    updateStyleVisuals();
    if (persistNow) persist();
  }

  function applyStylePreset(presetName) {
    const preset = STYLE_PRESETS[presetName];
    if (!preset) return;
    setStyle({ preset: presetName, ...preset });
  }

  function resetStyle() {
    applyStylePreset("standard");
  }

  function styleFromPointer(event) {
    const field = ui("soundscape-style-field");
    if (!field) return;
    const rect = field.getBoundingClientRect();
    setStyle({
      preset: "custom",
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
      intensity: state.style.intensity,
    }, false);
  }

  function setActivePanel(panelName, focusTab = false, persistNow = true) {
    const nextPanel = PANELS.includes(panelName) ? panelName : "queue";
    state.activePanel = nextPanel;
    document.querySelectorAll("[data-soundscape-panel-target]").forEach((button) => {
      const active = button.dataset.soundscapePanelTarget === nextPanel;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focusTab) button.focus();
    });
    document.querySelectorAll("[data-soundscape-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.soundscapePanel !== nextPanel;
    });
    // The switch strip carries the active drawer's own action, so each panel
    // holds content only.
    document.querySelectorAll("[data-soundscape-action-for]").forEach((button) => {
      button.hidden = button.dataset.soundscapeActionFor !== nextPanel;
    });
    if (persistNow) persist();
  }

  function updateProgress(force = false) {
    const now = performance.now();
    if (!force && now - lastProgressRender < 120) return;
    lastProgressRender = now;
    const position = currentPosition();
    const duration = currentDuration();
    state.position = position;
    const track = ui("soundscape-progress");
    if (track) {
      track.setAttribute("aria-disabled", String(!duration));
      track.tabIndex = duration ? 0 : -1;
      track.setAttribute("aria-valuemax", String(Math.round(duration)));
      track.setAttribute("aria-valuenow", String(Math.round(position)));
      track.setAttribute("aria-valuetext", `${formatDuration(position)} / ${formatDuration(duration)}`);
      renderTrack(track, duration ? position / duration : 0);
    }
    if (ui("soundscape-current-time")) ui("soundscape-current-time").textContent = formatDuration(position);
    if (ui("soundscape-duration")) ui("soundscape-duration").textContent = formatDuration(duration);
  }

  function repeatLabel() {
    const labels = {
      off: translate("soundscape_repeat_off", "Repeat off"),
      all: translate("soundscape_repeat_all", "Repeat all"),
      one: translate("soundscape_repeat_one", "Repeat one"),
    };
    return labels[state.repeat];
  }

  function updateTransport() {
    const playing = isPlaying();
    const available = hasQueue();
    const glyph = ui("soundscape-play-glyph");
    const toggle = ui("soundscape-toggle-play");
    const nextGlyph = playing ? "pause" : "play";
    if (glyph && glyph.dataset.systemIcon !== nextGlyph) {
      glyph.dataset.systemIcon = nextGlyph;
      if (typeof hydrateSystemIcons === "function") hydrateSystemIcons(glyph.parentElement || document);
    }
    if (toggle) {
      toggle.setAttribute("aria-label", playing ? translate("pause", "Pause") : translate("play", "Play"));
      toggle.disabled = !available;
    }
    if (ui("soundscape-previous")) ui("soundscape-previous").disabled = !available;
    if (ui("soundscape-next")) ui("soundscape-next").disabled = !available;

    const shuffle = ui("soundscape-shuffle");
    if (shuffle) {
      shuffle.disabled = !available;
      shuffle.classList.toggle("is-active", state.shuffle);
      shuffle.setAttribute("aria-pressed", String(state.shuffle));
    }

    const repeat = ui("soundscape-repeat");
    if (repeat) {
      repeat.disabled = !available;
      repeat.classList.toggle("is-active", state.repeat !== "off");
      repeat.dataset.repeat = state.repeat;
      repeat.setAttribute("aria-pressed", String(state.repeat !== "off"));
      repeat.setAttribute("aria-label", repeatLabel());
    }
    const repeatBadge = ui("soundscape-repeat-badge");
    if (repeatBadge) repeatBadge.textContent = state.repeat === "one" ? "1" : state.repeat === "all" ? "∞" : "";

    // Muted uses the native 1-bit inversion of the same speaker glyph rather
    // than a second icon.
    const mute = ui("soundscape-mute");
    if (mute) {
      mute.disabled = state.source === "none";
      mute.classList.toggle("is-active", state.muted);
      mute.setAttribute("aria-pressed", String(state.muted));
    }
    const volume = ui("soundscape-volume");
    if (volume) {
      volume.setAttribute("aria-disabled", String(state.source === "none"));
      volume.tabIndex = state.source === "none" ? -1 : 0;
      renderSegments(volume, state.muted ? 0 : state.volume);
    }
    updateProgress(true);
  }

  function renderArtwork(item) {
    const image = ui("soundscape-artwork-image");
    const fallback = ui("soundscape-artwork")?.querySelector(".sys-icon");
    if (!image) return;
    if (item?.artwork) {
      image.src = item.artwork.replace("{w}", "500").replace("{h}", "500");
      image.hidden = false;
      if (fallback) fallback.hidden = true;
    } else {
      image.removeAttribute("src");
      image.hidden = true;
      if (fallback) fallback.hidden = false;
    }
  }

  function updateMediaSession(item) {
    if (!("mediaSession" in navigator) || !["local", "gamdl"].includes(state.source)) return;
    if (!item) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title || "",
      artist: item.artist || "",
      album: item.album || "",
      artwork: item.artwork ? [{ src: item.artwork.replace("{w}", "512").replace("{h}", "512") }] : [],
    });
    navigator.mediaSession.playbackState = isPlaying() ? "playing" : "paused";
  }

  function renderNowPlaying() {
    const item = currentItem();
    const title = ui("soundscape-now-title");
    const artist = ui("soundscape-now-artist");
    if (title) title.textContent = item?.title || translate("soundscape_waiting", "Waiting for music");
    if (artist) artist.textContent = item
      ? [item.artist, item.album].filter(Boolean).join(" — ")
      : translate("soundscape_pick_source", "Connect Music on this Mac or choose local audio.");
    renderArtwork(item);
    updateMediaSession(item);
    if (ui("soundscape-save-moment")) ui("soundscape-save-moment").disabled = !item;
    updateSourceLabel();
    updateTransport();
  }

  function createTextPair(title, subtitle) {
    const text = document.createElement("span");
    const strong = document.createElement("strong");
    const small = document.createElement("small");
    strong.textContent = title;
    small.textContent = subtitle;
    text.append(strong, small);
    return text;
  }

  function renderSearchResults() {
    const list = ui("soundscape-search-results");
    if (!list) return;
    list.replaceChildren();
    list.hidden = !searchResults.length;
    searchResults.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "soundscape-search-result";
      button.dataset.searchIndex = String(index);
      const marker = document.createElement("span");
      marker.className = "soundscape-queue-index";
      marker.textContent = String(index + 1).padStart(2, "0");
      button.append(marker, createTextPair(item.title, [item.artist, item.album].filter(Boolean).join(" — ")));
      list.append(button);
    });
  }

  function renderQueue() {
    const list = ui("soundscape-queue");
    const count = ui("soundscape-queue-count");
    if (count) count.textContent = String(state.queue.length);
    const clear = ui("soundscape-clear-queue");
    if (clear) clear.disabled = state.source === "system" || !state.queue.length;
    if (!list) return;
    list.replaceChildren();
    if (!state.queue.length) {
      const empty = document.createElement("p");
      empty.className = "soundscape-empty";
      empty.textContent = state.source === "system"
        ? translate("soundscape_system_waiting", "Start something in Music; it will appear here.")
        : translate("soundscape_empty_queue", "Choose music to begin.");
      list.append(empty);
      return;
    }
    state.queue.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "soundscape-queue-item";
      row.classList.toggle("is-current", index === state.currentIndex);

      const marker = document.createElement("span");
      marker.className = "soundscape-queue-index";
      marker.textContent = String(index + 1).padStart(2, "0");
      row.append(marker);

      const select = document.createElement("button");
      select.type = "button";
      select.className = "soundscape-queue-select";
      select.dataset.queueIndex = String(index);
      const title = document.createElement("span");
      const artist = document.createElement("small");
      title.textContent = item.title || translate("untitled", "Untitled");
      artist.textContent = item.unavailable
        ? translate("soundscape_track_unavailable", "Choose this file again to play it.")
        : item.artist || sourceLabel();
      select.append(title, artist);
      row.append(select);

      if (item.source !== "system") {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "soundscape-queue-remove";
        remove.dataset.removeQueueIndex = String(index);
        remove.setAttribute("aria-label", translate("soundscape_remove_track", "Remove track"));
        remove.textContent = "×";
        row.append(remove);
      }
      list.append(row);
    });
  }

  function momentTitle(moment) {
    // The writer's own name always wins; the cell name is only the default for
    // a moment saved with nothing playing.
    const track = moment.queue[moment.currentIndex]?.title || cellName(moment.style || {});
    return moment.name || `${track} · ${formatMomentTime(moment.createdAt)}`;
  }

  function renderSaved() {
    const list = ui("soundscape-saved-list");
    const count = ui("soundscape-saved-count");
    if (count) count.textContent = String(state.saved.length);
    if (!list) return;
    list.replaceChildren();
    if (!state.saved.length) {
      const empty = document.createElement("p");
      empty.className = "soundscape-empty";
      empty.textContent = translate("soundscape_no_saved", "Your saved listening moments will appear here.");
      list.append(empty);
    }
    state.saved.forEach((moment) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "soundscape-saved-item";
      button.classList.toggle("is-selected", moment.id === state.selectedSavedId);
      button.dataset.savedId = moment.id;
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      const detail = document.createElement("small");
      title.textContent = momentTitle(moment);
      const momentSource = moment.source === "system"
        ? translate("soundscape_system_source", "Music on This Mac")
        : translate("soundscape_local_source", "Local Audio");
      detail.textContent = `${momentSource} · ${styleSummary(moment.style)}`;
      copy.append(title, detail);
      // Saved rows stay a list: the crop reports the moment's own cell, but the
      // reach tint never runs behind a row, or neighbouring moments would
      // fight each other for the same paper.
      const swatch = document.createElement("span");
      swatch.className = "soundscape-saved-swatch";
      swatch.style.setProperty("--soundscape-swatch", fieldCrop(moment.style));
      swatch.title = styleDescription(moment.style);
      button.append(copy, swatch);
      list.append(button);
    });
    const selected = selectedMoment();
    if (ui("soundscape-restore")) ui("soundscape-restore").disabled = !selected;
    if (ui("soundscape-link-project")) ui("soundscape-link-project").disabled = !selected;
    updateRecoverAction();
  }

  // A saved moment can outlive its source: a local file is gone after reload,
  // and a Music track can be removed from the library. Recovery hands the user
  // back to the real source instead of substituting similar music.
  function momentUnavailable(moment = selectedMoment()) {
    if (!moment) return false;
    if (moment.source === "system" || moment.source === "gamdl") return false;
    return !moment.queue.some((item) => sessionLocalUrls.get(item.id));
  }

  function updateRecoverAction() {
    const button = ui("soundscape-recover-moment");
    if (!button) return;
    const moment = selectedMoment();
    const needed = momentUnavailable(moment);
    button.disabled = !needed;
    button.textContent = moment?.source === "system"
      ? translate("soundscape_find_again_music", "Find It in Music")
      : translate("soundscape_choose_local_again", "Choose the Files Again");
  }

  function recoverSelectedMoment() {
    const moment = selectedMoment();
    if (!moment) return;
    if (moment.source === "system") {
      openSystemMusic();
      return;
    }
    ui("soundscape-local-input")?.click();
  }

  function renderAll() {
    renderQueue();
    renderNowPlaying();
    renderSaved();
    updateStyleVisuals();
    setActivePanel(state.activePanel, false, false);
  }

  function revokeLocalQueueUrls() {
    sessionLocalUrls.forEach((url) => URL.revokeObjectURL(url));
    sessionLocalUrls.clear();
  }

  function systemMusicError(error) {
    const code = error?.code || "";
    if (code === "automation_denied") {
      return translate(
        "soundscape_system_permission",
        "Allow AI System 6 to control Music in System Settings, then try again."
      );
    }
    if (code === "mac_only") {
      return translate("soundscape_system_mac_only", "Music control is available on the host Mac only.");
    }
    if (code === "music_unavailable") {
      return translate("soundscape_system_unavailable", "Open the Music app, then try again.");
    }
    if (code === "local_music_bridge_unavailable") {
      return translate(
        "soundscape_local_bridge_unavailable",
        "Start AI System 6 on this Mac, then connect again."
      );
    }
    return translate("soundscape_system_failed", "Music on this Mac did not respond.");
  }

  function systemMusicEndpoint() {
    return window.AISystem6LocalLMStudio?.isPublicWebMode?.()
      ? "http://127.0.0.1:4173/api/music/system"
      : "/api/music/system";
  }

  async function requestSystemMusic(action = "state", payload = {}) {
    const publicWeb = window.AISystem6LocalLMStudio?.isPublicWebMode?.();
    const options = action === "state"
      ? { cache: "no-store" }
      : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      };
    if (publicWeb) {
      options.mode = "cors";
      options.credentials = "omit";
      if (!window.AISystem6LocalLMStudio?.isSafariPublicWebUnsupported?.()
        && !window.AISystem6LocalLMStudio?.isSafariHttpLocalMode?.()) {
        options.targetAddressSpace = "loopback";
      }
    }
    let response;
    try {
      response = await fetch(systemMusicEndpoint(), options);
    } catch {
      const error = new Error("Local Music bridge unavailable.");
      error.code = "local_music_bridge_unavailable";
      throw error;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.available === false) {
      const error = new Error(data.error || "Music command failed.");
      error.code = data.code || "music_command_failed";
      throw error;
    }
    return data;
  }

  function systemItem(track) {
    return {
      id: `system-${track.persistentId || track.id || safeId()}`,
      source: "system",
      persistentId: track.persistentId || "",
      title: track.title || translate("untitled", "Untitled"),
      artist: track.artist || "",
      album: track.album || "",
      artwork: "",
      duration: Number(track.duration) || 0,
      unavailable: false,
    };
  }

  function applySystemSnapshot(snapshot, persistNow = true) {
    systemMusicConnected = true;
    localAudio.pause();
    state.source = "system";
    state.playerState = snapshot.playerState || "stopped";
    state.position = Number(snapshot.position) || 0;
    state.volume = clamp(snapshot.volume);
    state.muted = Boolean(snapshot.muted);
    state.shuffle = Boolean(snapshot.shuffle);
    state.shuffleKind = normalizeShuffleKind(snapshot.shuffleMode);
    state.repeat = normalizeRepeat(snapshot.repeat);
    if (snapshot.track) {
      state.queue = [systemItem(snapshot.track)];
      state.currentIndex = 0;
    } else {
      state.queue = [];
      state.currentIndex = -1;
    }
    renderAll();
    if (persistNow) persist();
    else notifyPlayerListeners();
  }

  async function connectSystemMusic(options = {}) {
    if (window.AISystem6LocalLMStudio?.isSafariPublicWebUnsupported?.()) {
      const capabilities = await window.AISystem6PublicAccess?.getCapabilities?.();
      const origin = capabilities?.public_access?.safari_http_local_origin || "";
      window.location.assign(window.AISystem6LocalLMStudio.httpLocalEntryUrl(origin));
      return false;
    }
    if (!options.quiet) setStatus(translate("soundscape_system_connecting", "Connecting to Music on this Mac..."));
    try {
      const snapshot = await requestSystemMusic("state");
      applySystemSnapshot(snapshot);
      if (!options.quiet) {
        setStatus(translate("soundscape_system_ready", "Music on this Mac is connected."));
      }
      return true;
    } catch (error) {
      if (!options.quiet) setStatus(systemMusicError(error));
      return false;
    }
  }

  async function syncSystemMusic() {
    // The strip keeps playing status live after the window closes: the sync
    // only requires a real system source, never a visible Soundscape window.
    // (The old `is-hidden` check stopped polling as soon as the window was
    // collapsed, so a closed window froze the strip's Play/Pause button.)
    if (!systemMusicConnected || state.source !== "system" || systemRequestInFlight) return;
    systemRequestInFlight = true;
    try {
      const snapshot = await requestSystemMusic("state");
      applySystemSnapshot(snapshot, false);
    } catch (error) {
      systemMusicConnected = false;
      setStatus(systemMusicError(error));
      updateTransport();
    } finally {
      systemRequestInFlight = false;
    }
  }

  async function runSystemAction(action, payload = {}) {
    if (!systemMusicConnected && !await connectSystemMusic()) return null;
    try {
      const snapshot = await requestSystemMusic(action, payload);
      applySystemSnapshot(snapshot);
      return snapshot;
    } catch (error) {
      setStatus(systemMusicError(error));
      return null;
    }
  }

  async function openSystemMusic() {
    try {
      const snapshot = await requestSystemMusic("open");
      applySystemSnapshot(snapshot);
      setStatus(translate("soundscape_system_opened", "Music is open."));
    } catch (error) {
      setStatus(systemMusicError(error));
    }
  }

  async function searchSystemLibrary(query) {
    const term = String(query || "").trim();
    if (!term) return;
    if (!systemMusicConnected && !await connectSystemMusic()) return;
    setStatus(translate("soundscape_searching", "Searching your Music library..."));
    try {
      const response = await requestSystemMusic("search-library", { query: term });
      searchResults = (response.results || []).map((item) => ({
        ...systemItem(item),
        query: term,
      })).filter((item) => item.persistentId);
      renderSearchResults();
      setStatus(searchResults.length
        ? translate("soundscape_system_ready", "Music on this Mac is connected.")
        : translate("soundscape_no_results", "No songs found in your library."));
    } catch (error) {
      searchResults = [];
      renderSearchResults();
      setStatus(systemMusicError(error));
    }
  }

  // Apple Music link downloads run on the host through gamdl; the browser
  // only sends a link and receives finished audio URLs back. No cookies or
  // tokens ever reach the browser.
  function gamdlError(error) {
    const code = error?.code || "";
    if (code === "gamdl_cookies_missing") {
      return translate("soundscape_gamdl_cookies_missing", "gamdl needs Apple Music cookies on this Mac.");
    }
    if (code === "gamdl_unavailable") {
      return translate("soundscape_gamdl_unavailable", "gamdl is not installed on this Mac.");
    }
    if (code === "gamdl_busy") {
      return translate("soundscape_gamdl_busy", "Another download is still running.");
    }
    if (code === "gamdl_invalid_url") {
      return translate("soundscape_gamdl_invalid_url", "Only Apple Music links are allowed.");
    }
    return translate("soundscape_gamdl_failed", "gamdl could not download that link.");
  }

  function gamdlItem(item) {
    return {
      id: `gamdl-${item.file}`,
      source: "gamdl",
      title: item.title || translate("untitled", "Untitled"),
      artist: item.artist || translate("soundscape_gamdl_source", "Apple Music"),
      album: item.album || "",
      artwork: "",
      duration: Number(item.duration) || 0,
      url: item.url,
      unavailable: false,
    };
  }

  function finishGamdlForm() {
    if (gamdlJobTimer) {
      window.clearInterval(gamdlJobTimer);
      gamdlJobTimer = 0;
    }
    activeGamdlJobId = "";
    const submit = ui("soundscape-gamdl-submit");
    const input = ui("soundscape-gamdl-input");
    if (submit) submit.disabled = false;
    if (input) input.value = "";
  }

  async function pollGamdlJob() {
    if (!activeGamdlJobId) {
      finishGamdlForm();
      return;
    }
    let data;
    try {
      const response = await fetch(`/api/music/gamdl/jobs/${activeGamdlJobId}`, { cache: "no-store" });
      data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || "Download job failed.");
        error.code = data.code || "gamdl_failed";
        throw error;
      }
    } catch (error) {
      finishGamdlForm();
      setStatus(gamdlError(error));
      return;
    }
    if (data.status === "running") {
      setStatus(translate("soundscape_gamdl_started", "Downloading from Apple Music..."));
      return;
    }
    finishGamdlForm();
    if (data.status === "done" && Array.isArray(data.results) && data.results.length) {
      if (systemMusicConnected) await requestSystemMusic("pause").catch(() => {});
      localAudio.pause();
      revokeLocalQueueUrls();
      state.source = "gamdl";
      state.playerState = "stopped";
      state.queue = data.results.map(gamdlItem);
      state.currentIndex = 0;
      state.position = 0;
      state.muted = false;
      setActivePanel("queue");
      setStatus(translate("soundscape_gamdl_done", `${data.results.length} track(s) downloaded to Soundscape.`, data.results.length));
      await playIndex(0);
      persist();
      renderAll();
      return;
    }
    setStatus(data.error || gamdlError({ code: data.code }));
  }

  async function downloadFromAppleMusic(url) {
    const link = String(url || "").trim();
    if (!link) return;
    if (window.AISystem6LocalLMStudio?.isPublicWebMode?.()) {
      setStatus(translate("soundscape_gamdl_host_only", "Apple Music link downloads are available on this Mac only."));
      return;
    }
    const submit = ui("soundscape-gamdl-submit");
    if (submit) submit.disabled = true;
    setStatus(translate("soundscape_gamdl_started", "Downloading from Apple Music..."));
    try {
      const response = await fetch("/api/music/gamdl/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || "gamdl could not start the download.");
        error.code = data.code || "gamdl_failed";
        throw error;
      }
      activeGamdlJobId = data.jobId || "";
      if (activeGamdlJobId) {
        if (!gamdlJobTimer) gamdlJobTimer = window.setInterval(pollGamdlJob, GAMDL_POLL_MS);
        pollGamdlJob();
      } else {
        finishGamdlForm();
      }
    } catch (error) {
      finishGamdlForm();
      setStatus(gamdlError(error));
    }
  }

  async function chooseLocalFiles(files) {
    const audioFiles = Array.from(files || []).filter((file) => file.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|aiff|flac|ogg)$/i.test(file.name));
    if (!audioFiles.length) return;
    if (systemMusicConnected) await requestSystemMusic("pause").catch(() => {});
    localAudio.pause();
    revokeLocalQueueUrls();
    state.source = "local";
    state.playerState = "stopped";
    state.queue = audioFiles.map((file) => {
      const id = safeId();
      const url = URL.createObjectURL(file);
      sessionLocalUrls.set(id, url);
      return {
        id,
        source: "local",
        title: file.name.replace(/\.[^.]+$/, ""),
        artist: translate("soundscape_local_source", "Local Audio"),
        album: "",
        artwork: "",
        duration: 0,
        url,
        unavailable: false,
      };
    });
    state.currentIndex = 0;
    state.position = 0;
    state.muted = false;
    setStatus(translate("soundscape_local_ready", `${audioFiles.length} local tracks ready.`, audioFiles.length));
    setActivePanel("queue");
    await playIndex(0);
    persist();
    renderAll();
  }

  async function playLocalIndex(index, startAt = 0) {
    const item = state.queue[index];
    if (!item?.url) {
      setStatus(translate("soundscape_local_missing", "Choose the local files again to resume this moment."));
      return false;
    }
    state.source = item.source === "gamdl" ? "gamdl" : "local";
    state.currentIndex = index;
    state.playerState = "paused";
    if (localAudio.src !== item.url) localAudio.src = item.url;
    localAudio.volume = state.muted ? 0 : state.volume / 100;
    if (startAt > 0) {
      const seek = () => {
        localAudio.currentTime = Math.min(startAt, Number(localAudio.duration) || startAt);
        localAudio.removeEventListener("loadedmetadata", seek);
      };
      if (localAudio.readyState >= 1) seek();
      else localAudio.addEventListener("loadedmetadata", seek);
    }
    try {
      await localAudio.play();
      state.playerState = "playing";
      setStatus(translate("soundscape_playing", "Playing."));
      return true;
    } catch {
      setStatus(translate("soundscape_playback_failed", "Playback could not start."));
      return false;
    }
  }

  async function playSystemItem(item, startAt = 0) {
    if (!item?.persistentId) {
      setStatus(translate("soundscape_system_track_missing", "Find this track again in Music."));
      return false;
    }
    const snapshot = await runSystemAction("play-library-track", { persistentId: item.persistentId });
    if (!snapshot) return false;
    if (startAt > 0) await runSystemAction("set-position", { position: startAt });
    setStatus(translate("soundscape_playing", "Playing."));
    return true;
  }

  async function playIndex(index, startAt = 0) {
    const item = state.queue[index];
    if (!item) return false;
    state.currentIndex = index;
    state.position = startAt;
    renderQueue();
    renderNowPlaying();
    const played = item.source === "system"
      ? await playSystemItem(item, startAt)
      : await playLocalIndex(index, startAt);
    renderAll();
    persist();
    return played;
  }

  async function togglePlay() {
    if (state.source === "system") {
      const snapshot = await runSystemAction("play-pause");
      if (snapshot) {
        setStatus(snapshot.playerState === "playing"
          ? translate("soundscape_playing", "Playing.")
          : translate("soundscape_paused", "Paused."));
      }
      return;
    }
    const item = currentItem();
    if (!item) return;
    if (isPlaying()) {
      localAudio.pause();
      state.playerState = "paused";
      setStatus(translate("soundscape_paused", "Paused."));
    } else if (localAudio.src) {
      await localAudio.play().catch(() => setStatus(translate("soundscape_playback_failed", "Playback could not start.")));
    } else {
      await playIndex(state.currentIndex, state.position);
    }
    updateTransport();
    persist();
  }

  function randomQueueIndex() {
    if (state.queue.length < 2) return state.currentIndex;
    let nextIndex = state.currentIndex;
    while (nextIndex === state.currentIndex) nextIndex = Math.floor(Math.random() * state.queue.length);
    return nextIndex;
  }

  async function moveTrack(delta) {
    if (state.source === "system") {
      await runSystemAction(delta > 0 ? "next" : "previous");
      return;
    }
    if (!state.queue.length) return;
    if (delta < 0 && localAudio.currentTime > 3) {
      localAudio.currentTime = 0;
      return;
    }
    let nextIndex = state.shuffle ? randomQueueIndex() : state.currentIndex + delta;
    if (nextIndex >= state.queue.length) nextIndex = state.repeat === "all" ? 0 : -1;
    if (nextIndex < 0) nextIndex = state.repeat === "all" ? state.queue.length - 1 : 0;
    if (nextIndex >= 0) await playIndex(nextIndex);
  }

  async function cycleRepeat() {
    await setRepeatMode(REPEAT_MODES[(REPEAT_MODES.indexOf(state.repeat) + 1) % REPEAT_MODES.length]);
  }

  // The deck key cycles; the menu names all three modes and picks one directly,
  // the way a System 6 menu shows a closed set with the active row checked.
  // The kind is Music's own setting. Choosing one never switches shuffle on:
  // that is a separate row, exactly as Music separates the two groups.
  async function setShuffleKind(kind) {
    const next = normalizeShuffleKind(kind);
    state.shuffleKind = next;
    if (state.source === "system") await runSystemAction("set-shuffle-mode", { mode: next });
    else persist();
    setStatus(translate(`soundscape_shuffle_kind_${next}`, next));
  }

  async function setRepeatMode(mode) {
    const next = normalizeRepeat(mode);
    state.repeat = next;
    if (state.source === "system") await runSystemAction("set-repeat", { mode: next });
    else {
      localAudio.loop = next === "one";
      persist();
      updateTransport();
    }
    setStatus(repeatLabel());
  }

  async function toggleShuffle() {
    await setShuffle(!state.shuffle);
  }

  // Music names shuffle as a closed set too, so the menu picks a state instead
  // of flipping whatever it currently is. Music's shuffle *kind* (songs, album,
  // grouping) is not exposed here: the bridge only reads a boolean, and naming
  // a mode Soundscape cannot read would be a claim it can't back.
  async function setShuffle(enabled) {
    const next = Boolean(enabled);
    state.shuffle = next;
    if (state.source === "system") await runSystemAction("set-shuffle", { enabled: next });
    else {
      persist();
      updateTransport();
    }
    setStatus(next
      ? translate("soundscape_shuffle_on", "Shuffle on.")
      : translate("soundscape_shuffle_off", "Shuffle off."));
  }

  async function toggleMute() {
    if (state.source === "system") {
      await runSystemAction("toggle-mute");
      return;
    }
    state.muted = !state.muted;
    localAudio.volume = state.muted ? 0 : state.volume / 100;
    persist();
    updateTransport();
  }

  async function removeQueueIndex(index) {
    if (!["local", "gamdl"].includes(state.source) || !state.queue[index]) return;
    const wasCurrent = index === state.currentIndex;
    const removed = state.queue.splice(index, 1)[0];
    const url = sessionLocalUrls.get(removed.id);
    if (url) URL.revokeObjectURL(url);
    sessionLocalUrls.delete(removed.id);
    if (!state.queue.length) {
      localAudio.pause();
      localAudio.removeAttribute("src");
      state.currentIndex = -1;
      state.position = 0;
      state.playerState = "stopped";
    } else if (wasCurrent) {
      state.currentIndex = Math.min(index, state.queue.length - 1);
      await playIndex(state.currentIndex);
      return;
    } else if (index < state.currentIndex) {
      state.currentIndex -= 1;
    }
    persist();
    renderAll();
  }

  function clearLocalQueue() {
    if (!["local", "gamdl"].includes(state.source)) {
      setStatus(translate("soundscape_system_queue_managed", "Manage the Apple Music queue in Music."));
      return;
    }
    localAudio.pause();
    localAudio.removeAttribute("src");
    revokeLocalQueueUrls();
    state.queue = [];
    state.currentIndex = -1;
    state.position = 0;
    state.playerState = "stopped";
    persist();
    renderAll();
    setStatus(translate("soundscape_queue_cleared", "Queue cleared."));
  }

  async function handleLocalEnded() {
    if (state.repeat === "one") {
      localAudio.currentTime = 0;
      await localAudio.play().catch(() => {});
      return;
    }
    if (state.queue.length > 1) {
      if (state.shuffle) {
        await playIndex(randomQueueIndex());
        return;
      }
      if (state.currentIndex < state.queue.length - 1) {
        await playIndex(state.currentIndex + 1);
        return;
      }
      if (state.repeat === "all") {
        await playIndex(0);
        return;
      }
    } else if (state.repeat === "all" && state.queue.length === 1) {
      await playIndex(0);
      return;
    }
    state.position = 0;
    state.playerState = "stopped";
    updateTransport();
    persist();
    setStatus(translate("soundscape_finished", "Finished."));
  }

  function saveMoment() {
    const item = currentItem();
    if (!item) return;
    const now = new Date();
    const moment = {
      id: safeId(),
      createdAt: now.toISOString(),
      name: ui("soundscape-style-name")?.value.trim() || "",
      sentence: ui("soundscape-style-sentence")?.value.trim() || "",
      source: state.source,
      queue: serializeQueue(),
      currentIndex: state.currentIndex,
      position: currentPosition(),
      volume: state.volume,
      muted: state.muted,
      shuffle: state.shuffle,
      repeat: state.repeat,
      style: { ...state.style },
    };
    state.saved.unshift(moment);
    state.saved = state.saved.slice(0, MAX_SAVED_MOMENTS);
    state.selectedSavedId = moment.id;
    persist();
    renderSaved();
    setActivePanel("saved");
    setStatus(translate("soundscape_moment_saved", "This moment is saved."));
  }

  async function restoreMoment(moment = selectedMoment()) {
    if (!moment) return;
    state.source = normalizeSource(moment.source);
    state.queue = moment.queue.map((item) => {
      const url = item.source === "local" ? sessionLocalUrls.get(item.id) || "" : "";
      return {
        ...item,
        source: normalizeSource(item.source),
        ...(url ? { url } : {}),
        unavailable: item.source === "local" && !url,
      };
    });
    state.currentIndex = Math.max(0, Math.min(moment.currentIndex, state.queue.length - 1));
    state.position = Number(moment.position) || 0;
    state.volume = clamp(moment.volume);
    state.muted = Boolean(moment.muted);
    state.shuffle = Boolean(moment.shuffle);
    state.repeat = normalizeRepeat(moment.repeat);
    setStyle(moment.style || STYLE_PRESETS.standard, false);
    localAudio.volume = state.muted ? 0 : state.volume / 100;
    localAudio.loop = state.repeat === "one";
    if (ui("soundscape-style-name")) ui("soundscape-style-name").value = moment.name || "";
    if (ui("soundscape-style-sentence")) ui("soundscape-style-sentence").value = moment.sentence || "";
    renderAll();
    if (moment.source === "system") {
      await playIndex(state.currentIndex, state.position);
    } else if (currentItem()?.url) {
      await playIndex(state.currentIndex, state.position);
    } else {
      setStatus(translate("soundscape_local_missing", "Choose the local files again to resume this moment."));
    }
    persist();
    if (moment.source === "system" || currentItem()?.url) {
      setStatus(translate("soundscape_moment_restored", "You are back in this moment."));
    }
  }

  function applyStyleToSelected() {
    const moment = selectedMoment();
    if (moment) {
      moment.style = { ...state.style };
      moment.name = ui("soundscape-style-name")?.value.trim() || moment.name || "";
      moment.sentence = ui("soundscape-style-sentence")?.value.trim() || moment.sentence || "";
      setStatus(translate("soundscape_moment_updated", "The saved style is updated."));
      renderSaved();
    }
    persist();
  }

  function projectName(project) {
    if (typeof projectDisplayName === "function") return projectDisplayName(project);
    return project?.name || translate("projects", "Project");
  }

  function linkSelectedToProject() {
    const moment = selectedMoment();
    const project = activeProject();
    if (!moment || !project) {
      setStatus(translate("soundscape_project_missing", "Mount a project first."));
      return;
    }
    state.projectLinks[project.id] = moment.id;
    persist();
    setStatus(translate("soundscape_project_linked", `Added to ${projectName(project)}.`, projectName(project)));
  }

  async function restoreProjectSoundscape() {
    const project = activeProject();
    if (!project) {
      setStatus(translate("soundscape_project_missing", "Mount a project first."));
      return;
    }
    const momentId = state.projectLinks[project.id];
    const moment = state.saved.find((item) => item.id === momentId);
    if (!moment) {
      setStatus(translate("soundscape_project_no_soundscape", "This project has no saved soundscape."));
      return;
    }
    state.selectedSavedId = moment.id;
    await restoreMoment(moment);
    setStatus(translate("soundscape_project_restored", "Project soundscape restored."));
  }

  function selectSavedMoment(momentId) {
    state.selectedSavedId = momentId;
    const moment = selectedMoment();
    if (moment) {
      setStyle(moment.style || STYLE_PRESETS.standard, false);
      if (ui("soundscape-style-name")) ui("soundscape-style-name").value = moment.name || "";
      if (ui("soundscape-style-sentence")) ui("soundscape-style-sentence").value = moment.sentence || "";
    }
    persist();
    renderSaved();
  }

  function bindMediaSession() {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => {
      if (state.source === "local" && !isPlaying()) togglePlay();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      if (state.source === "local" && isPlaying()) togglePlay();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      if (state.source === "local") moveTrack(-1);
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      if (state.source === "local") moveTrack(1);
    });
  }

  function bindDomEvents() {
    ui("soundscape-connect-apple")?.addEventListener("click", () => connectSystemMusic());
    ui("soundscape-open-music")?.addEventListener("click", openSystemMusic);
    ui("soundscape-choose-local")?.addEventListener("click", () => ui("soundscape-local-input")?.click());
    ui("soundscape-local-input")?.addEventListener("change", (event) => chooseLocalFiles(event.target.files));
    ui("soundscape-search-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      searchSystemLibrary(ui("soundscape-search-input")?.value);
    });
    ui("soundscape-gamdl-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      downloadFromAppleMusic(ui("soundscape-gamdl-input")?.value);
    });
    ui("soundscape-search-results")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-search-index]");
      if (!button) return;
      const item = searchResults[Number(button.dataset.searchIndex)];
      if (!item) return;
      state.queue = [item];
      state.currentIndex = 0;
      await playIndex(0);
    });
    ui("soundscape-queue")?.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-queue-index]");
      if (remove) {
        removeQueueIndex(Number(remove.dataset.removeQueueIndex));
        return;
      }
      const select = event.target.closest("[data-queue-index]");
      if (select) playIndex(Number(select.dataset.queueIndex));
    });
    ui("soundscape-clear-queue")?.addEventListener("click", clearLocalQueue);
    ui("soundscape-toggle-play")?.addEventListener("click", togglePlay);
    ui("soundscape-previous")?.addEventListener("click", () => moveTrack(-1));
    ui("soundscape-next")?.addEventListener("click", () => moveTrack(1));
    ui("soundscape-shuffle")?.addEventListener("click", toggleShuffle);
    ui("soundscape-repeat")?.addEventListener("click", cycleRepeat);
    ui("soundscape-mute")?.addEventListener("click", toggleMute);
    ui("soundscape-save-moment")?.addEventListener("click", saveMoment);
    const progress = ui("soundscape-progress");
    bindDragControl(progress, {
      ratio: () => {
        const duration = currentDuration();
        return duration ? currentPosition() / duration : 0;
      },
      onInput: (ratio) => {
        const duration = currentDuration();
        state.position = duration * ratio;
        if (state.source === "local") localAudio.currentTime = state.position;
        renderTrack(progress, ratio);
        if (ui("soundscape-current-time")) ui("soundscape-current-time").textContent = formatDuration(state.position);
      },
      onCommit: async () => {
        if (state.source === "system") await runSystemAction("set-position", { position: state.position });
        persist();
      },
    });

    const volume = ui("soundscape-volume");
    bindDragControl(volume, {
      ratio: () => (state.muted ? 0 : state.volume) / 100,
      onInput: (ratio) => {
        state.volume = segmentValueFromRatio(volume, ratio);
        state.muted = false;
        if (state.source === "local") localAudio.volume = state.volume / 100;
        renderSegments(volume, state.volume);
        updateTransport();
      },
      onCommit: async () => {
        if (state.source === "system") await runSystemAction("set-volume", { volume: state.volume });
        persist();
      },
    });
    ui("soundscape-style-strip")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-soundscape-style]");
      if (button) applyStylePreset(button.dataset.soundscapeStyle);
    });
    ui("soundscape-reset-style")?.addEventListener("click", resetStyle);
    const intensity = ui("soundscape-intensity");
    // Registered before the drag binding so the flag is already correct when
    // the binding's own handler renders: only a live drag gets edge hysteresis.
    intensity?.addEventListener("pointerdown", () => { styleDragging = true; });
    intensity?.addEventListener("pointerup", () => { styleDragging = false; });
    bindDragControl(intensity, {
      ratio: () => state.style.intensity / 100,
      onInput: (ratio) => {
        setStyle({ ...state.style, preset: "custom", intensity: segmentValueFromRatio(intensity, ratio) }, false);
      },
      onCommit: persist,
    });

    const field = ui("soundscape-style-field");
    field?.addEventListener("pointerdown", (event) => {
      styleDragging = true;
      capturePointer(field, event.pointerId);
      styleFromPointer(event);
    });
    field?.addEventListener("pointermove", (event) => {
      if (styleDragging) styleFromPointer(event);
    });
    field?.addEventListener("pointerup", (event) => {
      styleDragging = false;
      releasePointer(field, event.pointerId);
      persist();
    });
    field?.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 10 : 2;
      const delta = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }[event.key];
      if (!delta) return;
      event.preventDefault();
      setStyle({ ...state.style, preset: "custom", x: state.style.x + delta[0], y: state.style.y + delta[1] });
    });

    ui("soundscape-style-note-toggle")?.addEventListener("click", (event) => {
      const note = ui("soundscape-style-note");
      if (!note) return;
      note.hidden = !note.hidden;
      event.currentTarget.setAttribute("aria-expanded", String(!note.hidden));
      if (!note.hidden) ui("soundscape-style-name")?.focus();
    });
    ui("soundscape-apply-style")?.addEventListener("click", applyStyleToSelected);
    ui("soundscape-saved-list")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-saved-id]");
      if (button) selectSavedMoment(button.dataset.savedId);
    });
    ui("soundscape-restore")?.addEventListener("click", () => restoreMoment());
    ui("soundscape-link-project")?.addEventListener("click", linkSelectedToProject);
    ui("soundscape-recover-moment")?.addEventListener("click", recoverSelectedMoment);
    ui("soundscape-restore-project")?.addEventListener("click", restoreProjectSoundscape);

    const modeSwitch = document.querySelector(".soundscape-mode-switch");
    modeSwitch?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-soundscape-panel-target]");
      if (button) setActivePanel(button.dataset.soundscapePanelTarget);
    });
    modeSwitch?.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = PANELS.indexOf(state.activePanel);
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? PANELS.length - 1
          : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + PANELS.length) % PANELS.length;
      setActivePanel(PANELS[nextIndex], true);
    });

    localAudio.addEventListener("timeupdate", updateProgress);
    localAudio.addEventListener("durationchange", () => {
      const item = currentItem();
      if (item && Number.isFinite(localAudio.duration)) item.duration = localAudio.duration;
      updateProgress(true);
    });
    localAudio.addEventListener("play", () => {
      state.playerState = "playing";
      updateTransport();
    });
    localAudio.addEventListener("pause", () => {
      if (!localAudio.ended) state.playerState = "paused";
      updateTransport();
    });
    localAudio.addEventListener("ended", handleLocalEnded);
    localAudio.addEventListener("error", () => setStatus(translate("soundscape_playback_failed", "Playback could not start.")));

    bindMediaSession();
    window.addEventListener("beforeunload", revokeLocalQueueUrls, { once: true });
  }

  // Runtime (audio element defaults, the system-music poll) is separable from
  // window DOM so the Control Strip can track and control playback without
  // binding the Soundscape window's controls. attach() stays the full-window
  // entry; ensureRuntime() is the light adapter the strip calls.
  function ensureRuntime() {
    if (!runtimeInitialized) {
      runtimeInitialized = true;
      localAudio.volume = state.muted ? 0 : state.volume / 100;
      localAudio.loop = state.repeat === "one";
      systemPollTimer = window.setInterval(syncSystemMusic, SYSTEM_POLL_MS);
    }
    if (state.source === "system" && !systemMusicConnected) {
      connectSystemMusic({ quiet: true }).catch(() => {});
    }
    return Promise.resolve(true);
  }

  function attach() {
    if (!initialized) {
      initialized = true;
      bindDomEvents();
    }
    ensureRuntime();
    renderAll();
  }

  function runMenuCommand(command) {
    const commands = {
      "choose-local": () => ui("soundscape-local-input")?.click(),
      "gamdl-download": () => ui("soundscape-gamdl-input")?.focus(),
      "save-moment": saveMoment,
      "toggle-play": togglePlay,
      previous: () => moveTrack(-1),
      next: () => moveTrack(1),
      shuffle: toggleShuffle,
      "shuffle-on": () => setShuffle(true),
      "shuffle-off": () => setShuffle(false),
      "shuffle-songs": () => setShuffleKind("songs"),
      "shuffle-albums": () => setShuffleKind("albums"),
      "shuffle-groupings": () => setShuffleKind("groupings"),
      repeat: cycleRepeat,
      "repeat-off": () => setRepeatMode("off"),
      "repeat-all": () => setRepeatMode("all"),
      "repeat-one": () => setRepeatMode("one"),
      "reset-style": resetStyle,
      "link-project": linkSelectedToProject,
    };
    return commands[command]?.();
  }

  function currentRepeatMode() {
    return state.repeat;
  }

  function currentShuffleMode() {
    return state.shuffle ? "on" : "off";
  }

  function currentShuffleKind() {
    return state.shuffleKind;
  }

  // The Control Strip's volume module reads and sets the same app volume this
  // window edits. The strip menu offers eight levels (OS 9's Sound Volume
  // module); 0 maps to muted, 7 to full.
  function getVolumeSnapshot() {
    return { volume: state.volume, muted: state.muted };
  }

  function setVolumeLevel(level) {
    const next = Math.max(0, Math.min(7, Math.round(Number(level) || 0)));
    state.volume = Math.round((next / 7) * 100);
    state.muted = next === 0;
    if (state.source === "local" && typeof localAudio !== "undefined") localAudio.volume = state.volume / 100;
    renderSegments(ui("soundscape-volume"), state.volume);
    if (state.source === "system") runSystemAction("set-volume", { volume: state.volume });
    persist();
  }

  // The Control Strip's Soundscape module reads playback state and lets the
  // user toggle play and pick a scene, without opening the Soundscape window.
  function getPlayerSnapshot() {
    const item = currentItem();
    return {
      playerState: state.playerState,
      isPlaying: isPlaying(),
      source: state.source,
      currentIndex: state.currentIndex,
      currentTitle: item?.title || item?.name || "",
      queue: (state.queue || []).map((entry, index) => ({
        id: entry.id,
        title: entry.title || entry.name || String(index + 1),
        current: index === state.currentIndex,
      })),
    };
  }

  function playerSnapshotForSubscribers() {
    return {
      ...getPlayerSnapshot(),
      volume: state.volume,
      muted: state.muted,
      shuffle: state.shuffle,
      repeat: state.repeat,
    };
  }

  // One subscription surface for the Control Strip's Soundscape and Volume
  // modules. The listener gets the current snapshot immediately, and later
  // updates are coalesced into one frame so a burst of state changes repaints
  // once. A throwing listener never blocks the others.
  function subscribePlayer(listener) {
    if (typeof listener !== "function") return () => {};
    playerListeners.add(listener);
    try {
      listener(playerSnapshotForSubscribers());
    } catch (error) {
      console.error("Soundscape subscriber failed on initial snapshot.", error);
    }
    return () => {
      playerListeners.delete(listener);
    };
  }

  function notifyPlayerListeners() {
    if (playerNotifyFrame) return;
    const scheduleFrame = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 0);
    playerNotifyFrame = scheduleFrame(() => {
      playerNotifyFrame = 0;
      const snapshot = playerSnapshotForSubscribers();
      playerListeners.forEach((listener) => {
        try {
          listener(snapshot);
        } catch (error) {
          console.error("Soundscape subscriber failed.", error);
        }
      });
    });
  }

  async function playSceneIndex(index) {
    if (!Array.isArray(state.queue) || !state.queue[Number(index)]) return false;
    await playIndex(Number(index));
    return true;
  }

  window.AISystem6Soundscape = {
    attach,
    ensureRuntime,
    runMenuCommand,
    hasQueue,
    canSaveMoment,
    canLinkProject,
    currentRepeatMode,
    currentShuffleMode,
    currentShuffleKind,
    getVolumeSnapshot,
    setVolumeLevel,
    getPlayerSnapshot,
    subscribePlayer,
    playSceneIndex,
  };
  window.AISystem6SoundscapeLoaded = true;
})();
