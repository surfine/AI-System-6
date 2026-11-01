// Non-secret signing configuration for the production Mac build.
//
// The signing identity and notary profile are machine facts, not source: this
// repository ships no certificate SHA-1 and no profile name. They arrive in
// AI_SYSTEM6_DEVELOPER_ID and AI_SYSTEM6_NOTARY_PROFILE (or a gitignored
// signing.local.json); the committed signing.json documents the fields and
// stays empty. The private key and the notary credential never leave the
// login keychain.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export const MAC_SIGNING_CONFIG_FILE = "platform/macos/tinyjs/signing.json";

const SHA1 = /^[0-9A-Fa-f]{40}$/;
const PROFILE = /^[A-Za-z0-9._-]{1,64}$/;

export function readMacSigningConfig(repoRoot, readText = (file) => readFileSync(file, "utf8")) {
  const file = join(repoRoot, MAC_SIGNING_CONFIG_FILE);
  let value;
  try {
    value = JSON.parse(readText(file));
  } catch (error) {
    throw new Error(`Mac signing config ${MAC_SIGNING_CONFIG_FILE} is missing or unreadable: ${error.message}`);
  }
  let developerId = String(value?.developerId || "").trim();
  let notaryProfile = String(value?.notaryProfile || "").trim();
  if (!developerId && !notaryProfile) {
    // A local override keeps a maintainer's machine working without putting
    // either value in the tree.
    try {
      const local = JSON.parse(readText(join(repoRoot, "platform/macos/tinyjs/signing.local.json")));
      developerId = String(local?.developerId || "").trim();
      notaryProfile = String(local?.notaryProfile || "").trim();
    } catch {}
  }
  if (developerId && !SHA1.test(developerId)) throw new Error(`${MAC_SIGNING_CONFIG_FILE}: developerId must be the 40-hex SHA-1 of the Developer ID Application certificate`);
  if (notaryProfile && !PROFILE.test(notaryProfile)) throw new Error(`${MAC_SIGNING_CONFIG_FILE}: notaryProfile must be a notarytool keychain profile name`);
  return { developerId: developerId.toUpperCase(), notaryProfile };
}

/**
 * The environment a production build signs with: the file fills what the
 * environment leaves empty. A profile is added only when no other notary
 * credential is set, so an explicit API key is never shadowed by the file.
 */
export function withMacSigningDefaults(env, config) {
  const next = { ...env };
  if (!String(next.AI_SYSTEM6_DEVELOPER_ID || "").trim()) next.AI_SYSTEM6_DEVELOPER_ID = config.developerId;
  const otherNotary = Boolean(
    (next.AI_SYSTEM6_NOTARY_KEY_ID && next.AI_SYSTEM6_NOTARY_ISSUER && next.AI_SYSTEM6_NOTARY_KEY)
    || (next.AI_SYSTEM6_NOTARY_APPLE_ID && next.AI_SYSTEM6_NOTARY_APP_PASSWORD && next.AI_SYSTEM6_TEAM_ID),
  );
  if (!String(next.AI_SYSTEM6_NOTARY_PROFILE || "").trim() && !otherNotary) next.AI_SYSTEM6_NOTARY_PROFILE = config.notaryProfile;
  return next;
}

function defaultRun(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 60_000 });
  return { status: result.status, stdout: String(result.stdout || ""), stderr: String(result.stderr || "") };
}

/**
 * Fail early and in plain words, before an hour of building: the certificate
 * (with its private key) must be in a keychain, and the notary profile must
 * answer (an API-key setup passes no profile and skips that probe). Returns the list of problems; empty means ready. No secret is read
 * or printed. `checkProfile: false` skips the one network call.
 */
export function macSigningProblems({ identity, notaryProfile, run = defaultRun, checkProfile = true }) {
  const problems = [];
  if (!SHA1.test(String(identity || ""))) {
    problems.push("the signing identity is not a SHA-1 hash");
  } else {
    const listed = run("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning"]);
    if (listed.status !== 0 || !listed.stdout.toUpperCase().includes(identity.toUpperCase())) {
      problems.push(`Developer ID identity ${identity.toUpperCase()} is not a valid code-signing identity in the keychain`);
    }
  }
  if (notaryProfile && checkProfile) {
    const probe = run("/usr/bin/xcrun", ["notarytool", "history", "--keychain-profile", notaryProfile]);
    if (probe.status !== 0) {
      problems.push(`notarytool keychain profile "${notaryProfile}" is missing or rejected (store it with: xcrun notarytool store-credentials ${notaryProfile})`);
    }
  }
  return problems;
}
