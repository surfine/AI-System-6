// Product help reuses the existing System Help records and pure keyword
// primitives. It must stay small, deterministic, bilingual, and independent
// of the project retrieval index, browser storage, the network, or a model.

import { createRequire } from "node:module";
import vm from "node:vm";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("product-help-retrieval");
const require = createRequire(import.meta.url);
const runtimeSource = read("app/core/product-help-runtime.js");
const dictionarySource = read("app/data/system-dictionary.js");
const actionsSource = read("app/core/actions.js");
const runtime = require("../../apps/desktop/app/core/product-help-runtime.js");

const dictionaryContext = vm.createContext({ window: {} });
vm.runInContext(dictionarySource, dictionaryContext);
const entries = dictionaryContext.window.AISystem6DictionaryData.systemDictionaryEntries;
const byId = new Map(entries.map((entry) => [entry.id, entry]));

test.assertFile("app/core/product-help-runtime.js", "the product-help ranker has one app-owned pure runtime");
test.assertIncludes(runtimeSource, "AISystem6RetrievalRuntime", "the ranker reuses the shared retrieval vocabulary");
test.assertIncludes(runtimeSource, "retrievalRuntime.getQueryWords", "query tokenization comes from the existing retrieval runtime");
test.assertIncludes(runtimeSource, "retrievalRuntime.keywordScore", "keyword scoring comes from the existing retrieval runtime");
for (const forbidden of ["fetch(", "indexedDB", "localStorage", "sessionStorage", "document.", "embedding", "cosineSimilarity"]) {
  test.assertNotIncludes(runtimeSource, forbidden, `the pure product-help runtime does not depend on ${forbidden}`);
}

const expectedTopics = [
  "on-device-storage",
  "shared-ai-allowance",
  "deployment-targets",
  "read-only-window",
  "ai-troubleshooting",
  "quick-tour",
  "install-web-app",
];
for (const id of expectedTopics) {
  const entry = byId.get(id);
  test.assert(!!entry, `${id} is a canonical System Help topic`);
  test.assert(!!String(entry?.definition || "").trim(), `${id} has an English definition`);
  test.assert(!!String(entry?.definitionZh || "").trim(), `${id} has a Chinese definition`);
  test.assert(!!String(entry?.example || "").trim(), `${id} has an English example`);
  test.assert(!!String(entry?.exampleZh || "").trim(), `${id} has a Chinese example`);
}

const ids = entries.map((entry) => entry.id);
test.assert(new Set(ids).size === ids.length, "System Help topic ids are unique");
const invalidRelations = expectedTopics.flatMap((id) => (byId.get(id)?.related || [])
  .filter((relatedId) => !byId.has(relatedId))
  .map((relatedId) => `${id} -> ${relatedId}`));
test.assert(invalidRelations.length === 0, `new topics relate only to existing topics${invalidRelations.length ? `: ${invalidRelations.join(", ")}` : ""}`);

test.assertNotIncludes(dictionarySource, "Welcome Floppy", "product knowledge no longer teaches the retired Welcome Floppy");
test.assertNotIncludes(dictionarySource, "欢迎软盘", "Chinese product knowledge no longer teaches the retired Welcome Floppy");
test.assertNotIncludes(dictionarySource, 'action: "open-guide"', "System Help actions no longer reopen the retired guide");
test.assertIncludes(dictionarySource, 'id: "start-here"', "the Start Here concept remains available as the ClioTalk introduction");
test.assertIncludes(dictionarySource, 'id: "quick-tour"', "the deterministic tour remains discoverable on request");

for (const action of [
  "open-project-disks",
  "open-control",
  "open-system-status",
  "open-assistant",
  "play-teaser-demo",
  "install-web-app",
]) {
  test.assertIncludes(actionsSource, `"${action}"`, `new help topics reuse the existing ${action} command`);
}

const queryMatrix = [
  ["Scrapbook 是干嘛的？", "scrapbook"],
  ["Question Sheet 和直接聊天有什么区别？", "question-sheet"],
  ["我的稿子放在哪里？", "on-device-storage"],
  ["为什么这个窗口是只读的？", "read-only-window"],
  ["我现在用的是什么模型？", "model-meter"],
  ["Pages 版和 VPS 版有什么不同？", "deployment-targets"],
  ["我还有多少共享 AI 额度？", "shared-ai-allowance"],
  ["为什么搜索功能不能用？", "ai-troubleshooting"],
  ["给我快速介绍一下这个系统。", "quick-tour"],
  ["怎么添加到 iPhone 主屏幕？", "install-web-app"],
  ["What is Review Desk for?", "review-desk"],
  ["Where are my files saved?", "on-device-storage"],
  ["How do I switch to Liquid Glass?", "liquid-glass-appearance"],
  ["How do I put this into TeachText?", "teachtext"],
];

for (const [query, expectedId] of queryMatrix) {
  const result = runtime.resolveProductHelpRoute(query, entries);
  test.assert(result.route === "product-help", `${query} routes to local product help`);
  test.assert(result.topics[0]?.id === expectedId, `${query} ranks ${expectedId} first`);
  test.assert(result.topics.length >= 2 && result.topics.length <= 5, `${query} retrieves two to five bounded topics`);
  const repeated = runtime.resolveProductHelpRoute(query, entries);
  test.assert(
    JSON.stringify(repeated.topics.map((topic) => topic.id)) === JSON.stringify(result.topics.map((topic) => topic.id)),
    `${query} has deterministic topic ordering`
  );
}

for (const query of [
  "Tell me about Windows Vista history",
  "Scrapbook history in classic Mac OS",
  "Draft an outline for my iPad article",
]) {
  const result = runtime.resolveProductHelpRoute(query, entries);
  test.assert(result.route === "chat" && result.topics.length === 0, `${query} stays ordinary chat instead of becoming an FAQ`);
}

for (const query of [
  "Use web search to research Windows Vista",
  "请上网查一下初代 iPad 的发布时间",
]) {
  const result = runtime.resolveProductHelpRoute(query, entries);
  test.assert(result.route === "web" && result.topics.length === 0, `${query} preserves an explicit Web request`);
}

const forcedWeb = runtime.resolveProductHelpRoute("Scrapbook 是干嘛的？", entries, { explicitWeb: true });
test.assert(forcedWeb.route === "web", "the caller's explicit per-message Web choice wins over local help routing");
test.assert(runtime.resolveProductHelpRoute("", entries).route === "chat", "an empty query does not manufacture product help");
test.assert(Object.isFrozen(runtime), "the pure runtime exports an immutable API surface");

test.finish();
