// ClioCode outside-sandbox execution (M9.5) — executable contract.
//
// A command that must run without the Seatbelt wrapper is run by the HOST, as
// a separate child of the server, never by dsh and never by widening anything:
//
//   1. unapproved  nothing runs — Plan refuses without asking, the writer's
//                  deny refuses, and no command_output ever appears; a run
//                  that is over refuses outright;
//   2. one approval, one command — the approval releases exactly that command
//                  (shown by its full text, run unwrapped: the probe writes
//                  outside the project, which the profile itself forbids);
//                  the same command asks again, "this session" counts for that
//                  one call only, and a different command is asked separately;
//   3. mode switch the mode is read on every call: switched to Plan, the next
//                  outside-sandbox command is refused without a prompt, and in
//                  Auto it still asks (the mode never covers it);
//   4. record      every approval and refusal is on the run's events
//                  (permission_request, permission, command_output), the
//                  output redacted and capped, a command that outlives its
//                  timeout has its group killed, and a stopped run kills a
//                  still-running command;
//   5. guards      Bypass is refused at start and at a mode switch (the real
//                  Mac is never isolated), the shell is only reachable through
//                  the host runner (runs.js spawns no sandbox-exec itself, and
//                  the engine's wrapper stays in engine-host.js), and a
//                  session allow never covers the row.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { codeOnly, createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("cliocode-external");

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ais6-cliocode-external-")));
process.env.AI_SYSTEM6_AGENT_HOME = path.join(scratch, "agent-home");
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";
// The commands below are instant; only the timeout leg needs the ceiling.
process.env.AI_SYSTEM6_CLIOCODE_EXTERNAL_TIMEOUT_MS = "3000";

const folders = require("../../apps/server/server/agent/folders.js");
const runs = require("../../apps/server/server/cliocode/runs.js");

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// --- The stub engine and the project -----------------------------------------

const project = path.join(scratch, "repo");
fs.mkdirSync(project, { recursive: true });
const projectReal = fs.realpathSync(project);
// The probes write OUTSIDE the project: under the code Seatbelt profile that
// is refused, so a landed marker proves the command ran unwrapped.
const marker1 = path.join(scratch, "approved-one.txt");
const marker2 = path.join(scratch, "approved-two.txt");
const CMD1 = `printf approved-one && printf x > ${JSON.stringify(marker1)}`;
const CMD2 = `printf approved-two && printf x > ${JSON.stringify(marker2)}`;

/** dsh's requestPermission shape. */
const PERM_OPTIONS = [
  { optionId: "once", name: "Once", kind: "allow_once" },
  { optionId: "no", name: "No", kind: "reject_once" },
];
function outcomeKind(params, answer) {
  if (answer?.outcome?.outcome !== "selected") return answer?.outcome?.outcome || "";
  return params.options.find((option) => option.optionId === answer.outcome.optionId)?.kind || "";
}

/**
 * A stub engine that plays dsh: each step is [toolCallId, title, rawInput] —
 * the handler is asked first, and nothing is applied for these steps (the
 * host's runner does the work the row grants).
 */
function stubEngine(steps) {
  return async (options) => {
    stubCalls.push(options);
    return {
      sessionId: "66666666-7777-8888-9999-000000000000",
      cwd: fs.realpathSync(options.work),
      async prompt() {
        for (const [toolCallId, title, rawInput] of steps) {
          const params = { sessionId: "s", options: PERM_OPTIONS, toolCall: { toolCallId, kind: "other", title, rawInput } };
          await options.permissionHandler(params);
        }
        return { stopReason: "end_turn" };
      },
      async cancel() {},
      async close() { return { exited: true }; },
      kill() {},
    };
  };
}

/** @type {any[]} */
const stubCalls = [];

function configureStub(steps) {
  stubCalls.length = 0;
  runs.configureRunsForTests({
    resolveKey: async () => "k-test",
    startEgress: async () => ({ port: 41223, close: async () => {} }),
    startEngine: stubEngine(steps),
  });
}

/** Wait for a run's terminal status. */
function untilDone(runId, wanted = ["done", "error", "stopped"]) {
  return new Promise((resolve) => {
    runs.subscribe(runId, 0, (event) => {
      if (event.type === "status" && wanted.includes(event.data.state)) resolve(event.data.state);
    });
  });
}

/**
 * Answer every permission_request a run raises, in order, with the given
 * decisions (default deny); returns the asks.
 */
