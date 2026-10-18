#!/usr/bin/env node
// Developer ID signing + notarization for the macOS app and its DMG.
//
// Identity: --identity <sha1> or AI_SYSTEM6_DEVELOPER_ID. Prefer the SHA-1 of
// the certificate so a duplicate-named certificate can never be picked.
//
// Notary credentials (never commit values), first match wins:
//   --keychain-profile <name> / AI_SYSTEM6_NOTARY_PROFILE   notarytool keychain profile
//   AI_SYSTEM6_NOTARY_KEY_ID + _ISSUER + _KEY               App Store Connect API key
//   AI_SYSTEM6_NOTARY_APPLE_ID + _APP_PASSWORD + AI_SYSTEM6_TEAM_ID
//
// Signing order (the reason --deep is not used to sign):
//   1. every nested Mach-O, deepest first, one codesign each; only the embedded
//      Node binary gets entitlements (JIT), because --force drops entitlements
//      and Node dies under hardened runtime without them;
//   2. the bundle itself, shallow, hardened runtime + secure timestamp;
//   3. --deep appears only in the verify step.
//
// Behavior (fail honest):
//   - no identity                -> ad-hoc sign only, report NOT EXECUTED
//   - identity only              -> sign + verify, notarization NOT EXECUTED
//   - identity + notary creds    -> sign + verify + notarize + staple + verify
//
//   node tooling/sign-mac-app.mjs --app dist/X.app [--dmg dist/X.dmg]
//     [--identity <sha1>] [--keychain-profile <name>] [--node-entitlements <node.plist>] [--entitlements <app.plist>]

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { collectMachOFiles } from "./build-tinyjs-shell-app.mjs";

export const NODE_ENTITLEMENTS = resolve(fileURLToPath(new URL("../platform/macos/tinyjs/entitlements.node.plist", import.meta.url)));

function run(command, args, { cwd } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`command failed: ${command} (exit ${result.status}; arguments omitted)`);
    process.exit(1);
  }
  return result;
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return { status: result.status, stdout: String(result.stdout || ""), stderr: String(result.stderr || "") };
}

function xcrun() {
  const candidates = ["/usr/bin/xcrun", "/Applications/Xcode.app/Contents/Developer/usr/bin/xcrun"];
  return candidates.find((candidate) => existsSync(candidate)) || "xcrun";
}

function parseArguments(argv, env = process.env) {
  const options = {
    app: "", dmg: "", nodeEntitlements: NODE_ENTITLEMENTS, entitlements: "",
    identity: String(env.AI_SYSTEM6_DEVELOPER_ID || "").trim(),
    keychainProfile: String(env.AI_SYSTEM6_NOTARY_PROFILE || "").trim(),
  };
  const take = (index) => argv[index + 1] || "";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--app") options.app = resolve(take(index));
    else if (arg === "--dmg") options.dmg = resolve(take(index));
    else if (arg === "--node-entitlements") options.nodeEntitlements = resolve(take(index));
    else if (arg === "--entitlements") options.entitlements = resolve(take(index));
    else if (arg === "--identity") options.identity = take(index).trim();
    else if (arg === "--keychain-profile") options.keychainProfile = take(index).trim();
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node tooling/sign-mac-app.mjs [--app <path.app>] [--dmg <path.dmg>] [--identity <sha1>] "
        + "[--keychain-profile <name>] [--node-entitlements <node.plist>] [--entitlements <app.plist>]");
      process.exit(0);
    }
    if (["--app", "--dmg", "--node-entitlements", "--entitlements", "--identity", "--keychain-profile"].includes(arg)) index += 1;
  }
  return options;
}

/**
 * Debug entitlements make a binary debuggable by any process, so a signed
 * (non ad-hoc) build never carries them. Returns the offending plist or "".
 */
export function debugEntitlementsIn(plistPaths, readText = (file) => readFileSync(file, "utf8")) {
  return plistPaths.filter(Boolean).find((file) => /com\.apple\.security\.get-task-allow/.test(readText(file))) || "";
}

/** notarytool credential arguments, or null when none are configured. */
export function notaryArguments(options, env = process.env) {
  if (options.keychainProfile) return ["--keychain-profile", options.keychainProfile];
  const argvWarning = "WARNING: notarization credentials from the environment are passed to notarytool on its command line, "
    + "where other local processes can read them. Prefer a keychain profile (--keychain-profile / AI_SYSTEM6_NOTARY_PROFILE).";
  if (env.AI_SYSTEM6_NOTARY_KEY_ID && env.AI_SYSTEM6_NOTARY_ISSUER && env.AI_SYSTEM6_NOTARY_KEY) {
    console.error(argvWarning);
    return ["--key-id", env.AI_SYSTEM6_NOTARY_KEY_ID, "--issuer", env.AI_SYSTEM6_NOTARY_ISSUER, "--key", env.AI_SYSTEM6_NOTARY_KEY];
  }
  if (env.AI_SYSTEM6_NOTARY_APPLE_ID && env.AI_SYSTEM6_NOTARY_APP_PASSWORD && env.AI_SYSTEM6_TEAM_ID) {
    console.error(argvWarning);
    return ["--apple-id", env.AI_SYSTEM6_NOTARY_APPLE_ID, "--password", env.AI_SYSTEM6_NOTARY_APP_PASSWORD, "--team-id", env.AI_SYSTEM6_TEAM_ID];
  }
  return null;
}

