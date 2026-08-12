// Mini desktop engine: a lightweight display layer with the product's real
// objects. Not the app in an iframe — just enough DOM to drag a window,
// double-click an icon, and watch the eras change around the same work.

import { currentEra, iconImg } from "./eras.js?v=20260813a";
import { flashBalloon } from "./balloon.js?v=20260813a";

const doc = document;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- App registry: object name, balloon line, window content ------ */

export const APPS = {
  searcher: {
    title: "Searcher", icon: "searcher", w: 250,
    balloon: "Searches the live web. Keeps what you clip, drops the rest.",
    content: () => `
      <div class="mw-field" aria-hidden="true">tidal power &nbsp;<span class="mw-btn">Search</span></div>
      <ul class="mw-results">
        <li>Severn Estuary feasibility review</li>
        <li>La Rance: forty years of operation</li>
        <li>Turbine wear in salt water</li>
      </ul>
      <p class="mw-status">1 clipping &rarr; Scrapbook</p>`,
  },
  reader: {
    title: "Reader", icon: "reader", w: 250,
    balloon: "Opens the evidence. A reading surface, not a browser.",
    content: () => `
      <p class="mw-text">…the barrage generated power on <mark>both the ebb and the flood</mark>, a fact the 1966 engineers considered unremarkable…</p>
      <p class="mw-status">Selection &rarr; Clip</p>`,
  },
  scrapbook: {
    title: "Scrapbook", icon: "scrapbook", w: 240,
    balloon: "Keeps only the material you deliberately clip.",
    content: () => `
      <div class="mw-scrap">“both the ebb and the flood” — Reader, p.&nbsp;3</div>
      <p class="mw-status">Scrap 2 of 2</p>`,
  },
  docMap: {
    title: "DocMap", icon: "docMap", w: 250,
    balloon: "Turns research into a visible map of ideas.",
    content: () => `
      <svg class="mw-map" viewBox="0 0 200 90" aria-hidden="true">
        <line x1="40" y1="45" x2="105" y2="20"/><line x1="40" y1="45" x2="105" y2="70"/><line x1="105" y1="20" x2="170" y2="45"/><line x1="105" y1="70" x2="170" y2="45"/>
        <g><rect x="8" y="34" width="64" height="20"/><text x="40" y="48">tides</text></g>
        <g><rect x="78" y="9" width="56" height="20"/><text x="106" y="23">ebb</text></g>
        <g><rect x="78" y="59" width="56" height="20"/><text x="106" y="73">flood</text></g>
        <g><rect x="142" y="34" width="52" height="20"/><text x="168" y="48">power</text></g>
      </svg>`,
  },
  teachText: {
    title: "TeachText", icon: "teachText", w: 280,
    balloon: "The manuscript. One document, carried through the whole route.",
    content: () => `
      <p class="mw-doc"><strong>The Tide Comes In Twice</strong><br>
      The engineers at La Rance never called it renewable energy. They called
      it the tide, and they billed it by the moon.<span class="mw-caret"></span></p>`,
  },
  reviewDesk: {
    title: "Review Desk", icon: "reviewDesk", w: 250,
    balloon: "Checks facts, structure — and AI-mouthpiece drift.",
    content: () => `
      <ul class="mw-checks">
        <li data-ok>Dates match the sources</li>
        <li data-ok>Your voice, not the model's</li>
        <li data-warn>One claim still unsourced</li>
      </ul>`,
  },
  clioStage: {
    title: "ClioStage", icon: "clioStage", w: 240,
    balloon: "Turns the same manuscript into slides.",
    content: () => `
      <div class="mw-slide"><span>THE TIDE<br>COMES IN TWICE</span></div>
      <p class="mw-status">Slide 1 of 9</p>`,
  },
  clioChart: {
    title: "ClioChart", icon: "clioChart", w: 240,
    balloon: "One data matrix, five projections.",
    content: () => `
      <div class="mw-chart" aria-hidden="true"><i style="--v:38%"></i><i style="--v:62%"></i><i style="--v:47%"></i><i style="--v:88%"></i><i style="--v:70%"></i></div>
      <p class="mw-status">tidal-output.md &rarr; bars</p>`,
  },
  cmfStudio: {
    title: "CMF Studio", icon: "cmfStudio", w: 240,
    balloon: "Colors a 3D iPhone. Exports USDZ for AR.",
    content: () => `
      <div class="mw-cmf"><span class="mw-phone"></span>
      <span class="mw-swatches"><i style="background:#8ea6c8"></i><i style="background:#c8b08e"></i><i style="background:#333a44"></i></span></div>`,
  },
  clioTalk: {
    title: "ClioTalk", icon: "assistant", w: 270,
    balloon: "Chat. One app among many — not the whole computer.",
    content: () => `
      <div class="mw-chatlog">
        <p class="mw-q">Where does the draft overstate the yield?</p>
        <p class="mw-a">Paragraph two doubles the 1967 figure. The Scrapbook clip says 240&nbsp;GWh.</p>
      </div>
      <p class="mw-status">Reply stays temporary until you keep it</p>`,
  },
};

