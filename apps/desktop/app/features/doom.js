// Feature module: DOOM engine bootstrap.
//
// Chocolate Doom and its Emscripten runtime live in assets/doom/. This thin
// host owns only the AI System 6 window, same-origin iframe lifecycle, status
// receipt, viewport contract, and bounded shutdown handshake. It never calls
// Module, FS, or the GPL engine directly.
window.AISystem6DoomLoaded = true;

(function initDoomFeature() {
  "use strict";

  function installDoomWindow() {
    if (typeof document === "undefined") return;
    if (document.querySelector('[data-window="doom"]')) return;
    document.querySelector(".desktop")?.insertAdjacentHTML("beforeend", `
      <section class="window doom-window openttd-window is-hidden" data-window="doom" aria-labelledby="doom-title">
        <div class="title-bar">
          <button class="close-box" aria-label="${t("close")}" data-i18n-aria-label="close"></button>
          <h2 id="doom-title" data-i18n="doom_title">${t("doom_title")}</h2>
          <button class="resize-box" aria-label="${t("zoom")}" data-i18n-aria-label="zoom"></button>
          <button class="shade-box" aria-label="${t("collapse")}" data-i18n-aria-label="collapse"></button>
        </div>
        <div class="details-bar doom-details-bar openttd-details-bar">
          <span class="doom-status openttd-status" data-doom-status role="status" aria-live="polite"></span>
        </div>
        <div class="window-pane doom-pane openttd-pane"></div>
      </section>`);
  }

  installDoomWindow();

  const DOOM_PROTOCOL_VERSION = 2;
  const DOOM_SHELL_PATH = "assets/doom/index.html";
  // A returning mobile player may compile Wasm while IDBFS repopulates a
  // 20–30 MiB IWAD. Script failures report immediately from the iframe; this
  // watchdog is only for a shell that becomes completely unresponsive.
  const DOOM_ENGINE_READY_TIMEOUT_MS = 60000;
  // Ordinary saves acknowledge quickly. A large in-flight local WAD import
  // may need longer on mobile IndexedDB, so the fallback is deliberately
  // bounded but not short enough to cut off a legitimate persistence flush.
  const DOOM_SHUTDOWN_TIMEOUT_MS = 8000;

  const doomState = {
    frame: null,
    statusKey: "",
    listening: false,
    retryNonce: 0,
    readyTimer: 0,
    shutdownTimer: 0,
    resizeObserver: null,
    windowObserver: null,
  };

  function doomWindow() {
    return document.querySelector('[data-window="doom"]');
  }

  function doomPane() {
    return doomWindow()?.querySelector(".doom-pane") || null;
  }

  function setDoomStatus(key) {
    doomState.statusKey = key || "";
    const status = document.querySelector("[data-doom-status]");
    if (status) status.textContent = doomState.statusKey ? t(doomState.statusKey) : "";
  }

  function clearTimer(name) {
    if (!doomState[name]) return;
    window.clearTimeout(doomState[name]);
    doomState[name] = 0;
  }

  function doomShellSrc() {
    const language = typeof currentLanguage === "string" && currentLanguage === "en" ? "en" : "zh";
    const separator = DOOM_SHELL_PATH.includes("?") ? "&" : "?";
    const src = `${DOOM_SHELL_PATH}${separator}lang=${language}&r=${doomState.retryNonce}`;
    return typeof lazyScriptUrl === "function" ? lazyScriptUrl(src) : src;
  }

  function viewportDetail() {
    const rect = doomPane()?.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect?.width || window.innerWidth));
    const cssHeight = Math.max(1, Math.round(rect?.height || window.innerHeight));
    return {
      cssWidth,
      cssHeight,
      dpr: Math.max(1, Number(window.devicePixelRatio) || 1),
      orientation: cssHeight >= cssWidth ? "portrait" : "landscape",
    };
  }

  function postToDoom(command, detail = null) {
    const frame = doomState.frame;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({
      type: "aisystem6-doom-host",
      protocolVersion: DOOM_PROTOCOL_VERSION,
      command,
      detail,
    }, location.origin);
  }

  function sendDoomViewport() {
    postToDoom("release-inputs", { reason: "viewport-change" });
    postToDoom("set-viewport", viewportDetail());
  }

  function sendDoomAppearance() {
    const themeId = window.AISystem6Theme?.getCurrentTheme?.()
      || document.body.dataset.theme
      || "classic";
    postToDoom("set-appearance", { themeId });
  }

  function stopObservingViewport() {
    doomState.resizeObserver?.disconnect();
    doomState.resizeObserver = null;
  }

  function doomWindowIsVisible() {
    const win = doomWindow();
    return !!win
      && !win.classList.contains("is-hidden")
      && !win.classList.contains("is-app-hidden")
      && !win.classList.contains("is-collapsed");
  }

  function syncDoomWindowVisibility() {
    if (!doomState.frame) return;
    if (doomWindowIsVisible() && !document.hidden) {
      // Restoring the window never requests pointer lock or starts the engine.
      postToDoom("resume");
      sendDoomViewport();
      return;
    }
    postToDoom("release-inputs", { reason: "window-hidden" });
    postToDoom("pause");
    postToDoom("sync");
  }

  function stopObservingDoomWindow() {
    doomState.windowObserver?.disconnect();
    doomState.windowObserver = null;
  }

  function observeDoomWindow() {
    stopObservingDoomWindow();
    const win = doomWindow();
    if (!win || typeof MutationObserver !== "function") return;
    doomState.windowObserver = new MutationObserver(syncDoomWindowVisibility);
    doomState.windowObserver.observe(win, { attributes: true, attributeFilter: ["class"] });
  }

  function observeViewport() {
    stopObservingViewport();
    const pane = doomPane();
    if (!pane || typeof ResizeObserver !== "function") return;
    doomState.resizeObserver = new ResizeObserver(sendDoomViewport);
    doomState.resizeObserver.observe(pane);
  }

  function removeDoomFrame(frame = doomState.frame) {
    clearTimer("readyTimer");
    clearTimer("shutdownTimer");
    stopObservingViewport();
    stopObservingDoomWindow();
    if (frame) frame.remove();
    if (doomState.frame === frame) doomState.frame = null;
  }

  function renderDoomRetry() {
    const pane = doomPane();
    removeDoomFrame();
    if (!pane) return;
    pane.textContent = "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.textContent = t("doom_retry");
    button.addEventListener("click", () => {
      doomState.retryNonce += 1;
      attachDoom();
    }, { once: true });
    pane.appendChild(button);
  }

  function finishDoomShutdown(frame) {
    if (!frame || frame !== doomState.frame) return;
    removeDoomFrame(frame);
    const pane = doomPane();
    if (pane) pane.textContent = "";
    setDoomStatus("");
  }

  function handleDoomMessage(event) {
    if (event.origin !== location.origin) return;
    const frame = doomState.frame;
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (
      !data
      || data.type !== "aisystem6-doom"
      || data.protocolVersion !== DOOM_PROTOCOL_VERSION
    ) return;

    if (data.event === "shell-ready") {
      postToDoom("set-language", { language: currentLanguage === "en" ? "en" : "zh" });
      sendDoomAppearance();
      sendDoomViewport();
    }
    if (data.event === "engine-ready") setDoomStatus("doom_status_engine_ready");
    if (data.event === "needs-data") {
      clearTimer("readyTimer");
      setDoomStatus("doom_status_needs_data");
    }
    if (data.event === "wad-importing") setDoomStatus("doom_status_importing");
    if (data.event === "wad-ready") {
      clearTimer("readyTimer");
      setDoomStatus("doom_status_ready");
    }
    if (data.event === "starting") setDoomStatus("doom_status_starting");
    if (data.event === "running") setDoomStatus("doom_status_running");
    if (data.event === "import-failed") setDoomStatus("doom_status_import_failed");
    if (data.event === "save-failed") setDoomStatus("doom_status_save_failed");
    // A background sync may finish after a rapid restore. Do not let that
    // late receipt overwrite the foreground engine state.
    if (data.event === "synced" && !doomWindowIsVisible()) {
      setDoomStatus("doom_status_storage_synced");
    }
    if (data.event === "paused") setDoomStatus("doom_status_paused");
    if (data.event === "crashed") {
      setDoomStatus("doom_status_crashed");
      renderDoomRetry();
    }
    if (data.event === "shutdown-ack") finishDoomShutdown(frame);
  }

  function installDoomListeners() {
    if (doomState.listening) return;
    doomState.listening = true;
    window.addEventListener("message", handleDoomMessage);
    window.addEventListener("resize", sendDoomViewport);
    document.addEventListener("ai-system6-themechange", sendDoomAppearance);
    document.addEventListener("visibilitychange", () => {
      if (!doomState.frame) return;
      // Returning to the tab must not wake an app whose own window is still
      // hidden. The shared visibility predicate also keeps pointer lock and
      // first start behind explicit gestures inside the game shell.
      syncDoomWindowVisibility();
    });
  }

  function attachDoom() {
    const pane = doomPane();
    if (!pane) return;
    installDoomListeners();
    if (doomState.frame && pane.contains(doomState.frame)) {
      postToDoom("resume");
      sendDoomViewport();
      return;
    }

    const frame = document.createElement("iframe");
    frame.className = "doom-frame";
    frame.title = "DOOM engine";
    frame.setAttribute("allow", "fullscreen; gamepad");
    frame.setAttribute("width", "100%");
    frame.setAttribute("height", "100%");
    frame.setAttribute("frameborder", "0");
    frame.src = doomShellSrc();
    pane.textContent = "";
    pane.appendChild(frame);
    doomState.frame = frame;
    observeViewport();
    observeDoomWindow();
    setDoomStatus("doom_status_loading");
    clearTimer("readyTimer");
    doomState.readyTimer = window.setTimeout(() => {
      if (doomState.frame !== frame) return;
      setDoomStatus("doom_status_timeout");
      renderDoomRetry();
    }, DOOM_ENGINE_READY_TIMEOUT_MS);
  }

  function handleDoomQuit() {
    const frame = doomState.frame;
    if (!frame) return;
    postToDoom("release-inputs", { reason: "quit" });
    postToDoom("shutdown");
    clearTimer("shutdownTimer");
    doomState.shutdownTimer = window.setTimeout(
      () => finishDoomShutdown(frame),
      DOOM_SHUTDOWN_TIMEOUT_MS,
    );
  }

  function refreshDoomLanguage() {
    setDoomStatus(doomState.statusKey);
    postToDoom("set-language", { language: currentLanguage === "en" ? "en" : "zh" });
    sendDoomAppearance();
  }

  window.AISystem6RegisterApplicationMenuSet?.("doom", [{
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

  // The shell already owns pause/resume; the lifecycle is what makes a hidden
  // MultiFinder app and a backgrounded Home Screen App reach it too. Order is
  // load-bearing: release held input first (SDL keeps whatever key was down
  // when the pane went dark), then stop the loop, then flush its storage.
  window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.("doom", {
    onSuspend: () => {
      window.AISystem6WebPlatform?.releaseScreenWakeLock?.("doom");
      if (!doomState.frame) return;
      // The pane keeps resizing as the window collapses, and each of those
      // observations posts at an engine that is meant to be asleep. Stop
      // watching first, then release input, stop the loop, and flush.
      stopObservingViewport();
      postToDoom("release-inputs", { reason: "suspend" });
      postToDoom("pause");
      postToDoom("sync");
    },
    onResume: () => {
      if (!doomState.frame || !doomWindowIsVisible() || document.hidden) return;
      // resume before the viewport: sendDoomViewport also re-releases input,
      // so a resumed engine never inherits a stuck key from the paused frame.
      postToDoom("resume");
      observeViewport();
      sendDoomViewport();
      window.AISystem6WebPlatform?.holdScreenWakeLock?.("doom");
    },
    onDispose: () => {
      window.AISystem6WebPlatform?.releaseScreenWakeLock?.("doom");
      handleDoomQuit();
    },
  });

  window.AISystem6Doom = Object.freeze({
    protocolVersion: DOOM_PROTOCOL_VERSION,
    attach: attachDoom,
    handleQuit: handleDoomQuit,
    refreshLanguage: refreshDoomLanguage,
    isLoaded: () => !!doomState.frame,
  });
})();
