// The Finder window of things a 1988 computer should not be able to do.
// Each item behaves like a Finder object: click selects, double-click opens
// a 3–6 second micro demo in a small window, close returns to the Finder.

import { iconImg } from "./eras.js?v=20260813a";

const doc = document;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const ITEMS = [
  {
    id: "web", icon: "searcher", label: "Search the Web",
    balloon: "Live web search, three sources, one clipping.",
    demo: (box) => {
      box.innerHTML = `
        <div class="mw-field"><span class="demo-type" data-text="tidal power"></span>&nbsp;<span class="mw-btn">Search</span></div>
        <ul class="mw-results demo-stagger">
          <li>Severn Estuary feasibility review</li>
          <li>La Rance: forty years of operation</li>
          <li>Turbine wear in salt water</li>
        </ul>
        <p class="mw-status demo-late">Saving clipping &rarr; Scrapbook&hellip;</p>`;
    },
  },
  {
    id: "past", icon: "timeMachine", label: "Read the Past",
    balloon: "The Wayback Machine, as a desk accessory.",
    demo: (box) => {
      box.innerHTML = `
        <p class="mw-text">apple.com</p>
        <div class="demo-years"><span>2026</span><span>2014</span><span>2002</span><span class="demo-year-hit">1996</span></div>
        <p class="mw-status demo-late">Snapshot: 22 Oct 1996 — loaded.</p>`;
    },
  },
  {
    id: "audio", icon: "soundscape", label: "Transcribe Audio",
    balloon: "An interview tape becomes text on a File Floppy.",
    demo: (box) => {
      box.innerHTML = `
        <div class="demo-wave" aria-hidden="true">${"<i></i>".repeat(24)}</div>
        <p class="mw-text demo-late">“…the tide comes in twice, and we bill it by the moon…”</p>`;
    },
  },
  {
    id: "ocr", icon: "importUtility", label: "OCR Documents",
    balloon: "A scanned page becomes searchable text.",
    demo: (box) => {
      box.innerHTML = `
        <div class="demo-scan"><span class="demo-scanline"></span></div>
        <p class="mw-status demo-late">3 pages &rarr; text. 1966 report, recovered.</p>`;
    },
  },
  {
    id: "charts", icon: "clioChart", label: "Make Charts",
    balloon: "Markdown data becomes an editable projection.",
    demo: (box) => {
      box.innerHTML = `
        <p class="mw-status">| year | GWh |</p>
        <div class="mw-chart demo-grow"><i style="--v:38%"></i><i style="--v:62%"></i><i style="--v:47%"></i><i style="--v:88%"></i><i style="--v:70%"></i></div>`;
    },
  },
  {
    id: "slides", icon: "clioStage", label: "Build Slides",
    balloon: "The manuscript becomes a deck in ClioStage.",
    demo: (box) => {
      box.innerHTML = `
        <div class="demo-slides">
          <div class="mw-slide"><span>THE TIDE<br>COMES IN TWICE</span></div>
          <div class="mw-slide"><span>240 GWh<br>A YEAR</span></div>
          <div class="mw-slide"><span>BILLED BY<br>THE MOON</span></div>
        </div>
        <p class="mw-status">Slides 1–3 of 9</p>`;
    },
  },
  {
    id: "cmf", icon: "cmfStudio", label: "Design in 3D",
    balloon: "An iPhone colorway, turned and recolored. USDZ out.",
    demo: (box) => {
      box.innerHTML = `
        <div class="mw-cmf demo-spin"><span class="mw-phone"></span>
        <span class="mw-swatches"><i style="background:#8ea6c8"></i><i style="background:#c8b08e"></i><i style="background:#333a44"></i></span></div>
        <p class="mw-status demo-late">colorway &rarr; USDZ for AR</p>`;
    },
  },
  {
    id: "glass", icon: "liquidCover", label: "Render Glass",
    balloon: "Refractive WebGL typography, in Cover Glass.",
    demo: (box) => {
      box.innerHTML = `
        <div class="demo-glass"><span>GLASS</span></div>
        <p class="mw-status demo-late">Cover exported as PNG.</p>`;
    },
  },
];

export function initImpossible(body, statusBar) {
  let openWin = null;

  function closeDemo() {
    if (openWin) { openWin.remove(); openWin = null; }
    statusBar.textContent = "8 items   Double-click one to see for yourself";
  }

  function openDemo(item, fromBtn) {
    closeDemo();
    const win = doc.createElement("section");
    win.className = "mini-window demo-window";
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-label", item.label);
    win.innerHTML = `
      <header class="tbar mini-tbar">
        <button type="button" class="close-box mw-close" aria-label="Close ${item.label}"></button>
        <h3>${item.label}</h3>
      </header>
      <div class="mini-wbody demo-body"></div>`;
    item.demo(win.querySelector(".demo-body"));
    body.appendChild(win);
    if (!reducedMotion) win.classList.add("win-zoom");
    openWin = win;
    statusBar.textContent = item.label + " — running on a 1988 desktop.";
    const close = win.querySelector(".mw-close");
    close.addEventListener("click", () => { closeDemo(); fromBtn.focus(); });
    win.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDemo(); fromBtn.focus(); } });
    close.focus();
  }

  ITEMS.forEach((item) => {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "desk-icon finder-item";
    btn.setAttribute("data-balloon", item.balloon);
    btn.appendChild(iconImg(item.icon, 32));
    const label = doc.createElement("span");
    label.className = "desk-icon-label";
    label.textContent = item.label;
    btn.appendChild(label);

    let lastTap = 0;
    btn.addEventListener("click", (e) => {
      const now = Date.now();
      const second = now - lastTap < 650 && btn.classList.contains("selected");
      lastTap = now;
      body.querySelectorAll(".finder-item.selected").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      statusBar.textContent = item.label;
      if (e.detail === 0 || second) openDemo(item, btn);
    });
    btn.addEventListener("dblclick", () => openDemo(item, btn));
    body.appendChild(btn);
  });

  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openWin) closeDemo();
  });
}
