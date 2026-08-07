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
test.assertIncludes(revisions, "function createDocumentRevision", "revisions are created through one function");
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

const context = vm.createContext({
  crypto: webcrypto,
  window: {},
  console: { warn: () => {} },
  activeProjectId: "p1",
  activeTextFileId: "doc-1",
  chatFiles: [],
  openAppDb: () => Promise.reject(new Error("no db in test")),
  keyvalStoreName: "keyval",
  idbRequest: () => {},
  AISystem6StorageTransactions: { runTransaction: () => Promise.reject(new Error("no tx")) },
  saveDeskState: () => {},
  renderDocuments: () => {},
  renderProjectDisks: () => {},
  markTeachTextModified: () => {},
  refreshTeachTextDocumentState: () => {},
});
vm.runInContext(revisions, context);

const first = context.createDocumentRevision({
  documentId: "doc-1",
  body: "Version one body.",
  origin: "user",
  operation: "save",
});
const second = context.createDocumentRevision({
  documentId: "doc-1",
  body: "Version two body, longer.",
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

const duplicate = context.createDocumentRevision({
  documentId: "doc-1",
  body: "Version two body, longer.",
  origin: "model",
  operation: "accept-proposal",
});
test.assert(duplicate.id === second.id, "an identical revision is deduplicated, not doubled");

test.finish();
