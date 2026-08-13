#!/usr/bin/env node

/**
 * Gate: every release-identity surface must report the same version/build.
 *
 * Surfaces covered:
 *   - package.json version (npm identity)
 *   - build-info.json build stamp
 *   - app/generated/build-info.js (browser runtime global)
 *   - app/generated/build-info.json (server /api/version + native shell)
 *   - index.html ?v= cache-busters (CSS/JS/build-info assets)
 *   - app/core/config.js fallback discipline (no invented release numbers)
 *   - /api/version served by the running server
 *
 * Identity fields: version (package.json), build (build-info.json), and
 * sourceCommit (AI_SYSTEM6_SOURCE_COMMIT, passed explicitly by the release
 * pipeline). The gate deliberately never compares a generated commit against
 * git HEAD: sourceCommit describes the private source, and the public
 * snapshot commit is known by git itself, not by the generated files.
 *
 * The gate intentionally fails on stale generated artifacts: after bumping
 * package.json or build-info.json, run `npm run build:app` so the generated
 * identity and cache-busters are regenerated before verification.
 *
 *   node tooling/verify-version-consistency.mjs [--root DIR] [--no-server]
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const rootFlagIndex = args.indexOf("--root");
const root = rootFlagIndex >= 0 && args[rootFlagIndex + 1]
  ? resolve(args[rootFlagIndex + 1])
  : resolve(scriptDir, "..");
const skipServerCheck =
  args.includes("--no-server") ||
  root !== resolve(scriptDir, "..") ||
  process.env.AI_SYSTEM6_SKIP_LIVE_VERSION_CHECK === "1";

const failures = [];
const warnings = [];

function ok(message) {
  console.log(`OK  ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`NO  ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.log(`~~  ${message}`);
}

function assertFile(relativePath) {
  if (existsSync(join(root, relativePath))) ok(`${relativePath} present`);
  else fail(`${relativePath} missing`);
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
  } catch (error) {
    fail(`could not read ${relativePath}: ${error.message}`);
    return {};
  }
}

function readText(relativePath) {
  try {
    return readFileSync(join(root, relativePath), "utf8");
  } catch (error) {
    fail(`could not read ${relativePath}: ${error.message}`);
    return "";
  }
}

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

async function fetchJson(url, timeoutMs = 15000) {
  const requestUrl = new URL(url);
  const lib = await import(
    requestUrl.protocol === "https:" ? "node:https" : "node:http"
  );
  return new Promise((resolveFetch, rejectFetch) => {
    const request = lib.get(requestUrl, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolveFetch({ status: response.statusCode, body: JSON.parse(body) });
        } catch (error) {
          rejectFetch(error);
        }
      });
    });
    request.on("error", rejectFetch);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`request timed out after ${timeoutMs}ms`));
    });
  });
}

const generatedJson = readJson("apps/desktop/app/generated/build-info.json");
const generatedJs = readText("apps/desktop/app/generated/build-info.js");
const pkg = readJson("package.json");
const buildInfo = readJson("build-info.json");

assertFile("apps/desktop/app/generated/build-info.js");
assertFile("apps/desktop/app/generated/build-info.json");
assertFile("apps/desktop/index.html");
assertFile("apps/desktop/app/core/config.js");
assertFile("apps/server/server/lib/build-info.js");
assertFile("tooling/build-mac-shell-app.mjs");

const requiredFields = ["version", "build", "sourceCommit"];
for (const field of requiredFields) {
  if (typeof generatedJson[field] === "string") {
    ok(`generated build-info ${field}`);
  } else {
    fail(`generated build-info ${field} missing`);
  }
}

const generatedFromJs = (() => {
  const marker = "window.AISystem6BuildInfo = Object.freeze(";
  const start = generatedJs.indexOf(marker);
  if (start < 0) return null;
  const bodyStart = start + marker.length;
  const end = generatedJs.indexOf(");", bodyStart);
  if (end < 0) return null;
  try {
    return JSON.parse(generatedJs.slice(bodyStart, end));
  } catch {
    return null;
  }
})();

if (
  generatedFromJs &&
  generatedFromJs.version === generatedJson.version &&
  generatedFromJs.build === generatedJson.build &&
  generatedFromJs.sourceCommit === generatedJson.sourceCommit
) {
  ok("generated JS and JSON carry the same identity");
} else {
  fail("generated JS and JSON disagree (rerun npm run build:app)");
}

if (pkg.version && generatedJson.version === pkg.version) {
  ok(`package version ${pkg.version} === generated version`);
} else {
  fail(`package version ${pkg.version || "(missing)"} !== generated version ${generatedJson.version}`);
}

if (buildInfo.build && generatedJson.build === buildInfo.build) {
  ok(`build-info build ${buildInfo.build} === generated build`);
} else {
  fail(`build-info build ${buildInfo.build || "(missing)"} !== generated build ${generatedJson.build}`);
}

if (!/^\d{8}\.\d+$/.test(String(buildInfo.build || ""))) {
  fail(`build-info build is not a YYYYMMDD.N stamp: ${buildInfo.build}`);
}

const pipelineSourceCommit = String(process.env.AI_SYSTEM6_SOURCE_COMMIT || "").trim();
if (pipelineSourceCommit) {
  if (generatedJson.sourceCommit === pipelineSourceCommit) {
    ok(`generated sourceCommit ${generatedJson.sourceCommit} === pipeline AI_SYSTEM6_SOURCE_COMMIT`);
  } else {
    fail(`generated sourceCommit ${generatedJson.sourceCommit || "(missing)"} !== pipeline sourceCommit ${pipelineSourceCommit} (rebuild with the same env)`);
  }
} else if (generatedJson.sourceCommit) {
  warn(`sourceCommit ${generatedJson.sourceCommit} present without AI_SYSTEM6_SOURCE_COMMIT; consistency with the pipeline is unchecked`);
} else {
  ok("no pipeline sourceCommit; dev build carries an empty sourceCommit");
}

const indexSource = readText("apps/desktop/index.html");
const buildInfoTag = `<script src="app/generated/build-info.js?v=${generatedJson.build}"`;
const bundleTag = `<script src="app.bundle.js?v=${generatedJson.build}"`;
const cssTag = `<link rel="stylesheet" href="styles.bundle.css?v=${generatedJson.build}"`;
if (
  indexSource.includes(buildInfoTag) &&
  indexSource.includes(bundleTag) &&
  indexSource.includes(cssTag)
) {
  ok("index.html stamps all three assets with the generated build");
} else {
  fail("index.html cache-busters do not match the generated build (rerun npm run build:app)");
}

const buildInfoScriptIndex = indexSource.indexOf("app/generated/build-info.js");
const bundleScriptIndex = indexSource.indexOf("app.bundle.js");
if (
  buildInfoScriptIndex >= 0 &&
  bundleScriptIndex > buildInfoScriptIndex
) {
  ok("index.html loads build-info.js before app.bundle.js");
} else {
  fail("index.html must load app/generated/build-info.js before app.bundle.js");
}

const strayCacheBusters = [...indexSource.matchAll(/\?v=[^"'\\s]+/g)]
  .map((match) => match[0])
  .filter((param) => param !== `?v=${generatedJson.build}`);
if (!strayCacheBusters.length) {
  ok("no stray cache-buster query params in index.html");
} else {
  fail(`stray cache-buster params in index.html: ${[...new Set(strayCacheBusters)].join(", ")}`);
}

const configSource = readText("apps/desktop/app/core/config.js");
if (!configSource.includes("defaultAppVersionInfo")) {
  ok("no stale defaultAppVersionInfo constant in config.js");
} else {
  fail("config.js still carries the stale defaultAppVersionInfo constant");
}
for (const needle of ["getAppBuildInfo", "devBuildInfoFallback", "AISystem6BuildInfo"]) {
  if (configSource.includes(needle)) ok(`config.js ${needle}`);
  else fail(`config.js missing ${needle}`);
}
if (
  configSource.includes("getAppBuildInfo?.().build") &&
  configSource.includes("lazyScriptUrl")
) {
  ok("lazy script cache-buster reads the generated build");
} else {
  fail("lazyScriptUrl does not read the generated build via getAppBuildInfo");
}
if (/version:\s*"1\.\d+\.\d+"/.test(configSource)) {
  fail("config.js contains a literal release version fallback");
}
if (/build:\s*"20\d{6}\.\d+"/.test(configSource)) {
  fail("config.js contains a literal build stamp fallback");
}

const serverLib = readText("apps/server/server/lib/build-info.js");
if (serverLib.includes("app/generated/build-info.json")) {
  ok("server build-info reads the generated identity");
} else {
  fail("server build-info does not read app/generated/build-info.json");
}

const shellScript = readText("tooling/build-mac-shell-app.mjs");
if (shellScript.includes("app/generated/build-info.json")) {
  ok("Mac shell reads the generated identity");
} else {
  fail("Mac shell does not read app/generated/build-info.json");
}

const pkgAssets = new Set((pkg.macPackagedAssets && pkg.macPackagedAssets.assets) || []);
if (!pkg.macPackagedAssets) {
  // The public source snapshot intentionally drops the packaging surface;
  // the pkg asset contract only applies to a tree that packages.
  ok("no mac packaging surface in this tree");
} else if (pkgAssets.has("apps/desktop/app/generated/*.js")) {
  ok("packaged assets include apps/desktop/app/generated/*.js");
} else {
  fail("packaged assets missing apps/desktop/app/generated/*.js (packaged app would 404 build-info)");
}

if (!skipServerCheck) {
  const port = await findFreePort();
  const serverProcess = spawn(process.execPath, ["apps/server/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOut = "";
  serverProcess.stdout.on("data", (chunk) => { serverOut += chunk; });
  serverProcess.stderr.on("data", (chunk) => { serverOut += chunk; });

  let liveInfo = null;
  let liveError = null;
  try {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !liveInfo) {
      try {
        const result = await fetchJson(`http://127.0.0.1:${port}/api/version`, 3000);
        if (result.status === 200 && result.body && result.body.version) {
          liveInfo = result.body;
          break;
        }
        if (result.status !== 200) liveError = `HTTP ${result.status}`;
      } catch (error) {
        liveError = error.message;
      }
      if (!liveInfo) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 300));
      }
    }
  } finally {
    serverProcess.kill("SIGTERM");
  }

  if (liveInfo) {
    const mismatches = [];
    if (liveInfo.version !== generatedJson.version) mismatches.push(`version ${liveInfo.version} !== ${generatedJson.version}`);
    if (liveInfo.build !== generatedJson.build) mismatches.push(`build ${liveInfo.build} !== ${generatedJson.build}`);
    if (liveInfo.sourceCommit !== generatedJson.sourceCommit) mismatches.push(`sourceCommit ${liveInfo.sourceCommit || ""} !== ${generatedJson.sourceCommit || ""}`);
    if (mismatches.length) {
      fail(`/api/version disagrees with generated identity: ${mismatches.join("; ")}`);
    } else {
      ok(`/api/version serves ${liveInfo.version} build ${liveInfo.build} source ${liveInfo.sourceCommit || "(dev)"}`);
    }
  } else {
    fail(`server did not answer /api/version in time (${liveError || "no response"})`);
    if (serverOut) console.error(serverOut.slice(-2000));
  }
}

if (failures.length) {
  console.error(`\nVersion consistency failed: ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`\nVersion consistency passed${warnings.length ? ` (${warnings.length} warning(s))` : ""}.`);
