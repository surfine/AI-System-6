// Project Disk is the durable project boundary. It owns saved writing objects,
// imports, trash, references, and scoped cleanup; no feature may silently cross
// from one Project Hard Disk into another.

import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("project-disk");
const app = readAppSurface([
  "app/data/translations-en.js",
  "app/data/translations-zh.js",
  "app/core/context-retrieval.js",
  "app/core/project-backup-assembler.js",
  "app/features/export-import.js",
  "app/features/scrapbook.js",
]);
const projectDisk = read("app/features/project-disk.js");
const projectBackup = read("app/core/project-disk-backup.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const indexHtml = read("index.html");

test.assertIncludes(app, "item?.projectId === activeProjectId", "keeps active project guard as the default data boundary");
test.assertIncludes(projectDisk, "function getProjectFiles()", "documents are scoped through Project Disk file helpers");
test.assertIncludes(projectDisk, "function getProjectScraps()", "Scrapbook items are scoped through Project Disk helpers");
test.assertIncludes(projectDisk, "function getProjectTrashItems()", "Trash is scoped to the current Project Disk");
test.assertIncludes(app, "function getProjectCdItems(projectId = activeProjectId)", "Project CD items default to the active Project Disk");
test.assertIncludes(app, 'data-action="open-project-backup"', "Project Hard Disk surface exposes a visible backup action");
test.assertIncludes(app, "function openProjectBackupPanel()", "Project Backup action opens the existing backup preview path");
test.assertIncludes(app, "backupSection.open = true", "Project Backup action expands backup preview by default");
test.assertIncludes(app, "project_backup_action: \"Backup…\"", "English UI names the Project Disk backup action");
test.assertIncludes(app, "project_backup_action: \"备份…\"", "Chinese UI names the Project Disk backup action");
test.assertIncludes(app, "export_project_backup: \"Export Backup…\"", "Project Info export action is named as a backup");
test.assertIncludes(app, "export_project_backup: \"导出备份…\"", "Chinese Project Info export action is named as a backup");

test.assertIncludes(projectDisk, "function createProjectRecord", "new Project Hard Disks are created through a single record factory");
test.assertIncludes(projectDisk, "project_disk_empty_title", "an empty Project Hard Disk renders a visible empty-state object");
test.assertIncludes(app, 'project_disk_empty_title: "Empty Project Hard Disk"', "English names the empty Project Hard Disk");
test.assertIncludes(app, 'project_disk_empty_title: "空项目硬盘"', "Chinese names the empty Project Hard Disk");
test.assertIncludes(indexHtml, 'id="new-project-disk-modal"', "New Project Hard Disk uses an in-app dialog instead of a native browser prompt");
test.assertNotIncludes(desktopRuntime, "window.prompt(t(\"new_project_prompt\")", "new project naming never falls back to a native browser prompt");
test.assertIncludes(app, 'new_project_disk_create: "Create"', "English UI names the create action");
test.assertIncludes(app, 'new_project_disk_create: "创建"', "Chinese UI names the create action");
// Every path that moves the mount persists it before it returns. Creating a
// disk was the one that did not: projects.commit() saves through
// saveDeskState() while activeProjectId still names the *previous* disk, so the
// settings record kept the old mount until some later, unrelated save happened
// to correct it. The mount is not left to an accident of timing.
test.assertMatches(
  desktopRuntime,
  /async function createProjectFromInput\(\)[\s\S]*?activeProjectId = project\.id[\s\S]*?await saveDeskState\(\);[\s\S]*?\n\}/,
  "creating a Project Hard Disk records the new mount before the action ends"
);
test.assertMatches(
  desktopRuntime,
  /async function switchProject\([\s\S]*?saveDeskState\(\);[\s\S]*?\n\}/,
  "mounting an existing Project Hard Disk records the mount too"
);

test.assertMatches(desktopRuntime, /async function eraseSelectedProjectDisk\(\)[\s\S]*removeProjectItems\(chatFiles, projectId\)/, "Erase Disk removes project-owned files");
test.assertMatches(desktopRuntime, /async function eraseSelectedProjectDisk\(\)[\s\S]*removeProjectItems\(scraps, projectId\)/, "Erase Disk removes project-owned scraps");
test.assertMatches(desktopRuntime, /async function eraseSelectedProjectDisk\(\)[\s\S]*removeProjectItems\(projectReferences, projectId\)/, "Erase Disk removes project-owned references");
test.assertMatches(desktopRuntime, /async function eraseSelectedProjectDisk\(\)[\s\S]*clearWorkingSession\(\{ projectId \}\)/, "Erase Disk clears the erased project's transient session");

test.assertIncludes(app, 'format: "ai-system-6-project-disk"', "Project Disk export uses the documented bundle format");
test.assertIncludes(app, "function remapProjectDiskBackup(bundle)", "Project Disk import remaps IDs instead of overwriting existing projects");
test.assertIncludes(projectBackup, "const newProjectId = suppliedUuid ? suppliedUuid() : crypto.randomUUID()", "Project Disk import creates a fresh project identity");
test.assertIncludes(app, "projects.unshift(imported.project)", "Project Disk import adds a new project rather than mutating an old one");

test.finish();
