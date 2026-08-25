// ClioProject 项目表 — the plan for one project.
//
// The model half only. It is pure by design so that its correctness is provable
// here rather than by looking at a diagram, which matters because the diagram
// is not built yet: a node-and-arrow surface has to be seen before it can be
// called done, and this repo spent a day learning what happens when something
// is called done without being used.

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
    // No id: the Outline has not stamped it yet, so it cannot be addressed
    // durably and must not be given a task.
    { id: "", title: "Untitled so far" },
  ],
};

const empty = clioProjectPlan(blankClioProjectRecord(), outline);
test.assert(empty.nodes.length === 10, "eight stops plus the two stamped sections");
test.assert(
  !empty.nodes.some((node) => node.kind === "section" && !node.sectionId),
  "a section with no id gets no task, because nothing could point at it later"
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
  "and everything is available to fold into the done group"
);

// --- Dates are the writer's words ------------------------------------------
//
// Hand-typed and optional. Never parsed into a Date: this product does no
// scheduling, and a parsed timestamp would be precision it cannot honour.
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
