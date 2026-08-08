// Feature module: project-disk.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



const finderViewModeOrder = ["small-icon", "icon", "name", "date", "size", "kind"];
const teachTextImageAttachmentLimit = 48;

// Every TDI surface shares one adaptive document model: a vertical side rail
// in wide windows and a compact document-stack menu in existing window chrome
// when space is constrained. CSS @container queries choose the presentation;
// state, switching, closing, and reordering remain identical.

function getReaderTabSite(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function documentTabNow() {
  return new Date().toISOString();
}

function createDocumentTabRecord(app, role, options = {}) {
  const now = documentTabNow();
  return {
    id: options.id || crypto.randomUUID(),
    app,
    role,
    title: options.title || t(app === "teachText" && role === "manuscript" ? "document_role_manuscript" : "untitled"),
    backing: options.backing || {},
    state: options.state || {},
    createdAt: options.createdAt || now,
    updatedAt: options.updatedAt || now,
    order: Number.isFinite(Number(options.order)) ? Number(options.order) : 0,
  };
}

function normalizeDocumentTabRecord(tab, index = 0) {
  if (!tab || typeof tab !== "object") return null;
  const app = ["reader", "teachText", "docMap", "timeMachine"].includes(tab.app) ? tab.app : "reader";
  const fallbackRole = app === "teachText" ? "scratch_file" : app === "docMap" ? "docmap" : app === "timeMachine" ? "web_navigation" : "source_view";
  const validRoles = ["source_view", "export_preview", "manuscript", "scratch_file", "docmap", "web_navigation"];
  return {
    ...createDocumentTabRecord(app, validRoles.includes(tab.role) ? tab.role : fallbackRole, {
      ...tab,
      order: Number.isFinite(Number(tab.order)) ? Number(tab.order) : index,
    }),
    backing: tab.backing && typeof tab.backing === "object" ? tab.backing : {},
    state: tab.state && typeof tab.state === "object" ? tab.state : {},
  };
}

function activeDocumentTabIdsFallback(project) {
  return {
    reader: null,
    teachText: null,
    docMap: null,
    timeMachine: null,
    ...(project?.activeDocumentTabIds || {}),
  };
}

function ensureProjectDocumentTabs(project) {
  if (!project) return [];
  let changed = false;
  const existing = Array.isArray(project.documentTabs) ? project.documentTabs : [];
  const tabs = existing.map(normalizeDocumentTabRecord).filter(Boolean);

  if (!tabs.some((tab) => tab.app === "teachText" && tab.role === "manuscript")) {
    tabs.push(createDocumentTabRecord("teachText", "manuscript", {
      title: t("document_role_manuscript"),
      backing: { type: "manuscript" },
      order: tabs.length,
    }));
    changed = true;
  }

  project.documentTabs = tabs.map((tab, index) => ({ ...tab, order: index }));
  project.activeDocumentTabIds = activeDocumentTabIdsFallback(project);
  ["reader", "teachText", "docMap", "timeMachine"].forEach((app) => {
    const activeId = project.activeDocumentTabIds[app];
    if (!project.documentTabs.some((tab) => tab.app === app && tab.id === activeId)) {
      project.activeDocumentTabIds[app] = project.documentTabs.find((tab) => tab.app === app)?.id || null;
      changed = true;
    }
  });
  return project.documentTabs;
}

function getDocumentTabs(app = "", project = getActiveProject()) {
  const tabs = ensureProjectDocumentTabs(project);
  return app ? tabs.filter((tab) => tab.app === app).sort((a, b) => (a.order || 0) - (b.order || 0)) : tabs;
}

function getActiveDocumentTab(app, project = getActiveProject()) {
  if (!project) return null;
  const id = ensureProjectDocumentTabs(project) && project.activeDocumentTabIds?.[app];
  return getDocumentTabs(app, project).find((tab) => tab.id === id) || null;
}

function setActiveDocumentTab(app, tabId, project = getActiveProject()) {
  if (!project) return null;
  const tab = getDocumentTabs(app, project).find((item) => item.id === tabId) || null;
  project.activeDocumentTabIds = activeDocumentTabIdsFallback(project);
  project.activeDocumentTabIds[app] = tab?.id || null;
  project.updatedAt = documentTabNow();
  return tab;
}

function upsertDocumentTab(app, role, options = {}, project = getActiveProject()) {
  if (!project) return null;
  const tabs = ensureProjectDocumentTabs(project);
  const backing = options.backing || {};
  let tab = options.id ? tabs.find((item) => item.id === options.id) : null;
  if (!tab && backing.type && options.forceNew !== true) {
    tab = tabs.find((item) => item.app === app && item.role === role && item.backing?.type === backing.type
      && (backing.id ? item.backing?.id === backing.id : true)
      && (backing.fileName ? item.backing?.fileName === backing.fileName : true)
      && (backing.url ? item.backing?.url === backing.url : true));
  }
  if (tab) {
    tab.title = options.title || tab.title;
    tab.backing = { ...(tab.backing || {}), ...backing };
    tab.state = { ...(tab.state || {}), ...(options.state || {}) };
    tab.updatedAt = documentTabNow();
  } else {
    tab = createDocumentTabRecord(app, role, { ...options, order: tabs.length });
    tabs.push(tab);
  }
  setActiveDocumentTab(app, tab.id, project);
  return tab;
}

function removeDocumentTab(app, tabId, project = getActiveProject()) {
  if (!project || !tabId) return null;
  const tabs = getDocumentTabs(app, project);
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return null;
  const removed = tabs[index];
  const wasActive = project.activeDocumentTabIds?.[app] === removed.id;
  project.documentTabs = (project.documentTabs || []).filter((tab) => tab.id !== removed.id);
  const remaining = getDocumentTabs(app, project);
  const next = remaining[Math.max(0, index - 1)] || remaining[0] || null;
  project.activeDocumentTabIds = activeDocumentTabIdsFallback(project);
  if (wasActive) project.activeDocumentTabIds[app] = next?.id || null;
  project.updatedAt = documentTabNow();
  return { removed, index, remaining, next, wasActive };
}

function moveDocumentTab(app, tabId, targetTabId, project = getActiveProject()) {
  if (!project || !tabId || !targetTabId || tabId === targetTabId) return false;
  const appTabs = getDocumentTabs(app, project);
  const fromIndex = appTabs.findIndex((tab) => tab.id === tabId);
  const toIndex = appTabs.findIndex((tab) => tab.id === targetTabId);
  if (fromIndex < 0 || toIndex < 0) return false;
  const [moving] = appTabs.splice(fromIndex, 1);
  appTabs.splice(toIndex, 0, moving);
  const otherTabs = ensureProjectDocumentTabs(project).filter((tab) => tab.app !== app);
  project.documentTabs = [...otherTabs, ...appTabs].map((tab, index) => ({ ...tab, order: index }));
  project.updatedAt = documentTabNow();
  return true;
}

let tdiDocumentStackDismissalReady = false;

function ensureTdiDocumentStackDismissal() {
  if (tdiDocumentStackDismissalReady) return;
  tdiDocumentStackDismissalReady = true;
  document.addEventListener("pointerdown", (event) => {
    document.querySelectorAll(".tdi-document-stack[open]").forEach((details) => {
      if (!details.contains(event.target)) details.removeAttribute("open");
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".tdi-document-stack[open]").forEach((details) => {
      details.removeAttribute("open");
      details.querySelector("summary")?.focus();
    });
  });
}

function tdiDocumentStackHost(container) {
  if (!container?.id) return null;
  return [...document.querySelectorAll(".tdi-stack-host")]
    .find((host) => host.dataset.tdiStackFor === container.id) || null;
}

function renderTdiDocumentStack(container, tabs, options = {}) {
  const host = tdiDocumentStackHost(container);
  if (!host) return;
  const visibleTabs = Array.isArray(tabs) ? tabs : [];
  const {
    activeId = "",
    labelFor = (tab) => tab.title || t("untitled"),
    compactLabelFor = labelFor,
    sublabelFor = () => "",
    dirtyFor = () => false,
    closableFor = () => true,
    onOpen = () => {},
    onClose = () => {},
    onMove = null,
  } = options;
  const shouldHide = !visibleTabs.length;
  host.classList.toggle("is-hidden", shouldHide);
  host.replaceChildren();
  if (shouldHide || !visibleTabs.length) return;

  const activeTab = visibleTabs.find((tab) => tab.id === activeId) || visibleTabs[0];
  const activeIndex = Math.max(0, visibleTabs.indexOf(activeTab));
  const activeCopy = document.createElement("span");
  activeCopy.className = "tdi-stack-active-copy";
  activeCopy.textContent = `${dirtyFor(activeTab) ? "• " : ""}${compactLabelFor(activeTab, activeIndex)}`;

  // With one document there is nothing to switch. Keep its identity visible
  // in compact chrome, but do not imply a menu, count, or disclosure action.
  if (visibleTabs.length === 1) {
    const current = document.createElement("div");
    current.className = "tdi-document-stack";
    const currentLabel = document.createElement("span");
    currentLabel.className = "tdi-stack-summary tdi-stack-single";
    currentLabel.title = labelFor(activeTab, activeIndex);
    currentLabel.setAttribute("aria-label", labelFor(activeTab, activeIndex));
    currentLabel.setAttribute("aria-current", "page");
    currentLabel.append(activeCopy);
    current.append(currentLabel);
    host.append(current);
    return;
  }

  ensureTdiDocumentStackDismissal();
  const details = document.createElement("details");
  details.className = "tdi-document-stack";
  const summary = document.createElement("summary");
  summary.className = "btn tdi-stack-summary";
  summary.setAttribute("aria-haspopup", "menu");
  summary.setAttribute("aria-expanded", "false");
  summary.title = `${labelFor(activeTab, activeIndex)} · ${visibleTabs.length} ${t("documents")}`;
  summary.setAttribute("aria-label", `${t("documents")}: ${labelFor(activeTab, activeIndex)}`);
  summary.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    details.open = true;
    const choices = [...popover.querySelectorAll(".tdi-stack-open")];
    const target = ["ArrowUp", "End"].includes(event.key) ? choices.at(-1) : choices[0];
    requestAnimationFrame(() => target?.focus());
  });

  const count = document.createElement("span");
  count.className = "tdi-stack-count";
  count.textContent = String(visibleTabs.length);
  const disclosure = document.createElement("span");
  disclosure.className = "tdi-stack-disclosure";
  disclosure.setAttribute("aria-hidden", "true");
  summary.append(activeCopy, count, disclosure);

  const popover = document.createElement("div");
  popover.className = "tdi-stack-popover";
  popover.setAttribute("role", "menu");
  popover.setAttribute("aria-label", t("documents"));
  visibleTabs.forEach((tab, index) => {
    const closable = !!closableFor(tab);
    const item = document.createElement("div");
    item.className = "tdi-stack-item";
    item.classList.toggle("is-active", tab.id === activeId);
    item.classList.toggle("is-dirty", dirtyFor(tab));
    item.dataset.documentTabId = tab.id;

    const open = document.createElement("button");
    open.type = "button";
    open.className = "tdi-stack-open";
    open.setAttribute("role", "menuitemradio");
    open.setAttribute("aria-checked", String(tab.id === activeId));
    const label = document.createElement("span");
    label.textContent = `${dirtyFor(tab) ? "• " : ""}${labelFor(tab, index)}`;
    const sublabel = document.createElement("small");
    sublabel.textContent = sublabelFor(tab, index);
    open.append(label, sublabel);
    open.addEventListener("click", () => {
      details.removeAttribute("open");
      onOpen(tab);
    });
    open.addEventListener("keydown", (event) => {
      const choices = [...popover.querySelectorAll(".tdi-stack-open")];
      const current = choices.indexOf(open);
      const target = event.key === "ArrowDown" ? choices[current + 1] || choices[0]
        : event.key === "ArrowUp" ? choices[current - 1] || choices.at(-1)
          : event.key === "Home" ? choices[0]
            : event.key === "End" ? choices.at(-1)
              : null;
      if (!target) return;
      event.preventDefault();
      target.focus();
    });

    const close = document.createElement("button");
    close.type = "button";
    close.className = "tdi-stack-close";
    close.setAttribute("aria-label", t("reader_close_tab"));
    close.title = t("reader_close_tab");
    close.disabled = !closable;
    close.classList.toggle("is-disabled", !closable);
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      if (closable) onClose(tab);
    });
    item.append(open, close);

    if (typeof onMove === "function") {
      item.draggable = true;
      item.addEventListener("dragstart", (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", tab.id);
        popover.dataset.draggingTabId = tab.id;
        item.classList.add("is-dragging");
      });
      item.addEventListener("dragend", () => {
        delete popover.dataset.draggingTabId;
        item.classList.remove("is-dragging");
        popover.querySelectorAll(".is-drop-target").forEach((entry) => entry.classList.remove("is-drop-target"));
      });
      item.addEventListener("dragover", (event) => {
        const draggingId = popover.dataset.draggingTabId;
        if (!draggingId || draggingId === tab.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        item.classList.add("is-drop-target");
      });
      item.addEventListener("dragleave", () => item.classList.remove("is-drop-target"));
      item.addEventListener("drop", (event) => {
        event.preventDefault();
        item.classList.remove("is-drop-target");
        const draggingId = event.dataTransfer.getData("text/plain") || popover.dataset.draggingTabId;
        if (draggingId && draggingId !== tab.id) onMove(draggingId, tab.id);
      });
    }
    popover.append(item);
  });
  details.addEventListener("toggle", () => {
    summary.setAttribute("aria-expanded", String(details.open));
    if (!details.open) return;
    document.querySelectorAll(".tdi-document-stack[open]").forEach((other) => {
      if (other !== details) other.removeAttribute("open");
    });
  });
  details.append(summary, popover);
  host.append(details);
}

