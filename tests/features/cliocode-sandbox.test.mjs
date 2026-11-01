// ClioCode code-folder Seatbelt profile (M9.2) and egress allowlist —
// executable contract, modelled on agent-harness.
//
//   1. profile   the SBPL rules: writes only in the project folder and the
//                run's temp, reads open but the secret stores (also where a
//                link there points), exec and executable mapping only for the
//                OS and the resolved toolchain and never for anything the run
//                can write, no lsopen, no terminal, all outbound network
//                closed but the egress filter's loopback port;
//   2. egress    ClioCode's filter admits only its allowlist (npm/yarn/pnpm
//                registries, GitHub, GitLab) and the ClioTalk engine's filter
//                still admits any public host on 443 — both shown through a
//                fake upstream proxy, no internet needed;
//   3. kernel    on macOS, the real kernel: a write outside the folder is
//                refused and inside allowed, git, node and npm run, ~/.ssh and
//                the Keychains are unreadable, a script the run wrote cannot
//                exec, a direct connection is refused and the filter's port
//                is the one way out. sandbox-exec cannot be applied inside
//                another sandbox; run this contract from a normal shell.

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("cliocode-sandbox");

const {
  SECRET_READ_DENYLIST,
  SYSTEM_EXEC_ROOTS,
  buildCodeSandboxProfile,
  resolveSecretPaths,
  resolveToolchain,
} = require("../../apps/server/server/cliocode/sandbox-profile.js");
const egress = require("../../apps/server/server/agent/egress-proxy.js");
const { CLIOCODE_ALLOWED_HOSTS, codeAllowedHosts, codeHostAllowed, startCodeEgressProxy } = require("../../apps/server/server/cliocode/egress.js");

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ais6-cliocode-sandbox-")));
const project = path.join(scratch, "repo");
const runTmp = path.join(scratch, "run-tmp");
const fakeHome = path.join(scratch, "home");
for (const dir of [project, runTmp, fakeHome]) fs.mkdirSync(dir, { recursive: true });
const node = fs.realpathSync(process.execPath);

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// --- 1. Profile --------------------------------------------------------------

const toolchain = resolveToolchain({ node, path: process.env.PATH, home: os.homedir(), shell: process.env.SHELL, env: process.env });
test.assert(toolchain.path.split(path.delimiter)[0] === path.dirname(node) && toolchain.literals.includes(node) && SYSTEM_EXEC_ROOTS.every((root) => !fs.existsSync(root) || toolchain.roots.includes(root)),
  "the toolchain is resolved on the PATH the child gets (the running Node's directory first), with the running Node and the OS roots");
test.assert(toolchain.path.split(path.delimiter).every((dir) => path.isAbsolute(dir)), "relative PATH entries are dropped");

const profileInput = { project, tmp: runTmp, home: fakeHome, node, execLiterals: toolchain.literals, execRoots: toolchain.roots, extraExec: ["/opt/dsh-install"], loopbackPorts: [21099, 0, 70000] };
const lines = buildCodeSandboxProfile(profileInput).split("\n");
const writable = `(subpath "${project}") (subpath "${runTmp}")`;
const at = (prefix) => lines.findIndex((line) => line.startsWith(prefix));
test.assert(lines.includes("(deny file-write*)") && lines.includes(`(allow file-write* ${writable} (literal "/dev/null") (regex #"^/dev/fd/"))`) && at("(deny file-write*") < at("(allow file-write*"),
  "writes are denied everywhere, then allowed back only in the project folder, the run's temp, /dev/null and /dev/fd");
test.assert(lines.some((line) => line.startsWith("(deny file-read* file-write*") && line.includes('(literal "/dev/tty")') && line.includes('(regex #"^/dev/(tty|pty)[a-z0-9]+$")')),
  "no terminal is readable or writable");
