import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ignoredDirs = new Set([
  ".git",
  ".agents",
  ".antigravitycli",
  ".claude",
  ".venv",
  ".venv-markitdown",
  ".venv-markitdown-trim",
  "assets",
  "data",
  "node_modules",
  "dist",
  "test-results",
  "playwright-report",
  "external",
  "marked",
  "markitdown",
  "markmap",
  "readability",
  "liquid-glass-studio",
  "liquid-glass-text",
  "codex-snapshots",
  "shell",
]);

const ignoredFiles = new Set(["AGENTS.md"]);

function shouldIgnoreDirectory(absPath, entryName) {
  return ignoredDirs.has(entryName)
    || entryName.startsWith(".venv")
    || existsSync(join(absPath, ".git"));
}

export function collectCanonicalMarkdown(root, dir = root, docs = []) {
  readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (entry.isDirectory()) {
      const nextDir = join(dir, entry.name);
      if (!shouldIgnoreDirectory(nextDir, entry.name)) {
        collectCanonicalMarkdown(root, nextDir, docs);
      }
      return;
    }

    if (!entry.name.endsWith(".md") || entry.name.endsWith(".zh-CN.md")) return;
    if (ignoredFiles.has(entry.name)) return;
    docs.push(relative(root, join(dir, entry.name)));
  });

  return docs.sort();
}

export function localizedPath(path) {
  return path.replace(/\.md$/, ".zh-CN.md");
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}
