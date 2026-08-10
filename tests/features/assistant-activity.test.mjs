// Assistant Activity contracts: states derive only from real runtime events
// (model readiness, run transitions, operations, cancellation, stale runs,
// project switches) and never invent a busy state. Bring-to-front points at
// the real owner window; reloads start idle; a stale run can never leave the
// system permanently Busy.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("assistant-activity");
const manifest = read("scripts/runtime-manifest.mjs");
const activitySource = read("app/core/assistant-activity.js");
const coordinator = read("app/core/writing-agent-coordinator.js");
const desktopRuntime = read("app/core/desktop-runtime.js");

test.assertIncludes(manifest, '"app/core/assistant-activity.js"', "assistant activity loads in the app runtime");
test.assertIncludes(activitySource, "offline", "the state set includes offline");
test.assertIncludes(activitySource, "waiting", "the state set includes waiting (checkpoint)");
test.assertIncludes(activitySource, "assistantActivityStaleRunMs", "a stale-run watchdog exists");
test.assertIncludes(activitySource, "reportRunTransition", "run transitions feed the activity state");
test.assertIncludes(activitySource, "attachActivitySurface", "semantic data-* hooks are exposed for the appearance layer");
test.assertNotIncludes(activitySource, "getCurrentTheme", "activity never reads the active theme");
test.assertNotIncludes(activitySource, "classic", "activity does not branch on Classic");
test.assertNotIncludes(activitySource, "liquid", "activity does not branch on Liquid Glass");
test.assertIncludes(coordinator, "reportRunTransition", "the writing agent coordinator pushes run transitions");
test.assertIncludes(desktopRuntime, "resetForProject", "project switches reset the activity state");

let nowValue = 1_000_000;
const dateStub = class {
  toISOString() {
    return "2026-08-10T00:00:00.000Z";
  }
  static now() {
    return nowValue;
  }
};

function createActivityContext(overrides = {}) {
  const windowCalls = [];
  const cancelCalls = [];
  const context = vm.createContext({
    console,
    crypto: webcrypto,
    Date: dateStub,
    t: (key) => key,
    setStatus: () => {},
    openWindow: (name) => windowCalls.push(name),
    bringAppToFront: () => {},
    activeAbortController: null,
    window: {},
    ...(overrides.globals || {}),
  });
  vm.runInContext(activitySource, context);
  return { context, windowCalls, cancelCalls };
}

const first = createActivityContext();
const activity = first.context.window.AISystem6AssistantActivity;

// No model source -> offline; model ready -> idle.
let state = activity.getState();
test.assert(state.state === "offline", "no model signal means offline");
activity.setModelReadySource(() => true);
state = activity.getState();
test.assert(state.state === "idle", "a ready model with no run means idle");
activity.setModelReadySource(() => false);
state = activity.getState();
test.assert(state.state === "offline", "losing the model signal returns to offline");
activity.reportModelReady(true);
state = activity.getState();
test.assert(state.state === "idle", "reportModelReady(true) yields idle");

// Run transitions map to activity states and carry the real owner.
state = activity.reportRunTransition(
  { id: "run-1", projectId: "project-1", taskKind: "chat", state: "retrieving", startedAt: "2026-08-10T00:00:00.000Z" },
  "retrieving"
);
test.assert(state.state === "reading", "retrieving sources means reading");
test.assert(state.runId === "run-1" && state.bringToFrontTarget === "assistant", "activity carries the run id and real owner window");
test.assert(state.cancellable === false, "without a real cancel path the UI never claims Stop");
test.assert(activity.cancelActiveRun().ok === false, "cancelActiveRun without a cancel path fails honestly");

state = activity.reportRunTransition({ id: "run-1", state: "generating" }, "generating");
test.assert(state.state === "working", "generating means working");
state = activity.reportRunTransition({ id: "run-1", state: "awaitingCommit" }, "awaitingCommit");
test.assert(state.state === "waiting", "awaiting user approval means waiting");
test.assert(state.cancellable === false, "awaitingCommit is a checkpoint, not a cancellable generation");
state = activity.reportRunTransition({ id: "run-1", state: "committed" }, "committed");
test.assert(state.state === "ready", "completion means ready");
state = activity.reportRunTransition({ id: "run-2", state: "failed" }, "failed");
test.assert(state.state === "error", "failure means error");
state = activity.reportRunTransition({ id: "run-2", state: "aborted" }, "aborted");
test.assert(state.state === "idle", "an aborted run returns to idle");

