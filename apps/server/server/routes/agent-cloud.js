// /api/agent-cloud/* — ClioTalk's agent mode on the public web.
//
// The phase-1 contract (docs/AGENT-HARNESS.md) where it makes sense, with a
// disposable container per run instead of a Mac folder:
//
//   GET  /api/agent-cloud/status              availability, caps, allowance left, own runs
//   POST /api/agent-cloud/runs                start: { prompt, model?, key?, files: [...] }
//   GET  /api/agent-cloud/runs/:id/events     Server-Sent Events, as phase 1
//   POST /api/agent-cloud/runs/:id/stop
//   GET  /api/agent-cloud/runs/:id/changes    changes WITH their new bytes
//   POST /api/agent-cloud/runs/:id/discard    container and workspace removed
//
// There is no put-back route: the page applies accepted changes to IndexedDB.
//
// Off unless enabled: public needs AI_SYSTEM6_PUBLIC_AGENT=1 (router.js lists
// the paths only then) and a verified Turnstile session (the public guard
// requires one for every /api path; the handler reads its nonce again). The
// local profile answers only with AI_SYSTEM6_AGENT_CLOUD=1 and only on
// loopback, for an end-to-end check with Docker on a Mac.

"use strict";

const { readJsonBody, sendJson } = require("../lib/http.js");
const { isPublicDeployment } = require("../runtime-profile.js");
const { clientIp, sessionFromRequest } = require("../security/public-session.js");
const { isLoopbackHostname } = require("../security/local-request.js");
const { sharedCloudConfigured } = require("../shared-cloud-budget.js");
const { agentCloudCaps, agentCloudEnabled } = require("../agent-cloud/config.js");
const { agentAllowanceSummary } = require("../agent-cloud/allowance.js");

const SSE_PING_MS = 20_000;
const TERMINAL = new Set(["done", "stopped", "error", "discarded"]);
const LOCAL_SESSION = "local-agent-cloud";

/** Loaded on first use so a deployment with the feature off never loads it. */
function runs() {
  return require("../agent-cloud/runs.js");
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {{ ok: boolean, nonce: string, status: number, code: string, error: string }}
 */
function admitAgentCloudRequest(req) {
  const refused = (/** @type {number} */ status, /** @type {string} */ code, /** @type {string} */ error) => ({ ok: false, nonce: "", status, code, error });
  if (!agentCloudEnabled()) return refused(404, "agent_cloud_not_served", "Not found");
  if (isPublicDeployment) {
    const nonce = String(sessionFromRequest(req)?.nonce || "");
    if (!nonce) return refused(401, "agent_cloud_session_required", "Verification required");
    return { ok: true, nonce, status: 200, code: "", error: "" };
  }
  const remote = String(req.socket?.remoteAddress || "");
  if (!remote || !isLoopbackHostname(remote) || /** @type {any} */ (req).aiSystem6BridgeOrigin) {
    return refused(403, "agent_cloud_not_loopback", "The local cloud-sandbox check is served on loopback only.");
  }
  return { ok: true, nonce: LOCAL_SESSION, status: 200, code: "", error: "" };
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {(nonce: string) => Promise<void>} body
 */
async function guarded(req, res, body) {
  const admission = admitAgentCloudRequest(req);
  if (!admission.ok) {
    sendJson(res, admission.status, { error: admission.error, code: admission.code });
    return;
  }
  try {
    await body(admission.nonce);
  } catch (error) {
    const status = Number(/** @type {any} */ (error)?.statusCode) || 500;
    if (status >= 500 && !/** @type {any} */ (error)?.statusCode) throw error;
    if (!res.headersSent) {
      sendJson(res, status, {
        error: String(/** @type {any} */ (error)?.message || error),
        code: String(/** @type {any} */ (error)?.code || "agent_cloud_error"),
      }, /** @type {any} */ (error)?.headers || {});
    }
  }
}

function startBodyLimit() {
  const caps = agentCloudCaps();
  const largest = Math.max(caps.shared.maxUploadBytes, caps.byok.maxUploadBytes);
  // base64 is 4/3 of the bytes; JSON framing and the prompt fit in 256 KiB.
  return Math.ceil(largest * 4 / 3) + 256 * 1024;
}

/**
 * GET /api/agent-cloud/status
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentCloudStatus(req, res) {
  await guarded(req, res, async (nonce) => {
    const caps = agentCloudCaps();
    const container = require("../agent-cloud/container.js");
    const readiness = await container.sandboxReadiness();
    /** @param {any} limits */
    const view = (limits) => ({
      runs_per_day: limits.runsPerSessionPerDay,
      max_model_calls: limits.maxModelCalls,
      max_web_calls: limits.maxWebCalls,
      max_run_tokens: limits.maxRunTokens,
      wall_seconds: Math.round(limits.wallMs / 1000),
      max_upload_bytes: limits.maxUploadBytes,
      max_upload_files: limits.maxUploadFiles,
    });
    // The agent allowance is its own pool (agent-cloud/allowance.js), not the
    // chat one: this session's runs left today, and only whether the site's
    // daily ceilings are still open.
    const sharedCaps = caps.shared;
    const site = agentAllowanceSummary();
    const used = runs().sessionRunsToday(nonce, "shared");
    sendJson(res, 200, {
      available: readiness.ready,
      reason: readiness.reason,
      shared: sharedCloudConfigured(),
      byok: true,
      models: ["deepseek-v4-flash", "deepseek-v4-pro"],
      caps: { shared: view(caps.shared), byok: view(caps.byok), max_prompt_chars: caps.maxPromptChars },
      shared_allowance: {
        runs_per_day: sharedCaps.runsPerSessionPerDay,
        runs_left: Math.max(0, sharedCaps.runsPerSessionPerDay - used),
        site_open: site.siteOpen,
        resets_at: site.resetsAt,
      },
      runs: runs().listRuns(nonce),
    }, { "Cache-Control": "no-store" });
  });
}

