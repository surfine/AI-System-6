// Snapshot: draw a share card of the current era on a canvas and hand it
// over as a PNG. Fixed poster composition — not a cropped page screenshot.

import { ERAS, currentEra, iconSrc } from "./eras.js?v=20260813d";

// Card palettes mirror the era tokens in site.css, reduced to flat paint.
const CARD_STYLES = {
  classic: { deskA: "#ffffff", deskB: null, ink: "#000", paper: "#fff", font: "Chicago", dither: true },
  platinum: { deskA: "#666a6e", deskB: "#585c60", ink: "#111", paper: "#ddd", font: "Charcoal, Helvetica" },
  aqua: { deskA: "#7db2e8", deskB: "#274d8f", ink: "#0d2b57", paper: "#f2f6fc", font: "'Lucida Grande', Helvetica" },
  "snow-leopard": { deskA: "#4a5f80", deskB: "#131c2b", ink: "#16202e", paper: "#ececec", font: "'Lucida Grande', Helvetica" },
  yosemite: { deskA: "#b06ab3", deskB: "#4568dc", ink: "#222", paper: "#fafafa", font: "'Helvetica Neue', Helvetica" },
  "liquid-glass": { deskA: "#f6d5c3", deskB: "#9fb3cd", ink: "#1c2733", paper: "rgba(255,255,255,0.82)", font: "'Helvetica Neue', Helvetica" },
};

