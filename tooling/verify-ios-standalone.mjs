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
//   - When a WebClip exists, the graded surface is the PWA — not Safari chrome.
//     Openurl for a localhost clip must use 127.0.0.1 (different origin), so a
//     Sad Mac in Safari must not fail the run; the instrument waits for the
//     clip's own desk (absolute ink/kind) and only uses Safari rows as a shape
//     reference when Safari actually paints a desk. `--reset-state` clears
//     WebsiteData before launch. Without it, the run measures the clip's
//     current session.
//
// So this tool drives the real thing. Default path: a real iPhone *simulator*
// via `baguette`, home-screen web clip, pixel verdict. Physical path: a paired
// iPhone via `xcrun devicectl` (open URL + screenshot + guided Home Screen
// launch). Apple does not expose physical WebClip Info.plist the way
// CoreSimulator does, and `baguette` cannot drive a physical phone — see
// `tooling/ios-standalone-physical.mjs`. It is an instrument, not a condition —
// run on demand (see `tooling/gate-waivers.json`) when a change touches the
// standalone surface, the safe areas, the soft keyboard or touch semantics.
//
// Usage:
//   npm run verify:ios-standalone
//   node tooling/verify-ios-standalone.mjs [--device "iPhone Air"] [--url http://localhost:4173/]
//                                         [--out <dir>] [--keep-server] [--create-clip]
//   # Physical iPhone (CoreDevice-paired; Mirroring OK for Add to Home Screen taps):
//   npm run verify:ios-standalone -- --physical --lan-url --await-home-launch
//   # Mirroring-only / no CoreDevice: grade real-phone PNGs Aaron captured:
//   npm run verify:ios-standalone -- --device-receipt dist/verification/ios-standalone/receipt
//
// Prerequisites (Simulator): `brew install baguette`, Xcode 26 + iOS runtime,
// home-screen web clip (`--create-clip` or by hand).
// Prerequisites (physical): Xcode `devicectl`, Developer Mode + trust so
// `xcrun devicectl list devices` shows Reality=physical; phone and Mac on the
// same LAN (or USB tethering); `--lan-url` or an explicit non-loopback `--url`.

import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  captureDeviceScreenshot,
  detectLanIPv4,
  findWebClipOnDevice,
  launchAppOnDevice,
  makeLanAuthToken,
  openUrlOnDevice,
  physicalServerEnv,
  pickPhysicalDevice,
  printPhysicalClipGuide,
  promptLine,
  readDeviceReceipt,
  readDeviceScreen,
  requireDevicectl,
  resolvePhysicalUrl,
  writeDeviceReceiptTemplate,
} from "./ios-standalone-physical.mjs";

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
const BASELINE_SHARE = 0.15; // when Safari paints a desk, PWA must reach this share of its ink
const PROFILE_MATCH = 0.6; // how closely the band's ink must follow a healthy Safari desk
// Painted desk band measured ~20k–32k; Sad Mac / boot_failed_recovery ~7930.
// Absolute floor grades the PWA without needing Safari chrome on a different origin.
const DESK_INK_FLOOR = 15000;
const KEYBOARD_SHIFT = 0.05; // share of the lower screen a raised keyboard must repaint

function parseArgs(argv) {
  const args = {
    device: "iPhone Air",
    url: "http://localhost:4173/",
    out: join(root, "dist", "verification", "ios-standalone"),
    keepServer: false,
    createClip: false,
    resetState: false,
    physical: false,
    lanUrl: false,
    awaitHomeLaunch: false,
    guidedKeyboard: false,
    clipBundleId: "",
    clipName: "AI System 6",
    deviceReceipt: "",
    writeReceiptTemplate: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--device") args.device = String(argv[++index] || args.device);
    else if (flag === "--url") args.url = String(argv[++index] || args.url);
    else if (flag === "--out") args.out = String(argv[++index] || args.out);
    else if (flag === "--keep-server") args.keepServer = true;
    else if (flag === "--create-clip") args.createClip = true;
    else if (flag === "--reset-state") args.resetState = true;
    else if (flag === "--physical") args.physical = true;
    else if (flag === "--lan-url") args.lanUrl = true;
    else if (flag === "--await-home-launch") args.awaitHomeLaunch = true;
    else if (flag === "--guided-keyboard") args.guidedKeyboard = true;
    else if (flag === "--clip-bundle-id") args.clipBundleId = String(argv[++index] || "");
    else if (flag === "--clip-name") args.clipName = String(argv[++index] || args.clipName);
    else if (flag === "--device-receipt") args.deviceReceipt = String(argv[++index] || "");
    else if (flag === "--write-receipt-template") args.writeReceiptTemplate = true;
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
  if (booted.length) {
    const named = booted.find((device) => device.name === name);
    return { ...(named || booted[0]), alreadyBooted: true };
  }
  // baguette list sometimes omits a booted sim; ask CoreSimulator directly.
  const simctl = run("xcrun", ["simctl", "list", "devices", "booted"]);
  if (simctl.ok) {
    const line = simctl.stdout.split("\n").find((entry) => entry.includes(name) && /\(Booted\)/.test(entry))
      || simctl.stdout.split("\n").find((entry) => /iPhone/.test(entry) && /\(Booted\)/.test(entry));
    const match = line && line.match(/(.+?)\s+\(([0-9A-Fa-f-]{36})\)\s+\(Booted\)/);
    if (match) {
      return {
        name: match[1].trim(),
        udid: match[2],
        runtime: "booted",
        alreadyBooted: true,
      };
    }
  }
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
  if (booted.ok) return;
  const detail = `${booted.stderr || ""}\n${booted.stdout || ""}`;
  // baguette list can miss a running sim while boot correctly refuses "already
  // Booted" (measured iPhone 17 / iOS 27). Treat that as success.
  if (/already booted|current state: Booted|Booted iPhone/i.test(detail)) {
    console.log(`ios-standalone: note — simulator already booted (${device.name}); continuing`);
    return;
  }
  throw new Error(`baguette boot failed: ${detail.trim()}`);
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

function rewriteLoopbackUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return "";
    parsed.hostname = "127.0.0.1";
    return parsed.toString();
  } catch {
    return "";
  }
}

// A home-screen clip for http://localhost:4173/ claims that exact URL. simctl
// openurl then fails (exit 60) with baguette's "Open in …?" warning, Safari
// never navigates, and the leftover Sad Mac becomes the baseline. 127.0.0.1 is
// the same server and does not match the clip's manifestId — but it is also a
// *different origin* from localhost, so Safari@127.0.0.1 and the WebClip do
// not share WebsiteData. When a clip exists, the instrument grades the PWA;
// Safari is only a same-build shape reference when it actually paints a desk.
function safariBrowserUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.hostname === "localhost") parsed.hostname = "127.0.0.1";
    return parsed.toString();
  } catch {
    return urlString;
  }
}

