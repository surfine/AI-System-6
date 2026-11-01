// Claim extraction for docs/** (phase 2 of the knowledge-layer audit).
// It does not judge prose: it resolves every path, command, file:line reference
// and relative link a document names, and re-checks the numeric claims that
// duplicate a repository constant. Run it after editing docs/**.
import { existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));
const scripts = pkg.scripts ?? {};

const docs = execFileSync("git", ["ls-files", "docs"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((path) => path.endsWith(".md") && !path.endsWith(".zh-CN.md"));

const findings = { unresolvedPath: [], missingScript: [], missingCommand: [], badLineRef: [], brokenLink: [], number: [] };

function existsAny(candidates) {
  return candidates.some((candidate) => existsSync(`${root}/${candidate}`));
}

function lineCount(path) {
  return readFileSync(`${root}/${path}`, "utf8").split("\n").length;
}

// Anchors let a document say `vite.config.js` when it means `apps/desktop/vite.config.js`.
const anchors = ["", "apps/desktop/", "apps/desktop/app/", "apps/server/", "apps/server/server/", "tooling/", "tests/", "docs/", "internal/"];

function resolvePath(doc, token) {
  const dir = dirname(doc);
  const cleaned = token.replace(/^\.\//, "").replace(/[),.;:]+$/, "");
  if (/^(https?:|mailto:|#)/.test(cleaned)) return true;
  const candidates = [`${dir}/${cleaned}`, cleaned, ...anchors.map((anchor) => `${anchor}${cleaned}`)];
  return existsAny(candidates.filter((candidate) => !candidate.includes("//")));
}

for (const doc of docs) {
  const text = readFileSync(`${root}/${doc}`, "utf8");

  // Backticked path-like tokens
  const tokens = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim());
  for (const token of tokens) {
    const looksLikePath = /^[\w.@-]+(\/[\w.@-]+)+$/.test(token) || /^(apps|tests|tooling|docs|internal|platform|functions|workers|site)\//.test(token);
    if (!looksLikePath) continue;
    if (/^(npm run|git |node |python3 |http)/.test(token)) continue;
    if (!resolvePath(doc, token)) findings.unresolvedPath.push(`${doc}: ${token}`);
  }

  // Commands the document tells a reader to run
  for (const match of text.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
    if (typeof scripts[match[1]] !== "string") findings.missingScript.push(`${doc}: npm run ${match[1]}`);
  }
  for (const match of text.matchAll(/(?:node|python3) ([A-Za-z0-9_./-]+\.(?:mjs|js|py))/g)) {
    const relative = resolvePath(doc, match[1]);
    if (!relative) findings.missingCommand.push(`${doc}: ${match[0]}`);
  }

  // path:line references
  for (const match of text.matchAll(/`?([\w./-]+\.(?:mjs|js|css|json|md|html|ts)):(\d+)/g)) {
    const [, path, line] = match;
    if (!resolvePath(doc, path)) {
      findings.badLineRef.push(`${doc}: ${path}:${line} (no such file)`);
      continue;
    }
    const target = [`${dirname(doc)}/${path}`, path, ...anchors.map((anchor) => `${anchor}${path}`)]
      .find((candidate) => candidate && existsSync(`${root}/${candidate}`) && statSync(`${root}/${candidate}`).isFile());
    if (target && lineCount(target) < Number(line)) {
      findings.badLineRef.push(`${doc}: ${path}:${line} (file has ${lineCount(target)} lines)`);
    }
  }

  // Relative markdown links
  for (const match of text.matchAll(/\]\((?!#)(?!https?:)([^)\s]+)/g)) {
    const target = match[1].split("#")[0];
    if (!target) continue;
    const candidates = [`${dirname(doc)}/${target}`, target];
    if (!existsAny(candidates.map((candidate) => candidate.replace(/\/$/, "/index.md")))) {
      findings.brokenLink.push(`${doc} -> ${target}`);
    }
  }
}

// Numeric claims that duplicate a repository constant
function numberCheck(id, ok, detail) {
  findings.number.push({ id, ok, detail });
}

const runnerList = spawnSync(process.execPath, ["tooling/verify-features.mjs", "--list"], { cwd: root, encoding: "utf8" });
const contractCount = (runnerList.stdout || "").split("\n").filter(Boolean).length;
const development = readFileSync(`${root}/docs/DEVELOPMENT.md`, "utf8");
const documentedCount = (development.match(/(\d+) at the last audit/) || [])[1];
numberCheck(
  "DEVELOPMENT:contract count names its source and matches",
  /verify-features\.mjs --list` prints the current\s+count/.test(development) && documentedCount === String(contractCount),
  `runner lists ${contractCount}; document says ${documentedCount ?? "none"}`
);

const bundleSizes = ["apps/desktop/app.bundle.js", "apps/desktop/styles.bundle.css"]
  .filter((path) => existsSync(`${root}/${path}`))
  .map((path) => `${path} ${statSync(`${root}/${path}`).size}`);
numberCheck(
  "DEVELOPMENT:pinned bundle bytes",
  !/app\.bundle\.js` \([\d,]+ B\)/.test(development),
  `measured now: ${bundleSizes.join(", ")}`
);

numberCheck(
  "DEVELOPMENT:deleted e2e spec reference",
  !/tests\/e2e\/scan-shadow\.spec\.mjs/.test(development),
  "the scan-shadow instrument is apps/desktop/app/core/persistence-scan-shadow.js"
);

const budget = Number((readFileSync(`${root}/tooling/runtime-manifest.mjs`, "utf8").match(/floppyBudgetBytes = ([\d_]+)/) || [])[1]?.replaceAll("_", ""));
numberCheck(
  "DEVELOPMENT:floppy budget literal",
  new RegExp(String(budget).replace(/(\d)(?=(\d{3})+$)/g, "$1,")).test(development) || !/\d,\d{3},\d{3} B for the whole core/.test(development),
  `runtime manifest budget ${budget}`
);

console.log(`# phase-2 claim scan ${new Date().toISOString()}`);
console.log(`# documents: ${docs.length}`);
for (const [kind, entries] of Object.entries(findings)) {
  if (kind === "number") continue;
  console.log(`\n## ${kind} (${entries.length})`);
  for (const entry of entries) console.log(`  ${entry}`);
}
console.log(`\n## numbers`);
for (const entry of findings.number) console.log(`  ${entry.ok ? "OK " : "NO "} ${entry.id} -- ${entry.detail}`);
