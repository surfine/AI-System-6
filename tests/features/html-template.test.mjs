// The html`` tagged template is the structural answer to innerHTML assembly:
// escaping is the default, not a per-site discipline. This contract executes
// the real strings.js helpers and pins the invariants a conversion relies on
// - forget the hatch and markup double-escapes (visible, not dangerous);
// forget nothing and an injected string stays inert.

import { createFeatureTest, desktopRoot, forEachAstChild, parseJsSource, read } from "../helpers/feature-test-harness.mjs";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import vm from "node:vm";

const test = createFeatureTest("html-template");
// The whole file, not slices: html.raw is wired by a top-level statement, and
// the contract must fail if the helpers and their wiring drift apart. It runs
// in its own VM context — real execution of the shipped source, not a reading.
const { escapeHtml, html } = vm.runInContext(
  `${read("app/core/strings.js")}\n;({ escapeHtml, html })`,
  vm.createContext({}),
);

test.assert(typeof html === "function" && typeof html.raw === "function", "strings.js ships the html`` helper and its raw hatch");

test.assert(
  html`<b>${'<img src=x onerror="alert(1)">'}</b>` === "<b>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</b>",
  "an interpolated string is escaped by default",
);
test.assert(html`${`<b>`}` === "&lt;b&gt;", "a nested template's output is escaped too - composition goes through arrays or html.raw");
test.assert(html`<i>${html.raw("<u>ok</u>")}</i>` === "<i><u>ok</u></i>", "html.raw is the explicit hatch for owned markup");
test.assert(html`<i>${html.raw(["<u>a</u>", html.raw("<b>b</b>").safeHtml])}</i>` === "<i><u>a</u><b>b</b></i>", "html.raw joins arrays of already-safe strings without escaping");
test.assert(html`<span>${0}</span>` === "<span>0</span>", "a zero renders - the raw escapeHtml `|| \"\"` quirk must not swallow it");
test.assert(html`<span>${false}</span>` === "<span>false</span>", "a boolean renders as itself");
test.assert(html`<span>${null}${undefined}</span>` === "<span></span>", "null and undefined render as nothing");
test.assert(
  html`<ul>${["<a>", ["<b>", html.raw("<c>")]]}</ul>` === "<ul>&lt;a&gt;&lt;b&gt;<c></ul>",
  "arrays flatten and join",
);
test.assert(html`<a data-name="${'He said "hi"'}">` === `<a data-name="${escapeHtml('He said "hi"')}">`, "attribute interpolation escapes quotes");
test.assert(escapeHtml(0) === "" && escapeHtml(5) === "5", "escapeHtml keeps its existing `|| \"\"` semantics - callers depend on it");

// Call sites. html`` escapes every string it is handed, so the hatch has to be
// written wherever owned markup enters a template: a helper that returns
// markup, a plain `<...>` template, or an html`` built elsewhere all print as
// visible tags without html.raw (the Finder rail and toolbar places did, in
// every appearance, for a day). And a local named `html` turns the tag into a
// string - the next html`` throws.
const appFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "generated" || name === "vendor") continue;
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".js")) appFiles.push(path);
  }
})(join(desktopRoot, "app"));
const parsed = appFiles.map((path) => {
  const source = readFileSync(path, "utf8");
  return { path: relative(desktopRoot, path), source, ast: parseJsSource(source) };
});
const visitAll = (node, visit) => { visit(node); forEachAstChild(node, (child) => visitAll(child, visit)); };
const startsWithTag = (node) => (node?.type === "TemplateLiteral" && /^\s*</.test(node.quasis[0].value.cooked ?? ""))
  || (node?.type === "Literal" && typeof node.value === "string" && /^\s*</.test(node.value));
const isHtmlTag = (node) => node?.type === "TaggedTemplateExpression" && node.tag.type === "Identifier" && node.tag.name === "html";
const isRaw = (node) => node?.type === "CallExpression" && node.callee.type === "MemberExpression"
  && node.callee.object.name === "html" && node.callee.property.name === "raw";
