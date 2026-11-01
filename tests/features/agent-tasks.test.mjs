// Agent tasks (Clio M1, slice 1) — executable contract.
//
// A task is a writer's errand over turns; turn 1 is an ordinary run. Driven
// through the real router and handlers with a stub engine (no model, no
// sandbox), against a temp agent home:
//
//   1. create    POST /api/agent/tasks answers { task } in "planning", and with
//                the plan gate (default) turn 1 runs at level "read" even when
//                the mount says "change"; without the gate it keeps the mount's
//                level and the task is "working";
//   2. read      list and get answer the contract's shapes (turn id = run id);
//   3. stop/settle  stop ends the live run and the task reads "stopped"; settle
//                closes it;
//   4. cap       a third task while two are planning/working answers 409
//                task_limit and leaves nothing behind; a finished plan frees
//                its slot ("awaiting_plan");
//   5. token     every route refuses a request without the per-boot token;
//   6. turns     (slice 2) POST /tasks/:id/turns: an unapproved plan keeps the
//                next turn at "read", approvePlan moves it to the mount's level,
//                a task that is not waiting (or two live tasks) refuses; the
//                priorTurns preamble carries the writer's earlier words
//                verbatim and a ledger from the run records, never the model's
//                own text; the turn record shows its proposals and changes;
//   7. kinds     plan, question, deliver, flag and new-document are accepted
//                when well formed and dropped when not; a pending question puts
//                the task in awaiting_answer, a plan in turn 1 awaiting_plan;
//   8. rewind    (slice 3) each turn snapshots work/ before its engine starts;
//                POST /tasks/:id/rewind { toTurn } restores the changes still
//                waiting in that turn and later ones to their snapshots, drops
//                their waiting proposals and marks the turns rewound, but
//                leaves accepted proposals, put-back files and an accepted
//                restore's staged files; refused while a turn runs (409
//                task_not_ready), an unknown turn is 400 bad_turn;
//   9. read      a turn that ran at level read keeps only plan and question
//                proposals; the rest is dropped and counted;
//  10. objects   (slice 4) a mount {kind: "object", id, name, files} lends a
//                document's projection bundle: checked by the cloud bundle's own
//                parser (sha256, paths, caps, a manifest.json) and refused with
//                nothing left behind, capped at propose, written under the
//                document's own folder name in every turn's work/, never put
//                back and never counted among the changes, read back as plain
//                files through GET /tasks/:id/objects/:objectId/projection-after
//                (409 while a turn runs, 404 for a document not lent), and
//                kept on this Mac for the next turn to start from again;
//  11. mounts    one folder plus lent documents run together at the lowest of
//                the mounts' levels, the folder's own files still put back; a
//                second folder is 400 task_mount_unsupported, a fifth mount 400
//                task_mounts_too_many;
//  12. cost      usage.costEstimate is the run's tokens at the provider's input
//                rate (CNY, by the hour the turn ended), summed over turns, and
//                absent as soon as one turn that spent tokens has no price; the
//                server's price table equals the browser's;
//  13. slice 5   a further turn may carry refreshed lent documents ({ objects:
//                [{ id, bundle }] }, checked like create; a refused turn changes
//                nothing; a document left out keeps its last bundle); a
//                documents-only task answers put-back and restore with 409
//                task_no_folder; settle frees the slot and discards snapshots and
//                objects.json (run records stay) and a settled task refuses turns
//                and rewind (409 task_not_active); after a restart the store
//                reloads from disk: a turn that was running reads as stopped, a
//                finished one is as it was, snapshots and objects survive.
//  14. round 8   lent documents live under .ais6-documents/<name>/, apart from
//                every real-folder entry (a real NFD "Café" folder and a lent
//                "Café" never meet; a real top-level entry of that name in any
//                case is out of the run and of put-back); paths of one bundle
//                that differ only in case are 400 task_object_invalid; the
//                200-file cap is shared by all documents at create and refresh;
//                a stop or settle sent while a turn starts waits for it and ends
//                it (settle frees the new snapshot and objects.json); a task a
//                restart stopped takes a further turn, and a rewind across the
//                interrupted turn is 409 run_active with nothing restored (it
//                goes ahead once that turn's run is discarded).

import crypto from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import vm from "node:vm";

import { createFeatureTest, read as readRepo } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("agent-tasks");

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ais6-agent-tasks-")));
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

/** An engine that works until released, or ends at once when asked to. */
const levels = [];
function engine({ hold }) {
  const gates = [];
  const start = async (options) => {
    levels.push(options.readOnly ? "read" : "write");
    const cwd = fs.realpathSync(options.work);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    gates.push(release);
    return {
      sessionId: "11111111-2222-3333-4444-555555555555",
      cwd,
      async prompt() {
        if (hold) await gate;
        return { stopReason: "end_turn" };
      },
      async cancel() { release(); },
      async close() {},
      kill() {},
    };
  };
  return { start, releaseAll: () => gates.forEach((release) => release()) };
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

const gated = (mount, extra = {}) => ({ prompt: "Plan the rewrite\nof chapter two", mounts: [mount], language: "en", ...extra });
const change = (grant) => ({ kind: "folder", id: grant.id, name: grant.name, level: "change" });

// --- 5 (first, nothing needs an engine): the boot token ----------------------

for (const [method, url] of [["GET", "/api/agent/tasks"], ["POST", "/api/agent/tasks"], ["GET", "/api/agent/tasks/task-x"], ["POST", "/api/agent/tasks/task-x/stop"], ["POST", "/api/agent/tasks/task-x/settle"]]) {
  const refused = await call(method, url, method === "POST" ? {} : undefined, { token: "" });
  test.assert(refused.status === 401 && refused.json.code === "agent_token_required", `${method} ${url} refuses a request without the boot token (401 agent_token_required)`);
}

// --- 1. create ---------------------------------------------------------------

let held = engine({ hold: true });
runs.configureRunsForTests({ resolveKey: async () => "k-test", startEngine: held.start });

const created = await call("POST", "/api/agent/tasks", gated(change(grants[0])));
const task = created.json?.task;
test.assert(created.status === 202 && task && task.state === "planning" && task.planGate === true, `create answers { task } in planning (got ${created.status})`);
test.assert(task.title === "Plan the rewrite" && task.mounts.length === 1 && task.mounts[0].level === "change" && task.mounts[0].name === "Alpha" && task.usage.tokens === 0 && task.turns.length === 1 && Number.isFinite(Date.parse(task.createdAt)),
  "the title is the first line of the writer's words; the task carries mounts, one turn id, createdAt and usage");
await until(() => levels.length === 1, "the engine started for turn 1");
const turn1 = runs.getRun(task.turns[0]);
test.assert(turn1.level === "read" && levels[0] === "read", "with the plan gate, turn 1 runs at level read although the mount says change (read-only sandbox)");

const ungated = await call("POST", "/api/agent/tasks", gated(change(grants[1]), { planGate: false, title: "Just do it" }));
test.assert(ungated.json.task.state === "working" && ungated.json.task.planGate === false && ungated.json.task.title === "Just do it" && runs.getRun(ungated.json.task.turns[0]).level === "change",
  "without the gate the task is working and turn 1 keeps the mount's level");

// --- 2. read -----------------------------------------------------------------

const listed = await call("GET", "/api/agent/tasks");
test.assert(listed.status === 200 && listed.json.tasks.length === 2 && listed.json.tasks.every((entry) => ["planning", "working"].includes(entry.state)), "list answers { tasks[] }");
const got = await call("GET", `/api/agent/tasks/${task.id}`);
test.assert(got.status === 200 && got.json.task.id === task.id && got.json.turns.length === 1
  && got.json.turns[0].id === task.turns[0] && got.json.turns[0].taskId === task.id && got.json.turns[0].n === 1
  && got.json.turns[0].level === "read" && got.json.turns[0].prompt === "Plan the rewrite\nof chapter two",
"get answers { task, turns[] }: the turn id is the run id and keeps the writer's words verbatim");
const unknown = await call("GET", "/api/agent/tasks/task-00000000-0000-0000-0000-000000000000");
test.assert(unknown.status === 404 && unknown.json.code === "task_unknown", "an unknown task answers 404 task_unknown");

// --- 4. the cap --------------------------------------------------------------

const third = await call("POST", "/api/agent/tasks", gated(change(grants[2])));
test.assert(third.status === 409 && third.json.code === "task_limit", `a third task while two are live answers 409 task_limit (got ${third.status} ${third.json?.code})`);
test.assert((await call("GET", "/api/agent/tasks")).json.tasks.length === 2, "the refused task leaves nothing behind");

// --- 3. stop and settle ------------------------------------------------------

const stopped = await call("POST", `/api/agent/tasks/${task.id}/stop`, {});
test.assert(stopped.status === 200 && stopped.json.task.state === "stopped" && runs.getRun(task.turns[0]).state === "stopped", "stop ends the active run and the task reads stopped");
test.assert((await call("POST", `/api/agent/tasks/${task.id}/stop`, {})).json.task.state === "stopped", "stopping a stopped task is a no-op");
const afterStop = await call("POST", "/api/agent/tasks", gated(change(grants[2])));
test.assert(afterStop.status === 202, "a stopped task frees its slot");
const settled = await call("POST", `/api/agent/tasks/${ungated.json.task.id}/settle`, {});
test.assert(settled.status === 200 && settled.json.task.state === "settled" && runs.getRun(ungated.json.task.turns[0]).state === "stopped", "settle closes the task (and ends a run still working)");
test.assert((await call("POST", `/api/agent/tasks/${task.id}/settle`, {})).json.task.state === "settled", "a stopped task can be settled");
test.assert((await call("POST", `/api/agent/tasks/${settled.json.task.id}/stop`, {})).json.code === "task_not_active", "a settled task cannot be stopped (409 task_not_active)");
test.assert((await call("GET", `/api/agent/tasks/${task.id}/stop`)).status === 405, "stop is POST only");

// --- 4b. a finished plan frees its slot --------------------------------------

held.releaseAll();
runs.configureRunsForTests({ startEngine: engine({ hold: false }).start });
const quick = await call("POST", "/api/agent/tasks", gated(change(grants[0])));
await until(() => runs.getRun(quick.json.task.turns[0]).state === "done", "the plan turn finished");
test.assert((await call("GET", `/api/agent/tasks/${quick.json.task.id}`)).json.task.state === "awaiting_plan", "a finished plan turn leaves the task awaiting_plan");
const live = (await call("GET", "/api/agent/tasks")).json.tasks.filter((entry) => ["planning", "working"].includes(entry.state));
test.assert(!live.some((entry) => entry.id === quick.json.task.id), "awaiting_plan is not live: the cap counts planning and working only");

// --- 6. further turns --------------------------------------------------------

/** An engine that follows a script per prompt: files, proposals, and a narrative of its own. */
const prompts = [];
let script = () => ({});
let hold = null;
function scripted(options) {
  levels.push(options.readOnly ? "read" : "write");
  const cwd = fs.realpathSync(options.work);
  return Promise.resolve({
    sessionId: "11111111-2222-3333-4444-555555555555",
    cwd,
    async prompt(text) {
      prompts.push(text);
      const plan = script(prompts.length, cwd) || {};
      for (const [name, body] of Object.entries(plan.files || {})) fs.writeFileSync(path.join(cwd, name), body);
      if (plan.used) options.onUpdate({ sessionUpdate: "usage_update", used: plan.used, size: 1_000_000 });
      (plan.proposals || []).forEach((doc, index) => {
        fs.mkdirSync(path.join(cwd, ".ais6-proposals"), { recursive: true });
        fs.writeFileSync(path.join(cwd, ".ais6-proposals", `${index + 1}-${doc.kind}.json`), JSON.stringify({ v: 1, reason: "", createdAt: new Date().toISOString(), ...doc }));
      });
      if (plan.narrative) options.onUpdate({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: plan.narrative } });
      if (hold) await hold;
      return { stopReason: "end_turn" };
    },
    async cancel() {},
    async close() {},
    kill() {},
  });
}
runs.configureRunsForTests({ startEngine: scripted });
const stateOf = async (id) => (await call("GET", `/api/agent/tasks/${id}`)).json.task.state;
const turnsOf = async (id) => (await call("GET", `/api/agent/tasks/${id}`)).json.turns;
const runDone = (id) => ["done", "error", "stopped"].includes(runs.getRun(id).state);

