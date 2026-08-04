// Optional, system-owned Balloon Help. The interaction follows the System 7
// model: the user turns the mode on, then unfamiliar objects explain their
// function and current unavailable state. It complements task-oriented System
// Help instead of becoming an automatic tour.

let balloonHelpEnabled = false;
let balloonHelpTarget = null;
let balloonHelpTextKey = "";
let balloonHelpTimer = null;

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
  document.querySelectorAll(".window > .title-bar > h2").forEach((title) => {
    title.dataset.balloonHelp ||= "balloon_windowshade";
  });
  document.querySelectorAll(".window > .title-bar > .resize-box:not([disabled])").forEach((zoomBox) => {
    zoomBox.dataset.balloonHelp ||= "balloon_zoom_box";
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
  const edge = 10;
  const gap = 12;
  const above = targetRect.bottom + gap + balloonRect.height > window.innerHeight - edge;
  const top = above
    ? targetRect.top - balloonRect.height - gap
    : targetRect.bottom + gap;
  const idealLeft = targetRect.left + (targetRect.width - balloonRect.width) / 2;
  const left = Math.max(edge, Math.min(idealLeft, window.innerWidth - balloonRect.width - edge));
  const targetCenter = targetRect.left + targetRect.width / 2;
  const tailLeft = Math.max(18, Math.min(targetCenter - left, balloonRect.width - 18));

  balloon.dataset.side = above ? "above" : "below";
  balloon.style.setProperty("--balloon-help-left", `${Math.round(left)}px`);
  balloon.style.setProperty("--balloon-help-top", `${Math.round(Math.max(edge, top))}px`);
  balloon.style.setProperty("--balloon-help-tail-left", `${Math.round(tailLeft)}px`);
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

function setBalloonHelpEnabled(enabled, { announce = true } = {}) {
  balloonHelpEnabled = Boolean(enabled);
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

  document.addEventListener("pointerover", (event) => {
    if (!balloonHelpEnabled || event.pointerType === "touch") return;
    const target = event.target.closest?.("[data-balloon-help]");
    if (target && target !== balloonHelpTarget) showBalloonHelp(target);
  });

  document.addEventListener("pointerout", (event) => {
    if (!balloonHelpEnabled || event.pointerType === "touch" || !balloonHelpTarget) return;
    if (balloonHelpTarget.contains(event.relatedTarget)) return;
    hideBalloonHelp();
  });

  document.addEventListener("focusin", (event) => {
    if (!balloonHelpEnabled) return;
    const target = event.target.closest?.("[data-balloon-help]");
    if (target) showBalloonHelp(target);
  });

  document.addEventListener("focusout", (event) => {
    if (!balloonHelpEnabled || !balloonHelpTarget) return;
    if (balloonHelpTarget.contains(event.relatedTarget)) return;
    hideBalloonHelp();
  });

  // In explicit help mode, a touch inspects an object instead of activating
  // it. Menu-bar buttons remain usable so the user can hide Balloon Help.
  document.addEventListener("pointerdown", (event) => {
    if (!balloonHelpEnabled || event.pointerType !== "touch") return;
    const target = event.target.closest?.("[data-balloon-help]");
    if (!target) return;
    showBalloonHelp(target);
    if (!target.closest(".menu-bar")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener("resize", hideBalloonHelp);
  document.addEventListener("scroll", hideBalloonHelp, true);
}
