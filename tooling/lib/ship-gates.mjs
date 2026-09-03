// The seven browser gates a release must pass, declared once.
//
// verify-ship.mjs runs them as a queue; verify-gate.mjs runs one of them during
// development and banks the receipt. Both read this list, so a developer and a
// release always speak about the same gate with the same name and the same
// command.

export const SHIP_REQUIRED_CHECKS = Object.freeze([
  "theme-lab-regression",
  "appearance-real-apps",
  "bonsai-acceptance",
  "eight-stop-walk",
  "appearance-phase5",
  "appearance-snapshot",
  "appearance-token-tables",
]);

/**
 * Two properties decide when a gate may run, and they are the gate's own, not
 * the scheduler's guesswork:
 *
 * `quiet` — the gate compares pixels, so a second browser on the same machine
 * can change what it photographs. Blur is the worst of them: a concurrent
 * backdrop-filter is not reproducible. A quiet gate runs alone.
 *
 * `costHintMs` — the last measured wall clock, used only to order the queue.
 * A wrong hint costs ordering, never correctness.
 *
 * The queue then puts the cheap gates in front of the expensive ones, so a
 * release that is going to fail says so in seconds instead of minutes.
 *
 * The hints below were re-measured on a real release run on 2026-09-03 and are
 * within a second or two of what that run spent, apart from the pixel net —
 * see its entry.
 */
export const SHIP_GATES = Object.freeze([
  {
    // The fast half of the collapsed matrix: the controls-tier cells the pixel
    // net no longer renders for the four middle eras are held as computed
    // token/geometry deltas against Classic instead of screenshots. It drops a
    // probe it measures as unstable, so it stays quiet to keep its coverage.
    name: "appearance-token-tables",
    args: ["tooling/appearance-token-check.mjs", "--verify"],
    quiet: true,
    costHintMs: 8_000,
  },
  {
    name: "appearance-real-apps",
    args: ["tooling/verify-appearance-app-coverage.mjs"],
    quiet: true,
    costHintMs: 25_000,
  },
  {
    name: "theme-lab-regression",
    args: ["tooling/theme-lab-snapshot.mjs", "--verify"],
    quiet: true,
    costHintMs: 26_000,
  },
  {
    name: "appearance-phase5",
    args: ["tooling/verify-appearance-phase5.mjs"],
    quiet: true,
    costHintMs: 27_000,
  },
  {
    // Behaviour, not pixels: eight browser scenarios that assert what the game
    // does. Another browser beside it changes the clock, not the verdict.
    name: "bonsai-acceptance",
    args: ["tooling/verify-bonsai-acceptance.mjs"],
    quiet: false,
    costHintMs: 90_000,
  },
  {
    // The eight-stop live walk: a real browser clicks through Project Hard
    // Disk -> File Floppy -> Question Sheet -> Outline -> Section Drafts ->
    // Manuscript -> Review Desk -> Project CD on a clean profile, plus the
    // DTK demo disk restored through the real import path. A release cannot
    // proceed without this passing — see internal/operations/RELEASE.md.
    // It asserts what is on screen, never how it is painted.
    name: "eight-stop-walk",
    args: ["tooling/verify-walk.mjs"],
    quiet: false,
    costHintMs: 118_000,
  },
  {
    // 90 s, measured on a real release run and matching the ~90 s the 35-cell
    // net is documented to take. The hint said 360_000 — what the net cost
    // before the four middle eras collapsed into the token table beside it. A
    // stale hint costs ordering, never correctness; but ordering IS the
    // fail-fast profile, and a gate believed to cost four times its real price
    // was held behind every cheaper refusal for no gain.
    name: "appearance-snapshot",
    args: ["tooling/appearance-snapshot.mjs", "--verify"],
    quiet: true,
    costHintMs: 90_000,
  },
]);

export function shipGate(name) {
  return SHIP_GATES.find((gate) => gate.name === name) || null;
}

/**
 * The gate entry script, which is also the head of its import closure.
 *
 * The reuse policy walks that closure to prove a gate reads nothing it did not
 * declare, so the entry point must come from the same declaration as the
 * command that runs it.
 */
export function shipGateEntry(gate) {
  return gate.args[0];
}
