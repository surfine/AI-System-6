// GET /api/version
//
// Returns the same JSON shape as the root server.js so cross-port
// version comparisons stay meaningful during the migration.

"use strict";

const { sendJson } = require("../lib/http.js");
const { appName, appVersion, appBuild } = require("../lib/build-info.js");

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
function handleVersion(_req, res) {
  sendJson(res, 200, {
    name: appName,
    version: appVersion,
    build: appBuild,
  });
}

module.exports = { handleVersion };
