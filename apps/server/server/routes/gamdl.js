// GET/POST /api/music/gamdl/*
//
// Local-only bridge for Soundscape's Apple Music link downloads. It runs the
// host gamdl CLI (argv only, never a shell) and streams the finished audio
// back to the browser queue. Public deployments intentionally do not register
// these routes; the client treats them as host-only.

"use strict";

const { createReadStream } = require("node:fs");
const path = require("node:path");

const { readJsonBody, sendJson } = require("../lib/http.js");
const gamdl = require("../gamdl.js");

const AUDIO_MIME = Object.freeze({
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".aiff": "audio/aiff",
  ".alac": "audio/mp4",
});

function pathnameOf(req) {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  } catch {
    return req.url || "/";
  }
}

async function handleGamdlJobs(req, res) {
  let body = {};
  try {
    body = await readJsonBody(req, { limitBytes: 8 * 1024 });
  } catch {
    sendJson(res, 400, {
      code: "gamdl_bad_request",
      error: "A JSON body with a link is required.",
    });
    return;
  }
  const result = await gamdl.startGamdlJob(body?.url);
  if (!result.ok) {
    sendJson(res, result.status, {
      code: result.code,
      error: result.error,
    });
    return;
  }
  sendJson(res, 202, {
    jobId: result.job.id,
    status: result.job.status,
    pollUrl: `/api/music/gamdl/jobs/${result.job.id}`,
  });
}

async function handleGamdlJob(req, res) {
  const rest = pathnameOf(req).slice("/api/music/gamdl/jobs/".length);
  const jobId = rest.split("/")[0] || "";
  const job = await gamdl.getGamdlJob(jobId);
  if (!job) {
    sendJson(res, 404, { code: "gamdl_job_not_found", error: "No such download job." });
    return;
  }
  sendJson(res, 200, {
    jobId: job.id,
    status: job.status,
    logTail: String(job.logTail || ""),
    code: job.code || "",
    error: job.error || "",
    results: (job.results || []).map((item) => ({
      ...item,
      url: `/api/music/gamdl/files/${job.id}/${item.file}`,
    })),
  });
}

async function handleGamdlFile(req, res) {
  const rest = pathnameOf(req).slice("/api/music/gamdl/files/".length);
  const [jobId, ...relParts] = rest.split("/");
  const segments = relParts
    .map((part) => decodeURIComponent(part))
    .filter(Boolean);
  const filePath = await gamdl.resolveGamdlAudioFile(jobId, segments);
  if (!filePath) {
    sendJson(res, 404, { code: "gamdl_file_not_found", error: "No such downloaded file." });
    return;
  }

  let stat;
  try {
    stat = require("node:fs").statSync(filePath);
  } catch {
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
      "Cache-Control": "private, max-age=31536000, immutable",
    });
    createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Length": stat.size,
    "Cache-Control": "private, max-age=31536000, immutable",
  });
  createReadStream(filePath).pipe(res);
}

module.exports = {
  handleGamdlFile,
  handleGamdlJob,
  handleGamdlJobs,
};
