// Physical-iPhone helpers for verify-ios-standalone.
//
// Apple constraints (honest, 2026-10):
// - `baguette` is Simulator-only ("Headless iOS simulator control").
// - Simulator WebClips live under CoreSimulator and can be read via Info.plist;
//   a physical phone's home-screen web apps are not on that filesystem.
// - `xcrun devicectl` can list a paired physical device (Reality ≠ simulated),
//   open URLs, launch known bundle IDs, and capture screenshots. It does not
//   expose SpringBoard HID taps or an accessibility tree the way baguette does.
// - iPhone Mirroring alone does not register the phone as a CoreDevice target.
//   Developer Mode + trust (USB or wireless debugging) is required for live
//   `devicectl` capture. Mirroring is still the human path for Add to Home Screen.
// - Home-screen WebClips (`com.apple.WebKit.PushBundle.*`) often do not appear
//   in `devicectl device info apps`, so launch is usually guided: Aaron opens
//   the icon; the instrument screenshots and grades pixels.

import { execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

function run(command, args, options = {}) {
  try {
    const stdout = execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    return { ok: true, stdout: String(stdout) };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || error.message || ""),
    };
  }
}

function runJson(command, args, jsonPath, options = {}) {
  const result = run(command, [...args, "--json-output", jsonPath], options);
  if (!result.ok || !existsSync(jsonPath)) {
    return { ok: false, error: result.stderr || result.stdout || "no json", data: null };
  }
  try {
    return { ok: true, data: JSON.parse(readFileSync(jsonPath, "utf8")), error: "" };
  } catch (error) {
    return { ok: false, error: String(error?.message || error), data: null };
  }
}

export function requireDevicectl() {
  const found = run("/bin/zsh", ["-lc", "command -v xcrun"]);
  if (!found.ok) {
    throw new Error("xcrun is missing — install Xcode command-line tools");
  }
  const help = run("xcrun", ["devicectl", "--version"]);
  if (!help.ok) {
    throw new Error("xcrun devicectl is unavailable — need a recent Xcode with CoreDevice");
  }
  return "xcrun devicectl";
}

function deviceReality(entry) {
  const props = entry?.properties || {};
  const hardware = props.hardware || entry?.hardwareProperties || {};
  return String(hardware.reality || "").toLowerCase();
}

function deviceVisibility(entry) {
  const props = entry?.properties || {};
  const state = props.state || entry?.deviceProperties || {};
  return String(state.visibilityClass || "").toLowerCase();
}

function isPhysicalDevice(entry) {
  const reality = deviceReality(entry);
  if (reality === "physical") return true;
  if (reality === "simulated") return false;
  // Older JSON: simulators advertise visibilityClass / Simulator plugin.
  if (deviceVisibility(entry) === "simulators") return false;
  const provider = String(entry?.deviceProperties?.provider || "");
  if (/Simulator/i.test(provider)) return false;
  // Prefer an explicit physical mark; otherwise treat unknown as not physical.
  return false;
}

function deviceNameOf(entry) {
  return String(
    entry?.properties?.state?.name
    || entry?.deviceProperties?.name
    || entry?.name
    || "",
  );
}

function deviceUdidOf(entry) {
  return String(
    entry?.properties?.hardware?.udid
    || entry?.hardwareProperties?.udid
    || entry?.identifier
    || entry?.udid
    || "",
  );
}

function deviceConnectionState(entry) {
  return String(
    entry?.properties?.connection?.state
    || entry?.connectionProperties?.tunnelState
    || "",
  ).toLowerCase();
}

export function listCoreDevices(scratch) {
  const jsonPath = join(scratch, "devicectl-list-devices.json");
  const listed = runJson(
    "xcrun",
    ["devicectl", "list", "devices", "--timeout", "30"],
    jsonPath,
    { timeout: 45000 },
  );
  if (!listed.ok) {
    throw new Error(`devicectl list devices failed: ${listed.error}`);
  }
  return listed.data?.result?.devices || [];
}

