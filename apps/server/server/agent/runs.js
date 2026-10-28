// Agent runs: one prompt, one shadow, one engine child, one event log.
//
// A run's lifecycle is starting → running → done | stopped | error. Its shadow
// outlives the engine: the writer reviews the changes and puts back (or
// discards) after the engine has exited. A run settles only after the child
// is gone (engine-host kill() waits for its exit), so nothing can still be
// writing the shadow when a put-back reads it.
//
// The engine gets no MCP server. The desk's /mcp guest bridge would hand it
// desk-wide read tools (every Project Hard Disk item, not just the shared
// folder), and with web tools on (ruling 2026-10-24) whatever it reads can
// leave the Mac. Its only output is the shadow and the writer's put-back. Run metadata is written to
// runs/<run>/run.json so changes, put-back and discard still work after a
// server restart; the live event log is in memory only.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const paths = require("./paths.js");
const folders = require("./folders.js");
const shadowFs = require("./shadow.js");
const engineHost = require("./engine-host.js");
const proposals = require("./proposals.js");
const { EVENT_LOG_FULL, createEventBudget, doneEvent, translateUpdate } = require("./acp-events.js");
const { removeSessionsFor } = require("./dsh-sessions.js");
const { runDshHome, seedDshHome } = require("./dsh-home.js");

const MAX_ACTIVE_RUNS = 2;
const MAX_EVENTS = 4000;
const RUN_TIMEOUT_MS = Math.max(60_000, Number(process.env.AI_SYSTEM6_AGENT_RUN_TIMEOUT_MS || 30 * 60_000));
const EVENT_LOG = "events.jsonl";
const ACTIVE_STATES = new Set(["starting", "running", "stopping"]);

/**
 * @typedef {object} Run
 * @property {string} id
 * @property {string} folderId
 * @property {string} folderName
 * @property {string} level
 * @property {string} engine
 * @property {string} model
 * @property {string} prompt
 * @property {string} state
 * @property {string} createdAt
 * @property {string} [endedAt]
 * @property {string} [error]
 * @property {string} [sessionId]
 * @property {string} [sessionCwd]
 * @property {import("./shadow.js").Shadow} shadow
 * @property {Array<{ seq: number, type: string, at: string, data: any }>} events
 * @property {number} seq
 * @property {Set<(event: any) => void>} listeners
 * @property {any} [engineHandle]
 * @property {boolean} [engineExited] false while a stopped child has not exited
 * @property {boolean} [proposalsGathered] true once the channel was harvested
 * @property {ReturnType<typeof createEventBudget>} [budget]  live runs only
 * @property {{ used: number, size: number } | null} usage
 * @property {boolean} [fromDisk]
 */

/** @type {Map<string, Run>} */
const runs = new Map();

const seams = {
  startEngine: engineHost.startEngine,
  /** @param {string} engine @returns {Promise<string>} */
  resolveKey: defaultResolveKey,
  forceCopy: false,
  /** @type {((file: string) => void) | undefined} */
  trash: undefined,
};

/** @param {string} engine */
async function defaultResolveKey(engine) {
  const spec = engineHost.ENGINES[engine];
  if (!spec?.vault) return "";
  const vault = require("../credential-vault.js");
  const credentialId = vault.createCredentialId(spec.vault.provider, spec.vault.baseUrl);
  return String(await vault.resolveCloudCredential({
    credentialId,
    provider: spec.vault.provider,
    targetBaseUrl: spec.vault.baseUrl,
  }) || "");
}

/**
 * @param {string} code
 * @param {string} message
 * @param {number} statusCode
 */
function runError(code, message, statusCode) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/** @param {string} id */
function validRunId(id) {
  return /^run-[0-9a-f-]{36}$/.test(String(id || ""));
}

/** @param {Run} run */
function summary(run) {
  return {
    runId: run.id,
    folderId: run.folderId,
    folderName: run.folderName,
    level: run.level,
    engine: run.engine,
    model: run.model,
    state: run.state,
    createdAt: run.createdAt,
    endedAt: run.endedAt || null,
    error: run.error || null,
    shadowMethod: run.shadow.method,
    usage: run.usage,
  };
}

/** @param {Run} run */
function persist(run) {
  const file = path.join(run.shadow.stateDir, "run.json");
  fs.writeFileSync(file, `${JSON.stringify({ ...summary(run), prompt: run.prompt, sessionId: run.sessionId || "", sessionCwd: run.sessionCwd || "" }, null, 2)}\n`);
}

