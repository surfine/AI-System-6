// NeXTSTEP presentation of existing managed windows. Window identity, contents,
// running-app membership and save/close decisions remain with the shared owner.
//
// Minimize/restore used to live here, which made the desk's only miniaturize
// button a NeXTSTEP possession. The state moved to the shared window manager
// (window-manager.js, "Miniaturize, and the way back"); what remains here is
// this appearance's own button and its own miniwindow list in the dock.
(() => {
  if (window.AISystem6NextstepShellLoaded) return;
  const chrome = new Map();
  const enabled = () => window.AISystem6Theme.getCurrentTheme() === "nextstep";
  const managedWindows = () => Array.from(document.querySelectorAll(".window[data-window]"));

  // One miniaturize for the desk, one already-written restore: the shared
  // owner keeps the focus snapshot and the working-session save, so this
  // appearance cannot drift into a second meaning for a minimized window.
  const minimize = (win) => minimizeWindow(win);
  const restore = (win, options) => restoreMinimizedWindow(win, options);
  const restoreFocus = (win) => restoreWindowFocus(win);

  function wire(win) {
    if (!enabled() || chrome.has(win)) return;
    const bar = win.querySelector(".title-bar");
    const close = bar?.querySelector(".close-box");
    if (!close || ["about", "saveChat"].includes(win.dataset.window)) return;
    const marker = document.createComment("close-box position");
    close.before(marker);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nextstep-miniaturize";
    button.dataset.i18nAriaLabel = "window_miniaturize";
    button.setAttribute("aria-label", t("window_miniaturize"));
    button.addEventListener("pointerdown", (event) => event.preventDefault());
    button.addEventListener("click", () => minimize(win));
    // A panel -- a desk accessory here -- has only a close button in 3.3
    // (UI Guidelines ch.5: panels rarely miniaturize); the slot stays so the
    // title stays centred between the two ends.
    if (typeof getWindowAppId === "function" && getWindowAppId(win) === "accessories") button.hidden = true;
    bar.prepend(button);
    bar.append(close);
    const strip = document.createElement("div");
    strip.className = "nextstep-resize-strip";
    if (isResizableWindow(win)) {
      for (const edge of ["left", "center", "right"]) {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.dataset.resizeEdge = edge;
        handle.setAttribute("aria-label", t(`nextstep_resize_${edge}`));
        handle.addEventListener("pointerdown", (event) => startWindowResize(event, win, edge));
        handle.addEventListener("keydown", (event) => {
          if (!event.key.startsWith("Arrow")) return;
          event.preventDefault();
          const transaction = startWindowResize({ currentTarget: handle, clientX: 0, clientY: 0,
            preventDefault() {}, stopPropagation() {} }, win, edge);
          transaction?.stop({ type: "mouseup", clientX: event.key === "ArrowRight" ? 16 : event.key === "ArrowLeft" ? -16 : 0,
            clientY: event.key === "ArrowDown" ? 16 : event.key === "ArrowUp" ? -16 : 0 });
        });
        strip.append(handle);
      }
      win.append(strip);
    }
    chrome.set(win, { button, marker, close, strip });
  }

  function syncMain() {
    const main = enabled() ? resolveMenuContextWindow() : null;
    managedWindows().forEach((win) => {
      const isMain = win === main && !win.classList.contains("is-active");
      if (win.classList.contains("is-nextstep-main") !== isMain) win.classList.toggle("is-nextstep-main", isMain);
    });
  }

  function sync() {
    syncMain();
    window.AISystem6NextstepDock?.sync();
    if (enabled()) managedWindows().forEach(wire);
    else {
      chrome.forEach(({ button, marker, close, strip }) => {
        strip.remove();
        marker.replaceWith(close);
        button.remove();
      });
      chrome.clear();
    }
    // The Writing Flow panel is another NeXTSTEP-only object; its own module
    // re-places itself on the shell's theme-change/sync path.
    window.AISystem6NextstepWritingFlow?.sync();
  }

  function frameTrack({ event, vertical, scroller, track, thumb }) {
    if (!enabled()) return false;
    const rect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const length = vertical ? rect.height : rect.width;
    const size = vertical ? thumbRect.height : thumbRect.width;
    const total = vertical ? scroller.scrollHeight - scroller.clientHeight : scroller.scrollWidth - scroller.clientWidth;
    const drag = (pointer) => {
      const offset = (vertical ? pointer.clientY - rect.top : pointer.clientX - rect.left) - size / 2;
      const next = Math.max(0, Math.min(total, offset / Math.max(1, length - size) * total));
      if (vertical) scroller.scrollTop = next;
      else scroller.scrollLeft = next;
    };
    const stop = () => {
      window.removeEventListener("pointermove", drag);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
      document.removeEventListener("ai-system6-themechange", stop);
    };
    drag(event);
    window.addEventListener("pointermove", drag);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    document.addEventListener("ai-system6-themechange", stop);
    return true;
  }

  document.addEventListener("ai-system6-themechange", sync);
  window.AISystem6NextstepShell = Object.freeze({ wire, sync, syncMain, minimize, restore, restoreFocus, frameTrack });
  window.AISystem6NextstepShellLoaded = true;
  sync();
})();

