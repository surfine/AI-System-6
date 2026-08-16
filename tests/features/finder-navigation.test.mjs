// Finder navigation is one shared production model across desktop and phone.
// The path bar must drive the same folder ids and file operations as the File
// menu; it is not a decorative breadcrumb or a second mobile-only filesystem.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("finder-navigation");
const index = read("index.html");
const windowManager = read("app/core/window-manager.js");
const projectDisk = read("app/features/project-disk.js");
const exportImport = read("app/features/export-import.js");
const workingSession = read("app/core/working-session.js");
const domHandles = read("app/core/dom-handles.js");
const documents = read("app/features/documents-chat.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const fileDisk = read("app/features/file-disk.js");
const printDirectory = read("app/features/print-directory.js");
const app = read("app.js");
const workspaceProfile = read("app/core/workspace-profile.js");
const writingStudioOwnerBlock = workspaceProfile.match(/writingStudioOwnedWindowNames = new Set\(\[[\s\S]*?\]\);/)?.[0] || "";
const startupDiskBlock = app.match(/function getStartupDiskItems\(\) \{[\s\S]*?\n\}/)?.[0] || "";
const actions = read("app/core/actions.js");
const menus = read("app/data/menus.js");
const base = read("styles/40-icons.css");
const appsCss = read("styles/50-apps.css");
const responsive = read("styles/60-responsive.css");
const liquid = read("styles/70-liquid-glass.css");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const desktopIconColumn = index.match(/<section class="icon-column"[\s\S]*?<\/section>/)?.[0] || "";
const applicationsWindow = index.match(/<section class="window finder-window applications-window[\s\S]*?<\/section>/)?.[0] || "";
const writingFlowPanel = index.match(/<section class="writing-spine-panel"[\s\S]*?<\/section>\s*<\/section>/)?.[0] || "";

test.assertIncludes(windowManager, "const finderParentWindowNames = new Map([", "static Finder locations declare their real parents");
test.assertIncludes(windowManager, "function finderFolderTrail(folderId)", "folder breadcrumbs retain real folder ids");
test.assertIncludes(windowManager, "function navigateFinderFolderLocation(windowName, folderId", "path clicks drive the production folder selection");
test.assertIncludes(windowManager, 'selectedFolderId = folderId || "all";', "the path bar shares Finder's canonical current-directory state");
test.assertIncludes(windowManager, "folder.parentId || \"\"", "Back moves to the real parent folder before leaving the window");
test.assertIncludes(windowManager, "async function navigateFinderUp(windowName)", "every Finder page has one parent-navigation path");
test.assertIncludes(app, "const systemFolderPathDefinitions = new Map([", "System Folder subfolders are a declared tree, not a hidden mode flag");
test.assertIncludes(app, 'parentPath: "ai-prompts"', "each System Folder subfolder names its real parent");
test.assertIncludes(app, "function systemFolderPathTrail(path = systemFinderPath)", "the System Folder path bar walks the same tree the user walked in");
test.assertIncludes(app, "function navigateSystemFolderPath(path", "one entry point owns every System Folder directory change");
test.assertIncludes(app, "title.textContent = systemFolderCurrentLabel();", "the reused Finder window is renamed to the folder it is showing");
test.assertIncludes(windowManager, "navigateSystemFolderPath(definition.parentPath", "Back leaves a System Folder subfolder before leaving the window");
test.assertIncludes(windowManager, "systemFolderPath: entry.path", "System Folder path segments carry a real directory, not a label");
test.assertIncludes(windowManager, "function renderFinderNavigationBar(winOrName)", "all Finder windows reuse one navigation component");
test.assertIncludes(windowManager, 'current.setAttribute("aria-current", "page")', "the current path segment is exposed accessibly");
test.assertIncludes(windowManager, "const finderVolumeDefinitions = new Map([", "Finder owns one capability registry for every mounted volume");
test.assertIncludes(windowManager, '["projects", {', "Project Hard Disk is registered as a Finder volume");
test.assertIncludes(windowManager, '["textDisk", {', "File Floppy is registered as a Finder volume");
test.assertIncludes(windowManager, '["projectCd", {', "Project CD is registered as a Finder volume");
test.assertIncludes(windowManager, "function getFinderVolumeSelectedItem(windowName)", "volume items share one Finder selection adapter");
test.assertIncludes(windowManager, "function getFinderVolumeCapabilities(windowName)", "File-menu availability comes from the current volume");
test.assertIncludes(windowManager, 'win.dataset.finderVolume = volume.kind;', "volume windows expose their real Finder semantics");
test.assertIncludes(windowManager, "function replaceVisibleFinderLocation(targetWindowName)", "Finder navigation reuses one browser window");
test.assertIncludes(windowManager, 'win.classList.add("is-hidden");', "opening another Finder location retires the previous location");
test.assertIncludes(windowManager, "placeWindowForExplicitLayout(win, finderReplacementFrame)", "desktop navigation preserves the current Finder frame");
test.assertNotIncludes(writingStudioOwnerBlock, '"projects"', "Writing Studio cannot take Project Hard Disk ownership from Finder");
test.assertNotIncludes(writingStudioOwnerBlock, '"projectCd"', "Writing Studio cannot take Project CD ownership from Finder");
test.assertIncludes(projectDisk, 'renderFinderNavigationBar(getWindow("projects"));', "Project Hard Disk refreshes the shared path after directory changes");
test.assertIncludes(documents, 'renderFinderNavigationBar(getWindow("documents"));', "Documents refreshes the shared path after directory changes");
test.assertIncludes(app, 'type: "volume"', "Startup Disk renders mounted media as volumes instead of applications");
test.assertIncludes(app, 'action: fileFloppyMounted ? "open-text-disk" : "open-rag"', "the File Floppy entry becomes the mounted production volume");
test.assertNotIncludes(startupDiskBlock, 'action: "open-documents"', "Startup Disk does not duplicate Project Hard Disk through a Documents alias");
test.assertNotIncludes(startupDiskBlock, 'action: "open-import-utility"', "Startup Disk keeps file import as a Project Hard Disk command, not a second app");
test.assertIncludes(projectDisk, "return [...folders, ...files, ...references];", "Project Hard Disk renders only production filesystem records");
test.assertNotIncludes(projectDisk, "function getProjectSystemFinderItems()", "Project Hard Disk no longer injects virtual media and ClioTalk folder substitutes");
test.assertIncludes(fileDisk, 'renderStaticFinderWindow("disk")', "mounting or ejecting a floppy refreshes the same Finder root");
test.assertIncludes(desktopRuntime, "getFinderVolumeSelectedItem(name) || getFinderVolumeRootItem(name)", "Get Info consumes the shared volume selection");
test.assertMatches(desktopRuntime, /if \(\["textDisk", "rag"\]\.includes\(activeName\)\)[\s\S]*ejectTextDisk\(\)/, "Finder Eject removes the whole File Floppy volume");
test.assertIncludes(printDirectory, 'if (activeName === "textDisk")', "Print Directory supports File Floppy");
test.assertIncludes(printDirectory, 'if (activeName === "projectCd")', "Print Directory supports Project CD");

// --- Finder objects own their verbs -----------------------------------------
// Each of these verbs existed and worked, but only as a button inside the
// object's own window — so the command was invisible to the menu bar, to the
// keyboard, and to anyone who had not already opened that window. Two homes,
// one rule: a verb that takes no selection is a volume verb and belongs in
// File beside Eject; a verb only one kind of object has belongs to that
// object's Get Info, because System 6 has no contextual menus.

// File Floppy: Insert is Eject's opposite, so it sits in the same File group.
test.assertIncludes(menus, 'menuItem("insert-text-disk", "insert_file_floppy_menu")', "Finder exposes Insert File Floppy");
test.assertMatches(
  menus,
  /menuItem\("insert-text-disk", "insert_file_floppy_menu"\),\s*\n\s*menuItem\("eject-menu-selection", "eject", "eject"\)/,
  "Insert and Eject read as one pair of opposite volume verbs"
);
// The 1992 ellipsis rule: the mark means the command asks for more information
// first. Insert opens a file picker, so it earns the mark — and it must be the
// real U+2026 character, not three periods.
test.assertIncludes(en, 'insert_file_floppy_menu: "Insert File Floppy…"', "English marks Insert File Floppy as asking first");
test.assertIncludes(zh, 'insert_file_floppy_menu: "插入文件软盘…"', "Chinese marks Insert File Floppy as asking first");
// Print Directory opens a preview window and is then done; the 1992 book uses
// Finder's own Get Info as the worked example of a command that must NOT carry
// the mark just because a window appears.
test.assertIncludes(en, 'print_directory: "Print Directory",', "Print Directory does not claim to ask first");
test.assertIncludes(zh, 'print_directory: "打印目录",', "Chinese Print Directory does not claim to ask first");

// Get Info is the home for kind-specific verbs.
test.assertIncludes(desktopRuntime, "const finderVolumeKindActions = new Map([", "Finder volumes declare their own whole-volume verbs");
test.assertIncludes(desktopRuntime, '{ action: "add-text-disk-project", labelKey: "add_to_project_disk" }', "the File Floppy carries its write-through verb");
test.assertIncludes(desktopRuntime, "const projectCdItemKindActions = [", "a burned Project CD item declares its own verbs");
for (const action of ["open-finishing-receipt", "copy-project-cd-markdown", "download-project-cd-item", "print-project-cd-item"]) {
  test.assertIncludes(desktopRuntime, `action: "${action}"`, `Project CD Get Info offers ${action}`);
}
// Download and Print to PDF used to hang off a bare button id, so no command
// could reach them. Both now answer the one registry.
test.assertIncludes(actions, '"download-project-cd-item": () => downloadSelectedProjectCdItem()', "Download reaches the production Project CD export");
test.assertIncludes(actions, '"print-project-cd-item": () => printSelectedProjectCdItem()', "Print to PDF reaches the production Project CD print path");
// A kind verb may exist while being unable to act; then it greys and refuses
// the click, instead of looking grey but staying live.
test.assertIncludes(desktopRuntime, "button.disabled = !availability[entry.action];", "a Get Info verb that cannot act is genuinely disabled, not just dimmed");

// The Trash is a Finder object: Get Info must answer for it and for what is
// inside it, and must never call a thrown-away file "Saved on Project Hard Disk".
test.assertIncludes(desktopRuntime, "function getTrashRootFinderItem()", "the Trash itself is a Get Info object");
test.assertIncludes(desktopRuntime, "function getTrashItemFinderItem(item)", "a trashed object is a Get Info object");
test.assertIncludes(desktopRuntime, 'name === "trash"', "Get Info reads the Trash window's own selection");
test.assertIncludes(desktopRuntime, 'kindLabel: t("kind_in_trash", originalKind)', "a trashed object keeps its original kind");
test.assertIncludes(desktopRuntime, 't("durable_trash")', "Get Info states that trashed material is not yet removed");
test.assertIncludes(en, 'durable_trash: "In Trash, not yet removed"', "English states the Trash durability honestly");
test.assertIncludes(zh, 'durable_trash: "在废纸篓中，尚未清除"', "Chinese states the Trash durability honestly");

test.assertIncludes(desktopIconColumn, 'data-open="applications"', "the desktop exposes the complete application catalogue through one folder");
test.assertIncludes(app, 'action: "open-scrapbook"', "the rendered Applications registry exposes Scrapbook");
test.assertIncludes(appsCss, "grid-template-columns: minmax(0, 1fr);", "desktop icon labels cannot widen the shared icon column and shift an icon off center");
[
  "open-find-path",
  "open-reader",
  "open-time-machine",
  "open-docmap",
  "open-scrapbook",
  "open-assistant",
  "open-clio-stage",
  "open-clio-chart",
  "open-liquid-cover",
].forEach((action) => {
  test.assertNotIncludes(desktopIconColumn, `data-action="${action}"`, `${action} stays in Applications instead of duplicating onto the desktop`);
  test.assertIncludes(applicationsWindow, `data-action="${action}"`, `${action} remains discoverable in the Applications folder`);
});
test.assertIncludes(desktopIconColumn, 'data-action="open-quick-draft"', "Quick Draft is directly reachable from the desktop");
test.assertIncludes(applicationsWindow, 'data-action="open-quick-draft"', "Quick Draft also remains discoverable in Applications");
test.assertIncludes(desktopIconColumn, 'id="active-project-drop-target"', "the mounted Project Hard Disk is a real desktop drop target");
test.assertIncludes(desktopIconColumn, 'id="desktop-project-cd"', "a burned Project CD can join the current desktop working set");
test.assertMatches(projectDisk, /currentProjectIcon\?\.classList\.remove\("is-hidden"\)[\s\S]*project[\s\S]*currentProjectIcon\.dataset\.dropTarget = "project"[\s\S]*delete currentProjectIcon\.dataset\.dropTarget/, "one Project Hard Disk icon stays visible and becomes a drop target only while mounted");
test.assertIncludes(projectDisk, "scheduleWorkingSessionSave();", "shading Writing Flow updates the resumable session");
test.assertIncludes(exportImport, "desktopProjectCdEl.hidden = !hasVisibleItems;", "Project CD media state remains independent from workspace visibility");
test.assertIncludes(fileDisk, "mountedTextDiskEl.hidden = !mounted;", "File Floppy media state remains independent from workspace visibility");
test.assertIncludes(read("styles/10-windows.css"), ".desktop-icon[hidden]", "unmounted desktop media stays hidden even when its workspace is visible");
test.assertIncludes(domHandles, 'document.querySelector("#desktop-project-cd")', "the Project CD desktop volume uses a centralized DOM handle");
test.assertIncludes(workingSession, 'toolsShaded: writingToolsPanelEl?.classList.contains("is-shaded") || false', "Working Session remembers the Writing Flow shade state");
test.assertIncludes(workingSession, 'toolsViewMode: writingToolsViewMode', "Working Session remembers the Writing Flow icon density");
test.assertIncludes(index, 'id="project-switcher-button"', "the menu bar remains the single current-project indicator");
["open-project-disks", "open-project-cd"].forEach((action) => {
  test.assertNotIncludes(writingFlowPanel, `data-action="${action}"`, `${action} remains a volume concern instead of duplicating into Writing Flow`);
});
test.assertIncludes(writingFlowPanel, 'id="spine-file-floppy-button"', "Writing Flow offers an Insert File Floppy action before media is mounted");
test.assertIncludes(writingFlowPanel, 'data-action="open-rag"', "the insertion action opens the File Floppy mounting surface");
test.assertNotIncludes(writingFlowPanel, 'data-action="open-text-disk"', "Writing Flow never duplicates the mounted File Floppy volume");
test.assertIncludes(fileDisk, "spineFileFloppyButtonEl.hidden = mounted;", "mounting swaps the Writing Flow insertion action for the desktop volume");
test.assertIncludes(writingFlowPanel, 'id="spine-burn-project-cd-button"', "Writing Flow offers a Burn Project CD action before delivery media exists");
test.assertIncludes(writingFlowPanel, 'data-action="export-teachtext-project-cd"', "the burn action uses the production TeachText export path");
test.assertIncludes(writingFlowPanel, 'data-action-availability="independent"', "Writing Flow owns route action availability instead of inheriting the active window menu state");
test.assertIncludes(windowManager, "btn.closest(\"[data-action-availability='independent']\")", "menu availability clears stale disabled state from independent Writing Flow actions");
test.assertIncludes(exportImport, "function projectCdBurnIsAvailable()", "Project CD owns one shared burn-availability decision");
test.assertIncludes(exportImport, "if (!getActiveProject()) return false;", "burning stays hidden until a project is mounted");
test.assertIncludes(exportImport, 'const body = String(teachTextBodyInput?.value || "").trim();', "burning stays hidden while the manuscript is empty");
test.assertIncludes(exportImport, 'activeTeachTextAllows("projectCdExport")', "burning follows the active TeachText document role");
test.assertIncludes(exportImport, "visibleItems.length > 0 || !projectCdBurnIsAvailable()", "the Writing Flow burn action appears only before media exists and while burning is available");
test.assertIncludes(windowManager, "syncProjectCdBurnActionVisibility();", "Writing Flow burn visibility refreshes with shared menu and document state");
test.assertIncludes(actions, '"export-teachtext-project-cd": exportTeachTextToProjectCd', "the Writing Flow burn action creates a real Project CD item");
test.assertIncludes(en, 'burn_project_cd: "Burn Project CD"', "English names the pre-media action as a burn operation");
test.assertIncludes(zh, 'burn_project_cd: "刻录项目光盘"', "Chinese names the pre-media action as a burn operation");
test.assertNotIncludes(domHandles, "spineProjectNameEl", "removed project status controls leave no dead DOM plumbing");
test.assertNotIncludes(projectDisk, "function updateWritingSpine()", "project updates no longer maintain duplicate Writing Flow volume status");

test.assertIncludes(actions, "function createFolderFromMenu()", "Finder can create a folder in the current directory");
test.assertIncludes(documents, "function renameActiveFile()", "Finder can rename selected files and folders");
test.assertIncludes(documents, "function duplicateActiveFile()", "Finder can duplicate selected files and folder trees");
test.assertIncludes(documents, "function moveActiveFileToTrash()", "Finder can move selected items to Trash");
test.assertIncludes(documents, "function moveDocumentFileToFolder(", "Finder drag-and-drop changes a file's real folder");
test.assertIncludes(documents, "function moveDocumentFolderToFolder(", "Finder drag-and-drop changes a folder's real parent");
test.assertIncludes(menus, 'menuItem("open-file-info", "get_info"', "Finder exposes Get Info");
test.assertIncludes(menus, 'menuItem("rename-file", "rename")', "Finder exposes Rename");
test.assertIncludes(menus, 'menuItem("duplicate-selection", "duplicate"', "Finder exposes Duplicate");
test.assertIncludes(menus, 'menuItem("move-file-trash", "move_to_trash"', "Finder exposes Move to Trash");

test.assertIncludes(base, ".finder-navigation-bar {", "the path bar is shared by phone and desktop");
test.assertIncludes(base, "overflow-x: auto;", "deep paths scroll instead of squeezing content");
test.assertIncludes(responsive, ".finder-navigation-back {", "the phone Back control has a deliberate touch target");
test.assertMatches(responsive, /\.finder-navigation-back \{[^}]*width: 36px;[^}]*margin-inline: 2px;/, "the phone Back control paints a narrower button");
test.assertMatches(responsive, /\.finder-navigation-back::after \{[^}]*inset: -2px -4px;/, "the narrower Back control retains a 44px tap width");
test.assertIncludes(liquid, "--finder-navigation-bg: rgba(255, 255, 255, 0.24)", "Liquid Glass supplies values to the same production path bar");
test.assertIncludes(en, 'finder_location: "Finder location"', "English exposes the path bar to assistive technology");
test.assertIncludes(zh, 'finder_location: "Finder 位置"', "Chinese exposes the path bar to assistive technology");

test.finish();
