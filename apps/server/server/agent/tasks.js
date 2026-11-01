// Agent tasks: a writer's errand held over one or more turns (runs).
//
// Contract: AGENT-TASKS-API (batch 2). A task is { id, title, state, mounts,
// turns, createdAt, usage }; each turn is an existing run (turn id = run id),
// so shadows, levels, freeze/seal, changes, put-back and proposals all stay
// the run machinery's. This file only decides which run a turn starts, at
// what level, and what state the task is in.
//
// Slice 1: create (turn 1), list, get, stop, settle, and the two-task cap.
// Slice 2: further turns (approvePlan, the priorTurns preamble) and the task
// proposal kinds' effect on state (a pending question: awaiting_answer).
// Slice 3: a snapshot of each turn's work/ before its engine starts, and
// rewind. Slice 4: lent documents (object mounts: a projection bundle the page
// uploads, written under the document's own folder name in each turn's base/
// and work/, never put back to disk, read back through projectionAfter),
// several mounts (one folder plus objects, up to four), usage.costEstimate.
//
// Slice 5: refreshed lent documents on a further turn, settle that frees what
// the task kept (snapshots, objects.json; the run records stay), and the
// restart reload.
//
// Slice 6 (round 8): lent documents live under the server's own
// `.ais6-documents/` folder of each turn's tree (shadow.js), apart from every
// real-folder entry; the 200-file cap is shared by all of a task's documents;
// a turn's start, stop and settle take the task's lock in turn, so a stop or
// settle sent while a turn starts waits for it and then ends it; a stopped
// task (a restart included) takes a further turn; a rewind checks every turn
// it would restore before restoring any.
//
// Follow-up queue: while a turn runs (or a plan waits for the writer) the
// writer can add messages to the task. They live in task.queue (the one extra
// field task.json carries; cap MAX_QUEUE) and ride along on the next turn:
// when a turn ends normally one next turn starts by itself with the queued
// words joined in order, each marked as a follow-up; at a plan or a question
// they wait and join the writer's approval or answer. A stop, a failure, a
// settle or a failed start drops the queue (task.queueDropped says so). The
// engine, model and connectors the page sent with the last queued message
// are kept in memory only (connectors are never stored), so the server
// starts the turn without the page.
//
// Long-task harness (2026-10-31). Progress ledger: each turn's engine writes a
// small ledger.json into its proposal channel (engine-host LEDGER_NOTE); the
// run harvests it, and sync keeps it on the turn (turn.ledger). Three turns in
// a row that say stuck or looping, or the same failing step three times, stop
// the task at a "stuck report": a question the host posts for the writer
// (what was tried, where it is stuck, what it needs); task.stuckAfter makes
// the count start again after it. Resume: a task whose turn was working when
// the server died reads as stopped with task.interrupted, and its next turn
// (Continue) carries every earlier turn and ledger in priorTurnsText. Fork:
// forkTask starts a new task from the snapshot turn N found, with turns
// before N as history; the original is not touched.
//
// State is derived, not pushed: a task in planning/working looks at its
// active turn's run whenever it is read, so there is no second lifecycle to
// keep in step with the run's. task.json beside the runs lets a restarted
// server still list its tasks; a turn that was running then reads as stopped
// (runs.getRun loads it so), and the task follows its run like any other.
//
// Out of scope here: cloud tasks. The cloud sandbox (agent-cloud/) keeps one
// run per request with nothing kept on the server, so there is no task to
// hold over turns; tasks are the local engine's and local profile only.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const paths = require("./paths.js");
const folders = require("./folders.js");
const runs = require("./runs.js");
const pricing = require("./pricing.js");
const { parseBundle } = require("../agent-cloud/bundle.js");

const MAX_ACTIVE_TASKS = 2;
const LIVE = new Set(["planning", "working"]);
// States a writer can still stop; settle closes any of them.
const STOPPABLE = new Set(["planning", "awaiting_plan", "working", "awaiting_answer"]);
const MAX_TITLE = 120;
// A turn can start from these: a plan to approve, a question to answer, a
// delivered turn the writer wants to carry on from, or a turn that was stopped
// (by the writer, or by a restart).
const CONTINUABLE = new Set(["awaiting_plan", "awaiting_answer", "delivered", "stopped"]);
const MAX_LEDGER_PATHS = 20;
const MAX_MOUNTS = 4;
// A lent document's projection is a handful of text files; the caps are the
// cloud bundle's own-key ones (agent-cloud/config.js), shared by all objects.
const OBJECT_MAX_BYTES = 8 * 1024 * 1024;
const OBJECT_MAX_FILES = 200;
const MAX_NAME = 120;
const MANIFEST = "manifest.json";
const MAX_QUEUE = 5;
// Turns in a row whose ledger says stuck or looping (or names the same failing step) before the task stops.
const STUCK_TURNS = 3;
const MAX_QUEUED_TEXT = 8000;
// States a follow-up can be queued in: a turn is running, or a plan or a
// question waits for the writer (the queue joins the writer's answer).
const QUEUEABLE = new Set(["planning", "working", "awaiting_plan", "awaiting_answer"]);

/**
 * @typedef {{ kind: "folder" | "object", id: string, name: string, level: string }} Mount
 * @typedef {{ id: string, name: string, files: import("../agent-cloud/bundle.js").BundleFile[] }} LentObject
 * @typedef {{ proposals: Array<{ id: string, kind: string, status: string }>, changes: { count: number, added: number, modified: number, deleted: number } }} TurnResult
 * @typedef {{ facts: string[], done: string[], next: string[], stuck: boolean, looping: boolean, failingStep: string }} Ledger
 * @typedef {{ id: string, taskId: string, n: number, level: string, prompt: string, snapshot: string | null, tokens: number, cost?: number, result: TurnResult, rewound?: boolean, ledger?: Ledger }} Turn
 * @typedef {{ id: string, text: string, at: string }} Queued
 * @typedef {{ id: string, title: string, state: string, mounts: Mount[], planGate: boolean, queue?: Queued[], queueDropped?: { count: number, reason: string }, planApproved?: boolean, planApprovedTurn?: number, interrupted?: boolean, stuckAfter?: number, forkedFrom?: { taskId: string, turn: number, history: string }, engine?: string, model?: string, language?: string, turns: Turn[], createdAt: string, usage: { tokens: number, costEstimate?: number } }} Task
 */

