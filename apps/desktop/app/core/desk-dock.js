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
  let submenu = null;
  let menuOwner = null;
  let clampDone = false;
  let magBound = false;
  let magRaf = 0;
  let magPointerX = null;
  // Each icon's centre at rest, read once when magnification starts. Reading
  // it every frame measured the icons mid-transform (scale and translateZ move
  // a cell's box), so the curve chased its own output and the row shimmered,
  // and each frame forced a layout read for every cell.
  let magCentres = null;

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
    magCentres = null;
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
    if (!magCentres || magCentres.length !== items.length) {
      magCentres = Array.from(items, (cell) => {
        const rect = cell.getBoundingClientRect();
        return rect.left + rect.width / 2;
      });
    }
    root.classList.add("is-magnifying");
    const { peak, range, z: zPeak } = magnificationCurve();
    items.forEach((cell, index) => {
      const cx = magCentres[index];
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
    // One exception: MultiFinder hides the desk's Writing Studio switch (the
    // studio is reached from Applications there), but the Dock is where a
    // running desk keeps its applications, and a Dock shown always runs as
    // MultiFinder; so the studio keeps its place in the Dock.
    return Array.from(document.querySelectorAll(".icon-column .desktop-app-icon"))
      .filter((cell) => (!cell.classList.contains("is-hidden") && cell.hidden !== true)
        || (cell.id === "finder-writing-studio-toggle" && cell.hidden !== true && isMultiFinderMode()));
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
    if (appId && hiddenAppIds.has(appId)) {
      const win = applicationWindowOrder(appId)[0];
      if (win) { restoreApplicationWindow(win); return; }
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
    if (appId) {
      node.dataset.appId = appId;
      if (!key.startsWith("window:")) window.AISystem6WindowShadePreferences?.bindDockHover?.(node, appId);
    }
    node.setAttribute("aria-label", label);
    // An era with a drawn name plate shows only that plate: a browser tooltip
    // on top of it would be a second label the Dock never had.
    if (LABEL_ERAS.has(currentThemeId())) node.dataset.dockLabel = label;
    else node.title = label;
    // Later eras have no approved native label plate. Use the existing hint
    // surface for keyboard names instead of inventing another era treatment.
    node.addEventListener("focus", () => {
      if (!node.dataset.dockLabel && node.matches(":focus-visible") && typeof showBalloonHelp === "function") {
        showBalloonHelp(node, label, { force: true });
      }
    });
    node.addEventListener("blur", () => { if (typeof hideBalloonHelp === "function") hideBalloonHelp(); });
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
      extraClass: runningIds().has(app.id) ? "is-running" : "",
      onActivate: () => {
        if (runningIds().has(app.id)) dockLaunch(app.id, null);
        else openWindow(app.lastWindowName);
      },
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
      if (!appId || kept(appId, true) || running.has(appId)) appNodes.push(makeAppCell(cell, running));
    });

    // Running applications the desk does not already show a cell for. Finder,
    // accessories and system are the desk's own nouns and never get a Dock cell
    // of their own beyond the Finder cell above.
    getRunningApps().forEach((app) => {
      if (!app.id || app.id === "finder" || app.id === "accessories" || app.id === "system") return;
      if (projectedIds.has(app.id)) return;
      appNodes.push(makeRunningCell(app));
    });
    const known = appCatalog();
    preferences().keep.forEach((id) => {
      if (projectedIds.has(id) || running.has(id)) return;
      const app = known.get(id);
      if (app && isWorkspaceWindowAllowed(app.lastWindowName)) appNodes.push(makeRunningCell(app));
    });
    nodes.push(...ordered(appNodes).map(makeDraggable));

    const separator = document.createElement("span");
    separator.className = "desk-dock-separator";
    separator.setAttribute("role", "separator");
    const divider = perspectiveDivider(currentThemeId());
    if (divider) separator.style.setProperty("--desk-dock-divider", divider);
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

  const favoritesStorageKey = "ai-system-6-dock-favorites";
  let sessionPreferences = null;

  function appCatalog() {
    const apps = new Map();
    Object.entries(windowRegistry).forEach(([name, record]) => {
      const id = record.app || window.AISystem6Admissions?.windowRecord(name)?.app;
      if (!id || ["finder", "system", "accessories"].includes(id)) return;
      if (!apps.has(id) || name === id) apps.set(id, { id, lastWindowName: name, label: multiFinderAppLabels[id] || id });
    });
    return apps;
  }

  function preferences() {
    try {
      const value = sessionPreferences || JSON.parse(localStorage.getItem(favoritesStorageKey));
      if (!value || !Array.isArray(value.keep) || !Array.isArray(value.remove)
        || ![...value.keep, ...value.remove].every((id) => typeof id === "string")) return { keep: [], remove: [] };
      const ids = new Set([...appCatalog().keys(), ...Object.values(ACTION_APP_IDS)]);
      return { keep: [...new Set(value.keep.filter((id) => ids.has(id)))], remove: [...new Set(value.remove.filter((id) => ids.has(id)))] };
    } catch { return { keep: [], remove: [] }; }
  }

  function kept(id, byDefault = shownDesktopAppCells().some((cell) => appIdForCell(cell) === id)) {
    const prefs = preferences();
    return !prefs.remove.includes(id) && (byDefault || prefs.keep.includes(id));
  }

  function setKept(id, keep) {
    const prefs = preferences();
    sessionPreferences = {
      keep: [...prefs.keep.filter((value) => value !== id), ...(keep ? [id] : [])],
      remove: [...prefs.remove.filter((value) => value !== id), ...(keep ? [] : [id])],
    };
    try { localStorage.setItem(favoritesStorageKey, JSON.stringify(sessionPreferences)); } catch { /* Session preference remains usable. */ }
    signature = "";
    schedule();
  }

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
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = current.getBoundingClientRect();
      openMenu(rect.left, rect.top, current);
    } else if (event.key === "ArrowLeft") {
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

  function closeSubmenu() {
    submenu?.remove();
    submenu = null;
  }

  function closeMenu(returnFocus = false) {
    const owner = menuOwner;
    closeSubmenu();
    menu?.remove();
    menu = null;
    menuOwner = null;
    owner?.classList?.remove("is-dock-menu-owner");
    document.removeEventListener("pointerdown", onOutsidePointer, true);
    document.removeEventListener("keydown", onMenuKeydown, true);
    if (returnFocus && owner?.isConnected) owner.focus({ preventScroll: true });
  }

  function onOutsidePointer(event) {
    if (menu && !menu.contains(event.target) && !submenu?.contains(event.target)) closeMenu();
  }

  function onMenuKeydown(event) {
    if (!menu || event.isComposing) return;
    const inSubmenu = !!submenu?.contains(document.activeElement);
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      event.stopPropagation();
      if (inSubmenu && event.key === "Escape") { closeSubmenu(); menu.querySelector(".has-submenu")?.focus(); return; }
      closeMenu(true);
      return;
    }
    if (event.key === "ArrowLeft" && inSubmenu) {
      event.preventDefault(); event.stopPropagation();
      closeSubmenu(); menu.querySelector(".has-submenu")?.focus();
      return;
    }
    if (event.key === "ArrowRight" && document.activeElement?.classList?.contains("has-submenu")) {
      event.preventDefault(); event.stopPropagation();
      document.activeElement.click();
      return;
    }
    const surface = inSubmenu ? submenu : menu;
    const items = Array.from(surface.querySelectorAll(":scope > button"));
    const index = items.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }

  // Which Dock menu an era draws, from its own captures
  // (internal/evidence/drafts/dock-reference/dock-menus): 10.2's lists the
  // windows, then Keep In Dock and Quit (Aqua HIG 2002, fig. 3-2; Tiger has no
  // capture and follows its parent); 10.6 marks the current window ✓ and a
  // minimized one ◆ and gathers Keep in Dock under Options, then Hide and
  // Quit; from 10.7 to 26 the menu adds Show All Windows above Hide. Open at
  // Login and Show in Finder have nothing behind them on this desk, so they
  // are left out rather than drawn as switches that do nothing.
  function dockMenuModel() {
    const theme = currentThemeId();
    if (theme === "aqua" || theme === "tiger") return "flat";
    if (theme === "snow-leopard") return "options";
    return "show-all";
  }

  function menuItem(surface, label, run, { mark = "", submenu: opensSubmenu = false } = {}) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.textContent = label;
    item.style.whiteSpace = "normal";
    item.style.overflowWrap = "anywhere";
    if (mark) {
      item.classList.add("is-checked");
      if (mark !== "✓") item.style.setProperty("--menu-check-content", JSON.stringify(mark));
    }
    if (opensSubmenu) {
      item.classList.add("has-submenu");
      item.setAttribute("aria-haspopup", "menu");
      item.setAttribute("aria-expanded", "false");
      item.addEventListener("click", () => run(item));
      item.addEventListener("pointerenter", () => run(item));
    } else {
      item.addEventListener("click", () => { closeMenu(true); run(); });
      item.addEventListener("pointerenter", () => { if (surface === menu) closeSubmenu(); });
    }
    surface.append(item);
    return item;
  }

  function menuSeparator(surface) {
    if (!surface.lastElementChild || surface.lastElementChild.tagName === "HR") return;
    const rule = document.createElement("hr");
    rule.setAttribute("role", "separator");
    surface.append(rule);
  }

  function openOptions(appId, trigger) {
    if (submenu) return;
    submenu = document.createElement("div");
    submenu.className = "menu-popover desk-dock-menu desk-dock-submenu";
    submenu.setAttribute("role", "menu");
    submenu.setAttribute("aria-label", t("dock_options"));
    const keep = kept(appId);
    menuItem(submenu, t("dock_keep"), () => setKept(appId, !keep), { mark: keep ? "✓" : "" });
    Object.assign(submenu.style, { display: "block", position: "fixed", zIndex: "var(--z-system-menu)" });
    document.body.append(submenu);
    trigger.setAttribute("aria-expanded", "true");
    const at = trigger.getBoundingClientRect();
    const rect = submenu.getBoundingClientRect();
    const left = at.right + rect.width + 4 <= window.innerWidth ? at.right - 2 : at.left - rect.width + 2;
    submenu.style.setProperty("--desk-dock-submenu-left", `${Math.max(8, left)}px`);
    submenu.style.setProperty("--desk-dock-submenu-top", `${Math.max(30, Math.min(at.top - 4, window.innerHeight - rect.height - 8))}px`);
    if (trigger === document.activeElement) submenu.querySelector("button")?.focus();
  }

  function openMenu(clientX, clientY, owner = null) {
    closeMenu();
    menuOwner = owner || document.activeElement;
    menu = document.createElement("div");
    menu.className = "menu-popover desk-dock-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", owner?.getAttribute("aria-label") || t("dock"));
    const add = (label, run, options) => menuItem(menu, label, run, options);
    const appId = owner?.dataset.appId;
    const model = dockMenuModel();
    if (appId && !owner.dataset.miniwindow) {
      // The application's windows first: the current one ticked, a minimized
      // one marked with the diamond, any other put-away state named.
      applicationWindowOrder(appId).forEach((win) => {
        const state = applicationWindowPresentation(win);
        const mark = state === "minimized" && model !== "flat" ? "◆"
          : win.classList.contains("is-active") && model !== "flat" ? "✓" : "";
        const title = state === "minimized" && model !== "flat"
          ? applicationWindowTitle(win)
          : applicationWindowTitle(win, { markState: true });
        add(title, () => restoreApplicationWindow(win), { mark });
      });
      const running = runningIds().has(appId);
      const quittable = running && !nonQuittableAppIds.has(appId);
      if (appId !== "finder") {
        menuSeparator(menu);
        if (model === "flat") {
          const keep = kept(appId);
          add(t(keep ? "dock_remove" : "dock_keep"), () => setKept(appId, !keep));
        } else {
          add(t("dock_options"), (trigger) => openOptions(appId, trigger), { submenu: true });
        }
      }
      if (model !== "flat" && running) {
        menuSeparator(menu);
        if (model === "show-all") {
          add(t("dock_show_all_windows"), () => showAllWindows(appId, owner));
        }
        if (appId !== "finder") {
          const hidden = hiddenAppIds.has(appId);
          add(t(hidden ? "dock_show_app" : "dock_hide_app"), () => hidden ? unhideApp(appId) : hideApp(appId));
        }
      }
      if (quittable) {
        if (model === "flat") menuSeparator(menu);
        add(t("dock_quit"), () => { if (typeof quitApp === "function") quitApp(appId); });
      }
    } else {
      add(t("hide_dock"), () => window.AISystem6WindowMinimize?.setDockVisible?.(false));
    }
    if (menu.lastElementChild?.tagName === "HR") menu.lastElementChild.remove();
    if (!menu.children.length) { closeMenu(); return; }
    Object.assign(menu.style, { display: "block", position: "fixed", zIndex: "var(--z-system-menu)", maxWidth: "calc(100vw - 16px)", maxHeight: "calc(100dvh - 48px)" });
    document.body.append(menu);
    // Scroll only a menu taller than the screen; otherwise the pointer wedge
    // below it would be clipped away.
    menu.classList.toggle("is-scrolling", menu.scrollHeight > menu.clientHeight + 1);
    const rect = menu.getBoundingClientRect();
    // Above the icon, centred on it, with the pointer at the icon (every
    // capture from 10.2 to 26); the name plate steps aside while it is open.
    const at = owner?.getBoundingClientRect?.();
    const centre = at && at.width ? at.left + at.width / 2 : clientX;
    const left = Math.max(8, Math.min(centre - rect.width / 2, window.innerWidth - rect.width - 8));
    const top = at && at.height ? at.top - rect.height - 12 : clientY - rect.height;
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(30, Math.min(top, window.innerHeight - rect.height - 8))}px`;
    if (at && at.width) {
      menu.classList.add("has-dock-pointer");
      menu.style.setProperty("--desk-dock-menu-pointer-x", `${Math.round(centre - left)}px`);
    }
    owner?.classList?.add("is-dock-menu-owner");
    menu.querySelector("button")?.focus();
    document.addEventListener("pointerdown", onOutsidePointer, true);
    document.addEventListener("keydown", onMenuKeydown, true);
  }

  // Show All Windows: the application's windows as cards that stay until one
  // is chosen or the panel is dismissed (the explicit form of the Dock hover).
  async function showAllWindows(appId, owner) {
    try {
      await ensureLazySystemModule("app/features/window-browse.js", "AISystem6WindowBrowseLoaded");
      window.AISystem6WindowBrowse?.open?.({ appId, cards: true, anchor: owner, returnFocus: owner });
    } catch (error) { /* The Window menu's All Windows list remains. */ }
  }

  function onContextmenu(event) {
    if (!root) return;
    event.preventDefault();
    openMenu(event.clientX || 0, event.clientY || 0, event.target.closest?.(".desk-dock-item"));
  }

  // ---- Reserve -----------------------------------------------------------

  function release() {
    if (root?.contains(document.activeElement) && typeof hideBalloonHelp === "function") hideBalloonHelp();
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

  // Snow Leopard's and Lion's separator is a crossing of eight pale dashes
  // painted on the glass shelf, which is a plane seen in perspective; so the
  // dashes are drawn by projecting that plane rather than by hand. A strip of
  // fixed width with dashes at an even pitch, seen from above the shelf, puts
  // each point at screen depth k/z and gives it width w/z: the dashes widen,
  // thicken and spread apart toward the front, and each is a trapezoid, its
  // front edge wider than its back. The column does not lean (the captures
  // centre every dash on one line). Measured from the captures in
  // internal/evidence/drafts/theme-lab-fidelity-cache/dock/crops:
  //   Lion (HIG 2011 p.160, 48px icons, our size): dashes start 3, 5, 7, 10,
  //     14, 18, 23, 30 rows below the back edge, 1-1-2-2-2-2-3-4 tall, 8 to 16
  //     wide; front-to-back height ratio 4 = the width ratio 2 squared, which
  //     is what the projection predicts.
  //   Snow Leopard (sl-fin-1440, 64px icons): 2 to 5 tall, 10 to 22 wide,
  //     ratio 2.2; scaled to our 48px icon it is 16.5 wide at the front.
  // Rows are whole pixels, as in the captures; the ends keep their slant.
  const PERSPECTIVE_DIVIDERS = {
    lion: { depthRatio: 2, frontWidth: 16 },
    "snow-leopard": { depthRatio: 2.2, frontWidth: 16.5 },
  };

  function perspectiveDivider(theme) {
    const era = PERSPECTIVE_DIVIDERS[theme];
    if (!era || !root) return "";
    const depth = parseFloat(getComputedStyle(root).getPropertyValue("--desk-dock-shelf-depth")) || 40;
    const width = 18;
    const back = 3; // first dash below the shelf's back edge
    const front = 7; // last dash above the box's foot: 4 above the front line, and its 3px band
    const span = depth - back - front;
    const dashes = 8;
    // The share of each pitch a dash covers on the shelf, and the pitch that
    // lands the last dash on the front of the span: fitted to the Lion capture,
    // the model's 16 rows (8 starts, 8 heights) are off by 3 pixels in all.
    const duty = 0.53;
    const { depthRatio: far, frontWidth } = era;
    const k = span / (1 - 1 / far); // screen rows per unit of 1/z
    const rowAt = (z) => back + k * (1 / z - 1 / far);
    const widthAt = (z) => frontWidth / z;
    const pitch = (far - 1) / (dashes - (1 - duty));
    const centre = width / 2;
    const shapes = [];
    for (let index = 0; index < dashes; index += 1) {
      const zBack = far - index * pitch;
      const zFront = zBack - duty * pitch;
      const top = Math.round(rowAt(zBack));
      const bottom = Math.max(top + 1, Math.round(rowAt(zFront)));
      const topHalf = widthAt(zBack) / 2;
      const bottomHalf = widthAt(zFront) / 2;
      const points = [
        [centre - topHalf, top], [centre + topHalf, top],
        [centre + bottomHalf, bottom], [centre - bottomHalf, bottom],
      ].map(([x, y]) => `${x.toFixed(2)},${y}`).join(" ");
      shapes.push(`<polygon points='${points}'/>`);
    }
    // About 30 levels above the glass (Lion: dashes 150-175 over a shelf of
    // 115-130); the separator element's own 0.8 opacity is part of that.
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${depth}' viewBox='0 0 ${width} ${depth}'><g fill='rgb(250,250,255)' fill-opacity='0.45'>${shapes.join("")}</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat`;
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
      readOrder(), preferences(),
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
    if (root) {
      root.setAttribute("aria-label", t("dock"));
      root.querySelector('[role="toolbar"]')?.setAttribute("aria-label", t("dock"));
    }

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
    magCentres = null;
    clearMagnification();

    // Roving tabindex: the toolbar is a single Tab stop, so exactly one cell
    // carries tabindex 0 and the rest -1.
    const all = cells();
    if (!all.length) return;
    const restored = focusedKey ? all.find((cell) => cell.dataset.dockKey === focusedKey) : null;
    const target = restored || all[0];
    all.forEach((cell) => { cell.tabIndex = cell === target ? 0 : -1; });
    if (focusedKey) target.focus({ preventScroll: true });

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

  window.addEventListener("storage", (event) => {
    if (event.key === favoritesStorageKey || event.key === orderStorageKey) {
      sessionPreferences = null; signature = ""; schedule();
    }
  });
  document.addEventListener("ai-system6-themechange", () => { closeMenu(); schedule(); });
  document.addEventListener("ai-system6-dockchange", schedule);
  window.addEventListener("resize", () => { magCentres = null; schedule(); });
  window.visualViewport?.addEventListener?.("resize", schedule);

  window.AISystem6DeskDock = Object.freeze({ sync: schedule, moveBefore });
  window.AISystem6DeskDockLoaded = true;
  // Once on arrival: the module is loaded *by* a theme change, so the event
  // that asked for it is already over by the time this listener exists.
  sync();
})();
