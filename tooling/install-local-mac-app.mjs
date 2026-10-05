#!/usr/bin/env node
/**
 * Replace /Applications/AI System 6 Beta.app from a prepared Mac artifact.
 *
 * This is an operator convenience for the machine that just packaged a beta.
 * It is not an outward publish target: non-darwin hosts skip, and callers that
 * wire it into release:publish must treat failure as a warning.
 *
 * Usage:
 *   node tooling/install-local-mac-app.mjs --app "dist/.../AI System 6 Beta.app"
 *   node tooling/install-local-mac-app.mjs --zip "dist/.../AI System 6 Beta.zip"
 *   node tooling/install-local-mac-app.mjs --receipt dist/releases/<id>/release-receipt.json
 *   npm run install:local-mac -- --receipt ...
 *
 * Skip from release:publish with AI_SYSTEM6_SKIP_LOCAL_MAC_INSTALL=1.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_NAME = "AI System 6 Beta.app";
const DEFAULT_DESTINATION = "/Applications/AI System 6 Beta.app";

function parseArguments(argv) {
  const options = {
    app: "",
    zip: "",
    receipt: "",
    destination: DEFAULT_DESTINATION,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--app") {
      if (!argv[index + 1]) throw new Error("--app requires a path");
      options.app = path.resolve(argv[++index]);
    } else if (argument === "--zip") {
      if (!argv[index + 1]) throw new Error("--zip requires a path");
      options.zip = path.resolve(argv[++index]);
    } else if (argument === "--receipt") {
      if (!argv[index + 1]) throw new Error("--receipt requires a path");
      options.receipt = path.resolve(argv[++index]);
    } else if (argument === "--destination") {
      if (!argv[index + 1]) throw new Error("--destination requires a path");
      options.destination = path.resolve(argv[++index]);
    } else if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--help" || argument === "-h") {
      console.log(`Usage: node tooling/install-local-mac-app.mjs (--app PATH | --zip PATH | --receipt PATH) [--destination PATH] [--dry-run]

Replaces ${DEFAULT_DESTINATION} with the prepared beta app. Darwin only.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  const sources = [options.app, options.zip, options.receipt].filter(Boolean);
  if (sources.length !== 1) {
    throw new Error("Provide exactly one of --app, --zip, or --receipt");
  }
  return options;
}

function run(command, args, { ignoreFailure = false } = {}) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (ignoreFailure) return "";
    throw new Error(`${command} ${args.join(" ")} failed\n${error.stderr || error.message}`);
  }
}

function appFromReceipt(receiptPath) {
  const receiptDirectory = path.dirname(receiptPath);
  const app = path.join(receiptDirectory, "artifacts", "mac", APP_NAME);
  const zip = path.join(receiptDirectory, "artifacts", "mac", "AI System 6 Beta.zip");
  if (existsSync(app) && statSync(app).isDirectory()) return { kind: "app", path: app };
  if (existsSync(zip) && statSync(zip).isFile()) return { kind: "zip", path: zip };
  throw new Error(`Receipt has no prepared Mac app or zip under ${path.join(receiptDirectory, "artifacts", "mac")}`);
}

function extractZip(zipPath) {
  const staging = mkdtempSync(path.join(tmpdir(), "ais6-local-mac-"));
  run("/usr/bin/ditto", ["-x", "-k", zipPath, staging]);
  const direct = path.join(staging, APP_NAME);
  if (existsSync(direct)) return { staging, app: direct };
  const nested = run("/usr/bin/find", [staging, "-maxdepth", "3", "-type", "d", "-name", APP_NAME])
    .trim()
    .split("\n")
    .filter(Boolean)[0];
  if (!nested) {
    rmSync(staging, { recursive: true, force: true });
    throw new Error(`zip did not contain ${APP_NAME}: ${zipPath}`);
  }
  return { staging, app: nested };
}

function readBundleIdentity(appPath) {
  const info = path.join(appPath, "Contents", "Info.plist");
  const version = run("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", info]).trim();
  const build = run("/usr/bin/plutil", ["-extract", "CFBundleVersion", "raw", info]).trim();
  return { version, build };
}

export function shouldInstallLocalMacApp({
  platform = process.platform,
  env = process.env,
  releaseTargets = [],
} = {}) {
  if (platform !== "darwin") return { ok: false, reason: "not darwin" };
  if (env.AI_SYSTEM6_SKIP_LOCAL_MAC_INSTALL === "1") {
    return { ok: false, reason: "AI_SYSTEM6_SKIP_LOCAL_MAC_INSTALL=1" };
  }
  if (!releaseTargets.includes("mac")) return { ok: false, reason: "receipt has no mac target" };
  return { ok: true, reason: null };
}

export function installLocalMacApp({
  app = "",
  zip = "",
  receipt = "",
  destination = DEFAULT_DESTINATION,
  dryRun = false,
  platform = process.platform,
} = {}) {
  if (platform !== "darwin") {
    return { skipped: true, reason: "not darwin" };
  }

  let sourceApp = app;
  let staging = "";
  try {
    if (receipt) {
      const resolved = appFromReceipt(receipt);
      if (resolved.kind === "app") sourceApp = resolved.path;
      else {
        zip = resolved.path;
      }
    }
    if (!sourceApp && zip) {
      ({ staging, app: sourceApp } = extractZip(zip));
    }
    if (!sourceApp || !existsSync(sourceApp) || !statSync(sourceApp).isDirectory()) {
      throw new Error(`Mac app is missing: ${sourceApp || "(empty)"}`);
    }

    const identity = readBundleIdentity(sourceApp);
    if (dryRun) {
      return {
        skipped: false,
        dryRun: true,
        source: sourceApp,
        destination,
        ...identity,
      };
    }

    run("/usr/bin/osascript", [
      "-e",
      'tell application "System Events" to if exists process "AISystem6Shell" then tell application "AI System 6 Beta" to quit',
    ], { ignoreFailure: true });
    // Give the shell a moment to release file locks before ditto replaces it.
    run("/bin/sleep", ["0.5"], { ignoreFailure: true });

    if (existsSync(destination)) {
      rmSync(destination, { recursive: true, force: true });
    }
    run("/usr/bin/ditto", [sourceApp, destination]);
    run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", destination], { ignoreFailure: true });
    run("/usr/bin/touch", [destination], { ignoreFailure: true });
    run(
      "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
      ["-f", destination],
      { ignoreFailure: true },
    );

    const installed = readBundleIdentity(destination);
    return {
      skipped: false,
      dryRun: false,
      source: sourceApp,
      destination,
      ...installed,
    };
  } finally {
    if (staging) rmSync(staging, { recursive: true, force: true });
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (process.platform !== "darwin") {
    console.log("Skipping local Mac install: not darwin.");
    return;
  }
  const result = installLocalMacApp(options);
  if (result.dryRun) {
    console.log(`Would install ${result.destination} ← ${result.source} (${result.version} / ${result.build})`);
    return;
  }
  console.log(`Installed ${result.destination} (${result.version} / ${result.build}) from ${result.source}`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
