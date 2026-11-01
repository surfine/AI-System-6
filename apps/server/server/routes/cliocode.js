// /api/cliocode/runs* — ClioCode's in-place engine host (M9.3).
//
// Same admission as ClioTalk's /api/agent/* (routes/agent.js): local profile
// only — router.js never lists these in the public table, and every handler
// refuses again here, so a public deployment answers 404. Under /api/ they
// already pass the ordinary same-origin guard; on top of that they refuse a
// non-loopback socket or Host even when LAN access is on (a phone on the LAN
// does not drive an engine over the writer's code), and refuse a bridged page,
// and answer only to the per-boot token (D7) in X-AI-System6-Agent-Token.
//
// Contract: docs/CLIOCODE-DESIGN.md (M9.3) — start, get, list, stop, rewind,
// the checkpoint ledger, the permission round-trip and the mode.

"use strict";

const { readJsonBody, sendJson } = require("../lib/http.js");
const { isPublicDeployment } = require("../runtime-profile.js");
const { hostHeaderParts, isLoopbackHostname } = require("../security/local-request.js");
const { AGENT_TOKEN_HEADER, tokenMatches } = require("../agent/agent-token.js");
const runs = require("../cliocode/runs.js");

const SSE_PING_MS = 20_000;
const TERMINAL = new Set(["done", "stopped", "error", "discarded"]);

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {{ ok: boolean, status: number, code: string, error: string }}
 */
function admitCliocodeRequest(req) {
  if (isPublicDeployment) return { ok: false, status: 404, code: "cliocode_not_served", error: "Not found" };
  const remote = String(req.socket?.remoteAddress || "");
  if (!remote || !isLoopbackHostname(remote)) {
    return { ok: false, status: 403, code: "cliocode_not_loopback", error: "The ClioCode engine is served on this Mac only." };
  }
  if (!isLoopbackHostname(hostHeaderParts(req.headers.host).hostname)) {
    return { ok: false, status: 403, code: "cliocode_host_not_loopback", error: "Host must be a loopback address." };
  }
  if (/** @type {any} */ (req).aiSystem6BridgeOrigin) {
    return { ok: false, status: 403, code: "cliocode_bridge_refused", error: "A bridged page cannot drive the engine." };
  }
  // D7: the same per-boot token the /api/agent routes answer to.
  if (!tokenMatches(String(req.headers[AGENT_TOKEN_HEADER] || ""))) {
    return { ok: false, status: 401, code: "cliocode_token_required", error: "The ClioCode API answers only to this boot's token, which only the desktop holds." };
  }
  return { ok: true, status: 200, code: "", error: "" };
}

/**
 * Run a handler behind the admission and turn thrown errors that carry a
 * status into JSON answers.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {() => Promise<void>} body
 */
async function guarded(req, res, body) {
  const admission = admitCliocodeRequest(req);
  if (!admission.ok) {
    sendJson(res, admission.status, { error: admission.error, code: admission.code });
    return;
  }
  try {
    await body();
  } catch (error) {
    const status = Number(/** @type {any} */ (error)?.statusCode) || 500;
    const code = String(/** @type {any} */ (error)?.code || "cliocode_error");
    if (status >= 500 && !/** @type {any} */ (error)?.statusCode) throw error;
    if (!res.headersSent) sendJson(res, status, { error: String(/** @type {any} */ (error)?.message || error), code });
  }
}

/**
 * POST /api/cliocode/runs {folderId, prompt, mode?}  ·  GET /api/cliocode/runs
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleCliocodeRuns(req, res) {
  await guarded(req, res, async () => {
    if (req.method === "GET") {
      sendJson(res, 200, { runs: runs.listRuns() }, { "Cache-Control": "no-store" });
      return;
    }
    const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 128 * 1024 })) || {};
    const run = await runs.createCodeRun({
      folderId: String(body.folderId || ""),
      prompt: String(body.prompt || ""),
      mode: String(body.mode || ""),
      engine: String(body.engine || "deepseek"),
      model: String(body.model || ""),
      // The desk language rides the header the agent fetch helper adds.
      language: String(req.headers["x-ai-system6-language"] || body.language || ""),
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234",
    });
    sendJson(res, 202, run);
  });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} runId
 */
function streamEvents(req, res, runId) {
  const url = new URL(req.url || "/", "http://localhost");
  const after = Math.max(0, Number(req.headers["last-event-id"] || url.searchParams.get("after") || 0) || 0);
  // getRun throws a 404/410 before any header is written.
  runs.getRun(runId);
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
  subscription = runs.subscribe(runId, after, write);
  if (!subscription.active) {
    // A finished run replays what it has and ends; one loaded from disk after
    // a restart has no log, so it says where it stands.
    const run = runs.getRun(runId);
    if (!run.events.length) write({ seq: 0, type: "status", at: new Date().toISOString(), data: { state: run.state } });
    setImmediate(close);
  }
  req.on("close", close);
}

/**
 * Prefix routes under /api/cliocode/runs/:id/…
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleCliocodeRunAction(req, res) {
  await guarded(req, res, async () => {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    const method = String(req.method || "GET").toUpperCase();
    const match = /^\/api\/cliocode\/runs\/([^/]+)(?:\/(events|checkpoints|stop|rewind|permission|mode|discard))?$/.exec(pathname);
    if (!match) {
      sendJson(res, 404, { error: "Not found", code: "cliocode_route_unknown" });
      return;
    }
    const [, runId, action] = match;
    // GET: the run itself, its event stream and its checkpoint ledger.
    // POST: stop, rewind, the writer's permission answer, the mode, discard.
    const expected = !action || action === "events" || action === "checkpoints" ? "GET" : "POST";
    if (method !== expected) {
      sendJson(res, 405, { error: `Use ${expected}.`, code: "method_not_allowed" }, { Allow: expected });
      return;
    }
    if (!action) {
      sendJson(res, 200, runs.runSummary(runId), { "Cache-Control": "no-store" });
      return;
    }
    if (action === "events") {
      streamEvents(req, res, runId);
      return;
    }
    if (action === "checkpoints") {
      sendJson(res, 200, runs.listCheckpoints(runId), { "Cache-Control": "no-store" });
      return;
    }
    if (action === "stop") {
      sendJson(res, 200, await runs.stopRun(runId));
      return;
    }
    if (action === "rewind") {
      const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 4096 })) || {};
      sendJson(res, 200, runs.rewindRun(runId, body));
      return;
    }
    if (action === "permission") {
      const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 4096 })) || {};
      sendJson(res, 200, runs.answerPermission(runId, String(body.toolCallId || ""), String(body.decision || "")));
      return;
    }
    if (action === "mode") {
      const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 4096 })) || {};
      sendJson(res, 200, runs.setRunMode(runId, String(body.mode || "")));
      return;
    }
    await readJsonBody(req, { limitBytes: 4096 }).catch(() => null);
    sendJson(res, 200, await runs.discardRun(runId));
  });
}

module.exports = { admitCliocodeRequest, handleCliocodeRunAction, handleCliocodeRuns };
