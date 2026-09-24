#!/usr/bin/env node
// The iPhone home-screen web app: does the desk actually appear?
//
// Why this instrument exists. The product's phone audience is iOS Safari and
// every home-screen web app on iOS — `FORM-FACTORS.md` makes the phone a first
// class surface, `CLASSIC_PLATINUM_FIDELITY.md` lists "iOS standalone/home-screen
// safe area" as a required acceptance viewport, and `apps/desktop/index.html`
// declares `apple-mobile-web-app-capable`. Every instrument the repository owns
// reaches the *browser* surface instead: `verify-device-matrix` drives Playwright
// WebKit at phone geometries and `verify-display-corners` injects `--safe-area-*`
// by hand, and neither can install a web clip or raise the software keyboard.
// Measured on 2026-09-22 with `baguette` on an iPhone Air (iOS 26.5): Safari in
// browser mode reports `env(safe-area-inset-*)` of 0/0/0/0 — Safari owns that
// band, not the page — so the hand-injected insets model the home-screen
// surface, and only a real web clip reports the real ones.
//
// Three things this surface taught the hard way, all now built in:
//
//   - The home-screen web app runs a service worker whose caches are keyed on
//     the build stamp, and the navigation is part of that cache. A clip created
//     before a change keeps serving the shell it cached; only the app's own
//     version check (which needs `/api/version` to answer) moves it forward. So
//     the server must be up, the receipt records the build it served, and a
//     verdict here is about that build. The launch is run twice for the same
//     reason: the first launch is where a pending shell update is adopted.
//   - The springboard reports itself as an accessibility application with a
//     blank label. A read that lands before the icon tap measures the home
//     screen, not the product, so every standalone read waits for a named
//     frontmost application.
//   - `baguette describe-ui` can name the springboard as the frontmost
//     application while the web app is on screen and painting. The verdict
//     therefore comes from the screenshot, not the accessibility tree: the desk
//     band under the status area must carry ink, the same way Safari's copy of
//     that band does. The accessibility tree is still used to *find* things to
//     tap (a home-screen icon, the composer), never to decide the outcome.
//
//   - The home-screen app and Safari share one WebKit store for this origin
//     (both live in SafariViewService's WebsiteData), so a desk the tool left in
//     a session — a draft window, say — comes back on the next launch and the
//     two surfaces can disagree about which window is in front. `--reset-state`
//     clears that store first, which is what a repeatable acceptance run wants;
//     it is opt-in because it also clears the simulator's Safari data for this
//     origin. Without it, the run measures whatever session the clip is holding.
//
// So this tool drives the real thing: it boots a real iPhone simulator, opens
// the app as a home-screen web app, and asks whether desk content is painted
// inside the visible area. It is an instrument, not a condition — it needs
// Xcode, a simulator and `baguette`, so it is run on demand (see
// `tooling/gate-waivers.json`) when a change touches the standalone surface,
// the safe areas, the soft keyboard or touch semantics.
//
// Usage:
//   npm run verify:ios-standalone
//   node tooling/verify-ios-standalone.mjs [--device "iPhone Air"] [--url http://localhost:4173/]
//                                         [--out <dir>] [--keep-server] [--create-clip]
//
// Prerequisites, once per machine: `brew install baguette` and Xcode 26 with an
// iOS 26 runtime. Once per simulator: the home-screen web clip (the tool walks
// Safari's Add to Home Screen flow with `--create-clip`, and prints the manual
// steps when it cannot). The developer clip is created against the product's own
// URL and port — the clip stores that URL, so the server must answer on
// `--url`'s port, which is what `npm start` and `node apps/server/server.js` do.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");

// The status bar, the Dynamic Island and the software keyboard belong to the
// system, not to the desk. Everything else with a label is product surface.
// The desk band: the strip that holds the menu bar and the window title bar on
// a phone. A launch that paints only the composer and the keyboard is the
// failure this tool exists to catch, and it leaves this strip blank while a
// healthy desk puts text and window chrome in it.
const BAND_TOP = 0.07; // share of screen height
const BAND_BOTTOM = 0.22;
const INK_LEVEL = 160; // luminance below this counts as ink
const MIN_INK = 200; // sampled dark pixels in the band
const BASELINE_SHARE = 0.15; // the home screen must reach this share of Safari's ink
const PROFILE_MATCH = 0.6; // how closely the band's ink must follow Safari's rows
const KEYBOARD_SHIFT = 0.05; // share of the lower screen a raised keyboard must repaint

function parseArgs(argv) {
  const args = {
    device: "iPhone Air",
    url: "http://localhost:4173/",
    out: join(root, "dist", "verification", "ios-standalone"),
    keepServer: false,
    createClip: false,
    resetState: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--device") args.device = String(argv[++index] || args.device);
    else if (flag === "--url") args.url = String(argv[++index] || args.url);
    else if (flag === "--out") args.out = String(argv[++index] || args.out);
    else if (flag === "--keep-server") args.keepServer = true;
    else if (flag === "--create-clip") args.createClip = true;
    else if (flag === "--reset-state") args.resetState = true;
    else if (flag === "-h" || flag === "--help") args.help = true;
    else throw new Error(`unknown flag ${flag}`);
  }
  return args;
}

function run(command, args, options = {}) {
  try {
    const stdout = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
    return { ok: true, stdout: String(stdout) };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || error.message || ""),
    };
  }
}

const sleep = (ms) => new Promise((wait) => setTimeout(wait, ms));

function requireBaguette() {
  const found = run("/bin/zsh", ["-lc", "command -v baguette"]);
  if (found.ok && found.stdout.trim()) return found.stdout.trim();
  console.error([
    "ios-standalone: `baguette` is not on PATH.",
    "It is the only thing that can drive a real iOS simulator without Xcode's UI:",
    "",
    "  /opt/homebrew/bin/brew install baguette",
    "",
    "Apple Silicon, Xcode 26, macOS 15+ (see https://github.com/tddworks/baguette).",
  ].join("\n"));
  process.exit(1);
}

function pickDevice(name) {
  const listed = run("baguette", ["list", "--json"]);
  if (!listed.ok) throw new Error(`baguette list failed: ${listed.stderr || listed.stdout}`);
  const { running = [], available = [] } = JSON.parse(listed.stdout);
  const isPhone = (device) => /iPhone/.test(device.name);
  const booted = running.filter(isPhone);
  if (booted.length) return { ...booted[0], alreadyBooted: true };
  const candidates = available.filter((device) => isPhone(device) && device.name === name);
  const pool = candidates.length ? candidates : available.filter(isPhone);
  if (!pool.length) throw new Error(`no ${name} simulator is available in this Xcode install`);
  // Newest runtime first: "iOS 26.5" sorts above "iOS 26.4" as a string here.
  pool.sort((left, right) => String(right.runtime).localeCompare(String(left.runtime)));
  return { ...pool[0], alreadyBooted: false };
}

async function ensureBooted(device) {
  if (device.alreadyBooted) return;
  const booted = run("baguette", ["boot", "--udid", device.udid], { timeout: 240000 });
  if (!booted.ok) throw new Error(`baguette boot failed: ${booted.stderr || booted.stdout}`);
}

