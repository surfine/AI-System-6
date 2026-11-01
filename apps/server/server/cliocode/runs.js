// ClioCode runs: one prompt, the writer's real code folder, one engine child,
// one checkpoint ledger.
//
// Unlike the ClioTalk agent (agent/runs.js) a ClioCode run has no shadow and
// no put-back: the engine works in place over a granted folder, its writes
// gated by the run's permission mode (cliocode/permissions.js, answered from
// the mode table) and fenced by the code Seatbelt profile
// (cliocode/sandbox-profile.js) and the code egress filter (cliocode/egress.js).
// The undo is the checkpoint ledger:
//
//   Before the host answers dsh's permission request for a call that writes or
//   deletes (the handler's beforeAllow), it snapshots exactly the files that
//   call names — content and mode, or "did not exist" — into the run's
//   server-owned state folder (never inside the project), capped in files and
//   bytes. A snapshot that cannot be made — over a cap, a link on the path, an
//   `.env*` layer — refuses the call: no file of the project changes without
//   its checkpoint.
//
//   Rewind restores one checkpoint's files — the bytes and mode a file had,
//   or the deletion of a file the call created — and trims the ledger forward
//   of it. It refuses a path outside the project (after resolving links, the
//   same no-link belt as the harness's put-back, agent/shadow.js
//   noLinkWriteTarget) and refuses while the engine still runs.
//
// M9.4: every package-manager cache (npm, yarn, pnpm, corepack, cargo, go,
// pip) points into the run's temp through the child environment — the profile
// denies writes everywhere but the project and the temp, and the defaults
// (~/.npm and friends) sit outside both.
//
// M9.5: a command that must run outside the sandbox is run by the HOST, not by
// dsh — a separate child of this server spawned WITHOUT the Seatbelt wrapper
// (runExternalCommand), only after the writer approved that exact command
// through the permission round-trip (askWriter + answerPermission on the
// per-boot-token route), once per command: a session allow never covers it.
// The approval and the output land in the run's events.
//
// The run's own DSH_HOME sits inside its temp root (the profile's second
// writable), so dsh can write sessions and storages without the profile naming
// anything but the project and the temp; the home dies with the run. Run
// metadata goes to runs/<run>/run.json so rewind and the event log survive a
// server restart; the live permission waits are in memory only.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const paths = require("../agent/paths.js");
const folders = require("../agent/folders.js");
const shadowFs = require("../agent/shadow.js");
const engineHost = require("../agent/engine-host.js");
const dshHomeModule = require("../agent/dsh-home.js");
const { EVENT_LOG_FULL, createEventBudget, doneEvent, translateUpdate } = require("../agent/acp-events.js");
const { MODES } = require("./permission-modes.js");
const { createCodePermissionHandler } = require("./permissions.js");
const { buildCodeSandboxProfile, resolveSecretPaths, resolveToolchain } = require("./sandbox-profile.js");
const { codeAllowedHosts, codeHostAllowed, startCodeEgressProxy } = require("./egress.js");

const MAX_ACTIVE_RUNS = 2;
const MAX_EVENTS = 4000;
const RUN_TIMEOUT_MS = Math.max(60_000, Number(process.env.AI_SYSTEM6_CLIOCODE_RUN_TIMEOUT_MS || 30 * 60_000));
const EVENT_LOG = "events.jsonl";
const ACTIVE_STATES = new Set(["starting", "running", "stopping"]);
/** The actions whose allow must first snapshot what it touches. */
const WRITING_ACTIONS = new Set(["edit", "delete"]);
/** Per-checkpoint caps: how much one tool call's snapshot may carry. */
const MAX_CHECKPOINT_FILES = 64;
const MAX_CHECKPOINT_BYTES = 32 * 1024 * 1024;
/** The model provider and web-search hosts a run's egress filter must admit. */
const ENGINE_HOSTS = Object.freeze({
  deepseek: Object.freeze(["api.deepseek.com"]),
  anthropic: Object.freeze(["api.anthropic.com"]),
  lmstudio: Object.freeze([]),
});

/**
 * The package-manager caches a run points into its own temp
 * (docs/CLIOCODE-DESIGN.md, "node_modules, package managers"): the Seatbelt
 * profile denies writes everywhere but the project folder and the run's temp,
 * so the defaults (~/.npm, ~/Library/Cargo, GOCACHE under ~/Library) would
 * refuse every download. Each name's value is a path relative to
 * <run temp>/caches; pnpm's store sits inside its PNPM_HOME, as the design
 * spells it.
 */
const PACKAGE_MANAGER_CACHES = Object.freeze({
  npm_config_cache: "npm",
  YARN_CACHE_FOLDER: "yarn",
  PNPM_HOME: "pnpm",
  npm_config_store_dir: "pnpm/store",
  COREPACK_HOME: "corepack",
  CARGO_HOME: "cargo",
  GOCACHE: "go-build",
  GOMODCACHE: "go-mod",
  PIP_CACHE_DIR: "pip",
});

/**
 * @param {string} tmp the run's temp dir (the profile's second writable)
 * @returns {Record<string, string>} the child-environment names → cache dirs
 */
function packageManagerCacheEnv(tmp) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const [name, relative] of Object.entries(PACKAGE_MANAGER_CACHES)) {
    env[name] = path.join(tmp, "caches", relative);
  }
  return env;
}

