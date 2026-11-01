// ClioCode network allowlist + package-manager caches (M9.4) — executable
// contract.
//
//   1. caches   every package-manager cache a run points out (npm, yarn, pnpm,
//               corepack, cargo, go, pip) lives inside the run's temp — the
//               profile's second writable — the run hands exactly these to the
//               engine child, and the directories exist before anything runs;
//   2. filter   ClioCode's egress filter over a local fake upstream, no
//               internet: an allowlisted host is tunnelled, a public host off
//               the list is refused 403 before anything is sent upstream, and
//               every private, loopback, link-local or otherwise non-public
//               address is refused — as a name, as an IPv4 or IPv6 literal,
//               with any port but 443, and plain HTTP is not relayed at all;
//   3. npm      `npm install` of a tiny package through the filter succeeds —
//               the registry is a local fake served over TLS with a locally
//               generated CA, the cache lands in the run's temp and not the
//               home — and a registry off the allowlist fails, unseen by the
//               upstream;
//   4. kernel   on macOS, the same install under the real Seatbelt profile
//               with only the filter's port open: it succeeds, its cache lands
//               in the temp, a direct private connection is refused by the
//               kernel and a private CONNECT target is refused by the filter.
//               sandbox-exec cannot be applied inside another sandbox; run
//               this contract from a normal shell.

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import https from "node:https";
import os from "node:os";
import path from "node:path";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("cliocode-egress");

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ais6-cliocode-egress-")));
process.env.AI_SYSTEM6_AGENT_HOME = path.join(scratch, "agent-home");
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";

const folders = require("../../apps/server/server/agent/folders.js");
const { resolveSecretPaths, resolveToolchain } = require("../../apps/server/server/cliocode/sandbox-profile.js");
const { buildCodeSandboxProfile } = require("../../apps/server/server/cliocode/sandbox-profile.js");
const runs = require("../../apps/server/server/cliocode/runs.js");
const { CLIOCODE_ALLOWED_HOSTS, codeAllowedHosts, codeHostAllowed, startCodeEgressProxy } = require("../../apps/server/server/cliocode/egress.js");

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** Wait for a run's terminal status. */
function untilDone(runId, wanted = ["done", "error", "stopped"]) {
  return new Promise((resolve) => {
    runs.subscribe(runId, 0, (event) => {
      if (event.type === "status" && wanted.includes(event.data.state)) resolve(event.data.state);
    });
  });
}

const node = fs.realpathSync(process.execPath);
const toolchain = resolveToolchain({ node, path: process.env.PATH, home: os.homedir(), shell: process.env.SHELL, env: process.env });

// --- 1. The package-manager caches point into the run's temp -----------------

const runTmp = path.join(scratch, "run-tmp");
fs.mkdirSync(runTmp, { recursive: true });
const cacheEnv = runs.packageManagerCacheEnv(runTmp);
const DESIGN_DOC_CACHES = ["npm_config_cache", "YARN_CACHE_FOLDER", "PNPM_HOME", "npm_config_store_dir", "COREPACK_HOME", "CARGO_HOME", "GOCACHE", "GOMODCACHE", "PIP_CACHE_DIR"];
test.assert(JSON.stringify(Object.keys(runs.PACKAGE_MANAGER_CACHES).sort()) === JSON.stringify([...DESIGN_DOC_CACHES].sort()),
  "the run points out exactly the package-manager caches the design names (npm, yarn, pnpm, corepack, cargo, go, pip)");
test.assert(Object.values(cacheEnv).every((dir) => dir.startsWith(path.join(runTmp, "caches") + path.sep)),
  "every cache lives inside <run temp>/caches — the profile's second writable, so a download never needs a write outside it");
test.assert(cacheEnv.npm_config_store_dir.startsWith(`${cacheEnv.PNPM_HOME}${path.sep}`),
  "pnpm's store sits inside its PNPM_HOME, as the design spells it");
test.assert(!Object.values(cacheEnv).some((dir) => dir.startsWith(`${os.homedir()}${path.sep}`)),
  "no cache points into the writer's home: the defaults (~/.npm and friends) are outside the boundary and would be refused");

