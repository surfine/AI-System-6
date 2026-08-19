// The forty-year dissolve.
//
// Site 3.0 swapped one captured frame for another. This is the same six real
// captures, but stacked and cross-faded on a continuous 1988-to-2026 axis:
// one desk, dissolving through four decades under the visitor's own hand.
// The page chrome follows the nearest era, so the whole document ages with
// the photograph.

import { ERAS, setEra, currentEra, fontLabel, onEraChange } from "./eras.js?v=20260814i";
import { frameSrc, machineManifest } from "./machine.js?v=20260814i";

const doc = document;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Positions on the axis, spaced by real years so the dissolve spends its
// time the way history did: a long crawl through the nineties, then a rush.
const SPAN = { first: ERAS[0].year, last: ERAS[ERAS.length - 1].year };
const stops = ERAS.map((era) => ({
  era,
  t: (era.year - SPAN.first) / (SPAN.last - SPAN.first),
}));

function lerp(a, b, k) {
  return a + (b - a) * k;
}

// Which two frames straddle position t, and how far between them we are.
function blendAt(t) {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (clamped <= b.t || i === stops.length - 2) {
      const span = b.t - a.t;
      const k = span > 0 ? (clamped - a.t) / span : 0;
      return { a: a.era, b: b.era, k: Math.max(0, Math.min(1, k)) };
    }
  }
  return { a: stops[0].era, b: stops[1].era, k: 0 };
}

// The crossover is squeezed into the middle sixth of each gap, so a frame is
// legible for most of the travel and the ghosted overlap flicks past.
function sharpen(k) {
  const band = 0.16;
  const edge = (1 - band) / 2;
  if (k <= edge) return 0;
  if (k >= 1 - edge) return 1;
  const local = (k - edge) / band;
  return local * local * (3 - 2 * local);
}

function nearestEra(t) {
  const { a, b, k } = blendAt(t);
  return k < 0.5 ? a : b;
}

