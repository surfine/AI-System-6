// Build the TinyJS macOS shell app for AI System 6.
//
// Ownership boundary (bounded task):
//   - The controller owns the pinned TinyJS runtime (vendor/tinyjs), the shell
//     project (platform/macos/tinyjs/tinyjs.json + src/) and the release
//     integration (hosting, gates, receipts).
//   - This adapter only: stages the controller's config/src into
//     dist/tinyjs-stage, drives the pinned CLI, embeds the repo's existing
//     server payload and vision helper, repaints the versioned icon, signs
//     Mach-O files inside-out, seals the bundle, archives the sealed app and
//     derives the OTA manifest from the final zip hash.
//
// `tinyjs publish` is deliberately NEVER invoked: it rebuilds the bundle and
// discards the server payload, helper and icon this adapter just assembled.
//
// Usage:
//   node tooling/build-tinyjs-shell-app.mjs --help
//   node tooling/build-tinyjs-shell-app.mjs --plan
//   node tooling/build-tinyjs-shell-app.mjs [--arch arm64] [--dmg] [--production]
//     [--config platform/macos/tinyjs/tinyjs.json] [--entitlements <plist>]

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { buildNative } from "./build-tinyjs-native.mjs";
import { MAC_APP_ICONSET_SIZES, renderVersionedMacAppIcon } from "./lib/mac-app-icon.mjs";
import { macSigningProblems, readMacSigningConfig, withMacSigningDefaults } from "./lib/mac-signing.mjs";

export const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const TINYJS_PROJECT_DIR = "platform/macos/tinyjs";
export const TINYJS_CONFIG_FILE = "platform/macos/tinyjs/tinyjs.json";
export const TINYJS_RELATIVE_LAUNCHER = "vendor/tinyjs/bin/tjs";
export const TINYJS_RELATIVE_CLI = "vendor/tinyjs/cli.js";
export const TINYJS_STAGE_DIR = "dist/tinyjs-stage";
export const DIST_DIR = "dist";
export const SERVER_PAYLOAD_DIR = "dist/mac-server-payload";
export const SERVER_RESOURCES_DIRNAME = "server";
export const VISION_HELPER_NAME = "AISystem6Vision";
export const INTELLIGENCE_HELPER_NAME = "AISystem6Intelligence";
// Every helper the app ships in Contents/MacOS. Each names the SwiftPM package
// that builds it: Vision stays in the macOS 11 WKWebView package, Intelligence
// (Apple's model and MLX) is its own macOS 14 package. A product its package
// does not declare is skipped, not an error. `resourceBundles` helpers also
// ship the package's SwiftPM `*.bundle` directories (MLX's default.metallib
// lives in mlx-swift_Cmlx.bundle).
export const HELPERS = Object.freeze([
  Object.freeze({ name: VISION_HELPER_NAME, packageDir: "platform/macos/shell/macos-webview", resourceBundles: false }),
  Object.freeze({ name: INTELLIGENCE_HELPER_NAME, packageDir: "platform/macos/shell/macos-intelligence", resourceBundles: true }),
]);
export const HELPER_NAMES = Object.freeze(HELPERS.map((helper) => helper.name));
// Where the bundles go inside the .app. MLX finds default.metallib through the
// main bundle's resourceURL (Contents/Resources/mlx-swift_Cmlx.bundle) and
// Bundle.module finds the Hub/Crypto bundles the same way. Contents/MacOS
// would make codesign treat a loose metallib as unsigned code, and the .app
// root is sealed, so Contents/Resources is the one place that works.
export const HELPER_RESOURCE_BUNDLES_DIR = "Contents/Resources";
export const APP_ICON_SOURCE = "system.css-reference/docs/icon.png";
export const SUPPORTED_ARCHES = Object.freeze(["arm64"]);
export const MIN_PACKAGED_NODE_MAJOR = 24;
export const MIN_MACOS_MAJOR = 15;
// OTA metadata: the manifest URL is the stable channel pointer the shipped
// shell polls; the archive URL is versioned under that same base.
export const OTA_MANIFEST_URL = "https://system6.aaronlau.me/updates/stable/manifest.json";
export const OTA_ARCHIVE_BASE_URL = "https://system6.aaronlau.me/updates/releases";

const MACHO_MAGICS = new Set([0xfeedface, 0xfeedfacf, 0xcafebabe, 0xcefaedfe, 0xcffaedfe, 0xbebafeca]);

export function assertSupportedArch(arch) {
  const value = String(arch || "").trim();
  if (!SUPPORTED_ARCHES.includes(value)) {
    throw new Error("Unsupported architecture " + JSON.stringify(value)
      + "; this adapter ships " + SUPPORTED_ARCHES.join(", ") + ".");
  }
  return value;
}

export function buildTinyjsBuildArgs({ arch = "arm64", dmg = false } = {}) {
  const platform = assertSupportedArch(arch);
  const args = ["build", "--arch", platform];
  if (dmg) args.push("--dmg");
  return args;
}

// The pinned CLI contract: the launcher (vendor/tinyjs/bin/tjs) is invoked
// with vendor/tinyjs/cli.js as its first argument.
export function tinyjsCliInvocation(repoRoot = REPO_ROOT, buildArgs = []) {
  return {
    command: join(repoRoot, TINYJS_RELATIVE_LAUNCHER),
    args: ["run", join(repoRoot, TINYJS_RELATIVE_CLI), ...buildArgs],
  };
}

