// State boundary stores: five facades encapsulate the existing global state,
// every write goes through one commit path, and subscribers hear about
// changes. New code should reach these instead of adding more global mutable
// variables.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("state-stores");
const stores = read("app/core/state-stores.js");
const manifest = read("scripts/runtime-manifest.mjs");
const desktopRuntime = read("app/core/desktop-runtime.js");
const exportImport = read("app/features/export-import.js");
const writingFlow = read("app/features/writing-flow.js");

test.assertIncludes(manifest, '"app/core/state-stores.js"', "the state stores module is an eager runtime module");
for (const store of ["projects", "writing", "context", "runs", "desktop"]) {
  test.assertIncludes(stores, `${store}: {`, `the ${store} store facade exists`);
  test.assertIncludes(stores, "commit(", `${store} routes writes through one commit path`);
  test.assertIncludes(stores, "subscribe", `${store} notifies subscribers`);
}
test.assertIncludes(stores, "// @ts-check", "the module opts into frontend checkJs");
test.assertIncludes(stores, "This is encapsulation, not a rewrite", "the module documents its scope");
test.assertIncludes(desktopRuntime, "AISystem6StateStores?.projects.commit", "project creation writes through ProjectStore");
test.assertIncludes(exportImport, "AISystem6StateStores?.projects.commit", "Project CD burns write through ProjectStore");
test.assertIncludes(writingFlow, "AISystem6StateStores?.writing.commit", "phase advances write through WritingStore");

const context = vm.createContext({
  window: {},
  console: { warn: () => {} },
  projects: [{ id: "p1", name: "P" }],
  chatFiles: [],
  chatFolders: [],
  scraps: [],
  ragChunks: [],
  lastRetrievedContextItems: [],
  getActiveProject: () => context.projects[0],
  saveDeskState: () => {},
  renderPipeline: () => {},
  scheduleRenderTasks: () => {},
  updateMenuState: () => {},
  runtimeEnvironment: "multifinder",
  workspaceProfile: "writing",
});
vm.runInContext(stores, context);

let notified = 0;
const unsubscribe = context.window.AISystem6StateStores.projects.subscribe(() => {
  notified += 1;
});
context.window.AISystem6StateStores.projects.commit(({ projects: list }) => {
  list.push({ id: "p2", name: "P2" });
});
test.assert(notified === 1, "a commit notifies subscribers exactly once");
test.assert(context.projects.length === 2, "a commit can update the backing state");
test.assert(typeof unsubscribe === "function", "subscribe returns an unsubscribe function");
unsubscribe();
context.window.AISystem6StateStores.projects.commit(() => {});
test.assert(notified === 1, "unsubscribed listeners stop receiving notifications");

test.assert(
  context.window.AISystem6StateStores.desktop.runtimeEnvironment() === "multifinder",
  "the desktop store reads the runtime environment"
);

test.finish();
