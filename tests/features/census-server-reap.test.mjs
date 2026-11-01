// Contract: the census harness reaps the servers it leaves behind, and never
// waits forever inside page.evaluate.
//
// Why this test exists: a `census:controls` run takes tens of minutes, so it
// is normally ended by Ctrl-C or by a CI timeout. Neither runs the harness's
// own finally block, so the app server it spawned is orphaned — it keeps the
// ephemeral port it was given, and there is nothing to notice it: `pgrep
// apps/server/server.js` only ever looks like it checks the default 4173. A
// batch of interrupted runs left seven of them running at once. The harness
// now tags its server with a marker argument and reaps the marked ones at
// start-up, and it also bounds the page.evaluate calls that previously had no
// deadline (a renderer that stops answering made a run look slow while it was
// in fact stuck, with the Node process almost idle).
//
// The first half checks the shape of both files; the second half actually
// spawns a marked process and proves the reaping kills it and spares a
// near-miss whose argv merely contains the marker without ending in it.

import { spawn, spawnSync } from "node:child_process";
import { reapStaleServers } from "../../tooling/lib/app-preview-server.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("census-server-reap");
const lib = read("tooling/lib/app-preview-server.mjs");
const census = read("tooling/control-census.mjs");

// ---- Server lifecycle lib ------------------------------------------------

test.assertIncludes(lib, "export function reapStaleServers", "the shared harness exposes a reaper for its own servers");
test.assertIncludes(lib, 'import { spawn, spawnSync } from "node:child_process";', "the reaper lists processes without a shell");
test.assertIncludes(lib, 'spawnSync("ps", ["-Ao", "pid=,args="]', "the reaper lists every process with its full argv");
test.assertNotIncludes(lib, 'spawnSync("pgrep"', "the reaper does not shell out to pgrep: a leading-dash marker is read as an option and finds nothing");
test.assertIncludes(lib, "if (marker) argv.push(marker);", "a started server is tagged with its marker argument");
test.assertIncludes(lib, 'const argv = ["apps/server/server.js"];', "the marker is appended after the server path, never replacing it");
test.assertIncludes(lib, ".trim().endsWith(marker)", "the reaper confirms the marker is the final argument before killing");

// ---- Census harness wiring ----------------------------------------------

test.assertIncludes(census, "reapStaleServers", "the census reaps stale servers before starting its own");
test.assertIncludes(census, 'const MARKER = "--control-census-server";', "the census owns one named marker");
test.assertIncludes(census, "reapStaleServers(MARKER", "the census passes that marker to the reaper");
test.assertIncludes(census, "await startAppServer(repositoryRoot, { marker: MARKER })", "the census tags the server it starts with the same marker");
test.assertMatches(
  census,
  /reapStaleServers\(MARKER[\s\S]*await startAppServer\(repositoryRoot, \{ marker: MARKER \}\)/,
  "the reap runs before the spawn, so a new run never inherits the previous one's orphans"
);

test.assertIncludes(census, 'process.on("SIGINT", onSigint);', "a Ctrl-C shutdown reaps the server instead of orphaning it");
test.assertIncludes(census, 'process.on("SIGTERM", onSigterm);', "a CI SIGTERM shutdown reaps the server too");
test.assertIncludes(census, "let shuttingDown = false;", "shutdown is guarded against re-entry");
test.assertIncludes(census, 'process.off("SIGINT", onSigint);', "the normal path removes the signal handlers before closing");

// ---- Bounded evaluate ----------------------------------------------------

test.assertIncludes(census, "const EVALUATE_TIMEOUT_MS = 20000;", "page.evaluate calls have a stated deadline");
test.assertIncludes(census, "function boundedEvaluate(page, fn, arg, timeoutMs = EVALUATE_TIMEOUT_MS)", "one wrapper owns that deadline");
test.assertMatches(census, /boundedEvaluate\(page, \(\) => typeof window\.__census !== "undefined"\)/, "the census-alive check is bounded");
test.assertMatches(census, /boundedEvaluate\(page, installProbe\)/, "re-installing the probe after a reload is bounded");
test.assertMatches(census, /boundedEvaluate\(page, \(a\) => window\.__census\.probe\(a\), entry\.rawSample, 25000\)/, "the action probe is bounded above the outer race so its wording is preserved");
test.assertMatches(census, /boundedEvaluate\(page, \(id\) => \{\s*\n\s*activeAppId = id;/, "the establish-context app switch is bounded: it is the hang the classify loop used to end on");
test.assertNotIncludes(census, "await page.evaluate(() => typeof window.__census", "no unbounded census-alive evaluate survives");
test.assertNotIncludes(census, "await page.evaluate(installProbe)", "no unbounded probe re-install survives");

// ---- Live reaping --------------------------------------------------------

const marker = `--census-reap-contract-${process.pid}`;
// Ends with the marker: this is the orphan the reaper must kill. The `--`
// separator is required because the marker leads with `--`, which node would
// otherwise read as an option of its own.
const orphan = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)", "--", marker], { stdio: "ignore" });
// Contains the marker but does not end with it: not ours, must survive.
const nearMiss = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)", "--", marker, "extra"], { stdio: "ignore" });

function visible(pid) {
  const found = spawnSync("ps", ["-Ao", "pid=,args="], { encoding: "utf8" });
  return String(found.stdout || "").split("\n").some((line) => new RegExp(`^\\s*${pid}\\s`).test(line));
}

async function until(condition, ms = 5000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (await condition()) return true;
    await new Promise((wait) => setTimeout(wait, 100));
  }
  return false;
}

const bothVisible = await until(() => visible(orphan.pid) && visible(nearMiss.pid));
test.assert(bothVisible, "both test processes are visible in the process list before reaping");

const reaped = reapStaleServers(marker);
test.assert(reaped.includes(orphan.pid), "the reaper targets the process whose argv ends with the marker");
test.assert(!reaped.includes(process.pid), "the reaper never targets the process running it");
test.assert(!reaped.includes(nearMiss.pid), "the reaper spares a process that only mentions the marker mid-argv");

const orphanGone = await until(() => {
  try {
    process.kill(orphan.pid, 0);
    return false;
  } catch {
    return true;
  }
}, 5000);
test.assert(orphanGone, "the marked orphan actually exits after reaping");

const nearMissAlive = (() => {
  try {
    process.kill(nearMiss.pid, 0);
    return true;
  } catch {
    return false;
  }
})();
test.assert(nearMissAlive, "the near-miss process keeps running");

nearMiss.kill("SIGKILL");
if (orphan.exitCode === null) orphan.kill("SIGKILL");

test.finish();
