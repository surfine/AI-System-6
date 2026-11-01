// The clock and the launcher of schedules (schedules.js).
//
// A timer inside the server wakes every TICK_MS and asks, for each enabled
// schedule, "has a fire point passed that nothing has dealt with?". No page,
// request or browser takes part: AI System 6 being open is enough.
//
// What "a fire point passed" means, and why nothing here replays:
//   - the fire point is the latest moment at or before `now` that the
//     schedule's time trigger names (every day, or one weekday, local time);
//   - it is dealt with when a run started at or after it (lastRunAt), when it
//     was marked missed (missedAt), or when the launcher refused it
//     (lastSkippedAt). Schedules created after it never owned it (createdAt);
//   - a fire point that is more than GRACE_MS old when the tick sees it, and
//     every fire point that passed while the server was off, is marked missed
//     and never run. markMissedOnStart does the second kind once at boot,
//     before the first tick. There is no retry of any kind: a refused launch
//     is recorded and left;
//   - the only way a missed schedule runs is runNow(id), which the writer
//     asks for ("现在跑").
//
// A run is started through runs.createRun with `unattended: true`, which
// forces read level, harvests only the unattended proposal kinds, hands the
// engine a patch with no web tool unless this schedule's network is true, and
// stops the run at its token cap and wall clock (runs.js). The prompt is the
// schedule's own text, with no history and no project memory.
//
// Other triggers go through the same launch(): "archive" is the page's
// POST /:id/trigger after a real manuscript save (the server never guesses);
// "folder" is an fs.watch on the granted folder, dropped and marked
// folder_changed when the folder was replaced behind the grant; "startup" runs
// once when the server starts. Standing intents (schedules with `standing`)
// have their unopened proposals withdrawn after 72 hours (sweep, each tick).

"use strict";

const fs = require("node:fs");

const folders = require("./folders.js");
const runs = require("./runs.js");
const schedules = require("./schedules.js");

const TICK_MS = 30_000;
/** A fire point older than this when first seen is missed, not run (a sleeping Mac, a long tick). */
const GRACE_MS = 2 * 60_000;

const seams = {
  now: () => new Date(),
  /** @type {(fn: () => void, ms: number) => any} */
  setInterval: (fn, ms) => setInterval(fn, ms),
  /** @type {(handle: any) => void} */
  clearInterval: (handle) => clearInterval(handle),
  /** @type {(dir: string, listener: (event: string, name: string | null) => void) => { close(): void }} */
  watch: (dir, listener) => fs.watch(dir, listener),
  /** quiet time after a folder event before the run starts, so a file being copied in is whole */
  folderSettleMs: 3_000,
};

/** @type {Map<string, { watcher: { close(): void }, folderId: string, timer: any }>} */
const watchers = new Map();

/** @type {any} */
let timer = null;
let ticking = false;
/** Launches between the cap check and the run being registered. */
let launching = 0;

/** @param {Date} date */
function localDayKey(date) {
  const two = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/**
 * The latest fire point at or before `now`, or null when none in the last
 * eight days (a weekly trigger always has one).
 * @param {any} trigger
 * @param {Date} now
 * @returns {Date | null}
 */
function lastFirePoint(trigger, now) {
  if (trigger.kind !== "time") return null;
  for (let back = 0; back <= 7; back += 1) {
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, trigger.hour, trigger.minute, 0, 0);
    if (trigger.weekday !== null && candidate.getDay() !== trigger.weekday) continue;
    if (candidate.getTime() <= now.getTime()) return candidate;
  }
  return null;
}

/** The newest moment that says this schedule has already dealt with a fire point. @param {import("./schedules.js").Schedule} schedule */
function watermark(schedule) {
  return Math.max(
    ...[schedule.createdAt, schedule.lastRunAt, schedule.missedAt, schedule.lastSkippedAt].map((value) => Date.parse(String(value || "")) || 0),
  );
}

/**
 * Start one unattended run for a schedule, past every cap. Used by the clock
 * and by runNow.
 * @param {import("./schedules.js").Schedule} schedule
 * @param {Date} now
 */
