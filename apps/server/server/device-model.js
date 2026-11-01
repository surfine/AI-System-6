// On-device models, reached through the AISystem6Intelligence helper
// (platform/macos/shell/macos-intelligence): Apple's FoundationModels and the
// built-in MLX models (ClioModelKit).
//
// Chat goes to one long-lived `serve` helper: spawned on the first request,
// multiplexed by request id over stdio NDJSON, restarted on the next request
// after a crash, cancelled by a `cancel` message rather than a signal. The
// helper keeps the MLX weights warm and drops them on idle or memory pressure.
// AI_SYSTEM6_DEVICE_MODEL_PERSISTENT=0 goes back to one `chat` process per
// request. `status` and `mlx-status` stay one-shot (cheap, no model load).
// This module owns locating the helper, the status caches, the task
// whitelist, the request assembly (guardrails come from applyChatTaskContract,
// the same as /api/chat) and the context-size refusal. The routes live in
// routes/device-model.js.

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { applyChatTaskContract } = require("./chat.js");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const STATUS_TTL_MS = 10000;
const STATUS_TIMEOUT_MS = 5000;
// Used only to decide a refusal when the helper cannot report its window.
// It is never reported to the page as the model's size.
const ASSUMED_CONTEXT_TOKENS = 4096;
const DEFAULT_REPLY_TOKENS = 400;
const MAX_REPLY_TOKENS = 1024;
const PROTOCOL_RESERVE_TOKENS = 128;

// Request kind -> registered task contract. Ask-only: none of these writes
// into the writer's document, so no drafting task is reachable from here.
const taskWhitelist = Object.freeze({
  "three-questions": "chat.clio-stage",
  "side-question": "chat.sideask",
  title: "system.chat-title",
});

const helperName = "AISystem6Intelligence";
// The built-in model when a request names none: Qwen3.5 4B (4-bit), the pack
// the speed work was measured on (tooling/bench-device-model.mjs).
const DEFAULT_MLX_MODEL = "qwen3.5-4b-4bit";
const MLX_CONTEXT_TOKENS = 4096;
// General chat on the built-in model: the reply may be as long as a local
// LM Studio answer, within the pack's window.
const GENERAL_DEFAULT_REPLY_TOKENS = 2048;
const GENERAL_MAX_REPLY_TOKENS = 8192;

