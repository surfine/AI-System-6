#!/usr/bin/env node
// The iOS shell's bundled web build (MULTIPLATFORM-SHELL-2026-10-17.md §8, §15).
//
// Copies dist/pages-static (npm run build:pages-static) into
// platform/ios/AISystem6Shell/DeskWeb (never "Payload": the simulator installer reads a top-level Payload/ as an .ipa), leaving out what an App Store build may
// not carry (the GPL games) and what only a web deployment needs, then writes
// beside it, under platform/ios/AISystem6Shell/Generated:
//   device-request.js / .cases.json   the on-device request contract
//                                     (tooling/build-device-request-bundle.mjs)
//   PRODUCT-IDENTITY.json             version, build, source commit, bundle id
//   Version.xcconfig                  MARKETING_VERSION / CURRENT_PROJECT_VERSION
//   PAYLOAD-MANIFEST.json             files, bytes and what was left out
//   Assets.xcassets/AppIcon.appiconset the 1024 px icon (tooling/build-ios-app-icon.mjs)
// Both directories are git-ignored; the Xcode build fails when they are
// missing (project.yml), so an empty shell cannot be built.
//
//   npm run build:pages-static && node tooling/build-ios-web-payload.mjs
//
// The exclusion list is platform/ios/AISystem6Shell/app-store-exclusions.json;
// tests/features/ios-shell-payload.test.mjs holds it to account.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIosAppIcon } from "./build-ios-app-icon.mjs";
import { writeDeviceRequestBundle } from "./build-device-request-bundle.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SHELL_DIR = "platform/ios/AISystem6Shell";
export const SOURCE_DIR = "dist/pages-static";
export const BUNDLE_IDENTIFIER = "me.aaronlau.aisystem6";

export function readExclusions(root = repoRoot) {
  return JSON.parse(readFileSync(join(root, SHELL_DIR, "app-store-exclusions.json"), "utf8"));
}

/**
 * Whether a payload-relative path (forward slashes) stays out of the bundle,
 * and why. Directory entries end with "/".
 *
 * @param {string} path
 * @param {ReturnType<typeof readExclusions>} exclusions
 * @returns {"gpl" | "deployment" | null}
 */
export function exclusionReason(path, exclusions) {
  const matches = (entry) => (entry.endsWith("/") ? path === entry.slice(0, -1) || path.startsWith(entry) : path === entry);
  if (exclusions.gplPaths.some(matches)) return "gpl";
  if (exclusions.deploymentOnlyPaths.some(matches)) return "deployment";
  if (!path.includes("/") && exclusions.deploymentOnlyPatterns.some((pattern) => new RegExp(pattern).test(path))) return "deployment";
  if (path === ".DS_Store" || path.endsWith("/.DS_Store")) return "deployment";
  return null;
}

