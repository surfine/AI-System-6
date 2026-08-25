// LM Studio `lms` CLI integration.
//
// Path discovery, command execution, JSON output parsing, and a thin
// wrapper that lists locally-installed LLMs. Used by /api/models as a
// fallback when HTTP discovery fails, and by /api/lmstudio/setup as
// its primary tool.
//
// Behavior parity with the matching functions in root server.js:
// - LM_STUDIO_CLI / LMS_CLI / LMS_PATH env vars override path
//   discovery (in that order).
// - Same Windows path candidates (Programs / LM Studio / arch
//   variants).
// - Same execFile budgets (8 MiB max stdout, default 30 s timeout,
//   windowsHide: true).
// - ENOENT skips to the next candidate. SIGTERM/killed maps to a
//   "lms <args> timed out." error. Explicit (path-containing) or
//   env-supplied commands stop the search on the first non-ENOENT
//   failure.

"use strict";

const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const { normalizeLmsModels } = require("./lmstudio-models.js");

const execFileAsync = promisify(execFile);

/**
 * Deduplicate string-like values, trim each entry, drop empties.
 * Used to dedupe lms command candidates without losing first-seen
 * order. Mirrors `uniqueValues` from root server.js.
 *
 * @param {Array<string | null | undefined>} values
 * @returns {string[]}
 */
function uniqueValues(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => value && !seen.has(value) && seen.add(value));
}

/**
 * Enumerate candidate `lms` command paths in preference order:
 * explicit env override, PATH lookup, ~/.lmstudio/bin, then Windows
 * Programs/AppData install locations.
 *
 * @returns {string[]}
 */
function lmsCommandCandidates() {
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || (home ? path.join(home, "AppData", "Local") : "");
  const programFiles = process.env.ProgramFiles || "";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "";
  const envCommand = process.env.LM_STUDIO_CLI || process.env.LMS_CLI || process.env.LMS_PATH || "";
  const commands = [envCommand, process.platform === "win32" ? "lms.exe" : "lms", "lms"];

  if (home) {
    commands.push(
      path.join(home, ".lmstudio", "bin", process.platform === "win32" ? "lms.exe" : "lms"),
      path.join(home, ".lmstudio", "bin", "lms")
    );
  }

  if (process.platform === "win32") {
    [localAppData, programFiles, programFilesX86].filter(Boolean).forEach((base) => {
      ["LM Studio", "LM-Studio"].forEach((appName) => {
        const appDirs = [
          path.join(base, "Programs", appName),
          path.join(base, appName),
        ];
        appDirs.forEach((appDir) => commands.push(
          path.join(base, "Programs", appName, "resources", "app", ".webpack", "main", "cli", "lms.exe"),
          path.join(base, "Programs", appName, "resources", "app", ".webpack", "main", "cli", "win32-x64", "lms.exe"),
          path.join(base, "Programs", appName, "resources", "app", ".webpack", "main", "cli", "win32-arm64", "lms.exe"),
          path.join(appDir, "resources", "app", ".webpack", "main", "cli", "lms.exe"),
          path.join(appDir, "resources", "app", ".webpack", "main", "cli", "win32-x64", "lms.exe"),
          path.join(appDir, "resources", "app", ".webpack", "main", "cli", "win32-arm64", "lms.exe")
        ));
      });
    });
  }

  return uniqueValues(commands);
}

/**
 * Run `lms` with the given args. Mirrors `runLms` from root.
 *
 * @param {string[]} args
 * @param {{ timeout?: number, signal?: AbortSignal | null }} [options]
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
async function runLms(args, { timeout = 30000, signal = null } = {}) {
  const candidates = lmsCommandCandidates();
  const missing = [];
  /** @type {any} */
  let lastError = null;

  for (const command of candidates) {
    const isExplicit = command.includes(path.sep) || command.includes("/");
    try {
      const result = await execFileAsync(command, args, {
        timeout,
        signal: signal || undefined,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      });
      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
      };
    } catch (error) {
      const e = /** @type {any} */ (error);
      if (signal?.aborted || e?.name === "AbortError" || e?.code === "ABORT_ERR") {
        throw e;
      }
      if (e.code === "ENOENT") {
        missing.push(command);
        continue;
      }
      if (e.killed || e.signal === "SIGTERM") {
        throw new Error(`lms ${args.join(" ")} timed out.`);
      }
      lastError = e;
      if (
        isExplicit ||
        command === process.env.LM_STUDIO_CLI ||
        command === process.env.LMS_CLI ||
        command === process.env.LMS_PATH
      ) break;
    }
  }

  if (lastError) {
    const detail = [lastError.stdout, lastError.stderr, lastError.message].filter(Boolean).join("\n").trim();
    throw new Error(detail || `lms ${args.join(" ")} failed.`);
  }

  throw new Error(`LM Studio CLI \`lms\` was not found. Tried: ${missing.join(", ") || candidates.join(", ")}`);
}

/**
 * Extract the first balanced JSON value from a text stream. Tolerates
 * leading log output before the JSON payload. Mirrors `parseJsonOutput`.
 *
 * @param {unknown} value
 * @returns {any}
 */
function parseJsonOutput(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const firstJson = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])\s*$/)?.[1] || text;
  return JSON.parse(firstJson);
}

/**
 * List locally-installed LLMs by invoking `lms ls --llm --json`.
 * Mirrors `getLocalLmsModels`.
 *
 * @returns {Promise<import("./lmstudio-models.js").NormalizedModel[]>}
 */
async function getLocalLmsModels() {
  const output = await runLms(["ls", "--llm", "--json"], { timeout: 45000 });
  return normalizeLmsModels(parseJsonOutput(output.stdout));
}

module.exports = {
  uniqueValues,
  lmsCommandCandidates,
  runLms,
  parseJsonOutput,
  getLocalLmsModels,
};
