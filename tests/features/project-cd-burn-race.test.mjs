// Burning to the Project CD is an awaited operation: the pre-burn version
// history is written first, and only then does the file land on the CD. The
// desk is free to move during that wait - another burn inserts a file, the
// writer switches project, the file being replaced is deleted or renamed.
//
// The operation therefore has to carry identities, not positions, and decide
// what it is replacing inside the commit queue. These run the real Project
// Store commit path (queue, draft, in-place merge, rollback) in a VM and stub
// only the transaction, which is where "the disk" is observed.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("project-cd-burn-race");

// Two disks, one mounted, and the CD writable. `renderProjectCd` and the burn's
// own repaint are DOM work that the store contract does not depend on.
const seedDesk = (cdItems = "") => `
  projects.length = 0;
  projects.push(
    { id: "p1", name: "P1", title: "P1", questionSheet: "", outline: "", drafts: [] },
    { id: "p2", name: "P2", title: "P2", questionSheet: "", outline: "", drafts: [] }
  );
  projectCdItems.length = 0;
  ${cdItems}
  activeProjectId = "p1";
  selectedProjectId = "p1";
  startupProjectId = "p1";
  isProjectMounted = true;
  deskPersistenceWritable = true;
  activeTextFileId = "doc-1";
  renderPipeline = function noopRenderPipeline() {};
  renderProjectCd = function noopRenderProjectCd() {};
  renderDocuments = function noopRenderDocuments() {};
  renderProjectDisks = function noopRenderProjectDisks() {};
  window.__status = "";
  setStatus = function captureStatus(message) { window.__status = String(message || ""); };
  window.AISystem6Perf = { start: () => () => {} };
  window.AISystem6DerivedIndexQueue = { afterProjectCommit: () => {} };
  // The transaction: whatever the commit applied is what the disk holds. The
  // count keeps "nothing was written" checkable.
  window.__persists = 0;
  window.__disk = null;
  persistDeskState = async () => {
    window.__persists += 1;
    window.__disk = structuredClone(projectCdItems);
    return true;
  };
  // The pre-burn version history, which is the real wait in this operation.
  let revisionGateNext = false;
  let revisionFailsNext = false;
  let releaseRevisionGate = () => {};
  const revisionEntered = { held: false };
  const revisionReleased = new Promise((resolve) => { releaseRevisionGate = resolve; });
  window.__revisionCalls = 0;
  window.__holdNextRevision = () => {
    revisionGateNext = true;
    revisionEntered.held = false;
  };
  window.__revisionHeld = () => revisionEntered.held;
  window.__releaseRevision = () => releaseRevisionGate();
  window.__failRevisions = () => { revisionFailsNext = true; };
  createDocumentRevision = async () => {
    window.__revisionCalls += 1;
    if (revisionFailsNext) {
      revisionFailsNext = false;
      throw new Error("the pre-burn revision could not be saved");
    }
    if (revisionGateNext) {
      revisionGateNext = false;
      revisionEntered.held = true;
      await revisionReleased;
    }
    return { id: "rev-x" };
  };
`;

const cdSeed = (entries) => entries
  .map(([id, title, body]) => `projectCdItems.push({ id: ${JSON.stringify(id)}, projectId: "p1", title: ${JSON.stringify(title)}, body: ${JSON.stringify(body)}, format: "text/markdown", burnedAt: "2026-09-01T00:00:00.000Z" });`)
  .join("\n  ");

/** Waits until the burn is standing inside the pre-burn revision write. */
async function waitForRevision(vmw) {
  return vmw.run(`
    (async () => {
      for (let index = 0; index < 500 && !window.__revisionHeld(); index += 1) await Promise.resolve();
      return window.__revisionHeld();
    })()
  `);
}

function bootDesk(cdItems = "") {
  const vmw = createAppBootVm();
  vmw.run(seedDesk(cdItems));
  return vmw;
}

// --- The reviewed race: overwrite B while another burn inserts C -------------

