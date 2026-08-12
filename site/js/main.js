// AI System 6 official site — entry module. Progressive enhancement only:
// with JS off the page is a readable document with a desktop screenshot.

import { ERAS, setEra, onEraChange, prefetchEras, refreshIcons } from "./eras.js?v=20260813d";
import { initBalloons, setBalloons, balloonsEnabled, flashBalloon } from "./balloon.js?v=20260813d";
import { createMiniDesktop } from "./desktop.js?v=20260813d";
import { buildEraStrip } from "./timeline.js?v=20260813d";
import { initChatScene } from "./chat.js?v=20260813d";
import { initRouteScene } from "./route.js?v=20260813d";
import { initImpossible } from "./impossible.js?v=20260813d";
import { initFloppies } from "./floppies.js?v=20260813d";
import { initControlPanel } from "./controlpanel.js?v=20260813d";
import { initQuickTime } from "./quicktime.js?v=20260813d";
import { initShareCard } from "./sharecard.js?v=20260813d";

const doc = document;
doc.documentElement.classList.add("js");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = matchMedia("(max-width: 700px)").matches;

/* ---------- Boot sequence (once per session) ----------
   The product's startup screen: happy Mac, progress bar, startup ledger.
   Every ledger line is true for this page — the assets really are loaded,
   and no LLM is required. A click or key press skips ahead. */
const boot = doc.getElementById("boot");
let booted = false;
try { booted = sessionStorage.getItem("s6-booted") === "1"; } catch (e) {}
if (boot && !booted && !reducedMotion) {
  boot.hidden = false;
  try { sessionStorage.setItem("s6-booted", "1"); } catch (e) {}
  const fill = doc.getElementById("boot-fill");
  const msg = doc.getElementById("boot-msg");
  const timers = [];
  const finish = () => {
    timers.forEach(clearTimeout);
    boot.classList.add("boot-done");
    setTimeout(() => boot.remove(), 400);
    boot.removeEventListener("pointerdown", finish);
    doc.removeEventListener("keydown", finish);
  };
  const step = (ms, fn) => timers.push(setTimeout(fn, ms));
  fill.style.width = "8%";
  step(350, () => {
    doc.getElementById("boot-check-disk").classList.add("is-ready");
    fill.style.width = "42%";
  });
  step(850, () => {
    doc.getElementById("boot-check-eras").classList.add("is-ready");
    fill.style.width = "78%";
  });
  step(1350, () => {
    const llm = doc.getElementById("boot-check-llm");
    llm.classList.add("is-standby");
    llm.textContent = "LLM — none required";
    fill.style.width = "100%";
    msg.textContent = "Welcome to AI System 6.";
  });
  step(2150, finish);
  boot.addEventListener("pointerdown", finish);
  doc.addEventListener("keydown", finish);
} else if (boot) {
  boot.remove();
}

/* ---------- Menus ---------- */
const menus = [...doc.querySelectorAll("details.menu")];
menus.forEach((menu) => {
  menu.addEventListener("toggle", () => {
    if (!menu.open) return;
    menus.forEach((other) => { if (other !== menu) other.open = false; });
  });
});
doc.addEventListener("pointerdown", (e) => {
  menus.forEach((menu) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
});
doc.addEventListener("keydown", (e) => {
  if (e.key === "Escape") menus.forEach((menu) => { menu.open = false; });
});
doc.querySelectorAll(".menu-list a").forEach((item) => {
  item.addEventListener("click", () => menus.forEach((menu) => { menu.open = false; }));
});

/* ---------- Appearance menu + cycle ---------- */
const appearanceItems = [...doc.querySelectorAll("[data-appearance]")];
const cycleItem = doc.getElementById("menu-cycle");
let cycleTimer = null;

function currentThemeId() {
  return doc.documentElement.getAttribute("data-theme") || "classic";
}
function syncChecks() {
  const active = currentThemeId();
  appearanceItems.forEach((item) =>
    item.classList.toggle("is-active", item.getAttribute("data-appearance") === active));
  if (cycleItem) cycleItem.classList.toggle("is-active", !!cycleTimer);
  const cycleBtn = doc.getElementById("cycle-btn");
  if (cycleBtn) {
    cycleBtn.setAttribute("aria-pressed", String(!!cycleTimer));
    cycleBtn.classList.toggle("is-cycling", !!cycleTimer);
    cycleBtn.querySelector(".cycle-label").textContent = cycleTimer ? "Stop the Show" : "Cycle Eras";
  }
}
function stopCycle() {
  if (!cycleTimer) return;
  clearInterval(cycleTimer);
  cycleTimer = null;
  try { localStorage.removeItem("s6-site-theme-cycle"); } catch (e) {}
  syncChecks();
}
function startCycle() {
  if (cycleTimer) return;
  cycleTimer = setInterval(() => {
    const idx = ERAS.findIndex((e) => e.id === currentThemeId());
    setEra(ERAS[(idx + 1) % ERAS.length].id, false);
  }, 2000);
  try { localStorage.setItem("s6-site-theme-cycle", "1"); } catch (e) {}
  syncChecks();
}
appearanceItems.forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    stopCycle();
    setEra(item.getAttribute("data-appearance"), true);
  });
});
if (cycleItem) {
  cycleItem.addEventListener("click", (e) => {
    e.preventDefault();
    if (cycleTimer) stopCycle(); else startCycle();
  });
}
let wasCycling = false;
try { wasCycling = localStorage.getItem("s6-site-theme-cycle") === "1"; } catch (e) {}
if (wasCycling && !reducedMotion) startCycle();

