// Execute the real save/finalize functions and Project Disk tab records. Only
// durable storage, revision I/O and unrelated paint/window work are controlled.
// A failed save may retain the edited document snapshot for retry, but it must
// not claim durability, finalize the workflow, or overwrite a different tab.
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-studio-save");

function bootSaveDesk() {
  const vmw = createAppBootVm();
  vmw.run(`
    projects.length = 0;
    chatFiles.length = 0;
    for (const [projectId, documentId, tabId, title, body] of [
      ["p1", "d1", "t1", "First", "first on disk"],
      ["p2", "d2", "t2", "Second", "second on disk"],
    ]) {
      projects.push({
        id: projectId, name: title, title, questionSheet: "", outline: "", drafts: [],
        documentTabs: [{ id: tabId, app: "teachText", role: "manuscript", title,
          backing: { type: "manuscript", id: documentId },
          state: { activeTextFileId: documentId, name: title, body,
            label: "draft", workflowState: "draft", statusKey: "modified" },
          createdAt: "2026-01-01", updatedAt: "2026-01-01", order: 0 }],
        activeDocumentTabIds: { teachText: tabId },
      });
      chatFiles.push({ id: documentId, projectId, type: "text", name: title,
        body, label: "draft", folderId: "folder-" + projectId });
    }
    activeProjectId = "p1";
    selectedProjectId = "p1";
    startupProjectId = "p1";
    isProjectMounted = true;
    deskPersistenceWritable = true;
    activeTextFileId = "d1";
    teachTextDocumentRole = "manuscript";
    teachTextWorkflowState = "draft";
    teachTextFileLabel = "draft";
    teachTextNameInput.value = "First";
    teachTextFolderInput.value = "Writing";
    teachTextBodyInput.value = "first AUTHOR EDITS retained for retry";
    teachTextStatusEl.dataset.statusKey = "modified";
    markTeachTextTabLoaded();

    window.__statuses = [];
    window.__documentStatuses = [];
    window.__opened = [];
    window.__reviewOpens = 0;
    window.__diskCalls = 0;
    window.__diskMode = "success";
    window.__disk = null;
    setStatus = (message) => window.__statuses.push(String(message || ""));
    const actualSetDocumentStatus = setTeachTextStatus;
    setTeachTextStatus = (key) => {
      window.__documentStatuses.push(key);
      actualSetDocumentStatus(key);
    };
    renderDocuments = () => {};
    refreshTeachTextDocumentState = () => {};
    // Title repaint lives in the lazy writing-flow module; persistence and
    // the real modified/input/capture listeners do not depend on that paint.
    window.updateQuestionSheetManuscriptTitle = () => {};
    playSystemSound = () => {};
    openWindow = async (name) => { window.__opened.push(name); };
    openReviewDesk = () => { window.__reviewOpens += 1; };
    unlinkTeachTextPipeline = () => {};
    syncReviewDeskFromTeachText = () => {};
    ensureFolder = () => ({ id: "folder-" + activeProjectId });
    window.AISystem6Perf = { start: () => () => {} };
    window.AISystem6DerivedIndexQueue = { afterProjectCommit: () => {} };
    persistDeskState = async () => {
      window.__diskCalls += 1;
      if (window.__diskMode === "false") return false;
      if (window.__diskMode === "throw") throw new Error("controlled disk write failure");
      window.__disk = structuredClone({ projects, chatFiles });
      return true;
    };
    createDocumentRevision = async () => ({ id: "revision" });
  `);
  return vmw;
}

async function settleStorage(vmw) {
  // The old implementation returned before its save promise settled. Drain
  // that boundary too, so this test observes false/throw rather than racing it.
  await vmw.run("Promise.resolve(saveDeskStatePromise).catch(() => {})");
  await new Promise((resolve) => setImmediate(resolve));
}