function renderTdiTabStrip(container, tabs, options = {}) {
  if (!container) return;
  const visibleTabs = Array.isArray(tabs) ? tabs : [];
  container.replaceChildren();
  const {
    activeId = "",
    labelFor = (tab) => tab.title || t("untitled"),
    sublabelFor = () => "",
    dirtyFor = () => false,
    closableFor = () => true,
    hideWhenEmpty = true,
    onOpen = () => {},
    onClose = () => {},
    onMove = null,
  } = options;
  container.dataset.tabCount = String(visibleTabs.length);
  // A single tab needs no strip — hide it until there are at least two documents.
  container.classList.toggle("is-hidden", hideWhenEmpty && visibleTabs.length <= 1);
  container.classList.toggle("is-overflowing", visibleTabs.length > 4);
  container.classList.toggle("is-crowded", visibleTabs.length > 7);
  renderTdiDocumentStack(container, visibleTabs, options);
  if (!visibleTabs.length) return;
  visibleTabs.forEach((tab, index) => {
    const closable = !!closableFor(tab);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tdi-tab";
    button.classList.toggle("is-active", tab.id === activeId);
    button.classList.toggle("is-dirty", dirtyFor(tab));
    button.dataset.documentTabId = tab.id;
    const label = labelFor(tab, index);
    const sublabel = sublabelFor(tab, index);
    const dirtyMark = dirtyFor(tab) ? "• " : "";
    button.innerHTML = `<span>${escapeHtml(`${dirtyMark}${label}`)}</span><small>${escapeHtml(sublabel)}</small>`;
    button.addEventListener("click", () => onOpen(tab));
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tdi-tab-close";
    close.textContent = "×";
    close.setAttribute("aria-label", t("reader_close_tab"));
    close.title = t("reader_close_tab");
    close.disabled = !closable;
    close.classList.toggle("is-disabled", !closable);
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!closable) return;
      onClose(tab);
    });
    const wrap = document.createElement("div");
    wrap.className = "tdi-tab-wrap";
    wrap.classList.toggle("is-active", tab.id === activeId);
    if (typeof onMove === "function") {
      wrap.draggable = true;
      wrap.dataset.documentTabId = tab.id;
      wrap.addEventListener("dragstart", (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", tab.id);
        container.dataset.draggingTabId = tab.id;
        wrap.classList.add("is-dragging");
      });
      wrap.addEventListener("dragend", () => {
        delete container.dataset.draggingTabId;
        wrap.classList.remove("is-dragging");
        container.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
      });
      wrap.addEventListener("dragover", (event) => {
        const draggingId = container.dataset.draggingTabId;
        if (!draggingId || draggingId === tab.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        wrap.classList.add("is-drop-target");
      });
      wrap.addEventListener("dragleave", () => {
        wrap.classList.remove("is-drop-target");
      });
      wrap.addEventListener("drop", (event) => {
        event.preventDefault();
        wrap.classList.remove("is-drop-target");
        const draggingId = event.dataTransfer.getData("text/plain") || container.dataset.draggingTabId;
        if (!draggingId || draggingId === tab.id) return;
        onMove(draggingId, tab.id);
      });
    }
    wrap.append(button, close);
    container.append(wrap);
  });
}

// Drag-to-resize the vertical tab rail (TeachText / DocMap), mirroring Reader's
// split handle. Drives the per-shell --tdi-rail-width custom property; no inline
// layout styles. Idempotent — safe to call on every tab render.
function setupTdiRailResize(shell, options = {}) {
  if (!shell || shell.dataset.railResizeReady === "true") return;
  const rail = shell.querySelector(":scope > .tdi-rail");
  const grabber = shell.querySelector(":scope > .tdi-grabber");
  if (!rail || !grabber) return;
  shell.dataset.railResizeReady = "true";
  const storageKey = options.storageKey || "";
  const minRail = 140;
  const minContent = 320;

  const clampRail = (px) => {
    const total = shell.getBoundingClientRect().width;
    const max = total > 0 ? Math.max(minRail, total - minContent) : Number.POSITIVE_INFINITY;
    return Math.round(Math.min(Math.max(px, minRail), max));
  };
  const applyRail = (px, save) => {
    const value = clampRail(px);
    shell.style.setProperty("--tdi-rail-width", `${value}px`);
    grabber.setAttribute("aria-valuenow", String(value));
    if (save && storageKey) {
      try { localStorage.setItem(storageKey, String(value)); } catch { /* storage full / blocked */ }
    }
  };

  if (storageKey) {
    const saved = parseInt(localStorage.getItem(storageKey) || "", 10);
    if (Number.isFinite(saved)) shell.style.setProperty("--tdi-rail-width", `${clampRail(saved)}px`);
  }

  const isVertical = () => getComputedStyle(shell).flexDirection === "row";

  grabber.addEventListener("pointerdown", (event) => {
    if (!isVertical()) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = rail.getBoundingClientRect().width;
    grabber.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-resizing-tdi");
    const onMove = (moveEvent) => applyRail(startWidth + moveEvent.clientX - startX, true);
    const finish = () => {
      document.body.classList.remove("is-resizing-tdi");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  });

  grabber.addEventListener("keydown", (event) => {
    if (!isVertical()) return;
    const delta = { ArrowLeft: -16, ArrowRight: 16 }[event.key] || 0;
    if (!delta) return;
    event.preventDefault();
    applyRail(rail.getBoundingClientRect().width + delta, true);
  });
}

function normalizeFinderViewMode(mode) {
  return finderViewModeOrder.includes(mode) ? mode : mode === "list" ? "name" : "icon";
}

function isFinderListMode(mode) {
  return ["name", "date", "size", "kind", "list"].includes(mode);
}

function isFinderIconMode(mode) {
  return ["small-icon", "icon"].includes(normalizeFinderViewMode(mode));
}

function finderViewControlMode(mode) {
  return isFinderListMode(mode) ? "list" : "icon";
}

function getFinderViewModeLabelKey(mode) {
  const labels = {
    "small-icon": "view_by_small_icon",
    icon: "view_by_icon",
    name: "view_by_name",
    date: "view_by_date",
    size: "view_by_size",
    kind: "view_by_kind",
    list: "view_by_name",
  };
  return labels[mode] || "view_by_icon";
}

function getFinderItemName(item) {
  return item?.name || item?.title || t("untitled");
}

function getFinderItemKindLabel(item) {
  if (item?.kindLabel) return item.kindLabel;
  if (item?.kind) return item.kind;
  if (item?.type === "folder") return t("folder_kind");
  if (item?.type === "text") return t("kind_teachtext");
  if (item?.type === "chat") return t("kind_chat");
  if (item?.type === "finder-root") return t("folder_kind");
  return t("file_kind");
}

function getFinderItemModifiedAt(item) {
  return item?.modifiedAt || item?.updatedAt || item?.createdAt || "";
}

function getFinderItemSizeValue(item) {
  if (Number.isFinite(item?.sizeValue)) return item.sizeValue;
  if (Number.isFinite(item?.itemCount)) return item.itemCount;
  if (typeof item?.body === "string") return item.body.length;
  if (Array.isArray(item?.messages)) return JSON.stringify(item.messages).length;
  return 0;
}

function getFinderItemSizeLabel(item) {
  if (item?.sizeLabel) return item.sizeLabel;
  if (item?.type === "folder" || item?.type === "finder-root") return t("items_count", getFinderItemSizeValue(item));
  return `${getFinderItemSizeValue(item)} bytes`;
}

function compareFinderItemsByMode(a, b, mode) {
  const normalized = normalizeFinderViewMode(mode);
  if (normalized === "date") {
    const diff = new Date(getFinderItemModifiedAt(b) || 0) - new Date(getFinderItemModifiedAt(a) || 0);
    if (diff) return diff;
  } else if (normalized === "size") {
    const diff = getFinderItemSizeValue(b) - getFinderItemSizeValue(a);
    if (diff) return diff;
  } else if (normalized === "kind") {
    const kindCompare = getFinderItemKindLabel(a).localeCompare(getFinderItemKindLabel(b), currentLanguage);
    if (kindCompare) return kindCompare;
  } else if (normalized === "small-icon" || normalized === "icon") {
    return 0;
  }
  return getFinderItemName(a).localeCompare(getFinderItemName(b), currentLanguage, { numeric: true });
}

function sortFinderItemsForView(items, mode) {
  const normalized = normalizeFinderViewMode(mode);
  if (normalized === "small-icon" || normalized === "icon") return items;
  return [...items].sort((a, b) => compareFinderItemsByMode(a, b, normalized));
}

function setFinderViewClasses(grid, mode) {
  const normalized = normalizeFinderViewMode(mode);
  grid.classList.toggle("finder-list", isFinderListMode(normalized));
  grid.classList.toggle("finder-grid", isFinderIconMode(normalized));
  grid.classList.toggle("finder-small-icons", normalized === "small-icon");
}

function updateFinderViewButtons(win, mode) {
  const controlMode = finderViewControlMode(mode);
  win?.querySelectorAll(".view-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === controlMode);
  });
}

