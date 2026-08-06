// Control Strip: Mac OS 9's floating status surface, adapted to AI System 6.
//
// One-line definition: "Mac OS 9 的 Control Strip：贴底边的浮层，一排图标按钮，
// 各弹一个设置菜单，一端的把手能把整条收起来。"
//
// Fidelity note: the bundled image is System 6.0.8, which has no Control
// Strip, and no OS 8.6/9 emulator is available in this workspace, so the
// strip chrome below (handle, module buttons, pop-up direction, collapse) is
// an APPROXIMATION built from the O'Reilly Mac OS 9 chapter and the feature's
// consistent behavior — not a resource decode and not a replica. The two
// native-derived pieces are the volume gauge's 4.5 : 1 aspect (Battery DA
// DITL -15776, rect 38,17,115,34) and the Writing Bell glyph (Alarm Clock DA
// PICT -16000, native 14×17 pixels).
//
// It is a floating status surface, not a second menu bar: the module slots
// are whitelisted, a module menu only changes a setting's value or opens an
// existing window (never starts work), and the strip never joins the system
// menu bar's keyboard traversal — it is its own toolbar, reachable by Tab.
//
// Deliberate omissions (from the design doc): no left/right dragging and no
// handle-length drag (they would need drag machinery plus position
// persistence; collapsing already clears the path), no module reordering
// (slot order is the declared order), and collapse is instant (a width
// animation is forbidden by DESIGN.md).

window.AISystem6ControlStripLoaded = true;

const controlStripModuleSlots = Object.freeze([
  "soundscape",
  "projectDisk",
  "model",
  "network",
  "context",
  "indexing",
  "longTasks",
  "writingBell",
  "outputQueue",
  "volume",
]);

let stripEnabled = false;
let stripMount = null;
let stripCollapsed = false;
const stripModuleRegistry = new Map();
let stripOpenMenu = null;
let stripMessagesObserver = null;

function ensureStripMount() {
  if (stripMount) return stripMount;
  stripMount = document.createElement("div");
  stripMount.className = "control-strip";
  stripMount.dataset.controlStrip = "";
  document.body.append(stripMount);
  return stripMount;
}

function enable() {
  if (stripEnabled) return;
  stripEnabled = true;
  stripCollapsed = typeof getControlStripCollapsed === "function"
    ? getControlStripCollapsed() === true
    : false;
  if (isNarrowScreen()) stripCollapsed = true;
  ensureStripMount();
  renderStrip();
  syncStripPlacementReserve();
  window.addEventListener("online", refreshStrip);
  window.addEventListener("offline", refreshStrip);
  if (typeof messagesEl !== "undefined" && messagesEl && typeof MutationObserver !== "undefined") {
    stripMessagesObserver = new MutationObserver(refreshStrip);
    stripMessagesObserver.observe(messagesEl, { childList: true });
  }
  if (typeof ensureSoundscapeModule === "function") {
    // The volume module reads the app's audio volume, which lives in the lazy
    // Soundscape module; warm it once so the module has a real source.
    ensureSoundscapeModule().then(refreshStrip);
  }
}

function disable() {
  stripEnabled = false;
  closeStripMenu();
  stripMessagesObserver?.disconnect();
  stripMessagesObserver = null;
  if (stripMount) {
    stripMount.remove();
    stripMount = null;
  }
  syncStripPlacementReserve();
  window.removeEventListener("online", refreshStrip);
  window.removeEventListener("offline", refreshStrip);
}

function isEnabled() {
  return stripEnabled;
}

function registerModule(descriptor) {
  if (!descriptor || typeof descriptor.id !== "string" || !descriptor.id) return false;
  if (!controlStripModuleSlots.includes(descriptor.id)) return false;
  stripModuleRegistry.set(descriptor.id, descriptor);
  if (stripEnabled) renderStrip();
  return true;
}

function listModules() {
  return controlStripModuleSlots
    .map((slot) => stripModuleRegistry.get(slot) || null)
    .filter(Boolean);
}

