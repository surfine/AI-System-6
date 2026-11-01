// ClioCode permission modes (M9.1) — executable contract.
//
//   1. table     every cell of the mode table in docs/CLIOCODE-DESIGN.md
//                (8 tool-call kinds × 5 modes), written out here independently
//                of permission-modes.js, and the Bypass-isolation guard;
//   2. handler   cliocode/permissions.js answers dsh's requestPermission by
//                that table: classification (a path outside the folder, a
//                fetch by the egress allowlist, an unknown tool), allow_once
//                and never allow_always, ask through the writer, reject when
//                nobody can be asked, session allows narrowed to kind + target
//                and never for a delete or an outside-sandbox command;
//   3. ClioTalk  the ClioTalk engine still rejects every request (approval
//                policy never) and its runs bring no ClioCode handler.

import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { codeOnly, createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("cliocode-permissions");

const { ACTIONS, MODES, decidePermission } = require("../../apps/server/server/cliocode/permission-modes.js");
const { classifyToolCall, createCodePermissionHandler } = require("../../apps/server/server/cliocode/permissions.js");
const { codeHostAllowed } = require("../../apps/server/server/cliocode/egress.js");
const engineHost = require("../../apps/server/server/agent/engine-host.js");

// --- 1. The table ------------------------------------------------------------

// EXPECTED[action] = [manual, acceptEdits, plan, auto, bypass (isolated)].
const COLS = ["manual", "acceptEdits", "plan", "auto", "bypass"];
const EXPECTED = {
  read: ["allow", "allow", "allow", "allow", "allow"],
  edit: ["ask", "allow", "deny", "allow", "allow"],
  delete: ["ask", "ask", "deny", "ask", "allow"],
  runSandboxed: ["ask", "ask", "deny", "allow", "allow"],
  runExternal: ["ask", "ask", "deny", "ask", "allow"],
  netAllowed: ["allow", "allow", "allow", "allow", "allow"],
  netBlocked: ["deny", "deny", "deny", "deny", "allow"],
  outsideProject: ["deny", "deny", "deny", "deny", "allow"],
};

test.assert([...ACTIONS].sort().join() === Object.keys(EXPECTED).sort().join() && [...MODES].sort().join() === [...COLS].sort().join(),
  "the module has exactly the documented eight tool-call kinds and five modes");
for (const action of Object.keys(EXPECTED)) {
  COLS.forEach((mode, index) => {
    const { decision } = decidePermission(action, mode, mode === "bypass" ? { isolated: true } : {});
    test.assert(decision === EXPECTED[action][index], `${action} / ${mode} is ${EXPECTED[action][index]} (got ${decision})`);
  });
}
test.assert(ACTIONS.every((action) => {
  const off = decidePermission(action, "bypass");
  const offFalse = decidePermission(action, "bypass", { isolated: false });
  const offTruthy = decidePermission(action, "bypass", { isolated: "yes" });
  return [off, offFalse, offTruthy].every((v) => v.decision === "deny" && v.reason === "bypass_requires_isolation");
}), "Bypass is refused for every action unless isolated is exactly true (the writer's real Mac never is)");
test.assert(["manual", "acceptEdits", "plan", "auto"].every((mode) => decidePermission("netBlocked", mode).reason === "host_not_allowlisted"
  && decidePermission("outsideProject", mode).reason === "outside_project_boundary"
  && decidePermission("netAllowed", mode).reason === "host_allowlisted"),
"the network and outside-project rows are mode-independent and say which layer owns them");
test.assert(["edit", "delete", "runSandboxed", "runExternal"].every((action) => decidePermission(action, "plan").reason === "plan_read_only")
  && decidePermission("runExternal", "auto").reason === "outside_sandbox_each_time" && decidePermission("delete", "auto").reason === "destructive_confirm",
"Plan refuses every change; outside-sandbox commands and deletes ask even in Auto");
let unknownThrows = 0;
for (const [action, mode] of [["teleport", "manual"], ["edit", "yolo"], ["edit", ""]]) {
  try { decidePermission(action, mode); } catch { unknownThrows += 1; }
}
test.assert(unknownThrows === 3, "an unknown kind or mode throws rather than defaulting");

// --- 2. The handler ----------------------------------------------------------

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ais6-cliocode-perm-")));
const project = path.join(scratch, "repo");
const outside = path.join(scratch, "elsewhere");
fs.mkdirSync(path.join(project, "src"), { recursive: true });
fs.mkdirSync(outside, { recursive: true });
fs.writeFileSync(path.join(project, "src", "a.js"), "export {};\n");
fs.symlinkSync(outside, path.join(project, "linked-out"));

const OPTIONS = [
  { optionId: "always", name: "Always", kind: "allow_always" },
  { optionId: "once", name: "Once", kind: "allow_once" },
  { optionId: "no", name: "No", kind: "reject_once" },
  { optionId: "never", name: "Never", kind: "reject_always" },
];
let seq = 0;
/** dsh's shape: kind "other", the tool name as the title, rawInput.file_path. */
const call = (title, rawInput = {}, extra = {}) => ({ sessionId: "s", options: OPTIONS, toolCall: { toolCallId: `t${(seq += 1)}`, kind: "other", title, rawInput, ...extra } });
const chosen = (answer) => answer?.outcome?.outcome === "selected" ? answer.outcome.optionId : answer?.outcome?.outcome;
const ctx = { project, home: path.join(scratch, "home"), allowHost: (host) => codeHostAllowed(host) };

const kinds = {
  read: classifyToolCall(call("read", { file_path: "src/a.js" }).toolCall, ctx).action,
  grep: classifyToolCall(call("grep", { pattern: "x", path: "src" }).toolCall, ctx).action,
  edit: classifyToolCall(call("edit", { file_path: "src/a.js", old_string: "a", new_string: "b" }).toolCall, ctx).action,
  write: classifyToolCall(call("write", { file_path: "src/new.js", content: "x" }).toolCall, ctx).action,
  acpEdit: classifyToolCall({ kind: "edit", title: "Edit a.js", locations: [{ path: path.join(project, "src", "a.js") }] }, ctx).action,
  del: classifyToolCall({ kind: "delete", title: "Delete", locations: [{ path: path.join(project, "src", "a.js") }] }, ctx).action,
  bash: classifyToolCall(call("bash", { command: "npm test" }).toolCall, ctx).action,
  external: classifyToolCall(call("bash", { command: "npm i -g x", dangerouslyDisableSandbox: true }).toolCall, ctx).action,
  escalated: classifyToolCall({ kind: "execute", title: "Run", rawInput: { command: ["brew", "install", "x"], sandbox_permissions: "require_escalated" } }, ctx).action,
  fetchOk: classifyToolCall(call("web_fetch", { url: "https://registry.npmjs.org/left-pad" }).toolCall, ctx).action,
  fetchBad: classifyToolCall(call("web_fetch", { url: "https://example.com/" }).toolCall, ctx).action,
  fetchJunk: classifyToolCall(call("web_fetch", { url: "not a url" }).toolCall, ctx).action,
  dotdot: classifyToolCall(call("write", { file_path: "../outside-written.txt", content: "x" }).toolCall, ctx).action,
  tilde: classifyToolCall(call("read", { file_path: "~/.ssh/config" }).toolCall, ctx).action,
  absolute: classifyToolCall(call("read", { file_path: "/etc/hosts" }).toolCall, ctx).action,
  link: classifyToolCall(call("write", { file_path: "linked-out/new.txt", content: "x" }).toolCall, ctx).action,
  cwd: classifyToolCall(call("bash", { command: "ls", cwd: outside }).toolCall, ctx).action,
  unknown: classifyToolCall(call("frobnicate", { anything: 1 }).toolCall, ctx).action,
};
test.assert(kinds.read === "read" && kinds.grep === "read" && kinds.edit === "edit" && kinds.write === "edit" && kinds.acpEdit === "edit" && kinds.del === "delete",
  "dsh tool names (kind other, name as title) and ACP kinds classify as read, edit and delete");
test.assert(kinds.bash === "runSandboxed" && kinds.external === "runExternal" && kinds.escalated === "runExternal",
  "a command is sandboxed unless it asks to run outside the sandbox, which only moves it to the each-time row");
test.assert(kinds.fetchOk === "netAllowed" && kinds.fetchBad === "netBlocked" && kinds.fetchJunk === "netBlocked",
  "a fetch is netAllowed only for a host on the ClioCode allowlist; another host or no parsable URL is netBlocked");
test.assert(["dotdot", "tilde", "absolute", "link", "cwd"].every((name) => kinds[name] === "outsideProject"),
  "a path outside the folder (../, ~, absolute, through a link out, a command's cwd) makes any call outsideProject");
test.assert(kinds.unknown === "delete", "a tool the handler does not know is treated like a delete (asks, never auto-runs; refused in Plan)");

/** A handler with a recorded ask. */
function handler(mode, extra = {}) {
  const asked = [];
  const records = [];
  const answers = [...(extra.answers || [])];
  const fn = createCodePermissionHandler({
    project,
    home: ctx.home,
    mode,
    isolated: extra.isolated,
    allowHost: ctx.allowHost,
    ask: extra.noAsk ? undefined : async (request) => { asked.push(request); return answers.length ? answers.shift() : "deny"; },
    runExternal: extra.runExternal,
    onDecision: (record) => records.push(record),
  });
  return { fn, asked, records };
}

{
  const manual = handler("manual", { answers: ["allow"] });
  test.assert(chosen(await manual.fn(call("read", { file_path: "src/a.js" }))) === "once" && manual.asked.length === 0,
    "Manual: a read in the folder is answered allow_once without asking");
  const editAnswer = await manual.fn(call("edit", { file_path: "src/a.js" }));
  test.assert(chosen(editAnswer) === "once" && manual.asked.length === 1 && manual.asked[0].kind === "edit" && manual.asked[0].paths[0] === path.join(project, "src", "a.js") && manual.asked[0].sessionAllowed === true,
    "Manual: an edit asks the writer (kind, resolved path, session allow offered) and the writer's allow becomes allow_once");
  const denied = await manual.fn(call("bash", { command: "npm test" }));
  test.assert(chosen(denied) === "no" && manual.asked.length === 2 && manual.asked[1].command === "npm test", "Manual: a command asks, and the writer's no is reject_once");
  test.assert(chosen(await manual.fn(call("read", { file_path: "~/.ssh/config" }))) === "no" && manual.asked.length === 2, "Manual: an outside-folder read is refused without asking");
}

{
  const accept = handler("acceptEdits");
  test.assert(chosen(await accept.fn(call("write", { file_path: "src/new.js" }))) === "once" && accept.asked.length === 0, "Accept edits: an edit auto-runs");
  await accept.fn(call("bash", { command: "npm test" }));
  test.assert(accept.asked.length === 1 && accept.asked[0].kind === "runSandboxed", "Accept edits: a command still asks");
}

{
  const plan = handler("plan", { answers: ["allow", "allow", "allow", "allow"] });
  const answers = [];
  for (const request of [call("edit", { file_path: "src/a.js" }), call("bash", { command: "npm test" }), call("bash", { command: "x", outsideSandbox: true }), { sessionId: "s", options: OPTIONS, toolCall: { toolCallId: "d", kind: "delete", locations: [{ path: "src/a.js" }] } }]) {
    answers.push(chosen(await plan.fn(request)));
  }
  test.assert(answers.every((answer) => answer === "no") && plan.asked.length === 0, "Plan: edits, commands and deletes are refused, never prompted (no way to approve a change from Plan)");
  test.assert(chosen(await plan.fn(call("web_fetch", { url: "https://github.com/x/y" }))) === "once", "Plan: an allowlisted fetch stays open for research");
}

{
  const auto = handler("auto", { answers: ["allow", "allow"] });
  test.assert(chosen(await auto.fn(call("bash", { command: "npm test" }))) === "once" && chosen(await auto.fn(call("edit", { file_path: "src/a.js" }))) === "once" && auto.asked.length === 0,
    "Auto: sandboxed commands and edits auto-run");
  await auto.fn({ sessionId: "s", options: OPTIONS, toolCall: { toolCallId: "d1", kind: "delete", locations: [{ path: "src/a.js" }] } });
  await auto.fn(call("bash", { command: "npm i -g x", dangerouslyDisableSandbox: true }));
  test.assert(auto.asked.map((request) => `${request.kind}:${request.sessionAllowed}`).join() === "delete:false,runExternal:false", "Auto: a delete and an outside-sandbox command still ask, with no session allow offered");
  test.assert(chosen(await auto.fn(call("web_fetch", { url: "https://example.com/" }))) === "no" && chosen(await auto.fn(call("write", { file_path: "../x" }))) === "no" && auto.asked.length === 2,
    "Auto: a blocked host and an outside-folder write are refused without asking");
}

{
  const realMac = handler("bypass", { answers: ["allow"] });
  const answers = [];
  for (const request of [call("read", { file_path: "src/a.js" }), call("edit", { file_path: "src/a.js" }), call("bash", { command: "npm test" }), call("web_fetch", { url: "https://registry.npmjs.org/" })]) {
    answers.push(chosen(await realMac.fn(request)));
  }
  test.assert(answers.every((answer) => answer === "no") && realMac.asked.length === 0 && realMac.records.every((record) => record.reason === "bypass_requires_isolation"),
    "Bypass on a non-isolated run refuses every call, reads included, and never asks (the Bypass-isolation guard)");
  const isolatedRuns = [];
  const isolated = handler("bypass", { isolated: true, runExternal: (request) => { isolatedRuns.push(request.command); } });
  test.assert(chosen(await isolated.fn(call("write", { file_path: "../x" }))) === "once" && chosen(await isolated.fn(call("bash", { command: "x", outsideSandbox: true }))) === "once"
    && isolated.asked.length === 0 && isolatedRuns.join(",") === "x",
    "Bypass in an isolated environment auto-runs everything, outside paths and commands included (the command through the host's runner, still without a prompt)");
}

{
  const session = handler("manual", { answers: ["allow_session", "allow_session"] });
  await session.fn(call("edit", { file_path: "src/a.js" }));
  const again = await session.fn(call("edit", { file_path: "src/b.js" }));
  await session.fn(call("edit", { file_path: "src/b.js" }));
  test.assert(chosen(again) === "once" && session.asked.length === 2 && session.asked[1].paths[0] === path.join(project, "src", "b.js"),
    "a session allow covers the same kind and target again without asking, and nothing else (another file asks)");
  const externalRuns = [];
  const external = handler("manual", { answers: ["allow_session", "deny"], runExternal: (request) => { externalRuns.push(request.command); } });
  const request = () => call("bash", { command: "brew install x", outsideSandbox: true });
  test.assert(chosen(await external.fn(request())) === "once" && chosen(await external.fn(request())) === "no" && external.asked.length === 2
    && externalRuns.length === 1,
    "an outside-sandbox command asks every time: a session answer counts for that one call only, and that one approval ran it once through the host's runner");
  const del = handler("auto", { answers: ["allow_session", "deny"] });
  const delRequest = () => ({ sessionId: "s", options: OPTIONS, toolCall: { toolCallId: "d", kind: "delete", locations: [{ path: "src/a.js" }] } });
  await del.fn(delRequest());
  test.assert(chosen(await del.fn(delRequest())) === "no" && del.asked.length === 2, "a delete is confirmed one at a time: no session allow");
  let mode = "auto";
  const switching = createCodePermissionHandler({ project, mode: () => mode, ask: async () => "deny" });
  const before = chosen(await switching(call("edit", { file_path: "src/a.js" })));
  mode = "plan";
  const after = chosen(await switching(call("edit", { file_path: "src/a.js" })));
  test.assert(before === "once" && after === "no", "the mode is read on every call: a switch to Plan refuses the next edit");
}

{
  // M9.5: the host runner is the only way an outside-sandbox command executes.
  const ran = [];
  const runner = handler("manual", { answers: ["allow"], runExternal: (request) => { ran.push({ command: request.command, cwd: request.cwd }); } });
  const approved = await runner.fn(call("bash", { command: "brew install x", cwd: ".", outsideSandbox: true }));
  test.assert(chosen(approved) === "once" && ran.length === 1 && ran[0].command === "brew install x" && ran[0].cwd === project,
    "an approved outside-sandbox command reaches the host's runner exactly, with the command and its resolved cwd");
  const noRunner = handler("manual", { answers: ["allow"] });
  const refused = await noRunner.fn(call("bash", { command: "brew install x", outsideSandbox: true }));
  test.assert(chosen(refused) === "no" && noRunner.records[0].reason === "external_refused",
    "an approved outside-sandbox command with no host runner is refused, not dropped");
  const failing = handler("manual", { answers: ["allow"], runExternal: () => { throw new Error("spawn refused"); } });
  const failed = await failing.fn(call("bash", { command: "brew install x", outsideSandbox: true }));
  test.assert(chosen(failed) === "no" && failing.records[0].reason === "external_failed",
    "a host runner that throws refuses the call: fail closed");
  const denied = handler("manual", { answers: ["deny"], runExternal: (request) => { ran.push(request.command); } });
  await denied.fn(call("bash", { command: "brew install x", outsideSandbox: true }));
  test.assert(ran.length === 1 && denied.records[0].decision === "deny" && denied.records[0].reason === "writer_deny",
    "a denied outside-sandbox command never reaches the runner");
}

{
  const nobody = handler("manual", { noAsk: true });
  test.assert(chosen(await nobody.fn(call("edit", { file_path: "src/a.js" }))) === "no" && nobody.records[0].reason === "no_one_to_ask", "an ask with nobody to ask is a reject");
  const odd = handler("manual", { answers: ["sure", "allow_always"] });
  test.assert(chosen(await odd.fn(call("edit", { file_path: "src/a.js" }))) === "no" && chosen(await odd.fn(call("edit", { file_path: "src/a.js" }))) === "no", "an answer that is not allow, allow_session or deny is a reject");
  const throwing = createCodePermissionHandler({ project, mode: "manual", ask: async () => { throw new Error("window closed"); } });
  test.assert(chosen(await throwing(call("edit", { file_path: "src/a.js" }))) === "no", "an ask that throws is a reject");
  const badMode = createCodePermissionHandler({ project, mode: "yolo", ask: async () => "allow" });
  test.assert(chosen(await badMode(call("read", { file_path: "src/a.js" }))) === "no", "an unknown mode is a reject, even for a read");
  const onlyAlways = createCodePermissionHandler({ project, mode: "auto" });
  const alwaysOnly = await onlyAlways({ sessionId: "s", options: [{ optionId: "always", kind: "allow_always" }, { optionId: "never", kind: "reject_always" }], toolCall: { toolCallId: "x", kind: "other", title: "edit", rawInput: { file_path: "src/a.js" } } });
  const noOptions = await onlyAlways({ sessionId: "s", toolCall: { toolCallId: "y", kind: "other", title: "edit", rawInput: { file_path: "src/a.js" } } });
  test.assert(chosen(alwaysOnly) === "never" && chosen(noOptions) === "cancelled",
    "allow_always is never selected (dsh would stop asking and a mode switch could not take it back): with no allow_once the answer is reject, with no options cancelled");
  let relative = "";
  try { createCodePermissionHandler({ project: "repo", mode: "manual" }); } catch (error) { relative = error.message; }
  test.assert(/absolute/.test(relative), "a handler needs an absolute project folder");
}

// --- 3. ClioTalk keeps its reject path ---------------------------------------

test.assert(chosen(engineHost.rejectPermission({ options: OPTIONS })) === "no" && chosen(engineHost.rejectPermission({ options: [{ optionId: "never", kind: "reject_always" }, { optionId: "once", kind: "allow_once" }] })) === "never"
  && chosen(engineHost.rejectPermission({ options: [{ optionId: "once", kind: "allow_once" }] })) === "cancelled" && chosen(engineHost.rejectPermission({})) === "cancelled",
"the ClioTalk engine answers every permission request with a reject option, or cancelled when none is offered");
const hostCode = codeOnly(read("apps/server/server/agent/engine-host.js"));
test.assert(/if \(!options\.permissionHandler\) return rejectPermission\(params\);/.test(hostCode)
  && /return await options\.permissionHandler\(params\);\s*\} catch \{\s*return rejectPermission\(params\);/.test(hostCode) && !/cliocode/i.test(hostCode),
  "engine-host uses a permission handler only when a run brings one, and rejects when that handler throws; otherwise rejectPermission (and engine-host itself loads no ClioCode module)");
for (const file of ["apps/server/server/agent/runs.js", "apps/server/server/agent-cloud/runs.js"]) {
  const source = codeOnly(read(file));
  test.assert(!/permissionHandler|cliocode/i.test(source) && /onPermission: \(params\) => emit\(run, "permission_rejected"/.test(source), `${file} brings no ClioCode handler and still reports permission_rejected`);
}
test.assert(/- id: approval\n  config:\n    policy: never/.test(read("apps/server/server/agent/patches/posture.yml")), "the ClioTalk posture keeps approval policy never");

fs.rmSync(scratch, { recursive: true, force: true });
test.finish();