/** Every file under dir, as forward-slash paths relative to it. */
export function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(relative(dir, full).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * GPL license text anywhere in the payload (binary files too: a wasm data
 * pack carries its COPYING). Returns the offending paths.
 *
 * @param {string} dir
 * @param {string[]} markers
 */
export function findGplText(dir, markers) {
  const patterns = markers.map((marker) => new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  const hits = [];
  for (const path of listFiles(dir)) {
    const text = readFileSync(join(dir, path)).toString("latin1");
    if (patterns.some((pattern) => pattern.test(text))) hits.push(path);
  }
  return hits;
}

function sourceCommit() {
  const fromEnv = String(process.env.AI_SYSTEM6_SOURCE_COMMIT || "").trim();
  if (fromEnv) return fromEnv;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function productIdentity(root = repoRoot) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const buildInfo = JSON.parse(readFileSync(join(root, "build-info.json"), "utf8"));
  const productVersion = String(pkg.version || "").trim();
  const build = String(buildInfo.build || "").trim();
  if (!productVersion) throw new Error("package.json is missing a version; product identity is unknown.");
  if (!/^\d+(?:\.\d+){0,2}$/.test(build)) throw new Error(`build-info.json build "${build}" is not a valid CFBundleVersion.`);
  return {
    productVersion,
    build,
    productBuild: build,
    sourceCommit: sourceCommit(),
    shell: "ios",
    bundleIdentifier: BUNDLE_IDENTIFIER,
    minimumOS: "26.0",
  };
}

export async function buildIosWebPayload({ root = repoRoot } = {}) {
  const source = join(root, SOURCE_DIR);
  for (const required of ["index.html", "app.bundle.js", "styles.bundle.css"]) {
    if (!existsSync(join(source, required))) {
      throw new Error(`${SOURCE_DIR}/${required} is missing. Run npm run build:pages-static first.`);
    }
  }
  const exclusions = readExclusions(root);
  const payload = join(root, SHELL_DIR, "DeskWeb");
  const generated = join(root, SHELL_DIR, "Generated");
  rmSync(payload, { recursive: true, force: true });
  mkdirSync(payload, { recursive: true });
  mkdirSync(generated, { recursive: true });

  /** @type {Record<string, string[]>} */
  const left = { gpl: [], deployment: [] };
  for (const path of listFiles(source)) {
    const reason = exclusionReason(path, exclusions);
    if (reason) {
      left[reason].push(path);
      continue;
    }
    const target = join(payload, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(source, path), target);
  }

  const kept = listFiles(payload);
  const slipped = kept.filter((path) => exclusionReason(path, exclusions));
  if (slipped.length) throw new Error(`Excluded files reached the payload:\n${slipped.join("\n")}`);
  const gplText = findGplText(payload, exclusions.gplTextMarkers);
  if (gplText.length) throw new Error(`GPL license text in the iOS payload (add the owner to app-store-exclusions.json):\n${gplText.join("\n")}`);

  // Every file index.html names must be in the payload: the shell loads
  // nothing from the network.
  const index = readFileSync(join(payload, "index.html"), "utf8");
  const missing = [...index.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1].split(/[?#]/)[0])
    .filter((value) => value && !/^(?:https?:|data:|#|\/\/|mailto:)/.test(value))
    .filter((value) => !existsSync(join(payload, value.replace(/^\//, ""))));
  if (missing.length) throw new Error(`index.html names files the payload lacks:\n${[...new Set(missing)].join("\n")}`);

  const identity = productIdentity(root);
  const contract = await writeDeviceRequestBundle(generated);
  // After the contract: buildIosAppIcon rewrites only Generated/Assets.xcassets.
  const icon = buildIosAppIcon({ root, betaBand: process.argv.includes("--beta-band") });
  writeFileSync(join(generated, "PRODUCT-IDENTITY.json"), `${JSON.stringify(identity, null, 2)}\n`);
  writeFileSync(join(generated, "Version.xcconfig"), [
    "// GENERATED by tooling/build-ios-web-payload.mjs from package.json and build-info.json.",
    `MARKETING_VERSION = ${identity.productVersion}`,
    `CURRENT_PROJECT_VERSION = ${identity.build}`,
    "",
  ].join("\n"));
  const bytes = kept.reduce((sum, path) => sum + statSync(join(payload, path)).size, 0);
  const manifest = {
    productVersion: identity.productVersion,
    build: identity.build,
    sourceCommit: identity.sourceCommit,
    files: kept.length,
    bytes,
    excluded: { gpl: left.gpl, deployment: left.deployment },
    excludedApps: exclusions.gplApps,
  };
  writeFileSync(join(generated, "PAYLOAD-MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, contract, icon };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { manifest, contract, icon } = await buildIosWebPayload();
  console.log(`Payload: ${manifest.files} files, ${(manifest.bytes / 1048576).toFixed(1)} MB → ${SHELL_DIR}/DeskWeb`);
  console.log(`Left out: ${manifest.excluded.gpl.length} GPL files (${manifest.excludedApps.join(", ")}), ${manifest.excluded.deployment.length} deployment-only files`);
  console.log(`Contract: device-request.js ${contract.bytes} bytes → ${SHELL_DIR}/Generated`);
  console.log(`App icon: ${icon.bytes} bytes → ${SHELL_DIR}/Generated/Assets.xcassets`);
}