{
  const vmw = bootDesk(cdSeed([["A", "A.md", "old-A"], ["B", "B.md", "old-B"]]));
  await vmw.run(`window.__holdNextRevision(); window.__burnB = addProjectCdItem("new-B", "B"); "started";`);
  const held = await waitForRevision(vmw);
  const inserted = await vmw.run(`
    addProjectCdItem("new-C", "C").then(
      (item) => ({ title: item?.title || null }),
      (error) => ({ error: String(error) })
    )
  `);
  await vmw.run(`window.__releaseRevision();`);
  const outcome = await vmw.run(`
    (async () => {
      const burned = await window.__burnB;
      const titles = window.__disk.map((item) => item.title);
      const ids = window.__disk.map((item) => item.id);
      return {
        burnedTitle: burned?.title || null,
        burnedBody: burned?.body || null,
        burnedId: burned?.id || null,
        titles,
        ids,
        target: window.__disk.find((item) => item.title === "B.md") || null,
        duplicateTitles: titles.filter((title, index) => titles.indexOf(title) !== index),
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      };
    })()
  `);
  test.assert(held === true, "the burn waits inside the pre-burn version history");
  test.assert(inserted.title === "C.md", "the second burn lands while the first one is waiting");
  test.assert(
    outcome.titles.includes("A.md") && outcome.titles.includes("C.md") && outcome.titles.includes("B.md"),
    `A, B and C are all on the CD after the overwrite resumes (${outcome.titles.join(",")})`
  );
  test.assert(
    outcome.duplicateTitles.length === 0 && outcome.duplicateIds.length === 0,
    "no file is duplicated by title or by id"
  );
  test.assert(
    outcome.target?.id === "B" && outcome.target?.body === "new-B",
    "the target keeps its identity and holds the new body exactly once"
  );
  test.assert(
    outcome.burnedId === "B" && outcome.burnedBody === "new-B",
    "the burn hands back the record that is really on the CD"
  );
}

// --- The wait crosses a project switch ---------------------------------------

{
  const vmw = bootDesk(cdSeed([["B", "B.md", "old-B"]]));
  await vmw.run(`window.__holdNextRevision(); window.__burnB = addProjectCdItem("new-B", "B"); "started";`);
  await waitForRevision(vmw);
  // The writer mounts the other disk while the burn waits for its version
  // history. The burn belongs to the disk it started on.
  await vmw.run(`
    (async () => {
      activeProjectId = "p2";
      selectedProjectId = "p2";
      startupProjectId = "p2";
      await saveDeskState();
      return "switched";
    })()
  `);
  await vmw.run(`window.__releaseRevision();`);
  const outcome = await vmw.run(`
    (async () => {
      const burned = await window.__burnB;
      const byProject = {};
      projectCdItems.forEach((item) => { byProject[item.projectId] = (byProject[item.projectId] || []).concat(item.title); });
      return { burnedProject: burned?.projectId || null, byProject, activeProjectId };
    })()
  `);
  test.assert(
    outcome.burnedProject === "p1" && outcome.byProject.p1?.join(",") === "B.md",
    "the burn lands on the project it started on, not the one now mounted"
  );
  test.assert(
    !outcome.byProject.p2,
    "the project the writer switched to receives nothing from the waiting burn"
  );
}

// --- The target is deleted while the burn waits -------------------------------

{
  const vmw = bootDesk(cdSeed([["A", "A.md", "old-A"], ["B", "B.md", "old-B"]]));
  await vmw.run(`window.__holdNextRevision(); window.__burnB = addProjectCdItem("new-B", "B"); "started";`);
  await waitForRevision(vmw);
  await vmw.run(`
    (async () => {
      await window.AISystem6StateStores.projects.commit((draft) => {
      const index = draft.projectCdItems.findIndex((item) => item.id === "B");
      if (index >= 0) draft.projectCdItems.splice(index, 1);
      });
      return "committed";
    })()
  `);
  await vmw.run(`window.__releaseRevision();`);
  const outcome = await vmw.run(`
    (async () => {
      const burned = await window.__burnB;
      const ids = window.__disk.map((item) => item.id);
      return {
        burnedId: burned?.id || null,
        titles: window.__disk.map((item) => item.title),
        ids,
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        reborn: window.__disk.filter((item) => item.id === "B").length,
      };
    })()
  `);
  test.assert(
    outcome.reborn === 0 && outcome.burnedId !== "B",
    "a deleted target is not quietly rebuilt under the id it had"
  );
  test.assert(
    outcome.titles.includes("A.md") && outcome.titles.includes("B.md"),
    "the burn still lands as a new file and the untouched file stays"
  );
  test.assert(outcome.duplicateIds.length === 0, "the new record does not collide with any other id");
}

// --- The target is renamed while the burn waits -------------------------------

