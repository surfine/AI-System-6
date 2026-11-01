// GET  /api/device-model/status
// POST /api/device-model/chat
// GET  /api/device-model/catalog        the built-in pack: size, license, state, memory gate
// POST /api/device-model/download       { id, consentBytes } -> SSE progress of the one download
// GET  /api/device-model/download       attach to the running download (SSE), else { download }
// DELETE /api/device-model/download     cancel it (SIGTERM to the download process)
//
// On-device models behind the AISystem6Intelligence helper: Apple's model by
// default, the built-in MLX model with `engine: "mlx"` (status with
// ?engine=mlx). Status is cached for about ten seconds and reads
// "helperMissing" when no helper is installed. Chat is SSE in the OpenAI delta
// shape the page's readers already parse, written as each token arrives (no
// buffering, no compression): the MLX engine sends deltas, Apple's model
// cumulative snapshots whose new suffix is sent. Requests go to the persistent
// helper (device-model.js); a client abort sends it a cancel message (the
// one-shot fallback gets SIGTERM). Only the ask-only task kinds in
// device-model.js are accepted, guardrails are assembled by
// applyChatTaskContract, and a guardrail violation is reported once in plain
// words and never retried.

"use strict";

const { sendJson, readJsonBody, requestSignal, respondIfClientError } = require("../lib/http.js");
const {
  builtInModelStatus,
  combinedDeviceStatus,
  deviceChatRefusal,
  buildBuiltInChatRequest,
  buildDeviceRequest,
  builtInCatalog,
  builtInDownloadRunning,
  cancelBuiltInDownload,
  downloadSnapshot,
  startBuiltInDownload,
  subscribeBuiltInDownload,
  checkContextBudget,
  deviceModelHelperPath,
  deviceModelStatus,
  mapHelperError,
  persistentHelperEnabled,
  planDeviceChat,
  prewarmServeHelper,
  sendToServeHelper,
  serveHelperRunning,
  spawnHelper,
} = require("../device-model.js");

const CHAT_TIMEOUT_MS = 120000;
const MODEL_ID = "apple-foundation-models";

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
async function handleDeviceModelStatus(_req, res) {
  const engine = new URL(_req.url || "/", "http://localhost").searchParams.get("engine");
  if (engine === "mlx") {
    sendJson(res, 200, await builtInModelStatus(), { "Cache-Control": "no-store" });
    return;
  }
  // Apple's model at the top level (unchanged shape), the built-in model beside it.
  const [apple, builtIn] = await Promise.all([deviceModelStatus(), builtInModelStatus()]);
  sendJson(res, 200, combinedDeviceStatus(apple, builtIn), { "Cache-Control": "no-store" });
}

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
async function handleDeviceModelCatalog(_req, res) {
  const catalog = await builtInCatalog();
  sendJson(res, 200, { ...catalog, download: downloadSnapshot() }, { "Cache-Control": "no-store" });
}

/**
 * Progress events for the one download, written as they arrive. A closed
 * connection stops the listening only: the download goes on and can be
 * re-attached to, because only the writer's Cancel stops it.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
function streamDownload(req, res) {
  res.socket?.setNoDelay?.(true);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  const write = (event) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`); };
  const current = downloadSnapshot();
  write({ type: current?.state === "running" ? "progress" : current?.state || "idle", ...(current || {}) });
  if (!current || current.state !== "running") { res.end(); return; }
  const unsubscribe = subscribeBuiltInDownload((event) => {
    write(event);
    if (event.type !== "progress") { unsubscribe(); res.end(); }
  });
  req.on("close", unsubscribe);
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleDeviceModelDownloadStart(req, res) {
  try {
    const body = await readJsonBody(req);
    await startBuiltInDownload(body);
    streamDownload(req, res);
  } catch (error) {
    // The download's own refusals (consent, memory gate, no helper) are plain
    // answers, 4xx or 503, never a generic failure.
    const status = Number(error?.statusCode);
    if (error?.code && Number.isInteger(status) && status >= 400 && status < 600 && !res.headersSent) {
      sendJson(res, status, {
        code: String(error.code),
        error: String(error.message || "The model download was refused."),
        ...(error.totalBytes ? { totalBytes: error.totalBytes } : {}),
        ...(error.reason ? { reason: String(error.reason) } : {}),
      });
      return;
    }
    if (respondIfClientError(res, error)) return;
    if (!res.headersSent) sendJson(res, 502, { code: "device_failed", error: "The model download could not start." });
    else res.end();
  }
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
function handleDeviceModelDownloadAttach(req, res) {
  if (builtInDownloadRunning()) { streamDownload(req, res); return; }
  sendJson(res, 200, { download: downloadSnapshot() }, { "Cache-Control": "no-store" });
}

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
function handleDeviceModelDownloadCancel(_req, res) {
  sendJson(res, 200, { cancelled: cancelBuiltInDownload(), download: downloadSnapshot() }, { "Cache-Control": "no-store" });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleDeviceModelChat(req, res) {
  const signal = requestSignal(req, res);
  try {
    const body = await readJsonBody(req);
    // The plan and the refusals are pure (device-model.js) and shared with the
    // iOS shell; this route adds only the helper process around them.
    const built = planDeviceChat(body);
    const status = built.engine === "mlx" ? await builtInModelStatus() : await deviceModelStatus();
    const refusal = deviceChatRefusal(built, status);
    if (refusal) {
      sendJson(res, refusal.status, refusal.body);
      return;
    }
    const helper = deviceModelHelperPath();
    if (!helper) {
      sendJson(res, 503, { code: "device_unavailable", reason: "helperMissing", error: "The on-device model is not available." });
      return;
    }
    const modelId = built.modelId;
    if (built.engine === "mlx" && persistentHelperEnabled() && !serveHelperRunning(helper)) {
      prewarmServeHelper(helper, String(built.request.model));
    }
    if (!built.stream) {
      await answerAsJson(helper, built.request, signal, res, modelId);
    } else if (persistentHelperEnabled()) {
      await streamFromServeHelper(helper, built.request, signal, res, modelId);
    } else {
      await streamFromHelper(helper, built.request, signal, res, modelId);
    }
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    if (respondIfClientError(res, error)) return;
    if (!res.headersSent) sendJson(res, 502, { code: "device_failed", error: "The on-device model stopped without an answer." });
    else res.end();
  }
}

/**
 * The SSE side of one answer: helper events in, OpenAI-shaped chunks out,
 * each written as soon as it arrives.
 *
 * @param {import("node:http").ServerResponse} res
 * @param {string} modelId
 * @param {() => void} onFinish
 */
