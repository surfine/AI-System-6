// Core runtime module: window-manager.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.


function shouldPromptForTeachTextFileSave() {
  if (teachTextStatusEl?.dataset.statusKey !== "modified") return false;
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  const isLinkedManuscript = project?.manuscriptLinkedToOutline
    && typeof teachTextPipelineLabel === "function"
    && teachTextPipelineLabel();
  if (isLinkedManuscript) {
    setTeachTextStatus("saved");
    return false;
  }
  return true;
}

function teachTextUnsavedChangesMessage() {
  const name = typeof getTeachTextDocumentName === "function"
    ? getTeachTextDocumentName({ fallback: teachTextNameInput?.value?.trim() || t("untitled") })
    : t("untitled");
  return t("unsaved_changes", name);
}

function getWindow(name) {
  return document.querySelector(`[data-window="${name}"]`);
}

const centeredSystemWindowNames = new Set(["about"]);
const writerModeCssOwnedWindows = new Set(["teachText", "assistant", "findPath", "contextPanel"]);
const writerModeCompatibleAppIds = new Set(["writingStudio", "teachText", "clioTalk", "accessories"]);
// Windows the narrow non-writer work-area CSS does NOT own: dialogs, system
// pages, and Desk Accessories keep their own overlay vocabulary, so they keep
// their inline geometry. Mirrors the :not(...) exclusion list in the
// body:not(.is-writer-mode) .window work-area rule (60-responsive.css).
// Which windows keep their own overlay geometry on a narrow screen is a
// property of the window, so it lives in the registry with the rest.
function isCenteredSystemWindow(winOrName) {
  const name = typeof winOrName === "string" ? winOrName : winOrName?.dataset.window;
  return centeredSystemWindowNames.has(name);
}

// The accessory ladder lives in 00-foundation.css. Reading it here keeps one
// source for a width that both the stylesheet and this map have to agree on.
// Function declarations hoist, so the map above may call this.
function readPixelToken(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

function readZLayerToken(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

const windowLayerBaseZ = readZLayerToken("--z-window-layer-base", 10);
const windowLayerCompactBaseZ = readZLayerToken("--z-window-layer-compact-base", 100);
const windowLayerCompactThresholdZ = readZLayerToken("--z-window-layer-compact-threshold", 8800);
const windowLayerMaxZ = readZLayerToken("--z-window-layer-max", 8990);
const windowPinnedZ = readZLayerToken("--z-window-pinned", 9000);
// About is the one window that dims the desk behind it, so it has to sit above
// its own scrim; the pinned-window layer is below it.
const systemModalZ = readZLayerToken("--z-system-modal", 9510);
const windowSaveZ = readZLayerToken("--z-window-save", 8500);
const writingLayoutWindowNames = new Set(["questionSheet", "outline", "sectionDrafts", "teachText", "reviewDesk"]);
const finderCascadeWindowNames = new Set([
  "disk",
  "helpFolder",
  "applications",
  "projects",
  "documents",
  "projectCd",
  "trash",
  "textDisk",
  "controlStripModules",
]);
let quickDraftAssistantHome = null;
let closingQuickDraftAssistantPair = false;

function visibleLayeredWindows() {
  return Array.from(document.querySelectorAll(".window[data-window]:not(.is-hidden):not(.is-app-hidden)"));
}

function compactWindowLayerStack() {
  visibleLayeredWindows()
    .filter((win) => !(writerMode && (writerModeCssOwnedWindows.has(win.dataset.window) || win.dataset.window === "systemHelp")))
    .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0))
    .forEach((win, index) => {
      win.style.zIndex = windowLayerCompactBaseZ + index;
    });
  topZ = windowLayerCompactBaseZ
    + visibleLayeredWindows().filter((win) => !(writerMode && (writerModeCssOwnedWindows.has(win.dataset.window) || win.dataset.window === "systemHelp"))).length;
}

function nextWindowLayerZ(minimum = windowLayerBaseZ) {
  if (topZ >= windowLayerCompactThresholdZ) compactWindowLayerStack();
  topZ = Math.min(windowLayerMaxZ, Math.max(minimum, Number(topZ || 0) + 1));
  return topZ;
}

function setWindowLayerZ(win, value) {
  if (!win) return windowLayerBaseZ;
  // Writing-mode split panes are CSS-owned layers (--z-local-base /
  // --z-local-popover): an inline z-index would override those tokens and
  // stack the panes above menus and popovers.
  if (writerMode && (writerModeCssOwnedWindows.has(win.dataset.window) || win.dataset.window === "systemHelp")) {
    return windowLayerBaseZ;
  }
  const numeric = Number(value);
  const z = Number.isFinite(numeric)
    ? Math.min(windowLayerMaxZ, Math.max(windowLayerBaseZ, numeric))
    : nextWindowLayerZ();
  win.style.zIndex = z;
  topZ = Math.min(windowLayerMaxZ, Math.max(Number(topZ || windowLayerBaseZ), z));
  return z;
}

function windowLayoutGroup(nameOrWin) {
  const name = typeof nameOrWin === "string" ? nameOrWin : nameOrWin?.dataset.window || "";
  if (writingLayoutWindowNames.has(name)) return "writing-flow";
  return getWindowAppId(nameOrWin);
}

function setWindowLayoutMetadata(win) {
  if (!win) return;
  win.dataset.layoutGroup = windowLayoutGroup(win);
}

function markWindowUserPositioned(win) {
  if (!win) return;
  win.dataset.userPositioned = "true";
  win.dataset.systemPositioned = "false";
}

function markWindowSystemPositioned(win) {
  if (!win) return;
  if (win.dataset.userPositioned !== "true") {
    win.dataset.systemPositioned = "true";
  }
  setWindowLayoutMetadata(win);
}

function windowFrame(win) {
  if (!win) return null;
  const rect = win.getBoundingClientRect();
  return {
    left: inlineStyleValue(win, "left") || `${Math.round(rect.left)}px`,
    top: inlineStyleValue(win, "top") || `${Math.round(rect.top)}px`,
    right: inlineStyleValue(win, "right") || "auto",
    width: inlineStyleValue(win, "width") || `${Math.round(rect.width)}px`,
    height: inlineStyleValue(win, "height") || `${Math.round(rect.height)}px`,
    maxHeight: inlineStyleValue(win, "max-height") || "",
    transform: inlineStyleValue(win, "transform") || "none",
  };
}

function applyWindowFrame(win, frame = {}) {
  if (!win || !frame) return;
  setInlineStyleValue(win, "left", frame.left || "");
  setInlineStyleValue(win, "top", frame.top || "");
  setInlineStyleValue(win, "right", frame.right || "auto");
  setInlineStyleValue(win, "width", frame.width || "");
  setInlineStyleValue(win, "height", frame.height || "");
  setInlineStyleValue(win, "max-height", frame.maxHeight || "");
  setInlineStyleValue(win, "transform", frame.transform || "none");
}

// Writing-mode split windows are CSS-owned (60-responsive.css): any inline
// frame left behind by an earlier placement, boot-time spine reflow, or a
// previous non-writer session would override the non-!important CSS rules.
// Drop the stale geometry so the stylesheet owns the layout again.
function clearWindowInlineGeometry(win) {
  if (!win?.style) return;
  for (const property of [
    "left", "right", "top", "bottom", "width", "height", "max-height", "transform",
  ]) {
    win.style.removeProperty(property);
  }
}

function isMobileWorkAreaCssOwnedWindow(win) {
  if (!win || writerMode) return false;
  const name = win.dataset.window;
  if (isMobileOverlayWindow(name)) return false;
  if (
    win.classList.contains("is-mobile-fullscreen")
    || win.classList.contains("is-mobile-dialog")
    || win.classList.contains("is-mobile-system-page")
  ) return false;
  return true;
}

function isMobileWorkAreaCssOwned(win) {
  return isMobileWorkAreaCssOwnedWindow(win) && isNarrowViewport();
}

function snapshotMobileWorkAreaFrame(win) {
  if (!win) return;
  // Only the inline frame matters here: computed fallbacks (e.g. a hidden or
  // mid-resize rect of 0x0) would corrupt the restore. Empty inline values
  // stay empty and the CSS-owned mobile layout keeps them empty.
  win.dataset.mobileWorkAreaRestoreLeft = inlineStyleValue(win, "left");
  win.dataset.mobileWorkAreaRestoreTop = inlineStyleValue(win, "top");
  win.dataset.mobileWorkAreaRestoreRight = inlineStyleValue(win, "right");
  win.dataset.mobileWorkAreaRestoreWidth = inlineStyleValue(win, "width");
  win.dataset.mobileWorkAreaRestoreHeight = inlineStyleValue(win, "height");
  win.dataset.mobileWorkAreaRestoreMaxHeight = inlineStyleValue(win, "max-height");
  win.dataset.mobileWorkAreaRestoreTransform = inlineStyleValue(win, "transform");
  win.dataset.mobileWorkAreaSnapshot = "true";
}

function restoreMobileWorkAreaFrame(win) {
  if (!win) return;
  setInlineStyleValue(win, "left", win.dataset.mobileWorkAreaRestoreLeft || "");
  setInlineStyleValue(win, "top", win.dataset.mobileWorkAreaRestoreTop || "");
  setInlineStyleValue(win, "right", win.dataset.mobileWorkAreaRestoreRight || "");
  setInlineStyleValue(win, "width", win.dataset.mobileWorkAreaRestoreWidth || "");
  setInlineStyleValue(win, "height", win.dataset.mobileWorkAreaRestoreHeight || "");
  setInlineStyleValue(win, "max-height", win.dataset.mobileWorkAreaRestoreMaxHeight || "");
  setInlineStyleValue(win, "transform", win.dataset.mobileWorkAreaRestoreTransform || "");
  delete win.dataset.mobileWorkAreaRestoreLeft;
  delete win.dataset.mobileWorkAreaRestoreTop;
  delete win.dataset.mobileWorkAreaRestoreRight;
  delete win.dataset.mobileWorkAreaRestoreWidth;
  delete win.dataset.mobileWorkAreaRestoreHeight;
  delete win.dataset.mobileWorkAreaRestoreMaxHeight;
  delete win.dataset.mobileWorkAreaRestoreTransform;
  delete win.dataset.mobileWorkAreaSnapshot;
}

// Narrow non-writer work-area windows are CSS-owned: snapshot + drop stale
// desktop inline frames on the way in, restore them on the way back out so a
// wide arrangement survives a phone detour. Mirrors the mobile
// work-area rule in 60-responsive.css (no !important after the migration).
function syncMobileWorkAreaFrames() {
  if (writerMode) return;
  const narrow = isNarrowViewport();
  // Managed windows only: a `.window` with no data-window was never opened by
  // the manager. Theme Lab shows real windows as specimens so the era paints
  // them, and a sweep that hides or re-frames one empties the board.
  document.querySelectorAll(".window[data-window]").forEach((win) => {
    if (!isMobileWorkAreaCssOwnedWindow(win)) return;
    if (win.classList.contains("is-hidden") || win.classList.contains("is-app-hidden")) return;
    if (narrow) {
      if (win.dataset.mobileWorkAreaSnapshot !== "true") {
        snapshotMobileWorkAreaFrame(win);
        clearWindowInlineGeometry(win);
      }
    } else if (win.dataset.mobileWorkAreaSnapshot === "true") {
      restoreMobileWorkAreaFrame(win);
    }
  });
}

function windowFrameValue(value, fallback = "") {
  if (typeof value === "number" && Number.isFinite(value)) return `${Math.round(value)}px`;
  if (typeof value === "string") return value;
  return fallback;
}

function placeWindowForExplicitLayout(win, frame = {}, options = {}) {
  if (!win) return;
  clearFinderContentFit(win);
  const height = windowFrameValue(frame.height);
  win.classList.remove("is-collapsed", "is-desklet");
  applyWindowFrame(win, {
    left: windowFrameValue(frame.left),
    top: windowFrameValue(frame.top),
    right: windowFrameValue(frame.right, "auto"),
    width: windowFrameValue(frame.width),
    height,
    maxHeight: windowFrameValue(frame.maxHeight, height),
    transform: windowFrameValue(frame.transform, "none"),
  });
  win.dataset.zoomed = "false";
  if (options.userPositioned) markWindowUserPositioned(win);
  else markWindowSystemPositioned(win);
}

function keyboardInsetValue() {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--keyboard-inset")) || 0;
}

// A system-placed window must stay reachable: if its default frame (creative
// labs and other wide windows after the writing spine) would push the right
// or bottom edge past the viewport, shift it back inside. User-dragged
// windows are never touched here — the user owns their position.
function clampWindowToViewport(win, margin = 16) {
  if (!win || win.dataset.userPositioned === "true") return;
  let r = win.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  // The keyboard owns the bottom; --keyboard-inset is 0 at rest.
  const keyboardInset = keyboardInsetValue();
  const vh = (window.innerHeight || document.documentElement.clientHeight) - keyboardInset;
  const horizontalMargin = Math.min(margin, Math.max(0, Math.floor((vw - r.width) / 2)));
  const verticalMargin = Math.min(margin, Math.max(0, Math.floor((vh - r.height) / 2)));
  const maxH = Math.max(160, Math.round(vh - Math.max(verticalMargin, r.top) - verticalMargin));
  if (r.height > maxH) {
    setInlineStyleValue(win, "height", maxH + "px");
    setInlineStyleValue(win, "max-height", maxH + "px");
    r = win.getBoundingClientRect();
  }
  const maxLeft = Math.max(horizontalMargin, vw - r.width - horizontalMargin);
  const maxTop = Math.max(verticalMargin, vh - r.height - verticalMargin);
  const nextLeft = Math.min(Math.max(r.left, horizontalMargin), maxLeft);
  const nextTop = Math.min(Math.max(r.top, verticalMargin), maxTop);
  if (Math.abs(nextLeft - r.left) >= 0.5) setInlineStyleValue(win, "left", Math.round(nextLeft) + "px");
  if (Math.abs(nextTop - r.top) >= 0.5) setInlineStyleValue(win, "top", Math.round(nextTop) + "px");
}

function reconcileVisibleSystemWindowsToViewport() {
  document.querySelectorAll(".window[data-window]:not(.is-hidden)").forEach((win) => clampWindowToViewport(win));
}

function saveKeyboardWindowFrame(win) {
  const frame = windowFrame(win);
  for (const [key, value] of Object.entries(frame)) {
    win.dataset[`keyboardRestore${key[0].toUpperCase()}${key.slice(1)}`] = value;
  }
  win.dataset.keyboardRestoreActive = "true";
}

function restoreKeyboardWindowFrame(win) {
  if (!win || win.dataset.keyboardRestoreActive !== "true") return;
  applyWindowFrame(win, {
    left: win.dataset.keyboardRestoreLeft || "",
    top: win.dataset.keyboardRestoreTop || "",
    right: win.dataset.keyboardRestoreRight || "auto",
    width: win.dataset.keyboardRestoreWidth || "",
    height: win.dataset.keyboardRestoreHeight || "",
    maxHeight: win.dataset.keyboardRestoreMaxHeight || "",
    transform: win.dataset.keyboardRestoreTransform || "none",
  });
  Object.keys(win.dataset).forEach((key) => {
    if (key.startsWith("keyboardRestore")) delete win.dataset[key];
  });
}

// Pull the focused window above the keys; put its frame back on close.
// CSS-owned roles and user-dragged windows are left alone.
function syncKeyboardWindowFrame() {
  const inset = keyboardInsetValue();
  const current = document.activeElement?.closest?.(".window") || null;
  const adjusted = document.querySelector('.window[data-keyboard-restore-active="true"]');
  if (!inset) { if (adjusted) restoreKeyboardWindowFrame(adjusted); return; }
  if (!current) return;
  if (adjusted !== current) restoreKeyboardWindowFrame(adjusted);
  if (current.dataset.userPositioned === "true" || current.className.includes("is-mobile-")) return;
  if (current.dataset.keyboardRestoreActive !== "true") saveKeyboardWindowFrame(current);
  clampWindowToViewport(current);
}

function saveSideAskRestoreFrame(win) {
  if (!win || win.dataset.sideaskRestoreActive === "true") return;
  const frame = windowFrame(win);
  win.dataset.sideaskRestoreActive = "true";
  win.dataset.sideaskRestoreLeft = frame.left;
  win.dataset.sideaskRestoreTop = frame.top;
  win.dataset.sideaskRestoreRight = frame.right;
  win.dataset.sideaskRestoreWidth = frame.width;
  win.dataset.sideaskRestoreHeight = frame.height;
  win.dataset.sideaskRestoreMaxHeight = frame.maxHeight;
  win.dataset.sideaskRestoreTransform = frame.transform;
  win.dataset.sideaskRestoreZoomed = win.dataset.zoomed || "false";
}

function restoreSideAskFrame(win) {
  if (!win || win.dataset.sideaskRestoreActive !== "true") return;
  applyWindowFrame(win, {
    left: win.dataset.sideaskRestoreLeft || "",
    top: win.dataset.sideaskRestoreTop || "",
    right: win.dataset.sideaskRestoreRight || "auto",
    width: win.dataset.sideaskRestoreWidth || "",
    height: win.dataset.sideaskRestoreHeight || "",
    maxHeight: win.dataset.sideaskRestoreMaxHeight || "",
    transform: win.dataset.sideaskRestoreTransform || "none",
  });
  win.dataset.zoomed = win.dataset.sideaskRestoreZoomed || "false";
  delete win.dataset.sideaskRestoreActive;
  delete win.dataset.sideaskRestoreLeft;
  delete win.dataset.sideaskRestoreTop;
  delete win.dataset.sideaskRestoreRight;
  delete win.dataset.sideaskRestoreWidth;
  delete win.dataset.sideaskRestoreHeight;
  delete win.dataset.sideaskRestoreMaxHeight;
  delete win.dataset.sideaskRestoreTransform;
  delete win.dataset.sideaskRestoreZoomed;
  // The DocMap window just changed size back from its SideAsk pane; refit the
  // canvas so the map fills the restored window instead of the old pane.
  if (win.dataset.window === "docMap" && typeof queueDocMapFitToView === "function") {
    queueDocMapFitToView(8);
  }
}

function restoreSideAskFrames() {
  document.querySelectorAll(".window[data-sideask-restore-active='true']").forEach(restoreSideAskFrame);
}

function rectsOverlap(a, b, gap = 10) {
  if (!a || !b) return false;
  return !(
    a.right + gap <= b.left
    || a.left >= b.right + gap
    || a.bottom + gap <= b.top
    || a.top >= b.bottom + gap
  );
}

function windowPlacementMetric(property, fallback) {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(property));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

// The Control Strip floats at the bottom edge when expanded. Default window
// placement subtracts its thickness so a freshly opened window does not land
// under the strip; the user can still drag a window over it freely. The
// reserve is a body class toggled by the strip module, not a measurement of
// the strip itself.
function controlStripPlacementReserve() {
  return document.body.classList.contains("control-strip-expanded")
    ? windowPlacementMetric("--control-strip-thickness", 26)
    : 0;
}

function windowPlacementOverlapArea(rect, obstacle, gap = 0) {
  const width = Math.max(0, Math.min(rect.right, obstacle.right + gap) - Math.max(rect.left, obstacle.left - gap));
  const height = Math.max(0, Math.min(rect.bottom, obstacle.bottom + gap) - Math.max(rect.top, obstacle.top - gap));
  return width * height;
}

function windowPlacementRect(left, top, width, height, desktopRect) {
  return {
    left: desktopRect.left + left,
    top: desktopRect.top + top,
    right: desktopRect.left + left + width,
    bottom: desktopRect.top + top + height,
  };
}

function windowHasOwnedPlacement(win) {
  const name = win?.dataset.window || "";
  return !win
    || writerMode
    || isPortraitDocumentFlow()
    || centeredSystemWindowNames.has(name)
    || name === "saveChat"
    || writingLayoutWindowNames.has(name)
    || isAssistantSidecarWindow(name)
    || isDeskAccessoryPlacementWindow(name);
}

// A new floating window never moves an old one. It first searches the usable
// desk for a frame with a real air gap around every visible peer. Only when the
// desk cannot hold another clear frame does it overlap, following a stable
// down-right staircase from the frontmost old window so every title remains
// reachable. Full-work-area surfaces keep their authored placement because no
// alternative frame of the same size can reduce their overlap.
function placeNewWindowAvoidingVisibleWindows(win) {
  if (windowHasOwnedPlacement(win) || win.dataset.userPositioned === "true") return false;
  if (writerMode && writerModeCssOwnedWindows.has(win.dataset.window)) return false;
  if (writerMode && win.dataset.window === "systemHelp") return false;
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  if (!desktopRect) return false;

  const edge = windowPlacementMetric("--window-placement-edge", 18);
  const gap = windowPlacementMetric("--window-placement-gap", 14);
  const stepX = Math.max(1, windowPlacementMetric("--window-placement-step-x", 28));
  const stepY = Math.max(1, windowPlacementMetric("--window-placement-step-y", 24));
  const avoidance = getDesktopAvoidanceInsets({ margin: edge, spineGap: edge, iconGap: 48 });
  const rect = win.getBoundingClientRect();
  const width = rect.width || 360;
  const height = rect.height || 280;
  const stripReserve = (typeof document !== "undefined" && document.body?.classList.contains("control-strip-expanded"))
    ? windowPlacementMetric("--control-strip-thickness", 26)
    : 0;
  const minLeft = Math.max(edge, avoidance.left);
  const minTop = Math.max(edge, writingSpineAlignedTopForWindow(win, edge));
  const maxLeft = Math.max(minLeft, desktopRect.width - avoidance.right - edge - width);
  const maxTop = Math.max(minTop, desktopRect.height - edge - stripReserve - height);
  const workWidth = maxLeft - minLeft + width;
  const workHeight = maxTop - minTop + height;
  if (width + gap >= workWidth || height + gap >= workHeight) return false;

  const peers = Array.from(document.querySelectorAll(".window[data-window]:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)"))
    .filter((peer) => peer !== win)
    .map((peer) => ({ peer, rect: peer.getBoundingClientRect() }))
    .filter(({ rect: peerRect }) => peerRect.width > 0 && peerRect.height > 0)
    .sort((a, b) => Number(b.peer.style.zIndex || 0) - Number(a.peer.style.zIndex || 0));
  if (!peers.length) return false;

  const anchor = {
    left: Math.round(clampNumber(rect.left - desktopRect.left, minLeft, maxLeft)),
    top: Math.round(clampNumber(rect.top - desktopRect.top, minTop, maxTop)),
  };
  const candidates = [];
  const candidateKeys = new Set();
  const addCandidate = (left, top) => {
    const candidate = {
      left: Math.round(clampNumber(left, minLeft, maxLeft)),
      top: Math.round(clampNumber(top, minTop, maxTop)),
    };
    const key = `${candidate.left}:${candidate.top}`;
    if (!candidateKeys.has(key)) {
      candidateKeys.add(key);
      candidates.push(candidate);
    }
  };

  addCandidate(anchor.left, anchor.top);
  peers.forEach(({ rect: peerRect }) => {
    const peerLeft = peerRect.left - desktopRect.left;
    const peerTop = peerRect.top - desktopRect.top;
    addCandidate(peerRect.right - desktopRect.left + gap, peerTop);
    addCandidate(peerLeft - width - gap, peerTop);
    addCandidate(peerLeft, peerRect.bottom - desktopRect.top + gap);
    addCandidate(peerLeft, peerTop - height - gap);
  });
  for (let top = minTop; top <= maxTop; top += stepY) {
    for (let left = minLeft; left <= maxLeft; left += stepX) addCandidate(left, top);
  }
  addCandidate(maxLeft, maxTop);

  candidates.sort((a, b) => (
    Math.abs(a.left - anchor.left) + Math.abs(a.top - anchor.top)
    - Math.abs(b.left - anchor.left) - Math.abs(b.top - anchor.top)
  ));
  let placement = candidates.find((candidate) => {
    const candidateRect = windowPlacementRect(candidate.left, candidate.top, width, height, desktopRect);
    return peers.every(({ rect: peerRect }) => !rectsOverlap(candidateRect, peerRect, gap));
  });

  if (!placement) {
    const frontRect = peers[0].rect;
    const originLeft = clampNumber(frontRect.left - desktopRect.left, minLeft, maxLeft);
    const originTop = clampNumber(frontRect.top - desktopRect.top, minTop, maxTop);
    const columns = Math.max(1, Math.floor((maxLeft - minLeft) / stepX) + 1);
    const rows = Math.max(1, Math.floor((maxTop - minTop) / stepY) + 1);
    const originColumn = Math.round((originLeft - minLeft) / stepX);
    const originRow = Math.round((originTop - minTop) / stepY);
    const cascadeCandidates = [];
    const rungCount = Math.min(48, Math.max(columns, rows) * 2);
    for (let rung = 1; rung <= rungCount; rung += 1) {
      const left = Math.min(maxLeft, minLeft + ((originColumn + rung) % columns) * stepX);
      const top = Math.min(maxTop, minTop + ((originRow + rung) % rows) * stepY);
      const candidateRect = windowPlacementRect(left, top, width, height, desktopRect);
      const overlap = peers.reduce((total, { rect: peerRect }) => (
        total + windowPlacementOverlapArea(candidateRect, peerRect, gap)
      ), 0);
      const conflicts = peers.reduce((total, { rect: peerRect }) => (
        total + (rectsOverlap(candidateRect, peerRect, gap) ? 1 : 0)
      ), 0);
      cascadeCandidates.push({ left, top, overlap, conflicts, rung });
    }
    cascadeCandidates.sort((a, b) => (
      a.conflicts - b.conflicts || a.overlap - b.overlap || a.rung - b.rung
    ));
    placement = cascadeCandidates[0] || anchor;
  }

  setInlineStyleValue(win, "left", `${Math.round(placement.left)}px`);
  setInlineStyleValue(win, "top", `${Math.round(placement.top)}px`);
  setInlineStyleValue(win, "right", "auto");
  setInlineStyleValue(win, "transform", "none");
  return true;
}

async function prepareFinderModeForApp(appId) {
  if (isMultiFinderMode()) return true;
  const writerModeCompatible = writerModeCompatibleAppIds.has(appId)
    || (sideAskEnabled && isSideAskPairApp(appId));
  if (writerMode && !writerModeCompatible) {
    // Awaited: leaving defers itself behind a transition that is still in
    // flight, and the rest of this function reads writerMode.
    await leaveWriterMode();
  } else if (writerMode) {
    return true;
  }
  if(appId==="accessories")return true;
  const allowSideAskPair = sideAskEnabled && isSideAskPairApp(appId);
  if (sideAskEnabled && !isSideAskPairApp(appId)) clearSideAskMode();
  const windowsToHide = Array.from(document.querySelectorAll(".window[data-window]:not(.is-hidden)"))
    .filter((win) => {
      // On a phone the foregrounded app is the full-screen backdrop, so a modal,
      // system window, or desk accessory floats over it instead of replacing it.
      // Only those may skip single-tasking: another real app must still quit the
      // running one, or Finder mode would silently become MultiFinder on a phone.
      if (
        isPortraitDocumentFlow()
        && win.classList.contains("is-mobile-fullscreen")
        && !isFinderModeSingleTaskApp(appId)
      ) return false;
      // Find/Change edits the window being brought forward, so bringing that
      // window forward must not dismiss it. Narrowly scoped to the apps it can
      // act on, the same shape as the SideAsk pair exemption below.
      if (win.dataset.window === "findChange" && ["teachText", "writingStudio"].includes(appId)) return false;
      const currentAppId = getWindowAppId(win);
      if (finderModeForegroundAppIds.has(currentAppId)) {
        return isFinderModeSingleTaskApp(appId) || allowSideAskPair;
      }
      if (allowSideAskPair && isSideAskPairApp(currentAppId)) return false;
      if (!isFinderModeSingleTaskApp(appId)) return isFinderModeSingleTaskApp(currentAppId);
      return currentAppId !== appId && isFinderModeSingleTaskApp(currentAppId);
    });

  for (const win of windowsToHide) {
    if (win.dataset.window === "teachText" && shouldPromptForTeachTextFileSave()) {
      const result = await showSystemModal(teachTextUnsavedChangesMessage(), "save");
      if (result === "cancel") return false;
      if (result === "yes") {
        const saved = await saveTextDocument();
        if (!saved) return false;
      } else {
        setTeachTextStatus("saved");
      }
    }
  }

  windowsToHide.forEach((win) => {
    if (win.dataset.window === "themeLab") window.AISystem6ThemeLab?.cleanup?.();
    win.classList.add("is-hidden");
    win.classList.remove("is-app-hidden", "is-active");
    delete win.dataset.appHiddenCollapsed;
    forgetWindowFromRunningApps(win.dataset.window);
  });
  hiddenAppIds.clear();
  updateQuickDraftFocusChrome();
  return true;
}

