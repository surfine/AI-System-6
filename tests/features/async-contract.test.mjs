// Async API contract: durability rewrites turned several APIs async
// (addProjectCdItem, createDocumentRevision, Project/Writing/Desktop store
// commits). A caller that kept treating them as synchronous silently holds a
// Promise, mutates the wrong object, or claims success before persistence.
// This gate scans the shipped app sources for the obvious bare-call patterns
// and pins the known call sites to an explicit await/return.

import { execFileSync } from "node:child_process";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("async-contract");

const sourceFiles = execFileSync("rg", ["--files", "apps/desktop/app", "-g", "*.js"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .map((file) => file.replace(/^apps\/desktop\//, ""))
  .filter((file) => !file.startsWith("app/legacy/") && !file.startsWith("app/vendor/") && !file.startsWith("app/generated/"));
sourceFiles.push("app.js");

const mustAwaitApis = ["addProjectCdItem", "createDocumentRevision"];
const bareAssignment = new RegExp(
  `(?:const|let|var)\\s+\\w+\\s*=\\s*(?:${mustAwaitApis.join("|")})\\(`
);
const truthyPromiseCheck = new RegExp(
  `if\\s*\\(\\s*(?:${mustAwaitApis.join("|")})\\(`
);
const unawaitedStoreCommit = /AISystem6StateStores[\s\S]{0,20}\.(projects|writing|desktop)\.commit\(/;

const violations = [];
for (const file of sourceFiles) {
  const source = read(file);
  source.split("\n").forEach((line, index) => {
    if (bareAssignment.test(line)) {
      violations.push(`${file}:${index + 1}: bare promise assignment (${line.trim().slice(0, 80)})`);
    }
    if (truthyPromiseCheck.test(line)) {
      violations.push(`${file}:${index + 1}: promise used as truthy check (${line.trim().slice(0, 80)})`);
    }
    if (unawaitedStoreCommit.test(line) && !/await\s+(?:window\.)?AISystem6StateStores/.test(line)) {
      violations.push(`${file}:${index + 1}: store commit not awaited (${line.trim().slice(0, 80)})`);
    }
  });
}
test.assert(
  violations.length === 0,
  violations.length ? `no bare async calls in app sources:\n  ${violations.join("\n  ")}` : "no bare async calls in app sources"
);

// ---- Pinned call sites -----------------------------------------------------

const exportImport = read("app/features/export-import.js");
const actions = read("app/core/actions.js");
const scripting = read("app/core/scripting.js");
const documentsChat = read("app/features/documents-chat.js");
const hkrr = read("app/features/hkrr-review.js");
const writingDemo = read("app/features/writing-demo.js");

test.assertIncludes(
  exportImport,
  "async function addProjectCdItem(markdown, name, options = {})",
  "addProjectCdItem is async and takes explicit options"
);
test.assertIncludes(
  exportImport,
  "options.sourceDocumentId ?? activeTextFileId",
  "addProjectCdItem assembles sourceDocumentId once from options"
);
test.assertIncludes(
  exportImport,
  "async function burnMarkdownToProjectCd",
  "burning is a separate awaited operation"
);
test.assertIncludes(
  exportImport,
  "async function downloadMarkdownAndBurnToProjectCd",
  "the combined download+burn path is async"
);
test.assert(
  !exportImport.includes("const projectCdItem = options.addToProjectCd"),
  "downloadMarkdown no longer burns to the Project CD implicitly"
);
test.assertIncludes(
  exportImport,
  "function downloadMarkdown(markdown, name) {",
  "downloadMarkdown is a pure download"
);

test.assertIncludes(actions, "async function exportTeachTextToProjectCd", "TeachText CD export awaits the burn");
test.assertIncludes(actions, "async function exportReviewDeskReport", "Review Desk export awaits the burn");
test.assertIncludes(
  actions,
  "const result = command.handler(commandContext);",
  "handleAction returns the handler result so callers can await it"
);

test.assertIncludes(scripting, "async function runProjectCdDroplet", "the Project CD droplet is async");
test.assertIncludes(
  scripting,
  "sourceDocumentId: file.id",
  "the droplet passes the source document through addProjectCdItem options"
);
test.assertIncludes(
  scripting,
  "if (!item) return false;",
  "a failed droplet burn returns false and never opens the CD"
);

test.assert(
  /(?:await|return)\s+downloadMarkdownAndBurnToProjectCd/.test(documentsChat),
  "saved-chat download burns first, then downloads"
);
test.assertIncludes(hkrr, "await addProjectCdItem", "HKRR review save awaits the burn");
test.assertIncludes(writingDemo, "await addProjectCdItem", "writing demo burn awaits the burn");

// The legacy tree is not shipped; leave its stale call sites alone but make
// the boundary explicit so nobody edits the shipped files back to sync.
test.assertNotIncludes(exportImport, "app/legacy", "export-import never references legacy callers");

test.finish();
