// /api/music/gamdl/* — Soundscape's Apple Music link downloads.
//
// Local-only: public deployments never register these routes. A public page
// (VPS or Pages) reaches them only through the loopback bridge on the
// writer's own Mac, and then only with a pairing token issued on that Mac
// (spec §10.2). Bridged responses carry no logs, paths or tool output, and
// their audio URLs are signed because <audio> requests carry no Origin.

"use strict";

const { createReadStream, promises: fs } = require("node:fs");
const path = require("node:path");

const { readJsonBody, sendJson } = require("../lib/http.js");
const gamdl = require("../gamdl.js");
const bridge = require("../music-bridge.js");
const { signMediaPath } = require("../security/media-signature.js");

const AUDIO_MIME = Object.freeze({
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".aiff": "audio/aiff",
});
const MAX_SIGN_REFS = 500;

function pathnameOf(req) {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  } catch {
    return String(req.url || "/").split("?")[0];
  }
}

function bridgeOriginOf(req) {
  return String(/** @type {any} */ (req).aiSystem6BridgeOrigin || "");
}

/**
 * For a bridged request, check its pairing token. Returns true when the
 * request may proceed (always for the desk's own same-origin requests).
 */
async function bridgePaired(req) {
  const origin = bridgeOriginOf(req);
  if (!origin) return true;
  const token = String(req.headers["x-ai-system-6-bridge"] || "");
  return bridge.verifyPairing(gamdl.gamdlLibraryRoot(), origin, token);
}

function sendPairingRequired(res) {
  sendJson(res, 401, {
    code: "bridge_pairing_required",
    error: "Allow this page on the Mac first.",
  });
}

function fileUrl(ref, bridged) {
  const filePath = gamdl.gamdlFilePath(ref.cacheKey, ref.quality, ref.file);
  return bridged ? `${filePath}?${signMediaPath(filePath)}` : filePath;
}

function resultPayload(job, bridged) {
  return (job.results || []).map((item) => ({
    file: item.file,
    title: item.title,
    artist: item.artist,
    album: item.album,
    duration: item.duration,
    disc: item.disc || 0,
    track: item.track || 0,
    codec: item.codec || "",
    sampleRate: item.sampleRate || 0,
    bitDepth: item.bitDepth || 0,
    ref: { cacheKey: job.cacheKey, quality: job.quality, file: item.file },
    url: job.cacheKey
      ? fileUrl({ cacheKey: job.cacheKey, quality: job.quality, file: item.file }, bridged)
      : `/api/music/gamdl/files/${job.id}/${item.file}`,
  }));
}

function jobPayload(job, bridged) {
  const payload = {
    jobId: job.id,
    status: job.status,
    quality: job.quality || "",
    targetQuality: job.targetQuality || "",
    fallbackReason: job.fallbackReason || "",
    progress: job.progress || { done: 0, total: 0 },
    code: job.code || "",
    sourceUrl: job.url || "",
    pollUrl: `/api/music/gamdl/jobs/${job.id}`,
    results: resultPayload(job, bridged),
  };
  if (!bridged) {
    payload.logTail = String(job.logTail || "");
    payload.error = job.error || "";
  }
  return payload;
}

async function handleGamdlStatus(req, res) {
  const origin = bridgeOriginOf(req);
  if (origin && !(await bridgePaired(req))) {
    sendJson(res, 200, { paired: false });
    return;
  }
  const status = await gamdl.gamdlStatus();
  sendJson(res, 200, {
    ...status,
    paired: true,
    consent: await bridge.consentAccepted(gamdl.gamdlLibraryRoot()),
    consentVersion: bridge.CONSENT_VERSION,
    bridgeDownloads: origin ? bridge.bridgeDownloadsEnabled() : true,
  });
}

