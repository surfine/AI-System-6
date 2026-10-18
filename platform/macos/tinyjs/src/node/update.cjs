"use strict";

// This worker is copied with its self-contained Node into a private directory
// BEFORE the app exits. Its transaction survives a broken new backend.
const fs = require("node:fs/promises");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const crypto = require("node:crypto");
const path = require("node:path");
const run = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_BYTES = 1024 * 1024 * 1024;

function safeUrl(value, localTest = false) {
  const url = new URL(value);
  if (url.username || url.password || (url.protocol !== "https:" && !(localTest && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) {
    throw new Error("Update URL must use HTTPS");
  }
  return url.href;
}
function newer(current, candidate) {
  const parse = (v) => /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v))?.slice(1).map(Number);
  const a = parse(current), b = parse(candidate);
  if (!a || !b) throw new Error("Invalid shell version");
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] > a[i];
  return false;
}
async function boundedFetch(url, limit, localTest = false, destination = null) {
  let target = safeUrl(url, localTest);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  let output;
  try {
    let res;
    for (let hop = 0; hop <= 5; hop++) {
      res = await fetch(target, { redirect: "manual", signal: controller.signal });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        await res.body?.cancel();
        const location = res.headers.get("location");
        if (!location) throw new Error("Update redirect is missing Location");
        target = safeUrl(new URL(location, target).href, localTest);
      } else break;
    }
    if (!res.ok) throw new Error("Update HTTP " + res.status);
    if (Number(res.headers.get("content-length")) > limit) throw new Error("Update is too large");
    const chunks = []; let bytes = 0;
    const hash = crypto.createHash("sha256");
    if (destination) output = await fs.open(destination, "wx", 0o600);
    for await (const chunk of res.body) {
      bytes += chunk.length;
      if (bytes > limit) { controller.abort(); throw new Error("Update is too large"); }
      if (output) { await output.write(chunk); hash.update(chunk); }
      else chunks.push(Buffer.from(chunk));
    }
    if (output) { await output.sync(); return { bytes, sha256: hash.digest("hex") }; }
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); await output?.close(); }
}
async function check(request) {
  const bytes = await boundedFetch(request.manifestUrl, 256 * 1024, request.localTest);
  const manifest = JSON.parse(bytes.toString());
  const entry = manifest.mac?.arm64 || manifest;
  const latest = entry.version || manifest.version;
  if (!/^[a-f0-9]{64}$/i.test(entry.sha256 || "")) throw new Error("Missing update checksum");
  const url = safeUrl(entry.url, request.localTest);
  return { available: newer(request.shellVersion, latest), current: request.shellVersion,
    latest, notes: String(manifest.notes || "").slice(0, 8000), url, sha256: entry.sha256.toLowerCase() };
}
async function journal(file, value) {
  const handle = await fs.open(file + ".tmp", "w", 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(file + ".tmp", file);
}
async function inspectApp(app, expected, currentApp) {
  await run("/usr/bin/codesign", ["--verify", "--strict", "--deep", app]);
  const plist = await run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", path.join(app, "Contents/Info.plist")]);
  if (plist.stdout.trim() !== expected.bundleId) throw new Error("Wrong update application");
  const identity = JSON.parse(await fs.readFile(path.join(app, "Contents/Resources/PRODUCT-IDENTITY.json")));
  if (identity.shellVersion !== expected.latest || identity.arch !== "arm64" || identity.minimumOS !== "15.0"
      || !/^\d+\.\d+\.\d+$/.test(identity.productVersion) || !/^\d{8}\.\d+$/.test(identity.productBuild)
      || !/^[a-f0-9]{40}$/.test(identity.sourceCommit || "")
      || !Number.isSafeInteger(identity.storageSchema)
      || identity.storageSchema !== expected.oldIdentity?.storageSchema) throw new Error("Incompatible update identity");
  const executable = (await run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleExecutable", path.join(app, "Contents/Info.plist")])).stdout.trim();
  if (!/^[\w.-]+$/.test(executable)) throw new Error("Invalid update executable");
  await run("/usr/bin/lipo", [path.join(app, "Contents/MacOS", executable), "-verify_arch", "arm64"]);
  const { stdout: info } = await run("/usr/bin/sw_vers", ["-productVersion"]);
  if (Number(info.split(".")[0]) < 15) throw new Error("macOS 15 or later required");
  const team = async (bundle) => {
    const r = await run("/usr/bin/codesign", ["-dvv", bundle]);
    return /^TeamIdentifier=(.*)$/m.exec(r.stderr)?.[1]?.trim() || "not set";
  };
  const currentTeam = await team(currentApp);
  if (currentTeam !== "not set" && await team(app) !== currentTeam) throw new Error("Update signing team differs");
  if (!expected.allowAdhoc && currentTeam === "not set") throw new Error("Production OTA requires Developer ID");
  const root = await fs.realpath(app);
  async function links(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isSymbolicLink()) {
        const dest = await fs.realpath(p);
        if (!dest.startsWith(root + path.sep)) throw new Error("Update contains an escaping symlink");
      } else if (e.isDirectory()) await links(p);
    }
  }
  await links(app);
  return identity;
}
async function prepare(request) {
  const update = await check(request);
  if (!update.available) throw new Error("No newer update");
  if (request.expectedLatest && request.expectedLatest !== update.latest) throw new Error("Update changed; check again");
  const app = path.resolve(request.app);
  if (!app.endsWith(".app") || app.includes("/AppTranslocation/")) throw new Error("Move the app to Applications first");
  const home = await fs.mkdtemp(path.join(path.dirname(app), ".ai-system6-update-"));
  await fs.chmod(home, 0o700);
  try {
    const zip = path.join(home, "payload.zip");
    const download = await boundedFetch(update.url, MAX_BYTES, request.localTest, zip);
    if (download.sha256 !== update.sha256) throw new Error("Update checksum mismatch");
    const listing = (await run("/usr/bin/unzip", ["-Z1", zip], { maxBuffer: 32 * 1024 * 1024 })).stdout.split("\n").filter(Boolean);
    const summary = (await run("/usr/bin/unzip", ["-Z", "-t", zip])).stdout;
    const expanded = Number(/(\d+) bytes uncompressed/.exec(summary)?.[1]);
    const capacity = await fs.statfs(home);
    if (!expanded || expanded > 4 * MAX_BYTES || listing.length > 100000
        || capacity.bavail * capacity.bsize < expanded * 2 + 256 * 1024 * 1024) throw new Error("Insufficient space or oversized update archive");
    const top = new Set();
    for (const item of listing) {
      if (item.startsWith("/") || item.includes("\\") || item.split("/").includes("..")) throw new Error("Unsafe archive path");
      if (!item.startsWith("__MACOSX/")) top.add(item.split("/")[0]);
    }
    if (top.size !== 1 || ![...top][0].endsWith(".app")) throw new Error("Archive must contain one app");
    const extraction = path.join(home, "extract");
    await fs.mkdir(extraction);
    await run("/usr/bin/ditto", ["-x", "-k", zip, extraction]);
    const candidate = path.join(extraction, [...top][0]);
    const identity = await inspectApp(candidate, { ...request, ...update }, app);
    const state = { phase: "prepared", app, candidate, backup: path.join(home, "previous.app"), identity,
      home, oldBackendPid: request.oldBackendPid, oldSupervisorPid: request.oldSupervisorPid,
      oldIdentity: request.oldIdentity, dataFingerprint: request.dataFingerprint, healthyFile: request.healthyFile,
      recoveryFile: request.recoveryFile, zipSha256: update.sha256 };
    // Copy recovery worker and Node outside the replaced package.
    const worker = path.join(home, "update.cjs"), node = path.join(home, "node");
    await fs.copyFile(__filename, worker); await fs.copyFile(process.execPath, node); await fs.chmod(node, 0o700);
    await journal(path.join(home, "transaction.json"), state);
    if (request.recoveryFile) await journal(request.recoveryFile, { home });
    return { home, worker, node, identity };
  } catch (e) { await fs.rm(home, { recursive: true, force: true }); throw e; }
}
async function waitDead(pid, timeout = 30000) {
  if (!Number.isSafeInteger(pid) || pid < 2) throw new Error("Invalid process identity");
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch { return; }
    await sleep(200);
  }
  throw new Error("Previous shell is still running");
}
async function health(state, identity, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const report = JSON.parse(await fs.readFile(state.healthyFile));
      if (report.shellVersion === identity.shellVersion && report.productBuild === identity.productBuild
          && report.productVersion === identity.productVersion && report.ready === true
          && report.sourceCommit === identity.sourceCommit && report.storageSchema === identity.storageSchema
          && report.time >= state.startedAt && report.dataFingerprint === state.dataFingerprint
          // A build that measures its boot (writerData) must also have lost no
          // record while booting; older builds report only the fingerprint.
          && (report.writerData === undefined || report.writerData?.lost === 0)) return report;
    } catch {}
    await sleep(250);
  }
  throw new Error("Updated desktop did not become healthy");
}
async function install(home) {
  const file = path.join(home, "transaction.json");
  const s = JSON.parse(await fs.readFile(file));
  if (path.resolve(s.home) !== path.resolve(home) || !["prepared", "old-backed-up", "new-placed", "restoring"].includes(s.phase)) throw new Error("Invalid recovery transaction");
  const lockPath = path.join(home, "install.lock");
  try {
    const owner = Number(await fs.readFile(lockPath, "utf8"));
    if (!Number.isSafeInteger(owner) || owner < 2) throw new Error("Invalid install lock");
    let alive = true;
    try { process.kill(owner, 0); } catch (e) { if (e.code === "ESRCH") alive = false; else throw e; }
    if (alive) throw new Error("Update installer is already running");
    await fs.unlink(lockPath);
  } catch (e) { if (e.code !== "ENOENT") throw e; }
  const lock = await fs.open(lockPath, "wx", 0o600);
  await lock.writeFile(String(process.pid));
  // A crash between rename and journal must never mistake a missing old app
  // for a clean pre-swap failure. Filesystem evidence wins over that journal.
  const exists = (p) => fs.stat(p).then(() => true, () => false);
  if (s.phase === "prepared" && await exists(s.backup)) {
    s.phase = "old-backed-up";
    s.startedAt ||= 0;
  }
  try {
    if (s.phase === "prepared") {
      await waitDead(s.oldBackendPid); await waitDead(s.oldSupervisorPid);
      s.startedAt = Date.now(); await journal(file, s);
      await fs.rename(s.app, s.backup); s.phase = "old-backed-up"; await journal(file, s);
      await fs.rename(s.candidate, s.app);
      s.phase = "new-placed"; s.startedAt = Date.now(); await journal(file, s);
      await run("/usr/bin/open", ["-n", s.app]);
      const report = await health(s, s.identity);
      s.phase = "healthy"; s.report = report; await journal(file, s);
      // Keep worker/journal for diagnosis, but remove the old app only after
      // product ready and readable storage were observed.
      await fs.rm(s.backup, { recursive: true, force: true }).catch(() => {});
      await fs.rm(path.join(home, "payload.zip"), { force: true }).catch(() => {});
      if (s.recoveryFile) await fs.rm(s.recoveryFile, { force: true }).catch(() => {});
      return { status: "healthy" };
    }
    throw new Error("Interrupted install needs recovery");
  } catch (error) {
    if (s.phase === "prepared") { s.phase = "failed-before-swap"; await journal(file, s); throw error; }
    s.phase = "restoring"; s.error = String(error.message).slice(0, 500); await journal(file, s);
    // Only target the backend authenticated through the private health file.
    try {
      const r = JSON.parse(await fs.readFile(s.healthyFile));
      if (r.time >= (s.startedAt || 0) && r.backendPid !== s.oldBackendPid && Number.isSafeInteger(r.backendPid) && r.backendPid > 1) {
        try { process.kill(r.backendPid, "SIGTERM"); } catch {}
        await waitDead(r.backendPid);
        if (Number.isSafeInteger(r.supervisorPid) && r.supervisorPid > 1) await waitDead(r.supervisorPid);
      }
    } catch (e) { if (e.message === "Previous shell is still running") throw e; }
    if (!await exists(s.backup)) throw new Error("Previous app backup is missing; recovery stopped");
    if (await exists(s.app)) await fs.rename(s.app, path.join(home, "failed-" + Date.now() + ".app"));
    await fs.rename(s.backup, s.app);
    s.startedAt = Date.now(); await journal(file, s);
    await run("/usr/bin/open", ["-n", s.app]);
    await health(s, s.oldIdentity);
    s.phase = "restored"; await journal(file, s);
    if (s.recoveryFile) await fs.rm(s.recoveryFile, { force: true }).catch(() => {});
    return { status: "restored", error: s.error };
  } finally { await lock.close(); await fs.unlink(path.join(home, "install.lock")).catch(() => {}); }
}

