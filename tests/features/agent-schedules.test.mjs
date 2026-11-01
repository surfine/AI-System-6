// Schedules and unattended runs, server core (M8 slice 1) — executable contract.
//
// S5 asks for five things of a run nobody watches: read-only, offline by
// default, capped, results are candidates, missed runs are not replayed. Each
// is driven here through the shipped server files with a stub engine and an
// injected clock; nothing needs a page, a browser or a model.
//
//   1. definition   level is the constant "read" (propose/change/anything else
//                   is refused, on create, on edit, and a hand-edited file is
//                   read back as read); network defaults false; every folder is
//                   a granted one; the caps are bounded; at most 8 are on;
//                   the routes answer only with the boot token.
//   2. launch       a schedule's run is read level, its run.json says
//                   unattended + scheduleId, the engine is started with the
//                   same sandbox inputs as an interactive read run but with no
//                   web tool (the per-run patch disables tool-web) unless the
//                   schedule's network is true; the prompt is the writer's
//                   words verbatim.
//   3. caps         past its token cap or its wall clock the run ends stopped,
//                   with a notice, and the candidates it had already written
//                   are harvested — only scrap, flag, plan and question.
//   4. clock        the time trigger fires from the timer alone (no request),
//                   once per fire point, at most twice a day per schedule, at
//                   most two unattended runs at once; a refusal is recorded
//                   and never retried.
//   5. missed       a restart marks every passed fire point missed and starts
//                   nothing; a stale fire point is missed too; only the
//                   writer's runNow runs a missed schedule.

import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("agent-schedules");

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ais6-agent-schedules-")));
process.env.AI_SYSTEM6_AGENT_HOME = path.join(scratch, "agent-home");
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";

const folders = require("../../apps/server/server/agent/folders.js");
const paths = require("../../apps/server/server/agent/paths.js");
const engineHost = require("../../apps/server/server/agent/engine-host.js");
const proposals = require("../../apps/server/server/agent/proposals.js");
const runs = require("../../apps/server/server/agent/runs.js");
const schedules = require("../../apps/server/server/agent/schedules.js");
const runner = require("../../apps/server/server/agent/schedule-runner.js");
const { agentToken } = require("../../apps/server/server/agent/agent-token.js");
const router = require("../../apps/server/server/router.js");

const grants = [];
for (const name of ["Alpha", "Beta", "Gamma", "Delta"]) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "note.md"), `${name}\n`);
  // Granted at change: a schedule over it must still run read.
  grants.push(folders.grantFolder(dir, "change"));
}

async function until(check, label, ms = 4000) {
  const limit = Date.now() + ms;
  while (!check() && Date.now() < limit) await new Promise((resolve) => setTimeout(resolve, 5));
  test.assert(check(), label);
}
const settled = (runId) => !runs.ACTIVE_STATES.has(runs.getRun(runId).state);

/** A proposal file as an engine writes it. */
const proposal = (kind, payload) => ({ v: 1, kind, title: `a ${kind}`, reason: "because", payload, createdAt: new Date().toISOString() });
const OFFERS = {
  scrap: proposal("scrap", { quoted: "a verbatim line", source: "note.md" }),
  flag: proposal("flag", { target: { mount: "Alpha", quote: "a line" }, note: "check this" }),
  plan: proposal("plan", { steps: [{ text: "one step", touches: [] }] }),
  question: proposal("question", { text: "which one?", options: [] }),
  restore: proposal("restore", { files: [{ name: "gone.md", content: "back" }] }),
  "new-document": proposal("new-document", { format: "md", name: "n.md", content: "text" }),
  deliver: proposal("deliver", { summary: "done" }),
  skill: proposal("skill", { name: "x", steps: [] }),
};

/**
 * A stub engine. It records what the host started it with, writes its offers
 * into the proposal channel, reports usage, and either ends the turn or waits
 * until it is cancelled.
 */