/** How long one approved outside-sandbox command may run (M9.5). */
function externalTimeoutMs() {
  return Math.max(1_000, Number(process.env.AI_SYSTEM6_CLIOCODE_EXTERNAL_TIMEOUT_MS || 10 * 60_000));
}
/** The output one outside-sandbox command may leave in the run's events. */
const MAX_EXTERNAL_OUTPUT_BYTES = 128 * 1024;

/**
 * @typedef {object} Run
 * @property {string} id
 * @property {string} folderId
 * @property {string} folderName
 * @property {string} folderPath   realpath of the granted code folder
 * @property {string} level        the grant's level, capped
 * @property {string} mode         the permission mode in force (read on every call)
 * @property {string} engine
 * @property {string} model
 * @property {string} [language]
 * @property {string} prompt
 * @property {string} state
 * @property {string} createdAt
 * @property {string} [endedAt]
 * @property {string} [error]
 * @property {string} [sessionId]
 * @property {string} stateDir     cliocode/runs/<run> — the server-owned state
 * @property {string} tmp          stateDir/tmp — the engine's TMPDIR, caches and DSH_HOME
 * @property {string} toolchainPath  the PATH the resolved toolchain was found on (engine and outside-sandbox children)
 * @property {number} checkpointSeq
 * @property {import("node:child_process").ChildProcess | null} externalChild
 *                                  the approved outside-sandbox command while it runs
 * @property {Array<{ seq: number, type: string, at: string, data: any }>} events
 * @property {number} seq
 * @property {Set<(event: any) => void>} listeners
 * @property {Map<string, (choice: string) => void>} pendingAsks
 * @property {any} [engineHandle]
 * @property {boolean} [engineExited] false while a stopped child has not exited
 * @property {{ port: number, close: () => Promise<void> }} [egress]
 * @property {ReturnType<typeof createEventBudget>} [budget]
 * @property {{ used: number, size: number } | null} usage
 * @property {boolean} [fromDisk]
 */

/** @type {Map<string, Run>} */
const runs = new Map();

