// The gates a release must pass, declared once: eight that drive a browser and
// one CPU-only playthrough.
//
// verify-ship.mjs runs them as a queue; verify-gate.mjs runs one of them during
// development and banks the receipt. Both read this list, so a developer and a
// release always speak about the same gate with the same name and the same
// command.
//
// Which lane each gate runs in is `quiet` below, and the plan built from this
// list is tooling/lib/gate-lanes.mjs. One list, one plan, two callers.

export const SHIP_REQUIRED_CHECKS = Object.freeze([
  "theme-lab-regression",
  "appearance-real-apps",
  "bonsai-acceptance",
  "bonsai-playthrough",
  "eight-stop-walk",
  "appearance-phase5",
  "appearance-snapshot",
  "appearance-token-tables",
  "device-matrix",
]);

/**
 * Two properties decide when a gate may run, and they are the gate's own, not
 * the scheduler's guesswork:
 *
 * `quiet` — the gate's verdict depends on this machine being quiet. Pixels are
 * the common case (a concurrent backdrop-filter is not reproducible), and a
 * clock is the other one: a walk that waits for a window to appear times out on
 * a busy machine. A quiet gate runs alone, and the reason is written on it.
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
    // Geometry and reachability on a phone, at three real device sizes and in
    // both orientations. It photographs nothing, so another browser beside it
    // changes the clock and not the verdict.
    name: "device-matrix",
    args: ["tooling/verify-device-matrix.mjs"],
    // It photographs nothing and asserts no clock, so a neighbour once seemed
    // free. Measured 2026-09-15, beside the acceptance gate: one cell reported a
    // window that never opened (`iphone-duo-inner-landscape findChange opens
    // 0x0`), and the same cell passes on its own. The matrix carries its own
    // parallelism inside one gate (four cells, each with its own context) and
    // that is the whole of its budget; the lane stays alone.
    quiet: true,
    // Re-measured 2026-09-15, when the matrix stopped measuring one cell at a
    // time: nine cells, four at a time, is three waves of about 85-95s plus the
    // desk cells. The old one-at-a-time run cost 1055_000 here.
    costHintMs: 360_000,
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
    // The executable form of 「两小时试玩不卡壳」: a scripted mayor plays the
    // headless core to the population target with disasters, bonds,
    // ordinances, rewards, and the newspaper, and a stall is a refusal.
    // No browser; CPU only, so it runs alone to keep its clock honest.
    name: "bonsai-playthrough",
    args: ["tooling/play-bonsai-two-hours.mjs", "--quiet"],
    quiet: true,
    costHintMs: 90_000,
  },
  {
    // Behaviour AND the clock: twelve browser scenarios that assert what the
    // game does, and hold the frame rate and the long-task budget while they do
    // it. So it cannot share the machine — see the lane note above `quiet`.
    // Measured 2026-09-15: beside the parallel phone matrix it threw on
    // `classic-zh-phone` for a 150ms interaction long task, which is a
    // measurement of the four browsers painting next to it rather than of the
    // game. Alone it passes with the floors holding (5th-percentile 46.9-57.8
    // against floors of 42-55).
    //
    // It runs on the browser's own rasteriser rather than SwiftShader: the
    // scenarios, the FPS floors and the long-task contracts are unchanged, and
    // the gate's summary records which graphics path ran. Forcing software cost
    // a 128x128 city a sixty-second paint here (measured 2026-09-15) — a fact
    // about the CPU rasteriser, not about the game, since nobody plays sixteen
    // thousand tiles through one. On hardware all twelve scenarios pass.
    name: "bonsai-acceptance",
    args: ["tooling/verify-bonsai-acceptance.mjs", "--hardware"],
    quiet: true,
    costHintMs: 90_000,
  },
  {
    // The eight-stop live walk: a real browser clicks through Project Hard
    // Disk -> File Floppy -> Question Sheet -> Outline -> Section Drafts ->
    // Manuscript -> Review Desk -> Project CD on a clean profile, plus the
    // DTK demo disk restored through the real import path. A release cannot
    // proceed without this passing — see internal/operations/RELEASE.md.
    // It asserts what is on screen, never how it is painted — but it asserts it
    // through waits, and a machine carrying three other browsers does not
    // answer them in time. Measured 2026-09-15: alongside the parallel phone
    // matrix and the acceptance gate, each stop took 13-20s instead of 4-7s and
    // the Project CD export never landed before its 15s deadline. Alone, the
    // same run walks the whole route in 162s and passes. So it runs alone.
    name: "eight-stop-walk",
    args: ["tooling/verify-walk.mjs"],
    quiet: true,
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