const alphaDir = path.join(scratch, "Alpha");
const planDoc = { kind: "plan", title: "The plan", payload: { steps: [{ text: "MODEL-STEP-TEXT tighten the opening", touches: ["Alpha"] }] } };
script = (n) => (n === 1 ? { narrative: "MODEL-NARRATIVE-ONE", proposals: [planDoc] } : { narrative: "MODEL-NARRATIVE-TWO", proposals: [planDoc] });
const taskId = quick.json.task.id;
const first = (await turnsOf(taskId))[0].id;

// Unapproved: turn 2 still runs at read, and the task is planning, then awaiting_plan again.
const refusedEmpty = await call("POST", `/api/agent/tasks/${taskId}/turns`, { prompt: "  " });
test.assert(refusedEmpty.status === 400 && refusedEmpty.json.code === "prompt_required", "a turn without words is refused (400 prompt_required)");
const refusedApprove = await call("POST", `/api/agent/tasks/${taskId}/turns`, { prompt: "x", approvePlan: "yes" });
test.assert(refusedApprove.status === 202, "approvePlan counts only as the boolean true (anything else is an ordinary unapproved turn)");
await until(() => runDone(refusedApprove.json.turn.id), "turn 2 finished");
test.assert(refusedApprove.json.turn.n === 2 && refusedApprove.json.turn.level === "read" && levels[levels.length - 1] === "read" && runs.getRun(refusedApprove.json.turn.id).level === "read",
  "an unapproved second turn runs at level read (read-only sandbox) although the mount says change");
test.assert(await stateOf(taskId) === "awaiting_plan", "the unapproved turn ends in awaiting_plan again");

// Wrong states: a task that is not waiting for the writer refuses a turn.
for (const [label, id] of [["a settled task", task.id], ["a task with no such id", "task-00000000-0000-0000-0000-000000000000"]]) {
  const refused = await call("POST", `/api/agent/tasks/${id}/turns`, { prompt: "more" });
  test.assert((label.includes("settled") ? refused.status === 409 && refused.json.code === "task_not_active" : refused.status === 404 && refused.json.code === "task_unknown"), `${label} refuses a turn (${refused.status} ${refused.json?.code})`);
}
test.assert((await call("GET", `/api/agent/tasks/${taskId}/turns`)).status === 405, "turns is POST only");

// Approval: the turn runs at the mount's level and the task is working, then delivered.
fs.writeFileSync(path.join(alphaDir, "note.md"), "Alpha\n");
script = () => ({ narrative: "MODEL-NARRATIVE-THREE", files: { "note.md": "Alpha, revised\n" },
  proposals: [{ kind: "deliver", title: "MODEL-TITLE-DELIVER", payload: { summary: "MODEL-SUMMARY handed over" } }, { kind: "flag", title: "A flag", payload: { target: { mount: "Alpha", quote: "Alpha" }, note: "MODEL-NOTE check" } }] });
const releaseHold = (() => { let release; hold = new Promise((resolve) => { release = resolve; }); return release; })();
const approved = await call("POST", `/api/agent/tasks/${taskId}/turns`, { prompt: "Third: go ahead and revise", approvePlan: true });
test.assert(approved.status === 202 && approved.json.turn.n === 3 && approved.json.turn.level === "change" && approved.json.task.state === "working" && levels[levels.length - 1] === "write",
  `approvePlan moves the turn to the mount's level and the task to working (got ${approved.status} ${approved.json?.turn?.level} ${approved.json?.task?.state})`);
const whileWorking = await call("POST", `/api/agent/tasks/${taskId}/turns`, { prompt: "too soon" });
test.assert(whileWorking.status === 409 && whileWorking.json.code === "task_not_ready", "a working task refuses a turn (409 task_not_ready)");
releaseHold();
await until(() => runDone(approved.json.turn.id), "turn 3 finished");
test.assert(await stateOf(taskId) === "delivered", "without a question or plan the finished turn leaves the task delivered");
const refusedLate = await call("POST", `/api/agent/tasks/${taskId}/turns`, { prompt: "x", approvePlan: true });
test.assert(refusedLate.status === 409 && refusedLate.json.code === "plan_not_pending", "approvePlan outside awaiting_plan is refused (409 plan_not_pending)");

// The turn record shows what the run produced.
const afterThree = await turnsOf(taskId);
const three = afterThree[2];
test.assert(three.result.changes.count === 1 && three.result.changes.modified === 1 && three.result.proposals.map((entry) => `${entry.kind}:${entry.status}`).join() === "deliver:pending,flag:pending" && three.result.proposals.every((entry) => entry.id.startsWith("pr-")),
  "GET /tasks/:id shows each turn's proposals (id, kind, status) and change counts");

// The writer decides: accept the deliver, reject the flag, put back the file.
runs.acceptProposalRun(three.id, "pr-1");
runs.discardProposalRun(three.id, "pr-2");
const reviewed = Object.fromEntries(runs.runChanges(three.id).changes.map((change) => [change.path, change.sha256]));
runs.putBackRun(three.id, { paths: ["note.md"], reviewed });
test.assert((await turnsOf(taskId))[2].result.proposals.map((entry) => entry.status).join() === "accepted,discarded", "a later accept or reject shows in the turn's result");

// Turn 4: the preamble is the writer's words plus facts, none of the model's text.
script = () => ({});
const fourth = await call("POST", `/api/agent/tasks/${taskId}/turns`, { prompt: "Fourth: now the ending" });
test.assert(fourth.status === 202 && fourth.json.turn.n === 4 && fourth.json.turn.level === "change", "a delivered task takes another turn at the mount's level");
await until(() => runDone(fourth.json.turn.id), "turn 4 finished");
const sent = prompts[prompts.length - 1];
test.assert(sent.includes("--- turn 1: the writer said ---\nPlan the rewrite\nof chapter two\n") && sent.includes("--- turn 3: the writer said ---\nThird: go ahead and revise\n") && sent.includes("--- turn 2: the writer said ---\nx\n") && sent.endsWith("Fourth: now the ending"),
  "the preamble quotes the writer's words of every earlier turn verbatim, then the new message");
test.assert(sent.includes("changes made: 1 (0 added, 1 modified, 0 deleted)") && sent.includes("put back by the writer: 1 file") && sent.includes("changes not put back: 0")
  && sent.includes("proposals: deliver pr-1 accepted; flag pr-2 rejected") && sent.includes("ran at level read"),
  "the ledger states changes made, put back, left, and proposals accepted and rejected, from the run records");
test.assert(!/MODEL-/.test(sent), "nothing the model said (its messages, proposal titles, plan steps, summaries, notes) reaches the next turn's preamble");
test.assert(prompts[0].includes("--- turn 1: the writer said ---") && prompts[0].includes("ran at level read"), "turn 2 already carries the preamble for turn 1");

// Two live tasks block a continuing third.
hold = new Promise(() => {});
script = () => ({});
const busyA = await call("POST", "/api/agent/tasks", gated(change(grants[1]), { planGate: false }));
const busyB = await call("POST", "/api/agent/tasks", gated(change(grants[2]), { planGate: false }));
const capped = await call("POST", `/api/agent/tasks/${taskId}/turns`, { prompt: "one more" });
test.assert(busyA.status === 202 && busyB.status === 202 && capped.status === 409 && capped.json.code === "task_limit" && await stateOf(taskId) === "delivered",
  "a turn counts against the two-task cap, and the refused task keeps its state");
await call("POST", `/api/agent/tasks/${busyA.json.task.id}/stop`, {});
await call("POST", `/api/agent/tasks/${busyB.json.task.id}/stop`, {});
hold = null;

// --- 7. proposal kinds -------------------------------------------------------

