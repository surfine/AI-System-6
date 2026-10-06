// Only admission lives on the boot disk. The arrangement engine loads on use.
(() => {
  let ticket = 0;
  const active = () => document.querySelector(".window[data-window].is-active:not(.is-hidden):not(.is-app-hidden):not(.is-minimized)");
  const editable = (node) => node?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']");
  const barFor = (node) => !node?.closest?.("button, a, input, select, textarea, [contenteditable]:not([contenteditable='false']), [role='button'], [role='tab']")
    && node?.closest?.(".window[data-window] > .title-bar");
  const controlsFor = (node) => node?.closest?.("button, a, input, select, textarea, [contenteditable]:not([contenteditable='false']), [role='button'], [role='tab'], [role='menuitem']");
  const peekSurface = (node) => node?.closest?.(".window[data-window].is-collapsed.is-shade-peeking");
  const allowed = (win) => !!win && !isNarrowViewport() && !writerMode
    && !(typeof modalScrim !== "undefined" && modalScrim && !modalScrim.classList.contains("is-hidden") && modalScrim.getClientRects().length)
    && (!window.AISystem6WindowShade || window.AISystem6WindowShade.eligible(win));
  const load = () => ensureLazySystemModule("app/core/windowshade.js", "AISystem6WindowShadeLoaded");

  // WM4: the glance judgement (GlanceIntent) and its read-only DOM adapter live
  // in one lazy module so the hover path, the Escape block and the exact
  // inert/aria restore have a single owner. This entry point only samples
  // pointer intent into that module and forwards every cancel; the same-DOM
  // peek itself stays in window-manager's beginPeek/endPeek/commitPeek.
  const loadPeek = () => ensureLazySystemModule("app/core/window-peek.js", "AISystem6WindowPeekLoaded");
  const peekApi = () => window.AISystem6WindowPeek || null;
  let lastPointerSample = null;
  function peekSample(event) {
    const target = event?.target;
    if (peekSurface(target)) return { strip: null, overGlance: true, overControls: false };
    const bar = barFor(target);
    if (bar) {
      const win = bar.parentElement;
      if (!allowed(win)) return { strip: null, overGlance: false, overControls: false };
      return { strip: win.classList.contains("is-collapsed") ? win.dataset.window : null, overGlance: false, overControls: false };
    }
    // A pointer resting on a title-bar widget keeps the strip alive but resets
    // the intent clock: aiming at a button must never trigger a glance.
    const control = controlsFor(target);
    const win = control?.closest?.(".window[data-window]");
    if (win && control.closest(".title-bar") && allowed(win)) {
      return { strip: win.classList.contains("is-collapsed") ? win.dataset.window : null, overGlance: false, overControls: true };
    }
    return { strip: null, overGlance: false, overControls: false };
  }
  function peekMove(event) {
    if (isNarrowViewport() || writerMode) return;
    const sample = peekSample(event);
    lastPointerSample = sample;
    if (sample.strip) load();
    const api = peekApi();
    if (api) { api.move(sample); return; }
    // Cold load: apply only the newest sample once the module arrives, so a
    // pointer that moved on during the fetch never replays a stale intent.
    loadPeek().then(() => { if (lastPointerSample === sample) peekApi()?.move(sample); });
  }
  function cancelPeek({ blockUntilLeave = false } = {}) {
    peekApi()?.cancel?.({ blockUntilLeave });
    if (typeof cancelAllWindowPeeks === "function") cancelAllWindowPeeks();
  }
  async function request(win, action, point) {
    if (!allowed(win)) return { ok: false, reason: "unavailable" };
    const ownTicket = ++ticket;
    const priorActive = active();
    const priorFrame = win.getAttribute("style");
    const priorClass = win.className;
    try {
      await load();
      // Closing, changing focus, dragging, cancelling or changing appearance
      // during a cold load must not replay an intent into a different state.
      if (ownTicket !== ticket || !win.isConnected || active() !== priorActive
        || win.getAttribute("style") !== priorFrame || win.className !== priorClass) return { ok: false, reason: "cancelled" };
      const api = window.AISystem6WindowShade;
      if (action === "menu") return api.openMenu(win, point);
      else if (["left", "right", "up", "down"].includes(action)) return api.direction(win, action);
      else return api.dispatch(win, action);
    } catch (error) {
      console.warn("Window arrangement could not load", error);
      setStatus(typeof currentLanguage !== "undefined" && /^en/.test(currentLanguage)
        ? "Window arrangement could not load. Try again." : "窗口排列未能载入，请重试。");
      return { ok: false, reason: "load-failed" };
    }
  }
  document.addEventListener("contextmenu", (event) => {
    const bar = barFor(event.target);
    if (!bar || event.defaultPrevented || !allowed(bar.parentElement)) return;
    event.preventDefault();
    event.stopPropagation();
    // An open glance hands off to the arrange menu for the 1200ms handoff
    // window; anything else cancels the temporary surface first.
    const win = bar.parentElement;
    const api = peekApi();
    if (api?.isPreviewing?.(win)) api.menuHandoff?.();
    else cancelPeek();
    request(win, "menu", { x: event.clientX, y: event.clientY });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { ticket++; cancelPeek({ blockUntilLeave: true }); return; }
    if (event.defaultPrevented || event.isComposing || event.repeat || editable(event.target)
      || isNarrowViewport() || writerMode || event.altKey) return;
    const command = event.ctrlKey && event.metaKey && !event.shiftKey;
    const action = command ? ({ ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", z: "undo", Z: "undo", "/": "menu" })[event.key]
      : event.shiftKey && !event.ctrlKey && !event.metaKey && event.key === "F10" ? "menu" : null;
    const win = active();
    if (!action || !allowed(win)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelPeek();
    request(win, action);
  });
  // WM4 hover glance. The intent thresholds (220ms intent / 160ms leave grace
  // / 1200ms menu handoff) live in window-peek's GlanceIntent; this entry only
  // feeds it pointer samples and forwards every cancel. Pointer travel between
  // the shade strip and the temporary surface stays one interaction.
  document.addEventListener("pointerover", (event) => { peekMove(event); });
  // Departing the document fires no pointerover, so the leave grace needs the
  // one pointerout with no related target.
  document.addEventListener("pointerout", (event) => { if (!event.relatedTarget) peekMove(event); });
  // Only sample while the intent is tracking: an idle desk pays nothing.
  document.addEventListener("pointermove", (event) => {
    const api = peekApi();
    if (!api || (!api.hasPendingDeadline() && !api.activeID())) return;
    peekMove(event);
  }, true);
  document.addEventListener("pointerdown", (event) => {
    // A primary press on any title bar starts a real interaction (drag, focus,
    // double-click shade); the glance must not survive it. Right-click is left
    // alone so the arrange menu keeps its handoff.
    if (event.button === 0 && event.target?.closest?.(".window[data-window] > .title-bar")) { cancelPeek(); return; }
    const peeking = peekSurface(event.target);
    if (!peeking) return;
    if (event.target.closest("button, a, input, select, textarea, [contenteditable]:not([contenteditable='false'])")) return;
    // A deliberate click on the temporary surface commits a real unroll.
    if (typeof commitPeek === "function") {
      event.preventDefault();
      event.stopPropagation();
      peekApi()?.cancel();
      commitPeek(peeking);
    }
  }, true);
  // Cold-load wheel path: once windowshade.js is present it owns the listener.
  // Finger count / pinch streams are not available in the DOM.
  document.addEventListener("wheel", (event) => {
    if (window.AISystem6WindowShadeLoaded || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    const bar = barFor(event.target);
    const win = bar?.parentElement;
    if (!win || !allowed(win)) return;
    const collapsed = win.classList.contains("is-collapsed");
    const action = event.deltaY > 0 ? (collapsed ? null : "shade") : (collapsed ? "expand" : "fill");
    if (!action || Math.abs(event.deltaY) < 10) return;
    event.preventDefault();
    event.stopPropagation();
    cancelPeek();
    request(win, action);
  }, { capture: true, passive: false });
  window.addEventListener("blur", () => { ticket++; cancelPeek(); });
  window.addEventListener("resize", () => { ticket++; cancelPeek(); });
  document.addEventListener("ai-system6-themechange", () => { ticket++; cancelPeek(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { ticket++; cancelPeek(); } });
  // A committed arrangement (menu pick, flick, wheel, keyboard) replaces the
  // temporary glance with the real window state.
  document.addEventListener("ai-system6-window-arranged", () => cancelPeek());
  // Opening a modal must not leave a read-only preview behind the scrim. Query
  // the scrim directly: dom-handles' modalScrim is a later script-scope const,
  // so referencing it here (before its initializer) would be a TDZ error.
  const peekScrim = document.querySelector("[data-modal-scrim]");
  if (peekScrim && typeof MutationObserver === "function") {
    new MutationObserver(() => {
      if (!peekScrim.classList.contains("is-hidden")) cancelPeek();
    }).observe(peekScrim, { attributes: true, attributeFilter: ["class"] });
  }
  window.AISystem6Runtime?.registerCommand?.("windowshade-arrange-menu", {
    handler: () => request(active(), "menu"),
    isAvailable: () => allowed(active()),
  });
  // WM2: one entry per user-visible arrangement, all through request() so the
  // menu, keyboard and gestures share one availability check and one commit.
  // The engine still owns the geometry; a caller never writes style itself.
  const arrangementCommands = {
    "window-shade": "shade",
    "window-expand": "expand",
    "window-layout-left": "left",
    "window-layout-right": "right",
    "window-layout-fill": "fill",
    "window-layout-undo": "undo",
    "window-layout-recover": "recover",
    // WM3: the pin command is a real stack action, not a layout slot; the
    // engine's dispatch() owns it and canPinWindow() gates the surfaces where
    // pin does not apply (full screen, narrow, writing, system sheets).
    "window-pin": "pin",
    "window-unpin": "unpin",
  };
  // A command table driven by one loop is still a command source, so the
  // interaction audit reads these nine as live commands, not as dead rows.
  Object.entries(arrangementCommands).forEach(([commandId, action]) => {
    window.AISystem6Runtime?.registerCommand?.(commandId, {
      handler: () => request(active(), action),
      isAvailable: () => allowed(active()),
    });
  });
  // WM5: "All Windows" opens the cross-application browse list. The projection
  // and the recovery live in multi-finder; the surface is a lazy module, so the
  // row's command loads it on first use rather than at boot.
  window.AISystem6Runtime?.registerCommand?.("window-browse", {
    handler: () => ensureLazySystemModule("app/features/window-browse.js", "AISystem6WindowBrowseLoaded")
      .then(() => window.AISystem6WindowBrowse?.open?.()),
    isAvailable: () => !!document.querySelector(".window[data-window]:not(.is-hidden):not(.is-app-hidden)"),
  });
})();
