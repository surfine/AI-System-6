// The machine: every product pixel on this site comes from these frames,
// captured from the real app by tooling/capture-site-frames.mjs. One desk,
// six release appearances, pixel-aligned. Each viewer instance is a viewport
// onto the same frame: full desk, one window, or one icon.

import { currentEra, onEraChange } from "./eras.js?v=20260814b";

const doc = document;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const BASE = "img/frames/";

let manifest = null;
const warmed = new Set();
const viewers = [];

export async function loadMachine() {
  const res = await fetch(BASE + "manifest.json?v=20260814b");
  if (!res.ok) throw new Error(`machine manifest returned ${res.status}`);
  manifest = await res.json();
  if (!manifest?.viewport?.width || !manifest?.viewport?.height || !manifest?.files) {
    throw new Error("machine manifest is incomplete");
  }
  return manifest;
}

export function machineManifest() {
  return manifest;
}

export function frameSrc(eraId) {
  return BASE + manifest.files[eraId];
}

function warmFrame(eraId) {
  if (!manifest || warmed.has(eraId)) return Promise.resolve();
  warmed.add(eraId);
  return new Promise((resolve) => {
    const img = new Image();
    img.addEventListener("load", resolve, { once: true });
    img.addEventListener("error", resolve, { once: true });
    img.src = frameSrc(eraId);
  });
}

export function warmAllFrames() {
  if (!manifest) return;
  const ids = Object.keys(manifest.files);
  const current = ids.indexOf(currentEra().id);
  const order = ids
    .map((id, index) => ({ id, index }))
    .filter(({ index }) => index !== current)
    .sort((left, right) => Math.abs(left.index - current) - Math.abs(right.index - current));
  let step = 0;
  const schedule = (fn) => (window.requestIdleCallback || ((callback) => setTimeout(callback, 800)))(fn);
  const next = () => {
    if (step >= order.length) return;
    warmFrame(order[step++].id).then(() => schedule(next));
  };
  schedule(next);
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
  const error = doc.createElement("p");
  error.className = "machine-error";
  error.setAttribute("role", "status");
  error.hidden = true;
  error.textContent = "This desktop capture could not be loaded. Try the Live System instead.";
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
  container.appendChild(error);

  const state = {
    era: currentEra().id,
    region: padRect(regionRect(opts.region), opts.pad),
    loadId: 0,
  };

  function apply() {
    const r = state.region;
    // The port keeps the region's own aspect; the frame is scaled so the
    // region fills the port exactly.
    port.style.setProperty("--machine-aspect", `${(r.w * frameAspect).toFixed(4)} / ${r.h.toFixed(4)}`);
    const scale = 1 / r.w;
    port.style.setProperty(
      "--machine-transform",
      `scale(${scale.toFixed(4)}) translate(${(-r.x * 100).toFixed(3)}%, ${(-r.y * 100).toFixed(3)}%)`,
    );
  }

  function setEraFrame(eraId, animate) {
    if (imgA.dataset.era === eraId) return;
    const loadId = ++state.loadId;
    error.hidden = true;
    container.classList.remove("machine-has-error");
    if (animate && !reducedMotion && imgA.src) {
      imgB.src = imgA.src;
      imgB.dataset.era = imgA.dataset.era || "";
    }
    imgA.classList.add("is-loading");
    imgA.dataset.era = eraId;
    let settled = false;

    const reveal = () => {
      if (settled || loadId !== state.loadId) return;
      settled = true;
      requestAnimationFrame(() => imgA.classList.remove("is-loading"));
    };
    const fail = () => {
      if (settled || loadId !== state.loadId) return;
      settled = true;
      imgA.classList.remove("is-loading");
      container.classList.add("machine-has-error");
      error.hidden = false;
    };
    imgA.addEventListener("error", fail, { once: true });
    imgA.addEventListener("load", reveal, { once: true });
    imgA.src = frameSrc(eraId);
    if (imgA.complete) {
      if (imgA.naturalWidth) reveal();
      else fail();
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
