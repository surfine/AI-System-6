// DeepSeek Tools API search (optional backend): the request shape, the count
// and query bounds, the result mapping, and the opt-in switch. The backend is
// off by default and BYOK-only because the API bills per successful request.

import assert from "node:assert/strict";
import vm from "node:vm";
import { createFeatureTest, parseJsSource, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("deepseek-tools-search");

function functions(source, names) {
  const nodes = parseJsSource(source).body.filter((node) => node.type === "FunctionDeclaration");
  return names.map((name) => {
    const node = nodes.find((item) => item.id.name === name);
    assert.ok(node, name);
    return source.slice(node.start, node.end);
  }).join("\n");
}

const calls = [];
const context = vm.createContext({
  console,
  process: { env: {} },
  DEEPSEEK_PUBLIC_BASE_URL: "https://api.deepseek.com",
  resolveCloudTarget: async () => ({ address: "203.0.113.9", family: 4 }),
  cloudAuthHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
  cloudUpstreamWarning: () => "",
  siteFromUrl: (url) => new URL(url).hostname,
  postJsonWithFallback: async (url, payload, signal, headers, options) => {
    calls.push({ url, payload, headers, options });
    return {
      response: Response.json({
        results: [
          {
            title: "A result",
            url: "https://example.com/a",
            snippet: "snippet text",
            summary: "summary text",
            date: "2026-10-01",
            site_name: "Example",
            authority: 3,
            rerank_score: 2.5,
          },
          { title: "No url", url: null },
        ],
      }),
    };
  },
});
vm.runInContext(
  functions(read("apps/server/server/web-search.js"), [
    "webSearchUpstreamError",
    "callDeepseekToolsSearch",
    "deepseekToolsEnabled",
  ]),
  context
);

test.assert(context.deepseekToolsEnabled() === false, "the Tools backend is off unless the deployment opts in");
context.process.env.AI_SYSTEM6_DEEPSEEK_TOOLS = "1";
test.assert(context.deepseekToolsEnabled() === true, "AI_SYSTEM6_DEEPSEEK_TOOLS=1 turns it on");

const result = await context.callDeepseekToolsSearch({ apiKey: "k", query: "苹果 发布会", count: 200 });
test.assert(calls.length === 1 && calls[0].url === "https://api.deepseek.com/v1/tools/search",
  "the request goes to the documented Tools search endpoint");
test.assert(calls[0].payload.query === "苹果 发布会" && calls[0].payload.count === 50,
  "the query travels and count is clamped to the documented maximum of 50");
test.assert(calls[0].headers.Authorization === "Bearer k", "the BYOK key is the bearer token");
test.assert(result.provider === "deepseek-tools" && result.results.length === 1,
  "only results with a URL are kept");
test.assert(result.results[0].siteName === "Example" && result.results[0].score === 2.5 && result.results[0].authority === 3,
  "site, rank score and authority map onto the desk's fields");
test.assert(/1,000 successful requests/.test(result.billing), "the per-call billing is stated with the result");

calls.length = 0;
const small = await context.callDeepseekToolsSearch({ apiKey: "k", query: "q", count: 0 });
test.assert(small.count === 1 && calls[0].payload.count === 1, "count is clamped up to 1");

await assert.rejects(
  () => context.callDeepseekToolsSearch({ apiKey: "k", query: "字".repeat(129) }),
  (error) => error.code === "query_too_long" && error.statusCode === 400,
  "a query over 128 characters is refused before it leaves the machine"
);
await assert.rejects(
  () => context.callDeepseekToolsSearch({ apiKey: "k", query: "   " }),
  (error) => error.code === "missing_query",
  "an empty query is refused"
);

test.finish();
