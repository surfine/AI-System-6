// Host-side bridge for Soundscape's "Apple Music link" downloads.
//
// The writer pastes an album, song or playlist link; this Mac fetches it with
// the host tools it has and hands finished audio back to the Soundscape queue.
// Two engines, both optional, both called directly by absolute path with argv
// (never a shell):
//
// - aac:  gamdl (https://github.com/glomatico/gamdl) with the writer's
//         Apple Music cookies — AAC 256 kbps.
// - alac / flac: apple-music-downloader
//         (https://github.com/zhaarey/apple-music-downloader) through a
//         wrapper-lite decryption service — lossless, converted to FLAC by
//         its own ffmpeg step when the browser cannot play ALAC.
//
// The quality is whatever the asking browser can play and this Mac can fetch;
// the writer never chooses. A failed lossless run falls back to AAC in the
// same job. The same link always lands in the same folder, and both tools skip
// files that already exist, so a repeated link is a cache hit and a playlist
// re-run only adds new tracks. The browser never sees cookies or tokens.

"use strict";

const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { existsSync } = require("node:fs");
const { promises: fs } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { readAudioTags } = require("./audio-tags.js");
const { discoverMusicTools } = require("./music-tools.js");
const wrapperLite = require("./wrapper-lite.js");

const ALLOWED_URL_HOSTS = Object.freeze([
  "music.apple.com",
  "classical.music.apple.com",
]);
const SUPPORTED_KINDS = new Set(["album", "song", "playlist"]);
const UNSUPPORTED_KINDS = new Set(["music-video", "station", "artist", "curator", "post"]);
const AUDIO_EXTENSIONS = new Set([".m4a", ".mp4", ".flac", ".mp3", ".aac", ".wav", ".aiff"]);
const QUALITIES = Object.freeze(["alac", "flac", "aac"]);
const QUALITY_RANK = Object.freeze({ alac: 2, flac: 2, aac: 1 });
const MAX_QUEUED_JOBS = 5;
const MAX_TRACKS_PER_JOB = 200;
const MAX_LOG_CHARS = 12000;
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CACHE_KEY_PATTERN = /^[a-z]{2}-(album|song|playlist)-[a-z0-9.]{1,64}(-i[0-9]{1,20})?$/;
const LINK_PATTERN = /https:\/\/(?:classical\.)?music\.apple\.com\/[^\s"'<>]+/i;

/**
 * @typedef {{
 *   file: string,
 *   title: string,
 *   artist: string,
 *   album: string,
 *   duration: number,
 *   disc: number,
 *   track: number,
 *   codec: string,
 *   sampleRate: number,
 *   bitDepth: number,
 * }} GamdlResult
 *
 * @typedef {{
 *   id: string,
 *   url: string,
 *   cacheKey: string,
 *   kind: string,
 *   status: string,
 *   quality: string,
 *   targetQuality: string,
 *   fallbackReason: string,
 *   progress: { done: number, total: number },
 *   createdAt: number,
 *   updatedAt: number,
 *   code: string,
 *   error: string,
 *   origin: string,
 *   results: GamdlResult[],
 *   logTail?: string,
 * }} GamdlJob
 */

/** @type {Map<string, GamdlJob>} */
const jobs = new Map();
/** @type {GamdlJob[]} */
const pending = [];
let running = null;

// ---------- paths ----------

function gamdlLibraryRoot() {
  return String(
    process.env.AI_SYSTEM6_GAMDL_LIBRARY
    || path.join(os.homedir(), ".ai-system6", "soundscape-gamdl")
  );
}

function libraryMaxBytes() {
  const gb = Number(process.env.AI_SYSTEM6_GAMDL_LIBRARY_MAX_GB);
  return (Number.isFinite(gb) && gb > 0 ? gb : 50) * 1024 ** 3;
}

function qualityDir(cacheKey, quality) {
  return path.join(gamdlLibraryRoot(), "library", cacheKey, quality);
}

function jobRecordPath(jobId) {
  return path.join(gamdlLibraryRoot(), "jobs", `${jobId}.json`);
}

function legacyJobDir(jobId) {
  return path.join(gamdlLibraryRoot(), jobId);
}

// ---------- links ----------

/**
 * Pull the first Apple Music link out of pasted text and reduce it to what
 * identifies the music: storefront, kind, id and, for one track of an album,
 * the `i` parameter. Interface parameters such as `l=` are dropped.
 *
 * @param {string} text
 * @returns {{ ok: true, url: string, storefront: string, kind: string, id: string, trackId: string, cacheKey: string }
 *   | { ok: false, code: string, error: string }}
 */
function parseAppleMusicLink(text) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, code: "gamdl_invalid_url", error: "A link is required." };
  const found = LINK_PATTERN.exec(raw)?.[0] || raw;
  let url;
  try {
    url = new URL(found);
  } catch {
    return { ok: false, code: "gamdl_invalid_url", error: "That is not a valid link." };
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    return { ok: false, code: "gamdl_invalid_url", error: "Only plain https Apple Music links are allowed." };
  }
  if (!ALLOWED_URL_HOSTS.includes(url.hostname)) {
    return { ok: false, code: "gamdl_invalid_url", error: "Only Apple Music links are allowed." };
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const storefront = String(parts[0] || "").toLowerCase();
  const kind = String(parts[1] || "").toLowerCase();
  if (!/^[a-z]{2}$/.test(storefront)) {
    return { ok: false, code: "gamdl_invalid_url", error: "The link has no storefront." };
  }
  if (UNSUPPORTED_KINDS.has(kind)) {
    return { ok: false, code: "apple_music_unsupported_kind", error: "Soundscape takes album, song and playlist links." };
  }
  if (!SUPPORTED_KINDS.has(kind)) {
    return { ok: false, code: "gamdl_invalid_url", error: "That Apple Music link is not an album, song or playlist." };
  }
  const last = String(parts[parts.length - 1] || "");
  const id = kind === "playlist"
    ? (/^pl\.[a-z0-9]{1,60}$/i.exec(last)?.[0] || "").toLowerCase()
    : (/^(?:id)?(\d{1,20})$/.exec(last)?.[1] || "");
  if (!id) return { ok: false, code: "gamdl_invalid_url", error: "The link has no album, song or playlist id." };
  const trackId = kind === "album" ? (/^\d{1,20}$/.exec(url.searchParams.get("i") || "")?.[0] || "") : "";
  const clean = new URL(`https://${url.hostname}${url.pathname}`);
  if (trackId) clean.searchParams.set("i", trackId);
  return {
    ok: true,
    url: clean.href,
    storefront,
    kind,
    id,
    trackId,
    cacheKey: `${storefront}-${kind}-${id}${trackId ? `-i${trackId}` : ""}`,
  };
}

