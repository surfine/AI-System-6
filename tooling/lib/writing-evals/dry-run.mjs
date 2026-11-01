// Dry run: no engine, no model, no network. Checks that the suite is whole and
// that every task's deterministic scorers separate its recorded good answer
// from its recorded bad one. Also exercises the reducers and the rubric prompt.

import { loadSuite, materializeInputs, loadRecorded, validateTask } from "./tasks.mjs";
import { scoreOutcome } from "./scorers.mjs";
import { reduceTask, reduceAll } from "./report.mjs";
import { buildRubricPrompt, parseRubricReply, rubricCriteriaFor } from "./rubric.mjs";

export function dryRun(root) {
  const loaded = loadSuite(root);
  const { suite, rubric, tasks } = loaded;
  const problems = [];
  const rows = [];
  const ids = new Set();
  for (const task of tasks) {
    if (ids.has(task.id)) problems.push(`duplicate task id ${task.id}`);
    ids.add(task.id);
    const taskProblems = validateTask(loaded.root, task, rubric);
    problems.push(...taskProblems);
    if (taskProblems.length) continue;
    const inputs = materializeInputs(loaded.root, task);
    const row = { id: task.id, kind: task.kind };
    for (const name of ["good", "bad"]) {
      const { raw, outcome } = loadRecorded(task, inputs, name);
      const result = scoreOutcome({ task, inputs, outcome }, task.scorers);
      row[name] = { ...result, failed: result.checks.filter((c) => !c.pass), expectFail: raw.expectFail || [] };
    }
    if (!row.good.pass) problems.push(`${task.id}: the good answer fails ${row.good.failed.map((c) => `${c.id} (${c.detail})`).join("; ")}`);
    if (row.bad.pass) problems.push(`${task.id}: the bad answer passes every deterministic scorer`);
    if (!row.bad.expectFail.length) problems.push(`${task.id}: bad.json must name the scorer ids it is meant to fail in expectFail`);
    for (const id of row.bad.expectFail) if (!row.bad.failed.some((c) => c.id === id)) problems.push(`${task.id}: the bad answer was meant to fail ${id} but did not`);
    // The rubric prompt must build and its reply parser must fail closed.
    const criteria = rubricCriteriaFor(task, rubric);
    const prompt = buildRubricPrompt({ task, inputs, outcome: loadRecorded(task, inputs, "good").outcome, criteria, rubricDoc: rubric });
    if (!criteria.length || !prompt.includes(task.prompt)) problems.push(`${task.id}: rubric prompt did not build`);
    if (parseRubricReply("not json", criteria).some((c) => c.pass)) problems.push(`${task.id}: unparseable grader reply must fail`);
    rows.push(row);
  }
  // Reducer self-test: one epoch fails -> pass^4 false, mean 0.75, pass@4 true.
  const flaky = reduceTask([{ pass: true }, { pass: true }, { pass: false }, { pass: true }]);
  if (flaky.passK || !flaky.passAtK || flaky.mean !== 0.75) problems.push("reducer: pass^k must need every epoch");
  if (!reduceTask([{ pass: true }, { pass: true }]).passK) problems.push("reducer: all-pass epochs must give pass^k");
  const all = reduceAll({ a: [{ pass: true }], b: [{ pass: false }] });
  if (all.passKTasks !== 1) problems.push("reducer: overall count wrong");
  if (tasks.length < (suite.minTasks || 20)) problems.push(`only ${tasks.length} tasks, the suite needs ${suite.minTasks || 20}`);
  for (const kind of suite.requiredKinds || []) if (!tasks.some((t) => t.kind === kind)) problems.push(`no task of kind ${kind}`);
  return { loaded, rows, problems };
}