const started = [];
function engine({ offers = [], used = 0, hold = false } = {}) {
  return async (options) => {
    started.push(options);
    const cwd = fs.realpathSync(options.work);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    return {
      sessionId: "11111111-2222-3333-4444-555555555555",
      cwd,
      async prompt(text) {
        started[started.length - 1].promptText = text;
        offers.forEach((kind, index) => {
          fs.writeFileSync(path.join(cwd, ".ais6-proposals", `${index + 1}-${kind}.json`), JSON.stringify(OFFERS[kind]));
        });
        if (used) options.onUpdate({ sessionUpdate: "usage_update", used, size: 1_000_000 });
        if (hold) await gate;
        return { stopReason: "end_turn" };
      },
      async cancel() { release(); },
      async close() {},
      kill() {},
    };
  };
}
const useEngine = (spec) => runs.configureRunsForTests({ resolveKey: async () => "k-test", startEngine: engine(spec) });

async function call(method, url, body, { token = agentToken } = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []);
  Object.assign(req, {
    method,
    url,
    headers: {
      host: "127.0.0.1:4173",
      ...(payload ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) } : {}),
      ...(token ? { "x-ai-system6-agent-token": token } : {}),
    },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const handler = router.resolveRoute(req);
  if (!handler) return { status: 0, json: null };
  const out = { status: 0, text: "" };
  const res = {
    destroyed: false,
    writableEnded: false,
    headersSent: false,
    writeHead(status) { out.status = status; this.headersSent = true; },
    end(text) { out.text = String(text || ""); this.writableEnded = true; },
  };
  await handler(req, res);
  return { status: out.status, json: out.text ? JSON.parse(out.text) : null };
}

const refusal = (fn) => { try { fn(); } catch (error) { return error.code; } return ""; };
const base = (extra = {}) => ({
  title: "Tidy the clippings",
  prompt: "Gather last week's interview clippings\nand list what is new.",
  trigger: { kind: "time", weekday: 1, hour: 9, minute: 0 },
  folderIds: [grants[0].id],
  ...extra,
});
const wipe = () => {
  try { fs.rmSync(paths.schedulesFile()); } catch {}
};

// --- 1. definition -----------------------------------------------------------

const made = schedules.createSchedule(base());
test.assert(made.level === "read" && made.network === false && made.tokenCap === 60_000 && made.wallMs === 20 * 60_000 && made.enabled === true,
  "a new schedule is read, offline, 60,000 tokens, 20 minutes, on");
test.assert(made.prompt === base().prompt && fs.existsSync(path.join(path.dirname(paths.foldersFile()), "schedules.json")),
  "the writer's words are stored verbatim in schedules.json beside folders.json");
for (const level of ["propose", "change", "Read", "", true, null]) {
  test.assert(refusal(() => schedules.createSchedule(base({ level }))) === "schedule_level_refused", `create with level ${JSON.stringify(level)} is refused`);
}
test.assert(refusal(() => schedules.updateSchedule(made.id, { level: "propose" })) === "schedule_level_refused" && schedules.getSchedule(made.id).level === "read",
  "an edit cannot raise the level either, and the stored schedule is untouched");
test.assert(refusal(() => schedules.createSchedule(base({ network: "yes" }))) === "schedule_invalid", "network is a boolean or nothing");
test.assert(refusal(() => schedules.createSchedule(base({ folderIds: ["fld-00000000-0000-0000-0000-000000000000"] }))) === "folder_unknown", "a folder that is not granted is refused");
test.assert(refusal(() => schedules.createSchedule(base({ folderIds: [] }))) === "schedule_folder_required"
  && refusal(() => schedules.createSchedule(base({ folderIds: [grants[0].id, grants[1].id] }))) === "schedule_folder_required", "exactly one folder (a run mounts one)");
