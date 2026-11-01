// Schedules ("闹钟"): what the writer asked the engine to do while nobody is
// watching, and when.
//
// Like folders.json this is a capability kept on the server, not project data:
// a schedule names granted-folder ids that mean nothing on another Mac, and
// the trigger has to fire when no page is open. The file lives beside
// folders.json (paths.schedulesFile) and is never part of a backup. It holds
// the writer's own words (`prompt`, verbatim), ids and numbers; no file
// contents and no keys.
//
// Every definition is validated here, and the same validation runs again when
// the file is read back, so a hand-edited file cannot widen a schedule:
//   - `level` is the constant "read"; any other value is refused, never
//     coerced (the engine cannot change even its shadow under a read grant);
//   - `network` is false unless the writer set exactly true;
//   - every folder id is a granted folder (folders.resolveFolder);
//   - the numbers are bounded: tokenCap, wallMs, at most MAX_ENABLED enabled.
//
// The launcher and the trigger are in schedule-runner.js. Contract:
// tests/features/agent-schedules.test.mjs.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const paths = require("./paths.js");
const folders = require("./folders.js");

/** Owner ruling 2026-10-31 (doubling the proposal's numbers). */
const LIMITS = Object.freeze({
  /** unattended runs working at once */
  maxConcurrent: 2,
  /** runs one schedule may start in a local day, manual "run now" included */
  maxRunsPerDay: 2,
  /** schedules that may be enabled at once */
  maxEnabled: 8,
  defaultTokenCap: 60_000,
  minTokenCap: 1_000,
  maxTokenCap: 200_000,
  defaultWallMs: 20 * 60_000,
  minWallMs: 30_000,
  maxWallMs: 60 * 60_000,
  maxPromptChars: 20_000,
  maxTitleChars: 120,
  /** a standing intent's proposals are withdrawn when the writer never opened the run this long after it ended */
  withdrawAfterMs: 72 * 3_600_000,
});

/**
 * Trigger kinds. time: the clock. archive: the page's call after a real
 * manuscript save. folder: a new file in the schedule's granted folder.
 * startup: once after the server starts (the startup item).
 */
const TRIGGER_KINDS = Object.freeze(["time", "archive", "folder", "startup"]);

/**
 * @typedef {object} Schedule
 * @property {string} id
 * @property {string} title
 * @property {string} prompt  the writer's words, verbatim; every run is exactly this, with no history
 * @property {{ kind: "time", weekday: number | null, hour: number, minute: number } | { kind: "archive" | "folder" | "startup" }} trigger  time: local time, weekday 0 (Sunday) to 6, or null for every day
 * @property {boolean} standing  a standing intent ("帮我盯着…"): scoped to projectId, its proposals are withdrawn after 72 hours if never opened
 * @property {string} projectId  the one project an archive trigger or a standing intent watches; "" for neither
 * @property {string} roleId  opaque role id, stored for the roles lane; not interpreted here
 * @property {string[]} folderIds
 * @property {"read"} level
 * @property {boolean} network
 * @property {number} tokenCap
 * @property {number} wallMs
 * @property {boolean} enabled
 * @property {string} createdAt
 * @property {string} [lastRunAt]
 * @property {string} [lastRunId]
 * @property {string} [missedAt]  the fire point that passed without a run (server was off); never replayed
 * @property {string} [lastSkippedAt]  a due fire point the launcher refused (a cap, a busy folder, no engine): not retried
 * @property {string} [lastSkipCode]
 * @property {{ day: string, count: number }} [runsToday]  local day key and runs started that day
 */

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function scheduleError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/** @param {unknown} value */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @param {number} min @param {number} max */
function boundedInt(value, min, max) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * @param {unknown} trigger
 * @returns {Schedule["trigger"]}
 */
function validateTrigger(trigger) {
  if (!isPlainObject(trigger)) throw scheduleError("schedule_trigger_invalid", "A schedule needs a trigger.");
  const t = /** @type {any} */ (trigger);
  if (!TRIGGER_KINDS.includes(t.kind)) throw scheduleError("schedule_trigger_invalid", "Trigger kind must be time, archive or folder.");
  if (t.kind !== "time") return { kind: t.kind };
  const weekday = t.weekday === null || t.weekday === undefined ? null : t.weekday;
  if (weekday !== null && !boundedInt(weekday, 0, 6)) throw scheduleError("schedule_trigger_invalid", "weekday is 0 (Sunday) to 6, or null for every day.");
  if (!boundedInt(t.hour, 0, 23) || !boundedInt(t.minute, 0, 59)) throw scheduleError("schedule_trigger_invalid", "A time trigger needs an hour (0-23) and a minute (0-59).");
  return { kind: "time", weekday, hour: t.hour, minute: t.minute };
}

/**
 * Validate a full definition (create) or the merged result of an edit. Throws
 * the first problem; returns the cleaned fields. Unknown fields are dropped.
 * @param {any} input
 */