const secretLine = lines.find((line) => line.startsWith("(deny file-read* (subpath")) || "";
test.assert(SECRET_READ_DENYLIST.every((rel) => secretLine.includes(`(subpath "${path.join(fakeHome, rel)}")`)) && [".ssh", "Library/Keychains", ".git-credentials", ".netrc"].every((rel) => SECRET_READ_DENYLIST.includes(rel))
  && !lines.some((line) => line.startsWith("(deny file-read") && line.includes(`(subpath "${fakeHome}")`)),
"reads stay open except the secret stores: ~/.ssh, the Keychains and the credential files");
test.assert(lines.includes("(deny lsopen)"), "LaunchServices is closed");
const mapAllow = lines.find((line) => line.startsWith("(allow file-map-executable")) || "";
test.assert(lines.includes("(deny file-map-executable)") && at("(deny file-map-executable)") < at("(allow file-map-executable") && mapAllow.includes('(subpath "/usr/lib")') && mapAllow.includes('(subpath "/System/Library")') && mapAllow.includes(`(literal "${node}")`) && mapAllow.includes('(subpath "/opt/dsh-install")')
  && !mapAllow.includes(project) && lines.lastIndexOf(`(deny file-map-executable ${writable})`) > at("(allow file-map-executable"),
"only the OS libraries and the toolchain may be mapped as code, and never anything in the project or the temp (last match wins)");
const execAllow = lines.find((line) => line.startsWith("(allow process-exec*")) || "";
test.assert(lines.includes("(deny process-exec*)") && execAllow.includes(`(literal "${node}")`) && execAllow.includes('(subpath "/usr/bin")') && execAllow.includes('(subpath "/opt/dsh-install")') && lines.lastIndexOf(`(deny process-exec* ${writable})`) > at("(allow process-exec*"),
  "exec is the OS roots and the resolved toolchain, and nothing under the project or the temp may exec whatever a root covers");
test.assert(lines.includes("(deny network-outbound)") && lines.at(-1) === '(allow network-outbound (remote ip "localhost:21099"))' && !lines.some((line) => /mDNSResponder|unix-socket/.test(line)),
  "all outbound network is closed, the resolver included, and only the egress filter's loopback port opens (invalid ports dropped)");
const noPort = buildCodeSandboxProfile({ ...profileInput, loopbackPorts: [] }).split("\n");
test.assert(!noPort.some((line) => line.startsWith("(allow network-outbound")), "with no filter port no network opens at all");
let refused = 0;
for (const bad of [{ project: `${project}"(allow file-write*)` }, { tmp: "relative/tmp" }, { execRoots: ["bin"] }]) {
  try { buildCodeSandboxProfile({ ...profileInput, ...bad }); } catch { refused += 1; }
}
test.assert(refused === 3, "a path that would end the SBPL literal, or a relative path, is refused");

// Secret stores through links: a dotfile manager links ~/.ssh/config into its own tree.
write(path.join(fakeHome, ".ssh", "id_test"), "PRIVATE-KEY\n");
write(path.join(fakeHome, "dotfiles", "ssh-config"), "Host secret\n");
write(path.join(fakeHome, "dotfiles", "zshrc"), "export X=1\n");
write(path.join(fakeHome, "real-aws", "credentials"), "[default]\n");
fs.symlinkSync(path.join(fakeHome, "dotfiles", "ssh-config"), path.join(fakeHome, ".ssh", "config"));
fs.symlinkSync(path.join(fakeHome, "real-aws"), path.join(fakeHome, ".aws"));
write(path.join(fakeHome, ".gitconfig"), "[user]\n\tname = writer\n");
const secrets = resolveSecretPaths(fakeHome);
test.assert(secrets.includes(path.join(fakeHome, ".ssh")) && secrets.includes(path.join(fakeHome, "dotfiles", "ssh-config")) && secrets.includes(path.join(fakeHome, "real-aws", "credentials"))
  && !secrets.includes(path.join(fakeHome, "dotfiles")) && !secrets.includes(path.join(fakeHome, "dotfiles", "zshrc")),
"the secret paths include where a link points (a linked ~/.ssh/config, a linked ~/.aws), and nothing more of that tree");

// --- 2. Egress allowlist -----------------------------------------------------

