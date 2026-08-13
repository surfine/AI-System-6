// Snapshot: compose a share card from the CURRENT ERA's real captured frame.
// No mockups. The desktop on the card is the desktop from the machine.

import { currentEra, onEraChange } from "./eras.js?v=20260814h";
import { frameSrc, machineManifest } from "./machine.js?v=20260814h";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function drawShareCard(w, h) {
  const era = currentEra();
  const frame = await loadImage(frameSrc(era.id));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  await document.fonts.ready;

  // The real frame, cover-fit, anchored to the top (menu bar stays visible).
  const scale = Math.max(w / frame.width, h / frame.height);
  const dw = frame.width * scale;
  const dh = frame.height * scale;
  ctx.drawImage(frame, (w - dw) / 2, 0, dw, dh);

  // Headline plate, System 6 style: white plate, black border, hard shadow.
  // The card wears the face of its era, and site.css already holds the one
  // researched stack per era. Read it from the document instead of keeping a
  // second copy here, which is how Platinum ended up sharing Chicago.
  const tokens = getComputedStyle(document.documentElement);
  const stack = (name, fallback) => tokens.getPropertyValue(name).trim() || fallback;
  const display = stack("--display-font", "Chicago");
  const small = stack("--site-font", stack("--ui-font", display));
  // Chicago is a bitmap face with no bold; the later system faces have one.
  const classic = era.id === "classic";
  // If the canvas cannot parse a stack, ctx.font keeps its old value and the
  // plate draws at 10px. Set the font, then make sure the size took.
  const setFont = (size, families) => {
    const spec = `${classic ? "" : "700 "}${size}px ${families}`;
    ctx.font = spec;
    if (!ctx.font.includes(`${size}px`)) ctx.font = `${classic ? "" : "700 "}${size}px sans-serif`;
  };
  const big = Math.round(Math.min(w * 0.055, h * 0.11));
  const line1 = "THE AI HAS A DESKTOP NOW.";
  const line2 = `${era.year} / ${era.label.toUpperCase()} / REAL SYSTEM CAPTURE`;
  setFont(big, display);
  const tw = ctx.measureText(line1).width;
  const plateW = Math.min(w * 0.92, tw + big * 1.6);
  const plateH = big * 2.6;
  const px = (w - plateW) / 2;
  const py = h - plateH - h * 0.07;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(px + 8, py + 8, plateW, plateH);
  ctx.fillStyle = "#fff";
  ctx.fillRect(px, py, plateW, plateH);
  ctx.lineWidth = Math.max(3, w * 0.003);
  ctx.strokeStyle = "#000";
  ctx.strokeRect(px, py, plateW, plateH);
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  setFont(big, display);
  ctx.fillText(line1, w / 2, py + plateH * 0.38);
  setFont(Math.round(big * 0.36), small);
  ctx.fillText(line2, w / 2, py + plateH * 0.76);

  return canvas;
}

export function initShareCard(button) {
  if (!button) return;
  const label = button.querySelector(".snapshot-label") || button;

  // The button wears the year you are standing on, so the card is visibly
  // yours before you press it.
  function syncLabel() {
    label.textContent = `Snapshot ${currentEra().year}`;
  }
  syncLabel();
  onEraChange(syncLabel);

  button.addEventListener("click", async () => {
    if (!machineManifest()) return;
    const era = currentEra();
    button.disabled = true;
    label.textContent = "Developing\u2026";
    try {
      const wide = await drawShareCard(1200, 630);
      // One press, one file: the download starts without a second decision.
      const blob = await new Promise((r) => wide.toBlob(r, "image/png"));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai-system-6-${era.year}-${era.id}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 20000);
      showPanel(button, era, wide);
    } finally {
      button.disabled = false;
      syncLabel();
    }
  });
}

// The card that just downloaded, shown once so the visitor sees what they got
// and can take the square crop for a feed that wants one.
function showPanel(button, era, wide) {
  let panel = document.getElementById("snapshot-panel");
  if (panel) panel.remove();
  panel = document.createElement("div");
  panel.id = "snapshot-panel";
  panel.className = "mini-window snapshot-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", `Snapshot saved: ${era.year} ${era.label}`);
  panel.innerHTML = `
    <header class="tbar mini-tbar">
      <button type="button" class="close-box mw-close" aria-label="Close snapshot"></button>
      <h3>Saved: ${era.year} ${era.label}</h3>
    </header>
    <div class="mini-wbody snapshot-body">
      <div class="snapshot-preview"></div>
      <p class="btn-row snapshot-actions">
        <a class="btn" id="snapshot-square" download="ai-system-6-${era.year}-square.png">Also Save Square</a>
      </p>
      <p class="mw-status">Saved to your downloads. Every pixel is a real system capture.</p>
    </div>`;
  panel.querySelector(".snapshot-preview").appendChild(wide);
  button.closest("section, header").appendChild(panel);
  const close = panel.querySelector(".mw-close");
  close.addEventListener("click", () => { panel.remove(); button.focus(); });
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { panel.remove(); button.focus(); } });
  close.focus();

  drawShareCard(1080, 1080).then((square) => {
    square.toBlob((blob) => {
      if (blob) panel.querySelector("#snapshot-square").href = URL.createObjectURL(blob);
    }, "image/png");
  });
}
