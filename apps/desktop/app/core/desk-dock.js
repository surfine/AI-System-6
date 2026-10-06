// The Mac OS X Dock: the row of objects at the foot of the desktop, and the
// entry point the owner's ruling of 2026-09-25 gives the yellow minimize lamp.
//
// WHY it exists at all. A window put away with the lamp has to have a place to
// go and a way back, so the lamp and the Dock are granted together -- the
// registry's `dock` capability travels with `minimize-lamp` on the same era,
// and this module is loaded for a theme that grants `dock`. All seven Mac OS X
// eras (Aqua through Liquid Glass) have a Dock. NeXTSTEP never reaches here: it
// keeps its own Dock (nextstep-dock.js), and the `hasCapability("dock")` test
// below is what keeps the two from ever drawing over each other.
//
// The Dock is an ENTRY POINT, never the only one. Its cells are a projection of
// objects the desk already owns -- the desktop's application cells, the running
// table, the put-away windows, the Applications folder and the Trash -- so with
// the Dock off nothing is stranded: every object it shows is still reachable
// through the desk's own icon column, its Menus, and the switcher/Apple-menu
// lists. The projection rule is deliberately the desk's own answer to "is this
// cell shown" and not a second opinion: a Dock cell is drawn for a
// `.icon-column .desktop-app-icon` whose cell lacks `is-hidden`/`hidden`, read
// from the DOM rather than from computed display -- because the Dock's own
// stylesheet hides those very cells while the Dock is shown, and a renderer
// that asked `getComputedStyle` would find its own projection and unlist it.
//
// Click semantics are the Mac's, not the desk's: one click activates, where a
// desktop icon is a select-then-open object. Activating an application brings
// its window forward, or brings one back from the Dock if every window is put
// away; it never quits -- the one Writing Studio cell whose action would quit
// opens the studio's default surface instead.
//
// The desk pays for the Dock only while it is on screen. The renderer leaves a
// reserve in `--desk-dock-reserve` (body class `desk-dock-shown`,
// data-desk-dock-owner `desk-dock`) so window-manager.js places and zooms
// windows above it; when this module is not the reserve's owner it removes all
// three, and a desk without the Dock places every window exactly as before.
(() => {
  if (window.AISystem6DeskDockLoaded) return;

  const dockVisible = () => window.AISystem6WindowMinimize?.dockVisible?.() ?? false;

  // The appId a window of each icon-column action belongs to. Verified against
  // window-registry.js: `open-quick-draft` -> quickDraft, `open-lightroom` ->
  // lightroom; the Writing Studio cell owns the workspace profile's writing
  // application, which has no window of its own and is named by the desk as
  // "writingStudio".
  const ACTION_APP_IDS = Object.freeze({
    "open-quick-draft": "quickDraft",
    "open-lightroom": "lightroom",
    "open-writing-studio": "writingStudio",
    "exit-writing-studio": "writingStudio",
  });

  let root = null;
  let signature = "";
  let queued = false;
  let menu = null;
  let clampDone = false;
  let magBound = false;
  let magRaf = 0;
  let magPointerX = null;

  // OS X Dock magnification: a cosine falloff along the icon row, expressed
  // as CSS custom properties the sheet turns into perspective / translateZ /
  // scale. Reduced motion keeps icons at rest.
  function reducedMotion() {
    try {
      return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    } catch (error) {
      return false;
    }
  }

  function clearMagnification() {
    magPointerX = null;
    if (!root) return;
    root.classList.remove("is-magnifying");
    root.querySelectorAll(".desk-dock-item").forEach((cell) => {
      cell.style.removeProperty("--dock-mag");
      cell.style.removeProperty("--dock-mag-z");
    });
  }

  // Peak / range vary by era: Jaguar's magnification is the most dramatic;
  // Big Sur / Tahoe keep a quieter lift so the floating pill stays readable.
  function magnificationCurve() {
    const theme = currentThemeId();
    if (theme === "aqua" || theme === "tiger") return { peak: 1.72, range: 120, z: 36 };
    if (theme === "big-sur" || theme === "liquid-glass") return { peak: 1.32, range: 96, z: 18 };
    if (theme === "yosemite") return { peak: 1.4, range: 100, z: 22 };
    return { peak: 1.55, range: 110, z: 28 };
  }

  function applyMagnification() {
    magRaf = 0;
    if (!root || magPointerX == null || reducedMotion()) {
      clearMagnification();
      return;
    }
    const items = root.querySelectorAll(".desk-dock-item");
    if (!items.length) return;
    root.classList.add("is-magnifying");
    const { peak, range, z: zPeak } = magnificationCurve();
    items.forEach((cell) => {
      const rect = cell.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const dist = Math.abs(magPointerX - cx);
      const t = Math.max(0, 1 - dist / range);
      const ease = 0.5 - 0.5 * Math.cos(Math.PI * t);
      const mag = 1 + (peak - 1) * ease;
      const z = zPeak * ease;
      cell.style.setProperty("--dock-mag", mag.toFixed(3));
      cell.style.setProperty("--dock-mag-z", `${z.toFixed(1)}px`);
    });
  }

  function onMagPointerMove(event) {
    if (!root?.contains(event.target)) return;
    magPointerX = event.clientX;
    if (!magRaf) magRaf = requestAnimationFrame(applyMagnification);
  }

  function onMagPointerLeave(event) {
    if (event.relatedTarget && root?.contains(event.relatedTarget)) return;
    clearMagnification();
  }

  function bindMagnification() {
    if (!root || magBound) return;
    magBound = true;
    root.addEventListener("pointermove", onMagPointerMove);
    root.addEventListener("pointerleave", onMagPointerLeave);
  }

  function active() {
    try {
      if (window.AISystem6Theme?.hasCapability?.("dock") !== true) return false;
    } catch (error) {
      return false;
    }
    if (!dockVisible()) return false;
    if (writerMode) return false;
    if (document.body?.classList?.contains("quick-draft-focus")) return false;
    // A window in full screen has the whole display; the Dock steps aside.
    if (document.body?.classList?.contains("window-fullscreen-active")) return false;
    if (isNarrowViewport()) return false;
    if (keyboardInsetValue() !== 0) return false;
    return true;
  }

  // ---- Projection --------------------------------------------------------

  function cellLabel(cell) {
    return cell.querySelector("span:last-child")?.textContent?.trim()
      || cell.getAttribute("aria-label")
      || "";
  }

  function shownDesktopAppCells() {
    // The projection rule: the DOM's shown-or-not, never computed display. The
    // Dock's stylesheet hides exactly these cells while it is shown; a computed
    // test would read the Dock's own hiding as "unlisted".
    return Array.from(document.querySelectorAll(".icon-column .desktop-app-icon"))
      .filter((cell) => !cell.classList.contains("is-hidden") && cell.hidden !== true);
  }

  function appIdForCell(cell) {
    if (cell.dataset.open) {
      const win = getWindow(cell.dataset.open);
      return (win && getWindowAppId(win)) || cell.dataset.open;
    }
    if (cell.dataset.action) return ACTION_APP_IDS[cell.dataset.action] || "";
    return "";
  }

  function runningIds() {
    return new Set(getRunningApps().map((app) => app.id));
  }

  // ---- Activation --------------------------------------------------------

  function frontmostVisibleWindow(appId) {
    return windowsForApp(appId)
      .filter((win) => !win.classList.contains("is-hidden")
        && !win.classList.contains("is-app-hidden")
        && !win.classList.contains("is-minimized"))
      .sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0] || null;
  }

  function minimizedWindowsFor(appId) {
    return windowsForApp(appId)
      .filter((win) => win.classList.contains("is-minimized")
        && !win.classList.contains("is-hidden")
        && !win.classList.contains("is-app-hidden"))
      .sort((a, b) => Number(b.dataset.minimizedAt || 0) - Number(a.dataset.minimizedAt || 0));
  }

  function dockLaunch(appId, cell) {
    if (appId) {
      const visible = frontmostVisibleWindow(appId);
      // (1) A visible, non-minimized window: bring the application forward. In
      // MultiFinder that is the switcher's own verb; in Finder mode (one
      // application at a time) it is focusing the frontmost window.
      if (visible) {
        if (isMultiFinderMode()) switchToApp(appId);
        else focusWindow(visible);
        return;
      }
      // (2) Every window put away: bring back the newest, which is the one a
      // writer looking for "what I just put away" wants.
      const miniaturized = minimizedWindowsFor(appId);
      if (miniaturized.length) {
        restoreMinimizedWindow(miniaturized[0]);
        return;
      }
    }
    // (3) Nothing of the application is on the desk: run the source cell's own
    // command. A Dock click never quits -- exit-writing-studio (the Writing
    // Studio cell's action while the studio is open) opens the studio's default
    // surface instead.
    if (!cell) return;
    if (cell.dataset.open) {
      openWindow(cell.dataset.open);
      return;
    }
    if (cell.dataset.action) {
      if (cell.dataset.action === "exit-writing-studio") {
        // Never quit from the Dock: enter Writing Studio (profile + default
        // surface). openWritingStudioDefaultSurface alone leaves the desk on
        // the desktop profile when no project is mounted.
        if (typeof openWritingStudio === "function") openWritingStudio();
        else openWritingStudioDefaultSurface();
        return;
      }
      handleAction(cell.dataset.action);
    }
  }

  function activateFinder() {
    if (isMultiFinderMode()) {
      switchToApp("finder");
      return;
    }
    const front = frontmostVisibleWindow("finder");
    if (front) focusWindow(front);
    else openWindow("disk");
  }

  // ---- DOM ---------------------------------------------------------------

  // The name above a Dock icon is drawn by the era where there is evidence
  // for it (internal/evidence/drafts/dock-reference, J2): Jaguar's white
  // outlined words (Tiger follows it), Snow Leopard's dark bubble (Lion
  // follows it). The later eras were never captured with a label showing, so
  // they keep the browser's own tooltip rather than an invented bubble.
  const LABEL_ERAS = new Set(["aqua", "tiger", "snow-leopard", "lion"]);

  function currentThemeId() {
    try {
      return window.AISystem6Theme?.getCurrentTheme?.() || "";
    } catch (error) {
      return "";
    }
  }

  function buildCell({ iconId, label, key, appId, balloonHelp, extraClass, onActivate, content }) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = `desk-dock-item${extraClass ? ` ${extraClass}` : ""}`;
    node.dataset.dockKey = key;
    if (appId) node.dataset.appId = appId;
    node.setAttribute("aria-label", label);
    if (LABEL_ERAS.has(currentThemeId())) node.dataset.dockLabel = label;
    else node.title = label;
    if (balloonHelp) node.dataset.balloonHelp = balloonHelp;
    if (content) node.append(content);
    else node.innerHTML = renderSystemIcon(iconId, { size: "large" });
    if (node.dataset.dockLabel) {
      const name = document.createElement("span");
      name.className = "desk-dock-label";
      name.setAttribute("aria-hidden", "true");
      name.textContent = label;
      node.append(name);
    }
    node.addEventListener("click", onActivate);
    return node;
  }

  // A minimized window's cell is a picture of the window with its
  // application's icon in the corner (J1: Jaguar's Dock; Apple HT3739 for
  // 10.6), not a generic document. Prefer the bitmap captured at minimize
  // (DOM foreignObject miniature when available; schematic paint otherwise).
  // Fall back to a title bar + grey rules when no capture was stored.
  function miniatureFor(win, appId) {
    const figure = document.createElement("span");
    figure.className = "desk-dock-miniature";
    figure.setAttribute("aria-hidden", "true");
    figure.dataset.window = win.dataset.window || "";
    figure.dataset.app = appId || win.dataset.app || "";
    const photoUrl = window.AISystem6WindowMinimize?.getMiniatureDataUrl?.(win);
    if (photoUrl) {
      figure.classList.add("is-photo");
      const img = document.createElement("img");
      img.className = "desk-dock-miniature-photo";
      img.alt = "";
      img.draggable = false;
      img.src = photoUrl;
      figure.append(img);
    } else {
      const bar = document.createElement("span");
      bar.className = "desk-dock-miniature-bar";
      const lamps = document.createElement("span");
      lamps.className = "desk-dock-miniature-lamps";
      lamps.setAttribute("aria-hidden", "true");
      ["close", "minimize", "zoom"].forEach((role) => {
        const lamp = document.createElement("span");
        lamp.className = `desk-dock-miniature-lamp is-${role}`;
        lamps.append(lamp);
      });
      const caption = document.createElement("span");
      caption.className = "desk-dock-miniature-title";
      caption.textContent = applicationWindowTitle(win) || "";
      bar.append(lamps, caption);
      const page = document.createElement("span");
      page.className = "desk-dock-miniature-page";
      const field = win.querySelector("textarea, [contenteditable='true']");
      const source = field
        ? (typeof field.value === "string" ? field.value : field.textContent)
        : (win.querySelector(".window-pane, .window-body, .window-content") || win).textContent;
      const lines = String(source || "").split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 7);
      lines.forEach((line) => {
        const rule = document.createElement("span");
        rule.className = "desk-dock-miniature-line";
        rule.style.width = `${Math.max(18, Math.min(100, Math.round(line.length * 2.2)))}%`;
        page.append(rule);
      });
      figure.append(bar, page);
    }
    const badge = document.createElement("span");
    badge.className = "desk-dock-miniature-badge";
    badge.innerHTML = renderSystemIcon(win.dataset.window || appId || "document", { size: "large" });
    figure.append(badge);
    return figure;
  }

  function makeAppCell(cell, running) {
    // The Writing Studio cell reads "Quit Writing Studio" while the studio is
    // open; the Dock names the application, and a Dock click never quits.
    const label = cell.dataset.action === "exit-writing-studio"
      ? t("writing_studio")
      : cellLabel(cell) || cell.getAttribute("aria-label") || "";
    const appId = appIdForCell(cell);
    const iconId = cell.querySelector("[data-system-icon]")?.dataset.systemIcon || "finderApp";
    const key = appId ? `app:${appId}` : `cell:${cell.id || label}`;
    const node = buildCell({
      iconId,
      label,
      key,
      appId,
      balloonHelp: cell.dataset.balloonHelp,
      extraClass: appId && running.has(appId) ? "is-running" : "",
      onActivate: () => dockLaunch(appId, cell),
    });
    return node;
  }

  function makeRunningCell(app) {
    // The application's own icon, named by its window the way the NeXTSTEP
    // Dock names a tile (renderSystemIcon takes a window name).
    return buildCell({
      iconId: app.lastWindowName || app.id,
      label: app.label || app.id,
      key: `app:${app.id}`,
      appId: app.id,
      extraClass: "is-running",
      onActivate: () => dockLaunch(app.id, null),
    });
  }

  function makeFolderCell(iconId, label, open, key) {
    return buildCell({
      iconId,
      label,
      key,
      onActivate: () => openWindow(open),
    });
  }

  function makeTrashCell() {
    const node = buildCell({
      iconId: "trash",
      label: t("trash"),
      key: "trash",
      onActivate: () => openWindow("trash"),
    });
    node.dataset.open = "trash";
    // The desk's existing drag-drop delegate reads data-drop-target, so a file
    // dropped on the Dock's Trash lands in the same Trash the desktop's own
    // Trash cell fills.
    node.dataset.dropTarget = "trash";
    return node;
  }

  function deselectProjectedSelectedIcon() {
    const selected = typeof selectedDesktopIconEl !== "undefined" ? selectedDesktopIconEl : null;
    if (!selected) return;
    if (selected.classList?.contains("is-hidden") || selected.hidden === true) selected.classList?.remove("is-selected");
  }

  function buildItems() {
    const running = runningIds();
    const nodes = [];

    // Finder is always the first cell.
    nodes.push(buildCell({
      iconId: "finderApp",
      label: t("finder"),
      key: "finder",
      appId: "finder",
      extraClass: running.has("finder") ? "is-running" : "",
      onActivate: () => activateFinder(),
    }));

    const shown = shownDesktopAppCells();
    const projectedIds = new Set();
    const appNodes = [];
    shown.forEach((cell) => {
      const appId = appIdForCell(cell);
      if (appId) projectedIds.add(appId);
      appNodes.push(makeAppCell(cell, running));
    });

    // Running applications the desk does not already show a cell for. Finder,
    // accessories and system are the desk's own nouns and never get a Dock cell
    // of their own beyond the Finder cell above.
    getRunningApps().forEach((app) => {
      if (!app.id || app.id === "finder" || app.id === "accessories" || app.id === "system") return;
      if (projectedIds.has(app.id)) return;
      appNodes.push(makeRunningCell(app));
    });
    nodes.push(...ordered(appNodes).map(makeDraggable));

    const separator = document.createElement("span");
    separator.className = "desk-dock-separator";
    separator.setAttribute("role", "separator");
    nodes.push(separator);

    // The Applications stack is a 10.5+ default: the 10.0-10.4 default right
    // side held only URL/documents and the Trash. Keep it from snow-leopard on.
    // (J3: internal/evidence/drafts/dock-reference/README.zh-CN.md)
    const themeId = window.AISystem6Theme?.getCurrentTheme?.();
    if (themeId !== "aqua" && themeId !== "tiger") {
      nodes.push(makeFolderCell("applications", t("applications"), "applications", "folder:applications"));
    }

    const minimized = window.AISystem6WindowMinimize?.windows?.() || [];
    minimized.forEach((win) => {
      const label = applicationWindowTitle(win) || win.dataset.window || "";
      const appId = getWindowAppId(win);
      const node = buildCell({
        iconId: "document",
        label,
        key: `window:${win.dataset.window}`,
        appId,
        extraClass: "is-miniwindow",
        content: miniatureFor(win, appId),
        onActivate: () => restoreMinimizedWindow(win),
      });
      node.dataset.miniwindow = win.dataset.window;
      nodes.push(node);
    });

    nodes.push(makeTrashCell());
    return nodes;
  }

  // ---- The writer's order ------------------------------------------------
  //
  // Application cells can be dragged into the order the writer wants, as on
  // the Mac; Finder stays first and the documents end stays where it is. The
  // order is its own small preference, so hiding the Dock never forgets it,
  // and a cell it does not name keeps its place after the named ones.
  const orderStorageKey = "ai-system-6-dock-order";

  function readOrder() {
    try {
      const stored = JSON.parse(localStorage.getItem(orderStorageKey));
      return Array.isArray(stored) ? stored.filter((key) => typeof key === "string") : [];
    } catch (error) {
      return [];
    }
  }

  function writeOrder(keys) {
    try { localStorage.setItem(orderStorageKey, JSON.stringify(keys)); }
    catch (error) { /* The order holds for this session. */ }
  }

  function ordered(nodes) {
    const order = readOrder();
    const rank = (node) => {
      const index = order.indexOf(node.dataset.dockKey);
      return index === -1 ? order.length : index;
    };
    return nodes
      .map((node, index) => ({ node, index }))
      .sort((a, b) => rank(a.node) - rank(b.node) || a.index - b.index)
      .map(({ node }) => node);
  }

  function makeDraggable(node) {
    node.draggable = true;
    node.classList.add("is-orderable");
    node.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("application/x-desk-dock", node.dataset.dockKey);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      node.classList.add("is-drag-source");
    });
    node.addEventListener("dragend", () => node.classList.remove("is-drag-source"));
    node.addEventListener("dragover", (event) => {
      if (event.dataTransfer?.types?.includes("application/x-desk-dock")) event.preventDefault();
    });
    node.addEventListener("drop", (event) => {
      const source = event.dataTransfer?.getData("application/x-desk-dock");
      if (!source || source === node.dataset.dockKey) return;
      event.preventDefault();
      moveBefore(source, node.dataset.dockKey);
    });
    return node;
  }

  function moveBefore(sourceKey, targetKey) {
    const keys = Array.from(root?.querySelectorAll(".desk-dock-item.is-orderable") || []).map((node) => node.dataset.dockKey);
    const without = keys.filter((key) => key !== sourceKey);
    const at = without.indexOf(targetKey);
    if (at === -1) return;
    without.splice(at, 0, sourceKey);
    writeOrder(without);
    signature = "";
    schedule();
  }

  // ---- Roving tabindex keyboard -----------------------------------------

  function cells() {
    return root ? Array.from(root.querySelectorAll(".desk-dock-item")) : [];
  }

  function setCurrentCell(node) {
    const all = cells();
    all.forEach((cell) => { cell.tabIndex = cell === node ? 0 : -1; });
    node?.focus?.();
  }

  function onItemsKeydown(event) {
    const all = cells();
    if (!all.length) return;
    const current = root.contains(document.activeElement) ? document.activeElement : all[0];
    const index = Math.max(0, all.indexOf(current));
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setCurrentCell(all[(index - 1 + all.length) % all.length]);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setCurrentCell(all[(index + 1) % all.length]);
    } else if (event.key === "Home") {
      event.preventDefault();
      setCurrentCell(all[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      setCurrentCell(all[all.length - 1]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      current.dispatchEvent(new Event("click"));
    }
  }

  // ---- Context menu ------------------------------------------------------

  function closeMenu() {
    menu?.remove();
    menu = null;
    document.removeEventListener("pointerdown", onOutsidePointer, true);
    document.removeEventListener("keydown", onMenuKeydown, true);
  }

  function onOutsidePointer(event) {
    if (menu && !menu.contains(event.target)) closeMenu();
  }

  function onMenuKeydown(event) {
    if (event.key === "Escape") closeMenu();
  }

  function openMenu(clientX, clientY) {
    closeMenu();
    menu = document.createElement("div");
    menu.className = "menu-popover desk-dock-menu";
    const hide = document.createElement("button");
    hide.type = "button";
    hide.textContent = t("hide_dock");
    hide.addEventListener("click", () => {
      window.AISystem6WindowMinimize?.setDockVisible?.(false);
      closeMenu();
    });
    menu.append(hide);
    menu.style.left = `${Math.round(clientX)}px`;
    menu.style.top = `${Math.round(clientY)}px`;
    document.body.append(menu);
    document.addEventListener("pointerdown", onOutsidePointer, true);
    document.addEventListener("keydown", onMenuKeydown, true);
  }

  function onContextmenu(event) {
    if (!root) return;
    // Anywhere on the Dock that is not an item: the shelf itself sits under
    // the item row, so the row's own background is the shelf to a pointer.
    if (event.target.closest?.(".desk-dock-item")) return;
    event.preventDefault();
    openMenu(event.clientX || 0, event.clientY || 0);
  }

  // ---- Reserve -----------------------------------------------------------

  function release() {
    closeMenu();
    clearMagnification();
    if (root && magBound) {
      root.removeEventListener("pointermove", onMagPointerMove);
      root.removeEventListener("pointerleave", onMagPointerLeave);
    }
    magBound = false;
    root?.remove();
    root = null;
    signature = "";
    clampDone = false;
    if (document.body?.dataset?.deskDockOwner === "desk-dock") {
      document.body.classList.remove("desk-dock-shown");
      document.body.style.removeProperty("--desk-dock-reserve");
      delete document.body.dataset.deskDockOwner;
    }
  }

  function measureReserve() {
    if (!root) return;
    const height = Math.round((root.getBoundingClientRect().height || 0) + 4);
    document.body.style.setProperty("--desk-dock-reserve", `${height}px`);
  }

  // Jaguar / Tiger: punch a 1px slot through the plate at the separator so the
  // desktop shows between the white rims (M05). Other eras leave the shelf whole.
  function syncShelfCut() {
    const shelf = root?.querySelector?.(".desk-dock-shelf");
    if (!shelf) return;
    const theme = currentThemeId();
    const sep = root.querySelector(".desk-dock-separator");
    if (!sep || (theme !== "aqua" && theme !== "tiger")) {
      shelf.classList.remove("has-cut");
      shelf.style.removeProperty("--desk-dock-cut-at");
      return;
    }
    const shelfRect = shelf.getBoundingClientRect();
    const sepRect = sep.getBoundingClientRect();
    if (!shelfRect.width || !sepRect.width) {
      shelf.classList.remove("has-cut");
      return;
    }
    const at = sepRect.left + sepRect.width / 2 - shelfRect.left;
    shelf.style.setProperty("--desk-dock-cut-at", `${at.toFixed(1)}px`);
    shelf.classList.add("has-cut");
  }

  function claimReserve() {
    document.body.classList.add("desk-dock-shown");
    document.body.dataset.deskDockOwner = "desk-dock";
    measureReserve();
  }

  function clampWindows() {
    if (clampDone) return;
    clampDone = true;
    document.querySelectorAll(".window[data-window]").forEach((win) => {
      if (win.classList.contains("is-hidden") || win.dataset.userPositioned === "true") return;
      clampWindowToViewport(win);
    });
  }

  // ---- Sync --------------------------------------------------------------

  function sync() {
    queued = false;
    if (!active()) {
      release();
      return;
    }
    const shown = shownDesktopAppCells();
    const running = getRunningApps();
    const minimized = window.AISystem6WindowMinimize?.windows?.() || [];
    const nextSignature = JSON.stringify([
      running.map((app) => [app.id, app.hidden, app.windowCount]),
      shown.map((cell) => [cell.id || "", cell.dataset.action || cell.dataset.open || "", cellLabel(cell)]),
      // The bitmap is part of the signature: minimizing stores the schematic
      // paint synchronously and the true DOM miniature arrives a frame or two
      // later. Without this, the Dock redraw the DOM capture triggers found an
      // unchanged signature and kept the schematic tile -- a "photo" whose
      // pixels were never the window's.
      minimized.map((win) => [
        win.dataset.window,
        applicationWindowTitle(win),
        window.AISystem6WindowMinimize?.getMiniatureDataUrl?.(win) || "",
      ]),
      t("dock"), t("hide_dock"), t("applications"), t("trash"),
      isMultiFinderMode(),
      readOrder(),
      currentThemeId(),
    ]);
    if (signature === nextSignature && root) {
      // Nothing to redraw, but a resize or a font change can still move the
      // Dock's height, and window placement reads the reserve. The Aqua/Tiger
      // plate cut tracks the separator's new x as well.
      measureReserve();
      syncShelfCut();
      return;
    }
    signature = nextSignature;

    const focusedKey = root && root.contains(document.activeElement) ? document.activeElement.dataset?.dockKey : "";
    if (!root) {
      root = document.createElement("nav");
      root.className = "desk-dock";
      root.setAttribute("aria-label", t("dock"));
      const shelf = document.createElement("div");
      shelf.className = "desk-dock-shelf";
      shelf.setAttribute("aria-hidden", "true");
      const items = document.createElement("div");
      items.className = "desk-dock-items";
      items.setAttribute("role", "toolbar");
      items.setAttribute("aria-label", t("dock"));
      root.append(shelf, items);
      root.addEventListener("contextmenu", onContextmenu);
      items.addEventListener("keydown", onItemsKeydown);
      document.body.append(root);
      bindMagnification();
    }

    const items = root.querySelector(".desk-dock-items");
    items.replaceChildren(...buildItems());
    clearMagnification();

    // Roving tabindex: the toolbar is a single Tab stop, so exactly one cell
    // carries tabindex 0 and the rest -1.
    const all = cells();
    if (!all.length) return;
    const restored = focusedKey ? all.find((cell) => cell.dataset.dockKey === focusedKey) : null;
    const target = restored || all[0];
    all.forEach((cell) => { cell.tabIndex = cell === target ? 0 : -1; });

    deselectProjectedSelectedIcon();
    claimReserve();
    clampWindows();
    // After items replace, wait a frame so the separator has a real box before
    // the Aqua/Tiger plate cut is measured.
    requestAnimationFrame(syncShelfCut);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(sync);
  }

  document.addEventListener("ai-system6-themechange", schedule);
  document.addEventListener("ai-system6-dockchange", schedule);
  window.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener?.("resize", schedule);

  window.AISystem6DeskDock = Object.freeze({ sync: schedule, moveBefore });
  window.AISystem6DeskDockLoaded = true;
  // Once on arrival: the module is loaded *by* a theme change, so the event
  // that asked for it is already over by the time this listener exists.
  sync();
})();