const parse = (doc) => proposals.parseProposal(Buffer.from(JSON.stringify({ v: 1, title: "t", ...doc })));
const ok = (kind, payload) => parse({ kind, payload });
const stepA = { text: "Read the draft", touches: ["Alpha"] };
test.assert(proposals.KINDS.join() === "scrap,review,restore,plan,question,deliver,flag,new-document,skill,memory,handoff", "KINDS lists the task kinds after the three older ones, then the skill, memory and handoff offers (M8)");
test.assert(ok("plan", { steps: [stepA, { text: "No mount touched" }] })?.payload.steps[1].touches.length === 0 && ok("plan", { steps: [stepA] })?.payload.steps[0].touches[0] === "Alpha", "a plan with steps (touches optional) is accepted");
for (const [label, payload] of [["no steps", { steps: [] }], ["steps not a list", { steps: "do it" }], ["a step without text", { steps: [{ touches: [] }] }], ["touches not names", { steps: [{ text: "a", touches: [3] }] }], ["a step that is a string", { steps: ["a"] }]]) {
  test.assert(ok("plan", payload) === null, `a plan with ${label} is dropped`);
}
test.assert(ok("question", { text: "Which year?", options: ["2020", "2021"] })?.payload.options.length === 2 && ok("question", { text: "Anything else?" })?.payload.options.length === 0, "a question with up to four options (or none) is accepted");
for (const [label, payload] of [["five options", { text: "q", options: ["a", "b", "c", "d", "e"] }], ["no text", { options: ["a"] }], ["an empty option", { text: "q", options: [""] }], ["options not strings", { text: "q", options: [1] }]]) {
  test.assert(ok("question", payload) === null, `a question with ${label} is dropped`);
}
test.assert(ok("deliver", { summary: "Done: two chapters." })?.payload.summary === "Done: two chapters." && ok("deliver", { summary: " " }) === null && ok("deliver", {}) === null, "a deliver needs a summary");
test.assert(ok("flag", { target: { mount: "Alpha", quote: "a line" }, note: "check" })?.payload.target.quote === "a line"
  && ok("flag", { target: { mount: "Sheet", address: "B4" }, note: "n" })?.payload.target.address === "B4"
  && ok("flag", { target: { mount: "Deck", slide: 3 }, note: "n" })?.payload.target.slide === 3, "a flag targets a quote, an address or a slide of a mount");
for (const [label, payload] of [["no anchor", { target: { mount: "A" }, note: "n" }], ["two anchors", { target: { mount: "A", quote: "q", slide: 1 }, note: "n" }], ["no mount", { target: { quote: "q" }, note: "n" }], ["no note", { target: { mount: "A", quote: "q" } }], ["slide 0", { target: { mount: "A", slide: 0 }, note: "n" }], ["a target that is text", { target: "A", note: "n" }]]) {
  test.assert(ok("flag", payload) === null, `a flag with ${label} is dropped`);
}
for (const format of ["docx", "xlsx", "pptx", "md"]) test.assert(ok("new-document", { format, name: "Plan", content: "# Plan" })?.payload.format === format, `a new-document in ${format} is accepted`);
for (const [label, payload] of [["an unknown format", { format: "pdf", name: "a", content: "c" }], ["no name", { format: "md", content: "c" }], ["a path as the name", { format: "md", name: "../a", content: "c" }], ["no content", { format: "md", name: "a" }], ["empty content", { format: "md", name: "a", content: " " }]]) {
  test.assert(ok("new-document", payload) === null, `a new-document with ${label} is dropped`);
}
test.assert(ok("plan", { steps: [stepA], extra: 1 }).payload.extra === undefined, "unknown payload fields are not copied");

// A pending question holds the task for an answer; a plan in turn 1 holds an ungated task too.
const askDoc = { kind: "question", title: "A question", payload: { text: "Which chapter first?", options: ["One", "Two"] } };
script = () => ({ proposals: [askDoc] });
const asked = await call("POST", "/api/agent/tasks", gated(change(grants[1])));
await until(() => runDone(asked.json.task.turns[0]), "the asking turn finished");
test.assert(await stateOf(asked.json.task.id) === "awaiting_answer", "a pending question moves the task to awaiting_answer (even from planning)");
const answered = await call("POST", `/api/agent/tasks/${asked.json.task.id}/turns`, { prompt: "Chapter two first." });
test.assert(answered.status === 202 && answered.json.turn.level === "read", "an awaiting_answer task takes the answer as its next turn, still read-only until the plan is approved");
await until(() => runDone(answered.json.turn.id), "the answering turn finished");
script = () => ({ proposals: [planDoc] });
const planned = await call("POST", "/api/agent/tasks", gated(change(grants[2]), { planGate: false }));
await until(() => runDone(planned.json.task.turns[0]), "the planning turn finished");
test.assert(await stateOf(planned.json.task.id) === "awaiting_plan", "a plan proposed in turn 1 leaves the task awaiting_plan, gate or not");
const decided = await call("POST", `/api/agent/tasks/${planned.json.task.id}/turns`, { prompt: "Approved", approvePlan: true });
test.assert(decided.status === 202 && decided.json.turn.level === "change", "approving a plan on an ungated task keeps the mount's level");
await until(() => runDone(decided.json.turn.id), "the approved turn finished");

// --- 8. snapshots and rewind (slice 3) ---------------------------------------

const deltaDir = path.join(scratch, "Delta");
fs.mkdirSync(deltaDir, { recursive: true });
fs.writeFileSync(path.join(deltaDir, "note.md"), "Delta\n");
const delta = folders.grantFolder(deltaDir, "change");
const read = (file) => fs.readFileSync(file, "utf8");
const statusesOf = (turn) => turn.result.proposals.map((entry) => `${entry.kind}:${entry.status}`).sort().join();
const changedPaths = (id) => runs.runChanges(id).changes.map((entry) => entry.path).sort().join();
const flagDoc = (note) => ({ kind: "flag", title: "A flag", payload: { target: { mount: "Delta", quote: "Delta" }, note } });
const deliverDoc = { kind: "deliver", title: "Delivery", payload: { summary: "Handed over" } };
const restoreDoc = { kind: "restore", title: "A restore", payload: { files: [{ name: "kept.md", content: "kept\n" }] } };

// Refused while a turn is running (the turn holds until released).
hold = new Promise(() => {});
script = () => ({});
const running = await call("POST", "/api/agent/tasks", gated(change(delta), { planGate: false }));
const whileRunning = await call("POST", `/api/agent/tasks/${running.json.task.id}/rewind`, { toTurn: 1 });
test.assert(running.status === 202 && whileRunning.status === 409 && whileRunning.json.code === "task_not_ready", `rewind while a turn is running answers 409 task_not_ready (got ${whileRunning.status} ${whileRunning.json?.code})`);
await call("POST", `/api/agent/tasks/${running.json.task.id}/stop`, {});
hold = null;
test.assert((await call("GET", `/api/agent/tasks/${running.json.task.id}/rewind`)).status === 405, "rewind is POST only");

// Turn 1 changes note.md and one.md, offers a deliver, a flag and a restore. The
// writer accepts the deliver and the restore and puts note.md back; one.md and
// the flag stay undelivered.
script = () => ({ files: { "note.md": "turn one\n", "one.md": "one\n" }, proposals: [deliverDoc, flagDoc("one"), restoreDoc] });
const rewindable = await call("POST", "/api/agent/tasks", gated(change(delta), { planGate: false }));
const rid = rewindable.json.task.id;
const r1 = rewindable.json.task.turns[0];
await until(() => runDone(r1), "the rewindable turn 1 finished");
const snap1 = (await turnsOf(rid))[0].snapshot;
test.assert(typeof snap1 === "string" && read(path.join(snap1, "note.md")) === "Delta\n" && !fs.existsSync(path.join(snap1, "one.md")) && !snap1.startsWith(runs.getRun(r1).shadow.root),
  "turn 1 records a snapshot of work/ as the turn found it, kept in the task's folder, outside the shadow");
runs.acceptProposalRun(r1, "pr-1");
runs.acceptProposalRun(r1, "pr-3");
runs.putBackRun(r1, { paths: ["note.md"], reviewed: Object.fromEntries(runs.runChanges(r1).changes.map((entry) => [entry.path, entry.sha256])) });
test.assert(read(path.join(deltaDir, "note.md")) === "turn one\n" && changedPaths(r1) === "kept.md,one.md", "turn 1: note.md was put back; one.md and the staged restore wait");

// Turn 2 (from the real folder as it is now) changes more and offers more.
script = () => ({ files: { "note.md": "turn two\n", "two.md": "two\n" }, proposals: [deliverDoc, flagDoc("two")] });
const second2 = await call("POST", `/api/agent/tasks/${rid}/turns`, { prompt: "Second words" });
await until(() => runDone(second2.json.turn.id), "turn 2 finished");
const r2 = second2.json.turn.id;
test.assert(read(path.join((await turnsOf(rid))[1].snapshot, "note.md")) === "turn one\n" && changedPaths(r2) === "note.md,two.md", "turn 2's snapshot holds what it found (turn 1's put-back included)");

const badTurns = [];
for (const toTurn of [0, 3, -1, 1.5, "2", null, undefined]) badTurns.push((await call("POST", `/api/agent/tasks/${rid}/rewind`, toTurn === undefined ? {} : { toTurn })).json?.code);
test.assert(badTurns.every((code) => code === "bad_turn"), `an unknown turn answers 400 bad_turn (${badTurns.join()})`);

const back2 = await call("POST", `/api/agent/tasks/${rid}/rewind`, { toTurn: 2 });
test.assert(back2.status === 200 && back2.json.rewound.length === 1 && back2.json.rewound[0].turn === 2 && back2.json.rewound[0].restored === 2 && back2.json.rewound[0].dropped === 2 && back2.json.task.state === "delivered",
  `rewind to 2 answers what it did (${back2.status} ${JSON.stringify(back2.json?.rewound)})`);
test.assert(changedPaths(r2) === "" && read(path.join(deltaDir, "note.md")) === "turn one\n", "turn 2's work is back to what it found and the real folder was not touched");
const afterBack2 = await turnsOf(rid);
test.assert(afterBack2[1].rewound === true && !afterBack2[0].rewound && statusesOf(afterBack2[1]) === "deliver:rewound,flag:rewound" && statusesOf(afterBack2[0]) === "deliver:accepted,flag:pending,restore:accepted",
  `turn 2 is marked rewound with its proposals dropped; turn 1 is as it was (${statusesOf(afterBack2[0])})`);
test.assert((await call("POST", `/api/agent/tasks/${rid}/rewind`, { toTurn: 2 })).json.code === "bad_turn", "a turn already rewound cannot be rewound to again (400 bad_turn)");

// A later turn leaves the rewound one out of its preamble, and numbers on.
script = () => ({ files: { "three.md": "three\n" }, proposals: [flagDoc("three")] });
const third3 = await call("POST", `/api/agent/tasks/${rid}/turns`, { prompt: "Third words" });
await until(() => runDone(third3.json.turn.id), "turn 3 finished");
const preamble = prompts[prompts.length - 1];
test.assert(third3.json.turn.n === 3 && preamble.includes("--- turn 1: the writer said ---") && !preamble.includes("Second words") && !preamble.includes("--- turn 2:"), "turn 3 is numbered on and its preamble leaves the rewound turn out");

