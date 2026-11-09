"use strict";
// Running a site's own checks (rule packages, G5/P2).
//
// Two kinds of package:
//   - the built-in generic package, judged in-process by the shared rule
//     runtime (apps/desktop/app/shared/rule-packages.js — the same file the
//     desk's checks panel loads, so both sides judge identically);
//   - a site's script package, each entry a fixed argv array run by the
//     server's own command boundary: never a shell string, cwd pinned to the
//     described tools directory, short timeout, output parsed into findings.
//
// Severity follows the owner's ruling (D4): a verbatim quote that does not
// match, a wrong speaker, a missing required field or a URL collision blocks
// publishing; AI style, speculation and an over-long description only warn.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rulePackages = require("../../../../desktop/app/shared/rule-packages.js");

const SCRIPT_TIMEOUT_MS = 30_000;
const OUTPUT_LIMIT = 256 * 1024;

/**
 * @param {string} runtime the interpreter named by the description (python3, node)
 * @param {string[]} argv
 * @param {string} cwd
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number | null }>}
 */
function runScript(runtime, argv, cwd) {
  return new Promise((resolve) => {
    const child = spawn(runtime, argv, { cwd, shell: false, timeout: SCRIPT_TIMEOUT_MS });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      if (stdout.length < OUTPUT_LIMIT) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < OUTPUT_LIMIT) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => resolve({ stdout, stderr: `${stderr}${error.message}`, exitCode: null }));
    child.on("close", (code) => resolve({ stdout, stderr, exitCode: code }));
  });
}

/**
 * One script-backed check: write the article to a temp file beside the tools
 * directory, run the script on it, parse its stdout into findings.
 * @param {Record<string, any>} site
 * @param {Record<string, any>} entry description entry { id, label, scripts }
 * @param {object} article { filename, frontMatter, body }
 * @param {string} toolsDir
 */
async function runScriptPackage(site, entry, article, toolsDir, typeId) {
  const draft = /** @type {any} */ (article);
  const findings = [];
  const tmpDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "wensi-check-"));
  const body = renderArticleFile(draft);
  try {
    for (const script of entry.scripts) {
      // A site may scope a script to the content types it judges: the notes
      // checker has nothing to say about a daily post, and running it there
      // would print errors the writer cannot act on.
      if (Array.isArray(script.types) && script.types.length && !script.types.includes(typeId)) continue;
      const file = path.join(tmpDir, draft.filename || "article.md");
      fs.writeFileSync(file, body);
      const argv = script.argv.map((part) => part.split("{file}").join(file));
      const cwd = script.cwd ? path.resolve(toolsDir, script.cwd) : toolsDir;
      const result = await runScript(script.runtime || "python3", argv, cwd);
      const parsed = rulePackages.parseScriptOutput(script.parserId, {
        filename: draft.filename || "article.md",
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      });
      for (const finding of parsed) {
        findings.push({ checkId: script.id || script.parserId, severity: script.severity || finding.severity || "warn", ...finding });
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return findings;
}

/**
 * The file a site script expects: front matter as the site writes it, then the
 * body. Scripts read the same bytes the site's own pipeline would.
 */
function renderArticleFile(article) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(article.frontMatter || {})) {
    if (value === undefined || value === null || value === "") continue;
    // Flow lists keep the site's quoting: check_provenance and check_v3 read
    // these entries as file:line and verbatim quotes, so a bare comma run
    // would hand them one malformed string.
    if (Array.isArray(value)) lines.push(`${key}: [${value.map((item) => (typeof item === "string" ? `"${item.replace(/"/g, '\\"')}"` : String(item))).join(", ")}]`);
    else lines.push(`${key}: ${value}`);
  }
  // The site's own files put one blank line between the closing fence and the
  // body (publish.py writes "---\n\n" + body); scripts read the same shape.
  lines.push("---", "");
  return `${lines.join("\n")}\n${String(article.body || "").trim()}\n`;
}

/**
 * Run every package a site declares. Returns the findings plus, per package,
 * what ran — a package that could not run must be visible, never an empty list
 * that reads as "clean".
 * @param {object} options
 * @param {object} options.site validated site description
 * @param {string} options.typeId
 * @param {{ filename: string, frontMatter: object, body: string }} options.article
 * @param {{ canon: string[], alias: object }} [options.taxonomy]
 * @param {string} [options.siteRoot]
 */
async function runChecks({ site, typeId, article, taxonomy, siteRoot }) {
  // The validated description is a plain JSON record: its shape is checked by
  // description.js, not by TypeScript's structural inference.
  const description = /** @type {any} */ (site);
  const contentType = description.contentTypes?.[typeId] || null;
  if (!contentType) return { ok: false, code: "unknown_content_type", findings: [], packages: [] };

  const ctx = {
    site: description,
    contentType,
    article: { ...article, existing: [] },
    taxonomy: taxonomy || { canon: [], alias: {} },
    siteRoot: siteRoot || "",
  };
  const findings = [];
  const packages = [];

  for (const entry of description.rulePackages || []) {
    if (typeof entry === "string") {
      if (entry !== "builtin-generic") {
        packages.push({ id: entry, status: "unknown" });
        continue;
      }
      const produced = rulePackages.runPackage(rulePackages.builtinGeneric, ctx);
      findings.push(...produced);
      packages.push({ id: entry, label: rulePackages.builtinGeneric.label, status: "ran" });
      continue;
    }
    const toolsDir = description.tools?.dir;
    if (!toolsDir || !fs.existsSync(toolsDir)) {
      packages.push({ id: entry.id, label: entry.label, status: "tools_unavailable" });
      continue;
    }
    const scriptFindings = await runScriptPackage(site, entry, article, toolsDir, typeId);
    findings.push(...scriptFindings);
    packages.push({ id: entry.id, label: entry.label, status: "ran" });
  }

  const order = { error: 0, warn: 1, info: 2 };
  findings.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  return {
    ok: true,
    packages,
    findings,
    summary: {
      error: findings.filter((f) => f.severity === "error").length,
      warn: findings.filter((f) => f.severity === "warn").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
  };
}

module.exports = Object.freeze({ runChecks, renderArticleFile, runScript });
