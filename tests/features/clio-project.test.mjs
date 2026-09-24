// ClioProject 项目表 — the plan for one project.
//
// The model half only. It is pure by design so that its correctness is provable
// here rather than by looking at a diagram. The diagram itself has its own
// contract (clio-project-window) and was rebuilt on 2026-09-23 after the first
// build drifted from the 08-21 spec: sections without a stamped id vanished,
// there were no own tasks, and nothing the record already knew was shown.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clio-project");

const context = vm.createContext({ window: {}, structuredClone });
vm.runInContext(read("app/core/clio-project.js"), context);
const plan = context.window.AISystem6ClioProject;
test.assert(!!plan, "the model installs itself");

const {
  blankClioProjectRecord,
  clioProjectBlockingChain,
  clioProjectDoneNodes,
  clioProjectNode,
  clioProjectPlan,
  clioProjectSectionNodeId,
  normalizeClioProjectRecord,
  pruneClioProjectRecord,
  setClioProjectTaskDate,
  setClioProjectTaskDone,
  setClioProjectTaskNote,
  addClioProjectOwnTask,
  updateClioProjectOwnTask,
  removeClioProjectOwnTask,
  answerClioProjectFirstLook,
  clioProjectRecordIsUntouched,
  clioProjectEvidence,
  clioProjectEvidencedDone,
  clioProjectOwnTasksOf,
  clioProjectPendingSectionNodeId,
  CLIO_PROJECT_ROUTE_STOPS,
} = plan;

// The route is the product, so the plan's spine is the route — in order, and
// naming real windows, because a node has to be able to open the stop it
// stands for.
test.assert(CLIO_PROJECT_ROUTE_STOPS.length === 8, "the eight stops of the route are the spine");
const registry = read("app/core/window-registry.js");
CLIO_PROJECT_ROUTE_STOPS.forEach((stop) => {
  test.assert(
    new RegExp(`\\n  ${stop.window}: \\{`).test(registry),
    `${stop.id} names a real window (${stop.window})`
  );
});

const outline = {
  sections: [
    { id: "a7f3c1", title: "The barrage road" },
    { id: "b2e9d4", title: "What the figure cannot say" },
    // No id: the Outline has not stamped it yet. It is drawn — a project whose
    // sections vanish looks like it has none — but nothing can be kept against
    // a position that will move.
    { id: "", title: "Untitled so far" },
  ],
};

const empty = clioProjectPlan(blankClioProjectRecord(), outline);
test.assert(empty.nodes.length === 11, "eight stops plus all three sections, stamped or not");
const pending = clioProjectNode(empty, clioProjectPendingSectionNodeId(2));
test.assert(pending?.kind === "section" && pending.title === "Untitled so far", "an unstamped section is drawn with its title");
test.assert(pending.addressable === false, "but it is not addressable");
test.assert(
  Object.keys(setClioProjectTaskDone(blankClioProjectRecord(), pending.id, true, "t").tasks).length === 0,
  "so ticking it keeps nothing, because nothing could point at it later"
);
test.assert(
  clioProjectNode(empty, clioProjectSectionNodeId("a7f3c1")).addressable === true,
  "a stamped section is addressable"
);
test.assert(
  clioProjectNode(empty, clioProjectSectionNodeId("a7f3c1"))?.title === "The barrage road",
  "a section node carries its title for display"
);
// The namespace is the whole reason a section can never collide with a stop.
test.assert(
  clioProjectSectionNodeId("outline") !== "outline",
  "a section id can never be mistaken for a route stop"
);

// Sections fan off Section Drafts and rejoin at the manuscript, because that is
// what a section draft is: one per ##, standing between the outline and the
// finished text.
const fan = empty.edges.filter((edge) => edge.kind === "section");
test.assert(
  fan.some((edge) => edge.from === "sectionDrafts" && edge.to === clioProjectSectionNodeId("a7f3c1")),
  "each section hangs off Section Drafts"
);
test.assert(
  fan.some((edge) => edge.from === clioProjectSectionNodeId("a7f3c1") && edge.to === "teachText"),
  "and rejoins at the manuscript"
);

