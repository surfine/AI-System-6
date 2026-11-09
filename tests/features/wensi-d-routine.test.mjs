// 文思泉涌 P5 · 例行维护的骨架.
//
// What the desk can honestly hold before the model channel exists: run the
// site's declared sync in the background and prove the corpus grew, and work
// out what a week of drafting / one longform / a month's rescan would read and
// cost. Nothing here claims to have drafted anything.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-d-routine");

const routine = require("../../apps/server/server/lib/blog-sites/routine.js");

const root = mkdtempSync(join(tmpdir(), "wensi-routine-"));
const postsDir = join(root, "posts");
const toolsDir = join(root, "tools");
const corpusDir = join(toolsDir, "corpus");
const brief = join(toolsDir, "WEEKLY_PIPELINE.md");
mkdirSync(postsDir, { recursive: true });
mkdirSync(corpusDir, { recursive: true });
writeFileSync(brief, "# 每周例行\n");
writeFileSync(join(corpusDir, "2026H2.txt"), "2026-11-01 08:00 [Sync1101|A] first line\n2026-11-02 09:00 [Sync1102|A] second line\n");

// A stand-in for sync_all.sh: appends one corpus line and says what it did.
const syncScript = join(toolsDir, "sync-stand-in.js");
writeFileSync(syncScript, `
const fs = require("node:fs");
const path = require("node:path");
const since = process.argv[2] || "(default)";
console.log("== sync stand-in, since " + since);
fs.appendFileSync(path.join(__dirname, "corpus", "2026H2.txt"), "2026-11-03 10:00 [Sync1103|A] appended\\n");
console.log("== done");
`);

writeFileSync(join(postsDir, "2026-11-01-post.md"), "---\ntitle: 一\ndate: 2026-11-01\n---\n\n正文\n");
writeFileSync(join(postsDir, "2026-11-03-post.md"), "---\ntitle: 三\ndate: 2026-11-03\n---\n\n正文\n");

const site = {
  schema: 1,
  id: "probe",
  label: "probe",
  channel: {
    root,
    commands: [
      { id: "sync-corpus", purpose: "maintenance", argv: [process.execPath, syncScript, "{since}"], cwd: toolsDir },
    ],
  },
  tools: { dir: toolsDir, draftsDir: postsDir },
  routine: {
    sync: { command: "sync-corpus", corpusDir },
    drafting: { brief, models: { pick: "sonnet", write: "opus" }, maxSpendUsd: 8 },
  },
  contentTypes: {
    daily: { label: "日更", storage: { kind: "file-per", dir: postsDir }, fields: [] },
  },
};

// ---- status ----

const status = routine.syncStatus(site);
test.assert(status.declared === true && status.commandId === "sync-corpus", "the status names the declared sync command");
test.assert(status.corpus.lines === 2 && status.corpus.newest === "1102", "the status reads the corpus's lines and newest sync stamp");
const undeclared = routine.syncStatus({ ...site, channel: { root, commands: [] } });
test.assert(undeclared.declared === false && undeclared.note.includes("sync-corpus"), "an undeclared command is reported, not assumed");

// ---- a sync run: background, logged, and the corpus delta ----

const started = routine.startSync(site, { since: "2026-11-01" });
test.assert(started.ok === true && started.status === "running", "start returns a running receipt");
let run = routine.syncStatus(site).run;
for (let attempt = 0; attempt < 60 && run?.status === "running"; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  run = routine.syncStatus(site).run;
}
test.assert(run.status === "done" && run.exitCode === 0, "the run finishes and reports its exit code");
test.assert(run.newLines === 1, "the receipt counts the corpus line the sync added");
test.assert(run.lines.some((line) => line.includes("since 2026-11-01")), "the log keeps what the command said");
test.assert(!("child" in run), "the run view carries no process handle — a response is data, not a child process");
test.assert(readFileSync(join(corpusDir, "2026H2.txt"), "utf8").includes("[Sync1103|"), "the corpus really grew");

let code = "";
try { routine.stopSync(site); } catch (error) { code = error.code; }
test.assert(code === "sync_not_running", "stopping a finished run is a named refusal");

