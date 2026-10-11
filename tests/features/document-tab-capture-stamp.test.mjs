// A capture that writes back exactly what was already there is not a change.
//
// The update health check compares whole stores, so a launch that merely
// re-selected the tab already active and re-captured the same screen used to
// stamp the project's and the tab's updatedAt, rewrite the project record and
// report different data - which rolled a healthy update back. These run the
// real eager module set and the real capture functions in the boot VM; the
// record is compared as the JSON a fingerprint reads, not as a flag.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("document-tab-capture-stamp");
const saved = "2026-01-01T00:00:00.000Z";

const seedDesk = `
  projects.length = 0; chatFiles.length = 0; chatFolders.length = 0; scraps.length = 0; trashItems.length = 0;
  const seededTabState = { name: "Draft", folder: "", body: "kept text", statusKey: "saved", activeTextFileId: "f1" };
  projects.push({
    id: "p1", name: "Project Hard Disk", createdAt: "${saved}", updatedAt: "${saved}",
    questionSheet: "", outline: "", drafts: [], scraps: [],
    documentTabs: [
      { id: "manuscript-tab", app: "teachText", role: "manuscript", title: "Manuscript", backing: { type: "manuscript" }, state: { name: "Manuscript", folder: "", body: "", statusKey: "saved" }, createdAt: "${saved}", updatedAt: "${saved}", order: 0 },
      { id: "tab-1", app: "teachText", role: "scratch_file", title: "Draft", backing: { type: "scratch", id: "f1" }, state: seededTabState, createdAt: "${saved}", updatedAt: "${saved}", order: 1 },
      { id: "reader-tab", app: "reader", role: "source_view", title: "Source", backing: { type: "web", url: "https://example.org/a" }, state: {}, createdAt: "${saved}", updatedAt: "${saved}", order: 2 },
    ],
    activeDocumentTabIds: { reader: "reader-tab", teachText: "tab-1", docMap: null, timeMachine: null },
  });
  activeProjectId = "p1"; selectedProjectId = "p1"; startupProjectId = "p1"; isProjectMounted = true;
  deskPersistenceWritable = true;
  saveDeskState = async () => true;
  renderTeachTextTabs = function noopTeachTextTabs() {};
  renderProjectDisks = function noopProjectDisks() {};
  renderDocuments = function noopDocuments() {};
`;

/** Boot the desk, then put the editor on the same screen the tab already holds. */
function bootDesk() {
  const vmw = createAppBootVm();
  vmw.run(seedDesk);
  vmw.run(`
    // One projection pass, the way any read of the disk does it, then the
    // screen and the record are put in agreement - the state a launch resumes.
    getDocumentTabs("teachText", getActiveProject());
    teachTextLoadedTabId = "tab-1";
    teachTextNameInput.value = "Draft";
    teachTextFolderInput.value = "";
    teachTextBodyInput.value = "kept text";
    teachTextStatusEl.dataset.statusKey = "saved";
    teachTextDocumentRole = "scratch_file";
    activeTextFileId = "f1";
    captureActiveTeachTextTabState();
    currentReaderPage = { kind: "web", title: "Source", text: "read once", source: "https://example.org/a", url: "https://example.org/a", site: "example.org", author: "", date: "", fileName: "", videoTranscript: null };
    captureActiveReaderTabState();
    resetDeskStamps = () => {
      const project = getActiveProject();
      project.updatedAt = "${saved}";
      for (const tab of project.documentTabs) tab.updatedAt = "${saved}";
    };
  `);
  return vmw;
}

// A launch re-selects the tabs that were already active and re-captures the
// screen it restored. Nothing the writer wrote has moved, so the project
// record must serialize to the same bytes the fingerprint was taken from.
{
  const vmw = bootDesk();
  const outcome = vmw.run(`
    (() => {
      const project = getActiveProject();
      resetDeskStamps();
      const before = JSON.stringify(project);
      setActiveDocumentTab("teachText", "tab-1", project);
      setActiveDocumentTab("reader", "reader-tab", project);
      captureActiveTeachTextTabState();
      captureActiveReaderTabState();
      return {
        stable: JSON.stringify(project) === before,
        projectUpdatedAt: project.updatedAt,
        teachTextUpdatedAt: getActiveTeachTextDocumentTab().updatedAt,
        readerUpdatedAt: project.documentTabs.find((tab) => tab.id === "reader-tab").updatedAt,
      };
    })()
  `);
  test.assert(outcome.stable, "re-selecting and re-capturing the restored screen leaves the project record byte-identical");
  test.assert(outcome.projectUpdatedAt === saved && outcome.teachTextUpdatedAt === saved && outcome.readerUpdatedAt === saved,
    "neither the project nor the captured tabs take an updatedAt from a capture that changed nothing");
}

