// Projection of windowRegistry/runningApps. Pins are personal shortcuts; they
// never construct an application or change its document/session state.
//
// NeXTSTEP 3.3 keeps two places on the desk, and they are not one object: the
// Dock, down the right edge, holds ONLY the fixed (pinned) application icons,
// and a desk row along the bottom holds the rest -- the applications that are
// merely running, then one miniwindow per put-away window to their right. Both
// project the same source (pins / runningApps / the miniaturized windows), but
// into two roots: a `.nextstep-dock` the writer can switch off, and a desk row
// that is always there so nothing strands when the Dock is off (owner decision:
// the bottom row is a desk object, NOT part of the Dock).
(() => {
  const storageKey = "ai-system-6-nextstep-dock";
  let pins;
  try { pins = JSON.parse(localStorage.getItem(storageKey)); } catch { /* Defaults below. */ }
  if (!Array.isArray(pins)) pins = ["finder", "teachText", "clioTalk"];
  pins = [...new Set(pins.filter((id) => typeof id === "string"))];
  let root = null;
  let row = null;
  let signature = "";
  let queued = false;
  const launching = new Map();
  const failures = new Set();

  // The shared Dock preference owns whether the right-edge Dock exists. The
  // module is loaded for NeXTSTEP whether or not that preference is on, so this
  // reads the state rather than the module's presence.
  function dockShown() {
    return window.AISystem6WindowMinimize?.dockVisible?.() !== false;
  }

  // The one labelled region the Dock root holds: the fixed applications, in
  // their pinned order, directly under the menu bar. Labels come from strings
  // the desk already ships, so a region never needs a new translation.
  const FIXED_REGION = Object.freeze({ id: "fixed", labelKey: "nextstep_dock" });
  // The two sections of the bottom desk row, in the order they read left to
  // right: running applications, then the window miniwindows. `legacy` carries
  // the class the old windows-region selector used: the lamp contract (and the
  // NeXTSTEP workflow verifier) reach a miniwindow by that name, and a
  // miniwindow is still a miniwindow whichever root draws it.
  const ROW_SECTIONS = Object.freeze([
    { id: "running", labelKey: "applications", className: "nextstep-desk-row-apps", legacy: "" },
    { id: "windows", labelKey: "nextstep_windows", className: "nextstep-desk-row-windows", legacy: "nextstep-dock-windows" },
  ]);

  function catalog() {
    const result = new Map();
    Object.entries(windowRegistry).forEach(([name, record]) => {
      const app = record.app || window.AISystem6Admissions.windowRecord(name)?.app;
      if (!app || ["accessories", "system"].includes(app) || (result.has(app) && name !== app)) return;
      result.set(app, { id: app, name, label: multiFinderAppLabels[app] || app });
    });
    // A running application the registry names by another id (Writing Studio
    // runs as "writingStudio" and owns no window of its own) still gets its
    // icon: the desk row and the Dock project what is running, not only what
    // the registry lists.
    getRunningApps().forEach((app) => {
      if (result.has(app.id)) return;
      result.set(app.id, { id: app.id, name: app.lastWindowName || app.id, label: multiFinderAppLabels[app.id] || app.label || app.id });
    });
    return result;
  }

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(pins)); } catch { /* Session pins still work. */ }
    signature = "";
    sync();
  }

  async function activate(id) {
    if (launching.has(id)) return launching.get(id);
    const entry = catalog().get(id);
    if (!entry) return;
    const app = runningApps.get(id);
    const live = windowsForApp(id).filter((win) => !win.classList.contains("is-hidden"));
    // An application that already has windows is brought forward, never
    // relaunched: relaunching reopens its last window through openWindow,
    // which is also the way back from a miniwindow, and NeXTSTEP leaves a
    // miniwindow where it is when its application is activated. So with only
    // miniwindows left the application comes forward with no window in front.
    if (live.length) {
      if (isMultiFinderMode()) switchToApp(id);
      const candidate = live.find((win) => !win.classList.contains("is-minimized"));
      if (candidate) focusWindow(candidate);
      else if (!isMultiFinderMode()) { activeAppId = id; renderMultiFinderMenu(); }
      return;
    }
    failures.delete(id);
    const request = Promise.resolve().then(() => openWindow(app?.lastWindowName || entry.name)).then(() => {
      if (!windowsForApp(id).some((win) => !win.classList.contains("is-hidden"))) failures.add(id);
    }).catch(() => failures.add(id)).finally(() => {
      launching.delete(id);
      signature = "";
      sync();
    });
    launching.set(id, request);
    sync();
    return request;
  }

  function button(label, run) {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.addEventListener("click", run);
    return node;
  }

  let pinMenu = null;
  let pinMenuOwner = null;
  function closePinMenu(returnFocus = false) {
    const owner = pinMenuOwner;
    pinMenu?.remove(); pinMenu = null; pinMenuOwner = null;
    document.removeEventListener("pointerdown", outsidePinMenu, true);
    document.removeEventListener("keydown", pinMenuKey, true);
    if (returnFocus && owner?.isConnected) owner.focus({ preventScroll: true });
  }
  function outsidePinMenu(event) {
    if (pinMenu && !pinMenu.contains(event.target)) closePinMenu();
  }
  function pinMenuKey(event) {
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      event.stopPropagation(); closePinMenu(true);
    }
  }
  function openPinMenu(node, id, x, y) {
    closePinMenu();
    pinMenuOwner = node;
    pinMenu = document.createElement("div");
    pinMenu.className = "menu-popover nextstep-dock-menu";
    pinMenu.setAttribute("role", "menu");
    pinMenu.setAttribute("aria-label", node.getAttribute("aria-label"));
    const pinned = pins.includes(id);
    const item = button(t(pinned ? "dock_remove" : "dock_keep"), () => {
      closePinMenu(true);
      pins = pinned ? pins.filter((value) => value !== id) : [...pins, id];
      save();
    });
    item.setAttribute("role", "menuitem");
    item.style.whiteSpace = "normal";
    item.style.overflowWrap = "anywhere";
    pinMenu.append(item);
    Object.assign(pinMenu.style, { display: "block", position: "fixed", zIndex: "var(--z-system-menu)", maxWidth: "calc(100vw - 16px)", maxHeight: "calc(100dvh - 48px)", overflowY: "auto" });
    document.body.append(pinMenu);
    const rect = pinMenu.getBoundingClientRect();
    pinMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    pinMenu.style.top = `${Math.max(30, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    item.focus();
    document.addEventListener("pointerdown", outsidePinMenu, true);
    document.addEventListener("keydown", pinMenuKey, true);
  }

  function tile(label, run, iconId, key) {
    const node = button("", (event) => {
      if (event.detail === 0 || event.pointerType === "touch" || event.pointerType === "pen") run();
      else node.focus();
    });
    node.addEventListener("dblclick", run);
    node.className = "nextstep-dock-tile";
    node.dataset.dockKey = key;
    node.setAttribute("aria-label", label);
    node.title = label;
    node.addEventListener("focus", () => {
      if (node.matches(":focus-visible") && typeof showBalloonHelp === "function") showBalloonHelp(node, label, { force: true });
    });
    node.addEventListener("blur", () => { if (typeof hideBalloonHelp === "function") hideBalloonHelp(); });
    node.innerHTML = renderSystemIcon(iconId, { size: "large" });
    return node;
  }

  // The Dock root's one region carries a printed heading as well as its
  // accessible name: a narrow right-edge column reads as a labelled thing. The
  // desk row's sections carry the accessible name only -- a desk row carries
  // icons, not headings (owner decision) -- so the heading is opt-in, and so is
  // the class prefix: a row section is a desk-row object, not a Dock region,
  // and must not inherit the column's styling.
  function region(descriptor, { heading = false, row = false } = {}) {
    const label = t(descriptor.labelKey);
    const node = document.createElement("section");
    node.className = row
      ? `nextstep-desk-row-section ${descriptor.className}${descriptor.legacy ? ` ${descriptor.legacy}` : ""}`
      : `nextstep-dock-region nextstep-dock-${descriptor.id}`;
    node.dataset.dockRegion = descriptor.id;
    node.setAttribute("aria-label", label);
    if (heading) {
      const title = document.createElement("h2");
      title.className = "nextstep-dock-region-label";
      title.textContent = label;
      node.append(title);
    }
    return node;
  }

  // A region with nothing in it keeps its place in the structure and hides.
  // The contract pins that: the Dock has its fixed region and the desk row its
  // two sections, not one list that grows and shrinks.
  function settle(node) {
    if (!node.querySelector(".nextstep-dock-tile")) node.setAttribute("hidden", "");
    return node;
  }

  // The desk row along the bottom: running applications first, then the window
  // miniwindows to their right. It is appended to the body whenever NeXTSTEP is
  // active, whether or not the Dock is shown, because it is not part of the
  // Dock -- it is where a running application and a put-away window live when
  // the right-edge column is switched off.
  function ensureRow() {
    if (row) return row;
    row = document.createElement("div");
    row.className = "nextstep-desk-row";
    row.setAttribute("aria-label", t("nextstep_desk_icons"));
    document.body.append(row);
    return row;
  }

  // The bottom reserve the desk subtracts from its window working area. The row
  // measures itself: the CSS pixel height it actually took, standing on the
  // screen edge as 3.3's icons do. Only the NeXTSTEP owner may set or clear it;
  // an era that reads the same CSS variable is left alone.
  function syncRowReserve() {
    const body = document.body;
    if (row && row.querySelector(".nextstep-dock-tile")) {
      const height = row.getBoundingClientRect?.().height || 0;
      // At least one tile: a row that holds tiles is 64px tall even before it
      // has been laid out.
      body.style.setProperty("--desk-dock-reserve", `${Math.max(64, Math.round(height))}px`);
      body.classList.add("desk-dock-shown");
      body.dataset.deskDockOwner = "nextstep";
    } else if (body.dataset.deskDockOwner === "nextstep") {
      body.style.removeProperty("--desk-dock-reserve");
      body.classList.remove("desk-dock-shown");
      delete body.dataset.deskDockOwner;
    }
  }

  // Leaving NeXTSTEP takes every object this module owns off the desk, and
  // gives the bottom reserve back only if this module is the one holding it.
  function teardown() {
    if ((root?.contains(document.activeElement) || row?.contains(document.activeElement))
      && typeof hideBalloonHelp === "function") hideBalloonHelp();
    closePinMenu();
    root?.remove(); root = null;
    row?.remove(); row = null;
    document.body.classList.remove("nextstep-dock-shown");
    document.body.style.removeProperty("--nextstep-dock-width");
    syncRowReserve();
    signature = "";
  }

  function sync() {
    queued = false;
    if (window.AISystem6Theme.getCurrentTheme() !== "nextstep") {
      teardown();
      return;
    }
    const apps = catalog();
    const running = getRunningApps();
    const minis = Array.from(document.querySelectorAll(".window.is-minimized:not(.is-hidden):not(.is-app-hidden)"))
      .filter((win) => !hiddenAppIds.has(getWindowAppId(win)));
    // The Dock preference is part of the render signature: turning the Dock off
    // has to re-project the desk, not wait for the next theme change.
    const shown = dockShown();
    const nextSignature = JSON.stringify([pins, shown, running.map((app) => [app.id, app.hidden, app.windowCount]),
      Array.from(launching.keys()), Array.from(failures), minis.map((win) => [win.dataset.window, applicationWindowTitle(win)]),
      t("nextstep_dock"), t("nextstep_desk_icons")]);
    if (signature === nextSignature) return;
    signature = nextSignature;
    // The Dock is a user-switchable object: when the preference is off the root
    // is not in the document at all, and `nextstep-dock-shown` -- the class the
    // appearance stylesheet gates the Classic icon column on -- comes off with
    // it, exactly as it comes off when the root is empty.
    if (!shown) { root?.remove(); root = null; document.body.classList.remove("nextstep-dock-shown"); document.body.style.removeProperty("--nextstep-dock-width"); }
    else if (!root) {
      root = document.createElement("aside");
      root.className = "nextstep-dock";
      root.setAttribute("aria-label", t("nextstep_dock"));
      document.body.append(root);
      // The class the appearance stylesheet gates the Classic icon column on is
      // present exactly while the Dock root is on screen.
      document.body.classList.add("nextstep-dock-shown");
    }
    if (root) document.body.style.setProperty("--nextstep-dock-width", "64px");
    if (root) root.setAttribute("aria-label", t("nextstep_dock"));
    const deskRow = ensureRow();
    deskRow.setAttribute("aria-label", t("nextstep_desk_icons"));
    const focusedKey = root?.contains(document.activeElement) || row?.contains(document.activeElement) ? document.activeElement.dataset.dockKey : "";
    function addApp(id, pinned, container) {
      const entry = apps.get(id);
      if (!entry) return;
      // Workspace (the Finder here) is the Dock's first tile with its own
      // application icon, not the icon of the window it happens to open.
      const node = tile(entry.label, () => activate(id), id === "finder" ? "finderApp" : entry.name, `app:${id}`);
      node.dataset.appId = id;
      window.AISystem6WindowShadePreferences?.bindDockHover?.(node, id);
      node.dataset.state = launching.has(id) ? "launching" : failures.has(id) ? "failed"
        : running.some((app) => app.id === id || (id === "teachText" && app.id === "writingStudio")) ? "running" : "stopped";
      node.draggable = true;
      node.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("application/x-system6-dock", id);
        event.dataTransfer.effectAllowed = "move";
      });
      node.addEventListener("dragend", (event) => {
        const target = document.elementFromPoint(event.clientX, event.clientY);
        // Dragging a pinned icon off the Dock unpins it. Only an icon that is
        // really in the Dock can be dragged out of it: a pinned icon drawn in
        // the desk row (the Dock is off) is a desk icon, not a Dock icon, and
        // must not lose its pin by being moved off the row.
        if (pinned && node.closest(".nextstep-dock") && target && !target.closest(".nextstep-dock")
          && event.dataTransfer.dropEffect === "move") {
          pins = pins.filter((value) => value !== id); save();
        }
      });
      node.addEventListener("dragover", (event) => event.preventDefault());
      node.addEventListener("drop", (event) => {
        event.preventDefault();
        const source = event.dataTransfer.getData("application/x-system6-dock");
        if (!apps.has(source) || source === id) return;
        pins = pins.filter((value) => value !== source);
        pins.splice(Math.max(0, pins.indexOf(id)), 0, source);
        save();
      });
      node.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openPinMenu(node, id, event.clientX || 0, event.clientY || 0);
      });
      node.addEventListener("keydown", (event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          const rect = node.getBoundingClientRect();
          openPinMenu(node, id, rect.left, rect.top);
        }
      });
      container.append(node);
    }
    // A miniwindow is one window, never one bucket per application: two open
    // documents of the same application stay two icons, each named for its own
    // window, so restoring one cannot restore the other by accident.
    function addMiniwindow(win, container) {
      const title = applicationWindowTitle(win);
      const node = tile(t("nextstep_restore", title),
        () => window.AISystem6NextstepShell.restore(win), "document", `window:${win.dataset.window}`);
      node.dataset.miniwindow = win.dataset.window;
      node.classList.add("is-miniwindow");
      const caption = document.createElement("span");
      caption.className = "nextstep-dock-tile-label";
      caption.textContent = title;
      node.append(caption);
      container.append(node);
    }
    // The Dock root: the pinned tiles, and nothing else -- NeXTSTEP 3.3 draws
    // no heading and no controls in the Dock column. A tile is pinned by
    // dragging a desk-row icon onto the Dock, unpinned by dragging it off (or
    // from its context menu), and the Dock itself is shown or hidden from the
    // Control Panel's Show Dock switch. The tiles are added before the region
    // settles: settle() hides a region that has none.
    let fixedRegion = null;
    if (root) {
      fixedRegion = region(FIXED_REGION);
      pins.forEach((id) => addApp(id, true, fixedRegion));
      root.replaceChildren(settle(fixedRegion));
    }
    // The desk row: running applications, then the miniwindows.
    const [appsSection, windowsSection] = ROW_SECTIONS.map((descriptor) => region(descriptor, { row: true }));
    // Which running applications are not already in the Dock. With the Dock on,
    // a pinned application is reachable there and stays out of the row; with it
    // off, the row is the only place it can be reached, so a pinned *running*
    // application joins the row as well -- nothing strands when the Dock is off.
    running
      .filter((app) => shown ? !pins.includes(app.id) : true)
      .forEach((app) => addApp(app.id, pins.includes(app.id), appsSection));
    minis.forEach((win) => addMiniwindow(win, windowsSection));
    deskRow.replaceChildren(settle(appsSection), settle(windowsSection));
    syncRowReserve();
    if (focusedKey) {
      const tiles = [...(root?.querySelectorAll("[data-dock-key]") || []), ...(row?.querySelectorAll("[data-dock-key]") || [])];
      (tiles.find((node) => node.dataset.dockKey === focusedKey) || tiles[0])?.focus({ preventScroll: true });
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(sync);
  }
  document.addEventListener("dragover", (event) => {
    if (event.dataTransfer.types.includes("application/x-system6-dock")) {
      event.preventDefault(); event.dataTransfer.dropEffect = "move";
    }
  });
  document.addEventListener("drop", (event) => {
    if (event.dataTransfer.types.includes("application/x-system6-dock")) event.preventDefault();
  });
  document.addEventListener("ai-system6-themechange", schedule);
  // Turning the Dock on or off in the Control Panel re-projects the desk: the
  // root appears or goes, and the pinned running icons move in or out of the
  // bottom row.
  document.addEventListener("ai-system6-dockchange", schedule);
  window.AISystem6NextstepDock = Object.freeze({ sync: schedule, activate });
})();
