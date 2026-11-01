// Service provider for ClioTalk's cloud agent runs (/api/agent-cloud/*).
//
// Lazy: loaded with app/features/cliotalk-agent-cloud.js by
// ensureAgentCloudModule (config.js), never in the boot bundle. One provider,
// "agent.cloud", covers the six routes; the op names the route and nothing
// else reaches the URL, so a page script cannot steer it elsewhere.
(function installAgentCloudProviders() {
  "use strict";

  const RUN_ID = /^run-[a-f0-9-]{36}$/;
  const RUN_OPS = { events: "GET", changes: "GET", stop: "POST", discard: "POST" };

  function request(input = {}) {
    const op = String(input.op || "");
    const init = { credentials: "same-origin", signal: input.signal };
    if (op === "status") return fetch("/api/agent-cloud/status", { ...init, headers: { Accept: "application/json" } });
    if (op === "start") {
      return fetch("/api/agent-cloud/runs", {
        ...init,
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(input.body || {}),
      });
    }
    const method = RUN_OPS[op];
    const runId = String(input.runId || "");
    if (!method || !RUN_ID.test(runId)) return Promise.reject(new Error("agent.cloud: unknown op or run"));
    const after = Math.max(0, Math.floor(Number(input.after) || 0));
    const query = op === "events" && after ? `?after=${after}` : "";
    return fetch(`/api/agent-cloud/runs/${runId}/${op}${query}`, {
      ...init,
      method,
      headers: method === "POST"
        ? { "Content-Type": "application/json", Accept: "application/json" }
        : { Accept: op === "events" ? "text/event-stream" : "application/json" },
      body: method === "POST" ? "{}" : undefined,
    });
  }

  window.AISystem6Capabilities?.registerServiceProvider?.("agent.cloud", { id: "same-origin-node", request });
  window.AISystem6Capabilities?.setCapability?.("agent.cloud", "same-origin-node");
})();
