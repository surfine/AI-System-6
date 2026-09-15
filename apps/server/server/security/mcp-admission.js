// Admission policy for /mcp.
//
// /mcp is not under /api/, so neither runWithLocalRequestGuard nor
// runWithPublicGuard sees it; the route admits itself here. Both profiles ask
// the same first question — is this a non-browser process? The guard for
// /api/ asks "is this the desk's own page?"; /mcp asks the opposite, and a
// browser tab from any origin can reach 127.0.0.1 (and can hold a pasted
// token), so every browser fingerprint is refused outright. (Sec-Fetch-Mode
// alone is not a browser: Node's fetch sends it too — see
// browserMarkerHeaders.)
//
// What differs is the second question:
//
//   local  — is this process on this Mac? Loopback socket and Host; the LAN
//            opt-in that /api/ honours never opens this door.
//   public — does it carry an invitation to a named desk? A token the writer
//            minted on their own page. Without that pairing a guest would
//            reach whichever stranger's browser last loaded the site.

"use strict";

const { hostHeaderParts, isLoopbackHostname } = require("./local-request.js");
const { isPublicDeployment, publicGuestBridgeEnabled } = require("../runtime-profile.js");
const { guestBridgeTokenFromRequest } = require("./public-session.js");

// Every browser sends Sec-Fetch-Site and Sec-Fetch-Dest on every request, and
// Origin on a POST. Sec-Fetch-Mode is deliberately absent from this list:
// Node's own fetch (undici — the transport Claude Code uses) sends
// `sec-fetch-mode: cors` without any other fetch-metadata header, so treating
// it as a browser marker would refuse the very client this endpoint serves.
const browserMarkerHeaders = ["origin", "sec-fetch-site", "sec-fetch-dest"];

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {{ port: string | number }} options
 * @returns {{ ok: boolean, status: number, code: string, error: string, deskId: string }}
 */
function admitMcpRequest(req, options) {
  for (const header of browserMarkerHeaders) {
    if (req.headers[header] !== undefined) {
      return {
        ok: false,
        status: 403,
        code: "mcp_browser_refused",
        error: "Browser requests are refused on /mcp. Connect from an MCP client process.",
        deskId: "",
      };
    }
  }
  const method = String(req.method || "").toUpperCase();
  if (method === "POST") {
    const contentType = String(req.headers["content-type"] || "").toLowerCase().split(";")[0].trim();
    if (contentType !== "application/json") {
      return { ok: false, status: 415, code: "unsupported_media_type", error: "Expected application/json.", deskId: "" };
    }
  }

  if (isPublicDeployment) {
    if (!publicGuestBridgeEnabled) {
      return { ok: false, status: 404, code: "mcp_not_served", error: "This deployment does not serve the guest bridge.", deskId: "" };
    }
    const invitation = guestBridgeTokenFromRequest(req);
    if (!invitation) {
      return {
        ok: false,
        status: 401,
        code: "mcp_invitation_required",
        error: "This desk needs an invitation. Ask its writer for a guest token and send it as an Authorization: Bearer header.",
        deskId: "",
      };
    }
    return { ok: true, status: 200, code: "", error: "", deskId: invitation.desk };
  }

  const remote = String(req.socket?.remoteAddress || "");
  if (!remote || !isLoopbackHostname(remote)) {
    return { ok: false, status: 403, code: "mcp_not_loopback", error: "MCP is served on this Mac only.", deskId: "" };
  }
  const host = hostHeaderParts(req.headers.host);
  if (!isLoopbackHostname(host.hostname)) {
    return { ok: false, status: 403, code: "mcp_host_not_loopback", error: "Host must be a loopback address.", deskId: "" };
  }
  const expectedPort = String(options?.port || "");
  if (expectedPort && host.port && host.port !== expectedPort) {
    return { ok: false, status: 403, code: "mcp_host_port_mismatch", error: "Host port does not match this server.", deskId: "" };
  }
  // On this Mac an invitation is optional: there is one desk. A guest that
  // carries one is still routed by it, so a second desk on the same machine
  // (another worktree on another port) stays reachable by name.
  const invitation = guestBridgeTokenFromRequest(req);
  return { ok: true, status: 200, code: "", error: "", deskId: invitation?.desk || "" };
}

module.exports = { admitMcpRequest, browserMarkerHeaders };
