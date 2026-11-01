// State boundary stores: five facades encapsulate the existing global state,
// every write goes through one commit path, and subscribers hear about
// changes. New code should reach these instead of adding more global mutable
// variables.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

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

// --- A commit must not strand the record handles it hands out. ---
//
// Found live by the eight-stop walk gate: Generate Outline captured
// getActiveProject(), waited for the model, then wrote the answer into that
// object. Recording the run receipt committed three times in between, and each
// commit replaced every project object with a structuredClone. The answer
// landed on a stranded object, the Outline kept showing "## New Section", and
// nothing reported an error - the write itself had succeeded.
//
// This runs the real receipt lifecycle through the real store on the real
// eager module set, because the defect is about OBJECT IDENTITY, which no
// amount of reading the source can show.
{
  const vmw = createAppBootVm();
  vmw.run(`
    projects.length = 0;
    projects.push({ id: "keep-1", name: "New Project", outline: "## New Section", drafts: [] });
    projects.push({ id: "keep-2", name: "Walk Gate Project", outline: "## New Section", drafts: [] });
    activeProjectId = "keep-2";
    selectedProjectId = "keep-2";
    startupProjectId = "keep-2";
    isProjectMounted = true;
    deskPersistenceWritable = true;
    // The only thing between saveDeskState() and a database this harness does
    // not have. Forcing it here keeps the store's own commit path real.
    persistDeskState = function stubPersistDeskState() { return Promise.resolve(true); };
    window.AISystem6WriteLease = Object.assign({}, window.AISystem6WriteLease, {
      isReadOnly: () => false,
      canMutate: () => true,
      reconcile: async () => null,
    });
    // Both need a fuller DOM than this headless shim has, and both run AFTER
    // the commit, so the seam under test is untouched.
    renderDocuments = function noopRenderDocuments() {};
    renderProjectDisks = function noopRenderProjectDisks() {};
    window.__handle = getActiveProject();
  `);

  // One constant, interpolated as JSON on both sides, so the answer the
  // receipt records and the answer written through the handle cannot drift.
  const answer = "## Background\n\nThe generated outline body.";
  const receipt = await vmw.context.AISystem6RunReceipts.recordModelAnswer({
    projectId: "keep-2",
    sourceAppId: "outline",
    intent: "generate-outline",
    provider: "local",
    model: "test-model",
    answerText: answer,
  });
  test.assert(receipt?.ok === true, "the run receipt for a model answer is recorded");

  const outcome = JSON.parse(vmw.run(`
    (() => {
      const captured = window.__handle;
      setProjectOutlineMarkdown(captured, ${JSON.stringify(answer)});
      const live = getActiveProject();
      return JSON.stringify({
        sameObject: live === captured,
        stillInArray: projects.includes(captured),
        onScreen: live.outline,
        otherProjectKept: projects[0].name,
        projectCount: projects.length,
      });
    })()
  `));

  test.assert(
    outcome.sameObject && outcome.stillInArray,
    "a project handle taken before a commit is still the live record after it"
  );
  test.assert(
    outcome.onScreen === answer,
    "an answer written through that handle reaches the record the route reads"
  );
  test.assert(
    outcome.projectCount === 2 && outcome.otherProjectKept === "New Project",
    "a commit leaves the projects it did not touch alone"
  );
}

test.finish();
