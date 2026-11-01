// ClioCode in-place runs + checkpoints + rewind (M9.3) — executable contract.
//
// The engine is untrusted code driving a model over the writer's real code
// folder. This contract drives the server modules that keep that honest, with
// a stub engine that plays dsh: it calls the run's permission handler for each
// tool call and writes only what the handler allows (agent-harness's stub
// shape, plus the ACP ask):
//
//   1. in place   a run works directly over the granted folder — no shadow,
//                 no put-back — its engine on the code Seatbelt profile, its
//                 egress on the code filter, its state on the server's side;
//   2. asks       Manual mode asks through permission_request and the writer's
//                 answer route; a deny changes nothing; Accept edits auto-runs;
//                 a grant below change is forced into Plan mode; Bypass is
//                 refused;
//   3. ledger     an allowed edit checkpoints exactly the files it names
//                 (content + mode, or "did not exist"), capped in files and
//                 bytes; over a cap the call is refused;
//   4. rewind     restores exactly the checkpoint's files (a created file is
//                 removed, an edited file restored byte for byte with its
//                 mode), trims the ledger forward, refuses a path outside the
//                 project (.., absolute, through a link out), a damaged
//                 record, and a running engine;
//   5. guards     the per-boot token, loopback-only admission, the router's
//                 local-only wiring, restart recovery, discard.
// Kernel-dependent probes (the profile under sandbox-exec) stay in
// cliocode-sandbox: sandbox-exec cannot be applied inside a sandboxed shell,
// so the controller reruns that contract outside.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { codeOnly, createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("cliocode-runs");

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ais6-cliocode-runs-")));
process.env.AI_SYSTEM6_AGENT_HOME = path.join(scratch, "agent-home");
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";

const folders = require("../../apps/server/server/agent/folders.js");
const paths = require("../../apps/server/server/agent/paths.js");
const agentToken = require("../../apps/server/server/agent/agent-token.js");
const runs = require("../../apps/server/server/cliocode/runs.js");
const cliocodeRoutes = require("../../apps/server/server/routes/cliocode.js");
const router = require("../../apps/server/server/router.js");

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// --- The stub engine and the project -----------------------------------------

const project = path.join(scratch, "repo");
const outside = path.join(scratch, "elsewhere");
const fakeHome = path.join(scratch, "home");
for (const dir of [project, outside, fakeHome]) fs.mkdirSync(dir, { recursive: true });
const NOTES = "const answer = 42;\n";
write(path.join(project, "notes.md"), NOTES);
fs.symlinkSync(outside, path.join(project, "linked-out"));
const projectReal = fs.realpathSync(project);

/** dsh's requestPermission shape: options plus the tool call. */
const PERM_OPTIONS = [
  { optionId: "once", name: "Once", kind: "allow_once" },
  { optionId: "no", name: "No", kind: "reject_once" },
];
function outcomeKind(params, answer) {
  if (answer?.outcome?.outcome !== "selected") return answer?.outcome?.outcome || "";
  return params.options.find((option) => option.optionId === answer.outcome.optionId)?.kind || "";
}
/** A tool call the stub engine makes, and what the handler answered. */
function call(permissionHandler, toolCallId, rawInput, title = "edit") {
  const params = { sessionId: "s", options: PERM_OPTIONS, toolCall: { toolCallId, kind: "other", title, rawInput } };
  return { params, answer: () => outcomeKind(params, null) };
}

/**
 * A stub engine that plays dsh over the run's real cwd: each entry is
 * [toolCallId, title, rawInput, apply, wait?] — the handler is asked first,
 * and the write happens only for an allow_once answer (exactly what dsh does
 * with an accepted escalation). An entry with `wait` holds before its handler
 * call until the test releases it.
 */
function stubEngine(steps) {
  return async (options) => {
    stubCalls.push(options);
    const cwd = fs.realpathSync(options.work);
    return {
      sessionId: "33333333-4444-5555-6666-777777777777",
      cwd,
      async prompt() {
        for (const [toolCallId, title, rawInput, apply, wait] of steps) {
          if (wait) await wait();
          const params = { sessionId: "s", options: PERM_OPTIONS, toolCall: { toolCallId, kind: "other", title, rawInput } };
          const answer = await options.permissionHandler(params);
          if (outcomeKind(params, answer) === "allow_once") apply(cwd);
        }
        return { stopReason: "end_turn" };
      },
      async cancel() {},
      async close() { return { exited: true }; },
      kill() {},
    };
  };
}

