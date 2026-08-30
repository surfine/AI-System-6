// Optional, system-owned Balloon Help. The interaction follows the System 7
// model: the user turns the mode on, then unfamiliar objects explain their
// function and current unavailable state. It complements task-oriented System
// Help instead of becoming an automatic tour.

let balloonHelpEnabled = false;
let balloonHelpTouchedInspect = false;
let balloonHelpExplicit = false;
let balloonHelpTarget = null;
let balloonHelpTextKey = "";
let balloonHelpTimer = null;

const BALLOON_HELP_STORAGE_KEY = "ai-system6-balloon-help";

const balloonHelpSelectionRequiredActions = new Set([
  "open-menu-selection",
  "open-file-info",
  "open-project-info",
  "duplicate-selection",
  "move-file-trash",
  "eject-menu-selection",
  "rename-project-disk",
  "duplicate-project-disk",
  "archive-project-disk",
]);

const balloonHelpProjectRequiredActions = new Set([
  "insert-text-disk",
  "add-text-disk-project",
  "guide-start-route",
]);

function balloonHelpElement() {
  return document.querySelector("#balloon-help");
}

function balloonHelpKeyFor(target) {
  if (!target) return "";
  const unavailable = target.matches(":disabled, .is-disabled, [aria-disabled='true']");
  return unavailable && target.dataset.balloonHelpDisabled
    ? target.dataset.balloonHelpDisabled
    : target.dataset.balloonHelp || "";
}

function disabledMenuBalloonHelpKey(button) {
  const action = button?.dataset.action || button?.dataset.submenuAction || "";
  // "Why is this unavailable?" is Balloon Help's job, and with no model
  // connected it is the answer for every model-backed command at once.
  if (typeof actionNeedsModel === "function"
    && actionNeedsModel(action)
    && typeof modelReadyForRequests === "function"
    && !modelReadyForRequests()) {
    return "balloon_disabled_menu_model";
  }
  if (balloonHelpProjectRequiredActions.has(action)) return "balloon_disabled_menu_project";
  if (balloonHelpSelectionRequiredActions.has(action)) return "balloon_disabled_menu_selection";
  return "balloon_disabled_menu_context";
}

function syncDisabledMenuBalloonHelp() {
  const menuCommands = document.querySelectorAll([
    ".menu-popover button[data-action]",
    ".menu-submenu-popover button[data-action]",
    ".menu-sub-popover button[data-submenu-action]",
  ].join(","));

  menuCommands.forEach((button) => {
    const unavailable = button.disabled
      || button.classList.contains("is-disabled")
      || button.getAttribute("aria-disabled") === "true";
    const generated = button.dataset.balloonHelpGenerated === "true";

    if (unavailable && (!button.dataset.balloonHelp || generated)) {
      const key = disabledMenuBalloonHelpKey(button);
      button.dataset.balloonHelp = key;
      button.dataset.balloonHelpDisabled = key;
      button.dataset.balloonHelpGenerated = "true";
      return;
    }

    if (!unavailable && generated) {
      delete button.dataset.balloonHelp;
      delete button.dataset.balloonHelpDisabled;
      delete button.dataset.balloonHelpGenerated;
      forgetBalloonHelpTarget(button);
      if (button === balloonHelpTarget) hideBalloonHelp();
    }
  });
}

function syncWindowBalloonHelpTargets() {
  document.querySelectorAll(".window > .title-bar > .close-box").forEach((closeBox) => {
    closeBox.dataset.balloonHelp ||= "balloon_close_box";
  });
  document.querySelectorAll(".window > .title-bar > h2").forEach((title) => {
    title.dataset.balloonHelp ||= "balloon_windowshade";
  });
  document.querySelectorAll(".window > .title-bar > .resize-box:not([disabled])").forEach((zoomBox) => {
    zoomBox.dataset.balloonHelp ||= "balloon_zoom_box";
  });
  document.querySelectorAll(".window > .title-bar > .shade-box").forEach((shadeBox) => {
    shadeBox.dataset.balloonHelp ||= "balloon_shade_box";
  });
  document.querySelectorAll(".window > .grow-box").forEach((growBox) => {
    growBox.dataset.balloonHelp ||= "balloon_grow_box";
  });
}

