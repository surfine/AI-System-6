// Feature module: ClioProject 项目表 — the window half of the plan.
//
// The model half lives in app/core/clio-project.js and is the authority on
// what this window may show and keep. The plan is DERIVED: nodes and arrows
// are computed from the route and the Outline on every render, exactly the
// way the outline tree is derived from Markdown. Only the writer's decisions
// persist — whether a task is done, and a date they typed — and they live on
// the project record itself (`project.clioProject`), so they travel with the
// disk through backups the way every other per-project fact does.
//
// The bolded run is 「卡住交付的链」/ "the chain blocking the handoff": the
// unfinished work between where the project actually is and the Project CD.
// It is not a critical path — that would need durations this product does not
// have — and the code must not call it one.
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
    // ClioTalk. No titleKey on purpose — there is nothing to translate.
    title: "ClioProject",
    statusClass: "compact-status-bar",
    statusHtml: `<span class="status-bar-leading" id="clio-project-chain-label"></span>
          <button class="btn details-bar-button status-bar-trailing" type="button" id="clio-project-reset" data-action="clio-project-reset-layout" data-i18n="clio_project_reset_layout">Reset Layout</button>`,
    paneClass: "clio-project-pane",
    paneHtml: `
          <div class="clio-project-canvas" id="clio-project-canvas">
            <svg class="clio-project-edges" id="clio-project-edges" aria-hidden="true" focusable="false"></svg>
          </div>
          <div class="clio-project-done" id="clio-project-done" hidden>
            <button class="btn mini-btn clio-project-done-toggle" type="button" id="clio-project-done-toggle" aria-expanded="false"></button>
            <ul class="clio-project-done-list" id="clio-project-done-list" hidden></ul>
          </div>`,
  });
  if (typeof applyLanguage === "function") applyLanguage();
}

installClioProjectWindow();

// Where a card sits after the writer pushed it. Session-local on purpose.
const clioProjectNudges = new Map();
let clioProjectDoneOpen = false;
let clioProjectParts = null;
let clioProjectWired = false;

const CLIO_PROJECT_CARD_WIDTH = 200;
const CLIO_PROJECT_CARD_HEIGHT = 56;
const CLIO_PROJECT_ROW_GAP = 26;
const CLIO_PROJECT_COLUMN_GAP = 56;
const CLIO_PROJECT_MARGIN = 16;

function clioProjectFields() {
  if (clioProjectParts?.canvas?.isConnected) return clioProjectParts;
  const root = document.querySelector('[data-window="clioProject"]');
  if (!root) return null;
  clioProjectParts = {
    root,
    chainLabel: root.querySelector("#clio-project-chain-label"),
    reset: root.querySelector("#clio-project-reset"),
    canvas: root.querySelector("#clio-project-canvas"),
    edges: root.querySelector("#clio-project-edges"),
    done: root.querySelector("#clio-project-done"),
    doneToggle: root.querySelector("#clio-project-done-toggle"),
    doneList: root.querySelector("#clio-project-done-list"),
  };
  return clioProjectParts.canvas ? clioProjectParts : null;
}

function clioProjectRecordFor(project) {
  return window.AISystem6ClioProject.normalizeClioProjectRecord(project?.clioProject || {});
}

function clioProjectOutlineFor(project) {
  return typeof markdownOutlineTree === "function"
    ? markdownOutlineTree(project?.outline || "")
    : { sections: [] };
}

function clioProjectPlanFor(project) {
  return window.AISystem6ClioProject.clioProjectPlan(clioProjectRecordFor(project), clioProjectOutlineFor(project));
}

// The one write path. Prunes against the freshly derived plan on the way out,
// so a deleted section's tick cannot live in storage forever, then saves the
// desk: the record rides inside the project, never in a store of its own.
function writeClioProjectRecord(project, next) {
  const model = window.AISystem6ClioProject;
  project.clioProject = model.pruneClioProjectRecord(next, clioProjectPlanFor(project));
  project.updatedAt = new Date().toISOString();
  saveDeskState();
  renderClioProject();
}

function clioProjectNodeTitle(node) {
  if (node.kind === "section") return node.title || t("untitled");
  return t(node.labelKey);
}