{
  // The run hands the engine child exactly these, and makes the directories.
  const project = path.join(scratch, "repo");
  fs.mkdirSync(project, { recursive: true });
  write(path.join(project, "package.json"), `${JSON.stringify({ name: "fixture", version: "1.0.0", private: true }, null, 2)}\n`);
  const grant = folders.grantFolder(project, "change");
  /** @type {any[]} */
  const seen = [];
  runs.configureRunsForTests({
    resolveKey: async () => "k-test",
    startEgress: async () => ({ port: 41077, close: async () => {} }),
    startEngine: (options) => {
      seen.push(options);
      return Promise.resolve({
        sessionId: "55555555-6666-7777-8888-999999999999",
        cwd: fs.realpathSync(options.work),
        async prompt() { return { stopReason: "end_turn" }; },
        async cancel() {},
        async close() { return { exited: true }; },
        kill() {},
      });
    },
  });
  const cacheRun = await runs.createCodeRun({ folderId: grant.id, prompt: "install deps", mode: "acceptEdits" });
  test.assert(await untilDone(cacheRun.runId) === "done", "a stub run over the grant finishes");
  const handed = seen[0];
  // The run's own temp is stateDir/tmp (server-owned, never the project);
  // every cache must sit inside it, and exactly where the helper says.
  const handedCaches = runs.packageManagerCacheEnv(handed.tmp);
  test.assert(DESIGN_DOC_CACHES.every((name) => handed.extraEnv[name] === handedCaches[name]),
    "the engine child is given exactly these cache locations through its environment");
  test.assert(Object.values(handedCaches).every((dir) => dir.startsWith(path.join(handed.tmp, "caches"))),
    "every cache handed to the engine sits inside the run's own temp");
  test.assert(Object.values(handedCaches).every((dir) => fs.existsSync(dir)),
    "the cache directories exist before anything runs, so a tool never needs to create one outside the temp");
  runs.resetRunsForTests();
  await runs.discardRun(cacheRun.runId);
}

// --- 2. The filter, over a fake upstream: admitted, refused, private ---------

const GREETING = "hello-from-fake-upstream";
/**
 * A fake upstream proxy: answers any CONNECT with 200, records the target,
 * and greets once the client speaks through the tunnel. Refused targets never
 * reach it — the filter decides first.
 */
const upstreamTargets = [];
const greetingUpstream = net.createServer((socket) => {
  socket.on("error", () => {});
  let head = "";
  let tunnelled = false;
  socket.on("data", (chunk) => {
    if (tunnelled) { socket.write(`${GREETING}\n`); return; }
    head += chunk;
    if (!head.includes("\r\n\r\n")) return;
    tunnelled = true;
    upstreamTargets.push(head.split(" ")[1]);
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
  });
});
const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(/** @type {net.AddressInfo} */ (server.address()).port));
});
const greetingPort = await listen(greetingUpstream);

