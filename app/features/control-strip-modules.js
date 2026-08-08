// First-party Control Strip module descriptors.
//
// This file is the single source for the ten built-in modules. It installs
// window.AISystem6ControlStripModules (a frozen descriptor list) that both the
// Control Strip shell and the Control Strip Modules Finder folder consume.
// Nothing here executes third-party code: the registry only accepts trusted
// first-party descriptors, and the folder is a visible system object, not an
// importer of classic CSM binaries or user scripts.
//
// Descriptor shape:
//   id, labelKey, icon(state) -> icon id, finderIcon, defaultOrder,
//   defaultEnabled, state() -> {state, detail, source, ...}, subscribe?,
//   menu(), gauge?, ensureRuntime?, openOwner?, dispose?
// `state` keeps the existing three-state honesty contract: unknown means "no
// real source yet" and the shell renders no slot for it.

window.AISystem6ControlStripModulesLoaded = true;

function controlStripCurrentModelStatus() {
  let ready = false;
  let name = "";
  let mode = "";
  if (typeof cloudConfig !== "undefined"
    && cloudConfig?.active
    && cloudConfig?.provider
    && cloudConfig?.model
    && typeof cloudCredentialReady === "function"
    && cloudCredentialReady()) {
    ready = true;
    name = cloudConfig.model;
    mode = "cloud";
  } else if (typeof isLocalModelIndicatorReady === "function" && isLocalModelIndicatorReady()) {
    ready = true;
    name = typeof getLocalModelDisplayName === "function"
      ? getLocalModelDisplayName()
      : t("local_model");
    mode = "local";
  }
  return { ready, name, mode };
}

function controlStripVolumeSnapshot() {
  return typeof window.AISystem6Soundscape?.getVolumeSnapshot === "function"
    ? window.AISystem6Soundscape.getVolumeSnapshot()
    : null;
}

function controlStripVolumeLevel() {
  const snap = controlStripVolumeSnapshot();
  if (!snap) return -1;
  if (snap.muted) return 0;
  return Math.max(0, Math.min(7, Math.round((Number(snap.volume) || 0) / 100 * 7)));
}

function controlStripFormatTokens(tokens) {
  const value = Math.max(0, Number(tokens) || 0);
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return String(Math.round(value));
}

function controlStripPendingAssistantMessages() {
  if (typeof messagesEl === "undefined" || !messagesEl) return [];
  return [...messagesEl.querySelectorAll(".message.assistant.pending")];
}

function controlStripContextBudget() {
  if (typeof lastContextBudget === "undefined") return null;
  return lastContextBudget || null;
}

function controlStripContextUsed(budget) {
  const used = Number(
    typeof lastContextLoadout !== "undefined" && lastContextLoadout?.promptTokens
      ? lastContextLoadout.promptTokens
      : budget?.promptTokens || 0
  );
  return Math.max(0, used);
}

function controlStripEnsureSoundscapeRuntime() {
  if (typeof ensureSoundscapeModule !== "function") return Promise.resolve(true);
  return ensureSoundscapeModule().then(() => window.AISystem6Soundscape?.ensureRuntime?.());
}

function controlStripSubscribeSoundscape(listener) {
  if (typeof window.AISystem6Soundscape?.subscribePlayer === "function") {
    return window.AISystem6Soundscape.subscribePlayer(listener);
  }
  // The adapter is lazy; null tells the shell the subscription is not live
  // yet, so it re-attaches once the Soundscape runtime is actually loaded.
  return null;
}

function controlStripProjectName(project) {
  if (typeof projectDisplayName === "function") return projectDisplayName(project);
  return project?.name || t("projects");
}

function controlStripSoundscapeSourceLabel(source) {
  if (source === "system") return t("soundscape_system_source");
  if (source === "local") return t("soundscape_local_source");
  return t("soundscape_no_source");
}