function serverReady(url) {
  const healthz = new URL("/healthz", url).toString();
  return run("curl", ["-fsS", "-m", "2", healthz]).ok;
}

async function servedBuild(url) {
  const response = await fetch(new URL("/app/generated/build-info.js", url)).catch(() => null);
  if (!response?.ok) return "";
  const body = await response.text();
  return (body.match(/"build"\s*:\s*"([^"]+)"/) || [])[1] || "";
}

async function ensureServer(url, keepServer) {
  if (serverReady(url)) return { child: null, started: false };
  if (!existsSync(join(root, "apps", "desktop", "app.bundle.js"))) {
    throw new Error("apps/desktop/app.bundle.js is missing — run `npm run build:app` first");
  }
  const port = new URL(url).port || "80";
  const child = spawn(process.execPath, ["apps/server/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: port },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (serverReady(url)) return { child: keepServer ? null : child, started: true, detached: keepServer };
    if (child.exitCode !== null) break;
    await sleep(300);
  }
  child.kill("SIGTERM");
  throw new Error(`the app server never answered on ${url}\n${output.trim().split("\n").slice(-6).join("\n")}`);
}

// The home-screen web clip is a real installed bundle; its Info.plist carries
// `manifestId`, the exact URL it was created for. That is how this tool knows a
// clip exists for *this* build rather than for some other port or app.
function findWebClip(udid, url) {
  const applications = join(
    homedir(), "Library", "Developer", "CoreSimulator", "Devices", udid,
    "data", "Containers", "Bundle", "Application",
  );
  if (!existsSync(applications)) return null;
  const wanted = url.replace(/\/+$/, "/");
  for (const container of readdirSync(applications)) {
    const bundleRoot = join(applications, container);
    let entries = [];
    try {
      entries = readdirSync(bundleRoot);
    } catch {
      continue;
    }
    const app = entries.find((entry) => entry.endsWith(".app"));
    if (!app) continue;
    const plist = join(bundleRoot, app, "Info.plist");
    if (!existsSync(plist)) continue;
    const printed = run("plutil", ["-p", plist]);
    if (!printed.ok) continue;
    const bundleId = printed.stdout.match(/"CFBundleIdentifier"\s*=>\s*"(com\.apple\.WebKit\.PushBundle\.[0-9A-Fa-f]+)"/);
    const manifest = printed.stdout.match(/"manifestId"\s*=>\s*"([^"]+)"/);
    if (!bundleId || !manifest) continue;
    if (manifest[1].replace(/\/+$/, "/") !== wanted) continue;
    const name = printed.stdout.match(/"CFBundleDisplayName"\s*=>\s*"([^"]+)"/);
    return { bundleId: bundleId[1], name: name ? name[1] : "the app", manifestId: manifest[1] };
  }
  return null;
}

// The web app's own storage for this origin: WebKit keeps it in the shared
// SafariViewService container, which is why Safari and the home-screen clip see
// the same session. Clearing it is the only way to open on a first run.
function clearWebKitState(udid) {
  const containers = join(
    homedir(), "Library", "Developer", "CoreSimulator", "Devices", udid,
    "data", "Containers", "Data", "Application",
  );
  if (!existsSync(containers)) return 0;
  let cleared = 0;
  for (const container of readdirSync(containers)) {
    const store = join(containers, container, "Library", "WebKit");
    if (!existsSync(store)) continue;
    for (const service of readdirSync(store)) {
      const data = join(store, service, "WebsiteData");
      if (existsSync(data)) {
        rmSync(data, { recursive: true, force: true });
        cleared += 1;
      }
    }
  }
  return cleared;
}

function readTree(udid, file) {
  const described = run("baguette", ["describe-ui", "--udid", udid, "-o", file]);
  if (!described.ok || !existsSync(file)) return null;
  try {
    return JSON.parse(execFileSync("cat", [file], { encoding: "utf8" }));
  } catch {
    return null;
  }
}

function flatten(node, out = []) {
  out.push(node);
  for (const child of node.children || []) flatten(child, out);
  return out;
}

function labelledNodes(tree) {
  if (!tree) return [];
  return flatten(tree)
    .map((node) => ({
      role: node.role || "",
      label: String(node.label || node.title || "").trim(),
      frame: node.frame || {},
    }))
    .filter((node) => node.label.length > 0);
}

// The springboard reports itself as an AXApplication with a blank label; the
// browser and the home-screen web app name themselves. Reading the tree before
// the icon tap has landed measures the home screen instead of the product, so
// every standalone read waits for the frontmost application to stop being the
// springboard.
function frontmostApp(tree) {
  return tree ? String(tree.label || tree.title || "").trim() : "";
}

function tapNode(udid, device, node) {
  const frame = node.frame || {};
  const x = Math.round(frame.x + frame.width / 2);
  const y = Math.round(frame.y + frame.height / 2);
  return run("baguette", [
    "tap", "--udid", udid,
    "--x", String(x), "--y", String(y),
    "--width", String(device.screen.width), "--height", String(device.screen.height),
  ]);
}

// Safari's own chrome is exposed to the accessibility tree, so the Add to Home
// Screen walk can be label-driven instead of coordinate-driven — it survives a
// layout change and reads on both an English and a Chinese simulator.
async function tapLabel(udid, device, tree, patterns, options = {}) {
  const matches = labelledNodes(tree).filter(
    (node) => patterns.some((pattern) => pattern.test(node.label)),
  );
  if (!matches.length) return false;
  const chosen = options.bottomMost
    ? matches.reduce((best, node) => ((node.frame.y || 0) > (best.frame.y || 0) ? node : best))
    : matches[0];
  const tapped = tapNode(udid, device, chosen);
  if (!tapped.ok) return false;
  await sleep(options.settle ?? 1500);
  return true;
}

async function createWebClip(udid, device, url, scratch) {
  console.log("ios-standalone: no web clip for this URL — walking Safari's Add to Home Screen flow");
  run("baguette", ["openurl", "--udid", udid, url]);
  await sleep(6000);
  let tree = readTree(udid, join(scratch, "clip-1-menu.json"));
  // The page menu is the rightmost control in Safari's bottom toolbar.
  await tapLabel(udid, device, tree, [/^更多$/, /^More$/], { bottomMost: true, settle: 2000 });
  tree = readTree(udid, join(scratch, "clip-2-share.json"));
  await tapLabel(udid, device, tree, [/^分享$/, /^Share$/], { settle: 2500 });
  tree = readTree(udid, join(scratch, "clip-3-actions.json"));
  if (!labelledNodes(tree).some((node) => /加入主畫面|Add to Home Screen/.test(node.label))) {
    await tapLabel(udid, device, tree, [/^檢視更多$/, /^Show More$/, /^More$/], { bottomMost: true, settle: 2000 });
    tree = readTree(udid, join(scratch, "clip-4-more.json"));
  }
  const offered = await tapLabel(udid, device, tree, [/加入主畫面/, /Add to Home Screen/], { settle: 2500 });
  if (!offered) return false;
  tree = readTree(udid, join(scratch, "clip-5-confirm.json"));
  const confirmed = await tapLabel(udid, device, tree, [/^加入$/, /^Add$/], { settle: 2500 });
  if (!confirmed) return false;
  run("baguette", ["press", "--udid", udid, "--button", "home"]);
  await sleep(2000);
  return Boolean(findWebClip(udid, url));
}

