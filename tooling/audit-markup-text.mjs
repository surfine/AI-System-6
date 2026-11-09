#!/usr/bin/env node
// Markup printed as text: boots the built desk, opens every registered window
// in each appearance and viewport, and lists text nodes that carry HTML tags,
// double-escaped entities or "[object Object]".
//
// This is the runtime half of the html`` call-site guard in
// tests/features/html-template.test.mjs. The contract reads the source and
// catches markup that reaches a template without html.raw by any route it can
// see (a helper, a local, a nested template); this instrument catches what
// arrives some other way - a parameter, an object property - on the surfaces
// the window walk renders. It found ~45 such sites on 2026-11-06 after the
// tagged-template conversion. An on-demand instrument, not a per-change gate:
// about two minutes per appearance and viewport.
//
// Usage:
//   npm run audit:markup-text                      # build, classic + liquid-glass, desktop + phone
//   node tooling/audit-markup-text.mjs --themes aqua,platinum --viewport 1440x960
//   options: --themes a,b  --viewport WxH (repeatable via comma)  --url <served app>

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bootThemedPage, launchChromium, openEveryWindow, parseViewport, revealAndSettle } from "./lib/cascade-page.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const themes = option("--themes", "classic,liquid-glass").split(",").filter(Boolean);
const viewports = option("--viewport", "1440x960,390x844").split(",").filter(Boolean).map(parseViewport);

const MARKUP_TEXT = /<\/?(?:span|svg|div|button|p|b|small|image|g|article|a|bdi|section|option|figure|details|li|ul)[\s>]|&amp;(?:amp|lt|gt|quot|#39);|\[object Object\]/;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, [join(root, "apps/server/server.js")], {
    cwd: root, env: { ...process.env, PORT: String(port) }, stdio: "ignore",
  });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return { url, child };
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`app server did not start on ${url}`);
}

const served = option("--url", "") ? { url: option("--url", ""), child: null } : await startServer();
const browser = await launchChromium();
let total = 0;
try {
  for (const theme of themes) {
    for (const viewport of viewports) {
      const { context, page } = await bootThemedPage(browser, served.url, theme, viewport);
      const { opened } = await openEveryWindow(page);
      await revealAndSettle(page, opened);
      const hits = await page.evaluate((source) => {
        const pattern = new RegExp(source);
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const found = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!pattern.test(node.nodeValue)) continue;
          const element = node.parentElement;
          if (element.closest("textarea, script, style, code, pre, .cm-editor")) continue;
          const windowName = element.closest("[data-window]")?.dataset.window || "-";
          found.push(`${windowName} :: ${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]} :: ${node.nodeValue.trim().slice(0, 80)}`);
        }
        return found;
      }, MARKUP_TEXT.source);
      total += hits.length;
      console.log(`${theme}@${viewport.width}x${viewport.height}: ${opened.length} windows, ${hits.length} text node(s) carrying markup`);
      for (const hit of hits.slice(0, 20)) console.log(`  ${hit}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  served.child?.kill();
}
console.log(total ? `\n${total} text node(s) carry markup - find the template that hands it over without html.raw.` : "\nNo text node carries markup.");
process.exit(total ? 1 : 0);