// Kept for callers that only need a yes/no.
function validateAppleMusicUrl(rawUrl) {
  const parsed = parseAppleMusicLink(rawUrl);
  return parsed.ok === true ? "" : parsed.error;
}

// ---------- engines and quality ----------

/**
 * What the browser says it can play, reduced to booleans.
 *
 * @param {any} value
 * @returns {{ alac: boolean, flac: boolean, aac: boolean }}
 */
function normalizePlayable(value) {
  return {
    alac: value?.alac === true,
    flac: value?.flac === true,
    // Every browser Soundscape supports plays AAC in MP4; a client that says
    // nothing still gets the one format that always works.
    aac: value?.aac !== false,
  };
}

/**
 * The quality to fetch, in order of preference, given what the browser plays
 * and which engines this Mac has. Lossless is tried first when possible and
 * AAC stays as the fallback.
 *
 * @param {{ alac: boolean, flac: boolean, aac: boolean }} playable
 * @param {{ aac: boolean, lossless: boolean, ffmpeg: boolean }} engines
 * @returns {string[]}
 */
function qualityPlan(playable, engines) {
  const plan = [];
  if (engines.lossless && playable.alac) plan.push("alac");
  else if (engines.lossless && engines.ffmpeg && playable.flac) plan.push("flac");
  if (engines.aac) plan.push("aac");
  return plan;
}

// Lossless counts as available when wrapper-lite answers signed in, or is
// asleep and this server may wake it. An instance that answers without an
// Apple ID does not count: every lossless run would fail into AAC.
async function losslessState(tools) {
  if (!tools.amdl) return "missing";
  const status = await wrapperLite.wrapperStatus(tools.liteUrl);
  if (status.reachable) return status.loggedIn === false ? "login_required" : "ready";
  if (tools.wrapperLauncher && wrapperLite.autostartEnabled()) return "sleeping";
  return "off";
}

async function engineAvailability(tools) {
  const lossless = await losslessState(tools);
  return {
    aac: Boolean(tools.gamdl && tools.cookies),
    lossless: lossless === "ready" || lossless === "sleeping",
    losslessState: lossless,
    ffmpeg: Boolean(tools.ffmpeg),
  };
}