async function ensureServer(url, keepServer, extraEnv = null) {
  if (serverReady(url)) return { child: null, started: false, env: null };
  if (!existsSync(join(root, "apps", "desktop", "app.bundle.js"))) {
    throw new Error("apps/desktop/app.bundle.js is missing — run `npm run build:app` first");
  }
  const port = new URL(url).port || "80";
  const child = spawn(process.execPath, ["apps/server/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: port, ...(extraEnv || {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (serverReady(url)) {
      return {
        child: keepServer ? null : child,
        started: true,
        detached: keepServer,
        env: extraEnv,
      };
    }
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
  const wanted = url.replace(/\/+$/, "/");
  const applications = join(
    homedir(), "Library", "Developer", "CoreSimulator", "Devices", udid,
    "data", "Containers", "Bundle", "Application",
  );
  if (existsSync(applications)) {
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
  }
  // iOS 26+/27: Add to Home writes Library/WebClips/<id>.webclip immediately.
  // The PushBundle under Containers/Bundle/Application only materialises after
  // the first Home Screen launch, and LSApplicationLaunchProhibited keeps
  // simctl launch / FrontBoard from opening it — home-icon AX remains the path.
  const webClips = join(
    homedir(), "Library", "Developer", "CoreSimulator", "Devices", udid,
    "data", "Library", "WebClips",
  );
  if (!existsSync(webClips)) return null;
  for (const entry of readdirSync(webClips)) {
    if (!entry.endsWith(".webclip")) continue;
    const plist = join(webClips, entry, "Info.plist");
    if (!existsSync(plist)) continue;
    const printed = run("plutil", ["-p", plist]);
    if (!printed.ok) continue;
    const clipUrl = printed.stdout.match(/"URL"\s*=>\s*"([^"]+)"/);
    if (!clipUrl || clipUrl[1].replace(/\/+$/, "/") !== wanted) continue;
    const bundleId = printed.stdout.match(
      /"PlaceholderBundleIdentifier"\s*=>\s*"(com\.apple\.WebKit\.PushBundle\.[0-9A-Fa-f]+)"/,
    );
    const name = printed.stdout.match(/"Title"\s*=>\s*"([^"]+)"/);
    return {
      bundleId: bundleId ? bundleId[1] : `webclip:${entry}`,
      name: name ? name[1] : "the app",
      manifestId: clipUrl[1],
    };
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

function terminateBrowserSurfaces(udid, clipBundleId = "") {
  run("xcrun", ["simctl", "terminate", udid, "com.apple.mobilesafari"]);
  run("xcrun", ["simctl", "terminate", udid, "com.apple.SafariViewService"]);
  if (clipBundleId) run("xcrun", ["simctl", "terminate", udid, clipBundleId]);
}

// Sad Mac / boot_failed_recovery is as inky as a menu bar. Ink+stability alone
// will accept it as a Safari baseline and then fail the clip for "wrong shape".
function isBootFailedRecoveryTree(tree) {
  const blob = treeLabels(tree).join("\n");
  if (!blob) return false;
  if (/boot_failed_recovery/.test(blob)) return true;
  if (/couldn't finish starting|未能完成启动|未能完成啟動/.test(blob)) return true;
  return /(Retry|重试|重試)/.test(blob)
    && /(Recovery|恢复|恢復|Start without restoring)/.test(blob);
}

function isSpringboardTree(tree) {
  const labels = treeLabels(tree);
  if (!labels.length) return false;
  if (/^SpringBoard$/i.test(frontmostApp(tree))) return true;
  if (labels.some((label) => /^(搜尋|Search)$/.test(label)) && labels.some((label) => /^Safari$/.test(label))) {
    return true;
  }
  const homeIcons = labels.filter((label) => /^(照片|地圖|行事曆|錢包|健康|訊息|電話|時鐘|設定|Safari|News|Siri|Photos|Maps|Calendar|Wallet|Health|Messages|Phone|Clock|Settings)$/.test(label));
  return homeIcons.length >= 3;
}

// Safari-the-browser (tabs, 工具列, address field). A home-screen WebClip usually
// reports frontmost "Web" without that chrome. Mistaking Safari for the PWA is
// how a warmup can "paint a desk" and then leave Safari blocking the measured Home.
function isSafariBrowserTree(tree) {
  if (!tree) return false;
  if (/^Safari$/i.test(frontmostApp(tree))) return true;
  const labels = treeLabels(tree);
  return labels.some((label) => /^(網址|URL|重新整理|Reload|工具列|Page Menu|頁面選單)$/.test(label));
}

function isHomeScreenWebAppTree(tree) {
  if (!tree || isSpringboardTree(tree) || isSafariBrowserTree(tree)) return false;
  const name = frontmostApp(tree);
  // Measured: PushBundle reports "Web". A blank root is also the springboard —
  // do not treat emptiness as a successful clip launch.
  return /^Web$/i.test(name) || /System 6|AI System/i.test(name);
}

// AX does not expose the page (Safari chrome only). A Sad Mac + dotted boot
// screen has been measured at ~7930 ink in the desk band; a painted desk in
// the same band is ~20k–32k. A Springboard full of widgets is inky too, but
// the tree names Photos/Maps rather than the menu bar.
function captureSurfaceKind(tree, pixels, screen, { allowSafariBrowser = false } = {}) {
  if (isSpringboardTree(tree)) return "springboard";
  if (!allowSafariBrowser && isSafariBrowserTree(tree)) return "safari-browser";
  if (isBootFailedRecoveryTree(tree)) return "boot-failure";
  const ink = pixels && screen ? bandInk(pixels, screen).dark : 0;
  if (ink > 0 && ink < 12000) return "boot-failure";
  return "desk";
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

// baguette describe-ui --x --y returns the single AX node under that HID point
// (measured …04ak). Use it to calibrate list-row taps when AX frames lie above
// the painted/hit row.
function hitTestAt(udid, x, y, file) {
  const described = run("baguette", [
    "describe-ui", "--udid", udid,
    "--x", String(x), "--y", String(y),
    "-o", file,
  ]);
  if (!described.ok || !existsSync(file)) return null;
  try {
    return JSON.parse(execFileSync("cat", [file], { encoding: "utf8" }));
  } catch {
    return null;
  }
}

function hitTestLabel(udid, x, y, file) {
  const node = hitTestAt(udid, x, y, file);
  if (!node) return "";
  return String(node.label || node.title || node.identifier || "").trim();
}

async function dismissBlockingAlerts(udid, device, tree, scratch, tag) {
  if (!tree) return tree;
  const labels = treeLabels(tree);
  // Springboard "Remove from Home Screen?" left by a prior long-press / miss.
  if (labels.some((label) => /要移除|從主畫面移除|Remove .* from Home Screen|Delete App/.test(label))) {
    console.log(`ios-standalone: dismissing home-screen remove alert (${tag})`);
    const cancel = labelledNodes(tree).find((node) => /^(取消|Cancel)$/.test(node.label));
    if (cancel) tapNode(udid, device, cancel, tree, { duration: 0.08 });
    else run("baguette", ["key", "--udid", udid, "--code", "Escape"]);
    await sleep(800);
    return readTree(udid, join(scratch, `${tag}-alert-dismiss.json`));
  }
  return tree;
}

function flatten(node, out = []) {
  out.push(node);
  for (const child of node.children || []) flatten(child, out);
  return out;
}

function nodeText(node) {
  return [node.label, node.title, node.identifier]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function labelledNodes(tree) {
  if (!tree) return [];
  return flatten(tree)
    .map((node) => ({
      role: node.role || "",
      label: nodeText(node)[0] || "",
      identifier: String(node.identifier || "").trim(),
      frame: node.frame || {},
    }))
    .filter((node) => node.label.length > 0 || node.identifier.length > 0);
}

function isAddToHomeForm(labels) {
  // iOS 27 Add-to-Home form (measured …07-13-15 clip-add-hit-after): the nav
  // group's identifier is 「加入主畫面」, the close box is labelled 「取消」,
  // and the visual 「加入」 control is missing from AX. Treat identifier or
  // 取消+主畫面 as the form — HID then taps top-right for Add.
  return labels.some((label) => /^(加入|Add)$/.test(label))
    || labels.some((label) => /加入主畫面|Add to Home Screen/.test(label))
    || (labels.some((label) => /^(取消|Cancel)$/.test(label))
      && labels.some((label) => /主畫面|Home Screen|AI System 6/.test(label)));
}

// The springboard reports itself as an AXApplication with a blank label; the
// browser and the home-screen web app name themselves. Reading the tree before
// the icon tap has landed measures the home screen instead of the product, so
// every standalone read waits for the frontmost application to stop being the
// springboard.
function frontmostApp(tree) {
  return tree ? String(tree.label || tree.title || "").trim() : "";
}

function axRootSize(tree, device) {
  const frame = tree && tree.frame ? tree.frame : null;
  const width = Number(frame && frame.width) || device.screen.width;
  const height = Number(frame && frame.height) || device.screen.height;
  return { width, height };
}

// AX frames and baguette chrome-layout points can disagree by a couple of
// points on iOS 27 (measured: AX 402×874 vs chrome layout 400×872). Taps for
// Safari chrome must be scaled into the layout space baguette was given, or
// Page Menu / Share miss and the walk never leaves the toolbar.
function tapPoint(udid, device, x, y, options = {}) {
  const args = [
    "tap", "--udid", udid,
    "--x", String(x), "--y", String(y),
    "--width", String(device.screen.width), "--height", String(device.screen.height),
  ];
  if (options.duration != null) args.push("--duration", String(options.duration));
  return run("baguette", args);
}

function tapNode(udid, device, node, tree = null, options = {}) {
  const frame = node.frame || {};
  const ax = axRootSize(tree, device);
  const x = (frame.x + frame.width / 2) * (device.screen.width / ax.width);
  const yShare = options.yShare == null ? 0.5 : Number(options.yShare);
  let y = (frame.y + frame.height * yShare) * (device.screen.height / ax.height);
  // iOS 27 share-sheet action cells report AX frames ~460pt above the painted
  // icons (measured H18 …04ai). Optional yBias corrects HID taps onto pixels.
  if (options.yBias) y += options.yBias;
  return tapPoint(udid, device, x, y, options);
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
  const tapped = tapNode(udid, device, chosen, tree, {
    duration: options.duration ?? 0.1,
    yBias: options.yBias || 0,
  });
  if (!tapped.ok) return false;
  await sleep(options.settle ?? 1500);
  return true;
}

// Share-sheet action circles are light-gray disks near the bottom of the sheet.
// On iOS 27 their AX frames lie under PopoverDismissRegion ~460pt too high, so
// HID must aim at screenshot pixels, not describe-ui frames (measured …04ai).
async function findShareActionIconCenters(pngPath, device) {
  const image = await loadImage(pngPath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, image.width, image.height);
  const scaleX = width / device.screen.width;
  const scaleY = height / device.screen.height;
  const isCircleGray = (offset) => {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (Math.abs(r - g) > 12 || Math.abs(g - b) > 12) return false;
    return r >= 170 && r <= 220;
  };
  const runs = [];
  const y0 = Math.floor(height * 0.55);
  for (let y = y0; y < height - 8; y += 2) {
    let x = 0;
    while (x < width) {
      const offset = (y * width + x) * 4;
      if (!isCircleGray(offset)) {
        x += 1;
        continue;
      }
      const x0 = x;
      while (x < width && isCircleGray((y * width + x) * 4)) x += 1;
      const runWidth = x - x0;
      // ~60pt circles at 2×/3× framebuffer → ~120–240 px diameter.
      if (runWidth >= 120 && runWidth <= 240) {
        runs.push({ y, cx: x0 + runWidth / 2, width: runWidth });
      }
    }
  }
  const buckets = new Map();
  for (const run of runs) {
    const key = Math.round(run.cx / 40) * 40;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(run);
  }
  const centers = [];
  for (const items of buckets.values()) {
    if (items.length < 8) continue;
    const cx = items.reduce((sum, item) => sum + item.cx, 0) / items.length;
    const cy = items.reduce((sum, item) => sum + item.y, 0) / items.length;
    centers.push({
      x: cx / scaleX,
      y: cy / scaleY,
      px: { x: cx, y: cy },
    });
  }
  centers.sort((left, right) => left.x - right.x);
  return centers;
}

function shareSheetActionAxCenters(tree, device) {
  const labels = [/^(拷貝|Copy)$/, /書籤|Bookmark/, /閱讀|Reading/, /檢視較多|Show More/];
  const ax = axRootSize(tree, device);
  const found = [];
  for (const pattern of labels) {
    const node = labelledNodes(tree).find((entry) => pattern.test(entry.label));
    if (!node) continue;
    found.push({
      label: node.label,
      x: (node.frame.x + node.frame.width / 2) * (device.screen.width / ax.width),
      y: (node.frame.y + node.frame.height / 2) * (device.screen.height / ax.height),
    });
  }
  return found;
}

function measureShareSheetYBias(visualCenters, axCenters) {
  if (!visualCenters.length || !axCenters.length) return 0;
  const count = Math.min(visualCenters.length, axCenters.length);
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += visualCenters[index].y - axCenters[index].y;
  }
  return total / count;
}

// Expanded share-sheet list rows paint dark label ink near the AX frame, but
// AX centres sit ~1 row high for HID (measured …04aj: centre → Find). Icon
// yBias (~+460) must never be reused here. Locate ink bands in the screenshot
// and prefer the band inside / just below the AX frame (…04aj c5: text mid
// ≈ AX centre +12pt).
async function findListRowTextCenters(pngPath, device, yMinPt, yMaxPt) {
  const image = await loadImage(pngPath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, image.width, image.height);
  const scaleX = width / device.screen.width;
  const scaleY = height / device.screen.height;
  const x0 = Math.round(device.screen.width * 0.18 * scaleX);
  const x1 = Math.round(device.screen.width * 0.78 * scaleX);
  const bands = [];
  const ptStart = Math.max(0, Math.floor(yMinPt));
  const ptEnd = Math.min(device.screen.height - 1, Math.ceil(yMaxPt));
  for (let ptY = ptStart; ptY <= ptEnd; ptY += 1) {
    const y = Math.round(ptY * scaleY);
    if (y < 0 || y >= height) continue;
    let dark = 0;
    for (let x = x0; x < x1; x += 2) {
      const offset = (y * width + x) * 4;
      const lum = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
      if (lum < 95) dark += 1;
    }
    if (dark > 28) bands.push({ ptY, dark });
  }
  const clusters = [];
  for (const band of bands) {
    const last = clusters[clusters.length - 1];
    if (last && band.ptY - last.end <= 5) {
      last.end = band.ptY;
      last.dark += band.dark;
      last.n += 1;
    } else {
      clusters.push({ start: band.ptY, end: band.ptY, dark: band.dark, n: 1 });
    }
  }
  return clusters
    .filter((cluster) => cluster.n >= 3 && cluster.dark >= 80)
    .map((cluster) => ({
      x: device.screen.width * 0.42,
      y: (cluster.start + cluster.end) / 2,
      start: cluster.start,
      end: cluster.end,
      dark: cluster.dark,
    }));
}

async function locateAddToHomeVisualCenter(pngPath, device, addNode, tree) {
  if (!addNode || !addNode.frame) return null;
  const ax = axRootSize(tree, device);
  const scaleY = device.screen.height / ax.height;
  const scaleX = device.screen.width / ax.width;
  const frameTop = addNode.frame.y * scaleY;
  const frameBottom = (addNode.frame.y + addNode.frame.height) * scaleY;
  const frameMidX = (addNode.frame.x + addNode.frame.width / 2) * scaleX;
  const frameMidY = (addNode.frame.y + addNode.frame.height / 2) * scaleY;
  let centers = [];
  try {
    centers = await findListRowTextCenters(
      pngPath,
      device,
      frameTop - 40,
      frameBottom + 80,
    );
  } catch {
    return null;
  }
  if (!centers.length) return null;
  // Prefer ink whose mid sits inside the AX row or slightly below its centre
  // (painted glyphs measured …04aj ≈ centre +12). Reject bands that belong to
  // the Find row above (more than ~18pt above the AX mid).
  const ranked = centers
    .map((center) => {
      const dy = center.y - frameMidY;
      const inside = center.y >= frameTop - 4 && center.y <= frameBottom + 16;
      const score = (inside ? 0 : 40) + Math.abs(dy - 12);
      return { ...center, x: frameMidX, dy, score, inside };
    })
    .filter((center) => center.dy >= -18 && center.dy <= 40)
    .sort((left, right) => left.score - right.score);
  return ranked[0] || null;
}

function isFindUiOpen(labels) {
  return labels.some((label) => /尋找|搜尋選項|Find/.test(label))
    && !labels.some((label) => /^(加入主畫面|Add to Home Screen)$/.test(label));
}

function isEditActionsOpen(labels) {
  return labels.some((label) => /編輯動作|Edit Actions/.test(label))
    && labels.some((label) => /插入|喜好項目|Favorites/.test(label));
}

function treeLabels(tree) {
  return labelledNodes(tree).map((node) => node.label);
}

function isPageMenuOpen(tree) {
  const labels = treeLabels(tree);
  return labels.some((label) => /^(分享|Share)$/.test(label))
    && labels.some((label) => /關閉特色選單|加入書籤|Add Bookmark/.test(label));
}

function isShareSheetOpen(tree) {
  const blob = treeLabels(tree).join("\n");
  // Page Menu / 「特色選單」 is not the system share sheet (…04ak false positive
  // when gray disks in the page menu matched share-action circle parse).
  if (/關閉特色選單/.test(blob)) return false;
  // Full action-row labels when AX exposes them.
  if (/(拷貝|Copy|檢視較多|Show More)/.test(blob)) return true;
  // iOS 27 often exposes only the sheet header under PopoverDismissRegion
  // (measured …04aj): 「選項」+ title, without 拷貝／檢視較多 in the tree.
  if (/選項/.test(blob) && /(AI System 6|localhost|關閉彈出式視窗)/.test(blob)) return true;
  // …04ak: mid-animation sheet may expose only 「關閉彈出式視窗」 (see
  // probe-ak4 clip-5-share-0.06) before 選項／AI System 6 appear.
  return /關閉彈出式視窗/.test(blob) && !/關閉特色選單/.test(blob);
}

function looksLikeShareSheet(tree, circleCount) {
  if (isShareSheetOpen(tree)) return true;
  if (circleCount < 3) return false;
  const blob = treeLabels(tree).join("\n");
  // Circles alone are not enough — Page Menu also has light disks.
  if (/關閉特色選單/.test(blob)) return false;
  return /選項|關閉彈出式視窗|AI System 6|localhost/.test(blob);
}

async function waitForShareSheetSettled(udid, scratch, tag, attempts = 6) {
  let tree = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(700);
    tree = readTree(udid, join(scratch, `${tag}-settle-${attempt}.json`));
    if (!isShareSheetOpen(tree)) return tree;
    const labels = treeLabels(tree);
    // Prefer a sheet that names the page or exposes action rows.
    if (labels.some((label) => /選項|拷貝|Copy|檢視較多|Show More|AI System 6|localhost/.test(label))) {
      return tree;
    }
  }
  return tree;
}

async function waitForTree(udid, scratch, tag, predicate, attempts = 8, delayMs = 700) {
  let tree = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    tree = readTree(udid, join(scratch, `${tag}-${attempt}.json`));
    if (tree && predicate(tree)) return tree;
    await sleep(delayMs);
  }
  return tree;
}

async function createWebClip(udid, device, url, scratch) {
  console.log("ios-standalone: no web clip for this URL — walking Safari's Add to Home Screen flow");
  // Xcode 27 Device Hub can ack HID taps without delivering them (Page Menu
  // hit-tests as MoreMenuButton but never opens). Reclaim the input surface
  // before the share walk — baguette heal is a no-op when nothing is shadowed.
  {
    const healed = run("baguette", ["heal", "--udid", udid]);
    const note = `${healed.stdout || ""}\n${healed.stderr || ""}`.trim();
    if (/reclaimed|restarted/i.test(note)) {
      console.log(`ios-standalone: ${note.split("\n").filter(Boolean).pop()}`);
      await sleep(8000);
    }
  }
  // Prefer simctl: baguette openurl can leave Safari without a frontmost AX
  // tree after a cold boot (measured 2026-10-05), so Page Menu never appears.
  const opened = run("xcrun", ["simctl", "openurl", udid, url]);
  if (!opened.ok) run("baguette", ["openurl", "--udid", udid, url]);
  await sleep(12000);
  // A cold Safari tab often yields a blank Add-to-Home form with 「加入」 disabled
  // (…07-13-15). Reload once so the title/icon are in hand before the share walk.
  {
    const warm = readTree(udid, join(scratch, "clip-warm-toolbar.json"));
    const reload = labelledNodes(warm).find((node) => /^(重新整理|Reload)$/.test(node.label));
    if (reload) {
      console.log("ios-standalone: reloading Safari so Add to Home can read the page icon");
      tapNode(udid, device, reload, warm, { duration: 0.05 });
      await sleep(8000);
    }
  }

  let tree = null;
  let shareSheet = null;
  // iOS 27: Page Menu opens unreliably; Share in the page menu only sometimes
  // activates the system share sheet. Retry the chrome walk a few times before
  // giving up — do not pretend a highlighted Share row is a completed clip.
  for (let outer = 0; outer < 6 && !shareSheet; outer += 1) {
    tree = readTree(udid, join(scratch, `clip-${outer}-toolbar.json`));
    tree = await dismissBlockingAlerts(udid, device, tree, scratch, `clip-${outer}`);
    // Dismiss a half-open share popover left by a prior miss.
    if (treeLabels(tree).some((label) => /關閉彈出式視窗|Close/.test(label))) {
      run("baguette", ["key", "--udid", udid, "--code", "Escape"]);
      await sleep(800);
      tree = readTree(udid, join(scratch, `clip-${outer}-escape.json`));
    }
    // If we are still on Springboard (no Safari chrome), reopen the URL.
    if (!treeLabels(tree).some((label) => /頁面選單|Page Menu|分享|Share|重新整理|Reload|網址|URL/.test(label))) {
      console.log(`ios-standalone: Safari chrome missing on attempt ${outer}; reopening URL`);
      const reopen = run("xcrun", ["simctl", "openurl", udid, url]);
      if (!reopen.ok) run("baguette", ["openurl", "--udid", udid, url]);
      await sleep(10000);
      tree = readTree(udid, join(scratch, `clip-${outer}-reopen.json`));
      tree = await dismissBlockingAlerts(udid, device, tree, scratch, `clip-${outer}-reopen`);
    }
    // Safari's bottom toolbar: More / Page Menu / 「頁面選單，可使用翻譯」.
    // Measured …04aj: a warm-up tap in AX space then the layout-scaled tap opens
    // the menu more reliably than a single layout tap after a reboot.
    // Page Menu: prefer AX frame, then hit-test the candidate point. Hardcoded
    // (113.4, 814.1) hits the desk 「添加...」 when Safari chrome is collapsed
    // (measured …04ak). Keep taps short — long presses jiggle Springboard.
    async function pageMenuPoint(currentTree) {
      const node = labelledNodes(currentTree).find((entry) => /頁面選單|Page Menu|^更多$|^More$/.test(entry.label));
      if (node) {
        const ax = axRootSize(currentTree, device);
        return {
          x: (node.frame.x + node.frame.width / 2) * (device.screen.width / ax.width),
          y: (node.frame.y + node.frame.height / 2) * (device.screen.height / ax.height),
          source: "ax",
        };
      }
      return { x: 113.4, y: 814.1, source: "fallback" };
    }
    async function tapPageMenu(currentTree, tag) {
      // Menu already open (…04ak: PM point hit-tests as 「關閉特色選單」).
      if (isPageMenuOpen(currentTree)) return true;
      let point = await pageMenuPoint(currentTree);
      const under = hitTestLabel(udid, point.x, point.y, join(scratch, `${tag}-pm-hit.json`));
      if (/關閉特色選單|分享|^Share$/.test(under) || isPageMenuOpen(currentTree)) {
        console.log(`ios-standalone: Page Menu already open (hit-test="${under || "?"}")`);
        return true;
      }
      if (!/頁面選單|Page Menu|^更多$|^More$/.test(under)) {
        // Reveal Safari chrome, then re-read.
        const urlNode = labelledNodes(currentTree).find((entry) => /^(網址|URL)$/.test(entry.label));
        if (urlNode) tapNode(udid, device, urlNode, currentTree, { duration: 0.05 });
        else tapPoint(udid, device, device.screen.width / 2, 55, { duration: 0.05 });
        await sleep(700);
        currentTree = readTree(udid, join(scratch, `${tag}-chrome.json`));
        if (isPageMenuOpen(currentTree)) return true;
        point = await pageMenuPoint(currentTree);
        const again = hitTestLabel(udid, point.x, point.y, join(scratch, `${tag}-pm-hit2.json`));
        if (/關閉特色選單|分享|^Share$/.test(again)) return true;
        if (!/頁面選單|Page Menu|^更多$|^More$/.test(again)) {
          console.log(
            `ios-standalone: note — Page Menu point (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`
            + ` hit-test="${again || "?"}" (not Page Menu); skip this attempt`,
          );
          return false;
        }
      }
      tapPoint(udid, device, point.x, point.y, { duration: 0.05 });
      await sleep(600);
      tapPoint(udid, device, point.x, point.y, { duration: 0.05 });
      await sleep(900);
      return true;
    }
    if (!(await tapPageMenu(tree, `clip-${outer}`))) continue;
    tree = await waitForTree(udid, scratch, `clip-${outer}-menu`, isPageMenuOpen, 8, 600);
    if (!isPageMenuOpen(tree)) {
      // hit-test said menu chrome was up but wait missed Share — one more read.
      tree = readTree(udid, join(scratch, `clip-${outer}-menu-final.json`));
      if (!isPageMenuOpen(tree)) continue;
    }

    // Short taps activate Share more reliably than long presses (measured H18).
    // Stop at the first real system sheet — further Share taps dismiss it.
    // …04ak: do not treat Page Menu gray disks as the system share sheet.
    for (const duration of [0.05, 0.06, 0.08, 0.1]) {
      if (!isPageMenuOpen(tree)) break;
      const shareNode = labelledNodes(tree).find((node) => /^(分享|Share)$/.test(node.label));
      if (shareNode) {
        const ax = axRootSize(tree, device);
        const sx = (shareNode.frame.x + shareNode.frame.width / 2) * (device.screen.width / ax.width);
        const sy = (shareNode.frame.y + shareNode.frame.height / 2) * (device.screen.height / ax.height);
        tapPoint(udid, device, sx, sy, { duration });
        await sleep(2400);
      } else {
        await tapLabel(udid, device, tree, [/^分享$/, /^Share$/], { settle: 2400, duration });
      }
      const sharePath = join(scratch, `clip-${outer}-share-${duration}.png`);
      await capture(udid, sharePath);
      tree = readTree(udid, join(scratch, `clip-${outer}-share-${duration}.json`));
      let circles = [];
      try {
        circles = await findShareActionIconCenters(sharePath, device);
      } catch {
        circles = [];
      }
      if (looksLikeShareSheet(tree, circles.length)) {
        // Mid-animation AX can be only 「關閉彈出式視窗」 (…04ak); wait for rows.
        shareSheet = await waitForShareSheetSettled(
          udid,
          scratch,
          `clip-${outer}-share-${duration}`,
        ) || tree;
        break;
      }
    }
  }

  if (!shareSheet) {
    console.log(
      "ios-standalone: note — Safari Page Menu / Share did not yield a system share sheet;"
      + " Add to Home Screen cannot be completed unattended on this simulator",
    );
    return false;
  }

  tree = shareSheet;
  // iOS 27: action cells are labelled in AX but PopoverDismissRegion owns the
  // hit-test at those frames (~460pt above the painted icons, measured …04ai).
  // Tap via screenshot pixel centres (HID), then reuse the measured y-bias for
  // later labelled rows such as 「加入主畫面」.
  const sheetShot = join(scratch, "clip-share-sheet.png");
  await capture(udid, sheetShot);
  writeFileSync(join(scratch, "clip-share-sheet-labels.txt"), `${treeLabels(tree).join("\n")}\n`);

  let visualCenters = [];
  try {
    visualCenters = await findShareActionIconCenters(sheetShot, device);
  } catch (error) {
    console.log(`ios-standalone: note — share-sheet screenshot parse failed: ${error.message || error}`);
  }
  const axCenters = shareSheetActionAxCenters(tree, device);
  const yBias = measureShareSheetYBias(visualCenters, axCenters);
  writeFileSync(
    join(scratch, "clip-share-visual.json"),
    `${JSON.stringify({ visualCenters, axCenters, yBias }, null, 2)}\n`,
  );
  console.log(
    `ios-standalone: share-sheet visual icons=${visualCenters.length}`
    + ` axActions=${axCenters.length} yBias=${yBias.toFixed(1)}pt`,
  );

  async function sheetStillOpen() {
    const next = readTree(udid, join(scratch, "clip-sheet-check.json"));
    return isShareSheetOpen(next) || labelledNodes(next).some(
      (node) => /加入主畫面|Add to Home Screen|檢視較多|Show More/.test(node.label),
    );
  }

  const hasAddLabel = (next) => labelledNodes(next).some(
    (node) => /^(加入主畫面|Add to Home Screen)$/.test(node.label),
  );

  // …04ak: hit-tested 「檢視較多」 expands the list (swipes on the collapsed
  // icon row alone left Add hidden). Confirm the point with describe-ui --x/--y
  // before tapping so a miss cannot dismiss the sheet.
  let revealedAdd = hasAddLabel(tree);
  if (!revealedAdd && (await sheetStillOpen()) && visualCenters.length >= 3) {
    const showMore = visualCenters[visualCenters.length - 1];
    const under = hitTestLabel(
      udid,
      showMore.x,
      showMore.y,
      join(scratch, "clip-show-more-hit.json"),
    );
    console.log(
      `ios-standalone: HID-tapping Show More at visual (${showMore.x.toFixed(1)}, ${showMore.y.toFixed(1)}) hit-test="${under || "?"}"`,
    );
    if (/檢視較多|Show More|更多|檢視較少|Show Less/.test(under) || !under) {
      // 「檢視較少」 means already expanded — skip tap.
      if (/檢視較少|Show Less/.test(under)) {
        console.log("ios-standalone: sheet already expanded (Show Less)");
      } else {
        const tapped = tapPoint(udid, device, showMore.x, showMore.y, { duration: 0.05 });
        if (tapped.ok) {
          await sleep(1800);
          await capture(udid, join(scratch, "clip-after-show-more.png"));
          tree = readTree(udid, join(scratch, "clip-after-show-more.json"));
          revealedAdd = hasAddLabel(tree);
          if (!revealedAdd && !(await sheetStillOpen())) {
            console.log("ios-standalone: note — visual Show More tap dismissed the share sheet");
          }
        }
      }
    } else {
      console.log("ios-standalone: note — skipping Show More visual tap; hit-test was not Show More");
    }
  }
  if (!revealedAdd && (await sheetStillOpen()) && yBias > 200) {
    console.log(`ios-standalone: retrying Show More via AX label + icon yBias ${yBias.toFixed(1)}`);
    await tapLabel(udid, device, tree, [/檢視較多/, /Show More/], {
      settle: 1800,
      duration: 0.05,
      yBias,
    });
    await capture(udid, join(scratch, "clip-after-show-more-bias.png"));
    tree = readTree(udid, join(scratch, "clip-after-show-more-bias.json"));
    revealedAdd = hasAddLabel(tree);
  }

  // Swipes help when Show More is unavailable; also scroll the expanded list.
  if (!revealedAdd && (await sheetStillOpen())) {
    for (let swipe = 0; swipe < 4 && !revealedAdd; swipe += 1) {
      if (!(await sheetStillOpen())) break;
      run("baguette", [
        "swipe", "--udid", udid,
        "--start-x", String(device.screen.width / 2),
        "--start-y", String(Math.round(device.screen.height * 0.78)),
        "--end-x", String(device.screen.width / 2),
        "--end-y", String(Math.round(device.screen.height * 0.42)),
        "--width", String(device.screen.width),
        "--height", String(device.screen.height),
        "--duration", "0.35",
      ]);
      await sleep(1100);
      tree = readTree(udid, join(scratch, `clip-expand-swipe-${swipe}.json`));
      await capture(udid, join(scratch, `clip-expand-swipe-${swipe}.png`));
      revealedAdd = hasAddLabel(tree);
    }
  }

  // iOS 27 often omits list-row labels from the full AX dump even when the
  // painted sheet shows 「加入主畫面」 (measured …04ak clip-after-show-more).
  // Probe HID points until describe-ui --x/--y names the row.
  let hitAddPoint = null;
  async function locateAddByHitTest(tag) {
    const xs = [device.screen.width * 0.42, device.screen.width * 0.55];
    const yStart = Math.round(device.screen.height * 0.48);
    const yEnd = Math.round(device.screen.height * 0.82);
    const sweep = [];
    for (const x of xs) {
      for (let y = yStart; y <= yEnd; y += 10) {
        const label = hitTestLabel(udid, x, y, join(scratch, `${tag}-y${y}.json`));
        if (label) sweep.push({ x, y, label });
        if (/^(加入主畫面|Add to Home Screen)$/.test(label)) {
          writeFileSync(join(scratch, `${tag}-hit.json`), `${JSON.stringify({ x, y, label, sweep }, null, 2)}\n`);
          return { x, y, label };
        }
      }
    }
    writeFileSync(join(scratch, `${tag}-hit.json`), `${JSON.stringify({ sweep }, null, 2)}\n`);
    return null;
  }
  if (!revealedAdd && (await sheetStillOpen())) {
    console.log("ios-standalone: hit-test sweeping for Add to Home (AX dump may omit list rows)");
    hitAddPoint = await locateAddByHitTest("clip-add-locate");
    if (hitAddPoint) {
      revealedAdd = true;
      console.log(
        `ios-standalone: hit-test located Add to Home at (${hitAddPoint.x.toFixed(1)}, ${hitAddPoint.y.toFixed(1)})`,
      );
    }
  }

  if (!revealedAdd) {
    console.log(
      "ios-standalone: note — share sheet opened, but Add to Home Screen never appeared"
      + " after visual/HID Show More + sheet swipes + hit-test sweep. Create the clip once by hand, then re-run.",
    );
    return false;
  }

  // List rows must NOT reuse the ~460pt icon yBias (that overshoots into
  // 「編輯動作」). …04aj: AX centre → Find (row above); dy 40–100 still missed
  // the glyph and hit Markup/Edit. Prefer hit-test point / screenshot ink /
  // zero-or-negative dy, then a short HID drag onto the row.
  const addNode = labelledNodes(tree).find((node) => /^(加入主畫面|Add to Home Screen)$/.test(node.label));
  let offered = false;

  // Fast path: tap the calibrated hit-test point directly.
  if (hitAddPoint) {
    console.log(
      `ios-standalone: HID-tapping Add to Home at hit-test (${hitAddPoint.x.toFixed(1)}, ${hitAddPoint.y.toFixed(1)})`,
    );
    // Single short taps sometimes only highlight the row; a double-tap opens
    // the Add form on iOS 27 (measured when duration 0.05 left the sheet).
    run("baguette", [
      "double-tap", "--udid", udid,
      "--x", String(hitAddPoint.x), "--y", String(hitAddPoint.y),
      "--width", String(device.screen.width), "--height", String(device.screen.height),
    ]);
    await sleep(2500);
    await capture(udid, join(scratch, "clip-add-hit.png"));
    tree = readTree(udid, join(scratch, "clip-add-hit-after.json"));
    if (isAddToHomeForm(treeLabels(tree))) offered = true;
    if (!offered) {
      tapPoint(udid, device, hitAddPoint.x, hitAddPoint.y, { duration: 0.03 });
      await sleep(2200);
      tree = readTree(udid, join(scratch, "clip-add-hit-after2.json"));
      if (isAddToHomeForm(treeLabels(tree))) offered = true;
    }
  }

  if (!offered && addNode) {
    const ax = axRootSize(tree, device);
    const baseX = (addNode.frame.x + addNode.frame.width / 2) * (device.screen.width / ax.width);
    const baseY = (addNode.frame.y + addNode.frame.height / 2) * (device.screen.height / ax.height);
    const listShot = join(scratch, "clip-add-list.png");
    await capture(udid, listShot);
    const visual = await locateAddToHomeVisualCenter(listShot, device, addNode, tree);

    // Calibrate with baguette hit-test: walk small dy around the AX mid until
    // the node under the point is 「加入主畫面」(not Find above / Markup below).
    const hitSweep = [];
    let hitTarget = null;
    for (const dy of [12, 0, 18, -12, 25, -20, 35, -30, 8, -8, 45, -40]) {
      const y = Math.min(device.screen.height - 20, Math.max(20, baseY + dy));
      const label = hitTestLabel(
        udid,
        baseX,
        y,
        join(scratch, `clip-add-hit-dy${dy}.json`),
      );
      hitSweep.push({ dy, x: baseX, y, label });
      if (/^(加入主畫面|Add to Home Screen)$/.test(label) && !hitTarget) {
        hitTarget = { tag: `hit-dy${dy}`, x: baseX, y, label };
      }
    }
    writeFileSync(
      join(scratch, "clip-add-visual.json"),
      `${JSON.stringify({
        ax: addNode.frame,
        base: { x: baseX, y: baseY },
        visual,
        hitSweep,
        hitTarget,
      }, null, 2)}\n`,
    );
    if (hitTarget) {
      console.log(
        `ios-standalone: hit-test found Add to Home at (${hitTarget.x.toFixed(1)}, ${hitTarget.y.toFixed(1)}) ${hitTarget.tag} label=${hitTarget.label}`,
      );
    } else {
      console.log("ios-standalone: note — hit-test sweep never landed on Add to Home label");
    }

    const candidates = [];
    if (hitTarget) candidates.push(hitTarget);
    if (visual) {
      candidates.push({
        tag: `ink-dy${visual.dy.toFixed(0)}`,
        x: visual.x,
        y: visual.y,
      });
    }
    // Zero / small negative / small positive — never reuse icon +460, and avoid
    // the …04aj +40…+100 band that landed on 標示／編輯動作.
    for (const dy of [0, 12, -12, 18, -20, 25, -8, 35, -30]) {
      candidates.push({
        tag: `dy${dy}`,
        x: baseX,
        y: Math.min(device.screen.height - 20, Math.max(20, baseY + dy)),
      });
    }

    async function dismissWrongSurface(labels, tag) {
      if (isEditActionsOpen(labels)) {
        console.log(`ios-standalone: note — ${tag} opened Edit Actions; dismissing`);
        const done = labelledNodes(tree).find((node) => /完成|Done|關閉|Close/.test(node.label));
        if (done) tapNode(udid, device, done, tree, { duration: 0.08 });
        else run("baguette", ["key", "--udid", udid, "--code", "Escape"]);
        await sleep(700);
        tree = readTree(udid, join(scratch, `clip-after-${tag}-edit.json`));
        return "edit";
      }
      if (isFindUiOpen(labels)) {
        console.log(`ios-standalone: note — ${tag} hit Find UI; dismissing`);
        const closer = labelledNodes(tree).find((node) => /^(關閉|Close)$/.test(node.label));
        if (closer) tapNode(udid, device, closer, tree, { duration: 0.08 });
        run("baguette", ["key", "--udid", udid, "--code", "Escape"]);
        await sleep(700);
        tree = readTree(udid, join(scratch, `clip-after-${tag}-find.json`));
        return "find";
      }
      return null;
    }

    for (const candidate of candidates) {
      tree = readTree(udid, join(scratch, "clip-add-probe-state.json"));
      if (!hasAddLabel(tree) && !(await sheetStillOpen())) break;
      if (!hasAddLabel(tree)) break;
      console.log(
        `ios-standalone: HID-tapping Add to Home at (${candidate.x.toFixed(1)}, ${candidate.y.toFixed(1)}) ${candidate.tag}`,
      );
      const tapped = tapPoint(udid, device, candidate.x, candidate.y, { duration: 0.05 });
      if (!tapped.ok) continue;
      await sleep(2200);
      await capture(udid, join(scratch, `clip-add-${candidate.tag}.png`));
      tree = readTree(udid, join(scratch, `clip-add-${candidate.tag}.json`));
      const labels = treeLabels(tree);
      if (isAddToHomeForm(labels)) {
        offered = true;
        break;
      }
      const wrong = await dismissWrongSurface(labels, candidate.tag);
      if (wrong && !hasAddLabel(tree) && !(await sheetStillOpen())) {
        // Sheet gone after Find/Edit — cannot keep probing this attempt.
        break;
      }
    }

    // Last resort: short drag that ends on the painted row (or AX mid +12).
    if (!offered) {
      tree = readTree(udid, join(scratch, "clip-add-before-drag.json"));
      if (hasAddLabel(tree)) {
        const endY = visual ? visual.y : Math.min(device.screen.height - 20, baseY + 12);
        const startY = Math.min(device.screen.height - 20, endY + 70);
        console.log(
          `ios-standalone: HID-dragging onto Add to Home (${baseX.toFixed(1)}, ${startY.toFixed(1)}) → (${baseX.toFixed(1)}, ${endY.toFixed(1)})`,
        );
        run("baguette", [
          "swipe", "--udid", udid,
          "--start-x", String(baseX),
          "--start-y", String(startY),
          "--end-x", String(baseX),
          "--end-y", String(endY),
          "--width", String(device.screen.width),
          "--height", String(device.screen.height),
          "--duration", "0.22",
        ]);
        await sleep(400);
        tapPoint(udid, device, baseX, endY, { duration: 0.05 });
        await sleep(2200);
        await capture(udid, join(scratch, "clip-add-drag.png"));
        tree = readTree(udid, join(scratch, "clip-add-drag.json"));
        const labels = treeLabels(tree);
        if (isAddToHomeForm(labels)) offered = true;
        else await dismissWrongSurface(labels, "drag");
      }
    }
  }
  if (!offered) {
    console.log("ios-standalone: note — failed to HID-tap Add to Home Screen (ink/zero-dy/drag probes)");
    await capture(udid, join(scratch, "clip-add-miss.png"));
    return false;
  }

  // iOS 27 often opens the Add form with a blank body and a greyed-out 「加入」
  // (measured …07-13-15 clip-add-hit.png) until Safari finishes reading the
  // page's title/icon. Tapping top-right while disabled does nothing and leaves
  // 「取消」 on screen — wait for the form to populate before confirming.
  async function addFormPopulated(nextTree) {
    const nodes = flatten(nextTree || {});
    return nodes.some((node) => {
      const blob = nodeText(node).concat(String(node.value || "")).join(" ");
      if (/AI System 6|System 6/.test(blob)) return true;
      if (node.role === "AXTextField" && String(node.value || "").trim()) return true;
      return /^(加入|Add)$/.test(String(node.label || node.title || "").trim());
    });
  }

  async function waitForAddFormReady(tag, attempts = 24) {
    let latest = tree;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      latest = readTree(udid, join(scratch, `${tag}-${attempt}.json`));
      const labels = treeLabels(latest);
      if (!isAddToHomeForm(labels)) {
        console.log(`ios-standalone: note — Add form left before it was ready (${tag}-${attempt})`);
        return { ready: false, tree: latest };
      }
      if (await addFormPopulated(latest)) {
        console.log(`ios-standalone: Add form populated (${tag} attempt ${attempt + 1})`);
        await capture(udid, join(scratch, `${tag}-ready.png`));
        return { ready: true, tree: latest };
      }
      await sleep(750);
    }
    await capture(udid, join(scratch, `${tag}-blank.png`));
    return { ready: false, tree: latest };
  }

  async function confirmAddOnForm(tag) {
    // Prefer the nav-bar confirm by identifier — bare 「加入」 also matches the
    // form title 「加入主畫面」 on iOS 27 (measured …clip-ok4).
    const addById = labelledNodes(tree).find((node) =>
      /AddToHomeScreenAddButton/.test(node.identifier || "")
      || (/^(加入|Add)$/.test(node.label)
        && node.frame
        && node.frame.y < 140
        && (node.frame.x + node.frame.width / 2) > device.screen.width * 0.55),
    );
    if (addById) {
      tapNode(udid, device, addById, tree, { duration: 0.1 });
      await sleep(2500);
      if (findWebClip(udid, url)) return true;
      tree = readTree(udid, join(scratch, `${tag}-after-id.json`));
      if (!treeLabels(tree).some((label) => /^(取消|Cancel)$/.test(label))) return true;
    }
    let confirmed = await tapLabel(udid, device, tree, [/^加入$/, /^Add$/], {
      settle: 2500,
      duration: 0.1,
    });
    if (confirmed) return true;
    // Visual 「加入」 is often missing from AX — probe top-right, then a tight
    // hit-test band around the trailing nav button.
    const probes = [
      { x: device.screen.width * 0.90, y: Math.max(48, device.screen.height * 0.085) },
      { x: device.screen.width * 0.93, y: Math.max(52, device.screen.height * 0.095) },
      { x: device.screen.width * 0.87, y: Math.max(56, device.screen.height * 0.10) },
    ];
    for (let index = 0; index < probes.length; index += 1) {
      const point = probes[index];
      const under = hitTestLabel(
        udid,
        point.x,
        point.y,
        join(scratch, `${tag}-ht-${index}.json`),
      );
      console.log(
        `ios-standalone: HID-tapping confirm at (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`
        + ` hit-test="${under || "?"}"`,
      );
      tapPoint(udid, device, point.x, point.y, { duration: 0.08 });
      await sleep(2200);
      tree = readTree(udid, join(scratch, `${tag}-after-${index}.json`));
      if (findWebClip(udid, url)) return true;
      if (!treeLabels(tree).some((label) => /^(取消|Cancel)$/.test(label))) return true;
      // Still on the form — try the next probe.
    }
    return false;
  }

  let ready = await waitForAddFormReady("clip-form-wait");
  tree = ready.tree || tree;
  if (!ready.ready) {
    // One recovery: dismiss the blank sheet, reload the page so Safari has the
    // icon/title, then re-enter Add to Home from the share sheet once.
    console.log("ios-standalone: note — Add form stayed blank; reloading Safari and retrying once");
    const cancel = labelledNodes(tree).find((node) => /^(取消|Cancel)$/.test(node.label));
    if (cancel) tapNode(udid, device, cancel, tree, { duration: 0.08 });
    else run("baguette", ["key", "--udid", udid, "--code", "Escape"]);
    await sleep(800);
    run("baguette", ["openurl", "--udid", udid, url]);
    await sleep(10000);
    tree = readTree(udid, join(scratch, "clip-retry-toolbar.json"));
    const reload = labelledNodes(tree).find((node) => /^(重新整理|Reload)$/.test(node.label));
    if (reload) {
      tapNode(udid, device, reload, tree, { duration: 0.05 });
      await sleep(8000);
    }
    // Re-walk Page Menu → Share → Show More → Add to Home (compact second pass).
    for (let outer = 0; outer < 3 && !isAddToHomeForm(treeLabels(tree)); outer += 1) {
      tree = readTree(udid, join(scratch, `clip-retry-${outer}-toolbar.json`));
      await tapLabel(udid, device, tree, [/頁面選單|Page Menu|^更多$|^More$/], {
        settle: 1200,
        duration: 0.05,
      });
      tree = readTree(udid, join(scratch, `clip-retry-${outer}-menu.json`));
      await tapLabel(udid, device, tree, [/^分享$/, /^Share$/], { settle: 2200, duration: 0.05 });
      tree = readTree(udid, join(scratch, `clip-retry-${outer}-share.json`));
      await tapLabel(udid, device, tree, [/檢視較多/, /Show More/], {
        settle: 1600,
        duration: 0.05,
        yBias: 0,
      });
      tree = readTree(udid, join(scratch, `clip-retry-${outer}-more.json`));
      const retryHit = await locateAddByHitTest(`clip-retry-${outer}-locate`);
      if (retryHit) {
        tapPoint(udid, device, retryHit.x, retryHit.y, { duration: 0.05 });
        await sleep(2200);
        tree = readTree(udid, join(scratch, `clip-retry-${outer}-form.json`));
      } else {
        await tapLabel(udid, device, tree, [/加入主畫面/, /Add to Home Screen/], {
          settle: 2200,
          duration: 0.05,
        });
        tree = readTree(udid, join(scratch, `clip-retry-${outer}-form.json`));
      }
    }
    ready = await waitForAddFormReady("clip-form-retry");
    tree = ready.tree || tree;
  }
  if (!ready.ready && !isAddToHomeForm(treeLabels(tree))) {
    console.log("ios-standalone: note — could not reopen a populated Add to Home Screen form");
    await capture(udid, join(scratch, "clip-confirm-miss.png"));
    return false;
  }

  let confirmed = await confirmAddOnForm("clip-confirm");
  if (!confirmed) {
    console.log("ios-standalone: note — Add to Home Screen form opened but Confirm/Add was not tappable");
    await capture(udid, join(scratch, "clip-confirm-miss.png"));
    return false;
  }
  await capture(udid, join(scratch, "clip-after-confirm.png"));
  run("baguette", ["press", "--udid", udid, "--button", "home"]);
  await sleep(2000);
  const created = Boolean(findWebClip(udid, url));
  if (!created) {
    console.log("ios-standalone: note — Add flow finished but no WebKit.PushBundle clip was installed");
  }
  return created;
}

