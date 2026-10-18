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
  const raw = await readHelperStatus(helper);
  const value = {
    ...raw,
    available: raw.available === true,
    reason: raw.available === true ? null : String(raw.reason || "other"),
    contextSize: Number.isFinite(Number(raw.contextSize)) && Number(raw.contextSize) > 0 ? Number(raw.contextSize) : null,
  };
  statusCache = { helper, at: Date.now(), value };
  return value;
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
  const raw = await readHelperStatus(helper, "mlx-status");
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
  mlxStatusCache = { helper, at: Date.now(), value };
  return value;
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

module.exports = {
  DEFAULT_MLX_MODEL,
  buildBuiltInChatRequest,
  buildDeviceRequest,
  builtInModelStatus,
  checkContextBudget,
  deviceModelHelperPath,
  deviceModelStatus,
  estimateTokens,
  isAskOnlyTaskKind,
  persistentHelperEnabled,
  prewarmServeHelper,
  resetDeviceModelStatusCache,
  sendToServeHelper,
  serveHelperRunning,
  shutdownDeviceModelHelpers,
  spawnHelper,
  taskWhitelist,
  serveRestartCount: () => serveRestarts,
};
