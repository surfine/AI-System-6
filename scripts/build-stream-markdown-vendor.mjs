import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packagePath = join(root, "node_modules", "stream-markdown-parser", "package.json");
const sourcePath = join(root, "node_modules", "stream-markdown-parser", "dist", "index.cjs");
const outputPath = join(root, "app", "vendor", "stream-markdown-parser.global.js");

const packageInfo = JSON.parse(readFileSync(packagePath, "utf8"));
const source = readFileSync(sourcePath, "utf8").replace(/\/\/# sourceMappingURL=.*\n?$/u, "");

const output = [
  `/*! stream-markdown-parser v${packageInfo.version} | MIT License | ${packageInfo.homepage || packageInfo.repository?.url || ""} */`,
  "(function(global) {",
  "\"use strict\";",
  "var exports = {};",
  "var module = { exports: exports };",
  "(function(exports, module) {",
  source,
  "})(exports, module);",
  "global.StreamMarkdownParser = module.exports || exports;",
  "})(typeof globalThis !== \"undefined\" ? globalThis : typeof self !== \"undefined\" ? self : this);",
  "",
].join("\n");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, output, "utf8");
