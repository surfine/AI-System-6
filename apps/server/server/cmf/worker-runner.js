"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Worker } = require("node:worker_threads");

const { isPublicDeployment } = require("../runtime-profile.js");
const { normalizeRecipe } = require("./service.js");

const MAX_QUEUE = 4;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1200;
const MAX_VIEWS = 9;
const MAX_RESULT_BYTES = 32 * 1024 * 1024;
const CACHE_ENTRIES = 16;
const CACHE_BYTES = 64 * 1024 * 1024;
const WORKER_TIMEOUT_MS = 120000;
const workerPath = path.join(__dirname, "worker.js");

let activeCount = 0;
const activeSessions = new Set();
const queue = [];
const cache = new Map();
let cacheBytes = 0;

function positiveInteger(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function concurrencyLimit() {
  return positiveInteger(
    "AI_SYSTEM6_CMF_CONCURRENCY",
    isPublicDeployment ? 1 : 2
  );
}

function cmfError(statusCode, code, message) {
  const error = /** @type {Error & { statusCode?: number, code?: string }} */ (new Error(message));
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function validateRenderOptions(options) {
  const width = Number(options?.width || 1400);
  const height = Number(options?.height || 1000);
  const viewCount = Array.isArray(options?.viewNames) ? options.viewNames.length : 1;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw cmfError(400, "cmf_invalid_dimensions", "CMF render dimensions are invalid.");
  }
  if (width > MAX_WIDTH || height > MAX_HEIGHT) {
    throw cmfError(413, "cmf_dimensions_too_large", "CMF render dimensions are too large.");
  }
  if (viewCount > MAX_VIEWS) {
    throw cmfError(413, "cmf_too_many_views", "CMF requested too many views.");
  }
  return { width, height, viewNames: options?.viewNames || null };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
  );
}

function cacheKey(operation, recipe, viewName, renderOptions) {
  const imageRecipe = { model: recipe.model, pose: recipe.pose, parts: recipe.parts };
  return crypto.createHash("sha256").update(JSON.stringify(stableValue({
    version: 1,
    operation,
    recipe: imageRecipe,
    viewName: viewName || "",
    renderOptions,
  }))).digest("hex");
}

function resultSize(result) {
  if (result?.buffer) return Buffer.byteLength(result.buffer);
  if (result?.view?.dataUrl) return Buffer.byteLength(result.view.dataUrl);
  if (Array.isArray(result?.views)) {
    return result.views.reduce((total, view) => total + Buffer.byteLength(view?.dataUrl || ""), 0);
  }
  return Buffer.byteLength(JSON.stringify(result || null));
}

function readCache(key, recipe) {
  const entry = cache.get(key);
  if (!entry) return null;
  cache.delete(key);
  cache.set(key, entry);
  return { ...entry.result, recipe };
}

function writeCache(key, result) {
  const size = resultSize(result);
  if (size > MAX_RESULT_BYTES || size > CACHE_BYTES) return;
  if (cache.has(key)) {
    cacheBytes -= cache.get(key).size;
    cache.delete(key);
  }
  cache.set(key, { result, size });
  cacheBytes += size;
  while (cache.size > CACHE_ENTRIES || cacheBytes > CACHE_BYTES) {
    const oldestKey = cache.keys().next().value;
    const oldest = cache.get(oldestKey);
    cache.delete(oldestKey);
    cacheBytes -= oldest.size;
  }
}

function normalizeWorkerResult(result) {
  if (result?.buffer && !Buffer.isBuffer(result.buffer)) {
    return { ...result, buffer: Buffer.from(result.buffer) };
  }
  return result;
}