// Safari's chrome is the tell: while it is on screen the springboard has not
// arrived yet, and reading the tree too early is how a launch step silently
// looks at the wrong surface. Waiting for the tell to disappear is what makes
// the icon tap land on the home screen rather than inside the browser.
const BROWSER_CHROME = /^(網址|URL|重新整理|Reload|頁面選單|Page Menu|返回|Back|分享|Share)$/;

async function readSpringboard(udid, scratch, tag, attempts = 8) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = readTree(udid, join(scratch, `${tag}-${attempt}.json`));
    const labels = labelledNodes(last).map((node) => node.label);
    if (labels.length && !labels.some((label) => BROWSER_CHROME.test(label))) return { ready: true, tree: last };
    await sleep(1200);
  }
  return { ready: false, tree: last };
}

// Tapping a home-screen icon needs the icon's whereabouts, and the springboard's
// accessibility tree is the reliable place to find it — the tree names each icon
// and its frame. What the tree is *not* reliable for is "who is in front": it has
// named the springboard while the web app was on screen and painting. So the tap
// is found here and judged by pixels in the caller, never by a frontmost read.
async function launchFromHomeScreen(udid, device, clipName, scratch, tag) {
  // The Home press is occasionally swallowed (measured: Safari stayed in front
  // with its own toolbar on screen after a press that reported ok). Confirm the
  // browser chrome is gone before believing we are on the home screen.
  // The springboard is the one surface that reports no application name at all
  // (its accessibility root is blank), so that — not merely "no browser chrome"
  // — is what says we are home. Without it the app's own tree passes the test,
  // and the icon search below then finds a "System 6" *inside the app* and taps
  // the page instead of the home screen.
  let arrived = false;
  for (let attempt = 0; attempt < 4 && !arrived; attempt += 1) {
    run("baguette", ["press", "--udid", udid, "--button", "home"]);
    await sleep(2500);
    const tree = readTree(udid, join(scratch, `${tag}-home-try${attempt}.json`));
    const labels = labelledNodes(tree).map((node) => node.label);
    arrived = labels.length > 0 && !frontmostApp(tree);
  }
  if (!arrived) return { tapped: false, home: null };
  const home = await capture(udid, join(scratch, `${tag}-home.png`));
  for (let page = 0; page < 4; page += 1) {
    const tree = readTree(udid, join(scratch, `${tag}-home-${page}.json`));
    // A springboard left in icon-edit mode answers a tap with nothing at all —
    // its "Done" button is the way out, and it is offered only in that mode.
    const done = labelledNodes(tree).find((node) => /^(完成|Done)$/.test(node.label));
    if (done) {
      tapNode(udid, device, done);
      await sleep(2000);
      continue;
    }
    const icon = labelledNodes(tree).find((node) => node.label === clipName
      && node.role === "AXButton"
      && Number(node.frame.width || 0) >= 60
      && Number(node.frame.height || 0) >= 60);
    if (icon) {
      tapNode(udid, device, icon);
      await sleep(4000);
      return { tapped: true, home };
    }
    run("baguette", [
      "swipe", "--udid", udid,
      "--start-x", String(Math.round(device.screen.width * 0.9)),
      "--start-y", String(Math.round(device.screen.height * 0.5)),
      "--end-x", String(Math.round(device.screen.width * 0.1)),
      "--end-y", String(Math.round(device.screen.height * 0.5)),
      "--width", String(device.screen.width), "--height", String(device.screen.height),
      "--duration", "0.3",
    ]);
    await sleep(1800);
  }
  return { tapped: false, home };
}

// ---- the verdict: pixels, not the accessibility tree -----------------------

async function pixelsOf(path) {
  const image = await loadImage(path);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  return { width: image.width, height: image.height, data };
}

function luminance(pixels, x, y) {
  const index = (y * pixels.width + x) * 4;
  return 0.299 * pixels.data[index] + 0.587 * pixels.data[index + 1] + 0.114 * pixels.data[index + 2];
}

// Ink is what a painted desk has and a blank one does not: menu-bar labels, the
// window title bar's rules and title, a dialog's border. Sampling every other
// column keeps this cheap enough to run on every phase of the run.
function bandInk(pixels, screen) {
  const scale = pixels.height / screen.height;
  const first = Math.max(0, Math.round(screen.height * BAND_TOP * scale));
  const last = Math.min(pixels.height, Math.round(screen.height * BAND_BOTTOM * scale));
  let dark = 0;
  let sampled = 0;
  for (let y = first; y < last; y += 1) {
    for (let x = 0; x < pixels.width; x += 2) {
      if (luminance(pixels, x, y) < INK_LEVEL) dark += 1;
      sampled += 1;
    }
  }
  return { dark, sampled };
}

// The band's shape, one ink count per row. Ink alone cannot tell a painted desk
// from a launch splash or the home screen — both are inky. The desk's rows have
// the same shape as Safari's copy of the same build (a status bar, then a menu
// bar, then a window title bar), so the shape is what gets compared.
function bandRows(pixels, screen) {
  const scale = pixels.height / screen.height;
  const first = Math.max(0, Math.round(screen.height * BAND_TOP * scale));
  const last = Math.min(pixels.height, Math.round(screen.height * BAND_BOTTOM * scale));
  const rows = [];
  for (let y = first; y < last; y += 1) {
    let dark = 0;
    for (let x = 0; x < pixels.width; x += 2) {
      if (luminance(pixels, x, y) < INK_LEVEL) dark += 1;
    }
    rows.push(dark);
  }
  return rows;
}

function profileMatch(reference, candidate) {
  const length = Math.min(reference.length, candidate.length);
  if (!length) return 0;
  let dot = 0;
  let left = 0;
  let right = 0;
  for (let index = 0; index < length; index += 1) {
    dot += reference[index] * candidate[index];
    left += reference[index] ** 2;
    right += candidate[index] ** 2;
  }
  if (!left || !right) return 0;
  return dot / Math.sqrt(left * right);
}

function shareDifferent(before, after, fromRow) {
  let changed = 0;
  let sampled = 0;
  for (let y = fromRow; y < after.height; y += 2) {
    for (let x = 0; x < after.width; x += 2) {
      if (Math.abs(luminance(before, x, y) - luminance(after, x, y)) > 24) changed += 1;
      sampled += 1;
    }
  }
  return sampled ? changed / sampled : 0;
}

// How much of the lower half changed between two frames. Used only to say
// whether tapping the composer actually raised the keyboard; it is a hint for
// the receipt, never the verdict.
function bottomChanged(before, after) {
  if (!before || !after || before.width !== after.width || before.height !== after.height) return 1;
  return shareDifferent(before, after, Math.round(after.height * 0.55));
}

// How much of a frame differs from another. Used to tell "the icon tap never
// left the home screen" (an instrument problem) from "the app opened onto a
// blank desk" (the product problem this tool exists for) — the two look alike
// in a single screenshot, and only the home screen in both frames separates them.
function frameDifference(before, after) {
  if (!before || !after || before.width !== after.width || before.height !== after.height) return 1;
  return shareDifferent(before, after, 0);
}

