// Render site/og-poster.html to site/img/og-poster.png (1200×630).
// Needs the site dev server: npx http-server or python3 -m http.server in
// site/ — or pass SITE_URL. Default: http://localhost:4181/.

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = (process.env.SITE_URL || "http://localhost:4181/") + "og-poster.html";
const out = path.join(repoRoot, "site", "img", "og-poster.png");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(200);
await page.screenshot({ path: out });
await browser.close();
console.log("og poster →", out);
