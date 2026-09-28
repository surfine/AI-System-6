// Floating/tear-off presentation of the existing menu declarations. Actions
// still dispatch through handleAction and revalidate the source after loading.
(() => {
  const palettes = new Map();
  let serial = 0;
  let queued = false;
  let gesture = null;
  let source = null;
  let lastOwner = "";
  const active = () => window.AISystem6Theme.getCurrentTheme() === "nextstep";
  const owner = () => menuOwnerAppId || activeAppId || "finder";
  // The Writing Flow panel belongs to the writing session: Writing Studio and
  // the tools the route summons. While any of these owns the main menu the
  // panel stays up (NeXT's Info-panel exception); any other owner hides it.
  // One definition, read by nextstep-shell.js through this module's frozen API.
  const writingFamily = new Set(["writingStudio", "teachText", "clioTalk", "reader", "searcher", "scrapbook",
    "docMap", "clioChart", "clioStage", "lightroom", "imagePromptStudio", "liquidCover", "cmfStudio",
    "clioPaint", "clioProject"]);

  // NeXTSTEP 3.3 prints the key equivalent at the right end of a menu row. The
  // product's own table (actions.js's keyboardShortcutRegistry) answers for the
  // rows it covers; the application verbs Hide and Quit are not in that table,
  // so they are added here with the letters NeXTSTEP uses (Hide h, Quit q).
  const verbShortcuts = new Map([["hide-active-app", { key: "h", shift: false }],
    ["quit-active-app", { key: "q", shift: false }]]);
  function keyEquivalent(action) {
    if (!action) return "";
    const verb = verbShortcuts.get(action);
    if (verb) return verb.shift ? verb.key.toUpperCase() : verb.key;
    const registry = typeof keyboardShortcutRegistry !== "undefined" ? keyboardShortcutRegistry : null;
    const entry = registry?.find((shortcut) => shortcut.action === action);
    if (!entry?.key || entry.key.length !== 1 || !/[a-z0-9]/i.test(entry.key)) return "";
    return entry.shift ? entry.key.toUpperCase() : entry.key;
  }

  // The root main menu palette's real rectangle, for the panel that hangs under
  // it and for window-manager.js's left inset. Null when there is nothing to
  // hang under: no palette for this owner, or it is hidden.
  function rootRect() {
    const node = palettes.get(`${owner()}:root`)?.node;
    if (!node || node.hidden) return null;
    return node.getBoundingClientRect();
  }

  function context() {
    const target = document.activeElement;
    const win = resolveMenuContextWindow();
    const projectId = getActiveProject()?.id;
    const finderIdentity = () => {
      if (!["projects", "documents", "finder", "trash"].includes(win?.dataset.window)) return "";
      const item = getActiveItem();
      return JSON.stringify([item?.id, item?.type, [...selectedDocumentItemKeys].sort()]);
    };
    const finderSelection = finderIdentity();
    const tabId = typeof getActiveDocumentTab === "function" ? getActiveDocumentTab("teachText")?.id : "";
    const selection = getSelectionServiceContext();
    const reader = selection?.surface === "reader" ? currentReaderPage : null;
    const browserSelection = window.getSelection();
    const range = browserSelection?.rangeCount ? browserSelection.getRangeAt(0).cloneRange() : null;
    const isCurrent = () => (!win || (win.isConnected && !win.classList.contains("is-hidden")))
      && projectId === getActiveProject()?.id && finderSelection === finderIdentity()
      && (!reader || reader === currentReaderPage)
      && tabId === (typeof getActiveDocumentTab === "function" ? getActiveDocumentTab("teachText")?.id : "");
    const selectionCurrent = () => isCurrent() && (!selection?.inputTarget
      || selection.inputTarget.value.slice(selection.start, selection.end).trim() === selection.text.trim());
    return { target, win, range, isCurrent,
      selection: selection ? Object.freeze({ ...selection, projectId, isCurrent: selectionCurrent,
        source: selection.source ? Object.freeze({ ...selection.source }) : null }) : null };

  }

  function workspaceItems() {
    // NeXTSTEP's way back to the Writing Flow is Tools ▸ Writing Flow..., so the
    // Apple-menu row that serves every other era is not repeated here.
    return Array.from(document.querySelectorAll(".apple-menu-popover > [data-action]"))
      .filter((node) => node.dataset.action !== "show-writing-flow")
      .map((node) => menuItem(node.dataset.action, node.dataset.i18n || node.textContent));
  }

  function rootItems(appId) {
    return [
      submenu("nextstep_workspace", workspaceItems()),
      ...menuSetForApp(appId).map((definition) => ({ ...definition, type: "submenu" })),
      ...(writingFamily.has(appId)
        ? [submenu("nextstep_tools", [menuItem("nextstep-writing-flow", "nextstep_writing_flow_command")])]
        : []),
      submenu("selection_services", selectionTools),
      submenu("nextstep_windows", [
        menuItem("nextstep-zoom-window", "nextstep_zoom"),
        menuItem("nextstep-shade-window", "nextstep_shade"),
        ...applicationWindowOrder(appId).map((win) => ({ type: "window", win, label: applicationWindowTitle(win) })),
      ]),
      menuSeparator,
      ...applicationVerbRows().map((node) => node.dataset.action ? menuItem(node.dataset.action, node.textContent) : menuSeparator),
    ];
  }

  function currentItems(palette) {
    let items = rootItems(palette.owner);
    for (const part of palette.path.split("/").slice(1)) {
      const definition = items.find((item, index) => String(item.id || item.labelKey || index) === part);
      if (!definition?.items) return [];
      palette.title.textContent = t(definition.labelKey);
      items = definition.items;
    }
    return items;
  }

  function buttons(palette) {
    return Array.from(palette.body.querySelectorAll(":scope > button:not(:disabled)"));
  }

  // The root main menu sits at (-1,-1) so its 1px border falls off-screen and
  // (0,0) is the white highlight (NeXTSTEP 3.3 capture B3): every other palette
  // keeps the desk's own (0,0) lower bound.
  function place(palette, x, y) {
    const rect = palette.node.getBoundingClientRect();
    const floor = palette.path === "root" ? -1 : 0;
    palette.x = Math.max(floor, Math.min(x, innerWidth - rect.width));
    palette.y = Math.max(floor, Math.min(y, innerHeight - Math.min(rect.height, innerHeight)));
    palette.node.style.left = `${palette.x}px`;
    palette.node.style.top = `${palette.y}px`;
  }

  function children(palette) {
    return Array.from(palettes.values()).filter((entry) => entry.parent === palette && !entry.detached);
  }

  function remove(palette) {
    children(palette).forEach(remove);
    palette.node.remove();
    palettes.delete(palette.key);
  }

  function detach(palette) {
    if (!palette.parent || palette.detached) return;
    palette.detached = true;
    palette.node.dataset.detached = "true";
    palette.close.hidden = false;
    palette.parent = null;
  }

  function closeAttached() {
    Array.from(palettes.values()).filter((entry) => entry.parent && !entry.detached).forEach(remove);
  }

  function refreshAvailability(palette) {
    const availability = getActionAvailability();
    palette.body.querySelectorAll("[data-nextstep-action]").forEach((button) => {
      const action = button.dataset.nextstepAction;
      button.disabled = availability[action] === false || !isWorkspaceActionAllowed(action);
      button.setAttribute("aria-disabled", String(button.disabled));
    });
  }

  async function invoke(item, snapshot = source || context()) {
    closeAttached();
    if (!snapshot.isCurrent()) return;
    if (item.type === "window") {
      focusWindow(item.win, true);
      return;
    }
    if (snapshot.target?.isConnected) snapshot.target.focus({ preventScroll: true });
    const input = snapshot.selection?.inputTarget;
    if (input?.isConnected && typeof snapshot.selection.start === "number") input.setSelectionRange(snapshot.selection.start, snapshot.selection.end);
    if (!input && snapshot.range?.startContainer.isConnected) {
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(snapshot.range);
    }
    await handleAction(item.action, { selection: snapshot.selection, isCurrent: snapshot.isCurrent });
    schedule();
  }

  function expand(palette, item, index, trigger) {
    children(palette).forEach(remove);
    const path = `${palette.path}/${item.id || item.labelKey || index}`;
    const key = `${palette.owner}:${path}`;
    const previous = palettes.get(key);
    const actualKey = previous?.detached ? `${key}:temporary:${++serial}` : key;
    const child = create(actualKey, palette.owner, path, t(item.labelKey), item.items, palette);
    child.source = palette.source || source || context();
    child.trigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    const parentRect = palette.node.getBoundingClientRect();
    // Every 3.3 submenu opens with its first row level with the main menu's own
    // title (top at the parent palette's top), never at the clicked row.
    place(child, parentRect.right, parentRect.top);
    return child;
  }

  function render(palette, items) {
    palette.body.replaceChildren();
    items.forEach((item, index) => {
      if (item.type === "separator") { palette.body.append(document.createElement("hr")); return; }
      if (!["item", "submenu", "window"].includes(item.type)) {
        const fragment = renderApplicationMenuItem(item);
        const container = document.createElement("div"); container.append(fragment);
        Array.from(container.querySelectorAll("[data-action]")).forEach((node) => {
          const action = node.dataset.action;
          node.removeAttribute("data-action");
          node.dataset.nextstepAction = action;
          node.setAttribute("role", "menuitem");
          node.addEventListener("click", (event) => { event.stopPropagation(); invoke({ type: "item", action }, palette.source || source || context()); });
        });
        palette.body.append(...container.childNodes);
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      const label = item.type === "window" ? item.label : t(item.labelKey);
      button.textContent = label;
      button.setAttribute("aria-label", label);
      const equivalent = keyEquivalent(item.action);
      if (equivalent) {
        const key = document.createElement("span");
        key.className = "nextstep-key";
        key.setAttribute("aria-hidden", "true");
        key.textContent = equivalent;
        button.append(key);
      }
      if (item.action) button.dataset.nextstepAction = item.action;
      if (item.type === "submenu") {
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
      }
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (gesture?.suppressClick) { gesture = null; return; }
        if (item.type === "submenu") expand(palette, item, index, button);
        else invoke(item, palette.source || source || context());
      });
      button.addEventListener("pointerenter", () => {
        if (gesture?.kind !== "select" || button.disabled) return;
        button.focus({ preventScroll: true });
        gesture.releaseTarget = button;
        gesture.release = () => item.type === "submenu" ? expand(palette, item, index, button) : invoke(item, palette.source || source || context());
        if (item.type === "submenu") expand(palette, item, index, button);
      });
      button.addEventListener("pointerleave", () => {
        if (gesture?.releaseTarget === button) { gesture.release = null; gesture.releaseTarget = null; }
      });
      palette.body.append(button);
    });
    refreshAvailability(palette);
  }

  function create(key, appId, path, label, items, parent = null) {
    const node = document.createElement("section");
    node.className = "nextstep-menu-palette";
    node.setAttribute("aria-label", label);
    const header = document.createElement("header");
    const title = document.createElement("button");
    title.type = "button";
    title.textContent = label;
    title.title = t("nextstep_menu_move");
    const close = document.createElement("button");
    close.type = "button";
    // The torn-off palette's close box is NeXT's bevelled 15x15 X (P9); the SVG
    // is painted by CSS as the button's background, so no glyph text is set.
    close.className = "nextstep-menu-close";
    close.setAttribute("aria-label", t("close"));
    close.hidden = true;
    header.append(title, close);
    const body = document.createElement("div");
    body.setAttribute("role", "menu");
    body.setAttribute("aria-label", label);
    node.append(header, body);
    const palette = { key, owner: appId, path, node, body, title, close, parent, items, language: currentLanguage, detached: false, x: 8, y: 32 };
    palettes.set(key, palette);
    document.body.append(node);
    render(palette, items);
    close.addEventListener("click", (event) => { event.stopPropagation(); remove(palette); source?.target?.focus({ preventScroll: true }); });
    title.addEventListener("dblclick", () => detach(palette));
    title.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { detach(palette); buttons(palette)[0]?.focus(); event.preventDefault(); }
      if (event.altKey && event.key.startsWith("Arrow")) {
        event.preventDefault(); detach(palette);
        place(palette, palette.x + (event.key === "ArrowRight" ? 16 : event.key === "ArrowLeft" ? -16 : 0),
          palette.y + (event.key === "ArrowDown" ? 16 : event.key === "ArrowUp" ? -16 : 0));
      }
      if (event.key === "Home") { event.preventDefault(); place(palette, palette.path === "root" ? -1 : 0, palette.path === "root" ? -1 : 0); }
    });
    header.addEventListener("pointerdown", (event) => {
      if (event.target === close || event.button !== 0) return;
      event.preventDefault();
      source = palette.source || context();
      gesture = { kind: "drag", palette, id: event.pointerId, x: event.clientX, y: event.clientY, left: palette.x, top: palette.y };
      header.setPointerCapture(event.pointerId);
    });
    header.addEventListener("pointermove", (event) => {
      if (gesture?.kind !== "drag" || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x; const dy = event.clientY - gesture.y;
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      detach(palette);
      const oldX = palette.x; const oldY = palette.y;
      place(palette, gesture.left + dx, gesture.top + dy);
      children(palette).forEach((child) => place(child, child.x + palette.x - oldX, child.y + palette.y - oldY));
    });
    body.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      source = palette.source || context();
      refreshAvailability(palette);
      gesture = { kind: "select", id: event.pointerId, start: event.target, release: null };
    });
    body.addEventListener("keydown", (event) => {
      const choices = buttons(palette); const index = choices.indexOf(document.activeElement);
      const moves = { ArrowDown: (index + 1) % choices.length, ArrowUp: (index - 1 + choices.length) % choices.length, Home: 0, End: choices.length - 1 };
      if (event.key in moves) { event.preventDefault(); choices[moves[event.key]]?.focus(); }
      if (event.key === "ArrowRight" && document.activeElement?.getAttribute("aria-haspopup") === "menu") { event.preventDefault(); document.activeElement.click(); children(palette).at(-1)?.body.querySelector("button:not(:disabled)")?.focus(); }
      if (event.key === "Escape" || event.key === "ArrowLeft") {
        event.preventDefault(); const parentPalette = palette.parent;
        if (parentPalette) { remove(palette); palette.trigger?.focus(); }
        else { closeAttached(); source?.target?.focus({ preventScroll: true }); }
      }
    });
    return palette;
  }

  document.addEventListener("keydown", (event) => {
    if (!active() || event.isComposing || event.key !== "F10" || event.shiftKey) return;
    event.preventDefault();
    source = context();
    const root = palettes.get(`${owner()}:root`);
    if (root) buttons(root)[0]?.focus();
  });

  document.addEventListener("pointerup", (event) => {
    if (gesture?.id !== event.pointerId) return;
    const previous = gesture;
    gesture = null;
    if (previous.kind === "select" && previous.release && event.target !== previous.start && event.target.closest("button") === previous.releaseTarget && !previous.releaseTarget.disabled) {
      previous.release();
      gesture = { suppressClick: true };
      setTimeout(() => { if (gesture?.suppressClick) gesture = null; }, 0);
    }
  });
  document.addEventListener("pointercancel", () => { gesture = null; });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".nextstep-menu-palette")) { closeAttached(); source = null; }
  });

  function sync() {
    queued = false;
    const currentOwner = owner();
    if (!active()) {
      if (gesture?.kind === "drag") {
        const header = gesture.palette.node.querySelector("header");
        if (header.hasPointerCapture(gesture.id)) header.releasePointerCapture(gesture.id);
      }
      gesture = null;
      palettes.forEach((palette) => { palette.node.hidden = true; });
      document.body.style.removeProperty("--nextstep-menu-right");
      document.body.classList.remove("nextstep-main-menu");
      return;
    }
    if (lastOwner !== currentOwner) { closeAttached(); source = null; lastOwner = currentOwner; }
    const key = `${currentOwner}:root`;
    let root = palettes.get(key);
    // The 3.3 main menu hangs from the screen's top-left corner with its 1px
    // border off-screen: the palette sits at (-1,-1) so (0,0) is the white
    // highlight. There is no Mac menu bar above it in this appearance.
    if (!root) { root = create(key, currentOwner, "root", activeAppLabel(), rootItems(currentOwner)); place(root, -1, -1); }
    else if (!root.node.contains(document.activeElement) && !gesture) render(root, rootItems(currentOwner));
    palettes.forEach((palette) => {
      palette.node.hidden = palette.owner !== currentOwner;
      if (!palette.node.hidden) {
        if (!gesture && !palette.node.contains(document.activeElement)) render(palette, currentItems(palette));
        palette.language = currentLanguage;
        refreshAvailability(palette); place(palette, palette.x, palette.y);
      }
    });
    // The main menu's right edge, for layouts that must stay clear of it
    // (the Theme Lab window, the narrow full-screen shell).
    // A phone takes the palette off (nextstep-shell.css), which leaves it a
    // zero box: that is "not on screen" here too.
    const rootBox = root.node.hidden ? null : root.node.getBoundingClientRect();
    const onScreen = Boolean(rootBox && rootBox.width > 0);
    document.body.style.setProperty("--nextstep-menu-right", `${onScreen ? Math.max(0, Math.round(rootBox.right)) : 0}px`);
    // A class the lazy NeXTSTEP sheet can scope by without a theme selector:
    // present exactly while a NeXTSTEP main menu is on screen.
    document.body.classList.toggle("nextstep-main-menu", onScreen);
    // The Writing Flow panel hangs under the root palette, so it re-places
    // itself once the palettes are where they belong.
    window.AISystem6NextstepWritingFlow?.sync();
  }
  function schedule() { if (!queued) { queued = true; queueMicrotask(sync); } }
  document.addEventListener("ai-system6-themechange", schedule);
  window.addEventListener("resize", schedule);
  window.AISystem6Runtime.registerCommand("nextstep-zoom-window", { handler: () => { const win = resolveMenuContextWindow(); if (win) zoomWindow(win); } });
  window.AISystem6Runtime.registerCommand("nextstep-shade-window", { handler: () => { const win = resolveMenuContextWindow(); if (win) toggleCollapsed(win); } });
  window.AISystem6NextstepMenus = Object.freeze({ sync: schedule, rootRect, writingFamily });
})();