async function launch(schedule, now) {
  const limits = schedules.LIMITS;
  const day = localDayKey(now);
  const todays = schedule.runsToday && schedule.runsToday.day === day ? schedule.runsToday.count : 0;
  if (todays >= limits.maxRunsPerDay) {
    throw schedules.scheduleError("schedule_daily_cap", `This schedule has already run ${limits.maxRunsPerDay} times today.`, 429);
  }
  if (runs.activeUnattendedCount() + launching >= limits.maxConcurrent) {
    throw schedules.scheduleError("schedule_busy", `${limits.maxConcurrent} unattended runs are already working.`, 429);
  }
  launching += 1;
  /** @type {any} */
  let run;
  try {
    run = await runs.createRun({
      folderId: schedule.folderIds[0],
      level: "read",
      prompt: schedule.prompt,
      unattended: true,
      scheduleId: schedule.id,
      network: schedule.network === true,
      standing: schedule.standing === true,
      tokenCap: schedule.tokenCap,
      wallMs: schedule.wallMs,
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234",
    });
  } finally {
    launching -= 1;
  }
  schedules.markSchedule(schedule.id, {
    lastRunAt: now.toISOString(),
    lastRunId: run.runId,
    runsToday: { day, count: todays + 1 },
    clearMissed: true,
    clearSkip: true,
  });
  return run;
}

/**
 * The writer's "run it now", for a missed schedule or any other. Counts
 * against the daily and concurrency caps like a timed run.
 * @param {string} id
 */
async function runNow(id) {
  const schedule = schedules.getSchedule(id);
  if (!schedule.enabled) throw schedules.scheduleError("schedule_disabled", "This schedule is off; turn it on to run it.", 409);
  return launch(schedule, seams.now());
}

/**
 * At server start: every enabled schedule whose fire point passed while the
 * server was off is marked missed. Nothing runs.
 * @param {Date} [now]
 * @returns {string[]} ids marked missed
 */
function markMissedOnStart(now = seams.now()) {
  /** @type {string[]} */
  const marked = [];
  for (const schedule of schedules.listSchedules()) {
    if (!schedule.enabled || schedule.trigger.kind !== "time") continue;
    const point = lastFirePoint(schedule.trigger, now);
    if (!point || point.getTime() <= watermark(schedule)) continue;
    schedules.markSchedule(schedule.id, { missedAt: point.toISOString() });
    marked.push(schedule.id);
  }
  return marked;
}

/**
 * One look at the clock. Returns what it did, for the contract and the log.
 * @param {Date} [now]
 */
async function tick(now = seams.now()) {
  /** @type {{ launched: string[], missed: string[], skipped: Array<{ id: string, code: string }> }} */
  const outcome = { launched: [], missed: [], skipped: [] };
  if (ticking) return outcome;
  ticking = true;
  try {
    for (const schedule of schedules.listSchedules()) {
      if (!schedule.enabled || schedule.trigger.kind !== "time") continue;
      const point = lastFirePoint(schedule.trigger, now);
      if (!point || point.getTime() <= watermark(schedule)) continue;
      if (now.getTime() - point.getTime() > GRACE_MS) {
        schedules.markSchedule(schedule.id, { missedAt: point.toISOString() });
        outcome.missed.push(schedule.id);
        continue;
      }
      try {
        await launch(schedule, now);
        outcome.launched.push(schedule.id);
      } catch (error) {
        // Recorded and left: nothing retries a refused fire point.
        const code = String(/** @type {any} */ (error)?.code || "schedule_launch_failed");
        schedules.markSchedule(schedule.id, { lastSkippedAt: point.toISOString(), lastSkipCode: code });
        outcome.skipped.push({ id: schedule.id, code });
      }
    }
  } finally {
    ticking = false;
  }
  syncWatchers();
  try { runs.withdrawStaleProposals(schedules.LIMITS.withdrawAfterMs, now); } catch {}
  return outcome;
}

/**
 * The page's call after a real manuscript save: start this one
 * archive schedule. The project must be the one the schedule watches.
 * @param {string} id
 * @param {{ projectId?: string }} [input]
 */
async function trigger(id, input = {}) {
  const schedule = schedules.getSchedule(id);
  if (schedule.trigger.kind !== "archive") throw schedules.scheduleError("schedule_trigger_mismatch", "This schedule is not started by a manuscript save.", 409);
  if (!schedule.enabled) throw schedules.scheduleError("schedule_disabled", "This schedule is off; turn it on to run it.", 409);
  if (String(input.projectId || "") !== schedule.projectId) throw schedules.scheduleError("schedule_project_mismatch", "This schedule watches a different project.", 409);
  return launch(schedule, seams.now());
}

