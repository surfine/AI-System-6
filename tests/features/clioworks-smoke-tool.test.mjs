// The fresh-boot ClioWorks smoke (tooling/clioworks-smoke.mjs) is a TOOL, run
// on demand — owner ruling D4 — never a release gate. This contract holds the
// tool to its own shape without running a browser: it executes the tool's pure
// half (tooling/lib/clioworks-smoke-plan.mjs — scene parsing and the step
// assertion table) in a vm, and reads the runner's source for the mechanics a
// fresh-boot smoke must and must not have: a fresh context that never touches
// the user's profile, its own fixture server on a free port, non-zero exit on
// a failed assertion. The known-broken surfaces the evaluation walk found
// (2026-10-29-clioworks-second-draft Findings board) each have a named
// assertion here, so deleting the assertion the surface needs is a contract
// failure, not a silent softening. And because D4 says ON DEMAND, the last
// check is a negative one: no verify-release*.mjs may reference the tool.

import vm from "node:vm";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-smoke-tool");

const PLAN_FILE = "tooling/lib/clioworks-smoke-plan.mjs";
const TOOL_FILE = "tooling/clioworks-smoke.mjs";
const planSource = readFileSync(join(root, PLAN_FILE), "utf8");
const toolSource = readFileSync(join(root, TOOL_FILE), "utf8");

/* ------------------------------------------------ the plan, run in a vm */
// The plan module is ESM; a vm script wants the same declarations without the
// export keywords, plus one line that hands the helpers to the sandbox.
const planScript = planSource.replace(/^export\s+/gm, "")
  + "\n;globalThis.__smokePlan = { SMOKE_SCENES, MODAL_RACE_MS, ASSERTION_KINDS, STEPS, parseSceneArg, planFor, failureLine, assertionIsWellFormed };";
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(planScript, sandbox, { filename: PLAN_FILE });
const plan = sandbox.__smokePlan;

test.assert(Array.isArray(plan.SMOKE_SCENES) && plan.SMOKE_SCENES.length === 8,
  `the plan declares the 8 scenes (write chart stage reader route agent new phone): ${plan.SMOKE_SCENES?.join(" ")}`);
test.assert(JSON.stringify(plan.parseSceneArg([])) === JSON.stringify({ scenes: [...plan.SMOKE_SCENES], unknown: [] }),
  "an empty scene list means every scene, in the plan's order");
test.assert(plan.parseSceneArg(["write", "reader"]).scenes.join(" ") === "write reader",
  "named scenes run just those scenes");
const typo = plan.parseSceneArg(["wriet"]);
test.assert(typo.scenes.length === 0 && typo.unknown.join(" ") === "wriet",
  "a typo'd scene name is reported as unknown, never silently run as nothing");

/* The assertion table: every step asserts something visible. */
const ids = new Set();
let tableProblems = [];
for (const step of plan.STEPS) {
  if (ids.has(step.id)) tableProblems.push(`duplicate step id ${step.id}`);
  ids.add(step.id);
  if (!plan.SMOKE_SCENES.includes(step.scene)) tableProblems.push(`${step.id}: unknown scene ${step.scene}`);
  if (!["place", "command", "eval"].includes(step.kind)) tableProblems.push(`${step.id}: unknown kind ${step.kind}`);
  if (step.kind === "command" && !step.command) tableProblems.push(`${step.id}: command without a command id`);
  if (step.kind === "eval" && !step.eval) tableProblems.push(`${step.id}: eval without an eval name`);
  if (!plan.assertionIsWellFormed(step.assert)) tableProblems.push(`${step.id}: assertion is not well-formed (${JSON.stringify(step.assert)})`);
}
test.assert(!tableProblems.length && plan.STEPS.length >= 20,
  tableProblems.length ? `the step table is broken: ${tableProblems.join("; ")}` : `all ${plan.STEPS.length} steps carry a well-formed visible assertion`);

const stepById = new Map(plan.STEPS.map((step) => [step.id, step]));
const find = (id) => String(stepById.get(id)?.assert?.find || "");
const hasStep = (id, needle, why) => test.assert(find(id).includes(needle), `${id}: ${why} (find: ${find(id) || "none"})`);

/* The five breaks the evaluation walk found, each with its named assertion. */
hasStep("reader-organize", ".reader-organize-frame canvas", "整理 asserts page thumbnails");
test.assert(String(stepById.get("reader-organize")?.assert?.absent || "").includes("reader-pages-note"),
  "整理 also asserts the loading note 「正在打开整理页面…」 is gone");
hasStep("chart-dialog", "svg rect", "制图 asserts the preview renders SVG bars");
hasStep("stage-present", "clio-stage-show", "放映 asserts the show overlay exists");
hasStep("write-find", "clioworks-find-status", "查找 asserts the windoid status line");
test.assert(stepById.get("write-find")?.assert?.empty === true,
  "查找 asserts the status is EMPTY before the writer typed (no premature 「找不到」)");
