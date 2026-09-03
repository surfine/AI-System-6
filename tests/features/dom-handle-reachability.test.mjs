// A handle bound to an id that nothing ever creates is permanently null, and
// the app then has to remember to guard it everywhere. It usually does. Once it
// did not, and the writer paid: Time Machine read three MENU command ids into
// element handles (#time-machine-clip, #time-machine-clip-translate,
// #time-machine-send-manuscript, none of which appear in any markup). Eight
// uses guarded; the translate path did not. Selecting text and choosing
// Clip + Translate set .disabled on null before it clipped anything, so no clip
// was ever made, the status line blamed the translation, and the failure escaped
// as an unhandled rejection. Every gate was green.
//
// This contract holds two things:
//
//   1. The number of handles bound to an id nothing creates may only FALL.
//      It is a ratchet like the CSS budgets: a new one is a new trap.
//   2. Every place such a handle is used must be guarded — optional chaining,
//      or a guard on the handle somewhere in the enclosing function. This is
//      the assertion that would have caught Time Machine.
//
// An id counts as creatable when index.html declares it, or when any module
// writes it into markup (a module-built window creates its own controls).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, parseJsSource, forEachAstChild, read, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("dom-handle-reachability");

const appDir = join(root, "apps/desktop/app");

function collectModuleFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Vendored libraries and generated data are not the app's own wiring.
      if (!/^(vendor|generated)$/.test(entry.name)) collectModuleFiles(path, out);
    } else if (entry.name.endsWith(".js")) out.push(path);
  }
  return out;
}

const moduleFiles = collectModuleFiles(appDir);
const html = read("index.html");

