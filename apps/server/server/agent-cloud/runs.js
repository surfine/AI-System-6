// Cloud runs: one upload, one disposable container, one proxy, one event log.
//
// Lifecycle: starting → running → (stopping) → done | stopped | error, then
// discarded (by the page, or by the janitor once the result has waited
// resultTtlMs). The container is removed the moment the engine stops, and a
// run reaches its final state only once `docker rm` has succeeded; until then
// it stays "stopping" and the janitor retries the removal. The workspace waits
// for the page to read its changes, which are computed once (async) and kept. Nothing survives a server restart: the event
// log is in memory, a visitor's own key lives only in the proxy's closure, and
// the janitor removes every leftover container and workspace at boot.
//
// Each run belongs to the verified session that started it. A run id from
// another session reads as unknown. A client address (public-session.js
// clientIp) may hold one working run and start a few shared runs a day,
// however many sessions it mints; it is kept only as a hash.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { isDeepSeekCloudModelId, normalizeCloudModelId } = require("../cloud.js");
const { sharedCloudConfigured } = require("../shared-cloud-budget.js");
const { EVENT_LOG_FULL, createEventBudget, doneEvent, translateUpdate } = require("../agent/acp-events.js");
const { redact, withEnginePreamble } = require("../agent/engine-host.js");
const { collectProposals } = require("../agent/proposals.js");
const { agentCloudCaps, agentCloudRoot } = require("./config.js");
const container = require("./container.js");
const { startRunProxy } = require("./proxy.js");
const { checkAgentRunAllowance, countAgentRun } = require("./allowance.js");
const { createAcpClient } = require("./acp-client.js");
const bundle = require("./bundle.js");

const ACTIVE_STATES = new Set(["starting", "running", "stopping"]);
const MAX_EVENTS = 2000;
const DEFAULT_MODEL = "deepseek-v4-flash";
const ENGINE_ROUTE = "deepseek-official";
const BYOK_KEY_SHAPE = /^[A-Za-z0-9._-]{16,200}$/;

/**
 * @typedef {object} CloudRun
 * @property {string} id
 * @property {string} owner           hash of the visitor's session
 * @property {string} addressTag      hash of the client address (memory only)
 * @property {"shared" | "byok"} allowance
 * @property {string} model
 * @property {string} prompt
 * @property {string} state
 * @property {string} createdAt
 * @property {string | null} endedAt
 * @property {string | null} error
 * @property {string} dir
 * @property {number} uploadBytes
 * @property {number} uploadFiles
 * @property {number} deadlineMs
 * @property {Array<{ seq: number, type: string, at: string, data: any }>} events
 * @property {number} seq
 * @property {Set<(event: any) => void>} listeners
 * @property {{ used: number, size: number } | null} usage
 * @property {{ tokens: number, modelCalls: number, webCalls: number }} spend
 * @property {any} [proxy]
 * @property {any} [child]
 * @property {any} [acp]
 * @property {string} [sessionId]
 * @property {string} stderrTail
 * @property {NodeJS.Timeout[]} timers
 * @property {ReturnType<typeof createEventBudget>} budget
 * @property {{ state: string, error: string | null } | null} pendingFinal  set while the container is being removed
 * @property {Promise<boolean> | null} settling
 * @property {Promise<any> | null} changesResult  computed once per finished run
 * @property {any[]} proposals   harvested from work/.ais6-proposals once the container is gone
 * @property {number} proposalsDropped  how many channel files were past the schema or the limits
 */

/** @type {Map<string, CloudRun>} */
const runs = new Map();

const seams = {
  startContainer: container.startContainer,
  removeContainer: container.removeContainer,
  sweepContainers: container.sweepContainers,
  sandboxReadiness: container.sandboxReadiness,
  startRunProxy,
  now: () => Date.now(),
};

/**
 * @param {string} code
 * @param {string} message
 * @param {number} statusCode
 * @param {Record<string, string>} [headers]
 */
