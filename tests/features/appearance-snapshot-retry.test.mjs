// A failed retry must not be read as a failed product.
//
// tooling/appearance-snapshot.mjs re-shoots a drifted cell to tell a flaky
// rasterization from a real change. When that second shot never landed, the
// loop set `selfDiff` to null and still called diffPng on the PNG the retry
// never wrote: the run threw out of the whole matrix, or reported the cell as
// an unstable capture on the strength of a capture that did not happen.
//
// The decision now lives in tooling/lib/appearance-retry.mjs and is exercised
// here directly, with no browser, plus the source wiring that keeps the guard
// in the loop. The end-to-end run needs Chromium and a machine-local pixel
// baseline, so it stays the reader's job — this holds the branch that was
// wrong.

import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("appearance-snapshot-retry");

const { retryShootability } = await import(`${root}/tooling/lib/appearance-retry.mjs`);
const snapshot = read("tooling/appearance-snapshot.mjs");

// --- The failed retry, and the other two shapes a retry can take. ---
const failedRetry = retryShootability({ id: "showcase-aqua", missing: true, why: "screenshot: TimeoutError" }, false);
test.assert(
  failedRetry.ok === false && /did not mount/.test(failedRetry.reason) && /TimeoutError/.test(failedRetry.reason),
  `a retry that never mounted is refused, and its reason names the mount failure (got ${JSON.stringify(failedRetry)})`,
);

const absentPng = retryShootability({ id: "showcase-aqua", sha256: "abc", bytes: 12 }, false);
test.assert(
  absentPng.ok === false && /no PNG/.test(absentPng.reason),
  `a retry that reports success but wrote no PNG is refused (got ${JSON.stringify(absentPng)})`,
);

const emptyRecord = retryShootability(undefined, false);
test.assert(
  emptyRecord.ok === false && /no record/.test(emptyRecord.reason),
  "a capture that returned nothing is refused rather than compared",
);

const landed = retryShootability({ id: "showcase-aqua", sha256: "abc", bytes: 12 }, true);
test.assert(
  landed.ok === true,
  "a retry that mounted and wrote its PNG is allowed through to the comparison",
);

// A missing record is decided by its own reason, not by the disk read: the
// first check above passes `exists` false, so the order of the two refusals
// matters — a failed mount must never be reported as a missing file.
test.assert(
  retryShootability({ missing: true, why: "screenshot: Error" }, true).reason.startsWith("retry did not mount"),
  "a mount failure is named as a mount failure even when a stale PNG is on disk from an earlier cell",
);

// --- The loop really uses that decision. ---
const retryBlock = snapshot.slice(
  snapshot.indexOf("rmSync(retryDir, { recursive: true, force: true });"),
  snapshot.indexOf("const selfUnstable"),
);
test.assert(
  retryBlock.includes("retryShootability(again, existsSync(")
    && retryBlock.includes(`join(retryDir, \`\${record.id}.png\`)`),
  "the verification loop asks the helper about the retry record AND the file the retry was to write",
);
test.assert(
  /if \(!retryShot\.ok\) \{[\s\S]*failed = true;[\s\S]*continue;/.test(retryBlock),
  "a retry that did not land fails that cell and continues the matrix",
);
test.assert(
  retryBlock.includes("retryShot.reason"),
  "the cell's failure line prints the reason the retry could not be used",
);
test.assert(
  !/selfDiff = again && !again\.missing/.test(snapshot),
  "the old path — a null selfDiff from a failed retry, followed by diffPng on the missing file — is gone",
);
test.assert(
  snapshot.indexOf("retryShot.ok") < snapshot.indexOf("const selfDiff = await diffPng"),
  "the guard runs before the first diffPng that needs the retry PNG",
);

// --- The verdict is not weakened to make a failed retry pass. ---
test.assert(
  snapshot.includes("const MIN_CHANGED_PIXELS = 8;") && snapshot.includes("const PIXEL_TOLERANCE = 8;"),
  "the tolerances are unchanged",
);
const guardBlock = retryBlock.slice(0, retryBlock.indexOf("const selfDiff"));
test.assert(
  !/continue;[\s\S]*unstableRecovered/.test(guardBlock),
  "a cell whose retry failed is never counted as recovered or as an unstable capture",
);

test.finish();