const editNotes = (cwd) => fs.writeFileSync(path.join(cwd, "notes.md"), "const answer = 43;\n");
const createFile = (cwd) => write(path.join(cwd, "created.md"), "created\n");

/** @type {any[]} */
const stubCalls = [];
let egressStarted = 0;
let egressClosed = 0;

function configureStub(steps, extra = {}) {
  stubCalls.length = 0;
  egressStarted = 0;
  egressClosed = 0;
  runs.configureRunsForTests({
    resolveKey: async () => "k-test",
    startEgress: async () => {
      egressStarted += 1;
      return { port: 41000 + egressStarted, close: async () => { egressClosed += 1; } };
    },
    startEngine: stubEngine(steps),
    ...extra,
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

// --- 1. In place: the engine works on the real folder ------------------------

let refused = "";
try { await runs.createCodeRun({ folderId: "fld-none", prompt: "x" }); } catch (error) { refused = error.code; }
test.assert(refused === "folder_unknown", "a run needs a granted folder (the opaque id the Chooser minted)");

let bypass = "";
const grant = folders.grantFolder(project, "change");
try { await runs.createCodeRun({ folderId: grant.id, prompt: "x", mode: "bypass" }); } catch (error) { bypass = error.code; }
test.assert(bypass === "mode_refused", "Bypass is refused at start: the writer's real Mac is never an isolated environment");

configureStub([["t1", "edit", { file_path: "notes.md" }, editNotes], ["t2", "write", { file_path: "created.md" }, createFile]]);
const acceptRun = await runs.createCodeRun({ folderId: grant.id, prompt: "bump the constant", mode: "acceptEdits" });
test.assert(acceptRun.state === "starting" && acceptRun.folderPath === projectReal && acceptRun.mode === "acceptEdits",
  "a run starts over the granted folder, in place, in the asked mode");
test.assert(!paths.isInside(acceptRun.checkpoints !== undefined ? scratch : scratch, project) && acceptRun.runId.startsWith("code-"),
  "the run is identified by its own code- id");

const acceptState = await untilDone(acceptRun.runId);
test.assert(acceptState === "done", "the run finishes");
await new Promise((resolve) => setImmediate(resolve));
test.assert(egressStarted === 1 && egressClosed === 1, "the run started its own egress filter and closed it when it ended");

const seen = stubCalls[0];
const posture = path.join(import.meta.dirname, "..", "..", "apps", "server", "server", "cliocode", "patches", "posture.yml");
test.assert(seen.work === projectReal && fs.realpathSync(seen.tmp).startsWith(path.join(scratch, "agent-home")),
  "the engine's cwd is the real folder; its temp lives in the server's own state, never inside the project");
test.assert(typeof seen.permissionHandler === "function" && seen.posture === fs.realpathSync(posture) && fs.existsSync(seen.posture),
  "the engine brings the ClioCode permission handler and the ClioCode posture patch");
test.assert(seen.mcpServers.length === 0 && seen.egressPort > 0 && !seen.preamble.includes(".ais6-proposals"),
  "no MCP server, the egress filter's port as the only proxy, and a preamble without a proposal channel");
const profile = seen.sandboxProfile({
  home: fakeHome,
  work: projectReal,
  tmp: seen.tmp,
  dshHome: path.join(seen.tmp, "dsh-home"),
  node: process.execPath,
  install: path.join(scratch, "install"),
  patchFiles: [seen.posture],
  loopbackPorts: [41001],
  readOnly: false,
});
test.assert(profile.includes("(version 1)") && profile.includes(`(subpath "${projectReal}")`) && profile.includes("(deny network-outbound)")
  && profile.includes('localhost:41001') && !profile.includes(".ais6-proposals"),
  "the run's profile is the code profile: the project writable, all outbound closed but the filter's port");
test.assert(!fs.existsSync(path.join(paths.shadowsRoot(), acceptRun.runId)) && !fs.readdirSync(paths.agentHome()).includes("shadows")
  , "no shadow was made for an in-place run");

// --- 2. The ask: Manual mode, the writer's answer -----------------------------

/**
 * Answer every permission_request a run raises while it works, and resolve
 * when the run settles. Returns the asks in order.
 */
function answerAll(runId, decision) {
  /** @type {any[]} */
  const asks = [];
  runs.subscribe(runId, 0, (event) => {
    if (event.type === "permission_request") {
      asks.push(event.data);
      runs.answerPermission(runId, event.data.toolCallId, decision);
    }
  });
  return asks;
}

configureStub([["t1", "edit", { file_path: "notes.md" }, editNotes], ["t2", "write", { file_path: "created.md" }, createFile]]);
const manualRun = await runs.createCodeRun({ folderId: grant.id, prompt: "bump the constant" });
const asks = answerAll(manualRun.runId, "allow");
const manualState = await untilDone(manualRun.runId);
test.assert(manualState === "done" && asks.length === 2, `Manual: every edit asks (got ${asks.length} asks, state ${manualState})`);
test.assert(asks[0].kind === "edit" && asks[0].paths[0] === path.join(projectReal, "notes.md") && asks[0].sessionAllowed === true
  && asks[0].command === "" && typeof asks[0].toolCallId === "string",
  "Manual: the first edit emits permission_request with the kind, the resolved path and the session allow");
test.assert(fs.readFileSync(path.join(project, "notes.md"), "utf8") === "const answer = 43;\n" && fs.existsSync(path.join(project, "created.md")),
  "the allowed edits landed on the real file");
let again = "";
try { runs.answerPermission(manualRun.runId, asks[0].toolCallId, "allow"); } catch (error) { again = error.code; }
test.assert(again === "permission_unknown", "an ask already answered is refused");

// A deny changes nothing.
fs.writeFileSync(path.join(project, "notes.md"), "const answer = 43;\n");
fs.rmSync(path.join(project, "created.md"), { force: true });
configureStub([["t1", "edit", { file_path: "notes.md" }, editNotes]]);
const denyRun = await runs.createCodeRun({ folderId: grant.id, prompt: "bump the constant" });
const denyAsk = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("no permission_request arrived")), 3000);
  runs.subscribe(denyRun.runId, 0, (event) => {
    if (event.type === "permission_request") {
      clearTimeout(timer);
      resolve(event.data);
    }
  });
});
runs.answerPermission(denyRun.runId, denyAsk.toolCallId, "deny");
await untilDone(denyRun.runId);
test.assert(fs.readFileSync(path.join(project, "notes.md"), "utf8") === "const answer = 43;\n" && !fs.existsSync(path.join(project, "created.md")),
  "a denied edit leaves the file exactly as it was");