function refreshStrip() {
  if (!stripEnabled || !stripMount) return;
  const wasOpen = stripOpenMenu;
  if (wasOpen) closeStripMenu();
  renderStrip();
}

function renderStrip() {
  if (!stripMount) return;
  stripMount.replaceChildren();
  stripMount.classList.toggle("is-collapsed", stripCollapsed);
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "control-strip-handle";
  handle.setAttribute("aria-label", t(stripCollapsed ? "control_strip_expand" : "control_strip_collapse"));
  handle.title = handle.getAttribute("aria-label");
  handle.addEventListener("click", toggleStripCollapsed);
  stripMount.append(handle);
  const modules = document.createElement("div");
  modules.className = "control-strip-modules";
  modules.setAttribute("role", "toolbar");
  modules.setAttribute("aria-label", t("control_strip_label"));
  listModules().forEach((descriptor) => {
    const button = renderModuleButton(descriptor);
    if (button) modules.append(button);
  });
  stripMount.append(modules);
}

function renderModuleButton(descriptor) {
  const state = readModuleState(descriptor);
  if (!state || state.state === "unknown") return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-strip-module";
  button.dataset.controlStripModule = descriptor.id;
  const iconId = typeof descriptor.icon === "function" ? descriptor.icon(state) : (descriptor.icon || "document");
  button.innerHTML = renderSystemIcon(iconId, { size: "mini" });
  const label = typeof descriptor.labelKey === "string" ? t(descriptor.labelKey) : descriptor.id;
  const detail = state.detail ? ` · ${state.detail}` : "";
  button.setAttribute("aria-label", `${label}${detail}`);
  button.title = button.getAttribute("aria-label");
  if (typeof descriptor.gauge === "function") {
    const gauge = descriptor.gauge(state);
    if (gauge) {
      button.classList.add("has-gauge");
      const wrap = document.createElement("span");
      wrap.className = "control-strip-gauge-wrap";
      wrap.innerHTML = `<span class="control-strip-gauge"><span class="control-strip-gauge-fill" style="--gauge-fill: ${Math.max(0, Math.min(100, Number(gauge.ratio ?? 0) * 100))}%"></span></span>`;
      button.append(wrap);
    }
  }
  button.addEventListener("click", (event) => toggleModuleMenu(descriptor, button, event));
  return button;
}

function readModuleState(descriptor) {
  if (typeof descriptor.state !== "function") return { state: "ready", detail: "", source: "static" };
  const state = descriptor.state();
  if (!state) return { state: "unknown", detail: "", source: descriptor.id };
  return state;
}

function toggleStripCollapsed() {
  setStripCollapsed(!stripCollapsed);
}

function setStripCollapsed(value) {
  stripCollapsed = value === true;
  if (typeof setControlStripCollapsed === "function") setControlStripCollapsed(stripCollapsed);
  stripMount.classList.toggle("is-collapsed", stripCollapsed);
  const handle = stripMount.querySelector(".control-strip-handle");
  if (handle) {
    const label = t(stripCollapsed ? "control_strip_expand" : "control_strip_collapse");
    handle.setAttribute("aria-label", label);
    handle.title = label;
  }
  syncStripPlacementReserve();
}

function syncStripPlacementReserve() {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("control-strip-expanded", stripEnabled && !stripCollapsed);
}