/**
 * POST /api/agent-cloud/runs
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentCloudRuns(req, res) {
  await guarded(req, res, async (nonce) => {
    const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: startBodyLimit() })) || {};
    const run = await runs().createRun({
      sessionNonce: nonce,
      prompt: String(body.prompt || ""),
      model: String(body.model || ""),
      key: typeof body.key === "string" ? body.key : "",
      files: body.files,
      // The same derivation the public guard's per-address windows use (it
      // honours AI_SYSTEM6_TRUST_PROXY); on the local check it is loopback.
      address: clientIp(req),
    });
    sendJson(res, 202, run);
  });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} nonce
 * @param {string} runId
 */
function streamEvents(req, res, nonce, runId) {
  const url = new URL(req.url || "/", "http://localhost");
  const after = Math.max(0, Number(req.headers["last-event-id"] || url.searchParams.get("after") || 0) || 0);
  runs().getRun(nonce, runId);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  let closed = false;
  /** @type {{ active: boolean, unsubscribe: () => void } | null} */
  let subscription = null;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    subscription?.unsubscribe();
    if (!res.writableEnded) res.end();
  };
  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(`: ping ${Date.now()}\n\n`);
  }, SSE_PING_MS);
  ping.unref?.();
  /** @param {{ seq: number, type: string, at: string, data: any }} event */
  const write = (event) => {
    if (closed || res.writableEnded) return;
    res.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify({ seq: event.seq, at: event.at, ...event.data })}\n\n`);
    if (event.type === "status" && TERMINAL.has(String(event.data?.state || ""))) setImmediate(close);
  };
  subscription = runs().subscribe(nonce, runId, after, write);
  if (!subscription.active) setImmediate(close);
  req.on("close", close);
}

/**
 * /api/agent-cloud/runs/:id/{events,changes,stop,discard}
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentCloudRunAction(req, res) {
  await guarded(req, res, async (nonce) => {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    const match = /^\/api\/agent-cloud\/runs\/(run-[a-f0-9-]{36})\/(events|changes|stop|discard)$/.exec(pathname);
    if (!match) {
      sendJson(res, 404, { error: "Not found", code: "agent_cloud_route_unknown" });
      return;
    }
    const [, runId, action] = match;
    const method = String(req.method || "GET").toUpperCase();
    const expected = action === "events" || action === "changes" ? "GET" : "POST";
    if (method !== expected) {
      sendJson(res, 405, { error: `Use ${expected}.`, code: "method_not_allowed" }, { Allow: expected });
      return;
    }
    if (action === "events") {
      streamEvents(req, res, nonce, runId);
      return;
    }
    if (action === "changes") {
      sendJson(res, 200, await runs().runChanges(nonce, runId), { "Cache-Control": "no-store" });
      return;
    }
    if (action === "stop") {
      sendJson(res, 200, await runs().stopOwnedRun(nonce, runId));
      return;
    }
    sendJson(res, 200, await runs().discardRun(nonce, runId));
  });
}

module.exports = {
  admitAgentCloudRequest,
  handleAgentCloudRunAction,
  handleAgentCloudRuns,
  handleAgentCloudStatus,
};