/**
 * The status Soundscape shows before a download. Contains no paths.
 */
async function gamdlStatus() {
  const tools = await discoverMusicTools({ refresh: true });
  const engines = await engineAvailability(tools);
  return {
    engines: {
      aac: engines.aac,
      alac: engines.lossless,
      flac: engines.lossless && engines.ffmpeg,
    },
    lossless: { state: engines.losslessState },
    cookies: tools.cookies ? "ok" : "missing",
    gamdl: tools.gamdl ? "ok" : "missing",
  };
}

// ---------- cache ----------

async function readResultFile(cacheKey, quality) {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(qualityDir(cacheKey, quality), "result.json"), "utf8"));
    if (!Array.isArray(parsed?.results) || !parsed.results.length) return null;
    const audioDir = path.join(qualityDir(cacheKey, quality), "audio");
    for (const item of parsed.results) {
      const segments = String(item.file || "").split("/").map(decodeURIComponent);
      if (!existsSync(path.join(audioDir, ...segments))) return null;
    }
    return parsed.results;
  } catch {
    return null;
  }
}

/**
 * A finished download of this link at a quality at least as good as the best
 * this Mac could fetch now, in a format the browser plays.
 */
async function cachedResult(link, playable, bestRank) {
  if (link.kind === "playlist") return null;
  for (const quality of QUALITIES) {
    if (!playable[quality] || QUALITY_RANK[quality] < bestRank) continue;
    const results = await readResultFile(link.cacheKey, quality);
    if (results) return { quality, results };
  }
  return null;
}

async function directorySize(dir) {
  let total = 0;
  const walk = async (current) => {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) total += (await fs.stat(full).catch(() => ({ size: 0 }))).size;
    }
  };
  await walk(dir);
  return total;
}

async function findAudioFiles(rootDir) {
  const found = [];
  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(full);
    }
  };
  await walk(rootDir);
  return found.sort();
}

async function collectResults(audioDir) {
  const files = await findAudioFiles(audioDir);
  const results = [];
  for (const filePath of files) {
    const tags = await readAudioTags(filePath);
    results.push({
      file: path.relative(audioDir, filePath).split(path.sep).map(encodeURIComponent).join("/"),
      title: tags.title || path.basename(filePath, path.extname(filePath)),
      artist: tags.artist,
      album: tags.album,
      duration: tags.duration,
      disc: tags.disc,
      track: tags.track,
      codec: tags.codec,
      sampleRate: tags.sampleRate,
      bitDepth: tags.bitDepth,
    });
  }
  // Album order: disc, then track, then path for anything untagged.
  return results.sort((a, b) =>
    (a.disc || 0) - (b.disc || 0)
    || (a.track || 0) - (b.track || 0)
    || a.file.localeCompare(b.file));
}

// ---------- jobs ----------

function touchLog(job, text) {
  job.logTail = `${job.logTail || ""}${text}`.slice(-MAX_LOG_CHARS);
  job.updatedAt = Date.now();
}

function setJobState(job, status) {
  job.status = status;
  job.updatedAt = Date.now();
}

function failJob(job, code, message) {
  job.status = "error";
  job.code = code;
  job.error = String(message || "The download did not complete.").slice(0, 500);
  job.updatedAt = Date.now();
}

async function saveJob(job) {
  const payload = {
    id: job.id,
    url: job.url,
    cacheKey: job.cacheKey,
    kind: job.kind,
    status: job.status,
    quality: job.quality,
    targetQuality: job.targetQuality,
    fallbackReason: job.fallbackReason,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    code: job.code,
    error: job.error,
    origin: job.origin,
    results: job.results,
  };
  try {
    await fs.mkdir(path.dirname(jobRecordPath(job.id)), { recursive: true });
    await fs.writeFile(jobRecordPath(job.id), JSON.stringify(payload, null, 2), "utf8");
  } catch {}
}

// Both tools print "Track n/m" (gamdl) or "Track n of m" (apple-music-
// downloader) as they go; that is progress, and m is the job's size.
const PROGRESS_PATTERN = /Track\s+(\d+)\s*(?:\/|of)\s*(\d+)/gi;

function readProgress(job, chunk) {
  let match;
  PROGRESS_PATTERN.lastIndex = 0;
  while ((match = PROGRESS_PATTERN.exec(chunk))) {
    const done = Number(match[1]);
    const total = Number(match[2]);
    if (total > 0 && done <= total) job.progress = { done, total };
  }
}

