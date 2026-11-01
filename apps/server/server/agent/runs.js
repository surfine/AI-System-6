// Agent runs: one prompt, one shadow, one engine child, one event log.
//
// A run's lifecycle is starting → running → done | stopped | error. Its shadow
// outlives the engine: the writer reviews the changes and puts back (or
// discards) after the engine has exited. A run settles only after the
// engine's whole process group is gone (engine-host kill() confirms the
// group, not just the direct child — p3-survivor), and the moment the group
// is confirmed gone the run freezes and seals its shadow (shadow.js
// freezeShadow): work/, tmp/ and the run's DSH_HOME are renamed to frozen/,
// tmp-frozen/ and dsh-home-frozen/, names no write allowance of the profile
// the engine's processes may still carry covers, so a process that detached
// from the group and outlived it can no longer touch them by path; the frozen
// trees are then copied to sealed/ and sealed-tmp/ (new inodes), because a
// descriptor, a mapping or a hard link it made before the freeze still
// reaches the frozen inodes. Every server read and write of a settled run's
// tree — the change list, put-back, staging, the proposal harvest — goes
// through the sealed paths, and the run is reported done only after the seal
// exists. A shadow that was never frozen and sealed is treated as live
// (run_active): a server death mid-run, or a shadow from before the freeze,
// leaves the writer the discard.
//
// The engine gets no MCP server. The desk's /mcp guest bridge would hand it
// desk-wide read tools (every Project Hard Disk item, not just the shared
// folder), and with web tools on (ruling 2026-10-24) whatever it reads can
// leave the Mac. Its only output is the shadow and the writer's put-back. A
// run the writer grants desk tools for (ruling C4) gets a few read tools on
// the granted project instead, over a file channel the server relays to the
// page and logs call by call — still no MCP server and no loopback port
// (desk-tools.js); the grant is the run's, never the next one's. Run metadata is written to
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
const desk = require("./desk-tools.js");
const agentRoles = require("../../../desktop/app/core/agent-roles.js");
const connectorGateway = require("./connector-gateway.js");
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
 * @property {string} [language]
 * @property {string} prompt
 * @property {string} [priorTurns]  a task's earlier turns and the note on its lent documents, sent ahead of the prompt (not stored in run.json)
 * @property {string[]} [proposalKinds]  the only proposal kinds the run may offer (a task's read-level turn); stored in run.json
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
 * @property {boolean} [unattended]  a schedule's run (schedule-runner.js): read level, no web unless the schedule allows it, capped; stored in run.json
 * @property {string} [scheduleId]  the schedule that started an unattended run; stored in run.json
 * @property {boolean} [standing]  the run came from a standing intent: its proposals are withdrawn after 72 hours unopened; stored in run.json
 * @property {string} [proposalsOpenedAt]  when the writer first listed an unattended run's proposals; stored in run.json
 * @property {boolean} [webTools]  false: the engine's web tool is disabled for this run
 * @property {number} [tokenCap]  an unattended run is stopped when its token counter passes this
 * @property {number} [wallMs]  an unattended run is stopped after this long
 * @property {boolean} [capped]  the cap already stopped the run
 * @property {boolean} [deskTools]  the writer granted this run the read-only desk tools (ruling C4)
 * @property {string} [deskProjectId]  the desk project the grant names; the page answers only while it is open
 * @property {string} [deskProjectName]
 * @property {string[]} [connectors]  names of the outside MCP servers this run may reach through its gateway
 * @property {Awaited<ReturnType<typeof import("./connector-gateway.js").startConnectorGateway>>} [gateway]  the run's connector gateway, closed with the engine
 * @property {{ port: number, close: () => Promise<void> }} [egress]  the run's own egress filter (an engine with egressHosts), closed with the engine
 * @property {ReturnType<typeof desk.openDeskChannel>} [desk]  the live desk channel (granted, live runs only)
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
  /** Test seam: the connector check resolves DNS, which a contract must not. */
  normalizeConnectors: connectorGateway.normalizeConnectors,
  /** The per-run egress filter of an engine with egressHosts. @param {{ allowHosts: string[] }} input */
  startEgress: (/** @type {{ allowHosts?: string[] }} */ input) => require("./egress-proxy.js").startEgressProxy(input),
  claudeEngineStatus: () => paths.claudeEngineStatus(),
  codexEngineStatus: () => paths.codexEngineStatus(),
  /** Is the writer signed in to Codex (its auth.json exists)? Never reads it. */
  codexLoggedIn: () => fs.existsSync(paths.codexLoginFile()),
};

/** @param {string} engine */
async function defaultResolveKey(engine) {
  const spec = engineHost.ENGINES[engine];
  if (!spec?.vault) return "";
  const vault = require("../credential-vault.js");
  if (engine === "claude-code") {
    // A `claude setup-token` token the writer filed under the claude-code
    // entry, else the writer's Anthropic key: never Claude Code's own login
    // (engine-host.js claudeCodeLaunch says why).
    const credentialId = vault.createCredentialId(spec.vault.provider, spec.vault.baseUrl);
    // Whitespace is never part of a token: one saved from a wrapped terminal
    // line still works.
    const token = String(await vault.resolveCloudCredential({ credentialId, provider: spec.vault.provider, targetBaseUrl: spec.vault.baseUrl }).catch(() => "") || "").replace(/\s+/g, "");
    return token || defaultResolveKey("anthropic");
  }
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
    deskTools: Boolean(run.deskTools),
    deskProjectName: run.deskProjectName || "",
    ...(run.unattended ? { unattended: true, scheduleId: run.scheduleId || "", standing: run.standing === true, prompt: String(run.prompt || "").slice(0, 2000) } : {}),
  };
}

