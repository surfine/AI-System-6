// Packaging contract for the TinyJS shell adapter. Every assertion is made
// against the real exports of tooling/build-tinyjs-shell-app.mjs and
// tooling/build-tinyjs-native.mjs — the pure planning functions only, so this
// file never builds, signs, archives or touches the network.

import vm from "node:vm";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import {
  OTA_ARCHIVE_BASE_URL,
  OTA_MANIFEST_URL,
  REPO_ROOT,
  TINYJS_CONFIG_FILE,
  TINYJS_RELATIVE_CLI,
  TINYJS_RELATIVE_LAUNCHER,
  assertSupportedArch,
  buildOtaManifest,
  buildTinyjsBuildArgs,
  buildVersionMetadata,
  commandFailed,
  evaluatePackagedRuntime,
  notaryCredentialsPresent,
  otaUpdateLocations,
  parseArguments,
  parseMinimumOsVersion,
  parseOtoolLibraries,
  planTinyjsPackaging,
  resolveAppIdentity,
  resolveProductIdentity,
  resolveSigningPlan,
  sha256Buffer,
  slugify,
  tinyjsCliInvocation,
  usage,
} from "../../tooling/build-tinyjs-shell-app.mjs";
import { extendBridge, extendLauncher } from "../../tooling/build-tinyjs-native.mjs";

const test = createFeatureTest("tinyjs-packaging");

// The controller's own project declaration, read as data so the identity
// assertions are held to the config that actually ships.
const config = JSON.parse(readFileSync(new URL("../../" + TINYJS_CONFIG_FILE, import.meta.url), "utf8"));

// A refusal is evidence only if it is reported. A bare assert.throws would let
// the file die before finish(), which the harness rejects as an unread
// contract, so every refusal goes through the harness.
function rejects(fn, pattern, message) {
  let failed = false;
  try {
    fn();
  } catch (error) {
    failed = pattern.test(String(error?.message ?? error));
  }
  test.assert(failed, message);
}

// --- CLI invocation: the launcher is driven as `tjs run <cli.js> ...` --------

test.assert(
  TINYJS_RELATIVE_LAUNCHER === "vendor/tinyjs/bin/tjs" && TINYJS_RELATIVE_CLI === "vendor/tinyjs/cli.js",
  "the pinned launcher and CLI paths are the controller-owned vendor files",
);

const invocation = tinyjsCliInvocation(REPO_ROOT, buildTinyjsBuildArgs({ arch: "arm64" }));
test.assert(invocation.args[0] === "run", "the pinned CLI is invoked through the `run` subcommand first");
test.assert(
  invocation.args[1].endsWith(TINYJS_RELATIVE_CLI),
  "the CLI entry (`vendor/tinyjs/cli.js`) is the first argument after `run`",
);
test.assert(
  invocation.command.endsWith(TINYJS_RELATIVE_LAUNCHER),
  "the command is the launcher (vendor/tinyjs/bin/tjs), not `node`",
);
test.assert(
  invocation.args.includes("--arch") && invocation.args[invocation.args.indexOf("--arch") + 1] === "arm64",
  "the build request targets arm64",
);
test.assert(
  buildTinyjsBuildArgs({ arch: "arm64", dmg: false }).join(" ") === "build --arch arm64",
  "a plain build passes `build --arch arm64` with no extra flag",
);
test.assert(
  buildTinyjsBuildArgs({ arch: "arm64", dmg: true }).includes("--dmg"),
  "--dmg is only added when explicitly requested",
);
test.assert(
  usage().includes("never runs tinyjs publish"),
  "the adapter documents that `tinyjs publish` is never invoked",
);

// --- Architecture gate -----------------------------------------------------

test.assert(assertSupportedArch("arm64") === "arm64", "arm64 is the supported architecture");
rejects(() => assertSupportedArch("x64"), /Unsupported architecture/, "x64 is rejected");
rejects(() => assertSupportedArch(""), /Unsupported architecture/, "an empty architecture is rejected");

