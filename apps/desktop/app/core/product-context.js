// Small allowlisted runtime snapshot for Clio product-help answers. It names
// visible state only; project bodies, credentials, endpoints, and lease owner
// identifiers never cross this boundary.

(function installProductContext() {
  "use strict";

  function activeSurfaceSnapshot() {
    const active = document.querySelector(".window.is-active:not(.is-hidden):not(.is-app-hidden)");
    const windowName = String(active?.dataset.window || "");
    let documentTitle = "";
    let documentRole = "";
    if (windowName === "teachText") {
      documentTitle = typeof getTeachTextDocumentName === "function" ? getTeachTextDocumentName() : "";
      documentRole = String(typeof teachTextDocumentRole === "string" ? teachTextDocumentRole : "");
    } else if (windowName && typeof getActiveDocumentTab === "function") {
      const app = ({ reader: "reader", docMap: "docMap", timeMachine: "timeMachine" })[windowName];
      const tab = app ? getActiveDocumentTab(app) : null;
      documentTitle = String(tab?.title || "");
      documentRole = String(tab?.role || "");
    }
    return { window: windowName || "desktop", documentTitle, documentRole };
  }

  function fallbackProviderSnapshot() {
    const cloud = typeof cloudConfig !== "undefined" && cloudConfig?.active;
    return {
      route: cloud ? (typeof cloudCredentialMode === "function" ? cloudCredentialMode() : "cloud") : "local",
      provider: cloud ? String(cloudConfig?.provider || "") : String(window.AISystem6LocalLMStudio?.currentProvider?.() || ""),
      model: cloud ? String(cloudConfig?.model || "") : String(typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : ""),
      status: cloud
        ? "ready"
        : (typeof localModelState !== "undefined" && localModelState?.ready ? "ready" : "unavailable"),
      quota: { state: "unknown", remainingSessionRequests: null, resetAt: "" },
      lmStudio: {
        server: Boolean(typeof localModelState !== "undefined" && localModelState?.server),
        models: Boolean(typeof localModelState !== "undefined" && localModelState?.models),
        loaded: Boolean(typeof localModelState !== "undefined" && localModelState?.loaded),
      },
    };
  }

  function snapshot() {
    const project = typeof getActiveProject === "function" ? getActiveProject() : null;
    const provider = window.AISystem6ClioProvider?.snapshot?.() || fallbackProviderSnapshot();
    return {
      deploymentTarget: document.documentElement.dataset.deploymentTarget || "static",
      deploymentProfile: document.documentElement.dataset.deploymentProfile || "static",
      appearance: typeof getCurrentTheme === "function" ? getCurrentTheme() : "classic",
      workspaceProfile: typeof workspaceProfile === "string" ? workspaceProfile : "desktop",
      project: {
        mounted: Boolean(project),
        name: String(project?.name || ""),
      },
      active: activeSurfaceSnapshot(),
      provider: {
        route: String(provider.route || ""),
        provider: String(provider.provider || ""),
        model: String(provider.model || ""),
        status: String(provider.status || "unknown"),
      },
      quota: {
        state: String(provider.quota?.state || "unknown"),
        remainingSessionRequests: Number.isFinite(Number(provider.quota?.remainingSessionRequests))
          ? Number(provider.quota.remainingSessionRequests)
          : null,
        resetAt: String(provider.quota?.resetAt || ""),
      },
      lmStudio: {
        server: Boolean(provider.lmStudio?.server),
        models: Boolean(provider.lmStudio?.models),
        loaded: Boolean(provider.lmStudio?.loaded),
      },
      writeMode: String(document.body.dataset.writeMode || "readonly"),
    };
  }

  window.AISystem6ProductContext = Object.freeze({ snapshot });
})();