// A second concurrent start is refused while one is running.
const second = routine.startSync(site, { since: "" });
test.assert(second.status === "running", "a fresh start returns a running receipt");
try { routine.startSync(site, { since: "" }); } catch (error) { code = error.code; }
test.assert(code === "sync_running", "a second start while one is running is refused");
for (let attempt = 0; attempt < 60 && routine.syncStatus(site).run?.status === "running"; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

let undeclaredCode = "";
try { routine.startSync({ ...site, channel: { root, commands: [] } }, {}); } catch (error) { undeclaredCode = error.code; }
test.assert(undeclaredCode === "unknown_command", "an undeclared sync command cannot start");

// The real command's argv carries {tools} and {since}; both are filled, and an
// empty since is passed as an empty argument rather than dropped.
{
  const echoSite = {
    ...site,
    channel: {
      root,
      commands: [{
        id: "sync-corpus",
        purpose: "maintenance",
        argv: [process.execPath, "-e", "console.log(process.argv.slice(1).join('|'))", "{tools}", "{since}"],
        cwd: toolsDir,
      }],
    },
  };
  routine.startSync(echoSite, { since: "2026-11-01" });
  let echoed = routine.syncStatus(echoSite).run;
  for (let attempt = 0; attempt < 60 && echoed?.status === "running"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    echoed = routine.syncStatus(echoSite).run;
  }
  test.assert(echoed.lines.some((line) => line === `${toolsDir}|2026-11-01`), "the tools folder and the since date reach the command as arguments");
  routine.startSync(echoSite, {});
  let empty = routine.syncStatus(echoSite).run;
  for (let attempt = 0; attempt < 60 && empty?.status === "running"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    empty = routine.syncStatus(echoSite).run;
  }
  test.assert(empty.lines.some((line) => line === `${toolsDir}|`), "no since date still passes an empty argument, not a missing one");
}

// Stopping a run: the process closing afterwards does not turn it into "done".
{
  const slowSite = {
    ...site,
    id: "probe-slow",
    channel: {
      root,
      commands: [{ id: "sync-corpus", purpose: "maintenance", argv: [process.execPath, "-e", "setTimeout(()=>{},5000)"], cwd: toolsDir }],
    },
  };
  routine.startSync(slowSite, {});
  await new Promise((resolve) => setTimeout(resolve, 150));
  const stopped = routine.stopSync(slowSite);
  test.assert(stopped.status === "stopped", "stop reports stopped");
  let view = routine.syncStatus(slowSite).run;
  for (let attempt = 0; attempt < 60 && view?.status === "running"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    view = routine.syncStatus(slowSite).run;
  }
  // The close handler may arrive after the stop; the status must not flip back.
  await new Promise((resolve) => setTimeout(resolve, 300));
  test.assert(routine.syncStatus(slowSite).run.status !== "done", "a stopped run never reports itself as done");
}

// ---- the drafting plan: what a week would ask for, and what is missing ----

const plan = routine.draftPlan(site, { from: "2026-11-01", to: "2026-11-04" });
test.assert(plan.days === 4 && JSON.stringify(plan.missing) === JSON.stringify(["2026-11-02", "2026-11-04"]),
  "the plan names the days with no post");
test.assert(plan.brief.exists === true && plan.maxSpendUsd === 8, "the plan carries the brief and the spend cap");
test.assert(plan.ready === false && plan.missingPrerequisites.some((item) => item.startsWith("provider_bridge")),
  "the plan says the model channel is not wired, and does not pretend otherwise");
test.assert(plan.models.write === "opus", "the models the writer picked are shown before anything runs");

// With the channel declared (and a brief that exists), the plan is ready.
const readyPlan = routine.draftPlan(
  { ...site, routine: { ...site.routine, drafting: { ...site.routine.drafting, channel: "claude-subscription" } } },
  { from: "2026-11-01", to: "2026-11-04" },
);
test.assert(readyPlan.ready === true && readyPlan.missingPrerequisites.length === 0 && readyPlan.channel === "claude-subscription",
  "a declared channel makes the drafting plan ready, and the plan says which channel");

let rangeCode = "";
try { routine.draftPlan(site, { from: "2026-10-01", to: "2026-11-04" }); } catch (error) { rangeCode = error.code; }
test.assert(rangeCode === "range_too_wide", "a range wider than the pipeline's two weeks is refused");
try { routine.draftPlan(site, { from: "2026-11-04", to: "2026-11-01" }); } catch (error) { rangeCode = error.code; }
test.assert(rangeCode === "bad_date", "a backwards range is refused");
try { routine.draftPlan(site, { from: "11/01/2026", to: "2026-11-04" }); } catch (error) { rangeCode = error.code; }
test.assert(rangeCode === "bad_date", "a date that is not YYYY-MM-DD is refused");

// ---- longform: the chosen posts must exist ----

const longform = routine.longformPlan(site, { posts: ["2026-11-01-post.md"] });
test.assert(longform.ok === true && longform.posts.length === 1 && longform.writes.length === 0,
  "the longform plan names the posts and writes nothing");
test.assert(longform.missingPrerequisites.some((item) => item.startsWith("provider_bridge")), "longform says the model channel is missing");
let longformCode = "";
try { routine.longformPlan(site, { posts: ["nope.md"] }); } catch (error) { longformCode = error.code; }
test.assert(longformCode === "article_missing", "a missing post is a named refusal");
try { routine.longformPlan(site, { posts: [] }); } catch (error) { longformCode = error.code; }
test.assert(longformCode === "bad_request", "an empty selection is refused");

// ---- rescan: the month's posts, and the command that is not declared yet ----

const rescan = routine.rescanPlan(site, { month: "2026-11" });
test.assert(rescan.count === 2 && rescan.commandDeclared === false, "the rescan plan lists the month and reports the missing command");
test.assert(rescan.missingPrerequisites.some((item) => item.startsWith("command")), "the missing command is named");
let rescanCode = "";
try { routine.rescanPlan(site, { month: "2026-13" }); } catch (error) { rescanCode = error.code; }
test.assert(rescanCode === "bad_date", "a month that is not YYYY-MM is refused");

// ---- rescan: the packet command runs, and its two files are checked for ----

const packetsDir = join(root, "packets");
mkdirSync(packetsDir, { recursive: true });
const packetScript = join(toolsDir, "packet-stand-in.js");
writeFileSync(packetScript, `
const fs = require("node:fs");
const path = require("node:path");
const month = process.argv[2];
fs.mkdirSync(path.join(__dirname, "..", "packets"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "..", "packets", month + ".md"), "# " + month);
fs.writeFileSync(path.join(__dirname, "..", "packets", month + ".json"), "{}");
console.log("wrote " + month);
`);
const rescanSite = {
  ...site,
  channel: {
    root,
    commands: [
      ...site.channel.commands,
      { id: "month-packet", purpose: "maintenance", argv: [process.execPath, packetScript, "{month}"], cwd: toolsDir },
    ],
  },
  routine: { ...site.routine, rescan: { command: "month-packet", packetsDir } },
};

const rescanReady = routine.rescanPlan(rescanSite, { month: "2026-11" });
test.assert(rescanReady.commandDeclared === true && rescanReady.ready === true,
  "a declared packet command makes the rescan ready");
const built = await routine.runRescan(rescanSite, { month: "2026-11" });
test.assert(built.ok === true && built.files.every((file) => file.exists),
  "the packet run reports the two files it produced");
test.assert(built.note.includes("2026-11.md"), "the note names the packet that appeared");
test.assert(readFileSync(join(packetsDir, "2026-11.md"), "utf8").includes("2026-11"), "the packet really exists");

let rescanRunCode = "";
try { await routine.runRescan(site, { month: "2026-11" }); } catch (error) { rescanRunCode = error.code; }
test.assert(rescanRunCode === "unknown_command", "an undeclared packet command cannot run");
try { await routine.runRescan(rescanSite, { month: "2026-13" }); } catch (error) { rescanRunCode = error.code; }
test.assert(rescanRunCode === "bad_date", "the run refuses a month that is not YYYY-MM");

rmSync(root, { recursive: true, force: true });
test.finish();
