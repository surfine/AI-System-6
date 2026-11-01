// The full-screen space: how a window gets there and back, and what the
// display's edges do while it is there. Loaded by window-fullscreen.js only in
// an era that has full screen; that module owns the state (frame, owner,
// menu-bar hiding) and calls entered()/exited() after the state has changed.
//
// What 10.7 did, and where each part is sourced (internal/evidence/drafts/
// lion-fullscreen/SOURCES.md):
// - Entering moves the window into a new space "increasing the window's size
//   during the transition" (OS X HIG, Characteristics: "Full-Screen Windows
//   Help Users Concentrate"). The spaces slide sideways, the old desktop out
//   to the left, and the system's grey linen fills what neither space covers
//   (WWDC 2011 session 113: "this nice linen background that the system
//   provides"; the linen is cut from 512 Pixels' 10.7 Mission Control
//   capture). Leaving is the same move reversed. The length is the system's
//   and is not published; half a second, ease-in-out, is the owner's reading.
//   With reduced motion the change is a cross-fade instead of a slide.
// - The menu bar and the Dock are auto-hidden and come back while the pointer
//   is at the top or bottom edge ("Implementing the Full-Screen Experience").
//   The top edge is window-fullscreen.js's; the bottom edge is here.
// - Lion's menu bar carries a blue exit button at its right end while it is
//   shown (WWDC 2011 session 113, "my escape hatch"; art cut from 512 Pixels'
//   10.7 Full Screen App capture). Yosemite dropped it: the green lamp, which
//   comes back with the title bar, leaves full screen there.
(() => {
  if (window.AISystem6FullscreenSpaceLoaded) return;

  const duration = 500;
  let running = null;
  let dockZone = null;
  let exitButton = null;

  const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

  function stop() {
    running?.forEach((animation) => animation.cancel());
    running = null;
    document.body.classList.remove("fullscreen-space-moving");
  }

  // The window is a child of the desk, so while the desk slides the window
  // carries the opposite offset and only its own growth shows on the display.
  // `from` is where the window was before the state changed; its present rect
  // is where it lands. Both transforms share one easing, so the sum is exact.
  function play(win, from, entering) {
    stop();
    const desk = win.closest(".desktop");
    if (!desk?.animate || !win.animate || !from?.width) return;
    const to = win.getBoundingClientRect();
    if (!to.width || !to.height) return;
    document.body.classList.add("fullscreen-space-moving");
    let animations;
    if (reduced()) {
      animations = [(entering ? win : desk).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "linear" })];
    } else {
      const width = window.innerWidth;
      const timing = { duration, easing: "ease-in-out" };
      const grow = `translate(${from.left - to.left + (entering ? 0 : width)}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
      const rest = `translate(${entering ? width : 0}px, 0px) scale(1, 1)`;
      animations = [
        desk.animate([
          { transform: `translateX(${entering ? 0 : -width}px)` },
          { transform: `translateX(${entering ? -width : 0}px)` },
        ], timing),
        win.animate([
          { transform: grow, transformOrigin: "0 0" },
          { transform: rest, transformOrigin: "0 0" },
        ], timing),
      ];
    }
    running = animations;
    Promise.all(animations.map((animation) => animation.finished))
      .then(() => { if (running === animations) stop(); }, () => {});
  }

  // ---- The bottom edge: the Dock ------------------------------------------
  function revealDock(on) {
    if (document.body.classList.contains("fullscreen-dock-revealed") === on) return;
    document.body.classList.toggle("fullscreen-dock-revealed", on);
    window.AISystem6DeskDock?.sync?.();
  }

  function onPointerOver(event) {
    if (!document.body.classList.contains("fullscreen-dock-revealed")) return;
    if (event.target.closest?.(".desk-dock, .desk-dock-menu, .fullscreen-dock-reveal")) return;
    revealDock(false);
  }

  // ---- Lion's exit button in the menu bar ---------------------------------
  function showExitButton(win) {
    if (window.AISystem6Theme?.getCurrentTheme?.() !== "lion") return;
    const bar = document.querySelector(".menu-bar");
    if (!bar || exitButton) return;
    exitButton = document.createElement("button");
    exitButton.type = "button";
    exitButton.className = "fullscreen-exit-button";
    exitButton.dataset.i18nAriaLabel = "window_exit_full_screen";
    exitButton.setAttribute("aria-label", t("window_exit_full_screen"));
    exitButton.addEventListener("click", () => window.AISystem6WindowFullscreen?.exit(win));
    bar.append(exitButton);
  }

  function entered(win, from) {
    dockZone ||= Object.assign(document.createElement("div"), { className: "fullscreen-dock-reveal" });
    dockZone.setAttribute("aria-hidden", "true");
    dockZone.onpointerenter = () => revealDock(true);
    document.body.append(dockZone);
    document.addEventListener("pointerover", onPointerOver);
    showExitButton(win);
    play(win, from, true);
  }

  function exited(win, from) {
    dockZone?.remove();
    document.removeEventListener("pointerover", onPointerOver);
    document.body.classList.remove("fullscreen-dock-revealed");
    exitButton?.remove();
    exitButton = null;
    play(win, from, false);
  }

  window.AISystem6FullscreenSpace = Object.freeze({ entered, exited });
  window.AISystem6FullscreenSpaceLoaded = true;
})();
