// Finder Pointer Events drag engine and spring-loaded folder session (lazy).
//
// The eager pointerdown guard in drag-drop.js records a press on a Finder item
// or desktop icon and hands it to adopt() once this module is in. Below the
// threshold nothing happens, so click, double-click and the touch
// select-then-open rule stay native. Past it, the original icons stay put and
// selected while one fixed overlay carries dithered outlines of their icons
// (no label box, as on System 6). Each move hit-tests [data-drop-target] with
// document.elementsFromPoint; the drop is decided by the Finder drop matrix
// (finder-ops.js when it is loaded, a local fallback until then) and then
// dispatched to the existing drop handlers through dispatchInternalDrop, or
// placed on the desktop. Nothing here rewrites a drop handler.
// The Trash and disk drop handlers of the shared drop chain (dispatchInternalDrop
// in drag-drop.js). They load with this module and stay globals, so the HTML5
// drop and the pointer engine reach the same code.
function handleDropToTrash(data) {
  if (data.type === "file") {
    if (Array.isArray(data.items) && data.items.length) {
      moveItemsToTrash(data.items);
      return;
    }
    selectedChatFileId = data.id;
    selectedDocumentFolderId = null;
    moveFileToTrashById(data.id);
  } else if (data.type === "scrap") {
    moveItemsToTrash((Array.isArray(data.ids) && data.ids.length ? data.ids : [data.id]).map((id) => ({ type: "scrap", id })));
  } else if (data.type === "document-folder") {
    if (Array.isArray(data.items) && data.items.length) {
      moveItemsToTrash(data.items);
      return;
    }
    moveDocumentFolderToTrashById(data.id);
  } else if (data.type === "project") {
    // The disk you are working in cannot be put away from under you; eject it
    // first, which is the same order a Macintosh has always asked for.
    if (data.id === activeProjectId && isProjectMounted) {
      setStatus(t("finder_refuse_mounted_disk_trash"));
    } else {
      archiveProjectDiskById(data.id);
    }
  } else if (data.type === "project-cd-item") {
    moveItemsToTrash((Array.isArray(data.ids) && data.ids.length ? data.ids : [data.id]).map((id) => ({ type: "projectCd", id })));
  } else if (data.type === "projectReference") {
    moveItemsToTrash((Array.isArray(data.ids) && data.ids.length ? data.ids : [data.id]).map((id) => ({ type: "projectReference", id })));
  } else if (data.type === "mounted-file") {
    removeMountedFilesToTrash(Array.isArray(data.ids) && data.ids.length ? data.ids : [data.id]);
  } else if (data.type === "mounted-disk") {
    ejectTextDisk();
  }
}

function handleDropToProject(data, targetProjectId, ejected) {
  if (ejected) {
    setStatus(t("finder_refuse_ejected_readonly"));
    return;
  }
  if (!targetProjectId) {
    openWindow("projects");
    setStatus(t("no_project_drop_target"));
    return;
  }

  if (data.projectId === targetProjectId) return;

  if (data.type === "file") {
    const file = chatFiles.find(f => f.id === data.id);
    if (file) {
      file.projectId = targetProjectId;
      saveDeskState();
      renderDocuments();
    }
  } else if (data.type === "scrap") {
    const scrap = scraps.find(s => s.id === data.id);
    if (scrap) {
      scrap.projectId = targetProjectId;
      saveDeskState();
      renderScraps();
    }
  }
}
// End of the shared drop handlers.