function runError(code, message, statusCode, headers) {
  const error = new Error(message);
  Object.assign(error, { code, statusCode, headers: headers || {} });
  return error;
}

/** In-memory tag for a client address; never written anywhere. @param {string} address */
function addressTagFor(address) {
  return crypto.createHash("sha256").update(`ais6-agent-cloud-active\n${String(address || "unknown")}`).digest("hex").slice(0, 32);
}

/** @param {string} sessionNonce */
function ownerFor(sessionNonce) {
  return crypto.createHash("sha256").update(`ais6-agent-cloud\n${String(sessionNonce || "")}`).digest("hex").slice(0, 32);
}

/** @param {CloudRun} run */
function summary(run) {
  return {
    runId: run.id,
    state: run.state,
    allowance: run.allowance,
    model: run.model,
    createdAt: run.createdAt,
    endedAt: run.endedAt,
    error: run.error,
    uploadFiles: run.uploadFiles,
    uploadBytes: run.uploadBytes,
    deadline: new Date(run.deadlineMs).toISOString(),
    usage: run.usage,
    spend: { ...run.spend },
  };
}

/**
 * @param {CloudRun} run
 * @param {string} type
 * @param {Record<string, unknown>} [data]
 */
function emit(run, type, data = {}) {
  // Engine output is capped per run (acp-events.js createEventBudget).
  const verdict = run.budget ? run.budget.admit(type, data) : "keep";
  if (verdict === "drop") return null;
  if (verdict === "notice") {
    type = "notice";
    data = { ...EVENT_LOG_FULL };
  }
  run.seq += 1;
  const event = { seq: run.seq, type, at: new Date().toISOString(), data };
  run.events.push(event);
  if (run.events.length > MAX_EVENTS) run.events.splice(0, run.events.length - MAX_EVENTS);
  for (const listener of run.listeners) {
    try { listener(event); } catch {}
  }
  return event;
}

// ----- per-session daily run counts (persisted beside the shared budget)

function usageFile() {
  const state = String(process.env.AI_SYSTEM6_STATE_DIR || "/var/lib/ai-system6").trim();
  return path.join(state, "agent-cloud-usage.json");
}

/** @param {number} now */
function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

/** @param {number} now */
function readUsage(now) {
  try {
    const value = JSON.parse(fs.readFileSync(usageFile(), "utf8"));
    if (value && value.day === utcDay(now) && value.counts && typeof value.counts === "object") return value;
  } catch {}
  return { day: utcDay(now), counts: {} };
}

/** @param {any} usage */
function writeUsage(usage) {
  const file = usageFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(usage)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch {}
}

/** @param {string} owner @param {"shared" | "byok"} allowance @param {number} now */
function runsToday(owner, allowance, now) {
  return Number(readUsage(now).counts[`${owner}:${allowance}`] || 0);
}

/** @param {string} nonce @param {"shared" | "byok"} allowance */
function sessionRunsToday(nonce, allowance) {
  return runsToday(ownerFor(nonce), allowance, seams.now());
}

/** @param {string} owner @param {"shared" | "byok"} allowance @param {number} now */
function countRun(owner, allowance, now) {
  const usage = readUsage(now);
  const key = `${owner}:${allowance}`;
  usage.counts[key] = Number(usage.counts[key] || 0) + 1;
  writeUsage(usage);
}

function secondsUntilUtcReset(now) {
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((reset.getTime() - now) / 1000));
}

// ----- lifecycle

function activeRuns() {
  return [...runs.values()].filter((run) => ACTIVE_STATES.has(run.state));
}

/**
 * @typedef {object} CreateCloudRunInput
 * @property {string} sessionNonce
 * @property {string} prompt
 * @property {string} [model]
 * @property {string} [key]          the visitor's own DeepSeek key (BYOK)
 * @property {any} files             the upload bundle
 * @property {string} [address]      the client address, as public-session.js clientIp() derives it
 */

