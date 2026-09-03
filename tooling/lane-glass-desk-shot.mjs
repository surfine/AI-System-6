// Lane-local evidence shooter for the window material itself.
//
// The slider shooter crops one control. This one photographs a window
// standing over another window, which is the only place the backdrop blur
// can be judged: a window over an empty desk shows nothing to refract.
// Usage: node tooling/lane-glass-desk-shot.mjs <output.png>

import { chromium } from "playwright";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2];
const server = await startAppServer(root);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: "light" });
await context.route(/https?:\/\/(?:127\.0\.0\.1|localhost):(?:1234|11434)\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{\"models\":[]}" }));
await context.addInitScript(() => { localStorage.setItem("ai-system-6-theme", "liquid-glass"); });
const page = await context.newPage();
await page.goto(server.url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 30000 });
await page.evaluate(() => window.AISystem6Theme?.applyTheme("liquid-glass", { experimental: true, persist: false, announce: false, modernFontPreference: false }));
await page.evaluate(() => { if (typeof openWindow === "function") openWindow("control"); });
await page.waitForTimeout(2500);
await page.screenshot({ path: out });
await browser.close();
await stopProcess(server.child);