/** @returns {string | null} */
function deviceModelHelperPath() {
  const override = process.env.AI_SYSTEM6_DEVICE_MODEL_HELPER || "";
  if (process.env.AI_SYSTEM6_DEVICE_MODEL === "0") return null;
  // An explicit override is honoured on any platform (tests use a fake).
  if (!override && process.platform !== "darwin") return null;
  const candidates = [
    override,
    ...["macos-intelligence", "macos-webview"].flatMap((pkg) => ["release", "debug"]
      .map((config) => path.join(repoRoot, "platform/macos/shell", pkg, ".build", config, helperName))),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, /\.(?:[cm]?js)$/.test(candidate) ? fs.constants.R_OK : fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

/**
 * A `.js` helper (the test fake) runs under the current Node.
 *
 * @param {string} helper
 * @param {string[]} args
 */
function spawnHelper(helper, args) {
  const scripted = /\.(?:[cm]?js)$/.test(helper);
  return spawn(scripted ? process.execPath : helper, scripted ? [helper, ...args] : args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** @type {{ helper: string, at: number, value: any } | null} */
let statusCache = null;
/** @type {{ helper: string, at: number, value: any } | null} */
let mlxStatusCache = null;

function resetDeviceModelStatusCache() {
  statusCache = null;
  mlxStatusCache = null;
}

/**
 * @param {string} helper
 * @param {string} [command]
 */
function readHelperStatus(helper, command = "status") {
  return new Promise((resolve) => {
    let out = "";
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const child = spawnHelper(helper, [command]);
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      done({ available: false, reason: "other" });
    }, STATUS_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.on("error", () => done({ available: false, reason: "other" }));
    child.on("close", () => {
      try {
        const parsed = JSON.parse(out.trim().split("\n").pop() || "{}");
        done(parsed && typeof parsed === "object" && typeof parsed.available === "boolean"
          ? parsed
          : { available: false, reason: "other" });
      } catch {
        done({ available: false, reason: "other" });
      }
    });
    child.stdin.end();
  });
}

/**
 * The status the page reads. Cached for about ten seconds per helper path.
 *
 * @returns {Promise<any>}
 */
async function deviceModelStatus() {
  const helper = deviceModelHelperPath();
  if (!helper) return { available: false, reason: "helperMissing", contextSize: null };
  if (statusCache && statusCache.helper === helper && Date.now() - statusCache.at < STATUS_TTL_MS) {
    return statusCache.value;
  }
  const value = shapeAppleStatus(await readHelperStatus(helper));
  statusCache = { helper, at: Date.now(), value };
  return value;
}

/**
 * Apple's model status as the page reads it, from the helper's raw `status`
 * object. Pure: the iOS shell runs it in JavaScriptCore on the in-process
 * answer (tooling/build-device-request-bundle.mjs).
 *
 * @param {any} raw
 */
function shapeAppleStatus(raw) {
  return {
    ...raw,
    available: raw.available === true,
    reason: raw.available === true ? null : String(raw.reason || "other"),
    contextSize: Number.isFinite(Number(raw.contextSize)) && Number(raw.contextSize) > 0 ? Number(raw.contextSize) : null,
  };
}

/**
 * Whether a built-in MLX model can run: `mlx-status` (installed packs, memory
 * gate), cached like the FoundationModels status. The shape matches
 * deviceModelStatus so the route treats both engines alike.
 *
 * @returns {Promise<any>}
 */
async function builtInModelStatus() {
  const helper = deviceModelHelperPath();
  if (!helper) return { available: false, reason: "helperMissing", contextSize: null, engine: "mlx" };
  if (mlxStatusCache && mlxStatusCache.helper === helper && Date.now() - mlxStatusCache.at < STATUS_TTL_MS) {
    return mlxStatusCache.value;
  }
  const value = shapeBuiltInStatus(await readHelperStatus(helper, "mlx-status"));
  mlxStatusCache = { helper, at: Date.now(), value };
  return value;
}

/**
 * The built-in model's status from the helper's raw `mlx-status` object. Pure,
 * shared with the iOS shell like shapeAppleStatus.
 *
 * @param {any} raw
 */
function shapeBuiltInStatus(raw) {
  const runnable = Array.isArray(raw.runnable) ? raw.runnable.map(String) : [];
  const value = {
    ...raw,
    engine: "mlx",
    available: raw.available === true,
    reason: raw.available === true ? null : String(raw.reason || "other"),
    runnable,
    vision: Array.isArray(raw.vision) ? raw.vision.map(String) : [],
    defaultModel: runnable.includes(DEFAULT_MLX_MODEL) ? DEFAULT_MLX_MODEL : (runnable[0] || null),
    contextSize: MLX_CONTEXT_TOKENS,
  };
  const windows = raw.contextTokens && typeof raw.contextTokens === "object" ? raw.contextTokens : {};
  const window = Number(windows[value.defaultModel || ""]);
  if (Number.isFinite(window) && window > 0) value.contextSize = window;
  return value;
}

/**
 * GET /api/device-model/status without ?engine: Apple's model at the top
 * level (unchanged shape), the built-in model beside it.
 *
 * @param {any} apple shaped by shapeAppleStatus
 * @param {any} builtIn shaped by shapeBuiltInStatus
 */
function combinedDeviceStatus(apple, builtIn) {
  return {
    ...apple,
    builtIn: {
      available: builtIn.available === true,
      reason: builtIn.reason || null,
      defaultModel: builtIn.defaultModel || null,
      vision: Array.isArray(builtIn.vision) ? builtIn.vision : [],
      contextSize: builtIn.contextSize || null,
    },
  };
}

// ---- the persistent helper -----------------------------------------------

/**
 * @typedef {{ onEvent: (event: any) => void, onExit: (code: number | null) => void }} PendingRequest
 */

/** @type {{ helper: string, child: import("node:child_process").ChildProcess, pending: Map<string, PendingRequest>, seq: number } | null} */
let serveState = null;
let serveRestarts = 0;

function persistentHelperEnabled() {
  return process.env.AI_SYSTEM6_DEVICE_MODEL_PERSISTENT !== "0";
}

/** Keep the event loop alive only while a request is waiting on the helper. */
function refServe(state) {
  const handles = [state.child, state.child.stdin, state.child.stdout, state.child.stderr];
  for (const handle of handles) {
    if (!handle) continue;
    if (state.pending.size) /** @type {any} */ (handle).ref?.();
    else /** @type {any} */ (handle).unref?.();
  }
}

/**
 * The running `serve` helper, spawned on first use and again after an exit.
 *
 * @param {string} helper
 */
function serveHelper(helper) {
  if (serveState && serveState.helper === helper && serveState.child.exitCode === null && !serveState.child.killed) {
    return serveState;
  }
  const child = spawnHelper(helper, ["serve"]);
  /** @type {NonNullable<typeof serveState>} */
  const state = { helper, child, pending: new Map(), seq: 0 };
  serveState = state;
  let buffer = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      const waiter = typeof event.id === "string" ? state.pending.get(event.id) : null;
      waiter?.onEvent(event);
    }
  });
  child.stderr?.on("data", () => {});
  child.stdin?.on("error", () => {});
  const exited = (code) => {
    if (serveState === state) serveState = null;
    serveRestarts += 1;
    const waiting = [...state.pending.values()];
    state.pending.clear();
    for (const waiter of waiting) waiter.onExit(code);
  };
  child.on("error", () => exited(null));
  child.on("exit", (code) => exited(code));
  refServe(state);
  return state;
}