/** @param {Run} run */
function persist(run) {
  const file = path.join(run.shadow.stateDir, "run.json");
  fs.writeFileSync(file, `${JSON.stringify({ ...summary(run), deskProjectId: run.deskProjectId || "", prompt: run.prompt, proposalKinds: run.proposalKinds, proposalsOpenedAt: run.proposalsOpenedAt || "", sessionId: run.sessionId || "", sessionCwd: run.sessionCwd || "" }, null, 2)}\n`);
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
    // The whole shadow, so harvest checks every root before it reads.
    outcome = proposals.harvestProposals(run.shadow, run.proposalKinds ? { kinds: run.proposalKinds } : {});
  } catch {}
  if (options.quiet) return;
  for (const record of outcome.gathered) {
    emit(run, "proposal", { id: record.id, kind: record.kind, title: String(record.title || "").slice(0, 120) });
  }
  if (outcome.dropped) emit(run, "proposal", { dropped: outcome.dropped });
}

/** @type {Set<(run: Run) => void>} */
const finishListeners = new Set();

/**
 * Tell the task layer a run has ended, so a follow-up the writer queued can
 * start without anyone reading the task.
 * @param {(run: Run) => void} listener
 */
function onRunFinished(listener) {
  finishListeners.add(listener);
}

/** @param {Run} run @param {string} state @param {string} [error] */
function finish(run, state, error) {
  if (!ACTIVE_STATES.has(run.state)) return;
  run.desk?.close();
  void run.gateway?.close();
  void run.egress?.close();
  gatherProposals(run);
  run.state = state;
  run.endedAt = new Date().toISOString();
  if (error) run.error = error;
  persist(run);
  for (const listener of finishListeners) {
    try { listener(run); } catch {}
  }
}

function activeRuns() {
  return [...runs.values()].filter((run) => ACTIVE_STATES.has(run.state));
}

/**
 * What the engine is told about the lent documents of its working folder: where
 * each one sits, that it is plain-text projection of a document it cannot open,
 * and that its edits are reviewed rather than written. Names are the writer's,
 * quoted on one line.
 * @param {Array<{ id: string, dir: string }>} placed
 * @param {Array<{ id: string, name: string }>} objects
 */
function lentDocumentsNote(placed, objects) {
  if (!placed.length) return "";
  const lines = placed.map((entry) => {
    const name = String(objects.find((object) => object.id === entry.id)?.name || entry.dir).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").slice(0, 120);
    return `- ${JSON.stringify(name)} is the folder ${JSON.stringify(`${entry.dir}/`)}`;
  });
  return [
    "[The writer lends you documents. Each is a folder of plain-text projection files in your working folder, not the document itself:",
    ...lines,
    "Edit the text in place and keep the {#...} markers on each line; leave manifest.json alone. The real document is not changed by your edits: the writer reviews them and decides what goes in.]",
  ].join("\n");
}