function isDefaultFolderName(name) {
  return ["General", "通用"].includes((name || "").trim());
}

function displayFolderName(name) {
  return isDefaultFolderName(name) ? t("default_folder") : name;
}

function preferredFolderName() {
  const folder = getSelectedFolder() || getProjectFolders()[0];
  return folder ? displayFolderName(folder.name) : t("default_folder");
}

function getSelectedFolder() {
  if (selectedFolderId === "all") return null;
  return getProjectFolders().find((folder) => folder.id === selectedFolderId) || null;
}

function getFolderPath(folderId, projectId = activeProjectId) {
  const folders = chatFolders.filter((folder) => folder.projectId === projectId);
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path = [];
  let folder = byId.get(folderId);
  const seen = new Set();

  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    path.unshift(displayFolderName(folder.name));
    folder = folder.parentId ? byId.get(folder.parentId) : null;
  }

  return path;
}

function nextAvailableFolderName(baseName, parentId = null, projectId = activeProjectId) {
  const base = (baseName || t("new_folder")).trim() || t("new_folder");
  const canonicalBase = isDefaultFolderName(base) ? "General" : base;
  const siblings = chatFolders
    .filter((folder) => folder.projectId === projectId && (folder.parentId || null) === (parentId || null))
    .map((folder) => displayFolderName(folder.name).trim().toLowerCase());

  const displayBase = displayFolderName(canonicalBase);
  if (!siblings.includes(displayBase.toLowerCase())) return canonicalBase;

  let index = 2;
  while (siblings.includes(`${displayBase} ${index}`.toLowerCase())) {
    index += 1;
  }
  return `${displayBase} ${index}`;
}

