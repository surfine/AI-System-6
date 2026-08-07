// Control Strip: Mac OS 9's floating status surface, adapted to AI System 6.
//
// One-line definition: "Mac OS 9 的 Control Strip：贴屏幕边缘的浮层，一排图标
// 按钮，各弹一个设置菜单，一端的把手能收起来，也能拖着改长度或换位置。"
//
// Fidelity note: the bundled image is System 6.0.8, which has no Control
// Strip, and no OS 8.6/9 emulator is available in this workspace, so the
// strip chrome below (handle, module buttons, pop-up direction, collapse) is
// an APPROXIMATION built from the Mac OS 9 built-in help, Apple's Control
// Strip Modules technote, and the O'Reilly Mac OS 9 chapter — not a resource
// decode and not a replica. The two native-derived pieces are the volume
// gauge's 4.5 : 1 aspect (Battery DA DITL -15776, rect 38,17,115,34) and the
// Writing Bell glyph (Alarm Clock DA PICT -16000, native 14×17 pixels).
//
// Native behaviors reproduced here (from the Mac OS 9 help and technote):
//   - click the tab at the unanchored end to open/close the strip;
//   - drag the tab to adjust the length;
//   - hold Option and drag the tab to move the strip along either screen edge
//     (dragging across switches edges);
//   - hold Option and drag a module to reorder it;
//   - drag a module out of the strip to remove it (the module code stays);
//   - drag a module file from System Folder / Control Strip Modules onto the
//     strip to add it at the drop point.
//
// The strip is a floating status surface, not a second menu bar: it is its
// own toolbar reachable by Tab, module menus only change a setting or open an
// existing window (never start work), and it never joins the menu bar's
// keyboard traversal.

window.AISystem6ControlStripLoaded = true;

// --- Registry --------------------------------------------------------------
//
// One registry, three views: available modules (registered descriptors),
// enabled modules (user's choice), and ordered modules (user's order). The
// persisted preference record owns enabled/ordered/disabled; the registry only
// owns which descriptors exist. Built-in descriptors come from the lazy
// control-strip-modules.js file so the Finder folder and the strip share one
// source.

const stripModuleRegistry = new Map();
let stripModulesLoaded = false;
let stripModulesPromise = null;
let stripReconciling = false;

// --- Runtime state ---------------------------------------------------------

let stripEnabled = false;
let stripMount = null;
let stripOpenMenu = null;
let stripRefreshDeferred = false;
let stripRefreshFrame = 0;
let stripMessagesObserver = null;
const stripSubscriptions = new Map();
let stripSuppressClickUntil = 0;
let stripHotkeyRecording = false;
let stripDragSession = null;

const STRIP_DRAG_THRESHOLD = 5;
const STRIP_MODULE_STEP = 24;

function isNarrowScreen() {
  return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 640px)").matches;
}

function stripPrefs() {
  return typeof getControlStripState === "function" ? getControlStripState() : {};
}

function stripSavePrefs(patch = {}) {
  if (typeof setControlStripState === "function") return setControlStripState(patch);
  return stripPrefs();
}

// --- Module loading --------------------------------------------------------

function ensureModulesLoaded() {
  if (window.AISystem6ControlStripModules) {
    stripModulesLoaded = true;
    return Promise.resolve();
  }
  if (stripModulesPromise) return stripModulesPromise;
  stripModulesPromise = ensureControlStripModulesModule()
    .then(() => {
      stripModulesLoaded = true;
      return null;
    })
    .catch((error) => {
      stripModulesPromise = null;
      throw error;
    });
  return stripModulesPromise;
}

function registerBuiltinModules() {
  stripReconciling = true;
  try {
    (window.AISystem6ControlStripModules || []).forEach((descriptor) => registerModule(descriptor));
  } finally {
    stripReconciling = false;
  }
  reconcileModuleState();
}

// --- Registry API ----------------------------------------------------------

function isValidModuleDescriptor(descriptor) {
  return !!descriptor
    && typeof descriptor === "object"
    && typeof descriptor.id === "string"
    && descriptor.id.length > 0
    && (typeof descriptor.state === "function"
      || typeof descriptor.menu === "function"
      || typeof descriptor.icon === "function"
      || typeof descriptor.icon === "string");
}

function registerModule(descriptor) {
  if (!isValidModuleDescriptor(descriptor)) {
    console.warn("Control Strip rejected an invalid module descriptor.", descriptor);
    return false;
  }
  if (stripModuleRegistry.has(descriptor.id)) {
    console.warn(`Control Strip module "${descriptor.id}" is already registered.`);
    return false;
  }
  stripModuleRegistry.set(descriptor.id, descriptor);
  if (stripEnabled) {
    attachModuleSubscription(descriptor);
    if (!stripReconciling) reconcileModuleState();
    refreshStrip();
  }
  return true;
}

function unregisterModule(id) {
  const descriptor = stripModuleRegistry.get(id);
  if (!descriptor) return false;
  detachModuleSubscription(id);
  closeModuleMenuIfOpen(id);
  removeModuleButton(id);
  stripModuleRegistry.delete(id);
  descriptor.dispose?.();
  if (stripEnabled) {
    reconcileModuleState();
    refreshStrip();
  }
  return true;
}

function listModules() {
  return orderedEnabledModuleIds()
    .map((id) => stripModuleRegistry.get(id))
    .filter(Boolean);
}

// --- Preference reconciliation --------------------------------------------
//
// The persisted order is the user's order. Unknown or duplicate ids are
// cleaned; new modules (from a newer build) are appended at their default
// position without disturbing a user-adjusted order.

