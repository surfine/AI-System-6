// GET /api/cmf/capabilities

"use strict";

const { sendJson } = require("../lib/http.js");
const { getCapabilities } = require("../cmf/service.js");

function handleCmfCapabilities(req, res) {
  sendJson(res, 200, getCapabilities(), { "Cache-Control": "no-store" });
}

module.exports = { handleCmfCapabilities };
