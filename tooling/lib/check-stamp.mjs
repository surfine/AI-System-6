// The stamp every local check prints: which commit produced it and which
// desk version it checked. The unified spec's release rule — every check is
// marked with commit and browser version — lives here so the gates cannot
// drift into unstamped output.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// tooling/lib/ -> tooling/ -> the repo root.
const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function gitCommit() {
  try {
    return String(execSync("git rev-parse --short HEAD", {
      cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim() || "unknown");
  } catch {
    // A shallow or detached checkout still has to stamp something honest.
    return "unknown";
  }
}

function deskVersion() {
  try {
    return String(JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version || "unknown");
  } catch {
    return "unknown";
  }
}

/** One header line, e.g. `commit d210fbd0b · desk v1.0.58`. */
export function checkStamp() {
  return `commit ${gitCommit()} · desk v${deskVersion()}`;
}