function createFinderFolder(name = t("new_folder"), parentId = selectedFolderId === "all" ? null : selectedFolderId) {
  ensureActiveProject();
  const normalizedParentId = parentId && getProjectFolders().some((folder) => folder.id === parentId) ? parentId : null;
  const folderName = nextAvailableFolderName(name, normalizedParentId);
  const now = new Date().toISOString();
  const folder = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    name: isDefaultFolderName(folderName) ? "General" : folderName,
    parentId: normalizedParentId,
    createdAt: now,
    updatedAt: now,
  };
  chatFolders.push(folder);
  return folder;
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openAppDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(indexedDbName, indexedDbVersion);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Opening the project database timed out."));
    }, 15000);

    const finish = (callback, value) => {
      if (settled) {
        if (value && typeof value.close === "function") value.close();
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(referenceStoreName)) {
        const store = db.createObjectStore(referenceStoreName, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }

      if (!db.objectStoreNames.contains(keyvalStoreName)) {
        db.createObjectStore(keyvalStoreName);
      }
      if (!db.objectStoreNames.contains(projectsStoreName)) {
        db.createObjectStore(projectsStoreName, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(scrapsStoreName)) {
        db.createObjectStore(scrapsStoreName, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(trashStoreName)) {
        // Trash items don't strictly have an id in current implementation, using autoIncrement
        db.createObjectStore(trashStoreName, { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(chatFoldersStoreName)) {
        db.createObjectStore(chatFoldersStoreName, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(chatFilesStoreName)) {
        db.createObjectStore(chatFilesStoreName, { keyPath: "id" });
      }
    };

    request.onblocked = () => finish(
      reject,
      new Error("The project database is blocked by another open AI System 6 window.")
    );
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      finish(resolve, request.result);
    };
    request.onerror = () => finish(
      reject,
      request.error || new Error("Could not open the project database.")
    );
  });
}

async function getStoredProjectReferences(projectId) {
  const db = await openAppDb();
  try {
    const references = await window.AISystem6StorageTransactions.runTransaction(
      db,
      referenceStoreName,
      "readonly",
      (tx) => idbRequest(tx.objectStore(referenceStoreName).index("projectId").getAll(projectId))
    );
    const normalized = references.map((reference) => normalizeProjectReferenceForStorage(reference));
    const needsMigration = normalized.filter((item, index) => item !== references[index]);
    if (needsMigration.length) {
      await Promise.all(needsMigration.map((item) => putStoredProjectReference(item)));
    }
    return normalized;
  } finally {
    db.close();
  }
}

async function putStoredProjectReference(reference) {
  const db = await openAppDb();
  try {
    await window.AISystem6StorageTransactions.runTransaction(
      db,
      referenceStoreName,
      "readwrite",
      (tx) => idbRequest(
        tx.objectStore(referenceStoreName).put(normalizeProjectReferenceForStorage(reference))
      )
    );
  } finally {
    db.close();
  }
}

function normalizeProjectReferenceForStorage(reference) {
  if (!reference || typeof reference !== "object") return reference;
  if (reference.embeddingModel !== "deepseek-embed") return reference;
  return {
    ...reference,
    embeddingModel: "local-embedding",
  };
}

async function deleteStoredProjectReference(referenceId) {
  const db = await openAppDb();
  try {
    await window.AISystem6StorageTransactions.runTransaction(
      db,
      referenceStoreName,
      "readwrite",
      (tx) => idbRequest(tx.objectStore(referenceStoreName).delete(referenceId))
    );
  } finally {
    db.close();
  }
}

async function hashText(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeOutlineSections(sections) {
  const normalized = (sections || [])
    .map((section) => String(section || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return normalized.length ? normalized : [defaultOutlineSection];
}

function plainOutlineBlocks(value) {
  const raw = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!raw) return [];
  const blocks = raw.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
  return blocks.length ? blocks : [raw];
}

function plainOutlineBlockTitle(block, index = 0) {
  const line = String(block || "")
    .split("\n")
    .map((part) => part
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)、]\s*/, "")
      .replace(/^#{1,6}\s+/, "")
      .replace(/\s+/g, " ")
      .trim())
    .find(Boolean);
  if (!line) return index === 0 ? defaultOutlineSection : `${defaultOutlineSection} ${index + 1}`;
  return line.length > 48 ? `${line.slice(0, 48).trim()}...` : line;
}

function extractOutlineSections(value) {
  if (Array.isArray(value)) {
    return normalizeOutlineSections(value);
  }

  const raw = String(value || "").trim();
  if (!raw) return [defaultOutlineSection];

  const markdownSections = parseMarkdownDocument(raw).outlineItems;
  if (markdownSections.length) return normalizeOutlineSections(markdownSections);

  return normalizeOutlineSections(plainOutlineBlocks(raw).map((block, index) => plainOutlineBlockTitle(block, index)));
}

function serializeOutlineSections(sections) {
  return normalizeOutlineSections(sections)
    .map((section) => `## ${section}`)
    .join("\n");
}

function normalizeHkrrIntent(value) {
  const raw = String(value || "").replace(/\s*\+\s*/g, " + ").replace(/\s+/g, " ").trim();
  const aliases = new Map([
    ["h", "H"],
    ["k", "K"],
    ["r", "R"],
    ["rhythm", "Rhythm"],
    ["h + r", "H + R"],
    ["k + r", "K + R"],
    ["h + rhythm", "H + Rhythm"],
    ["k + rhythm", "K + Rhythm"],
    ["r + rhythm", "R + Rhythm"],
  ]);
  return aliases.get(raw.toLowerCase()) || "";
}

function parseOutlineHkrrMetadata(body = "") {
  const text = String(body || "");
  const intent = normalizeHkrrIntent((text.match(/^\s*HKRR\s+intent\s*[:：]\s*(.+)$/im) || [])[1]);
  const note = ((text.match(/^\s*(?:说明|Note)\s*[:：]\s*(.+)$/im) || [])[1] || "").trim();
  return { intent, note };
}

function stripOutlineHkrrMetadata(body = "") {
  return String(body || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:HKRR\s+intent|说明|Note)\s*[:：]/i.test(line))
    .join("\n")
    .trim();
}

function outlineHkrrMetadataMarkdown(intent = "", note = "") {
  const lines = [];
  if (intent) lines.push(`HKRR intent: ${intent}`);
  if (note) lines.push(`说明：${note}`);
  return lines.join("\n");
}

function normalizeOutlineDraftBlocks(blocks) {
  const normalized = (blocks || []).map((block, index) => {
    const title = String(block?.title || "").replace(/\s+/g, " ").trim();
    if (!title) return null;
    const body = String(block?.body || "").trim();
    const metadata = parseOutlineHkrrMetadata(body);

    return {
      title,
      body: stripOutlineHkrrMetadata(body),
      hkrrIntent: metadata.intent,
      hkrrNote: metadata.note,
      sourceMarkdown: String(block?.source || block?.sourceMarkdown || "").trim(),
      sourceOutlineIndex: Number.isFinite(Number(block?.index)) ? Number(block.index) : index,
    };
  }).filter(Boolean);

  return normalized.length
    ? normalized
    : [{ title: defaultOutlineSection, body: "", sourceMarkdown: "", sourceOutlineIndex: 0 }];
}

function outlineDraftBlocksFromSections(sections) {
  return normalizeOutlineSections(sections).map((section, index) => ({
    title: section,
    body: "",
    sourceMarkdown: `## ${section}`,
    sourceOutlineIndex: index,
  }));
}

function plainOutlineDraftBlocks(value) {
  return plainOutlineBlocks(value).map((block, index) => {
    const title = plainOutlineBlockTitle(block, index);
    return {
      title,
      body: block,
      sourceMarkdown: `## ${title}\n\n${block}`,
      sourceOutlineIndex: index,
    };
  });
}

function replacePlainOutlineBlock(value, index = 0, nextBody = "") {
  const blocks = plainOutlineBlocks(value);
  if (!blocks.length) return String(nextBody || "").trim();

  const targetIndex = Math.max(0, Math.min(blocks.length - 1, Number(index) || 0));
  blocks[targetIndex] = String(nextBody || "").trim();
  return blocks.filter(Boolean).join("\n\n");
}

function replaceOutlineDraftBlockBody(markdown, index = 0, nextBody = "") {
  const raw = String(markdown || "").trim();
  if (!raw) return String(nextBody || "").trim();

  const levelTwoBlocks = markdownDocumentSectionBlocks(raw, 2);
  if (levelTwoBlocks.length) return replaceMarkdownDocumentSectionBody(raw, 2, index, nextBody);

  const levelOneBlocks = markdownDocumentSectionBlocks(raw, 1);
  if (levelOneBlocks.length) return replaceMarkdownDocumentSectionBody(raw, 1, index, nextBody);

  const levelThreeBlocks = markdownDocumentSectionBlocks(raw, 3);
  if (levelThreeBlocks.length) return replaceMarkdownDocumentSectionBody(raw, 3, index, nextBody);

  return replacePlainOutlineBlock(raw, index, nextBody);
}

function extractOutlineDraftBlocks(value) {
  if (Array.isArray(value)) return outlineDraftBlocksFromSections(value);

  const raw = String(value || "").trim();
  if (!raw) return outlineDraftBlocksFromSections([defaultOutlineSection]);

  const levelTwoBlocks = markdownDocumentSectionBlocks(raw, 2);
  if (levelTwoBlocks.length) return normalizeOutlineDraftBlocks(levelTwoBlocks);

  const levelOneBlocks = markdownDocumentSectionBlocks(raw, 1);
  if (levelOneBlocks.length) return normalizeOutlineDraftBlocks(levelOneBlocks);

  const levelThreeBlocks = markdownDocumentSectionBlocks(raw, 3);
  if (levelThreeBlocks.length) return normalizeOutlineDraftBlocks(levelThreeBlocks);

  return normalizeOutlineDraftBlocks(plainOutlineDraftBlocks(raw));
}

const writingSurfaceOrder = ["questionSheet", "outline", "sectionDrafts", "teachText", "claimCheck", "projectCd"];

function createWritingSurfaceState() {
  return {
    questionSheet: { type: "questionSheet", upstream: [], downstream: ["outline"], compactTeachText: true },
    outline: { type: "outline", upstream: ["questionSheet"], downstream: ["sectionDrafts"], compactTeachText: true },
    sectionDrafts: { type: "sectionDrafts", upstream: ["outline"], downstream: ["teachText"], compactTeachText: true },
    teachText: { type: "teachText", upstream: ["questionSheet", "outline", "sectionDrafts"], downstream: ["claimCheck", "projectCd"], compactTeachText: false },
    claimCheck: { type: "claimCheck", upstream: ["teachText"], downstream: ["projectCd"], compactTeachText: false },
    projectCd: { type: "projectCd", upstream: ["teachText", "claimCheck"], downstream: [], compactTeachText: false },
  };
}

function normalizeWritingSurfaceState(project) {
  if (!project) return createWritingSurfaceState();

  const defaults = createWritingSurfaceState();
  const existing = project.writingSurfaces || {};
  project.writingSurfaces = writingSurfaceOrder.reduce((surfaces, key) => {
    surfaces[key] = {
      ...defaults[key],
      ...(existing[key] || {}),
      type: key,
    };
    return surfaces;
  }, {});
  return project.writingSurfaces;
}

function setProjectOutlineSections(project, sections) {
  if (!project) return [defaultOutlineSection];

  const normalized = normalizeOutlineSections(sections);
  project.outlineSections = normalized;
  project.outline = serializeOutlineSections(normalized);
  return normalized;
}

function setProjectOutlineMarkdown(project, markdown) {
  if (!project) return [defaultOutlineSection];

  const outline = String(markdown || "").trim();
  const sections = extractOutlineSections(outline);
  project.outline = outline;
  project.outlineSections = sections;
  return sections;
}

function getProjectOutlineSections(project) {
  if (!project) return [defaultOutlineSection];

  const sections = project.outline !== undefined
    ? extractOutlineSections(project.outline)
    : normalizeOutlineSections(project.outlineSections);

  project.outlineSections = sections;
  if (project.outline === undefined) project.outline = serializeOutlineSections(sections);
  return sections;
}

function getProjectOutlineDraftBlocks(project) {
  if (!project) return outlineDraftBlocksFromSections([defaultOutlineSection]);
  return extractOutlineDraftBlocks(project.outline !== undefined ? project.outline : project.outlineSections);
}

function createProjectRecord(name) {
  const now = new Date().toISOString();
  const outlineSections = [defaultOutlineSection];
  return {
    id: crypto.randomUUID(),
    name: (name || getDefaultProjectName()).trim() || getDefaultProjectName(),
    createdAt: now,
    updatedAt: now,
    archived: false,
    questionSheet: "",
    outline: serializeOutlineSections(outlineSections),
    outlineSections,
    drafts: [],
    imageAttachments: [],
    writingSurfaces: createWritingSurfaceState(),
    documentTabs: [],
    activeDocumentTabIds: { reader: null, teachText: null, docMap: null, timeMachine: null },
    dictionaryTerms: [],
    flowState: {
      topic: false,
      research: false,
      outline: false,
      drafting: false,
      check: false,
    },
    sourceRegistry: { allocations: {}, nextN: 1 },
  };
}

function normalizeProjectDiskName(project) {
  if (!project) return false;
  const name = String(project.name || "").trim();
  if (!name) {
    project.name = getDefaultProjectName();
    project.updatedAt = project.updatedAt || new Date().toISOString();
    return true;
  }
  return false;
}

function getActiveProject() {
  if (!isProjectMounted) return null;
  return projects.find((project) => project.id === activeProjectId) || projects[0] || null;
}

function getSelectedProject() {
  return projects.find((project) => project.id === selectedProjectId)
    || projects.find((project) => project.id === activeProjectId)
    || projects[0]
    || null;
}

function ensureActiveProject() {
  let changed = false;
  if (!projects.length) {
    projects.push(createProjectRecord(getDefaultProjectName()));
    isProjectMounted = true;
    changed = true;
  }

  if (startupProjectId && !projects.some((project) => project.id === startupProjectId)) {
    startupProjectId = null;
    changed = true;
  }

  if (!startupProjectId && activeProjectId && projects.some((project) => project.id === activeProjectId)) {
    startupProjectId = activeProjectId;
    changed = true;
  }

  if (!startupProjectId) {
    startupProjectId = projects[0].id;
    changed = true;
  }

  if (!projects.some((project) => project.id === activeProjectId)) {
    activeProjectId = startupProjectId || projects[0].id;
  }

  if (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId)) {
    selectedProjectId = activeProjectId;
  }

  const attachmentsByProjectId = new Map();
  chatFiles.forEach((file) => {
    if (file?.type !== "text" || !Array.isArray(file.imageAttachments) || !file.imageAttachments.length) return;
    const projectId = file.projectId || activeProjectId || startupProjectId;
    if (!projectId) return;
    if (!attachmentsByProjectId.has(projectId)) attachmentsByProjectId.set(projectId, []);
    attachmentsByProjectId.get(projectId).push(...cloneTeachTextImageAttachments(file.imageAttachments));
  });

  // Migration: Ensure all projects have pipeline fields
  projects.forEach(project => {
    changed = normalizeProjectDiskName(project) || changed;
    if (project.archived === undefined) project.archived = false;
    if (project.questionSheet === undefined) project.questionSheet = "";
    if (project.outline === undefined) project.outline = serializeOutlineSections([defaultOutlineSection]);
    getProjectOutlineSections(project);
    if (project.drafts === undefined) project.drafts = [];
    normalizeWritingSurfaceState(project);
    if (project.docMapCache !== undefined) {
      delete project.docMapCache;
      changed = true;
    }
    ensureProjectDocumentTabs(project);
    if (!Array.isArray(project.dictionaryTerms)) project.dictionaryTerms = [];
    if (project.flowState === undefined) project.flowState = { topic: false, research: false, outline: false, drafting: false, check: false };
    const mergedAttachments = [
      ...cloneTeachTextImageAttachments(project.imageAttachments),
      ...(attachmentsByProjectId.get(project.id) || []),
    ];
    const byId = new Map();
    mergedAttachments.forEach((attachment) => {
      if (!byId.has(attachment.id)) byId.set(attachment.id, attachment);
    });
    const normalizedAttachments = [...byId.values()].slice(0, teachTextImageAttachmentLimit);
    if (!Array.isArray(project.imageAttachments) || project.imageAttachments.length !== normalizedAttachments.length) {
      changed = true;
    }
    project.imageAttachments = normalizedAttachments;
  });
  chatFolders.forEach((folder) => {
    if (folder.parentId === undefined) folder.parentId = null;
  });
  chatFiles.forEach((file) => {
    if (file?.artifactKind !== "project-memory") return;
    if (file.memoryStatus !== "active" && file.memoryStatus !== "disabled") {
      file.memoryStatus = "active";
      changed = true;
    }
    if (!Array.isArray(file.sourceMessageIds)) {
      file.sourceMessageIds = [];
      changed = true;
    }
    if (file.sourceChatId === undefined) {
      file.sourceChatId = "";
      changed = true;
    }
  });
  return changed;
}