// --- 3. The ledger: only touched files, capped -------------------------------

// The acceptEdits run above made two checkpoints: one per allowed call.
{
  const ledger = runs.listCheckpoints(acceptRun.runId);
  test.assert(ledger.checkpoints.length === 2, "one checkpoint per allowed writing call");
  const [first, second] = ledger.checkpoints;
  test.assert(first.files.length === 1 && first.files[0].path === "notes.md" && first.files[0].existed === true && first.files[0].bytes === NOTES.length,
    "the edit's checkpoint carries exactly the one file it touched, with its size");
  test.assert(second.files.length === 1 && second.files[0].path === "created.md" && second.files[0].existed === false && second.files[0].bytes === 0,
    "the write's checkpoint records that the file did not exist");
  const firstDir = path.join(paths.agentHome(), "cliocode", "runs", acceptRun.runId, "checkpoints", String(first.id));
  const stored = [];
  const visit = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      else stored.push(`${prefix}${entry.name}`);
    }
  };
  visit(firstDir, "");
  test.assert(stored.join(",") === "notes.md" && fs.readFileSync(path.join(firstDir, "notes.md"), "utf8") === NOTES,
    "the checkpoint store holds only the touched file, byte for byte as it was");
  const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(firstDir), `${first.id}.json`), "utf8"));
  test.assert(manifest.files[0].mode === (fs.statSync(path.join(project, "notes.md")).mode & 0o777) && /^[a-f0-9]{64}$/.test(manifest.files[0].sha256),
    "the manifest records the file's mode and the digest of its bytes");
}

