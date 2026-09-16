// A Humanizer repair call that was sent is part of the run, even when its
// usage never arrives.
//
// The repair loop books each repair as its own upstream call. Booking only
// after the response parsed meant a call that was sent and then cut off left
// no trace: the run reported a smaller, precise-looking token total and zero
// repair attempts, as if the retry had never happened.
//
// Part 1 drives the real route over HTTP with a real upstream that is cut off
// mid-response. Part 2 drives the same repair function directly, where a
// refused budget check, a cancellation and a discarded answer can each be
// produced at a named moment.

import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

// Every check is recorded, so one regression does not hide the others and the
// shape of a broken run is visible in one pass.
const failures = [];
function assert(condition, message) {
  if (condition) {
    console.log(`OK  cloud-repair-usage: ${message}`);
    return;
  }
  failures.push(message);
  console.error(`NO  cloud-repair-usage: ${message}`);
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

// A first answer that carries a Humanizer hit, so an explicit-rewrite task has
// something to repair.
const FIRST_ANSWER = "此外，这一版还带着明显的 AI 腔。";
const REPAIR_MARKER = "上一版仍然有 AI 腔残留";

function jsonResponse(content, usage) {
  return JSON.stringify({
    model: "deepseek-flash",
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
    ...(usage === undefined ? {} : { usage: { total_tokens: usage } }),
  });
}

const isRepairPayload = (payload) => JSON.stringify(payload?.messages || []).includes(REPAIR_MARKER);

try {
  await reservePort();
} catch (error) {
  if (error?.code === "EPERM") {
    console.log("SKIP cloud-repair-usage: loopback listeners are unavailable in this sandbox");
    process.exit(0);
  }
  throw error;
}

const [encodedKey, cert] = await Promise.all([
  readFile(path.join(root, "tests/fixtures/cloud-upstream-key.fixture")),
  readFile(path.join(root, "tests/fixtures/cloud-upstream-cert.fixture")),
]);
const key = crypto.createPrivateKey({
  key: Buffer.from(encodedKey.toString("ascii").trim(), "base64"),
  format: "der",
  type: "pkcs8",
}).export({ format: "pem", type: "pkcs8" });

/** How the next repair call should behave. Read by the fake upstream. */
let repairBehaviour = "cut-off";
/** Called when the repair request arrives, before it is answered. */
let onRepairArrived = () => {};
/* Counted, not asserted yet: the underscore is what the lint rule allows for a
   value a test is still growing toward. The release's eslint gate is the only
   thing that saw it. */
let _repairCalls = 0;

const upstream = https.createServer({ key, cert }, (req, res) => {
  req.on("error", () => {});
  res.on("error", () => {});
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    let payload = {};
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {}
    if (!isRepairPayload(payload)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(jsonResponse(FIRST_ANSWER, 100));
      return;
    }
    _repairCalls += 1;
    onRepairArrived();
    if (repairBehaviour === "cut-off") {
      // The request was answered in part and the connection died under the
      // reader: exactly the case where the call happened without its usage.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"model":"deepseek-flash","choices":[{"message":{"content":"第二版');
      setTimeout(() => res.socket?.destroy(), 10);
      return;
    }
    if (repairBehaviour === "broken-json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"model":"deepseek-flash","choices":');
      return;
    }
    if (repairBehaviour === "no-usage") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(jsonResponse("这版已经直接说明问题。"));
      return;
    }
    if (repairBehaviour === "blank") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(jsonResponse("   ", 20));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(jsonResponse("这版已经直接说明问题。", 20));
  });
});

await new Promise((resolve, reject) => {
  upstream.once("error", reject);
  upstream.listen(0, "127.0.0.1", resolve);
});
const upstreamAddress = upstream.address();
const upstreamPort = typeof upstreamAddress === "object" && upstreamAddress ? upstreamAddress.port : 0;
const upstreamBase = `https://127.0.0.1:${upstreamPort}`;

// --- Part 1: the whole route, with an upstream cut off mid-repair -----------

function readRouteResponse(port, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: "/api/cloud/chat",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode || 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.once("error", reject);
    req.end(payload);
  });
}

