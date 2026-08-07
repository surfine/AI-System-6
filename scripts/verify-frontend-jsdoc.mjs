#!/usr/bin/env node

/**
 * Frontend checkJs gate: type-checks the state-boundary modules that opt in
 * with `// @ts-check` against their ambient global declarations. No runtime
 * transpiler is involved — tsc only validates types.
 *
 *   node scripts/verify-frontend-jsdoc.mjs
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["--prefix", "app", "run", "typecheck:frontend"], {
  cwd: root,
  encoding: "utf8",
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.status !== 0) {
  console.error("\nFrontend checkJs verification failed.");
  process.exit(result.status || 1);
}
console.log("\nFrontend checkJs verification passed.");
