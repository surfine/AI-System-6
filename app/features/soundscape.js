(function initSoundscapeFeature() {
  "use strict";

  const STORAGE_KEY = "ai-system-6-soundscape-v1";
  const SCHEMA_VERSION = 2;
  const MAX_SAVED_MOMENTS = 48;
  const SYSTEM_POLL_MS = 1500;
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

  const localAudio = new Audio();
  localAudio.preload = "metadata";
  const sessionLocalUrls = new Map();

  let initialized = false;
  let systemMusicConnected = false;
  let systemRequestInFlight = false;
  let systemPollTimer = 0;
  let styleDragging = false;
  let lastProgressRender = 0;
  let searchResults = [];

  const defaultState = () => ({
    schemaVersion: SCHEMA_VERSION,
    source: "none",
    queue: [],
    currentIndex: -1,
    position: 0,
    volume: 32,
    muted: false,
    shuffle: false,
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
    return translate("soundscape_no_source", "No source");
  }

  function updateSourceLabel() {
    const target = ui("soundscape-source");
    if (target) target.textContent = sourceLabel();
  }

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
    const depth = style.intensity < 34
      ? translate("soundscape_style_whisper", "Whisper")
      : style.intensity > 68
        ? translate("soundscape_style_immersive", "Immersive")
        : translate("soundscape_style_present", "Present");
    return [temperature, energy, depth];
  }

  function styleColor(style = state.style) {
    const hue = Math.round(218 - (style.x / 100) * 184);
    const saturation = Math.round(34 + style.intensity * 0.34);
    const lightness = Math.round(50 + (100 - style.y) * 0.22);
    return `hsl(${hue}deg ${saturation}% ${lightness}%)`;
  }

  function updateStyleVisuals() {
    const root = document.querySelector(".soundscape-window");
    if (!root) return;
    const hue = Math.round(218 - (state.style.x / 100) * 184);
    const companionHue = (hue + 43) % 360;
    const saturation = Math.round(36 + state.style.intensity * 0.34);
    const lightness = Math.round(52 + (100 - state.style.y) * 0.18);
    root.style.setProperty("--ss-field-x", `${state.style.x}%`);
    root.style.setProperty("--ss-field-y", `${state.style.y}%`);
    root.style.setProperty("--ss-live-a", `hsl(${hue}deg ${saturation}% ${lightness}%)`);
    root.style.setProperty("--ss-live-b", `hsl(${companionHue}deg ${Math.max(30, saturation - 8)}% ${Math.min(78, lightness + 8)}%)`);

    const summary = ui("soundscape-style-summary");
    if (summary) summary.textContent = styleWords().join(" / ");
    const intensity = ui("soundscape-intensity");
    if (intensity && Number(intensity.value) !== state.style.intensity) intensity.value = String(state.style.intensity);
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
    if (persistNow) persist();
  }

  function updateProgress(force = false) {
    const now = performance.now();
    if (!force && now - lastProgressRender < 120) return;
    lastProgressRender = now;
    const position = currentPosition();
    const duration = currentDuration();
    state.position = position;
    const range = ui("soundscape-progress");
    if (range) {
      range.disabled = !duration;
      range.value = duration ? String(Math.round((position / duration) * 1000)) : "0";
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
    if (glyph) glyph.textContent = playing ? "Ⅱ" : "▶";
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

    const mute = ui("soundscape-mute");
    if (mute) {
      mute.disabled = state.source === "none";
      mute.classList.toggle("is-active", state.muted);
      mute.setAttribute("aria-pressed", String(state.muted));
      mute.textContent = state.muted ? "×" : "◖";
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
    if (!("mediaSession" in navigator) || state.source !== "local") return;
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
    searchResults.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "soundscape-search-result";
      button.dataset.searchIndex = String(index);
      button.append(createTextPair(item.title, [item.artist, item.album].filter(Boolean).join(" — ")));
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
      row.dataset.index = String(index + 1).padStart(2, "0");

      const select = document.createElement("button");
      select.type = "button";
      select.className = "soundscape-queue-select";
      select.dataset.queueIndex = String(index);
      const title = document.createElement("span");
      const artist = document.createElement("small");
      title.textContent = item.title || translate("untitled", "Untitled");
      artist.textContent = item.artist || sourceLabel();
      select.append(title, artist);
      row.append(select);

      if (item.source === "local") {
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
    return moment.name || `${moment.queue[moment.currentIndex]?.title || translate("soundscape_saved", "Saved")} · ${formatMomentTime(moment.createdAt)}`;
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
      button.style.setProperty("--soundscape-swatch", styleColor(moment.style));
      button.style.setProperty("--soundscape-swatch-width", `${Math.max(18, moment.style?.intensity || 24)}%`);
      const title = document.createElement("strong");
      const detail = document.createElement("span");
      title.textContent = momentTitle(moment);
      const momentSource = moment.source === "system"
        ? translate("soundscape_system_source", "Music on This Mac")
        : translate("soundscape_local_source", "Local Audio");
      detail.textContent = `${momentSource} / ${styleWords(moment.style).join(" / ")}`;
      button.append(title, detail);
      list.append(button);
    });
    const selected = selectedMoment();
    if (ui("soundscape-restore")) ui("soundscape-restore").disabled = !selected;
    if (ui("soundscape-link-project")) ui("soundscape-link-project").disabled = !selected;
  }

  function renderAll() {
    renderQueue();
    renderNowPlaying();
    renderSaved();
    updateStyleVisuals();
    const volume = ui("soundscape-volume");
    if (volume) volume.value = String(state.volume);
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
    return translate("soundscape_system_failed", "Music on this Mac did not respond.");
  }

  async function requestSystemMusic(action = "state", payload = {}) {
    const options = action === "state"
      ? { cache: "no-store" }
      : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      };
    const response = await fetch("/api/music/system", options);
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
  }

  async function connectSystemMusic(options = {}) {
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
    const root = document.querySelector(".soundscape-window");
    if (!systemMusicConnected || state.source !== "system" || root?.classList.contains("is-hidden") || systemRequestInFlight) return;
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
    state.source = "local";
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
    const next = REPEAT_MODES[(REPEAT_MODES.indexOf(state.repeat) + 1) % REPEAT_MODES.length];
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
    const next = !state.shuffle;
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
    if (state.source !== "local" || !state.queue[index]) return;
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
    if (state.source !== "local") {
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
    ui("soundscape-progress")?.addEventListener("input", (event) => {
      const duration = currentDuration();
      state.position = duration * (Number(event.target.value) / 1000);
      if (state.source === "local") localAudio.currentTime = state.position;
      if (ui("soundscape-current-time")) ui("soundscape-current-time").textContent = formatDuration(state.position);
    });
    ui("soundscape-progress")?.addEventListener("change", async () => {
      if (state.source === "system") await runSystemAction("set-position", { position: state.position });
      persist();
    });
    ui("soundscape-volume")?.addEventListener("input", (event) => {
      state.volume = clamp(event.target.value);
      if (state.source === "local") localAudio.volume = state.muted ? 0 : state.volume / 100;
    });
    ui("soundscape-volume")?.addEventListener("change", async () => {
      if (state.source === "system") await runSystemAction("set-volume", { volume: state.volume });
      persist();
    });
    ui("soundscape-style-strip")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-soundscape-style]");
      if (button) applyStylePreset(button.dataset.soundscapeStyle);
    });
    ui("soundscape-reset-style")?.addEventListener("click", resetStyle);
    ui("soundscape-intensity")?.addEventListener("input", (event) => {
      setStyle({ ...state.style, preset: "custom", intensity: event.target.value }, false);
    });
    ui("soundscape-intensity")?.addEventListener("change", persist);

    const field = ui("soundscape-style-field");
    field?.addEventListener("pointerdown", (event) => {
      styleDragging = true;
      field.setPointerCapture?.(event.pointerId);
      styleFromPointer(event);
    });
    field?.addEventListener("pointermove", (event) => {
      if (styleDragging) styleFromPointer(event);
    });
    field?.addEventListener("pointerup", (event) => {
      styleDragging = false;
      field.releasePointerCapture?.(event.pointerId);
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
    ui("soundscape-restore-project")?.addEventListener("click", restoreProjectSoundscape);

    ui("soundscape-panel-queue")?.closest(".soundscape-workbench")?.querySelector(".soundscape-mode-switch")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-soundscape-panel-target]");
      if (button) setActivePanel(button.dataset.soundscapePanelTarget);
    });
    ui("soundscape-panel-queue")?.closest(".soundscape-workbench")?.querySelector(".soundscape-mode-switch")?.addEventListener("keydown", (event) => {
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

  function attach() {
    if (!initialized) {
      initialized = true;
      bindDomEvents();
      localAudio.volume = state.muted ? 0 : state.volume / 100;
      localAudio.loop = state.repeat === "one";
      systemPollTimer = window.setInterval(syncSystemMusic, SYSTEM_POLL_MS);
    }
    renderAll();
    if (state.source === "system" && !systemMusicConnected) connectSystemMusic();
  }

  function runMenuCommand(command) {
    const commands = {
      "choose-local": () => ui("soundscape-local-input")?.click(),
      "save-moment": saveMoment,
      "toggle-play": togglePlay,
      previous: () => moveTrack(-1),
      next: () => moveTrack(1),
      shuffle: toggleShuffle,
      repeat: cycleRepeat,
      "reset-style": resetStyle,
      "link-project": linkSelectedToProject,
    };
    return commands[command]?.();
  }

  window.AISystem6Soundscape = {
    attach,
    runMenuCommand,
    hasQueue,
    canSaveMoment,
    canLinkProject,
  };
  window.AISystem6SoundscapeLoaded = true;
})();