/**
 * Send one op to the serve helper. Events for this id go to onEvent until
 * `finish()` is called; an exit of the helper calls onExit.
 *
 * @param {string} helper
 * @param {Record<string, unknown>} message
 * @param {PendingRequest} handlers
 */
function sendToServeHelper(helper, message, handlers) {
  const state = serveHelper(helper);
  state.seq += 1;
  const id = `n${state.seq}`;
  state.pending.set(id, handlers);
  refServe(state);
  state.child.stdin?.write(`${JSON.stringify({ ...message, id })}\n`);
  return {
    id,
    pid: state.child.pid,
    cancel() {
      if (!state.pending.has(id)) return;
      state.child.stdin?.write(`${JSON.stringify({ id: `${id}-cancel`, op: "cancel", target: id })}\n`);
    },
    finish() {
      state.pending.delete(id);
      refServe(state);
    },
  };
}

/**
 * Ask a freshly spawned helper to load and warm the model before the first
 * request reaches the gate. Fire and forget.
 *
 * @param {string} helper
 * @param {string} model
 */
function prewarmServeHelper(helper, model) {
  const handle = sendToServeHelper(helper, { op: "prewarm", model }, {
    onEvent: (event) => { if (event.type === "ok" || event.type === "error") handle.finish(); },
    onExit: () => {},
  });
  return handle;
}

/** Whether a serve helper is already running for this path. */
function serveHelperRunning(helper) {
  return Boolean(serveState && serveState.helper === helper && serveState.child.exitCode === null && !serveState.child.killed);
}

/** Stop the serve helper (tests, benchmarks, server shutdown). */
async function shutdownDeviceModelHelpers() {
  const state = serveState;
  serveState = null;
  if (!state || state.child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => { state.child.kill("SIGKILL"); resolve(undefined); }, 2000);
    state.child.once("exit", () => { clearTimeout(timer); resolve(undefined); });
    state.child.stdin?.end();
  });
}

/**
 * Rough token estimate for the refusal check only: one token per CJK
 * character, one per 3.5 other characters. The helper's own count replaces
 * this once it reports one.
 *
 * @param {string} text
 */
function estimateTokens(text) {
  let cjk = 0;
  let other = 0;
  for (const char of String(text || "")) {
    if (/[⺀-鿿가-힯豈-﫿　-〿＀-￯]/.test(char)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 3.5);
}

/**
 * @param {any} content
 * @returns {string}
 */
function textOfContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const part of content) {
    if (typeof part === "string") parts.push(part);
    else if (part && part.type === "text" && typeof part.text === "string") parts.push(part.text);
    else {
      throw Object.assign(new Error("The on-device model reads text only."), { statusCode: 400, code: "device_text_only" });
    }
  }
  return parts.join("\n");
}

/**
 * @param {string} language
 */
