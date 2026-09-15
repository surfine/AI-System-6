// Outbound MCP — AI System 6 as a client of someone else's MCP server.
//
// The mirror of routes/mcp.js: there a guest agent reaches this desk; here
// the desk reaches an external server the writer configured by hand in
// Chooser. The page cannot speak to another origin (the browser would refuse
// it, and the desk's own CSP forbids it), so the Node server proxies, exactly
// as it already proxies Reader and the cloud providers.
//
// The writer names the server. A guest agent cannot: no guest tool reaches
// this module, and the route is browser-same-origin, local profile only.

"use strict";

const dns = require("node:dns/promises");
const net = require("node:net");

const { nodePostJson } = require("./lib/fetch.js");
const { isPrivateAddress } = require("./reader.js");

const MCP_PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = Object.freeze({ name: "AI System 6", version: "1" });
const CALL_TIMEOUT_MS = 45_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const SESSION_TTL_MS = 10 * 60 * 1000;

/** @type {Map<string, { sessionId: string, at: number }>} */
const sessions = new Map();

/**
 * @param {string} message
 * @param {string} code
 */
function mcpClientError(message, code = "mcp_client_error") {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = 502;
  return error;
}

function isLoopbackHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host === "localhost" || host === "localhost.localdomain" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "[::1]") return true;
  if (net.isIP(host) === 4) return host.split(".")[0] === "127";
  return false;
}

/**
 * The rule: TLS for anything off this machine, plaintext only to this
 * machine. That admits the two real cases — a local tool server and a public
 * HTTPS one — and refuses the classic proxy pivot into the LAN.
 *
 * @param {string} value
 * @returns {Promise<string>} the normalized URL
 */
async function resolveMcpServerTarget(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw mcpClientError("An MCP server needs a full URL, for example https://example.com/mcp.", "mcp_client_invalid_url");
  }
  if (parsed.username || parsed.password) {
    throw mcpClientError("Put credentials in a header, not in the server URL.", "mcp_client_url_credentials");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw mcpClientError("An MCP server URL must start with http:// or https://.", "mcp_client_unsupported_scheme");
  }
  const hostname = parsed.hostname.toLowerCase();
  const loopback = isLoopbackHost(hostname);
  if (parsed.protocol === "http:" && !loopback) {
    throw mcpClientError("Plain http reaches only this Mac. Use https for a server anywhere else.", "mcp_client_insecure_remote");
  }
  if (loopback) return parsed.href;
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw mcpClientError("An MCP server on a private network address is refused.", "mcp_client_private_address");
    }
    return parsed.href;
  }
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw mcpClientError(`DNS lookup failed for ${hostname}.`, "mcp_client_dns_failed");
  }
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw mcpClientError("An MCP server that resolves to a private network address is refused.", "mcp_client_private_address");
  }
  return parsed.href;
}

/**
 * @param {Record<string, unknown> | undefined} headers
 * @returns {Record<string, string>}
 */
function safeHeaders(headers) {
  const out = {};
  Object.entries(headers || {}).forEach(([name, value]) => {
    const key = String(name || "").trim();
    // Hop-by-hop and framing headers belong to the transport, not the caller.
    if (!/^[A-Za-z0-9-]+$/.test(key)) return;
    if (["host", "content-length", "content-type", "connection", "mcp-session-id", "mcp-protocol-version"].includes(key.toLowerCase())) return;
    out[key] = String(value ?? "").replace(/[\r\n]/g, " ").slice(0, 2048);
  });
  return out;
}

/**
 * nodePostJson has no timeout of its own; a server that accepts the socket
 * and never answers would otherwise hold the request open until the browser
 * gives up. The deadline travels as a signal so an aborted page cancels too.
 *
 * @param {AbortSignal | null | undefined} signal
 */
