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
    .catch((error) => {
      failures.push(error.message);
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
      if (failures.length) {
        for (const failure of failures) console.error(`  ${failure}`);
        console.error(`  receipt: ${join(scratch, "result.json")}`);
        process.exit(1);
      }
    });
}

await main();
