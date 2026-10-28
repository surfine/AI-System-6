// /api/agent/folders* and /api/agent/runs* — ClioTalk's engine host.
//
// Local profile only: router.js never lists these in the public table, and
// every handler refuses again here, so a public deployment answers 404. Under
// /api/ they already pass the ordinary same-origin guard; on top of that they
// refuse a non-loopback socket or Host even when LAN access is on (like /mcp,
// a phone on the LAN does not drive an agent over the writer's Mac files), and
// refuse a public page arriving through the browser bridge.
//
// Contract and event schemas: docs/AGENT-HARNESS.md.

"use strict";

const { readJsonBody, sendJson } = require("../lib/http.js");
const { isPublicDeployment } = require("../runtime-profile.js");
const { hostHeaderParts, isLoopbackHostname } = require("../security/local-request.js");
const folders = require("../agent/folders.js");
const runs = require("../agent/runs.js");
const paths = require("../agent/paths.js");

const SSE_PING_MS = 20_000;
const TERMINAL = new Set(["done", "stopped", "error", "discarded"]);

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {{ ok: boolean, status: number, code: string, error: string }}
 */
function admitAgentRequest(req) {
  if (isPublicDeployment) return { ok: false, status: 404, code: "agent_not_served", error: "Not found" };
  const remote = String(req.socket?.remoteAddress || "");
  if (!remote || !isLoopbackHostname(remote)) {
    return { ok: false, status: 403, code: "agent_not_loopback", error: "The ClioTalk engine is served on this Mac only." };
  }
  if (!isLoopbackHostname(hostHeaderParts(req.headers.host).hostname)) {
    return { ok: false, status: 403, code: "agent_host_not_loopback", error: "Host must be a loopback address." };
  }
  if (/** @type {any} */ (req).aiSystem6BridgeOrigin) {
    return { ok: false, status: 403, code: "agent_bridge_refused", error: "A bridged page cannot drive the engine." };
  }
  return { ok: true, status: 200, code: "", error: "" };
}

/**
 * Run a handler behind the agent admission and turn thrown errors that carry
 * a status into JSON answers.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {() => Promise<void>} body
 */
async function guarded(req, res, body) {
  const admission = admitAgentRequest(req);
  if (!admission.ok) {
    sendJson(res, admission.status, { error: admission.error, code: admission.code });
    return;
  }
  try {
    await body();
  } catch (error) {
    const status = Number(/** @type {any} */ (error)?.statusCode) || 500;
    const code = String(/** @type {any} */ (error)?.code || "agent_error");
    if (status >= 500 && !/** @type {any} */ (error)?.statusCode) throw error;
    if (!res.headersSent) sendJson(res, status, { error: String(/** @type {any} */ (error)?.message || error), code });
  }
}

/** @param {Array<any>} list */
function folderView(list) {
  return list.map((folder) => ({
    id: folder.id,
    name: folder.name,
    path: folder.path,
    level: folder.level,
    grantedAt: folder.grantedAt,
    available: folder.available,
  }));
}

