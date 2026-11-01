// Reducers and the printed report. Inspect's epochs + reducers, in plain JS:
//   pass^k  = every epoch passed (Inspect: at_least_k with k = epochs)
//   pass@k  = at least one epoch passed (shown for reference only)
//   mean    = share of epochs that passed

export function reduceTask(epochs) {
  const n = epochs.length;
  const passes = epochs.filter((e) => e.pass).length;
  const failedChecks = {};
  for (const e of epochs) for (const c of [...(e.deterministic?.checks || []), ...(e.rubric?.checks || [])]) if (!c.pass) failedChecks[c.id] = (failedChecks[c.id] || 0) + 1;
  return {
    epochs: n,
    passes,
    passK: n > 0 && passes === n,
    passAtK: passes > 0,
    mean: n ? passes / n : 0,
    infraErrors: epochs.filter((e) => e.status === "infra_error").length,
    failedChecks,
    wallMsMean: n ? epochs.reduce((a, e) => a + (e.wallMs || 0), 0) / n : 0,
    ctxTokensMean: n ? epochs.reduce((a, e) => a + (e.usage?.used || 0), 0) / n : 0,
  };
}

export function reduceAll(byTask) {
  const rows = Object.entries(byTask).map(([id, epochs]) => ({ id, ...reduceTask(epochs) }));
  const all = rows.flatMap((r) => byTask[r.id]);
  return {
    rows,
    tasks: rows.length,
    passKTasks: rows.filter((r) => r.passK).length,
    passAtKTasks: rows.filter((r) => r.passAtK).length,
    epochPassRate: all.length ? all.filter((e) => e.pass).length / all.length : 0,
    infraErrors: rows.reduce((a, r) => a + r.infraErrors, 0),
    wallMsTotal: all.reduce((a, e) => a + (e.wallMs || 0), 0),
    ctxTokensTotal: all.reduce((a, e) => a + (e.usage?.used || 0), 0),
    runs: all.length,
  };
}

const pct = (x) => `${(x * 100).toFixed(0)}%`;
const secs = (ms) => `${(ms / 1000).toFixed(0)}s`;

export function formatReport(summary, { k, usdPerMtok } = {}) {
  const lines = [];
  lines.push(`task`.padEnd(36) + `pass^${k}`.padEnd(8) + `epochs`.padEnd(8) + `mean`.padEnd(6) + `wall`.padEnd(7) + `ctx tok`.padEnd(9) + `failed checks`);
  for (const r of summary.rows) {
    const failed = Object.entries(r.failedChecks).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => `${id}×${n}`).join(", ");
    lines.push(
      r.id.padEnd(36) + (r.passK ? "PASS" : "fail").padEnd(8) + `${r.passes}/${r.epochs}`.padEnd(8) + pct(r.mean).padEnd(6) +
      secs(r.wallMsMean).padEnd(7) + String(Math.round(r.ctxTokensMean)).padEnd(9) + (failed || "-") + (r.infraErrors ? `  [${r.infraErrors} infra]` : ""),
    );
  }
  lines.push("");
  lines.push(`pass^${k}: ${summary.passKTasks}/${summary.tasks} tasks (${pct(summary.passKTasks / Math.max(1, summary.tasks))}); epoch pass rate ${pct(summary.epochPassRate)}; pass@${k} (reference): ${summary.passAtKTasks}/${summary.tasks}`);
  lines.push(`runs: ${summary.runs}; wall time ${secs(summary.wallMsTotal)}; context tokens at end of run, summed: ${summary.ctxTokensTotal}` + (usdPerMtok ? ` (proxy ≈ $${((summary.ctxTokensTotal / 1e6) * usdPerMtok).toFixed(2)} at $${usdPerMtok}/Mtok; real billing re-sends context each turn, so this understates)` : ""));
  if (summary.infraErrors) lines.push(`infra errors: ${summary.infraErrors} (engine failure or timeout, counted as failed; rerun with --resume <dir>)`);
  return lines.join("\n");
}

export function compareSummaries(a, b, k) {
  const byId = (s) => Object.fromEntries(s.rows.map((r) => [r.id, r]));
  const A = byId(a);
  const B = byId(b);
  const lines = [`task`.padEnd(36) + `A pass^${k}`.padEnd(11) + `B pass^${k}`.padEnd(11) + `change`];
  for (const id of [...new Set([...Object.keys(A), ...Object.keys(B)])].sort()) {
    const x = A[id]?.passK;
    const y = B[id]?.passK;
    const change = x === y ? "" : x ? "REGRESSION" : "improved";
    lines.push(id.padEnd(36) + String(x === undefined ? "-" : x ? "PASS" : "fail").padEnd(11) + String(y === undefined ? "-" : y ? "PASS" : "fail").padEnd(11) + change);
  }
  lines.push("", `A: ${a.passKTasks}/${a.tasks}   B: ${b.passKTasks}/${b.tasks}`);
  return lines.join("\n");
}