// --- App identity from the controller config -------------------------------

const app = resolveAppIdentity(config);
test.assert(app.bundleIdentifier === config.id, "the app identity takes its bundle id from tinyjs.json `id`");
test.assert(app.title === config.title, "the human title comes from tinyjs.json `title`");
test.assert(app.shellVersion === config.version, "the shell version comes from tinyjs.json `version`");
test.assert(
  app.executableName === config.name && app.slug === slugify(config.title),
  "the executable name and slug derive from the same config record",
);
rejects(() => resolveAppIdentity({ version: "1.0.0" }), /title/, "a title is required");
rejects(() => resolveAppIdentity({ title: "AI System 6 Beta" }), /version/, "a shell version is required");

// --- Product identity vs. shell version ------------------------------------

const pkg = { version: "1.2.3" };
const buildInfo = { build: "20261011.1" };
const product = resolveProductIdentity({ pkg, buildInfo, gitHead: "abcdef1234567890", config });
test.assert(product.productVersion === "1.2.3" && product.productBuild === "20261011.1",
  "the product version/build come from package.json and build-info.json");
test.assert(product.sourceCommit === "abcdef1234567890", "the product carries the source commit");
test.assert(
  product.shellVersion === config.version
    && product.shellVersion !== product.productVersion
    && product.shellVersion !== product.productBuild,
  "the shell version is separate from productVersion and productBuild",
);
test.assert(
  product.productBuild === product.build && product.arch === "arm64" && product.minimumOS === "15.0",
  "the product identity pins arm64 and macOS 15.0 (matching the update worker's checks)",
);
rejects(() => resolveProductIdentity({ pkg: {}, buildInfo, config }), /package\.json/, "a product version is required");
rejects(() => resolveProductIdentity({ pkg, buildInfo: {}, config }), /build-info\.json/, "a build stamp is required");

// --- Signing: fail closed in production, explicit ad-hoc policy ------------

rejects(
  () => resolveSigningPlan({ env: {}, production: true }),
  /AI_SYSTEM6_DEVELOPER_ID/,
  "production without Developer ID credentials is refused",
);
rejects(
  () => resolveSigningPlan({ env: { AI_SYSTEM6_DEVELOPER_ID: "Developer ID Application: X (TEAMID)" }, production: true }),
  /notarization credentials/,
  "production with Developer ID but no notarization credentials is still refused",
);
test.assert(
  resolveSigningPlan({ env: {}, production: true, allowAdhoc: true }).mode === "ad-hoc",
  "production succeeds only when ad-hoc is explicitly allowed (the 1.0.59 policy)",
);
const full = resolveSigningPlan({
  env: {
    AI_SYSTEM6_DEVELOPER_ID: "Developer ID Application: X (TEAMID)",
    AI_SYSTEM6_NOTARY_KEY_ID: "KEYID",
    AI_SYSTEM6_NOTARY_ISSUER: "issuer-uuid",
    AI_SYSTEM6_NOTARY_KEY: "p8-fixture-not-a-real-key",
  },
  production: true,
});
test.assert(full.mode === "developer-id" && full.notarize === true && full.identity !== "-",
  "production with full credentials selects Developer ID signing and notarization");
test.assert(
  resolveSigningPlan({ env: { AI_SYSTEM6_DEVELOPER_ID: "Developer ID Application: X (TEAMID)" } }).notarize === false,
  "a Developer ID dev build is notarized only when notary credentials are present",
);
test.assert(
  resolveSigningPlan({ env: { TINYJS_SIGN_IDENTITY: "Developer ID Application: Y (TEAMID)" } }).identity
    === "Developer ID Application: Y (TEAMID)",
  "TINYJS_SIGN_IDENTITY is the task-specific override",
);
test.assert(resolveSigningPlan({ env: {} }).mode === "ad-hoc", "dev falls back to ad-hoc");
test.assert(commandFailed({ status: 0 }) === false && commandFailed({ status: 1 }) === true,
  "only a zero exit status is a success");
