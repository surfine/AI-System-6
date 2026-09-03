// The register of gates that nothing runs on purpose.
//
// Enumeration of gates comes from the filesystem; this file is the opposite
// kind of list — the exceptions, each with the reason someone accepted. A gate
// that reaches no runner and appears in no waiver fails
// tests/features/gate-wiring.test.mjs, so the next unwired gate has to be
// argued for in writing rather than left as decoration.
//
// The contract also refuses a waiver that has gone stale: one for a file that
// no longer exists, and one for a gate that is now wired.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { repositoryRoot } from "./paths.mjs";

export const GATE_WAIVER_PATH = "tooling/gate-waivers.json";

export function readGateWaivers(root = repositoryRoot) {
  const raw = JSON.parse(readFileSync(join(root, GATE_WAIVER_PATH), "utf8"));
  return { unwired: raw.unwired || {} };
}
