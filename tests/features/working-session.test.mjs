// Working Session scope, commit boundaries, and the v1 -> v2 migration.
//
// Every Project Hard Disk owns its own desktop scene under its own storage
// key. Switching disks flushes the old scene, mounts the new disk, and brings
// that disk's scene back; Startup Items open only when a disk has no scene.
// The single legacy "workingSession:v1" record must reach its v2 scope with
// nothing lost, idempotently, and without being deleted before the v2 record
// reads back intact.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("working-session");
const source = read("app/core/working-session.js");
const switchProjectSource = read("app/core/desktop-runtime.js");
const exportImportSource = read("app/features/export-import.js");
const bootSource = read("app/core/boot.js");

const desktopKey = "workingSession:v2:desktop";
const projectKey = (id) => `workingSession:v2:project:${id}`;

function createWorkingSessionVm({ failWrites = false } = {}) {
  const snapshots = new Map();
  const store = {
    get: async (key) => snapshots.get(key),
    put: async (value, key) => {
      if (failWrites && String(key).startsWith("workingSession:v2:")) throw new Error("forced write failure");
      snapshots.set(key, value);
      return key;
    },
    delete: async (key) => { snapshots.delete(key); return undefined; },
    getAllKeys: async () => [...snapshots.keys()],
  };
  const documentStub = {
    activeElement: null,
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { dataset: {}, classList: { add() {}, remove() {}, contains: () => false } },
  };
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
    JSON,
    Date,
    activeProjectId: "",
    isProjectMounted: false,
    selectedProjectId: "",
    projects: [],
    assignProjectScope: () => {},
    scheduleWorkspaceRender: () => {},
    scheduleStatusRender: () => {},
    renderMultiFinderMenu: () => {},
    updateMenuState: () => {},
  });
  vm.runInContext(source, context);
  return {
    context,
    snapshots,
    mount(id) {
      context.activeProjectId = id;
      context.isProjectMounted = true;
      if (!context.projects.some((project) => project.id === id)) {
        context.projects.push({ id, name: id, archived: false });
      }
    },
    eject() {
      context.isProjectMounted = false;
    },
  };
}

// A scene adapter that records whatever the "disk" is showing right now.
function registerSceneAdapter(runtime) {
  runtime.context.registerWorkingSessionAdapter({
    id: "scene",
    capture: () => ({ projectId: runtime.context.activeProjectId, scene: runtime.context.__scene }),
    restore: (state) => { runtime.context.__restored = state; return true; },
    clear: (state, options) => (options.projectId && state.projectId === options.projectId ? undefined : state),
  });
}

// --- scope keys -------------------------------------------------------------
{
  const runtime = createWorkingSessionVm();
  registerSceneAdapter(runtime);

  runtime.context.__scene = "desktop-scene";
  await runtime.context.flushWorkingSessionCommit();
  test.assert(runtime.snapshots.has(desktopKey), "an unmounted desk saves under the desktop scope key");
  test.assert(!runtime.snapshots.has("workingSession:v1"), "the single v1 key is no longer written");

  runtime.mount("project-a");
  runtime.context.__scene = "a-scene";
  await runtime.context.flushWorkingSessionCommit();
  test.assert(runtime.snapshots.has(projectKey("project-a")), "a mounted disk saves under its own scope key");
  test.assert(
    runtime.snapshots.get(desktopKey).adapters.scene.scene === "desktop-scene",
    "the desktop scene is untouched by a project's scene"
  );
  test.assert(
    runtime.snapshots.get(projectKey("project-a")).version === 2,
    "scenes are written at Working Session version 2"
  );
}

// --- A -> B -> A: one disk's scene never overwrites another's ---------------
{
  const runtime = createWorkingSessionVm();
  registerSceneAdapter(runtime);

  runtime.mount("project-a");
  runtime.context.__scene = { windows: ["teachText", "reader"], caret: 1250 };
  await runtime.context.flushWorkingSessionCommit();

  runtime.mount("project-b");
  runtime.context.__scene = { windows: ["cmfStudio"], caret: 3 };
  await runtime.context.flushWorkingSessionCommit();

  const sceneA = runtime.snapshots.get(projectKey("project-a")).adapters.scene.scene;
  const sceneB = runtime.snapshots.get(projectKey("project-b")).adapters.scene.scene;
  test.assert(sceneA.caret === 1250 && sceneA.windows.length === 2, "Project A keeps its own scene after B is mounted");
  test.assert(sceneB.caret === 3 && sceneB.windows[0] === "cmfStudio", "Project B has a scene of its own");

  runtime.mount("project-a");
  const resumed = await runtime.context.restoreWorkingSession({ projectId: "project-a", mounted: true });
  test.assert(resumed === true, "switching back to A restores A's scene");
  test.assert(
    runtime.context.__restored.scene.caret === 1250
      && runtime.context.__restored.scene.windows.join() === "teachText,reader",
    "the scene that comes back is A's, not B's"
  );
}

