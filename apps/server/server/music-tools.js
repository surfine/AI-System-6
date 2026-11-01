// Find the optional host tools behind Soundscape's Apple Music links without
// relying on the shell's PATH. The packaged Mac app starts this server from a
// GUI launch, whose PATH has none of Homebrew, pipx or ~/.local, so a bare
// "gamdl" was never found there. Every tool is optional; the caller degrades
// by what is present.
//
// Discovery only stats files and reads two plain config files. It never runs a
// shell, and it never executes the user's own wrapper scripts (such as `am`):
// the downloaders are called directly, by absolute path, with argv.

"use strict";

const { constants: fsConstants, promises: fs } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CACHE_MS = 60 * 1000;
const DEFAULT_LITE_URL = "http://127.0.0.1:12340";

let cached = null;
let cachedAt = 0;

function homeDir() {
  return os.homedir();
}

function binDirs() {
  const home = homeDir();
  const fromPath = String(process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  return [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(home, ".local", "bin"),
    ...fromPath,
  ].filter((dir, index, all) => all.indexOf(dir) === index);
}

async function isExecutable(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function isFile(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function findBinary(name, envOverride) {
  const override = String(process.env[envOverride] || "").trim();
  if (override) {
    if (override.includes("/")) return (await isExecutable(override)) ? override : "";
    name = override;
  }
  for (const dir of binDirs()) {
    const candidate = path.join(dir, name);
    if (await isExecutable(candidate)) return candidate;
  }
  return "";
}

async function firstFile(candidates) {
  for (const candidate of candidates) {
    if (candidate && await isFile(candidate)) return candidate;
  }
  return "";
}

function appleMusicDlRoot() {
  return path.join(homeDir(), "Music", "AppleMusicDL");
}

// An explicit override is authoritative: when it is set but empty or wrong,
// the tool counts as absent rather than quietly falling back to the default
// location. A test or a writer who points elsewhere must never end up
// driving the real tools in ~/Music/AppleMusicDL.
function candidateList(envName, fallback) {
  if (Object.prototype.hasOwnProperty.call(process.env, envName)) {
    const override = String(process.env[envName] || "").trim();
    return override ? [override] : [];
  }
  return [fallback];
}

async function findAmdlDir() {
  const candidates = candidateList("AI_SYSTEM6_AMDL_DIR", path.join(appleMusicDlRoot(), "apple-music-downloader"));
  for (const dir of candidates) {
    if (await isExecutable(path.join(dir, "amdl")) && await isFile(path.join(dir, "config.yaml"))) {
      return dir;
    }
  }
  return "";
}

async function findWrapperLauncher() {
  const candidates = candidateList("AI_SYSTEM6_WRAPPER_LITE_DIR", path.join(appleMusicDlRoot(), "wrapper-lite"));
  for (const dir of candidates) {
    const launcher = path.join(dir, "wrapper-lite-qemu");
    if (await isExecutable(launcher)) return launcher;
  }
  return "";
}

/**
 * Read one top-level scalar from a flat YAML file ("key: value # comment").
 *
 * @param {string} text
 * @param {string} key
 * @returns {string}
 */
function flatYamlValue(text, key) {
  const pattern = new RegExp(`^${key.replace(/[-]/g, "\\-")}\\s*:\\s*(.*)$`, "m");
  const match = pattern.exec(String(text || ""));
  if (!match) return "";
  let value = match[1].trim();
  if (value.startsWith("\"") || value.startsWith("'")) {
    const quote = value[0];
    const end = value.indexOf(quote, 1);
    return end > 0 ? value.slice(1, end) : "";
  }
  const hash = value.indexOf(" #");
  if (hash >= 0) value = value.slice(0, hash);
  return value.trim();
}

function normalizedLiteUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

async function readLiteUrl(amdlDir) {
  const fromEnv = normalizedLiteUrl(process.env.AI_SYSTEM6_WRAPPER_LITE_URL);
  if (fromEnv) return fromEnv;
  if (amdlDir) {
    try {
      const config = await fs.readFile(path.join(amdlDir, "config.yaml"), "utf8");
      const fromConfig = normalizedLiteUrl(flatYamlValue(config, "lite-server"));
      if (fromConfig) return fromConfig;
    } catch {}
  }
  return DEFAULT_LITE_URL;
}

/**
 * @typedef {{
 *   gamdl: string,
 *   cookies: string,
 *   amdlDir: string,
 *   amdl: string,
 *   liteUrl: string,
 *   wrapperLauncher: string,
 *   qemu: string,
 *   ffmpeg: string,
 * }} MusicTools
 */

/**
 * Discover the host tools. Results are cached for a minute; pass
 * `{ refresh: true }` after the writer installs something.
 *
 * @param {{ refresh?: boolean }} [options]
 * @returns {Promise<MusicTools>}
 */
async function discoverMusicTools(options = {}) {
  if (!options.refresh && cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const home = homeDir();
  const amdlDir = await findAmdlDir();
  const [gamdl, cookies, wrapperLauncher, qemu, ffmpeg, liteUrl] = await Promise.all([
    findBinary("gamdl", "AI_SYSTEM6_GAMDL_BIN"),
    firstFile(Object.prototype.hasOwnProperty.call(process.env, "AI_SYSTEM6_GAMDL_COOKIES_PATH")
      ? [String(process.env.AI_SYSTEM6_GAMDL_COOKIES_PATH || "").trim()]
      : [path.join(home, ".gamdl", "cookies.txt"), path.join(appleMusicDlRoot(), "cookies.txt")]),
    findWrapperLauncher(),
    findBinary("qemu-system-x86_64", "AI_SYSTEM6_QEMU_BIN"),
    findBinary("ffmpeg", "AI_SYSTEM6_FFMPEG_BIN"),
    readLiteUrl(amdlDir),
  ]);
  cached = Object.freeze({
    gamdl,
    cookies,
    amdlDir,
    amdl: amdlDir ? path.join(amdlDir, "amdl") : "",
    liteUrl,
    wrapperLauncher,
    qemu,
    ffmpeg,
  });
  cachedAt = Date.now();
  return cached;
}

function resetMusicToolsCache() {
  cached = null;
  cachedAt = 0;
}

module.exports = {
  DEFAULT_LITE_URL,
  discoverMusicTools,
  flatYamlValue,
  resetMusicToolsCache,
};