async function handleGamdlJobs(req, res) {
  let body = {};
  try {
    body = await readJsonBody(req, { limitBytes: 8 * 1024 });
  } catch {
    sendJson(res, 400, { code: "gamdl_bad_request", error: "A JSON body with a link is required." });
    return;
  }
  const origin = bridgeOriginOf(req);
  if (origin) {
    if (!(await bridgePaired(req))) {
      sendPairingRequired(res);
      return;
    }
    if (!bridge.bridgeDownloadsEnabled()) {
      sendJson(res, 403, { code: "bridge_downloads_disabled", error: "Downloads from web pages are turned off on this Mac." });
      return;
    }
  }
  if (!(await bridge.consentAccepted(gamdl.gamdlLibraryRoot()))) {
    sendJson(res, 403, { code: "consent_required", error: "Accept the Apple Music download notice first." });
    return;
  }
  if (origin && !bridge.takeBridgeRateSlot(origin)) {
    sendJson(res, 429, { code: "bridge_rate_limited", error: "Too many downloads from this page in the last hour." });
    return;
  }
  const result = await gamdl.startGamdlJob(body?.url, { playable: body?.playable, origin });
  if (!result.ok || !result.job) {
    sendJson(res, result.status || 400, {
      code: result.code,
      ...(origin ? {} : { error: result.error }),
    });
    return;
  }
  if (origin) await bridge.recordBridgeJob(gamdl.gamdlLibraryRoot(), { origin, url: result.job.url });
  sendJson(res, result.status || 202, jobPayload(result.job, Boolean(origin)));
}

async function handleGamdlJob(req, res) {
  const origin = bridgeOriginOf(req);
  if (origin && !(await bridgePaired(req))) {
    sendPairingRequired(res);
    return;
  }
  const jobId = pathnameOf(req).slice("/api/music/gamdl/jobs/".length).split("/")[0] || "";
  const job = await gamdl.getGamdlJob(jobId);
  // A public page reads only the jobs it started itself.
  if (!job || (origin && job.origin !== origin)) {
    sendJson(res, 404, { code: "gamdl_job_not_found", error: "No such download job." });
    return;
  }
  sendJson(res, 200, jobPayload(job, Boolean(origin)));
}

async function handleGamdlSign(req, res) {
  let body = {};
  try {
    body = await readJsonBody(req, { limitBytes: 256 * 1024 });
  } catch {
    sendJson(res, 400, { code: "gamdl_bad_request", error: "A JSON body with refs is required." });
    return;
  }
  const origin = bridgeOriginOf(req);
  if (origin && !(await bridgePaired(req))) {
    sendPairingRequired(res);
    return;
  }
  const refs = Array.isArray(body?.refs) ? body.refs.slice(0, MAX_SIGN_REFS) : [];
  const urls = refs.map((ref) => (gamdl.isValidFileRef(ref) ? fileUrl(ref, Boolean(origin)) : ""));
  sendJson(res, 200, { urls });
}

async function handleGamdlConsent(req, res) {
  if (bridgeOriginOf(req)) {
    sendJson(res, 403, { code: "consent_local_only", error: "Accept the notice on the Mac." });
    return;
  }
  try {
    await readJsonBody(req, { limitBytes: 1024 });
  } catch {}
  await bridge.acceptConsent(gamdl.gamdlLibraryRoot());
  sendJson(res, 200, { consent: true, consentVersion: bridge.CONSENT_VERSION });
}

async function handleGamdlFile(req, res) {
  const rest = pathnameOf(req).slice("/api/music/gamdl/files/".length);
  let segments;
  try {
    segments = rest.split("/").map((part) => decodeURIComponent(part)).filter(Boolean);
  } catch {
    segments = [];
  }
  const filePath = await gamdl.resolveGamdlAudioFile(segments);
  let stat = null;
  if (filePath) stat = await fs.stat(filePath).catch(() => null);
  if (!filePath || !stat) {
    sendJson(res, 404, { code: "gamdl_file_not_found", error: "No such downloaded file." });
    return;
  }

  const contentType = AUDIO_MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  const range = String(req.headers.range || "");
  const rangeMatch = /bytes=(\d*)-(\d*)/.exec(range);

  if (rangeMatch) {
    const start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
    let end = rangeMatch[2] ? Number(rangeMatch[2]) : stat.size - 1;
    if (
      !Number.isFinite(start)
      || !Number.isFinite(end)
      || start < 0
      || end < start
      || start >= stat.size
    ) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    if (end >= stat.size) end = stat.size - 1;
    res.writeHead(206, {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Cache-Control": "private, max-age=3600",
    });
    createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Length": stat.size,
    "Cache-Control": "private, max-age=3600",
  });
  createReadStream(filePath).pipe(res);
}

module.exports = {
  handleGamdlConsent,
  handleGamdlFile,
  handleGamdlJob,
  handleGamdlJobs,
  handleGamdlSign,
  handleGamdlStatus,
};
