// POST /api/cloud/embeddings on the public deployment.
//
// The route is the web build's own embeddings backend: Workers AI hosts bge-m3
// (1024 dims, multilingual) next to the Pages Function, which is what lets the
// web build reach the same rung of the ladder the desktop app reaches through
// LM Studio. It answers the OpenAI shape the client already parses, so no second
// code path exists on either side.
//
// This runs the real Function with a stubbed AI binding and a stubbed Durable
// Object, and mints a real session cookie with the module that issues them — so
// the gates, the ledger it spends from and the payload shape are all exercised
// without a browser or a network.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { issueSessionCookie } from "../../functions/_lib/public-session.js";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  EmbeddingRequestError,
  embedTextsWithWorkersAi,
  estimatedEmbeddingTokens,
  normalizeEmbeddingInputs,
  sharedEmbeddingsConfigured,
} from "../../functions/_lib/embeddings.mjs";
import {
  reserveSharedEmbeddingRequest,
  sharedEmbeddingsBudgetConfig,
} from "../../functions/_lib/cloud-budget.mjs";
import { onRequestGet as capabilitiesGet } from "../../functions/api/capabilities.js";
import { onRequestGet as embeddingsGet, onRequestPost } from "../../functions/api/cloud/embeddings.js";

const test = createFeatureTest("cloud-embeddings-route");

const SESSION_SECRET = "session-secret-for-the-embeddings-contract-0001";

function makeBudgetNamespace({ reserve } = {}) {
  const calls = [];
  return {
    calls,
    namespace: {
      idFromName(name) {
        calls.push({ kind: "idFromName", name });
        return `do:${name}`;
      },
      get(id) {
        return {
          async reserve(payload) {
            calls.push({ kind: "reserve", id, payload });
            return reserve
              ? reserve(payload)
              : { ok: true, reservationId: "res-1", remainingSessionRequests: 40 };
          },
          async settle(payload) {
            calls.push({ kind: "settle", payload });
            return { ok: true };
          },
        };
      },
    },
  };
}

function makeEnv({ aiRun, reserve } = {}) {
  const budget = makeBudgetNamespace({ reserve });
  return {
    budget,
    env: {
      AI_SYSTEM6_SESSION_SECRET: SESSION_SECRET,
      TURNSTILE_SECRET: "turnstile-secret",
      TURNSTILE_SITE_KEY: "turnstile-site-key",
      CLOUD_BUDGET: budget.namespace,
      ...(aiRun ? { AI: { run: aiRun } } : {}),
    },
  };
}

async function sessionCookieFor(env) {
  const cookie = await issueSessionCookie(env);
  test.assert(!!cookie, "the contract can mint the session cookie the route asks for");
  return cookie.split(";")[0];
}

// ---- The capability the client reads ---------------------------------------
{
  const { env } = makeEnv({ aiRun: async () => ({ data: [[0.1]] }) });
  const payload = await (await capabilitiesGet({ env })).json();
  test.assert(payload.features.cloud_embeddings === true, "a deployment with the AI binding advertises cloud embeddings");
  test.assert(
    payload.features.cloud_embeddings_model === EMBEDDING_MODEL_ID,
    "the advertised model is the one the route calls"
  );
  test.assert(
    payload.features.cloud_embeddings_dimensions === EMBEDDING_DIMENSIONS,
    "the advertised dimension count is the one the vectors carry"
  );
  test.assert(
    payload.same_origin_providers.includes("cloud.embeddings"),
    "and the probe list activates the provider the client asks for"
  );
}
{
  const { env } = makeEnv();
  const payload = await (await capabilitiesGet({ env })).json();
  test.assert(
    payload.features.cloud_embeddings === false
      && !payload.same_origin_providers.includes("cloud.embeddings"),
    "a deployment without the binding advertises nothing and breaks no existing fallback"
  );
}