function isInActiveProject(item) {
  return isProjectMounted && item?.projectId === activeProjectId;
}

function getProjectFolders() {
  return chatFolders.filter(isInActiveProject);
}

function getProjectFiles() {
  return chatFiles.filter(isInActiveProject);
}

function getProjectScraps() {
  return scraps.filter(isInActiveProject);
}

function getProjectTrashItems() {
  return trashItems.filter(isInActiveProject);
}

function getProjectReferenceChunks() {
  if (!isProjectMounted || !activeProjectId) return [];
  return projectReferences
    .filter((reference) => reference.projectId === activeProjectId)
    .filter((reference) => reference.enabled !== false)
    .flatMap((reference) =>
      (reference.chunks || []).map((chunk, index) => ({
        ...chunk,
        projectId: reference.projectId,
        referenceId: reference.id,
        source: reference.name,
        referenceName: reference.name,
        referenceChunkIndex: index + 1,
        fromProjectReference: true,
      }))
    );
}

function getMountedTextDiskChunks() {
  if (!isProjectMounted || mountedTextDisk.projectId !== activeProjectId) return [];
  return ragChunks.filter((chunk) => chunk.projectId === activeProjectId && !chunk.fromProjectReference);
}

function hasMountedFileDiskContext() {
  return getMountedTextDiskChunks().length > 0;
}

function getProjectCdItems(projectId = activeProjectId) {
  if (!isProjectMounted || !projectId) return [];
  return projectCdItems.filter((item) => item.projectId === projectId);
}

function syncWritingToolsShadeToggle() {
  if (!writingToolsPanelEl) return;
  const expanded = !writingToolsPanelEl.classList.contains("is-shaded");
  writingToolsPanelEl.setAttribute("aria-expanded", String(expanded));
  if (writingToolsShadeToggleEl) {
    writingToolsShadeToggleEl.setAttribute("aria-expanded", String(expanded));
    writingToolsShadeToggleEl.setAttribute("aria-label", t(expanded ? "collapse_tools" : "expand_tools"));
  }
}

function toggleWritingToolsShade() {
  if (!writingToolsPanelEl) return;
  writingToolsPanelEl.classList.toggle("is-shaded");
  syncWritingToolsShadeToggle();
  scheduleWorkingSessionSave();
}

function setComposeToolsMenu(open) {
  if (!composeToolsMenuEl || !composeToolsToggleButton) return;
  composeToolsMenuEl.classList.toggle("is-hidden", !open);
  composeToolsToggleButton.setAttribute("aria-expanded", String(open));
}

function closeComposeToolsMenu() {
  setComposeToolsMenu(false);
}

function toggleComposeToolsMenu() {
  const isOpen = composeToolsMenuEl && !composeToolsMenuEl.classList.contains("is-hidden");
  setComposeToolsMenu(!isOpen);
  if (!isOpen) {
    requestAnimationFrame(() => {
      composeToolsMenuEl?.querySelector('button[role="menuitem"]:not(.is-hidden):not([hidden]):not(:disabled)')?.focus();
    });
  }
}

function removeProjectReferenceChunks() {
  for (let index = ragChunks.length - 1; index >= 0; index -= 1) {
    if (ragChunks[index].fromProjectReference) {
      ragChunks.splice(index, 1);
    }
  }
}

function mountProjectReferenceChunks() {
  removeProjectReferenceChunks();
  ragChunks.push(...getProjectReferenceChunks());
}

function assignProjectScope(projectId) {
  chatFolders.forEach((folder) => {
    if (!folder.projectId) folder.projectId = projectId;
  });
  chatFiles.forEach((file) => {
    if (!file.projectId) file.projectId = projectId;
  });
  scraps.forEach((scrap) => {
    if (!scrap.projectId) scrap.projectId = projectId;
  });
  trashItems.forEach((item) => {
    if (!item.projectId) item.projectId = projectId;
    if (item.originalData && !item.originalData.projectId) {
      item.originalData.projectId = item.projectId;
    }
  });
  projectCdItems.forEach((item) => {
    if (!item.projectId) item.projectId = projectId;
  });
}

function renderProjectSwitcher(targetPopover = projectSwitcherPopoverEl) {
  if (!targetPopover) return;

  const activeProject = getActiveProject();
  const activeLabel = activeProject ? projectDisplayName(activeProject) : t("no_project_mounted");
  if (targetPopover === projectSwitcherPopoverEl && projectSwitcherButton && projectSwitcherLabelEl) {
    projectSwitcherLabelEl.textContent = activeLabel;
    projectSwitcherButton.title = projectSwitcherStartupPickMode
      ? t("set_startup")
      : (activeProject ? t("mounted_project", activeLabel) : t("no_project_mounted"));
    projectSwitcherButton.setAttribute("aria-label", t("project_switcher_aria"));
    projectSwitcherButton.classList.toggle("is-unmounted", !activeProject);
    projectSwitcherButton.classList.toggle("is-startup-pick", projectSwitcherStartupPickMode);
  }
  targetPopover.replaceChildren();

  if (projectSwitcherStartupPickMode) {
    const heading = document.createElement("div");
    heading.className = "project-switcher-heading";
    heading.textContent = t("choose_startup_disk");
    targetPopover.append(heading);
  }

  if (!projects.length) {
    const empty = document.createElement("button");
    empty.type = "button";
    empty.disabled = true;
    empty.className = "project-switcher-empty";
    empty.textContent = t("project_switcher_empty");
    targetPopover.append(empty);
  } else {
    projects.forEach((project) => {
      const isCurrent = isProjectMounted && project.id === activeProjectId;
      const fileCount = chatFiles.filter((file) => file.projectId === project.id).length;
      const scrapCount = scraps.filter((scrap) => scrap.projectId === project.id).length;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.switchProject = project.id;
      button.draggable = true;
      button.dataset.dragType = "project";
      button.dataset.id = project.id;
      button.className = `project-switcher-item${isCurrent ? " is-current" : ""}${project.archived ? " is-archived" : ""}`;
      if (isCurrent) button.setAttribute("aria-current", "true");

      const mark = document.createElement("span");
      mark.className = "project-switcher-mark";
      mark.textContent = projectSwitcherStartupPickMode
        ? (project.id === startupProjectId ? "✓" : "")
        : (isCurrent ? "✓" : "");

      const copy = document.createElement("span");
      copy.className = "project-switcher-copy";
      const name = document.createElement("b");
      name.textContent = projectDisplayName(project);
      const meta = document.createElement("small");
      meta.textContent = [
        t("project_switcher_counts", fileCount, scrapCount),
        isCurrent ? t("project_switcher_current") : "",
        project.id === startupProjectId ? t("project_switcher_startup") : "",
        project.archived ? t("archived") : "",
      ].filter(Boolean).join(" · ");
      copy.append(name, meta);

      button.append(mark, copy);
      targetPopover.append(button);
    });
  }

  const divider = document.createElement("hr");
  targetPopover.append(divider);

  const newProject = document.createElement("button");
  newProject.type = "button";
  newProject.dataset.action = "new-project-disk";
  newProject.textContent = t("new_project_disk");

  const openProjects = document.createElement("button");
  openProjects.type = "button";
  openProjects.dataset.action = "open-project-disks";
  openProjects.textContent = t("open_project_disks");

  targetPopover.append(newProject, openProjects);
}

var projectSwitcherStartupPickMode = false;

function openProjectSwitcherForStartup() {
  projectSwitcherStartupPickMode = true;
  renderProjectSwitcher();
  closeMenus();
  const menu = projectSwitcherButton?.closest(".menu");
  if (!menu) return;
  menu.classList.add("is-open");
  if (typeof positionOpenMenu === "function") positionOpenMenu(menu);
  setStatus(t("choose_startup_disk"));
}

function handleProjectSwitcherChoice(projectId) {
  if (projectSwitcherStartupPickMode) {
    projectSwitcherStartupPickMode = false;
    setStartupProject(projectId);
    renderProjectSwitcher();
    return;
  }
  switchProject(projectId);
}

function updateProjectLabels() {
  const project = getActiveProject();
  const selectedProject = getSelectedProject();
  const name = project ? projectDisplayName(project) : t("no_project_mounted");
  const activeText = project ? t("mounted_project", name) : t("no_project_mounted");
  const selectedText = selectedProject ? t("selected_project", projectDisplayName(selectedProject)) : t("no_project_mounted");

  if (currentProjectLabelEl) {
    currentProjectLabelEl.textContent = t("current_project_desktop");
    const currentProjectIcon = currentProjectLabelEl.closest(".desktop-icon");
    currentProjectIcon?.classList.toggle("is-hidden", !project);
    currentProjectIcon?.setAttribute("aria-hidden", String(!project));
    currentProjectIcon?.setAttribute("title", name);
    if (project && currentProjectIcon) currentProjectIcon.dataset.projectId = project.id;
    else delete currentProjectIcon?.dataset.projectId;
  }
  if (assistantProjectStatusEl) assistantProjectStatusEl.textContent = activeText;
  if (activeProjectLabelEl) activeProjectLabelEl.textContent = activeText;
  if (selectedProjectLabelEl) selectedProjectLabelEl.textContent = selectedText;
  if (documentsProjectLabelEl) documentsProjectLabelEl.textContent = activeText;
  if (scrapbookProjectLabelEl) scrapbookProjectLabelEl.textContent = activeText;
  if (trashProjectLabelEl) trashProjectLabelEl.textContent = activeText;
  renderProjectSwitcher();
  updateMenuStatus();
  updateProjectDiskActionVisibility();
  renderAboutMacintosh();
}

