// Deployment-aware Clio provider selection. Transport implementations remain
// in their existing local/cloud modules; this file only owns preference,
// bounded health checks, fallback order, and a truthful status snapshot.

(function installClioProviderResolver() {
  "use strict";

  const validPreferences = new Set(["auto", "local", "website", "byok"]);
  let inFlight = null;
  let state = {
    status: "idle",
    target: "static",
    route: "",
    provider: "",
    model: "",
    fallbackReason: "",
    quota: { state: "unknown", remainingSessionRequests: null, resetAt: "" },
    lmStudio: { server: false, models: false, loaded: false },
  };

  function copyState() {
    return {
      ...state,
      quota: { ...state.quota },
      lmStudio: { ...state.lmStudio },
    };
  }

  function publish(patch = {}) {
    state = {
      ...state,
      ...patch,
      quota: { ...state.quota, ...(patch.quota || {}) },
      lmStudio: { ...state.lmStudio, ...(patch.lmStudio || {}) },
    };
    window.dispatchEvent(new CustomEvent("ai-system6:clio-provider", { detail: copyState() }));
    if (typeof syncClioTalkModelAvailability === "function") syncClioTalkModelAvailability();
    return copyState();
  }

  function preference() {
    return validPreferences.has(typeof clioProviderPreference === "string" ? clioProviderPreference : "")
      ? clioProviderPreference
      : "auto";
  }

  function setPreference(next, { persist = true } = {}) {
    const value = validPreferences.has(next) ? next : "auto";
    clioProviderPreference = value;
    if (persist && typeof scheduleSettingsSave === "function") scheduleSettingsSave();
    invalidate("preference-changed");
    return value;
  }

  function cloudReady() {
    return Boolean(
      typeof cloudConfig !== "undefined"
      && cloudConfig?.active
      && cloudConfig?.provider
      && typeof cloudCredentialReady === "function"
      && cloudCredentialReady()
      && cloudConfig?.model
    );
  }

  function localReady() {
    return Boolean(typeof localModelState !== "undefined" && (localModelState?.ready || localModelState?.loaded));
  }

  function currentReadyRoute() {
    if (cloudReady()) {
      const mode = typeof cloudCredentialMode === "function" ? cloudCredentialMode() : "cloud";
      return {
        route: mode === "shared" || mode === "shared-remote" ? "website" : "byok",
        provider: String(cloudConfig?.provider || ""),
        model: String(cloudConfig?.model || ""),
      };
    }
    if (localReady()) {
      return {
        route: "local",
        provider: String(window.AISystem6LocalLMStudio?.currentProvider?.() || "lm-studio"),
        model: String(typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : ""),
      };
    }
    return null;
  }

  async function deploymentCapabilities() {
    const capabilities = await window.AISystem6PublicAccess?.getCapabilities?.().catch(() => null);
    const target = String(
      capabilities?.deployment_target
      || document.documentElement.dataset.deploymentTarget
      || (capabilities?.public_deployment ? "vps" : "static")
    );
    document.documentElement.dataset.deploymentTarget = target;
    return { capabilities: capabilities || {}, target };
  }

  function abortSignal(ms) {
    return typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
  }

  async function tryLocal({ target, allowLaunch }) {
    if (typeof connectLocalLmStudio !== "function") return null;
    const first = await connectLocalLmStudio({
      toggle: false,
      silent: true,
      signal: abortSignal(target === "mac" ? 1500 : 2500),
    });
    let data = first;
    if (!data && target === "mac" && allowLaunch) {
      try {
        const response = await window.AISystem6Capabilities.requestService("local.lmstudio.start", {
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          },
          signal: abortSignal(6500),
        });
        if (response.ok) {
          data = await connectLocalLmStudio({ toggle: false, silent: true, signal: abortSignal(2500) });
        }
      } catch {}
    }
    if (data && !localReady() && target === "mac" && modelInput?.value?.trim() && typeof loadSelectedLmStudioModel === "function") {
      await loadSelectedLmStudioModel();
    }
    if (!data || !localReady()) return null;
    if (typeof cloudConfig !== "undefined" && cloudConfig?.active) {
      cloudConfig.active = false;
      if (typeof saveCloudConfig === "function") saveCloudConfig();
    }
    return {
      route: "local",
      provider: String(window.AISystem6LocalLMStudio?.currentProvider?.() || "lm-studio"),
      model: String(typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : ""),
    };
  }

  async function tryWebsite(target, capabilities) {
    if (target === "mac" && typeof window.AISystem6CloudModel?.connectSharedWebsiteFallback === "function") {
      const ready = await window.AISystem6CloudModel.connectSharedWebsiteFallback();
      if (ready && cloudReady()) return currentReadyRoute();
      return null;
    }
    if (!["vps", "pages"].includes(target) || capabilities?.features?.cloud_shared !== true) return null;
    if (typeof window.AISystem6CloudModel?.enableWebsiteAiByDefault === "function") {
      window.AISystem6CloudModel.enableWebsiteAiByDefault();
    }
    return cloudReady() ? currentReadyRoute() : null;
  }

  function tryByok() {
    if (!cloudReady()) return null;
    const mode = typeof cloudCredentialMode === "function" ? cloudCredentialMode() : "none";
    return ["byok", "stored"].includes(mode) ? currentReadyRoute() : null;
  }

  async function performResolve(options = {}) {
    const existing = currentReadyRoute();
    const selectedPreference = preference();
    if (existing && !options.force) {
      if (selectedPreference === "auto" || selectedPreference === existing.route) {
        return publish({ status: "ready", ...existing });
      }
    }

    const { capabilities, target } = await deploymentCapabilities();
    publish({ status: "resolving", target, fallbackReason: "" });
    const candidates = selectedPreference === "auto"
      ? (target === "mac"
        ? ["local", "website", "byok"]
        : ["vps", "pages"].includes(target)
          ? ["website", "byok"]
          : ["local", "byok"])
      : [selectedPreference];

    let lastReason = "";
    for (const candidate of candidates) {
      let result = null;
      if (candidate === "local") result = await tryLocal({ target, allowLaunch: target === "mac" });
      else if (candidate === "website") result = await tryWebsite(target, capabilities);
      else if (candidate === "byok") result = tryByok();
      if (result) {
        return publish({
          status: "ready",
          target,
          ...result,
          fallbackReason: lastReason,
          lmStudio: {
            server: Boolean(typeof localModelState !== "undefined" && localModelState?.server),
            models: Boolean(typeof localModelState !== "undefined" && localModelState?.models),
            loaded: Boolean(typeof localModelState !== "undefined" && localModelState?.loaded),
          },
        });
      }
      lastReason = `${candidate}-unavailable`;
    }
    return publish({ status: "unavailable", target, route: "", provider: "", model: "", fallbackReason: lastReason });
  }

  function resolve(options = {}) {
    if (inFlight && !options.force) return inFlight;
    inFlight = performResolve(options).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function invalidate(reason = "invalidated") {
    if (typeof conversation !== "undefined" && conversation.length && state.status === "ready") return copyState();
    return publish({ status: "idle", route: "", provider: "", model: "", fallbackReason: reason });
  }

  function updateQuota(quota = {}) {
    return publish({ quota: {
      state: String(quota.state || state.quota.state || "unknown"),
      remainingSessionRequests: Number.isFinite(Number(quota.remainingSessionRequests))
        ? Number(quota.remainingSessionRequests)
        : state.quota.remainingSessionRequests,
      resetAt: String(quota.resetAt || state.quota.resetAt || ""),
    } });
  }

  window.AISystem6ClioProvider = Object.freeze({
    resolve,
    snapshot: copyState,
    invalidate,
    canAttempt: () => state.status !== "unavailable" || preference() !== "auto",
    preference,
    setPreference,
    updateQuota,
  });
})();
