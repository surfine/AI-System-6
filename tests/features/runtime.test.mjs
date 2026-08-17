// Runtime contracts for the small explicit interfaces used by the vertical
// slice: applications register, commands fail loudly, render tasks coalesce,
// and the application lifecycle is idempotent and retryable without a DOM.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("runtime");
const runtimeSource = read("app/core/runtime.js");

function createRuntimeContext() {
  const errorCalls = [];
  const warnCalls = [];
  const context = vm.createContext({
    console: {
      warn: (...args) => warnCalls.push(args.map(String).join(" ")),
      error: (...args) => errorCalls.push(args.map(String).join(" ")),
    },
    setTimeout,
    window: {
      AISystem6WriteLease: {
        canMutate: () => false,
      },
    },
  });
  vm.runInContext(runtimeSource, context);
  return {
    context,
    runtime: context.window.AISystem6Runtime,
    errorCalls,
    warnCalls,
  };
}

test.assertIncludes(runtimeSource, "function registerCommand", "the runtime has a command registry");
test.assertIncludes(runtimeSource, "function registerRuntimeApplication", "the runtime has an application registration contract");
test.assertIncludes(runtimeSource, "function registerLazyCommand", "the runtime has a lazy command registration contract");
test.assertIncludes(runtimeSource, "function dispatchCommand", "the runtime dispatches commands explicitly");
test.assertIncludes(runtimeSource, "function registerRenderTask", "the runtime has a render-task registry");
test.assertIncludes(runtimeSource, "function scheduleRenderTask", "render tasks are scheduled through the runtime");
test.assertIncludes(runtimeSource, "async function mountApplication", "the runtime mounts an application");
test.assertIncludes(runtimeSource, "async function restoreApplication", "the runtime restores an application");
test.assertNotIncludes(runtimeSource, "querySelector", "the runtime does not read the DOM");
test.assertNotIncludes(runtimeSource, "indexedDB", "the runtime does not own persistence");

// Commands fail explicitly instead of silently disappearing.
{
  const { runtime } = createRuntimeContext();
  runtime.registerLazyCommand("reader.lazy", { ensure: () => {} });
  test.assert(runtime.lazyCommands.has("reader.lazy"), "a lazy command can be registered before its module loads");

  const missing = await runtime.dispatchCommand("not-registered", {});
  test.assert(missing.ok === false && missing.status === "unregistered", "an unregistered command fails explicitly");

  runtime.registerCommand("reader.open", {
    handler: (payload) => payload.value,
  });
  const success = await runtime.dispatchCommand("reader.open", { value: 42 });
  test.assert(success.ok === true && success.status === "success" && success.result === 42, "a registered command returns success and its result");

  runtime.registerCommand("reader.unavailable", {
    handler: () => true,
    isAvailable: () => false,
  });
  const unavailable = await runtime.dispatchCommand("reader.unavailable", {});
  test.assert(unavailable.ok === false && unavailable.status === "unavailable", "an unavailable command fails explicitly");

}

// A command can be registered and dispatched through the explicit runtime.
{
  const { runtime } = createRuntimeContext();
  const calls = [];
  runtime.registerCommand("reader.open", { handler: () => calls.push("open") });
  const result = await runtime.dispatchCommand("reader.open", {});
  test.assert(result.ok === true && calls.join(",") === "open", "registerCommand registers an app command");
}

// An application can declare commands and a mount/restore lifecycle.
{
  const { runtime } = createRuntimeContext();
  const calls = [];
  runtime.registerApplication({
    id: "reader",
    windowName: "reader",
    mount: () => calls.push("mount"),
    restore: ({ state }) => calls.push(`restore:${state.foo}`),
    commands: {
      "reader.open": { handler: () => calls.push("open") },
    },
  });
  test.assert((await runtime.mountApplication("reader")).ok, "mountApplication succeeds");
  test.assert((await runtime.mountApplication("reader")).ok, "mountApplication is idempotent");
  test.assert(calls.filter((entry) => entry === "mount").length === 1, "mount runs once across repeated opens");
  test.assert((await runtime.restoreApplication("reader", { foo: "bar" })).ok, "restoreApplication succeeds");
  test.assert(calls.join(",") === "mount,restore:bar", "restore mounts once and then passes saved state");
  const command = await runtime.dispatchCommand("reader.open", {});
  test.assert(command.ok && calls.join(",") === "mount,restore:bar,open", "commands declared by an application are registered");
}

// Render tasks coalesce within a frame and unknown tasks are loud in dev.
{
  const { runtime, errorCalls } = createRuntimeContext();
  let documentsRenders = 0;
  runtime.registerRenderTask("documents", () => { documentsRenders += 1; });
  runtime.scheduleRenderTask("documents");
  runtime.scheduleRenderTask("documents");
  runtime.scheduleRenderTask("documents");
  runtime.flushRenderTasks();
  test.assert(documentsRenders === 1, "duplicate render tasks in one frame run once");

  runtime.scheduleRenderTask("not-registered");
  runtime.flushRenderTasks();
  test.assert(errorCalls.length > 0, "an unknown render task reports an error");
}

test.finish();
