// Cloud (OpenAI-compatible) helpers.
//
// Mirrors the role of root server-cloud.js. Grows incrementally as
// individual cloud routes are migrated into apps/server/. Currently exposes:
//   - DEEPSEEK_CLOUD_MODELS  (static registry)
//   - cloudAuthHeaders       (Bearer token helper)
//   - DEEPSEEK_API_KEY_DEFAULT / DEEPSEEK_BASE_URL_DEFAULT
//     (env-derived defaults; route handlers fall back to these when
//     the request body does not supply an explicit value)
//
// DeepSeek is the first-class cloud QA target. Browser requests cannot select
// another origin. Operators may configure one trusted HTTPS origin through
// DEEPSEEK_BASE_URL; arbitrary request-provided origins require an explicit
// developer-only flag, preserving a compatible endpoint as a best-effort escape hatch.

"use strict";

const dns = require("node:dns/promises");
const net = require("node:net");

const { isPrivateAddress } = require("./reader.js");

const DEEPSEEK_API_KEY_DEFAULT = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE_URL_DEFAULT =
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEEPSEEK_PUBLIC_BASE_URL = process.env.NODE_ENV === "test"
  && process.env.AI_SYSTEM6_TEST_DEEPSEEK_PUBLIC_BASE_URL
  ? process.env.AI_SYSTEM6_TEST_DEEPSEEK_PUBLIC_BASE_URL
  : "https://api.deepseek.com";
const allowCustomCloudEndpoints =
  process.env.AI_SYSTEM6_ALLOW_CUSTOM_CLOUD_ENDPOINTS === "1";
const allowPrivateCloudEndpoints =
  process.env.AI_SYSTEM6_ALLOW_PRIVATE_CLOUD_ENDPOINTS === "1";

function normalizeCloudBaseUrl(value) {
  const candidate = String(value || "").trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Cloud model endpoint is not a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Cloud model endpoint must use HTTPS.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Cloud model endpoint cannot contain credentials, query text, or a fragment.");
  }
  return `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "")}`;
}

const trustedCloudBaseUrl = normalizeCloudBaseUrl(DEEPSEEK_BASE_URL_DEFAULT);

function resolveCloudBaseUrl(requestedBaseUrl) {
  const requested = String(requestedBaseUrl || "").trim();
  if (!requested) return trustedCloudBaseUrl;
  const normalized = normalizeCloudBaseUrl(requested);
  if (normalized === trustedCloudBaseUrl) return normalized;
  if (!allowCustomCloudEndpoints) return trustedCloudBaseUrl;
  return normalized;
}

/**
 * Resolve and pin the address used for a cloud request. Custom endpoints use
 * the same public-address boundary as Reader unless the operator explicitly
 * opts into private cloud endpoints. The private-endpoint switch never
 * changes credential scoping; it only changes which addresses may be called.
 *
 * @param {string} requestedBaseUrl
 * @returns {Promise<{ baseUrl: string, address: string, family: number }>}
 */
async function resolveCloudTarget(requestedBaseUrl) {
  const baseUrl = resolveCloudBaseUrl(requestedBaseUrl);
  const parsed = new URL(baseUrl);
  const hostname = parsed.hostname.toLowerCase();
  const localHostname = hostname === "localhost"
    || hostname === "localhost.localdomain"
    || hostname.endsWith(".localhost");

  if (localHostname && !allowPrivateCloudEndpoints) {
    throw cloudEndpointError("Cloud model endpoint cannot use a local machine address.");
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname) && !allowPrivateCloudEndpoints) {
      throw cloudEndpointError("Cloud model endpoint cannot use a private network address.");
    }
    return { baseUrl, address: hostname, family: net.isIP(hostname) };
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw cloudEndpointError("Cloud model endpoint DNS lookup failed.");
  }
  if (!addresses.length) {
    throw cloudEndpointError("Cloud model endpoint DNS lookup returned no addresses.");
  }
  if (!allowPrivateCloudEndpoints && addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw cloudEndpointError("Cloud model endpoint cannot use a private network address.");
  }

  return {
    baseUrl,
    address: addresses[0].address,
    family: addresses[0].family,
  };
}

/**
 * @param {string} message
 * @returns {Error & { code?: string, statusCode?: number }}
 */