function answerWith(runId, decisions) {
  /** @type {any[]} */
  const asks = [];
  runs.subscribe(runId, 0, (event) => {
    if (event.type === "permission_request") {
      asks.push(event.data);
      runs.answerPermission(runId, event.data.toolCallId, decisions.length ? decisions.shift() : "deny");
    }
  });
  return asks;
}

/** A run's events of one type. */
const eventsOf = (runId, type) => runs.getRun(runId).events.filter((event) => event.type === type).map((event) => event.data);

const grant = folders.grantFolder(project, "change");

// --- 1. Unapproved: nothing runs ---------------------------------------------

{
  // Plan refuses the row without asking (no way to approve a change from Plan).
  configureStub([["t1", "bash", { command: CMD1, outsideSandbox: true }]]);
  const planRun = await runs.createCodeRun({ folderId: grant.id, prompt: "install globally", mode: "plan" });
  await untilDone(planRun.runId);
  test.assert(eventsOf(planRun.runId, "permission_request").length === 0, "Plan: an outside-sandbox command is refused without a prompt");
  test.assert(eventsOf(planRun.runId, "permission").some((record) => record.action === "runExternal" && record.decision === "deny" && record.reason === "plan_read_only"),
    "Plan: the refusal is on the record (plan_read_only)");
  test.assert(!fs.existsSync(marker1), "Plan: nothing ran");
  test.assert(eventsOf(planRun.runId, "command_output").length === 0, "no command_output for a refused command");
  await runs.discardRun(planRun.runId);
}
{
  // The writer's deny: asked once, refused, nothing runs.
  configureStub([["t1", "bash", { command: CMD1, outsideSandbox: true }]]);
  const denyRun = await runs.createCodeRun({ folderId: grant.id, prompt: "install globally" });
  const asks = answerWith(denyRun.runId, ["deny"]);
  await untilDone(denyRun.runId);
  test.assert(asks.length === 1 && asks[0].kind === "runExternal" && asks[0].sessionAllowed === false && asks[0].command === CMD1,
    "Manual: the writer is asked once, with the full command and no session allow offered");
  test.assert(eventsOf(denyRun.runId, "permission").some((record) => record.action === "runExternal" && record.decision === "deny" && record.reason === "writer_deny"),
    "Manual: the writer's deny is on the record");
  test.assert(!fs.existsSync(marker1) && eventsOf(denyRun.runId, "command_output").length === 0, "a denied command never ran and left no output");
  await runs.discardRun(denyRun.runId);
}
{
  // An ask nobody answers is a deny (stopRun resolves it), and nothing runs.
  configureStub([["t1", "bash", { command: CMD1, outsideSandbox: true }]]);
  const stopped = await runs.createCodeRun({ folderId: grant.id, prompt: "install globally" });
  untilDone(stopped.runId);
  await new Promise((resolve) => {
    const stop = () => { void runs.stopRun(stopped.runId).then(resolve); };
    const off = runs.subscribe(stopped.runId, 0, (event) => {
      if (event.type === "permission_request") { off.unsubscribe(); stop(); }
    });
  });
  await untilDone(stopped.runId);
  test.assert(!fs.existsSync(marker1) && eventsOf(stopped.runId, "command_output").length === 0,
    "an unanswered ask never executes: stopping the run refuses it");
  await runs.discardRun(stopped.runId);
}

// --- 2. One approval, one command --------------------------------------------

