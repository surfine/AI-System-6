import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`OK  cmf-worker-routes: ${message}`);
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

function request(port, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? "" : JSON.stringify(body);
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: pathname,
      method: body === null ? "GET" : "POST",
      headers: body === null ? {} : {
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

function disconnectRequest(port, pathname, body) {
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
  });
  req.on("error", () => {});
  req.end(payload);
  return req;
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

let appPort;
try {
  appPort = await reservePort();
} catch (error) {
  if (error?.code === "EPERM") {
    console.log("SKIP cmf-worker-routes: loopback listeners are unavailable in this sandbox");
    process.exit(0);
  }
  throw error;
}

const serverOutput = { value: "" };
const child = spawn(process.execPath, ["apps/server/server.js"], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(appPort),
    AI_SYSTEM6_HOST: "127.0.0.1",
    AI_SYSTEM6_DEPLOYMENT_PROFILE: "local",
    AI_SYSTEM6_CMF_CONCURRENCY: "1",
    AI_SYSTEM6_CMF_QUEUE_LIMIT: "1",
    AI_SYSTEM6_CMF_TIMEOUT_MS: "3000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const previewBody = (name, test) => ({
  recipe: { model: "iphone-17-standard", name, parts: {} },
  viewName: `${name}-view`,
  _test: { enabled: true, synthetic: true, ...test },
});

try {
  await waitForServer(child, serverOutput);

  const slow = request(appPort, "/api/cmf/render-preview", previewBody("slow", { delayMs: 500 }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  const healthStarted = Date.now();
  const health = await request(appPort, "/healthz");
  assert(health.status === 200 && Date.now() - healthStarted < 300, "healthz responds while a render worker is still busy");

  const queued = request(appPort, "/api/cmf/render-preview", previewBody("queued", { delayMs: 100 }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const busy = await request(appPort, "/api/cmf/render-preview", previewBody("busy", { delayMs: 10 }));
  assert(busy.status === 429 && JSON.parse(busy.body).code === "cmf_busy", "a full CMF queue returns the stable busy response");
  const [slowResult, queuedResult] = await Promise.all([slow, queued]);
  assert(slowResult.status === 200 && queuedResult.status === 200, "one worker completes two queued renders in order");

  const disconnected = disconnectRequest(
    appPort,
    "/api/cmf/render-preview",
    previewBody("disconnect", { delayMs: 1000 })
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  disconnected.destroy();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const afterDisconnectStarted = Date.now();
  const afterDisconnect = await request(appPort, "/api/cmf/render-preview", previewBody("after-disconnect", {}));
  assert(afterDisconnect.status === 200 && Date.now() - afterDisconnectStarted < 800, "disconnecting a client terminates its worker and releases the slot");

  const crashed = await request(appPort, "/api/cmf/render-preview", previewBody("crash", { crash: true }));
  assert(crashed.status === 500 && JSON.parse(crashed.body).code === "cmf_worker_crashed", "worker crashes are contained at the route boundary");
  const recovered = await request(appPort, "/api/cmf/render-preview", previewBody("recover", {}));
  assert(recovered.status === 200, "the server handles the next CMF request after a worker crash");

  const oversized = await request(appPort, "/api/cmf/render-preview", {
    ...previewBody("oversized", {}),
    render: { width: 5000, height: 5000 },
  });
  assert(oversized.status === 413 && JSON.parse(oversized.body).code === "cmf_dimensions_too_large", "oversized render dimensions are rejected before dispatch");
} finally {
  await stopChild(child);
}

console.log("\ncmf-worker-routes integration test passed.");