/** @param {CreateCloudRunInput} input */
async function createRun(input) {
  const now = seams.now();
  const caps = agentCloudCaps();
  if (!input.sessionNonce) throw runError("agent_cloud_session_required", "A verified session is required.", 401);
  const owner = ownerFor(input.sessionNonce);
  const address = String(input.address || "unknown");
  const addressTag = addressTagFor(address);

  const readiness = await seams.sandboxReadiness();
  if (!readiness.ready) {
    throw runError("agent_cloud_sandbox_unavailable", `The cloud sandbox is not ready (${readiness.reason}).`, 503, { "Retry-After": "300" });
  }

  const key = String(input.key || "").trim();
  /** @type {"shared" | "byok"} */
  const allowance = key ? "byok" : "shared";
  if (allowance === "byok" && !BYOK_KEY_SHAPE.test(key)) {
    throw runError("agent_cloud_byok_key_invalid", "That does not look like a DeepSeek API key.", 400);
  }
  if (allowance === "shared" && !sharedCloudConfigured()) {
    throw runError("agent_cloud_shared_unavailable", "This site has no shared allowance; use your own API key.", 503);
  }
  const limits = caps[allowance];

  const prompt = String(input.prompt || "");
  if (!prompt.trim()) throw runError("prompt_required", "Say what the run should do.", 400);
  if (prompt.length > caps.maxPromptChars) throw runError("prompt_too_long", `A prompt is at most ${caps.maxPromptChars} characters.`, 413);
  const model = normalizeCloudModelId(input.model || DEFAULT_MODEL);
  if (!isDeepSeekCloudModelId(model)) throw runError("unsupported_model", "The cloud sandbox runs DeepSeek models only.", 400);

  const active = activeRuns();
  if (active.some((run) => run.owner === owner)) {
    throw runError("agent_cloud_session_active", "This session already has a run working.", 409);
  }
  if (active.length >= caps.maxConcurrentRuns) {
    throw runError("agent_cloud_busy", "The cloud sandbox is busy with another run. Try again shortly.", 429, { "Retry-After": "30" });
  }
  if (active.filter((run) => run.addressTag === addressTag).length >= caps.activeRunsPerAddress) {
    throw runError("agent_cloud_address_active", "A run from this address is already working; wait for it to finish.", 429, { "Retry-After": "60" });
  }
  if (runsToday(owner, allowance, now) >= limits.runsPerSessionPerDay) {
    throw runError(
      allowance === "shared" ? "agent_cloud_session_runs" : "agent_cloud_daily_runs_byok",
      `This session has used its ${limits.runsPerSessionPerDay} cloud runs for today.`,
      429,
      { "Retry-After": String(secondsUntilUtcReset(now)) },
    );
  }

  if (allowance === "shared") {
    // The site-wide daily ceilings on the operator's key; refused before any
    // workspace or container exists.
    const room = checkAgentRunAllowance({ now: new Date(now), address });
    if (!room.ok) {
      throw runError(room.code, room.detail, room.status, { "Retry-After": String(room.retryAfter) });
    }
  }

  const files = bundle.parseBundle(input.files, limits);
  const uploadBytes = files.reduce((sum, file) => sum + file.bytes.length, 0);

  const id = `run-${crypto.randomUUID()}`;
  const root = agentCloudRoot();
  // A unix socket path is at most 104 bytes on macOS and 108 on Linux.
  if (Buffer.byteLength(path.join(root, id, "io", "proxy.sock")) > 100) {
    throw runError("agent_cloud_root_path_too_long", "AI_SYSTEM6_AGENT_CLOUD_ROOT is too long for the proxy socket.", 503);
  }
  fs.mkdirSync(root, { recursive: true, mode: 0o711 });
  const dir = path.join(root, id);
  const ioDir = path.join(dir, "io");
  try {
    fs.mkdirSync(dir, { mode: 0o711 });
    fs.chmodSync(dir, 0o711);
    bundle.writeWorkspace(dir, files);
    fs.mkdirSync(ioDir, { mode: 0o755 });
    fs.chmodSync(ioDir, 0o755);
  } catch (error) {
    // Nothing of a run that never started stays on disk.
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    throw runError("agent_cloud_workspace_failed", "The workspace for this run could not be written.", 500);
  }

  /** @type {CloudRun} */
  const run = {
    id,
    owner,
    addressTag,
    allowance,
    model,
    prompt,
    state: "starting",
    createdAt: new Date(now).toISOString(),
    endedAt: null,
    error: null,
    dir,
    uploadBytes,
    uploadFiles: files.length,
    deadlineMs: now + limits.wallMs,
    events: [],
    seq: 0,
    listeners: new Set(),
    usage: null,
    spend: { tokens: 0, modelCalls: 0, webCalls: 0 },
    stderrTail: "",
    timers: [],
    budget: createEventBudget(),
    pendingFinal: null,
    settling: null,
    changesResult: null,
    proposals: [],
    proposalsDropped: 0,
  };
  runs.set(id, run);
  countRun(owner, allowance, now);
  if (allowance === "shared") countAgentRun({ now: new Date(now), address });
  emit(run, "status", { state: "starting", allowance, model, files: files.length, bytes: uploadBytes });

  const token = crypto.randomBytes(32).toString("hex");
  try {
    run.proxy = await seams.startRunProxy({
      socketPath: path.join(ioDir, "proxy.sock"),
      token,
      allowance,
      sessionNonce: input.sessionNonce,
      byokKey: allowance === "byok" ? key : "",
      caps: {
        maxModelCalls: limits.maxModelCalls,
        maxWebCalls: limits.maxWebCalls,
        maxRunTokens: limits.maxRunTokens,
        maxCallOutputTokens: limits.maxCallOutputTokens,
      },
      onEvent: (event) => onProxyEvent(run, event),
    });
  } catch (error) {
    await fail(run, "agent_cloud_proxy_failed", "The sandbox proxy could not start.");
    throw runError("agent_cloud_proxy_failed", "The sandbox proxy could not start.", 503);
  }
  void drive(run, token, caps);
  return summary(run);
}

