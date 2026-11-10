// Cloudflare Pages serves 潮汐信笺's packs.
//
// The desk moved from its Node server to Pages on 2026-11-09. /api/aaron-blog
// was a public route on the old host (apps/server/server/security/
// public-session.js lists it session-free) and nothing on the Pages project
// answered it: the window's fetch got the SPA's HTML back with status 200,
// JSON.parse threw, and the reader sat on "载入中…" with 0 posts. This contract
// keeps the Pages route and the Node route answering the same addresses, and
// keeps SideAsk's retrieval working from the same published pack.
//
// No request leaves this machine: `fetch` is stubbed with the fixture pack.

import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { fixturePack } from "../helpers/aaron-blog-rag-fixture.mjs";

const test = createFeatureTest("pages-blog-packs");
const require = createRequire(import.meta.url);
const route = await import("../../functions/api/aaron-blog/[[path]].js");
const nodeRoute = require("../../apps/server/server/routes/aaron-blog.js");

const pack = fixturePack();
const ragText = JSON.stringify(pack);
const ragSha = createHash("sha256").update(ragText, "utf8").digest("hex");
const manifest = {
  schema: 1,
  contentHash: "fixture",
  counts: { posts: 6, notes: 0, langs: 1 },
  rag: { schema: 1, chunking: "top-block-v1", path: "rag.json", sha256: ragSha },
};
const chunk2026 = { schema: 1, year: "2026", posts: { "vista-2026": { html: "<p>Vista</p>" } } };

const upstream = new Map([
  ["manifest.json", JSON.stringify(manifest)],
  ["index.json", JSON.stringify({ posts: [], notes: [] })],
  ["posts/2026.json", JSON.stringify(chunk2026)],
  ["rag.json", ragText],
]);

const realFetch = globalThis.fetch;
const requested = [];
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  requested.push(url.toString());
  const file = url.pathname.replace(/^\/ai6\//, "");
  const text = upstream.get(file);
  if (text === undefined) return new Response("missing", { status: 404 });
  return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
};

async function call(path, init = { method: "GET" }) {
  const request = new Request(`https://system6.aaronlau.me${path}`, init);
  const response = await route.onRequest({ request, env: {} });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: response.status, type: response.headers.get("content-type"), text, body };
}

try {
  // ---- the packs the reader syncs through --------------------------------

  const gotManifest = await call("/api/aaron-blog/manifest");
  test.assert(gotManifest.status === 200 && gotManifest.type.startsWith("application/json"),
    "the manifest answers JSON, not the desk's HTML shell");
  test.assert(gotManifest.body?.contentHash === "fixture", "the manifest is the published one");

  const gotIndex = await call("/api/aaron-blog/index");
  test.assert(gotIndex.status === 200 && Array.isArray(gotIndex.body?.posts),
    "the post index is served from the same route");

  const gotChunk = await call("/api/aaron-blog/chunk/2026");
  test.assert(gotChunk.status === 200 && gotChunk.body?.posts?.["vista-2026"]?.html === "<p>Vista</p>",
    "a year's posts come back as that year's chunk");

  const gotRag = await call("/api/aaron-blog/rag");
  test.assert(gotRag.status === 200 && gotRag.text === ragText,
    "the rag pack is handed over byte-for-byte, so the reader's own hash check still passes");

  test.assert((await call("/api/aaron-blog/nope")).status === 404, "an unknown pack is a 404");
  test.assert((await call("/api/aaron-blog/manifest", { method: "POST" })).status === 405,
    "the pack route is read-only");

  // ---- SideAsk's evidence search ---------------------------------------

  // A pack that no longer matches the manifest's sha256 is refused before it
  // can be ranked — checked first, because the built index is cached per
  // isolate once a good pack has been read.
  upstream.set("rag.json", ragText.replace("六年前", "七年前"));
  const tampered = await call("/api/aaron-blog/retrieve?q=Vista");
  test.assert(tampered.status === 502 && /hash check/.test(tampered.body?.detail || ""),
    "a pack that no longer matches the manifest's sha256 is refused, not ranked");
  upstream.set("rag.json", ragText);

  const asked = await call(`/api/aaron-blog/retrieve?q=${encodeURIComponent("Vista 玻璃")}&limit=4`);
  test.assert(asked.status === 200 && asked.body?.results?.length > 0,
    "a question over the blog returns ranked evidence");
  test.assert(asked.body.results.every((result) => typeof result.text === "string" && result.url)
    && asked.body.results.some((result) => /Vista/i.test(result.text)),
    "each result carries the paragraph it was ranked on, so SideAsk can quote it");
  test.assert(asked.body.pack?.docs === pack.docs.length && asked.body.pack?.offline === false,
    "the answer names the pack it ranked and says it came from the network");

  const empty = await call("/api/aaron-blog/retrieve");
  test.assert(empty.status === 200 && empty.body.query === "" && empty.body.results.length === 0,
    "a retrieval with no question ranks nothing instead of failing");

  const otherCorpus = await call("/api/aaron-blog/retrieve?q=x&corpus=appscope");
  test.assert(otherCorpus.status === 400 && otherCorpus.body.error === "corpus_not_configured",
    "app-scope's pack lives on the writer's machine, so the public route refuses rather than answering from the wrong corpus");

  // ---- one address table, two hosts -------------------------------------

  const paths = ["manifest", "index", "search", "long", "rag", "chunk/2026", "chunk/1999", "nope"];
  for (const path of paths) {
    test.assert(
      route.packFileFor(`/api/aaron-blog/${path}`) === (nodeRoute.packPathname(`/api/aaron-blog/${path}`) || ""),
      `the Pages route and the Node route agree on /api/aaron-blog/${path}`
    );
  }

  // ---- session-free, as it was on the old host --------------------------

  const nodeSession = read("apps/server/server/security/public-session.js");
  test.assert(nodeSession.includes('sessionFreePrefixes = new Set(["/api/aaron-blog"])'),
    "the Node host serves the blog packs without a verified session");
  const pagesRoute = read("functions/api/aaron-blog/[[path]].js");
  test.assert(!pagesRoute.includes("sessionFromRequest") && !pagesRoute.includes("turnstileConfigured"),
    "the Pages route stays session-free too: the reader syncs before it can ask anything");
  test.assert(pagesRoute.includes('const PACK_ORIGIN = "https://aaronlau.me/ai6/"'),
    "the packs are proxied from the blog's published address, not frozen into the build");
} finally {
  globalThis.fetch = realFetch;
}

test.finish();
