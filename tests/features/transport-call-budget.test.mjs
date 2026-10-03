import assert from "node:assert/strict";
import vm from "node:vm";
import { createFeatureTest, parseJsSource, read } from "../helpers/feature-test-harness.mjs";
const test = createFeatureTest("transport-call-budget");
function functions(source, names) {
  const nodes = parseJsSource(source).body.filter((node) => node.type === "FunctionDeclaration");
  return names.map((name) => { const node = nodes.find((item) => item.id.name === name); assert.ok(node, name); return source.slice(node.start, node.end); }).join("\n");
}
const noop = () => {};
const response = (content, status = 200, finish = "stop") => Response.json({ model: "served", choices: [{ message: { content }, finish_reason: finish }], usage: { total_tokens: 10 } }, { status });
const server = vm.createContext({
  console, URL, Response, AbortController,
  readJsonBody: async (req) => structuredClone(req.body), requestSignal: () => new AbortController().signal,
  withTimeoutSignal: (signal) => ({ signal, cleanup: noop }),
  send: (res, status, body) => { res.status = status; res.data = JSON.parse(body); },
  taskContractForPayload: () => ({ humanizer: "rewrite" }), applyChatTaskContract: (payload) => payload,
  isPublicDeployment: false, DEEPSEEK_BASE_URL_DEFAULT: "https://controlled.invalid",
  DEEPSEEK_CLOUD_MODELS: [], resolveCloudTarget: async () => ({ baseUrl: "https://controlled.invalid" }),
  resolveCloudCredential: async () => "fixture-only", normalizeCloudModelId: (model) => model,
  resolveTaskPolicy: () => ({ thinking: true, answerBudget: 100, reasoningAllowance: 0, effort: "low" }),
  isTrustedDeepSeekCredentialTarget: () => true, normalizeCloudVisionMessages: (messages) => ({ messages }),
  isAutoModelId: () => false, isDeepSeekCloudModelId: () => true,
  stripCloudLocalOnlyFields: noop, stripDeepseekV4LocalOnlyFields: noop,
  shouldStripDeepseekV4Sampling: () => false, cloudAuthHeaders: () => ({}), assertFinalChatPayloadBudget: noop,
  modelContentFromChatData: (data) => data?.choices?.[0]?.message?.content || "",
  findHumanizerOutputHits: (content) => content.includes("bad") ? ["bad"] : [],
  findHumanizerStyleDiagnostics: () => [], shouldLintHumanizerOutput: () => true,
  shouldRepairHumanizerOutput: () => true, isHumanizerRepairMetaResponse: () => false,
  isBudgetStarvedCompletion: (data) => !data.choices[0].message.content && data.choices[0].finish_reason === "length",
  usageTokenTotal: (usage) => Number.isFinite(usage?.total_tokens) ? usage.total_tokens : null,
  cloudRunUsageMetrics: (usage, known, unknown) => ({ ...usage, total_tokens: known, unknown }),
});
vm.runInContext(functions(read("apps/server/server/routes/chat.js"), ["createChatFollowupBudget", "repairHumanizerOutputIfNeeded"]), server);
vm.runInContext(functions(read("apps/server/server/routes/cloud-chat.js"), ["retryWithoutThinking", "repairCloudHumanizerOutputIfNeeded", "handleCloudChat"]), server);
async function cloudRun({ followups, repairs = 1, answers, failRepair = false }) {
  const wires = [];
  server.postJsonWithFallback = async (url, payload, signal, auth, options) => {
    wires.push(structuredClone(payload)); options.onRequest?.();
    const index = wires.length - 1;
    return { response: failRepair && index === 1 ? Response.json({ code: "quota_exceeded", error: "Quota exhausted" }, { status: 429 }) : answers[index] };
  };
  const body = { model: "fixture-model", messages: [{ role: "user", content: "Question" }], stream: false, max_tokens: 100, ai_system6_task_kind: "rewrite", ...(followups === undefined ? {} : { ai_system6_max_followup_calls: followups, ai_system6_max_repair_calls: repairs }) };
  const res = {};
  await server.handleCloudChat({ body }, res);
  assert.ok(wires.every((wire) => !Object.hasOwn(wire, "ai_system6_max_followup_calls") && !Object.hasOwn(wire, "ai_system6_max_repair_calls")));
  return { wires, res };
}
const thinking = await cloudRun({ followups: 1, answers: [response("", 200, "length"), response("bad fallback")] });
assert.equal(thinking.wires.length, 2);
assert.equal(thinking.res.status, 200);
assert.equal(thinking.res.data.ai_system6_metrics.provider_calls, 2);
assert.equal(thinking.res.data.ai_system6_metrics.thinking_fallback_attempts, 1);
assert.equal(thinking.res.data.ai_system6_humanizer.repair_attempts, 0);
assert.equal(thinking.wires[1].thinking.type, "disabled");
const empty = await cloudRun({ followups: 0, answers: [response("", 200, "length")] });
assert.equal(empty.wires.length, 1);
assert.equal(empty.res.data.code, "writing_call_budget_exhausted");
assert.equal(empty.res.data.ai_system6_metrics.provider_calls, 1);
const repair = await cloudRun({ followups: 4, repairs: 1, answers: [response("bad candidate"), response("bad revised candidate")] });
assert.equal(repair.wires.length, 2);
assert.equal(repair.res.data.ai_system6_metrics.repair_attempts, 1);
const stoppedRepair = await cloudRun({ followups: 4, repairs: 1, answers: [response("bad candidate")], failRepair: true });
assert.equal(stoppedRepair.wires.length, 2);
assert.equal(stoppedRepair.res.data.choices[0].message.content, "bad candidate");
assert.equal(stoppedRepair.res.data.ai_system6_metrics.call_stop.code, "quota_exceeded");
assert.equal(stoppedRepair.res.data.ai_system6_metrics.repair_attempts, 1);
const legacy = await cloudRun({ answers: [response("bad candidate"), response("bad revision"), response("Finished answer")] });
assert.equal(legacy.wires.length, 3);
assert.equal(legacy.res.data.ai_system6_metrics.repair_attempts, 2);

