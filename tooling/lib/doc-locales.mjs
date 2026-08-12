import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

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

function shouldIgnoreTrackedPath(path) {
  const segments = path.split("/");
  return ignoredFiles.has(basename(path))
    || segments.some((segment) => ignoredDirs.has(segment) || segment.startsWith(".venv"));
}

function collectTrackedCanonicalMarkdown(root) {
  const topLevel = spawnSync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (topLevel.status !== 0 || resolve(topLevel.stdout.trim()) !== resolve(root)) return null;

  const tracked = spawnSync("git", ["-C", root, "ls-files", "-z", "--", "*.md"], {
    encoding: "utf8",
  });
  if (tracked.status !== 0) return null;

  return tracked.stdout
    .split("\0")
    .filter(Boolean)
    .filter((path) => !path.endsWith(".zh-CN.md"))
    .filter((path) => !shouldIgnoreTrackedPath(path))
    .sort();
}

export function collectCanonicalMarkdown(root, dir = root, docs = []) {
  if (resolve(dir) === resolve(root) && docs.length === 0) {
    const tracked = collectTrackedCanonicalMarkdown(root);
    if (tracked) return tracked;
  }

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
