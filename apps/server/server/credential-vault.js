"use strict";

const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const keychainService = "AI System 6 Cloud Credential";
const stagedCredentials = new Map();

function normalizedCredentialId(value) {
  const id = String(value || "").trim();
  return /^cred-[a-f0-9]{32}$/.test(id) ? id : "";
}

function createCredentialId(provider, baseUrl) {
  const identity = [
    String(provider || "cloud").trim().toLowerCase(),
    String(baseUrl || "").trim().toLowerCase().replace(/\/+$/, ""),
  ].join("\n");
  return `cred-${crypto.createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

function providerEnvironmentKey(provider) {
  if (String(provider || "").toLowerCase() === "deepseek") {
    return String(process.env.DEEPSEEK_API_KEY || "").trim();
  }
  return "";
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

function stageCloudCredential({ provider, baseUrl, apiKey }) {
  const secret = String(apiKey || "").trim();
  if (!secret) throw new Error("Missing API key.");
  if (Buffer.byteLength(secret, "utf8") > 8192) throw new Error("API key is too large.");
  const credentialId = createCredentialId(provider, baseUrl);
  stagedCredentials.set(credentialId, secret);
  return credentialId;
}

async function persistCloudCredential(credentialId) {
  const id = normalizedCredentialId(credentialId);
  const secret = id ? stagedCredentials.get(id) : "";
  if (!id || !secret) throw new Error("Credential is not staged in this local service.");
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
 *   suppliedApiKey?: string,
 *   allowSupplied?: boolean,
 * }} [options]
 * @returns {Promise<string>}
 */
async function resolveCloudCredential(options = {}) {
  const {
    credentialId,
    provider,
    suppliedApiKey,
    allowSupplied = false,
  } = options;
  if (allowSupplied && suppliedApiKey) return String(suppliedApiKey).trim();
  const id = normalizedCredentialId(credentialId);
  if (id && stagedCredentials.has(id)) return stagedCredentials.get(id);
  if (id) {
    const keychainValue = await readKeychainCredential(id);
    if (keychainValue) {
      stagedCredentials.set(id, keychainValue);
      return keychainValue;
    }
  }
  return providerEnvironmentKey(provider);
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
};