function firstString(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function slugify(value) {
  return String(value || "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Human identity comes from the controller's tinyjs.json, never hardcoded.
export function resolveAppIdentity(config = {}) {
  const title = firstString(config, ["title", "productName", "displayName", "name"]);
  if (!title) {
    throw new Error("tinyjs config must declare a human title (title/productName/displayName/name).");
  }
  const shellVersion = firstString(config, ["version"]);
  if (!shellVersion) {
    throw new Error("tinyjs config must declare a shell version (version).");
  }
  const bundleIdentifier = firstString(config, ["id", "identifier", "bundleId", "bundleIdentifier", "appId"])
    || ("me.aaronlau." + slugify(title));
  const executableName = firstString(config, ["name", "executable", "binary", "bin"]) || title;
  return { title, shellVersion, bundleIdentifier, executableName, slug: slugify(title) };
}

// Product identity: package.json + build-info.json + git HEAD; shell version from config.
export function resolveProductIdentity({ pkg = {}, buildInfo = {}, gitHead = "", config = {} } = {}) {
  const productVersion = typeof pkg.version === "string" ? pkg.version.trim() : "";
  if (!productVersion) throw new Error("package.json is missing a version; product identity is unknown.");
  const build = typeof buildInfo.build === "string" ? buildInfo.build.trim() : "";
  if (!build) throw new Error("build-info.json is missing a build stamp; product identity is unknown.");
  const app = resolveAppIdentity(config);
  return {
    productVersion,
    build,
    productBuild: build,
    storageSchema: 6,
    arch: "arm64",
    minimumOS: "15.0",
    sourceCommit: String(gitHead || "").trim(),
    shellVersion: app.shellVersion,
    appTitle: app.title,
    bundleIdentifier: app.bundleIdentifier,
    bundleId: app.bundleIdentifier,
    executableName: app.executableName,
    appSlug: app.slug,
  };
}

// Stable manifest pointer, versioned archive URL under the same base.
export function otaUpdateLocations({
  appTitle,
  shellVersion,
  arch = "arm64",
  manifestUrl = OTA_MANIFEST_URL,
  archiveBaseUrl = OTA_ARCHIVE_BASE_URL,
} = {}) {
  const slug = slugify(appTitle);
  const version = String(shellVersion || "").trim();
  if (!slug || !version) throw new Error("OTA locations need an app title and a shell version.");
  assertSupportedArch(arch);
  const base = String(archiveBaseUrl).replace(/\/+$/, "");
  const archiveName = slug + "-" + version + "-" + arch + ".zip";
  const versionedBaseUrl = base + "/" + version;
  return {
    manifestUrl,
    archiveBaseUrl,
    versionedBaseUrl,
    archiveName,
    archiveUrl: versionedBaseUrl + "/" + archiveName,
  };
}

// OTA metadata is derived from the final sealed zip hash, never invented.
export function buildOtaManifest({
  identity = {},
  archiveUrl = "",
  sha256 = "",
  size = 0,
  pubDate = new Date().toISOString(),
  arch = "arm64",
  notes = "",
} = {}) {
  const hash = String(sha256 || "").trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(hash) === false) {
    throw new Error("OTA manifest needs a sha256 of the final zip; got " + JSON.stringify(sha256) + ".");
  }
  if (!archiveUrl) throw new Error("OTA manifest needs the versioned archive URL.");
  assertSupportedArch(arch);
  const productVersion = identity.productVersion || "";
  const build = identity.build || "";
  return {
    version: identity.shellVersion || "",
    notes: notes || ("AI System 6 Beta " + productVersion + " (build " + build + ")").trim(),
    pub_date: pubDate,
    platform: "darwin-" + arch,
    url: archiveUrl,
    sha256: hash,
    size: Number(size) || 0,
    product: { version: productVersion, build, commit: identity.sourceCommit || "" },
  };
}

export function buildVersionMetadata({
  identity = {},
  zipPath = "",
  sha256 = "",
  size = 0,
  manifestUrl = OTA_MANIFEST_URL,
  signing = null,
} = {}) {
  return {
    ...(signing ? { signing: { mode: String(signing.mode || ""), notarized: signing.notarized === true } } : {}),
    identity: { ...identity },
    product: { version: identity.productVersion || "", build: identity.build || "", commit: identity.sourceCommit || "" },
    shell: { version: identity.shellVersion || "", bundleIdentifier: identity.bundleIdentifier || "" },
    archive: { path: zipPath, sha256: String(sha256 || "").toLowerCase(), size: Number(size) || 0 },
    manifest: { url: manifestUrl },
  };
}

export function notaryCredentialsPresent(env = {}) {
  const apiKey = Boolean(
    env.AI_SYSTEM6_NOTARY_KEY_ID && env.AI_SYSTEM6_NOTARY_ISSUER && env.AI_SYSTEM6_NOTARY_KEY,
  );
  const appleId = Boolean(
    env.AI_SYSTEM6_NOTARY_APPLE_ID && env.AI_SYSTEM6_NOTARY_APP_PASSWORD && env.AI_SYSTEM6_TEAM_ID,
  );
  const profile = Boolean(env.AI_SYSTEM6_NOTARY_PROFILE);
  return apiKey || appleId || profile;
}

// Honest signing plan. Production fails closed without Developer ID AND
// notarization credentials; dev falls back to ad-hoc. TINYJS_SIGN_IDENTITY is
// the task-specific override; identity values are never logged as secrets.
export function resolveSigningPlan({ env = {}, production = false, allowAdhoc = false } = {}) {
  const contractIdentity = String(env.AI_SYSTEM6_DEVELOPER_ID || "").trim();
  const taskIdentity = String(env.TINYJS_SIGN_IDENTITY || "").trim();
  if (production && allowAdhoc && !contractIdentity) return { mode: "ad-hoc", identity: "-", production: true, notarize: false };
  if (production) {
    if (!contractIdentity) {
      throw new Error(
        "Production packaging requires AI_SYSTEM6_DEVELOPER_ID (the sign-mac-app.mjs "
        + "credential contract); refusing to ship an ad-hoc or unsigned app.",
      );
    }
    if (notaryCredentialsPresent(env) === false) {
      throw new Error(
        "Production packaging requires notarization credentials (App Store Connect API key "
        + "or Apple ID + app password + team id); refusing to seal without notarization.",
      );
    }
    return {
      mode: "developer-id", identity: contractIdentity, production: true, notarize: true,
      notaryProfile: String(env.AI_SYSTEM6_NOTARY_PROFILE || "").trim(),
    };
  }
  if (contractIdentity) {
    return { mode: "developer-id", identity: contractIdentity, production: false, notarize: notaryCredentialsPresent(env) };
  }
  if (taskIdentity) {
    return { mode: "developer-id", identity: taskIdentity, production: false, notarize: notaryCredentialsPresent(env) };
  }
  return { mode: "ad-hoc", identity: "-", production: false, notarize: false };
}

export function readMagic(filePath) {
  const fd = openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(4);
    const read = readSync(fd, buffer, 0, 4, 0);
    return read === 4 ? buffer.readUInt32BE(0) : null;
  } finally {
    closeSync(fd);
  }
}

export function isMachOFile(filePath) {
  try {
    return MACHO_MAGICS.has(readMagic(filePath));
  } catch {
    return false;
  }
}

// Libraries the build copies into Contents/Frameworks and links by this path.
export const EMBEDDED_FRAMEWORKS_REF = "@executable_path/../Frameworks";

/** `@rpath/<name>.dylib` dependencies from `otool -L`, which only resolve on a
 * machine with the toolchain that built the binary. */
export function parseRpathDylibs(otoolOutput) {
  return [...String(otoolOutput || "").matchAll(/^\s*@rpath\/([^\s]+\.dylib)\s/gm)].map((match) => match[1]);
}

/** Absolute LC_RPATH entries that point at a toolchain, not the system. */
export function parseLocalRpaths(otoolLoadCommands) {
  return [...String(otoolLoadCommands || "").matchAll(/cmd LC_RPATH[\s\S]*?path (\S+) \(offset/g)]
    .map((match) => match[1])
    .filter((path) => path.startsWith("/") && !path.startsWith("/usr/lib/") && !path.startsWith("/System/"));
}

export function parseOtoolLibraries(stdout, selfNames = []) {
  const own = new Set(selfNames.map((name) => String(name)));
  const foreign = [];
  for (const line of String(stdout || "").split("\n").slice(1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.endsWith(":")) continue;
    const library = trimmed.split(" (compatibility version")[0].trim();
    if (!library || own.has(library)) continue;
    if (library.startsWith("/usr/lib/") || library.startsWith("/System/")) continue;
    if (library.startsWith(EMBEDDED_FRAMEWORKS_REF + "/")) continue;
    foreign.push(library);
  }
  return foreign;
}

export function parseMinimumOsVersion(otoolOutput) {
  const match = /minos\s+(\d+(?:\.\d+)*)/.exec(String(otoolOutput || ""));
  return match ? match[1] : "";
}

function majorOf(version) {
  return Number(String(version).replace(/^v/, "").split(".")[0]);
}

export function commandFailed(result) {
  return result.status === 0 ? false : true;
}

export function defaultRunCommand(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return { status: result.status, stdout: String(result.stdout || ""), stderr: String(result.stderr || "") };
}

function inspectLibraries(label, binaryPath, runCommand, reasons, assign) {
  const listed = runCommand("otool", ["-L", binaryPath]);
  if (commandFailed(listed)) {
    reasons.push("otool could not read the " + label + " (" + binaryPath + ")");
    return;
  }
  const foreign = parseOtoolLibraries(listed.stdout, [binaryPath]);
  assign(foreign);
  if (foreign.length) reasons.push(label + " needs machine-local libraries: " + foreign.join(", "));
}

function inspectNode({ nodePath, platform, minNodeMajor, runCommand, reasons }) {
  const node = { path: nodePath || "", version: "", foreign: null, archVerified: false };
  if (!nodePath) {
    reasons.push("no packaged Node runtime was named");
    return node;
  }
  const reported = runCommand(nodePath, ["--version"]);
  const version = String(reported.stdout || "").trim();
  if (reported.status === 0 && version) {
    node.version = version;
    if (majorOf(version) >= minNodeMajor) {
      // current enough
    } else {
      reasons.push("packaged Node " + version + " is older than Node " + minNodeMajor);
    }
  } else {
    reasons.push("packaged Node did not report a version (" + nodePath + ")");
  }
  inspectLibraries("packaged Node", nodePath, runCommand, reasons, (value) => { node.foreign = value; });
  const lipo = runCommand("lipo", ["-verify_arch", platform, nodePath]);
  node.archVerified = lipo.status === 0;
  if (commandFailed(lipo)) reasons.push("packaged Node is not " + platform + " (lipo -verify_arch failed)");
  return node;
}

function inspectHelper({ helperPath, platform, minMacOsMajor, runCommand, reasons }) {
  const helper = { path: helperPath || "", foreign: null, archVerified: false, minOs: "" };
  if (!helperPath) return helper;
  const label = (basename(helperPath).replace(/^AISystem6/, "").toLowerCase() || "native") + " helper";
  inspectLibraries(label, helperPath, runCommand, reasons, (value) => { helper.foreign = value; });
  const lipo = runCommand("lipo", ["-verify_arch", platform, helperPath]);
  helper.archVerified = lipo.status === 0;
  if (commandFailed(lipo)) reasons.push(label + " is not " + platform + " (lipo -verify_arch failed)");
  const load = runCommand("otool", ["-l", helperPath]);
  if (load.status === 0) {
    helper.minOs = parseMinimumOsVersion(load.stdout);
    const major = Number(String(helper.minOs).split(".")[0]);
    const tooOld = helper.minOs && minMacOsMajor && Number.isFinite(major) && major > minMacOsMajor;
    if (tooOld) {
      reasons.push(label + " targets macOS " + helper.minOs + ", above the supported macOS " + minMacOsMajor);
    }
  }
  return helper;
}

// Fail closed on a runtime that only works on the packaging machine.
export function evaluatePackagedRuntime({
  nodePath = "",
  helperPath = "",
  helperPaths = [],
  arch = "arm64",
  minNodeMajor = MIN_PACKAGED_NODE_MAJOR,
  minMacOsMajor = MIN_MACOS_MAJOR,
  runCommand = defaultRunCommand,
} = {}) {
  const reasons = [];
  let platform = "";
  try {
    platform = assertSupportedArch(arch);
  } catch (error) {
    reasons.push(error.message);
  }
  let node = { path: nodePath, version: "", foreign: null, archVerified: false };
  const allHelperPaths = [helperPath, ...helperPaths].filter(Boolean);
  let helpers = allHelperPaths.map((path) => ({ path, foreign: null, archVerified: false, minOs: "" }));
  if (platform) {
    node = inspectNode({ nodePath, platform, minNodeMajor, runCommand, reasons });
    helpers = allHelperPaths.map((path) => inspectHelper({ helperPath: path, platform, minMacOsMajor, runCommand, reasons }));
  }
  // `helper` stays the first helper for callers that predate the list.
  const helper = helpers[0] || { path: "", foreign: null, archVerified: false, minOs: "" };
  return { ok: reasons.length === 0, reasons, node, helper, helpers };
}

// Products the SwiftPM manifest declares: `.executable(name: "X", ...)`.
export function declaredHelperProducts(packageSwiftText = "") {
  return [...String(packageSwiftText).matchAll(/\.executable\(\s*name:\s*"([^"]+)"/g)].map((match) => match[1]);
}

export function discoverBuiltApp(root, expectedName, { maxDepth = 6 } = {}) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory() === false) continue;
      const full = join(dir, entry.name);
      if (entry.name.endsWith(".app") && existsSync(join(full, "Contents", "Info.plist"))) {
        found.push(full);
        continue;
      }
      walk(full, depth + 1);
    }
  };
  walk(root, 0);
  const exact = found.find((path) => path.endsWith(sep + expectedName));
  return exact || found[0] || "";
}

