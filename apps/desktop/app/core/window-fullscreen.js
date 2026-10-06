// Full screen, the way Mac OS X 10.7 Lion introduced it.
//
// Lion's title bar ends in a full-screen button, two outward arrows, where
// 10.6 drew its green lamp (HIG 2011 p.135). The appearance drew those arrows
// for a year while the button zoomed; the owner asked for the real thing
// (2026-09-25). So in an era that grants the registry capability
// `full-screen`:
//
// - the arrows put the window into full screen: it fills the display, the
//   Dock steps aside, the Writing Flow and the other windows are behind it,
//   and the menu bar slides out of the way until the pointer reaches the top
//   edge (Lion's own behaviour);
// - the same button, Control-Command-F, or Escape outside a text field brings
//   it back to the frame it had;
// - Zoom does not disappear with the green lamp's old place: Lion drew red,
//   yellow and green at the left and the arrows at the right, so this module
//   adds the green lamp beside the yellow one. That is the one era where the
//   product's "left two, right one" gives way, because the right end already
//   belongs to the full-screen button.
//
// Full screen is a view, not a document state: it is not saved in the
// working session, and a reload opens the window at its frame. A phone never
// enters it (the phone shell is already one window at a time).
(() => {
  if (window.AISystem6WindowFullscreenLoaded) return;

  function enabled() {
    try {
      return window.AISystem6Theme?.hasCapability?.("full-screen") === true && !isNarrowViewport();
    } catch (error) {
      return false;
    }
  }

  // One owner, held as identity rather than re-derived from the DOM: a stale
  // `is-fullscreen` node (or a second one) must never be mistaken for the
  // window this module entered, or Exit could tear down the wrong frame.
  let fullscreenOwner = null;

  function current() {
    return fullscreenOwner;
  }

  // The frame a window had before full screen, restored on the way out. The
  // desk positions windows with inline styles, so full screen writes inline
  // styles too rather than outranking them from a sheet.
  const frames = new WeakMap();
  // right/bottom/transform are captured too: the desk positions some panes with
  // right/bottom and themes animate transform, so restoring only four sides
  // would leave a freed window pinned to the wrong edge after Exit Full Screen.
  const framed = ["left", "top", "right", "bottom", "width", "height", "max-height", "transform", "z-index"];
  let watcher = null;
  let reveal = null;

  function enter(win) {
    if (!win?.isConnected || !enabled()
      || ["is-hidden", "is-app-hidden", "is-minimized"].some((name) => win.classList.contains(name))) return false;
    // Re-entering the same window must not overwrite the first baseline: a
    // double Enter/Control-Command-F would otherwise save the 100vw frame as
    // the "restore" frame and Exit Full Screen could never get the window back.
    if (fullscreenOwner === win && frames.has(win)) return true;
    invalidateWindowAutoLayout(win);
    const other = current();
    if (other && other !== win) exit(other);
    if (win.classList.contains("is-collapsed")) toggleCollapsed(win);
    frames.set(win, Object.fromEntries(framed.map((name) => [name, win.style.getPropertyValue(name)])));
    fullscreenOwner = win;
    win.classList.add("is-fullscreen");
    Object.assign(win.style, {
      left: "0px",
      top: "0px",
      right: "auto",
      bottom: "auto",
      width: "100vw",
      height: "100dvh",
      maxHeight: "none",
      transform: "none",
    });
    win.style.setProperty("z-index", "var(--z-window-priority)");
    document.body.classList.add("window-fullscreen-active");
    focusWindow(win);
    // Leaving the desk (closed, hidden, put away) leaves full screen as well.
    // A fresh observer replaces the old one, and exit() only tears down the
    // observer it still owns, so exiting one window never unobserves another.
    watcher?.disconnect();
    watcher = new MutationObserver(() => {
      // Leaving the desk any way at all -- hidden, put away, app-hidden,
      // shaded, or detached from the document -- leaves full screen, so no
      // invisible full-screen layer is left covering the desk.
      if (!win.isConnected
        || ["is-hidden", "is-app-hidden", "is-minimized", "is-collapsed"]
          .some((name) => win.classList.contains(name))) exit(win);
    });
    watcher.observe(win, { attributes: true, attributeFilter: ["class"] });
    showRevealZone();
    window.AISystem6DeskDock?.sync?.();
    return true;
  }

  function exit(win = current()) {
    // Only the window this module actually entered may be exited. Exiting a
    // window that is not the owner (a direct call with someone else's window)
    // must be a no-op, not a wipe of that window's inline frame.
    if (!win || fullscreenOwner !== win || !frames.has(win)) return false;
    invalidateWindowAutoLayout(win);
    watcher?.disconnect();
    watcher = null;
    win.classList.remove("is-fullscreen");
    const frame = frames.get(win) || {};
    framed.forEach((name) => {
      if (frame[name]) win.style.setProperty(name, frame[name]);
      else win.style.removeProperty(name);
    });
    frames.delete(win);
    fullscreenOwner = null;
    document.body.classList.remove("window-fullscreen-active", "fullscreen-menu-revealed");
    reveal?.remove();
    reveal = null;
    window.AISystem6DeskDock?.sync?.();
    return true;
  }

  // Read-only projection of the pre-full-screen frame for the Working Session.
  // It never measures the live full-screen view and never leaves full screen;
  // returns null when this window is not full screen or has no baseline, so the
  // capture can refuse a transient snapshot rather than save 100vw.
  function frameForPersistence(win) {
    if (!win?.classList?.contains("is-fullscreen")) return null;
    const saved = frames.get(win);
    if (!saved) return null;
    const copy = { ...saved };
    delete copy["z-index"];
    return copy;
  }

  // The layer the window had before full screen, for the Working Session's
  // z-order. Kept separate from frameForPersistence, whose contract is geometry
  // only: the pre-full-screen frame is a geometric projection, not a layer, and
  // the live full-screen z (var(--z-window-priority)) must never be saved.
  function layerForPersistence(win) {
    if (!win?.classList?.contains("is-fullscreen")) return null;
    const value = frames.get(win)?.["z-index"];
    return typeof value === "string" && value ? value : null;
  }

  // Lion's menu bar slides away in full screen and comes back while the
  // pointer is at the top edge: a thin zone at the top reveals it, and leaving
  // the bar hides it again.
  function showRevealZone() {
    if (reveal) return;
    reveal = document.createElement("div");
    reveal.className = "fullscreen-reveal";
    reveal.setAttribute("aria-hidden", "true");
    reveal.addEventListener("pointerenter", () => document.body.classList.add("fullscreen-menu-revealed"));
    document.body.append(reveal);
  }

  document.addEventListener("pointerover", (event) => {
    if (!document.body.classList.contains("fullscreen-menu-revealed")) return;
    if (event.target.closest?.(".menu-bar, .fullscreen-reveal, .menu-popover")) return;
    document.body.classList.remove("fullscreen-menu-revealed");
  });

  function toggle(win) {
    return win?.classList.contains("is-fullscreen") ? exit(win) : enter(win);
  }

  // The arrows replace Zoom in this era, so their click is taken before the
  // shared chrome's Zoom listener on the button itself sees it.
  document.addEventListener("click", (event) => {
    if (!enabled()) return;
    const button = event.target.closest?.(".window[data-window] > .title-bar > .resize-box");
    if (!button) return;
    event.stopPropagation();
    event.preventDefault();
    toggle(button.closest(".window"));
  }, true);

  document.addEventListener("keydown", (event) => {
    const win = current();
    const typing = event.target?.closest?.("input, textarea, select, [contenteditable='true']");
    if (win && event.key === "Escape" && !typing) {
      event.preventDefault();
      exit(win);
      return;
    }
    if (!enabled() || !event.ctrlKey || !event.metaKey || String(event.key).toLowerCase() !== "f") return;
    event.preventDefault();
    toggle(win || document.querySelector(".window.is-active[data-window]"));
  });

  // ---- The green lamp -----------------------------------------------------
  function syncZoomLamp(win) {
    const bar = win?.querySelector?.(":scope > .title-bar");
    const existing = bar?.querySelector?.(":scope > .zoom-lamp") || null;
    const wants = bar && enabled() && bar.querySelector(":scope > .resize-box");
    if (!wants) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const lamp = document.createElement("button");
    lamp.type = "button";
    lamp.className = "zoom-lamp";
    lamp.dataset.i18nAriaLabel = "zoom";
    lamp.setAttribute("aria-label", t("zoom"));
    lamp.dataset.balloonHelp = "balloon_zoom_box";
    lamp.addEventListener("pointerdown", (event) => event.stopPropagation());
    lamp.addEventListener("click", () => zoomWindow(win));
    const after = bar.querySelector(":scope > .minimize-box") || bar.querySelector(":scope > .close-box");
    if (after) after.after(lamp);
    else bar.prepend(lamp);
  }

  function syncAll() {
    document.querySelectorAll(".window[data-window]").forEach(syncZoomLamp);
    if (!enabled()) document.querySelectorAll(".window.is-fullscreen").forEach((win) => exit(win));
  }

  document.addEventListener("ai-system6-themechange", syncAll);
  window.addEventListener("resize", syncAll);

  window.AISystem6WindowFullscreen = Object.freeze({ enter, exit, toggle, syncAll, frameForPersistence, layerForPersistence });
  window.AISystem6WindowFullscreenLoaded = true;
  syncAll();
})();
