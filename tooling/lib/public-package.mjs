/**
 * Public-safe package.json for the GitHub source snapshot.
 *
 * The curated snapshot at github.com/surfine/AI-System-6 intentionally omits
 * internal deployment, signing, native-tooling, visual-capture and
 * publishing scripts and the private prompt sources. This module rewrites
 * package.json for that snapshot so every command it exposes is executable
 * from the published tree:
 *
 *   - only commands reviewed for a fresh public clone are retained;
 *   - prebuild:app no longer rebuilds the private AI prompt files;
 *   - verify:public verifies the tree it runs from (the snapshot itself);
 *   - the pkg packaging config and dependency are removed with the packaging
 *     scripts;
 *   - package-lock.json is reduced to the dependency graph reachable from the
 *     public package, including cross-platform optional packages.
 */

import path from "node:path";

/**
 * Supported commands in a fresh public clone.
 *
 * This is an allowlist rather than a denylist: a new maintainer command stays
 * private until its complete input surface is deliberately reviewed. That
 * prevents package.json from advertising icon provenance, native packaging,
 * release, visual-capture, or deployment workflows whose inputs do not ship.
 */
export const publicScriptNames = new Set([
  "test",
  "lint",
  "verify:contracts",
  "test:unit",
  "test:integration",
  "test:e2e:smoke",
  "prestart",
  "start",
  "build",
  "prebuild:app",
  "build:app",
  "build:cmf-renderer-vendor",
  "build:stream-markdown-vendor",
  "site:sync",
  "site:check",
  "site:capture-frames",
  "site:render-og",
  "docs:sync-hashes",
  "verify:docs",
  "verify:src",
  "verify:floppy",
  "perf:budget",
  "verify:quick",
  "verify:features",
  "verify:feature",
  "test:e2e",
  "verify:data",
  "verify:css",
  "verify:design",
  "verify:version",
  "verify:checkjs",
  "verify:public",
  "verify:public-tree",
  "verify:theme-icons",
]);

/** Public prebuild: only vendor bundles; private prompt sources stay private. */
export const publicPrebuildApp =
  "npm run build:stream-markdown-vendor && npm run build:cmf-renderer-vendor";

export function buildPublicPackageJson(privatePkg) {
  const scripts = { ...(privatePkg.scripts || {}) };
  for (const name of Object.keys(scripts)) {
    if (!publicScriptNames.has(name)) delete scripts[name];
  }
  scripts["prebuild:app"] = publicPrebuildApp;
  // In the public repo, verify:public checks the tree it runs from. The
  // private repo keeps a snapshot-directed variant of the same command.
  scripts["verify:public"] = "npm run verify:public-tree";
  scripts["verify:public-tree"] = "node tooling/verify-public-tree.mjs";

  const result = { ...privatePkg };
  result.scripts = Object.fromEntries(
    Object.entries(scripts).sort(([a], [b]) => a.localeCompare(b))
  );
  result.devDependencies = { ...(privatePkg.devDependencies || {}) };
  delete result.devDependencies.pkg;
  delete result.pkg;
  return result;
}

const rootDependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const packageDependencyFields = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
];

/**
 * Resolve an npm dependency name from a package-lock v3 package path.
 *
 * Lockfile package keys mirror Node's nested node_modules layout. Walking
 * toward the repository root preserves npm's normal nearest-package
 * resolution without tying the snapshot builder to npm internals.
 */
function resolveLockedDependency(packages, fromPackage, dependencyName) {
  let current = fromPackage;
  for (;;) {
    const candidate = current
      ? `${current}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (packages[candidate]) return candidate;
    if (!current) return null;
    current = path.posix.dirname(current);
    if (current === ".") current = "";
  }
}

/**
 * Build the public package-lock.json without private-only dependency residue.
 *
 * npm accepts unreachable package records, but leaving them in the public
 * lockfile makes security scanners and contributors review software that can
 * never be installed. Traverse from the public root instead and retain every
 * reachable dependency. Optional packages for other operating systems remain
 * reachable by design, so the resulting lockfile stays cross-platform.
 */
export function buildPublicPackageLock(privateLock, publicPkg) {
  if (!privateLock?.packages?.[""]) {
    throw new Error("Public snapshot requires a package-lock with a root package");
  }

  const result = structuredClone(privateLock);
  const rootPackage = result.packages[""];
  for (const field of rootDependencyFields) {
    if (publicPkg[field] && Object.keys(publicPkg[field]).length) {
      rootPackage[field] = structuredClone(publicPkg[field]);
    } else {
      delete rootPackage[field];
    }
  }

  const retained = new Set([""]);
  const queue = [];
  const retainDependencies = (fromPackage, dependencyMap) => {
    for (const dependencyName of Object.keys(dependencyMap || {})) {
      const resolved = resolveLockedDependency(
        result.packages,
        fromPackage,
        dependencyName
      );
      if (!resolved || retained.has(resolved)) continue;
      retained.add(resolved);
      queue.push(resolved);
    }
  };

  for (const field of rootDependencyFields) {
    retainDependencies("", rootPackage[field]);
  }
  while (queue.length) {
    const packagePath = queue.shift();
    const lockedPackage = result.packages[packagePath];
    for (const field of packageDependencyFields) {
      retainDependencies(packagePath, lockedPackage[field]);
    }
  }

  result.packages = Object.fromEntries(
    Object.entries(result.packages).filter(([packagePath]) => retained.has(packagePath))
  );
  return result;
}