function cloudEndpointError(message) {
  const error = /** @type {Error & { code?: string, statusCode?: number }} */ (new Error(message));
  error.code = "invalid_cloud_endpoint";
  error.statusCode = 400;
  return error;
}

/**
 * Environment credentials are operator-owned and may only leave the service
 * for an explicitly trusted DeepSeek endpoint. Browser-selected custom
 * endpoints, including private endpoints, never inherit this trust.
 *
 * @param {string} provider
 * @param {string} targetBaseUrl
 * @returns {boolean}
 */
function isTrustedDeepSeekCredentialTarget(provider, targetBaseUrl) {
  if (String(provider || "").trim().toLowerCase() !== "deepseek") return false;
  let normalized;
  try {
    normalized = normalizeCloudBaseUrl(targetBaseUrl);
  } catch {
    return false;
  }
  return normalized === trustedCloudBaseUrl || normalized === DEEPSEEK_PUBLIC_BASE_URL;
}

/**
 * @typedef {Object} CloudModelDescriptor
 * @property {string} id              Provider model id (used as the
 *                                    OpenAI-compatible `model` field).
 * @property {string} name            Human display name.
 * @property {number} context_length  Maximum context window in tokens.
 * @property {boolean} [vision]      True when the model reads image content.
 */

const DEEPSEEK_VISION_MODEL_ID = "deepseek-v4-flash-vision-exp";

/**
 * Image limits published by the DeepSeek vision guide. The server enforces
 * them before a request leaves the machine so an oversized image fails with a
 * clear message instead of a provider 400.
 */
const CLOUD_VISION_LIMITS = Object.freeze({
  maxImageBytes: 32 * 1024 * 1024,
  maxImagesPerRequest: 600,
  mimeTypes: Object.freeze(["image/jpeg", "image/png", "image/gif", "image/webp"]),
  detailModes: Object.freeze(["auto", "low", "high", "original"]),
});

/**
 * Built-in cloud model registry. Mirrors the same array in root
 * server-cloud.js exactly. The order is significant — the client
 * surfaces it in this order in the cloud-model picker, so the vision model
 * goes last and the text models keep their place.
 *
 * @type {readonly CloudModelDescriptor[]}
 */
const DEEPSEEK_CLOUD_MODELS = [
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", context_length: 1000000 },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", context_length: 1000000 },
  {
    id: DEEPSEEK_VISION_MODEL_ID,
    name: "DeepSeek V4 Flash Vision (experimental)",
    context_length: 1000000,
    vision: true,
  },
];

/**
 * @param {string} modelId
 * @returns {boolean}
 */
function cloudModelSupportsVision(modelId) {
  const id = String(modelId || "").trim();
  return DEEPSEEK_CLOUD_MODELS.some((model) => model.id === id && model.vision === true);
}

/**
 * The text models silently drop image blocks, so any surface that carries an
 * image must be routed to the vision model instead of the picked chat model.
 *
 * @param {string} preferred
 * @returns {string}
 */
function resolveCloudVisionModel(preferred) {
  const id = String(preferred || "").trim();
  return cloudModelSupportsVision(id) ? id : DEEPSEEK_VISION_MODEL_ID;
}

/**
 * Build the auth headers for an OpenAI-compatible cloud request.
 * Returns an empty object when no key is supplied; callers spread
 * the result into their headers map.
 *
 * @param {string | null | undefined} apiKey
 * @returns {Record<string, string>}
 */
function cloudAuthHeaders(apiKey) {
  if (!apiKey) return {};
  return { "Authorization": `Bearer ${apiKey}` };
}

module.exports = {
  CLOUD_VISION_LIMITS,
  DEEPSEEK_CLOUD_MODELS,
  DEEPSEEK_VISION_MODEL_ID,
  cloudModelSupportsVision,
  resolveCloudVisionModel,
  cloudAuthHeaders,
  DEEPSEEK_API_KEY_DEFAULT,
  DEEPSEEK_BASE_URL_DEFAULT,
  DEEPSEEK_PUBLIC_BASE_URL,
  normalizeCloudBaseUrl,
  resolveCloudBaseUrl,
  resolveCloudTarget,
  isTrustedDeepSeekCredentialTarget,
};