// --- The plan is derived, never stored -------------------------------------
//
// The same property the outline tree has, and for the same reason: no second
// copy, no migration, and renaming or reordering a section cannot orphan its
// task. Only the writer's decisions are kept.
const stored = normalizeClioProjectRecord({ tasks: { outline: { done: true } } });
test.assert(
  !("nodes" in stored) && !("edges" in stored),
  "the stored record holds decisions only, never the diagram"
);
const renamed = clioProjectPlan(
  setClioProjectTaskDone(blankClioProjectRecord(), clioProjectSectionNodeId("a7f3c1"), true, "2026-08-22T00:00:00.000Z"),
  { sections: [{ id: "a7f3c1", title: "A completely different title" }] }
);
test.assert(
  clioProjectNode(renamed, clioProjectSectionNodeId("a7f3c1"))?.done === true,
  "renaming a section keeps its task, because the id is what the task points at"
);

// --- The chain blocking the handoff ----------------------------------------
//
// Not a critical path, and it must never be called one: that needs durations
// this product does not have. It is the run of unfinished work between where
// the project actually is and the handoff.
const source = read("app/core/clio-project.js");
test.assertNotIncludes(source, "criticalPath", "the model does not claim a critical path");

const fresh = clioProjectPlan(blankClioProjectRecord(), outline);
const freshChain = clioProjectBlockingChain(fresh);
test.assert(freshChain[0] === "disk", "an untouched project is blocked from its first stop");
test.assert(freshChain[freshChain.length - 1] === "projectCd", "and the chain runs to the handoff");
test.assert(
  freshChain.includes(clioProjectSectionNodeId("a7f3c1")),
  "an unfinished section is in the way too, because Section Drafts is"
);

let record = blankClioProjectRecord();
["disk", "rag", "questionSheet", "outline"].forEach((id) => {
  record = setClioProjectTaskDone(record, id, true, "2026-08-22T00:00:00.000Z");
});
const midway = clioProjectBlockingChain(clioProjectPlan(record, outline));
test.assert(midway[0] === "sectionDrafts", "finished stops leave the chain");
test.assert(!midway.includes("outline"), "and do not come back");

// You cannot hand off around a hole: finishing a later stop does not excuse an
// earlier one. This is the assertion that keeps the chain honest.
let skipped = setClioProjectTaskDone(blankClioProjectRecord(), "reviewDesk", true, "2026-08-22T00:00:00.000Z");
const skippedChain = clioProjectBlockingChain(clioProjectPlan(skipped, outline));
test.assert(skippedChain[0] === "disk", "an early unfinished stop still blocks");
test.assert(!skippedChain.includes("reviewDesk"), "while the finished later stop is not itself in the way");

// Nothing blocking is a real answer, and worth being able to say plainly.
let finished = blankClioProjectRecord();
clioProjectPlan(finished, outline).nodes.forEach((node) => {
  finished = setClioProjectTaskDone(finished, node.id, true, "2026-08-22T00:00:00.000Z");
});
test.assert(
  clioProjectBlockingChain(clioProjectPlan(finished, outline)).length === 0,
  "a finished project has an empty chain, not a chain of one"
);
test.assert(
  clioProjectDoneNodes(clioProjectPlan(finished, outline)).length === 10,
  "and everything addressable is available to fold into the done pile"
);

// --- Dates are the writer's words ------------------------------------------
//
// Hand-typed and optional, and stored verbatim. The model never parses them:
// reading an unambiguous one back as a day belongs to the desk's risk mark
// (projectHandDateDay), which never rewrites what the writer typed.
const dated = setClioProjectTaskDate(blankClioProjectRecord(), "projectCd", "  before the trip  ", "2026-08-22T00:00:00.000Z");
test.assert(dated.tasks.projectCd.date === "before the trip", "a typed date is kept verbatim, trimmed");
test.assertNotIncludes(source, "new Date(", "no date string is ever parsed into a Date");

// Unticking clears the moment it was finished, so a calendar can never show a
// date for work that is no longer done.
const unticked = setClioProjectTaskDone(
  setClioProjectTaskDone(blankClioProjectRecord(), "outline", true, "2026-08-22T00:00:00.000Z"),
  "outline",
  false,
  "2026-08-22T01:00:00.000Z"
);
test.assert(unticked.tasks.outline.doneAt === "", "unticking clears doneAt");

// A deleted section must not keep a tick alive forever in storage.
const pruned = pruneClioProjectRecord(
  setClioProjectTaskDone(blankClioProjectRecord(), clioProjectSectionNodeId("gone99"), true, "2026-08-22T00:00:00.000Z"),
  clioProjectPlan(blankClioProjectRecord(), outline)
);
test.assert(
  !pruned.tasks[clioProjectSectionNodeId("gone99")],
  "a task whose section was deleted is dropped when the plan is read"
);