function localeLine(language) {
  const lang = String(language || "").toLowerCase();
  if (/^zh(?:-(?:hant|tw|hk|mo))/.test(lang)) return "The person's locale is zh-Hant. Reply in Traditional Chinese.";
  if (/^zh/.test(lang)) return "The person's locale is zh-Hans. Reply in Simplified Chinese.";
  if (/^en/.test(lang)) return "The person's locale is en. Reply in English.";
  return "";
}

/**
 * The payload as /api/chat would assemble it, then folded for the helper,
 * which takes `instructions` plus one `prompt` (no multi-turn).
 * `engine: "mlx"` (with an optional catalog `model`) selects the built-in
 * MLX model; anything else stays on Apple's FoundationModels.
 *
 * @param {any} body
 * @returns {{ taskKind: string, contract: string, payload: any, engine: "mlx" | "apple", request: any, estimatedTokens: number, replyTokens: number }}
 */
function buildDeviceRequest(body) {
  const requested = String(body?.ai_system6_task_kind || "").trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(taskWhitelist, requested)) {
    throw Object.assign(
      new Error(`The on-device model only handles ${Object.keys(taskWhitelist).join(", ")}; it does not draft or rewrite the writer's text.`),
      { statusCode: 400, code: "device_task_unavailable" }
    );
  }
  const contract = taskWhitelist[requested];
  if (!Array.isArray(body.messages) || !body.messages.length) {
    throw Object.assign(new Error("messages are required."), { statusCode: 400, code: "invalid_request" });
  }
  const payload = applyChatTaskContract({
    ai_system6_task_kind: contract,
    messages: body.messages.map((message) => ({ role: message?.role, content: textOfContent(message?.content) })),
  });
  const system = payload.messages.filter((message) => message.role === "system").map((message) => message.content);
  const turns = payload.messages.filter((message) => message.role !== "system" && String(message.content || "").trim());
  const locale = localeLine(body.language);
  if (locale) system.push(locale);
  let prompt;
  if (turns.length === 1 && turns[0].role === "user") prompt = String(turns[0].content);
  else if (turns.length) {
    prompt = [
      "Conversation so far:",
      ...turns.map((turn) => `${turn.role === "assistant" ? "Assistant" : "Person"}: ${turn.content}`),
      "",
      "Reply to the last message from the person.",
    ].join("\n");
  } else {
    throw Object.assign(new Error("A user message is required."), { statusCode: 400, code: "invalid_request" });
  }
  const requestedReply = Number(body.max_tokens);
  const replyTokens = Number.isFinite(requestedReply) && requestedReply > 0
    ? Math.min(MAX_REPLY_TOKENS, Math.floor(requestedReply))
    : DEFAULT_REPLY_TOKENS;
  const instructions = system.join("\n\n");
  const options = { maxTokens: replyTokens, permissiveContentTransformations: false };
  const temperature = Number(body.temperature);
  if (Number.isFinite(temperature) && temperature >= 0 && temperature <= 2) options.temperature = temperature;
  const engine = body?.engine === "mlx" ? "mlx" : "apple";
  /** @type {Record<string, unknown>} */
  const request = { instructions, prompt, options };
  if (engine === "mlx") {
    const topP = Number(body.top_p);
    if (Number.isFinite(topP) && topP > 0 && topP <= 1) options.topP = topP;
    const seed = Number(body.seed);
    if (Number.isInteger(seed) && seed >= 0) options.seed = seed;
    request.engine = "mlx";
    request.model = typeof body.model === "string" && /^[a-z0-9.\-]{1,64}$/.test(body.model) ? body.model : DEFAULT_MLX_MODEL;
  }
  return {
    taskKind: requested,
    contract,
    payload,
    engine,
    request,
    estimatedTokens: estimateTokens(instructions) + estimateTokens(prompt),
    replyTokens,
  };
}

/**
 * General chat on the built-in model (any task kind outside the ask-only
 * whitelist, `engine: "mlx"` only): guardrails are assembled by
 * applyChatTaskContract exactly as /api/chat assembles them, and the
 * conversation goes to the helper turn by turn, every system message first
 * (the Qwen template accepts system text only at the head). Text only: an
 * image, a tool list or a JSON schema stays with LM Studio or the cloud.
 *
 * @param {any} body
 */
