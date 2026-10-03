import assert from "node:assert/strict";
import vm from "node:vm";
import { createFeatureTest, parseJsSource, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-call-budget");
const context = vm.createContext({ window: {}, console, setTimeout, clearTimeout, AbortController });
vm.runInContext(read("app/shared/writing-agent-runtime.js"), context);
const runtime = context.window.AISystem6WritingAgentRuntime;
const registry = runtime.createToolRegistry();
let toolsRun = 0;
registry.register({
  name: "readEvidence", effect: "read", scope: ["project"],
  inputSchema: { type: "object", properties: { round: { type: "integer" } }, additionalProperties: false },
  async run() { toolsRun += 1; return { data: "Evidence", provenance: [], truncated: false }; },
});
const toolContext = { projectId: "project-A", allowedEffects: ["read", "proposal"] };
const asPlain = (value) => JSON.parse(JSON.stringify(value));

// The same allowance covers every provider dispatch and a repair. Reserving
// only a round would hide the provider requests the repair or retry makes.
const allowance = runtime.createWritingCallBudget();
runtime.reserveWritingModelCall(allowance, { kind: "model", provider: "local" });
runtime.reserveWritingModelCall(allowance, { kind: "repair", provider: "local" });
runtime.reserveWritingModelCall(allowance, { kind: "retry", provider: "local" });
const earlier = runtime.snapshotWritingCallBudget(allowance);
assert.equal(earlier.requests, 3);
assert.equal(earlier.remainingRequests, 2);
assert.equal(earlier.remainingRepairs, 0);
assert.ok(Object.isFrozen(earlier));
assert.throws(() => runtime.reserveWritingModelCall(allowance, { kind: "repair" }), { code: "writing_call_budget_exhausted" });
assert.equal(allowance.requests, 3);
assert.equal(allowance.stopReason, "repair-budget");
assert.equal(earlier.stopped, false);

// A caller with no remaining allowance must never dispatch even its first request.
const emptyBudget = runtime.createWritingCallBudget({ maxRequests: 0, maxRepairs: 0 });
assert.throws(() => runtime.reserveWritingModelCall(emptyBudget), { code: "writing_call_budget_exhausted" });
assert.equal(emptyBudget.requests, 0);

// Existing three tool rounds and their final synthesis remain the same when
// budget is available. Dispatch reservations happen in the transport callback.
const normalBudget = runtime.createWritingCallBudget();
const normalSteps = [];
const normal = await registry.runToolLoop({
  callBudget: normalBudget, context: toolContext,
  async next({ round, toolsDisabled }) {
    runtime.reserveWritingModelCall(normalBudget);
    normalSteps.push({ round, toolsDisabled });
    return toolsDisabled ? { done: true, output: "Final evidence-based answer" }
      : { output: `Read round ${round}`, calls: [{ name: "readEvidence", input: { round }, id: `call-${round}` }] };
  },
});
assert.equal(normal.output, "Final evidence-based answer");
assert.equal(normal.toolCalls.length, 3);
assert.equal(normalSteps.length, 4);
assert.equal(normalSteps.at(-1).toolsDisabled, true);
assert.equal(normalBudget.requests, 4);

// Parent budget exhaustion prevents another next()/dispatch; existing text and
// tool results stay attached to a recoverable failed AgentRun for manual retry.
const exhaustedBudget = runtime.createWritingCallBudget({ maxRequests: 1 });
let dispatches = 0;
const boundedCoordinator = runtime.createWritingAgentCoordinator({
  generate(input) {
    return registry.runToolLoop({
      callBudget: input.options.callBudget, context: toolContext,
      async next({ round }) {
        runtime.reserveWritingModelCall(input.options.callBudget);
        dispatches += 1;
        return { output: "Already received text", calls: [{ name: "readEvidence", input: { round }, id: "first-tool" }] };
      },
    });
  },
});
let exhaustedError;
try { await boundedCoordinator.run({ projectId: "project-A", options: { callBudget: exhaustedBudget } }); }
catch (error) { exhaustedError = error; }
assert.equal(exhaustedError.code, "writing_call_budget_exhausted");
assert.equal(exhaustedError.partialContent, "Already received text");
assert.equal(exhaustedError.agentRun.output.chars, "Already received text".length);
assert.equal(exhaustedError.agentRun.toolCalls.length, 1);
assert.equal(exhaustedError.agentRun.state, "failed");
assert.equal(exhaustedError.agentRun.error.recoverable, true);
assert.equal(exhaustedError.agentRun.callBudget.stopped, true);
assert.equal(dispatches, 1);

// Provider rate/quota errors stop the parent immediately, preserving output.
for (const providerFailure of [
  { status: 429, code: "rate_limit", reason: "rate-limit" },
  { status: 402, code: "cloud_insufficient_balance", reason: "quota-exhausted" },
  { status: 429, code: "shared_cloud_daily_token_limit", reason: "quota-exhausted" },
  { code: "SUBSCRIPTION_CLI_QUOTA", reason: "quota-exhausted" },
]) {
  const budget = runtime.createWritingCallBudget();
  let requests = 0;
  const coordinator = runtime.createWritingAgentCoordinator({
    generate() {
      return registry.runToolLoop({
        callBudget: budget, context: toolContext,
        async next({ round }) {
          runtime.reserveWritingModelCall(budget);
          requests += 1;
          if (round === 2) throw Object.assign(new Error("Provider refused the next request."), providerFailure);
          return { output: "Preserved proposal", calls: [{ name: "readEvidence", input: { round }, id: "read-before-stop" }] };
        },
      });
    },
  });
  let failed;
  try { await coordinator.run({ projectId: "project-A", options: { invocation: { callBudget: budget } } }); }
  catch (error) { failed = error; }
  assert.equal(failed.partialContent, "Preserved proposal");
  assert.equal(failed.agentRun.error.stopReason, providerFailure.reason);
  assert.equal(failed.agentRun.error.recoverable, true);
  assert.equal(budget.stopReason, providerFailure.reason);
  assert.equal(requests, 2);
  assert.throws(() => runtime.reserveWritingModelCall(budget), { code: "writing_call_budget_exhausted" });
  assert.equal(budget.requests, 2);
}

// Ordinary model failures do not get mislabeled as a quota stop.
const ordinaryBudget = runtime.createWritingCallBudget();
assert.equal(runtime.stopWritingCallBudget(ordinaryBudget, Object.assign(new Error("Network unavailable"), { status: 503 })), false);
assert.equal(ordinaryBudget.stopped, false);

// Exercise the real browser entry bridge: retry gets a new allowance while
// retryOf preserves the prior run's identity; an explicit carrier is reused.
const browserEntry = parseJsSource(read("app/core/writing-agent-coordinator.js")).body
  .find((node) => node.type === "FunctionDeclaration" && node.id.name === "runWritingTask");
const entrySource = read("app/core/writing-agent-coordinator.js");
let invocationId = 0;
const inputs = [];
const manifests = [];
context.activeProjectId = "project-A";
context.currentLanguage = "en";
context.createClioTaskInvocation = () => ({ id: `invocation-${++invocationId}`, projectId: "project-A" });
context.writingAgentSourceScope = () => ({ sourceIds: [] });
context.updateClioTaskInvocation = (invocation, patch) => { invocation.runManifest = patch; manifests.push(patch); };
context.browserWritingAgentCoordinator = runtime.createWritingAgentCoordinator({
  generate(input) {
    inputs.push(input);
    runtime.reserveWritingModelCall(input.options.invocation.callBudget);
    return { output: "Temporary result" };
  },
});
vm.runInContext(entrySource.slice(browserEntry.start, browserEntry.end), context);
await context.runWritingTask({ userText: "First request" });
await context.runWritingTask({ userText: "Retry request", retryOf: "previous-run-id" });
assert.notEqual(inputs[0].options.callBudget, inputs[1].options.callBudget);
assert.equal(inputs[1].retryOf, "previous-run-id");
assert.equal(inputs[1].options.callBudget, inputs[1].options.invocation.callBudget);
assert.equal(manifests.at(-1).callBudget.requests, 1);
assert.equal(manifests.at(-1).agentRun.retryOf, "previous-run-id");
const ownBudget = runtime.createWritingCallBudget({ maxRequests: 2 });
const carrier = { id: "provided-carrier", projectId: "project-A", callBudget: ownBudget };
await context.runWritingTask({ userText: "Continue carrier", invocation: carrier });
assert.equal(inputs.at(-1).options.callBudget, ownBudget);
assert.deepEqual(asPlain(manifests.at(-1).callBudget), asPlain(runtime.snapshotWritingCallBudget(ownBudget)));

test.assert(toolsRun > 0, "real tool loops share dispatch/repair limits, preserve stopped output, and keep manual-retry lineage");
test.finish();
