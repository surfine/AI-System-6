// The prerelease Mac-target guard (2026-11-04): a prerelease that publishes
// github or web without --mac is a forgotten flag, not a decision. The
// README's status line and Mac Beta button point at the GitHub release the
// Mac zip creates, and a sealed receipt cannot gain the Mac chain later, so
// the omission forced a whole re-prepare under a new build stamp on
// 2026-11-04. The guard refuses at argument parsing, the cheapest point
// there is, unless the omission says its own name through --no-mac.
import { spawnSync } from "node:child_process";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("release-mac-target-guard");

const source = read("tooling/release-prepare.mjs");

// --- The refusal itself, run for real ------------------------------------
//
// The current version is a prerelease ("-"), so this exact invocation must
// refuse before preflight spends a second: parse, throw, exit. The message
// names both doors out.
const run = spawnSync(process.execPath, ["tooling/release-prepare.mjs", "--github", "--web"], {
  encoding: "utf8",
  timeout: 30000,
});
test.assert(run.status !== 0, "a prerelease publishing github or web without --mac refuses");
test.assert(
  (run.stderr || run.stdout || "").includes("--no-mac"),
  "the refusal names the --no-mac door out"
);
test.assert(
  (run.stderr || run.stdout || "").includes("cannot gain the Mac chain later"),
  "the refusal says why: a sealed receipt cannot be extended"
);

// --- The waiver is a real flag, not a magic string in the message -----------
test.assert(
  source.includes('else if (argument === "--no-mac") options.noMac = true;'),
  "--no-mac parses into the options record"
);
test.assert(
  source.includes("!options.noMac"),
  "the guard reads the waiver"
);
test.assert(
  source.includes("--no-mac") && source.includes("without the Mac"),
  "the help text documents the waiver in plain words"
);

// --- Scope: the guard is a prerelease concern, stated as such ---------------
test.assertMatches(
  source,
  /String\(productVersion\)\.includes\("-"\)[\s\S]*?options\.targets\.includes\("github"\)/,
  "the guard fires on prerelease versions carrying github or web"
);

test.finish();