// Every id the running app can ever hold: declared in the markup, or written
// by a module into markup it builds.
const creatableIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
for (const file of moduleFiles) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/id=\\?["'`]([A-Za-z0-9_-]+)/g)) creatableIds.add(match[1]);
  for (const match of source.matchAll(/\.id\s*=\s*["'`]([A-Za-z0-9_-]+)/g)) creatableIds.add(match[1]);
  for (const match of source.matchAll(/setAttribute\(\s*["']id["']\s*,\s*["'`]([A-Za-z0-9_-]+)/g)) creatableIds.add(match[1]);
}

// The handles: `const name = document.querySelector("#id")`.
//
// The app is concatenated into ONE scope, so a module's top-level handle is
// visible everywhere and a use anywhere is a use of it. A binding inside a
// function is a different variable that happens to share a name, and treating
// the two alike reports the wrong file: `hint` and `selector` are ordinary
// local names in Bonsai City and Theme Lab. So a handle counts only when it is
// declared at a module's TOP LEVEL and no other place in the app declares that
// name at all.
const declarationCounts = new Map();
const countName = (name) => declarationCounts.set(name, (declarationCounts.get(name) || 0) + 1);
const parsedFiles = new Map();
for (const file of moduleFiles) {
  const source = readFileSync(file, "utf8");
  let ast;
  try {
    ast = parseJsSource(source);
  } catch {
    continue;
  }
  parsedFiles.set(file, { source, ast });
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") countName(node.id.name);
    if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) {
      for (const param of node.params || []) {
        if (param?.type === "Identifier") countName(param.name);
      }
    }
    forEachAstChild(node, visit);
  };
  visit(ast);
}

const nullHandles = new Map();
for (const [file, { source, ast }] of parsedFiles) {
  // dom-handles.js builds every shared handle inside one factory function, so
  // a scan of top-level statements alone finds none of them.
  const declarators = [];
  const collect = (node) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "VariableDeclarator") declarators.push(node);
    forEachAstChild(node, collect);
  };
  collect(ast);
  {
    for (const declarator of declarators) {
      const init = declarator.init;
      if (declarator.id?.type !== "Identifier" || init?.type !== "CallExpression") continue;
      const callee = init.callee;
      if (callee?.type !== "MemberExpression" || callee.object?.name !== "document") continue;
      if (!/^(querySelector|getElementById)$/.test(callee.property?.name || "")) continue;
      const argument = init.arguments?.[0];
      if (argument?.type !== "Literal" || typeof argument.value !== "string") continue;
      const id = argument.value.replace(/^#/, "");
      if (!/^[A-Za-z0-9_-]+$/.test(id)) continue;
      if (creatableIds.has(id)) continue;
      // A name declared in more than one place cannot be attributed to this
      // handle: `hint` and `selector` are ordinary locals in Bonsai City and
      // Theme Lab as well as handle names here.
      if ((declarationCounts.get(declarator.id.name) || 0) > 1) continue;
      nullHandles.set(declarator.id.name, {
        id,
        file: file.replace(`${root}/`, ""),
        line: source.slice(0, declarator.start).split("\n").length,
      });
    }
  }
}

// Measured 2026-09-02. It may only fall: delete the handle, or give the id an
// element. Raising it means a new permanently-null handle was added.
const NULL_HANDLE_BUDGET = 20;

test.assert(
  nullHandles.size <= NULL_HANDLE_BUDGET,
  nullHandles.size <= NULL_HANDLE_BUDGET
    ? `handles bound to an id nothing creates: ${nullHandles.size} (budget ${NULL_HANDLE_BUDGET})`
    : `handles bound to an id nothing creates rose to ${nullHandles.size} (budget ${NULL_HANDLE_BUDGET}) — `
      + `delete the handle or give its id an element: ${[...nullHandles].map(([name, at]) => `${name} (#${at.id})`).join(", ")}`
);

// --- Every use of a permanently-null handle must be guarded ----------------

function functionBodies(ast) {
  const bodies = [];
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) bodies.push(node);
    forEachAstChild(node, visit);
  };
  visit(ast);
  return bodies;
}

function identifiersIn(node) {
  const names = new Set();
  const visit = (current) => {
    if (!current || typeof current.type !== "string") return;
    if (current.type === "Identifier") names.add(current.name);
    forEachAstChild(current, visit);
  };
  visit(node);
  return names;
}

const unguarded = [];
for (const file of moduleFiles) {
  const source = readFileSync(file, "utf8");
  // Cheap skip: a file that never names one of the handles cannot use one.
  if (![...nullHandles.keys()].some((name) => source.includes(name))) continue;
  let ast;
  try {
    ast = parseJsSource(source);
  } catch {
    continue;
  }
  for (const fn of functionBodies(ast)) {
    // A guard is any test in this function that reads the handle: an early
    // `if (!handle) return`, an `if (handle) { … }`, or a conditional.
    const guarded = new Set();
    const collectGuards = (node) => {
      if (!node || typeof node.type !== "string") return;
      if (node.type === "IfStatement" || node.type === "ConditionalExpression"
        || node.type === "LogicalExpression") {
        for (const name of identifiersIn(node.test || node.left)) {
          if (nullHandles.has(name)) guarded.add(name);
        }
      }
      forEachAstChild(node, collectGuards);
    };
    collectGuards(fn.body);

    const check = (node) => {
      if (!node || typeof node.type !== "string") return;
      if (node.type === "MemberExpression" && node.object?.type === "Identifier"
        && nullHandles.has(node.object.name) && node.optional !== true
        && !guarded.has(node.object.name)) {
        unguarded.push(`${file.replace(`${root}/`, "")}:${source.slice(0, node.start).split("\n").length} ${node.object.name}`);
      }
      forEachAstChild(node, check);
    };
    check(fn.body);
  }
}

test.assert(
  unguarded.length === 0,
  unguarded.length === 0
    ? `every use of a permanently-null handle is guarded (${nullHandles.size} handles checked across ${moduleFiles.length} modules)`
    : `${unguarded.length} unguarded use(s) of a handle that is always null — the control does nothing and the failure blames something else: ${unguarded.join(", ")}`
);

// --- The list above is a claim about the running app, so ask the running app.
//
// Reading source can only say that no file writes the id. The boot harness
// builds its DOM from the real index.html and lets the real modules run, so it
// can answer the question that matters: after the app has started, does the
// element exist? (The handles themselves are lexical `const` bindings, not
// properties of the global object, so they cannot be read from outside — the
// id is what can be asked, and it is the same claim.)
{
  const vmw = createAppBootVm();
  const found = [];
  for (const [name, at] of nullHandles) {
    if (vmw.context.document.querySelector(`#${at.id}`)) found.push(`${name} (#${at.id})`);
  }
  test.assert(
    found.length === 0,
    found.length === 0
      ? `no id this contract calls absent exists in the booted app (${nullHandles.size} checked)`
      : `${found.length} id(s) the source sweep called absent do exist once the app runs, so the sweep is wrong: ${found.join(", ")}`
  );
  // The harness must really be building a DOM, or the check above is vacuous.
  test.assert(
    Boolean(vmw.context.document.querySelector("#teachtext-body")),
    "the booted app really has a DOM to ask (the manuscript's own field is present)"
  );
}

test.finish();