function currentOutcome(vmw) {
  return vmw.run(`({
    body: teachTextBodyInput.value,
    workflow: teachTextWorkflowState,
    label: teachTextFileLabel,
    fileLabel: getTeachTextFile()?.label,
    tab: structuredClone(getActiveDocumentTab("teachText")),
    saved: window.__documentStatuses.includes("saved") || window.__statuses.includes(t("saved")),
    reviewOpens: window.__reviewOpens,
    diskCalls: window.__diskCalls,
    disk: window.__disk,
  })`);
}

function prepareSecondDocument(vmw, switchProject) {
  if (switchProject) return;
  vmw.run(`
    projects[1].documentTabs[0].role = "scratch_file";
    projects[1].documentTabs[0].backing.type = "projectText";
    projects[0].documentTabs.push(projects[1].documentTabs[0]);
    chatFiles.find((file) => file.id === "d2").projectId = "p1";
  `);
}

function switchToSecondDocument(vmw, switchProject) {
  vmw.run(`
    activeProjectId = ${JSON.stringify(switchProject ? "p2" : "p1")};
    selectedProjectId = activeProjectId;
    setActiveDocumentTab("teachText", "t2");
    activeTextFileId = "d2";
    teachTextDocumentRole = ${JSON.stringify(switchProject ? "manuscript" : "scratch_file")};
    teachTextWorkflowState = "draft";
    teachTextFileLabel = "draft";
    teachTextNameInput.value = "Second";
    teachTextBodyInput.value = "second AUTHOR EDITS must stay untouched";
    teachTextStatusEl.dataset.statusKey = "modified";
    markTeachTextTabLoaded();
    captureActiveTeachTextTabState();
    window.__targetBefore = structuredClone(getActiveDocumentTab("teachText"));
  `);
}

function holdRevision(vmw) {
  vmw.run(`
    window.__revisionHeld = false;
    window.__releaseRevision = null;
    createDocumentRevision = async () => {
      window.__revisionHeld = true;
      await new Promise((resolve) => { window.__releaseRevision = resolve; });
      return { id: "revision" };
    };
  `);
}

// A real disk transaction failure must propagate through saveTextDocument.
for (const mode of ["false", "throw"]) {
  const vmw = bootSaveDesk();
  vmw.run(`window.__diskMode = ${JSON.stringify(mode)};`);
  const result = await vmw.run(`saveTextDocument({ promptForFolder: false }).then(
    (saved) => ({ saved }), (error) => ({ error: String(error) })
  )`);
  await settleStorage(vmw);
  const outcome = currentOutcome(vmw);
  test.assert(outcome.diskCalls > 0, `${mode}: the actual persistence boundary was reached`);
  test.assert(result.saved !== true, `${mode}: a failed durable save does not return success`);
  test.assert(!outcome.saved, `${mode}: no saved status is announced before a successful disk write`);
  test.assert(outcome.tab.state.statusKey !== "saved", `${mode}: the original tab is not marked saved`);
  test.assert(outcome.body === "first AUTHOR EDITS retained for retry", `${mode}: the author's editor body survives for retry`);
  test.assert(outcome.tab.state.body === outcome.body, `${mode}: the original tab retains the author's retry body`);
}

