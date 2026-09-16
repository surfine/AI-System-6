"use strict";

// The VPS half of the hosted embeddings route.
//
// The shared cloud brain is DeepSeek, which publishes no embeddings endpoint, so
// this host could not answer a semantic search either: the public site's
// /api/cloud/embeddings requires a BYOK key and then forwards to a provider that
// has no such route, and a visitor has no LM Studio to fall back to. The web
// build therefore degraded to a model in the visitor's browser while the desktop
// app did not.
//
// The Pages deployment owns Workers AI (bge-m3, 1024 dimensions, multilingual)
// and meters it in its own ledger. This host borrows that route with a relay
// token instead of holding a second Cloudflare credential: one backend, one
// ledger, and the same model and dimension count on both public deployments, so
// vectors from either are comparable. Without the environment pair below the
// relay is off and this route behaves exactly as it did.

const RELAY_MODEL_ID = "@cf/baai/bge-m3";
const RELAY_DIMENSIONS = 1024;
const RELAY_MIN_TOKEN_LENGTH = 24;

function embeddingsRelayConfig(env = process.env) {
  const url = String(env.AI_SYSTEM6_EMBEDDINGS_RELAY_URL || "").trim();
  const token = String(env.AI_SYSTEM6_EMBEDDINGS_RELAY_TOKEN || "").trim();
  if (!url || token.length < RELAY_MIN_TOKEN_LENGTH) return null;
  return {
    url,
    token,
    instance: String(env.AI_SYSTEM6_EMBEDDINGS_RELAY_INSTANCE || "vps").trim() || "vps",
    model: RELAY_MODEL_ID,
    dimensions: RELAY_DIMENSIONS,
  };
}

module.exports = {
  embeddingsRelayConfig,
  RELAY_MODEL_ID,
  RELAY_DIMENSIONS,
  RELAY_MIN_TOKEN_LENGTH,
};
