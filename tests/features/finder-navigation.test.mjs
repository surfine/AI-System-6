// Finder navigation is one shared production model across desktop and phone.
// The path bar must drive the same folder ids and file operations as the File
// menu; it is not a decorative breadcrumb or a second mobile-only filesystem.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("finder-navigation");
const windowManager = read("app/core/window-manager.js");
const projectDisk = read("app/features/project-disk.js");
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
const responsive = read("styles/60-responsive.css");
const liquid = read("styles/70-liquid-glass.css");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

test.assertIncludes(windowManager, "const finderParentWindowNames = new Map([", "static Finder locations declare their real parents");
test.assertIncludes(windowManager, "function finderFolderTrail(folderId)", "folder breadcrumbs retain real folder ids");
test.assertIncludes(windowManager, "function navigateFinderFolderLocation(windowName, folderId", "path clicks drive the production folder selection");
test.assertIncludes(windowManager, 'selectedFolderId = folderId || "all";', "the path bar shares Finder's canonical current-directory state");
test.assertIncludes(windowManager, "folder.parentId || \"\"", "Back moves to the real parent folder before leaving the window");
test.assertIncludes(windowManager, "async function navigateFinderUp(windowName)", "every Finder page has one parent-navigation path");
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
test.assertIncludes(liquid, "--finder-navigation-bg: rgba(255, 255, 255, 0.24)", "Liquid Glass supplies values to the same production path bar");
test.assertIncludes(en, 'finder_location: "Finder location"', "English exposes the path bar to assistive technology");
test.assertIncludes(zh, 'finder_location: "Finder 位置"', "Chinese exposes the path bar to assistive technology");

test.finish();
