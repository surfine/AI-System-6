// The agent mode's own allowance on the shared DeepSeek key.
//
// Chat has its own pool (shared-cloud-budget.js: 28 requests per session, 32k
// input per request). One agent run makes 5 to 24 model calls with large
// contexts, so booking them there emptied the chat allowance and hit its input
// cap. Agent calls are booked here instead, in a separate file with the same
// lock, atomic write and UTC day as the chat budget, so the operator's bill is
// bounded by two ceilings per day: runs started and weighted tokens reserved.
//
// Per session the run count stays in runs.js (agent-cloud-usage.json, 2 shared
// runs a day); per run the call and token caps stay in the proxy. This module
// adds the per-call input cap, the site-wide daily ceilings and the per-address
// share of shared runs (a visitor can mint many Turnstile sessions from one
// address). The address is stored only as a keyed hash salted with the UTC
// day, in a file that starts afresh each day. Chat counters are never touched.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { agentCloudCaps } = require("./config.js");
const {
  createReservation,
  estimatedInputTokens,
  persistState,
  secondsUntilUtcReset,
  utcDay,
  utcResetAt,
  withStateLock,
} = require("../shared-cloud-budget.js");

const STATE_FILE = "agent-cloud-allowance.json";

function emptyState(day) {
  return { day, runs: 0, reserved_tokens: 0, reservations: {}, settled_reservations: {}, addresses: {} };
}

/**
 * The day's key for a client address: never the address itself. Salted with
 * the day so keys cannot be joined across days, and with the session secret
 * when the deployment has one, so a key cannot be reversed by trying every
 * IPv4 address.
 * @param {string} address  as public-session.js clientIp() derives it
 * @param {string} day
 */
function addressKey(address, day) {
  const secret = String(process.env.AI_SYSTEM6_SESSION_SECRET || "");
  return crypto.createHmac("sha256", `ais6-agent-cloud-address\n${secret}`)
    .update(`${day}\n${String(address || "unknown")}`)
    .digest("hex")
    .slice(0, 32);
}

/** @param {any} value @param {string} day */
function normalizedState(value, day) {
  if (!value || value.day !== day) return emptyState(day);
  const count = (/** @type {any} */ number) => Math.max(0, Math.floor(Number(number) || 0));
  const reservations = {};
  for (const [key, entry] of Object.entries(value.reservations && typeof value.reservations === "object" ? value.reservations : {})) {
    if (!/^[a-f0-9]{32}$/.test(key) || !entry || typeof entry !== "object") continue;
    reservations[key] = { reserved_tokens: count(/** @type {any} */ (entry).reserved_tokens), created_at: count(/** @type {any} */ (entry).created_at) };
  }
  const settled = {};
  for (const [key, at] of Object.entries(value.settled_reservations && typeof value.settled_reservations === "object" ? value.settled_reservations : {})) {
    if (/^[a-f0-9]{32}$/.test(key) && Number.isFinite(Number(at))) settled[key] = count(at);
  }
  const addresses = {};
  for (const [key, runs] of Object.entries(value.addresses && typeof value.addresses === "object" ? value.addresses : {})) {
    if (/^[a-f0-9]{32}$/.test(key)) addresses[key] = count(runs);
  }
  return { day, runs: count(value.runs), reserved_tokens: count(value.reserved_tokens), reservations, settled_reservations: settled, addresses };
}

// Always read under the lock, so two processes (or a test reload) agree.
function loadState(now) {
  let value = null;
  try { value = JSON.parse(fs.readFileSync(statePath(), "utf8")); } catch {}
  return normalizedState(value, utcDay(now));
}

function statePath() {
  return path.join(String(process.env.AI_SYSTEM6_STATE_DIR || "/var/lib/ai-system6").trim(), STATE_FILE);
}

function failure(code, status, now, detail) {
  return { ok: false, code, status, retryAfter: code === "agent_cloud_input_too_large" ? 0 : secondsUntilUtcReset(now), detail };
}

/**
 * Is there room for one more shared run today, on the site and for this
 * address? Read-only: the run is counted by countAgentRun once its workspace
 * exists.
 *
 * @param {{ now?: Date, address?: string }} [options]
 */
function checkAgentRunAllowance({ now = new Date(), address } = {}) {
  const site = agentCloudCaps().site;
  return withStateLock(() => {
    const state = loadState(now);
    if (address !== undefined && (state.addresses[addressKey(address, state.day)] || 0) >= site.addressRunsPerDay) {
      return failure("agent_cloud_address_runs", 429, now, `This address has started its ${site.addressRunsPerDay} shared runs for today. Try again tomorrow, or use your own API key.`);
    }
    if (state.runs >= site.dailyRuns) {
      return failure("agent_cloud_daily_runs", 429, now, "The site's agent allowance for runs is used up for today.");
    }
    if (state.reserved_tokens >= site.dailyTokens) {
      return failure("agent_cloud_daily_tokens", 429, now, "The site's agent allowance for tokens is used up for today.");
    }
    return { ok: true };
  }, STATE_FILE);
}