function dedupeIds(ids = []) {
  const seen = new Set();
  return ids.filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function reconcileModuleState() {
  if (!stripEnabled) return;
  const prefs = stripPrefs();
  const knownIds = [...stripModuleRegistry.keys()];
  const ordered = dedupeIds((prefs.moduleOrder || []).filter((id) => knownIds.includes(id)));
  const orderedSet = new Set(ordered);
  const byDefaultOrder = [...stripModuleRegistry.values()]
    .sort((a, b) => Number(a.defaultOrder) - Number(b.defaultOrder));
  byDefaultOrder.forEach((descriptor) => {
    if (orderedSet.has(descriptor.id)) return;
    ordered.push(descriptor.id);
    if (descriptor.defaultEnabled === false) {
      prefs.disabledModules = [...(prefs.disabledModules || []), descriptor.id];
    }
  });
  const disabled = dedupeIds((prefs.disabledModules || []).filter((id) => knownIds.includes(id)));
  const sameOrder = JSON.stringify(prefs.moduleOrder || []) === JSON.stringify(ordered);
  const sameDisabled = JSON.stringify(prefs.disabledModules || []) === JSON.stringify(disabled);
  if (sameOrder && sameDisabled) return;
  stripSavePrefs({ moduleOrder: ordered, disabledModules: disabled });
}

function orderedEnabledModuleIds() {
  const prefs = stripPrefs();
  const disabled = new Set(prefs.disabledModules || []);
  return (prefs.moduleOrder || []).filter((id) => !disabled.has(id) && stripModuleRegistry.has(id));
}

function moduleEnabled(id) {
  return orderedEnabledModuleIds().includes(id);
}

function setModuleEnabled(id, enabled) {
  if (!stripModuleRegistry.has(id)) return;
  const prefs = stripPrefs();
  const disabled = new Set(prefs.disabledModules || []);
  if (enabled) disabled.delete(id);
  else disabled.add(id);
  stripSavePrefs({ disabledModules: dedupeIds([...disabled]) });
  closeModuleMenuIfOpen(id);
  removeModuleButton(id);
  refreshStrip();
  if (enabled) {
    attachModuleSubscription(stripModuleRegistry.get(id));
    ensureModuleRuntime(stripModuleRegistry.get(id));
    scrollModuleIntoView(id);
  }
}

function reorderModule(moduleId, targetIndex) {
  const prefs = stripPrefs();
  const ordered = (prefs.moduleOrder || []).filter((id) => stripModuleRegistry.has(id));
  const from = ordered.indexOf(moduleId);
  if (from < 0) return;
  ordered.splice(from, 1);
  const clamped = Math.max(0, Math.min(ordered.length, Number(targetIndex) || 0));
  ordered.splice(clamped, 0, moduleId);
  stripSavePrefs({ moduleOrder: ordered });
  refreshStrip();
}

// --- Lifecycle -------------------------------------------------------------

function ensureStripMount() {
  if (stripMount) return stripMount;
  stripMount = document.createElement("div");
  stripMount.className = "control-strip";
  stripMount.dataset.controlStrip = "";
  stripMount.dataset.dropTarget = "control-strip";
  document.body.append(stripMount);
  return stripMount;
}

function enable() {
  if (stripEnabled) return;
  stripEnabled = true;
  ensureStripMount();
  buildStripShell();
  // A phone defaults to the collapsed bottom drawer: record that preference
  // on enable so the toggle can open it later (collapse is no longer forced
  // by the viewport in applyStripCollapsedClass).
  if (isNarrowScreen() && stripPrefs().collapsed !== true) {
    stripSavePrefs({ collapsed: true });
  }
  ensureModulesLoaded()
    .then(() => {
      if (!stripEnabled) return;
      registerBuiltinModules();
      renderAllModules();
      // The settings list renders when the Control Panel opens, which can
      // happen before the lazy module runtime arrives. Re-render once the
      // registry is populated so the module rows (and their icons) appear.
      renderModuleSettingsList();
      syncStripScrollButtons();
      ensureModuleRuntimes();
      syncStripGeometry();
      applyStripCollapsedClass();
      syncStripVisibleState();
    })
    .catch((error) => console.warn("Control Strip modules failed to load.", error));
  applyStripCollapsedClass();
  syncStripVisibleState();
  syncStripGeometry();
  window.addEventListener("online", onStripNetworkChange);
  window.addEventListener("offline", onStripNetworkChange);
  window.addEventListener("resize", onStripViewportChange);
  if (typeof messagesEl !== "undefined" && messagesEl && typeof MutationObserver !== "undefined") {
    stripMessagesObserver = new MutationObserver(() => refreshStrip("outputQueue"));
    stripMessagesObserver.observe(messagesEl, { childList: true, subtree: true });
  }
  document.addEventListener("keydown", handleStripHotkey, true);
}

function disable() {
  stripEnabled = false;
  closeStripMenu();
  stripMessagesObserver?.disconnect();
  stripMessagesObserver = null;
  stripSubscriptions.forEach((unsubscribe) => {
    try {
      unsubscribe?.();
    } catch {}
  });
  stripSubscriptions.clear();
  if (stripMount) {
    stripMount.remove();
    stripMount = null;
  }
  document.removeEventListener("keydown", handleStripHotkey, true);
  window.removeEventListener("online", onStripNetworkChange);
  window.removeEventListener("offline", onStripNetworkChange);
  window.removeEventListener("resize", onStripViewportChange);
  syncStripPlacementReserve();
}

function onStripNetworkChange() {
  refreshStrip("network");
}

function isEnabled() {
  return stripEnabled;
}

// --- Shell DOM -------------------------------------------------------------

function buildStripShell() {
  if (!stripMount || stripMount.querySelector(".control-strip-handle")) return;
  const scrollBack = document.createElement("button");
  scrollBack.type = "button";
  scrollBack.className = "control-strip-scroll control-strip-scroll-back";
  scrollBack.hidden = true;
  scrollBack.setAttribute("aria-label", t("control_strip_scroll_back"));
  scrollBack.addEventListener("click", () => scrollStripBy(-STRIP_MODULE_STEP));

  const modules = document.createElement("div");
  modules.className = "control-strip-modules";
  modules.setAttribute("role", "toolbar");
  modules.setAttribute("aria-label", t("control_strip_label"));
  const track = document.createElement("div");
  track.className = "control-strip-module-track";
  modules.append(track);
  modules.addEventListener("keydown", moveStripToolbarFocus);
  modules.addEventListener("wheel", onStripTrackWheel, { passive: false });

  const scrollForward = document.createElement("button");
  scrollForward.type = "button";
  scrollForward.className = "control-strip-scroll control-strip-scroll-forward";
  scrollForward.hidden = true;
  scrollForward.setAttribute("aria-label", t("control_strip_scroll_forward"));
  scrollForward.addEventListener("click", () => scrollStripBy(STRIP_MODULE_STEP));

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "control-strip-handle";
  handle.dataset.balloonHelp = "balloon_control_strip_handle";
  handle.addEventListener("click", onHandleClick);
  bindHandlePointerDrag(handle);
  handle.addEventListener("keydown", onHandleKeydown);

  // DOM order is logical, not visual: CSS mirrors it for the right edge, so
  // the saved module order never flips when the user moves the strip across.
  stripMount.append(scrollBack, modules, scrollForward, handle);
  syncStripToolbarStops(modules);
}

function renderAllModules() {
  if (!stripEnabled || !stripMount) return;
  reconcileModuleState();
  const track = stripMount.querySelector(".control-strip-module-track");
  if (!track) return;
  const previousFocused = stripMount.querySelector(".control-strip-module:focus");
  track.replaceChildren();
  listModules().forEach((descriptor) => {
    const button = renderModuleButton(descriptor);
    if (button) track.append(button);
  });
  const modules = stripMount.querySelector(".control-strip-modules");
  syncStripToolbarStops(modules, 0);
  if (previousFocused) {
    const same = stripMount.querySelector(`[data-control-strip-module="${CSS.escape(previousFocused.dataset.controlStripModule)}"]`);
    same?.focus();
  }
  syncStripScrollButtons();
}

// One toolbar, one tab stop: Tab reaches the strip, the arrow keys walk it,
// as a toolbar of controls should behave.
function syncStripToolbarStops(modules, activeIndex = 0) {
  const buttons = [...modules.querySelectorAll(".control-strip-module")];
  buttons.forEach((button, index) => {
    button.tabIndex = index === activeIndex ? 0 : -1;
  });
  return buttons;
}

function moveStripToolbarFocus(event) {
  const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  const jump = event.key === "Home" ? -Infinity : event.key === "End" ? Infinity : null;
  if (!step && jump === null) return;
  const modules = event.currentTarget;
  const buttons = [...modules.querySelectorAll(".control-strip-module")];
  if (!buttons.length) return;
  const current = buttons.indexOf(document.activeElement);
  event.preventDefault();
  let next = current;
  if (jump === -Infinity) next = 0;
  else if (jump === Infinity) next = buttons.length - 1;
  else if (current < 0) next = 0;
  else next = (current + step + buttons.length) % buttons.length;
  syncStripToolbarStops(modules, next);
  const target = buttons[next];
  target.focus();
  scrollModuleIntoView(target.dataset.controlStripModule);
}

function renderModuleButton(descriptor) {
  const state = readModuleState(descriptor);
  if (!state || state.state === "unknown") return null;
  // The Soundscape mini player is the inline player segment on the desk:
  // previous / play-pause / next sit directly in the strip, and the track
  // title still opens the full module menu. Phones keep the plain 40px
  // drawer button — the drawer's equal-width module row has no room.
  if (descriptor.miniPlayer && !isNarrowScreen() && state.state === "ready") {
    return renderMiniPlayer(descriptor, state);
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-strip-module";
  button.dataset.controlStripModule = descriptor.id;
  button.dataset.state = state.state;
  const iconId = typeof descriptor.icon === "function" ? descriptor.icon(state) : (descriptor.icon || "document");
  button.innerHTML = renderSystemIcon(iconId, { size: "mini" });
  const label = typeof descriptor.labelKey === "string" ? t(descriptor.labelKey) : descriptor.id;
  const detail = state.detail ? ` · ${state.detail}` : "";
  button.setAttribute("aria-label", `${label}${detail}`);
  button.title = button.getAttribute("aria-label");
  if (typeof descriptor.labelKey === "string") button.dataset.balloonHelp = `balloon_${descriptor.labelKey}`;
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  if (state.disabled === true) button.disabled = true;
  renderModuleGauge(button, descriptor, state);
  button.addEventListener("click", (event) => onModuleClick(descriptor, button, event));
  bindModulePointerDrag(button, descriptor.id);
  return button;
}

function renderMiniPlayer(descriptor, state) {
  const player = document.createElement("div");
  player.className = "control-strip-module control-strip-mini-player";
  player.dataset.controlStripModule = descriptor.id;
  player.dataset.state = state.state;
  player.setAttribute("role", "group");
  player.setAttribute("aria-label", t("control_strip_soundscape"));
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "control-strip-mini-control";
  prev.dataset.miniPlayer = "previous";
  prev.setAttribute("aria-label", t("control_strip_soundscape_previous"));
  prev.title = t("control_strip_soundscape_previous");
  prev.textContent = "‹";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "control-strip-mini-control control-strip-mini-toggle";
  toggle.dataset.miniPlayer = "toggle-play";
  toggle.setAttribute("aria-label", t(state.isPlaying ? "control_strip_soundscape_pause" : "control_strip_soundscape_play"));
  toggle.title = toggle.getAttribute("aria-label");
  toggle.innerHTML = renderSystemIcon(state.isPlaying ? "pause" : "play", { size: "mini" });
  const next = document.createElement("button");
  next.type = "button";
  next.className = "control-strip-mini-control";
  next.dataset.miniPlayer = "next";
  next.setAttribute("aria-label", t("control_strip_soundscape_next"));
  next.title = t("control_strip_soundscape_next");
  next.textContent = "›";
  const title = document.createElement("button");
  title.type = "button";
  title.className = "control-strip-mini-title";
  title.textContent = state.detail || t("control_strip_soundscape_no_track");
  title.title = title.textContent;
  title.setAttribute("aria-haspopup", "menu");
  title.addEventListener("click", (event) => onModuleClick(descriptor, player, event));
  player.append(prev, toggle, next, title);
  bindModulePointerDrag(player, descriptor.id);
  player.addEventListener("click", (event) => {
    const control = event.target.closest("[data-mini-player]");
    if (!control) return;
    event.preventDefault();
    event.stopPropagation();
    window.AISystem6Soundscape?.runMenuCommand?.(control.dataset.miniPlayer);
  });
  return player;
}

function updateMiniPlayer(button, descriptor, state) {
  const toggle = button.querySelector('[data-mini-player="toggle-play"]');
  if (toggle) {
    toggle.setAttribute("aria-label", t(state.isPlaying ? "control_strip_soundscape_pause" : "control_strip_soundscape_play"));
    toggle.title = toggle.getAttribute("aria-label");
    const holder = toggle.querySelector(".sys-icon");
    if (holder) {
      holder.innerHTML = button.ownerDocument.createRange().createContextualFragment(renderSystemIcon(state.isPlaying ? "pause" : "play", { size: "mini" })).firstChild.innerHTML;
    }
  }
  const title = button.querySelector(".control-strip-mini-title");
  if (title && state.detail) {
    title.textContent = state.detail;
    title.title = state.detail;
  }
  button.dataset.state = state.state;
}

function renderModuleGauge(button, descriptor, state) {
  const previous = button.querySelector(".control-strip-gauge-wrap");
  previous?.remove();
  button.classList.remove("has-gauge");
  if (typeof descriptor.gauge !== "function") return;
  const gauge = descriptor.gauge(state);
  if (!gauge) return;
  button.classList.add("has-gauge");
  const wrap = document.createElement("span");
  wrap.className = "control-strip-gauge-wrap";
  const ratio = Math.max(0, Math.min(1, Number(gauge.ratio ?? 0)));
  wrap.innerHTML = `<span class="control-strip-gauge" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}"><span class="control-strip-gauge-fill" style="--gauge-fill: ${ratio * 100}%"></span></span>`;
  button.append(wrap);
}

function updateModuleButton(moduleId, button) {
  const descriptor = stripModuleRegistry.get(moduleId);
  if (!descriptor || !stripMount) return;
  const state = readModuleState(descriptor);
  if (!state || state.state === "unknown") {
    removeModuleButton(moduleId);
    return;
  }
  const wantsMini = !!descriptor.miniPlayer && !isNarrowScreen() && state.state === "ready";
  const isMini = button.classList.contains("control-strip-mini-player");
  if (wantsMini !== isMini) {
    // Track state or the viewport switched the presentation (plain module
    // button ↔ inline mini player); swap it in place.
    const next = renderModuleButton(descriptor);
    if (next) button.replaceWith(next);
    syncStripScrollButtons();
    return;
  }
  if (wantsMini) {
    updateMiniPlayer(button, descriptor, state);
    syncStripScrollButtons();
    return;
  }
  const iconId = typeof descriptor.icon === "function" ? descriptor.icon(state) : (descriptor.icon || "document");
  const iconHolder = button.querySelector(".sys-icon");
  if (iconHolder) iconHolder.innerHTML = button.ownerDocument.createRange().createContextualFragment(renderSystemIcon(iconId, { size: "mini" })).firstChild.innerHTML;
  else button.innerHTML = renderSystemIcon(iconId, { size: "mini" });
  const label = typeof descriptor.labelKey === "string" ? t(descriptor.labelKey) : descriptor.id;
  const detail = state.detail ? ` · ${state.detail}` : "";
  button.setAttribute("aria-label", `${label}${detail}`);
  button.title = button.getAttribute("aria-label");
  button.dataset.state = state.state;
  button.disabled = state.disabled === true;
  renderModuleGauge(button, descriptor, state);
  syncStripScrollButtons();
}

function readModuleState(descriptor) {
  if (typeof descriptor.state !== "function") return { state: "ready", detail: "", source: "static" };
  const state = descriptor.state();
  if (!state) return { state: "unknown", detail: "", source: descriptor.id };
  return state;
}

function removeModuleButton(moduleId) {
  if (!stripMount) return;
  const button = stripMount.querySelector(`[data-control-strip-module="${CSS.escape(moduleId)}"]`);
  button?.remove();
  const modules = stripMount.querySelector(".control-strip-modules");
  if (modules) {
    const buttons = syncStripToolbarStops(modules, 0);
    if (!buttons.some((item) => item.contains(document.activeElement))) {
      buttons[0]?.focus();
    }
  }
  syncStripScrollButtons();
}

// A module may be unknown at the initial render (its lazy source is still
// loading) and become ready a moment later. The per-module refresh path must
// then create its button in the correct slot instead of waiting for a full
// redraw that may never come.
function ensureModuleButton(moduleId) {
  if (!stripEnabled || !stripMount) return;
  const descriptor = stripModuleRegistry.get(moduleId);
  if (!descriptor || !moduleEnabled(moduleId)) return;
  const state = readModuleState(descriptor);
  if (!state || state.state === "unknown") return;
  if (stripMount.querySelector(`[data-control-strip-module="${CSS.escape(moduleId)}"]`)) return;
  const track = stripMount.querySelector(".control-strip-module-track");
  if (!track) return;
  const button = renderModuleButton(descriptor);
  if (!button) return;
  const ordered = (stripPrefs().moduleOrder || []).filter((id) => stripModuleRegistry.has(id));
  const index = ordered.indexOf(moduleId);
  const rendered = [...track.querySelectorAll(".control-strip-module")]
    .map((item) => item.dataset.controlStripModule);
  const beforeId = rendered.find((id) => ordered.indexOf(id) > index);
  const beforeEl = beforeId
    ? track.querySelector(`[data-control-strip-module="${CSS.escape(beforeId)}"]`)
    : null;
  if (beforeEl) track.insertBefore(button, beforeEl);
  else track.append(button);
  syncStripToolbarStops(stripMount.querySelector(".control-strip-modules"), 0);
  syncStripScrollButtons();
}

// --- Refresh ---------------------------------------------------------------

// Per-module refresh updates the button and the open menu in place, so a
// streaming reply or an index job never closes the menu or steals focus. A
// full refresh (order/registry change) is deferred while a menu is open and
// coalesced to one frame.
function refreshStrip(moduleId) {
  if (!stripEnabled || !stripMount) return;
  if (moduleId) {
    const button = stripMount.querySelector(`[data-control-strip-module="${CSS.escape(moduleId)}"]`);
    if (button) updateModuleButton(moduleId, button);
    else ensureModuleButton(moduleId);
    if (stripOpenMenu?.moduleId === moduleId) updateOpenMenu(moduleId);
    return;
  }
  if (stripOpenMenu) {
    stripRefreshDeferred = true;
    return;
  }
  if (stripRefreshFrame) return;
  const scheduleFrame = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (callback) => setTimeout(callback, 0);
  stripRefreshFrame = scheduleFrame(() => {
    stripRefreshFrame = 0;
    if (!stripEnabled || !stripMount) return;
    renderAllModules();
  });
}

function refreshLanguage() {
  if (!stripMount) return;
  const handle = stripMount.querySelector(".control-strip-handle");
  if (handle) {
    const collapsed = stripPrefs().collapsed === true;
    const label = t(collapsed ? "control_strip_expand" : "control_strip_collapse");
    handle.setAttribute("aria-label", label);
    handle.title = label;
  }
  const back = stripMount.querySelector(".control-strip-scroll-back");
  const forward = stripMount.querySelector(".control-strip-scroll-forward");
  back?.setAttribute("aria-label", t("control_strip_scroll_back"));
  forward?.setAttribute("aria-label", t("control_strip_scroll_forward"));
  stripMount.querySelector(".control-strip-modules")?.setAttribute("aria-label", t("control_strip_label"));
  orderedEnabledModuleIds().forEach((id) => {
    const button = stripMount.querySelector(`[data-control-strip-module="${CSS.escape(id)}"]`);
    if (button) updateModuleButton(id, button);
  });
  if (stripOpenMenu) updateOpenMenu(stripOpenMenu.moduleId);
  renderSettings();
  if (typeof window.AISystem6ControlStripModulesFolder?.refreshLanguage === "function") {
    window.AISystem6ControlStripModulesFolder.refreshLanguage();
  }
}

// --- Collapse / visibility -------------------------------------------------

function setStripCollapsed(value) {
  stripSavePrefs({ collapsed: value === true });
  applyStripCollapsedClass();
  syncStripPlacementReserve();
  syncStripScrollButtons();
}

function applyStripCollapsedClass() {
  if (!stripMount) return;
  // Narrow screens default to the collapsed drawer (onStripViewportChange
  // writes collapsed: true when the viewport shrinks), but the toggle must
  // still be able to open it — forcing collapse here made the handle a
  // one-way switch on phones.
  const collapsed = stripPrefs().collapsed === true;
  stripMount.classList.toggle("is-collapsed", collapsed);
  const handle = stripMount.querySelector(".control-strip-handle");
  if (handle) {
    const label = t(collapsed ? "control_strip_expand" : "control_strip_collapse");
    handle.setAttribute("aria-label", label);
    handle.title = label;
  }
}

function syncStripVisibleState() {
  if (!stripMount) return;
  const visible = stripPrefs().visible !== false;
  stripMount.hidden = !visible;
  if (visible) syncStripPlacementReserve();
}

function toggleStripCollapsed() {
  setStripCollapsed(!(stripPrefs().collapsed === true));
}

function onHandleClick() {
  if (performance.now() < stripSuppressClickUntil) return;
  toggleStripCollapsed();
  if (isNarrowScreen()) syncStripGeometry();
}

function syncStripPlacementReserve() {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("control-strip-expanded", stripEnabled && stripPrefs().visible !== false && !(stripPrefs().collapsed === true));
}

// --- Geometry --------------------------------------------------------------

function controlStripReadToken(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function controlStripThickness() {
  const mount = stripMount;
  if (mount) {
    const rect = mount.getBoundingClientRect();
    if (rect.height) return rect.height;
  }
  return controlStripReadToken("--control-strip-thickness", 26);
}

function controlStripHandleWidth() {
  return controlStripReadToken("--control-strip-handle-width", 16);
}

function controlStripGeometryBounds() {
  const menuBar = document.querySelector(".menu-bar");
  const menuBarHeight = menuBar?.offsetHeight || controlStripReadToken("--system-menu-height", 26);
  const gap = controlStripReadToken("--desk-edge-gap", 10);
  const thickness = controlStripThickness();
  const viewportHeight = window.innerHeight;
  const available = Math.max(0, viewportHeight - menuBarHeight - thickness - gap);
  return { menuBarHeight, gap, thickness, viewportHeight, available };
}

function controlStripMaxLength() {
  const handleWidth = controlStripHandleWidth();
  const scrollWidth = controlStripReadToken("--control-strip-scroll-button-width", 14);
  const moduleWidth = STRIP_MODULE_STEP;
  return Math.max(handleWidth + scrollWidth * 2 + moduleWidth, window.innerWidth - 16);
}

function syncStripGeometry() {
  if (!stripMount) return;
  const prefs = stripPrefs();
  stripMount.dataset.edge = prefs.edge === "right" ? "right" : "left";
  if (isNarrowScreen()) return;
  const bounds = controlStripGeometryBounds();
  const maxLength = controlStripMaxLength();
  const length = prefs.expandedLength > 0 ? Math.min(prefs.expandedLength, maxLength) : 0;
  const clampedRatio = Math.max(0, Math.min(1, Number(prefs.offsetRatio) || 0));
  const top = bounds.menuBarHeight + clampedRatio * bounds.available;
  stripMount.style.setProperty("--control-strip-top", `${Math.round(top)}px`);
  stripMount.style.setProperty("--control-strip-length", length ? `${Math.round(length)}px` : "");
  stripMount.classList.toggle("is-fixed-length", length > 0);
  applyStripScrollOffset();
  syncStripScrollButtons();
}

function onStripViewportChange() {
  if (!stripEnabled) return;
  const prefs = stripPrefs();
  const maxLength = controlStripMaxLength();
  const patch = {};
  if (prefs.expandedLength > maxLength) patch.expandedLength = maxLength;
  if (isNarrowScreen() && prefs.collapsed !== true) patch.collapsed = true;
  if (Object.keys(patch).length) stripSavePrefs(patch);
  clampStripScrollOffset();
  syncStripGeometry();
  applyStripCollapsedClass();
  // Desktop ↔ phone resizes switch the Soundscape module between its inline
  // mini player and the plain drawer button.
  refreshStrip();
}

// --- Handle drag (resize / move) -------------------------------------------

function bindHandlePointerDrag(handle) {
  handle.addEventListener("pointerdown", (event) => {
    if (isNarrowScreen() || event.button !== 0) return;
    stripDragSession = {
      kind: "handle",
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      mode: event.altKey ? "move" : "resize",
    };
    try {
      handle.setPointerCapture?.(event.pointerId);
    } catch {}
  });
  handle.addEventListener("pointermove", (event) => {
    const session = stripDragSession;
    if (!session || session.kind !== "handle") return;
    if (!session.dragging) {
      if (Math.abs(event.clientX - session.startX) + Math.abs(event.clientY - session.startY) < STRIP_DRAG_THRESHOLD) return;
      session.dragging = true;
      handle.classList.add("is-dragging");
      stripSuppressClickUntil = performance.now() + 250;
    }
    const prefs = stripPrefs();
    if (session.mode === "move") {
      const bounds = controlStripGeometryBounds();
      const nextRatio = bounds.available > 0
        ? (event.clientY - bounds.menuBarHeight) / bounds.available
        : 0;
      prefs.offsetRatio = Math.max(0, Math.min(1, nextRatio));
      const nextEdge = event.clientX < window.innerWidth / 2 ? "left" : "right";
      prefs.edge = nextEdge;
      stripMount.dataset.edge = nextEdge;
      syncStripGeometry();
    } else {
      const maxLength = controlStripMaxLength();
      const nextLength = prefs.edge === "right"
        ? Math.max(0, window.innerWidth - event.clientX)
        : event.clientX;
      prefs.expandedLength = Math.max(0, Math.min(maxLength, Math.round(nextLength)));
      syncStripGeometry();
    }
  });
  const finish = (event) => {
    const session = stripDragSession;
    if (!session || session.kind !== "handle") return;
    stripDragSession = null;
    handle.classList.remove("is-dragging");
    if (!session.dragging) return;
    const prefs = stripPrefs();
    if (session.mode === "move") {
      stripSavePrefs({ edge: prefs.edge, offsetRatio: prefs.offsetRatio });
      if (typeof setStatus === "function") {
        setStatus(t("control_strip_moved", prefs.edge === "right" ? t("control_strip_edge_right") : t("control_strip_edge_left")));
      }
    } else {
      stripSavePrefs({ expandedLength: prefs.expandedLength });
      if (typeof setStatus === "function") setStatus(t("control_strip_resized"));
    }
    clampStripScrollOffset();
    syncStripGeometry();
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", () => {
    stripDragSession = null;
    handle.classList.remove("is-dragging");
  });
}

// Keyboard alternative for the handle: Shift+arrows resize, Option+arrows
// move or switch edges, Enter/Space collapse (native button click).
function onHandleKeydown(event) {
  if (isNarrowScreen()) return;
  const prefs = stripPrefs();
  const step = STRIP_MODULE_STEP;
  if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? step : -step;
    const maxLength = controlStripMaxLength();
    const next = Math.max(0, Math.min(maxLength, Math.round((prefs.expandedLength || 0) + (prefs.edge === "right" ? -delta : delta))));
    stripSavePrefs({ expandedLength: next });
    syncStripGeometry();
    return;
  }
  if (event.altKey) {
    event.preventDefault();
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const delta = event.key === "ArrowUp" ? -0.05 : 0.05;
      stripSavePrefs({ offsetRatio: Math.max(0, Math.min(1, (Number(prefs.offsetRatio) || 0) + delta)) });
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const nextEdge = prefs.edge === "right" ? "left" : "right";
      stripSavePrefs({ edge: nextEdge });
      stripMount.dataset.edge = nextEdge;
    } else {
      return;
    }
    syncStripGeometry();
  }
}