/**
 * @param {Run} run
 * @param {string} type
 * @param {Record<string, unknown>} data
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
  // The log outlives the process: after a restart ClioTalk can still show a
  // finished run's plan, work log and pending changes.
  try { fs.appendFileSync(path.join(run.shadow.stateDir, EVENT_LOG), `${JSON.stringify(event)}\n`); } catch {}
  if (run.events.length > MAX_EVENTS) run.events.splice(0, run.events.length - MAX_EVENTS);
  for (const listener of run.listeners) {
    try { listener(event); } catch {}
  }
  return event;
}

/** @param {Run} run */
function emitChanges(run) {
  try {
    const { changes } = shadowFs.listChanges(run.shadow);
    const count = (kind) => changes.filter((change) => change.kind === kind).length;
    emit(run, "changes", { count: changes.length, added: count("added"), modified: count("modified"), deleted: count("deleted") });
  } catch {}
}

/**
 * Harvest the engine's proposal channel and say what arrived. Runs when the
 * run settles (finish) — the engine is gone, so the channel is final — and
 * once more, quietly, when a run restarted mid-flight is first asked for its
 * proposals. Nothing but small host events leaves here: the payloads wait in
 * runs/<run>/proposals/ for the writer.
 * @param {Run} run
 * @param {{ quiet?: boolean }} [options]
 */
function gatherProposals(run, options = {}) {
  if (run.proposalsGathered) return;
  run.proposalsGathered = true;
  let outcome = { gathered: [], dropped: 0 };
  try {
    outcome = proposals.harvestProposals({ work: run.shadow.work, stateDir: run.shadow.stateDir });
  } catch {}
  if (options.quiet) return;
  for (const record of outcome.gathered) {
    emit(run, "proposal", { id: record.id, kind: record.kind, title: String(record.title || "").slice(0, 120) });
  }
  if (outcome.dropped) emit(run, "proposal", { dropped: outcome.dropped });
}

/** @param {Run} run @param {string} state @param {string} [error] */
function finish(run, state, error) {
  if (!ACTIVE_STATES.has(run.state)) return;
  gatherProposals(run);
  run.state = state;
  run.endedAt = new Date().toISOString();
  if (error) run.error = error;
  persist(run);
}

function activeRuns() {
  return [...runs.values()].filter((run) => ACTIVE_STATES.has(run.state));
}

/**
 * @typedef {object} CreateRunInput
 * @property {string} folderId
 * @property {string} [level]
 * @property {string} prompt
 * @property {string} [engine]
 * @property {string} [model]
 * @property {number} [serverPort]  unused: the engine is given no /mcp server
 * @property {string} [lmStudioBaseUrl]
 */

/** @param {CreateRunInput} input */
async function createRun(input) {
  if (process.platform !== "darwin" && seams.startEngine === engineHost.startEngine) {
    throw runError("agent_unavailable", "The ClioTalk engine runs on macOS only.", 501);
  }
  const prompt = String(input.prompt || "").trim();
  if (!prompt) throw runError("prompt_required", "A run needs a prompt.", 400);
  if (prompt.length > 20_000) throw runError("prompt_too_long", "Prompts are limited to 20,000 characters.", 413);
  const engine = String(input.engine || "deepseek");
  const spec = engineHost.ENGINES[engine];
  if (!spec) throw runError("engine_unknown", `Unknown engine ${engine}.`, 400);
  const model = String(input.model || spec.defaultModel || "");
  if (engine === "lmstudio" && !model) throw runError("model_required", "LM Studio needs a model identifier.", 400);
  // An unknown folder is the caller's mistake whatever the engine's state.
  const grant = folders.resolveFolder(input.folderId);
  if (seams.startEngine === engineHost.startEngine && !paths.engineStatus().installed) {
    throw runError("engine_missing", "The ClioTalk engine is not installed (run node tooling/build-dsh-slim.mjs).", 503);
  }
  const level = folders.capLevel(String(input.level || grant.level), grant.level);
  if (activeRuns().length >= MAX_ACTIVE_RUNS) throw runError("too_many_runs", "Two runs are already working; stop one first.", 429);
  if (activeRuns().some((run) => run.folderId === grant.id)) {
    throw runError("folder_busy", "A run is already working in this folder.", 409);
  }
  const key = await seams.resolveKey(engine);
  if (spec.vault && !key) {
    throw runError("engine_key_missing", `No ${spec.vault.provider} key is in the Keychain; add one in Control Panel.`, 409);
  }
  // Web search is DeepSeek's: another engine gets the DeepSeek key for it
  // only when the writer has one.
  const extraKeys = {};
  if (engine !== "deepseek") {
    const deepseekKey = await seams.resolveKey("deepseek").catch(() => "");
    if (deepseekKey) extraKeys.DEEPSEEK_API_KEY = deepseekKey;
  }

  const id = `run-${crypto.randomUUID()}`;
  const stateDir = path.join(paths.runsRoot(), id);
  const shadowRoot = path.join(paths.shadowsRoot(), id);
  paths.assertNotTemporary(stateDir);
  paths.assertNotTemporary(shadowRoot);
  const shadow = shadowFs.createShadow({ source: grant.path, shadowRoot, stateDir, forceCopy: seams.forceCopy });
  // The run's own DSH_HOME, beside its clones: nothing in it outlives the run.
  const dshHome = seedDshHome(runDshHome(shadowRoot));
  /** @type {Run} */
  const run = {
    id,
    folderId: grant.id,
    folderName: grant.name,
    level,
    engine,
    model,
    prompt,
    state: "starting",
    createdAt: new Date().toISOString(),
    shadow,
    events: [],
    seq: 0,
    listeners: new Set(),
    usage: null,
    budget: createEventBudget(),
  };
  runs.set(id, run);
  persist(run);
  emit(run, "status", { state: "starting", level, engine, model, folderName: grant.name, shadowMethod: shadow.method });
  void drive(run, { key, extraKeys, dshHome, lmStudioBaseUrl: input.lmStudioBaseUrl });
  return summary(run);
}