// Auto-layout: the route runs down the left as a column, and the Outline's
// sections hang in a second column beside Section Drafts — the fan the model's
// edges already describe. Done cards fold out of the diagram, so the column
// compacts instead of holding a hole open.
function clioProjectLayout(plan) {
  const positions = new Map();
  const stops = plan.nodes.filter((node) => node.kind === "stop" && !node.done);
  const sections = plan.nodes.filter((node) => node.kind === "section" && !node.done);

  stops.forEach((node, index) => {
    positions.set(node.id, {
      x: CLIO_PROJECT_MARGIN,
      y: CLIO_PROJECT_MARGIN + index * (CLIO_PROJECT_CARD_HEIGHT + CLIO_PROJECT_ROW_GAP),
    });
  });

  const draftsIndex = stops.findIndex((node) => node.id === "sectionDrafts");
  const fanTop = CLIO_PROJECT_MARGIN + Math.max(0, draftsIndex) * (CLIO_PROJECT_CARD_HEIGHT + CLIO_PROJECT_ROW_GAP);
  sections.forEach((node, index) => {
    positions.set(node.id, {
      x: CLIO_PROJECT_MARGIN + CLIO_PROJECT_CARD_WIDTH + CLIO_PROJECT_COLUMN_GAP,
      y: fanTop + index * (CLIO_PROJECT_CARD_HEIGHT + CLIO_PROJECT_ROW_GAP),
    });
  });

  positions.forEach((position, id) => {
    const nudge = clioProjectNudges.get(id);
    if (!nudge) return;
    position.x = Math.max(0, position.x + nudge.dx);
    position.y = Math.max(0, position.y + nudge.dy);
  });
  return positions;
}

function clioProjectEdgePath(from, to) {
  // Vertical neighbours connect bottom-to-top; columns connect side-to-side.
  if (Math.abs(from.x - to.x) < 1) {
    return {
      x1: from.x + CLIO_PROJECT_CARD_WIDTH / 2,
      y1: from.y + CLIO_PROJECT_CARD_HEIGHT,
      x2: to.x + CLIO_PROJECT_CARD_WIDTH / 2,
      y2: to.y,
    };
  }
  const leftToRight = from.x < to.x;
  return {
    x1: from.x + (leftToRight ? CLIO_PROJECT_CARD_WIDTH : 0),
    y1: from.y + CLIO_PROJECT_CARD_HEIGHT / 2,
    x2: to.x + (leftToRight ? 0 : CLIO_PROJECT_CARD_WIDTH),
    y2: to.y + CLIO_PROJECT_CARD_HEIGHT / 2,
  };
}

function renderClioProject() {
  const parts = clioProjectFields();
  if (!parts) return;
  const model = window.AISystem6ClioProject;
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;

  if (!project) {
    parts.chainLabel.textContent = t("no_project_mounted");
    [...parts.canvas.querySelectorAll(".clio-project-node")].forEach((node) => node.remove());
    parts.edges.replaceChildren();
    parts.done.hidden = true;
    return;
  }

  const plan = clioProjectPlanFor(project);
  const chain = model.clioProjectBlockingChain(plan);
  const chainSet = new Set(chain);
  const doneNodes = model.clioProjectDoneNodes(plan);
  const positions = clioProjectLayout(plan);

  parts.chainLabel.textContent = chain.length
    ? t("clio_project_chain", chain.length)
    : t("clio_project_chain_clear");

  // Edges first, so the arrows sit under the cards. An edge whose endpoint is
  // folded away is not drawn — the fold said where that work went.
  parts.edges.replaceChildren();
  const svgNS = "http://www.w3.org/2000/svg";
  let extentX = 0;
  let extentY = 0;
  positions.forEach((position) => {
    extentX = Math.max(extentX, position.x + CLIO_PROJECT_CARD_WIDTH);
    extentY = Math.max(extentY, position.y + CLIO_PROJECT_CARD_HEIGHT);
  });
  const width = extentX + CLIO_PROJECT_MARGIN;
  const height = extentY + CLIO_PROJECT_MARGIN;
  parts.edges.setAttribute("viewBox", `0 0 ${width} ${height}`);
  parts.edges.setAttribute("width", String(width));
  parts.edges.setAttribute("height", String(height));
  parts.canvas.style.setProperty("--clio-project-canvas-min-w", `${width}px`);
  parts.canvas.style.setProperty("--clio-project-canvas-min-h", `${height}px`);

  plan.edges.forEach((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return;
    const line = document.createElementNS(svgNS, "line");
    const { x1, y1, x2, y2 } = clioProjectEdgePath(from, to);
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    if (chainSet.has(edge.from) && chainSet.has(edge.to)) line.classList.add("is-blocking");
    parts.edges.append(line);
  });

  // Cards. Rebuilt each render: the plan is derived, and so is its picture.
  [...parts.canvas.querySelectorAll(".clio-project-node")].forEach((node) => node.remove());
  plan.nodes.forEach((node) => {
    const position = positions.get(node.id);
    if (!position) return;
    const card = document.createElement("div");
    card.className = "clio-project-node";
    card.dataset.nodeId = node.id;
    if (chainSet.has(node.id)) card.classList.add("is-blocking");
    card.style.setProperty("--clio-project-x", `${position.x}px`);
    card.style.setProperty("--clio-project-y", `${position.y}px`);

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = node.done;
    check.setAttribute("aria-label", t("clio_project_mark_done", clioProjectNodeTitle(node)));
    check.dataset.clioProjectDone = node.id;

    const title = document.createElement("button");
    title.type = "button";
    title.className = "clio-project-node-title";
    title.dataset.clioProjectOpen = node.window;
    title.textContent = clioProjectNodeTitle(node);

    const date = document.createElement("input");
    date.type = "text";
    date.className = "clio-project-date";
    date.value = node.date;
    date.placeholder = t("clio_project_date_placeholder");
    date.setAttribute("aria-label", t("clio_project_date_placeholder"));
    date.dataset.clioProjectDate = node.id;

    card.append(check, title, date);
    parts.canvas.append(card);
  });

  parts.done.hidden = !doneNodes.length;
  parts.doneToggle.textContent = t("clio_project_done_fold", doneNodes.length);
  parts.doneToggle.setAttribute("aria-expanded", String(clioProjectDoneOpen));
  parts.doneList.hidden = !clioProjectDoneOpen;
  parts.doneList.replaceChildren();
  doneNodes.forEach((node) => {
    const row = document.createElement("li");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = true;
    check.dataset.clioProjectDone = node.id;
    check.setAttribute("aria-label", t("clio_project_mark_done", clioProjectNodeTitle(node)));
    const label = document.createElement("span");
    label.textContent = clioProjectNodeTitle(node);
    row.append(check, label);
    parts.doneList.append(row);
  });
}

