"use strict";

// Runs with the packaged Node, not the user's shell. The process group belongs
// only to this launch; never kill a PID discovered by a port scan.
const { spawn } = require("node:child_process");
const { existsSync, writeFileSync } = require("node:fs");
const path = require("node:path");

async function supervise({ root, backendPid, env = process.env, node = process.execPath }) {
  if (!Number.isSafeInteger(backendPid) || backendPid < 2) throw new Error("Invalid shell parent");
  const entry = path.join(root, "apps/server/server.js");
  if (!existsSync(entry)) throw new Error("Packaged server is missing");
  const child = spawn(node, [entry], {
    cwd: root, detached: true, stdio: ["ignore", "inherit", "inherit"],
    env: { ...env, PORT: "4173", AI_SYSTEM6_ALLOW_LAN: "0", AI_SYSTEM6_HOST: "127.0.0.1",
      AI_SYSTEM6_SHELL_PARENT_PID: String(process.pid), AI_SYSTEM6_REQUIRE_KEYCHAIN: "1" },
  });
  let stopped = false;
  let exited = false;
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => { exited = true; resolve({ code, signal }); });
  });
  const groupSignal = (signal) => {
    if (!Number.isSafeInteger(child.pid) || child.pid < 2) return;
    try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  const stop = async () => {
    if (stopped) return completion;
    stopped = true;
    if (!exited) groupSignal("SIGTERM");
    const hard = setTimeout(() => groupSignal("SIGKILL"), 25000);
    try { return await completion; } finally { clearTimeout(hard); groupSignal("SIGKILL"); }
  };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());
  const heartbeat = setInterval(() => {
    try { process.kill(backendPid, 0); } catch { void stop(); }
  }, 500);
  const status = env.AI_SYSTEM6_SHELL_PROCESS_FILE;
  if (status) writeFileSync(status, JSON.stringify({ supervisorPid: process.pid, serverPid: child.pid }), { mode: 0o600 });
  try { return await completion; }
  finally { clearInterval(heartbeat); await stop(); }
}

if (require.main === module) {
  supervise({ root: process.argv[2], backendPid: Number(process.argv[3]) })
    .then(({ code }) => { process.exitCode = code || 0; })
    .catch(() => { console.error("Shell server failed to start."); process.exitCode = 1; });
}
module.exports = { supervise };