/**
 * @param {CloudRun} run
 * @param {{ type: string, [key: string]: unknown }} event
 */
function onProxyEvent(run, event) {
  if (event.type === "usage") {
    run.spend = { tokens: Number(event.tokens) || 0, modelCalls: Number(event.modelCalls) || 0, webCalls: Number(event.webCalls) || 0 };
    emit(run, "spend", { ...run.spend });
    return;
  }
  if (event.type === "cap" && ACTIVE_STATES.has(run.state)) {
    const code = String(event.code || "agent_cloud_cap");
    const messages = {
      agent_cloud_model_call_cap: "The run reached its model call limit and was stopped.",
      agent_cloud_web_call_cap: "The run reached its web limit; it continues without the web.",
      agent_cloud_token_cap: "The run used its token allowance and was stopped.",
      agent_cloud_daily_tokens: "The site's agent allowance for today is used up; the run was stopped.",
      agent_cloud_input_too_large: "The run's context grew past what one agent call accepts and it was stopped.",
    };
    // The web cap only refuses further web calls; every other cap ends the run
    // (dsh would otherwise retry the refused call).
    if (code === "agent_cloud_web_call_cap") {
      emit(run, "notice", { code, message: messages[code] });
      return;
    }
    emit(run, "error", { code, message: /** @type {Record<string, string>} */ (messages)[code] || "The shared allowance refused the next model call." });
    void stopRun(run.id, "error", code);
  }
}

/**
 * @param {CloudRun} run
 * @param {string} token
 * @param {ReturnType<typeof agentCloudCaps>} caps
 */
