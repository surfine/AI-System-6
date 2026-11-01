// Full screen, the way Mac OS X 10.7 Lion introduced it.
//
// Owner ruling 2026-11-01: each era keeps its lamps where that era had them.
// Lion draws red, yellow and green (Zoom) at the left and, at the right end of
// the bar, a separate full-screen button, two outward arrows (HIG 2011 p.135);
// this module adds that button and puts the window into full screen with it.
// Yosemite, Big Sur and Liquid Glass have no extra button: their green lamp is
// full screen, and Option-click on it is Zoom. In either case the same button,
// Control-Command-F, or Escape outside a text field brings the window back to
// the frame it had. Full screen fills the display, the Dock steps aside, the
// other windows are behind it, and the menu bar slides out until the pointer
// reaches the top edge.
//
// The move between spaces, the linen, the bottom-edge Dock and Lion's
// menu-bar exit button are window-fullscreen-space.js (lazy); the sources for
// each behaviour are internal/evidence/drafts/lion-fullscreen/SOURCES.md.
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

  // Lion drew the button only on windows whose app adopted full screen, and
  // the HIG said which: windows a writer stays in, not "brief utilitarian
  // tasks" such as Calculator, the Finder or Contacts (OS X HIG, "Allow Users
  // to Go Full Screen (if Appropriate)"). Desk accessories, system windows,
  // Finder windows, dialogs and fixed-size windows therefore keep their lamps
  // as they were: in Yosemite and later their green lamp stays Zoom.
  const notFullScreenApps = new Set(["accessories", "system", "finder"]);
  const notFullScreenWindows = new Set(["saveChat", "contextPanel", "styleSheet"]);

  function eligible(win) {
    const name = win?.dataset?.window;
    if (!name || notFullScreenWindows.has(name) || win.classList.contains("is-desklet")) return false;
    const app = typeof getWindowAppId === "function" ? getWindowAppId(win) : win.dataset.app;
    if (notFullScreenApps.has(app)) return false;
    return !!win.querySelector(":scope > .title-bar > .resize-box:not([disabled])");
  }

  // The move between spaces (the slide, the linen, Lion's menu-bar exit
  // button, the Dock at the bottom edge) is window-fullscreen-space.js, loaded
  // only in an era that has full screen. The state change here stays
  // synchronous; the space module animates from the rect captured before it.
  function space() {
    return typeof ensureFullscreenSpaceModule === "function"
      ? ensureFullscreenSpaceModule().then(() => window.AISystem6FullscreenSpace).catch(() => null)
      : Promise.resolve(null);
  }

  function rectOf(win) {
    const r = win.getBoundingClientRect?.();
    return r && { left: r.left, top: r.top, width: r.width, height: r.height };
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
    if (!win?.isConnected || !enabled() || !eligible(win)
      || ["is-hidden", "is-app-hidden", "is-minimized"].some((name) => win.classList.contains(name))) return false;
    // Re-entering the same window must not overwrite the first baseline: a
    // double Enter/Control-Command-F would otherwise save the 100vw frame as
    // the "restore" frame and Exit Full Screen could never get the window back.
    if (fullscreenOwner === win && frames.has(win)) return true;
    invalidateWindowAutoLayout(win);
    const other = current();
    if (other && other !== win) exit(other);
    if (win.classList.contains("is-collapsed")) toggleCollapsed(win);
    const from = rectOf(win);
    frames.set(win, Object.fromEntries(framed.map((name) => [name, win.style.getPropertyValue(name)])));
    fullscreenOwner = win;
    win.classList.add("is-fullscreen");
    // The window is positioned inside the desk, and the desk starts under the
    // menu bar. A frame of top 0 / height 100dvh therefore hung 22px below the
    // display and clipped the window's bottom row (seen 2026-10-08 on Quick
    // Draft's Lightroom/Tools/Draft buttons). Full screen is measured against
    // the display, so the top compensates whatever the desk is offset by.
    const deskTop = Math.round(win.offsetParent?.getBoundingClientRect?.().top || 0);
    Object.assign(win.style, {
      left: "0px",
      top: `${deskTop ? -deskTop : 0}px`,
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
    space().then((api) => { if (fullscreenOwner === win) api?.entered(win, from); });
    return true;
  }

  function exit(win = current()) {
    // Only the window this module actually entered may be exited. Exiting a
    // window that is not the owner (a direct call with someone else's window)
    // must be a no-op, not a wipe of that window's inline frame.
    if (!win || fullscreenOwner !== win || !frames.has(win)) return false;
    invalidateWindowAutoLayout(win);
    const from = rectOf(win);
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
    window.AISystem6FullscreenSpace?.exited(win, from);
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
    // The title bar that came down with the menu bar (Yosemite and later) is
    // part of what was revealed: its green lamp is the way out.
    if (event.target.closest?.(".menu-bar, .fullscreen-reveal, .menu-popover, .window.is-fullscreen > .title-bar")) return;
    document.body.classList.remove("fullscreen-menu-revealed");
  });

  function toggle(win) {
    return win?.classList.contains("is-fullscreen") ? exit(win) : enter(win);
  }

  // Lion's own button is a real element; in the later eras the green lamp is
  // the button, and Option-click leaves it to the shared chrome's Zoom.
  document.addEventListener("click", (event) => {
    if (!enabled()) return;
    const own = event.target.closest?.(".window[data-window] > .title-bar > .fullscreen-button");
    const lamp = !own && !event.altKey && window.AISystem6Theme?.getCurrentTheme?.() !== LION_THEME
      ? event.target.closest?.(".window[data-window] > .title-bar > .resize-box")
      : null;
    const button = own || lamp;
    if (!button || !eligible(button.closest(".window"))) return;
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

  // ---- Lion's full-screen button ------------------------------------------
  // Only Lion draws a button of its own, at the title bar's right end, beside
  // its left-hand green Zoom lamp.
  const LION_THEME = "lion";

  function syncFullscreenButton(win) {
    const bar = win?.querySelector?.(":scope > .title-bar");
    const existing = bar?.querySelector?.(":scope > .fullscreen-button") || null;
    const wants = bar
      && enabled()
      && eligible(win)
      && window.AISystem6Theme?.getCurrentTheme?.() === LION_THEME
      && bar.querySelector(":scope > .resize-box");
    if (!wants) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fullscreen-button";
    button.dataset.i18nAriaLabel = "window_full_screen";
    button.setAttribute("aria-label", t("window_full_screen"));
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    bar.append(button);
  }

  function syncAll() {
    document.querySelectorAll(".window[data-window]").forEach(syncFullscreenButton);
    if (!enabled()) document.querySelectorAll(".window.is-fullscreen").forEach((win) => exit(win));
    // Fetch the space module ahead of the first press in an era that has it.
    else space();
  }

  document.addEventListener("ai-system6-themechange", syncAll);
  // Windows built later by their modules (games, ClioWorks apps) join the
  // desk after boot; each gets its button as it arrives.
  const deskRoot = document.querySelector(".desktop");
  if (deskRoot && typeof MutationObserver === "function") {
    new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.matches?.(".window[data-window]")) syncFullscreenButton(node);
    }))).observe(deskRoot, { childList: true });
  }
  window.addEventListener("resize", syncAll);

  window.AISystem6WindowFullscreen = Object.freeze({ enter, exit, toggle, eligible, syncAll, frameForPersistence, layerForPersistence });
  window.AISystem6WindowFullscreenLoaded = true;
  syncAll();
})();
