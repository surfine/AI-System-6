// Alarm Clock · Agent (M8 slice 2) — executable contract.
//
// Runs the shipped lazy module (app/features/alarm-clock-agent.js) in a VM
// against a stub server and drives the four things the writer relies on:
//
//   1. the form    a new schedule is the writer's own words, a time choice from
//                  a closed set, one granted folder; network is false unless
//                  ticked; the page never sends a level (the server's constant);
//   2. missed      a missed fire point is asked about once; answering either way
//                  writes it down; "run now" is the only thing that runs it;
//   3. triggers    a real manuscript save calls POST /:id/trigger for enabled
//                  archive schedules of that project only; a standing intent
//                  needs its project and refuses the startup trigger's company;
//   4. result      a finished unattended run is announced once with what came
//                  back.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("alarm-window");

const store = new Map();
const calls = [];
let schedules = [];
const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  t: (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key),
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
  document: { querySelector: () => null, querySelectorAll: () => [] },
  window: {
    AISystem6AgentToken: "a".repeat(64),
    AISystem6Capabilities: {
      async requestService(_name, { path: url, init }) {
        calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
        const json = url === "/api/agent/schedules" && init.method === "GET" ? { schedules }
          : url === "/api/agent/schedules" ? { schedule: { id: "sch-1", ...JSON.parse(init.body) } }
          : url === "/api/agent/runs" ? { runs: [] } : { run: { runId: "r1" } };
        return { ok: true, json: async () => json };
      },
    },
  },
});
vm.runInContext(fs.readFileSync(path.join(root, "apps/desktop/app/features/alarm-clock-agent.js"), "utf8"), context, { filename: "alarm-clock-agent.js" });
const agent = context.window.AISystem6AlarmClockAgent;
const { model } = agent;

// 1. the form
await agent.createSchedule({ prompt: "整理上周的访谈剪报", when: "mon-9", folderId: "fld-1", projectId: "p1" });
const posted = calls.find((c) => c.method === "POST" && c.url === "/api/agent/schedules").body;
test.assert(posted.prompt === "整理上周的访谈剪报" && posted.network === false && !("level" in posted)
  && posted.trigger.kind === "time" && posted.trigger.weekday === 1 && posted.folderIds.join() === "fld-1" && posted.standing === false && posted.projectId === "",
  "the form sends the writer's words, a closed-set time, one folder, network false and no level");
test.assert(model.WHEN_ORDER.length === 7 && model.scheduleBody({ when: "nonsense", prompt: "x" }).trigger.hour === 9, "the time choices are a closed set");

// 2. missed, asked once
const missed = [{ id: "sch-9", enabled: true, title: "整理", missedAt: "2026-10-26T01:00:00.000Z" }];
test.assert(model.missedQuestions(missed).length === 1, "a missed fire point makes one question");
calls.length = 0;
await agent.answerMissed(model.missedQuestions(missed)[0], false);
test.assert(model.missedQuestions(missed).length === 0 && !calls.some((c) => c.url.endsWith("/run")), "answering No writes it down, asks no more, runs nothing");
const second = [{ ...missed[0], id: "sch-10" }];
await agent.answerMissed(model.missedQuestions(second)[0], true);
test.assert(calls.some((c) => c.url === "/api/agent/schedules/sch-10/run" && c.method === "POST") && model.missedQuestions(second).length === 0, "answering Run Now runs it, once");

// 3. triggers and standing intents
schedules = [
  { id: "a", enabled: true, trigger: { kind: "archive" }, projectId: "p1" },
  { id: "b", enabled: true, trigger: { kind: "archive" }, projectId: "p2" },
  { id: "c", enabled: false, trigger: { kind: "archive" }, projectId: "p1" },
  { id: "d", enabled: true, trigger: { kind: "folder" }, projectId: "" },
];
calls.length = 0;
agent.state.debounceMs = 0;
agent.manuscriptSaved("p1");
await new Promise((resolve) => setTimeout(resolve, 30));
const triggered = calls.filter((c) => c.url.endsWith("/trigger"));
test.assert(triggered.length === 1 && triggered[0].url === "/api/agent/schedules/a/trigger" && triggered[0].body.projectId === "p1",
  "a manuscript save triggers only the enabled archive schedule of that project");
agent.stop();
const standing = model.scheduleBody({ prompt: "盯着数字", when: "archive", folderId: "f", standing: true, projectId: "p1" });
test.assert(standing.standing === true && standing.projectId === "p1", "a standing intent carries its one project");
test.assert(model.scheduleBody({ prompt: "x", when: "startup", folderId: "f", standing: true, projectId: "p1" }).standing === false, "startup is not a standing trigger");

// 4. the result
const runs = [
  { runId: "r1", unattended: true, state: "stopped", scheduleId: "a", pendingProposals: 8, prompt: "p" },
  { runId: "r2", unattended: true, state: "running", scheduleId: "a", pendingProposals: 0, prompt: "p" },
];
const named = [{ id: "a", title: "整理访谈" }];
const notices = model.finishedNotices(runs, named, new Set());
test.assert(notices.length === 1 && notices[0].text === "alarm_agent_done:整理访谈|8", "a finished run is announced with its title and proposal count; a working one is not");
test.assert(model.finishedNotices(runs, named, new Set(["r1"])).length === 0, "and only once");

test.finish();