// Caps: over either cap the call is refused, not left unsnapshotted. The byte
// cap counts the bytes a snapshot would carry — an edit of an existing file.
configureStub(
  [["t1", "edit", { file_path: "notes.md" }, editNotes]],
  { checkpointCaps: { files: 64, bytes: 8 } },
);
const bigRun = await runs.createCodeRun({ folderId: grant.id, prompt: "edit big", mode: "acceptEdits" });
await untilDone(bigRun.runId);
test.assert(fs.readFileSync(path.join(project, "notes.md"), "utf8") === "const answer = 43;\n",
  "an edit whose snapshot would pass the byte cap is refused: the file never changes");
test.assert(runs.listCheckpoints(bigRun.runId).checkpoints.length === 0, "a refused call leaves no checkpoint");

configureStub(
  [["t1", "move", { old_path: "notes.md", new_path: "renamed.md" }, (cwd) => {
    fs.copyFileSync(path.join(cwd, "notes.md"), path.join(cwd, "renamed.md"));
    fs.unlinkSync(path.join(cwd, "notes.md"));
  }]],
  { checkpointCaps: { files: 1, bytes: 1024 * 1024 } },
);
const moveRun = await runs.createCodeRun({ folderId: grant.id, prompt: "rename", mode: "acceptEdits" });
await untilDone(moveRun.runId);
test.assert(fs.existsSync(path.join(project, "notes.md")) && !fs.existsSync(path.join(project, "renamed.md")),
  "a call naming more files than the file cap is refused whole");
runs.resetRunsForTests();

// --- 4. Rewind ----------------------------------------------------------------

// A rewind restores exactly the chosen checkpoint's files: the write's own
// checkpoint recorded that its file did not exist, so rewinding to it removes
// the created file; the edit's checkpoint holds the bytes the file had.
{
  const ledger = runs.listCheckpoints(acceptRun.runId);
  const undoWrite = runs.rewindRun(acceptRun.runId, { toCheckpoint: ledger.checkpoints[1].id });
  test.assert(undoWrite.restored.length === 0 && undoWrite.removed.join(",") === "created.md",
    "rewinding to a creation's checkpoint deletes the file it created");
  test.assert(!fs.existsSync(path.join(project, "created.md")) && fs.readFileSync(path.join(project, "notes.md"), "utf8") === "const answer = 43;\n",
    "only the creation's file is touched; the edit's file is not");
  const undoEdit = runs.rewindRun(acceptRun.runId, { toCheckpoint: ledger.checkpoints[0].id });
  test.assert(undoEdit.restored.join(",") === "notes.md" && undoEdit.removed.length === 0,
    "rewinding to an edit's checkpoint restores the file the call touched");
  test.assert(fs.readFileSync(path.join(project, "notes.md"), "utf8") === NOTES,
    "the real file is byte for byte what it was before the edit");
  test.assert(runs.listCheckpoints(acceptRun.runId).checkpoints.length === 1,
    "the ledger is trimmed forward of the rewind");
  const mode = fs.statSync(path.join(project, "notes.md")).mode & 0o777;
  fs.chmodSync(path.join(project, "notes.md"), 0o600);
  runs.rewindRun(acceptRun.runId, { toCheckpoint: ledger.checkpoints[0].id });
  test.assert((fs.statSync(path.join(project, "notes.md")).mode & 0o777) === mode,
    "a second rewind to the same checkpoint still restores the recorded mode");
}