function codesignBase(identity) {
  return identity === "-"
    ? ["--force", "--sign", "-"]
    : ["--force", "--options", "runtime", "--timestamp", "--sign", identity];
}

/** Nested code first, deepest path first; only Node carries entitlements. */
function signNested(app, identity, nodeEntitlements) {
  const files = collectMachOFiles(app);
  files.sort((a, b) => (b.split("/").length - a.split("/").length) || (b.length - a.length));
  for (const file of files) {
    const args = codesignBase(identity);
    if (identity !== "-" && basename(file) === "node") args.push("--entitlements", nodeEntitlements);
    run("/usr/bin/codesign", [...args, file]);
  }
  console.log(`OK  signed ${files.length} nested Mach-O file(s) inside-out`);
}

function verifyBundle(app) {
  const verify = runCapture("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  if (verify.status !== 0) {
    console.error("codesign --verify failed:\n" + verify.stderr);
    process.exit(1);
  }
  console.log("OK  codesign --verify --deep --strict");
}

function notarize(artifact, credentials) {
  run(xcrun(), ["notarytool", "submit", artifact, "--wait", "--timeout", "20m", ...credentials]);
}

function staple(artifact) {
  run(xcrun(), ["stapler", "staple", artifact]);
  const validate = runCapture(xcrun(), ["stapler", "validate", artifact]);
  if (validate.status !== 0) {
    console.error("stapler validate failed:\n" + validate.stderr);
    process.exit(1);
  }
  console.log(`OK  stapler validate ${basename(artifact)} — ticket stapled`);
}

function assess(artifact, type, required) {
  const context = type === "open" ? ["--context", "context:primary-signature"] : [];
  const result = runCapture("/usr/sbin/spctl", ["--assess", "--type", type, ...context, "--verbose=4", artifact]);
  if (result.status === 0) console.log(`OK  spctl --assess --type ${type} ${basename(artifact)}`);
  else if (required) {
    console.error("spctl assessment failed:\n" + result.stderr);
    process.exit(1);
  } else console.error("spctl assessment failed (expected before notarization):\n" + result.stderr);
}

function signApp(options, credentials) {
  const { app, identity } = options;
  signNested(app, identity, options.nodeEntitlements);
  const seal = codesignBase(identity);
  if (identity !== "-" && options.entitlements) seal.push("--entitlements", options.entitlements);
  run("/usr/bin/codesign", [...seal, app]);
  verifyBundle(app);
  if (identity === "-") return;
  assess(app, "execute", false);
  if (!credentials) return;
  const scratch = mkdtempSync(join(tmpdir(), "ai-system6-notary-"));
  try {
    const archive = join(scratch, basename(app) + ".zip");
    run("/usr/bin/ditto", ["-c", "-k", "--keepParent", app, archive]);
    notarize(archive, credentials);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  staple(app);
  assess(app, "execute", true);
}

function signDmg(options, credentials) {
  run("/usr/bin/codesign", [...codesignBase(options.identity), options.dmg]);
  console.log(`OK  signed ${basename(options.dmg)}`);
  if (!credentials) return;
  notarize(options.dmg, credentials);
  staple(options.dmg);
  assess(options.dmg, "open", true);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const targets = [options.app, options.dmg].filter(Boolean);
  if (targets.length === 0 || targets.some((target) => !existsSync(target))) {
    console.error(`Nothing to sign or not found: ${targets.join(", ") || "(none)"}`);
    process.exit(1);
  }
  for (const [label, file] of [["Node entitlements", options.nodeEntitlements], ["App entitlements", options.entitlements]]) {
    if (options.app && file && !existsSync(file)) {
      console.error(`${label} plist not found: ${file}`);
      process.exit(1);
    }
  }
  if (!options.identity) {
    console.error("NOT EXECUTED: no signing identity (--identity or AI_SYSTEM6_DEVELOPER_ID); signing ad-hoc (Control-click -> Open still required).");
    options.identity = "-";
  }
  const debuggable = options.identity === "-" || !options.app ? "" : debugEntitlementsIn([options.nodeEntitlements, options.entitlements]);
  if (debuggable) {
    console.error(`Refusing to sign with get-task-allow in ${debuggable}: a signed build must not be debuggable.`);
    process.exit(1);
  }
  const credentials = options.identity === "-" ? null : notaryArguments(options);
  if (options.identity !== "-" && !credentials) {
    console.error("NOT EXECUTED: notarization credentials unavailable (keychain profile, App Store Connect API key, or Apple ID + app password + team id). Signed with Hardened Runtime but not notarized.");
  }
  if (options.app) signApp(options, credentials);
  if (options.dmg && options.identity !== "-") signDmg(options, credentials);
}

const invokedDirectly = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invokedDirectly) main();
