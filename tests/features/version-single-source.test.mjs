// Contract: one release identity, generated at build time, read everywhere.
//
// - app/generated/build-info.js (browser), app/generated/build-info.json
//   (server + native shell) and index.html ?v= cache-busters are all stamped
//   by scripts/lib/build-info.mjs during build:app.
// - version comes from package.json, build from build-info.json, and
//   sourceCommit from the explicit AI_SYSTEM6_SOURCE_COMMIT pipeline input.
//   The generated files never carry a self-referential commit hash and never
//   churn a generatedAt timestamp on ordinary dev builds.
// - The consistency gate must fail when any two surfaces disagree, so this
//   test builds a scratch tree, breaks one source on purpose, and asserts the
//   gate exits nonzero (and zero when everything agrees).

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("version-single-source");
const pkg = JSON.parse(read("package.json"));
const buildInfo = JSON.parse(read("build-info.json"));
const config = read("app/core/config.js");
const appEntry = read("app.js");
const persistenceStatus = read("app/core/persistence-status.js");
const indexSource = read("index.html");
const serverLib = read("src/server/lib/build-info.js");
const versionRoute = read("src/server/routes/version.js");
const shellScript = read("scripts/build-mac-shell-app.mjs");

// --- Static contracts -------------------------------------------------------

test.assert(
  existsSync(join(root, "app/generated/build-info.js")) &&
    existsSync(join(root, "app/generated/build-info.json")),
  "generated build-info artifacts exist in the tree"
);

const generated = JSON.parse(read("app/generated/build-info.json"));
for (const field of ["version", "build"]) {
  test.assert(typeof generated[field] === "string" && generated[field], `generated build-info ${field}`);
}
test.assert(
  typeof generated.sourceCommit === "string",
  "generated build-info sourceCommit is a string (empty for un-stamped dev builds)"
);
test.assert(
  read("scripts/lib/build-info.mjs").includes("AI_SYSTEM6_SOURCE_COMMIT"),
  "sourceCommit is taken from the explicit AI_SYSTEM6_SOURCE_COMMIT pipeline input"
);
test.assert(
  !read("scripts/lib/build-info.mjs").includes("rev-parse"),
  "the identity generator never derives a commit from git HEAD"
);

test.assert(
  generated.version === pkg.version,
  `generated version ${generated.version} matches package.json ${pkg.version}`
);
test.assert(
  generated.build === buildInfo.build,
  `generated build ${generated.build} matches build-info.json ${buildInfo.build}`
);
test.assert(
  read("app/generated/build-info.js").includes(`"version": "${generated.version}"`) &&
    read("app/generated/build-info.js").includes(`"build": "${generated.build}"`),
  "generated JS and JSON carry the same identity"
);

test.assert(!config.includes("defaultAppVersionInfo"), "no stale defaultAppVersionInfo fallback");
test.assert(config.includes("getAppBuildInfo"), "config exposes getAppBuildInfo");
test.assert(config.includes("devBuildInfoFallback"), "dev-only fallback is explicit");
test.assert(
  config.includes('"0.0.0-dev"') && config.includes('build: "dev"'),
  "fallback is a dev marker, never a fake release number"
);
test.assert(
  config.includes("getAppBuildInfo?.().build") && config.includes("lazyScriptUrl"),
  "lazy script cache-buster reads the generated build"
);
test.assert(
  appEntry.includes("getAppBuildInfo") && appEntry.includes("let appVersionInfo = { ...getAppBuildInfo() }"),
  "app.js initializes version state from the generated identity"
);
test.assert(
  persistenceStatus.includes("getAppBuildInfo") && !persistenceStatus.includes("defaultAppVersionInfo"),
  "persistence-status fallback uses the generated identity"
);

const buildInfoTagIndex = indexSource.indexOf('<script src="app/generated/build-info.js');
const bundleTagIndex = indexSource.indexOf('<script src="app.bundle.js');
test.assert(
  buildInfoTagIndex >= 0 && bundleTagIndex > buildInfoTagIndex,
  "index.html loads build-info.js before app.bundle.js"
);
test.assert(
  indexSource.includes(`?v=${generated.build}`),
  "index.html cache-busters carry the generated build"
);

test.assert(
  serverLib.includes("app/generated/build-info.json"),
  "server build-info reads the generated identity"
);
test.assert(
  versionRoute.includes("appSourceCommit") && versionRoute.includes("appSnapshotCommit"),
  "/api/version serves sourceCommit + runtime snapshotCommit"
);
test.assert(
  versionRoute.includes("generatedAt"),
  "/api/version serves a runtime generatedAt"
);
test.assert(
  shellScript.includes("app/generated/build-info.json"),
  "Mac shell reads the generated identity"
);
test.assert(
  (pkg.pkg?.assets || []).includes("app/generated/*.js"),
  "pkg assets ship app/generated/*.js"
);
test.assert(
  typeof pkg.scripts?.["verify:version"] === "string",
  "package.json exposes verify:version"
);

// --- Executable fixture: the gate must fail on deliberate inconsistency -----

const fixtureRoot = mkdtempSync(join(tmpdir(), "ai6-version-consistency-"));
const fixtureFiles = [
  "package.json",
  "build-info.json",
  "index.html",
  "app/core/config.js",
  "app/generated/build-info.js",
  "app/generated/build-info.json",
  "src/server/lib/build-info.js",
  "scripts/build-mac-shell-app.mjs",
  "scripts/verify-version-consistency.mjs",
];

try {
  for (const relativePath of fixtureFiles) {
    const destination = join(fixtureRoot, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, relativePath), destination);
  }

  const runGate = (fixtureRootArg) => {
    const result = spawnSync(
      process.execPath,
      [
        join(fixtureRootArg, "scripts/verify-version-consistency.mjs"),
        "--no-server",
      ],
      { cwd: fixtureRootArg, encoding: "utf8" }
    );
    return { status: result.status, output: `${result.stdout || ""}${result.stderr || ""}` };
  };

  const consistent = runGate(fixtureRoot);
  test.assert(
    consistent.status === 0,
    `consistent fixture passes the gate (exit ${consistent.status})`
  );
  if (consistent.status !== 0) console.error(consistent.output);

  writeFileSync(
    join(fixtureRoot, "build-info.json"),
    JSON.stringify({ ...buildInfo, build: "20260101.99" }, null, 2),
    "utf8"
  );
  const staleBuild = runGate(fixtureRoot);
  test.assert(
    staleBuild.status !== 0,
    `gate fails when build-info.json disagrees (exit ${staleBuild.status})`
  );

  writeFileSync(
    join(fixtureRoot, "build-info.json"),
    JSON.stringify(buildInfo, null, 2),
    "utf8"
  );
  const generatedJsonPath = join(fixtureRoot, "app/generated/build-info.json");
  const generatedCopy = JSON.parse(readFileSync(generatedJsonPath, "utf8"));
  writeFileSync(
    generatedJsonPath,
    JSON.stringify({ ...generatedCopy, version: "9.9.9" }, null, 2),
    "utf8"
  );
  const staleGenerated = runGate(fixtureRoot);
  test.assert(
    staleGenerated.status !== 0,
    `gate fails when generated identity disagrees (exit ${staleGenerated.status})`
  );

  rmSync(join(fixtureRoot, "app/generated/build-info.js"));
  const missingGenerated = runGate(fixtureRoot);
  test.assert(
    missingGenerated.status !== 0,
    `gate fails when generated build-info.js is missing (exit ${missingGenerated.status})`
  );
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

test.finish();