// The real local server autoload helper: load probes are excluded, and a
// missing followup allowance blocks its second inference post.
let localPosts = 0;
let loadProbes = 0;
server.stripLmStudioLoadFields = (payload) => payload;
server.lmStudioChatNeedsModelLoad = () => true;
server.loadLmStudioAuxModel = async (model) => { loadProbes += 1; return { model, raw: {} }; };
server.lmStudioAutoloadContext = () => 8192;
server.loadedModelContext = () => 8192;
server.loadedLmStudioModelInfo = null;
server.sameModelName = (a, b) => a === b;
server.postJsonWithFallback = async (url, payload, signal, auth, options) => { localPosts += 1; options.onRequest?.(); return { response: Response.json({ error: "No models loaded" }, { status: 400 }) }; };
vm.runInContext(functions(read("apps/server/server/lmstudio.js"), ["postLocalChatWithModelAutoload"]), server);
const localBudget = server.createChatFollowupBudget({ ai_system6_max_followup_calls: 0, ai_system6_max_repair_calls: 0 });
let first = true;
await assert.rejects(server.postLocalChatWithModelAutoload({
  chatUrl: "http://127.0.0.1:1234/v1/chat/completions", payload: { model: "fixture" }, provider: "lm-studio", model: "fixture",
  beforeRequest: () => { if (!first) localBudget.reserve("retry"); first = false; }, onRequest: () => localBudget.sent("model"),
}), { code: "writing_call_budget_exhausted" });
assert.equal(localPosts, 1);
assert.equal(loadProbes, 1);
assert.equal(localBudget.metrics().provider_calls, 1);

