#!/usr/bin/env node
// Deterministic renderer-only evidence. This is a composed visual fixture,
// not a simulated economy, a shell acceptance test, or a GPU benchmark.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} requires a value`);
  return args[index + 1];
}
if (args.includes("--help")) {
  console.log("Usage: node tooling/capture-bonsai-remaster.mjs [--url URL] [--output DIR] [--full] [--hardware] [--source-ref REF] [--scene NAME] [--backend canvas-2d|three-voxel] [--time day|night]");
  process.exit(0);
}
const baseUrl = new URL(option("--url", "http://127.0.0.1:4173"));
const output = resolve(option("--output", join(root, "dist/bonsai-remaster/current")));
const sourceRef = option("--source-ref", null);
const commit = sourceRef ? execFileSync("git", ["rev-parse", "--verify", `${sourceRef}^{commit}`], { cwd: root, encoding: "utf8" }).trim() : null;
const full = args.includes("--full");
const hardware = args.includes("--hardware");
const digest = (data) => createHash("sha256").update(data).digest("hex");
const scenes = [
  { id: "residential", center: { x: 17, y: 17 }, zoom: 1.05 },
  { id: "commercial", center: { x: 43, y: 17 }, zoom: 1.0 },
  { id: "industrial-waterfront", center: { x: 17, y: 43 }, zoom: 0.95 },
  { id: "facilities", center: { x: 44, y: 41 }, zoom: 1.0 },
];
const sceneFilter = option("--scene", null);
const backendFilter = option("--backend", null);
const timeFilter = option("--time", null);
if (sceneFilter && !scenes.some((scene) => scene.id === sceneFilter)) throw new Error("Unknown --scene");
if (backendFilter && !["canvas-2d", "three-voxel"].includes(backendFilter)) throw new Error("Unknown --backend");
if (timeFilter && !["day", "night"].includes(timeFilter)) throw new Error("Unknown --time");
const modules = ["app/features/bonsai-city-sim.js", "app/features/bonsai-catalog.js", "app/features/bonsai-renderer.js", "app/generated/bonsai-atlas.js", "app/features/bonsai-renderer-canvas.js", "app/features/bonsai-renderer-voxel.js"];
const resourceHashes = {};
const errors = [];
const warnings = [];
const rows = [];
const evidence = { schema: "bonsai-remaster-evidence-v1", sourceUrl: baseUrl.href, sourceRef, sourceCommit: commit, fixtureKind: "composed render snapshot; no simulated growth or save writes", seed: 20260911, full, filters: { scene: sceneFilter, backend: backendFilter, time: timeFilter }, viewport: { width: 1024, height: 720, dpr: 1 }, requestedGraphics: hardware ? "default browser graphics; inspect actual GL renderer" : "software SwiftShader", timingMeaning: "CPU renderer call duration and browser requestAnimationFrame intervals; neither is GPU execution time", scenes, resourceHashes, captures: rows, errors, warnings };
async function atomicJson(name, value) {
  const target = join(output, name);
  await writeFile(`${target}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${target}.tmp`, target);
}
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--no-sandbox", "--force-color-profile=srgb", ...(hardware ? [] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])] });
try {
  const context = await browser.newContext({ viewport: evidence.viewport, deviceScaleFactor: 1, locale: "en-US" });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const cdp = await context.newCDPSession(page);
  page.on("pageerror", (error) => errors.push({ type: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push({ type: "console", message: message.text() });
    if (message.type() === "warning") warnings.push(message.text());
  });
  page.on("requestfailed", (request) => errors.push({ type: "request", url: request.url(), message: request.failure()?.errorText }));
  await page.route("**/__bonsai_remaster__", (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta charset="utf-8"><title>Bonsai renderer evidence</title><style>html,body{margin:0;background:#b6c0b0;width:100%;height:100%;overflow:hidden}#map{position:relative;width:1024px;height:720px;overflow:hidden}#map canvas{position:absolute;inset:0;width:100%;height:100%}</style></head><body><div id="map" data-bonsai-map-stack></div></body></html>' }));
  // Optional historical sources prevent a mixed old-bundle/new-source baseline.
  await page.route(/\/(?:assets\/bonsai\/|app\/(?:features\/bonsai-|generated\/bonsai-))/, async (route) => {
    const requestPath = new URL(route.request().url()).pathname.slice(1);
    try {
      const body = commit
        ? execFileSync("git", ["show", `${commit}:apps/desktop/${requestPath}`], { cwd: root, maxBuffer: 40 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })
        : await (await route.fetch()).body();
      resourceHashes[requestPath] = digest(body);
      await route.fulfill({ status: 200, body, contentType: requestPath.endsWith(".png") ? "image/png" : requestPath.endsWith(".json") ? "application/json" : "application/javascript" });
    } catch (error) {
      errors.push({ type: "resource", path: requestPath, message: error.message });
      await route.abort();
    }
  });
  await page.goto(new URL("/__bonsai_remaster__", baseUrl).href, { waitUntil: "domcontentloaded" });
  for (const module of modules) await page.addScriptTag({ url: new URL(module, baseUrl).href });
  const fixture = await page.evaluate(() => {
    // This is an authored street-and-parcel study, not simulated growth.
    // The core contributes its snapshot schema only; it is never advanced.
    const sim = window.AISystem6BonsaiSim;
    const snapshot = structuredClone(sim.buildRenderSnapshot(sim.createCity({ seed: 20260911, size: 64 })));
    const size = snapshot.size;
    for (const value of Object.values(snapshot)) if (ArrayBuffer.isView(value)) value.fill(0);
    snapshot.alt.fill(1); snapshot.powered.fill(1); snapshot.watered.fill(1);
    snapshot.buildingAnchor.fill(-1); snapshot.facilityAt.fill(-1);
    snapshot.plants = []; snapshot.services = []; snapshot.facilities = []; snapshot.buildings = [];
    snapshot.things = []; snapshot.disaster = null;
    snapshot.agents = { vehicles: [], pedestrians: [], trains: [], smoke: [], serviceVehicles: [] };
    snapshot.tick = 75; snapshot.rev = 1; snapshot.timeOfDay = 0.5;
    const index = (x, y) => y * size + x;
    const check = (condition, message) => { if (!condition) throw new Error(`remaster-fixture: ${message}`); };
    const occupied = new Uint8Array(size * size);
    const road = (x, y) => {
      check(x >= 0 && y >= 0 && x < size && y < size, "road outside map");
      const i = index(x, y); check(!snapshot.water[i], "road crosses water without an authored bridge");
      snapshot.road[i] = 1; snapshot.over[i] = 1;
    };
    const street = (x0, y0, x1, y1) => {
      check(x0 === x1 || y0 === y1, "nonorthogonal street");
      const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
      for (let x = x0, y = y0; ; x += dx, y += dy) { road(x, y); if (x === x1 && y === y1) break; }
    };
    for (let y = 54; y <= 62; y += 1) for (let x = 3; x <= 28; x += 1) {
      const i = index(x, y); snapshot.water[i] = 1; snapshot.waterLevel[i] = 1; snapshot.alt[i] = 0;
    }
    // One connected network: district avenues, longer local residential
    // streets, a commercial main street, and wide industrial service blocks.
    street(29, 6, 29, 57); street(5, 28, 57, 28); street(8, 49, 57, 49);
    street(57, 9, 57, 56);
    for (const y of [10, 18, 25]) street(7, y, 29, y);
    street(7, 10, 7, 25); street(16, 10, 16, 25);
    for (const y of [9, 16, 24]) street(29, y, 57, y);
    for (const x of [39, 53]) street(x, 9, x, 28);
    for (const y of [34, 43]) street(5, y, 29, y);
    for (const x of [8, 25]) street(x, 28, x, 49);
    street(32, 28, 32, 56);
    for (const y of [33, 41, 56]) street(32, y, 57, y);
    street(45, 33, 45, 56);
    // The rail corridor is separated from loading yards by the quayside road.
    for (let x = 4; x <= 27; x += 1) snapshot.rail[index(x, 51)] = 1;
    const bordersRoad = (x, y, w, h) => {
      const roadAt = (xx, yy) => xx >= 0 && yy >= 0 && xx < size && yy < size && snapshot.road[index(xx, yy)];
      for (let dx = 0; dx < w; dx += 1) if (roadAt(x + dx, y - 1) || roadAt(x + dx, y + h)) return true;
      for (let dy = 0; dy < h; dy += 1) if (roadAt(x - 1, y + dy) || roadAt(x + w, y + dy)) return true;
      return false;
    };
    const claim = (x, y, w, h, label) => {
      check(x >= 0 && y >= 0 && x + w <= size && y + h <= size, `${label} outside map`);
      check(bordersRoad(x, y, w, h), `${label} has no street frontage`);
      for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) {
        const i = index(x + dx, y + dy);
        check(!occupied[i] && !snapshot.road[i] && !snapshot.rail[i] && !snapshot.water[i] && !snapshot.park[i] && !snapshot.catalogId[i], `${label} overlaps another parcel or transport`);
        occupied[i] = 1;
      }
    };
    const building = (zone, stage, x, y) => {
      const variant = 1 + ((x * 7 + y * 11 + zone * 3) % 24);
      claim(x, y, stage, stage, `building ${zone}/${stage}@${x},${y}`);
      const anchor = index(x, y);
      for (let dy = 0; dy < stage; dy += 1) for (let dx = 0; dx < stage; dx += 1) {
        const i = index(x + dx, y + dy);
        snapshot.zone[i] = zone; snapshot.stage[i] = stage; snapshot.variant[i] = variant;
        snapshot.buildingState[i] = 3; snapshot.buildingAnchor[i] = anchor;
      }
      snapshot.buildings.push({ id: snapshot.buildings.length + 1, x, y, zone, stage, variant, state: 3, footprint: { w: stage, h: stage } });
    };
    const row = (zone, y, xs) => xs.forEach((x) => building(zone, 1, x, y));
    const range = (a, b) => Array.from({ length: b - a + 1 }, (_, n) => a + n);
    // Narrow residential lots face streets in rows; their unbuilt interiors
    // and the deeper block gardens remain visible between the frontages.
    row(1, 9, range(8, 26));
    row(1, 11, [...range(8, 14), ...range(17, 27)]);
    row(1, 17, [...range(8, 14), 17, 18, 25, 26, 27]);
    row(1, 19, [...range(8, 14), ...range(17, 23)]);
    row(1, 24, [...range(8, 14), 17, 18, 19, 22, 23, 26, 27]);
    row(1, 26, [...range(8, 14), ...range(17, 27)]);
    for (const [x, y] of [[20, 16], [23, 16], [26, 19], [20, 23], [24, 23]]) building(1, 2, x, y);
    // The main street mixes low shopfronts with several larger buildings;
    // it is not an identical tower on every intersection.
    for (const [x, y] of [[31,10],[35,10],[40,10],[44,10],[48,10],[54,10],[40,14],[47,14],[54,14],[40,17],[50,17],[54,17],[31,22],[35,22],[40,22],[48,22],[54,22],[54,25]]) building(2, 2, x, y);
    row(2, 15, [...range(30, 37), 50]); row(2, 17, [...range(30, 37), 48]);
    row(2, 25, [...range(30, 37), ...range(40, 45), ...range(48, 51)]);
    for (const [x, y] of [[43, 13], [44, 17], [44, 21]]) building(2, 3, x, y);
    // Warehouse lots and independent loading aprons occupy long blocks.
    // A rear apron is empty paved space, never a scaled-down fake building.
    for (const [x, y] of [[9,35],[14,35],[20,35],[9,44],[15,44],[22,44]]) building(3, 3, x, y);
    for (const [x, y] of [[6,35],[6,39],[26,36],[26,40]]) building(3, 2, x, y);
    for (const [x, y] of [[13,42],[18,42],[26,48]]) building(3, 1, x, y);
    const emptyArea = (x, y, w, h, type) => {
      for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) {
        const i = index(x + dx, y + dy);
        check(!occupied[i] && !snapshot.road[i] && !snapshot.rail[i] && !snapshot.water[i], `${type}@${x+dx},${y+dy} overlaps a parcel or transport`);
        if (type === "loading") snapshot.catalogId[i] = 0xe6; // one-tile tarmac
        else if (type === "park") snapshot.park[i] = 1;
      }
    };
    for (const [x, y, w, h] of [[9,38,3,5],[14,38,3,4],[20,38,3,5],[9,47,3,2],[15,47,3,2],[22,47,3,2]]) emptyArea(x,y,w,h,"loading");
    for (const [x,y,w,h] of [[9,13,3,2],[18,13,3,2],[9,21,3,2],[33,19,3,2],[50,11,2,2],[48,20,2,2],[34,51,5,3],[47,51,5,3]]) emptyArea(x,y,w,h,"park");
    // A separate south-east facility study, with canonical footprints read
    // from the same atlas definitions used by the production renderer.
    for (const [kind,x,y] of [["nuclear",33,34],["solar",40,34],["station",46,34],["coal",50,34],["wind",55,34],["police",33,42],["fire",37,42],["school",40,42],["clinic",46,42],["tower",50,42],["pump",54,42]]) {
      const frame = window.AISystem6BonsaiAtlas.frames[`facility.${kind}`];
      const { w, h } = frame.footprint;
      claim(x,y,w,h,`facility ${kind}`);
      const id = snapshot.facilities.length;
      snapshot.facilities.push({ id: id + 1, x, y, kind, footprint: { w, h }, funded: true });
      for (let dy=0;dy<h;dy+=1)for(let dx=0;dx<w;dx+=1)snapshot.facilityAt[index(x+dx,y+dy)]=id;
    }
    // Only genuine open ground receives occasional trees; no canopy hides
    // road intersections, rail tracks, loading aprons or building geometry.
    for (let y=7;y<=55;y+=1)for(let x=5;x<=56;x+=1) {
      const i=index(x,y);
      if (!occupied[i]&&!snapshot.road[i]&&!snapshot.rail[i]&&!snapshot.water[i]&&!snapshot.park[i]&&!snapshot.catalogId[i]&&(x*17+y*23)%47===0) snapshot.tree[i]=1;
    }
    for (const [x,y] of [[11,10],[22,18],[35,16],[49,24],[17,43],[40,49]]) snapshot.agents.vehicles.push({id:`car-${x}-${y}`,x,y,phase:.5,dir:1});
    snapshot.agents.trains.push({ id:"quayside-train",x:14,y:51,phase:.5,dir:1 });
    // Executable fixture acceptance: one network and physically valid plots.
    const roadIds = Array.from(snapshot.road, (value, i) => value ? i : -1).filter((i) => i >= 0);
    const visited = new Set([roadIds[0]]), queue = [roadIds[0]];
    for (let head=0;head<queue.length;head+=1) {
      const i=queue[head],x=i%size,y=Math.floor(i/size);
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=size||yy>=size)continue;
        const next=index(xx,yy);if(snapshot.road[next]&&!visited.has(next)){visited.add(next);queue.push(next);}
      }
    }
    check(visited.size===roadIds.length,"road network is disconnected");
    check(snapshot.buildings.every((b)=>b.footprint.w===b.stage&&b.footprint.h===b.stage),"building footprints must remain canonical");
    const developedBounds = [];
    for(let y=7;y<=52;y+=1)for(let x=5;x<=57;x+=1)developedBounds.push(index(x,y));
    const openTiles = developedBounds.filter((i)=>!occupied[i]&&!snapshot.road[i]&&!snapshot.water[i]&&!snapshot.rail[i]).length;
    check(openTiles/developedBounds.length>.35,"district composition needs substantial open space");
    snapshot.fixtureLayout = { version:2, kind:"authored street-and-parcel study", roadTiles:roadIds.length, connectedRoadTiles:visited.size, buildingCount:snapshot.buildings.length, facilityCount:snapshot.facilities.length, openLandFraction:openTiles/developedBounds.length };
    window.__remasterSnapshot = snapshot;
    return JSON.parse(JSON.stringify(snapshot, (_key, value) => ArrayBuffer.isView(value) ? Array.from(value) : value));
  });
  evidence.snapshotSha256 = digest(JSON.stringify(fixture));
  await atomicJson("fixture.json", fixture);
  for (const backend of (backendFilter ? [backendFilter] : ["canvas-2d", "three-voxel"])) {
    console.log(`mounting ${backend}`);
    await page.evaluate(async (name) => {
      window.AISystem6BonsaiCanvasRenderer.dispose(); window.AISystem6BonsaiVoxelRenderer.dispose();
      const stack = document.querySelector("#map"); stack.replaceChildren();
      window.__remasterRenderer = name === "canvas-2d" ? window.AISystem6BonsaiCanvasRenderer : window.AISystem6BonsaiVoxelRenderer;
      await window.__remasterRenderer.mount(stack);
      window.__remasterRenderer.resize(1024, 720, 1);
    }, backend);
    for (const scene of scenes.filter((entry) => !sceneFilter || entry.id === sceneFilter)) for (const rotation of (full ? [0, 1, 2, 3] : [0])) for (const season of (full ? [0, 1, 2, 3] : [1])) for (const night of (timeFilter ? [timeFilter === "night"] : [false, true])) {
      console.log(`rendering ${scene.id} ${backend} r${rotation} s${season} ${night ? "night" : "day"}`);
      const errorStart = errors.length;
      const result = await page.evaluate(async ({ scene, rotation, season, night }) => {
        const renderer = window.__remasterRenderer;
        const snapshot = structuredClone(window.__remasterSnapshot);
        // These are view fixture variants, never simulated city progression.
        snapshot.tick = season * 375 + 75;
        snapshot.timeOfDay = night ? 0.05 : 0.5;
        snapshot.rev = 100 + season * 2 + Number(night);
        window.__remasterActive = snapshot;
        renderer.resetView({ ...scene, rotation, size: snapshot.size });
        await renderer.mount(document.querySelector("#map"));
        renderer.render(snapshot);
        const cpuMs = []; const rafMs = []; let previous = null;
        for (let n = 0; n < 12; n += 1) {
          const time = await new Promise((resolve) => { const timeout = setTimeout(() => resolve(null), 2000); requestAnimationFrame((value) => { clearTimeout(timeout); resolve(value); }); });
          if (time === null) break;
          if (previous !== null) rafMs.push(time - previous); previous = time;
          const start = performance.now(); renderer.render(snapshot); cpuMs.push(performance.now() - start);
        }
        const canvas = [...document.querySelectorAll("canvas")].find((node) => node.getContext("webgl2"));
        let glInfo = null;
        if (canvas) {
          const gl = canvas.getContext("webgl2"); const extension = gl.getExtension("WEBGL_debug_renderer_info");
          glInfo = { renderer: gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER), vendor: gl.getParameter(extension ? extension.UNMASKED_VENDOR_WEBGL : gl.VENDOR), version: gl.getParameter(gl.VERSION) };
        }
        return { stats: renderer.debugStats(), cpuRenderMs: cpuMs, animationFrameIntervalsMs: rafMs, timingUnavailable: cpuMs.length === 0 ? "No animation frame within 2s" : null, gl: glInfo, tick: snapshot.tick, timeOfDay: snapshot.timeOfDay };
      }, { scene, rotation, season, night });
      console.log(`rendered ${scene.id}; RAF samples ${result.animationFrameIntervalsMs.length}`);
      const id = `${scene.id}-${backend}-r${rotation}-s${season}-${night ? "night" : "day"}`;
      const temporary = join(output, `${id}.png.tmp`);
      let captureTimeout;
      const screenshot = await Promise.race([cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }), new Promise((_resolve, reject) => { captureTimeout = setTimeout(() => reject(new Error("Chromium screenshot exceeded 60s")), 60000); })]).finally(() => clearTimeout(captureTimeout));
      await writeFile(temporary, Buffer.from(screenshot.data, "base64"));
      await rename(temporary, join(output, `${id}.png`));
      rows.push({ id, file: `${id}.png`, scene: scene.id, backend, rotation, season, night, snapshotSha256: evidence.snapshotSha256, camera: { center: scene.center, zoom: scene.zoom }, ...result, errors: errors.slice(errorStart) });
      await atomicJson("evidence.json", evidence);
      console.log(`captured ${id}`);
    }
  }
  evidence.complete = errors.length === 0;
  if (errors.length) process.exitCode = 1;
} catch (error) {
  evidence.complete = false;
  errors.push({ type: "capture", message: error.stack || String(error) });
  process.exitCode = 1;
} finally {
  await atomicJson("evidence.json", evidence);
  await browser.close();
}
console.log(`${rows.length} captures; ${errors.length} errors; evidence: ${join(output, "evidence.json")}`);
