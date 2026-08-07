// GET /api/version
//
// Returns version / build / sourceCommit from the generated identity plus the
// runtime-resolved snapshotCommit and generatedAt. The runtime fields are
// never baked into git-tracked generated files.

"use strict";

const { sendJson } = require("../lib/http.js");
const {
  appName,
  appVersion,
  appBuild,
  appSourceCommit,
  appSnapshotCommit,
  appGeneratedAt,
} = require("../lib/build-info.js");

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
function handleVersion(_req, res) {
  sendJson(res, 200, {
    name: appName,
    version: appVersion,
    build: appBuild,
    sourceCommit: appSourceCommit,
    snapshotCommit: appSnapshotCommit,
    generatedAt: appGeneratedAt,
  });
}

module.exports = { handleVersion };