// --- The writer's own tasks ---------------------------------------------------
//
// Hung off a section or a stop, two levels and no deeper. A task is the
// writer's words, so a structural change never drops it: when its section is
// deleted it re-hangs on Section Drafts and remembers where it came from.
const sectionA = clioProjectSectionNodeId("a7f3c1");
let own = addClioProjectOwnTask(blankClioProjectRecord(), { id: "task:1", title: "  Check the 2005 quote  ", parent: sectionA, parentTitle: "The barrage road" }, "t1");
test.assert(own.ownTasks.length === 1 && own.ownTasks[0].title === "Check the 2005 quote", "a task is kept, trimmed");
test.assert(own.schemaVersion === 2, "the record is schema 2");
test.assert(
  addClioProjectOwnTask(own, { id: "task:2", title: "Deeper", parent: "task:1" }, "t").ownTasks.length === 1,
  "a task cannot hang from another task"
);
test.assert(
  addClioProjectOwnTask(own, { id: "task:3", title: "Pending", parent: clioProjectPendingSectionNodeId(2) }, "t").ownTasks.length === 1,
  "nor from a section that cannot be addressed yet"
);
const ownPlan = clioProjectPlan(own, outline);
test.assert(clioProjectOwnTasksOf(ownPlan, sectionA).map((node) => node.id).join() === "task:1", "the task hangs under its section");
test.assert(ownPlan.edges.some((edge) => edge.kind === "own" && edge.from === sectionA && edge.to === "task:1"), "with an edge of its own kind");
const ownChain = clioProjectBlockingChain(ownPlan);
test.assert(ownChain.indexOf("task:1") === ownChain.indexOf(sectionA) + 1, "an unfinished task under a blocking section blocks too, right after it");

own = setClioProjectTaskDate(own, "task:1", " Friday ", "t2");
own = setClioProjectTaskNote(own, "task:1", "ask the archive", "t3");
own = setClioProjectTaskDone(own, "task:1", true, "t4");
test.assert(own.ownTasks[0].date === "Friday" && own.ownTasks[0].note === "ask the archive" && own.ownTasks[0].doneAt === "t4", "date, note and tick reach the task through the same calls a stop uses");
test.assert(!clioProjectBlockingChain(clioProjectPlan(own, outline)).includes("task:1"), "a finished task leaves the chain");
own = updateClioProjectOwnTask(own, "task:1", { title: "   " }, "t5");
test.assert(own.ownTasks[0].title === "Check the 2005 quote", "a blank rename keeps the old title rather than leaving a nameless task");

const withoutSection = { sections: [{ id: "b2e9d4", title: "What the figure cannot say" }] };
const orphaned = pruneClioProjectRecord(own, clioProjectPlan(own, withoutSection));
test.assert(orphaned.ownTasks.length === 1, "deleting a section never deletes a task hung from it");
test.assert(orphaned.ownTasks[0].parent === "sectionDrafts", "the task re-hangs on Section Drafts");
test.assert(orphaned.ownTasks[0].orphanedFrom === "The barrage road", "and remembers the section it came from");
test.assert(removeClioProjectOwnTask(orphaned, "task:1", "t6").ownTasks.length === 0, "only the writer removes a task");

// --- Evidence, and the one question it may ask -----------------------------
//
// Facts come from records the project already has, as data the window words.
// They propose ticks exactly once — when nothing has ever been decided — and
// the writer's answer, even "none", closes the question for good.
const project = {
  id: "p1",
  questionSheet: "Who was on the platform?",
  drafts: [
    { sectionId: "a7f3c1", body: "Draft one text", usedClips: [1, 2], insertedAt: "2026-09-01" },
    { sourceOutlineSection: "What the figure cannot say", body: "", usedClips: [] },
  ],
  flowState: { check: false },
};
const evidence = clioProjectEvidence({
  project,
  outline,
  files: [{}, {}],
  cdItems: [{ projectId: "p1", createdAt: "2026-09-11T00:00:00Z" }, { projectId: "other" }],
});
const factKeys = (id) => (evidence[id] || []).map((fact) => fact.key).join();
test.assert(factKeys("disk") === "files" && evidence.disk[0].count === 2, "the disk says how many files it holds");
test.assert(evidence.rag[0].count === 2, "the File Floppy says how many clippings the drafts cited");
test.assert(factKeys(sectionA) === "chars,clips_cited,in_manuscript", "a section says its length, its clippings, and that it reached the manuscript");
test.assert(evidence[sectionA][0].count === 12, "length counts characters, not whitespace");
test.assert(!evidence[clioProjectSectionNodeId("b2e9d4")], "an empty draft claims nothing");
test.assert(factKeys(clioProjectPendingSectionNodeId(2)) === "awaiting_stamp", "an unstamped section says why it cannot be ticked");
test.assert(evidence.sectionDrafts[0].count === 1 && evidence.sectionDrafts[0].total === 3, "Section Drafts says how many of its sections have drafts");
test.assert(evidence.projectCd[0].count === 1, "only this project's discs count");
test.assert(!evidence.reviewDesk, "a review that has not run is not claimed");