// Rewind to 1: turns 1 and 3 go back; what the writer accepted or put back stays.
const back1 = await call("POST", `/api/agent/tasks/${rid}/rewind`, { toTurn: 1 });
test.assert(back1.status === 200 && back1.json.rewound.map((entry) => entry.turn).join() === "1,3", `rewind to 1 covers the turns not yet rewound (${JSON.stringify(back1.json?.rewound)})`);
test.assert(changedPaths(r1) === "kept.md" && !fs.existsSync(path.join(runs.getRun(r1).shadow.sealed, "one.md")) && read(path.join(runs.getRun(r1).shadow.sealed, "kept.md")) === "kept\n" && changedPaths(third3.json.turn.id) === "",
  "undelivered files go back (one.md, three.md); the accepted restore's staged file stays");
test.assert(read(path.join(deltaDir, "note.md")) === "turn one\n" && read(path.join(runs.getRun(r1).shadow.sealed, "note.md")) === "turn one\n", "the put-back file stays in the real folder and in the turn");
const afterBack1 = await turnsOf(rid);
test.assert(statusesOf(afterBack1[0]) === "deliver:accepted,flag:rewound,restore:accepted" && afterBack1.every((turn) => turn.rewound === true), "turn 1 keeps its accepted proposals; the undelivered flag is dropped");
test.assert(await stateOf(rid) === "delivered", "the task can go on after a rewind");

// --- 9. a read-level turn offers only plans and questions ---------------------

const scrapDoc = { kind: "scrap", title: "A clip", payload: { quoted: "a line", source: "somewhere" } };
script = () => ({ proposals: [deliverDoc, planDoc, scrapDoc, flagDoc("read"), restoreDoc] });
const readTask = await call("POST", "/api/agent/tasks", gated(change(delta)));
await until(() => runDone(readTask.json.task.turns[0]), "the gated turn finished");
const readTurn = (await turnsOf(readTask.json.task.id))[0];
test.assert(readTurn.level === "read" && readTurn.result.proposals.map((entry) => entry.kind).join() === "plan" && readTurn.result.proposals[0].id === "pr-1",
  `a gated (read) turn keeps only its plan (got ${readTurn.result.proposals.map((entry) => entry.kind).join()})`);
test.assert(runs.getRun(readTask.json.task.turns[0]).events.some((event) => event.type === "proposal" && event.data.dropped === 4), "the four others are counted as dropped, as malformed ones are");
const readMount = { kind: "folder", id: delta.id, name: delta.name, level: "read" };
script = () => ({ proposals: [askDoc, scrapDoc] });
const readMounted = await call("POST", "/api/agent/tasks", gated(readMount, { planGate: false }));
await until(() => runDone(readMounted.json.task.turns[0]), "the read-mount turn finished");
test.assert((await turnsOf(readMounted.json.task.id))[0].result.proposals.map((entry) => entry.kind).join() === "question", "a turn at level read because the mount is read-only is filtered the same way");
script = () => ({ proposals: [deliverDoc, scrapDoc] });
const worker = await call("POST", `/api/agent/tasks/${readTask.json.task.id}/turns`, { prompt: "Go on", approvePlan: true });
await until(() => runDone(worker.json.turn.id), "the approved turn finished");
test.assert(worker.json.turn.level === "change" && (await turnsOf(readTask.json.task.id))[1].result.proposals.map((entry) => entry.kind).join() === "deliver,scrap", "a turn above read keeps every kind");

// --- 10. lent documents (slice 4) ---------------------------------------------

const sha = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");
const bundleFile = (filePath, text) => ({ path: filePath, encoding: "utf8", content: text, sha256: sha(text) });
const manifestText = JSON.stringify({ objectId: "", format: "docx", counts: { paragraphs: 2 } });
const draftText = "{#¶1} First line\n{#¶2} Second line\n";
const editedText = (n) => `{#¶1} First line, tightened (turn ${n})\n{#¶2} Second line\n`;
const projection = (text = draftText) => [bundleFile("manifest.json", manifestText), bundleFile("正文.md", text)];
const lend = (id, name, files = projection(), extra = {}) => ({ kind: "object", id, name, files, ...extra });
const lentTask = (mounts, extra = {}) => ({ prompt: "Tighten the draft", mounts, planGate: false, language: "en", ...extra });
const tasksOnDisk = () => fs.readdirSync(paths.tasksRoot()).sort().join();
const taskCount = async () => (await call("GET", "/api/agent/tasks")).json.tasks.length;
const afterUrl = (id, objectId) => `/api/agent/tasks/${id}/objects/${encodeURIComponent(objectId)}/projection-after`;
const textsOf = (answer) => Object.fromEntries((answer.json?.files || []).map((file) => [file.path, file.text]));

const beforeRefusals = { dirs: tasksOnDisk(), runs: runs.listRuns().length, tasks: await taskCount() };
const bigText = "a".repeat(Math.floor(4.5 * 1024 * 1024));
const refusals = [
  ["a bundle whose bytes do not match their sha256", lentTask([lend("o1", "Draft", [bundleFile("manifest.json", manifestText), { ...bundleFile("正文.md", draftText), sha256: "0".repeat(64) }])]), 400, "agent_cloud_bundle_hash_mismatch"],
  ["a bundle without manifest.json", lentTask([lend("o1", "Draft", [bundleFile("正文.md", draftText)])]), 400, "task_object_manifest_missing"],
  ["a manifest that is not a JSON object", lentTask([lend("o1", "Draft", [bundleFile("manifest.json", "[1]"), bundleFile("正文.md", draftText)])]), 400, "task_object_invalid"],
  ["an object mount without files", lentTask([{ kind: "object", id: "o1", name: "Draft" }]), 400, "task_object_bundle_missing"],
  ["an object mount without an id", lentTask([lend("", "Draft")]), 400, "task_object_invalid"],
  ["the same document lent twice", lentTask([lend("o1", "Draft"), lend("o1", "Draft")]), 400, "task_object_invalid"],
  ["a path that leaves the document", lentTask([lend("o1", "Draft", [bundleFile("manifest.json", manifestText), bundleFile("../escape.md", "x")])]), 400, "agent_cloud_bad_path"],
  ["201 files", lentTask([lend("o1", "Draft", [bundleFile("manifest.json", manifestText), ...Array.from({ length: 200 }, (_, index) => bundleFile(`p${index}.md`, "x"))])]), 413, "agent_cloud_too_many_files"],
  ["more bytes than the shared cap over two documents", lentTask([lend("o1", "One", [bundleFile("manifest.json", manifestText), bundleFile("a.md", bigText)]), lend("o2", "Two", [bundleFile("manifest.json", manifestText), bundleFile("b.md", bigText)])]), 413, "agent_cloud_upload_too_large"],
  ["an unknown level", lentTask([lend("o1", "Draft", projection(), { level: "admin" })]), 400, "bad_level"],
  ["an unknown kind", lentTask([{ kind: "web", id: "x" }]), 400, "task_mount_unsupported"],
  ["two folders", lentTask([change(grants[0]), change(grants[1])]), 400, "task_mount_unsupported"],
  ["five mounts", lentTask(["o1", "o2", "o3", "o4", "o5"].map((id) => lend(id, id))), 400, "task_mounts_too_many"],
  ["no mounts", lentTask([]), 400, "task_mounts_required"],
];
for (const [label, body, status, code] of refusals) {
  const refused = await call("POST", "/api/agent/tasks", body);
  test.assert(refused.status === status && refused.json?.code === code, `${label} is refused ${status} ${code} (got ${refused.status} ${refused.json?.code})`);
}
test.assert(tasksOnDisk() === beforeRefusals.dirs && runs.listRuns().length === beforeRefusals.runs && await taskCount() === beforeRefusals.tasks,
  "a refused task leaves nothing behind: no task folder, no run, no listing");

// An object-only task: capped at propose whatever the mount asks, run in a
// folder named for the document under .ais6-documents/, read back through
// projection-after.
const seenAtStart = [];
script = (_n, cwd) => {
  seenAtStart.push(fs.readFileSync(path.join(cwd, ".ais6-documents", "Draft", "正文.md"), "utf8"));
  return { files: { ".ais6-documents/Draft/正文.md": editedText(seenAtStart.length) } };
};
const lent = await call("POST", "/api/agent/tasks", lentTask([lend("doc-1", "Draft", projection(), { level: "change" })]));
const lentId = lent.json?.task?.id;
test.assert(lent.status === 202 && lent.json.task.mounts.length === 1 && JSON.stringify(lent.json.task.mounts[0]) === JSON.stringify({ kind: "object", id: "doc-1", name: "Draft", level: "propose" }),
  `an object mount is accepted and capped at propose although the request says change (got ${lent.status} ${JSON.stringify(lent.json?.task?.mounts)})`);
await until(() => runDone(lent.json.task.turns[0]), "the lent-document turn finished");
const lentRun = runs.getRun(lent.json.task.turns[0]);
test.assert(lentRun.level === "propose" && levels[levels.length - 1] === "write" && lentRun.folderId === "" && seenAtStart[0] === draftText,
  "the run is at propose with no real folder, and the engine found the document's projection under .ais6-documents/Draft/");
test.assert(prompts[prompts.length - 1].includes('".ais6-documents/Draft/"') && prompts[prompts.length - 1].includes("manifest.json"), "the engine is told where each lent document is and to leave manifest.json alone");
const objectsFile = path.join(paths.tasksRoot(), lentId, "objects.json");
test.assert(fs.existsSync(objectsFile) && (fs.statSync(objectsFile).mode & 0o777) === 0o600, "the bundle is kept in the task's own folder, readable by this user only");
const lentGot = await call("GET", `/api/agent/tasks/${lentId}`);
test.assert(!JSON.stringify(lentGot.json).includes("First line") && lentGot.json.task.mounts.every((mount) => !("files" in mount)), "the task and its turns never carry the document's text");

const after1 = await call("GET", afterUrl(lentId, "doc-1"));
test.assert(after1.status === 200 && after1.json.turn === 1 && after1.json.name === "Draft" && after1.json.runId === lent.json.task.turns[0]
  && textsOf(after1)["正文.md"] === editedText(1) && textsOf(after1)["manifest.json"] === manifestText && after1.json.skipped.length === 0,
  `projection-after answers the engine's edited files by their paths in the document (got ${after1.status} ${Object.keys(textsOf(after1)).join()})`);
test.assert(changedPaths(lent.json.task.turns[0]) === "" && (await turnsOf(lentId))[0].result.changes.count === 0,
  "a lent document's edits are not changes: the change list and the turn's counts leave them out");
