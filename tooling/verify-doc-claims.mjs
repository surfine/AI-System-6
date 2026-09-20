#!/usr/bin/env node

// Claim audit for the agent knowledge layer.
//
// `verify:docs` compares a canonical document with its zh mirror by hash, so it
// locks in whatever was written and never asks whether it is true. This tool
// asks the other question: for every load-bearing claim it can check, it reads
// the code, the command or the commit that owns the fact and reports whether the
// document still agrees. Three phases cover the entry and rules layer
// (claims-phase1), docs/** (claims-phase2), and internal/agents,
// internal/operations and the root documents (claims-phase3).
//
// It is a report, not a gate. Wiring a report like this into CI would make the
// wording of the day authoritative in exactly the way the audit exists to
// undo — every assertion here is written to compare against an owner, not to
// pin a spelling, but it still encodes today's claims. Run it by hand after
// editing the knowledge layer, and read a failure before "fixing" it: the
// document and the code can both be wrong.
//
// Usage:
//   node tooling/verify-doc-claims.mjs            # all three phases
//   node tooling/verify-doc-claims.mjs --phase 2  # one phase
//
// Exit status is 0 when every check passes, 1 otherwise, so a person can chain
// it on purpose. The ledger in internal/agents/DOC-CLAIM-AUDIT.md records the
// verdicts and the corrections each phase produced.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const phases = [
  { id: "1", script: "tooling/audit/claims-phase1.mjs", label: "entry and rules layer" },
  { id: "2", script: "tooling/audit/claims-phase2.mjs", label: "docs/**" },
  { id: "3", script: "tooling/audit/claims-phase3.mjs", label: "internal and root documents" },
];

const args = process.argv.slice(2);
const requested = args.includes("--phase") ? args[args.indexOf("--phase") + 1] : null;
if (requested && !phases.some((phase) => phase.id === requested)) {
  console.error(`--phase takes ${phases.map((phase) => phase.id).join(", ")}`);
  process.exit(2);
}

const failed = [];
for (const phase of phases) {
  if (requested && phase.id !== requested) continue;
  console.log(`\n=== phase ${phase.id}: ${phase.label} ===`);
  const result = spawnSync(process.execPath, [join(root, phase.script)], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) failed.push(`phase ${phase.id}`);
}

if (failed.length) {
  console.error(`\nDoc claim audit failed: ${failed.join(", ")}. Read each failure before changing anything:`);
  console.error("a document and the code it describes can both be wrong, and this tool only reports the gap.");
  process.exit(1);
}
console.log("\nDoc claim audit passed: every checked claim still agrees with its owner.");