function toggleModuleMenu(descriptor, button, event) {
  event?.stopPropagation();
  if (stripOpenMenu) closeStripMenu();
  const items = typeof descriptor.menu === "function" ? descriptor.menu() : [];
  if (!items.length) return;
  const popover = document.createElement("div");
  popover.className = "menu-popover control-strip-menu";
  popover.dataset.controlStripMenu = descriptor.id;
  popover.setAttribute("role", "menu");
  items.forEach((item) => {
    if (item.type === "separator") {
      popover.append(document.createElement("hr"));
      return;
    }
    if (item.type === "label") {
      const label = document.createElement("p");
      label.className = "menu-section-label";
      label.textContent = item.label;
      popover.append(label);
      return;
    }
    const menuItem = document.createElement("button");
    menuItem.type = "button";
    menuItem.setAttribute("role", "menuitem");
    menuItem.textContent = item.label;
    if (item.checked) menuItem.classList.add("is-checked");
    if (item.disabled) menuItem.disabled = true;
    menuItem.addEventListener("click", () => {
      closeStripMenu();
      item.run?.();
      refreshStrip();
      // On phones the drawer is a temporary status surface: picking a value
      // tucks it back to the handle, like the classic strip on small screens.
      if (isNarrowScreen()) setStripCollapsed(true);
    });
    popover.append(menuItem);
  });
  document.body.append(popover);
  const rect = button.getBoundingClientRect();
  const width = popover.offsetWidth || 180;
  popover.style.setProperty("--control-strip-menu-left", `${Math.min(rect.left, Math.max(0, window.innerWidth - width - 8))}px`);
  button.classList.add("is-open");
  stripOpenMenu = { popover, button };
  document.addEventListener("pointerdown", closeStripMenuOnOutside, true);
  document.addEventListener("keydown", closeStripMenuOnEscape, true);
  popover.querySelector("button")?.focus();
}

function closeStripMenuOnOutside(event) {
  if (!stripOpenMenu) return;
  if (stripOpenMenu.popover.contains(event.target) || stripOpenMenu.button.contains(event.target)) return;
  closeStripMenu();
}

function closeStripMenuOnEscape(event) {
  if (event.key === "Escape") closeStripMenu();
}

function closeStripMenu() {
  if (!stripOpenMenu) return;
  stripOpenMenu.popover.remove();
  stripOpenMenu.button.classList.remove("is-open");
  document.removeEventListener("pointerdown", closeStripMenuOnOutside, true);
  document.removeEventListener("keydown", closeStripMenuOnEscape, true);
  stripOpenMenu = null;
}

// --- Built-in modules -------------------------------------------------------
//
// Every module follows the three-state honesty contract from the design doc:
//   { state: "unknown" | "ready" | "busy", detail, source }
// unknown is the default, not an error — a module with no real runtime source
// is not rendered, so it occupies no slot and leaves no hole. States change
// only after real events (requests return, queue lengths change, settings
// change), never optimistically at the click.

function currentModelStatus() {
  let ready = false;
  let name = "";
  if (typeof cloudConfig !== "undefined"
    && cloudConfig?.active
    && cloudConfig?.provider
    && cloudConfig?.model
    && typeof cloudCredentialReady === "function"
    && cloudCredentialReady()) {
    ready = true;
    name = cloudConfig.model;
  } else if (typeof isLocalModelIndicatorReady === "function" && isLocalModelIndicatorReady()) {
    ready = true;
    name = typeof getLocalModelDisplayName === "function"
      ? getLocalModelDisplayName()
      : t("local_model");
  }
  return { ready, name };
}

function currentVolumeSnapshot() {
  return typeof window.AISystem6Soundscape?.getVolumeSnapshot === "function"
    ? window.AISystem6Soundscape.getVolumeSnapshot()
    : null;
}

function currentVolumeLevel() {
  const snap = currentVolumeSnapshot();
  if (!snap) return -1;
  if (snap.muted) return 0;
  return Math.max(0, Math.min(7, Math.round((Number(snap.volume) || 0) / 100 * 7)));
}

function formatStripTokens(tokens) {
  const value = Math.max(0, Number(tokens) || 0);
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return String(Math.round(value));
}

function pendingAssistantMessages() {
  if (typeof messagesEl === "undefined" || !messagesEl) return [];
  return [...messagesEl.querySelectorAll(".message.assistant.pending")];
}

function currentContextBudget() {
  if (typeof lastContextBudget === "undefined") return null;
  return lastContextBudget || null;
}

function isNarrowScreen() {
  return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 640px)").matches;
}