// Safari's chrome is the tell: while it is on screen the springboard has not
// arrived yet, and reading the tree too early is how a launch step silently
// looks at the wrong surface. Waiting for the tell to disappear is what makes
// the icon tap land on the home screen rather than inside the browser.
const BROWSER_CHROME = /^(網址|URL|重新整理|Reload|頁面選單.*|Page Menu|返回|Back|分享|Share)$/;

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

async function dismissIconEditMode(udid, device, tree, scratch, tag) {
  const done = labelledNodes(tree).find((node) => /^(完成|Done)$/.test(node.label));
  if (!done) return tree;
  console.log(`ios-standalone: note — springboard icon edit mode; tapping ${done.label}`);
  tapNode(udid, device, done, tree, { duration: 0.05 });
  await sleep(1500);
  return readTree(udid, join(scratch, `${tag}-after-edit.json`)) || tree;
}

async function swipeHomePage(udid, device, direction = "next") {
  const width = device.screen.width;
  const height = device.screen.height;
  const y = Math.round(height * 0.5);
  const from = direction === "next" ? Math.round(width * 0.85) : Math.round(width * 0.15);
  const to = direction === "next" ? Math.round(width * 0.15) : Math.round(width * 0.85);
  return run("baguette", [
    "swipe", "--udid", udid,
    "--start-x", String(from), "--start-y", String(y),
    "--end-x", String(to), "--end-y", String(y),
    "--width", String(width), "--height", String(height),
    "--duration", "0.28",
  ]);
}