function updateQuickDraftFocusChrome() {
  const quickDraft = getWindow("quickDraft");
  const visible = !isMultiFinderMode()
    && quickDraft
    && !quickDraft.classList.contains("is-hidden")
    && !quickDraft.classList.contains("is-app-hidden");
  document.body.classList.toggle("quick-draft-focus", !!visible);
}

function setSideAskAnchorApp(appId = "teachText", ownerAppId = appId) {
  sideAskAnchorAppId = appId || "teachText";
  sideAskAnchorOwnerAppId = ownerAppId || sideAskAnchorAppId;
  sideAskEnabled = true;
  updateSideAskSourceChrome();
}

function clearSideAskMode() {
  restoreQuickDraftIntegratedAssistant();
  restoreSideAskFrames();
  const wasQuickDraftSideAsk = sideAskAnchorAppId === "quickDraft";
  sideAskEnabled = false;
  sideAskAnchorAppId = "teachText";
  sideAskAnchorOwnerAppId = "teachText";
  if (wasQuickDraftSideAsk && typeof exitQuickDraftClioTalkSession === "function") {
    exitQuickDraftClioTalkSession({ restore: true });
  } else if (typeof exitSideAskClioTalkSession === "function") {
    exitSideAskClioTalkSession({ restore: true });
  }
  updateSideAskSourceChrome();
}

function sideAskSourceDisplayLabel(appId = sideAskAnchorAppId) {
  if (appId === "teachText") {
    const title = typeof getTeachTextDocumentName === "function"
      ? getTeachTextDocumentName({ fallback: teachTextNameInput?.value?.trim() || t("teachtext_label") })
      : t("teachtext_label");
    return `${t("teachtext_label")} / ${title}`;
  }
  if (appId === "quickDraft") return t("quick_draft_label");
  if (appId === "lightroom") return t("lightroom_title");
  if (appId === "reader") return currentReaderPage?.title
    ? `${t("reader")} / ${currentReaderPage.title}`
    : t("reader");
  if (appId === "scrapbook") return t("scrapbook");
  if (appId === "docMap") return currentDocMap?.sourceLabel
    ? `${t("docmap")} / ${currentDocMap.sourceLabel}`
    : t("docmap");
  if (appId === "clioStage") return typeof clioStageState !== "undefined" && clioStageState?.source?.title
    ? `${t("clio_stage_label")} / ${clioStageState.source.title}`
    : t("clio_stage_label");
  if (appId === "timeMachine") {
    const page = typeof currentTimeMachinePage !== "undefined" ? currentTimeMachinePage : null;
    const title = page?.reader?.title || page?.title || "";
    return title ? `${t("time_machine")} / ${title}` : t("time_machine");
  }
  if (appId === "imagePromptStudio") return t("image_prompt_studio_label");
  return t("sideask");
}

function focusSideAskSource() {
  if (!sideAskEnabled || isMultiFinderMode()) return;
  const windowName = {
    quickDraft: "quickDraft",
    teachText: "teachText",
    reader: "reader",
    scrapbook: "scrapbook",
    docMap: "docMap",
    clioStage: "clioStage",
    timeMachine: "timeMachine",
    imagePromptStudio: "imagePromptStudio",
  }[sideAskAnchorAppId];
  const sourceWindow = windowName ? getWindow(windowName) : null;
  if (sourceWindow) focusWindow(sourceWindow);
  // On a phone the pair cannot share a screen; returning to the source must
  // also re-foreground it in the single full-screen app shell.
  if (isPortraitDocumentFlow() || isNarrowViewport()) {
    syncMobileAppForeground();
  }
}

function updateSideAskSourceChrome() {
  const askForms = {
    reader: readerAskForm,
    scrapbook: scrapbookAskForm,
    docMap: docMapAskForm,
    clioStage: clioStageAskForm,
    // Time Machine is a lazy module, so its form is read from the document
    // rather than the eager dom-handles bundle.
    timeMachine: document.querySelector("#time-machine-ask-form"),
  };
  Object.entries(askForms).forEach(([appId, form]) => {
    if (!form) return;
    form.hidden = !isMultiFinderMode() && sideAskEnabled && sideAskAnchorAppId === appId;
  });
  const quickDraftSideAsk = !isMultiFinderMode() && sideAskEnabled && sideAskAnchorAppId === "quickDraft";
  const sideAskActive = !isMultiFinderMode() && sideAskEnabled;
  if (!quickDraftSideAsk) restoreQuickDraftIntegratedAssistant();
  const assistant = getWindow("assistant");
  assistant?.classList.toggle("is-sideask", sideAskActive);
  if (assistant) assistant.dataset.sideaskAnchor = sideAskActive ? sideAskAnchorAppId : "";
  const modeStrip = document.getElementById("sideask-mode-strip");
  if (modeStrip) modeStrip.hidden = !sideAskActive;
  const sourceName = document.getElementById("sideask-source-name");
  if (sourceName && sideAskActive) {
    sourceName.textContent = t("sideask_paired_with", sideAskSourceDisplayLabel());
  }
  document.getElementById("compose-tools-quick-draft")?.classList.add("is-hidden");
  document.querySelectorAll(".compose-tools-quick-draft-import").forEach((item) => {
    item.classList.add("is-hidden");
  });
  const quickDraftHint = document.getElementById("quick-draft-cliotalk-hint");
  if (quickDraftHint) {
    quickDraftHint.classList.add("is-hidden");
  }
  // Like TeachText, Quick Draft keeps an explicit in-window SideAsk command.
  // Its label describes whether it will open the pair or return focus to it.
  const quickDraftReturnSideAsk = document.getElementById("quick-draft-return-sideask");
  if (quickDraftReturnSideAsk) {
    const labelKey = quickDraftSideAsk ? "quick_draft_return_sideask" : "quick_draft_show_sideask";
    quickDraftReturnSideAsk.classList.remove("is-hidden");
    quickDraftReturnSideAsk.dataset.i18n = labelKey;
    quickDraftReturnSideAsk.textContent = t(labelKey);
    const unavailable = isMultiFinderMode() || (typeof canUseSideAsk === "function" && !canUseSideAsk());
    quickDraftReturnSideAsk.disabled = unavailable;
    quickDraftReturnSideAsk.dataset.balloonHelpDisabled = "sideask_unavailable";
  }
  const composeToolsToggle = document.getElementById("compose-tools-toggle");
  if (composeToolsToggle && typeof t === "function") {
    composeToolsToggle.setAttribute("aria-label", t("compose_tools"));
    composeToolsToggle.title = t("compose_tools");
  }
  if (typeof syncPromptPlaceholder === "function") syncPromptPlaceholder();
  const assistantTitle = document.getElementById("assistant-title");
  if (assistantTitle && typeof t === "function") {
    assistantTitle.textContent = sideAskActive ? t("sideask_title") : t("assistant_title");
  }
}

function quickDraftClioTalkSlot() {
  return document.getElementById("quick-draft-cliotalk-slot");
}

function restoreQuickDraftIntegratedAssistant() {
  const assistant = getWindow("assistant");
  const slot = quickDraftClioTalkSlot();
  const pane = getWindow("quickDraft")?.querySelector(".draft-desk-pane");
  pane?.classList.remove("has-integrated-cliotalk");
  assistant?.classList.remove("is-quick-draft-integrated");
  if (!assistant || assistant.parentElement !== slot) return;
  const home = quickDraftAssistantHome;
  quickDraftAssistantHome = null;
  if (home?.parent?.isConnected) home.parent.insertBefore(assistant, home.nextSibling?.isConnected ? home.nextSibling : null);
  else document.querySelector(".desktop")?.prepend(assistant);
}

function resetAssistantForStandalonePlacement(win = getWindow("assistant")) {
  if (!win) return;
  win.dataset.userPositioned = "false";
  markWindowSystemPositioned(win);
  win.style.left = "";
  win.style.top = "";
  win.style.right = "auto";
  win.style.width = "";
  win.style.height = "";
  win.style.maxHeight = "";
  win.style.transform = "none";
}

async function toggleSideAsk() {
  if (!canUseSideAsk()) {
    setStatus(t("sideask_unavailable"));
    return;
  }

  if (!sideAskEnabled) {
    // SideAsk belongs to the surface it is asked from. Every writing-route
    // window carries the command now, so pairing it permanently with the
    // manuscript would answer a question about the Question Sheet next to a
    // document the writer is not looking at.
    const source = (typeof currentWritingRouteStop === "function" && currentWritingRouteStop()) || "teachText";
    const canOpen = await arrangeWindowAssistantSplit(source);
    if (!canOpen) return;
    setStatus(t("sideask_on"));
  } else {
    const sourceWindowName = sideAskAnchorAppId;
    const returningToQuickDraft = sourceWindowName === "quickDraft";
    clearSideAskMode();
    const sourceWindow = getWindow(sourceWindowName);
    if (sourceWindow) focusWindow(sourceWindow);
    if (returningToQuickDraft) {
      window.AISystem6QuickDraftRuntime?.setQuickDraftStatus?.(t("quick_draft_ready"), { live: false });
    }
    setStatus(t("sideask_off"));
  }
  updateMenuState();
}

async function toggleQuickDraftSideAsk() {
  if (!canUseSideAsk()) {
    window.AISystem6QuickDraftRuntime?.setQuickDraftStatus?.(t("sideask_unavailable"));
    return false;
  }
  const active = sideAskEnabled && sideAskAnchorAppId === "quickDraft";
  if (active) {
    clearSideAskMode();
    const assistantWindow = getWindow("assistant");
    if (assistantWindow && !assistantWindow.classList.contains("is-hidden")) {
      await closeWindow("assistant", true);
    }
    const sourceWindow = getWindow("quickDraft");
    if (sourceWindow) focusWindow(sourceWindow);
    window.AISystem6QuickDraftRuntime?.setQuickDraftStatus?.(t("quick_draft_ready"), { live: false });
  } else {
    const paired = await arrangeWindowAssistantSplit("quickDraft");
    if (!paired) return false;
  }
  updateMenuState();
  return true;
}

async function quitApp(appId = activeAppId) {
  if (nonQuittableAppIds.has(appId)) return;
  if (appId === "writingStudio") {
    await exitWritingStudio();
    return;
  }

  // Quitting is the total release: an application that declared onDispose
  // frees its engine, canvas, timers and audio here. The explicit game calls
  // below stay as the floor for a build whose lifecycle never registered.
  const lifecycleDisposed = await (window.AISystem6ApplicationRegistry?.disposeApplication?.(appId, "quit") || false);

  if (appId === "openttd") {
    // Flush the game's browser-side storage, then tear the iframe down so
    // the wasm main loop and its memory actually stop.
    window.AISystem6OpenTTD?.handleQuit?.();
  }

  if (appId === "doom") {
    // The iframe owns IDBFS. Ask it to release held input and flush storage;
    // an acknowledgement or bounded timeout then reclaims the Wasm instance.
    window.AISystem6Doom?.handleQuit?.();
  }

  if (appId === "bonsaiCity" && !lifecycleDisposed) {
    // Bonsai City saves through the shared write fence on quit; the shell
    // also stops its pacing loop so a closed window never keeps ticking. This
    // fallback is used only when the lifecycle was not registered; otherwise
    // the awaited onDispose above already performed the same total release.
    const detached = await window.AISystem6BonsaiCity?.detach?.();
    if (detached === false) return;
  }

  if (appId === "teachText" && shouldPromptForTeachTextFileSave()) {
    const result = await showSystemModal(teachTextUnsavedChangesMessage(), "save");
    if (result === "cancel") return;
    if (result === "yes") {
      const saved = await saveTextDocument();
      if (!saved) return;
    } else {
      setTeachTextStatus("saved");
    }
  }

  windowsForApp(appId).forEach((win) => {
    win.classList.add("is-hidden");
    win.classList.remove("is-app-hidden", "is-active");
    delete win.dataset.appHiddenCollapsed;
    forgetWindowFromRunningApps(win.dataset.window);
  });
  runningApps.delete(appId);
  hiddenAppIds.delete(appId);
  activeAppId = "finder";
  updateQuickDraftFocusChrome();
  switchToApp("finder");
  setStatus(t("app_quit", multiFinderAppLabels[appId] || appId));
  scheduleWorkingSessionSave?.();
}

function resetDesktopScrollOffset() {
  if (isPortraitDocumentFlow()) return;
  const desktop = document.querySelector(".desktop");
  if (!desktop) return;
  const reset = () => {
    desktop.scrollLeft = 0;
    desktop.scrollTop = 0;
  };
  reset();
  requestAnimationFrame(reset);
}

function installDesktopScrollLock() {
  const desktop = document.querySelector(".desktop");
  if (!desktop || desktop.dataset.scrollLockInstalled === "true") return;
  desktop.dataset.scrollLockInstalled = "true";
  desktop.addEventListener("scroll", resetDesktopScrollOffset, { passive: true });
  resetDesktopScrollOffset();
}

function focusWindow(win, reveal=false) {
  if (!win) return;
  if (reveal && isPortraitDocumentFlow()) {
    revealWindowTitleInPortraitFlow(win);
  } else {
    resetDesktopScrollOffset();
  }

  // Managed windows only. `data-window` is what makes a `.window` the window
  // manager's: every window in index.html carries one and createWindow assigns
  // one, so this selects exactly the same set as `.window` did. What it now
  // leaves alone is a `.window` nobody opened -- Theme Lab's chrome specimen,
  // which is a real window element precisely so the era paints it, and whose
  // active and inactive states are the specimen rather than the focus order.
  document.querySelectorAll(".window[data-window]").forEach((item) => {
    item.classList.remove("is-active");
  });
  win.classList.add("is-active");
  // The status line follows the active window, so a message set while another
  // window was in front is still readable where the writer now is.
  if (typeof syncStatusHost === "function") syncStatusHost();
  const focusedAppId = getWindowAppId(win);
  if (focusedAppId !== "accessories" && focusedAppId !== "system") {
    activeAppId = focusedAppId;
    menuOwnerAppId = focusedAppId;
  }
  if (hiddenAppIds.has(activeAppId)) {
    hiddenAppIds.delete(activeAppId);
    windowsForApp(activeAppId).forEach((appWin) => {
      appWin.classList.remove("is-app-hidden");
      delete appWin.dataset.appHiddenCollapsed;
    });
  }

  if (win.dataset.window === "about") {
    win.style.zIndex = systemModalZ;
    updateMenuState();
    renderMultiFinderMenu();
    scheduleWorkingSessionSave?.();
    return;
  }

  if (win.dataset.window === "saveChat") {
    win.style.zIndex = windowSaveZ;
    updateMenuState();
    renderMultiFinderMenu();
    scheduleWorkingSessionSave?.();
    return;
  }

  if (isPortraitDocumentFlow() && mobileWindowPresentation(win) === "system-page") {
    win.style.zIndex = windowPinnedZ;
    updateMenuState();
    renderMultiFinderMenu();
    scheduleWorkingSessionSave?.();
    return;
  }

  setWindowLayerZ(win, nextWindowLayerZ());
  if (isDeskAccessorySidecar(win)) {
    raiseVisibleDeskAccessorySidecars(win);
  } else if (getWindowAppId(win) === "accessories") {
    raiseVisibleDeskAccessorySidecars();
  } else {
    raiseVisibleDeskAccessorySidecars();
  }
  updateMenuState();
  renderMultiFinderMenu();
  scheduleWorkingSessionSave?.();
}

function isPortraitDocumentFlow() {
  return window.matchMedia("(max-width:860px) and (orientation:portrait)").matches;
}

function isNarrowViewport() {
  return window.matchMedia("(max-width: 860px)").matches;
}

// Mobile is a presentation system, not a collection of one-off app patches.
// Every window is assigned one semantic role. Application and Finder pages can
// own the phone work area; dialogs, system pages, and Desk Accessories retain a
// separate overlay vocabulary. Keeping this taxonomy declarative makes a new
// production window fail the mobile coverage test until its role is deliberate.
const mobileFullScreenAppIds = new Set([
  "clioTalk",
  "quickDraft",
  "lightroom",
  "teachText",
  "writingStudio",
  "searcher",
  "reader",
  "timeMachine",
  "endfield",
  "docMap",
  "clioStage",
  "clioChart",
  "liquidCover",
  "cmfStudio",
  "soundscape",
  "themeLab",
  "scrapbook",
  "bureaucracyMeme",
  "micropolis",
  "doom",
  "openttd",
  "bonsaiCity",
]);

// Immersive apps are the ones whose content IS the screen: the three games.
// They earn the full-screen shell in landscape as well, where a floating
// window would spend most of a phone display on desktop pattern. Every other
// app keeps the portrait-only figure.
const mobileImmersiveAppIds = new Set(["micropolis", "doom", "openttd", "bonsaiCity"]);

function isMobileImmersiveWindow(win) {
  return !!win && mobileImmersiveAppIds.has(getWindowAppId(win));
}

const mobileFinderPageWindowNames = new Set([
  "rag",
  "textDisk",
  "finder",
  "helpFolder",
  "applications",
  "disk",
  "projectCd",
  "projects",
  "documents",
  "trash",
  "printDirectory",
  "controlStripModules",
]);

// Finder volumes share one navigation and command model. Their storage
// implementations remain deliberately different (durable project data,
// temporary mounted sources, and handoff media), but Finder should not need
// three parallel ideas of selection, Get Info, Open, or Eject.
const finderVolumeDefinitions = new Map([
  ["disk", {
    kind: "startup",
    labelKey: "startup_disk",
    parentWindowName: "",
    writable: false,
    removable: false,
    supportsFolders: false,
  }],
  ["projects", {
    kind: "hard-disk",
    labelKey: "project_disk",
    parentWindowName: "disk",
    writable: true,
    removable: true,
    supportsFolders: true,
  }],
  ["textDisk", {
    kind: "floppy",
    labelKey: "mounted_text_disk",
    parentWindowName: "disk",
    writable: false,
    removable: true,
    supportsFolders: false,
  }],
  ["projectCd", {
    kind: "optical",
    labelKey: "project_cd",
    parentWindowName: "disk",
    writable: false,
    removable: true,
    supportsFolders: false,
  }],
]);

function getFinderVolumeDefinition(windowName) {
  return finderVolumeDefinitions.get(windowName) || null;
}

function getFinderVolumeRootItem(windowName) {
  const volume = getFinderVolumeDefinition(windowName);
  if (!volume) return null;
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  const itemCount = windowName === "projects"
    ? ((typeof getProjectFiles === "function" ? getProjectFiles().length : 0)
      + (typeof getProjectFolders === "function" ? getProjectFolders().length : 0))
    : windowName === "textDisk"
      ? (mountedTextDisk?.files?.length || 0)
      : windowName === "projectCd"
        ? (typeof getProjectCdItems === "function" ? getProjectCdItems().length : 0)
        : (typeof getStaticFinderItems === "function" ? getStaticFinderItems("disk").length : 0);
  const label = windowName === "projects" && project
    ? projectDisplayName(project)
    : t(volume.labelKey);
  return {
    id: `finder-volume:${windowName}`,
    type: "finder-volume",
    name: label,
    title: label,
    kindLabel: t(volume.labelKey),
    iconClass: {
      startup: "hard-disk-icon",
      "hard-disk": "project-disk-icon",
      floppy: "text-disk-icon",
      optical: "hard-disk-icon",
    }[volume.kind] || "hard-disk-icon",
    iconId: {
      startup: "startupDisk",
      "hard-disk": "projectDisk",
      floppy: "fileFloppy",
      optical: "projectDisc",
    }[volume.kind] || "startupDisk",
    itemCount,
    sizeValue: itemCount,
    sizeLabel: t("items_count", itemCount),
    location: t("finder_location"),
    projectId: windowName === "disk" ? "" : activeProjectId,
    virtual: false,
    readOnly: !volume.writable,
    canOpen: false,
    canDuplicate: false,
    canRename: false,
    canTrash: false,
  };
}

function getFinderVolumeSelectedItem(windowName) {
  if (windowName === "projects") {
    return typeof getSelectedProjectFinderItem === "function" ? getSelectedProjectFinderItem() : null;
  }
  if (windowName === "textDisk") {
    const name = selectedMountedFileNames?.values?.().next?.().value || selectedMountedFile;
    if (!name || !mountedTextDisk?.files?.includes(name)) return null;
    const report = typeof mountedFileDiagnostic === "function" ? mountedFileDiagnostic(name) : null;
    const body = mountedTextDisk.fileBodies?.[name] || "";
    return {
      id: name,
      type: "mountedFile",
      name,
      title: name,
      body,
      kindLabel: report && typeof fileDiskKindLabel === "function"
        ? fileDiskKindLabel(report.kind)
        : t("mounted_text_disk"),
      iconClass: "doc-icon",
      iconId: "document",
      sizeValue: Number(report?.bytes || body.length || 0),
      sizeLabel: `${Number(report?.bytes || body.length || 0)} bytes`,
      location: t("mounted_text_disk"),
      projectId: activeProjectId,
      readOnly: true,
      canOpen: true,
      canDuplicate: false,
      canRename: false,
      canTrash: true,
      open: () => openMountedTextFile(name),
    };
  }
  if (windowName === "projectCd") {
    const item = typeof getSelectedProjectCdItem === "function" ? getSelectedProjectCdItem() : null;
    if (!item) return null;
    return {
      ...item,
      type: "projectCdItem",
      name: item.title,
      kindLabel: t("project_cd"),
      iconClass: "doc-icon",
      iconId: "document",
      sizeValue: String(item.body || "").length,
      sizeLabel: `${String(item.body || "").length} bytes`,
      location: t("project_cd"),
      readOnly: true,
      canOpen: true,
      canDuplicate: false,
      canRename: false,
      canTrash: true,
      open: () => openProjectCdItemInReader(item),
    };
  }
  if (windowName === "disk") {
    return typeof getSelectedStaticFinderItem === "function"
      ? getSelectedStaticFinderItem("disk")
      : null;
  }
  return null;
}

function getFinderVolumeCapabilities(windowName) {
  const volume = getFinderVolumeDefinition(windowName);
  if (!volume) return null;
  const selectedItem = getFinderVolumeSelectedItem(windowName);
  return {
    canCreateFolder: volume.supportsFolders && volume.writable && isProjectMounted,
    canOpen: selectedItem?.canOpen !== false && !!selectedItem,
    canGetInfo: true,
    canDuplicate: selectedItem?.canDuplicate !== false && !selectedItem?.virtual && !!selectedItem,
    canRename: selectedItem?.canRename !== false && !selectedItem?.virtual && !!selectedItem,
    canTrash: selectedItem?.canTrash !== false && !selectedItem?.virtual && !!selectedItem,
    canEject: volume.removable && (
      windowName === "projects"
        ? isProjectMounted
        : windowName === "textDisk"
          ? getMountedTextDiskChunks().length > 0
          : true
    ),
    canPrintDirectory: true,
  };
}

function syncFinderVolumeSemantics(winOrName) {
  const win = typeof winOrName === "string" ? getWindow(winOrName) : winOrName;
  const volume = getFinderVolumeDefinition(win?.dataset.window || "");
  if (!win || !volume) return;
  win.classList.add("finder-volume-window");
  win.dataset.finderVolume = volume.kind;
  win.dataset.finderWritable = String(volume.writable);
  win.dataset.finderRemovable = String(volume.removable);
}

function replaceVisibleFinderLocation(targetWindowName) {
  if (!mobileFinderPageWindowNames.has(targetWindowName)) return null;
  const source = Array.from(document.querySelectorAll(".window[data-window].is-active:not(.is-hidden):not(.is-app-hidden)"))
    .find((win) => mobileFinderPageWindowNames.has(win.dataset.window) && win.dataset.window !== targetWindowName)
    || Array.from(document.querySelectorAll(".window[data-window]:not(.is-hidden):not(.is-app-hidden)"))
      .find((win) => mobileFinderPageWindowNames.has(win.dataset.window) && win.dataset.window !== targetWindowName);
  const frame = source && !isPortraitDocumentFlow()
    ? windowFrame(source)
    : null;

  document.querySelectorAll(".window").forEach((win) => {
    if (!mobileFinderPageWindowNames.has(win.dataset.window) || win.dataset.window === targetWindowName) return;
    win.classList.add("is-hidden");
    win.classList.remove("is-active");
  });

  return frame;
}

const finderParentWindowNames = new Map([
  ["finder", "disk"],
  ["helpFolder", "disk"],
  ["applications", "disk"],
  ["documents", "disk"],
  ["importUtility", "disk"],
  ["rag", "disk"],
  ["trash", "disk"],
  ["printDirectory", "disk"],
  ["controlStripModules", "finder"],
  ...Array.from(finderVolumeDefinitions.entries())
    .filter(([, volume]) => volume.parentWindowName)
    .map(([windowName, volume]) => [windowName, volume.parentWindowName]),
]);

const finderLocationLabelKeys = new Map([
  ["finder", "system_folder"],
  ["helpFolder", "help_folder"],
  ["applications", "applications"],
  ["documents", "documents"],
  ["importUtility", "import_utility"],
  ["rag", "mount_text_disk"],
  ["trash", "trash"],
  ["printDirectory", "print_directory"],
  ["controlStripModules", "control_strip_modules_folder"],
  ...Array.from(finderVolumeDefinitions.entries())
    .map(([windowName, volume]) => [windowName, volume.labelKey]),
]);

const mobileDialogWindowNames = new Set([
  "pageSetup",
  // Write to Project Hard Disk is a task dialog -- choose files, preview,
  // write, done -- not a Finder page to browse. As a finder-page it took the
  // full-bleed work-area frame and filled a portrait screen.
  "importUtility",
  "saveChat",
  "fileInfo",
  "projectInfo",
  "finishingReceipt",
  "about",
]);

const mobileSystemPageWindowNames = new Set(["systemHelp", "themeLab"]);

const mobilePresentationClassNames = [
  "is-mobile-app-page",
  "is-mobile-finder-page",
  "is-mobile-dialog",
  "is-mobile-system-page",
  "is-mobile-accessory",
];

let mobileFinderDesktopPreferred = false;

