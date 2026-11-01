// Engine proposals: run-scoped candidates the engine offers the writer.
//
// Since runs stopped joining the desk's /mcp bridge (security review
// 2026-10-24), the engine's only output has been the shadow. This channel is
// the way back for the candidate kinds that are not file edits: a clip
// (scrap), a review note, a restore pack. The engine writes one JSON file per
// proposal into work/.ais6-proposals — a link to the shadow's
// tmp/.ais6-proposals, a directory the kernel lets it write but never read
// (sandbox-profile.js) — and when the engine has exited, the
// host harvests the valid files into runs/<run>/proposals/, where they wait
// for the writer. Nothing here applies anything: adoption happens on the
// writer's side, one proposal at a time (R5 — AI output stays a candidate).
//
// Task kinds (AGENT-TASKS-API): plan, question, deliver, flag and new-document
// are the errand's own channel — a plan to approve, a question to answer, the
// hand-over summary, a flag on a passage, and a document the writer may ask
// to have created. They are data like the rest; the task layer only reads
// them (a pending question holds the task for an answer).
//
// A task's read-level turn (the plan gate, or a mount shared read-only) may
// offer only plans and questions (READ_KINDS); anything else it left in the
// channel is dropped and counted like a malformed file.
//
// The schema is a whitelist; unknown fields are dropped, and a proposal that
// does not parse or fit the limits is dropped whole and only counted. Payload
// values are data. Nothing in this module evaluates them, and the desktop
// renders them as data too — a proposal is never an instruction.
//
// Limits (design 2026-10-26): one proposal file at most 256 KiB, at most 20
// proposals per run. Both are enforced at harvest; a file past them never
// reaches the run's state.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { PROPOSALS_NAME, UNSAFE_NAME, afterWork, checkShadow, directoryChain, isEnvLayer, noLinkWriteTarget, safeRelative, verifyDirectoryChain } = require("./shadow.js");

/** @typedef {"scrap" | "review" | "restore" | "plan" | "question" | "deliver" | "flag" | "new-document" | "skill" | "memory" | "handoff"} ProposalKind */
const KINDS = Object.freeze(["scrap", "review", "restore", "plan", "question", "deliver", "flag", "new-document", "skill", "memory", "handoff"]);
/**
 * A skill or a memory the engine suggests after a task (M8 S3/S4). The page's
 * gate (features/extensions-library.js) decides whether one is kept at all;
 * here the schema is checked and at most one per run is harvested, so a run
 * cannot flood the writer's waiting list. A task's read-level turn never
 * offers them: READ_KINDS holds only plan and question.
 */
const EXTENSION_KINDS = Object.freeze(["skill", "memory"]);
const MAX_PER_RUN_EXTENSION = 1;
const MAX_SKILL_STEPS = 20;
const MAX_SKILL_TOOLS = 20;
const MAX_SKILL_NAME = 80;
const MAX_MEMORY_TEXT = 4000;

/**
 * The desk tool list; without it no skill is accepted, since its tools cannot be checked.
 * @type {{ isKnownToolId: (id: string) => boolean } | null}
 */
let toolRegistry = null;
/** The built-in roles; a handoff names one of them (never the main agent). @type {{ byId: (id: string) => ({ main: boolean } | null) } | null} */
let agentRoles = null;
try {
  agentRoles = require("../../../desktop/app/core/agent-roles.js");
} catch {
  agentRoles = null;
}
try {
  toolRegistry = require("../../../desktop/app/core/agent-tool-registry.js");
} catch {
  toolRegistry = null;
}
/** The only kinds a task's read-level turn may offer. */
const READ_KINDS = Object.freeze(["plan", "question"]);
/** The only kinds an unattended (scheduled) run may offer; the rest are dropped and counted. */
const UNATTENDED_KINDS = Object.freeze(["scrap", "flag", "plan", "question"]);
const MAX_BYTES = 256 * 1024;
const MAX_PER_RUN = 20;
/** A restore pack carries at most this many files. */
const MAX_RESTORE_FILES = 200;
/** Any one string inside a payload (a quote, a file body) is capped here. */
const MAX_TEXT = 200_000;
const MAX_TITLE = 200;
const MAX_REASON = 2000;
const MAX_PLAN_STEPS = 50;
const MAX_TOUCHES = 10;
const MAX_OPTIONS = 4;
const DOCUMENT_FORMATS = Object.freeze(["docx", "xlsx", "pptx", "md"]);
// The progress ledger a task turn's engine keeps (ledger.json in the channel):
// not a proposal, so it is neither counted nor offered to the writer.
const LEDGER_NAME = "ledger.json";
const LEDGER_ITEMS = 8;
const LEDGER_TEXT = 300;