/** @type {Map<string, Task>} */
const tasks = new Map();
/** Tasks whose next turn is being started: their old turn's run says "done", which is not news. @type {Set<string>} */
const starting = new Set();
/** Each task's lock: the tail of what holds it (a turn's start, a stop, a settle). @type {Map<string, Promise<void>>} */
const locks = new Map();
/** What the page sent with a task's last queued message: engine, model, language, connectors. Memory only. @type {Map<string, any>} */
const queueContext = new Map();

/**
 * Run `work` once everything that took the task's lock before it is done. A
 * turn's start holds the lock across its awaits (the Keychain read, the clone,
 * the snapshot), so a stop or settle that arrives meanwhile waits for it and
 * then ends the turn it started: no engine outlives a stopped or settled task,
 * and nothing it kept is written back after a settle (round 8 F2).
 * @template T
 * @param {string} id
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
function withTaskLock(id, work) {
  const result = (locks.get(id) || Promise.resolve()).then(work);
  const tail = result.then(() => {}, () => {});
  locks.set(id, tail);
  void tail.then(() => { if (locks.get(id) === tail) locks.delete(id); });
  return result;
}

/**
 * @param {string} code
 * @param {string} message
 * @param {number} statusCode
 */
function taskError(code, message, statusCode) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/** @param {string} id */
function validTaskId(id) {
  return /^task-[0-9a-f-]{36}$/.test(String(id || ""));
}