async function runWorker(job) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai6-cmf-job-"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(workerPath, {
      workerData: {
        operation: job.operation,
        recipe: job.recipe,
        viewName: job.viewName,
        testControls: job.testControls,
      },
      env: { ...process.env, AI_SYSTEM6_CMF_JOB_TEMP_ROOT: tempRoot },
    });
    job.worker = worker;
    const cleanup = async () => {
      clearTimeout(timeout);
      job.signal?.removeEventListener("abort", abort);
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    };
    const finish = async (callback, value) => {
      if (settled) return;
      settled = true;
      await cleanup();
      callback(value);
    };
    const abort = () => {
      worker.terminate().catch(() => {});
      finish(reject, cmfError(499, "cmf_cancelled", "CMF rendering was cancelled."));
    };
    const timeout = setTimeout(() => {
      worker.terminate().catch(() => {});
      finish(reject, cmfError(504, "cmf_timeout", "CMF rendering timed out."));
    }, positiveInteger("AI_SYSTEM6_CMF_TIMEOUT_MS", WORKER_TIMEOUT_MS));
    job.signal?.addEventListener("abort", abort, { once: true });
    if (job.signal?.aborted) {
      abort();
      return;
    }
    worker.once("message", (message) => {
      if (!message?.ok) {
        finish(reject, cmfError(
          Number(message?.error?.statusCode) || 500,
          String(message?.error?.code || "cmf_worker_failed"),
          String(message?.error?.message || "CMF worker failed.")
        ));
        return;
      }
      const result = normalizeWorkerResult(message.result);
      if (resultSize(result) > MAX_RESULT_BYTES) {
        finish(reject, cmfError(413, "cmf_output_too_large", "CMF rendered output is too large."));
        return;
      }
      finish(resolve, result);
    });
    worker.once("error", (error) => {
      // The worker error arrives untyped, so read the message only from an Error.
      const detail = error instanceof Error ? error.message : "";
      finish(reject, cmfError(500, "cmf_worker_failed", detail || "CMF worker failed."));
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        finish(reject, cmfError(500, "cmf_worker_crashed", `CMF worker exited with code ${code}.`));
      }
    });
  });
}

function removeQueuedJob(job) {
  const index = queue.indexOf(job);
  if (index >= 0) queue.splice(index, 1);
}

function pumpQueue() {
  while (activeCount < concurrencyLimit()) {
    const index = queue.findIndex((job) => !activeSessions.has(job.sessionKey));
    if (index < 0) return;
    const [job] = queue.splice(index, 1);
    if (job.signal?.aborted) {
      job.reject(cmfError(499, "cmf_cancelled", "CMF rendering was cancelled."));
      continue;
    }
    activeCount += 1;
    activeSessions.add(job.sessionKey);
    runWorker(job).then(job.resolve, job.reject).finally(() => {
      activeCount = Math.max(0, activeCount - 1);
      activeSessions.delete(job.sessionKey);
      pumpQueue();
    });
  }
}

function enqueue(job) {
  if (queue.length >= positiveInteger("AI_SYSTEM6_CMF_QUEUE_LIMIT", MAX_QUEUE)) {
    return Promise.reject(cmfError(429, "cmf_busy", "CMF rendering queue is full."));
  }
  return new Promise((resolve, reject) => {
    Object.assign(job, { resolve, reject });
    const abortQueued = () => {
      if (job.worker) return;
      removeQueuedJob(job);
      reject(cmfError(499, "cmf_cancelled", "CMF rendering was cancelled."));
    };
    job.signal?.addEventListener("abort", abortQueued, { once: true });
    queue.push(job);
    pumpQueue();
  });
}

async function runCmfJob({ operation, recipe: inputRecipe, viewName = "", renderOptions = {}, sessionKey = "local", signal = null, testControls = null }) {
  if (!new Set(["export", "views", "preview"]).has(operation)) {
    throw cmfError(400, "cmf_invalid_operation", "Unsupported CMF operation.");
  }
  const recipe = normalizeRecipe(inputRecipe);
  const normalizedRenderOptions = validateRenderOptions(renderOptions);
  const key = operation === "export"
    ? ""
    : cacheKey(operation, recipe, viewName, normalizedRenderOptions);
  const cached = key ? readCache(key, recipe) : null;
  if (cached) return cached;
  const result = await enqueue({
    operation,
    recipe,
    viewName,
    renderOptions: normalizedRenderOptions,
    sessionKey: String(sessionKey || "anonymous"),
    signal,
    testControls: process.env.NODE_ENV === "test" ? testControls : null,
  });
  const normalizedResult = { ...result, recipe };
  if (key) writeCache(key, normalizedResult);
  return normalizedResult;
}

module.exports = {
  cacheKey,
  runCmfJob,
  schedulerStateForTests: () => ({ activeCount, activeSessions: activeSessions.size, queued: queue.length, cacheEntries: cache.size }),
};