/** @param {any} value @param {number} max @returns {string | null} */
function cleanText(value, max) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

/** A non-empty string within the cap, trimmed; null when it is not one. @param {any} value @param {number} max @returns {string | null} */
function requiredText(value, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max) return null;
  return value.trim();
}

/**
 * The payload of a task kind (plan, question, deliver, flag, new-document);
 * null when it does not fit. Nothing is truncated: a malformed one is
 * dropped whole, like the rest.
 * @param {string} kind
 * @param {Record<string, any>} payload
 * @returns {Record<string, unknown> | null}
 */
function taskPayloadFor(kind, payload) {
  if (kind === "plan") {
    if (!Array.isArray(payload.steps) || !payload.steps.length || payload.steps.length > MAX_PLAN_STEPS) return null;
    /** @type {Array<{ text: string, touches: string[] }>} */
    const steps = [];
    for (const step of payload.steps) {
      if (!step || typeof step !== "object" || Array.isArray(step)) return null;
      const text = requiredText(step.text, MAX_REASON);
      const touches = step.touches === undefined ? [] : step.touches;
      if (!text || !Array.isArray(touches) || touches.length > MAX_TOUCHES) return null;
      const names = touches.map((name) => requiredText(name, MAX_TITLE));
      if (names.some((name) => name === null)) return null;
      steps.push({ text, touches: /** @type {string[]} */ (names) });
    }
    return { steps };
  }
  if (kind === "question") {
    const text = requiredText(payload.text, MAX_REASON);
    const raw = payload.options === undefined ? [] : payload.options;
    if (!text || !Array.isArray(raw) || raw.length > MAX_OPTIONS) return null;
    const options = raw.map((option) => requiredText(option, MAX_TITLE));
    if (options.some((option) => option === null)) return null;
    return { text, options };
  }
  if (kind === "deliver") {
    const summary = requiredText(payload.summary, MAX_TEXT);
    return summary ? { summary } : null;
  }
  if (kind === "flag") {
    const target = payload.target;
    if (!target || typeof target !== "object" || Array.isArray(target)) return null;
    const mount = requiredText(target.mount, MAX_TITLE);
    const note = requiredText(payload.note, MAX_REASON);
    const anchors = ["quote", "address", "slide"].filter((key) => target[key] !== undefined);
    if (!mount || !note || anchors.length !== 1) return null;
    const anchor = anchors[0];
    const value = anchor === "slide"
      ? (Number.isInteger(target.slide) && target.slide >= 1 ? target.slide : null)
      : requiredText(target[anchor], anchor === "quote" ? MAX_TEXT : MAX_TITLE);
    return value === null ? null : { target: { mount, [anchor]: value }, note };
  }
  // new-document: created only when the writer asks, by the page's codecs.
  const name = requiredText(payload.name, MAX_TITLE);
  if (!DOCUMENT_FORMATS.includes(payload.format) || !name || UNSAFE_NAME.test(name) || /[\\/]/.test(name)) return null;
  if (typeof payload.content !== "string" || !payload.content.trim() || payload.content.length > MAX_TEXT) return null;
  return { format: payload.format, name, content: payload.content };
}

/**
 * The payload of a skill or memory proposal; null when it does not fit.
 * A skill names its tools only by ids of the closed desk tool list, and one
 * unknown id drops the whole proposal. Nothing is truncated.
 * @param {"skill" | "memory"} kind
 * @param {Record<string, any>} payload
 * @returns {Record<string, unknown> | null}
 */
