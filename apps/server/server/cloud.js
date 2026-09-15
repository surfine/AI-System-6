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

// DeepSeek renamed the Flash model: the current name is `deepseek-flash`
// (served by DeepSeek-V4.1-Flash), and Flash reads images directly. The two
// old ids — `deepseek-v4-flash` and the experimental
// `deepseek-v4-flash-vision-exp` — are delisted but still resolve upstream to
// the same model, so they stay accepted on the way in and never leave the
// machine as the pinned id. See the vision guide, 2026-09:
// https://api-docs.deepseek.com/zh-cn/guides/vision/
const DEEPSEEK_FLASH_MODEL_ID = "deepseek-flash";
const DEEPSEEK_PRO_MODEL_ID = "deepseek-v4-pro";

/** @type {Readonly<Record<string, string>>} */
const DEEPSEEK_MODEL_ALIASES = Object.freeze({
  "deepseek-v4-flash": DEEPSEEK_FLASH_MODEL_ID,
  "deepseek-v4-flash-vision-exp": DEEPSEEK_FLASH_MODEL_ID,
  "v4-flash": DEEPSEEK_FLASH_MODEL_ID,
  "v4-pro": DEEPSEEK_PRO_MODEL_ID,
});

// Flash is the vision model. The constant keeps the name the rest of the
// codebase already reads for "the model an image request must reach".
const DEEPSEEK_VISION_MODEL_ID = DEEPSEEK_FLASH_MODEL_ID;

/**
 * Image limits published by the DeepSeek vision guide. The server enforces
 * them before a request leaves the machine so an oversized image fails with a
 * clear message instead of a provider 400.
 */
const CLOUD_VISION_LIMITS = Object.freeze({
  maxImageBytes: 32 * 1024 * 1024,
  maxFileIdImageBytes: 64 * 1024 * 1024,
  maxRequestBodyBytes: 48 * 1024 * 1024,
  maxImagesPerRequest: 600,
  // Single side of an image, and the tighter ceiling that applies once one
  // request carries 15 or more images.
  maxImageSide: 8192,
  maxImageSideManyImages: 4096,
  manyImagesThreshold: 15,
  mimeTypes: Object.freeze(["image/jpeg", "image/png", "image/gif", "image/webp"]),
  detailModes: Object.freeze(["auto", "low", "high", "original"]),
});

/**
 * Built-in cloud model registry: what DeepSeek's `GET /models` currently
 * answers. The desktop picker mirrors this array, so the order is significant
 * — Flash first, Pro second.
 *
 * @type {readonly CloudModelDescriptor[]}
 */
const DEEPSEEK_CLOUD_MODELS = [
  {
    id: DEEPSEEK_FLASH_MODEL_ID,
    name: "DeepSeek Flash",
    context_length: 1000000,
    vision: true,
  },
  { id: DEEPSEEK_PRO_MODEL_ID, name: "DeepSeek V4 Pro", context_length: 1000000 },
];

/**
 * Map a provider model id the product has used before onto the id DeepSeek
 * currently publishes. Unknown ids pass through unchanged so a custom
 * endpoint's own model names keep working.
 *
 * @param {string} modelId
 * @returns {string}
 */
function normalizeCloudModelId(modelId) {
  const id = String(modelId || "").trim();
  const key = id.toLowerCase();
  if (DEEPSEEK_MODEL_ALIASES[key]) return DEEPSEEK_MODEL_ALIASES[key];
  // A published id keeps its canonical casing; anything else belongs to a
  // custom endpoint and is handed back exactly as it arrived.
  return DEEPSEEK_CLOUD_MODELS.some((model) => model.id === key) ? key : id;
}

/**
 * @param {string} modelId
 * @returns {boolean}
 */
function isDeepSeekCloudModelId(modelId) {
  const id = normalizeCloudModelId(modelId);
  return DEEPSEEK_CLOUD_MODELS.some((model) => model.id === id);
}

/**
 * @param {string} modelId
 * @returns {boolean}
 */
function cloudModelSupportsVision(modelId) {
  const id = normalizeCloudModelId(modelId);
  return DEEPSEEK_CLOUD_MODELS.some((model) => model.id === id && model.vision === true);
}

/**
 * A model that cannot read images would silently drop the image blocks, so
 * any surface that carries one is routed to the vision model instead of the
 * picked chat model.
 *
 * @param {string} preferred
 * @returns {string}
 */
function resolveCloudVisionModel(preferred) {
  const id = normalizeCloudModelId(preferred);
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
  DEEPSEEK_FLASH_MODEL_ID,
  DEEPSEEK_PRO_MODEL_ID,
  DEEPSEEK_VISION_MODEL_ID,
  cloudModelSupportsVision,
  isDeepSeekCloudModelId,
  normalizeCloudModelId,
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
