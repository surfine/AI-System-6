// The route, shown on the machine itself: each station is a real window or
// desk object in the captured frame. Selecting a station pans the viewer to
// that region of the real desktop.

import { iconImg } from "./eras.js?v=20260814h";

const doc = document;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const STATIONS = [
  { icon: "fileFloppy", label: "File Floppy", region: "File Floppy",
    note: "mounted, temporary" },
  { icon: "searcher", label: "Searcher", region: "findPath",
    note: "tidal power, 0 results yet" },
  { icon: "scrapbook", label: "Scrapbook", region: "scrapbook",
    note: "2 scraps, sources attached" },
  { icon: "teachText", label: "TeachText", region: "teachText",
    note: "79 words, 4 paragraphs, modified" },
  { icon: "reviewDesk", label: "Review Desk", region: "reviewDesk",
    note: "waiting: mark it Final first" },
  { icon: "hardDisk", label: "Project Hard Disk", region: "Project Hard Disk",
    note: "everything you chose to keep" },
];

export function initRouteScene(stage, machine) {
  stage.innerHTML = `
    <div class="route-belt" role="tablist" aria-label="The route, station by station"></div>
    <p class="route-controls">
      <button type="button" class="btn" id="route-run">&#9654;&#xFE0E; Walk the Route</button>
      <span class="route-caption" id="route-caption" role="status"></span>
    </p>`;
  const belt = stage.querySelector(".route-belt");
  const caption = stage.querySelector("#route-caption");
  const runBtn = stage.querySelector("#route-run");
  let walker = null;

  const buttons = STATIONS.map((st, i) => {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "route-obj";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", "false");
    btn.appendChild(iconImg(st.icon, 32));
    const cap = doc.createElement("span");
    cap.className = "route-obj-label";
    cap.textContent = st.label;
    btn.appendChild(cap);
    btn.addEventListener("click", () => { stopWalk(); select(i); });
    belt.appendChild(btn);
    if (i < STATIONS.length - 1) {
      const arrow = doc.createElement("span");
      arrow.className = "route-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      belt.appendChild(arrow);
    }
    return btn;
  });

  function select(i) {
    buttons.forEach((b, j) => {
      b.classList.toggle("is-active", j === i);
      b.setAttribute("aria-selected", String(j === i));
    });
    const st = STATIONS[i];
    machine?.focus(st.region, st.region === "teachText" ? 0.015 : 0.03);
    caption.textContent = st.label + ": " + st.note;
  }

  function stopWalk() {
    if (!walker) return;
    clearInterval(walker);
    walker = null;
    runBtn.innerHTML = "&#9654;&#xFE0E; Walk the Route";
  }

  runBtn.addEventListener("click", () => {
    if (walker) { stopWalk(); return; }
    let i = 0;
    select(i);
    runBtn.innerHTML = "&#9632;&#xFE0E; Stop";
    walker = setInterval(() => {
      i += 1;
      if (i >= STATIONS.length) { stopWalk(); return; }
      select(i);
    }, reducedMotion ? 2600 : 2000);
  });

  select(0);

  if ("IntersectionObserver" in window && !reducedMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        runBtn.click();
      });
    }, { threshold: 0.4 });
    io.observe(stage);
  }
}
