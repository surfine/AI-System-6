"use strict";

const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { isSubscriptionCliUrl } = require("./subscription-cli.js");

// Placeholder "key" for a subscription CLI target: never a secret, never
// sent anywhere; it only satisfies routes that refuse an empty credential.
const SUBSCRIPTION_CLI_CREDENTIAL = "subscription-cli";

const {
  isTrustedAnthropicCredentialTarget,
  isTrustedDeepSeekCredentialTarget,
  normalizeCloudBaseUrl,
} = require("./cloud.js");

const execFileAsync = promisify(execFile);
const keychainService = "AI System 6 Cloud Credential";
// Micropub tokens are a different kind of secret from a model API key; they
// get their own Keychain service so the owner can tell them apart in
// Keychain Access, and the cloud credential flow is untouched.
const siteTokenKeychainService = "AI System 6 Site Token";
const stagedCredentials = new Map();
const stagedCredentialTtlMs = boundedInteger(
  process.env.AI_SYSTEM6_STAGED_CREDENTIAL_TTL_MS,
  15 * 60 * 1000,
  1000,
  24 * 60 * 60 * 1000
);
const stagedCredentialMaxEntries = boundedInteger(
  process.env.AI_SYSTEM6_STAGED_CREDENTIAL_MAX_ENTRIES,
  128,
  1,
  1024
);

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

function normalizedCredentialId(value) {
  const id = String(value || "").trim();
  return /^cred-[a-f0-9]{32}$/.test(id) ? id : "";
}