function extensionPayloadFor(kind, payload) {
  if (kind === "memory") {
    const text = requiredText(payload.text, MAX_MEMORY_TEXT);
    if (!text) return null;
    const reason = cleanText(payload.reason, MAX_REASON);
    const level = payload.scope === "desktop" ? { scope: "desktop" } : {};
    return reason && reason.trim() ? { text, reason: reason.trim(), ...level } : { text, ...level };
  }
  const name = requiredText(payload.name, MAX_SKILL_NAME);
  const whenToUse = requiredText(payload.whenToUse, MAX_REASON);
  const rawTools = payload.tools === undefined ? [] : payload.tools;
  if (!name || !whenToUse || !toolRegistry) return null;
  if (!Array.isArray(payload.steps) || !payload.steps.length || payload.steps.length > MAX_SKILL_STEPS) return null;
  if (!Array.isArray(rawTools) || rawTools.length > MAX_SKILL_TOOLS) return null;
  /** @type {Array<{ text: string }>} */
  const steps = [];
  for (const step of payload.steps) {
    if (!step || typeof step !== "object" || Array.isArray(step)) return null;
    const text = requiredText(step.text, MAX_REASON);
    if (!text) return null;
    steps.push({ text });
  }
  /** @type {string[]} */
  const tools = [];
  for (const id of rawTools) {
    if (typeof id !== "string" || !toolRegistry.isKnownToolId(id) || tools.includes(id)) return null;
    tools.push(id);
  }
  return payload.scope === "desktop" ? { name, whenToUse, steps, tools, scope: "desktop" } : { name, whenToUse, steps, tools };
}

/**
 * The payload of one proposal, by kind; null when it does not fit the schema.
 * @param {ProposalKind} kind
 * @param {any} payload
 * @returns {Record<string, unknown> | null}
 */
function payloadFor(kind, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (kind === "plan" || kind === "question" || kind === "deliver" || kind === "flag" || kind === "new-document") return taskPayloadFor(kind, payload);
  if (kind === "skill" || kind === "memory") return extensionPayloadFor(kind, payload);
  if (kind === "handoff") {
    // A sub-task for a built-in role; the page checks the writer's switch and starts the sub-turn.
    const role = requiredText(payload.role, 40);
    const task = requiredText(payload.task, MAX_REASON);
    const entry = role && agentRoles ? agentRoles.byId(role) : null;
    return entry && !entry.main && task ? { role, task } : null;
  }
  if (kind === "scrap") {
    const quoted = cleanText(payload.quoted, MAX_TEXT);
    const source = cleanText(payload.source, 400);
    if (!quoted || !quoted.trim() || source === null) return null;
    /** @type {Record<string, unknown>} */
    const out = { quoted, source };
    const note = cleanText(payload.note, MAX_REASON);
    if (note) out.note = note;
    return out;
  }
  if (kind === "review") {
    const quote = cleanText(payload.quote, MAX_TEXT);
    const comment = cleanText(payload.comment, MAX_TEXT);
    if (!quote || !quote.trim() || !comment || !comment.trim()) return null;
    return { quote, comment };
  }
  // restore: a list of { name, content }, verbatim, restored only file by
  // file through the writer's own confirmation.
  if (!Array.isArray(payload.files) || !payload.files.length || payload.files.length > MAX_RESTORE_FILES) return null;
  /** @type {Array<{ name: string, content: string }>} */
  const files = [];
  const seen = new Set();
  for (const entry of payload.files) {
    if (!entry || typeof entry !== "object") return null;
    const content = cleanText(entry.content, MAX_TEXT);
    if (content === null) return null;
    let rel;
    try {
      rel = safeRelative(String(entry.name || ""));
    } catch {
      return null;
    }
    if (UNSAFE_NAME.test(rel) || seen.has(rel)) return null;
    seen.add(rel);
    files.push({ name: rel, content });
  }
  return { files };
}