function findClipIcon(tree, clipName) {
  return labelledNodes(tree).find((node) => node.label === clipName
    && node.role === "AXButton"
    && Number(node.frame.width || 0) >= 48
    && Number(node.frame.height || 0) >= 48);
}

// Tapping a home-screen icon needs the icon's whereabouts, and the springboard's
// accessibility tree is the reliable place to find it — the tree names each icon
// and its frame. What the tree is *not* reliable for is "who is in front": it has
// named the springboard while the web app was on screen and painting. So the tap
// is found here and judged by pixels in the caller, never by a frontmost read.
//
// A hold (~0.1s) opens icon-edit / jiggle mode instead of launching the clip
// (measured on iOS 27). Use a short tap, dismiss edit mode if it appears, and
// only return success once the tree is no longer the springboard.
async function returnToSpringboard(udid, scratch, tag, { attempts = 8 } = {}) {
  terminateBrowserSurfaces(udid);
  let arrived = false;
  let tree = null;
  for (let attempt = 0; attempt < attempts && !arrived; attempt += 1) {
    run("baguette", ["press", "--udid", udid, "--button", "home"]);
    await sleep(2200);
    tree = readTree(udid, join(scratch, `${tag}-home-try${attempt}.json`));
    const labels = labelledNodes(tree).map((node) => node.label);
    arrived = (labels.length > 0 && !frontmostApp(tree)) || isSpringboardTree(tree);
    if (isSafariBrowserTree(tree)) {
      run("xcrun", ["simctl", "terminate", udid, "com.apple.mobilesafari"]);
      await sleep(800);
    }
  }
  return { arrived, tree };
}

