// The disposable container one cloud run's engine lives in.
//
// The argv is built by one pure function so a contract can read every flag.
// What the container gets, and nothing more:
//
//   - the sandbox image (platform/web/agent-sandbox/Dockerfile): node, the
//     slim dsh verified against its MANIFEST, the patch set, the runner;
//   - two bind mounts, both under this run's own directory: the workspace
//     (/work, read-write, the engine's cwd) and the proxy socket directory
//     (/run/ais6, read-only). No other host path;
//   - a read-only root filesystem, two small noexec tmpfs (/tmp for dsh's
//     hard-coded writable root, /opt/engine for DSH_HOME), a non-root user,
//     no capabilities, no-new-privileges, a private cgroup namespace,
//     pids/memory/CPU/nofile limits, and the runtime's default seccomp
//     profile (no seccomp flag: `seccomp=builtin` could not be confirmed
//     against the CLI on the host, and leaving it out keeps the default);
//   - no network at all (--network=none): its only way out is the proxy socket,
//     which the runner exposes inside the container on 127.0.0.1:8787;
//   - one secret-shaped variable, DEEPSEEK_API_KEY, whose value is the run's
//     proxy token, never a model key. It is passed by name (`--env NAME`), so
//     the value is in the CLI's environment, not in argv or `ps`.
//
// The container is started with --rm and is also removed by name on stop,
// timeout and by the janitor, which sweeps every container labelled
// ais6.agent-cloud at boot and once a minute. Every CLI call but the attached
// `docker run` is async with a timeout: the server keeps answering while the
// daemon is slow.

"use strict";

const { execFile, spawn } = require("node:child_process");
const { containerLimits, sandboxSettings } = require("./config.js");

const LABEL = "ais6.agent-cloud";
const CONTAINER_USER = "10001:10001";
const WORK_MOUNT = "/work";
const SOCKET_MOUNT = "/run/ais6";
const ENGINE_HOME = "/opt/engine";
const PROXY_PORT_INSIDE = 8787;