function finderFolderTrail(folderId) {
  if (!folderId || typeof getProjectFolders !== "function") return [];
  const folders = getProjectFolders();
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const trail = [];
  const seen = new Set();
  let folder = byId.get(folderId);
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    trail.unshift({
      folderId: folder.id,
      label: typeof displayFolderName === "function"
        ? displayFolderName(folder.name)
        : folder.name,
    });
    folder = folder.parentId ? byId.get(folder.parentId) : null;
  }
  return trail;
}

function finderNavigationSegments(windowName) {
  const labelKey = finderLocationLabelKeys.get(windowName);
  const currentLabel = labelKey ? t(labelKey) : (
    getWindow(windowName)?.querySelector(":scope > .title-bar h1, :scope > .title-bar h2")?.textContent
    || windowName
  );
  if (windowName === "disk") {
    return [{ windowName, folderId: "", label: currentLabel }];
  }

  const segments = [{ windowName: "disk", folderId: "", label: t("startup_disk") }];
  if (windowName === "finder") {
    segments.push({ windowName, folderId: "", systemFolderPath: "", label: t("system_folder") });
    (typeof systemFolderPathTrail === "function" ? systemFolderPathTrail() : []).forEach((entry) => {
      segments.push({ windowName, folderId: "", systemFolderPath: entry.path, label: entry.label });
    });
    return segments;
  }
  if (windowName === "applications") {
    segments.push({ windowName, folderId: "", applicationsFolderPath: "", label: currentLabel });
    (typeof applicationsFolderPathTrail === "function" ? applicationsFolderPathTrail() : []).forEach((entry) => {
      segments.push({ windowName, folderId: "", applicationsFolderPath: entry.path, label: entry.label });
    });
    return segments;
  }
  if (windowName === "projects" || windowName === "documents") {
    segments.push({ windowName, folderId: "", label: currentLabel });
    const folderId = selectedFolderId === "all" ? "" : selectedFolderId;
    finderFolderTrail(folderId).forEach((entry) => {
      segments.push({ windowName, ...entry });
    });
    return segments;
  }

  segments.push({ windowName, folderId: "", label: currentLabel });
  return segments;
}

function resetFinderSelectionForNavigation() {
  selectedChatFileId = null;
  selectedDocumentFolderId = null;
  selectedProjectRootItemId = null;
  if (typeof clearDocumentSelection === "function") clearDocumentSelection();
}

function navigateFinderFolderLocation(windowName, folderId = "") {
  selectedFolderId = folderId || "all";
  resetFinderSelectionForNavigation();
  if (windowName === "projects") renderProjectDisks();
  if (windowName === "documents") renderDocuments();
  const win = getWindow(windowName);
  if (win) {
    renderFinderNavigationBar(win);
    focusWindow(win);
  }
}

async function navigateFinderLocation(
  sourceWindowName,
  targetWindowName,
  folderId = "",
  systemFolderPath = "",
  applicationsFolderPath = "",
) {
  if (sourceWindowName === targetWindowName && ["projects", "documents"].includes(targetWindowName)) {
    navigateFinderFolderLocation(targetWindowName, folderId);
    return;
  }

  if (targetWindowName === "finder") {
    resetFinderSelectionForNavigation();
    mobileFinderDesktopPreferred = false;
    if (sourceWindowName !== "finder") await openWindow("finder");
    navigateSystemFolderPath(systemFolderPath);
    focusWindow(getWindow("finder"));
    return;
  }

  if (targetWindowName === "applications") {
    resetFinderSelectionForNavigation();
    mobileFinderDesktopPreferred = false;
    if (sourceWindowName !== "applications") await openWindow("applications");
    if (typeof navigateApplicationsFolderPath === "function") navigateApplicationsFolderPath(applicationsFolderPath);
    focusWindow(getWindow("applications"));
    return;
  }

  if (["projects", "documents"].includes(targetWindowName)) {
    selectedFolderId = folderId || "all";
    resetFinderSelectionForNavigation();
  }
  mobileFinderDesktopPreferred = false;
  await openWindow(targetWindowName);
  if (targetWindowName === "projects") renderProjectDisks();
  if (targetWindowName === "documents") renderDocuments();
}

async function navigateFinderUp(windowName) {
  if (windowName === "finder" && typeof getSystemFolderPathDefinition === "function") {
    const definition = getSystemFolderPathDefinition();
    if (definition) {
      navigateSystemFolderPath(definition.parentPath || "");
      focusWindow(getWindow("finder"));
      return;
    }
  }

  if (["projects", "documents"].includes(windowName)) {
    const folder = typeof getSelectedFolder === "function" ? getSelectedFolder() : null;
    if (folder) {
      navigateFinderFolderLocation(windowName, folder.parentId || "");
      return;
    }
  }

  if (windowName === "applications" && typeof getApplicationsFolderPathDefinition === "function") {
    const definition = getApplicationsFolderPathDefinition();
    // Only a subfolder has a parentPath; at the root the button leaves the
    // window, the way it does everywhere else.
    if (definition && "parentPath" in definition) {
      navigateApplicationsFolderPath(definition.parentPath || "");
      focusWindow(getWindow("applications"));
      return;
    }
  }

  const parentWindowName = finderParentWindowNames.get(windowName);
  if (parentWindowName) {
    await navigateFinderLocation(windowName, parentWindowName);
    return;
  }

  await closeWindow(windowName);
  if (isPortraitDocumentFlow()) {
    mobileFinderDesktopPreferred = true;
    activeAppId = "finder";
    syncMobileAppForeground();
    renderMultiFinderMenu();
  }
}

function renderFinderNavigationBar(winOrName) {
  const win = typeof winOrName === "string" ? getWindow(winOrName) : winOrName;
  const windowName = win?.dataset.window || "";
  if (!win || !mobileFinderPageWindowNames.has(windowName)) return;
  syncFinderVolumeSemantics(win);

  let nav = win.querySelector(":scope > .finder-navigation-bar");
  if (!nav) {
    nav = document.createElement("nav");
    nav.className = "finder-navigation-bar";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn finder-navigation-back";
    back.addEventListener("click", (event) => {
      event.stopPropagation();
      navigateFinderUp(windowName);
    });
    const breadcrumbs = document.createElement("div");
    breadcrumbs.className = "finder-breadcrumbs";
    nav.append(back, breadcrumbs);
    const details = win.querySelector(":scope > .details-bar");
    const title = win.querySelector(":scope > .title-bar");
    (details || title)?.after(nav);
  }

  nav.setAttribute("aria-label", t("finder_location"));
  const back = nav.querySelector(".finder-navigation-back");
  if (back) {
    back.textContent = "‹";
    back.setAttribute("aria-label", t("up_one_level"));
    back.title = t("up_one_level");
  }

  const breadcrumbs = nav.querySelector(".finder-breadcrumbs");
  if (!breadcrumbs) return;
  breadcrumbs.replaceChildren();
  const segments = finderNavigationSegments(windowName);
  segments.forEach((segment, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "finder-breadcrumb-separator";
      separator.textContent = "›";
      separator.setAttribute("aria-hidden", "true");
      breadcrumbs.append(separator);
    }

    const isCurrent = index === segments.length - 1;
    if (isCurrent) {
      const current = document.createElement("span");
      current.className = "finder-breadcrumb-current";
      current.textContent = segment.label;
      current.setAttribute("aria-current", "page");
      breadcrumbs.append(current);
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "finder-breadcrumb";
    button.textContent = segment.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      navigateFinderLocation(
        windowName,
        segment.windowName,
        segment.folderId,
        segment.systemFolderPath || "",
        segment.applicationsFolderPath || "",
      );
    });
    breadcrumbs.append(button);
  });
}

function renderAllFinderNavigationBars() {
  mobileFinderPageWindowNames.forEach((name) => renderFinderNavigationBar(name));
}

function mobileWindowPresentation(win) {
  const name = win?.dataset.window || "";
  if (mobileDialogWindowNames.has(name)) return "dialog";
  if (mobileSystemPageWindowNames.has(name)) return "system-page";
  if (getWindowAppId(win) === "accessories") return "accessory";
  if (mobileFinderPageWindowNames.has(name)) return "finder-page";
  if (mobileFullScreenAppIds.has(getWindowAppId(win))) return "app-page";
  return "";
}

function syncMobileWindowPresentationClasses() {
  const portrait = isPortraitDocumentFlow();
  const narrow = isNarrowViewport();
  // Managed windows only: a `.window` with no data-window was never opened by
  // the manager. Theme Lab shows real windows as specimens so the era paints
  // them, and a sweep that hides or re-frames one empties the board.
  document.querySelectorAll(".window[data-window]").forEach((win) => {
    mobilePresentationClassNames.forEach((className) => win.classList.remove(className));
    win.classList.remove("is-mobile-work-area");
    // The mobile work-area CSS owns one shared frame for app pages and Finder
    // pages in every narrow orientation. This replaces the giant :not(...)
    // exclusion lists that used to enumerate every dialog / DA / system page.
    if (narrow && !writerMode) {
      const role = mobileWindowPresentation(win);
      if (role === "app-page" || role === "finder-page") {
        win.classList.add("is-mobile-work-area");
      }
    }
    if (!portrait) return;
    const role = mobileWindowPresentation(win);
    if (role) win.classList.add(`is-mobile-${role}`);
  });
  document.body.classList.toggle(
    "mobile-finder-desktop",
    portrait && mobileFinderDesktopPreferred
  );
}

function mobileWindowCanFillScreen(win) {
  const role = mobileWindowPresentation(win);
  return role === "app-page" || (
    role === "finder-page"
    && !mobileFinderDesktopPreferred
  );
}

function mobileFullScreenTarget() {
  const immersiveLandscape = !isPortraitDocumentFlow()
    && isNarrowViewport()
    && window.matchMedia("(orientation:landscape)").matches;
  if (!isPortraitDocumentFlow() && !immersiveLandscape) return null;
  const wins = Array.from(
    document.querySelectorAll(".window[data-window]:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)")
  ).filter((win) => (
    mobileWindowCanFillScreen(win)
    && (!immersiveLandscape || isMobileImmersiveWindow(win))
    // Zooming or dragging the grow box restores a window down; it then stays a
    // normal floating window (so several can share the screen) until the zoom
    // box maximizes it again.
    && win.dataset.mobileRestored !== "true"
  ));
  if (!wins.length) return null;
  const activeAppWins = wins.filter((win) => getWindowAppId(win) === activeAppId);
  const candidates = activeAppWins.length ? activeAppWins : wins;
  return candidates.sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
}

function syncMobileAppForeground() {
  syncMobileWindowPresentationClasses();
  const target = mobileFullScreenTarget();
  document.querySelectorAll(".window.is-mobile-fullscreen").forEach((win) => {
    if (win !== target) win.classList.remove("is-mobile-fullscreen");
  });
  if (target) {
    target.classList.add("is-mobile-fullscreen");
    // Desktop placement code leaves inline left/top/width/height on some
    // windows, and inline styles outrank the shell's rules. Drop that geometry
    // so the maximized frame is the CSS shell's, not a stale desktop frame.
    ["left", "top", "right", "bottom", "width", "height", "maxHeight", "transform", "order"]
      .forEach((prop) => { target.style[prop] = ""; });
  }
  document.body.classList.toggle("mobile-app-foreground", !!target);
  // Landscape geometry is a separate design, so the CSS keys on the state the
  // shell already computed instead of re-deriving it from a media query.
  document.body.classList.toggle(
    "mobile-immersive-landscape",
    !!target && isMobileImmersiveWindow(target) && !isPortraitDocumentFlow()
  );
  repairPortraitDeskAccessoryGeometry();
}

// A phone has one stable Desk Accessory axis. Reflow every visible accessory
// together so a newly opened DA cannot cover an older one; leaving portrait
// clears that temporary arrangement and restores normal desktop ownership.
function repairPortraitDeskAccessoryGeometry() {
  if (!isPortraitDocumentFlow()) {
    document.querySelectorAll(".window.is-mobile-da-arranged")
      .forEach(clearPortraitDeskAccessoryPlacement);
    return;
  }
  if (!visiblePortraitDeskAccessories().length) return;
  arrangeDeskAccessories();
}

// The Finder entry in the switcher, so this is a MultiFinder-only path: bring
// the Finder forward. Every running app is backgrounded with MultiFinder's own
// hide vocabulary — they stay in the running-apps list and resume from the
// switcher. Backgrounding only the frontmost one would just promote the next
// running app to full-screen instead of revealing the desktop.
function mobileHomeToDesktop() {
  const appIds = new Set();
  document.querySelectorAll(".window[data-window]:not(.is-hidden)").forEach((win) => {
    const appId = getWindowAppId(win);
    if (mobileFullScreenAppIds.has(appId)) appIds.add(appId);
  });
  appIds.forEach((appId) => hideApp(appId, { preserveActive: true }));
  mobileFinderDesktopPreferred = true;
  activeAppId = "finder";
  syncMobileAppForeground();
  renderMultiFinderMenu();
  playSystemSound?.("close");
}

// Re-foreground a running app full-screen from the mobile switcher.
function foregroundMobileApp(appId) {
  if (appId === "finder") {
    mobileHomeToDesktop();
    return;
  }
  const name = runningApps.get(appId)?.lastWindowName;
  if (name) openWindow(name);
  else syncMobileAppForeground();
}

function writingSpineAlignedTop(fallback = 18) {
  const desktop = document.querySelector(".desktop");
  const spine = document.querySelector(".writing-spine-panel") || document.querySelector(".spine-flow-toolbox");
  const titleBar = spine?.querySelector?.(".spine-title-row, .title-bar");
  const desktopRect = desktop?.getBoundingClientRect();
  const spineRect = titleBar?.getBoundingClientRect?.() || spine?.getBoundingClientRect();
  if (
    desktopRect
    && spine
    && spineRect
    && spineRect.height > 0
    && getComputedStyle(spine).position !== "static"
  ) {
    return Math.max(18, Math.round(spineRect.top - desktopRect.top));
  }
  return fallback;
}

function writingSpineAlignedTopForWindow(win, fallback = 18) {
  const desktop = document.querySelector(".desktop");
  const spine = document.querySelector(".writing-spine-panel") || document.querySelector(".spine-flow-toolbox");
  const spineTitle = spine?.querySelector?.(".spine-title-row, .title-bar");
  const spineDivider = spine?.querySelector?.(".spine-shade-body");
  const winTitle = win?.querySelector?.(":scope > .title-bar");
  const desktopRect = desktop?.getBoundingClientRect();
  const spineDividerRect = spineDivider?.getBoundingClientRect?.();
  const spineRect = (
    spineDividerRect
    && spineDividerRect.height > 0
    && getComputedStyle(spineDivider).display !== "none"
  )
    ? spineDividerRect
    : spineTitle?.getBoundingClientRect?.();
  const winRect = win?.getBoundingClientRect?.();
  const winTitleRect = winTitle?.getBoundingClientRect?.();
  const targetDivider = Array.from(win?.children || []).find((child) => {
    if (child === winTitle) return false;
    const style = getComputedStyle(child);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = child.getBoundingClientRect();
    return rect.height > 0;
  });
  const targetDividerRect = targetDivider?.getBoundingClientRect?.();
  if (
    desktopRect
    && spine
    && spineRect
    && winRect
    && winTitleRect
    && targetDividerRect
    && spineRect.height >= 0
    && winTitleRect.height > 0
    && getComputedStyle(spine).position !== "static"
  ) {
    const spineLine = spineDividerRect && spineDividerRect.height > 0 ? spineDividerRect.top : spineRect.bottom;
    const targetLineOffset = targetDividerRect.top - winRect.top;
    return Math.max(18, Math.round(spineLine - desktopRect.top - targetLineOffset));
  }
  return writingSpineAlignedTop(fallback);
}

function alignWindowTitleBottomToWritingSpine(win) {
  if (!win || writerMode || isPortraitDocumentFlow()) return;
  if (["about", "saveChat"].includes(win.dataset.window)) return;
  if (win.classList.contains("is-hidden") || win.classList.contains("is-collapsed")) return;
  win.style.top = `${writingSpineAlignedTopForWindow(win, parsePositiveInteger(win.style.top) || 18)}px`;
}

function scheduleWritingSpineTitleAlignment(win) {
  if (!win || writerMode || isPortraitDocumentFlow()) return;
  const align = () => {
    alignWindowTitleBottomToWritingSpine(win);
    // Alignment is delayed until content strips have their final height. Run
    // collision placement after that shift as well, or a clear lower slot can
    // be pulled back over an old window on the next animation frame.
    if (win.dataset.systemPositioned === "true") {
      placeNewWindowAvoidingVisibleWindows(win);
      clampWindowToViewport(win);
    }
  };
  requestAnimationFrame(() => {
    align();
    requestAnimationFrame(align);
  });
  window.setTimeout(align, 80);
  window.setTimeout(align, 220);
}

function useNarrowWindowFlow(win) {
  if (!win || !isNarrowViewport() || writerMode) return false;
  if (getWindowAppId(win) === "accessories") return false;
  win.style.left = "";
  win.style.top = "";
  win.style.right = "";
  win.style.width = "";
  win.style.height = "";
  win.style.maxHeight = "";
  win.style.transform = "";
  if ((win.dataset.window === "endfieldTerminal" || win.dataset.window === "bureaucracyMeme" || win.dataset.window === "liquidCover") && !win.style.getPropertyValue("--portrait-window-height")) {
    win.style.setProperty("--portrait-window-height", "calc(100vh - var(--system-menu-height, 26px) - 72px)");
  }
  revealWindowTitleInPortraitFlow(win);
  return true;
}

function clearPortraitWindowSize(win) {
  win?.style.removeProperty("--portrait-window-width");
  win?.style.removeProperty("--portrait-window-height");
}

function revealWindowTitleInPortraitFlow(win) {
  if (!win || !isPortraitDocumentFlow()) return;
  const reveal = () => {
    const rect = win.getBoundingClientRect();
    const menuHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--system-menu-height")) || 24;
    const targetTop = window.scrollY + rect.top - menuHeight - 10;
    window.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" });
  };
  requestAnimationFrame(() => {
    reveal();
    requestAnimationFrame(reveal);
  });
  window.setTimeout(reveal, 120);
}

function placeCenteredSystemWindow(win) {
  if (!win) return;
  win.classList.remove("is-collapsed", "is-desklet");
  win.style.right = "auto";
  win.style.height = "";

  if (isNarrowViewport()) {
    win.style.left = "";
    win.style.top = "";
    win.style.width = "";
    win.style.transform = "";
    revealWindowTitleInPortraitFlow(win);
    return;
  }

  if (win.dataset.window === "about") {
    win.style.left = "50%";
    win.style.top = "calc(var(--system-menu-height, 25px) + (100vh - var(--system-menu-height, 25px)) / 2)";
    win.style.width = "";
    win.style.transform = "translate(-50%, -50%)";
    return;
  }

  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  const avoidance = getDesktopAvoidanceInsets({ margin: 18, spineGap: 18, iconGap: 48 });
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const workLeft = (desktopRect?.left || 0) + avoidance.left;
  const workRight = (desktopRect?.right || viewportWidth) - avoidance.right;
  const workTop = desktopRect?.top || 25;
  const workBottom = (desktopRect?.bottom || viewportHeight) - controlStripPlacementReserve();
  const rect = win.getBoundingClientRect();
  const halfWidth = Math.min(rect.width || 360, Math.max(240, workRight - workLeft)) / 2;

  const halfHeight = Math.min(rect.height || 280, Math.max(180, workBottom - workTop)) / 2;
  const centerX = Math.min(Math.max(workLeft + (workRight - workLeft) / 2, workLeft + halfWidth), workRight - halfWidth);
  const centerY = Math.min(Math.max(workTop + (workBottom - workTop) / 2, workTop + halfHeight), workBottom - halfHeight);

  const base = win.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 };
  win.style.left = `${Math.round(centerX - base.left)}px`;
  win.style.top = `${Math.round(centerY - base.top)}px`;
  win.style.width = "";
  win.style.transform = "translate(-50%, -50%)";
  pinWindowTransformToCorner(win);
}

// A centring translate is measured against the window's own size, so it
// re-resolves the position every time that size changes. WindowShade changes
// it on every roll-up: the title bar moved out from under the pointer, and the
// second double-click that should have unrolled the shade landed on the desk.
// Resolve the centred result to a plain corner once, then let the window be
// positioned like every other one.
function pinWindowTransformToCorner(win) {
  if (!win || getComputedStyle(win).transform === "none") return;
  const rect = win.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  const base = win.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 };
  win.style.left = `${Math.round(rect.left - base.left)}px`;
  win.style.top = `${Math.round(rect.top - base.top)}px`;
  win.style.transform = "none";
}

function placeSaveChatWindow() {
  const win = getWindow("saveChat");
  if (!win) return;
  if (isPortraitDocumentFlow()) {
    ["left", "top", "right", "width", "height", "max-height", "transform"]
      .forEach((property) => win.style.removeProperty(property));
    win.scrollTop = 0;
    win.querySelector(".save-chat-pane")?.scrollTo?.({ top: 0 });
    return;
  }
  win.style.left = "50%";
  win.style.top = "calc(25px + (100vh - 25px) / 2)";
  win.style.right = "auto";
  win.style.width = "";
  win.style.height = "";
  win.style.transform = "translate(-50%, -50%)";
  win.scrollTop = 0;
  win.querySelector(".save-chat-pane")?.scrollTo?.({ top: 0 });
}

function placeClioStageDefaultWindow(win) {
  if (!win || writerMode || isPortraitDocumentFlow()) return false;
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  if (!desktopRect) return false;

  const margin = 18;
  const avoidance = getDesktopAvoidanceInsets({ margin, spineGap: 18, iconGap: 132 });
  const workLeft = Math.max(margin, avoidance.left || margin);
  const workTop = Math.max(margin, writingSpineAlignedTopForWindow(win, margin));
  const workRight = Math.max(workLeft + 560, desktopRect.width - Math.max(132, avoidance.right || 132));
  const workBottom = Math.max(workTop + 360, desktopRect.height - margin);
  const availableWidth = Math.max(560, workRight - workLeft);
  const availableHeight = Math.max(360, workBottom - workTop);
  const width = Math.min(1024, availableWidth);
  const height = Math.min(640, availableHeight);
  const left = workLeft + Math.max(0, (availableWidth - width) / 2);

  placeWindowForExplicitLayout(win, {
    left,
    top: workTop,
    width,
    height,
    transform: "none",
  });
  return true;
}

function isFinderCascadeWindow(winOrName) {
  const name = typeof winOrName === "string" ? winOrName : winOrName?.dataset.window;
  return finderCascadeWindowNames.has(name);
}

const finderContentFitWindowNames = new Set([
  "finder",
  "helpFolder",
  "applications",
  "disk",
  "projects",
  "documents",
  "projectCd",
  "textDisk",
  "trash",
  "controlStripModules",
]);

function isFinderContentWindow(winOrName) {
  const name = typeof winOrName === "string" ? winOrName : winOrName?.dataset.window;
  return finderContentFitWindowNames.has(name);
}

function clearFinderContentFit(win, options = {}) {
  if (!win?.classList.contains("is-finder-content-fit")) return false;
  const rect = options.preserveSize ? win.getBoundingClientRect() : null;
  win.classList.remove("is-finder-content-fit");
  win.style.removeProperty("--finder-fit-width");
  win.style.removeProperty("--finder-fit-height");
  win.style.removeProperty("--finder-fit-max-height");
  delete win.dataset.finderContentFit;
  if (rect) {
    setInlineStyleValue(win, "width", `${Math.round(rect.width)}px`);
    setInlineStyleValue(win, "height", `${Math.round(rect.height)}px`);
  }
  return true;
}

// A fresh Finder window should reveal its objects before it asks the user to
// scroll. Start at the authored width, then add one icon column at a time only
// when the current desktop height cannot hold the full grid. The desktop bounds
// remain the hard ceiling; oversized folders keep scrolling normally.
function fitFinderWindowToContents(win, options = {}) {
  if (
    !win
    || !isFinderContentWindow(win)
    || isPortraitDocumentFlow()
    || window.matchMedia("(max-width: 860px)").matches
  ) return false;

  const scroller = win.querySelector(".window-frame-scroller");
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  if (!scroller || !desktopRect) return false;

  const openingRect = win.getBoundingClientRect();
  const margin = 18;
  const avoidance = getDesktopAvoidanceInsets({ margin, spineGap: 18, iconGap: 48 });
  const openingTop = options.force
    ? Math.max(margin, openingRect.top - desktopRect.top)
    : writingSpineAlignedTopForWindow(win, margin);
  const maxWidth = Math.max(
    320,
    options.force
      ? desktopRect.right - openingRect.left - margin
      : desktopRect.width - avoidance.left - avoidance.right - margin,
  );
  const maxHeight = Math.max(220, desktopRect.height - openingTop - margin);
  const minWidth = Math.min(maxWidth, Number.parseInt(getComputedStyle(win).minWidth, 10) || 320);
  const initialWidth = Math.min(maxWidth, Math.max(minWidth, openingRect.width || 420));

  setInlineStyleValue(win, "width", "");
  setInlineStyleValue(win, "height", "");
  setInlineStyleValue(win, "max-height", "");
  win.classList.add("is-finder-content-fit");
  win.style.removeProperty("--finder-fit-height");
  win.style.setProperty("--finder-fit-max-height", `${Math.round(maxHeight)}px`);

  const icon = scroller.querySelector(".finder-item");
  const gridStyle = getComputedStyle(scroller);
  const columnGap = Number.parseFloat(gridStyle.columnGap) || 0;
  const iconWidth = icon?.getBoundingClientRect().width || 96;
  const columnStep = Math.max(72, Math.round(iconWidth + columnGap));
  const iconMode = scroller.classList.contains("finder-grid");
  let width = initialWidth;
  let desiredHeight = maxHeight;

  while (true) {
    win.style.setProperty("--finder-fit-width", `${Math.round(width)}px`);
    const winRect = win.getBoundingClientRect();
    const chromeHeight = Math.max(0, winRect.height - scroller.clientHeight);
    desiredHeight = Math.ceil(chromeHeight + scroller.scrollHeight);
    if (desiredHeight <= maxHeight + 1 || width >= maxWidth || !iconMode) break;
    width = Math.min(maxWidth, width + columnStep);
  }

  win.style.setProperty("--finder-fit-width", `${Math.round(width)}px`);
  win.style.setProperty("--finder-fit-height", `${Math.round(Math.min(maxHeight, desiredHeight))}px`);
  win.dataset.finderContentFit = options.force ? "zoom" : "auto";
  return true;
}

function placeFinderCascadeWindow(win, options = {}) {
  if (!win) return false;
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  if (!desktopRect) return false;

  const avoidance = options.avoidance || getDesktopAvoidanceInsets({ margin: 24, spineGap: 18, iconGap: 48 });
  const rect = win.getBoundingClientRect();
  const width = rect.width || 520;
  const height = rect.height || 360;
  const margin = 24;
  const baseLeft = Math.max(avoidance.left, margin);
  const baseTop = options.baseTop || writingSpineAlignedTopForWindow(win, 18);
  const workRight = Math.max(baseLeft + width, desktopRect.width - avoidance.right - margin);
  const workBottom = Math.max(baseTop + height, desktopRect.height - margin);
  const maxLeft = Math.max(baseLeft, workRight - width);
  const maxTop = Math.max(baseTop, workBottom - height);
  const horizontalStep = Math.min(190, Math.max(96, Math.round(width * 0.34)));
  const verticalStep = 26;
  const rowStep = 92;
  const columns = Math.max(1, Math.floor((maxLeft - baseLeft) / horizontalStep) + 1);
  const openFinderWindows = Array.from(document.querySelectorAll(".window[data-window]:not(.is-hidden):not(.is-app-hidden)"))
    .filter((item) => item !== win && isFinderCascadeWindow(item));
  const index = openFinderWindows.length;
  const column = index % columns;
  const row = Math.floor(index / columns);
  const left = Math.min(maxLeft, baseLeft + column * horizontalStep);
  const top = Math.min(maxTop, baseTop + row * rowStep + column * verticalStep);

  win.style.left = `${Math.round(left)}px`;
  win.style.top = `${Math.round(top)}px`;
  win.style.right = "auto";
  win.style.transform = "none";
  return true;
}

