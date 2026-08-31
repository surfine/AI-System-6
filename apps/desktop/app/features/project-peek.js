// Feature module: project-peek — looking inside a disk you have not mounted.
//
// Double-clicking an ejected disk on the desktop opens this. It answers one
// question — "which project did I file that in?" — and deliberately answers no
// others: you can read, and that is all.
//
// It is not a second Finder. Threading another project through the Project Hard
// Disk window would have put a writable surface and a read-only one in the same
// 112-line render, and "one property, one owner" is the rule that keeps the
// write lease honest. It is not TeachText either: opening another project's
// document into the manuscript surface would hand the route a document from a
// disk it does not own, which is the one thing the route's single-owner rule
// exists to prevent. So the text is shown here, inside the window that cannot
// write it, and nothing about another project ever reaches a route surface.
//
// The figure is the pile: a list on top, the selected thing below it. Hold That
// Thought uses the same one for the same reason — you are going through
// something rather than working in it.
//
// Contract: tests/features/desktop-project-disks.test.mjs

// projectPeek's markup lived in index.html, downloaded by every boot for a
// window this module already loads on demand. Built here at module eval,
// before anything below queries its own elements. openWindow() installs
// the grow box.
function installProjectPeekWindow() {
  if (typeof document === "undefined") return;
  if (document.querySelector('[data-window="projectPeek"]')) return;
  window.AISystem6ApplicationShell.createWindow({
    windowName: "projectPeek",
    windowClass: "project-peek-window",
    labelledBy: "project-peek-title",
    title: "Project Peek",
    statusClass: "compact-status-bar",
    statusHtml: `<span class="status-bar-leading" id="project-peek-count">0 items</span>
          <span class="status-bar-trailing" data-i18n="read_only">Read only</span>`,
    paneClass: "project-peek-pane",
    paneHtml: `
          <ul class="project-peek-list" id="project-peek-list" hidden></ul>
          <p class="hint project-peek-provenance" id="project-peek-provenance" hidden></p>
          <textarea id="project-peek-body" class="project-peek-body" rows="8" readonly hidden></textarea>
          <div class="button-row">
            <span class="spacer"></span>
            <button class="btn default" type="button" id="project-peek-mount" data-action="project-peek-mount">Mount</button>
          </div>`,
  });
}

installProjectPeekWindow();
// How much of an imported reference the peek shows before it says it stopped.
const PEEK_REFERENCE_PREVIEW = 2000;
// documentId -> version count, for documents in the peeked project that have a
// darkroom record. Filled once when the disk is opened, so render stays sync.
const peekDarkroomVersions = new Map();
let peekedProjectId = "";
let peekedFileId = "";
let projectPeekParts = null;

function projectPeekFields() {
  if (projectPeekParts?.pane?.isConnected) return projectPeekParts;
  const root = document.querySelector('[data-window="projectPeek"]');
  if (!root) return null;
  projectPeekParts = {
    root,
    pane: root.querySelector(".project-peek-pane"),
    title: root.querySelector("#project-peek-title"),
    count: root.querySelector("#project-peek-count"),
    list: root.querySelector("#project-peek-list"),
    body: root.querySelector("#project-peek-body"),
    provenance: root.querySelector("#project-peek-provenance"),
    mount: root.querySelector("#project-peek-mount"),
  };
  return projectPeekParts.pane ? projectPeekParts : null;
}

function peekedProject() {
  return projects.find((project) => project.id === peekedProjectId) || null;
}

