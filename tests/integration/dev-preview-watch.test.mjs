// The development preview watches the inputs that can change what it serves.
//
// `npm run dev` builds once, serves, and then has to keep up: a stylesheet or a
// JavaScript edit rebuilds what it feeds, a backend edit restarts only the
// server this preview started, and a dependency change is reported rather than
// silently papered over. The case that motivated the derived watch set is
// `apps/desktop/app.js` — a boot input that lives beside the app directory, so a
// watch built from directory names alone never saw it.
//
// This runs the real preview against the real server and edits the real files,
// because the wiring being checked is the wiring between a filesystem event and
// a child process. It runs against the working tree, so every edit is a touch:
// the builder decides by content, so nothing is rewritten and the tree is left
// as it was found.

import { spawn } from "node:child_process";
import { utimesSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`OK  dev-preview-watch: ${message}`);
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

const port = await reservePort();
const lines = [];
const preview = spawn(process.execPath, ["tooling/dev-preview.mjs"], {
  cwd: root,
  env: { ...process.env, DEV_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
const collect = (chunk) => {
  for (const line of chunk.toString().split("\n")) if (line.trim()) lines.push(line);
};
preview.stdout.on("data", collect);
preview.stderr.on("data", collect);

const matching = (pattern) => lines.filter((line) => pattern.test(line));
const touch = (relativePath) => {
  const now = new Date();
  utimesSync(path.join(root, relativePath), now, now);
};
const waitFor = async (pattern, timeoutMs, label) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const hits = matching(pattern);
    if (hits.length) return hits[hits.length - 1];
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for ${label}; log:\n${matching(/\[dev\]/).join("\n")}`);
};
const serving = () => new Promise((resolve) => {
  const request = http.get({ host: "127.0.0.1", port, path: "/api/version" }, (response) => {
    response.resume();
    resolve(response.statusCode === 200);
  });
  request.on("error", () => resolve(false));
  request.setTimeout(2000, () => { request.destroy(); resolve(false); });
});
const pidOf = (line) => Number(String(line || "").match(/pid (\d+)/)?.[1] || 0);

let exitCode = 0;
try {
  await waitFor(/serving http:\/\/127\.0\.0\.1/, 120_000, "the preview to serve");
  assert(await serving(), "the preview serves the real server once its first build succeeds");
  assert(
    matching(/\[prebuild\] complete/).length > 0,
    "the first start fills the generated vendor bundles a fresh checkout is missing"
  );

  touch("apps/desktop/app.js");
  const rootAppLine = await waitFor(/app\.js .*→ building/, 20_000, "a rebuild after the root app.js changed");
  assert(!!rootAppLine, "editing apps/desktop/app.js rebuilds — the input that a directory watch missed");
  await waitFor(/build ok/, 30_000, "that rebuild to finish");

  const buildsAfterStyles = matching(/→ building/).length;
  touch("apps/desktop/styles/10-windows.css");
  await waitFor(/10-windows\.css .*→ building/, 20_000, "a rebuild after a stylesheet changed");
  assert(
    matching(/→ building/).length > buildsAfterStyles,
    "editing a stylesheet rebuilds too"
  );
  await waitFor(/build ok/, 30_000, "the stylesheet rebuild to finish");

  const startedPid = pidOf(matching(/server start/).pop());
  touch("apps/server/server.js");
  const restartLine = await waitFor(/server restarted/, 20_000, "a restart after the backend source changed");
  const restartedPid = pidOf(restartLine);
  assert(restartedPid > 0 && restartedPid !== startedPid, "a backend edit replaces the server process");
  await new Promise((resolve) => setTimeout(resolve, 2000));
  assert(await serving(), "and the preview is serving again after the restart");

  // A quiet desk stays quiet: nothing here may rebuild on its own writes.
  const before = lines.length;
  await new Promise((resolve) => setTimeout(resolve, 3000));
  assert(lines.length === before, `no build fires when nothing changed (${lines.slice(before).length} late lines)`);

  touch("package.json");
  await waitFor(/installed dependencies are NOT updated/, 15_000, "the dependency notice");
  assert(
    matching(/\[dev\] build/).length === matching(/→ building/).length,
    "a dependency change is reported instead of pretending an install happened"
  );
} catch (error) {
  console.error(error.message);
  exitCode = 1;
} finally {
  preview.kill("SIGTERM");
  await new Promise((resolve) => {
    preview.once("exit", resolve);
    setTimeout(resolve, 5000);
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const stillServing = await serving();
  console.log(`[dev] log:\n${matching(/\[dev\]/).map((line) => `   ${line}`).join("\n")}`);
  assert(!stillServing, "stopping the preview leaves nothing serving");
  assert(preview.exitCode !== null, "and the preview process itself exits");
}

if (exitCode !== 0) process.exit(exitCode);
console.log("\ndev-preview-watch integration test passed.");
