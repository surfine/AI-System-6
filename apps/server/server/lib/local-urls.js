// Provider URL builder for local LM Studio / Ollama OpenAI-compatible
// endpoints. Mirrors `getLocalUrls` from root server.js.
//
// The branch on `provider === "ollama"` currently produces the same
// URL shape as the LM Studio branch. That redundancy is preserved here
// intentionally — the two branches exist as extension points for
// future per-provider URL differences, and collapsing them would
// constitute a behavior-shape change we have not been asked to make.

"use strict";

const LM_STUDIO_BASE_URL_DEFAULT = process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234";
const allowRemoteModelEndpoints =
  process.env.AI_SYSTEM6_ALLOW_REMOTE_MODEL_ENDPOINTS === "1";

function normalizedLocalBaseUrl(value) {
  let candidate = String(value || "").trim().replace(/\/+$/, "");
  if (!candidate) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `http://${candidate}`;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Local model endpoint is not a valid URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Local model endpoint must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Local model endpoint cannot contain credentials, query text, or a fragment.");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const loopback = hostname === "localhost"
    || hostname === "::1"
    || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  if (!loopback && !allowRemoteModelEndpoints) {
    throw new Error(
      "Local model endpoint must use loopback. Set AI_SYSTEM6_ALLOW_REMOTE_MODEL_ENDPOINTS=1 only for an explicitly trusted developer endpoint."
    );
  }
  return `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "")}`;
}

/**
 * @typedef {Object} LocalUrls
 * @property {string} baseUrl
 * @property {string} chatUrl
 * @property {string} embeddingsUrl
 * @property {string} modelsUrl
 */

/**
 * Build the OpenAI-compatible endpoint URLs for a local model server.
 *
 * @param {string} provider  "ollama" or anything else (defaults to LM Studio).
 * @param {string} endpoint  Optional explicit base URL or host:port. If empty
 *                           or starts with "/", the provider default is used.
 * @returns {LocalUrls}
 */
function getLocalUrls(provider, endpoint) {
  let baseUrl = String(endpoint || "").trim();

  if (!baseUrl || baseUrl.startsWith("/")) {
    if (provider === "ollama") {
      baseUrl = "http://127.0.0.1:11434";
    } else {
      baseUrl = LM_STUDIO_BASE_URL_DEFAULT;
    }
  }
  baseUrl = normalizedLocalBaseUrl(baseUrl);

  let chatUrl = "";
  let embeddingsUrl = "";
  let modelsUrl = "";

  if (provider === "ollama") {
    chatUrl = `${baseUrl}/v1/chat/completions`;
    embeddingsUrl = `${baseUrl}/v1/embeddings`;
    modelsUrl = `${baseUrl}/v1/models`;
  } else {
    chatUrl = `${baseUrl}/v1/chat/completions`;
    embeddingsUrl = `${baseUrl}/v1/embeddings`;
    modelsUrl = `${baseUrl}/v1/models`;
  }

  return { baseUrl, chatUrl, embeddingsUrl, modelsUrl };
}

module.exports = {
  getLocalUrls,
  LM_STUDIO_BASE_URL_DEFAULT,
  normalizedLocalBaseUrl,
};