async function drive(run, token, caps) {
  const work = path.join(run.dir, "work");
  const wallMs = Math.max(1000, run.deadlineMs - seams.now());
  run.timers.push(setTimeout(() => {
    if (!ACTIVE_STATES.has(run.state)) return;
    emit(run, "error", { code: "run_timeout", message: `The run passed ${Math.round(wallMs / 60_000)} minutes and was stopped.` });
    void stopRun(run.id, "error", "run_timeout");
  }, wallMs));
  // The bind mount cannot be size-capped per run, so a watchdog does it; the
  // tmpfs under agentCloudRoot() caps all runs together (docs: Cloud sandbox).
  // It also caps the number of files: changes are read and diffed per file.
  const maxFiles = caps.maxWorkspaceFiles;
  let measuring = false;
  run.timers.push(setInterval(async () => {
    if (!ACTIVE_STATES.has(run.state) || run.pendingFinal || measuring) return;
    measuring = true;
    try {
      const usage = await bundle.workspaceUsage(work, { stopAt: maxFiles });
      if (!ACTIVE_STATES.has(run.state) || run.pendingFinal) return;
      if (usage.files > maxFiles || usage.dirs > maxFiles) {
        emit(run, "error", { code: "agent_cloud_workspace_too_many_files", message: `The run made more than ${maxFiles} files and was stopped.` });
        void stopRun(run.id, "error", "agent_cloud_workspace_too_many_files");
      } else if (usage.bytes > run.uploadBytes + caps.maxWorkspaceGrowthBytes) {
        emit(run, "error", { code: "agent_cloud_workspace_too_large", message: "The run wrote more than its workspace allows and was stopped." });
        void stopRun(run.id, "error", "agent_cloud_workspace_too_large");
      }
    } catch {} finally {
      measuring = false;
    }
  }, caps.watchdogMs));
  run.timers.forEach((timer) => timer.unref?.());

  // The `changes` count after a tool finishes: async, one at a time, and at
  // most one more queued however many tools finish meanwhile.
  let lastChangeCount = 0;
  let counting = false;
  let countAgain = false;
  const emitChangesIfMoved = async () => {
    if (counting) {
      countAgain = true;
      return;
    }
    counting = true;
    try {
      do {
        countAgain = false;
        try {
          const counts = await bundle.changeCounts(run.dir, { maxFiles });
          if (ACTIVE_STATES.has(run.state) && counts.count !== lastChangeCount) {
            lastChangeCount = counts.count;
            emit(run, "changes", counts);
          }
        } catch {}
      } while (countAgain && ACTIVE_STATES.has(run.state));
    } finally {
      counting = false;
    }
  };

  try {
    const child = seams.startContainer({ runId: run.id, workDir: work, socketDir: path.join(run.dir, "io"), deadlineMs: run.deadlineMs + 60_000, token });
    run.child = child;
    // A CLI that failed to start, or a container that died, must not take
    // the server down with an EPIPE on its pipes.
    child.stdin?.on("error", () => {});
    child.stdout?.on("error", () => {});
    child.stderr?.on("data", (chunk) => {
      run.stderrTail = (run.stderrTail + redact(chunk.toString())).slice(-8192);
    });
    const exited = new Promise((resolve) => {
      child.on("exit", (code) => resolve(code));
      child.on("error", () => resolve(-1));
    });
    const acp = createAcpClient({
      input: child.stdout,
      output: child.stdin,
      onUpdate: (update) => {
        for (const event of translateUpdate(update, { work: "/work" })) {
          const { type, ...data } = event;
          if (type === "usage") run.usage = { used: Number(data.used) || 0, size: Number(data.size) || 0 };
          emit(run, type, data);
          if (type === "tool_update" && data.status === "completed") void emitChangesIfMoved();
        }
      },
      onPermission: (params) => emit(run, "permission_rejected", { toolCallId: String(params?.toolCall?.toolCallId || "") }),
    });
    run.acp = acp;
    exited.then(() => acp.close("The sandbox exited."));

    await acp.initialize();
    const session = await acp.newSession("/work");
    run.sessionId = String(session?.sessionId || "");
    const option = (session?.configOptions || []).find((/** @type {any} */ o) => o.id === "model" || o.category === "model");
    // dsh's catalog may name Flash by its V4 id; the proxy sends the id
    // DeepSeek publishes either way (normalizeCloudModelId).
    const values = (option?.options || []).flatMap((/** @type {any} */ group) => group.options || [group]).map((/** @type {any} */ o) => o.value);
    const wanted = [run.model, run.model === "deepseek-flash" ? "deepseek-v4-flash" : ""]
      .filter(Boolean)
      .map((id) => JSON.stringify([ENGINE_ROUTE, id]))
      .find((value) => values.includes(value));
    if (option && wanted && option.currentValue !== wanted) {
      await acp.setConfigOption(run.sessionId, option.id, wanted);
    }
    if (run.state !== "starting") return;
    run.state = "running";
    emit(run, "status", { state: "running", sessionId: run.sessionId });
    const result = await acp.prompt(run.sessionId, withEnginePreamble(run.prompt));
    if (ACTIVE_STATES.has(run.state) && !run.pendingFinal) {
      try { emit(run, "changes", await bundle.changeCounts(run.dir, { maxFiles })); } catch {}
      const { type: _done, ...done } = doneEvent(result, run.usage);
      if (run.proxy?.state) {
        const live = run.proxy.state;
        run.spend = { tokens: live.tokens, modelCalls: live.modelCalls, webCalls: live.webCalls };
      }
      emit(run, "done", { ...done, spend: { ...run.spend } });
      await settle(run, run.state === "stopping" ? "stopped" : "done");
    }
  } catch (error) {
    if (run.pendingFinal) {
      // Already settling (stop, cap, timeout): the engine's exit is not news.
    } else if (run.state === "stopping") {
      await settle(run, "stopped");
    } else if (ACTIVE_STATES.has(run.state)) {
      const detail = run.stderrTail.trim().split("\n").slice(-4).join("\n");
      const message = redact(`${String(/** @type {any} */ (error)?.message || error)}${detail ? `\n${detail}` : ""}`).slice(0, 2000);
      emit(run, "error", { code: String(/** @type {any} */ (error)?.code || "engine_failed"), message });
      await settle(run, "error", message);
    }
  }
}

