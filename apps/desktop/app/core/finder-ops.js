// Finder operations (lazy): the drop matrix, the operation log and its
// rollback, undo, desktop placement and Put Away. Inline rename, New Folder,
// clean up of Finder windows and the Finder clipboard join in later lanes.
//
// Every write goes through stores.projects.commit, so a refused write puts the
// records back; the log also keeps each operation's `before` so the Finder can
// restore what it changed and say so. The log exists in every era. What Undo
// may take back depends on the era: a classic Finder (System 6 to NeXTSTEP)
// only undoes the last name edit, a modern one keeps a 50-step stack.
(function () {
  const LOG_LIMIT = 50;
  const CLASSIC_ERAS = new Set(["classic", "system-6", "system-7", "platinum", "drawing-board", "nextstep"]);
  const UNDOABLE = new Set(["move", "copy", "alias", "place", "rename", "create", "trash", "clean-up"]);
  const opLog = [];
  const undoStack = [];
  let classicUndo = null;

  function classicEra(mods = {}) {
    if (mods.era) return CLASSIC_ERAS.has(mods.era);
    return typeof isClassicFinderEra === "function" ? isClassicFinderEra() : true;
  }

  function status(key, ...args) {
    if (typeof setStatus === "function" && typeof t === "function") setStatus(t(key, ...args));
  }

  // ---------------------------------------------------------------------------
  // Drop matrix (pure). dragData is the drag payload; target describes the drop
  // target ({ kind, projectId, folderId }); mods carries the modifier keys plus
  // { era, mountedDisk, activeProjectId, isDescendant }.
  function sourceKind(dragData = {}, mods = {}) {
    if (mods.mountedDisk || dragData.mounted === true) return "disk-mounted";
    if (dragData.type === "project") return "disk-ejected";
    if (dragData.type === "file") return "file";
    if (dragData.type === "document-folder" || dragData.type === "folder") return "folder";
    if (!dragData.type || dragData.type === "system-icon") return "system-icon";
    return dragData.type;
  }

  function draggedFolderIds(dragData) {
    const ids = Array.isArray(dragData.items)
      ? dragData.items.filter((item) => item.type === "folder" || item.type === "document-folder").map((item) => item.id)
      : [];
    if ((dragData.type === "document-folder" || dragData.type === "folder") && dragData.id) ids.push(dragData.id);
    return ids;
  }

  function decideDrop(dragData = {}, target = {}, mods = {}) {
    const kind = target.kind || "other";
    const source = sourceKind(dragData, mods);
    if (kind === "project-ejected") return "refuse:finder_refuse_ejected_readonly";
    // The File Floppy icon is a desk icon: it moves on the desk, and Trash ejects it.
    if (source === "mounted-disk") return kind === "desktop" ? "place" : kind === "trash" ? "dispatch" : "refuse:";
    if (source === "disk-mounted") {
      if (kind === "trash") return "refuse:finder_refuse_mounted_disk_trash";
      return kind === "desktop" ? "place" : "refuse:";
    }
    if (source === "disk-ejected") {
      if (kind === "trash") return "eject";
      return kind === "desktop" ? "place" : "dispatch";
    }
    if (source === "system-icon") return kind === "desktop" ? "place" : "refuse:";
    if (source !== "file" && source !== "folder") return "dispatch";
    // The background of the window the items came from: no modifier places
    // them where they were let go; a list view has no place to put them.
    if (target.window && target.sameWindow && !mods.altKey) return target.listMode || mods.phone ? "refuse:" : "place";
    if (kind === "folder" || kind === "project-mounted") {
      const into = target.folderId || "";
      const isDescendant = mods.isDescendant
        || (typeof isDocumentFolderDescendant === "function" ? isDocumentFolderDescendant : () => false);
      if (into && draggedFolderIds(dragData).some((id) => id === into || isDescendant(into, id))) {
        return "refuse:finder_refuse_into_itself";
      }
    }
    if (kind === "desktop") return "place";
    if (kind === "trash") return "dispatch";
    if (kind !== "folder" && kind !== "project-mounted") return "dispatch";
    const from = dragData.sourceVolume && dragData.sourceVolume !== "system" ? dragData.sourceVolume : dragData.projectId || "";
    const to = target.projectId || mods.activeProjectId || from;
    if (from && to && from !== to) return "copy";
    if (mods.altKey && mods.metaKey) return classicEra(mods) ? "copy" : "alias";
    if (mods.altKey) return "copy";
    return "move";
  }

  // ---------------------------------------------------------------------------
  // Records, commits and the log.
  function live() {
    return {
      chatFiles: typeof chatFiles !== "undefined" ? chatFiles : [],
      chatFolders: typeof chatFolders !== "undefined" ? chatFolders : [],
      projects: typeof projects !== "undefined" ? projects : [],
    };
  }

  const DIRTY_KIND = { folder: "chatFolders", file: "chatFiles", project: "projects" };

  function parseKey(key) {
    const at = String(key).indexOf(":");
    const type = String(key).slice(0, at);
    return { type: type === "document-folder" ? "folder" : type, id: String(key).slice(at + 1) };
  }

  function recordOf(collections, key) {
    const { type, id } = parseKey(key);
    const list = type === "folder" ? collections.chatFolders : type === "file" ? collections.chatFiles : type === "project" ? collections.projects : null;
    return list?.find((record) => record.id === id) || null;
  }

  const ABSENT = { absent: true };

  function pick(record, fields) {
    const out = {};
    fields.forEach((field) => {
      out[field] = record && Object.prototype.hasOwnProperty.call(record, field)
        ? structuredClone(record[field])
        : ABSENT;
    });
    return out;
  }

  function putBack(record, values) {
    if (!record || !values) return;
    Object.entries(values).forEach(([field, value]) => {
      if (value && value.absent === true) delete record[field];
      else record[field] = structuredClone(value);
    });
  }

  function bumpAndNotify(keys, op) {
    if (typeof finderPlacementVersion === "number") finderPlacementVersion += 1;
    try {
      window.dispatchEvent(new CustomEvent("ais6:finder-changed", { detail: { keys, op } }));
    } catch {}
    if (typeof renderDocuments === "function") renderDocuments();
    if (typeof renderProjectDisks === "function") renderProjectDisks();
    if (typeof updateMenuState === "function") updateMenuState();
  }

  function failureKey() {
    return typeof leaseState !== "undefined" && leaseState?.readOnly ? "finder_read_only" : "finder_op_failed";
  }

  function activeProject() {
    return typeof activeProjectId !== "undefined" ? activeProjectId : "";
  }

  function log(op, keys, before, after, extra = {}) {
    const entry = { op, keys, before, after, at: Date.now(), projectId: activeProject(), ...extra };
    // What a created record looked like when it was made: Undo removes it only
    // while nothing has been written into it since.
    if (entry.created) entry.stamps = Object.fromEntries(entry.created.map((key) => [key, recordOf(live(), key)?.updatedAt || ""]));
    opLog.push(entry);
    if (opLog.length > LOG_LIMIT) opLog.shift();
    if (op === "rename") classicUndo = entry;
    else classicUndo = null;
    if (UNDOABLE.has(op)) {
      undoStack.push(entry);
      if (undoStack.length > LOG_LIMIT) undoStack.shift();
    }
    return entry;
  }

  // One write: mutate(record, key) runs on the commit draft (or on the live
  // records when the store is missing). A refused write restores `before`,
  // repaints and reports finder_op_failed; a desk that lost its write lease
  // reports finder_read_only. Returns the logged entry, or null.
  async function commitFields(op, keys, fields, mutate, options = {}) {
    const records = live();
    const before = options.before || Object.fromEntries(keys.map((key) => [key, pick(recordOf(records, key), fields)]));
    const store = window.AISystem6StateStores?.projects;
    try {
      if (typeof store?.commit === "function") {
        await store.commit((draft) => {
          keys.forEach((key) => {
            const record = recordOf(draft, key);
            if (record) mutate(record, key);
          });
          options.draft?.(draft);
        });
      } else {
        keys.forEach((key) => {
          const record = recordOf(records, key);
          if (!record) return;
          mutate(record, key);
          const { type, id } = parseKey(key);
          if (typeof markDeskDirty === "function") markDeskDirty(DIRTY_KIND[type], id);
        });
        options.draft?.(records);
        const saved = typeof saveDeskState === "function" ? await saveDeskState() : true;
        if (saved === false) status("finder_read_only");
      }
    } catch (error) {
      if (error?.code !== "STORE_PERSIST_FAILED") throw error;
      keys.forEach((key) => {
        putBack(recordOf(records, key), before[key]);
        const { type, id } = parseKey(key);
        if (typeof markDeskDirty === "function") markDeskDirty(DIRTY_KIND[type], id);
      });
      options.rollback?.(records);
      if (!options.quiet) bumpAndNotify(keys, op);
      status(failureKey());
      return null;
    }
    const after = Object.fromEntries(keys.map((key) => [key, pick(recordOf(records, key), fields)]));
    const entry = options.log === false ? null : log(op, keys, before, after, options.extra);
    if (!options.quiet) bumpAndNotify(keys, op);
    return entry || true;
  }

  // A pressed desktop object carries no item list: the selected desktop
  // objects travel with it.
  function selectedDesktopKeys(dragData) {
    if (typeof document === "undefined" || !document.querySelectorAll) return [];
    const keys = [...document.querySelectorAll(".desktop-object.is-selected")].map((el) => el.dataset.finderKey);
    const pressed = `${dragData.type === "file" ? "file" : "folder"}:${dragData.id}`;
    return keys.includes(pressed) ? keys : [];
  }

  function keysOf(dragData = {}) {
    const desk = !dragData.items?.length ? selectedDesktopKeys(dragData) : [];
    if (desk.length) return desk;
    const items = Array.isArray(dragData.items) && dragData.items.length
      ? dragData.items
      : dragData.type && dragData.id ? [{ type: dragData.type, id: dragData.id }] : [];
    return [...new Set(items
      .filter((item) => ["file", "folder", "document-folder"].includes(item.type))
      .map((item) => `${item.type === "file" ? "file" : "folder"}:${item.id}`))];
  }

  // ---------------------------------------------------------------------------
  // Place on the desktop. positions: { "file:<id>" | "folder:<id>": {x, y} } in
  // desktop-layer px, already offset per item from the pressed one. A classic
  // era keeps the release point; Cmd, or any modern era, snaps to the grid.
  function snapper(mods) {
    if (classicEra(mods) && !mods.metaKey) return (point) => point;
    const desk = window.AISystem6FinderDesk;
    if (typeof desk?.snapPoint === "function") return desk.snapPoint;
    const space = window.AISystem6FinderSpace;
    if (!space) return (point) => point;
    const grid = space.gridFor(classicEra(mods) ? "classic" : "modern", {});
    return (point) => space.snap(point, grid);
  }

  async function place(dragData = {}, options = {}, mods = {}) {
    const positions = options.positions || {};
    const keys = Object.keys(positions).filter((key) => /^(file|folder):/.test(key));
    if (!keys.length) return false;
    if (!window.AISystem6FinderSpace && typeof ensureFinderSpaceModule === "function") {
      await ensureFinderSpaceModule().catch(() => {});
    }
    const snap = snapper(mods);
    const points = Object.fromEntries(keys.map((key) => {
      const point = snap({ x: Math.round(positions[key].x), y: Math.round(positions[key].y) });
      return [key, { x: Math.round(point.x), y: Math.round(point.y) }];
    }));
    const entry = await commitFields("place", keys, ["placement"], (record, key) => {
      record.placement = { ...(record.placement || {}), desktop: points[key] };
    });
    if (entry && !window.AISystem6FinderDesk && typeof ensureFinderDeskModule === "function") {
      ensureFinderDeskModule().catch(() => {});
    }
    return !!entry;
  }

  // File > Put Away for desktop objects: back into the folder window they never
  // left. folderId/parentId are untouched.
  async function putAwayDesktop(keys) {
    const list = keys || [...document.querySelectorAll(".desktop-object.is-selected")].map((el) => el.dataset.finderKey);
    const own = list.filter((key) => recordOf(live(), key)?.placement?.desktop);
    if (!own.length) return false;
    const entry = await commitFields("put-away", own, ["placement"], (record) => {
      record.placement = { ...(record.placement || {}), desktop: null };
    });
    if (entry) {
      const record = recordOf(live(), own[0]);
      const name = record ? (parseKey(own[0]).type === "folder" && typeof displayFolderName === "function" ? displayFolderName(record.name) : record.name) : "";
      status("put_away_desktop_done", name);
    }
    return !!entry;
  }

  // Rename. In a classic era it is the only step Undo can take back. Resolves
  // false when the record is gone, left the project, or the name is refused.
  async function rename(key, name) {
    const value = String(name || "").trim();
    const { type, id } = parseKey(key);
    const current = recordOf(live(), key);
    if (!value || !current) return false;
    if (typeof isInActiveProject === "function" && !isInActiveProject(current)) return false;
    const folder = type === "folder";
    const stored = folder && typeof isDefaultFolderName === "function" && isDefaultFolderName(value) ? "General" : value;
    const entry = await commitFields("rename", [key], ["name", "titleMode", "updatedAt"], (record) => {
      record.name = stored;
      if (!folder && record.type === "chat") record.titleMode = "manual";
      record.updatedAt = new Date().toISOString();
    });
    if (!entry) return false;
    if (!folder && typeof activeTextFileId !== "undefined" && id === activeTextFileId && typeof teachTextNameInput !== "undefined") {
      teachTextNameInput.value = stored;
      if (typeof syncTeachTextNameDisplay === "function") syncTeachTextNameDisplay();
    }
    status(folder ? "folder_renamed" : "file_renamed", folder && typeof displayFolderName === "function" ? displayFolderName(stored) : stored);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Inline rename: the item's label becomes editable in place, no edit box.
  function itemKey(el) {
    if (el?.dataset?.finderKey) return el.dataset.finderKey;
    const type = el?.dataset?.documentItemType;
    return (type === "file" || type === "folder") && el.dataset.documentItemId ? `${type}:${el.dataset.documentItemId}` : "";
  }

  function itemLabel(el) {
    return el?.querySelector(":scope > .finder-list-name-cell > span:not(.sys-icon), :scope > span:not(.sys-icon)") || null;
  }

  function itemFor(key) {
    const { type, id } = parseKey(key);
    const found = [...document.querySelectorAll(`[data-finder-key="${key}"], [data-document-item-type="${type}"][data-document-item-id="${id}"]`)];
    return found.find((el) => el.offsetParent !== null) || found[0] || null;
  }

  function placeCaret(label, selectAll) {
    const range = document.createRange();
    range.selectNodeContents(label);
    if (!selectAll) range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function beginInlineRename(el, options = {}) {
    const label = itemLabel(el);
    const key = itemKey(el);
    if (!label || !key) return false;
    if (label.classList.contains("is-renaming")) {
      // A second key typed while the module was loading lands on the open edit.
      if (typeof options.initialText === "string" && options.initialText) {
        label.textContent += options.initialText;
        placeCaret(label, false);
      }
      return true;
    }
    if (typeof loadStylesheetOnce === "function") loadStylesheetOnce("styles.finder-spatial.css");
    const original = label.textContent;
    let done = false;
    label.classList.add("is-renaming");
    label.contentEditable = "plaintext-only";
    if (label.contentEditable !== "plaintext-only") label.contentEditable = "true";
    label.spellcheck = false;
    label.textContent = typeof options.initialText === "string" ? options.initialText : original;
    label.focus();
    placeCaret(label, !!options.selectAll);
    if (options.created) record("create", [key], {}, {}, { created: [key] });

    function finish(save) {
      if (done) return;
      done = true;
      label.removeEventListener("keydown", onKey);
      label.removeEventListener("blur", onBlur);
      label.removeEventListener("pointerdown", stop);
      label.removeEventListener("click", stop);
      label.removeEventListener("dblclick", stop);
      label.removeAttribute("contenteditable");
      label.classList.remove("is-renaming");
      const name = label.textContent.replace(/\s+/g, " ").trim();
      label.textContent = original;
      if (!save) return;
      if (!name) {
        status("rename_refused_empty");
        return;
      }
      if (name === original.trim()) return;
      const { type, id } = parseKey(key);
      const target = recordOf(live(), key);
      if (type === "folder" && target) {
        const taken = live().chatFolders.some((folder) => folder.id !== id
          && folder.projectId === target.projectId
          && (folder.parentId || null) === (target.parentId || null)
          && (typeof displayFolderName === "function" ? displayFolderName(folder.name) : folder.name).toLowerCase() === name.toLowerCase());
        if (taken) {
          status("folder_name_taken", name);
          return;
        }
      }
      rename(key, name);
    }
    function onKey(event) {
      event.stopPropagation();
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
        el.focus?.();
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
        el.focus?.();
      }
    }
    function onBlur() { finish(true); }
    function stop(event) { event.stopPropagation(); }
    label.addEventListener("keydown", onKey);
    label.addEventListener("blur", onBlur);
    label.addEventListener("pointerdown", stop);
    label.addEventListener("click", stop);
    label.addEventListener("dblclick", stop);
    return true;
  }

  function beginRename(ctx = {}) {
    const el = ctx.el?.isConnected ? ctx.el : ctx.key ? itemFor(ctx.key) : null;
    if (!el) return false;
    return beginInlineRename(el, ctx);
  }

  // A copy made outside this module (Duplicate): log it for modern Undo and
  // step its placement +16/+16 so it does not hide under the original.
  async function duplicated(ctx = {}) {
    const key = ctx.key;
    const copy = key && recordOf(live(), key);
    if (!copy) return false;
    if (copy.placement) {
      await ensureFinderSpaceModule?.();
      const space = window.AISystem6FinderSpace;
      const step = (point) => point && space ? space.duplicateOffset(point) : point;
      const { x, y, desktop } = copy.placement;
      await commitFields("copy", [key], ["placement"], (record) => {
        const moved = Number.isFinite(x) && Number.isFinite(y) ? step({ x, y }) : { x, y };
        record.placement = { ...record.placement, x: moved.x, y: moved.y, desktop: desktop ? step(desktop) : desktop };
      }, { log: false });
    }
    record("copy", [key], {}, {}, { created: [key] });
    return true;
  }

  // Record an operation another module carried out (create, trash).
  function record(op, keys = [], before = {}, after = {}, extra = {}) {
    return log(op, keys, before, after, extra);
  }

  // ---------------------------------------------------------------------------
  // Move, copy and alias by drop. The engine calls perform() for any decision
  // it does not place; a false answer leaves the drop to dispatchInternalDrop.
  function uuid() {
    return typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function nameTaken(collections, type, name, projectId, parentId) {
    const list = type === "folder" ? collections.chatFolders : collections.chatFiles;
    const field = type === "folder" ? "parentId" : "folderId";
    return list.some((item) => item.projectId === projectId && (item[field] || null) === (parentId || null) && item.name === name);
  }

  // One file record copied into targetFolderId of projectId, the product's own
  // copy suffix only when the name is already taken there.
  function duplicateFileRecord(collections, file, targetFolderId, projectId, now = new Date().toISOString()) {
    const copy = {
      ...structuredClone(file),
      id: uuid(),
      projectId,
      folderId: targetFolderId || null,
      createdAt: now,
      updatedAt: now,
    };
    delete copy.placement;
    if (nameTaken(collections, "file", copy.name, projectId, targetFolderId)) copy.name = `${file.name}${t("project_name_copy_suffix")}`;
    collections.chatFiles.unshift(copy);
    return copy;
  }

  // The tree is read from a snapshot taken before the first copy lands, so a
  // copy made inside its own source is never copied again.
  function duplicateFolderTree(collections, folder, targetParentId, projectId, created, now = new Date().toISOString(), source = null) {
    const tree = source || { files: collections.chatFiles.slice(), folders: collections.chatFolders.slice() };
    const copy = {
      ...structuredClone(folder),
      id: uuid(),
      projectId,
      parentId: targetParentId || null,
      createdAt: now,
      updatedAt: now,
    };
    delete copy.placement;
    delete copy.windowState;
    if (!source && nameTaken(collections, "folder", copy.name, projectId, targetParentId)) copy.name = `${folder.name}${t("project_name_copy_suffix")}`;
    collections.chatFolders.push(copy);
    created.push(`folder:${copy.id}`);
    tree.files
      .filter((file) => file.folderId === folder.id && file.projectId === folder.projectId)
      .forEach((file) => created.push(`file:${duplicateFileRecord(collections, file, copy.id, projectId, now).id}`));
    tree.folders
      .filter((child) => child.parentId === folder.id && child.projectId === folder.projectId)
      .forEach((child) => duplicateFolderTree(collections, child, copy.id, projectId, created, now, tree));
    return copy;
  }

  function targetOf(target) {
    const kind = target?.dataset?.dropTarget;
    const projectId = target?.id === "active-project-drop-target"
      ? (typeof activeProjectId !== "undefined" ? activeProjectId : "")
      : target?.dataset?.projectId && kind === "project" ? target.dataset.projectId : (typeof activeProjectId !== "undefined" ? activeProjectId : "");
    return { folderId: kind === "project" ? null : target?.dataset?.folderId || null, projectId };
  }

  async function copyItems(keys, folderId, projectId) {
    const created = [];
    const entry = await commitFields("copy", [], [], () => {}, {
      before: {},
      draft(collections) {
        keys.forEach((key) => {
          const source = recordOf(collections, key);
          if (!source) return;
          if (parseKey(key).type === "folder") duplicateFolderTree(collections, source, folderId, projectId, created);
          else created.push(`file:${duplicateFileRecord(collections, source, folderId, projectId).id}`);
        });
      },
      extra: { created },
    });
    return entry;
  }

  // The same alias record finder-objects.js makes, built on the commit draft so
  // the store owns the write.
  async function aliasItems(keys, folderId) {
    const records = live();
    const files = keys.map((key) => recordOf(records, key)).filter((file) => file && (file.type === "text" || file.type === "chat"));
    if (!files.length) {
      status("make_alias_select_file");
      return null;
    }
    const created = [];
    const now = new Date().toISOString();
    const entry = await commitFields("alias", [], [], () => {}, {
      before: {},
      draft(collections) {
        files.forEach((source) => {
          const alias = {
            id: uuid(),
            projectId: source.projectId,
            type: "alias",
            name: `${source.name} alias`,
            folderId: folderId !== null ? folderId : source.folderId || null,
            aliasTarget: { kind: "file", id: source.id },
            createdAt: now,
            updatedAt: now,
          };
          collections.chatFiles.unshift(alias);
          created.push(`file:${alias.id}`);
        });
      },
      extra: { created },
    });
    if (entry && created.length) status("alias_created", recordOf(live(), created[0])?.name || "");
    return entry;
  }

  // One move is one write and one logged step: the new folder, the desk spot
  // cleared, and (on a window's background) the spot it was let go. A move to
  // another folder without a spot drops the old window coordinates, so the item
  // takes a free place there instead of covering an icon. Selection and status
  // follow only a write that landed.
  async function moveItems(keys, dragData, folderId, points = null) {
    const records = live();
    const here = activeProject();
    if (dragData.projectId && dragData.projectId !== here) {
      status("no_project_drop_target");
      return null;
    }
    const into = folderId && records.chatFolders.some((folder) => folder.id === folderId && folder.projectId === here) ? folderId : null;
    const isDescendant = typeof isDocumentFolderDescendant === "function" ? isDocumentFolderDescendant : () => false;
    const field = (key) => (parseKey(key).type === "folder" ? "parentId" : "folderId");
    let refused = false;
    const moving = keys.filter((key) => {
      const item = recordOf(records, key);
      if (!item || item.projectId !== here) return false;
      if (field(key) === "parentId" && into && (parseKey(key).id === into || isDescendant(into, parseKey(key).id))) {
        refused = true;
        return false;
      }
      return (item[field(key)] || null) !== into || !!item.placement?.desktop || !!points?.[key];
    });
    if (!moving.length) {
      if (refused) status("cannot_move_folder_into_itself");
      return null;
    }
    const now = new Date().toISOString();
    const entry = await commitFields("move", moving, ["folderId", "parentId", "placement", "updatedAt"], (item, key) => {
      const changed = (item[field(key)] || null) !== into;
      item[field(key)] = into;
      if (changed) item.updatedAt = now;
      const point = points?.[key];
      if (!item.placement && !point) return;
      const next = { ...(item.placement || {}), desktop: null };
      if (point) Object.assign(next, point);
      else if (changed) {
        delete next.x;
        delete next.y;
      }
      item.placement = next;
    });
    if (!entry) return null;
    const first = recordOf(live(), moving[0]);
    const viewing = typeof selectedFolderId !== "undefined" && selectedFolderId !== "all" ? selectedFolderId : null;
    if (typeof selectedChatFileId !== "undefined") {
      selectedChatFileId = field(moving[0]) === "folderId" && into === viewing ? first?.id || null : null;
      selectedDocumentFolderId = field(moving[0]) === "parentId" && into === viewing ? first?.id || null : null;
    }
    moving.forEach((key) => {
      if (typeof activeTextFileId !== "undefined" && parseKey(key).id === activeTextFileId && typeof teachTextFolderInput !== "undefined" && typeof getDocumentDropFolderName === "function") {
        teachTextFolderInput.value = getDocumentDropFolderName(into);
      }
    });
    const where = typeof getDocumentDropFolderName === "function" ? getDocumentDropFolderName(into) : "";
    if (first) status(field(moving[0]) === "parentId" ? "folder_moved_folder" : "file_moved_folder",
      field(moving[0]) === "parentId" && typeof displayFolderName === "function" ? displayFolderName(first.name) : first.name, where);
    if (typeof renderDocuments === "function") renderDocuments();
    if (typeof renderProjectDisks === "function") renderProjectDisks();
    return entry;
  }

  function trashItemsNow() {
    return typeof trashItems !== "undefined" ? trashItems : [];
  }

  function perform(decision, target, dragData = {}, event = null) {
    const kind = target?.dataset?.dropTarget;
    const keys = keysOf(dragData);
    if (decision === "dispatch" && kind === "trash" && keys.length) {
      const known = new Set(trashItemsNow());
      const data = keys.length > 1 && !dragData.items?.length
        ? { ...dragData, items: keys.map((key) => parseKey(key)) }
        : dragData;
      if (typeof dispatchInternalDrop === "function") dispatchInternalDrop(target, data, event);
      const added = trashItemsNow().filter((item) => !known.has(item));
      if (added.length) log("trash", keys, {}, {}, { trashed: added });
      return true;
    }
    if (!keys.length || !["move", "copy", "alias"].includes(decision)) return false;
    const folderTarget = kind === "document-folder" || kind === "document-current-folder";
    const mountedTarget = kind === "project" && target?.dataset?.ejected !== "true";
    if (!folderTarget && !mountedTarget) return false;
    const { folderId, projectId } = targetOf(target);
    window.AISystem6FinderDrag?.endSpringFolderSession?.();
    const points = kind === "document-current-folder" ? dragData.windowPositions : null;
    const run = (decision === "copy"
      ? copyItems(keys, folderId, projectId)
      : decision === "alias"
        ? aliasItems(keys, folderId)
        : (points ? windowPoints(points, dragData, target) : Promise.resolve(null)).then((at) => moveItems(keys, dragData, folderId, at))
    ).then((entry) => {
      // Dropped on a window's background: the copies stand where they were let
      // go, in the same undo step as the copy (a move placed them itself).
      if (!entry || !points || decision === "move") return entry;
      const arrived = entry.created
        ? entry.created.filter((key) => {
          const item = recordOf(live(), key);
          return item && ((parseKey(key).type === "folder" ? item.parentId : item.folderId) || null) === (folderId || null);
        })
        : keys;
      const sources = Object.keys(points);
      const at = Object.fromEntries(arrived.map((key, index) => [key, points[entry.created ? sources[index] : key]]).filter(([, point]) => point));
      return placeInWindow(at, dragData, target, { log: false });
    });
    run.catch((error) => {
      console.error("Finder operation failed", error);
      status("finder_op_failed");
    });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Finder windows: icon coordinates inside a folder window, the window's own
  // state (view, sort, scroll), Clean Up Window and the classic info bar.
  // placement.x/y are 1x CSS px inside the window's icon area; list views and
  // phones ignore them, and nothing rendered here is written back.
  const layouts = {};
  const scrollHooked = new WeakSet();
  const scrollTimers = {};
  let available = null;
  let availableAsked = 0;
  let diskCache = { at: "", bytes: 0 };

  function windowGrid(name) {
    if (name === "projects") return document.querySelector("#project-disk-grid") || (typeof projectDiskGridEl !== "undefined" ? projectDiskGridEl : null);
    if (name === "documents") return typeof documentIconGridEl !== "undefined" ? documentIconGridEl : null;
    return null;
  }

  function elKey(el) {
    return el.dataset.finderKey
      || (el.dataset.documentItemType && el.dataset.documentItemId ? `${el.dataset.documentItemType}:${el.dataset.documentItemId}` : "")
      || (el.dataset.projectRootId ? `root:${el.dataset.projectRootId}` : "");
  }

  function phoneView() {
    return typeof isPhoneFinderViewport === "function" && isPhoneFinderViewport();
  }

  function eraName() {
    return classicEra() ? "classic" : "modern";
  }

  // The grid's own coordinate space: content-box origin, scroll included.
  function pointIn(grid, clientX, clientY) {
    const box = grid.getBoundingClientRect();
    return { x: clientX - box.left - grid.clientLeft + grid.scrollLeft, y: clientY - box.top - grid.clientTop + grid.scrollTop };
  }

  function cellGrid(sizes) {
    const space = window.AISystem6FinderSpace;
    const base = space.gridFor(eraName(), {});
    const w = Math.max(base.cellW, ...sizes.map((size) => size.w));
    const h = Math.max(base.cellH, ...sizes.map((size) => size.h));
    return { ...base, cellW: w, cellH: h };
  }

  function scrollerOf(grid) {
    for (let el = grid; el && !el.classList?.contains("window"); el = el.parentElement) {
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY + style.overflowX) && el.scrollHeight >= el.clientHeight) return el;
    }
    return grid;
  }

  function folderKeyFor(name) {
    const folder = typeof getSelectedFolder === "function" ? getSelectedFolder() : null;
    if (folder) return { key: `folder:${folder.id}`, field: "windowState" };
    const projectId = typeof activeProjectId !== "undefined" ? activeProjectId : "";
    return projectId ? { key: `project:${projectId}`, field: "rootWindowState" } : null;
  }

  async function saveWindowState(name) {
    if (name !== "projects" && name !== "documents") return false;
    const where = folderKeyFor(name);
    const grid = windowGrid(name);
    if (!where || !grid) return false;
    const view = typeof windowViewModes !== "undefined" ? windowViewModes[name] : "icon";
    const scroller = scrollerOf(grid);
    const state = {
      view,
      sort: { key: view, reversed: typeof finderSortReversed === "function" ? finderSortReversed(name) : false },
      scroll: { top: Math.round(scroller.scrollTop || 0), left: Math.round(scroller.scrollLeft || 0) },
    };
    const current = recordOf(live(), where.key)?.[where.field];
    if (current && JSON.stringify(current) === JSON.stringify(state)) return true;
    const entry = await commitFields("window-state", [where.key], [where.field], (record) => {
      record[where.field] = state;
    }, { log: false, quiet: true });
    return !!entry;
  }

  function hookScroll(name, grid) {
    const scroller = scrollerOf(grid);
    if (scrollHooked.has(scroller)) return;
    scrollHooked.add(scroller);
    scroller.addEventListener("scroll", () => {
      clearTimeout(scrollTimers[name]);
      scrollTimers[name] = setTimeout(() => saveWindowState(name), 300);
    }, { passive: true });
  }

  // A folder's window state (view, sort, scroll) comes back on arrival. A
  // spring-loaded folder is a passing look, not an arrival: it neither restores
  // nor is remembered, so the window springs back to what it was. Returns true
  // when the view or the sort changed and the window must draw again.
  const finderWindowAt = {};
  const finderWindowScroll = {};
  function restoreWindowState(name) {
    if (window.AISystem6FinderDrag?.getSpringFolderState?.()) return false;
    const at = `${activeProject()}/${typeof selectedFolderId !== "undefined" ? selectedFolderId : ""}`;
    if (finderWindowAt[name] === at) return false;
    finderWindowAt[name] = at;
    const folder = typeof getSelectedFolder === "function" ? getSelectedFolder() : null;
    const state = folder ? folder.windowState : typeof getActiveProject === "function" ? getActiveProject()?.rootWindowState : null;
    if (!state) return false;
    let changed = false;
    if (state.view && windowViewModes[name] !== state.view) {
      windowViewModes[name] = state.view;
      changed = true;
    }
    if (state.sort && !state.sort.reversed !== !finderSortReversed(name)) {
      toggleFinderSortReversed(name);
      changed = true;
    }
    finderWindowScroll[name] = state.scroll;
    return changed;
  }

  function restoreScroll(name, grid) {
    if (!finderWindowScroll[name]) return;
    const scroll = finderWindowScroll[name];
    delete finderWindowScroll[name];
    const scroller = scrollerOf(grid);
    scroller.scrollTop = Number(scroll.top) || 0;
    scroller.scrollLeft = Number(scroll.left) || 0;
  }

  // In disk: the project's own words, as UTF-8 bytes. Available: what the
  // browser says it may still keep for this desk.
  function diskBytes() {
    const projectId = typeof activeProjectId !== "undefined" ? activeProjectId : "";
    const files = live().chatFiles.filter((file) => file.projectId === projectId);
    const at = `${projectId}/${files.length}/${files.reduce((last, file) => (file.updatedAt || "") > last ? file.updatedAt : last, "")}`;
    if (diskCache.at === at) return diskCache.bytes;
    const encoder = new TextEncoder();
    const bytes = files.reduce((sum, file) => {
      const messages = Array.isArray(file.messages) ? file.messages.map((message) => message?.content || "").join("") : "";
      return sum + encoder.encode(String(file.body || "") + messages).length;
    }, 0);
    diskCache = { at, bytes };
    return bytes;
  }

  function kilobytes(bytes) {
    return Math.ceil(bytes / 1024).toLocaleString();
  }

  function infoText(count) {
    return [
      t("finder_info_items", count),
      t("finder_info_in_disk", kilobytes(diskBytes())),
      t("finder_info_available", available === null ? "—" : kilobytes(available)),
    ].join("   ");
  }

  function infoBar(name, count) {
    const el = document.querySelector(name === "projects" ? "#project-disk-count" : "#documents-count");
    if (!el) return;
    if (!classicEra()) {
      el.classList.remove("finder-info-bar");
      return;
    }
    el.classList.add("finder-info-bar");
    el.textContent = infoText(count);
    if (Date.now() - availableAsked < 5000 || typeof navigator?.storage?.estimate !== "function") return;
    availableAsked = Date.now();
    navigator.storage.estimate().then((estimate) => {
      const next = Number.isFinite(estimate?.quota) && Number.isFinite(estimate?.usage) ? Math.max(0, estimate.quota - estimate.usage) : null;
      if (next === available) return;
      available = next;
      if (el.isConnected && el.classList.contains("finder-info-bar")) el.textContent = infoText(count);
    }, () => {});
  }

  function clearSpatial(grid) {
    grid.classList.remove("is-spatial");
    grid.style.removeProperty("--finder-extent");
    grid.querySelectorAll(":scope > .finder-item").forEach((el) => {
      el.style.removeProperty("--x");
      el.style.removeProperty("--y");
    });
  }

  // Lay the window's icons out where they were put. Items without a placement
  // keep the spot the auto-flow gives them (or the next free cell), and none of
  // those spots is stored.
  function layout(name, grid, items, extra = {}) {
    const placed = new Map();
    items.forEach((item) => {
      const type = item.type === "folder" ? "folder" : item.type === "projectReference" || item.type === "finder-root" ? "" : "file";
      if (type && Number.isFinite(item.placement?.x) && Number.isFinite(item.placement?.y)) placed.set(`${type}:${item.id}`, item.placement);
    });
    Object.entries(extra).forEach(([key, point]) => placed.set(key, point));
    if (!placed.size) {
      clearSpatial(grid);
      delete layouts[name];
      return false;
    }
    if (!grid.offsetParent) {
      // A hidden window has no flow to measure; lay it out when it shows.
      if (typeof ResizeObserver === "function" && !grid.__finderWait) {
        grid.__finderWait = new ResizeObserver(() => {
          if (!grid.offsetParent) return;
          grid.__finderWait.disconnect();
          grid.__finderWait = null;
          layout(name, grid, items, extra);
        });
        grid.__finderWait.observe(grid);
      }
      return false;
    }
    const space = window.AISystem6FinderSpace;
    clearSpatial(grid);
    const els = [...grid.querySelectorAll(":scope > .finder-item")];
    const flow = els.map((el) => {
      const rect = el.getBoundingClientRect();
      const origin = pointIn(grid, rect.left, rect.top);
      return { el, key: elKey(el), x: origin.x, y: origin.y, w: rect.width, h: rect.height };
    });
    const cells = cellGrid(flow);
    const bounds = { x: 0, y: 0, width: Math.max(grid.clientWidth, cells.cellW), height: Number.MAX_SAFE_INTEGER };
    const occupied = [];
    const out = {};
    flow.forEach((item) => {
      const point = placed.get(item.key);
      if (!point) return;
      out[item.key] = space.clampIntoView({ x: point.x, y: point.y }, { width: item.w, height: item.h }, bounds);
      occupied.push({ ...out[item.key], w: item.w, h: item.h });
    });
    flow.forEach((item) => {
      if (out[item.key]) return;
      const clash = (p) => occupied.some((r) => p.x < r.x + r.w && r.x < p.x + item.w && p.y < r.y + r.h && r.y < p.y + item.h);
      const spot = clash(item) ? space.nearestFreeCell(item, occupied, cells, { ...bounds, height: (flow.length + 2) * cells.cellH + Math.max(...occupied.map((r) => r.y + r.h), 0) }) || item : item;
      out[item.key] = { x: spot.x, y: spot.y };
      occupied.push({ ...out[item.key], w: item.w, h: item.h });
    });
    let extent = 0;
    flow.forEach((item) => {
      const p = out[item.key];
      item.el.style.setProperty("--x", `${Math.round(p.x)}px`);
      item.el.style.setProperty("--y", `${Math.round(p.y)}px`);
      item.el.style.setProperty("--w", `${Math.round(item.w)}px`);
      extent = Math.max(extent, p.y + item.h);
    });
    grid.style.setProperty("--finder-extent", `${Math.ceil(extent + cells.originY)}px`);
    grid.classList.add("is-spatial");
    layouts[name] = Object.fromEntries(flow.map((item) => [item.key, { ...out[item.key], w: item.w, h: item.h }]));
    return true;
  }

  async function syncWindow(name, grid, items = [], mode = "icon") {
    if (!grid?.isConnected) return false;
    if ((name === "projects" || name === "documents") && restoreWindowState(name)) {
      // The module came in after this window drew: draw it again in its own view.
      if (name === "projects" && typeof renderProjectDisks === "function") renderProjectDisks();
      if (name === "documents" && typeof renderDocuments === "function") renderDocuments();
      return false;
    }
    if (name === "projects" || name === "documents") {
      infoBar(name, items.length);
      restoreScroll(name, grid);
      hookScroll(name, grid);
    }
    const iconMode = typeof isFinderListMode === "function" ? !isFinderListMode(mode) : mode === "icon" || mode === "small-icon";
    if (!iconMode || phoneView()) {
      clearSpatial(grid);
      delete layouts[name];
      return false;
    }
    if (!items.some((item) => Number.isFinite(item.placement?.x))) {
      clearSpatial(grid);
      delete layouts[name];
      return false;
    }
    if (typeof loadStylesheetOnce === "function") loadStylesheetOnce("styles.finder-spatial.css");
    if (!window.AISystem6FinderSpace && typeof ensureFinderSpaceModule === "function") await ensureFinderSpaceModule();
    return layout(name, grid, items);
  }

  // A drop inside a window: x/y only, the desktop spot cleared. Classic eras
  // keep the release point (Cmd snaps); modern eras snap to the window grid.
  async function windowPoints(positions = {}, mods = {}, target = null) {
    const keys = Object.keys(positions).filter((key) => /^(file|folder):/.test(key));
    if (!window.AISystem6FinderSpace && typeof ensureFinderSpaceModule === "function") await ensureFinderSpaceModule();
    const space = window.AISystem6FinderSpace;
    const name = target?.closest?.(".window")?.dataset.window;
    const sizes = Object.values(layouts[name] || {});
    const cells = space ? cellGrid(sizes.length ? sizes : [{ w: 0, h: 0 }]) : null;
    const snap = !cells || (classicEra(mods) && !mods.metaKey) ? (point) => point : (point) => space.snap(point, cells);
    return Object.fromEntries(keys.map((key) => {
      const point = snap({ x: Math.max(0, Math.round(positions[key].x)), y: Math.max(0, Math.round(positions[key].y)) });
      return [key, { x: Math.max(0, Math.round(point.x)), y: Math.max(0, Math.round(point.y)) }];
    }));
  }

  async function placeInWindow(positions = {}, mods = {}, target = null, options = {}) {
    const points = await windowPoints(positions, mods, target);
    const keys = Object.keys(points);
    if (!keys.length) return false;
    const entry = await commitFields("place", keys, ["placement"], (record, key) => {
      record.placement = { ...(record.placement || {}), x: points[key].x, y: points[key].y, desktop: null };
    }, options);
    return !!entry;
  }

  // Special > Clean Up with a Finder window in front: each icon to its nearest
  // free cell in order; a selection moves alone; Option arranges by name.
  async function cleanUpWindow(name, grid, options = {}) {
    if (!window.AISystem6FinderSpace && typeof ensureFinderSpaceModule === "function") await ensureFinderSpaceModule();
    const space = window.AISystem6FinderSpace;
    const els = [...grid.querySelectorAll(":scope > .finder-item")];
    if (!els.length || grid.classList.contains("finder-list") || phoneView()) return false;
    const current = layouts[name] || {};
    const items = els.map((el) => {
      const key = elKey(el);
      const rect = el.getBoundingClientRect();
      const at = current[key] || { ...pointIn(grid, rect.left, rect.top), w: rect.width, h: rect.height };
      const record = recordOf(live(), key);
      const label = el.querySelector(":scope > span:not(.sys-icon)")?.textContent || record?.name || "";
      return { key, x: at.x, y: at.y, w: at.w || rect.width, h: at.h || rect.height, name: label };
    });
    const cells = cellGrid(items);
    const bounds = { x: 0, y: 0, width: Math.max(grid.clientWidth, cells.cellW), height: (items.length + 2) * cells.cellH + Math.max(...items.map((i) => i.y + i.h)) };
    const selected = els.filter((el) => el.classList.contains("is-selected")).map(elKey);
    const result = options.byName
      ? space.cleanUpByName(items, cells, bounds, typeof currentLanguage !== "undefined" ? currentLanguage : undefined)
      : space.cleanUp(items, cells, bounds, { selectionKeys: selected.length ? selected : null });
    const keys = Object.keys(result).filter((key) => /^(file|folder):/.test(key) && recordOf(live(), key));
    if (!keys.length) return false;
    const entry = await commitFields("clean-up", keys, ["placement"], (record, key) => {
      record.placement = { ...(record.placement || {}), x: Math.round(result[key].x), y: Math.round(result[key].y), desktop: record.placement?.desktop || null };
    });
    return !!entry;
  }

  // ---------------------------------------------------------------------------
  // Undo.
  // Only steps taken on the mounted project: a step from another disk waits
  // until that disk is mounted again.
  function undoEntry(mods = {}) {
    const here = activeProject();
    if (classicEra(mods)) return classicUndo?.projectId === here ? classicUndo : null;
    for (let i = undoStack.length - 1; i >= 0; i -= 1) if (undoStack[i].projectId === here) return undoStack[i];
    return null;
  }

  function canUndo(mods = {}) {
    return !!undoEntry(mods);
  }

  // A created record that was written into, or a created folder that now holds
  // something the step did not make, is not taken back.
  function changedSince(entry, created) {
    const records = live();
    return created.some((key) => {
      const item = recordOf(records, key);
      if (!item) return false;
      if ((entry.stamps?.[key] ?? item.updatedAt) !== item.updatedAt) return true;
      const { type, id } = parseKey(key);
      return type === "folder" && (records.chatFiles.some((file) => file.folderId === id && !created.includes(`file:${file.id}`))
        || records.chatFolders.some((folder) => folder.parentId === id && !created.includes(`folder:${folder.id}`)));
    });
  }

  async function undo(mods = {}) {
    const entry = undoEntry(mods);
    if (!entry) return false;
    const index = undoStack.lastIndexOf(entry);
    if (index !== -1) undoStack.splice(index, 1);
    if (classicUndo === entry) classicUndo = null;
    if (entry.op === "trash") {
      (entry.trashed || []).forEach((item) => {
        if (!trashItemsNow().includes(item)) return;
        if (typeof putAwayTrashItem === "function") putAwayTrashItem(item);
        else if (typeof restoreTrashItem === "function") restoreTrashItem(item);
      });
      bumpAndNotify(entry.keys, "undo");
      return true;
    }
    if (entry.op === "copy" || entry.op === "alias" || entry.op === "create") {
      if (changedSince(entry, [...new Set(entry.created || entry.keys)])) {
        status("finder_undo_refused_changed");
        return false;
      }
      const created = new Set(entry.created || entry.keys);
      const result = await commitFields("undo", [], [], () => {}, {
        before: {},
        log: false,
        draft(collections) {
          ["chatFiles", "chatFolders"].forEach((name) => {
            const type = name === "chatFiles" ? "file" : "folder";
            for (let i = collections[name].length - 1; i >= 0; i -= 1) {
              if (created.has(`${type}:${collections[name][i].id}`)) collections[name].splice(i, 1);
            }
          });
        },
      });
      return !!result;
    }
    const fields = Object.keys(Object.values(entry.before)[0] || {});
    const result = await commitFields("undo", entry.keys, fields, (record, key) => putBack(record, entry.before[key]), { log: false });
    return !!result;
  }

  // ---------------------------------------------------------------------------
  // P3: Open With, the modern contextual menu, and Finder copy / paste.
  const registry = () => window.AISystem6ApplicationRegistry;
  let clip = [];
  let popup = null;

  function closePopup() {
    if (!popup) return;
    popup.remove();
    popup = null;
    document.removeEventListener("pointerdown", onPopupOutside, true);
    window.removeEventListener("blur", closePopup);
  }

  function onPopupOutside(event) {
    if (!popup?.contains(event.target)) closePopup();
  }

  // One small menu, the markup the WindowShade menu already uses.
  function popupMenu(rows, point = {}) {
    closePopup();
    const menu = document.createElement("div");
    menu.className = "menu is-open finder-context-menu";
    Object.assign(menu.style, { position: "fixed", zIndex: "var(--z-system-menu)", margin: "0" });
    const panel = document.createElement("div");
    panel.className = "menu-popover";
    panel.setAttribute("role", "menu");
    Object.assign(panel.style, { position: "relative", display: "block", left: "0", top: "0", minWidth: "180px" });
    rows.forEach((row) => {
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.setAttribute("role", "menuitem");
      button.textContent = row.label;
      button.disabled = row.disabled === true;
      button.addEventListener("click", () => { closePopup(); row.run(); });
      panel.append(button);
    });
    panel.addEventListener("keydown", (event) => {
      const buttons = [...panel.querySelectorAll("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? (index + 1) % buttons.length : event.key === "ArrowUp" ? (index - 1 + buttons.length) % buttons.length : -1;
      if (next >= 0) { event.preventDefault(); event.stopPropagation(); buttons[next].focus(); }
      if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); closePopup(); }
    });
    menu.append(panel);
    document.body.append(menu);
    popup = menu;
    const box = panel.getBoundingClientRect();
    menu.style.setProperty("--finder-menu-x", `${Math.max(4, Math.min(point.x || 0, window.innerWidth - box.width - 4))}px`);
    menu.style.setProperty("--finder-menu-y", `${Math.max(4, Math.min(point.y || 0, window.innerHeight - box.height - 4))}px`);
    document.addEventListener("pointerdown", onPopupOutside, true);
    window.addEventListener("blur", closePopup);
    panel.querySelector("button:not(:disabled)")?.focus();
    return menu;
  }

  function selectedKeys() {
    const els = [...document.querySelectorAll(".desktop-object.is-selected, .window.is-active:not(.is-hidden) :is(.finder-item, .finder-list-row).is-selected")];
    return [...new Set(els.map(itemKey).filter(Boolean))];
  }

  // Open With: a one-shot choice among the registered openers of the item's
  // kind. Nothing is remembered, so no storage field is involved.
  function openWith(ctx = {}) {
    const key = ctx.key || selectedKeys().find((k) => parseKey(k).type === "file");
    const file = key && recordOf(live(), key);
    const reg = registry();
    const apps = file && reg ? reg.applicationsForItemKind(reg.itemKind(file)) : [];
    if (!apps.length) {
      status("open_with_none");
      return Promise.resolve(false);
    }
    const open = (app) => reg.dispatchApplicationIntent(app.id, { intent: "open", items: [file], sourceAppId: "finder" });
    if (apps.length === 1) return open(apps[0]).then((result) => !!result?.ok);
    const el = itemFor(key);
    const box = el?.getBoundingClientRect();
    popupMenu(apps.map((app) => ({ label: t(app.labelKey), run: () => open(app) })), ctx.point || { x: box ? box.left : 80, y: box ? box.bottom : 80 });
    return Promise.resolve(true);
  }

  function ensureSelected(el) {
    if (el.classList.contains("is-selected")) return;
    if (el.matches(".icon-column .desktop-icon") && typeof selectDesktopIcon === "function") selectDesktopIcon(el);
    else el.click();
  }

  // Rows for one item: files and folders get the full set, a system icon only
  // opens and shows its info. Pure of side effects until a row runs.
  function contextRows(el) {
    const key = itemKey(el);
    const { type } = key ? parseKey(key) : {};
    const object = el.classList.contains("desktop-object");
    const act = (fn) => () => { ensureSelected(el); fn(); };
    const action = (name) => act(() => handleAction(name));
    const rows = [{ id: "open", label: t("open"), run: act(() => (el.matches(".icon-column .desktop-icon") ? openDesktopIcon(el) : handleAction("open-menu-selection"))) }];
    if (type === "file") rows.push({ id: "open-with", label: t("open_with"), run: act(() => openWith({ key, point: { x: el.getBoundingClientRect().left, y: el.getBoundingClientRect().bottom } })) });
    rows.push({ id: "get-info", label: t("get_info"), run: action("open-file-info") });
    if (key) {
      rows.push({ id: "rename", label: t("rename"), run: act(() => beginRename({ el })) });
      rows.push({ id: "duplicate", label: t("duplicate"), run: action("duplicate-selection") });
      if (type === "file") rows.push({ id: "make-alias", label: t("make_alias"), run: action("make-alias") });
      rows.push({ id: "copy", label: t("copy"), run: act(() => copySelection()) });
      rows.push({
        id: "trash",
        label: t("move_to_trash"),
        run: act(() => {
          const trash = object && document.querySelector('[data-drop-target="trash"]');
          if (trash && typeof dispatchInternalDrop === "function") dispatchInternalDrop(trash, { type: type === "file" ? "file" : "document-folder", id: parseKey(key).id, projectId: typeof activeProjectId !== "undefined" ? activeProjectId : "" }, null);
          else handleAction("move-file-trash");
        }),
      });
      if (object) rows.push({ id: "put-away", label: t("put_away"), run: () => putAwayDesktop([key]) });
    }
    return rows;
  }

  // Modern eras only: a classic Finder has no contextual menus.
  function openContextMenu(el, point) {
    if (classicEra() || !el) return false;
    popupMenu(contextRows(el), point);
    return true;
  }

  // Finder clipboard: module state, never persisted.
  function copySelection() {
    clip = selectedKeys();
    if (clip.length) status("finder_copied_items", clip.length);
    return Promise.resolve(clip.length > 0);
  }

  async function placeCopies(created, folderId, front, grid) {
    if (!created.length) return;
    if (!window.AISystem6FinderSpace && typeof ensureFinderSpaceModule === "function") await ensureFinderSpaceModule();
    const space = window.AISystem6FinderSpace;
    const records = live();
    const siblings = [
      ...records.chatFiles.filter((r) => (r.folderId || null) === (folderId || null)).map((r) => ["file", r]),
      ...records.chatFolders.filter((r) => (r.parentId || null) === (folderId || null)).map((r) => ["folder", r]),
    ];
    const sizes = Object.values(layouts[front] || {});
    const cells = cellGrid(sizes.length ? sizes : [{ w: 0, h: 0 }]);
    const fresh = new Set(created);
    const occupied = siblings
      .filter(([type, r]) => Number.isFinite(r.placement?.x) && !fresh.has(`${type}:${r.id}`))
      .map(([, r]) => ({ x: r.placement.x, y: r.placement.y, w: cells.cellW, h: cells.cellH }));
    const bounds = { x: 0, y: 0, width: Math.max(grid.clientWidth, cells.cellW * 2), height: Math.max(grid.scrollHeight, grid.clientHeight) + cells.cellH * 4 };
    const at = {};
    created.forEach((key) => {
      const item = recordOf(records, key);
      if (!item || !(((parseKey(key).type === "folder" ? item.parentId : item.folderId) || null) === (folderId || null))) return;
      const spot = space.nearestFreeCell({ x: 0, y: 0 }, occupied, cells, bounds);
      if (!spot) return;
      occupied.push({ x: spot.x, y: spot.y, w: cells.cellW, h: cells.cellH });
      at[key] = spot;
    });
    if (Object.keys(at).length) await commitFields("place", Object.keys(at), ["placement"], (record, key) => {
      record.placement = { ...(record.placement || {}), x: at[key].x, y: at[key].y, desktop: null };
    }, { log: false });
  }

  // Paste copies the clipboard into the front Finder window's folder: one
  // logged copy op (modern Undo removes it). Cross-project is a copy as well.
  async function pasteSelection() {
    const front = document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window;
    const grid = windowGrid(front);
    if (!clip.length || !grid) {
      status("finder_command_unavailable");
      return false;
    }
    const folder = typeof getSelectedFolder === "function" ? getSelectedFolder() : null;
    const entry = await copyItems(clip, folder?.id || null, typeof activeProjectId !== "undefined" ? activeProjectId : "");
    if (!entry || entry === true) return false;
    status("finder_pasted_items", (entry.created || []).length);
    if (grid.classList.contains("is-spatial")) await placeCopies(entry.created || [], folder?.id || null, front, grid);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Special > Clean Up: one answer for the row's label, whether it is
  // available, and what it does. Any Finder window in front owns the command
  // (Clean Up Window, or Selection when icons in it are selected); it is dimmed
  // when that window has no icon grid to clean (a list view, a phone, or a
  // window of fixed system icons). With no Finder window in front it is the
  // desktop's. Option turns it into Clean Up by Name.
  let cleanUpOption = false;
  ["keydown", "keyup"].forEach((type) => document.addEventListener?.(type, (event) => {
    if (event.key !== "Alt" || cleanUpOption === event.altKey) return;
    cleanUpOption = event.altKey;
    if (typeof updateMenuState === "function") updateMenuState();
  }));

  function frontFinderWindow() {
    const win = document.querySelector(".window.is-active:not(.is-hidden)");
    const name = win?.dataset.window || "";
    const finder = name === "projects" || name === "documents" || name === "finder"
      || (typeof finderContainerWindowNames !== "undefined" && finderContainerWindowNames.includes(name));
    return finder ? { win, name } : null;
  }

  function cleanUpState(option = cleanUpOption) {
    const front = frontFinderWindow();
    if (!front) {
      const selected = document.querySelector(".icon-column .desktop-icon.is-selected");
      return { ok: true, label: option ? "clean_up_by_name" : selected ? "clean_up_selection" : "clean_up_desktop" };
    }
    const grid = windowGrid(front.name);
    const list = !grid || grid.classList.contains("finder-list")
      || (typeof isFinderListMode === "function" && typeof windowViewModes !== "undefined" && isFinderListMode(windowViewModes[front.name]));
    const selected = front.win.querySelector(".finder-item.is-selected");
    return { ok: !list && !phoneView(), grid, name: front.name, label: option ? "clean_up_by_name" : selected ? "clean_up_selection" : "clean_up_window" };
  }

  function run(name, ctx = {}) {
    if (name === "clean-up") {
      const state = cleanUpState(!!ctx.option);
      if (state.name) {
        if (state.ok) return cleanUpWindow(state.name, state.grid, { byName: !!ctx.option });
        status("finder_command_unavailable");
        return Promise.resolve(false);
      }
      const selected = [...document.querySelectorAll(".icon-column .desktop-icon.is-selected")];
      return ensureFinderDeskModule().then(() => window.AISystem6FinderDesk.cleanUpDesktop({
        selectionKeys: selected.length && !ctx.option ? selected.map(window.AISystem6FinderDesk.iconKey) : null,
        byName: !!ctx.option,
      }));
    }
    if (name === "window-state") return saveWindowState(ctx.name);
    if (name === "undo") return undo(ctx);
    if (name === "put-away-desktop") return putAwayDesktop(ctx.keys);
    if (name === "rename" && ctx.key) return rename(ctx.key, ctx.name);
    if (name === "begin-rename") return Promise.resolve(beginRename(ctx));
    if (name === "duplicated") return duplicated(ctx);
    if (name === "open-with") return openWith(ctx);
    if (name === "copy-items") return copySelection();
    if (name === "paste-items") return pasteSelection();
    status("finder_command_unavailable");
    return Promise.resolve(false);
  }

  window.AISystem6FinderOps = {
    run,
    syncWindow,
    saveWindowState,
    placeInWindow,
    cleanUpWindow,
    windowLayout: (name) => ({ ...(layouts[name] || {}) }),
    restoreWindowState,
    cleanUpState,
    decideDrop,
    place,
    perform,
    putAwayDesktop,
    rename,
    beginInlineRename,
    record,
    canUndo,
    undo,
    duplicateFileRecord,
    openContextMenu,
    contextRows,
    closePopup,
    hasClipboard: () => clip.length > 0,
    clipReady: (paste) => activeAppId === "finder" && !classicEra() && !getActiveEditableElement() && !window.getSelection().toString() && (paste ? clip.length > 0 : selectedKeys().length > 0),
    log: () => opLog.slice(),
  };
  window.AISystem6FinderOpsLoaded = true;
})();