function toggleClioProjectDone(nodeId, done) {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project) return;
  const model = window.AISystem6ClioProject;
  writeClioProjectRecord(
    project,
    model.setClioProjectTaskDone(clioProjectRecordFor(project), nodeId, done, new Date().toISOString()),
  );
}

function commitClioProjectDate(nodeId, value) {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project) return;
  const model = window.AISystem6ClioProject;
  const record = clioProjectRecordFor(project);
  const current = record.tasks[nodeId]?.date || "";
  if (current === String(value || "").trim()) return;
  writeClioProjectRecord(
    project,
    model.setClioProjectTaskDate(record, nodeId, value, new Date().toISOString()),
  );
}

function resetClioProjectLayout() {
  clioProjectNudges.clear();
  renderClioProject();
}

// Dragging a card is the nudge. Pointer events so touch works; the checkbox,
// the title button and the date field keep their own gestures.
function wireClioProjectDrag(parts) {
  let dragging = null;
  parts.canvas.addEventListener("pointerdown", (event) => {
    if (event.target.closest("input, button")) return;
    const card = event.target.closest(".clio-project-node");
    if (!card) return;
    const nudge = clioProjectNudges.get(card.dataset.nodeId) || { dx: 0, dy: 0 };
    dragging = {
      id: card.dataset.nodeId,
      startX: event.clientX,
      startY: event.clientY,
      baseDx: nudge.dx,
      baseDy: nudge.dy,
    };
    parts.canvas.setPointerCapture(event.pointerId);
  });
  parts.canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    clioProjectNudges.set(dragging.id, {
      dx: dragging.baseDx + (event.clientX - dragging.startX),
      dy: dragging.baseDy + (event.clientY - dragging.startY),
    });
    renderClioProject();
  });
  const stop = (event) => {
    if (!dragging) return;
    dragging = null;
    if (parts.canvas.hasPointerCapture?.(event.pointerId)) parts.canvas.releasePointerCapture(event.pointerId);
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
      if (done) toggleClioProjectDone(done.dataset.clioProjectDone, done.checked);
    });
    parts.root.addEventListener("focusout", (event) => {
      const date = event.target.closest("[data-clio-project-date]");
      if (date) commitClioProjectDate(date.dataset.clioProjectDate, date.value);
    });
    parts.root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const date = event.target.closest("[data-clio-project-date]");
      if (date) {
        event.preventDefault();
        date.blur();
      }
    });
    parts.canvas.addEventListener("click", (event) => {
      const open = event.target.closest("[data-clio-project-open]");
      if (open) openWindow(open.dataset.clioProjectOpen);
    });
    parts.doneToggle.addEventListener("click", () => {
      clioProjectDoneOpen = !clioProjectDoneOpen;
      renderClioProject();
    });
    wireClioProjectDrag(parts);
  }
  renderClioProject();
}

async function openClioProject() {
  await openWindow("clioProject");
  renderClioProject();
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
      isAvailable: () => document.querySelector(".window.is-active")?.dataset.window === "clioProject",
    },
  },
});

window.AISystem6ClioProjectWindow = Object.freeze({
  attach: attachClioProject,
  render: renderClioProject,
  resetLayout: resetClioProjectLayout,
});

window.AISystem6ClioProjectWindowLoaded = true;