// --- Module pointer drag (reorder / drag out) ------------------------------

function moduleDropTarget(event) {
  const edge = stripPrefs().edge === "right" ? "right" : "left";
  const ordered = (stripPrefs().moduleOrder || []).filter((id) => stripModuleRegistry.has(id));
  const buttons = [...stripMount.querySelectorAll(".control-strip-module")]
    .filter((button) => !button.classList.contains("is-dragging"));
  const pointerX = event.clientX;
  const target = edge === "left"
    ? buttons.find((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left + rect.width / 2 > pointerX;
    })
    : buttons.find((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left + rect.width / 2 < pointerX;
    });
  if (!target) return { index: ordered.length, buttonId: "" };
  const index = ordered.indexOf(target.dataset.controlStripModule);
  return { index: index < 0 ? ordered.length : index, buttonId: target.dataset.controlStripModule };
}

// Visual only: moving the dragged node in the DOM would drop its pointer
// capture (remove + reinsert), so the drag marks the insertion point instead
// and commits the order on pointerup.
function markStripDropIndex(targetButtonId) {
  const track = stripMount?.querySelector(".control-strip-module-track");
  if (!track) return;
  track.querySelectorAll(".is-drop-before").forEach((element) => element.classList.remove("is-drop-before"));
  if (!targetButtonId) return;
  track.querySelector(`[data-control-strip-module="${CSS.escape(targetButtonId)}"]`)
    ?.classList.add("is-drop-before");
}

