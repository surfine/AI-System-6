// Preflight for generated evidence files, shared by the gates that read them.
//
// Why this exists: some gates read a board or a report from
// `internal/evidence/drafts/`. That directory is git-ignored, so a fresh
// checkout or a new worktree does not have those files. The gate then died
// with a raw Node ENOENT stack that named the absent path but not the command
// that writes it. The observed case was
// `internal/evidence/drafts/era-icons/icon-continuity-report.json` in
// `verify:features`.
//
// So: find the absent input before the gate starts its work, and print the
// generator command. The gate still fails — a contract that reads generated
// evidence must not pass without it.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { repositoryRoot } from "./paths.mjs";

/**
 * Generated evidence files and the command that writes each one. The key is
 * the repository-relative path that a gate reads. Add an entry here when a
 * gate starts to read a new generated file.
 */
export const GENERATED_EVIDENCE = Object.freeze({
  "internal/evidence/drafts/era-icons/icon-continuity-report.json": Object.freeze({
    command: "npm run build:icon-continuity-board",
    purpose: "Cross-era continuity counts for the 56 canonical objects.",
  }),
  "internal/evidence/drafts/era-icons/liquid-glass-family-appearance-board.png": Object.freeze({
    command: "npm run build:liquid-glass-imagegen-icons",
    purpose: "Proof board for the Default, Dark, and Clear appearances.",
  }),
});

/**
 * Report which of the given generated evidence files are absent.
 * @param {string[]} paths repository-relative paths, usually keys of GENERATED_EVIDENCE
 * @returns {{ok: boolean, missing: {path: string, command: string, purpose: string}[]}}
 */
export function inspectGeneratedEvidence(paths, root = repositoryRoot) {
  const missing = paths
    .filter((path) => !existsSync(join(root, path)))
    .map((path) => ({
      path,
      command: GENERATED_EVIDENCE[path]?.command || "",
      purpose: GENERATED_EVIDENCE[path]?.purpose || "",
    }));
  return { ok: !missing.length, missing };
}

/** Human-readable explanation for a failed inspection, or "" when all files are present. */
export function describeMissingGeneratedEvidence(report, gateName) {
  if (report.ok) return "";
  const lines = [`NO  ${gateName}: ${report.missing.length} generated evidence file(s) are absent.`];
  for (const entry of report.missing) {
    lines.push("", `    ${entry.path}`);
    if (entry.purpose) lines.push(`      ${entry.purpose}`);
    if (entry.command) lines.push("      Write it with:", `        ${entry.command}`);
    else lines.push("      No generator command is recorded for this file.");
  }
  lines.push(
    "",
    "    These files are git-ignored evidence, thus a fresh checkout or a new",
    "    worktree does not have them. Run the command(s) above, then run this",
    "    gate again. This is not a defect in the product assets, but the gate",
    "    stays failed until the evidence exists.",
  );
  return lines.join("\n");
}

/**
 * Hard precondition for a gate that reads generated evidence. Exits the
 * process with the generator command instead of a raw ENOENT stack.
 */
export function assertGeneratedEvidence(gateName, paths, root = repositoryRoot) {
  const report = inspectGeneratedEvidence(paths, root);
  if (report.ok) return report;
  console.error(describeMissingGeneratedEvidence(report, gateName));
  process.exit(1);
}
