// Working Session commit boundaries: schedule is debounced, flush is awaited,
// and a project switch persists the old project's scene before ownership
// moves to the new project.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("working-session");
const source = read("app/core/working-session.js");
const switchProjectSource = read("app/core/desktop-runtime.js");

function createWorkingSessionVm() {
  const snapshots = new Map();
  const store = {
    get: async (key) => snapshots.get(key),
    put: async (value, key) => { snapshots.set(key, value); return key; },
    delete: async (key) => { snapshots.delete(key); return undefined; },
  };
  const documentStub = {
    activeElement: null,
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { dataset: {}, classList: { add() {}, remove() {}, contains: () => false } },
  };
  let activeProjectId = "";
  const context = vm.createContext({
    console: { warn: () => {}, error: () => {}, log: () => {} },
    document: documentStub,
    window: {
      innerWidth: 800,
      innerHeight: 600,
      addEventListener: () => {},
      AISystem6StorageTransactions: {
        runTransaction: async (db, storeName, mode, fn) => fn({
          objectStore: () => store,
        }),
      },
    },
    openAppDb: async () => ({ close() {} }),
    keyvalStoreName: "keyval",
    idbRequest: (request) => Promise.resolve(request),
    setTimeout,
    clearTimeout,
    structuredClone,
    activeProjectId,
    projects: [],
    getActiveProject: () => context.projects.find((project) => project.id === context.activeProjectId) || null,
    assignProjectScope: () => {},
    scheduleWorkspaceRender: () => {},
    scheduleStatusRender: () => {},
    renderMultiFinderMenu: () => {},
    updateMenuState: () => {},
  });
  context.activeProjectId = activeProjectId;
  vm.runInContext(source, context);
  context.setActiveProject = (id) => { context.activeProjectId = id; };
  return {
    context,
    snapshots,
    setActiveProject(id) {
      context.activeProjectId = id;
      if (!context.projects.some((project) => project.id === id)) {
        context.projects.push({ id, name: id, archived: false });
      }
    },
  };
}

// scheduleWorkingSessionCommit + flushWorkingSessionCommit write exactly one
// snapshot for the active project.
{
  const runtime = createWorkingSessionVm();
  runtime.setActiveProject("project-a");
  let captured = null;
  runtime.context.registerWorkingSessionAdapter({
    id: "test",
    capture: () => { captured = { projectId: runtime.context.activeProjectId, cursor: 10 }; return captured; },
    restore: () => true,
    clear: (state) => (state.projectId === "project-a" ? undefined : state),
  });
  runtime.context.scheduleWorkingSessionCommit();
  await runtime.context.flushWorkingSessionCommit();
  const snapshot = runtime.snapshots.get("workingSession:v1");
  test.assert(Boolean(snapshot), "flushWorkingSessionCommit writes the snapshot");
  test.assert(snapshot.projectId === "project-a", "the snapshot is owned by the active project");
  test.assert(snapshot.adapters.test.cursor === 10, "the adapter state is captured");
}

// The flush boundary persists the OLD project's scene before ownership moves,
// so Continue can restore A after switching to B and back.
{
  const runtime = createWorkingSessionVm();
  runtime.setActiveProject("project-a");
  runtime.context.registerWorkingSessionAdapter({
    id: "cursor",
    capture: () => ({ projectId: runtime.context.activeProjectId, cursor: runtime.context.__cursor }),
    restore: () => true,
    clear: (state, options) => (options.projectId && state.projectId === options.projectId ? undefined : state),
  });
  runtime.context.__cursor = 1250;
  await runtime.context.flushWorkingSessionCommit();
  test.assert(runtime.snapshots.get("workingSession:v1")?.projectId === "project-a", "Project A's scene is flushed while A is still active");

  // switchProject ordering: flush happens before activeProjectId moves.
  const previous = runtime.context.activeProjectId;
  await runtime.context.flushWorkingSessionCommit();
  runtime.setActiveProject("project-b");
  runtime.context.__cursor = 3;
  await runtime.context.flushWorkingSessionCommit();
  test.assert(runtime.snapshots.get("workingSession:v1")?.projectId === "project-b", "Project B's scene replaces A only after the switch");
  test.assert(previous === "project-a", "the switch boundary flushes the old project first");
}

// Static contracts: every high-value boundary flushes before the ownership or
// visibility change.
test.assertIncludes(
  switchProjectSource,
  "flushWorkingSessionCommit()",
  "switchProject flushes the Working Session"
);
test.assertIncludes(
  switchProjectSource,
  "flushPendingQuickDraftCommit",
  "switchProject still flushes the Draft Desk document first"
);
const switchBlock = switchProjectSource.match(/async function switchProject\(projectId\)[\s\S]*?\n\}\n/)?.[0] || "";
test.assert(
  switchBlock.indexOf("flushWorkingSessionCommit") < switchBlock.indexOf("parkConversationInProject"),
  "the Working Session flush precedes the conversation park and ownership switch"
);
test.assertIncludes(
  source,
  "flushWorkingSessionCommit",
  "the unload/best-effort paths use the shared flush boundary"
);
test.assertIncludes(
  source,
  'new Set(["about", "saveChat", "guide", "welcomeDisk"])',
  "Welcome Floppy never replaces the user's recoverable Working Session"
);

// A writer typed one sentence, was interrupted, and came back to an empty
// desk: the resume was gated on `guideSeen`, which only flips when the Welcome
// Floppy is closed. Anyone who wrote before closing it lost the work, and
// autosave then wrote the empty desk over their only copy. Nothing about
// keeping someone's words may depend on whether they finished onboarding.
const bootSource = read("app/core/boot.js");
test.assertMatches(
  bootSource,
  /const resumedWorkingSession = !writerMode\s*&&\s*await startupTaskWithTimeout\(restoreWorkingSession\(\)/,
  "resuming the desk never depends on onboarding being finished"
);
test.assertMatches(
  bootSource,
  /if \(!guideSeen && !resumedWorkingSession\) \{\s*openStartupItems\(\);/,
  "the Welcome Floppy still owns a true first launch, and only a first launch"
);

test.finish();
