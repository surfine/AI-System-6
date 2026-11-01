// Lifecycle of wrapper-lite, the lossless decryption service behind
// apple-music-downloader. It is an x86 QEMU guest: 1–3 minutes to boot and
// about 1 GB of memory, so it is woken on demand and never left running for
// nothing.
//
// Rules (spec §7):
// - wake only when a lossless job needs it and autostart is not disabled;
// - stop only an instance this server started (it holds our pid file), after
//   20 idle minutes or when this server exits;
// - never touch an instance the writer started themselves;
// - never collect an Apple ID: logging in stays in the writer's terminal.

"use strict";

const { spawn } = require("node:child_process");
const { promises: fs, openSync, closeSync, rmSync } = require("node:fs");
const path = require("node:path");

const WAKE_TIMEOUT_MS = 180 * 1000;
const WAKE_POLL_MS = 2000;
const IDLE_STOP_MS = 20 * 60 * 1000;
const STATUS_TIMEOUT_MS = 2500;

let ownedChild = null;
let wakePromise = null;
let idleTimer = null;
let exitHooked = false;

function autostartEnabled() {
  return process.env.AI_SYSTEM6_WRAPPER_AUTOSTART !== "0";
}

/**
 * Ask wrapper-lite for its status.
 *
 * `reachable` is false when nothing answers. `loggedIn` is false when it
 * answers without any region it can serve — how an instance without an
 * Apple ID reports itself — and null when the reply has an unfamiliar shape.
 *
 * @param {string} liteUrl
 * @returns {Promise<{ reachable: boolean, loggedIn: boolean | null, regions: string[] }>}
 */
async function wrapperStatus(liteUrl) {
  if (!liteUrl) return { reachable: false, loggedIn: false, regions: [] };
  try {
    const response = await fetch(`${liteUrl}/status`, {
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    /** @type {{ data?: { regions?: unknown } } | null} */
    const body = await response.json().catch(() => null);
    const regions = Array.isArray(body?.data?.regions)
      ? body.data.regions.map(String).filter(Boolean)
      : null;
    if (!response.ok) return { reachable: true, loggedIn: false, regions: [] };
    return {
      reachable: true,
      loggedIn: regions === null ? null : regions.length > 0,
      regions: regions || [],
    };
  } catch {
    return { reachable: false, loggedIn: false, regions: [] };
  }
}

function pidFile(libraryRoot) {
  return path.join(libraryRoot, "wrapper-lite.pid");
}

function logFile(libraryRoot) {
  return path.join(libraryRoot, "wrapper-lite.log");
}

function stopOwned() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const child = ownedChild;
  ownedChild = null;
  if (!child || child.exitCode !== null) return;
  try {
    // The launcher leads its own process group (detached), so the whole group
    // — launcher and QEMU — stops together.
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
}

// server.js drains on SIGINT/SIGTERM and then calls process.exit, so "exit"
// is the one place every shutdown path passes through. Only synchronous work
// runs there.
function hookExit(libraryRoot) {
  if (exitHooked) return;
  exitHooked = true;
  process.once("exit", () => {
    stopOwned();
    try {
      rmSync(pidFile(libraryRoot), { force: true });
    } catch {}
  });
}

/**
 * Make sure wrapper-lite answers, waking it when this server may.
 *
 * @param {{ liteUrl: string, wrapperLauncher: string, qemu: string }} tools
 * @param {string} libraryRoot
 * @param {(state: string) => void} [onState] Called with "waking" before a boot.
 * @returns {Promise<{ ok: boolean, code?: string, loggedIn?: boolean | null }>}
 */
async function ensureWrapperLite(tools, libraryRoot, onState = () => {}) {
  const status = await wrapperStatus(tools.liteUrl);
  if (status.reachable) {
    return status.loggedIn === false
      ? { ok: false, code: "lossless_login_required", loggedIn: false }
      : { ok: true, loggedIn: status.loggedIn };
  }
  if (!tools.wrapperLauncher || !autostartEnabled()) {
    return { ok: false, code: "lossless_unavailable" };
  }
  if (!wakePromise) {
    wakePromise = wake(tools, libraryRoot, onState).finally(() => {
      wakePromise = null;
    });
  } else {
    onState("waking");
  }
  return wakePromise;
}

async function wake(tools, libraryRoot, onState) {
  onState("waking");
  await fs.mkdir(libraryRoot, { recursive: true });
  const args = ["--memory", "1024"];
  if (tools.qemu) args.push("--qemu-bin", tools.qemu);
  let logFd = -1;
  try {
    logFd = openSync(logFile(libraryRoot), "w");
    ownedChild = spawn(tools.wrapperLauncher, args, {
      cwd: path.dirname(tools.wrapperLauncher),
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    ownedChild.unref();
    ownedChild.once("exit", () => {
      ownedChild = null;
      fs.rm(pidFile(libraryRoot), { force: true }).catch(() => {});
    });
    await fs.writeFile(pidFile(libraryRoot), String(ownedChild.pid), "utf8");
    hookExit(libraryRoot);
  } catch {
    stopOwned();
    return { ok: false, code: "lossless_unavailable" };
  } finally {
    if (logFd >= 0) closeSync(logFd);
  }

  const deadline = Date.now() + WAKE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, WAKE_POLL_MS));
    if (!ownedChild) return { ok: false, code: "lossless_unavailable" };
    const status = await wrapperStatus(tools.liteUrl);
    if (status.reachable) {
      return status.loggedIn === false
        ? { ok: false, code: "lossless_login_required", loggedIn: false }
        : { ok: true, loggedIn: status.loggedIn };
    }
  }
  stopOwned();
  return { ok: false, code: "lossless_wake_timeout" };
}

/** Call when a job that used wrapper-lite ends; restarts the idle clock. */
function noteWrapperIdle() {
  if (!ownedChild) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(stopOwned, IDLE_STOP_MS);
  idleTimer.unref?.();
}

/** Call when a job starts using wrapper-lite; holds off the idle stop. */
function noteWrapperBusy() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function ownsWrapperLite() {
  return Boolean(ownedChild);
}

module.exports = {
  autostartEnabled,
  ensureWrapperLite,
  noteWrapperBusy,
  noteWrapperIdle,
  ownsWrapperLite,
  wrapperStatus,
};
