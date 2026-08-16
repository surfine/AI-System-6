"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DAILY_TOKEN_BUDGET = 250000;
const DEFAULT_DAILY_REQUEST_LIMIT = 100;
const DEFAULT_SESSION_REQUEST_LIMIT = 12;
const DEFAULT_MAX_INPUT_TOKENS = 32000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1800;

let cachedStatePath = "";
let cachedState = null;
const lockSleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function positiveInteger(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function sharedCloudBudgetConfig() {
  return {
    dailyTokenBudget: positiveInteger(
      "AI_SYSTEM6_SHARED_CLOUD_DAILY_TOKEN_BUDGET",
      DEFAULT_DAILY_TOKEN_BUDGET
    ),
    dailyRequestLimit: positiveInteger(
      "AI_SYSTEM6_SHARED_CLOUD_DAILY_REQUEST_LIMIT",
      DEFAULT_DAILY_REQUEST_LIMIT
    ),
    sessionRequestLimit: positiveInteger(
      "AI_SYSTEM6_SHARED_CLOUD_SESSION_REQUEST_LIMIT",
      DEFAULT_SESSION_REQUEST_LIMIT
    ),
    maxInputTokens: positiveInteger(
      "AI_SYSTEM6_SHARED_CLOUD_MAX_INPUT_TOKENS",
      DEFAULT_MAX_INPUT_TOKENS
    ),
    maxOutputTokens: positiveInteger(
      "AI_SYSTEM6_SHARED_CLOUD_MAX_OUTPUT_TOKENS",
      DEFAULT_MAX_OUTPUT_TOKENS
    ),
  };
}

function sharedCloudConfigured() {
  return !!String(process.env.DEEPSEEK_API_KEY || "").trim();
}

function statePath() {
  const stateDirectory = String(
    process.env.AI_SYSTEM6_STATE_DIR || "/var/lib/ai-system6"
  ).trim();
  return path.join(stateDirectory, "shared-cloud-budget.json");
}

function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function emptyState(day) {
  return {
    day,
    reserved_tokens: 0,
    requests: 0,
    sessions: {},
    reservations: {},
    settled_reservations: {},
  };
}

function normalizedState(value, day) {
  if (!value || value.day !== day) return emptyState(day);
  const sessions = value.sessions && typeof value.sessions === "object"
    ? Object.fromEntries(
        Object.entries(value.sessions)
          .filter(([key, count]) => /^[a-f0-9]{24}$/.test(key) && Number.isFinite(Number(count)))
          .map(([key, count]) => [key, Math.max(0, Math.floor(Number(count)))])
      )
    : {};
  const reservations = value.reservations && typeof value.reservations === "object"
    ? Object.fromEntries(
        Object.entries(value.reservations)
          .filter(([key, reservation]) => /^[a-f0-9]{32}$/.test(key) && reservation && typeof reservation === "object")
          .map(([key, reservation]) => [key, {
            reserved_tokens: Math.max(0, Math.floor(Number(reservation.reserved_tokens) || 0)),
            created_at: Math.max(0, Math.floor(Number(reservation.created_at) || 0)),
          }])
      )
    : {};
  const settledReservations = value.settled_reservations && typeof value.settled_reservations === "object"
    ? Object.fromEntries(
        Object.entries(value.settled_reservations)
          .filter(([key, timestamp]) => /^[a-f0-9]{32}$/.test(key) && Number.isFinite(Number(timestamp)))
          .map(([key, timestamp]) => [key, Math.max(0, Math.floor(Number(timestamp)))])
      )
    : {};
  return {
    day,
    reserved_tokens: Math.max(0, Math.floor(Number(value.reserved_tokens) || 0)),
    requests: Math.max(0, Math.floor(Number(value.requests) || 0)),
    sessions,
    reservations,
    settled_reservations: settledReservations,
  };
}

function loadState(now = new Date(), { fresh = false } = {}) {
  const filePath = statePath();
  const day = utcDay(now);
  if (!fresh && cachedStatePath === filePath && cachedState?.day === day) return cachedState;
  let value = null;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {}
  cachedStatePath = filePath;
  cachedState = normalizedState(value, day);
  return cachedState;
}

function withStateLock(callback) {
  const filePath = statePath();
  const lockPath = `${filePath}.lock`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (ageMs > 30000) fs.rmdirSync(lockPath);
      } catch (lockError) {
        if (lockError?.code !== "ENOENT" && lockError?.code !== "ENOTEMPTY") throw lockError;
      }
      if (Date.now() >= deadline) {
        const lockTimeout = /** @type {Error & { code?: string }} */ (
          new Error("Shared cloud budget lock timed out.")
        );
        lockTimeout.code = "shared_cloud_budget_lock_timeout";
        throw lockTimeout;
      }
      Atomics.wait(lockSleepBuffer, 0, 0, 10);
    }
  }
  try {
    return callback();
  } finally {
    try { fs.rmdirSync(lockPath); } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "shared_cloud_budget_lock_release_failed",
        code: String(error?.code || "unknown"),
      }));
    }
  }
}

