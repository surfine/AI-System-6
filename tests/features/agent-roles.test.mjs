// M8 roles slices 1-2: the main agent may hand a sub-task to a built-in role.
// The handoff is a proposal; the sub-turn is one more read-level turn of the task,
// with the role's brief and its tool limit (the kinds it may offer). The task's
// skills-and-memory context rides every turn. Driven through the real routes with
// a stub engine.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("agent-roles");
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ais6-agent-roles-")));
process.env.AI_SYSTEM6_AGENT_HOME = path.join(scratch, "agent-home");
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";

const folders = require("../../apps/server/server/agent/folders.js");
const proposals = require("../../apps/server/server/agent/proposals.js");
const runs = require("../../apps/server/server/agent/runs.js");
const { agentToken } = require("../../apps/server/server/agent/agent-token.js");
const router = require("../../apps/server/server/router.js");

// The channel: a handoff names a built-in role other than the main agent; one per run.
const channelWith = (files) => {
  const work = fs.mkdtempSync(path.join(scratch, "work-"));
  const channel = path.join(work, ".ais6-proposals");
  fs.mkdirSync(channel, { recursive: true });
  Object.entries(files).forEach(([name, doc]) => fs.writeFileSync(path.join(channel, name), JSON.stringify({ v: 1, title: "t", reason: "", createdAt: "2026-10-31T08:00:00.000Z", ...doc })));
  return { work, channel };
};
const hand = (payload) => ({ kind: "handoff", payload });
let c = channelWith({ "1.json": hand({ role: "researcher", task: "Find the 2019 figure", junk: 1 }), "2.json": hand({ role: "checker", task: "x" }), "3.json": hand({ role: "clio", task: "x" }), "4.json": hand({ role: "nobody", task: "x" }) });
let got = proposals.collectProposals(c.work, c.channel);
test.assert(got.gathered.length === 1 && got.gathered[0].payload.role === "researcher" && !("junk" in got.gathered[0].payload) && got.dropped === 3, "a handoff to a built-in role is kept (one per run); the main agent, an unknown role and a second handoff are dropped");
c = channelWith({ "1.json": hand({ role: "researcher", task: "x" }) });
test.assert(proposals.collectProposals(c.work, c.channel, { kinds: [...proposals.READ_KINDS] }).gathered.length === 0, "a read-level turn (the plan gate) cannot hand anything over");

// The task: context on every turn; a role turn is read level and offers only its kinds.
const dir = path.join(scratch, "Alpha");
fs.mkdirSync(dir);
fs.writeFileSync(path.join(dir, "note.md"), "Alpha\n");
const grant = folders.grantFolder(dir, "change");
const prompts = [];
const levels = [];
let offer = [];
runs.configureRunsForTests({
  resolveKey: async () => "k-test",
  startEngine: async (options) => {
    levels.push(options.readOnly ? "read" : "write");
    const cwd = fs.realpathSync(options.work);
    return {
      sessionId: "11111111-2222-3333-4444-555555555555",
      cwd,
      async prompt(text) {
        prompts.push(text);
        fs.mkdirSync(path.join(cwd, ".ais6-proposals"), { recursive: true });
        offer.forEach((doc, index) => fs.writeFileSync(path.join(cwd, ".ais6-proposals", `${index + 1}-${doc.kind}.json`), JSON.stringify({ v: 1, title: "t", reason: "", createdAt: new Date().toISOString(), ...doc })));
        return { stopReason: "end_turn" };
      },
      async cancel() {}, async close() {}, kill() {},
    };
  },
});
async function call(method, url, body) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []);
  Object.assign(req, { method, url, headers: { host: "127.0.0.1:4173", ...(payload ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) } : {}), "x-ai-system6-agent-token": agentToken }, socket: { remoteAddress: "127.0.0.1" } });
  const handler = router.resolveRoute(req);
  const out = { status: 0, text: "" };
  await handler(req, { destroyed: false, writableEnded: false, headersSent: false, writeHead(status) { out.status = status; }, end(text) { out.text = String(text || ""); this.writableEnded = true; } });
  return { status: out.status, json: out.text ? JSON.parse(out.text) : null };
}
async function until(check, label) {
  const limit = Date.now() + 3000;
  while (!check() && Date.now() < limit) await new Promise((resolve) => setTimeout(resolve, 5));
  test.assert(check(), label);
}
const CONTEXT = "[AI System 6] The writer's notes.\n[m1] (project) Quote verbatim";
const created = await call("POST", "/api/agent/tasks", { prompt: "Check the figures", mounts: [{ kind: "folder", id: grant.id, name: grant.name, level: "change" }], planGate: false, language: "en", deskContext: CONTEXT });
const taskId = created.json.task.id;
const firstRun = created.json.task.turns[0];
await until(() => ["done", "error"].includes(runs.getRun(firstRun).state) && prompts.length === 1, "turn 1 ran");
test.assert(prompts[0].includes("[m1] (project) Quote verbatim") && prompts[0].indexOf("[m1]") < prompts[0].indexOf("Check the figures"), "the task's context is in the engine's first words, ahead of the writer's prompt");

offer = [{ kind: "scrap", payload: { quoted: "Revenue was 4.1m", source: "report.pdf" } }, { kind: "skill", payload: { name: "x", whenToUse: "y", steps: [{ text: "z" }] } }, { kind: "plan", payload: { steps: [{ text: "s", touches: [] }] } }, { kind: "deliver", payload: { summary: "Found it" } }];
const sub = await call("POST", `/api/agent/tasks/${taskId}/turns`, { prompt: "Find the 2019 revenue figure", role: "researcher", deskContext: CONTEXT });
test.assert(sub.status === 202 && sub.json.turn.level === "read" && levels[levels.length - 1] === "read", "a role turn runs at read level although the task's folder is mounted for change");
await until(() => prompts.length === 2 && ["done", "error"].includes(runs.getRun(sub.json.turn.id).state), "the role turn ran");
test.assert(prompts[1].includes("[m1] (project) Quote verbatim") && prompts[1].includes("you are a role the main agent handed a sub-task to: Researcher") && prompts[1].includes("Offer only: scrap, deliver") && prompts[1].endsWith("Find the 2019 revenue figure"), "its first words are the context, the researcher's brief with its tool limit, then the sub-task");
const kept = (await call("GET", `/api/agent/runs/${sub.json.turn.id}/proposals`)).json.proposals.map((p) => p.kind).sort();
test.assert(kept.join() === "deliver,scrap", `only the role's kinds are kept: its scrap and the hand-back (got ${kept})`);
const main = await call("POST", `/api/agent/tasks/${taskId}/turns`, { prompt: "x", role: "clio" });
test.assert(main.status === 400 && main.json.code === "role_unknown", "the main agent is not a hand-off target (400 role_unknown)");

fs.rmSync(scratch, { recursive: true, force: true });
test.finish();
