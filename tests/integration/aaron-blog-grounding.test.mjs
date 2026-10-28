// 潮汐信笺 × SideAsk: the shared ranking runtime and the grounding adapter.
// Shaped after endfield-grounding.test.mjs: numbering, labels, keys, empty
// results, no-evidence wording, the request door, fallbacks — plus what the
// blog corpus adds: bigram ranking for Chinese, year filters, a timeline
// order, and chips that route back to a paragraph in the reader.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const runtime = require("../../apps/desktop/app/shared/blog-rag-runtime.js");
import { fixturePack } from "../helpers/aaron-blog-rag-fixture.mjs";

function loadAdapter(overrides = {}) {
  const opened = [];
  const sandbox = {
    window: {
      open: (...args) => opened.push(args),
      ...overrides.window,
    },
    URLSearchParams,
  };
  sandbox.window.AISystem6BlogRagRuntime = runtime;
  if (overrides.ensureAaronBlogModule) sandbox.ensureAaronBlogModule = overrides.ensureAaronBlogModule;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(`${repoRoot}apps/desktop/app/core/aaron-blog-grounding.js`, "utf8"), sandbox);
  return { api: sandbox.window.AISystem6AaronBlogGrounding, sandbox, opened };
}

test("runtime folds Traditional queries and tokenises Chinese as bigrams", () => {
  assert.equal(runtime.toHans("臺灣髮廊怎麼變"), "台湾发廊怎么变");
  assert.deepEqual(runtime.tokenize("重量的看法 iPhone"), ["重量", "量的", "的看", "看法", "iphone"]);
  const intent = runtime.parseQuery("他 2013 年怎麼看 Vista");
  assert.deepEqual(intent.years, ["2013"]);
  assert.deepEqual(intent.terms, ["vista"]);
  assert.equal(runtime.parseQuery("他對 iPhone 重量的看法怎麼變").evolution, true);
  assert.deepEqual(runtime.parseQuery("2013 到 2016 的 Vista").range, { from: "2013", to: "2016" });
});

test("search hits the right paragraphs and filters by year", () => {
  const index = runtime.buildIndex(fixturePack());
  const all = runtime.search(index, "怎麼看 Vista");
  assert.ok(all.results.length >= 3);
  const in2013 = runtime.search(index, "他 2013 年怎麼看 Vista");
  assert.ok(in2013.results.length > 0);
  assert.ok(in2013.results.every((result) => result.year === "2013"), "a year in the question filters the evidence");
  assert.equal(in2013.results[0].id, "vista-2013");
  assert.deepEqual(in2013.results.map((result) => result.para).sort(), [0, 1], "both 2013 paragraphs, each with its block position");
  assert.equal(in2013.results[0].appScope, true);
  const relaxed = runtime.search(index, "2019 年的 Vista");
  assert.equal(relaxed.yearRelaxed, true, "an empty year falls back to other years and says so");
  assert.ok(relaxed.results.length > 0);
});