test.assert(
  notaryCredentialsPresent({ AI_SYSTEM6_NOTARY_APPLE_ID: "a@b.c", AI_SYSTEM6_NOTARY_APP_PASSWORD: "pw", AI_SYSTEM6_TEAM_ID: "T" })
    && notaryCredentialsPresent({ AI_SYSTEM6_NOTARY_KEY_ID: "K", AI_SYSTEM6_NOTARY_ISSUER: "I", AI_SYSTEM6_NOTARY_KEY: "P" })
    && notaryCredentialsPresent({ AI_SYSTEM6_NOTARY_KEY_ID: "K" }) === false,
  "notary credentials require a complete API key or Apple ID triple",
);

// --- OTA: manifest URL and archive URL derived from the final hash ---------

const ota = otaUpdateLocations({ appTitle: config.title, shellVersion: "1.0.59", arch: "arm64" });
test.assert(ota.manifestUrl === OTA_MANIFEST_URL && ota.manifestUrl.endsWith("/updates/stable/manifest.json"),
  "the manifest URL is the stable channel pointer");
test.assert(
  ota.archiveUrl === OTA_ARCHIVE_BASE_URL + "/1.0.59/" + app.slug + "-1.0.59-arm64.zip",
  "the archive URL is versioned under the same base and names the slug, version and arch",
);
test.assert(
  ota.versionedBaseUrl === OTA_ARCHIVE_BASE_URL + "/1.0.59" && ota.archiveUrl.startsWith(ota.versionedBaseUrl + "/"),
  "the archive lives under the versioned base of the stable channel",
);
rejects(() => otaUpdateLocations({ appTitle: "", shellVersion: "1.0.0" }), /title/, "OTA locations need a title");
rejects(() => otaUpdateLocations({ appTitle: "AI System 6 Beta", shellVersion: "" }), /version/, "OTA locations need a version");

const zipSha = sha256Buffer(Buffer.from("sealed app archive"));
test.assert(/^[0-9a-f]{64}$/.test(zipSha), "sha256Buffer returns a lowercase hex digest");
const manifest = buildOtaManifest({ identity: product, archiveUrl: ota.archiveUrl, sha256: zipSha, size: 4096 });
test.assert(manifest.sha256 === zipSha && manifest.version === config.version,
  "the manifest hash is the final archive hash and version is the shell version",
);
test.assert(
  manifest.url === ota.archiveUrl && manifest.platform === "darwin-arm64" && manifest.size === 4096,
  "the manifest points at the versioned archive URL for darwin-arm64",
);
test.assert(
  manifest.product.version === product.productVersion
    && manifest.product.build === product.productBuild
    && manifest.product.commit === product.sourceCommit,
  "the manifest separates the product identity from the shell version",
);
rejects(() => buildOtaManifest({ identity: product, archiveUrl: ota.archiveUrl, sha256: "not-a-hash" }),
  /sha256/, "a manifest cannot be derived without the real archive hash");
rejects(() => buildOtaManifest({ identity: product, sha256: zipSha }), /archive URL/,
  "a manifest without an archive URL is refused");

const metadata = buildVersionMetadata({ identity: product, zipPath: "/tmp/AI System 6 Beta.zip", sha256: zipSha, size: 4096, manifestUrl: ota.manifestUrl });
test.assert(
  metadata.archive.sha256 === zipSha && metadata.shell.version === config.version
    && metadata.product.version === product.productVersion && metadata.manifest.url === ota.manifestUrl,
  "the version metadata carries the same archive hash, shell version, product version and manifest URL",
);

// --- Runtime gate (pure, with an injected runner) ---------------------------

