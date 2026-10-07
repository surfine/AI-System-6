// Temporary suspension of the existing pin layer; the window manager still
// owns every pin mutation. Nothing here survives a working-session reload.
(() => {
  if (window.AISystem6WindowPinControls) return;
  let saved = null;
  let internalChange = false;
  let watcher = null;

  const windows = () => Array.from(document.querySelectorAll(".window[data-window]"));
  const open = (win) => win?.isConnected && !win.classList.contains("is-hidden");
  const visible = (win) => open(win)
    && !win.matches(".is-app-hidden, .is-minimized")
    && !(typeof hiddenAppIds !== "undefined" && hiddenAppIds.has(getWindowAppId(win)));
  const ordered = (items) => items.sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0));
  function entries() {
    return ordered(windows().filter((win) => open(win) && win.dataset.windowPinned === "true"))
      .map((win) => ({ win, name: win.dataset.window,
        title: win.querySelector(".title-bar h1, .title-bar h2")?.textContent?.trim() || win.dataset.window }));
  }
  function changed(win) {
    if (!internalChange && saved) saved = saved.filter((candidate) => candidate !== win);
  }
  function observeChanges(records) {
    for (const record of records) {
      if (!open(record.target) || /(?:^|\s)is-hidden(?:\s|$)/.test(record.oldValue || "")) changed(record.target);
    }
  }
  function stopWatching() {
    if (watcher) observeChanges(watcher.takeRecords());
    watcher?.disconnect();
    watcher = null;
  }
  function mutate(callback) {
    internalChange = true;
    try { return callback(); } finally { internalChange = false; }
  }
  function suspend() {
    if (saved !== null) return false;
    const candidates = entries().map((entry) => entry.win);
    if (!candidates.length) return false;
    saved = [];
    mutate(() => candidates.forEach((win) => {
      if (setWindowPinned(win, false)) saved.push(win);
    }));
    if (!saved.length) { saved = null; return false; }
    if (typeof MutationObserver === "function") {
      watcher = new MutationObserver(observeChanges);
      saved.forEach((win) => watcher.observe(win, { attributes: true, attributeFilter: ["class"], attributeOldValue: true }));
    }
    return true;
  }
  function restore() {
    if (saved === null) return false;
    stopWatching();
    const candidates = saved;
    saved = null;
    mutate(() => candidates.forEach((win) => {
      if (visible(win)) setWindowPinned(win, true);
    }));
    return true;
  }
  function clear() {
    stopWatching();
    saved = null;
    mutate(() => entries().forEach(({ win }) => setWindowPinned(win, false)));
    return true;
  }
  window.AISystem6WindowPinControls = Object.freeze({
    suspend, restore, clear, entries, changed, isSuspended: () => saved !== null,
  });
  window.AISystem6WindowPinControlsLoaded = true;
})();
