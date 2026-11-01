// POST /api/cmf/export-usdz

"use strict";

const { send, sendJson, readJsonBody, requestSignal } = require("../lib/http.js");
const { runCmfJob } = require("../cmf/worker-runner.js");
const { sessionFromRequest } = require("../security/public-session.js");

const USDZ_MIME_TYPE = "model/vnd.usdz+zip";

async function handleCmfExportUsdz(req, res) {
  try {
    const body = await readJsonBody(req, { limitBytes: 256 * 1024 });
    const signal = requestSignal(req, res);
    const result = await runCmfJob({
      operation: "export",
      recipe: body.recipe || body,
      renderOptions: body.render || body,
      sessionKey: sessionFromRequest(req)?.nonce || req.socket.remoteAddress || "local",
      signal,
      testControls: body._test,
    });
    if (signal.aborted) return;
    send(res, 200, result.buffer, {
      "Content-Type": result.contentType || USDZ_MIME_TYPE,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
      "X-CMF-Split-Count": String(result.stats.splitCount || 0),
      "X-CMF-Shared-Color-Count": String(result.stats.sharedColorCount || 0),
    });
  } catch (error) {
    if (res.destroyed) return;
    const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) || 500 : 500;
    sendJson(res, status, {
      error: "CMF USDZ export failed",
      code: error?.code || "cmf_export_failed",
      detail: error && typeof error === "object" && "message" in error ? String(error.message) : String(error),
    });
  }
}

module.exports = { handleCmfExportUsdz };
