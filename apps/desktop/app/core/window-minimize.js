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

  // The way to the Dock, drawn once and briefly: a ghost of the window's frame
  // shrinks into the Dock's documents end (the new cell appears beside the
  // Trash) in under 200ms. The window itself is put away at once, so nothing
  // that reads its state waits for the picture. No Dock, reduced motion, or
  // NeXTSTEP (whose miniaturize had no animation) draws nothing.
  function flyToDock(win) {
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      const target = document.querySelector(".desk-dock [data-dock-key='trash']");
      const from = win.getBoundingClientRect?.();
      const to = target?.getBoundingClientRect?.();
      if (!to || !from || from.width <= 0 || from.height <= 0) return;
      const ghost = document.createElement("div");
      ghost.className = "minimize-ghost";
      Object.assign(ghost.style, {
        left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
      });
      document.body.append(ghost);
      const scale = Math.max(0.04, to.width / from.width);
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      requestAnimationFrame(() => {
        ghost.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
        ghost.style.opacity = "0";
      });
      setTimeout(() => ghost.remove(), 260);
    } catch (error) { /* The picture is optional; the verb has already happened. */ }
  }

  function minimize(win) {
    if (!minimizeEnabled()) return false;
    // Writer Mode draws no lamp and has no Dock: a window put away there would
    // vanish with no list to reach it back from, so the verb refuses outright
    // rather than flagging a window no control on that desk can restore.
    if (writerMode) return false;
    if (!win || win.classList.contains("is-hidden") || isMinimized(win)) return false;
    rememberFocus(win);
    flyToDock(win);
    const wasActive = win.classList.contains("is-active");
    const appId = getWindowAppId(win) || activeAppId;
    win.classList.add("is-minimized");
    win.classList.remove("is-active");
    // The ordering key the put-away lists sort by: the newest minimize is the
    // one a writer looking for "what I just put away" wants nearest the top.
    // Restore and focus do not clear it -- it is a timestamp, not a state.
    win.dataset.minimizedAt = String(Date.now());
    if (wasActive) {
      // Mac OS X: minimizing an application's last window leaves the
      // application frontmost -- the menu bar keeps its name -- and ⌘` brings
      // a window back. So the next focus is the frontmost *visible* window of
      // the SAME application, and when there is none the application simply
      // stays in front: `activeAppId` is not handed to another application,
      // and never falls back to "finder". Only the caret leaves.
      const sameApp = windowsForApp(appId)
        .filter((candidate) => candidate !== win
          && !candidate.classList.contains("is-hidden")
          && !candidate.classList.contains("is-minimized")
          && !candidate.classList.contains("is-app-hidden"))
        .sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0));
      if (sameApp.length) focusWindow(sameApp[0]);
      else {
        // Desk accessories and system windows never own the menu bar
        // (focusWindow skips them the same way), so they leave it as it was.
        if (appId !== "accessories" && appId !== "system") activeAppId = appId;
        document.activeElement?.blur();
      }
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

  // ---- Which windows are put away ----------------------------------------
  //
  // The lists of put-away windows live with the state that puts them away, in
  // this module, because only an appearance that draws the minimize control
  // (NeXTSTEP, or an era whose lamp ships with its Dock) ever has a window in
  // this state. Three faces read them: the switcher popover's miniwindow
  // section, the Apple menu's minimized-windows section (the only list in
  // Finder mode, where no switcher shows), and the coming Dock.
  //
  // "Which window" has one answer that reaches every appearance: the walk over
  // the front application's windows (⌘`), which counts a miniaturized window as
  // still open. A walk is not a list, and a miniaturized window is the one kind
  // of window a writer cannot simply click -- it is not on screen. The Dock
  // covers an application with no visible window left; these lists cover the
  // rest, including the case where a writer put one document away and left
  // another of the same application open. NeXTSTEP's shell still draws its own
  // miniwindows in its dock; the rows here are the desk's list, and they read
  // the same state.

  // Newest first, by the stamp minimize() writes. A window restored from a
  // saved session carries no stamp, so it falls back to z-index among its peers
  // rather than sorting to the bottom arbitrarily.
  function windows() {
    return Array.from(document.querySelectorAll(".window[data-window].is-minimized"))
      .filter((win) => !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden"))
      .sort((a, b) => {
        const aStamp = Number(a.dataset.minimizedAt || 0);
        const bStamp = Number(b.dataset.minimizedAt || 0);
        if (aStamp !== bStamp) return bStamp - aStamp;
        return Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0);
      });
  }

  function appLabelFor(win) {
    const appId = getWindowAppId(win);
    return multiFinderAppLabels[appId] || appId;
  }

  // The switcher popover's rows: a rule, a heading and one button per put-away
  // window, in the same shape multi-finder.js has always drawn (the buttons are
  // keyed on data-miniwindow and restored by the same call).
  function rows() {
    const list = windows();
    if (!list.length) return [];
    const elements = [document.createElement("hr")];
    const heading = document.createElement("div");
    heading.className = "multifinder-heading";
    heading.textContent = t("miniwindow_list");
    elements.push(heading);
    list.forEach((win) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "multifinder-app multifinder-miniwindow";
      row.dataset.miniwindow = win.dataset.window;
      row.innerHTML = `
      <span class="multifinder-mark">▫</span>
      <span>${escapeHtml(applicationWindowTitle(win))}</span>
      <small>${escapeHtml(appLabelFor(win))}</small>
    `;
      row.addEventListener("click", () => restoreMinimizedWindow(win));
      elements.push(row);
    });
    return elements;
  }

  // The Apple menu's own list, filled into the container index.html leaves
  // right after the "Your Place" section. It appears in every menu-bar mode,
  // because in Finder mode (one application, no switcher) it is the only list
  // of put-away windows a writer can reach.
  //
  // The buttons deliberately carry no data-action: the NeXTSTEP menu mirrors
  // every `.apple-menu-popover > [data-action]` and a delegate dispatches
  // data-action, so a marker attribute here would double-handle the click. They
  // restore through their own listener instead.
  function renderAppleMenuSection() {
    const section = document.querySelector("#apple-minimized-windows");
    if (!section) return;
    const list = windows();
    section.classList.toggle("is-hidden", !list.length);
    if (!list.length) {
      section.replaceChildren();
      return;
    }
    const label = document.createElement("div");
    label.className = "menu-section-label";
    label.textContent = t("miniwindow_list");
    const elements = [label];
    list.forEach((win) => {
      // A leading diamond is how Mac OS X's Window menu marks a minimized
      // window.
      const button = document.createElement("button");
      button.type = "button";
      button.className = "apple-minimized-window";
      button.dataset.miniwindow = win.dataset.window;
      button.textContent = `◆ ${applicationWindowTitle(win)} — ${appLabelFor(win)}`;
      button.addEventListener("click", () => {
        restoreMinimizedWindow(win);
        if (typeof closeMenus === "function") closeMenus();
      });
      elements.push(button);
    });
    section.replaceChildren(...elements);
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
      return window.AISystem6Theme?.hasCapability?.("minimize-lamp") === true && minimizeEnabled();
    } catch (error) {
      return false;
    }
  }

  // ---- The switch for the verb itself -----------------------------------
  //
  // Minimize is a preference (owner, 2026-09-25): a writer who wants only
  // WindowShade turns it off on the Control Panel's General page. Off, no era
  // draws the yellow lamp or NeXTSTEP's miniaturize button, Command-M does
  // nothing, and a window already put away is rolled up where it stood by the
  // desk's orphan rule, so nothing is stranded. The Dock stays a launcher.
  //
  // Until the writer chooses, the default follows the appearance (owner,
  // 2026-09-25 evening: "需要时再打开"): the Mac OS X eras start with the
  // yellow lamp and the Dock off, so their desk is the same WindowShade desk
  // as every other era until someone asks for more; NeXTSTEP starts with
  // both on, because its miniaturize button and its Dock are its own shell,
  // not an addition to it. A stored choice, either way, holds everywhere.
  const minimizeStorageKey = "ai-system-6-minimize";

  function appearanceDefaultOn() {
    try {
      return window.AISystem6Theme?.getCurrentTheme?.() === "nextstep";
    } catch (error) {
      return false;
    }
  }

  function minimizeEnabled() {
    try {
      const stored = JSON.parse(localStorage.getItem(minimizeStorageKey));
      if (stored && typeof stored.enabled === "boolean") return stored.enabled;
    } catch (error) { /* Unreadable storage reads as the default below. */ }
    return appearanceDefaultOn();
  }

  function setMinimizeEnabled(value) {
    const on = value !== false;
    try { localStorage.setItem(minimizeStorageKey, JSON.stringify({ enabled: on })); }
    catch (error) { /* The session preference still applies when storage is blocked. */ }
    document.body?.classList?.toggle("minimize-off", !on);
    syncLamps();
    if (!on && typeof releaseOrphanedMiniwindows === "function") releaseOrphanedMiniwindows();
    document.dispatchEvent(new CustomEvent("ai-system6-minimizechange", { detail: { enabled: on } }));
    window.AISystem6NextstepDock?.sync?.();
    window.AISystem6DeskDock?.sync?.();
    if (typeof renderMultiFinderMenu === "function") renderMultiFinderMenu();
    syncMinimizeField();
    return on;
  }

  function isMinimizable(win) {
    const name = win?.dataset?.window || "";
    if (!name) return false;
    if (name === "about" || name === "saveChat") return false;
    return Boolean(win.querySelector?.(":scope > .title-bar > .close-box"));
  }

  // Balloon Help says where the window goes: into the Dock, or, with the Dock
  // switched off, into the Apple menu's list.
  function syncLampBalloon(lamp) {
    lamp.dataset.balloonHelp = dockVisible() ? "balloon_minimize_box" : "balloon_minimize_box_no_dock";
  }

  function syncLamp(win) {
    if (!win?.querySelector) return;
    const bar = win.querySelector(":scope > .title-bar");
    const existing = bar?.querySelector?.(":scope > .minimize-box") || null;
    // A window with a Close lamp gets the whole group. About and the save-chat
    // sheet draw the yellow lamp disabled rather than leaving a gap: the 2001
    // HIG greys an About window's minimize and zoom, it does not remove them.
    const hasClose = Boolean(bar?.querySelector?.(":scope > .close-box"));
    if (!bar || !enabled() || !win.dataset?.window || !hasClose) {
      existing?.remove();
      return;
    }
    if (existing) {
      syncLampBalloon(existing);
      return;
    }
    const close = bar.querySelector(":scope > .close-box");
    const lamp = document.createElement("button");
    lamp.type = "button";
    lamp.className = "minimize-box";
    lamp.dataset.i18nAriaLabel = "window_minimize";
    lamp.setAttribute("aria-label", t("window_minimize"));
    lamp.disabled = !isMinimizable(win);
    syncLampBalloon(lamp);
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
  document.addEventListener("ai-system6-dockchange", () => syncLamps());

  // Command-M, the Mac OS X shortcut, only where the lamp is drawn. A browser
  // or host that claims Command-M for its own window never lets it reach the
  // page, so this is best effort and the menus never advertise it.
  document.addEventListener("keydown", (event) => {
    if (!enabled() || !event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    if (String(event.key).toLowerCase() !== "m") return;
    const win = document.querySelector(".window.is-active[data-window]");
    if (!win || !isMinimizable(win)) return;
    event.preventDefault();
    minimize(win);
  });
  // The module is loaded *by* a theme change, so the event that asked for it is
  // already over by the time this listener exists. Sync once on arrival, or the
  // appearance that grants the lamp would be the one appearance whose existing
  // windows never receive it.
  syncLamps();

  // ---- The Dock preference -----------------------------------------------
  //
  // One value for every Dock. NeXTSTEP has a Dock (its own shell draws it) and
  // the eras that will get one draw a Dock too; a writer's "I do not want a
  // Dock" is about the place a Dock takes on the desk, not about which app
  // paints it, so the preference lives here -- the module every Dock-drawing
  // appearance already loads for its minimize lamp -- and outlives any one
  // appearance. Storage is best-effort: a blocked or corrupt localStorage must
  // leave the desk at its default rather than throw, because this runs before
  // anything can report the failure. The default is the appearance's, as for
  // minimize above: hidden in the Mac OS X eras, shown in NeXTSTEP.
  const dockStorageKey = "ai-system-6-dock";

  function dockVisible() {
    try {
      const stored = JSON.parse(localStorage.getItem(dockStorageKey));
      if (stored && typeof stored.visible === "boolean") return stored.visible;
    } catch (error) { /* Unreadable storage reads as the default below. */ }
    return appearanceDefaultOn();
  }

  function setDockVisible(value) {
    const visible = value !== false;
    try { localStorage.setItem(dockStorageKey, JSON.stringify({ visible })); }
    catch (error) { /* The session preference still applies when storage is blocked. */ }
    document.dispatchEvent(new CustomEvent("ai-system6-dockchange", { detail: { visible } }));
    if (typeof renderMultiFinderMenu === "function") renderMultiFinderMenu();
    return visible;
  }

  // The Control Panel row. It is injected once, right after the Liquid Glass
  // tint field, because the General page is where a desk-wide switch belongs,
  // and it is the same row on every Dock-drawing appearance -- the preference
  // is shared, so the control that writes it is too.
  function syncDockVisibilityField() {
    const field = document.querySelector("#dock-visible")?.closest?.(".dock-visible-field");
    if (!field) return;
    const theme = window.AISystem6Theme;
    const current = theme?.getCurrentTheme?.();
    field.hidden = !(current === "nextstep" || theme?.hasCapability?.("dock") === true);
    const input = field.querySelector("#dock-visible");
    if (input) input.checked = dockVisible();
    const span = field.querySelector("span");
    if (span && typeof t === "function") span.textContent = t("show_dock");
  }

  function injectDockVisibilityField() {
    if (document.querySelector("#dock-visible")) return;
    const anchor = document.querySelector(".liquid-tint-field");
    if (!anchor) return;
    const field = document.createElement("label");
    field.className = "control-field dock-visible-field";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = "dock-visible";
    const span = document.createElement("span");
    span.textContent = typeof t === "function" ? t("show_dock") : "Show Dock";
    field.append(input, span);
    input.addEventListener("change", () => setDockVisible(input.checked));
    anchor.after(field);
    syncDockVisibilityField();
  }

  // The minimize switch sits beside Show Dock, on the same appearances.
  function syncMinimizeField() {
    const field = document.querySelector("#minimize-enabled")?.closest?.(".minimize-enabled-field");
    if (!field) return;
    const theme = window.AISystem6Theme;
    field.hidden = !(theme?.getCurrentTheme?.() === "nextstep" || theme?.hasCapability?.("minimize-lamp") === true);
    const input = field.querySelector("#minimize-enabled");
    if (input) input.checked = minimizeEnabled();
    const span = field.querySelector("span");
    if (span && typeof t === "function") span.textContent = t("minimize_windows_setting");
  }

  function injectMinimizeField() {
    if (document.querySelector("#minimize-enabled")) return;
    const anchor = document.querySelector(".dock-visible-field") || document.querySelector(".liquid-tint-field");
    if (!anchor) return;
    const field = document.createElement("label");
    field.className = "control-field minimize-enabled-field";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = "minimize-enabled";
    const span = document.createElement("span");
    span.textContent = typeof t === "function" ? t("minimize_windows_setting") : "Allow minimizing windows";
    field.append(input, span);
    input.addEventListener("change", () => setMinimizeEnabled(input.checked));
    anchor.after(field);
    syncMinimizeField();
  }

  document.addEventListener("ai-system6-themechange", syncDockVisibilityField);
  document.addEventListener("ai-system6-themechange", syncMinimizeField);
  injectDockVisibilityField();
  injectMinimizeField();
  // The default follows the appearance, so a theme change can switch the verb
  // off (NeXTSTEP to Aqua with no stored choice): reflect it, and roll up in
  // place whatever that leaves without a way back.
  function syncMinimizeDefault() {
    document.body?.classList?.toggle("minimize-off", !minimizeEnabled());
  }
  document.addEventListener("ai-system6-themechange", syncMinimizeDefault);
  syncMinimizeDefault();

  window.AISystem6WindowMinimize = Object.freeze({ minimize, restore, restoreFocus, isMinimized, syncLamp, syncLamps, windows, rows, renderAppleMenuSection, dockVisible, setDockVisible, minimizeEnabled, setMinimizeEnabled, lampEnabled: enabled });
  window.AISystem6WindowMinimizeLoaded = true;
  syncLamps();
  // Once on arrival, like syncLamps: the module is loaded by a theme change, so
  // the appearance that grants the lamp is the one whose Apple menu would
  // otherwise be the only one never filled.
  renderAppleMenuSection();
})();
