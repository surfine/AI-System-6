// Model failures map to a localized message + actionable next step. Raw HTTP
// codes and fetch internals never reach ordinary UI.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("model-recovery");
const mapperSource = read("app/core/model-user-errors.js");
const cloudModel = read("app/features/cloud-model.js");
const chatMessages = read("app/core/chat-messages.js");
const actions = read("app/core/actions.js");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");

function createMapperVm() {
  const notifications = [];
  const context = vm.createContext({
    console,
    t: (key) => key,
    pushSystemNotification: (text, options) => {
      notifications.push({ text, ...options });
      return "notification-1";
    },
    window: {},
  });
  vm.runInContext(mapperSource, context);
  return {
    context,
    notifications,
    mapper: context.window.AISystem6ModelUserErrors,
  };
}

function createRetryVm() {
  const context = vm.createContext({
    console,
    t: (key) => key,
    setStatus: (message) => { context.__status = message; },
    getActiveProject: () => context.projects.find((project) => project.id === context.__activeProjectId) || null,
    projects: [],
    __activeProjectId: "",
    activeConversationFile: null,
    window: {},
  });
  vm.runInContext(mapperSource, context);
  return {
    context,
    mapper: context.window.AISystem6ModelUserErrors,
  };
}

{
  const runtime = createMapperVm();
  const cases = [
    [{ status: 401 }, "invalidCredentials", "invalid-credentials"],
    [{ status: 403 }, "invalidCredentials", "invalid-credentials"],
    [{ status: 404 }, "modelUnavailable", "model-unavailable"],
    [{ message: "model \"qwen\" not found" }, "modelUnavailable", "model-unavailable"],
    [{ status: 429 }, "busy", "service-busy"],
    [{ code: "ECONNREFUSED" }, "connectionFailed", "connection-failed"],
    [{ message: "fetch failed", cause: { message: "connection refused" } }, "connectionFailed", "connection-failed"],
    [{ code: "ETIMEDOUT" }, "timeout", "timeout"],
    [{ message: "the request timed out" }, "timeout", "timeout"],
    [{ status: 500 }, "unknown", "unknown"],
  ];
  for (const [input, expectedKind, expectedCode] of cases) {
    const failure = runtime.mapper.failure(input, {});
    test.assert(
      failure.messageKey === runtime.mapper.kinds[expectedKind].messageKey,
      `${expectedKind} maps HTTP ${input.status || input.code || input.message || "?"} to a user message`
    );
    test.assert(failure.diagnosticCode === expectedCode, `${expectedKind} carries a stable diagnostic code`);
    test.assert(failure.actionId.length > 0, `${expectedKind} carries an executable recovery action`);
  }

  const local = runtime.mapper.failure({ code: "ECONNREFUSED" }, { kind: "local" });
  test.assert(local.actionKey === "ai_action_check_local", "local connection failures hint at LM Studio / Ollama");
  test.assert(local.actionId === "open-local-ai-settings", "local connection failures open Local AI settings");
  const cloud = runtime.mapper.failure({ code: "ECONNREFUSED" }, { kind: "cloud" });
  test.assert(cloud.actionKey === "ai_action_check_connection", "cloud failures hint at network/connection settings");
  test.assert(cloud.actionId === "open-cloud-ai-settings", "cloud failures open Cloud AI settings");
  const localCreds = runtime.mapper.failure({ status: 401 }, { kind: "local" });
  test.assert(localCreds.actionId === "open-local-ai-settings", "local credential failures open Local AI settings");
  const cloudCreds = runtime.mapper.failure({ status: 401 }, { kind: "cloud" });
  test.assert(cloudCreds.actionId === "open-cloud-ai-settings", "cloud credential failures open Cloud AI settings");
  const busy = runtime.mapper.failure({ status: 429 }, { kind: "cloud" });
  test.assert(busy.actionId === "retry-current-ai-action", "busy/timeout failures retry instead of opening settings");
}

// The recovery notification carries a real executable action, not text only.
{
  const runtime = createMapperVm();
  const id = runtime.mapper.notify(new Error("HTTP 401"), { kind: "cloud" });
  test.assert(id === "notification-1", "the recovery notification is pushed");
  test.assert(runtime.notifications.length === 1, "exactly one recovery notification");
  test.assert(runtime.notifications[0].actionId === "open-cloud-ai-settings", "invalid cloud credentials open Cloud settings");
  test.assert(runtime.notifications[0].state === "error", "the recovery notification carries an error state");
}

// Owner-aware retry: the global action re-runs the registered owner only, and
// a stale project or conversation blocks it.
{
  const runtime = createRetryVm();
  let ran = 0;
  runtime.context.projects.push({ id: "project-a", name: "A" }, { id: "project-b", name: "B" });
  runtime.context.__activeProjectId = "project-a";
  runtime.mapper.registerRetryable({
    owner: "quickDraft",
    projectId: "project-a",
    callback: () => { ran += 1; },
  });
  test.assert(runtime.mapper.runRetryable() === true, "retry runs the registered owner in the same project");
  test.assert(ran === 1, "the retry callback executed");

  runtime.context.__activeProjectId = "project-b";
  test.assert(runtime.mapper.runRetryable() === false, "retry refuses to run in a different project");
  test.assert(ran === 1, "the stale-context retry never executed the callback");
  test.assert(runtime.context.__status === "retry_context_stale", "a stale retry explains itself");

  runtime.mapper.clearRetryable("quickDraft");
  runtime.context.__activeProjectId = "project-a";
  test.assert(runtime.mapper.runRetryable() === false, "a cleared owner cannot retry");
}

// Static contracts: ordinary UI paths route through the mapper and the two
// recovery actions exist.
test.assertIncludes(cloudModel, "AISystem6ModelUserErrors?.failure", "the cloud status path maps failures");
test.assertIncludes(cloudModel, "AISystem6ModelUserErrors?.notify", "the cloud status path pushes an actionable recovery");
test.assertIncludes(chatMessages, "AISystem6ModelUserErrors?.failure", "the chat path maps failures");
test.assertIncludes(chatMessages, "modelRecovery.messageKey", "chat copy renders the mapped message, never the raw error");
test.assertIncludes(
  chatMessages,
  "error.message",
  "the raw error still reaches the run record for Advanced diagnostics"
);
test.assertIncludes(actions, '"open-local-ai-settings"', "local recovery opens Local AI settings");
test.assertIncludes(actions, '"open-cloud-ai-settings"', "cloud recovery opens Cloud AI settings");
test.assertIncludes(actions, '"retry-current-ai-action"', "retry re-runs the last failed AI action");
test.assertIncludes(
  actions,
  "AISystem6ModelUserErrors?.runRetryable",
  "the global retry action goes through the owner-aware registry"
);
for (const key of [
  "ai_error_invalid_credentials",
  "ai_error_model_unavailable",
  "ai_error_busy",
  "ai_error_connection_failed",
  "ai_error_timeout",
  "ai_error_unknown",
  "ai_action_reconnect",
  "ai_action_choose_model",
  "ai_action_retry",
  "ai_action_check_local",
  "ai_action_check_connection",
  "ai_action_view_connection",
]) {
  test.assertIncludes(translationsEn, `${key}:`, `English translation carries ${key}`);
  test.assertIncludes(translationsZh, `${key}:`, `Chinese translation carries ${key}`);
}

test.finish();
