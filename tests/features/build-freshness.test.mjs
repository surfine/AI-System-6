// A returning visitor runs the build they saw last time, and the deployment says
// what it is serving now.
//
// The service worker answers a navigation from its cached shell and refreshes
// that shell behind the page, so the page a returning visitor is looking at
// names the previous build's bundle. Both public deployments were reported as
// "Cover Glass would not open" while their live bundles already carried the fix:
// the tab was running the build before it. The page now asks, and reloads once
// when the answer is newer.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("build-freshness");
const source = read("app/core/build-freshness.js");

function makeContext({
  running = "20260917.9",
  deployed = "20260917.9",
  controller = true,
  answersShellRefresh = true,
  attempted = "",
  fails = false,
  capability = true,
} = {}) {
  const reloads = [];
  const requests = [];
  const log = [];
  const timers = new Map();
  let nextTimerId = 1;
  const storage = new Map(attempted ? [["ai-system6-build-reload", attempted]] : []);
  const listeners = new Map();
  const listenerFor = (type) => listeners.get(type) || [];
  const document = {
    visibilityState: "visible",
    addEventListener: (type, handler) => {
      listeners.set(type, [...listenerFor(type), handler]);
    },
  };
  // The worker half of the page: postMessage goes out, the worker's answer
  // comes back as a message event, and a worker that never answers leaves the
  // timer the page set to run out.
  const workerListeners = new Map();
  const workerFor = (type) => workerListeners.get(type) || [];
  const serviceWorker = controller
    ? {
        controller: {
          postMessage: (message) => {
            log.push(`ask:${message.type}`);
            if (!answersShellRefresh) return;
            for (const handler of workerFor("message")) handler({ data: { type: "shell-refreshed" } });
          },
        },
        addEventListener: (type, handler) => {
          workerListeners.set(type, [...workerFor(type), handler]);
        },
        removeEventListener: (type, handler) => {
          workerListeners.set(type, workerFor(type).filter((each) => each !== handler));
        },
      }
    : null;
  const sandbox = {
    console,
    AISystem6Capabilities: {
      capabilityAvailable: (name) => (capability ? name === "system.version" : false),
      requestService: async (name, input) => {
        requests.push({ name, input });
        if (fails) throw new Error("offline");
        return {
          ok: true,
          json: async () => ({ build: deployed }),
        };
      },
    },
    location: { reload: () => { log.push("reload"); reloads.push("reload"); } },
    navigator: { serviceWorker },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    // A timer the contract can run out on demand, so a worker that never
    // answers is measured rather than waited for.
    setTimeout: (handler, delay) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { handler, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    AISystem6BuildInfo: { build: running },
    document,
    addEventListener: (type, handler) => {
      listeners.set(type, [...listenerFor(type), handler]);
    },
  };
  // The module is a classic script: it is invoked as `(window)`, and every name
  // it touches is that same object.
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(source, context);
  const fire = async (type) => {
    for (const handler of listenerFor(type)) await handler({ type });
  };
  const runTimers = () => {
    const pending = [...timers.entries()];
    timers.clear();
    pending.forEach(([, { handler }]) => handler());
  };
  return { api: context.AISystem6BuildFreshness, reloads, storage, requests, document, fire, log, runTimers, timers };
}

test.assert(typeof (await makeContext()).api?.checkForNewerBuild === "function", "the check is reachable for a contract to run");

{
  const { api, reloads } = await makeContext();
  test.assert(await api.checkForNewerBuild() === "current", "a page on the deployed build is left alone");
  test.assert(reloads.length === 0, "and does not reload");
}
{
  const { api, requests } = await makeContext();
  await api.checkForNewerBuild();
  test.assert(
    requests[0]?.name === "system.version" && requests[0]?.input?.init?.cache === "no-store",
    "the deployment identity is asked for through the service boundary, uncached"
  );
}
{
  const { api, reloads } = await makeContext({ running: "20260917.4", deployed: "20260917.9" });
  await api.checkForNewerBuild();
  test.assert(reloads.length === 1, "a page running an older build reloads once");
}
{
  const { api, reloads } = await makeContext({ running: "20260917.4", deployed: "20260917.9", attempted: "20260917.4" });
  test.assert(await api.checkForNewerBuild() === "already-tried", "a tab that already tried does not try again");
  test.assert(reloads.length === 0, "so a worker stuck on its stale shell cannot put the page in a loop");
}
{
  const { api } = await makeContext({ controller: false });
  test.assert(await api.checkForNewerBuild() === "no-worker", "a page no worker is serving has no stale shell to correct");
}
{
  const { api, reloads, requests } = await makeContext({ capability: false });
  test.assert(await api.checkForNewerBuild() === "current", "a deployment that does not serve the identity is left alone");
  test.assert(requests.length === 0, "and is not asked");
  test.assert(reloads.length === 0, "and the page does not reload");
}
{
  const { api } = await makeContext({ fails: true });
  test.assert(await api.checkForNewerBuild() === "deployment-unreachable", "an unreachable deployment is not a reason to reload");
}
{
  const { api, reloads } = await makeContext({ running: "", deployed: "20260917.9" });
  test.assert(await api.checkForNewerBuild() === "no-running-build", "a page that cannot name its own build stays put");
  test.assert(reloads.length === 0, "and does not reload");
}

// A page added to the Home Screen is suspended rather than reloaded, so the
// load-time check never runs again. The owner's report — a menu bar still
// wearing the system material two releases after the fix shipped — came from a
// page in exactly that state.
{
  const { reloads, document, fire } = await makeContext({ running: "20260917.4", deployed: "20260917.9" });
  document.visibilityState = "hidden";
  await fire("visibilitychange");
  test.assert(reloads.length === 0, "going to the background is not a reason to ask the deployment anything");
  document.visibilityState = "visible";
  await fire("visibilitychange");
  test.assert(reloads.length === 1, "coming back to the foreground reloads a page the deployment moved on from");
}
{
  const { reloads, fire } = await makeContext({ running: "20260917.9", deployed: "20260917.9" });
  await fire("load");
  await fire("visibilitychange");
  test.assert(reloads.length === 0, "a current page is left alone on both triggers");
}
{
  const { reloads, fire } = await makeContext({ running: "20260917.4", deployed: "20260917.9", attempted: "20260917.4" });
  await fire("visibilitychange");
  test.assert(reloads.length === 0, "and the attempt guard still holds, so a resumed page cannot loop either");
}

// The one reload has to BE the new build. The worker answers a navigation from
// its cached shell and refreshes behind the page, so a reload that overtakes
// that refresh runs the old build again — and the page's single attempt is
// spent, which on a Home Screen icon means the old build until the app is next
// opened. The page asks the worker to settle its shell first.
{
  const { api, log, reloads } = await makeContext({ running: "20260917.4", deployed: "20260917.9" });
  test.assert(await api.checkForNewerBuild() === "reloading", "a stale page still reloads");
  test.assert(log.join(" ") === "ask:refresh-shell reload", `and the worker is asked to settle its shell before the reload (${log.join(" ")})`);
  test.assert(reloads.length === 1, "exactly once");
}
{
  // A worker that cannot answer must not leave the page on the old build for
  // good: the wait is bounded, and the plain reload follows it.
  const context = await makeContext({ running: "20260917.4", deployed: "20260917.9", answersShellRefresh: false });
  const settled = context.api.checkForNewerBuild();
  // The check asks the deployment first, so the wait is not set on the first
  // turn; let the page get as far as it is going to.
  await new Promise((resolve) => setImmediate(resolve));
  test.assert(context.reloads.length === 0, "a worker that has not answered holds the reload");
  test.assert(context.timers.size === 1, "with one bounded wait running");
  context.runTimers();
  test.assert(await settled === "reloading", "and the wait running out reloads anyway");
  test.assert(context.log.join(" ") === "ask:refresh-shell reload", "so a silent worker costs a moment, never the visit");
}
{
  const { api, reloads } = await makeContext({ running: "20260917.9", deployed: "20260917.9" });
  test.assert(await api.checkForNewerBuild() === "current", "a page already on the deployed build asks nothing");
  test.assert(reloads.length === 0, "and does not reload");
}

// The worker half of that guarantee, kept where the page half lives: the page
// can only be sure the reload lands on the new build if the worker really did
// replace its copy first.
const worker = read("apps/desktop/sw.js");
test.assertIncludes(worker, 'if (data?.type === "refresh-shell")',
  "the worker answers the page's request to settle its shell");
test.assertMatches(worker, /fetch\(new Request\(shellUrl, \{ cache: "reload", credentials: "same-origin" \}\)\)/,
  "by fetching the deployment's own document rather than the HTTP cache's copy");
test.assertMatches(worker, /refreshShellDocument\(\)\.then\([\s\S]{0,200}shell-refreshed/,
  "and it says so only once the fresh copy is stored");
test.assertIncludes(worker, 'if (!isCacheableResponse(response)) throw new Error(',
  "while a deployment that cannot answer leaves the shell the device already has");

test.finish();