/**
 * End the engine side of a run: proxy closed (no more model or web calls),
 * timers cleared, container removed. The workspace stays for the page until
 * discard or the janitor. Resolves true once the container is gone.
 * @param {CloudRun} run
 */
async function teardown(run) {
  run.timers.forEach((timer) => clearTimeout(timer));
  run.timers = [];
  try { run.acp?.close("The run ended."); } catch {}
  try { run.child?.stdin?.end(); } catch {}
  try { run.child?.kill?.("SIGTERM"); } catch {}
  try { await run.proxy?.close(); } catch {}
  run.proxy = null;
  let gone = false;
  try { gone = (await seams.removeContainer(run.id)) !== false; } catch {}
  return gone;
}

/**
 * Apply a run's final state once its container is gone; otherwise it stays
 * "stopping" with the final state pending, and the janitor calls this again.
 * @param {CloudRun} run
 */
async function completeSettle(run) {
  const gone = await teardown(run);
  if (!gone || !run.pendingFinal) return false;
  // The workspace is final now: harvest the engine's proposal channel (same
  // directory, same schema as the Mac host; the preamble told the engine
  // about it). The records live in memory with the run — the page decides,
  // one by one, and the workspace's removal (discard or janitor) burns the rest.
  try {
    const { gathered, dropped } = collectProposals(path.join(run.dir, "work"));
    run.proposals = gathered;
    run.proposalsDropped = dropped;
    for (const record of gathered) {
      emit(run, "proposal", { id: record.id, kind: record.kind, title: String(record.title || "").slice(0, 120) });
    }
    if (dropped) emit(run, "proposal", { dropped });
  } catch {}
  const { state, error } = run.pendingFinal;
  run.pendingFinal = null;
  run.state = state;
  run.endedAt = new Date(seams.now()).toISOString();
  if (error) run.error = error;
  emit(run, "status", { state });
  return true;
}