async function recover(request) {
  let marker;
  try { marker = JSON.parse(await fs.readFile(request.recoveryFile)); }
  catch (e) { if (e.code === "ENOENT") return { recovering: false }; throw e; }
  const home = path.resolve(marker.home);
  if (path.dirname(home) !== path.dirname(path.resolve(request.app))
      || !path.basename(home).startsWith(".ai-system6-update-")) throw new Error("Invalid recovery directory");
  const state = JSON.parse(await fs.readFile(path.join(home, "transaction.json")));
  if (path.resolve(state.app) !== path.resolve(request.app)) throw new Error("Recovery app identity differs");
  if (["healthy", "restored", "failed-before-swap"].includes(state.phase)) {
    await fs.rm(request.recoveryFile, { force: true }); return { recovering: false };
  }
  // Rollback can finish the filesystem restore and reopen the old app, then
  // fail its strict pre-update fingerprint check because startup updated state.
  // On the next launch the old bundle is already at
  // the target path and there is no backup left to restore. Let that known-good
  // app continue booting and retire only the stale recovery marker.
  if (state.phase === "restoring" && !(await fs.stat(state.backup).then(() => true, () => false))) {
    const current = JSON.parse(await fs.readFile(path.join(state.app, "Contents/Resources/PRODUCT-IDENTITY.json")));
    const old = state.oldIdentity;
    if (old && current.shellVersion === old.shellVersion && current.productBuild === old.productBuild
        && current.sourceCommit === old.sourceCommit && current.storageSchema === old.storageSchema) {
      state.phase = "restored";
      state.recoveredAt = Date.now();
      await journal(path.join(home, "transaction.json"), state);
      await fs.rm(request.recoveryFile, { force: true });
      return { recovering: false, restored: true };
    }
  }
  try {
    const owner = Number(await fs.readFile(path.join(home, "install.lock"), "utf8"));
    if (!Number.isSafeInteger(owner) || owner < 2) throw new Error("Invalid recovery owner");
    try { process.kill(owner, 0); return { recovering: false, installerRunning: true }; }
    catch (e) { if (e.code !== "ESRCH") throw e; }
  } catch (e) { if (e.code !== "ENOENT") throw e; }
  const child = spawn(path.join(home, "node"), [path.join(home, "update.cjs"), "install", home],
    { detached: true, stdio: "ignore" });
  await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  child.unref();
  return { recovering: true };
}