/** @param {string} id @param {string} code */
function skip(id, code) {
  schedules.markSchedule(id, { lastSkippedAt: seams.now().toISOString(), lastSkipCode: code });
}

/** @param {string} id */
function dropWatcher(id) {
  const entry = watchers.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  try { entry.watcher.close(); } catch {}
  watchers.delete(id);
}

/** @param {string} id */
async function folderEvent(id) {
  let schedule;
  try { schedule = schedules.getSchedule(id); } catch { return dropWatcher(id); }
  if (!schedule.enabled) return dropWatcher(id);
  try {
    // Throws folder_changed when the directory was replaced behind the grant (dev/ino).
    folders.resolveFolder(schedule.folderIds[0]);
  } catch (error) {
    skip(id, String(/** @type {any} */ (error)?.code || "folder_changed"));
    return dropWatcher(id);
  }
  try {
    await launch(schedule, seams.now());
  } catch (error) {
    skip(id, String(/** @type {any} */ (error)?.code || "schedule_launch_failed"));
  }
}

/**
 * One fs.watch per enabled folder-trigger schedule; closed for schedules that
 * are gone, off, or whose folder grant changed. Safe to call any time.
 */
function syncWatchers() {
  const wanted = new Map(schedules.listSchedules().filter((s) => s.enabled && s.trigger.kind === "folder").map((s) => [s.id, s]));
  for (const id of [...watchers.keys()]) {
    if (!wanted.has(id) || watchers.get(id)?.folderId !== wanted.get(id)?.folderIds[0]) dropWatcher(id);
  }
  for (const [id, schedule] of wanted) {
    if (watchers.has(id)) continue;
    let grant;
    try { grant = folders.resolveFolder(schedule.folderIds[0]); } catch (error) {
      skip(id, String(/** @type {any} */ (error)?.code || "folder_changed"));
      continue;
    }
    const entry = { watcher: /** @type {any} */ (null), folderId: schedule.folderIds[0], timer: null };
    try {
      entry.watcher = seams.watch(grant.path, (event, name) => {
        // A new file shows up as "rename"; dotfiles are noise.
        if (event !== "rename" || !name || String(name).startsWith(".")) return;
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => { void folderEvent(id); }, seams.folderSettleMs);
        entry.timer?.unref?.();
      });
    } catch { continue; }
    watchers.set(id, entry);
  }
}

/** The startup item: every enabled startup schedule runs once, under the same caps. */
async function runStartup() {
  for (const schedule of schedules.listSchedules()) {
    if (!schedule.enabled || schedule.trigger.kind !== "startup") continue;
    try {
      await launch(schedule, seams.now());
    } catch (error) {
      skip(schedule.id, String(/** @type {any} */ (error)?.code || "schedule_launch_failed"));
    }
  }
}

/** Mark what was missed while the server was off, then start the clock. */
function start() {
  if (timer) return;
  try { markMissedOnStart(); } catch {}
  try { syncWatchers(); } catch {}
  void runStartup().catch(() => {});
  timer = seams.setInterval(() => { void tick().catch(() => {}); }, TICK_MS);
  timer?.unref?.();
}

function stop() {
  if (timer) seams.clearInterval(timer);
  timer = null;
  for (const id of [...watchers.keys()]) dropWatcher(id);
}

/** Test seam: an injected clock and timer. @param {Partial<typeof seams>} overrides */
function configureForTests(overrides = {}) {
  Object.assign(seams, overrides);
}

function resetForTests() {
  stop();
  ticking = false;
  launching = 0;
  seams.now = () => new Date();
  seams.setInterval = (fn, ms) => setInterval(fn, ms);
  seams.clearInterval = (handle) => clearInterval(handle);
  seams.watch = (dir, listener) => fs.watch(dir, listener);
  seams.folderSettleMs = 3_000;
}

module.exports = {
  GRACE_MS,
  TICK_MS,
  configureForTests,
  lastFirePoint,
  markMissedOnStart,
  resetForTests,
  runNow,
  runStartup,
  start,
  stop,
  syncWatchers,
  tick,
  trigger,
};
