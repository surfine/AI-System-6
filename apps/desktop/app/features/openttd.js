// Feature module: OpenTTD / 运输大亨 — the transport game in a window.
//
// The game itself is a WebAssembly build of OpenTTD 15.3 (GPLv2) that lives
// in assets/openttd/ (openttd.js/.wasm/.data plus its own shell page). This
// module only owns the System 6 side: the window, the iframe lifecycle, the
// status line, and the quit handshake. The shell page owns the touch layer
// and the first-run configuration; see assets/openttd/index.html and
// tooling/games/openttd/build.md.
window.AISystem6OpenTTDLoaded = true;

(function initOpenTTDFeature() {
  "use strict";

  function installOpenTTDWindow() {
    if (typeof document === "undefined") return;
    if (document.querySelector('[data-window="openttd"]')) return;
    document.querySelector(".desktop")?.insertAdjacentHTML("beforeend", `
      <section class="window openttd-window is-hidden" data-window="openttd" aria-labelledby="openttd-title">
        <div class="title-bar">
          <button class="close-box" aria-label="${t("close")}" data-i18n-aria-label="close"></button>
          <h2 id="openttd-title" data-i18n="openttd_title">${t("openttd_title")}</h2>
          <button class="resize-box" aria-label="${t("zoom")}" data-i18n-aria-label="zoom"></button>
          <button class="shade-box" aria-label="${t("collapse")}" data-i18n-aria-label="collapse"></button>
        </div>
        <div class="details-bar openttd-details-bar">
          <span class="openttd-status" data-openttd-status role="status" aria-live="polite"></span>
        </div>
        <div class="window-pane openttd-pane"></div>
      </section>`);
  }

  installOpenTTDWindow();

  const OPENTTD_SHELL_PATH = "assets/openttd/index.html";
  // Give the shell time to flush IDBFS before the iframe goes away on quit.
  const OPENTTD_QUIT_SYNC_MS = 400;

  const openttdState = {
    frame: null,
    statusKey: "",
    listening: false,
  };

  function openttdWindow() {
    return document.querySelector('[data-window="openttd"]');
  }

  function openttdPane() {
    return document.querySelector('[data-window="openttd"] .openttd-pane');
  }

  function setOpenTTDStatus(key) {
    openttdState.statusKey = key;
    const status = document.querySelector("[data-openttd-status]");
    if (!status) return;
    status.textContent = key ? t(key) : "";
  }

  function openttdShellSrc() {
    const language = typeof currentLanguage === "string" && currentLanguage === "en" ? "en" : "zh";
    const src = `${OPENTTD_SHELL_PATH}?lang=${language}`;
    // lazyScriptUrl appends the canonical ?v=<build> cache-buster.
    return typeof lazyScriptUrl === "function" ? lazyScriptUrl(src) : src;
  }

  function listenForShellMessages() {
    if (openttdState.listening) return;
    openttdState.listening = true;
    window.addEventListener("message", (event) => {
      if (event.origin !== location.origin) return;
      if (!openttdState.frame || event.source !== openttdState.frame.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== "openttd") return;
      if (data.event === "ready") setOpenTTDStatus("openttd_status_running");
      if (data.event === "running") setOpenTTDStatus("openttd_status_running");
      if (data.event === "paused") setOpenTTDStatus("openttd_status_paused");
      if (data.event === "exited") setOpenTTDStatus("openttd_status_exited");
      if (data.event === "crashed") setOpenTTDStatus("openttd_status_crashed");
    });
  }

  function attachOpenTTD() {
    const pane = openttdPane();
    if (!pane) return;
    listenForShellMessages();
    if (openttdState.frame && pane.contains(openttdState.frame)) return;
    // One live game per session: a second attach reuses the same iframe.
    const frame = document.createElement("iframe");
    frame.className = "openttd-frame";
    frame.title = "OpenTTD";
    frame.setAttribute("allow", "fullscreen");
    frame.src = openttdShellSrc();
    pane.textContent = "";
    pane.appendChild(frame);
    openttdState.frame = frame;
    setOpenTTDStatus("openttd_status_loading");
  }

  // Quit handshake: ask the shell to flush IDBFS, then drop the iframe so the
  // wasm main loop and its memory actually go away.
  function handleOpenTTDQuit() {
    const frame = openttdState.frame;
    openttdState.frame = null;
    if (!frame) return;
    try {
      frame.contentWindow?.postMessage({ type: "openttd-host", command: "sync" }, location.origin);
    } catch (e) {
      /* The frame may already be gone; removing it below is enough. */
    }
    window.setTimeout(() => {
      frame.remove();
      const pane = openttdPane();
      if (pane) pane.textContent = "";
    }, OPENTTD_QUIT_SYNC_MS);
    setOpenTTDStatus("");
  }

  function postToOpenTTD(command) {
    const frame = openttdState.frame;
    if (!frame?.contentWindow) return;
    try {
      frame.contentWindow.postMessage({ type: "openttd-host", command }, location.origin);
    } catch (e) {
      /* A frame that is going away has nothing left to tell. */
    }
  }

  function openttdWindowIsVisible() {
    const win = openttdWindow();
    return !!win
      && !win.classList.contains("is-hidden")
      && !win.classList.contains("is-app-hidden")
      && !win.classList.contains("is-collapsed");
  }

  // A hidden pane does not stop a wasm game: the main loop keeps simulating a
  // whole transport network behind a blank rectangle. The shell owns the real
  // stop (emscripten's main loop) and the IDBFS flush; this side only says when.
  window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.("openttd", {
    onSuspend: () => {
      window.AISystem6WebPlatform?.releaseScreenWakeLock?.("openttd");
      if (!openttdState.frame) return;
      postToOpenTTD("pause");
      setOpenTTDStatus("openttd_status_paused");
    },
    onResume: () => {
      if (!openttdState.frame || !openttdWindowIsVisible() || document.hidden) return;
      postToOpenTTD("resume");
      window.AISystem6WebPlatform?.holdScreenWakeLock?.("openttd");
    },
    onDispose: () => {
      window.AISystem6WebPlatform?.releaseScreenWakeLock?.("openttd");
      handleOpenTTDQuit();
    },
  });

  function refreshOpenTTDLanguage() {
    // The desktop chrome re-translates itself through data-i18n. The game
    // keeps its own in-game language setting; never reload a live game.
    setOpenTTDStatus(openttdState.statusKey);
  }

  window.AISystem6RegisterApplicationMenuSet?.("openttd", [{
    id: "file",
    labelKey: "menu_file",
    items: [{
      type: "item",
      action: "close-active-window",
      labelKey: "close",
      shortcutId: "close-window",
      conditionId: "close-active-window",
    }],
  }]);

  window.AISystem6OpenTTD = {
    attach: attachOpenTTD,
    handleQuit: handleOpenTTDQuit,
    refreshLanguage: refreshOpenTTDLanguage,
    isRunning: () => !!openttdState.frame,
  };
})();