function clearStripDropMarks() {
  stripMount?.querySelectorAll(".is-drop-before").forEach((element) => element.classList.remove("is-drop-before"));
}

function bindModulePointerDrag(button, moduleId) {
  button.addEventListener("pointerdown", (event) => {
    if (isNarrowScreen() || event.button !== 0) return;
    stripDragSession = {
      kind: "module",
      moduleId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      reorder: event.altKey,
      targetIndex: -1,
    };
    try {
      button.setPointerCapture?.(event.pointerId);
    } catch {}
  });
  button.addEventListener("pointermove", (event) => {
    const session = stripDragSession;
    if (!session || session.kind !== "module" || session.moduleId !== moduleId) return;
    if (!session.dragging) {
      if (Math.abs(event.clientX - session.startX) + Math.abs(event.clientY - session.startY) < STRIP_DRAG_THRESHOLD) return;
      session.dragging = true;
      stripSuppressClickUntil = performance.now() + 250;
      button.classList.add("is-dragging");
    }
    if (session.reorder) {
      const target = moduleDropTarget(event);
      session.targetIndex = target.index;
      session.targetButtonId = target.buttonId;
      markStripDropIndex(target.buttonId);
    }
  });
  const finish = (event) => {
    const session = stripDragSession;
    if (!session || session.kind !== "module" || session.moduleId !== moduleId) return;
    stripDragSession = null;
    button.classList.remove("is-dragging");
    if (!session.dragging) return;
    if (session.reorder) {
      const prefs = stripPrefs();
      const ordered = (prefs.moduleOrder || []).filter((id) => stripModuleRegistry.has(id));
      const from = ordered.indexOf(moduleId);
      if (from >= 0) ordered.splice(from, 1);
      let target = Math.max(0, session.targetIndex >= 0 ? session.targetIndex : ordered.length);
      if (from >= 0 && from < target && target < ordered.length) target -= 1;
      target = Math.max(0, Math.min(ordered.length, target));
      ordered.splice(target, 0, moduleId);
      clearStripDropMarks();
      stripSavePrefs({ moduleOrder: ordered });
      renderAllModules();
      if (typeof setStatus === "function") setStatus(t("control_strip_reordered"));
      return;
    }
    clearStripDropMarks();
    const mountRect = stripMount.getBoundingClientRect();
    const inside = event.clientX >= mountRect.left && event.clientX <= mountRect.right
      && event.clientY >= mountRect.top && event.clientY <= mountRect.bottom;
    if (!inside) {
      setModuleEnabled(moduleId, false);
      if (typeof setStatus === "function") setStatus(t("control_strip_module_removed", moduleLabel(moduleId)));
    }
  };
  button.addEventListener("pointerup", finish);
  button.addEventListener("pointercancel", () => {
    stripDragSession = null;
    button.classList.remove("is-dragging");
  });
}

