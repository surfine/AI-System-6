#!/usr/bin/env node
// Writing evals for Clio: about 20 real writing/editing tasks, each run N
// times (default 4); a task passes only if every epoch passes (pass^4).
// Used to choose the default engine and to catch regressions after a prompt
// or engine change. Concepts borrowed from Inspect AI (task, sample, scorer,
// epochs, logs); no Python dependency.
//
//   node tooling/eval-writing.mjs --dry-run                     no model, no spend
//   node tooling/eval-writing.mjs --list
//   node tooling/eval-writing.mjs --engine deepseek --yes-spend [--model m] [--epochs 4]
//        [--tasks id,id] [--kind k] [--timeout-min 15] [--rubric --grader-model m[,m]]
//        [--usd-per-mtok n] [--out dir] [--resume dir]
//   node tooling/eval-writing.mjs --rescore dist/evals/<ts>     re-score stored trajectories, offline
//   node tooling/eval-writing.mjs --compare dist/evals/<a> dist/evals/<b>
//
// Real runs spend money, so they refuse to start without an explicit
// --engine AND --yes-spend. Logs: dist/evals/<timestamp>/ (git-ignored).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { suiteRoot, loadSuite, materializeInputs, writeInputs } from "./lib/writing-evals/tasks.mjs";
import { scoreOutcome } from "./lib/writing-evals/scorers.mjs";
import { reduceAll, formatReport, compareSummaries } from "./lib/writing-evals/report.mjs";
import { buildRubricPrompt, parseRubricReply, rubricCriteriaFor, gradeWithModel } from "./lib/writing-evals/rubric.mjs";
import { dryRun } from "./lib/writing-evals/dry-run.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i < 0 ? d : args[i + 1]; };
const die = (msg, code = 2) => { console.error(msg); process.exit(code); };

if (has("--help") || has("-h")) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 21).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}

function pickTasks(tasks) {
  const ids = val("--tasks", "") ? val("--tasks").split(",") : null;
  const kind = val("--kind", "");
  const chosen = tasks.filter((t) => (!ids || ids.includes(t.id)) && (!kind || t.kind === kind));
  for (const id of ids || []) if (!tasks.some((t) => t.id === id)) die(`unknown task ${id}`);
  if (!chosen.length) die("no task selected");
  return chosen;
}

function scoreEpoch(task, inputs, record) {
  const outcome = { answer: record.answer || "", changes: record.changes || [], proposals: record.proposals || [] };
  const deterministic = scoreOutcome({ task, inputs, outcome }, task.scorers);
  return { deterministic, outcome };
}

async function rubricFor(loaded, task, inputs, outcome, graderModels, apiKey) {
  const criteria = rubricCriteriaFor(task, loaded.rubric);
  const prompt = buildRubricPrompt({ task, inputs, outcome, criteria, rubricDoc: loaded.rubric });
  const checks = [];
  for (const model of graderModels) {
    let reply = "";
    try { reply = await gradeWithModel({ prompt, model, apiKey }); } catch (error) { reply = `grader error: ${error.message}`; }
    for (const c of parseRubricReply(reply, criteria)) checks.push({ ...c, id: `${c.id}@${model}` });
  }
  return { pass: checks.every((c) => c.pass), checks };
}

function writeSummary(out, loaded, byTask, k, usd) {
  const summary = reduceAll(byTask);
  fs.writeFileSync(path.join(out, "summary.json"), `${JSON.stringify({ k, ...summary }, null, 2)}\n`);
  const text = formatReport(summary, { k, usdPerMtok: usd });
  fs.writeFileSync(path.join(out, "summary.md"), `\`\`\`\n${text}\n\`\`\`\n`);
  return text;
}

const readEpoch = (out, id, n) => {
  try { return JSON.parse(fs.readFileSync(path.join(out, "trajectories", id, `epoch-${n}.json`), "utf8")); } catch { return null; }
};

// ---- offline modes ---------------------------------------------------------

if (has("--list")) {
  for (const t of loadSuite().tasks) console.log(`${t.id.padEnd(36)} ${t.kind.padEnd(16)} ${t.level.padEnd(8)} ${t.title}`);
  process.exit(0);
}

