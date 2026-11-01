// Adoption-doctrine gate: ledger integrity + stage artifacts on disk.
// 引进消化吸收再创新的执行门（中文说明见 internal/operations/ADOPTION.zh-CN.md）。
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const oks = [];
const ok = (message) => oks.push(message);
const fail = (message) => failures.push(message);
const exists = (relative) => existsSync(join(repoRoot, relative));

const ledger = JSON.parse(readFileSync(join(repoRoot, "internal/operations/ADOPTION-LEDGER.json"), "utf8"));
if (ledger.schemaVersion !== 1 || ledger.kind !== "adoption-ledger") {
  fail("ledger schema/kind invalid");
}
if (!Array.isArray(ledger.upstreams) || ledger.upstreams.length < 4) {
  fail(`ledger upstreams too few: ${ledger.upstreams?.length}`);
}

const STAGES = ["introduce-candidate", "introduce", "digest", "absorb", "re-innovate"];

for (const upstream of ledger.upstreams) {
  const id = String(upstream.id || "(no id)");
  if (!STAGES.includes(upstream.stage)) fail(`${id}: stage '${upstream.stage}' is not a lifecycle stage`);
  if (typeof upstream.license !== "string" || !upstream.license) fail(`${id}: licence missing`);
  if (upstream.installed !== true && upstream.installed !== false) fail(`${id}: installed flag missing`);
  if (upstream.installed === false) {
    if (typeof upstream.exitCriteria !== "string" || !upstream.exitCriteria) fail(`${id}: exit criteria missing (candidate)`);
    continue;
  }
  if (!upstream.installed) fail(`${id}: installed must be a boolean true`);
  const digestNote = String(upstream.digest?.baseline || upstream.digest?.note || "");
  if (!digestNote) fail(`${id}: digest baseline missing`);
  const contracts = Array.isArray(upstream.absorb?.contracts) ? upstream.absorb.contracts : [];
  const wiring = String(upstream.absorb?.wiring || "");
  if (!contracts.length && !wiring) fail(`${id}: absorb stage empty`);
  for (const contract of contracts) {
    const asFile = join("tests/features", `${String(contract)}.test.mjs`);
    if (!exists(asFile) && !exists(String(contract))) fail(`${id}: contract not found on disk: ${contract}`);
  }
  if (typeof upstream.exitCriteria !== "string" || !upstream.exitCriteria) fail(`${id}: exit criteria missing`);
}

for (const doc of ["internal/operations/ADOPTION.zh-CN.md", "internal/operations/ADOPTION.md"]) {
  if (!exists(doc)) fail(`${doc} missing`);
  else if (!readFileSync(join(repoRoot, doc), "utf8").includes("verify:adoption")) fail(`${doc} does not name the gate`);
}
if (typeof pkg_scripts()["verify:adoption"] !== "string") fail("package.json lacks verify:adoption");

function pkg_scripts() {
  try {
    return JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).scripts || {};
  } catch {
    return {};
  }
}

if (ledger.upstreams.some((upstream) => upstream.id === "tinyjs" && upstream.installed)) {
  const baseline = spawnSync(process.execPath, ["tooling/verify-tinyjs-baseline.mjs"], { cwd: repoRoot, encoding: "utf8" });
  if (baseline.status !== 0) fail("tinyjs: fixed upstream SHA-256 baseline differs");
  else ok("tinyjs: fixed upstream bytes match the recorded baseline");
}

if (failures.length) {
  failures.forEach((failure) => console.error(`NO  adoption-doctrine: ${failure}`));
  console.error(`\nadoption-doctrine gate failed: ${failures.length} issue(s).`);
  process.exit(1);
}
oks.forEach((message) => console.log(`OK  adoption-doctrine: ${message}`));
console.log("\nadoption-doctrine gate passed.");