test.assert(refusal(() => schedules.createSchedule(base({ tokenCap: 10_000_000 }))) === "schedule_cap_invalid" && refusal(() => schedules.createSchedule(base({ wallMs: 5 }))) === "schedule_cap_invalid", "caps stay inside their bounds");
test.assert(refusal(() => schedules.createSchedule(base({ trigger: { kind: "time", weekday: 7, hour: 9, minute: 0 } }))) === "schedule_trigger_invalid"
  && refusal(() => schedules.createSchedule(base({ trigger: { kind: "archive" } }))) === "schedule_project_required"
  && refusal(() => schedules.createSchedule(base({ trigger: { kind: "mail" } }))) === "schedule_trigger_invalid", "a bad time is refused; an archive trigger or a standing intent names its one project");
const opted = schedules.createSchedule(base({ network: true, tokenCap: 5_000 }));
test.assert(opted.network === true && opted.tokenCap === 5_000, "network is stored per schedule, only when the writer sets exactly true");
// A file edited by hand cannot widen a schedule.
{
  const file = paths.schedulesFile();
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  raw.schedules[0].level = "change";
  raw.schedules[0].network = "true";
  raw.schedules[0].tokenCap = 99_999_999;
  fs.writeFileSync(file, JSON.stringify(raw));
  const back = schedules.getSchedule(made.id);
  test.assert(back.level === "read" && back.network === false && back.tokenCap === 60_000, "a hand-edited file is read back as read, offline and default-capped");
}
wipe();
for (let i = 0; i < 8; i += 1) schedules.createSchedule(base({ title: `s${i}` }));
test.assert(refusal(() => schedules.createSchedule(base({ title: "ninth" }))) === "schedule_too_many", "at most 8 schedules are on");
const off = schedules.createSchedule(base({ enabled: false }));
test.assert(off.enabled === false && refusal(() => schedules.updateSchedule(off.id, { enabled: true })) === "schedule_too_many", "a ninth cannot be switched on either; a disabled one is allowed");
wipe();

// The routes answer only to this boot's token and speak the same refusals.
test.assert((await call("GET", "/api/agent/schedules", undefined, { token: "" })).status === 401
  && (await call("POST", "/api/agent/schedules", base(), { token: "" })).json.code === "agent_token_required", "the schedule routes refuse a request without the boot token");
const viaRoute = await call("POST", "/api/agent/schedules", base());
test.assert(viaRoute.status === 201 && viaRoute.json.schedule.level === "read" && viaRoute.json.schedule.network === false, "create over the route stores level read and network false");
const raised = await call("POST", "/api/agent/schedules", base({ level: "propose" }));
test.assert(raised.status === 400 && raised.json.code === "schedule_level_refused", "the route refuses a non-read level (400 schedule_level_refused)");
test.assert((await call("GET", "/api/agent/schedules")).json.schedules.length === 1
  && (await call("DELETE", `/api/agent/schedules/${viaRoute.json.schedule.id}`)).status === 200
  && (await call("GET", `/api/agent/schedules/${viaRoute.json.schedule.id}`)).status === 404, "list, delete and unknown id behave");
wipe();

// --- 2. launch: read, offline by default, same sandbox inputs ----------------

useEngine({});
const offline = schedules.createSchedule(base({ prompt: "Gather the clippings", folderIds: [grants[0].id] }));
const online = schedules.createSchedule(base({ prompt: "Check the sources online", folderIds: [grants[1].id], network: true, title: "online" }));

const interactive = await runs.createRun({ folderId: grants[2].id, level: "read", prompt: "interactive read" });
await until(() => settled(interactive.runId), "an interactive read run settles");
const ran = await runner.runNow(offline.id);
await until(() => settled(ran.runId), "the unattended run settles");
const ranOnline = await runner.runNow(online.id);
await until(() => settled(ranOnline.runId), "the networked schedule's run settles");

const [interactiveOptions, offlineOptions, onlineOptions] = started;
test.assert(ran.unattended === true && ran.scheduleId === offline.id && ran.level === "read" && runs.getRun(ran.runId).level === "read",
  "the run is read level although its folder is granted at change");
