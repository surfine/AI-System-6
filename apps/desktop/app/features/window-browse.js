// WM5 — Window Browse: one list of every open window across applications, with
// the state each real window reports, and the matching way back.
//
// Lazy module: windowshade-entry loads it on the "All Windows" command, so the
// boot disk never pays for it. The projection lives in multi-finder
// (windowBrowseEntries / restoreWindowBrowseEntry) — this file is only the
// surface. It adds no second runningApps copy and no window state of its own.
(() => {
  if (window.AISystem6WindowBrowseLoaded) return;

  let host = null;
  let panelEl = null;
  let searchEl = null;
  let listEl = null;
  let entries = [];
  let cursor = 0;
  let previousFocus = null;

  const label = (key) => (typeof t === "function" ? t(key) : key);
  const isOpen = () => !!host;

  function restoreFocus() {
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  function close({ returnFocus = true } = {}) {
    if (isOpen()) {
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      window.removeEventListener("blur", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
    }
    host?.remove();
    host = null;
    panelEl = null;
    searchEl = null;
    listEl = null;
    if (returnFocus) restoreFocus();
    else previousFocus = null;
    return true;
  }

  // The state is shown as a plain-text suffix, never as HTML, so a document
  // title can never become markup.
  function stateSuffix(entry) {
    const parts = [];
    if (entry.state !== "open") {
      const mark = label(`window_state_${entry.state.replace(/-/g, "_")}`);
      if (mark) parts.push(mark);
    }
    if (entry.pinned) parts.push(label("window_browse_pinned"));
    return parts.length ? ` — ${parts.join(", ")}` : "";
  }

  function visibleEntries() {
    const query = (searchEl?.value || "").trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => `${entry.appLabel} ${entry.title}`.toLowerCase().includes(query));
  }

  function render() {
    if (!listEl) return;
    const rows = visibleEntries();
    if (cursor >= rows.length) cursor = Math.max(0, rows.length - 1);
    listEl.replaceChildren(...rows.map((entry, index) => {
      const row = document.createElement("button");
      row.type = "button";
      row.tabIndex = -1;
      row.setAttribute("role", "menuitem");
      row.dataset.windowBrowseName = entry.name;
      row.textContent = `${entry.appLabel} — ${entry.title}${stateSuffix(entry)}`;
      if (index === cursor) row.setAttribute("aria-current", "true");
      row.addEventListener("click", () => commit(entry.name));
      return row;
    }));
    const active = listEl.querySelector('[aria-current="true"]');
    listEl.setAttribute("aria-activedescendant", active?.dataset.windowBrowseName || "");
  }

  function refresh() {
    entries = typeof windowBrowseEntries === "function" ? windowBrowseEntries() : [];
    cursor = 0;
    render();
    if (!entries.length && typeof setStatus === "function") setStatus(label("window_browse_none"));
  }

  function commit(name) {
    // Restoring raises the window it names; binding is closed first so the
    // list's own focus rules never fight the restored window.
    close({ returnFocus: false });
    if (typeof restoreWindowBrowseEntry === "function") restoreWindowBrowseEntry(name);
  }

  function moveCursor(delta) {
    const rows = [...(listEl?.querySelectorAll("button") || [])];
    if (!rows.length) return;
    cursor = Math.max(0, Math.min(cursor + delta, rows.length - 1));
    // Arrow selection moves the list cursor only: it must not reorder or raise
    // any window. Enter is the single commit.
    render();
    rows[cursor]?.focus();
  }

  function onKeydown(event) {
    // An IME composing a search term owns the keys: never treat its Enter or
    // arrows as list navigation.
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === "Enter") {
      event.preventDefault();
      listEl?.querySelector('[aria-current="true"]')?.click();
      return;
    }
    if (event.key === "ArrowDown") { event.preventDefault(); moveCursor(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveCursor(-1); }
    else if (event.key === "Home") { event.preventDefault(); cursor = 0; render(); }
    else if (event.key === "End") { event.preventDefault(); cursor = visibleEntries().length - 1; render(); }
  }

  function onDocumentPointerDown(event) {
    if (host && !host.contains(event.target)) close();
  }
  function onViewportChange() { if (isOpen()) close({ returnFocus: false }); }

  function open() {
    close({ returnFocus: false });
    previousFocus = document.activeElement;
    host = document.createElement("div");
    host.className = "menu is-open window-browse-menu";
    host.dataset.windowBrowseMenu = "true";
    panelEl = document.createElement("div");
    panelEl.className = "menu-popover window-browse-popover";
    panelEl.setAttribute("role", "menu");
    panelEl.setAttribute("aria-label", label("window_browse"));
    searchEl = document.createElement("input");
    searchEl.type = "search";
    searchEl.className = "window-browse-search";
    searchEl.setAttribute("aria-label", label("window_browse_search"));
    searchEl.addEventListener("input", () => { cursor = 0; render(); });
    listEl = document.createElement("div");
    listEl.className = "window-browse-list";
    listEl.setAttribute("role", "presentation");
    panelEl.append(searchEl, listEl);
    panelEl.addEventListener("keydown", onKeydown);
    host.append(panelEl);
    document.body.append(host);
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    window.addEventListener("blur", onViewportChange);
    window.addEventListener("resize", onViewportChange);
    refresh();
    searchEl.focus();
    return true;
  }

  globalThis.AISystem6WindowBrowse = Object.freeze({
    open,
    close: (options) => close(options),
    refresh,
    entries: () => entries.slice(),
  });
  window.AISystem6WindowBrowseLoaded = true;
})();
