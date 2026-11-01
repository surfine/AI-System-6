// ClioCode page client (M9.6) — executable contract.
//
// Runs the shipped lazy module (app/features/code.js) in a VM against a
// fake agent.harness service and drives what decides what the writer's answers
// do to the real folder:
//
//   1. events -> view: tool calls, approval cards and the checkpoint ledger
//      fold out of the server's event vocabulary;
//   2. approvals: one answer per card (a second click posts nothing), the card
//      settles, a refused answer reopens it, and allow_session / deny reach the
//      server verbatim;
//   3. mode: sent to the run when one is active, kept for the start when not,
//      and Bypass is not a choice the client offers;
//   4. rewind: POST …/rewind {toCheckpoint: id} on the run, ledger trimmed;
//   5. start: the grant, mode and prompt in the body; folders go through
//      /api/agent/folders (a `change` grant) on the agent.harness service,
//      runs through same-origin fetch so the eager service table is untouched.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("cliocode-client");

const calls = [];
let refuse = null;
function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body, body: null };
}
async function transport(name, path, init = {}) {
    const input = { path };
    const call = { name, path: input.path, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null, headers: init.headers };
    calls.push(call);
    if (refuse && call.path.endsWith(refuse.suffix)) return respond({ error: refuse.error, code: refuse.code }, refuse.status);
    if (call.path === "/api/agent/folders") return respond({ folders: [{ id: "f1", name: "repo", available: true, level: "change" }, { id: "f2", name: "gone", available: false }] });
    if (call.path === "/api/agent/folders/choose") return respond({ cancelled: false, folder: { id: "f1", name: "repo" } });
    if (call.path === "/api/cliocode/runs") return respond({ runId: "code-1", state: "starting", mode: call.body.mode }, 202);
    if (call.path.endsWith("/events")) return respond({}, 200);
    if (call.path.endsWith("/checkpoints")) return respond({ checkpoints: [{ id: 1, action: "edit", title: "edit a.js", files: [{ path: "a.js", existed: true }] }] });
    return respond({ ok: true });
}
const service = { requestService: (name, input) => transport(name, input.path, input.init) };

function load() {
  const context = vm.createContext({
    console, TextDecoder, AbortController,
    fetch: (path, init) => transport("fetch", path, init),
    window: { AISystem6Capabilities: service, AISystem6AgentToken: "a".repeat(64) },
    location: { hash: "", pathname: "/", search: "" },
  });
  vm.runInContext(fs.readFileSync(path.join(root, "apps/desktop/app/features/code.js"), "utf8"), context, { filename: "cliocode.js" });
  return context.window.AISystem6ClioCode;
}

const cc = load();
test.assert(cc && typeof cc.answerPermission === "function" && typeof cc.rewind === "function", "the lazy module installs AISystem6ClioCode without touching the DOM at load");
test.assert(!cc.modes.includes("bypass") && cc.modes.join() === "manual,acceptEdits,plan,auto", "Bypass is never offered: the writer's Mac is not an isolated environment");