{
  const vmw = bootDesk(cdSeed([["B", "B.md", "old-B"]]));
  await vmw.run(`window.__holdNextRevision(); window.__burnB = addProjectCdItem("new-B", "B"); "started";`);
  await waitForRevision(vmw);
  await vmw.run(`
    (async () => {
      await window.AISystem6StateStores.projects.commit((draft) => {
      const target = draft.projectCdItems.find((item) => item.id === "B");
      if (target) target.title = "B-renamed.md";
      });
      return "committed";
    })()
  `);
  await vmw.run(`window.__releaseRevision();`);
  const outcome = await vmw.run(`
    (async () => {
      const burned = await window.__burnB;
      const ids = window.__disk.map((item) => item.id);
      const renamed = window.__disk.find((item) => item.title === "B-renamed.md") || null;
      const fresh = window.__disk.find((item) => item.title === "B.md") || null;
      return {
        burnedId: burned?.id || null,
        renamed,
        fresh,
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      };
    })()
  `);
  test.assert(
    outcome.renamed?.id === "B" && outcome.renamed?.body === "old-B",
    "the record renamed away from the file name is not rewritten by the burn"
  );
  test.assert(
    outcome.fresh?.body === "new-B" && outcome.fresh?.id !== "B",
    "the burn lands as its own file with its own identity"
  );
  test.assert(outcome.duplicateIds.length === 0, "two records never share one id");
}

// --- Two burns of one file name, started together -----------------------------

{
  const vmw = bootDesk();
  const outcome = await vmw.run(`
    (async () => {
      const first = addProjectCdItem("first body", "One");
      const second = addProjectCdItem("second body", "One");
      const results = await Promise.all([first, second]);
      const ones = projectCdItems.filter((item) => item.title === "One.md");
      const ids = projectCdItems.map((item) => item.id);
      return {
        results: results.map((item) => item?.body || null),
        count: ones.length,
        bodies: ones.map((item) => item.body),
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        persistedCount: window.__disk.filter((item) => item.title === "One.md").length,
      };
    })()
  `);
  test.assert(outcome.count === 1, "two burns of one file name converge on one record");
  test.assert(outcome.persistedCount === 1, "the disk holds that one record, not two");
  test.assert(
    outcome.bodies[0] === "second body" || outcome.bodies[0] === "first body",
    "the surviving record carries one of the two burns rather than an older version"
  );
  test.assert(outcome.duplicateIds.length === 0, "the record ids stay unique");
}

// --- A failed pre-burn revision writes nothing --------------------------------

{
  const vmw = bootDesk(cdSeed([["A", "A.md", "old-A"], ["B", "B.md", "old-B"]]));
  const outcome = await vmw.run(`
    (async () => {
      window.__failRevisions();
      const burned = await addProjectCdItem("new-B", "B");
      return {
        burned,
        titles: projectCdItems.map((item) => item.title),
        body: projectCdItems.find((item) => item.id === "B")?.body || null,
        persists: window.__persists,
        status: window.__status,
      };
    })()
  `);
  test.assert(outcome.burned === null, "a failed version history returns no burn");
  test.assert(outcome.body === "old-B", "the CD record is left exactly as it was");
  test.assert(outcome.persists === 0, "nothing is written to the disk at all");
  test.assert(
    /版本历史|version history/i.test(outcome.status),
    "the failure is reported in words rather than as a burn"
  );
}

// --- The whole project disappears while the burn waits ------------------------

{
  const vmw = bootDesk(cdSeed([["A", "A.md", "old-A"]]));
  await vmw.run(`window.__holdNextRevision(); window.__burnB = addProjectCdItem("new-B", "B"); "started";`);
  await waitForRevision(vmw);
  await vmw.run(`
    (async () => {
      await window.AISystem6StateStores.projects.commit((draft) => {
      const index = draft.projects.findIndex((project) => project.id === "p1");
      if (index >= 0) draft.projects.splice(index, 1);
      const cdIndex = draft.projectCdItems.findIndex((item) => item.projectId === "p1");
      if (cdIndex >= 0) draft.projectCdItems.splice(cdIndex, 1);
      });
      return "committed";
    })()
  `);
  await vmw.run(`window.__releaseRevision();`);
  const outcome = await vmw.run(`
    (async () => {
      const burned = await window.__burnB;
      return { burned, status: window.__status, orphans: window.__disk.filter((item) => item.projectId === "p1").length };
    })()
  `);
  test.assert(outcome.burned === null, "a burn whose project was removed while it waited is refused");
  test.assert(outcome.orphans === 0, "no CD file is left behind for a disk that is gone");
}

test.finish();