/**
 * @param {CloudRun} run
 * @param {string} state
 * @param {string} [error]
 * @returns {Promise<boolean>} whether the run reached its final state
 */
async function settle(run, state, error) {
  if (!ACTIVE_STATES.has(run.state)) return true;
  if (!run.pendingFinal) {
    run.pendingFinal = { state, error: error || null };
    run.state = "stopping";
  }
  if (!run.settling) {
    run.settling = completeSettle(run).finally(() => { run.settling = null; });
  }
  return run.settling;
}

/** @param {CloudRun} run @param {string} code @param {string} message */
function fail(run, code, message) {
  emit(run, "error", { code, message });
  return settle(run, "error", message);
}

/**
 * @param {string} sessionNonce
 * @param {string} id
 * @returns {CloudRun}
 */
function getRun(sessionNonce, id) {
  const run = runs.get(String(id || ""));
  if (!run || run.owner !== ownerFor(sessionNonce)) throw runError("run_unknown", "No run has that id.", 404);
  return run;
}

/**
 * @param {string} id
 * @param {string} [finalState]
 * @param {string} [code]
 */
async function stopRun(id, finalState = "stopped", code = "") {
  const run = runs.get(id);
  if (!run || !ACTIVE_STATES.has(run.state)) return run ? summary(run) : null;
  if (!run.pendingFinal) {
    if (run.state !== "stopping") emit(run, "status", { state: "stopping" });
    try { if (run.sessionId) run.acp?.cancel(run.sessionId); } catch {}
  }
  // The final state lands once the container is gone (settle).
  await settle(run, finalState, code || undefined);
  return summary(run);
}

/** @param {string} sessionNonce @param {string} id */
async function stopOwnedRun(sessionNonce, id) {
  const run = getRun(sessionNonce, id);
  return (await stopRun(run.id)) || summary(run);
}

/**
 * A finished run's changes. The engine and its container are gone, so the
 * workspace no longer moves: the result is computed once (async reads and
 * diffs) and every later request gets the same answer.
 * @param {string} sessionNonce
 * @param {string} id
 */
async function runChanges(sessionNonce, id) {
  const run = getRun(sessionNonce, id);
  if (ACTIVE_STATES.has(run.state)) throw runError("run_active", "The engine is still working.", 409);
  if (run.state === "discarded") throw runError("run_discarded", "This run was discarded.", 410);
  if (!run.changesResult) {
    run.changesResult = bundle.cloudChanges(run.dir, { maxFiles: agentCloudCaps().maxWorkspaceFiles });
    // A failure is the answer too (e.g. a workspace past the file cap); kept,
    // not recomputed. The rejection is observed here so it is never unhandled.
    run.changesResult.catch(() => {});
  }
  const { changes, links } = await run.changesResult;
  return {
    runId: run.id,
    state: run.state,
    changes,
    links,
    // The harvested proposals, payload included, with the same shape the Mac
    // host serves: adoption happens in the page, one proposal at a time.
    proposals: run.proposals.map((record) => ({ ...record, status: "pending" })),
    proposalsDropped: run.proposalsDropped,
  };
}

/** @param {CloudRun} run */
async function removeRun(run) {
  if (ACTIVE_STATES.has(run.state)) await stopRun(run.id);
  if (ACTIVE_STATES.has(run.state)) {
    // The container could not be removed yet; the janitor keeps trying.
    throw runError("run_stopping", "The run's sandbox is still being removed; try again in a minute.", 409, { "Retry-After": "60" });
  }
  let removed = false;
  try {
    fs.rmSync(run.dir, { recursive: true, force: true });
    removed = true;
  } catch {}
  run.state = "discarded";
  emit(run, "status", { state: "discarded" });
  run.listeners.clear();
  runs.delete(run.id);
  return removed;
}

/** @param {string} sessionNonce @param {string} id */
async function discardRun(sessionNonce, id) {
  const run = getRun(sessionNonce, id);
  const removed = await removeRun(run);
  return { runId: run.id, discarded: true, removed };
}

