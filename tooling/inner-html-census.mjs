// innerHTML census: how much markup assembly still relies on per-site
// escaping discipline.
//
// The html`` tagged template (app/core/strings.js) makes escaping the
// default. This census walks the first-party app sources and classifies every
// site that assigns or inserts HTML:
//
//   tagged  - the rhs is the html`` template: escaped by construction.
//   static  - markup with no interpolation at all.
//   raw     - an untagged template literal (or concatenation containing one)
//             with interpolations: safety is a per-site escapeHtml() habit,
//             which is exactly the class T3 converts and this ratchet counts.
//   opaque  - anything else (a function call, an identifier): cannot be
//             classified mechanically without false positives, so it is
//             reported as information, never gated.
//
// The gated number is `rawCount`. Same ratchet shape as the other budgets in
// this repo (tooling/css-budget.json, tooling/control-census-baseline.json):
// a small committed JSON holds the ceiling, verify-inner-html-census.mjs
// re-measures and fails if the ceiling rose, and --update lowers it (only
// allowed when the new count is <=).
//
// Usage:
//   node tooling/inner-html-census.mjs                # print the report
//   node tooling/verify-inner-html-census.mjs         # measure + compare
//   node tooling/verify-inner-html-census.mjs --update  # lower the baseline

import { parse } from "acorn";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const baselinePath = join(dirnameFile(), "inner-html-census-baseline.json");

function dirnameFile() {
  return fileURLToPath(new URL(".", import.meta.url));
}

const APP_ROOTS = ["apps/desktop/app", "apps/desktop/app.js"];
const SKIP_DIRS = new Set(["vendor", "generated"]);

function collectFiles(base, acc = []) {
  const basePath = join(base);
  let entries;
  try {
    entries = readdirSync(basePath, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.name.endsWith(".js") && entry.isFile()) acc.push(join(basePath, entry.name));
    else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) collectFiles(join(basePath, entry.name), acc);
  }
  return acc;
}

function classifyExpression(node) {
  if (!node) return "opaque";
  if (node.type === "TaggedTemplateExpression") {
    if (node.tag.type === "Identifier" && node.tag.name === "html") return "tagged";
    return classifyExpression(node.quasi);
  }
  if (node.type === "TemplateLiteral") {
    return node.expressions.length ? "raw" : "static";
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    const left = classifyExpression(node.left);
    const right = classifyExpression(node.right);
    if (left === "raw" || right === "raw") return "raw";
    if (left === "opaque" || right === "opaque") return "opaque";
    return "static";
  }
  return "opaque";
}

function memberName(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  return "";
}

export async function main() {
  const root = join(dirnameFile(), "..");
  const files = APP_ROOTS.flatMap((base) => collectFiles(join(root, base)));
  const byFile = {};
  const totals = { tagged: 0, static: 0, raw: 0, opaque: 0, sites: 0 };
  for (const file of files) {
    let ast;
    try {
      ast = parse(readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "script" });
    } catch {
      continue;
    }
    const counts = { tagged: 0, static: 0, raw: 0, opaque: 0 };
    const visit = (node) => {
      if (!node || typeof node.type !== "string") return;
      let rhs = null;
      if (node.type === "AssignmentExpression" && node.operator === "="
        && node.left.type === "MemberExpression" && memberName(node.left.property) === "innerHTML") {
        rhs = node.right;
      } else if (node.type === "CallExpression" && node.callee.type === "MemberExpression"
        && memberName(node.callee.property) === "insertAdjacentHTML") {
        rhs = node.arguments[0] || null;
      }
      if (rhs) {
        counts[classifyExpression(rhs)] += 1;
      }
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value.type === "string") visit(value);
      }
    };
    visit(ast);
    const siteTotal = counts.tagged + counts.static + counts.raw + counts.opaque;
    if (siteTotal) {
      byFile[relative(root, file).split(sep).join("/")] = counts;
      totals.tagged += counts.tagged;
      totals.static += counts.static;
      totals.raw += counts.raw;
      totals.opaque += counts.opaque;
      totals.sites += siteTotal;
    }
  }
  return { totals, byFile };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const report = await main();
  console.log(`innerHTML census: ${report.totals.sites} sites — tagged ${report.totals.tagged}, static ${report.totals.static}, raw ${report.totals.raw}, opaque (informational) ${report.totals.opaque}`);
  for (const [file, counts] of Object.entries(report.byFile).sort(([, a], [, b]) => b.raw - a.raw)) {
    if (counts.raw) console.log(`  ${String(counts.raw).padStart(3)} raw  ${file}`);
  }
}