const seams = {
  startEngine: engineHost.startEngine,
  /** @param {string} engine @returns {Promise<string>} */
  resolveKey: defaultResolveKey,
  /** @type {(input?: { extraHosts?: string[] }) => Promise<{ port: number, close: () => Promise<void> }>} */
  startEgress: (input) => startCodeEgressProxy(input),
  /** @type {{ files: number, bytes: number }} */
  checkpointCaps: { files: MAX_CHECKPOINT_FILES, bytes: MAX_CHECKPOINT_BYTES },
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

/** The ClioCode run state under the agent home: server-owned, never /tmp. */
function runsRoot() {
  return path.join(paths.agentHome(), "cliocode", "runs");
}

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function runError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/** @param {string} code  an error with a checkpoint-flavoured code (a refused snapshot) */
function checkpointError(code, message) {
  return runError(code, message, 409);
}

/** @param {string} id */
function validRunId(id) {
  return /^code-[0-9a-f-]{36}$/.test(String(id || ""));
}

/** @param {string} mode */
function normalizeMode(mode) {
  return MODES.includes(String(mode || "")) ? String(mode) : "";
}

/** @param {Run} run */
function summary(run) {
  return {
    runId: run.id,
    folderId: run.folderId,
    folderName: run.folderName,
    folderPath: run.folderPath,
    // The session list's name for the run: the first line of what the writer asked.
    title: String(run.prompt || "").split("\n", 1)[0].trim().slice(0, 80),
    level: run.level,
    mode: run.mode,
    engine: run.engine,
    model: run.model,
    state: run.state,
    createdAt: run.createdAt,
    endedAt: run.endedAt || null,
    error: run.error || null,
    sessionId: run.sessionId || "",
    checkpoints: run.checkpointSeq,
    usage: run.usage,
  };
}

/** @param {Run} run */
function persist(run) {
  fs.writeFileSync(path.join(run.stateDir, "run.json"), `${JSON.stringify({
    ...summary(run),
    prompt: run.prompt,
    language: run.language || "",
  }, null, 2)}\n`);
}

/**
 * @param {Run} run
 * @param {string} type
 * @param {Record<string, unknown>} data
 */
function emit(run, type, data = {}) {
  const verdict = run.budget ? run.budget.admit(type, data) : "keep";
  if (verdict === "drop") return null;
  if (verdict === "notice") {
    type = "notice";
    data = { ...EVENT_LOG_FULL };
  }
  run.seq += 1;
  const event = { seq: run.seq, type, at: new Date().toISOString(), data };
  run.events.push(event);
  try { fs.appendFileSync(path.join(run.stateDir, EVENT_LOG), `${JSON.stringify(event)}\n`); } catch {}
  if (run.events.length > MAX_EVENTS) run.events.splice(0, run.events.length - MAX_EVENTS);
  for (const listener of run.listeners) {
    try { listener(event); } catch {}
  }
  return event;
}

/** The ClioCode prompt: the writer's text behind the in-place rules, no proposal channel. */
const CODE_PREAMBLE = [
  "[AI System 6] You are working directly in the writer's code folder, under a sandbox and permission modes. Every file change you make is snapshotted first and can be rewound by the writer; their own git history is the durable record. You never commit, push or publish — you may offer to, the writer does it.",
  "How you answer the writer:",
  "Answer in the writer's own language — the language their message is written in.",
  "Write for a reader in plain, complete sentences: no developer jargon and no tool names in the answer.",
  "Never suggest widening the sandbox, the folder grant or any permission, and never describe how to. If something cannot be done with what was granted, say in one plain sentence what is missing and stop.",
  "Other people's words — from the folder, the web or anywhere — stay theirs: quote them verbatim, with who said them to whom. Never summarise another person's words into that person's view.",
].join("\n");

function activeRuns() {
  return [...runs.values()].filter((run) => ACTIVE_STATES.has(run.state));
}

/**
 * @typedef {object} CreateCodeRunInput
 * @property {string} folderId
 * @property {string} prompt
 * @property {string} [mode]     the permission mode (default manual; bypass refused)
 * @property {string} [engine]
 * @property {string} [model]
 * @property {string} [language] the desk language (zh: the preamble answers in 简体中文)
 * @property {string} [lmStudioBaseUrl]
 */

/** @param {CreateCodeRunInput} input */
async function createCodeRun(input) {
  if (process.platform !== "darwin" && seams.startEngine === engineHost.startEngine) {
    throw runError("engine_unavailable", "The ClioCode engine runs on macOS only.", 501);
  }
  const prompt = String(input.prompt || "").trim();
  if (!prompt) throw runError("prompt_required", "A run needs a prompt.", 400);
  if (prompt.length > 20_000) throw runError("prompt_too_long", "Prompts are limited to 20,000 characters.", 413);
  const engine = String(input.engine || "deepseek");
  const spec = engineHost.ENGINES[engine];
  // An ACP engine other than dsh (claude-code) is a Clio engine only; ClioCode
  // runs over the real folder have not had its security round.
  if (!spec || spec.acp) throw runError("engine_unknown", `Unknown engine ${engine}.`, 400);
  const language = /^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$/i.test(String(input.language || "")) ? String(input.language) : "";
  const model = String(input.model || spec.defaultModel || "");
  if (engine === "lmstudio" && !model) throw runError("model_required", "LM Studio needs a model identifier.", 400);
  // Bypass is refused outright, before anything is looked up: the writer's
  // real Mac is never an isolated environment.
  const mode = normalizeMode(input.mode) || "manual";
  if (mode === "bypass") {
    throw runError("mode_refused", "Bypass exists only in an isolated environment; a ClioCode run on this Mac never gets it.", 403);
  }
  // An unknown folder is the caller's mistake whatever the engine's state.
  const grant = folders.resolveFolder(input.folderId);
  if (seams.startEngine === engineHost.startEngine && !paths.engineStatus().installed) {
    throw runError("engine_missing", "The ClioCode engine is not installed (run node tooling/build-dsh-slim.mjs).", 503);
  }
  // A ClioCode run edits the folder in place: it needs a change grant. A lower
  // grant runs in Plan mode — read-only, nothing to approve — until the
  // code-folder grant levels land (M9.7).
  const level = grant.level;
  const effectiveMode = level === "change" ? mode : "plan";
  if (activeRuns().length >= MAX_ACTIVE_RUNS) throw runError("too_many_runs", "Two runs are already working; stop one first.", 429);
  if (activeRuns().some((run) => run.folderId === grant.id)) {
    throw runError("folder_busy", "A run is already working in this folder.", 409);
  }
  const key = await seams.resolveKey(engine);
  if (spec.vault && !key) {
    throw runError("engine_key_missing", `No ${spec.vault.provider} key is in the Keychain; add one in Control Panel.`, 409);
  }

  const id = `code-${crypto.randomUUID()}`;
  const stateDir = path.join(runsRoot(), id);
  const tmp = path.join(stateDir, "tmp");
  paths.assertNotTemporary(stateDir);
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(tmp, { recursive: true, mode: 0o700 });
  // The package-manager caches exist before anything runs (M9.4): every cache
  // a tool expects is inside the run's temp, the profile's second writable.
  for (const dir of new Set(Object.values(packageManagerCacheEnv(tmp)))) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const dshHome = dshHomeModule.seedDshHome(path.join(tmp, dshHomeModule.HOME_NAME));
  /** @type {Run} */
  const run = {
    id,
    folderId: grant.id,
    folderName: grant.name,
    folderPath: fs.realpathSync(grant.path),
    level,
    mode: effectiveMode,
    engine,
    model,
    language,
    prompt,
    state: "starting",
    createdAt: new Date().toISOString(),
    stateDir,
    tmp,
    toolchainPath: "",
    checkpointSeq: 0,
    externalChild: null,
    events: [],
    seq: 0,
    listeners: new Set(),
    pendingAsks: new Map(),
    usage: null,
    budget: createEventBudget(),
  };
  runs.set(id, run);
  persist(run);
  emit(run, "status", { state: "starting", mode: run.mode, engine, model, folderName: grant.name, folderPath: run.folderPath });
  void drive(run, { key, dshHome, lmStudioBaseUrl: input.lmStudioBaseUrl });
  return summary(run);
}

/**
 * @param {Run} run
 * @param {{ key: string, dshHome: string, lmStudioBaseUrl?: string }} options
 */
async function drive(run, options) {
  const logFile = path.join(run.stateDir, "engine.log");
  const log = (/** @type {string} */ line) => {
    try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${engineHost.redact(line)}\n`); } catch {}
  };
  const lmPort = (() => {
    try { return Number(new URL(options.lmStudioBaseUrl || "http://127.0.0.1:1234").port) || 1234; } catch { return 1234; }
  })();
  const realWork = fs.realpathSync(run.folderPath);
  const timer = setTimeout(() => {
    emit(run, "error", { code: "run_timeout", message: `The run passed ${Math.round(RUN_TIMEOUT_MS / 60_000)} minutes and was stopped.` });
    void stopRun(run.id, "error");
  }, RUN_TIMEOUT_MS);
  timer.unref?.();
  // Whether the writer holds a DeepSeek key at all: another engine's web
  // search rides it (the same rule as the ClioTalk agent), and its host rides
  // the run's filter then too.
  const deepseekKey = await seams.resolveKey("deepseek").catch(() => "");
  const extraKeys = run.engine !== "deepseek" && deepseekKey ? { DEEPSEEK_API_KEY: deepseekKey } : {};
  const egressHosts = [...ENGINE_HOSTS[run.engine] || []];
  if (run.engine !== "deepseek" && deepseekKey && !egressHosts.includes(ENGINE_HOSTS.deepseek[0])) {
    egressHosts.push(ENGINE_HOSTS.deepseek[0]);
  }
  try {
    // The run's own filter: the profile closes every outbound address but this
    // one loopback port, and the filter admits only the allowlisted hosts.
    run.egress = await seams.startEgress({ extraHosts: egressHosts });
    // The developer's real toolchain, resolved once per run: the profile's
    // exec allowlist names it, and the child gets exactly the PATH it was
    // resolved on (the running Node's directory first).
    const toolchain = resolveToolchain({ node: process.execPath, path: process.env.PATH, home: os.homedir(), shell: process.env.SHELL, env: process.env });
    run.toolchainPath = toolchain.path;
    const handle = await seams.startEngine({
      engine: run.engine,
      model: run.model,
      language: run.language,
      work: run.folderPath,
      tmp: run.tmp,
      dshHome: options.dshHome,
      readOnly: false,
      stateDir: run.stateDir,
      key: options.key,
      // Web search is DeepSeek's: another engine gets that key for it only
      // when the writer has one (the same rule as the ClioTalk agent).
      extraKeys,
      lmStudioBaseUrl: options.lmStudioBaseUrl,
      // Every proxy variable points at the run's own filter, and its port is
      // the only loopback address the profile opens (plus LM Studio's, when
      // this is an LM Studio run).
      egressPort: run.egress ? run.egress.port : 0,
      loopbackPorts: run.engine === "lmstudio" ? [lmPort] : [],
      mcpServers: [],
      posture: path.join(__dirname, "patches", "posture.yml"),
      preamble: CODE_PREAMBLE,
      // The PATH the toolchain was resolved on, and every package-manager
      // cache inside the run's temp (M9.4): the profile denies writes
      // everywhere but the project and the temp, so the defaults are refused.
      extraEnv: { PATH: toolchain.path, ...packageManagerCacheEnv(run.tmp) },
      sandboxProfile: (input) => buildCodeSandboxProfile({
        project: input.work,
        tmp: input.tmp,
        home: input.home,
        node: input.node,
        secretPaths: resolveSecretPaths(input.home),
        execLiterals: toolchain.literals,
        execRoots: toolchain.roots,
        extraExec: [input.install],
        loopbackPorts: input.loopbackPorts,
      }),
      permissionHandler: createCodePermissionHandler({
        project: run.folderPath,
        home: fs.realpathSync(os.homedir()),
        mode: () => run.mode,
        allowHost: (host) => hostOnRunAllowlist(run, host),
        ask: (request) => askWriter(run, request),
        beforeAllow: (request) => beforeAllow(run, request),
        // M9.5: an approved outside-sandbox command is run by the host, as a
        // separate child without the Seatbelt wrapper, exactly once per
        // approval.
        runExternal: (request) => runExternalCommand(run, request),
        onDecision: (record) => emit(run, "permission", record),
      }),
      onUpdate: (update) => {
        const context = { work: realWork };
        for (const event of translateUpdate(update, context)) {
          if (event.type === "usage") run.usage = { used: Number(event.used), size: Number(event.size) };
          const { type, ...data } = event;
          emit(run, type, data);
        }
      },
      log,
    });
    run.engineHandle = handle;
    run.sessionId = handle.sessionId;
    if (run.state !== "starting") {
      await endEngine(run);
      return;
    }
    run.state = "running";
    persist(run);
    emit(run, "status", { state: "running", sessionId: handle.sessionId });
    const result = await handle.prompt(run.prompt);
    if (ACTIVE_STATES.has(run.state)) {
      await endEngine(run);
    }
    if (ACTIVE_STATES.has(run.state)) {
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
    await closeEgress(run);
  }
}

/** Is `host` on this run's filter allowlist (defaults + the run's own hosts)? @param {Run} run @param {string} host */
function hostOnRunAllowlist(run, host) {
  return codeHostAllowed(host, codeAllowedHosts(ENGINE_HOSTS[run.engine] || []));
}

/** Close and forget the run's egress filter. @param {Run} run */
async function closeEgress(run) {
  const filter = run.egress;
  run.egress = null;
  if (filter) {
    try { await filter.close(); } catch {}
  }
}

/**
 * The writer is asked: hold the answer until the permission route delivers it
 * (or the run is stopped). While nobody answers, dsh waits — nothing runs.
 * @param {Run} run
 * @param {import("./permissions.js").PermissionRequest} request
 * @returns {Promise<string>}
 */
function askWriter(run, request) {
  return new Promise((resolve) => {
    run.pendingAsks.set(request.toolCallId, resolve);
    emit(run, "permission_request", { ...request });
  });
}

/**
 * The writer answered. The choice goes to the waiting ask; an unknown
 * toolCallId, or an ask already answered, is refused.
 * @param {string} id
 * @param {string} toolCallId
 * @param {string} decision
 */
function answerPermission(id, toolCallId, decision) {
  const run = getRun(id);
  const choice = String(decision || "");
  if (!["allow", "allow_session", "deny"].includes(choice)) {
    throw runError("bad_decision", "A decision is allow, allow_session or deny.", 400);
  }
  const resolve = run.pendingAsks.get(String(toolCallId || ""));
  if (!resolve) throw runError("permission_unknown", "No permission request is waiting with that id.", 404);
  run.pendingAsks.delete(String(toolCallId || ""));
  resolve(choice);
  return { runId: run.id, toolCallId: String(toolCallId || ""), decision: choice };
}

/**
 * The checkpoint gate: after an allow is decided and before dsh hears it,
 * snapshot the files the call will touch. Called for every allow; only a
 * writing call snapshots anything.
 * @param {Run} run
 * @param {import("./permissions.js").PermissionRequest} request
 */
function beforeAllow(run, request) {
  if (!WRITING_ACTIONS.has(request.action)) return;
  checkpointForCall(run, request);
}

/**
 * Snapshot the files one allowed writing call will touch: content and mode,
 * or "did not exist", into the run's server-owned state (never inside the
 * project), capped in files and bytes. Everything refuses whole — a call whose
 * snapshot cannot be made is not allowed to change the folder.
 * @param {Run} run
 * @param {import("./permissions.js").PermissionRequest} request
 */
function checkpointForCall(run, request) {
  const caps = seams.checkpointCaps;
  const named = [...new Set((request.paths || []).map((p) => String(p || "")))].filter(Boolean);
  if (!named.length) throw checkpointError("checkpoint_empty", "The call names no file to snapshot.");
  if (named.length > caps.files) throw checkpointError("checkpoint_too_many_files", `A checkpoint carries at most ${caps.files} files.`);
  /** @type {Array<{ path: string, abs: string, existed: boolean, mode: number | null, bytes: number }>} */
  const files = [];
  let total = 0;
  for (const abs of named) {
    const rel = shadowFs.safeRelative(path.relative(run.folderPath, path.resolve(abs)));
    // The handler refused outside paths already; the checkpoint refuses again,
    // and never carries an environment layer into server state.
    if (shadowFs.isEnvLayer(rel.split("/").pop() || "")) {
      throw checkpointError("env_layer_refused", "Environment layers are never read or written by ClioCode.");
    }
    let stat = null;
    try {
      stat = fs.lstatSync(abs);
    } catch (error) {
      if (/** @type {any} */ (error)?.code !== "ENOENT") throw checkpointError("checkpoint_refused", `${rel}: ${String(/** @type {any} */ (error)?.message || error)}`);
    }
    if (stat) {
      if (stat.isSymbolicLink()) throw checkpointError("link_refused", `${rel} is a link and is never snapshotted.`);
      if (!stat.isFile()) throw checkpointError("not_a_file", `${rel} is not a regular file.`);
      total += stat.size;
      if (total > caps.bytes) throw checkpointError("checkpoint_too_large", `A checkpoint carries at most ${Math.round(caps.bytes / 1024 / 1024)} MiB.`);
    }
    files.push({ path: rel, abs, existed: Boolean(stat), mode: stat ? stat.mode & 0o777 : null, bytes: stat ? stat.size : 0 });
  }
  const seq = run.checkpointSeq + 1;
  const dir = path.join(run.stateDir, "checkpoints", String(seq));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const manifest = {
    id: seq,
    at: new Date().toISOString(),
    toolCallId: String(request.toolCallId || ""),
    action: request.action,
    title: String(request.title || ""),
    files: [],
  };
  for (const file of files) {
    /** @type {{ path: string, existed: boolean, mode: number | null, bytes: number, sha256: string | null }} */
    const entry = { path: file.path, existed: file.existed, mode: file.mode, bytes: file.bytes, sha256: null };
    if (file.existed) {
      // Read without following a link (a swap between the lstat and the open
      // fails the open) — these bytes are what rewind will restore.
      const fd = fs.openSync(file.abs, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      try {
        const opened = fs.fstatSync(fd);
        if (!opened.isFile()) throw checkpointError("not_a_file", `${file.path} is not a regular file.`);
        const bytes = fs.readFileSync(fd);
        entry.bytes = bytes.length;
        entry.sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
        const store = path.join(dir, ...file.path.split("/"));
        fs.mkdirSync(path.dirname(store), { recursive: true, mode: 0o700 });
        fs.writeFileSync(store, bytes, { mode: 0o600 });
      } finally {
        fs.closeSync(fd);
      }
    }
    manifest.files.push(entry);
  }
  fs.writeFileSync(path.join(run.stateDir, "checkpoints", `${seq}.json`), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  run.checkpointSeq = seq;
  emit(run, "checkpoint", {
    id: seq,
    toolCallId: manifest.toolCallId,
    action: manifest.action,
    files: manifest.files.map((file) => ({ path: file.path, existed: file.existed, bytes: file.bytes })),
  });
}

/** Signal the process group `pid` leads, best effort. @param {number} pid @param {NodeJS.Signals} signal */
function signalGroup(pid, signal) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  try { process.kill(-pid, signal); } catch {}
}

/**
 * Run one approved outside-sandbox command (M9.5): a separate child of this
 * server, spawned WITHOUT the Seatbelt wrapper — the one thing the sandbox
 * itself cannot do, which is why the writer approves this exact command every
 * time (the handler refuses without its runner, and a session allow never
 * covers this row). The child gets the run's own environment (the toolchain
 * PATH, the temp as TMPDIR, the caches inside it), not the server's; its
 * output is redacted, capped and recorded on the run's events. A command that
 * outlives its timeout has its whole process group signalled, as the engine's
 * group is.
 * @param {Run} run
 * @param {import("./permissions.js").PermissionRequest} request
 * @returns {Promise<{ exitCode: number | null, timedOut: boolean, output: string }>}
 */
async function runExternalCommand(run, request) {
  if (!ACTIVE_STATES.has(run.state)) {
    throw runError("run_not_active", "The run is no longer working; nothing is executed.", 409);
  }
  const command = String(request.command || "").trim();
  if (!command) throw runError("external_command_required", "An outside-sandbox execution needs a command.", 400);
  // The call's cwd, when it names one, was classified inside the project
  // (anything else is refused as outsideProject before this runs); belt and
  // braces again here.
  const cwd = typeof request.cwd === "string" && request.cwd
    && isInsidePath(request.cwd, run.folderPath) ? request.cwd : run.folderPath;
  const env = {
    PATH: run.toolchainPath || "/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: os.homedir(),
    LANG: String(process.env.LANG || "en_US.UTF-8"),
    TMPDIR: `${run.tmp}/`,
    ...packageManagerCacheEnv(run.tmp),
  };
  // Detached: the command leads its own process group, so the timeout (and a
  // stop) reaches every process it spawned, the way the engine's group is
  // killed.
  const child = spawn("/bin/sh", ["-c", command], { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  run.externalChild = child;
  /** @type {Buffer[]} */
  const chunks = [];
  let captured = 0;
  const collect = (/** @type {Buffer} */ chunk) => {
    if (captured >= MAX_EXTERNAL_OUTPUT_BYTES) return;
    chunks.push(chunk.subarray(0, MAX_EXTERNAL_OUTPUT_BYTES - captured));
    captured += chunk.length;
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const exit = await new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    const settle = (/** @type {{ exitCode: number | null, timedOut: boolean }} */ report) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(report);
    };
    child.on("close", (code) => settle({ exitCode: code, timedOut }));
    child.on("error", () => settle({ exitCode: -1, timedOut }));
    // A command that outlives its timeout: SIGTERM to the group, SIGKILL after
    // the grace, and the report only once the whole group is gone — the
    // discipline the engine's process group gets (engine-host.js
    // stopProcessGroup, which caps the wait itself). A command that dies only
    // because of the timeout is reported as timed out whatever its signal.
    const timeout = setTimeout(() => {
      timedOut = true;
      signalGroup(child.pid, "SIGTERM");
      void engineHost.stopProcessGroup(child.pid, 3_000).then(() => settle({ exitCode: null, timedOut: true }));
    }, externalTimeoutMs());
    timeout.unref?.();
  });
  run.externalChild = null;
  const output = engineHost.redact(Buffer.concat(chunks).toString("utf8")).slice(0, MAX_EXTERNAL_OUTPUT_BYTES);
  emit(run, "command_output", {
    command,
    cwd,
    external: true,
    exitCode: exit.exitCode,
    timedOut: exit.timedOut,
    output,
  });
  return exit;
}

/** `child` inside `parent`, lexically (defense in depth; the kernel holds too). @param {string} child @param {string} parent */
function isInsidePath(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** @param {Run} run @param {string} state @param {string} [error] */
function finish(run, state, error) {
  if (!ACTIVE_STATES.has(run.state)) return;
  run.state = state;
  run.endedAt = new Date().toISOString();
  if (error) run.error = error;
  persist(run);
}

/**
 * Close the engine and wait for its process to exit (bounded by engine-host).
 * @param {Run} run
 */
async function endEngine(run) {
  const handle = run.engineHandle;
  if (!handle) return;
  const outcome = await handle.close();
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
  // After a restart: the run's state, ledger and log are still on disk. An
  // engine that was mid-run is gone with the server (its stdin closed); the
  // run comes back stopped, its folder as it stands — the writer rewinds or
  // discards it.
  const stateDir = path.join(runsRoot(), id);
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(stateDir, "run.json"), "utf8"));
  } catch {
    throw runError("run_unknown", "No run has that id.", 404);
  }
  /** @type {Run} */
  const run = {
    id,
    folderId: String(meta.folderId || ""),
    folderName: String(meta.folderName || ""),
    folderPath: String(meta.folderPath || ""),
    level: folders.normalizeLevel(meta.level) || "change",
    mode: normalizeMode(meta.mode) || "manual",
    engine: String(meta.engine || ""),
    model: String(meta.model || ""),
    language: String(meta.language || ""),
    prompt: String(meta.prompt || ""),
    state: ACTIVE_STATES.has(meta.state) ? "stopped" : String(meta.state || "stopped"),
    createdAt: String(meta.createdAt || ""),
    endedAt: meta.endedAt || undefined,
    sessionId: String(meta.sessionId || ""),
    stateDir,
    tmp: path.join(stateDir, "tmp"),
    toolchainPath: "",
    checkpointSeq: highestCheckpoint(stateDir),
    events: readEventLog(stateDir),
    seq: 0,
    listeners: new Set(),
    pendingAsks: new Map(),
    externalChild: null,
    usage: meta.usage || null,
    fromDisk: true,
  };
  run.seq = run.events.length ? run.events[run.events.length - 1].seq : 0;
  runs.set(id, run);
  return run;
}

/** The highest checkpoint id recorded on disk, 0 when none. @param {string} stateDir */
function highestCheckpoint(stateDir) {
  let highest = 0;
  try {
    for (const name of fs.readdirSync(path.join(stateDir, "checkpoints"))) {
      const n = Number(/^(\d+)(?:\.json)?$/.exec(name)?.[1]);
      if (Number.isInteger(n) && n > highest) highest = n;
    }
  } catch {}
  return highest;
}

/**
 * @param {string} stateDir
 * @param {number} wanted
 */
function readCheckpoint(stateDir, wanted) {
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(stateDir, "checkpoints", `${wanted}.json`), "utf8"));
  } catch {}
  if (!manifest || !Number.isInteger(manifest.id) || manifest.id !== wanted || !Array.isArray(manifest.files)) {
    throw runError("checkpoint_unknown", "No checkpoint has that id in this run.", 404);
  }
  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string" || typeof file.existed !== "boolean") {
      throw runError("checkpoint_unknown", "This run's checkpoint record is damaged.", 409);
    }
  }
  return manifest;
}

/** A run's checkpoint ledger, oldest first (the timeline the window shows). @param {string} id */
function listCheckpoints(id) {
  const run = getRun(id);
  /** @type {any[]} */
  const checkpoints = [];
  for (let seq = 1; seq <= run.checkpointSeq; seq += 1) {
    try {
      const manifest = readCheckpoint(run.stateDir, seq);
      checkpoints.push({
        id: manifest.id,
        at: manifest.at,
        toolCallId: manifest.toolCallId,
        action: manifest.action,
        title: manifest.title || "",
        files: manifest.files.map((file) => ({ path: file.path, existed: file.existed, bytes: file.bytes })),
      });
    } catch {}
  }
  return { runId: run.id, state: run.state, checkpoints };
}

/**
 * Rewind to a checkpoint: restore exactly its files — the bytes and mode a
 * file had, or the deletion of a file the call created — then trim the ledger
 * forward of it. Every path is validated before anything lands: inside the
 * project, no link anywhere on it (the belt the harness's put-back carries,
 * shadow.js noLinkWriteTarget), no unsafe name, no environment layer. A
 * running engine refuses: its next write would race the restore.
 * @param {string} id
 * @param {{ toCheckpoint?: number }} body
 */
function rewindRun(id, body) {
  const run = getRun(id);
  if (ACTIVE_STATES.has(run.state)) {
    throw runError("run_active", "The engine is still working; stop it or wait for it to finish before rewinding.", 409);
  }
  if (run.engineExited === false) {
    throw runError("engine_alive", "The engine's process group has not been confirmed gone; the folder is not settled.", 409);
  }
  const wanted = Number(body?.toCheckpoint);
  if (!Number.isInteger(wanted) || wanted < 1) {
    throw runError("checkpoint_required", "Name the checkpoint to rewind to: { toCheckpoint: <id> }.", 400);
  }
  const manifest = readCheckpoint(run.stateDir, wanted);
  // The grant is checked again now: an ejected folder rewinds nothing.
  const grant = folders.resolveFolder(run.folderId);
  if (!run.folderPath || fs.realpathSync(grant.path) !== run.folderPath) {
    throw runError("folder_changed", "The granted folder is no longer the one this run works on.", 409);
  }
  const project = run.folderPath;
  const rels = manifest.files.map((file) => shadowFs.safeRelative(file.path));
  // Validate every target before anything lands: a rewind never writes (or
  // unlinks) a path outside the project, however its record spells it.
  for (const rel of rels) {
    if (shadowFs.isEnvLayer(rel.split("/").pop() || "")) {
      throw runError("bad_path", "Environment layers are never read or written by ClioCode.");
    }
    shadowFs.noLinkWriteTarget(project, rel);
  }
  /** @type {string[]} */
  const restored = [];
  /** @type {string[]} */
  const removed = [];
  const store = path.join(run.stateDir, "checkpoints", String(wanted));
  for (const [index, rel] of rels.entries()) {
    const file = manifest.files[index];
    if (file.existed) {
      // The bytes the checkpoint holds, read without following a link and
      // verified against the digest recorded with them.
      const { bytes } = shadowFs.readNoFollow(store, rel);
      const digest = require("node:crypto").createHash("sha256").update(bytes).digest("hex");
      if (file.sha256 && digest !== file.sha256) {
        throw runError("checkpoint_damaged", "This run's checkpoint store does not match its record; nothing was restored.", 409);
      }
      const target = shadowFs.noLinkWriteTarget(project, rel, { create: true });
      const temp = path.join(path.dirname(target), `.ais6-rewind-${crypto.randomUUID()}`);
      fs.writeFileSync(temp, bytes, { flag: "wx", mode: file.mode ?? 0o666 });
      if (file.mode != null) fs.chmodSync(temp, file.mode);
      // The same belt as a put-back: the directories the rename resolves
      // through are re-verified immediately before it and after it.
      const dirs = shadowFs.directoryChain(project, rel);
      shadowFs.verifyDirectoryChain(dirs, rel);
      fs.renameSync(temp, target);
      shadowFs.verifyDirectoryChain(dirs, rel);
      restored.push(rel);
    } else {
      const target = shadowFs.noLinkWriteTarget(project, rel);
      if (fs.existsSync(target)) fs.unlinkSync(target);
      removed.push(rel);
    }
  }
  trimCheckpointsAfter(run, wanted);
  run.checkpointSeq = wanted;
  persist(run);
  emit(run, "rewind", { toCheckpoint: wanted, restored, removed });
  return { runId: run.id, rewoundTo: wanted, restored, removed };
}

/** Remove every checkpoint after `wanted` (the ledger is trimmed forward of a rewind). @param {Run} run @param {number} wanted */
function trimCheckpointsAfter(run, wanted) {
  const root = path.join(run.stateDir, "checkpoints");
  let names = [];
  try { names = fs.readdirSync(root); } catch { return; }
  for (const name of names) {
    const n = Number(/^(\d+)(?:\.json)?$/.exec(name)?.[1]);
    if (Number.isInteger(n) && n > wanted) fs.rmSync(path.join(root, name), { recursive: true, force: true });
  }
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
  // Nobody is waiting any more: a pending ask resolves to a deny.
  for (const resolve of run.pendingAsks.values()) resolve("deny");
  run.pendingAsks.clear();
  // An approved outside-sandbox command still running dies with the run: its
  // group gets the same signal the engine's group gets.
  if (run.externalChild) signalGroup(run.externalChild.pid, "SIGTERM");
  if (run.engineHandle) {
    await run.engineHandle.cancel();
    await endEngine(run);
  }
  finish(run, finalState);
  emit(run, "status", { state: run.state });
  return summary(run);
}

/**
 * Change the run's permission mode; it takes effect on the next tool call.
 * Bypass is refused (the real Mac is never isolated), and a run on a grant
 * below change stays in Plan mode.
 * @param {string} id
 * @param {string} mode
 */
function setRunMode(id, mode) {
  const run = getRun(id);
  const wanted = normalizeMode(mode);
  if (!wanted) throw runError("bad_mode", `A mode is one of ${MODES.join(", ")}.`, 400);
  if (wanted === "bypass") {
    throw runError("mode_refused", "Bypass exists only in an isolated environment; a ClioCode run on this Mac never gets it.", 403);
  }
  if (run.level !== "change") {
    throw runError("plan_only", "This folder's grant is below change; the run stays in Plan mode.", 403);
  }
  run.mode = wanted;
  persist(run);
  emit(run, "mode", { mode: wanted });
  return summary(run);
}

/** Discard: the run's state (ledger, temp, home, logs) goes; the folder is the writer's. */
async function discardRun(id) {
  const run = getRun(id);
  if (ACTIVE_STATES.has(run.state)) await stopRun(id);
  for (const listener of run.listeners) {
    try { listener({ seq: run.seq + 1, type: "status", at: new Date().toISOString(), data: { state: "discarded" } }); } catch {}
  }
  await closeEgress(run);
  shadowFs.forceRemove(run.stateDir);
  run.state = "discarded";
  runs.delete(id);
  return { runId: id, discarded: true };
}

/**
 * Every run the writer can still act on: live ones and finished ones whose
 * state is still on disk (after a restart too), newest first.
 */
function listRuns() {
  /** @type {Set<string>} */
  const ids = new Set(runs.keys());
  try {
    for (const name of fs.readdirSync(runsRoot())) {
      if (validRunId(name) && fs.existsSync(path.join(runsRoot(), name, "run.json"))) ids.add(name);
    }
  } catch {}
  const out = [];
  for (const id of ids) {
    try { out.push(summary(getRun(id))); } catch {}
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** Which engines have a key in the Keychain (LM Studio needs none). */
async function engineKeys() {
  const has = async (engine) => Boolean(await seams.resolveKey(engine).catch(() => ""));
  return { deepseek: await has("deepseek"), anthropic: await has("anthropic"), lmstudio: true };
}

/** Subscribe to a run's events, replaying those after `afterSeq`. @param {string} id @param {number} afterSeq @param {(event: any) => void} listener */
function subscribe(id, afterSeq, listener) {
  const run = getRun(id);
  for (const event of run.events) if (event.seq > afterSeq) listener(event);
  run.listeners.add(listener);
  return {
    active: ACTIVE_STATES.has(run.state),
    unsubscribe: () => run.listeners.delete(listener),
  };
}

/** One run's summary (the GET /:id answer). @param {string} id */
function runSummary(id) {
  return summary(getRun(id));
}

/** Test seam: swap the engine, key lookup, filter and checkpoint caps. */
function configureRunsForTests(overrides = {}) {
  Object.assign(seams, overrides);
}

function resetRunsForTests() {
  runs.clear();
  seams.startEngine = engineHost.startEngine;
  seams.resolveKey = defaultResolveKey;
  seams.startEgress = (input) => startCodeEgressProxy(input);
  seams.checkpointCaps = { files: MAX_CHECKPOINT_FILES, bytes: MAX_CHECKPOINT_BYTES };
}

module.exports = {
  ACTIVE_STATES,
  PACKAGE_MANAGER_CACHES,
  answerPermission,
  configureRunsForTests,
  createCodeRun,
  discardRun,
  engineKeys,
  getRun,
  listCheckpoints,
  listRuns,
  packageManagerCacheEnv,
  resetRunsForTests,
  rewindRun,
  runSummary,
  setRunMode,
  stopRun,
  subscribe,
};
