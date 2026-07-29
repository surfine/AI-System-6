// POST /api/cloud/embeddings
//
// Forwards an OpenAI-compatible embeddings request to the configured
// cloud provider (DeepSeek by default). When the cloud call fails and
// the client supplied local fallback hints in the body, the route
// retries against the local LM Studio / Ollama endpoint.
//
// Behavior parity with root server-cloud.js:
// - Strips client-only underscore-prefixed fields (_cloud_*, _local_*)
//   from the payload before forwarding, after pulling them into
//   locals.
// - Treats both a non-OK upstream status and a non-JSON content-type
//   as cloud failure.
// - Builds the local fallback payload as { model, input } only —
//   every other field from the original cloud payload is dropped.
// - The final 502 reports the CLOUD error message even when the
//   local fallback was attempted and also failed (the local error is
//   only logged).
// - AbortError is swallowed silently.
// - Two console.log / console.error lines are preserved verbatim:
//     "[cloud-embeddings] model:" / "has_key:"
//     "[cloud-embeddings] Cloud embedding failed, falling back to local. Error:"
//     "[cloud-embeddings] Local embedding fallback also failed:"
//   These show up in operator logs and are part of the contract.

"use strict";

const { send, readJsonBody, requestSignal, withTimeoutSignal } = require("../lib/http.js");
const { postJsonWithFallback } = require("../lib/fetch.js");
const { getLocalUrls } = require("../lib/local-urls.js");
const {
  cloudAuthHeaders,
  DEEPSEEK_CLOUD_MODELS,
  DEEPSEEK_API_KEY_DEFAULT,
  DEEPSEEK_BASE_URL_DEFAULT,
  DEEPSEEK_PUBLIC_BASE_URL,
  resolveCloudBaseUrl,
} = require("../cloud.js");
const { isPublicDeployment } = require("../runtime-profile.js");
const { resolveCloudCredential } = require("../credential-vault.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleCloudEmbeddings(req, res) {
  const timeoutHandle = withTimeoutSignal(requestSignal(req, res), 120000);
  const signal = timeoutHandle.signal;

  try {
    const raw = await readJsonBody(req, { limitBytes: 512 * 1024 });
    const apiKey = await resolveCloudCredential({
      credentialId: raw._cloud_credential_id,
      provider: "deepseek",
      suppliedApiKey: raw._cloud_api_key || DEEPSEEK_API_KEY_DEFAULT,
      allowSupplied: isPublicDeployment,
    });
    const baseUrl = isPublicDeployment
      ? DEEPSEEK_PUBLIC_BASE_URL
      : resolveCloudBaseUrl(raw._cloud_base_url || DEEPSEEK_BASE_URL_DEFAULT);
    const targetUrl = `${baseUrl}/v1/embeddings`;

    const localProvider = raw._local_provider;
    const localEndpoint = raw._local_endpoint;
    const localModel = raw._local_model;

    if (raw._cloud_model) raw.model = raw._cloud_model;
    delete raw._cloud_api_key;
    delete raw._cloud_credential_id;
    delete raw._cloud_model;
    delete raw._cloud_base_url;
    delete raw._local_provider;
    delete raw._local_endpoint;
    delete raw._local_model;

    const payload = raw;
    if (!apiKey) {
      send(res, 400, JSON.stringify({
        error: "Missing API key",
        code: "missing_byok_key",
      }), { "Content-Type": "application/json" });
      return;
    }
    if (
      isPublicDeployment
      && !new Set(DEEPSEEK_CLOUD_MODELS.map((item) => item.id)).has(payload.model)
    ) {
      send(res, 400, JSON.stringify({
        error: "Unsupported public cloud model",
        code: "unsupported_model",
      }), { "Content-Type": "application/json" });
      return;
    }
    console.log("[cloud-embeddings] model:", payload.model, "has_key:", !!apiKey);

    let useFallback = false;
    /** @type {Error | null} */
    let fallbackError = null;

    try {
      const authHeaders = cloudAuthHeaders(apiKey);
      const { response: upstream } = await postJsonWithFallback(
        targetUrl,
        payload,
        signal,
        authHeaders,
        { maxBytes: 16 * 1024 * 1024 }
      );
      const text = await upstream.text();
      const contentType = upstream.headers.get("content-type") || "application/json";

      if (!upstream.ok || !contentType.includes("application/json")) {
        useFallback = true;
        fallbackError = new Error(`Cloud API returned status ${upstream.status}: ${text.substring(0, 200)}`);
      } else {
        send(res, upstream.status, text, {
          "Content-Type": "application/json",
        });
        return;
      }
    } catch (error) {
      if (/** @type {any} */ (error)?.name === "AbortError") return;
      useFallback = true;
      fallbackError = /** @type {Error} */ (error);
    }

    if (useFallback) {
      if (localProvider && localModel) {
        console.log(
          "[cloud-embeddings] Cloud embedding failed, falling back to local. Error:",
          /** @type {Error} */ (fallbackError).message
        );
        try {
          const localPayload = {
            model: localModel,
            input: payload.input,
          };
          const { embeddingsUrl } = getLocalUrls(localProvider, localEndpoint);
          const { response: localUpstream } = await postJsonWithFallback(embeddingsUrl, localPayload, signal);
          const localText = await localUpstream.text();
          send(res, localUpstream.status, localText, {
            "Content-Type": localUpstream.headers.get("content-type") || "application/json",
          });
          return;
        } catch (localError) {
          console.error(
            "[cloud-embeddings] Local embedding fallback also failed:",
            /** @type {Error} */ (localError).message
          );
        }
      }

      send(res, 502, JSON.stringify({
        error: "Cloud embeddings proxy failed",
        detail: /** @type {Error} */ (fallbackError).message,
      }), { "Content-Type": "application/json" });
    }
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    send(res, 502, JSON.stringify({
      error: "Cloud embeddings proxy failed",
      detail: /** @type {Error} */ (error).message,
    }), { "Content-Type": "application/json" });
  } finally {
    timeoutHandle.cleanup();
  }
}

module.exports = { handleCloudEmbeddings };