function moduleLabel(moduleId) {
  const descriptor = stripModuleRegistry.get(moduleId);
  return descriptor?.labelKey ? t(descriptor.labelKey) : moduleId;
}

// --- Module drop from the Control Strip Modules folder ---------------------

function handleModuleDrop(dragData, event) {
  const moduleId = dragData?.moduleId;
  if (!moduleId || !stripModuleRegistry.has(moduleId)) return;
  const prefs = stripPrefs();
  const disabled = new Set(prefs.disabledModules || []);
  disabled.delete(moduleId);
  const ordered = (prefs.moduleOrder || []).filter((id) => stripModuleRegistry.has(id));
  const target = typeof event?.clientX === "number"
    ? moduleDropTarget(event)
    : { index: ordered.length, buttonId: "" };
  const from = ordered.indexOf(moduleId);
  if (from >= 0) ordered.splice(from, 1);
  let targetIndex = Math.max(0, target.index);
  if (from >= 0 && from < targetIndex && targetIndex < ordered.length) targetIndex -= 1;
  targetIndex = Math.max(0, Math.min(ordered.length, targetIndex));
  ordered.splice(targetIndex, 0, moduleId);
  stripSavePrefs({ disabledModules: dedupeIds([...disabled]), moduleOrder: ordered });
  ensureModuleRuntime(stripModuleRegistry.get(moduleId)).then(() => {
    if (stripEnabled) {
      attachModuleSubscription(stripModuleRegistry.get(moduleId));
      refreshStrip(moduleId);
    }
  });
  refreshStrip();
  scrollModuleIntoView(moduleId);
  if (typeof setStatus === "function") {
    setStatus(t("control_strip_module_added", moduleLabel(moduleId)));
  }
}

