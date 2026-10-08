// Reader extraction success rate: the embedded-data ladder (JSON-LD, Next.js /
// Nuxt hydration payloads, window state, <noscript>) and the AMP link. The
// Node reader and the Cloudflare Pages copy must pick the same winner and
// produce text of the same length; the fixtures are the evidence.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("reader-extraction");
const require = createRequire(import.meta.url);
const nodeReader = require("../../apps/server/server/reader.js");
const pagesReader = await import("../../functions/_lib/reader.mjs");

const url = "https://example.com/article";
const fixture = (name) => readFileSync(join(root, "tests/fixtures/reader", name), "utf8");
const within5 = (a, b) => Math.abs(a - b) / Math.max(a, b, 1) <= 0.05;

/**
 * Run both readers on one fixture and assert the winner and text parity.
 *
 * @param {string} name
 * @param {string} path expected extractionPath
 * @returns {Promise<{ node: any, pages: any }>}
 */
async function both(name, path) {
  const html = fixture(name);
  const a = await nodeReader.cleanHtmlForReader(html, url);
  const b = await pagesReader.cleanHtmlForReader(html, url);
  test.assert(a.extractionPath === path, `${name}: Node picks ${path}`);
  test.assert(b.extractionPath === path, `${name}: Pages picks ${path}`);
  test.assert(
    within5(a.text.length, b.text.length),
    `${name}: Node and Pages text lengths match within 5% (${a.text.length} vs ${b.text.length})`
  );
  return { node: a, pages: b };
}

// Next.js shell: the markup is empty and the article lives in __NEXT_DATA__.
{
  const { node } = await both("next-data.html", "next-data");
  test.assert(node.text.includes("内嵌数据的第一段正文在此"), "next-data: first paragraph survives");
  test.assert(node.text.includes("内嵌数据的第二段正文在此"), "next-data: second paragraph survives");
  test.assert(node.title === "内嵌数据标题", "next-data: sibling title is carried");
}

// JSON-LD @graph: the page body is only a nav, the body is in articleBody.
{
  const { node } = await both("json-ld-graph.html", "json-ld");
  test.assert(node.text.includes("结构化数据的正文第一段"), "json-ld: first paragraph survives");
  test.assert(node.text.includes("结构化数据的正文第二段"), "json-ld: second paragraph is a separate block");
  test.assert(node.date === "2026-10-08", "json-ld: datePublished is carried");
}

// <noscript>: the only copy of the article on a JavaScript shell.
{
  const { node } = await both("noscript.html", "noscript");
  test.assert(node.text.includes("无脚本正文的第一段"), "noscript: first paragraph survives");
  test.assert(node.text.includes("无脚本正文的第二段"), "noscript: second paragraph survives");
}

// window.__INITIAL_STATE__: braces inside strings must not truncate the object.
{
  const { node } = await both("initial-state.html", "initial-state");
  test.assert(node.text.includes("初始状态的正文第一段"), "initial-state: first paragraph survives");
  test.assert(node.text.includes("初始状态的正文第二段"), "initial-state: second paragraph survives");
  test.assert(node.title === "初始状态的标题", "initial-state: sibling title is carried");
}

// A short structured summary must not beat a longer extracted body. The
// embedded candidate is valid on its own, so this proves the longest-wins
// rule rather than a fallback.
{
  const html = fixture("long-article.html");
  const { node } = await both("long-article.html", "article-extractor");
  test.assert(node.text.includes("extractor body outruns the structured summary"), "long-article: extractor body wins");
  test.assert(!node.text.includes("short structured summary deliberately shorter"), "long-article: the short structured body does not override");
  const embedded = nodeReader.readerEmbeddedArticle(html, url);
  test.assert(embedded && embedded.source === "json-ld", "long-article: a JSON-LD candidate exists");
  test.assert(nodeReader.validReaderText(embedded.markdown), "long-article: the JSON-LD candidate is valid but shorter");
  test.assert(
    embedded.markdown.length < node.text.length,
    "long-article: the extractor body is the longer valid candidate"
  );
}

// The AMP twin is advertised, not followed; the route uses the URL later.
{
  const amp = fixture("amp.html");
  const expected = "https://example.com/amp/story";
  test.assert(nodeReader.readerAmpUrl(amp, url) === expected, "amp: Node reads the absolute amphtml link");
  test.assert(pagesReader.readerAmpUrl(amp, url) === expected, "amp: Pages reads the absolute amphtml link");
  test.assert(
    nodeReader.readerAmpUrl('<link rel="amphtml" href="/amp/x">', "https://example.com/a") === "https://example.com/amp/x",
    "amp: a relative href is resolved against the page URL"
  );
  test.assert(nodeReader.readerAmpUrl("<html></html>", url) === null, "amp: no link yields null");
  test.assert(
    nodeReader.readerAmpUrl('<link rel="amphtml" href="http://example.com/x">', url) === null,
    "amp: a non-https link yields null"
  );
}

// A bare JavaScript shell must keep failing, in both readers.
{
  const html = fixture("js-shell.html");
  let nodeThrew = false;
  let pagesThrew = false;
  try { await nodeReader.cleanHtmlForReader(html, url); } catch { nodeThrew = true; }
  try { await pagesReader.cleanHtmlForReader(html, url); } catch { pagesThrew = true; }
  test.assert(nodeThrew, "js-shell: Node refuses an empty JavaScript shell");
  test.assert(pagesThrew, "js-shell: Pages refuses an empty JavaScript shell");
  test.assert(nodeReader.readerEmbeddedArticle(html, url) === null, "js-shell: no embedded candidate is invented");
}


// A Chinese article with no spaces between words. The boilerplate filter
// once compared blocks by their ASCII letters only, so every Chinese
// paragraph compared as empty and was thrown away.
{
  const zh = readFileSync(join(root, "tests/fixtures/reader/zh-article.html"), "utf8");
  const nodeArticle = await nodeReader.cleanHtmlForReader(zh, "https://example.com/zh");
  test.assert(nodeArticle.text.includes("河边的柳树已经冒出新芽"), "zh-article: Node keeps a Chinese paragraph");
  test.assert(!nodeArticle.text.includes("登录"), "zh-article: Node still drops the navigation");
  const pagesArticle = await pagesReader.cleanHtmlForReader(zh, "https://example.com/zh");
  test.assert(pagesArticle.text.includes("河边的柳树已经冒出新芽"), "zh-article: Pages keeps a Chinese paragraph");
}

test.finish();
