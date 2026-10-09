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
  let watcher = null;
  let options = {};
  let previewEl = null;
  let titleEl = null;
  let previewTicket = 0;
  let leaveTimer = null;
  const project = () => (typeof windowBrowseEntries === "function" ? windowBrowseEntries() : [])
    .filter((entry) => (!options.appId || entry.appId === options.appId) && (!options.filterEntries || options.filterEntries(entry)));
  function hoverLeave(anchor) {
    if (!options.hover || (anchor && anchor !== options.anchor)) return;
    clearTimeout(leaveTimer);
    // WindowShade's Dock panel lingers 180 ms after the pointer leaves, so a
    // path from the icon to a card never closes it on the way.
    leaveTimer = setTimeout(() => close({ returnFocus: false }), 180);
  }
  function closeHover(anchor) {
    if (options.hover && (!anchor || options.anchor === anchor)) close({ returnFocus: false });
  }
  function positionAtAnchor() {
    if (!host?.isConnected || !panelEl || !options.anchor?.isConnected) return;
    const anchor = options.anchor.getBoundingClientRect();
    const panel = panelEl.getBoundingClientRect();
    const outer = host.getBoundingClientRect();
    // The Dock's window cards stand centred over the icon they belong to; a
    // Dock down the right edge (NeXTSTEP's) has them beside the icon instead,
    // so the panel never covers the tile it came from.
    const cards = options.hover || options.cards;
    const sideDock = cards && anchor.left > window.innerWidth - 160 && anchor.top - panel.height - 8 < 8;
    const preferredLeft = sideDock ? anchor.left - panel.width - 8
      : cards ? anchor.left + anchor.width / 2 - panel.width / 2 : anchor.left;
    const preferredTop = sideDock ? anchor.top : anchor.top - panel.height - 8;
    const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - panel.width - 8));
    const top = Math.max(8, Math.min(preferredTop, window.innerHeight - panel.height - 8));
    // Use the painted panel, not the spanning menu host. Account for any
    // theme-specific inset between the host origin and the popover.
    host.style.left = `${left - (panel.left - outer.left)}px`;
    host.style.top = `${top - (panel.top - outer.top)}px`;
  }
  async function showPreview(entry) {
    const ticket = ++previewTicket;
    if (!previewEl) return;
    previewEl.replaceChildren();
    if (!entry) return;
    const caption = document.createElement("span");
    caption.textContent = entry.title;
    previewEl.append(caption);
    try {
      if (!window.AISystem6WindowPreview) {
        if (typeof ensureWindowPreviewModule === "function") await ensureWindowPreviewModule();
        else await ensureLazySystemModule("app/core/window-preview.js", "AISystem6WindowPreviewLoaded");
      }
      if (ticket !== previewTicket || !previewEl) return;
      const win = typeof getWindow === "function" ? getWindow(entry.name) : null;
      const picture = await window.AISystem6WindowPreview.get(win);
      if (ticket !== previewTicket || !previewEl) return;
      if (picture.url) {
        const image = document.createElement("img");
        const reposition = () => { if (ticket === previewTicket) positionAtAnchor(); };
        image.addEventListener("load", reposition);
        image.addEventListener("error", reposition);
        image.alt = entry.title;
        image.src = picture.url;
        previewEl.prepend(image);
      }
      caption.textContent = `${entry.title} — ${label(picture.unavailable ? "window_preview_unavailable" : picture.stale ? "window_preview_previous" : "window_preview_current")}`;
      positionAtAnchor();
    } catch (_) { if (ticket === previewTicket) { caption.textContent = `${entry.title} — ${label("window_preview_unavailable")}`; positionAtAnchor(); } }
  }

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
    ++previewTicket;
    ++pictureTicket;
    clearTimeout(leaveTimer);
    options.anchor?.classList?.remove("is-window-cards-anchor");
    previewEl = null;
    titleEl = null;
    host?.remove();
    watcher?.disconnect();
    watcher = null;
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
      row.tabIndex = index === cursor ? 0 : -1;
      row.id = `window-browse-option-${encodeURIComponent(entry.name)}`;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(index === cursor));
      row.dataset.windowBrowseName = entry.name;
      row.textContent = `${entry.appLabel} — ${entry.title}${stateSuffix(entry)}`;
      if (index === cursor) row.setAttribute("aria-current", "true");
      row.addEventListener("click", () => commit(entry.name));
      row.addEventListener("focus", () => {
        cursor = index;
        listEl.querySelectorAll("button").forEach((item) => {
          const selected = item === row;
          item.tabIndex = selected ? 0 : -1;
          item.setAttribute("aria-selected", String(selected));
          if (selected) item.setAttribute("aria-current", "true"); else item.removeAttribute("aria-current");
        });
        searchEl?.setAttribute("aria-activedescendant", row.id);
        showPreview(entry);
      });
      return row;
    }));
    const active = listEl.querySelector('[aria-current="true"]');
    if (active) searchEl?.setAttribute("aria-activedescendant", active.id);
    else searchEl?.removeAttribute("aria-activedescendant");
    active?.scrollIntoView?.({ block: "nearest" });
    showPreview(rows[cursor]);
  }

  function refresh() {
    const selected = visibleEntries()[cursor]?.name;
    entries = project();
    if (options.hover || options.cards) { renderCards(); return; }
    cursor = Math.max(0, visibleEntries().findIndex((entry) => entry.name === selected));
    render();
    // Only a list the writer asked for reports that it is empty; a Dock hover
    // over an app with no windows simply shows nothing.
    if (!entries.length && typeof setStatus === "function") setStatus(label("window_browse_none"));
  }

  // ---- Dock window cards -------------------------------------------------
  // Hovering a Dock icon shows that app's windows as cards: a picture, the
  // title, and a state line only when there is a state to say (WindowShade's
  // window browsing: the panel is for looking, nothing moves until a card is
  // clicked, and a window put away keeps the picture it had, labelled, rather
  // than being woken to be photographed). No search field: that belongs to
  // the list the Window menu opens.
  let pictureTicket = 0;

  function cardState(entry, picture) {
    const parts = [];
    if (entry.state !== "open") {
      const mark = label(`window_state_${entry.state.replace(/-/g, "_")}`);
      if (mark) parts.push(mark);
    }
    if (entry.pinned) parts.push(label("window_browse_pinned"));
    if (picture?.unavailable) parts.push(label("window_preview_unavailable"));
    else if (picture?.stale && entry.state !== "open") parts.push(label("window_preview_previous"));
    return parts.join(" · ");
  }

  function buildCard(entry) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "window-card";
    card.dataset.windowBrowseName = entry.name;
    card.setAttribute("role", "listitem");
    const picture = document.createElement("span");
    picture.className = "window-card-picture";
    picture.setAttribute("aria-hidden", "true");
    const title = document.createElement("span");
    title.className = "window-card-title";
    const state = document.createElement("span");
    state.className = "window-card-state";
    card.append(picture, title, state);
    card.addEventListener("click", () => commit(entry.name));
    return updateCard(card, entry);
  }

  function updateCard(card, entry, picture = null) {
    card.querySelector(".window-card-title").textContent = entry.title;
    const state = cardState(entry, picture);
    const stateEl = card.querySelector(".window-card-state");
    stateEl.textContent = state;
    stateEl.hidden = !state;
    card.setAttribute("aria-label", state ? `${entry.title}, ${state}` : entry.title);
    return card;
  }

  function renderCards() {
    if (!listEl) return;
    if (titleEl) titleEl.textContent = entries[0]?.appLabel || "";
    panelEl.dataset.cardCount = String(Math.min(entries.length, 5));
    const existing = new Map([...listEl.children].map((node) => [node.dataset.windowBrowseName, node]));
    listEl.replaceChildren(...entries.map((entry) => {
      const card = existing.get(entry.name);
      return card ? updateCard(card, entry) : buildCard(entry);
    }));
    fillCardPictures();
    positionAtAnchor();
  }

  // Arrow keys walk the cards by the grid's real columns; Return or Space
  // chooses (the card is a button); Escape puts the panel away.
  function onCardsKeydown(event) {
    event.stopPropagation?.();
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    const cards = [...(listEl?.querySelectorAll(".window-card") || [])];
    const at = cards.indexOf(document.activeElement);
    if (at < 0) return;
    const columns = Math.max(1, Number(getComputedStyle(listEl).gridTemplateColumns.split(" ").filter(Boolean).length) || 1);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key];
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      cards[event.key === "Home" ? 0 : cards.length - 1].focus();
    } else if (step) {
      event.preventDefault();
      cards[Math.max(0, Math.min(cards.length - 1, at + step))].focus();
    }
  }

  // At most two pictures are taken at once, the rest wait their turn; a
  // closed or re-opened panel abandons the queue (WindowShade's thumbnail
  // service: two real captures in flight, one request per window).
  async function fillCardPictures() {
    const ticket = ++pictureTicket;
    try {
      if (!window.AISystem6WindowPreview) {
        if (typeof ensureWindowPreviewModule === "function") await ensureWindowPreviewModule();
        else await ensureLazySystemModule("app/core/window-preview.js", "AISystem6WindowPreviewLoaded");
      }
    } catch (_) { return; }
    const queue = entries.slice();
    const worker = async () => {
      while (queue.length && ticket === pictureTicket && listEl) {
        const entry = queue.shift();
        const card = [...listEl.children].find((node) => node.dataset.windowBrowseName === entry.name);
        if (!card || card.dataset.pictured === "true") continue;
        const win = typeof getWindow === "function" ? getWindow(entry.name) : null;
        let picture = { url: null, stale: false, unavailable: true };
        try { picture = await window.AISystem6WindowPreview.get(win); } catch (_) { /* labelled unavailable below */ }
        if (ticket !== pictureTicket || !card.isConnected) return;
        const frame = card.querySelector(".window-card-picture");
        if (picture.url) {
          const image = document.createElement("img");
          image.alt = "";
          const reposition = () => { if (ticket === pictureTicket) positionAtAnchor(); };
          image.addEventListener("load", reposition);
          image.addEventListener("error", reposition);
          image.src = picture.url;
          frame.replaceChildren(image);
        }
        card.dataset.pictured = "true";
        updateCard(card, entry, picture);
      }
    };
    await Promise.all([worker(), worker()]);
    if (ticket === pictureTicket) positionAtAnchor();
  }

  function commit(name) {
    // Restoring raises the window it names; binding is closed first so the
    // list's own focus rules never fight the restored window.
    const returnTarget = previousFocus;
    const select = options.onSelect;
    close({ returnFocus: false });
    if (select) { select(name); return; }
    if (typeof restoreWindowBrowseEntry === "function" && !restoreWindowBrowseEntry(name)) {
      returnTarget?.focus?.({ preventScroll: true });
    }
  }

  function moveCursor(delta) {
    const rows = [...(listEl?.querySelectorAll("button") || [])];
    if (!rows.length) return;
    cursor = Math.max(0, Math.min(cursor + delta, rows.length - 1));
    // Arrow selection moves the list cursor only: it must not reorder or raise
    // any window. Enter is the single commit.
    const rowFocused = document.activeElement?.getAttribute?.("role") === "option";
    render();
    if (rowFocused) listEl?.querySelector('[aria-current="true"]')?.focus();
  }

  function onKeydown(event) {
    // This surface owns its keyboard interaction; the generic menu navigator
    // must not move the combobox caret to a preview button (including IME keys).
    event.stopPropagation?.();
    // An IME composing a search term owns the keys: never treat its Enter or
    // arrows as list navigation.
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === " " && event.target?.getAttribute?.("role") === "option") {
      event.preventDefault();
      panelEl.classList.toggle("is-preview-expanded");
      positionAtAnchor();
      return;
    }
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

  function open(settings = {}) {
    const { returnFocus = document.activeElement } = settings;
    close({ returnFocus: false });
    options = settings;
    if (settings.hover && typeof hideBalloonHelp === "function") hideBalloonHelp();
    previousFocus = returnFocus;
    host = document.createElement("div");
    host.className = "menu is-open window-browse-menu";
    host.dataset.windowBrowseMenu = "true";
    if (options.anchor) {
      host.style.right = "auto";
      host.style.width = "max-content";
      host.style.maxWidth = "calc(100vw - 16px)";
    }
    panelEl = document.createElement("div");
    panelEl.className = "menu-popover window-browse-popover";
    panelEl.setAttribute("role", "region");
    panelEl.setAttribute("aria-label", label("window_browse"));
    if (options.hover || options.cards) {
      panelEl.classList.add("window-cards");
      titleEl = document.createElement("div");
      titleEl.className = "window-cards-title";
      listEl = document.createElement("div");
      listEl.className = "window-cards-grid";
      listEl.setAttribute("role", "list");
      panelEl.append(titleEl, listEl);
      panelEl.addEventListener("pointerenter", () => clearTimeout(leaveTimer));
      panelEl.addEventListener("pointerleave", () => hoverLeave());
      panelEl.addEventListener("keydown", onCardsKeydown);
      host.append(panelEl);
      document.body.append(host);
      document.addEventListener("pointerdown", onDocumentPointerDown, true);
      window.addEventListener("blur", onViewportChange);
      window.addEventListener("resize", onViewportChange);
      refresh();
      if (!entries.length) { close({ returnFocus: false }); return false; }
      options.anchor?.classList?.add("is-window-cards-anchor");
      watchEntries();
      positionAtAnchor();
      // Show All Windows is asked for, so it takes the keyboard; the hover
      // form never does.
      if (options.cards) listEl.querySelector(".window-card")?.focus();
      return true;
    }
    searchEl = document.createElement("input");
    searchEl.type = "search";
    searchEl.className = "window-browse-search";
    searchEl.setAttribute("aria-label", label("window_browse_search"));
    searchEl.setAttribute("role", "combobox");
    searchEl.setAttribute("aria-autocomplete", "list");
    searchEl.setAttribute("aria-expanded", "true");
    searchEl.setAttribute("aria-controls", "window-browse-options");
    searchEl.addEventListener("input", () => { cursor = 0; render(); });
    listEl = document.createElement("div");
    listEl.className = "window-browse-list";
    listEl.id = "window-browse-options";
    listEl.setAttribute("role", "listbox");
    listEl.setAttribute("aria-label", label("window_browse"));
    previewEl = document.createElement("button");
    previewEl.type = "button";
    previewEl.className = "window-browse-preview";
    previewEl.setAttribute("aria-label", label("window_preview_restore"));
    previewEl.addEventListener("click", () => { const entry = visibleEntries()[cursor]; if (entry) commit(entry.name); });
    panelEl.append(searchEl, listEl, previewEl);
    panelEl.addEventListener("pointerenter", () => clearTimeout(leaveTimer));
    panelEl.addEventListener("pointerleave", () => hoverLeave());
    panelEl.addEventListener("keydown", onKeydown);
    host.append(panelEl);
    document.body.append(host);
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    window.addEventListener("blur", onViewportChange);
    window.addEventListener("resize", onViewportChange);
    refresh();
    watchEntries();
    positionAtAnchor();
    searchEl.focus();
    return true;
  }

  function watchEntries() {
    watcher = new MutationObserver(() => {
      if (!host) return;
      if (options.hover && options.anchor && !options.anchor.isConnected) { close({ returnFocus: false }); return; }
      const fresh = project();
      if (JSON.stringify(fresh) !== JSON.stringify(entries)) refresh();
    });
    watcher.observe(document.querySelector(".desktop") || document.body, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["class", "data-window-pinned"],
    });
  }

  globalThis.AISystem6WindowBrowse = Object.freeze({
    open,
    close: (options) => close(options),
    refresh,
    hoverLeave,
    closeHover,
    entries: () => entries.slice(),
  });
  window.AISystem6WindowBrowseLoaded = true;
})();
