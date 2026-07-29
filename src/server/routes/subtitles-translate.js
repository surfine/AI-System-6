"use strict";

const { readJsonBody, requestSignal, send } = require("../lib/http.js");
const { DEEPSEEK_BASE_URL_DEFAULT, resolveCloudBaseUrl } = require("../cloud.js");
const { resolveCloudCredential } = require("../credential-vault.js");
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

    const cloudApiKey = body._cloud_active
      ? await resolveCloudCredential({
          credentialId: body._cloud_credential_id,
          provider: "deepseek",
          suppliedApiKey: body._cloud_api_key,
          allowSupplied: false,
        })
      : "";
    const options = {
      cloudActive: !!body._cloud_active,
      cloudApiKey,
      cloudBaseUrl: resolveCloudBaseUrl(body._cloud_base_url || DEEPSEEK_BASE_URL_DEFAULT),
      cloudModel: body._cloud_model,
      signal,
    };
    const translatedTexts = await translateSubtitleBlocks(blocks, mode, options);
    if (signal.aborted) return;
    send(res, 200, JSON.stringify({
      mode,
      blockCount: blocks.length,
      srt: buildSrtFromBlocks(blocks, translatedTexts),
    }), { "Content-Type": "application/json" });
  } catch (error) {
    if (signal.aborted) return;
    send(res, 422, JSON.stringify({
      error: "Subtitle translation failed",
      detail: error.message,
    }), { "Content-Type": "application/json" });
  }
}

module.exports = {
  handleSubtitlesTranslate,
};
