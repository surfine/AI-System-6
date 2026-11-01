// Two consecutive launches with no user work must leave the data identical.
//
// The TinyJS updater decides whether an update is healthy by comparing the
// candidate's ready fingerprint with the one the old application reported:
// `report.dataFingerprint === state.dataFingerprint`
// (platform/macos/tinyjs/src/node/update.cjs, `health()`), and the fingerprint
// hashes every store except the writer fence, the save epoch and the window
// session (apps/desktop/app/core/tinyjs-shell.js, `fingerprint()`). So a launch
// that rewrites a project record rolls a healthy update back.
//
// It used to: the working session's writing-flow restore runs on every boot and
// ends in savePipelineData(), which stamped the project (and the selected
// draft) whether or not anything had changed. The desk then wrote a record that
// differed from the previous launch's in exactly one field - updatedAt - and
// the candidate's ready fingerprint could never match the pre-install one.
//
// These run the real eager module set plus the real lazy writing-flow module in
// the boot VM, and compare records as the JSON a fingerprint reads.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("launch-data-stability");
const saved = "2026-01-01T00:00:00.000Z";

const projectSeed = (record) => `
  projects.length = 0; chatFiles.length = 0; chatFolders.length = 0; scraps.length = 0; trashItems.length = 0;
  projects.push(${record});
  activeProjectId = "p1"; selectedProjectId = "p1"; startupProjectId = "p1"; isProjectMounted = true;
  deskPersistenceWritable = true;
  saveDeskState = async () => true;
  renderTeachTextTabs = function noopTeachTextTabs() {};
  renderProjectDisks = function noopProjectDisks() {};
  renderDocuments = function noopDocuments() {};
  renderPipeline = function noopRenderPipeline() {};
`;

// The record a launch finds on disk: one this same save produced earlier.
const firstLaunchRecord = (() => {
  const tab = (id, role, order, extra = "") =>
    `{ id: "${id}", app: "teachText", role: "${role}", title: "T", backing: { type: "manuscript" }, state: {}, createdAt: "${saved}", updatedAt: "${saved}", order: ${order}${extra} }`;
  return `{ id: "p1", name: "Project Hard Disk", createdAt: "${saved}", updatedAt: "${saved}",
    questionSheet: "# Questions\\n", outline: "", drafts: [], scraps: [], archived: false,
    documentTabs: [ ${tab("manuscript-tab", "manuscript", 0)}, ${tab("tab-1", "scratch_file", 1)} ],
    activeDocumentTabIds: { reader: null, teachText: "tab-1", docMap: null, timeMachine: null } }`;
})();

/** A launch: the desk's project record, then the screen where the record says it is. */
async function launch(record) {
  const vmw = createAppBootVm();
  vmw.run(projectSeed(record));
  await vmw.run("typeof ensureWritingFlowModule === 'function' ? ensureWritingFlowModule() : null");
  await vmw.run("typeof whenLanguageReady === 'function' ? whenLanguageReady() : null");
  const outcome = await vmw.run(`
    (function () {
      if (typeof savePipelineData !== "function") return { missing: true };
      const project = getActiveProject();
      questionSheetBodyInput.value = project.questionSheet || "";
      outlineContentEl.value = currentOutlineMarkdown(project);
      draftTitleInput.value = "";
      draftBodyInput.value = "";
      selectedDraftIndex = -1;
      // The launch's own restore ends here.
      savePipelineData();
      return { missing: false, record: JSON.stringify(getActiveProject()) };
    })()
  `);
  return { vmw, ...outcome };
}

// Launch 1: the desk loads and saves once, producing the record a second launch
// would find. Its own save is allowed to be a change - it is the first one.
const first = await launch(firstLaunchRecord);
test.assert(!first.missing, "the writing-flow module loads in the boot VM and exposes savePipelineData()");
test.assert(typeof first.record === "string" && first.record.includes('"p1"'), "the first launch produces a project record");

// Launch 2: identical desk, no user work in between. This is the case the
// updater's health gate needs - and the case that used to fail.
const second = await launch(first.record);
test.assert(second.record === first.record,
  "a second launch rewrites nothing: the record is byte-identical to the one the first launch left");
test.assert(JSON.parse(second.record).updatedAt === JSON.parse(first.record).updatedAt,
  "the project's updatedAt is part of that record and does not move on an idle launch");

// Not an accident of one call: a save that has nothing to write stays silent.
const repeats = await second.vmw.run(`
  (function () {
    const snapshots = [];
    for (let i = 0; i < 3; i += 1) { savePipelineData(); snapshots.push(JSON.stringify(getActiveProject())); }
    return snapshots;
  })()
`);
test.assert(repeats.every((snapshot) => snapshot === repeats[0]),
  "repeated saves of an unchanged desk produce one record, not three timestamps");

// Static shape: both stamps sit behind one before/after comparison.
{
  const { read } = await import("../helpers/feature-test-harness.mjs");
  const source = read("app/features/writing-flow.js");
  const body = source.slice(source.indexOf("function savePipelineData("),
    source.indexOf("\nfunction getQuestionSheetTemplate("));
  const comparisons = [...body.matchAll(/JSON\.stringify\(project\)/g)].map((match) => match.index);
  const stamps = [...body.matchAll(/\.updatedAt = new Date\(\)\.toISOString\(\);/g)].map((match) => match.index);
  const reused = [...body.matchAll(/\.updatedAt = project\.updatedAt;/g)].map((match) => match.index);
  test.assert(comparisons.length === 2, "the save snapshots the record before its mutations and compares once after");
  test.assert(stamps.length === 1 && reused.length === 1,
    "one clock read: the project is stamped, and the changed draft reuses that same stamp");
  test.assert(stamps.every((index) => index > comparisons[1]) && reused.every((index) => index > comparisons[1]),
    "both stamps are inside the changed branch, after the comparison");
}

test.finish();