function buildBuiltInChatRequest(body) {
  if (!Array.isArray(body?.messages) || !body.messages.length) {
    throw Object.assign(new Error("messages are required."), { statusCode: 400, code: "invalid_request" });
  }
  if (Array.isArray(body.tools) && body.tools.length) {
    throw Object.assign(new Error("The built-in model does not call tools."), { statusCode: 400, code: "device_text_only" });
  }
  const payload = /** @type {any} */ (applyChatTaskContract({
    ...body,
    ai_system6_task_kind: String(body.ai_system6_task_kind || "chat"),
    messages: body.messages.map((message) => ({ role: message?.role, content: textOfContent(message?.content) })),
  }));
  if (payload.response_format && payload.response_format.type && payload.response_format.type !== "text") {
    throw Object.assign(new Error("The built-in model does not take a response schema."), { statusCode: 400, code: "device_text_only" });
  }
  const system = payload.messages.filter((message) => message.role === "system").map((message) => String(message.content || "")).filter(Boolean);
  const turns = payload.messages
    .filter((message) => message.role !== "system" && String(message.content || "").trim())
    .map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: String(message.content) }));
  if (!turns.length || turns[turns.length - 1].role !== "user") {
    throw Object.assign(new Error("A user message is required."), { statusCode: 400, code: "invalid_request" });
  }
  const messages = [...(system.length ? [{ role: "system", content: system.join("\n\n") }] : []), ...turns];
  const requestedReply = Number(body.max_tokens);
  const replyTokens = Number.isFinite(requestedReply) && requestedReply > 0
    ? Math.min(GENERAL_MAX_REPLY_TOKENS, Math.floor(requestedReply))
    : GENERAL_DEFAULT_REPLY_TOKENS;
  /** @type {Record<string, unknown>} */
  const options = { maxTokens: replyTokens };
  const temperature = Number(body.temperature);
  if (Number.isFinite(temperature) && temperature >= 0 && temperature <= 2) options.temperature = temperature;
  const topP = Number(body.top_p);
  if (Number.isFinite(topP) && topP > 0 && topP <= 1) options.topP = topP;
  const model = typeof body.model === "string" && /^(?:built-in:)?[a-z0-9.\-]{1,64}$/.test(body.model)
    ? body.model.replace(/^built-in:/, "")
    : DEFAULT_MLX_MODEL;
  return {
    taskKind: String(payload.ai_system6_task_kind),
    payload,
    engine: /** @type {"mlx"} */ ("mlx"),
    request: { engine: "mlx", model, messages, options },
    estimatedTokens: messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0),
    replyTokens,
  };
}

// ---- the built-in model's door: catalog and consented download -------------
//
// The writer sees the curated pack, its exact download size and its license
// (`mlx-catalog`), consents by sending that exact byte count back, and watches
// `mlx-download` progress. One download at a time; the helper itself refuses a
// consent that is not the pack's total size and a pack the memory gate refuses.
// Cancel is SIGTERM to the download process (exit 143, bytes already on disk
// are kept and the next download resumes from them).

const PACK_ID = /^[a-z0-9.\-]{1,64}$/;

/**
 * One helper command whose whole stdout is one JSON object (mlx-catalog).
 *
 * @param {string} helper
 * @param {string[]} args
 * @returns {Promise<any | null>}
 */