export function discoverFile(root, extension) {
  let match = "";
  const walk = (dir, depth) => {
    if (match || depth > 6) return;
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (match) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full, depth + 1); continue; }
      if (entry.isFile() && entry.name.endsWith(extension)) { match = full; return; }
    }
  };
  walk(root, 0);
  return match;
}

/**
 * Pure planning: resolve the identity, paths and signing mode without touching
 * the filesystem. --plan prints this and exits.
 */
export function planTinyjsPackaging({
  repoRoot = REPO_ROOT,
  config = {},
  pkg = {},
  buildInfo = {},
  gitHead = "",
  env = {},
  arch = "arm64",
  dmg = false,
  production = false,
  allowAdhoc = false,
  configFile = "",
  entitlements = "",
} = {}) {
  const platform = assertSupportedArch(arch);
  const identity = resolveProductIdentity({ pkg, buildInfo, gitHead, config });
  const appName = identity.appTitle + ".app";
  const appDir = join(repoRoot, DIST_DIR, appName);
  const ota = otaUpdateLocations({
    appTitle: identity.appTitle,
    shellVersion: identity.shellVersion,
    arch: platform,
  });
  const signing = resolveSigningPlan({ env, production, allowAdhoc });
  const cli = tinyjsCliInvocation(repoRoot, buildTinyjsBuildArgs({ arch: platform, dmg: false }));
  return {
    arch: platform,
    dmg: Boolean(dmg),
    production: Boolean(production),
    identity,
    cli,
    stageDir: join(repoRoot, TINYJS_STAGE_DIR),
    projectDir: join(repoRoot, TINYJS_PROJECT_DIR),
    configFile: configFile ? resolve(repoRoot, configFile) : join(repoRoot, TINYJS_CONFIG_FILE),
    entitlements: entitlements ? resolve(repoRoot, entitlements) : "",
    appName,
    appDir,
    zipPath: join(repoRoot, DIST_DIR, identity.appTitle + ".zip"),
    dmgPath: join(repoRoot, DIST_DIR, identity.appTitle + ".dmg"),
    serverPayloadDir: join(repoRoot, SERVER_PAYLOAD_DIR),
    serverResourcesDir: join(appDir, "Contents", "Resources", SERVER_RESOURCES_DIRNAME),
    helpers: HELPERS.map((helper) => ({
      name: helper.name,
      destination: join(appDir, "Contents", "MacOS", helper.name),
      packageDir: join(repoRoot, helper.packageDir),
      packageRelativeDir: helper.packageDir,
      resourceBundles: helper.resourceBundles,
      resourcesDestination: join(appDir, HELPER_RESOURCE_BUNDLES_DIR),
    })),
    icon: {
      sourcePath: join(repoRoot, APP_ICON_SOURCE),
      version: identity.productVersion,
    },
    signing,
    ota: {
      ...ota,
      manifestPath: join(repoRoot, DIST_DIR, "tinyjs-ota-manifest.json"),
      metadataPath: join(repoRoot, DIST_DIR, "tinyjs-version-metadata.json"),
    },
  };
}

