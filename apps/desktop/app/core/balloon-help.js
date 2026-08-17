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

function positionBalloonHelp(target) {
  const balloon = balloonHelpElement();
  if (!balloon || !target) return;
  const targetRect = target.getBoundingClientRect();
  const balloonRect = balloon.getBoundingClientRect();
  const viewport = window.visualViewport;
  const edge = 10;
  const gap = 12;
  const bounds = {
    left: (viewport?.offsetLeft || 0) + edge,
    top: (viewport?.offsetTop || 0) + edge,
    right: (viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth) - edge,
    bottom: (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - edge,
  };
  const available = {
    below: bounds.bottom - targetRect.bottom - gap,
    above: targetRect.top - bounds.top - gap,
    right: bounds.right - targetRect.right - gap,
    left: targetRect.left - bounds.left - gap,
  };
  const required = {
    below: balloonRect.height,
    above: balloonRect.height,
    right: balloonRect.width,
    left: balloonRect.width,
  };
  // Prefer the familiar vertical callout when it fits, but let edge controls
  // use the open side instead of squeezing a balloon over their target.
  const preference = { below: 4, above: 3, right: 2, left: 1 };
  const side = Object.keys(available).sort((a, b) => {
    const aFits = available[a] >= required[a] ? 1 : 0;
    const bFits = available[b] >= required[b] ? 1 : 0;
    if (aFits !== bFits) return bFits - aFits;
    if (aFits && bFits) return preference[b] - preference[a];
    const aRoom = available[a] / Math.max(1, required[a]);
    const bRoom = available[b] / Math.max(1, required[b]);
    return bRoom - aRoom || preference[b] - preference[a];
  })[0];
  const centeredLeft = targetRect.left + (targetRect.width - balloonRect.width) / 2;
  const centeredTop = targetRect.top + (targetRect.height - balloonRect.height) / 2;
  const idealLeft = side === "right"
    ? targetRect.right + gap
    : side === "left"
      ? targetRect.left - balloonRect.width - gap
      : centeredLeft;
  const idealTop = side === "below"
    ? targetRect.bottom + gap
    : side === "above"
      ? targetRect.top - balloonRect.height - gap
      : centeredTop;
  const left = Math.max(bounds.left, Math.min(idealLeft, bounds.right - balloonRect.width));
  const top = Math.max(bounds.top, Math.min(idealTop, bounds.bottom - balloonRect.height));
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const tailLeft = Math.max(18, Math.min(targetCenterX - left, balloonRect.width - 18));
  const tailTop = Math.max(18, Math.min(targetCenterY - top, balloonRect.height - 18));

  balloon.dataset.side = side;
  balloon.style.setProperty("--balloon-help-left", `${Math.round(left)}px`);
  balloon.style.setProperty("--balloon-help-top", `${Math.round(top)}px`);
  balloon.style.setProperty("--balloon-help-tail-left", `${Math.round(tailLeft)}px`);
  balloon.style.setProperty("--balloon-help-tail-top", `${Math.round(tailTop)}px`);
}

function hideBalloonHelp() {
  window.clearTimeout(balloonHelpTimer);
  balloonHelpTimer = null;
  forgetBalloonHelpTarget(balloonHelpTarget);
  balloonHelpTarget = null;
  balloonHelpTextKey = "";
  const balloon = balloonHelpElement();
  balloon?.classList.add("is-hidden");
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
  if (!guideSeen) return;
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