/** @param {string} value */
function assertPlainPath(value) {
  // A bind source with a comma would split --mount's key=value list.
  if (!value || !value.startsWith("/") || /[,\n\r\0]/.test(value)) {
    throw new Error(`Unsafe mount path: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * @typedef {object} ContainerSpec
 * @property {string} runId
 * @property {string} workDir      host path of the run's workspace
 * @property {string} socketDir    host path of the directory holding proxy.sock
 * @property {number} deadlineMs   epoch ms after which the janitor removes it
 * @property {string} [image]
 * @property {string} [userns]
 */

/**
 * The complete `docker run` argv (without the binary). Pure.
 * @param {ContainerSpec} spec
 * @returns {string[]}
 */
function buildRunArgs(spec) {
  if (!/^run-[a-f0-9-]{36}$/.test(String(spec.runId || ""))) throw new Error("Bad run id for a container name.");
  const limits = containerLimits();
  const settings = sandboxSettings();
  const image = spec.image || settings.image;
  const userns = spec.userns ?? settings.userns;
  const args = [
    "run",
    "--rm",
    "-i",
    "--init",
    "--name", containerName(spec.runId),
    "--label", `${LABEL}=1`,
    "--label", `ais6.run=${spec.runId}`,
    "--label", `ais6.deadline=${Math.floor(Number(spec.deadlineMs) || 0)}`,
    "--pull=never",
    "--read-only",
    "--user", CONTAINER_USER,
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true",
    // Docker's built-in profile, named so the flag cannot fall back to a file path (verified on the VPS daemon, 29.9).
    "--security-opt=seccomp=builtin",
    "--cgroupns=private",
    "--network=none",
    "--ipc=none",
    "--pids-limit", String(limits.pids),
    "--memory", limits.memory,
    "--memory-swap", limits.memory,
    "--cpus", limits.cpus,
    "--ulimit", `nofile=${limits.nofile}:${limits.nofile}`,
    "--ulimit", "core=0:0",
    "--stop-timeout", "5",
    "--log-driver=none",
    "--tmpfs", `/tmp:rw,noexec,nosuid,nodev,size=${limits.tmpSize},mode=1777`,
    "--tmpfs", `${ENGINE_HOME}:rw,noexec,nosuid,nodev,size=${limits.homeSize},uid=10001,gid=10001,mode=0700`,
    "--mount", `type=bind,source=${assertPlainPath(spec.workDir)},target=${WORK_MOUNT}`,
    "--mount", `type=bind,source=${assertPlainPath(spec.socketDir)},target=${SOCKET_MOUNT},readonly`,
    "--workdir", WORK_MOUNT,
    "--env", `HOME=${ENGINE_HOME}`,
    "--env", `DSH_HOME=${ENGINE_HOME}/.dsh`,
    "--env", "TMPDIR=/tmp/",
    "--env", "LANG=C.UTF-8",
    "--env", "DSH_TELEMETRY_MODE=DISABLED",
    "--env", "NODE_OPTIONS=--max-old-space-size=320",
    "--env", `AIS6_PROXY_SOCKET=${SOCKET_MOUNT}/proxy.sock`,
    "--env", `AIS6_PROXY_PORT=${PROXY_PORT_INSIDE}`,
    // By name only: the value (the run's proxy token) comes from the CLI's env.
    "--env", "DEEPSEEK_API_KEY",
  ];
  if (userns) args.push(`--userns=${userns}`);
  args.push(image);
  return args;
}

/** @param {string} runId */
function containerName(runId) {
  return `ais6-agent-${runId}`;
}

/**
 * The CLI's own environment: just enough to find the daemon, plus the token
 * the container reads by name.
 * @param {string} token
 */
function cliEnvironment(token) {
  const settings = sandboxSettings();
  /** @type {Record<string, string>} */
  const env = {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: process.env.HOME || "/nonexistent",
    DEEPSEEK_API_KEY: token,
  };
  if (settings.dockerHost) env.DOCKER_HOST = settings.dockerHost;
  if (process.env.XDG_RUNTIME_DIR) env.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR;
  return env;
}

const CLI_TIMEOUT_MS = 20_000;

/**
 * Run one CLI command to completion. Never rejects.
 * @param {string[]} args
 * @returns {Promise<{ status: number | null, stdout: string, stderr: string, error?: Error }>}
 */
function defaultRunCli(args) {
  const settings = sandboxSettings();
  return new Promise((resolve) => {
    execFile(settings.cli, args, { env: cliEnvironment(""), encoding: "utf8", timeout: CLI_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const code = /** @type {any} */ (error)?.code;
      if (error && typeof code !== "number") {
        resolve({ status: null, stdout: String(stdout || ""), stderr: String(stderr || ""), error });
        return;
      }
      resolve({ status: error ? Number(code) : 0, stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

/** Seams so contracts drive a fake CLI. */
const seams = {
  spawn,
  /** @type {(args: string[]) => Promise<{ status: number | null, stdout: string, stderr: string, error?: Error }> | { status: number | null, stdout: string, stderr?: string, error?: Error }} */
  runCli: defaultRunCli,
};

/**
 * Start the container attached (ACP on its stdin/stdout).
 * @param {ContainerSpec & { token: string }} spec
 */
function startContainer(spec) {
  const settings = sandboxSettings();
  return seams.spawn(settings.cli, buildRunArgs(spec), {
    env: cliEnvironment(spec.token),
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** @param {string[]} args */
async function runCli(args) {
  try {
    return await seams.runCli(args);
  } catch (error) {
    return { status: null, stdout: "", stderr: "", error: /** @type {Error} */ (error) };
  }
}

/**
 * Remove a container by name. True once it is gone: removed now, or already
 * gone (--rm got there first). Never throws.
 * @param {string} name
 */
async function removeByName(name) {
  const result = await runCli(["rm", "-f", name]);
  if (result.status === 0) return true;
  return /no such container/i.test(`${result.stderr || ""}${result.stdout || ""}`);
}

/**
 * Remove a run's container whatever its state. Resolves true only when the
 * container is gone; runs.js keeps the run "stopping" until it is.
 * @param {string} runId
 */
function removeContainer(runId) {
  return removeByName(containerName(runId));
}

/**
 * Every labelled container, with its run id and deadline.
 * @returns {Promise<Array<{ name: string, runId: string, deadlineMs: number }>>}
 */
async function listSandboxContainers() {
  const result = await runCli([
    "ps", "-a",
    "--filter", `label=${LABEL}=1`,
    "--format", '{{.Names}}\t{{.Label "ais6.run"}}\t{{.Label "ais6.deadline"}}',
  ]);
  if (!result || result.status !== 0) return [];
  return String(result.stdout || "").split("\n").filter(Boolean).map((line) => {
    const [name, runId, deadline] = line.split("\t");
    return { name, runId: String(runId || ""), deadlineMs: Number(deadline) || 0 };
  });
}

/**
 * Remove every sandbox container that is not a live run of this process, and
 * every one past its deadline. Returns the names removed.
 * @param {Set<string>} liveRunIds
 * @param {number} [now]
 */
async function sweepContainers(liveRunIds, now = Date.now()) {
  const removed = [];
  for (const entry of await listSandboxContainers()) {
    if (liveRunIds.has(entry.runId) && (!entry.deadlineMs || entry.deadlineMs > now)) continue;
    if (await removeByName(entry.name)) removed.push(entry.name);
  }
  return removed;
}

/**
 * Is the container runtime there, and does it hold the image? Cached briefly;
 * concurrent callers share one CLI call.
 * @returns {Promise<{ ready: boolean, reason: string }>}
 */
let readinessCache = { at: 0, value: { ready: false, reason: "unchecked" } };
/** @type {Promise<{ ready: boolean, reason: string }> | null} */
let readinessPending = null;
async function sandboxReadiness(now = Date.now()) {
  if (now - readinessCache.at < 60_000) return readinessCache.value;
  if (readinessPending) return readinessPending;
  const settings = sandboxSettings();
  readinessPending = (async () => {
    const result = await runCli(["image", "inspect", "--format", "{{.Id}}", settings.image]);
    const value = result?.error ? { ready: false, reason: "runtime_missing" }
      : result?.status !== 0 ? { ready: false, reason: "image_missing" }
        : { ready: true, reason: "" };
    readinessCache = { at: now, value };
    return value;
  })();
  try {
    return await readinessPending;
  } finally {
    readinessPending = null;
  }
}

function configureContainerForTests(overrides = {}) {
  Object.assign(seams, overrides);
  readinessCache = { at: 0, value: { ready: false, reason: "unchecked" } };
  readinessPending = null;
}

module.exports = {
  CONTAINER_USER,
  LABEL,
  PROXY_PORT_INSIDE,
  SOCKET_MOUNT,
  WORK_MOUNT,
  buildRunArgs,
  cliEnvironment,
  configureContainerForTests,
  containerName,
  listSandboxContainers,
  removeContainer,
  sandboxReadiness,
  startContainer,
  sweepContainers,
};