/**
 * @typedef {object} CreateRunInput
 * @property {string} [folderId]  the mounted real folder; absent only when `objects` carries the run's documents
 * @property {Array<{ id: string, name: string, files: Array<{ path: string, bytes: Buffer }> }>} [objects]  lent documents (a task's object mounts), written under their own folder names in the `.ais6-documents/` folder of base/ and work/, and never put back to disk
 * @property {string} [level]
 * @property {string} prompt
 * @property {string} [priorTurns]  a task's preamble for turn n>1 (tasks.js); the engine reads it before the prompt
 * @property {boolean} [taskTurn]  a task's turn: at level read it may offer only plan and question proposals
 * @property {string} [seedWork]  a snapshot to start work/ from instead of the folder's current files (a forked task); base/ stays the folder as it is now
 * @property {string} [snapshotTo]  where to snapshot work/ before the engine starts (a task's rewind point); outside the shadow
 * @property {string} [engine]
 * @property {string} [model]
 * @property {string} [deskContext]  the writer's skills and memory as the task's V12 snapshot, sent ahead of the prompt on every turn (not stored in run.json)
 * @property {string} [role]  a built-in role id: a sub-turn handed to that role, read level, offering only that role's kinds
 * @property {string} [language]   the desk language (zh: the preamble answers in 简体中文)
 * @property {number} [serverPort]  unused: the engine is given no /mcp server
 * @property {string} [lmStudioBaseUrl]
 * @property {boolean} [deskTools]  the writer's grant of the read-only desk tools, for this run only
 * @property {string} [deskProjectId]  the desk project the grant names (required with deskTools)
 * @property {string} [deskProjectName]
 * @property {Array<{ name: string, url: string, headers?: Record<string, string>, tools?: Record<string, string> }>} [connectors]  outside MCP servers for this turn (validated, reached only through the gateway)
 * @property {boolean} [standing]  the run belongs to a standing intent (its unopened proposals are withdrawn after 72 hours)
 * @property {boolean} [unattended]  a schedule's run: level is forced to read, only UNATTENDED_KINDS are harvested, the cap and wall clock below stop it
 * @property {string} [scheduleId]
 * @property {boolean} [network]  an unattended run's web tool and search key; ignored (always on) for an interactive run
 * @property {number} [tokenCap]
 * @property {number} [wallMs]
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
  const language = /^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$/i.test(String(input.language || "")) ? String(input.language) : "";
  const model = String(input.model || spec.defaultModel || "");
  if (engine === "lmstudio" && !model) throw runError("model_required", "LM Studio needs a model identifier.", 400);
  const objects = input.objects || [];
  if (!input.folderId && !objects.length) throw runError("folder_unknown", "No shared folder has that id.", 404);
  // An unknown folder is the caller's mistake whatever the engine's state.
  const grant = input.folderId ? folders.resolveFolder(input.folderId) : null;
  if (seams.startEngine === engineHost.startEngine && spec.acp === "claude-code" && !paths.claudeEngineStatus().installed) {
    throw runError("engine_missing", "The Claude Code engine is not installed (see docs/AGENT-HARNESS.md, Engines).", 503);
  }
  if (seams.startEngine === engineHost.startEngine && spec.acp === "codex" && !seams.codexEngineStatus().installed) {
    throw runError("engine_missing", "The Codex engine is not installed (see docs/AGENT-HARNESS.md, Engines).", 503);
  }
  if (spec.acp === "codex" && !seams.codexLoggedIn()) {
    throw runError("engine_key_missing", "Codex is not signed in on this Mac; sign in with the codex command once.", 409);
  }
  if (seams.startEngine === engineHost.startEngine && !spec.acp && !paths.engineStatus().installed) {
    throw runError("engine_missing", "The ClioTalk engine is not installed (run node tooling/build-dsh-slim.mjs).", 503);
  }
  // Lent documents are capped at propose; a folder at its grant.
  // An unattended run is read whatever was asked or granted.
  const unattended = input.unattended === true;
  // A role turn (M8 roles slice 2) is read level: the role's tool limit is the
  // kinds it may offer, and nothing in the writer's files changes.
  const role = input.role ? agentRoles.byId(String(input.role)) : null;
  if (input.role && (!role || role.main)) throw runError("role_unknown", `Unknown role ${String(input.role).slice(0, 40)}.`, 400);
  const level = unattended || role ? "read" : folders.capLevel(String(input.level || (grant ? grant.level : "propose")), grant ? grant.level : "propose");
  const webTools = unattended ? input.network === true : true;
  // The desk-tools grant names the project the page will answer for; the
  // page checks it is still the open one before it runs a call.
  const deskTools = input.deskTools === true;
  const deskProjectId = String(input.deskProjectId || "");
  if (deskTools && (!deskProjectId || deskProjectId.length > 200 || /[\u0000-\u001f\u007f]/.test(deskProjectId))) {
    throw runError("desk_project_required", "Desk tools are granted for one open project; name it.", 400);
  }
  // Outside MCP servers the writer allowed Clio to use this turn. They are
  // validated now and reached only through this run's gateway
  // (connector-gateway.js): the engine never gets their address.
  const connectors = await seams.normalizeConnectors(input.connectors).catch((error) => {
    throw runError(String(error?.code || "connector_invalid"), String(error?.message || error), 400);
  });
  if (activeRuns().length >= MAX_ACTIVE_RUNS) throw runError("too_many_runs", "Two runs are already working; stop one first.", 429);
  if (grant && activeRuns().some((run) => run.folderId === grant.id)) {
    throw runError("folder_busy", "A run is already working in this folder.", 409);
  }
  const key = await seams.resolveKey(engine);
  if (spec.vault && !key) {
    throw runError("engine_key_missing", `No ${spec.vault.provider} key is in the Keychain; add one in Control Panel.`, 409);
  }
  // Web search is DeepSeek's: another engine gets the DeepSeek key for it
  // only when the writer has one.
  const extraKeys = {};
  // Claude Code searches through its own provider; no other key rides along.
  if (engine !== "deepseek" && !spec.acp && webTools) {
    const deepseekKey = await seams.resolveKey("deepseek").catch(() => "");
    if (deepseekKey) extraKeys.DEEPSEEK_API_KEY = deepseekKey;
  }

  const id = `run-${crypto.randomUUID()}`;
  const stateDir = path.join(paths.runsRoot(), id);
  const shadowRoot = path.join(paths.shadowsRoot(), id);
  paths.assertNotTemporary(stateDir);
  paths.assertNotTemporary(shadowRoot);
  let shadow;
  try {
    shadow = shadowFs.createShadow({ source: grant?.path, objects, shadowRoot, stateDir, forceCopy: seams.forceCopy, seedWork: input.seedWork });
  } catch (error) {
    // A shadow that could not be made whole leaves no half of it behind.
    if (/** @type {any} */ (error)?.code !== "shadow_exists") {
      shadowFs.forceRemove(shadowRoot);
      shadowFs.forceRemove(stateDir);
    }
    throw error;
  }
  // Codex and Claude Code cannot write through the channel's link (each
  // refuses a path that leaves the folder by a link, or the tmp/ target is
  // outside what they may write; live runs, 2026-10-31): their channel is a
  // real folder in work/, which harvest merges into the channel.
  if (engine === "codex" || engine === "claude-code") {
    const link = path.join(shadow.work, shadowFs.PROPOSALS_NAME);
    fs.rmSync(link, { recursive: true, force: true });
    fs.mkdirSync(link);
  }
  if (input.snapshotTo) {
    // Before the engine exists, so the snapshot is the tree as the turn found
    // it; a snapshot that cannot be made (caps, an unsealable entry) refuses
    // the run and leaves nothing behind.
    try {
      shadowFs.snapshotTree(shadow.work, input.snapshotTo);
    } catch (error) {
      shadowFs.removeShadow(shadow);
      shadowFs.forceRemove(stateDir);
      throw error;
    }
  }
  // The run's own DSH_HOME, beside its clones: nothing in it outlives the run.
  const dshHome = seedDshHome(runDshHome(shadowRoot));
  /** @type {Run} */
  const run = {
    id,
    folderId: grant ? grant.id : "",
    folderName: grant ? grant.name : objects.map((object) => object.name).join(", "),
    level,
    engine,
    model,
    language,
    prompt,
    priorTurns: [String(input.deskContext || "").slice(0, 24_000), role ? agentRoles.brief(role.id) : "", lentDocumentsNote(shadow.objects || [], objects), input.taskTurn ? engineHost.LEDGER_NOTE : "", String(input.priorTurns || "")].filter(Boolean).join("\n\n"),
    proposalKinds: unattended ? [...proposals.UNATTENDED_KINDS] : role ? agentRoles.proposalKinds(role.id) : input.taskTurn && level === "read" ? [...proposals.READ_KINDS] : undefined,
    unattended,
    scheduleId: unattended ? String(input.scheduleId || "") : undefined,
    standing: unattended && input.standing === true,
    webTools,
    tokenCap: unattended ? Math.max(1, Math.floor(Number(input.tokenCap) || 0)) || undefined : undefined,
    wallMs: unattended ? Math.max(1, Math.floor(Number(input.wallMs) || 0)) || undefined : undefined,
    state: "starting",
    createdAt: new Date().toISOString(),
    shadow,
    events: [],
    seq: 0,
    listeners: new Set(),
    usage: null,
    budget: createEventBudget(),
    deskTools,
    deskProjectId: deskTools ? deskProjectId : "",
    deskProjectName: deskTools ? String(input.deskProjectName || "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) : "",
    connectors: connectors.map((connector) => connector.name),
  };
  // The desk channel, for this run only: made before the engine starts,
  // closed when the engine is let go.
  if (deskTools) run.desk = desk.openDeskChannel(shadow, { emit: (type, data) => { emit(run, type, data); } });
  runs.set(id, run);
  persist(run);
  emit(run, "status", { state: "starting", level, engine, model, folderName: run.folderName, shadowMethod: shadow.method, deskTools });
  void drive(run, { key, extraKeys, dshHome, lmStudioBaseUrl: input.lmStudioBaseUrl, connectors });
  return summary(run);
}

