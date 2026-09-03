// Service boundary: business code must reach the server through the service
// layer, never by fetching a same-origin /api route itself.
//
// Two things made the old check weaker than its closing line.
//
// The allowlist was dead. Its keys read `app/core/...` while the path it
// compared them against started at `core/...`, so no entry ever matched and
// the three files that are allowed to fetch were being scanned like any
// other. The gate was green only because none of them writes the one form it
// looked for.
//
// That form was a literal: `/fetch\s*\(\s*["']\/api\//`. Moving the route
// into a variable one line up -- `const url = "/api/chat"; fetch(url)` --
// crossed the boundary with the gate still green. The check now reads the
// parse tree and resolves a same-file binding, so naming the route somewhere
// else in the file does not hide it.
//
// Still out of reach by design: a route that arrives through a function call
// or an import. Those need the call graph, not a file scan.

import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const appRoot = join(root, "apps", "desktop", "app");
const allowed = new Set([
  "app/core/local-lmstudio-client.js",
  "app/core/public-access.js",
  "app/core/service-providers.js",
]);

// A floor, so a scan that finds nothing reads as broken rather than clean.
const MINIMUM_SCANNED_FILES = 50;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && extname(entry.name) === ".js") files.push(full);
  }
  return files;
}

function parseSource(source) {
  const options = { ecmaVersion: "latest", allowReturnOutsideFunction: true };
  try {
    return parse(source, { ...options, sourceType: "script" });
  } catch {
    return parse(source, { ...options, sourceType: "module" });
  }
}

function walkAst(node, visit) {
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item.type === "string") walkAst(item, visit);
    } else if (value && typeof value.type === "string") {
      walkAst(value, visit);
    }
  }
}

function isApiRoute(value) {
  return typeof value === "string" && value.startsWith("/api/");
}

/** Same-file bindings whose initialiser is a plain /api/ string. */
function apiRouteBindings(ast) {
  const names = new Set();
  walkAst(ast, (node) => {
    if (
      node.type === "VariableDeclarator"
      && node.id?.type === "Identifier"
      && node.init?.type === "Literal"
      && isApiRoute(node.init.value)
    ) {
      names.add(node.id.name);
    }
  });
  return names;
}

function apiFetchLines(source) {
  let ast;
  try {
    ast = parseSource(source);
  } catch (error) {
    // An unparsable app file is a failure of this gate's input, not a pass.
    return [{ line: 0, why: `could not parse: ${error.message}` }];
  }
  const bound = apiRouteBindings(ast);
  const found = [];
  walkAst(ast, (node) => {
    if (node.type !== "CallExpression") return;
    const callee = node.callee;
    const isFetch = (callee?.type === "Identifier" && callee.name === "fetch")
      || (callee?.type === "MemberExpression"
        && callee.property?.type === "Identifier"
        && callee.property.name === "fetch");
    if (!isFetch) return;
    const target = node.arguments[0];
    if (!target) return;
    if (target.type === "Literal" && isApiRoute(target.value)) {
      found.push({ line: source.slice(0, node.start).split("\n").length, why: `fetch("${target.value}")` });
      return;
    }
    if (target.type === "TemplateLiteral" && isApiRoute(target.quasis[0]?.value?.cooked)) {
      found.push({ line: source.slice(0, node.start).split("\n").length, why: "fetch(`/api/…`)" });
      return;
    }
    if (target.type === "Identifier" && bound.has(target.name)) {
      found.push({
        line: source.slice(0, node.start).split("\n").length,
        why: `fetch(${target.name}) where ${target.name} is an /api route`,
      });
    }
  });
  return found;
}

const files = await walk(appRoot);
if (files.length < MINIMUM_SCANNED_FILES) {
  console.error(
    `NO  service boundary scanned only ${files.length} app file(s) under ${appRoot}; `
    + `the scan looks broken, not the tree.`,
  );
  process.exit(1);
}

const violations = [];
let scanned = 0;
for (const file of files) {
  const relative = `app/${file.slice(appRoot.length + 1)}`;
  if (allowed.has(relative)) continue;
  scanned += 1;
  const source = await readFile(file, "utf8");
  apiFetchLines(source).forEach((hit) => violations.push({ file: relative, ...hit }));
}

if (violations.length) {
  console.error("Direct same-origin /api fetch outside the service boundary:");
  violations.forEach((hit) => console.error(`- ${hit.file}:${hit.line} ${hit.why}`));
  process.exit(1);
}

console.log(`Service boundary clean: ${scanned} app file(s) reach the server through the service layer.`);
