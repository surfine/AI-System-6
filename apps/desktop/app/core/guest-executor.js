// Guest executor client — the page's end of the MCP guest bridge.
//
// The server (apps/server/server/agent-executor.js) cannot read the Project
// Hard Disk; this page can. At boot on a loopback origin the page subscribes
// to one Server-Sent Events stream and answers every guest tool call it
// receives against its own stores, through the lazy guest-tools module. This
// file stays eager and small: connect, relay, remember the approvals the
// writer has given, and show whether a guest is at the desk right now.
//
// Approvals (name → purpose, privilege, status) are part of the settings
// record like every other Control Panel or Chooser preference; the settings
// snapshot reads them from here and applySettings writes them back.
//
// The outbound direction's settings (external MCP servers the writer added in
// Chooser) live here too, for the same reason and no other: the settings
// snapshot is eager, so it cannot read them out of a lazy module. Everything
// that talks to those servers is in app/features/mcp-servers.js.

window.AISystem6GuestExecutor = (() => {
  const listeners = new Set();
  const state = { connected: false, executorId: "", guests: [] };
  /** @type {Record<string, { purpose: string, privilege: string, status: string, approvedAt: string }>} */
  let approvals = {};
  /** @type {Record<string, { url: string, enabled: boolean, searchTool: string, tools: string[], addedAt: string }>} */
  let servers = {};
  // The desk's own name on the bridge. It survives reloads in the settings
  // record because a guest's invitation names it: change the id and every
  // invitation ever handed out stops working, which is exactly how the writer
  // revokes them.
  let deskId = "";
  let source = null;
  let socket = null;
  let publicExecutorTransport = "sse";
  let stopped = false;
  let retryMs = 1000;
  let retryTimer = 0;

  function isLoopbackPage() {
    const host = String(location.hostname || "").toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
  }

  function emit() {
    listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.warn("Guest executor listener failed.", error);
      }
    });
    // Everything the writer looks at — the menu-bar indicator, the Chooser
    // lists, the Search Engine menu — is drawn by the lazy module, which is
    // already loaded whenever any of it has something to show.
    window.AISystem6GuestTools?.renderGuestIndicator?.(state);
    window.AISystem6McpServers?.syncSearchProviderOptions?.();
  }

  function parseEvent(event) {
    try {
      return JSON.parse(event?.data || "{}") || {};
    } catch {
      return {};
    }
  }

  async function reply(callId, payload) {
    if (socket?.readyState === 1) {
      try {
        socket.send(JSON.stringify({ type: "reply", callId, ...payload }));
      } catch (error) {
        console.warn("Guest executor WebSocket reply failed.", error);
      }
      return;
    }
    try {
      await window.AISystem6Capabilities.requestService("agent.executorReply", {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callId,
            deskId: publicExecutorTransport === "websocket" ? ensureDeskId() : "",
            ...payload,
          }),
        },
      });
    } catch (error) {
      console.warn("Guest executor reply failed.", error);
    }
  }

  async function handleCall(detail) {
    const callId = String(detail?.callId || "");
    if (!callId) return;
    try {
      if (typeof ensureGuestToolsModule === "function") await ensureGuestToolsModule();
      const tools = window.AISystem6GuestTools;
      if (!tools || typeof tools.handleExecutorCall !== "function") {
        throw new Error("Guest tools did not load.");
      }
      const result = await tools.handleExecutorCall(String(detail.method || ""), detail.params || {});
      await reply(callId, { ok: true, result });
    } catch (error) {
      await reply(callId, { ok: false, error: String(error?.message || error) });
    }
  }

  function closeStream() {
    if (source) {
      source.close();
      source = null;
    }
    const activeSocket = socket;
    socket = null;
    if (activeSocket) {
      try { activeSocket.close(); } catch {}
    }
    if (state.connected) {
      state.connected = false;
      state.guests = [];
      emit();
    }
  }

  function ensureDeskId() {
    if (!deskId) {
      deskId = (crypto.randomUUID?.() || `desk-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      if (typeof scheduleSettingsSave === "function") scheduleSettingsSave();
    }
    return deskId;
  }

  function scheduleReconnect() {
    if (stopped) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, 30000);
  }

  function connectEventSource() {
    if (stopped || source || socket || typeof EventSource !== "function") return;
    source = new EventSource(`/api/agent/executor?desk=${encodeURIComponent(ensureDeskId())}`);
    source.addEventListener("hello", (event) => handleExecutorEvent("hello", parseEvent(event)));
    source.addEventListener("guests", (event) => handleExecutorEvent("guests", parseEvent(event)));
    source.addEventListener("call", (event) => handleExecutorEvent("call", parseEvent(event)));
    // Another page took the executor role; this one steps back for good so
    // two tabs never race to answer the same guest.
    source.addEventListener("replaced", () => handleExecutorEvent("replaced"));
    source.onerror = () => {
      closeStream();
      scheduleReconnect();
    };
  }

  function handleExecutorEvent(event, detail = {}) {
    if (event === "hello") {
      state.connected = true;
      state.executorId = String(detail.executorId || "");
      state.guests = Array.isArray(detail.guests) ? detail.guests : [];
      retryMs = 1000;
      emit();
    } else if (event === "guests") {
      state.guests = Array.isArray(detail.guests) ? detail.guests : [];
      emit();
    } else if (event === "call") {
      handleCall(detail);
    } else if (event === "replaced") {
      stopped = true;
      closeStream();
    }
  }

  function connectWebSocket() {
    if (stopped || source || socket || typeof WebSocket !== "function") return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const activeSocket = new WebSocket(protocol + "//" + location.host + "/api/agent/executor?desk=" + encodeURIComponent(ensureDeskId()));
    socket = activeSocket;
    activeSocket.onmessage = (event) => {
      const packet = parseEvent(event);
      handleExecutorEvent(packet.event, packet.payload || {});
    };
    activeSocket.onclose = () => {
      if (socket !== activeSocket) return;
      socket = null;
      if (state.connected) {
        state.connected = false;
        state.guests = [];
        emit();
      }
      scheduleReconnect();
    };
    activeSocket.onerror = () => {};
  }

  function connect() {
    if (publicExecutorTransport === "websocket") connectWebSocket();
    else connectEventSource();
  }

  function start() {
    if (stopped || source || socket) return;
    // On this Mac the bridge is always there. On the public deployment it is
    // there only when the site serves it, and the capabilities answer says so.
    if (isLoopbackPage()) {
      connect();
      return;
    }
    window.AISystem6PublicAccess?.getCapabilities?.()
      .then((capabilities) => {
        if (capabilities?.features?.guest_bridge === true) {
          publicExecutorTransport = capabilities?.mcp?.executor_transport === "websocket" ? "websocket" : "sse";
          connect();
        }
      })
      .catch(() => {});
  }

  function getDeskId() {
    return deskId;
  }

  function setDeskId(value) {
    const next = String(value || "").trim();
    if (!next || next === deskId) return;
    const wasConnected = Boolean(source || socket);
    deskId = next;
    if (wasConnected) {
      closeStream();
      stopped = false;
      connect();
    }
  }

  // The one primitive the lazy module needs to rename this desk: give it a
  // new name and reopen the stream under it, which is how every invitation
  // ever handed out stops routing.
  function reconnectAs(nextDeskId) {
    deskId = String(nextDeskId || "").trim() || deskId;
    if (typeof scheduleSettingsSave === "function") scheduleSettingsSave();
    if (source || socket) {
      closeStream();
      stopped = false;
      connect();
    }
    emit();
    return deskId;
  }

  function stop() {
    stopped = true;
    clearTimeout(retryTimer);
    closeStream();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function activeGuests() {
    return state.guests.filter((guest) => guest.status === "approved");
  }

  function normalizeApprovalRecord(entry = {}) {
    const privilege = ["read", "propose", "change"].includes(entry.privilege) ? entry.privilege : "propose";
    const status = ["approved", "denied"].includes(entry.status) ? entry.status : "approved";
    return {
      purpose: String(entry.purpose || "").slice(0, 400),
      privilege,
      status,
      approvedAt: String(entry.approvedAt || ""),
    };
  }

  function getApprovals() {
    return approvals;
  }

  function setApprovals(next) {
    approvals = {};
    if (next && typeof next === "object") {
      Object.entries(next).forEach(([name, entry]) => {
        const key = String(name || "").trim();
        if (key) approvals[key] = normalizeApprovalRecord(entry);
      });
    }
    emit();
  }

  function approvalFor(name) {
    return approvals[String(name || "").trim()] || null;
  }

  function recordApproval(name, entry) {
    const key = String(name || "").trim();
    if (!key) return null;
    approvals[key] = normalizeApprovalRecord({ approvedAt: approvals[key]?.approvedAt || new Date().toISOString(), ...entry });
    if (typeof scheduleSettingsSave === "function") scheduleSettingsSave();
    emit();
    return approvals[key];
  }

  function normalizeServerRecord(entry = {}) {
    return {
      url: String(entry.url || "").slice(0, 2048),
      enabled: entry.enabled !== false,
      searchTool: String(entry.searchTool || "").slice(0, 120),
      tools: Array.isArray(entry.tools) ? entry.tools.map((tool) => String(tool)).slice(0, 100) : [],
      // Each tool's declared argument shape, so a search call names the
      // field the server actually asks for instead of guessing "query".
      toolShapes: entry.toolShapes && typeof entry.toolShapes === "object" ? entry.toolShapes : {},
      addedAt: String(entry.addedAt || ""),
    };
  }

  function getServers() {
    return servers;
  }

  function setServers(next) {
    servers = {};
    if (next && typeof next === "object") {
      Object.entries(next).forEach(([name, entry]) => {
        const key = String(name || "").trim();
        if (key && entry?.url) servers[key] = normalizeServerRecord(entry);
      });
    }
    emit();
  }

  function upsertServer(name, entry) {
    const key = String(name || "").trim();
    if (!key) return null;
    servers[key] = normalizeServerRecord({ addedAt: servers[key]?.addedAt || new Date().toISOString(), ...servers[key], ...entry });
    if (typeof scheduleSettingsSave === "function") scheduleSettingsSave();
    emit();
    return servers[key];
  }

  function removeServer(name) {
    const key = String(name || "").trim();
    if (!(key in servers)) return false;
    delete servers[key];
    if (typeof scheduleSettingsSave === "function") scheduleSettingsSave();
    emit();
    return true;
  }

  function forgetApproval(name) {
    const key = String(name || "").trim();
    if (!(key in approvals)) return false;
    delete approvals[key];
    if (typeof scheduleSettingsSave === "function") scheduleSettingsSave();
    emit();
    return true;
  }

  return Object.freeze({
    start,
    stop,
    subscribe,
    isConnected: () => state.connected,
    guests: () => state.guests.slice(),
    activeGuests,
    getApprovals,
    setApprovals,
    approvalFor,
    recordApproval,
    forgetApproval,
    getDeskId,
    setDeskId,
    reconnectAs,
    ensureDeskId,
    getServers,
    setServers,
    upsertServer,
    removeServer,
  });
})();