const meta = JSON.parse(fs.readFileSync(path.join(paths.runsRoot(), ran.runId, "run.json"), "utf8"));
test.assert(meta.unattended === true && meta.scheduleId === offline.id && meta.level === "read", "run.json carries unattended: true and scheduleId");
test.assert(offlineOptions.readOnly === true && interactiveOptions.readOnly === true
  && JSON.stringify(offlineOptions.loopbackPorts) === JSON.stringify(interactiveOptions.loopbackPorts)
  && JSON.stringify(offlineOptions.mcpServers) === JSON.stringify(interactiveOptions.mcpServers) && offlineOptions.deskTools === false
  && offlineOptions.engine === interactiveOptions.engine,
  "the sandbox inputs (read-only, ports, no MCP, no desk tools) equal an interactive read run's");
test.assert(interactiveOptions.webTools === true && offlineOptions.webTools === false && onlineOptions.webTools === true,
  "the web tool is off for an unattended run unless that schedule's network is true");
{
  const noWebFiles = engineHost.patchFilesFor({ engine: "deepseek", stateDir: path.join(paths.runsRoot(), ran.runId), webTools: false });
  const webFiles = engineHost.patchFilesFor({ engine: "deepseek", stateDir: path.join(paths.runsRoot(), interactive.runId), webTools: true });
  const names = noWebFiles.map((file) => path.basename(file));
  test.assert(names.join() === "posture.yml,no-web.yml,deepseek.yml" && webFiles.map((file) => path.basename(file)).join() === "posture.yml,deepseek.yml",
    `the engine patch list gains no-web.yml between posture and the provider only when the web is off (${names.join()})`);
  const patch = fs.readFileSync(noWebFiles[1], "utf8");
  test.assert(/- id: tool-web\n {2}disabled: true/.test(patch) && fs.readFileSync(noWebFiles[0], "utf8").includes("- id: tool-web\n  config:"),
    "that patch disables tool-web, the entry posture.yml configures for interactive runs");
}
test.assert(engineHost.withEnginePreamble("x", { webTools: false, unattended: true }).includes("no web access")
  && !engineHost.withEnginePreamble("x", {}).includes("no web access"), "the preamble tells an offline unattended run it has no web");
test.assert(offlineOptions.promptText === "Gather the clippings", "the run's prompt is the writer's words, with no history");
test.assert(runs.getRun(ran.runId).tokenCap === 60_000 && runs.getRun(ran.runId).wallMs === 20 * 60_000
  && runs.getRun(ranOnline.runId).tokenCap === 60_000, "the schedule's caps ride on the run");

// --- 3. caps: stopped, candidates kept, only four kinds ----------------------

