// SPDX-License-Identifier: GPL-2.0-only

(function initDoomShell() {
  "use strict";

  var PROTOCOL_VERSION = 2;
  var params = new URLSearchParams(location.search);
  var language = params.get("lang") === "en" ? "en" : "zh";
  var runtimeReady = false;
  var storageReady = false;
  var storageError = null;
  var engineState = "loading";
  var viewportState = null;
  var wadPicker = null;
  var activeWad = null;
  var catalogBusy = false;
  var gameStarted = false;
  var enginePaused = false;
  var engineExited = false;
  var pointerLockBeforeHostPause = false;
  var shuttingDown = false;
  var touchController = null;
  var inputAnimationFrame = 0;
  var nativeInput = null;
  var nativeReleaseAll = null;
  var nativePause = null;
  var nativeResume = null;
  var nativeInputCount = 0;
  var previousGamepadButtons = Object.create(null);
  var syncTail = Promise.resolve();
  var removeConfirmation = null;
  var removeConfirmationTimer = 0;
  var engineLog = [];

  var zeroInputFrame = Object.freeze({
    move: 0,
    strafe: 0,
    turn: 0,
    fire: false,
    use: false,
    run: false,
    map: false,
    menu: false,
    weaponDelta: 0,
  });
  var lastInputFrame = zeroInputFrame;

  var copy = {
    zh: {
      title: "DOOM",
      loading: "正在装载引擎……",
      preparing: "正在准备浏览器存储……",
      needsData: "请选择本机 IWAD",
      pwadNeedsIwad: "所选文件是 PWAD；还需要一个基础 IWAD",
      importing: "正在验证并保存本机 WAD……",
      ready: "本机 IWAD 已就绪",
      starting: "正在启动 DOOM……",
      running: "正在运行",
      paused: "已暂停",
      crashed: "引擎未能启动。请重试。",
      exited: "游戏已经退出。重新装载即可再次开始。",
      importFailed: "无法导入这个 WAD。请选择有效的本机文件。",
      storageFailed: "浏览器存储不可用。请检查隐私模式或网站数据权限。",
      privacyMessage: "请选择你拥有的本机 IWAD；文件不会离开此浏览器。",
      readyMessage: "点按「开始」会解锁声音并进入游戏。",
      engineMessage: "开源引擎不包含、下载或上传任何游戏 WAD。",
      detail: "Chocolate Doom 3.1.1 · WebAssembly · 本机单人游戏",
      wadHeading: "本机游戏数据",
      privacy: "选择你拥有的 IWAD 或 Freedoom。不会上传，也不会写入 AI System 6 项目备份。",
      empty: "尚未导入 IWAD。",
      input: "支持键盘、鼠标、游戏控制器与多点触控。",
      choose: "选择 WAD…",
      remove: "移除所选 WAD",
      removeConfirm: "再点一次以移除",
      play: "开始",
      retry: "重试",
      selected: "已选择",
      iwad: "基础 IWAD",
      pwad: "附加 PWAD",
      pausedReceipt: "已暂停 · 返回窗口即可继续",
      importErrorReceipt: "导入失败；原有本机数据没有被替换。",
      removeReceipt: "再次点按“移除”以确认删除本机副本。",
    },
    en: {
      title: "DOOM",
      loading: "Loading the engine…",
      preparing: "Preparing browser storage…",
      needsData: "Choose a local IWAD",
      pwadNeedsIwad: "The selected file is a PWAD; a base IWAD is still required",
      importing: "Validating and saving the local WAD…",
      ready: "Local IWAD ready",
      starting: "Starting DOOM…",
      running: "Running",
      paused: "Paused",
      crashed: "The engine could not start. Please retry.",
      exited: "The game has exited. Reload to start again.",
      importFailed: "That WAD could not be imported. Choose a valid local file.",
      storageFailed: "Browser storage is unavailable. Check private browsing or site-data permissions.",
      privacyMessage: "Choose a local IWAD you own. The file never leaves this browser.",
      readyMessage: "Press Play to unlock audio and enter the game.",
      engineMessage: "The open-source engine contains, downloads, and uploads no game WAD.",
      detail: "Chocolate Doom 3.1.1 · WebAssembly · Local single-player",
      wadHeading: "Local game data",
      privacy: "Choose an IWAD you own or Freedoom. It is never uploaded or included in AI System 6 project backups.",
      empty: "No IWAD has been imported.",
      input: "Keyboard, mouse, game controller, and multi-touch are supported.",
      choose: "Choose WAD…",
      remove: "Remove selected WAD",
      removeConfirm: "Press again to remove",
      play: "Play",
      retry: "Retry",
      selected: "Selected",
      iwad: "Base IWAD",
      pwad: "Add-on PWAD",
      pausedReceipt: "Paused · Return to the window to continue",
      importErrorReceipt: "Import failed; existing local data was not replaced.",
      removeReceipt: "Press Remove again to delete the local copy.",
    },
  };

  var card = document.getElementById("engine-card");
  var stage = document.getElementById("game-stage");
  var canvas = document.getElementById("game-canvas");
  var touchRoot = document.getElementById("touch-controls-root");
  var receiptEl = document.getElementById("game-receipt");
  var phaseEl = document.getElementById("engine-phase");
  var messageEl = document.getElementById("engine-message");
  var detailEl = document.getElementById("engine-detail");
  var wadHeadingEl = document.getElementById("wad-heading");
  var wadPrivacyEl = document.getElementById("wad-privacy");
  var wadListEl = document.getElementById("wad-list");
  var wadEmptyEl = document.getElementById("wad-empty");
  var inputNoteEl = document.getElementById("input-note");
  var chooseEl = document.getElementById("wad-choose");
  var removeEl = document.getElementById("wad-remove");
  var playEl = document.getElementById("engine-play");
  var retryEl = document.getElementById("engine-retry");

  function text() {
    return copy[language];
  }

  function appendEngineLog(kind, line) {
    engineLog.push({ kind: kind, line: String(line) });
    if (engineLog.length > 80) engineLog.shift();
  }

  function post(event, detail) {
    try {
      if (window.parent === window) return;
      window.parent.postMessage({
        type: "aisystem6-doom",
        protocolVersion: PROTOCOL_VERSION,
        event: event,
        detail: detail || null,
      }, location.origin);
    } catch (error) {
      // The parent can disappear while the iframe is shutting down.
    }
  }

  function setReceipt(message) {
    receiptEl.textContent = message || "";
    receiptEl.hidden = !message;
  }

  function formatBytes(bytes) {
    var value = Number(bytes) || 0;
    if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1) + " MiB";
    if (value >= 1024) return Math.round(value / 1024) + " KiB";
    return value + " B";
  }

  function playableWad() {
    return activeWad && activeWad.kind === "IWAD" ? activeWad : null;
  }

  function engineIwadPath(entry) {
    if (!entry || entry.kind !== "IWAD" || !entry.path) return null;
    var knownNames = {
      "doom2.wad": true,
      "plutonia.wad": true,
      "tnt.wad": true,
      "doom.wad": true,
      "doom1.wad": true,
      "doom2f.wad": true,
      "chex.wad": true,
      "hacx.wad": true,
      "freedoom2.wad": true,
      "freedoom1.wad": true,
      "freedm.wad": true,
    };
    var canonicalName = String(entry.name || "").toLowerCase();
    if (knownNames[canonicalName]) {
      // Chocolate uses the basename to identify known IWAD missions. Keep a
      // transient canonical alias outside mounted IDBFS so removing the
      // catalogued WAD never leaves a second persistent copy behind.
      ensureDirectory("/tmp/aisystem6-doom-iwad");
      var canonicalPath = "/tmp/aisystem6-doom-iwad/" + canonicalName;
      if (canonicalPath !== entry.path) {
        try {
          if (window.Module.FS.analyzePath(canonicalPath).exists) window.Module.FS.unlink(canonicalPath);
          // A transient symlink preserves the canonical basename Chocolate
          // uses for mission detection without copying a 10–30 MiB IWAD in
          // memory on phones and tablets. Very old runtimes retain a copy
          // fallback, but the pinned Emscripten FS supports symlinks.
          if (typeof window.Module.FS.symlink === "function") {
            window.Module.FS.symlink(entry.path, canonicalPath);
          } else {
            window.Module.FS.writeFile(canonicalPath, window.Module.FS.readFile(entry.path));
          }
        } catch (error) {
          return entry.path;
        }
      }
      return canonicalPath;
    }
    return entry.path;
  }

  function renderWadList() {
    var entries = wadPicker ? wadPicker.list() : [];
    activeWad = wadPicker ? wadPicker.active() : null;
    wadListEl.textContent = "";
    entries.forEach(function (entry) {
      var button = document.createElement("button");
      var marker = document.createElement("span");
      var name = document.createElement("span");
      var meta = document.createElement("span");
      var selected = !!activeWad && entry.id === activeWad.id;
      button.type = "button";
      button.className = "wad-entry";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", selected ? "true" : "false");
      button.disabled = catalogBusy || gameStarted;
      button.dataset.wadId = entry.id;
      marker.textContent = selected ? "●" : "○";
      marker.setAttribute("aria-hidden", "true");
      name.className = "wad-entry-name";
      name.textContent = entry.name;
      meta.className = "wad-entry-meta";
      meta.textContent = (entry.kind === "IWAD" ? text().iwad : text().pwad) + " · " + formatBytes(entry.bytes);
      button.append(marker, name, meta);
      button.addEventListener("click", function () { selectWad(entry.id); });
      wadListEl.appendChild(button);
    });
    wadListEl.hidden = entries.length === 0;
    wadEmptyEl.hidden = entries.length !== 0;
  }

  function render() {
    var strings = text();
    var playingSurface = gameStarted && (
      engineState === "starting" || engineState === "running" || engineState === "paused"
    );
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    document.body.dataset.engineState = engineState;
    card.hidden = playingSurface;
    stage.hidden = !playingSurface;
    document.title = strings.title + " engine";
    detailEl.textContent = strings.detail;
    wadHeadingEl.textContent = strings.wadHeading;
    wadPrivacyEl.textContent = strings.privacy;
    wadEmptyEl.textContent = strings.empty;
    inputNoteEl.textContent = strings.input;
    chooseEl.textContent = strings.choose;
    removeEl.textContent = removeConfirmation ? strings.removeConfirm : strings.remove;
    playEl.textContent = strings.play;
    retryEl.textContent = strings.retry;
    chooseEl.disabled = !runtimeReady || !storageReady || catalogBusy || gameStarted || shuttingDown;
    removeEl.hidden = !activeWad || gameStarted;
    removeEl.disabled = catalogBusy || shuttingDown;
    playEl.disabled = !runtimeReady || !storageReady || !playableWad() || catalogBusy || gameStarted || shuttingDown;
    retryEl.hidden = engineState !== "crashed" && engineState !== "exited";

    if (engineState === "loading") {
      phaseEl.textContent = strings.loading;
      messageEl.textContent = strings.engineMessage;
    } else if (engineState === "preparing") {
      phaseEl.textContent = strings.preparing;
      messageEl.textContent = strings.engineMessage;
    } else if (engineState === "importing") {
      phaseEl.textContent = strings.importing;
      messageEl.textContent = strings.privacyMessage;
    } else if (engineState === "ready") {
      phaseEl.textContent = strings.ready;
      messageEl.textContent = strings.readyMessage;
    } else if (engineState === "starting") {
      phaseEl.textContent = strings.starting;
      messageEl.textContent = strings.readyMessage;
    } else if (engineState === "running") {
      phaseEl.textContent = strings.running;
      messageEl.textContent = strings.readyMessage;
    } else if (engineState === "paused") {
      phaseEl.textContent = strings.paused;
      messageEl.textContent = strings.readyMessage;
    } else if (engineState === "import-failed") {
      phaseEl.textContent = strings.importFailed;
      messageEl.textContent = strings.privacyMessage;
    } else if (engineState === "exited") {
      phaseEl.textContent = strings.exited;
      messageEl.textContent = strings.engineMessage;
    } else if (engineState === "crashed") {
      phaseEl.textContent = storageError ? strings.storageFailed : strings.crashed;
      messageEl.textContent = strings.engineMessage;
    } else {
      phaseEl.textContent = activeWad && activeWad.kind === "PWAD" ? strings.pwadNeedsIwad : strings.needsData;
      messageEl.textContent = strings.privacyMessage;
    }

    if (engineState === "paused") setReceipt(strings.pausedReceipt);
    else if (engineState === "import-failed") setReceipt(strings.importErrorReceipt);
    else if (engineState === "running") setReceipt("");
  }

  function setState(next) {
    engineState = next;
    render();
  }

  function viewportSnapshot(detail) {
    var cssWidth = Math.max(1, Math.round(Number(detail && detail.cssWidth) || window.innerWidth));
    var cssHeight = Math.max(1, Math.round(Number(detail && detail.cssHeight) || window.innerHeight));
    return Object.freeze({
      cssWidth: cssWidth,
      cssHeight: cssHeight,
      dpr: Math.max(1, Number(detail && detail.dpr) || window.devicePixelRatio || 1),
      orientation: cssHeight >= cssWidth ? "portrait" : "landscape",
    });
  }

  function ensureDirectory(path) {
    var FS = window.Module.FS;
    if (typeof FS.analyzePath === "function" && FS.analyzePath(path).exists) return;
    try {
      FS.mkdir(path);
    } catch (error) {
      if (!error || error.errno !== window.Module.ERRNO_CODES.EEXIST) throw error;
    }
  }

  function runFsSync(populate) {
    return new Promise(function (resolve, reject) {
      try {
        window.Module.FS.syncfs(!!populate, function (error) {
          if (error) reject(error);
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function syncFs(populate) {
    var run = function () { return runFsSync(populate); };
    var result = syncTail.then(run, run);
    syncTail = result.catch(function () {});
    return result;
  }

  function mountStorage() {
    setState("preparing");
    ensureDirectory("/doom");
    var idbfs = window.Module.FS.filesystems && window.Module.FS.filesystems.IDBFS;
    if (!idbfs) throw new Error("IDBFS is not linked into the engine runtime");
    window.Module.FS.mount(idbfs, {}, "/doom");
    window.Module.addRunDependency("ai-system6-doom-idbfs");
    syncFs(true).then(function () {
      ensureDirectory("/doom/iwads");
      ensureDirectory("/doom/saves");
      ensureDirectory("/doom/config");
      storageReady = true;
    }).catch(function (error) {
      storageError = error;
    }).finally(function () {
      window.Module.removeRunDependency("ai-system6-doom-idbfs");
    });
  }

  function publicWadDetail(entry) {
    if (!entry) return null;
    return {
      id: entry.id,
      name: entry.name,
      bytes: entry.bytes,
      kind: entry.kind,
      sha256: entry.sha256,
    };
  }

  function announceWadState() {
    activeWad = wadPicker ? wadPicker.active() : null;
    renderWadList();
    if (playableWad()) {
      setState("ready");
      post("wad-ready", publicWadDetail(activeWad));
    } else {
      setState("needs-data");
      post("needs-data", {
        iwadPresent: false,
        pwadSelected: !!activeWad && activeWad.kind === "PWAD",
      });
    }
  }

  function failImport(error) {
    catalogBusy = false;
    renderWadList();
    setState("import-failed");
    post("import-failed", {
      code: error && error.code ? String(error.code) : "IMPORT_FAILED",
      message: String(error && error.message ? error.message : error),
    });
  }

  function chooseWad() {
    if (!wadPicker || catalogBusy || gameStarted) return;
    var selection;
    try {
      // pickFile() performs input.click() before returning, preserving the
      // browser's transient user activation. The selected File is explicitly
      // approved by the picker before any asynchronous validation begins.
      selection = wadPicker.pickFile();
    } catch (error) {
      failImport(error);
      return;
    }
    selection.then(function (file) {
      if (!file) return null;
      catalogBusy = true;
      setState("importing");
      post("wad-importing", { name: String(file.name || "local.wad"), bytes: Number(file.size) || 0 });
      return wadPicker.importFile(file).then(function () {
        catalogBusy = false;
        announceWadState();
      });
    }).catch(failImport);
  }

  function selectWad(id) {
    if (!wadPicker || catalogBusy || gameStarted) return;
    clearRemoveConfirmation();
    catalogBusy = true;
    render();
    renderWadList();
    wadPicker.select(id).then(function () {
      catalogBusy = false;
      announceWadState();
    }).catch(failImport);
  }

  function clearRemoveConfirmation() {
    if (removeConfirmationTimer) window.clearTimeout(removeConfirmationTimer);
    removeConfirmationTimer = 0;
    removeConfirmation = null;
    setReceipt("");
    render();
  }

  function removeWad() {
    if (!wadPicker || !activeWad || catalogBusy || gameStarted) return;
    if (!removeConfirmation || removeConfirmation.id !== activeWad.id) {
      removeConfirmation = { id: activeWad.id };
      setReceipt(text().removeReceipt);
      render();
      removeConfirmationTimer = window.setTimeout(clearRemoveConfirmation, 4000);
      return;
    }
    var id = activeWad.id;
    clearRemoveConfirmation();
    catalogBusy = true;
    render();
    wadPicker.remove(id, { confirmed: true, id: id }).then(function () {
      catalogBusy = false;
      announceWadState();
    }).catch(failImport);
  }

  function audioContext() {
    return window.Module && window.Module.SDL2 && window.Module.SDL2.audioContext
      ? window.Module.SDL2.audioContext
      : null;
  }

  function suspendAudio() {
    var context = audioContext();
    if (!context || typeof context.suspend !== "function") return Promise.resolve(false);
    try {
      return Promise.resolve(context.suspend()).then(function () { return true; }, function () { return false; });
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  function resumeAudio() {
    var context = audioContext();
    if (!context || typeof context.resume !== "function") return Promise.resolve(false);
    try {
      return Promise.resolve(context.resume()).then(function () { return true; }, function () { return false; });
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  function touchCapable() {
    return (Number(navigator.maxTouchPoints) || 0) > 0
      || (window.matchMedia && window.matchMedia("(any-pointer: coarse)").matches);
  }

  function mergeAxis(first, second) {
    return Math.abs(Number(second) || 0) > Math.abs(Number(first) || 0)
      ? Number(second) || 0
      : Number(first) || 0;
  }

  function gamepadButton(button) {
    return !!button && (button.pressed || Number(button.value) > 0.35);
  }

  function axisWithDeadZone(value, deadZone) {
    var number = Math.max(-1, Math.min(1, Number(value) || 0));
    var magnitude = Math.abs(number);
    var zone = Number(deadZone) || 0.16;
    if (magnitude <= zone) return 0;
    return Math.sign(number) * ((magnitude - zone) / (1 - zone));
  }

  function readGamepadFrame() {
    var pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    var pad = Array.from(pads || []).find(function (candidate) { return candidate && candidate.connected; });
    if (!pad) {
      previousGamepadButtons = Object.create(null);
      return zeroInputFrame;
    }
    var buttons = pad.buttons || [];
    var axes = pad.axes || [];
    var key = String(pad.index) + ":" + String(pad.id || "controller");
    var current = {
      previousWeapon: gamepadButton(buttons[4]),
      nextWeapon: gamepadButton(buttons[5]),
      map: gamepadButton(buttons[8]),
      menu: gamepadButton(buttons[9]),
    };
    var previous = previousGamepadButtons[key] || {};
    previousGamepadButtons = Object.create(null);
    previousGamepadButtons[key] = current;
    return Object.freeze({
      move: -axisWithDeadZone(axes[1], 0.16),
      strafe: axisWithDeadZone(axes[0], 0.16),
      turn: axisWithDeadZone(axes[2], 0.12),
      fire: gamepadButton(buttons[7]) || gamepadButton(buttons[2]),
      use: gamepadButton(buttons[0]),
      run: gamepadButton(buttons[1]) || gamepadButton(buttons[10]),
      map: current.map && !previous.map,
      menu: current.menu && !previous.menu,
      weaponDelta: current.nextWeapon && !previous.nextWeapon ? 1
        : current.previousWeapon && !previous.previousWeapon ? -1 : 0,
    });
  }

  function mergeInputFrames(touch, gamepad) {
    return Object.freeze({
      move: mergeAxis(touch.move, gamepad.move),
      strafe: mergeAxis(touch.strafe, gamepad.strafe),
      turn: mergeAxis(touch.turn, gamepad.turn),
      fire: !!touch.fire || !!gamepad.fire,
      use: !!touch.use || !!gamepad.use,
      run: !!touch.run || !!gamepad.run,
      map: !!touch.map || !!gamepad.map,
      menu: !!touch.menu || !!gamepad.menu,
      weaponDelta: touch.weaponDelta || gamepad.weaponDelta || 0,
    });
  }

  function sendNativeFrame(frame) {
    lastInputFrame = Object.freeze({
      move: Number(frame.move) || 0,
      strafe: Number(frame.strafe) || 0,
      turn: Number(frame.turn) || 0,
      fire: !!frame.fire,
      use: !!frame.use,
      run: !!frame.run,
      map: !!frame.map,
      menu: !!frame.menu,
      weaponDelta: Math.sign(Number(frame.weaponDelta) || 0),
    });
    if (!nativeInput || !gameStarted || enginePaused || engineExited) return lastInputFrame;
    nativeInput(
      lastInputFrame.move,
      lastInputFrame.strafe,
      lastInputFrame.turn,
      lastInputFrame.fire ? 1 : 0,
      lastInputFrame.use ? 1 : 0,
      lastInputFrame.run ? 1 : 0,
      lastInputFrame.map ? 1 : 0,
      lastInputFrame.menu ? 1 : 0,
      lastInputFrame.weaponDelta
    );
    nativeInputCount += 1;
    return lastInputFrame;
  }

  function releaseInputs(reason) {
    if (touchController) touchController.release(reason || "unknown");
    previousGamepadButtons = Object.create(null);
    lastInputFrame = zeroInputFrame;
    if (nativeReleaseAll && gameStarted && !engineExited) nativeReleaseAll();
    post("input-reset", { reason: reason || "unknown", frame: zeroInputFrame });
    return zeroInputFrame;
  }

  function inputTick() {
    inputAnimationFrame = 0;
    if (!gameStarted || engineExited || shuttingDown) return;
    if (!enginePaused) {
      var touch = touchController ? touchController.snapshot() : zeroInputFrame;
      sendNativeFrame(mergeInputFrames(touch, readGamepadFrame()));
    }
    inputAnimationFrame = window.requestAnimationFrame(inputTick);
  }

  function startInputLoop() {
    if (inputAnimationFrame) return;
    inputAnimationFrame = window.requestAnimationFrame(inputTick);
  }

  function attachTouchControls(rebuild) {
    if (rebuild && touchController) {
      touchController.destroy();
      touchController = null;
    }
    if (touchController || !window.AISystem6DoomTouchControls) return;
    touchController = window.AISystem6DoomTouchControls.attach({
      root: touchRoot,
      onFrame: function () {
        // The regular animation tick consumes a snapshot exactly once. This
        // callback exists to keep the control contract event-driven without
        // duplicating Map/Menu/weapon pulses.
      },
      onRelease: function (reason) {
        previousGamepadButtons = Object.create(null);
        lastInputFrame = zeroInputFrame;
        if (nativeReleaseAll && gameStarted && !engineExited) nativeReleaseAll();
        post("input-reset", { reason: reason || "touch-release", frame: zeroInputFrame });
      },
    });
    touchController.updateViewport(viewportState || viewportSnapshot(null));
    touchController.setEnabled(touchCapable());
    document.body.dataset.touchControls = touchCapable() ? "visible" : "hidden";
  }

  function requestPointerLockFromGesture() {
    if (!window.matchMedia || !window.matchMedia("(any-pointer: fine)").matches) return;
    if (!canvas.requestPointerLock || document.pointerLockElement === canvas) return;
    try {
      var result = canvas.requestPointerLock();
      if (result && typeof result.catch === "function") result.catch(function () {});
    } catch (error) {
      // Pointer lock is an enhancement. Keyboard play remains available.
    }
  }

  function startGameFromGesture() {
    var selected = playableWad();
    if (!runtimeReady || !storageReady || !selected || catalogBusy || gameStarted || shuttingDown) return;
    gameStarted = true;
    enginePaused = false;
    engineExited = false;
    pointerLockBeforeHostPause = false;
    setState("starting");
    post("starting", publicWadDetail(selected));
    attachTouchControls(false);
    var saveDirectory = "/doom/saves/" + selected.sha256.slice(0, 16);
    ensureDirectory(saveDirectory);
    canvas.focus({ preventScroll: true });
    requestPointerLockFromGesture();
    var selectedEnginePath = engineIwadPath(selected);
    var args = [
      "-iwad", selectedEnginePath,
      "-config", "/doom/config/default.cfg",
      "-extraconfig", "/doom/config/chocolate-doom.cfg",
      "-savedir", saveDirectory,
      "-window",
      "-width", "800",
      "-height", "600",
    ];
    if (!window.matchMedia || !window.matchMedia("(any-pointer: fine)").matches) args.push("-nomouse");
    try {
      // This is the only callMain site. It runs synchronously inside the Play
      // click so SDL can create Web Audio under the browser user gesture.
      window.Module.callMain(args);
      resumeAudio();
      startInputLoop();
      window.setTimeout(function () {
        if (engineExited || shuttingDown || !gameStarted) return;
        setState("running");
        post("running", { audio: !!audioContext(), input: "native-web-bridge" });
      }, 0);
    } catch (error) {
      gameStarted = false;
      setState("crashed");
      post("crashed", { stage: "main", message: String(error) });
    }
  }

  function requestStorageReceipt(eventName) {
    if (!runtimeReady || !storageReady) {
      post(eventName, { ok: !storageError, skipped: true });
      return Promise.resolve(!storageError);
    }
    return syncFs(false).then(function () {
      post(eventName, { ok: true });
      return true;
    }).catch(function (error) {
      post("save-failed", { message: String(error) });
      post(eventName, { ok: false, error: String(error) });
      return false;
    });
  }

  function requestShutdownReceipt() {
    if (!runtimeReady || !storageReady) {
      post("shutdown-ack", { ok: !storageError, skipped: true });
      return Promise.resolve(!storageError);
    }
    return syncFs(false).then(function () {
      post("shutdown-ack", { ok: true });
      return true;
    }).catch(function (error) {
      post("save-failed", { message: String(error) });
      post("shutdown-ack", { ok: false, error: String(error) });
      return false;
    });
  }

  function pauseEngine(reason) {
    if (reason === "host-pause" || reason === "document-hidden") {
      pointerLockBeforeHostPause = document.pointerLockElement === canvas;
      if (document.pointerLockElement === canvas && typeof document.exitPointerLock === "function") {
        try { document.exitPointerLock(); } catch (error) { /* Best effort. */ }
      }
    }
    releaseInputs(reason || "pause");
    if (!gameStarted || engineExited) {
      post("paused", { started: false });
      return;
    }
    if (!enginePaused && nativePause) nativePause();
    enginePaused = true;
    suspendAudio();
    setState("paused");
    post("paused", { started: true });
  }

  function resumeEngine() {
    if (!gameStarted || engineExited) {
      announceWadState();
      return;
    }
    if (enginePaused && nativeResume) nativeResume();
    enginePaused = false;
    resumeAudio();
    setState("running");
    if (pointerLockBeforeHostPause) {
      setReceipt(language === "en"
        ? "Click the game to recapture the mouse."
        : "点按游戏画面以重新捕捉鼠标。");
    }
    pointerLockBeforeHostPause = false;
    post("running", { resumed: true, pointerLockRequested: false });
  }

  function initializeRuntimeAdapters() {
    nativeInput = window.Module.cwrap("AI_DoomWebInput", null, [
      "number", "number", "number", "number", "number", "number", "number", "number", "number"
    ]);
    nativeReleaseAll = window.Module.cwrap("AI_DoomWebReleaseAll", null, []);
    nativePause = window.Module.cwrap("AI_DoomWebPause", null, []);
    nativeResume = window.Module.cwrap("AI_DoomWebResume", null, []);
    wadPicker = window.AISystem6DoomWadPicker.create({
      FS: window.Module.FS,
      syncFs: syncFs,
    });
    renderWadList();
    announceWadState();
  }

  window.Module = {
    noInitialRun: true,
    canvas: canvas,
    preRun: [mountStorage],
    print: function (line) {
      appendEngineLog("stdout", line);
      console.log(line);
    },
    printErr: function (line) {
      appendEngineLog("stderr", line);
      console.error(line);
    },
    setStatus: function (status) {
      if (status && !runtimeReady) phaseEl.textContent = status;
    },
    onRuntimeInitialized: function () {
      runtimeReady = true;
      post("engine-ready", { engine: "Chocolate Doom", version: "3.1.1", protocolVersion: PROTOCOL_VERSION });
      if (storageError) {
        setState("crashed");
        post("crashed", { stage: "storage", message: String(storageError) });
        return;
      }
      try {
        initializeRuntimeAdapters();
      } catch (error) {
        storageError = error;
        setState("crashed");
        post("crashed", { stage: "storage-catalog", message: String(error) });
      }
    },
    onAbort: function (reason) {
      engineExited = true;
      releaseInputs("abort");
      setState("crashed");
      post("crashed", { stage: "engine", message: String(reason || "abort") });
    },
    onExit: function (status) {
      engineExited = true;
      enginePaused = true;
      releaseInputs("exit");
      setState("exited");
      post("exited", { status: Number(status) || 0 });
      requestStorageReceipt("synced");
    },
  };

  function handleHostMessage(event) {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.type !== "aisystem6-doom-host" || data.protocolVersion !== PROTOCOL_VERSION) return;
    if (data.command === "set-language") {
      language = data.detail && data.detail.language === "en" ? "en" : "zh";
      render();
      renderWadList();
      if (touchController) attachTouchControls(true);
    }
    if (data.command === "set-appearance") {
      document.body.dataset.appearance = String(data.detail && data.detail.themeId || "classic");
    }
    if (data.command === "set-viewport") {
      releaseInputs("viewport-change");
      viewportState = viewportSnapshot(data.detail);
      if (touchController) touchController.updateViewport(viewportState);
    }
    if (data.command === "release-inputs") releaseInputs(data.detail && data.detail.reason);
    if (data.command === "pause") {
      pauseEngine("host-pause");
      requestStorageReceipt("synced");
    }
    if (data.command === "resume") resumeEngine();
    if (data.command === "sync") requestStorageReceipt("synced");
    if (data.command === "shutdown") {
      shuttingDown = true;
      releaseInputs("shutdown");
      if (gameStarted && nativePause) nativePause();
      suspendAudio();
      requestShutdownReceipt();
    }
    if (data.command === "start") {
      // Session restore and host commands may reveal the picker, but only the
      // iframe Play button's own user gesture may invoke main or Web Audio.
      if (runtimeReady && storageReady && wadPicker) announceWadState();
    }
  }

  window.addEventListener("message", handleHostMessage);
  window.addEventListener("blur", function () { releaseInputs("blur"); });
  window.addEventListener("resize", function () {
    releaseInputs("resize");
    viewportState = viewportSnapshot(null);
    if (touchController) touchController.updateViewport(viewportState);
  });
  window.addEventListener("orientationchange", function () {
    releaseInputs("orientationchange");
    viewportState = viewportSnapshot(null);
    if (touchController) touchController.updateViewport(viewportState);
  });
  document.addEventListener("pointercancel", function () { releaseInputs("pointercancel"); }, true);
  document.addEventListener("pointerlockchange", function () {
    if (gameStarted && document.pointerLockElement !== canvas) releaseInputs("pointerlock-released");
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      pauseEngine("document-hidden");
      requestStorageReceipt("synced");
    }
  });
  window.addEventListener("pagehide", function () {
    releaseInputs("pagehide");
    requestStorageReceipt("synced");
  });
  window.addEventListener("error", function (event) {
    if (runtimeReady) return;
    setState("crashed");
    post("crashed", { stage: "script", message: String(event.message || "script error") });
  });
  window.addEventListener("unhandledrejection", function (event) {
    setState("crashed");
    post("crashed", { stage: "promise", message: String(event.reason || "promise rejection") });
  });
  canvas.addEventListener("pointerdown", function (event) {
    if (gameStarted && event.pointerType !== "touch") {
      setReceipt("");
      requestPointerLockFromGesture();
    }
  });
  chooseEl.addEventListener("click", chooseWad);
  removeEl.addEventListener("click", removeWad);
  playEl.addEventListener("click", startGameFromGesture);
  retryEl.addEventListener("click", function () { location.reload(); });

  window.AISystem6DoomShell = Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    inputFrame: zeroInputFrame,
    releaseInputs: releaseInputs,
    viewportSnapshot: viewportSnapshot,
    debugSnapshot: function () {
      return Object.freeze({
        state: engineState,
        gameStarted: gameStarted,
        enginePaused: enginePaused,
        nativeInputCount: nativeInputCount,
        lastInputFrame: lastInputFrame,
        activeWad: publicWadDetail(activeWad),
        viewport: viewportState,
        audioState: audioContext() ? audioContext().state : "unavailable",
        engineLog: engineLog.slice(),
      });
    },
  });

  viewportState = viewportSnapshot(null);
  render();
  post("shell-ready", viewportState);

  var engineScript = document.createElement("script");
  engineScript.src = "chocolate-doom.js";
  engineScript.onerror = function () {
    setState("crashed");
    post("crashed", { stage: "download", message: "chocolate-doom.js" });
  };
  document.body.appendChild(engineScript);
})();