// The composer is a wide box whose top border runs almost the whole width. It is
// found in the picture rather than in the accessibility tree, because the tree
// has named the springboard while this app was on screen; a rule that long is
// not something a home screen or a splash draws. Returns device points.
function composerRow(pixels, screen) {
  const scale = pixels.height / screen.height;
  // From the lower half down, and a *full-width* rule: the composer's frame
  // spans the width, while the welcome cards are short rules that also sit in
  // this half (measured: cards 0.5–0.7 of the width, the frame 1.0). Searching
  // from the top of the half found a card, and the tap that followed opened
  // another window instead of the composer.
  const first = Math.round(screen.height * 0.60 * scale);
  const last = Math.round(screen.height * 0.98 * scale);
  const left = Math.round(pixels.width * 0.08);
  const right = Math.round(pixels.width * 0.92);
  for (let y = first; y < last; y += 2) {
    let dark = 0;
    let sampled = 0;
    for (let x = left; x < right; x += 2) {
      if (luminance(pixels, x, y) < INK_LEVEL) dark += 1;
      sampled += 1;
    }
    if (sampled && dark / sampled > 0.85) return y / scale;
  }
  return null;
}

async function capture(udid, path) {
  run("baguette", ["screenshot", "--udid", udid, "--output", path]);
  if (!existsSync(path)) return null;
  return pixelsOf(path).catch(() => null);
}

// A frame is worth judging only once it has stopped moving: the boot splash is
// as inky as the desk, so "something is painted" is not the same as "the desk is
// up". Wait out a minimum, then require the band to be painted *and* the whole
// frame to be unchanged from the frame before it.
async function waitForStableInk(udid, screen, scratch, tag, floor, { minWaitMs = 12000, attempts = 14 } = {}) {
  const started = Date.now();
  let previous = null;
  let last = null;
  let path = join(scratch, `${tag}-0.png`);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    path = join(scratch, `${tag}-${attempt}.png`);
    last = await capture(udid, path);
    const ink = last ? bandInk(last, screen).dark : 0;
    const settled = previous && last ? frameDifference(previous, last) < 0.02 : false;
    if (last && ink >= floor && settled && Date.now() - started >= minWaitMs) {
      return { pixels: last, path, attempts: attempt + 1 };
    }
    previous = last;
    await sleep(2500);
  }
  return { pixels: last, path, attempts };
}

// The insets a real web clip reports, in points. Only the geometry phase needs
// them: it runs the app in WebKit at the clip's own viewport, where env() reports
// 0/0/0/0 because a browser is not a web clip, and injects these instead — the
// same trick verify-display-corners uses for the display's corners. Landscape
// turns the portrait top inset into the two side insets and keeps a shorter
// bottom one, which is what iOS does on an iPhone.
const STANDALONE_INSETS = {
  "iPhone Air": { top: 59, bottom: 34 },
  "iPhone 17": { top: 59, bottom: 34 },
  "iPhone 17 Pro": { top: 62, bottom: 34 },
  "iPhone 17 Pro Max": { top: 62, bottom: 34 },
  "iPhone 17e": { top: 47, bottom: 34 },
};

function standaloneInsets(deviceName) {
  return STANDALONE_INSETS[deviceName] || STANDALONE_INSETS["iPhone Air"];
}

/**
 * Is the status band the app's own chrome, and is that chrome solid?
 *
 * A home-screen web app gets a blur painted across the top of the screen by the
 * system, and the shape of what you see is whatever the app's bar lets through:
 * over a flat, opaque strip the blur has nothing to work with and reads as
 * nothing at all; over a translucent material it is the desk showing through,
 * which is the washed band the owner reported (MacRumors thread "iOS 27 PWA
 * blurred across top of screen", and the reply that traced it to a bar whose
 * background is not fully opaque).
 *
 * So the question is asked of pixels, not of style declarations: put a black
 * backdrop behind the bar, photograph the band, swap it for a white one, and
 * photograph it again. Byte-identical photographs mean the band does not show
 * what is behind it. Style reading cannot answer this — a bar can be opaque by
 * an image whose colours happen to be solid (Aqua's pinstripes) or translucent
 * by a colour (Liquid Glass's 0.9 white).
 *
 * @returns {Promise<{tested: boolean, opaque?: boolean, reason?: string}>}
 */
async function bandProbe(page, orientation) {
  if (!orientation.box.top) return { tested: false, reason: "the surface reports no top inset" };
  await page.evaluate(() => {
    if (document.getElementById("standalone-band-probe")) return;
    const back = document.createElement("div");
    back.id = "standalone-band-probe";
    // Below the menu bar's own stacking token and above the desk, so the bar
    // composites over it exactly as it composites over the wallpaper.
    back.style.cssText = "position:fixed;inset:0;z-index:5;background:#000;pointer-events:none";
    document.body.prepend(back);
  });
  const clip = { x: 0, y: 0, width: orientation.width, height: Math.max(8, Math.round(orientation.box.top)) };
  const shot = async (color) => {
    await page.evaluate((value) => { document.getElementById("standalone-band-probe").style.background = value; }, color);
    await page.waitForTimeout(120);
    return page.screenshot({ clip });
  };
  const dark = await shot("#000000");
  const light = await shot("#ffffff");
  await page.evaluate(() => document.getElementById("standalone-band-probe")?.remove());
  return { tested: true, opaque: Buffer.compare(dark, light) === 0 };
}

/**
 * Two identical reads in a row, before any geometry verdict.
 *
 * The phase asks whether a control is reachable at rest. A reading taken while
 * the window is still growing to its full-screen size measures the animation
 * instead of the layout, which is how the same 44px resize box was reported as
 * 16x16 on the tablet in one run and measured at 44x44 in every hand-made
 * replication. Settling first is not a loosened assertion: a control that is
 * genuinely too small stays too small at rest, and still fails.
 *
 * @returns {Promise<boolean>} whether the surface stopped moving within the window
 */
async function settleGeometry(page, timeoutMs = 2000) {
  // Animations off first. A geometry verdict is about the layout at rest, and
  // `getBoundingClientRect` reports a transformed box: the window (or the face
  // inside it) animates in with a scale, and an audit that reads rects while
  // that runs measures the animation. That is the most likely reason the same
  // 44px box came back as 44x40, 16x16 and 13x13 on three runs of one state.
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  }).catch(() => {});
  const until = Date.now() + timeoutMs;
  let previous = "";
  while (Date.now() < until) {
    const reading = await page.evaluate(() => {
      const win = document.querySelector('.window[data-window="oneMoreTune"]');
      if (!win) return "";
      const box = win.querySelector(".resize-box")?.getBoundingClientRect();
      const bar = win.querySelector(".title-bar")?.getBoundingClientRect();
      const pane = win.querySelector(".one-more-tune-pane");
      return [
        Math.round(box?.width || 0), Math.round(box?.height || 0), Math.round(box?.top || 0),
        Math.round(bar?.top || 0), Math.round(win.getBoundingClientRect().height),
        pane ? pane.scrollHeight : 0,
      ].join("|");
    }).catch(() => "");
    if (reading && reading === previous) return true;
    previous = reading;
    await new Promise((wait) => setTimeout(wait, 120));
  }
  return false;
}