// The disk holds four kinds of durable thing, and the question this window
// answers -- "which project did I file that in?" -- is the same for all of
// them. They share one list rather than four, because four lists would be the
// second Finder this window exists not to be. Each row already carries a kind,
// so the mixing costs nothing to read.
//
// Darkroom records are deliberately NOT a fifth kind. Their key is
// darkroom:<projectId>:<documentId> -- they are one document's editing history,
// not something filed beside it -- so listing them would show every developed
// document twice. They mark the document's own row instead.
function peekedProjectFiles() {
  if (!peekedProjectId) return [];
  const stamp = (value) => String(value || "");
  const items = [];
  for (const file of chatFiles) {
    if (file.projectId !== peekedProjectId) continue;
    items.push({ kind: "document", id: file.id, record: file, at: stamp(file.updatedAt) });
  }
  for (const scrap of typeof scraps !== "undefined" ? scraps : []) {
    if (scrap.projectId !== peekedProjectId) continue;
    items.push({ kind: "scrap", id: scrap.id, record: scrap, at: stamp(scrap.updatedAt || scrap.createdAt) });
  }
  for (const reference of typeof projectReferences !== "undefined" ? projectReferences : []) {
    if (reference.projectId !== peekedProjectId) continue;
    items.push({ kind: "reference", id: reference.id, record: reference, at: stamp(reference.updatedAt || reference.createdAt) });
  }
  // Not getProjectCdItems(): its first line is `if (!isProjectMounted) return []`,
  // and this window looks at disks that are precisely NOT mounted, so it could
  // only ever answer empty here. Reading the array directly is safe because
  // peeking never writes; the mount guard protects writes, which this has none of.
  for (const item of typeof projectCdItems !== "undefined" ? projectCdItems : []) {
    if (item.projectId !== peekedProjectId) continue;
    items.push({ kind: "cd", id: item.id, record: item, at: stamp(item.updatedAt || item.createdAt) });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

function peekItemName(entry) {
  if (entry.kind === "document") return getFinderItemName(entry.record);
  return String(entry.record.title || entry.record.name || t("untitled"));
}

function peekItemKindLabel(entry) {
  if (entry.kind === "document") return getFinderItemKindLabel(entry.record);
  if (entry.kind === "scrap") return t("scrapbook");
  if (entry.kind === "reference") return t("project_references");
  return t("project_cd");
}

function selectedPeekFile() {
  const files = peekedProjectFiles();
  return files.find((entry) => entry.id === peekedFileId) || files[0] || null;
}

function renderProjectPeek() {
  const parts = projectPeekFields();
  if (!parts) return;
  const project = peekedProject();
  const files = peekedProjectFiles();
  const file = selectedPeekFile();

  parts.title.textContent = project ? projectDisplayName(project) : t("project_peek");
  parts.count.textContent = t("project_peek_count", files.length);

  parts.list.replaceChildren();
  files.forEach((entry) => {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `project-peek-row${entry.id === file?.id ? " is-current" : ""}`;
    button.dataset.peekFile = entry.id;
    if (entry.id === file?.id) button.setAttribute("aria-current", "true");
    const name = document.createElement("b");
    name.textContent = peekItemName(entry);
    const kind = document.createElement("small");
    kind.textContent = peekItemKindLabel(entry);
    button.append(name, kind);
    // A developed document says so on its own row rather than appearing twice.
    const versions = entry.kind === "document" ? peekDarkroomVersions.get(entry.id) : undefined;
    if (versions !== undefined) {
      const mark = document.createElement("small");
      mark.className = "project-peek-darkroom";
      mark.textContent = versions > 0 ? t("project_peek_has_darkroom", versions) : t("project_peek_has_darkroom_plain");
      button.append(mark);
    }
    row.append(button);
    parts.list.append(row);
  });

  // An empty disk says so rather than showing an empty box that asks a question
  // and never answers it.
  parts.list.hidden = !files.length;

  // What the pane shows depends on what was selected. A scrap without its
  // provenance is just an unattributed paragraph, which is the difference
  // between Scrapbook and a note pad. A reference can be a whole imported PDF,
  // and this window answers "where did I file it", not "read it here", so it
  // shows the opening and says plainly that it stopped.
  const body = file ? String(file.record.body || file.record.text || "") : "";
  const truncated = file?.kind === "reference" && body.length > PEEK_REFERENCE_PREVIEW;
  parts.body.value = truncated ? body.slice(0, PEEK_REFERENCE_PREVIEW) : body;
  parts.body.hidden = !files.length;

  if (parts.provenance) {
    let note = "";
    if (file?.kind === "scrap") {
      const source = String(file.record.sourceTitle || file.record.source?.title || "").trim();
      if (source) note = t("project_peek_from", source);
    } else if (truncated) {
      note = t("project_peek_truncated");
    }
    parts.provenance.textContent = note;
    parts.provenance.hidden = !note;
  }
  parts.mount.textContent = project ? t("project_peek_mount", projectDisplayName(project)) : t("mount");
}

async function openProjectPeek(projectId) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return;
  // Mounting is the way to write; peeking never becomes it by accident.
  if (project.id === activeProjectId && isProjectMounted) {
    await openWindow("projects");
    return;
  }
  peekedProjectId = project.id;
  peekedFileId = "";
  peekDarkroomVersions.clear();
  await openWindow("projectPeek");
  renderProjectPeek();
  // Darkroom records live one keyval entry per document and load asynchronously,
  // while this render is synchronous by design. So collect them once, after the
  // window is already showing its list, and redraw when they arrive. A disk with
  // nothing developed costs one pass over its documents and changes nothing.
  await collectPeekDarkroomMarks(project.id);
}

async function collectPeekDarkroomMarks(projectId) {
  if (typeof ensureDarkroomModule !== "function") return;
  const documents = chatFiles.filter((file) => file.projectId === projectId);
  if (!documents.length) return;
  try {
    await ensureDarkroomModule();
    for (const file of documents) {
      const record = await window.AISystem6DarkroomStore?.loadDarkroomRecord?.(projectId, file.id);
      if (!record) continue;
      const developed = Boolean(String(record.negative || "").trim())
        || (record.adjustmentLayers?.length || 0) > 0
        || (record.versions?.length || 0) > 0;
      if (developed) peekDarkroomVersions.set(file.id, record.versions?.length || 0);
    }
  } catch {
    // A disk whose darkroom cannot be read still lists its documents. The mark
    // is extra information, never the reason the window works.
    return;
  }
  if (peekedProjectId === projectId) renderProjectPeek();
}

function selectPeekFile(fileId) {
  peekedFileId = String(fileId || "");
  renderProjectPeek();
}

// The one door out of read-only, and it is explicit: mounting is a decision,
// never a side effect of having looked.
async function mountPeekedProject() {
  const project = peekedProject();
  if (!project) return;
  // Switch first, close second. The dispatcher runs updateMenuState() between
  // calling a handler and its promise settling, so closing the window up front
  // put a menu redraw inside the mount and the switch did not land. It is also
  // the right order on its own: if mounting fails the peek is still there.
  await switchProject(project.id);
  peekedProjectId = "";
  closeWindow("projectPeek");
}

function mountProjectPeekRuntime() {
  const parts = projectPeekFields();
  if (!parts) return;
  if (parts.root.dataset.projectPeekWired !== "true") {
    parts.root.dataset.projectPeekWired = "true";
    parts.list.addEventListener("click", (event) => {
      const row = event.target.closest("[data-peek-file]");
      if (row) selectPeekFile(row.dataset.peekFile);
    });
  }
  renderProjectPeek();
}

window.AISystem6Runtime?.registerApplication({
  id: "projectPeek",
  windowName: "projectPeek",
  mount: () => mountProjectPeekRuntime(),
  restore: () => mountProjectPeekRuntime(),
  commands: {
    "project-peek-mount": { handler: () => mountPeekedProject(), isAvailable: () => !!peekedProject() },
  },
});

window.AISystem6ProjectPeekLoaded = true;
