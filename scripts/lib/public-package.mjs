/**
 * Public-safe package.json for the GitHub source snapshot.
 *
 * The curated snapshot at github.com/surfine/AI-System-6 intentionally omits
 * internal deployment, signing, native-tooling, visual-capture and
 * publishing scripts and the private prompt sources. This module rewrites
 * package.json for that snapshot so every command it exposes is executable
 * from the published tree:
 *
 *   - scripts whose target files are excluded are dropped;
 *   - prebuild:app no longer rebuilds the private AI prompt files;
 *   - verify:public verifies the tree it runs from (the snapshot itself);
 *   - the pkg packaging config is removed with the packaging scripts.
 */

/** Scripts that must never be exposed to the public repository. */
export const internalOnlyScriptNames = new Set([
  "build:ai-prompt-files",
  "build:legacy-webkit",
  "export:native-resources",
  "verify:native-action-audit",
  "verify:native-parity-ledger",
  "verify:visual",
  "snapshot:css",
  "snapshot:css:diff",
  "visual:eval",
  "visual:diff",
  "visual:update",
  "render:capture",
  "render:diff",
  "render:update",
  "prebundle",
  "bundle",
  "prebundle:desktop",
  "bundle:desktop",
  "prebundle:mac-x64",
  "bundle:mac-x64",
  "bundle:mac-intel-app",
  "prebundle:mac-arm64",
  "bundle:mac-arm64",
  "bundle:mac-a12z-dtk",
  "prebundle:win-x64",
  "bundle:win-x64",
  "bundle:mac-app",
  "shell:mac",
  "shell:mac:no-server",
  "shell:mac:app",
  "verify:web-safety",
  "deploy:web",
  "release",
  "snapshot:build",
  "snapshot:verify",
  "snapshot:sync",
  "eval:mingming-outline",
]);

/** Public prebuild: only vendor bundles; private prompt sources stay private. */
export const publicPrebuildApp =
  "npm run build:stream-markdown-vendor && npm run build:cmf-renderer-vendor";

export function buildPublicPackageJson(privatePkg) {
  const scripts = { ...(privatePkg.scripts || {}) };
  for (const name of Object.keys(scripts)) {
    if (internalOnlyScriptNames.has(name)) delete scripts[name];
  }
  scripts["prebuild:app"] = publicPrebuildApp;
  // In the public repo, verify:public checks the tree it runs from. The
  // private repo keeps a snapshot-directed variant of the same command.
  scripts["verify:public"] = "node scripts/verify-public-tree.mjs";

  const result = { ...privatePkg };
  result.scripts = Object.fromEntries(
    Object.entries(scripts).sort(([a], [b]) => a.localeCompare(b))
  );
  delete result.pkg;
  return result;
}
