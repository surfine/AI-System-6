// Contract: the public GitHub snapshot is independently verifiable.
//
// package.json in the snapshot is rewritten to a public-safe surface: every
// command it exposes must reference files that actually ship, internal
// deploy/signing/packaging/native/visual commands must not be exposed, and
// prebuild:app must not reference the private AI prompt sources. The gate
// scripts/verify-public-tree.mjs enforces the same rules inside the public
// repository; this test exercises the transformation and manifest coherence
// against the working tree (no network, no snapshot build).

import { existsSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";
import { buildPublicPackageJson, internalOnlyScriptNames, publicPrebuildApp } from "../../scripts/lib/public-package.mjs";

const test = createFeatureTest("public-tree");
const privatePkg = JSON.parse(read("package.json"));
const publicPkg = buildPublicPackageJson(privatePkg);
const publicScripts = publicPkg.scripts || {};

for (const name of Object.keys(privatePkg.scripts || {})) {
  if (internalOnlyScriptNames.has(name)) {
    test.assert(
      !(name in publicScripts),
      `internal script removed from public package.json: ${name}`
    );
  }
}

test.assert(
  publicScripts["prebuild:app"] === publicPrebuildApp,
  "public prebuild:app avoids the private prompt build"
);
test.assert(
  publicScripts["verify:public"] === "node scripts/verify-public-tree.mjs",
  "public verify:public verifies the tree it runs from"
);
test.assert(
  typeof publicScripts.build === "string" && publicScripts.build.trim().length > 0,
  "public package.json exposes a real build script (README + CI run npm run build)"
);
test.assert(
  publicScripts.build === "npm run build:app",
  "the public build script maps to build:app"
);
test.assert(!("pkg" in publicPkg), "public package.json drops the pkg packaging config");
test.assert(
  publicPkg.dependencies && publicPkg.devDependencies && publicPkg.overrides,
  "public package.json keeps dependencies/devDependencies/overrides"
);

function referencedFiles(scriptValue) {
  const files = new Set();
  for (const match of String(scriptValue).matchAll(
    /node\s+(?:--prefix\s+(\S+)\s+run\s+\S+\s+)?(scripts\/[A-Za-z0-9_./-]+\.mjs|src\/[A-Za-z0-9_./-]+\.js)/g
  )) {
    files.add(match[1] ? `${match[1]}/package.json` : (match[2] || match[1]));
  }
  const config = String(scriptValue).match(/playwright\s+test\s+--config\s+([A-Za-z0-9_./-]+\.mjs)/);
  if (config) files.add(config[1]);
  return files;
}

for (const [name, value] of Object.entries(publicScripts)) {
  for (const file of referencedFiles(value)) {
    test.assert(
      existsSync(join(root, file)),
      `public script ${name} references an existing file (${file})`
    );
  }
  for (const nested of String(value).matchAll(/npm\s+run\s+([A-Za-z0-9:_-]+)/g)) {
    if (nested[1] !== name) {
      test.assert(
        nested[1] in publicScripts,
        `public script ${name} references an existing script (${nested[1]})`
      );
    }
  }
}

test.assert(
  existsSync(join(root, ".github/workflows/ci.yml")),
  "CI workflow ships with the tree"
);
const ci = read(".github/workflows/ci.yml");
for (const command of ["npm ci", "npm run build", "npm test", "npm run verify:public"]) {
  test.assert(ci.includes(command), `CI runs ${command}`);
}

const manifest = read("scripts/public-snapshot-manifest.mjs");
test.assert(
  manifest.includes('".github/"'),
  "snapshot manifest publishes .github/"
);

const readme = read("README.md");
for (const command of ["npm ci", "npm run build", "npm test", "npm run verify:public", "npm start"]) {
  test.assert(readme.includes(command), `README documents ${command}`);
}

const gitignore = read(".gitignore");
test.assert(
  gitignore.includes("test-results/") && gitignore.includes("playwright-report/"),
  ".gitignore covers Playwright artifacts"
);

test.finish();