test.assert(stepById.get("phone-find")?.assert?.empty === true && find("phone-find").includes("clioworks-find-status"),
  "the phone pass holds find to the same empty-status rule");
/* S6 (Refusal board ⑤): the phone pass, upright and sideways, each rule with its named step. */
const phoneIds = plan.planFor(["phone"]).map((step) => step.id).join(" ");
test.assert(phoneIds === "phone-open phone-no-side-scroll phone-table-frame phone-pages-refused phone-find phone-find-drawer phone-rail-sheet phone-landscape phone-landscape-table phone-landscape-find phone-landscape-rail",
  `the phone scene walks upright then sideways: ${phoneIds}`);
hasStep("phone-no-side-scroll", "data-smoke-side-scroll=\"none\"", "the upright page never scrolls sideways");
hasStep("phone-landscape", "data-smoke-side-scroll=\"none\"", "nor does the sideways page");
hasStep("phone-table-frame", ".cw-table-frame[data-smoke-scrolls=\"yes\"] + .cw-table-hint", "the wide table scrolls in its own frame, the hint under it");
test.assert(stepById.get("phone-table-frame")?.assert?.text === "← 表格可横向滑动 →", "the hint reads 「← 表格可横向滑动 →」");
hasStep("phone-pages-refused", "data-view=\"flow\"", "页面视图 is refused on a phone");
hasStep("phone-find-drawer", ".is-drawer[data-smoke-leaves-text=\"yes\"]", "查找 is a drawer that leaves the text in view");
hasStep("phone-rail-sheet", "data-smoke-rail=\"sheet\"", "the upright rail is a sheet over the lower half");
hasStep("phone-landscape-rail", "data-smoke-rail=\"beside\"", "the sideways rail stands beside the text");
hasStep("write-mailmerge", "mm-source-workbook", "邮件合并 asserts the first source radio has a label");
test.assert(stepById.get("write-mailmerge")?.assert?.pattern === "\\S",
  "邮件合并's radio label must be non-blank text, not merely present");

/* Modal commands are raced, never awaited; the plan owns the race length.
   放映 is one too: the show holds the desk until Esc, and 总览 is grey under it. */
const modalSteps = plan.STEPS.filter((step) => step.modal);
test.assert(modalSteps.map((s) => s.id).join(" ") === "write-find write-mailmerge chart-dialog chart-paste-function stage-present route-send new-dialog phone-find",
  `the steps that open a modal are marked modal (raced, never awaited): ${modalSteps.map((s) => s.id).join(" ")}`);
test.assert(typeof plan.MODAL_RACE_MS === "number" && plan.MODAL_RACE_MS === 2500,
  `MODAL_RACE_MS is the 2.5 s race the walk used (got ${plan.MODAL_RACE_MS})`);

test.assert(plan.planFor(["reader"]).every((step) => step.scene === "reader") && plan.planFor(["reader"]).length === 2,
  "planFor picks one scene's steps and nothing else");
test.assert(plan.failureLine({ id: "reader-organize", detail: "x" }).startsWith("FAIL reader-organize"),
  "failureLine prints one FAIL line per failed step, as the tool does");

/* ------------------------------------------------- the runner's mechanics */
test.assert(toolSource.includes("chromium.launch()") && !/launchPersistentContext/.test(toolSource),
  "the runner launches its own headless Chromium and never a persistent (user-profile) context");
test.assert((toolSource.match(/chromium\.launch\(/g) || []).length === 1,
  "the runner launches exactly one browser for the whole run");
test.assert(toolSource.includes('process.env.APP_URL || "http://localhost:4173/"'),
  "the desk address comes from APP_URL, defaulting to the npm start port 4173");
test.assert(toolSource.includes('listen(0') && !toolSource.includes("4199"),
  "the fixture server binds a free port, no hard-coded 4199");
test.assert(toolSource.includes('locale: "zh-CN"'),
  "the fresh context is zh-CN, the language the desk ships in");
test.assert(toolSource.includes('"dist", "smoke"'),
  "screenshots and the report land in dist/smoke/ (git-ignored)");
test.assert(toolSource.includes("process.exitCode = 1"),
  "a failed step exits non-zero");
test.assert(toolSource.includes('import vm from') === false,
  "the runner itself needs no vm: the contract runs the pure half");

/* ------------------------------------------------- on demand, never a gate */
const releaseGates = readdirSync(join(root, "tooling")).filter((name) => /^verify-release.*\.mjs$/.test(name));
test.assert(releaseGates.length >= 1, `found the release gate files: ${releaseGates.join(", ")}`);
const referencing = releaseGates.filter((name) => readFileSync(join(root, "tooling", name), "utf8").includes("clioworks-smoke"));
test.assert(referencing.length === 0,
  referencing.length ? `D4 says on demand, but ${referencing.join(", ")} reference the smoke tool` : "no verify-release*.mjs references the smoke tool (D4: run on demand, not in the release gate)");

test.finish();
