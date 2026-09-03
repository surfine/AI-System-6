import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";

// Static contracts that read the shape of the app source parse it here.
//
// The parser is Acorn, not the TypeScript compiler API. TypeScript 7 is a
// native port whose main entry publishes only its version, and it offers an
// AST solely through an export named "unstable". A release gate must not
// stand on an API that says it can move.

/** Parse app source. The app files are classic scripts; a module parse is the fallback. */
export function parseJsSource(source) {
  const options = { ecmaVersion: "latest", allowReturnOutsideFunction: true };
  try {
    return parse(source, { ...options, sourceType: "script" });
  } catch {
    return parse(source, { ...options, sourceType: "module" });
  }
}

/** Visit every child node, whatever the shape of the parent's fields. */
export function forEachAstChild(node, visit) {
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item.type === "string") visit(item);
    } else if (value && typeof value.type === "string") {
      visit(value);
    }
  }
}

export const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const desktopRoot = join(root, "apps", "desktop");
const desktopEntries = new Set([
  "index.html",
  "endfield-terminal.html",
  "app.js",
  "app.bundle.js",
  "styles.css",
  "styles.bundle.css",
  "styles.theme-lab.css",
]);

export function resolveProjectPath(relativePath) {
  if (
    desktopEntries.has(relativePath)
    || /^(?:app|assets|data|styles)(?:\/|$)/.test(relativePath)
  ) {
    return join(desktopRoot, relativePath);
  }
  return join(root, relativePath);
}

export function read(path) {
  return readFileSync(resolveProjectPath(path), "utf8");
}

export function exists(path) {
  return existsSync(resolveProjectPath(path));
}

// The window registry, read as data rather than grepped as text.
//
// Contracts used to assert that a window was declared by searching
// window-manager.js for a substring, which pinned the *spelling* of a data
// structure rather than the fact it holds. When the declaration moved into
// core/window-registry.js, twenty-one contracts failed for the one reason a
// contract should never fail: the truth was unchanged and the text was not.
//
// Each record carries the literal fields as values, and the behavioural fields
// (hooks, lazy loaders) as their source text, so a test can still assert which
// call a hook makes without also pinning where the hook lives.
let windowRegistryCache = null;

export function windowRegistryRecords() {
  if (windowRegistryCache) return windowRegistryCache;
  const source = read("app/core/window-registry.js");
  const ast = parseJsSource(source);
  let table = null;
  const visit = (node) => {
    if (
      node.type === "VariableDeclarator"
      && node.id?.name === "windowRegistry"
      && node.init?.type === "CallExpression"
      && node.init.arguments[0]?.type === "ObjectExpression"
    ) {
      table = node.init.arguments[0];
      return;
    }
    forEachAstChild(node, visit);
  };
  visit(ast);
  if (!table) throw new Error("window-registry.js does not declare a windowRegistry object");

  const records = {};
  for (const property of table.properties) {
    const name = property.key.name || property.key.value;
    const record = {};
    for (const field of property.value.properties) {
      const key = field.key.name || field.key.value;
      const value = field.value;
      if (value.type === "Literal") record[key] = value.value;
      else record[key] = source.slice(value.start, value.end);
    }
    records[name] = record;
  }
  windowRegistryCache = records;
  return records;
}

/** Which application owns a window, as the product itself declares it. */
export function windowApp(name) {
  return windowRegistryRecords()[name]?.app || null;
}

// A contract that cannot fail is worse than no contract: it prints a pass
// certificate for work nobody looked at.
//
// Two ways to build one were live in this tree. A file can run its assertions
// and never call finish(), because finish() is the only place the failures are
// read -- three contracts printed `NO ...` lines and still exited 0, so the
// suite counted them as passed. A file can also assert nothing at all, because
// the runner counts files, not checks.
//
// The harness closes both. It counts the checks it performs, and an exit hook
// holds the file to its own contract: finish() must run, and it must have
// something to report.
export function createFeatureTest(feature) {
  const failures = [];
  let assertions = 0;
  let finished = false;

  process.on("exit", (code) => {
    // Do not mask a failure the file already declared.
    if (code !== 0) return;
    if (!finished) {
      console.error(`\nNO  ${feature}: the contract never called test.finish(), so ${failures.length} failure(s) went unread.`);
      process.exitCode = 1;
      return;
    }
    if (!assertions) {
      console.error(`\nNO  ${feature}: the contract ran zero checks; a pass here proves nothing.`);
      process.exitCode = 1;
    }
  });

  function ok(message) {
    assertions += 1;
    console.log(`OK  ${feature}: ${message}`);
  }

  function fail(message) {
    assertions += 1;
    failures.push(message);
    console.error(`NO  ${feature}: ${message}`);
  }

  function assert(condition, message) {
    if (condition) ok(message);
    else fail(message);
  }

  function assertFile(path, message = `${path} exists`) {
    assert(exists(path), message);
  }

  function assertIncludes(source, needle, message) {
    assert(String(source).includes(needle), message);
  }

  function assertNotIncludes(source, needle, message) {
    assert(!String(source).includes(needle), message);
  }

  function assertMatches(source, pattern, message) {
    assert(pattern.test(String(source)), message);
  }

  function assertNotMatches(source, pattern, message) {
    assert(!pattern.test(String(source)), message);
  }

  function finish() {
    finished = true;
    if (failures.length) {
      console.error(`\n${feature} feature test failed: ${failures.length} issue(s).`);
      process.exit(1);
    }
    console.log(`\n${feature} feature test passed.`);
  }

  return {
    assert,
    assertFile,
    assertIncludes,
    assertNotIncludes,
    assertMatches,
    assertNotMatches,
    fail,
    finish,
    ok,
  };
}

export function readAppSurface(paths = []) {
  const defaultPaths = [
    "index.html",
    "app.js",
    "app/core/config.js",
    "app/core/desktop-runtime.js",
    "app/core/persistence-status.js",
    "app/core/window-manager.js",
    "app/core/wireup.js",
    "app/features/project-disk.js",
    "app/features/file-disk.js",
    "app/features/reader.js",
    "app/features/teachtext-accessories.js",
    "app/features/documents-chat.js",
    "app/features/writing-flow.js",
    "tooling/runtime-manifest.mjs",
  ];
  // A missing path used to drop out of the surface silently. Twelve contracts
  // assert what this surface must NOT contain, and every one of those
  // assertions becomes vacuously true for whatever a rename removed: the
  // contract still passes, over a surface that no longer holds the file it
  // was written about. Say it instead.
  const requested = [...new Set([...defaultPaths, ...paths])];
  const missing = requested.filter((path) => !exists(path));
  if (missing.length) {
    throw new Error(
      `readAppSurface cannot read ${missing.join(", ")}. `
      + "A surface with a hole passes every assertNotIncludes written about it. "
      + "Update the path list in tests/helpers/feature-test-harness.mjs, or pass the file's new name.",
    );
  }
  return requested
    .map((path) => `\n// ===== ${path} =====\n${read(path)}`)
    .join("\n");
}
