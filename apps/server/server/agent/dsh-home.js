// Each run's own DSH_HOME, seeded from a fixed template.
//
// dsh reads its configuration from DSH_HOME at every boot: the profile's
// package.json (which bundles to mount), the profile's and the home's
// cordis.patch.yml (patch layers that allow `!!js` expressions and MCP server
// entries) and the home's .env. A shared DSH_HOME the engine could write would
// let one prompt-injected run plant code that every later run executes with
// the real provider key in its environment, and let a run read another run's
// session transcripts. So a run gets a home of its own inside its shadow
// (shadows/<run>/dsh-home), seeded here with exactly what dsh 0.2.1-rc.3's
// initProfile writes for the `acp` profile; the sandbox profile keeps that
// configuration unwritable (sandbox-profile.js dshConfigPaths); and discard
// removes the home with the shadow, sessions included.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { DSH_PROFILE } = require("./sandbox-profile.js");

const HOME_NAME = "dsh-home";

/**
 * The files dsh's initProfile and prepareProfile write for a fresh `acp`
 * profile (dsh-app-boot PROFILE_TEMPLATES.acp, PROFILE_PATCH_TEMPLATE,
 * PROFILE_PNPM_WORKSPACE; dsh profile-boot PROFILE_ROOT_CONFIG). Seeding them
 * means dsh never has to create anything under profiles/ itself.
 */
const PROFILE_TEMPLATE = Object.freeze({
  "package.json": `${JSON.stringify({
    name: `dsh-profile-${DSH_PROFILE}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-acp-app"] } },
  }, undefined, 2)}\n`,
  "cordis.yml": [
    "# dsh profile root — an empty entry list. The tree is composed as patches:",
    "# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any",
    "# --patch overlays. Edit cordis.patch.yml, not this file.",
    "[]",
    "",
  ].join("\n"),
  "cordis.patch.yml": [
    "# Your patch layer for this dsh profile, applied after every bundle layer:",
    "# a top-level YAML array of loader patch entries (id-targeted config",
    "# overrides, disables, and insert lists; `!!js` expressions allowed).",
    "[]",
    "",
  ].join("\n"),
  "pnpm-workspace.yaml": "packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n",
});

/** Directories dsh writes during a run (session logs, projection cache). */
const WRITABLE_DIRS = Object.freeze(["sessions", "storages"]);

/** @param {string} shadowRoot shadows/<run> */
function runDshHome(shadowRoot) {
  return path.join(shadowRoot, HOME_NAME);
}

/**
 * Create a run's DSH_HOME from the template. The directory must not exist:
 * a home is never shared or reused.
 * @param {string} dir
 * @returns {string} the home
 */
function seedDshHome(dir) {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.mkdirSync(dir, { mode: 0o700 });
  const profileDir = path.join(dir, "profiles", DSH_PROFILE);
  fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
  for (const [name, text] of Object.entries(PROFILE_TEMPLATE)) {
    fs.writeFileSync(path.join(profileDir, name), text, { mode: 0o600, flag: "wx" });
  }
  for (const name of WRITABLE_DIRS) fs.mkdirSync(path.join(dir, name), { mode: 0o700 });
  return dir;
}

module.exports = { HOME_NAME, PROFILE_TEMPLATE, WRITABLE_DIRS, runDshHome, seedDshHome };
