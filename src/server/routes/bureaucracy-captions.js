// POST /api/bureaucracy/captions
//
// Calls the configured cloud OR local chat model to generate 6
// bilingual bureaucratic-satire meme captions, parses the markdown
// response, and validates / dedupes the result. Falls back to a 503
// "LLM caption generation unavailable" response (with a warning
// string for the client to display) when the model is unreachable
// or returns fewer than 6 usable captions.
//
// Behavior parity with root server.js:
// - Body limit 64 KiB.
// - 30-second timeout via withTimeoutSignal.
// - Missing topic -> 400 { error: "Missing topic" }.
// - Default model name when no route is supplied: from the request,
//   from loadedLmStudioModelInfo, finally "local-model".
// - Caption temperature 0.78, max_tokens 1200, stream off.
// - Internal task kind "bureaucracy_meme_caption_markdown" lets the
//   Qwen35 tuner pick its bureaucracy profile.
// - Successful response shape:
//     200 { provider: "llm", captions: [...] }
// - Model unavailable shape (status 503 in root, preserved here):
//     503 { provider: "llm", captions: [], error, warning, detail }
//   The warning is the exact Chinese string the client shows.
// - Outer 502 carries body { error: "Caption generation failed",
//   detail } at status `error.statusCode || 502` (matches root —
//   readJsonBody throws with statusCode 413 on body overflow).
// - AbortError swallowed silently.

"use strict";

const { send, readJsonBody, requestSignal, withTimeoutSignal } = require("../lib/http.js");
const { isQwen35ModelName, modelContentFromChatData } = require("../chat.js");
const { findHumanizerOutputHits, scrubHumanizerOutput } = require("../humanizer.js");
const { getLoadedLmStudioModelInfo } = require("../lmstudio.js");
const {
  normalizeBureaucracyTone,
  normalizeBureaucracyTopic,
  bureaucracyTemplateById,
  buildBureaucracyCaptionMessages,
  parseBureaucracyMarkdownCaptions,
  validateBureaucracyCaptions,
  postBureaucracyChatPayload,
} = require("../bureaucracy.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleBureaucracyCaptions(req, res) {
  const baseSignal = requestSignal(req, res);
  let timeout = null;

  try {
    // Larger limit than the 64 KiB text default so an optional downscaled
    // meme image (data URL) can ride along for vision-capable models.
    const body = await readJsonBody(req, { limitBytes: 8 * 1024 * 1024 });
    const topic = normalizeBureaucracyTopic(body.topic);
    const tone = normalizeBureaucracyTone(body.tone);
    const template = bureaucracyTemplateById(body.templateId);
    const imageDataUrl = typeof body.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:image/")
      ? body.imageDataUrl
      : "";

    if (!topic) {
      send(res, 400, JSON.stringify({ error: "Missing topic" }), {
        "Content-Type": "application/json",
      });
      return;
    }

    const model = String(
      body.modelRoute?.local?.model
        || body.model
        || getLoadedLmStudioModelInfo()?.model
        || "local-model"
    );
    const qwen35Local = isQwen35ModelName(model);
    timeout = withTimeoutSignal(baseSignal, qwen35Local ? 90000 : 30000);
    const payload = {
      model,
      messages: buildBureaucracyCaptionMessages({ topic, tone, template, imageDataUrl }),
      temperature: qwen35Local ? 0.45 : 0.78,
      max_tokens: qwen35Local ? 420 : 1200,
      stream: false,
      ai_system6_task_kind: "bureaucracy_meme_caption_markdown",
    };

    try {
      const { response } = await postBureaucracyChatPayload(payload, body.modelRoute || {}, timeout.signal);
      const text = await response.text();
      const contentType = response.headers.get("content-type") || "application/json";
      if (!response.ok || !contentType.includes("application/json")) {
        throw new Error(text.substring(0, 300) || `Model returned ${response.status}`);
      }
      const data = JSON.parse(text);
      const rawContent = modelContentFromChatData(data).trim();
      const content = findHumanizerOutputHits(rawContent).length
        ? scrubHumanizerOutput(rawContent).trim()
        : rawContent;
      if (!content) throw new Error("Model response was empty.");
      const parsedCaptions = parseBureaucracyMarkdownCaptions(content, tone);
      const captions = validateBureaucracyCaptions(parsedCaptions, tone);
      if (captions.length < 6) throw new Error("Model returned too few usable captions.");

      send(res, 200, JSON.stringify({
        provider: "llm",
        captions,
      }), { "Content-Type": "application/json" });
    } catch (modelError) {
      send(res, 503, JSON.stringify({
        provider: "llm",
        captions: [],
        error: "LLM caption generation unavailable",
        warning: "大模型暂时不可用，请先在 Control Panel 配置云端模型，或启动并加载本地模型。",
        detail: /** @type {Error} */ (modelError).message,
      }), { "Content-Type": "application/json" });
    }
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    const status = /** @type {any} */ (error)?.statusCode || 502;
    send(res, status, JSON.stringify({
      error: "Caption generation failed",
      detail: /** @type {Error} */ (error).message,
    }), { "Content-Type": "application/json" });
  } finally {
    timeout?.cleanup();
  }
}

module.exports = { handleBureaucracyCaptions };