function getActionAvailability() {
  const activeWin = document.querySelector(".window.is-active");
  const focusedAppId = activeWin ? getWindowAppId(activeWin) : "finder";
  const menuContextWin = ["accessories", "system"].includes(focusedAppId)
    ? visibleWindowsForApp(menuOwnerAppId || activeAppId)
      .sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0] || activeWin
    : activeWin;
  const showResetSystemMenu = showResetSystemMenuInput ? showResetSystemMenuInput.checked : true;
  const winName = menuContextWin?.dataset.window;
  // Route commands follow the writer, not the z-order. The route raises the
  // manuscript beside the surface being edited, so gating on the frontmost
  // window left "To Section Drafts" unavailable while the caret sat in the
  // Outline - and an unavailable command is refused in silence.
  const routeWinName = (typeof currentWritingRouteStop === "function" && currentWritingRouteStop()) || winName;
  const quickDraftApi = winName === "quickDraft" ? window.AISystem6QuickDraft : null;
  const quickDraftHasBody = Boolean(quickDraftApi?.hasBody?.());
  const quickDraftHasInput = Boolean(quickDraftApi?.hasInput?.());
  const quickDraftHasOrganizableMaterial = Boolean(quickDraftApi?.hasOrganizableMaterial?.());
  const quickDraftVentActive = Boolean(quickDraftApi?.isVentIntakeActive?.());
  const quickDraftHasModel = Boolean(quickDraftApi?.modelAvailable?.());
  const quickDraftCanPreview = Boolean(quickDraftApi?.canPreviewAdjustments?.());
  const quickDraftCanDevelop = Boolean(quickDraftApi?.canDevelop?.());
  const lightroomApi = winName === "lightroom" ? window.AISystem6QuickDraft : null;
  const lightroomHasBody = Boolean(lightroomApi?.hasBody?.());
  const lightroomView = String(lightroomApi?.displayMode?.() || "");
  const teachTextWin = getWindow("teachText");
  const teachTextVisible = teachTextWin && !teachTextWin.classList.contains("is-hidden");
  const hasTeachTextBody = teachTextVisible && !!teachTextBodyInput.value.trim();
  // The writing route is a set of views onto one mounted project.
  const routeHasProject = typeof getActiveProject === "function" && !!getActiveProject();
  const hasOutlineBody = winName === "outline" && !!outlineContentEl?.value?.trim();
  // What the darkroom would actually receive: the mounted document, not the
  // textarea of whichever stop happens to be in front.
  const developableDocument = typeof activeTextFileId === "string" && activeTextFileId
    && typeof chatFiles !== "undefined"
    ? chatFiles.find((item) => item.id === activeTextFileId && item.type === "text")
    : null;
  const hasDevelopableDocument = !!developableDocument && !!String(developableDocument.body || "").trim();
  const hasConversation = conversation.length > 0;
  const isAssistant = winName === "assistant";
  // Every window whose paper is a Markdown editor: it can be turned over, and
  // the light can be narrowed on it. One list, so the two cannot drift apart.
  const isWritingPaper = ["quickDraft", "questionSheet", "outline", "sectionDrafts", "reviewDesk", "teachText"].includes(winName);
  const isTeachText = winName === "teachText" && teachTextVisible;
  const isChatFile = winName === "chatFile" && !menuContextWin.classList.contains("is-hidden");
  const hasDocumentFileSelection = winName === "documents" && !!selectedChatFileId;
  const hasDocumentFolderSelection = winName === "documents" && !!selectedDocumentFolderId;
  const projectFinderItem = winName === "projects" ? getSelectedProjectFinderItem() : null;
  const currentFinderSelection = getCurrentFinderSelection();
  const finderVolumeCapabilities = getFinderVolumeCapabilities(winName);
  const isFinderWindow = ["projects", "documents"].includes(winName);
  const hasFinderTextFileSelection = isFinderWindow && currentFinderSelection?.type === "text" && !!(currentFinderSelection.body || "").trim();
  const hasProjectFinderRename = !!projectFinderItem && projectFinderItem.canRename !== false && projectFinderItem.virtual !== true;
  const hasProjectFinderTrash = !!projectFinderItem && projectFinderItem.canTrash !== false && projectFinderItem.virtual !== true;
  const selectedTrashItem = winName === "trash" ? getSelectedTrashItem() : null;
  const canPrintDirectory = printableDirectoryWindowNames.has(winName);
  const canUsePageSetup = winName === "projectCd" || winName === "pageSetup" || isTeachText;
  const teachTextSelection = isTeachText ? getTeachTextSelectionInfo() : { text: "" };
  const hasTeachTextSelection = !!teachTextSelection.text;
  const teachTextIsManuscript = typeof activeTeachTextAllows === "function"
    ? activeTeachTextAllows("writingFlow")
    : (typeof isTeachTextManuscriptRole !== "function" || isTeachTextManuscriptRole());
  const teachTextCanExport = typeof activeTeachTextAllows === "function"
    ? activeTeachTextAllows("projectCdExport")
    : teachTextIsManuscript;
  const teachTextIsSlides = hasTeachTextBody && typeof readerHasMarpFrontmatter === "function" && readerHasMarpFrontmatter(teachTextBodyInput.value || "");
  const teachTextCanBurnProjectCd = typeof projectCdBurnIsAvailable === "function"
    ? projectCdBurnIsAvailable()
    : !!getActiveProject() && hasTeachTextBody && (
      teachTextCanExport
      || teachTextIsSlides
    );
  const teachTextCanReview = typeof activeTeachTextAllows === "function"
    ? activeTeachTextAllows("review")
    : teachTextIsManuscript;
  let selectionContext = null;
  try {
    selectionContext = getSelectionServiceContext() || lastSelectionServiceContext;
  } catch {
    selectionContext = null;
  }
  const hasSelectionServiceText = !!selectionContext?.text;
  const selectedTextLength = selectionContext?.text?.length || 0;
  const docMapReadiness = resolveDocMapReadiness(selectionContext);
  const canMakeDocMap = isFinderWindow && currentFinderSelection
    ? !!currentFinderSelection.canMakeDocMap
    : docMapReadiness?.ready;
  const canMakeDocMapSelection = docMapReadiness?.selectionReady;
  const canMakeDocMapSource = isFinderWindow && currentFinderSelection
    ? !!currentFinderSelection.canMakeDocMap
    : docMapReadiness?.wholeReady;
  const readerDocMapReadiness = winName === "reader" ? docMapReadinessForSurface("reader") : null;
  const activeEditable = getActiveEditableElement();
  const hasEditableText = !!String(activeEditable?.value || activeEditable?.textContent || "").trim();
  const canUseWritingTools = hasEditableText || (hasTeachTextBody && teachTextIsManuscript) || hasSelectionServiceText;
  const writingToolPromptReady = (mode) => window.AISystem6PromptFilesRuntime
    ?.resolvePromptFile(`writing-tools.${({ describeChange: "describe-change", keyPoints: "key-points" })[mode] || mode}`, activeProjectId, currentLanguage)?.status === "ready";
  const hasTeachTextTranslation = hasTeachTextBody && !!(
    (teachTextSelection.text && getTeachTextTranslationTarget(teachTextSelection.text))
      || getTeachTextTranslationTarget(teachTextBodyInput.value)
  );
  const hasOpenFile = (isTeachText && activeTextFileId) || (isChatFile && selectedChatFileId) || hasDocumentFileSelection;
  const hasProjectCdSelection = winName === "projectCd" && !!getSelectedProjectCdItems().length;
  const hasMountedFileSelection = winName === "textDisk" && (!!selectedMountedFile || selectedMountedFileNames.size > 0);
  const hasEditableFocus = !!activeEditable;
  const selectedProject = getSelectedProject();
  const activeItem = getActiveItem();
  const canDuplicateFinderSelection = hasOpenFile
    || finderVolumeCapabilities?.canDuplicate
    || (!!activeItem && activeItem.canDuplicate !== false && activeItem.virtual !== true);
  const hasClaimSections = !!teachTextBodyInput.value.trim() && getClaimCheckSectionBlocks().length > 0;
  const hasStyleSections = !!teachTextBodyInput.value.trim() && getTeachTextSectionBlocks().length > 0;
  const hasReviewDeskBody = !!reviewDeskBodyInput?.value?.trim();
  const reviewDeskReady = !!teachTextReviewLabel();
  // Wider than reviewDeskReady on purpose: the command promotes a saved "final"
  // file into review rather than refusing it, so the row must stay black there.
  const canViewReviewManuscript = canEnterTeachTextReviewState({ promoteSavedFinal: true });
  // Rebuild Flow asks its own refusals before the click instead of after. The
  // flow is a lazy module, but every source it reads is eager — the window
  // markup ships in index.html and the Reader page is a top-level variable — so
  // a menu redraw answers these without summoning the module.
  const rebuildFlowWin = getWindow("rebuildFlow");
  const rebuildFlowOpen = !!rebuildFlowWin && !rebuildFlowWin.classList.contains("is-hidden");
  const rebuildSourceLength = rebuildFlowOpen ? (rebuildFlowSourceInput?.value || "").trim().length : 0;
  const hasReaderTextForRebuild = rebuildFlowOpen && !!currentReaderPage?.text?.trim();
  // Not hasTeachTextBody: that one also requires the TeachText window to be
  // visible, and the rebuild command reads the manuscript whether or not it is.
  const hasTeachTextTextForRebuild = rebuildFlowOpen && !!teachTextBodyInput?.value.trim();
  const activeControlEnabled = (selector) => {
    const control = document.querySelector(selector);
    return !!control && !control.disabled && !control.classList.contains("is-disabled") && !control.hidden;
  };
  // Some controls (Reader's toolbar, Scrapbook's editor buttons) own their
  // real availability through the native disabled/hidden state. updateMenuState()
  // mirrors that availability onto the shared `is-disabled` class, so reading
  // the mirrored class back here latches the action disabled forever after one
  // pass while the window is inactive.
  const activeOwnedControlEnabled = (selector) => {
    const control = document.querySelector(selector);
    return !!control && !control.disabled && !control.hidden;
  };

  // Skill / retrospective / task-config verbs all key off one thing: the kind
  // of artifact currently selected in a Finder window. They used to be absent
  // from this map entirely, which meant updateMenuState() left them enabled
  // forever and clicking one only printed "select an item first" — a menu row
  // that looks live and is not. Contract: tests/features/menu-availability.
  const selectedArtifact = typeof getProjectFiles === "function" && selectedChatFileId
    ? getProjectFiles().find((item) => item.id === selectedChatFileId)
    : null;
  const selectedArtifactIs = (kind) => selectedArtifact?.artifactKind === kind;
  const hasMountedSkillPackage = typeof parseMountedSkillPackage === "function"
    && !!selectedMountedFile
    && parseMountedSkillPackage().valid === true;
  const selectedTaskLifecycle = selectedArtifactIs("task-config")
    ? String(selectedArtifact.taskLifecycle?.state || "")
    : "";

  const availability = {
    // Both open a scratch document, which never touches the project — that is
    // why they are not gated on isProjectMounted the way the neighbouring
    // "new-text-document" is. That row is a different verb: Finder writing a
    // file into the mounted disk.
    "new-document": true,
    "open-text-document": true,
    "new-folder": winName === "documents"
      ? isProjectMounted
      : !!finderVolumeCapabilities?.canCreateFolder,
    "open-menu-selection": finderVolumeCapabilities
      ? finderVolumeCapabilities.canOpen
      : !!activeItem,
    "duplicate-selection": canDuplicateFinderSelection,
    "make-alias": isFinderWindow
      && !!currentFinderSelection
      && (currentFinderSelection.type === "text" || currentFinderSelection.type === "chat")
      && currentFinderSelection.canDuplicate !== false
      && currentFinderSelection.virtual !== true,
    "new-project-disk": true,
    "open-project-disks": true,
    "open-project-disk": !!selectedProject,
    "rename-project-disk": !!selectedProject,
    "duplicate-project-disk": !!selectedProject,
    "archive-project-disk": !!selectedProject,
    "eject-menu-selection": finderVolumeCapabilities
      ? finderVolumeCapabilities.canEject
      : isProjectMounted || getMountedTextDiskChunks().length > 0,
    "set-startup-project": true,
    "open-project-info": isProjectMounted,
    "open-file-info": !!activeItem,
    "save-current": isTeachText || teachTextVisible || (isAssistant && hasConversation),
    "save-conversation": isAssistant && hasConversation && isProjectMounted && clioTalkTemporaryMode,
    "rename-active-chat": isAssistant && !clioTalkTemporaryMode && !!activeChatFileId,
    "copy-current-chat-markdown": isAssistant && hasConversation,
    "download-current-chat-markdown": isAssistant && hasConversation,
    "find-in-cliotalk": isAssistant && hasConversation,
    "find-next-in-cliotalk": isAssistant && hasConversation && !!clioTalkFindQuery,
    "open-clio-attachment-picker": isAssistant && isProjectMounted,
    "open-clio-image-picker": isAssistant,
    "paste-clio-interview": isAssistant,
    "attach-selected-to-cliotalk": winName === "documents" && isClioTalkAttachableProjectFile(getSelectedDocumentItem()),
    "install-mounted-skill": hasMountedSkillPackage && isProjectMounted,
    "preview-mounted-skill": hasMountedSkillPackage,
    "toggle-project-memory": selectedArtifactIs("project-memory"),
    "toggle-project-skill": selectedArtifactIs("ai-skill"),
    "configure-skill-auto-call": isProjectMounted,
    "disable-auto-called-skill": selectedArtifactIs("skill-auto-call-receipt")
      && !!selectedArtifact.autoSkillIds?.length,
    "attach-retrospective-next-task": selectedArtifactIs("retrospective"),
    "create-skill-draft-from-retrospective": selectedArtifactIs("retrospective"),
    "create-project-skill-from-draft": selectedArtifactIs("skill-draft"),
    "view-modification-suggestion-diff": selectedArtifactIs("teachtext-modification-suggestion")
      && selectedArtifact.suggestion?.status === "pending",
    "accept-modification-suggestion": selectedArtifactIs("teachtext-modification-suggestion")
      && selectedArtifact.suggestion?.status === "pending",
    "reject-modification-suggestion": selectedArtifactIs("teachtext-modification-suggestion")
      && selectedArtifact.suggestion?.status === "pending",
    "create-task-config-from-draft": selectedArtifactIs("task-config-draft"),
    "run-task-config": selectedArtifactIs("task-config"),
    // Lifecycle verbs are mutually exclusive on purpose: their grey/black
    // pattern is what tells you which step the task is on.
    "pause-task-config": selectedTaskLifecycle === "running",
    "resume-task-config": selectedTaskLifecycle === "paused"
      && !!selectedArtifact.taskLifecycle?.chatId,
    "complete-task-config": ["running", "paused"].includes(selectedTaskLifecycle),
    "cancel-task-config": ["running", "paused"].includes(selectedTaskLifecycle),
    "create-task-checkpoint": selectedArtifactIs("task-config"),
    "restore-task-checkpoint": selectedArtifactIs("task-checkpoint"),
    // Whole-menu condition, not a row: the Task menu is absent until the
    // project actually holds a Task Config.
    "task-menu": typeof getProjectFiles === "function"
      && getProjectFiles().some((item) => item.artifactKind === "task-config"),
    "clear-attached-clips": attachedClipIds.size > 0,
    "open-selected-in-reader": selectedFindPathIndex !== null,
    "clip-selected-find-path": selectedFindPathIndex !== null,
    "save-clio-harness": isAssistant && hasConversation && isProjectMounted,
    "save-clio-skill": isAssistant && hasConversation && isProjectMounted,
    "save-clio-retrospective": isAssistant && hasConversation && isProjectMounted,
    "save-copy": isTeachText,
    "copy-active-markdown": isTeachText || isChatFile,
    "download-active-markdown": isTeachText || isChatFile,
    "download-active-bilingual-markdown": hasTeachTextTranslation,
    "export-teachtext-project-cd": teachTextCanBurnProjectCd,
    // Sending a draft to the darkroom needs a draft. The row is grey until one
    // is open, so the command never promises to develop nothing.
    //
    // It used to require the Manuscript, which made the split one-third done:
    // developActiveDocumentInLightroom() reads activeTextFileId, not TeachText's
    // textarea, and 文字亮室 answers the develop intent for any text document --
    // so the only thing keeping Outline and Section Drafts out was this line.
    // They are views onto the same mounted document, so they can hand it over
    // too. Gated on routeWinName, never the frontmost window: route commands
    // fire after blur, and asking who is in front rewrites the previous stop.
    "develop-in-lightroom": ["outline", "sectionDrafts", "teachText"].includes(routeWinName)
      && hasDevelopableDocument,
    "open-document-versions": isTeachText && hasTeachTextBody,
    "versions-compare": isTeachText && hasTeachTextBody,
    "versions-restore": isTeachText && hasTeachTextBody,
    "print-to-slides": (hasTeachTextBody && teachTextCanExport) || hasOutlineBody,
    "ai-print-to-slides": (hasTeachTextBody && teachTextCanExport) || hasOutlineBody,
    "generate-marp-open-clio-stage": hasTeachTextBody && teachTextCanExport,
    "toggle-writing-preview": isWritingPaper,
    "cycle-writing-focus": isWritingPaper,
    "insert-question-template": routeWinName === "questionSheet",
    "organize-question-sheet": routeWinName === "questionSheet",
    "toggle-writing-eli5": routeWinName === "questionSheet" && Boolean(getActiveProject()),
    "generate-outline": routeWinName === "questionSheet",
    "advance-question-to-outline": routeWinName === "questionSheet",
    "add-outline-section": routeWinName === "outline",
    "toggle-outline-tree": routeWinName === "outline",
    // The four moves are available exactly when the list is open: they act on
    // what is selected there, and there is no selection anywhere else.
    "outline-tree-up": routeWinName === "outline" && outlineTreeIsOpen(),
    "outline-tree-down": routeWinName === "outline" && outlineTreeIsOpen(),
    "outline-tree-promote": routeWinName === "outline" && outlineTreeIsOpen(),
    "outline-tree-demote": routeWinName === "outline" && outlineTreeIsOpen(),
    "outline-tree-write": routeWinName === "outline" && outlineTreeIsOpen(),
    "mingming-outline": routeWinName === "outline",
    "structure-outline": routeWinName === "outline",
    "expand-outline": routeWinName === "outline",
    "reduce-outline": routeWinName === "outline",
    "advance-outline-to-drafts": routeWinName === "outline",
    "previous-section-draft": routeWinName === "sectionDrafts",
    "next-section-draft": routeWinName === "sectionDrafts",
    "draft-current-section": routeWinName === "sectionDrafts",
    "polish-draft": routeWinName === "sectionDrafts",
    "suggest-draft": routeWinName === "sectionDrafts",
    "eli5-rewrite-section": routeWinName === "sectionDrafts" && (typeof writingStudioExplanationLens === "function"
      ? writingStudioExplanationLens().enabled === true
      : false),
    "eli5-review-section": routeWinName === "sectionDrafts" && (typeof writingStudioExplanationLens === "function"
      ? writingStudioExplanationLens().enabled === true
      : false),
    "open-find-change": true,
    "find-change-next": true,
    "find-change-current": true,
    "find-change-all": true,
    "advance-writing-route": typeof currentWritingRouteStop === "function" && !!currentWritingRouteStop(),
    "advance-drafts-to-manuscript": routeWinName === "sectionDrafts",
    "return-document-to-section-drafts": routeWinName === "sectionDrafts"
      && typeof manuscriptPhase === "function" && manuscriptPhase() === "manuscript",
    "advance-manuscript-to-review": routeWinName === "teachText" && hasTeachTextBody
      && typeof isTeachTextManuscriptRole === "function" && isTeachTextManuscriptRole(),
    "translate-teachtext": hasTeachTextTranslation,
    "clip-teachtext-selection": hasTeachTextSelection,
    "ai-praise": (canUseWritingTools && writingToolPromptReady("praise")) || (routeWinName === "reviewDesk" && reviewDeskReady && hasReviewDeskBody && writingToolPromptReady("reviewPraise")),
    "ai-describe-change": canUseWritingTools && writingToolPromptReady("describeChange"),
    "ai-proofread": canUseWritingTools && writingToolPromptReady("proofread"),
    "ai-rewrite": canUseWritingTools && writingToolPromptReady("rewrite"),
    "ai-friendly": canUseWritingTools && writingToolPromptReady("friendly"),
    "ai-professional": canUseWritingTools && writingToolPromptReady("professional"),
    "ai-concise": canUseWritingTools && writingToolPromptReady("concise"),
    "ai-summary": canUseWritingTools && writingToolPromptReady("summary"),
    "ai-key-points": canUseWritingTools && writingToolPromptReady("keyPoints"),
    "ai-list": canUseWritingTools && writingToolPromptReady("list"),
    "ai-table": canUseWritingTools && writingToolPromptReady("table"),
    "print-to-ai": canUseWritingTools,
    "rename-file": hasOpenFile || hasDocumentFolderSelection || hasProjectFinderRename || !!finderVolumeCapabilities?.canRename,
    "move-file-trash": hasOpenFile
      || hasDocumentFolderSelection
      || hasProjectFinderTrash
      || hasProjectCdSelection
      || hasMountedFileSelection
      || !!finderVolumeCapabilities?.canTrash,
    "put-away": !!selectedTrashItem,
    "page-setup": canUsePageSetup,
    "print-current": isTeachText && hasTeachTextBody,
    "print-directory": canPrintDirectory,
    "close-active-window": !!activeWin && !activeWin.classList.contains("is-hidden"),
    "undo": hasEditableFocus || isTeachText || isAssistant,
    "cut": hasEditableFocus || isTeachText || isAssistant,
    "copy": !!window.getSelection().toString() || hasEditableFocus || isTeachText || isAssistant,
    "paste": hasEditableFocus || isTeachText || isAssistant,
    "clear-edit": hasEditableFocus || isTeachText || isAssistant,
    "select-all": hasEditableFocus || isTeachText || isAssistant,
    "selection-look-up": hasSelectionServiceText && selectedTextLength <= dictionaryMaxSelectionChars,
    "selection-find-sources": hasSelectionServiceText && selectedTextLength <= 420,
    "selection-clip": hasSelectionServiceText,
    "selection-clip-file": hasSelectionServiceText,
    "selection-translate": hasSelectionServiceText,
    "make-docmap": canMakeDocMap,
    "make-docmap-selection": canMakeDocMapSelection,
    "make-docmap-source": canMakeDocMapSource,
    "insert-last-reply": !!lastAssistantText,
    "clip-last-reply": !!lastAssistantText,
    "start-new-clio-chat": isAssistant,
    "start-temporary-clio-chat": isAssistant && !clioTalkTemporaryMode,
    "reveal-active-chat-file": isAssistant && !clioTalkTemporaryMode && !!activeChatFileId,
    "remember-chat-as-project-memory": isAssistant && !clioTalkTemporaryMode && !!activeChatFileId,
    "clip-assistant-selection": isAssistant && !!window.getSelection().toString().trim(),
    "retry-last-message": isAssistant && !!lastUserText && !activeAbortController,
    "empty-trash": getProjectTrashItems().length > 0,
    "erase-disk": !!selectedProject,
    "reset-system": showResetSystemMenu,
    // An empty desk has nowhere to be interrupted from, and a spent pile has
    // nowhere to go back to.
    "hold-that-thought": !!document.querySelector(".window.is-active:not(.is-hidden)"),
    "open-hold-thought": true,
    "resume-my-place": typeof hasHeldPlace === "function" && hasHeldPlace(),
    "toggle-balloon-help": true,
    "open-system-help": true,
    "open-help-folder": true,
    "open-system-concepts-docmap": true,
    "open-system-concepts-clio-stage": true,
    "open-about-multifinder": isMultiFinderMode(),
    "open-applications": true,
    "open-dictionary": true,
    "open-docmap": true,
    "open-claim-check": true,
    // Writing-route navigation needs a mounted Project Hard Disk: every one of
    // these surfaces is a view of one project's document. With no project the
    // rows were black and led to the Project Hard Disk instead of where they
    // said they went, so they report their real condition and grey out. The
    // workspace pass below additionally greys them in the desktop profile.
    // They have to be listed: an action missing from this map is never asked
    // about, so its row stays black and clickable while the click is rejected.
    "open-question-sheet": routeHasProject,
    "open-outline": routeHasProject,
    "open-section-drafts": routeHasProject,
    "open-review-desk": routeHasProject,
    "open-image-manager": routeHasProject,
    "toggle-review-preview": reviewDeskReady,
    "review-view-manuscript": canViewReviewManuscript,
    "review-style-section": reviewDeskReady && teachTextCanReview && hasStyleSections,
    "review-facts-section": reviewDeskReady && teachTextCanReview && hasClaimSections,
    "review-facts-section-online": reviewDeskReady && teachTextCanReview && hasClaimSections,
    "review-facts-online": reviewDeskReady && teachTextCanReview,
    "review-hkrr-section": reviewDeskReady && teachTextCanReview && hasStyleSections,
    "review-mingming-section": reviewDeskReady && teachTextCanReview && hasStyleSections,
    "review-mingming-handoff": reviewDeskReady && teachTextCanReview && hasStyleSections,
    "review-mingming-handoff-backstage": reviewDeskReady && teachTextCanReview && hasStyleSections,
    "review-export": reviewDeskReady && teachTextCanReview && !!(reviewDeskBodyInput?.value || teachTextBodyInput.value || "").trim(),
    "open-style-sheet": true,
    "style-check-manuscript": teachTextCanReview && !!teachTextBodyInput.value.trim(),
    "style-check-section": teachTextCanReview && hasStyleSections,
    "previous-style-section": hasStyleSections,
    "next-style-section": hasStyleSections,
    "run-claim-check-section": teachTextCanReview && hasClaimSections,
    "previous-claim-section": hasClaimSections,
    "next-claim-section": hasClaimSections,
    "open-find-path": true,
    "focus-search-query": winName === "findPath",
    "synthesize-search-results": winName === "findPath" && findPathResults.length > 0,
    "copy-search-result-markdown": winName === "findPath" && selectedFindPathIndex !== null,
    "insert-search-result": winName === "findPath" && selectedFindPathIndex !== null,
    "open-find-file": true,
    "open-selected-find-file": selectedFindFileIndex !== null,
    "reveal-selected-find-file": selectedFindFileIndex !== null,
    "open-rebuild-flow": true,
    // Each condition below is the one the handler already checked before
    // refusing with a status line. The other three rows stay available and the
    // reasons are worth writing down: the OS clipboard cannot be read while the
    // menu is drawn, so greying Use Clipboard on the System 6 Clipboard alone
    // would grey a button that works; the sample article ships in the same lazy
    // bundle as the flow, so it is never missing; and Cancel is reachable only
    // from inside the window it closes.
    "rebuild-use-reader": hasReaderTextForRebuild,
    "rebuild-use-teachtext": hasTeachTextTextForRebuild,
    "rebuild-use-clipboard": true,
    "rebuild-use-sample": true,
    "run-rebuild-flow": rebuildSourceLength >= rebuildMinSourceChars,
    "close-rebuild-flow": true,
    "open-context-panel": true,
    "focus-sideask-source": sideAskEnabled && !isMultiFinderMode(),
    "open-model-meter": performanceMeterInput.checked && !!lastModelMetrics,
    // The Dictation Pad names the Note Pad as its destination when no field is
    // open, so it has no state to refuse on.
    "open-dictation": true,
    "open-rag": true,
    "open-text-disk": getMountedTextDiskChunks().length > 0,
    "insert-text-disk": isProjectMounted,
    "eject-text-disk": getMountedTextDiskChunks().length > 0,
    "add-text-disk-project": getMountedTextDiskChunks().length > 0,
    "tile-windows": canTileWindows(),
    "toggle-sideask": canUseSideAsk(),
    "restart-system": true,
    "shut-down-system": true,
    "hide-active-app": !nonQuittableAppIds.has(activeAppId) && !hiddenAppIds.has(activeAppId),
    "hide-other-apps": getRunningApps().some((app) => app.id !== activeAppId && !nonQuittableAppIds.has(app.id) && !app.hidden),
    "show-all-apps": hiddenAppIds.size > 0,
    "bring-app-front": true,
    "quit-active-app": !nonQuittableAppIds.has(activeAppId),
    "view-small-icons": true,
    "view-icons": true,
    "view-by-name": true,
    "view-by-date": true,
    "view-by-size": true,
    "view-by-kind": true,
    "hide-sidebars": true,
    "switch-language": true,
    // Opening 文字亮室 is opening an application, like the Lab above: it is
    // always allowed. Whether a document can be DEVELOPED is a separate gate,
    // "develop-in-lightroom", which greys until a draft exists.
    "open-lightroom": true,
    // Whole-menu conditions, not rows. Each one names the window whose work
    // the menu belongs to; a condition nobody produces reads as falsy and
    // hides its menu forever, which is how both of these menus were lost.
    "quick-draft-menu": winName === "quickDraft",
    // The stack menu stands down while the paper is being listened to, so the
    // darkroom's two contextual menus never both apply and the bar stays at
    // five.
    "lightroom-document": winName === "lightroom" && lightroomHasBody && lightroomView !== "listen",
    "lightroom-listen": winName === "lightroom" && lightroomView === "listen",
    "open-theme-lab": true
  };
  // Explicit runtime commands supply their own availability. Reader has moved
  // off the hard-coded action map, so these rows are still grey/black in the
  // menu without window-manager.js knowing Reader's internals.
  window.AISystem6Runtime?.c?.forEach((command, action) => { if (availability[action] !== undefined) return; try { availability[action] = command.isAvailable() !== false; } catch { availability[action] = false; } });
  Object.keys(availability).forEach((action) => {
    if (!isWorkspaceActionAllowed(action)) availability[action] = false;
  });
  // A command that cannot reach a model is not available, whatever else is
  // true about it. Applied as one pass rather than folded into thirty-seven
  // conditions, so the rule stays readable and each command keeps its own
  // reason for being grey. Balloon Help answers "why" from the same set.
  if (typeof modelReadyForRequests === "function" && !modelReadyForRequests()) {
    Object.keys(availability).forEach((action) => {
      if (actionNeedsModel(action)) availability[action] = false;
    });
  }
  return availability;
}