/** @param {Task} task */
function persist(task) {
  const file = path.join(paths.tasksRoot(), task.id, "task.json");
  paths.assertNotTemporary(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(task, null, 2)}\n`);
}

/**
 * Where turn n's snapshot goes: the task's own folder, which no engine can
 * write (the engine's sandbox names only its shadow).
 * @param {string} taskId
 * @param {number} n
 */
function snapshotPath(taskId, n) {
  const dir = path.join(paths.tasksRoot(), taskId, "snapshots", `turn-${n}`);
  paths.assertNotTemporary(dir);
  return dir;
}

function emptyResult() {
  return { proposals: [], changes: { count: 0, added: 0, modified: 0, deleted: 0 } };
}

/**
 * What a turn's run produced, from the run's records; null when the run is
 * gone.
 * @param {string} runId
 * @returns {TurnResult | null}
 */
function resultOf(runId) {
  try {
    const { proposals, changes } = runs.runOutcome(runId);
    return { proposals, changes };
  } catch {
    return null;
  }
}

/** @param {Task} task */
function lastTurn(task) {
  return task.turns.length ? task.turns[task.turns.length - 1] : null;
}

/**
 * Tokens over all turns, and the estimated cost (CNY, the provider price table
 * of runUsageText) only when every turn that spent tokens has a price: a task
 * that ran an unpriced engine, even once, shows tokens only.
 * @param {Task} task
 * @returns {{ tokens: number, costEstimate?: number }}
 */
function usageOf(task) {
  const spent = task.turns.filter((turn) => turn.tokens > 0);
  const usage = { tokens: task.turns.reduce((sum, entry) => sum + (entry.tokens || 0), 0) };
  if (spent.length && spent.every((turn) => typeof turn.cost === "number")) {
    return { ...usage, costEstimate: Math.round(spent.reduce((sum, turn) => sum + /** @type {number} */ (turn.cost), 0) * 10_000) / 10_000 };
  }
  return usage;
}

/**
 * Bring a live task's state in line with its active turn's run.
 * @param {Task} task
 */
function sync(task) {
  if (!LIVE.has(task.state) || starting.has(task.id)) return task;
  const turn = lastTurn(task);
  if (!turn) return task; // slot reserved, run not started yet
  let run;
  try { run = runs.getRun(turn.id); } catch { run = null; }
  const before = task.state;
  if (!run) task.state = "failed";
  else if (run.state === "done") {
    try { turn.ledger = runs.runLedger(turn.id) || undefined; } catch {}
    if (!turn.ledger) delete turn.ledger;
    if (task.state === "working" && stuckLately(task)) postStuckReport(task, turn);
    const result = resultOf(turn.id);
    const pending = (/** @type {string} */ kind) => Boolean(result?.proposals.some((entry) => entry.kind === kind && entry.status === "pending"));
    // A question holds the task for the writer's answer; a plan (always from
    // a gated turn, or from turn 1) holds it for approval.
    if (pending("question")) task.state = "awaiting_answer";
    else if (task.state === "planning" || (turn.n === 1 && pending("plan"))) task.state = "awaiting_plan";
    else task.state = "delivered";
    if (result) turn.result = result;
  }
  else if (run.state === "error") task.state = "failed";
  else if (run.state === "stopped" || run.state === "discarded") task.state = "stopped";
  const used = Number(run?.usage?.used);
  if (Number.isFinite(used)) turn.tokens = used;
  // Priced at the turn's own model and the hour it ended (peak or off-peak).
  if (run && turn.tokens) {
    const cost = pricing.inputCostCny(run.model, turn.tokens, new Date(run.endedAt || run.createdAt));
    if (cost === null) delete turn.cost;
    else turn.cost = cost;
  }
  task.usage = usageOf(task);
  if ((task.state === "failed" || task.state === "stopped") && task.queue?.length) dropQueue(task, task.state);
  if (task.state !== before) persist(task);
  return task;
}

/**
 * Whether the last STUCK_TURNS turns (since the last stuck report) all say
 * stuck or looping, or all name the same failing step.
 * @param {Task} task
 */
function stuckLately(task) {
  const recent = task.turns.filter((turn) => !turn.rewound && turn.n > (task.stuckAfter || 0)).slice(-STUCK_TURNS);
  if (recent.length < STUCK_TURNS || recent.some((turn) => !turn.ledger)) return false;
  if (recent.every((turn) => turn.ledger?.stuck || turn.ledger?.looping)) return true;
  const step = (/** @type {Turn} */ turn) => String(turn.ledger?.failingStep || "").trim().toLowerCase();
  return Boolean(step(recent[0])) && recent.every((turn) => step(turn) === step(recent[0]));
}

/**
 * The task stops here: a question for the writer in the turn that just
 * ended, built from the ledgers' own lines (what was tried, where it is
 * stuck, what it needs).
 * @param {Task} task
 * @param {Turn} turn
 */
function postStuckReport(task, turn) {
  const zh = /^zh/i.test(String(task.language || ""));
  const ledger = /** @type {Ledger} */ (turn.ledger);
  const recent = task.turns.filter((entry) => !entry.rewound && entry.n > (task.stuckAfter || 0)).slice(-STUCK_TURNS);
  const tried = recent.flatMap((entry) => entry.ledger?.done || []).slice(-6);
  const stuckAt = ledger.failingStep || ledger.facts[ledger.facts.length - 1] || "";
  const lines = [
    zh ? `这个任务连续 ${STUCK_TURNS} 轮没有进展，先停在这里。以下是它自己账本里的话。` : `This task has made no progress for ${STUCK_TURNS} turns, so it stopped here. These are the lines of its own ledger.`,
    `${zh ? "试过：" : "Tried: "}${tried.length ? tried.join("; ") : (zh ? "（账本没写）" : "(the ledger says nothing)")}`,
    `${zh ? "卡在：" : "Stuck at: "}${stuckAt || (zh ? "（账本没写）" : "(the ledger says nothing)")}`,
    `${zh ? "需要你：" : "Needs from you: "}${ledger.next.length ? ledger.next.join("; ") : (zh ? "一句方向" : "a direction")}`,
  ];
  runs.postHostProposal(turn.id, { kind: "question", title: zh ? "卡住了" : "Stuck report", payload: { text: lines.join("\n"), options: [], stuckReport: true } });
  task.stuckAfter = turn.n;
}

/**
 * The queued follow-ups are not sent: the task ended without a turn to carry
 * them. The count and the reason stay on the task so the page can say so.
 * @param {Task} task
 * @param {string} reason
 */
function dropQueue(task, reason) {
  queueContext.delete(task.id);
  if (!task.queue?.length) return;
  task.queueDropped = { count: task.queue.length, reason };
  task.queue = [];
  persist(task);
}

function loadFromDisk() {
  let names = [];
  try { names = fs.readdirSync(paths.tasksRoot()); } catch { return; }
  for (const name of names) {
    if (!validTaskId(name) || tasks.has(name)) continue;
    try {
      const task = JSON.parse(fs.readFileSync(path.join(paths.tasksRoot(), name, "task.json"), "utf8"));
      if (task && task.id === name && Array.isArray(task.turns)) {
        // A live task follows its last turn's run (sync): done reads as the
        // writer's turn, a run that was working when the server died as stopped.
        if (LIVE.has(task.state) && !task.turns.length) task.state = "stopped";
        const wasLive = LIVE.has(task.state);
        tasks.set(name, task);
        sync(task);
        // Working when the server died: stopped, but the writer can Continue.
        if (wasLive && task.state === "stopped") {
          task.interrupted = true;
          persist(task);
        }
      }
    } catch {}
  }
}

function liveCount() {
  let count = 0;
  for (const task of tasks.values()) if (LIVE.has(sync(task).state)) count += 1;
  return count;
}

/** The newest turn's ledger the engine left, or undefined. @param {Task} task */
function latestLedger(task) {
  return task.turns.filter((turn) => !turn.rewound && turn.ledger).pop()?.ledger;
}

/** @param {Task} task */
function view(task) {
  sync(task);
  return {
    id: task.id,
    title: task.title,
    state: task.state,
    mounts: task.mounts.map((mount) => ({ ...mount })),
    planGate: task.planGate,
    queue: (task.queue || []).map((entry) => ({ id: entry.id, text: entry.text })),
    ...(task.state === "stopped" && task.interrupted ? { interrupted: true } : {}),
    ...(latestLedger(task) ? { ledger: latestLedger(task) } : {}),
    ...(task.forkedFrom ? { forkedFrom: { taskId: task.forkedFrom.taskId, turn: task.forkedFrom.turn } } : {}),
    ...(task.queueDropped ? { queueDropped: { ...task.queueDropped } } : {}),
    turns: task.turns.map((turn) => turn.id),
    createdAt: task.createdAt,
    usage: { ...task.usage },
  };
}

/** @param {string} id */
function getTask(id) {
  if (!validTaskId(id)) throw taskError("task_unknown", "No task has that id.", 404);
  if (!tasks.has(id)) loadFromDisk();
  const task = tasks.get(id);
  if (!task) throw taskError("task_unknown", "No task has that id.", 404);
  return task;
}

/**
 * One object mount: the projection bundle the page uploads for a document it
 * lends, checked by the cloud bundle's own parser (paths, hashes, caps; the
 * allowance is what the earlier objects left of the shared byte and file
 * caps) and required to carry the projection's manifest.json.
 * @param {any} item
 * @param {LentObject[]} taken
 * @param {{ bytes: number, files: number }} allowance
 * @returns {LentObject}
 */
function lentObject(item, taken, allowance) {
  const id = String(item?.id || "");
  if (!id || id.length > MAX_NAME || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(id)) {
    throw taskError("task_object_invalid", `A lent document needs an id of up to ${MAX_NAME} characters.`, 400);
  }
  if (taken.some((object) => object.id === id)) throw taskError("task_object_invalid", "The same document is lent twice.", 400);
  if (!Array.isArray(item.files) || !item.files.length) {
    throw taskError("task_object_bundle_missing", "A lent document needs its projection files.", 400);
  }
  const files = parseBundle(item.files, { maxUploadBytes: allowance.bytes, maxUploadFiles: allowance.files });
  distinctPaths(files);
  const manifest = files.find((file) => file.path === MANIFEST);
  if (!manifest) throw taskError("task_object_manifest_missing", `A lent document's projection must include ${MANIFEST}.`, 400);
  let parsed;
  try { parsed = JSON.parse(manifest.bytes.toString("utf8")); } catch { parsed = null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw taskError("task_object_invalid", `${MANIFEST} must hold a JSON object.`, 400);
  }
  const name = plainLine(String(item.name || id)).trim().slice(0, MAX_NAME) || id;
  return { id, name, files };
}

/**
 * Two paths of one bundle that differ only in case or Unicode normalization
 * are one file on APFS (and a file and a folder so named, one entry): refused,
 * not left for the second write to fail.
 * @param {Array<{ path: string }>} files
 */
function distinctPaths(files) {
  const fold = (/** @type {string} */ rel) => rel.normalize("NFC").toUpperCase().toLowerCase();
  const seen = new Set();
  for (const file of files) {
    if (seen.has(fold(file.path))) throw taskError("task_object_invalid", `Two files of a lent document differ only in case or accents: ${plainLine(file.path)}`, 400);
    seen.add(fold(file.path));
  }
  for (const file of files) {
    const parts = fold(file.path).split("/");
    for (let depth = 1; depth < parts.length; depth += 1) {
      if (seen.has(parts.slice(0, depth).join("/"))) throw taskError("task_object_invalid", `A file and a folder of a lent document differ only in case or accents: ${plainLine(file.path)}`, 400);
    }
  }
}