// A local repair that really went on the wire and failed still counts once.
server.tuneLmStudioChatPayload = (payload) => payload;
server.postLocalChatWithModelAutoload = async (options) => { options.beforeRequest?.(); options.onRequest?.(); return { response: Response.json({ error: "Quota exhausted" }, { status: 429 }) }; };
const localRepairBudget = server.createChatFollowupBudget({ ai_system6_max_followup_calls: 1, ai_system6_max_repair_calls: 1 });
const preserved = await server.repairHumanizerOutputIfNeeded({ data: await response("bad original").json(), payload: {}, taskKind: "rewrite", callBudget: localRepairBudget });
assert.equal(preserved.choices[0].message.content, "bad original");
assert.equal(preserved.ai_system6_humanizer.repair_attempts, 1);
assert.equal(localRepairBudget.metrics().repair_attempts, 1);

// The real browser client retries native endpoint discovery through its post
// gate. Exhaustion keeps the budget error, never reclassifies it as offline.
function browserClient(fetch) {
  const sandbox = vm.createContext({
    window: { location: { protocol: "https:", hostname: "fixture.invalid", href: "https://fixture.invalid/" } },
    document: { getElementById: (id) => ({ value: id === "endpoint" ? "http://127.0.0.1:1234" : id === "local-provider" ? "lm-studio" : "" }) },
    navigator: { userAgent: "Chrome", vendor: "Google", permissions: { query: async () => ({ state: "granted" }) } },
    console, fetch, URL, Headers, Response, ReadableStream, TextDecoder, TextEncoder, AbortController, AbortSignal, DOMException, setTimeout, clearTimeout,
  });
  vm.runInContext(read("app/core/local-lmstudio-client.js"), sandbox);
  return sandbox.window.AISystem6LocalLMStudio;
}
let nativePosts = 0;
const client = browserClient(async () => { nativePosts += 1; return Response.json({ error: "Endpoint absent" }, { status: 404 }); });
let reservations = 0;
await assert.rejects(client.chat({ model: "fixture", messages: [{ role: "user", content: "Question" }] }, {
  autoLoad: false,
  beforeRequest: () => { reservations += 1; if (reservations > 1) throw Object.assign(new Error("Bound reached"), { code: "writing_call_budget_exhausted" }); },
}), { code: "writing_call_budget_exhausted" });
assert.equal(nativePosts, 1);
assert.equal(reservations, 2);
let ratePosts = 0;
const busyClient = browserClient(async () => { ratePosts += 1; return Response.json({ error: "Reasoning quota exhausted" }, { status: 429 }); });
await assert.rejects(busyClient.chat({ model: "fixture", messages: [{ role: "user", content: "Question" }] }), { status: 429 });
assert.equal(ratePosts, 1);

