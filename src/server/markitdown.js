// MarkItDown availability detection.
//
// This module re-implements the slice of server-importers.js needed to
// answer GET /api/importer-status — adapter path resolution, Python
// interpreter selection, and the live availability probe. The rest of
// the import pipeline (DOCX/PPTX/PDF/OCR/IWA/...) is intentionally
// NOT migrated yet; that comes when we tackle the importer wholesale.
//
// Behavior parity with the root importer for getImporterStatus:
// - same env vars and defaults
// - same adapter / venv / pipx search order
// - same `python -c "from markitdown import MarkItDown; print('ok')"`
//   probe with the same 8-second timeout
// - same JSON response shape (markitdown / enabled / python / detail)
//
// Path resolution diverges in one place: the root file uses
// `__dirname` as one of the candidate roots, which in the root server
// happens to equal the repo root. Here we use `repoRoot` explicitly so
// the same paths are found whether the process is launched from `src/`
// or from the repo root.

"use strict";

const path = require("node:path");
const os = require("node:os");
const fsSync = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const { repoRoot } = require("./lib/build-info.js");

const execFileAsync = promisify(execFile);

const markitdownEnabled = !/^(0|false|off)$/i.test(
  String(process.env.AI_SYSTEM6_MARKITDOWN || "auto")
);
const markitdownTimeoutMs = Math.max(
  1000,
  Number(process.env.AI_SYSTEM6_MARKITDOWN_TIMEOUT_MS || 60000)
);

const pythonBinPath = path.join(
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python"
);

const appRootCandidates = [
  process.env.AI_SYSTEM6_ROOT,
  repoRoot,
  process.cwd(),
  path.dirname(process.execPath || ""),
].filter(Boolean);

const uniqueAppRootCandidates = Array.from(
  new Set(appRootCandidates.map((candidate) => path.resolve(candidate)))
);

const markitdownAdapterPath =
  uniqueAppRootCandidates
    .map((candidate) => path.join(candidate, "scripts", "markitdown-adapter.py"))
    .find((candidate) => fsSync.existsSync(candidate)) ||
  path.join(repoRoot, "scripts", "markitdown-adapter.py");

const localMarkitdownPython = uniqueAppRootCandidates
  .map((candidate) => path.join(candidate, ".venv-markitdown", pythonBinPath))
  .find((candidate) => fsSync.existsSync(candidate));

const pipxMarkitdownPython = path.join(
  os.homedir(),
  ".local",
  "pipx",
  "venvs",
  "markitdown",
  pythonBinPath
);

const markitdownPython =
  process.env.AI_SYSTEM6_PYTHON ||
  localMarkitdownPython ||
  (fsSync.existsSync(pipxMarkitdownPython) ? pipxMarkitdownPython : "") ||
  "python3";

const markitdownSourcePath =
  uniqueAppRootCandidates
    .map((candidate) => path.join(candidate, "markitdown", "packages", "markitdown", "src"))
    .find((candidate) => fsSync.existsSync(candidate)) ||
  path.join(repoRoot, "markitdown", "packages", "markitdown", "src");

/**
 * Build the env passed to the markitdown Python adapter. If the source
 * tree exists locally (developer setup), inject it onto PYTHONPATH so
 * a non-installed checkout still works.
 *
 * @returns {NodeJS.ProcessEnv}
 */
function markitdownEnv() {
  const pythonPathParts = [];
  if (fsSync.existsSync(markitdownSourcePath)) pythonPathParts.push(markitdownSourcePath);
  if (process.env.PYTHONPATH) pythonPathParts.push(process.env.PYTHONPATH);
  return {
    ...process.env,
    ...(pythonPathParts.length ? { PYTHONPATH: pythonPathParts.join(path.delimiter) } : {}),
  };
}

/**
 * @typedef {Object} ImporterStatus
 * @property {boolean} markitdown  Whether MarkItDown is currently usable.
 * @property {boolean} enabled     Whether MarkItDown is enabled by config.
 * @property {string}  python      The resolved Python interpreter path.
 * @property {string}  detail      Human-readable detail string.
 */

/**
 * Probe MarkItDown availability. Mirrors getImporterStatus from
 * server-importers.js.
 *
 * @returns {Promise<ImporterStatus>}
 */
async function getImporterStatus() {
  if (!markitdownEnabled) {
    return {
      markitdown: false,
      enabled: false,
      python: markitdownPython,
      detail: "MarkItDown is disabled.",
    };
  }

  if (!fsSync.existsSync(markitdownAdapterPath)) {
    return {
      markitdown: false,
      enabled: true,
      python: markitdownPython,
      detail: "MarkItDown adapter is missing.",
    };
  }

  try {
    const { stdout } = await execFileAsync(
      markitdownPython,
      ["-c", "from markitdown import MarkItDown; print('ok')"],
      {
        timeout: 8000,
        maxBuffer: 1024 * 1024,
        env: markitdownEnv(),
      }
    );
    const ok = stdout.trim() === "ok";
    return {
      markitdown: ok,
      enabled: true,
      python: markitdownPython,
      detail: ok ? "MarkItDown is available." : "MarkItDown check did not return ok.",
    };
  } catch (error) {
    return {
      markitdown: false,
      enabled: true,
      python: markitdownPython,
      detail: /** @type {Error} */ (error).message,
    };
  }
}

module.exports = {
  getImporterStatus,
  markitdownTimeoutMs,
  markitdownAdapterPath,
  markitdownPython,
  markitdownSourcePath,
  markitdownEnabled,
  markitdownEnv,
};
