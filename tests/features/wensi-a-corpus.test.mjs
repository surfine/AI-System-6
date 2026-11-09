// 文思泉涌 lane A · multi-corpus retrieval (「多语料检索」).
//
// One ranking runtime, two corpora. The pack schema is shared (schema 1) and
// the kind names which site's generator wrote it. The desk server's retrieve
// route takes an optional ?corpus=; without it the request is byte-identical
// to before, and a corpus the registry does not hold answers
// corpus_not_configured — never a silent empty result. The browser grounding
// takes an optional corpus id whose default sends nothing at all, so
// SideAsk's and 潮汐信笺's existing calls do not move.

import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-a-corpus");
const runtime = require("../../apps/desktop/app/shared/blog-rag-runtime.js");
const route = require("../../apps/server/server/routes/aaron-blog.js");

// --- The shared runtime -----------------------------------------------------

const PACK_KINDS = ["aaronlau-rag", "appscope-rag"];
for (const kind of PACK_KINDS) {
  const pack = { schema: 1, kind, docs: [{ id: "p1", t: "标题", d: "2026-01-01", u: "/2026/01/01/" }], chunks: [{ d: 0, x: "一篇关于苹果预测的段落" }] };
  test.assert(runtime.validatePack(pack) === true, `a ${kind} pack passes the shared validation`);
}
test.assert(
  runtime.validatePack({ schema: 1, kind: "someblog-rag", docs: [], chunks: [] }) === false,
  "a kind outside the table fails validation",
);
test.assert(
  runtime.validatePack({ schema: 2, kind: "aaronlau-rag", docs: [], chunks: [] }) === false,
  "the schema stays 1 for every corpus",
);

// The corpus descriptor: the shape both the server table and any browser-side
// registry are held to.
test.assert(
  runtime.validateCorpusDescriptor({ id: "aaronlau", label: "aaronlau.me", packKind: "aaronlau-rag" }) === true,
  "a corpus descriptor carries an id, a label and a pack kind",
);
test.assert(
  runtime.validateCorpusDescriptor({ id: "appscope", label: "App Scope", packKind: "appscope-rag" }) === true,
  "an appscope descriptor is describable before its pack exists",
);
for (const bad of [
  null,
  {},
  { id: "Aaronlau", label: "x", packKind: "aaronlau-rag" },
  { id: "aaronlau", label: "  ", packKind: "aaronlau-rag" },
  { id: "aaronlau", label: "aaronlau.me", packKind: "someblog-rag" },
]) {
  test.assert(runtime.validateCorpusDescriptor(bad) === false, `a malformed descriptor fails (${bad === null ? "null" : JSON.stringify(bad)})`);
}

