// Agent task follow-up queue — executable contract.
//
// While a turn runs the writer can add messages to the task; they are queued
// on the server (task.queue, in task.json) and sent as ONE next turn when the
// turn ends normally:
//
//   1. queue     POST /tasks/:id/queue adds a follow-up while a turn runs (202,
//                task.queue lists it); at most 5 wait, the 6th is 409
//                queue_full; an empty text is 400; a removed one is gone (404
//                for one that is not waiting); a task that is not running
//                refuses (409 task_not_busy);
//   2. start     when the turn ends normally the queued words start one turn by
//                themselves: in order, each marked as a follow-up, verbatim,
//                with the connectors, engine and model the page sent when it
//                queued; the queue is empty afterwards;
//   3. dropped   a stop, a failed run, a settle drop the queue (queueDropped
//                says how many) and no turn starts;
//   4. gate      a plan-gated task does not approve by itself: the queue waits
//                at awaiting_plan and rides along on the writer's approval, after
//                the writer's own words;
//   5. reload    the queue is in task.json: it survives the in-memory store
//                being thrown away (a page or server reload).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("agent-task-queue");

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ais6-task-queue-")));
process.env.AI_SYSTEM6_AGENT_HOME = path.join(scratch, "agent-home");
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";

const folders = require("../../apps/server/server/agent/folders.js");
const paths = require("../../apps/server/server/agent/paths.js");
const runs = require("../../apps/server/server/agent/runs.js");
const tasks = require("../../apps/server/server/agent/tasks.js");
const { agentToken } = require("../../apps/server/server/agent/agent-token.js");
const router = require("../../apps/server/server/router.js");

const grants = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map((name) => {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "note.md"), `${name}\n`);
  return folders.grantFolder(dir, "change");
});
const change = (grant) => ({ kind: "folder", id: grant.id, name: grant.name, level: "change" });

/** What each run was asked: the prompt text, and the connectors/engine createRun received. */
const prompts = [];
const connectorCalls = [];
const gates = [];
let failNext = false;
function startEngine(options) {
  const cwd = fs.realpathSync(options.work);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  gates.push(release);
  return Promise.resolve({
    sessionId: "11111111-2222-3333-4444-555555555555",
    cwd,
    async prompt(text) {
      prompts.push(text);
      await gate;
      if (failNext) { failNext = false; throw new Error("engine broke"); }
      return { stopReason: "end_turn" };
    },
    async cancel() { release(); },
    async close() {},
    kill() {},
  });
}
const releaseAll = () => gates.splice(0).forEach((release) => release());
runs.configureRunsForTests({
  resolveKey: async () => "k-test",
  startEngine,
  normalizeConnectors: async (list) => { connectorCalls.push(list); return []; },
});

async function until(check, label) {
  const limit = Date.now() + 3000;
  while (!check() && Date.now() < limit) await new Promise((resolve) => setTimeout(resolve, 5));
  test.assert(check(), label);
}

async function call(method, url, body) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []);
  Object.assign(req, {
    method,
    url,
    headers: {
      host: "127.0.0.1:4173",
      ...(payload ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) } : {}),
      "x-ai-system6-agent-token": agentToken,
    },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const handler = router.resolveRoute(req);
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

const read = async (id) => (await call("GET", `/api/agent/tasks/${id}`)).json;
const queueOf = async (id) => (await read(id)).task.queue.map((entry) => entry.text);
const ungated = (grant, prompt = "Start the errand") => call("POST", "/api/agent/tasks", { prompt, mounts: [change(grant)], planGate: false, language: "en" });
// The page sends the connectors, engine and model of the moment with every follow-up.
const pageSends = { connectors: [{ name: "notes", url: "http://127.0.0.1:9/mcp" }], engine: "deepseek", model: "page-model" };
const queue = (id, text, extra = pageSends) => call("POST", `/api/agent/tasks/${id}/queue`, { text, ...extra });
const done = (id) => ["done", "error", "stopped"].includes(runs.getRun(id).state);

// --- 1. queue: add, cap, remove, refusals ------------------------------------