// --- Module menus ----------------------------------------------------------

function onModuleClick(descriptor, button, event) {
  event?.stopPropagation();
  if (performance.now() < stripSuppressClickUntil) return;
  ensureModuleRuntime(descriptor);
  // Switching modules keeps the deferred redraw pending: flushing it here
  // would replace the very button this call is about to anchor the menu to.
  if (stripOpenMenu) closeStripMenu({ flush: false });
  const items = typeof descriptor.menu === "function" ? descriptor.menu() : [];
  if (!items.length) return;
  const popover = document.createElement("div");
  popover.className = "menu-popover control-strip-menu";
  popover.dataset.controlStripMenu = descriptor.id;
  popover.setAttribute("role", "menu");
  popover.style.setProperty("--control-strip-menu-font", controlStripMenuFontStack());
  popover.style.setProperty("--control-strip-menu-font-size", `${stripPrefs().menuFontSize || 12}px`);
  renderMenuItems(popover, items);
  popover.addEventListener("keydown", moveStripMenuFocus);
  document.body.append(popover);
  const rect = button.getBoundingClientRect();
  const width = popover.offsetWidth || 180;
  popover.style.setProperty("--control-strip-menu-left", `${Math.min(rect.left, Math.max(0, window.innerWidth - width - 8))}px`);
  button.classList.add("is-open");
  button.setAttribute("aria-expanded", "true");
  stripOpenMenu = { popover, button, moduleId: descriptor.id };
  document.addEventListener("pointerdown", closeStripMenuOnOutside, true);
  document.addEventListener("keydown", closeStripMenuOnEscape, true);
  popover.querySelector("button")?.focus();
}

function renderMenuItems(popover, items) {
  popover.replaceChildren();
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
      refreshStrip(stripOpenMenu ? null : undefined);
      // On phones the drawer is a temporary status surface: picking a value
      // tucks it back to the handle, like the classic strip on small screens.
      if (isNarrowScreen()) setStripCollapsed(true);
    });
    popover.append(menuItem);
  });
}

function updateOpenMenu(moduleId) {
  if (!stripOpenMenu || stripOpenMenu.moduleId !== moduleId) return;
  const descriptor = stripModuleRegistry.get(moduleId);
  if (!descriptor) {
    closeStripMenu();
    return;
  }
  const items = typeof descriptor.menu === "function" ? descriptor.menu() : [];
  const popover = stripOpenMenu.popover;
  const previousIndex = [...popover.querySelectorAll("button")].indexOf(document.activeElement);
  renderMenuItems(popover, items);
  const buttons = [...popover.querySelectorAll("button")];
  if (buttons.length) {
    const target = buttons[Math.max(0, Math.min(previousIndex, buttons.length - 1))];
    if (previousIndex >= 0 && target && popover.contains(document.activeElement)) target.focus();
    else if (previousIndex < 0) target.focus();
  }
}

function moveStripMenuFocus(event) {
  const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
  if (!step) return;
  const items = [...event.currentTarget.querySelectorAll("button:not(:disabled)")];
  const current = items.indexOf(document.activeElement);
  if (!items.length) return;
  event.preventDefault();
  items[(Math.max(0, current) + step + items.length) % items.length].focus();
}

function closeStripMenuOnOutside(event) {
  if (!stripOpenMenu) return;
  if (stripOpenMenu.popover.contains(event.target) || stripOpenMenu.button.contains(event.target)) return;
  closeStripMenu();
}

function closeStripMenuOnEscape(event) {
  if (event.key === "Escape") closeStripMenu({ restoreFocus: true });
}

function closeStripMenu({ flush = true, restoreFocus = false } = {}) {
  if (!stripOpenMenu) return;
  const moduleId = stripOpenMenu.button.dataset.controlStripModule;
  stripOpenMenu.popover.remove();
  stripOpenMenu.button.classList.remove("is-open");
  stripOpenMenu.button.setAttribute("aria-expanded", "false");
  document.removeEventListener("pointerdown", closeStripMenuOnOutside, true);
  document.removeEventListener("keydown", closeStripMenuOnEscape, true);
  stripOpenMenu = null;
  if (flush && stripRefreshDeferred) {
    stripRefreshDeferred = false;
    refreshStrip();
  }
  // Escape hands the keyboard back to the module button, which the deferred
  // redraw above may have replaced — find it again by slot, not by reference.
  if (restoreFocus) {
    stripMount?.querySelector(`[data-control-strip-module="${CSS.escape(moduleId)}"]`)?.focus();
  }
}

function closeModuleMenuIfOpen(moduleId) {
  if (stripOpenMenu?.moduleId === moduleId) closeStripMenu({ restoreFocus: false });
}

function controlStripMenuFontStack() {
  const choice = stripPrefs().menuFont || "";
  if (choice === "Chicago") return "Chicago_12, Chicago, Charcoal, serif";
  if (choice === "Monaco") return "Monaco, 'Courier New', monospace";
  if (choice === "modern") return "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif";
  return "var(--ui-font)";
}

// --- Scroll ----------------------------------------------------------------

function controlStripScrollRange() {
  if (!stripMount) return 0;
  const track = stripMount.querySelector(".control-strip-module-track");
  const modules = stripMount.querySelector(".control-strip-modules");
  if (!track || !modules) return 0;
  return Math.max(0, track.scrollWidth - modules.clientWidth);
}

function applyStripScrollOffset() {
  if (!stripMount || isNarrowScreen()) return;
  const offset = Math.max(0, Number(stripPrefs().scrollOffset) || 0);
  stripMount.style.setProperty("--control-strip-scroll", `${Math.min(offset, controlStripScrollRange())}px`);
  syncStripScrollButtons();
}