export function pickPhysicalDevice(name, scratch) {
  const devices = listCoreDevices(scratch).filter(isPhysicalDevice);
  if (!devices.length) {
    throw new Error([
      "no physical iPhone is visible to CoreDevice (devicectl).",
      "",
      "iPhone Mirroring alone is not enough for automated capture.",
      "Pair the phone for development, then re-check:",
      "  1. iPhone: Settings → Privacy & Security → Developer Mode (on)",
      "  2. Connect USB (or enable wireless debugging after one USB trust)",
      "  3. Trust this Mac when prompted",
      "  4. xcrun devicectl list devices   ← Reality column must say physical",
      "",
      "If you only have Mirroring (no CoreDevice), use --device-receipt instead:",
      "  see tooling/verify-ios-standalone.mjs --help",
    ].join("\n"));
  }
  const wanted = String(name || "").trim();
  const connected = devices.filter((entry) => {
    const state = deviceConnectionState(entry);
    return !state || state === "connected";
  });
  const pool = connected.length ? connected : devices;
  const named = wanted
    ? pool.filter((entry) => deviceNameOf(entry) === wanted)
    : [];
  const chosen = named[0] || pool[0];
  const udid = deviceUdidOf(chosen);
  if (!udid) throw new Error("physical device listing had no UDID");
  return {
    name: deviceNameOf(chosen) || wanted || "iPhone",
    udid,
    runtime: String(
      chosen?.properties?.software?.osVersionNumber?.stringValue
      || chosen?.deviceProperties?.osVersionNumber
      || "",
    ),
    reality: "physical",
    alreadyBooted: true,
    raw: chosen,
  };
}

export function detectLanIPv4() {
  let nets = {};
  try {
    nets = networkInterfaces() || {};
  } catch {
    // Sandboxes / restricted environments can refuse interface enumeration.
    return "";
  }
  const ranked = [];
  for (const [iface, entries] of Object.entries(nets)) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" && entry.family !== 4) continue;
      if (entry.internal) continue;
      const address = entry.address;
      // Prefer ordinary LAN / link-local Wi‑Fi over VPN-style ranges.
      const score = address.startsWith("192.168.") ? 3
        : address.startsWith("10.") ? 2
        : address.startsWith("172.") ? 1
        : 0;
      ranked.push({ address, iface, score });
    }
  }
  ranked.sort((left, right) => right.score - left.score);
  return ranked[0]?.address || "";
}