function readHelperJson(helper, args) {
  return new Promise((resolve) => {
    let out = "";
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const child = spawnHelper(helper, args);
    const timer = setTimeout(() => { child.kill("SIGTERM"); done(null); }, STATUS_TIMEOUT_MS * 3);
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.on("error", () => done(null));
    child.on("close", () => {
      try {
        const parsed = JSON.parse(out.trim().split("\n").pop() || "null");
        done(parsed && typeof parsed === "object" ? parsed : null);
      } catch {
        done(null);
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end();
  });
}

const finiteOrNull = (value) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null);

/**
 * What the page may show about one pack: nothing from the helper's own paths.
 *
 * @param {any} pack
 */
function publicPack(pack) {
  const licenseURL = typeof pack.licenseURL === "string" && /^https:\/\//.test(pack.licenseURL) ? pack.licenseURL : "";
  return {
    id: String(pack.id),
    displayName: String(pack.displayName || pack.id),
    repo: String(pack.repo || ""),
    license: String(pack.license || ""),
    licenseURL,
    totalBytes: finiteOrNull(pack.totalBytes),
    estimatedResidentBytes: finiteOrNull(pack.estimatedResidentBytes),
    contextTokens: finiteOrNull(pack.contextTokens),
    languages: Array.isArray(pack.languages) ? pack.languages.map(String) : [],
    state: ["installed", "partial", "notInstalled"].includes(pack.state) ? pack.state : "notInstalled",
    bytesOnDisk: finiteOrNull(pack.bytesOnDisk),
    memoryGate: {
      allowed: pack.memoryGate?.allowed !== false,
      limitBytes: finiteOrNull(pack.memoryGate?.limitBytes),
    },
  };
}

/**
 * The curated default pack and the machine it would run on, or a plain reason.
 *
 * @returns {Promise<{ helper: boolean, reason: string | null, pack: any | null, physicalMemoryBytes: number | null }>}
 */
async function builtInCatalog() {
  const helper = deviceModelHelperPath();
  if (!helper) return { helper: false, reason: "helperMissing", pack: null, physicalMemoryBytes: null };
  const raw = await readHelperJson(helper, ["mlx-catalog"]);
  const found = Array.isArray(raw?.packs) ? raw.packs.find((pack) => pack?.id === DEFAULT_MLX_MODEL) : null;
  if (!found) return { helper: true, reason: "other", pack: null, physicalMemoryBytes: null };
  return { helper: true, reason: null, pack: publicPack(found), physicalMemoryBytes: finiteOrNull(raw.physicalMemoryBytes) };
}

/**
 * @typedef {{ id: string, state: "running" | "done" | "error" | "cancelled", bytesDone: number, totalBytes: number, file: string, code: string, message: string }} DownloadSnapshot
 */

/** @type {{ child: import("node:child_process").ChildProcess | null, snapshot: DownloadSnapshot, listeners: Set<(event: any) => void>, cancelled: boolean } | null} */
let activeDownload = null;

function downloadSnapshot() {
  return activeDownload ? { ...activeDownload.snapshot } : null;
}

/** @param {(event: any) => void} listener */
function subscribeBuiltInDownload(listener) {
  if (!activeDownload) return () => {};
  const current = activeDownload;
  current.listeners.add(listener);
  return () => current.listeners.delete(listener);
}

function builtInDownloadRunning() {
  return activeDownload?.snapshot.state === "running";
}

function cancelBuiltInDownload() {
  if (!activeDownload || activeDownload.snapshot.state !== "running") return false;
  activeDownload.cancelled = true;
  activeDownload.child?.kill("SIGTERM");
  return true;
}

function downloadFailure(statusCode, code, message, extra = {}) {
  return Object.assign(new Error(message), { statusCode, code, ...extra });
}

/**
 * Start the one download. The consent must be the exact byte count the writer
 * was shown; it is checked here against a fresh catalog read and again by the
 * helper itself.
 *
 * @param {{ id?: unknown, consentBytes?: unknown }} request
 */
async function startBuiltInDownload(request) {
  const id = String(request?.id || "");
  if (!PACK_ID.test(id)) throw downloadFailure(400, "invalid_request", "A model id is required.");
  const helper = deviceModelHelperPath();
  if (!helper) throw downloadFailure(503, "device_unavailable", "The built-in model is not part of this install.", { reason: "helperMissing" });
  if (builtInDownloadRunning()) throw downloadFailure(409, "download_in_progress", "A model download is already running.");
  const catalog = await builtInCatalog();
  if (!catalog.pack || catalog.pack.id !== id) throw downloadFailure(404, "unknown_model", "That model is not in the built-in catalog.");
  const pack = catalog.pack;
  if (pack.state === "installed") throw downloadFailure(409, "already_installed", "That model is already downloaded.");
  if (!pack.memoryGate.allowed) throw downloadFailure(503, "device_memory_gate", "This Mac does not have enough free memory for that on-device model.");
  if (!Number.isSafeInteger(request?.consentBytes) || request.consentBytes !== pack.totalBytes) {
    throw downloadFailure(409, "device_consent_required", "This model needs your consent to the exact download size first.", { totalBytes: pack.totalBytes });
  }
  if (builtInDownloadRunning()) throw downloadFailure(409, "download_in_progress", "A model download is already running.");

  const child = spawnHelper(helper, ["mlx-download", id, "--consent", String(pack.totalBytes)]);
  const state = {
    child,
    listeners: new Set(),
    cancelled: false,
    snapshot: /** @type {DownloadSnapshot} */ ({ id, state: "running", bytesDone: pack.bytesOnDisk || 0, totalBytes: pack.totalBytes, file: "", code: "", message: "" }),
  };
  activeDownload = state;
  const emit = (event) => { for (const listener of [...state.listeners]) { try { listener(event); } catch {} } };
  const settle = (next) => {
    if (state.snapshot.state !== "running") return;
    Object.assign(state.snapshot, next);
    // The new pack changes what `mlx-status` answers.
    resetDeviceModelStatusCache();
    emit({ type: next.state === "done" ? "done" : next.state === "cancelled" ? "cancelled" : "error", ...state.snapshot });
  };
  let buffer = "";
  const handleLine = (line) => {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event.type === "progress") {
      const bytesDone = finiteOrNull(event.bytesDone);
      if (bytesDone !== null) state.snapshot.bytesDone = Math.min(bytesDone, state.snapshot.totalBytes);
      state.snapshot.file = typeof event.file === "string" ? event.file.slice(0, 120) : "";
      emit({ type: "progress", ...state.snapshot });
    } else if (event.type === "done") {
      settle({ state: "done", bytesDone: state.snapshot.totalBytes });
    } else if (event.type === "error") {
      const code = ["memoryGate", "consentRequired", "downloadFailed", "badRequest"].includes(event.code) ? event.code : "downloadFailed";
      settle({ state: "error", code, message: "" });
    }
  };
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      handleLine(line);
    }
  });
  child.stderr.on("data", () => {});
  child.on("error", () => settle({ state: "error", code: "downloadFailed" }));
  child.on("close", (code) => {
    if (buffer.trim()) handleLine(buffer);
    buffer = "";
    if (state.snapshot.state !== "running") return;
    if (state.cancelled || code === 143 || code === 130) settle({ state: "cancelled" });
    else settle({ state: "error", code: code === 3 ? "memoryGate" : "downloadFailed" });
  });
  child.stdin.on("error", () => {});
  child.stdin.end();
  return state;
}

