// Build the Intel/Monterey legacy app: the old Swift WKWebView shell compiled
// for x86_64-apple-macosx12.0 around a Node 22 darwin-x64 server payload,
// signed (Developer ID + notarized when AI_SYSTEM6_DEVELOPER_ID and a notary
// profile are set, ad-hoc otherwise) and zipped. A manual build line: it is not part of
// `npm run release`, carries no OTA, and writes only under
// dist/mac-legacy-x64/ and dist/mac-server-payload-legacy-x64/, so the
// mainline TinyJS app and its payload are never touched.
//
//   npm run bundle:mac-legacy-x64            # payload + shell + app + zip + gate
//   npm run bundle:mac-legacy-x64 -- --reuse-payload
//
// What the legacy app does not have: OTA, the TinyJS shell.* bridge (the
// desktop falls back to its web paths), Time Machine's native browser and
// Vision OCR (both macOS 26). See
// internal/plans/MAC-LEGACY-INTEL-MONTEREY-PLAN-2026-10-16.md.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MAC_LEGACY_X64 as profile } from "./lib/mac-legacy-profile.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const reusePayload = args.includes("--reuse-payload");
const packagePath = join(repoRoot, "platform", "macos", "shell", "macos-webview");
const outputDir = join(repoRoot, profile.outputDir);
const payloadDir = join(repoRoot, profile.payloadDir);
const appDir = join(outputDir, `${profile.appDisplayName}.app`);

function step(label, command, commandArgs, options = {}) {
  console.log(`\n== ${label}`);
  const result = spawnSync(command, commandArgs, { cwd: repoRoot, stdio: "inherit", ...options });
  if (result.status !== 0) {
    console.error(`${label} failed (exit ${result.status}).`);
    process.exit(result.status || 1);
  }
}

// 1. The front end the payload copies must be current.
step("Build desktop bundles", process.execPath, ["tooling/build-app-bundle.mjs"]);

// 2. Server payload.
if (reusePayload && existsSync(join(payloadDir, "PAYLOAD-RECEIPT.json"))) {
  console.log(`\n== Reusing ${profile.payloadDir}`);
} else {
  step("Server payload (legacy-x64)", process.execPath, ["tooling/build-mac-server-payload.mjs", "--profile", profile.name]);
}

// 3. The shell, release configuration, only the shell product: the Vision
//    helper is a macOS 26 tool and has no place on Monterey.
step("Swift shell (x86_64, macOS 12.0)", "/usr/bin/xcrun", [
  "swift", "build", "--package-path", packagePath,
  "--triple", profile.swiftTriple, "-c", "release", "--product", "AISystem6Shell",
]);
const binPath = execFileSync("/usr/bin/xcrun", [
  "swift", "build", "--package-path", packagePath,
  "--triple", profile.swiftTriple, "-c", "release", "--show-bin-path",
], { cwd: repoRoot, encoding: "utf8" }).trim();
const shellBinary = join(binPath, "AISystem6Shell");

// 4. Assemble the .app with the existing bundler.
step("Assemble app", process.execPath, ["tooling/build-mac-shell-app.mjs", "--server", payloadDir], {
  env: {
    ...process.env,
    AI_SYSTEM6_SKIP_SWIFT_BUILD: "1",
    AI_SYSTEM6_SHELL_BINARY: shellBinary,
    AI_SYSTEM6_MACOS_TARGET_TRIPLE: profile.swiftTriple,
    AI_SYSTEM6_MACOS_DEPLOYMENT_TARGET: profile.deploymentTarget,
    AI_SYSTEM6_APP_DISPLAY_NAME: profile.appDisplayName,
    AI_SYSTEM6_APP_OUTPUT_DIR: outputDir,
    AI_SYSTEM6_EMBED_SWIFT_RUNTIME: "0",
  },
});

// The bundler adds macOS 26 extras when it finds them (the Vision and
// Intelligence helpers, Time Machine's ad blocker); none runs here.
rmSync(join(appDir, "Contents", "MacOS", "AISystem6Vision"), { force: true });
rmSync(join(appDir, "Contents", "MacOS", "AISystem6Intelligence"), { force: true });
rmSync(join(appDir, "Contents", "Resources", "ubol-safari.zip"), { force: true });
writeFileSync(
  join(appDir, "Contents", "Resources", "README.txt"),
  [
    `${profile.appDisplayName} (Intel / macOS 12 legacy build)`,
    "",
    `Starts the bundled AI System 6 server on its bundled Node ${profile.nodeVersion} (x86_64)`,
    `and opens ${profile.serverOrigin} in WKWebView.`,
    "Not included: automatic updates, Time Machine's browser, Apple document recognition, the ClioTalk agent engine.",
    "Logs: ~/Library/Logs/AI System 6 Beta",
  ].join("\n") + "\n",
);

// 5. Signature through the mainline signer: nested Mach-O inside-out, Node
//    with its JIT entitlements, hardened runtime, then notarize and staple
//    when AI_SYSTEM6_DEVELOPER_ID and AI_SYSTEM6_NOTARY_PROFILE are set.
//    Without an identity it signs ad-hoc (first launch: Control-click -> Open).
step("Sign", process.execPath, ["tooling/sign-mac-app.mjs", "--app", appDir]);

// 6. The gate, then the AirDrop zip (ditto keeps symlinks and the signature).
step("verify:mac-legacy", process.execPath, ["tooling/verify-mac-legacy.mjs", "--app", appDir]);
const zipPath = join(outputDir, `${profile.appDisplayName} Intel.zip`);
rmSync(zipPath, { force: true });
step("Zip", "/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appDir, zipPath]);
console.log(`\nLegacy app: ${appDir}\nZip: ${zipPath}`);