// The stamp still belongs to a real change: an edited body and a moved active
// tab both move the record and stamp it.
{
  const vmw = bootDesk();
  const outcome = vmw.run(`
    (() => {
      const project = getActiveProject();
      resetDeskStamps();
      teachTextBodyInput.value = "kept text and more";
      captureActiveTeachTextTabState();
      const bodyStamp = getActiveTeachTextDocumentTab().updatedAt;
      const bodyWritten = getActiveTeachTextDocumentTab().state.body === "kept text and more";
      project.documentTabs.push({ id: "tab-2", app: "teachText", role: "scratch_file", title: "Second", backing: { type: "scratch", id: "f2" }, state: {}, createdAt: "${saved}", updatedAt: "${saved}", order: 2 });
      setActiveDocumentTab("teachText", "tab-2", project);
      return { bodyStamp, bodyWritten, activeTab: project.activeDocumentTabIds.teachText, projectStamp: project.updatedAt };
    })()
  `);
  test.assert(outcome.bodyWritten && outcome.bodyStamp !== saved, "an edited body is written into the tab and stamps it");
  test.assert(outcome.activeTab === "tab-2" && outcome.projectStamp !== saved, "selecting a different tab moves the active id and stamps the project");
}

// The upsert path merges the values it is handed, so an upsert that hands the
// same values back is the same non-change.
{
  const vmw = bootDesk();
  const outcome = vmw.run(`
    (() => {
      const project = getActiveProject();
      const tab = project.documentTabs.find((item) => item.id === "tab-1");
      const state = JSON.parse(JSON.stringify(tab.state));
      resetDeskStamps();
      const before = JSON.stringify(project);
      upsertDocumentTab("teachText", "scratch_file", { title: tab.title, backing: tab.backing, state }, project);
      return { stable: JSON.stringify(project) === before };
    })()
  `);
  test.assert(outcome.stable, "re-upserting a tab with the values it already holds writes nothing");
}

// The reader's scroll position is part of its record: a real scroll still
// stamps, an unchanged one does not.
{
  const vmw = bootDesk();
  const outcome = vmw.run(`
    (() => {
      const project = getActiveProject();
      resetDeskStamps();
      const before = JSON.stringify(project);
      captureActiveReaderTabState();
      const unchanged = JSON.stringify(project) === before;
      readerContentEl.scrollTop = 120;
      captureActiveReaderTabState();
      const tab = getActiveDocumentTab("reader", project);
      return { unchanged, scrollTop: tab.state.scrollTop, stamp: tab.updatedAt };
    })()
  `);
  test.assert(outcome.unchanged, "an identical reader page capture writes nothing");
  test.assert(outcome.scrollTop === 120 && outcome.stamp !== saved, "a reader page that really changed is written and stamped");
}

// The helper is what the captures go through, and the four eager/lazy capture
// functions are all held to it.
{
  const { read } = await import("../helpers/feature-test-harness.mjs");
  const projectDisk = read("app/features/project-disk.js");
  const captures = [
    ["app/features/teachtext-accessories.js", "captureActiveTeachTextTabState"],
    ["app/features/reader.js", "captureActiveReaderTabState"],
    ["app/features/time-machine.js", "captureActiveTimeMachineTabState"],
    ["app/features/docmap.js", "captureActiveDocMapTabState"],
  ];
  test.assertIncludes(projectDisk, "function stampChanged(record, capture)", "the tab records' stamp lives in one helper");
  for (const [path, name] of captures) {
    const source = read(path);
    const body = source.slice(source.indexOf(`function ${name}(`), source.indexOf("\n}\n", source.indexOf(`function ${name}(`)));
    test.assert(body.includes("stampChanged(") && !body.includes("tab.updatedAt = new Date().toISOString()"),
      `${name} stamps only through the change-guarded helper`);
  }
}

test.finish();
