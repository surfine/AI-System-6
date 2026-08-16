// StateStore commit callback scope gate.
//
// Commit callbacks are allowed to mutate only the data the store snapshots
// and rolls back (projects / chatFiles / chatFolders / scraps / projectCdItems
// / trashItems / projectReferences / the writing project record). UI ephemeral
// state — selected ids, active project, window focus, tabs, selection Sets,
// status, toasts, DOM — must change AFTER the commit resolves, because a
// failed commit rolls back only the store's own data. Writing ephemeral state
// inside the callback leaves the UI claiming a change that never persisted.
//
// This is a static contract: it parses every commit callback and fails on any
// direct write to an ephemeral name. It cannot prove runtime behavior, but it
// makes the architectural rule mechanically enforced for every future commit.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  createFeatureTest,
  forEachAstChild,
  parseJsSource,
  read,
  resolveProjectPath,
} from "../helpers/feature-test-harness.mjs";

const isIdentifier = (node) => node.type === "Identifier";
const isMemberAccess = (node) => node.type === "MemberExpression" && !node.computed;

const test = createFeatureTest("state-store-commit-scope");

const STORE_COVERED_IDENTIFIERS = new Set([
  "projects",
  "chatFiles",
  "chatFolders",
  "scraps",
  "projectCdItems",
  "trashItems",
  "projectReferences",
  "ragChunks",
  "lastRetrievedContextItems",
  "runtimeEnvironment",
  "workspaceProfile",
  "project",
]);

// Ephemeral UI state that must never be written inside a commit callback.
const EPHEMERAL_IDENTIFIERS = new Set([
  "activeProjectId",
  "selectedProjectId",
  "selectedFolderId",
  "selectedChatFileId",
  "selectedDocumentId",
  "selectedScrapId",
  "selectedScrapIds",
  "selectedProjectCdItemId",
  "selectedProjectCdItemIds",
  "isProjectMounted",
  "isProjectScoped",
  "lastClipScrapId",
  "reviewDeskDirty",
  "teachTextDirty",
  "activeWindow",
  "focusedWindow",
  "status",
  "toast",
]);

const EPHEMERAL_CALLS = new Set([
  "clearProjectTransientState",
  "renderProjectCd",
  "renderProjects",
  "renderDocuments",
  "renderPipeline",
  "renderOutline",
  "renderMultiFinderMenu",
  "updateMenuState",
  "scheduleWorkspaceRender",
  "closeProjectScopedWindows",
  "openWindow",
  "closeWindow",
  "setStatus",
  "showSystemModal",
  "setWindowActive",
  "focusWindow",
]);

function walkFiles(dir, extension) {
  const out = [];
  for (const entry of readdirSync(resolveProjectPath(dir))) {
    const full = join(dir, entry);
    const stat = statSync(resolveProjectPath(full));
    if (stat.isDirectory()) out.push(...walkFiles(full, extension));
    else if (entry.endsWith(extension)) out.push(full);
  }
  return out;
}

function commitCallbackViolations(source, filePath) {
  const sourceFile = parseJsSource(source);
  const violations = [];

  function ephemeralName(node) {
    if (isIdentifier(node)) {
      const name = node.name;
      if (EPHEMERAL_IDENTIFIERS.has(name)) return name;
      return "";
    }
    if (isMemberAccess(node) && isIdentifier(node.object)) {
      // selectedProjectCdItemIds.clear() / activeProjectId.value — the object
      // itself is ephemeral even when the property is store-shaped.
      if (EPHEMERAL_IDENTIFIERS.has(node.object.name)) return node.object.name;
    }
    return "";
  }

  function walk(node, inCommit) {
    if (node.type === "CallExpression") {
      const calleeName = isIdentifier(node.callee)
        ? node.callee.name
        : isMemberAccess(node.callee) && isIdentifier(node.callee.object)
        ? node.callee.object.name
        : "";
      if (inCommit && EPHEMERAL_CALLS.has(calleeName)) {
        violations.push(`${filePath}: commit callback calls ephemeral UI function ${calleeName}`);
      }
      if (
        node.callee.property?.name === "commit"
        && isMemberAccess(node.callee)
        // The call sites read window.AISystem6StateStores.<store>.commit(...),
        // so the store name is not at the start of the object expression.
        && /(^|\.)AISystem6StateStores\b/.test(source.slice(node.callee.object.start, node.callee.object.end))
      ) {
        const callback = node.arguments[0];
        if (callback) walk(callback, true);
        return;
      }
    }
    if (inCommit && node.type === "AssignmentExpression" && node.operator === "=") {
      const name = ephemeralName(node.left);
      if (name && !STORE_COVERED_IDENTIFIERS.has(name)) {
        violations.push(`${filePath}: commit callback assigns ephemeral state ${name}`);
      }
    }
    if (inCommit && node.type === "CallExpression") {
      const name = ephemeralName(node.callee);
      if (name && !STORE_COVERED_IDENTIFIERS.has(name)) {
        violations.push(`${filePath}: commit callback mutates ephemeral state ${name}`);
      }
    }
    forEachAstChild(node, (child) => walk(child, inCommit));
  }

  walk(sourceFile, false);
  return violations;
}

const appFiles = [
  ...walkFiles("app/core", ".js"),
  ...walkFiles("app/features", ".js"),
];
let totalViolations = 0;
for (const file of appFiles) {
  const source = read(file);
  const violations = commitCallbackViolations(source, file);
  violations.forEach((violation) => test.fail(violation));
  totalViolations += violations.length;
}

test.assert(
  read("app/features/export-import.js").includes("selectedProjectCdItemId = item.id;"),
  "Project CD selection moves after the commit resolves"
);
test.assert(
  read("app/core/desktop-runtime.js").includes("activeProjectId = project.id;"),
  "project activation moves after the commit resolves"
);
test.assert(
  totalViolations === 0,
  "no commit callback writes ephemeral UI state"
);

test.finish();