const ALL_KINDS = Object.keys(OFFERS);
useEngine({ offers: ALL_KINDS, used: 500, hold: true });
const overToken = await runs.createRun({ folderId: grants[3].id, prompt: "over the token cap", unattended: true, scheduleId: "sch-x", tokenCap: 100, wallMs: 60_000 });
await until(() => settled(overToken.runId), "a run past its token cap ends");
{
  const run = runs.getRun(overToken.runId);
  const kinds = proposals.listProposals(run.shadow.stateDir).map((record) => record.kind).sort();
  test.assert(run.state === "stopped" && run.events.some((event) => event.type === "error" && event.data.code === "unattended_token_cap"),
    `usage over the cap ends the run as stopped with a notice (state ${run.state})`);
  test.assert(kinds.join() === "flag,plan,question,scrap", `its candidates are harvested after the stop, and only scrap, flag, plan and question (${kinds.join()})`);
  const dropped = run.events.find((event) => event.type === "proposal" && event.data.dropped);
  test.assert(dropped && dropped.data.dropped === ALL_KINDS.length - 4, "the other kinds are dropped and counted");
}
useEngine({ offers: ["scrap"], hold: true });
const overWall = await runs.createRun({ folderId: grants[3].id, prompt: "over the clock", unattended: true, scheduleId: "sch-x", tokenCap: 100_000, wallMs: 150 });
await until(() => settled(overWall.runId), "a run past its wall clock ends");
{
  const run = runs.getRun(overWall.runId);
  test.assert(run.state === "stopped" && run.events.some((event) => event.type === "error" && event.data.code === "unattended_wall_clock")
    && proposals.listProposals(run.shadow.stateDir).some((record) => record.kind === "scrap"), "the wall clock stops it the same way and keeps its candidate");
}
useEngine({ used: 90, hold: false });
const underCap = await runs.createRun({ folderId: grants[3].id, prompt: "under the cap", unattended: true, scheduleId: "sch-x", tokenCap: 100, wallMs: 60_000 });
await until(() => settled(underCap.runId), "a run under its caps ends on its own");
test.assert(runs.getRun(underCap.runId).state === "done", "a run under its caps finishes done, not stopped");
const askedWrite = await runs.createRun({ folderId: grants[3].id, level: "change", prompt: "ask for more", unattended: true, scheduleId: "sch-x", tokenCap: 100, wallMs: 60_000 });
await until(() => settled(askedWrite.runId), "settles");
test.assert(askedWrite.level === "read", "even a launcher that asks for change gets read for an unattended run");

// --- 4. the clock -----------------------------------------------------------

// A Monday-style fire point: the schedule's weekday is whatever the 9:00 slot below falls on.
const day0 = new Date(2026, 5, 3, 0, 0, 0); // local midnight
const at = (dayOffset, h, m = 0, s = 0) => new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + dayOffset, h, m, s);
const weekdayOf = (date) => date.getDay();
test.assert(runner.lastFirePoint({ kind: "time", weekday: null, hour: 9, minute: 0 }, at(2, 8, 59)).getTime() === at(1, 9).getTime()
  && runner.lastFirePoint({ kind: "time", weekday: null, hour: 9, minute: 0 }, at(2, 9, 0)).getTime() === at(2, 9).getTime()
  && runner.lastFirePoint({ kind: "time", weekday: weekdayOf(at(0, 9)), hour: 9, minute: 0 }, at(3, 12)).getTime() === at(0, 9).getTime()
  && runner.lastFirePoint({ kind: "time", weekday: weekdayOf(at(0, 9)), hour: 9, minute: 0 }, at(7, 9, 0)).getTime() === at(7, 9).getTime(),
  "the fire point is the latest daily or weekly 9:00 at or before now");

wipe();
runs.resetRunsForTests();
runner.resetForTests();
started.length = 0;
useEngine({});
let clock = at(0, 8, 0);
let tickFn = null;
runner.configureForTests({ now: () => clock, setInterval: (fn) => { tickFn = fn; return { unref() {} }; } });
const daily = schedules.createSchedule(base({ title: "daily", trigger: { kind: "time", weekday: null, hour: 9, minute: 0 } }), { now: at(0, 8, 0) });
runner.start(); // nothing has passed since the schedule was made
test.assert(typeof tickFn === "function" && schedules.getSchedule(daily.id).missedAt === undefined, "starting the clock marks nothing for a schedule made before its first fire point");
clock = at(0, 8, 59, 30);
tickFn();
await new Promise((resolve) => setTimeout(resolve, 30));
test.assert(started.length === 0, "nothing fires before the time");
// No route, page or request is involved from here on: the interval alone.
clock = at(0, 9, 0, 20);
tickFn();
await until(() => started.length === 1, "the timer alone starts the run at its time, with no page open");
await until(() => schedules.getSchedule(daily.id).lastRunId && settled(schedules.getSchedule(daily.id).lastRunId), "that run settles");
{
  const after = schedules.getSchedule(daily.id);
  test.assert(runs.getRun(after.lastRunId).unattended === true && after.lastRunAt === at(0, 9, 0, 20).toISOString() && after.runsToday.count === 1,
    "lastRunAt, lastRunId and today's count are recorded on the schedule");
}
clock = at(0, 9, 0, 50);
tickFn();
await new Promise((resolve) => setTimeout(resolve, 30));
test.assert(started.length === 1, "the same fire point does not fire twice");
// Disabled schedules do not fire at the next point.
schedules.updateSchedule(daily.id, { enabled: false });
clock = at(1, 9, 0, 10);
tickFn();
await new Promise((resolve) => setTimeout(resolve, 30));
test.assert(started.length === 1, "switching a schedule off takes effect at once");
schedules.updateSchedule(daily.id, { enabled: true });
clock = at(1, 9, 1, 0); // still within the grace, point not yet handled
tickFn();
await until(() => started.length === 2, "switched back on inside the grace, the day's point fires");
await until(() => settled(schedules.getSchedule(daily.id).lastRunId), "settles");
// A manual run today? Day 1 has used one; one more manual run is the cap, a third is refused.
const second = await runner.runNow(daily.id);
await until(() => settled(second.runId), "the second run of the day settles");
test.assert((await runner.runNow(daily.id).then(() => "", (error) => error.code)) === "schedule_daily_cap", "a schedule runs at most twice a day (the third is refused schedule_daily_cap)");
runner.stop();