/**
 * The standalone geometry phase: what the layout must guarantee once the real
 * insets are in play.
 *
 * The device phase above answers "does the desk paint?" from pixels, and it
 * cannot answer "is anything under the home indicator" — the accessibility tree
 * carries no computed styles, and a photograph cannot tell a control 20px from
 * the edge from one under a 34px inset. This phase runs the same build in WebKit
 * at the clip's own viewport with the device's insets injected and asks the three
 * questions a person feels: is a control under the notch or the indicator, is the
 * game's own explanation cut off, and are the controls thumb-sized. It is a
 * browser phase on purpose, and its scope is exactly that: the layout half of
 * the standalone surface, not a second verdict about Safari.
 */
async function geometryPhase({ url, deviceName, screen, scratch, summary, failures }) {
  const { webkit } = require("playwright");
  const insets = standaloneInsets(deviceName);
  const orientations = [
    {
      name: "portrait",
      width: screen.width,
      height: screen.height,
      box: { top: insets.top, bottom: insets.bottom, left: 0, right: 0 },
    },
    {
      name: "landscape",
      width: screen.height,
      height: screen.width,
      box: { top: 0, bottom: Math.min(insets.bottom, 21), left: insets.top, right: insets.top },
    },
    // The tablet, which is not the phone's screen at another size: a 12.9" iPad
    // reports a 24pt top inset and its layout never enters the phone's portrait
    // query. Measured 2026-09-23 — before the installed-surface rule covered it,
    // the bar stayed 44px tall in flow with no top padding and the first menu
    // button began at y=1, so the clock and the battery were painted over
    // 文件 / 编辑 / 对话 / 特别 in all eight appearances. The phase injects
    // insets, so it can ask this of a tablet without one on the bench.
    {
      name: "ipad",
      width: 1024,
      height: 1366,
      box: { top: 24, bottom: 20, left: 0, right: 0 },
    },
  ];
  const measured = [];
  const browser = await webkit.launch();
  try {
    for (const orientation of orientations) {
      const context = await browser.newContext({
        viewport: { width: orientation.width, height: orientation.height },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error.message).slice(0, 160)));
      // The app asks the platform which surface it is on, so the phase answers
      // the same question the same way: a web clip reports navigator.standalone,
      // and WebKit in a browser never does.
      await page.addInitScript(() => {
        try {
          Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
        } catch {
          // A browser that refuses the property is not a web clip.
        }
      });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !document.body.classList.contains("is-booting"), null, { timeout: 120000 });
      await page.addStyleTag({
        content: `:root{--safe-area-top:${orientation.box.top}px;--safe-area-bottom:${orientation.box.bottom}px;`
          + `--safe-area-left:${orientation.box.left}px;--safe-area-right:${orientation.box.right}px;}`,
      });
      await page.evaluate(() => handleAction("open-assistant"));
      await page.waitForTimeout(700);

      const audit = (box) => page.evaluate((insetBox) => {
        const height = window.innerHeight;
        const descriptor = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${String(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 16)}"`;
        // Every style read happens before every rect read, on purpose.
        //
        // This used to interleave them (a `getComputedStyle` per ancestor inside
        // a per-control rect walk), and the readings were not stable: two runs of
        // one state gave "close 44x40, zoom 44x40, grow 28x28" and then only a
        // position finding, while a three-control replication of the same
        // function printed 44x44 everywhere. The reason is in this app:
        // `app/core/window-frame-bars.js` observes each window with a
        // ResizeObserver and rewrites its frame bars from the callback. Reading
        // layout flushes pending style work, that flush can deliver the observer,
        // and the callback mutates the very window being measured — so a long
        // sweep can mix a before-callback layout with an after-callback one.
        // Reading all styles first, then all rects in one uninterrupted pass,
        // gives one snapshot; the assertions themselves are unchanged.
        const candidates = [...document.querySelectorAll("button, [role='button'], input, select, textarea, .choice, .rating")]
          .map((el) => {
            const style = getComputedStyle(el);
            const clips = [];
            let node = el.parentElement;
            while (node && node !== document.body) {
              const parentStyle = getComputedStyle(node);
              if (/(auto|scroll|hidden|clip)/.test(parentStyle.overflowY) || /(auto|scroll|hidden|clip)/.test(parentStyle.overflowX)) clips.push(node);
              node = node.parentElement;
            }
            return { el, style, clips };
          })
          .filter(({ el, style }) => style.visibility !== "hidden" && style.display !== "none" && !el.closest(".is-hidden"));
        // One layout flush, no style reads in between: the rects all describe the
        // same frame.
        const controls = [];
        for (const candidate of candidates) {
          let rect = candidate.el.getBoundingClientRect();
          if (rect.width < 4 || rect.height < 4) continue;
          for (const node of candidate.clips) {
            const clip = node.getBoundingClientRect();
            const top = Math.max(rect.top, clip.top);
            const bottom = Math.min(rect.bottom, clip.bottom);
            const left = Math.max(rect.left, clip.left);
            const right = Math.min(rect.right, clip.right);
            rect = { top, bottom, left, right, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
          }
          if (rect.width < 4 || rect.height < 4) continue;
          controls.push({ el: candidate.el, rect });
        }
        const win = document.querySelector('.window[data-window="oneMoreTune"]');
        const pane = win?.querySelector(".one-more-tune-pane");
        // The round's reveal names the record in its liner notes: the song, who
        // played it, where it aired and the two ways out.
        const explanation = win?.querySelector('.omt-room[data-omt-phase="reveal"] .omt-notes');
        return {
          installedHook: document.documentElement.hasAttribute("data-installed"),
          // The status band itself: is it the app's own chrome, and is that
          // chrome solid? A web clip gets a system blur across the top of the
          // screen, and the shape of that blur is whatever the bar lets through.
          barBand: (() => {
            const bar = document.querySelector(".menu-bar");
            if (!bar) return null;
            const rect = bar.getBoundingClientRect();
            const style = getComputedStyle(bar);
            return {
              height: Math.round(rect.height),
              position: style.position,
              coversInset: rect.top <= 0.5 && rect.bottom >= insetBox.top - 1,
            };
          })(),
          underBottomInset: controls.filter(({ rect }) => rect.bottom > height - insetBox.bottom + 1).map(({ el }) => descriptor(el)),
          aboveTopInset: controls.filter(({ rect }) => rect.top < insetBox.top - 1).map(({ el }) => descriptor(el)),
          undersized: controls
            .filter(({ el }) => el.closest('.window[data-window="oneMoreTune"]'))
            // Rounded, because an intersection with a scroll container lands on
            // a fractional pixel: a 44px control measured as 43.99 is the size
            // it is, not a miss.
            .filter(({ rect }) => Math.round(rect.height) < 44)
            .map(({ el, rect }) => `${descriptor(el)} ${Math.round(rect.width)}x${Math.round(rect.height)}`),
          explanation: explanation ? {
            clamp: getComputedStyle(explanation).getPropertyValue("-webkit-line-clamp").trim() || "none",
            truncated: explanation.scrollHeight > explanation.clientHeight + 2,
            characters: explanation.textContent.trim().length,
          } : null,
          sourceLinkVisible: Boolean(win?.querySelector('.omt-room[data-omt-phase="reveal"] .omt-links :is(a, button)')?.getBoundingClientRect().height),
          horizontalOverflow: pane ? pane.scrollWidth > pane.clientWidth + 2 : false,
        };
      }, box);

      await page.evaluate(() => handleAction("open-one-more-tune"));
      await page.waitForSelector('[data-one-more-tune-view="challenge"]', { timeout: 60000 });
      await page.click('[data-one-more-tune-view="challenge"]');
      await page.waitForTimeout(400);
      await settleGeometry(page);
      const desk = await audit(orientation.box);
      if (process.env.OMT_GEOMETRY_DEBUG) {
        console.log(`    [debug ${orientation.name}] ${await page.evaluate(() => {
          const win = document.querySelector('.window[data-window="oneMoreTune"]');
          const box = win?.querySelector(".resize-box");
          const bar = win?.querySelector(".title-bar");
          const raw = box?.getBoundingClientRect();
          const close = win?.querySelector(".close-box");
          const closeRect = close?.getBoundingClientRect();
          return `theme=${document.body.dataset.theme || "?"} installed=${document.documentElement.hasAttribute("data-installed")} coarse=${matchMedia("(hover: none) and (pointer: coarse)").matches} win=${Math.round(win?.getBoundingClientRect().width)}x${Math.round(win?.getBoundingClientRect().height)} bar=${Math.round(bar?.getBoundingClientRect().height)} box=${Math.round(raw?.width)}x${Math.round(raw?.height)}@${Math.round(raw?.top)} close=${Math.round(closeRect?.width)}x${Math.round(closeRect?.height)} closeToken=${close ? getComputedStyle(close).getPropertyValue("--system-titlebar-control-size").trim() : "-"}`;
        })}`);
        // The same two numbers the audit would report, printed beside the raw
        // box: raw rect vs the rect after `visibleRect()` walks the ancestors.
        console.log(`    [debug ${orientation.name} filter] ${await page.evaluate(() => {
          const win = document.querySelector('.window[data-window="oneMoreTune"]');
          const visibleRect = (el) => {
            let rect = el.getBoundingClientRect();
            let node = el.parentElement;
            while (node && node !== document.body) {
              const style = getComputedStyle(node);
              if (/(auto|scroll|hidden|clip)/.test(style.overflowY) || /(auto|scroll|hidden|clip)/.test(style.overflowX)) {
                const clip = node.getBoundingClientRect();
                const top = Math.max(rect.top, clip.top);
                const bottom = Math.min(rect.bottom, clip.bottom);
                const left = Math.max(rect.left, clip.left);
                const right = Math.min(rect.right, clip.right);
                rect = { top, bottom, left, right, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
              }
              node = node.parentElement;
            }
            return rect;
          };
          const report = (selector) => {
            const el = win?.querySelector(selector);
            if (!el) return `${selector}: none`;
            const raw = el.getBoundingClientRect();
            const seen = visibleRect(el);
            return `${selector.replace(".", "")}=${Math.round(raw.width)}x${Math.round(raw.height)}->${Math.round(seen.width)}x${Math.round(seen.height)}`;
          };
          return [report(".close-box"), report(".resize-box"), report(".grow-box")].join(" ");
        })}`);
      }
      const band = await bandProbe(page, orientation);
      let reveal = null;
      const start = await page.$('[data-one-more-tune-command="one-more-tune-start-round"]');
      if (start) {
        await start.click();
        await page.waitForTimeout(1600);
        const choice = await page.$(".choice");
        if (choice) {
          await choice.click();
          await page.waitForTimeout(1400);
          await settleGeometry(page);
          reveal = await audit(orientation.box);
        }
      }
      // Next Act's reveal is the one that carries an explanation rather than a
      // credit line: it is the sentence a person reads after answering, so it is
      // the text this phase must find whole.
      let line = null;
      const lineTab = await page.$('[data-one-more-tune-view="line"]');
      if (lineTab) {
        await lineTab.click();
        await page.waitForTimeout(300);
        const lineStart = await page.$('[data-one-more-tune-command="one-more-tune-line-start"]');
        if (lineStart) {
          await lineStart.click();
          await page.waitForFunction(() => /1\s*\/\s*10/.test(document.querySelector("#one-more-tune-body")?.innerText || ""), null, { timeout: 60000 });
          await page.waitForTimeout(300);
          const lineChoice = await page.$("[data-one-more-tune-line-answer]");
          if (lineChoice) {
            await lineChoice.click();
            await page.waitForTimeout(900);
          }
          await settleGeometry(page);
          line = await page.evaluate((insetBox) => {
            const height = window.innerHeight;
            const win = document.querySelector('.window[data-window="oneMoreTune"]');
            const explanation = win?.querySelector(".one-more-tune-line .revealbox p");
            const source = win?.querySelector(".one-more-tune-line-source");
            const visibleRect = (el) => {
              let rect = el.getBoundingClientRect();
              let node = el.parentElement;
              while (node && node !== document.body) {
                const style = getComputedStyle(node);
                if (/(auto|scroll|hidden|clip)/.test(style.overflowY) || /(auto|scroll|hidden|clip)/.test(style.overflowX)) {
                  const clip = node.getBoundingClientRect();
                  const top = Math.max(rect.top, clip.top);
                  const bottom = Math.min(rect.bottom, clip.bottom);
                  const left = Math.max(rect.left, clip.left);
                  const right = Math.min(rect.right, clip.right);
                  rect = { top, bottom, left, right, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
                }
                node = node.parentElement;
              }
              return rect;
            };
            const controls = [...(win?.querySelectorAll("button, [role='button'], input") || [])]
              .filter((el) => visibleRect(el).height > 0)
              .map((el) => ({ el, rect: visibleRect(el) }));
            return {
              explanation: explanation ? {
                truncated: explanation.scrollHeight > explanation.clientHeight + 2,
                characters: explanation.textContent.trim().length,
                clamp: getComputedStyle(explanation).getPropertyValue("-webkit-line-clamp").trim() || "none",
              } : null,
              sourceVisible: Boolean(source),
              underneath: controls.filter(({ rect }) => rect.bottom > height - insetBox.bottom + 1).length,
              undersized: controls.filter(({ rect }) => Math.round(rect.height) < 44).length,
            };
          }, orientation.box);
        }
      }
      await page.screenshot({ path: join(scratch, `geometry-${orientation.name}.png`) });

      const state = reveal || desk;
      const findings = [];
      if (!state.installedHook) {
        findings.push("the desk did not mark itself as the installed surface (html[data-installed] is missing)");
      }
      if (state.underBottomInset.length) {
        findings.push(`${state.underBottomInset.length} control(s) inside the ${orientation.box.bottom}px bottom inset — ${state.underBottomInset.slice(0, 3).join(", ")}`);
      }
      if (state.aboveTopInset.length) {
        findings.push(`${state.aboveTopInset.length} control(s) reaching into the ${orientation.box.top}px top inset — ${state.aboveTopInset.slice(0, 3).join(", ")}`);
      }
      if (state.barBand && !state.barBand.coversInset) {
        findings.push(`the menu bar does not cover the ${orientation.box.top}px status band (${state.barBand.height}px tall, ${state.barBand.position})`);
      }
      if (band.tested && !band.opaque) {
        findings.push(`the ${orientation.box.top}px status band is see-through: swapping the desk behind the menu bar for a white one changed what the band photographs`);
      }
      if (state.undersized.length) {
        findings.push(`${state.undersized.length} control(s) in One More Tune under 44px — ${state.undersized.slice(0, 4).join(", ")}`);
      }
      if (state.explanation?.truncated) {
        findings.push(`the reveal's explanation is cut off (${state.explanation.characters} characters, clamp ${state.explanation.clamp})`);
      }
      if (!state.explanation) findings.push("the reveal shows no explanation paragraph at all");
      if (reveal && !reveal.sourceLinkVisible) findings.push("the reveal's source link is not visible");
      if (line) {
        if (!line.explanation) findings.push("Next Act's reveal shows no explanation");
        else if (line.explanation.truncated) {
          findings.push(`Next Act's explanation is cut off (${line.explanation.characters} characters, clamp ${line.explanation.clamp})`);
        }
        if (!line.sourceVisible) findings.push("Next Act's reveal shows no source");
        if (line.underneath) findings.push(`${line.underneath} Next Act control(s) inside the bottom inset`);
        if (line.undersized) findings.push(`${line.undersized} Next Act control(s) under 44px`);
      }
      if (state.horizontalOverflow) findings.push("the One More Tune pane scrolls sideways");
      if (pageErrors.length) findings.push(`${pageErrors.length} page error(s)`);
      measured.push({
        orientation: orientation.name,
        box: orientation.box,
        reveal: Boolean(reveal),
        findings,
        pageErrors: pageErrors.length,
      });
      failures.push(...findings.map((finding) => `standalone geometry (${orientation.name}) — ${finding}`));
      console.log(
        `ios-standalone geometry: ${orientation.name} ${orientation.width}x${orientation.height}`
        + ` insets ${JSON.stringify(orientation.box)} — `
        + (findings.length ? findings.join("; ") : "controls clear the insets, the reveal is whole, targets are 44px"),
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
  summary.geometry = measured;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("node tooling/verify-ios-standalone.mjs [--device <name>] [--url <url>] [--out <dir>] [--create-clip] [--reset-state] [--keep-server]");
    return;
  }
  const baguette = requireBaguette();
  const stamp = `iOSStandalone-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const scratch = join(args.out, stamp);
  mkdirSync(scratch, { recursive: true });

  const device = pickDevice(args.device);
  console.log(`ios-standalone: ${baguette} · ${device.name} (${device.runtime})${device.alreadyBooted ? " already booted" : ""}`);

  let server = { child: null };
  let failures = [];
  const summary = {
    stamp,
    url: args.url,
    device: { name: device.name, runtime: device.runtime, udid: device.udid },
    baguette,
    servedBuild: "",
    screenshot: null,
    clip: null,
    failures: [],
  };

  const runInstrument = async () => {
    await ensureBooted(device);
    server = await ensureServer(args.url, args.keepServer);
    summary.servedBuild = await servedBuild(args.url);
    console.log(`ios-standalone: the server is serving build ${summary.servedBuild || "(unknown)"}`);

    const layout = run("baguette", ["chrome", "layout", "--udid", device.udid]);
    const screen = layout.ok ? JSON.parse(layout.stdout).screen : null;
    summary.screen = screen;
    if (!screen) throw new Error(`baguette chrome layout failed: ${layout.stderr || layout.stdout}`);
    const shaped = { screen };

    // The browser surface, same build on the same device, drawing the desk the
    // way the product intends. Its ink in the desk band is the reference the
    // home screen has to reach, and a blank browser refuses here — the verdict
    // never blames the home screen for a build that is broken everywhere.
    run("baguette", ["openurl", "--udid", device.udid, args.url]);
    const baseline = await waitForStableInk(device.udid, screen, scratch, "safari-baseline", MIN_INK, { minWaitMs: 14000 });
    const baselineInk = baseline.pixels ? bandInk(baseline.pixels, screen) : { dark: 0 };
    summary.browserBaseline = { path: baseline.path, ink: baselineInk.dark, attempts: baseline.attempts };
    if (baselineInk.dark < MIN_INK) {
      throw new Error(
        `Safari in browser mode painted no desk chrome either (${baselineInk.dark} ink pixels in the desk band);`
        + ` the build, the server or the app is failing before the home-screen question is asked (${baseline.path})`,
      );
    }
    const floor = Math.max(MIN_INK, Math.round(baselineInk.dark * BASELINE_SHARE));
    const baselineRows = baseline.pixels ? bandRows(baseline.pixels, screen) : [];
    console.log(
      `ios-standalone: Safari puts ${baselineInk.dark} ink pixels in the desk band;`
      + ` the home screen must reach ${floor} with a band shape matching Safari's at ${PROFILE_MATCH}`,
    );

    let clip = findWebClip(device.udid, args.url);
    if (!clip && args.createClip) {
      await createWebClip(device.udid, shaped, args.url, scratch);
      clip = findWebClip(device.udid, args.url);
    }
    if (!clip) {
      throw new Error([
        `no home-screen web clip for ${args.url} on ${device.name}.`,
        "Create it once, by hand or with --create-clip:",
        "  1. baguette openurl --udid " + device.udid + " " + args.url,
        "  2. Safari: ••• menu -> Share -> (Show More) -> Add to Home Screen -> Add",
        "  3. re-run this tool",
      ].join("\n"));
    }
    summary.clip = clip;
    console.log(`ios-standalone: web clip "${clip.name}" (${clip.bundleId})`);

    if (args.resetState) {
      run("xcrun", ["simctl", "terminate", device.udid, clip.bundleId]);
      await sleep(1500);
      const cleared = clearWebKitState(device.udid);
      console.log(`ios-standalone: cleared ${cleared} WebKit store(s), so this run opens on a first run`);
    }

    // Launch one: the pass where a shell update the clip is holding is adopted
    // (the app asks `/api/version`, refreshes the shell and reloads once). It is
    // recorded and then discarded; the measured launch is the next one.
    const warmup = await launchFromHomeScreen(device.udid, shaped, clip.name, scratch, "warmup");
    if (!warmup.tapped) {
      throw new Error(
        `the home-screen icon "${clip.name}" was not found on the first four home-screen pages, so nothing was measured`,
      );
    }
    const warmupInk = await waitForStableInk(device.udid, screen, scratch, "standalone-warmup", floor, { minWaitMs: 14000, attempts: 8 });
    summary.warmup = { path: warmupInk.path, ink: warmupInk.pixels ? bandInk(warmupInk.pixels, screen).dark : 0 };
    console.log(`ios-standalone: launch one painted ${summary.warmup.ink} ink pixels — adopting the served build`);
    run("xcrun", ["simctl", "terminate", device.udid, clip.bundleId]);
    await sleep(2500);

    // Launch two: the measured launch.
    const launch = await launchFromHomeScreen(device.udid, shaped, clip.name, scratch, "measured");
    if (!launch.tapped) {
      throw new Error(`the home-screen icon "${clip.name}" was not found on the measured launch, so nothing was measured`);
    }
    const rest = await waitForStableInk(device.udid, screen, scratch, "standalone-rest", floor, { minWaitMs: 14000, attempts: 12 });
    const restInk = rest.pixels ? bandInk(rest.pixels, screen) : { dark: 0 };
    const restMatch = rest.pixels ? profileMatch(baselineRows, bandRows(rest.pixels, screen)) : 0;
    summary.screenshot = rest.path;
    summary.rest = { path: rest.path, ink: restInk.dark, match: Number(restMatch.toFixed(3)), attempts: rest.attempts };
    if (restInk.dark < floor) {
      // A tap that never left the home screen and a launch that painted nothing
      // look the same in one frame. The home screen in both frames tells them apart.
      const leftHomeScreen = launch.home && rest.pixels ? frameDifference(launch.home, rest.pixels) > 0.02 : true;
      if (!leftHomeScreen) {
        throw new Error(
          `the icon tap did not leave the home screen, so nothing was measured`
          + ` (an instrument problem, not a verdict about the desk; see ${launch ? join(scratch, "measured-home.png") : scratch})`,
        );
      }
      failures.push([
        `the home-screen launch painted ${restInk.dark} ink pixels in the desk band (Safari's copy holds ${baselineInk.dark}, the floor is ${floor}):`,
        "the desk's own top chrome is missing from the visible area.",
        `Screenshot: ${rest.path}`,
      ].join(" "));
    } else if (restMatch < PROFILE_MATCH) {
      failures.push([
        `the home-screen band does not have the desk's shape (match ${restMatch.toFixed(2)} against Safari's rows, need ${PROFILE_MATCH}):`,
        "something is painted there — a launch splash or the home screen — but not the desk Safari draws for the same build.",
        `Screenshot: ${rest.path}`,
      ].join(" "));
    }

    // The keyboard phase. A phone raises the software keyboard the moment the
    // writer taps the composer, and the desk has to survive that: measure the
    // same band again with the keys up.
    //
    // A phase that cannot raise the keyboard proves nothing, so it has to show
    // its own precondition: the lower screen must actually repaint. The tap
    // walks down the composer until it does — the composer moves with the
    // keyboard inset, and a miss is not evidence about the desk.
    // The composer is located in the picture: its top border is a rule across
    // the width, and tapping the row just under it is the writer's own gesture.
    // An earlier version read the accessibility tree once and fell back to fixed
    // coordinates, which tapped the welcome text and photographed iOS's own
    // selection menu instead of a keyboard.
    const composerTop = rest.pixels ? composerRow(rest.pixels, screen) : null;
    const composer = composerTop === null
      ? null
      : { frame: { x: screen.width * 0.5 - 60, y: composerTop + 18, width: 120, height: 24 } };
    let raised = null;
    let shift = 0;
    // The composer sits above the home indicator at rest (measured: about 0.62
    // of the screen height on an iPhone Air), not at the very bottom.
    for (const heightShare of composer ? [null, 0.68, 0.62] : [0.63, 0.70, 0.57]) {
      const target = composer && heightShare === null
        ? composer
        : { frame: { x: screen.width * 0.5 - 100, y: screen.height * heightShare - 20, width: 200, height: 40 } };
      tapNode(device.udid, shaped, target);
      await sleep(3200);
      raised = await capture(device.udid, join(scratch, "standalone-keyboard.png"));
      shift = rest.pixels && raised ? bottomChanged(rest.pixels, raised) : 0;
      if (shift >= KEYBOARD_SHIFT) break;
    }
    const raisedInk = raised ? bandInk(raised, screen) : { dark: 0 };
    // Compared against the desk the same surface painted a moment earlier, not
    // against Safari: the two surfaces can be showing different windows (they
    // share one store, but restore their own session), and what this phase asks
    // is whether the keys changed the desk *it* was showing.
    const restRows = rest.pixels ? bandRows(rest.pixels, screen) : [];
    const raisedMatch = raised ? profileMatch(restRows, bandRows(raised, screen)) : 0;
    summary.keyboard = {
      path: join(scratch, "standalone-keyboard.png"),
      ink: raisedInk.dark,
      match: Number(raisedMatch.toFixed(3)),
      bottomChanged: Number(shift.toFixed(3)),
    };
    if (shift < KEYBOARD_SHIFT) {
      console.log(
        "ios-standalone: note — the composer could not be focused, so the keyboard phase did not run;"
        + " the desk was measured at rest only",
      );
    } else if (raisedInk.dark < floor || raisedMatch < PROFILE_MATCH) {
      failures.push([
        `with the keyboard up the home-screen band holds ${raisedInk.dark} ink pixels (floor ${floor})`
        + ` and matches the desk's own rows at ${raisedMatch.toFixed(2)} (need ${PROFILE_MATCH}):`,
        "the desk's top chrome leaves the visible area once the software keyboard is up.",
        `Screenshot: ${summary.keyboard.path}`,
      ].join(" "));
    }
  };

  return runInstrument()
    // A missing clip is a failure about the clip, not a reason to skip the
    // layout half — the phase needs the server the instrument already started,
    // not the simulator. Recorded first so the geometry phase still runs.
    .catch((error) => {
      failures.push(String(error?.message || error));
    })
    // The geometry phase runs whatever the device phase found: it needs the
    // server the instrument already started, not the simulator, and a device
    // phase that could not measure the clip must not silence the layout half.
    .then(() => {
      if (!summary.screen) {
        console.log("ios-standalone: note — the device reported no screen geometry, so the layout phase was skipped");
        return undefined;
      }
      return geometryPhase({ url: args.url, deviceName: device.name, screen: summary.screen, scratch, summary, failures });
    })
    .catch((error) => {
      failures.push(String(error?.message || error));
    })
    .then(() => {
      if (server.child && !args.keepServer) server.child.kill("SIGTERM");
      summary.failures = failures;
      writeFileSync(join(scratch, "result.json"), `${JSON.stringify(summary, null, 2)}\n`);
      const verdict = failures.length ? "FAIL" : "OK";
      console.log(`\nios-standalone  ${device.name} (${device.runtime})  ${verdict}`);
      console.log(`  served build: ${summary.servedBuild || "(unknown)"}`);
      console.log(
        `  desk band — Safari ${summary.browserBaseline?.ink ?? "-"} ink;`
        + ` home screen at rest ${summary.rest?.ink ?? "-"} ink / shape ${summary.rest?.match ?? "-"};`
        + ` keyboard up ${summary.keyboard?.ink ?? "-"} ink / shape ${summary.keyboard?.match ?? "-"}`,
      );
      if (summary.keyboard?.bottomChanged !== null && summary.keyboard?.bottomChanged !== undefined) {
        console.log(`  the composer tap changed ${Math.round(summary.keyboard.bottomChanged * 100)}% of the lower screen (the keys are up when this is high)`);
      }
      if (summary.browserBaseline?.path) console.log(`  safari baseline: ${summary.browserBaseline.path}`);
      if (summary.screenshot) console.log(`  home-screen launch: ${summary.screenshot}`);
      if (summary.keyboard?.path) console.log(`  with the composer focused: ${summary.keyboard.path}`);
      for (const phase of summary.geometry || []) {
        console.log(`  geometry ${phase.orientation}: ${phase.findings.length ? phase.findings.join("; ") : "clean"}`);
      }
      if (failures.length) {
        for (const failure of failures) console.error(`  ${failure}`);
        console.error(`  receipt: ${join(scratch, "result.json")}`);
        process.exit(1);
      }
    });
}

await main();