// The scope key is bound when the scene is captured, so a disk switch that
// happens while the write is still queued cannot misfile the scene.
{
  const runtime = createWorkingSessionVm();
  registerSceneAdapter(runtime);
  runtime.mount("project-a");
  runtime.context.__scene = "a-scene";
  const pending = runtime.context.flushWorkingSessionCommit();
  runtime.mount("project-b");
  await pending;
  test.assert(
    runtime.snapshots.get(projectKey("project-a"))?.adapters.scene.scene === "a-scene"
      && !runtime.snapshots.has(projectKey("project-b")),
    "a queued write lands under the disk that owned the scene, not the one mounted since"
  );
}

// --- v1 migration: nothing is lost, it is idempotent, and it rolls back -----
const legacyV1 = {
  version: 1,
  savedAt: "2026-08-15T12:00:00.000Z",
  projectId: "project-a",
  viewport: { width: 1440, height: 900 },
  adapters: {
    windows: {
      activeAppId: "teachText",
      activeWindowName: "teachText",
      windows: [{ name: "teachText", visible: true, zIndex: 9, frame: { left: "24px", top: "48px" } }],
    },
    teachText: { projectId: "project-a", body: "Half a sentence I was in the middle", editor: { selectionStart: 17 } },
    reader: { projectId: "project-a", scrollTop: 640, currentReaderPage: { title: "Source" } },
  },
};

{
  const runtime = createWorkingSessionVm();
  runtime.mount("project-a");
  runtime.snapshots.set("workingSession:v1", structuredClone(legacyV1));

  const first = await runtime.context.migrateWorkingSessionStorage();
  test.assert(first.migrated === true && first.key === projectKey("project-a"), "the legacy scene moves to its project scope");
  const moved = runtime.snapshots.get(projectKey("project-a"));
  test.assert(
    JSON.stringify(moved.adapters) === JSON.stringify(legacyV1.adapters),
    "every adapter of the legacy scene survives the move byte for byte"
  );
  test.assert(
    moved.savedAt === legacyV1.savedAt
      && moved.projectId === legacyV1.projectId
      && JSON.stringify(moved.viewport) === JSON.stringify(legacyV1.viewport),
    "the legacy scene keeps its timestamp, owner, and viewport"
  );
  test.assert(moved.version === 2 && moved.migratedFrom === 1, "the moved scene is stamped v2 and records where it came from");
  test.assert(!runtime.snapshots.has("workingSession:v1"), "the legacy record is dropped only after the move is verified");
}

{
  // Idempotent: running the migration twice leaves exactly the same state.
  const runtime = createWorkingSessionVm();
  runtime.mount("project-a");
  runtime.snapshots.set("workingSession:v1", structuredClone(legacyV1));
  await runtime.context.migrateWorkingSessionStorage();
  const afterFirst = JSON.stringify([...runtime.snapshots.entries()].sort());

  const second = createWorkingSessionVm();
  second.mount("project-a");
  runtime.snapshots.forEach((value, key) => second.snapshots.set(key, structuredClone(value)));
  const result = await second.context.migrateWorkingSessionStorage();
  test.assert(result.migrated === false && result.reason === "absent", "a second run finds nothing left to move");
  test.assert(
    JSON.stringify([...second.snapshots.entries()].sort()) === afterFirst,
    "a second migration run leaves storage identical"
  );
}

{
  // A legacy record with no project belongs to the desktop.
  const runtime = createWorkingSessionVm();
  const orphan = { ...structuredClone(legacyV1), projectId: null };
  runtime.snapshots.set("workingSession:v1", orphan);
  const result = await runtime.context.migrateWorkingSessionStorage();
  test.assert(result.key === desktopKey, "a legacy scene with no project id lands on the desktop scope");
  test.assert(
    JSON.stringify(runtime.snapshots.get(desktopKey).adapters) === JSON.stringify(orphan.adapters),
    "the desktop-scoped migration loses nothing either"
  );
}

{
  // Rollback: the v2 write fails, so v1 must still be there for the next boot.
  const runtime = createWorkingSessionVm({ failWrites: true });
  runtime.mount("project-a");
  runtime.snapshots.set("workingSession:v1", structuredClone(legacyV1));
  const result = await runtime.context.migrateWorkingSessionStorage();
  test.assert(result.migrated === false, "a failed write does not report a migration");
  test.assert(
    JSON.stringify(runtime.snapshots.get("workingSession:v1")) === JSON.stringify(legacyV1),
    "the legacy scene is still intact after a failed migration"
  );
}