function createCredentialId(provider, baseUrl) {
  const identity = [
    String(provider || "cloud").trim().toLowerCase(),
    normalizeCloudBaseUrl(baseUrl),
  ].join("\n");
  return `cred-${crypto.createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

function providerEnvironmentKey(provider, targetBaseUrl) {
  if (isTrustedDeepSeekCredentialTarget(provider, targetBaseUrl)) {
    return String(process.env.DEEPSEEK_API_KEY || "").trim();
  }
  if (isTrustedAnthropicCredentialTarget(provider, targetBaseUrl)) {
    return String(process.env.ANTHROPIC_API_KEY || "").trim();
  }
  return "";
}

function credentialScopeMismatch() {
  const error = /** @type {Error & { code?: string, statusCode?: number }} */ (
    new Error("Cloud credential does not match the requested provider endpoint.")
  );
  error.code = "credential_scope_mismatch";
  error.statusCode = 400;
  return error;
}

function pruneStagedCredentials(now = Date.now()) {
  for (const [credentialId, entry] of stagedCredentials) {
    if (!entry || entry.expiresAt <= now) stagedCredentials.delete(credentialId);
  }
  while (stagedCredentials.size > stagedCredentialMaxEntries) {
    const oldest = stagedCredentials.keys().next().value;
    if (!oldest) break;
    stagedCredentials.delete(oldest);
  }
}

function stageSecret(credentialId, secret, now = Date.now()) {
  pruneStagedCredentials(now);
  stagedCredentials.delete(credentialId);
  stagedCredentials.set(credentialId, {
    secret,
    createdAt: now,
    expiresAt: now + stagedCredentialTtlMs,
  });
  pruneStagedCredentials(now);
}

function stagedSecret(credentialId, now = Date.now()) {
  pruneStagedCredentials(now);
  const entry = stagedCredentials.get(credentialId);
  return entry && entry.expiresAt > now ? entry.secret : "";
}

async function readKeychainCredential(credentialId, service = keychainService) {
  if (process.platform !== "darwin") return "";
  try {
    const result = await execFileAsync("/usr/bin/security", [
      "find-generic-password",
      "-s", service,
      "-a", credentialId,
      "-w",
    ], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 16 * 1024,
    });
    return String(result.stdout || "").trim();
  } catch {
    return "";
  }
}

async function writeKeychainCredential(credentialId, apiKey, service = keychainService) {
  if (process.platform !== "darwin") return false;
  try {
    await execFileAsync("/usr/bin/security", [
      "add-generic-password",
      "-s", service,
      "-a", credentialId,
      "-w", apiKey,
      "-U",
    ], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 16 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

async function deleteKeychainCredential(credentialId, service = keychainService) {
  if (process.platform !== "darwin") return false;
  try {
    await execFileAsync("/usr/bin/security", [
      "delete-generic-password",
      "-s", service,
      "-a", credentialId,
    ], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 16 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

// Faults the caller can correct. Without a status these reached the top-level
// handler as unclassified errors, which answered 500 "Unhandled server error"
// and hid the one thing the user had to know: which field was wrong.
function credentialRequestError(message, statusCode, code) {
  const error = /** @type {Error & { code?: string, statusCode?: number }} */ (
    new Error(message)
  );
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function stageCloudCredential({ provider, baseUrl, apiKey, now = Date.now() }) {
  const secret = String(apiKey || "").trim();
  if (!secret) {
    throw credentialRequestError(
      "Missing API key. Enter the provider API key in Control Panel, then try again.",
      400,
      "missing_api_key"
    );
  }
  if (Buffer.byteLength(secret, "utf8") > 8192) {
    throw credentialRequestError(
      "API key is too large. An API key must be 8192 bytes or less.",
      413,
      "api_key_too_large"
    );
  }
  const credentialId = createCredentialId(provider, baseUrl);
  stageSecret(credentialId, secret, now);
  return credentialId;
}

async function persistCloudCredential(credentialId) {
  const id = normalizedCredentialId(credentialId);
  const secret = id ? stagedSecret(id) : "";
  if (!id || !secret) {
    throw credentialRequestError(
      "Credential is not staged in this local service. Enter the API key again, then save it.",
      409,
      "credential_not_staged"
    );
  }
  const requireKeychain = process.env.AI_SYSTEM6_REQUIRE_KEYCHAIN === "1";
  const previousSecret = requireKeychain ? await readKeychainCredential(id) : "";
  const stored = await writeKeychainCredential(id, secret);
  if (!stored && requireKeychain) {
    throw credentialRequestError("Keychain could not save this credential; the previous configuration is retained.", 503, "keychain_unavailable");
  }
  if (stored && requireKeychain) {
    const readback = await readKeychainCredential(id);
    const hash = (value) => crypto.createHash("sha256").update(value).digest();
    if (!crypto.timingSafeEqual(hash(secret), hash(readback))) {
      if (previousSecret) await writeKeychainCredential(id, previousSecret);
      else await deleteKeychainCredential(id);
      throw credentialRequestError("Keychain verification failed; keep the original configuration.", 503, "keychain_unavailable");
    }
    // A subsequent availability check must exercise Keychain, not this cache.
    stagedCredentials.delete(id);
  }
  return {
    credentialId: id,
    persistence: stored ? "keychain" : "service-session",
  };
}

/**
 * @param {{
 *   credentialId?: string,
 *   provider?: string,
 *   targetBaseUrl?: string,
 *   suppliedApiKey?: string,
 *   allowSupplied?: boolean,
 *   now?: number,
 * }} [options]
 * @returns {Promise<string>}
 */
async function resolveCloudCredential(options = {}) {
  const {
    credentialId,
    provider,
    targetBaseUrl,
    suppliedApiKey,
    allowSupplied = false,
    now = Date.now(),
  } = options;
  // A subscription CLI signs in on its own; there is no secret to find, and
  // none may be sent (docs/SUBSCRIPTION-CLI.md).
  if (isSubscriptionCliUrl(targetBaseUrl)) return SUBSCRIPTION_CLI_CREDENTIAL;
  const normalizedTargetBaseUrl = normalizeCloudBaseUrl(targetBaseUrl);
  const id = normalizedCredentialId(credentialId);
  if (id && id !== createCredentialId(provider, normalizedTargetBaseUrl)) {
    throw credentialScopeMismatch();
  }
  if (allowSupplied && suppliedApiKey) return String(suppliedApiKey).trim();
  // The writer puts an Anthropic key into Keychain from a terminal, so the
  // browser never holds an id for it: its Keychain entry is found by the same
  // provider-and-endpoint id the Control Panel would have created.
  if (!id && isTrustedAnthropicCredentialTarget(provider, normalizedTargetBaseUrl)) {
    const anthropicId = createCredentialId(provider, normalizedTargetBaseUrl);
    const keychainValue = stagedSecret(anthropicId, now) || await readKeychainCredential(anthropicId);
    if (keychainValue) {
      stageSecret(anthropicId, keychainValue, now);
      return keychainValue;
    }
  }
  const sessionSecret = id ? stagedSecret(id, now) : "";
  if (sessionSecret) return sessionSecret;
  if (id) {
    const keychainValue = await readKeychainCredential(id);
    if (keychainValue) {
      stageSecret(id, keychainValue, now);
      return keychainValue;
    }
  }
  return providerEnvironmentKey(provider, normalizedTargetBaseUrl);
}

async function deleteCloudCredential(credentialId) {
  const id = normalizedCredentialId(credentialId);
  if (!id) return false;
  stagedCredentials.delete(id);
  await deleteKeychainCredential(id);
  return true;
}

function discardStagedCredential(credentialId) {
  const id = normalizedCredentialId(credentialId);
  return id ? stagedCredentials.delete(id) : false;
}

/**
 * A Micropub token's identity is the site and its endpoint, never the token
 * itself. The id is derived, so the description does not carry even an id —
 * and a token entered for one site cannot satisfy another.
 * @param {string} siteId
 * @param {string} endpoint
 */
function micropubCredentialId(siteId, endpoint) {
  const identity = [
    "micropub",
    String(siteId || "").trim(),
    String(endpoint || "").trim().toLowerCase(),
  ].join("\n");
  return `cred-${crypto.createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

/**
 * Save one Micropub token to the Keychain. There is deliberately no staged
 * path: a publish token has no "enter again to confirm" step, and a token the
 * user typed once must not linger in memory waiting for a second request.
 * @param {string} siteId
 * @param {string} endpoint
 * @param {string} token
 * @returns {Promise<{ credentialId: string, persistence: "keychain" }>}
 */
async function persistMicropubToken(siteId, endpoint, token) {
  const secret = String(token || "").trim();
  if (!secret) {
    throw credentialRequestError("Missing Micropub token.", 400, "missing_token");
  }
  if (Buffer.byteLength(secret, "utf8") > 8192) {
    throw credentialRequestError("Micropub token is too large (8192 bytes max).", 413, "token_too_large");
  }
  const id = micropubCredentialId(siteId, endpoint);
  const stored = await writeKeychainCredential(id, secret, siteTokenKeychainService);
  if (!stored) {
    throw credentialRequestError(
      "Keychain could not save this token. Save it from the macOS desktop; no token is written to disk or to the site description.",
      503,
      "keychain_unavailable"
    );
  }
  const readback = await readKeychainCredential(id, siteTokenKeychainService);
  const hash = (value) => crypto.createHash("sha256").update(value).digest();
  if (!readback || !crypto.timingSafeEqual(hash(secret), hash(readback))) {
    await deleteKeychainCredential(id, siteTokenKeychainService);
    throw credentialRequestError("Keychain verification failed; the token was not saved.", 503, "keychain_unavailable");
  }
  return { credentialId: id, persistence: "keychain" };
}

/**
 * The token for one site and endpoint, or "" when none is stored. Callers must
 * never put the result in a response, a log line or an error message.
 * @param {string} siteId
 * @param {string} endpoint
 * @returns {Promise<string>}
 */
async function resolveMicropubToken(siteId, endpoint) {
  const id = micropubCredentialId(siteId, endpoint);
  return await readKeychainCredential(id, siteTokenKeychainService);
}

/**
 * @param {string} siteId
 * @param {string} endpoint
 * @returns {Promise<boolean>}
 */
/**
 * Remove one site's Micropub token from the Keychain. The token is never
 * returned. Nothing stored is `{ deleted: false }`, not an error. A machine
 * without the Keychain says so, the same way saving does.
 * @param {string} siteId
 * @param {string} endpoint
 * @returns {Promise<{ deleted: boolean }>}
 */
async function deleteMicropubToken(siteId, endpoint) {
  if (process.platform !== "darwin") {
    throw credentialRequestError(
      "Keychain could not delete this token. Delete it from the macOS desktop; no token is written to disk.",
      503,
      "keychain_unavailable"
    );
  }
  const id = micropubCredentialId(siteId, endpoint);
  stagedCredentials.delete(id);
  const existing = await readKeychainCredential(id, siteTokenKeychainService);
  if (!existing) return { deleted: false };
  const deleted = await deleteKeychainCredential(id, siteTokenKeychainService);
  if (!deleted) {
    throw credentialRequestError(
      "Keychain could not delete this token. Delete it from the macOS desktop; no token is written to disk.",
      503,
      "keychain_unavailable"
    );
  }
  return { deleted: true };
}

module.exports = {
  createCredentialId,
  deleteCloudCredential,
  deleteMicropubToken,
  discardStagedCredential,
  micropubCredentialId,
  normalizedCredentialId,
  persistCloudCredential,
  persistMicropubToken,
  resolveCloudCredential,
  resolveMicropubToken,
  stageCloudCredential,
  stagedCredentialConfig: Object.freeze({
    maxEntries: stagedCredentialMaxEntries,
    ttlMs: stagedCredentialTtlMs,
  }),
};
