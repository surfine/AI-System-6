// Long-task harness (Clio, 2026-10-31) — executable contract.
//
//   1. ledger   each task turn's engine is asked for a progress ledger; the host
//               harvests it onto the turn (never a proposal) and the task shows the
//               latest; three stuck/looping turns in a row stop the task at a
//               stuck report (a question: tried, stuck at, needs); the next turn's
//               preamble carries the ledgers;
//   2. resume   after a restart a working task reads stopped + interrupted; a
//               further turn (Continue) carries the earlier turns and says the last
//               was cut short;
//   3. fork     POST /tasks/:id/fork { fromTurn, prompt? } makes a new task whose
//               first turn starts from the snapshot turn N found, with the turns
//               before N as history; the original is untouched.
//
// Stub engine, real router, temp agent home (as agent-tasks.test.mjs).

import crypto from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import vm from "node:vm";

import { createFeatureTest, read as readRepo } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("agent-longtask");

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ais6-agent-longtask-")));
process.env.AI_SYSTEM6_AGENT_HOME = path.join(scratch, "agent-home");
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";

const folders = require("../../apps/server/server/agent/folders.js");
const paths = require("../../apps/server/server/agent/paths.js");
const pricing = require("../../apps/server/server/agent/pricing.js");
const proposals = require("../../apps/server/server/agent/proposals.js");
const runs = require("../../apps/server/server/agent/runs.js");
const tasks = require("../../apps/server/server/agent/tasks.js");
const { agentToken } = require("../../apps/server/server/agent/agent-token.js");
const router = require("../../apps/server/server/router.js");

const grants = [];
for (const name of ["Alpha", "Beta", "Gamma"]) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "note.md"), `${name}\n`);
  grants.push(folders.grantFolder(dir, "change"));
}

async function until(check, label) {
  const limit = Date.now() + 3000;
  while (!check() && Date.now() < limit) await new Promise((resolve) => setTimeout(resolve, 5));
  test.assert(check(), label);
}

/** Drive a request through the real route table and handler. */
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


const prompts = [];
let script = () => ({});
let hold = null;
function scripted(options) {
  const cwd = fs.realpathSync(options.work);
  return Promise.resolve({
    sessionId: "11111111-2222-3333-4444-555555555555",
    cwd,
    async prompt(text) {
      prompts.push(text);
      const plan = script(prompts.length, cwd) || {};
      for (const [name, content] of Object.entries(plan.files || {})) fs.writeFileSync(path.join(cwd, name), content);
      if (plan.ledger) {
        fs.mkdirSync(path.join(cwd, ".ais6-proposals"), { recursive: true });
        fs.writeFileSync(path.join(cwd, ".ais6-proposals", "ledger.json"), JSON.stringify(plan.ledger));
      }
      if (hold) await hold;
      return { stopReason: "end_turn" };
    },
    async cancel() {},
    async close() {},
    kill() {},
  });
}
runs.configureRunsForTests({ resolveKey: async () => "k-test", startEngine: scripted });

const alphaDir = path.join(scratch, "Alpha");
const runDone = (id) => ["done", "error", "stopped"].includes(runs.getRun(id).state);
const taskOf = async (id) => (await call("GET", `/api/agent/tasks/${id}`)).json;
const open = (prompt) => call("POST", "/api/agent/tasks", { prompt, planGate: false, language: "en", mounts: [{ kind: "folder", id: grants[0].id, name: grants[0].name, level: "change" }] });
async function turn(id, words) {
  const out = await call("POST", `/api/agent/tasks/${id}/turns`, { prompt: words });
  await until(() => runDone(out.json.turn.id), `turn ${out.json?.turn?.n} finished`);
  return out;
}
const ledgerOf = (stuck, extra = {}) => ({ facts: ["a fact"], done: ["tried the first way"], next: ["ask the writer"], stuck, looping: false, ...extra });

// --- 1. progress ledger and stuck report ------------------------------------

script = () => ({ ledger: ledgerOf(false, { done: ["read the draft"] }) });
const one = (await open("Tidy the chapter")).json.task;
await until(() => runDone(one.turns[0]), "turn 1 finished");
const afterOne = await taskOf(one.id);
test.assert(prompts[0].includes("ledger.json") && afterOne.task.ledger?.done[0] === "read the draft" && afterOne.turns[0].ledger.facts[0] === "a fact",
  "the engine is asked for a ledger each turn; the host harvests it onto the turn and the task shows the latest");
test.assert(!afterOne.turns[0].result.proposals.length, "the ledger file is not offered to the writer as a proposal");

