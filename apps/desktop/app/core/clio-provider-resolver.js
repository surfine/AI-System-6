// Deployment-aware Clio provider selection. Transport implementations remain
// in their existing local/cloud modules; this file only owns preference,
// bounded health checks, fallback order, and a truthful status snapshot.

(function installClioProviderResolver() {
  "use strict";

  const validPreferences = new Set(["auto", "local", "device", "website", "byok"]);
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
    // The on-device model (the built-in Qwen3.5 when it is installed, else Apple's),
    // probed beside the walk. Ask-only doors read this; it is not a general
    // chat route, so every preference keeps walking past it.
    device: { status: "unknown", reason: "", engine: "" },
  };

  function copyState() {
    return {
      ...state,
      quota: { ...state.quota },
      lmStudio: { ...state.lmStudio },
      device: { ...state.device },
    };
  }

  function publish(patch = {}) {
    state = {
      ...state,
      ...patch,
      quota: { ...state.quota, ...(patch.quota || {}) },
      lmStudio: { ...state.lmStudio, ...(patch.lmStudio || {}) },
      device: { ...state.device, ...(patch.device || {}) },
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

  // The built-in model (the Mac helper's Qwen3.5) as the local route. It goes
  // first on the Mac: measured faster than LM Studio on the same model
  // (tooling/bench-device-model.mjs). LM Studio keeps the route when the writer
  // picked it: the "local" preference, or a model already loaded there.
  function builtInRoute() {
    const local = window.AISystem6BuiltInLocal;
    return local?.active ? { route: "local", provider: "built-in", model: `built-in:${local.model}` } : null;
  }

  function currentReadyRoute() {
    if (!cloudReady() && !localReady() && builtInRoute()) return builtInRoute();
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

  // One bounded read of the helper's status through the lazy client. It starts
  // before the walk because tryLocal can spend ten seconds on a Mac without
  // LM Studio, and the on-device door must not wait on that.
  async function probeDevice() {
    try {
      await ensureDeviceModelModule();
      const result = await window.AISystem6DeviceModel.status({ signal: abortSignal(4000) });
      return {
        available: result.available === true,
        reason: String(result.reason || ""),
        engine: String(result.engine || ""),
        builtInModel: String(result.builtInModel || ""),
        contextSize: Number(result.contextSize) || null,
      };
    } catch {
      return { available: false, reason: "helperMissing", engine: "" };
    }
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
    return ["byok", "stored", "subscription"].includes(mode) ? currentReadyRoute() : null;
  }

  async function performResolve(options = {}) {
    const existing = currentReadyRoute();
    const selectedPreference = preference();
    // Picking "local" after the built-in model took the route hands it back to LM Studio.
    if (existing && !options.force && !(selectedPreference === "local" && existing.provider === "built-in")) {
      if (selectedPreference === "auto" || selectedPreference === "device" || selectedPreference === existing.route) {
        return publish({ status: "ready", ...existing });
      }
    }

    const { capabilities, target } = await deploymentCapabilities();
    publish({ status: "resolving", target, fallbackReason: "" });
    // "device" is a preference for the ask-only doors; general chat has no device
    // route, so it walks like auto and the doors read the published device state.
    // The iOS shell answers /api/device-model/* in process and has no LM Studio.
    const candidates = selectedPreference === "auto" || selectedPreference === "device"
      ? (target === "mac"
        ? ["local", "device", "website", "byok"]
        : target === "ios"
          ? ["device", "website", "byok"]
          : ["vps", "pages"].includes(target)
            ? ["website", "byok"]
            : ["local", "device", "byok"])
      : [selectedPreference];
    const deviceProbe = candidates.includes("device") && ["mac", "local", "ios"].includes(target) ? probeDevice() : null;

    let lastReason = "";
    for (const candidate of candidates) {
      let result = null;
      if (candidate === "local") {
        // Built-in first: no LM Studio launch when the Mac already has the model.
        const device = selectedPreference !== "local" && !localReady() && deviceProbe ? await deviceProbe : null;
        if (device?.engine === "mlx") {
          publish({ device: { status: "available", reason: "", engine: "mlx" } });
          window.AISystem6DeviceModel?.activateBuiltInLocal?.({ model: device.builtInModel, contextSize: device.contextSize });
          result = builtInRoute();
        } else {
          window.AISystem6DeviceModel?.deactivateBuiltInLocal?.();
          result = await tryLocal({ target, allowLaunch: target === "mac" });
        }
      } else if (candidate === "device") {
        const device = deviceProbe ? await deviceProbe : { available: false, reason: "helperMissing", engine: "" };
        publish({ device: { status: device.available ? "available" : "unavailable", reason: device.reason, engine: device.engine } });
        // Never a general chat route: the walk goes on so the local, website and
        // key routes stay reachable. Ask-only doors read the published state.
        continue;
      } else if (candidate === "website") result = await tryWebsite(target, capabilities);
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