// A download is a child of the server: it must not outlive it.
// The iOS shell bundles this module into a VM with no Node globals (the
// device-request contract runs it there), so the exit hook is only installed
// where a process exists.
if (typeof process !== "undefined" && typeof process.once === "function") {
  process.once("exit", () => { activeDownload?.child?.kill("SIGTERM"); });
}

/** Whether a request kind is one of the ask-only doors. */
function isAskOnlyTaskKind(kind) {
  return Object.prototype.hasOwnProperty.call(taskWhitelist, String(kind || "").trim().toLowerCase());
}

/**
 * @param {number} estimatedTokens
 * @param {number} replyTokens
 * @param {number | null} contextSize
 * @returns {{ ok: boolean, total: number, limit: number, limitSource: "helper" | "assumed" }}
 */
function checkContextBudget(estimatedTokens, replyTokens, contextSize) {
  const limit = contextSize || ASSUMED_CONTEXT_TOKENS;
  const total = estimatedTokens + replyTokens + PROTOCOL_RESERVE_TOKENS;
  return { ok: total <= limit, total, limit, limitSource: contextSize ? "helper" : "assumed" };
}

const DEVICE_MODEL_ID = "apple-foundation-models";
const GUARDRAIL_WAY_OUT = "Apple's on-device check declined this text. Nothing was changed or sent anywhere. You can use the website allowance or your own key, or skip this step.";

/**
 * The request half of POST /api/device-model/chat: general chat is the
 * built-in model's alone, Apple's model stays ask-only. Throws the same 4xx
 * errors as the builders. Shared with the iOS shell, which runs this file in
 * JavaScriptCore (tooling/build-device-request-bundle.mjs), so the guardrails
 * and the whitelist have one source.
 *
 * @param {any} body
 */
function planDeviceChat(body) {
  const general = body?.engine === "mlx" && !isAskOnlyTaskKind(body?.ai_system6_task_kind);
  const built = general ? buildBuiltInChatRequest(body) : buildDeviceRequest(body);
  return {
    ...built,
    general,
    stream: !(general && body.stream === false),
    modelId: built.engine === "mlx" ? `built-in:${built.request.model}` : DEVICE_MODEL_ID,
  };
}

