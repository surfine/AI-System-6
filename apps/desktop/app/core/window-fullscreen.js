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

  function current() {
    return document.querySelector(".window[data-window].is-fullscreen");
  }

  // The frame a window had before full screen, restored on the way out. The
  // desk positions windows with inline styles, so full screen writes inline
  // styles too rather than outranking them from a sheet.
  const frames = new WeakMap();
  const framed = ["left", "top", "width", "height", "max-height", "z-index"];
  let watcher = null;
  let reveal = null;

  function enter(win) {
    if (!win || !enabled() || win.classList.contains("is-hidden")) return false;
    const other = current();
    if (other && other !== win) exit(other);
    if (win.classList.contains("is-collapsed")) toggleCollapsed(win);
    frames.set(win, Object.fromEntries(framed.map((name) => [name, win.style.getPropertyValue(name)])));
    win.classList.add("is-fullscreen");
    Object.assign(win.style, { left: "0px", top: "0px", width: "100vw", height: "100dvh", maxHeight: "none" });
    win.style.setProperty("z-index", "var(--z-window-priority)");
    document.body.classList.add("window-fullscreen-active");
    focusWindow(win);
    // Leaving the desk (closed, hidden, put away) leaves full screen as well.
    watcher = new MutationObserver(() => {
      if (win.classList.contains("is-hidden") || win.classList.contains("is-minimized")) exit(win);
    });
    watcher.observe(win, { attributes: true, attributeFilter: ["class"] });
    showRevealZone();
    window.AISystem6DeskDock?.sync?.();
    return true;
  }

  function exit(win = current()) {
    if (!win) return false;
    watcher?.disconnect();
    watcher = null;
    win.classList.remove("is-fullscreen");
    const frame = frames.get(win) || {};
    framed.forEach((name) => {
      if (frame[name]) win.style.setProperty(name, frame[name]);
      else win.style.removeProperty(name);
    });
    frames.delete(win);
    document.body.classList.remove("window-fullscreen-active", "fullscreen-menu-revealed");
    reveal?.remove();
    reveal = null;
    window.AISystem6DeskDock?.sync?.();
    return true;
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

  window.AISystem6WindowFullscreen = Object.freeze({ enter, exit, toggle, syncAll });
  window.AISystem6WindowFullscreenLoaded = true;
  syncAll();
})();
