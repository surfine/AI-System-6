// One scheduler for the ship gates, shared by the release and by the
// developer's banking run.
//
// Two properties decide the plan, and both belong to the gate rather than to
// whoever is running it:
//
//   `quiet` — the gate compares pixels, so a second browser on this machine can
//   change what it photographs. A quiet gate runs alone.
//
//   `costHintMs` — the last measured wall clock, used only to order the queue.
//   A stale hint costs ordering, never correctness.
//
// The queue puts the cheap gates in front of the expensive ones, so a run that
// is going to fail says so in seconds instead of minutes, and it runs the
// non-quiet gates together: they photograph nothing, so sharing the machine
// costs them overlap and buys back the wall clock. Receipt reuse does not
// change any of this — a reused gate is decided before the plan is built, so it
// costs nothing and never delays a runnable one.
//
// verify-ship.mjs and verify-gate.mjs both call this, so a release and the
// banking run that feeds it cannot disagree about what runs when.

/** Split the gates that must run into the lanes they run in. */
export function lanePlan(gates) {
  const byCost = (left, right) => (left.costHintMs || 0) - (right.costHintMs || 0);
  const quietChecks = gates.filter((gate) => gate.quiet).sort(byCost);
  const sharedChecks = gates.filter((gate) => !gate.quiet).sort(byCost);
  // The cheap pixel gates come first because they are the cheapest way to learn
  // the run is not going to happen. A quiet gate is put AFTER the shared block
  // only when it costs more than the longest gate in that block, because only
  // then does waiting buy any overlap.
  //
  // The rule used to be "the last quiet gate goes last", which is the same
  // answer while every gate runs and the wrong one as soon as receipts are
  // spent: with only the 8-second token check left to run, it was queued behind
  // two minutes of shared browser work it could have refused the release
  // before.
  const sharedCeilingMs = sharedChecks.reduce((most, gate) => Math.max(most, gate.costHintMs || 0), 0);
  return {
    cheapQuiet: quietChecks.filter((gate) => (gate.costHintMs || 0) <= sharedCeilingMs),
    shared: sharedChecks,
    expensiveQuiet: quietChecks.filter((gate) => (gate.costHintMs || 0) > sharedCeilingMs),
  };
}

/** The plan in the words a log prints: `a → (b + c) → d`. */
export function describeLanes(plan) {
  return [
    ...plan.cheapQuiet.map((gate) => gate.name),
    ...(plan.shared.length ? [`(${plan.shared.map((gate) => gate.name).join(" + ")})`] : []),
    ...plan.expensiveQuiet.map((gate) => gate.name),
  ].join(" → ");
}

/** Every gate the plan will run, in the order it runs them. */
export function lanesInOrder(plan) {
  return [...plan.cheapQuiet, ...plan.shared, ...plan.expensiveQuiet];
}

// A gate that shares the machine cannot also share the terminal: interleaved
// stdio makes two failures unreadable. So a shared gate's output is held and
// printed whole, under its own name, the moment it ends.
export function collectHeldOutput(child) {
  return new Promise((resolvePromise) => {
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    child.on("error", (error) => {
      chunks.push(Buffer.from(`\n[gate-lanes] the gate could not start: ${error.message}\n`));
      resolvePromise({ output: Buffer.concat(chunks).toString("utf8"), exitCode: 1 });
    });
    child.on("close", (code) => resolvePromise({
      output: Buffer.concat(chunks).toString("utf8"),
      exitCode: code === null ? 1 : code,
    }));
  });
}

/**
 * Run the plan.
 *
 * `execute(gate, { holdOutput })` starts one gate and resolves `{ exitCode,
 * durationMs, output }`. With `holdOutput` false the child is wired to this
 * terminal and the caller may ignore `output`; with it true the caller captures
 * the child's streams into `output` (see `collectHeldOutput`).
 */
export async function runLanes(plan, { label, execute }) {
  const outcomes = new Map();
  for (const gate of plan.cheapQuiet) {
    process.stdout.write(`\n[${label}] ${gate.name} …\n`);
    outcomes.set(gate.name, await execute(gate, { holdOutput: false }));
  }
  if (plan.shared.length) {
    const names = plan.shared.map((gate) => gate.name).join(", ");
    process.stdout.write(`\n[${label}] ${names} … (sharing the machine, output held until each ends)\n`);
    const shared = await Promise.all(plan.shared.map((gate) => execute(gate, { holdOutput: true })));
    plan.shared.forEach((gate, index) => {
      process.stdout.write(`\n[${label}] ——— ${gate.name} ———\n${shared[index].output ?? ""}`);
      outcomes.set(gate.name, shared[index]);
    });
  }
  for (const gate of plan.expensiveQuiet) {
    process.stdout.write(`\n[${label}] ${gate.name} …\n`);
    outcomes.set(gate.name, await execute(gate, { holdOutput: false }));
  }
  return outcomes;
}
