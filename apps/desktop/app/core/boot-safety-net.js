// Boot safety net. Loaded as its own early classic script (see index.html),
// before app.bundle.js, so it survives whatever app.bundle.js does.
//
// boot() in app/core/boot.js already wraps its own body in try/catch and
// shows the Sad Mac recovery screen on failure — but that catch only runs
// for errors thrown *while boot() is on the call stack*. A syntax-adjacent
// bug (a temporal-dead-zone ReferenceError from referencing a `let`/`const`
// before its declaration runs) can throw from top-level code in the
// concatenated bundle, before boot() is ever called. Nothing is on the call
// stack to catch it, `wireAppEvents(); boot();` at the bottom of app.js never
// runs, and the desk never appears — a real incident, not a hypothetical one.
//
// This is the fallback of last resort: it does not know why anything broke,
// only that the desk never confirmed it was ready. It never assumes
// app.bundle.js's own functions are safe to call (the same bug that broke
// boot() may have broken them too), so its own recovery path touches only
// `document`/`window` directly.
(function () {
  "use strict";

  var handled = false;

  function appReady() {
    return document.body && document.body.dataset ? document.body.dataset.appReady : "";
  }

  function markError() {
    if (document.body) document.body.dataset.appReady = "error";
  }

  // The real boot-failure UI already exists in the boot screen markup
  // (index.html) and its behavior in desktop-runtime.js. Try it first — most
  // of app.bundle.js is usually intact even when one step in it threw — and
  // fall back to plain DOM only if that call is itself unavailable or throws.
  function tryRichFailure(error) {
    if (typeof window.showBootFailure !== "function") return false;
    try {
      window.showBootFailure(error);
      return true;
    } catch (nestedError) {
      console.error("AI System 6: the boot-failure screen itself failed.", nestedError);
      return false;
    }
  }

  // Pure-DOM fallback: no dependency on any app.bundle.js function, a
  // translation table, or anything else that a top-level crash may have left
  // half-defined. Reuses the same boot-screen elements the real failure UI
  // uses, so this never looks like a second, unfamiliar surface.
  function plainFailure() {
    var screen = document.getElementById("boot-screen");
    if (!screen) {
      // The crash happened before the boot screen itself was parsed — the
      // rarest case, and the one truest "white screen". A visible, honest
      // plain-text notice beats a blank page.
      if (document.body) {
        document.body.textContent = "AI System 6 could not finish starting. Reload the page to try again.";
      }
      return;
    }
    document.body.classList.add("is-booting");
    screen.hidden = false;
    screen.classList.remove("is-done");
    var mac = screen.querySelector(".happy-mac");
    if (mac) {
      mac.classList.remove("is-sleeping", "is-happy");
      mac.classList.add("is-sad");
    }
    var message = document.getElementById("boot-message");
    if (message) message.textContent = "AI System 6 could not finish starting.";
    var actions = document.getElementById("boot-failure-actions");
    if (actions) {
      actions.classList.remove("is-hidden");
      var retry = document.getElementById("boot-retry");
      // boot.js normally wires this button; if it never got the chance, a
      // reload still recovers most causes (a one-off script error).
      if (retry && retry.dataset.wired !== "true") {
        retry.dataset.wired = "true";
        retry.addEventListener("click", function () {
          window.location.reload();
        });
      }
    }
  }

  function handle(error) {
    // A live, running desk had its own chance to handle this; re-showing Sad
    // Mac over working windows would be a regression, not a safety net.
    if (appReady() === "ready" || handled) return;
    handled = true;
    console.error("AI System 6: an uncaught error stopped startup before boot() could record it.", error);
    markError();
    if (!tryRichFailure(error)) plainFailure();
  }

  window.addEventListener("error", function (event) {
    handle(event.error || event.message || event);
  }, true);
  window.addEventListener("unhandledrejection", function (event) {
    handle(event.reason);
  });

  // Last resort for a hang with no throw at all (a wedged promise chain, an
  // infinite loop that never reaches the offending line). A hang is boot
  // that has stopped moving, not boot that is slow: on a busy machine a
  // healthy start can take longer than twenty seconds, and declaring it
  // failed put the Sad Mac up over a desk that then finished starting.
  // Boot reports each step it completes (AISystem6BootProgress); the net
  // fires only after STALL_MS with no step at all, or once boot has run for
  // CEILING_MS however busy it looks, so a step that loops for ever still
  // ends on the failure screen.
  var STALL_MS = 20000;
  var CEILING_MS = 120000;
  var now = function () {
    return window.performance && typeof window.performance.now === "function" ? window.performance.now() : Date.now();
  };
  var startedAt = now();
  var lastProgressAt = startedAt;
  var lastStep = "";
  var progressLog = [];

  function settled() {
    return handled || appReady() === "ready" || appReady() === "error";
  }

  window.AISystem6BootProgress = function (step) {
    if (settled()) return;
    lastProgressAt = now();
    lastStep = String(step || "");
    if (progressLog.length < 400) progressLog.push({ step: lastStep, at: Math.round(lastProgressAt - startedAt) });
  };
  window.AISystem6BootProgressLog = function () {
    return progressLog.slice();
  };

  function check() {
    if (settled()) return;
    var at = now();
    var quiet = at - lastProgressAt;
    var elapsed = at - startedAt;
    var where = lastStep ? " (last step: " + lastStep + ")" : " (no boot step reported)";
    if (quiet >= STALL_MS) {
      handle(new Error("AI System 6 did not finish starting: no progress for " + Math.round(quiet / 1000) + " seconds" + where + "."));
      return;
    }
    if (elapsed >= CEILING_MS) {
      handle(new Error("AI System 6 did not finish starting within " + Math.round(elapsed / 1000) + " seconds" + where + "."));
      return;
    }
    window.setTimeout(check, Math.max(250, Math.min(STALL_MS - quiet, CEILING_MS - elapsed)));
  }
  window.setTimeout(check, STALL_MS);
})();