/**
 * One harvested proposal file's bytes → a whitelisted record, or null when the
 * file is not a proposal (wrong shape, wrong version, unknown kind, empty
 * title). Unknown fields are simply not copied.
 * @param {Buffer} bytes
 * @returns {{ v: 1, kind: ProposalKind, title: string, reason: string, payload: Record<string, unknown>, createdAt: string } | null}
 */
function parseProposal(bytes) {
  let doc;
  try {
    doc = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  if (doc.v !== 1) return null;
  if (!KINDS.includes(doc.kind)) return null;
  const title = cleanText(doc.title, MAX_TITLE);
  if (!title || !title.trim()) return null;
  const payload = payloadFor(doc.kind, doc.payload);
  if (!payload) return null;
  const createdAt = typeof doc.createdAt === "string" && !Number.isNaN(Date.parse(doc.createdAt)) ? doc.createdAt : new Date().toISOString();
  return { v: 1, kind: doc.kind, title: title.trim(), reason: cleanText(doc.reason, MAX_REASON) || "", payload, createdAt };
}

/**
 * The engine's progress ledger: short lists of facts, what is done and what
 * is next, whether it thinks it is stuck or looping, and the step that keeps
 * failing. Anything else is dropped; null when the file is not an object.
 * @param {Buffer} bytes
 * @returns {{ facts: string[], done: string[], next: string[], stuck: boolean, looping: boolean, failingStep: string } | null}
 */
function parseLedger(bytes) {
  let doc;
  try { doc = JSON.parse(bytes.toString("utf8")); } catch { return null; }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const list = (/** @type {any} */ value) => (Array.isArray(value) ? value : []).filter((entry) => typeof entry === "string" && entry.trim())
    .slice(0, LEDGER_ITEMS).map((entry) => entry.trim().slice(0, LEDGER_TEXT));
  return {
    facts: list(doc.facts),
    done: list(doc.done),
    next: list(doc.next),
    stuck: doc.stuck === true,
    looping: doc.looping === true,
    failingStep: typeof doc.failingStep === "string" ? doc.failingStep.trim().slice(0, LEDGER_TEXT) : "",
  };
}

/** The proposal store of a run: runs/<run>/proposals/. @param {string} stateDir */
function storeDir(stateDir) {
  return path.join(stateDir, "proposals");
}

/** Engine file names sort by their leading number, then bytewise. @param {string} a @param {string} b */
function byEngineOrder(a, b) {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}

/**
 * Read and validate whatever sits in a shadow's proposal directory. Nothing is
 * written here: the caller decides where the records go. Symlinks and other
 * non-regular files count as dropped — the engine makes them, and reading one
 * would follow a link out of the channel. A channel that is itself a link
 * (the engine can swap one in) is not read at all.
 * @param {string} work  the shadow's work/ directory
 * @param {string} [channel]  the channel directory; work/.ais6-proposals by default
 * @param {{ kinds?: string[] }} [options]  kinds: the only kinds this run may offer (a task's read-level turn: plan and question); any other valid proposal is dropped and counted like a malformed one
 * @returns {{ gathered: Array<ReturnType<typeof parseProposal> & { id: string }>, dropped: number, ledger?: NonNullable<ReturnType<typeof parseLedger>> }}
 */
function collectProposals(work, channel, options = {}) {
  const dir = channel || path.join(work, PROPOSALS_NAME);
  let entries;
  try {
    // work/ itself and the channel by lstat: a link in either place is not
    // read through. (A channel elsewhere is the caller's to check first:
    // harvestProposals runs checkShadow.)
    const workStat = fs.lstatSync(work);
    if (workStat.isSymbolicLink() || !workStat.isDirectory()) return { gathered: [], dropped: 0 };
    if (!fs.lstatSync(dir).isDirectory()) return { gathered: [], dropped: 0 };
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { gathered: [], dropped: 0 };
  }
  const names = entries.filter((entry) => !entry.isDirectory()).map((entry) => entry.name).sort(byEngineOrder);
  /** @type {Array<ReturnType<typeof parseProposal> & { id: string }>} */
  const gathered = [];
  let dropped = 0;
  /** @type {ReturnType<typeof parseLedger>} */
  let ledger = null;
  let extensions = 0;
  let handoffs = 0;
  for (const name of names) {
    if (name === LEDGER_NAME) {
      try {
        const full = path.join(dir, name);
        const stat = fs.lstatSync(full);
        if (stat.isFile() && stat.size <= MAX_BYTES) ledger = parseLedger(fs.readFileSync(full));
      } catch {}
      continue;
    }
    // Past the per-run cap every remaining file is dropped without a read.
    if (gathered.length >= MAX_PER_RUN) {
      dropped += 1;
      continue;
    }
    const full = path.join(dir, name);
    let record = null;
    try {
      // A link or an oversized file is dropped without a read; each file is
      // counted once, here, and never again below.
      const stat = fs.lstatSync(full);
      if (stat.isFile() && stat.size <= MAX_BYTES) record = parseProposal(fs.readFileSync(full));
      if (record && options.kinds && !options.kinds.includes(record.kind)) record = null;
      if (record && EXTENSION_KINDS.includes(record.kind)) {
        // One skill or memory per run; the rest are dropped and counted.
        if (extensions >= MAX_PER_RUN_EXTENSION) record = null;
        else extensions += 1;
      }
      // One handoff per run: the page runs the sub-turn after this one ends.
      if (record && record.kind === "handoff") {
        if (handoffs >= 1) record = null;
        else handoffs += 1;
      }
    } catch {
      record = null;
    }
    if (!record) {
      dropped += 1;
      continue;
    }
    record.id = `pr-${gathered.length + 1}`;
    gathered.push(record);
  }
  return { gathered, dropped, ...(ledger ? { ledger } : {}) };
}

/**
 * Harvest a run's shadow: collect the valid proposals into
 * runs/<run>/proposals/ (each pending), then remove the channel from the
 * shadow — the copies that leave are the run's, the engine's originals die
 * with the shadow. The tree read is the run's after-tree (frozen/ once the
 * run froze its shadow). The shadow's folders are checked first
 * (checkShadow: no root swapped for a link or another folder since the clone
 * or the freeze), so neither the read nor the removal can reach outside the
 * shadow; a failed check throws `shadow_tampered` and nothing is read,
 * stored or removed.
 * @param {{ work: string, stateDir: string, proposals?: string, root?: string, base?: string, tmp?: string, frozen?: string, tmpFrozen?: string }} run  the run's shadow; `proposals` is the channel (tmp/.ais6-proposals, or tmp-frozen/ once frozen)
 * @param {{ kinds?: string[] }} [options]  see collectProposals
 * @returns {{ gathered: Array<ReturnType<typeof parseProposal> & { id: string }>, dropped: number, ledger?: NonNullable<ReturnType<typeof parseLedger>> }}
 */
function harvestProposals(run, options = {}) {
  checkShadow(run);
  const workTree = afterWork(run);
  const channel = run.proposals || path.join(workTree, PROPOSALS_NAME);
  // An engine that could not write through the channel's link (Codex) wrote a
  // real folder at work/.ais6-proposals: its plain files join the channel.
  try {
    const inWork = path.join(workTree, PROPOSALS_NAME);
    if (inWork !== channel && fs.lstatSync(inWork).isDirectory() && fs.lstatSync(channel).isDirectory()) {
      for (const entry of fs.readdirSync(inWork, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const from = path.join(inWork, entry.name);
        if (fs.lstatSync(from).size <= MAX_BYTES) fs.copyFileSync(from, path.join(channel, entry.name), fs.constants.COPYFILE_EXCL);
      }
    }
  } catch {}
  const { gathered, dropped, ledger } = collectProposals(workTree, channel, options);
  if (ledger) {
    fs.mkdirSync(run.stateDir, { recursive: true });
    fs.writeFileSync(path.join(run.stateDir, LEDGER_NAME), `${JSON.stringify(ledger)}\n`);
  }
  if (gathered.length) {
    const store = storeDir(run.stateDir);
    fs.mkdirSync(store, { recursive: true });
    gathered.forEach((record, index) => {
      fs.writeFileSync(path.join(store, `${index + 1}.json`), `${JSON.stringify({ ...record, status: "pending" })}\n`);
    });
  }
  // The channel and the engine's way to it (work/.ais6-proposals: the link,
  // or the folder itself in an older shadow). rmSync never follows a link.
  for (const entry of new Set([channel, path.join(workTree, PROPOSALS_NAME)])) {
    try {
      fs.rmSync(entry, { recursive: true, force: true });
    } catch {}
  }
  return { gathered, dropped, ...(ledger ? { ledger } : {}) };
}

/**
 * The ledger the engine left in a run, or null.
 * @param {string} stateDir
 */
function readLedger(stateDir) {
  try { return parseLedger(fs.readFileSync(path.join(stateDir, LEDGER_NAME))); } catch { return null; }
}

/**
 * A proposal the host itself posts into a run's store (a task's stuck
 * report), pending, after the engine's own.
 * @param {string} stateDir
 * @param {{ kind: string, title: string, reason?: string, payload: Record<string, unknown> }} record
 */
function addHostProposal(stateDir, record) {
  const store = storeDir(stateDir);
  fs.mkdirSync(store, { recursive: true });
  const id = `pr-${readStore(stateDir).length + 1}`;
  const full = { v: 1, reason: "", createdAt: new Date().toISOString(), ...record, id, status: "pending" };
  fs.writeFileSync(path.join(store, `${readStore(stateDir).length + 1}.json`), `${JSON.stringify(full)}\n`);
  return full;
}

/** @param {string} stateDir */
function readStore(stateDir) {
  const store = storeDir(stateDir);
  let names;
  try {
    names = fs.readdirSync(store);
  } catch {
    return [];
  }
  /** @type {any[]} */
  const out = [];
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort(byEngineOrder)) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(store, name), "utf8")));
    } catch {}
  }
  return out;
}

