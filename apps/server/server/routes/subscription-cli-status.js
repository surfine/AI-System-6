// GET /api/subscription-cli/status
//
// Whether this Mac has the `claude` and `codex` command-line tools the
// subscription CLI providers run, their versions, and whether each is signed
// in. It never runs a model turn. Local profile only: the public deployment
// has no writer's CLI and the router leaves this route out of its table.

"use strict";

const { sendJson } = require("../lib/http.js");
const { subscriptionCliStatus } = require("../subscription-cli.js");

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
async function handleSubscriptionCliStatus(_req, res) {
  const [claude, codex] = await Promise.all([subscriptionCliStatus("claude"), subscriptionCliStatus("codex")]);
  // The binary path stays on the server: the page only needs to know it was found.
  const strip = ({ path: _path, ...rest }) => rest;
  sendJson(res, 200, { providers: [strip(claude), strip(codex)] });
}

module.exports = { handleSubscriptionCliStatus };
