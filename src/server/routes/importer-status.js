// GET /api/importer-status
//
// Returns the same JSON shape as the root server.js so client code
// that already polls the root endpoint can be repointed at src/
// without changes.

"use strict";

const { sendJson } = require("../lib/http.js");
const { getImporterStatus } = require("../markitdown.js");

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
async function handleImporterStatus(_req, res) {
  const status = await getImporterStatus();
  sendJson(res, 200, status);
}

module.exports = { handleImporterStatus };
