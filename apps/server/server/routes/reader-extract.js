// POST /api/reader/extract
//
// The article inside a page someone else already rendered. Time Machine's
// live engines (the browse origin and the Mac's own WebKit view) run the
// page's scripts, so the HTML they hand over is what a reader saw: a
// JavaScript app's text is in it, which the static fetch behind GET
// /api/reader never sees. The same extractor reads it.
//
// The HTML is page content, not instructions; nothing here fetches anything.

"use strict";

const { send } = require("../lib/http.js");
const { cleanHtmlForReader, friendlyReaderError } = require("../reader.js");

const EXTRACT_MAX_BYTES = 6 * 1024 * 1024;

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<any>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > EXTRACT_MAX_BYTES) {
        const error = /** @type {Error & { statusCode: number }} */ (new Error("Reader page is too large."));
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        const error = /** @type {Error & { statusCode: number }} */ (new Error("The page could not be read."));
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleReaderExtract(req, res) {
  try {
    const body = await readJsonBody(req);
    const html = typeof body?.html === "string" ? body.html : "";
    let url = "";
    try {
      const parsed = new URL(String(body?.url || ""));
      if (parsed.protocol === "http:" || parsed.protocol === "https:") url = parsed.href;
    } catch {
      url = "";
    }
    // An imported .html file has no address; its provenance is the file.
    if (!html.trim() || (!url && String(body?.url || "") !== "")) {
      send(res, 400, JSON.stringify({ error: "Missing html or url" }), { "Content-Type": "application/json" });
      return;
    }
    const article = await cleanHtmlForReader(html, url);
    send(res, 200, JSON.stringify({ ...article, completeness: "complete", rendered: true }), {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
  } catch (error) {
    const status = Number(/** @type {any} */ (error)?.statusCode) || 422;
    send(res, status, JSON.stringify({ error: "Reader failed", detail: friendlyReaderError(error) }), {
      "Content-Type": "application/json",
    });
  }
}

module.exports = { handleReaderExtract, EXTRACT_MAX_BYTES };