/**
 * What a lent document takes of the shared caps.
 * @param {LentObject} object
 */
function spent(object) {
  return { bytes: object.files.reduce((sum, file) => sum + file.bytes.length, 0), files: object.files.length };
}

/**
 * @param {any} raw
 * @returns {{ mounts: Mount[], objects: LentObject[] }}  objects carry the decoded bundles; a mount never does
 */
function normalizeMounts(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) throw taskError("task_mounts_required", "A task needs a mounted folder or a lent document.", 400);
  if (list.length > MAX_MOUNTS) throw taskError("task_mounts_too_many", `A task takes at most ${MAX_MOUNTS} mounts.`, 400);
  /** @type {Mount[]} */
  const mounts = [];
  /** @type {LentObject[]} */
  const objects = [];
  const left = { bytes: OBJECT_MAX_BYTES, files: OBJECT_MAX_FILES };
  for (const item of list) {
    const kind = item?.kind ? String(item.kind) : "folder";
    if (kind !== "folder" && kind !== "object") throw taskError("task_mount_unsupported", "A mount is a folder or a lent document.", 400);
    const level = folders.normalizeLevel(item?.level ? String(item.level) : "propose");
    if (!level) throw taskError("bad_level", "Level must be read, propose or change.", 400);
    if (kind === "object") {
      const object = lentObject(item, objects, left);
      left.bytes -= spent(object).bytes;
      left.files -= spent(object).files;
      objects.push(object);
      // A lent document is never put back to disk, so it is never above propose.
      mounts.push({ kind: "object", id: object.id, name: object.name, level: folders.capLevel(level, "propose") });
      continue;
    }
    // A run works in one real folder: the second folder is the writer's to
    // split into a second task.
    if (mounts.some((mount) => mount.kind === "folder")) {
      throw taskError("task_mount_unsupported", "A task takes one shared folder, plus lent documents.", 400);
    }
    const grant = folders.resolveFolder(String(item?.id || ""));
    mounts.push({ kind: "folder", id: grant.id, name: grant.name, level: folders.capLevel(level, grant.level) });
  }
  return { mounts, objects };
}

/**
 * What a run of this task may do: the lowest level any mount holds.
 * @param {Mount[]} mounts
 */
function lowestLevel(mounts) {
  return mounts.reduce((low, mount) => folders.capLevel(mount.level, low), "change");
}

/** @param {string} taskId */
function objectsFile(taskId) {
  const file = path.join(paths.tasksRoot(), taskId, "objects.json");
  paths.assertNotTemporary(file);
  return file;
}

/**
 * The lent documents as the page sent them, kept in the task's own folder
 * (private to this Mac, 0600) so every turn starts from the same bytes.
 * @param {string} taskId
 * @param {LentObject[]} objects
 */
function persistObjects(taskId, objects) {
  if (!objects.length) return;
  const file = objectsFile(taskId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const doc = objects.map((object) => ({
    id: object.id,
    name: object.name,
    files: object.files.map((entry) => ({ path: entry.path, encoding: "base64", content: entry.bytes.toString("base64"), sha256: entry.sha256, id: entry.id })),
  }));
  fs.writeFileSync(file, JSON.stringify(doc), { mode: 0o600 });
}

/**
 * The task's lent documents again, checked once more as they come off disk. A
 * document the page sent afresh (refreshed: id → its bundle) replaces the kept
 * one, under the same checks and the same shared cap as at create.
 * @param {Task} task
 * @param {Map<string, any>} [refreshed]
 * @returns {LentObject[]}
 */
function loadObjects(task, refreshed = new Map()) {
  const wanted = task.mounts.filter((mount) => mount.kind === "object");
  if (!wanted.length) return [];
  /** @type {any} */
  let doc = null;
  try { doc = JSON.parse(fs.readFileSync(objectsFile(task.id), "utf8")); } catch {}
  const left = { bytes: OBJECT_MAX_BYTES, files: OBJECT_MAX_FILES };
  return wanted.map((mount) => {
    /** @type {LentObject} */
    let object;
    if (refreshed.has(mount.id)) {
      object = lentObject({ id: mount.id, name: mount.name, files: refreshed.get(mount.id) }, [], left);
    } else {
      const entry = Array.isArray(doc) ? doc.find((/** @type {any} */ item) => item && item.id === mount.id) : null;
      if (!entry) throw taskError("task_object_bundle_missing", "This task's lent document is no longer kept on this Mac; lend it again in a new task.", 409);
      const files = parseBundle(entry.files, { maxUploadBytes: left.bytes, maxUploadFiles: left.files });
      distinctPaths(files);
      object = { id: mount.id, name: mount.name, files };
    }
    left.bytes -= spent(object).bytes;
    left.files -= spent(object).files;
    return object;
  });
}

/**
 * @typedef {object} CreateTaskInput
 * @property {Array<{ name: string, url: string, headers?: Record<string, string>, tools?: Record<string, string> }>} [connectors]  outside MCP servers for this turn, never stored
 * @property {string} [title]
 * @property {string} prompt
 * @property {any[]} mounts
 * @property {boolean} [planGate]
 * @property {string} [language]
 * @property {string} [engine]
 * @property {string} [model]
 * @property {string} [deskContext]  the task's skills and memory snapshot, sent with every turn, never stored
 * @property {number} [serverPort]
 * @property {string} [lmStudioBaseUrl]
 */

/** @param {CreateTaskInput} input */
async function createTask(input) {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) throw taskError("prompt_required", "A task needs a prompt.", 400);
  const { mounts, objects } = normalizeMounts(input.mounts);
  const planGate = input.planGate !== false;
  loadFromDisk();
  if (liveCount() >= MAX_ACTIVE_TASKS) throw taskError("task_limit", "Two tasks are already working; stop or settle one first.", 409);
  const title = (String(input.title || "").trim() || prompt.split(/\r?\n/)[0].trim()).slice(0, MAX_TITLE);
  /** @type {Task} */
  const task = {
    id: `task-${crypto.randomUUID()}`,
    title,
    state: planGate ? "planning" : "working",
    mounts,
    planGate,
    planApproved: false,
    engine: input.engine,
    model: input.model,
    language: input.language,
    queue: [],
    turns: [],
    createdAt: new Date().toISOString(),
    usage: { tokens: 0 },
  };
  // The slot is taken before the first await, so two creates racing for the
  // last slot cannot both pass the cap; the lock is taken with it, so a stop
  // or settle of the listed task waits for turn 1 to start.
  tasks.set(task.id, task);
  return withTaskLock(task.id, async () => {
    try {
      persistObjects(task.id, objects);
      // Ruling D4: with the plan gate, turn 1 runs read-only whatever the mount says.
      const level = planGate ? "read" : lowestLevel(mounts);
      const snapshot = snapshotPath(task.id, 1);
      const run = await runs.createRun({
        taskTurn: true,
        snapshotTo: snapshot,
        folderId: mounts.find((mount) => mount.kind === "folder")?.id,
        objects,
        level,
        prompt,
        engine: input.engine,
        model: input.model,
        language: input.language,
        serverPort: input.serverPort,
        lmStudioBaseUrl: input.lmStudioBaseUrl,
        // Sent with every turn and never stored in the task: the writer's
        // connector choices of this moment, and no credentials on disk.
        connectors: input.connectors,
        deskContext: input.deskContext,
      });
      task.turns.push({ id: run.runId, taskId: task.id, n: 1, level: run.level, prompt, snapshot, tokens: 0, result: emptyResult() });
    } catch (error) {
      tasks.delete(task.id);
      // Nothing of a refused task stays: not the lent documents either.
      if (objects.length) fs.rmSync(path.join(paths.tasksRoot(), task.id), { recursive: true, force: true });
      throw error;
    }
    persist(task);
    return { task: view(task) };
  });
}