{
  // A record that names a path outside the project is refused before anything
  // lands, however it spells it — the ledger is the server's, but rewind
  // trusts none of it. The plants outside are the danger: a record that says
  // "did not exist" would have the rewind delete its target.
  const run = acceptRun;
  const checkpoints = path.join(paths.agentHome(), "cliocode", "runs", run.runId, "checkpoints");
  write(path.join(outside, "planted.txt"), "planted\n");
  write(path.join(outside, "linked-target.txt"), "linked\n");
  fs.writeFileSync(path.join(checkpoints, "90.json"), `${JSON.stringify({ id: 90, files: [{ path: "../planted.txt", existed: false }] })}\n`);
  fs.mkdirSync(path.join(checkpoints, "90"), { recursive: true });
  let escape = "";
  try { runs.rewindRun(run.runId, { toCheckpoint: 90 }); } catch (error) { escape = error.code; }
  test.assert(escape === "bad_path" && fs.readFileSync(path.join(outside, "planted.txt"), "utf8") === "planted\n",
    "a `..` path in a record is refused (bad_path) and the file outside is untouched");
  fs.writeFileSync(path.join(checkpoints, "91.json"), `${JSON.stringify({ id: 91, files: [{ path: "linked-out/linked-target.txt", existed: false }] })}\n`);
  fs.mkdirSync(path.join(checkpoints, "91"), { recursive: true });
  let link = "";
  try { runs.rewindRun(run.runId, { toCheckpoint: 91 }); } catch (error) { link = error.code; }
  test.assert(link === "link_refused" && fs.readFileSync(path.join(outside, "linked-target.txt"), "utf8") === "linked\n",
    "a path through a link out of the project is refused (the belt the put-back carries)");
  fs.writeFileSync(path.join(checkpoints, "92.json"), `${JSON.stringify({ id: 92, files: [{ path: "/etc/planted-by-rewind", existed: false }] })}\n`);
  fs.mkdirSync(path.join(checkpoints, "92"), { recursive: true });
  let absolute = "";
  try { runs.rewindRun(run.runId, { toCheckpoint: 92 }); } catch (error) { absolute = error.code; }
  test.assert(absolute === "bad_path", "an absolute path in a record is refused");
  // The plants were probes, not ledger entries: remove them again.
  for (const name of ["90", "90.json", "91", "91.json", "92", "92.json"]) {
    fs.rmSync(path.join(checkpoints, name), { recursive: true, force: true });
  }
  let unknown = "";
  try { runs.rewindRun(run.runId, { toCheckpoint: 99 }); } catch (error) { unknown = error.code; }
  test.assert(unknown === "checkpoint_unknown", "rewinding to a checkpoint the run does not hold is refused");
  let shaped = "";
  try { runs.rewindRun(run.runId, {}); } catch (error) { shaped = error.code; }
  test.assert(shaped === "checkpoint_required", "a rewind needs its toCheckpoint");
}

// A running engine refuses; a stopped one rewinds after it settles.
configureStub([["t1", "edit", { file_path: "notes.md" }, () => {}]]);
const hanging = (options) => ({
  sessionId: "44444444-5555-6666-7777-888888888888",
  cwd: fs.realpathSync(options.work),
  prompt: () => new Promise(() => {}),
  async cancel() {},
  async close() { return { exited: true }; },
  kill() {},
});
runs.configureRunsForTests({ resolveKey: async () => "k-test", startEngine: hanging, startEgress: async () => ({ port: 41999, close: async () => {} }) });
const liveRun = await runs.createCodeRun({ folderId: grant.id, prompt: "stall", mode: "acceptEdits" });
const until2 = Date.now() + 3000;
while (runs.getRun(liveRun.runId).state !== "running" && Date.now() < until2) await new Promise((resolve) => setTimeout(resolve, 10));
let active = "";
try { runs.rewindRun(liveRun.runId, { toCheckpoint: 1 }); } catch (error) { active = error.code; }
test.assert(active === "run_active", "rewind refuses while the engine is still working (409 run_active)");
await runs.stopRun(liveRun.runId);
let empty = "";
try { runs.rewindRun(liveRun.runId, { toCheckpoint: 1 }); } catch (error) { empty = error.code; }
test.assert(empty === "checkpoint_unknown", "a run whose calls never wrote holds no checkpoint to rewind to");
await runs.discardRun(liveRun.runId);

// --- 5. Grants below change run read-only -------------------------------------

