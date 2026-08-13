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
  var resW = Math.max(320, Math.round(window.innerWidth));
  var resH = Math.max(240, Math.round(window.innerHeight));
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
      var w = Math.max(320, Math.round(window.innerWidth));
      var h = Math.max(240, Math.round(window.innerHeight));
      try {
        if (window.Module && Module.calledRun && typeof Module.ccall === "function") {
          Module.ccall("em_openttd_set_resolution", null, ["number", "number"], [w, h]);
        }
      } catch (e) { /* the game may not be up yet; the boot seed covers that */ }
    }
    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(apply, 150);
    }
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
      if (!c || !window.Module || !Module.calledRun) return;
      var w = Math.max(320, Math.round(window.innerWidth));
      var h = Math.max(240, Math.round(window.innerHeight));
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
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") sync();
  });
  window.addEventListener("pagehide", sync);
  window.addEventListener("message", function (event) {
    if (event.origin !== location.origin) return;
    var data = event.data;
    if (data && data.type === "openttd-host" && data.command === "sync") sync();
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
