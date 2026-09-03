"use strict";

const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const {
  isTrustedDeepSeekCredentialTarget,
  normalizeCloudBaseUrl,
} = require("./cloud.js");

const execFileAsync = promisify(execFile);
const keychainService = "AI System 6 Cloud Credential";
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

async function readKeychainCredential(credentialId) {
  if (process.platform !== "darwin") return "";
  try {
    const result = await execFileAsync("/usr/bin/security", [
      "find-generic-password",
      "-s", keychainService,
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

async function writeKeychainCredential(credentialId, apiKey) {
  if (process.platform !== "darwin") return false;
  try {
    await execFileAsync("/usr/bin/security", [
      "add-generic-password",
      "-s", keychainService,
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

async function deleteKeychainCredential(credentialId) {
  if (process.platform !== "darwin") return false;
  try {
    await execFileAsync("/usr/bin/security", [
      "delete-generic-password",
      "-s", keychainService,
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
  const stored = await writeKeychainCredential(id, secret);
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
  const normalizedTargetBaseUrl = normalizeCloudBaseUrl(targetBaseUrl);
  const id = normalizedCredentialId(credentialId);
  if (id && id !== createCredentialId(provider, normalizedTargetBaseUrl)) {
    throw credentialScopeMismatch();
  }
  if (allowSupplied && suppliedApiKey) return String(suppliedApiKey).trim();
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

module.exports = {
  createCredentialId,
  deleteCloudCredential,
  discardStagedCredential,
  normalizedCredentialId,
  persistCloudCredential,
  resolveCloudCredential,
  stageCloudCredential,
  stagedCredentialConfig: Object.freeze({
    maxEntries: stagedCredentialMaxEntries,
    ttlMs: stagedCredentialTtlMs,
  }),
};