/**
 * A run's proposals as the page sees them, pending first, in engine order.
 * @param {string} stateDir
 */
function listProposals(stateDir) {
  return readStore(stateDir).filter((record) => record && record.id && KINDS.includes(record.kind))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "pending" ? -1 : 1));
}

/**
 * One proposal by id, or null.
 * @param {string} stateDir
 * @param {string} id
 */
function findProposal(stateDir, id) {
  return readStore(stateDir).find((record) => record && record.id === String(id || "")) || null;
}

/**
 * Rewrite one stored proposal's status. Returns the updated record, or null
 * when there is no such file.
 * @param {string} stateDir
 * @param {string} id
 * @param {"accepted" | "discarded" | "rewound" | "withdrawn"} status
 */
function markProposal(stateDir, id, status) {
  const wanted = String(id || "");
  const store = storeDir(stateDir);
  let names;
  try {
    names = fs.readdirSync(store);
  } catch {
    return null;
  }
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort(byEngineOrder)) {
    const file = path.join(store, name);
    let record;
    try {
      record = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (!record || record.id !== wanted) continue;
    record.status = status;
    record.statusAt = new Date().toISOString();
    fs.writeFileSync(file, `${JSON.stringify(record)}\n`);
    return record;
  }
  return null;
}

/**
 * Stage a restore proposal's files so the writer puts them back through the
 * ordinary per-file confirmation. The bytes come from the stored proposal,
 * never from the page; the names were validated at harvest and are checked
 * again here. Two steps, so a survivor of the engine's process group cannot
 * race the write (p4/p5):
 *
 *   1. the bytes land in the run's own `stage/` folder (shadows/<run>/stage,
 *      created by createShadow) — the engine's sandbox names no write
 *      allowance for it, so nothing of the engine can touch them there;
 *   2. each file is then moved into the run's after-tree — frozen/ once the
 *      run froze its shadow (a name no write allowance of anything the
 *      engine's processes may still carry covers), work/ while it lives:
 *      runs.js refuses to stage while the engine's process group is alive or
 *      the shadow is not frozen, and the move repeats the noLinkWriteTarget
 *      lstat check from the tree's root down immediately before its rename,
 *      so the check and the rename are one step apart.
 *
 * The server makes these writes on an engine-authored name in a tree the
 * engine shaped, so no link is followed: every level is lstat'ed and a link
 * anywhere on the path (a folder on the way or the file itself, pointing out
 * of the shadow or back into it) refuses that file, as does a `.env*` name,
 * which would never be listed or put back. The move carries a belt
 * (directoryChain): the directories the rename resolves through are
 * re-checked after it, and the file must land with the staged copy's own
 * dev/ino — rename follows whatever a racer left in an intermediate
 * directory, and a swap that lands between two syscalls is caught. A rename
 * that fails unlinks the staged copy — no temp file is left behind for the
 * writer to put back. The shadow's own folders are checked first
 * (checkShadow); a swapped tree throws `shadow_tampered`.
 * @param {{ work: string, root?: string, base?: string, tmp?: string, stateDir?: string, frozen?: string, tmpFrozen?: string }} shadow
 * @param {{ payload: { files: Array<{ name: string, content: string }> }} } record
 * @returns {{ staged: string[], refused: Array<{ name: string, reason: string }> }}
 */