/**
 * @param {Run} run
 * @param {{ key: string, extraKeys: Record<string, string>, dshHome: string, lmStudioBaseUrl?: string }} options
 */
async function drive(run, options) {
  const logFile = path.join(run.shadow.stateDir, "engine.log");
  const log = (/** @type {string} */ line) => {
    try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${engineHost.redact(line)}\n`); } catch {}
  };
  const lmPort = (() => {
    try { return Number(new URL(options.lmStudioBaseUrl || "http://127.0.0.1:1234").port) || 1234; } catch { return 1234; }
  })();
  const realWork = fs.realpathSync(run.shadow.work);
  const timer = setTimeout(() => {
    emit(run, "error", { code: "run_timeout", message: `The run passed ${Math.round(RUN_TIMEOUT_MS / 60_000)} minutes and was stopped.` });
    void stopRun(run.id, "error");
  }, RUN_TIMEOUT_MS);
  timer.unref?.();
  let lastEditCount = 0;
  try {
    const handle = await seams.startEngine({
      engine: run.engine,
      model: run.model,
      work: run.shadow.work,
      tmp: run.shadow.tmp,
      dshHome: options.dshHome,
      readOnly: run.level === "read",
      stateDir: run.shadow.stateDir,
      key: options.key,
      extraKeys: options.extraKeys,
      lmStudioBaseUrl: options.lmStudioBaseUrl,
      // This Mac stays closed to the engine but for LM Studio on its runs.
      loopbackPorts: run.engine === "lmstudio" ? [lmPort] : [],
      mcpServers: [],
      onUpdate: (update) => {
        const context = { work: realWork };
        for (const event of translateUpdate(update, context)) {
          if (event.type === "usage") run.usage = { used: Number(event.used), size: Number(event.size) };
          const { type, ...data } = event;
          emit(run, type, data);
          // A finished tool may have written the shadow: refresh the count.
          if (type === "tool_update" && data.status === "completed") emitChangesIfMoved();
        }
      },
      onPermission: (params) => emit(run, "permission_rejected", { toolCallId: String(params?.toolCall?.toolCallId || "") }),
      log,
    });
    run.engineHandle = handle;
    run.sessionId = handle.sessionId;
    run.sessionCwd = handle.cwd;
    if (run.state !== "starting") {
      await endEngine(run);
      return;
    }
    run.state = "running";
    persist(run);
    emit(run, "status", { state: "running", sessionId: handle.sessionId });
    const result = await handle.prompt(run.prompt);
    if (ACTIVE_STATES.has(run.state)) {
      // The turn is over; the changes are final once the child is gone.
      await endEngine(run);
    }
    if (ACTIVE_STATES.has(run.state)) {
      emitChanges(run);
      const { type: _done, ...done } = doneEvent(result, run.usage);
      emit(run, "done", done);
      finish(run, run.state === "stopping" ? "stopped" : "done");
      emit(run, "status", { state: run.state });
    }
  } catch (error) {
    const message = engineHost.redact(String(/** @type {any} */ (error)?.message || error));
    try { await endEngine(run); } catch {}
    if (run.state === "stopping") {
      finish(run, "stopped");
      emit(run, "status", { state: "stopped" });
    } else if (!ACTIVE_STATES.has(run.state)) {
      // stopRun already settled it; the engine's exit is not news.
    } else {
      emit(run, "error", { code: String(/** @type {any} */ (error)?.code || "engine_failed"), message });
      finish(run, "error", message);
      emit(run, "status", { state: "error" });
    }
  } finally {
    clearTimeout(timer);
    try { await endEngine(run); } catch {}
  }

  function emitChangesIfMoved() {
    try {
      const count = shadowFs.listChanges(run.shadow).changes.length;
      if (count !== lastEditCount) {
        lastEditCount = count;
        emitChanges(run);
      }
    } catch {}
  }
}

/**
 * Close the engine and wait for its process to exit (bounded by engine-host).
 * @param {Run} run
 */
async function endEngine(run) {
  const handle = run.engineHandle;
  if (!handle) return;
  const outcome = await handle.close();
  // A stub without an exit report counts as gone; a real child reports.
  run.engineExited = /** @type {any} */ (outcome)?.exited !== false;
}

/** @param {string} stateDir */
function readEventLog(stateDir) {
  try {
    return fs.readFileSync(path.join(stateDir, EVENT_LOG), "utf8").split("\n").filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter((event) => event && Number.isFinite(event.seq) && typeof event.type === "string")
      .slice(-MAX_EVENTS);
  } catch {
    return [];
  }
}

/**
 * @param {string} id
 * @returns {Run}
 */
function getRun(id) {
  if (!validRunId(id)) throw runError("run_unknown", "No run has that id.", 404);
  const live = runs.get(id);
  if (live) return live;
  // After a restart: the shadow and its metadata are still on disk.
  const stateDir = path.join(paths.runsRoot(), id);
  const shadowRoot = path.join(paths.shadowsRoot(), id);
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(stateDir, "run.json"), "utf8"));
  } catch {
    throw runError("run_unknown", "No run has that id.", 404);
  }
  if (!fs.existsSync(shadowRoot)) throw runError("run_discarded", "This run was discarded.", 410);
  /** @type {Run} */
  const run = {
    id,
    folderId: String(meta.folderId || ""),
    folderName: String(meta.folderName || ""),
    level: folders.normalizeLevel(meta.level) || "read",
    engine: String(meta.engine || ""),
    model: String(meta.model || ""),
    prompt: String(meta.prompt || ""),
    state: ACTIVE_STATES.has(meta.state) ? "stopped" : String(meta.state || "stopped"),
    createdAt: String(meta.createdAt || ""),
    endedAt: meta.endedAt || undefined,
    sessionId: String(meta.sessionId || ""),
    sessionCwd: String(meta.sessionCwd || ""),
    shadow: shadowFs.openShadow({ shadowRoot, stateDir }),
    events: readEventLog(stateDir),
    seq: 0,
    listeners: new Set(),
    usage: meta.usage || null,
    fromDisk: true,
  };
  run.seq = run.events.length ? run.events[run.events.length - 1].seq : 0;
  runs.set(id, run);
  return run;
}

/**
 * @param {string} id
 * @param {"stopped" | "error"} [finalState]
 */
async function stopRun(id, finalState = "stopped") {
  const run = getRun(id);
  if (!ACTIVE_STATES.has(run.state)) return summary(run);
  run.state = "stopping";
  emit(run, "status", { state: "stopping" });
  if (run.engineHandle) {
    await run.engineHandle.cancel();
    await endEngine(run);
  }
  finish(run, finalState);
  emitChanges(run);
  emit(run, "status", { state: run.state });
  return summary(run);
}

/** @param {string} id */
function runChanges(id) {
  const run = getRun(id);
  const { changes, links } = shadowFs.listChanges(run.shadow, { diffs: true });
  return {
    runId: run.id,
    state: run.state,
    level: run.level,
    folderName: run.folderName,
    changes,
    links,
    // Deletes are never part of "all": each needs its own confirmation.
    pendingDeletes: changes.filter((change) => change.kind === "deleted").map((change) => change.path),
  };
}

/**
 * @param {string} id
 * @param {{ paths?: string[] | "all", all?: boolean, confirmDeletes?: string[], overwriteConflicts?: string[] }} body
 */
function putBackRun(id, body) {
  const run = getRun(id);
  if (ACTIVE_STATES.has(run.state)) {
    throw runError("run_active", "The engine is still working; stop it or wait for it to finish before putting back.", 409);
  }
  if (run.engineExited === false) {
    throw runError("engine_alive", "The engine process has not exited yet; its changes are not final.", 409);
  }
  const wanted = body.all === true || body.paths === "all" ? "all" : Array.isArray(body.paths) ? body.paths.map(String) : null;
  if (!wanted) throw runError("paths_required", "Name the paths to put back, or all.", 400);
  // The grant is checked again now: an ejected folder takes nothing back.
  const grant = folders.resolveFolder(run.folderId);
  const level = folders.capLevel(run.level, grant.level);
  if (fs.realpathSync(grant.path) !== run.shadow.realRoot) {
    throw runError("folder_changed", "The shared folder is no longer the one this run cloned.", 409);
  }
  const result = shadowFs.putBack(run.shadow, {
    paths: wanted,
    confirmDeletes: Array.isArray(body.confirmDeletes) ? body.confirmDeletes.map(String) : [],
    overwriteConflicts: Array.isArray(body.overwriteConflicts) ? body.overwriteConflicts.map(String) : [],
    readOnly: level === "read",
    trash: seams.trash,
  });
  if (!run.fromDisk) {
    emit(run, "putback", { applied: result.applied.length, conflicts: result.conflicts.length, pendingDeletes: result.pendingDeletes.length });
    emitChanges(run);
  }
  return { runId: run.id, ...result };
}

/**
 * A run's proposals as the page reads them. The engine must be gone: while it
 * works, the channel is not final.
 * @param {string} id
 */
function listProposalsRun(id) {
  const run = getRun(id);
  if (ACTIVE_STATES.has(run.state)) {
    throw runError("run_active", "The engine is still working; its proposals are not final.", 409);
  }
  // A run interrupted by a server restart settles without finish(); harvest
  // what its shadow still holds before listing, without replaying events.
  gatherProposals(run, { quiet: true });
  return { runId: run.id, state: run.state, proposals: proposals.listProposals(run.shadow.stateDir) };
}

/**
 * The writer dismissed one proposal. It leaves the list for good; the run's
 * other proposals are untouched.
 * @param {string} id
 * @param {string} proposalId
 */
function discardProposalRun(id, proposalId) {
  const run = getRun(id);
  if (ACTIVE_STATES.has(run.state)) {
    throw runError("run_active", "The engine is still working; its proposals are not final.", 409);
  }
  gatherProposals(run, { quiet: true });
  const record = proposals.findProposal(run.shadow.stateDir, proposalId);
  if (!record) throw runError("proposal_unknown", "No proposal has that id.", 404);
  if (record.status && record.status !== "pending") {
    throw runError("proposal_settled", `This proposal was already ${record.status}.`, 409);
  }
  proposals.markProposal(run.shadow.stateDir, proposalId, "discarded");
  return { runId: run.id, id: record.id, discarded: true };
}

/**
 * The writer accepted one proposal. Adoption itself is not done here: scrap
 * and review are desk-side, and a restore is only staged into the shadow, so
 * what lands in the real folder still goes through the ordinary put-back and
 * its per-file confirmation.
 * @param {string} id
 * @param {string} proposalId
 */
function acceptProposalRun(id, proposalId) {
  const run = getRun(id);
  if (ACTIVE_STATES.has(run.state)) {
    throw runError("run_active", "The engine is still working; its proposals are not final.", 409);
  }
  if (run.engineExited === false) {
    throw runError("engine_alive", "The engine process has not exited yet; its changes are not final.", 409);
  }
  gatherProposals(run, { quiet: true });
  const record = proposals.findProposal(run.shadow.stateDir, proposalId);
  if (!record) throw runError("proposal_unknown", "No proposal has that id.", 404);
  if (record.status && record.status !== "pending") {
    throw runError("proposal_settled", `This proposal was already ${record.status}.`, 409);
  }
  /** @type {string[]} */
  let staged = [];
  if (record.kind === "restore") {
    const grant = folders.resolveFolder(run.folderId);
    const level = folders.capLevel(run.level, grant.level);
    if (fs.realpathSync(grant.path) !== run.shadow.realRoot) {
      throw runError("folder_changed", "The shared folder is no longer the one this run cloned.", 409);
    }
    if (level === "read") {
      throw runError("read_only", "This folder was shared read-only; nothing can be put back, so there is nothing to stage.", 403);
    }
    staged = proposals.stageRestore(run.shadow, record).staged;
    if (!run.fromDisk) emitChanges(run);
  }
  proposals.markProposal(run.shadow.stateDir, proposalId, "accepted");
  return { runId: run.id, id: record.id, kind: record.kind, accepted: true, staged };
}

/** @param {string} id */
async function discardRun(id) {
  const run = getRun(id);
  if (ACTIVE_STATES.has(run.state)) await stopRun(id);
  // Said before the files go, so the line is not written into a log that
  // is about to be deleted (or left behind beside the put-back snapshots).
  for (const listener of run.listeners) {
    try { listener({ seq: run.seq + 1, type: "status", at: new Date().toISOString(), data: { state: "discarded" } }); } catch {}
  }
  const removed = [];
  // The run's own DSH_HOME (sessions included) sits in the shadow root and
  // goes with it. A run started before homes were per run left its session
  // in the old shared home.
  if (run.sessionCwd && fs.existsSync(paths.legacyDshHome())) {
    removed.push(...removeSessionsFor(paths.legacyDshHome(), run.sessionCwd, run.sessionId ? [run.sessionId] : []));
  }
  shadowFs.removeShadow(run.shadow);
  removed.push(run.shadow.root);
  // Keep runs/<run>/putback: those are the originals a put-back replaced.
  for (const name of fs.existsSync(run.shadow.stateDir) ? fs.readdirSync(run.shadow.stateDir) : []) {
    if (name !== "putback") fs.rmSync(path.join(run.shadow.stateDir, name), { recursive: true, force: true });
  }
  try { fs.rmdirSync(run.shadow.stateDir); } catch {}
  run.state = "discarded";
  runs.delete(id);
  return { runId: id, discarded: true, removed: removed.length };
}

/** Stop every run working in a folder the writer just ejected. @param {string} folderId */
async function stopRunsForFolder(folderId) {
  for (const run of activeRuns().filter((r) => r.folderId === folderId)) await stopRun(run.id);
}

/**
 * Subscribe to a run's events, replaying those after `afterSeq`.
 * @param {string} id
 * @param {number} afterSeq
 * @param {(event: any) => void} listener
 */
function subscribe(id, afterSeq, listener) {
  const run = getRun(id);
  for (const event of run.events) if (event.seq > afterSeq) listener(event);
  run.listeners.add(listener);
  return {
    active: ACTIVE_STATES.has(run.state),
    unsubscribe: () => run.listeners.delete(listener),
  };
}

/**
 * Every run the writer can still act on: live ones, and finished ones whose
 * shadow is still on disk (after a restart too), newest first, each with the
 * number of changes still waiting to be put back.
 */
function listRuns() {
  /** @type {Set<string>} */
  const ids = new Set(runs.keys());
  try {
    for (const name of fs.readdirSync(paths.runsRoot())) {
      if (validRunId(name) && fs.existsSync(path.join(paths.shadowsRoot(), name))) ids.add(name);
    }
  } catch {}
  const out = [];
  for (const id of ids) {
    let run;
    try { run = getRun(id); } catch { continue; }
    let pendingChanges = 0;
    try { pendingChanges = shadowFs.listChanges(run.shadow).changes.length; } catch {}
    let pendingProposals = 0;
    try {
      pendingProposals = proposals.listProposals(run.shadow.stateDir).filter((record) => record.status === "pending").length;
    } catch {}
    out.push({ ...summary(run), pendingChanges, pendingProposals });
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** Which engines have a key in the Keychain (LM Studio needs none). */
async function engineKeys() {
  const has = async (engine) => Boolean(await seams.resolveKey(engine).catch(() => ""));
  return { deepseek: await has("deepseek"), anthropic: await has("anthropic"), lmstudio: true };
}

/** Test seam: swap the engine, key lookup, trash and clone method. */
function configureRunsForTests(overrides = {}) {
  Object.assign(seams, overrides);
}

function resetRunsForTests() {
  runs.clear();
  seams.startEngine = engineHost.startEngine;
  seams.resolveKey = defaultResolveKey;
  seams.forceCopy = false;
  seams.trash = undefined;
}

module.exports = {
  ACTIVE_STATES,
  acceptProposalRun,
  configureRunsForTests,
  createRun,
  discardProposalRun,
  discardRun,
  engineKeys,
  getRun,
  listProposalsRun,
  listRuns,
  putBackRun,
  resetRunsForTests,
  runChanges,
  stopRun,
  stopRunsForFolder,
  subscribe,
};