const helperPath = new URL("../../platform/macos/tinyjs/native/Downloads.swift", import.meta.url).pathname;
const goodRunner = (command, args) => {
  const probe = [command, ...args].join(" ");
  if (probe.endsWith("--version")) return { status: 0, stdout: "v24.5.0\n", stderr: "" };
  if (probe.startsWith("lipo -verify_arch arm64")) return { status: 0, stdout: "", stderr: "" };
  if (probe.startsWith("lipo")) return { status: 1, stdout: "", stderr: "incompatible architecture" };
  if (probe.startsWith("otool -L")) {
    return { status: 0, stdout: "binary:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n\t/System/Library/Frameworks/AppKit.framework/Versions/C/AppKit (compatibility version 1.0.0)\n", stderr: "" };
  }
  return { status: 0, stdout: "cmd LC_BUILD_VERSION\n      minos 15.0\n", stderr: "" };
};
const healthy = evaluatePackagedRuntime({ nodePath: "/tmp/node", helperPath, arch: "arm64", runCommand: goodRunner });
test.assert(healthy.ok === true && healthy.reasons.length === 0 && healthy.node.archVerified && healthy.helper.archVerified,
  "a Node 24 arm64 runtime with only system libraries and an arm64 helper is accepted");

const wrongArch = evaluatePackagedRuntime({
  nodePath: "/tmp/node", helperPath: "", arch: "arm64",
  runCommand: (command, args) => (args[0] === "--version"
    ? { status: 0, stdout: "v24.5.0\n", stderr: "" }
    : { status: 1, stdout: "", stderr: "incompatible architecture" }),
});
test.assert(wrongArch.ok === false && wrongArch.node.archVerified === false
  && wrongArch.reasons.some((reason) => /not arm64/.test(reason)),
  "the runtime gate rejects a non-arm64 packaged Node");