const proposed = clioProjectEvidencedDone(empty, evidence);
test.assert(proposed.join() === "disk,rag,questionSheet,outline,section:a7f3c1,projectCd", "the first-open question proposes only stops with evidence, in route order");
test.assert(!proposed.includes("sectionDrafts"), "a stop is proposed only when its evidence is complete, not merely begun");
test.assert(clioProjectRecordIsUntouched(blankClioProjectRecord()), "an untouched plan may be asked");
const answeredNone = answerClioProjectFirstLook(blankClioProjectRecord(), [], "t7");
test.assert(!clioProjectRecordIsUntouched(answeredNone), "answering none still closes the question");
test.assert(Object.keys(answeredNone.tasks).length === 0, "and ticks nothing");
const answered = answerClioProjectFirstLook(blankClioProjectRecord(), ["disk", "outline"], "t8");
test.assert(answered.tasks.disk.done && answered.tasks.outline.done && !answered.tasks.rag, "the answer ticks exactly what the writer kept checked");
test.assert(normalizeClioProjectRecord({ tasks: {} }).ownTasks.length === 0, "a version-1 record reads as version 2 with no tasks");

// --- The one thing still missing ---------------------------------------------
//
// Busy writers tick nothing, so the overview's sentence is worked out from the
// record's evidence; a node the writer did tick outranks the evidence.
{
  const { clioProjectNextStep } = plan;
  const two = { sections: [{ id: "a1", title: "One" }, { id: "b2", title: "Two" }] };
  const blank = clioProjectPlan(blankClioProjectRecord(), two);
  test.assert(clioProjectNextStep(blank, {}).key === "sheet", "nothing on record: the Question Sheet is what is missing");
  const sheet = { questionSheet: [{ key: "chars", count: 120 }] };
  test.assert(clioProjectNextStep(clioProjectPlan(blankClioProjectRecord(), { sections: [] }), sheet).key === "outline", "a sheet but no sections: the Outline");
  const halfWritten = clioProjectNextStep(blank, { ...sheet, "section:a1": [{ key: "chars", count: 900 }] });
  test.assert(halfWritten.key === "unwritten" && halfWritten.count === 1 && halfWritten.titles[0] === "Two", "an unwritten section is named");
  const written = { ...sheet, "section:a1": [{ key: "chars", count: 9 }, { key: "in_manuscript" }], "section:b2": [{ key: "chars", count: 9 }] };
  const outside = clioProjectNextStep(blank, written);
  test.assert(outside.key === "uninserted" && outside.titles.join() === "Two", "a written section outside the manuscript is named");
  const inserted = { ...written, "section:b2": [{ key: "chars", count: 9 }, { key: "in_manuscript" }] };
  test.assert(clioProjectNextStep(blank, inserted).key === "review", "all in the manuscript, not reviewed: review");
  test.assert(clioProjectNextStep(blank, { ...inserted, reviewDesk: [{ key: "reviewed" }] }).key === "burn", "reviewed, nothing burned: the CD");
  test.assert(clioProjectNextStep(blank, { ...inserted, reviewDesk: [{ key: "reviewed" }], projectCd: [{ key: "burned", count: 1 }] }).key === "ready", "reviewed and burned: ready");
  const tickedSheet = clioProjectPlan(setClioProjectTaskDone(blankClioProjectRecord(), "questionSheet", true, "t"), two);
  test.assert(clioProjectNextStep(tickedSheet, {}).key !== "sheet", "the writer's tick outranks the missing evidence");
}

// --- What this object is, and is not ---------------------------------------
//
// ClioProject is the plan for ONE project and dies with it. The cross-project
// next-action list is a separate object — To Do 待办, a desk accessory — and
// folding them together would break the naming law the code already follows:
// Clio- marks an application, a plain noun marks a desk accessory.
test.assert(
  !/window\.|document\.(?!.*@ts)/.test(source.replace(/window\.AISystem6ClioProject/g, "")),
  "the model touches no DOM, which is why it can be proven here instead of looked at"
);

test.finish();
