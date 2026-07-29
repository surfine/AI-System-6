import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { Readable } from "node:stream";
import { createRequire } from "node:module";

import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("server-security");
const localRequest = require("../../src/server/security/local-request.js");
const httpHelpers = require("../../src/server/lib/http.js");
const localUrls = require("../../src/server/lib/local-urls.js");
const cloud = require("../../src/server/cloud.js");
const fetchHelpers = require("../../src/server/lib/fetch.js");

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

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path,
      method: options.method || "GET",
      headers: options.headers || {},
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.once("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start. Output: ${output}`));
    }, 10000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("running at http://")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before readiness with code ${code}. Output: ${output}`));
    });
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

test.assert(localRequest.isLoopbackHostname("127.0.0.1"), "IPv4 loopback is trusted");
test.assert(localRequest.isLoopbackHostname("::ffff:127.0.0.1"), "IPv4-mapped loopback is trusted");
test.assert(!localRequest.isLoopbackHostname("192.168.1.9"), "LAN addresses are not loopback");

const defaultPolicy = localRequest.configuredLocalRequestPolicy(4173);
test.assert(
  localRequest.requestOriginIsTrusted({
    method: "POST",
    headers: {
      host: "127.0.0.1:4173",
      origin: "http://127.0.0.1:4173",
      "sec-fetch-site": "same-origin",
    },
    socket: { remoteAddress: "127.0.0.1" },
  }, defaultPolicy),
  "same-origin local API requests pass the trust check"
);
test.assert(
  !localRequest.requestOriginIsTrusted({
    method: "POST",
    headers: {
      host: "127.0.0.1:4173",
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
    socket: { remoteAddress: "127.0.0.1" },
  }, defaultPolicy),
  "cross-site local API requests fail the trust check"
);
test.assert(
  !localRequest.requestOriginIsTrusted({
    method: "GET",
    headers: { host: "attacker.example:4173" },
    socket: { remoteAddress: "127.0.0.1" },
  }, defaultPolicy),
  "DNS-rebinding Host values fail the trust check"
);

const priorAllowLan = process.env.AI_SYSTEM6_ALLOW_LAN;
const priorAuthToken = process.env.AI_SYSTEM6_AUTH_TOKEN;
process.env.AI_SYSTEM6_ALLOW_LAN = "1";
delete process.env.AI_SYSTEM6_AUTH_TOKEN;
let missingLanTokenRejected = false;
try {
  localRequest.configuredLocalRequestPolicy(4173);
} catch {
  missingLanTokenRejected = true;
}
test.assert(missingLanTokenRejected, "LAN mode fails closed without a long access token");
if (priorAllowLan === undefined) delete process.env.AI_SYSTEM6_ALLOW_LAN;
else process.env.AI_SYSTEM6_ALLOW_LAN = priorAllowLan;
if (priorAuthToken === undefined) delete process.env.AI_SYSTEM6_AUTH_TOKEN;
else process.env.AI_SYSTEM6_AUTH_TOKEN = priorAuthToken;

let remoteLocalEndpointRejected = false;
try {
  localUrls.getLocalUrls("lm-studio", "http://169.254.169.254/latest/meta-data");
} catch {
  remoteLocalEndpointRejected = true;
}
test.assert(remoteLocalEndpointRejected, "local model routing rejects metadata and other non-loopback hosts");
test.assert(
  localUrls.getLocalUrls("ollama", "http://localhost:11434").baseUrl === "http://localhost:11434",
  "explicit loopback model endpoints remain supported"
);
test.assert(
  cloud.resolveCloudBaseUrl("https://attacker.example") === cloud.DEEPSEEK_BASE_URL_DEFAULT,
  "request-provided cloud origins cannot override the trusted provider"
);

const wrongType = Readable.from([Buffer.from("{}")]);
wrongType.method = "POST";
wrongType.headers = {};
let wrongTypeStatus = 0;
try {
  await httpHelpers.readJsonBody(wrongType);
} catch (error) {
  wrongTypeStatus = error?.statusCode || 0;
}
test.assert(wrongTypeStatus === 415, "JSON body parsing rejects a simple cross-site content type");

const originalFetch = globalThis.fetch;
let attemptedPosts = 0;
globalThis.fetch = async () => {
  attemptedPosts += 1;
  throw new Error("response connection closed");
};
let failedPost = false;
try {
  await fetchHelpers.postJsonWithFallback("https://example.com/v1/test", { value: 1 });
} catch {
  failedPost = true;
} finally {
  globalThis.fetch = originalFetch;
}
test.assert(failedPost && attemptedPosts === 1, "a failed POST is not replayed through another transport");

let port = 0;
try {
  port = await reservePort();
} catch (error) {
  if (error?.code !== "EPERM") throw error;
  test.ok("socket integration checks are deferred when the sandbox forbids loopback listeners");
}

if (port) {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      AI_SYSTEM6_DEPLOYMENT_PROFILE: "local",
      AI_SYSTEM6_HOST: "127.0.0.1",
      AI_SYSTEM6_ALLOW_LAN: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(child);

    const shell = await request(port, "/index.html");
    test.assert(shell.status === 200, "the allowlisted application shell is served");
    test.assert(shell.headers["x-content-type-options"] === "nosniff", "responses disable MIME sniffing");
    test.assert(
      String(shell.headers["content-security-policy"] || "").includes("object-src 'none'"),
      "responses carry the application CSP"
    );

    for (const path of ["/src/server.js", "/package.json", "/.git/config"]) {
      const blocked = await request(port, path);
      test.assert(blocked.status === 404, `${path} is not downloadable`);
    }

    const badHost = await request(port, "/api/version", {
      headers: { Host: `attacker.example:${port}` },
    });
    test.assert(badHost.status === 403, "an untrusted Host cannot reach local APIs");

    const badOrigin = await request(port, "/api/model-budget", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      body: "{}",
    });
    test.assert(badOrigin.status === 403, "a cross-site Origin cannot invoke a local API");

    const missingJsonType = await request(port, "/api/model-budget", {
      method: "POST",
      body: "{}",
    });
    test.assert(missingJsonType.status === 415, "modifying APIs require application/json");
  } finally {
    await stopServer(child);
  }
}

test.finish();