fs.mkdirSync(path.join(scratch, "prose"), { recursive: true });
write(path.join(scratch, "prose", "doc.md"), "prose\n");
const proposeGrant = folders.grantFolder(path.join(scratch, "prose"), "propose");
configureStub([["t1", "edit", { file_path: "doc.md" }, (cwd) => fs.writeFileSync(path.join(cwd, "doc.md"), "changed\n")]]);
const proseRun = await runs.createCodeRun({ folderId: proposeGrant.id, prompt: "x", mode: "acceptEdits" });
const proseState = await untilDone(proseRun.runId);
test.assert(proseRun.mode === "plan" && proseState === "done" && fs.readFileSync(path.join(scratch, "prose", "doc.md"), "utf8") === "prose\n",
  "a grant below change forces Plan mode: the asked mode is not honoured and the edit is refused without a prompt");
let planMode = "";
try { runs.setRunMode(proseRun.runId, "acceptEdits"); } catch (error) { planMode = error.code; }
test.assert(planMode === "plan_only", "a run on a lower grant cannot be moved out of Plan mode");
let badMode = "";
try { runs.setRunMode(proseRun.runId, "yolo"); } catch (error) { badMode = error.code; }
test.assert(badMode === "bad_mode", "an unknown mode is refused");
await runs.discardRun(proseRun.runId);

// A change grant can switch modes; the switch takes effect on the next call.
{
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  configureStub([
    ["t1", "edit", { file_path: "notes.md" }, editNotes],
    ["t2", "edit", { file_path: "notes.md" }, () => {}, () => gate],
  ]);
  const switchRun = await runs.createCodeRun({ folderId: grant.id, prompt: "two edits", mode: "acceptEdits" });
  const until3 = Date.now() + 3000;
  while (runs.listCheckpoints(switchRun.runId).checkpoints.length < 1 && Date.now() < until3) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  runs.setRunMode(switchRun.runId, "plan");
  release();
  await untilDone(switchRun.runId);
  const events = runs.getRun(switchRun.runId).events;
  test.assert(events.some((event) => event.type === "mode" && event.data.mode === "plan"),
    "the mode switch is on the record");
  test.assert(runs.listCheckpoints(switchRun.runId).checkpoints.length === 1,
    "after the switch to Plan the second edit never ran: one checkpoint for the one allowed edit");
  test.assert(fs.readFileSync(path.join(project, "notes.md"), "utf8") === "const answer = 43;\n",
    "the Plan-mode edit left the file alone");
  await runs.discardRun(switchRun.runId);
}

// --- 6. Guards, restart, discard ----------------------------------------------

function fakeReq({ remote = "127.0.0.1", host = "127.0.0.1:4173", bridge = "", token = "" } = {}) {
  const headers = { host };
  if (token) headers["x-ai-system6-agent-token"] = token;
  return { method: "GET", url: "/api/cliocode/runs", socket: { remoteAddress: remote }, headers, aiSystem6BridgeOrigin: bridge };
}
let noToken = null;
try { noToken = cliocodeRoutes.admitCliocodeRequest(fakeReq()); } catch (error) { noToken = { ok: false, code: error.code }; }
test.assert(!noToken.ok && noToken.code === "cliocode_token_required", "a loopback request without the per-boot token is refused (401)");
test.assert(cliocodeRoutes.admitCliocodeRequest(fakeReq({ token: agentToken.agentToken })).ok, "the per-boot agent token admits a loopback request");
test.assert(cliocodeRoutes.admitCliocodeRequest(fakeReq({ token: agentToken.agentToken, remote: "192.168.1.20" })).code === "cliocode_not_loopback"
  && cliocodeRoutes.admitCliocodeRequest(fakeReq({ token: agentToken.agentToken, host: "studio.local:4173" })).code === "cliocode_host_not_loopback"
  && cliocodeRoutes.admitCliocodeRequest(fakeReq({ token: agentToken.agentToken, bridge: "https://system6.example" })).code === "cliocode_bridge_refused",
  "a LAN socket, a non-loopback Host and a bridged page are refused even with the token");