// ---- The input rules -------------------------------------------------------
test.assert(normalizeEmbeddingInputs("one").length === 1, "one string is one input, as the OpenAI shape allows");
test.assert(normalizeEmbeddingInputs(["a", "b"]).length === 2, "an array rides one request");
for (const [label, value] of [
  ["an empty request", []],
  ["an empty string", ""],
  ["too many texts", Array.from({ length: 33 }, () => "x")],
  ["an oversized text", "x".repeat(6001)],
]) {
  let code = "";
  try {
    normalizeEmbeddingInputs(value);
  } catch (error) {
    code = error instanceof EmbeddingRequestError ? error.code : `unexpected:${error?.name}`;
  }
  test.assert(code.startsWith("embedding_"), `${label} is refused with a named code (saw ${code || "no error"})`);
}
test.assert(estimatedEmbeddingTokens(["中文字"]) >= 1, "the cost estimate is never zero");

// ---- The AI call -----------------------------------------------------------
{
  const vectors = await embedTextsWithWorkersAi(
    { AI: { run: async (model, payload) => {
      test.assert(model === EMBEDDING_MODEL_ID, "the binding is asked for the advertised model");
      test.assert(Array.isArray(payload.text) && payload.text.length === 2, "and for the texts it was given");
      return { data: [[1, 0], [0, 1]] };
    } } },
    ["a", "b"]
  );
  test.assert(vectors.length === 2 && vectors[1][1] === 1, "vectors come back in input order");
}
{
  let failed = false;
  try {
    await embedTextsWithWorkersAi({ AI: { run: async () => ({ data: [[1]] }) } }, ["a", "b"]);
  } catch (error) {
    failed = error.code === "embedding_upstream_shape";
  }
  test.assert(failed, "a short answer from the model is a named failure, not a silent mismatch");
}

// ---- The ledger it spends from ---------------------------------------------
{
  const { budget, env } = makeEnv();
  const reservation = await reserveSharedEmbeddingRequest(env.CLOUD_BUDGET, env, {
    sessionNonce: "nonce-0123456789abcdef",
    texts: ["中文字"],
    estimatedTokens: 12,
  });
  test.assert(reservation.ok === true, "an embeddings reservation is granted inside the ceilings");
  test.assert(
    budget.calls.some((call) => call.kind === "idFromName" && call.name === "shared-embeddings"),
    "embeddings spend their own ledger, not the chat allowance"
  );
  const reserved = budget.calls.find((call) => call.kind === "reserve")?.payload;
  const config = sharedEmbeddingsBudgetConfig({});
  test.assert(
    reserved?.limits?.dailyRequestLimit === config.dailyRequestLimit
      && reserved?.limits?.dailyTokenBudget === config.dailyTokenBudget,
    "and the ceilings are the embeddings ones"
  );
  test.assert(
    config.dailyRequestLimit > 100,
    "indexing a document costs several requests, so the embeddings allowance is wider than the chat one"
  );
}

