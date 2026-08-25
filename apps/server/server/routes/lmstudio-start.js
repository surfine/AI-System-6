"use strict";

// POST /api/lmstudio/start is deliberately narrower than the legacy setup
// route: the shipping Mac shell may start LM Studio's fixed loopback server,
// but it cannot select a binary, pass CLI arguments, load a model, or download
// one. Public and ordinary local-Web deployments cannot invoke this action.

const { readJsonBody, requestSignal, sendJson } = require("../lib/http.js");
const { ensureLmStudioServer } = require("../lmstudio.js");
const { deploymentTarget } = require("../runtime-profile.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleLmStudioStart(req, res) {
  if (deploymentTarget !== "mac") {
    sendJson(res, 404, { error: "Not found", code: "mac_shell_required" });
    return;
  }

  const body = await readJsonBody(req, { limitBytes: 1024 });
  if (Object.keys(body).length) {
    sendJson(res, 400, {
      error: "LM Studio start does not accept options.",
      code: "unsupported_start_option",
    });
    return;
  }

  try {
    const result = await ensureLmStudioServer(requestSignal(req, res));
    sendJson(res, 200, {
      provider: "lm-studio",
      status: result.started ? "started" : "ready",
      ready: true,
      endpoint: result.endpoint,
    }, { "Cache-Control": "no-store" });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    const message = String(/** @type {Error} */ (error)?.message || "");
    const code = String(/** @type {any} */ (error)?.code || (
      /not found|ENOENT/i.test(message)
        ? "lmstudio_cli_not_found"
        : "lmstudio_start_failed"
    ));
    console.error(JSON.stringify({
      level: "error",
      event: "lmstudio_start_failed",
      code,
    }));
    sendJson(res, 503, {
      error: "LM Studio could not be started on this Mac.",
      code,
    }, { "Cache-Control": "no-store" });
  }
}

module.exports = { handleLmStudioStart };
