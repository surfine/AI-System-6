// Shared harness for tools that drive the real app in a browser.
//
// screenshot-window-coverage.mjs and appearance-snapshot.mjs both need the
// same three things: a server on a free port, a readiness probe, and a clean
// shutdown. The logic lived inline in the first tool; it moved here unchanged
// when the second one needed it.

import { spawn, spawnSync } from "node:child_process";
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

export async function startAppServer(root, { marker = "" } = {}) {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  // apps/server/server.js never reads process.argv, so a marker argument is
  // inert to the server and exists only so a harness-owned server is
  // identifiable in `ps`; see reapStaleServers.
  const argv = ["apps/server/server.js"];
  if (marker) argv.push(marker);
  const child = spawn(process.execPath, argv, {
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

// A harness that spawns a server and is then killed (Ctrl-C, a crashed
// wrapper, a terminated CI step) leaves the server behind: stopProcess is the
// only thing that reaps it, and it never runs once the harness itself dies.
// The orphans keep their free ports and accumulate — a `census:controls`
// re-run killed mid-flight left seven of them, each holding an ephemeral
// port, all invisible to a `pgrep apps/server/server.js` that only checks the
// default 4173. This reaps the marked ones at the start of a new run, the
// same "clean before you begin" hygiene the census applies to dialogs and the
// status line. The marker argument is what keeps this a no-op for any other
// way the same server is started, and the full argv must end with the marker
// so a path or flag merely containing the text is not mistaken for it.
//
// Listing uses `ps -Ao pid=,args=` and matches in-process rather than
// `pgrep -f <marker>`: a marker is naturally written with a leading `--`, and
// pgrep reads its first non-option argument as the pattern only until that
// argument looks like an option — `pgrep -f --control-census-server` exits
// with "illegal option -- -" and finds nothing.
export function reapStaleServers(marker, { log = () => {} } = {}) {
  const reaped = [];
  try {
    const listed = spawnSync("ps", ["-Ao", "pid=,args="], { encoding: "utf8" });
    for (const line of String(listed.stdout || "").split("\n")) {
      const match = /^\s*(\d+)\s+(.*)$/.exec(line);
      if (!match) continue;
      const pid = Number(match[1]);
      if (!pid || pid === process.pid) continue;
      // Read the whole argv and check the tail, so a process that merely
      // cites the marker inside a script string is not killed.
      if (!match[2].trim().endsWith(marker)) continue;
      try {
        process.kill(pid, "SIGTERM");
        reaped.push(pid);
      } catch {
        // Already gone between the listing and the signal: nothing to reap.
      }
    }
  } catch {
    // ps absent or blocked: reaping is best-effort hygiene, never a reason to
    // fail the measurement run that is about to start.
  }
  if (reaped.length) log(`reaped ${reaped.length} stale server(s): ${reaped.join(", ")}`);
  return reaped;
}