/**
 * Run one downloader to completion. Resolves with the exit code, or a code
 * string when the process could not start or was stopped for size.
 */
function runTool(job, binary, args, options = {}) {
  return new Promise((resolve) => {
    let child;
    let stoppedFor = "";
    try {
      child = spawn(binary, args, {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NO_COLOR: "1", TERM: "dumb" },
      });
    } catch {
      resolve("spawn_failed");
      return;
    }
    const onData = (chunk) => {
      const text = String(chunk || "");
      touchLog(job, text);
      readProgress(job, text);
      if (job.progress.total > MAX_TRACKS_PER_JOB && !stoppedFor) {
        stoppedFor = "gamdl_too_many_tracks";
        child.kill("SIGTERM");
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", () => resolve(stoppedFor || "spawn_failed"));
    child.on("close", (code) => resolve(stoppedFor || code));
  });
}

function gamdlFailureCode(logTail) {
  const text = String(logTail || "");
  if (/cookie|401|403|unauthori[sz]ed|not logged in|subscription/i.test(text)) return "gamdl_cookies_expired";
  return "gamdl_failed";
}

async function runAac(job, tools) {
  if (!tools.gamdl) return { ok: false, code: "gamdl_unavailable" };
  if (!tools.cookies) return { ok: false, code: "gamdl_cookies_missing" };
  const dir = qualityDir(job.cacheKey, "aac");
  const audioDir = path.join(dir, "audio");
  const tempDir = path.join(gamdlLibraryRoot(), "tmp", job.id);
  await fs.mkdir(audioDir, { recursive: true });
  await fs.mkdir(tempDir, { recursive: true });
  try {
    const exit = await runTool(job, tools.gamdl, [
      "--no-config-file",
      "--cookies-path", tools.cookies,
      "--temp-path", tempDir,
      "--output-path", audioDir,
      "--song-codec-priority", "aac-web",
      "--no-synced-lyrics",
      job.url,
    ]);
    if (exit === "gamdl_too_many_tracks") return { ok: false, code: exit };
    if (exit === "spawn_failed") return { ok: false, code: "gamdl_unavailable" };
    if (exit !== 0) return { ok: false, code: gamdlFailureCode(job.logTail) };
    return { ok: true, audioDir };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Write apple-music-downloader's config for one job: the writer's own
 * config.yaml with only the listed top-level keys replaced (or appended).
 * Returns null when a key to replace is not a plain one-line scalar, so an
 * unfamiliar config never gets silently mangled.
 *
 * @param {string} text
 * @param {Record<string, string | boolean>} overrides
 * @returns {string | null}
 */
function amdlJobConfig(text, overrides) {
  const lines = String(text || "").split("\n");
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z0-9_-]+)\s*:(.*)$/.exec(lines[index]);
    if (!match || !Object.prototype.hasOwnProperty.call(overrides, match[1])) continue;
    const key = match[1];
    const rest = match[2].replace(/\s+#.*$/, "").trim();
    const next = lines[index + 1] || "";
    if (!rest && /^\s+\S/.test(next)) return null;
    lines[index] = `${key}: ${JSON.stringify(overrides[key])}`;
    seen.add(key);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!seen.has(key)) lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  return lines.join("\n");
}

async function runLossless(job, tools, quality) {
  if (!tools.amdl) return { ok: false, code: "lossless_unavailable" };
  if (quality === "flac" && !tools.ffmpeg) return { ok: false, code: "lossless_unavailable" };
  const ready = await wrapperLite.ensureWrapperLite(tools, gamdlLibraryRoot(), () => setJobState(job, "waking"));
  if (!ready.ok) return { ok: false, code: ready.code || "lossless_unavailable" };
  setJobState(job, "running");

  const dir = qualityDir(job.cacheKey, quality);
  const audioDir = path.join(dir, "audio");
  const workDir = path.join(gamdlLibraryRoot(), "tmp", job.id);
  await fs.mkdir(audioDir, { recursive: true });
  await fs.mkdir(workDir, { recursive: true });
  wrapperLite.noteWrapperBusy();
  try {
    const userConfig = await fs.readFile(path.join(tools.amdlDir, "config.yaml"), "utf8");
    const config = amdlJobConfig(userConfig, {
      "alac-save-folder": audioDir,
      "atmos-save-folder": audioDir,
      "aac-save-folder": audioDir,
      "mv-save-folder": audioDir,
      "exit-on-error": true,
      "embed-lrc": false,
      "save-lrc-file": false,
      "save-artist-cover": false,
      "save-animated-artwork": false,
      "emby-animated-artwork": false,
      "convert-after-download": quality === "flac",
      "convert-format": "flac",
      "convert-keep-original": false,
      "ffmpeg-path": tools.ffmpeg || "ffmpeg",
    });
    if (config === null) return { ok: false, code: "lossless_config_unsupported" };
    await fs.writeFile(path.join(workDir, "config.yaml"), config, "utf8");
    await fs.copyFile(
      path.join(tools.amdlDir, "config.yaml.example"),
      path.join(workDir, "config.yaml.example")
    ).catch(() => {});

    const exit = await runTool(job, tools.amdl, ["--lite-server", tools.liteUrl, job.url], { cwd: workDir });
    if (exit === "gamdl_too_many_tracks") return { ok: false, code: exit };
    if (exit === "spawn_failed") return { ok: false, code: "lossless_unavailable" };
    // apple-music-downloader does not always turn a failed album into a
    // non-zero exit, so its closing summary must also report no errors.
    const summary = /Completed:\s*(\d+)\s*\/\s*(\d+).*?Errors:\s*(\d+)/i.exec(job.logTail || "");
    const clean = exit === 0 && summary && Number(summary[3]) === 0;
    if (!clean) {
      const text = String(job.logTail || "");
      if (/token|login|401|403/i.test(text)) return { ok: false, code: "lossless_login_required" };
      return { ok: false, code: "lossless_failed" };
    }
    return { ok: true, audioDir };
  } catch {
    return { ok: false, code: "lossless_failed" };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    wrapperLite.noteWrapperIdle();
  }
}

async function finishWithResults(job, quality, audioDir) {
  const results = await collectResults(audioDir);
  if (!results.length) return false;
  await fs.writeFile(
    path.join(path.dirname(audioDir), "result.json"),
    JSON.stringify({ url: job.url, quality, fetchedAt: new Date().toISOString(), results }, null, 2),
    "utf8"
  ).catch(() => {});
  job.results = results;
  job.quality = quality;
  setJobState(job, "done");
  return true;
}

async function runJob(job) {
  const tools = await discoverMusicTools();
  const engines = await engineAvailability(tools);
  const plan = qualityPlan(job.playable, engines);
  if (!plan.length) {
    failJob(job, tools.gamdl ? "gamdl_cookies_missing" : "gamdl_unavailable", "No download engine is ready on this Mac.");
    return;
  }
  if (await directorySize(path.join(gamdlLibraryRoot(), "library")) > libraryMaxBytes()) {
    failJob(job, "gamdl_library_full", "The Soundscape download folder is full.");
    return;
  }
  job.targetQuality = plan[0];
  let lastCode = "";
  for (const quality of plan) {
    job.logTail = "";
    job.progress = { done: 0, total: 0 };
    setJobState(job, "running");
    const outcome = quality === "aac"
      ? await runAac(job, tools)
      : await runLossless(job, tools, quality);
    if (outcome.ok && await finishWithResults(job, quality, outcome.audioDir)) {
      if (quality !== plan[0]) job.fallbackReason = lastCode;
      return;
    }
    lastCode = outcome.ok ? "gamdl_no_files" : outcome.code;
    // Too many tracks is the link's size, not the engine's fault: no fallback.
    if (lastCode === "gamdl_too_many_tracks") break;
  }
  failJob(job, lastCode || "gamdl_failed", "The download did not complete.");
}

async function pumpQueue() {
  if (running) return;
  const job = pending.shift();
  if (!job) return;
  running = job;
  try {
    await runJob(job);
  } catch (error) {
    failJob(job, "gamdl_failed", error?.message);
  } finally {
    await saveJob(job);
    running = null;
    pumpQueue();
  }
}

function activeJobFor(cacheKey) {
  if (running?.cacheKey === cacheKey) return running;
  return pending.find((job) => job.cacheKey === cacheKey) || null;
}

/**
 * Queue a download for one Apple Music link, or answer at once from the cache.
 *
 * @param {string} rawUrl
 * @param {{ playable?: any, origin?: string }} [options]
 * @returns {Promise<{ ok: boolean, status?: number, code?: string, error?: string, job?: GamdlJob }>}
 */
async function startGamdlJob(rawUrl, options = {}) {
  const link = parseAppleMusicLink(rawUrl);
  if (link.ok === false) return { ok: false, status: 400, code: link.code, error: link.error };
  const playable = normalizePlayable(options.playable);
  const tools = await discoverMusicTools();
  const engines = await engineAvailability(tools);
  const plan = qualityPlan(playable, engines);
  const bestRank = plan.length ? QUALITY_RANK[plan[0]] : 0;

  const cached = await cachedResult(link, playable, bestRank || 1);
  const now = Date.now();
  const base = {
    url: link.url,
    cacheKey: link.cacheKey,
    kind: link.kind,
    targetQuality: plan[0] || "",
    fallbackReason: "",
    progress: { done: 0, total: 0 },
    createdAt: now,
    updatedAt: now,
    code: "",
    error: "",
    origin: String(options.origin || ""),
    results: [],
    logTail: "",
  };
  if (cached) {
    const job = { ...base, id: randomUUID(), status: "done", quality: cached.quality, results: cached.results, playable };
    jobs.set(job.id, job);
    await saveJob(job);
    return { ok: true, status: 200, job };
  }
  if (!plan.length) {
    if (!tools.gamdl) return { ok: false, status: 503, code: "gamdl_unavailable", error: "No Apple Music download tool is installed on this Mac." };
    return { ok: false, status: 412, code: "gamdl_cookies_missing", error: "Apple Music cookies are missing on this Mac." };
  }
  const existing = activeJobFor(link.cacheKey);
  if (existing) return { ok: true, status: 202, job: existing };
  if (pending.length + (running ? 1 : 0) >= MAX_QUEUED_JOBS) {
    return { ok: false, status: 409, code: "gamdl_queue_full", error: "Five downloads are already waiting." };
  }
  const job = { ...base, id: randomUUID(), status: "queued", quality: "", playable };
  jobs.set(job.id, job);
  pending.push(job);
  pumpQueue();
  return { ok: true, status: 202, job };
}

/**
 * @param {string} jobId
 * @returns {Promise<GamdlJob | null>}
 */
async function getGamdlJob(jobId) {
  if (!JOB_ID_PATTERN.test(jobId)) return null;
  const live = jobs.get(jobId);
  if (live) return live;
  for (const file of [jobRecordPath(jobId), path.join(legacyJobDir(jobId), "job.json")]) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8"));
      if (parsed && parsed.id === jobId) return parsed;
    } catch {}
  }
  return null;
}