let putBackRefusal = "";
try { runs.putBackRun(lent.json.task.turns[0], { paths: "all" }); } catch (error) { putBackRefusal = error.code; }
test.assert(putBackRefusal === "task_no_folder", `a run with no real folder puts nothing back (${putBackRefusal})`);

const unknownObject = await call("GET", afterUrl(lentId, "doc-nope"));
test.assert(unknownObject.status === 404 && unknownObject.json.code === "task_object_unknown", "a document not lent to the task answers 404 task_object_unknown");
test.assert((await call("GET", afterUrl(task.id, "doc-1"))).json.code === "task_object_unknown" && (await call("POST", afterUrl(lentId, "doc-1"), {})).status === 405 && (await call("GET", afterUrl("task-00000000-0000-0000-0000-000000000000", "doc-1"))).json.code === "task_unknown",
  "projection-after is GET only, and a task with no lent documents or no such id answers its own error");

// Turn 2 starts from the document as lent, not from turn 1's edit.
const lentTurn2 = await call("POST", `/api/agent/tasks/${lentId}/turns`, { prompt: "Once more" });
await until(() => runDone(lentTurn2.json.turn.id), "the second lent-document turn finished");
test.assert(seenAtStart[1] === draftText && textsOf(await call("GET", afterUrl(lentId, "doc-1")))["正文.md"] === editedText(2) && (await call("GET", afterUrl(lentId, "doc-1"))).json.turn === 2,
  "turn 2 found the document as lent (every turn is a fresh run) and projection-after reads the latest turn");

// Rewinding turn 2 puts the lent document back to what the turn found, and projection-after reads turn 1 again.
const lentBack = await call("POST", `/api/agent/tasks/${lentId}/rewind`, { toTurn: 2 });
const lentTurn2Files = textsOf({ json: runs.runObjectFiles(lentTurn2.json.turn.id, "doc-1") });
test.assert(lentBack.status === 200 && lentTurn2Files["正文.md"] === draftText && textsOf(await call("GET", afterUrl(lentId, "doc-1")))["正文.md"] === editedText(1),
  `a rewind undoes a lent document's edits too, and projection-after falls back to the last turn that stands (${lentBack.status})`);

// While a turn runs its edits are not final.
hold = new Promise(() => {});
script = () => ({});
const lentRunning = await call("POST", "/api/agent/tasks", lentTask([lend("doc-2", "Notes")]));
const whileLent = await call("GET", afterUrl(lentRunning.json.task.id, "doc-2"));
test.assert(whileLent.status === 409 && whileLent.json.code === "run_active", `projection-after while a turn is running answers 409 run_active (got ${whileLent.status} ${whileLent.json?.code})`);
await call("POST", `/api/agent/tasks/${lentRunning.json.task.id}/stop`, {});
hold = null;

// The bundle is what makes a next turn possible: without it the turn is refused and the task stays as it was.
const keptState = await stateOf(lentId);
fs.rmSync(objectsFile);
const noBundle = await call("POST", `/api/agent/tasks/${lentId}/turns`, { prompt: "More" });
test.assert(noBundle.status === 409 && noBundle.json.code === "task_object_bundle_missing" && await stateOf(lentId) === keptState, `a task whose lent bundle is gone refuses a turn (${noBundle.status} ${noBundle.json?.code})`);

// A name that is a path becomes one plain folder; every document's folder is under .ais6-documents/, apart from the real folder's own Draft.
const epsilonDir = path.join(scratch, "Epsilon");
fs.mkdirSync(path.join(epsilonDir, "Draft"), { recursive: true });
fs.writeFileSync(path.join(epsilonDir, "Draft", "own.md"), "own\n");
fs.writeFileSync(path.join(epsilonDir, "note.md"), "Epsilon\n");
const epsilon = folders.grantFolder(epsilonDir, "change");

// --- 11. a folder and lent documents together ---------------------------------

script = (_n, cwd) => {
  const dirs = fs.readdirSync(cwd).filter((name) => !name.startsWith(".") && fs.statSync(path.join(cwd, name)).isDirectory()).sort();
  seenAtStart.push(`${dirs.join()}|${fs.readdirSync(path.join(cwd, ".ais6-documents")).sort().join()}`);
  return { files: { "note.md": "Epsilon, revised\n", "Draft/own.md": "own, revised\n", ".ais6-documents/Draft/正文.md": editedText(9), ".ais6-documents/_.._Evil/正文.md": "evil edit\n" } };
};
const mixedMounts = [change(epsilon), lend("doc-3", "Draft", projection(), { level: "change" }), lend("doc-4", "../../Evil")];
const mixed = await call("POST", "/api/agent/tasks", lentTask(mixedMounts));
test.assert(mixed.status === 202 && mixed.json.task.mounts.map((mount) => `${mount.kind}:${mount.level}`).join() === "folder:change,object:propose,object:propose",
  `a task takes one folder and lent documents (got ${mixed.status} ${JSON.stringify(mixed.json?.task?.mounts)})`);
const mixedId = mixed.json.task.turns[0];
await until(() => runDone(mixedId), "the folder-and-documents turn finished");
const mixedRun = runs.getRun(mixedId);
const dirsOf = mixedRun.shadow.objects.map((entry) => entry.dir);
test.assert(mixedRun.level === "propose" && mixedRun.folderId === epsilon.id && dirsOf.join() === ".ais6-documents/Draft,.ais6-documents/_.._Evil"
  && dirsOf.every((dir) => dir.split("/").length === 2 && dir.startsWith(".ais6-documents/") && !dir.split("/")[1].startsWith(".")),
  `the run's level is the lowest of the mounts' and each document gets one plain folder under .ais6-documents/ (${dirsOf.join()})`);
test.assert(seenAtStart[seenAtStart.length - 1] === "Draft|Draft,_.._Evil" && fs.readdirSync(path.join(mixedRun.shadow.sealed, ".ais6-documents")).sort().join() === "Draft,_.._Evil",
  `the engine's working folder holds the real folder's own Draft, and the lent ones apart in .ais6-documents/ (${seenAtStart[seenAtStart.length - 1]})`);
test.assert(changedPaths(mixedId) === "Draft/own.md,note.md", `only the real folder's files are changes (got ${changedPaths(mixedId)})`);
runs.putBackRun(mixedId, { paths: "all", reviewed: Object.fromEntries(runs.runChanges(mixedId).changes.map((entry) => [entry.path, entry.sha256])) });
test.assert(read(path.join(epsilonDir, "note.md")) === "Epsilon, revised\n" && read(path.join(epsilonDir, "Draft", "own.md")) === "own, revised\n"
  && fs.readdirSync(epsilonDir).sort().join() === "Draft,note.md", "put back all: the folder's files went home, and no lent document was written into the real folder");
test.assert(textsOf(await call("GET", afterUrl(mixed.json.task.id, "doc-3")))["正文.md"] === editedText(9) && textsOf(await call("GET", afterUrl(mixed.json.task.id, "doc-4")))["正文.md"] === "evil edit\n",
  "each document reads back its own folder's files");

const readFolderMixed = await call("POST", "/api/agent/tasks", lentTask([{ ...change(epsilon), level: "read" }, lend("doc-5", "Draft")]));
await until(() => runDone(readFolderMixed.json.task.turns[0]), "the read-folder turn finished");
test.assert(runs.getRun(readFolderMixed.json.task.turns[0]).level === "read" && levels[levels.length - 1] === "read", "a folder mounted read-only holds the whole run read-only, lent documents with it");

// --- 12. cost estimate ----------------------------------------------------------

const endedAt = (id) => new Date(runs.getRun(id).endedAt);
const rounded = (value) => Math.round(value * 10_000) / 10_000;
script = () => ({ used: 250_000 });
const costly = await call("POST", "/api/agent/tasks", lentTask([change(delta)]));
await until(() => runDone(costly.json.task.turns[0]), "the priced turn finished");
const cost1 = (await call("GET", `/api/agent/tasks/${costly.json.task.id}`)).json.task.usage;
const expected1 = rounded(pricing.inputCostCny("deepseek-v4-flash", 250_000, endedAt(costly.json.task.turns[0])));
test.assert(cost1.tokens === 250_000 && cost1.costEstimate === expected1 && [0.25, 0.5].includes(cost1.costEstimate), `a DeepSeek turn's tokens are priced at the input rate for the hour it ended (${JSON.stringify(cost1)})`);
script = () => ({ used: 100_000 });
const costly2 = await call("POST", `/api/agent/tasks/${costly.json.task.id}/turns`, { prompt: "More" });
await until(() => runDone(costly2.json.turn.id), "the second priced turn finished");
const cost2 = (await call("GET", `/api/agent/tasks/${costly.json.task.id}`)).json.task.usage;
const expected2 = rounded(pricing.inputCostCny("deepseek-v4-flash", 250_000, endedAt(costly.json.task.turns[0])) + pricing.inputCostCny("deepseek-v4-flash", 100_000, endedAt(costly2.json.turn.id)));
test.assert(cost2.tokens === 350_000 && cost2.costEstimate === expected2, `the estimate adds up over turns (${JSON.stringify(cost2)})`);
script = () => ({ used: 50_000 });
const unpriced = await call("POST", `/api/agent/tasks/${costly.json.task.id}/turns`, { prompt: "On a local model", engine: "lmstudio", model: "qwen3.5-4b-mlx" });
await until(() => runDone(unpriced.json.turn.id), "the unpriced turn finished");
const cost3 = (await call("GET", `/api/agent/tasks/${costly.json.task.id}`)).json.task.usage;
test.assert(cost3.tokens === 400_000 && !("costEstimate" in cost3), `one unpriced turn that spent tokens takes the estimate away, tokens stay (${JSON.stringify(cost3)})`);
const local = await call("POST", "/api/agent/tasks", lentTask([change(delta)], { engine: "lmstudio", model: "qwen3.5-4b-mlx" }));
await until(() => runDone(local.json.task.turns[0]), "the local-model turn finished");
test.assert(!("costEstimate" in (await call("GET", `/api/agent/tasks/${local.json.task.id}`)).json.task.usage), "a task that only ran an unpriced engine has no estimate");
script = () => ({});
const free = await call("POST", "/api/agent/tasks", lentTask([change(delta)]));
await until(() => runDone(free.json.task.turns[0]), "the no-usage turn finished");
test.assert(!("costEstimate" in (await call("GET", `/api/agent/tasks/${free.json.task.id}`)).json.task.usage), "a task that spent no tokens has no estimate to show");