// 1. Events -> view
let view = cc.emptyView();
for (const event of [
  { seq: 1, type: "status", state: "running", mode: "manual", folderName: "repo" },
  { seq: 2, type: "tool_call", id: "t1", title: "edit_file", kind: "edit", status: "pending" },
  { seq: 3, type: "permission_request", toolCallId: "t1", action: "edit", title: "edit_file", paths: ["a.js"], sessionAllowed: true },
  { seq: 4, type: "permission_request", toolCallId: "t1", action: "edit", title: "edit_file", paths: ["a.js"], sessionAllowed: true },
  { seq: 5, type: "checkpoint", id: 1, toolCallId: "t1", action: "edit", files: [{ path: "a.js", existed: true, bytes: 3 }] },
  { seq: 6, type: "tool_update", id: "t1", status: "completed", output: "ok" },
]) view = cc.reduceEvent(view, event);
test.assert(view.state === "running" && view.folderName === "repo" && view.lastSeq === 6, "status events set the run state, folder and last seq");
test.assert(view.tools.length === 1 && view.tools[0].status === "completed" && view.tools[0].output === "ok", "a tool call and its update are one row of the work log");
test.assert(view.approvals.length === 1 && view.approvals[0].status === "pending" && view.approvals[0].paths[0] === "a.js", "a replayed permission_request does not make a second card");
test.assert(view.checkpoints.length === 1 && view.checkpoints[0].id === 1, "a checkpoint event joins the ledger");
const settled = cc.reduceEvent(view, { type: "permission", toolCallId: "t1", decision: "allow" });
test.assert(settled.approvals[0].status === "decided" && settled.approvals[0].decision === "allow", "the server's decision record settles a card (also one decided by the mode table)");
const trimmed = cc.reduceEvent(cc.reduceEvent(view, { type: "checkpoint", id: 2, files: [] }), { type: "rewind", toCheckpoint: 1 });
test.assert(trimmed.checkpoints.map((cp) => cp.id).join() === "1", "a rewind event trims the ledger forward of its checkpoint");
// 1b. Proposed changes and the plan, for the panel's diff and the plan card
let edits = cc.reduceEvent(cc.emptyView(), { type: "tool_call", id: "e1", title: "edit", kind: "edit", rawInput: { file_path: "a.js", old_string: "one\ntwo", new_string: "one\n2" } });
edits = cc.reduceEvent(edits, { type: "permission_request", toolCallId: "e1", action: "edit", paths: ["a.js"] });
edits = cc.reduceEvent(edits, { type: "tool_call", id: "p1", title: "apply_patch", kind: "edit", rawInput: { input: "*** Begin Patch\n*** Add File: b.js\n+x\n*** End Patch" } });
const changes = cc.proposedChanges(edits);
test.assert(changes.length === 2 && changes[0].path === "a.js" && changes[0].added === 1 && changes[0].removed === 1 && changes[0].status === "waiting", "an edit's own arguments become a file's diff, waiting while its card is open");
test.assert(changes[1].path === "b.js" && changes[1].lines.map((row) => row.kind).join() === "add", "a patch envelope names its files and lines");
test.assert(cc.reduceEvent(cc.emptyView(), { type: "plan", entries: [{ content: "read", status: "pending" }] }).plan[0].content === "read", "the engine's plan is kept for the plan card");
test.assert(cc.parseSse('id: 1\nevent: status\ndata: {"state":"running"}\n\nevent: do').events[0].state === "running", "SSE blocks parse into typed events and keep the unfinished tail");

// 5. Folders and start
await cc.refreshFolders();
test.assert(cc.state().folders.length === 1 && cc.state().folderId === "f1", "only available folders are offered and the first is selected");
await cc.grantFolder();
const choose = calls.find((call) => call.path === "/api/agent/folders/choose");
test.assert(choose.body.level === "change", "the grant for ClioCode is a change grant (the run edits in place)");
test.assert(choose.headers["X-AI-System6-Agent-Token"] === "a".repeat(64), "every request carries the per-boot token");

// 3. Mode before a run is kept; the start sends it
await cc.setMode("auto");
test.assert(!calls.some((call) => call.path.endsWith("/mode")), "a mode picked before a run is not posted anywhere");
let threw = false;
try { await cc.setMode("bypass"); } catch { threw = true; }
test.assert(threw, "the client refuses Bypass before it reaches the server");
cc.state().prompt = "fix the test";
await cc.start();
const startCall = calls.find((call) => call.path === "/api/cliocode/runs" && call.method === "POST");
test.assert(startCall.body.folderId === "f1" && startCall.body.prompt === "fix the test" && startCall.body.mode === "auto", "start sends the folder grant, prompt and mode");
test.assert(cc.state().view.runId === "code-1", "the run id from the start answer is the one every later call names");

// 3. Mode during a run is sent
await cc.setMode("plan");
const modeCall = calls.find((call) => call.path === "/api/cliocode/runs/code-1/mode");
test.assert(modeCall && modeCall.method === "POST" && modeCall.body.mode === "plan", "a mode switch during a run is POSTed to the run");

