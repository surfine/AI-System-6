// AI System 6 official site — entry module. Progressive enhancement only:
// with JS off the page is a readable document with a desktop screenshot.

import { ERAS, setEra, onEraChange, prefetchEras, refreshIcons } from "./eras.js?v=20260814a";
import { initBalloons, setBalloons, balloonsEnabled, flashBalloon } from "./balloon.js?v=20260814a";
import { buildEraStrip } from "./timeline.js?v=20260814a";
import { loadMachine, createMachine, warmAllFrames, machineManifest } from "./machine.js?v=20260814a";
import { initRouteScene } from "./route.js?v=20260814a";
import { initImpossible } from "./impossible.js?v=20260814a";
import { initFloppies } from "./floppies.js?v=20260814a";
import { initQuickTime } from "./quicktime.js?v=20260814a";
import { initShareCard } from "./sharecard.js?v=20260814a";

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

/* ---------- The machine: real frames from the real app ---------- */
await loadMachine();

const heroMachine = doc.getElementById("hero-machine");
if (heroMachine) {
  createMachine(heroMachine, { region: "full" });
  buildEraStrip(doc.getElementById("hero-era-strip"), { big: false });
  const prov = doc.getElementById("hero-provenance");
  const m = machineManifest();
  if (prov && m.build) {
    prov.textContent = "Captured from Build " + m.build + " — every frame is the real system, unretouched.";
  }
}

const chatMachine = doc.getElementById("chat-machine");
if (chatMachine) {
  createMachine(chatMachine, {
    region: "assistant",
    pad: 0.025,
    alt: "The ClioTalk window from the captured desktop: “Connect AI to send a message.” One chat window among many working apps.",
  });
}

const routeMachine = doc.getElementById("route-machine");
if (routeMachine) {
  const viewer = createMachine(routeMachine, { region: "scrapbook", pad: 0.03 });
  initRouteScene(doc.getElementById("route-stage"), viewer);
}

const eraMachine = doc.getElementById("era-machine");
if (eraMachine) {
  createMachine(eraMachine, { region: "full" });
  buildEraStrip(doc.getElementById("era-strip"), { big: true });
  initShareCard(doc.getElementById("snapshot-btn"));
}

const modelMachine = doc.getElementById("model-machine");
if (modelMachine) {
  createMachine(modelMachine, {
    region: "menuBar",
    pad: 0.004,
    alt: "The captured menu bar: “Model not connected” — and the desk keeps working.",
  });
}

// Frames for the other five eras load once the visitor is likely to travel.
addEventListener("load", () => setTimeout(warmAllFrames, 2200));

initImpossible(doc.getElementById("impossible-body"), doc.getElementById("impossible-status"));
initFloppies(doc.getElementById("floppy-stage"));
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

/* ---------- Icon warmup ---------- */
refreshIcons();
addEventListener("load", () => setTimeout(prefetchEras, 1800));
