// DOM-layer streaming benchmark: the string half of the streaming render is
// near-linear (tooling/bench-streaming-render.mjs); this measures the OTHER
// half a writer's frame actually pays — innerHTML subtree replacement plus
// the forced layout of scrolling to the latest message — in a real Chromium,
// on the real app page, at growing reply lengths.
//
// run: node tooling/bench-streaming-dom.mjs   (spawns its own static server)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const desktopRoot = path.join(repoRoot, "apps", "desktop");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://static.local");
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end('{"error":"not found"}');
    return;
  }
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const target = path.normalize(path.join(desktopRoot, pathname));
  if (!target.startsWith(desktopRoot) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404); res.end("not found"); return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(target)] || "application/octet-stream" });
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/index.html`;

const paragraphs = [];
for (let i = 1; i <= 120; i++) {
  paragraphs.push(`## Section ${i}\n\nA paragraph with **bold**, *italic* and \`inline code\`, plus a [link](https://example.com/${i}).\n\n- item one of section ${i}\n- item two of section ${i}\n- item three of section ${i}\n`);
}
const full = paragraphs.join("\n");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(baseUrl, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.renderStreamingMarkdownHtml === "function", null, { timeout: 30000 })
  .catch(async () => {
    // The function lives in the lazy chat module; pull it in through the
    // admitted loader if the boot did not.
    await page.evaluate(async () => {
      if (typeof ensureClioTalkShellModule === "function") await ensureClioTalkShellModule();
    });
  });

// The app bundle is one esbuild IIFE: its top-level functions are scoped
// inside and never reach window. Inject the three real source files (strings
// -> markdown -> streaming-markdown) as classic scripts instead — the same
// functions, now reachable — and render into a scratch host on the real page.
for (const file of ["app/core/strings.js", "app/core/markdown.js", "app/core/streaming-markdown.js"]) {
  const source = fs.readFileSync(path.join(repoRoot, "apps/desktop", file), "utf8");
  await page.addScriptTag({ content: source });
}
await page.waitForFunction(() => typeof window.renderStreamingMarkdownHtml === "function", null, { timeout: 30000 });

const sizes = [731, 2962, 11986, 22619];
const results = [];
for (const size of sizes) {
  const text = full.slice(0, size);
  // Two warmed ticks, then 10 measured ticks: render + subtree replace +
  // scroll-to-latest (the exact sequence updatePendingStreamContent runs).
  const medians = await page.evaluate(async (textContent) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:640px;height:480px;overflow:auto;visibility:hidden;";
    host.innerHTML = '<div class="message assistant pending streaming"><span class="speaker"></span><div class="message-content"></div></div>';
    document.body.append(host);
    const body = host.querySelector(".message-content");
    const tick = () => {
      const t0 = performance.now();
      body.innerHTML = window.renderStreamingMarkdownHtml(textContent);
      host.scrollTop = host.scrollHeight; // the forced layout the real path pays
      return performance.now() - t0;
    };
    tick(); tick();
    const samples = [];
    for (let i = 0; i < 10; i++) samples.push(tick());
    host.remove();
    samples.sort((a, b) => a - b);
    return samples[5];
  }, text);
  results.push({ size, median: medians });
  console.log(`reply ${String(size).padStart(6)} bytes: DOM tick median ${medians.toFixed(2)} ms`);
}
const growth = (results[results.length - 1].median / Math.max(results[0].median, 0.001)) / (results[results.length - 1].size / results[0].size);
console.log(`DOM growth vs linear (31x size): x${growth.toFixed(2)} — 1.0 = linear, ~31 = O(n²)`);
await browser.close();
server.close();
