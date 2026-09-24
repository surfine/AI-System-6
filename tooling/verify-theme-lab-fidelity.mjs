// Unified canonical-fidelity gate: Platinum + Aqua + Snow Leopard + Yosemite.
//
// The regression snapshot (verify:theme-lab) answers "is today identical to
// yesterday". This harness answers "how far from the real historical target"
// and exits non-zero when a pinned specimen exceeds its manifest tolerance
// (geometry, edge, material), a canonical source is missing or tampered with,
// a required state does not render, a computed-style contract fails, or the
// capture is unstable.
//
// Four appearances in the registry are NOT in this gate, and the run says so
// in its own output every time. System 6 and Liquid Glass have no historical
// screenshot target. Big Sur is an adaptation of the system surfaces described
// in WWDC20 session 10104, not a copy of a captured one, so it has no canonical
// board to be measured against either. NeXTSTEP (released 1.0.55) has no
// canonical board; its instruments are verify-nextstep-workflow/edgecases. A green run here is therefore never
// evidence about those four, and the guard below refuses a new registry
// appearance that is neither measured here nor declared uncovered.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReferenceAssets } from "./lib/reference-assets.mjs";
import { HISTORICAL_FIDELITY_THEMES } from "./theme-lab-fidelity-contract.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Fail once here rather than five identical times inside the spawned boards.
assertReferenceAssets("Theme Lab fidelity", root);
const THEMES = [...HISTORICAL_FIDELITY_THEMES];

// Every appearance this gate does not measure, with the reason. Reading the
// registry below and refusing an undeclared id is what keeps this list honest:
// a ninth appearance cannot be added and quietly inherit Platinum's green.
const UNCOVERED = Object.freeze({
  classic: "no historical screenshot target; regression baseline + design contract",
  "liquid-glass": "no historical screenshot target; regression baseline + design contract",
  "big-sur": "adaptation of WWDC20 10104 measurements, not a captured board; regression baseline + design contract + era acceptance record",
  nextstep: "no canonical board; verify-nextstep-workflow/edgecases are its instruments",
  lion: "measured from Apple's 2011 Lion HIG figures and 512 Pixels captures (internal/evidence/drafts/lion-reference), not a captured board; regression baseline + design contract",
  "drawing-board": "second-hand evidence (a 1999 WindowBlinds port of the unreleased theme), no native capture to board against; regression baseline + design contract",
  "system-7": "chrome read pixel by pixel from a running System 7.5.3 (internal/evidence/drafts/system-7-reference), not a captured board; regression baseline + design contract",
  tiger: "calibrated from the 2005-09-08 Apple HIG figures (pp. 180-181), not a captured board; Theme Lab's Finder specimen is not a real Finder window, so it cannot show the metal; regression baseline + design contract",
});

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
const undeclared = uncovered.filter((id) => !Object.hasOwn(UNCOVERED, id));
console.log(`[theme-lab-fidelity] Measured here: ${THEMES.join(", ")}.`);
console.log(`[theme-lab-fidelity] Not measured here: ${uncovered.map((id) => `${id} — ${UNCOVERED[id] || "UNDECLARED"}`).join("; ")}.`);
if (undeclared.length) {
  console.error(`[theme-lab-fidelity] ${undeclared.join(", ")} is in the theme registry and is neither measured by this gate nor declared uncovered. Add a canonical board or declare it in UNCOVERED with its reason.`);
  process.exit(1);
}
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
console.log(`\nCanonical fidelity passed for ${runs.length} boards (${THEMES.join(", ")} + Retina acceptance). This says nothing about ${uncovered.join(", ")}.`);
