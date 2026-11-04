// Two institutional frictions the 2026-11-04 beta.2 mac round paid for, pinned
// so the next release does not pay again:
//
// A. The Mac gates run inside the frozen release tree, which does not carry
//    the gitignored signing.local.json. Before this, the release refused
//    instantly with a missing-config error and the only working path was
//    remembering to export AI_SYSTEM6_DEVELOPER_ID / AI_SYSTEM6_NOTARY_PROFILE
//    by hand in the operator's shell.
// B. Step logs lived under the staging tree, which a refusal removes. Three
//    refused mac rounds left nothing to read, so every diagnosis began with a
//    reproduction that cost minutes.
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("release-frozen-env-and-log-retention");

const source = read("tooling/release-prepare.mjs");
// Comments describe intent; a claim about what the code DOES reads source.
const code = source.replace(/^\s*\/\/.*$/gm, "");

// --- A: the signing identity reaches the frozen Mac gates -------------------
test.assertIncludes(
  source,
  'import { readMacSigningConfig, withMacSigningDefaults } from "./lib/mac-signing.mjs";',
  "release-prepare imports the one signing resolver the Mac build also reads"
);
test.assertMatches(
  code,
  /withMacSigningDefaults\(\s*\{[^}]*AI_SYSTEM6_SOURCE_COMMIT[^}]*\},\s*readMacSigningConfig\(sourceRoot\)/,
  "the signing identity is resolved from the SOURCE tree (the frozen tree has no signing.local.json)"
);
test.assertMatches(
  code,
  /const env = macEnvDefaults;/,
  "every Mac gate receives the resolved identity instead of an env built from one key"
);
// The existing convention still holds: an operator export wins over the file.
test.assertIncludes(
  read("tooling/lib/mac-signing.mjs"),
  "if (!String(next.AI_SYSTEM6_DEVELOPER_ID || \"\").trim())",
  "an exported identity is never shadowed by the file"
);

// --- B: a refusal keeps its step logs --------------------------------------
test.assertMatches(
  code,
  /const refusedLogs = path\.join\(releasesRoot, .*-refused.*, "logs"\)/,
  "refused step logs land beside the releases, keyed by the release identity"
);
test.assertMatches(
  code,
  /cp\(path\.join\(staging, "logs"\), refusedLogs, \{ recursive: true, force: true \}\)/,
  "the staging logs are copied before the staging tree is removed"
);
// The copy happens on the refusal path, before that path removes the tree: a
// reader following "see logs/<step>.log" must find a file. (Other paths also
// remove staging, so the assertion reads the tail of the refusal block.)
const copyAt = code.indexOf("const refusedLogs");
const afterCopy = code.slice(copyAt);
test.assert(copyAt > 0 && afterCopy.includes("await removeStagingTree(staging);"),
  "logs are kept before the refusing run removes the staging tree");
test.assert(
  source.includes("Keeping logs is a courtesy"),
  "keeping logs can never turn a refusal into a crash"
);

test.finish();