export function isLoopbackUrl(urlString) {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

export function rewriteUrlHost(urlString, host) {
  const parsed = new URL(urlString);
  parsed.hostname = host;
  return parsed.toString();
}

export function resolvePhysicalUrl(urlString, { lanUrl = false, lanHost = "" } = {}) {
  if (!isLoopbackUrl(urlString)) {
    return { url: urlString, rewritten: false, lanHost: "" };
  }
  if (!lanUrl) {
    throw new Error([
      `physical iPhone cannot reach ${urlString} (that is this Mac's loopback).`,
      "Re-run with --lan-url (rewrites to this Mac's LAN IP and starts the server",
      "with AI_SYSTEM6_ALLOW_LAN), or pass --url http://<mac-lan-ip>:4173/",
      "Phone and Mac must share Wi‑Fi (or USB tethering).",
    ].join("\n"));
  }
  const host = lanHost || detectLanIPv4();
  if (!host) {
    throw new Error("could not detect a LAN IPv4 address for --lan-url");
  }
  return { url: rewriteUrlHost(urlString, host), rewritten: true, lanHost: host };
}

export function makeLanAuthToken() {
  return randomBytes(24).toString("base64url");
}

export function physicalServerEnv({ port, lanHost, authToken }) {
  return {
    PORT: String(port),
    AI_SYSTEM6_ALLOW_LAN: "1",
    AI_SYSTEM6_HOST: lanHost,
    AI_SYSTEM6_AUTH_TOKEN: authToken,
  };
}

export function openUrlOnDevice(udid, url) {
  return run("xcrun", [
    "devicectl", "device", "process", "openURL",
    "--device", udid,
    "--timeout", "60",
    url,
  ], { timeout: 90000 });
}

export function launchAppOnDevice(udid, bundleId) {
  return run("xcrun", [
    "devicectl", "device", "process", "launch",
    "--device", udid,
    "--timeout", "60",
    "--terminate-existing",
    "--activate",
    bundleId,
  ], { timeout: 90000 });
}

export function terminateAppOnDevice(udid, bundleId) {
  // Best-effort: launch --terminate-existing is the reliable path; signal needs a PID.
  return launchAppOnDevice(udid, bundleId);
}

export function captureDeviceScreenshot(udid, destination) {
  const shot = run("xcrun", [
    "devicectl", "device", "capture", "screenshot",
    "--device", udid,
    "--destination", destination,
    "--timeout", "60",
  ], { timeout: 90000 });
  if (!shot.ok || !existsSync(destination)) {
    return {
      ok: false,
      stderr: shot.stderr || shot.stdout || "screenshot missing",
    };
  }
  return { ok: true };
}

export function readDeviceScreen(udid, scratch) {
  const jsonPath = join(scratch, "devicectl-displays.json");
  const listed = runJson(
    "xcrun",
    ["devicectl", "device", "info", "displays", "--device", udid, "--timeout", "30"],
    jsonPath,
    { timeout: 45000 },
  );
  if (!listed.ok) return null;
  const displays = listed.data?.result?.displays
    || listed.data?.result?.displayInfos
    || [];
  const primary = displays[0] || null;
  if (!primary) return null;
  // Field names vary across Xcode builds; accept a few shapes.
  const width = Number(
    primary.currentMode?.width
    || primary.width
    || primary.bounds?.width
    || primary.size?.width
    || 0,
  );
  const height = Number(
    primary.currentMode?.height
    || primary.height
    || primary.bounds?.height
    || primary.size?.height
    || 0,
  );
  // Prefer points (UIKit) when scale is present.
  const scale = Number(primary.scale || primary.scaleFactor || 0);
  if (width > 0 && height > 0 && scale >= 2 && width > 600) {
    return { width: Math.round(width / scale), height: Math.round(height / scale), scale };
  }
  if (width > 0 && height > 0) return { width, height, scale: scale || 1 };
  return null;
}

export function findWebClipOnDevice(udid, url, scratch, { clipName = "", clipBundleId = "" } = {}) {
  if (clipBundleId) {
    return {
      bundleId: clipBundleId,
      name: clipName || "AI System 6",
      manifestId: url,
      source: "flag",
    };
  }
  const jsonPath = join(scratch, "devicectl-apps.json");
  // Prefer a narrow search — full --include-all-apps can hang for a minute+.
  const attempts = [
    ["--include-all-apps", "--search", "PushBundle"],
    ["--include-all-apps", "--search", "AI System"],
    ["--include-all-apps", "--filter", "bundleIdentifier CONTAINS 'PushBundle'"],
  ];
  const wanted = url.replace(/\/+$/, "/");
  for (const extra of attempts) {
    const listed = runJson(
      "xcrun",
      [
        "devicectl", "device", "info", "apps",
        "--device", udid,
        "--timeout", "25",
        ...extra,
      ],
      jsonPath,
      { timeout: 35000 },
    );
    if (!listed.ok) continue;
    const apps = listed.data?.result?.apps
      || listed.data?.result?.applications
      || [];
    writeFileSync(
      join(scratch, `devicectl-apps-${extra[extra.length - 1].replace(/\W+/g, "")}.json`),
      `${JSON.stringify(apps, null, 2)}\n`,
    );
    for (const app of apps) {
      const bundleId = String(app.bundleIdentifier || app.identifier || "");
      const name = String(app.name || app.displayName || app.CFBundleDisplayName || "");
      const urlCandidates = [
        app.url,
        app.manifestId,
        app.bundleURL,
        app.properties?.url,
      ].map((value) => String(value || "").replace(/\/+$/, "/"));
      const nameHit = clipName
        ? name === clipName
        : /AI System 6|System 6/i.test(name);
      const bundleHit = /^com\.apple\.WebKit\.PushBundle\./i.test(bundleId);
      const urlHit = urlCandidates.some((candidate) => candidate && candidate === wanted);
      if (bundleHit || nameHit || urlHit) {
        return {
          bundleId: bundleId || clipBundleId,
          name: name || clipName || "AI System 6",
          manifestId: urlCandidates.find(Boolean) || url,
          source: "devicectl-apps",
        };
      }
    }
  }
  return null;
}

export function printPhysicalClipGuide({ udid, url, deviceName }) {
  console.log([
    "ios-standalone physical: no launchable home-screen web app was listed for this URL.",
    "Apple does not expose physical WebClip Info.plist the way the Simulator does.",
    "",
    "Do this on the physical phone (iPhone Mirroring is fine for the taps):",
    `  1. Open Safari → ${url}`,
    "  2. Page Menu / 頁面選單 → Share / 分享",
    "  3. Add to Home Screen / 加入主畫面 → Add / 加入",
    "  4. Confirm the icon name (AI System 6)",
    "  5. Re-run with --await-home-launch (or --clip-bundle-id if known)",
    "",
    "Optional open-in-Safari from Mac:",
    `  xcrun devicectl device process openURL --device ${udid} ${url}`,
    `Device: ${deviceName} (${udid})`,
  ].join("\n"));
}

export async function promptLine(question) {
  if (!process.stdin.isTTY) {
    console.log(question);
    console.log("(stdin is not a TTY — waiting 45s for you to act on the phone)");
    await new Promise((resolve) => setTimeout(resolve, 45000));
    return "";
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve) => {
      rl.question(question, (answer) => resolve(String(answer || "")));
    });
  } finally {
    rl.close();
  }
}

