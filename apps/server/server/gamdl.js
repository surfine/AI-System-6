// Host-side gamdl bridge for Soundscape's "Apple Music link" downloads.
//
// gamdl (https://github.com/glomatico/gamdl) is a Python CLI that downloads
// Apple Music songs/albums/playlists as real audio files, using the signed-in
// account's cookies. The server runs it as a subprocess (argv only, no shell)
// into a per-job folder under the user's home, then serves the finished files
// back to the browser queue. The browser never sees cookies or tokens.

"use strict";

const { spawn, execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { promises: fs } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const ALLOWED_URL_HOSTS = Object.freeze([
  "music.apple.com",
  "itunes.apple.com",
  "classical.music.apple.com",
]);
const AUDIO_EXTENSIONS = new Set([
  ".m4a",
  ".mp3",
  ".aac",
  ".flac",
  ".wav",
  ".aiff",
  ".alac",
]);
const MAX_CONCURRENT_JOBS = 1;
const MAX_LOG_CHARS = 12000;
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * One finished audio file, as the browser queue reads it.
 *
 * @typedef {{
 *   file: string,
 *   title: string,
 *   artist: string,
 *   album: string,
 *   duration: number,
 * }} GamdlResult
 */

/**
 * One download job. A live job also keeps `dir` and `logTail`; a job read back
 * from job.json after a server restart has only the persisted fields.
 *
 * @typedef {{
 *   id: string,
 *   url: string,
 *   status: string,
 *   createdAt: number,
 *   updatedAt: number,
 *   code: string,
 *   error: string,
 *   results: GamdlResult[],
 *   dir?: string,
 *   logTail?: string,
 * }} GamdlJob
 */

/** @type {Map<string, GamdlJob>} */
const jobs = new Map();

function gamdlBinary() {
  return String(process.env.AI_SYSTEM6_GAMDL_BIN || "gamdl");
}

function gamdlCookiesPath() {
  return String(
    process.env.AI_SYSTEM6_GAMDL_COOKIES_PATH
    || path.join(os.homedir(), ".gamdl", "cookies.txt")
  );
}

function gamdlLibraryRoot() {
  return String(
    process.env.AI_SYSTEM6_GAMDL_LIBRARY
    || path.join(os.homedir(), ".ai-system6", "soundscape-gamdl")
  );
}

function gamdlJobDir(jobId) {
  return path.join(gamdlLibraryRoot(), jobId);
}

// The gamdl wrapper is a Python script; its shebang names the interpreter that
// already has mutagen installed. Otherwise fall back to python3 and let the
// metadata script report when mutagen is unavailable.
function metadataPython() {
  if (process.env.AI_SYSTEM6_GAMDL_PYTHON) {
    return String(process.env.AI_SYSTEM6_GAMDL_PYTHON);
  }
  const bin = gamdlBinary();
  if (bin.includes("/") && existsSync(bin)) {
    try {
      const shebang = readFileSync(bin, "utf8").split("\n", 1)[0];
      if (shebang.startsWith("#!")) {
        return shebang.slice(2).trim();
      }
    } catch {}
  }
  return "python3";
}

async function gamdlAvailable() {
  try {
    const { stdout } = await execFileAsync(gamdlBinary(), ["--version"], {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 64 * 1024,
    });
    return /gamdl/i.test(String(stdout || ""));
  } catch {
    return false;
  }
}

function validateAppleMusicUrl(rawUrl) {
  const text = String(rawUrl || "").trim();
  if (!text) return "A link is required.";
  let url;
  try {
    url = new URL(text);
  } catch {
    return "That is not a valid link.";
  }
  if (url.protocol !== "https:") return "Only https links are allowed.";
  if (url.username || url.password) return "Links with credentials are not allowed.";
  if (!ALLOWED_URL_HOSTS.includes(url.hostname)) {
    return "Only Apple Music links are allowed.";
  }
  return "";
}

function runningJobCount() {
  let count = 0;
  for (const job of jobs.values()) {
    if (job.status === "running") count += 1;
  }
  return count;
}

async function findAudioFiles(rootDir) {
  const found = [];
  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (
        entry.isFile()
        && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        found.push(full);
      }
    }
  };
  await walk(rootDir);
  return found.sort();
}

async function extractAudioMetadata(filePaths) {
  const metadataScript = path.join(
    __dirname,
    "..",
    "..",
    "scripts",
    "gamdl-metadata.py"
  );
  try {
    const { stdout } = await execFileAsync(
      metadataPython(),
      [metadataScript, ...filePaths],
      {
        encoding: "utf8",
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
      }
    );
    const parsed = JSON.parse(String(stdout || "[]").trim());
    if (Array.isArray(parsed) && parsed.length === filePaths.length) return parsed;
  } catch {}
  return filePaths.map((filePath) => ({
    path: filePath,
    title: "",
    artist: "",
    album: "",
    duration: 0,
  }));
}

function finalizeResults(job, files, metadataList) {
  const byPath = new Map(metadataList.map((meta) => [meta.path, meta]));
  return files.map((filePath) => {
    const meta = byPath.get(filePath) || {};
    const relPath = path.relative(path.join(job.dir, "audio"), filePath);
    return {
      file: relPath.split(path.sep).map(encodeURIComponent).join("/"),
      title: String(meta.title || path.basename(filePath, path.extname(filePath))),
      artist: String(meta.artist || ""),
      album: String(meta.album || ""),
      duration: Number(meta.duration) || 0,
    };
  });
}

