// @ts-check
// ClioProject 项目表 — the plan for one project, and it dies with that project.
//
// MacProject II's descendant here, and the naming law says what that means: a
// Clio- name marks an application, a plain noun marks a desk accessory. This is
// the application's model. The cross-project next-action list is a different
// object (To Do 待办, a desk accessory) and must not be folded into this one:
// a plan belongs to a project, a next action belongs to a person.
//
// **The plan is DERIVED, never stored.** Only what the writer decides is kept —
// whether a task is done, and a date they typed. The nodes and the arrows are
// computed from the route and from the Outline every time, exactly the way the
// outline tree is derived from Markdown. So there is no second copy to go
// stale, no migration when the Outline changes, and renaming a section cannot
// orphan its task.
//
// That is only safe because a section now carries its own id in its heading
// (`## 标题 {#a7f3c1}`). This object was correctly blocked on that: a plan whose
// tasks are string offsets gets rewritten the first time anyone reorders a
// section.
//
// **No durations, and therefore no critical path.** Aaron chose a bolded chain
// called "the chain blocking the handoff". It is the run of unfinished work
// between where the project actually is and the handoff — a real fact about the
// project. A critical path would need durations this product does not have and
// should not invent; naming it one would be a claim we cannot support.
//
// Pure: no DOM, no storage, no translations. The window is a separate file, so
// this half can be executed in a contract rather than looked at.
//
// Contract: tests/features/clio-project.test.mjs

const CLIO_PROJECT_SCHEMA_VERSION = 1;

// The route, in order, using the real window names so a node can open the stop
// it stands for. These are the eight stops CLAUDE.md calls the product.
const CLIO_PROJECT_ROUTE_STOPS = Object.freeze([
  Object.freeze({ id: "disk", window: "disk", labelKey: "project_disk" }),
  Object.freeze({ id: "rag", window: "rag", labelKey: "file_floppy" }),
  Object.freeze({ id: "questionSheet", window: "questionSheet", labelKey: "question_sheet" }),
  Object.freeze({ id: "outline", window: "outline", labelKey: "outline" }),
  Object.freeze({ id: "sectionDrafts", window: "sectionDrafts", labelKey: "section_drafts" }),
  Object.freeze({ id: "teachText", window: "teachText", labelKey: "teachtext" }),
  Object.freeze({ id: "reviewDesk", window: "reviewDesk", labelKey: "review_desk" }),
  Object.freeze({ id: "projectCd", window: "projectCd", labelKey: "project_cd" }),
]);

/** The stop the handoff happens at. The chain is measured up to this. */
const CLIO_PROJECT_HANDOFF_ID = "projectCd";

/** A section task's node id, namespaced so it can never collide with a stop. */
function clioProjectSectionNodeId(sectionId) {
  return `section:${String(sectionId || "")}`;
}

function blankClioProjectRecord() {
  return {
    schemaVersion: CLIO_PROJECT_SCHEMA_VERSION,
    tasks: {},
    updatedAt: "",
  };
}

/**
 * One task's stored half. `date` is whatever the writer typed and is never
 * parsed into a Date: the product has no scheduling and an invented timestamp
 * would be a precision it cannot honour.
 * @param {Record<string, any>} source
 */
function normalizeClioProjectTask(source = {}) {
  const value = source && typeof source === "object" ? source : {};
  return {
    done: value.done === true,
    doneAt: String(value.doneAt || ""),
    date: String(value.date || ""),
    note: String(value.note || ""),
  };
}

/** @param {Record<string, any>} source */
function normalizeClioProjectRecord(source = {}) {
  const value = source && typeof source === "object" ? source : {};
  const tasks = value.tasks && typeof value.tasks === "object" ? value.tasks : {};
  const normalized = {};
  Object.keys(tasks).forEach((key) => {
    const id = String(key || "");
    if (id) normalized[id] = normalizeClioProjectTask(tasks[id]);
  });
  return {
    schemaVersion: CLIO_PROJECT_SCHEMA_VERSION,
    tasks: normalized,
    updatedAt: String(value.updatedAt || ""),
  };
}

/**
 * The plan: nodes and the arrows between them, derived fresh every time.
 *
 * The eight stops are a chain. The Outline's `##` sections hang off Section
 * Drafts as a fan, because that is what they are — one draft per `##`, all of
 * them standing between the outline and the manuscript.
 *
 * @param {Record<string, any>} record the stored half
 * @param {{ sections?: any[] }} outline the derived outline tree
 */