for (const host of ["registry.npmjs.org", "registry.yarnpkg.com", "repo.yarnpkg.com", "github.com", "codeload.github.com", "objects.githubusercontent.com", "gitlab.com"]) {
  test.assert(CLIOCODE_ALLOWED_HOSTS.includes(host) && egress.admittedHost(`${host}:443`, CLIOCODE_ALLOWED_HOSTS) === host, `ClioCode's filter admits ${host}:443`);
}
for (const target of ["example.com:443", "api.deepseek.com:443", "evilgithub.com:443", "github.com.evil.example:443", "gist.github.com:443", "203.0.113.1:443", "[2606:4700::1111]:443", "github.com:22", "github.com:9418", "registry.npmjs.org:80", "127.0.0.1:443", "localhost:443"]) {
  test.assert(egress.admittedHost(target, CLIOCODE_ALLOWED_HOSTS) === "", `ClioCode's filter refuses CONNECT ${target}`);
}
const runHosts = codeAllowedHosts(["api.deepseek.com.", "*.example.org", "not a host", "../x"]);
test.assert(egress.admittedHost("api.deepseek.com:443", runHosts) === "api.deepseek.com" && egress.admittedHost("a.example.org:443", runHosts) === "a.example.org" && egress.admittedHost("example.org:443", runHosts) === ""
  && !runHosts.includes("not a host") && !runHosts.includes("../x") && codeHostAllowed("GitHub.com.") && !codeHostAllowed("example.com"),
"a run adds its provider host; `*.domain` admits the names under it, not the domain; malformed entries are dropped");
test.assert(egress.admittedHost("example.com:443") === "example.com" && egress.admittedHost("203.0.113.1:443") === "203.0.113.1" && egress.admittedHost("api.deepseek.com:443") === "api.deepseek.com" && egress.admittedHost("127.0.0.1:443") === "",
  "the ClioTalk engine's filter (no allowlist) still admits any public host on 443 and still refuses this Mac");
test.assert(egress.admittedHost("example.com:443", []) === "", "an empty allowlist admits nothing (fail closed)");

const GREETING = "hello-from-fake-upstream";
/**
 * A fake upstream proxy: answers any CONNECT with 200, records the target,
 * and greets once the client speaks through the tunnel (as a TLS client
 * speaks first).
 */
