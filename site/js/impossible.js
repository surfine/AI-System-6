// The Finder window of things a 1988 computer should not be able to do.
// Click selects, double-click opens a small window. There are no staged mockups:
// each card says what the feature is and boots the real system to prove it.

import { iconImg } from "./eras.js?v=20260814b";

const doc = document;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LIVE = "https://system6.aaronlau.me";

const ITEMS = [
  { icon: "searcher", label: "Search the Web",
    line: "Searcher queries the live web; clippings land in the Scrapbook with their sources attached." },
  { icon: "timeMachine", label: "Read the Past",
    line: "Time Machine opens archived pages through the Wayback Machine, as a desk accessory." },
  { icon: "soundscape", label: "Transcribe Audio",
    line: "An interview tape becomes text on a File Floppy, ready to clip." },
  { icon: "importUtility", label: "OCR Documents",
    line: "Scanned pages become searchable text through the File Floppy import." },
  { icon: "clioChart", label: "Make Charts",
    line: "ClioChart turns one Markdown matrix into five editable projections." },
  { icon: "clioStage", label: "Build Slides",
    line: "ClioStage presents the same manuscript as a Markdown slide deck." },
  { icon: "cmfStudio", label: "Design in 3D",
    line: "CMF Studio recolors a 3D iPhone and exports USDZ for AR." },
  { icon: "liquidCover", label: "Render Glass",
    line: "Cover Glass renders refractive WebGL typography for finished covers." },
];

export function initImpossible(body, statusBar) {
  const restingStatus = "8 items          2 floppies in disk          38 years available";
  let openWin = null;

  function closeCard() {
    if (openWin) { openWin.remove(); openWin = null; }
    statusBar.textContent = restingStatus;
  }
  statusBar.textContent = restingStatus;

  function openCard(item, fromBtn) {
    closeCard();
    const win = doc.createElement("section");
    win.className = "mini-window demo-window";
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-label", item.label);
    win.innerHTML = `
      <header class="tbar mini-tbar">
        <button type="button" class="close-box mw-close" aria-label="Close ${item.label}"></button>
        <h3>${item.label}</h3>
      </header>
      <div class="mini-wbody">
        <p class="imp-line">${item.line}</p>
        <p class="btn-row imp-actions"><a class="btn btn-default" href="${LIVE}">See It Running</a></p>
        <p class="mw-status">Opens the real Live System in this browser.</p>
      </div>`;
    body.appendChild(win);
    if (!reducedMotion) win.classList.add("win-zoom");
    openWin = win;
    statusBar.textContent = item.label + ". No mockup: boot it and try.";
    const close = win.querySelector(".mw-close");
    close.addEventListener("click", () => { closeCard(); fromBtn.focus(); });
    win.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeCard(); fromBtn.focus(); } });
    close.focus();
  }

  ITEMS.forEach((item) => {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "desk-icon finder-item";
    btn.setAttribute("data-balloon", item.line);
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
      if (e.detail === 0 || second) openCard(item, btn);
    });
    btn.addEventListener("dblclick", () => openCard(item, btn));
    body.appendChild(btn);
  });

  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openWin) closeCard();
  });
}
