// Searcher's streamed online answer must arrive event by event.
//
// The cloud transport pins the resolved upstream address, and address pinning
// forces the node transport. The buffered node POST reads the whole response
// before it resolves and hands back no `body`, so every streamed web search
// died with "Web search stream returned no body" while the non-streaming call
// stayed green. This test holds the contract: the upstream keeps the response
// open until the client reports the first delta, so a buffered transport can
// never pass.

import { createPrivateKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`OK  web-search-stream-transport: ${message}`);
}

const [encodedKey, cert] = await Promise.all([
  readFile(path.join(root, "tests/fixtures/cloud-upstream-key.fixture")),
  readFile(path.join(root, "tests/fixtures/cloud-upstream-cert.fixture")),
]);
const key = createPrivateKey({
  key: Buffer.from(encodedKey.toString("ascii").trim(), "base64"),
  format: "der",
  type: "pkcs8",
}).export({ format: "pem", type: "pkcs8" });

/** Resolves when the client reports the first streamed delta. */
let reportFirstDelta = () => {};
const firstDelta = new Promise((resolve) => { reportFirstDelta = resolve; });

const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;

const upstream = https.createServer({ key, cert }, (req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (body.stream !== true) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "the streaming client must ask for a stream" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write(sse({ type: "response.web_search_call.in_progress" }));
    res.write(sse({ type: "response.output_text.delta", delta: "上海" }));
    // A buffered transport reports no delta while the response is open. The
    // short grace period lets that case finish so the client raises the real
    // production error ("Web search stream returned no body") instead of
    // hanging until the timeout below.
    await Promise.race([firstDelta, new Promise((resolve) => { setTimeout(resolve, 1000).unref(); })]);
    res.write(sse({
      type: "response.completed",
      response: {
        status: "completed",
        usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 },
        output: [
          {
            type: "web_search_call",
            action: { type: "search", query: "上海天气" },
            results: [{ title: "天气", url: "https://example.com/weather" }],
          },
          {
            type: "message",
            content: [{
              type: "output_text",
              text: "上海今天多云。",
              annotations: [{
                type: "url_citation",
                url: "https://example.com/weather",
                title: "天气",
              }],
            }],
          },
        ],
      },
    }));
    res.end();
  });
});

// Dual stack: the client pins whichever address `localhost` resolves to
// first, and that is ::1 on some machines and 127.0.0.1 on others.
await new Promise((resolve) => upstream.listen({ port: 0, host: "::", ipv6Only: false }, resolve));
const { port } = upstream.address();
// A hostname, not the literal address: node refuses an IP as the TLS
// servername, exactly as the buffered transport does in production.
const baseUrl = `https://localhost:${port}`;

// The cloud client reads its endpoint policy at load time, so the environment
// has to be in place before the module is required.
process.env.NODE_ENV = "test";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
process.env.DEEPSEEK_BASE_URL = baseUrl;
process.env.AI_SYSTEM6_TEST_DEEPSEEK_PUBLIC_BASE_URL = baseUrl;
process.env.AI_SYSTEM6_ALLOW_PRIVATE_CLOUD_ENDPOINTS = "1";

const { callWebSearchAnswerStream } = require(path.join(root, "apps/server/server/web-search.js"));

const deltas = [];
let statusEvents = [];
const timeout = new Promise((_resolve, reject) => {
  setTimeout(
    () => reject(new Error("the streamed web search never delivered a delta (buffered transport?)")),
    10000
  ).unref();
});

const result = await Promise.race([
  callWebSearchAnswerStream({
    apiKey: "test-key-never-logged",
    query: "上海天气",
    mode: "answer",
    maxOutputTokens: 200,
    onStatus: (status) => statusEvents.push(status),
    onDelta: (delta) => {
      deltas.push(delta);
      reportFirstDelta();
    },
  }),
  timeout,
]);

assert(deltas.join("") === "上海", "the client receives output_text deltas while the response is open");
assert(statusEvents.includes("searching"), "the client reports the web_search_call status");
assert(result?.answer === "上海今天多云。", "the completed event carries the final answer");
assert(result?.citations?.[0]?.url === "https://example.com/weather", "citations survive the stream");
assert(result?.results?.length === 1, "search results survive the stream");

upstream.close();
console.log("PASS web-search-stream-transport");