// ---- The route -------------------------------------------------------------
{
  // The binding is present, so the route reaches its session gate rather than
  // stopping at the configuration check.
  const { env } = makeEnv({ aiRun: async () => ({ data: [[0.1]] }) });
  const response = await onRequestPost({
    request: new Request("https://boot-system6.pages.dev/api/cloud/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: ["hello"] }),
    }),
    env,
  });
  test.assert(response.status === 401, "a request without a verified session is refused, as chat is");
}
{
  const { env } = makeEnv();
  const response = await onRequestPost({
    request: new Request("https://boot-system6.pages.dev/api/cloud/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: ["hello"] }),
    }),
    env: { ...env, AI: undefined },
  });
  const payload = await response.json();
  test.assert(
    response.status === 503 && payload.code === "shared_cloud_embeddings_unavailable",
    "without the binding the route says so instead of pretending"
  );
}
{
  const { budget, env } = makeEnv({ aiRun: async () => ({ data: [[0.5, 0.25], [0.75, 0.5]] }) });
  const cookie = await sessionCookieFor(env);
  const response = await onRequestPost({
    request: new Request("https://boot-system6.pages.dev/api/cloud/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ input: ["first", "second"] }),
    }),
    env,
  });
  const payload = await response.json();
  test.assert(response.status === 200, `a verified request is answered (status ${response.status}, code ${payload.code || ""})`);
  test.assert(
    payload.object === "list"
      && payload.data.length === 2
      && payload.data[1].embedding[1] === 0.5
      && payload.data[1].index === 1,
    "the answer is the OpenAI shape the client already parses, in order"
  );
  test.assert(payload.model === EMBEDDING_MODEL_ID && payload.dimensions === EMBEDDING_DIMENSIONS, "and it names the model that produced it");
  test.assert(
    budget.calls.some((call) => call.kind === "settle" && call.payload?.actualTokens > 0),
    "the reservation is settled against the reported cost"
  );
}
{
  const { env } = makeEnv({
    aiRun: async () => ({ data: [[0.1]] }),
    reserve: () => ({ ok: false, code: "shared_embeddings_daily_request_limit", retryAfter: 3600, detail: "Daily limit reached." }),
  });
  const cookie = await sessionCookieFor(env);
  const response = await onRequestPost({
    request: new Request("https://boot-system6.pages.dev/api/cloud/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ input: ["hello"] }),
    }),
    env,
  });
  const payload = await response.json();
  test.assert(
    response.status === 429 && payload.code === "shared_embeddings_daily_request_limit",
    "an exhausted allowance is reported with its own code"
  );
  test.assert(response.headers.get("Retry-After") === "3600", "and with the time it comes back");
}
{
  const { env } = makeEnv({ aiRun: async () => ({ data: [[0.1]] }) });
  const response = await embeddingsGet({ env });
  const payload = await response.json();
  test.assert(
    response.status === 405 && payload.model === EMBEDDING_MODEL_ID,
    "GET says which model the route serves rather than pretending to be a list"
  );
  test.assert(sharedEmbeddingsConfigured({ AI: { run: async () => ({}) } }) === true, "the binding is what configures the route");
  test.assert(sharedEmbeddingsConfigured({}) === false, "and nothing else does");
}

// The client's capability read and the model the route calls must not drift.
test.assert(
  read("functions/_lib/embeddings.mjs").includes(`"${EMBEDDING_MODEL_ID}"`),
  "the model id has one source"
);

// ---- The VPS relay ---------------------------------------------------------
// The VPS deployment has no cloud credential of its own and no provider that can
// embed, so it borrows this route with a token instead of a Turnstile session.
{
  const relayToken = "relay-token-for-the-vps-deployment-0001";
  const { budget, env } = makeEnv({ aiRun: async () => ({ data: [[0.2, 0.4]] }) });
  env.AI_SYSTEM6_EMBEDDINGS_RELAY_TOKEN = relayToken;
  const relayRequest = (token, instance = "vps-system6") => new Request("https://boot-system6.pages.dev/api/cloud/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ai-system6-embeddings-relay": token,
      "x-ai-system6-embeddings-relay-instance": instance,
    },
    body: JSON.stringify({ input: ["hello"] }),
  });

  const refused = await onRequestPost({ request: relayRequest("wrong-token-of-the-same-length-000000"), env });
  test.assert(refused.status === 401, "a relay request with the wrong token is still a request without a session");

  const accepted = await onRequestPost({ request: relayRequest(relayToken), env });
  const payload = await accepted.json();
  test.assert(accepted.status === 200, `the relay is answered without a Turnstile session (status ${accepted.status})`);
  test.assert(payload.data[0].embedding.length === 2, "and gets the vectors in the OpenAI shape");
  const reserveCall = budget.calls.find((call) => call.kind === "reserve");
  test.assert(
    reserveCall?.payload?.limits?.sessionRequestLimit === reserveCall?.payload?.limits?.dailyRequestLimit,
    "one relay instance is not one visitor: its session ceiling is the daily ceiling"
  );
}

test.finish();