// Finalization uses the same real save path; it cannot leave a persisted scene
// or the original tab in Final merely because an in-memory snapshot changed.
for (const mode of ["false", "throw"]) {
  const vmw = bootSaveDesk();
  vmw.run(`window.__diskMode = ${JSON.stringify(mode)};`);
  await vmw.run(`setTeachTextFileLabel("final", { confirmed: true, persist: true }).catch(() => {})`);
  await settleStorage(vmw);
  const outcome = currentOutcome(vmw);
  test.assert(outcome.diskCalls > 0, `final ${mode}: the actual disk write was attempted`);
  test.assert(outcome.workflow === "draft" && outcome.label === "draft", `final ${mode}: workflow and editor label return to their previous draft state`);
  test.assert(outcome.fileLabel !== "final", `final ${mode}: the source file does not retain a false final label`);
  test.assert(outcome.tab.state.workflowState === "draft" && outcome.tab.state.label === "draft", `final ${mode}: the original tab retains draft workflow and label`);
  test.assert(outcome.reviewOpens === 0, `final ${mode}: failure does not enter Review Desk`);
  test.assert(!outcome.saved && outcome.tab.state.statusKey !== "saved", `final ${mode}: failure does not claim that the manuscript was saved`);
  test.assert(outcome.body === "first AUTHOR EDITS retained for retry" && outcome.tab.state.body === outcome.body, `final ${mode}: both editor and tab retain the author's text`);
  test.assert(vmw.run("captureTeachTextWorkingSession().workflowState") === "draft", `final ${mode}: a subsequent Working Session capture cannot persist Final`);
}

// Carry source identities through the real awaited history call. Switching
// projects and switching documents on the same project are separate cases.
for (const switchProject of [true, false]) {
  const vmw = bootSaveDesk();
  const label = switchProject ? "project switch" : "document switch";
  vmw.run(`
    if (${!switchProject}) {
      projects[1].documentTabs[0].role = "scratch_file";
      projects[1].documentTabs[0].backing.type = "projectText";
      projects[0].documentTabs.push(projects[1].documentTabs[0]);
      chatFiles.find((file) => file.id === "d2").projectId = "p1";
    }
    window.__revisionHeld = false;
    window.__releaseRevision = null;
    createDocumentRevision = async () => {
      window.__revisionHeld = true;
      await new Promise((resolve) => { window.__releaseRevision = resolve; });
      return { id: "revision" };
    };
    window.__saving = saveTextDocument({ promptForFolder: false }).then(
      (saved) => ({ saved }), (error) => ({ error: String(error) })
    );
  `);
  const held = await vmw.waitFor(() => vmw.run("window.__revisionHeld"));
  test.assert(held, `${label}: the real save is waiting inside revision persistence`);
  vmw.run(`
    activeProjectId = ${JSON.stringify(switchProject ? "p2" : "p1")};
    selectedProjectId = activeProjectId;
    setActiveDocumentTab("teachText", "t2");
    activeTextFileId = "d2";
    teachTextDocumentRole = ${JSON.stringify(switchProject ? "manuscript" : "scratch_file")};
    teachTextWorkflowState = "draft";
    teachTextFileLabel = "draft";
    teachTextNameInput.value = "Second";
    teachTextBodyInput.value = "second AUTHOR EDITS must stay untouched";
    teachTextStatusEl.dataset.statusKey = "modified";
    markTeachTextTabLoaded();
    captureActiveTeachTextTabState();
    window.__targetBefore = structuredClone(getActiveDocumentTab("teachText"));
    window.__releaseRevision();
  `);
  const result = await vmw.run("window.__saving");
  await settleStorage(vmw);
  const outcome = vmw.run(`({
    before: window.__targetBefore,
    after: structuredClone(getActiveDocumentTab("teachText")),
    body: teachTextBodyInput.value,
    activeFile: activeTextFileId,
    status: teachTextStatusEl.dataset.statusKey,
    source: chatFiles.find((file) => file.id === "d1"),
    diskSource: window.__disk?.chatFiles.find((file) => file.id === "d1"),
  })`);
  test.assert(result.saved === true, `${label}: the captured original document can still save successfully`);
  test.assert(outcome.source.body === "first AUTHOR EDITS retained for retry" && outcome.diskSource?.body === outcome.source.body, `${label}: the original author's snapshot reaches durable storage`);
  test.assert(JSON.stringify(outcome.after) === JSON.stringify(outcome.before), `${label}: the newly active tab's body, identity, backing, label and status are unchanged`);
  test.assert(outcome.activeFile === "d2" && outcome.body === "second AUTHOR EDITS must stay untouched", `${label}: the active editor still belongs to the second document`);
  test.assert(outcome.status === "modified", `${label}: the second document is not falsely marked saved`);
}