script = () => ({ ledger: ledgerOf(true, { failingStep: "open the locked file" }) });
await turn(one.id, "Try again");
const afterTwo = await turn(one.id, "And again");
test.assert(afterTwo.json.task.state !== "awaiting_answer" && (await taskOf(one.id)).task.state === "delivered", "two stuck turns in a row do not stop the task");
await turn(one.id, "Once more");
const stuck = await taskOf(one.id);
const report = stuck.turns[3].result.proposals.find((entry) => entry.kind === "question");
test.assert(stuck.task.state === "awaiting_answer" && report, "three stuck turns in a row stop the task at a question for the writer");
const detail = (await call("GET", `/api/agent/runs/${stuck.turns[3].id}/proposals`)).json.proposals.find((entry) => entry.kind === "question");
test.assert(detail.payload.stuckReport === true && detail.payload.text.includes("Tried: ") && detail.payload.text.includes("Stuck at: open the locked file") && detail.payload.text.includes("Needs from you: ask the writer"),
  "the stuck report says what was tried, where it is stuck and what it needs, from the ledgers' own lines");
const answered = await turn(one.id, "Use the other file");
test.assert((await taskOf(one.id)).task.state === "delivered" && prompts.at(-1).includes("the engine's own ledger"), "the writer's answer goes on, the count starts again, and the next turn's preamble carries the ledgers");
test.assert(answered.json.turn.n === 5, "the answer is turn 5");
await call("POST", `/api/agent/tasks/${one.id}/settle`, {});

// --- 2. cross-day resume ----------------------------------------------------

script = () => ({ files: { "one.md": "one\n" } });
hold = new Promise(() => {});
const cut = (await open("Draft the summary")).json.task;
await until(() => runs.getRun(cut.turns[0]).state === "running", "the turn to be interrupted is running");
tasks.resetTasksForTests();
runs.resetRunsForTests();
runs.configureRunsForTests({ resolveKey: async () => "k-test", startEngine: scripted });
hold = null;
const listedAfter = (await call("GET", "/api/agent/tasks")).json.tasks.find((entry) => entry.id === cut.id);
test.assert(listedAfter.state === "stopped" && listedAfter.interrupted === true, "after a restart a task that was working reads as interrupted (stopped, not dropped)");
const continued = await call("POST", `/api/agent/tasks/${cut.id}/turns`, { prompt: "Continue" });
await until(() => runDone(continued.json.turn.id), "the continued turn finished");
test.assert(continued.status === 202 && continued.json.turn.n === 2 && prompts.at(-1).includes("turn 1: the writer said") && prompts.at(-1).includes("Draft the summary") && prompts.at(-1).includes("cut short"),
  "Continue starts the next turn with the earlier turns and a note that the last was cut short");
test.assert(!(await taskOf(cut.id)).task.interrupted, "once continued the task is no longer interrupted");
await call("POST", `/api/agent/tasks/${cut.id}/settle`, {});

// --- 3. fork ------------------------------------------------------------------

fs.writeFileSync(path.join(alphaDir, "note.md"), "Alpha\n");
script = () => ({});
const root = (await open("Plan A for the intro")).json.task;
await until(() => runDone(root.turns[0]), "root turn 1 finished");
await turn(root.id, "Now plan B for the ending");
fs.writeFileSync(path.join(alphaDir, "note.md"), "Alpha moved on\n");
let seen = null;
script = (n, cwd) => { seen = fs.readFileSync(path.join(cwd, "note.md"), "utf8"); return {}; };
const forkedOut = await call("POST", `/api/agent/tasks/${root.id}/fork`, { fromTurn: 2, prompt: "Plan C instead" });
test.assert(forkedOut.status === 202 && forkedOut.json.task.id !== root.id && forkedOut.json.task.forkedFrom.taskId === root.id && forkedOut.json.task.forkedFrom.turn === 2, `fork answers a new task that names where it branched (got ${forkedOut.status} ${forkedOut.json?.code})`);
await until(() => runDone(forkedOut.json.task.turns[0]), "the fork's turn finished");
test.assert(seen === "Alpha\n", "the fork's first turn starts from the snapshot turn 2 found, not the folder as it is now");
const sent = prompts.at(-1);
test.assert(sent.includes("Plan A for the intro") && !sent.includes("Now plan B for the ending") && sent.includes("Plan C instead"), "the fork carries the turns before the branch as history and the writer's new words");
const rootAfter = await taskOf(root.id);
test.assert(rootAfter.turns.length === 2 && rootAfter.task.state === "delivered" && !rootAfter.task.forkedFrom, "the original task is untouched");
test.assert((await call("POST", `/api/agent/tasks/${root.id}/fork`, { fromTurn: 9 })).json.code === "bad_turn", "an unknown turn is 400 bad_turn");

await Promise.all(runs.listRuns().map((run) => runs.stopRun(run.runId).catch(() => {})));
tasks.resetTasksForTests();
runs.resetRunsForTests();
fs.rmSync(scratch, { recursive: true, force: true });
test.finish();