function listTasks() {
  loadFromDisk();
  return { tasks: [...tasks.values()].map(view).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) };
}

/** @param {string} id */
function readTask(id) {
  const task = getTask(id);
  const summary = view(task);
  const states = new Map();
  try { for (const run of runs.listRuns()) states.set(run.runId, run.state); } catch {}
  // The result is read fresh: a proposal accepted since the turn ended shows.
  const turns = task.turns.map((turn) => ({ ...turn, result: resultOf(turn.id) || turn.result, state: states.get(turn.id) || "unknown" }));
  return { task: summary, turns };
}

/** @param {string} text */
function plainLine(text) {
  return String(text).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").slice(0, 200);
}

/**
 * The facts of one earlier turn, taken from its run's records: what the
 * engine changed, what the writer put back, what still waits, and how each
 * proposal was decided. The model's own words (its messages, a proposal's
 * title or text) are not read here.
 * @param {Turn} turn
 */
function ledgerLines(turn) {
  /** @type {ReturnType<typeof runs.runOutcome>} */
  let outcome;
  try {
    outcome = runs.runOutcome(turn.id, { pending: true });
  } catch {
    return ["no record of this turn is left"];
  }
  const { changes } = outcome;
  const lines = [
    `ran at level ${turn.level}`,
    `changes made: ${changes.count} (${changes.added} added, ${changes.modified} modified, ${changes.deleted} deleted)`,
    `put back by the writer: ${outcome.putBack} file${outcome.putBack === 1 ? "" : "s"}`,
  ];
  if (outcome.pending.length) {
    const shown = outcome.pending.slice(0, MAX_LEDGER_PATHS).map((change) => `${change.kind} ${JSON.stringify(plainLine(change.path))}`);
    const more = outcome.pending.length > shown.length ? `, and ${outcome.pending.length - shown.length} more` : "";
    lines.push(`changes not put back: ${outcome.pending.length} (${shown.join("; ")}${more})`);
  } else {
    lines.push("changes not put back: 0");
  }
  /** @type {Record<string, string>} */
  const word = { accepted: "accepted", discarded: "rejected", pending: "not yet decided" };
  const proposed = outcome.proposals.map((entry) => `${plainLine(entry.kind)} ${plainLine(entry.id)} ${word[entry.status] || plainLine(entry.status)}`);
  lines.push(`proposals: ${proposed.length ? proposed.join("; ") : "none"}`);
  const ledger = turn.ledger;
  if (ledger) {
    const said = (/** @type {string[]} */ list) => (list.length ? list.map(plainLine).join("; ") : "nothing");
    lines.push(`the engine's own ledger (its account, not a checked fact): established ${said(ledger.facts)}; done ${said(ledger.done)}; next ${said(ledger.next)}; stuck ${ledger.stuck}; looping ${ledger.looping}${ledger.failingStep ? `; failing step ${JSON.stringify(plainLine(ledger.failingStep))}` : ""}`);
  }
  return lines;
}

/**
 * The priorTurns preamble for turn n>1: the writer's own words of every
 * earlier turn, verbatim, then the ledger of facts from the run records.
 * @param {Task} task
 */
function priorTurnsText(task) {
  const out = ["[Earlier turns of this task. The writer's words are quoted exactly; the ledger lists facts from the run records, not what anyone said about them.]"];
  if (task.forkedFrom?.history) out.push(task.forkedFrom.history);
  out.push(...turnBlocks(task.turns));
  if (task.interrupted) out.push("[The last turn above was cut short when this Mac or the server restarted. Its record shows what it had changed by then; carry on from there.]");
  out.push("[The writer's new message follows.]");
  return out.join("\n\n");
}

/**
 * One block per turn the writer has not rewound: their words, then the
 * record. A rewound turn was undone by the writer and is not part of it.
 * @param {Turn[]} turns
 */
function turnBlocks(turns) {
  return turns.filter((entry) => !entry.rewound)
    .map((turn) => `--- turn ${turn.n}: the writer said ---\n${turn.prompt}\n--- turn ${turn.n}: the record ---\n${ledgerLines(turn).join("\n")}`);
}

/**
 * The page's refreshed bundles for a further turn, by document id; each must
 * name a document the task was lent, once.
 * @param {Task} task
 * @param {any} raw
 * @returns {Map<string, any>}
 */
function refreshedBundles(task, raw) {
  /** @type {Map<string, any>} */
  const refreshed = new Map();
  if (raw === undefined || raw === null) return refreshed;
  if (!Array.isArray(raw)) throw taskError("task_object_invalid", "objects must be a list of { id, bundle }.", 400);
  for (const item of raw) {
    const id = String(item?.id || "");
    if (!task.mounts.some((mount) => mount.kind === "object" && mount.id === id)) {
      throw taskError("task_object_unknown", "This task has no such lent document.", 404);
    }
    if (refreshed.has(id)) throw taskError("task_object_invalid", "The same document is lent twice.", 400);
    refreshed.set(id, item.bundle);
  }
  return refreshed;
}

