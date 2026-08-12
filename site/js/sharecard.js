// Snapshot: compose a share card from the CURRENT ERA's real captured frame.
// No mockups. The desktop on the card is the desktop from the machine.

import { currentEra } from "./eras.js?v=20260814b";
import { frameSrc, machineManifest } from "./machine.js?v=20260814b";

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
  const classic = era.id === "classic" || era.id === "platinum";
  const font = classic ? "Chicago" : "'Helvetica Neue', Helvetica, sans-serif";
  const big = Math.round(Math.min(w * 0.055, h * 0.11));
  const line1 = "THE AI HAS A DESKTOP NOW.";
  const line2 = `${era.year} / ${era.label.toUpperCase()} / REAL SYSTEM CAPTURE`;
  ctx.font = `${classic ? "" : "700 "}${big}px ${font}`;
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
  ctx.font = `${classic ? "" : "700 "}${big}px ${font}`;
  ctx.fillText(line1, w / 2, py + plateH * 0.38);
  ctx.font = `${Math.round(big * 0.36)}px ${classic ? "Chicago_12, Chicago" : font}`;
  ctx.fillText(line2, w / 2, py + plateH * 0.76);

  return canvas;
}

export function initShareCard(button) {
  button.addEventListener("click", async () => {
    if (!machineManifest()) return;
    const era = currentEra();
    const wide = await drawShareCard(1200, 630);
    const square = await drawShareCard(1080, 1080);

    let panel = document.getElementById("snapshot-panel");
    if (panel) panel.remove();
    panel = document.createElement("div");
    panel.id = "snapshot-panel";
    panel.className = "mini-window snapshot-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Snapshot ready");
    panel.innerHTML = `
      <header class="tbar mini-tbar">
        <button type="button" class="close-box mw-close" aria-label="Close snapshot"></button>
        <h3>Snapshot: ${era.label}</h3>
      </header>
      <div class="mini-wbody snapshot-body">
        <div class="snapshot-preview"></div>
        <p class="btn-row snapshot-actions">
          <a class="btn" download="ai-system-6-${era.id}-1200x630.png">Save 1200 × 630</a>
          <a class="btn" download="ai-system-6-${era.id}-1080x1080.png">Save 1080 × 1080</a>
        </p>
      </div>`;
    panel.querySelector(".snapshot-preview").appendChild(wide);
    const [a, b] = panel.querySelectorAll("a.btn");
    wide.toBlob((blob) => { if (blob) a.href = URL.createObjectURL(blob); }, "image/png");
    square.toBlob((blob) => { if (blob) b.href = URL.createObjectURL(blob); }, "image/png");
    button.closest(".scene").appendChild(panel);
    panel.querySelector(".mw-close").addEventListener("click", () => { panel.remove(); button.focus(); });
    panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { panel.remove(); button.focus(); } });
    panel.querySelector(".mw-close").focus();
  });
}
