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
  attempted = "",
  fails = false,
  capability = true,
} = {}) {
  const reloads = [];
  const requests = [];
  const storage = new Map(attempted ? [["ai-system6-build-reload", attempted]] : []);
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
    location: { reload: () => reloads.push("reload") },
    navigator: { serviceWorker: controller ? { controller: {} } : null },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    AISystem6BuildInfo: { build: running },
    addEventListener: () => {},
  };
  // The module is a classic script: it is invoked as `(window)`, and every name
  // it touches is that same object.
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(source, context);
  return { api: context.AISystem6BuildFreshness, reloads, storage, requests };
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

test.finish();
