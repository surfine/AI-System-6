// POST /api/import-iwork-convert — ClioWorks N9's server half.
//
// One route, two conversions, both through the importers the text ladder
// already uses (apps/server/server/importers/iwork.js):
//   - target "pdf": the bundle's own QuickLook preview PDF, the bytes 原页
//     reading shows (nothing is rendered here);
//   - target "office": Pages→docx, Numbers→xlsx, Keynote→pptx via
//     iwork-convert.js, with a loss report for the browser's first-save list.
//
// Failures answer with a `code` the browser maps to its own copy, because the
// route's detail strings are for the log, not for the writer.

"use strict";

const { httpError, readJsonBody, requestSignal, send } = require("../lib/http.js");
const { extractIworkPreviewPdf, iworkKindForName } = require("../importers/iwork.js");
const { convertIworkToOffice } = require("../importers/iwork-convert.js");

const importIworkJsonMaxBytes = Math.max(
  1024 * 1024,
  Number(process.env.AI_SYSTEM6_IMPORT_JSON_MAX_BYTES || 80 * 1024 * 1024)
);

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleImportIworkConvert(req, res) {
  const signal = requestSignal(req, res);
  try {
    const body = await readJsonBody(req, { limitBytes: importIworkJsonMaxBytes });
    if (signal.aborted) return;
    const name = String(body.name || "Untitled");
    const mimeType = String(body.type || "");
    const target = body.target === "office" ? "office" : "pdf";
    const kind = iworkKindForName(name, mimeType);
    if (!kind) {
      throw httpError("Not a Pages, Numbers or Keynote file.", 422, "iwork_unsupported_name");
    }
    const buffer = Buffer.from(String(body.data || ""), "base64");

    if (target === "pdf") {
      const pdf = extractIworkPreviewPdf(buffer);
      if (!pdf) {
        throw httpError(
          "This iWork file carries no preview PDF, so its original pages cannot be served.",
          422,
          "iwork_no_preview_pdf"
        );
      }
      send(res, 200, JSON.stringify({ name, kind, pdf: pdf.toString("base64") }), {
        "Content-Type": "application/json",
      });
      return;
    }

    const converted = await convertIworkToOffice({ name, mimeType, buffer });
    send(res, 200, JSON.stringify({
      name,
      kind,
      format: converted.format,
      fileName: converted.fileName,
      data: converted.bytes.toString("base64"),
      report: converted.report,
    }), {
      "Content-Type": "application/json",
    });
  } catch (error) {
    if (signal.aborted) return;
    const status = /** @type {any} */ (error).statusCode
      || (/** @type {any} */ (error).code === "IWORK_CONVERT_EMPTY" ? 422 : 500);
    send(res, status, JSON.stringify({
      error: "iWork conversion failed",
      detail: /** @type {Error} */ (error).message,
      code: /** @type {any} */ (error).code || "iwork_convert_failed",
    }), {
      "Content-Type": "application/json",
    });
  }
}

module.exports = { handleImportIworkConvert };