const returnsMarkup = (fn) => {
  if (fn.body.type !== "BlockStatement") return startsWithTag(fn.body) || isHtmlTag(fn.body);
  let found = false;
  visitAll(fn.body, (node) => {
    if (node.type === "ReturnStatement" && (startsWithTag(node.argument) || isHtmlTag(node.argument))) found = true;
  });
  return found;
};
const markupFunctions = new Set(["renderSystemIcon"]);
for (const { ast } of parsed) {
  visitAll(ast, (node) => {
    if (node.type === "FunctionDeclaration" && node.id && returnsMarkup(node)) markupFunctions.add(node.id.name);
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier"
      && /FunctionExpression$/.test(node.init?.type ?? "") && returnsMarkup(node.init)) markupFunctions.add(node.id.name);
  });
}
// What an interpolation hands html``: follow the value, not every subexpression.
function markupValues(node, out) {
  if (!node || isRaw(node)) return out;
  if (node.type === "ConditionalExpression") { markupValues(node.consequent, out); markupValues(node.alternate, out); return out; }
  if (node.type === "LogicalExpression") { markupValues(node.left, out); markupValues(node.right, out); return out; }
  if (node.type === "CallExpression" && node.callee.type === "MemberExpression"
    && ["join", "map", "filter", "concat"].includes(node.callee.property.name)) {
    markupValues(node.callee.object, out);
    for (const arg of node.arguments) if (arg.type === "Identifier" && markupFunctions.has(arg.name)) out.push(arg);
    else if (/FunctionExpression$/.test(arg.type)) {
      if (arg.body.type === "BlockStatement") visitAll(arg.body, (inner) => { if (inner.type === "ReturnStatement") markupValues(inner.argument, out); });
      else markupValues(arg.body, out);
    }
    return out;
  }
  if (node.type === "ArrayExpression") { node.elements.forEach((element) => markupValues(element, out)); return out; }
  if (startsWithTag(node) || isHtmlTag(node)) out.push(node);
  else if (node.type === "Identifier" && markupVariables.has(node.name)) out.push(node);
  else if (node.type === "CallExpression" && node.callee.type === "Identifier" && markupFunctions.has(node.callee.name)) out.push(node);
  return out;
}
// A local that holds markup (`const icon = renderSystemIcon(...)`) carries it
// into the template under another name; names are per file.
let markupVariables = new Set();
const unescapedMarkup = [];
const shadowed = [];
for (const { path, source, ast } of parsed) {
  const line = (node) => source.slice(0, node.start).split("\n").length;
  markupVariables = new Set();
  visitAll(ast, (node) => {
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init && markupValues(node.init, []).length) markupVariables.add(node.id.name);
  });
  visitAll(ast, (node) => {
    if (isHtmlTag(node)) {
      for (const expression of node.quasi.expressions) {
        for (const hit of markupValues(expression, [])) unescapedMarkup.push(`${path}:${line(hit)} ${source.slice(hit.start, Math.min(hit.end, hit.start + 60))}`);
      }
    }
    const declaresHtml = (/Function/.test(node.type) && node.params?.some((param) => param.type === "Identifier" && param.name === "html"))
      || ((node.type === "BlockStatement" || node.type === "Program") && node.body.some((statement) => statement.type === "VariableDeclaration"
        && statement.declarations.some((declaration) => declaration.id.type === "Identifier" && declaration.id.name === "html")));
    if (declaresHtml) {
      let uses = false;
      visitAll(node, (inner) => { if (isHtmlTag(inner)) uses = true; });
      if (uses) shadowed.push(`${path}:${line(node)}`);
    }
  });
}
test.assert(unescapedMarkup.length === 0, `owned markup enters html\`\` through html.raw: ${unescapedMarkup.join(" | ")}`);
test.assert(shadowed.length === 0, `no scope that uses html\`\` declares its own html: ${shadowed.join(" | ")}`);
test.assert(markupFunctions.size > 20, `the markup-helper census found the helpers it guards (${markupFunctions.size})`);

test.finish();