let cachedMenuActionElements = null;
let cachedSubmenuActionElements = null;

function menuActionElements() {
  cachedMenuActionElements ||= [...document.querySelectorAll("[data-action]")];
  return cachedMenuActionElements;
}

function submenuActionElements() {
  cachedSubmenuActionElements ||= [...document.querySelectorAll("[data-submenu-action]")];
  return cachedSubmenuActionElements;
}

function invalidateMenuActionCache() {
  cachedMenuActionElements = null;
  cachedSubmenuActionElements = null;
}

function updateMenuState() {
  if (typeof renderAppMenuBar === "function") renderAppMenuBar(menuOwnerAppId || activeAppId);
  renderWritingSpineState();
  // Converges the status line on the writer after programmatic focus moves,
  // which fire no focusin. It is a parent check and at most one append.
  if (typeof syncStatusHost === "function") syncStatusHost();
  const state = getActionAvailability();
  if (typeof syncProjectCdBurnActionVisibility === "function") syncProjectCdBurnActionVisibility();
  const activeWin = document.querySelector(".window.is-active:not(.is-hidden)");
  // 文字亮室 is a second front window onto the same drafting API. Asking only
  // for quickDraft left every view checkmark and every panel label in the
  // darkroom reading a null API, so no view was ever checked there.
  const activeQuickDraftApi = ["quickDraft", "lightroom"].includes(activeWin?.dataset.window || "")
    ? window.AISystem6QuickDraft
    : null;
  const quickDraftDisplayMode = activeQuickDraftApi?.displayMode?.() || "body";
  const quickDraftSideAskActive = sideAskEnabled && sideAskAnchorAppId === "quickDraft";
  const activeViewWindow = viewWindowNames.includes(activeWin?.dataset.window) ? activeWin.dataset.window : null;
  const viewTargetIsWritingTools = !activeViewWindow && writingToolsAreViewTarget();
  const activeViewMode = viewTargetIsWritingTools
    ? normalizeFinderViewMode(writingToolsViewMode)
    : normalizeFinderViewMode(windowViewModes[activeViewWindow || "finder"]);
  document.querySelectorAll(".apple-multifinder-about-item, .apple-multifinder-about-separator")
    .forEach((item) => item.classList.toggle("is-hidden", !isMultiFinderMode()));
  document.querySelectorAll("[data-menu-condition]").forEach((element) => {
    element.classList.toggle("is-hidden", !state[element.dataset.menuCondition]);
  });
  // Writing-route command submenus follow the active writing surface: the
  // Writing menu shows only the commands that apply to the window in front,
  // instead of stacking every route's commands (mostly disabled). When no
  // route window is active (manuscript or a floating tool), the command
  // submenus collapse and only "Go To" navigation remains. The manuscript is a
  // route stop of its own now, so it carries its own one-command submenu.
  const activeWritingSurface = (typeof currentWritingRouteStop === "function" && currentWritingRouteStop())
    || document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window
    || "";
  document.querySelectorAll("[data-menu-surface]").forEach((element) => {
    element.classList.toggle("is-hidden", element.dataset.menuSurface !== activeWritingSurface);
  });

  menuActionElements().forEach(btn => {
    const action = btn.dataset.action;
    const isMenuButton = !!btn.closest(".menu-popover, .menu-submenu-popover, .menu-sub-popover");
    if (btn.closest("[data-action-availability='independent']")) {
      btn.classList.remove("is-disabled");
      if (isMenuButton) btn.disabled = false;
    } else if (state[action] !== undefined) {
      btn.classList.toggle("is-disabled", !state[action]);
      if (isMenuButton) btn.disabled = !state[action];
    }
    if (action === "toggle-outline-tree") {
      const open = typeof outlineTreeIsOpen === "function" && outlineTreeIsOpen();
      btn.classList.toggle("is-checked", open);
      if (btn.hasAttribute("aria-pressed")) btn.setAttribute("aria-pressed", String(open));
    }
    if (action === "toggle-writing-eli5") {
      const lensOn = getActiveProject()?.explanationLens?.enabled !== false;
      btn.classList.toggle("is-checked", lensOn);
      if (btn.hasAttribute("aria-pressed")) btn.setAttribute("aria-pressed", String(lensOn));
    }
    if (action === "toggle-sideask") {
      btn.classList.toggle("is-hidden", isMultiFinderMode());
      btn.classList.toggle("is-checked", sideAskEnabled);
      if (btn.hasAttribute("aria-pressed")) btn.setAttribute("aria-pressed", String(sideAskEnabled));
    }
    if (["quick-draft-view-body", "quick-draft-view-grain", "quick-draft-view-read", "quick-draft-view-listen"].includes(action)) {
      btn.classList.toggle("is-checked", action === `quick-draft-view-${quickDraftDisplayMode}`);
    }
    if (action === "quick-draft-toggle-materials" || action === "quick-draft-toggle-adjustments") {
      const panel = action === "quick-draft-toggle-materials" ? "shelf" : "inspector";
      const visible = Boolean(activeQuickDraftApi?.panelVisible?.(panel));
      const labelKey = panel === "shelf"
        ? (visible ? "quick_draft_hide_materials" : "quick_draft_show_materials")
        : (visible ? "quick_draft_hide_adjustments" : "quick_draft_show_adjustments");
      btn.dataset.i18n = labelKey;
      btn.textContent = t(labelKey);
      btn.classList.toggle("is-checked", visible);
    }
    if (action === "quick-draft-toggle-sideask") {
      const labelKey = quickDraftSideAskActive ? "quick_draft_hide_sideask" : "quick_draft_show_sideask";
      btn.dataset.i18n = labelKey;
      btn.textContent = t(labelKey);
      btn.classList.toggle("is-checked", quickDraftSideAskActive);
    }
    if (action === "tile-windows") {
      btn.classList.toggle("is-hidden", matchMedia("(max-width:860px) and (orientation:portrait)").matches);
    }
    if (btn.dataset.themeChoice) {
      btn.classList.toggle("is-checked", btn.dataset.themeChoice === getCurrentTheme());
    }
    if (btn.dataset.layoutChoice) {
      // Only an open map has a layout; with no map the rows are grey anyway and
      // stay unchecked rather than claiming a default nothing is using.
      btn.classList.toggle("is-checked", !!currentDocMap && btn.dataset.layoutChoice === docMapLayoutFor(currentDocMap));
    }
    if (action === "toggle-balloon-help") {
      btn.textContent = t(balloonHelpEnabled ? "hide_balloon_help" : "show_balloon_help");
      btn.classList.remove("is-checked");
    }
    if (action === "reset-system") {
      btn.classList.toggle("is-hidden", !state[action]);
    }
    // The row is the reminder. "Where I Left Off" tells you nothing; "Back to
    // Section Drafts (12 min ago)" tells you what you came back for before you
    // have even clicked it.
    if (action === "resume-my-place" && typeof heldPlaceResumeLabel === "function") {
      btn.textContent = heldPlaceResumeLabel();
    }
    if (viewTargetIsWritingTools && ["view-by-name", "view-by-date", "view-by-size", "view-by-kind", "view-list"].includes(action)) {
      btn.classList.add("is-disabled");
    }
    if (btn.dataset.viewMode) {
      btn.classList.toggle("is-checked", normalizeFinderViewMode(btn.dataset.viewMode) === activeViewMode);
    }
    if (btn.dataset.shuffleMode) {
      const shuffle = window.AISystem6Soundscape?.currentShuffleMode?.();
      btn.classList.toggle("is-checked", Boolean(shuffle) && btn.dataset.shuffleMode === shuffle);
    }
    if (btn.dataset.shuffleKind) {
      const kind = window.AISystem6Soundscape?.currentShuffleKind?.();
      btn.classList.toggle("is-checked", Boolean(kind) && btn.dataset.shuffleKind === kind);
    }
    if (btn.dataset.repeatMode) {
      // Only the loaded feature knows the real mode; an unloaded Soundscape
      // leaves every row unchecked rather than guessing "off".
      const mode = window.AISystem6Soundscape?.currentRepeatMode?.();
      btn.classList.toggle("is-checked", Boolean(mode) && btn.dataset.repeatMode === mode);
    }
  });
  // 文字亮室 keeps its own checkmarks and its own greys: the layer rows, the
  // zoom rows and the listen transport are parameterised actions, so they are
  // not in the availability map above. Run before the submenu pass below, or a
  // submenu whose rows are all grey would still read as live.
  window.AISystem6QuickDraft?.syncMenuState?.();
  document.querySelectorAll(".menu-submenu").forEach((sub) => {
    const children = [...sub.querySelectorAll(".menu-submenu-popover [data-action]")];
    const enabled = children.some((button) => !button.classList.contains("is-disabled"));
    sub.classList.toggle("is-disabled", !enabled);
    sub.querySelector(":scope > .menu-submenu-trigger")?.classList.toggle("is-disabled", !enabled);
  });
  submenuActionElements().forEach((btn) => {
    const action = btn.dataset.submenuAction;
    if (action === "ask-cliotalk") {
      const disabled = !state["print-to-ai"];
      btn.classList.toggle("is-disabled", disabled);
      btn.closest(".menu-submenu")?.classList.toggle("is-disabled", disabled);
    }
  });
  renderMultiFinderMenu();
  if (typeof syncDisabledMenuBalloonHelp === "function") syncDisabledMenuBalloonHelp();
  // Whether a window has anything to ask about is action availability like any
  // other, so the ask bars recompute on the same pass.
  refreshAskBars();
}

async function loadLazyWindowModule(name) {
  const entry = lazyWindowRecord(name);
  if (!entry || typeof entry.ensure !== "function") return;
  await entry.ensure();
  entry.attach?.();
}

// Appearance verification needs the real lazy window shell, not an active
// game engine, iframe, timer, or model task. Most lazy game modules install
// their frame as the script loads; the two exceptions declare a bounded shell
// attach above. Ordinary open/restore continues through loadLazyWindowModule.
async function loadLazyWindowAppearanceShell(name) {
  const entry = lazyWindowRecord(name);
  if (!entry || typeof entry.ensure !== "function") return Boolean(getWindow(name));
  await entry.ensure();
  if (!getWindow(name)) await entry.appearanceAttach?.();
  return Boolean(getWindow(name));
}

// Mount the application that owns this window.
//
// This used to pass only `getWindowAppId(name)` — the *application* id. But a
// Desk Accessory registers itself under its **window** name (`notePad`,
// `calculator`), while its app id is the shared `accessories`. No application is
// registered under `accessories`, so for seventeen of the thirty-five
// registrations the mount silently did nothing, and `mountApplication` reported
// "unregistered" to a call site that ignored the result.
//
// That was not dead weight. It was unreached wiring: the Calculator's keypad,
// the Puzzle's tiles, the Note Pad's pager and input autosave, the Clipboard's
// seven buttons and the Writing Bell's controls are all attached inside those
// mount functions, and none of those buttons carry a `data-action` to fall back
// on. Five accessories shipped with dead controls.
//
// Both keys are tried, window first, because both are legitimate: a Desk
// Accessory is registered by window name and a multi-window application (Quick
// Draft, TeachText) by app id. The runtime mounts once and reports
// "unregistered" cheaply, so the second try costs nothing.
async function mountWindowApplication(name) {
  const runtime = window.AISystem6Runtime;
  if (typeof runtime?.mountApplication !== "function") return;
  const byWindow = await runtime.mountApplication(name, { windowName: name });
  if (byWindow?.status !== "unregistered") return;
  await runtime.mountApplication(getWindowAppId(name), { windowName: name });
}

async function openWindow(name, options = {}) {
  if (!isWorkspaceWindowAllowed(name)) {
    updateMenuState();
    return;
  }
  const {
    skipFinderMode = false,
    skipPlacement = false,
    skipFocus = false,
    skipLiquidCoverEntrypoint = false,
    skipQuickDraftEntrypoint = false,
    skipSideAsk = false,
  } = options;

  if (name === "styleSheet" || name === "claimCheck") {
    openReviewDesk(name === "claimCheck" ? "facts" : "style");
    return;
  }
  if (name === "liquidCover" && !skipLiquidCoverEntrypoint && typeof ensureLiquidCoverModule === "function") {
    await ensureLiquidCoverModule();
    if (typeof window.AISystem6LiquidCover?.open === "function") {
      await window.AISystem6LiquidCover.open({ skipFinderMode, skipPlacement, skipFocus });
      return;
    }
  }
  // Session restore opens windows before the user touches anything, so the tool
  // has to be loaded here rather than only on the click path — otherwise a
  // restored desk comes back with an empty DocMap window.
  if (name === "docMap" && typeof ensureDocMapModule === "function") await ensureDocMapModule();
  if (name === "quickDraft" && !skipQuickDraftEntrypoint && typeof ensureQuickDraftModule === "function") {
    await ensureQuickDraftModule();
    if (typeof window.AISystem6QuickDraft?.open === "function") {
      await window.AISystem6QuickDraft.open({ skipFinderMode, skipPlacement, skipFocus, skipSideAsk });
      return;
    }
  }
  // The lightroom shares the Quick Draft module, so a cold open of the darkroom
  // alone — a desk icon click, or a restored desk where Quick Draft is closed —
  // has to load and render it here, or the window comes back an empty frame.
  if (name === "lightroom" && !skipQuickDraftEntrypoint && typeof ensureQuickDraftModule === "function") {
    await ensureQuickDraftModule();
    if (typeof window.AISystem6QuickDraft?.openLightroom === "function") {
      await window.AISystem6QuickDraft.openLightroom();
      return;
    }
  }
  // A large optional application may install its window frame with the same
  // lazy module that owns its interior. This keeps unopened games off the
  // startup disk while preserving the ordinary window-manager contract.
  if (!getWindow(name) && lazyWindowRecord(name)) await loadLazyWindowModule(name);
  const win = getWindow(name);
  // A lazy module injects its own window long after the boot loop bound the
  // title-bar controls, so guarantee the chrome here rather than trusting each
  // module to remember: a window whose close box does nothing is not a window.
  // The wiring is idempotent, so this costs one WeakSet lookup per open.
  window.AISystem6WireWindowChrome?.(win);
  // Same reason for the grow box: it is installed by a sweep over the windows
  // that exist, and a lazily injected one misses it. Micropolis is listed as
  // resizable, so without this its corner cell never appears.
  installGrowBoxes();
  if (!win) return;
  const wasAlreadyOpen = !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden");
  const sourceWindowForSingleTask = !isMultiFinderMode() && !skipFinderMode
    ? document.querySelector(".window.is-active:not(.is-hidden):not(.is-app-hidden)")
    : null;
  const targetAppId = getWindowAppId(name);
  const canOpen = skipFinderMode ? true : await prepareFinderModeForApp(targetAppId);
  if (!canOpen) return;
  const finderReplacementFrame = replaceVisibleFinderLocation(name);
  if (sourceWindowForSingleTask && sourceWindowForSingleTask !== win) {
    win.dataset.returnWindowName = sourceWindowForSingleTask.dataset.window || "";
  } else {
    delete win.dataset.returnWindowName;
  }
  win.dataset.app = targetAppId;
  setWindowLayoutMetadata(win);
  ensureRunningApp(win.dataset.app, name);
  hiddenAppIds.delete(win.dataset.app);
  windowsForApp(win.dataset.app).forEach((item) => item.classList.remove("is-app-hidden"));

  await loadLazyWindowModule(name);

  await mountWindowApplication(name);
  runWindowHook(name, "onOpen", { win, wasAlreadyOpen });
  win.classList.remove("is-hidden", "is-collapsed");
  if (isPortraitDocumentFlow() && mobileFinderPageWindowNames.has(name)) {
    mobileFinderDesktopPreferred = false;
  }
  if (mobileFinderPageWindowNames.has(name)) {
    renderFinderNavigationBar(win);
  }
  if (centeredSystemWindowNames.has(name)) {
    placeCenteredSystemWindow(win);
  }
  runWindowHook(name, "onReveal", { win, wasAlreadyOpen });
  updateQuickDraftFocusChrome();

  const reusedFinderFrame = !!finderReplacementFrame && !isPortraitDocumentFlow();
  if (reusedFinderFrame) {
    placeWindowForExplicitLayout(win, finderReplacementFrame);
    avoidWritingSpineOverlap(win);
  }
  const shouldPlaceWindow = !skipPlacement
    && !wasAlreadyOpen
    && !reusedFinderFrame
    && win.dataset.userPositioned !== "true";

  if (shouldPlaceWindow && isFinderContentWindow(win)) {
    fitFinderWindowToContents(win);
  }

  if (writerMode && writerModeCssOwnedWindows.has(name)) {
    clearWindowInlineGeometry(win);
  } else if (isMobileWorkAreaCssOwned(win)) {
    // Narrow non-writer work-area windows are CSS-owned too: drop stale
    // desktop inline frames so the mobile rule wins without !important.
    clearWindowInlineGeometry(win);
  }

  if (shouldPlaceWindow && !centeredSystemWindowNames.has(name) && !["about", "saveChat"].includes(name)
      && !(writerMode && writerModeCssOwnedWindows.has(name))) {
    if (!useNarrowWindowFlow(win)) {
      const desktop = document.querySelector(".desktop");
      const desktopRect = desktop?.getBoundingClientRect();
      const avoidance = getDesktopAvoidanceInsets({ margin: 24, spineGap: 18, iconGap: 48 });
      const baseLeft = writerMode ? 24 : avoidance.left;
      const baseTop = writerMode ? 34 : writingSpineAlignedTopForWindow(win, 18);
      const step = 24;
      const maxOffset = 200;

      if (name === "clioStage" && !writerMode && placeClioStageDefaultWindow(win)) {
        // ClioStage uses the full work area between the writing spine and Dock.
      } else if (name === "assistant" && !writerMode) {
        const availableWidth = desktopRect
          ? Math.max(340, desktopRect.width - avoidance.left - avoidance.right - 24)
          : 720;
        win.style.left = `${avoidance.left}px`;
        win.style.top = `${baseTop}px`;
        win.style.right = "auto";
        win.style.width = `${Math.min(720, availableWidth)}px`;
        win.style.height = "min(540px, calc(100vh - 108px))";
        win.style.maxHeight = "";
        win.style.transform = "none";
      } else if (name === "rebuildFlow" && !writerMode) {
        win.style.left = `${avoidance.left}px`;
        win.style.top = `${baseTop}px`;
        win.style.right = "auto";
        win.style.transform = "none";
      } else if (["reader", "scrapbook", "endfieldTerminal", "liquidCover", "quickDraft"].includes(name) && !writerMode) {
        win.style.left = `${avoidance.left}px`;
        win.style.top = `${baseTop}px`;
        win.style.right = "auto";
        win.style.transform = "none";
        maximizeWindow(win, { top: baseTop });
      } else if (name === "docMap" && !writerMode) {
        win.style.left = `${avoidance.left}px`;
        win.style.top = `${baseTop}px`;
        win.style.right = "auto";
        win.style.transform = "none";
        maximizeWindow(win, { top: baseTop });
        requestAnimationFrame(() => {
          withDocMap(() => {
            renderDocMap();
            requestAnimationFrame(() => restoreDocMapCanvasView());
          });
        });
      } else if (name === "systemHelp") {
        if (!writerMode) {
          win.style.left = `${avoidance.left}px`;
          win.style.top = `${baseTop}px`;
          win.style.right = "auto";
          win.style.transform = "none";
        }
      } else if (["findPath", "contextPanel"].includes(name) && !writerMode) {
        placeUtilityWindow(name, win);
      } else if (assistantSidecarWindowNames.has(name) && !writerMode) {
        placeAssistantSidecarWindow(name, win);
      } else if (isDeskAccessoryPlacementWindow(name) && !writerMode) {
        placeDA(win);
      } else if (isFinderCascadeWindow(name) && !writerMode) {
        placeFinderCascadeWindow(win, { avoidance, baseTop });
      } else {
        win.style.left = `${baseLeft + cascadeOffset}px`;
        win.style.top = `${baseTop + cascadeOffset}px`;
        win.style.right = "auto";
        cascadeOffset += step;
      }

      if (cascadeOffset > maxOffset) cascadeOffset = 0;
      placeNewWindowAvoidingVisibleWindows(win);
      clampWindowToViewport(win);
      markWindowSystemPositioned(win);
      scheduleWritingSpineTitleAlignment(win);
    }
  }

  if (!skipFocus) {
    focusWindow(win);
    if (!["assistant", "about"].includes(name)) playSystemSound("open");
  }
  // Arrange the writing workspace AFTER focus raises the window: the mobile
  // foreground pass picks the surface with the highest z-index, so it must
  // run once the just-opened window actually has the top z.
  if (shouldPlaceWindow && ["questionSheet", "outline", "sectionDrafts", "reviewDesk", "teachText"].includes(name)) {
    arrangeActiveWritingWorkspace();
  }

  if (name === "about") {
    modalScrim.classList.remove("is-hidden");
  }
  syncMobileAppForeground();
  updateMenuState();
  // A lazy application registers its lifecycle while attaching above, after the
  // class flips the observer watches. Reconcile once here so a restored window
  // comes back running instead of waiting for the next unrelated flip.
  scheduleApplicationLifecycleRefresh?.("open-window");
  scheduleWorkingSessionSave?.();
}

function arrangeOutlineTeachTextSplit() {
  const outline = getWindow("outline");
  const teachText = getWindow("teachText");
  if (!outline || !teachText) return;
  if (outline.classList.contains("is-hidden") || teachText.classList.contains("is-hidden")) return;
  if (writerMode) return;
  if (outline.dataset.userPositioned === "true" || teachText.dataset.userPositioned === "true") return;

  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect?.();
  const avoidance = getDesktopAvoidanceInsets({ margin: 18, spineGap: 18, iconGap: 132 });
  const gap = 16;
  const left = Math.max(18, avoidance.left || 18);
  const top = Math.max(18, writingSpineAlignedTop?.(18) || 18);
  const right = Math.max(132, avoidance.right || 132);
  const totalWidth = Math.max(620, (desktopRect?.width || window.innerWidth) - left - right - gap);
  const totalHeight = Math.max(420, (desktopRect?.height || window.innerHeight) - top - 36);
  const stacked = window.matchMedia("(orientation: portrait), (max-width: 980px)").matches;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const applyFrame = (win, frame) => {
    placeWindowForExplicitLayout(win, {
      left: frame.left,
      top: frame.top,
      width: frame.width,
      height: frame.height,
      maxHeight: frame.height,
    });
  };

  // The paper measure is the floor, not 360. Writing windows are pinned to a
  // paper-driven minimum and cannot shrink below it without breaking the editor
  // measure — the rule arrangeWritingPairSplit already follows. This split used
  // a magic 360 instead, so at a 1280 desktop the Outline was placed at 374px
  // against a 540px paper: CSS min-width drew 540 while the recorded frame said
  // 374, and every later reader of that frame inherited the wrong number.
  // When two papers do not fit, the pair stacks — same answer as its sibling.
  const paperMin = Math.max(
    parseFloat(getComputedStyle(outline).minWidth) || 0,
    parseFloat(getComputedStyle(teachText).minWidth) || 0,
    540
  );

  if (stacked || totalWidth < paperMin * 2 + gap) {
    const halfHeight = Math.max(220, Math.floor((totalHeight - gap) / 2));
    applyFrame(outline, { left, top, width: totalWidth, height: halfHeight });
    applyFrame(teachText, { left, top: top + halfHeight + gap, width: totalWidth, height: totalHeight - halfHeight - gap });
    return;
  }

  const outlineWidth = clamp(Math.round(totalWidth * 0.42), paperMin, totalWidth - gap - paperMin);
  const teachTextWidth = totalWidth - outlineWidth - gap;
  applyFrame(outline, { left, top, width: outlineWidth, height: totalHeight });
  applyFrame(teachText, { left: left + outlineWidth + gap, top, width: teachTextWidth, height: totalHeight });
}

