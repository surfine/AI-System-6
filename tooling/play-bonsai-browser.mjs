#!/usr/bin/env node
// Bonsai City real-browser play-through / 盆景城市浏览器实玩.
//
// Spec BONSAI-PLAYABLE §4.5 and §3.11: start a new 128² city through the
// real UI and play it the way a person would — drag a road, place a coal
// plant, run a power line, zone homes, factories and shops, place a water
// tower and a police station, press Play — and record what the player sees:
// how long until the first buildings and residents, whether zoom, rotate,
// centre and minimap jumps keep the city, whether problem flags appear on a
// stranded block, what the advisors and the query balloon say, and whether
// save, reload and reopen bring back the same city. It also measures the
// browser budget: frame rate while panning at fast speed and long tasks,
// with a CPU profile that says which script the long tasks were spent in.
//
// This is an instrument, not a gate: it writes screenshots and metrics.json
// per scenario under --output (default dist/bonsai-play/) and prints OK/NO
// lines; exit 1 only when the play itself could not be carried out.
//
// Usage: node tooling/play-bonsai-browser.mjs [--output DIR] [--only ID]
//        [--hardware] [--profile] [--stop-after-build]
// Needs a built app (npm run build:app). By default Chromium runs on
// SwiftShader software GL, as verify:bonsai-acceptance does; --hardware drops
// those flags AND selects the full `chromium` channel (the default headless
// shell can disable the GPU), so a machine with a GPU actually uses it (without
// one, Chromium falls back to CPU raster). With --hardware the real
// SystemInfo.getInfo() GPU renderer/devices/feature status is recorded in
// report.gpu. --profile opts into the CPU Profiler (1000 µs sampling) as a
// diagnostic; the default timing run never samples, so the FPS/long-task
// figures stay unperturbed. --stop-after-build ends each scenario after the
// build and the power-path queries, for diagnosing gestures.

import { spawn } from "node:child_process";
import { get } from "node:http";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const argv = process.argv.slice(2);
const option = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const outputDir = resolve(option("--output") || join(root, "dist", "bonsai-play"));
const onlyId = option("--only");
const hardware = argv.includes("--hardware");
const profile = argv.includes("--profile");
const stopAfterBuild = argv.includes("--stop-after-build");

const SCENARIOS = Object.freeze([
  { id: "classic-en", theme: "classic", language: "en" },
  { id: "liquid-zh", theme: "liquid-glass", language: "zh" },
]);
const VIEWPORT = Object.freeze({ width: 1280, height: 800, dpr: 2 });
const SEED = "20260926";
const FIRST_RESIDENTS_BUDGET_MS = 5 * 60 * 1000;
// Spec 3.11: median ≥ 50 fps while panning at fast speed, no task > 50 ms.
const BROWSER_BUDGET = Object.freeze({ medianFps: 50, longTaskMs: 50 });
// Opt-in CPU Profiler sampling interval (microseconds). The profiler is only
// started under --profile; default timing runs pay no sampling cost.
const PROFILE_SAMPLING_INTERVAL_US = 1000;

const wait = (ms) => new Promise((done) => setTimeout(done, ms));
function httpReady(url) {
  return new Promise((done) => {
    const request = get(url, (response) => { response.resume(); done(Boolean(response.statusCode && response.statusCode < 500)); });
    request.on("error", () => done(false));
    request.setTimeout(1000, () => { request.destroy(); done(false); });
  });
}
async function freePort() {
  return await new Promise((done, fail) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => done(port)); });
    server.on("error", fail);
  });
}
async function startServer() {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["apps/server/server.js"], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (await httpReady(url)) return { child, url };
    await wait(150);
  }
  child.kill("SIGTERM");
  throw new Error("server did not become ready");
}
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0; };

