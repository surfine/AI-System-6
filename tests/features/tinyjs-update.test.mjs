import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("tinyjs-update");
const require = createRequire(import.meta.url);
const worker = require("../../platform/macos/tinyjs/src/node/update.cjs");
assert.equal(worker.newer("1.0.9", "1.0.10"), true);
assert.equal(worker.newer("1.0.10", "1.0.9"), false);
assert.equal(worker.newer("1.0.10", "1.0.10"), false);
assert.throws(() => worker.newer("1.0.0", "1.0.1-beta"));
for (const url of ["file:///etc/passwd", "http://example.com/a.zip", "https://user:secret@example.com/a.zip"]) {
  assert.throws(() => worker.safeUrl(url));
}
assert.equal(worker.safeUrl("http://127.0.0.1/a", true), "http://127.0.0.1/a");

const dir = await mkdtemp(join(tmpdir(), "system6-ota-contract-"));
let manifest, archive = Buffer.from("not an archive");
const server = createServer((req, res) => {
  if (req.url === "/manifest") { res.end(JSON.stringify(manifest)); return; }
  if (req.url === "/redirect") { res.writeHead(302, { Location: "http://example.com/payload" }); res.end(); return; }
  if (req.url === "/no-location") { res.writeHead(302); res.end(); return; }
  res.end(archive);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
const request = { manifestUrl: base + "/manifest", localTest: true, shellVersion: "1.0.0",
  bundleId: "me.aaronlau.ai-system6.tinyjs", allowAdhoc: true,
  app: join(dir, "Current.app"), oldIdentity: { shellVersion: "1.0.0", storageSchema: 6 },
  oldBackendPid: process.pid, oldSupervisorPid: process.pid,
  healthyFile: join(dir, "health.json"), dataFingerprint: "a".repeat(64) };
manifest = { version: "1.0.1", url: base + "/payload", sha256: "0".repeat(64) };
try {
  assert.equal((await worker.check(request)).available, true);
  manifest.version = "1.0.0";
  assert.equal((await worker.check(request)).available, false);
  manifest.version = "1.0.1";
  await assert.rejects(worker.prepare({ ...request, expectedLatest: "1.0.2" }), /changed/);
  await assert.rejects(worker.prepare(request), /checksum/);
  await assert.rejects(worker.boundedFetch(base + "/payload", 2, true), /large/);
  await assert.rejects(worker.boundedFetch(base + "/no-location", 1024, true), /Location/);
  manifest.sha256 = "invalid";
  await assert.rejects(worker.check(request), /checksum/);
  if (process.platform === "darwin" && process.arch === "arm64") {
    const identity = { shellVersion: "1.0.1", productVersion: "1.0.59", productBuild: "20261011.1",
      arch: "arm64", minimumOS: "15.0", storageSchema: 6, sourceCommit: "b".repeat(40) };
    async function bundle(app, shellVersion) {
      await mkdir(join(app, "Contents/MacOS"), { recursive: true });
      await mkdir(join(app, "Contents/Resources"));
      await writeFile(join(dir, "main.c"), "int main(void){return 0;}\n");
      execFileSync("/usr/bin/clang", [join(dir, "main.c"), "-o", join(app, "Contents/MacOS/Shell")]);
      await writeFile(join(app, "Contents/Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${request.bundleId}</string><key>CFBundleExecutable</key><string>Shell</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
      await writeFile(join(app, "Contents/Resources/PRODUCT-IDENTITY.json"), JSON.stringify({ ...identity, shellVersion }));
      execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", app], { stdio: "pipe" });
    }
    const candidate = join(dir, "Next.app");
    await bundle(request.app, "1.0.0"); await bundle(candidate, "1.0.1");
    assert.equal((await worker.inspectApp(candidate, { ...request, latest: "1.0.1" }, request.app)).productVersion, "1.0.59");
    await assert.rejects(worker.inspectApp(candidate, { ...request, latest: "1.0.1", allowAdhoc: false }, request.app), /Developer ID/);
    await assert.rejects(worker.inspectApp(candidate, { ...request, bundleId: "wrong.app", latest: "1.0.1" }, request.app), /application/);
    const zip = join(dir, "candidate.zip");
    execFileSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", candidate, zip]);
    archive = await readFile(zip);
    manifest = { version: "1.0.1", url: base + "/payload", sha256: createHash("sha256").update(archive).digest("hex") };
    const prepared = await worker.prepare(request);
    assert.equal((await stat(prepared.node)).mode & 0o777, 0o700);
    assert.equal(JSON.parse(await readFile(join(prepared.home, "transaction.json"))).dataFingerprint, request.dataFingerprint);
    await writeFile(join(candidate, "Contents/Resources/PRODUCT-IDENTITY.json"), "{}");
    await assert.rejects(worker.inspectApp(candidate, { ...request, latest: "1.0.1" }, request.app));
    console.log("Real ad-hoc app, ZIP, checksum and signature rejection verified.");
  } else console.log("SKIP native signature/ZIP evidence: requires arm64 macOS.");
  test.assert(true, "update transport and native candidate boundaries passed");

  // WebKit's HTTP cache outlives the swap; the first launch of a different
  // payload drops it, a relaunch of the same payload keeps it.
  const caches = join(dir, "Caches/app"), cacheDir = join(caches, "WebKit/NetworkCache"), markerFile = join(dir, "frontend-identity.json");
  const identity = { shellVersion: "1.0.1", productVersion: "1.0.58", productBuild: "20261014.3", sourceCommit: "b".repeat(40) };
  const cached = async () => stat(join(cacheDir, "Version 17/Records/entry")).then(() => true, () => false);
  await mkdir(join(cacheDir, "Version 17/Records"), { recursive: true });
  await writeFile(join(cacheDir, "Version 17/Records/entry"), "stale desk");
  assert.deepEqual(await worker.frontendCache({ identity, cacheDir, markerFile }), { purged: true });
  assert.equal(await cached(), false);
  await mkdir(join(cacheDir, "Version 17/Records"), { recursive: true });
  await writeFile(join(cacheDir, "Version 17/Records/entry"), "current desk");
  assert.deepEqual(await worker.frontendCache({ identity, cacheDir, markerFile }), { purged: false });
  assert.equal(await cached(), true);
  // Same build stamp, different payload: the stamp alone is not identity.
  assert.deepEqual(await worker.frontendCache({ identity: { ...identity, sourceCommit: "c".repeat(40) }, cacheDir, markerFile }), { purged: true });
  assert.deepEqual(await worker.frontendCache({ identity, cacheDir, markerFile, force: true }), { purged: false });
  await assert.rejects(worker.frontendCache({ identity, cacheDir: caches, markerFile }), /Invalid cache directory/);
  test.assert(true, "a different payload (even under the same build stamp) drops the WebKit HTTP cache once; a relaunch keeps it");

  // Health gate: the handed-over fingerprint must match, and a build that
  // measures its boot must have lost no writer record.
  const healthyFile = join(dir, "gate-health.json");
  const gateIdentity = { shellVersion: "1.0.1", productBuild: "20261014.3", productVersion: "1.0.58", sourceCommit: "b".repeat(40), storageSchema: 6 };
  const gate = { healthyFile, startedAt: Date.now() - 1000, dataFingerprint: "d".repeat(64) };
  const report = (extra) => writeFile(healthyFile, JSON.stringify({ ...gateIdentity, ready: true, time: Date.now(), dataFingerprint: "d".repeat(64), ...extra }));
  await report({}); assert.equal((await worker.health(gate, gateIdentity, 500)).ready, true);
  await report({ writerData: { checked: true, lost: 0 } }); assert.equal((await worker.health(gate, gateIdentity, 500)).writerData.lost, 0);
  await report({ writerData: { checked: true, lost: 1 } }); await assert.rejects(worker.health(gate, gateIdentity, 500), /did not become healthy/);
  await report({ dataFingerprint: "e".repeat(64) }); await assert.rejects(worker.health(gate, gateIdentity, 500), /did not become healthy/);
  test.assert(true, "the health gate needs the handed-over fingerprint and refuses a boot that lost writer records");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
test.finish();