function setProjectDiskActionVisible(button, visible) {
  if (!button) return;
  button.hidden = !visible;
}

function updateProjectDiskActionVisibility() {
  const selectedProject = getSelectedProject();
  const rebuildArticleButton = document.querySelector('[data-action="open-rebuild-flow"]');
  const duplicateProjectButton = document.querySelector('[data-action="duplicate-project-disk"]');
  const archiveProjectButton = document.querySelector('[data-action="archive-project-disk"]');

  setProjectDiskActionVisible(rebuildArticleButton, !!getActiveProject());
  setProjectDiskActionVisible(duplicateProjectButton, !!selectedProject);
  setProjectDiskActionVisible(archiveProjectButton, !!selectedProject);
}

function getProjectNameConflict(name, ignoreProjectId = null) {
  const normalized = name.trim().toLowerCase();
  return projects.find((project) => project.id !== ignoreProjectId && project.name.trim().toLowerCase() === normalized);
}

// Project-wide name dedupe. The folder-scoped twin lives in documents-chat.js
// under the plain name; keeping these apart matters because the concatenated
// bundle keeps only one definition per name, and the two scopes are different.
function nextAvailableProjectFileName(baseName, projectId = activeProjectId) {
  const base = (baseName || t("untitled")).trim() || t("untitled");
  const names = new Set(
    chatFiles
      .filter((file) => file.projectId === projectId)
      .map((file) => file.name.trim().toLowerCase())
  );
  if (!names.has(base.toLowerCase())) return base;

  let index = 2;
  while (names.has(`${base} ${index}`.toLowerCase())) {
    index += 1;
  }
  return `${base} ${index}`;
}

function getProjectFinderCurrentParentId() {
  if (selectedFolderId === "all") return null;
  return getProjectFolders().some((folder) => folder.id === selectedFolderId) ? selectedFolderId : null;
}

function getProjectFolderDeepItemCount(folderId) {
  const tree = getDocumentFolderTree(folderId);
  return Math.max(0, tree.folders.length - 1) + tree.files.length;
}

function getProjectFolderFinderItem(folder) {
  return {
    ...folder,
    type: "folder",
    name: displayFolderName(folder.name),
    kindLabel: t("folder_kind"),
    iconClass: "folder-icon",
    iconId: "folder",
    itemCount: getProjectFolderDeepItemCount(folder.id),
    sizeValue: getProjectFolderDeepItemCount(folder.id),
    sizeLabel: t("items_count", getProjectFolderDeepItemCount(folder.id)),
    modifiedAt: folder.updatedAt || folder.createdAt,
    canDuplicate: true,
    canRename: true,
    canTrash: true,
    open: () => openProjectFinderFolder(folder.id),
  };
}

function getProjectFileFinderItem(file) {
  const isAlias = file.type === "alias";
  const isClipping = file.artifactKind === "clipping";
  const isRunRecord = file.artifactKind === "clio-run-record";
  const kindLabel = isAlias
    ? t("kind_alias")
    : isClipping
      ? t("kind_clipping")
      : isRunRecord
        ? t("kind_run_record")
        : file.artifactKind === "project-memory"
    ? (file.memoryStatus === "disabled"
      ? (currentLanguage === "zh" ? "项目记忆（已停用）" : "Project Memory (Disabled)")
      : (currentLanguage === "zh" ? "项目记忆" : "Project Memory"))
    : (file.type === "text" ? t("kind_teachtext") : t("kind_chat"));
  // Run records are text receipts, not TeachText manuscripts: they get the
  // generic document icon and their own kind label instead of the TeachText
  // "T" glyph, which misrepresented what the folder holds.
  const iconClass = isAlias ? "alias-icon" : isClipping ? "scrap-icon" : isRunRecord ? "doc-icon" : file.type === "text" ? "teachtext-icon" : "doc-icon";
  const iconId = isAlias ? "alias" : isClipping ? "scrap" : isRunRecord ? "document" : file.type === "text" ? "teachText" : "chatFile";
  const bodyText = isAlias ? "" : file.type === "text" ? (file.body || "") : formatChatFile(file);
  return {
    ...file,
    kindLabel,
    iconClass,
    iconId,
    sizeValue: bodyText.length,
    modifiedAt: file.updatedAt || file.createdAt,
    canDuplicate: true,
    canRename: true,
    canTrash: true,
    canMakeDocMap: !isAlias && file.type === "text" && bodyText.trim().length >= docMapMinDocumentChars,
    canRunChecks: !isAlias && file.type === "text" && bodyText.trim().length > 0,
    open: () => {
      selectedChatFileId = file.id;
      withFinderObjects(() => {
        if (isAlias) return openAliasFile(file);
        if (openProjectFileWithStationery(file)) return;
        if (file.type === "text") openTextFile(file.id);
        else openChatFileWindow(file.id);
      });
    },
  };
}

function getProjectRootFinderItems() {
  const currentParentId = getProjectFinderCurrentParentId();
  const folders = getProjectFolders()
    .filter((folder) => (folder.parentId || null) === currentParentId)
    .map(getProjectFolderFinderItem);
  const files = getProjectFiles()
    .filter((file) => (file.folderId || null) === currentParentId)
    .map(getProjectFileFinderItem);
  if (currentParentId) return [...folders, ...files];
  const references = projectReferences
    .filter((reference) => reference.projectId === activeProjectId)
    .map(getProjectReferenceFinderItem);
  return [...folders, ...files, ...references];
}

function getSelectedProjectRootItem() {
  const items = getProjectRootFinderItems();
  const selectedFile = selectedChatFileId ? items.find((item) => item.id === selectedChatFileId && item.type !== "folder" && item.type !== "finder-root") : null;
  if (selectedFile) return selectedFile;
  const selectedFolder = selectedDocumentFolderId ? items.find((item) => item.id === selectedDocumentFolderId && item.type === "folder") : null;
  if (selectedFolder) return selectedFolder;
  if (!items.some((item) => item.type === "finder-root" && item.id === selectedProjectRootItemId)) {
    selectedProjectRootItemId = null;
  }
  return items.find((item) => item.id === selectedProjectRootItemId) || null;
}

function getSelectedProjectFinderItem() {
  return getSelectedProjectRootItem();
}

function getCurrentFinderSelection() {
  const activeWin = document.querySelector(".window.is-active:not(.is-hidden)");
  const activeName = activeWin?.dataset.window || "";
  if (typeof getFinderVolumeDefinition === "function" && getFinderVolumeDefinition(activeName)) {
    return getFinderVolumeSelectedItem(activeName);
  }
  if (activeName === "documents") return getSelectedDocumentItem();
  if (finderContainerWindowNames.includes(activeName)) return getSelectedStaticFinderItem(activeName);
  return null;
}

function getCurrentFinderParentId() {
  const activeWin = document.querySelector(".window.is-active:not(.is-hidden)");
  const activeName = activeWin?.dataset.window || "";
  if (activeName === "projects" || activeName === "documents") {
    return selectedFolderId === "all" ? null : selectedFolderId;
  }
  return null;
}

function getProjectFolderPathLabel(folderId, projectId = activeProjectId) {
  const project = projects.find((item) => item.id === projectId) || getActiveProject();
  const parts = [project ? projectDisplayName(project) : t("project_disk")];
  if (folderId) parts.push(...getFolderPath(folderId, projectId));
  return parts.filter(Boolean).join(" / ");
}

function getFinderItemPathLabel(item) {
  if (!item) return t("project_disk");
  if (item.type === "folder") return getProjectFolderPathLabel(item.parentId || null, item.projectId || activeProjectId);
  if (item.type === "finder-root") {
    const project = getActiveProject();
    return [project ? projectDisplayName(project) : t("project_disk"), item.name].filter(Boolean).join(" / ");
  }
  if (item.projectId) return getProjectFolderPathLabel(item.folderId || null, item.projectId);
  return t("project_disk");
}

function getTrashOriginalPath(item) {
  if (!item) return "";
  if (item.originalPath) return item.originalPath;
  if (item.originalType === "file" && item.originalData) return getProjectFolderPathLabel(item.originalData.folderId || null, item.projectId || activeProjectId);
  if (item.originalType === "folder" && item.originalData?.folder) {
    const folder = item.originalData.folder;
    return getProjectFolderPathLabel(folder.parentId || null, item.projectId || activeProjectId);
  }
  if (item.originalType === "scrap") {
    const project = getActiveProject();
    return [project ? projectDisplayName(project) : t("project_disk"), t("scrapbook_label")].filter(Boolean).join(" / ");
  }
  if (item.originalType === "projectCd") {
    const project = getActiveProject();
    return [project ? projectDisplayName(project) : t("project_disk"), t("project_cd")].filter(Boolean).join(" / ");
  }
  if (item.originalType === "projectReference") {
    const project = getActiveProject();
    return [project ? projectDisplayName(project) : t("project_disk"), t("project_sources")].filter(Boolean).join(" / ");
  }
  if (item.originalType === "mountedFile") {
    const project = getActiveProject();
    return [project ? projectDisplayName(project) : t("project_disk"), t("mounted_text_disk")].filter(Boolean).join(" / ");
  }
  if (item.originalType === "project") return t("project_disk");
  return t("project_disk");
}

function updateProjectRootSelectionView() {
  const selectedRootItem = getSelectedProjectRootItem();
  if (selectedProjectLabelEl) {
    selectedProjectLabelEl.textContent = selectedRootItem
      ? t("finder_selected_item", selectedRootItem.name)
      : t("finder_no_selection");
  }
  projectDiskGridEl?.querySelectorAll("[data-project-root-id], [data-document-item-id]").forEach((el) => {
    const isSystem = el.dataset.projectRootId && el.dataset.projectRootId === selectedProjectRootItemId;
    const key = el.dataset.documentItemType && el.dataset.documentItemId
      ? documentSelectionKey(el.dataset.documentItemType, el.dataset.documentItemId)
      : "";
    const isFile = el.dataset.documentItemType === "file" && (el.dataset.documentItemId === selectedChatFileId || selectedDocumentItemKeys.has(key));
    const isFolder = el.dataset.documentItemType === "folder" && (el.dataset.documentItemId === selectedDocumentFolderId || selectedDocumentItemKeys.has(key));
    el.classList.toggle("is-selected", isSystem || isFile || isFolder);
  });
}