const controlStripBuiltinModules = Object.freeze([
  {
    id: "soundscape",
    labelKey: "control_strip_soundscape",
    icon: (state) => (state.isPlaying ? "pause" : "play"),
    state: () => {
      if (!window.AISystem6SoundscapeLoaded) return { state: "unknown", detail: "", source: "soundscape" };
      const snap = window.AISystem6Soundscape?.getPlayerSnapshot?.() || null;
      if (!snap || !(snap.queue || []).length) return { state: "unknown", detail: "", source: "soundscape" };
      return {
        state: "ready",
        detail: snap.currentTitle,
        source: "soundscape",
        isPlaying: snap.isPlaying === true,
      };
    },
    menu: () => {
      const snap = window.AISystem6Soundscape?.getPlayerSnapshot?.() || { queue: [] };
      const items = [];
      items.push({
        type: "action",
        label: t(snap.isPlaying ? "control_strip_soundscape_pause" : "control_strip_soundscape_play"),
        run: () => window.AISystem6Soundscape?.runMenuCommand?.("toggle-play"),
      });
      (snap.queue || []).forEach((entry, index) => {
        items.push({
          type: "action",
          label: entry.title,
          checked: entry.current === true,
          run: () => window.AISystem6Soundscape?.playSceneIndex?.(index),
        });
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
    state: () => {
      const project = typeof getActiveProject === "function" ? getActiveProject() : null;
      return project
        ? { state: "ready", detail: project.name, source: "project-disk" }
        : { state: "unknown", detail: "", source: "project-disk" };
    },
    menu: () => {
      const project = typeof getActiveProject === "function" ? getActiveProject() : null;
      const items = [];
      if (project) items.push({ type: "label", label: project.name, checked: true });
      items.push({ type: "separator" });
      items.push({ type: "action", label: t("control_strip_open_project_disk"), run: () => openWindow("projects") });
      return items;
    },
  },
  {
    id: "model",
    labelKey: "control_strip_model",
    icon: (state) => (state.state === "ready" ? "cloudModel" : "cloudModelOff"),
    state: () => {
      const status = currentModelStatus();
      return status.ready
        ? { state: "ready", detail: status.name, source: "model-config" }
        : { state: "unknown", detail: "", source: "model-config" };
    },
    menu: () => {
      const status = currentModelStatus();
      const items = [];
      if (status.ready) items.push({ type: "label", label: status.name, checked: true });
      items.push({ type: "separator" });
      items.push({ type: "action", label: t("control_strip_open_control_panel"), run: () => openWindow("control") });
      return items;
    },
  },
  {
    id: "network",
    labelKey: "control_strip_network",
    icon: () => "chooser",
    state: () => ({
      state: "ready",
      detail: navigator.onLine ? t("control_strip_browser_online") : t("control_strip_browser_offline"),
      source: "navigator.onLine",
    }),
    menu: () => {
      const items = [];
      items.push({ type: "label", label: navigator.onLine ? t("control_strip_browser_online") : t("control_strip_browser_offline"), checked: true });
      items.push({ type: "separator" });
      items.push({ type: "action", label: t("control_strip_open_control_panel"), run: () => openWindow("control") });
      return items;
    },
  },
  {
    id: "context",
    labelKey: "control_strip_context",
    icon: () => "contextPanel",
    gauge: (state) => ({ ratio: state.ratio }),
    state: () => {
      const budget = currentContextBudget();
      const total = Number(budget?.contextTokens || 0);
      if (!total) return { state: "unknown", detail: "", source: "context-budget" };
      const used = Math.max(0, Number(typeof lastContextLoadout !== "undefined" && lastContextLoadout?.promptTokens || budget?.promptTokens || 0));
      return {
        state: "ready",
        detail: `${formatStripTokens(used)} / ${formatStripTokens(total)}`,
        source: "context-budget",
        ratio: Math.max(0, Math.min(1, used / total)),
      };
    },
    menu: () => {
      const budget = currentContextBudget();
      const total = Number(budget?.contextTokens || 0);
      const used = Math.max(0, Number(typeof lastContextLoadout !== "undefined" && lastContextLoadout?.promptTokens || budget?.promptTokens || 0));
      const items = [];
      items.push({ type: "label", label: t("control_strip_context_usage", formatStripTokens(used), formatStripTokens(total)) });
      items.push({ type: "separator" });
      items.push({ type: "action", label: t("control_strip_open_context_panel"), run: () => openWindow("contextPanel") });
      return items;
    },
  },
  {
    id: "indexing",
    labelKey: "control_strip_indexing",
    icon: () => "searcher",
    gauge: (state) => ({ ratio: state.ratio }),
    state: () => {
      const queueState = typeof window.AISystem6DerivedIndexQueue?.getState === "function"
        ? window.AISystem6DerivedIndexQueue.getState()
        : null;
      const jobs = queueState?.jobs || [];
      const pending = jobs.filter((job) => ["pending", "running", "failed"].includes(job.status));
      if (!pending.length) return { state: "unknown", detail: "", source: "derived-index-queue" };
      const done = jobs.filter((job) => job.status === "completed").length;
      return {
        state: "ready",
        detail: `${done} / ${jobs.length}`,
        source: "derived-index-queue",
        ratio: jobs.length ? done / jobs.length : 0,
      };
    },
    menu: () => {
      const queueState = typeof window.AISystem6DerivedIndexQueue?.getState === "function"
        ? window.AISystem6DerivedIndexQueue.getState()
        : null;
      const jobs = queueState?.jobs || [];
      const done = jobs.filter((job) => job.status === "completed").length;
      const items = [];
      items.push({ type: "label", label: t("control_strip_indexing_progress", done, jobs.length) });
      items.push({ type: "separator" });
      items.push({ type: "action", label: t("control_strip_open_searcher"), run: () => openWindow("searcher") });
      return items;
    },
  },
  {
    id: "longTasks",
    labelKey: "control_strip_long_tasks",
    icon: () => "systemStatus",
    state: () => {
      if (typeof activeLongTasks === "undefined" || !activeLongTasks.size) {
        return { state: "unknown", detail: "", source: "long-task-registry" };
      }
      return { state: "ready", detail: String(activeLongTasks.size), source: "long-task-registry" };
    },
    menu: () => {
      const tasks = typeof activeLongTasks === "undefined" ? [] : [...activeLongTasks];
      return tasks.map((key) => ({
        type: "label",
        label: (typeof longTaskReceiptInfo === "function" ? longTaskReceiptInfo(key).label : "") || key,
      }));
    },
  },
  {
    id: "writingBell",
    labelKey: "control_strip_writing_bell",
    icon: () => "writingBell",
    state: () => {
      if (typeof writingBellRunning === "undefined") return { state: "unknown", detail: "", source: "writing-bell" };
      return {
        state: "ready",
        detail: writingBellRunning ? t("bell_running", writingBellModeLabel()) : t("bell_ready"),
        source: "writing-bell",
      };
    },
    menu: () => [
      { type: "action", label: t("control_strip_writing_bell_on"), checked: writingBellRunning === true, run: () => startWritingBell() },
      { type: "action", label: t("control_strip_writing_bell_off"), checked: writingBellRunning !== true, run: () => pauseWritingBell() },
    ],
  },
  {
    id: "outputQueue",
    labelKey: "control_strip_output_queue",
    icon: () => "documents",
    state: () => {
      const count = pendingAssistantMessages().length;
      return { state: "ready", detail: count ? String(count) : "—", source: "assistant-messages" };
    },
    menu: () => {
      const pending = pendingAssistantMessages();
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
    gauge: (state) => (state.state === "ready" ? { ratio: currentVolumeLevel() / 7 } : null),
    state: () => {
      const snap = currentVolumeSnapshot();
      return snap
        ? { state: "ready", detail: snap.muted ? t("control_strip_volume_off") : String(currentVolumeLevel()), source: "soundscape" }
        : { state: "unknown", detail: "", source: "soundscape" };
    },
    menu: () => {
      const items = [];
      const level = currentVolumeLevel();
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

function registerBuiltinModules() {
  controlStripBuiltinModules.forEach((descriptor) => registerModule(descriptor));
}

registerBuiltinModules();

window.AISystem6ControlStrip = Object.freeze({
  enable,
  disable,
  isEnabled,
  registerModule,
  listModules,
  refreshStrip,
  getMount: () => stripMount,
  moduleSlots: controlStripModuleSlots,
});
