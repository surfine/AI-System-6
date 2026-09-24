// Feature module: ClioProject 项目表 — the window half of the plan.
//
// The model half lives in app/core/clio-project.js and is the authority on
// what this window may show and keep. The plan is DERIVED: nodes and arrows
// are computed from the route and the Outline on every render, exactly the
// way the outline tree is derived from Markdown. Only the writer's decisions
// persist — ticks, typed dates, notes, the tasks they hang, and their answer to
// the one first-open question — and they live on the project record itself
// (`project.clioProject`), so they travel with the disk through backups.
//
// Two views of one model, switched from the menu bar's View menu the way
// MacProject moved between its charts (decided 2026-08-21):
//
// - **Plan.** The route runs left to right. Route stops are milestones
//   (rounded, MacProject's own legend); sections and the writer's tasks are
//   tasks (square). Sections fan out of Section Drafts and rejoin at the
//   manuscript. Finished work folds into the done pile at the far left, so the
//   picture starts where the project actually is, and unticking something
//   brings it back out of the pile. Bold — border, line, type — is the whole
//   vocabulary for 「卡住交付的链」/ "the chain blocking the handoff", which is
//   not a critical path and must not be called one.
// - **All Disks.** A read-only month calendar: every disk's handoff date, the
//   days a disc was burned, and the days the writer's word count changed.
//   Dates move in the plan, never on the calendar.
//
// One click selects and double-click opens, like every other object on this
// desk. Editing lives in one Get Info pane beside the diagram instead of an
// input on every card.
//
// Layout is automatic. A nudge (dragging a card) is a session-local courtesy,
// deliberately not persisted: the diagram is derived, and a stored geometry
// would be a second copy waiting to go stale. Reset Layout clears the nudges.
//
// Contract: tests/features/clio-project-window.test.mjs

function installClioProjectWindow() {
  if (typeof document === "undefined") return;
  if (document.querySelector('[data-window="clioProject"]')) return;
  window.AISystem6ApplicationShell.createWindow({
    windowName: "clioProject",
    windowClass: "clio-project-window",
    labelledBy: "clio-project-title",
    // Naming law: ClioProject stays untranslated in both languages, like
    // ClioTalk. No titleKey on purpose — there is nothing to translate. The
    // disk's name is added after it, the way a document window names its file.
    title: "ClioProject",
    statusClass: "compact-status-bar",
    statusHtml: `<span class="status-bar-leading clio-project-status" id="clio-project-status"></span>`,
    paneClass: "clio-project-pane",
    paneHtml: `
          <div class="clio-project-plan" id="clio-project-plan">
            <div class="clio-project-canvas-scroll" id="clio-project-canvas-scroll">
              <div class="clio-project-canvas" id="clio-project-canvas">
                <svg class="clio-project-edges" id="clio-project-edges" aria-hidden="true" focusable="false"></svg>
              </div>
            </div>
            <aside class="clio-project-info" id="clio-project-info" aria-live="polite"></aside>
          </div>
          <div class="clio-project-calendar" id="clio-project-calendar" hidden></div>
          <div class="clio-project-sheet" id="clio-project-sheet" role="dialog" aria-modal="true" aria-labelledby="clio-project-sheet-title" hidden></div>`,
  });
  if (typeof applyLanguage === "function") applyLanguage();
}

installClioProjectWindow();

// ClioProject is a lazy application, so its menus arrive with it, the way
// ClioChart's do: the boot shell does not carry the rows of a window that is
// not open. View switches the two charts of one model, the way MacProject's
// View menu did; Plan acts on the selected card. The vocabulary (menu,
// menuItem, menuSeparator, editWithSelection) is menus.js's, and a bare
// context such as a module contract has none of it, so it is guarded.
const CLIO_PROJECT_MENUS = typeof menu === "function" && typeof menuItem === "function" ? [
  menu("file", "menu_file", [
    menuItem("close-active-window", "close", "close-window"),
  ]),
  menu("edit", "menu_edit", editWithSelection),
  menu("view", "menu_view", [
    menuItem("clio-project-view-plan", "clio_project_plan_view", "", { dataset: { clioProjectView: "plan" } }),
    menuItem("clio-project-view-calendar", "clio_project_calendar_view", "", { dataset: { clioProjectView: "calendar" } }),
  ]),
  menu("plan", "menu_plan", [
    menuItem("clio-project-add-task", "clio_project_add_task"),
    menuItem("clio-project-mark-done", "clio_project_mark_done_command"),
    menuItem("clio-project-open-node", "clio_project_open_node"),
    menuSeparator,
    menuItem("clio-project-reset-layout", "clio_project_reset_layout"),
  ]),
] : null;
if (CLIO_PROJECT_MENUS) window.AISystem6RegisterApplicationMenuSet?.("clioProject", CLIO_PROJECT_MENUS);

// Where a card sits after the writer pushed it. Session-local on purpose.
const clioProjectNudges = new Map();
let clioProjectParts = null;
let clioProjectWired = false;
let clioProjectSelected = "";
let clioProjectView = "plan";
let clioProjectCalendarMonth = null;
let clioProjectLastRemoved = null;
let clioProjectFirstLookShownFor = "";

// Geometry the edges need to know. The card sizes are the CSS's; these
// constants are the same numbers, so an arrow always lands on a card's edge.
const CLIO_PROJECT_SIZES = Object.freeze({
  stop: Object.freeze({ w: 116, h: 44 }),
  section: Object.freeze({ w: 136, h: 44 }),
  own: Object.freeze({ w: 128, h: 30 }),
  pile: Object.freeze({ w: 92, h: 44 }),
});
const CLIO_PROJECT_PILE_ID = "__done";
const CLIO_PROJECT_COLUMN_GAP = 28;
const CLIO_PROJECT_ROW_GAP = 10;
const CLIO_PROJECT_OWN_INDENT = 12;
const CLIO_PROJECT_MARGIN = 16;

