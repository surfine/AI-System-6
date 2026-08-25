// Shared harness for tools that drive the real app in a browser.
//
// screenshot-window-coverage.mjs and appearance-snapshot.mjs both need the
// same three things: a server on a free port, a readiness probe, and a clean
// shutdown. The logic lived inline in the first tool; it moved here unchanged
// when the second one needed it.

import { spawn } from "node:child_process";
import { get } from "node:http";
import { createServer } from "node:net";

function httpReady(url) {
  return new Promise((resolveReady) => {
    const request = get(url, (response) => {
      response.resume();
      resolveReady(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on("error", () => resolveReady(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolveReady(false);
    });
  });
}

async function freePort() {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const resolved = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(resolved));
    });
  });
}

export async function startAppServer(root) {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["apps/server/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const started = Date.now();
  while (Date.now() - started < 12000) {
    if (await httpReady(url)) return { child, url, output: () => output };
    if (child.exitCode !== null) break;
    await new Promise((wait) => setTimeout(wait, 150));
  }
  child.kill("SIGTERM");
  throw new Error(`App server did not become ready.\n${output.trim()}`);
}

export async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolveStop();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill("SIGTERM");
  });
}
