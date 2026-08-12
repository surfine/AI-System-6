// Unified canonical-fidelity gate: Platinum + Aqua + Snow Leopard + Yosemite.
//
// The regression snapshot (verify:theme-lab) answers "is today identical to
// yesterday". This harness answers "how far from the real historical target"
// and exits non-zero when a pinned specimen exceeds its manifest tolerance
// (geometry, edge, material), a canonical source is missing or tampered with,
// a required state does not render, a computed-style contract fails, or the
// capture is unstable. System 6 and Liquid Glass have no historical screenshot
// target and are covered by their regression baselines + design contract.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const THEMES = ["platinum", "aqua", "snow-leopard", "yosemite"];
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
console.log(`\nCanonical fidelity passed for ${runs.length} boards (${THEMES.length} appearances + Retina acceptance).`);
