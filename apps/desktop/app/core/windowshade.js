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
  // Plan the complete group without touching any window. Fixed-size surfaces
  // keep their measured frame; resizable surfaces respect their paper floor.
  function tileFrames(items, area, gap = 12) {
    if (!items.length || !validRect(area) || !finite(gap) || gap < 0) return null;
    const columns = Array.from({ length: items.length }, (_, index) => index + 1)
      .sort((a, b) => Math.abs(a - Math.sqrt(items.length)) - Math.abs(b - Math.sqrt(items.length)));
    for (const cols of columns) {
      const rows = Math.ceil(items.length / cols);
      const width = Math.floor((area.width - gap * (cols - 1)) / cols);
      const height = Math.floor((area.height - gap * (rows - 1)) / rows);
      const frames = items.map((item, index) => {
        const cell = { left: area.left + index % cols * (width + gap),
          top: area.top + Math.floor(index / cols) * (height + gap), width, height };
        if (item.fixed) return item.width <= width && item.height <= height && item.width > 0 && item.height > 0
          ? { ...cell, width: item.width, height: item.height } : null;
        return targetFrame("fill", cell, item);
      });
      if (frames.every(Boolean)) return frames;
    }
    return null;
  }
  const policy = Object.freeze({
    nextSide, keyTurn, targetFrame, reachableFrame, tileFrames, slots,
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
    return messages[key]?.[english ? 1 : 0] || t(({ slideLeft: "window_slide_left", slideRight: "window_slide_right", slideHide: "window_slide_hide", slideShow: "window_slide_show", slideExit: "window_slide_exit", splitChoose: "window_split_choose", peek: "window_peek", pinSuspend: "window_pin_suspend", pinRestore: "window_pin_restore", pinClear: "window_pin_clear", pinList: "window_pinned_list" })[key] || key);
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
    return css.position === "absolute" && (css.visibility !== "hidden" || slides.has(win)) && win.getClientRects().length > 0
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
  // Temporary arrangements share the existing frame ledger. They never own
  // application state or document contents, and are deliberately not persisted.
  const slides = new Map();
  const pairs = new Set();
  const relationFrames = new Map();
  let relationBusy = false;
  let separatorDrag = null;
  function relationState() {
    return { slides: [...slides].map(([win, value]) => [win, { ...value }]),
      pairs: [...pairs].map((pair) => ({ ...pair, wins: [...pair.wins] })) };
  }
  function clearRelations(windows) {
    for (const win of windows) slides.delete(win);
    for (const pair of [...pairs]) if (pair.wins.some((win) => windows.includes(win))) pairs.delete(pair);
  }
  function restoreRelations(state, group = [...relationFrames.keys()]) {
    clearRelations(group);
    for (const [win, value] of state.slides) if (win.isConnected) slides.set(win, { ...value });
    for (const pair of state.pairs) if (pair.wins.every((win) => win.isConnected)) pairs.add({ ...pair, wins: [...pair.wins] });
    renderRelations();
  }
  function arrangementSpec(win) {
    const css = getComputedStyle(win);
    return { minWidth: Math.max(1, parseFloat(css.minWidth) || 1),
      minHeight: Math.max(1, parseFloat(css.minHeight) || 1, win.querySelector(":scope > .title-bar").getBoundingClientRect().height + 48),
      aspect: typeof aspectRatioForWindow === "function" ? aspectRatioForWindow(win) : 0 };
  }
  function pairFrames(wins, area, ratio = 0.5) {
    if (!validRect(area) || wins.some((win) => !isResizableWindow(win))) return null;
    const vertical = area.height > area.width;
    const gap = 8;
    const specs = wins.map(arrangementSpec);
    const length = (vertical ? area.height : area.width) - gap;
    const cross = vertical ? area.width : area.height;
    const minima = specs.map((s) => vertical ? Math.max(s.minHeight, s.aspect ? s.minWidth / s.aspect : 0)
      : Math.max(s.minWidth, s.aspect ? s.minHeight * s.aspect : 0));
    if (length < minima[0] + minima[1] || specs.some((s) => cross < (vertical ? s.minWidth : s.minHeight))) return null;
    const first = clamp(Math.round(length * ratio), Math.ceil(minima[0]), Math.floor(length - minima[1]));
    const cells = vertical
      ? [{ ...area, height: first }, { ...area, top: area.top + first + gap, height: length - first }]
      : [{ ...area, width: first }, { ...area, left: area.left + first + gap, width: length - first }];
    const frames = cells.map((cell, i) => targetFrame("fill", cell, specs[i]));
    return frames.every(Boolean) ? { frames, vertical, ratio: first / length, first, length, gap } : null;
  }
  function slideFrame(win, side) {
    const area = areaFor(win);
    if (!validRect(area)) return null;
    const spec = arrangementSpec(win);
    const current = localFrame(win);
    const width = isResizableWindow(win) ? Math.max(spec.minWidth, Math.round(area.width / 3)) : current.width;
    const height = isResizableWindow(win) ? area.height : current.height;
    if (width > area.width || height > area.height) return null;
    const cell = { left: side === "left" ? area.left : area.left + area.width - width, top: area.top, width, height };
    return isResizableWindow(win) ? targetFrame("fill", cell, spec) : cell;
  }
  function relationWindows(wins) {
    const group = new Set(wins);
    for (const pair of pairs) if (pair.wins.some((win) => group.has(win))) pair.wins.forEach((win) => group.add(win));
    return [...group];
  }
  function transact(wins, apply, after) {
    const group = relationWindows([...new Set(wins)]);
    if (group.some((win) => !eligible(win))) return result(false, "unavailable");
    const relations = relationState();
    const batch = group.map((win) => ({ win, state: snapshot(win), history: [...(recordFor(win)?.history || [])], layout: recordFor(win)?.layout || null }));
    batch.relations = { slides: relations.slides.filter(([win]) => group.includes(win)),
      pairs: relations.pairs.filter((pair) => pair.wins.some((win) => group.includes(win))) };
    relationBusy = true;
    batch.forEach(({ win }) => forget(win));
    try {
      if (apply() === false) throw new Error("Arrangement rejected");
      after?.();
      renderRelations();
      batch.forEach(({ win, state, history, layout }) => remember(win, [...history, { state, layout, batch }], null));
      group.forEach((win) => win.dispatchEvent(new CustomEvent("ai-system6-window-arranged", { bubbles: true })));
      scheduleWorkingSessionSave?.(); updateMenuState?.();
      return result(true);
    } catch (error) {
      batch.forEach(({ win, state }) => restore(win, state));
      restoreRelations(relations);
      batch.forEach(({ win, history, layout }) => { if (history.length) remember(win, history, layout); });
      return result(false, "rejected");
    } finally { relationBusy = false; }
  }
  function slide(win, side) {
    if (!["left", "right"].includes(side) || !eligible(win) || win.classList.contains("is-collapsed")) return result(false, "unavailable");
    const frame = slideFrame(win, side);
    if (!frame) return result(false, "noRoom");
    const occupant = [...slides].find(([other, value]) => other !== win && value.side === side);
    if (occupant) {
      const area = areaFor(occupant[0]);
      const home = occupant[1].homeFrame;
      if (!validRect(area) || home.width > area.width || home.height > area.height) return result(false, "noRoom");
    }
    const home = slides.get(win)?.home || snapshot(win);
    const homeFrame = slides.get(win)?.homeFrame || localFrame(win);
    return transact([win, ...(occupant ? [occupant[0]] : [])], () => {
      if (occupant) restore(occupant[0], occupant[1].home);
      return writeFrame(win, frame);
    }, () => {
      clearRelations([win, ...(occupant ? [occupant[0]] : [])]);
      slides.set(win, { side, home, homeFrame, hidden: false });
    });
  }
  function slideVisibility(win, hidden) {
    const value = slides.get(win);
    if (!value) return result(false, "unavailable");
    const returnToTab = document.activeElement?.dataset?.slideTab === win.dataset.window || win.contains(document.activeElement);
    const outcome = transact([win], () => true, () => { value.hidden = hidden; });
    if (outcome.ok && !hidden) focusWindow(win);
    if (outcome.ok && hidden) {
      if (returnToTab) document.querySelector(`[data-slide-tab="${win.dataset.window}"]`)?.focus();
      refreshApplicationLifecycle?.();
    }
    return outcome;
  }
  function exitSlide(win, keepPosition = false) {
    const value = slides.get(win);
    if (!value) return result(false, "unavailable");
    return transact([win], () => { if (!keepPosition) restore(win, value.home); return true; }, () => { slides.delete(win); });
  }
  function split(first, second) {
    const wins = [first, second];
    if (!first || !second || first === second || wins.some((win) => !eligible(win) || win.classList.contains("is-collapsed")
      || (typeof applicationWindowPresentation === "function" && !["open", "slide-hidden"].includes(applicationWindowPresentation(win))))) return result(false, "unavailable");
    const plan = pairFrames(wins, areaFor(first));
    if (!plan) return result(false, "noRoom");
    return transact(wins, () => wins.every((win, i) => writeFrame(win, plan.frames[i])), () => {
      clearRelations(wins); pairs.add({ wins, ratio: plan.ratio });
    });
  }
  async function chooseSplit(win) {
    const before = signature(win);
    await ensureLazySystemModule("app/features/window-browse.js", "AISystem6WindowBrowseLoaded");
    if (!eligible(win) || signature(win) !== before) return;
    window.AISystem6WindowBrowse?.open({ filterEntries: (entry) => {
      const other = getWindow(entry.name);
      return other !== win && entry.state === "open" && eligible(other) && !!pairFrames([win, other], areaFor(win));
    }, onSelect: (name) => { if (eligible(win) && signature(win) === before) split(win, getWindow(name)); } });
  }
  function detach(win, restoreHome = false) {
    if (relationBusy) return;
    if (separatorDrag?.pair.wins.includes(win)) cancelSeparator();
    const value = slides.get(win);
    if (value && restoreHome) restore(win, value.home);
    clearRelations([win]);
    renderRelations();
  }
  function renderRelations() {
    document.querySelectorAll("[data-slide-tab], [data-split-separator]").forEach((node) => node.remove());
    const desktop = document.querySelector(".desktop");
    for (const win of relationFrames.keys()) {
      if (!slides.has(win)) { win.classList.remove("is-slide-hidden"); delete win.dataset.windowSlide; setWindowLayerZ(win, Number(win.style.zIndex)); }
    }
    relationFrames.clear();
    for (const [win, value] of slides) {
      win.dataset.windowSlide = value.side;
      win.classList.toggle("is-slide-hidden", value.hidden);
      setWindowLayerZ(win, Number(win.style.zIndex));
      const tab = document.createElement("button");
      tab.type = "button"; tab.className = "window-slide-tab";
      tab.dataset.slideTab = win.dataset.window;
      tab.textContent = value.hidden ? `${t("window_slide_show")}: ${applicationWindowTitle(win)}` : t("window_slide_hide");
      tab.setAttribute("aria-label", `${value.hidden ? t("window_slide_show") : t("window_slide_hide")}: ${applicationWindowTitle(win)}`);
      const frame = localFrame(win);
      setInlineStyleValue(tab, "left", `${value.hidden ? (value.side === "left" ? frame.left : frame.left + frame.width) : (value.side === "left" ? frame.left + frame.width : frame.left)}px`);
      setInlineStyleValue(tab, "top", `${frame.top + Math.round(frame.height / 2) - 20}px`);
      tab.dataset.side = value.side;
      tab.addEventListener("click", () => slideVisibility(win, !value.hidden));
      desktop.append(tab);
      relationFrames.set(win, signature(win));
    }
    for (const pair of pairs) {
      const area = areaFor(pair.wins[0]);
      const plan = pairFrames(pair.wins, area, pair.ratio);
      if (!plan) continue;
      const grip = document.createElement("div");
      grip.className = "window-split-separator"; grip.dataset.splitSeparator = "true";
      grip.tabIndex = 0; grip.setAttribute("role", "separator"); grip.setAttribute("aria-label", t("window_split_separator"));
      grip.setAttribute("aria-orientation", plan.vertical ? "horizontal" : "vertical");
      grip.setAttribute("aria-valuenow", String(Math.round(plan.ratio * 100)));
      const minPlan = pairFrames(pair.wins, area, 0), maxPlan = pairFrames(pair.wins, area, 1);
      grip.setAttribute("aria-valuemin", String(Math.ceil(minPlan.ratio * 100)));
      grip.setAttribute("aria-valuemax", String(Math.floor(maxPlan.ratio * 100)));
      Object.entries(plan.vertical ? { left: area.left, top: area.top + plan.first, width: area.width, height: plan.gap }
        : { left: area.left + plan.first, top: area.top, width: plan.gap, height: area.height }).forEach(([key, value]) => setInlineStyleValue(grip, key, `${value}px`));
      grip.dataset.axis = plan.vertical ? "y" : "x";
      grip.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        separatorDrag = { pair, area, plan, pointerId: event.pointerId,
          states: pair.wins.map(snapshot), histories: pair.wins.map((win) => recordFor(win)), relations: relationState(), start: plan.vertical ? event.clientY : event.clientX, next: plan.ratio };
        pair.wins.forEach(forget); grip.setPointerCapture?.(event.pointerId);
      });
      grip.addEventListener("keydown", (event) => {
        const axisKeys = plan.vertical ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
        if (![...axisKeys, "Home"].includes(event.key)) return;
        event.preventDefault();
        const ratio = event.key === "Home" ? 0.5 : pair.ratio + (event.key === axisKeys[0] ? -1 : 1) * (event.shiftKey ? 48 : 16) / plan.length;
        resizePair(pair, ratio); document.querySelector("[data-split-separator]")?.focus();
      });
      desktop.append(grip); pair.wins.forEach((win) => relationFrames.set(win, signature(win)));
    }
  }
  function resizePair(pair, ratio) {
    const plan = pairFrames(pair.wins, areaFor(pair.wins[0]), ratio);
    if (!plan) return result(false, "noRoom");
    return transact(pair.wins, () => pair.wins.every((win, i) => writeFrame(win, plan.frames[i])), () => { pair.ratio = plan.ratio; });
  }
  function cancelSeparator() {
    const drag = separatorDrag; separatorDrag = null;
    if (!drag) return;
    relationBusy = true;
    drag.pair.wins.forEach((win, i) => restore(win, drag.states[i]));
    restoreRelations(drag.relations);
    drag.pair.wins.forEach((win, i) => { const record = drag.histories[i]; if (record?.history.length) remember(win, record.history, record.layout); });
    relationBusy = false;
  }
  document.addEventListener("pointermove", (event) => {
    const drag = separatorDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = (drag.plan.vertical ? event.clientY : event.clientX) - drag.start;
    const plan = pairFrames(drag.pair.wins, drag.area, drag.plan.ratio + delta / drag.plan.length);
    if (!plan) return;
    drag.next = plan.ratio;
    relationBusy = true;
    if (!drag.pair.wins.every((win, i) => writeFrame(win, plan.frames[i]))) { relationBusy = false; cancelSeparator(); return; }
    drag.pair.wins.forEach((win) => relationFrames.set(win, signature(win)));
    const grip = document.querySelector("[data-split-separator]");
    if (grip) setInlineStyleValue(grip, drag.plan.vertical ? "top" : "left", `${(drag.plan.vertical ? drag.area.top : drag.area.left) + plan.first}px`);
    relationBusy = false;
  });
  document.addEventListener("pointerup", (event) => {
    const drag = separatorDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    cancelSeparator();
    const pair = [...pairs].find((p) => p.wins[0] === drag.pair.wins[0] && p.wins[1] === drag.pair.wins[1]);
    if (pair && Math.abs(drag.next - drag.plan.ratio) > 0.0001) resizePair(pair, drag.next);
  });
  document.addEventListener("pointercancel", cancelSeparator);
  new MutationObserver(() => {
    if (relationBusy || separatorDrag) return;
    let changed = false;
    for (const [win, expected] of relationFrames) {
      if (!win.isConnected || win.matches(".is-hidden, .is-minimized, .is-app-hidden, .is-collapsed") || signature(win) !== expected) { clearRelations([win]); changed = true; }
    }
    if (changed) renderRelations();
  }).observe(document.querySelector(".desktop") || document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });

  function batchReady(batch) {
    return batch.every((item) => recordFor(item.win)?.history.at(-1)?.batch === batch);
  }
  function canUndo(win) {
    const entry = recordFor(win)?.history.at(-1);
    return !!entry && (!entry.batch || batchReady(entry.batch));
  }
  function available(win, action) {
    if (!eligible(win)) return false;
    if (action === "undo") return canUndo(win);
    if (action === "peek") return win.classList.contains("is-collapsed");
    if (action === "slideLeft" || action === "slideRight") return !win.classList.contains("is-collapsed") && !!slideFrame(win, action === "slideLeft" ? "left" : "right");
    if (action === "slideExit") return slides.has(win);
    if (action === "slideHide") return slides.has(win) && !slides.get(win).hidden;
    if (action === "slideShow") return !!slides.get(win)?.hidden;
    if (action === "splitChoose") return !win.classList.contains("is-collapsed") && isResizableWindow(win);
    if (action === "pinRestore") return !!window.AISystem6WindowPinControls?.isSuspended();
    if (action === "pinClear" && window.AISystem6WindowPinControls?.isSuspended()) return true;
    if (["pinSuspend", "pinClear", "pinList"].includes(action)) return !!window.AISystem6WindowPinControls?.entries().length;
    if (action === "shade") return !win.classList.contains("is-collapsed");
    if (action === "expand") return win.classList.contains("is-collapsed");
    if (action === "pin" || action === "unpin") return typeof canPinWindow === "function" && canPinWindow(win)
      && (win.dataset.windowPinned === "true") !== (action === "pin");
    if (action === "left" || action === "right") return !!target(win, `${action}Half`);
    if (hasSlot(action)) return !!target(win, action);
    return ["recover", "menu", "up", "down"].includes(action);
  }
  function tile(windows) {
    const group = [...new Set(windows)];
    if (!group.length || group.some((win) => !eligible(win) || win.classList.contains("is-collapsed")
      || (typeof applicationWindowPresentation === "function" && applicationWindowPresentation(win) !== "open"))) return result(false, "unavailable");
    const specs = group.map((win) => {
      const frame = localFrame(win);
      const css = getComputedStyle(win);
      return { fixed: !isResizableWindow(win), width: frame.width, height: frame.height,
        minWidth: Math.max(1, parseFloat(css.minWidth) || 1),
        minHeight: Math.max(1, parseFloat(css.minHeight) || 1, win.querySelector(":scope > .title-bar").getBoundingClientRect().height + 48),
        aspect: typeof aspectRatioForWindow === "function" ? aspectRatioForWindow(win) : 0 };
    });
    const frames = tileFrames(specs, areaFor(group[0]));
    if (!frames) {
      setStatus(t("windows_tile_no_room"));
      return { ok: false, reason: "noRoom" };
    }
    if (group.every((win, index) => {
      const frame = localFrame(win);
      return ["left", "top", "width", "height"].every((key) => Math.abs(frame[key] - frames[index][key]) < 1);
    })) return result(true);
    const batch = group.map((win) => ({ win, state: snapshot(win),
      history: [...(recordFor(win)?.history || [])], layout: recordFor(win)?.layout || null }));
    const tileRelations = relationState();
    batch.relations = { slides: tileRelations.slides.filter(([win]) => group.includes(win)),
      pairs: tileRelations.pairs.filter((pair) => pair.wins.every((win) => group.includes(win))) };
    batch.forEach(({ win }) => forget(win));
    try {
      for (let index = 0; index < group.length; index++) {
        if (!writeFrame(group[index], frames[index])) throw new Error("Window rejected tile frame");
      }
    } catch (error) {
      batch.forEach(({ win, state }) => restore(win, state));
      batch.forEach(({ win, history, layout }) => { if (history.length) remember(win, history, layout); });
      return result(false, "rejected");
    }
    clearRelations(group); renderRelations();
    batch.forEach(({ win, state, history, layout }) => remember(win, [...history, { state, layout, batch }], null));
    group.forEach((win) => win.dispatchEvent(new CustomEvent("ai-system6-window-arranged", { bubbles: true })));
    scheduleWorkingSessionSave?.();
    updateMenuState?.();
    setStatus(t("windows_tiled"));
    return result(true);
  }
  function dispatch(win, action) {
    closeMenu(false);
    if (!eligible(win)) return result(false, "unavailable");
    if (action === "slideLeft" || action === "slideRight") return slide(win, action === "slideLeft" ? "left" : "right");
    if (action === "slideHide" || action === "slideShow") return slideVisibility(win, action === "slideHide");
    if (action === "slideExit") return exitSlide(win);
    if (action === "splitChoose") return chooseSplit(win);
    if (action === "peek") {
      const previous = document.activeElement;
      ensureLazySystemModule("app/core/window-peek.js", "AISystem6WindowPeekLoaded").then(() => {
        if (!win.isConnected || !win.classList.contains("is-collapsed")) return;
        window.AISystem6WindowPeek?.show(win, previous);
        const escape = (event) => { if (event.key === "Escape") { previous?.focus?.({ preventScroll: true }); document.removeEventListener("keydown", escape); } };
        document.addEventListener("keydown", escape);
      });
      return result(true);
    }
    if (["pinSuspend", "pinRestore", "pinClear"].includes(action)) {
      window.AISystem6WindowPinControls?.[({ pinSuspend: "suspend", pinRestore: "restore", pinClear: "clear" })[action]]();
      updateMenuState?.(); return result(true);
    }
    if (action === "pinList") {
      ensureLazySystemModule("app/features/window-browse.js", "AISystem6WindowBrowseLoaded").then(() => window.AISystem6WindowBrowse?.open({ filterEntries: (entry) => entry.pinned }));
      return result(true);
    }
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
      if (!canUndo(win)) return result(false, "stale");
      const batch = record.history.at(-1).batch;
      if (batch) {
        batch.forEach((item) => forget(item.win));
        batch.forEach((item) => restore(item.win, item.state));
        if (batch.relations) restoreRelations(batch.relations, batch.map((item) => item.win));
        batch.forEach((item) => { if (item.history.length) remember(item.win, item.history, item.layout); });
        committed(win);
        updateMenuState?.();
        return result(true);
      }
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
    if (slides.has(win) || [...pairs].some((pair) => pair.wins.includes(win))) {
      return transact([win], () => {
        if (frame) return writeFrame(win, frame);
        if (action === "shade" || action === "expand") toggleCollapsed(win);
        if (action === "recover") return moveIntoView(win);
        return true;
      }, () => clearRelations([win]));
    }
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
    Object.assign(menu.style, { position: "fixed", zIndex: "var(--z-system-menu)", margin: "0" });
    const panel = document.createElement("div");
    panel.className = "menu-popover";
    panel.setAttribute("role", "menu");
    panel.setAttribute("aria-label", label("menu"));
    Object.assign(panel.style, { position: "relative", display: "block", left: "0", top: "0", minWidth: "220px", maxHeight: `${window.innerHeight - 24}px`, overflowY: "auto" });
    const pinAction = win.dataset.windowPinned === "true" ? "unpin" : "pin";
    const actions = ["peek", "slideLeft", "slideRight", ...(slides.has(win) ? [slides.get(win).hidden ? "slideShow" : "slideHide", "slideExit"] : []), "splitChoose", "pinList", window.AISystem6WindowPinControls?.isSuspended() ? "pinRestore" : "pinSuspend", "pinClear", win.classList.contains("is-collapsed") ? "expand" : "shade", pinAction, "fill", "leftHalf", "rightHalf", "leftTwoThirds", "rightTwoThirds", "leftThird", "rightThird", "topLeft", "topRight", "bottomLeft", "bottomRight", "undo", "recover"];
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.setAttribute("role", "menuitem");
      button.dataset.windowshadeAction = action;
      button.textContent = label(action);
      button.disabled = !available(win, action);
      button.setAttribute("aria-disabled", String(button.disabled));
      if (button.disabled) button.title = label(action === "undo" ? "stale" : hasSlot(action) || ["slideLeft", "slideRight", "splitChoose"].includes(action) ? "noRoom" : "unavailable");
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
    cancelSeparator();
    if (!desktopReady()) {
      for (const [win, value] of [...slides]) { restore(win, value.home); detach(win); moveIntoView(win); }
      pairs.clear(); renderRelations();
      for (const win of records.keys()) forget(win); return;
    }
    for (const [win, value] of [...slides]) {
      const frame = slideFrame(win, value.side);
      if (!frame) { restore(win, value.home); detach(win); moveIntoView(win); }
      else { forget(win); writeFrame(win, frame); }
    }
    for (const pair of [...pairs]) {
      const plan = pairFrames(pair.wins, areaFor(pair.wins[0]), pair.ratio);
      if (!plan) { pairs.delete(pair); pair.wins.forEach(moveIntoView); }
      else {
        const before = pair.wins.map(snapshot);
        pair.wins.forEach(forget);
        if (pair.wins.every((win, i) => writeFrame(win, plan.frames[i]))) pair.ratio = plan.ratio;
        else { pair.wins.forEach((win, i) => restore(win, before[i])); pairs.delete(pair); }
      }
    }
    renderRelations();
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
      before: snapshot(win), relations: relationState(), edge: null, edgeAt: 0,
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
  let gestureHint = null;
  let edgeTimer = 0;
  function edgeCandidate(track) {
    if (window.AISystem6WindowShadePreferences?.get("edgeSlideOver") === false || !eligible(track.win) || track.win.classList.contains("is-collapsed")) return null;
    if (Math.hypot(track.lastX - track.x, track.lastY - track.y) < 12) return null;
    const desktop = document.querySelector(".desktop").getBoundingClientRect();
    const area = areaFor(track.win);
    const x = track.lastX - desktop.left, y = track.lastY - desktop.top;
    if (y < area.top + area.height * .2 || y > area.top + area.height * .8) return null;
    const side = x <= area.left + 24 ? "left" : x >= area.left + area.width - 24 ? "right" : null;
    return side && slideFrame(track.win, side) ? side : null;
  }
  function updateEdge(track) {
    const side = edgeCandidate(track);
    if (side === track.edge) return;
    clearTimeout(edgeTimer); edgeTimer = 0;
    track.edge = side; track.edgeAt = performance.now();
    if (side) edgeTimer = setTimeout(() => {
      if (flickTrack === track && edgeCandidate(track) === side) showFlickOutline(track.win, side === "left" ? "slideLeft" : "slideRight");
    }, 450);
  }
  function cancelGesture() {
    const track = flickTrack; flickTrack = null;
    clearTimeout(edgeTimer); edgeTimer = 0; clearFlickOutline();
    if (!track || !track.win.isConnected) return;
    const bar = track.win.querySelector(":scope > .title-bar");
    bar?.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: track.pointerId }));
    restore(track.win, track.before); restoreRelations(track.relations);
  }
  function clearFlickOutline() {
    flickOutline?.remove();
    flickOutline = null;
    gestureHint?.remove(); gestureHint = null;
  }
  function showFlickOutline(win, action) {
    clearFlickOutline();
    if (!win || !action) return;
    const side = action === "slideLeft" ? "left" : action === "slideRight" ? "right" : null;
    const frame = side ? slideFrame(win, side) : hasSlot(action) ? target(win, action) : null;
    if (frame) {
      flickOutline = document.createElement("div");
      flickOutline.className = "window-arrangement-outline";
      flickOutline.dataset.windowOutlineAction = action;
      flickOutline.setAttribute("aria-hidden", "true");
      document.querySelector(".desktop").append(flickOutline);
      Object.entries(frame).forEach(([key, value]) => setInlineStyleValue(flickOutline, key, `${value}px`));
    }
    gestureHint = document.createElement("div"); gestureHint.className = "window-gesture-hint";
    gestureHint.setAttribute("role", "status");
    gestureHint.textContent = side ? t("window_slide_release") : `${t("window_gesture_release")}: ${label(action)}`;
    document.body.append(gestureHint);
    setInlineStyleValue(gestureHint, "left", `${clamp((flickTrack?.lastX || 12) + 12, 12, window.innerWidth - gestureHint.offsetWidth - 12)}px`);
    setInlineStyleValue(gestureHint, "top", `${clamp((flickTrack?.lastY || 40) + 20, 12, window.innerHeight - gestureHint.offsetHeight - 12)}px`);
  }
  document.addEventListener("pointermove", (event) => {
    if (!flickTrack || flickTrack.pointerId !== event.pointerId) return;
    flickTrack.lastX = event.clientX;
    flickTrack.lastY = event.clientY;
    flickTrack.lastT = performance.now();
    // Preview only past the threshold, and never for the shade/expand/fill verbs
    // (they change height, not the desk slot, so they have no frame to show).
    updateEdge(flickTrack);
    if (flickTrack.edge && performance.now() - flickTrack.edgeAt >= 450) { showFlickOutline(flickTrack.win, flickTrack.edge === "left" ? "slideLeft" : "slideRight"); return; }
    const action = flickCandidate(flickTrack, event);
    if (action) showFlickOutline(flickTrack.win, action);
    else clearFlickOutline();
  }, true);
  function settleFlick(event) {
    const track = flickTrack;
    flickTrack = null;
    clearTimeout(edgeTimer); edgeTimer = 0;
    clearFlickOutline();
    if (!gesturesEnabled || !track || track.pointerId !== event.pointerId) return;
    if (event.type === "pointercancel") return;
    const win = track.win;
    if (!eligible(win)) return;
    // Bubble phase: run after wireup's title-bar drag stopMove so Classic
    // outline drags have already committed the window frame (followed check).
    if (track.edge && performance.now() - track.edgeAt >= 450 && edgeCandidate(track) === track.edge) { slide(win, track.edge); return; }
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
      cancelSeparator();
      cancelGesture();
      flickTrack = null;
      clearFlickOutline();
      closeMenu();
    }
  });
  document.addEventListener("focusin", (event) => { if (menu && !menu.contains(event.target)) closeMenu(false); });
  window.addEventListener("blur", () => { cancelSeparator(); cancelGesture(); closeMenu(false); lastTurn = null; flickTrack = null; clearFlickOutline(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelSeparator(); cancelGesture(); closeMenu(false); lastTurn = null; flickTrack = null; clearFlickOutline(); } });
  document.addEventListener("ai-system6-themechange", () => { reflow(); closeMenu(); for (const win of records.keys()) forget(win); flickTrack = null; clearFlickOutline(); });
  window.addEventListener("resize", () => { if (!resizeFrame) resizeFrame = requestAnimationFrame(reflow); flickTrack = null; clearFlickOutline(); });
  // Removed DOM nodes need no long-lived per-window observer or history.
  new MutationObserver(() => {
    for (const win of records.keys()) if (!win.isConnected) forget(win);
    if (menuWindow && !eligible(menuWindow)) closeMenu(false);
    if (flickTrack && (!flickTrack.win.isConnected || !desktopReady())) { flickTrack = null; clearFlickOutline(); }
  }).observe(document.querySelector(".desktop") || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

  globalThis.AISystem6WindowShade = Object.freeze({
    dispatch, direction, openMenu, closeMenu, eligible, areaFor, tile, available,
    classifyFlick, classifyWheel,
    gesturesEnabled: () => gesturesEnabled,
    setGesturesEnabled: (value) => { gesturesEnabled = !!value; if (!gesturesEnabled) { flickTrack = null; clearFlickOutline(); } return gesturesEnabled; },
    cancelInteractions: () => { cancelSeparator(); cancelGesture(); closeMenu(); },
    canUndo, slide, slideVisibility, exitSlide, split, chooseSplit, detach, pairFrames,
    slideState: (win) => slides.get(win) || null,
    pairState: (win) => [...pairs].find((pair) => pair.wins.includes(win)) || null,
    isPinned: (win) => !!win && win.dataset.windowPinned === "true",
    beginPeek: (win) => (typeof beginPeek === "function" ? beginPeek(win) : false),
    endPeek: (win) => (typeof endPeek === "function" ? endPeek(win) : false),
    commitPeek: (win) => (typeof commitPeek === "function" ? commitPeek(win) : false),
    isPeeking: (win) => (typeof isWindowPeeking === "function" ? isWindowPeeking(win) : false),
  });
  globalThis.AISystem6WindowShadeLoaded = true;
})();
