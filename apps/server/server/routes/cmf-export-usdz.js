// POST /api/cmf/export-usdz

"use strict";

const { send, sendJson, readJsonBody } = require("../lib/http.js");
const { exportRecipeUsdz } = require("../cmf/service.js");

const USDZ_MIME_TYPE = "model/vnd.usdz+zip";

async function handleCmfExportUsdz(req, res) {
  try {
    const body = await readJsonBody(req, { limitBytes: 256 * 1024 });
    const result = await exportRecipeUsdz(body.recipe || body);
    send(res, 200, result.buffer, {
      "Content-Type": result.contentType || USDZ_MIME_TYPE,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
      "X-CMF-Split-Count": String(result.stats.splitCount || 0),
      "X-CMF-Shared-Color-Count": String(result.stats.sharedColorCount || 0),
    });
  } catch (error) {
    const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) || 500 : 500;
    sendJson(res, status, {
      error: "CMF USDZ export failed",
      detail: error && typeof error === "object" && "message" in error ? String(error.message) : String(error),
    });
  }
}

module.exports = { handleCmfExportUsdz };
