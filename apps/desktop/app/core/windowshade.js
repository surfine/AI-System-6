// WindowShade's released placement vocabulary, adapted to in-page windows.
// Reference: surfine/WindowShade v1.0.15, Core/TrackpadGesture.swift.
// No native window APIs, document copies, new persistence store, or theme rules.
(() => {
  const slots = Object.freeze({
    leftHalf: [0, 0, 1 / 2, 1], rightHalf: [1 / 2, 0, 1, 1],
    leftTwoThirds: [0, 0, 2 / 3, 1], rightTwoThirds: [1 / 3, 0, 1, 1],
    leftThird: [0, 0, 1 / 3, 1], rightThird: [2 / 3, 0, 1, 1],
    topLeft: [0, 0, 1 / 2, 1 / 2], topRight: [1 / 2, 0, 1, 1 / 2],
    bottomLeft: [0, 1 / 2, 1 / 2, 1], bottomRight: [1 / 2, 1 / 2, 1, 1],
    fill: [0, 0, 1, 1],
  });
  Object.values(slots).forEach(Object.freeze);
  const hasSlot = (action) => Object.prototype.hasOwnProperty.call(slots, action);
  const finite = (n) => typeof n === "number" && Number.isFinite(n);
  const validRect = (r) => !!r && [r.left, r.top, r.width, r.height].every(finite)
    && r.width > 0 && r.height > 0;
  const clamp = (n, low, high) => Math.min(Math.max(n, low), high);
  function nextSide(side, direction) {
    if (direction !== "left" && direction !== "right") return null;
    const ladder = [`${direction}Half`, `${direction}TwoThirds`, `${direction}Third`];
    return ladder[(ladder.indexOf(side) + 1) % ladder.length];
  }
  function keyTurn(direction, elapsed, vertical) {
    if (!["left", "right"].includes(direction) || !finite(elapsed) || elapsed < 0 || elapsed > 800) return null;
    if (vertical !== "up" && vertical !== "down") return null;
    return `${vertical === "up" ? "top" : "bottom"}${direction === "left" ? "Left" : "Right"}`;
  }
  // Web-measurable gesture classifiers (DOM WheelEvent / pointer velocity).
  // Not native NSEvent/TrackpadGesture: no finger count, Force Touch, or
  // inertia phases. Flick speed matches WindowShade FlickClassifier (1800 pt/s)
  // and requires the window to have followed the pointer (≥50% of travel).
  const flickMinimumSpeed = 1800;
  const flickMinimumTravel = 24;
  const wheelMinimumDelta = 10;
  function classifyFlick(input = {}) {
    const dx = input.dx;
    const dy = input.dy;
    const speed = input.speed;
    const followed = !!input.followed;
    const collapsed = !!input.collapsed;
    if (!followed || !finite(dx) || !finite(dy) || !finite(speed)) return null;
    if (speed < flickMinimumSpeed) return null;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < flickMinimumTravel && ay < flickMinimumTravel) return null;
    if (ay >= ax) {
      if (dy < 0) return collapsed ? null : "shade";
      return collapsed ? "expand" : "fill";
    }
    return dx < 0 ? "leftHalf" : "rightHalf";
  }
  // WheelEvent.deltaMode: 0 = pixels, 1 = lines, 2 = pages. A wheel stream can
  // never prove two-finger identity, Force Touch or an inertia phase, so this
  // only normalizes the unit before the same pixel threshold is applied.
  function wheelPixels(deltaY, deltaMode) {
    if (!finite(deltaY)) return null;
    if (deltaMode === 1) return deltaY * 16;
    if (deltaMode === 2) {
      const page = (typeof window !== "undefined" && finite(window.innerHeight)) ? window.innerHeight : 800;
      return deltaY * page;
    }
    return deltaY;
  }
  function classifyWheel(input = {}) {
    // ctrl/meta wheel is browser zoom / system UI — never claim it.
    if (input.ctrlKey || input.metaKey || input.defaultPrevented) return null;
    const deltaY = wheelPixels(input.deltaY, input.deltaMode);
    if (deltaY === null || Math.abs(deltaY) < wheelMinimumDelta) return null;
    const collapsed = !!input.collapsed;
    // Natural trackpad: fingers up → positive deltaY → shade (上滑收起).
    if (deltaY > 0) return collapsed ? null : "shade";
    return collapsed ? "expand" : "fill";
  }
  function targetFrame(action, area, limits = {}) {
    const slot = hasSlot(action) ? slots[action] : null;
    if (!slot || !validRect(area)) return null;
    const gap = limits.gap === undefined ? 8 : limits.gap;
    const minWidth = limits.minWidth === undefined ? 1 : limits.minWidth;
    const minHeight = limits.minHeight === undefined ? 1 : limits.minHeight;
    const aspect = limits.aspect === undefined ? 0 : limits.aspect;
    if (![gap, minWidth, minHeight, aspect].every(finite)
      || gap < 0 || minWidth <= 0 || minHeight <= 0 || aspect < 0) return null;
    const [x0, y0, x1, y1] = slot;
    const left = Math.ceil(area.left + area.width * x0 + (x0 > 0 ? gap / 2 : 0));
    const top = Math.ceil(area.top + area.height * y0 + (y0 > 0 ? gap / 2 : 0));
    const right = Math.floor(area.left + area.width * x1 - (x1 < 1 ? gap / 2 : 0));
    const bottom = Math.floor(area.top + area.height * y1 - (y1 < 1 ? gap / 2 : 0));
    let width = right - left;
    let height = bottom - top;
    if (aspect) {
      width = Math.min(width, Math.floor(height * aspect));
      height = Math.floor(width / aspect);
    }
    if (width < minWidth || height < minHeight) return null;
    // An aspect-locked canvas keeps its ratio and anchors to the requested edge.
    return { left: x0 > 0 ? right - width : left, top: y0 > 0 ? bottom - height : top, width, height };
  }
  function reachableFrame(frame, area) {
    if (!validRect(frame) || !validRect(area)) return null;
    // Never shrink a user's document just to recover its title bar.
    return { ...frame,
      left: clamp(frame.left, area.left, area.left + Math.max(0, area.width - frame.width)),
      top: clamp(frame.top, area.top, area.top + Math.max(0, area.height - Math.min(frame.height, area.height))),
    };
  }
  const policy = Object.freeze({
    nextSide, keyTurn, targetFrame, reachableFrame, slots,
    classifyFlick, classifyWheel, flickMinimumSpeed, flickMinimumTravel, wheelMinimumDelta,
  });
  globalThis.AISystem6WindowShadePolicy = policy;
  // The very same policy is exercised by node:test, without a DOM imitation.
  if (typeof document === "undefined" || globalThis.AISystem6WindowShadeLoaded) return;

  const records = new Map();
  const properties = ["left", "top", "right", "bottom", "width", "height", "min-width", "max-width", "min-height", "max-height", "transform", "--window-shade-width"];
  const metadata = ["zoomed", "restoreLeft", "restoreTop", "restoreWidth", "restoreHeight", "shadeRestoreHeight", "shadeRestoreMaxHeight", "userPositioned", "systemPositioned", "appHiddenCollapsed"];
  const presentation = ["is-collapsed", "is-desklet", "is-finder-content-fit"];
  let menu = null;
  let menuWindow = null;
  let previousFocus = null;
  let resizeFrame = 0;
  let lastTurn = null;
  // Title-bar gestures are an authorized experiment. They reuse dispatch() only.
  // Measurable on web: pointer velocity after a real title-bar drag, and
  // wheel/trackpad scroll deltas on the title bar. Not measurable: native
  // two-finger identity, pinch scale as a distinct gesture stream, Force Touch.
  let gesturesEnabled = true;
  let flickTrack = null;
  let wheelLockUntil = 0;
  const reducedMotion = () => {
    try { return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; }
    catch { return false; }
  };
  const blankTitleBar = (node) => !node?.closest?.(
    "button, a, input, select, textarea, [contenteditable]:not([contenteditable='false']), [role='button'], [role='tab'], [role='menuitem']",
  ) && node?.closest?.(".window[data-window] > .title-bar");
  const messages = {
    menu: ["排列窗口", "Arrange Window"], shade: ["收起", "Roll Up"], expand: ["展开", "Unroll"],
    pin: ["置顶", "Keep in Front"], unpin: ["取消置顶", "Release from Front"],
    leftHalf: ["左半屏", "Left Half"], rightHalf: ["右半屏", "Right Half"],
    leftTwoThirds: ["左三分之二", "Left Two Thirds"], rightTwoThirds: ["右三分之二", "Right Two Thirds"],
    leftThird: ["左三分之一", "Left Third"], rightThird: ["右三分之一", "Right Third"],
    topLeft: ["左上角", "Top Left"], topRight: ["右上角", "Top Right"],
    bottomLeft: ["左下角", "Bottom Left"], bottomRight: ["右下角", "Bottom Right"],
    fill: ["铺满工作区", "Fill Work Area"], undo: ["撤销上次排布", "Undo Last Arrangement"],
    recover: ["移回可见区域", "Bring Into View"],
    unavailable: ["这个窗口目前不能这样排列。", "This window cannot be arranged this way right now."],
    noRoom: ["工作区放不下这个窗口的最小尺寸，原位置未变。", "The window's minimum size does not fit. Its position has not changed."],
    stale: ["窗口已经改动，没有可撤销的排布。", "The window has changed; there is no arrangement to undo."],
    rejected: ["窗口没有接受这个尺寸，已恢复原样。", "The window did not accept that size; its original frame was restored."],
  };
  function label(key) {
    const english = typeof currentLanguage !== "undefined" ? /^en/.test(currentLanguage) : /^en/.test(document.documentElement.lang);
    return messages[key]?.[english ? 1 : 0] || key;
  }
  function result(ok, reason) {
    if (!ok && reason && typeof setStatus === "function") setStatus(label(reason));
    return { ok, ...(reason ? { reason } : {}) };
  }
  function desktopReady() {
    return typeof isNarrowViewport === "function" && !isNarrowViewport()
      && !(typeof writerMode !== "undefined" && writerMode)
      && !(typeof modalScrim !== "undefined" && modalScrim && !modalScrim.classList.contains("is-hidden") && modalScrim.getClientRects().length)
      && !document.fullscreenElement
      && !document.body.classList.contains("window-fullscreen-active")
      && !Array.from(document.querySelectorAll('.system-modal:not(.is-hidden), dialog[open], [aria-modal="true"], .window[data-window="about"]:not(.is-hidden), .window[data-window="saveChat"]:not(.is-hidden)')).some((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
  }
  function eligible(win) {
    if (!desktopReady() || !win?.isConnected || !win.matches(".window[data-window]")) return false;
    if (win.matches(".is-hidden, .is-app-hidden, .is-minimized, .is-fullscreen, .is-mobile-fullscreen, .is-desklet")) return false;
    if (win.dataset.sideaskRestoreActive === "true") return false;
    if (typeof isCenteredSystemWindow === "function" && isCenteredSystemWindow(win)) return false;
    if (!win.querySelector(":scope > .title-bar")) return false;
    // Absolute positioning is the desktop contract; CSS-owned/fixed shells opt out.
    const css = getComputedStyle(win);
    return css.position === "absolute" && css.visibility !== "hidden" && win.getClientRects().length > 0
      && win.offsetParent === document.querySelector(".desktop");
  }
  function snapshot(win) {
    return {
      style: [...new Set([...properties, ...Array.from(win.style).filter((key) => key.startsWith("--finder-fit-"))])].map((key) => [key, win.style.getPropertyValue(key), win.style.getPropertyPriority(key)]),
      data: [...new Set([...metadata, ...Object.keys(win.dataset).filter((key) => key.startsWith("finderFit"))])].map((key) => [key, win.dataset[key]]),
      classes: presentation.map((key) => [key, win.classList.contains(key)]),
    };
  }
  const signature = (win) => JSON.stringify(snapshot(win));
  function restore(win, state) {
    // Invalidate any deferred system placement before putting the exact frame back.
    placeWindowForExplicitLayout(win, {}, { userPositioned: true });
    for (const [key, value, priority] of state.style) {
      if (value) win.style.setProperty(key, value, priority);
      else win.style.removeProperty(key);
    }
    for (const [key, value] of state.data) {
      if (value === undefined) delete win.dataset[key];
      else win.dataset[key] = value;
    }
    for (const [key, value] of state.classes) win.classList.toggle(key, value);
  }
  function forget(win) {
    records.get(win)?.watcher.disconnect();
    records.delete(win);
    if (lastTurn?.win === win) lastTurn = null;
  }
  function recordFor(win, checkGeometry = true) {
    const record = records.get(win);
    if (!record) return null;
    if (!eligible(win) || record.signature !== signature(win)
      || (checkGeometry && ["left", "top", "width", "height"].some((key) => Math.abs(localFrame(win)[key] - record.frame[key]) > 2))) { forget(win); return null; }
    return record;
  }
  function remember(win, history, layout) {
    forget(win);
    const watcher = new MutationObserver((changes) => {
      // A close/reopen in one task still invalidates the old window history.
      const leftDesk = changes.some((change) => change.attributeName === "class"
        && /(?:^|\s)is-(?:hidden|app-hidden|minimized|fullscreen)(?:\s|$)/.test(change.oldValue || ""));
      if (leftDesk || !eligible(win) || records.get(win)?.signature !== signature(win)) forget(win);
    });
    const record = { history: history.slice(-20), layout, signature: signature(win), frame: localFrame(win), watcher };
    records.set(win, record);
    watcher.observe(win, { attributes: true, attributeOldValue: true, attributeFilter: ["style", "class", ...metadata.map((key) => `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`)] });
    return record;
  }
  function areaFor(win) {
    const desktop = document.querySelector(".desktop");
    if (!desktop || win.offsetParent !== desktop) return null;
    const rect = desktop.getBoundingClientRect();
    const view = window.visualViewport;
    const viewLeft = view?.offsetLeft || 0;
    const viewTop = view?.offsetTop || 0;
    const viewRight = viewLeft + (view?.width || window.innerWidth);
    const viewBottom = viewTop + (view?.height || window.innerHeight);
    const margin = 12;
    const insets = getDesktopAvoidanceInsets({ margin, spineGap: margin, iconGap: 24 });
    const menuBottom = document.querySelector(".menu-bar")?.getBoundingClientRect().bottom || 0;
    const reserve = typeof deskBottomReserve === "function" ? deskBottomReserve() : insets.bottom || 0;
    const left = Math.max(rect.left + insets.left, viewLeft + margin);
    const top = Math.max(rect.top, menuBottom, viewTop) + margin;
    const right = Math.min(rect.right - insets.right - margin, viewRight - margin);
    const bottom = Math.min(rect.bottom, viewBottom) - reserve - margin;
    // Convert viewport bounds to the absolute child's padding-box coordinates.
    return { left: left - rect.left - desktop.clientLeft + desktop.scrollLeft,
      top: top - rect.top - desktop.clientTop + desktop.scrollTop, width: right - left, height: bottom - top };
  }
  function localFrame(win) {
    const box = win.getBoundingClientRect();
    const parent = win.offsetParent;
    const base = parent.getBoundingClientRect();
    return { left: box.left - base.left - parent.clientLeft + parent.scrollLeft,
      top: box.top - base.top - parent.clientTop + parent.scrollTop, width: box.width, height: box.height };
  }
  function target(win, action) {
    if (!isResizableWindow(win)) return null;
    const css = getComputedStyle(win);
    return targetFrame(action, areaFor(win), {
      minWidth: Math.max(1, parseFloat(css.minWidth) || 1),
      minHeight: Math.max(1, parseFloat(css.minHeight) || 1, win.querySelector(":scope > .title-bar").getBoundingClientRect().height + 48),
      aspect: typeof aspectRatioForWindow === "function" ? aspectRatioForWindow(win) : 0,
    });
  }
  function writeFrame(win, frame) {
    if (win.classList.contains("is-collapsed")) toggleCollapsed(win);
    win.style.removeProperty("bottom");
    placeWindowForExplicitLayout(win, { ...frame, maxHeight: frame.height }, { userPositioned: true });
    const actual = localFrame(win);
    return ["left", "top", "width", "height"].every((key) => Math.abs(actual[key] - frame[key]) <= 2);
  }
  function moveIntoView(win) {
    const frame = localFrame(win);
    const next = reachableFrame(frame, areaFor(win));
    if (!next) return false;
    if (Math.abs(next.left - frame.left) < 0.5 && Math.abs(next.top - frame.top) < 0.5) return true;
    // Recovery moves, but does not resize, unroll, or reconstruct the window.
    setInlineStyleValue(win, "left", `${next.left}px`);
    setInlineStyleValue(win, "top", `${next.top}px`);
    setInlineStyleValue(win, "right", "auto");
    win.style.transform = "none";
    markWindowUserPositioned(win);
    return true;
  }
  function committed(win) {
    focusWindow(win);
    scheduleWorkingSessionSave?.();
    // Existing canvas owners observe their size. Do not rerender the document.
    win.dispatchEvent(new CustomEvent("ai-system6-window-arranged", { bubbles: true }));
  }
  function dispatch(win, action) {
    closeMenu(false);
    if (!eligible(win)) return result(false, "unavailable");
    // Pin is stack ownership, not a layout slot. It must survive arrange /
    // shade / theme without riding the private arrangement undo ledger.
    if (action === "pin" || action === "unpin") {
      if (typeof setWindowPinned !== "function" || typeof canPinWindow !== "function") return result(false, "unavailable");
      if (!canPinWindow(win)) return result(false, "unavailable");
      const want = action === "pin";
      if (!!win.dataset.windowPinned === want) return result(true);
      if (!setWindowPinned(win, want)) return result(false, "unavailable");
      return result(true);
    }
    const record = recordFor(win);
    if (action === "undo") {
      if (!record?.history.length) return result(false, "stale");
      const history = [...record.history];
      const previous = history.pop();
      forget(win);
      restore(win, previous.state);
      moveIntoView(win);
      if (history.length) remember(win, history, previous.layout);
      committed(win);
      return result(true);
    }
    const before = snapshot(win);
    const previousLayout = record?.layout || null;
    const history = [...(record?.history || [])];
    let layout = null;
    let frame = null;
    if (hasSlot(action)) {
      frame = target(win, action);
      if (!frame) return result(false, "noRoom");
      if (!win.classList.contains("is-collapsed") && ["left", "top", "width", "height"].every((key) => Math.abs(localFrame(win)[key] - frame[key]) < 1)) return result(true);
      layout = action;
    } else if (!["shade", "expand", "recover"].includes(action)) return result(false, "unavailable");
    if ((action === "shade") === win.classList.contains("is-collapsed") && ["shade", "expand"].includes(action)) return result(true);
    forget(win);
    try {
      if (frame && !writeFrame(win, frame)) {
        restore(win, before);
        if (history.length) remember(win, history, previousLayout);
        scheduleWorkingSessionSave?.();
        return result(false, "rejected");
      }
      if (action === "shade" || action === "expand") toggleCollapsed(win);
      if (action === "recover" && !moveIntoView(win)) return result(false, "unavailable");
      history.push({ state: before, layout: previousLayout });
      remember(win, history, layout);
      committed(win);
      return result(true);
    } catch (error) {
      forget(win);
      restore(win, before);
      if (history.length) remember(win, history, previousLayout);
      scheduleWorkingSessionSave?.();
      console.warn("WindowShade arrangement rolled back", error);
      return result(false, "rejected");
    }
  }
  function direction(win, key, at = performance.now()) {
    if (!["left", "right", "up", "down"].includes(key)) return result(false, "unavailable");
    const record = recordFor(win);
    const turn = lastTurn?.win === win && record ? keyTurn(lastTurn.direction, at - lastTurn.at, key) : null;
    let action = turn;
    if (!action) {
      if (key === "left" || key === "right") action = nextSide(record?.layout, key);
      else if (key === "up") action = record?.layout === "fill" ? "undo" : "shade";
      else action = win?.classList.contains("is-collapsed") ? "expand" : "fill";
    }
    const outcome = dispatch(win, action);
    lastTurn = outcome.ok && (key === "left" || key === "right") ? { win, direction: key, at } : null;
    return outcome;
  }
  function closeMenu(restoreFocus = true) {
    if (!menu) return;
    const activeWasMenu = menu.contains(document.activeElement);
    menu.remove();
    menu = null;
    menuWindow = null;
    if (restoreFocus && activeWasMenu && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  function openMenu(win, point = {}) {
    closeMenu();
    if (!eligible(win)) return result(false, "unavailable");
    focusWindow(win);
    previousFocus = document.activeElement;
    menuWindow = win;
    menu = document.createElement("div");
    menu.className = "menu is-open windowshade-menu";
    menu.dataset.windowshadeMenu = "true";
    Object.assign(menu.style, { position: "fixed", zIndex: "var(--z-menu-popover, 10000)", margin: "0" });
    const panel = document.createElement("div");
    panel.className = "menu-popover";
    panel.setAttribute("role", "menu");
    panel.setAttribute("aria-label", label("menu"));
    Object.assign(panel.style, { position: "relative", display: "block", left: "0", top: "0", minWidth: "220px", maxHeight: `${window.innerHeight - 24}px`, overflowY: "auto" });
    const pinAction = win.dataset.windowPinned === "true" ? "unpin" : "pin";
    const actions = [win.classList.contains("is-collapsed") ? "expand" : "shade", pinAction, "fill", "leftHalf", "rightHalf", "leftTwoThirds", "rightTwoThirds", "leftThird", "rightThird", "topLeft", "topRight", "bottomLeft", "bottomRight", "undo", "recover"];
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.setAttribute("role", "menuitem");
      button.dataset.windowshadeAction = action;
      button.textContent = label(action);
      button.disabled = action === "undo" ? !recordFor(win)?.history.length
        : action === "pin" || action === "unpin" ? typeof canPinWindow === "function" && !canPinWindow(win)
          : hasSlot(action) && !target(win, action);
      button.setAttribute("aria-disabled", String(button.disabled));
      if (button.disabled) button.title = label(action === "undo" ? "stale" : action === "pin" || action === "unpin" ? "unavailable" : "noRoom");
      button.addEventListener("click", () => { closeMenu(); dispatch(win, action); });
      panel.append(button);
    }
    panel.addEventListener("keydown", (event) => {
      const buttons = [...panel.querySelectorAll("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? (index + 1) % buttons.length
        : event.key === "ArrowUp" ? (index - 1 + buttons.length) % buttons.length
          : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); event.stopPropagation(); buttons[next]?.focus(); }
      if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); closeMenu(); }
    });
    menu.append(panel);
    document.body.append(menu);
    const bar = win.querySelector(":scope > .title-bar").getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    setInlineStyleValue(menu, "left", `${clamp(finite(point.x) ? point.x : bar.left, 8, Math.max(8, window.innerWidth - box.width - 8))}px`);
    setInlineStyleValue(menu, "top", `${clamp(finite(point.y) ? point.y : bar.bottom, 8, Math.max(8, window.innerHeight - box.height - 8))}px`);
    panel.querySelector("button:not(:disabled)")?.focus();
    return result(true);
  }
  function reflow() {
    resizeFrame = 0;
    closeMenu();
    if (!desktopReady()) { for (const win of records.keys()) forget(win); return; }
    for (const win of [...records.keys()]) {
      const record = recordFor(win, false);
      if (!record?.layout) continue;
      const frame = target(win, record.layout);
      if (!frame) { forget(win); moveIntoView(win); scheduleWorkingSessionSave?.(); continue; }
      const before = snapshot(win);
      forget(win);
      if (writeFrame(win, frame)) remember(win, record.history, record.layout);
      else { restore(win, before); moveIntoView(win); }
      scheduleWorkingSessionSave?.();
    }
  }
  document.addEventListener("pointerdown", (event) => {
    if (menu && !menu.contains(event.target)) closeMenu(false);
    if (!gesturesEnabled || event.button !== 0) { flickTrack = null; clearFlickOutline(); return; }
    const bar = blankTitleBar(event.target);
    const win = bar?.parentElement;
    if (!win || !eligible(win)) { flickTrack = null; return; }
    // Observe only: wireup owns the real title-bar drag. Flick commits once on
    // release when the window followed the pointer fast enough.
    flickTrack = {
      win,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
      left: win.offsetLeft,
      top: win.offsetTop,
      lastX: event.clientX,
      lastY: event.clientY,
      lastT: performance.now(),
    };
  }, true);
  // WM6: the candidate an owned title-bar drag is heading for, computed by the
  // same rule the release uses so the preview and the commit cannot disagree.
  function flickCandidate(track, event) {
    const win = track.win;
    if (!eligible(win)) return null;
    const now = performance.now();
    const elapsed = Math.max(1, (finite(track.lastT) ? track.lastT : now) - track.t);
    const dx = (finite(track.lastX) ? track.lastX : event.clientX) - track.x;
    const dy = (finite(track.lastY) ? track.lastY : event.clientY) - track.y;
    const speed = Math.hypot(dx, dy) / (elapsed / 1000);
    const movedX = win.offsetLeft - track.left;
    const movedY = win.offsetTop - track.top;
    // Window must have followed the pointer (≥50% of travel, same idea as the
    // released FlickClassifier). Dragging text/tabs leaves the frame still.
    const travel = Math.hypot(dx, dy);
    const followed = travel >= flickMinimumTravel
      && Math.hypot(movedX, movedY) >= travel * 0.5
      && (movedX * dx + movedY * dy) >= 0;
    return classifyFlick({ dx, dy, speed, followed, collapsed: win.classList.contains("is-collapsed") });
  }
  // A non-writing preview: a dotted frame on the desk, no session record, no
  // undo entry. Only the eras whose own chrome draws a dotted frame preview get
  // one (native-window-outline); a live-resize era keeps its own material and
  // is never handed a borrowed spring.
  let flickOutline = null;
  function clearFlickOutline() {
    flickOutline?.remove();
    flickOutline = null;
  }
  function showFlickOutline(win, action) {
    if (!win || !hasSlot(action) || !window.AISystem6Theme?.hasCapability?.("native-window-outline")) {
      clearFlickOutline();
      return;
    }
    const frame = target(win, action);
    if (!frame) { clearFlickOutline(); return; }
    if (!flickOutline?.isConnected) {
      flickOutline = document.createElement("div");
      flickOutline.className = "window-outline";
      flickOutline.setAttribute("aria-hidden", "true");
      document.body.append(flickOutline);
    }
    flickOutline.dataset.windowOutlineAction = action;
    setInlineStyleValue(flickOutline, "left", `${frame.left}px`);
    setInlineStyleValue(flickOutline, "top", `${frame.top}px`);
    setInlineStyleValue(flickOutline, "width", `${frame.width}px`);
    setInlineStyleValue(flickOutline, "height", `${frame.height}px`);
  }
  document.addEventListener("pointermove", (event) => {
    if (!flickTrack || flickTrack.pointerId !== event.pointerId) return;
    flickTrack.lastX = event.clientX;
    flickTrack.lastY = event.clientY;
    flickTrack.lastT = performance.now();
    // Preview only past the threshold, and never for the shade/expand/fill verbs
    // (they change height, not the desk slot, so they have no frame to show).
    const action = flickCandidate(flickTrack, event);
    if (action && hasSlot(action)) showFlickOutline(flickTrack.win, action);
    else clearFlickOutline();
  }, true);
  function settleFlick(event) {
    const track = flickTrack;
    flickTrack = null;
    clearFlickOutline();
    if (!gesturesEnabled || !track || track.pointerId !== event.pointerId) return;
    if (event.type === "pointercancel") return;
    const win = track.win;
    if (!eligible(win)) return;
    // Bubble phase: run after wireup's title-bar drag stopMove so Classic
    // outline drags have already committed the window frame (followed check).
    const action = flickCandidate(track, event);
    if (!action) return;
    if (typeof cancelAllWindowPeeks === "function") cancelAllWindowPeeks();
    dispatch(win, action);
  }
  document.addEventListener("pointerup", settleFlick);
  document.addEventListener("pointercancel", () => { flickTrack = null; clearFlickOutline(); }, true);
  document.addEventListener("lostpointercapture", () => { flickTrack = null; clearFlickOutline(); }, true);
  document.addEventListener("wheel", (event) => {
    if (!gesturesEnabled) return;
    const bar = blankTitleBar(event.target);
    const win = bar?.parentElement;
    if (!win || !eligible(win)) return;
    const action = classifyWheel({
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      defaultPrevented: event.defaultPrevented,
      collapsed: win.classList.contains("is-collapsed"),
    });
    if (!action) return;
    // Debounce trackpad wheel bursts into one commit; never touch content scroll.
    const now = performance.now();
    if (now < wheelLockUntil) {
      event.preventDefault();
      return;
    }
    wheelLockUntil = now + (reducedMotion() ? 0 : 320);
    event.preventDefault();
    event.stopPropagation();
    if (typeof cancelAllWindowPeeks === "function") cancelAllWindowPeeks();
    dispatch(win, action);
  }, { capture: true, passive: false });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      flickTrack = null;
      clearFlickOutline();
      closeMenu();
    }
  });
  document.addEventListener("focusin", (event) => { if (menu && !menu.contains(event.target)) closeMenu(false); });
  window.addEventListener("blur", () => { closeMenu(false); lastTurn = null; flickTrack = null; clearFlickOutline(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { closeMenu(false); lastTurn = null; flickTrack = null; clearFlickOutline(); } });
  document.addEventListener("ai-system6-themechange", () => { closeMenu(); for (const win of records.keys()) forget(win); flickTrack = null; clearFlickOutline(); });
  window.addEventListener("resize", () => { if (!resizeFrame) resizeFrame = requestAnimationFrame(reflow); flickTrack = null; clearFlickOutline(); });
  // Removed DOM nodes need no long-lived per-window observer or history.
  new MutationObserver(() => {
    for (const win of records.keys()) if (!win.isConnected) forget(win);
    if (menuWindow && !eligible(menuWindow)) closeMenu(false);
    if (flickTrack && !flickTrack.win.isConnected) { flickTrack = null; clearFlickOutline(); }
  }).observe(document.querySelector(".desktop") || document.body, { childList: true });

  globalThis.AISystem6WindowShade = Object.freeze({
    dispatch, direction, openMenu, closeMenu, eligible, areaFor,
    classifyFlick, classifyWheel,
    gesturesEnabled: () => gesturesEnabled,
    setGesturesEnabled: (value) => { gesturesEnabled = !!value; if (!gesturesEnabled) { flickTrack = null; clearFlickOutline(); } return gesturesEnabled; },
    canUndo: (win) => !!recordFor(win)?.history.length,
    isPinned: (win) => !!win && win.dataset.windowPinned === "true",
    beginPeek: (win) => (typeof beginPeek === "function" ? beginPeek(win) : false),
    endPeek: (win) => (typeof endPeek === "function" ? endPeek(win) : false),
    commitPeek: (win) => (typeof commitPeek === "function" ? commitPeek(win) : false),
    isPeeking: (win) => (typeof isWindowPeeking === "function" ? isWindowPeeking(win) : false),
  });
  globalThis.AISystem6WindowShadeLoaded = true;
})();
