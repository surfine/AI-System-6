"use strict";

const { readJsonBody, requestSignal, sendJson } = require("../lib/http.js");
const {
  clearMacSharedSession,
  currentMacSharedSession,
  exchangeMacTurnstileToken,
  fetchMacShared,
  fetchMacSharedCapabilities,
  pipeMacSharedResponse,
  publicOrigin,
  stageMacSharedSession,
} = require("../mac-shared-relay.js");
const { deploymentTarget } = require("../runtime-profile.js");

function requireMac(res) {
  if (deploymentTarget === "mac") return true;
  sendJson(res, 404, { error: "Not found", code: "mac_shell_required" });
  return false;
}

/**
 * Store a verified, short-lived public token in this server process only.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleMacSharedSessionCreate(req, res) {
  if (!requireMac(res)) return;
  const body = await readJsonBody(req, { limitBytes: 8192 });
  const allowedKeys = new Set(["access_token", "expires_in", "turnstile_token"]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    sendJson(res, 400, {
      error: "Website AI session contains unsupported fields.",
      code: "unsupported_session_option",
    });
    return;
  }
  try {
    const signal = requestSignal(req, res);
    const exchanged = body.turnstile_token
      ? await exchangeMacTurnstileToken(body.turnstile_token, signal)
      : { accessToken: body.access_token, expiresIn: body.expires_in };
    const session = await stageMacSharedSession({
      accessToken: exchanged.accessToken,
      expiresIn: exchanged.expiresIn,
    }, signal);
    sendJson(res, 200, {
      connected: true,
      credential_mode: "shared",
      public_origin: publicOrigin(),
      expires_at: new Date(session.expiresAt).toISOString(),
    }, { "Cache-Control": "no-store" });
  } catch (error) {
    const status = Number(/** @type {any} */ (error)?.statusCode) || 502;
    sendJson(res, status, {
      error: String(/** @type {Error} */ (error)?.message || "Website AI session failed."),
      code: String(/** @type {any} */ (error)?.code || "mac_shared_session_failed"),
    }, { "Cache-Control": "no-store" });
  }
}

async function handleMacSharedSessionStatus(req, res) {
  if (!requireMac(res)) return;
  const session = currentMacSharedSession();
  let pairing = /** @type {any} */ ({
    available: false,
    public_origin: publicOrigin(),
    sitekey: "",
    action: "",
    token_endpoint: "",
  });
  try {
    const capabilities = await fetchMacSharedCapabilities(requestSignal(req, res));
    pairing = {
      available: capabilities.available,
      public_origin: capabilities.publicOrigin,
      sitekey: capabilities.sitekey,
      action: capabilities.action,
      token_endpoint: capabilities.tokenEndpoint,
    };
  } catch (error) {
    pairing.error_code = String(/** @type {any} */ (error)?.code || "mac_shared_capabilities_unavailable");
  }
  sendJson(res, 200, {
    connected: !!session,
    credential_mode: session ? "shared" : "none",
    public_origin: publicOrigin(),
    expires_at: session ? new Date(session.expiresAt).toISOString() : "",
    pairing,
  }, { "Cache-Control": "no-store" });
}

async function handleMacSharedSessionDelete(req, res) {
  if (!requireMac(res)) return;
  const body = await readJsonBody(req, { limitBytes: 1024 });
  if (Object.keys(body).length) {
    sendJson(res, 400, { error: "Disconnect does not accept options.", code: "unsupported_session_option" });
    return;
  }
  clearMacSharedSession();
  sendJson(res, 200, { disconnected: true }, { "Cache-Control": "no-store" });
}

async function handleMacSharedChat(req, res) {
  if (!requireMac(res)) return;
  const body = await readJsonBody(req, { limitBytes: 512 * 1024 });
  delete body._cloud_api_key;
  delete body._cloud_credential_id;
  delete body._cloud_base_url;
  try {
    const upstream = await fetchMacShared("/api/cloud/chat", {
      method: "POST",
      body,
      signal: requestSignal(req, res),
    });
    if (upstream.status === 401) clearMacSharedSession();
    await pipeMacSharedResponse(upstream, res);
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    sendJson(res, Number(/** @type {any} */ (error)?.statusCode) || 502, {
      error: String(/** @type {Error} */ (error)?.message || "Website AI relay failed."),
      code: String(/** @type {any} */ (error)?.code || "mac_shared_relay_failed"),
    }, { "Cache-Control": "no-store" });
  }
}

async function handleMacSharedQuota(req, res) {
  if (!requireMac(res)) return;
  try {
    const upstream = await fetchMacShared("/api/cloud/quota", {
      signal: requestSignal(req, res),
    });
    if (upstream.status === 401) clearMacSharedSession();
    await pipeMacSharedResponse(upstream, res);
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    sendJson(res, Number(/** @type {any} */ (error)?.statusCode) || 502, {
      error: String(/** @type {Error} */ (error)?.message || "Website AI quota check failed."),
      code: String(/** @type {any} */ (error)?.code || "mac_shared_relay_failed"),
    }, { "Cache-Control": "no-store" });
  }
}

module.exports = {
  handleMacSharedChat,
  handleMacSharedQuota,
  handleMacSharedSessionCreate,
  handleMacSharedSessionDelete,
  handleMacSharedSessionStatus,
};
