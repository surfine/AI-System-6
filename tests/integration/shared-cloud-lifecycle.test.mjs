import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sessionSecret = "shared-cloud-route-test-secret-32-bytes-minimum";
const sessionNonce = "shared-cloud-route-session-nonce";

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`OK  shared-cloud-lifecycle: ${message}`);
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

function sessionCookie() {
  const now = Math.floor(Date.now() / 1000);
  const encoded = Buffer.from(JSON.stringify({
    v: 1,
    iat: now,
    exp: now + 3600,
    nonce: sessionNonce,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret)
    .update(encoded)
    .digest("base64url");
  return `ai_system6_public_session=${encoded}.${signature}`;
}

function request(port, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Cookie": sessionCookie(),
        "Origin": `http://127.0.0.1:${port}`,
        "Sec-Fetch-Site": "same-origin",
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

function waitForServer(child, output) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`server startup timed out: ${output.value}`)), 10_000);
    const inspect = (chunk) => {
      output.value += chunk.toString();
      if (output.value.includes("running at http://")) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`server exited before readiness (${code}): ${output.value}`));
    });
  });
}

async function stopChild(child) {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function stopServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function jsonResponse(content, usage) {
  return JSON.stringify({
    model: "deepseek-v4-flash",
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { total_tokens: usage },
  });
}

let appPort;
try {
  appPort = await reservePort();
} catch (error) {
  if (error?.code === "EPERM") {
    console.log("SKIP shared-cloud-lifecycle: loopback listeners are unavailable in this sandbox");
    process.exit(0);
  }
  throw error;
}

const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-system6-shared-route-"));
const [encodedKey, cert] = await Promise.all([
  readFile(path.join(root, "tests/fixtures/cloud-upstream-key.fixture")),
  readFile(path.join(root, "tests/fixtures/cloud-upstream-cert.fixture")),
]);
const key = crypto.createPrivateKey({
  key: Buffer.from(encodedKey.toString("ascii").trim(), "base64"),
  format: "der",
  type: "pkcs8",
}).export({ format: "pem", type: "pkcs8" });
const upstreamRequests = [];
let humanizerCalls = 0;
const upstream = https.createServer({ key, cert }, (req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    const payload = JSON.parse(raw);
    upstreamRequests.push({ path: req.url || "", payload });

    if (req.url === "/responses") {
      const count = Math.max(1, (String(payload.input || "").match(/### P\d+/g) || []).length);
      const output = JSON.stringify({
        items: Array.from({ length: count }, (_, index) => ({
          index: index + 1,
          text: `Translated subtitle ${index + 1}.`,
        })),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: output }] }],
        usage: { total_tokens: 5 },
      }));
      return;
    }

    if (payload.stream === true) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write("data: {\"choices\":[{\"delta\":{\"content\":\"streamed\"}}]}\n\n");
      if (!raw.includes("no usage stream")) {
        res.write("data: {\"usage\":{\"total_");
        setImmediate(() => {
          res.write("tokens\":11},\"choices\"");
          setImmediate(() => {
            res.write(":[]}\n\ndata: [DONE]\n\n");
            res.end();
          });
        });
      } else {
        res.end("data: [DONE]\n\n");
      }
      return;
    }

    if (raw.includes("humanizer route") || raw.includes("上一版仍然有 AI 腔残留")) {
      humanizerCalls += 1;
      const content = humanizerCalls < 3 ? `此外，仍需改写 ${humanizerCalls}` : "这版已经直接说明问题。";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(jsonResponse(content, humanizerCalls * 10));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(jsonResponse("plain response", 7));
  });
});

await new Promise((resolve, reject) => {
  upstream.once("error", reject);
  upstream.listen(0, "127.0.0.1", resolve);
});
const upstreamAddress = upstream.address();
const upstreamPort = typeof upstreamAddress === "object" && upstreamAddress ? upstreamAddress.port : 0;
const upstreamBase = `https://127.0.0.1:${upstreamPort}`;