// WebKit's HTTP cache outlives an in-place swap of the application, and the
// desk's `?v=<build>` assets are cached as immutable by older servers. The
// first launch of a different payload therefore drops the app's HTTP cache
// before the WebView loads anything from the private server.
async function frontendCache(request) {
  const id = request.identity || {};
  const stamp = [id.shellVersion, id.productVersion, id.productBuild, id.sourceCommit].join("/");
  const cache = path.resolve(String(request.cacheDir || ""));
  if (!request.cacheDir || path.basename(cache) !== "NetworkCache" || path.basename(path.dirname(cache)) !== "WebKit") throw new Error("Invalid cache directory");
  let previous = null;
  try { previous = JSON.parse(await fs.readFile(request.markerFile, "utf8")).stamp; } catch {}
  if (previous === stamp && !request.force) return { purged: false };
  const stale = cache + ".stale-" + process.pid + "-" + Date.now();
  let moved = false;
  try { await fs.rename(cache, stale); moved = true; } catch (e) { if (e.code !== "ENOENT") throw e; }
  if (moved) await fs.rm(stale, { recursive: true, force: true });
  await journal(request.markerFile, { stamp, time: Date.now() });
  return { purged: moved };
}

if (require.main === module) {
  (async () => {
    const command = process.argv[2];
    const result = command === "install" ? await install(process.argv[3])
      : await ({ check, prepare, recover, frontendCache }[command])(JSON.parse(await fs.readFile(process.argv[3])));
    process.stdout.write(JSON.stringify(result) + "\n");
  })().catch((e) => { console.error(JSON.stringify({ error: String(e.message).slice(0, 500) })); process.exitCode = 1; });
}
module.exports = { safeUrl, newer, boundedFetch, check, prepare, install, inspectApp, recover, frontendCache, health };
