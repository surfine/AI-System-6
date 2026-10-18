import assert from "node:assert/strict";
import vm from "node:vm";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { webcrypto } from "node:crypto";
import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";
import { fakeAppDb, memoryStorage } from "../helpers/fake-app-db.mjs";
const test = createFeatureTest("tinyjs-lifecycle");
const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
process.env.AI_SYSTEM6_SHELL_TOKEN = "a".repeat(64);
process.env.AI_SYSTEM6_SHELL_PARENT_PID = String(process.pid);
const session = require("../../apps/server/server/shell-session.js");
assert.equal(session.shellOwned, true);
assert.doesNotThrow(() => session.handleShellSession({ url: "/api/shell/identity", method: "GET",
  headers: { "x-ai-system6-shell-token": "字".repeat(64) }, socket: { remoteAddress: "127.0.0.1" } },
{ writeHead() {}, end() {} }));
const server = createServer((req, res) => session.handleShellSession(req, res));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const url = "http://127.0.0.1:" + server.address().port + "/api/shell/identity";
  assert.equal((await fetch(url)).status, 404);
  assert.equal((await fetch(url, { headers: { "X-AI-System6-Shell-Token": "b".repeat(64) } })).status, 404);
  const response = await fetch(url, { headers: { "X-AI-System6-Shell-Token": "a".repeat(64) } });
  const proof = await response.json();
  assert.equal(response.status, 200); assert.equal(proof.pid, process.pid);
  assert.equal(proof.parentPid, process.pid); assert.equal(response.headers.get("cache-control"), "no-store");
  const bootstrapUrl = new URL("/api/shell/bootstrap", url);
  const bootstrap = await fetch(bootstrapUrl);
  assert.equal(bootstrap.status, 200); assert.equal(bootstrap.headers.get("cache-control"), "no-store");
  assert.match(await bootstrap.text(), /src="\/api\/shell\/bootstrap.js"/);
  assert.equal((await fetch(bootstrapUrl, { method: "POST" })).status, 404);
  const js = await fetch(new URL("/api/shell/bootstrap.js", url));
  const removed = [], registrations = [], destinations = [];
  const caches = { keys: async () => ["ais6-old-boot", "other-product"], delete: async (name) => { removed.push(name); return true; } };
  // The bootstrap measures storage before it hands over to the desk: when
  // the desk starts, the arrival record must already exist.
  const appDb = fakeAppDb(new Map([["projects", new Map([["p", { id: "p" }]])], ["keyval", new Map([["settings", {}]])]]));
  const session = memoryStorage();
  let arrivalAtHandoff = null;
  const context = vm.createContext({ URL, window: { caches }, caches, indexedDB: appDb.indexedDB, sessionStorage: session,
    localStorage: { getItem: () => null }, crypto: webcrypto, TextEncoder, Blob, Date, DOMException, setTimeout,
    location: { replace: (path) => { arrivalAtHandoff = session.getItem("ai-system6-storage-arrival"); destinations.push(path); } },
    navigator: { serviceWorker: { getRegistrations: async () => [
      { active: { scriptURL: new URL("/sw.js?v=old", url).href }, unregister: async () => registrations.push("own") },
      { active: { scriptURL: new URL("/other-sw.js", url).href }, unregister: async () => registrations.push("other") },
    ] } }, document: { body: {} } });
  await vm.runInContext(await js.text(), context);
  assert.deepEqual(removed, ["ais6-old-boot"]); assert.deepEqual(registrations, ["own"]);
  assert.deepEqual(destinations, ["/"]);
  const arrival = JSON.parse(arrivalAtHandoff || "{}");
  assert.match(arrival.fingerprint || "", /^[a-f0-9]{64}$/); assert.deepEqual(arrival.manifest.projects, ['"p"']);
  assert.equal(appDb.counters().closed, 1);
  test.assert(true, "native bootstrap measures storage before any desk code, bypasses old offline routing and removes only own derived caches before loading the current payload");
} finally { await new Promise((resolve) => server.close(resolve)); }

const dir = await mkdtemp(join(tmpdir(), "system6-supervisor-"));
const parent = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
let supervisor;
try {
  await mkdir(join(dir, "apps/server"), { recursive: true });
  await writeFile(join(dir, "apps/server/server.js"), `
    const {spawn}=require('node:child_process');
    const fs=require('node:fs');
    const helper=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    fs.writeFileSync(${JSON.stringify(join(dir, "helper.json"))},JSON.stringify({pid:helper.pid}));
    setInterval(()=>{},1000);
  `);
  const status = join(dir, "process.json");
  supervisor = spawn(process.execPath, [join(root, "platform/macos/tinyjs/src/node/supervisor.cjs"), dir, String(parent.pid)],
    { stdio: "ignore", env: { ...process.env, AI_SYSTEM6_SHELL_PROCESS_FILE: status } });
  const exited = new Promise((resolve) => supervisor.once("exit", resolve));
  let record, helper;
  for (let i = 0; i < 100; i++) {
    try { record = JSON.parse(await readFile(status)); helper = JSON.parse(await readFile(join(dir, "helper.json"))); break; } catch {}
    await sleep(50);
  }
  assert.ok(record?.serverPid && helper?.pid, "the real server and its helper started");
  parent.kill("SIGKILL");
  await Promise.race([exited, sleep(5000).then(() => { throw new Error("Supervisor did not stop after parent death"); })]);
  for (const pid of [record.serverPid, helper.pid]) {
    let dead = false;
    for (let i = 0; i < 40; i++) {
      try { process.kill(pid, 0); } catch (e) { if (e.code === "ESRCH") { dead = true; break; } }
      await sleep(50);
    }
    assert.ok(dead, "owned server/helper is gone after backend death: " + pid);
  }
  test.assert(true, "HTTP identity rejects unrelated listeners; forced backend death reaps its server group");
} finally {
  parent.kill("SIGKILL"); supervisor?.kill("SIGKILL");
  await rm(dir, { recursive: true, force: true });
}
if (process.platform === "darwin") {
  const nativeParent = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  const command = spawn(process.execPath, [join(root, "platform/macos/tinyjs/src/node/native-command.cjs"), String(nativeParent.pid), "/usr/bin/osascript", "-e", "delay 60"], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  command.stdout.on("data", (bytes) => { output += bytes; });
  const stopped = new Promise((resolve) => command.once("exit", resolve));
  try {
    await sleep(1000);
    nativeParent.kill("SIGKILL");
    await Promise.race([stopped, sleep(5000).then(() => { throw new Error("Native command outlived its owner"); })]);
    assert.equal(JSON.parse(output).code, -1);
    test.assert(true, "a real native command is cancelled when its owning backend dies");
  } finally { nativeParent.kill("SIGKILL"); command.kill("SIGTERM"); }
}
test.finish();