/**
 * @typedef {object} TurnInput
 * @property {Array<{ name: string, url: string, headers?: Record<string, string>, tools?: Record<string, string> }>} [connectors]  outside MCP servers for this turn, never stored
 * @property {string} prompt
 * @property {Array<{ id: string, bundle: any[] }>} [objects]  the lent documents' latest projections; a document left out keeps its last bundle
 * @property {boolean} [approvePlan]
 * @property {string} [deskContext]  the task's skills and memory snapshot, sent with every turn, never stored
 * @property {string} [role]  hand this turn to a built-in role (read level, that role's kinds)
 * @property {string} [language]
 * @property {string} [engine]
 * @property {string} [model]
 * @property {number} [serverPort]
 * @property {string} [lmStudioBaseUrl]
 */

/**
 * The next turn of a task: allowed once the last one has reached the writer
 * (a plan to approve, a question to answer, a delivery) or was stopped. It
 * holds the task's lock until its run has started.
 * @param {string} id
 * @param {TurnInput} input
 */
async function createTurn(id, input) {
  getTask(id);
  return withTaskLock(id, () => startTurn(getTask(id), input));
}

/**
 * The writer's words, then every queued follow-up in order, each marked as
 * one, verbatim.
 * @param {string} typed
 * @param {Queued[]} carried
 */
function promptWithQueue(typed, carried) {
  const parts = typed ? [typed] : [];
  carried.forEach((entry, index) => {
    parts.push(`[Follow-up ${index + 1} of ${carried.length}: the writer added this while the earlier turn was still running]\n${entry.text}`);
  });
  return parts.join("\n\n");
}

/**
 * Start the next turn; the caller holds the task's lock. Queued follow-ups
 * join the prompt (and leave the queue once the turn has started).
 * @param {Task} task
 * @param {TurnInput} input
 */
async function startTurn(task, input) {
  sync(task);
  if (task.state === "settled") throw settledError();
  if (!CONTINUABLE.has(task.state)) throw taskError("task_not_ready", "This task is not waiting for the writer; wait for it to finish its turn.", 409);
  const carried = task.queue || [];
  const typed = String(input.prompt || "").trim();
  if (!typed && !carried.length) throw taskError("prompt_required", "A turn needs a prompt.", 400);
  const prompt = promptWithQueue(typed, carried);
  const approving = input.approvePlan === true;
  if (approving && task.state !== "awaiting_plan") throw taskError("plan_not_pending", "There is no plan waiting for approval.", 409);
  // Each turn is a fresh run, so the lent documents go in again as lent: the
  // writer's latest version where the page sent one, else the last bundle.
  const refreshed = refreshedBundles(task, input.objects);
  const objects = loadObjects(task, refreshed);
  loadFromDisk();
  if (liveCount() >= MAX_ACTIVE_TASKS) throw taskError("task_limit", "Two tasks are already working; stop or settle one first.", 409);
  const before = { interrupted: task.interrupted, state: task.state, planApproved: task.planApproved, planApprovedTurn: task.planApprovedTurn, queue: carried, queueDropped: task.queueDropped };
  const n = task.turns.length + 1;
  if (approving) {
    task.planApproved = true;
    task.planApprovedTurn = n;
  }
  // Until the plan is approved the gate holds: the turn runs read-only and
  // only offers plans and questions (ruling D4).
  const gated = task.planGate && !task.planApproved;
  // The slot is taken before the first await (see createTask).
  let runState = "starting";
  starting.add(task.id);
  task.state = gated ? "planning" : "working";
  // The follow-ups leave the queue with the slot, so a read in between never
  // shows them waiting while the turn that carries them runs.
  task.queue = [];
  delete task.queueDropped;
  try {
    const snapshot = snapshotPath(task.id, n);
    const run = await runs.createRun({
      taskTurn: true,
      snapshotTo: snapshot,
      folderId: task.mounts.find((mount) => mount.kind === "folder")?.id,
      objects,
      level: gated ? "read" : lowestLevel(task.mounts),
      prompt,
      priorTurns: priorTurnsText(task),
      // The task's V12 snapshot rides every turn (never stored); a role turn is the sub-task handed to that role.
      deskContext: input.deskContext,
      role: input.role,
      engine: input.engine || task.engine,
      model: input.model || task.model,
      language: input.language || task.language,
      serverPort: input.serverPort,
      lmStudioBaseUrl: input.lmStudioBaseUrl,
      // Sent with every turn and never stored in the task: the writer's
      // connector choices of this moment, and no credentials on disk.
      connectors: input.connectors,
    });
    /** @type {Turn} */
    const turn = { id: run.runId, taskId: task.id, n, level: run.level, prompt, snapshot, tokens: 0, result: emptyResult() };
    task.turns.push(turn);
    delete task.interrupted;
    runState = run.state;
    // Kept only once the turn has started: a refused turn changes nothing.
    if (refreshed.size) persistObjects(task.id, objects);
  } catch (error) {
    task.state = before.state;
    task.interrupted = before.interrupted;
    if (!before.interrupted) delete task.interrupted;
    task.planApproved = before.planApproved;
    task.planApprovedTurn = before.planApprovedTurn;
    task.queue = before.queue;
    if (before.queueDropped) task.queueDropped = before.queueDropped;
    throw error;
  } finally {
    starting.delete(task.id);
  }
  queueContext.delete(task.id);
  persist(task);
  const turn = /** @type {Turn} */ (lastTurn(task));
  return { turn: { ...turn, state: runState }, task: view(task) };
}

/**
 * Add a follow-up to the task's queue. Allowed while a turn runs or a plan or
 * question waits for the writer; the page sends the connectors and the
 * engine, model and language of this moment, which the server keeps in memory
 * for the turn it starts by itself.
 * @param {string} id
 * @param {{ text: string } & Partial<TurnInput>} input
 */