const upstreamTargets = [];
const upstream = net.createServer((socket) => {
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
await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
const upstreamPort = upstream.address().port;
const upstreamEnv = { HTTPS_PROXY: `http://127.0.0.1:${upstreamPort}` };

/** CONNECT through a filter from this process; returns the raw reply. */
const connectThrough = (port, target) => new Promise((resolve) => {
  const socket = net.connect({ host: "127.0.0.1", port }, () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
  let text = "";
  socket.on("data", (chunk) => {
    const first = !text;
    text += chunk;
    if (text.includes(GREETING)) socket.destroy();
    else if (first && /^HTTP\/1\.1 200/.test(text)) socket.write("hello\n");
  });
  socket.on("close", () => resolve(text));
  socket.on("error", () => resolve(text));
  setTimeout(() => socket.destroy(), 3000);
});

const codeFilter = await startCodeEgressProxy({ upstreamEnv, extraHosts: ["api.deepseek.com"] });
const clioTalkFilter = await egress.startEgressProxy({ upstreamEnv });
{
  const npmReply = await connectThrough(codeFilter.port, "registry.npmjs.org:443");
  const githubReply = await connectThrough(codeFilter.port, "github.com:443");
  const providerReply = await connectThrough(codeFilter.port, "api.deepseek.com:443");
  const offList = await connectThrough(codeFilter.port, "example.com:443");
  const literal = await connectThrough(codeFilter.port, "203.0.113.1:443");
  test.assert(/^HTTP\/1\.1 200/.test(npmReply) && npmReply.includes(GREETING) && /^HTTP\/1\.1 200/.test(githubReply) && /^HTTP\/1\.1 200/.test(providerReply),
    "ClioCode's filter tunnels an allowlisted registry, git host and the run's provider host (through the upstream proxy)");
  test.assert(/^HTTP\/1\.1 403/.test(offList) && /^HTTP\/1\.1 403/.test(literal) && !upstreamTargets.includes("example.com:443") && !upstreamTargets.includes("203.0.113.1:443"),
    "ClioCode's filter answers 403 for a public host off the list and an address literal, before anything is sent upstream");
  const talkReply = await connectThrough(clioTalkFilter.port, "example.com:443");
  const talkLocal = await connectThrough(clioTalkFilter.port, "127.0.0.1:4173");
  test.assert(/^HTTP\/1\.1 200/.test(talkReply) && talkReply.includes(GREETING) && /^HTTP\/1\.1 403/.test(talkLocal),
    "the ClioTalk engine's filter is unchanged: a public host off ClioCode's list is still tunnelled, this Mac's port still refused");
}
await clioTalkFilter.close();

// --- 3. Kernel ---------------------------------------------------------------

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
if (process.platform === "darwin" && fs.existsSync(SANDBOX_EXEC)) {
  const probe = spawnSync(SANDBOX_EXEC, ["-p", "(version 1)(allow default)", "/usr/bin/true"], { encoding: "utf8" });
  if (probe.status !== 0) {
    test.fail(`sandbox-exec cannot apply a profile here (${String(probe.stderr || "").trim()}): this shell is itself sandboxed and Seatbelt refuses a nested apply — run node tests/features/cliocode-sandbox.test.mjs from a normal shell`);
  } else {
    await kernelLegs();
  }
} else {
  test.ok("sandbox-exec is macOS only; the kernel probes are skipped on this platform");
}

async function kernelLegs() {
  const realHome = fs.realpathSync(os.homedir());
  // A small npm project with a test, a build and a git repository.
  write(path.join(project, "package.json"), `${JSON.stringify({ name: "cliocode-contract", version: "0.0.0", private: true, type: "module", scripts: { test: "node --test" } }, null, 2)}\n`);
  write(path.join(project, "src", "add.js"), "export function add(a, b) {\n  return a + b;\n}\n");
  write(path.join(project, "test", "add.test.js"), 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { add } from "../src/add.js";\ntest("add", () => assert.equal(add(2, 3), 5));\n');
  write(path.join(project, "build.js"), 'import fs from "node:fs";\nfs.mkdirSync("dist", { recursive: true });\nfs.writeFileSync("dist/bundle.js", "export const built = true;\\n");\n');
  write(path.join(project, ".gitignore"), "dist/\n");
  const git = (args) => spawnSync("git", ["-C", project, "-c", "user.email=contract@example.com", "-c", "user.name=contract", ...args], { encoding: "utf8" });
  const gitReady = git(["init", "-q"]).status === 0 && git(["add", "-A"]).status === 0 && git(["commit", "-q", "-m", "init"]).status === 0;
  write(path.join(project, "run-me.sh"), "#!/bin/sh\necho ran\n");
  fs.chmodSync(path.join(project, "run-me.sh"), 0o755);

  const profile = buildCodeSandboxProfile({
    project,
    tmp: runTmp,
    home: realHome,
    node,
    secretPaths: [...resolveSecretPaths(realHome), ...resolveSecretPaths(fakeHome)],
    execLiterals: toolchain.literals,
    execRoots: toolchain.roots,
    loopbackPorts: [codeFilter.port],
  });
  fs.writeFileSync(path.join(scratch, "cliocode.sb"), `${profile}\n`);
  const proxy = `http://127.0.0.1:${codeFilter.port}`;
  const baseEnv = { ...process.env };
  // NODE_TEST_CONTEXT: under `node --test` this file is a test-runner child,
  // and a `node --test` that inherits it skips every file and exits 0.
  for (const name of ["ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy", "NODE_TEST_CONTEXT"]) delete baseEnv[name];
  const env = {
    ...baseEnv,
    PATH: toolchain.path,
    HOME: realHome,
    TMPDIR: `${runTmp}/`,
    HTTPS_PROXY: proxy,
    https_proxy: proxy,
    HTTP_PROXY: proxy,
    http_proxy: proxy,
    npm_config_cache: path.join(runTmp, "npm-cache"),
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
  };
  // Async, so the filter and the fake upstream in this process can answer.
  const sandboxed = (argv) => new Promise((resolve) => {
    const child = spawn(SANDBOX_EXEC, ["-p", profile, ...argv], { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.on("close", (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
  const tail = (result) => `${result.stderr}${result.stdout}`.trim().split("\n").slice(-2).join(" | ");

  const outside = path.join(scratch, "outside.txt");
  const tmpCanary = `/private/tmp/ais6-cliocode-sandbox-${process.pid}.txt`;
  const sshDir = path.join(realHome, ".ssh");
  const keychains = path.join(realHome, "Library", "Keychains");
  const fsProbe = `
    const fs = require("fs"), cp = require("child_process");
    const out = {};
    const t = (name, fn) => { try { fn(); out[name] = "ok"; } catch (e) { out[name] = e.code || String(e.message); } };
    t("writeInside", () => fs.writeFileSync(${JSON.stringify(path.join(project, "inside.txt"))}, "x"));
    t("writeTmp", () => fs.writeFileSync(${JSON.stringify(path.join(runTmp, "scratch.txt"))}, "x"));
    t("writeOutside", () => fs.writeFileSync(${JSON.stringify(outside)}, "x"));
    t("writePrivateTmp", () => fs.writeFileSync(${JSON.stringify(tmpCanary)}, "x"));
    t("writeHome", () => fs.writeFileSync(${JSON.stringify(path.join(fakeHome, "planted.txt"))}, "x"));
    t("readSsh", () => fs.readFileSync(${JSON.stringify(path.join(fakeHome, ".ssh", "id_test"))}, "utf8"));
    t("listSsh", () => fs.readdirSync(${JSON.stringify(path.join(fakeHome, ".ssh"))}));
    t("readLinkedSsh", () => fs.readFileSync(${JSON.stringify(path.join(fakeHome, "dotfiles", "ssh-config"))}, "utf8"));
    t("readLinkedAws", () => fs.readFileSync(${JSON.stringify(path.join(fakeHome, ".aws", "credentials"))}, "utf8"));
    t("readDotfile", () => fs.readFileSync(${JSON.stringify(path.join(fakeHome, "dotfiles", "zshrc"))}, "utf8"));
    t("readGitconfig", () => fs.readFileSync(${JSON.stringify(path.join(fakeHome, ".gitconfig"))}, "utf8"));
    t("listRealSsh", () => fs.readdirSync(${JSON.stringify(sshDir)}));
    t("listKeychains", () => fs.readdirSync(${JSON.stringify(keychains)}));
    t("execWritten", () => cp.execFileSync(${JSON.stringify(path.join(project, "run-me.sh"))}));
    t("execShell", () => cp.execFileSync("/bin/sh", ["-c", "echo ok"]));
    console.log(JSON.stringify(out));
  `;
  const fsRan = await sandboxed([node, "-e", fsProbe]);
  let r = {};
  try { r = JSON.parse(fsRan.stdout.trim().split("\n").pop() || "{}"); } catch {}
  test.assert(r.writeInside === "ok" && fs.existsSync(path.join(project, "inside.txt")) && r.writeTmp === "ok", `the kernel lets the run write in the project folder and its temp (${r.writeInside}, ${r.writeTmp}; ${tail(fsRan)})`);
  test.assert(r.writeOutside === "EPERM" && !fs.existsSync(outside) && r.writePrivateTmp === "EPERM" && r.writeHome === "EPERM", `the kernel refuses a write outside the folder, in /private/tmp and in the home (${r.writeOutside}, ${r.writePrivateTmp}, ${r.writeHome})`);
  fs.rmSync(tmpCanary, { force: true });
  test.assert(r.readSsh === "EPERM" && r.listSsh === "EPERM" && r.readLinkedSsh === "EPERM" && r.readLinkedAws === "EPERM", `the kernel refuses to read ~/.ssh, a linked ~/.ssh/config at its target, and a linked ~/.aws (${r.readSsh}, ${r.listSsh}, ${r.readLinkedSsh}, ${r.readLinkedAws})`);
  test.assert(r.readDotfile === "ok" && r.readGitconfig === "ok", "other reads stay open: the rest of a dotfile tree, ~/.gitconfig");
  test.assert(!fs.existsSync(sshDir) || r.listRealSsh === "EPERM", `the writer's real ~/.ssh is unreadable (${fs.existsSync(sshDir) ? r.listRealSsh : "no ~/.ssh here"})`);
  test.assert(!fs.existsSync(keychains) || r.listKeychains === "EPERM", `the writer's Keychains folder is unreadable (${fs.existsSync(keychains) ? r.listKeychains : "no Keychains folder here"})`);
  test.assert(r.execWritten === "EPERM" && r.execShell === "ok", `a script the run wrote cannot exec as a program (${r.execWritten}), while the OS shell runs (${r.execShell})`);

  const npmTest = await sandboxed(["npm", "test"]);
  const npmPassed = npmTest.status === 0 && /pass 1/.test(`${npmTest.stdout}${npmTest.stderr}`);
  test.assert(npmPassed, `npm test runs inside the sandbox (${npmPassed ? "1 passing" : `status ${npmTest.status}; stderr: ${npmTest.stderr.trim().split("\n").slice(-8).join(" | ") || "(none)"}; stdout: ${tail(npmTest)}`})`);
  const gitStatus = await sandboxed(["git", "status", "--porcelain"]);
  test.assert(gitReady && gitStatus.status === 0 && /inside\.txt/.test(gitStatus.stdout), `git status runs inside the sandbox and sees the run's write (${gitStatus.status === 0 ? "ok" : tail(gitStatus)})`);
  const build = await sandboxed([node, "build.js"]);
  test.assert(build.status === 0 && fs.existsSync(path.join(project, "dist", "bundle.js")), `node build.js writes dist/ inside the folder (${build.status === 0 ? "ok" : tail(build)})`);

  const connectScript = (host, port) => `const s=require("net").connect(${port},${JSON.stringify(host)});`
    + 's.on("connect",()=>{console.log("CONNECTED");process.exit(0)});'
    + 's.on("error",e=>{console.log(e.code||e.message);process.exit(3)});'
    + 'setTimeout(()=>{console.log("TIMEOUT");process.exit(4)},4000);';
  const direct = await sandboxed([node, "-e", connectScript("203.0.113.1", 443)]);
  test.assert(direct.stdout.trim() === "EPERM", `the kernel refuses a direct connection to a public host (${direct.stdout.trim()})`);
  const sideDoor = await sandboxed([node, "-e", connectScript("127.0.0.1", upstreamPort)]);
  test.assert(sideDoor.stdout.trim() === "EPERM", `the kernel refuses another loopback port of this Mac (${sideDoor.stdout.trim()})`);
  const resolver = await sandboxed([node, "-e", 'require("dns").lookup("registry.npmjs.org",(e)=>console.log(e?e.code:"ok"))']);
  test.assert(resolver.stdout.trim() !== "ok", `the resolver is closed: names are resolved by the filter, not the run (${resolver.stdout.trim()})`);
  const tunnelScript = (target) => `const s=require("net").connect(${codeFilter.port},"127.0.0.1",()=>s.write(${JSON.stringify(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`)}));`
    + `let b="";s.on("data",d=>{const first=!b;b+=d;if(first&&/^HTTP\\/1\\.1 200/.test(b))s.write("hello\\n");if(b.includes(${JSON.stringify(GREETING)})||b.includes("\\r\\n\\r\\n")&&!/ 200 /.test(b.split("\\r\\n")[0])){console.log(b.split("\\r\\n")[0]+(b.includes(${JSON.stringify(GREETING)})?" +greeting":""));process.exit(0)}});`
    + 's.on("error",e=>{console.log(e.code||e.message);process.exit(3)});'
    + 'setTimeout(()=>{console.log("TIMEOUT "+JSON.stringify(b));process.exit(4)},4000);';
  const allowed = await sandboxed([node, "-e", tunnelScript("registry.npmjs.org:443")]);
  test.assert(/^HTTP\/1\.1 200 .*\+greeting$/.test(allowed.stdout.trim()), `through the filter's port an allowlisted registry is reached (${allowed.stdout.trim()})`);
  const blocked = await sandboxed([node, "-e", tunnelScript("example.com:443")]);
  test.assert(/^HTTP\/1\.1 403/.test(blocked.stdout.trim()), `through the filter's port a host off the allowlist gets 403 (${blocked.stdout.trim()})`);
}

await codeFilter.close();
upstream.close();
fs.rmSync(scratch, { recursive: true, force: true });
test.finish();