// The server's table is a copy of the browser's (runUsageText): both must price alike.
{
  const source = readRepo("apps/desktop/app/core/chat-messages.js");
  const start = source.indexOf("const CLOUD_PRICING_CNY_PER_1M");
  const end = source.indexOf("var latestCloudUsage");
  const browser = vm.runInNewContext(`${source.slice(start, end)}\n({ table: CLOUD_PRICING_CNY_PER_1M, cloudPricingFor })`);
  test.assert(start > 0 && end > start && JSON.stringify(browser.table) === JSON.stringify(pricing.CLOUD_PRICING_CNY_PER_1M), "the server's price table equals the browser's CLOUD_PRICING_CNY_PER_1M");
  const hours = [new Date("2026-03-02T02:00:00Z"), new Date("2026-03-02T05:00:00Z"), new Date("2026-03-02T07:00:00Z"), new Date("2026-03-02T16:30:00Z")];
  const models = ["deepseek-v4-flash", "deepseek-flash", "v4-flash", "deepseek-v4-flash-vision-exp", "v4-pro", "deepseek-v4-pro", "DeepSeek-V4-Pro ", "deepseek-chat", "qwen3.5-4b-mlx", "claude-sonnet-4-5", ""];
  test.assert(models.every((model) => hours.every((when) => JSON.stringify(browser.cloudPricingFor(model, when)) === JSON.stringify(pricing.pricingFor(model, when)))),
    "the server and the browser pick the same price for every model and hour band (peak, off-peak, retired names, unpriced)");
}

// --- 13. slice 5: refreshed documents, no folder, settle, restart ----------------

for (const entry of (await call("GET", "/api/agent/tasks")).json.tasks.filter((item) => ["planning", "working"].includes(item.state))) await call("POST", `/api/agent/tasks/${entry.id}/stop`, {});

// A further turn carries the writer's latest version of a lent document.
const seenText = [];
script = (_n, cwd) => {
  seenText.push(fs.readFileSync(path.join(cwd, ".ais6-documents", "Draft", "正文.md"), "utf8"));
  return {};
};
const fresh = await call("POST", "/api/agent/tasks", lentTask([lend("doc-r", "Draft")]));
const freshId = fresh.json.task.id;
await until(() => runDone(fresh.json.task.turns[0]), "the first turn of the refresh task finished");
const refreshedText = "{#¶1} First line, as the writer left it\n{#¶2} Second line\n";
const turnsBefore = (await turnsOf(freshId)).length;
const refreshRefusals = [
  ["a document the task was not lent", { objects: [{ id: "doc-nope", bundle: projection(refreshedText) }] }, 404, "task_object_unknown"],
  ["objects that are not a list", { objects: "doc-r" }, 400, "task_object_invalid"],
  ["the same document twice", { objects: [{ id: "doc-r", bundle: projection(refreshedText) }, { id: "doc-r", bundle: projection(refreshedText) }] }, 400, "task_object_invalid"],
  ["an entry without a bundle", { objects: [{ id: "doc-r" }] }, 400, "task_object_bundle_missing"],
  ["a bundle without manifest.json", { objects: [{ id: "doc-r", bundle: [bundleFile("正文.md", refreshedText)] }] }, 400, "task_object_manifest_missing"],
  ["a bundle whose bytes do not match their sha256", { objects: [{ id: "doc-r", bundle: [bundleFile("manifest.json", manifestText), { ...bundleFile("正文.md", refreshedText), sha256: "0".repeat(64) }] }] }, 400, "agent_cloud_bundle_hash_mismatch"],
  ["a path that leaves the document", { objects: [{ id: "doc-r", bundle: [bundleFile("manifest.json", manifestText), bundleFile("../escape.md", "x")] }] }, 400, "agent_cloud_bad_path"],
];
for (const [label, body, status, code] of refreshRefusals) {
  const refused = await call("POST", `/api/agent/tasks/${freshId}/turns`, { prompt: "Go on", ...body });
  test.assert(refused.status === status && refused.json?.code === code, `a turn with ${label} is refused ${status} ${code} (got ${refused.status} ${refused.json?.code})`);
}
test.assert((await turnsOf(freshId)).length === turnsBefore && await stateOf(freshId) === "delivered" && seenText.length === 1, "a refused turn changes nothing: no turn, no run, the task as it was");
const refreshedTurn = await call("POST", `/api/agent/tasks/${freshId}/turns`, { prompt: "Go on", objects: [{ id: "doc-r", bundle: projection(refreshedText) }] });
test.assert(refreshedTurn.status === 202, `a turn with a refreshed bundle is accepted (got ${refreshedTurn.status} ${refreshedTurn.json?.code})`);
await until(() => runDone(refreshedTurn.json.turn.id), "the refreshed turn finished");
test.assert(seenText.length === 2 && seenText[1] === refreshedText, "the engine found the writer's latest version of the document");
const reused = await call("POST", `/api/agent/tasks/${freshId}/turns`, { prompt: "And again" });
await until(() => runDone(reused.json.turn.id), "the turn without a bundle finished");
test.assert(seenText.length === 3 && seenText[2] === refreshedText, "a turn without a bundle reuses the last one, not the first");
const freshObjects = JSON.parse(fs.readFileSync(path.join(paths.tasksRoot(), freshId, "objects.json"), "utf8"));
test.assert(freshObjects.length === 1 && Buffer.from(freshObjects[0].files.find((file) => file.path === "正文.md").content, "base64").toString("utf8") === refreshedText && (fs.statSync(path.join(paths.tasksRoot(), freshId, "objects.json")).mode & 0o777) === 0o600,
  "the refreshed bundle is what the task keeps (0600)");
// Two documents: one refreshed, the other keeps its bundle; the byte cap is shared.
const pair = await call("POST", "/api/agent/tasks", lentTask([lend("p1", "Draft"), lend("p2", "Notes")]));
await until(() => runDone(pair.json.task.turns[0]), "the two-document turn finished");
const pairTurn = await call("POST", `/api/agent/tasks/${pair.json.task.id}/turns`, { prompt: "Go on", objects: [{ id: "p2", bundle: projection(refreshedText) }] });
await until(() => runDone(pairTurn.json.turn.id), "the one-refreshed turn finished");
test.assert(seenText[seenText.length - 1] === draftText && textsOf({ json: runs.runObjectFiles(pairTurn.json.turn.id, "p2") })["正文.md"] === refreshedText, "refreshing one document leaves the other as lent");
const pairBig = await call("POST", `/api/agent/tasks/${pair.json.task.id}/turns`, { prompt: "Too much", objects: [{ id: "p1", bundle: [bundleFile("manifest.json", manifestText), bundleFile("a.md", bigText)] }, { id: "p2", bundle: [bundleFile("manifest.json", manifestText), bundleFile("b.md", bigText)] }] });
test.assert(pairBig.status === 413 && pairBig.json.code === "agent_cloud_upload_too_large", `refreshed documents share the byte cap of create (got ${pairBig.status} ${pairBig.json?.code})`);
await call("POST", `/api/agent/tasks/${pair.json.task.id}/settle`, {});

// A documents-only task has no folder to put back into or stage a restore in.
script = () => ({ proposals: [restoreDoc, deliverDoc] });
const docOnly = await call("POST", "/api/agent/tasks", lentTask([lend("doc-o", "Draft")]));
const docOnlyRun = docOnly.json.task.turns[0];
await until(() => runDone(docOnlyRun), "the documents-only turn finished");
const noPutBack = await call("POST", `/api/agent/runs/${docOnlyRun}/putback`, { paths: "all" });
test.assert(noPutBack.status === 409 && noPutBack.json.code === "task_no_folder", `put-back on a documents-only run answers 409 task_no_folder (got ${noPutBack.status} ${noPutBack.json?.code})`);
const docOnlyProposals = runs.listProposalsRun(docOnlyRun).proposals;
const restoreId = docOnlyProposals.find((entry) => entry.kind === "restore").id;
const noRestore = await call("POST", `/api/agent/runs/${docOnlyRun}/proposals/${restoreId}/accept`, {});
test.assert(noRestore.status === 409 && noRestore.json.code === "task_no_folder" && runs.listProposalsRun(docOnlyRun).proposals.find((entry) => entry.id === restoreId).status === "pending",
  `accepting a restore on a documents-only run answers 409 task_no_folder and leaves it pending (got ${noRestore.status} ${noRestore.json?.code})`);
const deliverId = docOnlyProposals.find((entry) => entry.kind === "deliver").id;
test.assert((await call("POST", `/api/agent/runs/${docOnlyRun}/proposals/${deliverId}/accept`, {})).status === 200, "other proposals of a documents-only run still work");
const translationCode = (file) => /agent_error_task_no_folder:\s*"[^"]+"/.test(readRepo(file));
test.assert(translationCode("apps/desktop/app/data/translations-en.js") && translationCode("apps/desktop/app/data/translations-zh.js"), "task_no_folder has a line in both translation tables");

// Settle frees the slot and what the task kept; run records stay.
script = (_n, cwd) => ({ files: { "settle.md": "settle\n" } });
const settling = await call("POST", "/api/agent/tasks", lentTask([lend("doc-s", "Draft")]));
const settlingId = settling.json.task.id;
await until(() => runDone(settling.json.task.turns[0]), "the first settling turn finished");
const settlingTurn2 = await call("POST", `/api/agent/tasks/${settlingId}/turns`, { prompt: "Second" });
await until(() => runDone(settlingTurn2.json.turn.id), "the second settling turn finished");
const settlingDir = path.join(paths.tasksRoot(), settlingId);
test.assert(fs.existsSync(path.join(settlingDir, "snapshots", "turn-1")) && fs.existsSync(path.join(settlingDir, "snapshots", "turn-2")) && fs.existsSync(path.join(settlingDir, "objects.json")), "before settle the task keeps its snapshots and bundle");
hold = new Promise(() => {});
script = () => ({});
const busy1 = await call("POST", "/api/agent/tasks", gated(change(grants[0]), { planGate: false }));
const busy2 = await call("POST", "/api/agent/tasks", gated(change(grants[1]), { planGate: false }));
test.assert((await call("POST", "/api/agent/tasks", gated(change(grants[2])))).json?.code === "task_limit", "two live tasks hold both slots");
const settledBusy = await call("POST", `/api/agent/tasks/${busy1.json.task.id}/settle`, {});
test.assert(settledBusy.json.task.state === "settled" && (await call("POST", "/api/agent/tasks", gated(change(grants[2])))).status === 202, "settling a live task frees its slot");
await call("POST", `/api/agent/tasks/${busy2.json.task.id}/stop`, {});
hold = null;
await Promise.all(runs.listRuns().map((run) => runs.stopRun(run.runId).catch(() => {})));
const settleAnswer = await call("POST", `/api/agent/tasks/${settlingId}/settle`, {});
test.assert(settleAnswer.status === 200 && settleAnswer.json.task.state === "settled" && !fs.existsSync(path.join(settlingDir, "snapshots")) && !fs.existsSync(path.join(settlingDir, "objects.json")) && fs.existsSync(path.join(settlingDir, "task.json")),
  "settle discards the snapshots and objects.json and keeps task.json");
