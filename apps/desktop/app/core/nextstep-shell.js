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
