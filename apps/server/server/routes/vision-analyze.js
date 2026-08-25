// POST /api/vision/analyze
//
// Image endpoint for OCR and writing-context notes. The browser sends a data
// URL; the server routes it through the current local model, LM Studio alias,
// and known local VLM fallbacks without binding the product to one concrete
// model id.
//
// Cloud vision (DeepSeek `deepseek-v4-flash-vision-exp`) is a second route,
// never a silent one. An image leaves the machine only when the caller sets
// `modelRoute.cloud.active`, or asks for a fallback with `allowCloudFallback`,
// or the deployment has no local model at all. Local stays the default so the
// surfaces that promise local-only reading keep that promise.

"use strict";

const {
  readJsonBody,
  requestSignal,
  sendJson,
  withTimeoutSignal,
} = require("../lib/http.js");
const { postLocalVisionAnalysis } = require("../vision.js");
const { postCloudVisionAnalysis } = require("../cloud-vision.js");
const { isPublicDeployment } = require("../runtime-profile.js");

const visionAnalyzeJsonMaxBytes = Math.max(
  1024 * 1024,
  Number(
    process.env.AI_SYSTEM6_VISION_JSON_MAX_BYTES
      // The public host is a small VPS. A local machine may send the full
      // preview; a public session sends a compressed one. 10 MiB of JSON is
      // about 7.5 MiB of image once base64 is paid for, which is a phone photo
      // that was compressed rather than one that was cut down. nginx allows
      // 12m so the app answers with JSON instead of nginx answering with 413.
      || (isPublicDeployment ? 10 * 1024 * 1024 : 14 * 1024 * 1024)
  )
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

    const images = Array.isArray(body.images)
      ? body.images.filter((image) => typeof image === "string" && image.trim())
      : [];

    if (!dataUrl && !images.length) {
      sendJson(res, 400, { error: "Missing image data URL" });
      return;
    }

    const modelRoute = body.modelRoute && typeof body.modelRoute === "object" ? body.modelRoute : {};
    const cloudRoute = modelRoute.cloud && typeof modelRoute.cloud === "object" ? modelRoute.cloud : {};
    const allowCloudFallback = body.allowCloudFallback === true;
    const cloudFirst = cloudRoute.active === true || isPublicDeployment;

    /** @returns {Promise<{ provider: string, model: string, text: string, usage: any }>} */
    async function runCloudVision() {
      const result = await postCloudVisionAnalysis({
        dataUrl,
        images,
        mode,
        name,
        prompt,
        model: typeof cloudRoute.model === "string" ? cloudRoute.model : "",
        detail: typeof body.detail === "string" ? body.detail : "",
        credentialId: cloudRoute.credentialId || cloudRoute.credential_id,
        apiKey: cloudRoute.apiKey || cloudRoute.api_key,
        baseUrl: typeof cloudRoute.baseUrl === "string" ? cloudRoute.baseUrl : "",
        signal: timeout.signal,
        req,
      });
      return {
        provider: "cloud-vision",
        model: result.model,
        text: result.text,
        usage: result.usage,
      };
    }

    /** @returns {Promise<{ provider: string, model: string, text: string, usage: any }>} */
    async function runLocalVision() {
      const result = await postLocalVisionAnalysis({
        dataUrl: dataUrl || images[0],
        mode,
        model,
        name,
        prompt,
        provider,
        endpoint,
        signal: timeout.signal,
      });
      return {
        provider: "local-vision",
        model: result.model,
        text: result.text,
        usage: result.usage,
      };
    }

    let outcome;
    if (cloudFirst) {
      outcome = await runCloudVision();
    } else {
      try {
        outcome = await runLocalVision();
      } catch (localError) {
        if (!allowCloudFallback || /** @type {any} */ (localError)?.name === "AbortError") throw localError;
        outcome = await runCloudVision();
      }
    }

    sendJson(res, 200, {
      provider: outcome.provider,
      mode: mode || "describe",
      model: outcome.model,
      text: outcome.text,
      usage: outcome.usage,
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
