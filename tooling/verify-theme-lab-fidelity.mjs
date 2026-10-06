// Unified canonical-fidelity gate: every registry appearance has a Theme Lab
// fidelity board (historical HIG/screenshot boards where they exist; authored
// Theme Lab design-specimen boards elsewhere).
//
// The regression snapshot (verify:theme-lab) answers "is today identical to
// yesterday". This harness answers "how far from the pinned target" and exits
// non-zero when a pinned specimen exceeds its manifest tolerance (geometry,
// edge, material), a canonical source is missing or tampered with, a required
// state does not render, a computed-style contract fails, or the capture is
// unstable.
//
// Authored boards credit themselves as Theme Lab / design freezes — never as
// native OS captures. A green run here is not calm-desktop Goal completion.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReferenceAssets } from "./lib/reference-assets.mjs";
import { HISTORICAL_FIDELITY_THEMES } from "./theme-lab-fidelity-contract.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Fail once here rather than N identical times inside the spawned boards.
assertReferenceAssets("Theme Lab fidelity", root);
const THEMES = [...HISTORICAL_FIDELITY_THEMES];

// Pair every `id:` in the registry with the `releaseReady:` that follows it, so
// this reads the appearance list the app actually ships rather than a copy.
function registryAppearances() {
  const source = readFileSync(join(root, "apps", "desktop", "app", "core", "theme-registry.js"), "utf8");
  const ids = [];
  let pending = null;
  for (const token of source.matchAll(/\bid:\s*"([a-z0-9-]+)"|\breleaseReady:\s*(true|false)/g)) {
    if (token[1]) pending = token[1];
    else if (pending) {
      ids.push(pending);
      pending = null;
    }
  }
  return ids;
}

const uncovered = registryAppearances().filter((id) => !THEMES.includes(id));
if (uncovered.length) {
  console.error(`[theme-lab-fidelity] ${uncovered.join(", ")} is in the theme registry and is not measured by this gate. Add a canonical board (or restore an honest UNCOVERED declaration with its reason).`);
  process.exit(1);
}
console.log(`[theme-lab-fidelity] Measured here: ${THEMES.join(", ")}.`);
console.log(`[theme-lab-fidelity] Not measured here: (none — every registry appearance has a board).`);

// Retina control-acceptance board (2x), supplementary to the 1x contract.
const DPR2_RUNS = [
  { label: "yosemite-2x", args: ["--theme", "yosemite", "--manifest", "tests/visual/theme-lab-fidelity/yosemite-2x.json"] },
];

let failed = 0;
const runs = [
  ...THEMES.map((theme) => ({ label: theme, args: ["--theme", theme] })),
  ...DPR2_RUNS,
];
for (const run of runs) {
  process.stdout.write(`\n[theme-lab-fidelity] ${run.label} …\n`);
  const result = spawnSync(process.execPath, ["tooling/theme-lab-fidelity.mjs", ...run.args], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  const exitCode = result.status === null ? 1 : result.status;
  if (exitCode !== 0) failed += 1;
  process.stdout.write(`[theme-lab-fidelity] ${run.label} → exit ${exitCode}\n`);
}

if (failed) {
  console.error(`\nCanonical fidelity failed for ${failed} of ${runs.length} boards.`);
  process.exit(1);
}
console.log(`\nCanonical fidelity passed for ${runs.length} boards (${THEMES.join(", ")} + Retina acceptance).`);
