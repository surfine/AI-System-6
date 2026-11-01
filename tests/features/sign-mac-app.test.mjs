// Signing keeps the Node entitlements and the app entitlements apart: a custom
// app plist must not replace the Node JIT plist, and a signed build never
// carries get-task-allow. Credentials from the environment warn about argv.

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createFeatureTest, root, read } from "../helpers/feature-test-harness.mjs";
import { NODE_ENTITLEMENTS, debugEntitlementsIn, notaryArguments } from "../../tooling/sign-mac-app.mjs";

const test = createFeatureTest("sign-mac-app");
const plist = read("platform/macos/tinyjs/entitlements.node.plist");
test.assert(
  (plist.match(/<key>/g) || []).length === 2 && plist.includes("allow-jit") && plist.includes("allow-unsigned-executable-memory") && !plist.includes("get-task-allow"),
  "the checked-in Node plist holds exactly the two JIT keys",
);
test.assert(NODE_ENTITLEMENTS.endsWith("entitlements.node.plist"), "Node entitlements default to the checked-in plist");

const scratch = mkdtempSync(join(tmpdir(), "ais6-sign-test-"));
try {
  const debugPlist = join(scratch, "debug.plist");
  writeFileSync(debugPlist, "<plist><dict><key>com.apple.security.get-task-allow</key><true/></dict></plist>");
  test.assert(debugEntitlementsIn([NODE_ENTITLEMENTS, debugPlist]) === debugPlist, "get-task-allow is detected in either plist");
  test.assert(debugEntitlementsIn([NODE_ENTITLEMENTS, ""]) === "", "the shipped Node plist is clean");

  // Behaviour through the CLI: a signing identity plus a debug app plist is refused before anything is signed.
  const app = join(scratch, "X.app");
  spawnSync("mkdir", ["-p", app]);
  const run = (args) => spawnSync(process.execPath, [join(root, "tooling/sign-mac-app.mjs"), "--app", app, "--identity", "ABCDEF", ...args], { encoding: "utf8", env: { PATH: process.env.PATH } });
  const refusedApp = run(["--entitlements", debugPlist]);
  test.assert(refusedApp.status === 1 && /get-task-allow/.test(refusedApp.stderr), "a debuggable app plist is refused for a signed build");
  const refusedNode = run(["--node-entitlements", debugPlist]);
  test.assert(refusedNode.status === 1 && /get-task-allow/.test(refusedNode.stderr), "a debuggable Node plist is refused for a signed build");

  // Production never degrades: --require-notarization without credentials or an identity is an error, not "NOT EXECUTED".
  const strictApp = (args) => spawnSync(process.execPath, [join(root, "tooling/sign-mac-app.mjs"), "--app", app, "--require-notarization", ...args], { encoding: "utf8", env: { PATH: process.env.PATH } });
  const noCredentials = strictApp(["--identity", "ABCDEF"]);
  test.assert(noCredentials.status === 1 && /no notarization credentials/.test(noCredentials.stderr), "a required notarization without credentials fails closed");
  const noIdentity = strictApp([]);
  test.assert(noIdentity.status === 1 && /not falling back to ad-hoc/.test(noIdentity.stderr), "a required notarization without an identity never signs ad-hoc");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const warnings = [];
const originalError = console.error;
console.error = (message) => warnings.push(String(message));
try {
  test.assert(notaryArguments({ keychainProfile: "p" }, {}).join(" ") === "--keychain-profile p" && warnings.length === 0, "a keychain profile passes no secret on argv and warns nothing");
  const viaEnv = notaryArguments({ keychainProfile: "" }, { AI_SYSTEM6_NOTARY_KEY_ID: "k", AI_SYSTEM6_NOTARY_ISSUER: "i", AI_SYSTEM6_NOTARY_KEY: "f" });
  test.assert(viaEnv && /command line/.test(warnings.join(" ")), "environment credentials warn that argv is visible");
} finally {
  console.error = originalError;
}

test.finish();