function persistState(state) {
  const filePath = statePath();
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(state)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(temporary, filePath);
    try { fs.chmodSync(filePath, 0o600); } catch {}
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
  }
}

function sessionBudgetId(sessionNonce) {
  return crypto.createHash("sha256")
    .update(String(sessionNonce || ""))
    .digest("hex")
    .slice(0, 24);
}

function pseudonymousCloudUserId(sessionNonce) {
  const digest = crypto.createHash("sha256")
    .update(`ai-system6-cloud\n${String(sessionNonce || "")}`)
    .digest("hex")
    .slice(0, 32);
  return `s6-${digest}`;
}

function estimatedInputTokens(payload) {
  const serialized = JSON.stringify(payload || {});
  return Math.max(1, Math.ceil(Buffer.byteLength(serialized, "utf8") / 3));
}

function secondsUntilUtcReset(now = new Date()) {
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((reset.getTime() - now.getTime()) / 1000));
}

function quotaFailure(code, retryAfter, detail) {
  return {
    ok: false,
    code,
    retryAfter,
    detail,
  };
}

/**
 * Reserve one shared-allowance request.
 *
 * `reasoningAllowance` is the thinking headroom the caller added on top of the
 * answer budget: DeepSeek counts reasoning inside `max_tokens`, so the daily
 * limit on answer length must not swallow it. `modelWeight` prices a request
 * against the allowance — v4-pro costs three times v4-flash, so one pro
 * request must consume three times the budget of a flash one.
 *
 * @param {{
 *   sessionNonce: string,
 *   payload: any,
 *   now?: Date,
 *   reasoningAllowance?: number,
 *   modelWeight?: number,
 * }} options
 */
function reserveSharedCloudRequest({
  sessionNonce,
  payload,
  now = new Date(),
  reasoningAllowance = 0,
  modelWeight = 1,
}) {
  const config = sharedCloudBudgetConfig();
  const sessionId = sessionBudgetId(sessionNonce);
  const retryAfter = secondsUntilUtcReset(now);
  if (!sessionId || !String(sessionNonce || "")) {
    return quotaFailure("shared_cloud_session_required", retryAfter, "A verified session is required.");
  }

  const inputTokens = estimatedInputTokens(payload);
  if (inputTokens > config.maxInputTokens) {
    return quotaFailure(
      "shared_cloud_input_too_large",
      0,
      `Shared access accepts at most ${config.maxInputTokens} estimated input tokens.`
    );
  }
  const allowance = Math.max(0, Math.floor(Number(reasoningAllowance) || 0));
  const weight = Number.isFinite(Number(modelWeight)) && Number(modelWeight) >= 1
    ? Number(modelWeight)
    : 1;
  const requestedOutput = Number(payload?.max_tokens);
  const answerTokens = Number.isFinite(requestedOutput)
    ? Math.min(config.maxOutputTokens, Math.max(1, Math.floor(requestedOutput) - allowance))
    : config.maxOutputTokens;
  const outputTokens = answerTokens + allowance;
  const reservedTokens = Math.ceil((inputTokens + outputTokens) * weight);
  return withStateLock(() => {
    const state = loadState(now, { fresh: true });
    const sessionRequests = Number(state.sessions[sessionId] || 0);

    if (sessionRequests >= config.sessionRequestLimit) {
      return quotaFailure(
        "shared_cloud_session_limit",
        retryAfter,
        "This browsing session has used its shared cloud allowance for today."
      );
    }
    if (state.requests >= config.dailyRequestLimit) {
      return quotaFailure(
        "shared_cloud_daily_request_limit",
        retryAfter,
        "The site's shared cloud allowance has been used for today."
      );
    }
    if (state.reserved_tokens + reservedTokens > config.dailyTokenBudget) {
      return quotaFailure(
        "shared_cloud_daily_token_limit",
        retryAfter,
        "The site's shared cloud allowance has been used for today."
      );
    }

    const reservationId = crypto.randomBytes(16).toString("hex");
    state.requests += 1;
    state.reserved_tokens += reservedTokens;
    state.sessions[sessionId] = sessionRequests + 1;
    state.reservations[reservationId] = {
      reserved_tokens: reservedTokens,
      created_at: now.getTime(),
    };
    persistState(state);
    return createReservation({
      reservationId,
      inputTokens,
      outputTokens,
      reservedTokens,
      weight,
      remainingSessionRequests: config.sessionRequestLimit - state.sessions[sessionId],
    });
  });
}