function clioProjectPlan(record = {}, outline = {}) {
  const stored = normalizeClioProjectRecord(record);
  const sections = Array.isArray(outline?.sections) ? outline.sections : [];
  const taskFor = (id) => stored.tasks[id] || normalizeClioProjectTask({});

  const nodes = CLIO_PROJECT_ROUTE_STOPS.map((stop) => ({
    id: stop.id,
    kind: "stop",
    window: stop.window,
    labelKey: stop.labelKey,
    title: "",
    sectionId: "",
    ...taskFor(stop.id),
  }));

  // A section with no id cannot be addressed durably, so it is not given a
  // task. It appears the moment the Outline stamps it, which it does on sync.
  sections
    .filter((section) => section && String(section.id || ""))
    .forEach((section) => {
      const id = clioProjectSectionNodeId(section.id);
      nodes.push({
        id,
        kind: "section",
        window: "sectionDrafts",
        labelKey: "",
        title: String(section.title || section.heading || ""),
        sectionId: String(section.id),
        ...taskFor(id),
      });
    });

  const edges = [];
  for (let index = 1; index < CLIO_PROJECT_ROUTE_STOPS.length; index += 1) {
    edges.push({
      from: CLIO_PROJECT_ROUTE_STOPS[index - 1].id,
      to: CLIO_PROJECT_ROUTE_STOPS[index].id,
      kind: "route",
    });
  }
  nodes
    .filter((node) => node.kind === "section")
    .forEach((node) => {
      edges.push({ from: "sectionDrafts", to: node.id, kind: "section" });
      edges.push({ from: node.id, to: "teachText", kind: "section" });
    });

  return { nodes, edges };
}

/** @param {{nodes: any[]}} plan @param {string} id */
function clioProjectNode(plan, id) {
  const key = String(id || "");
  return (plan?.nodes || []).find((node) => node.id === key) || null;
}

/**
 * The chain blocking the handoff: every unfinished node from where the project
 * actually is, through to the handoff stop.
 *
 * "Where it actually is" is the first route stop still not done. Everything
 * from there to the handoff is still in the way, and a section under Section
 * Drafts is in the way too when that stop is. A finished stop later in the
 * route does not remove an earlier unfinished one from the chain — you cannot
 * hand off around a hole.
 *
 * Empty means nothing is blocking the handoff, which is a real answer and the
 * one worth showing plainly.
 *
 * @param {{nodes: any[]}} plan
 * @returns {string[]} node ids, in route order
 */
function clioProjectBlockingChain(plan) {
  const nodes = plan?.nodes || [];
  const stops = CLIO_PROJECT_ROUTE_STOPS.map(({ id }) => clioProjectNode(plan, id)).filter(Boolean);
  const firstUnfinished = stops.findIndex((node) => !node.done);
  if (firstUnfinished < 0) return [];

  const handoffIndex = CLIO_PROJECT_ROUTE_STOPS.findIndex((stop) => stop.id === CLIO_PROJECT_HANDOFF_ID);
  const chain = [];
  for (let index = firstUnfinished; index <= handoffIndex; index += 1) {
    const stop = stops[index];
    if (!stop || stop.done) continue;
    chain.push(stop.id);
    if (stop.id !== "sectionDrafts") continue;
    nodes
      .filter((node) => node.kind === "section" && !node.done)
      .forEach((node) => chain.push(node.id));
  }
  return chain;
}

/**
 * Finished work, for the collapsed "done" group. It leaves the diagram rather
 * than disappearing: a plan that hides what was finished stops being a record
 * of the project.
 * @param {{nodes: any[]}} plan
 */
function clioProjectDoneNodes(plan) {
  return (plan?.nodes || []).filter((node) => node.done);
}

/**
 * Tick or untick one task. Returns a new record; the caller persists it.
 * @param {Record<string, any>} record
 * @param {string} nodeId
 * @param {boolean} done
 * @param {string} now ISO timestamp, supplied so this stays pure
 */
function setClioProjectTaskDone(record, nodeId, done, now = "") {
  const next = normalizeClioProjectRecord(record);
  const id = String(nodeId || "");
  if (!id) return next;
  const task = normalizeClioProjectTask(next.tasks[id]);
  task.done = done === true;
  // Keep the moment it was finished, and clear it when it is unticked, so the
  // calendar view can never show a date for work that is no longer done.
  task.doneAt = task.done ? String(now || "") : "";
  next.tasks[id] = task;
  next.updatedAt = String(now || next.updatedAt);
  return next;
}

/**
 * A hand-typed date. Free text on purpose — see normalizeClioProjectTask.
 * @param {Record<string, any>} record
 * @param {string} nodeId
 * @param {string} date
 * @param {string} now
 */
function setClioProjectTaskDate(record, nodeId, date, now = "") {
  const next = normalizeClioProjectRecord(record);
  const id = String(nodeId || "");
  if (!id) return next;
  const task = normalizeClioProjectTask(next.tasks[id]);
  task.date = String(date || "").trim();
  next.tasks[id] = task;
  next.updatedAt = String(now || next.updatedAt);
  return next;
}

/**
 * Drop stored tasks whose node no longer exists — a section the writer deleted.
 * Called when the plan is read, so a deleted section does not keep a tick alive
 * forever in storage.
 * @param {Record<string, any>} record
 * @param {{nodes: any[]}} plan
 */
function pruneClioProjectRecord(record, plan) {
  const next = normalizeClioProjectRecord(record);
  const live = new Set((plan?.nodes || []).map((node) => node.id));
  Object.keys(next.tasks).forEach((id) => {
    if (!live.has(id)) delete next.tasks[id];
  });
  return next;
}

window.AISystem6ClioProject = Object.freeze({
  CLIO_PROJECT_HANDOFF_ID,
  CLIO_PROJECT_ROUTE_STOPS,
  CLIO_PROJECT_SCHEMA_VERSION,
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
});
