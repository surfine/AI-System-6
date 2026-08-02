import { transform } from "esbuild";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appRuntimePaths, lazyRuntimePaths } from "./runtime-manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bundlePath = join(root, "app.bundle.js");
const source = readFileSync(bundlePath, "utf8");

const result = await transform(source, {
  charset: "utf8",
  legalComments: "none",
  loader: "js",
  sourcefile: "app.bundle.js",
  target: ["safari13"],
});

writeFileSync(bundlePath, result.code);

const lazySourcePaths = new Set(lazyRuntimePaths);
for (const runtimePath of appRuntimePaths) {
  const runtimeSource = readFileSync(join(root, runtimePath), "utf8");
  for (const match of runtimeSource.matchAll(/["'](app\/[\w./-]+\.js)["']/g)) {
    if (existsSync(join(root, match[1]))) lazySourcePaths.add(match[1]);
  }
}

for (const sourcePath of lazySourcePaths) {
  const source = readFileSync(join(root, sourcePath), "utf8");
  const legacyPath = join(root, "app", "legacy", sourcePath.slice("app/".length));
  const legacyResult = await transform(source, {
    charset: "utf8",
    legalComments: "none",
    loader: "js",
    sourcefile: sourcePath,
    target: ["safari13"],
  });
  mkdirSync(dirname(legacyPath), { recursive: true });
  writeFileSync(legacyPath, legacyResult.code);
}

console.log(`Backported app.bundle.js and ${lazySourcePaths.size} lazy scripts for Safari 13 / macOS 11 WebKit.`);