/**
 * @param {string} sessionNonce
 * @param {string} id
 * @param {number} afterSeq
 * @param {(event: any) => void} listener
 */
function subscribe(sessionNonce, id, afterSeq, listener) {
  const run = getRun(sessionNonce, id);
  for (const event of run.events) if (event.seq > afterSeq) listener(event);
  run.listeners.add(listener);
  return {
    active: ACTIVE_STATES.has(run.state),
    state: run.state,
    unsubscribe: () => run.listeners.delete(listener),
  };
}

/** @param {string} sessionNonce */
function listRuns(sessionNonce) {
  const owner = ownerFor(sessionNonce);
  return [...runs.values()].filter((run) => run.owner === owner).map(summary);
}

// ----- janitor

let janitorTimer = /** @type {NodeJS.Timeout | null} */ (null);

/**
 * Remove leftover containers and workspaces. At boot (`boot: true`) every
 * workspace on disk is a leftover: nothing about a run survives a restart.
 * @param {{ boot?: boolean }} [options]
 */
async function sweep(options = {}) {
  const now = seams.now();
  const caps = agentCloudCaps();
  const removed = { containers: /** @type {string[]} */ ([]), workspaces: /** @type {string[]} */ ([]) };
  for (const run of [...runs.values()]) {
    if (run.pendingFinal && !run.settling) {
      // A removal that failed before: try again.
      await settle(run, run.pendingFinal.state, run.pendingFinal.error || undefined);
    } else if (ACTIVE_STATES.has(run.state) && !run.pendingFinal && now > run.deadlineMs + 60_000) {
      emit(run, "error", { code: "run_timeout", message: "The run passed its time limit and was stopped." });
      await stopRun(run.id, "error", "run_timeout");
    }
    if (!ACTIVE_STATES.has(run.state) && run.endedAt && now - Date.parse(run.endedAt) > caps.resultTtlMs) {
      try {
        await removeRun(run);
        removed.workspaces.push(run.id);
      } catch {}
    }
  }
  try {
    removed.containers = await seams.sweepContainers(new Set(activeRuns().map((run) => run.id)), now);
  } catch {}
  const root = agentCloudRoot();
  let entries = [];
  try { entries = fs.readdirSync(root); } catch {}
  for (const name of entries) {
    if (!/^run-[a-f0-9-]{36}$/.test(name)) continue;
    if (!options.boot && runs.has(name)) continue;
    try {
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
      removed.workspaces.push(name);
    } catch {}
  }
  return removed;
}

function startJanitor() {
  if (janitorTimer) return;
  void sweep({ boot: true });
  janitorTimer = setInterval(() => { void sweep(); }, agentCloudCaps().janitorIntervalMs);
  janitorTimer.unref?.();
}

function stopJanitor() {
  if (janitorTimer) clearInterval(janitorTimer);
  janitorTimer = null;
}

/** Test seam. */
function configureCloudRunsForTests(overrides = {}) {
  Object.assign(seams, overrides);
}

async function resetCloudRunsForTests() {
  for (const run of [...runs.values()]) {
    run.timers.forEach((timer) => clearTimeout(timer));
    try { await run.proxy?.close(); } catch {}
  }
  runs.clear();
  stopJanitor();
  seams.startContainer = container.startContainer;
  seams.removeContainer = container.removeContainer;
  seams.sweepContainers = container.sweepContainers;
  seams.sandboxReadiness = container.sandboxReadiness;
  seams.startRunProxy = startRunProxy;
  seams.now = () => Date.now();
}

module.exports = {
  ACTIVE_STATES,
  configureCloudRunsForTests,
  createRun,
  sessionRunsToday,
  discardRun,
  getRun,
  listRuns,
  ownerFor,
  resetCloudRunsForTests,
  runChanges,
  startJanitor,
  stopJanitor,
  stopOwnedRun,
  stopRun,
  subscribe,
  sweep,
};