const controlStripBuiltinModules = Object.freeze([
  {
    id: "soundscape",
    labelKey: "control_strip_soundscape",
    icon: (state) => (state.isPlaying ? "pause" : "play"),
    finderIcon: "soundscape",
    miniPlayer: true,
    defaultOrder: 0,
    defaultEnabled: true,
    openOwner: "soundscape",
    ensureRuntime: controlStripEnsureSoundscapeRuntime,
    subscribe: controlStripSubscribeSoundscape,
    state: () => {
      if (!window.AISystem6SoundscapeLoaded) return { state: "unknown", detail: "", source: "soundscape" };
      const snap = window.AISystem6Soundscape?.getPlayerSnapshot?.() || null;
      if (!snap || snap.source === "none" || !snap.currentTitle) {
        return { state: "unknown", detail: "", source: "soundscape" };
      }
      return {
        state: "ready",
        detail: snap.currentTitle,
        source: snap.source,
        isPlaying: snap.isPlaying === true,
      };
    },
    menu: () => {
      const snap = window.AISystem6Soundscape?.getPlayerSnapshot?.() || { source: "none" };
      const volume = controlStripVolumeSnapshot();
      const items = [];
      items.push({
        type: "label",
        label: snap.currentTitle || t("control_strip_soundscape_no_track"),
      });
      items.push({ type: "label", label: controlStripSoundscapeSourceLabel(snap.source) });
      items.push({ type: "separator" });
      items.push({
        type: "action",
        label: t("control_strip_soundscape_previous"),
        run: () => window.AISystem6Soundscape?.runMenuCommand?.("previous"),
      });
      items.push({
        type: "action",
        label: t(snap.isPlaying ? "control_strip_soundscape_pause" : "control_strip_soundscape_play"),
        run: () => window.AISystem6Soundscape?.runMenuCommand?.("toggle-play"),
      });
      items.push({
        type: "action",
        label: t("control_strip_soundscape_next"),
        run: () => window.AISystem6Soundscape?.runMenuCommand?.("next"),
      });
      items.push({ type: "separator" });
      items.push({
        type: "action",
        label: t("control_strip_soundscape_shuffle"),
        checked: snap.shuffle === true,
        run: () => window.AISystem6Soundscape?.runMenuCommand?.("shuffle"),
      });
      items.push({
        type: "action",
        label: t("control_strip_soundscape_repeat"),
        checked: snap.repeat !== undefined && snap.repeat !== "off",
        run: () => window.AISystem6Soundscape?.runMenuCommand?.("repeat"),
      });
      items.push({
        type: "action",
        label: t("control_strip_soundscape_mute"),
        checked: volume?.muted === true,
        run: () => window.AISystem6Soundscape?.runMenuCommand?.("toggle-mute"),
      });
      items.push({ type: "separator" });
      items.push({ type: "action", label: t("control_strip_open_soundscape"), run: () => openWindow("soundscape") });
      return items;
    },
  },
  {
    id: "projectDisk",
    labelKey: "control_strip_project_disk",
    icon: () => "projectDisk",
    finderIcon: "projectDisk",
    defaultOrder: 1,
    defaultEnabled: true,
    openOwner: "projects",
    state: () => {
      const project = typeof getActiveProject === "function" ? getActiveProject() : null;
      return project
        ? { state: "ready", detail: project.name, source: "project-disk" }
        : { state: "unknown", detail: "", source: "project-disk" };
    },
    menu: () => {
      const project = typeof getActiveProject === "function" ? getActiveProject() : null;
      const items = [];
      if (project) items.push({ type: "label", label: controlStripProjectName(project), checked: true });
      if (typeof projects !== "undefined" && Array.isArray(projects)) {
        projects
          .filter((candidate) => candidate.id !== project?.id && !candidate.archived)
          .forEach((candidate) => {
            items.push({
              type: "action",
              label: controlStripProjectName(candidate),
              run: () => switchProject(candidate.id),
            });
          });
      }
      items.push({ type: "separator" });
      items.push({ type: "action", label: t("control_strip_open_project_disk"), run: () => openWindow("projects") });
      return items;
    },
  },
  {
    id: "model",
    labelKey: "control_strip_model",
    icon: (state) => (state.state === "ready" ? "cloudModel" : "cloudModelOff"),
    finderIcon: "cloudModel",
    defaultOrder: 2,
    defaultEnabled: true,
    openOwner: "control",
    state: () => {
      const status = controlStripCurrentModelStatus();
      return status.ready
        ? { state: "ready", detail: status.name, source: "model-config", mode: status.mode }
        : { state: "unknown", detail: "", source: "model-config" };
    },
    menu: () => {
      const status = controlStripCurrentModelStatus();
      const items = [];
      if (status.ready) {
        items.push({
          type: "label",
          label: status.mode === "cloud"
            ? t("control_strip_model_cloud", status.name)
            : t("control_strip_model_local", status.name),
          checked: true,
        });
      } else {
        items.push({ type: "label", label: t("control_strip_model_not_ready") });
      }
      items.push({ type: "separator" });
      items.push({ type: "action", label: t("control_strip_open_control_panel"), run: () => openWindow("control") });
      return items;
    },
  },
  {
    id: "writingBell",
    labelKey: "control_strip_writing_bell",
    icon: () => "writingBell",
    finderIcon: "writingBell",
    defaultOrder: 3,
    defaultEnabled: true,
    openOwner: "writingBell",
    state: () => {
      if (typeof writingBellRunning === "undefined") return { state: "unknown", detail: "", source: "writing-bell" };
      return {
        state: "ready",
        detail: writingBellRunning ? t("bell_running", writingBellModeLabel()) : t("bell_ready"),
        source: "writing-bell",
      };
    },
    menu: () => [
      {
        type: "action",
        label: t("control_strip_writing_bell_on"),
        checked: writingBellRunning === true,
        run: () => startWritingBell(),
      },
      {
        type: "action",
        label: t("control_strip_writing_bell_off"),
        checked: writingBellRunning !== true,
        run: () => pauseWritingBell(),
      },
    ],
  },
  {
    // The classic strip carried the display's own settings. Appearance is this
    // desk's equivalent — a setting you flip often — and today it is buried in
    // the Special menu.
    id: "appearance",
    labelKey: "control_strip_desk_appearance",
    icon: () => "control",
    finderIcon: "control",
    defaultOrder: 4,
    defaultEnabled: true,
    openOwner: "control",
    state: () => {
      if (typeof liquidGlassInput === "undefined" || !liquidGlassInput) {
        return { state: "unknown", detail: "", source: "appearance" };
      }
      return {
        state: "ready",
        detail: t(liquidGlassInput.checked ? "liquid_glass" : "retro_interface"),
        source: "appearance",
      };
    },
    menu: () => {
      const liquid = typeof liquidGlassInput !== "undefined" && !!liquidGlassInput?.checked;
      // Only one way to set it exists, so each choice acts only when it would
      // actually change the setting — picking the current one is a no-op.
      const choose = (wantLiquid) => {
        if (wantLiquid !== liquid) toggleLiquidGlassAppearance();
      };
      return [
        { type: "action", label: t("retro_interface"), checked: !liquid, run: () => choose(false) },
        { type: "action", label: t("liquid_glass"), checked: liquid, run: () => choose(true) },
      ];
    },
  },
  {
    id: "balloonHelp",
    labelKey: "control_strip_balloon_help",
    icon: () => "systemHelp",
    finderIcon: "systemHelp",
    defaultOrder: 5,
    defaultEnabled: true,
    openOwner: "systemHelp",
    state: () => {
      if (typeof balloonHelpEnabled === "undefined") {
        return { state: "unknown", detail: "", source: "balloon-help" };
      }
      return {
        state: "ready",
        detail: t(balloonHelpEnabled ? "control_strip_balloon_help_on" : "control_strip_balloon_help_off"),
        source: "balloon-help",
      };
    },
    menu: () => [
      {
        type: "action",
        label: t("control_strip_balloon_help_on"),
        checked: balloonHelpEnabled === true,
        run: () => setBalloonHelpEnabled(true),
      },
      {
        type: "action",
        label: t("control_strip_balloon_help_off"),
        checked: balloonHelpEnabled !== true,
        run: () => setBalloonHelpEnabled(false),
      },
    ],
  },
  {
    id: "volume",
    labelKey: "control_strip_volume",
    icon: () => "speaker",
    finderIcon: "speaker",
    defaultOrder: 6,
    defaultEnabled: true,
    openOwner: "soundscape",
    ensureRuntime: controlStripEnsureSoundscapeRuntime,
    subscribe: controlStripSubscribeSoundscape,
    gauge: (state) => (state.state === "ready" ? { ratio: (state.level || 0) / 7 } : null),
    state: () => {
      const snap = controlStripVolumeSnapshot();
      if (!snap) return { state: "unknown", detail: "", source: "soundscape" };
      const level = controlStripVolumeLevel();
      return {
        state: "ready",
        detail: snap.muted ? t("control_strip_volume_off") : t("control_strip_volume_level", level),
        source: "soundscape",
        level,
      };
    },
    menu: () => {
      const items = [];
      const level = controlStripVolumeLevel();
      for (let index = 0; index < 8; index += 1) {
        const label = index === 0 ? t("control_strip_volume_off") : t("control_strip_volume_level", index);
        items.push({
          type: "action",
          label,
          checked: level === index,
          run: () => window.AISystem6Soundscape?.setVolumeLevel?.(index),
        });
      }
      items.push({ type: "separator" });
      items.push({ type: "action", label: t("control_strip_open_soundscape"), run: () => openWindow("soundscape") });
      return items;
    },
  },
]);

window.AISystem6ControlStripModules = controlStripBuiltinModules;
