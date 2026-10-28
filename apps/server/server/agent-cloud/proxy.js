// The host-side door a cloud run's engine uses for its model and web tools.
//
// The container has no network. Its only way out is a unix socket in the run's
// directory, bind-mounted read-only at /run/ais6/proxy.sock and exposed inside
// the container on 127.0.0.1:8787 by the runner. This module is what answers
// on that socket. It:
//
//   - admits a request only with the run's token, sent where dsh sends an API
//     key (`x-api-key`, or `Authorization: Bearer`); no token is 401, a wrong
//     one 403, compared in constant time;
//   - serves exactly three upstream paths on DeepSeek's public API:
//       POST /anthropic/v1/messages   model turns and web_search (Messages
//                                     with the web_search tool)
//       POST /v1/tools/search         DeepSeek Search API
//       POST /v1/tools/fetch          DeepSeek Fetch API (web_fetch)
//     everything else is 404, so the engine cannot reach any other host;
//   - swaps the token for the real key (the site's shared DeepSeek key, or the
//     visitor's own key held in this closure for the run only);
//   - passes a Messages call's `tools` only as the engine's own client tools
//     plus at most one web_search server tool, whose max_uses is clamped to
//     WEB_SEARCH_MAX_USES (a call is booked as one web call); any other server
//     tool is refused;
//   - books every call: on the agent allowance through allowance.js (one
//     reservation per call, settled from the reported usage, weighted like
//     /api/cloud/chat but in its own file: agent calls never touch the chat
//     allowance), and always against the run's own caps (model calls, web
//     calls, tokens).
//
// Answers to the engine use Anthropic's error shape, so dsh shows the reason.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");

const { DEEPSEEK_PUBLIC_BASE_URL, isDeepSeekCloudModelId, normalizeCloudModelId } = require("../cloud.js");
const { cloudModelBudgetWeight } = require("../task-policy.js");
const { pseudonymousCloudUserId, usageTokenTotal } = require("../shared-cloud-budget.js");
const { reserveAgentCall } = require("./allowance.js");

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 180_000;
const ROUTES = Object.freeze({
  "/anthropic/v1/messages": { upstream: "/anthropic/v1/messages", kind: "messages" },
  "/v1/tools/search": { upstream: "/v1/tools/search", kind: "web" },
  "/v1/tools/fetch": { upstream: "/v1/tools/fetch", kind: "web" },
});
// A web tool call has no reported usage; it is booked as this many tokens.
const WEB_CALL_TOKEN_ESTIMATE = 1000;
// One Messages call with web_search is one web call on the run's cap, so the
// searches the model may make inside it are bounded here.
const WEB_SEARCH_MAX_USES = 3;
const WEB_SEARCH_TYPE = /^web_search_\d{8}$/;

/**
 * Allow-list a Messages call's tools: client tools (no `type`, or "custom",
 * with a name) pass unchanged; one web_search server tool passes with
 * max_uses clamped; anything else is refused.
 * @param {unknown} tools
 * @returns {{ ok: true, tools: any[] } | { ok: false, code: string, message: string }}
 */
function allowedTools(tools) {
  if (!Array.isArray(tools)) return { ok: false, code: "agent_cloud_proxy_tools_invalid", message: "tools must be a list." };
  const out = [];
  let searches = 0;
  for (const tool of tools) {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
      return { ok: false, code: "agent_cloud_proxy_tools_invalid", message: "Each tool must be an object." };
    }
    const type = tool.type === undefined ? "" : String(tool.type);
    if (type === "" || type === "custom") {
      if (typeof tool.name !== "string" || !tool.name) {
        return { ok: false, code: "agent_cloud_proxy_tools_invalid", message: "A client tool needs a name." };
      }
      out.push(tool);
      continue;
    }
    if (WEB_SEARCH_TYPE.test(type)) {
      searches += 1;
      if (searches > 1) return { ok: false, code: "agent_cloud_proxy_tool_refused", message: "A call may carry one web_search tool." };
      const asked = Number(tool.max_uses);
      const maxUses = Number.isInteger(asked) && asked > 0 ? Math.min(asked, WEB_SEARCH_MAX_USES) : WEB_SEARCH_MAX_USES;
      out.push({ ...tool, max_uses: maxUses });
      continue;
    }
    return { ok: false, code: "agent_cloud_proxy_tool_refused", message: `The sandbox offers no server tool of type ${type.slice(0, 60)}.` };
  }
  return { ok: true, tools: out };
}

