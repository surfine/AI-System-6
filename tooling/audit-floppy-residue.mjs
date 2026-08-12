import { existsSync, readFileSync, statSync } from "node:fs";
import { appRuntimePaths, coreFiles, floppyBudgetBytes, lazyRuntimePaths } from "./runtime-manifest.mjs";
import { resolveProjectPath } from "./lib/paths.mjs";

const startupTargetRemainingBytes = 25 * 1024;
const sourcePaths = [
  "index.html",
  "app.js",
  ...appRuntimePaths.filter((path) => path !== "app.js"),
  ...lazyRuntimePaths,
];

function read(path) {
  return readFileSync(resolveProjectPath(path), "utf8");
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function collectMatches(source, pattern, group = 1) {
  return [...source.matchAll(pattern)].map((match) => match[group]).filter(Boolean);
}

function printList(title, rows, limit = 40) {
  console.log(`\n${title}`);
  if (!rows.length) {
    console.log("  none");
    return;
  }
  rows.slice(0, limit).forEach((row) => console.log(`  ${row}`));
  if (rows.length > limit) console.log(`  ... ${rows.length - limit} more`);
}

function sourceCorpus(paths = sourcePaths) {
  return paths
    .filter((path) => existsSync(resolveProjectPath(path)))
    .map((path) => read(path))
    .join("\n");
}

function auditBudget() {
  const rows = coreFiles.map((path) => ({ path, bytes: statSync(resolveProjectPath(path)).size }));
  const total = rows.reduce((sum, row) => sum + row.bytes, 0);
  const remaining = floppyBudgetBytes - total;

  console.log("System Floppy Budget");
  rows.forEach(({ path, bytes }) => {
    console.log(`${path.padEnd(24)} ${String(bytes).padStart(9)} bytes`);
  });
  console.log(`${"core total".padEnd(24)} ${String(total).padStart(9)} bytes`);
  console.log(`${"remaining".padEnd(24)} ${String(remaining).padStart(9)} bytes`);
  console.log(`${"target remaining".padEnd(24)} ${String(startupTargetRemainingBytes).padStart(9)} bytes`);
}

function auditTopModules() {
  const rows = appRuntimePaths
    .map((path) => ({ path, bytes: statSync(resolveProjectPath(path)).size }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 15)
    .map(({ path, bytes }) => `${path.padEnd(40)} ${String(bytes).padStart(8)} bytes`);
  printList("Top app modules", rows, rows.length);
}

function auditTranslations() {
  const dataPath = "app/data/system-data.js";
  const dataSource = read(dataPath);
  const corpus = sourceCorpus(sourcePaths.filter((path) => path !== dataPath));
  const dynamicPrefixes = [
    "system_help_group_",
    "trash_type_",
  ];
  const keys = unique(collectMatches(dataSource, /^    ([a-z][a-z0-9_]*):/gm));
  const unused = keys.filter((key) => {
    if (dynamicPrefixes.some((prefix) => key.startsWith(prefix))) return false;
    return !corpus.includes(key);
  });
  printList("Suspect translation keys with no literal caller", unused);
}

function auditActions() {
  const actionsSource = read("app/core/actions.js");
  const actions = unique(collectMatches(actionsSource, /"([^"]+)":\s*(?:\(|[A-Za-z_])/g));
  const corpus = sourceCorpus(sourcePaths.filter((path) => path !== "app/core/actions.js"));
  const dataActions = unique([
    ...collectMatches(corpus, /data-action="([^"]+)"/g),
    ...collectMatches(corpus, /dataset\.action\s*=\s*"([^"]+)"/g),
    ...collectMatches(corpus, /setAttribute\(\s*["']data-action["']\s*,\s*["']([^"']+)["']/g),
  ]);
  const actionEntrances = new Set(dataActions);
  const missingHandlers = dataActions.filter((action) => !actions.includes(action));
  const noEntrance = actions.filter((action) => !actionEntrances.has(action) && !corpus.includes(`"${action}"`));

  printList("DOM/data actions without a handler", missingHandlers);
  printList("Action handlers with no obvious DOM entrance", noEntrance);
}

function auditCssSelectors() {
  const styles = read("styles.css");
  const corpus = sourceCorpus(sourcePaths);
  const classNames = unique(collectMatches(styles, /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g));
  const ids = unique(collectMatches(styles, /#([_a-zA-Z][_a-zA-Z0-9-]*)/g));
  const ignoredClasses = new Set([
    "is-active",
    "is-collapsed",
    "is-disabled",
    "is-hidden",
    "is-loading",
    "is-open",
    "is-previewing",
    "is-selected",
  ]);
  const missingClasses = classNames.filter((name) => !ignoredClasses.has(name) && !corpus.includes(name));
  const missingIds = ids.filter((name) => !/^[a-f0-9]{3,8}$/i.test(name) && !corpus.includes(name));

  printList("CSS classes with no obvious DOM/JS token", missingClasses);
  printList("CSS ids with no obvious DOM/JS token", missingIds);
}

auditBudget();
auditTopModules();
auditTranslations();
auditActions();
auditCssSelectors();

console.log("\nAudit is heuristic and read-only; confirm reachability before deleting.");