async function queueMessage(id, input) {
  getTask(id);
  return withTaskLock(id, async () => {
    const task = getTask(id);
    sync(task);
    if (task.state === "settled") throw settledError();
    if (!QUEUEABLE.has(task.state)) throw taskError("task_not_busy", "This task is not running; send the message as a turn.", 409);
    const text = String(input.text || "").trim();
    if (!text) throw taskError("prompt_required", "A follow-up needs words.", 400);
    if (text.length > MAX_QUEUED_TEXT) throw taskError("text_too_long", `A follow-up takes at most ${MAX_QUEUED_TEXT} characters.`, 400);
    const queue = task.queue || (task.queue = []);
    if (queue.length >= MAX_QUEUE) throw taskError("queue_full", `${MAX_QUEUE} follow-ups are already waiting; wait for this turn to end or remove one.`, 409);
    queue.push({ id: `q-${crypto.randomUUID()}`, text, at: new Date().toISOString() });
    delete task.queueDropped;
    queueContext.set(task.id, {
      deskContext: input.deskContext,
      connectors: input.connectors,
      engine: input.engine,
      model: input.model,
      language: input.language,
      serverPort: input.serverPort,
      lmStudioBaseUrl: input.lmStudioBaseUrl,
    });
    persist(task);
    return { task: view(task) };
  });
}

/**
 * Take one follow-up back out of the queue before it is sent.
 * @param {string} id
 * @param {string} queueId
 */
async function removeQueued(id, queueId) {
  getTask(id);
  return withTaskLock(id, async () => {
    const task = getTask(id);
    sync(task);
    const queue = task.queue || [];
    const at = queue.findIndex((entry) => entry.id === String(queueId));
    if (at < 0) throw taskError("queue_unknown", "That follow-up is not waiting any more.", 404);
    queue.splice(at, 1);
    if (!queue.length) queueContext.delete(task.id);
    persist(task);
    return { task: view(task) };
  });
}

/**
 * A run ended: when it was a task's last turn and follow-ups wait, either
 * start the one turn that carries them (the turn delivered normally), keep
 * them (a plan or a question waits for the writer), or drop them (stopped,
 * failed, settled, or the start was refused).
 * @param {{ id: string }} run
 */
function onRunEnded(run) {
  for (const task of tasks.values()) {
    if (!task.queue?.length || lastTurn(task)?.id !== run.id) continue;
    void withTaskLock(task.id, async () => {
      sync(task);
      if (!task.queue?.length) return;
      if (task.state === "delivered") {
        const context = queueContext.get(task.id) || {};
        try {
          await startTurn(task, { ...context, prompt: "" });
        } catch {
          dropQueue(task, "start_failed");
        }
      } else if (task.state === "failed" || task.state === "stopped" || task.state === "settled") {
        dropQueue(task, task.state);
      }
    });
  }
}

runs.onRunFinished(onRunEnded);

/**
 * Rewind a task to before turn `toTurn` ran. The task must be between turns
 * (not planning or working). For turn `toTurn` and every later turn whose run
 * still exists: the changes still waiting to be put back return to what that
 * turn's snapshot held — the state of its work/ before its engine started,
 * i.e. what the turn found — and the proposals still waiting are dropped; the
 * turns are marked rewound and leave the next turn's preamble. Anything the
 * writer already decided stays: put-back files (in the real folder, which a
 * rewind never writes), accepted proposals, and files an accepted restore
 * staged. The task then reads as it would after its last remaining turn. A
 * turn whose run is not final refuses the whole rewind before any restore.
 * @param {string} id
 * @param {number} toTurn
 */
function rewindTask(id, toTurn) {
  const task = getTask(id);
  sync(task);
  if (task.state === "settled") throw settledError();
  if (LIVE.has(task.state)) throw taskError("task_not_ready", "This task is still working; stop it or wait for the turn to finish before rewinding.", 409);
  const first = Number.isInteger(toTurn) ? task.turns.find((turn) => turn.n === toTurn && !turn.rewound) : undefined;
  if (!first) throw taskError("bad_turn", "This task has no such turn to rewind to.", 400);
  const targets = task.turns.filter((turn) => turn.n >= first.n && !turn.rewound);
  const present = targets.filter((turn) => {
    try { runs.getRun(turn.id); return true; } catch { return false; }
  });
  // Nothing moves until every turn that can be restored has its snapshot and
  // a final run (a turn a restart interrupted has an unfrozen shadow: run_active).
  if (present.some((turn) => !turn.snapshot || !fs.existsSync(turn.snapshot))) {
    throw taskError("snapshot_missing", "A turn to rewind has no snapshot left to restore from.", 409);
  }
  for (const turn of present) runs.assertRewindable(turn.id);
  const rewound = [];
  for (const turn of present) {
    const outcome = runs.rewindRun(turn.id, /** @type {string} */ (turn.snapshot));
    turn.result = resultOf(turn.id) || turn.result;
    rewound.push({ turn: turn.n, id: turn.id, restored: outcome.restored, refused: outcome.refused, dropped: outcome.dropped });
  }
  for (const turn of targets) turn.rewound = true;
  if ((task.planApprovedTurn || 0) >= first.n) {
    task.planApproved = false;
    delete task.planApprovedTurn;
  }
  if (["awaiting_plan", "awaiting_answer", "delivered"].includes(task.state)) {
    const last = task.turns.filter((turn) => !turn.rewound).pop();
    const result = last ? resultOf(last.id) : null;
    const pending = (/** @type {string} */ kind) => Boolean(result?.proposals.some((entry) => entry.kind === kind && entry.status === "pending"));
    if (pending("question")) task.state = "awaiting_answer";
    else if ((task.planGate && !task.planApproved) || (last?.n === 1 && pending("plan"))) task.state = "awaiting_plan";
    else task.state = "delivered";
  }
  persist(task);
  return { task: view(task), rewound };
}

/**
 * The edited projection files of one lent document, from the last turn that
 * still stands: what the page diffs against its own projection to make
 * candidates. Every turn starts from the document as it was lent, so this is
 * that turn's edits, not a running total. Nothing here reaches the real
 * document; it only says what the engine left.
 * @param {string} id
 * @param {string} objectId
 */
function projectionAfter(id, objectId) {
  const task = getTask(id);
  sync(task);
  const mount = task.mounts.find((entry) => entry.kind === "object" && entry.id === objectId);
  if (!mount) throw taskError("task_object_unknown", "This task has no such lent document.", 404);
  const turn = task.turns.filter((entry) => !entry.rewound).pop() || lastTurn(task);
  if (!turn) throw taskError("task_not_ready", "This task has not started a turn yet.", 409);
  const { files, skipped } = runs.runObjectFiles(turn.id, objectId);
  return { taskId: task.id, objectId, name: mount.name, turn: turn.n, runId: turn.id, files, skipped };
}

/**
 * Stop the task's turn. Sent while a turn starts, it waits for the start (the
 * task's lock) and then stops the run that start made.
 * @param {string} id
 */