{
  configureStub([["t1", "bash", { command: CMD1, outsideSandbox: true }], ["t2", "bash", { command: CMD2, outsideSandbox: true }]]);
  const run = await runs.createCodeRun({ folderId: grant.id, prompt: "two installs" });
  const asks = answerWith(run.runId, ["allow", "deny"]);
  await untilDone(run.runId);
  test.assert(asks.length === 2 && asks[0].command === CMD1 && asks[1].command === CMD2,
    "two different commands are two separate asks, each showing its own full command");
  test.assert(fs.readFileSync(marker1, "utf8") === "x", "the approved command ran and wrote its marker OUTSIDE the project: it ran unwrapped, not under the profile");
  test.assert(!fs.existsSync(marker2), "the refused second command never ran");
  const outputs = eventsOf(run.runId, "command_output");
  test.assert(outputs.length === 1 && outputs[0].external === true && outputs[0].exitCode === 0 && outputs[0].command === CMD1 && outputs[0].cwd === projectReal,
    "the run's events carry the executed command: its text, its cwd in the project, its exit code");
  test.assert(outputs[0].output.includes("approved-one"), "the command's output reached the event log");
  test.assert(eventsOf(run.runId, "permission").some((record) => record.action === "runExternal" && record.decision === "allow" && record.reason === "writer_allow" && record.toolCallId === "t1"),
    "the approval itself is on the record (writer_allow)");
  await runs.discardRun(run.runId);
}
{
  // The SAME command again asks again: one approval releases one execution.
  configureStub([["t1", "bash", { command: CMD1, outsideSandbox: true }], ["t2", "bash", { command: CMD1, outsideSandbox: true }]]);
  const run = await runs.createCodeRun({ folderId: grant.id, prompt: "same command twice" });
  const asks = answerWith(run.runId, ["allow", "deny"]);
  await untilDone(run.runId);
  test.assert(asks.length === 2, "the same exact command asks every time: an approval never becomes a standing grant");
  test.assert(eventsOf(run.runId, "command_output").length === 1, "and only the one approved execution ran");
  await runs.discardRun(run.runId);
}
{
  // "This session" counts for that one call only, even for the same command.
  configureStub([["t1", "bash", { command: CMD1, outsideSandbox: true }], ["t2", "bash", { command: CMD1, outsideSandbox: true }]]);
  const run = await runs.createCodeRun({ folderId: grant.id, prompt: "session answer" });
  const asks = answerWith(run.runId, ["allow_session", "allow_session"]);
  await untilDone(run.runId);
  test.assert(asks.length === 2 && asks.every((ask) => ask.sessionAllowed === false),
    "an outside-sandbox command is never covered by a session allow: allow_session is a yes for that one call only");
  await runs.discardRun(run.runId);
}

// --- 3. The mode switch takes effect on the next call ------------------------

{
  configureStub([["t1", "bash", { command: CMD1, outsideSandbox: true }], ["t2", "bash", { command: CMD1, outsideSandbox: true }]]);
  const run = await runs.createCodeRun({ folderId: grant.id, prompt: "switch mid-run" });
  const asks = [];
  runs.subscribe(run.runId, 0, (event) => {
    if (event.type !== "permission_request") return;
    asks.push(event.data);
    // The first ask is approved, and the mode switches to Plan right after:
    // the next call must see the new mode.
    runs.answerPermission(run.runId, event.data.toolCallId, "allow");
    runs.setRunMode(run.runId, "plan");
  });
  await untilDone(run.runId);
  test.assert(asks.length === 1 && eventsOf(run.runId, "mode").some((event) => event.mode === "plan"),
    "the first command asks, is approved, and the switch to Plan is on the record");
  test.assert(eventsOf(run.runId, "permission").some((record) => record.toolCallId === "t2" && record.decision === "deny" && record.reason === "plan_read_only"),
    "the second command — identical, already approved once — is refused by the new mode without a prompt");
  test.assert(eventsOf(run.runId, "command_output").length === 1, "and it did not run");
  await runs.discardRun(run.runId);
}
{
  // Auto never covers the row either: it asks, always.
  fs.rmSync(marker1, { force: true }); // an earlier case approved CMD1 and left its marker
  configureStub([["t1", "bash", { command: CMD1, outsideSandbox: true }]]);
  const run = await runs.createCodeRun({ folderId: grant.id, prompt: "auto asks", mode: "auto" });
  const asks = answerWith(run.runId, ["deny"]);
  await untilDone(run.runId);
  test.assert(asks.length === 1 && asks[0].kind === "runExternal" && asks[0].sessionAllowed === false,
    "in Auto an outside-sandbox command still asks, with no session allow offered");
  test.assert(!fs.existsSync(marker1), "and its deny left nothing behind");
  await runs.discardRun(run.runId);
}

// --- 4. Timeout, stop, and the output caps -----------------------------------