function selectProjectRootItem(itemId) {
  selectedProjectRootItemId = itemId;
  selectedChatFileId = null;
  selectedDocumentFolderId = null;
  clearDocumentSelection();
  updateProjectRootSelectionView();
  updateMenuState();
}

function openProjectFinderFolder(folderId) {
  if (!getProjectFolders().some((folder) => folder.id === folderId)) return;
  selectedFolderId = folderId;
  selectedChatFileId = null;
  selectedDocumentFolderId = null;
  selectedProjectRootItemId = null;
  clearDocumentSelection();
  renderProjectDisks();
}

function openProjectFinderParentFolder() {
  const folder = getSelectedFolder();
  selectedFolderId = folder?.parentId || "all";
  selectedChatFileId = null;
  selectedDocumentFolderId = null;
  selectedProjectRootItemId = null;
  clearDocumentSelection();
  renderProjectDisks();
}

function openProjectRootItem(item = getSelectedProjectRootItem()) {
  if (!item) {
    setStatus(t("select_finder_item_first"));
    return;
  }
  item.open();
}

function getProjectFinderItemMeta(item) {
  if (item.meta) return item.meta;
  if (item.type === "folder") return t("items_count", item.itemCount || 0);
  return getFinderItemSizeLabel(item);
}

function renderProjectRootListItem(item, project, mode, orderedItems = []) {
  const row = document.createElement("div");
  const isSystem = item.type === "finder-root";
  const isFolder = item.type === "folder";
  const isFile = !isSystem && !isFolder;
  const selected = isSystem
    ? item.id === selectedProjectRootItemId
    : isFolder
      ? selectedDocumentItemKeys.has(documentSelectionKey("folder", item.id)) || item.id === selectedDocumentFolderId
      : item.type === "projectReference"
        ? selectedDocumentItemKeys.has(documentSelectionKey("projectReference", item.id)) || item.id === selectedProjectReferenceId
        : selectedDocumentItemKeys.has(documentSelectionKey("file", item.id)) || item.id === selectedChatFileId;
  const isReference = item.type === "projectReference";
  row.className = `finder-list-row${item.label ? ` label-${item.label}` : ""} finder-label-${item.finderLabel || "none"}${selected ? " is-selected" : ""}`;
  if (isSystem) row.dataset.projectRootId = item.id;
  if (isFolder || isFile) {
    row.draggable = true;
    row.dataset.dragType = isFolder ? "document-folder" : isReference ? "projectReference" : "file";
    row.dataset.id = item.id;
    row.dataset.projectId = item.projectId;
    row.dataset.documentItemType = isFolder ? "folder" : isReference ? "projectReference" : "file";
    row.dataset.documentItemId = item.id;
  }
  if (isFolder) {
    row.dataset.dropTarget = "document-folder";
    row.dataset.folderId = item.id;
  }
  const metaInner = item.metaHtml || escapeHtml(getProjectFinderItemMeta(item));
  row.innerHTML = `
    <span class="finder-list-name-cell">${renderSystemIcon(item.iconId || item.iconClass, { size: "mini"})}<span>${escapeHtml(getFinderItemName(item))}</span></span>
    <span>${escapeHtml(getFinderItemKindLabel(item))}</span>
    <span>${metaInner}</span>
    <span>${getFinderItemModifiedAt(item) ? new Date(getFinderItemModifiedAt(item)).toLocaleDateString() : new Date(project.updatedAt || project.createdAt).toLocaleDateString()}</span>
  `;
  attachCitationJumpHandler(row);
  row.addEventListener("click", (event) => {
    if (isSystem) selectProjectRootItem(item.id);
    else {
      const selectionType = isFolder ? "folder" : isReference ? "projectReference" : "file";
      selectDocumentItemFromEvent(selectionType, item.id, event, orderedItems);
      updateProjectRootSelectionView();
    }
  });
  row.addEventListener("dblclick", () => openProjectRootItem(item));
  return row;
}

function renderProjectRootIconItem(item, orderedItems = []) {
  const button = document.createElement("button");
  button.type = "button";
  const isSystem = item.type === "finder-root";
  const isFolder = item.type === "folder";
  const isFile = !isSystem && !isFolder;
  const isReference = item.type === "projectReference";
  const selected = isSystem
    ? item.id === selectedProjectRootItemId
    : isFolder
      ? selectedDocumentItemKeys.has(documentSelectionKey("folder", item.id)) || item.id === selectedDocumentFolderId
      : isReference
        ? selectedDocumentItemKeys.has(documentSelectionKey("projectReference", item.id)) || item.id === selectedProjectReferenceId
        : selectedDocumentItemKeys.has(documentSelectionKey("file", item.id)) || item.id === selectedChatFileId;
  button.className = `finder-item${item.label ? ` label-${item.label}` : ""} finder-label-${item.finderLabel || "none"}${selected ? " is-selected" : ""}`;
  if (isSystem) button.dataset.projectRootId = item.id;
  if (isFolder || isFile) {
    button.draggable = true;
    button.dataset.dragType = isFolder ? "document-folder" : isReference ? "projectReference" : "file";
    button.dataset.id = item.id;
    button.dataset.projectId = item.projectId;
    button.dataset.documentItemType = isFolder ? "folder" : isReference ? "projectReference" : "file";
    button.dataset.documentItemId = item.id;
  }
  if (isFolder) {
    button.dataset.dropTarget = "document-folder";
    button.dataset.folderId = item.id;
  }
  const metaInner = item.metaHtml || escapeHtml(getProjectFinderItemMeta(item));
  button.innerHTML = `${renderSystemIcon(item.iconId || item.iconClass, { size: "mini"})}<span>${escapeHtml(getFinderItemName(item))}</span><small>${metaInner}</small>`;
  attachCitationJumpHandler(button);
  button.addEventListener("click", (event) => {
    if (isSystem) selectProjectRootItem(item.id);
    else {
      const selectionType = isFolder ? "folder" : isReference ? "projectReference" : "file";
      selectDocumentItemFromEvent(selectionType, item.id, event, orderedItems);
      updateProjectRootSelectionView();
    }
  });
  button.addEventListener("dblclick", () => openProjectRootItem(item));
  return button;
}

function attachCitationJumpHandler(root) {
  if (!root || typeof cycleCitationJump !== "function") return;
  root.querySelectorAll("[data-citation-jump-key]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      cycleCitationJump(el.dataset.citationJumpKey);
    });
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.stopPropagation();
        event.preventDefault();
        cycleCitationJump(el.dataset.citationJumpKey);
      }
    });
  });
}

function renderProjectDisks() {
  ensureActiveProject();
  if (selectedFolderId !== "all" && !getProjectFolders().some((folder) => folder.id === selectedFolderId)) {
    selectedFolderId = "all";
  }
  selectedProjectId = activeProjectId;
  updateProjectLabels();

  const project = getActiveProject();
  const titleEl = document.querySelector("#project-disk-title");
  const currentFolder = getSelectedFolder();
  if (projectDiskNameInput) projectDiskNameInput.value = project?.name || getDefaultProjectName();

  if (!project) {
    projectDiskGridEl.replaceChildren();
    if (titleEl) titleEl.textContent = t("project_disk");
    if (projectDiskCountEl) projectDiskCountEl.textContent = "";
    selectedProjectRootItemId = null;
    if (selectedProjectLabelEl) selectedProjectLabelEl.textContent = t("finder_no_selection");
    const empty = document.createElement("button");
    empty.type = "button";
    empty.className = "finder-empty-object project-empty-object";
    empty.innerHTML = `${renderSystemIcon("projectDisk", { size: "mini"})}<b>${escapeHtml(t("project_disk"))}</b><small>${escapeHtml(t("spine_no_project"))}</small>`;
    empty.addEventListener("click", () => openWindow("projects"));
    projectDiskGridEl.append(empty);
    return;
  }

  const path = currentFolder ? getFolderPath(currentFolder.id).join(" / ") : t("project_disk");
  if (titleEl) titleEl.textContent = path;
  titleEl?.setAttribute("title", path);
  if (projectDiskPathEl) projectDiskPathEl.textContent = path;
  const projectDiskLocationEl = document.querySelector("#project-disk-location");
  if (projectDiskLocationEl) {
    projectDiskLocationEl.textContent = path;
    projectDiskLocationEl.title = path;
  }
  if (projectDiskUpButton) {
    projectDiskUpButton.hidden = true;
    projectDiskUpButton.textContent = currentFolder ? t("up_one_level") : t("all_documents");
  }
  renderFinderNavigationBar(getWindow("projects"));

  projectDiskGridEl.dataset.dropTarget = "document-current-folder";
  projectDiskGridEl.dataset.folderId = currentFolder?.id || "";

  const mode = normalizeFinderViewMode(windowViewModes.projects);
  windowViewModes.projects = mode;
  const items = sortFinderItemsForView(getProjectRootFinderItems(), mode);
  const selectedRootItem = getSelectedProjectRootItem();
  const signature = [
    activeProjectId,
    selectedFolderId,
    selectedProjectRootItemId,
    selectedChatFileId,
    selectedScrapId,
    selectedProjectCdItemId,
    mode,
    currentLanguage,
    collectionVersion(items),
  ].join("::");
  if (shouldSkipRender("projectDisks", signature)) return;
  const fragment = document.createDocumentFragment();
  projectDiskGridEl.replaceChildren();
  if (projectDiskCountEl) projectDiskCountEl.textContent = t("items_count", items.length);
  if (selectedProjectLabelEl) {
    selectedProjectLabelEl.textContent = selectedRootItem
      ? t("finder_selected_item", selectedRootItem.name)
      : t("finder_no_selection");
  }

  if (!items.length) {
    const empty = document.createElement("button");
    empty.type = "button";
    empty.className = "finder-empty-object project-empty-object";
    empty.innerHTML = `${renderSystemIcon("projectDisk", { size: "mini" })}<b>${escapeHtml(t("project_disk_empty_title"))}</b><small>${escapeHtml(t("project_disk_empty_hint"))}</small>`;
    empty.addEventListener("click", () => handleAction("open-import-utility"));
    projectDiskGridEl.append(empty);
    updateFinderViewButtons(getWindow("projects"), mode);
    setFinderViewClasses(projectDiskGridEl, mode);
    return;
  }

  updateFinderViewButtons(getWindow("projects"), mode);
  setFinderViewClasses(projectDiskGridEl, mode);
  if (isFinderListMode(mode)) {
    const header = document.createElement("div");
    header.className = "finder-list-header";
    header.innerHTML = `
      <span>${t("file_name")}</span>
      <span>${t("kind")}</span>
      <span>${t("size")}</span>
      <span>${t("modified")}</span>
    `;
    fragment.append(header);
    let previousKind = "";
    items.forEach((item) => {
      const kind = getFinderItemKindLabel(item);
      if (mode === "kind" && kind !== previousKind) {
        const group = document.createElement("div");
        group.className = "finder-list-group";
        group.textContent = kind;
        fragment.append(group);
        previousKind = kind;
      }
      fragment.append(renderProjectRootListItem(item, project, mode, items));
    });
  } else {
    items.forEach((item) => fragment.append(renderProjectRootIconItem(item, items)));
  }
  projectDiskGridEl.append(fragment);
}

