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
  return {
    day,
    reserved_tokens: Math.max(0, Math.floor(Number(value.reserved_tokens) || 0)),
    requests: Math.max(0, Math.floor(Number(value.requests) || 0)),
    sessions,
  };
}

function loadState(now = new Date()) {
  const filePath = statePath();
  const day = utcDay(now);
  if (cachedStatePath === filePath && cachedState?.day === day) return cachedState;
  let value = null;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {}
  cachedStatePath = filePath;
  cachedState = normalizedState(value, day);
  return cachedState;
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

function reserveSharedCloudRequest({ sessionNonce, payload, now = new Date() }) {
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
  const requestedOutput = Number(payload?.max_tokens);
  const outputTokens = Number.isFinite(requestedOutput)
    ? Math.min(config.maxOutputTokens, Math.max(1, Math.floor(requestedOutput)))
    : config.maxOutputTokens;
  const reservedTokens = inputTokens + outputTokens;
  const state = loadState(now);
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

  state.requests += 1;
  state.reserved_tokens += reservedTokens;
  state.sessions[sessionId] = sessionRequests + 1;
  persistState(state);
  return {
    ok: true,
    inputTokens,
    outputTokens,
    reservedTokens,
    remainingSessionRequests: config.sessionRequestLimit - state.sessions[sessionId],
  };
}

function resetSharedCloudBudgetCacheForTests() {
  cachedStatePath = "";
  cachedState = null;
}

module.exports = {
  estimatedInputTokens,
  pseudonymousCloudUserId,
  reserveSharedCloudRequest,
  resetSharedCloudBudgetCacheForTests,
  sharedCloudBudgetConfig,
  sharedCloudConfigured,
};
