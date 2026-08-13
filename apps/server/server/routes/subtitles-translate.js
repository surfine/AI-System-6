"use strict";

const { readJsonBody, requestSignal, send } = require("../lib/http.js");
const { DEEPSEEK_BASE_URL_DEFAULT, resolveCloudTarget } = require("../cloud.js");
const { resolveCloudCredential } = require("../credential-vault.js");
const { preparePublicCloudCall } = require("../lib/cloud-route.js");
const { isPublicDeployment } = require("../runtime-profile.js");
const { reserveSharedCloudRequest } = require("../shared-cloud-budget.js");
const { sessionFromRequest } = require("../security/public-session.js");
const {
  buildSrtFromBlocks,
  translateSubtitleBlocks,
} = require("../importers/srt.js");

/**
 * @param {any[]} blocks
 * @returns {Array<{
 *   blockIndex: number,
 *   number: string,
 *   timeline: string,
 *   start: string,
 *   end: string,
 *   textLines: string[],
 * }>}
 */
function normalizeSubtitleBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .map((block, index) => {
      const number = String(block.number || block.index || index + 1);
      const start = String(block.start || "");
      const end = String(block.end || "");
      const timeline = String(block.timeline || (start && end ? `${start} --> ${end}` : ""));
      const text = String(block.text || "");
      const textLines = Array.isArray(block.textLines)
        ? block.textLines.map((line) => String(line || ""))
        : text.split(/\r?\n/);
      return {
        blockIndex: Number(block.blockIndex ?? index),
        number,
        timeline,
        start,
        end,
        textLines,
      };
    })
    .filter((block) => block.timeline && block.textLines.join("").trim());
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleSubtitlesTranslate(req, res) {
  const signal = requestSignal(req, res);
  try {
    const body = await readJsonBody(req);
    const mode = String(body.mode || "").toLowerCase() === "tw" ? "tw" : "en";
    const blocks = normalizeSubtitleBlocks(body.blocks);
    if (!blocks.length) {
      send(res, 400, JSON.stringify({ error: "No subtitle blocks" }), { "Content-Type": "application/json" });
      return;
    }

    const options = {
      cloudActive: !!body._cloud_active,
      cloudApiKey: "",
      cloudBaseUrl: "",
      cloudModel: "",
      signal,
    };
    if (body._cloud_active) {
      if (isPublicDeployment) {
        // Representative payload so the shared allowance can meter the whole
        // job; the per-batch calls reuse the resolved key / base URL / model.
        const texts = blocks.map((block) => block.textLines.join("\n").trim()).filter(Boolean);
        const payload = {
          model: String(body._cloud_model || "deepseek-v4-flash"),
          max_tokens: 1800,
          messages: [
            { role: "system", content: "subtitle" },
            { role: "user", content: JSON.stringify(texts) },
          ],
        };
        const cloud = await preparePublicCloudCall({
          credentialId: body._cloud_credential_id,
          suppliedApiKey: body._cloud_api_key,
          requestedBaseUrl: body._cloud_base_url,
          model: payload.model,
          payload,
          req,
          reserve: false,
        });
        options.cloudApiKey = cloud.apiKey;
        options.cloudBaseUrl = cloud.baseUrl;
        options.cloudPinnedAddress = cloud.pinnedAddress;
        options.cloudPinnedFamily = cloud.pinnedFamily;
        options.cloudModel = cloud.model;
        if (cloud.usingSharedCloud) {
          const sessionNonce = sessionFromRequest(req)?.nonce || "";
          options.beforeCloudCall = (batchPayload) => {
            const reservation = reserveSharedCloudRequest({ sessionNonce, payload: batchPayload });
            if (!reservation.ok) {
              const error = /** @type {Error & { statusCode?: number, code?: string, retryAfter?: number }} */ (
                new Error(reservation.detail)
              );
              error.statusCode = reservation.code === "shared_cloud_input_too_large" ? 413 : 429;
              error.code = reservation.code;
              error.retryAfter = reservation.retryAfter;
              throw error;
            }
            return reservation;
          };
        }
      } else {
        const cloudTarget = await resolveCloudTarget(body._cloud_base_url || DEEPSEEK_BASE_URL_DEFAULT);
        options.cloudBaseUrl = cloudTarget.baseUrl;
        options.cloudPinnedAddress = cloudTarget.address;
        options.cloudPinnedFamily = cloudTarget.family;
        options.cloudApiKey = String(await resolveCloudCredential({
          credentialId: body._cloud_credential_id,
          provider: "deepseek",
          targetBaseUrl: options.cloudBaseUrl,
          suppliedApiKey: body._cloud_api_key,
          allowSupplied: false,
        })).trim();
        options.cloudModel = body._cloud_model;
      }
    }
    const translatedTexts = await translateSubtitleBlocks(blocks, mode, options);
    if (signal.aborted) return;
    send(res, 200, JSON.stringify({
      mode,
      blockCount: blocks.length,
      srt: buildSrtFromBlocks(blocks, translatedTexts),
    }), { "Content-Type": "application/json" });
  } catch (error) {
    if (signal.aborted) return;
    const status = /** @type {any} */ (error)?.statusCode || 422;
    const headers = { "Content-Type": "application/json" };
    if (/** @type {any} */ (error)?.retryAfter > 0) {
      headers["Retry-After"] = String(/** @type {any} */ (error).retryAfter);
    }
    send(res, status, JSON.stringify({
      error: /** @type {any} */ (error)?.statusCode
        ? String(/** @type {Error} */ (error).message)
        : "Subtitle translation failed",
      ...(/** @type {any} */ (error)?.code ? { code: /** @type {any} */ (error).code } : {}),
      ...(/** @type {any} */ (error)?.warning ? { warning: /** @type {any} */ (error).warning } : {}),
      detail: /** @type {Error} */ (error).message,
    }), headers);
  }
}

module.exports = {
  handleSubtitlesTranslate,
};