/**
 * POST /api/agent/folders/choose {level}
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentFoldersChoose(req, res) {
  await guarded(req, res, async () => {
    const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 4096 })) || {};
    const level = folders.normalizeLevel(body.level || "propose");
    if (!level) {
      sendJson(res, 400, { error: "Level must be read, propose or change.", code: "bad_level" });
      return;
    }
    const chosen = folders.chooseFolderWithDialog({});
    if (!chosen) {
      sendJson(res, 200, { cancelled: true });
      return;
    }
    const grant = folders.grantFolder(chosen, level);
    sendJson(res, 200, { cancelled: false, folder: folderView([{ ...grant, available: true }])[0] });
  });
}

/**
 * GET /api/agent/folders  ·  DELETE /api/agent/folders {id}
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentFolders(req, res) {
  await guarded(req, res, async () => {
    if (req.method === "DELETE") {
      const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 4096 })) || {};
      const id = String(body.id || "");
      await runs.stopRunsForFolder(id);
      const removed = folders.revokeFolder(id);
      sendJson(res, removed ? 200 : 404, removed ? { ejected: true, id } : { error: "No shared folder has that id.", code: "folder_unknown" });
      return;
    }
    sendJson(res, 200, {
      folders: folderView(folders.listFolders()),
      engine: paths.engineStatus(),
      engines: await runs.engineKeys(),
      chooser: process.platform === "darwin",
    }, { "Cache-Control": "no-store" });
  });
}

/**
 * POST /api/agent/folders/level {id, level} — lower a grant (never raise).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentFolderLevel(req, res) {
  await guarded(req, res, async () => {
    const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 4096 })) || {};
    const grant = folders.setFolderLevel(String(body.id || ""), String(body.level || ""));
    sendJson(res, 200, { folder: folderView(folders.listFolders()).find((folder) => folder.id === grant.id) });
  });
}

/**
 * POST /api/agent/runs {folderId, level?, prompt, engine?, model?}  ·  GET /api/agent/runs
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentRuns(req, res) {
  await guarded(req, res, async () => {
    if (req.method === "GET") {
      sendJson(res, 200, { runs: runs.listRuns() }, { "Cache-Control": "no-store" });
      return;
    }
    const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 128 * 1024 })) || {};
    const run = await runs.createRun({
      folderId: String(body.folderId || ""),
      level: String(body.level || ""),
      prompt: String(body.prompt || ""),
      engine: String(body.engine || "deepseek"),
      model: String(body.model || ""),
      serverPort: Number(process.env.PORT || 4173),
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
 * Prefix routes under /api/agent/runs/:id/…
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentRunAction(req, res) {
  await guarded(req, res, async () => {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    const proposalMatch = /^\/api\/agent\/runs\/([^/]+)\/proposals(?:\/([^/]+)\/(accept|discard))?$/.exec(pathname);
    const method = String(req.method || "GET").toUpperCase();
    if (proposalMatch) {
      const [, runId, proposalId, action] = proposalMatch;
      if (action) {
        if (method !== "POST") {
          sendJson(res, 405, { error: "Use POST.", code: "method_not_allowed" }, { Allow: "POST" });
          return;
        }
        await readJsonBody(req, { limitBytes: 4096 }).catch(() => null);
        sendJson(res, 200, action === "accept" ? runs.acceptProposalRun(runId, proposalId) : runs.discardProposalRun(runId, proposalId));
        return;
      }
      if (method !== "GET") {
        sendJson(res, 405, { error: "Use GET.", code: "method_not_allowed" }, { Allow: "GET" });
        return;
      }
      sendJson(res, 200, runs.listProposalsRun(runId), { "Cache-Control": "no-store" });
      return;
    }
    const match = /^\/api\/agent\/runs\/([^/]+)\/(events|changes|stop|putback|discard)$/.exec(pathname);
    if (!match) {
      sendJson(res, 404, { error: "Not found", code: "agent_route_unknown" });
      return;
    }
    const [, runId, action] = match;
    const expected = action === "events" || action === "changes" ? "GET" : "POST";
    if (method !== expected) {
      sendJson(res, 405, { error: `Use ${expected}.`, code: "method_not_allowed" }, { Allow: expected });
      return;
    }
    if (action === "events") {
      streamEvents(req, res, runId);
      return;
    }
    if (action === "changes") {
      sendJson(res, 200, runs.runChanges(runId), { "Cache-Control": "no-store" });
      return;
    }
    if (action === "stop") {
      sendJson(res, 200, await runs.stopRun(runId));
      return;
    }
    if (action === "discard") {
      sendJson(res, 200, await runs.discardRun(runId));
      return;
    }
    const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 256 * 1024 })) || {};
    sendJson(res, 200, runs.putBackRun(runId, body));
  });
}

module.exports = {
  admitAgentRequest,
  handleAgentFolderLevel,
  handleAgentFolders,
  handleAgentFoldersChoose,
  handleAgentRunAction,
  handleAgentRuns,
};
