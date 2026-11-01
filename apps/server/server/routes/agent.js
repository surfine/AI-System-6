// /api/agent/status, /api/agent/folders*, /api/agent/runs*, /api/agent/tasks* and /api/agent/schedules* — ClioTalk's engine host.
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
const { AGENT_TOKEN_HEADER, tokenMatches } = require("../agent/agent-token.js");
const folders = require("../agent/folders.js");
const runs = require("../agent/runs.js");
const tasks = require("../agent/tasks.js");
const schedules = require("../agent/schedules.js");
const scheduleRunner = require("../agent/schedule-runner.js");
const paths = require("../agent/paths.js");

const SSE_PING_MS = 20_000;
const TERMINAL = new Set(["done", "stopped", "error", "discarded"]);
// A task's mounts may carry lent documents' projection bundles: base64 is 4/3
// of the bytes; JSON framing and the prompt fit in 256 KiB (as agent-cloud).
const TASK_BODY_LIMIT = Math.ceil(tasks.OBJECT_MAX_BYTES * 4 / 3) + 256 * 1024;

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
  // D7 (owner ruling 2026-10-29): a per-boot token, delivered to the desk by
  // the Mac shell (or, weaker, embedded in the served page). A hostile page
  // or another local process that knows only "127.0.0.1:4173" gets nowhere.
  if (!tokenMatches(String(req.headers[AGENT_TOKEN_HEADER] || ""))) {
    return { ok: false, status: 401, code: "agent_token_required", error: "The agent API answers only to this boot's token, which only the desktop holds." };
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
 * GET /api/agent/status — read-only facts for the About This Mac window.
 * The engine's install identity and the sandbox posture the engine host
 * (engine-host.js) actually runs under. Never the token, never an install
 * location: the desk shows the state, and this boot's token stays in the shell.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentStatus(req, res) {
  await guarded(req, res, async () => {
    const engine = paths.engineStatus();
    const claude = paths.claudeEngineStatus();
    sendJson(res, 200, {
      engine: { installed: engine.installed, version: engine.version },
      // Claude Code as an engine: found at the pinned adapter and CLI versions?
      claudeCode: { installed: claude.installed, adapterVersion: claude.adapterVersion, cliVersion: claude.cliVersion },
      codex: (({ installed, adapterVersion, cliVersion }) => ({ installed, adapterVersion, cliVersion }))(paths.codexEngineStatus()),
      platform: process.platform,
      sandbox: { seatbelt: process.platform === "darwin" },
    }, { "Cache-Control": "no-store" });
  });
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
      // Which optional engines are installed here at all: the picker offers
      // Claude Code only then (and greys it while no credential is filed).
      engineAvailable: { "claude-code": paths.claudeEngineStatus().installed, codex: paths.codexEngineStatus().installed },
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
 * POST /api/agent/runs {folderId, level?, prompt, engine?, model?, deskTools?, deskProjectId?, deskProjectName?}  ·  GET /api/agent/runs
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
      // The desk language rides the header the agent fetch helper adds (and,
      // as a fallback, the body): the preamble answers in 简体中文 on a
      // Chinese desk.
      language: String(req.headers["x-ai-system6-language"] || body.language || ""),
      serverPort: Number(process.env.PORT || 4173),
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234",
      // The writer's per-run grant of the read-only desk tools (ruling C4):
      // only an explicit true, and only for the project it names.
      deskTools: body.deskTools === true,
      deskProjectId: String(body.deskProjectId || ""),
      deskProjectName: String(body.deskProjectName || ""),
      // Outside MCP servers for this run, reached only through its gateway.
      connectors: Array.isArray(body.connectors) ? body.connectors : [],
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
    // POST /api/agent/runs/:id/desk/:requestId {ok, result | error} — the
    // page's answer to one desk-tools call of a live run (desk-tools.js).
    const deskMatch = /^\/api\/agent\/runs\/([^/]+)\/desk\/([A-Za-z0-9_-]{1,40})$/.exec(pathname);
    // POST /api/agent/runs/:id/connectors/:askId {allow} — the writer's
    // answer to one connector_ask (connector-gateway.js).
    const connectorMatch = /^\/api\/agent\/runs\/([^/]+)\/connectors\/([0-9a-f-]{36})$/.exec(pathname);
    if (connectorMatch) {
      if (method !== "POST") {
        sendJson(res, 405, { error: "Use POST.", code: "method_not_allowed" }, { Allow: "POST" });
        return;
      }
      const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 1024 })) || {};
      sendJson(res, 200, runs.answerConnectorAsk(connectorMatch[1], connectorMatch[2], body));
      return;
    }
    if (deskMatch) {
      if (method !== "POST") {
        sendJson(res, 405, { error: "Use POST.", code: "method_not_allowed" }, { Allow: "POST" });
        return;
      }
      const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 512 * 1024 })) || {};
      sendJson(res, 200, runs.answerDeskRequest(deskMatch[1], deskMatch[2], body));
      return;
    }
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

