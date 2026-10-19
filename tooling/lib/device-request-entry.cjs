// Entry of the iOS shell's device-request bundle
// (tooling/build-device-request-bundle.mjs). The iOS shell has no Node: its
// ais6:// scheme handler answers /api/device-model/* in process, and runs this
// file in JavaScriptCore (platform/apple/AISystem6Core, ShellContract) so the
// task whitelist, the guardrails (applyChatTaskContract: system integrity and
// humanizer), the context refusal and the error copy have one source, the
// same functions apps/server/server/routes/device-model.js calls.
//
// Strings in, JSON strings out: JavaScriptCore's value bridging is never
// trusted with numbers or key order, so Swift sees exactly the bytes
// JSON.stringify writes here and in Node.

"use strict";

const device = require("../../apps/server/server/device-model.js");

// lib/http.js's default (AI_SYSTEM6_JSON_MAX_BYTES does not exist on iOS).
const JSON_LIMIT_BYTES = 1024 * 1024;

function clientError(message, statusCode, code) {
  const error = new Error(message);
  /** @type {any} */ (error).statusCode = statusCode;
  if (code) /** @type {any} */ (error).code = code;
  return error;
}

/**
 * readJsonBody's rules (lib/http.js) on a body the scheme handler already
 * holds: the same messages, codes and order of checks.
 *
 * @param {string} raw
 * @param {string} contentType
 * @param {number} byteLength
 */
function parseBody(raw, contentType, byteLength) {
  if (!String(contentType || "").toLowerCase().startsWith("application/json")) {
    throw clientError("Expected application/json.", 415, "unsupported_media_type");
  }
  if (byteLength > JSON_LIMIT_BYTES) {
    throw clientError(`Request body is too large. Limit is ${JSON_LIMIT_BYTES} bytes.`, 413, "request_body_too_large");
  }
  const text = String(raw || "");
  if (!text.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw clientError("Request body must be valid JSON.", 400, "invalid_json");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw clientError("Request body must be a JSON object. Send named fields, for example {}.", 400, "invalid_json_body");
  }
  return parsed;
}

/**
 * The answer the route gives for a thrown error: respondIfClientError's shape
 * for a 4xx, else the route's own 502.
 *
 * @param {any} error
 */
function errorAnswer(error) {
  const status = Number(error?.statusCode);
  if (Number.isInteger(status) && status >= 400 && status <= 499) {
    return {
      ok: false,
      status,
      body: {
        error: String(error?.message || "Request rejected."),
        ...(error?.code ? { code: String(error.code) } : {}),
      },
    };
  }
  return { ok: false, status: 502, body: { code: "device_failed", error: "The on-device model stopped without an answer." } };
}

/**
 * POST /api/device-model/chat up to the engine: the parsed body planned into
 * the request an engine takes, or the answer that ends it here.
 *
 * @param {string} raw
 * @param {string} contentType
 * @param {number} byteLength
 */
function prepare(raw, contentType, byteLength) {
  try {
    const body = parseBody(raw, contentType, Number(byteLength) || 0);
    const plan = device.planDeviceChat(body);
    return {
      ok: true,
      plan: {
        taskKind: plan.taskKind,
        engine: plan.engine,
        general: plan.general,
        stream: plan.stream,
        modelId: plan.modelId,
        request: plan.request,
        estimatedTokens: plan.estimatedTokens,
        replyTokens: plan.replyTokens,
      },
    };
  } catch (error) {
    return errorAnswer(error);
  }
}

const parse = (text) => JSON.parse(String(text));

module.exports = {
  prepare: (raw, contentType, byteLength) => JSON.stringify(prepare(raw, contentType, byteLength)),
  refusal: (planJson, statusJson) => JSON.stringify(device.deviceChatRefusal(parse(planJson), parse(statusJson))),
  mapHelperError: (code, message, reason) => JSON.stringify(device.mapHelperError(
    String(code || "other"),
    String(message || ""),
    reason == null ? undefined : String(reason),
  )),
  shapeAppleStatus: (rawJson) => JSON.stringify(device.shapeAppleStatus(parse(rawJson))),
  shapeBuiltInStatus: (rawJson) => JSON.stringify(device.shapeBuiltInStatus(parse(rawJson))),
  combinedDeviceStatus: (appleJson, builtInJson) => JSON.stringify(device.combinedDeviceStatus(parse(appleJson), parse(builtInJson))),
  // Exposed for the parity contract only.
  parseBodyForTest: parseBody,
};