// Concurrency: two unattended runs at once.
wipe();
runs.resetRunsForTests();
runner.resetForTests();
started.length = 0;
useEngine({ hold: true });
clock = at(10, 8, 0);
runner.configureForTests({ now: () => clock });
const trio = [0, 1, 2].map((i) => schedules.createSchedule(base({ title: `trio${i}`, folderIds: [grants[i].id], trigger: { kind: "time", weekday: null, hour: 9, minute: 0 } }), { now: at(10, 8, 0) }));
clock = at(10, 9, 0, 5);
const outcome = await runner.tick(clock);
test.assert(outcome.launched.length === 2 && outcome.skipped.length === 1 && outcome.skipped[0].code === "schedule_busy",
  `with three due at once only two unattended runs start; the third is refused schedule_busy (${JSON.stringify(outcome)})`);
const skippedSchedule = schedules.getSchedule(outcome.skipped[0].id);
test.assert(skippedSchedule.lastSkipCode === "schedule_busy" && skippedSchedule.lastSkippedAt === at(10, 9).toISOString(), "the refusal is recorded on the schedule");
for (const id of outcome.launched) await runs.stopRun(schedules.getSchedule(id).lastRunId);
const again = await runner.tick(at(10, 9, 0, 40));
test.assert(again.launched.length === 0 && again.skipped.length === 0, "a refused fire point is not retried when the runs end");
test.assert(runs.activeUnattendedCount() === 0, "stopping them frees the slots");

// --- 5. missed runs are marked, never replayed -------------------------------

wipe();
runs.resetRunsForTests();
runner.resetForTests();
started.length = 0;
useEngine({});
const weekly = schedules.createSchedule(base({ title: "weekly", trigger: { kind: "time", weekday: weekdayOf(at(20, 9)), hour: 9, minute: 0 } }), { now: at(19, 12, 0) });
// The Mac was off through the fire point; the server starts five minutes after it.
runs.resetRunsForTests(); // a restart: memory gone, disk kept
useEngine({}); // (the reset also drops the stub engine)
runner.configureForTests({ now: () => at(20, 9, 5) });
test.assert(runner.markMissedOnStart(at(20, 9, 5)).join() === weekly.id && schedules.getSchedule(weekly.id).missedAt === at(20, 9).toISOString(),
  "on start the passed fire point is marked missed");