const settledTurns = await turnsOf(settlingId);
test.assert(settledTurns.length === 2 && settledTurns.every((turn) => turn.snapshot === null && turn.state === "done") && runs.getRun(settlingTurn2.json.turn.id).state === "done" && fs.existsSync(runs.getRun(settlingTurn2.json.turn.id).shadow.sealed),
  "the run records stay: both turns, their runs and their shadows");
const settledTurn = await call("POST", `/api/agent/tasks/${settlingId}/turns`, { prompt: "More" });
const settledRewind = await call("POST", `/api/agent/tasks/${settlingId}/rewind`, { toTurn: 1 });
test.assert(settledTurn.status === 409 && settledTurn.json.code === "task_not_active" && settledRewind.status === 409 && settledRewind.json.code === "task_not_active", `a settled task refuses turns and rewind with 409 task_not_active (got ${settledTurn.json?.code} ${settledRewind.json?.code})`);
test.assert((await call("POST", `/api/agent/tasks/${settlingId}/settle`, {})).json.task.state === "settled" && !fs.existsSync(path.join(settlingDir, "snapshots")), "settling twice is a no-op");

// A restart: the store is dropped and reloaded from disk.
script = (_n, cwd) => {
  seenText.push(fs.readFileSync(path.join(cwd, ".ais6-documents", "Draft", "正文.md"), "utf8"));
  return { files: { ".ais6-documents/Draft/正文.md": editedText(7), "made.md": "made\n" } };
};
const kept = await call("POST", "/api/agent/tasks", lentTask([lend("doc-k", "Draft")]));
const keptId = kept.json.task.id;
await until(() => runDone(kept.json.task.turns[0]), "the kept task's turn finished");
const keptTurn2 = await call("POST", `/api/agent/tasks/${keptId}/turns`, { prompt: "Second" });
await until(() => runDone(keptTurn2.json.turn.id), "the kept task's second turn finished");
hold = new Promise(() => {});
script = () => ({});
const inFlight = await call("POST", "/api/agent/tasks", gated(change(grants[1]), { planGate: false }));
await until(() => runs.getRun(inFlight.json.task.turns[0]).state === "running", "the in-flight turn is running");
hold = null;
script = () => ({ proposals: [planDoc] });
const unread = await call("POST", "/api/agent/tasks", gated(change(grants[0])));
await until(() => runDone(unread.json.task.turns[0]), "the unread plan turn finished");
// Nothing reads the tasks as a list from here to the restart: a read would settle the unread one's file.
test.assert(await stateOf(inFlight.json.task.id) === "working" && await stateOf(keptId) === "delivered" && await stateOf(settlingId) === "settled", "before the restart: one task is working, one delivered, one settled");
const unreadFile = JSON.parse(read(path.join(paths.tasksRoot(), unread.json.task.id, "task.json")));
test.assert(unreadFile.state === "planning", "the plan task's file still says planning: nobody read it after its run ended");

tasks.resetTasksForTests();
runs.resetRunsForTests();
runs.configureRunsForTests({ resolveKey: async () => "k-test", startEngine: scripted });

const reloaded = Object.fromEntries((await call("GET", "/api/agent/tasks")).json.tasks.map((entry) => [entry.id, entry]));
test.assert(reloaded[inFlight.json.task.id]?.state === "stopped" && runs.getRun(inFlight.json.task.turns[0]).state === "stopped", "after a restart a turn that was running reads as stopped (task and run)");
test.assert(reloaded[keptId]?.state === "delivered" && reloaded[settlingId]?.state === "settled" && reloaded[unread.json.task.id]?.state === "awaiting_plan", "finished and settled tasks come back as they were, and a plan turn nobody had read reads awaiting_plan");
test.assert(reloaded[keptId].turns.length === 2 && reloaded[keptId].mounts[0].kind === "object" && reloaded[keptId].usage.tokens === 0, "a reloaded task keeps its mounts and turns");
const afterRestart = (await call("GET", `/api/agent/tasks/${keptId}`)).json;
test.assert(afterRestart.turns[0].prompt === "Tighten the draft" && afterRestart.turns[1].prompt === "Second" && afterRestart.turns[1].state === "done" && fs.existsSync(afterRestart.turns[1].snapshot) && fs.existsSync(path.join(paths.tasksRoot(), keptId, "objects.json")),
  "snapshots and the lent bundle survive the restart");
test.assert(textsOf(await call("GET", afterUrl(keptId, "doc-k")))["正文.md"] === editedText(7), "projection-after reads a reloaded task's run");
const liveAfter = (await call("GET", "/api/agent/tasks")).json.tasks.filter((entry) => ["planning", "working"].includes(entry.state));
test.assert(liveAfter.length === 0, "a stopped turn holds no slot after the restart");
// Turns and rewind still work on a reloaded task.
const onAfterRestart = await call("POST", `/api/agent/tasks/${keptId}/turns`, { prompt: "Third, after the restart" });
await until(() => runDone(onAfterRestart.json.turn.id), "the turn after the restart finished");
test.assert(onAfterRestart.status === 202 && onAfterRestart.json.turn.n === 3 && seenText[seenText.length - 1] === draftText, "a reloaded task takes a further turn, starting from its kept bundle");
const rewoundAfter = await call("POST", `/api/agent/tasks/${keptId}/rewind`, { toTurn: 3 });
test.assert(rewoundAfter.status === 200 && rewoundAfter.json.rewound[0].turn === 3 && changedPaths(onAfterRestart.json.turn.id) === "", "rewind works from a snapshot that survived the restart");
test.assert((await call("POST", `/api/agent/tasks/${settlingId}/turns`, { prompt: "x" })).json.code === "task_not_active", "a reloaded settled task still refuses turns");

// --- 14. round 8: the documents folder, the shared cap, start vs stop/settle, restart -----

const reviewedOf = (id) => Object.fromEntries(runs.runChanges(id).changes.map((entry) => [entry.path, entry.sha256]));

// A real NFD "Café" folder and a lent "Café" (NFC): one entry on APFS, so the
// document goes under .ais6-documents/ and never into the real folder's.
const zetaDir = path.join(scratch, "Zeta");
const nfdName = "Cafe\u0301";
fs.mkdirSync(path.join(zetaDir, nfdName), { recursive: true });
fs.writeFileSync(path.join(zetaDir, nfdName, "own.md"), "own\n");
fs.writeFileSync(path.join(zetaDir, "note.md"), "Zeta\n");
const zeta = folders.grantFolder(zetaDir, "change");
const seenZeta = [];
script = (_n, cwd) => {
  seenZeta.push(fs.readdirSync(path.join(cwd, ".ais6-documents")).join());
  return { files: { "note.md": "Zeta, revised\n", ".ais6-documents/Caf\u00e9/正文.md": editedText(14) } };
};
const accented = await call("POST", "/api/agent/tasks", lentTask([change(zeta), lend("doc-nfd", "Caf\u00e9")]));
const accentedRun = accented.json.task.turns[0];
await until(() => runDone(accentedRun), "the accented-name turn finished");
const accentedDirs = runs.getRun(accentedRun).shadow.objects.map((entry) => entry.dir).join();
test.assert(accentedDirs === ".ais6-documents/Caf\u00e9" && seenZeta[0] === "Caf\u00e9", `a lent "Café" gets .ais6-documents/Café, apart from the real NFD "Café" folder (${accentedDirs})`);
test.assert(changedPaths(accentedRun) === "note.md", `the document's edit is not a change of the real folder (got ${changedPaths(accentedRun)})`);
runs.putBackRun(accentedRun, { paths: "all", reviewed: reviewedOf(accentedRun) });
test.assert(read(path.join(zetaDir, "note.md")) === "Zeta, revised\n" && fs.readdirSync(path.join(zetaDir, nfdName)).join() === "own.md" && fs.readdirSync(zetaDir).sort().join() === [nfdName, "note.md"].sort().join(),
  "put back all: nothing lands in the real Café folder, and the real folder gets no documents folder");
test.assert(textsOf(await call("GET", afterUrl(accented.json.task.id, "doc-nfd")))["正文.md"] === editedText(14), "projection-after reads the document's edit");

// A real top-level entry of the documents folder's name, in any case, is not
// in the engine's tree, is never a change, and put-back leaves it alone.
const etaDir = path.join(scratch, "Eta");
fs.mkdirSync(path.join(etaDir, ".AIS6-Documents"), { recursive: true });
fs.writeFileSync(path.join(etaDir, ".AIS6-Documents", "secret.md"), "real\n");
fs.writeFileSync(path.join(etaDir, "note.md"), "Eta\n");
const eta = folders.grantFolder(etaDir, "change");
const seenEta = [];
script = (_n, cwd) => {
  const top = fs.readdirSync(cwd).filter((name) => name.toLowerCase() === ".ais6-documents");
  seenEta.push(top.map((name) => `${name}:${fs.readdirSync(path.join(cwd, name)).sort().join("+")}`).join());
  fs.mkdirSync(path.join(cwd, ".ais6-documents"), { recursive: true });
  return { files: { "note.md": `Eta, revised ${seenEta.length}\n`, ".ais6-documents/planted.md": "planted\n" } };
};
for (const mounts of [[change(eta)], [change(eta), lend("doc-eta", "Draft")]]) {
  const answer = await call("POST", "/api/agent/tasks", lentTask(mounts));
  const id = answer.json.task.turns[0];
  await until(() => runDone(id), "the turn over a real .AIS6-Documents finished");
  test.assert(changedPaths(id) === "note.md", `nothing under the documents folder is a change (got ${changedPaths(id)})`);
  runs.putBackRun(id, { paths: "all", reviewed: reviewedOf(id) });
}
test.assert(seenEta[0] === "" && seenEta[1] === ".ais6-documents:Draft", `the real .AIS6-Documents is not in the engine's tree; with a document lent, the folder holds the documents only (${seenEta.join(" / ")})`);
test.assert(read(path.join(etaDir, "note.md")) === "Eta, revised 2\n" && fs.readdirSync(path.join(etaDir, ".AIS6-Documents")).join() === "secret.md" && read(path.join(etaDir, ".AIS6-Documents", "secret.md")) === "real\n"
  && fs.readdirSync(etaDir).sort().join() === ".AIS6-Documents,note.md", "put back all leaves the real .AIS6-Documents as it was and plants nothing beside it");