const a = (await ungated(grants[0])).json.task;
await until(() => prompts.length === 1, "turn 1 is running");
test.assert((await queue(a.id, "   ")).json?.code === "prompt_required", "an empty follow-up is refused (400 prompt_required)");
const first = await queue(a.id, "First: shorter intro");
test.assert(first.status === 202 && first.json.task.queue.length === 1 && first.json.task.queue[0].text === "First: shorter intro" && first.json.task.queue[0].id.startsWith("q-"),
  `a follow-up queued while the turn runs is listed (got ${first.status})`);
const second = await queue(a.id, "Second: keep the 2019 story");
const third = await queue(a.id, "Third: cut the ending");
test.assert(second.json.task.queue.length === 2 && third.json.task.queue.length === 3, "follow-ups queue in order");
const stored = JSON.parse(fs.readFileSync(path.join(paths.tasksRoot(), a.id, "task.json"), "utf8"));
test.assert(stored.queue.map((entry) => entry.text).join("|") === "First: shorter intro|Second: keep the 2019 story|Third: cut the ending" && !JSON.stringify(stored).includes("127.0.0.1:9"),
  "the queue is in task.json; the connectors are not");
test.assert(JSON.stringify(stored.queue[0]) && Object.keys(stored.queue[0]).sort().join() === "at,id,text", "a queued entry stores only id, text and time");

const middle = third.json.task.queue[1].id;
const removed = await call("POST", `/api/agent/tasks/${a.id}/queue/${middle}/remove`, {});
test.assert(removed.status === 200 && removed.json.task.queue.map((entry) => entry.text).join("|") === "First: shorter intro|Third: cut the ending", "a queued follow-up can be removed before it is sent");
test.assert((await call("POST", `/api/agent/tasks/${a.id}/queue/${middle}/remove`, {})).json?.code === "queue_unknown", "removing one that is not waiting is 404 queue_unknown");
await queue(a.id, "Fourth");
await queue(a.id, "Fifth");
const fifth = await queue(a.id, "Fifth after all");
const sixth = await queue(a.id, "Sixth");
test.assert(fifth.status === 202 && sixth.status === 409 && sixth.json.code === "queue_full" && (await queueOf(a.id)).length === 5, "the 6th message is refused (409 queue_full) with five waiting");

// --- 5. reload: the queue is read back from disk -----------------------------

tasks.resetTasksForTests();
test.assert((await queueOf(a.id)).length === 5, "the queue survives the in-memory store being thrown away");

// --- 2. the turn ends: one next turn carries the queue -----------------------

// A page reload keeps the server's memory; a fresh follow-up re-sends what the page holds.
await call("POST", `/api/agent/tasks/${a.id}/queue/${(await read(a.id)).task.queue[3].id}/remove`, {});
await queue(a.id, "Last one");
const connectorsBefore = connectorCalls.length;
releaseAll();
await until(() => prompts.length === 2, "the queued follow-ups started one next turn by themselves");
const sent = prompts[1];
const marks = [...sent.matchAll(/\[Follow-up (\d) of (\d): [^\]]*\]\n([^\n]*)/g)].map((match) => `${match[1]}/${match[2]} ${match[3]}`);
test.assert(marks.join("|") === "1/5 First: shorter intro|2/5 Third: cut the ending|3/5 Fourth|4/5 Fifth after all|5/5 Last one", `the next turn carries the follow-ups in order, each marked, verbatim (got ${marks.join("|")})`);
const afterStart = await read(a.id);
test.assert(afterStart.turns.length === 2 && afterStart.task.queue.length === 0 && afterStart.task.state === "working" && !afterStart.task.queueDropped, "one turn started and the queue is empty");
test.assert(connectorCalls.length === connectorsBefore + 1 && connectorCalls[connectorCalls.length - 1]?.[0]?.name === "notes", "the page's connectors went with the turn the server started");
test.assert(runs.getRun(afterStart.turns[1].id).engine === "deepseek" && runs.getRun(afterStart.turns[1].id).model === "page-model", "and so did the engine and model the page last sent");
test.assert(afterStart.turns[1].prompt.includes("[Follow-up 1 of 5") && JSON.stringify((await read(a.id)).task).includes("127.0.0.1:9") === false, "the turn record keeps the writer's words; no credentials are stored");
releaseAll();
await until(() => done(afterStart.turns[1].id), "turn 2 finished");
await until(() => prompts.length === 2, "nothing more starts when no follow-ups are queued");
test.assert((await read(a.id)).task.state === "delivered", "without a queue the turn ends delivered");
test.assert((await queue(a.id, "late")).json?.code === "task_not_busy", "a task that is not running refuses a follow-up (409 task_not_busy)");
await call("POST", `/api/agent/tasks/${a.id}/settle`, {});