async function launchFromHomeScreen(udid, device, clipName, scratch, tag) {
  const { arrived } = await returnToSpringboard(udid, scratch, tag);
  if (!arrived) return { tapped: false, home: null, via: "homescreen" };
  const home = await capture(udid, join(scratch, `${tag}-home.png`));

  for (let page = 0; page < 6; page += 1) {
    let tree = readTree(udid, join(scratch, `${tag}-home-${page}.json`));
    tree = await dismissIconEditMode(udid, device, tree, scratch, `${tag}-p${page}`);
    const icon = findClipIcon(tree, clipName);
    if (icon) {
      for (let tryTap = 0; tryTap < 4; tryTap += 1) {
        console.log(`ios-standalone: tapping home-screen icon "${clipName}" (try ${tryTap + 1})`);
        // baguette defaults to 0.05s; anything near that can open icon-edit on iOS 27.
        // The AX frame includes the caption; centre tap hits the label and opens
        // 「刪除書籤」 instead of launching. Aim at the glyph.
        tapNode(udid, device, icon, tree, { duration: 0.02, yShare: 0.33 });
        await sleep(4000);
        let after = readTree(udid, join(scratch, `${tag}-after-tap-${tryTap}.json`));
        after = await dismissIconEditMode(udid, device, after, scratch, `${tag}-tap${tryTap}`);
        after = await dismissBlockingAlerts(udid, device, after, scratch, `${tag}-tap${tryTap}`);
        const labels = treeLabels(after);
        if (labels.some((label) => /分享書籤|刪除書籤|編輯主畫面/.test(label))) {
          console.log("ios-standalone: note — icon tap opened a bookmark menu; dismissing");
          run("baguette", ["press", "--udid", udid, "--button", "home"]);
          await sleep(1200);
          tree = readTree(udid, join(scratch, `${tag}-home-${page}-retry.json`));
          continue;
        }
        if (isHomeScreenWebAppTree(after) || (!isSpringboardTree(after) && !isSafariBrowserTree(after))) {
          return { tapped: true, home, via: "homescreen" };
        }
        if (isSafariBrowserTree(after)) {
          console.log("ios-standalone: note — icon tap opened Safari, not the home-screen WebClip; retrying");
        }
        tree = after || readTree(udid, join(scratch, `${tag}-home-${page}-retry.json`));
        if (!findClipIcon(tree, clipName)) break;
      }
    }
    const swiped = await swipeHomePage(udid, device, page < 3 ? "next" : "prev");
    if (!swiped.ok) {
      console.log(`ios-standalone: note — home-page swipe failed: ${(swiped.stderr || swiped.stdout || "").trim()}`);
    }
    await sleep(1600);
  }
  return { tapped: false, home, via: "homescreen" };
}

