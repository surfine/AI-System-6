// POST /api/cmf/render-views

"use strict";

const { sendJson, readJsonBody } = require("../lib/http.js");
const { renderRecipeViews } = require("../cmf/service.js");

async function handleCmfRenderViews(req, res) {
  try {
    const body = await readJsonBody(req, { limitBytes: 256 * 1024 });
    const result = await renderRecipeViews(body.recipe || body);
    sendJson(res, 200, result, { "Cache-Control": "no-store" });
  } catch (error) {
    const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) || 500 : 500;
    sendJson(res, status, {
      error: "CMF view rendering failed",
      detail: error && typeof error === "object" && "message" in error ? String(error.message) : String(error),
    });
  }
}

module.exports = { handleCmfRenderViews };