/** @param {{ now?: Date, address?: string }} [options] */
function countAgentRun({ now = new Date(), address } = {}) {
  withStateLock(() => {
    const state = loadState(now);
    state.runs += 1;
    if (address !== undefined) {
      const key = addressKey(address, state.day);
      state.addresses[key] = (state.addresses[key] || 0) + 1;
    }
    persistState(state, STATE_FILE);
  }, STATE_FILE);
}

function settleAgentCall({ reservationId = "", reservedTokens = 0, actualTokens = 0, now = new Date(), reason = "legacy" }) {
  const actual = Math.max(0, Math.floor(Number(actualTokens) || 0));
  return withStateLock(() => {
    const state = loadState(now);
    if (reservationId && state.settled_reservations[reservationId]) {
      return { ok: true, duplicate: true, delta: 0, reservedTokens: state.reserved_tokens, reason };
    }
    const held = reservationId ? state.reservations[reservationId] : null;
    if (reservationId && !held) {
      return { ok: true, duplicate: false, ignored: true, delta: 0, reservedTokens: state.reserved_tokens, reason: "reservation_missing_or_expired" };
    }
    const reserved = held ? held.reserved_tokens : Math.max(0, Math.floor(Number(reservedTokens) || 0));
    const delta = actual - reserved;
    state.reserved_tokens = Math.max(0, state.reserved_tokens + delta);
    if (reservationId) {
      delete state.reservations[reservationId];
      state.settled_reservations[reservationId] = now.getTime();
    }
    persistState(state, STATE_FILE);
    return { ok: true, duplicate: false, delta, reservedTokens: state.reserved_tokens, reason };
  }, STATE_FILE);
}

/**
 * Reserve one agent call (a model turn or a web tool call): refuse an input
 * over the agent cap, then reserve (estimated input + the call's max output)
 * x model weight against the day's token ceiling. Same reservation object as
 * chat's, so usage settles in the same weighted unit.
 *
 * @param {{ payload: any, modelWeight?: number, now?: Date }} options
 */
function reserveAgentCall({ payload, modelWeight = 1, now = new Date() }) {
  const caps = agentCloudCaps();
  const site = caps.site;
  const inputTokens = estimatedInputTokens(payload);
  if (inputTokens > site.maxInputTokens) {
    return failure("agent_cloud_input_too_large", 413, now,
      `An agent call accepts at most ${site.maxInputTokens} estimated input tokens.`);
  }
  const weight = Number.isFinite(Number(modelWeight)) && Number(modelWeight) >= 1 ? Number(modelWeight) : 1;
  const requested = Number(payload?.max_tokens);
  const outputTokens = Number.isFinite(requested) && requested > 0
    ? Math.min(caps.shared.maxCallOutputTokens, Math.floor(requested))
    : caps.shared.maxCallOutputTokens;
  const reservedTokens = Math.ceil((inputTokens + outputTokens) * weight);
  return withStateLock(() => {
    const state = loadState(now);
    if (state.reserved_tokens + reservedTokens > site.dailyTokens) {
      return failure("agent_cloud_daily_tokens", 429, now, "The site's agent allowance for tokens is used up for today.");
    }
    const reservationId = crypto.randomBytes(16).toString("hex");
    state.reserved_tokens += reservedTokens;
    state.reservations[reservationId] = { reserved_tokens: reservedTokens, created_at: now.getTime() };
    persistState(state, STATE_FILE);
    return createReservation({
      reservationId,
      inputTokens,
      outputTokens,
      reservedTokens,
      weight,
      remainingSessionRequests: 0,
      settleRequest: settleAgentCall,
    });
  }, STATE_FILE);
}

/**
 * Coarse site state for /api/agent-cloud/status: exact site counts stay
 * server-side, like the chat budget's summary.
 *
 * @param {{ now?: Date }} [options]
 */
function agentAllowanceSummary({ now = new Date() } = {}) {
  const site = agentCloudCaps().site;
  return withStateLock(() => {
    const state = loadState(now);
    const open = state.runs < site.dailyRuns && state.reserved_tokens < site.dailyTokens;
    return { siteOpen: open, resetsAt: utcResetAt(now), retryAfter: secondsUntilUtcReset(now) };
  }, STATE_FILE);
}

module.exports = {
  STATE_FILE,
  addressKey,
  agentAllowanceSummary,
  checkAgentRunAllowance,
  countAgentRun,
  reserveAgentCall,
  settleAgentCall,
  statePath,
};
