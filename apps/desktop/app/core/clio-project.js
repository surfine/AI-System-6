// @ts-check
// ClioProject 项目表 — the plan for one project, and it dies with that project.
//
// MacProject II's descendant here, and the naming law says what that means: a
// Clio- name marks an application, a plain noun marks a desk accessory. This is
// the application's model. The cross-project next-action list is a different
// object and must not be folded into this one: a plan belongs to a project, a
// next action belongs to a person.
//
// **The plan is DERIVED, never stored.** Only what the writer decides is kept —
// whether a task is done, a date they typed, a note, and the tasks they hung
// off a section or a stop themselves. The route's nodes and the arrows are
// computed from the route and from the Outline every time, exactly the way the
// outline tree is derived from Markdown. So there is no second copy to go
// stale, no migration when the Outline changes, and renaming a section cannot
// orphan its task.
//
// That is only safe because a section carries its own id in its heading
// (`## 标题 {#a7f3c1}`). A section the Outline has not stamped yet is still
// DRAWN — hiding it made a six-section project look like it had none — but it
// is not addressable, so it cannot be ticked until the stamp arrives.
//
// **No durations, and therefore no critical path.** Aaron chose a bolded chain
// called "the chain blocking the handoff". It is the run of unfinished work
// between where the project actually is and the handoff — a real fact about the
// project. A critical path would need durations this product does not have and
// should not invent; naming it one would be a claim we cannot support.
//
// **Evidence is shown, never ticked for you.** Every node can say one true
// thing the project record already knows ("976 chars · 7 clippings cited ·
// in the manuscript"). Whether that means the work is finished is the writer's
// call; the only place evidence proposes ticks is the one-time question asked
// when a plan has never been touched, and the writer answers it.
//
// Pure: no DOM, no storage, no translations, no clock. The window is a
// separate file, so this half can be executed in a contract rather than
// looked at.
//
// Contract: tests/features/clio-project.test.mjs

const CLIO_PROJECT_SCHEMA_VERSION = 2;

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

/** The stop the handoff happens at. The chain is measured up to this, and its date is the handoff date. */
const CLIO_PROJECT_HANDOFF_ID = "projectCd";

/** Where a task goes when the section it hung from is deleted. */
const CLIO_PROJECT_ORPHAN_PARENT = "sectionDrafts";

/** A section task's node id, namespaced so it can never collide with a stop. */
function clioProjectSectionNodeId(sectionId) {
  return `section:${String(sectionId || "")}`;
}

/** A section the Outline has not stamped yet: drawn, never stored. */
function clioProjectPendingSectionNodeId(index) {
  return `section-pending:${Number(index) || 0}`;
}

function blankClioProjectRecord() {
  return {
    schemaVersion: CLIO_PROJECT_SCHEMA_VERSION,
    tasks: {},
    ownTasks: [],
    firstLookAnswered: "",
    updatedAt: "",
  };
}

/**
 * One task's stored half. `date` is whatever the writer typed and is kept
 * verbatim: the product has no scheduling. Reading an unambiguous date back
 * out of it is the desk's job (projectHandDateDay), never a rewrite of what
 * the writer wrote.
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

/**
 * A task the writer hung off a section or a stop. `parentTitle` is the name
 * of what it hung from when it was made, so a task whose section is deleted
 * can still say where it came from after it re-hangs on Section Drafts.
 * @param {Record<string, any>} source
 */