function renderProjectReferences() {
  updateProjectDiskActionVisibility();
}

function getProjectReferenceText(reference) {
  if (!reference) return "";
  return reference.body || (reference.chunks || []).map((chunk) => chunk.content).join("\n\n---\n\n");
}

function getProjectReferenceFinderItem(reference) {
  const text = getProjectReferenceText(reference);
  const updatedAt = reference.updatedAt || reference.createdAt || new Date().toISOString();
  const sizeLabel = getFinderItemSizeLabel({ sizeValue: text.length });
  const citationCount = typeof getCitingDraftsForReference === "function"
    ? getCitingDraftsForReference(reference.id).length
    : 0;
  const citationLabel = citationCount > 0 ? t("reference_cited_in_n", citationCount) : "";
  // Citation count goes first so it survives the grid view's truncation.
  const meta = [citationLabel, sizeLabel].filter(Boolean).join(" · ");
  const metaHtml = citationCount > 0
    ? `<span class="finder-citation-jump" data-citation-jump-key="reference:${escapeHtml(reference.id)}" role="button" tabindex="0">${escapeHtml(citationLabel)}</span>${sizeLabel ? ` · ${escapeHtml(sizeLabel)}` : ""}`
    : "";
  return {
    id: reference.id,
    projectId: reference.projectId,
    type: "projectReference",
    name: reference.name,
    body: text,
    kindLabel: t("project_sources"),
    iconClass: "text-file-icon",
    iconId: "document",
    sizeValue: text.length,
    meta,
    metaHtml,
    updatedAt,
    modifiedAt: updatedAt,
    canDuplicate: false,
    canRename: false,
    canTrash: true,
    open: () => openProjectReferenceInReader(reference),
  };
}

function openProjectReferenceInReader(reference) {
  if (!reference) return;
  const body = getProjectReferenceText(reference);
  if (!body.trim()) {
    setStatus(t("reader_file_unavailable"));
    return;
  }
  selectedProjectReferenceId = reference.id;
  const tab = upsertDocumentTab("reader", "source_view", {
    title: reference.name,
    backing: { type: "projectReference", id: reference.id },
    state: {
      kind: "projectReference",
      title: reference.name,
      text: body,
      source: `${t("project_disk")}: ${reference.name}`,
    },
  });
  if (tab) openReaderDocumentTab(tab.id);
  openWindow("reader");

  const citations = typeof getCitingDraftsForReference === "function"
    ? getCitingDraftsForReference(reference.id)
    : [];
  if (citations.length) {
    const labels = citations
      .map((hit) => hit.sectionTitle || hit.surfaceLabel)
      .filter(Boolean);
    if (labels.length) setStatus(t("reference_cited_in_list", labels.join("; ")));
  }
}

function openSelectedProjectReference() {
  const reference = projectReferences.find((item) =>
    item.id === selectedProjectReferenceId && item.projectId === activeProjectId
  );
  if (!reference) {
    setStatus(t("no_reference_selected"));
    return;
  }

  selectedChatFileId = null;
  openTeachTextStateInTab({
    title: reference.name,
    backing: { type: "projectReference", id: reference.id },
    state: {
      name: reference.name.replace(/\.(txt|md|csv|json|js|ts|html|css|xml|log)$/i, ""),
      folder: preferredFolderName(),
      body: getProjectReferenceText(reference),
      statusKey: "viewing_reference",
    },
  });
}

async function moveProjectReferencesToTrash(referenceIds) {
  const ids = Array.from(new Set(referenceIds || []));
  if (!ids.length) return;

  const targets = ids
    .map((id) => projectReferences.find((reference) => reference.id === id && reference.projectId === activeProjectId))
    .filter(Boolean);
  if (!targets.length) return;

  // Pre-delete citation warning: surface where each will leave orphans.
  if (typeof getCitingDraftsForReference === "function" && typeof showSystemModal === "function") {
    const cited = targets
      .map((reference) => {
        const hits = getCitingDraftsForReference(reference.id);
        return { reference, hits };
      })
      .filter((entry) => entry.hits.length > 0);

    if (cited.length) {
      const summary = cited.map(({ reference, hits }) => {
        const placeLabels = hits
          .map((hit) => hit.sectionTitle || hit.surfaceLabel)
          .filter(Boolean);
        const places = placeLabels.length ? placeLabels.join("、") : t("section_drafts");
        return t("reference_trash_warning_item", reference.name, hits.length, places);
      }).join("\n");
      const result = await showSystemModal(t("reference_trash_warning_message", summary), "confirm");
      if (result !== "yes") {
        setStatus(t("reference_trash_cancelled"));
        return;
      }
    }
  }

  const movedNames = [];
  for (const reference of targets) {
    const index = projectReferences.indexOf(reference);
    if (index === -1) continue;
    projectReferences.splice(index, 1);
    if (typeof purgeContextForTrashedItems === "function") {
      purgeContextForTrashedItems([{ type: "projectReference", id: reference.id, item: reference }]);
    }
    trashItems.unshift({
      projectId: activeProjectId,
      title: reference.name,
      body: getProjectReferenceText(reference),
      originalPath: [projectDisplayName(getActiveProject()), t("project_sources")].filter(Boolean).join(" / "),
      originalType: "projectReference",
      originalData: reference,
    });
    try {
      await deleteStoredProjectReference(reference.id);
    } catch (error) {
      setStatus(t("project_reference_error", error.message));
    }
    movedNames.push(reference.name);
  }

  if (selectedProjectReferenceId && !projectReferences.some((reference) => reference.id === selectedProjectReferenceId)) {
    selectedProjectReferenceId = projectReferences[0]?.id || null;
  }
  saveDeskState();
  renderProjectDisks();
  renderTrash();
  playSystemSound("trash");
  if (movedNames.length === 1) {
    setStatus(t("project_reference_moved_trash", movedNames[0]));
  } else if (movedNames.length > 1) {
    setStatus(t("project_references_moved_trash", movedNames.length));
  }
}

async function loadActiveProjectReferences() {
  const projectId = activeProjectId;
  removeProjectReferenceChunks();
  projectReferences.length = 0;
  selectedProjectReferenceId = null;
  renderProjectReferences();

  if (!isProjectMounted || !projectId) {
    renderMountedTextDisk();
    updateMenuState();
    return;
  }

  try {
    const references = await getStoredProjectReferences(projectId);
    if (projectId !== activeProjectId) return;

    references
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
      .forEach((reference) => projectReferences.push(reference));

    selectedProjectReferenceId = projectReferences[0]?.id || null;
    mountProjectReferenceChunks();
    renderProjectReferences();
    renderMountedTextDisk();
    updateMenuState();

    if (projectReferences.length) {
      setStatus(t("project_reference_loaded", projectReferences.length));
    }
  } catch (error) {
    setStatus(t("project_reference_error", error.message));
  }
}

function closeProjectScopedWindows() {
  [
    "documents",
    "chatFile",
    "teachText",
    "scrapbook",
    "trash",
    "contextPanel",
    "textDisk",
    "reader",
    "questionSheet",
    "outline",
    "sectionDrafts",
    "reviewDesk",
    "projectCd",
    "imageManager",
    "findFile",
    "printDirectory",
    "pageSetup",
    "rebuildFlow",
    "docMap",
    "dictionary",
  ].forEach(closeWindow);
}

function parkConversationInProject(projectId) {
  if (!conversation.length || !projectId) return;

  if (projectId === activeProjectId && getActiveProject()) {
    ensureCurrentConversationFile();
    persistActiveChatFile();
  }
  conversation.length = 0;
  activeChatFileId = null;
  compressedConversationMemory = { text: "", sourceMessages: 0, updatedAt: "" };
  if (typeof renderClioTalkRunAssembly === "function") renderClioTalkRunAssembly();
}

function resetAssistantForProject(projectName) {
  messagesEl.replaceChildren();
  renderClioTalkWelcome();
  lastAssistantText = "";
  lastUserText = "";
  setStatus(t("project_opened", projectName));
  if (typeof renderClioTalkRunAssembly === "function") renderClioTalkRunAssembly();
  updateMenuState();
}

function clearProjectTransientState() {
  activeTextFileId = null;
  teachTextFileLabel = "";
  setTeachTextWorkflowState("");
  selectedChatFileId = null;
  selectedScrapId = null;
  selectedScrapIds.clear();
  selectedProjectReferenceId = null;
  selectedProjectCdItemId = null;
  selectedProjectCdItemIds.clear();
  lastClipScrapId = null;
  lastRetrievedContextItems = [];
  claimCitationContextItems = [];
  currentReaderPage = null;
  currentReaderClipCount = 0;
  setReaderWindowTitle();
  readerUrlDisplayEl.textContent = "";
  readerStatusEl.textContent = t("reader_empty_hint");
  attachedClipIds.clear();
  renderAttachedClips();
}