// NeXTSTEP 3.3: Writing Flow as a floating panel (Window Order tier 6). The
// presentation only: the panel keeps the shared DOM, the shared state classes
// and the shared two-verb state. `.is-shaded` is WindowShade and, as in every
// era, keeps the title bar on the desk. `.is-closed` is the close box putting
// the panel away altogether, reopened by Tools ▸ Writing Flow.... This section
// adds the era's placement, drag and hide-on-deactivate.
(() => {
  if (window.AISystem6NextstepWritingFlowLoaded) return;
  const KEY = "ai-system-6-nextstep-writing-flow";
  const WIDTH = 150;  // the main menu's own minimum width: the two stack as one column
  const TITLE = 23;   // title bar rows including the frame's top line
  const ROW = 35;     // Draw.app Tools cell: white, 32 face, #555555, black
  const GAP = 15;     // Draw: main menu ends at y241, Tools palette starts at y257
  const EDGE = 4;     // keep a default frame this far inside the screen
  const wired = new WeakSet();
  const active = () => window.AISystem6Theme.getCurrentTheme() === "nextstep";
  const panel = () => document.querySelector(".writing-spine-panel");
  const owner = () => menuOwnerAppId || activeAppId || "finder";
  let frame = read();
  let drag = null;
  let queued = false;

  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY));
      return Number.isFinite(value?.x) && Number.isFinite(value?.y) ? { x: value.x, y: value.y } : null;
    } catch { return null; }
  }
  function write() {
    try { if (frame) localStorage.setItem(KEY, JSON.stringify(frame)); else localStorage.removeItem(KEY); } catch { /* frame lasts the session */ }
  }

  // A floating panel needs a desk: any screen wider than the phone line, and a
  // small desk too (an 800x600 display with a mouse) -- NeXTSTEP ran at 832px
  // tall. Only a touch screen keeps the shared one-document presentation.
  function floats() {
    const body = document.body.classList;
    if (body.contains("is-writer-mode") || body.contains("quick-draft-focus")) return false;
    const fine = typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (body.contains("mobile-app-foreground") || body.contains("mobile-landscape-shell")) {
      return fine && innerWidth >= 640 && innerHeight >= 540;
    }
    return innerWidth > 860;
  }

  // The main menu palette measured from the alive registry, not guessed from
  // whatever palette happens to sit furthest left.
  function menuRect() {
    return window.AISystem6NextstepMenus?.rootRect?.() || null;
  }

  function place(el) {
    const rows = Array.from(el.querySelectorAll(".spine-section-main > button")).filter((b) => !b.hidden).length || 6;
    const menu = menuRect();
    const dock = document.querySelector(".nextstep-dock")?.getBoundingClientRect();
    const dockLeft = dock?.width ? dock.left : innerWidth;
    const dockReserve = typeof deskDockReserve === "function" ? deskDockReserve() : 0;
    let row = ROW;
    let x; let y;
    if (frame) {
      // Wherever the writer left it, with the title bar kept on screen.
      x = Math.min(Math.max(0, frame.x), innerWidth - WIDTH);
      y = Math.min(Math.max(0, frame.y), innerHeight - TITLE);
    } else {
      // The root menu sits at x=-1 so its border is off-screen; the panel must
      // still start on screen, so the menu's left edge is clamped at 0.
      x = Math.min(menu ? Math.max(0, menu.left) : 8, dockLeft - WIDTH - EDGE);
      y = menu ? menu.bottom + GAP : 32;
      const need = TITLE + rows * ROW;
      if (y + need > innerHeight - EDGE - dockReserve) {
        // Give back the gap first (never under the menu), then shorten the cells.
        y = Math.max(menu ? menu.bottom + 6 : 0, innerHeight - EDGE - dockReserve - need);
        const room = innerHeight - EDGE - dockReserve - y;
        if (need > room) row = Math.max(24, Math.floor((room - TITLE) / rows));
      }
    }
    if (menu) document.body.style.setProperty("--nextstep-column-right", `${Math.round(menu.right)}px`);
    // The narrow shell keeps its foreground window clear of the panel too.
    document.body.style.setProperty("--nextstep-panel-right", `${Math.round(x + WIDTH)}px`);
    el.style.setProperty("--nextstep-flow-x", `${Math.round(x)}px`);
    el.style.setProperty("--nextstep-flow-y", `${Math.round(y)}px`);
    if (row === ROW) { el.style.removeProperty("--nsf-row"); el.style.removeProperty("--nsf-icon"); }
    else { el.style.setProperty("--nsf-row", `${row}px`); el.style.setProperty("--nsf-icon", `${row >= 27 ? 24 : 16}px`); }
  }

  function wire(el) {
    const closeBox = el.querySelector(".spine-close-box");
    // A panel never becomes key: no press on its close box may take focus from
    // the document. The shared [data-action] delegate does the closing.
    if (closeBox && !wired.has(closeBox)) {
      wired.add(closeBox);
      closeBox.addEventListener("pointerdown", (event) => event.preventDefault());
    }
  }

  function teardown(el) {
    if (!el) return;
    delete el.dataset.nextstepPanel;
    ["--nextstep-flow-x", "--nextstep-flow-y", "--nsf-row", "--nsf-icon"].forEach((name) => el.style.removeProperty(name));
    const closeBox = el.querySelector(".spine-close-box");
    if (closeBox) closeBox.hidden = true;
    document.body.style.removeProperty("--nextstep-column-right");
    document.body.style.removeProperty("--nextstep-panel-right");
  }

  function sync() {
    queued = false;
    const el = panel();
    if (!el) return;
    // The desktop profile withholds the route (.is-hidden): nothing to float.
    if (!active() || !floats() || el.classList.contains("is-hidden")) { teardown(el); return; }
    wire(el);
    const closeBox = el.querySelector(".spine-close-box");
    if (closeBox) closeBox.hidden = false;
    const state = window.AISystem6NextstepMenus?.writingFamily?.has(owner()) ? "open" : "away";
    if (el.dataset.nextstepPanel !== state) el.dataset.nextstepPanel = state;
    place(el);
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(sync); } }

  // Drag by the title bar; the frame is remembered from then on.
  document.addEventListener("pointerdown", (event) => {
    const bar = event.target.closest?.(".writing-spine-panel[data-nextstep-panel] .spine-title-row");
    if (!bar || event.button !== 0 || event.target.closest("button") || !active()) return;
    event.preventDefault();
    const rect = panel().getBoundingClientRect();
    drag = { id: event.pointerId, bar, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    bar.setPointerCapture(event.pointerId);
  });
  document.addEventListener("pointermove", (event) => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    drag.moved = true;
    frame = { x: Math.round(drag.left + dx), y: Math.round(drag.top + dy) };
    place(panel());
  });
  const endDrag = (event) => {
    if (drag?.id !== event.pointerId) return;
    if (drag.bar.hasPointerCapture(event.pointerId)) drag.bar.releasePointerCapture(event.pointerId);
    if (drag.moved) write();
    drag = null;
  };
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  // Stage buttons open their window as key; the panel itself never takes focus
  // from a mouse press.
  document.addEventListener("pointerdown", (event) => {
    if (active() && event.target.closest?.(".writing-spine-panel[data-nextstep-panel] .spine-actions button")) event.preventDefault();
  }, true);

  // Tools ▸ Writing Flow...: shows the panel (never toggles its shade) where it
  // was. Closing is the shared close box, so this only reopens.
  window.AISystem6Runtime.registerCommand("nextstep-writing-flow", {
    handler: () => { setWritingFlowClosed(false); schedule(); },
    isAvailable: () => true,
  });

  document.addEventListener("ai-system6-themechange", schedule);
  window.addEventListener("resize", schedule);
  window.AISystem6NextstepWritingFlow = Object.freeze({
    sync: schedule,
    reset() { frame = null; write(); schedule(); },
    frame: () => frame && { ...frame },
  });
  window.AISystem6NextstepWritingFlowLoaded = true;
  schedule();
})();
