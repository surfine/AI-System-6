// The Finder window of things a 1988 computer should not be able to do.
//
// Five of these can be proved offline, so the capture rig has photographs of
// them and they hang on the wall as pictures: the surprise is the whole point
// of this scene, and a surprise behind a double click is a surprise nobody
// sees. The rest need the live web, a model, or a file of your own, so they
// stay icons that open a card and send you to the running system.
//
// The list is deliberately not a feature inventory. It leads with the things
// that carry the product's judgment, in the words a stranger uses: the sheet
// that interviews you before you write, the map of your own research, and the
// desk that tells you your finished draft sounds like a machine.

import { iconImg } from "./eras.js?v=20260814i";

const doc = document;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LIVE = "https://system6.aaronlau.me";

const ITEMS = [
  { icon: "searcher", label: "Search the Web",
    line: "It goes and reads the live web, and anything you keep remembers where it came from." },
  { icon: "timeMachine", label: "Read the Past",
    line: "Opens a page the way it looked years ago, after the site changed it." },
  { icon: "soundscape", label: "Transcribe Audio",
    line: "An interview tape comes back as text you can quote." },
  { icon: "importUtility", label: "OCR Documents",
    line: "Scanned paper becomes words you can search." },
  { icon: "questionSheet", label: "Interview You First",
    line: "Before a word of prose, it asks who this is for, what you object to, and what you already know." },
  { icon: "docMap", label: "Map the Research",
    line: "A pile of sources becomes one map you can look at and move around." },
  { icon: "reviewDesk", label: "Catch the AI Voice",
    line: "It reads your finished draft back and points at the sentences that sound like a machine." },
  { icon: "clioChart", label: "Make Charts",
    line: "One table in your draft, five different charts, all still editable." },
  { icon: "clioStage", label: "Build Slides",
    line: "The same manuscript, presented as a deck, with no reformatting." },
  { icon: "cmfStudio", label: "Design in 3D",
    line: "Spin a 3D phone, repaint every part, and send it to AR." },
  { icon: "liquidCover", label: "Render Glass",
    line: "Refractive glass type, rendered live, saved as a finished cover." },
  { icon: "liquidCover", label: "Write Image Prompts",
    line: "One idea becomes two ready-to-paste prompts: GPT-Image and universal. It writes the prompt, not the picture." },
];

// The wall reads loudest with the two colour captures on top: a 1-bit window
// full of colour is the thing people do a double take at.
const WALL = ["Design in 3D", "Render Glass", "Make Charts", "Build Slides", "Write Image Prompts"];

let proofs = null;
async function loadProofs() {
  if (proofs) return proofs;
  try {
    const res = await fetch("img/proofs/proofs.json?v=20260814i");
    const data = await res.json();
    proofs = Object.fromEntries(data.proofs.map((p) => [p.label, p]));
  } catch (e) {
    proofs = {};
  }
  return proofs;
}

function renderWall(wall, items, proofsByLabel) {
  items.forEach((item) => {
    const proof = proofsByLabel[item.label];
    const card = doc.createElement("figure");
    card.className = "proof-card";
    const shot = doc.createElement("img");
    shot.className = "proof-shot";
    shot.src = "img/proofs/" + proof.file;
    shot.alt = item.label + ", captured from the running app: " + proof.caption;
    shot.loading = "lazy";
    shot.decoding = "async";
    const cap = doc.createElement("figcaption");
    cap.className = "proof-cap";
    cap.appendChild(iconImg(item.icon, 32));
    const label = doc.createElement("span");
    label.className = "proof-label";
    label.textContent = item.label;
    const line = doc.createElement("span");
    line.className = "proof-line";
    line.textContent = item.line;
    cap.append(label, line);
    card.append(shot, cap);
    wall.appendChild(card);
  });
}

export async function initImpossible(wall, body, statusBar) {
  const restingStatus = "12 items          2 floppies in disk          38 years available";
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
        <div class="imp-proof" hidden></div>
        <p class="imp-line">${item.line}</p>
        <p class="btn-row imp-actions"><a class="btn btn-default" href="${LIVE}">See It Running</a></p>
        <p class="mw-status imp-status">Opens the real Live System in this browser.</p>
      </div>`;
    body.appendChild(win);
    if (!reducedMotion) win.classList.add("win-zoom");
    openWin = win;
    statusBar.textContent = item.label + ". No mockup: boot it and try.";
    loadProofs().then((all) => {
      const proof = all[item.label];
      if (!proof || openWin !== win) return;
      const box = win.querySelector(".imp-proof");
      const img = doc.createElement("img");
      img.src = "img/proofs/" + proof.file;
      img.alt = item.label + ", captured from the running app: " + proof.caption;
      img.loading = "lazy";
      img.decoding = "async";
      box.appendChild(img);
      box.hidden = false;
      win.classList.add("has-proof");
      win.querySelector(".imp-status").textContent = "Captured from the running app. Not a mockup.";
    });
    const close = win.querySelector(".mw-close");
    close.addEventListener("click", () => { closeCard(); fromBtn.focus(); });
    win.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeCard(); fromBtn.focus(); } });
    close.focus();
  }

  // Whatever the rig could not photograph stays an icon. If proofs.json is
  // missing the wall is simply empty and all eight fall back to icons.
  const proofs = await loadProofs();
  const walled = WALL
    .map((label) => ITEMS.find((item) => item.label === label))
    .filter((item) => item && proofs[item.label]);
  const wallLabels = new Set(walled.map((item) => item.label));
  if (wall && walled.length) renderWall(wall, walled, proofs);

  if (walled.length) {
    const more = doc.createElement("p");
    more.className = "finder-more";
    more.textContent = `${ITEMS.length - walled.length} more need the live web, a model, or a file of your own. Double click one.`;
    body.before(more);
  }

  ITEMS.filter((item) => !wallLabels.has(item.label)).forEach((item) => {
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