/**
 * Whether the engine's status lets a planned request run: null, or the
 * refusal the route answers with. A missing helper already reads as an
 * unavailable status, so the order matches the route's checks.
 *
 * @param {ReturnType<typeof planDeviceChat>} plan
 * @param {any} status shaped by shapeAppleStatus or shapeBuiltInStatus
 * @returns {{ status: number, body: Record<string, unknown> } | null}
 */
function deviceChatRefusal(plan, status) {
  if (!status.available) {
    return { status: 503, body: { code: "device_unavailable", reason: status.reason || "other", error: "The on-device model is not available." } };
  }
  const budget = checkContextBudget(plan.estimatedTokens, plan.replyTokens, status.contextSize);
  if (!budget.ok) {
    return {
      status: 413,
      body: {
        code: "context-budget-exceeded",
        error: "This is longer than the on-device model can read at once. Shorten it, or use the website allowance or your own key.",
        budget: { estimated_tokens: budget.total, limit_tokens: budget.limit, limit_source: budget.limitSource },
      },
    };
  }
  if (plan.engine === "mlx" && Array.isArray(status.runnable) && !status.runnable.includes(plan.request.model)) {
    return { status: 503, body: { code: "device_unavailable", reason: "notDownloaded", error: "That built-in model is not downloaded." } };
  }
  return null;
}

/**
 * A helper error code as the page reads it.
 *
 * @param {string} code helper error code
 * @param {string} message helper message
 * @param {string} [reason]
 * @returns {{ status: number, body: Record<string, unknown> }}
 */
function mapHelperError(code, message, reason) {
  switch (code) {
    case "exceededContextWindowSize":
      return { status: 413, body: { code: "context-budget-exceeded", error: "This is longer than the on-device model can read at once." } };
    case "guardrailViolation":
      return { status: 422, body: { code: "device_guardrail_violation", error: GUARDRAIL_WAY_OUT, way_out: ["website", "byok", "skip"] } };
    case "refusal":
      return { status: 422, body: { code: "device_refusal", error: "The on-device model declined to answer this. Nothing was changed.", way_out: ["website", "byok", "skip"] } };
    case "unsupportedLanguageOrLocale":
      return { status: 422, body: { code: "device_language_unsupported", error: "The on-device model does not support this language." } };
    case "rateLimited":
    case "concurrentRequests":
      return { status: 429, body: { code: code === "rateLimited" ? "rate_limit" : "device_busy", error: "The on-device model is busy. Try again in a moment." } };
    case "consentRequired":
      return { status: 409, body: { code: "device_consent_required", error: "This on-device model needs your consent to download first. Nothing was changed." } };
    case "memoryGate":
      return { status: 503, body: { code: "device_memory_gate", error: "This Mac does not have enough free memory for that on-device model." } };
    case "unavailable":
      return { status: 503, body: { code: "device_unavailable", reason: reason || "other", error: "The on-device model is not available." } };
    case "badRequest":
      return { status: 400, body: { code: "invalid_request", error: message || "The request was not valid." } };
    default:
      return { status: 502, body: { code: "device_failed", error: "The on-device model stopped without an answer." } };
  }
}

module.exports = {
  DEFAULT_MLX_MODEL,
  DEVICE_MODEL_ID,
  builtInCatalog,
  builtInDownloadRunning,
  cancelBuiltInDownload,
  downloadSnapshot,
  startBuiltInDownload,
  subscribeBuiltInDownload,
  buildBuiltInChatRequest,
  buildDeviceRequest,
  builtInModelStatus,
  checkContextBudget,
  combinedDeviceStatus,
  deviceChatRefusal,
  deviceModelHelperPath,
  deviceModelStatus,
  estimateTokens,
  isAskOnlyTaskKind,
  mapHelperError,
  persistentHelperEnabled,
  planDeviceChat,
  prewarmServeHelper,
  resetDeviceModelStatusCache,
  sendToServeHelper,
  serveHelperRunning,
  shapeAppleStatus,
  shapeBuiltInStatus,
  shutdownDeviceModelHelpers,
  spawnHelper,
  taskWhitelist,
  serveRestartCount: () => serveRestarts,
};