// 2. Approvals
cc.onEvent({ seq: 1, type: "status", state: "running" });
cc.onEvent({ seq: 2, type: "permission_request", toolCallId: "t9", action: "edit", title: "edit_file", paths: ["b.js"], sessionAllowed: true });
const before = calls.length;
const first = cc.answerPermission("t9", "allow_session");
const second = cc.answerPermission("t9", "allow_session");
await Promise.all([first, second]);
const posts = calls.slice(before).filter((call) => call.path.endsWith("/permission"));
test.assert(posts.length === 1, "two clicks on one card post one answer");
test.assert(posts[0].path === "/api/cliocode/runs/code-1/permission" && posts[0].body.toolCallId === "t9" && posts[0].body.decision === "allow_session", "the answer names the run, the tool call and the decision verbatim");
test.assert(cc.state().view.approvals.find((card) => card.toolCallId === "t9").status === "decided", "the card settles once the server accepts the answer");
test.assert(await cc.answerPermission("t9", "deny") === null && calls.slice(before).filter((call) => call.path.endsWith("/permission")).length === 1, "a settled card takes no further answer");

cc.onEvent({ seq: 3, type: "permission_request", toolCallId: "t10", action: "delete", title: "rm", paths: ["c.js"], sessionAllowed: false });
refuse = { suffix: "/permission", status: 500, error: "boom", code: "cliocode_error" };
let failed = false;
try { await cc.answerPermission("t10", "deny"); } catch { failed = true; }
refuse = null;
test.assert(failed && cc.state().view.approvals.find((card) => card.toolCallId === "t10").status === "pending", "a failed answer leaves the card open to answer again");
await cc.answerPermission("t10", "deny");
test.assert(calls.filter((call) => call.path.endsWith("/permission")).at(-1).body.decision === "deny", "reject goes to the server as deny");

// 4. Checkpoints and rewind
cc.onEvent({ seq: 4, type: "status", state: "done" });
await cc.refreshCheckpoints();
test.assert(cc.state().view.checkpoints[0].id === 1 && cc.state().view.checkpoints[0].files[0].path === "a.js", "the ledger is read from the run's checkpoints route");
await cc.rewind(1);
const rewindCall = calls.find((call) => call.path === "/api/cliocode/runs/code-1/rewind");
test.assert(rewindCall.method === "POST" && rewindCall.body.toCheckpoint === 1, "rewind POSTs {toCheckpoint: id} to the run's rewind route");
let badId = false;
try { await cc.rewind("x"); } catch { badId = true; }
test.assert(badId, "rewind refuses a missing checkpoint id before any request");

// 5b. The service boundary: folders through agent.harness, runs through the local route
test.assert(calls.filter((call) => call.path.startsWith("/api/agent/")).every((call) => call.name === "agent.harness"), "shared-folder calls go through the agent.harness service");
test.assert(calls.filter((call) => call.path.startsWith("/api/cliocode/")).every((call) => call.name === "fetch"), "run calls are same-origin fetches that keep the eager service table untouched");
test.assert(!read("app/core/service-providers.js").includes("cliocode"), "the eager service table does not know ClioCode (boot budget)");

// 6. Wiring
test.assertIncludes(read("app/core/config.js"), '["app/features/cliotalk-agent.js", "app/features/code.js"]', "the ClioTalk agent loader names the ClioCode client (one path, no loader of its own: boot budget)");
test.assertIncludes(read("app/features/cliotalk-agent.js"), "window.AISystem6ClioCode.open()", "the Chooser's shared-folders section opens ClioCode");

test.assertIncludes(read("app/features/code.js"), 'AISystem6RegisterApplicationMenuSet?.("clioCode"', "ClioCode registers its File and Edit menus lazily (no boot bytes)");
test.assertIncludes(read("app/features/cliotalk-shell.js"), "permission: (record) =>", "the window reuses the shell's own plan and permission cards");

test.finish();