function touchLog(job, text) {
  job.logTail = `${(job.logTail || "")}${text}`.slice(-MAX_LOG_CHARS);
  job.updatedAt = Date.now();
}

function jobFailed(job, code, message) {
  job.status = "error";
  job.code = code;
  job.error = String(message || "gamdl did not complete the download.").slice(0, 2000);
  job.updatedAt = Date.now();
}

async function saveJob(job) {
  if (job.status === "running") return;
  const payload = {
    id: job.id,
    url: job.url,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    code: job.code || "",
    error: job.error || "",
    results: job.results || [],
  };
  try {
    await fs.writeFile(path.join(job.dir, "job.json"), JSON.stringify(payload, null, 2), "utf8");
  } catch {}
}

async function runGamdlProcess(job) {
  const audioDir = path.join(job.dir, "audio");
  const tempDir = path.join(job.dir, "temp");
  await fs.mkdir(tempDir, { recursive: true }).catch(() => {});
  const args = [
    "--no-config-file",
    "--cookies-path", gamdlCookiesPath(),
    "--temp-path", tempDir,
    "--output-path", audioDir,
    "--song-codec-priority", "aac-web",
    "--no-synced-lyrics",
    job.url,
  ];

  // The type hint keeps `resolve()` callable without a value.
  await /** @type {Promise<void>} */ (new Promise((resolve) => {
    let child;
    try {
      child = spawn(gamdlBinary(), args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      jobFailed(job, "gamdl_unavailable", error.message);
      resolve();
      return;
    }
    const append = (chunk) => {
      if (job.status !== "running") return;
      touchLog(job, String(chunk || ""));
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (error) => {
      jobFailed(job, "gamdl_unavailable", error.message);
      resolve();
    });
    child.on("close", (code) => {
      if (job.status === "running" && code !== 0) {
        jobFailed(job, "gamdl_failed", `gamdl exited with code ${code}.`);
      }
      resolve();
    });
  }));

  if (job.status === "running") {
    const files = await findAudioFiles(audioDir);
    if (!files.length) {
      jobFailed(job, "gamdl_no_files", "gamdl finished without producing audio files.");
    } else {
      const metadata = await extractAudioMetadata(files);
      job.results = finalizeResults(job, files, metadata);
      job.status = "done";
      job.updatedAt = Date.now();
    }
  }

  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  await saveJob(job);
}

/**
 * Start a gamdl download for one Apple Music link.
 *
 * @param {string} rawUrl
 * @returns {Promise<{ ok: boolean, status?: number, code?: string, error?: string, job?: GamdlJob }>}
 */
async function startGamdlJob(rawUrl) {
  const urlError = validateAppleMusicUrl(rawUrl);
  if (urlError) {
    return { ok: false, status: 400, code: "gamdl_invalid_url", error: urlError };
  }
  if (!(await gamdlAvailable())) {
    return {
      ok: false,
      status: 503,
      code: "gamdl_unavailable",
      error: "gamdl is not installed on this Mac.",
    };
  }
  if (!existsSync(gamdlCookiesPath())) {
    return {
      ok: false,
      status: 412,
      code: "gamdl_cookies_missing",
      error: "gamdl needs Apple Music cookies on this Mac.",
    };
  }
  if (runningJobCount() >= MAX_CONCURRENT_JOBS) {
    return {
      ok: false,
      status: 409,
      code: "gamdl_busy",
      error: "Another gamdl download is already running.",
    };
  }

  const id = randomUUID();
  const dir = gamdlJobDir(id);
  await fs.mkdir(path.join(dir, "audio"), { recursive: true });
  const job = {
    id,
    url: String(rawUrl || "").trim(),
    dir,
    status: "running",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    logTail: "",
    code: "",
    error: "",
    results: [],
  };
  jobs.set(id, job);
  runGamdlProcess(job);
  return { ok: true, job };
}

/**
 * Resolve a job from memory, or from its persisted job.json after a server
 * restart. Returns null for unknown ids.
 *
 * @param {string} jobId
 * @returns {Promise<GamdlJob | null>}
 */
async function getGamdlJob(jobId) {
  if (!JOB_ID_PATTERN.test(jobId)) return null;
  const live = jobs.get(jobId);
  if (live) return live;
  try {
    const parsed = JSON.parse(
      await fs.readFile(path.join(gamdlJobDir(jobId), "job.json"), "utf8")
    );
    return parsed && parsed.id === jobId ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a downloaded file path for one job, guarding against traversal.
 *
 * @param {string} jobId
 * @param {string[]} segments
 * @returns {Promise<string | null>} Absolute audio path, or null when unsafe/missing.
 */
async function resolveGamdlAudioFile(jobId, segments) {
  if (!JOB_ID_PATTERN.test(jobId) || !segments.length) return null;
  const base = path.join(gamdlJobDir(jobId), "audio");
  const candidate = path.join(base, ...segments);
  if (!candidate.startsWith(`${base}${path.sep}`)) return null;
  try {
    const stat = await fs.stat(candidate);
    return stat.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

module.exports = {
  AUDIO_EXTENSIONS,
  JOB_ID_PATTERN,
  gamdlBinary,
  gamdlCookiesPath,
  gamdlLibraryRoot,
  getGamdlJob,
  resolveGamdlAudioFile,
  startGamdlJob,
  validateAppleMusicUrl,
};