function normalizeClioProjectOwnTask(source = {}) {
  const value = source && typeof source === "object" ? source : {};
  return {
    id: String(value.id || ""),
    title: String(value.title || ""),
    parent: String(value.parent || ""),
    parentTitle: String(value.parentTitle || ""),
    orphanedFrom: String(value.orphanedFrom || ""),
    ...normalizeClioProjectTask(value),
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
  // Version 1 had no own tasks; reading it as version 2 is simply an empty
  // list, so there is nothing to migrate.
  const ownTasks = (Array.isArray(value.ownTasks) ? value.ownTasks : [])
    .map(normalizeClioProjectOwnTask)
    .filter((task) => task.id && task.parent);
  return {
    schemaVersion: CLIO_PROJECT_SCHEMA_VERSION,
    tasks: normalized,
    ownTasks,
    // When the writer answered the first-open question, either way. Its only
    // job is to make sure that question is asked once.
    firstLookAnswered: String(value.firstLookAnswered || ""),
    updatedAt: String(value.updatedAt || ""),
  };
}

/** True when the writer has never decided anything here — the one moment evidence may propose ticks. */
function clioProjectRecordIsUntouched(record = {}) {
  const stored = normalizeClioProjectRecord(record);
  return !stored.firstLookAnswered && !Object.keys(stored.tasks).length && !stored.ownTasks.length;
}

/**
 * The plan: nodes and the arrows between them, derived fresh every time.
 *
 * The eight stops are a chain. The Outline's `##` sections hang off Section
 * Drafts as a fan and rejoin at the manuscript, because that is what they are
 * — one draft per `##`, all of them standing between the outline and the
 * manuscript. The writer's own tasks hang under whatever they were hung from.
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
    addressable: true,
    parent: "",
    ...taskFor(stop.id),
  }));

  sections.forEach((section, index) => {
    if (!section) return;
    const sectionId = String(section.id || "");
    const title = String(section.title || section.heading || "");
    if (!sectionId) {
      // Drawn so the project looks like what it is; not addressable, so no
      // tick or date can be kept against a position that will move.
      nodes.push({
        id: clioProjectPendingSectionNodeId(index),
        kind: "section",
        window: "sectionDrafts",
        labelKey: "",
        title,
        sectionId: "",
        addressable: false,
        parent: "",
        ...normalizeClioProjectTask({}),
      });
      return;
    }
    const id = clioProjectSectionNodeId(sectionId);
    nodes.push({
      id,
      kind: "section",
      window: "sectionDrafts",
      labelKey: "",
      title,
      sectionId,
      addressable: true,
      parent: "",
      ...taskFor(id),
    });
  });

  const addressable = new Set(nodes.filter((node) => node.addressable).map((node) => node.id));
  stored.ownTasks.forEach((task) => {
    const parent = addressable.has(task.parent) ? task.parent : CLIO_PROJECT_ORPHAN_PARENT;
    const parentNode = nodes.find((node) => node.id === parent);
    nodes.push({
      id: task.id,
      kind: "own",
      window: parentNode?.window || "sectionDrafts",
      labelKey: "",
      title: task.title,
      sectionId: parentNode?.sectionId || "",
      addressable: true,
      parent,
      parentTitle: task.parentTitle,
      orphanedFrom: parent === task.parent ? task.orphanedFrom : (task.orphanedFrom || task.parentTitle),
      done: task.done,
      doneAt: task.doneAt,
      date: task.date,
      note: task.note,
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
  nodes
    .filter((node) => node.kind === "own")
    .forEach((node) => edges.push({ from: node.parent, to: node.id, kind: "own" }));

  return { nodes, edges };
}

/** @param {{nodes: any[]}} plan @param {string} id */
function clioProjectNode(plan, id) {
  const key = String(id || "");
  return (plan?.nodes || []).find((node) => node.id === key) || null;
}

/** @param {{nodes: any[]}} plan @param {string} parentId */
function clioProjectOwnTasksOf(plan, parentId) {
  return (plan?.nodes || []).filter((node) => node.kind === "own" && node.parent === parentId);
}

/**
 * The chain blocking the handoff: every unfinished node from where the project
 * actually is, through to the handoff stop.
 *
 * "Where it actually is" is the first route stop still not done. Everything
 * from there to the handoff is still in the way: a section under Section
 * Drafts is in the way when that stop is, and a task the writer hung off
 * something in the way is in the way too. A finished stop later in the route
 * does not remove an earlier unfinished one from the chain — you cannot hand
 * off around a hole.
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
  const pushWithOwn = (node) => {
    chain.push(node.id);
    clioProjectOwnTasksOf(plan, node.id).filter((task) => !task.done).forEach((task) => chain.push(task.id));
  };
  for (let index = firstUnfinished; index <= handoffIndex; index += 1) {
    const stop = stops[index];
    if (!stop || stop.done) continue;
    pushWithOwn(stop);
    if (stop.id !== "sectionDrafts") continue;
    nodes
      .filter((node) => node.kind === "section" && !node.done)
      .forEach(pushWithOwn);
  }
  return chain;
}

/**
 * Finished work, for the done pile. It leaves the diagram rather than
 * disappearing: a plan that hides what was finished stops being a record of
 * the project.
 * @param {{nodes: any[]}} plan
 */
function clioProjectDoneNodes(plan) {
  return (plan?.nodes || []).filter((node) => node.done);
}

function isClioProjectOwnTaskId(record, nodeId) {
  return normalizeClioProjectRecord(record).ownTasks.some((task) => task.id === nodeId);
}

/**
 * Change one own task. Returns a new record; the caller persists it.
 * @param {Record<string, any>} record
 * @param {string} taskId
 * @param {Record<string, any>} patch
 * @param {string} now
 */
function updateClioProjectOwnTask(record, taskId, patch = {}, now = "") {
  const next = normalizeClioProjectRecord(record);
  const id = String(taskId || "");
  next.ownTasks = next.ownTasks.map((task) => {
    if (task.id !== id) return task;
    const merged = normalizeClioProjectOwnTask({ ...task, ...patch });
    if ("done" in patch) merged.doneAt = merged.done ? String(now || "") : "";
    if ("title" in patch) merged.title = String(patch.title || "").trim() || task.title;
    if ("date" in patch) merged.date = String(patch.date || "").trim();
    return merged;
  });
  next.updatedAt = String(now || next.updatedAt);
  return next;
}

/**
 * Tick or untick one task. Returns a new record; the caller persists it.
 * A node that is not addressable (an unstamped section) is refused: there is
 * nothing durable to keep the tick against.
 * @param {Record<string, any>} record
 * @param {string} nodeId
 * @param {boolean} done
 * @param {string} now ISO timestamp, supplied so this stays pure
 */
function setClioProjectTaskDone(record, nodeId, done, now = "") {
  const id = String(nodeId || "");
  if (isClioProjectOwnTaskId(record, id)) return updateClioProjectOwnTask(record, id, { done: done === true }, now);
  const next = normalizeClioProjectRecord(record);
  if (!id || id.startsWith("section-pending:")) return next;
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
 * Tick several nodes in one decision — the answer to the first-open question.
 * @param {Record<string, any>} record
 * @param {string[]} nodeIds
 * @param {string} now
 */
function setClioProjectTasksDone(record, nodeIds, now = "") {
  return (Array.isArray(nodeIds) ? nodeIds : [])
    .reduce((next, id) => setClioProjectTaskDone(next, id, true, now), normalizeClioProjectRecord(record));
}

/**
 * The writer's answer to the first-open question: tick exactly what they kept
 * checked (possibly nothing) and remember that they answered.
 * @param {Record<string, any>} record
 * @param {string[]} nodeIds
 * @param {string} now
 */
function answerClioProjectFirstLook(record, nodeIds, now = "") {
  const next = setClioProjectTasksDone(record, nodeIds, now);
  next.firstLookAnswered = String(now || "answered");
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
  const id = String(nodeId || "");
  if (isClioProjectOwnTaskId(record, id)) return updateClioProjectOwnTask(record, id, { date }, now);
  const next = normalizeClioProjectRecord(record);
  if (!id || id.startsWith("section-pending:")) return next;
  const task = normalizeClioProjectTask(next.tasks[id]);
  task.date = String(date || "").trim();
  next.tasks[id] = task;
  next.updatedAt = String(now || next.updatedAt);
  return next;
}

/**
 * The writer's note on a node, kept as typed.
 * @param {Record<string, any>} record
 * @param {string} nodeId
 * @param {string} note
 * @param {string} now
 */
function setClioProjectTaskNote(record, nodeId, note, now = "") {
  const id = String(nodeId || "");
  if (isClioProjectOwnTaskId(record, id)) return updateClioProjectOwnTask(record, id, { note: String(note || "") }, now);
  const next = normalizeClioProjectRecord(record);
  if (!id || id.startsWith("section-pending:")) return next;
  const task = normalizeClioProjectTask(next.tasks[id]);
  task.note = String(note || "");
  next.tasks[id] = task;
  next.updatedAt = String(now || next.updatedAt);
  return next;
}

/**
 * Hang a new task off a section or a stop. The id is supplied by the caller
 * (crypto.randomUUID in the window) so this stays pure. Tasks hang from a
 * section or a stop, never from another task: the plan has two levels, the
 * way the memo drew it.
 * @param {Record<string, any>} record
 * @param {{ id: string, title: string, parent: string, parentTitle?: string }} task
 * @param {string} now
 */
function addClioProjectOwnTask(record, task, now = "") {
  const next = normalizeClioProjectRecord(record);
  const own = normalizeClioProjectOwnTask({ ...task, done: false, date: "", note: "" });
  own.title = own.title.trim();
  if (!own.id || !own.title || !own.parent) return next;
  if (own.parent.startsWith("section-pending:")) return next;
  if (next.ownTasks.some((existing) => existing.id === own.parent || existing.id === own.id)) return next;
  next.ownTasks.push(own);
  next.updatedAt = String(now || next.updatedAt);
  return next;
}

/**
 * Take a task back off the plan. Only the writer's own tasks can be removed;
 * a route stop or a section is the project, not a decision.
 * @param {Record<string, any>} record
 * @param {string} taskId
 * @param {string} now
 */
function removeClioProjectOwnTask(record, taskId, now = "") {
  const next = normalizeClioProjectRecord(record);
  const before = next.ownTasks.length;
  next.ownTasks = next.ownTasks.filter((task) => task.id !== String(taskId || ""));
  if (next.ownTasks.length !== before) next.updatedAt = String(now || next.updatedAt);
  return next;
}

/**
 * Drop stored route/section decisions whose node no longer exists — a section
 * the writer deleted — and re-hang own tasks whose parent went with it. A
 * task is the writer's words, so it is never dropped by a structural change:
 * it moves to Section Drafts and remembers where it came from.
 * @param {Record<string, any>} record
 * @param {{nodes: any[]}} plan
 */
function pruneClioProjectRecord(record, plan) {
  const next = normalizeClioProjectRecord(record);
  const live = new Set((plan?.nodes || []).filter((node) => node.addressable !== false).map((node) => node.id));
  Object.keys(next.tasks).forEach((id) => {
    if (!live.has(id)) delete next.tasks[id];
  });
  next.ownTasks = next.ownTasks.map((task) => {
    if (live.has(task.parent)) return task;
    return { ...task, parent: CLIO_PROJECT_ORPHAN_PARENT, orphanedFrom: task.orphanedFrom || task.parentTitle };
  });
  return next;
}

// ---- Evidence --------------------------------------------------------------
//
// Each fact is a number or a flag the project record already holds. Facts are
// returned as data ({ key, count, total, at }) and worded by the window, so the
// model never carries a language.

function clioProjectChars(text) {
  return String(text || "").replace(/\s+/g, "").length;
}

function clioProjectDraftForSection(drafts, section, index) {
  const sectionId = String(section?.id || "");
  const title = String(section?.title || section?.heading || "").trim();
  return (sectionId && drafts.find((draft) => String(draft?.sectionId || "") === sectionId))
    || drafts.find((draft) => String(draft?.sourceOutlineSection || draft?.sectionTitle || draft?.title || "").trim() === title)
    || drafts.find((draft) => Number(draft?.sourceOutlineIndex) === index)
    || null;
}

/**
 * What the record already knows about every node, keyed by node id.
 * @param {{ project?: any, outline?: { sections?: any[] }, files?: any[], cdItems?: any[] }} input
 * @returns {Record<string, { key: string, count?: number, total?: number, at?: string }[]>}
 */
function clioProjectEvidence(input = {}) {
  const project = input.project || {};
  const sections = Array.isArray(input.outline?.sections) ? input.outline.sections : [];
  const drafts = Array.isArray(project.drafts) ? project.drafts : [];
  const files = Array.isArray(input.files) ? input.files : [];
  const burns = (Array.isArray(input.cdItems) ? input.cdItems : [])
    .filter((item) => item && item.projectId === project.id);
  const facts = {};
  const add = (id, fact) => { (facts[id] ||= []).push(fact); };

  if (files.length) add("disk", { key: "files", count: files.length });

  const clips = drafts.reduce((sum, draft) => sum + (Array.isArray(draft?.usedClips) ? draft.usedClips.length : 0), 0);
  if (clips) add("rag", { key: "clips_cited", count: clips });

  const sheet = clioProjectChars(project.questionSheet);
  if (sheet) add("questionSheet", { key: "chars", count: sheet });

  if (sections.length) add("outline", { key: "sections", count: sections.length });

  let written = 0;
  let draftChars = 0;
  let inserted = 0;
  sections.forEach((section, index) => {
    const id = section?.id ? clioProjectSectionNodeId(section.id) : clioProjectPendingSectionNodeId(index);
    const draft = clioProjectDraftForSection(drafts, section, index);
    const chars = clioProjectChars(draft?.body);
    const cited = Array.isArray(draft?.usedClips) ? draft.usedClips.length : 0;
    if (chars) {
      written += 1;
      draftChars += chars;
      add(id, { key: "chars", count: chars });
    }
    if (cited) add(id, { key: "clips_cited", count: cited });
    if (draft?.insertedAt) {
      inserted += 1;
      add(id, { key: "in_manuscript" });
    }
    if (!section?.id) add(id, { key: "awaiting_stamp" });
  });
  if (sections.length) add("sectionDrafts", { key: "drafts_written", count: written, total: sections.length });
  if (draftChars) add("sectionDrafts", { key: "chars", count: draftChars });
  if (inserted) add("teachText", { key: "sections_inserted", count: inserted, total: sections.length });

  if (project.flowState?.check === true) add("reviewDesk", { key: "reviewed" });

  if (burns.length) {
    const latest = burns
      .map((item) => String(item.createdAt || item.burnedAt || ""))
      .sort()
      .pop() || "";
    add("projectCd", { key: "burned", count: burns.length, at: latest });
  }
  return facts;
}

/**
 * The first-open question's content: which route stops and sections the
 * record already shows work at. A proposal only — nothing is ticked until the
 * writer says yes, and it is never asked again once they have decided anything.
 * @param {{nodes: any[]}} plan
 * @param {Record<string, any[]>} evidence
 * @returns {string[]} node ids, in plan order
 */
function clioProjectEvidencedDone(plan, evidence = {}) {
  const has = (id, key) => (evidence[id] || []).some((fact) => fact.key === key);
  const fact = (id, key) => (evidence[id] || []).find((item) => item.key === key);
  const sections = (plan?.nodes || []).filter((node) => node.kind === "section" && node.addressable);
  const sectionDone = (node) => has(node.id, "chars") && has(node.id, "in_manuscript");
  const drafted = fact("sectionDrafts", "drafts_written");
  const insertedAll = fact("teachText", "sections_inserted");
  const proof = {
    disk: has("disk", "files"),
    rag: has("rag", "clips_cited"),
    questionSheet: has("questionSheet", "chars"),
    outline: has("outline", "sections"),
    sectionDrafts: !!drafted && drafted.total > 0 && drafted.count === drafted.total,
    teachText: !!insertedAll && insertedAll.total > 0 && insertedAll.count === insertedAll.total,
    reviewDesk: has("reviewDesk", "reviewed"),
    projectCd: has("projectCd", "burned"),
  };
  const ids = [];
  CLIO_PROJECT_ROUTE_STOPS.forEach((stop) => {
    if (proof[stop.id]) ids.push(stop.id);
    if (stop.id === "sectionDrafts") sections.filter(sectionDone).forEach((node) => ids.push(node.id));
  });
  return ids;
}

/**
 * The one thing still missing, said as a fact rather than a plan: walk the
 * writing stops in route order and stop at the first one the record cannot
 * show as done. Busy writers tick nothing, so the answer comes from what the
 * project already holds (the evidence above); a node the writer did tick in
 * ClioProject counts as done whatever the evidence says, because their word
 * outranks the desk's inference. The File Floppy and the disk itself are not
 * steps anyone finishes, so they are not asked about.
 *
 * Returned as data ({ key, count, titles }) and worded by the caller.
 * @param {{nodes: any[]}} plan
 * @param {Record<string, any[]>} evidence
 */
function clioProjectNextStep(plan, evidence = {}) {
  const nodes = plan?.nodes || [];
  const has = (id, key) => (evidence[id] || []).some((fact) => fact.key === key);
  const ticked = (id) => nodes.some((node) => node.id === id && node.done === true);
  const sections = nodes.filter((node) => node.kind === "section");

  if (!ticked("questionSheet") && !has("questionSheet", "chars")) return { key: "sheet" };
  if (!ticked("outline") && !sections.length) return { key: "outline" };
  if (!ticked("sectionDrafts")) {
    const unwritten = sections.filter((node) => !node.done && !has(node.id, "chars"));
    if (unwritten.length) return { key: "unwritten", count: unwritten.length, titles: unwritten.map((node) => node.title) };
  }
  if (!ticked("teachText")) {
    const outside = sections.filter((node) => !node.done && !has(node.id, "in_manuscript"));
    if (outside.length) return { key: "uninserted", count: outside.length, titles: outside.map((node) => node.title) };
  }
  if (!ticked("reviewDesk") && !has("reviewDesk", "reviewed")) return { key: "review" };
  if (!ticked("projectCd") && !has("projectCd", "burned")) return { key: "burn" };
  return { key: "ready" };
}

window.AISystem6ClioProject = Object.freeze({
  CLIO_PROJECT_HANDOFF_ID,
  CLIO_PROJECT_ORPHAN_PARENT,
  CLIO_PROJECT_ROUTE_STOPS,
  CLIO_PROJECT_SCHEMA_VERSION,
  addClioProjectOwnTask,
  answerClioProjectFirstLook,
  blankClioProjectRecord,
  clioProjectBlockingChain,
  clioProjectDoneNodes,
  clioProjectEvidence,
  clioProjectEvidencedDone,
  clioProjectNextStep,
  clioProjectNode,
  clioProjectOwnTasksOf,
  clioProjectPendingSectionNodeId,
  clioProjectPlan,
  clioProjectRecordIsUntouched,
  clioProjectSectionNodeId,
  normalizeClioProjectRecord,
  pruneClioProjectRecord,
  removeClioProjectOwnTask,
  setClioProjectTaskDate,
  setClioProjectTaskDone,
  setClioProjectTaskNote,
  setClioProjectTasksDone,
  updateClioProjectOwnTask,
});
