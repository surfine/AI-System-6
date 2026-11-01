import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createRequire } from "node:module";

process.env.NODE_ENV = "test";
process.env.AI_SYSTEM6_CMF_CONCURRENCY = "1";
process.env.AI_SYSTEM6_CMF_QUEUE_LIMIT = "4";

const test = createFeatureTest("cmf-worker-scheduler");
const require = createRequire(import.meta.url);
const runner = require("../../apps/server/server/cmf/worker-runner.js");
const service = require("../../apps/server/server/cmf/service.js");

const recipe = {
  model: "iphone-17-standard",
  name: "scheduler-test",
  parts: {},
};

const synthetic = (overrides = {}) => ({
  enabled: true,
  synthetic: true,
  delayMs: 0,
  ...overrides,
});

// One worker runs while the bounded dispatcher queues the next two jobs.
{
  const jobs = [0, 1, 2].map((index) => runner.runCmfJob({
    operation: "preview",
    recipe: { ...recipe, name: `queue-${index}` },
    viewName: `0${index + 1}-front`,
    sessionKey: `session-${index}`,
    testControls: synthetic({ delayMs: 120 }),
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const during = runner.schedulerStateForTests();
  test.assert(during.activeCount === 1 && during.queued === 2, "three concurrent jobs enter only one worker and queue the remainder");
  await Promise.all(jobs);
}

// A worker crash is isolated; the dispatcher runs the next request.
{
  let crashed = null;
  try {
    await runner.runCmfJob({
      operation: "preview",
      recipe: { ...recipe, name: "crash" },
      viewName: "crash-view",
      sessionKey: "crash-session",
      testControls: synthetic({ crash: true }),
    });
  } catch (error) {
    crashed = error;
  }
  test.assert(crashed?.code === "cmf_worker_crashed", "a crashed renderer reports a stable worker error");
  const recovered = await runner.runCmfJob({
    operation: "preview",
    recipe: { ...recipe, name: "after-crash" },
    viewName: "after-crash-view",
    sessionKey: "after-crash-session",
    testControls: synthetic(),
  });
  test.assert(recovered.view?.dataUrl?.startsWith("data:image/png"), "the dispatcher serves the request after a worker crash");
}

// Cancellation terminates the active worker and settles only once.
{
  const controller = new AbortController();
  const cancelled = runner.runCmfJob({
    operation: "preview",
    recipe: { ...recipe, name: "cancel" },
    viewName: "cancel-view",
    sessionKey: "cancel-session",
    signal: controller.signal,
    testControls: synthetic({ delayMs: 500 }),
  }).catch((error) => error);
  await new Promise((resolve) => setTimeout(resolve, 30));
  controller.abort();
  const error = await cancelled;
  test.assert(error?.code === "cmf_cancelled", "cancelling a request terminates its worker with a stable code");
  await new Promise((resolve) => setTimeout(resolve, 30));
  test.assert(runner.schedulerStateForTests().activeCount === 0, "cancelled workers release their scheduler slot");
}

// Validation rejects memory-amplifying requests before a worker starts.
{
  const before = runner.schedulerStateForTests().activeCount;
  let dimensionError = null;
  try {
    await runner.runCmfJob({
      operation: "preview",
      recipe,
      renderOptions: { width: 10000, height: 10000 },
      sessionKey: "oversize",
    });
  } catch (error) {
    dimensionError = error;
  }
  test.assert(dimensionError?.code === "cmf_dimensions_too_large", "oversized canvas dimensions fail before dispatch");
  test.assert(runner.schedulerStateForTests().activeCount === before, "invalid dimensions never start a worker");
}

// Every image-affecting field participates in the stable cache identity.
{
  const normalized = service.normalizeRecipe(recipe);
  const base = runner.cacheKey("preview", normalized, "02-back", { width: 1400, height: 1000, viewNames: null });
  const differentView = runner.cacheKey("preview", normalized, "03-rear", { width: 1400, height: 1000, viewNames: null });
  const differentPose = runner.cacheKey("preview", { ...normalized, pose: "open" }, "02-back", { width: 1400, height: 1000, viewNames: null });
  const differentPart = runner.cacheKey("preview", { ...normalized, parts: { ...normalized.parts, frame: "white17" } }, "02-back", { width: 1400, height: 1000, viewNames: null });
  const differentSize = runner.cacheKey("preview", normalized, "02-back", { width: 1200, height: 1000, viewNames: null });
  test.assert(new Set([base, differentView, differentPose, differentPart, differentSize]).size === 5, "cache keys include view, pose, parts, and render parameters");
}

// Command discovery is synchronous but cached, so repeated capability routes
// do not repeatedly spawn six external probes.
{
  const before = service.getCapabilitiesProbeCountForTests();
  service.getCapabilities();
  service.getCapabilities();
  const after = service.getCapabilitiesProbeCountForTests();
  test.assert(after - before === 1, "capabilities probe external commands only once within the TTL");
}

test.assertIncludes(read("apps/server/server/security/public-session.js"), 'pathname.startsWith("/api/cmf/")', "public CMF requests own a finite concurrency group");
test.finish();