function validateDefinition(input) {
  if (!isPlainObject(input)) throw scheduleError("schedule_invalid", "A schedule is an object.");
  // The level is a constant. A missing level is the constant; anything else, even
  // "propose" or a differently cased "Read", is refused rather than corrected.
  if (input.level !== undefined && input.level !== "read") {
    throw scheduleError("schedule_level_refused", "A schedule always runs read-only; its level cannot be changed.", 400);
  }
  if (input.network !== undefined && typeof input.network !== "boolean") {
    throw scheduleError("schedule_invalid", "network is true or false.");
  }
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  if (!prompt.trim()) throw scheduleError("prompt_required", "A schedule needs the writer's words to run.");
  if (prompt.length > LIMITS.maxPromptChars) throw scheduleError("prompt_too_long", "Prompts are limited to 20,000 characters.", 413);
  const rawTitle = typeof input.title === "string" ? input.title.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  const title = (rawTitle || prompt.split("\n")[0].trim()).slice(0, LIMITS.maxTitleChars);
  const folderIds = Array.isArray(input.folderIds) ? input.folderIds.map(String) : [];
  // The engine mounts one working folder per run, so a schedule names one.
  if (folderIds.length !== 1) throw scheduleError("schedule_folder_required", "A schedule needs exactly one granted folder (a run mounts one folder).");
  for (const id of folderIds) folders.resolveFolder(id);
  const tokenCap = input.tokenCap === undefined ? LIMITS.defaultTokenCap : input.tokenCap;
  if (!boundedInt(tokenCap, LIMITS.minTokenCap, LIMITS.maxTokenCap)) {
    throw scheduleError("schedule_cap_invalid", `tokenCap is a whole number from ${LIMITS.minTokenCap} to ${LIMITS.maxTokenCap}.`);
  }
  const wallMs = input.wallMs === undefined ? LIMITS.defaultWallMs : input.wallMs;
  if (!boundedInt(wallMs, LIMITS.minWallMs, LIMITS.maxWallMs)) {
    throw scheduleError("schedule_cap_invalid", `wallMs is a whole number from ${LIMITS.minWallMs} to ${LIMITS.maxWallMs}.`);
  }
  const roleId = input.roleId === undefined ? "main" : String(input.roleId);
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(roleId)) throw scheduleError("schedule_invalid", "roleId is a short id of letters, digits, - and _.");
  const trigger = validateTrigger(input.trigger);
  const standing = input.standing === true;
  const projectId = typeof input.projectId === "string" ? input.projectId.trim().slice(0, 80) : "";
  // Projects stay isolated: what watches a project's manuscript, or stands
  // guard over it, names that one project.
  if ((standing || trigger.kind === "archive") && !projectId) {
    throw scheduleError("schedule_project_required", "An archive trigger or a standing intent names the one project it watches.");
  }
  if (standing && trigger.kind === "startup") throw scheduleError("schedule_trigger_invalid", "A standing intent reacts to an event or a daily check, not to startup.");
  return {
    title,
    prompt,
    trigger,
    standing,
    projectId,
    roleId,
    folderIds,
    level: /** @type {"read"} */ ("read"),
    network: input.network === true,
    tokenCap,
    wallMs,
    enabled: input.enabled !== false,
  };
}

/** @returns {{ version: number, schedules: Schedule[] }} */
function readRegistry() {
  try {
    const parsed = JSON.parse(fs.readFileSync(paths.schedulesFile(), "utf8"));
    if (parsed && Array.isArray(parsed.schedules)) return { version: 1, schedules: parsed.schedules };
  } catch {}
  return { version: 1, schedules: [] };
}

/** @param {{ version: number, schedules: Schedule[] }} registry */
function writeRegistry(registry) {
  const file = paths.schedulesFile();
  paths.assertNotTemporary(path.dirname(file));
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}

/**
 * Re-check a stored record the way a new one is checked, minus the folder
 * grant (a revoked grant is the launcher's refusal, not a reason to hide the
 * schedule from its owner). A record whose level or network is not what the
 * API could have written is read back as the safe values: read, no network.
 * @param {any} record
 * @returns {Schedule | null}
 */
function normalizeStored(record) {
  if (!isPlainObject(record) || typeof record.id !== "string" || !/^sch-[0-9a-f-]{36}$/.test(record.id)) return null;
  let trigger;
  try { trigger = validateTrigger(record.trigger); } catch { return null; }
  const folderIds = Array.isArray(record.folderIds) ? record.folderIds.map(String).slice(0, 1) : [];
  const clamp = (value, min, max, fallback) => (boundedInt(value, min, max) ? value : fallback);
  /** @type {Schedule} */
  const out = {
    id: record.id,
    title: String(record.title || "").slice(0, LIMITS.maxTitleChars),
    prompt: String(record.prompt || "").slice(0, LIMITS.maxPromptChars),
    trigger,
    standing: record.standing === true,
    projectId: typeof record.projectId === "string" ? record.projectId.slice(0, 80) : "",
    roleId: /^[a-z0-9][a-z0-9_-]{0,39}$/.test(String(record.roleId || "")) ? String(record.roleId) : "main",
    folderIds,
    level: "read",
    network: record.network === true,
    tokenCap: clamp(record.tokenCap, LIMITS.minTokenCap, LIMITS.maxTokenCap, LIMITS.defaultTokenCap),
    wallMs: clamp(record.wallMs, LIMITS.minWallMs, LIMITS.maxWallMs, LIMITS.defaultWallMs),
    enabled: record.enabled !== false,
    createdAt: String(record.createdAt || ""),
  };
  for (const key of ["lastRunAt", "lastRunId", "missedAt", "lastSkippedAt", "lastSkipCode"]) {
    if (typeof record[key] === "string" && record[key]) /** @type {any} */ (out)[key] = record[key];
  }
  if (isPlainObject(record.runsToday) && typeof record.runsToday.day === "string" && boundedInt(record.runsToday.count, 0, 1000)) {
    out.runsToday = { day: record.runsToday.day, count: record.runsToday.count };
  }
  return out;
}