/** CONNECT through a filter from this process; resolves the first reply line. */
const connectStatus = (port, target) => new Promise((resolve) => {
  const socket = net.connect({ host: "127.0.0.1", port }, () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
  let first = "";
  socket.on("data", (chunk) => {
    if (!first) {
      first = String(chunk).split("\r\n")[0];
      socket.destroy();
      resolve(first);
    }
  });
  socket.on("close", () => resolve(first || "(closed)"));
  socket.on("error", () => resolve(first || "(error)"));
  setTimeout(() => socket.destroy(), 4000);
});

const matrixFilter = await startCodeEgressProxy({ upstreamEnv: { HTTPS_PROXY: `http://127.0.0.1:${greetingPort}` } });
/** The host names the fake upstream was asked for (trailing dots normalised). */
const upstreamHosts = () => new Set(upstreamTargets.map((target) => target.split(":")[0].replace(/\.$/, "")));
{
  const admitted = [
    ...CLIOCODE_ALLOWED_HOSTS.filter((host) => !host.startsWith("*.")),
    "a.npmjs.org", // *.npmjs.org
    "gist.githubusercontent.com", // *.githubusercontent.com
  ];
  for (const host of admitted) {
    const status = await connectStatus(matrixFilter.port, `${host}:443`);
    test.assert(/^HTTP\/1\.1 200/.test(status) && upstreamHosts().has(host), `the filter tunnels the allowlisted ${host}:443 to the upstream (${status})`);
  }
  const dotted = await connectStatus(matrixFilter.port, "registry.npmjs.org.:443");
  test.assert(/^HTTP\/1\.1 200/.test(dotted) && upstreamHosts().has("registry.npmjs.org"), `a trailing dot is the same name (${dotted})`);
  const refused = [
    // Public hosts off the list (and the parent domains a wildcard would not cover).
    "example.com:443", "api.deepseek.com:443", "npmjs.org:443", "githubusercontent.com:443",
    "evilgithub.com:443", "github.com.evil.example:443", "registry.npmjs.org.evil.example:443",
    // Private, loopback, link-local, shared and otherwise non-public addresses.
    "127.0.0.1:443", "10.0.0.5:443", "172.16.0.9:443", "192.168.1.10:443", "169.254.169.254:443",
    "100.64.0.1:443", "198.18.0.1:443", "224.0.0.1:443", "0.0.0.0:443", "240.0.0.1:443",
    "[::1]:443", "[fe80::1]:443", "[fc00::1]:443", "[::ffff:127.0.0.1]:443", "[::ffff:10.0.0.5]:443",
    "localhost:443", "npm.local:443", "host.internal:443",
    // Every port but 443.
    "registry.npmjs.org:80", "registry.npmjs.org:8443", "github.com:22", "github.com:9418",
  ];
  for (const target of refused) {
    const status = await connectStatus(matrixFilter.port, target);
    test.assert(/^HTTP\/1\.1 403/.test(status), `the filter refuses CONNECT ${target} with 403 (${status})`);
  }
  test.assert(upstreamTargets.every((target) => !refused.includes(target)),
    "every refusal happened in the filter: the fake upstream never saw a refused target");
  const plainHttp = await new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: matrixFilter.port }, () => socket.write("GET http://registry.npmjs.org/ HTTP/1.1\r\nHost: registry.npmjs.org\r\n\r\n"));
    let first = "";
    socket.on("data", (chunk) => { if (!first) { first = String(chunk).split("\r\n")[0]; socket.destroy(); resolve(first); } });
    socket.on("error", () => resolve(first || "(error)"));
    setTimeout(() => socket.destroy(), 3000);
  });
  test.assert(/^HTTP\/1\.1 405/.test(plainHttp), `a plain-HTTP absolute-form request is not relayed at all (${plainHttp})`);
}

// Without an upstream the filter resolves names itself: a name that resolves
// private (localhost) and every private literal are refused. No allowlisted
// host is CONNECTed here — that would leave for the real internet.
{
  const bareFilter = await startCodeEgressProxy({});
  for (const target of ["localhost:443", "127.0.0.1:443", "192.168.1.10:443", "[::1]:443"]) {
    const status = await connectStatus(bareFilter.port, target);
    test.assert(/^HTTP\/1\.1 403/.test(status), `a filter with no upstream still refuses a private address (${target}: ${status})`);
  }
  await bareFilter.close();
}

// --- 3. npm install through the filter, from a fake registry -----------------

// The fixture: a real one-package tarball, a TLS server answering as
// registry.npmjs.org, and a CA the client is told to trust — all local.
const caDir = path.join(scratch, "ca");
fs.mkdirSync(caDir, { recursive: true });
const caPem = path.join(caDir, "ca.pem");
const srvKey = path.join(caDir, "srv.key");
const srvPem = path.join(caDir, "srv.pem");
function opensslWorks(bin) {
  const gen = spawnSync(bin, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(caDir, "ca.key"), "-out", caPem, "-days", "2", "-subj", "/CN=cliocode-egress-contract-ca", "-addext", "basicConstraints=critical,CA:TRUE"], { encoding: "utf8" });
  return gen.status === 0 && fs.existsSync(caPem);
}
const opensslBin = ["/opt/homebrew/bin/openssl", "/usr/local/bin/openssl", "openssl", "/usr/bin/openssl"].find((bin) => {
  try { return spawnSync(bin, ["version"], { encoding: "utf8" }).status === 0 && opensslWorks(bin); } catch { return false; }
});
test.assert(Boolean(opensslBin), `a usable openssl generated the local CA (${opensslBin || "none found"})`);
if (opensslBin) {
  const csr = spawnSync(opensslBin, ["req", "-newkey", "rsa:2048", "-nodes", "-keyout", srvKey, "-out", path.join(caDir, "srv.csr"), "-subj", "/CN=registry.npmjs.org"], { encoding: "utf8" });
  write(path.join(caDir, "srv.ext"), "subjectAltName=DNS:registry.npmjs.org\n");
  const signed = spawnSync(opensslBin, ["x509", "-req", "-in", path.join(caDir, "srv.csr"), "-CA", caPem, "-CAkey", path.join(caDir, "ca.key"), "-CAcreateserial", "-out", srvPem, "-days", "2", "-extfile", path.join(caDir, "srv.ext")], { encoding: "utf8" });
  test.assert(csr.status === 0 && signed.status === 0, "the fake registry's certificate is signed for registry.npmjs.org by the local CA");
}

