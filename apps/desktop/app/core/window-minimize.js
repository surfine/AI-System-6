// Miniaturize, and the way back.
//
// The state behind a minimize control lives with the appearance that draws
// it, not in the boot payload. Only an era whose windows really had a
// minimize control carries one, so the desk should not pay at startup for a
// control nobody has drawn yet -- Classic and Platinum never see it, the
// macOS-shaped eras that draw close and zoom keep drawing exactly that, and
// this module is loaded for NeXTSTEP's miniaturize button and for an era that
// grants the registry capability `minimize-lamp`. That capability comes only
// with the era's Dock (owner decision 2026-09-25), so no era grants it today;
// the lamp code below is the half the coming Dock will switch on.
//
// Miniaturizing never opens, clones or re-creates the window: it is the same
// element that comes back, so the document identity, the selection, the dirty
// mark and the scroll position are the writer's own. What the snapshot below
// adds is the caret and the scroll offset, because a window that was scrolled
// to its fourth paragraph should return there.
//
// The eager side keeps the state itself. `is-minimized` is the desk's window
// state -- focusWindow clears it, the application switcher lists it, and the
// working session stores it -- and three guard calls reach this module, the
// same shape the NeXTSTEP shell used while it owned this code. Minimize is
// not WindowShade: rolling a window up in place stays the title-bar
// double-click in every era, and this state never replaces it.
(() => {
  if (window.AISystem6WindowMinimizeLoaded) return;
  const focusSnapshots = new WeakMap();

  function rememberFocus(win) {
    const target = document.activeElement;
    if (!win?.contains(target)) return;
    const selection = window.getSelection?.();
    focusSnapshots.set(win, {
      target,
      start: target.selectionStart,
      end: target.selectionEnd,
      direction: target.selectionDirection,
      range: selection?.rangeCount && win.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null,
      scrollTop: target.scrollTop,
      scrollLeft: target.scrollLeft,
    });
  }

  function restoreFocus(win) {
    const saved = focusSnapshots.get(win);
    if (!saved?.target?.isConnected) return;
    saved.target.focus({ preventScroll: true });
    if (typeof saved.start === "number") saved.target.setSelectionRange(saved.start, saved.end, saved.direction);
    if (typeof saved.start !== "number" && saved.range?.startContainer.isConnected) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(saved.range);
    }
    saved.target.scrollTop = saved.scrollTop;
    saved.target.scrollLeft = saved.scrollLeft;
  }

  function isMinimized(win) {
    return Boolean(win?.classList?.contains("is-minimized"));
  }

  function minimize(win) {
    if (!win || win.classList.contains("is-hidden") || isMinimized(win)) return false;
    rememberFocus(win);
    const wasActive = win.classList.contains("is-active");
    win.classList.add("is-minimized");
    win.classList.remove("is-active");
    if (wasActive) {
      const next = visibleLayeredWindows().sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
      if (next) focusWindow(next);
      else { activeAppId = "finder"; document.activeElement?.blur(); }
    }
    // A phone hands the screen to one window, and the shell that holds it
    // outranks the put-away rule: without this the window was flagged
    // minimized yet stayed full-screen, the desk's state saying one thing and
    // the screen another. The foreground passes to the next window now.
    syncMobileAppForeground();
    renderMultiFinderMenu();
    scheduleWorkingSessionSave();
    return true;
  }

  function restore(win, { focus = true } = {}) {
    if (!isMinimized(win)) return false;
    if (focus) {
      // focusWindow clears `is-minimized` and is also what puts the caret back,
      // so a minimized window has exactly one restoring path.
      unhideApp(getWindowAppId(win));
      focusWindow(win);
    } else {
      win.classList.remove("is-minimized");
    }
    // And on a phone the window that comes back takes the screen again.
    syncMobileAppForeground();
    renderMultiFinderMenu();
    scheduleWorkingSessionSave();
    return true;
  }

  // ---- Which appearance draws the lamp -----------------------------------
  //
  // The control is real or it is absent. An appearance that draws a minimize
  // lamp therefore has to be an appearance whose system really had one, and the
  // registry is where that is recorded: `minimize-lamp`, granted only to an
  // appearance that draws one and wires it to the shared command.
  //
  // The window itself still decides whether it takes the control: About and the
  // save-chat sheet are not documents a writer miniaturizes, and they already
  // refuse the title-bar drag for the same reason.
  function enabled() {
    try {
      return window.AISystem6Theme?.hasCapability?.("minimize-lamp") === true;
    } catch (error) {
      return false;
    }
  }

  function isMinimizable(win) {
    const name = win?.dataset?.window || "";
    if (!name) return false;
    if (name === "about" || name === "saveChat") return false;
    return Boolean(win.querySelector?.(":scope > .title-bar > .close-box"));
  }

  function syncLamp(win) {
    if (!win?.querySelector) return;
    const bar = win.querySelector(":scope > .title-bar");
    const existing = bar?.querySelector?.(":scope > .minimize-box") || null;
    if (!bar || !enabled() || !isMinimizable(win)) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const close = bar.querySelector(":scope > .close-box");
    const lamp = document.createElement("button");
    lamp.type = "button";
    lamp.className = "minimize-box";
    lamp.dataset.i18nAriaLabel = "window_miniaturize";
    lamp.setAttribute("aria-label", t("window_miniaturize"));
    lamp.addEventListener("click", () => minimize(win));
    lamp.addEventListener("pointerdown", (event) => event.stopPropagation());
    // Next to Close in the DOM as well as on screen: the tab order through a
    // title bar should read the way the group is drawn, whichever order the bar
    // was assembled in (a template-built window appends its controls after the
    // title, an injected one before it).
    if (close) close.after(lamp);
    else bar.append(lamp);
  }

  function syncLamps(root = document) {
    root.querySelectorAll?.(".window[data-window]")?.forEach(syncLamp);
  }

  document.addEventListener("ai-system6-themechange", () => syncLamps());
  // The module is loaded *by* a theme change, so the event that asked for it is
  // already over by the time this listener exists. Sync once on arrival, or the
  // appearance that grants the lamp would be the one appearance whose existing
  // windows never receive it.
  syncLamps();

  window.AISystem6WindowMinimize = Object.freeze({ minimize, restore, restoreFocus, isMinimized, syncLamp, syncLamps });
  window.AISystem6WindowMinimizeLoaded = true;
  syncLamps();
})();
