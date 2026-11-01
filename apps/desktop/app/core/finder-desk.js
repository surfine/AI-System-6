// Spatial desktop layer (lazy): system icon positions, desktop clean up, clamp.
//
// Positions of the system icons (Startup Disk, File Floppy, project disks,
// Trash, the app icons) are a machine preference in localStorage, never desk
// data. With none stored the .icon-column keeps today's flex column exactly.
// Once one exists (and the device is not a phone) the column becomes a
// full-desktop layer, .is-spatial, whose icons sit at --x/--y: stored ones where
// the writer put them, the rest where the right-edge column would have them.
// A shrunk viewport clamps what is drawn and never rewrites what is stored.
(function () {
  const STORAGE_KEY = "ais6.desktop.systemIconPositions";
  let lastSignature = "";
  let frame = 0;

  function space() {
    return window.AISystem6FinderSpace || null;
  }

  function readPositions() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function writePositions(map) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      return true;
    } catch {
      return false;
    }
  }

  function iconKey(el) {
    if (el.dataset.finderKey) return el.dataset.finderKey;
    const id = el.id;
    const open = el.dataset.open;
    const action = el.dataset.action;
    if ((id === "active-project-drop-target" || el.dataset.ejectedProjectId) && el.dataset.projectId) {
      return `project:${el.dataset.projectId}`;
    }
    if (id === "desktop-file-floppy-starter") return "file-floppy";
    if (id === "finder-writing-studio-toggle") return "writing-studio";
    if (id === "mounted-text-disk") return "text-disk";
    if (id === "desktop-project-cd") return "project-cd";
    if (id === "active-project-drop-target") return "project-disk";
    if (open === "disk") return "startup-disk";
    if (open === "assistant") return "cliotalk";
    if (open === "applications") return "applications";
    if (open === "trash") return "trash";
    if (action === "open-quick-draft") return "quick-draft";
    if (action === "open-lightroom") return "lightroom";
    return id || open || action || "";
  }

  function column() {
    return document.querySelector(".icon-column");
  }

  function visibleIcons(col) {
    return [...col.children].filter((el) => el.classList?.contains("desktop-icon")
      && !el.hidden
      && !el.classList.contains("is-hidden")
      && el.getClientRects().length > 0);
  }

  function era() {
    return typeof getCurrentTheme === "function" ? getCurrentTheme() : "classic";
  }

  function gridOf(icons) {
    const grid = space().gridFor(era(), {});
    const width = Math.max(0, ...icons.map((el) => el.offsetWidth));
    const height = Math.max(0, ...icons.map((el) => el.offsetHeight));
    return { ...grid, cellW: Math.max(grid.cellW, width), cellH: Math.max(grid.cellH, height + 4) };
  }

  function boundsOf(desktop) {
    const dock = typeof deskDockReserve === "function" ? deskDockReserve() : 0;
    return { x: 0, y: 0, width: desktop.clientWidth, height: Math.max(0, desktop.clientHeight - dock) };
  }

  // Phones auto-arrange only, and a responsive shell that lays the column out
  // as a static row (60-responsive.css) owns it: stored places are kept, not
  // applied.
  function isSpatialAllowed(col) {
    if (typeof isPhoneFinderViewport === "function" && isPhoneFinderViewport()) return false;
    return !col || getComputedStyle(col).position !== "static";
  }

  function clearSpatial(col) {
    col.classList.remove("is-spatial");
    [...col.children].forEach((el) => {
      el.style?.removeProperty("--x");
      el.style?.removeProperty("--y");
    });
  }

  // Desktop objects: files and folders of the MOUNTED project whose record
  // carries placement.desktop. They keep their folder; ejecting or switching the
  // disk takes them off the desk and remounting brings them back where they were.
  function desktopRecords() {
    const mounted = typeof isProjectMounted !== "undefined" && isProjectMounted && typeof activeProjectId !== "undefined" && activeProjectId;
    if (!mounted) return [];
    const own = (record) => record.projectId === activeProjectId && record.placement?.desktop;
    return [
      ...(typeof chatFolders !== "undefined" ? chatFolders : []).filter(own).map((record) => ({ type: "folder", record })),
      ...(typeof chatFiles !== "undefined" ? chatFiles : []).filter(own).map((record) => ({ type: "file", record })),
    ];
  }

  function objectContent(type, record) {
    const item = type === "folder"
      ? (typeof getProjectFolderFinderItem === "function" ? getProjectFolderFinderItem(record) : { ...record, iconId: "folder" })
      : (typeof getProjectFileFinderItem === "function" ? getProjectFileFinderItem(record) : { ...record, iconId: "document" });
    const name = typeof getFinderItemName === "function" ? getFinderItemName(item) : record.name;
    const icon = typeof renderSystemIcon === "function"
      ? renderSystemIcon(item.iconId || item.iconClass || type, { size: "desktop" })
      : '<span class="sys-icon sys-icon-desktop" aria-hidden="true"></span>';
    const label = document.createElement("span");
    label.textContent = name;
    return { html: `${icon}${label.outerHTML}`, name };
  }

  function renderDesktopObjects(col) {
    const wanted = desktopRecords();
    const drawn = new Map([...col.querySelectorAll(".desktop-object")].map((el) => [el.dataset.finderKey, el]));
    const anchor = col.querySelector('.desktop-icon[data-open="trash"]');
    wanted.forEach(({ type, record }) => {
      const key = `${type}:${record.id}`;
      let el = drawn.get(key);
      drawn.delete(key);
      if (!el) {
        el = document.createElement("button");
        el.type = "button";
        el.className = "desktop-icon desktop-object";
        el.dataset.finderKey = key;
        el.dataset.dragType = type === "folder" ? "document-folder" : "file";
        el.dataset.id = record.id;
        if (type === "folder") {
          el.dataset.dropTarget = "document-folder";
          el.dataset.folderId = record.id;
          el.dataset.action = "open-desktop-folder";
        } else {
          el.dataset.action = `open-chat-file:${record.id}`;
        }
        if (anchor) anchor.before(el);
        else col.append(el);
      }
      el.dataset.projectId = record.projectId;
      const content = objectContent(type, record);
      if (el.finderContent !== content.html) {
        el.finderContent = content.html;
        el.innerHTML = content.html;
        el.setAttribute("title", content.name);
      }
    });
    drawn.forEach((el) => el.remove());
    return wanted.length;
  }

  function objectPoint(el) {
    if (!el.classList.contains("desktop-object")) return null;
    const records = el.dataset.dragType === "file" ? chatFiles : chatFolders;
    return records.find((record) => record.id === el.dataset.id)?.placement?.desktop || null;
  }

  function sync() {
    const col = column();
    const desktop = col?.closest(".desktop");
    if (!col || !desktop) return false;
    const objects = renderDesktopObjects(col);
    const stored = readPositions();
    if ((!Object.keys(stored).length && !objects) || !isSpatialAllowed(col)) {
      if (col.classList.contains("is-spatial")) clearSpatial(col);
      lastSignature = "";
      return false;
    }
    if (!space()) {
      ensureFinderSpaceModule().then(sync).catch(() => {});
      return false;
    }
    const icons = visibleIcons(col);
    const keys = icons.map(iconKey);
    const signature = [desktop.clientWidth, desktop.clientHeight, era(), keys.join(","), JSON.stringify(stored), typeof finderPlacementVersion === "number" ? finderPlacementVersion : 0].join("|");
    if (signature === lastSignature && col.classList.contains("is-spatial")) return true;
    lastSignature = signature;
    col.classList.add("is-spatial");
    const grid = gridOf(icons);
    const bounds = boundsOf(desktop);
    const auto = space().autoArrange(keys.map((key) => ({ key })), bounds, grid, { anchor: "right-column", pinLastKey: "trash" });
    icons.forEach((el, index) => {
      const key = keys[index];
      const point = objectPoint(el) || stored[key] || auto[key] || { x: 0, y: 0 };
      const shown = space().clampIntoView(point, { width: el.offsetWidth, height: el.offsetHeight }, bounds);
      el.style.setProperty("--x", `${Math.round(shown.x)}px`);
      el.style.setProperty("--y", `${Math.round(shown.y)}px`);
    });
    return true;
  }

  function scheduleSync() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  }

  function snapPoint(point) {
    const col = column();
    return col && space() ? space().snap(point, gridOf(visibleIcons(col))) : point;
  }

  // entries: [{ el, x, y }] in desktop-layer px, from the pointer engine.
  // Desktop objects are Finder records: their places go through finder-ops.
  function placeIcons(entries, options = {}) {
    const objects = entries.filter(({ el }) => el.dataset.finderKey);
    if (objects.length) {
      const positions = Object.fromEntries(objects.map(({ el, x, y }) => [el.dataset.finderKey, { x, y }]));
      ensureFinderOpsModule()
        .then(() => window.AISystem6FinderOps.place({ source: "desk" }, { positions }, options.snap ? { metaKey: true } : {}))
        .catch((error) => console.warn("Finder operations failed to load.", error));
      entries = entries.filter(({ el }) => !el.dataset.finderKey);
      if (!entries.length) return true;
    }
    const col = column();
    const stored = readPositions();
    const grid = col && space() ? gridOf(visibleIcons(col)) : null;
    entries.forEach(({ el, x, y }) => {
      const key = iconKey(el);
      if (!key) return;
      let point = { x: Math.round(x), y: Math.round(y) };
      if (options.snap && grid) point = space().snap(point, grid);
      stored[key] = point;
    });
    const ok = writePositions(stored);
    lastSignature = "";
    sync();
    return ok;
  }

  function placeSystemIcon(key, point) {
    if (!key || !point) return false;
    const stored = readPositions();
    stored[key] = { x: Math.round(point.x), y: Math.round(point.y) };
    const ok = writePositions(stored);
    lastSignature = "";
    sync();
    return ok;
  }

  // Special > Clean Up Desktop / Selection; Option arranges by name.
  async function cleanUpDesktop(options = {}) {
    if (!space()) await ensureFinderSpaceModule();
    const col = column();
    const desktop = col?.closest(".desktop");
    if (!col || !desktop || !isSpatialAllowed(col)) return false;
    const icons = visibleIcons(col);
    const deskRect = desktop.getBoundingClientRect();
    const items = icons.map((el) => {
      const rect = el.getBoundingClientRect();
      return { key: iconKey(el), x: rect.left - deskRect.left, y: rect.top - deskRect.top, name: el.lastElementChild?.textContent || "" };
    });
    const grid = gridOf(icons);
    const bounds = boundsOf(desktop);
    const moved = options.byName
      ? space().cleanUpByName(items, grid, bounds, document.documentElement.lang || undefined)
      : space().cleanUp(items, grid, bounds, { selectionKeys: options.selectionKeys || undefined });
    // Desktop objects are records: their cleaned places go through finder-ops,
    // already on the grid. System icons stay a machine preference.
    const objectPositions = Object.fromEntries(Object.entries(moved).filter(([key]) => /^(file|folder):/.test(key)));
    if (Object.keys(objectPositions).length) {
      ensureFinderOpsModule()
        .then(() => window.AISystem6FinderOps.place({ source: "clean-up" }, { positions: objectPositions }, { era: "classic" }))
        .catch((error) => console.warn("Finder operations failed to load.", error));
    }
    const stored = readPositions();
    Object.entries(moved).forEach(([key, point]) => {
      if (!objectPositions[key]) stored[key] = point;
    });
    const ok = writePositions(stored);
    lastSignature = "";
    sync();
    return ok;
  }

  // The union of the icons on the right half of the desk: that is the band a
  // zoomed or new window keeps clear of, as it did for the column. An icon the
  // writer moved to the far left does not push every window off the desk.
  function iconsRect() {
    const col = column();
    const desktop = col?.closest(".desktop")?.getBoundingClientRect();
    if (!col || !desktop) return null;
    const middle = desktop.left + desktop.width / 2;
    const rects = visibleIcons(col).map((el) => el.getBoundingClientRect()).filter((rect) => rect.left >= middle);
    if (!rects.length) return null;
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top };
  }

  window.addEventListener("resize", scheduleSync);
  window.addEventListener("ais6:finder-changed", scheduleSync);
  const col = column();
  if (col && typeof MutationObserver === "function") {
    // Icons appear and disappear with the profile, the File Floppy and Project
    // CD; the signature keeps a selection change from re-laying anything.
    new MutationObserver(scheduleSync).observe(col, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });
  }

  // A desktop folder opens in the Project Disk window, like its own folder.
  window.AISystem6Runtime?.registerCommand?.("open-desktop-folder", {
    handler: () => {
      const folderId = typeof selectedDesktopIconEl !== "undefined" ? selectedDesktopIconEl?.dataset.folderId : "";
      if (!folderId || typeof openProjectFinderFolder !== "function") return;
      Promise.resolve(openWindow("projects")).then(() => openProjectFinderFolder(folderId));
    },
    isAvailable: () => true,
  });

  window.AISystem6FinderDesk = {
    sync,
    snapPoint,
    iconKey,
    iconsRect,
    placeIcons,
    placeSystemIcon,
    cleanUpDesktop,
    readPositions,
  };
  window.AISystem6FinderDeskLoaded = true;
  ensureFinderSpaceModule().then(sync).catch(() => {});
})();
