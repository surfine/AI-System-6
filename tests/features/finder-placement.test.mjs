// Contract: Finder spatial math (finder-space.js) and the lazy Finder module wiring.
// Later lanes extend the marked sections: drop matrix, put away, classic undo scope.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("finder-placement");
const assertEqual = (a, b, m) => test.assert(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)})`);
const win = {};
vm.runInNewContext(read("app/core/finder-space.js"), { window: win, Intl });
const S = win.AISystem6FinderSpace;
test.assert(win.AISystem6FinderSpaceLoaded === true, "finder-space sets its flag");

const grid = S.gridFor("classic", {});
const bounds = { x: 0, y: 0, width: 640, height: 400 };

// snap / cellOf
const cell = S.cellOf({ x: 140, y: 75 }, grid);
const snapped = S.snap({ x: 140, y: 75 }, grid);
assertEqual(S.cellOf(snapped, grid), cell, "snap and cellOf round-trip");
assertEqual(S.snap(snapped, grid), snapped, "snap is idempotent");

// nearestFreeCell
const occupied = [{ x: snapped.x, y: snapped.y, w: grid.cellW, h: grid.cellH }];
const free = S.nearestFreeCell(snapped, occupied, grid, bounds);
test.assert(free && (free.x !== snapped.x || free.y !== snapped.y), "nearestFreeCell skips an occupied cell");
assertEqual(S.nearestFreeCell(snapped, [], grid, bounds), snapped, "a free cell is returned as is");

// cleanUp keeps relative order; selection moves only selected
const items = [
  { key: "b", x: 200, y: 20 },
  { key: "a", x: 30, y: 20 },
  { key: "c", x: 30, y: 200 },
];
const cleaned = S.cleanUp(items, grid, bounds, {});
test.assert(cleaned.a.x < cleaned.b.x && cleaned.a.y === cleaned.b.y, "cleanUp keeps reading order");
const only = S.cleanUp(items, grid, bounds, { selectionKeys: ["c"] });
assertEqual(Object.keys(only), ["c"], "cleanUp with selectionKeys moves only those items");

// cleanUpByName
const named = S.cleanUpByName([{ key: "z", name: "Zebra" }, { key: "a", name: "Apple" }, { key: "m", name: "Mango" }], grid, bounds, "en");
test.assert(named.a.x < named.m.x && named.m.x < named.z.x, "English names order left to right");
const zh = S.cleanUpByName([{ key: "c", name: "丁" }, { key: "a", name: "阿" }, { key: "b", name: "博" }], grid, bounds, "zh-CN");
test.assert(zh.a.x < zh.b.x && zh.b.x < zh.c.x, "Chinese names order by pinyin");

// clampIntoView
const input = { x: 900, y: 700 };
const clamped = S.clampIntoView(input, { width: 64, height: 64 }, { x: 0, y: 0, width: 400, height: 300 });
assertEqual(clamped, { x: 336, y: 236 }, "a far-off icon is clamped inside a shrunk view");
assertEqual(input, { x: 900, y: 700 }, "clampIntoView does not mutate its input");

// autoArrange right-column
const col = S.autoArrange(["a", "b", "c", "d", "trash"].map((key) => ({ key })), { x: 0, y: 0, width: 200, height: 200 }, grid, { anchor: "right-column", pinLastKey: "trash" });
const cols = Math.floor((200 - grid.originX) / grid.cellW);
const rows = Math.floor((200 - grid.originY) / grid.cellH);
assertEqual(col.trash, { x: grid.originX + (cols - 1) * grid.cellW, y: grid.originY + (rows - 1) * grid.cellH }, "trash is pinned bottom-right");
test.assert(col.d.x < col.a.x, "a full lane wraps leftward");

assertEqual(S.duplicateOffset({ x: 10, y: 20 }), { x: 26, y: 36 }, "duplicate offsets +16/+16");
test.assert(S.isPhoneViewportPure({ width: 390, height: 844, coarse: true }), "390x844 coarse is a phone");
test.assert(!S.isPhoneViewportPure({ width: 820, height: 1180, coarse: true }), "a tablet is not a phone");
test.assert(!S.isPhoneViewportPure({ width: 1440, height: 900, coarse: false }), "a desktop is not a phone");
assertEqual(S.nearestInDirection({ x: 0, y: 0, w: 10, h: 10 }, [{ x: 50, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }], "right").x, 20, "arrow keys pick the nearest in direction");

// Source facts
const manifest = read("tooling/runtime-manifest.mjs");
const lazyBlock = manifest.slice(manifest.indexOf("lazyRuntimePaths"));
const appBlock = manifest.slice(manifest.indexOf("appModulePaths"), manifest.indexOf("lazyRuntimePaths"));
for (const p of ["finder-space", "finder-drag", "finder-ops", "finder-desk"]) {
  test.assertIncludes(lazyBlock, `app/core/${p}.js`, `${p} is lazy`);
  test.assertNotIncludes(appBlock, `app/core/${p}.js`, `${p} is not eager`);
}
test.assertMatches(read("app/core/multi-finder.js"), /function isClassicFinderEra\(\)[^}]*"window-menu"/, "classic era is the absence of the window-menu capability");

// --- Engine (L3): pointer drag engine, eager guard, dispatch extraction ---
const dragDropSrc = read("app/core/drag-drop.js");
const finderDragSrc = read("app/core/finder-drag.js");
const spatialCss = read("styles/89-finder-spatial.css");
const guard = dragDropSrc.slice(dragDropSrc.indexOf('document.addEventListener("pointerdown"'), dragDropSrc.indexOf('const prefetchFinderDrag'));
test.assert(guard.length > 0, "drag-drop.js carries the eager pointerdown guard");
test.assertIncludes(guard, "window.AISystem6FinderDragPending", "the guard records the press for the engine");
test.assertIncludes(guard, "ensureFinderDragModule().then(() => window.AISystem6FinderDrag.adopt(pending))", "and lazy-ensures finder-drag before handing it over");
test.assertNotIncludes(guard, "preventDefault", "the guard never cancels the press, so click and double-click stay native");
test.assertIncludes(guard, "}, true);", "the guard listens in the capture phase");
test.assertIncludes(dragDropSrc, 'document.addEventListener("pointerover", prefetchFinderDrag)', "hovering a Finder object prefetches the engine");
test.assertIncludes(dragDropSrc, "function dispatchInternalDrop(dropTarget, dragData, event)", "the internal drop chain is one eager function");
test.assertIncludes(dragDropSrc, "dispatchInternalDrop(dropTarget, JSON.parse(rawData), event)", "the HTML5 drop calls it");
test.assertIncludes(finderDragSrc, "dispatchInternalDrop(target, dragData, event)", "and so does the pointer engine");
test.assertIncludes(finderDragSrc, "document.elementsFromPoint(x, y)", "the engine hit-tests with elementsFromPoint");
test.assertIncludes(finderDragSrc, "LONG_PRESS_MS = 350", "touch arms the drag after a 350ms long-press");
test.assertIncludes(finderDragSrc, "DRAG_THRESHOLD_PX = 4", "mouse and pen start after 4px");
test.assertIncludes(finderDragSrc, '"touchmove", onTouchMove, { capture: true, passive: false }', "an armed touch drag holds the pane still with a non-passive touchmove");
test.assertIncludes(finderDragSrc, 'item.querySelector(".sys-icon")', "the outline clones only the icon");
test.assertNotMatches(finderDragSrc, /cloneNode\(true\)[^;]*label|item\.cloneNode/, "no label box and no whole-item clone travels with the pointer");
test.assertMatches(spatialCss, /\.finder-drag-outline \{[^}]*mask-image: var\(--finder-drag-mask, none\)/, "the outline takes its mask from the era tokens");
test.assertMatches(spatialCss, /\[data-lineage~="classic"\], \[data-theme="nextstep"\]\) \{[^}]*--finder-drag-mask: repeating-conic-gradient[^}]*--finder-drag-filter: url|\[data-lineage~="classic"\], \[data-theme="nextstep"\]\) \{[^}]*--finder-drag-filter: url[^}]*--finder-drag-mask: repeating-conic-gradient/, "classic eras dither a hollow outline: a 50% checker over the silhouette's edge ring");
test.assertMatches(read("app/core/finder-drag.js"), /feMorphology in="SourceAlpha" operator="erode"[\s\S]{0,120}operator="out"/, "the outline filter keeps only the edge ring of the icon's silhouette");
test.assertMatches(spatialCss, /\[data-theme="nextstep"\]\) \{[^}]*--finder-rename-bg: #000/, "a classic rename inverts black on white, never the OS accent");
test.assertMatches(spatialCss, /#finder-drag-layer \{[^}]*position: fixed;[^}]*pointer-events: none/, "one fixed overlay that never takes the pointer");
for (const file of ["app/features/documents-chat.js"]) {
  test.assertNotIncludes(read(file), ".draggable = true", `${file} leaves Finder items to the pointer engine`);
}
const projectDiskSrc = read("app/features/project-disk.js");
test.assertNotMatches(projectDiskSrc, /(row|button)\.draggable = true;\n\s+(row|button)\.dataset\.dragType = isFolder/, "Project Disk Finder items are not HTML5 draggables");
test.assertIncludes(projectDiskSrc, "window.AISystem6FinderDesk?.sync?.();", "the spatial desk re-syncs after the disks are drawn");
test.assertIncludes(read("app/core/window-manager.js"), 'iconColumn?.classList.contains("is-spatial")', "window avoidance reads the icons, not the full-desktop layer");
test.assertMatches(read("app/core/window-manager.js"), /function syncIconColumnDensity\(\) \{[^}]*is-spatial/, "column density ignores the spatial desk");

// Hit test and decision, with a stubbed elementsFromPoint.
function el(id, dataset = {}, parent = null, classes = []) {
  const node = { id, dataset, parent, classes: new Set(classes) };
  node.matches = (selector) => selector === ".icon-column .desktop-icon" && node.classes.has("desktop-icon") && !!node.parent?.classes.has("icon-column");
  node.contains = (other) => { for (let n = other; n; n = n.parent) if (n === node) return true; return false; };
  node.closest = (selector) => {
    for (let n = node; n; n = n.parent) {
      if (selector === "[data-drop-target]" && n.dataset.dropTarget) return n;
      if (selector === ".window" && n.classes.has("window")) return n;
      if (selector === "#finder-drag-layer" && n.id === "finder-drag-layer") return n;
      if (selector === '[draggable="true"]' && n.draggable === true) return n;
    }
    return null;
  };
  return node;
}
const desktopEl = el("desk", { dropTarget: "desktop" });
const column = el("", {}, desktopEl, ["icon-column"]);
const trashEl = el("", { dropTarget: "trash", open: "trash" }, column, ["desktop-icon"]);
const mountedDisk = el("active-project-drop-target", { dropTarget: "project", projectId: "p1" }, column, ["desktop-icon"]);
const ejectedDisk = el("", { dropTarget: "project", projectId: "p2", ejected: "true", dragType: "project", id: "p2" }, column, ["desktop-icon"]);
const startupDisk = el("", { open: "disk" }, column, ["desktop-icon"]);
const finderWin = el("", {}, desktopEl, ["window"]);
const pane = el("", { dropTarget: "document-current-folder", folderId: "f-root" }, finderWin);
const folderA = el("", { dropTarget: "document-folder", folderId: "f-a", dragType: "document-folder", id: "f-a" }, pane, ["finder-item"]);
const folderB = el("", { dropTarget: "document-folder", folderId: "f-b" }, folderA);
const winBody = el("", {}, finderWin);
let stack = [];
const dragWin = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: true }) };
const dragCtx = vm.createContext({
  window: dragWin,
  document: { addEventListener() {}, removeEventListener() {}, documentElement: { addEventListener() {}, removeEventListener() {} }, elementsFromPoint: () => stack },
  activeProjectId: "p1",
  isDocumentFolderDescendant: (folderId, ancestorId) => folderId === "f-b" && ancestorId === "f-a",
  setTimeout, clearTimeout, Date, Math, console,
});
vm.runInContext(finderDragSrc, dragCtx);
const engine = dragWin.AISystem6FinderDrag;
test.assert(dragWin.AISystem6FinderDragLoaded === true, "finder-drag sets its flag");
stack = [trashEl, column, desktopEl];
test.assert(engine.hitTest(0, 0, [startupDisk]) === trashEl, "the first drop target under the point wins");
stack = [startupDisk, column, desktopEl];
test.assert(engine.hitTest(0, 0, [startupDisk]) === desktopEl, "the dragged icon itself is skipped, the desk behind it is the target");
stack = [winBody, finderWin, desktopEl];
test.assert(engine.hitTest(0, 0, []) === null, "the desk behind a window is no target");
stack = [folderA, pane, finderWin];
test.assert(engine.hitTest(0, 0, [folderA]) === pane, "a dragged folder never targets itself");

const fileData = { type: "file", id: "x", projectId: "p1" };
const iconData = { type: "system-icon" };
test.assert(engine.decide(desktopEl, iconData, { desk: true }) === "place", "a system icon released on the desk is placed");
test.assert(engine.decide(trashEl, fileData, {}) === "move", "a file onto the Trash is dispatched to the existing handler");
test.assert(engine.decide(ejectedDisk, fileData, {}) === "refuse:finder_refuse_ejected_readonly", "an ejected disk refuses with the read-only reason");
test.assert(engine.decide(trashEl, iconData, { desk: true, mountedDisk: true }) === "refuse:finder_refuse_mounted_disk_trash", "the mounted disk refuses the Trash with a reason");
test.assert(engine.decide(trashEl, { type: "project", id: "p2" }, { desk: true }) === "move", "an ejected disk to the Trash goes to the existing put-away path");
test.assert(engine.decide(folderB, { type: "document-folder", id: "f-a", projectId: "p1" }, {}) === "refuse:finder_refuse_into_itself", "a folder into its own descendant is refused");
test.assert(engine.decide(desktopEl, iconData, { desk: true, phone: true }) === "refuse:", "a phone never places: a release on the desk cancels");
test.assert(engine.decide(folderA, fileData, { phone: true }) === "move", "a phone still moves into a folder");
test.assert(engine.decide(desktopEl, fileData, {}) === "dispatch", "until finder-ops can place, a Finder item on the desk takes today's path");
dragWin.AISystem6FinderOps = { decideDrop: () => "copy" };
test.assert(engine.decide(trashEl, fileData, {}) === "copy", "a loaded drop matrix answering with a decision string wins");
dragWin.AISystem6FinderOps = { decideDrop: () => ({ decision: "dispatch" }) };
test.assert(engine.decide(desktopEl, iconData, { desk: true }) === "place", "a non-string answer falls back to the local decision");
test.assert(engine.adopt({ target: startupDisk, up: true, pointerType: "mouse" }) === false, "a press released before the engine loaded stays a plain click");
startupDisk.draggable = true;
test.assert(engine.adopt({ target: startupDisk, pointerType: "mouse", x: 0, y: 0, t: 0 }) === false, "an HTML5 draggable keeps the browser's drag");
delete startupDisk.draggable;

const deskSrc = read("app/core/finder-desk.js");
test.assertIncludes(deskSrc, '"ais6.desktop.systemIconPositions"', "system icon positions are a machine preference");
test.assertIncludes(deskSrc, "clampIntoView(point", "a shrunk view clamps what is drawn");
test.assertNotMatches(deskSrc.slice(deskSrc.indexOf("function sync()"), deskSrc.indexOf("function scheduleSync")), /writePositions\(/, "sync never writes the clamped position back");
test.assertIncludes(read("app/core/wireup.js"), 'if (localStorage.getItem("ais6.desktop.systemIconPositions")) ensureFinderDeskModule()', "the desk module loads at boot only once an icon was placed");

// --- Extended by later lanes: drop matrix (L4), put away (L5), classic undo scope (L7) ---

// Drop matrix, op log, put away and undo scope (L4): finder-ops.js in a VM.
function opsContext({ classic = true, failCommit = false } = {}) {
  const files = [
    { id: "f1", projectId: "p1", type: "text", name: "Notes", folderId: "fa" },
    { id: "f2", projectId: "p1", type: "text", name: "Draft", folderId: null, placement: { desktop: { x: 40, y: 60 } } },
  ];
  const folders = [{ id: "fa", projectId: "p1", name: "Research", parentId: null }];
  const statuses = [];
  const events = [];
  const opsWin = { dispatchEvent: (event) => events.push(event.detail) };
  const context = {
    window: opsWin,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    chatFiles: files,
    chatFolders: folders,
    trashItems: [],
    activeProjectId: "p1",
    finderPlacementVersion: 0,
    isClassicFinderEra: () => classic,
    t: (key, ...args) => [key, ...args].join("|"),
    setStatus: (text) => statuses.push(text),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    structuredClone, Date, Math, console, Promise, Object, JSON, Set, Map,
    crypto: { randomUUID: (() => { let n = 0; return () => `new-${++n}`; })() },
  };
  opsWin.AISystem6StateStores = {
    projects: {
      async commit(updater) {
        const draft = { chatFiles: structuredClone(files), chatFolders: structuredClone(folders) };
        updater(draft);
        if (failCommit) {
          const error = new Error("refused");
          error.code = "STORE_PERSIST_FAILED";
          throw error;
        }
        files.splice(0, files.length, ...draft.chatFiles);
        folders.splice(0, folders.length, ...draft.chatFolders);
        return { ok: true };
      },
    },
  };
  vm.runInNewContext(read("app/core/finder-ops.js"), context);
  return { ops: opsWin.AISystem6FinderOps, files, folders, statuses, events, context };
}

{
  const { ops } = opsContext();
  const file = { type: "file", id: "f1", projectId: "p1", sourceVolume: "p1" };
  const folder = { type: "document-folder", id: "fa", projectId: "p1", sourceVolume: "p1" };
  const into = (folderId, projectId = "p1") => ({ kind: "folder", folderId, projectId });
  const classic = { era: "classic", activeProjectId: "p1" };
  const modern = { era: "aqua", activeProjectId: "p1" };
  test.assert(ops.decideDrop(file, into("fb"), classic) === "move", "same volume, no modifier: move");
  test.assert(ops.decideDrop(file, into("fb"), { ...classic, altKey: true }) === "copy", "Option-drag copies in a classic era too");
  test.assert(ops.decideDrop(file, into("fb"), { ...modern, altKey: true }) === "copy", "and in a modern era");
  test.assert(ops.decideDrop({ ...file, projectId: "p2", sourceVolume: "p2" }, into("fb", "p1"), classic) === "copy", "a cross-volume drop copies");
  test.assert(ops.decideDrop(file, into("fb"), { ...modern, altKey: true, metaKey: true }) === "alias", "Cmd-Option-drag makes an alias in a modern era");
  test.assert(ops.decideDrop(file, into("fb"), { ...classic, altKey: true, metaKey: true }) === "copy", "and is Option (copy) in a classic era");
  test.assert(ops.decideDrop(folder, into("fa"), classic) === "refuse:finder_refuse_into_itself", "a folder into itself is refused");
  test.assert(ops.decideDrop(folder, into("fc"), { ...classic, isDescendant: (id, ancestor) => id === "fc" && ancestor === "fa" }) === "refuse:finder_refuse_into_itself", "and into its own descendant");
  test.assert(ops.decideDrop(file, { kind: "project-ejected", projectId: "p2" }, classic) === "refuse:finder_refuse_ejected_readonly", "any drop on an ejected disk is refused");
  test.assert(ops.decideDrop({ type: "system-icon" }, { kind: "trash" }, { ...classic, mountedDisk: true }) === "refuse:finder_refuse_mounted_disk_trash", "the mounted disk refuses the Trash");
  test.assert(ops.decideDrop({ type: "project", id: "p2" }, { kind: "trash" }, classic) === "eject", "an ejected disk to the Trash is put away");
  test.assert(ops.decideDrop(file, { kind: "desktop" }, classic) === "place", "a file onto the desktop is placed");
  test.assert(ops.decideDrop(folder, { kind: "desktop" }, modern) === "place", "and so is a folder");
  test.assert(ops.decideDrop({ type: "system-icon" }, { kind: "desktop" }, classic) === "place", "a system icon onto the desktop is placed");
  test.assert(ops.decideDrop(file, { kind: "trash" }, classic) === "dispatch", "an item onto the Trash goes to the existing handler");
  for (const kind of ["editor-insert", "clio-attachment", "other"]) {
    test.assert(ops.decideDrop(file, { kind }, classic) === "dispatch", `${kind} is dispatched`);
  }
}

{
  // Place, put away and the classic undo scope.
  const { ops, files, events, context } = opsContext({ classic: true });
  await ops.place({ type: "file", id: "f1" }, { positions: { "file:f1": { x: 101.4, y: 202.6 } } }, {});
  assertEqual(files.find((f) => f.id === "f1").placement.desktop, { x: 101, y: 203 }, "a classic era keeps the release point");
  test.assert(files.find((f) => f.id === "f1").folderId === "fa", "placing keeps the folder");
  test.assert(context.finderPlacementVersion === 1 && events[0]?.op === "place", "a placement bumps the version and tells the renderers");
  test.assert(ops.canUndo() === false, "classic: Undo is dimmed after a place");
  await ops.putAwayDesktop(["file:f2"]);
  test.assert(files.find((f) => f.id === "f2").placement.desktop === null && files.find((f) => f.id === "f2").folderId === null, "Put Away nulls the desktop place and keeps the folder");
  await ops.rename("file:f1", "Field notes");
  test.assert(ops.canUndo() === true, "classic: the last rename can be undone");
  await ops.undo();
  test.assert(files.find((f) => f.id === "f1").name === "Notes", "Undo takes the name back");
  await ops.rename("file:f1", "Field notes");
  await ops.place({}, { positions: { "file:f1": { x: 0, y: 0 } } }, {});
  test.assert(ops.canUndo() === false, "classic: any other operation clears the rename undo");
}

{
  // Modern eras: a 50-step stack covering moves, copies and placement.
  const { ops, files } = opsContext({ classic: false });
  for (let i = 0; i < 60; i += 1) await ops.place({}, { positions: { "file:f1": { x: i, y: i } } }, { era: "aqua", metaKey: false });
  const stack = ops.log().filter((entry) => entry.op === "place").length;
  test.assert(stack === 50, `the op log is capped at 50 (got ${stack})`);
  let undone = 0;
  while (ops.canUndo() && undone < 70) { await ops.undo(); undone += 1; }
  test.assert(undone === 50, `the modern undo stack is capped at 50 (got ${undone})`);
  await ops.rename("file:f1", "Renamed");
  test.assert(ops.canUndo(), "modern: rename is undoable");
  test.assert(files.length === 2, "no stray records");
}

{
  // Rollback: a refused write restores `before` and says so.
  const { ops, files, statuses } = opsContext({ failCommit: true });
  const ok = await ops.place({}, { positions: { "file:f1": { x: 5, y: 5 } } }, {});
  test.assert(ok === false, "a refused write reports failure");
  test.assert(!("placement" in files.find((f) => f.id === "f1")), "STORE_PERSIST_FAILED restores the before state");
  test.assert(statuses.includes("finder_op_failed"), "and reports finder_op_failed");
  test.assert(ops.canUndo() === false, "a refused write is not logged as undoable");
}

// Renderers hide desktop items and repaint on a placement-only change.
const docsSrc = read("app/features/documents-chat.js");
const rootItems = projectDiskSrc.slice(projectDiskSrc.indexOf("function getProjectRootFinderItems"), projectDiskSrc.indexOf("function getSelectedProjectRootItem"));
test.assertIncludes(rootItems, "!file.placement?.desktop", "the Project Disk window hides desktop files");
test.assertIncludes(rootItems, "!folder.placement?.desktop", "and desktop folders");
const renderDocs = docsSrc.slice(docsSrc.indexOf("function renderDocuments()"), docsSrc.indexOf('shouldSkipRender("documents"'));
test.assertIncludes(renderDocs, "!file.placement?.desktop", "the Documents window hides desktop files");
test.assertIncludes(renderDocs, "!folder.placement?.desktop", "and desktop folders");
test.assertIncludes(renderDocs, "finderPlacementVersion", "the documents signature carries the placement version");
const renderDisks = projectDiskSrc.slice(projectDiskSrc.indexOf("function renderProjectDisks()"), projectDiskSrc.indexOf('shouldSkipRender("projectDisks"'));
test.assertIncludes(renderDisks, "finderPlacementVersion", "the projectDisks signature carries the placement version");
test.assertIncludes(deskSrc, "isProjectMounted", "desktop objects belong to the mounted project only");
test.assertIncludes(deskSrc, 'el.className = "desktop-icon desktop-object"', "desktop objects are desktop icons in the icon column");
const actionsSrc = read("app/core/actions.js");
test.assertIncludes(actionsSrc, '"undo": () => finderUndoReady() ? finderCommand("undo") : runEditCommand("undo")', "Edit > Undo asks the Finder first");
test.assertIncludes(actionsSrc, 'finderCommand("put-away-desktop")', "Put Away routes a desktop object to finder-ops");
for (const file of ["app/data/translations-en.js", "app/data/translations-zh.js"]) {
  for (const key of ["finder_refuse_into_itself", "finder_refuse_ejected_readonly", "finder_refuse_mounted_disk_trash", "finder_op_failed", "finder_read_only", "put_away_desktop_done"]) {
    test.assertIncludes(read(file), `${key}:`, `${file} has ${key}`);
  }
}

// --- Rename, New Folder, Duplicate, Option-close (L5) ---
const wireSrc5 = read("app/core/wireup.js");
const dragSrc5 = read("app/core/finder-drag.js");
const renameKeys = dragSrc5.slice(dragSrc5.indexOf("// Rename by keyboard"), dragSrc5.indexOf("if (arrow && !event.shiftKey)"));
test.assertIncludes(renameKeys, 'event.key === "Enter" ? null', "Return starts a rename with the whole name selected in every era");
test.assertMatches(renameKeys, /isClassic\(\) && event\.key === "Backspace" \? ""/, "classic Backspace starts a rename with an empty name");
test.assertMatches(renameKeys, /isClassic\(\) && event\.key\.length === 1 \? event\.key/, "classic printable keys (Space too) start a rename with the typed character");
const keyHead = dragSrc5.slice(dragSrc5.indexOf("function onFinderKey(event)"), dragSrc5.indexOf("// Rename by keyboard"));
test.assertIncludes(keyHead, 'event.key === "Process"', "an IME key (Process / isComposing) is never captured, so Return is the start key");
test.assertIncludes(keyHead, "!finderKeyReady()", "renaming by keyboard needs the Finder in front, no menu, no dialog, no field");
test.assertIncludes(renameKeys, "!control", "a focused control that is not a Finder item keeps Return");
test.assertNotIncludes(wireSrc5, "begin-rename", "the boot bundle carries no rename keystrokes");
const docsSrc5 = read("app/features/documents-chat.js");
const renameFn5 = docsSrc5.slice(docsSrc5.indexOf("function renameSelectedDocumentItem()"), docsSrc5.indexOf("function moveSelectedDocumentFileToTrash()"));
test.assertNotIncludes(renameFn5, "showInputDialog", "Finder rename no longer asks through a prompt dialog");
test.assertIncludes(renameFn5, '"begin-rename"', "Finder rename edits the label in place");
const newFolder5 = actionsSrc.slice(actionsSrc.indexOf("function createFolderFromMenu()"), actionsSrc.indexOf("function openFinderMenuSelection()"));
test.assertIncludes(newFolder5, 't("empty_folder_name")', "New Folder is named Empty Folder");
test.assertIncludes(newFolder5, 'markDeskDirty("chatFolders", folder.id)', "New Folder marks its record dirty");
test.assertIncludes(newFolder5, "created: true", "New Folder starts a rename and logs the create");
test.assertNotIncludes(newFolder5, 'openWindow("projects")\n    renderProjectDisks', "New Folder never opens a window to land in");
const opsSrc5 = read("app/core/finder-ops.js");
test.assertIncludes(opsSrc5, "duplicateOffset", "Duplicate steps the copy's placement with the +16 offset");
test.assertIncludes(docsSrc5, 'finderCommand("duplicated"', "file and folder Duplicate report the copy");
test.assertIncludes(opsSrc5, 'contentEditable = "plaintext-only"', "the label itself becomes editable");
test.assertMatches(opsSrc5, /event\.key === "Escape"[\s\S]{0,80}finish\(false\)/, "Escape cancels and restores the name");
test.assertIncludes(opsSrc5, 'status("rename_refused_empty")', "an empty name is refused");
test.assertIncludes(opsSrc5, '"folder_name_taken"', "a sibling folder name clash is refused");
test.assertMatches(wireSrc5, /event\.altKey && viewWindowNames\.includes/, "Option-click on a close box closes every Finder window");
for (const file of ["app/data/translations-en.js", "app/data/translations-zh.js"]) {
  for (const key of ["empty_folder_name", "rename_refused_empty"]) test.assertIncludes(read(file), `${key}:`, `${file} has ${key}`);
}
test.assertIncludes(read("app/data/translations-zh.js"), '空文件夹', "zh names the new folder 空文件夹");

// --- Finder windows (L6): placement inside a window, windowState, Clean Up Window, info bar ---
function fakeEl(key, rect, selected = false) {
  const [type, id] = key.split(":");
  const vars = {};
  return {
    dataset: { documentItemType: type, documentItemId: id },
    classList: { contains: (name) => name === "is-selected" && selected },
    style: { setProperty: (k, v) => { vars[k] = v; }, removeProperty: (k) => { delete vars[k]; } },
    vars,
    getBoundingClientRect: () => ({ left: rect.x, top: rect.y, width: 64, height: 64 }),
    querySelector: () => ({ textContent: id }),
  };
}
function fakeGrid(els, { list = false } = {}) {
  const classes = new Set(list ? ["finder-list"] : ["finder-grid"]);
  return {
    isConnected: true,
    offsetParent: {},
    clientWidth: 400, clientHeight: 300, clientLeft: 0, clientTop: 0, scrollLeft: 0, scrollTop: 0,
    classList: { add: (c) => classes.add(c), remove: (...c) => c.forEach((x) => classes.delete(x)), contains: (c) => classes.has(c) },
    classes,
    style: { setProperty() {}, removeProperty() {} },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
    querySelectorAll: () => els,
  };
}
function withSpace(ctx) {
  vm.runInNewContext(read("app/core/finder-space.js"), { window: ctx.context.window, Intl });
  return ctx;
}
{
  const { ops } = opsContext();
  const file = { type: "file", id: "f1", projectId: "p1", sourceVolume: "p1" };
  const own = { kind: "folder", folderId: "fa", projectId: "p1", window: true, sameWindow: true };
  const classic = { era: "classic", activeProjectId: "p1" };
  test.assert(ops.decideDrop(file, own, classic) === "place", "a drop on the background of its own window places the icon");
  test.assert(ops.decideDrop(file, { ...own, listMode: true }, classic) === "refuse:", "a list view has no place to put an icon");
  test.assert(ops.decideDrop(file, own, { ...classic, phone: true }) === "refuse:", "a phone never places inside a window");
  test.assert(ops.decideDrop(file, own, { ...classic, altKey: true }) === "copy", "Option-drag inside its own window copies");
  test.assert(ops.decideDrop(file, { ...own, folderId: "fb", sameWindow: false }, classic) === "move", "the background of another folder's window moves the item there");
}
{
  // Placing inside a window writes x/y only; a modern era snaps.
  const { ops, files } = withSpace(opsContext({ classic: true }));
  await ops.placeInWindow({ "file:f1": { x: 37, y: 91 } }, {});
  const f1 = files.find((f) => f.id === "f1");
  assertEqual({ x: f1.placement.x, y: f1.placement.y, desktop: f1.placement.desktop }, { x: 37, y: 91, desktop: null }, "a classic window keeps the release point and stays off the desktop");
  test.assert(f1.folderId === "fa", "placing inside a window keeps the folder");
  await ops.placeInWindow({ "file:f1": { x: 37, y: 91 } }, { metaKey: true });
  const snappedClassic = files.find((f) => f.id === "f1").placement;
  test.assert((snappedClassic.x - 8) % 64 === 0 && (snappedClassic.y - 8) % 64 === 0, "Cmd-drag snaps to the Clean Up grid in a classic window");
  const modern = withSpace(opsContext({ classic: false }));
  await modern.ops.placeInWindow({ "file:f1": { x: 37, y: 91 } }, { era: "aqua" });
  const m = modern.files.find((f) => f.id === "f1").placement;
  test.assert(m.x !== 37 || m.y !== 91, "a modern window snaps by default");
}
{
  // The list view ignores placement; an icon view with a placed item turns spatial.
  const ctx = withSpace(opsContext());
  ctx.context.isFinderListMode = (mode) => mode === "list" || mode === "name";
  const placedItems = [{ type: "text", id: "f1", placement: { x: 120, y: 40 } }, { type: "text", id: "f9" }];
  const listGrid = fakeGrid([fakeEl("file:f1", { x: 0, y: 0 })], { list: true });
  test.assert(await ctx.ops.syncWindow("other", listGrid, placedItems, "list") === false && !listGrid.classes.has("is-spatial"), "a list view ignores stored placement");
  const a = fakeEl("file:f1", { x: 0, y: 0 });
  const b = fakeEl("file:f9", { x: 120, y: 40 });
  const iconGrid = fakeGrid([a, b]);
  ctx.context.loadStylesheetOnce = () => {};
  test.assert(await ctx.ops.syncWindow("other", iconGrid, placedItems, "icon") === true && iconGrid.classes.has("is-spatial"), "a placed icon turns the window spatial");
  test.assert(a.vars["--x"] === "120px" && a.vars["--y"] === "40px", "the placed icon stands at its stored spot");
  test.assert(b.vars["--x"] !== "120px" || b.vars["--y"] !== "40px", "an unplaced icon that would sit under it moves to a free cell, unsaved");
  test.assert(!("placement" in ctx.files.find((f) => f.id === "f1")) && ctx.ops.log().length === 0, "rendering writes nothing back");
  test.assert(await ctx.ops.syncWindow("other", fakeGrid([a]), [{ type: "text", id: "f1" }], "icon") === false, "a window with no placed icon keeps the auto-flow");
}
{
  // Clean Up Window touches only the icons in that window, in one logged op.
  const ctx = withSpace(opsContext({ classic: false }));
  ctx.files.push({ id: "f3", projectId: "p1", type: "text", name: "Elsewhere", folderId: "fz", placement: { x: 333, y: 333, desktop: null } });
  const grid = fakeGrid([fakeEl("file:f1", { x: 13, y: 150 }), fakeEl("folder:fa", { x: 201, y: 7 })]);
  test.assert(await ctx.ops.cleanUpWindow("other", grid, {}) === true, "Clean Up Window runs");
  const f1 = ctx.files.find((f) => f.id === "f1").placement;
  test.assert(Number.isFinite(f1.x) && (f1.x - 8) % 80 === 0, "each icon moves to a grid cell");
  assertEqual(ctx.files.find((f) => f.id === "f3").placement, { x: 333, y: 333, desktop: null }, "an icon of another folder is untouched");
  const entry = ctx.ops.log().at(-1);
  test.assert(entry.op === "clean-up" && entry.keys.length === 2, "the clean up is one logged op over that window's icons");
  const sel = withSpace(opsContext({ classic: false }));
  await sel.ops.cleanUpWindow("other", fakeGrid([fakeEl("file:f1", { x: 13, y: 150 }, true), fakeEl("folder:fa", { x: 201, y: 7 })]), {});
  test.assert(sel.ops.log().at(-1).keys.join() === "file:f1", "with a selection only the selected icons move");
}
{
  // windowState: a folder remembers view, sort and scroll; arriving restores it;
  // with no state the window keeps windowViewModes.
  const folder = { id: "fa", windowState: { view: "list", sort: { key: "list", reversed: true }, scroll: { top: 90, left: 0 } } };
  const toggles = [];
  const { ops: rops, context: rctx } = opsContext({ classic: false });
  Object.assign(rctx, {
    selectedFolderId: "fa",
    windowViewModes: { projects: "icon", documents: "icon" },
    getSelectedFolder: () => (rctx.selectedFolderId === "fa" ? folder : null),
    getActiveProject: () => ({ id: "p1" }),
    finderSortReversed: () => false,
    toggleFinderSortReversed: (name, restoring) => toggles.push([name, restoring]),
  });
  test.assert(rops.restoreWindowState("projects") === true, "arriving at a folder with a state asks for a redraw");
  test.assert(rctx.windowViewModes.projects === "list", "arriving at a folder restores its view");
  test.assert(toggles.length === 1, "and its sort direction");
  test.assertIncludes(projectDiskSrc, "toggleFinderSortReversed(windowName);\n      saveFinderWindowState(windowName);", "reversing the sort writes the window state; restoring it does not");
  rctx.windowViewModes.projects = "icon";
  test.assert(rops.restoreWindowState("projects") === false && rctx.windowViewModes.projects === "icon", "staying in the folder does not restore again");
  rctx.selectedFolderId = "all";
  rops.restoreWindowState("projects");
  test.assert(rctx.windowViewModes.projects === "icon", "a folder with no state keeps windowViewModes as the fallback");
  // A spring-loaded folder is a passing look: no restore, nothing remembered.
  rctx.window.AISystem6FinderDrag = { getSpringFolderState: () => ({ opened: true }) };
  rctx.selectedFolderId = "fa";
  test.assert(rops.restoreWindowState("documents") === false && rctx.windowViewModes.documents === "icon" && toggles.length === 1, "a spring-loaded folder neither restores the view nor flips the sort");
  rctx.window.AISystem6FinderDrag = null;
  rctx.selectedFolderId = "all";
  rops.restoreWindowState("documents");
  test.assert(rctx.windowViewModes.documents === "icon", "springing back leaves the origin window as it was");
  const projRender = projectDiskSrc.slice(projectDiskSrc.indexOf("function renderProjectDisks()"), projectDiskSrc.indexOf('shouldSkipRender("projectDisks"'));
  test.assert(projRender.indexOf('restoreFinderWindowState("projects")') !== -1 && projRender.indexOf('restoreFinderWindowState("projects")') < projRender.indexOf("normalizeFinderViewMode(windowViewModes.projects)"), "Project Hard Disk restores before it reads the view");
  test.assert(renderDocs.indexOf('restoreFinderWindowState("documents")') !== -1 && renderDocs.indexOf('restoreFinderWindowState("documents")') < renderDocs.indexOf("normalizeFinderViewMode(windowViewModes.documents)"), "Documents restores before it reads the view");
  test.assertIncludes(read("app.js"), "saveFinderWindowState(winName)", "changing the view writes the window state");

  // The write: no ids, on the folder (or the project root).
  const ctx = opsContext();
  const grid = fakeGrid([]);
  grid.classList.contains = () => false;
  grid.parentElement = null;
  Object.assign(ctx.context, {
    documentIconGridEl: grid,
    windowViewModes: { documents: "small-icon" },
    finderSortReversed: () => true,
    getSelectedFolder: () => ctx.folders[0],
    getComputedStyle: () => ({ overflowX: "visible", overflowY: "visible" }),
  });
  grid.scrollTop = 48;
  await ctx.ops.saveWindowState("documents");
  assertEqual(ctx.folders[0].windowState, { view: "small-icon", sort: { key: "small-icon", reversed: true }, scroll: { top: 48, left: 0 } }, "the folder's windowState holds view, sort and scroll, and no ids");
  test.assert(!ctx.ops.log().some((entry) => entry.op === "window-state"), "a window state write never takes the Undo slot");
}
for (const file of ["app/data/translations-en.js", "app/data/translations-zh.js"]) {
  for (const key of ["finder_info_items", "finder_info_in_disk", "finder_info_available"]) test.assertIncludes(read(file), `${key}:`, `${file} has ${key}`);
}
test.assertIncludes(read("app/data/translations-zh.js"), "K 在磁盘中", "zh info bar says 在磁盘中");

// --- P3: Open With, keyboard, contextual menu, copy / paste, drag out ---------
{
  const regWin = {};
  vm.runInNewContext(read("app/core/application-registry.js"), { window: regWin, console, Map, Set, Object, Promise, Array, String, Number, JSON, Date, Math, setTimeout });
  const reg = regWin.AISystem6ApplicationRegistry;
  const openers = reg.applicationsForItemKind("text").map((app) => app.id);
  test.assert(openers.includes("teachText") && openers.length > 1, "applicationsForItemKind returns the registered openers of a text file");
  test.assert(reg.applicationsForItemKind("no-such-kind").length === 0, "an unknown kind has no opener");
  const menus = read("app/data/menus.js");
  test.assertMatches(menus.slice(menus.indexOf("const finderMenus"), menus.indexOf("const teachTextMenus")), /"open-menu-selection", "open", "open"\),\s*menuItem\("open-with", "open_with"\)/, "the modern File menu lists Open With after Open");
  test.assertNotMatches(read("app/core/finder-menus.js"), /open-with/, "the System 6 menus never list Open With");

  const items = [{ x: 0, y: 0, w: 10, h: 10, id: "a" }, { x: 40, y: 2, w: 10, h: 10, id: "right" }, { x: 2, y: 50, w: 10, h: 10, id: "down" }];
  test.assert(S.nearestInDirection(items[0], items.slice(1), "right").id === "right" && S.nearestInDirection(items[0], items.slice(1), "down").id === "down" && S.nearestInDirection(items[0], items.slice(1), "left") === null, "nearestInDirection picks the right neighbour");

  // The engine's keyboard and context menu, driven through captured listeners.
  const drive = ({ classic, brands }) => {
    const handlers = {};
    const picked = [];
    const mk = (name) => {
      const el = { offsetParent: {}, textContent: name, classList: { contains: () => false }, querySelector: () => null, matches: () => false, click: () => picked.push(name), scrollIntoView() {}, dataset: {} };
      return el;
    };
    const names = ["Alpha", "Beta", "Bravo"].map(mk);
    const menuCalls = [];
    const w = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: true }), AISystem6FinderOps: { openContextMenu: (el) => menuCalls.push(el) } };
    const ctx = vm.createContext({
      window: w,
      navigator: brands ? { userAgentData: { brands } } : {},
      document: {
        addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); },
        removeEventListener() {}, documentElement: { addEventListener() {}, removeEventListener() {} },
        elementsFromPoint: () => [], querySelector: () => null, querySelectorAll: () => names,
        body: { classList: { contains: () => false } },
      },
      activeAppId: "finder", isClassicFinderEra: () => classic, getActiveEditableElement: () => null,
      ensureFinderSpaceModule: () => Promise.resolve(), t: (key) => key, Date, Math, console, setTimeout, clearTimeout, Promise,
    });
    vm.runInContext(finderDragSrc, ctx);
    return { handlers, picked, names, menuCalls, engine: w.AISystem6FinderDrag };
  };
  const key = (k) => ({ key: k, target: { closest: () => null }, preventDefault() { this.prevented = true; } });
  const modern = drive({ classic: false });
  const typed = key("b");
  modern.handlers.keydown.forEach((fn) => fn(typed));
  test.assert(modern.picked[0] === "Beta" && typed.prevented, "a modern era type-selects by name prefix");
  const classic = drive({ classic: true });
  classic.handlers.keydown.forEach((fn) => fn(key("b")));
  test.assert(classic.picked.length === 0, "a classic era never type-selects: typing renames there");

  const sourceEl = (name) => ({ matches: (sel) => sel === ".icon-column .desktop-icon", dataset: {}, name });
  const rightClick = (d, el) => { const e = { target: { closest: () => el }, clientX: 5, clientY: 6, preventDefault() { this.prevented = true; } }; d.handlers.contextmenu.forEach((fn) => fn(e)); return e; };
  const mEvent = rightClick(modern, sourceEl("m"));
  test.assert(modern.menuCalls.length === 1 && mEvent.prevented, "a modern era opens the contextual menu on right-click");
  const cEvent = rightClick(classic, sourceEl("c"));
  test.assert(classic.menuCalls.length === 0 && cEvent.prevented, "a classic era has none and keeps the browser's menu away");

  // Drag out: Chromium only.
  test.assert(modern.engine.dragOutSupported({ userAgentData: { brands: [{ brand: "Chromium" }] } }) && !modern.engine.dragOutSupported({}), "drag out needs a Chromium brand");
  const chromium = drive({ classic: false, brands: [{ brand: "Google Chrome" }] });
  test.assert(chromium.handlers.dragstart?.length > (modern.handlers.dragstart?.length || 0), "the proxy's dragstart exists only in Chromium");
  test.assert(!modern.handlers.pointerover || modern.handlers.pointerover.length === 0, "Safari never gets the proxy icon");
  const url = modern.engine.downloadUrlFor({ name: "A:b", body: "x y" });
  test.assert(url === "" , "without the export helper there is nothing to drag");
  const chromeSrc = read("app/core/finder-drag.js");
  test.assertIncludes(chromeSrc, "text/markdown:${name}.md:data:text/markdown;charset=utf-8,", "the proxy hands over a Markdown copy through DownloadURL");

  // Copy / paste: one logged op.
  const c = opsContext({ classic: false });
  const sel = { dataset: { finderKey: "file:f1" } };
  const grid = { classList: { contains: () => false }, clientWidth: 400, scrollHeight: 300, clientHeight: 300 };
  Object.assign(c.context, {
    documentIconGridEl: grid,
    getSelectedFolder: () => null,
    document: { querySelector: () => ({ dataset: { window: "documents" } }), querySelectorAll: () => [sel] },
  });
  await c.ops.run("copy-items");
  test.assert(c.ops.hasClipboard(), "Copy keeps the selected keys in the Finder clipboard");
  const before = c.ops.log().length;
  const filesBefore = c.files.length;
  await c.ops.run("paste-items");
  test.assert(c.files.length === filesBefore + 1 && c.ops.log().length === before + 1 && c.ops.log().at(-1).op === "copy", "Paste copies into the front folder as one logged op");
  test.assert(c.ops.canUndo(), "and a modern era can undo it");
  const rows = c.ops.contextRows({ dataset: { finderKey: "file:f2" }, classList: { contains: (n) => n === "desktop-object" }, matches: () => false, getBoundingClientRect: () => ({ left: 0, bottom: 0 }) }).map((row) => row.id);
  test.assert(["open", "open-with", "get-info", "rename", "duplicate", "make-alias", "copy", "trash", "put-away"].every((id) => rows.includes(id)), "a desktop file's contextual menu lists the full set including Put Away");
  const classicOps = opsContext({ classic: true });
  test.assert(classicOps.ops.openContextMenu({}, {}) === false, "finder-ops opens no contextual menu in a classic era");
  for (const file of ["app/data/translations-en.js", "app/data/translations-zh.js"]) {
    for (const k of ["open_with", "open_with_none", "drag_out_hint", "finder_copied_items", "finder_pasted_items"]) test.assertIncludes(read(file), `${k}:`, `${file} has ${k}`);
  }
}

// --- Review fixes: undo safety, one-write moves, the File Floppy icon ----------
{
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  const classicMods = { era: "classic", activeProjectId: "p1" };
  const { ops: m } = opsContext();
  test.assert(m.decideDrop({ type: "mounted-disk" }, { kind: "desktop" }, classicMods) === "place", "the File Floppy icon moves on the desk");
  test.assert(m.decideDrop({ type: "mounted-disk" }, { kind: "trash" }, classicMods) === "dispatch", "and the Trash ejects it");
  test.assert(m.decideDrop({ type: "mounted-disk" }, { kind: "folder", folderId: "fa" }, classicMods) === "refuse:", "a folder refuses it");

  // A copy written into after it was made is not taken back by Undo.
  const c = opsContext({ classic: false });
  Object.assign(c.context, {
    documentIconGridEl: { classList: { contains: () => false }, clientWidth: 400, scrollHeight: 300, clientHeight: 300 },
    getSelectedFolder: () => null,
    document: { querySelector: () => ({ dataset: { window: "documents" } }), querySelectorAll: () => [{ dataset: { finderKey: "file:f1" } }] },
  });
  await c.ops.run("copy-items");
  await c.ops.run("paste-items");
  const copyKey = c.ops.log().at(-1).created[0];
  const copy = c.files.find((f) => `file:${f.id}` === copyKey);
  copy.body = "two thousand words";
  copy.updatedAt = "2099-01-01T00:00:00.000Z";
  test.assert(await c.ops.undo() === false && c.files.includes(copy), "Undo keeps a copy that was written into since it was made");
  test.assert(c.statuses.some((text) => text.startsWith("finder_undo_refused_changed")), "and says why");

  // A new folder that something was dropped into is not taken back either.
  const f = opsContext({ classic: false });
  f.folders.push({ id: "fn", projectId: "p1", name: "Empty Folder", parentId: null, updatedAt: "t0" });
  f.ops.record("create", ["folder:fn"], {}, {}, { created: ["folder:fn"] });
  f.files.push({ id: "clip", projectId: "p1", type: "text", name: "Clip", folderId: "fn" });
  test.assert(await f.ops.undo() === false && f.folders.some((x) => x.id === "fn"), "Undo keeps a new folder that now holds a file");
  const g = opsContext({ classic: false });
  g.folders.push({ id: "fe", projectId: "p1", name: "Empty Folder", parentId: null, updatedAt: "t0" });
  g.ops.record("create", ["folder:fe"], {}, {}, { created: ["folder:fe"] });
  g.context.activeProjectId = "p2";
  test.assert(g.ops.canUndo() === false, "a step taken on another disk waits while that disk is away");
  g.context.activeProjectId = "p1";
  test.assert(await g.ops.undo() === true && !g.folders.some((x) => x.id === "fe"), "an untouched new folder is taken back on its own disk");

  // A move is one write and one step, and it drops the old window spot.
  const mv = opsContext({ classic: false });
  mv.folders.push({ id: "fb", projectId: "p1", name: "Other", parentId: null });
  mv.files[0].placement = { x: 300, y: 40, desktop: null };
  const store = mv.context.window.AISystem6StateStores.projects;
  const commit = store.commit.bind(store);
  let commits = 0;
  store.commit = (updater) => { commits += 1; return commit(updater); };
  test.assert(mv.ops.perform("move", { dataset: { dropTarget: "document-folder", folderId: "fb" } }, { type: "file", id: "f1", projectId: "p1" }) === true, "a move is taken by finder-ops");
  await tick();
  const moved = mv.files.find((x) => x.id === "f1");
  test.assert(moved.folderId === "fb" && commits === 1, "the move lands in one commit");
  test.assert(!("x" in moved.placement) && !("y" in moved.placement), "a move into another folder drops the old window coordinates");
  test.assert(mv.ops.log().filter((entry) => entry.op === "move").length === 1 && mv.ops.log().at(-1).op === "move", "and is one logged step");
  const rb = opsContext({ classic: false, failCommit: true });
  rb.folders.push({ id: "fb", projectId: "p1", name: "Other", parentId: null });
  rb.ops.perform("move", { dataset: { dropTarget: "document-folder", folderId: "fb" } }, { type: "file", id: "f1", projectId: "p1" });
  await tick();
  test.assert(rb.files.find((x) => x.id === "f1").folderId === "fa" && rb.statuses.includes("finder_op_failed") && !rb.ops.canUndo(), "a refused move changes nothing, says so and logs no step");
  for (const file of ["app/data/translations-en.js", "app/data/translations-zh.js"]) test.assertIncludes(read(file), "finder_undo_refused_changed:", `${file} has finder_undo_refused_changed`);
}

test.finish();
