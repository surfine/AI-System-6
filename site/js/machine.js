// The machine: every product pixel on this site comes from these frames,
// captured from the real app by tooling/capture-site-frames.mjs. One desk,
// six release appearances, pixel-aligned. Each viewer instance is a viewport
// onto the same frame — full desk, one window, or one icon.

import { currentEra, onEraChange } from "./eras.js?v=20260814a";

const doc = document;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const BASE = "img/frames/";

let manifest = null;
const warmed = new Set();
const viewers = [];

export async function loadMachine() {
  const res = await fetch(BASE + "manifest.json?v=20260814a");
  manifest = await res.json();
  return manifest;
}

export function machineManifest() {
  return manifest;
}

export function frameSrc(eraId) {
  return BASE + manifest.files[eraId];
}

function warmFrame(eraId) {
  if (!manifest || warmed.has(eraId)) return;
  warmed.add(eraId);
  const img = new Image();
  img.src = frameSrc(eraId);
}

export function warmAllFrames() {
  if (!manifest) return;
  Object.keys(manifest.files).forEach(warmFrame);
}

// Region lookup: a window name, an icon label, "menuBar", or "full".
export function regionRect(name) {
  if (!manifest) return null;
  if (!name || name === "full") return { x: 0, y: 0, w: 1, h: 1 };
  const win = manifest.windows[name];
  if (win) return win;
  const icon = manifest.windows.icons && manifest.windows.icons[name];
  if (icon) return icon;
  if (name === "menuBar") return manifest.windows.menuBar;
  return { x: 0, y: 0, w: 1, h: 1 };
}

function padRect(r, pad) {
  const p = pad ?? 0.02;
  const x = Math.max(0, r.x - p);
  const y = Math.max(0, r.y - p);
  return {
    x, y,
    w: Math.min(1 - x, r.w + p * 2),
    h: Math.min(1 - y, r.h + p * 2),
  };
}

export function createMachine(container, opts = {}) {
  const frameAspect = manifest.viewport.width / manifest.viewport.height;
  container.classList.add("machine");

  const port = doc.createElement("div");
  port.className = "machine-port";
  const imgA = doc.createElement("img");
  const imgB = doc.createElement("img");
  for (const img of [imgA, imgB]) {
    img.className = "machine-frame";
    img.decoding = "async";
    img.alt = opts.alt ||
      "The AI System 6 desktop, captured from the real app: Searcher, ClioTalk, Scrapbook, TeachText, and Review Desk around one manuscript.";
  }
  imgB.classList.add("is-under");
  imgB.setAttribute("aria-hidden", "true");
  port.appendChild(imgB);
  port.appendChild(imgA);
  container.appendChild(port);

  const state = {
    era: currentEra().id,
    region: padRect(regionRect(opts.region), opts.pad),
  };

  function apply() {
    const r = state.region;
    // The port keeps the region's own aspect; the frame is scaled so the
    // region fills the port exactly.
    port.style.aspectRatio = `${(r.w * frameAspect).toFixed(4)} / ${r.h.toFixed(4)}`;
    const scale = 1 / r.w;
    for (const img of [imgA, imgB]) {
      img.style.transform = `scale(${scale.toFixed(4)}) translate(${(-r.x * 100).toFixed(3)}%, ${(-r.y * 100).toFixed(3)}%)`;
    }
  }

  function setEraFrame(eraId, animate) {
    if (imgA.dataset.era === eraId) return;
    if (animate && !reducedMotion && imgA.src) {
      imgB.src = imgA.src;
      imgB.dataset.era = imgA.dataset.era || "";
      imgA.style.transition = "none";
      imgA.style.opacity = "0";
      imgA.dataset.era = eraId;
      imgA.src = frameSrc(eraId);
      const reveal = () => {
        imgA.style.transition = "opacity 0.28s ease";
        imgA.style.opacity = "1";
      };
      if (imgA.complete) requestAnimationFrame(reveal);
      else imgA.onload = () => requestAnimationFrame(reveal);
    } else {
      imgA.dataset.era = eraId;
      imgA.src = frameSrc(eraId);
      imgA.style.opacity = "1";
    }
  }

  const api = {
    el: container,
    focus(name, pad) {
      state.region = padRect(regionRect(name), pad);
      apply();
    },
    refresh() {
      setEraFrame(currentEra().id, true);
    },
  };

  apply();
  setEraFrame(state.era, false);
  onEraChange((era) => setEraFrame(era.id, true));
  viewers.push(api);
  return api;
}