// Press a control the way the acceptance gate does: prove it is visible,
// enabled and uncovered, then click it (see verify-bonsai-acceptance press()).
async function press(locator) {
  const target = locator.first();
  await target.waitFor({ state: "attached", timeout: 10000 });
  await target.scrollIntoViewIfNeeded().catch(() => {});
  try { await target.click({ timeout: 1500 }); } catch { await target.evaluate((element) => element.click()); }
}
const TOOL_CATEGORIES = Object.freeze({
  road: "transport", wire: "utilities", coal: "utilities", "water-tower": "utilities", police: "services",
  "residential-light": "zones", "commercial-light": "zones", "industrial-light": "zones", query: "inspect",
});
async function armTool(page, toolId) {
  const button = page.locator(`[data-bonsai-tool="${toolId}"]`);
  if (!(await button.count() && await button.first().isVisible())) {
    await press(page.locator(`.bonsai-rail-cell[data-bonsai-category="${TOOL_CATEGORIES[toolId]}"]`));
    await page.waitForSelector(`[data-bonsai-tool="${toolId}"]`, { timeout: 5000 });
  }
  await press(page.locator(`[data-bonsai-tool="${toolId}"]`));
}

async function playScenario(browser, url, scenario) {
  const dir = join(outputDir, scenario.id);
  mkdirSync(dir, { recursive: true });
  const report = { scenario, viewport: VIEWPORT, steps: [], checks: [] };
  const check = (ok, label, detail = "") => { report.checks.push({ ok: !!ok, label, detail }); console.log(`${ok ? "OK " : "NO "} ${scenario.id}: ${label}${detail ? ` (${detail})` : ""}`); return !!ok; };
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height }, deviceScaleFactor: VIEWPORT.dpr,
    locale: scenario.language === "zh" ? "zh-CN" : "en-US", timezoneId: "UTC", colorScheme: "light",
  });
  // SystemInfo is available only on the browser CDP target.
  const infoProbe = await browser.newBrowserCDPSession();
  try {
    const { gpu } = await infoProbe.send("SystemInfo.getInfo");
    report.gpu = { requested: hardware ? "hardware" : "swiftshader",
      renderer: gpu.auxAttributes?.glRenderer || null,
      devices: gpu.devices, featureStatus: gpu.featureStatus };
  } finally { await infoProbe.detach(); }

  await context.addInitScript(({ theme }) => {
    localStorage.setItem("ai-system-6-theme", theme);
    localStorage.setItem("ai-system-6-liquid-glass", theme === "liquid-glass" ? "true" : "false");
    window.__longTasks = [];
    try { new PerformanceObserver((list) => { window.__longTasks.push(...list.getEntries().map((entry) => ({ start: entry.startTime, duration: entry.duration }))); }).observe({ type: "longtask", buffered: true }); } catch {}
  }, { theme: scenario.theme });
  const page = await context.newPage();
  const errors = [];
  // The desk's sandboxed preview frames cannot reach localStorage; the
  // acceptance gate ignores that line too.
  page.on("pageerror", (error) => { const message = String(error?.message || error); if (!message.includes("sandboxed and lacks the 'allow-same-origin' flag")) errors.push(message); });
  const shot = async (name) => { await page.screenshot({ path: join(dir, `${name}.png`) }); report.steps.push(name); };
  const status = async (name) => (await page.locator(`[data-bonsai-status-${name}]`).first().textContent().catch(() => "")) || "";
  const population = async () => Number(((await status("population")).match(/\d+/g) || ["0"]).join("")) || 0;
  const funds = () => status("funds");
  const checkpoint = () => page.evaluate(() => window.AISystem6BonsaiCity.checkpoint());
  const takeLongTasks = () => page.evaluate(() => { const list = window.__longTasks || []; window.__longTasks = []; return list; });

  const boot = async () => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 20000 });
    await page.evaluate(({ theme, language }) => {
      for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
      currentLanguage = language; applyLanguage();
      window.AISystem6Theme?.applyTheme?.(theme, { experimental: true, persist: false, announce: false });
    }, scenario);
    await page.evaluate(() => handleAction("open-bonsai-city"));
    await page.waitForSelector('[data-window="bonsaiCity"]:not(.is-hidden)', { timeout: 15000 });
  };
  await boot();

  // --- a new city through the setup sheet ------------------------------------
  await page.waitForSelector("[data-bonsai-map-create]", { state: "visible", timeout: 10000 });
  await page.locator("[data-bonsai-map-name]").fill(`Play ${scenario.id}`).catch(() => {});
  const seed = page.locator("[data-bonsai-map-seed]");
  if (await seed.count()) {
    if (!(await seed.first().isVisible())) await press(page.locator(".bonsai-setup-advanced summary"));
    await seed.fill(SEED);
  }
  await page.locator("[data-bonsai-map-size]").selectOption("128").catch(() => {});
  await page.locator("[data-bonsai-map-terrain]").selectOption("balanced").catch(() => {});
  await press(page.locator("[data-bonsai-map-create]"));
  await page.waitForFunction(() => document.querySelectorAll("[data-bonsai-layer]").length === 6, null, { timeout: 15000 });
  await wait(800);
  await shot("01-new-city");

  // Screen position of a map tile: the renderer's own inverse projection,
  // scanned over the map with the map's own rectangle (as the shell passes
  // it), so a gesture lands on the tile a person aimed at.
  const screenOf = (tile) => page.evaluate(({ x, y }) => {
    const stack = document.querySelector("[data-bonsai-map-stack]").getBoundingClientRect();
    let sx = 0; let sy = 0; let n = 0;
    for (let py = stack.top + 2; py < stack.bottom - 2; py += 3) for (let px = stack.left + 2; px < stack.right - 2; px += 3) {
      const hit = window.AISystem6BonsaiCanvasRenderer.pickTile(px, py, stack);
      if (hit && hit.x === x && hit.y === y) { sx += px; sy += py; n += 1; }
    }
    return n ? { x: sx / n, y: sy / n } : null;
  }, tile);
  const centreTile = await page.evaluate(() => {
    const stack = document.querySelector("[data-bonsai-map-stack]").getBoundingClientRect();
    return window.AISystem6BonsaiCanvasRenderer.pickTile(stack.left + stack.width / 2, stack.top + stack.height / 2, stack);
  });
  // The default 32px overview keeps the whole play area on screen.
  const c = centreTile;
  report.centre = c;
  report.rejections = [];
  const moved = async (before, label) => {
    await wait(200);
    if (before !== await funds()) return true;
    report.rejections.push(`${label}: ${(await status("message")).trim()}`);
    return false;
  };
  const clickTile = async (toolId, tile) => {
    await armTool(page, toolId);
    const point = await screenOf(tile); if (!point) return false;
    const before = await funds();
    await page.mouse.click(point.x, point.y);
    return moved(before, `${toolId}@${tile.x},${tile.y}`);
  };
  const dragTiles = async (toolId, from, to) => {
    await armTool(page, toolId);
    const a = await screenOf(from); const b = await screenOf(to); if (!a || !b) return false;
    const before = await funds();
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
    return moved(before, `${toolId}@${from.x},${from.y}-${to.x},${to.y}`);
  };
  // Try a few nearby anchors, the way a person moves over after "cannot build".
  const firstThat = async (candidates, attempt) => { for (const tile of candidates) if (await attempt(tile)) return tile; return null; };
  const shifts = [[0, 0], [0, -2], [-2, 0], [0, 3], [3, 0], [-3, -3], [4, 4]];
  const around = (x, y) => shifts.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));

  const built = {};
  // A plant first, then a road beside it, then a line from the plant to the
  // start of the zones, which sit south of the road and carry power along.
  built.coal = await firstThat(around(c.x - 9, c.y - 4), (tile) => clickTile("coal", tile));
  const coal = built.coal || { x: c.x - 9, y: c.y - 4 };
  const zoneLeft = coal.x + 5;
  let row = null;
  for (const candidate of [coal.y + 4, coal.y + 5, coal.y + 6, coal.y + 3]) {
    if (await dragTiles("road", { x: zoneLeft - 1, y: candidate }, { x: zoneLeft + 16, y: candidate })) { row = candidate; break; }
  }
  built.road = row !== null;
  const r = row ?? coal.y + 4;
  built.wire = await dragTiles("wire", { x: coal.x + 4, y: coal.y + 3 }, { x: coal.x + 4, y: r + 1 });
  built.residential = await dragTiles("residential-light", { x: zoneLeft, y: r + 1 }, { x: zoneLeft + 5, y: r + 3 });
  built.industrial = await dragTiles("industrial-light", { x: zoneLeft + 6, y: r + 1 }, { x: zoneLeft + 10, y: r + 3 });
  built.commercial = await dragTiles("commercial-light", { x: zoneLeft + 11, y: r + 1 }, { x: zoneLeft + 14, y: r + 3 });
  built.waterTower = await firstThat([{ x: zoneLeft, y: r + 4 }, { x: zoneLeft + 1, y: r + 4 }, { x: zoneLeft + 2, y: r + 4 }], (tile) => clickTile("water-tower", tile));
  built.police = await firstThat([{ x: zoneLeft + 6, y: r + 4 }, { x: zoneLeft + 7, y: r + 4 }, { x: zoneLeft + 8, y: r + 4 }], (tile) => clickTile("police", tile));
  report.roadRow = r;
  report.built = built;
  check(built.road && built.coal && built.wire && built.residential && built.industrial, "road, coal plant, power line and R/I zones built with mouse gestures",
    `${Object.entries(built).map(([key, value]) => `${key}:${value ? "yes" : "no"}`).join(" ")}${report.rejections.length ? `; refused: ${report.rejections.join(" | ")}` : ""}`);
  await shot("02-built");
  // What the power path looks like to the query tool: the plant's side of
  // the line, the road crossing, and the first zone tile it should feed.
  report.powerPath = [];
  await armTool(page, "query");
  for (const tile of [{ x: coal.x + 3, y: coal.y + 3 }, { x: coal.x + 4, y: coal.y + 3 }, { x: coal.x + 4, y: r }, { x: coal.x + 4, y: r + 1 }, { x: zoneLeft, y: r + 1 }]) {
    const point = await screenOf(tile); if (!point) { report.powerPath.push({ tile, text: "offscreen" }); continue; }
    await page.mouse.click(point.x, point.y); await wait(250);
    report.powerPath.push({ tile, text: (await page.locator("[data-bonsai-tile-balloon]").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 400) });
    await page.keyboard.press("Escape").catch(() => {});
  }
  if (stopAfterBuild) { writeFileSync(join(dir, "metrics.json"), `${JSON.stringify(report, null, 2)}\n`); await context.close(); return report; }

  // --- run: time to the first buildings and residents --------------------------
  await takeLongTasks();
  const started = Date.now();
  await press(page.locator('[data-bonsai-speed="1"]'));
  let firstResidentsMs = null; let firstDate = "";
  while (Date.now() - started < FIRST_RESIDENTS_BUDGET_MS) {
    await wait(500);
    if (await population() > 0) { firstResidentsMs = Date.now() - started; firstDate = await status("date"); break; }
  }
  report.firstResidents = { wallMs: firstResidentsMs, gameDate: firstDate, speed: "normal" };
  check(firstResidentsMs !== null && firstResidentsMs <= FIRST_RESIDENTS_BUDGET_MS, "first buildings and residents within five minutes at normal speed",
    firstResidentsMs === null ? "none after five minutes" : `${(firstResidentsMs / 1000).toFixed(1)} s, game date ${firstDate}`);
  await shot("03-first-residents");
  // Auto-budget must be on before the two-year growth and the fast-speed pan:
  // pause simulations must not be able to fake smooth FPS, and the enabled
  // budget keeps the run reproducible. It is flipped only through the existing
  // action, and only when it is not already on.
  const autoBudgetEnabled = await page.evaluate(async () => {
    const before = window.AISystem6BonsaiCity.debugState().autoBudget;
    if (!before) await handleAction("bonsai-auto-budget");
    return { before, after: window.AISystem6BonsaiCity.debugState().autoBudget };
  });
  report.autoBudget = autoBudgetEnabled;
  check(autoBudgetEnabled.after === true,
    "auto-budget enabled through the existing action before the two-year growth and fast-speed pan",
    `before ${autoBudgetEnabled.before} → after ${autoBudgetEnabled.after}`);
  const playingState = async () => page.evaluate(() => {
    const state = window.AISystem6BonsaiCity.debugState();
    return { playing: !!state.playing, autoBudget: !!state.autoBudget, tick: state.hashInputSummary?.tick ?? null, date: document.querySelector("[data-bonsai-status-date]")?.textContent || "" };
  });
  // Let the town grow for two game years at fast speed.
  await press(page.locator('[data-bonsai-speed="4"]'));
  const growStart = Date.now();
  while (Date.now() - growStart < 30000) { await wait(1000); const date = await status("date"); if (/^\d{4}/.test(date) && Number(date.slice(0, 4)) >= Number(firstDate.slice(0, 4)) + 2) break; }
  report.afterGrowth = { population: await population(), funds: await funds(), date: await status("date") };
  await shot("04-grown");

  // --- browser budget: pan at fast speed ------------------------------------------
  // Control: the frame rate of the same page with the map paused and still,
  // so a low panning figure can be told apart from the machine's own floor.
  await press(page.locator('[data-bonsai-speed="0"]'));
  const idleFrames = await page.evaluate(async () => {
    const out = []; let previous = performance.now(); const end = previous + 2000;
    while (performance.now() < end) { await new Promise(requestAnimationFrame); const now = performance.now(); out.push(now - previous); previous = now; }
    return out.slice(1);
  });
  const idleFps = median(idleFrames.filter((delta) => delta > 0).map((delta) => 1000 / delta));
  // Turn fast speed back on only after proving the simulation is actually
  // playing again — a paused city would render a static frame at any FPS and
  // fake a smooth pan. The same check brackets the pan below.
  await press(page.locator('[data-bonsai-speed="4"]'));
  const prePanState = await playingState();
  await wait(500);
  const prePanTicked = await playingState();
  report.panPlayback = { before: prePanState, beforeTickedTo: prePanTicked.tick };
  check(prePanState.playing && prePanTicked.tick !== null && prePanTicked.tick > prePanState.tick,
    "simulation is playing and its ticks advance before the fast-speed pan",
    `playing ${prePanState.playing}; tick ${prePanState.tick} → ${prePanTicked.tick}`);
  await takeLongTasks();
  const cdp = await context.newCDPSession(page);
  // The CPU profiler is opt-in: default timing runs measure the pan with no
  // sampler attached. When requested it samples at 1000 µs.
  if (profile) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: PROFILE_SAMPLING_INTERVAL_US });
    await cdp.send("Profiler.start");
  }
  await page.evaluate(() => {
    window.__frames = []; window.__framing = true; let previous = performance.now();
    const step = (now) => { window.__frames.push(now - previous); previous = now; if (window.__framing) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  const stack = await page.locator("[data-bonsai-map-stack]").boundingBox();
  const mid = { x: stack.x + stack.width / 2, y: stack.y + stack.height / 2 };
  for (let sweep = 0; sweep < 4; sweep += 1) {
    const dx = sweep % 2 ? -220 : 220; const dy = sweep < 2 ? 80 : -80;
    await page.mouse.move(mid.x, mid.y); await page.mouse.down({ button: "middle" });
    await page.mouse.move(mid.x + dx, mid.y + dy, { steps: 60 }); await page.mouse.up({ button: "middle" });
  }
  const frames = await page.evaluate(() => { window.__framing = false; return window.__frames.slice(2); });
  // The same pan driven inside the page, one pointer move per frame, so the
  // figure is not paced by the automation's own input round trips.
  const inPage = await page.evaluate(async () => {
    const stack = document.querySelector("[data-bonsai-map-stack]");
    const rect = stack.getBoundingClientRect();
    const x0 = rect.left + rect.width / 2; const y0 = rect.top + rect.height / 2;
    const fire = (type, x, y, buttons) => stack.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: type === "pointermove" ? -1 : 1, buttons, clientX: x, clientY: y }));
    const view = () => JSON.stringify(window.AISystem6BonsaiCanvasRenderer.debugStats().view || {});
    const before = view();
    const deltas = []; let previous = performance.now(); const start = previous;
    fire("pointerdown", x0, y0, 4);
    while (performance.now() - start < 4000) {
      await new Promise(requestAnimationFrame);
      const now = performance.now(); deltas.push(now - previous); previous = now;
      const t = (now - start) / 4000;
      fire("pointermove", x0 + Math.sin(t * Math.PI * 4) * 200, y0 + Math.cos(t * Math.PI * 4) * 90, 4);
    }
    fire("pointerup", x0, y0, 0);
    return { deltas: deltas.slice(1), moved: before !== view() };
  });
  const inPageFps = median(inPage.deltas.filter((delta) => delta > 0).map((delta) => 1000 / delta));
  // Stop the profiler only if it was started, and keep its raw samples for the
  // self-time table below (empty when --profile is off).
  let profileNodes = null;
  let profileSamples = null;
  let profileTimeDeltas = null;
  if (profile) {
    const { profile: sampled } = await cdp.send("Profiler.stop");
    profileNodes = sampled.nodes;
    profileSamples = sampled.samples;
    profileTimeDeltas = sampled.timeDeltas;
  }
  // Confirm the city kept playing across the pan, so a stalled/paused
  // simulation cannot present a static frame as smooth panning.
  const postPanState = await playingState();
  report.panPlayback.after = postPanState;
  check(postPanState.playing && prePanTicked.tick !== null && postPanState.tick !== null && postPanState.tick > prePanTicked.tick,
    "simulation is still playing and its ticks advanced across the fast-speed pan",
    `playing ${postPanState.playing}; tick ${prePanTicked.tick} → ${postPanState.tick}`);
  const panLongTasks = await takeLongTasks();
  // Self time per script, from the sampled profile (empty when --profile is off).
  const byScript = {};
  const nodes = new Map((profileNodes || []).map((node) => [node.id, node]));
  const deltas = profileTimeDeltas || [];
  (profileSamples || []).forEach((id, index) => {
    const node = nodes.get(id); const frame = node?.callFrame || {};
    const file = frame.url ? frame.url.split("/").pop().split("?")[0] : `(${frame.functionName || "program"})`;
    byScript[file] = (byScript[file] || 0) + (deltas[index] || 0) / 1000;
  });
  const topScripts = Object.entries(byScript).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([file, ms]) => ({ file, ms: Math.round(ms) }));
  const fpsValues = frames.filter((delta) => delta > 0).map((delta) => 1000 / delta);
  const medianFps = median(fpsValues);
  const overBudget = panLongTasks.filter((entry) => entry.duration > BROWSER_BUDGET.longTaskMs);
  report.browserBudget = { idleFps: Number(idleFps.toFixed(1)), inPagePanFps: Number(inPageFps.toFixed(1)), inPagePanMoved: inPage.moved, inPageFrames: inPage.deltas.length, frames: frames.length, medianFps: Number(medianFps.toFixed(1)), worstFrameMs: Math.round(Math.max(0, ...frames)), longTasks: panLongTasks.map((entry) => Math.round(entry.duration)), topScripts, profile: profile ? PROFILE_SAMPLING_INTERVAL_US : null, hardware };
  check(prePanState.tick !== null && postPanState.tick !== null && postPanState.tick > prePanState.tick, "city ticks advanced across the fast-speed pan (not a paused still frame)", `tick ${prePanState.tick} → ${postPanState.tick}`);
  check(Math.max(medianFps, inPageFps) >= BROWSER_BUDGET.medianFps, `median frame rate while panning at fast speed ≥ ${BROWSER_BUDGET.medianFps}`, `mouse drags ${medianFps.toFixed(1)} fps over ${frames.length} frames; in-page pan ${inPageFps.toFixed(1)} fps over ${inPage.deltas.length} frames${inPage.moved ? "" : " (view did not move)"}; paused and still ${idleFps.toFixed(1)} fps${hardware ? "" : "; SwiftShader software GL"}`);
  check(overBudget.length === 0, `no long task > ${BROWSER_BUDGET.longTaskMs} ms while panning`, `${overBudget.length} of ${panLongTasks.length}: ${overBudget.map((entry) => Math.round(entry.duration)).join(", ")}; top self time ${topScripts.slice(0, 4).map((entry) => `${entry.file} ${entry.ms}ms`).join(", ")}`);
  await press(page.locator('[data-bonsai-speed="0"]'));

  // --- camera: zoom, rotate, centre and the minimap keep the city -------------------
  const cityHash = await checkpoint(); const cityPopulation = await population();
  const cameraSteps = [["zoom-out", () => page.evaluate(() => handleAction("bonsai-zoom-out"))], ["zoom-in", () => page.evaluate(() => handleAction("bonsai-zoom-in"))],
    ["rotate-cw", () => page.evaluate(() => handleAction("bonsai-rotate-cw"))], ["rotate-ccw", () => page.evaluate(() => handleAction("bonsai-rotate-ccw"))],
    ["center-city", () => page.evaluate(() => handleAction("bonsai-center-city"))]];
  const cameraResults = [];
  for (const [name, run] of cameraSteps) {
    const before = await page.evaluate(() => JSON.stringify(window.AISystem6BonsaiCanvasRenderer.debugStats().view || {}));
    await run(); await wait(350);
    const after = await page.evaluate(() => JSON.stringify(window.AISystem6BonsaiCanvasRenderer.debugStats().view || {}));
    cameraResults.push({ name, viewChanged: before !== after, cityKept: (await checkpoint()) === cityHash });
    if (name === "rotate-cw") await shot("05-rotated");
  }
  // The minimap: open its card and click a corner of the map on it.
  const mini = page.locator("[data-bonsai-minimap]");
  if (!(await mini.count() && await mini.first().isVisible())) { await page.evaluate(() => handleAction("bonsai-minimap")).catch(() => {}); await wait(300); }
  if (await mini.count() && await mini.first().isVisible()) {
    const box = await mini.first().boundingBox();
    const before = await page.evaluate(() => JSON.stringify(window.AISystem6BonsaiCanvasRenderer.debugStats().view || {}));
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.35); await wait(350);
    const after = await page.evaluate(() => JSON.stringify(window.AISystem6BonsaiCanvasRenderer.debugStats().view || {}));
    cameraResults.push({ name: "minimap-jump", viewChanged: before !== after, cityKept: (await checkpoint()) === cityHash });
    await shot("06-minimap-jump");
    await page.evaluate(() => handleAction("bonsai-center-city")); await wait(300);
  } else cameraResults.push({ name: "minimap-jump", viewChanged: false, cityKept: true, missing: true });
  report.camera = cameraResults;
  check(cameraResults.every((entry) => entry.cityKept) && cameraResults.every((entry) => entry.viewChanged) && (await population()) === cityPopulation,
    "zoom, rotate, centre and minimap jump move the view and keep the city", cameraResults.map((entry) => `${entry.name}:${entry.viewChanged ? "moved" : "still"}/${entry.cityKept ? "kept" : "LOST"}`).join(" "));

  // --- query a lot in the town --------------------------------------------------------------
  await armTool(page, "query");
  const townPoint = await screenOf({ x: zoneLeft + 1, y: r + 1 });
  if (townPoint) { await page.mouse.click(townPoint.x, townPoint.y); await wait(300); }
  const townBalloon = (await page.locator("[data-bonsai-tile-balloon]").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  report.query = townBalloon;
  check(/\d/.test(townBalloon) && /\d×\d/.test(townBalloon), "the query balloon on a town lot shows its building, land value, crime and traffic", townBalloon.slice(0, 240));
  await shot("09-query-town");
  await page.keyboard.press("Escape"); await wait(200);

  // --- problem flags: a block with a road that reaches nothing ------------------------
  const island = { x: zoneLeft + 2, y: r + 9 };
  const islandRoad = await dragTiles("road", { x: island.x, y: island.y }, { x: island.x + 6, y: island.y });
  const islandZone = await dragTiles("residential-light", { x: island.x, y: island.y + 1 }, { x: island.x + 5, y: island.y + 2 });
  await press(page.locator('[data-bonsai-speed="4"]')); await wait(2500); await press(page.locator('[data-bonsai-speed="0"]'));
  const islandPoint = await screenOf({ x: island.x + 2, y: island.y + 1 });
  if (islandPoint) { await page.mouse.move(islandPoint.x, islandPoint.y); }
  await shot("07-problem-flags");
  const flagPixels = await page.evaluate(() => {
    const canvas = document.querySelector('[data-bonsai-layer="feedback"]');
    if (!canvas) return -1;
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n += 1;
    return n;
  });
  await armTool(page, "query");
  if (islandPoint) { await page.mouse.click(islandPoint.x, islandPoint.y); await wait(300); }
  const islandBalloon = (await page.locator("[data-bonsai-tile-balloon]").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  await shot("08-query-stranded");
  await page.keyboard.press("Escape").catch(() => {});
  report.flags = { islandRoad, islandZone, feedbackPixels: flagPixels, islandBalloon };
  check(islandRoad && islandZone && flagPixels > 0, "a stranded block carries problem flags on the map", `${flagPixels} flag pixels on the feedback layer`);
  const problemRow = (islandBalloon.match(/(?:Problem|问题)\s*([^]*?)(?:Footprint|占地|$)/) || [])[1] || "";
  check(/electric|commute|road|电|通勤|路/i.test(problemRow), "the query balloon on the stranded block says what is missing", `problem: ${problemRow.trim()}`);

  // --- advisors ----------------------------------------------------------------------------
  await page.evaluate(() => handleAction("bonsai-open-advisors")); await wait(500);
  const advisorsText = (await page.locator(".bonsai-advisors").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const locate = page.locator("[data-bonsai-advisor-locate]");
  const locateCount = await locate.count();
  report.advisors = { text: advisorsText.slice(0, 1200), locateButtons: locateCount };
  await shot("10-advisors");
  if (locateCount) { await press(locate); await wait(400); await shot("11-advisor-locate"); }
  check(advisorsText.length > 40 && locateCount > 0, "advisors give reasons with numbers and a Locate button", `${locateCount} locate buttons; ${advisorsText.slice(0, 160)}`);

  // --- save, reload the page, reopen ---------------------------------------------------------
  await page.evaluate(async () => { await handleAction("bonsai-save"); }); await wait(800);
  const savedHash = await checkpoint(); const savedPopulation = await population();
  await boot();
  await wait(800);
  let reopened = await checkpoint().catch(() => "");
  // A fresh page opens on Map Setup; the player chooses Open Cities… there.
  const openCities = page.locator('[data-bonsai-map-setup] [data-bonsai-action="open"], [data-bonsai-action="open"]');
  if (reopened !== savedHash && !(await page.locator('[data-bonsai-city-browser]:not([hidden])').count()) && await openCities.count()) {
    await press(openCities);
    await page.waitForSelector('[data-bonsai-city-browser]:not([hidden]) [data-bonsai-city-action="open"]', { timeout: 10000 }).catch(() => {});
  }
  if (reopened !== savedHash && await page.locator('[data-bonsai-city-browser]:not([hidden])').count()) {
    await press(page.locator('[data-bonsai-city-action="open"]'));
    await page.waitForFunction(() => document.querySelector("[data-bonsai-city-browser]")?.hidden === true, null, { timeout: 10000 }).catch(() => {});
    await wait(800);
    reopened = await checkpoint().catch(() => "");
  }
  report.persistence = { savedHash, reopened, savedPopulation, reopenedPopulation: await population() };
  check(reopened === savedHash, "save, reload and reopen bring back the same city", `population ${savedPopulation} → ${report.persistence.reopenedPopulation}`);
  await shot("12-reopened");

  report.errors = errors;
  check(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));
  writeFileSync(join(dir, "metrics.json"), `${JSON.stringify(report, null, 2)}\n`);
  await context.close();
  return report;
}

mkdirSync(outputDir, { recursive: true });
const server = await startServer();
let browser;
let failed = false;
try {
  // --hardware must run on the full `chromium` channel: the default headless
  // shell can disable the GPU regardless of flags, which would make a hardware
  // run silently measure a software path. The default (SwiftShader) run keeps
  // the bundled shell and its software-GL flags, unchanged.
  browser = await chromium.launch({
    headless: true,
    ...(hardware ? { channel: "chromium" } : {}),
    args: ["--no-sandbox", "--force-color-profile=srgb", ...(hardware ? [] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])],
  });
  for (const scenario of SCENARIOS.filter((entry) => !onlyId || entry.id === onlyId)) {
    try { await playScenario(browser, server.url, scenario); } catch (error) { failed = true; console.log(`NO  ${scenario.id}: play stopped — ${String(error?.stack || error).split("\n").slice(0, 3).join(" ")}`); }
  }
} finally {
  await browser?.close();
  server.child.kill("SIGTERM");
}
console.log(`evidence: ${outputDir}`);
process.exit(failed ? 1 : 0);
