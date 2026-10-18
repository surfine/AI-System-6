// The web deployment can be linked to as precisely as the mac app.
//
// The shell routes `ai-system-6:` links through its own path (it may move the
// reader to another disk, so it asks first). A page has no such handler, so the
// URL it was opened with carries the same targets instead - `?open=&id=` - and
// openDeepLink resolves them inside the mounted project only.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("web-deep-link");
const vmw = createAppBootVm();
vmw.run(`
  projects.length = 0; scraps.length = 0; chatFiles.length = 0;
  projects.push({ id: "p1", name: "Disk", createdAt: "", updatedAt: "", documentTabs: [], activeDocumentTabIds: {} });
  scraps.push({ id: "s1", projectId: "p1", title: "Clip", body: "text" });
  activeProjectId = "p1"; selectedProjectId = "p1"; startupProjectId = "p1"; isProjectMounted = true;
  renderScraps = function noopScraps() {};
`);

const result = await vmw.run(`
  (async function () {
    const found = await openDeepLink("scrapbook", "s1");
    const selected = selectedScrapId;
    const missing = await openDeepLink("scrapbook", "nope");
    const empty = await openDeepLink("", "");
    return { found, selected, missing, empty };
  })()
`);

test.assert(result.found === true && result.selected === "s1", "?open=scrapbook&id= picks that clip and its window");
test.assert(result.missing === false, "a link to an object that is not here resolves as not found, not as a pass");
test.assert(result.empty === false, "a link with no target does nothing");

// One URL grammar for the whole app: the link is parsed where every other
// launch route is parsed, and an unknown route is not a desk target.
await vmw.run("ensureLazySystemModule('app/core/launch-intent.js', 'AISystem6LaunchIntentLoaded')");
const parsed = vmw.run(`JSON.stringify([
  window.AISystem6LaunchIntent.deskIntent("?open=scrapbook&id=s1"),
  window.AISystem6LaunchIntent.deskIntent("?open=one-more-tune"),
  window.AISystem6LaunchIntent.deskIntent(""),
])`);
test.assert(parsed === JSON.stringify([{ target: "scrapbook", id: "s1" }, null, null]),
  "the desk's link grammar is the app's launch-intent grammar, and a non-desk route is not a desk link");

test.finish();