export function readDeviceReceipt(dir) {
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`device receipt missing manifest.json in ${dir}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const required = ["safari-baseline.png", "standalone-rest.png"];
  for (const name of required) {
    if (!existsSync(join(dir, name))) {
      throw new Error(`device receipt missing ${name} in ${dir}`);
    }
  }
  const screen = manifest.screen;
  if (!screen?.width || !screen?.height) {
    throw new Error("device receipt manifest.screen needs { width, height } in points");
  }
  return {
    manifest,
    paths: {
      safariBaseline: join(dir, "safari-baseline.png"),
      standaloneRest: join(dir, "standalone-rest.png"),
      standaloneKeyboard: existsSync(join(dir, "standalone-keyboard.png"))
        ? join(dir, "standalone-keyboard.png")
        : null,
    },
  };
}

export function writeDeviceReceiptTemplate(dir, { url, deviceName, screen }) {
  const manifest = {
    url,
    deviceName: deviceName || "iPhone",
    screen: screen || { width: 402, height: 874 },
    clipName: "AI System 6",
    notes: [
      "Capture these on the physical phone (Mirroring window crop is OK if it is only the phone screen):",
      "1. safari-baseline.png — desk open in Safari (not the home-screen app)",
      "2. standalone-rest.png — desk open from the Home Screen icon (no Safari chrome)",
      "3. standalone-keyboard.png — optional; composer focused, software keyboard up",
      "Then: npm run verify:ios-standalone -- --device-receipt " + dir,
    ],
  };
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(dir, "README.txt"), `${manifest.notes.join("\n")}\n`);
  return manifest;
}

export function physicalPathCapabilities() {
  return {
    baguette: false,
    filesystemWebClips: false,
    hidTaps: false,
    accessibilityTree: false,
    openUrl: true,
    screenshot: true,
    launchKnownBundle: true,
    guidedHomeLaunch: true,
    deviceReceipt: true,
  };
}

// Keep spawnSync import used for environments that need a non-throwing probe.
export function probeDevicectlPresent() {
  const probe = spawnSync("xcrun", ["devicectl", "--version"], { encoding: "utf8" });
  return probe.status === 0;
}
