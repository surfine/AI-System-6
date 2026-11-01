// Connector gateway: the one way a run's engine reaches an outside MCP server.
//
// dsh's MCP client registers every tool a server lists and calls it without
// asking anyone (dsh-mcp-client 0.2.1-rc.3 has no approval and no tool
// filter). So the engine is never given a connector's address. Each run gets
// a small MCP server of its own on 127.0.0.1, the only extra port its sandbox
// may reach, and every connector is one path on it. The gateway:
//
//   - lists the connector's tools minus the ones the writer switched off;
//   - runs a tool the writer allowed, or one the server marks readOnlyHint
//     and the writer left at its default;
//   - asks the writer on the desk (a `connector_ask` run event, answered at
//     POST /api/agent/runs/:id/connectors/:askId) before anything else, and
//     runs nothing on a refusal, a timeout or a closed run;
//   - records every call.
//
// The connector's own headers (its credentials) stay here and never enter the
// sandbox. Outbound requests go through mcp-client.js, which refuses plain
// http off this Mac and any private network address.
//
// Owner ruling 2026-10-31: connectors through a local gateway, not engine-
// direct. Contract: tests/features/connector-gateway.test.mjs

"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const mcpClient = require("../mcp-client.js");

const MAX_CONNECTORS = 5;
const ASK_TIMEOUT_MS = 5 * 60_000;
const MAX_BODY_BYTES = 1024 * 1024;
const PROTOCOL_VERSIONS = new Set(["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]);
const RULES = new Set(["allow", "ask", "off"]);
const TOKEN_PATTERN = /^[0-9a-f]{48}$/;
const MAX_PENDING_ASKS = 3;
const MAX_ARGS_CHARS = 4000;
const MAX_TOOL_NAME = 120;
// Refused or unknown calls a run may make before its connectors close: an
// engine looping on refusals is stopped instead of filling the log.
const MAX_REFUSALS = 30;

/**
 * @typedef {{ name: string, url: string, headers?: Record<string, string>, tools?: Record<string, string> }} ConnectorInput
 * @typedef {{ askId: string, connector: string, tool: string, title: string, args: string, argsTruncated: boolean }} ConnectorAsk
 * @typedef {{ connector: string, tool: string, ok: boolean, status: string }} ConnectorCall
 */

/**
 * Validate the page's connector list before a run starts. Names become path
 * segments and engine tool prefixes, so they are kept to dsh's own pattern.
 * @param {unknown} input
 * @returns {Promise<ConnectorInput[]>}
 */
async function normalizeConnectors(input) {
  if (!Array.isArray(input)) return [];
  if (input.length > MAX_CONNECTORS) throw gatewayError(`A run can use at most ${MAX_CONNECTORS} connectors.`, "connector_limit");
  /** @type {ConnectorInput[]} */
  const out = [];
  for (const raw of input) {
    const name = String(raw?.name || "").trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40);
    if (!name || out.some((entry) => entry.name === name)) throw gatewayError("Each connector needs its own name.", "connector_name");
    const url = await mcpClient.resolveMcpServerTarget(raw?.url);
    // The desk's own outbound client may talk to this Mac; a connector may
    // not, or a run could reach the desk's server through the gateway.
    if (!url.startsWith("https://") || mcpClient.isLoopbackHost(new URL(url).hostname)) {
      throw gatewayError("A connector must be an https:// server on the internet.", "connector_not_https");
    }
    // A null-prototype map: a tool named __proto__ is an ordinary key.
    /** @type {Record<string, string>} */
    const tools = Object.create(null);
    for (const [tool, rule] of Object.entries(raw?.tools || {})) {
      if (RULES.has(String(rule))) tools[String(tool)] = String(rule);
    }
    out.push({ name, url, headers: mcpClient.safeHeaders(raw?.headers), tools });
  }
  return out;
}

/**
 * @param {string} message
 * @param {string} code
 */
function gatewayError(message, code) {
  const error = /** @type {Error & { code?: string, status?: number }} */ (new Error(message));
  error.code = code;
  error.status = 400;
  return error;
}

/**
 * Which rule applies to one tool. The page sends the rule the writer saw for
 * every tool it listed; anything else asks. The server's current hints are
 * not trusted here: a tool relabelled read-only after the writer looked
 * cannot turn Ask into Allow. In a read-only (只读) run only a tool the server
 * marks read-only and not destructive may run at all.
 * @param {ConnectorInput} connector
 * @param {Record<string, any> | undefined} definition
 * @param {string} tool
 * @param {boolean} [readOnlyRun]
 */
function ruleFor(connector, definition, tool, readOnlyRun = false) {
  const set = Object.prototype.hasOwnProperty.call(connector.tools || {}, tool) ? connector.tools?.[tool] : undefined;
  const rule = set && RULES.has(set) ? set : "ask";
  if (readOnlyRun && !(definition?.annotations?.readOnlyHint === true && definition?.annotations?.destructiveHint !== true)) return "off";
  return rule;
}

/**
 * What the writer is shown of a call's arguments: all of it up to a generous
 * cap, and a flag when anything was cut, so padding cannot hide a field.
 * @param {unknown} args
 */
function summarize(args) {
  let text = "";
  try {
    text = JSON.stringify(args ?? {}, null, 1);
  } catch {
    text = "";
  }
  return { args: text.slice(0, MAX_ARGS_CHARS), argsTruncated: text.length > MAX_ARGS_CHARS };
}

/** @param {string} text */
function toolError(text) {
  return { content: [{ type: "text", text }], isError: true };
}

/**
 * Start one run's gateway.
 * @param {{
 *   connectors: ConnectorInput[],
 *   onAsk: (ask: ConnectorAsk) => void,
 *   onCall?: (call: ConnectorCall) => void,
 *   askTimeoutMs?: number,
 *   readOnly?: boolean,
 *   client?: Pick<typeof mcpClient, "listMcpToolDefinitions" | "callMcpTool">,
 * }} options
 */
async function startConnectorGateway(options) {
  const client = options.client || mcpClient;
  const token = crypto.randomBytes(24).toString("hex");
  const connectors = new Map(options.connectors.map((connector) => [connector.name, connector]));
  /** @type {Map<string, Map<string, Record<string, any>>>} last tool list per connector */
  const definitions = new Map();
  /** @type {Map<string, { resolve: (allow: boolean) => void, timer: NodeJS.Timeout }>} */
  const asks = new Map();
  let closed = false;
  let refusals = 0;
  const abort = new AbortController();

  /** @param {ConnectorInput} connector */
  async function toolsOf(connector) {
    const tools = await client.listMcpToolDefinitions({ url: connector.url, headers: connector.headers }, abort.signal);
    const map = new Map(tools.map((tool) => [String(tool.name), tool]));
    definitions.set(connector.name, map);
    return map;
  }

  /**
   * @param {ConnectorInput} connector
   * @param {string} tool
   * @param {unknown} args
   * @returns {Promise<boolean>}
   */
  function ask(connector, tool, args) {
    // A few questions at a time: the writer is not flooded with cards.
    if (closed || asks.size >= MAX_PENDING_ASKS) return Promise.resolve(false);
    const askId = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => settle(askId, false), options.askTimeoutMs ?? ASK_TIMEOUT_MS);
      timer.unref?.();
      asks.set(askId, { resolve, timer });
      // The card names the real tool. The server's own "title" is not shown:
      // a server could call delete_repository "Read file (safe)".
      options.onAsk({ askId, connector: connector.name, tool, title: tool, ...summarize(args) });
    });
  }

  /**
   * @param {string} askId
   * @param {boolean} allow
   */
  function settle(askId, allow) {
    const pending = asks.get(askId);
    if (!pending) return false;
    asks.delete(askId);
    clearTimeout(pending.timer);
    pending.resolve(allow === true);
    return true;
  }

  /**
   * @param {ConnectorInput} connector
   * @param {any} message
   */
  async function answer(connector, message) {
    const id = message?.id;
    const method = String(message?.method || "");
    if (method === "initialize") {
      const requested = String(message?.params?.protocolVersion || "");
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSIONS.has(requested) ? requested : "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: `ais6-connector-${connector.name}`, version: "1" },
        },
      };
    }
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (method === "tools/list") {
      const tools = await toolsOf(connector);
      const visible = [...tools.values()].filter((tool) => ruleFor(connector, tool, String(tool.name), options.readOnly) !== "off");
      return { jsonrpc: "2.0", id, result: { tools: visible } };
    }
    if (method === "tools/call") {
      const tool = String(message?.params?.name || "").slice(0, MAX_TOOL_NAME);
      const args = message?.params?.arguments ?? {};
      const known = definitions.get(connector.name) || await toolsOf(connector);
      const definition = known.get(tool);
      const record = (/** @type {boolean} */ ok, /** @type {string} */ status) => {
        if (!ok) refusals += 1;
        options.onCall?.({ connector: connector.name, tool, ok, status });
      };
      if (closed || refusals >= MAX_REFUSALS) {
        return { jsonrpc: "2.0", id, result: toolError("Connectors are closed for this run.") };
      }
      if (!definition) {
        record(false, "unknown-tool");
        return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${tool}` } };
      }
      const rule = ruleFor(connector, definition, tool, options.readOnly);
      if (rule === "off") {
        record(false, "tool-off");
        return { jsonrpc: "2.0", id, result: toolError(`The writer turned off ${tool} for Clio.`) };
      }
      if (rule === "ask" && !(await ask(connector, tool, args))) {
        record(false, "declined-by-writer");
        return { jsonrpc: "2.0", id, result: toolError(`The writer did not allow ${tool} this time; nothing was run.`) };
      }
      // The run may have ended while the list or the writer's answer was
      // awaited: nothing goes upstream after close.
      if (closed) {
        record(false, "closed");
        return { jsonrpc: "2.0", id, result: toolError("The run has ended; nothing was run.") };
      }
      try {
        const result = await client.callMcpTool({ url: connector.url, headers: connector.headers }, tool, args, abort.signal);
        record(!result.isError, result.isError ? "tool-error" : "done");
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: result.text }],
            ...(result.structured != null ? { structuredContent: result.structured } : {}),
            isError: result.isError,
          },
        };
      } catch (error) {
        record(false, "failed");
        return { jsonrpc: "2.0", id, result: toolError(`The connector did not answer: ${String(/** @type {any} */ (error)?.message || error).slice(0, 300)}`) };
      }
    }
    if (id === undefined) return null; // a notification needs no answer
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  }

  const server = http.createServer((req, res) => {
    const match = /^\/c\/([A-Za-z0-9_-]{1,40})$/.exec(new URL(req.url || "/", "http://127.0.0.1").pathname);
    const connector = match ? connectors.get(match[1]) : undefined;
    // The token is checked for shape first: timingSafeEqual throws on
    // buffers of unequal byte length, and a throw here would take the whole
    // desk server down. Only the gateway's own Host is accepted, which also
    // shuts out a DNS-rebinding page.
    const presented = String(req.headers["x-ais6-gateway"] || "");
    const authorized = TOKEN_PATTERN.test(presented) && crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(token));
    const hostOk = String(req.headers.host || "") === `127.0.0.1:${port}`;
    if (closed || !connector || !authorized || !hostOk || req.method !== "POST") {
      res.writeHead(closed ? 410 : 404).end();
      return;
    }
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) req.destroy();
      else chunks.push(chunk);
    });
    req.on("end", async () => {
      let message;
      try {
        message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
        return;
      }
      const reply = await answer(connector, message).catch((error) => ({ jsonrpc: "2.0", id: message?.id ?? null, error: { code: -32603, message: String(error?.message || error).slice(0, 300) } }));
      if (!reply) {
        res.writeHead(202).end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(reply));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(undefined));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    port,
    /** The engine's mcpServers entries: this gateway's paths, never the connectors' own URLs. */
    mcpServers: [...connectors.keys()].map((name) => ({
      type: /** @type {"http"} */ ("http"),
      name,
      url: `http://127.0.0.1:${port}/c/${name}`,
      headers: [{ name: "x-ais6-gateway", value: token }],
    })),
    /**
     * The writer's answer from the desk.
     * @param {string} askId
     * @param {boolean} allow
     */
    answer: (askId, allow) => settle(String(askId || ""), allow === true),
    pendingAsks: () => [...asks.keys()],
    async close() {
      closed = true;
      abort.abort();
      for (const askId of [...asks.keys()]) settle(askId, false);
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    },
  };
}

module.exports = { normalizeConnectors, startConnectorGateway, ruleFor, MAX_CONNECTORS };
