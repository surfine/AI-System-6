// Which model produced these vectors?
//
// The public deployment's shared brain is DeepSeek, which has no embeddings
// endpoint, so the web build used to answer every semantic search from the
// in-browser e5-small model (384 dimensions, downloaded per visitor). The Pages
// Function now serves bge-m3 from Workers AI (1024 dimensions, multilingual),
// and the hosted route is preferred whenever the deployment advertises it.
//
// The identity matters as much as the route: cosine similarity between a
// 384-dimension vector and a 1024-dimension one is zero, which the retrieval
// layer reads as "nothing matched" rather than "another model built this
// index". So the route key is what the derived index records beside its vectors
// and checks before it trusts them, and this holds the key's three shapes.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("embedding-route");
const source = read("app/shared/embedding-route.js");

const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const route = context.window.AISystem6EmbeddingRoute;
test.assert(!!route && typeof route.key === "function", "the embedding route publishes one key decision");

test.assert(
  route.key() === `browser:${route.BROWSER_MODEL_ID}:${route.BROWSER_DIMENSIONS}`,
  "with no hosted route and no local model the key names the in-browser model"
);
test.assert(
  route.key({ localModel: "text-embedding-nomic", localConnected: true }) === "lm-studio:text-embedding-nomic",
  "a connected local model is its own route"
);
test.assert(
  route.key({ localModel: "text-embedding-nomic", localConnected: false })
    === `browser:${route.BROWSER_MODEL_ID}:${route.BROWSER_DIMENSIONS}`,
  "a model that is not connected is not the route that answers"
);

const hostedFeatures = {
  cloud_embeddings: true,
  cloud_embeddings_model: "@cf/baai/bge-m3",
  cloud_embeddings_dimensions: 1024,
};
test.assert(route.setHostedRoute(hostedFeatures)?.provider === "workers-ai", "the capabilities payload sets the hosted route");
test.assert(
  route.key() === "workers-ai:@cf/baai/bge-m3:1024",
  "the hosted route is preferred over the in-browser model once it is advertised"
);
test.assert(
  route.key({ localModel: "text-embedding-nomic", localConnected: true }) === "workers-ai:@cf/baai/bge-m3:1024",
  "and over a connected local model: the deployment says it can answer, so it answers"
);
// A deployment that claims the capability without naming a model is the desktop
// app and the VPS, which answer it from LM Studio. Those vectors are not the
// edge model's, so the claim alone must not create a hosted route.
test.assert(
  route.setHostedRoute({ cloud_embeddings: true, cloud_embeddings_model: "text-embedding-nomic", cloud_embeddings_dimensions: 0 }) === null,
  "a capability without a usable dimension count is not a route"
);
test.assert(
  route.key() === `browser:${route.BROWSER_MODEL_ID}:${route.BROWSER_DIMENSIONS}`,
  "and the key stays with the model that will actually answer"
);
route.setHostedRoute(hostedFeatures);

test.assert(route.setHostedRoute({ cloud_embeddings: false }) === null, "a deployment without the binding advertises nothing");
test.assert(
  route.key() === `browser:${route.BROWSER_MODEL_ID}:${route.BROWSER_DIMENSIONS}`,
  "and the key falls back to the in-browser model rather than claiming a route that is not there"
);

// The property the derived index leans on: a change of backend is a change of
// key, so vectors from the old route are never compared with the new one.
route.setHostedRoute(hostedFeatures);
const hostedKey = route.key();
route.setHostedRoute({ cloud_embeddings: false });
const browserKey = route.key();
test.assert(hostedKey !== browserKey, "two backends cannot share one key");

test.finish();
