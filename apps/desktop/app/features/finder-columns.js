// One view of Project Hard Disk, using its existing IDs, descriptors and
// commands. Shelf entries are personal references, never project contents.
(() => {
  let root = null;
  let enabled = true;
  let selected = null;
  let projectSeen = "";
  let generation = 0;
  let switchQueue = Promise.resolve();
  let queued = false;
  const refKey = (ref) => `${ref.kind}:${ref.projectId}:${ref.id}`;
  const active = () => enabled && window.AISystem6Theme.getCurrentTheme() === "nextstep";
  const validRef = (ref) => ref && ["project", "folder", "file", "projectReference"].includes(ref.kind)
    && typeof ref.projectId === "string" && typeof ref.id === "string";
  const shelf = () => (Array.isArray(nextstepFinderPreferences.shelf) ? nextstepFinderPreferences.shelf : []).filter(validRef).slice(0, 128);
  const ref = (kind, item) => ({ kind, projectId: kind === "project" ? item.id : item.projectId, id: item.id });

  function resolve(reference) {
    if (!validRef(reference)) return null;
    if (reference.kind === "project") return projects.find((item) => item.id === reference.id) || null;
    if (!projects.some((item) => item.id === reference.projectId)) return null;
    const list = reference.kind === "folder" ? chatFolders : reference.kind === "file" ? chatFiles : projectReferences;
    return list.find((item) => item.id === reference.id && item.projectId === reference.projectId) || null;
  }

  function descriptor(reference) {
    const item = resolve(reference);
    if (!item) return null;
    if (reference.kind === "folder") return getProjectFolderFinderItem(item);
    if (reference.kind === "file") return getProjectFileFinderItem(item);
    if (reference.kind === "projectReference") return getProjectReferenceFinderItem(item);
    return { ...item, type: "project", iconId: "projectDisk", canRename: false, canTrash: false, readOnly: true };
  }

  function list(parentId) {
    return [
      ...getProjectFolders().filter((item) => (item.parentId || null) === parentId).map((item) => ref("folder", item)),
      ...getProjectFiles().filter((item) => (item.folderId || null) === parentId).map((item) => ref("file", item)),
      ...(parentId ? [] : projectReferences.filter((item) => item.projectId === activeProjectId).map((item) => ref("projectReference", item))),
    ];
  }

  function path() {
    const result = []; const seen = new Set();
    let folder = getProjectFolders().find((item) => item.id === selectedFolderId);
    while (folder && !seen.has(folder.id)) {
      seen.add(folder.id); result.unshift(ref("folder", folder));
      folder = getProjectFolders().find((item) => item.id === folder.parentId);
    }
    return result;
  }

  function select(reference) {
    const item = resolve(reference);
    if (!item || reference.projectId !== activeProjectId) return;
    selected = reference;
    if (reference.kind === "folder") selectedFolderId = item.id;
    else selectedFolderId = item.folderId || "all";
    if (reference.kind === "projectReference") {
      selectDocumentItem("projectReference", item.id);
      selectedProjectReferenceId = item.id;
    } else if (reference.kind !== "project") selectDocumentItem(reference.kind, item.id);
    focusWindow(getWindow("projects"));
    if (reference.kind === "folder") schedule();
    else root?.querySelectorAll("[data-ref-key]").forEach((node) => {
      const match = node.dataset.refKey === refKey(reference);
      node.classList.toggle("is-selected", match); node.setAttribute("aria-pressed", String(match));
    });
  }

  async function open(reference) {
    const request = ++generation;
    const execute = async () => {
      if (request !== generation || !validRef(reference)) return;
      if (reference.projectId !== activeProjectId || !isProjectMounted) {
        const result = await switchProject(reference.projectId);
        if (result === false || request !== generation || activeProjectId !== reference.projectId) return;
        await openWindow("projects");
      }
      if (request !== generation || !active()) return;
      const item = descriptor(reference);
      if (!item) { setStatus(t("nextstep_shelf_missing")); schedule(); return; }
      if (reference.kind === "project") {
        clearDocumentSelection(); selectedChatFileId = null; selectedDocumentFolderId = null;
        selectedProjectReferenceId = null; selectedProjectRootItemId = null;
        selectedFolderId = "all"; selected = reference; updateMenuState();
      }
      else {
        select(reference);
        if (reference.kind !== "folder") await item.open?.();
      }
      if (request === generation && activeProjectId === reference.projectId) schedule();
    };
    switchQueue = switchQueue.then(execute, execute);
    return switchQueue;
  }

  function pin(reference) {
    const item = descriptor(reference);
    if (!item) return;
    const items = shelf();
    if (!items.some((entry) => refKey(entry) === refKey(reference))) items.push({ ...reference, label: item.name });
    nextstepFinderPreferences.shelf = items;
    scheduleSettingsSave(); schedule();
  }

  function unpin(reference) {
    nextstepFinderPreferences.shelf = shelf().filter((entry) => refKey(entry) !== refKey(reference));
    scheduleSettingsSave(); schedule();
  }

  function button(label, run) {
    const node = document.createElement("button"); node.type = "button"; node.textContent = label;
    node.addEventListener("click", run); return node;
  }

  function objectButton(reference, { shelfItem = false } = {}) {
    const item = descriptor(reference);
    const label = item?.name || reference.label || reference.id;
    const node = button(label, (event) => {
      if (shelfItem || reference.kind === "project" || reference.kind === "folder" || event.detail === 0 || event.pointerType === "touch") open(reference);
      else if (event.detail === 2) open(reference);
      else select(reference);
    });
    node.dataset.refKey = refKey(reference);
    node.dataset.objectId = reference.id;
    node.className = "nextstep-column-item";
    node.classList.toggle("is-selected", !!selected && refKey(selected) === refKey(reference));
    node.setAttribute("aria-pressed", String(!!selected && refKey(selected) === refKey(reference)));
    if (!item) { node.classList.add("is-stale"); node.title = t("nextstep_shelf_missing"); }
    const icon = document.createElement("span");
    icon.innerHTML = renderSystemIcon(item?.iconId || "document", { size: "small" });
    node.prepend(icon);
    node.draggable = !!item;
    node.addEventListener("dragstart", (event) => event.dataTransfer.setData("application/x-system6-reference", JSON.stringify(reference)));
    return node;
  }

  function column(label, items) {
    const node = document.createElement("section"); node.className = "nextstep-finder-column";
    node.setAttribute("aria-label", label);
    items.forEach((reference) => node.append(objectButton(reference)));
    node.addEventListener("focusin", () => window.refreshFinderContinuationIndicators?.());
    node.addEventListener("keydown", (event) => {
      const choices = Array.from(node.querySelectorAll("button")); const index = choices.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? Math.min(index + 1, choices.length - 1) : event.key === "ArrowUp" ? Math.max(0, index - 1)
        : event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); choices[next]?.focus(); }
      if (event.key === "ArrowRight") { event.preventDefault(); document.activeElement?.click(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); node.previousElementSibling?.querySelector("button")?.focus(); }
    });
    return node;
  }

  function mount() {
    const win = getWindow("projects");
    if (!win || root) return;
    root = document.createElement("section"); root.className = "nextstep-file-viewer";
    root.setAttribute("aria-label", t("nextstep_file_viewer"));
    win.querySelector(".project-disk-content-grid").append(root);
    const control = button(t("nextstep_columns"), () => { enabled = true; schedule(); });
    control.className = "btn nextstep-columns-switch";
    control.dataset.i18n = "nextstep_columns";
    win.querySelector(".view-controls").append(control);
    win.querySelectorAll(".view-btn").forEach((node) => node.addEventListener("click", () => { const item = selected?.kind === "folder" ? resolve(selected) : null;
      if (item) selectedFolderId = item.parentId || "all";
      enabled = false; schedule(); }));
  }

  function sync() {
    queued = false;
    if (window.AISystem6Theme.getCurrentTheme() === "nextstep") mount();
    if (!root) return;
    const win = getWindow("projects");
    root.hidden = !active();
    win.querySelector(".nextstep-columns-switch").textContent = t("nextstep_columns");
    win.querySelector(".nextstep-columns-switch").hidden = window.AISystem6Theme.getCurrentTheme() !== "nextstep";
    win.classList.toggle("has-nextstep-columns", active());
    if (!active()) return;
    if (projectSeen !== activeProjectId) { selected = null; projectSeen = activeProjectId; }
    const focusedKey = root.contains(document.activeElement) ? document.activeElement.dataset.refKey : "";
    const oldScroll = root.querySelector(".nextstep-finder-columns")?.scrollLeft || 0;
    root.replaceChildren();
    const shelfNode = document.createElement("div"); shelfNode.className = "nextstep-shelf";
    shelfNode.setAttribute("aria-label", t("nextstep_shelf"));
    let labelsChanged = false;
    shelf().forEach((reference) => {
      const name = descriptor(reference)?.name;
      if (name && name !== reference.label) { reference.label = name; labelsChanged = true; }
      const entry = document.createElement("div"); entry.append(objectButton(reference, { shelfItem: true }),
        button(t("nextstep_shelf_remove"), () => unpin(reference))); shelfNode.append(entry);
    });
    if (labelsChanged) scheduleSettingsSave();
    const add = button(t("nextstep_shelf_add"), () => pin(selected || ref("project", getActiveProject())));
    add.disabled = !selected && !getActiveProject(); shelfNode.append(add);
    shelfNode.addEventListener("dragover", (event) => event.preventDefault());
    shelfNode.addEventListener("drop", (event) => {
      event.preventDefault();
      try { const reference = JSON.parse(event.dataTransfer.getData("application/x-system6-reference")); if (validRef(reference)) pin(reference); } catch { /* Unrelated desktop payload. */ }
    });
    const trail = document.createElement("nav"); trail.className = "nextstep-finder-path";
    trail.setAttribute("aria-label", t("nextstep_path"));
    const project = getActiveProject(); const folders = path();
    if (project) [ref("project", project), ...folders].forEach((reference) => trail.append(objectButton(reference)));
    const columns = document.createElement("div"); columns.className = "nextstep-finder-columns";
    columns.append(column(t("nextstep_projects"), projects.map((item) => ref("project", item))));
    if (project && isProjectMounted) {
      columns.append(column(project.name, list(null)));
      folders.forEach((reference) => columns.append(column(descriptor(reference)?.name || "", list(reference.id))));
    }
    root.append(shelfNode, trail, columns);
    columns.scrollLeft = oldScroll;
    if (focusedKey) Array.from(root.querySelectorAll("[data-ref-key]")).find((node) => node.dataset.refKey === focusedKey)?.focus({ preventScroll: true });
  }

  function schedule() { if (!queued) { queued = true; queueMicrotask(sync); } }
  document.addEventListener("ai-system6-themechange", schedule);
  window.AISystem6FinderColumns = Object.freeze({ sync: schedule, open, pin, resolve,
    frameHost: (win, axis) => {
      if (!active() || win.dataset.window !== "projects") return null;
      const columns = root?.querySelector(".nextstep-finder-columns");
      return axis === "horizontal" ? columns : document.activeElement?.closest(".nextstep-finder-column") || columns?.lastElementChild;
    },
    selectedItem: () => active() && selected?.projectId === activeProjectId ? descriptor(selected) : null });
})();