const appPort = await reservePort();
const serverOutput = { value: "" };
const child = spawn(process.execPath, ["apps/server/server.js"], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(appPort),
    AI_SYSTEM6_HOST: "127.0.0.1",
    DEEPSEEK_API_KEY: "repair-accounting-test-key",
    DEEPSEEK_BASE_URL: upstreamBase,
    AI_SYSTEM6_ALLOW_PRIVATE_CLOUD_ENDPOINTS: "1",
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

function waitForServer() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`server startup timed out: ${serverOutput.value}`)), 15_000);
    const inspect = (chunk) => {
      serverOutput.value += chunk.toString();
      if (serverOutput.value.includes("running at http://")) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`server exited before readiness (${code}): ${serverOutput.value}`));
    });
  });
}

async function stopChild() {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

try {
  await waitForServer();

  const chatBody = {
    model: "deepseek-flash",
    messages: [{ role: "user", content: "把这段改得像人写的。" }],
    max_tokens: 400,
    ai_system6_task_kind: "humanize-selection",
  };

  repairBehaviour = "cut-off";
  const cutOff = await readRouteResponse(appPort, chatBody);
  assert(cutOff.status === 200, "a repair that was cut off still returns the answer that did arrive");
  const cutOffData = JSON.parse(cutOff.body);
  assert(
    cutOffData.choices?.[0]?.message?.content === FIRST_ANSWER,
    "the first answer survives the lost repair"
  );
  assert(
    cutOffData.ai_system6_humanizer?.repair_attempts === 1,
    "the sent repair is reported as one attempt, not zero"
  );
  assert(
    cutOffData.ai_system6_metrics?.usage?.total_tokens_known === false,
    "a sent repair without usage marks the run total as unknown"
  );
  assert(
    cutOffData.ai_system6_metrics?.usage?.total_tokens === 100,
    "the confirmed first-answer tokens stay as the floor of that total"
  );

  repairBehaviour = "ok";
  const repaired = JSON.parse((await readRouteResponse(appPort, chatBody)).body);
  assert(
    repaired.ai_system6_humanizer?.repair_attempts === 1 && repaired.ai_system6_humanizer?.repaired === true,
    "a repair that answers is reported as one attempt and one repair"
  );
  assert(
    repaired.ai_system6_metrics?.usage?.total_tokens === 120
      && repaired.ai_system6_metrics?.usage?.total_tokens_known !== false,
    "the run total adds the repair's usage exactly once"
  );
} finally {
  await stopChild();
}

// --- Part 2: the same repair function, with the seams the route uses --------

process.env.NODE_ENV = "test";
process.env.DEEPSEEK_BASE_URL = upstreamBase;
process.env.DEEPSEEK_API_KEY = "repair-accounting-test-key";
process.env.AI_SYSTEM6_ALLOW_PRIVATE_CLOUD_ENDPOINTS = "1";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const routeModule = require(path.join(root, "apps/server/server/routes/cloud-chat.js"));
const { repairCloudHumanizerOutputIfNeeded } = routeModule;
if (typeof repairCloudHumanizerOutputIfNeeded !== "function") {
  // The route module owns this function; without it the accounting cannot be
  // exercised at all, which is itself the regression this part exists for.
  assert(false, "the route module exposes the repair function its accounting lives in");
  await new Promise((resolve) => upstream.close(resolve));
  console.error(`\ncloud-repair-usage failed: ${failures.length} issue(s).`);
  process.exit(1);
}

const payload = {
  model: "deepseek-flash",
  messages: [{ role: "user", content: "把这段改得像人写的。" }],
  max_tokens: 400,
};
const targetUrl = `${upstreamBase}/v1/chat/completions`;
const firstData = () => ({
  model: "deepseek-flash",
  choices: [{ message: { role: "assistant", content: FIRST_ANSWER }, finish_reason: "stop" }],
  usage: { total_tokens: 100 },
});

/** Start one repair and hand back its own abort controller and ledger. */
function startRepair(input = {}) {
  const usage = [];
  const controller = new AbortController();
  const promise = repairCloudHumanizerOutputIfNeeded({
    data: firstData(),
    payload,
    taskKind: "humanize-selection",
    targetUrl,
    signal: controller.signal,
    authHeaders: { Authorization: "Bearer repair-accounting-test-key" },
    transportOptions: {},
    initialUsageTokens: 100,
    onUsage: (value) => usage.push(value),
    ...input,
  }).then((result) => ({ result, usage, controller }));
  return { promise, usage, controller };
}

function repair(input = {}) {
  return startRepair(input).promise;
}

{
  // The budget check refuses the call before it is sent: nothing upstream
  // happened, so nothing is booked.
  const refusal = Object.assign(new Error("daily request limit reached"), { code: "shared_cloud_request_limit" });
  const { result, usage } = await repair({
    reserveSharedCall: () => { throw refusal; },
  });
  assert(usage.length === 0, "a repair refused before it was sent books no usage");
  assert(
    result.ai_system6_humanizer?.repair_attempts === 0,
    "a repair that never reached the wire is not reported as an attempt"
  );
  assert(
    result.ai_system6_humanizer?.total_usage_tokens === 100,
    "and it leaves the run total as the first answer's own"
  );
}

{
  repairBehaviour = "cut-off";
  const { result, usage } = await repair();
  assert(usage.length === 1 && usage[0] === undefined, "a sent repair that lost its response books one unknown");
  assert(result.ai_system6_humanizer?.repair_attempts === 1, "the attempt is still reported");
  assert(result.ai_system6_humanizer?.repaired === false, "the lost repair does not claim to have repaired anything");
}

{
  repairBehaviour = "broken-json";
  const { result, usage } = await repair();
  assert(usage.length === 1 && usage[0] === undefined, "a repair whose JSON is broken books one unknown");
  assert(result.ai_system6_humanizer?.repair_attempts === 1, "that call is still an attempt");
}

{
  repairBehaviour = "no-usage";
  const { result, usage } = await repair();
  assert(
    usage.length === 1 && usage[0] === undefined,
    "a repair response without a usage figure is booked as unknown, not as zero"
  );
  assert(
    result.ai_system6_humanizer?.total_usage_tokens === 100,
    "the known tokens stay as a floor"
  );
}

{
  repairBehaviour = "blank";
  const { result, usage } = await repair();
  assert(usage.length === 1 && usage[0]?.total_tokens === 20, "a discarded repair answer still books its usage");
  assert(
    result.ai_system6_humanizer?.repair_attempts === 1 && result.ai_system6_humanizer?.repaired === false,
    "the attempt is reported even though its answer was thrown away"
  );
  assert(
    result.ai_system6_humanizer?.total_usage_tokens === 120,
    "the discarded call's tokens are part of what the run cost"
  );
}

{
  // The call is on the wire; the client cancels it. The attempt happened, so
  // the run owes an unknown marker for it.
  repairBehaviour = "ok";
  const pending = startRepair();
  // The upstream aborts the client as soon as the request lands, which is a
  // cancellation of a call that had already been sent.
  onRepairArrived = () => pending.controller.abort();
  const { result, usage } = await pending.promise;
  onRepairArrived = () => {};
  assert(usage.length === 1 && usage[0] === undefined, "a cancelled repair books one unknown for the call that was sent");
  assert(result.ai_system6_humanizer?.repair_attempts === 1, "the cancelled call is still an attempt");
}

{
  repairBehaviour = "ok";
  const { result, usage } = await repair();
  assert(
    usage.length === 1 && usage[0]?.total_tokens === 20,
    "a successful repair books its usage once"
  );
  assert(result.ai_system6_humanizer?.repaired === true, "and the repaired answer is the one returned");
  assert(
    result.ai_system6_humanizer?.repair_attempts === 1 && result.ai_system6_humanizer?.total_usage_tokens === 120,
    "one attempt, one repaired answer, one added total"
  );
}

onRepairArrived = () => {};
await new Promise((resolve) => upstream.close(resolve));
if (failures.length) {
  console.error(`\ncloud-repair-usage failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log("PASS cloud-repair-usage");