const pkgRoot = path.join(scratch, "tiny", "package");
write(path.join(pkgRoot, "package.json"), `${JSON.stringify({ name: "tiny", version: "1.0.0", description: "the smallest package", main: "index.js" })}\n`);
write(path.join(pkgRoot, "index.js"), "module.exports = 1;\n");
const tgz = path.join(scratch, "tiny-1.0.0.tgz");
const tarRan = spawnSync("tar", ["-czf", tgz, "-C", path.dirname(pkgRoot), "package"], { encoding: "utf8" });
test.assert(tarRan.status === 0, "the fixture tarball builds");
const tarball = fs.readFileSync(tgz);
const shasum = crypto.createHash("sha1").update(tarball).digest("hex");
const integrity = `sha512-${crypto.createHash("sha512").update(tarball).digest("base64")}`;
const packument = {
  id: "tiny",
  name: "tiny",
  "dist-tags": { latest: "1.0.0" },
  versions: {
    "1.0.0": {
      id: "tiny@1.0.0",
      name: "tiny",
      version: "1.0.0",
      description: "the smallest package",
      main: "index.js",
      dist: { integrity, shasum, tarball: "https://registry.npmjs.org/tiny/-/tiny-1.0.0.tgz", fileCount: 2, unpackedSize: tarball.length },
    },
  },
};

/** @type {string[]} */
const registryHits = [];
const registry = https.createServer({ key: fs.readFileSync(srvKey), cert: fs.readFileSync(srvPem) }, (req, res) => {
  registryHits.push(String(req.url));
  if (req.url === "/tiny") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(packument));
    return;
  }
  if (req.url === "/tiny/-/tiny-1.0.0.tgz") {
    res.writeHead(200, { "content-type": "application/x-tar" });
    res.end(tarball);
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end("{}\n");
});
const registryPort = await listen(registry);

/**
 * The fake upstream for the npm legs: a real CONNECT relay — an allowlisted
 * registry target is tunnelled to the local TLS registry, anything else is
 * refused 502 (the filter should never send it).
 */
const relayTargets = [];
const relay = net.createServer((socket) => {
  socket.on("error", () => {});
  let head = Buffer.alloc(0);
  /** @param {Buffer} chunk */
  const onData = (chunk) => {
    head = Buffer.concat([head, chunk]);
    const end = head.indexOf("\r\n\r\n");
    if (end < 0) return;
    socket.removeListener("data", onData);
    socket.pause();
    const target = String(head.subarray(0, end).toString("latin1").split("\r\n")[0] || "").split(" ")[1] || "";
    relayTargets.push(target);
    const tunnel = net.connect({ host: "127.0.0.1", port: registryPort });
    tunnel.on("error", () => socket.destroy());
    const rest = head.subarray(end + 4);
    tunnel.on("connect", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (rest.length) tunnel.write(rest);
      socket.pipe(tunnel);
      tunnel.pipe(socket);
      socket.resume();
    });
  };
  socket.on("data", onData);
});
const relayPort = await listen(relay);

const npmFilter = await startCodeEgressProxy({ upstreamEnv: { HTTPS_PROXY: `http://127.0.0.1:${relayPort}` } });
const baseEnv = { ...process.env };
for (const name of ["ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy", "NODE_TEST_CONTEXT"]) delete baseEnv[name];
// An inherited npm setting in either case (the release's self-test sets
// NPM_CONFIG_CACHE) would outrank the run's own; the run starts without them.
for (const name of Object.keys(baseEnv)) if (/^npm_config_/i.test(name)) delete baseEnv[name];
const tail = (/** @type {{ stderr?: string, stdout?: string }} */ result) => `${result.stderr}${result.stdout}`.trim().split("\n").slice(-3).join(" | ");
/**
 * Run a child ASYNC: the fake registry, the relay and the filter live in this
 * process, and a synchronous spawn would block the event loop they answer on
 * (a synchronous npm through this chain hangs on its first CONNECT).
 * @param {string[]} argv
 * @param {{ cwd: string, env: NodeJS.ProcessEnv, timeoutMs?: number }} options
 */
