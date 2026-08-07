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
    id: "network",
    labelKey: "control_strip_network",
    icon: () => "chooser",
    finderIcon: "chooser",
    defaultOrder: 3,
    defaultEnabled: true,
    openOwner: "control",
    state: () => ({
      state: "ready",
      detail: navigator.onLine ? t("control_strip_browser_online") : t("control_strip_browser_offline"),
      source: "navigator.onLine",
    }),
    menu: () => {
      const items = [];
      items.push({
        type: "label",
        label: navigator.onLine ? t("control_strip_browser_online") : t("control_strip_browser_offline"),
        checked: true,
      });
      items.push({ type: "separator" });
      items.push({ type: "action", label: t("control_strip_open_control_panel"), run: () => openWindow("control") });
      return items;
    },
  },
  {
    id: "context",
    labelKey: "control_strip_context",
    icon: () => "contextPanel",
    finderIcon: "contextPanel",
    defaultOrder: 4,
    defaultEnabled: true,
    openOwner: "contextPanel",
    gauge: (state) => (state.state === "ready" ? { ratio: state.ratio } : null),
    state: () => {
      const budget = controlStripContextBudget();
      const total = Number(budget?.contextTokens || 0);
      if (!total) return { state: "unknown", detail: "", source: "context-budget" };
      const used = controlStripContextUsed(budget);
      return {
        state: "ready",
        detail: `${controlStripFormatTokens(used)} / ${controlStripFormatTokens(total)}`,
        source: "context-budget",
        ratio: Math.max(0, Math.min(1, used / total)),
      };
    },
    menu: () => {
      const budget = controlStripContextBudget();
      const total = Number(budget?.contextTokens || 0);
      const used = controlStripContextUsed(budget);
      const items = [];
      if (total) {
        items.push({
          type: "label",
          label: t("control_strip_context_usage", controlStripFormatTokens(used), controlStripFormatTokens(total)),
        });
      } else {
        items.push({ type: "label", label: t("control_strip_context_unavailable") });
      }
      items.push({ type: "separator" });
      items.push({ type: "action", label: t("control_strip_open_context_panel"), run: () => openWindow("contextPanel") });
      return items;
    },
  },
  {
    id: "indexing",
    labelKey: "control_strip_indexing",
    icon: () => "searcher",
    finderIcon: "searcher",
    defaultOrder: 5,
    defaultEnabled: true,
    openOwner: "searcher",
    gauge: (state) => (state.state === "ready" ? { ratio: state.ratio } : null),
    state: () => {
      const queueState = typeof window.AISystem6DerivedIndexQueue?.getState === "function"
        ? window.AISystem6DerivedIndexQueue.getState()
        : null;
      const jobs = queueState?.jobs || [];
      const active = jobs.filter((job) => ["pending", "running"].includes(job.status));
      const failed = jobs.filter((job) => job.status === "failed");
      if (!active.length && !failed.length) return { state: "unknown", detail: "", source: "derived-index-queue" };
      const done = jobs.filter((job) => job.status === "completed").length;
      return {
        state: active.length ? "busy" : "ready",
        detail: failed.length
          ? t("control_strip_indexing_progress_failed", done, jobs.length, failed.length)
          : `${done} / ${jobs.length}`,
        source: "derived-index-queue",
        ratio: jobs.length ? done / jobs.length : 0,
        failedCount: failed.length,
      };
    },
    menu: () => {
      const queueState = typeof window.AISystem6DerivedIndexQueue?.getState === "function"
        ? window.AISystem6DerivedIndexQueue.getState()
        : null;
      const jobs = queueState?.jobs || [];
      const done = jobs.filter((job) => job.status === "completed").length;
      const failed = jobs.filter((job) => job.status === "failed").length;
      const items = [];
      items.push({
        type: "label",
        label: failed.length
          ? t("control_strip_indexing_progress_failed", done, jobs.length, failed.length)
          : t("control_strip_indexing_progress", done, jobs.length),
      });
      if (failed.length) items.push({ type: "label", label: t("control_strip_indexing_failed_hint") });
      items.push({ type: "separator" });
      items.push({ type: "action", label: t("control_strip_open_searcher"), run: () => openWindow("searcher") });
      return items;
    },
  },
  {
    id: "longTasks",
    labelKey: "control_strip_long_tasks",
    icon: () => "systemStatus",
    finderIcon: "systemStatus",
    defaultOrder: 6,
    defaultEnabled: true,
    openOwner: "",
    state: () => {
      if (typeof activeLongTasks === "undefined" || !activeLongTasks.size) {
        return { state: "unknown", detail: "", source: "long-task-registry" };
      }
      return { state: "ready", detail: String(activeLongTasks.size), source: "long-task-registry" };
    },
    menu: () => {
      const tasks = typeof activeLongTasks === "undefined" ? [] : [...activeLongTasks];
      if (!tasks.length) return [{ type: "label", label: t("control_strip_long_tasks_none") }];
      return tasks.flatMap((key) => {
        const info = typeof longTaskReceiptInfo === "function" ? longTaskReceiptInfo(key) : {};
        const label = info.label || key;
        const item = { type: "label", label };
        const openItem = info.windowName
          ? {
              type: "action",
              label: t("control_strip_open_owner", label),
              run: () => openWindow(info.windowName),
            }
          : null;
        return openItem ? [item, openItem] : [item];
      });
    },
  },
  {
    id: "writingBell",
    labelKey: "control_strip_writing_bell",
    icon: () => "writingBell",
    finderIcon: "writingBell",
    defaultOrder: 7,
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
    id: "outputQueue",
    labelKey: "control_strip_output_queue",
    icon: () => "documents",
    finderIcon: "documents",
    defaultOrder: 8,
    defaultEnabled: true,
    openOwner: "assistant",
    state: () => {
      const count = controlStripPendingAssistantMessages().length;
      return { state: "ready", detail: String(count), source: "assistant-messages" };
    },
    menu: () => {
      const pending = controlStripPendingAssistantMessages();
      const items = pending.length
        ? pending.map((element) => ({
            type: "label",
            label: element.querySelector(".wait-title")?.textContent || t("control_strip_output_working"),
          }))
        : [{ type: "label", label: t("control_strip_output_idle") }];
      items.push({ type: "separator" });
      items.push({ type: "action", label: t("control_strip_open_assistant"), run: () => openWindow("assistant") });
      return items;
    },
  },
  {
    id: "volume",
    labelKey: "control_strip_volume",
    icon: () => "speaker",
    finderIcon: "speaker",
    defaultOrder: 9,
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