function clioProjectFields() {
  if (clioProjectParts?.canvas?.isConnected) return clioProjectParts;
  const root = document.querySelector('[data-window="clioProject"]');
  if (!root) return null;
  clioProjectParts = {
    root,
    title: root.querySelector("#clio-project-title"),
    status: root.querySelector("#clio-project-status"),
    plan: root.querySelector("#clio-project-plan"),
    scroll: root.querySelector("#clio-project-canvas-scroll"),
    canvas: root.querySelector("#clio-project-canvas"),
    edges: root.querySelector("#clio-project-edges"),
    info: root.querySelector("#clio-project-info"),
    calendar: root.querySelector("#clio-project-calendar"),
    sheet: root.querySelector("#clio-project-sheet"),
  };
  return clioProjectParts.canvas ? clioProjectParts : null;
}

function clioProjectModel() {
  return window.AISystem6ClioProject;
}

function clioProjectActive() {
  return typeof getActiveProject === "function" ? getActiveProject() : null;
}

function clioProjectRecordFor(project) {
  return clioProjectModel().normalizeClioProjectRecord(project?.clioProject || {});
}

function clioProjectOutlineFor(project) {
  return typeof markdownOutlineTree === "function"
    ? markdownOutlineTree(project?.outline || "")
    : { sections: [] };
}

function clioProjectPlanFor(project) {
  return clioProjectModel().clioProjectPlan(clioProjectRecordFor(project), clioProjectOutlineFor(project));
}

function clioProjectFilesFor(project) {
  return typeof chatFiles !== "undefined" && project
    ? chatFiles.filter((file) => file?.projectId === project.id)
    : [];
}

function clioProjectEvidenceFor(project) {
  return clioProjectModel().clioProjectEvidence({
    project,
    outline: clioProjectOutlineFor(project),
    files: clioProjectFilesFor(project),
    cdItems: typeof projectCdItems !== "undefined" ? projectCdItems : [],
  });
}

// The one write path. Prunes against the freshly derived plan on the way out,
// so a deleted section's tick cannot live in storage forever and a task whose
// section went re-hangs instead of vanishing, then saves the desk: the record
// rides inside the project, never in a store of its own.
function writeClioProjectRecord(project, next) {
  const model = clioProjectModel();
  project.clioProject = model.pruneClioProjectRecord(next, clioProjectPlanFor(project));
  project.updatedAt = new Date().toISOString();
  saveDeskState();
  renderClioProject();
  // The desktop disk's risk mark reads these dates; redraw it now rather
  // than on the next unrelated desk render.
  if (typeof renderProjectDiskDesktopIcons === "function") renderProjectDiskDesktopIcons();
}

function commitClioProject(change) {
  const project = clioProjectActive();
  if (!project) return;
  writeClioProjectRecord(project, change(clioProjectRecordFor(project), new Date().toISOString()));
}

function clioProjectNodeTitle(node) {
  if (!node) return "";
  if (node.kind === "stop") return t(node.labelKey);
  return node.title || t("untitled");
}

function clioProjectFactText(fact) {
  switch (fact.key) {
    case "files": return t("clio_project_fact_files", fact.count);
    case "clips_cited": return t("clio_project_fact_clips_cited", fact.count);
    case "chars": return t("clio_project_fact_chars", Number(fact.count).toLocaleString(currentLanguage === "zh" ? "zh-CN" : "en-US"));
    case "sections": return t("clio_project_fact_sections", fact.count);
    case "in_manuscript": return t("clio_project_fact_in_manuscript");
    case "awaiting_stamp": return t("clio_project_fact_awaiting_stamp");
    case "drafts_written": return t("clio_project_fact_drafts_written", fact.count, fact.total);
    case "sections_inserted": return t("clio_project_fact_sections_inserted", fact.count, fact.total);
    case "reviewed": return t("clio_project_fact_reviewed");
    case "burned": return t("clio_project_fact_burned", fact.count, clioProjectShortDate(fact.at));
    default: return "";
  }
}

function clioProjectLocale() {
  return currentLanguage === "zh" ? "zh-CN" : "en-US";
}

function clioProjectShortDate(iso) {
  const at = Date.parse(iso || "");
  if (!Number.isFinite(at)) return "";
  return new Intl.DateTimeFormat(clioProjectLocale(), { month: "short", day: "numeric" }).format(at);
}

// ---- Layout ---------------------------------------------------------------
//
// Columns, left to right: the done pile (when anything is done), then each
// unfinished route stop, with the unfinished sections as one column where
// Section Drafts stands. A task hangs under what it was hung from; a task
// whose parent is already finished hangs under the done pile, because that is
// where its parent went. Every column is centred on one line, so the route
// reads as a straight spine with the fan bulging around it.

function clioProjectColumns(plan) {
  const nodes = plan.nodes;
  const open = (node) => !node.done;
  const own = (parentId) => nodes.filter((node) => node.kind === "own" && node.parent === parentId && open(node));
  const doneIds = new Set(nodes.filter((node) => node.done).map((node) => node.id));
  const columns = [];

  const loose = nodes.filter((node) => node.kind === "own" && open(node) && doneIds.has(node.parent));
  if (doneIds.size) columns.push({ kind: "pile", head: [CLIO_PROJECT_PILE_ID], items: [CLIO_PROJECT_PILE_ID, ...loose.map((node) => node.id)] });

  nodes.filter((node) => node.kind === "stop").forEach((stop) => {
    if (open(stop)) columns.push({ kind: "stop", head: [stop.id], items: [stop.id, ...own(stop.id).map((node) => node.id)] });
    if (stop.id !== "sectionDrafts") return;
    const sections = nodes.filter((node) => node.kind === "section" && open(node));
    if (!sections.length) return;
    columns.push({
      kind: "fan",
      head: sections.map((node) => node.id),
      items: sections.flatMap((node) => [node.id, ...own(node.id).map((task) => task.id)]),
    });
  });
  return columns;
}

function clioProjectSizeOf(plan, id) {
  if (id === CLIO_PROJECT_PILE_ID) return CLIO_PROJECT_SIZES.pile;
  const node = plan.nodes.find((candidate) => candidate.id === id);
  return CLIO_PROJECT_SIZES[node?.kind] || CLIO_PROJECT_SIZES.stop;
}

