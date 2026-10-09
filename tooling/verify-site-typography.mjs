// Browser geometry catches text painting outside a grid column even when
// document.scrollWidth stays unchanged. Run against a locally served site.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const root = fileURLToPath(new URL('../site/', import.meta.url));
const server = process.env.SITE_URL ? null : createServer((req, res) => {
 const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
 const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
 if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
 try {
  const body = readFileSync(file);
  res.setHeader('Content-Type', ({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json','.webp':'image/webp','.woff2':'font/woff2'})[path.extname(file)] || 'application/octet-stream');
  res.end(body);
 } catch { res.writeHead(404).end(); }
});
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.SITE_URL || `http://127.0.0.1:${server.address().port}`;
const out = process.env.TYPOGRAPHY_OUT || path.join(tmpdir(), 'ai-system6-site-typography');
mkdirSync(out, { recursive: true });
let browser;
const results = [];
try {
 browser = await chromium.launch();
 for (const locale of ['zh-CN.html', 'index.html']) {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  if (process.env.TYPOGRAPHY_BASELINE) await page.route('**/desk.css?*', route => route.fulfill({ contentType: 'text/css', body: execFileSync('git', ['show', 'HEAD:site/desk.css'], {encoding:'utf8'}) }));
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(`${base}/${locale}`, { waitUntil: 'networkidle' });
  const moduleURL = await page.evaluate(() => (() => { const src = new URL(document.querySelector('script[type="module"]').src); const url = new URL('./eras.js', src); url.search = src.search; return url.href; })());
  const eras = await page.evaluate(async url => ((m) => [...m.ERAS, ...m.BRANCHES].map(e => e.id))(await import(url)), moduleURL);
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
   await page.setViewportSize({ width, height: 900 });
   for (const era of eras) {
    await page.evaluate(async ({url, era}) => { (await import(url)).setEra(era, true); await document.fonts.ready; }, {url: moduleURL, era});
    const issues = await page.evaluate(() => {
     const errors = [];
     for (const el of document.querySelectorAll('h1,h2,h3,.story-quote,.notes-cover-title')) {
      if (!el.getClientRects().length) continue;
      const bounds = el.getBoundingClientRect();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const lines = new Map();
      while (walker.nextNode()) {
       const node = walker.currentNode;
       for (let i = 0; i < node.length; i++) {
        if (!node.data[i].trim()) continue;
        const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (!r.width) continue;
        if (r.left < bounds.left - 2 || r.right > bounds.right + 2) { errors.push(`overflow: ${el.textContent.trim().slice(0,60)}`); break; }
        const key = Math.round(r.top); lines.set(key, (lines.get(key) || '') + node.data[i]);
       }
      }
      for (const text of lines.values()) {
       if (/^[，。！？；：、）》」』】]/u.test(text) || /[（《「『【]$/u.test(text)) errors.push(`punctuation: ${text}`);
      }
     }
     const icons = [...document.querySelectorAll('#notes-icons img')];
     const rows = new Map();
     for (const icon of icons) { const y = Math.round(icon.getBoundingClientRect().top); rows.set(y, (rows.get(y)||0)+1); }
     if (rows.size > 1 && [...rows.values()].at(-1) === 1) errors.push('orphan cover icon');
     if (document.documentElement.scrollWidth > innerWidth) errors.push('page overflow');
     return [...new Set(errors)];
    });
    results.push({ locale, width, era, issues: [...issues, ...pageErrors] });
    if (locale === 'zh-CN.html' && [390,1280].includes(width) && ['classic','aqua','liquid-glass'].includes(era)) {
     await page.locator('#story').scrollIntoViewIfNeeded();
     await page.locator('#story img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
     await page.evaluate(() => scrollBy(0, -60));
     await page.locator('#story').screenshot({ path: `${out}/${width}-${era}.png` });
    }
   }
  }
  await page.close();
 }
} finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); }
writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter(r => r.issues.length);
console.log(JSON.stringify({ cases: results.length, failures: failed }, null, 2));
if (failed.length) process.exitCode = 1;
