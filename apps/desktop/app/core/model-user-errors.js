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
    actionId: "open-cloud-ai-settings",
    diagnosticCode: "invalid-credentials",
  }),
  modelUnavailable: Object.freeze({
    messageKey: "ai_error_model_unavailable",
    actionKey: "ai_action_choose_model",
    actionId: "open-cloud-ai-settings",
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
    actionId: "open-local-ai-settings",
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
    actionId: "open-cloud-ai-settings",
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
  if (!recovery) return recovery;
  if (kind === "busy" || kind === "timeout") return recovery;
  // Settings recovery routes by the failing route: local model failures open
  // Local AI settings, cloud / Website AI failures open Cloud settings.
  const routed = {
    ...recovery,
    actionId: context.kind === "local" ? "open-local-ai-settings" : "open-cloud-ai-settings",
  };
  if (kind === "connectionFailed") {
    routed.actionKey = context.kind === "local" ? "ai_action_check_local" : "ai_action_check_connection";
  }
  return routed;
}

// Owner-aware retry registry: the global retry action re-runs the actual
// failing AI action (Draft Desk request, adjustment apply, ClioTalk submit),
// never a fixed window. Registration carries the owner project / conversation
// so a stale context can never re-run an old prompt in a new project.
let lastRetryableAiAction = null;
let retryInFlight = false;

function registerRetryableAiAction({ owner = "", projectId = "", conversationId = "", callback } = {}) {
  lastRetryableAiAction = { owner, projectId, conversationId, callback };
}

function clearRetryableAiAction(owner = "") {
  if (!owner || lastRetryableAiAction?.owner === owner) lastRetryableAiAction = null;
}

function retryContextIsStillValid(action) {
  const activeProject = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (action.projectId && action.projectId !== activeProject?.id) return false;
  if (action.conversationId && typeof activeConversationFile !== "undefined" && activeConversationFile?.id !== action.conversationId) {
    return false;
  }
  return true;
}

async function runRetryableAiAction() {
  if (retryInFlight) return false;
  const action = lastRetryableAiAction;
  if (!action || typeof action.callback !== "function") return false;
  if (!retryContextIsStillValid(action)) {
    if (typeof setStatus === "function") setStatus(t("retry_context_stale"));
    return false;
  }
  retryInFlight = true;
  try {
    const result = await action.callback();
    if (result !== false) clearRetryableAiAction(action.owner);
    return result !== false;
  } catch (error) {
    // A rejected callback must never surface as an unhandled rejection; the
    // failure presenter re-registers the recovery path.
    console.warn("Retryable AI action failed.", error);
    return false;
  } finally {
    retryInFlight = false;
  }
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
  registerRetryable: registerRetryableAiAction,
  clearRetryable: clearRetryableAiAction,
  runRetryable: runRetryableAiAction,
});