// The webkit-compat repair: the synonym matcher must find the same words the
// lookbehind found, on engines that have no lookbehind at all. These answers
// are golden values from the ranked questions SideAsk already serves.
test.assert(
  !/\(\?<[a-z]/.test(read("app/shared/blog-rag-runtime.js")),
  "the runtime source carries no lookbehind, so WebKit can compile it",
);
const withAlias = runtime.parseQuery("苹果的预测怎么样");
test.assert(
  JSON.stringify(withAlias.slots[0]?.variants?.map((v) => v.terms.map((t) => t.term)) || []) === JSON.stringify([["苹果"], ["ipad"]])
    || (withAlias.slots.length > 0 && withAlias.slots[0].variants.some((v) => v.terms.some((t) => t.term === "苹果"))),
  "a synonym at the start of a question still lands in its slot",
);
const latinAfterHan = runtime.parseQuery("我买apple的手机");
test.assert(
  latinAfterHan.slots.some((slot) => slot.variants.some((v) => v.terms.some((t) => t.term === "apple"))),
  "a latin synonym after a Han character is still matched (the carried boundary is paid back)",
);
const glued = runtime.parseQuery("xxapple");
test.assert(
  !glued.slots.some((slot) => slot.variants.some((v) => v.terms.some((t) => t.term === "apple"))),
  "a latin word glued to letters is not matched, exactly as the lookbehind refused",
);

// --- The desk server's retrieve route ---------------------------------------

function fakeResponse() {
  const captured = { status: 0, body: "", headers: {} };
  return {
    captured,
    writeHead(status, headers) { captured.status = status; captured.headers = headers || {}; },
    end(body) { captured.body = String(body || ""); },
    destroyed: false,
    writableEnded: false,
  };
}

async function retrieve(queryString) {
  const res = fakeResponse();
  await route.handleAaronBlog(
    { url: `/api/aaron-blog/retrieve${queryString}`, headers: { host: "localhost" } },
    res,
  );
  return { status: res.captured.status, body: JSON.parse(res.captured.body || "{}") };
}

// A local pack stands in for the published one, exactly as the route's own
// AI_SYSTEM6_AARON_BLOG_PACK_DIR escape hatch allows — no network in a test.
const fixture = {
  schema: 1,
  kind: "aaronlau-rag",
  generatedAt: "2026-11-08T00:00:00Z",
  docs: [{ id: "post-1", t: "苹果预测", d: "2026-01-01", u: "/2026/01/01/" }],
  chunks: [{ d: 0, p: 0, x: "他预测苹果会发布折叠屏。" }],
};
const packDir = mkdtempSync(join(tmpdir(), "wensi-a-corpus-"));
const cacheDir = mkdtempSync(join(tmpdir(), "wensi-a-corpus-cache-"));
const { createHash } = await import("node:crypto");
const packText = JSON.stringify(fixture);
writeFileSync(join(packDir, "rag.json"), packText);
writeFileSync(join(packDir, "manifest.json"), JSON.stringify({ rag: { sha256: createHash("sha256").update(packText, "utf8").digest("hex"), path: "rag.json" } }));
const previousPackDir = process.env.AI_SYSTEM6_AARON_BLOG_PACK_DIR;
const previousCacheDir = process.env.AI_SYSTEM6_AARON_BLOG_CACHE_DIR;
const previousRag = process.env.AI_SYSTEM6_APPSCOPE_RAG;
const previousAgent = process.env.AI_SYSTEM6_AGENT_HOME;
const emptyAgent = mkdtempSync(join(tmpdir(), "wensi-a-agent-"));
process.env.AI_SYSTEM6_AARON_BLOG_PACK_DIR = packDir;
process.env.AI_SYSTEM6_AARON_BLOG_CACHE_DIR = cacheDir;
delete process.env.AI_SYSTEM6_APPSCOPE_RAG;
process.env.AI_SYSTEM6_AGENT_HOME = emptyAgent;
route.__clearCache?.();

try {
  const named = await retrieve("?q=折叠屏&corpus=aaronlau");
  test.assert(named.status === 200 && named.body.results?.length > 0, "an explicit ?corpus=aaronlau searches as before");

  const silent = await retrieve("?q=折叠屏");
  test.assert(
    silent.status === 200 && JSON.stringify(silent.body.results) === JSON.stringify(named.body.results),
    "a request without ?corpus= answers byte-identically to the explicit default",
  );

  const appscope = await retrieve("?q=折叠屏&corpus=appscope");
  test.assert(
    appscope.status === 400 && appscope.body.error === "corpus_not_configured" && appscope.body.corpus === "appscope",
    "an unconfigured corpus answers corpus_not_configured, not an empty result",
  );
  const unknown = await retrieve("?q=折叠屏&corpus=未知的语料");
  test.assert(unknown.status === 400 && unknown.body.error === "corpus_not_configured", "an unknown corpus id answers the same way");
} finally {
  if (previousPackDir === undefined) delete process.env.AI_SYSTEM6_AARON_BLOG_PACK_DIR;
  else process.env.AI_SYSTEM6_AARON_BLOG_PACK_DIR = previousPackDir;
  if (previousCacheDir === undefined) delete process.env.AI_SYSTEM6_AARON_BLOG_CACHE_DIR;
  else process.env.AI_SYSTEM6_AARON_BLOG_CACHE_DIR = previousCacheDir;
  if (previousRag === undefined) delete process.env.AI_SYSTEM6_APPSCOPE_RAG;
  else process.env.AI_SYSTEM6_APPSCOPE_RAG = previousRag;
  if (previousAgent === undefined) delete process.env.AI_SYSTEM6_AGENT_HOME;
  else process.env.AI_SYSTEM6_AGENT_HOME = previousAgent;
  rmSync(packDir, { recursive: true, force: true });
  rmSync(cacheDir, { recursive: true, force: true });
  rmSync(emptyAgent, { recursive: true, force: true });
}

// --- The browser grounding ---------------------------------------------------

function makeGrounding(requestService) {
  const context = { console };
  context.window = context;
  context.globalThis = context;
  context.AISystem6Capabilities = { requestService };
  vm.createContext(context);
  vm.runInContext(read("app/core/aaron-blog-grounding.js"), context, { filename: "aaron-blog-grounding.vm.js" });
  return { grounding: context.window.AISystem6AaronBlogGrounding, context };
}

const okResponse = { ok: true, json: async () => ({ results: [{ id: "post-1", title: "苹果预测", date: "2026-01-01", para: 0, text: "他预测苹果会发布折叠屏。", url: "/2026/01/01/" }] }) };

// Default: no corpus key travels at all, so the server default rules and the
// request is byte-identical to what SideAsk sent before this feature.
{
  let sent = null;
  const { grounding } = makeGrounding(async (name, params) => {
    sent = { name, params };
    return okResponse;
  });
  await grounding.prepare("苹果的预测");
  test.assert(sent.params && !("corpus" in sent.params), "the default request carries no corpus parameter");
  test.assert(grounding.getCorpus() === "", "the grounding starts unmarked (server default)");

  await grounding.setCorpus("appscope");
  await grounding.prepare("苹果的预测");
  test.assert(sent.params.corpus === "appscope", "a named corpus travels as ?corpus=");

  // The offline fallback ranks 潮汐信笺's own pack; another corpus's failed
  // search must not reach it. The spy is the reader's ragPack — the only door
  // to that pack.
  const offlinePack = { schema: 1, kind: "aaronlau-rag", generatedAt: "g", docs: [], chunks: [] };
  const makeFailing = () => {
    let offlineAsked = 0;
    const { grounding, context } = makeGrounding(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    context.AISystem6BlogRagRuntime = {
      validatePack: () => true,
      buildIndex: () => ({ postings: new Map(), chunks: [], docs: [] }),
      search: () => ({ results: [], yearRelaxed: false, order: "relevance" }),
      answerRules: () => [],
      evidenceNotes: () => [],
      citationUrl: (r) => r?.url || "",
    };
    context.AISystem6AaronBlog = {
      ragPack: async () => {
        offlineAsked += 1;
        return offlinePack;
      },
    };
    return { grounding, asked: () => offlineAsked };
  };
  const defaultCase = makeFailing();
  await defaultCase.grounding.prepare("苹果的预测");
  test.assert(defaultCase.asked() > 0, "the default corpus still falls back to the offline pack when the server fails");
  const appscopeCase = makeFailing();
  await appscopeCase.grounding.setCorpus("appscope");
  await appscopeCase.grounding.prepare("苹果的预测");
  test.assert(appscopeCase.asked() === 0, "a non-aaronlau corpus never falls back to the aaronlau offline pack");
}

test.finish();
