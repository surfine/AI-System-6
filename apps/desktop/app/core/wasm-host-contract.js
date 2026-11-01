// Shared Wasm / immersive-host honesty contract (calm-desktop v223).
//
// Measurable attributes on a host window:
//   data-wasm     "1" when this host intends a real Wasm engine; "0" for JS/WebGL shells
//   data-binary   "1" when the engine binary is present/claimed; "0" when absent
//   data-host     loading | ready | fail | crash  (fail/crash never imply success)
//   data-ready    "1" only when data-host is ready
//   data-contract "1" when the contract is applied
//   data-adhd     "no-streak" — no streak / shame chrome on failure
//
// Fail ≠ loaded success: applying host "fail" or "crash" always clears data-ready.
// Real Wasm binaries stay out of the eager boot path; hosts that need them load
// payloads only inside their own lazy iframe/shell.
//
// Goal #8 DOOM first-gate: Aaron may authorize brief §2 to run §7 against
// existing assets/doom/* only — never download engines or raise floppyBudgetBytes.
// See calm-desktop evidence/wasm-engine-auth-brief-v229-*.

(function installWasmHostContract(global) {
  "use strict";

  const HOSTS = Object.freeze(["idle", "loading", "ready", "fail", "crash"]);

  function normalizeHost(value) {
    const host = String(value || "idle");
    return HOSTS.includes(host) ? host : "idle";
  }

  function isSuccessHost(host) {
    return normalizeHost(host) === "ready";
  }

  function apply(win, options = {}) {
    if (!win || typeof win !== "object") return null;
    const host = normalizeHost(options.host);
    const wasm = options.wasm === 1 || options.wasm === true || options.wasm === "1" ? "1" : "0";
    // data-binary answers "is an engine binary claimed/present?", not "did
    // load succeed?". Fail/crash honesty lives in data-host / data-ready.
    const binary = options.binary === 1 || options.binary === true || options.binary === "1" ? "1" : "0";
    // Fail ≠ loaded success: only host "ready" may advertise data-ready=1.
    const ready = isSuccessHost(host) ? "1" : "0";

    win.setAttribute("data-contract", "1");
    win.setAttribute("data-adhd", "no-streak");
    win.setAttribute("data-wasm", wasm);
    win.setAttribute("data-binary", binary);
    win.setAttribute("data-host", host);
    win.setAttribute("data-ready", ready);
    if (options.kind) win.setAttribute("data-kind", String(options.kind));
    if (options.fail != null) win.setAttribute("data-fail", host === "fail" || host === "crash" ? "1" : "0");
    if (options.crash != null || host === "crash") {
      win.setAttribute("data-crash", host === "crash" ? "1" : "0");
    }
    return {
      kind: options.kind || "",
      host,
      wasm,
      binary,
      ready,
      contract: "1",
    };
  }

  function syncFromPhase(win, phase, options = {}) {
    const map = options.phaseMap || {
      idle: "idle",
      loading: "loading",
      ready: "ready",
      driving: "ready",
      paused: "ready",
      running: "ready",
      play: "ready",
      failed: "fail",
      fail: "fail",
      error: "fail",
      timeout: "fail",
      crashed: "crash",
      crash: "crash",
    };
    const host = map[String(phase || "idle")] || "idle";
    return apply(win, { ...options, host });
  }

  global.AISystem6WasmHostContract = Object.freeze({
    HOSTS,
    apply,
    syncFromPhase,
    isSuccessHost,
    normalizeHost,
  });
})(window);
