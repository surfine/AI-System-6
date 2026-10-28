// Engine proposals: run-scoped candidates the engine offers the writer.
//
// Since runs stopped joining the desk's /mcp bridge (security review
// 2026-10-24), the engine's only output has been the shadow. This channel is
// the way back for the candidate kinds that are not file edits: a clip
// (scrap), a review note, a restore pack. The engine writes one JSON file per
// proposal into work/.ais6-proposals — a directory the kernel lets it write
// but never read (sandbox-profile.js) — and when the engine has exited, the
// host harvests the valid files into runs/<run>/proposals/, where they wait
// for the writer. Nothing here applies anything: adoption happens on the
// writer's side, one proposal at a time (R5 — AI output stays a candidate).
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

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { PROPOSALS_NAME, UNSAFE_NAME, safeRelative } = require("./shadow.js");

/** @typedef {"scrap" | "review" | "restore"} ProposalKind */
const KINDS = Object.freeze(["scrap", "review", "restore"]);
const MAX_BYTES = 256 * 1024;
const MAX_PER_RUN = 20;
/** A restore pack carries at most this many files. */
const MAX_RESTORE_FILES = 200;
/** Any one string inside a payload (a quote, a file body) is capped here. */
const MAX_TEXT = 200_000;
const MAX_TITLE = 200;
const MAX_REASON = 2000;

/** @param {any} value @param {number} max @returns {string | null} */
function cleanText(value, max) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

/**
 * The payload of one proposal, by kind; null when it does not fit the schema.
 * @param {ProposalKind} kind
 * @param {any} payload
 * @returns {Record<string, unknown> | null}
 */
function payloadFor(kind, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
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
 * would follow a link out of the channel.
 * @param {string} work  the shadow's work/ directory
 * @returns {{ gathered: Array<ReturnType<typeof parseProposal> & { id: string }>, dropped: number }}
 */
function collectProposals(work) {
  const dir = path.join(work, PROPOSALS_NAME);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { gathered: [], dropped: 0 };
  }
  const names = entries.filter((entry) => !entry.isDirectory()).map((entry) => entry.name).sort(byEngineOrder);
  /** @type {Array<ReturnType<typeof parseProposal> & { id: string }>} */
  const gathered = [];
  let dropped = 0;
  for (const name of names) {
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
  return { gathered, dropped };
}

/**
 * Harvest a run's shadow: collect the valid proposals into
 * runs/<run>/proposals/ (each pending), then remove the channel from the
 * shadow — the copies that leave are the run's, the engine's originals die
 * with the shadow.
 * @param {{ work: string, stateDir: string }} run
 * @returns {{ gathered: Array<ReturnType<typeof parseProposal> & { id: string }>, dropped: number }}
 */
function harvestProposals(run) {
  const { gathered, dropped } = collectProposals(run.work);
  if (gathered.length) {
    const store = storeDir(run.stateDir);
    fs.mkdirSync(store, { recursive: true });
    gathered.forEach((record, index) => {
      fs.writeFileSync(path.join(store, `${index + 1}.json`), `${JSON.stringify({ ...record, status: "pending" })}\n`);
    });
  }
  try {
    fs.rmSync(path.join(run.work, PROPOSALS_NAME), { recursive: true, force: true });
  } catch {}
  return { gathered, dropped };
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
 * @param {"accepted" | "discarded"} status
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
 * Stage a restore proposal's files into the shadow's work/, so the writer
 * puts them back through the ordinary per-file confirmation. The bytes come
 * from the stored proposal, never from the page; the names were validated at
 * harvest and are checked again here. Writes are atomic (a temp file beside
 * the target, then renamed), and no link is followed.
 * @param {{ work: string }} shadow
 * @param {{ payload: { files: Array<{ name: string, content: string }> } }} record
 * @returns {{ staged: string[] }}
 */
function stageRestore(shadow, record) {
  /** @type {string[]} */
  const staged = [];
  for (const file of record.payload.files || []) {
    const rel = safeRelative(String(file.name || ""));
    if (UNSAFE_NAME.test(rel)) continue;
    const target = path.join(shadow.work, ...rel.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temp = path.join(path.dirname(target), `.ais6-restore-${crypto.randomUUID()}`);
    fs.writeFileSync(temp, String(file.content || ""), "utf8");
    fs.renameSync(temp, target);
    staged.push(rel);
  }
  return { staged };
}

module.exports = {
  KINDS,
  MAX_BYTES,
  MAX_PER_RUN,
  PROPOSALS_NAME,
  collectProposals,
  findProposal,
  harvestProposals,
  listProposals,
  markProposal,
  parseProposal,
  stageRestore,
};