const afterStart = await runner.tick(at(20, 9, 5, 30));
test.assert(afterStart.launched.length === 0 && started.length === 0, "nothing runs for it, then or on the next tick");
test.assert(runner.markMissedOnStart(at(20, 9, 6)).length === 0, "it is marked once, not again on a second look");
const stale = schedules.createSchedule(base({ title: "stale", trigger: { kind: "time", weekday: null, hour: 7, minute: 30 } }), { now: at(20, 6, 0) });
const lateTick = await runner.tick(at(20, 7, 40)); // ten minutes late (a sleeping Mac), past the grace
test.assert(lateTick.missed.includes(stale.id) && started.length === 0 && schedules.getSchedule(stale.id).missedAt === at(20, 7, 30).toISOString(),
  "a fire point first seen after the grace is missed, not run late");
// Only the writer's "run now" runs it, and that clears the mark.
runner.configureForTests({ now: () => at(20, 10, 0) });
const manual = await runner.runNow(weekly.id);
await until(() => settled(manual.runId), "the writer's run-now settles");
test.assert(started.length === 1 && schedules.getSchedule(weekly.id).missedAt === undefined && runs.getRun(manual.runId).unattended === true,
  "run-now starts it as an unattended run and clears the missed mark");
// And the next real fire point still fires on its own.
const nextWeek = await runner.tick(at(27, 9, 0, 10));
test.assert(nextWeek.launched.includes(weekly.id), "the next fire point fires normally");
await until(() => settled(schedules.getSchedule(weekly.id).lastRunId), "settles");
// A schedule that is off is neither run nor marked.
const dormant = schedules.createSchedule(base({ title: "dormant", enabled: false, trigger: { kind: "time", weekday: null, hour: 5, minute: 0 } }), { now: at(29, 1, 0) });
test.assert(runner.markMissedOnStart(at(29, 12, 0)).indexOf(dormant.id) === -1 && (await runner.runNow(dormant.id).then(() => "", (error) => error.code)) === "schedule_disabled", "a switched-off schedule is not marked and not run");
runner.resetForTests();

// --- 6. proactive triggers: archive, folder, startup, standing intents ----------

wipe();
runs.resetRunsForTests();
runner.resetForTests();
started.length = 0;
useEngine({ offers: ["scrap"] });
runner.configureForTests({ now: () => at(21, 10, 0) });
const onSave = schedules.createSchedule(base({ title: "after save", trigger: { kind: "archive" }, projectId: "proj-a" }), { now: at(21, 9, 0) });
const mismatch = await runner.trigger(onSave.id, { projectId: "proj-b" }).then(() => "", (error) => error.code);
test.assert(mismatch === "schedule_project_mismatch" && started.length === 0, "archive trigger: a save in another project starts nothing");
const saved = await call("POST", `/api/agent/schedules/${onSave.id}/trigger`, { projectId: "proj-a" });
test.assert(saved.status === 202 && saved.json.run.unattended === true, "archive trigger: the page's POST after a real save starts an unattended run");
await until(() => settled(saved.json.run.runId), "the archive run settles");
const timeKind = schedules.createSchedule(base({ title: "clock", trigger: { kind: "time", weekday: null, hour: 8, minute: 0 } }), { now: at(21, 9, 0) });
test.assert((await runner.trigger(timeKind.id, { projectId: "" }).then(() => "", (error) => error.code)) === "schedule_trigger_mismatch", "archive trigger: only an archive schedule answers it");

// folder: a stub watcher; a new file starts a run, a replaced folder does not.
let emit = () => {};
let watched = null;
runner.configureForTests({
  folderSettleMs: 1,
  watch: (dir, listener) => { watched = dir; emit = listener; return { close() { watched = null; } }; },
});
const onFolder = schedules.createSchedule(base({ title: "new file", folderIds: [grants[1].id], trigger: { kind: "folder" } }), { now: at(21, 9, 0) });
runner.syncWatchers();
test.assert(watched === grants[1].path, "folder trigger: the granted folder is watched");
const before = started.length;
emit("rename", ".hidden");
await new Promise((resolve) => setTimeout(resolve, 30));
test.assert(started.length === before, "folder trigger: a dotfile is not a new file");
emit("rename", "reply.md");
await until(() => started.length === before + 1, "folder trigger: a new file starts a run");
await until(() => settled(schedules.getSchedule(onFolder.id).lastRunId), "the folder run settles");
// The folder is swapped behind the grant: no run, a recorded folder_changed, the watcher closed.
const swapped = path.join(scratch, "Beta-swapped");
fs.renameSync(grants[1].path, swapped);
fs.mkdirSync(grants[1].path);
emit("rename", "again.md");
await until(() => schedules.getSchedule(onFolder.id).lastSkipCode === "folder_changed", "folder trigger: a replaced folder is refused and recorded");
test.assert(watched === null && started.length === before + 1, "folder trigger: nothing ran and the watcher is gone");
fs.rmSync(grants[1].path, { recursive: true });
fs.renameSync(swapped, grants[1].path);

