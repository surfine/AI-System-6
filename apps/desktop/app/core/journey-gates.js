// ADHD / I-person journey gates — product landings for calm-desktop harvest O
// (design map: journey-product-harvest-design.md · v228).
//
// Measurable attributes (on #desktop / body probe, and journey shell windows):
//   data-journey-product  "1" when these landings are wired in apps/
//   data-accept-bookmark  TeachText / held-place resume bookmark
//   data-accept-hold      holdThought Esc／Done leave immediately
//   data-accept-quiet     notifications do not steal focus; no welcome modal
//   data-accept-da        writingBell / todo voluntary; no streak nag
//   data-welcome          "0" — quiet return
//   data-nag              "0" — no streak / red-dot pressure on bell／todo
//   data-primary          "1" — organic one-primary chrome on the writing path
//   data-one-open         "1" — Hold→notify→resume→bell／todo do not stack-open
//   data-shell-open       hold | notify | resume | da | none
//   data-desk-focus       "1" when writing-editor focus quiets the desk icons
//
// Prefer hardening existing objects over new windows. Shell exclusivity closes
// sibling journey accessories on summon; session restore may keep several.

(function installJourneyGates(global) {
  "use strict";

  const JOURNEY_SHELL_WINDOWS = Object.freeze([
    "holdThought",
    "notificationCenter",
    "writingBell",
    "todo",
  ]);

  const GATES = Object.freeze([
    { gate: "bookmark", land: "teachText/persistence", attr: "data-accept-bookmark" },
    { gate: "hold", land: "holdThought", attr: "data-accept-hold" },
    { gate: "quiet", land: "notificationCenter", attr: "data-accept-quiet" },
    { gate: "nag", land: "writingBell/todo", attr: "data-nag" },
    { gate: "primary", land: "organic-chrome", attr: "data-primary" },
    { gate: "shell", land: "window-manager/DA", attr: "data-one-open" },
    { gate: "desk", land: "writing-editor", attr: "data-desk-focus" },
  ]);

  function isJourneyShellWindow(name) {
    return JOURNEY_SHELL_WINDOWS.includes(String(name || ""));
  }

  function journeyWindowVisible(name) {
    if (typeof getWindow !== "function") return false;
    const win = getWindow(name);
    return !!(win && !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden"));
  }

  function openJourneyShellName() {
    if (journeyWindowVisible("holdThought")) return "hold";
    if (journeyWindowVisible("notificationCenter")) return "notify";
    if (journeyWindowVisible("writingBell") || journeyWindowVisible("todo")) return "da";
    if (typeof getWindow === "function") {
      const writing = ["teachText", "questionSheet", "outline", "sectionDrafts", "reviewDesk"]
        .find((name) => {
          const win = getWindow(name);
          return win && win.classList.contains("is-active") && !win.classList.contains("is-hidden");
        });
      if (writing) return "resume";
    }
    return "none";
  }

  async function closeSiblingJourneyAccessories(keepName) {
    const keep = String(keepName || "");
    for (const name of JOURNEY_SHELL_WINDOWS) {
      if (name === keep) continue;
      if (!journeyWindowVisible(name)) continue;
      if (typeof closeWindow === "function") {
        try {
          await closeWindow(name, true);
        } catch {
          const win = typeof getWindow === "function" ? getWindow(name) : null;
          win?.classList.add("is-hidden");
        }
      }
    }
  }

  function deskFocusOn() {
    return !!(global.document?.body?.classList?.contains("is-writing-focus")
      || global.document?.body?.classList?.contains("quick-draft-focus")
      || global.document?.body?.classList?.contains("is-review-focus"));
  }

  function readProductGateSnapshot() {
    const shellOpen = openJourneyShellName();
    const openShellCount = JOURNEY_SHELL_WINDOWS.filter(journeyWindowVisible).length;
    return {
      product: "1",
      acceptBookmark: "1",
      acceptHold: "1",
      acceptQuiet: "1",
      acceptDa: "1",
      welcome: "0",
      nag: "0",
      primary: "1",
      oneOpen: openShellCount <= 1 ? "1" : "0",
      shellOpen,
      deskFocus: deskFocusOn() ? "1" : "0",
      gates: GATES.length,
    };
  }

  function applyProbe(el, snapshot = readProductGateSnapshot()) {
    if (!el || typeof el.setAttribute !== "function") return snapshot;
    el.setAttribute("data-journey-product", snapshot.product);
    el.setAttribute("data-accept-bookmark", snapshot.acceptBookmark);
    el.setAttribute("data-accept-hold", snapshot.acceptHold);
    el.setAttribute("data-accept-quiet", snapshot.acceptQuiet);
    el.setAttribute("data-accept-da", snapshot.acceptDa);
    el.setAttribute("data-welcome", snapshot.welcome);
    el.setAttribute("data-nag", snapshot.nag);
    el.setAttribute("data-primary", snapshot.primary);
    el.setAttribute("data-one-open", snapshot.oneOpen);
    el.setAttribute("data-shell-open", snapshot.shellOpen);
    el.setAttribute("data-desk-focus", snapshot.deskFocus);
    el.setAttribute("data-harvest-map", "1");
    return snapshot;
  }

  function syncDeskProbe() {
    const desk = global.document?.getElementById?.("desktop")
      || global.document?.querySelector?.(".desktop")
      || global.document?.body;
    return applyProbe(desk);
  }

  function markShellWindow(win, name) {
    if (!win || typeof win.setAttribute !== "function") return;
    win.setAttribute("data-journey-shell", "1");
    win.setAttribute("data-journey-product", "1");
    win.setAttribute("data-one-open", "1");
    win.setAttribute("data-shell-open", openJourneyShellName());
    if (name === "writingBell" || name === "todo") {
      win.setAttribute("data-nag", "0");
      win.setAttribute("data-adhd", "no-streak");
    }
    if (name === "writingBell") {
      win.setAttribute("data-tick-after-close", "1");
    }
    if (name === "notificationCenter") {
      win.setAttribute("data-welcome", "0");
      win.setAttribute("data-accept-quiet", "1");
    }
    if (name === "holdThought") {
      win.setAttribute("data-accept-hold", "1");
    }
  }

  global.AISystem6JourneyGates = Object.freeze({
    GATES,
    JOURNEY_SHELL_WINDOWS,
    isJourneyShellWindow,
    closeSiblingJourneyAccessories,
    readProductGateSnapshot,
    applyProbe,
    syncDeskProbe,
    markShellWindow,
  });
})(typeof window !== "undefined" ? window : globalThis);
