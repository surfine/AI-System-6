// The page's side of the guest bridge.
//
//   GET  /api/agent/executor        one Server-Sent Events stream; the page
//                                   subscribes at boot and receives `call`
//                                   events for every guest tool call.
//   POST /api/agent/executor/reply  the page's answer to one call.
//   POST /api/agent/executor/token  mint an invitation to this desk, for a
//                                   guest that reaches the public deployment.
//
// All three live under /api/, so the ordinary guard applies: on this Mac only
// the desk's own page on the loopback origin, and on the public deployment
// only a verified session. The desk id in the query string is the page's own,
// persisted in its settings; it is what lets one deployment serve many desks
// without a guest ever landing on a stranger's browser.

"use strict";

const { readJsonBody, sendJson } = require("../lib/http.js");
const executor = require("../agent-executor.js");
const { issueGuestBridgeToken } = require("../security/public-session.js");
const { publicGuestBridgeEnabled, isPublicDeployment } = require("../runtime-profile.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
function handleAgentExecutorStream(req, res) {
  let deskId = "";
  try {
    deskId = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).searchParams.get("desk") || "";
  } catch {
    deskId = "";
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": executor stream\n\n");
  executor.attachExecutor(res, deskId);
  req.on("close", () => {
    if (!res.writableEnded) res.end();
  });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentExecutorReply(req, res) {
  const body = await readJsonBody(req);
  const callId = String(body?.callId || "");
  if (!callId) {
    sendJson(res, 400, { error: "callId is required.", code: "missing_call_id" });
    return;
  }
  const accepted = executor.resolveReply(callId, {
    ok: body?.ok !== false,
    result: body?.result,
    error: body?.error ? String(body.error) : "",
  });
  sendJson(res, accepted ? 200 : 404, { accepted });
}

/**
 * Mint an invitation to the desk this page is executing for. There is no
 * revocation list: the token names the desk, so the writer revokes every
 * invitation at once by giving their desk a new id, which the page does when
 * they ask for it. That keeps the server stateless, as it is everywhere else.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleAgentExecutorToken(req, res) {
  if (isPublicDeployment && !publicGuestBridgeEnabled) {
    sendJson(res, 404, { error: "This deployment does not serve the guest bridge.", code: "mcp_not_served" });
    return;
  }
  const body = await readJsonBody(req);
  const deskId = executor.normalizeDeskId(body?.deskId);
  if (!deskId) {
    sendJson(res, 400, { error: "A desk id is required.", code: "missing_desk_id" });
    return;
  }
  // Only a desk that is actually open can be invited to: this proves the
  // caller is the page executing for that desk, not a page guessing an id.
  if (!executor.deskIsOpen(deskId)) {
    sendJson(res, 409, { error: "That desk is not connected to the bridge.", code: "desk_not_open" });
    return;
  }
  const invitation = issueGuestBridgeToken(deskId);
  if (!invitation) {
    sendJson(res, 503, {
      error: "This server has no session secret, so it cannot sign an invitation.",
      code: "session_secret_missing",
    });
    return;
  }
  sendJson(res, 200, { ok: true, ...invitation }, { "Cache-Control": "no-store" });
}

module.exports = { handleAgentExecutorReply, handleAgentExecutorStream, handleAgentExecutorToken };
