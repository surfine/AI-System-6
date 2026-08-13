import { spawn } from "node:child_process";
import { createPrivateKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const testSecret = "route-test-secret-never-log";
const environmentSecret = "environment-test-secret-never-send";

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`OK  cloud-credential-scope: ${message}`);
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

function stopServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

let appPort;
try {
  appPort = await reservePort();
} catch (error) {
  if (error?.code === "EPERM") {
    console.log("SKIP cloud-credential-scope: loopback listeners are unavailable in this sandbox");
    process.exit(0);
  }
  throw error;
}

const [encodedKey, cert] = await Promise.all([
  readFile(path.join(root, "tests/fixtures/cloud-upstream-key.fixture")),
  readFile(path.join(root, "tests/fixtures/cloud-upstream-cert.fixture")),
]);
const key = createPrivateKey({
  key: Buffer.from(encodedKey.toString("ascii").trim(), "base64"),
  format: "der",
  type: "pkcs8",
}).export({ format: "pem", type: "pkcs8" });
const upstreamRequests = [];
const upstream = https.createServer({ key, cert }, (req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    upstreamRequests.push({
      path: req.url || "",
      authorization: String(req.headers.authorization || ""),
      body: Buffer.concat(chunks).toString("utf8"),
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      model: "test-model",
      choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }));
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
    PORT: String(appPort),
    AI_SYSTEM6_HOST: "127.0.0.1",
    AI_SYSTEM6_DEPLOYMENT_PROFILE: "local",
    AI_SYSTEM6_ALLOW_CUSTOM_CLOUD_ENDPOINTS: "1",
    AI_SYSTEM6_ALLOW_PRIVATE_CLOUD_ENDPOINTS: "1",
    DEEPSEEK_API_KEY: environmentSecret,
    DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(child, serverOutput);
  const staged = await request(appPort, "/api/cloud/credentials", {
    action: "stage",
    provider: "deepseek",
    base_url: `${upstreamBase}/scope-a/`,
    api_key: testSecret,
  });
  assert(staged.status === 200, "the real credential route stages a scoped key");
  const credentialId = JSON.parse(staged.body).credential_id;

  const beforeMismatch = upstreamRequests.length;
  const mismatch = await request(appPort, "/api/cloud/chat", {
    model: "test-model",
    messages: [{ role: "user", content: "scope mismatch" }],
    stream: false,
    _cloud_credential_id: credentialId,
    _cloud_base_url: `${upstreamBase}/scope-b`,
  });
  assert(
    mismatch.status === 400
      && JSON.parse(mismatch.body).code === "credential_scope_mismatch"
      && upstreamRequests.length === beforeMismatch,
    "a mismatched credential fails before the fake upstream receives a request"
  );

  const valid = await request(appPort, "/api/cloud/chat", {
    model: "test-model",
    messages: [{ role: "user", content: "same normalized scope" }],
    stream: false,
    _cloud_credential_id: credentialId,
    _cloud_base_url: `${upstreamBase}/scope-a`,
  });
  assert(
    valid.status === 200
      && upstreamRequests.at(-1)?.authorization === `Bearer ${testSecret}`
      && upstreamRequests.at(-1)?.path === "/scope-a/v1/chat/completions",
    "the same normalized scope retrieves the key and reaches the pinned upstream"
  );

  const beforeEnvironment = upstreamRequests.length;
  const customWithoutByok = await request(appPort, "/api/cloud/chat", {
    model: "test-model",
    messages: [{ role: "user", content: "environment boundary" }],
    stream: false,
    _cloud_base_url: `${upstreamBase}/custom-no-byok`,
  });
  assert(
    customWithoutByok.status === 400
      && JSON.parse(customWithoutByok.body).code === "missing_byok_key"
      && upstreamRequests.length === beforeEnvironment,
    "a custom target cannot receive the DeepSeek environment credential"
  );

  const visibleOutput = `${mismatch.body}\n${customWithoutByok.body}\n${serverOutput.value}`;
  assert(
    !visibleOutput.includes(testSecret) && !visibleOutput.includes(environmentSecret),
    "route responses and service logs do not expose test credentials"
  );
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await stopServer(upstream);
}

console.log("\ncloud-credential-scope integration test passed.");