// Browser billing-to-budget accounting books only reported extra provider
// dispatches; these counters do not claim a price or a token spend.
const app = vm.createContext({ window: {}, activeProjectId: "project-A", console });
vm.runInContext(read("app/shared/writing-agent-runtime.js"), app);
vm.runInContext(functions(read("app/core/chat-messages.js"), ["clioTaskSnapshot", "updateClioTaskInvocation", "modelMessageText", "chargeClioServerModelCalls"]), app);
const parent = { id: "parent", projectId: "project-A", callBudget: app.window.AISystem6WritingAgentRuntime.createWritingCallBudget(), runManifest: null, activeProvider: "cloud" };
app.window.AISystem6WritingAgentRuntime.reserveWritingModelCall(parent.callBudget);
app.chargeClioServerModelCalls({ choices: [{ message: { content: "Result" } }], ai_system6_metrics: { provider_calls: 3, repair_attempts: 1, thinking_fallback_attempts: 1 } }, parent);
assert.equal(parent.callBudget.requests, 3);
assert.equal(parent.callBudget.repairs, 1);
assert.equal(parent.runManifest.serverModelCalls.provider_calls, 3);
// The real browser cloud dispatch writes remaining parent allowances only
// after reserving its initial call, then refuses quota failover.
Object.assign(app, {
  cloudConfig: { active: true, model: "fixture", provider: "deepseek" },
  cloudCredentialReady: () => true, cloudPayloadCarriesImage: () => false,
  deepSeekCloudDefaults: () => ({}), isDeepSeekCloudModelName: () => false,
  sanitizeCloudChatPayload: (payload) => payload, cloudCredentialTransportFields: () => ({}),
  getChatCompletionsEndpoint: () => "https://controlled.invalid/api/chat",
  assertClioTaskInvocationActive: noop, clioCloudRouteActive: () => true,
  clioBackupRecoverable: () => true, clioBackupAvailable: () => true,
  serviceErrorDetail: (status, text) => text, classifyLmStudioError: () => "",
  clioPayloadCarriesFileToken: (messages) => messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === "file")),
  clioInlineFallbackPayload: (payload) => ({ ...payload, messages: payload.messages.map((message) => ({ ...message, content: Array.isArray(message.content) ? message.content.map((part) => part.type === "file" ? { type: "image_url", image_url: { url: "data:image/png;base64,fixture" } } : part) : message.content })) }),
  invalidateClioImageFileTokens: noop,
});
vm.runInContext(functions(read("app/core/chat-messages.js"), ["fetchModelPayload", "throwModelResponseError", "retryCloudFilePayloadInline", "requestModelResponse"]), app);
let cloudDispatches = 0;
let sentParentLimits;
app.fetch = async (url, options) => {
  cloudDispatches += 1;
  sentParentLimits = JSON.parse(options.body);
  return Response.json({ error: "Busy" }, { status: 429 });
};
const cloudParent = { id: "cloud-parent", projectId: "project-A", runManifest: null, callBudget: app.window.AISystem6WritingAgentRuntime.createWritingCallBudget({ maxRequests: 2 }) };
await assert.rejects(app.requestModelResponse({ model: "fixture", messages: [{ role: "user", content: "Question" }] }, null, { invocation: cloudParent }), { status: 429 });
assert.equal(cloudDispatches, 1);
assert.equal(sentParentLimits.ai_system6_max_followup_calls, 1);
assert.equal(sentParentLimits.ai_system6_max_repair_calls, 1);
assert.equal(cloudParent.callBudget.stopped, true);
// An expired attachment can retry inline, but consumes this invocation's same
// allowance and cannot dispatch after its project is no longer active.
const filePayload = { model: "fixture", messages: [{ role: "user", content: [{ type: "file", file_id: "expired" }] }] };
const fileParent = { id: "file-parent", projectId: "project-A", callBudget: app.window.AISystem6WritingAgentRuntime.createWritingCallBudget({ maxRequests: 2 }) };
cloudDispatches = 0;
app.fetch = async (_url, options) => {
  cloudDispatches += 1;
  const body = JSON.parse(options.body);
  if (cloudDispatches === 1) return Response.json({ code: "cloud_file_expired" }, { status: 400 });
  assert.equal(body.messages[0].content[0].type, "image_url");
  assert.equal(body.ai_system6_max_followup_calls, 0);
  return response("Attached image result");
};
assert.equal((await app.requestModelResponse(filePayload, null, { invocation: fileParent })).response.ok, true);
assert.equal(cloudDispatches, 2);
assert.equal(fileParent.callBudget.requests, 2);
const oneCall = { id: "file-one", projectId: "project-A", callBudget: app.window.AISystem6WritingAgentRuntime.createWritingCallBudget({ maxRequests: 1 }) };
cloudDispatches = 0;
await assert.rejects(app.requestModelResponse(filePayload, null, { invocation: oneCall }), { code: "writing_call_budget_exhausted" });
assert.equal(cloudDispatches, 1);
app.assertClioTaskInvocationActive = (invocation) => { if (invocation.projectId !== app.activeProjectId) throw new Error("invocation-stale"); };
app.activeProjectId = "project-B";
await assert.rejects(app.retryCloudFilePayloadInline(Response.json({ code: "cloud_file_expired" }, { status: 400 }), filePayload, null, { invocation: fileParent }), /invocation-stale/);
assert.equal(cloudDispatches, 1);
test.assert(true, "actual browser/server dispatch gates enforce parent bounds, preserve quota-stopped candidates, and keep standalone APIs compatible");
test.finish();