const serverOutput = { value: "" };
const child = spawn(process.execPath, ["apps/server/server.js"], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(appPort),
    AI_SYSTEM6_HOST: "127.0.0.1",
    AI_SYSTEM6_PUBLIC_ORIGIN: `http://127.0.0.1:${appPort}`,
    AI_SYSTEM6_DEPLOYMENT_PROFILE: "public",
    AI_SYSTEM6_SESSION_SECRET: sessionSecret,
    TURNSTILE_SECRET: "test-secret",
    TURNSTILE_SITE_KEY: "test-site-key",
    AI_SYSTEM6_TEST_DEEPSEEK_PUBLIC_BASE_URL: upstreamBase,
    AI_SYSTEM6_ALLOW_PRIVATE_CLOUD_ENDPOINTS: "1",
    AI_SYSTEM6_STATE_DIR: stateDirectory,
    AI_SYSTEM6_SHARED_CLOUD_DAILY_TOKEN_BUDGET: "1000000",
    AI_SYSTEM6_SHARED_CLOUD_DAILY_REQUEST_LIMIT: "100",
    AI_SYSTEM6_SHARED_CLOUD_SESSION_REQUEST_LIMIT: "100",
    DEEPSEEK_API_KEY: "shared-route-test-key",
    DEEPSEEK_BASE_URL: upstreamBase,
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const readState = async () => JSON.parse(await readFile(
  path.join(stateDirectory, "shared-cloud-budget.json"),
  "utf8"
));

async function waitForState(predicate) {
  const deadline = Date.now() + 2_000;
  let state;
  do {
    state = await readState();
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  return state;
}

try {
  await waitForServer(child, serverOutput);

  const plain = await request(appPort, "/api/cloud/chat", {
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "plain route" }],
    stream: false,
  });
  assert(plain.status === 200, "a non-streaming route call succeeds through the fake upstream");
  let state = await readState();
  assert(state.requests === 1 && state.reserved_tokens === 7, "non-streaming usage settles to the provider's actual total");

  const humanizer = await request(appPort, "/api/cloud/chat", {
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "humanizer route" }],
    stream: false,
    ai_system6_task_kind: "humanize-selection",
  });
  assert(humanizer.status === 200 && humanizerCalls === 3, "two Humanizer repairs make three independently metered upstream calls");
  state = await waitForState((value) => Object.keys(value.reservations).length === 0);
  assert(state.requests === 4 && state.reserved_tokens === 67, "Humanizer settlement accumulates usage from all three calls");

  const streamed = await request(appPort, "/api/cloud/chat", {
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "split stream usage" }],
    stream: true,
  });
  assert(streamed.status === 200 && streamed.body.includes("[DONE]"), "the streaming route relays fragmented SSE");
  state = await waitForState((value) => Object.keys(value.reservations).length === 0);
  assert(
    state.requests === 5 && state.reserved_tokens === 78,
    "fragmented SSE usage settles to eleven tokens"
  );

  const beforeUnknown = state.reserved_tokens;
  const unknownUsage = await request(appPort, "/api/cloud/chat", {
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "no usage stream" }],
    stream: true,
    max_tokens: 17,
  });
  assert(unknownUsage.status === 200, "a stream without usage still completes");
  state = await waitForState((value) => Object.keys(value.reservations).length === 0);
  assert(state.reserved_tokens > beforeUnknown, "missing stream usage retains the conservative reservation instead of refunding to zero");

  const blocks = Array.from({ length: 24 }, (_, index) => ({
    number: String(index + 1),
    start: `00:00:${String(index).padStart(2, "0")},000`,
    end: `00:00:${String(index).padStart(2, "0")},900`,
    text: `第 ${index + 1} 句。`,
  }));
  const responsesBefore = upstreamRequests.filter((item) => item.path === "/responses").length;
  const subtitle = await request(appPort, "/api/subtitles/translate", {
    mode: "en",
    blocks,
    _cloud_active: true,
    _cloud_model: "deepseek-v4-flash",
  });
  const responsesAfter = upstreamRequests.filter((item) => item.path === "/responses").length;
  assert(subtitle.status === 200 && responsesAfter - responsesBefore === 3, "twenty-four subtitle paragraphs create three real upstream batches");
  state = await waitForState((value) => Object.keys(value.reservations).length === 0);
  assert(state.requests === 9 && Object.keys(state.reservations).length === 0, "each subtitle batch reserves and settles exactly once");
} finally {
  await stopChild(child);
  await stopServer(upstream);
  await rm(stateDirectory, { recursive: true, force: true });
}

console.log("\nshared-cloud-lifecycle integration test passed.");