// startup: one run per start, under the same rules (unattended, read, capped).
runs.resetRunsForTests();
runner.resetForTests();
useEngine({});
runner.configureForTests({ now: () => at(22, 7, 0) });
const onBoot = schedules.createSchedule(base({ title: "boot", trigger: { kind: "startup" } }), { now: at(22, 6, 0) });
const startedBefore = started.length;
await runner.runStartup();
const bootRunId = schedules.getSchedule(onBoot.id).lastRunId;
test.assert(started.length === startedBefore + 1 && runs.getRun(bootRunId).unattended === true && runs.getRun(bootRunId).level === "read", "startup: one unattended read run after boot");
await until(() => settled(bootRunId), "the startup run settles");
await runner.runStartup();
await runner.runStartup();
test.assert((schedules.getSchedule(onBoot.id).runsToday?.count || 0) === 2 && schedules.getSchedule(onBoot.id).lastSkipCode === "schedule_daily_cap", "startup: the 2-a-day cap still binds it");

// standing intents: scoped to one project; unopened proposals withdrawn after 72 hours.
wipe();
runs.resetRunsForTests();
runner.resetForTests();
useEngine({ offers: ["scrap", "flag"] });
runner.configureForTests({ now: () => at(23, 9, 0) });
test.assert(refusal(() => schedules.createSchedule(base({ standing: true, trigger: { kind: "archive" } }))) === "schedule_project_required"
  && refusal(() => schedules.createSchedule(base({ standing: true, projectId: "proj-a", trigger: { kind: "startup" } }))) === "schedule_trigger_invalid",
  "standing intent: needs one project and an event or daily trigger");
const watch = schedules.createSchedule(base({ title: "watch numbers", standing: true, projectId: "proj-a", trigger: { kind: "archive" } }), { now: at(23, 8, 0) });
const standingRun = await runner.trigger(watch.id, { projectId: "proj-a" });
await until(() => settled(standingRun.runId), "the standing run settles");
const opened = await runner.trigger(watch.id, { projectId: "proj-a" });
await until(() => settled(opened.runId), "a second standing run settles");
runs.listProposalsRun(opened.runId); // the writer opens this one's proposals
const afterTwoDays = new Date(Date.now() + 71 * 3_600_000);
test.assert(runs.withdrawStaleProposals(schedules.LIMITS.withdrawAfterMs, afterTwoDays).length === 0, "standing intent: nothing is withdrawn before 72 hours");
const afterFour = new Date(Date.now() + 73 * 3_600_000);
const gone = runs.withdrawStaleProposals(schedules.LIMITS.withdrawAfterMs, afterFour);
test.assert(gone.length === 1 && gone[0] === standingRun.runId, "standing intent: the untouched run's proposals are withdrawn after 72 hours; the opened run's are kept");
const summaryOf = (id) => runs.listRuns().find((r) => r.runId === id);
test.assert(summaryOf(standingRun.runId).pendingProposals === 0 && summaryOf(opened.runId).pendingProposals === 2 && summaryOf(standingRun.runId).standing === true, "withdrawn proposals leave the pending count");
runner.resetForTests();

test.finish();