const routeKey = (method, url) => Boolean(router.resolveRoute({ method, url, headers: { host: "127.0.0.1" } }));
test.assert(["GET /api/cliocode/runs", "POST /api/cliocode/runs", "GET /api/cliocode/runs/code-x/rewind", "POST /api/cliocode/runs/code-x/rewind",
  "GET /api/cliocode/runs/code-x/checkpoints", "POST /api/cliocode/runs/code-x/permission", "POST /api/cliocode/runs/code-x/mode",
  "GET /api/cliocode/runs/code-x/events", "POST /api/cliocode/runs/code-x/stop", "POST /api/cliocode/runs/code-x/discard"].every((key) => routeKey(...key.split(" "))),
  "the local router serves the ClioCode routes");
const publicProbe = spawnSync(process.execPath, ["-e", `
  process.env.AI_SYSTEM6_DEPLOYMENT_PROFILE = "public";
  const router = require("./apps/server/server/router.js");
  const routes = require("./apps/server/server/routes/cliocode.js");
  const hits = ["GET /api/cliocode/runs", "POST /api/cliocode/runs", "POST /api/cliocode/runs/code-x/rewind"]
    .filter((key) => { const [method, url] = key.split(" "); return router.resolveRoute({ method, url, headers: { host: "x" } }); });
  const admission = routes.admitCliocodeRequest({ socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1" } });
  console.log(JSON.stringify({ hits, status: admission.status }));
`], { cwd: root, encoding: "utf8" });
const publicResult = JSON.parse(publicProbe.stdout.trim() || "{}");
test.assert(Array.isArray(publicResult.hits) && publicResult.hits.length === 0 && publicResult.status === 404,
  "the public deployment serves no ClioCode route and the handler answers 404");

// Restart: memory gone, disk kept. The ledger, the log and the run survive.
const logged = runs.getRun(acceptRun.runId).events.length;
runs.resetRunsForTests();
const reloaded = runs.getRun(acceptRun.runId);
test.assert(reloaded.fromDisk && reloaded.events.length === logged && reloaded.checkpointSeq === 1
  && runs.listCheckpoints(acceptRun.runId).checkpoints.length === 1,
  "after a restart the run, its event log and its trimmed ledger are read back from disk");
test.assert(runs.listRuns().some((listed) => listed.runId === acceptRun.runId && listed.state === "done"),
  "the finished run is listed after a restart");
await runs.discardRun(acceptRun.runId);
test.assert(!fs.existsSync(path.join(paths.agentHome(), "cliocode", "runs", acceptRun.runId)),
  "discard removes the run's whole state folder (ledger, temp, home, logs); the folder itself is the writer's");
test.assert(fs.existsSync(path.join(project, "notes.md")), "discard never touches the project");

// --- 7. The boundary is structural --------------------------------------------

const cliocodeRunsSource = codeOnly(read("apps/server/server/cliocode/runs.js"));
test.assert(!/putBack|createShadow|shadowRoot/i.test(cliocodeRunsSource),
  "a ClioCode run module has no shadow and no put-back: in place, checkpoints, rewind");
const agentRunsSource = codeOnly(read("apps/server/server/agent/runs.js"));
test.assert(!/cliocode/i.test(agentRunsSource), "the ClioTalk agent run module is unchanged by ClioCode");
const engineHostSource = codeOnly(read("apps/server/server/agent/engine-host.js"));
test.assert(/options\.sandboxProfile\s*\?/.test(engineHostSource) && /options\.permissionHandler/.test(engineHostSource)
  && /options\.posture/.test(engineHostSource) && /preamble: options\.preamble/.test(engineHostSource)
  && /options\.egressPort/.test(engineHostSource) && /options\.extraEnv/.test(engineHostSource),
  "engine-host takes the run's profile builder, permission handler, posture, preamble, egress filter and PATH from its options");
const routesSource = codeOnly(read("apps/server/server/routes/cliocode.js"));
test.assert(/tokenMatches/.test(routesSource) && /AGENT_TOKEN_HEADER/.test(routesSource) && /isLoopbackHostname/.test(routesSource),
  "the ClioCode routes answer to the same per-boot token and loopback guard as the agent routes");

// Cleanup.
fs.rmSync(scratch, { recursive: true, force: true });
test.finish();