// Paths of one bundle that are one entry on APFS are refused before any shadow is made.
script = () => ({});
const beforeCase = { dirs: tasksOnDisk(), runs: runs.listRuns().length, shadows: fs.readdirSync(paths.shadowsRoot()).sort().join() };
for (const [label, files, code] of [
  ["two paths that differ only in case", [bundleFile("manifest.json", manifestText), bundleFile("A.md", "upper\n"), bundleFile("a.md", "lower\n")], "task_object_invalid"],
  ["a file and a folder that differ only in case", [bundleFile("manifest.json", manifestText), bundleFile("notes", "file\n"), bundleFile("NOTES/a.md", "inside\n")], "task_object_invalid"],
  ["two paths that differ only in Unicode normalization", [bundleFile("manifest.json", manifestText), bundleFile("Caf\u00e9.md", "nfc\n"), bundleFile("Cafe\u0301.md", "nfd\n")], "agent_cloud_bad_bundle"],
]) {
  const refused = await call("POST", "/api/agent/tasks", lentTask([lend("doc-case", "Draft", files)]));
  test.assert(refused.status === 400 && refused.json?.code === code, `a bundle with ${label} is refused 400 ${code} (got ${refused.status} ${refused.json?.code})`);
}
test.assert(tasksOnDisk() === beforeCase.dirs && runs.listRuns().length === beforeCase.runs && fs.readdirSync(paths.shadowsRoot()).sort().join() === beforeCase.shadows, "a refused bundle leaves no task, run or shadow behind");

// The 200-file cap is one for all of a task's documents, at create and on refresh.
const many = (count) => [bundleFile("manifest.json", manifestText), ...Array.from({ length: count - 1 }, (_, index) => bundleFile(`p${index}.md`, "x"))];
const tooMany = await call("POST", "/api/agent/tasks", lentTask([lend("m1", "One", many(150)), lend("m2", "Two", many(150))]));
test.assert(tooMany.status === 413 && tooMany.json?.code === "agent_cloud_too_many_files", `two documents of 150 files each are refused 413 agent_cloud_too_many_files (got ${tooMany.status} ${tooMany.json?.code})`);
const capTask = await call("POST", "/api/agent/tasks", lentTask([lend("m1", "One", many(150)), lend("m2", "Two")]));
await until(() => runDone(capTask.json.task.turns[0]), "the 152-file turn finished");
const capOver = await call("POST", `/api/agent/tasks/${capTask.json.task.id}/turns`, { prompt: "Go on", objects: [{ id: "m2", bundle: many(51) }] });
test.assert(capTask.status === 202 && capOver.status === 413 && capOver.json?.code === "agent_cloud_too_many_files" && (await turnsOf(capTask.json.task.id)).length === 1,
  `a refreshed document over what the kept one leaves of the cap is refused 413 agent_cloud_too_many_files (got ${capOver.status} ${capOver.json?.code})`);
const capFull = await call("POST", `/api/agent/tasks/${capTask.json.task.id}/turns`, { prompt: "Go on", objects: [{ id: "m2", bundle: many(50) }] });
test.assert(capFull.status === 202, `200 files over two documents fit the cap (got ${capFull.status} ${capFull.json?.code})`);
await until(() => runDone(capFull.json.turn.id), "the 200-file turn finished");

// A stop or settle sent while a turn starts (the Keychain read takes a while)
// waits for the start, then ends that turn's run.
const slowKey = (ms) => runs.configureRunsForTests({ resolveKey: () => new Promise((resolve) => setTimeout(() => resolve("k-test"), ms)) });
const listedNamed = (title) => tasks.listTasks().tasks.find((entry) => entry.title === title);
hold = new Promise(() => {});
slowKey(150);
const racingCreate = call("POST", "/api/agent/tasks", lentTask([lend("doc-race", "Draft")], { title: "Race: stop while turn 1 starts" }));
await until(() => Boolean(listedNamed("Race: stop while turn 1 starts")), "the starting task is listed");
const racingStop = await call("POST", `/api/agent/tasks/${listedNamed("Race: stop while turn 1 starts").id}/stop`, {});
const racedCreate = await racingCreate;
test.assert(racedCreate.status === 202 && racingStop.status === 200 && racingStop.json.task.state === "stopped" && runs.getRun(racedCreate.json.task.turns[0]).state === "stopped" && await stateOf(racedCreate.json.task.id) === "stopped",
  `a stop sent while turn 1 starts ends the run that start made (got ${racedCreate.status} ${racingStop.status} ${racingStop.json?.task?.state} ${runs.getRun(racedCreate.json.task.turns[0]).state})`);

hold = null;
runs.configureRunsForTests({ resolveKey: async () => "k-test" });
const settleRace = await call("POST", "/api/agent/tasks", lentTask([lend("doc-settle", "Draft")], { title: "Race: settle while a turn starts" }));
const settleRaceId = settleRace.json.task.id;
await until(() => runDone(settleRace.json.task.turns[0]), "the settle-race task's turn 1 finished");
hold = new Promise(() => {});
slowKey(150);
const racingTurn = call("POST", `/api/agent/tasks/${settleRaceId}/turns`, { prompt: "Second", objects: [{ id: "doc-settle", bundle: projection(refreshedText) }] });
await until(() => tasks.listTasks().tasks.find((entry) => entry.id === settleRaceId)?.state === "working", "the second turn is starting");
const racingSettle = await call("POST", `/api/agent/tasks/${settleRaceId}/settle`, {});
const racedTurn = await racingTurn;
const settleRaceDir = path.join(paths.tasksRoot(), settleRaceId);
test.assert(racedTurn.status === 202 && racingSettle.status === 200 && racingSettle.json.task.state === "settled" && runs.getRun(racedTurn.json.turn.id).state === "stopped",
  `a settle sent while a turn starts ends that turn's run (got ${racedTurn.status} ${racingSettle.status} ${runs.getRun(racedTurn.json.turn.id).state})`);
test.assert(!fs.existsSync(path.join(settleRaceDir, "snapshots")) && !fs.existsSync(path.join(settleRaceDir, "objects.json")) && JSON.parse(read(path.join(settleRaceDir, "task.json"))).state === "settled",
  "and frees what the task kept, the new turn's snapshot and refreshed bundle included");
hold = null;
runs.configureRunsForTests({ resolveKey: async () => "k-test" });

// A restart interrupts turn 2: the task reads stopped and takes a further turn;
// a rewind across the interrupted turn is refused before anything is restored.
const thetaDir = path.join(scratch, "Theta");
fs.mkdirSync(thetaDir, { recursive: true });
fs.writeFileSync(path.join(thetaDir, "note.md"), "Theta\n");
const theta = folders.grantFolder(thetaDir, "change");
script = () => ({ files: { "one.md": "one\n" }, proposals: [flagDoc("one")] });
const cut = await call("POST", "/api/agent/tasks", gated(change(theta), { planGate: false }));
const cutId = cut.json.task.id;
const cut1 = cut.json.task.turns[0];
await until(() => runDone(cut1), "the interrupted task's turn 1 finished");
hold = new Promise(() => {});
script = () => ({ files: { "two.md": "two\n" } });
const cut2 = await call("POST", `/api/agent/tasks/${cutId}/turns`, { prompt: "Second, cut short" });
await until(() => runs.getRun(cut2.json.turn.id).state === "running", "the turn to be interrupted is running");
tasks.resetTasksForTests();
runs.resetRunsForTests();
runs.configureRunsForTests({ resolveKey: async () => "k-test", startEngine: scripted });
hold = null;
test.assert(await stateOf(cutId) === "stopped" && runs.getRun(cut2.json.turn.id).state === "stopped", "after the restart the interrupted task and its turn read stopped");
const cutRewind = await call("POST", `/api/agent/tasks/${cutId}/rewind`, { toTurn: 1 });
const cutTurns = await turnsOf(cutId);
test.assert(cutRewind.status === 409 && cutRewind.json?.code === "run_active" && changedPaths(cut1) === "one.md" && statusesOf(cutTurns[0]) === "flag:pending" && cutTurns.every((turn) => !turn.rewound),
  `a rewind across the interrupted turn is refused 409 run_active with nothing restored (got ${cutRewind.status} ${cutRewind.json?.code}; turn 1: ${changedPaths(cut1)} ${statusesOf(cutTurns[0])})`);
script = () => ({ files: { "three.md": "three\n" } });
const cut3 = await call("POST", `/api/agent/tasks/${cutId}/turns`, { prompt: "Third, after the restart" });
test.assert(cut3.status === 202 && cut3.json.turn.n === 3, `a task a restart stopped takes a further turn (got ${cut3.status} ${cut3.json?.code})`);
await until(() => runDone(cut3.json.turn.id), "the turn after the interruption finished");
const cutBack3 = await call("POST", `/api/agent/tasks/${cutId}/rewind`, { toTurn: 3 });
test.assert(await stateOf(cutId) === "delivered" && cutBack3.status === 200 && changedPaths(cut3.json.turn.id) === "", `a rewind of the turn after the interrupted one still works (got ${cutBack3.status} ${cutBack3.json?.code})`);
const cutDiscard = await call("POST", `/api/agent/runs/${cut2.json.turn.id}/discard`, {});
const cutBack1 = await call("POST", `/api/agent/tasks/${cutId}/rewind`, { toTurn: 1 });
test.assert(cutDiscard.status === 200 && cutBack1.status === 200 && cutBack1.json.rewound.map((entry) => entry.turn).join() === "1" && changedPaths(cut1) === "",
  `once the interrupted turn's run is discarded, a rewind goes ahead without it (got ${cutBack1.status} ${JSON.stringify(cutBack1.json?.rewound)})`);

await Promise.all(runs.listRuns().map((run) => runs.stopRun(run.runId).catch(() => {})));
tasks.resetTasksForTests();
runs.resetRunsForTests();
fs.rmSync(scratch, { recursive: true, force: true });
test.finish();
