// A returning visitor's first navigation runs the build they saw last time.
//
// The service worker answers a navigation from its cached shell and refreshes
// that shell behind the page — deliberately, so a cold start does not wait on
// the network. The cost is that the page the visitor is looking at names the
// previous build's bundle, and clicking something that was fixed in the release
// they just missed does nothing. Reported on both public deployments: Cover
// Glass "would not open", on sites whose live bundle already carried the fix,
// from a tab still running the build before it.
//
// So the running build asks the deployment what it is serving. If they differ,
// the page reloads once and the visitor is on the current build. One attempt per
// tab: a worker that somehow kept serving its stale shell would otherwise put
// the page in a reload loop, and a stale page is better than a spinning one.

(function installBuildFreshness(global) {
  "use strict";

  const ATTEMPT_KEY = "ai-system6-build-reload";

  function runningBuild() {
    return String(global.AISystem6BuildInfo?.build || "").trim();
  }

  async function deployedBuild() {
    // Through the service boundary, like every other /api call in the app: one
    // place decides which deployment answers, and a contract holds the rule.
    const capabilities = global.AISystem6Capabilities;
    if (typeof capabilities?.requestService !== "function") return "";
    if (typeof capabilities.capabilityAvailable === "function"
      && !capabilities.capabilityAvailable("system.version")) {
      return "";
    }
    const response = await capabilities.requestService("system.version", {
      init: { cache: "no-store", headers: { Accept: "application/json" } },
    });
    if (!response?.ok) return "";
    const data = await response.json();
    return String(data?.build || "").trim();
  }

  async function checkForNewerBuild() {
    // Only a page served by the worker can be holding a stale shell; without one
    // the navigation came from the network and there is nothing to correct.
    if (!global.navigator?.serviceWorker?.controller) return "no-worker";
    const running = runningBuild();
    if (!running) return "no-running-build";
    let attempted = "";
    try {
      attempted = global.sessionStorage?.getItem(ATTEMPT_KEY) || "";
    } catch {
      return "no-session-storage";
    }
    if (attempted === running) return "already-tried";
    let deployed = "";
    try {
      deployed = await deployedBuild();
    } catch {
      return "deployment-unreachable";
    }
    if (!deployed || deployed === running) return "current";
    try {
      global.sessionStorage?.setItem(ATTEMPT_KEY, running);
    } catch {}
    console.warn(`AI System 6: this page is running build ${running}; the deployment serves ${deployed}. Reloading once.`);
    global.location.reload();
    return "reloading";
  }

  global.AISystem6BuildFreshness = Object.freeze({
    checkForNewerBuild,
    runningBuild,
  });

  function checkQuietly() {
    return checkForNewerBuild().catch(() => {});
  }

  // After load, so the check never competes with the desk's own first paint.
  if (typeof global.addEventListener === "function") {
    global.addEventListener("load", checkQuietly, { once: true });
  }

  // A page on the Home Screen is suspended, not reloaded: on a phone it can sit
  // on the build it was opened with for days, because `load` never fires again
  // and the worker keeps answering navigations from the shell it cached. Coming
  // back to the foreground is the only moment such a page gets — and it is the
  // moment this was reported from, a menu bar still wearing the system material
  // two releases after the fix that took it off shipped to both deployments.
  // The attempt guard is unchanged: this adds one reload per build, never a
  // loop, and it stays quiet while the page is going the other way.
  if (typeof global.document?.addEventListener === "function") {
    global.document.addEventListener("visibilitychange", () => {
      if (global.document.visibilityState === "visible") return checkQuietly();
    });
  }
})(window);