async function stopTask(id) {
  getTask(id);
  return withTaskLock(id, async () => {
    const task = getTask(id);
    sync(task);
    if (!STOPPABLE.has(task.state)) {
      if (task.state === "stopped") return { task: view(task) };
      throw taskError("task_not_active", "This task is not running.", 409);
    }
    const turn = lastTurn(task);
    if (turn) await runs.stopRun(turn.id).catch(() => {});
    task.state = "stopped";
    dropQueue(task, "stopped");
    persist(task);
    return { task: view(task) };
  });
}

/**
 * Settle frees what the task kept for going on: the snapshots and the lent
 * documents' bundle. The run records (shadows, changes, proposals) stay.
 * @param {Task} task
 */
function freeKept(task) {
  const dir = path.join(paths.tasksRoot(), task.id);
  paths.assertNotTemporary(dir);
  fs.rmSync(path.join(dir, "snapshots"), { recursive: true, force: true });
  fs.rmSync(objectsFile(task.id), { force: true });
  for (const turn of task.turns) turn.snapshot = null;
}

function settledError() {
  return taskError("task_not_active", "This task is settled; start a new one to go on.", 409);
}

/**
 * Settle the task. Like a stop, it waits for a turn that is starting, ends it,
 * and only then frees what the task kept, that turn's snapshot included.
 * @param {string} id
 */
async function settleTask(id) {
  getTask(id);
  return withTaskLock(id, async () => {
    const task = getTask(id);
    sync(task);
    if (task.state === "settled") return { task: view(task) };
    const turn = lastTurn(task);
    if (LIVE.has(task.state) && turn) await runs.stopRun(turn.id).catch(() => {});
    task.state = "settled";
    dropQueue(task, "settled");
    delete task.interrupted;
    freeKept(task);
    persist(task);
    return { task: view(task) };
  });
}

/**
 * @typedef {object} ForkInput
 * @property {string} [prompt]  the fork's first words; absent, turn N's own words again
 * @property {string} [title]
 * @property {string} [language]
 * @property {string} [engine]
 * @property {string} [model]
 * @property {number} [serverPort]
 * @property {string} [lmStudioBaseUrl]
 * @property {TurnInput["connectors"]} [connectors]
 */

/**
 * A new task that branches at turn `fromTurn` of another: its first turn
 * starts from the snapshot of what that turn found (so the tree is as it was
 * then), with the turns before it as history, and runs the writer's new
 * words or turn N's own again. The original task is not touched.
 * @param {string} id
 * @param {number} fromTurn
 * @param {ForkInput} [input]
 */
async function forkTask(id, fromTurn, input = {}) {
  const source = getTask(id);
  sync(source);
  if (source.state === "settled") throw settledError();
  const turn = Number.isInteger(fromTurn) ? source.turns.find((entry) => entry.n === fromTurn && !entry.rewound) : undefined;
  if (!turn) throw taskError("bad_turn", "This task has no such turn to fork from.", 400);
  let runState = "";
  try { runState = runs.getRun(turn.id).state; } catch {}
  if (["starting", "running", "stopping"].includes(runState)) throw taskError("task_not_ready", "That turn is still running; fork from a finished turn.", 409);
  if (!turn.snapshot || !fs.existsSync(turn.snapshot)) throw taskError("snapshot_missing", "That turn has no snapshot left to fork from.", 409);
  const objects = loadObjects(source);
  loadFromDisk();
  if (liveCount() >= MAX_ACTIVE_TASKS) throw taskError("task_limit", "Two tasks are already working; stop or settle one first.", 409);
  const prompt = String(input.prompt || "").trim() || turn.prompt;
  const earlier = turnBlocks(source.turns.filter((entry) => entry.n < turn.n));
  const approved = source.planApprovedTurn !== undefined && source.planApprovedTurn <= turn.n;
  const gated = source.planGate && !approved;
  /** @type {Task} */
  const forked = {
    id: `task-${crypto.randomUUID()}`,
    title: (String(input.title || "").trim() || `${source.title} (fork)`).slice(0, MAX_TITLE),
    state: gated ? "planning" : "working",
    mounts: source.mounts.map((mount) => ({ ...mount })),
    planGate: source.planGate,
    planApproved: approved,
    ...(approved ? { planApprovedTurn: 1 } : {}),
    engine: input.engine || source.engine,
    model: input.model || source.model,
    language: input.language || source.language,
    queue: [],
    turns: [],
    forkedFrom: { taskId: source.id, turn: turn.n, history: earlier.length ? `[This task is a fork of "${plainLine(source.title)}", branching at its turn ${turn.n}. The turns before the branch:]\n\n${earlier.join("\n\n")}` : "" },
    createdAt: new Date().toISOString(),
    usage: { tokens: 0 },
  };
  tasks.set(forked.id, forked);
  return withTaskLock(forked.id, async () => {
    try {
      persistObjects(forked.id, objects);
      const snapshot = snapshotPath(forked.id, 1);
      const run = await runs.createRun({
        taskTurn: true,
        snapshotTo: snapshot,
        seedWork: turn.snapshot || undefined,
        folderId: forked.mounts.find((mount) => mount.kind === "folder")?.id,
        objects,
        level: gated ? "read" : lowestLevel(forked.mounts),
        prompt,
        priorTurns: forked.forkedFrom?.history ? priorTurnsText(forked) : undefined,
        engine: forked.engine,
        model: forked.model,
        language: forked.language,
        serverPort: input.serverPort,
        lmStudioBaseUrl: input.lmStudioBaseUrl,
        connectors: input.connectors,
      });
      forked.turns.push({ id: run.runId, taskId: forked.id, n: 1, level: run.level, prompt, snapshot, tokens: 0, result: emptyResult() });
    } catch (error) {
      tasks.delete(forked.id);
      fs.rmSync(path.join(paths.tasksRoot(), forked.id), { recursive: true, force: true });
      throw error;
    }
    persist(forked);
    return { task: view(forked) };
  });
}

function resetTasksForTests() {
  tasks.clear();
  queueContext.clear();
}

module.exports = {
  MAX_ACTIVE_TASKS,
  MAX_QUEUE,
  OBJECT_MAX_BYTES,
  createTask,
  createTurn,
  forkTask,
  listTasks,
  projectionAfter,
  queueMessage,
  readTask,
  removeQueued,
  resetTasksForTests,
  rewindTask,
  settleTask,
  stopTask,
};
