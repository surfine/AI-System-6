// Pairing, consent and limits for public pages that ask this Mac to fetch
// Apple Music links (spec §10.2, §10.3).
//
// - A public origin must be paired on this Mac first. The writer approves it
//   on a loopback page the public page cannot script; the server keeps only a
//   SHA-256 of the token, one per origin, expiring after 30 idle days.
// - The disclaimer is accepted once per version, recorded here rather than in
//   the browser so no page can forge it.
// - Each origin may start at most 20 jobs an hour; the last 20 bridged jobs
//   are recorded and shown on the pairing page.

"use strict";

const { createHash, randomBytes, timingSafeEqual } = require("node:crypto");
const { promises: fs } = require("node:fs");
const path = require("node:path");

const CONSENT_VERSION = 1;
const PAIRING_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
const LAST_USED_WRITE_MS = 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 20;
const RECENT_LIMIT = 20;

/** @type {Map<string, number[]>} */
const recentStarts = new Map();

function stateFile(libraryRoot, name) {
  return path.join(libraryRoot, name);
}

async function readJson(filePath, fallback) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function writePrivateJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temp, filePath);
  await fs.chmod(filePath, 0o600).catch(() => {});
}

function hashToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

async function readPairings(libraryRoot) {
  const data = await readJson(stateFile(libraryRoot, "bridge-pairings.json"), {});
  const pairings = data.pairings && typeof data.pairings === "object" ? data.pairings : {};
  const now = Date.now();
  let expired = false;
  for (const [origin, record] of Object.entries(pairings)) {
    if (!record || now - Number(record.lastUsedAt || record.createdAt || 0) > PAIRING_IDLE_MS) {
      delete pairings[origin];
      expired = true;
    }
  }
  if (expired) await writePairings(libraryRoot, pairings);
  return pairings;
}

async function writePairings(libraryRoot, pairings) {
  await writePrivateJson(stateFile(libraryRoot, "bridge-pairings.json"), { pairings });
}

/**
 * Issue a fresh token for one origin, replacing any earlier one.
 *
 * @param {string} libraryRoot
 * @param {string} origin
 * @returns {Promise<string>} The token, shown to nobody but the paired page.
 */
async function pairOrigin(libraryRoot, origin) {
  const pairings = await readPairings(libraryRoot);
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  pairings[origin] = { hash: hashToken(token), createdAt: now, lastUsedAt: now };
  await writePairings(libraryRoot, pairings);
  return token;
}

/**
 * @param {string} libraryRoot
 * @param {string} origin
 * @param {string} token
 * @returns {Promise<boolean>}
 */
async function verifyPairing(libraryRoot, origin, token) {
  if (!origin || !token) return false;
  const pairings = await readPairings(libraryRoot);
  const record = pairings[origin];
  if (!record?.hash) return false;
  const expected = Buffer.from(String(record.hash));
  const actual = Buffer.from(hashToken(token));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  if (Date.now() - Number(record.lastUsedAt || 0) > LAST_USED_WRITE_MS) {
    record.lastUsedAt = Date.now();
    await writePairings(libraryRoot, pairings).catch(() => {});
  }
  return true;
}

/**
 * @param {string} libraryRoot
 * @param {string} origin An origin, or "*" for all.
 */
async function revokePairing(libraryRoot, origin) {
  const pairings = await readPairings(libraryRoot);
  if (origin === "*") {
    await writePairings(libraryRoot, {});
    return;
  }
  delete pairings[origin];
  await writePairings(libraryRoot, pairings);
}

async function listPairings(libraryRoot) {
  const pairings = await readPairings(libraryRoot);
  return Object.entries(pairings)
    .map(([origin, record]) => ({
      origin,
      createdAt: Number(record.createdAt) || 0,
      lastUsedAt: Number(record.lastUsedAt) || 0,
    }))
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

// ---------- consent ----------

async function consentAccepted(libraryRoot) {
  const record = await readJson(stateFile(libraryRoot, "consent.json"), {});
  return Number(record.version) >= CONSENT_VERSION;
}

async function acceptConsent(libraryRoot) {
  await writePrivateJson(stateFile(libraryRoot, "consent.json"), {
    version: CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
  });
}

// ---------- limits and record ----------

/**
 * Count one new job for an origin. Returns false once the hourly limit is used.
 *
 * @param {string} origin
 * @param {number} [nowMs]
 */
function takeBridgeRateSlot(origin, nowMs = Date.now()) {
  const kept = (recentStarts.get(origin) || []).filter((at) => nowMs - at < RATE_WINDOW_MS);
  if (kept.length >= RATE_LIMIT) {
    recentStarts.set(origin, kept);
    return false;
  }
  kept.push(nowMs);
  recentStarts.set(origin, kept);
  return true;
}

async function recordBridgeJob(libraryRoot, entry) {
  const file = stateFile(libraryRoot, "bridge-recent.json");
  const data = await readJson(file, {});
  const recent = Array.isArray(data.recent) ? data.recent : [];
  recent.unshift({
    origin: String(entry.origin || ""),
    url: String(entry.url || ""),
    at: new Date().toISOString(),
  });
  await writePrivateJson(file, { recent: recent.slice(0, RECENT_LIMIT) }).catch(() => {});
}

async function recentBridgeJobs(libraryRoot) {
  const data = await readJson(stateFile(libraryRoot, "bridge-recent.json"), {});
  return Array.isArray(data.recent) ? data.recent.slice(0, RECENT_LIMIT) : [];
}

function bridgeDownloadsEnabled() {
  return process.env.AI_SYSTEM6_BRIDGE_DOWNLOADS !== "0";
}

function resetBridgeRateLimits() {
  recentStarts.clear();
}

module.exports = {
  CONSENT_VERSION,
  RATE_LIMIT,
  acceptConsent,
  bridgeDownloadsEnabled,
  consentAccepted,
  listPairings,
  pairOrigin,
  recentBridgeJobs,
  recordBridgeJob,
  resetBridgeRateLimits,
  revokePairing,
  takeBridgeRateSlot,
  verifyPairing,
};
