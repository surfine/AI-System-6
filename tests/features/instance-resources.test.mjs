// Per-instance cleanup: everything registered is released exactly once, a
// cleanup that throws does not stop the others, a listener released through
// the registry really stops firing, and a resource that ended on its own is
// not released twice.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("instance-resources");

const vmw = createAppBootVm();
const run = (code) => vmw.run(code);

test.assert(
  run('typeof window.AISystem6InstanceResources?.create === "function"') === true,
  "the instance resource registry is part of the runtime"
);

const releaseOrder = await run(`
  (() => {
    const resources = window.AISystem6InstanceResources.create("test-window");
    const order = [];
    resources.add(() => order.push("first"), "first");
    resources.add(() => { order.push("second"); throw new Error("cleanup failed"); }, "second");
    resources.add(() => order.push("third"), "third");
    const outcome = resources.dispose("window-closed");
    const again = resources.dispose("window-closed-again");
    return { order, outcome: { disposed: outcome.disposed, failures: outcome.failures.length }, again };
  })()
`);
test.assert(
  releaseOrder.order.join(",") === "third,second,first",
  "resources are released in reverse registration order, and one failure does not stop the rest"
);
test.assert(
  releaseOrder.outcome.disposed === true && releaseOrder.outcome.failures === 1,
  "the dispose report names how many cleanups failed"
);
test.assert(
  releaseOrder.again.disposed === false,
  "a second dispose is a no-op, so repeated closes cannot double-run side effects"
);

const listenerOutcome = await run(`
  (() => {
    // The harness's document is a real event target with real listener
    // storage; a throwaway one keeps this test about the registry.
    const target = document;
    let heard = 0;
    const resources = window.AISystem6InstanceResources.create("listener-window");
    resources.listen(target, "instance-resource-ping", () => { heard += 1; });
    target.dispatchEvent(new Event("instance-resource-ping"));
    const before = heard;
    resources.dispose("closed");
    target.dispatchEvent(new Event("instance-resource-ping"));
    return { before, after: heard };
  })()
`);
test.assert(
  listenerOutcome.before === 1 && listenerOutcome.after === 1,
  "a listener registered through the registry stops firing once the instance is disposed"
);

// Timers need real ones to be tested, and the boot harness's are deliberately
// inert, so this part runs the module in a context with the real clock.
{
  const timerContext = vm.createContext({ window: {}, console, setTimeout, clearTimeout });
  vm.runInContext(read("app/core/instance-resources.js"), timerContext, { filename: "instance-resources.js" });
  vm.runInContext(`
    window.__cancelledFired = 0;
    window.__cancelled = window.AISystem6InstanceResources.create("timer-window");
    window.__cancelled.timeout(() => { window.__cancelledFired += 1; }, 5);
    window.__cancelled.dispose("closed");

    window.__liveFired = 0;
    window.__live = window.AISystem6InstanceResources.create("live-timer");
    window.__live.timeout(() => { window.__liveFired += 1; }, 5);
    window.__liveSizeBefore = window.__live.size;
  `, timerContext);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const timers = vm.runInContext(`({
    cancelledFired: window.__cancelledFired,
    liveFired: window.__liveFired,
    liveSizeBefore: window.__liveSizeBefore,
    liveSizeAfter: window.__live.size,
  })`, timerContext);
  test.assert(
    timers.cancelledFired === 0,
    "a timer registered through the registry is cleared with the instance"
  );
  test.assert(
    timers.liveFired === 1 && timers.liveSizeBefore === 1 && timers.liveSizeAfter === 0,
    "a timer that runs to the end leaves the registry by itself"
  );
}

const selfEnding = await run(`
  (() => {
    const resources = window.AISystem6InstanceResources.create("ending-window");
    const order = [];
    const remove = resources.add(() => order.push("should-not-run"), "removed");
    remove();
    resources.dispose("closed");
    return order;
  })()
`);
test.assert(selfEnding.length === 0, "a resource that ended on its own is not released again");

test.finish();
