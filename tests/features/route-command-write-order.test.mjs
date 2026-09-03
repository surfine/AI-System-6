// A route command may not write anything before its confirmation is answered,
// and a cancelled command must leave the document byte-identical.
//
// A person who had never seen this product wrote 98 words, pressed To Review,
// and watched them become "## New Section" BEFORE the command's own dialog
// appeared. Cancel did not bring them back and neither did Undo. The bytes
// half of that is held by manuscript-sync-keeps-text.test.mjs. This contract
// holds the ORDER: the command asks first and writes afterwards, so a writer
// who says no is exactly where they were.
//
// It boots the real app (tests/helpers/app-boot-vm.mjs) and drives the real
// commands with the real modal replaced by a recording stub. A source-reading
// contract is refused here on purpose: the source has said the right thing
// about ownership all along -- .claude/rules/writing-route-internals.md spells
// out that a refused edit writes NOTHING AT ALL -- and the product still ate
// the text.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("route-command-write-order");

const WRITING = Array.from({ length: 98 }, (_, index) => `word${index + 1}`).join(" ");
const STALE_OUTLINE = "## New Section\n\n";

// writing-flow.js is lazy and its loader is a `const` -- a lexical binding, not
// a property of the global object -- so it cannot be called from out here. A
// browser's script tag evaluates the module in the same scope as the rest of
// the app, and running its real source through the VM does exactly that, which
// is what makes the real command functions reachable.
function bootRoute() {
  const vmw = createAppBootVm();
  vmw.run(readFileSync(join(root, "apps/desktop/app/features/writing-flow.js"), "utf8"));
  return vmw;
}

// One project, standing where the reporter stood: an Outline that still holds
// the placeholder section, a manuscript the writer has typed into, and a phase
// that has never been advanced.
function seedReporterState(vmw, { body = WRITING, outline = STALE_OUTLINE } = {}) {
  vmw.run(`
    projects.length = 0;
    projects.push({
      id: "route-order",
      name: "Untitled",
      outline: ${JSON.stringify(outline)},
      questionSheet: "",
      drafts: [],
      manuscriptOwnsDraft: false,
      manuscriptLinkedToOutline: false,
    });
    activeProjectId = "route-order";
    activeProject = projects[0];
    teachTextDocumentRole = "manuscript";
    teachTextWorkflowState = "draft";
    teachTextFileLabel = "draft";
    teachTextBodyInput.value = ${JSON.stringify(body)};
    outlineContentEl.value = ${JSON.stringify(outline)};
    if (teachTextStatusEl) teachTextStatusEl.dataset.statusKey = "modified";
  `);
}

// Records every dialog and every durable write, in the order the engine really
// makes them, and answers the dialog with `answer`. saveDeskState is the write
// that reaches the project record; createDocumentRevision is the way back.
function installRecorder(vmw, answer) {
  vmw.run(`
    window.__routeLog = [];
    // No IndexedDB in this harness (a deliberate exclusion -- see
    // app-boot-vm.mjs). Standing in for the store, rather than for
    // createDocumentRevision itself, keeps the real keying, the real
    // duplicate-suppression and the real rollback-on-failure under test: the
    // revision has to reach a store to count as a way back.
    window.__revisionStore = new Map();
    persistRevisions = async function stubPersist(projectId, documentId) {
      window.__revisionStore.set(documentRevisionStorageKey(projectId, documentId),
        JSON.parse(JSON.stringify(cachedRevisions(projectId, documentId))));
    };
    readStoredRevisions = async function stubRead() {};
    showSystemModal = function stubModal(message, type) {
      window.__routeLog.push({ event: "dialog", type: String(type || "") });
      return Promise.resolve(${JSON.stringify(answer)});
    };
    (() => {
      const realSave = saveDeskState;
      saveDeskState = function spySave(...args) {
        window.__routeLog.push({
          event: "saveDeskState",
          outline: getActiveProject()?.outline || "",
          body: teachTextBodyInput?.value || "",
        });
        return realSave(...args);
      };
      const realRevision = createDocumentRevision;
      createDocumentRevision = function spyRevision(...args) {
        window.__routeLog.push({
          event: "createDocumentRevision",
          operation: args[0]?.operation || "",
          body: typeof args[0]?.body === "string" ? args[0].body : (teachTextBodyInput?.value || ""),
        });
        return realRevision(...args);
      };
    })();
  `);
}

function readLog(vmw) {
  return JSON.parse(vmw.run("JSON.stringify(window.__routeLog)"));
}

function snapshot(vmw) {
  return JSON.parse(vmw.run(`JSON.stringify({
    body: teachTextBodyInput?.value || "",
    outline: getActiveProject()?.outline || "",
    drafts: (getActiveProject()?.drafts || []).map((d) => d.body || ""),
    outlineDom: outlineContentEl?.value || "",
    draftDom: draftBodyInput?.value || "",
  })`));
}

async function runCommand(vmw, name) {
  try {
    await vmw.context[name]();
    return null;
  } catch (error) {
    return String(error?.message || error);
  }
}