/**
 * @param {Run} run
 * @param {{ key: string, extraKeys: Record<string, string>, dshHome: string, lmStudioBaseUrl?: string, connectors?: import("./connector-gateway.js").ConnectorInput[] }} options
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
  const timer = run.unattended && run.wallMs
    // An unattended run's own wall clock: stopped, not failed, and the
    // candidates it made are harvested like any stop.
    ? setTimeout(() => capStop(run, "unattended_wall_clock", "The unattended run passed its time limit and was stopped."), run.wallMs)
    : setTimeout(() => {
      emit(run, "error", { code: "run_timeout", message: `The run passed ${Math.round(RUN_TIMEOUT_MS / 60_000)} minutes and was stopped.` });
      void stopRun(run.id, "error");
    }, RUN_TIMEOUT_MS);
  timer.unref?.();
  let lastEditCount = 0;
  try {
    // The connector gateway: the only extra port the sandbox opens, and it
    // closes with the engine.
    if (options.connectors?.length) {
      run.gateway = await connectorGateway.startConnectorGateway({
        connectors: options.connectors,
        // A read-only (只读) turn: only read-only, non-destructive tools.
        readOnly: run.level === "read",
        onAsk: (ask) => emit(run, "connector_ask", ask),
        onCall: (call) => emit(run, "connector_call", call),
      });
    }
    // An engine that names its hosts (claude-code) gets its own filter with
    // exactly those on the allowlist; its profile closes every other way out.
    const spec = engineHost.ENGINES[run.engine];
    if (spec?.egressHosts) {
      // Claude Code's WebFetch (a run with web tools, as for dsh) reaches any
      // public host on 443; Codex and an offline run keep the engine's hosts.
      const open = run.engine === "claude-code" && run.webTools !== false;
      run.egress = await seams.startEgress(open ? {} : { allowHosts: [...spec.egressHosts] });
    }
    const channelDir = (/** @type {string} */ name) => path.join(run.shadow.tmp, name);
    const handle = await seams.startEngine({
      engine: run.engine,
      model: run.model,
      language: run.language,
      work: run.shadow.work,
      tmp: run.shadow.tmp,
      dshHome: options.dshHome,
      readOnly: run.level === "read",
      stateDir: run.shadow.stateDir,
      key: options.key,
      extraKeys: options.extraKeys,
      lmStudioBaseUrl: options.lmStudioBaseUrl,
      // This Mac stays closed to the engine but for LM Studio on its runs.
      loopbackPorts: [...(run.engine === "lmstudio" ? [lmPort] : []), ...(run.gateway ? [run.gateway.port] : [])],
      mcpServers: run.gateway ? run.gateway.mcpServers : [],
      // Desk tools ride the shadow's file channel (desk-tools.js), not a port.
      deskTools: Boolean(run.desk),
      webTools: run.webTools !== false,
      unattended: run.unattended === true,
      onUpdate: (update) => {
        const context = { work: realWork };
        for (const event of translateUpdate(update, context)) {
          if (event.type === "usage") {
            run.usage = { used: Number(event.used), size: Number(event.size) };
            if (run.unattended && run.tokenCap && run.usage.used > run.tokenCap) {
              capStop(run, "unattended_token_cap", "The unattended run passed its token cap and was stopped.");
            }
          }
          const { type, ...data } = event;
          emit(run, type, data);
          // A finished tool may have written the shadow: refresh the count.
          if (type === "tool_update" && data.status === "completed") emitChangesIfMoved();
        }
      },
      // dsh is answered reject; an engine that asks is answered by policy
      // (engine-permissions.js) and each answer is logged as it was given.
      ...(spec?.acp
        ? {
          egressPort: run.egress ? run.egress.port : 0,
          policy: {
            level: run.level,
            channels: [channelDir(shadowFs.PROPOSALS_NAME), ...(run.engine === "codex" || run.engine === "claude-code" ? [path.join(run.shadow.work, shadowFs.PROPOSALS_NAME)] : []), ...(run.desk ? [path.join(channelDir(shadowFs.DESK_NAME), "ask")] : [])],
            readRoots: run.desk ? [channelDir(shadowFs.DESK_NAME)] : [],
            gatewayServers: run.gateway ? run.gateway.mcpServers.map((server) => server.name) : [],
          },
          onDecision: (/** @type {any} */ record) => emit(run, "permission", {
            toolCallId: String(record?.toolCallId || "").slice(0, 120),
            action: String(record?.action || "").slice(0, 40),
            decision: record?.decision === "allow" ? "allow" : "deny",
            reason: String(record?.reason || "").slice(0, 60),
          }),
        }
        : { onPermission: (params) => emit(run, "permission_rejected", { toolCallId: String(params?.toolCall?.toolCallId || "") }) }),
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
    const result = await handle.prompt(run.priorTurns ? `${run.priorTurns}\n\n${run.prompt}` : run.prompt);
    if (ACTIVE_STATES.has(run.state)) {
      // The turn is over; the changes are final once the child is gone.
      await endEngine(run);
    }
    if (ACTIVE_STATES.has(run.state) && run.engineExited !== false && !run.shadow.sealed) {
      // The run is reported finished only once its shadow is frozen and
      // sealed: until then nothing can be read through it, and "done" with
      // an empty change list would be a lie. One more try, then an error.
      freezeRunShadow(run);
      if (!run.shadow.sealed) {
        const message = "The run's changes could not be frozen and sealed, so they cannot be reviewed. Discard the run and try again.";
        emit(run, "error", { code: "seal_failed", message });
        finish(run, "error", message);
        emit(run, "status", { state: "error" });
        return;
      }
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
 * An unattended run passed its token cap or wall clock: say so once and stop
 * it. stopRun cancels the engine and settles the run as stopped, harvesting
 * the candidates it already wrote (finish → gatherProposals).
 * @param {Run} run
 * @param {string} code
 * @param {string} message
 */
function capStop(run, code, message) {
  if (run.capped || !ACTIVE_STATES.has(run.state)) return;
  run.capped = true;
  emit(run, "error", { code, message });
  void stopRun(run.id).catch(() => {});
}

/** How many unattended runs are working now (the schedules' own cap). */
function activeUnattendedCount() {
  return activeRuns().filter((run) => run.unattended).length;
}

/**
 * Close the engine and wait for its process to exit (bounded by engine-host).
 * The moment the group is confirmed gone, the run freezes its shadow: a
 * detached survivor of the group may still be alive, and the freeze takes the
 * trees it could write out from under it (shadow.js freezeShadow).
 * @param {Run} run
 */
async function endEngine(run) {
  // The engine is being let go: no desk call or connector call is served
  // from here on.
  run.desk?.close();
  void run.gateway?.close();
  void run.egress?.close();
  const handle = run.engineHandle;
  if (!handle) return;
  const outcome = await handle.close();
  // A stub without an exit report counts as gone; a real child reports only
  // once its whole process group is confirmed gone (engine-host kill()).
  run.engineExited = /** @type {any} */ (outcome)?.exited !== false;
  if (run.engineExited) freezeRunShadow(run);
}

/**
 * Freeze the run's shadow (shadow.js freezeShadow). A freeze that cannot run
 * — a tampered or already-removed shadow — leaves the run live: the gates
 * below refuse an unfrozen shadow until the writer discards it.
 * @param {Run} run
 */
function freezeRunShadow(run) {
  if (run.shadow.sealed) return;
  try {
    shadowFs.freezeShadow(run.shadow);
  } catch {}
}

/**
 * A run whose shadow has not been frozen is treated as live: its changes are
 * not final and nothing may read or write them. Runs settle frozen, so this
 * fires for a run loaded from disk whose freeze never ran — a server death
 * mid-run, or a shadow from before the freeze — and leaves the writer the
 * discard.
 * @param {Run} run
 */
function ensureShadowFrozen(run) {
  if (!run.shadow.frozen || !run.shadow.sealed) {
    throw runError("run_active", "The engine's shadow is not frozen and sealed yet; the run is treated as still live.", 409);
  }
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
  // A shadow whose folders were swapped (checkShadow) still loads, unchecked,
  // so the writer can discard it; changes, put-back, staging and harvest
  // each check again and refuse with shadow_tampered.
  let shadow;
  try {
    shadow = shadowFs.openShadow({ shadowRoot, stateDir });
  } catch (error) {
    if (/** @type {any} */ (error)?.code !== "shadow_tampered") throw error;
    shadow = shadowFs.openShadow({ shadowRoot, stateDir }, { check: false });
  }
  // A shadow that froze but died before its seal (or froze before seals
  // existed) finishes the seal now; nothing was readable through it until
  // this, so nothing reviewed can differ. A failure leaves it unsealed and
  // the gates refuse it (run_active) until the writer discards it.
  if (shadow.frozen && !shadow.sealed) {
    try { shadowFs.freezeShadow(shadow); } catch {}
  }
  /** @type {Run} */
  const run = {
    id,
    folderId: String(meta.folderId || ""),
    folderName: String(meta.folderName || ""),
    level: folders.normalizeLevel(meta.level) || "read",
    engine: String(meta.engine || ""),
    model: String(meta.model || ""),
    prompt: String(meta.prompt || ""),
    proposalKinds: Array.isArray(meta.proposalKinds) ? meta.proposalKinds.map(String) : undefined,
    unattended: meta.unattended === true,
    scheduleId: meta.unattended === true ? String(meta.scheduleId || "") : undefined,
    standing: meta.standing === true,
    proposalsOpenedAt: String(meta.proposalsOpenedAt || ""),
    state: ACTIVE_STATES.has(meta.state) ? "stopped" : String(meta.state || "stopped"),
    createdAt: String(meta.createdAt || ""),
    endedAt: meta.endedAt || undefined,
    sessionId: String(meta.sessionId || ""),
    sessionCwd: String(meta.sessionCwd || ""),
    shadow,
    events: readEventLog(stateDir),
    seq: 0,
    listeners: new Set(),
    usage: meta.usage || null,
    deskTools: meta.deskTools === true,
    deskProjectName: String(meta.deskProjectName || ""),
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

/**
 * What a run produced, from its records only (never the model's own words):
 * the change counts at the end of the turn, how many files the writer put
 * back, the changes still waiting, and each proposal's kind and status. A task
 * reads this for a turn's result and for the next turn's fact ledger.
 * @param {string} id
 * @param {{ pending?: boolean }} [options]  pending walks the shadow for the changes still waiting; off by default
 */
function runOutcome(id, options = {}) {
  const run = getRun(id);
  const count = (/** @type {any} */ value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  /** @type {any} */
  let last = null;
  /** @type {any} */
  let atDone = null;
  let putBack = 0;
  for (const event of run.events) {
    if (event.type === "changes") last = event.data;
    else if (event.type === "done" && !atDone) atDone = last;
    else if (event.type === "putback") putBack += count(event.data?.applied);
  }
  const made = atDone || last || {};
  /** @type {Array<{ path: string, kind: string }>} */
  let pending = [];
  if (options.pending && !ACTIVE_STATES.has(run.state)) {
    try { pending = shadowFs.listChanges(run.shadow).changes.map((change) => ({ path: change.path, kind: change.kind })); } catch {}
  }
  /** @type {Array<{ id: string, kind: string, status: string }>} */
  let found = [];
  try {
    found = proposals.listProposals(run.shadow.stateDir).map((record) => ({ id: record.id, kind: record.kind, status: record.status || "pending" }));
  } catch {}
  return {
    changes: { count: count(made.count), added: count(made.added), modified: count(made.modified), deleted: count(made.deleted) },
    putBack,
    pending,
    proposals: found,
  };
}

/**
 * Post a proposal of the host's own into a run (a task's stuck report).
 * @param {string} id
 * @param {{ kind: string, title: string, reason?: string, payload: Record<string, unknown> }} record
 */
function postHostProposal(id, record) {
  return proposals.addHostProposal(getRun(id).shadow.stateDir, record);
}

/**
 * The progress ledger the run's engine left, or null.
 * @param {string} id
 */
function runLedger(id) {
  return proposals.readLedger(getRun(id).shadow.stateDir);
}

/**
 * The gates a rewind of the run passes before anything moves: the run is not
 * active, its engine is confirmed gone, and its shadow is frozen and sealed (a
 * run a restart interrupted is none of these until the writer discards it).
 * A task checks every turn it rewinds with this first, so a rewind is refused
 * whole rather than half done.
 * @param {string} id
 */
function assertRewindable(id) {
  const run = getRun(id);
  if (ACTIVE_STATES.has(run.state)) {
    throw runError("run_active", "The engine is still working; its changes are not final yet.", 409);
  }
  if (run.engineExited === false) {
    throw runError("engine_alive", "The engine's process group has not been confirmed gone; its changes are not final.", 409);
  }
  ensureShadowFrozen(run);
  return run;
}

/**
 * Rewind one settled run: the changes still waiting go back to what a
 * snapshot of its work/ held, and the proposals still waiting are marked
 * "rewound" (dropped). What the writer already decided stays: put-back files
 * are in the real folder and in base/ (so they are no longer changes), an
 * accepted proposal keeps its status, and the files an accepted restore staged
 * are left in the tree. Nothing outside the run's own shadow is written.
 * @param {string} id
 * @param {string} snapshot
 */
function rewindRun(id, snapshot) {
  const run = assertRewindable(id);
  gatherProposals(run, { quiet: true });
  const stateDir = run.shadow.stateDir;
  const records = proposals.listProposals(stateDir);
  const kept = new Set();
  for (const record of records) {
    if (record.kind === "restore" && record.status === "accepted") for (const file of record.payload?.files || []) kept.add(String(file.name));
  }
  // Lent documents too: their edits are not put back, but a rewind undoes them.
  const waiting = shadowFs.listChanges(run.shadow, { objects: true }).changes.map((change) => change.path).filter((rel) => !kept.has(rel));
  const { restored, refused } = shadowFs.restoreFromSnapshot(run.shadow, snapshot, waiting);
  let dropped = 0;
  for (const record of records) {
    if (record.status && record.status !== "pending") continue;
    proposals.markProposal(stateDir, record.id, "rewound");
    dropped += 1;
  }
  if (!run.fromDisk) emitChanges(run);
  return { runId: run.id, restored: restored.length, refused: refused.length, dropped };
}

/** @param {string} id */
function runChanges(id) {
  const run = getRun(id);
  // The change list carries unified diffs, and an engine (or a survivor of
  // its group — p3) can swap a folder of the tree between the lstat chain
  // and the read (p2). Only a settled run, whose whole process group is gone
  // and whose shadow is frozen, may be read with diffs.
  if (ACTIVE_STATES.has(run.state)) {
    throw runError("run_active", "The engine is still working; its changes are not final yet.", 409);
  }
  if (run.engineExited === false) {
    throw runError("engine_alive", "The engine's process group has not been confirmed gone; its changes are not final.", 409);
  }
  ensureShadowFrozen(run);
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
 * The engine-edited projection files of one lent document of a run, for the
 * page to diff against its own projection. The run must be settled and its
 * shadow frozen and sealed, as for runChanges.
 * @param {string} id
 * @param {string} objectId
 */
function runObjectFiles(id, objectId) {
  const run = getRun(id);
  if (ACTIVE_STATES.has(run.state)) {
    throw runError("run_active", "The engine is still working; its changes are not final yet.", 409);
  }
  if (run.engineExited === false) {
    throw runError("engine_alive", "The engine's process group has not been confirmed gone; its changes are not final.", 409);
  }
  ensureShadowFrozen(run);
  const found = shadowFs.objectFiles(run.shadow, objectId);
  if (!found) throw runError("task_object_unknown", "This turn holds no such lent document.", 404);
  return { runId: run.id, state: run.state, ...found };
}

/**
 * @param {string} id
 * @param {{ paths?: string[] | "all", all?: boolean, confirmDeletes?: string[], overwriteConflicts?: string[], confirmUnshown?: string[], reviewed?: Record<string, string | null> }} body
 */
function putBackRun(id, body) {
  const run = getRun(id);
  if (ACTIVE_STATES.has(run.state)) {
    throw runError("run_active", "The engine is still working; stop it or wait for it to finish before putting back.", 409);
  }
  // engineExited comes from the engine host: it turns true only when the
  // whole engine process group is confirmed gone (p3), not when the direct
  // child has merely exited. The frozen shadow is what the put-back reads.
  if (run.engineExited === false) {
    throw runError("engine_alive", "The engine's process group has not been confirmed gone; its changes are not final.", 409);
  }
  // A documents-only run (a task that only lent documents) has no real folder.
  if (!run.folderId) throw runError("task_no_folder", "This task lent documents only; there is no shared folder to put changes back into.", 409);
  ensureShadowFrozen(run);
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
    confirmUnshown: Array.isArray(body.confirmUnshown) ? body.confirmUnshown.map(String) : [],
    readOnly: level === "read",
    // The digests the writer reviewed (the page echoes the change list's
    // sha256 per path); a path missing here or no longer matching refuses.
    reviewed: body.reviewed && typeof body.reviewed === "object" && !Array.isArray(body.reviewed) ? body.reviewed : undefined,
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
  // The harvest reads the run's tree (frozen once the run froze it); a shadow
  // that was never frozen is not the engine's final output.
  ensureShadowFrozen(run);
  // A run interrupted by a server restart settles without finish(); harvest
  // what its shadow still holds before listing, without replaying events.
  gatherProposals(run, { quiet: true });
  // The writer looking at an unattended run's proposals is what keeps a
  // standing intent's candidates from being withdrawn.
  if (run.unattended && !run.proposalsOpenedAt) {
    run.proposalsOpenedAt = new Date().toISOString();
    persist(run);
  }
  return { runId: run.id, state: run.state, proposals: proposals.listProposals(run.shadow.stateDir) };
}

/**
 * Standing intents only: a finished run whose proposals nobody opened within
 * `afterMs` has them withdrawn (status "withdrawn"; they leave the pending
 * count). Returns the run ids it withdrew from.
 * @param {number} afterMs
 * @param {Date} [now]
 * @returns {string[]}
 */
function withdrawStaleProposals(afterMs, now = new Date()) {
  /** @type {string[]} */
  const withdrawn = [];
  let names = [];
  try { names = fs.readdirSync(paths.runsRoot()); } catch {}
  for (const name of names) {
    if (!validRunId(name)) continue;
    let run;
    try { run = getRun(name); } catch { continue; }
    if (!run.standing || run.proposalsOpenedAt || ACTIVE_STATES.has(run.state) || !run.endedAt) continue;
    if (now.getTime() - Date.parse(run.endedAt) < afterMs) continue;
    let any = false;
    for (const record of proposals.listProposals(run.shadow.stateDir)) {
      if ((record.status || "pending") !== "pending") continue;
      proposals.markProposal(run.shadow.stateDir, record.id, "withdrawn");
      any = true;
    }
    if (any) withdrawn.push(run.id);
  }
  return withdrawn;
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
  ensureShadowFrozen(run);
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
  // The group-gone signal (see putBackRun): staging moves engine-named bytes
  // into the run's tree — frozen/ once the run froze it — so nothing of the
  // engine may still be racing it, and the shadow must be frozen first.
  if (run.engineExited === false) {
    throw runError("engine_alive", "The engine's process group has not been confirmed gone; its changes are not final.", 409);
  }
  ensureShadowFrozen(run);
  gatherProposals(run, { quiet: true });
  const record = proposals.findProposal(run.shadow.stateDir, proposalId);
  if (!record) throw runError("proposal_unknown", "No proposal has that id.", 404);
  if (record.status && record.status !== "pending") {
    throw runError("proposal_settled", `This proposal was already ${record.status}.`, 409);
  }
  /** @type {string[]} */
  let staged = [];
  /** @type {Array<{ name: string, reason: string }>} */
  let refused = [];
  if (record.kind === "restore") {
    if (!run.folderId) throw runError("task_no_folder", "This task lent documents only; there is no shared folder to stage a restore into.", 409);
    const grant = folders.resolveFolder(run.folderId);
    const level = folders.capLevel(run.level, grant.level);
    if (fs.realpathSync(grant.path) !== run.shadow.realRoot) {
      throw runError("folder_changed", "The shared folder is no longer the one this run cloned.", 409);
    }
    if (level === "read") {
      throw runError("read_only", "This folder was shared read-only; nothing can be put back, so there is nothing to stage.", 403);
    }
    ({ staged, refused } = proposals.stageRestore(run.shadow, record));
    if (!run.fromDisk) emitChanges(run);
  }
  proposals.markProposal(run.shadow.stateDir, proposalId, "accepted");
  return { runId: run.id, id: record.id, kind: record.kind, accepted: true, staged, refused };
}

/**
 * The page's answer to one desk-tools call (desk-tools.js). Only a live run
 * whose channel is open takes one, and each call is answered once; the
 * server caps what reaches the engine.
 * @param {string} id
 * @param {string} requestId
 * @param {{ ok?: unknown, result?: unknown, error?: unknown }} body
 */
function answerDeskRequest(id, requestId, body) {
  const run = getRun(id);
  if (!run.desk || run.desk.closed || !ACTIVE_STATES.has(run.state)) {
    throw runError("desk_closed", "This run has no open desk-tools channel.", 409);
  }
  const settled = run.desk.answer(String(requestId || ""), body || {});
  if (!settled) throw runError("desk_request_unknown", "No desk-tools call with that id is waiting.", 404);
  return { runId: run.id, ...settled };
}

/**
 * The writer's answer to one connector_ask of a live run.
 * @param {string} id
 * @param {string} askId
 * @param {{ allow?: unknown }} body
 */
function answerConnectorAsk(id, askId, body) {
  const run = getRun(id);
  if (!run.gateway || !ACTIVE_STATES.has(run.state)) {
    throw runError("connectors_closed", "This run has no connector waiting for an answer.", 409);
  }
  const allow = body?.allow === true;
  if (!run.gateway.answer(String(askId || ""), allow)) {
    throw runError("connector_ask_unknown", "No connector call with that id is waiting.", 404);
  }
  emit(run, "connector_answer", { askId: String(askId), allow });
  return { runId: run.id, askId: String(askId), allow };
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
    let withdrawnProposals = 0;
    if (run.standing) {
      try { withdrawnProposals = proposals.listProposals(run.shadow.stateDir).filter((record) => record.status === "withdrawn").length; } catch {}
    }
    out.push({ ...summary(run), pendingChanges, pendingProposals, ...(run.standing ? { withdrawnProposals } : {}) });
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * Which engines have a key in the Keychain (LM Studio needs none). Claude
 * Code counts only when its adapter and CLI are installed at the pinned
 * versions (paths.claudeEngineStatus) and a credential is there.
 */
async function engineKeys() {
  const has = async (engine) => Boolean(await seams.resolveKey(engine).catch(() => ""));
  const claudeCode = seams.claudeEngineStatus().installed && await has("claude-code");
  const codex = seams.codexEngineStatus().installed && seams.codexLoggedIn();
  return { deepseek: await has("deepseek"), anthropic: await has("anthropic"), lmstudio: true, "claude-code": claudeCode, codex };
}

/** Test seam: swap the engine, key lookup, trash and clone method. */
function configureRunsForTests(overrides = {}) {
  Object.assign(seams, overrides);
}

function resetRunsForTests() {
  for (const run of runs.values()) {
    run.desk?.close();
    void run.gateway?.close();
    void run.egress?.close();
  }
  runs.clear();
  seams.startEngine = engineHost.startEngine;
  seams.resolveKey = defaultResolveKey;
  seams.normalizeConnectors = connectorGateway.normalizeConnectors;
  seams.startEgress = (input) => require("./egress-proxy.js").startEgressProxy(input);
  seams.claudeEngineStatus = () => paths.claudeEngineStatus();
  seams.codexEngineStatus = () => paths.codexEngineStatus();
  seams.codexLoggedIn = () => fs.existsSync(paths.codexLoginFile());
  seams.forceCopy = false;
  seams.trash = undefined;
}

module.exports = {
  withdrawStaleProposals,
  ACTIVE_STATES,
  acceptProposalRun,
  activeUnattendedCount,
  answerDeskRequest,
  answerConnectorAsk,
  assertRewindable,
  configureRunsForTests,
  createRun,
  discardProposalRun,
  discardRun,
  engineKeys,
  getRun,
  listProposalsRun,
  listRuns,
  onRunFinished,
  putBackRun,
  resetRunsForTests,
  rewindRun,
  runChanges,
  runObjectFiles,
  postHostProposal,
  runLedger,
  runOutcome,
  stopRun,
  stopRunsForFolder,
  subscribe,
};
