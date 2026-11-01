(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var lang = params.get("lang") === "en" ? "en" : "zh";
  var text = {
    zh: {
      loading: "正在装载运输大亨……",
      preparing: "正在准备游戏……",
      exited: "感谢游玩。关闭本窗口即可。",
      crashed: "游戏出错了。请关闭窗口后重新打开。",
      storage: "存档保存在本浏览器内。清除网站数据会删除存档。",
      title: "OpenTTD 运输大亨",
    },
    en: {
      loading: "Loading OpenTTD…",
      preparing: "Preparing the game…",
      exited: "Thank you for playing. You can close this window.",
      crashed: "The game crashed. Close the window and open it again.",
      storage: "Saves live in this browser. Clearing site data deletes them.",
      title: "OpenTTD",
    },
  }[lang];

  var bootEl = document.getElementById("boot");
  var bootTitle = document.getElementById("boot-title");
  var bootMessage = document.getElementById("boot-message");
  var bootBar = document.getElementById("boot-bar");
  var canvas = document.getElementById("canvas");
  /* The right button belongs to the game (map scrolling, touch long-press). */
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  bootTitle.textContent = text.title;
  bootMessage.textContent = text.loading;

  function post(event, detail) {
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ type: "openttd", event: event, detail: detail || null }, location.origin);
      }
    } catch (e) { /* detached parent is fine */ }
  }

  function showEnd(message, isError) {
    canvas.style.display = "none";
    bootEl.classList.remove("is-hidden");
    document.getElementById("boot-card").className = "boot-card" + (isError ? " boot-error" : "");
    bootMessage.textContent = message;
    bootBar.parentElement.style.display = "none";
  }

  /* ---- First-run configuration ------------------------------------- */
  /* Only the page knows the screen, so the page builds the default
     openttd.cfg. pre.js writes it into IDBFS when no config exists yet. */
  var smallSide = Math.min(window.innerWidth, window.innerHeight);
  var isPhone = smallSide < 700;
  var guiScale = isPhone ? 200 : 100;
  /* Ask for the pixels the screen actually has, not the ones CSS counts.
     A phone reports 390 CSS px across and owns 1170; opening the game at 390
     and then doubling the GUI for fingers left OpenTTD about 195 units of
     width to lay out a interface designed against 640x480, so the build
     toolbar ran off one edge and dialogs off the other. Asking for the device
     pixels and keeping the doubled GUI gives it room AND keeps touch targets
     the same physical size -- and it draws at the panel's real resolution
     instead of a third of it. Capped, because the backing store is memory. */
  var pixelRatio = Math.min(window.devicePixelRatio || 1, isPhone ? 3 : 2);
  /* One source of truth for the surface size. The boot seed and the live
     resize below used to compute this separately and disagree, and since the
     ResizeObserver fires once on boot, the resize path silently won. */
  function surfaceSize() {
    return {
      w: Math.max(320, Math.min(2560, Math.round(window.innerWidth * pixelRatio))),
      h: Math.max(240, Math.min(1600, Math.round(window.innerHeight * pixelRatio))),
    };
  }
  window.AISystem6OpenttdSurfaceSize = surfaceSize;
  var seeded = surfaceSize();
  var resW = seeded.w;
  var resH = seeded.h;
  if (isPhone) guiScale = pixelRatio >= 3 ? 400 : 300;
  var fontPath = "/font/fusion-pixel-12px-proportional-zh_hans.ttf";
  var defaultConfig = [
    "[misc]",
    "language = " + (lang === "zh" ? "simplified_chinese.lng" : "english.lng"),
    "resolution = " + resW + "," + resH,
    "gui_scale = " + guiScale,
    "small_font = " + fontPath,
    "medium_font = " + fontPath,
    "large_font = " + fontPath,
    "mono_font = " + fontPath,
    "small_size = 12",
    "medium_size = 12",
    "large_size = 24",
    "mono_size = 12",
    "global_aa = false",
    "",
    "[gui]",
    "osk_activation = single",
    "hover_delay_ms = 0",
    "",
    "[network]",
    // A quiet desk does not phone home: never show the survey dialog.
    "participate_survey = no",
    "",
  ].join("\n");

  var totalDeps = 42;
  var doneDeps = 0;
  var lastDeps = 1;

  /* Runtime-ready flag for the resize path. Do not read Module.calledRun:
     emscripten stopped setting it on Module after 3.1.x, and a guard on it
     silently disables live resize on newer toolchains. */
  var runtimeReady = false;

  window.Module = {
    preRun: [],
    postRun: [],
    arguments: [],
    canvas: (function () {
      canvas.addEventListener("webglcontextlost", function (e) {
        e.preventDefault();
        showEnd(text.crashed, true);
        post("crashed", "webglcontextlost");
      }, false);
      return canvas;
    })(),
    openttdDefaultConfig: defaultConfig,
    /* Read at seeding time (a function, not a value): the iframe may not be
       laid out yet when this script parses, and a too-early innerHeight
       would bake a tiny game surface into the config. */
    openttdResolution: function () {
      return Math.max(320, Math.round(window.innerWidth)) + "," + Math.max(240, Math.round(window.innerHeight));
    },

    print: function (t) { console.log(t); },
    printErr: function (t) { console.error(t); },

    setStatus: function (t) {
      if (!t) return;
      var m = t.match(/(\d+)\/(\d+)/);
      if (m) bootBar.style.width = Math.min(100, (100 * parseInt(m[1], 10)) / parseInt(m[2], 10)) + "%";
    },

    monitorRunDependencies: function (left) {
      if (left < lastDeps) doneDeps += 1;
      lastDeps = left;
      var doing = Math.min(doneDeps + 1, totalDeps);
      bootMessage.textContent = text.preparing + " (" + doing + " / " + totalDeps + ")";
      bootBar.style.width = Math.min(100, (100 * doing) / totalDeps) + "%";
      if (left === 0) {
        bootEl.classList.add("is-hidden");
        post("ready");
      }
    },

    onRuntimeInitialized: function () { runtimeReady = true; },
    onExit: function () { showEnd(text.exited, false); post("exited"); },
    onAbort: function () { showEnd(text.crashed, true); post("crashed"); },
    onBootstrap: function () { bootMessage.textContent = text.preparing; },
    onBootstrapFailed: function () { showEnd(text.crashed, true); post("crashed", "bootstrap"); },
    onBootstrapReload: function () { bootMessage.textContent = text.preparing; },
    onWarningFs: function () {
      /* The upstream shell shows a big storage warning. We keep it as a
         console note; the desktop side surfaces storage rules already. */
      console.info(text.storage);
    },
  };

  window.onerror = function () {
    showEnd(text.crashed, true);
    post("crashed", "onerror");
  };

  /* ---- Live resize -------------------------------------------------- */
  /* Phone rotation and System 6 window resizing change the canvas CSS
     size, but the SDL emscripten port never notices. Our engine patch
     exports em_openttd_set_resolution (see tooling/games/openttd); call it
     debounced whenever the viewport settles on a new size. */
  (function liveResize() {
    var timer = 0;
    function apply() {
      timer = 0;
      var size = window.AISystem6OpenttdSurfaceSize();
      var w = size.w;
      var h = size.h;
      try {
        if (runtimeReady && window.Module && typeof Module.ccall === "function") {
          Module.ccall("em_openttd_set_resolution", null, ["number", "number"], [w, h]);
        }
      } catch (e) { /* the game may not be up yet; the boot seed covers that */ }
    }
    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(apply, 150);
    }
    /* A resumed game re-measures through the same debounce: the window may
       have been resized while its main loop was stopped. */
    window.AISystem6OpenttdResize = schedule;
    window.addEventListener("resize", schedule);
    /* An embedded iframe does not always get a window resize event when
       its element changes size; a ResizeObserver on the root always fires. */
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(schedule).observe(document.documentElement);
    }
    /* Last-resort reconciliation: event delivery into iframes varies by
       browser, and a stale surface stretches the whole game. Cheap check. */
    setInterval(function () {
      var c = document.getElementById("canvas");
      if (!c || !runtimeReady || !window.Module) return;
      var size = window.AISystem6OpenttdSurfaceSize();
      var w = size.w;
      var h = size.h;
      if (Math.abs(c.width - w) > 2 || Math.abs(c.height - h) > 2) schedule();
    }, 2000);
  })();

  /* ---- Portrait hint ------------------------------------------------- */
  /* Portrait play works, but some game dialogs are wider than a phone
     screen. Suggest landscape once per session; never block play. */
  (function portraitHint() {
    var hintText = lang === "zh"
      ? "横屏玩更舒服。轻点关闭。"
      : "Landscape is roomier. Tap to dismiss.";
    var shown = false;
    function maybeShow() {
      if (shown) return;
      try { if (sessionStorage.getItem("openttd-rotate-hint") === "done") return; } catch (e) { /* private mode */ }
      var isTouch = window.matchMedia("(hover: none)").matches;
      var isNarrowPortrait = window.innerHeight > window.innerWidth && window.innerWidth < 600;
      if (!isTouch || !isNarrowPortrait) return;
      shown = true;
      var hint = document.createElement("div");
      hint.id = "rotate-hint";
      hint.textContent = "↻ " + hintText;
      document.body.appendChild(hint);
      function dismiss() {
        hint.remove();
        try { sessionStorage.setItem("openttd-rotate-hint", "done"); } catch (e) { /* ok */ }
      }
      hint.addEventListener("click", dismiss);
      hint.addEventListener("touchstart", function (e) { e.preventDefault(); e.stopPropagation(); dismiss(); }, { passive: false });
      setTimeout(dismiss, 8000);
    }
    window.addEventListener("resize", maybeShow);
    maybeShow();
  })();

  /* ---- Persistence safety ------------------------------------------ */
  var syncInFlight = false;
  var syncQueued = false;
  function sync() {
    if (syncInFlight) {
      syncQueued = true;
      return;
    }
    if (typeof window.openttd_syncfs !== "function") return;
    syncInFlight = true;
    try {
      window.openttd_syncfs(function () {
        syncInFlight = false;
        if (!syncQueued) return;
        syncQueued = false;
        sync();
      });
    } catch (e) {
      /* The wasm runtime may not be ready yet. A later lifecycle signal can
         retry; never leave the queue permanently locked. */
      syncInFlight = false;
    }
  }
  /* ---- Suspend / resume --------------------------------------------- */
  /* The host asks for this whenever the window, the app, or the whole page
     leaves the foreground. Stopping the emscripten main loop is what actually
     stops the game costing CPU and battery; simply hiding the pane leaves a
     full-speed simulation running behind a blank rectangle. SDL also keeps
     whatever mouse button was down when the surface went away, so the loop
     never stops before the buttons are let go. */
  var loopPaused = false;
  function releaseHeldButtons() {
    if (typeof window.AISystem6OpenttdReleaseTouch === "function") {
      try { window.AISystem6OpenttdReleaseTouch(); } catch (e) { /* best effort */ }
    }
    [0, 2].forEach(function (button) {
      try {
        canvas.dispatchEvent(new MouseEvent("mouseup", {
          bubbles: true, cancelable: true, clientX: 0, clientY: 0, button: button, buttons: 0,
        }));
      } catch (e) { /* best effort */ }
    });
  }
  function pauseGame() {
    if (loopPaused) return;
    releaseHeldButtons();
    loopPaused = true;
    try {
      if (window.Module && typeof window.Module.pauseMainLoop === "function") window.Module.pauseMainLoop();
    } catch (e) { /* an unbuilt runtime has no loop to pause */ }
    sync();
    post("paused");
  }
  function resumeGame() {
    if (!loopPaused) return;
    loopPaused = false;
    try {
      if (window.Module && typeof window.Module.resumeMainLoop === "function") window.Module.resumeMainLoop();
    } catch (e) { /* nothing to resume */ }
    /* The canvas may have been resized while the loop was stopped. */
    if (typeof window.AISystem6OpenttdResize === "function") window.AISystem6OpenttdResize();
    post("running");
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") pauseGame();
    else resumeGame();
  });
  window.addEventListener("pagehide", function () {
    releaseHeldButtons();
    sync();
  });
  window.addEventListener("message", function (event) {
    if (event.origin !== location.origin) return;
    var data = event.data;
    if (!data || data.type !== "openttd-host") return;
    if (data.command === "sync") sync();
    if (data.command === "pause") pauseGame();
    if (data.command === "resume") resumeGame();
  });

  /* ---- Touch layer -------------------------------------------------- */
  /* OpenTTD has no touchscreen gestures of its own; SDL only maps one
     finger to the left mouse button. This layer owns ALL touches (capture
     phase on document, so SDL's canvas handlers never see them) and
     speaks mouse to the game:
       tap                -> left click
       drag               -> left-button drag (build rail, select area)
       long-press         -> right button (hold + move scrolls the map)
       two-finger drag    -> right-button drag (scroll the map)
       pinch              -> mouse wheel at the pinch center (zoom)      */
  (function touchLayer() {
    var LONG_PRESS_MS = 450;
    var SLOP_PX = 8;
    var PINCH_STEP = 1.18;

    var mode = "idle"; /* idle | pending | left-drag | right-drag | multi */
    var startX = 0, startY = 0;
    var lastX = 0, lastY = 0;
    var pressTimer = 0;
    var pinchDist = 0;
    var activeButton = 0;

    function mouse(type, x, y, button) {
      var ev = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: button,
        buttons: type === "mouseup" ? 0 : (button === 2 ? 2 : 1),
      });
      canvas.dispatchEvent(ev);
    }

    function wheel(x, y, deltaY) {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        deltaY: deltaY,
        deltaMode: 0,
      }));
    }

    function clearPress() {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; }
    }

    function centroid(touches) {
      var x = 0, y = 0;
      for (var i = 0; i < touches.length; i++) { x += touches[i].clientX; y += touches[i].clientY; }
      return { x: x / touches.length, y: y / touches.length };
    }

    function distance(touches) {
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy) || 1;
    }

    function endDrag() {
      if (mode === "left-drag") mouse("mouseup", lastX, lastY, 0);
      if (mode === "right-drag" || mode === "multi") mouse("mouseup", lastX, lastY, activeButton);
      mode = "idle";
    }
    /* Suspending mid-drag must not leave the game holding a button: the pane
       goes visibility:hidden and SDL never sees the finger lift. */
    window.AISystem6OpenttdReleaseTouch = function () {
      clearPress();
      endDrag();
    };

    function onTouchStart(e) {
      if (e.target !== canvas) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var touches = e.touches;
      clearPress();

      if (touches.length >= 2) {
        /* Switch to two-finger scroll/zoom. Close any one-finger drag. */
        endDrag();
        mode = "multi";
        activeButton = 2;
        var c = centroid(touches);
        lastX = c.x; lastY = c.y;
        pinchDist = distance(touches);
        mouse("mousedown", c.x, c.y, 2);
        return;
      }

      var t = touches[0];
      startX = lastX = t.clientX;
      startY = lastY = t.clientY;
      mode = "pending";
      pressTimer = setTimeout(function () {
        if (mode !== "pending") return;
        /* Long press: become the right button. Hold-and-move scrolls. */
        mode = "right-drag";
        activeButton = 2;
        mouse("mousedown", startX, startY, 2);
      }, LONG_PRESS_MS);
    }

    function onTouchMove(e) {
      if (mode === "idle") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var touches = e.touches;

      if (mode === "multi" && touches.length >= 2) {
        var c = centroid(touches);
        var d = distance(touches);
        mouse("mousemove", c.x, c.y, 2);
        lastX = c.x; lastY = c.y;
        var ratio = d / pinchDist;
        if (ratio > PINCH_STEP) { wheel(c.x, c.y, -100); pinchDist = d; }
        else if (ratio < 1 / PINCH_STEP) { wheel(c.x, c.y, 100); pinchDist = d; }
        return;
      }

      var t = touches[0];
      if (!t) return;
      if (mode === "pending") {
        if (Math.hypot(t.clientX - startX, t.clientY - startY) > SLOP_PX) {
          /* Real movement before the long press: a left drag (build). */
          clearPress();
          mode = "left-drag";
          activeButton = 0;
          mouse("mousedown", startX, startY, 0);
          mouse("mousemove", t.clientX, t.clientY, 0);
        }
      } else if (mode === "left-drag" || mode === "right-drag") {
        mouse("mousemove", t.clientX, t.clientY, activeButton);
      }
      lastX = t.clientX; lastY = t.clientY;
    }

    function onTouchEnd(e) {
      if (mode === "idle") return;
      e.preventDefault();
      e.stopImmediatePropagation();

      if (mode === "multi") {
        if (e.touches.length >= 2) return;
        mouse("mouseup", lastX, lastY, 2);
        mode = "idle";
        return;
      }
      clearPress();
      if (mode === "pending") {
        /* A quick tap: click where the finger landed. */
        mouse("mousemove", startX, startY, 0);
        mouse("mousedown", startX, startY, 0);
        mouse("mouseup", startX, startY, 0);
      } else {
        mouse("mouseup", lastX, lastY, activeButton);
      }
      mode = "idle";
    }

    var opts = { capture: true, passive: false };
    document.addEventListener("touchstart", onTouchStart, opts);
    document.addEventListener("touchmove", onTouchMove, opts);
    document.addEventListener("touchend", onTouchEnd, opts);
    document.addEventListener("touchcancel", onTouchEnd, opts);
  })();
})();