if (has("--dry-run")) {
  const { rows, problems, loaded } = dryRun(suiteRoot);
  console.log("DRY RUN: no engine and no model were called. Each row scores the task's recorded good and bad answers with the deterministic scorers.\n");
  console.log("task".padEnd(36) + "checks".padEnd(8) + "good".padEnd(6) + "bad (failed ids)");
  for (const r of rows) console.log(r.id.padEnd(36) + String(r.good.checks.length).padEnd(8) + (r.good.pass ? "pass" : "FAIL").padEnd(6) + (r.bad.pass ? "PASS?!" : `fail (${r.bad.failed.map((c) => c.id).join(", ")})`));
  console.log(`\n${rows.length} tasks, ${rows.reduce((a, r) => a + r.good.checks.length, 0)} scorer runs on good answers; ${loaded.suite.defaultEpochs} epochs per task in a real run.`);
  if (problems.length) { console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`); process.exit(1); }
  console.log("dry run OK");
  process.exit(0);
}

if (has("--compare")) {
  const [a, b] = [val("--compare"), args[args.indexOf("--compare") + 2]];
  if (!a || !b) die("--compare needs two run directories");
  const A = JSON.parse(fs.readFileSync(path.join(a, "summary.json"), "utf8"));
  const B = JSON.parse(fs.readFileSync(path.join(b, "summary.json"), "utf8"));
  console.log(compareSummaries(A, B, A.k));
  process.exit(0);
}

if (has("--rescore")) {
  const dir = path.resolve(val("--rescore"));
  const loaded = loadSuite();
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8"));
  const byTask = {};
  for (const task of loaded.tasks) {
    const inputs = materializeInputs(loaded.root, task);
    for (let n = 1; n <= meta.epochs; n += 1) {
      const rec = readEpoch(dir, task.id, n);
      if (!rec) continue;
      const { deterministic } = scoreEpoch(task, inputs, rec);
      const pass = rec.status === "ok" && deterministic.pass && (!rec.rubric || rec.rubric.pass);
      Object.assign(rec, { deterministic, pass });
      fs.writeFileSync(path.join(dir, "trajectories", task.id, `epoch-${n}.json`), `${JSON.stringify(rec, null, 1)}\n`);
      (byTask[task.id] ||= []).push(rec);
    }
  }
  console.log(writeSummary(dir, loaded, byTask, meta.epochs, meta.usdPerMtok));
  process.exit(0);
}

// ---- real runs -------------------------------------------------------------

const engine = val("--engine", "");
if (!engine) die("Refusing to run: pass --engine <deepseek|anthropic|lmstudio>. Real runs call a model and cost money. (Use --dry-run to check the suite with no model.)");
if (!has("--yes-spend")) {
  const loaded = loadSuite();
  const n = pickTasks(loaded.tasks).length * Number(val("--epochs", loaded.suite.defaultEpochs));
  die(`Refusing to run: ${n} real Clio runs on engine "${engine}" would spend money. Pass --yes-spend to go ahead.`);
}
const epochs = Math.max(1, Number(val("--epochs", 0)) || loadSuite().suite.defaultEpochs);
const model = val("--model", "");
const graderModels = has("--rubric") ? (val("--grader-model", "") || die("--rubric needs --grader-model <model[,model]>")).split(",") : [];
const usd = Number(val("--usd-per-mtok", 0)) || 0;
const timeoutMs = (Number(val("--timeout-min", 15)) || 15) * 60_000;

const loaded = loadSuite();
const tasks = pickTasks(loaded.tasks);
const out = path.resolve(val("--resume") || val("--out") || path.join(repo, "dist", "evals", new Date().toISOString().replace(/[:.]/g, "-")));
fs.mkdirSync(path.join(out, "trajectories"), { recursive: true });
const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim();
fs.writeFileSync(path.join(out, "run.json"), `${JSON.stringify({ engine, model: model || "(engine default)", epochs, tasks: tasks.map((t) => t.id), graderModels, usdPerMtok: usd, gitSha: sha, startedAt: new Date().toISOString() }, null, 2)}\n`);

let apiKey = process.env.ANTHROPIC_API_KEY || "";
if (graderModels.length && !apiKey) {
  const require = createRequire(import.meta.url);
  const vault = require("../apps/server/server/credential-vault.js");
  const { ANTHROPIC_BASE_URL } = require("../apps/server/server/anthropic-messages.js");
  apiKey = String(await vault.resolveCloudCredential({ credentialId: vault.createCredentialId("anthropic", ANTHROPIC_BASE_URL), provider: "anthropic", targetBaseUrl: ANTHROPIC_BASE_URL }) || "");
  if (!apiKey) die("the rubric grader needs ANTHROPIC_API_KEY or a Keychain Anthropic key");
}

const { createDriver } = await import("./lib/writing-evals/driver.mjs");
const driver = createDriver({ agentHome: path.join(out, "agent-home"), engine, model, timeoutMs, language: "zh-CN" });
console.log(`engine ${engine}${model ? ` (${model})` : ""}; ${tasks.length} tasks x ${epochs} epochs = ${tasks.length * epochs} runs; logs: ${out}`);

const byTask = {};
for (let n = 1; n <= epochs; n += 1) {
  for (const task of tasks) {
    const inputs = materializeInputs(loaded.root, task);
    let rec = readEpoch(out, task.id, n);
    if (!(rec && rec.status === "ok")) {
      const folder = path.join(out, "work", `${task.id}-e${n}`, task.folderName);
      writeInputs(inputs, folder);
      const startedAt = new Date().toISOString();
      rec = { task: task.id, epoch: n, engine, model: model || null, startedAt, ...(await driver.runEpoch(task, folder)) };
      fs.rmSync(path.join(out, "work", `${task.id}-e${n}`), { recursive: true, force: true });
    }
    const { deterministic, outcome } = scoreEpoch(task, inputs, rec);
    rec.deterministic = deterministic;
    if (rec.status === "ok" && graderModels.length && !rec.rubric) rec.rubric = await rubricFor(loaded, task, inputs, outcome, graderModels, apiKey);
    rec.pass = rec.status === "ok" && deterministic.pass && (!rec.rubric || rec.rubric.pass);
    fs.mkdirSync(path.join(out, "trajectories", task.id), { recursive: true });
    fs.writeFileSync(path.join(out, "trajectories", task.id, `epoch-${n}.json`), `${JSON.stringify(rec, null, 1)}\n`);
    (byTask[task.id] ||= []).push(rec);
    console.log(`epoch ${n} ${task.id.padEnd(36)} ${rec.pass ? "pass" : "FAIL"} ${rec.status !== "ok" ? `[${rec.error}]` : deterministic.checks.filter((c) => !c.pass).map((c) => c.id).join(",")} ${Math.round((rec.wallMs || 0) / 1000)}s`);
  }
}
console.log(`\n${writeSummary(out, loaded, byTask, epochs, usd)}\n\nlogs: ${out}`);
