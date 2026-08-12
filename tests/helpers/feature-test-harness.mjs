import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

export function createFeatureTest(feature) {
  const failures = [];

  function ok(message) {
    console.log(`OK  ${feature}: ${message}`);
  }

  function fail(message) {
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
  return [...new Set([...defaultPaths, ...paths])]
    .filter((path) => exists(path))
    .map((path) => `\n// ===== ${path} =====\n${read(path)}`)
    .join("\n");
}