function clioProjectLayout(plan) {
  const positions = new Map();
  const columns = clioProjectColumns(plan);
  const heightOf = (column) => column.items.reduce(
    (sum, id, index) => sum + clioProjectSizeOf(plan, id).h + (index ? CLIO_PROJECT_ROW_GAP : 0),
    0,
  );
  const tallest = Math.max(CLIO_PROJECT_SIZES.stop.h, ...columns.map((column) => (
    // A stop sits ON the spine and its tasks hang below, so it needs twice its
    // hanging height; a fan is centred, so it needs only its own.
    column.kind === "fan" ? heightOf(column) : 2 * heightOf(column) - CLIO_PROJECT_SIZES.stop.h
  )));
  const spine = CLIO_PROJECT_MARGIN + tallest / 2;

  let x = CLIO_PROJECT_MARGIN;
  columns.forEach((column) => {
    const width = Math.max(...column.items.map((id) => clioProjectSizeOf(plan, id).w));
    let y = column.kind === "fan"
      ? spine - heightOf(column) / 2
      : spine - clioProjectSizeOf(plan, column.items[0]).h / 2;
    column.items.forEach((id, index) => {
      const size = clioProjectSizeOf(plan, id);
      const hangs = index > 0 && column.kind !== "fan"
        || plan.nodes.find((node) => node.id === id)?.kind === "own";
      positions.set(id, {
        x: x + (hangs ? CLIO_PROJECT_OWN_INDENT : 0),
        y,
        w: size.w - (hangs ? CLIO_PROJECT_OWN_INDENT : 0),
        h: size.h,
      });
      y += size.h + CLIO_PROJECT_ROW_GAP;
    });
    x += width + CLIO_PROJECT_COLUMN_GAP;
  });

  positions.forEach((position, id) => {
    const nudge = clioProjectNudges.get(id);
    if (!nudge) return;
    position.x = Math.max(0, position.x + nudge.dx);
    position.y = Math.max(0, position.y + nudge.dy);
  });
  return { positions, columns };
}

// Orthogonal connectors, the way MacProject drew them: out of the right side,
// across, down or up at the midpoint, and into the left side.
function clioProjectConnector(from, to) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  if (Math.abs(y1 - y2) < 1) return `M${x1} ${y1}H${x2}`;
  const mid = Math.round((x1 + x2) / 2);
  return `M${x1} ${y1}H${mid}V${y2}H${x2}`;
}

// A hung task: a dotted drop from its parent's lower left into its side.
function clioProjectHanger(parent, task) {
  const x = parent.x + 8;
  return `M${x} ${parent.y + parent.h}V${task.y + task.h / 2}H${task.x}`;
}

// ---- Render ---------------------------------------------------------------

function renderClioProject() {
  const parts = clioProjectFields();
  if (!parts) return;
  const project = clioProjectActive();
  parts.title.textContent = project && typeof projectDisplayName === "function"
    ? `ClioProject — ${projectDisplayName(project)}`
    : "ClioProject";
  parts.plan.hidden = clioProjectView !== "plan";
  parts.calendar.hidden = clioProjectView !== "calendar";
  if (clioProjectView === "calendar") {
    parts.sheet.hidden = true;
    renderClioProjectCalendar(parts);
    return;
  }
  if (!project) {
    parts.status.textContent = t("no_project_mounted");
    parts.canvas.querySelectorAll(".clio-project-node").forEach((node) => node.remove());
    parts.edges.replaceChildren();
    parts.info.replaceChildren();
    parts.sheet.hidden = true;
    return;
  }

  const model = clioProjectModel();
  const plan = clioProjectPlanFor(project);
  const chain = model.clioProjectBlockingChain(plan);
  const evidence = clioProjectEvidenceFor(project);
  const layout = clioProjectLayout(plan);
  const visible = [...layout.positions.keys()];
  if (!visible.includes(clioProjectSelected)) clioProjectSelected = chain[0] || visible[0] || "";

  renderClioProjectCanvas(parts, plan, layout, new Set(chain), evidence);
  renderClioProjectInfo(parts, plan, evidence);
  renderClioProjectStatus(parts, plan, chain);
  maybeAskClioProjectFirstLook(parts, project, plan, evidence);
}

function renderClioProjectEdges(parts, plan, layout, chainSet) {
  const { positions, columns } = layout;
  const svgNS = "http://www.w3.org/2000/svg";
  let width = 0;
  let height = 0;
  positions.forEach((position) => {
    width = Math.max(width, position.x + position.w);
    height = Math.max(height, position.y + position.h);
  });
  width += CLIO_PROJECT_MARGIN;
  height += CLIO_PROJECT_MARGIN;
  parts.edges.setAttribute("viewBox", `0 0 ${width} ${height}`);
  parts.edges.setAttribute("width", String(width));
  parts.edges.setAttribute("height", String(height));
  parts.canvas.style.setProperty("--clio-project-canvas-w", `${width}px`);
  parts.canvas.style.setProperty("--clio-project-canvas-h", `${height}px`);

  const paths = [];
  const draw = (d, className) => {
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", d);
    if (className) path.setAttribute("class", className);
    paths.push(path);
  };
  for (let index = 1; index < columns.length; index += 1) {
    columns[index - 1].head.forEach((fromId) => columns[index].head.forEach((toId) => {
      const from = positions.get(fromId);
      const to = positions.get(toId);
      if (!from || !to) return;
      draw(clioProjectConnector(from, to), chainSet.has(fromId) && chainSet.has(toId) ? "is-blocking" : "");
    }));
  }
  plan.nodes.filter((node) => node.kind === "own" && positions.has(node.id)).forEach((node) => {
    const parent = positions.get(node.parent) || positions.get(CLIO_PROJECT_PILE_ID);
    if (parent) draw(clioProjectHanger(parent, positions.get(node.id)), "is-hung");
  });
  parts.edges.replaceChildren(...paths);
}