const runAsync = (argv, options) => new Promise((resolve) => {
  const child = spawn(argv[0], argv.slice(1), { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 120_000);
  timer.unref?.();
  child.on("error", () => { clearTimeout(timer); resolve({ status: -1, stdout, stderr }); });
  child.on("close", (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
});

{
  const npmProject = path.join(scratch, "npm-project");
  fs.mkdirSync(npmProject, { recursive: true });
  write(path.join(npmProject, "package.json"), `${JSON.stringify({ name: "fixture", version: "1.0.0", private: true }, null, 2)}\n`);
  const npmHome = path.join(scratch, "npm-home");
  fs.mkdirSync(npmHome, { recursive: true });
  const npmCache = path.join(runTmp, "caches", "npm");
  const proxy = `http://127.0.0.1:${npmFilter.port}`;
  const npmEnv = {
    ...baseEnv,
    PATH: toolchain.path,
    HOME: npmHome,
    TMPDIR: `${runTmp}/`,
    HTTPS_PROXY: proxy,
    https_proxy: proxy,
    HTTP_PROXY: proxy,
    http_proxy: proxy,
    NO_PROXY: "localhost,127.0.0.1,::1",
    npm_config_cache: npmCache,
    npm_config_registry: "https://registry.npmjs.org",
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
    NODE_EXTRA_CA_CERTS: caPem,
  };
  const install = await runAsync(["npm", "install", "tiny"], { cwd: npmProject, env: npmEnv, timeoutMs: 120_000 });
  test.assert(install.status === 0, `npm install tiny succeeds through the filter (status ${install.status}; ${tail(install)})`);
  let installed = "";
  try { installed = JSON.parse(fs.readFileSync(path.join(npmProject, "node_modules", "tiny", "package.json"), "utf8")).version; } catch {}
  test.assert(installed === "1.0.0", "the installed package landed in node_modules as the fake registry served it");
  test.assert(registryHits.includes("/tiny") && registryHits.includes("/tiny/-/tiny-1.0.0.tgz"),
    "the packument and the tarball were both fetched through the filter");
  test.assert(fs.existsSync(path.join(npmCache, "_cacache", "content-v2")), "npm's cache landed in the run's temp (npm_config_cache), not the default");
  test.assert(!fs.existsSync(path.join(npmHome, ".npm")), "nothing was written to the home's default cache (~/.npm)");
  test.assert(relayTargets.every((target) => target === "registry.npmjs.org:443"),
    "only the allowlisted registry name ever reached the fake upstream");
  test.assert(codeHostAllowed("registry.npmjs.org") && !codeHostAllowed("example.com"),
    "the run's allowHost check agrees with the filter (an allowlisted host yes, a random host no)");

  // The same install, pointed at a registry off the allowlist: it fails, and
  // the fake upstream never saw the host.
  const offProject = path.join(scratch, "npm-project-offlist");
  fs.mkdirSync(offProject, { recursive: true });
  write(path.join(offProject, "package.json"), `${JSON.stringify({ name: "fixture", version: "1.0.0", private: true }, null, 2)}\n`);
  const offInstall = await runAsync(["npm", "install", "left-pad"], { cwd: offProject, env: { ...npmEnv, npm_config_registry: "https://example.com/npm" }, timeoutMs: 120_000 });
  test.assert(offInstall.status !== 0 && !fs.existsSync(path.join(offProject, "node_modules")),
    `a registry off the allowlist fails through the same proxy env (status ${offInstall.status}; ${tail(offInstall)})`);
  test.assert(!relayTargets.includes("example.com:443"),
    "the off-list registry never reached the fake upstream: the filter refused it first");
}

// --- 4. Kernel: the same install under the real Seatbelt profile -------------

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
if (!opensslBin) {
  test.fail("no usable openssl, so the fake registry could not be served; the kernel leg was skipped");
} else if (process.platform === "darwin" && fs.existsSync(SANDBOX_EXEC)) {
  const probe = spawnSync(SANDBOX_EXEC, ["-p", "(version 1)(allow default)", "/usr/bin/true"], { encoding: "utf8" });
  if (probe.status !== 0) {
    test.fail(`sandbox-exec cannot apply a profile here (${String(probe.stderr || "").trim()}): this shell is itself sandboxed and Seatbelt refuses a nested apply — run node tests/features/cliocode-egress.test.mjs from a normal shell (controller: hand it to Claude)`);
  } else {
    await kernelLeg();
  }
} else {
  test.ok("sandbox-exec is macOS only; the kernel probes are skipped on this platform");
}

async function kernelLeg() {
  const kernelProject = path.join(scratch, "kernel-project");
  fs.mkdirSync(kernelProject, { recursive: true });
  write(path.join(kernelProject, "package.json"), `${JSON.stringify({ name: "fixture", version: "1.0.0", private: true }, null, 2)}\n`);
  const kernelCache = path.join(runTmp, "kernel-npm-cache");
  const realHome = fs.realpathSync(os.homedir());
  const profile = buildCodeSandboxProfile({
    project: kernelProject,
    tmp: runTmp,
    home: realHome,
    node,
    secretPaths: resolveSecretPaths(realHome),
    execLiterals: toolchain.literals,
    execRoots: toolchain.roots,
    loopbackPorts: [npmFilter.port],
  });
  const proxy = `http://127.0.0.1:${npmFilter.port}`;
  const env = {
    ...baseEnv,
    PATH: toolchain.path,
    HOME: realHome,
    TMPDIR: `${runTmp}/`,
    HTTPS_PROXY: proxy,
    https_proxy: proxy,
    HTTP_PROXY: proxy,
    http_proxy: proxy,
    NO_PROXY: "localhost,127.0.0.1,::1",
    npm_config_cache: kernelCache,
    npm_config_registry: "https://registry.npmjs.org",
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
    NODE_EXTRA_CA_CERTS: caPem,
  };
  const install = await runAsync([SANDBOX_EXEC, "-p", profile, "npm", "install", "tiny"], { cwd: kernelProject, env, timeoutMs: 180_000 });
  let installed = "";
  try { installed = JSON.parse(fs.readFileSync(path.join(kernelProject, "node_modules", "tiny", "package.json"), "utf8")).version; } catch {}
  test.assert(install.status === 0 && installed === "1.0.0",
    `under the real kernel, npm install tiny succeeds through the one open port — the filter (${install.status === 0 ? "installed" : `status ${install.status}; ${tail(install)}`})`);
  test.assert(fs.existsSync(path.join(kernelCache, "_cacache", "content-v2")), "the kernel run's npm cache landed in the run's temp");
  const connectScript = (host, port) => `const s=require("net").connect(${port},${JSON.stringify(host)});`
    + 's.on("connect",()=>{console.log("CONNECTED");process.exit(0)});'
    + 's.on("error",e=>{console.log(e.code||e.message);process.exit(3)});'
    + 'setTimeout(()=>{console.log("TIMEOUT");process.exit(4)},4000);';
  const directPrivate = await runAsync([SANDBOX_EXEC, "-p", profile, node, "-e", connectScript("127.0.0.1", registryPort)], { cwd: kernelProject, env, timeoutMs: 30_000 });
  test.assert(directPrivate.stdout.trim() === "EPERM", `the kernel refuses a direct connection to a private address (${directPrivate.stdout.trim()})`);
  const tunnelScript = `const s=require("net").connect(${npmFilter.port},"127.0.0.1",()=>s.write("CONNECT 127.0.0.1:443 HTTP/1.1\\r\\nHost: 127.0.0.1:443\\r\\n\\r\\n"));`
    + 'let b="";s.on("data",d=>{b+=d;if(b.includes("\\r\\n")){console.log(b.split("\\r\\n")[0]);process.exit(0)}});'
    + 's.on("error",e=>{console.log(e.code||e.message);process.exit(3)});'
    + 'setTimeout(()=>{console.log("TIMEOUT");process.exit(4)},4000);';
  const tunnelledPrivate = await runAsync([SANDBOX_EXEC, "-p", profile, node, "-e", tunnelScript], { cwd: kernelProject, env, timeoutMs: 30_000 });
  test.assert(/^HTTP\/1\.1 403/.test(tunnelledPrivate.stdout.trim()), `from inside the sandbox, a private CONNECT target is refused by the filter (${tunnelledPrivate.stdout.trim()})`);
}

await npmFilter.close();
await matrixFilter.close();
greetingUpstream.close();
registry.closeAllConnections?.();
registry.close();
relay.close();
fs.rmSync(scratch, { recursive: true, force: true });
test.finish();
