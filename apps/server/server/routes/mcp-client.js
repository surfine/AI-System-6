// POST /api/mcp/client — the desk asks an external MCP server for something.
//
// Local profile only, under /api/, so the ordinary browser same-origin guard
// applies: the desk's own page is the only caller. The server URL comes from
// the writer's Chooser settings, never from a guest agent or a web page.

"use strict";

const { readJsonBody, sendJson, requestSignal } = require("../lib/http.js");
const { callMcpTool, listMcpTools } = require("../mcp-client.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleMcpClient(req, res) {
  const signal = requestSignal(req, res);
  const body = await readJsonBody(req);
  const op = String(body?.op || "");
  const server = body?.server && typeof body.server === "object" ? body.server : null;
  if (!server?.url) {
    sendJson(res, 400, { error: "A server URL is required.", code: "mcp_client_no_server" });
    return;
  }
  try {
    if (op === "list") {
      sendJson(res, 200, { ok: true, ...(await listMcpTools(server, signal)) });
      return;
    }
    if (op === "call") {
      const result = await callMcpTool(server, String(body?.tool || ""), body?.arguments, signal);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }
    sendJson(res, 400, { error: `Unknown op: ${op}`, code: "mcp_client_unknown_op" });
  } catch (error) {
    const detail = /** @type {any} */ (error);
    sendJson(res, Number(detail?.statusCode) || 502, {
      error: String(detail?.message || error),
      code: String(detail?.code || "mcp_client_error"),
    });
  }
}

module.exports = { handleMcpClient };