function renderClioProjectCanvas(parts, plan, layout, chainSet, evidence) {
  const focusedId = document.activeElement?.closest?.(".clio-project-node")?.dataset.nodeId || "";
  renderClioProjectEdges(parts, plan, layout, chainSet);
  parts.canvas.querySelectorAll(".clio-project-node").forEach((node) => node.remove());

  const done = plan.nodes.filter((node) => node.done);
  layout.positions.forEach((position, id) => {
    const card = document.createElement("div");
    card.dataset.nodeId = id;
    card.tabIndex = id === clioProjectSelected ? 0 : -1;
    card.setAttribute("role", "button");
    card.style.setProperty("--clio-project-x", `${position.x}px`);
    card.style.setProperty("--clio-project-y", `${position.y}px`);
    card.style.setProperty("--clio-project-w", `${position.w}px`);
    if (id === clioProjectSelected) card.classList.add("is-selected");
    card.setAttribute("aria-pressed", String(id === clioProjectSelected));

    if (id === CLIO_PROJECT_PILE_ID) {
      card.className = `clio-project-node clio-project-pile${id === clioProjectSelected ? " is-selected" : ""}`;
      const stops = done.filter((node) => node.kind === "stop").length;
      const title = document.createElement("span");
      title.className = "clio-project-node-title";
      title.textContent = t("clio_project_done_pile", done.length);
      const meta = document.createElement("span");
      meta.className = "clio-project-node-meta";
      meta.textContent = t("clio_project_done_pile_detail", stops, done.length - stops);
      card.setAttribute("aria-label", t("clio_project_done_pile", done.length));
      card.append(title, meta);
      parts.canvas.append(card);
      return;
    }

    const node = plan.nodes.find((candidate) => candidate.id === id);
    card.className = `clio-project-node is-${node.kind === "stop" ? "milestone" : node.kind === "own" ? "own" : "task"}`;
    if (chainSet.has(id)) card.classList.add("is-blocking");
    if (id === clioProjectSelected) card.classList.add("is-selected");
    if (!node.addressable) card.classList.add("is-pending");

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = node.done;
    check.disabled = !node.addressable;
    check.tabIndex = -1;
    check.dataset.clioProjectDone = node.id;
    check.setAttribute("aria-label", t("clio_project_mark_done", clioProjectNodeTitle(node)));

    const title = document.createElement("span");
    title.className = "clio-project-node-title";
    title.textContent = clioProjectNodeTitle(node);
    card.append(check, title);

    const fact = node.kind === "own" ? null : (evidence[node.id] || [])[0];
    if (fact || node.date) {
      const meta = document.createElement("span");
      meta.className = "clio-project-node-meta";
      if (fact) {
        const words = document.createElement("span");
        words.textContent = clioProjectFactText(fact);
        meta.append(words);
      }
      if (node.date) {
        const date = document.createElement("span");
        date.className = "clio-project-node-date";
        date.textContent = node.date;
        meta.append(date);
      }
      card.append(meta);
    }
    card.setAttribute("aria-label", [clioProjectNodeTitle(node), fact ? clioProjectFactText(fact) : "", node.date].filter(Boolean).join(", "));
    parts.canvas.append(card);
  });

  const focusTarget = focusedId && parts.canvas.querySelector(`[data-node-id="${CSS.escape(focusedId)}"]`);
  if (focusTarget) focusTarget.focus({ preventScroll: true });
}

function clioProjectLabeledField(labelKey, control) {
  const label = document.createElement("label");
  label.className = "clio-project-field";
  const text = document.createElement("span");
  text.textContent = t(labelKey);
  label.append(text, control);
  return label;
}