export const OBJECTS = {
  hardDisk: { label: "Project Hard Disk", balloon: "Durable project state. What lasts, lives here." },
  fileFloppy: { label: "File Floppy", balloon: "Temporary context. Sources go in here." },
  projectDisc: { label: "Project CD", balloon: "Finished work, exported for handoff." },
  trash: { label: "Trash", balloon: "Deletion, made honest." },
  startupDisk: { label: "Startup Disk", balloon: "Boots the real system — this one is live." },
  controlPanel: { label: "Control Panel", balloon: "Pick your model provider. The desktop stays yours." },
};

/* ---------- Windows ---------- */

let zCounter = 20;

export function createMiniWindow(desk, app, opts) {
  const conf = APPS[app];
  const win = doc.createElement("section");
  win.className = "mini-window";
  win.dataset.app = app;
  win.style.left = (opts.x || 20) + "px";
  win.style.top = (opts.y || 20) + "px";
  win.style.width = (opts.w || conf.w) + "px";
  win.style.zIndex = ++zCounter;
  win.innerHTML = `
    <header class="tbar mini-tbar">
      <button type="button" class="close-box mw-close" aria-label="Close ${conf.title}"></button>
      <h3>${conf.title}</h3>
    </header>
    <div class="mini-wbody">${conf.content()}</div>`;
  desk.surface.appendChild(win);
  if (!reducedMotion) {
    win.classList.add("win-zoom");
    win.addEventListener("animationend", () => win.classList.remove("win-zoom"), { once: true });
  }

  const bar = win.querySelector(".mini-tbar");
  win.addEventListener("pointerdown", () => { win.style.zIndex = ++zCounter; });
  win.querySelector(".mw-close").addEventListener("click", () => win.remove());

  // Double-click the title bar: WindowShade.
  bar.addEventListener("dblclick", (e) => {
    if (e.target.closest(".mw-close")) return;
    win.classList.toggle("shaded");
  });

  // Drag. Classic moves a dotted outline and jumps once; later eras move live.
  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".mw-close")) return;
    e.preventDefault();
    const surfRect = desk.surface.getBoundingClientRect();
    const rect = win.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const baseL = rect.left - surfRect.left, baseT = rect.top - surfRect.top;
    const classic = currentEra().id === "classic" && !reducedMotion;
    let ghost = null;
    if (classic) {
      ghost = doc.createElement("div");
      ghost.className = "drag-outline";
      ghost.style.cssText = `left:${baseL}px;top:${baseT}px;width:${rect.width}px;height:${rect.height}px;position:absolute`;
      desk.surface.appendChild(ghost);
    }
    bar.setPointerCapture(e.pointerId);
    const clamp = (l, t) => [
      Math.max(-rect.width * 0.6, Math.min(l, surfRect.width - rect.width * 0.4)),
      Math.max(0, Math.min(t, surfRect.height - 24)),
    ];
    const onMove = (ev) => {
      const [l, t] = clamp(baseL + ev.clientX - startX, baseT + ev.clientY - startY);
      (ghost || win).style.left = l + "px";
      (ghost || win).style.top = t + "px";
    };
    const onUp = (ev) => {
      bar.removeEventListener("pointermove", onMove);
      bar.removeEventListener("pointerup", onUp);
      bar.removeEventListener("pointercancel", onUp);
      if (ghost) {
        if (ev.type !== "pointercancel") { win.style.left = ghost.style.left; win.style.top = ghost.style.top; }
        ghost.remove();
      }
    };
    bar.addEventListener("pointermove", onMove);
    bar.addEventListener("pointerup", onUp);
    bar.addEventListener("pointercancel", onUp);
  });
  return win;
}

