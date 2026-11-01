// POST /api/cmf/render-preview

"use strict";

const { sendJson, readJsonBody, requestSignal } = require("../lib/http.js");
const { runCmfJob } = require("../cmf/worker-runner.js");
const { sessionFromRequest } = require("../security/public-session.js");

async function handleCmfRenderPreview(req, res) {
  try {
    const body = await readJsonBody(req, { limitBytes: 256 * 1024 });
    const signal = requestSignal(req, res);
    const result = await runCmfJob({
      operation: "preview",
      recipe: body.recipe || body,
      viewName: body.viewName || body.view,
      renderOptions: body.render || body,
      sessionKey: sessionFromRequest(req)?.nonce || req.socket.remoteAddress || "local",
      signal,
      testControls: body._test,
    });
    if (signal.aborted) return;
    sendJson(res, 200, result, { "Cache-Control": "no-store" });
  } catch (error) {
    if (res.destroyed) return;
    const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) || 500 : 500;
    sendJson(res, status, {
      error: "CMF preview rendering failed",
      code: error?.code || "cmf_render_failed",
      detail: error && typeof error === "object" && "message" in error ? String(error.message) : String(error),
    });
  }
}

module.exports = { handleCmfRenderPreview };
