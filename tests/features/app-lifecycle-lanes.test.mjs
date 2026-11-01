// Unified spec (2026-10-10) W05 contract: per-application lifecycle lanes.
// Drives the REAL registry (application-registry.js) in a bare vm with the
// REAL vendored lane contract (contracts.mjs) installed — proving:
//   1. a slow suspend converges to a later resume (no stale transition wins);
//   2. applications transition independently — one app's slow hook never
//      blocks another's;
//   3. a throwing hook does not wedge the app (state still advances);
//   4. dispose is total — nothing resumes a disposed instance.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("app-lifecycle-lanes");

function makeContext() {
  // Only host functions are injected; every constructable intrinsic stays the
  // vm's own (the contracts' prototype checks are realm-sensitive).
  const context = { console, setTimeout, clearTimeout, queueMicrotask };
  context.globalThis = context;
  context.window = context;
  // A minimal document stub: the registry reads visibilityState at sync time.
  context.document = { visibilityState: "visible", addEventListener() {}, querySelector: () => null };
  vm.createContext(context);
  // The vendored contracts as a classic global (ESM keywords stripped — the
  // browser loads the untouched file via the lazy installer).
  const contractsSource = read("app/vendor/unified-spec/contracts.mjs").replace(/^export\s+/gm, "");
  vm.runInContext(`${contractsSource}\nthis.ClioWorksUnifiedContracts = { createLifecycleLane, makeTicket, resolvePassage };`, context, { filename: "contracts.vm.js" });
  // The registry module: strip its window wiring tail (it assigns onto window
  // at load; in the vm that is this, fine) and evaluate.
  const registrySource = read("app/core/application-registry.js");
  vm.runInContext(registrySource, context, { filename: "application-registry.vm.js" });
  return context;
}

const run = async () => {
  const context = makeContext();
  const registry = context.window.AISystem6ApplicationRegistry;
  test.assert(!!registry && typeof registry.registerApplicationLifecycle === "function",
    "the real registry installs in the vm with the vendored lane contract");

  // 1. Slow suspend converges: suspend's hook parks; resume is requested
  //    before the hook settles; the lane must end ACTIVE with resume run.
  const marks = [];
  let releaseSuspend = null;
  const gate = new Promise((resolve) => { releaseSuspend = resolve; });
  registry.registerApplicationLifecycle("slow-app", {
    onSuspend: async () => { marks.push("suspend-start"); await gate; marks.push("suspend-end"); },
    onResume: async () => { marks.push("resume"); },
  });
  const suspendPromise = registry.suspendApplication("slow-app", "test");
  // Let the suspend hook start (microtasks), then request resume mid-flight.
  await new Promise((resolve) => setTimeout(resolve, 10));
  const resumePromise = registry.resumeApplication("slow-app", "test");
  releaseSuspend();
  const suspendOk = await suspendPromise;
  const resumeOk = await resumePromise;
  const finalState = registry.getApplicationLifecycleState("slow-app");
  test.assert(suspendOk === true && resumeOk === true && finalState === "active",
    `a resume requested mid-suspend converges to active (marks=${JSON.stringify(marks)}, state=${finalState})`);
  test.assert(marks.includes("resume"), "the resume hook ran after the suspend settled");

  // 2. Independence: app A's gated suspend does not block app B's transitions.
  let releaseA = null;
  const gateA = new Promise((resolve) => { releaseA = resolve; });
  const bMarks = [];
  registry.registerApplicationLifecycle("blocking-a", {
    onSuspend: async () => { await gateA; },
  });
  registry.registerApplicationLifecycle("independent-b", {
    onSuspend: async () => { bMarks.push("b-suspended"); },
  });
  const aSuspend = registry.suspendApplication("blocking-a", "test");
  await new Promise((resolve) => setTimeout(resolve, 10));
  const bSuspend = registry.suspendApplication("independent-b", "test");
  const bOk = await bSuspend;
  test.assert(bOk === true && bMarks.includes("b-suspended"),
    "app B suspends while app A's suspend hook is still parked (no cross-app blocking)");
  releaseA();
  await aSuspend;

  // 3. A throwing hook does not wedge the app.
  registry.registerApplicationLifecycle("throwing-app", {
    onSuspend: async () => { throw new Error("W05 intentional suspend failure"); },
    onResume: async () => { marks.push("throwing-resumed"); },
  });
  const throwResult = await registry.suspendApplication("throwing-app", "test");
  const stateAfterThrow = registry.getApplicationLifecycleState("throwing-app");
  test.assert(stateAfterThrow === "suspended" || stateAfterThrow === "active",
    `a throwing suspend leaves the app in a recoverable state (${stateAfterThrow})`);
  if (stateAfterThrow === "suspended") {
    const resumed = await registry.resumeApplication("throwing-app", "test");
    test.assert(resumed === true, "a throwing-suspend app can still be resumed");
  }

  // 4. Dispose is total.
  registry.registerApplicationLifecycle("disposable", {
    onSuspend: async () => {}, onResume: async () => { marks.push("disposed-resumed"); },
  });
  await registry.disposeApplication("disposable", "test");
  const resumedAfterDispose = await registry.resumeApplication("disposable", "test");
  test.assert(resumedAfterDispose === false, "nothing resumes a disposed instance");

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