/* ---------- Icons ---------- */

let touchHintShown = false;

export function createDeskIcon(desk, name, opts) {
  const meta = opts.app ? APPS[opts.app] : OBJECTS[name] || {};
  const label = opts.label || meta.label || meta.title || name;
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.className = "desk-icon";
  if (meta.balloon) btn.setAttribute("data-balloon", meta.balloon);
  btn.appendChild(iconImg(opts.app ? APPS[opts.app].icon : name, opts.size || 32, ""));
  const span = doc.createElement("span");
  span.className = "desk-icon-label";
  span.textContent = label;
  btn.appendChild(span);

  const open = opts.onOpen || (opts.app ? () => desk.openApp(opts.app, opts) : null);
  const coarse = matchMedia("(pointer: coarse)").matches;
  let lastTap = 0;
  btn.addEventListener("click", (e) => {
    const now = Date.now();
    const isSecond = now - lastTap < 650 && btn.classList.contains("selected");
    lastTap = now;
    desk.selectIcon(btn);
    // Keyboard activation (detail 0) opens directly; pointers double-click.
    if (e.detail === 0 || isSecond) {
      if (open) open();
      return;
    }
    if (coarse && open && !touchHintShown) {
      touchHintShown = true;
      flashBalloon(btn, "Tap again to open.");
    }
  });
  btn.addEventListener("dblclick", () => { if (open) open(); });
  (opts.parent || desk.surface).appendChild(btn);
  return btn;
}

/* ---------- Desktop ---------- */

export function createMiniDesktop(container, config) {
  container.classList.add("mini-desktop-ready");
  const surface = doc.createElement("div");
  surface.className = "mini-surface";

  const menubar = doc.createElement("div");
  menubar.className = "mini-menubar";
  menubar.setAttribute("aria-hidden", "true");
  menubar.innerHTML = `<span class="mini-apple">&#63743;</span><span>File</span><span>Edit</span><span>View</span><span>Special</span><span class="mini-spacer"></span><span class="mini-clock">10:07 AM</span>`;
  container.appendChild(menubar);
  container.appendChild(surface);

  const desk = {
    container,
    surface,
    openApp(app, opts) {
      const existing = surface.querySelector(`.mini-window[data-app="${app}"]`);
      if (existing) {
        existing.style.zIndex = ++zCounter;
        existing.classList.remove("shaded");
        return existing;
      }
      const base = (config.spots && config.spots[app]) || {};
      return createMiniWindow(desk, app, {
        x: base.x ?? 16 + Math.random() * 60,
        y: base.y ?? 14 + Math.random() * 40,
        w: base.w,
        ...opts,
      });
    },
    selectIcon(btn) {
      surface.querySelectorAll(".desk-icon.selected").forEach((b) => b.classList.remove("selected"));
      if (btn) btn.classList.add("selected");
    },
  };

  surface.addEventListener("pointerdown", (e) => {
    if (e.target === surface) desk.selectIcon(null);
  });

  // Desk objects: right-edge column, like a Finder desktop.
  if (config.objects && config.objects.length) {
    const col = doc.createElement("div");
    col.className = "desk-objects";
    config.objects.forEach((name) => {
      createDeskIcon(desk, name, {
        parent: col,
        onOpen: name === "startupDisk" ? () => { location.href = "https://system6.aaronlau.me"; } : null,
      });
    });
    surface.appendChild(col);
  }

  // App icons: a row along the bottom.
  if (config.apps && config.apps.length) {
    const row = doc.createElement("div");
    row.className = "desk-apps";
    config.apps.forEach((app) => createDeskIcon(desk, app, { app, parent: row }));
    surface.appendChild(row);
  }

  (config.open || []).forEach((app) => desk.openApp(app));
  return desk;
}