/**
 * @typedef {object} ProxyCaps
 * @property {number} maxModelCalls
 * @property {number} maxWebCalls
 * @property {number} maxRunTokens        0 = no token cap (own key)
 * @property {number} maxCallOutputTokens
 */

/**
 * @typedef {object} RunProxyOptions
 * @property {string} token               the run's proxy token
 * @property {"shared" | "byok"} allowance
 * @property {string} sessionNonce        the visitor's verified session
 * @property {string} [byokKey]           the visitor's own key (byok only)
 * @property {ProxyCaps} caps
 * @property {(event: { type: string, [key: string]: unknown }) => void} [onEvent]
 * @property {typeof fetch} [upstreamFetch]
 * @property {string} [baseUrl]
 */

/** @param {import("node:http").IncomingHttpHeaders} headers */
function tokenFromHeaders(headers) {
  const apiKey = String(headers["x-api-key"] || "").trim();
  if (apiKey) return apiKey;
  const auth = String(headers.authorization || "");
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1].trim() : "";
}

/** @param {string} a @param {string} b */
function sameToken(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {string} code
 * @param {string} message
 */
function refuse(res, status, code, message) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body = JSON.stringify({ type: "error", error: { type: code, message }, code });
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

/** @param {http.IncomingMessage} req */
async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_REQUEST_BYTES) {
      const error = new Error("Request body too large.");
      /** @type {any} */ (error).code = "agent_cloud_proxy_body_too_large";
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Anthropic-style usage → one total (input, output and cache reads/writes).
 * @param {any} usage
 * @returns {number | null}
 */
function messagesUsageTotal(usage) {
  if (!usage || typeof usage !== "object") return null;
  const fields = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"];
  if (!fields.some((field) => Number.isFinite(Number(usage[field])))) return usageTokenTotal(usage);
  return fields.reduce((sum, field) => sum + Math.max(0, Math.floor(Number(usage[field]) || 0)), 0);
}

/**
 * Follows a Messages SSE stream and keeps the latest usage: message_start
 * carries input (and a first output count), message_delta the running output.
 */
function createMessagesUsageTracker() {
  let buffer = "";
  /** @type {Record<string, number>} */
  const usage = {};
  let seen = false;
  /** @param {any} value */
  const merge = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, number] of Object.entries(value)) {
      if (Number.isFinite(Number(number))) {
        usage[key] = Number(number);
        seen = true;
      }
    }
  };
  return {
    /** @param {Buffer | string} chunk */
    push(chunk) {
      buffer += chunk.toString();
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line.startsWith("data:")) continue;
        try {
          const event = JSON.parse(line.slice(5).trim());
          if (event?.type === "message_start") merge(event.message?.usage);
          else if (event?.type === "message_delta") merge(event.usage);
        } catch {}
      }
      if (buffer.length > 1024 * 1024) buffer = buffer.slice(-65536);
    },
    /** @param {any} json */
    fromJson(json) {
      merge(json?.usage);
    },
    total() {
      return seen ? messagesUsageTotal(usage) : null;
    },
  };
}

/**
 * Builds the request handler for one run. Exposed for contracts; the socket
 * server below wraps it.
 * @param {RunProxyOptions} options
 */
