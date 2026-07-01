// POST /api/image/generate
//
// Server-side proxy for an OpenAI-compatible image-generation endpoint
// (default: OpenAI's GPT Image / `gpt-image-1`). The browser must NOT call the
// image API directly — that would leak the API key and hit CORS — so the
// client posts {prompt, size, model, apiKey, baseUrl} here and the Node server
// forwards it with the Authorization header, mirroring how cloud chat passes
// its key through the server.
//
// Request body:
//   { prompt: string, size?: string, model?: string, apiKey: string, baseUrl?: string }
// Success: 200 { b64?: string, url?: string }   (b64 is base64 PNG, no prefix)
// Errors:  400 missing prompt/key; 502 upstream failure with { error, detail }.

"use strict";

const { send, readJsonBody, requestSignal, withTimeoutSignal } = require("../lib/http.js");
const { postJsonWithFallback } = require("../lib/fetch.js");

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-image-1";
const ALLOWED_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536", "auto"]);

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleImageGenerate(req, res) {
  const baseSignal = requestSignal(req, res);
  const timeout = withTimeoutSignal(baseSignal, 120000);

  try {
    const body = await readJsonBody(req, { limitBytes: 256 * 1024 });
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const model = (typeof body.model === "string" && body.model.trim()) || DEFAULT_MODEL;
    const baseUrl = ((typeof body.baseUrl === "string" && body.baseUrl.trim()) || DEFAULT_BASE_URL).replace(/\/$/, "");
    const size = ALLOWED_SIZES.has(body.size) ? body.size : "auto";

    if (!prompt) {
      send(res, 400, JSON.stringify({ error: "Missing prompt" }), { "Content-Type": "application/json" });
      return;
    }
    if (!apiKey) {
      send(res, 400, JSON.stringify({ error: "Missing API key" }), { "Content-Type": "application/json" });
      return;
    }

    const payload = { model, prompt, size, n: 1 };

    try {
      const { response } = await postJsonWithFallback(
        `${baseUrl}/images/generations`,
        payload,
        timeout.signal,
        { Authorization: `Bearer ${apiKey}` },
      );
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text.substring(0, 400) || `Image API returned ${response.status}`);
      }
      let data;
      try { data = JSON.parse(text); } catch { throw new Error("Image API returned non-JSON."); }
      const first = Array.isArray(data?.data) ? data.data[0] : null;
      const b64 = first && typeof first.b64_json === "string" ? first.b64_json : "";
      const url = first && typeof first.url === "string" ? first.url : "";
      if (!b64 && !url) throw new Error("Image API returned no image.");
      send(res, 200, JSON.stringify({ b64, url }), { "Content-Type": "application/json" });
    } catch (upstreamError) {
      send(res, 502, JSON.stringify({
        error: "Image generation failed",
        detail: /** @type {Error} */ (upstreamError).message,
      }), { "Content-Type": "application/json" });
    }
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    const status = /** @type {any} */ (error)?.statusCode || 502;
    send(res, status, JSON.stringify({
      error: "Image generation failed",
      detail: /** @type {Error} */ (error).message,
    }), { "Content-Type": "application/json" });
  } finally {
    timeout.cleanup();
  }
}

module.exports = { handleImageGenerate };
