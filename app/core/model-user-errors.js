// Unified model failure → user-facing recovery mapping.
//
// Raw HTTP codes, fetch failures and stack traces belong in the console and
// System Status detail, never in ordinary UI. Every user-visible model error
// is a pair: what happened, then what to do next, and the recovery action must
// actually execute (a shared notification action, not a text-only hint).

const modelRecoveryKinds = Object.freeze({
  invalidCredentials: Object.freeze({
    messageKey: "ai_error_invalid_credentials",
    actionKey: "ai_action_reconnect",
    actionId: "open-ai-connection-settings",
    diagnosticCode: "invalid-credentials",
  }),
  modelUnavailable: Object.freeze({
    messageKey: "ai_error_model_unavailable",
    actionKey: "ai_action_choose_model",
    actionId: "open-ai-connection-settings",
    diagnosticCode: "model-unavailable",
  }),
  busy: Object.freeze({
    messageKey: "ai_error_busy",
    actionKey: "ai_action_retry",
    actionId: "retry-current-ai-action",
    diagnosticCode: "service-busy",
  }),
  connectionFailed: Object.freeze({
    messageKey: "ai_error_connection_failed",
    actionKey: "ai_action_check_local",
    actionId: "open-ai-connection-settings",
    diagnosticCode: "connection-failed",
  }),
  timeout: Object.freeze({
    messageKey: "ai_error_timeout",
    actionKey: "ai_action_retry",
    actionId: "retry-current-ai-action",
    diagnosticCode: "timeout",
  }),
  unknown: Object.freeze({
    messageKey: "ai_error_unknown",
    actionKey: "ai_action_view_connection",
    actionId: "open-ai-connection-settings",
    diagnosticCode: "unknown",
  }),
});

function classifyModelFailure(error, context = {}) {
  const status = Number(
    context.status ?? error?.status ?? error?.statusCode ?? error?.response?.status ?? 0
  );
  const code = String(error?.code || error?.cause?.code || error?.cause?.cause?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  const detail = String(error?.cause?.message || "").toLowerCase();
  const combined = `${message} ${detail}`;

  if (status === 401 || status === 403) return "invalidCredentials";
  if (status === 404 || /unknown model|no such model|model ["']?[\w.-]+["']? not found/.test(combined)) {
    return "modelUnavailable";
  }
  if (status === 429 || /rate.?limit|too many requests|quota exceeded/.test(combined)) return "busy";
  if (
    code === "ECONNREFUSED"
    || code === "ECONNRESET"
    || code === "ENOTFOUND"
    || code === "ENETUNREACH"
    || /fetch failed|failed to fetch|networkerror|network error|offline|no internet|econnrefused|econnreset|enotfound/.test(combined)
  ) {
    return "connectionFailed";
  }
  if (code === "ETIMEDOUT" || /timeout|timed out|aborted|did not respond/.test(combined) || context.timeout === true) {
    return "timeout";
  }
  return "unknown";
}

function modelConnectionFailure(error, context = {}) {
  const kind = classifyModelFailure(error, context);
  const recovery = modelRecoveryKinds[kind];
  if (kind !== "connectionFailed") return recovery;
  // Local services (LM Studio / Ollama) share the connection message but need
  // the local startup hint instead of the cloud network hint.
  return context.kind === "local"
    ? recovery
    : { ...recovery, actionKey: "ai_action_check_connection" };
}

function pushModelRecoveryNotification(error, context = {}) {
  const recovery = modelConnectionFailure(error, context);
  if (!recovery || typeof t !== "function") return "";
  const text = `${t(recovery.messageKey)} ${t(recovery.actionKey)}`;
  if (typeof pushSystemNotification !== "function") return "";
  return pushSystemNotification(text, {
    actionId: recovery.actionId,
    actionLabel: t(recovery.actionKey),
    state: "error",
  });
}

window.AISystem6ModelUserErrors = Object.freeze({
  kinds: modelRecoveryKinds,
  classify: classifyModelFailure,
  failure: modelConnectionFailure,
  notify: pushModelRecoveryNotification,
});
