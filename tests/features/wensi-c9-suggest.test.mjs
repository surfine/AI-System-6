// Held field suggestions and the app-scope corpus door.
// Suggesting returns fields and writes no file. A missing rag pack is
// corpus_not_configured, not an empty search.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c9-suggest");
const suggestions = require("../../apps/server/server/lib/blog-sites/field-suggestions.js");
const blog = require("../../apps/server/server/routes/aaron-blog.js");

const categories = [{ slug: "notice", name: "公告" }, { slug: "app", name: "应用" }];

const english = suggestions.suggestFields({
  title: "Open Live Writer",
  tags: ["microsoft"],
  series: "手记",
}, categories);
test.assert(english.slug === "open-live-writer" && english.category === "notice" && english.series === "手记"
  && english.tags.join("|") === "microsoft" && english.held === true,
  "a latin title becomes the slug, and the suggestion stays held");

const named = suggestions.suggestFields({ title: "公告", slug: "already-set", filename: "ignored.md" }, categories);
test.assert(named.slug === "already-set", "an existing slug is kept");

const fromFile = suggestions.suggestFields({ title: "公告", filename: "2026-11-09-a-note.md", cats: ["app"] }, categories);
test.assert(fromFile.slug === "a-note" && fromFile.category === "app",
  "a Chinese title falls back to the filename stem, and a known category wins");

function capture() {
  return {
    statusCode: 0,
    body: "",
    writeHead(status) { this.statusCode = status; },
    end(body) { this.body = String(body || ""); },
    get destroyed() { return false; },
    get writableEnded() { return false; },
  };
}

const scratch = mkdtempSync(join(tmpdir(), "wensi-suggest-"));
const missing = join(scratch, "missing.json");
process.env.AI_SYSTEM6_APPSCOPE_RAG = missing;
const absent = capture();
await blog.handleAaronBlog({ method: "GET", url: "/api/aaron-blog/retrieve?corpus=appscope&q=writer", headers: { host: "127.0.0.1" } }, absent);
const absentBody = JSON.parse(absent.body);
test.assert(absent.statusCode === 400 && absentBody.error === "corpus_not_configured",
  "a missing app-scope pack says corpus_not_configured");

const pack = {
  schema: 1,
  kind: "appscope-rag",
  chunking: "paragraph",
  generatedAt: "2026-11-09T00:00:00.000Z",
  docs: [{ id: "open-live-writer", t: "Open Live Writer", u: "https://www.app-scope.com/app/open-live-writer.html" }],
  chunks: [{ d: 0, x: "Windows Live Writer 开放源代码之后改名 Open Live Writer。" }],
};
const present = join(scratch, "rag.json");
writeFileSync(present, JSON.stringify(pack));
process.env.AI_SYSTEM6_APPSCOPE_RAG = present;
const found = capture();
await blog.handleAaronBlog({ method: "GET", url: "/api/aaron-blog/retrieve?corpus=appscope&q=Writer", headers: { host: "127.0.0.1" } }, found);
const foundBody = JSON.parse(found.body);
test.assert(found.statusCode === 200 && foundBody.results?.length >= 1,
  "a present app-scope pack answers a search");

delete process.env.AI_SYSTEM6_APPSCOPE_RAG;
rmSync(scratch, { recursive: true, force: true });
test.finish();
