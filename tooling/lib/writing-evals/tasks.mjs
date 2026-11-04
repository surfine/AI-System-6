// Loads the writing-eval suite: tests/evals/writing/{suite.json,tasks/*/task.json}.
// A task is Inspect's "sample": the input files, the prompt, the scorer spec.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { SCORERS } from "./scorers.mjs";

// fileURLToPath, not URL.pathname: a checkout under a path with a space
// ("AI System 6") leaves %20 encoded in .pathname and every read ENOENTs.
export const suiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "tests", "evals", "writing");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const isText = (buf) => !buf.includes(0);

export function loadSuite(root = suiteRoot) {
  const suite = readJson(path.join(root, "suite.json"));
  const rubric = readJson(path.join(root, "rubric.json"));
  const tasks = fs.readdirSync(path.join(root, "tasks")).sort()
    .filter((d) => fs.existsSync(path.join(root, "tasks", d, "task.json")))
    .map((d) => loadTask(root, d, suite));
  return { root, suite, rubric, tasks };
}

export function loadTask(root, dir, suite) {
  const base = path.join(root, "tasks", dir);
  const task = readJson(path.join(base, "task.json"));
  task.dir = dir;
  task.baseDir = base;
  task.level ||= "propose";
  task.folderName ||= suite.folderName;
  task.scorers = [...task.scorers, ...(suite.defaultScorers || []).filter((s) => !(task.skipDefaults || []).includes(s.id || s.type))];
  return task;
}

/** The task's input files as { path -> { bytes, text } }. */
export function materializeInputs(root, task) {
  const inputs = new Map();
  for (const f of task.files) {
    const bytes = fs.readFileSync(path.join(root, f.from));
    inputs.set(f.as, { bytes, text: isText(bytes) ? bytes.toString("utf8") : null, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
  }
  return inputs;
}

/** Write the inputs into a real folder (the folder the engine is granted). */
export function writeInputs(inputs, folder) {
  fs.mkdirSync(folder, { recursive: true });
  for (const [rel, { bytes }] of inputs) {
    const target = path.join(folder, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
}

/** Recorded outcome file (good.json / bad.json), with `replace` edits resolved against the inputs. */
export function loadRecorded(task, inputs, name) {
  const raw = readJson(path.join(task.baseDir, `${name}.json`));
  const changes = (raw.changes || []).map((c) => {
    if (!c.replace) return { path: c.path, kind: c.kind, text: c.text ?? null };
    let text = inputs.get(c.path)?.text;
    if (text == null) throw new Error(`${task.id}/${name}: replace on ${c.path}, which is not a text input`);
    for (const { from, to } of c.replace) {
      if (text.split(from).length !== 2) throw new Error(`${task.id}/${name}: "${from.slice(0, 30)}" must occur exactly once in ${c.path}`);
      text = text.replace(from, () => to);
    }
    return { path: c.path, kind: c.kind || "modified", text };
  });
  return { raw, outcome: { answer: raw.answer || "", changes, proposals: raw.proposals || [] } };
}

/** Structural checks on one task; returns a list of problems (empty = fine). */
export function validateTask(root, task, rubricDoc) {
  const problems = [];
  const need = (cond, msg) => { if (!cond) problems.push(`${task.id}: ${msg}`); };
  for (const key of ["id", "title", "kind", "prompt", "files", "scorers", "rubric"]) need(task[key] !== undefined, `missing ${key}`);
  need(task.id === task.dir, "id must equal its directory name");
  need(["read", "propose", "change"].includes(task.level), "bad level");
  need((task.prompt || "").length > 20 && task.prompt.length < 20000, "prompt length");
  const names = new Set();
  for (const f of task.files || []) {
    need(fs.existsSync(path.join(root, f.from)), `input ${f.from} is missing`);
    need(!names.has(f.as), `duplicate input ${f.as}`);
    names.add(f.as);
  }
  const ids = new Set();
  for (const [i, s] of (task.scorers || []).entries()) {
    need(!!SCORERS[s.type], `scorer ${i + 1} has unknown type ${s.type}`);
    const id = s.id || `${s.type}#${i + 1}`;
    need(!ids.has(id), `duplicate scorer id ${id}`);
    ids.add(id);
  }
  for (const c of task.rubric?.criteria || []) need(rubricDoc.criteria[c], `unknown rubric criterion ${c}`);
  for (const name of ["good", "bad"]) need(fs.existsSync(path.join(task.baseDir, `${name}.json`)), `${name}.json is missing`);
  return problems;
}