/** @returns {Schedule[]} */
function listSchedules() {
  return readRegistry().schedules.map(normalizeStored).filter((s) => s !== null).map((s) => /** @type {Schedule} */ (s));
}

/** @param {string} id @returns {Schedule} */
function getSchedule(id) {
  const found = listSchedules().find((s) => s.id === String(id || ""));
  if (!found) throw scheduleError("schedule_unknown", "No schedule has that id.", 404);
  return found;
}

/** @param {Schedule[]} list @param {string} [exceptId] */
function assertRoomToEnable(list, exceptId) {
  if (list.filter((s) => s.enabled && s.id !== exceptId).length >= LIMITS.maxEnabled) {
    throw scheduleError("schedule_too_many", `At most ${LIMITS.maxEnabled} schedules can be on at once; turn one off first.`, 409);
  }
}

/**
 * @param {any} input
 * @param {{ now?: Date }} [options]
 * @returns {Schedule}
 */
function createSchedule(input, options = {}) {
  const fields = validateDefinition(input);
  const list = listSchedules();
  if (fields.enabled) assertRoomToEnable(list);
  /** @type {Schedule} */
  const schedule = { id: `sch-${crypto.randomUUID()}`, ...fields, createdAt: (options.now || new Date()).toISOString() };
  writeRegistry({ version: 1, schedules: [...list, schedule] });
  return schedule;
}

/**
 * Edit the definition fields of a schedule. The merged result goes through
 * the same validation as a new one, so an edit cannot raise the level either.
 * @param {string} id
 * @param {any} patch
 * @returns {Schedule}
 */
function updateSchedule(id, patch) {
  if (!isPlainObject(patch)) throw scheduleError("schedule_invalid", "An edit is an object.");
  const list = listSchedules();
  const current = list.find((s) => s.id === String(id || ""));
  if (!current) throw scheduleError("schedule_unknown", "No schedule has that id.", 404);
  const editable = ["title", "prompt", "trigger", "standing", "projectId", "roleId", "folderIds", "level", "network", "tokenCap", "wallMs", "enabled"];
  const merged = { ...current };
  for (const key of editable) if (key in patch) /** @type {any} */ (merged)[key] = patch[key];
  const fields = validateDefinition(merged);
  if (fields.enabled && !current.enabled) assertRoomToEnable(list, current.id);
  const next = { ...current, ...fields };
  // Changing when it fires restarts the missed/skip watermark questions: the
  // old fire points no longer describe this schedule.
  if (JSON.stringify(fields.trigger) !== JSON.stringify(current.trigger)) {
    delete next.missedAt;
    delete next.lastSkippedAt;
    delete next.lastSkipCode;
    next.createdAt = new Date().toISOString();
  }
  writeRegistry({ version: 1, schedules: list.map((s) => (s.id === current.id ? next : s)) });
  return next;
}

/**
 * Record launcher bookkeeping (lastRunAt, missedAt, …) on a stored schedule.
 * Never touches the definition fields.
 * @param {string} id
 * @param {Partial<Pick<Schedule, "lastRunAt" | "lastRunId" | "missedAt" | "lastSkippedAt" | "lastSkipCode" | "runsToday">> & { clearMissed?: boolean, clearSkip?: boolean }} marks
 * @returns {Schedule | null}
 */
function markSchedule(id, marks) {
  const list = listSchedules();
  const current = list.find((s) => s.id === id);
  if (!current) return null;
  const { clearMissed, clearSkip, ...values } = marks;
  const next = { ...current, ...values };
  if (clearMissed) delete next.missedAt;
  if (clearSkip) {
    delete next.lastSkippedAt;
    delete next.lastSkipCode;
  }
  writeRegistry({ version: 1, schedules: list.map((s) => (s.id === id ? next : s)) });
  return next;
}

/** @param {string} id */
function deleteSchedule(id) {
  const list = listSchedules();
  if (!list.some((s) => s.id === String(id || ""))) return false;
  writeRegistry({ version: 1, schedules: list.filter((s) => s.id !== String(id || "")) });
  return true;
}

module.exports = {
  LIMITS,
  TRIGGER_KINDS,
  createSchedule,
  deleteSchedule,
  getSchedule,
  listSchedules,
  markSchedule,
  scheduleError,
  updateSchedule,
  validateDefinition,
};
