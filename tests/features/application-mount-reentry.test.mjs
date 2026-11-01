// An application whose mount opens its own window must not deadlock.
//
// Cover Glass and Quick Draft both register `mount: open`, and open() calls
// openWindow() on the window it belongs to. The window manager mounts before it
// reveals, so that call arrives back at mountApplication — and the runtime used
// to hand the re-entrant caller the promise of the mount it was already inside.
// The outer mount waited for the inner open, the inner open waited for the
// outer mount, and the app "opened" forever: the window built, hidden, and the
// person's click doing nothing. Reported as "玻璃封面 app 怎么打不开".
//
// The runtime now answers a re-entrant mount with `mounting` and lets the
// nested open reveal the window. This contract drives the real runtime module
// with the same shape and fails closed on the old behaviour by timing out the
// mount rather than hanging the suite with it.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("application-mount-reentry");
const source = read("app/core/runtime.js");

const context = vm.createContext({ console, window: {}, document: {}, performance: { now: () => 0 } });
vm.runInContext(source, context);
const runtime = context.window.AISystem6Runtime;
test.assert(typeof runtime?.mountApplication === "function", "the runtime still mounts applications");

async function withTimeout(promise, ms, label) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true, label }), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// The shape both shipped modules use: mount is the open path, the open path
// mounts through the window manager before it reveals, and the window manager
// marks the nested open so the runtime can answer it instead of handing it the
// promise it is already inside.
const seen = [];
runtime.registerApplication({
  id: "selfOpeningApp",
  windowName: "selfOpeningApp",
  mount: async () => {
    const nested = await withTimeout(
      runtime.mountApplication("selfOpeningApp", { windowName: "selfOpeningApp", reentrant: true }),
      1500,
      "nested mount"
    );
    if (nested?.timedOut) {
      seen.push("nested-mount-hung");
      return;
    }
    if (!seen.includes(`nested:${nested.status}`)) seen.push(`nested:${nested.status}`);
  },
});

const first = await withTimeout(runtime.mountApplication("selfOpeningApp"), 2000, "outer mount");
test.assert(!first?.timedOut, "a mount that opens its own window finishes instead of waiting on itself");
test.assert(first?.status === "ok", `the outer mount reports ok (saw ${first?.status ?? first?.label})`);
test.assert(
  seen.includes("nested:mounting"),
  `the nested call is told the mount is under way, not handed its own promise (saw ${seen.join(", ") || "nothing"})`
);

// An independent caller still shares the one initialization and waits for it:
// the narrow rule must not turn every concurrent mount into a fire-and-forget.
{
  let runs = 0;
  let release = null;
  const gate = new Promise((resolve) => { release = resolve; });
  runtime.registerApplication({
    id: "concurrentApp",
    windowName: "concurrentApp",
    mount: async () => { runs += 1; await gate; return "bound"; },
  });
  const first = runtime.mountApplication("concurrentApp");
  const second = runtime.mountApplication("concurrentApp");
  await Promise.resolve();
  const early = { runs };
  release();
  const results = await Promise.all([first, second]);
  test.assert(early.runs === 1, "two concurrent mounts still initialize once");
  test.assert(
    results.every((result) => result.ok === true && result.result === "bound"),
    "both callers still get the completed result, not a placeholder"
  );
}

// The registry is not left saying a half-finished mount is complete.
const second = await withTimeout(runtime.mountApplication("selfOpeningApp"), 2000, "second mount");
test.assert(second?.status === "ok", "a later mount of the same application is cheap and ok");
test.assert(second?.result === undefined || second?.result !== "mounting", "the application is recorded as mounted");

test.finish();
