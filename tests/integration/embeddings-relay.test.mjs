// The public VPS deployment's embeddings route, with the relay switched on.
//
// The VPS has no provider that can embed and no Cloudflare credential, so it
// borrows the Pages deployment's Workers AI route with a relay token. This runs
// the real server with that environment and a stub standing in for Pages, and
// checks both halves: the capability the client reads, and the vectors that come
// back through the process boundary.

import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RELAY_TOKEN = "relay-token-for-the-vps-deployment-0001";
const RELAY_INSTANCE = "vps-system6";
const MODEL_ID = "@cf/baai/bge-m3";
const DIMENSIONS = 1024;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`OK  embeddings-relay: ${message}`);
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

function waitForReady(port, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      // A public profile without the Turnstile pair is not "ready" by its own
      // definition, and this contract does not need a session: the relay skips
      // it. Capabilities answering is the readiness that matters here.
      const req = http.get({ host: "127.0.0.1", port, path: "/api/capabilities" }, (response) => {
        response.resume();
        if (response.statusCode === 200) resolve(true);
        else retry();
      });
      req.on("error", retry);
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) reject(new Error("the server did not become ready"));
      else setTimeout(attempt, 120);
    };
    attempt();
  });
}

function json(port, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: pathname,
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }),
        // The public guard refuses a request with no origin before anything else
        // looks at it; a page on the site always sends one.
        Origin: `http://127.0.0.1:${port}`,
        "Sec-Fetch-Site": "same-origin",
        ...headers,
      },
    }, (response) => {
      let text = "";
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
        resolve({ status: response.statusCode || 0, body: parsed, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startRelayStub() {
  const seen = [];
  const server = http.createServer((request, response) => {
    let text = "";
    request.on("data", (chunk) => { text += chunk; });
    request.on("end", () => {
      seen.push({
        token: request.headers["x-ai-system6-embeddings-relay"] || "",
        instance: request.headers["x-ai-system6-embeddings-relay-instance"] || "",
        body: (() => {
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        })(),
      });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        object: "list",
        data: [{ object: "embedding", index: 0, embedding: [0.25, 0.5, 0.75] }],
        model: MODEL_ID,
        dimensions: DIMENSIONS,
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: typeof address === "object" && address ? address.port : 0, seen });
    });
  });
}

function stopServer(server) {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 3000);
  });
}

const stub = await startRelayStub();
const appPort = await reservePort();
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-system6-embeddings-relay-"));
const serverOutput = { value: "" };
const child = spawn(process.execPath, ["apps/server/server.js"], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(appPort),
    AI_SYSTEM6_HOST: "127.0.0.1",
    AI_SYSTEM6_DEPLOYMENT_PROFILE: "public",
    AI_SYSTEM6_PUBLIC_ORIGIN: `http://127.0.0.1:${appPort}`,
    AI_SYSTEM6_STATE_DIR: stateDirectory,
    AI_SYSTEM6_EMBEDDINGS_RELAY_URL: `http://127.0.0.1:${stub.port}/api/cloud/embeddings`,
    AI_SYSTEM6_EMBEDDINGS_RELAY_TOKEN: RELAY_TOKEN,
    AI_SYSTEM6_EMBEDDINGS_RELAY_INSTANCE: RELAY_INSTANCE,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => { serverOutput.value += chunk.toString(); });
child.stderr.on("data", (chunk) => { serverOutput.value += chunk.toString(); });

try {
  await waitForReady(appPort);

  const capabilities = await json(appPort, "/api/capabilities");
  assert(capabilities.status === 200, "the public server answers its capabilities");
  assert(
    capabilities.body?.features?.cloud_embeddings === true,
    "with the relay configured the public deployment advertises hosted embeddings"
  );
  assert(
    capabilities.body?.features?.cloud_embeddings_model === MODEL_ID
      && capabilities.body?.features?.cloud_embeddings_dimensions === DIMENSIONS,
    "and names the same model and dimension count as the Pages route, so vectors from either are comparable"
  );

  const embedded = await json(appPort, "/api/cloud/embeddings", { input: ["终末地检索源"] });
  assert(embedded.status === 200, `the route answers through the relay (status ${embedded.status})`);
  assert(
    embedded.body?.data?.[0]?.embedding?.length === 3 && embedded.body?.model === MODEL_ID,
    "with the vectors the Pages route produced, in the shape the client parses"
  );
  assert(stub.seen.length === 1, "and exactly one relay call was made for one request");
  assert(
    stub.seen[0].token === RELAY_TOKEN && stub.seen[0].instance === RELAY_INSTANCE,
    "carrying the relay token and the instance that spent the allowance"
  );
  assert(
    Array.isArray(stub.seen[0].body?.input) && stub.seen[0].body.input.length === 1,
    "and the texts to embed"
  );

  // With the relay gone the route must fall back to what it did before rather
  // than fail the caller: no key, no local model, and the old refusal.
  await stopServer(stub.server);
  const offline = await json(appPort, "/api/cloud/embeddings", { input: ["终末地检索源"] });
  assert(
    offline.status === 400 && offline.body?.code === "missing_byok_key",
    `a relay outage falls back to the previous answer (status ${offline.status}, code ${offline.body?.code || ""})`
  );
} catch (error) {
  console.error(serverOutput.value.split("\n").slice(-12).join("\n"));
  throw error;
} finally {
  await stopChild(child);
  await stopServer(stub.server);
  await rm(stateDirectory, { recursive: true, force: true });
}

console.log("\nembeddings-relay integration test passed.");