const APP_ICONS = ["searcher", "reader", "scrapbook", "docMap", "teachText", "reviewDesk"];

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function drawShareCard(w, h) {
  const era = currentEra();
  const st = CARD_STYLES[era.id];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  await document.fonts.ready;

  // Desk.
  if (st.dither) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#000";
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillRect(x + ((y / 4) % 2) * 2, y, 2, 2);
      }
    }
  } else {
    const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
    g.addColorStop(0, st.deskA);
    g.addColorStop(1, st.deskB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Poster window.
  const pad = Math.round(w * 0.055);
  const winX = pad, winY = pad, winW = w - pad * 2, winH = h - pad * 2;
  const round = era.id === "classic" ? 0 : era.id === "platinum" ? 4 : Math.min(18, w * 0.016);
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(winX, winY, winW, winH, round); else ctx.rect(winX, winY, winW, winH);
  ctx.fillStyle = st.paper;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = era.id === "classic" ? 0 : 30;
  ctx.shadowOffsetY = era.id === "classic" ? 0 : 12;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = era.id === "classic" ? 3 : 1;
  ctx.strokeStyle = era.id === "classic" ? "#000" : "rgba(0,0,0,0.3)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(winX, winY, winW, winH, round); else ctx.rect(winX, winY, winW, winH);
  ctx.stroke();

  // Title bar.
  const tbarH = Math.round(h * 0.075);
  ctx.save();
  ctx.beginPath();
  ctx.rect(winX, winY, winW, tbarH);
  ctx.clip();
  if (era.id === "classic") {
    ctx.fillStyle = "#000";
    for (let y = winY + 6; y < winY + tbarH - 4; y += 6) ctx.fillRect(winX + 8, y, winW - 16, 2);
    ctx.fillStyle = "#fff";
    const title = "AI System 6";
    ctx.font = `${Math.round(tbarH * 0.5)}px ${st.font}, monospace`;
    const tw = ctx.measureText(title).width;
    ctx.fillRect(w / 2 - tw / 2 - 18, winY, tw + 36, tbarH);
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, w / 2, winY + tbarH / 2 + 2);
  } else {
    const g = ctx.createLinearGradient(0, winY, 0, winY + tbarH);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(0,0,0,0.08)");
    ctx.fillStyle = g;
    ctx.fillRect(winX, winY, winW, tbarH);
    ctx.fillStyle = st.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${Math.round(tbarH * 0.42)}px ${st.font}, sans-serif`;
    ctx.fillText("AI System 6", w / 2, winY + tbarH / 2 + 1);
    const r = tbarH * 0.16;
    ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(winX + tbarH * 0.55 + i * r * 2.8, winY + tbarH / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    });
  }
  ctx.restore();

  // Headline.
  ctx.fillStyle = st.ink;
  ctx.textAlign = "center";
  const big = Math.round(Math.min(w * 0.082, h * 0.16));
  ctx.font = `${era.id === "classic" ? "" : "700 "}${big}px ${st.font}, sans-serif`;
  const cx = w / 2;
  const headY = winY + tbarH + winH * (h > w ? 0.16 : 0.20);
  ctx.fillText("THE AI HAS", cx, headY);
  ctx.fillText("A DESKTOP NOW.", cx, headY + big * 1.18);

  // Era line.
  ctx.font = `${Math.round(big * 0.42)}px ${st.font}, sans-serif`;
  ctx.fillText(`${era.year} — ${era.label.toUpperCase()}`, cx, headY + big * 2.15);

  // Icon row: the route, in this era's own art.
  const iconSize = Math.round(Math.min(w * 0.075, h * 0.16));
  const gap = iconSize * 0.55;
  const totalW = APP_ICONS.length * iconSize + (APP_ICONS.length - 1) * gap;
  let ix = cx - totalW / 2;
  const iy = winY + winH * (h > w ? 0.60 : 0.58);
  ctx.imageSmoothingEnabled = !(era.id === "classic" || era.id === "platinum");
  for (const name of APP_ICONS) {
    const img = await loadImage(iconSrc(name, era));
    if (img) ctx.drawImage(img, ix, iy, iconSize, iconSize);
    ix += iconSize + gap;
  }

  // Timeline.
  const tlY = iy + iconSize + winH * 0.12;
  const tlX1 = winX + winW * 0.14, tlX2 = winX + winW * 0.86;
  ctx.strokeStyle = st.ink;
  ctx.lineWidth = Math.max(2, w * 0.0025);
  ctx.beginPath();
  ctx.moveTo(tlX1, tlY);
  ctx.lineTo(tlX2, tlY);
  ctx.stroke();
  const idx = ERAS.indexOf(era);
  ERAS.forEach((e, i) => {
    const x = tlX1 + ((tlX2 - tlX1) * i) / (ERAS.length - 1);
    ctx.beginPath();
    ctx.arc(x, tlY, i === idx ? w * 0.008 : w * 0.004, 0, Math.PI * 2);
    ctx.fillStyle = st.ink;
    ctx.fill();
  });
  ctx.font = `${Math.round(big * 0.34)}px ${st.font}, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("1988", tlX1 - w * 0.005, tlY + big * 0.75);
  ctx.textAlign = "right";
  ctx.fillText("2026", tlX2 + w * 0.005, tlY + big * 0.75);
  ctx.textAlign = "center";
  ctx.font = `${Math.round(big * 0.36)}px ${st.font}, sans-serif`;
  ctx.fillText("aisystem6.pages.dev — LIVE SYSTEM", cx, winY + winH - big * 0.55);

  return canvas;
}

export function initShareCard(button) {
  button.addEventListener("click", async () => {
    const era = currentEra();
    const canvas = await drawShareCard(1200, 630);
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
        <h3>Snapshot — ${era.label}</h3>
      </header>
      <div class="mini-wbody snapshot-body">
        <div class="snapshot-preview"></div>
        <p class="btn-row snapshot-actions">
          <a class="btn" download="ai-system-6-${era.id}-1200x630.png">Save 1200 × 630</a>
          <a class="btn" download="ai-system-6-${era.id}-1080x1080.png">Save 1080 × 1080</a>
        </p>
      </div>`;
    panel.querySelector(".snapshot-preview").appendChild(canvas);
    const [a, b] = panel.querySelectorAll("a.btn");
    canvas.toBlob((blob) => { if (blob) a.href = URL.createObjectURL(blob); }, "image/png");
    square.toBlob((blob) => { if (blob) b.href = URL.createObjectURL(blob); }, "image/png");
    button.closest(".scene").appendChild(panel);
    panel.querySelector(".mw-close").addEventListener("click", () => { panel.remove(); button.focus(); });
    panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { panel.remove(); button.focus(); } });
    panel.querySelector(".mw-close").focus();
  });
}