{
  // A v2 scene already owns the scope: it wins, and the stale v1 record goes.
  const runtime = createWorkingSessionVm();
  runtime.mount("project-a");
  runtime.snapshots.set("workingSession:v1", structuredClone(legacyV1));
  runtime.snapshots.set(projectKey("project-a"), { version: 2, savedAt: "2026-08-16T00:00:00.000Z", projectId: "project-a", adapters: { windows: { windows: [] } } });
  const result = await runtime.context.migrateWorkingSessionStorage();
  test.assert(result.migrated === true, "an already-migrated scope completes the migration");
  test.assert(
    runtime.snapshots.get(projectKey("project-a")).savedAt === "2026-08-16T00:00:00.000Z",
    "the newer v2 scene is never overwritten by the legacy record"
  );
  test.assert(!runtime.snapshots.has("workingSession:v1"), "the superseded legacy record is cleaned up");
}

// --- erasing a disk and capping growth -------------------------------------
{
  const runtime = createWorkingSessionVm();
  registerSceneAdapter(runtime);
  runtime.mount("project-a");
  runtime.context.__scene = "a";
  await runtime.context.flushWorkingSessionCommit();
  runtime.mount("project-b");
  runtime.context.__scene = "b";
  await runtime.context.flushWorkingSessionCommit();
  // The desktop scene still carries A's File Floppy from before the eject.
  runtime.snapshots.set(desktopKey, {
    version: 2, savedAt: "2026-08-16T00:00:00.000Z", projectId: null,
    adapters: { scene: { projectId: "project-a", scene: "left over" } },
  });

  await runtime.context.clearWorkingSession({ projectId: "project-a" });
  test.assert(!runtime.snapshots.has(projectKey("project-a")), "erasing a disk drops that disk's scene");
  test.assert(runtime.snapshots.has(projectKey("project-b")), "another disk's scene is untouched");
  test.assert(
    runtime.snapshots.get(desktopKey).adapters.scene === undefined,
    "the erased disk is scrubbed out of scenes it does not own"
  );

  await runtime.context.clearWorkingSession();
  test.assert(runtime.snapshots.size === 0, "clearing with no project puts the whole desk away");
}

{
  const runtime = createWorkingSessionVm();
  // 30 scenes, one of them for a disk that no longer exists.
  for (let index = 0; index < 30; index += 1) {
    const id = `project-${String(index).padStart(2, "0")}`;
    if (index > 0) runtime.context.projects.push({ id, name: id, archived: false });
    runtime.snapshots.set(projectKey(id), {
      version: 2,
      savedAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      projectId: id,
      adapters: {},
    });
  }
  runtime.mount("project-29");
  runtime.snapshots.set(desktopKey, { version: 2, savedAt: "2026-08-01T00:00:00.000Z", projectId: null, adapters: {} });

  await runtime.context.pruneWorkingSessionScopes();
  test.assert(!runtime.snapshots.has(projectKey("project-00")), "an orphan scene of an erased disk is dropped");
  test.assert(runtime.snapshots.has(desktopKey), "the desktop scene is never evicted");
  test.assert(runtime.snapshots.has(projectKey("project-29")), "the mounted disk's scene is never evicted");
  const remaining = [...runtime.snapshots.keys()].filter((key) => key.startsWith("workingSession:v2:project:"));
  test.assert(remaining.length === 24, "project scenes are capped, oldest evicted first");
  test.assert(
    !remaining.includes(projectKey("project-01")) && remaining.includes(projectKey("project-28")),
    "eviction takes the least recently saved scene, not an arbitrary one"
  );
}

// --- an erased or archived disk cannot resume ------------------------------
{
  const runtime = createWorkingSessionVm();
  registerSceneAdapter(runtime);
  runtime.snapshots.set(projectKey("project-gone"), {
    version: 2, savedAt: "2026-08-16T00:00:00.000Z", projectId: "project-gone", adapters: { scene: { scene: "x" } },
  });
  const resumed = await runtime.context.restoreWorkingSession({ projectId: "project-gone" });
  test.assert(resumed === false, "a scene whose disk was erased does not resume");
  test.assert(!runtime.snapshots.has(projectKey("project-gone")), "and its scene is cleaned up on the way out");

  runtime.context.projects.push({ id: "project-away", name: "Away", archived: true });
  runtime.snapshots.set(projectKey("project-away"), {
    version: 2, savedAt: "2026-08-16T00:00:00.000Z", projectId: "project-away", adapters: { scene: { scene: "y" } },
  });
  test.assert(
    await runtime.context.restoreWorkingSession({ projectId: "project-away" }) === false,
    "an archived disk is remounted before its scene returns"
  );
  test.assert(
    runtime.snapshots.has(projectKey("project-away")),
    "an archived disk keeps its scene for the next time it is mounted"
  );
}