// The Cycle Eras button in the six-eras scene: the old appearance-cycling
// recording, performed live by the page itself.
const cycleBtn = doc.getElementById("cycle-btn");
if (cycleBtn) {
  cycleBtn.addEventListener("click", () => {
    if (cycleTimer) stopCycle(); else startCycle();
  });
}
// Grabbing a timeline by hand ends the show — the visitor took the controls.
doc.addEventListener("input", (e) => {
  if (e.target.closest(".era-range")) stopCycle();
});
doc.addEventListener("click", (e) => {
  if (e.target.closest(".era-tick")) stopCycle();
});

onEraChange(syncChecks);
syncChecks();

/* ---------- Shut Down… ---------- */
const shutdown = doc.getElementById("shutdown");
const shutdownItem = doc.getElementById("menu-shutdown");
if (shutdown && shutdownItem) {
  shutdownItem.addEventListener("click", (e) => {
    e.preventDefault();
    shutdown.hidden = false;
    shutdown.querySelector("button").focus();
  });
  shutdown.querySelector("button").addEventListener("click", () => {
    try { sessionStorage.removeItem("s6-booted"); } catch (e) {}
    location.reload();
  });
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !shutdown.hidden) shutdown.hidden = true;
  });
}

/* ---------- Balloon Help ---------- */
initBalloons();
const balloonItem = doc.getElementById("menu-balloons");
if (balloonItem) {
  balloonItem.addEventListener("click", (e) => {
    e.preventDefault();
    setBalloons(!balloonsEnabled());
    balloonItem.classList.toggle("is-active", balloonsEnabled());
    if (balloonsEnabled()) flashBalloon(doc.querySelector(".menu-title") || doc.body, "Balloons on. Point at any object.", 2400);
  });
}

/* ---------- Hero mini desktop ---------- */
const heroDesk = doc.getElementById("hero-desk");
if (heroDesk) {
  createMiniDesktop(heroDesk, {
    objects: narrow ? ["hardDisk", "fileFloppy", "trash"] : ["hardDisk", "fileFloppy", "projectDisc", "startupDisk", "trash"],
    apps: ["searcher", "reader", "scrapbook", "docMap", "teachText", "reviewDesk", "clioStage", "cmfStudio"],
    open: narrow ? ["teachText"] : ["teachText", "searcher"],
    spots: narrow ? {
      teachText: { x: 12, y: 10, w: 235 },
    } : {
      teachText: { x: 250, y: 40 },
      searcher: { x: 40, y: 120 },
      scrapbook: { x: 560, y: 150 },
      docMap: { x: 480, y: 30 },
      reader: { x: 90, y: 60 },
      reviewDesk: { x: 300, y: 170 },
      clioStage: { x: 150, y: 190 },
      cmfStudio: { x: 520, y: 100 },
      clioChart: { x: 200, y: 90 },
      clioTalk: { x: 360, y: 130 },
    },
  });
  buildEraStrip(doc.getElementById("hero-era-strip"), { big: false });
}

/* ---------- Scenes ---------- */
initChatScene(doc.getElementById("chat-stage"));
initRouteScene(doc.getElementById("route-stage"));

const eraDesk = doc.getElementById("era-desk");
if (eraDesk) {
  createMiniDesktop(eraDesk, {
    objects: narrow ? ["hardDisk", "trash"] : ["hardDisk", "fileFloppy", "projectDisc", "trash"],
    apps: [],
    open: narrow ? ["teachText"] : ["docMap", "teachText", "reviewDesk"],
    spots: narrow ? {
      teachText: { x: 14, y: 16, w: 230 },
    } : {
      docMap: { x: 30, y: 26 },
      teachText: { x: 300, y: 60 },
      reviewDesk: { x: 90, y: 160 },
    },
  });
  buildEraStrip(doc.getElementById("era-strip"), { big: true });
  initShareCard(doc.getElementById("snapshot-btn"));
}

initImpossible(doc.getElementById("impossible-body"), doc.getElementById("impossible-status"));
initFloppies(doc.getElementById("floppy-stage"));
initControlPanel(doc.getElementById("cp-stage"));
initQuickTime();

/* ---------- Scene reveal ---------- */
const scenes = [...doc.querySelectorAll(".scene, .hero-scene")];
if ("IntersectionObserver" in window && !reducedMotion) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add("scene-in");
      io.unobserve(en.target);
    });
  }, { threshold: 0.12 });
  scenes.forEach((s) => io.observe(s));
} else {
  scenes.forEach((s) => s.classList.add("scene-in"));
}

/* ---------- Mini menu-bar clocks keep real time ---------- */
function tickClocks() {
  const now = new Date();
  let h = now.getHours();
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const text = h + ":" + String(now.getMinutes()).padStart(2, "0") + " " + suffix;
  doc.querySelectorAll(".mini-clock").forEach((el) => { el.textContent = text; });
}
tickClocks();
setInterval(tickClocks, 30000);

/* ---------- Icon warmup ---------- */
refreshIcons();
addEventListener("load", () => setTimeout(prefetchEras, 1800));