// Production path: a run transition reports a real cancel capability and
// System Status can actually stop the run. The UI state's cancellable flag
// and cancelActiveRun() come from the same source of truth.
const runAborts = [];
const liveController = {
  abort: () => runAborts.push("controller"),
};
const production = createActivityContext({
  globals: { activeAbortController: liveController },
});
const productionActivity = production.context.window.AISystem6AssistantActivity;
state = productionActivity.reportRunTransition(
  { id: "run-live", projectId: "project-1", taskKind: "chat", state: "generating", startedAt: "2026-08-10T00:00:00.000Z" },
  "generating"
);
test.assert(state.cancellable === true, "a run with a live abort controller is cancellable");
const liveCancel = productionActivity.cancelActiveRun();
test.assert(liveCancel.ok === true && runAborts.length === 1, "Stop on a real run calls the abort path");
const explicitAborts = [];
const explicit = createActivityContext();
const explicitActivity = explicit.context.window.AISystem6AssistantActivity;
state = explicitActivity.reportRunTransition(
  { id: "run-explicit", state: "generating" },
  "generating",
  { cancel: () => explicitAborts.push("explicit") }
);
test.assert(state.cancellable === true, "an explicitly provided cancel capability makes the run cancellable");
const explicitCancel = explicitActivity.cancelActiveRun();
test.assert(explicitCancel.ok === true && explicitAborts.length === 1, "cancelActiveRun uses the explicit cancel function");
state = explicitActivity.reportRunTransition({ id: "run-explicit", state: "awaitingCommit" }, "awaitingCommit");
test.assert(state.cancellable === false, "even with a cancel capability, awaitingCommit does not advertise Stop");

// Operations: begin -> working, cancel, end with abort -> idle, end ok -> ready.
const cancelStub = () => first.cancelCalls.push("cancel");
const handle = activity.beginOperation({
  runId: "op-1",
  projectId: "project-1",
  ownerAppId: "reviewDesk",
  windowName: "reviewDesk",
  targetObjectId: "file-1",
  cancellable: true,
  cancel: cancelStub,
});
state = activity.getState();
test.assert(state.state === "working" && state.ownerAppId === "reviewDesk", "an operation begins working with its real owner");
const cancelled = activity.cancelActiveRun();
test.assert(cancelled.ok === true && first.cancelCalls.length === 1, "cancelling an active run calls the real cancel path");
state = activity.endOperation(handle, { ok: false, error: { name: "AbortError" } });
test.assert(state.state === "idle", "an aborted operation returns to idle");
test.assert(activity.cancelActiveRun().ok === false, "nothing to cancel after the run ends");

const handle2 = activity.beginOperation({
  runId: "op-2",
  windowName: "reviewDesk",
  ownerAppId: "reviewDesk",
  cancellable: false,
});
state = activity.endOperation(handle2, { ok: true });
test.assert(state.state === "ready", "a completed operation ends ready");

// Bring to front points at the real owner window.
activity.beginOperation({ runId: "op-3", windowName: "reviewDesk", ownerAppId: "reviewDesk" });
const front = activity.bringToFront();
test.assert(front.ok === true && first.windowCalls.includes("reviewDesk"), "bring-to-front opens the real owner window");
activity.endOperation({ runId: "op-3" }, { ok: true });

// Stale run watchdog: a run that stops transitioning can never leave the
// system permanently Busy.
activity.reportRunTransition({ id: "run-3", state: "generating" }, "generating");
state = activity.getState();
test.assert(state.state === "working", "the stale test starts from a working run");
nowValue += activity.staleRunMs + 1_000;
test.assert(activity.checkStale() === true, "a stale run trips the watchdog");
state = activity.getState();
test.assert(state.state === "error" && state.labelKey === "activity_interrupted", "a stale run ends as interrupted, not Busy");
test.assert(activity.checkStale() === false, "the watchdog does not fire twice");

// Project switch resets activity and never leaks the old project.
activity.reportRunTransition({ id: "run-4", projectId: "project-1", state: "generating" }, "generating");
state = activity.resetForProject("project-2");
test.assert(state.state === "idle" && state.projectId === "project-2" && state.runId === "", "project switch resets activity with the new project id");

// Reload starts clean (runtime-only state), receipts remain the durable side.
const reloaded = createActivityContext();
state = reloaded.context.window.AISystem6AssistantActivity.getState();
test.assert(state.state === "offline", "a fresh runtime starts offline, never Busy");

// Subscribers receive state changes.
const seen = [];
const unsubscribe = activity.subscribe((next) => seen.push(next.state));
activity.beginOperation({ runId: "op-5", windowName: "reviewDesk" });
test.assert(seen.includes("working"), "subscribers receive activity changes");
unsubscribe();
const before = seen.length;
activity.beginOperation({ runId: "op-6", windowName: "reviewDesk" });
test.assert(seen.length === before, "unsubscribed listeners stop receiving changes");

// Semantic surface hook attaches data-* state.
const surface = { dataset: {}, setAttribute: (name, value) => { surface.dataset[name] = value; } };
const detach = activity.attachActivitySurface(surface);
test.assert(surface.dataset.assistantState === "working", "attachActivitySurface publishes data-assistant-state");
test.assert(surface.dataset.activity === "activity_working", "attachActivitySurface publishes the activity label key");
detach();

test.finish();