async function statFile(candidate, base) {
  if (!candidate.startsWith(`${base}${path.sep}`)) return null;
  try {
    const stat = await fs.stat(candidate);
    return stat.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a downloaded file from its URL segments, guarding against
 * traversal. New files live under `<cacheKey>/<quality>/…`; files from before
 * the stable library under `<jobId>/…` stay readable.
 *
 * @param {string[]} segments Decoded path segments after /files/.
 * @returns {Promise<string | null>}
 */
async function resolveGamdlAudioFile(segments) {
  const [first, second, ...rest] = segments;
  if (JOB_ID_PATTERN.test(first || "")) {
    const base = path.join(legacyJobDir(first), "audio");
    const tail = [second, ...rest].filter(Boolean);
    return tail.length ? statFile(path.join(base, ...tail), base) : null;
  }
  if (!CACHE_KEY_PATTERN.test(first || "") || !QUALITIES.includes(second || "") || !rest.length) return null;
  const base = path.join(qualityDir(first, second), "audio");
  return statFile(path.join(base, ...rest), base);
}

/**
 * The public path of one cached file, as the browser requests it.
 */
function gamdlFilePath(cacheKey, quality, file) {
  return `/api/music/gamdl/files/${cacheKey}/${quality}/${file}`;
}

function isValidFileRef(ref) {
  return CACHE_KEY_PATTERN.test(String(ref?.cacheKey || ""))
    && QUALITIES.includes(String(ref?.quality || ""))
    && /^[^/\\]/.test(String(ref?.file || ""))
    && !String(ref.file).split("/").some((part) => {
      try {
        const decoded = decodeURIComponent(part);
        return !decoded || decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\");
      } catch {
        return true;
      }
    });
}

module.exports = {
  AUDIO_EXTENSIONS,
  CACHE_KEY_PATTERN,
  JOB_ID_PATTERN,
  MAX_QUEUED_JOBS,
  MAX_TRACKS_PER_JOB,
  amdlJobConfig,
  gamdlFilePath,
  gamdlLibraryRoot,
  gamdlStatus,
  getGamdlJob,
  isValidFileRef,
  normalizePlayable,
  parseAppleMusicLink,
  qualityPlan,
  resolveGamdlAudioFile,
  startGamdlJob,
  validateAppleMusicUrl,
};