// Co-locate two writing windows as one phase workspace (Section Drafts ‖ draft
// manuscript; Review Desk ‖ finalized manuscript). Writing windows are pinned to a
// paper-driven minimum width and cannot shrink below it without breaking the editor
// measure, so the pairing is responsive: side-by-side only when two paper widths
// fit, otherwise stacked vertically (still one workspace). Invoked by an explicit
// "advance" action, so it re-arranges even a previously user-positioned pair.
function arrangeWritingPairSplit(leftName, rightName) {
  const leftWin = getWindow(leftName);
  const rightWin = getWindow(rightName);
  if (!leftWin || !rightWin) return;
  if (leftWin.classList.contains("is-hidden") || rightWin.classList.contains("is-hidden")) return;
  if (writerMode) return;

  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect?.();
  const avoidance = getDesktopAvoidanceInsets({ margin: 18, spineGap: 18, iconGap: 132 });
  const gap = 16;
  const left = Math.max(18, avoidance.left || 18);
  const top = Math.max(18, writingSpineAlignedTop?.(18) || 18);
  const right = Math.max(132, avoidance.right || 132);
  const available = Math.max(560, (desktopRect?.width || window.innerWidth) - left - right);
  const totalHeight = Math.max(420, (desktopRect?.height || window.innerHeight) - top - 36);

  // Paper-driven minimum width is load-bearing; never set a width below it.
  const minW = Math.max(
    parseFloat(getComputedStyle(rightWin).minWidth) || 0,
    parseFloat(getComputedStyle(leftWin).minWidth) || 0,
    540
  );
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const canSideBySide = !portrait && available >= (minW * 2 + gap);
  const applyFrame = (win, frame) => placeWindowForExplicitLayout(win, {
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height,
    maxHeight: frame.height,
  });

  if (canSideBySide) {
    const pairWidth = minW * 2 + gap;
    const startLeft = left + Math.max(0, Math.floor((available - pairWidth) / 2));
    applyFrame(leftWin, { left: startLeft, top, width: minW, height: totalHeight });
    applyFrame(rightWin, { left: startLeft + minW + gap, top, width: minW, height: totalHeight });
    return;
  }

  const halfHeight = Math.max(220, Math.floor((totalHeight - gap) / 2));
  applyFrame(leftWin, { left, top, width: minW, height: halfHeight });
  applyFrame(rightWin, { left, top: top + halfHeight + gap, width: minW, height: totalHeight - halfHeight - gap });
}

// 起草台: Section Drafts (editable owner) beside the read-only draft manuscript.
function arrangeDraftingWorkspaceSplit() {
  arrangeWritingPairSplit("sectionDrafts", "teachText", 0.42);
}

// 审校台: Review Desk beside the finalized manuscript (editable owner under review).
function arrangeReviewWorkspaceSplit() {
  arrangeWritingPairSplit("reviewDesk", "teachText");
}

// Arrange whichever phase workspace is currently open as a manuscript pair. Called
// from openWindow's placement tail (so it runs after default cascade placement and
// sticks). Priority follows the route: review > drafting > legacy outline split.
function arrangeActiveWritingWorkspace() {
  // On a phone each writing phase is one full-screen app, so pairing two paper
  // widths side by side is meaningless — and these splits write inline frames
  // that would override the full-screen shell. Phones use an explicit
  // single-foreground model instead: the current phase owns the screen and the
  // previous phases stay reachable (as backable surfaces) without stacking.
  if ((isPortraitDocumentFlow() && mobileFullScreenAppIds.has("teachText")) || isNarrowViewport()) {
    arrangeMobileWritingForeground();
    return;
  }
  const isOpen = (name) => {
    const win = getWindow(name);
    return win && !win.classList.contains("is-hidden");
  };
  const reviewPhase = typeof teachTextReviewLabel === "function" && teachTextReviewLabel();
  if (isOpen("teachText")) {
    if (reviewPhase && isOpen("reviewDesk")) {
      arrangeReviewWorkspaceSplit();
      return;
    }
    if (isOpen("sectionDrafts")) {
      arrangeDraftingWorkspaceSplit();
      return;
    }
    if (isOpen("outline")) {
      arrangeOutlineTeachTextSplit();
      return;
    }
  }
  // Phases 1 and 2 have no manuscript to pair with yet, and the old guard
  // returned before arranging anything at all. Opening the stops one at a time
  // therefore left four paper-width windows cascading 24 px apart, with the
  // Question Sheet completely buried. A phase with one surface still gets the
  // screen.
  arrangeSoloWritingWindow();
}

// The route surface that is in front, given the whole desktop width rather than
// a cascade offset. Respects a window the user has dragged: an explicit
// placement is a decision, and only an explicit advance overrides it.
// Where the writer is standing. One answer, shared by the status line, the
// Writing Flow palette, the advance chord and Find/Change - four things that
// each used to ask their own question and could therefore disagree on screen.
//
// The caret decides first. The route deliberately raises the manuscript beside
// the surface being edited, so "the window in front" alone points at the
// read-only projection: it would host the status line in the wrong window, mark
// the wrong stop as current, and hand ⇧⌘→ "Mark Final?" while the writer was
// still filling in the Question Sheet. Same reason resolvePipelineSourceSurface
// refuses to trust document.activeElement alone.
const writingRouteSurfaceStops = Object.freeze({
  "question-sheet-body": "questionSheet",
  "outline-content": "outline",
  "draft-body": "sectionDrafts",
  "teachtext-body": "teachText",
  "review-desk-body": "reviewDesk",
});

function currentWritingRouteStop() {
  const caret = writingRouteSurfaceStops[document.activeElement?.id || ""] || "";
  if (caret) {
    const win = getWindow(caret);
    if (win && !win.classList.contains("is-hidden")) return caret;
  }
  const active = document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window || "";
  return Object.values(writingRouteSurfaceStops).includes(active) ? active : "";
}

// The Writing Flow palette used to be five buttons that said nothing about the
// work. Three marks, all 1-bit, each encoding something true:
//   - the label reverses on the stop whose window is in front (where you are),
//   - the step-number badge fills on the stop that owns the manuscript text
//     (where the pen is),
//   - a small diamond appears on stops that hold content, the way the classic
//     Application menu marked an application with open windows.
const writingSpineStops = Object.freeze({
  "open-question-sheet": "questionSheet",
  "open-outline": "outline",
  "open-section-drafts": "sectionDrafts",
  "open-teachtext": "teachText",
  "open-review-desk": "reviewDesk",
});

function writingMarkdownHasWork(markdown) {
  const text = String(markdown || "").trim();
  if (!text) return false;
  if (typeof getMeaningfulOutlineSections === "function" && typeof extractOutlineSections === "function") {
    if (getMeaningfulOutlineSections(extractOutlineSections(text)).length > 0) return true;
    // Prose under a placeholder heading is still work.
    return !!text.replace(/^#{1,6}[^\n]*$/gm, "").trim();
  }
  return !/^#{1,6}\s*(New Section|新章节)\s*\d*$/i.test(text);
}

function writingSpineStopHasContent(name, project) {
  const live = (element, fallback) => String(element?.value ?? fallback ?? "").trim();
  switch (name) {
    case "questionSheet":
      return !!live(questionSheetBodyInput, project?.questionSheet);
    case "outline":
      return writingMarkdownHasWork(live(outlineContentEl, project?.outline));
    case "sectionDrafts":
      if (live(draftBodyInput)) return true;
      return (project?.drafts || []).some((draft) => String(draft?.body || "").trim());
    case "teachText":
      // A fresh project ships the "## New Section" placeholder, and the
      // manuscript projects it. A mark that appears before the writer has
      // written anything reports nothing.
      return writingMarkdownHasWork(live(teachTextBodyInput, project?.outline));
    case "reviewDesk":
      return typeof teachTextReviewLabel === "function" && !!teachTextReviewLabel();
    default:
      return false;
  }
}

// Which stop currently owns the route document. This mirrors the locks the
// write lease actually enforces, so the mark cannot disagree with what the
// writer can type into.
function writingSpineStopHoldsPen(name) {
  const phase = typeof manuscriptPhase === "function" ? manuscriptPhase() : "drafting";
  return phase === "drafting" ? name === "sectionDrafts" : name === "teachText";
}

function renderWritingSpineState() {
  const buttons = document.querySelectorAll(".spine-section-main button[data-action]");
  if (!buttons.length) return;
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  const activeName = currentWritingRouteStop()
    || document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window
    || "";
  buttons.forEach((button) => {
    const name = writingSpineStops[button.dataset.action];
    if (!name) return;
    const current = name === activeName;
    const pen = writingSpineStopHoldsPen(name);
    const content = writingSpineStopHasContent(name, project);
    // is-selected is the shared "this object is the current one" state: every
    // appearance already has a twin for it (Liquid Glass reverses the label and
    // sets -webkit-text-fill-color, Yosemite paints a flat gray tile). A
    // parallel class of our own would tie on specificity with those twins and
    // lose on source order - which is how the current stop became a blank white
    // pill under Liquid Glass.
    button.classList.toggle("is-selected", current);
    button.classList.toggle("holds-pen", pen);
    button.classList.toggle("has-content", content);
    button.setAttribute("aria-current", current ? "true" : "false");
    const marks = [
      current ? t("writing_spine_here") : "",
      pen ? t("writing_spine_pen") : "",
      content ? t("writing_spine_has_content") : "",
    ].filter(Boolean);
    const label = button.querySelector("b")?.textContent?.trim() || name;
    button.title = marks.length ? `${label} — ${marks.join(" · ")}` : label;
  });
}

function arrangeSoloWritingWindow() {
  if (writerMode) return;
  const order = ["reviewDesk", "teachText", "sectionDrafts", "outline", "questionSheet"];
  const activeName = document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window || "";
  const isOpen = (name) => {
    const win = getWindow(name);
    return win && !win.classList.contains("is-hidden");
  };
  const name = order.includes(activeName) && isOpen(activeName)
    ? activeName
    : order.find(isOpen);
  const win = name ? getWindow(name) : null;
  if (!win) return;
  if (win.dataset.userPositioned === "true") return;

  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect?.();
  const avoidance = getDesktopAvoidanceInsets({ margin: 18, spineGap: 18, iconGap: 132 });
  const left = Math.max(18, avoidance.left || 18);
  const top = Math.max(18, writingSpineAlignedTop?.(18) || 18);
  const right = Math.max(132, avoidance.right || 132);
  const available = Math.max(360, (desktopRect?.width || window.innerWidth) - left - right);
  const height = Math.max(320, (desktopRect?.height || window.innerHeight) - top - 36);
  // Paper-driven minimum width is load-bearing; a solo window may be wider than
  // one paper measure but never narrower. Clamp to the available room first and
  // apply the floor last: the other order let a desktop narrower than one paper
  // measure win, so at an 880px viewport the frame recorded 510px while CSS
  // min-width still drew 540px, and every later reader of style.width -- session
  // restore, Zoom, a drag -- inherited the wrong number.
  const minW = Math.max(parseFloat(getComputedStyle(win).minWidth) || 0, 540);
  const width = Math.max(minW, Math.min(Math.round(available * 0.62), available));
  const startLeft = left + Math.max(0, Math.floor((available - width) / 2));
  placeWindowForExplicitLayout(win, { left: startLeft, top, width, height, maxHeight: height });
}

// Set by openTeachTextManuscriptWindow: the user explicitly asked for the
// manuscript (Review Desk -> View Manuscript), so it must own the phone
// screen even before the workflow is marked Final.
let mobileManuscriptForegroundRequested = false;

/**
 * Mobile single-foreground writing model. Only one route surface owns the
 * screen per phase; the others are hidden (not closed), so the content and
 * state stay intact and the Writing menu's Go To can bring them back.
 *
 * The foreground is the highest-z open route surface (the one the app last
 * raised), except the manuscript: it only qualifies when the user explicitly
 * opened it (View Manuscript) or the workflow is Final. A manuscript preview
 * that the drafting flow raises must never cover Section Drafts.
 */
function arrangeMobileWritingForeground() {
  const isOpen = (name) => {
    const win = getWindow(name);
    return win && !win.classList.contains("is-hidden");
  };
  const isManuscript = typeof isTeachTextManuscriptRole === "function"
    ? isTeachTextManuscriptRole()
    : false;
  const surfaces = ["questionSheet", "outline", "sectionDrafts", "reviewDesk"];
  const openSurfaces = surfaces.filter(isOpen);
  const teachTextOpen = isManuscript && isOpen("teachText");

  if (!openSurfaces.length && !teachTextOpen) return;

  const reviewPhase = typeof teachTextReviewLabel === "function" && teachTextReviewLabel();
  const manuscriptWanted = mobileManuscriptForegroundRequested;
  mobileManuscriptForegroundRequested = false;
  const teachTextEligible = teachTextOpen && (manuscriptWanted || reviewPhase);
  const candidates = [...openSurfaces, ...(teachTextEligible ? ["teachText"] : [])];
  if (!candidates.length) return;

  const foreground = candidates
    .map((name) => ({ name, z: Number(getComputedStyle(getWindow(name)).zIndex || 0) }))
    .sort((a, b) => b.z - a.z)[0].name;

  candidates.forEach((name) => {
    const win = getWindow(name);
    win.classList.toggle("is-hidden", name !== foreground);
  });
  if (foreground) {
    const foregroundWin = getWindow(foreground);
    if (foregroundWin) focusWindow(foregroundWin);
  }
}

function placeUtilityWindow(name, win) {
  const margin = 16;
  const menuHeight = 25;
  const iconGutter = 112;
  const assistant = getWindow("assistant");
  const pairName = name === "findPath" ? "contextPanel" : "findPath";
  const pair = getWindow(pairName);
  const width = win.offsetWidth || (name === "findPath" ? 420 : 380);
  const height = win.offsetHeight || (name === "findPath" ? 620 : 520);
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const rightColumnLeft = Math.max(margin, window.innerWidth - width - iconGutter);
  let left = rightColumnLeft;
  let top = writingSpineAlignedTopForWindow(win, 18);

  if (assistant && !assistant.classList.contains("is-hidden")) {
    const rect = assistant.getBoundingClientRect();
    const candidateLeft = rect.right + 12;

    if (candidateLeft + width <= window.innerWidth - margin) {
      left = candidateLeft;
      top = Math.max(menuHeight + 8, rect.top);
    }
  }

  left = Math.min(Math.max(margin, left), maxLeft);

  if (name === "contextPanel" && pair && !pair.classList.contains("is-hidden")) {
    const pairRect = pair.getBoundingClientRect();
    const stackedTop = pairRect.bottom + 12;
    const bottomLimit = window.innerHeight - margin;
    top = stackedTop + height <= bottomLimit
      ? stackedTop
      : Math.max(writingSpineAlignedTopForWindow(win, 18), bottomLimit - height);
    left = Math.min(Math.max(margin, pairRect.left), maxLeft);
  }

  if (name === "findPath" && pair && !pair.classList.contains("is-hidden")) {
    const pairRect = pair.getBoundingClientRect();
    const pairTop = Math.min(window.innerHeight - pairRect.height - margin, top + height + 12);
    pair.style.left = `${left}px`;
    pair.style.top = `${Math.max(menuHeight + margin, pairTop)}px`;
    pair.style.right = "auto";
    pair.style.transform = "none";
  }

  win.style.left = `${left}px`;
  win.style.top = `${Math.min(top, window.innerHeight - height - margin)}px`;
  win.style.right = "auto";
  win.style.transform = "none";
}

function visibleDeskAccessories() {
  return Array.from(document.querySelectorAll(".window[data-window]:not(.is-hidden):not(.is-app-hidden)"))
    .filter(isDeskAccessoryPlacementWindow);
}

function visiblePortraitDeskAccessories() {
  return Array.from(document.querySelectorAll(".window[data-window]:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)"))
    .filter((win) => getWindowAppId(win) === "accessories");
}

function clearPortraitDeskAccessoryPlacement(win) {
  if (!win) return;
  portraitDeskAccessoryResizeObserver?.unobserve(win);
  portraitDeskAccessoryHeights.delete(win);
  win.classList.remove("is-mobile-da-arranged");
  [
    "--mobile-da-top",
    "--mobile-da-max-height",
    "--mobile-da-transform",
  ].forEach((property) => win.style.removeProperty(property));
}

function mobileSafeAreaBottom() {
  const value = window.getComputedStyle(document.documentElement)
    .getPropertyValue("--safe-area-bottom");
  return Math.max(0, Number.parseFloat(value) || 0);
}

// A Desk Accessory can change height without the desk resizing — the Control
// Panel grows when you pick a taller tab. The placement was only recomputed on
// open/resize, so the window kept the top it was centred at while its bottom
// slid past the screen edge, stranding the buttons on that pane off-screen with
// nothing to scroll. Re-centre whenever an arranged DA reports a new height.
const portraitDeskAccessoryHeights = new WeakMap();
let portraitDeskAccessoryResizeObserver = null;

function watchPortraitDeskAccessoryHeight(win) {
  if (typeof ResizeObserver !== "function") return;
  if (!portraitDeskAccessoryResizeObserver) {
    portraitDeskAccessoryResizeObserver = new ResizeObserver((entries) => {
      // The arrange pass itself resizes these windows; only a height the pass
      // did not just record is a real content change, so this settles in one
      // extra pass instead of looping.
      const grew = entries.some((entry) => {
        const height = Math.round(entry.target.getBoundingClientRect().height);
        return portraitDeskAccessoryHeights.get(entry.target) !== height;
      });
      if (grew && isPortraitDocumentFlow()) arrangePortraitDeskAccessories();
    });
  }
  portraitDeskAccessoryResizeObserver.observe(win);
}

function arrangePortraitDeskAccessories(frontWin = null) {
  const margin = 12;
  const gap = 10;
  const menuBottom = document.querySelector(".menu-bar")?.getBoundingClientRect().bottom || 0;
  const viewportHeight = Math.round(window.visualViewport?.height || window.innerHeight);
  const safeAreaBottom = mobileSafeAreaBottom();
  const topMin = Math.round(menuBottom + margin);
  const bottomMax = Math.max(topMin + 1, viewportHeight - safeAreaBottom - margin);
  const availableHeight = Math.max(1, bottomMax - topMin);
  const ordered = visiblePortraitDeskAccessories()
    .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0))
    .filter((candidate) => candidate !== frontWin);
  if (frontWin && visibleWindowOrNull(frontWin) && getWindowAppId(frontWin) === "accessories") {
    ordered.push(frontWin);
  }
  if (!ordered.length) return;

  ordered.forEach((candidate) => {
    clearPortraitWindowSize(candidate);
    [
      "left",
      "top",
      "right",
      "width",
      "height",
      "max-height",
      "transform",
    ].forEach((property) => candidate.style.removeProperty(property));
    candidate.classList.add("is-mobile-da-arranged");
    candidate.style.setProperty("--mobile-da-transform", "translateX(-50%)");
    candidate.style.setProperty("--mobile-da-max-height", `${availableHeight}px`);
  });

  const naturalHeights = ordered.map((candidate) => candidate.getBoundingClientRect().height);
  const naturalTotal = naturalHeights.reduce((sum, height) => sum + height, 0)
    + gap * Math.max(0, ordered.length - 1);
  if (naturalTotal > availableHeight) {
    const sharedHeight = Math.max(
      1,
      Math.floor((availableHeight - gap * Math.max(0, ordered.length - 1)) / ordered.length)
    );
    ordered.forEach((candidate) => {
      candidate.style.setProperty("--mobile-da-max-height", `${sharedHeight}px`);
    });
  }

  const heights = ordered.map((candidate) => candidate.getBoundingClientRect().height);
  const stackHeight = heights.reduce((sum, height) => sum + height, 0)
    + gap * Math.max(0, ordered.length - 1);
  // The lift is desk slack for small accessories. A single DA that nearly
  // fills the rail reads as "off-center" when lifted (the dictionary window
  // is capped at 440px against a ~700px rail), so keep tall single windows
  // truly centered instead.
  const singleTallWindow = ordered.length === 1 && heights[0] > availableHeight * 0.6;
  const visualLift = singleTallWindow ? 0 : Math.min(60, Math.round(availableHeight * 0.08));
  let top = topMin + Math.max(0, Math.round((availableHeight - stackHeight) / 2) - visualLift);

  ordered.forEach((candidate, index) => {
    candidate.style.setProperty("--mobile-da-top", `${Math.round(top)}px`);
    top += heights[index] + gap;
    setWindowLayerZ(candidate, nextWindowLayerZ(8100 + index));
    portraitDeskAccessoryHeights.set(candidate, Math.round(heights[index]));
    watchPortraitDeskAccessoryHeight(candidate);
  });
}

function getTileCandidateWindows() {
  if (writerMode) return [];
  if (window.matchMedia("(max-width: 860px)").matches) return [];
  return Array.from(document.querySelectorAll(".window[data-window]:not(.is-hidden):not(.is-app-hidden)"))
    .filter((win) => {
      if (["about", "saveChat"].includes(win.dataset.window)) return false;
      if (isDeskAccessoryPlacementWindow(win)) return false;
      if (isMultiFinderMode()) return true;
      const appId = getWindowAppId(win);
      if (sideAskEnabled && isSideAskPairApp(appId)) return true;
      return appId === activeAppId;
    });
}

function canTileWindows() {
  return getTileCandidateWindows().some((win) => tileableWindowNames.has(win.dataset.window));
}

function visibleWindowOrNull(candidate) {
  return candidate
    && !candidate.classList.contains("is-hidden")
    && !candidate.classList.contains("is-app-hidden")
    && !candidate.classList.contains("is-collapsed")
    ? candidate
    : null;
}

function isDeskAccessorySidecar(winOrName) {
  const name = typeof winOrName === "string" ? winOrName : winOrName?.dataset.window;
  return name === "dictation" || name === "translationPad" || name === "sideAskPad";
}

function isFixedDeskAccessoryWindow(winOrName) {
  return getWindowAppId(winOrName) === "accessories" && !isDeskAccessorySidecar(winOrName);
}

function isDeskAccessoryPlacementWindow(winOrName) {
  return isFixedDeskAccessoryWindow(winOrName);
}

function visibleDeskAccessorySidecars() {
  return ["dictation", "translationPad", "sideAskPad"]
    .map(getWindow)
    .filter(visibleWindowOrNull);
}

function raiseVisibleDeskAccessorySidecars(frontWin = null) {
  const ordered = visibleDeskAccessorySidecars()
    .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0))
    .filter((candidate) => candidate !== frontWin);
  if (isDeskAccessorySidecar(frontWin) && visibleWindowOrNull(frontWin)) ordered.push(frontWin);
  ordered.forEach((candidate) => {
    setWindowLayerZ(candidate, nextWindowLayerZ());
  });
}

function deskAccessorySourceWindow(frontWin) {
  return document.querySelector(".window.is-active:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)")
    || visibleWindowOrNull(getWindow("assistant"));
}

function ensureWritingSpineCollapsedForPortraitDA() {
  if (!isPortraitDocumentFlow() || writerMode) return;
  const spine = document.querySelector(".writing-spine-panel") || document.querySelector(".spine-flow-toolbox");
  if (!spine || spine.classList.contains("is-shaded")) return;
  spine.classList.add("is-shaded");
  if (typeof syncWritingToolsShadeToggle === "function") syncWritingToolsShadeToggle();
}

function arrangeDeskAccessories(frontWin = null) {
  if (isPortraitDocumentFlow()) {
    arrangePortraitDeskAccessories(frontWin);
    return;
  }
  visiblePortraitDeskAccessories().forEach(clearPortraitDeskAccessoryPlacement);
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  const spine = document.querySelector(".writing-spine-panel") || document.querySelector(".spine-flow-toolbox");
  const spineRect = spine?.getBoundingClientRect?.();
  const margin = 16;
  const gap = 12;
  const stepX = 36;
  const stepY = 32;
  const avoidance = getDesktopAvoidanceInsets({ margin, spineGap: 18, iconGap: 48 });
  const leftMin = avoidance.left;
  let topMin = frontWin ? writingSpineAlignedTopForWindow(frontWin, margin) : writingSpineAlignedTop(margin);
  if (isPortraitDocumentFlow()) {
    if (desktopRect && spineRect && spineRect.height > 0) {
      topMin = Math.max(topMin, Math.round(spineRect.bottom - desktopRect.top + gap));
    }
  }
  const rightMax = Math.max(leftMin + 220, (desktopRect?.width || innerWidth) - avoidance.right - margin);
  const bottomMax = Math.max(topMin + 220, (desktopRect?.height || innerHeight) - margin);
  const ordered = visibleDeskAccessories()
    .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0))
    .filter((candidate) => candidate !== frontWin && candidate.dataset.userPositioned !== "true");
  if (frontWin && !frontWin.classList.contains("is-hidden") && frontWin.dataset.userPositioned !== "true") ordered.push(frontWin);
  if (!ordered.length) return;

  const sizes = ordered.map((candidate) => {
    clearPortraitWindowSize(candidate);
    candidate.style.height = "";
    candidate.style.maxHeight = "";
    const preferredWidth = registeredWindowWidth(candidate.dataset.window) || candidate.offsetWidth || 360;
    const width = Math.min(preferredWidth, rightMax - leftMin);
    const height = Math.min(candidate.offsetHeight || 320, bottomMax - topMin);
    return { candidate, width, height };
  });
  const stackWidth = Math.max(...sizes.map((item) => item.width)) + stepX * (sizes.length - 1);
  const stackHeight = Math.max(...sizes.map((item) => item.height)) + stepY * (sizes.length - 1);
  const startMaxX = Math.max(leftMin, rightMax - stackWidth);
  const startMaxY = Math.max(topMin, bottomMax - stackHeight);
  let startX = startMaxX;
  let startY = topMin;

  if (isPortraitDocumentFlow() && desktopRect && spineRect && spineRect.width > 0 && spineRect.height > 0) {
    const primaryWidth = sizes[0]?.width || 360;
    const primaryHeight = sizes[0]?.height || 320;
    const centerX = ((desktopRect.width || innerWidth) - primaryWidth) / 2;
    // Visual center in portrait should sit slightly above geometric center.
    const visualLift = Math.min(120, Math.round((desktopRect.height || innerHeight) * 0.1));
    const centerY = (((desktopRect.height || innerHeight) - primaryHeight) / 2) - visualLift;
    startX = clampNumber(Math.round(centerX), leftMin, startMaxX);
    startY = clampNumber(Math.round(centerY), topMin, startMaxY);
  }

  const source = deskAccessorySourceWindow(frontWin);
  let foundSourceSlot = false;

  if (!isPortraitDocumentFlow() && source && getWindowAppId(source) !== "accessories") {
    const rect = source.getBoundingClientRect();
    const desktopLeft = desktopRect?.left || 0;
    const desktopTop = desktopRect?.top || 0;
    const left = rect.left - desktopLeft;
    const right = rect.right - desktopLeft;
    const top = rect.top - desktopTop;
    const bottom = rect.bottom - desktopTop;
    const slots = [
      [right + gap + stackWidth <= rightMax, right + gap, clampNumber(top, topMin, startMaxY)],
      [left - gap - stackWidth >= leftMin, left - gap - stackWidth, clampNumber(top, topMin, startMaxY)],
      [bottom + gap + stackHeight <= bottomMax, clampNumber(left, leftMin, startMaxX), bottom + gap],
      [top - gap - stackHeight >= topMin, clampNumber(left, leftMin, startMaxX), top - gap - stackHeight],
    ];
    const slot = slots.find((candidate) => candidate[0]);
    if (slot) {
      [, startX, startY] = slot;
      foundSourceSlot = true;
    }
  }

  if (!isPortraitDocumentFlow() && !foundSourceSlot) {
    const anchor = ordered.find((candidate) => candidate !== frontWin);
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const desktopLeft = desktopRect?.left || 0;
      const desktopTop = desktopRect?.top || 0;
      startX = clampNumber(rect.left - desktopLeft, leftMin, startMaxX);
      startY = clampNumber(rect.top - desktopTop, topMin, startMaxY);
    }
  }

  sizes.forEach(({ candidate, width }, index) => {
    // The cascade step assumes desktop slack. In portrait a desk accessory is
    // already sized to the whole working span, so every window after the first
    // would hang off the right edge; clamp each step back inside it.
    const cascadeLeft = clampNumber(
      startX + stepX * index,
      leftMin,
      Math.max(leftMin, rightMax - width)
    );
    candidate.style.left = `${Math.round(cascadeLeft)}px`;
    candidate.style.top = `${Math.round(startY + stepY * index)}px`;
    candidate.style.width = `${Math.round(width)}px`;
    candidate.style.right = "auto";
    candidate.style.transform = "none";
    setWindowLayerZ(candidate, nextWindowLayerZ(8100 + index));
  });
}