// A successful finalize reaches storage before it opens the Review Desk.
{
  const vmw = bootSaveDesk();
  vmw.run(`
    window.__storageHeld = false;
    window.__releaseStorage = null;
    const actualPersist = persistDeskState;
    persistDeskState = async () => {
      window.__storageHeld = true;
      await new Promise((resolve) => { window.__releaseStorage = resolve; });
      return actualPersist();
    };
    window.__finalizing = setTeachTextFileLabel("final", { confirmed: true, persist: true });
  `);
  test.assert(await vmw.waitFor(() => vmw.run("window.__storageHeld")), "success final: finalization actually waits for durable storage");
  test.assert(vmw.run("window.__reviewOpens") === 0, "success final: Review Desk does not open before the write completes");
  vmw.run("window.__releaseStorage()");
  await vmw.run("window.__finalizing");
  const outcome = currentOutcome(vmw);
  test.assert(outcome.workflow === "final" && outcome.label === "final" && outcome.fileLabel === "final", "success final: the original editor and source document become Final");
  test.assert(outcome.tab.state.workflowState === "final" && outcome.tab.state.label === "final", "success final: the actual original tab carries the final workflow");
  test.assert(outcome.saved && outcome.tab.state.statusKey === "saved", "success final: saved is announced only after persistence succeeds");
  test.assert(outcome.disk.chatFiles.find((file) => file.id === "d1")?.label === "final", "success final: the original final label is on disk");
  test.assert(outcome.reviewOpens === 1, "success final: the author enters Review Desk once after saving");
}

// Finalization may finish its original snapshot in the background. Its label
// rollback/success must never borrow a newly active project or document tab.
for (const switchProject of [true, false]) {
  for (const mode of ["success", "false"]) {
    const vmw = bootSaveDesk();
    const label = `final ${mode}, ${switchProject ? "project switch" : "document switch"}`;
    prepareSecondDocument(vmw, switchProject);
    holdRevision(vmw);
    vmw.run(`
      window.__diskMode = ${JSON.stringify(mode)};
      window.__finalizing = setTeachTextFileLabel("final", { confirmed: true, persist: true });
    `);
    test.assert(await vmw.waitFor(() => vmw.run("window.__revisionHeld")), `${label}: finalization is held inside its real revision write`);
    switchToSecondDocument(vmw, switchProject);
    vmw.run("window.__releaseRevision()");
    await vmw.run("window.__finalizing");
    await settleStorage(vmw);
    const outcome = vmw.run(`({
      before: window.__targetBefore,
      after: structuredClone(getActiveDocumentTab("teachText")),
      originalTab: structuredClone(projects.find((project) => project.id === "p1").documentTabs.find((tab) => tab.id === "t1")),
      source: chatFiles.find((file) => file.id === "d1"),
      target: chatFiles.find((file) => file.id === "d2"),
      body: teachTextBodyInput.value, label: teachTextFileLabel, workflow: teachTextWorkflowState,
      activeFile: activeTextFileId, reviewOpens: window.__reviewOpens,
      diskSource: window.__disk?.chatFiles.find((file) => file.id === "d1"),
    })`);
    test.assert(JSON.stringify(outcome.after) === JSON.stringify(outcome.before), `${label}: the newly active tab is byte-identical after the old finalize resumes`);
    test.assert(outcome.activeFile === "d2" && outcome.body === "second AUTHOR EDITS must stay untouched", `${label}: the second document keeps its own editor and identity`);
    test.assert(outcome.label === "draft" && outcome.workflow === "draft" && outcome.target.label === "draft", `${label}: the second document is never finalized`);
    test.assert(outcome.reviewOpens === 0, `${label}: finalization does not open Review Desk over the newly active document`);
    const expectedLabel = mode === "success" ? "final" : "draft";
    test.assert(outcome.source.label === expectedLabel && outcome.originalTab.state.workflowState === expectedLabel && outcome.originalTab.state.label === expectedLabel, `${label}: only the actual original tab and source receive the final or rollback result`);
    if (mode === "success") {
      test.assert(outcome.diskSource?.label === "final" && outcome.diskSource.body === "first AUTHOR EDITS retained for retry", `${label}: the original finalized snapshot is durably saved`);
    }
  }
}