function createRunProxyHandler(options) {
  const caps = options.caps;
  const baseUrl = String(options.baseUrl || DEEPSEEK_PUBLIC_BASE_URL).replace(/\/+$/, "");
  const upstreamFetch = options.upstreamFetch || fetch;
  const emit = options.onEvent || (() => {});
  const state = { modelCalls: 0, webCalls: 0, tokens: 0, closed: false };
  /** @type {Set<AbortController>} */
  const inflight = new Set();

  function upstreamKey() {
    if (options.allowance === "byok") return String(options.byokKey || "");
    return String(process.env.DEEPSEEK_API_KEY || "").trim();
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async function handle(req, res) {
    if (state.closed) {
      refuse(res, 503, "agent_cloud_run_closed", "This run has ended.");
      return;
    }
    const presented = tokenFromHeaders(req.headers);
    if (!presented) {
      refuse(res, 401, "agent_cloud_proxy_token_required", "A run token is required.");
      return;
    }
    if (!sameToken(presented, options.token)) {
      refuse(res, 403, "agent_cloud_proxy_token_invalid", "This token does not belong to this run.");
      return;
    }
    const pathname = String(req.url || "/").split("?")[0];
    const route = Object.prototype.hasOwnProperty.call(ROUTES, pathname) ? ROUTES[/** @type {keyof typeof ROUTES} */ (pathname)] : null;
    if (!route || req.method !== "POST") {
      refuse(res, 404, "agent_cloud_proxy_route_unknown", "The sandbox reaches only the model and the web tools.");
      return;
    }
    let raw;
    let payload;
    try {
      raw = await readBody(req);
      payload = JSON.parse(raw.toString("utf8") || "{}");
    } catch (error) {
      refuse(res, 400, String(/** @type {any} */ (error)?.code || "agent_cloud_proxy_bad_json"), "The request body is not JSON within the size limit.");
      return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      refuse(res, 400, "agent_cloud_proxy_bad_json", "The request body must be a JSON object.");
      return;
    }

    if (route.kind === "messages" && payload.tools !== undefined) {
      const checked = allowedTools(payload.tools);
      if (checked.ok === false) {
        refuse(res, 400, checked.code, checked.message);
        return;
      }
      payload.tools = checked.tools;
    }
    const isSearchTurn = route.kind === "messages"
      && Array.isArray(payload.tools)
      && payload.tools.some((tool) => WEB_SEARCH_TYPE.test(String(tool?.type || "")));
    const isWeb = route.kind === "web" || isSearchTurn;

    // The run's own caps, before anything is spent.
    if (isWeb && state.webCalls >= caps.maxWebCalls) {
      emit({ type: "cap", code: "agent_cloud_web_call_cap" });
      refuse(res, 429, "agent_cloud_web_call_cap", `This run may use the web ${caps.maxWebCalls} times.`);
      return;
    }
    if (route.kind === "messages" && state.modelCalls >= caps.maxModelCalls) {
      emit({ type: "cap", code: "agent_cloud_model_call_cap" });
      refuse(res, 429, "agent_cloud_model_call_cap", `This run may call the model ${caps.maxModelCalls} times.`);
      return;
    }
    if (caps.maxRunTokens > 0 && state.tokens >= caps.maxRunTokens) {
      emit({ type: "cap", code: "agent_cloud_token_cap" });
      refuse(res, 429, "agent_cloud_token_cap", "This run has used its token allowance.");
      return;
    }

    let weight = 1;
    if (route.kind === "messages") {
      const model = normalizeCloudModelId(payload.model);
      if (!isDeepSeekCloudModelId(model)) {
        refuse(res, 400, "unsupported_model", "The cloud sandbox runs DeepSeek models only.");
        return;
      }
      payload.model = model;
      weight = cloudModelBudgetWeight(model);
      const requested = Number(payload.max_tokens);
      payload.max_tokens = Math.min(caps.maxCallOutputTokens, Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : caps.maxCallOutputTokens);
      // The same pseudonymous per-session id /api/cloud/chat sends, in place
      // of whatever the engine put there.
      payload.metadata = { user_id: pseudonymousCloudUserId(options.sessionNonce) };
    }

    /** @type {any} */
    let reservation = null;
    if (options.allowance === "shared") {
      try {
        reservation = reserveAgentCall({
          payload: route.kind === "messages" ? payload : { ...payload, max_tokens: WEB_CALL_TOKEN_ESTIMATE },
          modelWeight: weight,
        });
      } catch {
        refuse(res, 503, "agent_cloud_allowance_unavailable", "The agent allowance is temporarily unavailable.");
        return;
      }
      if (!reservation.ok) {
        emit({ type: "cap", code: reservation.code });
        refuse(res, reservation.status || 429, reservation.code, reservation.detail);
        return;
      }
    }

    const key = upstreamKey();
    if (!key) {
      reservation?.settle({ requestSent: false });
      refuse(res, 503, "agent_cloud_key_missing", "No model key is configured for this run.");
      return;
    }

    if (route.kind === "messages") state.modelCalls += 1;
    if (isWeb) state.webCalls += 1;
    emit({ type: "call", kind: isWeb ? "web" : "model", modelCalls: state.modelCalls, webCalls: state.webCalls });

    const controller = new AbortController();
    inflight.add(controller);
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    const tracker = createMessagesUsageTracker();
    /** @type {Record<string, string>} */
    const headers = { "content-type": "application/json", accept: String(req.headers.accept || "application/json") };
    if (route.kind === "messages") {
      headers["x-api-key"] = key;
      headers["anthropic-version"] = String(req.headers["anthropic-version"] || "2023-06-01");
      const beta = String(req.headers["anthropic-beta"] || "");
      if (beta && /^[A-Za-z0-9,._-]{1,400}$/.test(beta)) headers["anthropic-beta"] = beta;
    } else {
      headers.authorization = `Bearer ${key}`;
    }
    let sent = false;
    let booked = false;
    // Booked before the answer's last byte goes out, so the run's spend is
    // current by the time the engine reports its turn as done.
    const book = () => {
      if (booked) return;
      booked = true;
      const reported = route.kind === "messages" ? tracker.total() : null;
      const tokens = reported !== null
        ? Math.ceil(reported * weight)
        : sent ? (route.kind === "messages" ? Number(reservation?.reservedTokens || 0) : WEB_CALL_TOKEN_ESTIMATE) : 0;
      state.tokens += tokens;
      if (reservation) {
        if (reported !== null) reservation.addUsage(reported);
        reservation.settle({ requestSent: sent });
      }
      emit({ type: "usage", tokens: state.tokens, modelCalls: state.modelCalls, webCalls: state.webCalls });
      if (caps.maxRunTokens > 0 && state.tokens >= caps.maxRunTokens) emit({ type: "cap", code: "agent_cloud_token_cap" });
    };
    try {
      const upstream = await upstreamFetch(`${baseUrl}${route.upstream}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
        redirect: "error",
      });
      sent = true;
      reservation?.markUpstreamStarted();
      const contentType = String(upstream.headers.get("content-type") || "application/json");
      res.writeHead(upstream.status, { "Content-Type": contentType, "Cache-Control": "no-store" });
      const streaming = /text\/event-stream/i.test(contentType);
      /** @type {Buffer[]} */
      const kept = [];
      let keptBytes = 0;
      if (upstream.body) {
        for await (const chunk of /** @type {any} */ (upstream.body)) {
          const buffer = Buffer.from(chunk);
          if (streaming) tracker.push(buffer);
          else if (keptBytes < 8 * 1024 * 1024) {
            kept.push(buffer);
            keptBytes += buffer.length;
          }
          if (!res.writableEnded) res.write(buffer);
        }
      }
      if (!streaming && route.kind === "messages") {
        try { tracker.fromJson(JSON.parse(Buffer.concat(kept).toString("utf8"))); } catch {}
      }
      book();
      res.end();
    } catch (error) {
      refuse(res, 502, controller.signal.aborted ? "agent_cloud_upstream_timeout" : "agent_cloud_upstream_failed", "The model provider did not answer.");
    } finally {
      clearTimeout(timer);
      inflight.delete(controller);
      book();
    }
  }

  return {
    handle,
    state,
    close() {
      state.closed = true;
      for (const controller of inflight) controller.abort();
    },
  };
}

/**
 * Listen on a unix socket for one run. The socket is world-connectable (the
 * container's user is a mapped uid); the token is what admits a caller.
 * @param {RunProxyOptions & { socketPath: string }} options
 * @returns {Promise<{ socketPath: string, state: any, close: () => Promise<void> }>}
 */
async function startRunProxy(options) {
  const handler = createRunProxyHandler(options);
  try { fs.unlinkSync(options.socketPath); } catch {}
  const server = http.createServer((req, res) => {
    handler.handle(req, res).catch(() => refuse(res, 500, "agent_cloud_proxy_failed", "The sandbox proxy failed."));
  });
  server.headersTimeout = 30_000;
  server.requestTimeout = UPSTREAM_TIMEOUT_MS + 30_000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.socketPath, () => resolve(undefined));
  });
  fs.chmodSync(options.socketPath, 0o666);
  return {
    socketPath: options.socketPath,
    state: handler.state,
    async close() {
      handler.close();
      await new Promise((resolve) => server.close(() => resolve(undefined)));
      server.closeAllConnections?.();
      try { fs.unlinkSync(options.socketPath); } catch {}
    },
  };
}

module.exports = {
  ROUTES,
  WEB_CALL_TOKEN_ESTIMATE,
  WEB_SEARCH_MAX_USES,
  allowedTools,
  createMessagesUsageTracker,
  createRunProxyHandler,
  messagesUsageTotal,
  startRunProxy,
};