function usageTokenTotal(usage) {
  if (usage === null || usage === undefined) return null;
  if (Number.isFinite(Number(usage))) return Math.max(0, Math.floor(Number(usage)));
  const total = usage?.total_tokens ?? usage?.totalTokens;
  return Number.isFinite(Number(total)) ? Math.max(0, Math.floor(Number(total))) : null;
}

function createReservation({ reservationId, inputTokens, outputTokens, reservedTokens, remainingSessionRequests, weight = 1 }) {
  let actualTokens = 0;
  let usageKnown = false;
  let requestSent = false;
  let settled = false;
  return {
    ok: true,
    reservationId,
    inputTokens,
    outputTokens,
    reservedTokens,
    remainingSessionRequests,
    addUsage(usage) {
      const tokens = usageTokenTotal(usage);
      if (tokens === null) return false;
      usageKnown = true;
      // Settlement stays in the same weighted unit as the reservation, so a
      // v4-pro request keeps costing the allowance three flash-equivalents.
      actualTokens += Math.ceil(tokens * weight);
      return true;
    },
    markUpstreamStarted() {
      requestSent = true;
    },
    settle(options = {}) {
      if (settled) return { ok: true, duplicate: true, actualTokens };
      settled = true;
      if (options.requestSent === true) requestSent = true;
      if (options.requestSent === false) requestSent = false;
      if (options.usage !== undefined) this.addUsage(options.usage);
      const settledTokens = usageKnown ? actualTokens : (requestSent ? reservedTokens : 0);
      const reason = usageKnown
        ? "reported_usage"
        : requestSent
          ? "usage_unknown_reservation_retained"
          : "upstream_not_sent";
      try {
        return settleSharedCloudRequest({
          reservationId,
          reservedTokens,
          actualTokens: settledTokens,
          reason,
        });
      } catch (error) {
        console.error(JSON.stringify({
          level: "error",
          event: "shared_cloud_settlement_failed",
          reservation_id: reservationId,
          reason,
          code: String(error?.code || "unknown"),
        }));
        return { ok: false, duplicate: false, reason, actualTokens: settledTokens };
      }
    },
  };
}

/**
 * Reconcile one reserved request against its actual token usage. The daily
 * counter keeps the *reserved* amount so callers can estimate before the
 * model runs; this function moves it toward the real total afterwards, so an
 * over-estimated output reservation is credited back and a web-search input
 * that grew server-side is charged. Only the global daily counter is touched;
 * session and request limits were already committed by the reservation.
 *
 * @param {{
 *   reservedTokens?: number,
 *   actualTokens?: number,
 *   now?: Date,
 *   reservationId?: string,
 *   reason?: string,
 * }} options
 * @returns {{ ok: boolean, delta: number, reservedTokens: number }}
 */
function settleSharedCloudRequest({ reservationId = "", reservedTokens = 0, actualTokens = 0, now = new Date(), reason = "legacy" }) {
  const actual = Math.max(0, Math.floor(Number(actualTokens) || 0));
  return withStateLock(() => {
    const state = loadState(now, { fresh: true });
    if (reservationId && state.settled_reservations[reservationId]) {
      return { ok: true, duplicate: true, delta: 0, reservedTokens: state.reserved_tokens, reason };
    }
    const persistedReservation = reservationId ? state.reservations[reservationId] : null;
    if (reservationId && !persistedReservation) {
      return {
        ok: true,
        duplicate: false,
        ignored: true,
        delta: 0,
        reservedTokens: state.reserved_tokens,
        reason: "reservation_missing_or_expired",
      };
    }
    const reserved = persistedReservation
      ? persistedReservation.reserved_tokens
      : Math.max(0, Math.floor(Number(reservedTokens) || 0));
    const delta = actual - reserved;
    state.reserved_tokens = Math.max(0, state.reserved_tokens + delta);
    if (reservationId) {
      delete state.reservations[reservationId];
      state.settled_reservations[reservationId] = now.getTime();
    }
    persistState(state);
    return { ok: true, duplicate: false, delta, reservedTokens: state.reserved_tokens, reason };
  });
}

function resetSharedCloudBudgetCacheForTests() {
  cachedStatePath = "";
  cachedState = null;
}

module.exports = {
  estimatedInputTokens,
  usageTokenTotal,
  pseudonymousCloudUserId,
  reserveSharedCloudRequest,
  settleSharedCloudRequest,
  resetSharedCloudBudgetCacheForTests,
  sharedCloudBudgetConfig,
  sharedCloudConfigured,
};