// Confirmation belongs to the project/document the writer was asked about.
// Accepting it after a switch must neither finalize the replacement nor write
// the original snapshot as though the author were still looking at it.
for (const switchProject of [true, false]) {
  const vmw = bootSaveDesk();
  const label = `confirmation ${switchProject ? "project switch" : "document switch"}`;
  prepareSecondDocument(vmw, switchProject);
  vmw.run(`
    window.__confirmationHeld = false;
    window.__answerConfirmation = null;
    showSystemModal = async () => {
      window.__confirmationHeld = true;
      return new Promise((resolve) => { window.__answerConfirmation = resolve; });
    };
    window.__finalizing = setTeachTextFileLabel("final", { persist: true });
  `);
  test.assert(await vmw.waitFor(() => vmw.run("window.__confirmationHeld")), `${label}: the actual finalization confirmation is waiting`);
  switchToSecondDocument(vmw, switchProject);
  vmw.run('window.__answerConfirmation("yes")');
  await vmw.run("window.__finalizing");
  const outcome = currentOutcome(vmw);
  test.assert(outcome.diskCalls === 0 && outcome.reviewOpens === 0, `${label}: an obsolete confirmation writes nothing and enters no review`);
  test.assert(outcome.workflow === "draft" && outcome.label === "draft" && outcome.fileLabel === "draft", `${label}: the newly active document stays Draft`);
  test.assert(JSON.stringify(outcome.tab) === vmw.run("JSON.stringify(window.__targetBefore)"), `${label}: the new tab is unchanged by the obsolete confirmation`);
  test.assert(vmw.run('chatFiles.find((file) => file.id === "d1").label') === "draft", `${label}: the original document is not finalized after its author leaves`);
}

// Body, title and folder all use the real modified/capture listener. An input
// made while storage waits must remain unsaved even when the body is unchanged.
for (const [control, stateKey, latestValue] of [
  ["teachTextBodyInput", "body", "a NEWER author edit while saving"],
  ["teachTextNameInput", "name", "A newer document title"],
  ["teachTextFolderInput", "folder", "A newer destination folder"],
]) {
  const vmw = bootSaveDesk();
  const label = `new ${stateKey} input`;
  vmw.run(`
    window.__storageHeld = false;
    window.__releaseStorage = null;
    const actualPersist = persistDeskState;
    persistDeskState = async () => {
      window.__storageHeld = true;
      await new Promise((resolve) => { window.__releaseStorage = resolve; });
      return actualPersist();
    };
    window.__saving = saveTextDocument({ promptForFolder: false });
  `);
  test.assert(await vmw.waitFor(() => vmw.run("window.__storageHeld")), `${label}: save is waiting for durable storage`);
  vmw.typeInto(vmw.run(control), latestValue);
  vmw.run("window.__releaseStorage()");
  const saved = await vmw.run("window.__saving");
  const outcome = currentOutcome(vmw);
  test.assert(saved === true, `${label}: the earlier captured snapshot can finish saving`);
  test.assert(vmw.run(`${control}.value`) === latestValue && outcome.tab.state[stateKey] === latestValue, `${label}: the newer editor value and tab state remain intact`);
  test.assert(!outcome.saved && outcome.tab.state.statusKey === "modified", `${label}: the latest version is never reported saved by the older save`);
  test.assert(outcome.disk.chatFiles.find((file) => file.id === "d1")?.body === "first AUTHOR EDITS retained for retry", `${label}: the saved document snapshot is the version the save captured`);
}

test.finish();