function sseWriter(res, modelId, onFinish) {
  const id = `chatcmpl-device-${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);
  let sent = "";
  let started = false;
  let finished = false;
  let nonMonotonic = false;
  const chunk = (delta, finish, extra = {}) => `data: ${JSON.stringify({
    id, object: "chat.completion.chunk", created, model: modelId,
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...extra,
  })}\n\n`;
  const begin = () => {
    if (started) return;
    started = true;
    res.socket?.setNoDelay?.(true);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    onFinish();
  };
  /**
   * @param {string} code
   * @param {string} message
   * @param {string} [reason]
   */
  const fail = (code, message, reason) => {
    if (finished) return;
    const mapped = mapHelperError(code, message, reason);
    if (!started) {
      sendJson(res, mapped.status, mapped.body);
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: mapped.body })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
    finish();
  };
  /** @param {any} event */
  const handle = (event) => {
    if (finished || !event || typeof event !== "object") return;
    if (event.type === "delta" && typeof event.text === "string") {
      if (!event.text) return;
      begin();
      sent += event.text;
      res.write(chunk({ content: event.text }, null));
    } else if (event.type === "snapshot" && typeof event.text === "string") {
      let common = 0;
      const limit = Math.min(sent.length, event.text.length);
      while (common < limit && sent[common] === event.text[common]) common += 1;
      if (common < sent.length) {
        // The model revised text already sent: a suffix delta would splice
        // the new tail onto the old head, so say "replace" with the whole text.
        nonMonotonic = true;
        begin();
        res.write(chunk({}, null, { ai_system6_replace: event.text }));
      } else {
        const delta = event.text.slice(common);
        if (delta) {
          begin();
          res.write(chunk({ content: delta }, null));
        }
      }
      sent = event.text;
    } else if (event.type === "done") {
      begin();
      /** @type {Record<string, unknown>} */
      const metrics = { model: modelId, non_monotonic_snapshots: nonMonotonic };
      if (event.usage && typeof event.usage === "object") metrics.usage = event.usage;
      if (Number.isInteger(event.pid)) metrics.helper_pid = event.pid;
      if (event.memory && typeof event.memory === "object") metrics.memory = event.memory;
      res.write(chunk({}, "stop", { ai_system6_metrics: metrics }));
      res.write("data: [DONE]\n\n");
      res.end();
      finish();
    } else if (event.type === "error") {
      fail(String(event.code || "other"), String(event.message || ""), event.reason);
    }
  };
  return { handle, fail, abandon: finish, isFinished: () => finished };
}

/**
 * One request on the persistent helper; a client abort or the timeout sends
 * a cancel message, never a signal.
 *
 * @param {string} helper
 * @param {any} request
 * @param {AbortSignal} signal
 * @param {import("node:http").ServerResponse} res
 * @param {string} modelId
 */
function streamFromServeHelper(helper, request, signal, res, modelId) {
  return new Promise((resolve) => {
    /** @type {ReturnType<typeof sendToServeHelper> | null} */
    let handle = null;
    const writer = sseWriter(res, modelId, () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      handle?.finish();
      resolve(undefined);
    });
    const onAbort = () => {
      handle?.cancel();
      // The client is gone: nothing more is written, the helper's remaining lines are dropped.
      writer.abandon();
    };
    const timer = setTimeout(() => {
      handle?.cancel();
      writer.fail("other", "timeout");
    }, CHAT_TIMEOUT_MS);
    if (signal.aborted) { clearTimeout(timer); resolve(undefined); return; }
    signal.addEventListener("abort", onAbort, { once: true });
    handle = sendToServeHelper(helper, { op: "chat", request }, {
      onEvent: (event) => {
        if (event.type === "error" && event.code === "cancelled") {
          writer.fail("other", "cancelled");
          return;
        }
        writer.handle(event);
      },
      onExit: (code) => writer.fail(code === 3 ? "unavailable" : code === 2 ? "badRequest" : "other", "helper exited"),
    });
  });
}

/**
 * A non-streaming general chat: the same helper answer collected into one
 * OpenAI chat.completion object, as /api/chat returns for stream: false.
 *
 * @param {string} helper
 * @param {any} request
 * @param {AbortSignal} signal
 * @param {import("node:http").ServerResponse} res
 * @param {string} modelId
 */
function answerAsJson(helper, request, signal, res, modelId) {
  return new Promise((resolve) => {
    let text = "";
    let settled = false;
    /** @type {ReturnType<typeof sendToServeHelper> | null} */
    let handle = null;
    const finish = (status, body) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      handle?.finish();
      if (status && !res.headersSent && !res.writableEnded) sendJson(res, status, body);
      resolve(undefined);
    };
    const onAbort = () => { handle?.cancel(); finish(0, null); };
    const timer = setTimeout(() => {
      handle?.cancel();
      const mapped = mapHelperError("other", "timeout");
      finish(mapped.status, mapped.body);
    }, CHAT_TIMEOUT_MS);
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener("abort", onAbort, { once: true });
    handle = sendToServeHelper(helper, { op: "chat", request }, {
      onEvent: (event) => {
        if (event.type === "delta") text += String(event.text || "");
        else if (event.type === "snapshot") text = String(event.text || "");
        else if (event.type === "done") {
          const usage = event.usage || {};
          finish(200, {
            id: `chatcmpl-device-${Date.now().toString(36)}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: modelId,
            choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: event.finish === "length" ? "length" : "stop" }],
            usage: {
              prompt_tokens: Number(usage.promptTokens || 0),
              completion_tokens: Number(usage.completionTokens || 0),
              total_tokens: Number(usage.promptTokens || 0) + Number(usage.completionTokens || 0),
            },
            ai_system6_metrics: { model: modelId, usage },
          });
        } else if (event.type === "error") {
          const mapped = mapHelperError(String(event.code || "other"), String(event.message || ""), event.reason);
          finish(mapped.status, mapped.body);
        }
      },
      onExit: (code) => {
        const mapped = mapHelperError(code === 3 ? "unavailable" : "other", "helper exited");
        finish(mapped.status, mapped.body);
      },
    });
  });
}

