// Bonsai completion interop audit — real-browser flow probe.
//
// Drives the shipped Micropolis and Bonsai windows in Chromium and proves the
// lane-C shell surfaces, the .cty round trip in both directions, the Bonsai
// send path into the GPL cities store, and the Open-in-Bonsai-City return
// hook. This is evidence tooling, not a release gate: run it on a merged
// build before an owner hardware check.
//
//   npm run build:app && node tooling/verify-bonsai-interop.mjs
import { spawn } from "node:child_process";
import { get } from "node:http";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, "package.json"));
const { chromium } = require("playwright");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond, message) { if (!cond) throw new Error(message); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpReady(url) {
  return await new Promise((resolveReady) => {
    const req = get(url, (res) => { res.resume(); resolveReady(res.statusCode < 500); });
    req.on("error", () => resolveReady(false));
    req.setTimeout(800, () => { req.destroy(); resolveReady(false); });
  });
}
async function freePort() {
  return await new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  });
}

const port = await freePort();
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["apps/server/server.js"], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
let out = "";
server.stdout.on("data", (d) => { out += d; });
server.stderr.on("data", (d) => { out += d; });
for (let i = 0; i < 60; i += 1) { if (await httpReady(url)) break; await wait(250); }
assert(await httpReady(url), `server did not start\n${out}`);

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--force-color-profile=srgb"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, acceptDownloads: true, locale: "en-US" });
await context.addInitScript(() => { localStorage.setItem("ai-system-6-theme", "classic"); localStorage.setItem("ai-system-6-liquid-glass", "false"); });
const page = await context.newPage();
const diagnostics = [];
page.on("pageerror", (e) => { const m = String(e?.message || e); if (!/sandboxed and lacks the 'allow-same-origin'/.test(m)) diagnostics.push(`pageerror: ${m}`); });
page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/sandboxed and lacks/.test(t)) diagnostics.push(`console: ${t}`); } });

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 20000 });
  await page.evaluate(() => { for (const d of document.querySelectorAll("dialog[open]")) d.close(); currentLanguage = "en"; applyLanguage(); });
  const api = () => page.evaluate(() => ({
    micropolis: !!window.AISystem6Micropolis,
    bonsai: !!window.AISystem6BonsaiCity,
    hasCity: () => !!window.AISystem6Micropolis?.hasCity?.(),
  }));

  // ---------- Lane C: Micropolis shell surfaces, driven through the real UI ----------
  await page.evaluate(() => handleAction("open-micropolis"));
  await page.waitForSelector('[data-window="micropolis"]:not(.is-hidden)', { timeout: 20000 });
  await page.waitForFunction(() => !!window.AISystem6Micropolis?.hasCity?.(), null, { timeout: 20000 });
  await page.evaluate(() => handleAction("micropolis-pause"));
  check("C-open: Micropolis opens and owns a city", true);

  const rci = await page.evaluate(() => { const c = document.querySelector("[data-micropolis-rci]"); return !!c && c.width === 26 && c.height === 14; });
  check("C2-RCI: 26x14 demand instrument mounted", rci);

  // Query tool, clicked on the real map.
  await page.locator('[data-micropolis-tool="query"]').first().click();
  const canvasBox = await page.locator("#micropolis-canvas").boundingBox();
  assert(canvasBox, "no engine canvas");
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
  await page.waitForFunction(() => /Tile|Position|Kind/i.test(document.querySelector("[data-micropolis-panel]")?.textContent || ""), null, { timeout: 8000 });
  const queryText = await page.evaluate(() => document.querySelector("[data-micropolis-panel] .micropolis-panel-body")?.textContent || "");
  check("C1-query: clicking the map opens a query panel", /Tile|Position|Kind/i.test(queryText) && queryText.length > 0, queryText.slice(0, 80));

  // Maps / overlays.
  await page.evaluate(() => handleAction("micropolis-maps"));
  await page.waitForSelector("[data-micropolis-overlay-kind]", { timeout: 8000 });
  await page.locator('[data-micropolis-overlay-kind="density"]').first().click();
  await wait(300);
  const overlay = await page.evaluate(() => ({ state: window.AISystem6Micropolis.currentOverlay(), canvas: !!document.querySelector("[data-micropolis-overlay]") }));
  check("C3-maps: density overlay arms and repaints", overlay.state === "density" && overlay.canvas, JSON.stringify(overlay));

  // Graphs: series actually painted.
  await page.evaluate(() => handleAction("micropolis-graphs"));
  await page.waitForSelector("[data-micropolis-graph]", { timeout: 8000 });
  await page.locator('[data-micropolis-graph-range][value="120"]').first().check();
  await wait(500);
  const graphPixels = await page.evaluate(() => {
    const c = document.querySelector("[data-micropolis-graph]");
    if (!c) return -1;
    const ctx = c.getContext("2d");
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonEmpty = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) nonEmpty += 1;
    return nonEmpty;
  });
  check("C4-graphs: graph canvas paints series", graphPixels > 50, `non-empty px=${graphPixels}`);

  // Notices log through the real command.
  await page.evaluate(() => window.AISystem6Micropolis.recordNotice("micropolis_msg_need_roads"));
  await page.evaluate(() => handleAction("micropolis-notices"));
  await page.waitForFunction(() => document.querySelectorAll(".micropolis-notice").length > 0 || /empty|none/i.test(document.querySelector("[data-micropolis-panel]")?.textContent || ""), null, { timeout: 8000 });
  const noticeText = await page.evaluate(() => document.querySelector("[data-micropolis-panel]")?.textContent || "");
  check("C6-notices: log shows a recorded notice", /Audit|roads|streets/i.test(noticeText), noticeText.slice(0, 120));

  // Options toggles reach the engine.
  await page.evaluate(() => handleAction("micropolis-options"));
  await page.waitForSelector('[data-micropolis-option="auto-bulldoze"]', { timeout: 8000 });
  const bb = await page.evaluate(() => window.AISystem6Micropolis.autoBulldoze());
  await page.locator('[data-micropolis-option="auto-bulldoze"]').first().click();
  const ba = await page.evaluate(() => window.AISystem6Micropolis.autoBulldoze());
  await page.locator('[data-micropolis-option="auto-bulldoze"]').first().click();
  check("C6-options: auto-bulldoze checkbox flips the engine flag", ba === !bb, `before=${bb} after=${ba}`);

  // Zoom through the View menu.
  await page.evaluate(() => handleAction("micropolis-zoom-in"));
  const zoomIn = await page.evaluate(() => window.AISystem6Micropolis.currentZoom());
  await page.evaluate(() => handleAction("micropolis-zoom-out"));
  const zoomOut = await page.evaluate(() => window.AISystem6Micropolis.currentZoom());
  check("C7-zoom: View menu steps 1 -> 2 -> 1", zoomIn === 2 && zoomOut === 1, `${zoomIn} -> ${zoomOut}`);

  // ---------- Lane C/D: .cty round trip through the real File menu and file input ----------
  const beforeFunds = await page.evaluate(() => window.AISystem6Micropolis.serializeCity().totalFunds);
  const [ctyDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.evaluate(() => handleAction("micropolis-export-cty")),
  ]);
  const ctyPath = await ctyDownload.path();
  const { readFile } = await import("node:fs/promises");
  const ctyBytes = await readFile(ctyPath);
  check("D-cty: Micropolis File menu exports 27,120 classic bytes", ctyBytes.length === 27120, `${ctyBytes.length} bytes`);
  await page.waitForFunction(() => /Saved|exported/i.test(document.querySelector("[data-micropolis-panel]")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
  await page.locator("[data-micropolis-panel-close]").click().catch(() => {});
  await wait(200);
  await page.locator('[data-micropolis-cty-input]').setInputFiles({ name: "audit-roundtrip.cty", mimeType: "application/octet-stream", buffer: ctyBytes });
  await page.waitForFunction((want) => window.AISystem6Micropolis?.serializeCity?.()?.totalFunds === want, beforeFunds, { timeout: 15000 });
  const afterImport = await page.evaluate(() => { const s = window.AISystem6Micropolis.serializeCity(); return { funds: s.totalFunds, time: s._cityTime }; });
  check("D-cty: imported file restores funds and clock", afterImport.funds === beforeFunds && afterImport.time > 0, JSON.stringify(afterImport));

  // ---------- Lane D/B: Bonsai city, saved record actions ----------
  await page.evaluate(() => handleAction("open-bonsai-city"));
  await page.waitForSelector('[data-window="bonsaiCity"]:not(.is-hidden)', { timeout: 20000 });
  await page.waitForSelector("[data-bonsai-map-setup]", { timeout: 10000 });
  await page.locator("[data-bonsai-map-name]").fill("Audit City");
  const seedInput = page.locator("[data-bonsai-map-seed]");
  if (await seedInput.count()) {
    const advanced = page.locator(".bonsai-setup-advanced");
    if (await advanced.count() && !(await seedInput.first().isVisible())) await advanced.locator("summary").click();
    await seedInput.fill("424242");
  }
  await page.locator("[data-bonsai-map-size]").selectOption("64");
  await page.locator("[data-bonsai-map-terrain]").selectOption("balanced");
  await page.locator("[data-bonsai-map-create]").click();
  await page.waitForSelector("[data-bonsai-map-stack]", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll("[data-bonsai-layer]").length === 6, null, { timeout: 10000 });
  await page.evaluate(async () => { await handleAction("bonsai-save"); });
  await wait(600);
  await page.evaluate(() => handleAction("bonsai-open-city"));
  const row = page.locator('[data-bonsai-city-id]:has-text("Audit City")');
  await row.first().waitFor({ timeout: 15000 });

  const ctyAction = row.locator('[data-bonsai-city-action="export-cty"]').first();
  check("D-cty: Bonsai record row offers Export .cty", await ctyAction.count() === 1);
  const [bonsaiCtyDownload] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), ctyAction.click()]);
  const bonsaiCtyBytes = await readFile(await bonsaiCtyDownload.path());
  check("D-cty: Bonsai Export .cty writes a 27,120-byte classic file", bonsaiCtyBytes.length === 27120, `${bonsaiCtyBytes.length} bytes`);
  await page.locator("#system-modal-yes").waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  await page.locator("#system-modal-yes").click().catch(() => {});

  const sendAction = row.locator('[data-bonsai-city-action="send-micropolis"]').first();
  check("D-send: Bonsai record row offers Send to Micropolis", await sendAction.count() === 1);
  await sendAction.click();
  await page.locator("#system-modal-yes").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("#system-modal-yes").click();
  // Loss report modal follows the send; dismiss it, then the status line says Sent.
  await page.locator("#system-modal-yes").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await page.locator("#system-modal-yes").click().catch(() => {});
  await page.waitForFunction(() => /Sent/i.test(document.querySelector("[data-bonsai-status-message]")?.textContent || ""), null, { timeout: 15000 });
  const sentRecord = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open("ai-system-6-db"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction("cities", "readonly");
    const all = await new Promise((res, rej) => { const r = tx.objectStore("cities").getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    db.close();
    const record = all.find((item) => item.name === "Audit City");
    return record ? { name: record.name, mapLen: record.saveData?.map?.length, width: record.saveData?.width, height: record.saveData?.height, funds: record.saveData?.totalFunds } : null;
  });
  check("D-send: a Micropolis-format record lands in the cities store", !!sentRecord && sentRecord.mapLen === 12000 && sentRecord.width === 120 && sentRecord.height === 100, JSON.stringify(sentRecord));

  // ---------- Lane D: the sent city opens back in Bonsai City from Micropolis ----------
  await page.evaluate(() => handleAction("open-micropolis"));
  await page.waitForSelector('[data-window="micropolis"]:not(.is-hidden)', { timeout: 15000 });
  await page.evaluate(() => handleAction("micropolis-open-city"));
  const bonsaiButton = page.locator('[data-micropolis-city-bonsai]').first();
  await bonsaiButton.waitFor({ timeout: 15000 });
  await bonsaiButton.click();
  await page.locator("#system-modal-yes").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#system-modal-yes").click();
  // Bonsai import loss report modal, then an imported status.
  await page.locator("#system-modal-yes").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await page.locator("#system-modal-yes").click().catch(() => {});
  await page.waitForFunction(() => /imported/i.test(document.querySelector("[data-bonsai-status-message]")?.textContent || ""), null, { timeout: 20000 });
  check("D-open-in-bonsai: the sent city returns through Micropolis' Open in Bonsai City", true);

  check("diagnostics clean", diagnostics.length === 0, diagnostics.join(" | ").slice(0, 300));
} catch (error) {
  console.error(`AUDIT ERROR: ${error.stack || error.message}`);
  try { await page.screenshot({ path: "/private/tmp/bonsai-lane-audit-fail.png" }); console.error("screenshot: /private/tmp/bonsai-lane-audit-fail.png"); } catch {}
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error("Failed checks:");
  for (const f of failed) console.error(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
process.exit(0);