function withDeadline(signal) {
  const deadline = AbortSignal.timeout(CALL_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

/**
 * @param {string} url
 * @param {unknown} payload
 * @param {Record<string, string>} headers
 * @param {AbortSignal | null | undefined} signal
 */
async function mcpPost(url, payload, headers, signal) {
  let response;
  try {
    response = await nodePostJson(url, payload, withDeadline(signal), {
      Accept: "application/json, text/event-stream",
      ...headers,
    }, { maxBytes: MAX_RESPONSE_BYTES });
  } catch (error) {
    throw mcpClientError(`Could not reach the MCP server: ${String(/** @type {any} */ (error)?.message || error)}`, "mcp_client_unreachable");
  }
  const text = await response.text();
  if (!response.ok) {
    throw mcpClientError(`The MCP server answered ${response.status}: ${text.slice(0, 300)}`, "mcp_client_http_error");
  }
  const sessionId = response.headers.get("mcp-session-id") || "";
  if (!text.trim()) return { body: null, sessionId };
  let body;
  try {
    // A server may answer a single JSON-RPC response as one SSE frame.
    body = text.trimStart().startsWith("event:") || text.trimStart().startsWith("data:")
      ? JSON.parse((/^data: (.+)$/m.exec(text) || [])[1] || "null")
      : JSON.parse(text);
  } catch {
    throw mcpClientError("The MCP server did not answer with JSON.", "mcp_client_bad_json");
  }
  if (body && body.error) {
    throw mcpClientError(`The MCP server refused the call: ${String(body.error.message || body.error.code)}`, "mcp_client_rpc_error");
  }
  return { body, sessionId };
}

/**
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {AbortSignal | null | undefined} signal
 */
async function openSession(url, headers, signal) {
  const cached = sessions.get(url);
  if (cached && Date.now() - cached.at < SESSION_TTL_MS) return cached.sessionId;
  const { body, sessionId } = await mcpPost(url, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
  }, headers, signal);
  const negotiated = String(body?.result?.protocolVersion || MCP_PROTOCOL_VERSION);
  const versionHeaders = { ...headers, "MCP-Protocol-Version": negotiated, ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) };
  // The notification is best-effort: a server that ignores it still serves.
  await mcpPost(url, { jsonrpc: "2.0", method: "notifications/initialized" }, versionHeaders, signal).catch(() => {});
  sessions.set(url, { sessionId, at: Date.now() });
  return sessionId;
}

/**
 * @param {Record<string, string>} headers
 * @param {string} sessionId
 */
function sessionHeaders(headers, sessionId) {
  return {
    ...headers,
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
  };
}

/**
 * @param {{ url: string, headers?: Record<string, unknown> }} server
 * @param {AbortSignal | null | undefined} signal
 */
async function listMcpTools(server, signal) {
  const url = await resolveMcpServerTarget(server?.url);
  const headers = safeHeaders(server?.headers);
  const sessionId = await openSession(url, headers, signal);
  const { body } = await mcpPost(url, { jsonrpc: "2.0", id: 2, method: "tools/list" }, sessionHeaders(headers, sessionId), signal);
  const tools = Array.isArray(body?.result?.tools) ? body.result.tools : [];
  return {
    url,
    tools: tools.map((tool) => ({
      name: String(tool?.name || ""),
      description: String(tool?.description || "").slice(0, 800),
      // The desk has to fill this tool's arguments without a human in the
      // loop, so the shape travels with the name: which properties are
      // strings, and which the server insists on.
      properties: Object.entries(tool?.inputSchema?.properties || {})
        .slice(0, 40)
        .map(([name, schema]) => ({ name: String(name), type: String(schema?.type || "") })),
      required: Array.isArray(tool?.inputSchema?.required) ? tool.inputSchema.required.map(String).slice(0, 20) : [],
    })).filter((tool) => tool.name),
  };
}

/**
 * @param {{ url: string, headers?: Record<string, unknown> }} server
 * @param {string} tool
 * @param {Record<string, unknown>} args
 * @param {AbortSignal | null | undefined} signal
 */
async function callMcpTool(server, tool, args, signal) {
  const url = await resolveMcpServerTarget(server?.url);
  const headers = safeHeaders(server?.headers);
  const name = String(tool || "");
  if (!name) throw mcpClientError("No tool was named.", "mcp_client_no_tool");
  let sessionId = await openSession(url, headers, signal);
  const send = () => mcpPost(url, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name, arguments: args && typeof args === "object" ? args : {} },
  }, sessionHeaders(headers, sessionId), signal);
  let body;
  try {
    ({ body } = await send());
  } catch (error) {
    // A cached session the server has since forgotten: open a new one once.
    if (/** @type {any} */ (error)?.code !== "mcp_client_http_error") throw error;
    sessions.delete(url);
    sessionId = await openSession(url, headers, signal);
    ({ body } = await send());
  }
  const result = body?.result || {};
  const content = Array.isArray(result.content) ? result.content : [];
  return {
    url,
    tool: name,
    isError: result.isError === true,
    text: content.filter((block) => block?.type === "text").map((block) => String(block.text || "")).join("\n\n"),
    structured: result.structuredContent ?? null,
  };
}

/** Test seam. */
function resetMcpClientSessions() {
  sessions.clear();
}

module.exports = {
  MCP_PROTOCOL_VERSION,
  callMcpTool,
  isLoopbackHost,
  listMcpTools,
  resetMcpClientSessions,
  resolveMcpServerTarget,
  safeHeaders,
};
