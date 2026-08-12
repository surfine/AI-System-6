#!/usr/bin/env node
// Developer ID signing + notarization for the macOS app.
//
// Credential input contract (environment variables; never commit values):
//   AI_SYSTEM6_DEVELOPER_ID        "Developer ID Application: Name (TEAMID)"
//   AI_SYSTEM6_TEAM_ID             Apple Developer team id (for stapler/notary)
//   AI_SYSTEM6_NOTARY_KEY_ID       App Store Connect API key id
//   AI_SYSTEM6_NOTARY_ISSUER       App Store Connect API issuer id
//   AI_SYSTEM6_NOTARY_KEY          App Store Connect API key (.p8 contents or path)
//   AI_SYSTEM6_NOTARY_APPLE_ID     Apple ID (alternative to API key)
//   AI_SYSTEM6_NOTARY_APP_PASSWORD App-specific password for Apple ID
//
// Behavior (fail honest):
//   - no DEVELOPER_ID            -> ad-hoc sign only, report NOT EXECUTED
//   - DEVELOPER_ID only          -> sign + verify, notarization NOT EXECUTED
//   - full credentials           -> sign + verify + notarize + staple + verify
//
//   node tooling/sign-mac-app.mjs --app dist/AI-System-6.app [--entitlements path]

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

function run(command, args, { cwd } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`command failed: ${command} ${args.join(" ")}`);
    process.exit(1);
  }
  return result;
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return { status: result.status, stdout: String(result.stdout || ""), stderr: String(result.stderr || "") };
}

function xcrun(name) {
  const candidates = ["/usr/bin/xcrun", "/Applications/Xcode.app/Contents/Developer/usr/bin/xcrun"];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "xcrun";
}

function parseArguments(argv) {
  const options = { app: "", entitlements: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--app") options.app = resolve(argv[index + 1]);
    else if (argv[index] === "--entitlements") options.entitlements = resolve(argv[index + 1]);
    else if (argv[index] === "--help" || argv[index] === "-h") {
      console.log("Usage: node tooling/sign-mac-app.mjs --app <path.app> [--entitlements <path.plist>]");
      process.exit(0);
    }
  }
  return options;
}

function notaryCredentials() {
  const env = process.env;
  if (env.AI_SYSTEM6_NOTARY_KEY_ID && env.AI_SYSTEM6_NOTARY_ISSUER && env.AI_SYSTEM6_NOTARY_KEY) {
    return { kind: "api-key" };
  }
  if (env.AI_SYSTEM6_NOTARY_APPLE_ID && env.AI_SYSTEM6_NOTARY_APP_PASSWORD && env.AI_SYSTEM6_TEAM_ID) {
    return { kind: "apple-id" };
  }
  return null;
}

const options = parseArguments(process.argv.slice(2));
if (!options.app || !existsSync(options.app)) {
  console.error(`App bundle not found: ${options.app || "(none)"}`);
  process.exit(1);
}

const developerId = String(process.env.AI_SYSTEM6_DEVELOPER_ID || "").trim();
const notary = notaryCredentials();

if (!developerId) {
  console.error("NOT EXECUTED: no AI_SYSTEM6_DEVELOPER_ID certificate identity available; signing ad-hoc (Control-click -> Open still required).");
  run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", options.app]);
  process.exit(0);
}

const signArgs = ["--force", "--deep", "--options", "runtime", "--timestamp", "--sign", developerId];
if (options.entitlements) signArgs.push("--entitlements", options.entitlements);
signArgs.push(options.app);
run("/usr/bin/codesign", signArgs);

const verify = runCapture("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", options.app]);
if (verify.status !== 0) {
  console.error("codesign --verify failed:\n" + verify.stderr);
  process.exit(1);
}
console.log("OK  codesign --verify --deep --strict");

const spctl = runCapture("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", options.app]);
if (spctl.status !== 0) {
  console.error("spctl assessment failed (expected before notarization):\n" + spctl.stderr);
} else {
  console.log("OK  spctl --assess --type execute");
}

if (!notary) {
  console.error("NOT EXECUTED: notarization credentials unavailable (App Store Connect API key or Apple ID + app password + team id). The app is signed with Hardened Runtime but not notarized.");
  process.exit(0);
}

const archive = `${options.app}.zip`;
run("/usr/bin/ditto", ["-c", "-k", "--keepParent", options.app, archive]);

const notaryArgs = ["notarytool", "submit", archive, "--wait", "--timeout", "20m"];
if (notary.kind === "api-key") {
  notaryArgs.push(
    "--key-id", process.env.AI_SYSTEM6_NOTARY_KEY_ID,
    "--issuer", process.env.AI_SYSTEM6_NOTARY_ISSUER,
    "--key", process.env.AI_SYSTEM6_NOTARY_KEY,
  );
} else {
  notaryArgs.push(
    "--apple-id", process.env.AI_SYSTEM6_NOTARY_APPLE_ID,
    "--password", process.env.AI_SYSTEM6_NOTARY_APP_PASSWORD,
    "--team-id", process.env.AI_SYSTEM6_TEAM_ID,
  );
}
run(xcrun("xcrun"), notaryArgs);

run(xcrun("xcrun"), ["stapler", "staple", options.app]);
const staple = runCapture(xcrun("xcrun"), ["stapler", "validate", options.app]);
if (staple.status !== 0) {
  console.error("stapler validate failed:\n" + staple.stderr);
  process.exit(1);
}
console.log("OK  stapler validate — ticket stapled");

const spctlFinal = runCapture("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", options.app]);
if (spctlFinal.status !== 0) {
  console.error("spctl assessment after notarization failed:\n" + spctlFinal.stderr);
  process.exit(1);
}
console.log("OK  spctl --assess after notarization — double-click launch without Control-click");
