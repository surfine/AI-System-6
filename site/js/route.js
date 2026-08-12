// The route, performed by the product's own objects:
// File Floppy → Scrapbook → DocMap → TeachText → Review Desk → Project CD.
// A document chip physically travels the stations. No model calls — this is
// choreography of the real object relationships.

import { iconImg } from "./eras.js?v=20260813a";

const doc = document;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const STATIONS = [
  { id: "fileFloppy", label: "File Floppy", balloon: "Sources go in here. Temporary on purpose.", state: "source.txt" },
  { id: "scrapbook", label: "Scrapbook", balloon: "A clipped passage lands. Only what you chose.", state: "“ebb and flood” clipped" },
  { id: "docMap", label: "DocMap", balloon: "The clip joins the map.", state: "linked to “tides”" },
  { id: "teachText", label: "TeachText", balloon: "A draft appears in the manuscript.", state: "draft ¶2 written" },
  { id: "reviewDesk", label: "Review Desk", balloon: "Facts and voice, checked.", state: "2 checks passed" },
  { id: "projectDisc", label: "Project CD", balloon: "The finished file is yours.", state: "exported ✓" },
];

export function initRouteScene(stage) {
  stage.innerHTML = `
    <div class="route-belt" id="route-belt"></div>
    <p class="route-controls">
      <button type="button" class="btn" id="route-run">&#9654;&#xFE0E; Run the Route</button>
      <span class="route-caption" id="route-caption" role="status">Drag the file onto the Scrapbook — or press Run.</span>
    </p>`;
  const belt = stage.querySelector("#route-belt");

  const nodes = STATIONS.map((st, i) => {
    const cell = doc.createElement("div");
    cell.className = "route-cell";
    cell.dataset.station = st.id;
    const fig = doc.createElement("figure");
    fig.className = "route-obj";
    fig.setAttribute("data-balloon", st.balloon);
    fig.appendChild(iconImg(st.id, 32));
    const cap = doc.createElement("figcaption");
    cap.textContent = st.label;
    fig.appendChild(cap);
    const state = doc.createElement("span");
    state.className = "route-state";
    state.textContent = st.state;
    cell.appendChild(fig);
    cell.appendChild(state);
    belt.appendChild(cell);
    if (i < STATIONS.length - 1) {
      const arrow = doc.createElement("span");
      arrow.className = "route-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      belt.appendChild(arrow);
    }
    return cell;
  });

  // The traveling document chip.
  const chip = doc.createElement("button");
  chip.type = "button";
  chip.className = "route-chip";
  chip.setAttribute("aria-label", "source.txt — drag onto the Scrapbook, or press Enter to run the route");
  chip.appendChild(iconImg("document", 32));
  const chipLabel = doc.createElement("span");
  chipLabel.textContent = "source.txt";
  chip.appendChild(chipLabel);
  nodes[0].appendChild(chip);

  const caption = stage.querySelector("#route-caption");
  const runBtn = stage.querySelector("#route-run");
  let running = false;
  let doneOnce = false;

  function placeChip(i, animate) {
    const cell = nodes[i];
    const beltRect = belt.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();
    chip.style.transition = animate && !reducedMotion ? "transform 0.45s steps(6, end)" : "none";
    chip.style.transform = `translate(${rect.left - beltRect.left + rect.width / 2 - 24}px, -6px)`;
  }

  function activate(i) {
    nodes.forEach((cell, j) => {
      cell.classList.toggle("route-done", j < i);
      cell.classList.toggle("route-active", j === i);
    });
    caption.textContent = STATIONS[i].label + " — " + STATIONS[i].state;
  }

  async function run(fromStep) {
    if (running) return;
    running = true;
    runBtn.disabled = true;
    chip.classList.add("route-chip-running");
    belt.classList.add("route-running");
    const wait = (ms) => new Promise((r) => setTimeout(r, reducedMotion ? 40 : ms));
    for (let i = fromStep; i < STATIONS.length; i++) {
      placeChip(i, i > fromStep || fromStep > 0);
      activate(i);
      await wait(i === 0 ? 500 : 950);
    }
    caption.textContent = "Done. A file you can keep — nothing kept itself.";
    nodes[STATIONS.length - 1].classList.add("route-done", "route-burn");
    running = false;
    doneOnce = true;
    runBtn.disabled = false;
    runBtn.innerHTML = "&#8634;&#xFE0E; Run It Again";
  }

  function reset() {
    nodes.forEach((c) => c.classList.remove("route-done", "route-active", "route-burn"));
    placeChip(0, false);
  }

  runBtn.addEventListener("click", () => { if (!running) { reset(); requestAnimationFrame(() => run(0)); } });
  chip.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && !running) { e.preventDefault(); reset(); run(0); }
  });

  // Manual first hop: drag the chip; dropping on (or past) the Scrapbook
  // starts the cascade from there.
  chip.addEventListener("pointerdown", (e) => {
    if (running || e.button !== 0) return;
    e.preventDefault();
    chip.setPointerCapture(e.pointerId);
    chip.classList.add("dragging");
    const base = chip.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const move = (ev) => {
      chip.style.transition = "none";
      chip.style.transform = `translate(${base.left - belt.getBoundingClientRect().left + ev.clientX - startX}px, ${ev.clientY - startY - 6}px)`;
      const s = nodes[1].getBoundingClientRect();
      nodes[1].classList.toggle("route-drop-target", ev.clientX > s.left - 16 && ev.clientX < s.right + 16 && ev.clientY > s.top - 20 && ev.clientY < s.bottom + 20);
    };
    const up = (ev) => {
      chip.removeEventListener("pointermove", move);
      chip.removeEventListener("pointerup", up);
      chip.removeEventListener("pointercancel", up);
      chip.classList.remove("dragging");
      const hit = nodes[1].classList.contains("route-drop-target");
      nodes[1].classList.remove("route-drop-target");
      if (hit && ev.type === "pointerup") {
        run(1);
      } else {
        placeChip(doneOnce ? STATIONS.length - 1 : 0, false);
      }
    };
    chip.addEventListener("pointermove", move);
    chip.addEventListener("pointerup", up);
    chip.addEventListener("pointercancel", up);
  });

  placeChip(0, false);
  activate(0);
  caption.textContent = "Drag the file onto the Scrapbook — or press Run.";
  addEventListener("resize", () => { if (!running) placeChip(doneOnce ? STATIONS.length - 1 : 0, false); });
}