function clampStripScrollOffset() {
  const range = controlStripScrollRange();
  const offset = Math.max(0, Number(stripPrefs().scrollOffset) || 0);
  if (offset > range) stripSavePrefs({ scrollOffset: range });
}

function scrollStripBy(delta) {
  if (isNarrowScreen()) {
    const modules = stripMount?.querySelector(".control-strip-modules");
    if (!modules) return;
    modules.scrollBy({ left: delta, behavior: "smooth" });
    return;
  }
  const range = controlStripScrollRange();
  const current = Math.max(0, Number(stripPrefs().scrollOffset) || 0);
  const next = Math.max(0, Math.min(range, current + delta));
  stripSavePrefs({ scrollOffset: next });
  applyStripScrollOffset();
}

function scrollModuleIntoView(moduleId) {
  if (!stripMount) return;
  const button = stripMount.querySelector(`[data-control-strip-module="${CSS.escape(moduleId)}"]`);
  if (!button) return;
  if (isNarrowScreen()) {
    button.scrollIntoView({ inline: "nearest", block: "nearest" });
    return;
  }
  const modules = stripMount.querySelector(".control-strip-modules");
  const track = stripMount.querySelector(".control-strip-module-track");
  if (!modules || !track) return;
  const modulesRect = modules.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const current = Math.max(0, Number(stripPrefs().scrollOffset) || 0);
  let next = current;
  if (buttonRect.left < modulesRect.left) {
    next = current - (modulesRect.left - buttonRect.left);
  } else if (buttonRect.right > modulesRect.right) {
    next = current + (buttonRect.right - modulesRect.right);
  }
  next = Math.max(0, Math.min(controlStripScrollRange(), Math.round(next)));
  stripSavePrefs({ scrollOffset: next });
  applyStripScrollOffset();
}

function syncStripScrollButtons() {
  if (!stripMount) return;
  const collapsed = stripPrefs().collapsed === true;
  const back = stripMount.querySelector(".control-strip-scroll-back");
  const forward = stripMount.querySelector(".control-strip-scroll-forward");
  if (!back || !forward) return;
  if (collapsed || isNarrowScreen()) {
    back.hidden = true;
    forward.hidden = true;
    return;
  }
  const range = controlStripScrollRange();
  const offset = Math.max(0, Number(stripPrefs().scrollOffset) || 0);
  back.hidden = range <= 0;
  forward.hidden = range <= 0;
  back.disabled = range <= 0 || offset <= 0;
  forward.disabled = range <= 0 || offset >= range;
  stripMount.classList.toggle("has-scroll-buttons", range > 0);
}

function onStripTrackWheel(event) {
  if (isNarrowScreen()) {
    const modules = stripMount?.querySelector(".control-strip-modules");
    if (!modules || controlStripScrollRange() <= 0) return;
    event.preventDefault();
    modules.scrollLeft += event.deltaY || event.deltaX;
    return;
  }
  if (controlStripScrollRange() <= 0) return;
  const delta = (event.deltaY || event.deltaX || 0) * (Math.abs(event.deltaY) > Math.abs(event.deltaX) ? 1 : 1);
  event.preventDefault();
  scrollStripBy(Math.round(delta));
}

// --- Subscriptions & runtimes ---------------------------------------------

function attachModuleSubscription(descriptor) {
  if (typeof descriptor.subscribe !== "function") return;
  if (stripSubscriptions.has(descriptor.id)) return;
  const unsubscribe = descriptor.subscribe(() => refreshStrip(descriptor.id));
  // Only a real unsubscribe marks the module as subscribed. A null return
  // (lazy adapter not loaded yet) leaves the slot open so the runtime-ready
  // re-attach can register the actual listener.
  if (typeof unsubscribe === "function") {
    stripSubscriptions.set(descriptor.id, unsubscribe);
  }
}

function detachModuleSubscription(moduleId) {
  const unsubscribe = stripSubscriptions.get(moduleId);
  try {
    unsubscribe?.();
  } catch {}
  stripSubscriptions.delete(moduleId);
}

function ensureModuleRuntime(descriptor) {
  if (typeof descriptor?.ensureRuntime !== "function") return Promise.resolve();
  try {
    return Promise.resolve(descriptor.ensureRuntime()).catch(() => {
      // Lazy modules can fail once under load (script timeout, momentary
      // network stall). Retry once shortly after so the strip self-heals
      // instead of leaving the module permanently dark.
      return new Promise((resolve) => {
        setTimeout(() => {
          try {
            Promise.resolve(descriptor.ensureRuntime()).catch(() => null).then(resolve);
          } catch {
            resolve(null);
          }
        }, 1200);
      });
    });
  } catch {
    return Promise.resolve(null);
  }
}

function ensureModuleRuntimes() {
  listModules().forEach((descriptor) => {
    attachModuleSubscription(descriptor);
    // The Soundscape adapter is lazy: the first attach may run before its API
    // exists. Re-attach once the runtime is actually loaded (idempotent), so
    // the strip's live updates work even though the window was never opened.
    ensureModuleRuntime(descriptor).then(() => {
      if (!stripEnabled) return;
      attachModuleSubscription(descriptor);
      refreshStrip(descriptor.id);
    });
  });
}

// --- Hotkey ----------------------------------------------------------------

function normalizeHotkeyKey(key) {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function hotkeyPartsFromEvent(event) {
  const parts = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.metaKey) parts.push("Cmd");
  if (event.shiftKey) parts.push("Shift");
  const key = normalizeHotkeyKey(event.key);
  if (!["Alt", "Control", "Ctrl", "Meta", "Shift"].includes(event.key) && key !== "") parts.push(key);
  return parts;
}

function formatHotkeyForDisplay(value) {
  return String(value || "").split("+").map((part) => part === "Alt" ? "Option" : part).join("+");
}

function beginHotkeyRecording() {
  stripHotkeyRecording = true;
  if (controlStripHotkeyInput) {
    controlStripHotkeyInput.focus();
    controlStripHotkeyInput.setAttribute("aria-pressed", "true");
  }
}

function clearHotkey() {
  stripHotkeyRecording = false;
  stripSavePrefs({ hotkey: "" });
  renderSettings();
}

function captureHotkey(event) {
  if (!stripHotkeyRecording) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    stripHotkeyRecording = false;
    renderSettings();
    return;
  }
  const parts = hotkeyPartsFromEvent(event);
  const hasModifier = parts.some((part) => ["Ctrl", "Alt", "Cmd"].includes(part));
  const key = parts[parts.length - 1];
  if (!hasModifier || parts.length < 2 || ["Ctrl", "Alt", "Cmd", "Shift"].includes(key)) {
    if (typeof setStatus === "function") setStatus(t("control_strip_hotkey_invalid"));
    return;
  }
  stripSavePrefs({ hotkey: parts.join("+") });
  stripHotkeyRecording = false;
  renderSettings();
  if (typeof setStatus === "function") setStatus(t("control_strip_hotkey_set", formatHotkeyForDisplay(parts.join("+"))));
}

function handleStripHotkey(event) {
  const hotkey = stripPrefs().hotkey || "";
  if (!hotkey || !stripEnabled) return;
  const target = event.target;
  const editable = target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']")
    || target?.closest?.("[contenteditable='true'], [contenteditable=''], input, textarea, select");
  if (editable) return;
  const parts = hotkeyPartsFromEvent(event);
  if (parts.join("+") !== hotkey) return;
  event.preventDefault();
  const prefs = stripPrefs();
  stripSavePrefs({ visible: prefs.visible !== false ? false : true });
  syncStripVisibleState();
  syncStripPlacementReserve();
  if (typeof setStatus === "function") {
    setStatus(t(prefs.visible !== false ? "control_strip_hidden" : "control_strip_shown"));
  }
}