// simctl launch fails for WebKit.PushBundle ("unknown to FrontBoard"); the Home
// Screen icon tap is the real launch path.
async function launchWebClip(udid, device, clip, scratch, tag) {
  return launchFromHomeScreen(udid, device, clip.name, scratch, tag);
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
async function waitForStableInk(udid, screen, scratch, tag, floor, {
  minWaitMs = 12000,
  attempts = 14,
  allowSafariBrowser = false,
} = {}) {
  const started = Date.now();
  let previous = null;
  let last = null;
  let lastTree = null;
  let path = join(scratch, `${tag}-0.png`);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    path = join(scratch, `${tag}-${attempt}.png`);
    last = await capture(udid, path);
    lastTree = readTree(udid, join(scratch, `${tag}-${attempt}.json`));
    const kind = captureSurfaceKind(lastTree, last, screen, { allowSafariBrowser });
    const ink = last ? bandInk(last, screen).dark : 0;
    const settled = previous && last ? frameDifference(previous, last) < 0.02 : false;
    if (last && ink >= floor && settled && kind === "desk" && Date.now() - started >= minWaitMs) {
      return { pixels: last, path, attempts: attempt + 1, kind };
    }
    previous = last;
    await sleep(2500);
  }
  return {
    pixels: last,
    path,
    attempts,
    kind: captureSurfaceKind(lastTree, last, screen, { allowSafariBrowser }),
  };
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
            // The title bar keeps each appearance's own controls on touch (owner's
            // decision, 2026-09-26): its boxes are the era's size, not a finding.
            // The grow box is the same family of window chrome — not a game control.
            .filter(({ el }) => !el.closest(".title-bar, .grow-box"))
            .filter(({ el }) => !el.classList?.contains("grow-box"))
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
      await page.waitForSelector('[data-one-more-tune-view="challenge"]', { state: "attached", timeout: 60000 });
      await page.evaluate(() => {
        const tab = document.querySelector('[data-one-more-tune-view="challenge"]');
        tab?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
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
      const startVisible = await page.evaluate(() => {
        const start = document.querySelector('[data-one-more-tune-command="one-more-tune-start-round"]');
        if (!start) return false;
        start.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        return true;
      });
      if (startVisible) {
        await page.waitForTimeout(1600);
        // Challenge answers are `.omt-opt[data-one-more-tune-submit]`; older
        // faces and Next Act still use `.choice`. Prefer the live submit key.
        const chose = await page.evaluate(() => {
          const choice = document.querySelector(
            '[data-one-more-tune-submit], .omt-opt[data-one-more-tune-submit], .choice',
          );
          if (!choice) return false;
          choice.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          return true;
        });
        if (chose) {
          await page.waitForSelector('.omt-room[data-omt-phase="reveal"] .omt-notes', {
            state: "attached",
            timeout: 60000,
          }).catch(() => null);
          await page.waitForTimeout(900);
          await settleGeometry(page);
          reveal = await audit(orientation.box);
        }
      }
      // Next Act's reveal is the one that carries an explanation rather than a
      // credit line: it is the sentence a person reads after answering, so it is
      // the text this phase must find whole.
      let line = null;
      const lineTabVisible = await page.evaluate(() => {
        const lineTab = document.querySelector('[data-one-more-tune-view="line"]');
        if (!lineTab) return false;
        lineTab.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        return true;
      });
      if (lineTabVisible) {
        await page.waitForTimeout(300);
        const lineStarted = await page.evaluate(() => {
          const lineStart = document.querySelector('[data-one-more-tune-command="one-more-tune-line-start"]');
          if (!lineStart) return false;
          lineStart.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          return true;
        });
        if (lineStarted) {
          await page.waitForFunction(() => /1\s*\/\s*10/.test(document.querySelector("#one-more-tune-body")?.innerText || ""), null, { timeout: 60000 });
          await page.waitForTimeout(300);
          await page.evaluate(() => {
            const lineChoice = document.querySelector("[data-one-more-tune-line-answer]");
            lineChoice?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          });
          await page.waitForTimeout(900);
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
              .filter((el) => !el.closest(".title-bar, .grow-box") && !el.classList.contains("grow-box"))
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

function printHelp() {
  console.log([
    "node tooling/verify-ios-standalone.mjs [options]",
    "",
    "Simulator (default):",
    "  --device <name>       iPhone simulator name (default: iPhone Air)",
    "  --url <url>           desk URL (default: http://localhost:4173/)",
    "  --create-clip         walk Safari Add to Home Screen when no clip exists",
    "  --reset-state         clear WebKit WebsiteData for a first-run launch",
    "  --keep-server         leave a spawned server running",
    "  --out <dir>           receipt directory",
    "",
    "Physical iPhone (CoreDevice-paired):",
    "  --physical            use xcrun devicectl against Reality=physical",
    "  --lan-url             rewrite localhost → Mac LAN IP; spawn server with LAN env",
    "  --await-home-launch   after Add to Home Screen, wait for you to open the icon",
    "  --guided-keyboard     you tap the composer; instrument screenshots the keys",
    "  --clip-bundle-id <id> launch com.apple.WebKit.PushBundle.… when known",
    "  --clip-name <name>    home-screen icon label (default: AI System 6)",
    "",
    "Device receipt (Mirroring-only / offline grade of real-phone PNGs):",
    "  --device-receipt <dir>  grade safari-baseline.png + standalone-rest.png",
    "  --write-receipt-template  write manifest.json + README into --out/receipt-template",
    "",
    "Physical WebClip Info.plist is not readable from the Mac. Do not expect",
    "Simulator findWebClip paths on a real phone. iPhone Mirroring helps you",
    "Add to Home Screen; CoreDevice pairing is required for live screenshots.",
  ].join("\n"));
}

function finishSummary({ args, server, summary, failures, scratch, deviceLabel }) {
  if (server.child && !args.keepServer) server.child.kill("SIGTERM");
  summary.failures = failures;
  writeFileSync(join(scratch, "result.json"), `${JSON.stringify(summary, null, 2)}\n`);
  const verdict = failures.length ? "FAIL" : "OK";
  console.log(`\nios-standalone  ${deviceLabel}  ${verdict}`);
  console.log(`  served build: ${summary.servedBuild || "(unknown)"}`);
  console.log(
    `  desk band — Safari ${summary.browserBaseline?.ink ?? "-"} ink`
    + ` (${summary.browserBaseline?.kind || "?"}${summary.browserBaseline?.usable === false ? ", unused" : ""});`
    + ` PWA at rest ${summary.rest?.ink ?? "-"} ink / shape ${summary.rest?.match ?? "-"}`
    + ` [${summary.rest?.gradeMode || "?"}];`
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
  if (summary.target) console.log(`  target: ${summary.target}`);
  if (failures.length) {
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(`  receipt: ${join(scratch, "result.json")}`);
    process.exit(1);
  }
}

function inkKindHeuristic(ink) {
  if (ink > 0 && ink < 12000) return "boot-failure";
  if (ink >= DESK_INK_FLOOR) return "desk";
  return "unknown";
}

function gradePwaDeskBand({
  rest,
  restInk,
  restMatch,
  restKind,
  baselineInk,
  baselineKind,
  baselineUsable,
  floor,
  launch,
  scratch,
  failures,
}) {
  if (restKind === "springboard") {
    throw new Error(
      `the PWA launch did not leave the home screen, so nothing was measured`
      + ` (an instrument problem, not a verdict about the desk; see ${rest.path})`,
    );
  }
  if (restKind === "boot-failure") {
    failures.push([
      `the home-screen PWA painted boot_failed_recovery, not the desk (${restInk.dark} ink).`,
      baselineUsable ? `Safari desk holds ${baselineInk.dark}.` : "Safari baseline was not a usable desk (different origin / not required when a WebClip exists).",
      `Screenshot: ${rest.path}`,
    ].join(" "));
    return;
  }
  if (restInk.dark < floor) {
    const leftHomeScreen = launch?.home && rest.pixels ? frameDifference(launch.home, rest.pixels) > 0.02 : true;
    if (!leftHomeScreen) {
      throw new Error(
        `the icon tap did not leave the home screen, so nothing was measured`
        + ` (an instrument problem, not a verdict about the desk; see ${join(scratch, "measured-home.png")})`,
      );
    }
    failures.push([
      `the home-screen PWA painted ${restInk.dark} ink pixels in the desk band (floor ${floor}`
      + (baselineUsable ? `, Safari desk ${baselineInk.dark}` : ", absolute desk floor")
      + "): the desk's own top chrome is missing from the visible area.",
      `Screenshot: ${rest.path}`,
    ].join(" "));
    return;
  }
  // Shape match only when Safari actually painted a desk. Comparing a healthy
  // PWA to Safari Sad Mac / a blank 127.0.0.1 session is the wrong question —
  // localhost WebClip and Safari@127.0.0.1 are different origins.
  if (baselineUsable && baselineKind === "desk" && restMatch < PROFILE_MATCH) {
    failures.push([
      `the home-screen PWA band does not have the desk's shape (match ${restMatch.toFixed(2)} against Safari's rows, need ${PROFILE_MATCH}):`,
      "something is painted there — a launch splash or the home screen — but not the desk Safari draws for the same build.",
      `Screenshot: ${rest.path}`,
    ].join(" "));
  } else if (!baselineUsable) {
    console.log(
      "ios-standalone: grading PWA by absolute desk ink/kind"
      + ` (${restInk.dark} ink, kind=${restKind}); Safari baseline was ${baselineKind || "unavailable"} — not required when a WebClip exists`,
    );
  }
}

async function gradeDesktopBand({
  url,
  deviceName,
  screen,
  scratch,
  summary,
  failures,
  captureFrame,
  openBaseline,
  launchStandalone,
  afterWarmup,
  raiseKeyboard,
  requireSafariDesk = false,
}) {
  summary.servedBuild = summary.servedBuild || await servedBuild(url);
  console.log(`ios-standalone: the server is serving build ${summary.servedBuild || "(unknown)"}`);
  summary.screen = screen;

  let baselineInk = { dark: 0 };
  let baselineRows = [];
  let baselineKind = "unavailable";
  let baselineUsable = false;
  try {
    await openBaseline();
    const baseline = await waitForStableInkCapture(captureFrame, screen, scratch, "safari-baseline", MIN_INK, {
      minWaitMs: 14000,
      rejectBootFailureInk: true,
    });
    baselineInk = baseline.pixels ? bandInk(baseline.pixels, screen) : { dark: 0 };
    baselineKind = baseline.kind || inkKindHeuristic(baselineInk.dark);
    baselineUsable = baselineKind === "desk" && baselineInk.dark >= DESK_INK_FLOOR;
    summary.browserBaseline = {
      path: baseline.path,
      ink: baselineInk.dark,
      attempts: baseline.attempts,
      kind: baselineKind,
      usable: baselineUsable,
    };
    if (baselineUsable) baselineRows = baseline.pixels ? bandRows(baseline.pixels, screen) : [];
  } catch (error) {
    summary.browserBaseline = {
      path: null,
      ink: 0,
      attempts: 0,
      kind: "error",
      usable: false,
      error: String(error?.message || error),
    };
    if (requireSafariDesk) throw error;
    console.log(`ios-standalone: note — Safari baseline skipped/failed (${error?.message || error}); grading PWA absolutely`);
  }

  if (requireSafariDesk && !baselineUsable) {
    throw new Error(
      `Safari in browser mode painted ${baselineKind}, not the desk`
      + ` (${baselineInk.dark} ink). Without a WebClip this instrument needs Safari as the reference surface.`,
    );
  }

  const floor = baselineUsable
    ? Math.max(DESK_INK_FLOOR, Math.round(baselineInk.dark * BASELINE_SHARE))
    : DESK_INK_FLOOR;
  console.log(
    baselineUsable
      ? `ios-standalone: Safari desk ${baselineInk.dark} ink; PWA must reach ${floor} with shape ≥ ${PROFILE_MATCH}`
      : `ios-standalone: PWA-first grade — absolute desk floor ${floor} ink (Safari baseline not a usable desk)`,
  );

  const warmup = await launchStandalone("warmup");
  if (!warmup.ok) {
    throw new Error(warmup.error || "home-screen launch failed on warmup");
  }
  const warmupInk = await waitForStableInkCapture(captureFrame, screen, scratch, "standalone-warmup", floor, {
    minWaitMs: 14000,
    attempts: 8,
    rejectBootFailureInk: true,
  });
  summary.warmup = {
    path: warmupInk.path,
    ink: warmupInk.pixels ? bandInk(warmupInk.pixels, screen).dark : 0,
    kind: warmupInk.kind || inkKindHeuristic(warmupInk.pixels ? bandInk(warmupInk.pixels, screen).dark : 0),
  };
  console.log(`ios-standalone: launch one painted ${summary.warmup.ink} ink pixels — adopting the served build`);
  if (afterWarmup) await afterWarmup();
  await sleep(2500);

  const launch = await launchStandalone("measured");
  if (!launch.ok) {
    throw new Error(launch.error || "home-screen launch failed on measured pass");
  }
  const rest = await waitForStableInkCapture(captureFrame, screen, scratch, "standalone-rest", floor, {
    minWaitMs: 16000,
    attempts: 14,
    rejectBootFailureInk: true,
  });
  const restInk = rest.pixels ? bandInk(rest.pixels, screen) : { dark: 0 };
  const restMatch = baselineUsable && rest.pixels ? profileMatch(baselineRows, bandRows(rest.pixels, screen)) : 1;
  const restKind = rest.kind || inkKindHeuristic(restInk.dark);
  summary.screenshot = rest.path;
  summary.rest = {
    path: rest.path,
    ink: restInk.dark,
    match: Number(restMatch.toFixed(3)),
    attempts: rest.attempts,
    kind: restKind,
    gradeMode: baselineUsable ? "safari-shape" : "absolute-desk",
  };
  gradePwaDeskBand({
    rest,
    restInk,
    restMatch,
    restKind,
    baselineInk,
    baselineKind,
    baselineUsable,
    floor,
    launch,
    scratch,
    failures,
  });

  let raised = null;
  let shift = 0;
  if (raiseKeyboard) {
    ({ raised, shift } = await raiseKeyboard({ rest, screen, scratch }));
  } else {
    console.log(
      "ios-standalone: note — keyboard phase skipped on this target"
      + " (no HID automation; pass --guided-keyboard on --physical, or include standalone-keyboard.png in a device receipt)",
    );
  }
  const raisedInk = raised ? bandInk(raised, screen) : { dark: 0 };
  const restRows = rest.pixels ? bandRows(rest.pixels, screen) : [];
  const raisedMatch = raised ? profileMatch(restRows, bandRows(raised, screen)) : 0;
  summary.keyboard = {
    path: raised ? join(scratch, "standalone-keyboard.png") : null,
    ink: raisedInk.dark,
    match: Number(raisedMatch.toFixed(3)),
    bottomChanged: Number(shift.toFixed(3)),
  };
  if (raiseKeyboard && shift < KEYBOARD_SHIFT) {
    console.log(
      "ios-standalone: note — the composer could not be focused, so the keyboard phase did not run;"
      + " the desk was measured at rest only",
    );
  } else if (raiseKeyboard && (raisedInk.dark < floor || raisedMatch < PROFILE_MATCH)) {
    failures.push([
      `with the keyboard up the home-screen band holds ${raisedInk.dark} ink pixels (floor ${floor})`
      + ` and matches the desk's own rows at ${raisedMatch.toFixed(2)} (need ${PROFILE_MATCH}):`,
      "the desk's top chrome leaves the visible area once the software keyboard is up.",
      `Screenshot: ${summary.keyboard.path}`,
    ].join(" "));
  }

  await geometryPhase({ url, deviceName, screen, scratch, summary, failures });
}

async function waitForStableInkCapture(captureFrame, screen, scratch, tag, floor, {
  minWaitMs = 12000,
  attempts = 14,
  rejectBootFailureInk = false,
} = {}) {
  const started = Date.now();
  let previous = null;
  let last = null;
  let path = join(scratch, `${tag}-0.png`);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    path = join(scratch, `${tag}-${attempt}.png`);
    last = await captureFrame(path);
    const ink = last ? bandInk(last, screen).dark : 0;
    const kind = inkKindHeuristic(ink);
    const settled = previous && last ? frameDifference(previous, last) < 0.02 : false;
    const deskOk = !rejectBootFailureInk || kind === "desk";
    if (last && ink >= floor && settled && deskOk && Date.now() - started >= minWaitMs) {
      return { pixels: last, path, attempts: attempt + 1, kind };
    }
    previous = last;
    await sleep(2500);
  }
  const finalInk = last ? bandInk(last, screen).dark : 0;
  return { pixels: last, path, attempts, kind: inkKindHeuristic(finalInk) };
}

async function runPhysicalInstrument(args, scratch) {
  let server = { child: null };
  let failures = [];
  let deviceLabel = "physical iPhone";
  const summary = {
    stamp: scratch.split("/").pop(),
    target: "physical",
    url: args.url,
    device: { name: args.device, runtime: "", udid: "", reality: "physical" },
    baguette: null,
    servedBuild: "",
    screenshot: null,
    clip: null,
    failures: [],
    capabilities: {
      hidTaps: false,
      filesystemWebClips: false,
      guidedHomeLaunch: true,
    },
  };

  try {
    requireDevicectl();
    const resolved = resolvePhysicalUrl(args.url, { lanUrl: args.lanUrl });
    const url = resolved.url;
    summary.url = url;
    const device = pickPhysicalDevice(args.device, scratch);
    deviceLabel = `${device.name} (physical)`;
    summary.device = {
      name: device.name,
      runtime: device.runtime,
      udid: device.udid,
      reality: "physical",
    };
    console.log(
      `ios-standalone: physical · ${device.name} (${device.runtime || "iOS"})`
      + ` udid=${device.udid}`
      + (resolved.rewritten ? ` · url rewritten → ${url}` : ` · url ${url}`),
    );
    if (args.createClip) {
      console.log(
        "ios-standalone: note — --create-clip cannot automate Safari's share sheet on a physical phone"
        + " (no baguette HID). Use iPhone Mirroring / on-device Add to Home Screen, then --await-home-launch.",
      );
    }
    if (args.resetState) {
      console.log(
        "ios-standalone: note — --reset-state cannot clear WebsiteData on a physical phone"
        + " (no CoreSimulator WebKit store). Terminate/reopen the clip by hand if you need a first run.",
      );
    }
    let lanEnv = null;
    if (resolved.rewritten || args.lanUrl) {
      const lanHost = resolved.lanHost || detectLanIPv4();
      lanEnv = physicalServerEnv({
        port: new URL(url).port || "4173",
        lanHost,
        authToken: process.env.AI_SYSTEM6_AUTH_TOKEN || makeLanAuthToken(),
      });
      console.log(
        `ios-standalone: LAN server env Host=${lanEnv.AI_SYSTEM6_HOST}`
        + ` (phone must open ${url}; API trusts this Host without a custom header)`,
      );
    }
    if (!serverReady(url)) {
      const loopbackUrl = rewriteLoopbackUrl(url);
      if (loopbackUrl && serverReady(loopbackUrl)) {
        throw new Error([
          `the desk answers on loopback (${loopbackUrl}) but not at ${url}.`,
          "Stop that server and re-run with --lan-url so this tool can bind 0.0.0.0",
          "with AI_SYSTEM6_ALLOW_LAN=1 and AI_SYSTEM6_HOST=<mac-lan-ip>, or restart",
          "yourself with those env vars before opening the phone.",
        ].join("\n"));
      }
    }
    server = await ensureServer(url, args.keepServer, lanEnv);
    summary.servedBuild = await servedBuild(url);

    let screen = readDeviceScreen(device.udid, scratch);
    if (!screen) {
      // Fallback: common iPhone 17 logical points when displays JSON is sparse.
      screen = standaloneInsets(device.name)
        ? { width: 402, height: 874 }
        : { width: 402, height: 874 };
      console.log(
        `ios-standalone: note — devicectl displays did not yield size;`
        + ` using ${screen.width}x${screen.height} points (override via a device receipt if wrong)`,
      );
    }
    summary.screen = screen;

    let clip = findWebClipOnDevice(device.udid, url, scratch, {
      clipName: args.clipName,
      clipBundleId: args.clipBundleId,
    });
    if (!clip && args.awaitHomeLaunch) {
      clip = {
        bundleId: args.clipBundleId || "",
        name: args.clipName || "AI System 6",
        manifestId: url,
        source: "guided",
      };
    }
    if (!clip) {
      printPhysicalClipGuide({ udid: device.udid, url, deviceName: device.name });
      throw new Error(
        `no home-screen web app listed for ${url} on physical ${device.name}.`
        + ` Add to Home Screen on the phone (Mirroring OK), then re-run with`
        + ` --await-home-launch (and --guided-keyboard if you want the keys phase)`,
      );
    }
    summary.clip = clip;
    console.log(
      `ios-standalone: physical clip "${clip.name}"`
      + (clip.bundleId ? ` (${clip.bundleId})` : " (guided launch — no bundle id)")
      + ` via ${clip.source}`,
    );

    const captureFrame = async (path) => {
      const shot = captureDeviceScreenshot(device.udid, path);
      if (!shot.ok) return null;
      return pixelsOf(path).catch(() => null);
    };

    await gradeDesktopBand({
      url,
      deviceName: device.name,
      screen,
      scratch,
      summary,
      failures,
      // Physical path already requires a WebClip / guided launch — grade the
      // installed surface. Safari chrome is optional shape reference only.
      requireSafariDesk: false,
      captureFrame,
      openBaseline: async () => {
        const opened = openUrlOnDevice(device.udid, url);
        if (!opened.ok) {
          throw new Error(`devicectl openURL failed: ${opened.stderr || opened.stdout}`);
        }
        await sleep(12000);
      },
      launchStandalone: async (tag) => {
        if (clip.bundleId) {
          const launched = launchAppOnDevice(device.udid, clip.bundleId);
          if (!launched.ok) {
            console.log(
              `ios-standalone: note — launch ${clip.bundleId} failed;`
              + ` falling back to guided Home Screen open (${launched.stderr || launched.stdout})`,
            );
          } else {
            await sleep(4000);
            return { ok: true, home: await captureFrame(join(scratch, `${tag}-home.png`)) };
          }
        }
        await promptLine(
          `ios-standalone: on the physical phone (Mirroring OK), open the Home Screen icon "${clip.name}", then press Enter here… `,
        );
        const home = await captureFrame(join(scratch, `${tag}-home.png`));
        await sleep(2000);
        return { ok: true, home };
      },
      afterWarmup: async () => {
        // No simctl terminate; ask for a clean second launch.
        await promptLine(
          "ios-standalone: press Home / swipe home on the phone so the clip can relaunch, then Enter… ",
        );
      },
      raiseKeyboard: args.guidedKeyboard
        ? async ({ rest, screen: phoneScreen, scratch: dir }) => {
          await promptLine(
            "ios-standalone: tap the composer so the software keyboard is up, then press Enter… ",
          );
          const raised = await captureFrame(join(dir, "standalone-keyboard.png"));
          const shift = rest.pixels && raised ? bottomChanged(rest.pixels, raised) : 0;
          return { raised, shift };
        }
        : null,
    });
  } catch (error) {
    failures.push(String(error?.message || error));
  }

  finishSummary({
    args,
    server,
    summary,
    failures,
    scratch,
    deviceLabel,
  });
}

async function runDeviceReceiptInstrument(args, scratch) {
  const receiptDir = resolve(args.deviceReceipt);
  const receipt = readDeviceReceipt(receiptDir);
  const url = receipt.manifest.url || args.url;
  const deviceName = receipt.manifest.deviceName || args.device || "iPhone";
  const screen = receipt.manifest.screen;
  console.log(`ios-standalone: device-receipt · ${receiptDir}`);
  console.log(
    "ios-standalone: grading real-phone PNGs (not Simulator WebClips)."
    + " This does not fake a Pass — the pixels must carry desk ink.",
  );

  let server = { child: null };
  let failures = [];
  const summary = {
    stamp: scratch.split("/").pop(),
    target: "device-receipt",
    url,
    device: { name: deviceName, runtime: receipt.manifest.runtime || "", udid: "receipt", reality: "physical-receipt" },
    baguette: null,
    servedBuild: "",
    screenshot: null,
    clip: receipt.manifest.clipName
      ? { name: receipt.manifest.clipName, bundleId: receipt.manifest.clipBundleId || "", manifestId: url, source: "receipt" }
      : null,
    failures: [],
    receiptDir,
  };

  try {
    if (serverReady(url)) {
      summary.servedBuild = await servedBuild(url);
    } else {
      console.log(
        "ios-standalone: note — server not reachable at receipt URL;"
        + " band grade still runs on the PNGs; geometry phase needs a live URL",
      );
    }

    const copyInto = (src, name) => {
      const dest = join(scratch, name);
      copyFileSync(src, dest);
      return dest;
    };
    const baselinePath = copyInto(receipt.paths.safariBaseline, "safari-baseline-0.png");
    const restPath = copyInto(receipt.paths.standaloneRest, "standalone-rest-0.png");
    const baseline = await pixelsOf(baselinePath);
    const rest = await pixelsOf(restPath);
    const baselineInk = baseline ? bandInk(baseline, screen) : { dark: 0 };
    const restInk = rest ? bandInk(rest, screen) : { dark: 0 };
    const baselineKind = inkKindHeuristic(baselineInk.dark);
    const baselineUsable = baselineKind === "desk" && baselineInk.dark >= DESK_INK_FLOOR;
    const restMatch = baselineUsable && baseline && rest
      ? profileMatch(bandRows(baseline, screen), bandRows(rest, screen))
      : 1;
    const floor = baselineUsable
      ? Math.max(DESK_INK_FLOOR, Math.round(baselineInk.dark * BASELINE_SHARE))
      : DESK_INK_FLOOR;
    const restKind = inkKindHeuristic(restInk.dark);
    summary.browserBaseline = {
      path: baselinePath,
      ink: baselineInk.dark,
      attempts: 1,
      kind: baselineKind,
      usable: baselineUsable,
    };
    summary.rest = {
      path: restPath,
      ink: restInk.dark,
      match: Number(restMatch.toFixed(3)),
      attempts: 1,
      kind: restKind,
      gradeMode: baselineUsable ? "safari-shape" : "absolute-desk",
    };
    summary.screenshot = restPath;
    summary.screen = screen;

    if (!baselineUsable) {
      console.log(
        `ios-standalone: note — receipt Safari baseline is ${baselineKind} (${baselineInk.dark} ink);`
        + ` grading PWA with absolute desk floor ${floor}`,
      );
    }
    gradePwaDeskBand({
      rest: { path: restPath, pixels: rest },
      restInk,
      restMatch,
      restKind,
      baselineInk,
      baselineKind,
      baselineUsable,
      floor,
      launch: { home: null },
      scratch,
      failures,
    });

    if (receipt.paths.standaloneKeyboard) {
      const keyPath = copyInto(receipt.paths.standaloneKeyboard, "standalone-keyboard.png");
      const raised = await pixelsOf(keyPath);
      const shift = baseline && raised ? bottomChanged(rest, raised) : 0;
      const raisedInk = raised ? bandInk(raised, screen) : { dark: 0 };
      const raisedMatch = rest && raised
        ? profileMatch(bandRows(rest, screen), bandRows(raised, screen))
        : 0;
      summary.keyboard = {
        path: keyPath,
        ink: raisedInk.dark,
        match: Number(raisedMatch.toFixed(3)),
        bottomChanged: Number(shift.toFixed(3)),
      };
      if (shift >= KEYBOARD_SHIFT && (raisedInk.dark < floor || raisedMatch < PROFILE_MATCH)) {
        failures.push(
          `receipt keyboard frame fails desk-band check (${raisedInk.dark} ink, match ${raisedMatch.toFixed(2)})`,
        );
      } else if (shift < KEYBOARD_SHIFT) {
        console.log(
          "ios-standalone: note — receipt keyboard PNG did not differ enough in the lower screen;"
          + " treating keyboard phase as not exercised",
        );
      }
    } else {
      summary.keyboard = { path: null, ink: 0, match: 0, bottomChanged: 0 };
      console.log("ios-standalone: note — no standalone-keyboard.png in receipt; keyboard phase skipped");
    }

    if (serverReady(url)) {
      await geometryPhase({ url, deviceName, screen, scratch, summary, failures });
    } else {
      console.log("ios-standalone: note — geometry phase skipped (server not up for receipt URL)");
    }
  } catch (error) {
    failures.push(String(error?.message || error));
  }

  finishSummary({
    args,
    server,
    summary,
    failures,
    scratch,
    deviceLabel: `${deviceName} (device-receipt)`,
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const stamp = `iOSStandalone-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const scratch = join(args.out, stamp);
  mkdirSync(scratch, { recursive: true });

  if (args.writeReceiptTemplate) {
    const dir = join(args.out, "receipt-template");
    mkdirSync(dir, { recursive: true });
    writeDeviceReceiptTemplate(dir, {
      url: args.url,
      deviceName: args.device,
      screen: { width: 402, height: 874 },
    });
    console.log(`ios-standalone: wrote device-receipt template under ${dir}`);
    return;
  }

  if (args.deviceReceipt) {
    return runDeviceReceiptInstrument(args, scratch);
  }

  if (args.physical) {
    return runPhysicalInstrument(args, scratch);
  }

  const baguette = requireBaguette();
  const device = pickDevice(args.device);
  console.log(`ios-standalone: ${baguette} · ${device.name} (${device.runtime})${device.alreadyBooted ? " already booted" : ""}`);

  let server = { child: null };
  let failures = [];
  const summary = {
    stamp,
    target: "simulator",
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

    let clip = findWebClip(device.udid, args.url);
    if (args.resetState) {
      terminateBrowserSurfaces(device.udid, clip?.bundleId);
      await sleep(1500);
      const cleared = clearWebKitState(device.udid);
      console.log(`ios-standalone: cleared ${cleared} WebKit store(s) before launch, so this run opens on a first run`);
      await sleep(800);
    }

    // Optional Safari shape reference. Clip installs claim localhost; openurl
    // therefore uses 127.0.0.1 — a different origin — so a Sad Mac there must
    // not abort the PWA grade when the WebClip already exists.
    let baselineInk = { dark: 0 };
    let baselineRows = [];
    let baselineKind = "unavailable";
    let baselineUsable = false;
    const baselineUrl = safariBrowserUrl(args.url);
    // Keep Safari in front: a leftover springboard photograph is useless as a
    // shape reference, and Reload must not be a long-press (iOS 27 jiggle).
    let opened = run("baguette", ["openurl", "--udid", device.udid, baselineUrl]);
    if (!opened.ok) {
      console.log(
        `ios-standalone: note — Safari openurl failed for ${baselineUrl}:`
        + ` ${(opened.stderr || opened.stdout || "").trim()}; continuing with PWA-first grade`,
      );
    } else {
      console.log(`ios-standalone: Safari baseline URL ${baselineUrl} (shape reference only when a WebClip exists)`);
      await sleep(3000);
      let safariChrome = readTree(device.udid, join(scratch, "safari-open.json"));
      if (!isSafariBrowserTree(safariChrome)) {
        opened = run("baguette", ["openurl", "--udid", device.udid, baselineUrl]);
        await sleep(3000);
        safariChrome = readTree(device.udid, join(scratch, "safari-open-retry.json"));
      }
      if (isSafariBrowserTree(safariChrome)) {
        await tapLabel(device.udid, shaped, safariChrome, [/^(重新整理|Reload)$/], { settle: 2500, duration: 0.03 });
      }
      const baseline = await waitForStableInk(device.udid, screen, scratch, "safari-baseline", MIN_INK, {
        minWaitMs: 16000,
        attempts: 12,
        allowSafariBrowser: true,
      });
      baselineInk = baseline.pixels ? bandInk(baseline.pixels, screen) : { dark: 0 };
      baselineKind = baseline.kind || inkKindHeuristic(baselineInk.dark);
      baselineUsable = baselineKind === "desk" && baselineInk.dark >= DESK_INK_FLOOR;
      summary.browserBaseline = {
        path: baseline.path,
        ink: baselineInk.dark,
        attempts: baseline.attempts,
        kind: baselineKind,
        usable: baselineUsable,
      };
      if (baselineUsable) baselineRows = baseline.pixels ? bandRows(baseline.pixels, screen) : [];
      else {
        console.log(
          `ios-standalone: note — Safari painted ${baselineKind} (${baselineInk.dark} ink);`
          + " not used as the PWA pass/fail reference",
        );
      }
    }
    if (!summary.browserBaseline) {
      summary.browserBaseline = { path: null, ink: 0, attempts: 0, kind: baselineKind, usable: false };
    }

    if (!clip && args.createClip) {
      if (!baselineUsable) {
        throw new Error([
          `cannot --create-clip: Safari at ${baselineUrl} painted ${baselineKind}, not a desk`,
          `(${baselineInk.dark} ink). Add to Home Screen needs a living Safari page.`,
        ].join(" "));
      }
      await createWebClip(device.udid, shaped, args.url, scratch);
      clip = findWebClip(device.udid, args.url);
    }
    if (!clip) {
      throw new Error([
        `no home-screen web clip for ${args.url} on ${device.name}.`,
        "Re-run with --create-clip (screenshot+HID taps 「檢視較多」/「加入主畫面」;",
        "AX frames alone dismiss the sheet under PopoverDismissRegion on iOS 27), or by hand:",
        "  1. baguette openurl --udid " + device.udid + " " + args.url,
        "  2. Safari: 頁面選單 / Page Menu → 分享 / Share",
        "  3. share sheet: 檢視較多 / Show More → 加入主畫面 / Add to Home Screen → 加入 / Add",
        "  4. re-run: npm run verify:ios-standalone -- --device \"" + device.name + "\" --reset-state",
      ].join("\n"));
    }
    summary.clip = clip;
    console.log(`ios-standalone: web clip "${clip.name}" (${clip.bundleId}) — PWA is the graded surface`);

    const floor = baselineUsable
      ? Math.max(DESK_INK_FLOOR, Math.round(baselineInk.dark * BASELINE_SHARE))
      : DESK_INK_FLOOR;
    console.log(
      baselineUsable
        ? `ios-standalone: Safari desk ${baselineInk.dark} ink; PWA must reach ${floor} with shape ≥ ${PROFILE_MATCH}`
        : `ios-standalone: PWA-first grade — absolute desk floor ${floor} ink`,
    );

    // Launch one: the pass where a shell update the clip is holding is adopted
    // (the app asks `/api/version`, refreshes the shell and reloads once). It is
    // recorded and then discarded; the measured launch is the next one.
    const warmup = await launchWebClip(device.udid, shaped, clip, scratch, "warmup");
    if (!warmup.tapped) {
      throw new Error(
        `the home-screen PWA "${clip.name}" could not be launched (simctl + icon hunt), so nothing was measured`,
      );
    }
    const warmupInk = await waitForStableInk(device.udid, screen, scratch, "standalone-warmup", floor, {
      minWaitMs: 14000,
      attempts: 10,
    });
    summary.warmup = {
      path: warmupInk.path,
      ink: warmupInk.pixels ? bandInk(warmupInk.pixels, screen).dark : 0,
      kind: warmupInk.kind,
      via: warmup.via,
    };
    if (warmupInk.kind !== "desk") {
      throw new Error(
        `warmup launch painted ${warmupInk.kind || "unknown"}, not the home-screen desk`
        + ` (${summary.warmup.ink} ink; ${warmupInk.path})`,
      );
    }
    console.log(
      `ios-standalone: launch one painted ${summary.warmup.ink} ink (${warmupInk.kind}) via ${warmup.via}`
      + " — adopting the served build",
    );
    run("xcrun", ["simctl", "terminate", device.udid, clip.bundleId]);
    await sleep(1500);
    const backHome = await returnToSpringboard(device.udid, scratch, "between-launches");
    if (!backHome.arrived) {
      throw new Error("could not return to the springboard between warmup and measured launches");
    }

    // Launch two: the measured launch.
    const launch = await launchWebClip(device.udid, shaped, clip, scratch, "measured");
    if (!launch.tapped) {
      throw new Error(`the home-screen PWA "${clip.name}" could not be launched on the measured pass, so nothing was measured`);
    }
    const rest = await waitForStableInk(device.udid, screen, scratch, "standalone-rest", floor, {
      minWaitMs: 16000,
      attempts: 14,
    });
    const restInk = rest.pixels ? bandInk(rest.pixels, screen) : { dark: 0 };
    const restMatch = baselineUsable && rest.pixels
      ? profileMatch(baselineRows, bandRows(rest.pixels, screen))
      : 1;
    summary.screenshot = rest.path;
    summary.rest = {
      path: rest.path,
      ink: restInk.dark,
      match: Number(restMatch.toFixed(3)),
      attempts: rest.attempts,
      kind: rest.kind,
      via: launch.via,
      gradeMode: baselineUsable ? "safari-shape" : "absolute-desk",
    };
    gradePwaDeskBand({
      rest,
      restInk,
      restMatch,
      restKind: rest.kind,
      baselineInk,
      baselineKind,
      baselineUsable,
      floor,
      launch,
      scratch,
      failures,
    });

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
      finishSummary({
        args,
        server,
        summary,
        failures,
        scratch,
        deviceLabel: `${device.name} (${device.runtime})`,
      });
    });
}

await main();
