// Document revisions record key writing nodes without touching the
// one-editable-owner rule. AI output stays a proposal; acceptance moves the
// revision head. The UI is the existing File menu (Versions…), not a new app.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("document-revisions");
const revisions = read("app/core/document-revisions.js");
const manifest = read("scripts/runtime-manifest.mjs");
const menus = read("app/data/menus.js");
const actions = read("app/core/actions.js");
const index = read("index.html");
const documentsChat = read("app/features/documents-chat.js");
const writingFlow = read("app/features/writing-flow.js");
const exportImport = read("app/features/export-import.js");
const maintenance = read("app/core/desktop-maintenance.js");

test.assertIncludes(manifest, '"app/core/document-revisions.js"', "the revisions module is an eager runtime module");
test.assertIncludes(revisions, "async function createDocumentRevision", "revisions are created through one durable async function");
test.assertIncludes(revisions, "parentRevisionId", "revisions keep a parent chain");
test.assertIncludes(revisions, "contentHash", "revisions carry a content hash");
test.assertIncludes(documentsChat, 'origin: "model"', "accepted model proposals are marked as model origin");
test.assertIncludes(revisions, "function compareDocumentRevisions", "two versions can be compared");
test.assertIncludes(revisions, "function restoreDocumentRevision", "a version can be restored as a new revision");
test.assertIncludes(revisions, "maxDocumentRevisions", "revision lists are capped");
test.assertIncludes(menus, "open-document-versions", "the File menu exposes Versions…");
test.assertIncludes(actions, '"open-document-versions"', "the Versions action is registered");
test.assertIncludes(index, 'id="document-versions-modal"', "the Versions dialog exists");

test.assertIncludes(documentsChat, 'operation: "proposal-before"', "AI proposals snapshot the document before the model writes");
test.assertIncludes(documentsChat, 'operation: "accept-proposal"', "accepting a proposal moves the revision head");
test.assertIncludes(documentsChat, 'operation: "save"', "user saves create revisions");
test.assertIncludes(writingFlow, 'operation: "phase-advance"', "phase transitions create revisions");
test.assertIncludes(exportImport, 'operation: "project-cd"', "Project CD burns create revisions");
test.assertIncludes(exportImport, 'operation: "backup-import"', "backup imports create revisions");
test.assertIncludes(maintenance, 'operation: "maintenance-before"', "maintenance repairs snapshot documents first");
test.assertIncludes(maintenance, "await createDocumentRevision", "maintenance waits for the pre-repair revision");
test.assertIncludes(documentsChat, "await createDocumentRevision", "AI overwrite paths wait for the protective revision");
test.assertIncludes(documentsChat, "Could not save the pre-proposal version history", "a failed pre-proposal revision aborts the suggestion");
test.assertIncludes(documentsChat, "Could not save the pre-accept version history", "a failed pre-accept revision aborts the overwrite");
test.assertIncludes(exportImport, "Could not save the pre-burn version history", "a failed pre-burn revision aborts the burn");
test.assertIncludes(exportImport, "await createDocumentRevision", "backup import waits for imported revisions");
test.assertIncludes(writingFlow, "Could not save the pre-advance version history", "a failed phase-advance revision blocks the transition");

const context = vm.createContext({
  crypto: webcrypto,
  structuredClone,
  window: {},
  console: { warn: () => {} },
  activeProjectId: "p1",
  activeTextFileId: "doc-1",
  chatFiles: [],
  setStatus: () => {},
  t: (key) => key,
  openAppDb: () => Promise.resolve({ close: () => {} }),
  keyvalStoreName: "keyval",
  idbRequest: (request) => request,
  saveDeskState: async () => true,
  renderDocuments: () => {},
  renderProjectDisks: () => {},
  markTeachTextModified: () => {},
  refreshTeachTextDocumentState: () => {},
});
context.window.AISystem6StorageTransactions = {
  runTransaction: async (_db, _stores, _mode, operation) => {
    const tx = {
      objectStore: () => ({
        get: async (key) => context.__revisionStore.get(key),
        put: async (value, key) => {
          if (context.__failRevisionWrites) throw new Error("forced revision write failure");
          context.__revisionStore.set(key, structuredClone(value));
        },
      }),
    };
    return operation(tx);
  },
};
context.__revisionStore = new Map();
context.__failRevisionWrites = false;
vm.runInContext(revisions, context);

const first = await context.createDocumentRevision({
  documentId: "doc-1",
  body: "Version one body.\nUnchanged line.",
  origin: "user",
  operation: "save",
});
const second = await context.createDocumentRevision({
  documentId: "doc-1",
  body: "Version two body, longer.\nUnchanged line.",
  origin: "model",
  operation: "accept-proposal",
  parentRevisionId: first.id,
});
test.assert(!!first && !!second, "revisions are created");
test.assert(second.parentRevisionId === first.id, "the revision chain links parent to child");
test.assert(first.contentHash !== second.contentHash, "content hashes differ when bodies differ");

const diff = context.compareDocumentRevisions(first, second);
test.assert(
  diff.addedLines.length === 1 && diff.removedLines.length === 1,
  "compare reports added and removed lines"
);
test.assert(
  diff.unchanged === 1 && diff.unchangedLines[0] === "Unchanged line.",
  "compare reports unchanged lines"
);

// The line diff is LCS-based: moved paragraphs and repeated lines are tracked
// correctly instead of vanishing through set membership.
const movedOld = { id: "m1", body: "alpha\nbeta\ngamma" };
const movedNew = { id: "m2", body: "alpha\ngamma\nbeta" };
const movedDiff = context.compareDocumentRevisions(movedOld, movedNew);
test.assert(
  movedDiff.removedLines.includes("beta") && movedDiff.addedLines.includes("beta"),
  "a moved paragraph is reported as removed+added, not silently equal"
);
const repeatedOld = { id: "r1", body: "x\ny\nx" };
const repeatedNew = { id: "r2", body: "x\nx\ny" };
const repeatedDiff = context.compareDocumentRevisions(repeatedOld, repeatedNew);
test.assert(
  repeatedDiff.addedLines.length + repeatedDiff.removedLines.length === 2,
  "repeated identical lines are diffed by position, not collapsed by a Set"
);

const duplicate = await context.createDocumentRevision({
  documentId: "doc-1",
  body: "Version two body, longer.\nUnchanged line.",
  origin: "model",
  operation: "accept-proposal",
});
test.assert(duplicate.id === second.id, "an identical revision is deduplicated, not doubled");
test.assert(
  context.__revisionStore.has("documentRevisions:p1:doc-1"),
  "revisions are persisted to the keyval store before the call returns"
);

// A failed write must reject AND roll the in-memory entry back so nothing
// claims to be durable that is not.
context.__failRevisionWrites = true;
const rejected = await context.createDocumentRevision({
  documentId: "doc-1",
  body: "Version three that must not survive a failed write.",
  origin: "user",
  operation: "save",
}).then(
  () => "resolved",
  () => "rejected"
);
test.assert(rejected === "rejected", "a failed revision write rejects");
const listed = await context.listDocumentRevisions("doc-1", "p1");
test.assert(
  !listed.some((revision) => /must not survive/.test(revision.body)),
  "a failed revision write leaves no in-memory revision behind"
);
context.__failRevisionWrites = false;

test.finish();
