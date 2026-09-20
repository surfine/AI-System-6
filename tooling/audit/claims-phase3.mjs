// Claim scan for internal/agents/**, internal/operations/** and the root
// documents (phase 3). Same resolution rules as claims-phase2.mjs, plus a
// record/live split: handoffs, closeouts, release notes and the changelog are
// records, so only their references are checked, never their verdicts.
import { existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));
const scripts = pkg.scripts ?? {};

const docs = execFileSync("git", ["ls-files", "internal/agents", "internal/operations"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((path) => path.endsWith(".md") && !path.endsWith(".zh-CN.md"))
  .concat(["README.md", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md", "CODE_OF_CONDUCT.md", "ICON-LINEAGE-AUDIT.md"]);

const isRecord = (path) =>
  /HANDOFF|CLOSEOUT|RELEASE-NOTES|CHANGELOG|ICON-LINEAGE-AUDIT|GOLDEN-GATE|ICON-ERA/.test(path);

const findings = { unresolvedPath: [], missingScript: [], missingCommand: [], badLineRef: [], brokenLink: [], external: [] };
const anchors = ["", "apps/desktop/", "apps/desktop/app/", "apps/server/", "apps/server/server/", "tooling/", "tests/", "docs/", "internal/", "internal/archive/endfield/", "platform/"];

// This ledger quotes retired paths on purpose: naming what was wrong is its job.
const isLedger = (path) => path === "internal/agents/DOC-CLAIM-AUDIT.md";

function existsAny(candidates) {
  return candidates.some((candidate) => candidate && existsSync(`${root}/${candidate}`));
}

// Paths a document only ever means at run time, on a host, or inside a harness.
const runtimeProduced = [/^Resources\//, /^logs\//, /^release\//, /^probe\.mjs$/, /^scripts\//];
const isRuntimeOnly = (token) => runtimeProduced.some((pattern) => pattern.test(token.replace(/^\.\//, "")));

function resolvePath(doc, token) {
  const cleaned = token.replace(/^\.\//, "").replace(/[),.;:]+$/, "");
  if (/^(https?:|mailto:|#)/.test(cleaned)) return true;
  return existsAny([`${dirname(doc)}/${cleaned}`, cleaned, ...anchors.map((anchor) => `${anchor}${cleaned}`)]);
}

function lineCount(path) {
  return readFileSync(`${root}/${path}`, "utf8").split("\n").length;
}

for (const doc of docs) {
  const text = readFileSync(`${root}/${doc}`, "utf8");
  const kind = isRecord(doc) ? "record" : "live";

  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1].trim();
    const looksLikePath = /^[\w.@-]+(\/[\w.@-]+)+$/.test(token);
    if (!looksLikePath) continue;
    if (/^(npm run|git |node |python3 |http)/.test(token)) continue;
    if (isRecord(doc) || isLedger(doc)) continue;
    if (isRuntimeOnly(token)) continue;
    if (!resolvePath(doc, token)) findings.unresolvedPath.push(`${doc}: ${token}`);
  }

  for (const match of text.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
    if (typeof scripts[match[1]] !== "string") findings.missingScript.push(`${doc} (${kind}): npm run ${match[1]}`);
  }

  for (const match of text.matchAll(/(?:node|python3) ([A-Za-z0-9_./-]+\.(?:mjs|js|py))/g)) {
    if (isLedger(doc) || isRuntimeOnly(match[1])) continue;
    if (!resolvePath(doc, match[1])) findings.missingCommand.push(`${doc} (${kind}): ${match[0]}`);
  }

  for (const match of text.matchAll(/`?([\w./-]+\.(?:mjs|js|css|json|md|html|ts)):(\d+)/g)) {
    if (isLedger(doc)) continue;
    const [, path, line] = match;
    const target = [`${dirname(doc)}/${path}`, path, ...anchors.map((anchor) => `${anchor}${path}`)]
      .find((candidate) => candidate && existsSync(`${root}/${candidate}`) && statSync(`${root}/${candidate}`).isFile());
    if (!target) {
      findings.badLineRef.push(`${doc}: ${path}:${line} (no such file)`);
    } else if (lineCount(target) < Number(line)) {
      findings.badLineRef.push(`${doc}: ${path}:${line} (file has ${lineCount(target)} lines)`);
    }
  }

  for (const match of text.matchAll(/\]\((?!#)(?!https?:)([^)\s]+)/g)) {
    const target = match[1].split("#")[0];
    if (!target) continue;
    if (!existsAny([`${dirname(doc)}/${target}`, target])) findings.brokenLink.push(`${doc} -> ${target}`);
  }
}

// Claims that duplicate a repository constant or a removed artifact.
function claim(id, ok, detail) {
  findings.external.push({ id, ok, detail });
}

const runbook = readFileSync(`${root}/internal/operations/REPO-RUNBOOK.md`, "utf8");
const release = readFileSync(`${root}/internal/operations/RELEASE.md`, "utf8");
const lessons = readFileSync(`${root}/internal/agents/AGENT-LESSONS.md`, "utf8");
const contractCount = (spawnSync(process.execPath, ["tooling/verify-features.mjs", "--list"], { cwd: root, encoding: "utf8" }).stdout || "")
  .split("\n")
  .filter(Boolean).length;

claim("REPO-RUNBOOK.md's publish-state.json names a runtime producer, not a tracked file",
  /publish-state\.json/.test(runbook) && /publish-state/.test(readFileSync(`${root}/tooling/release-publish.mjs`, "utf8")),
  "tooling/release-publish.mjs writes it");
claim("AGENT-LESSONS.md's icon-continuity-report.json names its generator",
  /icon-continuity-report\.json/.test(lessons)
    && /build:icon-continuity-board/.test(lessons)
    && /icon-continuity-report/.test(readFileSync(`${root}/tooling/lib/generated-evidence.mjs`, "utf8")),
  "git-ignored evidence with a documented command, listed in generated-evidence.mjs");
claim("RELEASE.md's 253 contracts stays a historical clause",
  !/253 green executable-feature contracts/.test(release) || /once coexisted/.test(release),
  `runner lists ${contractCount} today`);
claim("release-only artifacts stay described as produced",
  /logs\/step-ledger\.json/.test(release) && /step-ledger/.test(readFileSync(`${root}/tooling/release-prepare.mjs`, "utf8")),
  "tooling/release-prepare.mjs writes the ledger");
const claudeFull = readFileSync(`${root}/internal/agents/CLAUDE.full.md`, "utf8");
const manifestBudget = (readFileSync(`${root}/tooling/runtime-manifest.mjs`, "utf8").match(/floppyBudgetBytes = ([\d_]+)/) || [])[1]?.replaceAll("_", "");
claim("CLAUDE.full.md quotes the manifest's floppy budget and no stale 'current total'",
  claudeFull.includes(`**${Number(manifestBudget).toLocaleString("en-US")} bytes**`.replace(",", ","))
    && !/2,911,000/.test(claudeFull)
    && !/\*\*2,949,120 bytes\*\*/.test(claudeFull),
  `manifest budget ${manifestBudget}`);
claim("runbook's browser-check section matches the post-suite world",
  !/Playwright suite/.test(runbook) || /suite is gone|instruments, not a suite/.test(runbook),
  "the suite was removed 2026-09-17");

console.log(`# phase-3 claim scan ${new Date().toISOString()}`);
console.log(`# documents: ${docs.length} (live ${docs.filter((doc) => !isRecord(doc)).length}, records ${docs.filter(isRecord).length})`);
for (const [kind, entries] of Object.entries(findings)) {
  if (kind === "external") continue;
  console.log(`\n## ${kind} (${entries.length})`);
  for (const entry of entries) console.log(`  ${entry}`);
}
console.log(`\n## claims`);
for (const entry of findings.external) console.log(`  ${entry.ok ? "OK " : "NO "} ${entry.id} -- ${entry.detail}`);