// --- Impure build steps (not exercised by the contract test) ---------------

function runChecked(command, args, { cwd = REPO_ROOT, label = command } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (commandFailed(result)) {
    throw new Error(label + " failed (" + command + " exit " + result.status + "); failing closed.");
  }
  return result;
}

function copyTree(source, destination) {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, verbatimSymlinks: true });
}

function stageProject(plan) {
  copyTree(join(plan.projectDir, "src"), join(plan.stageDir, "src"));
  copyFileSync(plan.configFile, join(plan.stageDir, "tinyjs.json"));
}

function setBundleIconFile(appDir, iconName) {
  const infoPlist = join(appDir, "Contents", "Info.plist");
  if (existsSync(infoPlist) === false) return;
  const replaced = spawnSync(
    "/usr/bin/plutil",
    ["-replace", "CFBundleIconFile", "-string", iconName, infoPlist],
    { encoding: "utf8" },
  );
  if (commandFailed(replaced)) {
    spawnSync("/usr/bin/plutil", ["-insert", "CFBundleIconFile", "-string", iconName, infoPlist], { encoding: "utf8" });
  }
}

function rebuildIcon(plan) {
  if (existsSync(plan.icon.sourcePath) === false) {
    console.warn("No icon source at " + plan.icon.sourcePath + "; keeping the TinyJS build icon.");
    return false;
  }
  const resources = join(plan.appDir, "Contents", "Resources");
  const iconset = join(resources, "AppIcon.iconset");
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });
  try {
    for (const [fileName, size] of MAC_APP_ICONSET_SIZES) {
      writeFileSync(join(iconset, fileName), renderVersionedMacAppIcon({
        sourcePath: plan.icon.sourcePath,
        version: plan.icon.version,
        size,
      }));
    }
    runChecked(
      "/usr/bin/iconutil",
      ["-c", "icns", iconset, "-o", join(resources, "AppIcon.icns")],
      { label: "iconutil" },
    );
    setBundleIconFile(plan.appDir, "AppIcon");
    return true;
  } finally {
    rmSync(iconset, { recursive: true, force: true });
  }
}

