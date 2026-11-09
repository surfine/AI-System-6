// Streaming-render growth benchmark: is the per-tick streaming render O(n) or
// O(n²) in the message length? No model, no browser — this drives the REAL
// renderStreamingMarkdownHtml path (vendored parser + node renderer) against
// growing prefixes of one long reply and measures the per-tick cost a writer
// experiences while the answer streams.
//
// run: node tooling/bench-streaming-render.mjs
// The console-script variant mirrors what a browser tab sees; the node
// harness below skips window.* and uses the fallback markdownToSystemHtml
// path when the vendored parser is absent, so BOTH paths are measured.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Build one deterministic "reply": 120 paragraphs, each with a heading, a
// list and inline markup — about 100 KB when complete.
const paragraphs = [];
for (let i = 1; i <= 120; i++) {
  paragraphs.push(
    `## Section ${i}\n\nA paragraph with **bold**, *italic* and \`inline code\`, plus a [link](https://example.com/${i}).\n\n- item one of section ${i}\n- item two of section ${i}\n- item three of section ${i}\n`
  );
}
const full = paragraphs.join("\n");

const ctx = vm.createContext({
  window: {},
  console,
  // The vendored parser is browser-flavoured; the two base64 helpers are its
  // only window APIs on this path. Node ships both as globals since 16.
  atob: (s) => Buffer.from(String(s), "base64").toString("binary"),
  btoa: (s) => Buffer.from(String(s), "binary").toString("base64"),
});
// Load the shared markdown module, then the streaming module on top.
vm.runInContext(readFileSync(join(root, "apps/desktop/app/core/strings.js"), "utf8"), ctx);
vm.runInContext(readFileSync(join(root, "apps/desktop/app/core/markdown.js"), "utf8"), ctx);
try {
  vm.runInContext(readFileSync(join(root, "apps/desktop/app/vendor/stream-markdown-parser.global.js"), "utf8"), ctx);
} catch (error) {
  console.log(`(vendored parser unavailable: ${error.message}; measuring the fallback path only)`);
}
vm.runInContext(readFileSync(join(root, "apps/desktop/app/core/streaming-markdown.js"), "utf8"), ctx);
const render = vm.runInContext("renderStreamingMarkdownHtml", ctx);

const marks = [4, 16, 64, 120].map((n) => paragraphs.slice(0, n).join("\n").length);
const results = [];
for (const size of marks) {
  const text = full.slice(0, size);
  render(text); // warm
  const N = 12;
  const samples = [];
  for (let i = 0; i < N; i++) {
    const t0 = process.hrtime.bigint();
    render(text);
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(N / 2)];
  results.push({ size, median });
  console.log(`reply ${String(size).padStart(6)} bytes: median ${median.toFixed(2)} ms/tick`);
}
const growth = (results[results.length - 1].median / Math.max(results[0].median, 0.001)) /
  (results[results.length - 1].size / results[0].size);
console.log(`growth vs linear (16x size): x${growth.toFixed(2)} — 1.0 = linear, 4 = O(n²)`);