function describeBalloonHelpTarget(target) {
  const describedBy = new Set((target.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
  describedBy.add("balloon-help");
  target.setAttribute("aria-describedby", [...describedBy].join(" "));
}

function forgetBalloonHelpTarget(target) {
  if (!target) return;
  const describedBy = (target.getAttribute("aria-describedby") || "")
    .split(/\s+/)
    .filter((id) => id && id !== "balloon-help");
  if (describedBy.length) target.setAttribute("aria-describedby", describedBy.join(" "));
  else target.removeAttribute("aria-describedby");
}

// Where a balloon lands follows five rules, in priority order: point at the
// object it explains; do not cover that object; do not cover what the object
// opens; do not cover the object's peers; then be as near as possible.
//
// Three rectangles carry that, each with one job. Pressing them into a single
// anchor was the old defect: the same rectangle decided what the tail pointed
// at, what the balloon sat against, and what it avoided, so "against the menu"
// became "in the middle of the menu", and a menu that had not opened yet was
// in no rectangle at all -- which is how a balloon came to sit on the commands
// it was explaining.
//
//   subject    the control under the pointer; the tail points here
//   keepClear  rectangles the balloon may not cover, each weighted
//   field      the area the balloon must stay inside

const BALLOON_HELP_GAP = 12;
const BALLOON_HELP_EDGE = 10;
const BALLOON_HELP_TAIL_INSET = 18;
const BALLOON_HELP_NARROW_WIDTH = 200;
const BALLOON_HELP_FALLBACK_PANEL_WIDTH = 180;
// Before a panel has ever opened, its own min-width is all we have, and a real
// menu is wider than its minimum -- the commands and their shortcuts see to
// that. Guessing high only pushes the balloon further sideways; guessing low
// puts it back on the commands, so the guess leans high until the first open
// replaces it with the measured size.
const BALLOON_HELP_PANEL_GUESS = 1.3;
// Covering the object itself is worse than covering a neighbour, and covering
// the panel it is about to open sits between the two.
const BALLOON_HELP_WEIGHT = { subject: 8, panel: 4, peer: 1 };

function balloonHelpOverlapArea(position, size, rect) {
  const width = Math.min(position.left + size.width, rect.right) - Math.max(position.left, rect.left);
  const height = Math.min(position.top + size.height, rect.bottom) - Math.max(position.top, rect.top);
  return width > 0 && height > 0 ? width * height : 0;
}

function balloonHelpSideOrigin(side, subject, size) {
  // Along the cross axis the balloon follows the SUBJECT, never the obstacle:
  // a command's balloon belongs beside that command, not beside the middle of
  // the menu the command lives in.
  const centeredLeft = subject.left + (subject.width - size.width) / 2;
  if (side === "below") return { left: centeredLeft, top: subject.top + subject.height + BALLOON_HELP_GAP };
  if (side === "above") return { left: centeredLeft, top: subject.top - size.height - BALLOON_HELP_GAP };
  if (side === "right") return { left: subject.left + subject.width + BALLOON_HELP_GAP, top: subject.top };
  return { left: subject.left - size.width - BALLOON_HELP_GAP, top: subject.top };
}

function balloonHelpClampToField(position, size, field) {
  return {
    left: Math.max(field.left, Math.min(position.left, field.right - size.width)),
    top: Math.max(field.top, Math.min(position.top, field.bottom - size.height)),
  };
}

function balloonHelpInsideField(position, size, field) {
  return position.left >= field.left
    && position.top >= field.top
    && position.left + size.width <= field.right
    && position.top + size.height <= field.bottom;
}

// Step aside by the smallest move that clears the obstacle, rather than
// abandoning the side. A pulled-down menu is 190px wide and the whole height
// of the screen: leaving it sideways costs 200px, leaving it downwards costs
// the screen.
function balloonHelpPushClear(position, size, keepClear, field) {
  let current = { left: position.left, top: position.top };
  // Two obstacles in a row can hand the balloon back and forth -- stepping off
  // the icon below puts it on the icon above, whose smallest move is back down
  // again. Places already tried are not offered twice.
  const visited = new Set([`${Math.round(current.left)},${Math.round(current.top)}`]);
  for (let pass = 0; pass < 6; pass += 1) {
    const hit = keepClear.find((rect) => balloonHelpOverlapArea(current, size, rect) > 0);
    if (!hit) break;
    const options = [
      { left: hit.right + BALLOON_HELP_GAP, top: current.top },
      { left: hit.left - size.width - BALLOON_HELP_GAP, top: current.top },
      { left: current.left, top: hit.bottom + BALLOON_HELP_GAP },
      { left: current.left, top: hit.top - size.height - BALLOON_HELP_GAP },
    ]
      .filter((option) => balloonHelpInsideField(option, size, field))
      .filter((option) => !visited.has(`${Math.round(option.left)},${Math.round(option.top)}`))
      .map((option) => ({
        ...option,
        move: Math.abs(option.left - current.left) + Math.abs(option.top - current.top),
      }))
      .sort((a, b) => a.move - b.move);
    if (!options.length) break;
    current = { left: options[0].left, top: options[0].top };
    visited.add(`${Math.round(current.left)},${Math.round(current.top)}`);
  }
  return current;
}

function balloonHelpOverlapCost(position, size, keepClear) {
  const area = Math.max(1, size.width * size.height);
  return keepClear.reduce((cost, rect) => {
    const overlap = balloonHelpOverlapArea(position, size, rect);
    return overlap ? cost + (overlap / area) * (rect.weight || 1) * 1000 : cost;
  }, 0);
}

function balloonHelpDistance(position, size, subject) {
  const dx = (position.left + size.width / 2) - (subject.left + subject.width / 2);
  const dy = (position.top + size.height / 2) - (subject.top + subject.height / 2);
  return Math.sqrt((dx * dx) + (dy * dy));
}

// The tail goes on the edge that faces the subject, at the point of that edge
// nearest to it. When the subject sits diagonally off a corner -- which is
// what stepping aside from a menu usually produces -- the dominant axis names
// the edge and the tail lands in that corner, pointing the way the subject
// actually lies.
function balloonHelpTail(position, size, subject) {
  const rect = {
    left: position.left,
    top: position.top,
    right: position.left + size.width,
    bottom: position.top + size.height,
  };
  const centerX = subject.left + (subject.width / 2);
  const centerY = subject.top + (subject.height / 2);
  const inset = BALLOON_HELP_TAIL_INSET;
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  const gapLeft = rect.left - centerX;
  const gapRight = centerX - rect.right;
  const gapTop = rect.top - centerY;
  const gapBottom = centerY - rect.bottom;
  const horizontal = Math.max(gapLeft, gapRight);
  const vertical = Math.max(gapTop, gapBottom);
  if (horizontal >= vertical) {
    return {
      side: gapLeft >= gapRight ? "right" : "left",
      tailLeft: inset,
      tailTop: clamp(centerY - rect.top, inset, Math.max(inset, size.height - inset)),
    };
  }
  return {
    side: gapTop >= gapBottom ? "below" : "above",
    tailLeft: clamp(centerX - rect.left, inset, Math.max(inset, size.width - inset)),
    tailTop: inset,
  };
}

// Pure: everything the DOM knows arrives as rectangles, so the placement can be
// held by a contract that never opens a browser.
// Returns the position, the tail, and what it cost -- `overlap` is zero only
// when the balloon covers nothing it was told to keep clear.
function placeBalloonHelp({ subject, keepClear = [], field, size }) {
  const sides = ["below", "above", "right", "left"];
  let best = null;
  sides.forEach((side, order) => {
    const origin = balloonHelpSideOrigin(side, subject, size);
    const position = balloonHelpPushClear(
      balloonHelpClampToField(origin, size, field),
      size,
      keepClear,
      field,
    );
    const overlap = balloonHelpOverlapCost(position, size, keepClear);
    const distance = balloonHelpDistance(position, size, subject);
    // The order of `sides` is the preference; it only breaks ties.
    const cost = overlap + distance + (order * 0.5);
    if (!best || cost < best.cost) best = { ...position, overlap, distance, cost, from: side };
  });
  return { ...best, ...balloonHelpTail(best, size, subject) };
}

function balloonHelpFieldRect() {
  const viewport = window.visualViewport;
  const offsetLeft = viewport?.offsetLeft || 0;
  const offsetTop = viewport?.offsetTop || 0;
  return {
    left: offsetLeft + BALLOON_HELP_EDGE,
    top: offsetTop + BALLOON_HELP_EDGE,
    right: offsetLeft + (viewport?.width || window.innerWidth) - BALLOON_HELP_EDGE,
    bottom: offsetTop + (viewport?.height || window.innerHeight) - BALLOON_HELP_EDGE,
  };
}

// Panels that are already on screen. A menu title and its pulled-down menu are
// read together, and so are a command and the menu it sits in.
function balloonHelpOpenSurfaces(target) {
  return [
    target.closest(".menu.is-open")?.querySelector(":scope > .menu-popover"),
    target.closest(".menu-item-with-sub.is-open")?.querySelector(":scope > .menu-sub-popover"),
    target.closest(".menu-submenu")?.querySelector(":scope > .menu-submenu-popover"),
    target.closest("details[open]")?.querySelector(":scope > .teachtext-command-popover, :scope > .teachtext-command-subpopover"),
    target.closest(".menu-popover, .menu-sub-popover, .menu-submenu-popover, .teachtext-command-popover, .teachtext-command-subpopover"),
  ].filter(Boolean);
}

// The panel this control opens when it is pressed.
function balloonHelpOwnedPanel(target) {
  const menu = target.closest(".menu");
  if (menu && menu.querySelector(":scope > button") === target) {
    return menu.querySelector(":scope > .menu-popover");
  }
  const withSub = target.closest(".menu-item-with-sub");
  if (withSub && withSub.querySelector(":scope > button") === target) {
    return withSub.querySelector(":scope > .menu-sub-popover");
  }
  const submenu = target.closest(".menu-submenu");
  if (submenu && submenu.querySelector(":scope > .menu-submenu-trigger") === target) {
    return submenu.querySelector(":scope > .menu-submenu-popover");
  }
  const details = target.closest("details");
  if (details && details.querySelector(":scope > summary") === target) {
    return details.querySelector(":scope > .teachtext-command-popover, :scope > .teachtext-command-subpopover");
  }
  return null;
}

// A closed panel cannot be measured, so the size it had the last time it opened
// is remembered on the element. Before it has ever opened, its own CSS
// min-width is the floor and the column runs to the bottom of the field:
// reserving too much only pushes the balloon sideways, reserving too little
// puts it back on top of the commands.
function rememberBalloonHelpPanelSizes() {
  document.querySelectorAll([
    ".menu.is-open > .menu-popover",
    ".menu-item-with-sub.is-open > .menu-sub-popover",
    "details[open] > .teachtext-command-popover",
    "details[open] > .teachtext-command-subpopover",
  ].join(",")).forEach((panel) => {
    const rect = panel.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    panel.dataset.balloonPanelWidth = String(Math.round(rect.width));
    panel.dataset.balloonPanelHeight = String(Math.round(rect.height));
  });
}

function forgetBalloonHelpPanelSizes() {
  document.querySelectorAll("[data-balloon-panel-width]").forEach((panel) => {
    delete panel.dataset.balloonPanelWidth;
    delete panel.dataset.balloonPanelHeight;
  });
}

function balloonHelpPredictedPanelRect(target, field) {
  const panel = balloonHelpOwnedPanel(target);
  if (!panel) return null;
  const live = panel.getBoundingClientRect();
  // Open already: the measured rectangle above is the truth.
  if (live.width && live.height) return null;

  const style = window.getComputedStyle(panel);
  const offsetLeft = Number.parseFloat(style.left);
  const offsetTop = Number.parseFloat(style.top);
  const host = (panel.parentElement || target).getBoundingClientRect();
  const fixed = style.position === "fixed";
  const left = fixed
    ? (Number.isFinite(offsetLeft) ? offsetLeft : host.left)
    : host.left + (Number.isFinite(offsetLeft) ? offsetLeft : 0);
  const top = fixed
    ? (Number.isFinite(offsetTop) ? offsetTop : host.bottom)
    : host.top + (Number.isFinite(offsetTop) ? offsetTop : host.height);

  const rememberedWidth = Number.parseFloat(panel.dataset.balloonPanelWidth || "");
  const rememberedHeight = Number.parseFloat(panel.dataset.balloonPanelHeight || "");
  const minWidth = Number.parseFloat(style.minWidth);
  const width = rememberedWidth > 0
    ? rememberedWidth
    : Math.max(minWidth > 0 ? minWidth : 0, BALLOON_HELP_FALLBACK_PANEL_WIDTH) * BALLOON_HELP_PANEL_GUESS;
  const bottom = rememberedHeight > 0 ? top + rememberedHeight : field.bottom;
  return { left, top, right: left + width, bottom };
}

// The subject's peers: the other icons in the same column, the other titles in
// the menu bar, the other buttons in the same group. The balloon leaves them
// alone when it can -- on a touch screen the object below the one being
// inspected is the next thing the finger reaches for.
function balloonHelpPeerElements(target) {
  let node = target;
  for (let depth = 0; depth < 3 && node?.parentElement; depth += 1) {
    const peers = [...node.parentElement.children]
      .filter((element) => element !== node && balloonHelpIsPeer(element));
    if (peers.length) return peers;
    node = node.parentElement;
  }
  return [];
}

function balloonHelpIsPeer(element) {
  if (element.id === "balloon-help" || element.matches(".menu-popover, .menu-sub-popover, .menu-submenu-popover")) return false;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  return element.matches("button, a, input, select, .desktop-icon, .menu, [data-action], [data-open], [role='button']")
    || Boolean(element.querySelector("button, .desktop-icon, [data-action], [data-open]"));
}

function balloonHelpKeepClearRects(target, field) {
  const rects = [];
  const push = (rect, weight) => {
    if (!rect) return;
    const right = rect.right ?? (rect.left + rect.width);
    const bottom = rect.bottom ?? (rect.top + rect.height);
    if (!(right > rect.left) || !(bottom > rect.top)) return;
    rects.push({ left: rect.left, top: rect.top, right, bottom, weight });
  };
  push(target.getBoundingClientRect(), BALLOON_HELP_WEIGHT.subject);
  balloonHelpOpenSurfaces(target).forEach((surface) => push(surface.getBoundingClientRect(), BALLOON_HELP_WEIGHT.panel));
  push(balloonHelpPredictedPanelRect(target, field), BALLOON_HELP_WEIGHT.panel);
  balloonHelpPeerElements(target).forEach((peer) => push(peer.getBoundingClientRect(), BALLOON_HELP_WEIGHT.peer));
  return rects;
}

function balloonHelpMeasure(balloon) {
  const rect = balloon.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function positionBalloonHelp(target) {
  const balloon = balloonHelpElement();
  if (!balloon || !target) return;
  const rect = target.getBoundingClientRect();
  const subject = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  const field = balloonHelpFieldRect();
  const keepClear = balloonHelpKeepClearRects(target, field);

  balloon.style.removeProperty("--balloon-help-max-width");
  let size = balloonHelpMeasure(balloon);
  let placement = placeBalloonHelp({ subject, keepClear, field, size });
  // Near beats wide. A balloon carries one or two sentences, so when it cannot
  // clear the obstacles at full width it gets narrower before it agrees to
  // travel.
  if (placement.overlap > 0 && size.width > BALLOON_HELP_NARROW_WIDTH) {
    balloon.style.setProperty("--balloon-help-max-width", `${BALLOON_HELP_NARROW_WIDTH}px`);
    const narrowSize = balloonHelpMeasure(balloon);
    const narrow = placeBalloonHelp({ subject, keepClear, field, size: narrowSize });
    if (narrow.cost < placement.cost) {
      placement = narrow;
      size = narrowSize;
    } else {
      balloon.style.removeProperty("--balloon-help-max-width");
    }
  }

  balloon.dataset.side = placement.side;
  balloon.style.setProperty("--balloon-help-left", `${Math.round(placement.left)}px`);
  balloon.style.setProperty("--balloon-help-top", `${Math.round(placement.top)}px`);
  balloon.style.setProperty("--balloon-help-tail-left", `${Math.round(placement.tailLeft)}px`);
  balloon.style.setProperty("--balloon-help-tail-top", `${Math.round(placement.tailTop)}px`);
}

// The world moves under a balloon that is already showing: a menu pulls down, a
// submenu opens, a panel closes. Waiting for the pointer to re-enter the object
// left the balloon sitting on commands that had appeared underneath it.
function refreshBalloonHelpPlacement() {
  rememberBalloonHelpPanelSizes();
  if (balloonHelpTarget) positionBalloonHelp(balloonHelpTarget);
}

function hideBalloonHelp() {
  window.clearTimeout(balloonHelpTimer);
  balloonHelpTimer = null;
  forgetBalloonHelpTarget(balloonHelpTarget);
  balloonHelpTarget = null;
  balloonHelpTextKey = "";
  const balloon = balloonHelpElement();
  balloon?.classList.add("is-hidden");
  balloon?.style.removeProperty("--balloon-help-max-width");
  if (balloon?.matches?.(":popover-open")) balloon.hidePopover();
}

function showBalloonHelp(target, key = balloonHelpKeyFor(target), options = {}) {
  const balloon = balloonHelpElement();
  const text = document.querySelector("#balloon-help-text");
  if (!balloon || !text || !target || !key || (!balloonHelpEnabled && !options.force)) return;

  window.clearTimeout(balloonHelpTimer);
  forgetBalloonHelpTarget(balloonHelpTarget);
  balloonHelpTarget = target;
  balloonHelpTextKey = key;
  text.textContent = t(key);
  describeBalloonHelpTarget(target);
  balloon.classList.remove("is-hidden");
  if (typeof balloon.showPopover === "function" && !balloon.matches(":popover-open")) {
    balloon.showPopover();
  }
  positionBalloonHelp(target);

  if (options.autoHideMs) {
    balloonHelpTimer = window.setTimeout(hideBalloonHelp, options.autoHideMs);
  }
}

function syncBalloonHelpLanguage() {
  // The menus are redrawn in the other language, so every remembered panel size
  // describes a panel that no longer exists.
  forgetBalloonHelpPanelSizes();
  const text = document.querySelector("#balloon-help-text");
  if (text && balloonHelpTextKey) text.textContent = t(balloonHelpTextKey);
  document.body.classList.toggle("is-balloon-help", balloonHelpEnabled);
}

function loadBalloonHelpPreference() {
  let stored = "";
  try {
    stored = String(localStorage.getItem(BALLOON_HELP_STORAGE_KEY) || "").trim();
  } catch {}
  if (stored === "on" || stored === "off") {
    balloonHelpExplicit = true;
    return stored === "on";
  }
  // First visit: hover-capable devices get the discoverable default so new
  // users meet the help balloons. Touch-primary devices stay off so the
  // explicit-inspect mode can never swallow a tap.
  return window.matchMedia("(hover: hover)").matches;
}

function setBalloonHelpEnabled(enabled, { announce = true, persist = true } = {}) {
  balloonHelpEnabled = Boolean(enabled);
  if (persist) {
    balloonHelpExplicit = true;
    balloonHelpTouchedInspect = balloonHelpEnabled;
    try {
      localStorage.setItem(BALLOON_HELP_STORAGE_KEY, balloonHelpEnabled ? "on" : "off");
    } catch {}
  } else {
    // Initial application of a stored/default preference: only an explicit
    // choice enables the touch inspect mode, never the hover default.
    balloonHelpTouchedInspect = balloonHelpExplicit && balloonHelpEnabled;
  }
  document.body.classList.toggle("is-balloon-help", balloonHelpEnabled);
  if (!balloonHelpEnabled) hideBalloonHelp();
  if (typeof updateMenuState === "function") updateMenuState();
  if (announce && typeof setStatus === "function") {
    setStatus(t(balloonHelpEnabled ? "balloon_help_on" : "balloon_help_off"));
  }
}

function toggleBalloonHelp() {
  setBalloonHelpEnabled(!balloonHelpEnabled);
}

function revealMultiFinderSwitcherHint() {
  if (!clioOnboardingCompleted) return;
  if (!isMultiFinderMode() || multiFinderSwitcherHintSeen) return;
  const switcher = document.querySelector("#multifinder-button");
  if (!switcher || switcher.closest(".is-hidden")) return;
  multiFinderSwitcherHintSeen = true;
  showBalloonHelp(switcher, "multifinder_switcher_discovery", { force: true, autoHideMs: 7000 });
  saveDeskState();
}

function initializeBalloonHelp() {
  if (!balloonHelpElement()) return;
  setBalloonHelpEnabled(loadBalloonHelpPreference(), { announce: false, persist: false });

  document.addEventListener("pointerover", (event) => {
    if (!balloonHelpEnabled || event.pointerType === "touch") return;
    const target = event.target.closest?.("[data-balloon-help], [data-balloon-help-disabled]");
    if (target && target !== balloonHelpTarget) showBalloonHelp(target);
  });

  document.addEventListener("pointerout", (event) => {
    if (!balloonHelpEnabled || event.pointerType === "touch" || !balloonHelpTarget) return;
    if (balloonHelpTarget.contains(event.relatedTarget)) return;
    hideBalloonHelp();
  });

  document.addEventListener("focusin", (event) => {
    if (!balloonHelpEnabled) return;
    const target = event.target.closest?.("[data-balloon-help], [data-balloon-help-disabled]");
    if (target) showBalloonHelp(target);
  });

  document.addEventListener("focusout", (event) => {
    if (!balloonHelpEnabled || !balloonHelpTarget) return;
    if (balloonHelpTarget.contains(event.relatedTarget)) return;
    hideBalloonHelp();
  });

  // In explicit help mode, a touch inspects an object instead of activating
  // it. A second tap on the same object lets the action through, so the
  // balloon explains once and then gets out of the way. Menu-bar buttons
  // remain usable so the user can hide Balloon Help.
  document.addEventListener("pointerdown", (event) => {
    if (!balloonHelpTouchedInspect || event.pointerType !== "touch") return;
    const target = event.target.closest?.("[data-balloon-help], [data-balloon-help-disabled]");

    // A tap aimed away from the current object is the user's next action.
    // Dismiss the old balloon first so it never sits on top of what they are
    // trying to press next, even though the popover itself is pointer-transparent.
    if (balloonHelpTarget && !balloonHelpTarget.contains(event.target)) {
      hideBalloonHelp();
    }
    if (!target) return;

    if (target === balloonHelpTarget) {
      // The object is already identified. Let this tap perform its action,
      // then clear the balloon so the mode stays available for the next
      // unfamiliar object without swallowing a second press.
      hideBalloonHelp();
      return;
    }

    showBalloonHelp(target);
    if (!target.closest(".menu-bar")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener("resize", hideBalloonHelp);
  document.addEventListener("scroll", hideBalloonHelp, true);
}
