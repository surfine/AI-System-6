import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "ais6-feedback-"));
const put = (path, text) => writeFileSync(join(scratch, path), text);
const run = (script, args = [], env = {}) => spawnSync(process.execPath, [join(scratch, "tooling", script), ...args], {
  cwd: scratch, encoding: "utf8", env: { ...process.env, ...env }, timeout: 20000,
});
try {
  for (const dir of ["tooling", "tests/features", "bin"]) mkdirSync(join(scratch, dir), { recursive: true });
  copyFileSync(new URL("../../tooling/verify-features.mjs", import.meta.url), join(scratch, "tooling/verify-features.mjs"));
  copyFileSync(new URL("../../tooling/verify-quick.mjs", import.meta.url), join(scratch, "tooling/verify-quick.mjs"));
  put(
    "tests/feature-manifest.mjs",
    "export const publicProductContracts = []; export const publicContractFiles = () => [];"
    + " export const batchContractNames = Object.freeze([]);",
  );
  put("tests/features/good.test.mjs", "console.log('success-detail-'.repeat(10000)); console.error('warning retained');");
  let result = run("verify-features.mjs", ["good", "typo"]);
  assert.equal(result.status, 2, "a valid selector must not hide an unknown selector");
  assert.match(result.stderr, /No tests ran/);
  assert.equal(readdirSync(scratch).includes("dist"), false, "invalid selectors cannot start tests or create evidence");
  assert.equal(run("verify-features.mjs", ["--typo"]).status, 2);
  assert.equal(run("verify-features.mjs", ["--jobs", "0", "good"]).status, 2);
  result = run("verify-features.mjs", ["good"]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.length < 1500, "large successful output stays off the feedback channel");
  const logDir = result.stdout.match(/Full feature logs: (.+)/)[1];
  const summary = JSON.parse(readFileSync(join(logDir, "summary.json")));
  const log = readFileSync(summary.tests[0].logPath, "utf8");
  assert.ok(log.includes("success-detail-") && log.includes("warning retained"), "stdout and stderr remain recoverable");
  assert.ok(summary.tests[0].outputBytes > 100000);
  result = run("verify-features.mjs", ["good", "--verbose"]);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.length > 100000, "verbose is an explicit escape hatch");
  put("tests/features/bad.test.mjs", "console.log('earlier-'.repeat(20000)); console.error('specific failure'); process.exit(7);");
  result = run("verify-features.mjs", ["bad"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /specific failure/);
  assert.match(result.stderr, /exit 7/);
  assert.ok(result.stderr.length < 7000, "failure diagnostics keep a bounded tail");
  put(
    "tests/feature-manifest.mjs",
    "export const publicProductContracts = [{feature:'missing public contract', tests:['missing.test.mjs']}];"
    + " export const publicContractFiles = () => ['missing.test.mjs'];"
    + " export const batchContractNames = Object.freeze([]);",
  );
  result = run("verify-features.mjs", ["good"]);
  assert.equal(result.status, 1, "compact output still enforces public coverage");
  assert.match(result.stderr, /missing public-safe contract/);

  // Execute quick in an isolated project. The fixture gate has the same
  // build opt-out contract as verify:gate; command failures must stop the chain.
  put("bin/git", "#!/bin/sh\nexit 0\n");
  put("bin/npm", "#!/bin/sh\nprintf 'build\\n' >> builds.log\nexit ${BUILD_STATUS:-0}\n");
  const { chmodSync } = await import("node:fs");
  chmodSync(join(scratch, "bin/git"), 0o755);
  chmodSync(join(scratch, "bin/npm"), 0o755);
  put("tooling/verify-gate.mjs", `import { appendFileSync } from 'node:fs';
if (!process.argv.includes('--no-build')) appendFileSync('builds.log', 'build\\n');
appendFileSync('gates.log', 'gate\\n');`);
  const env = { PATH: `${join(scratch, "bin")}:${process.env.PATH}` };
  result = run("verify-quick.mjs", ["--gate", "fixture"], env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(scratch, "builds.log"), "utf8"), "build\n", "quick plus gate builds exactly once");
  result = run("verify-quick.mjs", ["--gate", "fixture", "--no-build"], env);
  assert.equal(result.status, 0);
  assert.equal(readFileSync(join(scratch, "builds.log"), "utf8"), "build\n", "no-build applies to the entire chain");
  result = run("verify-quick.mjs", ["--gate", "fixture"], { ...env, BUILD_STATUS: "3" });
  assert.equal(result.status, 3);
  assert.equal(readFileSync(join(scratch, "gates.log"), "utf8"), "gate\ngate\n", "a failed build prevents gate execution");

  // One selection set, one runner. `--feature` and `--file` reaching the suite
  // as two runs, with the second selection containing the first again, is the
  // same contract measured twice; the fixture counts the runs instead of
  // trusting the wiring.
  const buildsSoFar = readFileSync(join(scratch, "builds.log"), "utf8");
  put("tooling/select-feature-contracts.mjs", "console.log('good');");
  put(
    "tooling/verify-features.mjs",
    "import { appendFileSync } from 'node:fs';\n"
    + "const args = process.argv.slice(2);\n"
    + "if (args.includes('--list')) { console.log('good'); process.exit(0); }\n"
    + "appendFileSync('features.log', `${args.join(' ')}\\n`);",
  );
  result = run("verify-quick.mjs", ["--feature", "good", "--file", "app/features/good.js", "--no-build"], env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(join(scratch, "features.log"), "utf8"),
    "good\n",
    "selecting a contract by name and by file starts the suite once, with the union deduped",
  );
  assert.equal(readFileSync(join(scratch, "builds.log"), "utf8"), buildsSoFar, "and that run builds nothing of its own");

  // A mistyped selector is answered before the build: the list comes from the
  // suite, so the naming rule is not written down twice.
  result = run("verify-quick.mjs", ["--feature", "typo"], env);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown feature selector\(s\): typo/);
  assert.match(result.stderr, /nothing was built/);
  assert.equal(readFileSync(join(scratch, "builds.log"), "utf8"), buildsSoFar, "a typo does not cost a bundle rebuild");

  console.log("OK  development feedback: bounded logs, selector integrity, coverage and one-build gate chain");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
