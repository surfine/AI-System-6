import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function readAppScripts() {
  const appDir = join(root, "apps", "desktop", "app");
  const scripts = [];

  function collect(dir) {
    readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) collect(fullPath);
      else if (entry.name.endsWith(".js")) scripts.push(readFileSync(fullPath, "utf8"));
    });
  }

  collect(appDir);
  scripts.push(readFileSync(join(root, "apps/desktop/app.js"), "utf8"));
  return scripts.join("\n");
}

const app = readAppScripts();
const html = readFileSync(join(root, "apps/desktop/index.html"), "utf8");
const failures = [];

function ok(message) {
  console.log(`OK  ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`NO  ${message}`);
}

function requireSource(name, needle) {
  if (app.includes(needle) || html.includes(needle)) ok(name);
  else fail(name);
}

[
  ["active project guard", "item?.projectId === activeProjectId"],
  ["Documents scoped to active Project Disk", "function getProjectFiles()"],
  ["Scrapbook scoped to active Project Disk", "function getProjectScraps()"],
  ["Trash scoped to active Project Disk", "function getProjectTrashItems()"],
  ["Project CD scoped to Project Disk", "function getProjectCdItems(projectId = activeProjectId)"],
  ["Project references scoped by projectId", "getStoredProjectReferences(projectId)"],
  ["File Disk chunks scoped by mounted project", "mountedTextDisk.projectId !== activeProjectId"],
  ["Project Disk export format", "format: \"ai-system-6-project-disk\""],
  ["Project Disk backup preview UI", "id=\"project-backup-preview\""],
  ["Project Disk import-as-new UI", "id=\"import-project-backup\""],
  ["Project Disk import remaps records", "function remapProjectDiskBackup(bundle)"],
  ["Project Disk import creates new project id", "const newProjectId = suppliedUuid ? suppliedUuid() : crypto.randomUUID()"],
  ["Project Disk import stores original provenance", "importedFrom:"],
  ["Project Disk import never overwrites old project", "projects.unshift(imported.project)"],
  ["Trash data is excluded from context sources", "function isContextSourceLive(contextItem)"],
  ["Trash purge clears RAG and context caches", "function purgeContextForTrashedItems(items = [])"],
  ["Batch document trash selection", "function getSelectedDocumentItems()"],
  ["Mounted File trash removes File Floppy chunks", "originalType: \"mountedFile\""],
].forEach(([name, needle]) => requireSource(name, needle));

if (failures.length) {
  console.error(`\nData boundary verification failed: ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("\nData boundary verification passed.");