export function createDissolve(container, opts = {}) {
  const manifest = machineManifest();
  if (!manifest) return null;
  const aspect = manifest.viewport.width / manifest.viewport.height;

  container.classList.add("dissolve");

  // Screen and controls are one machine, not three things stacked on the desk.
  // Before this shell existed, the capture ended in a hard seam and the year
  // and the slider floated on whatever the era gradient happened to be doing
  // down there, which in Liquid Glass is its muddiest gray.
  const shell = doc.createElement("div");
  shell.className = "dissolve-shell";

  const port = doc.createElement("div");
  port.className = "dissolve-port";
  port.style.setProperty("--dissolve-aspect", `${aspect.toFixed(4)} / 1`);

  // All six captures, stacked. Only the two straddling frames are ever
  // visible, so the browser composites two layers, never six.
  const layers = ERAS.map((era, index) => {
    const img = doc.createElement("img");
    img.className = "dissolve-layer";
    img.dataset.era = era.id;
    img.decoding = "async";
    img.src = frameSrc(era.id);
    img.alt = index === 0
      ? "One AI System 6 desktop, captured from the real app, dissolving from its 1988 System 6 appearance to 2026 Liquid Glass. The windows, the manuscript, and the files never move."
      : "";
    if (index > 0) img.setAttribute("aria-hidden", "true");
    img.style.opacity = index === 0 ? "1" : "0";
    port.appendChild(img);
    return img;
  });

  // The readout is a type specimen. The year is digits, and digits look the
  // same in every typeface, so the era name carries the letterforms at a size
  // you can actually read them at, and the panel says which face it is.
  const readout = doc.createElement("p");
  readout.className = "dissolve-readout";
  readout.innerHTML = `<span class="dissolve-year">1988</span>`
    + `<span class="dissolve-era">System 6</span>`
    + `<span class="dissolve-role">The claim</span>`
    + `<span class="dissolve-font">Set in Chicago</span>`;
  const yearEl = readout.querySelector(".dissolve-year");
  const eraEl = readout.querySelector(".dissolve-era");
  // Each stop on the axis has a job in the argument. Naming it here is what
  // keeps the drag from reading as a theme picker.
  const roleEl = readout.querySelector(".dissolve-role");
  const fontEl = readout.querySelector(".dissolve-font");

  const panel = doc.createElement("div");
  panel.className = "dissolve-panel";
  panel.appendChild(readout);

  // The visitor's handle. A native range keeps the keyboard and screen
  // reader story honest; the thumb is the only thing the page invents.
  const rail = doc.createElement("div");
  rail.className = "dissolve-rail";
  const range = doc.createElement("input");
  range.type = "range";
  range.className = "dissolve-range";
  range.min = "0";
  range.max = "1000";
  range.step = "1";
  range.value = "0";
  range.setAttribute("aria-label", "Drag from 1988 to 2026");
  range.setAttribute("aria-valuetext", "1988, System 6");
  const ticks = doc.createElement("div");
  ticks.className = "dissolve-ticks";
  stops.forEach(({ era, t }) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "dissolve-tick";
    b.style.setProperty("--t", String(t));
    b.dataset.era = era.id;
    b.innerHTML = `<span class="dissolve-tick-year">${era.year}</span>`;
    // The tick knows why its year is on the axis, so the visitor who hovers
    // one gets the argument, not just a label.
    b.title = `${era.label}: ${era.claim}`;
    b.setAttribute("aria-label", `${era.year} ${era.label}. ${era.claim}`);
    b.addEventListener("click", () => {
      stopDrift();
      setPosition(t, true);
    });
    ticks.appendChild(b);
  });
  rail.appendChild(range);
  rail.appendChild(ticks);
  panel.appendChild(rail);
  shell.appendChild(port);
  shell.appendChild(panel);
  container.appendChild(shell);

  let position = 0;
  let drifting = null;

  function paint(t) {
    const { a, b, k } = blendAt(t);
    for (const img of layers) {
      const id = img.dataset.era;
      img.style.opacity = id === b.id ? String(sharpen(k)) : id === a.id ? "1" : "0";
    }
    const near = nearestEra(t);
    const year = near.year;
    yearEl.textContent = String(year);
    eraEl.textContent = near.label;
    roleEl.textContent = near.role;
    const face = fontLabel(near);
    fontEl.textContent = `Set in ${face}`;
    range.setAttribute("aria-valuetext", `${year}, ${near.label}, ${near.role}, set in ${face}`);
    ticks.querySelectorAll(".dissolve-tick").forEach((tick) =>
      tick.classList.toggle("is-near", tick.dataset.era === near.id));
    // The document itself ages with the photograph.
    if (near.id !== currentEra().id) setEra(near.id, false);
  }

  function setPosition(t, moveThumb) {
    position = Math.max(0, Math.min(1, t));
    if (moveThumb) range.value = String(Math.round(position * 1000));
    paint(position);
  }

  range.addEventListener("input", () => {
    stopDrift();
    setPosition(Number(range.value) / 1000, false);
  });
  range.addEventListener("pointerdown", stopDrift);
  const settle = () => {
    const near = nearestEra(position);
    const stop = stops.find((s) => s.era.id === near.id);
    if (stop) setPosition(stop.t, true);
  };
  range.addEventListener("change", settle);
  range.addEventListener("pointerup", settle);

  // The readout names the face the visitor is really reading, and the hosted
  // ones land after first paint. Repaint when the era engine says so, or the
  // specimen keeps announcing whichever fallback was installed at load.
  onEraChange(() => paint(position));

  // Let the machine play itself once, so a visitor who touches nothing still
  // sees the whole span. Any input takes the controls for good.
  function drift() {
    if (reducedMotion || opts.autoplay === false) return;
    const hold = 1100;
    const cross = 520;
    let index = 0;
    const ready = (era) => {
      const img = layers.find((l) => l.dataset.era === era.id);
      return !!img && img.complete && img.naturalWidth > 0;
    };
    const step = () => {
      if (index >= stops.length - 1) { drifting = null; return; }
      const from = stops[index].t;
      const to = stops[index + 1].t;
      if (!ready(stops[index + 1].era)) {
        drifting = setTimeout(step, 250);
        return;
      }
      const started = performance.now();
      drifting = requestAnimationFrame(function frame(now) {
        const k = Math.min(1, (now - started) / cross);
        setPosition(lerp(from, to, k), true);
        if (k < 1) { drifting = requestAnimationFrame(frame); return; }
        index += 1;
        drifting = setTimeout(step, hold);
      });
    };
    drifting = setTimeout(step, 900);
  }
  function cancelDrift() {
    if (!drifting) return;
    cancelAnimationFrame(drifting);
    clearTimeout(drifting);
    drifting = null;
  }
  function stopDrift() { cancelDrift(); }

  container.addEventListener("pointerdown", stopDrift, { once: true });

  setPosition(0, true);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        drift();
      });
    }, { threshold: 0.45 });
    io.observe(container);
  } else {
    drift();
  }

  return {
    setPosition,
    stopDrift,
    get position() { return position; },
  };
}