// --- To Review, cancelled --------------------------------------------------
// The writer says no. Everything they can see, and everything the project
// record holds, must be exactly what it was before they reached for the menu.
{
  const vmw = bootRoute();
  seedReporterState(vmw);
  installRecorder(vmw, "no");
  const before = snapshot(vmw);
  test.assert(before.body === WRITING, "the writer's 98 words are on the paper before the command");

  const threw = await runCommand(vmw, "advanceManuscriptToReview");
  const after = snapshot(vmw);
  const log = readLog(vmw);

  test.assert(
    after.body === before.body,
    after.body === before.body
      ? "a cancelled To Review leaves the manuscript byte-identical"
      : `a cancelled To Review changed the manuscript to ${JSON.stringify(after.body.slice(0, 60))}${threw ? ` (command threw: ${threw})` : ""}`,
  );
  test.assert(
    after.outline === before.outline,
    after.outline === before.outline
      ? "a cancelled To Review leaves the project outline byte-identical"
      : `a cancelled To Review rewrote the outline to ${JSON.stringify(after.outline.slice(0, 60))}`,
  );

  const dialogIndex = log.findIndex((entry) => entry.event === "dialog");
  const firstWriteIndex = log.findIndex((entry) => entry.event === "saveDeskState");
  test.assert(dialogIndex >= 0, `To Review really asked before finalizing (log: ${JSON.stringify(log.map((e) => e.event))})`);
  test.assert(
    firstWriteIndex === -1 || dialogIndex < firstWriteIndex,
    firstWriteIndex === -1 || dialogIndex < firstWriteIndex
      ? "nothing is written to the project record before the dialog is answered"
      : `the command wrote the project record before it asked (log: ${JSON.stringify(log.map((e) => e.event))})`,
  );
}

// --- To Review, confirmed --------------------------------------------------
// A correct command can still be the wrong choice, so the writing the command
// replaces must be recoverable, and the way back has to exist as a record --
// not as a keystroke the writer is expected to guess.
{
  const vmw = bootRoute();
  seedReporterState(vmw);
  installRecorder(vmw, "yes");
  const before = snapshot(vmw);

  await runCommand(vmw, "advanceManuscriptToReview");
  const log = readLog(vmw);

  // The call is not the guarantee. createDocumentRevision returns null when it
  // has no document id, and a route manuscript the writer never saved has no
  // file id at all -- so the history existed for everyone EXCEPT the person
  // who has just watched a command replace their words. What counts is a
  // revision that actually reached the store and can be listed again.
  const stored = JSON.parse(vmw.run(`JSON.stringify(
    [...window.__revisionStore.values()].flat().map((entry) => ({ body: entry.body, operation: entry.operation, documentId: entry.documentId }))
  )`));
  test.assert(
    stored.length > 0,
    stored.length > 0
      ? "a confirmed To Review leaves a revision in the store, for a manuscript with no file on disk"
      : `a confirmed To Review stored no revision at all (log: ${JSON.stringify(log.map((e) => e.event))})`,
  );
  test.assert(
    stored.some((entry) => entry.body === before.body),
    stored.some((entry) => entry.body === before.body)
      ? "the stored revision carries the text as it stood before the command"
      : `no stored revision carries the pre-command text (stored: ${JSON.stringify(stored.map((r) => r.body.slice(0, 30)))})`,
  );

}

// --- To Manuscript: the drafting phase hands the pen over -------------------
// No dialog, so the order cannot be wrong. The property it owes is the other
// half: the characters typed into the surface that is handing the pen over
// must reach the record. Driven from a blurred editor, because that is what a
// menu command really does.
{
  const vmw = bootRoute();
  seedReporterState(vmw, { outline: "# Untitled\n\n## A section {#aaa}\n\n" });
  vmw.run(`
    getActiveProject().drafts = [{ id: "d1", title: "A section", sectionTitle: "A section", body: "", sourceOutlineIndex: 0 }];
    selectedDraftIndex = 0;
    if (draftBodyInput) draftBodyInput.value = ${JSON.stringify(WRITING)};
    noteWritingSurfaceEdit("draft");
    document.activeElement = null;
  `);
  installRecorder(vmw, "yes");

  await runCommand(vmw, "advanceDraftsToManuscript");
  const after = snapshot(vmw);
  test.assert(
    after.outline.includes("word98"),
    after.outline.includes("word98")
      ? "To Manuscript keeps the characters typed into the Section Draft it takes the pen from"
      : `To Manuscript dropped the writer's section text (outline ${JSON.stringify(after.outline.slice(0, 80))})`,
  );
}

// --- Edit Sections Again: the manuscript phase hands the pen back -----------
// The manuscript is the editable owner here and the Outline field is the
// read-only projection of it. renderPipeline clears the last-edited marker on
// every repaint, so a command can easily arrive with no marker at all -- and
// the resolver used to answer "outline" then, rebuilding the record from the
// projection and discarding what the manuscript held.
{
  const vmw = bootRoute();
  seedReporterState(vmw, { body: WRITING, outline: "# Untitled\n\n## A section {#aaa}\n\n" });
  vmw.run(`
    getActiveProject().manuscriptOwnsDraft = true;
    getActiveProject().manuscriptLinkedToOutline = true;
    getActiveProject().drafts = [{ id: "d1", title: "A section", sectionTitle: "A section", body: "", sourceOutlineIndex: 0 }];
    selectedDraftIndex = 0;
    // The writer typed in the manuscript, then a repaint cleared the marker.
    noteWritingSurfaceEdit(null);
    document.activeElement = null;
  `);
  installRecorder(vmw, "yes");

  await runCommand(vmw, "returnDocumentToSectionDrafts");
  const after = snapshot(vmw);
  test.assert(
    after.outline.includes("word98"),
    after.outline.includes("word98")
      ? "Edit Sections Again keeps what the manuscript held, with no last-edited marker to lean on"
      : `Edit Sections Again rebuilt the record from the read-only Outline field and lost the manuscript (outline ${JSON.stringify(after.outline.slice(0, 80))})`,
  );
}

test.finish();
