// POST /api/embeddings
//
// Proxies an OpenAI-compatible embeddings request to the local
// model server (LM Studio by default; Ollama when _local_provider
// is "ollama"). Symmetric counterpart of /api/cloud/embeddings.
//
// Behavior parity with root server.js:
// - Default provider is "lm-studio" — any value other than "ollama"
//   falls through to the LM Studio URL builder.
// - Strips _local_provider / _local_endpoint before forwarding.
// - Forwards upstream status verbatim. Forwards upstream content-type
//   when present, else "application/json".
// - AbortError swallowed silently.
// - Outer 502 carries { error: "Proxy failed", detail }.
// - One console.log line ("[local-embeddings] provider: ... url: ...")
//   preserved verbatim.

"use strict";

const { send, readJsonBody, requestSignal, respondIfClientError } = require("../lib/http.js");
const { postJsonWithFallback } = require("../lib/fetch.js");
const { getLocalUrls } = require("../lib/local-urls.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleEmbeddings(req, res) {
  const signal = requestSignal(req, res);

  try {
    const payload = await readJsonBody(req);
    const provider = payload._local_provider || "lm-studio";
    const endpoint = payload._local_endpoint || "";
    delete payload._local_provider;
    delete payload._local_endpoint;

    const { embeddingsUrl } = getLocalUrls(provider, endpoint);
    console.log("[local-embeddings] provider:", provider, "url:", embeddingsUrl);

    const { response: upstream } = await postJsonWithFallback(embeddingsUrl, payload, signal);
    const text = await upstream.text();

    send(res, upstream.status, text, {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
    });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    // A rejected body never went to the model server, so it is not a proxy
    // failure and must not get the label of one.
    if (respondIfClientError(res, error)) return;
    send(res, 502, JSON.stringify({
      error: "Proxy failed",
      detail: /** @type {Error} */ (error).message,
    }), {
      "Content-Type": "application/json",
    });
  }
}

module.exports = { handleEmbeddings };