function stageRestore(shadow, record) {
  /** @type {string[]} */
  const staged = [];
  /** @type {Array<{ name: string, reason: string }>} */
  const refused = [];
  checkShadow(shadow);
  const workTree = afterWork(shadow);
  const stage = path.join(shadow.root || path.dirname(shadow.work), "stage");
  fs.mkdirSync(stage, { recursive: true });
  for (const file of record.payload.files || []) {
    const name = String(file.name || "");
    let stagedFile = "";
    try {
      const rel = safeRelative(name);
      if (UNSAFE_NAME.test(rel)) throw Object.assign(new Error(`Unsafe name: ${rel}`), { code: "unsafe_name" });
      if (rel.split("/").some(isEnvLayer)) throw Object.assign(new Error(`An environment layer is never staged: ${rel}`), { code: "env_layer" });
      // 1) the bytes, in the folder the engine cannot write.
      stagedFile = noLinkWriteTarget(stage, rel, { create: true });
      fs.writeFileSync(stagedFile, String(file.content || ""), { encoding: "utf8", flag: "wx" });
      // 2) the move into the run's tree, checked and renamed in one step,
      //    with the belt proving where it landed. The directory chain is
      //    re-verified immediately before the rename too: a swap between the
      //    capture and the move would otherwise be followed, and a swap that
      //    lands inside that last gap is caught after it.
      const target = noLinkWriteTarget(workTree, rel, { create: true });
      const stagedStat = fs.lstatSync(stagedFile, { bigint: true });
      const dirs = directoryChain(workTree, rel);
      verifyDirectoryChain(dirs, rel);
      fs.renameSync(stagedFile, target);
      verifyDirectoryChain(dirs, rel);
      const landed = fs.lstatSync(target, { bigint: true });
      if (landed.dev !== stagedStat.dev || landed.ino !== stagedStat.ino) {
        throw Object.assign(new Error(`The move landed somewhere else: ${rel}`), { code: "link_refused" });
      }
      stagedFile = "";
      staged.push(rel);
    } catch (error) {
      if (stagedFile) { try { fs.unlinkSync(stagedFile); } catch {} }
      refused.push({ name, reason: String(/** @type {any} */ (error)?.code || "refused") });
    }
  }
  return { staged, refused };
}

module.exports = {
  LEDGER_NAME,
  addHostProposal,
  readLedger,
  EXTENSION_KINDS,
  KINDS,
  MAX_BYTES,
  MAX_PER_RUN,
  PROPOSALS_NAME,
  READ_KINDS,
  UNATTENDED_KINDS,
  collectProposals,
  findProposal,
  harvestProposals,
  listProposals,
  markProposal,
  parseProposal,
  stageRestore,
};
