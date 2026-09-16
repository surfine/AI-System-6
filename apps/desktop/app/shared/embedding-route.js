// Which backend answers this build's embeddings — as one identity.
//
// DeepSeek publishes no embeddings endpoint, so on the public deployment the
// shared brain cannot answer a semantic search. That used to send every visitor
// to the in-browser e5-small model: 384 dimensions, downloaded and computed on
// the machine least able to afford it, while the desktop app reached LM Studio.
// The Pages Function now serves bge-m3 (1024 dimensions, multilingual) from
// Workers AI, so the hosted route is preferred whenever the deployment
// advertises it — whatever the chat provider is.
//
// One identity, in one place, because two routes produce vectors that cannot be
// compared: cosine similarity between a 384-dimension e5 vector and a
// 1024-dimension bge-m3 vector is zero, which reads to the writer as "nothing
// matched" rather than "this index was built by another model". The route key is
// recorded with the vectors and checked before they are used.

(function installEmbeddingRoute(global) {
  "use strict";

  const BROWSER_MODEL_ID = "multilingual-e5-small";
  const BROWSER_DIMENSIONS = 384;

  let hosted = null;

  /**
   * Called with the features record of /api/capabilities. A hosted route has to
   * name its model and its dimension count, not merely claim the capability:
   * the desktop app and the VPS both report `cloud_embeddings: true` because
   * they can reach LM Studio, and vectors from that route are not comparable
   * with the edge model's. The deployment that serves Workers AI says which
   * model it serves.
   */
  function setHostedRoute(features = {}) {
    const model = String(features?.cloud_embeddings_model || "").trim();
    const dimensions = Number(features?.cloud_embeddings_dimensions || 0);
    const available = features?.cloud_embeddings === true && !!model && dimensions > 0;
    hosted = available
      ? {
          provider: "workers-ai",
          model,
          dimensions,
        }
      : null;
    return hosted;
  }

  function hostedRoute() {
    return hosted;
  }

  function isHosted(available) {
    return available === undefined ? Boolean(hosted) : available === true;
  }

  /** The identity stored beside every vector. */
  function key({ localModel = "", localConnected = false } = {}) {
    if (isHosted()) return `workers-ai:${hosted.model}:${hosted.dimensions}`;
    const local = String(localModel || "").trim();
    if (local && localConnected) return `lm-studio:${local}`;
    return `browser:${BROWSER_MODEL_ID}:${BROWSER_DIMENSIONS}`;
  }

  global.AISystem6EmbeddingRoute = Object.freeze({
    setHostedRoute,
    hostedRoute,
    key,
    BROWSER_MODEL_ID,
    BROWSER_DIMENSIONS,
  });
})(window);