// --- what a backup may carry ------------------------------------------------
{
  const runtime = createWorkingSessionVm();
  runtime.mount("project-a");
  runtime.snapshots.set(projectKey("project-a"), {
    version: 2,
    savedAt: "2026-08-16T00:00:00.000Z",
    projectId: "project-a",
    adapters: {
      windows: { windows: [{ name: "teachText" }] },
      teachText: { body: "kept" },
      fileFloppy: { projectId: "project-a", mountedTextDisk: { files: ["big.pdf"], fileBodies: { "big.pdf": "..." } } },
    },
  });
  const exported = await runtime.context.readWorkingSessionForBackup("project-a");
  test.assert(exported.adapters.windows && exported.adapters.teachText, "a backup carries the disk's windows and writing surfaces");
  test.assert(
    exported.adapters.fileFloppy === undefined,
    "File Floppy stays out of a backup: it is temporary context, not durable disk state"
  );
  test.assert(
    JSON.stringify(exported).search(/apiKey|token|password|secret/i) === -1,
    "an exported scene carries no credential-shaped field"
  );
  test.assert(
    await runtime.context.readWorkingSessionForBackup("project-with-no-scene") === null,
    "a disk with no scene contributes nothing to its backup"
  );
}

// --- static contracts -------------------------------------------------------
test.assertIncludes(source, 'const workingSessionDesktopKey = "workingSession:v2:desktop"', "the desktop scope key is explicit");
test.assertIncludes(source, 'const workingSessionProjectKeyPrefix = "workingSession:v2:project:"', "project scope keys are namespaced per disk");
test.assertIncludes(source, 'const workingSessionLegacyStorageKey = "workingSession:v1"', "the legacy key is still known, so it can be migrated");
test.assertNotIncludes(
  source,
  "const workingSessionStorageKey =",
  "no single global scene key survives the migration"
);

const migrationBlock = source.match(/async function migrateWorkingSessionStorage\(\)[\s\S]*?\n\}\n/)?.[0] || "";
test.assert(
  migrationBlock.indexOf("migratedWorkingSessionIsReadable") < migrationBlock.lastIndexOf("store.delete(workingSessionLegacyStorageKey)"),
  "the legacy record is deleted only after the v2 record reads back intact"
);
test.assertIncludes(
  migrationBlock,
  'workingSessionStoreTask("readwrite"',
  "the whole migration is one transaction, so a failure cannot leave it half done"
);

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
const switchBlock = switchProjectSource.match(/async function switchProject\(projectId, options = \{\}\)[\s\S]*?\n\}\n/)?.[0] || "";
test.assert(
  switchBlock.indexOf("flushWorkingSessionCommit") < switchBlock.indexOf("parkConversationInProject"),
  "the Working Session flush precedes the conversation park and ownership switch"
);
test.assertIncludes(
  switchBlock,
  "restoreWorkingSession({ projectId: project.id, mounted: true })",
  "mounting a disk restores that disk's own scene"
);
test.assert(
  switchBlock.indexOf("restoreWorkingSession") < switchBlock.indexOf("openStartupItems()"),
  "Startup Items open only when the disk has no scene to resume"
);
test.assertIncludes(
  switchBlock,
  "if (!resumed) openStartupItems()",
  "the Startup Items fallback is conditional on the resume failing"
);
test.assertIncludes(
  switchProjectSource,
  "if (typeof flushWorkingSessionCommit === \"function\") flushWorkingSessionCommit();",
  "ejecting a disk captures its scene while it still owns it"
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
test.assertIncludes(
  bootSource,
  "migrateWorkingSessionStorage()",
  "Boot Recovery reports on scenes only after the legacy record has moved"
);
test.assertIncludes(
  exportImportSource,
  "readWorkingSessionForBackup(projectId)",
  "a Project Hard Disk backup can carry that disk's scene"
);

// A writer typed one sentence, was interrupted, and came back to an empty
// desk: the resume was gated on `guideSeen`, which only flips when the Welcome
// Floppy is closed. Anyone who wrote before closing it lost the work, and
// autosave then wrote the empty desk over their only copy. Nothing about
// keeping someone's words may depend on whether they finished onboarding.
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