/** Every Mach-O in the bundle, so nested code can be signed before its parent. */
export function collectMachOFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.isFile() && isMachOFile(full)) out.push(full);
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

// sign-mac-app.mjs signs nested Mach-O inside-out (Node with JIT entitlements),
// seals the bundle without --deep, and notarizes + staples when credentials exist.
function signArgs(plan, target) {
  const args = ["tooling/sign-mac-app.mjs", ...target];
  args.push("--identity", plan.signing.identity);
  if (plan.signing.notaryProfile) args.push("--keychain-profile", plan.signing.notaryProfile);
  // Production never degrades to "signed but not notarized": the signer exits
  // non-zero instead of printing NOT EXECUTED.
  if (plan.production && plan.signing.notarize) args.push("--require-notarization");
  return args;
}

function signBundle(plan) {
  const args = signArgs(plan, ["--app", plan.appDir]);
  if (plan.entitlements) args.push("--entitlements", plan.entitlements);
  runChecked(process.execPath, args, { cwd: REPO_ROOT, label: "sign-mac-app.mjs" });
}

function verifySealed(plan) {
  runChecked("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", plan.appDir], {
    label: "codesign --verify",
  });
  if (plan.signing.notarize) {
    runChecked("/usr/bin/xcrun", ["stapler", "validate", plan.appDir], { label: "stapler validate" });
    runChecked("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", plan.appDir], {
      label: "spctl --assess",
    });
  }
}

/**
 * The OTA zip is what the updater installs, so prove THAT file: unpack it the
 * way the updater does (ditto) and require the stapled ticket and a Gatekeeper
 * "accepted" verdict on the extracted app, not just on the build directory.
 */