const foreign = evaluatePackagedRuntime({
  nodePath: "/tmp/node", helperPath: "", arch: "arm64",
  runCommand: (command, args) => {
    const probe = [command, ...args].join(" ");
    if (probe.endsWith("--version")) return { status: 0, stdout: "v24.5.0\n", stderr: "" };
    if (probe.startsWith("otool -L")) {
      return { status: 0, stdout: "binary:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n\t/opt/homebrew/opt/openssl/lib/libssl.dylib (compatibility version 3.0.0)\n", stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  },
});
test.assert(foreign.ok === false && foreign.node.foreign.length === 1
  && foreign.reasons.some((reason) => reason.includes("/opt/homebrew/opt/openssl/lib/libssl.dylib")),
  "the runtime gate rejects a machine-local dependency and names it");

const oldNode = evaluatePackagedRuntime({
  nodePath: "/tmp/node", helperPath: "", arch: "arm64",
  runCommand: (command, args) => ([command, ...args].join(" ") === "/tmp/node --version"
    ? { status: 0, stdout: "v20.11.0\n", stderr: "" }
    : { status: 0, stdout: "", stderr: "" }),
});
test.assert(oldNode.ok === false && oldNode.reasons.some((reason) => /older than Node 24/.test(reason)),
  "a packaged Node older than Node 24 fails the gate");

const helperTooNew = evaluatePackagedRuntime({
  nodePath: "/tmp/node", helperPath, arch: "arm64",
  runCommand: (command, args) => {
    const probe = [command, ...args].join(" ");
    if (probe.endsWith("--version")) return { status: 0, stdout: "v24.5.0\n", stderr: "" };
    if (probe.includes(helperPath)) return { status: 0, stdout: "cmd LC_BUILD_VERSION\n      minos 16.0\n", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  },
});
test.assert(helperTooNew.ok === false && helperTooNew.helper.minOs === "16.0"
  && helperTooNew.reasons.some((reason) => /above the supported macOS 15/.test(reason)),
  "a helper built above macOS 15 is refused");
test.assert(evaluatePackagedRuntime({ arch: "arm64", runCommand: () => ({ status: 0, stdout: "", stderr: "" }) }).ok === false,
  "a runtime with no named Node binary fails closed");

test.assert(parseOtoolLibraries("binary:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n/opt/x/liba.dylib (compatibility version 1.0.0)\n").join(",") === "/opt/x/liba.dylib",
  "otool parsing skips the header line and system libraries");
test.assert(parseMinimumOsVersion("cmd LC_BUILD_VERSION\n      minos 15.0\n") === "15.0"
  && parseMinimumOsVersion("no build version here") === "",
  "minos is parsed from otool -l output");

// --- Controlled upstream patch functions -----------------------------------

test.assert(extendLauncher(readFileSync(new URL("../../vendor/tinyjs/native/launcher-macos.cc", import.meta.url), "utf8")).includes("#include <dlfcn.h>"),
  "the native patch applies to the real pinned upstream launcher");
rejects(() => extendLauncher("no anchors here"), /patch anchor changed/,
  "a moved upstream launcher anchor is reported instead of silently skipped");
rejects(() => extendBridge("no anchors here"), /patch anchor changed/,
  "a moved upstream bridge anchor is reported instead of silently skipped");
test.assert(extendBridge(readFileSync(new URL("../../vendor/tinyjs/runtime/bridge.js", import.meta.url), "utf8")).includes("HKREGISTER"),
  "the bridge patch applies to the real pinned upstream bridge");

// --- Whole plan: identity, arm64/macOS 15, `run` CLI, OTA paths ------------

const plan = planTinyjsPackaging({
  repoRoot: REPO_ROOT, config, pkg, buildInfo, gitHead: "b".repeat(40), env: {}, arch: "arm64",
});
test.assert(plan.identity.bundleIdentifier === config.id && plan.appName === config.title + ".app",
  "the plan carries the config id and the app bundle name");
test.assert(plan.identity.arch === "arm64" && plan.identity.minimumOS === "15.0" && plan.cli.args[0] === "run",
  "the plan pins arm64/macOS 15 and drives the pinned CLI through `run`");
test.assert(plan.ota.manifestUrl === OTA_MANIFEST_URL && plan.ota.archiveName.endsWith("-arm64.zip")
  && plan.ota.manifestPath.endsWith("tinyjs-ota-manifest.json"),
  "the plan's OTA locations use the stable manifest, an arm64 archive and a declared manifest path");
test.assert(plan.signing.mode === "ad-hoc" && plan.signing.notarize === false && plan.dmg === false,
  "a dev plan signs ad-hoc, does not notarize and does not request a DMG by default");
rejects(() => planTinyjsPackaging({ repoRoot: REPO_ROOT, config, pkg, buildInfo, arch: "x64" }),
  /Unsupported architecture/, "an x64 plan is refused before any build");
rejects(() => planTinyjsPackaging({ repoRoot: REPO_ROOT, config, pkg, buildInfo, production: true }),
  /AI_SYSTEM6_DEVELOPER_ID/, "a production plan without credentials is refused");
test.assert(parseArguments(["--plan", "--allow-adhoc"]).plan === true
  && parseArguments(["--allow-adhoc"]).allowAdhoc === true
  && parseArguments(["--production", "--allow-adhoc"]).production === true,
  "the CLI accepts --plan, --production and --allow-adhoc");
rejects(() => parseArguments(["--nope"]), /Unknown argument/, "an unknown flag is refused");


const extendedBridge = extendBridge(readFileSync(new URL("../../vendor/tinyjs/runtime/bridge.js", import.meta.url), "utf8"));
const registerMethod = extendedBridge.slice(extendedBridge.indexOf("async register(hid, combo)"), extendedBridge.indexOf("unregister(hid)")).trim().replace(/,$/, "");
const requests = [];
let registrationOk = true;
const register = vm.runInNewContext("({" + registerMethod + "}).register", {
  one: (value) => String(value), ask: async (command, payload) => { requests.push({ command, payload }); return { ok: registrationOk, code: -50 }; },
});
await register("collect-selection", "cmd+shift+k");
assert.deepEqual(requests[0], { command: "HKREGISTER", payload: "collect-selection\tcmd+shift+k" });
registrationOk = false; await assert.rejects(register("collect-selection", "cmd+shift+k"), /Shortcut is unavailable/);
test.assert(true, "generated hotkey bridge sends a real tab-delimited request and requires the native acknowledgement");
test.finish();
