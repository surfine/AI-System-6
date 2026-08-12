// Era timeline strip: drag the thumb (or click a year) and the whole page
// changes era in place. A native range input does the keyboard work.

import { ERAS, currentEra, setEra, onEraChange, prefetchEras } from "./eras.js?v=20260814b";

// The first touch of any strip warms the remaining eras, so the drag that
// follows does not pop in icon by icon.
let warmed = false;
function warmOnce() {
  if (warmed) return;
  warmed = true;
  prefetchEras();
}

export function buildEraStrip(container, opts) {
  const big = !!(opts && opts.big);
  const range = document.createElement("input");
  range.type = "range";
  range.min = 0;
  range.max = ERAS.length - 1;
  range.step = 1;
  range.value = ERAS.indexOf(currentEra());
  range.className = "era-range";
  range.setAttribute("aria-label", "Era: drag between 1988 and 2026");
  range.setAttribute("aria-valuetext", currentEra().label);

  const ticks = document.createElement("div");
  ticks.className = "era-ticks";
  ERAS.forEach((era, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "era-tick";
    b.dataset.era = era.id;
    b.innerHTML = big
      ? `<span class="era-tick-year">${era.year}</span><span class="era-tick-name">${era.label}</span>`
      : `<span class="era-tick-year">${era.year}</span>`;
    b.title = era.label;
    b.addEventListener("click", () => setEra(era.id, true));
    ticks.appendChild(b);
  });

  range.addEventListener("input", () => {
    const era = ERAS[Number(range.value)];
    if (era.id !== currentEra().id) setEra(era.id, true);
  });

  container.appendChild(range);
  container.appendChild(ticks);
  ["pointerenter", "touchstart", "focusin"].forEach((ev) =>
    container.addEventListener(ev, warmOnce, { once: false, passive: true }));

  onEraChange((era) => {
    range.value = ERAS.indexOf(era);
    range.setAttribute("aria-valuetext", era.label);
    ticks.querySelectorAll(".era-tick").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.era === era.id));
  });
  ticks.querySelector(`[data-era="${currentEra().id}"]`).classList.add("is-active");
}