{
  // A command that outlives its timeout: the group is killed, the run survives.
  const sleeper = `sleep 2931`;
  configureStub([["t1", "bash", { command: sleeper, outsideSandbox: true }]]);
  const run = await runs.createCodeRun({ folderId: grant.id, prompt: "hang" });
  answerWith(run.runId, ["allow"]);
  await untilDone(run.runId);
  const outputs = eventsOf(run.runId, "command_output");
  test.assert(outputs.length === 1 && outputs[0].timedOut === true && outputs[0].exitCode === null,
    "a command that outlives its timeout is reported as timed out, with no exit code");
  let gone = false;
  for (let attempt = 0; attempt < 20 && !gone; attempt += 1) {
    gone = spawnSync("pgrep", ["-f", "sleep 2931"], { encoding: "utf8" }).status !== 0;
    if (!gone) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  test.assert(gone, "the timed-out command's process group is gone");
  await runs.discardRun(run.runId);
}
{
  // A stopped run kills a still-running approved command.
  const sleeper = `sleep 2932 && printf x > ${JSON.stringify(marker2)}`;
  configureStub([["t1", "bash", { command: sleeper, outsideSandbox: true }]]);
  const run = await runs.createCodeRun({ folderId: grant.id, prompt: "stop mid-command" });
  untilDone(run.runId);
  await new Promise((resolve) => {
    const off = runs.subscribe(run.runId, 0, (event) => {
      if (event.type === "permission_request") { off.unsubscribe(); runs.answerPermission(run.runId, event.data.toolCallId, "allow"); setTimeout(resolve, 300); }
    });
  });
  await runs.stopRun(run.runId);
  await untilDone(run.runId);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const killed = eventsOf(run.runId, "command_output");
  test.assert(killed.length === 1 && killed[0].exitCode === null && !fs.existsSync(marker2),
    "a stopped run kills its still-running approved command (recorded with no exit code); the command did not finish");
  const alive = spawnSync("pgrep", ["-f", "sleep 2932"], { encoding: "utf8" }).status === 0;
  test.assert(!alive, "the stopped command's process group is gone");
  await runs.discardRun(run.runId);
}
{
  // The output a command may leave in the events is capped.
  const noisy = "yes x | head -n 200000";
  configureStub([["t1", "bash", { command: noisy, outsideSandbox: true }]]);
  const run = await runs.createCodeRun({ folderId: grant.id, prompt: "noise" });
  answerWith(run.runId, ["allow"]);
  await untilDone(run.runId);
  const outputs = eventsOf(run.runId, "command_output");
  test.assert(outputs.length === 1 && outputs[0].exitCode === 0 && outputs[0].output.length > 0 && outputs[0].output.length <= 128 * 1024,
    "a chatty command's output is capped in the events, not streamed into the log's budget");
  await runs.discardRun(run.runId);
}

// --- 5. Guards ----------------------------------------------------------------

let bypassStart = "";
try { await runs.createCodeRun({ folderId: grant.id, prompt: "x", mode: "bypass" }); } catch (error) { bypassStart = error.code; }
test.assert(bypassStart === "mode_refused", "Bypass is refused at start: the writer's real Mac is never an isolated environment");
{
  configureStub([]);
  const run = await runs.createCodeRun({ folderId: grant.id, prompt: "x" });
  await untilDone(run.runId);
  let bypassMode = "";
  try { runs.setRunMode(run.runId, "bypass"); } catch (error) { bypassMode = error.code; }
  test.assert(bypassMode === "mode_refused", "Bypass is refused as a mode switch too");
  let badId = "";
  try { runs.answerPermission(run.runId, "no-such-call", "allow"); } catch (error) { badId = error.code; }
  test.assert(badId === "permission_unknown", "a permission answer for no waiting ask is refused");
  await runs.discardRun(run.runId);
}

// --- 6. The boundary is structural -------------------------------------------

const runsSource = codeOnly(read("apps/server/server/cliocode/runs.js"));
test.assert(!runsSource.includes("sandbox-exec"), "the run module itself never wraps anything: sandbox-exec lives only in engine-host.js, and the outside-sandbox child is spawned bare");
test.assert(/spawn\("\/bin\/sh", \["-c", command\]/.test(runsSource), "the host runner runs exactly the approved command line");
test.assert(/runExternal: \(request\) => runExternalCommand\(run, request\)/.test(runsSource), "the run wires its own runner into the permission handler");
const permissionsSource = codeOnly(read("apps/server/server/cliocode/permissions.js"));
test.assert(/NO_SESSION_ALLOW = Object\.freeze\(\["delete", "runExternal"\]\)/.test(permissionsSource),
  "a session allow can never cover an outside-sandbox command (or a delete)");
test.assert(/typeof options\.runExternal !== "function"/.test(permissionsSource) && /external_refused/.test(permissionsSource),
  "without the host's runner the handler refuses the call instead of answering dsh: fail closed");
const posture = read("apps/server/server/cliocode/patches/posture.yml");
test.assert(!/- id: tool-bash\s*\n\s*disabled:\s*true/.test(posture), "the ClioCode posture offers the shell (M9.4/M9.5): commands reach the mode table as asks");

// Cleanup.
fs.rmSync(scratch, { recursive: true, force: true });
test.finish();
