// Feature module: OpenTTD / 运输大亨 — the transport game in a window.
//
// The game itself is a WebAssembly build of OpenTTD 15.3 (GPLv2) that lives
// in assets/openttd/ (openttd.js/.wasm/.data plus its own shell page). This
// module only owns the System 6 side: the window, the iframe lifecycle, the
// status line, the quit handshake, and the honest host contract (v223).
//
// Required binary/runtime (not eager-boot; iframe-only):
//   - apps/desktop/assets/openttd/openttd.js
//   - apps/desktop/assets/openttd/openttd.wasm
//   - apps/desktop/assets/openttd/openttd.data
// Rebuild with tooling/games/openttd/build.md (emsdk + OpenTTD 15.3 + OpenGFX).
// N6 public-snapshot boundary (Aaron 2026-10-04): Public snapshot / slim trees omit
// those generated outputs (see tooling/public-snapshot-manifest.mjs). The private
// tree and full web/Mac releases keep the play path when the three files exist.
// Omitted → probeOpenTTDBinary → openttd_status_missing_binary + Retry; never
// pretend ready. Do not download new engines or raise floppyBudgetBytes.
// See assets/openttd/index.html and tooling/games/openttd/build.md.
window.AISystem6OpenTTDLoaded = true;

(function initOpenTTDFeature() {
  "use strict";

  function installOpenTTDWindow() {
    if (typeof document === "undefined") return;
    if (document.querySelector('[data-window="openttd"]')) return;
    window.AISystem6ApplicationShell.createWindow({
      windowName: "openttd",
      windowClass: "openttd-window",
      labelledBy: "openttd-title",
      titleKey: "openttd_title",
      title: t("openttd_title"),
      statusClass: "openttd-details-bar",
      statusHtml: '<span class="openttd-status" data-openttd-status role="status" aria-live="polite"></span>',
      paneClass: "openttd-pane",
    });
  }

  installOpenTTDWindow();

  const OPENTTD_SHELL_PATH = "assets/openttd/index.html";
  // Give the shell time to flush IDBFS before the iframe goes away on quit.
  const OPENTTD_QUIT_SYNC_MS = 400;
  // Match DOOM's honesty: a hung or missing Wasm payload must not look like a
  // successful load. The OpenTTD .data pack is large; keep the watchdog long.
  const OPENTTD_ENGINE_READY_TIMEOUT_MS = 90000;

  const openttdState = {
    frame: null,
    statusKey: "",
    listening: false,
    retryNonce: 0,
    readyTimer: 0,
    binaryPresent: null,
  };

  function openttdWindow() {
    return document.querySelector('[data-window="openttd"]');
  }

  function openttdPane() {
    return document.querySelector('[data-window="openttd"] .openttd-pane');
  }

  function syncHostContract(host) {
    const next = host || (
      openttdState.statusKey === "openttd_status_crashed"
        ? "crash"
        : openttdState.statusKey === "openttd_status_timeout"
          || openttdState.statusKey === "openttd_status_missing_binary"
          ? "fail"
          : openttdState.statusKey === "openttd_status_loading"
            ? "loading"
            : openttdState.statusKey === "openttd_status_running"
              || openttdState.statusKey === "openttd_status_paused"
              ? "ready"
              : openttdState.statusKey
                ? "ready"
                : "idle"
    );
    const binary = openttdState.binaryPresent === false ? 0 : 1;
    window.AISystem6WasmHostContract?.apply?.(openttdWindow(), {
      kind: "openttd",
      host: next,
      wasm: 1,
      binary,
      fail: true,
      crash: true,
    });
  }

  function setOpenTTDStatus(key) {
    openttdState.statusKey = key;
    const status = document.querySelector("[data-openttd-status]");
    if (!status) return;
    status.textContent = key ? t(key) : "";
    syncHostContract();
  }

  function clearReadyTimer() {
    if (!openttdState.readyTimer) return;
    window.clearTimeout(openttdState.readyTimer);
    openttdState.readyTimer = 0;
  }

  function openttdShellSrc() {
    const language = typeof currentLanguage === "string" && currentLanguage === "en" ? "en" : "zh";
    const separator = OPENTTD_SHELL_PATH.includes("?") ? "&" : "?";
    const src = `${OPENTTD_SHELL_PATH}${separator}lang=${language}&r=${openttdState.retryNonce}`;
    // lazyScriptUrl appends the canonical ?v=<build> cache-buster.
    return typeof lazyScriptUrl === "function" ? lazyScriptUrl(src) : src;
  }

  function openttdBinaryUrl(name) {
    const path = `assets/openttd/${name}`;
    return typeof lazyScriptUrl === "function" ? lazyScriptUrl(path) : path;
  }

  async function probeOpenTTDBinary() {
    try {
      const response = await fetch(openttdBinaryUrl("openttd.wasm"), {
        method: "HEAD",
        cache: "no-store",
      });
      openttdState.binaryPresent = response.ok;
      return response.ok;
    } catch {
      // Some hosts reject HEAD; try a ranged GET as a second opinion.
      try {
        const response = await fetch(openttdBinaryUrl("openttd.wasm"), {
          method: "GET",
          headers: { Range: "bytes=0-3" },
          cache: "no-store",
        });
        openttdState.binaryPresent = response.ok;
        return response.ok;
      } catch {
        openttdState.binaryPresent = null;
        return null;
      }
    }
  }

  function removeOpenTTDFrame(frame = openttdState.frame) {
    clearReadyTimer();
    if (frame) frame.remove();
    if (openttdState.frame === frame) openttdState.frame = null;
  }

  function renderOpenTTDRetry() {
    const pane = openttdPane();
    removeOpenTTDFrame();
    if (!pane) return;
    pane.textContent = "";
    // Fail ≠ ready: keep the status line reason in the pane so Retry is not a
    // bare button that looks like a successful host (harvest R18).
    const note = document.createElement("p");
    note.className = "empty-folder-note openttd-host-note";
    note.textContent = openttdState.statusKey
      ? t(openttdState.statusKey)
      : t("openttd_status_timeout");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn default";
    button.textContent = t("openttd_retry");
    button.addEventListener("click", () => {
      openttdState.retryNonce += 1;
      attachOpenTTD();
    }, { once: true });
    pane.append(note, button);
    syncHostContract(
      openttdState.statusKey === "openttd_status_crashed" ? "crash" : "fail",
    );
  }

  function listenForShellMessages() {
    if (openttdState.listening) return;
    openttdState.listening = true;
    window.addEventListener("message", (event) => {
      if (event.origin !== location.origin) return;
      if (!openttdState.frame || event.source !== openttdState.frame.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== "openttd") return;
      if (data.event === "ready" || data.event === "running") {
        clearReadyTimer();
        openttdState.binaryPresent = true;
        setOpenTTDStatus("openttd_status_running");
      }
      if (data.event === "paused") setOpenTTDStatus("openttd_status_paused");
      if (data.event === "exited") {
        clearReadyTimer();
        setOpenTTDStatus("openttd_status_exited");
      }
      if (data.event === "crashed") {
        clearReadyTimer();
        setOpenTTDStatus("openttd_status_crashed");
        renderOpenTTDRetry();
      }
    });
  }

  async function attachOpenTTD() {
    const pane = openttdPane();
    if (!pane) return;
    listenForShellMessages();
    if (openttdState.frame && pane.contains(openttdState.frame)) return;

    const probe = await probeOpenTTDBinary();
    if (probe === false) {
      setOpenTTDStatus("openttd_status_missing_binary");
      renderOpenTTDRetry();
      return;
    }

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
    clearReadyTimer();
    openttdState.readyTimer = window.setTimeout(() => {
      if (openttdState.frame !== frame) return;
      setOpenTTDStatus("openttd_status_timeout");
      renderOpenTTDRetry();
    }, OPENTTD_ENGINE_READY_TIMEOUT_MS);
  }

  // Quit handshake: ask the shell to flush IDBFS, then drop the iframe so the
  // wasm main loop and its memory actually go away.
  function handleOpenTTDQuit() {
    const frame = openttdState.frame;
    openttdState.frame = null;
    clearReadyTimer();
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
  window.AISystem6Runtime?.registerApplication({id:"openttd",windowName:"openttd",mount:attachOpenTTD,restore:attachOpenTTD,commands:{"open-openttd":{handler:()=>openWindow("openttd"),isAvailable:()=>!0}}});
})();