/**
 * The one-shot fallback: one helper process per request, SIGTERM on abort.
 *
 * @param {string} helper
 * @param {any} request
 * @param {AbortSignal} signal
 * @param {import("node:http").ServerResponse} res
 * @param {string} [modelId]
 */
function streamFromHelper(helper, request, signal, res, modelId = MODEL_ID) {
  return new Promise((resolve) => {
    const child = spawnHelper(helper, ["chat"]);
    let buffer = "";
    const writer = sseWriter(res, modelId, () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(undefined);
    });
    const onAbort = () => {
      child.kill("SIGTERM");
      writer.abandon();
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      writer.fail("other", "timeout");
    }, CHAT_TIMEOUT_MS);
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener("abort", onAbort, { once: true });

    const handleLine = (line) => {
      if (!line.trim()) return;
      let event;
      try { event = JSON.parse(line); } catch { return; }
      writer.handle(event);
    };
    child.stdout.on("data", (data) => {
      buffer += data;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        handleLine(line);
      }
    });
    child.on("error", () => writer.fail("other", "spawn"));
    child.on("close", (code) => {
      if (buffer.trim()) handleLine(buffer);
      buffer = "";
      if (writer.isFinished()) return;
      writer.fail(code === 3 ? "unavailable" : code === 2 ? "badRequest" : "other", "helper exited");
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(request));
  });
}

module.exports = {
  handleDeviceModelStatus,
  handleDeviceModelChat,
  handleDeviceModelCatalog,
  handleDeviceModelDownloadStart,
  handleDeviceModelDownloadAttach,
  handleDeviceModelDownloadCancel,
  mapHelperError,
};