function clioProjectButton(labelKey, action, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn${extraClass ? ` ${extraClass}` : ""}`;
  button.dataset.clioProjectAction = action;
  button.textContent = t(labelKey);
  return button;
}

// Get Info: the one place a node is edited. It shows what the record knows,
// the writer's date and note, and the two things you can do from here.
function renderClioProjectInfo(parts, plan, evidence) {
  const info = parts.info;
  info.replaceChildren();
  const head = document.createElement("div");
  head.className = "clio-project-info-head";
  const kind = document.createElement("div");
  kind.className = "clio-project-info-kind";
  const body = document.createElement("div");
  body.className = "clio-project-info-body";
  const foot = document.createElement("div");
  foot.className = "clio-project-info-foot";

  if (clioProjectSelected === CLIO_PROJECT_PILE_ID) {
    kind.textContent = t("clio_project_done_pile", plan.nodes.filter((node) => node.done).length);
    const title = document.createElement("div");
    title.className = "clio-project-info-title";
    title.textContent = t("clio_project_done_pile_title");
    head.append(kind, title);
    const list = document.createElement("ul");
    list.className = "clio-project-done-list";
    plan.nodes.filter((node) => node.done).forEach((node) => {
      const row = document.createElement("li");
      const label = document.createElement("label");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = true;
      check.dataset.clioProjectDone = node.id;
      const name = document.createElement("span");
      name.textContent = clioProjectNodeTitle(node);
      label.append(check, name);
      row.append(label);
      list.append(row);
    });
    const hint = document.createElement("p");
    hint.className = "clio-project-info-hint";
    hint.textContent = t("clio_project_done_pile_hint");
    body.append(list, hint);
    info.append(head, body);
    return;
  }

  const node = plan.nodes.find((candidate) => candidate.id === clioProjectSelected);
  if (!node) return;
  kind.textContent = t(`clio_project_kind_${node.kind}`);
  head.append(kind);
  if (node.kind === "own") {
    const title = document.createElement("input");
    title.type = "text";
    title.id = "clio-project-task-title";
    title.className = "clio-project-info-title-field";
    title.value = node.title;
    title.dataset.clioProjectField = "title";
    head.append(clioProjectLabeledField("clio_project_task_title_label", title));
  } else {
    const title = document.createElement("div");
    title.className = "clio-project-info-title";
    title.textContent = clioProjectNodeTitle(node);
    head.append(title);
  }

  const facts = document.createElement("ul");
  facts.className = "clio-project-facts";
  const lines = (evidence[node.id] || []).map(clioProjectFactText);
  if (node.kind === "own") {
    const parent = plan.nodes.find((candidate) => candidate.id === node.parent);
    lines.push(t("clio_project_hung_from", clioProjectNodeTitle(parent)));
    if (node.orphanedFrom) lines.push(t("clio_project_orphaned_from", node.orphanedFrom));
  }
  if (!lines.length) lines.push(t("clio_project_fact_none"));
  lines.forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    facts.append(item);
  });
  body.append(facts);

  if (node.addressable) {
    const date = document.createElement("input");
    date.type = "text";
    date.id = "clio-project-date";
    date.value = node.date;
    date.placeholder = t("clio_project_date_placeholder");
    date.dataset.clioProjectField = "date";
    const note = document.createElement("textarea");
    note.id = "clio-project-note";
    note.rows = 2;
    note.value = node.note;
    note.dataset.clioProjectField = "note";
    body.append(
      clioProjectLabeledField("clio_project_date_label", date),
      clioProjectLabeledField("clio_project_note_label", note),
    );
  }

  if (node.kind === "own") foot.append(clioProjectButton("clio_project_remove_task", "remove"));
  else if (node.addressable) foot.append(clioProjectButton("clio_project_add_task", "add"));
  foot.append(clioProjectButton("clio_project_open_node", "open", "default"));
  info.append(head, body, foot);
}

function renderClioProjectStatus(parts, plan, chain) {
  const status = parts.status;
  status.replaceChildren();
  const add = (text, className = "") => {
    const span = document.createElement("span");
    if (className) span.className = className;
    span.textContent = text;
    status.append(span);
    return span;
  };
  if (chain.length) {
    add(t("clio_project_chain", chain.length), "is-blocking");
    const next = plan.nodes.find((node) => node.id === chain[0]);
    add(t("clio_project_status_next", clioProjectNodeTitle(next)));
  } else {
    add(t("clio_project_chain_clear"));
  }
  const handoff = plan.nodes.find((node) => node.id === clioProjectModel().CLIO_PROJECT_HANDOFF_ID);
  add(clioProjectHandoffText(handoff?.date || ""));

  if (clioProjectLastRemoved) {
    const undo = document.createElement("button");
    undo.type = "button";
    undo.className = "btn details-bar-button status-bar-trailing";
    undo.dataset.clioProjectAction = "undo-remove";
    undo.textContent = t("clio_project_undo");
    add(t("clio_project_removed", clioProjectLastRemoved.task.title), "status-bar-trailing");
    status.append(undo);
  }
}

// "还有 7 天" only when the handoff is written as a day; anything else is
// shown exactly as the writer wrote it.
function clioProjectHandoffText(date) {
  if (!date) return t("clio_project_handoff_unset");
  const day = typeof projectHandDateDay === "function" ? projectHandDateDay(date) : null;
  if (day === null) return t("clio_project_handoff_text", date);
  const left = day - projectTodayDay();
  if (left === 0) return t("clio_project_handoff_today", date);
  return left > 0 ? t("clio_project_handoff_left", date, left) : t("clio_project_handoff_past", date, -left);
}

// ---- The first-open question (asked once) ----------------------------------
//
// A project that was already under way when ClioProject arrived would open
// with every box empty and a chain the length of the route. So the first time
// a plan with no decisions in it opens, the record's evidence is offered as a
// list the writer ticks from. Nothing is ticked until they answer, and either
// answer — including "none" — is remembered so the question never returns.
function maybeAskClioProjectFirstLook(parts, project, plan, evidence) {
  const model = clioProjectModel();
  const sheet = parts.sheet;
  if (!model.clioProjectRecordIsUntouched(project.clioProject || {})) {
    sheet.hidden = true;
    return;
  }
  const proposed = model.clioProjectEvidencedDone(plan, evidence);
  if (!proposed.length) {
    sheet.hidden = true;
    return;
  }
  // Rebuilt only when what it proposes changes (a section just got its stamp),
  // so a re-render never resets the boxes the writer already unticked.
  const shownFor = `${project.id}|${proposed.join(",")}`;
  if (!sheet.hidden && clioProjectFirstLookShownFor === shownFor) return;
  clioProjectFirstLookShownFor = shownFor;

  sheet.replaceChildren();
  const panel = document.createElement("div");
  panel.className = "clio-project-sheet-panel";
  const title = document.createElement("h2");
  title.id = "clio-project-sheet-title";
  title.textContent = t("clio_project_first_look_title");
  const lede = document.createElement("p");
  lede.textContent = t("clio_project_first_look_body");
  const list = document.createElement("ul");
  list.className = "clio-project-sheet-list";
  proposed.forEach((id) => {
    const node = plan.nodes.find((candidate) => candidate.id === id);
    const row = document.createElement("li");
    const label = document.createElement("label");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = true;
    check.value = id;
    const name = document.createElement("b");
    name.textContent = clioProjectNodeTitle(node);
    const fact = document.createElement("span");
    fact.textContent = (evidence[id] || []).map(clioProjectFactText).join(" · ");
    label.append(check, name, fact);
    row.append(label);
    list.append(row);
  });
  const buttons = document.createElement("div");
  buttons.className = "clio-project-sheet-buttons";
  buttons.append(
    clioProjectButton("clio_project_first_look_skip", "first-look-skip"),
    clioProjectButton("clio_project_first_look_apply", "first-look-apply", "default"),
  );
  panel.append(title, lede, list, buttons);
  sheet.append(panel);
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.querySelector(".btn.default")?.focus());
}

function answerClioProjectFirstLook(apply) {
  const parts = clioProjectFields();
  if (!parts) return;
  const ids = apply
    ? [...parts.sheet.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value)
    : [];
  parts.sheet.hidden = true;
  commitClioProject((record, now) => clioProjectModel().answerClioProjectFirstLook(record, ids, now));
}

// ---- All Disks: the month calendar ----------------------------------------

function clioProjectDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// "Wrote something" = the word count changed that day. The first entry in a
// log is the count the desk found, not a change, so it is never a writing day.
function clioProjectWritingDays(project) {
  const log = Array.isArray(project?.writingDays) ? project.writingDays : [];
  const days = new Set();
  for (let index = 1; index < log.length; index += 1) {
    if (log[index]?.[1] !== log[index - 1]?.[1]) days.add(String(log[index][0]));
  }
  return days;
}

function renderClioProjectCalendar(parts) {
  const today = new Date();
  if (!clioProjectCalendarMonth) clioProjectCalendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const month = clioProjectCalendarMonth;
  const locale = clioProjectLocale();
  const disks = (typeof projects !== "undefined" ? projects : []).filter((project) => project && !project.archived);
  const events = new Map();
  const addEvent = (key, event) => {
    if (!events.has(key)) events.set(key, []);
    events.get(key).push(event);
  };
  const unread = [];
  let dated = 0;
  disks.forEach((project) => {
    const name = typeof projectDisplayName === "function" ? projectDisplayName(project) : project.name;
    const handoff = String(project.clioProject?.tasks?.projectCd?.date || "");
    if (handoff) {
      const day = projectHandDateDay(handoff);
      if (day === null) unread.push({ handoff, name });
      else {
        dated += 1;
        const at = new Date(day * 864e5);
        addEvent(clioProjectDayKey(new Date(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())), { kind: "handoff", text: t("clio_project_calendar_handoff", name) });
      }
    }
    clioProjectWritingDays(project).forEach((key) => addEvent(key, { kind: "wrote", text: name }));
  });
  (typeof projectCdItems !== "undefined" ? projectCdItems : []).forEach((item) => {
    const project = disks.find((candidate) => candidate.id === item?.projectId);
    const at = Date.parse(item?.createdAt || item?.burnedAt || "");
    if (!project || !Number.isFinite(at)) return;
    const name = typeof projectDisplayName === "function" ? projectDisplayName(project) : project.name;
    addEvent(clioProjectDayKey(new Date(at)), { kind: "burn", text: t("clio_project_calendar_burn", name) });
  });

  const root = parts.calendar;
  root.replaceChildren();
  const head = document.createElement("div");
  head.className = "clio-project-calendar-head";
  const prev = clioProjectButton("clio_project_calendar_prev", "month-prev", "mini-btn");
  const next = clioProjectButton("clio_project_calendar_next", "month-next", "mini-btn");
  const title = document.createElement("b");
  title.textContent = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(month);
  const note = document.createElement("span");
  note.className = "clio-project-calendar-note";
  note.textContent = t("clio_project_calendar_readonly");
  head.append(prev, title, next, note);

  const grid = document.createElement("div");
  grid.className = "clio-project-calendar-grid";
  grid.setAttribute("role", "grid");
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  for (let index = 0; index < 7; index += 1) {
    const cell = document.createElement("div");
    cell.className = "clio-project-calendar-dow";
    cell.setAttribute("role", "columnheader");
    // 2026-09-20 was a Sunday: the Macintosh calendar starts its week there.
    cell.textContent = weekday.format(new Date(2026, 8, 20 + index));
    grid.append(cell);
  }
  const lead = month.getDay();
  const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const todayKey = clioProjectDayKey(today);
  for (let index = 0; index < lead; index += 1) {
    const blank = document.createElement("div");
    blank.className = "clio-project-calendar-day is-outside";
    grid.append(blank);
  }
  for (let day = 1; day <= length; day += 1) {
    const key = clioProjectDayKey(new Date(month.getFullYear(), month.getMonth(), day));
    const cell = document.createElement("div");
    cell.className = "clio-project-calendar-day";
    cell.setAttribute("role", "gridcell");
    if (key === todayKey) cell.classList.add("is-today");
    const number = document.createElement("span");
    number.className = "clio-project-calendar-number";
    number.textContent = String(day);
    cell.append(number);
    const dayEvents = events.get(key) || [];
    const wrote = dayEvents.filter((event) => event.kind === "wrote");
    if (wrote.length) {
      const mark = document.createElement("span");
      mark.className = "clio-project-calendar-wrote";
      mark.title = `${t("clio_project_calendar_wrote")}: ${wrote.map((event) => event.text).join(", ")}`;
      mark.setAttribute("aria-label", mark.title);
      number.after(mark);
    }
    dayEvents.filter((event) => event.kind !== "wrote").forEach((event) => {
      const chip = document.createElement("span");
      chip.className = `clio-project-calendar-event is-${event.kind}`;
      chip.textContent = event.text;
      chip.title = event.text;
      cell.append(chip);
    });
    grid.append(cell);
  }
  const tail = (7 - ((lead + length) % 7)) % 7;
  for (let index = 0; index < tail; index += 1) {
    const blank = document.createElement("div");
    blank.className = "clio-project-calendar-day is-outside";
    grid.append(blank);
  }

  const legend = document.createElement("div");
  legend.className = "clio-project-calendar-legend";
  [["handoff", "clio_project_calendar_legend_handoff"], ["burn", "clio_project_calendar_legend_burn"]].forEach(([kind, key]) => {
    const item = document.createElement("span");
    const chip = document.createElement("span");
    chip.className = `clio-project-calendar-event is-${kind}`;
    chip.textContent = t(key);
    item.append(chip);
    legend.append(item);
  });
  const wroteItem = document.createElement("span");
  const wroteMark = document.createElement("span");
  wroteMark.className = "clio-project-calendar-wrote";
  wroteItem.append(wroteMark, document.createTextNode(t("clio_project_calendar_wrote")));
  legend.append(wroteItem);
  unread.forEach(({ handoff, name }) => {
    const item = document.createElement("span");
    item.textContent = t("clio_project_calendar_unread", handoff, name);
    legend.append(item);
  });

  root.append(head, grid, legend);
  parts.status.replaceChildren();
  const count = document.createElement("span");
  count.textContent = t("clio_project_calendar_count", dated);
  parts.status.append(count);
}

// ---- Commands -------------------------------------------------------------

function clioProjectSelectedNode(plan = null) {
  const project = clioProjectActive();
  if (!project) return null;
  return (plan || clioProjectPlanFor(project)).nodes.find((node) => node.id === clioProjectSelected) || null;
}

function selectClioProjectNode(id, { focus = false } = {}) {
  clioProjectSelected = String(id || "");
  renderClioProject();
  if (focus) clioProjectFields()?.canvas.querySelector(`[data-node-id="${CSS.escape(clioProjectSelected)}"]`)?.focus();
}

function toggleClioProjectDone(nodeId, done) {
  commitClioProject((record, now) => clioProjectModel().setClioProjectTaskDone(record, nodeId, done, now));
}

function commitClioProjectField(field, value) {
  const node = clioProjectSelectedNode();
  if (!node || !node.addressable) return;
  const model = clioProjectModel();
  if (field === "date" && String(value || "").trim() === node.date) return;
  if (field === "note" && String(value || "") === node.note) return;
  if (field === "title" && String(value || "").trim() === node.title) return;
  commitClioProject((record, now) => {
    if (field === "date") return model.setClioProjectTaskDate(record, node.id, value, now);
    if (field === "note") return model.setClioProjectTaskNote(record, node.id, value, now);
    return model.updateClioProjectOwnTask(record, node.id, { title: value }, now);
  });
}

// A task hangs from the selected stop or section, or — when a task is
// selected — from that task's own parent: the plan has two levels.
function addClioProjectTask() {
  const project = clioProjectActive();
  if (!project) return;
  const plan = clioProjectPlanFor(project);
  const selected = clioProjectSelectedNode(plan);
  const parent = selected?.kind === "own"
    ? plan.nodes.find((node) => node.id === selected.parent)
    : (selected?.addressable ? selected : plan.nodes.find((node) => node.id === (clioProjectModel().clioProjectBlockingChain(plan)[0] || "sectionDrafts")));
  if (!parent || parent.kind === "own") return;
  const id = `task:${crypto.randomUUID()}`;
  commitClioProject((record, now) => clioProjectModel().addClioProjectOwnTask(record, {
    id,
    title: t("clio_project_new_task"),
    parent: parent.id,
    parentTitle: clioProjectNodeTitle(parent),
  }, now));
  selectClioProjectNode(id);
  const field = clioProjectFields()?.info.querySelector("#clio-project-task-title");
  if (field) {
    field.focus();
    field.select();
  }
}

function removeClioProjectTask() {
  const project = clioProjectActive();
  const node = clioProjectSelectedNode();
  if (!project || node?.kind !== "own") return;
  const record = clioProjectRecordFor(project);
  const index = record.ownTasks.findIndex((task) => task.id === node.id);
  if (index < 0) return;
  clioProjectLastRemoved = { task: record.ownTasks[index], index };
  clioProjectSelected = node.parent;
  commitClioProject((current, now) => clioProjectModel().removeClioProjectOwnTask(current, node.id, now));
}

function undoClioProjectRemove() {
  const removed = clioProjectLastRemoved;
  if (!removed) return;
  clioProjectLastRemoved = null;
  commitClioProject((record, now) => {
    const next = clioProjectModel().normalizeClioProjectRecord(record);
    next.ownTasks.splice(Math.min(removed.index, next.ownTasks.length), 0, removed.task);
    next.updatedAt = now;
    return next;
  });
  clioProjectSelected = removed.task.id;
  renderClioProject();
}

function markClioProjectSelectedDone() {
  const node = clioProjectSelectedNode();
  if (!node || !node.addressable || node.done) return;
  toggleClioProjectDone(node.id, true);
}

// Section Drafts reads its section picker when it opens, and the picker is
// filled by the lazy Writing Flow module, so the first open loads and fills it
// and the second stands on the section — the same choice the writer would
// make with the picker, matched by the section's title.
async function openClioProjectSection(title) {
  if (typeof openSectionDrafts !== "function") return;
  await openSectionDrafts();
  const picker = typeof draftSectionSelectEl !== "undefined" ? draftSectionSelectEl : null;
  const option = picker && [...picker.options].find((candidate) => candidate.textContent.trim() === String(title || "").trim());
  if (!option || picker.value === option.value) return;
  picker.value = option.value;
  await openSectionDrafts();
}

// Double-click goes there: that stop, or Section Drafts standing on that
// section. A task opens what it hangs from.
function openClioProjectNode(nodeId = clioProjectSelected) {
  const project = clioProjectActive();
  if (!project) return;
  const plan = clioProjectPlanFor(project);
  let node = plan.nodes.find((candidate) => candidate.id === nodeId);
  if (nodeId === CLIO_PROJECT_PILE_ID) return selectClioProjectNode(CLIO_PROJECT_PILE_ID);
  if (node?.kind === "own") node = plan.nodes.find((candidate) => candidate.id === node.parent) || node;
  if (!node) return;
  if (node.kind === "section") return openClioProjectSection(node.title);
  if (node.id === "sectionDrafts" && typeof openSectionDrafts === "function") return openSectionDrafts();
  openWindow(node.window);
}

function resetClioProjectLayout() {
  clioProjectNudges.clear();
  renderClioProject();
}

function setClioProjectView(view) {
  clioProjectView = view === "calendar" ? "calendar" : "plan";
  renderClioProject();
  if (typeof updateMenuState === "function") updateMenuState();
}

function stepClioProjectCalendar(delta) {
  const month = clioProjectCalendarMonth || new Date();
  clioProjectCalendarMonth = new Date(month.getFullYear(), month.getMonth() + delta, 1);
  renderClioProject();
}

// Arrow keys walk the cards in drawing order, so the diagram is usable
// without a pointer: Return opens, Space ticks.
function moveClioProjectSelection(step) {
  const parts = clioProjectFields();
  if (!parts) return;
  const cards = [...parts.canvas.querySelectorAll(".clio-project-node")];
  const index = cards.findIndex((card) => card.dataset.nodeId === clioProjectSelected);
  const target = cards[Math.max(0, Math.min(cards.length - 1, index + step))];
  if (target) selectClioProjectNode(target.dataset.nodeId, { focus: true });
}

// Dragging a card is the nudge. The card follows the pointer 1:1 from where
// it was grabbed and only its own arrows are redrawn while it moves; the full
// render waits for the release.
function wireClioProjectDrag(parts) {
  let drag = null;
  parts.canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("input, button")) return;
    const card = event.target.closest(".clio-project-node");
    if (!card) return;
    const nudge = clioProjectNudges.get(card.dataset.nodeId) || { dx: 0, dy: 0 };
    drag = { card, id: card.dataset.nodeId, startX: event.clientX, startY: event.clientY, base: nudge, moved: false, pointerId: event.pointerId };
  });
  parts.canvas.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      parts.canvas.setPointerCapture(event.pointerId);
      drag.card.classList.add("is-dragging");
    }
    drag.card.style.transform = `translate(${dx}px, ${dy}px)`;
    clioProjectNudges.set(drag.id, { dx: drag.base.dx + dx, dy: drag.base.dy + dy });
    const project = clioProjectActive();
    if (!project) return;
    const plan = clioProjectPlanFor(project);
    renderClioProjectEdges(parts, plan, clioProjectLayout(plan), new Set(clioProjectModel().clioProjectBlockingChain(plan)));
  });
  const stop = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    drag.card.style.transform = "";
    drag = null;
    if (parts.canvas.hasPointerCapture?.(event.pointerId)) parts.canvas.releasePointerCapture(event.pointerId);
    if (moved) {
      // Swallow the click that ends a drag, so a nudge never also selects.
      parts.canvas.addEventListener("click", (click) => click.stopPropagation(), { capture: true, once: true });
      renderClioProject();
    }
  };
  parts.canvas.addEventListener("pointerup", stop);
  parts.canvas.addEventListener("pointercancel", stop);
}

function attachClioProject() {
  const parts = clioProjectFields();
  if (!parts) return;
  if (!clioProjectWired) {
    clioProjectWired = true;
    parts.root.addEventListener("change", (event) => {
      const done = event.target.closest("[data-clio-project-done]");
      if (done && !parts.sheet.contains(done)) toggleClioProjectDone(done.dataset.clioProjectDone, done.checked);
      const field = event.target.closest("[data-clio-project-field]");
      if (field) commitClioProjectField(field.dataset.clioProjectField, field.value);
    });
    parts.root.addEventListener("keydown", (event) => {
      const field = event.target.closest('input[data-clio-project-field]');
      if (field && event.key === "Enter") {
        event.preventDefault();
        field.blur();
        return;
      }
      if (!parts.sheet.hidden && event.key === "Escape") {
        event.preventDefault();
        answerClioProjectFirstLook(false);
        return;
      }
      const card = event.target.closest(".clio-project-node");
      if (!card) return;
      if (event.key === "Enter") {
        event.preventDefault();
        openClioProjectNode(card.dataset.nodeId);
      } else if (event.key === " ") {
        event.preventDefault();
        const check = card.querySelector("input[type=checkbox]:not(:disabled)");
        if (check) toggleClioProjectDone(check.dataset.clioProjectDone, !check.checked);
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        moveClioProjectSelection(1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        moveClioProjectSelection(-1);
      }
    });
    parts.root.addEventListener("click", (event) => {
      const action = event.target.closest("[data-clio-project-action]")?.dataset.clioProjectAction;
      if (action === "add") return addClioProjectTask();
      if (action === "remove") return removeClioProjectTask();
      if (action === "undo-remove") return undoClioProjectRemove();
      if (action === "open") return openClioProjectNode();
      if (action === "first-look-apply") return answerClioProjectFirstLook(true);
      if (action === "first-look-skip") return answerClioProjectFirstLook(false);
      if (action === "month-prev") return stepClioProjectCalendar(-1);
      if (action === "month-next") return stepClioProjectCalendar(1);
      if (event.target.closest("input")) return;
      const card = event.target.closest(".clio-project-node");
      if (card && card.dataset.nodeId !== clioProjectSelected) selectClioProjectNode(card.dataset.nodeId);
    });
    parts.canvas.addEventListener("dblclick", (event) => {
      if (event.target.closest("input")) return;
      const card = event.target.closest(".clio-project-node");
      if (card) openClioProjectNode(card.dataset.nodeId);
    });
    wireClioProjectDrag(parts);
  }
  renderClioProject();
}

async function openClioProject() {
  await openWindow("clioProject");
  stampClioProjectSections();
  renderClioProject();
}

// A section the Outline has not stamped yet cannot be ticked, so opening the
// plan stamps them — on the RECORD, with the same pure function every outline
// edit stamps with (ensureMarkdownSectionIds), written through the one outline
// setter. It deliberately does not call the Writing Flow's
// stampOutlineSectionIds: that pass reads the Outline field and dispatches an
// input event on it, and during the manuscript phase that event wrote the
// whole manuscript into project.outline (reproduced 2026-09-23 on the DTK
// disk: 2,462 → 8,899 characters). Only ids are added; nothing is stamped
// while the writer's caret is in the Outline; and an Outline window that is
// already open is handed the new record through its own projection.
function stampClioProjectSections() {
  const project = clioProjectActive();
  if (!project || typeof ensureMarkdownSectionIds !== "function" || typeof setProjectOutlineMarkdown !== "function") return false;
  if (typeof outlineContentEl !== "undefined" && outlineContentEl && document.activeElement === outlineContentEl) return false;
  const sections = clioProjectOutlineFor(project).sections || [];
  if (!sections.some((section) => !section?.id)) return false;
  const stamped = ensureMarkdownSectionIds(project.outline || "");
  if (!stamped.changed) return false;
  setProjectOutlineMarkdown(project, stamped.markdown);
  project.updatedAt = new Date().toISOString();
  if (window.AISystem6WritingFlowLoaded && typeof syncOutlineDomFromProject === "function") syncOutlineDomFromProject(project);
  saveDeskState();
  return true;
}

function clioProjectIsFront() {
  return document.querySelector(".window.is-active")?.dataset.window === "clioProject";
}

window.AISystem6Runtime?.registerApplication({
  id: "clioProject",
  windowName: "clioProject",
  mount: attachClioProject,
  restore: attachClioProject,
  commands: {
    "open-clio-project": { handler: () => openClioProject(), isAvailable: () => true },
    "clio-project-reset-layout": {
      handler: () => resetClioProjectLayout(),
      isAvailable: () => clioProjectIsFront() && clioProjectView === "plan",
    },
    "clio-project-view-plan": { handler: () => setClioProjectView("plan"), isAvailable: clioProjectIsFront },
    "clio-project-view-calendar": { handler: () => setClioProjectView("calendar"), isAvailable: clioProjectIsFront },
    "clio-project-add-task": {
      handler: () => addClioProjectTask(),
      isAvailable: () => clioProjectIsFront() && clioProjectView === "plan" && !!clioProjectActive(),
    },
    "clio-project-mark-done": {
      handler: () => markClioProjectSelectedDone(),
      isAvailable: () => {
        if (!clioProjectIsFront() || clioProjectView !== "plan") return false;
        const node = clioProjectSelectedNode();
        return !!node && node.addressable && !node.done;
      },
    },
    "clio-project-open-node": {
      handler: () => openClioProjectNode(),
      isAvailable: () => clioProjectIsFront() && clioProjectView === "plan" && !!clioProjectSelectedNode(),
    },
  },
});

window.AISystem6ClioProjectWindow = Object.freeze({
  attach: attachClioProject,
  render: renderClioProject,
  resetLayout: resetClioProjectLayout,
  currentView: () => clioProjectView,
});

window.AISystem6ClioProjectWindowLoaded = true;
