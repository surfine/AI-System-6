(function installServiceCapabilities() {
  "use strict";

  const capabilities = new Map();
  const providers = new Map();

  const normalize = (name) => String(name || "").trim();
  const snapshot = (name, fallback) => {
    const current = capabilities.get(normalize(name));
    return current
      ? { ...current }
      : { available: false, provider: "none", reason: fallback || "unknown-capability" };
  };

  function registerServiceProvider(name, provider) {
    const key = normalize(name);
    if (!key || !provider || !provider.id) {
      throw new Error("A service provider needs an id.");
    }
    providers.set(key, Object.freeze({ ...provider }));
  }

  function setCapability(name, providerId, reason = "") {
    capabilities.set(normalize(name), {
      available: true,
      provider: providerId,
      reason: reason || "",
    });
  }

  function disableCapability(name, reason = "service-unavailable") {
    const current = capabilities.get(normalize(name));
    capabilities.set(normalize(name), {
      available: false,
      provider: current?.provider || "none",
      reason: reason || "service-unavailable",
    });
  }

  function getCapability(name) {
    return snapshot(name, "unknown-capability");
  }

  function capabilityAvailable(name) {
    return snapshot(name, "unknown-capability").available === true;
  }

  function requestService(name, input) {
    const capability = snapshot(name, "unknown-capability");
    if (!capability.available) {
      const error = new Error(typeof t === "function" ? t("service_unavailable") : name);
      error.code = capability.reason || "service-unavailable";
      error.capability = name;
      error.unavailable = true;
      throw error;
    }
    const provider = providers.get(normalize(name));
    if (!provider?.request) {
      const error = new Error(typeof t === "function" ? t("service_unavailable") : name);
      error.code = "provider-missing";
      error.capability = name;
      error.unavailable = true;
      throw error;
    }
    return provider.request(input, {
      capability: name,
      provider: capability.provider,
    });
  }

  // Browser-owned product capabilities are available immediately. They do not
  // wait for a service probe, and they are the same in Static, Edge, and
  // Companion deployments.
  ["project.storage", "artifact.export", "project.backup", "project.restore", "file.download", "file.share", "reader.local"]
    .forEach((name) => setCapability(name, "browser"));

  window.AISystem6Capabilities = Object.freeze({
    getCapability,
    capabilityAvailable,
    registerServiceProvider,
    requestService,
    setCapability,
    disableCapability,
  });
})();
