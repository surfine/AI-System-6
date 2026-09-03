#!/usr/bin/env node

// Print the gate inventory: every gate, and what actually runs it.
//
// The table is computed, not written down, so it cannot go stale and cannot
// forget the gate that was added this morning. tests/features/gate-wiring.test.mjs
// holds the same computation as a contract.
//
// Usage:
//   node tooling/gate-wiring-inventory.mjs            # the whole table
//   node tooling/gate-wiring-inventory.mjs --orphans  # only what nothing runs

import { computeGateWiring, orphanGates } from "./lib/gate-wiring.mjs";
import { readGateWaivers } from "./lib/gate-waivers.mjs";
import { repositoryRoot } from "./lib/paths.mjs";

const orphansOnly = process.argv.includes("--orphans");
const wiring = computeGateWiring(repositoryRoot);
const waivers = readGateWaivers(repositoryRoot);

const MARK = { release: "release", development: "dev-loop", orphan: "NOTHING" };

if (!orphansOnly) {
  console.log(`Roots asked: ${wiring.rootLabels.join(", ")}\n`);
  const width = Math.max(...wiring.gates.map((gate) => gate.file.length));
  for (const gate of wiring.gates) {
    const runners = gate.runners.length ? gate.runners.join(", ") : (gate.isRoot ? "(is itself a runner)" : "—");
    console.log(
      `${gate.file.padEnd(width)}  ${MARK[gate.wiring].padEnd(8)}  ${runners}`
      + `${gate.npmScripts.length ? `\n${" ".repeat(width)}  npm: ${gate.npmScripts.join(", ")}` : ""}`,
    );
  }
  console.log("");
  console.log(`Reporters — print a list, never refuse, so nothing should gate on them: ${wiring.reporters.length}`);
  for (const file of wiring.reporters) console.log(`  ${file}`);
  console.log("");
}

const orphans = orphanGates(wiring);
console.log(`Orphans (nothing runs them): ${orphans.length}`);
for (const gate of orphans) {
  const waiver = waivers.unwired[gate.file];
  console.log(`  ${gate.file}${waiver ? `\n      waived: ${waiver}` : "   *** NO WAIVER ***"}`);
}

if (wiring.dangling.length) {
  console.log(`\nDangling references: ${wiring.dangling.length}`);
  for (const line of wiring.dangling) console.log(`  ${line}`);
}

if (wiring.nameMismatches.length) {
  console.log(`\nScript name does not echo its file (short names, not defects): ${wiring.nameMismatches.length}`);
  for (const line of wiring.nameMismatches) console.log(`  ${line}`);
}