/**
 * POST /api/agent/tasks {title?, prompt, mounts[], planGate?, language, engine?, model?}  ·  GET /api/agent/tasks
 * A mount is {kind: "folder", id, level?} or {kind: "object", id, name?, level?, files: [bundle]} (a lent document's projection).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentTasks(req, res) {
  await guarded(req, res, async () => {
    if (req.method === "GET") {
      sendJson(res, 200, tasks.listTasks(), { "Cache-Control": "no-store" });
      return;
    }
    const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: TASK_BODY_LIMIT })) || {};
    const created = await tasks.createTask({
      title: String(body.title || ""),
      prompt: String(body.prompt || ""),
      mounts: Array.isArray(body.mounts) ? body.mounts : [],
      planGate: body.planGate !== false,
      engine: String(body.engine || "deepseek"),
      model: String(body.model || ""),
      language: String(req.headers["x-ai-system6-language"] || body.language || ""),
      serverPort: Number(process.env.PORT || 4173),
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234",
      connectors: Array.isArray(body.connectors) ? body.connectors : [],
      deskContext: typeof body.deskContext === "string" ? body.deskContext : undefined,
    });
    sendJson(res, 202, created);
  });
}

/**
 * Prefix routes under /api/agent/tasks/:id (GET), /:id/{stop,settle,turns,rewind,fork} (POST; fork takes {fromTurn, prompt?}: a new task from the snapshot turn N found; turns takes {prompt, approvePlan?, objects?: [{id, bundle}]}),
 * /:id/queue (POST {text, connectors?, engine?, model?}: a follow-up for after the running turn; at most 5)
 * and /:id/queue/:queueId/remove (POST), and /:id/objects/:objectId/projection-after (GET).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentTaskAction(req, res) {
  await guarded(req, res, async () => {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    const method = String(req.method || "GET").toUpperCase();
    const match = /^\/api\/agent\/tasks\/([^/]+)(?:\/(stop|settle|turns|rewind|fork|queue)|\/queue\/([^/]+)\/remove|\/objects\/([^/]+)\/projection-after)?$/.exec(pathname);
    if (!match) {
      sendJson(res, 404, { error: "Not found", code: "agent_route_unknown" });
      return;
    }
    const [, taskId, action, queueId, objectId] = match;
    const expected = action || queueId ? "POST" : "GET";
    if (method !== expected) {
      sendJson(res, 405, { error: `Use ${expected}.`, code: "method_not_allowed" }, { Allow: expected });
      return;
    }
    if (objectId !== undefined) {
      let id;
      try { id = decodeURIComponent(objectId); } catch { id = ""; }
      sendJson(res, 200, tasks.projectionAfter(taskId, id), { "Cache-Control": "no-store" });
      return;
    }
    if (queueId !== undefined) {
      let removed;
      try { removed = decodeURIComponent(queueId); } catch { removed = ""; }
      sendJson(res, 200, await tasks.removeQueued(taskId, removed));
      return;
    }
    if (action === "queue") {
      const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 256 * 1024 })) || {};
      sendJson(res, 202, await tasks.queueMessage(taskId, {
        text: String(body.text || ""),
        deskContext: typeof body.deskContext === "string" ? body.deskContext : undefined,
        connectors: Array.isArray(body.connectors) ? body.connectors : [],
        engine: body.engine ? String(body.engine) : undefined,
        model: body.model ? String(body.model) : undefined,
        language: String(req.headers["x-ai-system6-language"] || body.language || "") || undefined,
        serverPort: Number(process.env.PORT || 4173),
        lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234",
      }));
      return;
    }
    if (action === "stop") {
      sendJson(res, 200, await tasks.stopTask(taskId));
      return;
    }
    if (action === "settle") {
      sendJson(res, 200, await tasks.settleTask(taskId));
      return;
    }
    if (action === "rewind") {
      const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 16 * 1024 })) || {};
      sendJson(res, 200, tasks.rewindTask(taskId, body.toTurn));
      return;
    }
    if (action === "fork") {
      const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 256 * 1024 })) || {};
      sendJson(res, 202, await tasks.forkTask(taskId, body.fromTurn, {
        prompt: body.prompt ? String(body.prompt) : undefined,
        connectors: Array.isArray(body.connectors) ? body.connectors : [],
        language: String(req.headers["x-ai-system6-language"] || body.language || "") || undefined,
        serverPort: Number(process.env.PORT || 4173),
        lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234",
      }));
      return;
    }
    if (action === "turns") {
      // A turn may carry refreshed lent documents, so it takes the create body's cap.
      const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: TASK_BODY_LIMIT })) || {};
      sendJson(res, 202, await tasks.createTurn(taskId, {
        prompt: String(body.prompt || ""),
        approvePlan: body.approvePlan === true,
        deskContext: typeof body.deskContext === "string" ? body.deskContext : undefined,
        role: typeof body.role === "string" && body.role ? body.role : undefined,
        connectors: Array.isArray(body.connectors) ? body.connectors : [],
        objects: body.objects,
        // Engine, model and language stay the task's own unless the page says otherwise.
        engine: body.engine ? String(body.engine) : undefined,
        model: body.model ? String(body.model) : undefined,
        language: String(req.headers["x-ai-system6-language"] || body.language || "") || undefined,
        serverPort: Number(process.env.PORT || 4173),
        lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234",
      }));
      return;
    }
    sendJson(res, 200, tasks.readTask(taskId), { "Cache-Control": "no-store" });
  });
}

/**
 * /api/agent/schedules (schedules.js, schedule-runner.js): GET list, POST create;
 * /:id GET, POST edit, DELETE; /:id/run POST (the writer's "run it now");
 * /:id/trigger POST {projectId} (the page, after a real manuscript save).
 * A schedule's level is the constant read; the page cannot raise it.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentSchedules(req, res) {
  await guarded(req, res, async () => {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    const method = String(req.method || "GET").toUpperCase();
    const match = /^\/api\/agent\/schedules(?:\/([^/]+)(?:\/(run|trigger))?)?$/.exec(pathname);
    if (!match) {
      sendJson(res, 404, { error: "Not found", code: "agent_route_unknown" });
      return;
    }
    const [, id, action] = match;
    /** @param {string} expected */
    const wrongMethod = (expected) => {
      sendJson(res, 405, { error: `Use ${expected}.`, code: "method_not_allowed" }, { Allow: expected });
    };
    if (!id) {
      if (method === "GET") {
        sendJson(res, 200, { schedules: schedules.listSchedules(), limits: schedules.LIMITS }, { "Cache-Control": "no-store" });
        return;
      }
      if (method !== "POST") return wrongMethod("GET, POST");
      const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 128 * 1024 })) || {};
      const schedule = schedules.createSchedule(body);
      scheduleRunner.syncWatchers();
      sendJson(res, 201, { schedule });
      return;
    }
    if (action === "run") {
      if (method !== "POST") return wrongMethod("POST");
      sendJson(res, 202, { run: await scheduleRunner.runNow(id) });
      return;
    }
    if (action === "trigger") {
      if (method !== "POST") return wrongMethod("POST");
      const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 4 * 1024 })) || {};
      sendJson(res, 202, { run: await scheduleRunner.trigger(id, { projectId: String(body.projectId || "") }) });
      return;
    }
    if (method === "GET") {
      sendJson(res, 200, { schedule: schedules.getSchedule(id) }, { "Cache-Control": "no-store" });
      return;
    }
    if (method === "DELETE") {
      schedules.getSchedule(id);
      schedules.deleteSchedule(id);
      scheduleRunner.syncWatchers();
      sendJson(res, 200, { deleted: true, id });
      return;
    }
    if (method !== "POST") return wrongMethod("GET, POST, DELETE");
    const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 128 * 1024 })) || {};
    const updated = schedules.updateSchedule(id, body);
    scheduleRunner.syncWatchers();
    sendJson(res, 200, { schedule: updated });
  });
}

module.exports = {
  admitAgentRequest,
  handleAgentSchedules,
  handleAgentFolderLevel,
  handleAgentFolders,
  handleAgentFoldersChoose,
  handleAgentRunAction,
  handleAgentRuns,
  handleAgentStatus,
  handleAgentTaskAction,
  handleAgentTasks,
};
