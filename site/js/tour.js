// The desk tour: one real capture, and a camera that walks across it as the
// reader scrolls, the way a product page walks you round a device.
//
// Nothing here is drawn. The stage is the same captured frame the hero
// dissolves through, in whatever era the page is wearing, and each step names
// a window rect from the capture manifest. The camera is a transform on that
// one image; the spotlight is a hole cut in a dimming layer over the real
// pixels, so it annotates the photograph instead of replacing it.

import { currentEra, onEraChange } from "./eras.js?v=20260820a";
import { frameSrc, regionRect } from "./machine.js?v=20260820a";
import { L } from "./copy.js?v=20260820a";

const doc = document;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// How much of the port a window may fill, and how far the camera may lean in.
// Past about 2.6x the 2x capture starts to go soft, so the camera stops there.
const FILL = 0.84;
const MAX_ZOOM = 2.6;

function camera(r) {
  const s = Math.max(1, Math.min(MAX_ZOOM, FILL / r.w, FILL / r.h));
  const clamp = (t) => Math.min(0, Math.max(1 / s - 1, t));
  // scale(s) translate(t): a frame point p lands at s * (p + t). Centre the
  // window, then clamp so the desk never shows an edge past the capture.
  const tx = clamp(0.5 / s - (r.x + r.w / 2));
  const ty = clamp(0.5 / s - (r.y + r.h / 2));
  return { s, tx, ty };
}

export function initTour(section) {
  if (!section) return;
  const stage = section.querySelector("#tour-stage");
  const steps = [...section.querySelectorAll(".tour-step")];
  if (!stage || !steps.length) return;

  stage.innerHTML = "";
  const port = doc.createElement("div");
  port.className = "tour-port";
  const img = doc.createElement("img");
  img.className = "tour-frame";
  img.decoding = "async";
  img.alt = L(
    "The AI System 6 desktop, captured from the real app. The camera moves to the window each step describes.",
    "拍摄自真实应用的 AI System 6 桌面。镜头会移到每一步说的那扇窗口。",
  );
  const spot = doc.createElement("div");
  spot.className = "tour-spot";
  spot.setAttribute("aria-hidden", "true");
  port.append(img, spot);
  stage.appendChild(port);

  const setFrame = () => {
    const src = frameSrc(currentEra().id);
    if (img.getAttribute("src") !== src) img.src = src;
  };
  setFrame();
  onEraChange(setFrame);

  let active = -1;
  function go(index) {
    if (index === active) return;
    active = index;
    steps.forEach((step, i) => step.classList.toggle("is-active", i === index));
    const r = regionRect(steps[index].dataset.region);
    const { s, tx, ty } = camera(r);
    img.style.transform = `scale(${s.toFixed(4)}) translate(${(tx * 100).toFixed(3)}%, ${(ty * 100).toFixed(3)}%)`;
    // The spotlight sits where the window lands after the camera moves.
    const pad = 0.006;
    spot.style.left = `${(s * (r.x - pad + tx) * 100).toFixed(3)}%`;
    spot.style.top = `${(s * (r.y - pad * 1.6 + ty) * 100).toFixed(3)}%`;
    spot.style.width = `${(s * (r.w + pad * 2) * 100).toFixed(3)}%`;
    spot.style.height = `${(s * (r.h + pad * 3.2) * 100).toFixed(3)}%`;
  }

  // A step is current while it crosses the middle band of the viewport. The
  // band, not a threshold, so scrolling back up hands the camera back cleanly.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) go(steps.indexOf(entry.target));
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach((step) => io.observe(step));
  }
  // Tapping a step moves the camera too: on a phone the steps are the controls.
  steps.forEach((step, i) => {
    step.tabIndex = 0;
    step.addEventListener("click", () => go(i));
    step.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(i); }
    });
  });

  section.classList.add("tour-ready");
  if (reducedMotion) section.classList.add("tour-still");
  go(0);
}
