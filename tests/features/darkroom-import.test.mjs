// Restoring a v5 backup brings the darkroom back with the disk.
//
// Step 6 of the darkroom acceptance -- "import as a new project and confirm the
// negative, the stack, the locks and the chain come back" -- was the one part
// still owed. The export half is already executed by backup-fail-closed.test.mjs
// (a real buildProjectDiskExport against a stubbed keyval); this executes the
// import half the same way, so the round trip is proven end to end rather than
// half-asserted.
//
// The behaviours that matter, and why each is a defect if it breaks:
//   - the record lands under the IMPORTED project's id. A backup restored into
//     a new project keeps its own id, so writing the ORIGINAL id would file the
//     darkroom under a disk that does not exist and the writer would open a
//     developed draft to find it blank.
//   - projectId and documentId are stripped from the stored value. They are the
//     key; leaving them in the body lets a later read disagree with its own key.
//   - a record with no documentId is skipped rather than written to
//     `darkroom:<project>:undefined`.
//   - another project's darkroom, if one were somehow in the bundle, does not
//     acquire this project's id by being imported.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("darkroom-import");
const exportImportSource = read("app/features/export-import.js");

function makeImportContext() {
  const keyval = new Map();
  const stores = { keyval };
  const storeFor = (name) => {
    if (!stores[name]) stores[name] = new Map();
    return stores[name];
  };
  const context = vm.createContext({
    crypto: webcrypto,
    structuredClone,
    TextEncoder,
    Uint8Array,
    URL,
    Blob,
    Date,
    console,
    window: {
      location: { protocol: "http:", hostname: "x" },
      AISystem6Config: {},
      AISystem6StorageTransactions: {
        // The real one hands the callback a transaction; the stub hands it one
        // whose stores are Maps, so the writes are observable.
        runTransaction: async (_db, _names, _mode, run) => run({
          objectStore: (name) => {
            const store = storeFor(name);
            return {
              put: async (value, key) => { store.set(key ?? value?.id, value); return key; },
              get: async (key) => store.get(key),
              delete: async (key) => { store.delete(key); },
              getAllKeys: async () => [...store.keys()],
              clear: async () => { store.clear(); },
              index: () => ({ getAll: async () => [] }),
            };
          },
        }),
      },
    },
    idbRequest: (request) => request,
    openAppDb: async () => ({ close: () => {} }),
    projectsStoreName: "projects",
    scrapsStoreName: "scraps",
    trashStoreName: "trash",
    chatFoldersStoreName: "chatFolders",
    chatFilesStoreName: "chatFiles",
    referenceStoreName: "projectReferences",
    imageAttachmentsStoreName: "imageAttachments",
    imageAttachments: [],
    keyvalStoreName: "keyval",
    projectCdItems: [],
    scraps: [],
    trashItems: [],
    chatFolders: [],
    chatFiles: [],
    projects: [],
    projectReferences: [],
    normalizeProjectReferenceForStorage: (r) => r,
    storageVersion: 5,
    revisionsStorageKey: (id) => `revisions:${id}`,
    settingsSnapshotPayload: () => ({}),
    applySettings: () => {},
    ensureActiveProject: () => {},
    setStatus: () => {},
    t: (key) => key,
  });
  vm.runInContext(exportImportSource, context);
  return { context, stores, keyval };
}

const { context, keyval } = makeImportContext();
test.assert(
  typeof context.commitImportedProjectAtomically === "function",
  "the import commit can be executed rather than only read",
);

const developed = {
  projectId: "the-project-this-backup-came-from",
  documentId: "doc-1",
  schemaVersion: 1,
  negative: "The sentence as the writer first wrote it.",
  composite: "The sentence after one pass.",
  adjustmentLayers: [{ kind: "mingming", enabled: true }],
  protectedRanges: [{ start: 0, end: 8 }],
  versions: [{ key: "v1", text: "The sentence as the writer first wrote it." }],
};

await context.commitImportedProjectAtomically({
  project: { id: "restored-project", name: "Restored" },
  folders: [],
  files: [{ id: "doc-1", projectId: "restored-project", type: "text", name: "Draft.md", body: "# Draft" }],
  scraps: [],
  trash: [],
  references: [],
  projectCdItems: [],
  darkroomRecords: [developed, { projectId: "x", negative: "no document id" }],
});

const key = "darkroom:restored-project:doc-1";
const stored = keyval.get(key);

test.assert(!!stored, "a developed document's darkroom is written on import");
test.assert(
  !keyval.has("darkroom:the-project-this-backup-came-from:doc-1"),
  "and lands under the imported project's id, not the one the backup came from",
);
test.assert(
  ![...keyval.keys()].some((entry) => String(entry).endsWith(":undefined")),
  "a record with no documentId is skipped, never written to a key ending in undefined",
);

test.assert(stored?.negative === developed.negative, "the negative comes back");
test.assert(stored?.composite === developed.composite, "the composite comes back");
test.assert(
  JSON.stringify(stored?.adjustmentLayers) === JSON.stringify(developed.adjustmentLayers),
  "the adjustment stack comes back",
);
test.assert(
  JSON.stringify(stored?.protectedRanges) === JSON.stringify(developed.protectedRanges),
  "the locks come back",
);
test.assert(
  JSON.stringify(stored?.versions) === JSON.stringify(developed.versions),
  "the version chain comes back",
);
test.assert(
  stored?.projectId === undefined && stored?.documentId === undefined,
  "the ids live in the key, not a second time inside the value where they could disagree with it",
);

test.finish();
