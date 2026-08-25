// State boundary stores: five facades encapsulate the existing global state,
// every write goes through one commit path, and subscribers hear about
// changes. New code should reach these instead of adding more global mutable
// variables.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("state-stores");
const stores = read("app/core/state-stores.js");
const manifest = read("tooling/runtime-manifest.mjs");
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
  structuredClone,
  console: { warn: () => {} },
  projects: [{ id: "p1", name: "P" }],
  chatFiles: [],
  chatFolders: [],
  scraps: [],
  imageAttachments: [],
  projectCdItems: [],
  trashItems: [],
  projectReferences: [],
  ragChunks: [],
  lastRetrievedContextItems: [],
  getActiveProject: () => context.projects[0],
  saveDeskState: async () => true,
  renderPipeline: () => {},
  scheduleRenderTasks: () => {},
  updateMenuState: () => {},
  runtimeEnvironment: "multifinder",
  workspaceProfile: "writing",
});
vm.runInContext(stores, context);

let notified = 0;
let errorEvents = 0;
const unsubscribe = context.window.AISystem6StateStores.projects.subscribe(() => {
  notified += 1;
});
context.window.AISystem6StateStores.projects.subscribe((change) => {
  if (change?.type === "error") errorEvents += 1;
});
await context.window.AISystem6StateStores.projects.commit(({ projects: list }) => {
  list.push({ id: "p2", name: "P2" });
});
test.assert(notified === 1, "a commit notifies subscribers exactly once");
test.assert(context.projects.length === 2, "a commit can update the backing state");
test.assert(typeof unsubscribe === "function", "subscribe returns an unsubscribe function");
unsubscribe();
await context.window.AISystem6StateStores.projects.commit(() => {});
test.assert(notified === 1, "unsubscribed listeners stop receiving notifications");

// Failed persistence: the commit must reject, roll the backing state back,
// and emit an error event instead of a success event.
context.saveDeskState = async () => false;
const beforeFailedCommit = context.projects.map((project) => ({ ...project }));
const failure = await context.window.AISystem6StateStores.projects.commit(({ projects: list }) => {
  list.push({ id: "p3", name: "P3" });
}).then(
  () => null,
  (error) => error
);
test.assert(
  !!failure && failure.code === "STORE_PERSIST_FAILED",
  "a failed commit rejects with STORE_PERSIST_FAILED"
);
test.assert(
  JSON.stringify(context.projects) === JSON.stringify(beforeFailedCommit),
  "a failed commit rolls the backing state back"
);
test.assert(errorEvents === 1, "a failed commit emits an error event");
test.assert(notified === 1, "a failed commit never emits a success event");

test.assert(
  context.window.AISystem6StateStores.desktop.runtimeEnvironment() === "multifinder",
  "the desktop store reads the runtime environment"
);

test.finish();