// --- Control Panel settings ------------------------------------------------

function renderSettings() {
  if (typeof controlStripModuleList === "undefined" || !controlStripModuleList) return;
  if (controlStripShowInput) controlStripShowInput.checked = stripPrefs().enabled === true;
  if (controlStripHotkeyInput) {
    controlStripHotkeyInput.value = stripPrefs().hotkey
      ? formatHotkeyForDisplay(stripPrefs().hotkey)
      : "";
    controlStripHotkeyInput.setAttribute("aria-pressed", stripHotkeyRecording ? "true" : "false");
  }
  if (controlStripFontSelect) controlStripFontSelect.value = stripPrefs().menuFont || "";
  if (controlStripFontSizeSelect) {
    const current = Number(stripPrefs().menuFontSize) || 12;
    if (controlStripFontSizeSelect.options.length === 0) {
      [9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24].forEach((size) => {
        const option = document.createElement("option");
        option.value = String(size);
        option.textContent = String(size);
        controlStripFontSizeSelect.append(option);
      });
    }
    controlStripFontSizeSelect.value = String(current);
  }
  renderModuleSettingsList();
}

function renderModuleSettingsList() {
  if (typeof controlStripModuleList === "undefined" || !controlStripModuleList) return;
  controlStripModuleList.replaceChildren();
  const known = [...stripModuleRegistry.values()].sort((a, b) => Number(a.defaultOrder) - Number(b.defaultOrder));
  const prefs = stripPrefs();
  const disabled = new Set(prefs.disabledModules || []);
  const ordered = (prefs.moduleOrder || []).filter((id) => stripModuleRegistry.has(id));
  const rows = [];
  ordered.forEach((id) => {
    const descriptor = stripModuleRegistry.get(id);
    if (descriptor) rows.push({ descriptor, enabled: !disabled.has(id) });
  });
  known.forEach((descriptor) => {
    if (rows.some((row) => row.descriptor.id === descriptor.id)) return;
    rows.push({ descriptor, enabled: !disabled.has(descriptor.id) });
  });
  rows.forEach((row, index) => {
    const item = document.createElement("li");
    item.className = "control-strip-module-row";
    item.dataset.controlStripSettingsModule = row.descriptor.id;
    item.classList.toggle("is-selected", stripSelectedModuleId === row.descriptor.id);
    item.classList.toggle("is-disabled", !row.enabled);
    const icon = document.createElement("span");
    icon.className = "control-strip-settings-icon";
    icon.innerHTML = renderSystemIcon(row.descriptor.finderIcon || "document", { size: "mini" });
    const name = document.createElement("span");
    name.className = "control-strip-settings-name";
    name.textContent = moduleLabel(row.descriptor.id);
    const state = document.createElement("span");
    state.className = "control-strip-settings-state";
    state.textContent = row.enabled ? t("control_strip_module_enabled") : t("control_strip_module_disabled");
    item.append(icon, name, state);
    if (index === 0) item.querySelector(".control-strip-settings-name")?.setAttribute("data-first", "true");
    controlStripModuleList.append(item);
  });
  updateModuleSettingsButtons();
}

let stripSelectedModuleId = "";

function selectModuleInSettings(moduleId) {
  if (!stripModuleRegistry.has(moduleId)) return;
  stripSelectedModuleId = moduleId;
  renderModuleSettingsList();
}

function selectedSettingsModule() {
  return stripModuleRegistry.has(stripSelectedModuleId) ? stripSelectedModuleId : "";
}

function updateModuleSettingsButtons() {
  const selected = selectedSettingsModule();
  if (!selected) {
    [controlStripMoveUpButton, controlStripMoveDownButton, controlStripEnableButton, controlStripDisableButton]
      .forEach((button) => { if (button) button.disabled = true; });
    return;
  }
  const prefs = stripPrefs();
  const ordered = (prefs.moduleOrder || []).filter((id) => stripModuleRegistry.has(id));
  const index = ordered.indexOf(selected);
  const disabled = new Set(prefs.disabledModules || []);
  if (controlStripMoveUpButton) controlStripMoveUpButton.disabled = index <= 0;
  if (controlStripMoveDownButton) controlStripMoveDownButton.disabled = index < 0 || index >= ordered.length - 1;
  if (controlStripEnableButton) controlStripEnableButton.disabled = !disabled.has(selected);
  if (controlStripDisableButton) controlStripDisableButton.disabled = disabled.has(selected);
}

function moveModuleInSettings(direction) {
  const selected = selectedSettingsModule();
  if (!selected) return;
  const prefs = stripPrefs();
  const ordered = (prefs.moduleOrder || []).filter((id) => stripModuleRegistry.has(id));
  const from = ordered.indexOf(selected);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ordered.length) return;
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  stripSavePrefs({ moduleOrder: ordered });
  refreshStrip();
  renderModuleSettingsList();
}

function setModuleEnabledFromSettings(enabled) {
  const selected = selectedSettingsModule();
  if (!selected) return;
  setModuleEnabled(selected, enabled);
  renderModuleSettingsList();
  if (typeof setStatus === "function") {
    setStatus(enabled
      ? t("control_strip_module_added", moduleLabel(selected))
      : t("control_strip_module_removed", moduleLabel(selected)));
  }
}

function setMenuFont(font) {
  stripSavePrefs({ menuFont: String(font || "") });
  if (stripOpenMenu) updateOpenMenu(stripOpenMenu.moduleId);
  renderSettings();
}

function setMenuFontSize(size) {
  const next = Math.max(9, Math.min(24, Math.round(Number(size) || 12)));
  stripSavePrefs({ menuFontSize: next });
  if (stripOpenMenu) {
    stripOpenMenu.popover.style.setProperty("--control-strip-menu-font-size", `${next}px`);
  }
  renderSettings();
}

function resetToDefaults() {
  const fallback = typeof defaultControlStripState === "function" ? defaultControlStripState() : {};
  const ordered = [...stripModuleRegistry.values()]
    .sort((a, b) => Number(a.defaultOrder) - Number(b.defaultOrder))
    .map((descriptor) => descriptor.id);
  const disabledModules = [...stripModuleRegistry.values()]
    .filter((descriptor) => descriptor.defaultEnabled === false)
    .map((descriptor) => descriptor.id);
  stripSavePrefs({
    visible: true,
    collapsed: false,
    edge: "left",
    offsetRatio: 0.9,
    expandedLength: 0,
    moduleOrder: ordered,
    disabledModules,
    scrollOffset: 0,
    hotkey: "",
    menuFont: "",
    menuFontSize: 12,
  });
  stripSelectedModuleId = "";
  refreshStrip();
  renderSettings();
  if (typeof setStatus === "function") setStatus(t("control_strip_reset_done"));
}

// --- Public API ------------------------------------------------------------

window.AISystem6ControlStrip = Object.freeze({
  enable,
  disable,
  isEnabled,
  registerModule,
  unregisterModule,
  listModules,
  refreshStrip,
  refreshLanguage,
  getMount: () => stripMount,
  getState: stripPrefs,
  handleModuleDrop,
  renderSettings,
  beginHotkeyRecording,
  clearHotkey,
  captureHotkey,
  setMenuFont,
  setMenuFontSize,
  moveModuleInSettings,
  setModuleEnabledFromSettings,
  selectModuleInSettings,
  resetToDefaults,
});