// --- 3. stop, failure and settle drop the queue ------------------------------

const b = (await ungated(grants[1])).json.task;
await until(() => prompts.length === 3, "task B is running");
await queue(b.id, "Queued, then stopped");
await queue(b.id, "Also queued");
const stopped = await call("POST", `/api/agent/tasks/${b.id}/stop`, {});
test.assert(stopped.status === 200 && stopped.json.task.queue.length === 0 && stopped.json.task.queueDropped.count === 2 && stopped.json.task.queueDropped.reason === "stopped", "a stop drops the queue and says how many");
releaseAll();
await new Promise((resolve) => setTimeout(resolve, 80));
test.assert(prompts.length === 3 && (await read(b.id)).turns.length === 1, "nothing starts after a stop");
await call("POST", `/api/agent/tasks/${b.id}/settle`, {});

const c = (await ungated(grants[2])).json.task;
await until(() => prompts.length === 4, "task C is running");
await queue(c.id, "Queued, then the engine breaks");
failNext = true;
releaseAll();
await until(() => done(c.turns[0]), "the failing turn ended");
await new Promise((resolve) => setTimeout(resolve, 80));
const failed = await read(c.id);
test.assert(failed.task.state === "failed" && failed.task.queue.length === 0 && failed.task.queueDropped?.reason === "failed" && failed.turns.length === 1 && prompts.length === 4, "an error drops the queue and starts nothing");
await call("POST", `/api/agent/tasks/${c.id}/settle`, {});

const d = (await ungated(grants[3])).json.task;
await until(() => prompts.length === 5, "task D is running");
await queue(d.id, "Queued, then put away");
const settled = await call("POST", `/api/agent/tasks/${d.id}/settle`, {});
test.assert(settled.json.task.state === "settled" && settled.json.task.queue.length === 0 && settled.json.task.queueDropped.reason === "settled", "settling drops the queue");
releaseAll();
await new Promise((resolve) => setTimeout(resolve, 80));
test.assert(prompts.length === 5, "nothing starts after a settle");

// --- 4. the plan gate holds the queue ----------------------------------------

const e = (await call("POST", "/api/agent/tasks", { prompt: "Plan the rewrite", mounts: [change(grants[4])], language: "en" })).json.task;
await until(() => prompts.length === 6, "the gated plan turn is running");
test.assert(e.state === "planning", "the gated task is planning");
await queue(e.id, "While you plan: keep my title");
releaseAll();
await until(() => done(e.turns[0]), "the plan turn ended");
await new Promise((resolve) => setTimeout(resolve, 80));
const held = await read(e.id);
test.assert(held.task.state === "awaiting_plan" && held.turns.length === 1 && held.task.queue.length === 1 && prompts.length === 6, "the plan waits for the writer: nothing is approved by itself and the queue stays");
const approved = await call("POST", `/api/agent/tasks/${e.id}/turns`, { prompt: "Go ahead", approvePlan: true });
test.assert(approved.status === 202 && approved.json.turn.level === "change" && approved.json.task.queue.length === 0, `the writer's approval takes the queue along (got ${approved.status})`);
const rode = prompts[prompts.length - 1];
test.assert(rode.endsWith("Go ahead\n\n[Follow-up 1 of 1: the writer added this while the earlier turn was still running]\nWhile you plan: keep my title"), "the writer's words come first, then the follow-up, marked");

releaseAll();
await Promise.all(runs.listRuns().map((run) => runs.stopRun(run.runId).catch(() => {})));
tasks.resetTasksForTests();
runs.resetRunsForTests();
fs.rmSync(scratch, { recursive: true, force: true });
test.finish();
