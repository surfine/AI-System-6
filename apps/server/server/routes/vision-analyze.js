// POST /api/vision/analyze
//
// Local VLM endpoint for image OCR and writing-context notes. The browser
// sends a data URL; the server routes it through the current local model,
// LM Studio alias, and known local VLM fallbacks without binding the product
// to one concrete model id.

"use strict";

const {
  readJsonBody,
  requestSignal,
  sendJson,
  withTimeoutSignal,
} = require("../lib/http.js");
const { postLocalVisionAnalysis } = require("../vision.js");

const visionAnalyzeJsonMaxBytes = Math.max(
  1024 * 1024,
  Number(process.env.AI_SYSTEM6_VISION_JSON_MAX_BYTES || 14 * 1024 * 1024)
);

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleVisionAnalyze(req, res) {
  const baseSignal = requestSignal(req, res);
  const timeout = withTimeoutSignal(
    baseSignal,
    Math.max(5000, Number(process.env.AI_SYSTEM6_VISION_TIMEOUT_MS || 90000))
  );

  try {
    const body = await readJsonBody(req, { limitBytes: visionAnalyzeJsonMaxBytes });
    const dataUrl = typeof body.dataUrl === "string"
      ? body.dataUrl
      : typeof body.image === "string"
        ? body.image
        : "";
    const mode = typeof body.mode === "string" ? body.mode.trim() : "describe";
    const model = typeof body.model === "string" ? body.model.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const provider = typeof body.provider === "string" ? body.provider.trim() : "";
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";

    if (!dataUrl) {
      sendJson(res, 400, { error: "Missing image data URL" });
      return;
    }

    const result = await postLocalVisionAnalysis({
      dataUrl,
      mode,
      model,
      name,
      prompt,
      provider,
      endpoint,
      signal: timeout.signal,
    });

    sendJson(res, 200, {
      provider: "local-vision",
      mode: mode || "describe",
      model: result.model,
      text: result.text,
      usage: result.usage,
    });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    const message = /** @type {Error} */ (error).message;
    const status = /** @type {any} */ (error)?.statusCode
      || (/too large/i.test(message) ? 413 : /data URL|Missing image/i.test(message) ? 400 : 502);
    sendJson(res, status, {
      error: "Vision analysis failed",
      detail: message,
    });
  } finally {
    timeout.cleanup();
  }
}

module.exports = { handleVisionAnalyze };