function placeDA(win) {
  ensureWritingSpineCollapsedForPortraitDA();
  if (win?.dataset.userPositioned === "true" && !isPortraitDocumentFlow()) {
    setWindowLayerZ(win, nextWindowLayerZ());
    return;
  }
  arrangeDeskAccessories(win);
}

function hasOpenAssistantSidecar() {
  return [...assistantSidecarWindowNames].some((name) => {
    const win = getWindow(name);
    return win && !win.classList.contains("is-hidden");
  });
}

function storeAssistantFrameForSidecar(assistant) {
  if (!assistant || assistant.dataset.sidecarAdjusted === "true") return;
  assistant.dataset.sidecarAdjusted = "true";
  assistant.dataset.sidecarRestoreLeft = assistant.style.left || "";
  assistant.dataset.sidecarRestoreTop = assistant.style.top || "";
  assistant.dataset.sidecarRestoreRight = assistant.style.right || "";
  assistant.dataset.sidecarRestoreWidth = assistant.style.width || "";
  assistant.dataset.sidecarRestoreHeight = assistant.style.height || "";
  assistant.dataset.sidecarRestoreTransform = assistant.style.transform || "";
}

function restoreAssistantAfterSidecar(options = {}) {
  const assistant = getWindow("assistant");
  if (!assistant || assistant.dataset.sidecarAdjusted !== "true") return;
  if (!options.force && hasOpenAssistantSidecar()) return;

  assistant.style.left = assistant.dataset.sidecarRestoreLeft || "";
  assistant.style.top = assistant.dataset.sidecarRestoreTop || "";
  assistant.style.right = assistant.dataset.sidecarRestoreRight || "";
  assistant.style.width = assistant.dataset.sidecarRestoreWidth || "";
  assistant.style.height = assistant.dataset.sidecarRestoreHeight || "";
  assistant.style.transform = assistant.dataset.sidecarRestoreTransform || "";

  delete assistant.dataset.sidecarAdjusted;
  delete assistant.dataset.sidecarRestoreLeft;
  delete assistant.dataset.sidecarRestoreTop;
  delete assistant.dataset.sidecarRestoreRight;
  delete assistant.dataset.sidecarRestoreWidth;
  delete assistant.dataset.sidecarRestoreHeight;
  delete assistant.dataset.sidecarRestoreTransform;
}

function getAssistantSidecarDefaults(name) {
  return {
    dictation: { width: 380, height: 520, minAssistantWidth: 420 },
    translationPad: { width: 380, height: 520, minAssistantWidth: 420 },
    importUtility: { width: 460, height: 520, minAssistantWidth: 420 },
    rag: { width: 500, height: 360, minAssistantWidth: 420 },
  }[name] || { width: 380, height: 480, minAssistantWidth: 420 };
}

function isAssistantSidecarWindow(winOrName) {
  const name = typeof winOrName === "string" ? winOrName : winOrName?.dataset.window;
  return assistantSidecarWindowNames.has(name);
}

function visibleSidecarAnchor(candidate) {
  return visibleWindowOrNull(candidate);
}

function getPreferredAssistantSidecarSource(name) {
  const active = document.querySelector(".window.is-active:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)");
  if (name === "importUtility" || name === "rag") {
    return visibleSidecarAnchor(getWindow("projects"))
      || visibleSidecarAnchor(getWindow("assistant"))
      || (active && !isAssistantSidecarWindow(active) ? active : null);
  }
  return active && !isAssistantSidecarWindow(active) ? active : null;
}

function placeAssistantSidecarWindow(name, win) {
  const margin = 16;
  const gap = 12;
  const mobile = window.matchMedia("(max-width: 860px)").matches;
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  const avoidance = getDesktopAvoidanceInsets({ margin, spineGap: 18, iconGap: 48 });
  const desktopWidth = desktopRect?.width || window.innerWidth;
  const desktopHeight = desktopRect?.height || Math.max(260, window.innerHeight - 25);
  const workLeft = mobile ? margin : avoidance.left;
  const workTop = mobile ? margin : writingSpineAlignedTopForWindow(win, 18);
  const workRight = Math.max(workLeft + 220, desktopWidth - (mobile ? margin : avoidance.right + margin));
  const workBottom = Math.max(workTop + 260, desktopHeight - margin);
  const workWidth = Math.max(220, workRight - workLeft);
  const workHeight = Math.max(260, workBottom - workTop);
  const defaults = getAssistantSidecarDefaults(name);
  const minAssistantWidth = defaults.minAssistantWidth;
  const width = Math.min(win.offsetWidth || defaults.width, workWidth);
  const height = Math.min(win.offsetHeight || defaults.height, workHeight);
  const sidecarInputTarget = name === "dictation"
    ? dictationInputTarget
    : name === "translationPad"
      ? translationPadInputTarget
      : null;
  const targetWindow = sidecarInputTarget?.closest?.(".window");
  const sourceWindow = (
    targetWindow && !isAssistantSidecarWindow(targetWindow)
      ? visibleSidecarAnchor(targetWindow)
      : null
  )
    || getPreferredAssistantSidecarSource(name)
    || visibleSidecarAnchor(getWindow("assistant"));

  win.style.width = `${width}px`;
  win.style.maxHeight = `${height}px`;
  win.style.right = "auto";
  win.style.transform = "none";

  if (mobile || !sourceWindow || sourceWindow.classList.contains("is-hidden")) {
    if (isPortraitDocumentFlow() && getWindowAppId(win) === "accessories") {
      arrangeDeskAccessories(win);
      return;
    }
    win.style.left = `${workLeft}px`;
    win.style.top = `${workTop}px`;
    return;
  }

  const viewportRect = sourceWindow.getBoundingClientRect();
  const desktopLeft = desktopRect?.left || 0;
  const desktopTop = desktopRect?.top || 0;
  const rect = {
    left: viewportRect.left - desktopLeft,
    right: viewportRect.right - desktopLeft,
    top: viewportRect.top - desktopTop,
    bottom: viewportRect.bottom - desktopTop,
  };
  const topMin = workTop;
  const topMax = Math.max(topMin, workBottom - height);
  const leftMin = workLeft;
  const leftMax = Math.max(leftMin, workRight - width);
  const candidates = [
    {
      fits: rect.right + gap + width <= workRight,
      left: rect.right + gap,
      top: clampNumber(rect.top, topMin, topMax),
    },
    {
      fits: rect.left - gap - width >= workLeft,
      left: rect.left - gap - width,
      top: clampNumber(rect.top, topMin, topMax),
    },
    {
      fits: rect.bottom + gap + height <= workBottom,
      left: clampNumber(rect.left, leftMin, leftMax),
      top: rect.bottom + gap,
    },
    {
      fits: rect.top - gap - height >= topMin,
      left: clampNumber(rect.left, leftMin, leftMax),
      top: rect.top - gap - height,
    },
  ];
  const openSidecarOffset = [...assistantSidecarWindowNames]
    .filter((sidecarName) => sidecarName !== name)
    .map(getWindow)
    .filter(visibleSidecarAnchor)
    .length * 18;
  const candidate = candidates.find((item) => item.fits);

  if (candidate) {
    win.style.left = `${candidate.left}px`;
    win.style.top = `${clampNumber(candidate.top + openSidecarOffset, topMin, topMax)}px`;
    return;
  }

  if (sourceWindow.dataset.window === "assistant") {
    const assistant = sourceWindow;
    const assistantLeft = Math.max(workLeft, rect.left);
    const dictationLeft = leftMax;
    const availableAssistantWidth = dictationLeft - gap - assistantLeft;

    if (availableAssistantWidth >= minAssistantWidth) {
      storeAssistantFrameForSidecar(assistant);
      assistant.style.left = `${assistantLeft}px`;
      assistant.style.right = "auto";
      assistant.style.width = `${availableAssistantWidth}px`;
      assistant.style.transform = "none";

      win.style.left = `${dictationLeft}px`;
      win.style.top = `${clampNumber(rect.top + openSidecarOffset, topMin, topMax)}px`;
      return;
    }
  }

  win.style.left = `${leftMax}px`;
  win.style.top = `${clampNumber(topMin + openSidecarOffset, topMin, topMax)}px`;
}

function sourceWindowForAssistantContext(context) {
  if (!context) return null;
  if (["teachtext", "fileDisk"].includes(context.surface)) return "teachText";
  if (context.surface === "assistant") return null;
  const bySurface = {
    reader: "reader",
    scrapbook: "scrapbook",
    questionSheet: "questionSheet",
    outline: "outline",
    sectionDrafts: "sectionDrafts",
    documents: "chatFile",
    clipboard: "clipboard",
    styleSheet: "reviewDesk",
    claimCheck: "reviewDesk",
    docMap: "docMap",
    systemHelp: "systemHelp",
    notePad: "notePad",
  };
  return bySurface[context.surface] || null;
}

async function openAssistantAvoidingWindow(sourceName = "teachText") {
  await openWindow("assistant");
  const assistant = getWindow("assistant");
  const sourceWindow = sourceName ? getWindow(sourceName) : null;
  if (!assistant) return;
  if (writerMode) {
    setAssistantDesklet(true);
    return;
  }
  if (isMobileWorkAreaCssOwned(assistant)) return;
  if (!sourceWindow || sourceWindow.classList.contains("is-hidden")) return;

  const margin = 16;
  const menuHeight = 25;
  const gap = 12;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const mobile = window.matchMedia("(max-width: 860px)").matches;
  const sourceRect = sourceWindow.getBoundingClientRect();
  const topMin = menuHeight + margin;
  const maxHeight = Math.max(240, viewportHeight - topMin - margin);
  const desiredHeight = mobile ? Math.min(760, maxHeight) : Math.min(540, maxHeight);
  const desiredWidth = Math.min(620, Math.max(360, Math.round(viewportWidth * 0.36)));
  const minWidth = Math.min(340, viewportWidth - margin * 2);

  assistant.classList.remove("is-collapsed", "is-desklet");
  assistant.style.right = "auto";
  assistant.style.transform = "none";
  assistant.style.maxHeight = `${desiredHeight}px`;
  assistant.style.height = `${desiredHeight}px`;

  function applyFrame(left, top, width, height = desiredHeight) {
    const clampedWidth = Math.max(minWidth, Math.min(width, viewportWidth - margin * 2));
    const clampedHeight = Math.max(240, Math.min(height, viewportHeight - topMin - margin));
    const leftMax = Math.max(margin, viewportWidth - clampedWidth - margin);
    const topMax = Math.max(topMin, viewportHeight - clampedHeight - margin);
    assistant.style.left = `${clampNumber(left, margin, leftMax)}px`;
    assistant.style.top = `${clampNumber(top, topMin, topMax)}px`;
    assistant.style.width = `${clampedWidth}px`;
    assistant.style.height = `${clampedHeight}px`;
    assistant.style.maxHeight = `${clampedHeight}px`;
  }

  const rightSpace = viewportWidth - sourceRect.right - gap - margin;
  const leftSpace = sourceRect.left - gap - margin;
  const belowSpace = viewportHeight - sourceRect.bottom - gap - margin;
  const aboveSpace = sourceRect.top - gap - topMin;

  if (!mobile && rightSpace >= minWidth) {
    applyFrame(sourceRect.right + gap, sourceRect.top, Math.min(desiredWidth, rightSpace), desiredHeight);
    return;
  }
  if (!mobile && leftSpace >= minWidth) {
    const width = Math.min(desiredWidth, leftSpace);
    applyFrame(sourceRect.left - gap - width, sourceRect.top, width, desiredHeight);
    return;
  }

  const stackedWidth = Math.min(
    Math.max(minWidth, sourceRect.width),
    viewportWidth - margin * 2
  );
  const stackedLeft = Math.min(sourceRect.left, viewportWidth - stackedWidth - margin);
  if (belowSpace >= 220) {
    applyFrame(stackedLeft, sourceRect.bottom + gap, stackedWidth, Math.min(desiredHeight, belowSpace));
    return;
  }
  if (aboveSpace >= 220) {
    const height = Math.min(desiredHeight, aboveSpace);
    applyFrame(stackedLeft, sourceRect.top - gap - height, stackedWidth, height);
    return;
  }

  const fallbackHeight = mobile ? Math.min(620, maxHeight) : Math.min(300, maxHeight);
  applyFrame(margin, viewportHeight - fallbackHeight - margin, viewportWidth - margin * 2, fallbackHeight);
}

async function arrangeDocMapAssistantSplit() {
  return arrangeWindowAssistantSplit("docMap", {
    onSplitApplied() {
      requestAnimationFrame(() => {
        withDocMap(() => {
          renderDocMap();
          requestAnimationFrame(() => restoreDocMapCanvasView());
        });
      });
    },
  });
}

async function arrangeClioStageAssistantSplit() {
  return arrangeWindowAssistantSplit("clioStage");
}

async function arrangeWindowAssistantSplit(sourceWindowName, options = {}) {
  const sourceWindow = getWindow(sourceWindowName);
  const assistant = getWindow("assistant");
  if (!sourceWindow || !assistant) return false;

  const sourceAppId = getWindowAppId(sourceWindow);
  const sourceAnchorId = {
    quickDraft: "quickDraft",
    teachText: "teachText",
    questionSheet: "questionSheet",
    outline: "outline",
    sectionDrafts: "sectionDrafts",
    reviewDesk: "reviewDesk",
    reader: "reader",
    scrapbook: "scrapbook",
    docMap: "docMap",
    clioStage: "clioStage",
    timeMachine: "timeMachine",
    imagePromptStudio: "imagePromptStudio",
  }[sourceWindowName] || sourceAppId;
  if (!isMultiFinderMode()) {
    const canOpenPair = await prepareFinderModeForApp(sourceAppId);
    if (!canOpenPair) return false;
    setSideAskAnchorApp(sourceAnchorId, sourceAppId);
  }

  await openWindow("assistant", { skipFinderMode: true, skipPlacement: true, skipFocus: true });
  const refreshedAssistant = getWindow("assistant") || assistant;
  if (!isMultiFinderMode() && typeof enterSideAskClioTalkSession === "function") {
    enterSideAskClioTalkSession(sourceAnchorId);
  } else if (!isMultiFinderMode() && sourceAnchorId === "quickDraft" && typeof enterQuickDraftClioTalkSession === "function") {
    enterQuickDraftClioTalkSession();
  }
  if (writerMode) {
    await openAssistantAvoidingWindow(sourceWindowName);
    return true;
  }

  // On a phone one app fills the screen, so there is no pair to lay out — and
  // the frames below are inline styles that would override the full-screen
  // shell. The ClioTalk session is already wired above; land on the paired
  // conversation so SideAsk is discoverable — the assistant's own
  // sideask-mode-strip ("Paired with TeachText" + End SideAsk) is the bridge
  // back to the writing surface.
  if (isPortraitDocumentFlow() || isNarrowViewport()) {
    focusWindow(refreshedAssistant);
  }
  if (isPortraitDocumentFlow() || isNarrowViewport()) {
    syncMobileAppForeground();
    return true;
  }

  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop.getBoundingClientRect();
  const margin = 18;
  const gap = 14;
  const avoidance = getDesktopAvoidanceInsets({ margin });
  const left = avoidance.left;
  const top = margin;
  const isStacked = window.matchMedia("(orientation: portrait), (max-width: 860px)").matches;
  const totalWidth = Math.max(340, desktopRect.width - avoidance.left - avoidance.right - margin);
  const menuBarBottom = document.querySelector(".menu-bar")?.getBoundingClientRect().bottom || 0;
  const desktopTop = Math.max(desktopRect.top, menuBarBottom);
  const availableDesktopHeight = Math.min(desktopRect.height, Math.max(0, window.innerHeight - desktopTop));
  const height = Math.max(300, availableDesktopHeight - margin * 2);

  rememberWindowFrame(sourceWindow);
  rememberWindowFrame(refreshedAssistant);
  saveSideAskRestoreFrame(sourceWindow);
  saveSideAskRestoreFrame(refreshedAssistant);
  sourceWindow.classList.remove("is-collapsed", "is-desklet", "is-hidden");
  refreshedAssistant.classList.remove("is-collapsed", "is-desklet", "is-hidden");

  const applyFrame = (win, frame) => placeWindowForExplicitLayout(win, {
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height,
    maxHeight: frame.height,
  });

  if (isStacked) {
    sourceWindow.style.order = "2";
    refreshedAssistant.style.order = "3";
    const minStackPaneHeight = Math.min(220, Math.max(140, Math.floor((height - gap) / 2)));
    const sourceHeight = clampNumber(
      Math.round((height - gap) * 0.56),
      minStackPaneHeight,
      height - gap - minStackPaneHeight
    );
    const assistantHeight = height - gap - sourceHeight;
    applyFrame(sourceWindow, { left, top, width: totalWidth, height: sourceHeight });
    applyFrame(refreshedAssistant, {
      left,
      top: top + sourceHeight + gap,
      width: totalWidth,
      height: assistantHeight,
    });
  } else {
    sourceWindow.style.order = "";
    refreshedAssistant.style.order = "";
    const sourceWidth = Math.round((totalWidth - gap) * 0.6);
    const assistantWidth = Math.max(340, totalWidth - gap - sourceWidth);
    applyFrame(sourceWindow, { left, top, width: sourceWidth, height });
    applyFrame(refreshedAssistant, {
      left: left + sourceWidth + gap,
      top,
      width: assistantWidth,
      height,
    });
  }

  setWindowLayerZ(sourceWindow, nextWindowLayerZ());
  setWindowLayerZ(refreshedAssistant, nextWindowLayerZ());
  focusWindow(refreshedAssistant);

  if (typeof options.onSplitApplied === "function") {
    options.onSplitApplied(refreshedAssistant, sourceWindow);
  }
  return true;
}

function arrangeReaderAssistantSplit() {
  return arrangeWindowAssistantSplit("reader");
}

function arrangeScrapbookAssistantSplit() {
  return arrangeWindowAssistantSplit("scrapbook");
}
function quietStartup() {
  // Managed windows only: a `.window` with no data-window was never opened by
  // the manager. Theme Lab shows real windows as specimens so the era paints
  // them, and a sweep that hides or re-frames one empties the board.
  document.querySelectorAll(".window[data-window]").forEach((win) => {
    if (win.dataset.window !== "assistant") {
      win.classList.add("is-hidden");
    }
  });
  modalScrim.classList.add("is-hidden");
}

function showAboutMultiFinder() {
  showSystemModal(t("about_multifinder_body"), "alert");
}

async function restartSystem() {
  try {
    await saveDeskState();
    await clearWorkingSession();
  } catch (error) {
    console.warn("Restart save failed", error);
  }
  // An explicit Restart is a cold boot: the full Happy Mac ceremony plays
  // again instead of the warm-resume flash.
  if (typeof clearSessionBootSeen === "function") clearSessionBootSeen();
  closeMenus();
  document.body.classList.add("is-shutting-down");
  setStatus(t("restart_starting"));
  playSystemSound("save");
  window.setTimeout(() => window.location.reload(), 220);
}

async function shutDownSystem() {
  if (typeof showSystemModal === "function") {
    const result = await showSystemModal(t("shutdown_confirm"), "confirm", { defaultAction: "cancel" });
    if (result !== "yes") return;
  }
  try {
    await saveDeskState();
    await clearWorkingSession();
  } catch (error) {
    console.warn("Shutdown save failed", error);
  }
  closeMenus();
  document.body.classList.add("is-shutting-down");
  // Managed windows only: a `.window` with no data-window was never opened by
  // the manager. Theme Lab shows real windows as specimens so the era paints
  // them, and a sweep that hides or re-frames one empties the board.
  document.querySelectorAll(".window[data-window]").forEach((win) => win.classList.add("is-hidden"));
  document.querySelector("#shutdown-screen")?.classList.remove("is-hidden");
  modalScrim.classList.add("is-hidden");
  setStatus(t("shutdown_message"));
  playSystemSound("shutdown");
  renderMultiFinderMenu();
}

function setAssistantDesklet(enabled) {
  const assistant = getWindow("assistant");
  if (!assistant) return;

  assistant.classList.toggle("is-desklet", enabled);
  if (enabled) {
    assistant.dataset.app = "clioTalk";
    ensureRunningApp(assistant.dataset.app, "assistant");
    hiddenAppIds.delete(assistant.dataset.app);
    assistant.classList.remove("is-hidden", "is-app-hidden", "is-collapsed");
    // The desklet's split geometry is CSS-owned in writer mode (60vw / 33vw);
    // drop any stale inline frame (boot spine reflow, previous non-writer
    // placement) so the non-!important CSS rules can win.
    clearWindowInlineGeometry(assistant);
  } else {
    assistant.classList.remove("is-collapsed");
    assistant.style.right = "auto";
    assistant.style.left = "34px";
    assistant.style.top = "34px";
    assistant.style.transform = "none";
  }
}

async function closeWindow(name, force = false) {
  const win = getWindow(name);
  if (!win) return false;

  if (
    name === "assistant"
    && typeof isClioIntroductionActive === "function"
    && isClioIntroductionActive()
    && conversation.length === 0
  ) {
    await completeClioOnboarding("closed");
  }

  if (name === "assistant" && clioTalkTemporaryMode) {
    if (activeAbortController && !force) {
      setStatus(t("task_already_running", localModelState.task || t("working_locally")));
      return false;
    }
    if (!force && !await confirmDiscardTemporaryClioTalkConversation()) return false;
    discardTemporaryClioTalkConversation();
  }

  if (name === "teachText" && !force && shouldPromptForTeachTextFileSave()) {
    const result = await showSystemModal(teachTextUnsavedChangesMessage(), "save");
    if (result === "cancel") return false;
    if (result === "yes") {
      const saved = await saveTextDocument();
      if (!saved) return false;
    } else {
      setTeachTextStatus("saved"); // clear dirty state after discard
    }
  }

  // Draft Desk closes like every first-class writing app: pending or Modified
  // work is flushed before the window hides, and a failed persist keeps the
  // window open with a Modified receipt. Never close silently over unsaved
  // durable state.
  if (name === "quickDraft" && !force) {
    const workspace = typeof activeProjectQuickDraft === "function"
      ? activeProjectQuickDraft({ create: false })?.record?.workspace
      : null;
    const pendingCommit = typeof pendingQuickDraftCommit !== "undefined" && pendingQuickDraftCommit;
    if (pendingCommit || workspace?.savedStatus === "modified") {
      const result = typeof commitQuickDraft === "function"
        ? await commitQuickDraft({})
        : null;
      if (!result || result.ok !== true) {
        window.AISystem6QuickDraftRuntime?.setSaveState?.("modified");
        window.AISystem6QuickDraftRuntime?.setQuickDraftStatus?.(t("quick_draft_save_failed"));
        return false;
      }
    }
  }

  if (name === "themeLab") window.AISystem6ThemeLab?.cleanup?.();
  win.classList.add("is-hidden");
  // 文字亮室 shows a view of the draft, so the window going away has to put the
  // view back. Closing it with ⌘W used to leave the display mode on "grain"
  // with no window to show one.
  if (name === "lightroom") window.AISystem6QuickDraft?.noteLightroomClosed?.();
  if (name === "memoryCards") {
    pauseMemoryCardsGame();
  }
  // Stop any in-flight USDZ render and model refresh timer before the window
  // hides, so a closed CMF Studio never finishes parsing a model nobody can
  // see. (Guarded: the module is only present once the window has opened.)
  if (name === "cmfStudio" && window.AISystem6CMFStudio) {
    window.AISystem6CMFStudio.cancelRender?.();
  }
  delete win.dataset.appHiddenCollapsed;
  playSystemSound("close");
  if (name === "findPath") {
    document.body.classList.remove("has-find-path-open");
  }
  if (name === "contextPanel") {
    document.body.classList.remove("has-context-panel-open");
  }
  if (name === "documents") {
    clioTalkAttachmentPickerActive = false;
  }
  if (name === "quickDraft" && sideAskEnabled && sideAskAnchorAppId === "quickDraft") {
    const assistantWindow = getWindow("assistant");
    if (!closingQuickDraftAssistantPair && assistantWindow && !assistantWindow.classList.contains("is-hidden") && !assistantWindow.classList.contains("is-app-hidden")) {
      closingQuickDraftAssistantPair = true;
      await closeWindow("assistant", true);
      closingQuickDraftAssistantPair = false;
    }
    clearSideAskMode();
    resetAssistantForStandalonePlacement(assistantWindow);
  }
  if (name !== "assistant" && name !== "quickDraft" && sideAskEnabled && getWindowAppId(win) === sideAskAnchorAppId) {
    clearSideAskMode();
    resetAssistantForStandalonePlacement(getWindow("assistant"));
  }
  updateQuickDraftFocusChrome();
  if (assistantSidecarWindowNames.has(name)) {
    restoreAssistantAfterSidecar();
  }
  if (getWindowAppId(win) === "accessories" && !writerMode) {
    if (isPortraitDocumentFlow() || !isDeskAccessorySidecar(win)) arrangeDeskAccessories();
    raiseVisibleDeskAccessorySidecars();
  }
  if (name === "assistant") {
    if (!closingQuickDraftAssistantPair && sideAskEnabled && sideAskAnchorAppId === "quickDraft") {
      const quickDraftWindow = getWindow("quickDraft");
      if (quickDraftWindow && !quickDraftWindow.classList.contains("is-hidden") && !quickDraftWindow.classList.contains("is-app-hidden")) {
        closingQuickDraftAssistantPair = true;
        await closeWindow("quickDraft", true);
        closingQuickDraftAssistantPair = false;
      }
    }
    if (writerMode && sideAskEnabled) {
      writerMode = false;
      document.body.classList.remove("is-writer-mode");
      setAssistantDesklet(false);
      applyLanguage();
      saveDeskState();
    }
    clearSideAskMode();
  }
  updateMenuState();

  if (name === "about") {
    modalScrim.classList.add("is-hidden");
  }
  forgetWindowFromRunningApps(name);
  let restoredSource = null;
  const returnWindowName = !isMultiFinderMode() ? (win.dataset.returnWindowName || "") : "";
  if (returnWindowName) {
    const returnWindow = getWindow(returnWindowName);
    if (
      returnWindow
      && returnWindow !== win
      && !returnWindow.classList.contains("is-hidden")
      && !returnWindow.classList.contains("is-app-hidden")
    ) {
      restoredSource = returnWindow;
    } else if (returnWindow && returnWindow !== win) {
      returnWindow.classList.remove("is-hidden", "is-app-hidden");
      delete returnWindow.dataset.appHiddenCollapsed;
      ensureRunningApp(getWindowAppId(returnWindow), returnWindow.dataset.window);
      restoredSource = returnWindow;
    }
  }
  delete win.dataset.returnWindowName;
  if (restoredSource) {
    focusWindow(restoredSource, true);
    activeAppId = getWindowAppId(restoredSource);
  } else {
    const next = document.querySelector(".window.is-active:not(.is-hidden):not(.is-app-hidden)")
      || Array.from(document.querySelectorAll(".window[data-window]:not(.is-hidden):not(.is-app-hidden)"))
        .sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
    if (next) {
      focusWindow(next);
    } else {
      activeAppId = "finder";
    }
  }
  syncMobileAppForeground();
  renderMultiFinderMenu();
  scheduleWorkingSessionSave?.();
  return true;
}