test("a question about change over time comes back in date order across years", () => {
  const index = runtime.buildIndex(fixturePack());
  const found = runtime.search(index, "他對 iPhone 重量的看法怎麼變");
  assert.equal(found.order, "chronological");
  const dates = found.results.map((result) => result.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.ok(new Set(found.results.map((result) => result.year)).size >= 2, "the line spans more than one year");
});

test("prediction ledger fields and long reads survive retrieval", () => {
  const index = runtime.buildIndex(fixturePack());
  const bet = runtime.search(index, "iPhone 18 基带 预言").results[0];
  assert.equal(bet.prediction.id, "251231");
  assert.equal(bet.prediction.status, "pending");
  assert.equal(bet.para, -1);
  const glass = runtime.search(index, "Liquid Glass 玻璃材质").results.find((result) => result.kind === "long");
  assert.equal(glass.long, true);
});

test("asking about one post puts that post first; unrelated questions find nothing", () => {
  const index = runtime.buildIndex(fixturePack());
  const scoped = runtime.search(index, "拿在手里", { docId: "iphone-air-165" });
  assert.equal(scoped.results[0].id, "iphone-air-165");
  const none = runtime.search(index, "特斯拉 Cybertruck 不锈钢车身");
  assert.equal(none.results.length, 0);
  assert.equal(runtime.validatePack({ schema: 1, kind: "other", docs: [], chunks: [] }), false);
});

test("buildFromResults numbers [S1].. and carries the paragraph route", () => {
  const { api } = loadAdapter();
  const results = runtime.search(runtime.buildIndex(fixturePack()), "Vista").results;
  const grounding = api.buildFromResults(results);
  assert.equal(grounding.sourceCount, results.length);
  assert.equal(grounding.sources[0].citation, "[S1]");
  assert.equal(grounding.sources[1].citation, "[S2]");
  assert.equal(grounding.sources[0].kind, "aaronBlog");
  assert.equal(grounding.sources[0].index, 1);
  assert.equal(grounding.sources[0].postId, results[0].id);
  assert.equal(grounding.sources[0].para, results[0].para);
  assert.equal(grounding.sources[0].key, `aaronBlog:${results[0].id}:${results[0].para}:1`);
  assert.match(grounding.sources[0].label, /^\d{4}-\d{2}-\d{2} · /);
  assert.equal(grounding.sources[0].url, results[0].url);
  assert.equal(api.buildFromResults([]).sourceCount, 0);
});

test("toSideAskContext states the citation contract, dates, and no-evidence plainly", () => {
  const { api } = loadAdapter();
  const index = runtime.buildIndex(fixturePack());
  const found = runtime.search(index, "他對 iPhone 重量的看法怎麼變");
  const zh = api.toSideAskContext("他對 iPhone 重量的看法怎麼變", found.results, { lang: "zh", order: found.order });
  assert.match(zh, /\[S1\] 20\d\d-\d\d-\d\d 《/);
  assert.match(zh, /只依据这些证据/);
  assert.match(zh, /按时间先后/);
  assert.match(zh, /证据已按日期从早到晚排列/);
  const none = api.toSideAskContext("特斯拉", [], { lang: "zh" });
  assert.match(none, /博客里没有写过这个话题/);
  assert.match(none, /不要凭常识替作者作答/);
  assert.match(api.toSideAskContext("Tesla", [], { lang: "en" }), /has not written about it/);
  const relaxed = api.toSideAskContext("2019 Vista", found.results, { lang: "zh", yearRelaxed: true });
  assert.match(relaxed, /那一年博客里没写到/);
});

test("searchForSideAsk asks the service boundary with the post scope", async () => {
  const calls = [];
  const { api } = loadAdapter({
    window: {
      AISystem6Capabilities: {
        requestService: (name, input) => {
          calls.push([name, input]);
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [{ id: "vista-2013", para: 0, text: "Vista", date: "2013-01-29", title: "t" }], order: "relevance", pack: { offline: false } }) });
        },
      },
    },
  });
  api.setScope({ type: "post", id: "vista-2013", title: "个人计算的新纪元", date: "2013-01-29" });
  const result = await api.searchForSideAsk("他怎么看 Vista");
  assert.equal(result.ok, true);
  assert.equal(calls[0][0], "aaron-blog.search");
  assert.equal(calls[0][1].query, "他怎么看 Vista");
  assert.equal(calls[0][1].doc, "vista-2013");
});

test("prepare falls back to the offline pack, then to the previous evidence", async () => {
  let packAvailable = true;
  const { api } = loadAdapter({
    window: {
      // No AISystem6Capabilities: the service boundary is unreachable, which
      // is how the online path fails on this desk.
      AISystem6AaronBlog: { ragPack: () => Promise.resolve(packAvailable ? fixturePack() : null) },
    },
  });
  const offline = await api.prepare("他 2013 年怎么看 Vista");
  assert.equal(offline.offline, true);
  assert.equal(offline.fallback, false);
  assert.ok(offline.grounding.sourceCount > 0);
  assert.ok(offline.results.every((result) => result.year === "2013"));
  packAvailable = false;
  const stale = await api.prepare("下一个问题");
  assert.equal(stale.fallback, true);
  assert.equal(stale.grounding.sourceCount, offline.grounding.sourceCount);
  assert.match(api.anchorContext("zh"), /本次检索没有成功/);
});

test("a chip opens the cited paragraph in 潮汐信笺, else the aaronlau.me page", async () => {
  const revealed = [];
  let shown = true;
  const { api, opened } = loadAdapter({
    ensureAaronBlogModule: () => Promise.resolve(true),
    window: { AISystem6AaronBlog: { reveal: (target) => { revealed.push(target); return Promise.resolve(shown); } } },
  });
  const source = api.buildFromResults([{ id: "iphone-air-165", para: 2, text: "薄和轻改变的是拿在手里的感觉", url: "https://aaronlau.me/2025/09/30/", date: "2025-09-30", title: "165 克" }]).sources[0];
  assert.equal(await api.reveal(source), true);
  assert.deepEqual({ ...revealed[0] }, { postId: "iphone-air-165", para: 2, quote: "薄和轻改变的是拿在手里的感觉" });
  assert.equal(opened.length, 0);
  shown = false;
  assert.equal(await api.reveal(source), false);
  assert.equal(opened[0][0], "https://aaronlau.me/2025/09/30/");
});

test("the adapter registers 潮汐信笺 in SideAsk's anchor registry", async () => {
  const { sandbox } = loadAdapter({
    window: {
      AISystem6Capabilities: {
        requestService: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [{ id: "vista-2013", para: 0, text: "Vista", date: "2013-01-29", title: "t" }] }) }),
      },
      AISystem6AaronBlog: { sideAskLabel: () => "潮汐信笺 / 整个博客" },
    },
  });
  const hook = sandbox.window.AISystem6SideAskAnchors.aaronBlog;
  assert.equal(hook.grounding(), null, "no evidence before the first question");
  await hook.prepare("Vista", undefined);
  assert.equal(hook.grounding().sources[0].citation, "[S1]");
  assert.match(hook.context("zh"), /\[S1\] 2013-01-29/);
  assert.equal(hook.label(), "潮汐信笺 / 整个博客");
});