(function () {
  // ---- Spring-loaded Folders ----------------------------------------------
  //
  // Hovering a Finder folder for ~650ms while dragging a project file, folder,
  // or Reader selection temporarily opens that folder so the drag can continue
  // into the next level. This is an in-memory navigation aid: it never calls
  // saveDeskState(), never touches Working Session or storage, and the Finder
  // path snaps back to the origin when the drop or drag ends. It only activates
  // on precise pointers; touch keeps the existing behavior (no folder opening
  // on tap-and-hold). Both engines call it: the pointer engine below for Finder
  // items and the HTML5 handlers in drag-drop.js for Reader clippings.
  const springFolderDelayMs = 650;
  let activeInternalDragData = null;
  let springFolderTimer = null;
  let springTimerFolderId = null;
  let springFolderSession = null;

  function isPrecisePointerAvailable() {
    return typeof window.matchMedia === "function"
      && window.matchMedia("(hover: hover) and (pointer: fine)").matches === true;
  }

  function isSpringAllowedDrag(dragData) {
    return !!dragData
      && (dragData.type === "file"
        || dragData.type === "document-folder"
        || dragData.type === "clipping-selection");
  }

  // The session only remembers the origin path; every navigation is transient.
  function beginSpringFolderSession(dragData) {
    // A session another drag left behind is dropped, never restored.
    cancelSpringFolderTimer();
    springFolderSession = null;
    activeInternalDragData = null;
    if (!isPrecisePointerAvailable()) return false;
    if (!isSpringAllowedDrag(dragData)) return false;
    if (!dragData.projectId || dragData.projectId !== activeProjectId) return false;
    cancelSpringFolderTimer();
    springFolderSession = {
      originFolderId: selectedFolderId || "all",
      currentTargetId: null,
      opened: false,
    };
    activeInternalDragData = dragData;
    return true;
  }

  function cancelSpringFolderTimer() {
    if (springFolderTimer !== null) {
      clearTimeout(springFolderTimer);
      springFolderTimer = null;
    }
    springTimerFolderId = null;
  }

  function armSpringFolderTimer(folderId) {
    if (springTimerFolderId === folderId && springFolderTimer !== null) return;
    cancelSpringFolderTimer();
    springTimerFolderId = folderId;
    springFolderTimer = setTimeout(() => {
      springFolderTimer = null;
      springTimerFolderId = null;
      if (!springFolderSession) return;
      springFolderSession.opened = true;
      springFolderSession.currentTargetId = folderId;
      springNavigateToFolder(folderId);
    }, springFolderDelayMs);
  }

  function springFolderTargetValid(folderId) {
    if (!springFolderSession || !activeInternalDragData) return false;
    const dragData = activeInternalDragData;
    if (dragData.projectId !== activeProjectId) return false;
    if (!folderId || !getProjectFolders().some((folder) => folder.id === folderId)) return false;
    if (dragData.type === "document-folder") {
      if (dragData.id === folderId) return false;
      if (typeof isDocumentFolderDescendant === "function" && isDocumentFolderDescendant(folderId, dragData.id)) return false;
    }
    return true;
  }

  function maybeSpringFolder(dropTarget) {
    if (!springFolderSession) return;
    if (!isPrecisePointerAvailable()) return;
    const folderId = dropTarget.dataset.folderId || "";
    if (!springFolderTargetValid(folderId)) return;
    if (springFolderSession.opened && springFolderSession.currentTargetId === folderId) return;
    springFolderSession.currentTargetId = folderId;
    armSpringFolderTimer(folderId);
  }

  // Leaving the folder cancels a timer that has not fired yet.
  function springLeave(dropTarget) {
    if (dropTarget?.dataset?.dropTarget === "document-folder" && dropTarget.dataset.folderId === springTimerFolderId) {
      cancelSpringFolderTimer();
    }
  }

  // Temporary navigation: both Finder surfaces follow the same path. The shared
  // helpers clear stale selections and render, and they never save desk state,
  // show status text, or play sounds.
  function springNavigateToFolder(folderId) {
    if (typeof openDocumentFolder === "function") openDocumentFolder(folderId);
    else {
      selectedFolderId = folderId;
      if (typeof renderDocuments === "function") renderDocuments();
    }
    if (typeof openProjectFinderFolder === "function") openProjectFinderFolder(folderId);
    else {
      selectedProjectRootItemId = null;
      if (typeof renderProjectDisks === "function") renderProjectDisks();
    }
  }

  function springRestoreOrigin() {
    const origin = springFolderSession ? springFolderSession.originFolderId : selectedFolderId || "all";
    if (origin === "all" || !origin) {
      selectedFolderId = "all";
      selectedChatFileId = null;
      selectedDocumentFolderId = null;
      selectedProjectRootItemId = null;
      if (typeof clearDocumentSelection === "function") clearDocumentSelection();
      if (typeof renderDocuments === "function") renderDocuments();
      if (typeof renderProjectDisks === "function") renderProjectDisks();
      return;
    }
    springNavigateToFolder(origin);
  }

  // Idempotent: drop and dragend both call this; only the first call restores
  // the origin path, so the two events can never double-navigate.
  function endSpringFolderSession() {
    cancelSpringFolderTimer();
    if (!springFolderSession) return false;
    springRestoreOrigin();
    springFolderSession = null;
    activeInternalDragData = null;
    return true;
  }

  function getSpringFolderState() {
    return springFolderSession
      ? {
          originFolderId: springFolderSession.originFolderId,
          currentTargetId: springFolderSession.currentTargetId,
          opened: springFolderSession.opened,
        }
      : null;
  }

  // File Floppy rows stay HTML5 (DocMap and ClioStage take them through the
  // external-drop surface); dragging one carries the whole selection.
  function prepareHtml5Drag(target, dragData) {
    if (dragData.type !== "mounted-file" || !dragData.id) return;
    if (!selectedMountedFileNames.has(dragData.id)) {
      selectedMountedFileNames.clear();
      selectedMountedFileNames.add(dragData.id);
      selectedMountedFile = dragData.id;
      renderMountedTextDisk();
    }
    dragData.ids = [...selectedMountedFileNames];
  }

  // ---- Pointer engine -----------------------------------------------------

  const DRAG_THRESHOLD_PX = 4; // mouse and pen
  const LONG_PRESS_MS = 350; // touch arms the drag after holding still this long
  const TOUCH_SLOP_PX = 8; // a finger that moves further first is scrolling
  const SOURCES = ".desktop-icon,.finder-item,.finder-list-row,.desktop-object";
  // On a phone the only drag is the long-press move into a folder, a disk or
  // the Trash; a release anywhere else cancels.
  const PHONE_TARGETS = new Set(["document-folder", "document-current-folder", "trash", "project"]);
  let drag = null;
  let layer = null;

  function isDeskIcon(el) {
    return !!el?.matches?.(".icon-column .desktop-icon");
  }

  // A press belongs to this engine when it is on a desktop icon, or on a Finder
  // object that carries a drag type, and is not under an HTML5 draggable (File
  // Floppy rows, scraps, Project CD items keep the browser's own drag).
  function sourceOf(el) {
    if (!el || el.closest('[draggable="true"]')) return null;
    if (!isDeskIcon(el) && !el.dataset?.dragType) return null;
    return el;
  }

  function phone() {
    return typeof isPhoneFinderViewport === "function" && isPhoneFinderViewport();
  }

  function adopt(pending) {
    if (!pending || pending.up || drag) return false;
    const el = sourceOf(pending.target);
    if (!el || el.isConnected === false) return false;
    const touch = pending.pointerType === "touch";
    drag = {
      el,
      desk: isDeskIcon(el),
      p: pending,
      touch,
      armed: !touch,
      started: false,
      x: pending.x,
      y: pending.y,
      mods: modsOf(pending),
      target: null,
      els: [el],
      dragData: null,
      timer: null,
    };
    listen(true);
    if (touch) drag.timer = setTimeout(arm, Math.max(0, LONG_PRESS_MS - (Date.now() - pending.t)));
    return true;
  }

  function modsOf(e) {
    return { altKey: !!e.altKey, metaKey: !!e.metaKey, ctrlKey: !!e.ctrlKey, shiftKey: !!e.shiftKey };
  }

  function listen(on) {
    const m = on ? "addEventListener" : "removeEventListener";
    document[m]("pointermove", onMove, true);
    document[m]("pointerup", onUp, true);
    document[m]("pointercancel", onCancelEvent, true);
    document[m]("keydown", onKey, true);
    document[m]("contextmenu", onContextMenu, true);
    // Non-passive on purpose: once a long-press has armed the drag, the finger
    // moves the icon and must not also scroll the pane under it.
    document[m]("touchmove", onTouchMove, { capture: true, passive: false });
    document.documentElement[m]("pointerleave", onCancelEvent);
    window[m]("blur", onCancelEvent);
  }

  function arm() {
    if (!drag || drag.started) return;
    drag.armed = true;
    start();
  }

  function onTouchMove(event) {
    if (drag?.armed && drag.touch) event.preventDefault();
  }

  // Only a drag under way swallows the menu: a Ctrl-click on a Mac is a
  // primary-button press that must still open the contextual menu.
  function onContextMenu(event) {
    if (drag?.started) event.preventDefault();
  }

  function onKey(event) {
    if (event.key !== "Escape" || !drag) return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }

  function onCancelEvent(event) {
    if (!drag) return;
    if (event?.pointerId !== undefined && event.type === "pointercancel" && event.pointerId !== drag.p.pointerId) return;
    cancel();
  }

  function outsideViewport(event) {
    return event.clientX < 0 || event.clientY < 0 || event.clientX > window.innerWidth || event.clientY > window.innerHeight;
  }

  function onMove(event) {
    if (!drag || event.pointerId !== drag.p.pointerId) return;
    if (event.buttons === 0 && !drag.touch) {
      // The release happened before this module was listening.
      if (drag.started) cancel();
      else end(false);
      return;
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.mods = modsOf(event);
    if (!drag.started) {
      const distance = Math.hypot(drag.x - drag.p.x, drag.y - drag.p.y);
      if (!drag.armed) {
        // A finger that moves before the long-press is a scroll: let it go.
        if (distance > TOUCH_SLOP_PX) end(false);
        return;
      }
      if (distance < DRAG_THRESHOLD_PX) return;
      start();
    }
    if (outsideViewport(event)) {
      cancel();
      return;
    }
    track();
  }

  function selectionOf(el) {
    if (isDeskIcon(el)) {
      if (!el.classList.contains("is-selected")) {
        document.querySelectorAll(".icon-column .desktop-icon.is-selected").forEach((icon) => icon.classList.remove("is-selected"));
        if (typeof selectDesktopIcon === "function") selectDesktopIcon(el);
        else el.classList.add("is-selected");
      }
      return [...document.querySelectorAll(".icon-column .desktop-icon.is-selected")];
    }
    const type = el.dataset.documentItemType;
    const id = el.dataset.documentItemId;
    if (type && id) {
      if (typeof selectDocumentItem === "function"
        && !(typeof selectedDocumentItemKeys !== "undefined" && selectedDocumentItemKeys.has(documentSelectionKey(type, id)))) {
        selectDocumentItem(type, id);
      }
      const scope = el.closest(".window") || el.parentElement || document;
      const selected = [...scope.querySelectorAll(".is-selected[data-document-item-id]")];
      return selected.includes(el) ? selected : [el];
    }
    return [el];
  }

  // The same payload the HTML5 dragstart used to build, plus where it came from.
  function dragDataOf(el) {
    const d = el.dataset;
    const data = {
      type: d.dragType || "system-icon",
      id: d.id,
      projectId: d.projectId,
      source: "pointer",
      sourceVolume: d.dragType && d.projectId ? d.projectId : "system",
    };
    if (d.documentItemType && typeof getSelectedDocumentItems === "function") {
      data.items = getSelectedDocumentItems().map((entry) => ({ type: entry.type, id: entry.id }));
      if (d.dragType === "projectReference") {
        const ids = data.items.filter((item) => item.type === "projectReference").map((item) => item.id);
        data.ids = ids.length ? ids : [d.id];
      }
    }
    return data;
  }

  function start() {
    drag.started = true;
    drag.els = selectionOf(drag.el);
    drag.dragData = dragDataOf(drag.el);
    // Each item's offset from the press point, taken now: a spring-loaded
    // folder re-renders the sources and a scroll moves them before the drop.
    drag.off = new Map(drag.els.map((el) => {
      const rect = el.getBoundingClientRect();
      return [el, { x: rect.left - drag.p.x, y: rect.top - drag.p.y }];
    }));
    try {
      drag.el.setPointerCapture?.(drag.p.pointerId);
    } catch {}
    layer = document.createElement("div");
    layer.id = "finder-drag-layer";
    layer.setAttribute("aria-hidden", "true");
    // The edge ring of each icon's silhouette: alpha minus its 1px erosion,
    // filled with ink. The classic eras' tokens point the outlines at it.
    layer.innerHTML = '<svg class="finder-drag-defs" focusable="false"><filter id="finder-drag-outline-filter" color-interpolation-filters="sRGB">'
      + '<feMorphology in="SourceAlpha" operator="erode" radius="1" result="inner"/>'
      + '<feComposite in="SourceAlpha" in2="inner" operator="out" result="ring"/>'
      + '<feFlood flood-color="#000"/><feComposite in2="ring" operator="in"/></filter></svg>';
    drag.els.forEach((item) => {
      // Only the icon travels: the dithered outline carries no label box.
      const icon = item.querySelector(".sys-icon");
      if (!icon) return;
      const rect = icon.getBoundingClientRect();
      const outline = document.createElement("div");
      outline.className = "finder-drag-outline";
      outline.style.setProperty("--finder-drag-x", `${rect.left}px`);
      outline.style.setProperty("--finder-drag-y", `${rect.top}px`);
      outline.style.setProperty("--finder-drag-w", `${rect.width}px`);
      outline.style.setProperty("--finder-drag-h", `${rect.height}px`);
      outline.append(icon.cloneNode(true));
      layer.append(outline);
    });
    document.body.append(layer);
    document.body.classList.add("is-finder-dragging");
    beginSpringFolderSession(drag.dragData);
  }

  // The first [data-drop-target] under the point, skipping the overlay and the
  // dragged items themselves. A desktop hit inside a window belongs to that
  // window, so it is no target at all.
  function hitTest(x, y, skip = []) {
    const stack = typeof document.elementsFromPoint === "function" ? document.elementsFromPoint(x, y) : [];
    for (const el of stack) {
      if (el.id === "finder-drag-layer" || el.closest?.("#finder-drag-layer")) continue;
      if (skip.some((item) => item === el || item.contains?.(el))) continue;
      const target = el.closest?.("[data-drop-target]");
      if (!target || skip.includes(target)) continue;
      if (target.dataset.dropTarget === "desktop" && el.closest(".window")) return null;
      return target;
    }
    return null;
  }

  function targetKind(target) {
    const kind = target.dataset.dropTarget;
    if (kind === "document-folder" || kind === "document-current-folder") return "folder";
    if (kind === "project") return target.dataset.ejected === "true" ? "project-ejected" : "project-mounted";
    return ["desktop", "trash", "file-floppy", "editor-insert", "clio-attachment"].includes(kind) ? kind : "other";
  }

  // Until finder-ops.js carries the full matrix (L4), every valid target is a
  // move, with the refusals the desk already knows how to say.
  function localDecision(target, dragData, ctx) {
    const kind = target.dataset.dropTarget;
    if (target.dataset.ejected === "true") return "refuse:finder_refuse_ejected_readonly";
    if (kind === "desktop") return ctx.desk || window.AISystem6FinderOps?.place ? "place" : "dispatch";
    if (ctx.desk && dragData.type === "system-icon") {
      return kind === "trash" && ctx.mountedDisk ? "refuse:finder_refuse_mounted_disk_trash" : "refuse:";
    }
    if (dragData.type === "document-folder" && kind === "document-folder") {
      const folderId = target.dataset.folderId;
      if (folderId === dragData.id
        || (typeof isDocumentFolderDescendant === "function" && isDocumentFolderDescendant(folderId, dragData.id))) {
        return "refuse:finder_refuse_into_itself";
      }
    }
    return "move";
  }

  // decideDrop in finder-ops.js answers with a decision string (move, copy,
  // alias, place, eject, dispatch, refuse:<reasonKey>); anything else falls back
  // to the local decision. A phone only ever moves into folders, disks or Trash.
  function decide(target, dragData, ctx = {}) {
    if (!target) return "refuse:";
    if (ctx.phone && !PHONE_TARGETS.has(target.dataset.dropTarget)) return "refuse:";
    const descriptor = {
      kind: targetKind(target),
      dropTarget: target.dataset.dropTarget,
      projectId: target.id === "active-project-drop-target" ? activeProjectId : target.dataset.projectId || "",
      folderId: target.dataset.folderId || "",
      // A Finder window's own background: the drop point is a place in it.
      window: target.dataset.dropTarget === "document-current-folder",
      sameWindow: !!ctx.sourceGrid && ctx.sourceGrid === target,
      listMode: !!target.classList?.contains("finder-list"),
    };
    const fromOps = window.AISystem6FinderOps?.decideDrop?.(dragData, descriptor, {
      ...(ctx.mods || {}),
      mountedDisk: !!ctx.mountedDisk,
      phone: !!ctx.phone,
      activeProjectId: typeof activeProjectId !== "undefined" ? activeProjectId : "",
    });
    return typeof fromOps === "string" ? fromOps : localDecision(target, dragData, ctx);
  }

  function contextOf() {
    return {
      desk: drag.desk,
      mountedDisk: drag.el.id === "active-project-drop-target",
      sourceGrid: drag.el.closest?.('[data-drop-target="document-current-folder"]') || null,
      phone: phone(),
      mods: drag.mods,
    };
  }

  function clearHit(target) {
    target?.classList?.remove("is-drag-over", "is-drop-reject");
    if (target?.dataset?.dropTarget === "editor-insert") {
      delete target.dataset.dropCaretOffset;
      if (typeof clearEditorInsertCaret === "function") clearEditorInsertCaret(target);
    }
  }

  // TeachText and Question Sheet: the insertion point follows the pointer, as
  // the HTML5 dragover does (finder-objects.js owns the caret helpers).
  function editorTextarea(target) {
    const surface = target.dataset.editorSurface || target.id || "";
    if (surface === "teachtext") return typeof teachTextBodyInput !== "undefined" ? teachTextBodyInput : null;
    return surface === "questionSheet" && typeof questionSheetBodyInput !== "undefined" ? questionSheetBodyInput : null;
  }

  function editorCaret(target, x, y) {
    const textarea = editorTextarea(target);
    if (!textarea) return;
    if (typeof textareaDropOffset !== "function") {
      if (typeof ensureFinderObjectsModule === "function") ensureFinderObjectsModule().catch(() => {});
      return;
    }
    const offset = textareaDropOffset(textarea, { clientX: x, clientY: y });
    target.dataset.dropCaretOffset = String(offset);
    if (typeof positionDropCaret === "function") positionDropCaret(target, textarea, offset);
  }

  // The drop reads the offset of this drag's release point, never one left
  // behind by an earlier drag, and the offset is gone once the insert ran.
  function dropOnEditor(target, dragData, event) {
    const { clientX: x, clientY: y } = dragData;
    delete target.dataset.dropCaretOffset;
    const run = () => {
      editorCaret(target, x, y);
      dispatchInternalDrop(target, dragData, event);
      setTimeout(() => clearHit(target), 0);
    };
    if (typeof textareaDropOffset === "function" || typeof ensureFinderObjectsModule !== "function") run();
    else ensureFinderObjectsModule().then(run, run);
  }

  function track() {
    if (layer) layer.style.transform = `translate(${drag.x - drag.p.x}px, ${drag.y - drag.p.y}px)`;
    const target = hitTest(drag.x, drag.y, drag.els);
    if (target !== drag.target) {
      clearHit(drag.target);
      springLeave(drag.target);
      drag.target = target;
    }
    if (!target) return;
    const decision = decide(target, drag.dragData, contextOf());
    if (decision.startsWith("refuse")) {
      target.classList.remove("is-drag-over");
      target.classList.add("is-drop-reject");
    } else if (decision !== "place") {
      // Placing an icon on the desk does not invert the whole desk.
      target.classList.remove("is-drop-reject");
      target.classList.add("is-drag-over");
    }
    if (target.dataset.dropTarget === "document-folder") maybeSpringFolder(target);
    if (target.dataset.dropTarget === "editor-insert" && !decision.startsWith("refuse")) editorCaret(target, drag.x, drag.y);
  }

  // A real drag never also opens or reselects what was dragged.
  function swallowClick() {
    const stop = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", stop, true), 80);
  }

  function reducedMotion() {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function end(animateBack) {
    if (!drag) return;
    listen(false);
    clearTimeout(drag.timer);
    clearHit(drag.target);
    try {
      if (drag.started) drag.el.releasePointerCapture?.(drag.p.pointerId);
    } catch {}
    document.body.classList.remove("is-finder-dragging");
    const outgoing = layer;
    layer = null;
    if (outgoing) {
      if (animateBack && !reducedMotion()) {
        outgoing.classList.add("is-returning");
        outgoing.style.transform = "";
        setTimeout(() => outgoing.remove(), 220);
      } else {
        outgoing.remove();
      }
    }
    drag = null;
  }

  // Esc, pointercancel, leaving the window, losing focus, or a refused drop:
  // the outlines go home and nothing changes.
  function cancel() {
    if (!drag) return;
    const started = drag.started;
    endSpringFolderSession();
    if (started) swallowClick();
    end(started);
  }

  function onUp(event) {
    if (!drag || event.pointerId !== drag.p.pointerId) return;
    if (!drag.started) {
      end(false);
      return;
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.mods = modsOf(event);
    if (drag.touch && Math.hypot(drag.x - drag.p.x, drag.y - drag.p.y) <= TOUCH_SLOP_PX) {
      // A finger held still and lifted is a slow tap: the tap still selects.
      // In a modern era the armed long-press that never moved opens the
      // contextual menu instead.
      const pressed = drag.el;
      endSpringFolderSession();
      end(false);
      if (!isClassic()) window.AISystem6FinderOps?.openContextMenu?.(pressed, { x: event.clientX, y: event.clientY });
      return;
    }
    const target = hitTest(drag.x, drag.y, drag.els);
    const ctx = contextOf();
    const decision = decide(target, drag.dragData, ctx);
    if (decision.startsWith("refuse")) {
      const reason = decision.slice("refuse:".length);
      if (reason && typeof setStatus === "function") setStatus(t(reason));
      cancel();
      return;
    }
    const dragData = { ...drag.dragData, ...ctx.mods, clientX: drag.x, clientY: drag.y };
    const off = drag.off || new Map();
    // The release point is taken before end() clears the drag: the place paths
    // below still ask at() where each item was let go.
    const release = { x: drag.x, y: drag.y };
    const at = (el) => ({ left: release.x + (off.get(el)?.x || 0), top: release.y + (off.get(el)?.y || 0) });
    const els = drag.els;
    if (target?.dataset.dropTarget === "document-current-folder") dragData.windowPositions = windowLanding(els, at, target);
    swallowClick();
    end(false);
    try {
      if (target?.dataset.dropTarget === "editor-insert") dropOnEditor(target, dragData, event);
      else if (decision === "place") place(els, at, dragData, target, ctx);
      // Copy, alias, a move that takes an object off the desk, and Trash (for
      // Undo) go through the Finder operations; the rest is today's chain.
      else if (!window.AISystem6FinderOps?.perform?.(decision, target, dragData, event)) dispatchInternalDrop(target, dragData, event);
    } catch (error) {
      console.error("Drop failed", error);
      if (typeof setStatus === "function") setStatus(t("drop_failed", typeof friendlyErrorDetail === "function" ? friendlyErrorDetail(error) : ""));
    }
  }

  // Where each dragged item lands, in desktop-layer px (the .desktop element's
  // top-left), keeping the grab offset. at(el) is the item's top-left on screen
  // at the release, from the offset taken when the drag started.
  function landing(els, at) {
    const desk = document.querySelector(".desktop")?.getBoundingClientRect() || { left: 0, top: 0 };
    return els.map((el) => {
      const rect = at(el);
      return { el, x: rect.left - desk.left, y: rect.top - desk.top };
    });
  }

  // Where each dragged item lands inside a Finder window's icon area: the
  // grid's content-box origin, its scroll included.
  function windowLanding(els, at, grid) {
    const box = grid.getBoundingClientRect();
    const positions = {};
    els.forEach((el) => {
      const key = el.dataset.finderKey || `${el.dataset.documentItemType}:${el.dataset.documentItemId}`;
      const rect = at(el);
      positions[key] = {
        x: Math.round(rect.left - box.left - grid.clientLeft + grid.scrollLeft),
        y: Math.round(rect.top - box.top - grid.clientTop + grid.scrollTop),
      };
    });
    return positions;
  }

  function place(els, at, dragData, target, ctx) {
    endSpringFolderSession();
    if (target?.dataset.dropTarget === "document-current-folder") {
      const positions = dragData.windowPositions || windowLanding(els, at, target);
      const run = () => window.AISystem6FinderOps.placeInWindow(positions, ctx.mods, target);
      if (window.AISystem6FinderOps?.placeInWindow) run();
      else ensureFinderOpsModule().then(run).catch((error) => console.warn("Finder operations failed to load.", error));
      return;
    }
    const entries = landing(els, at);
    if (ctx.desk) {
      // Classic eras keep the icon where it was released; Cmd snaps it to the
      // Clean Up grid. Modern eras snap by default.
      const snap = typeof isClassicFinderEra === "function" && isClassicFinderEra() ? ctx.mods.metaKey : true;
      ensureFinderDeskModule()
        .then(() => window.AISystem6FinderDesk.placeIcons(entries, { snap }))
        .catch((error) => console.warn("Finder desk failed to load.", error));
      return;
    }
    const ops = window.AISystem6FinderOps;
    if (typeof ops?.place === "function") {
      const positions = {};
      entries.forEach(({ el, x, y }) => {
        positions[`${el.dataset.documentItemType}:${el.dataset.documentItemId}`] = { x: Math.round(x), y: Math.round(y) };
      });
      ops.place(dragData, { target, positions }, ctx.mods);
      return;
    }
    dispatchInternalDrop(target, dragData, null);
  }

  // The browser's own image drag would steal the pointer from an icon this
  // engine owns.
  document.addEventListener("dragstart", (event) => {
    const el = event.target?.closest?.(SOURCES);
    if (drag || (sourceOf(el) && !event.target.closest("input,textarea,[contenteditable]"))) event.preventDefault();
  }, true);

  // ---- P3: contextual menu, keyboard, drag out ----------------------------
  function isClassic() {
    return typeof isClassicFinderEra !== "function" || isClassicFinderEra();
  }

  // Right-click: a modern Finder opens its small menu; a classic one has no
  // contextual menus, and the browser's own menu is not shown on Finder items.
  function onFinderContextMenu(event) {
    const el = event.target?.closest?.(SOURCES);
    if (!el || drag?.started || !(el.matches(".icon-column .desktop-icon") || el.dataset?.dragType)) return;
    if (drag) end(false);
    event.preventDefault();
    if (!isClassic()) window.AISystem6FinderOps?.openContextMenu?.(el, { x: event.clientX, y: event.clientY });
  }
  document.addEventListener("contextmenu", onFinderContextMenu);

  function frontFinderWindow() {
    const name = document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window;
    return name === "projects" || name === "documents" ? name : "";
  }

  function navigable() {
    const name = frontFinderWindow();
    const scope = name ? document.querySelector(`.window[data-window="${name}"]`) : null;
    const list = scope
      ? scope.querySelectorAll(":is(.finder-item, .finder-list-row)[data-drag-type], :is(.finder-item, .finder-list-row)[data-document-item-type]")
      : document.querySelectorAll(".icon-column .desktop-icon");
    return [...list].filter((el) => el.offsetParent !== null);
  }

  // What a rename keystroke names: the focused desktop object, else the one
  // file or folder selected in the front Finder window, else a selected
  // desktop object.
  function renamable() {
    const focused = document.activeElement;
    if (focused?.matches?.(".desktop-object.is-selected")) return [focused];
    const name = frontFinderWindow();
    const inWindow = name
      ? [...document.querySelectorAll(`.window[data-window="${name}"] :is(.finder-item,.finder-list-row).is-selected:is([data-document-item-type=file],[data-document-item-type=folder])`)]
      : [];
    return inWindow.length ? inWindow : [...document.querySelectorAll(".desktop-object.is-selected")];
  }

  // A press inside a window ends the desktop's selection, as on the Finder
  // desk, so a later menu command or keystroke never acts on a desktop icon
  // the writer has left.
  document.addEventListener("pointerdown", (event) => {
    if (!event.target?.closest?.(".window")) return;
    document.querySelectorAll(".icon-column .desktop-icon.is-selected").forEach((icon) => icon.classList.remove("is-selected"));
    try {
      if (typeof selectedDesktopIconEl !== "undefined") selectedDesktopIconEl = null;
    } catch {}
  }, true);

  function pick(el) {
    if (el.matches(".icon-column .desktop-icon") && typeof selectDesktopIcon === "function") selectDesktopIcon(el);
    else el.click();
    el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  // True for a keystroke the Finder's keyboard may take: the Finder is the
  // front application, nothing editable has the caret, no menu or dialog is up.
  function finderKeyReady() {
    return typeof activeAppId !== "undefined" && activeAppId === "finder"
      && !(typeof getActiveEditableElement === "function" && getActiveEditableElement())
      && !document.querySelector(".menu.is-open, .is-renaming") && !document.body.classList.contains("has-system-modal");
  }

  let typed = "";
  let typedAt = 0;
  const ARROWS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

  // Modern eras only: classic eras type to rename (inline rename lane).
  function typeSelect(items, key, now = Date.now()) {
    typed = now - typedAt > 1000 ? key : typed + key;
    typedAt = now;
    const name = (el) => (el.querySelector(":scope > .finder-list-name-cell > span:not(.sys-icon), :scope > span:not(.sys-icon)") || el).textContent.trim().toLowerCase();
    return items.find((el) => name(el).startsWith(typed.toLowerCase())) || null;
  }

  function onFinderKey(event) {
    if (event.defaultPrevented && !event.metaKey) return;
    if (event.isComposing || event.key === "Process" || !finderKeyReady() || event.target?.closest?.("select,input,[role=tab],[role=slider],[role=radio],[role=menuitem],[role=listbox]")) return;
    const arrow = ARROWS[event.key];
    const theme = typeof getCurrentTheme === "function" ? getCurrentTheme() : "";
    if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && theme !== "nextstep" && arrow) {
      if (arrow === "down") {
        // The registry row prints ⌘↓; the key opens the selection.
        if (!document.querySelector(".desktop-icon.is-selected, .finder-item.is-selected, .finder-list-row.is-selected")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        handleAction("open-menu-selection");
      } else if (arrow === "up" && frontFinderWindow() && typeof navigateFinderUp === "function") {
        event.preventDefault();
        event.stopImmediatePropagation();
        navigateFinderUp(frontFinderWindow());
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // Rename by keyboard: Return in every era; in a classic era any printable
    // key starts the new name with it and Backspace starts it empty. A focused
    // control that is not a Finder item keeps its own keys.
    const text = event.key === "Enter" ? null : isClassic() && event.key === "Backspace" ? "" : isClassic() && event.key.length === 1 ? event.key : undefined;
    const control = event.target?.closest?.("button,a,[role=button],[tabindex]") && !event.target.closest(SOURCES);
    if (text !== undefined && !control && !event.repeat) {
      const picked = renamable();
      if (picked.length === 1) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof closeMenus === "function") closeMenus();
        const run = () => window.AISystem6FinderOps.run("begin-rename", { el: picked[0], selectAll: text === null, initialText: text ?? undefined });
        if (window.AISystem6FinderOps) run();
        else ensureFinderOpsModule().then(run).catch(() => {});
        return;
      }
    }
    if (arrow && !event.shiftKey) {
      const items = navigable();
      if (!items.length) return;
      event.preventDefault();
      const current = items.filter((el) => el.classList.contains("is-selected")).pop();
      if (!current) {
        pick(items[0]);
        return;
      }
      const rect = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, el }; };
      ensureFinderSpaceModule().then(() => {
        const next = window.AISystem6FinderSpace.nearestInDirection(rect(current), items.filter((el) => el !== current).map(rect), arrow);
        if (next) pick(next.el);
      }).catch(() => {});
      return;
    }
    if (!isClassic() && event.key.length === 1 && (event.key !== " " || typed) && !event.shiftKey) {
      const match = typeSelect(navigable(), event.key);
      if (match) {
        event.preventDefault();
        pick(match);
      }
    }
  }
  document.addEventListener("keydown", onFinderKey, true);

  // Drag out to the Mac Finder (spike, owner decision 9): Chromium's HTML5
  // DownloadURL lets a proxy icon hand over a copy as a Markdown file. Only the
  // Get Info icon stage is a proxy: Finder icons belong to the pointer engine,
  // which cancels at the viewport edge. Safari and the macOS shell (WKWebView,
  // no DownloadURL and no native export bridge yet) never get the proxy or its
  // hint.
  function dragOutSupported(nav = typeof navigator !== "undefined" ? navigator : null) {
    const brands = nav?.userAgentData?.brands;
    return Array.isArray(brands) && brands.some((b) => /Chromium|Google Chrome/.test(b.brand));
  }

  function downloadUrlFor(item) {
    if (!item || typeof formatInfoItemMarkdown !== "function") return "";
    const body = String(formatInfoItemMarkdown(item) || "");
    if (!body || body.length > 4000000) return "";
    const name = (typeof sanitizeFilename === "function" ? sanitizeFilename(item.name || item.title || "Untitled") : "Untitled").replace(/:/g, "-");
    return `text/markdown:${name}.md:data:text/markdown;charset=utf-8,${encodeURIComponent(body)}`;
  }

  if (dragOutSupported()) {
    const stageSel = ".info-icon-stage";
    document.addEventListener("pointerover", (event) => {
      const stage = event.target?.closest?.(stageSel);
      if (!stage || typeof fileInfoItem === "undefined" || !fileInfoItem || !downloadUrlFor(fileInfoItem)) return;
      stage.draggable = true;
      if (!stage.parentElement.querySelector(".finder-drag-out-hint")) {
        const hint = document.createElement("p");
        hint.className = "hint finder-drag-out-hint";
        hint.textContent = t("drag_out_hint");
        stage.parentElement.querySelector(".info-main")?.append(hint);
      }
    });
    document.addEventListener("dragstart", (event) => {
      const stage = event.target?.closest?.(stageSel);
      if (!stage) return;
      const url = typeof fileInfoItem !== "undefined" ? downloadUrlFor(fileInfoItem) : "";
      if (!url) { event.preventDefault(); return; }
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("DownloadURL", url);
    }, true);
  }

  window.AISystem6FinderDrag = {
    adopt,
    typeSelect,
    dragOutSupported,
    downloadUrlFor,
    isClassic,
    cancel,
    hitTest,
    decide,
    prepareHtml5Drag,
    beginSpringFolderSession,
    endSpringFolderSession,
    getSpringFolderState,
    springHover: maybeSpringFolder,
    springLeave,
    isDragging: () => !!drag?.started,
    windowLanding,
  };
  window.AISystem6FinderDragLoaded = true;
  // The drop matrix answers before the first drop lands.
  if (typeof ensureFinderOpsModule === "function") ensureFinderOpsModule().catch(() => {});
})();