function toggleCollapsed(win) {
  const willCollapse = !win.classList.contains("is-collapsed");
  const before = win.getBoundingClientRect();
  if (willCollapse) {
    const width = Math.round(before.width);
    if (width > 0) setInlineStyleValue(win, "--window-shade-width", `${width}px`);
    // The shade stub's height is CSS-owned (auto / title bar only). Drop any
    // inline height from a previous maximize/placement and remember it so the
    // window comes back at its exact size on expand.
    win.dataset.shadeRestoreHeight = inlineStyleValue(win, "height");
    win.dataset.shadeRestoreMaxHeight = inlineStyleValue(win, "max-height");
    setInlineStyleValue(win, "height", "");
    setInlineStyleValue(win, "max-height", "");
    win.classList.add("is-collapsed");
    // On a phone the shade floats over the next full-screen app window; pin
    // its stacking layer so the title bar stays reachable until expanded.
    if (isPortraitDocumentFlow() || isNarrowViewport()) {
      setWindowLayerZ(win, windowPinnedZ);
    }
  } else {
    win.classList.remove("is-collapsed");
    setInlineStyleValue(win, "--window-shade-width", "");
    setInlineStyleValue(win, "height", win.dataset.shadeRestoreHeight || "");
    setInlineStyleValue(win, "max-height", win.dataset.shadeRestoreMaxHeight || "");
    delete win.dataset.shadeRestoreHeight;
    delete win.dataset.shadeRestoreMaxHeight;
    // Expanding must reclaim the foreground: another window may have taken
    // the phone's full-screen shell while this one was shaded. Focus raises
    // the z-index so the following foreground sync picks this window again.
    focusWindow(win);
  }
  keepWindowCornerAfterShade(win, before);
  // A phone presents one app page at a time: a shaded window must leave the
  // full-screen shell (it cannot stay "fullscreen" as a 20px title bar) and
  // the expanded window must reclaim it, otherwise the shade is unreachable.
  // The mobile CSS keeps the collapsed shade visible and above the foreground
  // app (60-responsive.css), so the second double-click always finds it.
  syncMobileAppForeground();
  scheduleWorkingSessionSave?.();
}

// WindowShade rolls up and down in place. Start Here is centred by a transform,
// and compact layouts re-anchor a collapsed window from the viewport to the
// desk, so hiding the pane moved the title bar out from under the pointer: the
// second double-click landed on the desk instead, and the shade could never be
// unrolled. Whatever the stylesheet did, put the corner back where it was.
function keepWindowCornerAfterShade(win, before) {
  if (!before.width && !before.height) return;
  const after = win.getBoundingClientRect();
  if (Math.abs(after.left - before.left) < 0.5 && Math.abs(after.top - before.top) < 0.5) return;
  const base = win.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 };
  win.style.left = `${Math.round(before.left - base.left)}px`;
  win.style.top = `${Math.round(before.top - base.top)}px`;
  win.style.transform = "none";
  // A portrait Desk Accessory is centred by a responsive
  // `transform: var(--mobile-da-transform, none) !important`, which would win
  // over the pinned corner above when the shade unrolls. Resolve the token to
  // none as well so the window really stays where its title bar was.
  if (win.classList.contains("is-mobile-da-arranged")) {
    win.style.setProperty("--mobile-da-transform", "none");
  }
}

function isResizableWindow(win) {
  if (!win || !resizableWindowNames.has(win.dataset.window)) return false;
  const appId = getWindowAppId(win);
  return !(writerMode && sideAskEnabled && isSideAskPairApp(appId));
}

// The System 6 Zoom box and grow box are separate actions even when a full app
// exposes both. The title-bar control is authoritative: fixed system windows
// and Desk Accessories omit it. `.resize-box` is the legacy DOM class name.
function isZoomableWindow(win) {
  if (!win?.querySelector(":scope > .title-bar > .resize-box:not([disabled])")) return false;
  const appId = getWindowAppId(win);
  return !(writerMode && sideAskEnabled && isSideAskPairApp(appId));
}

function isAspectLockedWindow(win) {
  return win?.dataset.window === "clioStage";
}

function aspectRatioForWindow(win) {
  if (win?.dataset.window === "clioStage") return 16 / 9;
  return 0;
}

function lockedAspectSize(win, width, height, constraints = {}) {
  const aspect = aspectRatioForWindow(win);
  if (!aspect) {
    return { width, height };
  }
  const minWidth = constraints.minWidth || 300;
  const minHeight = constraints.minHeight || 160;
  const maxWidth = Math.max(minWidth, constraints.maxWidth || width);
  const maxHeight = Math.max(minHeight, constraints.maxHeight || height);
  let nextWidth = Math.min(maxWidth, Math.max(minWidth, width));
  let nextHeight = Math.min(maxHeight, Math.max(minHeight, height));
  if (nextWidth / aspect <= nextHeight) {
    nextHeight = nextWidth / aspect;
  } else {
    nextWidth = nextHeight * aspect;
  }
  if (nextWidth < minWidth) {
    nextWidth = minWidth;
    nextHeight = nextWidth / aspect;
  }
  if (nextHeight < minHeight) {
    nextHeight = minHeight;
    nextWidth = nextHeight * aspect;
  }
  if (nextWidth > maxWidth) {
    nextWidth = maxWidth;
    nextHeight = nextWidth / aspect;
  }
  if (nextHeight > maxHeight) {
    nextHeight = maxHeight;
    nextWidth = nextHeight * aspect;
  }
  return {
    width: Math.round(nextWidth),
    height: Math.round(nextHeight),
  };
}

function rememberWindowFrame(win) {
  const rect = win.getBoundingClientRect();
  win.dataset.restoreLeft = win.style.left || `${rect.left}px`;
  win.dataset.restoreTop = win.style.top || `${rect.top}px`;
  win.dataset.restoreWidth = win.style.width || `${rect.width}px`;
  win.dataset.restoreHeight = win.style.height || `${rect.height}px`;
}

function getDesktopAvoidanceInsets({ margin = 18, spineGap = 18, iconGap = 34 } = {}) {
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  const spine = document.querySelector(".writing-spine-panel") || document.querySelector(".spine-flow-toolbox");
  const spineRect = spine?.getBoundingClientRect();
  const iconColumn = document.querySelector(".icon-column");
  const iconRect = iconColumn?.getBoundingClientRect();
  const spineVisible = spine
    && !spine.classList.contains("is-hidden")
    && spineRect
    && spineRect.width > 0
    && getComputedStyle(spine).position !== "static";
  const iconsVisible = iconColumn
    && iconRect
    && iconRect.width > 0
    && getComputedStyle(iconColumn).display !== "none"
    && getComputedStyle(iconColumn).position !== "static";

  return {
    left: spineVisible
      ? Math.max(margin, Math.ceil(spineRect.right - (desktopRect?.left || 0) + spineGap))
      : margin,
    right: iconsVisible ? Math.ceil(iconRect.width + iconGap) : 0,
  };
}

// The Writing Flow toolbox is part of the usable desk, not window chrome. New
// windows already use getDesktopAvoidanceInsets(), but a Finder replacement,
// restored session, or window dragged before Writing Studio opens can retain a
// frame underneath it. Keep one collision rule for all of those entry paths.
function avoidWritingSpineOverlap(win, { gap = 18 } = {}) {
  if (
    !win
    || writerMode
    || isPortraitDocumentFlow()
    || win.classList.contains("is-hidden")
    || win.classList.contains("is-app-hidden")
    || ["about", "saveChat"].includes(win.dataset.window)
  ) return false;

  const desktop = document.querySelector(".desktop");
  const spine = document.querySelector(".writing-spine-panel") || document.querySelector(".spine-flow-toolbox");
  const desktopRect = desktop?.getBoundingClientRect();
  const spineRect = spine?.getBoundingClientRect();
  const winRect = win.getBoundingClientRect();
  const spineStyle = spine ? getComputedStyle(spine) : null;
  const winStyle = getComputedStyle(win);
  if (
    !desktopRect
    || !spineRect
    || spineRect.width <= 0
    || spineRect.height <= 0
    || spineStyle?.display === "none"
    || spineStyle?.visibility === "hidden"
    || spineStyle?.position === "static"
    || winStyle.position !== "absolute"
    || !rectsOverlap(winRect, spineRect, gap)
  ) return false;

  const nextLeft = Math.round(spineRect.right - desktopRect.left + gap);
  setInlineStyleValue(win, "left", `${nextLeft}px`);
  setInlineStyleValue(win, "right", "auto");
  setInlineStyleValue(win, "transform", "none");
  return true;
}

function reflowWindowsAroundWritingSpine() {
  let changed = false;
  document.querySelectorAll(".window[data-window]:not(.is-hidden):not(.is-app-hidden)").forEach((win) => {
    changed = avoidWritingSpineOverlap(win) || changed;
  });
  if (changed) scheduleWorkingSessionSave?.();
  return changed;
}

function scheduleWritingSpineAvoidance() {
  reflowWindowsAroundWritingSpine();
  requestAnimationFrame(() => reflowWindowsAroundWritingSpine());
}

function zoomWindow(win) {
  if (!isZoomableWindow(win)) return;
  playSystemSound("zoom");

  if(matchMedia("(max-width:860px)").matches){
    win.classList.remove("is-collapsed");
    // For an app that can take the full-screen shell, the zoom box is the
    // maximize/restore control: it toggles between filling the screen and
    // floating alongside the other windows.
    if (mobileWindowCanFillScreen(win)) {
      win.dataset.mobileRestored = win.dataset.mobileRestored === "true" ? "false" : "true";
      syncMobileAppForeground();
      focusWindow(win, 1);
      return;
    }
  }
  // Narrow non-writer work-area windows are CSS-owned; the desktop zoom frame
  // below would write inline geometry the mobile rule no longer overrides.
  if (isMobileWorkAreaCssOwned(win)) return;
  if (writerMode && writerModeCssOwnedWindows.has(win.dataset.window)) return;

  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop.getBoundingClientRect();
  const margin = 18;
  const avoidance = getDesktopAvoidanceInsets({ margin });
  const fixedPosition = getComputedStyle(win).position === "fixed";

  if (win.dataset.zoomed === "true") {
    clearFinderContentFit(win);
    win.style.left = win.dataset.restoreLeft || win.style.left;
    win.style.top = win.dataset.restoreTop || win.style.top;
    win.style.width = win.dataset.restoreWidth || win.style.width;
    win.style.height = win.dataset.restoreHeight || win.style.height;
    if (isAspectLockedWindow(win)) {
      const rect = win.getBoundingClientRect();
      const desktopRect = document.querySelector(".desktop")?.getBoundingClientRect();
      const minWidth = Number.parseInt(getComputedStyle(win).minWidth, 10) || 300;
      const size = lockedAspectSize(win, rect.width, rect.height, {
        minWidth,
        minHeight: 160,
        maxWidth: Math.max(minWidth, (desktopRect?.right || window.innerWidth) - rect.left - 18),
        maxHeight: Math.max(160, (desktopRect?.bottom || window.innerHeight) - rect.top - 18),
      });
      win.style.width = `${size.width}px`;
      win.style.height = `${size.height}px`;
    }
    win.style.right = "auto";
    win.style.transform = "none";
    win.dataset.zoomed = "false";
    avoidWritingSpineOverlap(win);
    if(win.dataset.window==="docMap"&&window.AISystem6DocMapLoaded)requestAnimationFrame(() => restoreDocMapCanvasView());
    scheduleWorkingSessionSave?.();
    return;
  }

  if (isFinderContentWindow(win)) {
    rememberWindowFrame(win);
    win.classList.remove("is-collapsed", "is-desklet");
    if (fitFinderWindowToContents(win, { force: true })) {
      win.dataset.zoomed = "true";
      scheduleWorkingSessionSave?.();
      return;
    }
  }

  rememberWindowFrame(win);
  win.classList.remove("is-collapsed", "is-desklet");
  win.style.left = `${avoidance.left + (fixedPosition ? desktopRect.left : 0)}px`;
  win.style.top = `${margin + (fixedPosition ? desktopRect.top : 0)}px`;
  const availableWidth = Math.max(1, desktopRect.width - avoidance.left - avoidance.right - margin);
  const availableHeight = Math.max(1, desktopRect.height - margin * 2);
  const minWidth = Math.min(320, Math.max(240, availableWidth));
  const minHeight = Math.min(180, Math.max(140, availableHeight));
  const maxWidth = Math.max(minWidth, availableWidth);
  const maxHeight = Math.max(minHeight, availableHeight);
  const zoomSize = lockedAspectSize(win, maxWidth, maxHeight, {
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
  });
  win.style.width = `${zoomSize.width}px`;
  win.style.height = `${zoomSize.height}px`;
  win.style.right = "auto";
  win.style.transform = "none";
  win.dataset.zoomed = "true";
  if(win.dataset.window==="docMap"&&window.AISystem6DocMapLoaded)requestAnimationFrame(() => restoreDocMapCanvasView());
  scheduleWorkingSessionSave?.();
}

function maximizeWindow(win, options = {}) {
  if (!isResizableWindow(win)) return;
  if(matchMedia("(max-width:860px)").matches){
    win.classList.remove("is-collapsed");
    win.dataset.zoomed="true";
    focusWindow(win,1);
    scheduleWorkingSessionSave?.();
    return;
  }
  if (writerMode && writerModeCssOwnedWindows.has(win.dataset.window)) return;
  if (window.matchMedia("(max-width: 860px)").matches) return;

  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop.getBoundingClientRect();
  const margin = 18;
  const avoidance = getDesktopAvoidanceInsets({ margin });
  const top = parsePositiveInteger(options.top) || margin;

  if (win.dataset.zoomed !== "true") rememberWindowFrame(win);
  win.classList.remove("is-collapsed", "is-desklet");
  win.style.left = `${avoidance.left}px`;
  win.style.top = `${top}px`;
  const maxWidth = Math.max(320, desktopRect.width - avoidance.left - avoidance.right - margin);
  const maxHeight = Math.max(260, desktopRect.height - top - margin);
  const maxSize = lockedAspectSize(win, maxWidth, maxHeight, {
    minWidth: 320,
    minHeight: 180,
    maxWidth,
    maxHeight,
  });
  win.style.width = `${maxSize.width}px`;
  win.style.height = `${maxSize.height}px`;
  win.style.right = "auto";
  win.style.transform = "none";
  win.dataset.zoomed = "true";
  scheduleWorkingSessionSave?.();
}

function positionWindowOutline(outline, left, top) {
  outline.style.setProperty("--outline-left", `${Math.round(left)}px`);
  outline.style.setProperty("--outline-top", `${Math.round(top)}px`);
}

function sizeWindowOutline(outline, width, height) {
  outline.style.setProperty("--outline-width", `${Math.round(width)}px`);
  outline.style.setProperty("--outline-height", `${Math.round(height)}px`);
}

// `win` turns the ghost into a frame preview: System 6's grow image shows the
// title bar seam and the scroll bar lanes, so the corner cell being dragged is
// part of the ghost. Moving a window shows the plain outline instead.
function createWindowOutline(rect, win = null) {
  const outline = document.createElement("div");
  outline.className = win ? "window-outline is-frame" : "window-outline";
  if (win) {
    const titleBar = win.querySelector(":scope > .title-bar");
    outline.style.setProperty("--outline-titlebar", `${Math.round(titleBar?.offsetHeight || 0)}px`);
    // Only a framed content area has lanes to preview.
    if (!win.querySelector(".window-frame-scroller")) {
      outline.style.setProperty("--outline-lane", "0px");
    }
  }
  positionWindowOutline(outline, rect.left, rect.top);
  sizeWindowOutline(outline, rect.width, rect.height);
  document.body.append(outline);
  return outline;
}

function startWindowResize(event, win) {
  const portraitFlow = isPortraitDocumentFlow() && !writerMode && getWindowAppId(win) !== "accessories";
  if (!isResizableWindow(win) || (!portraitFlow && window.matchMedia("(max-width: 860px)").matches)) return;
  // Writing-mode split panes are CSS-owned fixed columns; a live resize would
  // write inline width/height that beats the non-!important split rules.
  if (writerMode && writerModeCssOwnedWindows.has(win.dataset.window)) return;

  event.preventDefault();
  event.stopPropagation();
  focusWindow(win);
  clearFinderContentFit(win, { preserveSize: true });
  // The grow box performs manual sizing, while the Zoom box chooses the
  // standard size. Dragging out of the full-screen shell restores the window
  // down first so the grow action sizes a real floating window.
  if (win.classList.contains("is-mobile-fullscreen")) {
    win.dataset.mobileRestored = "true";
    syncMobileAppForeground();
  }
  if (win.classList.contains("is-desklet") && win.dataset.window === "assistant" && !writerMode) {
    const rect = win.getBoundingClientRect();
    win.classList.remove("is-desklet");
    win.style.left = `${rect.left}px`;
    win.style.top = `${rect.top}px`;
    win.style.right = "auto";
    win.style.width = `${rect.width}px`;
    win.style.height = `${rect.height}px`;
    win.style.transform = "none";
  }
  win.style.maxHeight = "";
  rememberWindowFrame(win);
  win.dataset.zoomed = "false";

  const handle = event.currentTarget;
  const rect = win.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const startWidth = rect.width;
  const startHeight = rect.height;
  const minWidth = Number.parseInt(getComputedStyle(win).minWidth, 10) || 300;
  const minHeight = 160;
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop.getBoundingClientRect();
  const maxWidth = portraitFlow
    ? Math.max(minWidth, Math.min(desktopRect.width - 36, window.innerWidth - 36))
    : Math.max(minWidth, desktopRect.right - rect.left - 18);
  const maxHeight = portraitFlow
    ? Math.max(minHeight, window.innerHeight - 80)
    : Math.max(minHeight, desktopRect.bottom - rect.top - 18);

  if (event.pointerId != null && handle.setPointerCapture) {
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {}
  }

  // Classic draws the prospective frame as a dotted outline and only reflows the
  // window on release — the same dotted primitive the selection marquee uses.
  // Liquid Glass sizes live, where a wait-for-release frame reads as a stall.
  // Portrait flow sizes a document-flowed window, not a free-floating frame, so
  // an outline anchored to the old top-left would promise the wrong box.
  const outline = portraitFlow || !themeHasCapability("native-window-outline")
    ? null
    : createWindowOutline(rect, win);
  let pendingWidth = startWidth;
  let pendingHeight = startHeight;

  function applyWindowSize(width, height) {
    if (portraitFlow) {
      win.style.setProperty("--portrait-window-width", `${Math.round(width)}px`);
      win.style.setProperty("--portrait-window-height", `${Math.round(height)}px`);
    } else {
      win.style.width = `${width}px`;
      win.style.height = `${height}px`;
    }
  }

  function resizeWindow(moveEvent) {
    let width = Math.min(maxWidth, Math.max(minWidth, startWidth + moveEvent.clientX - startX));
    let height = Math.min(maxHeight, Math.max(minHeight, startHeight + moveEvent.clientY - startY));
    if (isAspectLockedWindow(win)) {
      const size = lockedAspectSize(win, width, height, { minWidth, minHeight, maxWidth, maxHeight });
      width = size.width;
      height = size.height;
    }
    pendingWidth = width;
    pendingHeight = height;
    if (outline) {
      sizeWindowOutline(outline, width, height);
      return;
    }
    applyWindowSize(width, height);
  }

  function stopResize(stopEvent) {
    window.removeEventListener("pointermove", resizeWindow);
    window.removeEventListener("pointerup", stopResize);
    window.removeEventListener("pointercancel", stopResize);
    window.removeEventListener("mousemove", resizeWindow);
    window.removeEventListener("mouseup", stopResize);
    // A drag that emitted no move event still has to land where it was released.
    if ((stopEvent?.type === "pointerup" || stopEvent?.type === "mouseup")
      && typeof stopEvent.clientX === "number") {
      resizeWindow(stopEvent);
    }
    if (outline) {
      outline.remove();
      applyWindowSize(pendingWidth, pendingHeight);
    }
    markWindowUserPositioned(win);
    if(win.dataset.window==="docMap"&&window.AISystem6DocMapLoaded)requestAnimationFrame(() => restoreDocMapCanvasView());
    scheduleWorkingSessionSave?.();
  }

  window.addEventListener("pointermove", resizeWindow);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("pointercancel", stopResize);
  window.addEventListener("mousemove", resizeWindow);
  window.addEventListener("mouseup", stopResize);
}

// The desktop icon column wraps into a second column when it runs out of room,
// the way the Finder's does. But the Trash is the last icon and carries
// `margin-top: auto`, so when exactly one icon overflowed it was always the
// Trash -- and wrap-reverse put it ALONE, to the LEFT of everything else. At
// 1366x768, the most common laptop height, that is what a writer saw.
//
// This does not guess a screen height. mobile-app-shell.test.mjs holds that the
// wrap is decided by the column running out of room and never by a breakpoint,
// and that rule is right: the icon count changes with the profile, so no height
// is the true condition. So measure the actual outcome -- lay the column out at
// its natural spacing, ask whether it wrapped, and only then close the gap.
// 4px is not a new number; it is what Liquid Glass already ships for this token.
function syncIconColumnDensity() {
  const column = document.querySelector(".icon-column");
  if (!column) return;
  // Measure at the natural spacing, never at the tightened one, or the
  // measurement would describe its own previous answer.
  column.classList.remove("is-tight");
  const icons = [...column.children].filter((icon) => icon instanceof HTMLElement && icon.offsetParent);
  if (icons.length < 2) return;
  const lanes = new Set(icons.map((icon) => Math.round(icon.getBoundingClientRect().x)));
  if (lanes.size > 1) column.classList.add("is-tight");
  // Known limit, stated rather than hidden: nine icons need about 713px of
  // viewport even at the tightened spacing, so below that the column genuinely
  // has no room and wraps anyway. That case is the one the second column was
  // designed for. What this removes is the avoidable one -- 1366x768, where it
  // fits and only the spacing said otherwise.
}

function installGrowBoxes() {
  document.querySelectorAll(".window").forEach((win) => {
    if (!isResizableWindow(win) || win.querySelector(".grow-box")) return;

    const growBox = document.createElement("button");
    growBox.className = "grow-box";
    growBox.type = "button";
    growBox.setAttribute("data-i18n-aria-label", "grow_box_aria");
    growBox.setAttribute("aria-label", typeof t === "function" ? t("grow_box_aria") : "Resize window");
    growBox.dataset.balloonHelp = "balloon_grow_box";
    growBox.addEventListener("pointerdown", (event) => startWindowResize(event, win));
    growBox.addEventListener("mousedown", (event) => startWindowResize(event, win));
    win.append(growBox);
  });
}

function tileWindows(candidateWindows = null) {
  const openWindows = Array.isArray(candidateWindows)
    ? candidateWindows.filter(visibleWindowOrNull)
    : getTileCandidateWindows();

  if (openWindows.length === 0) return;

  const desktop = document.querySelector(".desktop");
  const iconColumn = document.querySelector(".icon-column");
  const padding = 18;
  const topPadding = 28;
  const bottomPadding = 18;
  const iconRect = iconColumn?.getBoundingClientRect();
  const avoidance = getDesktopAvoidanceInsets({ margin: padding, iconGap: 48 });
  const iconGutter = iconRect && iconRect.width > 0 ? iconRect.width + 48 : 0;
  const desktopWidth = desktop.clientWidth - avoidance.left - iconGutter - padding;
  const desktopHeight = desktop.clientHeight;
  const tileableWindows = openWindows.filter((win) => tileableWindowNames.has(win.dataset.window));
  const fixedWindows = openWindows.filter((win) => !tileableWindowNames.has(win.dataset.window));
  const fixedGap = fixedWindows.length ? 20 : 0;
  const minTileAreaWidth = 520;

  const fixedColumnWidth = fixedWindows.reduce((max, win) => {
    win.style.width = "";
    win.style.height = "";
    const rect = win.getBoundingClientRect();
    return Math.max(max, rect.width || 0);
  }, 0);
  const useFixedColumn = fixedWindows.length > 0
    && desktopWidth - fixedColumnWidth - fixedGap - padding >= minTileAreaWidth;

  if (!tileableWindows.length) return;

  const tileAreaWidth = useFixedColumn
    ? desktopWidth - fixedColumnWidth - fixedGap - padding
    : desktopWidth - padding;
  const count = tileableWindows.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const winWidth = Math.floor((tileAreaWidth - (padding * (cols - 1))) / cols);
  const winHeight = Math.floor((desktopHeight - topPadding - bottomPadding - (padding * (rows - 1))) / rows);

  tileableWindows.forEach((win, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    win.style.left = `${avoidance.left + col * (winWidth + padding)}px`;
    win.style.top = `${topPadding + row * (winHeight + padding)}px`;
    win.style.width = `${winWidth}px`;
    win.style.height = `${winHeight}px`;
    win.style.right = "auto";
    win.style.transform = "none";
    win.classList.remove("is-collapsed");
    markWindowUserPositioned(win);

    // Special handling for assistant desklet mode
    if (win.dataset.window === "assistant") {
      win.classList.remove("is-desklet");
    }
  });

  if (useFixedColumn) {
    arrangeFixedWindows(fixedWindows, {
      left: Math.max(avoidance.left, avoidance.left + desktopWidth - fixedColumnWidth),
      top: topPadding,
      bottom: desktopHeight - bottomPadding,
      gap: 24,
    });
  } else {
    arrangeFixedWindows(fixedWindows, {
      left: avoidance.left,
      top: topPadding + rows * (winHeight + padding),
      bottom: Number.POSITIVE_INFINITY,
      gap: 24,
    });
  }
  scheduleWorkingSessionSave?.();
}

function arrangeFixedWindows(windows, bounds) {
  let top = bounds.top;

  windows.forEach((win) => {
    win.classList.remove("is-collapsed");
    win.style.width = "";
    win.style.height = "";
    win.style.right = "auto";
    win.style.transform = "none";

    const rect = win.getBoundingClientRect();
    const height = rect.height || 0;

    if (top + height > bounds.bottom) {
      top = bounds.top;
    }

    win.style.left = `${Math.max(18, bounds.left)}px`;
    win.style.top = `${top}px`;
    markWindowUserPositioned(win);
    top += height + bounds.gap;
  });
}

function hideSidebars() {
  sidebarWindowNames().forEach((name) => closeWindow(name, true));
  openWindow("assistant");
  if (!getWindow("teachText").classList.contains("is-hidden")) {
    focusWindow(getWindow("teachText"));
  }
}