function verifyArchivedApp(plan) {
  const scratch = mkdtempSync(join(tmpdir(), "ais6-zip-verify-"));
  try {
    runChecked("/usr/bin/ditto", ["-x", "-k", plan.zipPath, scratch], { label: "unpack OTA zip" });
    const extracted = join(scratch, plan.appName);
    runChecked("/usr/bin/codesign", ["--verify", "--deep", "--strict", extracted], { label: "codesign --verify (zip)" });
    runChecked("/usr/bin/xcrun", ["stapler", "validate", extracted], { label: "stapler validate (zip)" });
    runChecked("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", extracted], { label: "spctl --assess (zip)" });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sha256File(filePath) {
  return sha256Buffer(readFileSync(filePath));
}

/**
 * A SwiftPM helper can link toolchain back-deployment dylibs through @rpath
 * (libswiftCompatibilitySpan.dylib) that only the build machine has. Copy each
 * into Contents/Frameworks, link it by @executable_path, and drop the
 * toolchain rpaths so a missing library fails here instead of on a customer's
 * Mac. The dylibs are Mach-O, so the signing collector seals them inside-out.
 */
function embedHelperDylibs(helperPath, appDir) {
  const listed = spawnSync("otool", ["-L", helperPath], { encoding: "utf8" });
  const loads = spawnSync("otool", ["-l", helperPath], { encoding: "utf8" });
  if (commandFailed(listed) || commandFailed(loads)) throw new Error("otool could not read " + helperPath);
  const rpaths = parseLocalRpaths(loads.stdout);
  const frameworks = join(appDir, "Contents", "Frameworks");
  for (const name of parseRpathDylibs(listed.stdout)) {
    const origin = rpaths.map((dir) => join(dir, name)).find((candidate) => existsSync(candidate));
    if (!origin) throw new Error(basename(helperPath) + " needs @rpath/" + name + " but no toolchain rpath provides it.");
    mkdirSync(frameworks, { recursive: true });
    copyFileSync(origin, join(frameworks, name));
    chmodSync(join(frameworks, name), 0o755);
    runChecked("/usr/bin/install_name_tool", ["-change", "@rpath/" + name, EMBEDDED_FRAMEWORKS_REF + "/" + name, helperPath]);
    console.log("Embedded " + name + " for " + basename(helperPath) + ".");
  }
  for (const rpath of rpaths) runChecked("/usr/bin/install_name_tool", ["-delete_rpath", rpath, helperPath]);
}

/** SwiftPM resource bundle directories next to a built product. */
export function listResourceBundles(binDir) {
  try {
    return readdirSync(binDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith(".bundle"))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Build each helper product with SwiftPM from its own package and copy it into
 * Contents/MacOS (plus its resource bundles into Contents/Resources). Returns
 * the destinations that were built; a product its package does not declare is
 * skipped with a visible line.
 */
function buildHelpers(plan) {
  const built = [];
  for (const helper of plan.helpers) {
    const manifest = readFileSync(join(helper.packageDir, "Package.swift"), "utf8");
    if (declaredHelperProducts(manifest).includes(helper.name) === false) {
      console.log("Helper " + helper.name + " skipped: product not declared in " + helper.packageRelativeDir + "/Package.swift.");
      continue;
    }
    runChecked("/usr/bin/swift", ["build", "-c", "release", "--arch", "arm64", "--product", helper.name,
      "--package-path", helper.packageDir], { label: "swift build " + helper.name });
    const binPath = spawnSync("/usr/bin/swift", ["build", "-c", "release", "--arch", "arm64", "--package-path",
      helper.packageDir, "--show-bin-path"], { encoding: "utf8" });
    if (commandFailed(binPath)) throw new Error("swift build --show-bin-path failed for " + helper.name);
    const binDir = String(binPath.stdout).trim();
    const source = join(binDir, helper.name);
    if (existsSync(source) === false) throw new Error("swift build produced no " + source);
    mkdirSync(dirname(helper.destination), { recursive: true });
    copyFileSync(source, helper.destination);
    chmodSync(helper.destination, 0o755);
    embedHelperDylibs(helper.destination, plan.appDir);
    if (helper.resourceBundles) {
      const bundles = listResourceBundles(binDir);
      if (bundles.length === 0) throw new Error(helper.name + " needs its SwiftPM resource bundles but " + binDir + " has none.");
      if (helper.name === INTELLIGENCE_HELPER_NAME && !bundles.some((bundle) => existsSync(join(binDir, bundle, "Contents/Resources/default.metallib")))) {
        throw new Error(helper.name + " needs MLX's default.metallib in a resource bundle; the Swift toolchain did not produce it.");
      }
      mkdirSync(helper.resourcesDestination, { recursive: true });
      for (const bundle of bundles) copyTree(join(binDir, bundle), join(helper.resourcesDestination, bundle));
      console.log("Bundled helper " + helper.name + " with " + bundles.join(", ") + ".");
    } else {
      console.log("Bundled helper " + helper.name + ".");
    }
    built.push(helper.destination);
  }
  return built;
}

/** Drive the pinned CLI, assemble, validate, sign, seal, archive, manifest. */
function buildTinyjsApp(plan) {
  if (plan.production && plan.signing.mode === "developer-id") {
    // Before an hour of compiling: the certificate and the notary profile must
    // already work, or the build stops here with the reason.
    const problems = macSigningProblems({ identity: plan.signing.identity, notaryProfile: plan.signing.notaryProfile });
    if (problems.length) throw new Error("Production signing is not ready:\n - " + problems.join("\n - "));
  }
  runChecked(process.execPath, [join(REPO_ROOT, "tooling/verify-tinyjs-baseline.mjs")], { label: "verify TinyJS baseline" });
  if (existsSync(plan.cli.command) === false) {
    throw new Error("Pinned TinyJS launcher not found: " + plan.cli.command + " (controller-owned vendor/tinyjs).");
  }
  const cliEntry = plan.cli.args[1];
  if (existsSync(cliEntry) === false) {
    throw new Error("Pinned TinyJS CLI not found: " + cliEntry + " (controller-owned vendor/tinyjs).");
  }
  if (existsSync(plan.configFile) === false) {
    throw new Error("TinyJS config not found: " + plan.configFile + " (controller supplies platform/macos/tinyjs).");
  }
  const projectSrc = join(plan.projectDir, "src");
  if (existsSync(projectSrc) === false) {
    throw new Error("TinyJS src/ not found: " + projectSrc + " (controller supplies platform/macos/tinyjs).");
  }
  if (existsSync(plan.serverPayloadDir) === false) {
    throw new Error("Missing " + plan.serverPayloadDir + "; run node tooling/build-mac-server-payload.mjs first.");
  }

  stageProject(plan);
  console.log("Staged into " + plan.stageDir + "; invoking " + plan.cli.command + " " + plan.cli.args.join(" "));
  runChecked(plan.cli.command, plan.cli.args, { cwd: plan.stageDir, label: "tinyjs build" });

  const builtApp = discoverBuiltApp(plan.stageDir, plan.appName);
  if (builtApp === "") throw new Error("The TinyJS build produced no .app under " + plan.stageDir + ".");
  copyTree(builtApp, plan.appDir);
  console.log("Canonical app: " + plan.appDir);

  copyTree(plan.serverPayloadDir, plan.serverResourcesDir);
  console.log("Embedded server payload at " + plan.serverResourcesDir);
  const serverIdentity = JSON.parse(readFileSync(join(plan.serverResourcesDir, "apps/desktop/app/generated/build-info.json"), "utf8"));
  if (serverIdentity.version !== plan.identity.productVersion || serverIdentity.build !== plan.identity.productBuild
      || serverIdentity.sourceCommit !== plan.identity.sourceCommit || !/^[a-f0-9]{40}$/.test(plan.identity.sourceCommit)) {
    throw new Error("Server payload identity differs; build with AI_SYSTEM6_SOURCE_COMMIT before packaging");
  }

  const nativeOutput = join(plan.stageDir, "native");
  buildNative(nativeOutput);
  copyFileSync(join(nativeOutput, "launcher"), join(plan.appDir, "Contents/MacOS", plan.identity.executableName));
  copyFileSync(join(nativeOutput, "libAISystem6Browser.dylib"), join(plan.appDir, "Contents/Resources/libAISystem6Browser.dylib"));
  copyFileSync(join(nativeOutput, "bridge.js"), join(plan.appDir, "Contents/Resources/app/bridge.js"));
  const builtHelpers = buildHelpers(plan);
  const pin = JSON.parse(readFileSync(join(REPO_ROOT, "vendor/ubol/PIN.json"), "utf8"));
  const extension = join(REPO_ROOT, ".cache/ubol", pin.version, "safari");
  if (!existsSync(join(extension, "manifest.json"))) throw new Error("Pinned Safari ad blocker is missing; run browse:fetch-filters first");
  runChecked("/usr/bin/zip", ["-q", "-r", join(plan.appDir, "Contents/Resources/ubol-safari.zip"), "."], { cwd: extension });
  const plist = join(plan.appDir, "Contents/Info.plist");
  for (const [key, value] of [["LSMinimumSystemVersion", "15.0"], ["CFBundleShortVersionString", plan.identity.productVersion], ["CFBundleVersion", plan.identity.productBuild]]) {
    runChecked("/usr/bin/plutil", ["-replace", key, "-string", value, plist]);
  }

  rebuildIcon(plan);

  const runtime = evaluatePackagedRuntime({
    nodePath: join(plan.serverResourcesDir, "node"),
    helperPaths: builtHelpers,
    arch: plan.arch,
  });
  if (runtime.ok === false) {
    throw new Error("Refusing to package an invalid runtime:\n - " + runtime.reasons.join("\n - "));
  }

  const baseline = JSON.parse(readFileSync(join(REPO_ROOT, "vendor/tinyjs/baselines.json"), "utf8"));
  const productIdentity = { ...plan.identity, tinyjsPin: baseline.commit, tinyjsVersion: baseline.version,
    txikiVersion: baseline.runtime, nodeVersion: runtime.node.version };
  writeFileSync(join(plan.appDir, "Contents/Resources/PRODUCT-IDENTITY.json"), JSON.stringify(productIdentity, null, 2) + "\n");
  signBundle(plan);
  verifySealed(plan);

  if (plan.dmg) {
    const imageRoot = join(plan.stageDir, "image-root");
    mkdirSync(imageRoot, { recursive: true });
    copyTree(plan.appDir, join(imageRoot, plan.appName));
    rmSync(plan.dmgPath, { force: true });
    runChecked("/usr/bin/hdiutil", ["create", "-volname", plan.identity.appTitle, "-srcfolder", imageRoot,
      "-ov", "-format", "UDZO", plan.dmgPath], { label: "archive final sealed app to DMG" });
    runChecked(process.execPath, signArgs(plan, ["--dmg", plan.dmgPath]), { cwd: REPO_ROOT, label: "sign-mac-app.mjs dmg" });
  }

  // Archive only after the seal, then derive OTA metadata from that exact zip.
  rmSync(plan.zipPath, { force: true });
  runChecked(
    "/usr/bin/ditto",
    ["-c", "-k", "--sequesterRsrc", "--keepParent", plan.appDir, plan.zipPath],
    { label: "ditto zip" },
  );
  if (plan.signing.notarize) verifyArchivedApp(plan);
  const sha256 = sha256File(plan.zipPath);
  const size = statSync(plan.zipPath).size;
  const manifest = buildOtaManifest({
    identity: plan.identity,
    archiveUrl: plan.ota.archiveUrl,
    sha256,
    size,
  });
  writeFileSync(plan.ota.manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const metadata = buildVersionMetadata({
    identity: plan.identity,
    zipPath: plan.zipPath,
    sha256,
    size,
    manifestUrl: plan.ota.manifestUrl,
    signing: { mode: plan.signing.mode, notarized: Boolean(plan.signing.notarize) },
  });
  writeFileSync(plan.ota.metadataPath, JSON.stringify(metadata, null, 2) + "\n");

  console.log("Sealed " + plan.zipPath + " (sha256 " + sha256 + ", " + size + " bytes).");
  console.log("OTA manifest: " + plan.ota.manifestPath + " -> " + plan.ota.manifestUrl);
  console.log("Signing mode: " + plan.signing.mode + (plan.production ? " (production)" : " (dev)") + ".");
  return { plan, runtime, manifest, metadata };
}

export function parseArguments(argv = []) {
  const options = {
    help: false, plan: false, production: false, allowAdhoc: false, dmg: false,
    arch: "arm64", config: "", entitlements: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--plan") options.plan = true;
    else if (arg === "--production") options.production = true;
    else if (arg === "--allow-adhoc") options.allowAdhoc = true;
    else if (arg === "--dmg") options.dmg = true;
    else if (arg === "--arch") { options.arch = argv[index + 1] || ""; index += 1; }
    else if (arg === "--config") { options.config = argv[index + 1] || ""; index += 1; }
    else if (arg === "--entitlements") { options.entitlements = argv[index + 1] || ""; index += 1; }
    else throw new Error("Unknown argument: " + arg);
  }
  return options;
}

export function usage() {
  return [
    "Usage: node tooling/build-tinyjs-shell-app.mjs [options]",
    "",
    "  --plan               print the resolved plan and exit (no build/sign mutation)",
    "  --arch <arm64>       target architecture (arm64 only)",
    "  --dmg                also request a .dmg (app + zip are always produced)",
    "  --production         require Developer ID and notarization unless --allow-adhoc is authorized",
    "  --allow-adhoc        explicit public ad-hoc signing policy (Developer ID pending)",
    "  --config <path>      tinyjs.json (default platform/macos/tinyjs/tinyjs.json)",
    "  --entitlements <p>   app-bundle entitlements plist passed to sign-mac-app.mjs (Node keeps its own checked-in plist)",
    "  --help               this text",
    "",
    "The adapter never runs tinyjs publish: it rebuilds the bundle and discards",
    "the server payload, helper and icon this step embeds.",
  ].join("\n");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function gitHead(repoRoot) {
  const result = spawnSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? String(result.stdout).trim() : "";
}

export function main({ argv = process.argv.slice(2), env: baseEnv = process.env, repoRoot = REPO_ROOT } = {}) {
  const options = parseArguments(argv);
  // A production build signs with the checked-in, non-secret identity and
  // notary profile name unless the environment overrides them.
  const env = options.production && !options.allowAdhoc
    ? withMacSigningDefaults(baseEnv, readMacSigningConfig(repoRoot))
    : baseEnv;
  if (options.help) { console.log(usage()); return null; }
  const configFile = options.config ? resolve(repoRoot, options.config) : join(repoRoot, TINYJS_CONFIG_FILE);
  const config = existsSync(configFile) ? readJson(configFile) : {};
  if (Object.keys(config).length === 0) {
    throw new Error("TinyJS config not found at " + configFile + "; the controller supplies platform/macos/tinyjs/tinyjs.json.");
  }
  const pkg = existsSync(join(repoRoot, "package.json")) ? readJson(join(repoRoot, "package.json")) : {};
  const buildInfo = existsSync(join(repoRoot, "build-info.json")) ? readJson(join(repoRoot, "build-info.json")) : {};
  const plan = planTinyjsPackaging({
    repoRoot,
    config,
    pkg,
    buildInfo,
    gitHead: env.AI_SYSTEM6_SOURCE_COMMIT || gitHead(repoRoot),
    env,
    arch: options.arch,
    dmg: options.dmg,
    production: options.production,
    allowAdhoc: options.allowAdhoc,
    configFile: options.config,
    entitlements: options.entitlements,
  });
  if (options.plan) { console.log(JSON.stringify(plan, null, 2)); return plan; }
  buildTinyjsApp(plan);
  return plan;
}

const invokedDirectly = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error("TinyJS packaging failed: " + (error?.message || error));
    process.exit(1);
  }
}
