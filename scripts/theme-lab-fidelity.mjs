// Canonical-reference fidelity harness for historical Theme Lab appearances.
//
// The normal Theme Lab snapshot gate catches implementation regressions. This
// harness answers a different question: how far is the implementation from a
// real, provenance-checked system reference? Copyrighted source screenshots
// stay in a local cache; only URLs, hashes, dimensions, and crop coordinates
// live in the repository.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { release as osRelease, version as osVersion } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FLOOR_METRICS,
  floorForCapture,
  validateFidelityManifest,
} from "./theme-lab-fidelity-contract.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");
const { chromium } = require("playwright");
const playwrightVersion = require("playwright/package.json").version;

const DEFAULT_THEME = "platinum";
const DEFAULT_MANIFEST_DIR = join(root, "tests", "visual", "theme-lab-fidelity");
const DEFAULT_CACHE_ROOT = join(root, "drafts", "theme-lab-fidelity-cache");
const DEFAULT_OUTPUT_ROOT = join(root, "drafts", "theme-lab-fidelity");
const DIFF_THRESHOLD = 10;
// Per-specimen fidelity tolerances. A manifest pins explicit tolerances
// (capture.tolerances defaults + specimen.tolerances overrides) so the
// harness can fail loudly when geometry/material drifts beyond the recorded
// 2026-08-10 baseline; specimen.tolerances === null keeps a specimen
// diagnostic-only (unreliable reference crops stay visible, not gated).
const DEFAULT_TOLERANCES = Object.freeze({
  geometryMismatch: 0.2,
  edgeErrorPx: 4,
  materialError: 60,
});
const ATLAS_PADDING = 20;
const ATLAS_GAP = 18;
const PANEL_LABEL_HEIGHT = 34;
const ATLAS_HEADER_HEIGHT = 58;
const PANEL_BACKGROUND = "#f0f0f0";

function usage() {
  console.log(`Usage: node scripts/theme-lab-fidelity.mjs [options]

Options:
  --theme <id>        Appearance manifest to use (default: platinum)
  --manifest <path>   Use an explicit manifest file (theme field still applies)
  --fetch             Download missing canonical sources into the local cache
  --update-fingerprint  Accept the current Theme Lab content hash and write it
                       back to the manifest (intentional fixture DOM changes)
  --source-dir <dir>  Read canonical sources from an existing local directory
  --output-dir <dir>  Write generated artifacts to this directory
  --help               Print this help

Generated artifacts:
  reference.png, current.png, overlay-50.png, pixel-diff.png,
  current-full.png, metrics.json, environment.json
`);
}

function parseArgs(argv) {
  const options = {
    theme: DEFAULT_THEME,
    manifestPath: null,
    fetch: false,
    updateFingerprint: false,
    sourceDir: null,
    outputDir: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      usage();
      process.exit(0);
    }
    if (argument === "--fetch") {
      options.fetch = true;
      continue;
    }
    if (argument === "--update-fingerprint") {
      options.updateFingerprint = true;
      continue;
    }
    if (["--theme", "--manifest", "--source-dir", "--output-dir"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--theme") options.theme = value;
      if (argument === "--manifest") options.manifestPath = value;
      if (argument === "--source-dir") options.sourceDir = resolve(value);
      if (argument === "--output-dir") options.outputDir = resolve(value);
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function httpReady(url) {
  return new Promise((resolveReady) => {
    const request = get(url, (response) => {
      response.resume();
      resolveReady(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on("error", () => resolveReady(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolveReady(false);
    });
  });
}

async function getFreePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => port ? resolvePort(port) : reject(new Error("Could not allocate a local port")));
    });
    server.on("error", reject);
  });
}

async function startAppServer() {
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const started = Date.now();
  while (Date.now() - started < 12000) {
    if (await httpReady(url)) return { child, url, output: () => output };
    if (child.exitCode !== null) break;
    await wait(150);
  }
  child.kill("SIGTERM");
  throw new Error(`Theme Lab server did not become ready.\n${output.trim()}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolveStop();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill("SIGTERM");
  });
}

function readManifest(theme) {
  const path = join(DEFAULT_MANIFEST_DIR, `${theme}.json`);
  if (!existsSync(path)) throw new Error(`No fidelity manifest for ${theme}: ${path}`);
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  validateFidelityManifest(manifest, { expectedTheme: theme, label: path.slice(root.length + 1) });
  return { manifest, path };
}

async function downloadSource(source, destination) {
  const response = await fetch(source.url, {
    redirect: "follow",
    headers: { "user-agent": "AI-System-6-Theme-Lab-Fidelity/1.0" },
  });
  if (!response.ok) throw new Error(`Could not download ${source.id}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(destination, buffer);
}

async function prepareSources(manifest, options) {
  const cacheDir = options.sourceDir || join(DEFAULT_CACHE_ROOT, manifest.theme);
  if (!options.sourceDir) mkdirSync(cacheDir, { recursive: true });
  const prepared = new Map();
  for (const source of manifest.sources) {
    const path = join(cacheDir, source.file);
    if (!existsSync(path)) {
      if (!options.fetch) {
        throw new Error([
          `Missing canonical source: ${path}`,
          `Run with --fetch, or pass --source-dir containing ${source.file}.`,
          "Canonical screenshots are intentionally not committed to the repository.",
        ].join("\n"));
      }
      await downloadSource(source, path);
    }
    const actualHash = sha256File(path);
    if (actualHash !== source.sha256) {
      throw new Error(`SHA-256 mismatch for ${source.id}: expected ${source.sha256}, got ${actualHash}`);
    }
    const image = await loadImage(path);
    if (image.width !== source.width || image.height !== source.height) {
      throw new Error(`Dimensions mismatch for ${source.id}: expected ${source.width}x${source.height}, got ${image.width}x${image.height}`);
    }
    prepared.set(source.id, { ...source, path, image });
  }
  return { cacheDir, prepared };
}

function integerRect(rect, label) {
  const normalized = {
    x: Math.round(Number(rect.x || 0)),
    y: Math.round(Number(rect.y || 0)),
    width: Math.round(Number(rect.width)),
    height: Math.round(Number(rect.height)),
  };
  if (![normalized.x, normalized.y, normalized.width, normalized.height].every(Number.isFinite)) {
    throw new Error(`${label} has a non-numeric crop`);
  }
  if (normalized.width <= 0 || normalized.height <= 0) throw new Error(`${label} has an empty crop`);
  return normalized;
}

function referenceCrop(source, rawCrop, label) {
  const crop = integerRect(rawCrop, label);
  if (crop.x < 0 || crop.y < 0 || crop.x + crop.width > source.width || crop.y + crop.height > source.height) {
    throw new Error(`${label} crop ${JSON.stringify(crop)} is outside ${source.width}x${source.height}`);
  }
  const scale = Number(rawCrop.scale || 1);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) {
    throw new Error(`${label} reference scale must be in (0, 1]: got ${rawCrop.scale}`);
  }
  const outWidth = Math.max(1, Math.round(crop.width * scale));
  const outHeight = Math.max(1, Math.round(crop.height * scale));
  const canvas = createCanvas(outWidth, outHeight);
  const context = canvas.getContext("2d");
  // Retina references (e.g. 512 Pixels Yosemite at 2x) are downscaled to the
  // CSS pixel grid before comparison; sourceScale records the original ratio.
  context.imageSmoothingEnabled = scale < 1;
  context.imageSmoothingQuality = "high";
  context.drawImage(source.image, crop.x, crop.y, crop.width, crop.height, 0, 0, outWidth, outHeight);
  return { canvas, crop: { ...crop, scale } };
}

// Geometry / material analysis for a no-vision model. Edge positions measure
// the control silhouette (strict), colour measures interior material while
// ignoring antialiased edges and text.
function luminanceMap(imageData, width, height) {
  const out = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    out[i] = imageData[offset] * 0.2126
      + imageData[offset + 1] * 0.7152
      + imageData[offset + 2] * 0.0722;
  }
  return out;
}

function edgeMap(lum, width, height, threshold = 24) {
  const edges = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gradient = Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + width] - lum[i - width]);
      if (gradient > threshold) edges[i] = 1;
    }
  }
  return edges;
}

// Text / icon masking for the material metric: glyph strokes and their
// antialiasing neighbors sit in high local-variance regions. Excluding them
// keeps materialError measuring surface colour, not text content.
function textLikeMask(lum, width, height, varianceThreshold = 55) {
  const mask = new Uint8Array(width * height);
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const value = lum[(y + dy) * width + (x + dx)];
          sum += value;
          sumSq += value * value;
          count += 1;
        }
      }
      const mean = sum / count;
      const variance = sumSq / count - mean * mean;
      if (variance > varianceThreshold) mask[y * width + x] = 1;
    }
  }
  return mask;
}

// The glyph inside a control — a checkmark, a radio dot — is invisible to the
// other three metrics. textLikeMask removes it from materialError by design, and
// a thick stroke still finds an edge counterpart within the 8px search that
// edgeErrorPx walks, so a control can carry the wrong glyph and still measure
// geometry 0 / material 0. This isolates the glyph and compares the two masks
// directly.
//
// The mark is the minority class inside the control: pixels whose luminance is
// far from that image's own interior median. Each image is thresholded against
// its own median, so a grey mark on a near-white well and a black mark on a blue
// well are both found without knowing either palette. `inset` drops the control
// frame, which also differs from the median but is not the glyph.
function markMask(lum, width, height, { inset = 2, threshold = 60 } = {}) {
  const values = [];
  for (let y = inset; y < height - inset; y += 1) {
    for (let x = inset; x < width - inset; x += 1) values.push(lum[y * width + x]);
  }
  if (!values.length) return { mask: new Uint8Array(width * height), count: 0, median: 0 };
  values.sort((left, right) => left - right);
  const median = values[Math.floor(values.length / 2)];
  const mask = new Uint8Array(width * height);
  let count = 0;
  for (let y = inset; y < height - inset; y += 1) {
    for (let x = inset; x < width - inset; x += 1) {
      const i = y * width + x;
      if (Math.abs(lum[i] - median) <= threshold) continue;
      mask[i] = 1;
      count += 1;
    }
  }
  return { mask, count, median };
}

// 1 - intersection over union of the two glyph masks. 0 means the same glyph in
// the same place; 1 means no shared pixel at all. Union-based, so a mark that is
// present in one image and absent in the other scores 1 rather than passing.
function analyzeMark(referenceCanvas, currentCanvas, options = {}) {
  const width = referenceCanvas.width;
  const height = referenceCanvas.height;
  if (width !== currentCanvas.width || height !== currentCanvas.height) {
    return { markMismatch: null, reason: "size-mismatch" };
  }
  const refLum = luminanceMap(referenceCanvas.getContext("2d").getImageData(0, 0, width, height).data, width, height);
  const curLum = luminanceMap(currentCanvas.getContext("2d").getImageData(0, 0, width, height).data, width, height);
  const reference = markMask(refLum, width, height, options);
  const current = markMask(curLum, width, height, options);
  if (!reference.count && !current.count) {
    return { markMismatch: null, reason: "no-mark-found" };
  }
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < reference.mask.length; i += 1) {
    const inReference = reference.mask[i];
    const inCurrent = current.mask[i];
    if (inReference || inCurrent) union += 1;
    if (inReference && inCurrent) intersection += 1;
  }
  return {
    markMismatch: union ? Math.round((1 - intersection / union) * 1000) / 1000 : 0,
    referencePixels: reference.count,
    currentPixels: current.count,
    referenceMedian: Math.round(reference.median),
    currentMedian: Math.round(current.median),
  };
}

function dilateMask(mask, width, height, iterations) {
  let current = mask;
  for (let pass = 0; pass < iterations; pass += 1) {
    const next = new Uint8Array(current);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (current[i]) continue;
        if (
          (x > 0 && current[i - 1])
          || (x < width - 1 && current[i + 1])
          || (y > 0 && current[i - width])
          || (y < height - 1 && current[i + width])
        ) {
          next[i] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

function analyzeGeometryAndMaterial(referenceCanvas, currentCanvas, options = {}) {
  const width = referenceCanvas.width;
  const height = referenceCanvas.height;
  if (width !== currentCanvas.width || height !== currentCanvas.height) {
    return { edgeErrorPx: null, geometryMismatch: null, materialError: null, reason: "size-mismatch" };
  }
  const referenceData = referenceCanvas.getContext("2d").getImageData(0, 0, width, height).data;
  const currentData = currentCanvas.getContext("2d").getImageData(0, 0, width, height).data;
  const refLum = luminanceMap(referenceData, width, height);
  const curLum = luminanceMap(currentData, width, height);
  const refEdges = edgeMap(refLum, width, height);
  const curEdges = edgeMap(curLum, width, height);
  const refText = textLikeMask(refLum, width, height);
  // Optional text masking for the *silhouette* metric. Label glyphs are
  // content, not control chrome: a tab strip with different labels should not
  // inflate geometryMismatch. State glyphs (checkmarks, radio dots) stay
  // unmasked -- they are part of the control's visual identity.
  if (options.geometryMask === "text") {
    const refTextMask = dilateMask(refText, width, height, 1);
    const curTextMask = dilateMask(textLikeMask(curLum, width, height), width, height, 1);
    for (let i = 0; i < refEdges.length; i += 1) {
      if (refTextMask[i]) refEdges[i] = 0;
      if (curTextMask[i]) curEdges[i] = 0;
    }
  }

  let refEdgeCount = 0;
  for (let i = 0; i < refEdges.length; i += 1) if (refEdges[i]) refEdgeCount += 1;
  if (!refEdgeCount) {
    return { edgeErrorPx: 0, geometryMismatch: 0, materialError: 0 };
  }

  // Edge distance: dilate the current edges up to 8px; each uncovered pass
  // accumulates distance for the reference edges.
  // Distance-0 coverage is the current silhouette itself: reference edges
  // that exactly overlap a current edge are covered at distance 0 and must
  // not be reported as missing; the loop counts distances 1..8 from there.
  let uncovered = 0;
  for (let i = 0; i < refEdges.length; i += 1) {
    if (refEdges[i] && !curEdges[i]) uncovered += 1;
  }
  let previous = new Uint8Array(curEdges);
  let distanceSum = 0;
  for (let distance = 1; distance <= 8 && uncovered > 0; distance += 1) {
    const covered = dilateMask(curEdges, width, height, distance);
    let newly = 0;
    for (let i = 0; i < refEdges.length; i += 1) {
      if (refEdges[i] && !previous[i] && covered[i]) {
        distanceSum += distance;
        newly += 1;
      }
    }
    uncovered -= newly;
    previous = covered;
  }
  distanceSum += uncovered * 8;

  // Material error: interior (non-edge) pixels of the reference, colour delta.
  let materialSum = 0;
  let materialCount = 0;
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const i = y * width + x;
      if (refEdges[i] || curEdges[i] || refText[i]) continue;
      const offset = i * 4;
      materialSum += (
        Math.abs(referenceData[offset] - currentData[offset])
        + Math.abs(referenceData[offset + 1] - currentData[offset + 1])
        + Math.abs(referenceData[offset + 2] - currentData[offset + 2])
      ) / 3;
      materialCount += 1;
    }
  }

  const geometryMismatch = refEdgeCount ? uncovered / refEdgeCount : 0;
  return {
    edgeErrorPx: Math.round((distanceSum / refEdgeCount) * 10) / 10,
    geometryMismatch: Math.round(geometryMismatch * 1000) / 1000,
    materialError: materialCount ? Math.round((materialSum / materialCount) * 10) / 10 : 0,
  };
}

async function prepareCurrentPage(browser, serverUrl, manifest, outputDir) {
  const capture = manifest.capture;
  const context = await browser.newContext({
    viewport: capture.viewport,
    screen: capture.screen || capture.viewport,
    deviceScaleFactor: capture.deviceScaleFactor,
    colorScheme: capture.colorScheme,
    reducedMotion: capture.reducedMotion,
    locale: capture.locale,
    timezoneId: capture.timezoneId,
    hasTouch: false,
  });
  await context.addInitScript((themeId) => {
    localStorage.setItem("ai-system-6-theme", themeId);
    localStorage.removeItem("ai-system-6-liquid-glass");
  }, manifest.theme);
  const page = await context.newPage();
  await page.emulateMedia({
    colorScheme: capture.colorScheme,
    reducedMotion: capture.reducedMotion,
    forcedColors: capture.forcedColors || "none",
  });
  const diagnostics = [];
  const resourceResponses = [];
  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    const parsed = new URL(response.url());
    resourceResponses.push({
      // The build stamps ?v=<build> onto every CSS url(); the manifest pins
      // bare asset paths, so drop the cache-buster before matching.
      path: parsed.pathname,
      status: response.status(),
      resourceType: response.request().resourceType(),
    });
    if (response.status() >= 400) diagnostics.push(`response ${response.status()}: ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    diagnostics.push(`requestfailed: ${request.url()} (${request.failure()?.errorText || "unknown"})`);
  });
  await page.goto(serverUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => ["ready", "error"].includes(document.body.dataset.appReady), null, { timeout: 15000 });
  const readiness = await page.evaluate(() => ({
    appReady: document.body.dataset.appReady,
    bootHidden: document.querySelector("#boot-screen")?.hidden === true,
    bootStatus: document.querySelector("#boot-status")?.textContent || "",
  }));
  if (readiness.appReady !== "ready" || !readiness.bootHidden) {
    throw new Error(`App boot failed: ${JSON.stringify(readiness)}\n${diagnostics.join("\n")}`);
  }
  await page.evaluate(() => window.AISystem6EnsureThemeLabModule?.());
  const labCss = readFileSync(join(root, "styles/66-theme-lab.css"), "utf8");
  await page.evaluate(({ themeId, css }) => {
    window.AISystem6Theme?.applyTheme(themeId, {
      experimental: true,
      persist: false,
      announce: false,
      modernFontPreference: false,
    });
    window.AISystem6ThemeLab?.sync?.(window.AISystem6Theme?.getTheme?.(themeId));
    window.AISystem6LiquidGlassOverlay?.setEnabled(false);
    document.querySelector("#liquid-glass-overlay")?.setAttribute("hidden", "");
    document.documentElement.lang = "en";
    document.documentElement.style.zoom = "1";
    document.body.classList.remove("is-writer-mode", "is-cloud-active", "quick-draft-focus");
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    for (const win of document.querySelectorAll(".window")) {
      win.classList.add("is-hidden");
      win.classList.remove("is-active");
    }
    // The guide (Start Here OOBE) opens on first boot and covers the Theme
    // Lab titlebar unless fully suppressed: the app keeps its own
    // window-state (guideSeen lives in IndexedDB), so a class alone is not
    // enough — force it out of the layout and hit-testing.
    const guide = document.querySelector('[data-window="guide"]');
    if (guide) {
      guide.classList.add("is-hidden");
      guide.style.setProperty("display", "none", "important");
    }
    const lab = document.querySelector('[data-window="themeLab"]');
    lab?.classList.remove("is-hidden");
    lab?.classList.add("is-active");
    if (!document.querySelector("#theme-lab-dev-styles")) {
      const labStyle = document.createElement("style");
      labStyle.id = "theme-lab-dev-styles";
      labStyle.textContent = css;
      document.head.append(labStyle);
    }
    const style = document.createElement("style");
    style.id = "theme-lab-fidelity-stability";
    style.textContent = `
      *, *::before, *::after {
        animation: none !important;
        caret-color: transparent !important;
        transition: none !important;
      }
    `;
    document.head.append(style);
    window.scrollTo(0, 0);
    void document.body.offsetHeight;
  }, { themeId: manifest.theme, css: labCss });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(180);
  const lab = page.locator('[data-window="themeLab"]');
  await lab.waitFor({ state: "visible" });
  const labBox = await lab.boundingBox();
  if (!labBox) throw new Error("Theme Lab has no bounding box");
  const expectedWindow = capture.windowSize;
  if (expectedWindow && (Math.round(labBox.width) !== expectedWindow.width || Math.round(labBox.height) !== expectedWindow.height)) {
    throw new Error(`Theme Lab window is ${Math.round(labBox.width)}x${Math.round(labBox.height)}; expected ${expectedWindow.width}x${expectedWindow.height}`);
  }
  await assertFixtureStructure(page, capture.fixtureAssertions);
  const fixtureHtml = await lab.evaluate((element) => element.outerHTML);
  const contentSha256 = sha256Buffer(Buffer.from(fixtureHtml));
  if (capture.contentSha256 && contentSha256 !== capture.contentSha256) {
    if (options.updateFingerprint) {
      const manifestPath = options.manifestPath || readManifest(manifest.theme).path;
      const manifestData = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifestData.capture.contentSha256 = contentSha256;
      writeFileSync(manifestPath, `${JSON.stringify(manifestData, null, 2)}\n`);
      console.log(`OK  updated ${manifest.theme} content fingerprint to ${contentSha256}`);
    } else {
      throw new Error(`Theme Lab content fingerprint ${contentSha256} does not match canonical contract ${capture.contentSha256}`);
    }
  }
  await lab.screenshot({ path: join(outputDir, "current-full.png"), animations: "disabled" });
  return { context, page, diagnostics, resourceResponses, labBox, contentSha256 };
}

function assertRequiredResources(responses, capture) {
  for (const path of capture.requiredResources || []) {
    const matches = responses.filter((entry) => entry.path === path);
    if (!matches.some((entry) => entry.status === 200)) {
      throw new Error(`Required capture resource did not load with HTTP 200: ${path}`);
    }
  }
  for (const prefix of capture.requiredResourcePrefixes || []) {
    const failure = responses.find((entry) => entry.path.startsWith(prefix) && entry.status >= 400);
    if (failure) throw new Error(`Capture resource failed: ${failure.path} (HTTP ${failure.status})`);
  }
}

async function platformFontFingerprint(page, selectors) {
  const session = await page.context().newCDPSession(page);
  try {
    await Promise.all([session.send("DOM.enable"), session.send("CSS.enable")]);
    const { root: documentNode } = await session.send("DOM.getDocument", { depth: 1 });
    const results = [];
    for (const selector of selectors) {
      const { nodeId } = await session.send("DOM.querySelector", { nodeId: documentNode.nodeId, selector });
      if (!nodeId) {
        results.push({ selector, missing: true });
        continue;
      }
      const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
      results.push({ selector, fonts });
    }
    return results;
  } finally {
    await session.detach();
  }
}

function assertPlatformFonts(fonts, assertions = []) {
  for (const assertion of assertions) {
    const result = fonts.find((entry) => entry.selector === assertion.selector);
    if (!result || result.missing) throw new Error(`Font probe selector is missing: ${assertion.selector}`);
    const matches = result.fonts.filter((font) => font.familyName === assertion.requiredFamily);
    if (!matches.length) {
      throw new Error(`Expected ${assertion.requiredFamily} for ${assertion.selector}; got ${result.fonts.map((font) => font.familyName).join(", ") || "no rendered fonts"}`);
    }
    if (Object.hasOwn(assertion, "isCustomFont") && !matches.some((font) => font.isCustomFont === assertion.isCustomFont)) {
      throw new Error(`${assertion.selector} did not resolve ${assertion.requiredFamily} with isCustomFont=${assertion.isCustomFont}`);
    }
  }
}

async function assertFixtureStructure(page, assertions = []) {
  if (!assertions.length) return [];
  const results = await page.evaluate((contracts) => contracts.map((contract) => {
    const nodes = [...document.querySelectorAll(contract.selector)];
    const first = nodes[0] || null;
    return {
      selector: contract.selector,
      count: nodes.length,
      visible: Boolean(first && first.getClientRects().length && getComputedStyle(first).display !== "none"),
      text: first?.textContent?.trim() || "",
      attributes: Object.fromEntries(Object.keys(contract.attributes || {}).map((name) => [name, first?.getAttribute(name) ?? null])),
    };
  }), assertions);
  assertions.forEach((assertion, index) => {
    const result = results[index];
    if (Object.hasOwn(assertion, "count") && result.count !== assertion.count) {
      throw new Error(`Fixture assertion ${assertion.selector} expected count ${assertion.count}, got ${result.count}`);
    }
    if (Object.hasOwn(assertion, "visible") && result.visible !== assertion.visible) {
      throw new Error(`Fixture assertion ${assertion.selector} expected visible=${assertion.visible}, got ${result.visible}`);
    }
    if (Object.hasOwn(assertion, "text") && result.text !== assertion.text) {
      throw new Error(`Fixture assertion ${assertion.selector} expected text ${JSON.stringify(assertion.text)}, got ${JSON.stringify(result.text)}`);
    }
    for (const [name, value] of Object.entries(assertion.attributes || {})) {
      if (result.attributes[name] !== value) {
        throw new Error(`Fixture assertion ${assertion.selector} expected ${name}=${JSON.stringify(value)}, got ${JSON.stringify(result.attributes[name])}`);
      }
    }
  });
  return results;
}

async function applySpecimenSetup(page, steps = []) {
  if (!steps.length) return [];
  return await page.evaluate((setupSteps) => setupSteps.map((step) => {
    const element = document.querySelectorAll(step.selector)[step.index || 0];
    if (!element) throw new Error(`Missing setup selector: ${step.selector}`);
    const saved = {
      selector: step.selector,
      index: step.index || 0,
      styleTouched: Boolean(step.style),
      style: element.getAttribute("style"),
      textTouched: Object.hasOwn(step, "text"),
      text: element.textContent,
      attributesTouched: Object.keys(step.attributes || {}),
      attributes: Object.fromEntries(Object.keys(step.attributes || {}).map((name) => [name, element.getAttribute(name)])),
    };
    if (step.style) Object.assign(element.style, step.style);
    if (Object.hasOwn(step, "text")) element.textContent = step.text;
    for (const [name, value] of Object.entries(step.attributes || {})) {
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, String(value));
    }
    return saved;
  }), steps);
}

async function restoreSpecimenSetup(page, saved) {
  if (!saved.length) return;
  await page.evaluate((records) => {
    for (const record of [...records].reverse()) {
      const element = document.querySelectorAll(record.selector)[record.index];
      if (!element) continue;
      if (record.styleTouched) {
        if (record.style === null) element.removeAttribute("style");
        else element.setAttribute("style", record.style);
      }
      if (record.textTouched) element.textContent = record.text;
      for (const name of record.attributesTouched) {
        const value = record.attributes[name];
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    }
  }, saved);
}

async function captureCurrentSpecimen(page, specimen) {
  const savedSetup = await applySpecimenSetup(page, specimen.current.setup);
  try {
    // A forced layout does not guarantee that Chromium has painted a DOM/text
    // mutation yet. Wait through two animation frames so the first capture and
    // the post-restore repeat exercise the same settled paint generation.
    await page.evaluate(() => new Promise((resolvePaint) => {
      requestAnimationFrame(() => requestAnimationFrame(resolvePaint));
    }));
    const locator = page.locator(specimen.current.selector).nth(specimen.current.index || 0);
    await locator.waitFor({ state: "visible" });
    await locator.scrollIntoViewIfNeeded();
    await page.evaluate(() => { void document.body.offsetHeight; });
    const box = await locator.boundingBox();
    if (!box) throw new Error(`${specimen.id}: current selector has no bounding box`);
    const requested = specimen.current.crop || {};
    const crop = integerRect({
      x: box.x + Number(requested.x || 0),
      y: box.y + Number(requested.y || 0),
      width: requested.width === undefined ? box.width : requested.width,
      height: requested.height === undefined ? box.height : requested.height,
    }, `${specimen.id} current`);
    const viewport = page.viewportSize();
    if (crop.x < 0 || crop.y < 0 || crop.x + crop.width > viewport.width || crop.y + crop.height > viewport.height) {
      throw new Error(`${specimen.id}: current crop ${JSON.stringify(crop)} is outside ${viewport.width}x${viewport.height}`);
    }
    // locator.boundingBox() is viewport-relative after scrollIntoViewIfNeeded,
    // while page.screenshot({ clip }) consumes page coordinates. Once Theme
    // Lab grows beyond one viewport, passing the box through unchanged captures
    // an unrelated object at the same document-space y position.
    const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    const pageCrop = {
      ...crop,
      x: crop.x + scroll.x,
      y: crop.y + scroll.y,
    };
    const buffer = await page.screenshot({
      type: "png",
      clip: pageCrop,
      animations: "disabled",
    });
    const image = await loadImage(buffer);
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0);
    const computed = await locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        box: {
          x: element.getBoundingClientRect().x,
          y: element.getBoundingClientRect().y,
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        },
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        color: style.color,
        background: style.background,
        border: style.border,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
      };
    });
    const computedAssertions = await assertSpecimenComputedStyles(page, specimen.computedStyleAssertions);
    return { canvas, crop: pageCrop, box, computed, computedAssertions };
  } finally {
    await restoreSpecimenSetup(page, savedSetup);
  }
}

async function assertSpecimenComputedStyles(page, assertions = []) {
  if (!assertions.length) return [];
  return page.evaluate((contracts) => contracts.map((contract) => {
    const element = document.querySelector(contract.selector);
    if (!element) {
      return { ...contract, actual: null, missing: true };
    }
    const actual = getComputedStyle(element)[contract.property];
    return { ...contract, actual };
  }), assertions);
}

function validateComputedAssertions(results = []) {
  for (const result of results) {
    if (result.missing) {
      throw new Error(`Computed-style assertion missing selector: ${result.selector}`);
    }
    if (result.expected !== undefined && result.actual !== result.expected) {
      throw new Error(
        `Computed-style assertion failed for ${result.selector} ${result.property}: expected ${JSON.stringify(result.expected)}, got ${JSON.stringify(result.actual)}`,
      );
    }
    if (result.expectedContains !== undefined && !String(result.actual).includes(result.expectedContains)) {
      throw new Error(
        `Computed-style assertion failed for ${result.selector} ${result.property}: expected to contain ${JSON.stringify(result.expectedContains)}, got ${JSON.stringify(result.actual)}`,
      );
    }
  }
}

function assertSpecimenTolerances(specimen, review, defaults) {
  const tolerances = specimen.tolerances === null ? null : {
    ...defaults,
    ...(specimen.tolerances || {}),
  };
  if (!tolerances) return;
  const checks = [
    ["geometryMismatch", "geometry mismatch"],
    ["edgeErrorPx", "edge error"],
    ["materialError", "material error"],
    ...(specimen.mark ? [["markMismatch", "mark mismatch"]] : []),
  ];
  for (const [key, label] of checks) {
    const limit = tolerances[key];
    const actual = review[key];
    if (typeof limit !== "number" || !Number.isFinite(limit)) {
      throw new Error(`${specimen.id}: tolerance ${key} must be a finite number or null (got ${JSON.stringify(limit)})`);
    }
    if (typeof actual !== "number" || actual > limit) {
      throw new Error(
        `${specimen.id}: ${label} ${actual} exceeds tolerance ${limit} (geometry=${review.geometryMismatch}, edge=${review.edgeErrorPx}, material=${review.materialError})`,
      );
    }
  }
}

// Absolute tier. `assertSpecimenTolerances` above only proves that today equals
// the recorded run; this proves how far the specimen is from the historical
// target, with one floor for every era. A specimen listed as `failing` or
// `exempt` is not floor-asserted for that metric, but the ledger must stay
// true: a metric that starts to meet the floor has to leave the list, and a
// metric that is not listed must meet the floor.
function assertSpecimenFloor(specimen, review, floor) {
  if (specimen.tolerances === null) return { status: "diagnostic-only", promoted: [] };
  const declared = specimen.floor || {};
  const failing = new Set(declared.failing || []);
  const exempt = new Set(declared.exempt || []);
  const promoted = [];
  // markMismatch is only measured where a specimen declares a glyph, so it joins
  // the floor metrics for those specimens only.
  const metrics = specimen.mark ? [...FLOOR_METRICS, "markMismatch"] : FLOOR_METRICS;
  for (const metric of metrics) {
    const limit = floor[metric];
    const actual = review[metric];
    if (exempt.has(metric)) continue;
    if (typeof actual !== "number") {
      throw new Error(`${specimen.id}: ${metric} did not measure, so the fidelity floor cannot be proven`);
    }
    if (failing.has(metric)) {
      if (actual <= limit) promoted.push(`${metric} ${actual} now meets the floor ${limit}`);
      continue;
    }
    if (actual > limit) {
      throw new Error(
        `${specimen.id}: ${metric} ${actual} is worse than the fidelity floor ${limit}. `
        + "Fix the painter, or record the gap in the specimen's floor ledger with its historical reason.",
      );
    }
  }
  if (promoted.length) {
    throw new Error(
      `${specimen.id}: the floor ledger is stale — ${promoted.join("; ")}. `
      + "Remove the metric from floor.failing so the gate holds the improvement.",
    );
  }
  return { status: declared.status || "met", promoted };
}

function alignedCanvases(reference, current, alignment = "top-left") {
  const width = Math.max(reference.width, current.width);
  const height = Math.max(reference.height, current.height);
  const referenceCanvas = createCanvas(width, height);
  const currentCanvas = createCanvas(width, height);
  for (const canvas of [referenceCanvas, currentCanvas]) {
    const context = canvas.getContext("2d");
    context.fillStyle = PANEL_BACKGROUND;
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;
  }
  const position = (image) => {
    if (alignment === "top-center") return { x: Math.floor((width - image.width) / 2), y: 0 };
    if (alignment === "bottom-center") {
      return { x: Math.floor((width - image.width) / 2), y: height - image.height };
    }
    if (alignment === "center") return { x: Math.floor((width - image.width) / 2), y: Math.floor((height - image.height) / 2) };
    return { x: 0, y: 0 };
  };
  const referencePosition = position(reference);
  const currentPosition = position(current);
  referenceCanvas.getContext("2d").drawImage(reference, referencePosition.x, referencePosition.y);
  currentCanvas.getContext("2d").drawImage(current, currentPosition.x, currentPosition.y);
  return { referenceCanvas, currentCanvas, referencePosition, currentPosition };
}

function compareCanvases(reference, current, threshold = DIFF_THRESHOLD) {
  const width = reference.width;
  const height = reference.height;
  const referencePixels = reference.getContext("2d").getImageData(0, 0, width, height).data;
  const currentPixels = current.getContext("2d").getImageData(0, 0, width, height).data;
  const overlay = createCanvas(width, height);
  const overlayContext = overlay.getContext("2d");
  overlayContext.drawImage(reference, 0, 0);
  overlayContext.globalAlpha = 0.5;
  overlayContext.drawImage(current, 0, 0);
  overlayContext.globalAlpha = 1;

  const difference = createCanvas(width, height);
  const differenceContext = difference.getContext("2d");
  const differenceImage = differenceContext.createImageData(width, height);
  let changedPixels = 0;
  let changedAt0 = 0;
  let changedAt1 = 0;
  let changedAt5 = 0;
  let changedAt10 = 0;
  let sumDelta = 0;
  let sumSquaredDelta = 0;
  let maxDelta = 0;
  let minChangedX = width;
  let minChangedY = height;
  let maxChangedX = -1;
  let maxChangedY = -1;
  for (let index = 0; index < referencePixels.length; index += 4) {
    const redDelta = Math.abs(referencePixels[index] - currentPixels[index]);
    const greenDelta = Math.abs(referencePixels[index + 1] - currentPixels[index + 1]);
    const blueDelta = Math.abs(referencePixels[index + 2] - currentPixels[index + 2]);
    const alphaDelta = Math.abs(referencePixels[index + 3] - currentPixels[index + 3]);
    const delta = Math.max(redDelta, greenDelta, blueDelta, alphaDelta);
    if (delta > 0) changedAt0 += 1;
    if (delta > 1) changedAt1 += 1;
    if (delta > 5) changedAt5 += 1;
    if (delta > 10) changedAt10 += 1;
    sumDelta += (redDelta + greenDelta + blueDelta + alphaDelta) / 4;
    sumSquaredDelta += (redDelta ** 2 + greenDelta ** 2 + blueDelta ** 2 + alphaDelta ** 2) / 4;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > threshold) {
      changedPixels += 1;
      const pixelIndex = index / 4;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      minChangedX = Math.min(minChangedX, x);
      minChangedY = Math.min(minChangedY, y);
      maxChangedX = Math.max(maxChangedX, x);
      maxChangedY = Math.max(maxChangedY, y);
      differenceImage.data[index] = 255;
      differenceImage.data[index + 1] = Math.max(0, 128 - delta / 2);
      differenceImage.data[index + 2] = Math.max(0, 128 - delta / 2);
      differenceImage.data[index + 3] = 255;
    } else {
      const luminance = Math.round(
        referencePixels[index] * 0.2126
        + referencePixels[index + 1] * 0.7152
        + referencePixels[index + 2] * 0.0722,
      );
      const ghost = Math.round(235 + luminance * 0.08);
      differenceImage.data[index] = ghost;
      differenceImage.data[index + 1] = ghost;
      differenceImage.data[index + 2] = ghost;
      differenceImage.data[index + 3] = 255;
    }
  }
  differenceContext.putImageData(differenceImage, 0, 0);
  const totalPixels = width * height;
  return {
    overlay,
    difference,
    metrics: {
      width,
      height,
      threshold,
      changedPixels,
      totalPixels,
      changedRatio: changedPixels / totalPixels,
      exactChangedPixels: changedAt0,
      changedPixelsAt1: changedAt1,
      changedPixelsAt5: changedAt5,
      changedPixelsAt10: changedAt10,
      meanAbsoluteChannelDelta: sumDelta / totalPixels,
      rootMeanSquareChannelDelta: Math.sqrt(sumSquaredDelta / totalPixels),
      maxChannelDelta: maxDelta,
      differenceBoundingBox: changedPixels ? {
        x: minChangedX,
        y: minChangedY,
        width: maxChangedX - minChangedX + 1,
        height: maxChangedY - minChangedY + 1,
      } : null,
    },
  };
}

function atlasLayout(results, requestedWidth = 1120, columns = 2) {
  const width = requestedWidth;
  const columnWidth = Math.floor((width - ATLAS_PADDING * 2 - ATLAS_GAP * (columns - 1)) / columns);
  const rows = [];
  for (let index = 0; index < results.length; index += columns) {
    const items = results.slice(index, index + columns);
    const contentHeight = Math.max(...items.map((item) => item.referenceCanvas.height));
    rows.push({ items, height: PANEL_LABEL_HEIGHT + contentHeight + ATLAS_GAP });
  }
  const height = ATLAS_HEADER_HEIGHT + ATLAS_PADDING + rows.reduce((sum, row) => sum + row.height, 0);
  return { width, height, columnWidth, rows, columns };
}

function drawAtlas(results, manifest, kind) {
  const layout = atlasLayout(results, manifest.output?.atlasWidth, manifest.output?.columns);
  const canvas = createCanvas(layout.width, layout.height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#d4d4d4";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111111";
  context.font = "bold 18px sans-serif";
  const titleMap = {
    referenceCanvas: "Reference",
    currentCanvas: "Current implementation",
    overlay: "50% overlay",
    difference: "Pixel difference",
  };
  context.fillText(manifest.target, ATLAS_PADDING, 28);
  context.fillText(titleMap[kind], 360, 28);
  context.font = "12px sans-serif";
  context.fillText("1 CSS pixel = 1 source pixel · no interpolation", ATLAS_PADDING, 47);
  let y = ATLAS_HEADER_HEIGHT;
  for (const row of layout.rows) {
    row.items.forEach((item, columnIndex) => {
      const x = ATLAS_PADDING + columnIndex * (layout.columnWidth + ATLAS_GAP);
      context.fillStyle = "#eeeeee";
      context.fillRect(x, y, layout.columnWidth, row.height - ATLAS_GAP);
      context.strokeStyle = "#777777";
      context.strokeRect(x + 0.5, y + 0.5, layout.columnWidth - 1, row.height - ATLAS_GAP - 1);
      context.fillStyle = "#111111";
      context.font = "bold 12px sans-serif";
      context.fillText(item.label, x + 8, y + 15);
      context.font = "11px sans-serif";
      const sizeText = `${item.referenceNative.width}×${item.referenceNative.height} ref / ${item.currentNative.width}×${item.currentNative.height} current`;
      context.fillText(sizeText, x + 8, y + 29);
      const image = item[kind];
      context.imageSmoothingEnabled = false;
      context.drawImage(image, x + 1, y + PANEL_LABEL_HEIGHT);
    });
    y += row.height;
  }
  return canvas;
}

function writeCanvas(path, canvas) {
  writeFileSync(path, canvas.toBuffer("image/png"));
}

function sourceFileHashes() {
  const candidates = [
    "index.html",
    "app.bundle.js",
    "styles.bundle.css",
    "app/core/theme-registry.js",
    "styles/65-appearance-themes.css",
    "styles/66-theme-lab.css",
  ];
  return Object.fromEntries(candidates.map((relativePath) => {
    const path = join(root, relativePath);
    return [relativePath, existsSync(path) ? sha256File(path) : null];
  }));
}

const options = parseArgs(process.argv.slice(2));
const { manifest, path: manifestPath } = options.manifestPath
  ? (() => {
      const path = resolve(options.manifestPath);
      const loaded = JSON.parse(readFileSync(path, "utf8"));
      validateFidelityManifest(loaded, { label: path });
      return { manifest: loaded, path };
    })()
  : readManifest(options.theme);
// One board writes one directory. The board name is the manifest file stem, not
// manifest.theme: a theme may own more than one board (for example the Yosemite
// 1x contract plus the yosemite-2x Retina acceptance board), and two boards that
// share an output directory silently overwrite each other's metrics.json,
// review-summary.json, overlay, and diff.
const boardName = basename(manifestPath).replace(/\.json$/i, "");
const outputDir = options.outputDir || join(DEFAULT_OUTPUT_ROOT, boardName);
// One floor for every specimen on this board. edgeErrorPx is a pixel distance,
// so a Retina board scales it; the other two metrics are scale-free.
const boardFloor = floorForCapture(manifest.capture);
mkdirSync(outputDir, { recursive: true });

let server;
let browser;
let pageContext;
try {
  const { cacheDir, prepared } = await prepareSources(manifest, options);
  server = await startAppServer();
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--force-color-profile=srgb",
      "--disable-lcd-text",
      "--font-render-hinting=none",
    ],
  });
  if (manifest.capture.playwrightVersion && playwrightVersion !== manifest.capture.playwrightVersion) {
    throw new Error(`Playwright ${playwrightVersion} does not match canonical contract ${manifest.capture.playwrightVersion}`);
  }
  if (manifest.capture.browserVersion && browser.version() !== manifest.capture.browserVersion) {
    throw new Error(`Chromium ${browser.version()} does not match canonical contract ${manifest.capture.browserVersion}`);
  }
  pageContext = await prepareCurrentPage(browser, server.url, manifest, outputDir);
  const results = [];
  for (const specimen of manifest.specimens) {
    const source = prepared.get(specimen.reference.source);
    if (!source) throw new Error(`${specimen.id}: unknown reference source ${specimen.reference.source}`);
    const reference = referenceCrop(source, specimen.reference.crop, `${specimen.id} reference`);
    const current = await captureCurrentSpecimen(pageContext.page, specimen);
    const repeat = await captureCurrentSpecimen(pageContext.page, specimen);
    const repeatComparison = compareCanvases(current.canvas, repeat.canvas, 0);
    const repeatContract = specimen.repeat || {};
    const maxRepeatPixels = repeatContract.maxChangedPixels ?? 0;
    const maxRepeatChannelDelta = repeatContract.maxChannelDelta ?? 0;
    const repeatExceeded = repeatComparison.metrics.exactChangedPixels > maxRepeatPixels
      || repeatComparison.metrics.maxChannelDelta > maxRepeatChannelDelta;
    if (repeatExceeded) {
      writeCanvas(join(outputDir, `${specimen.id}-unstable-a.png`), current.canvas);
      writeCanvas(join(outputDir, `${specimen.id}-unstable-b.png`), repeat.canvas);
      writeCanvas(join(outputDir, `${specimen.id}-unstable-diff.png`), repeatComparison.difference);
      throw new Error(`${specimen.id}: current capture is unstable across identical runs (${repeatComparison.metrics.exactChangedPixels} pixels, max delta ${repeatComparison.metrics.maxChannelDelta}; allowed ${maxRepeatPixels} pixels, max delta ${maxRepeatChannelDelta})`);
    }
    const aligned = alignedCanvases(reference.canvas, current.canvas, specimen.align);
    const comparison = compareCanvases(
      aligned.referenceCanvas,
      aligned.currentCanvas,
      specimen.compare?.channelThreshold ?? DIFF_THRESHOLD,
    );
    const geometryMaterial = analyzeGeometryAndMaterial(
      aligned.referenceCanvas,
      aligned.currentCanvas,
      { geometryMask: specimen.geometryMask },
    );
    const markAnalysis = specimen.mark
      ? analyzeMark(aligned.referenceCanvas, aligned.currentCanvas, specimen.mark)
      : null;
    if (specimen.mark && markAnalysis.markMismatch === null) {
      throw new Error(
        `${specimen.id}: the mark check found no glyph in either image (${markAnalysis.reason}). `
        + "Fix the inset/threshold, or drop `mark` if this specimen carries no glyph.",
      );
    }
    const review = {
      ...geometryMaterial,
      ...(markAnalysis ? { markMismatch: markAnalysis.markMismatch } : {}),
      changedRatio: Math.round(comparison.metrics.changedRatio * 1000) / 1000,
      sourceScale: specimen.reference?.scale || manifest.capture?.sourceScale || 1,
    };
    assertSpecimenTolerances(specimen, review, manifest.capture?.tolerances || DEFAULT_TOLERANCES);
    const floorResult = assertSpecimenFloor(specimen, review, boardFloor);
    validateComputedAssertions(current.computedAssertions);
    results.push({
      id: specimen.id,
      label: specimen.label,
      floor: { ...floorResult, limits: boardFloor, declared: specimen.floor || null },
      sourceId: source.id,
      sourceUrl: source.url,
      referenceNative: { width: reference.canvas.width, height: reference.canvas.height, crop: reference.crop },
      currentNative: { width: current.canvas.width, height: current.canvas.height, crop: current.crop, selectorBox: current.box },
      currentSha256: sha256Buffer(current.canvas.toBuffer("image/png")),
      referenceCanvas: aligned.referenceCanvas,
      currentCanvas: aligned.currentCanvas,
      overlay: comparison.overlay,
      difference: comparison.difference,
      metrics: comparison.metrics,
      review,
      repeat: {
        contract: {
          maxChangedPixels: maxRepeatPixels,
          maxChannelDelta: maxRepeatChannelDelta,
        },
        metrics: repeatComparison.metrics,
      },
      positions: {
        reference: aligned.referencePosition,
        current: aligned.currentPosition,
      },
      computed: current.computed,
      computedAssertions: current.computedAssertions,
    });
    const floorTag = floorResult.status === "met" ? "floor met" : `floor ${floorResult.status}`;
    console.log(`OK  mapped ${specimen.id}: ${(comparison.metrics.changedRatio * 100).toFixed(2)}% changed, ${floorTag}`);
  }

  writeCanvas(join(outputDir, "reference.png"), drawAtlas(results, manifest, "referenceCanvas"));
  writeCanvas(join(outputDir, "current.png"), drawAtlas(results, manifest, "currentCanvas"));
  writeCanvas(join(outputDir, "overlay-50.png"), drawAtlas(results, manifest, "overlay"));
  writeCanvas(join(outputDir, "pixel-diff.png"), drawAtlas(results, manifest, "difference"));
  const tilesDir = join(outputDir, "tiles");
  mkdirSync(tilesDir, { recursive: true });
  for (const result of results) {
    writeCanvas(join(tilesDir, `${result.id}-reference.png`), result.referenceCanvas);
    writeCanvas(join(tilesDir, `${result.id}-current.png`), result.currentCanvas);
    writeCanvas(join(tilesDir, `${result.id}-overlay-50.png`), result.overlay);
    writeCanvas(join(tilesDir, `${result.id}-pixel-diff.png`), result.difference);
  }

  const totalChanged = results.reduce((sum, result) => sum + result.metrics.changedPixels, 0);
  const totalPixels = results.reduce((sum, result) => sum + result.metrics.totalPixels, 0);
  const metrics = {
    schemaVersion: 1,
    theme: manifest.theme,
    target: manifest.target,
    generatedAt: new Date().toISOString(),
    sourceScale: manifest.capture?.sourceScale || 1,
    summary: {
      changedPixels: totalChanged,
      totalPixels,
      changedRatio: totalChanged / totalPixels,
      note: "This is diagnostic evidence, not a pass threshold. Geometry and text differences are intentionally visible.",
    },
    specimens: results.map((result) => ({
      id: result.id,
      label: result.label,
      sourceId: result.sourceId,
      sourceUrl: result.sourceUrl,
      reference: result.referenceNative,
      current: result.currentNative,
      currentSha256: result.currentSha256,
      positions: result.positions,
      computed: result.computed,
      metrics: result.metrics,
      repeat: result.repeat,
      floor: result.floor,
      computedAssertions: result.computedAssertions,
    })),
  };
  writeFileSync(join(outputDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);

  const reviewSpecimens = results.map((result) => ({
    id: result.id,
    label: result.label,
    ...result.review,
    floorStatus: result.floor.status,
    floorFailing: result.floor.declared?.failing || [],
    floorExempt: result.floor.declared?.exempt || [],
  })).sort((left, right) => (
    (right.geometryMismatch ?? 0) - (left.geometryMismatch ?? 0)
    || (right.edgeErrorPx ?? 0) - (left.edgeErrorPx ?? 0)
    || (right.materialError ?? 0) - (left.materialError ?? 0)
  ));
  const floorCounts = reviewSpecimens.reduce((counts, entry) => {
    counts[entry.floorStatus] = (counts[entry.floorStatus] || 0) + 1;
    return counts;
  }, {});
  const floorGapMetrics = FLOOR_METRICS.filter((metric) => reviewSpecimens
    .some((entry) => entry.floorFailing.includes(metric) || entry.floorExempt.includes(metric)));
  const reviewSummary = {
    theme: manifest.theme,
    target: manifest.target,
    generatedAt: new Date().toISOString(),
    sourceScale: manifest.capture?.sourceScale || 1,
    note: "Machine-readable fidelity summary for a visual reviewer. geometryMismatch and edgeErrorPx describe the control silhouette (strict); materialError describes interior colour while ignoring antialiasing and text. Fix the top residual regions first.",
    floor: {
      limits: boardFloor,
      counts: floorCounts,
      gapMetrics: floorGapMetrics,
      note: "The floor is the absolute tier: how far this board is from the historical target. It is never derived from our own output. A specimen counted as gap or unreliable-reference is not held to the floor for the metrics named in floorFailing / floorExempt.",
    },
    specimens: reviewSpecimens,
    topResidualRegions: reviewSpecimens.slice(0, 3).map((entry) => entry.id),
  };
  writeFileSync(join(outputDir, "review-summary.json"), `${JSON.stringify(reviewSummary, null, 2)}\n`);
  console.log(`OK  review summary: top residual = ${reviewSummary.topResidualRegions.join(", ") || "(none)"}`);
  const floorLine = Object.entries(floorCounts).map(([status, count]) => `${count} ${status}`).join(", ");
  console.log(`OK  fidelity floor (geometry ${boardFloor.geometryMismatch}, edge ${boardFloor.edgeErrorPx}px, material ${boardFloor.materialError}): ${floorLine} of ${reviewSpecimens.length} specimens`);

  const platformFonts = await platformFontFingerprint(pageContext.page, manifest.capture.fontProbeSelectors);
  assertPlatformFonts(platformFonts, manifest.capture.fontAssertions);
  assertRequiredResources(pageContext.resourceResponses, manifest.capture);
  const runtime = await pageContext.page.evaluate(() => ({
    navigatorLanguage: navigator.language,
    navigatorLanguages: navigator.languages,
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    visualViewport: window.visualViewport ? {
      width: window.visualViewport.width,
      height: window.visualViewport.height,
      scale: window.visualViewport.scale,
    } : null,
    documentLanguage: document.documentElement.lang,
    fontStatus: document.fonts?.status,
  }));
  const environment = {
    schemaVersion: 1,
    theme: manifest.theme,
    target: manifest.target,
    manifest: {
      path: manifestPath.slice(root.length + 1),
      sha256: sha256File(manifestPath),
    },
    canonicalSourceDirectory: options.sourceDir ? options.sourceDir : cacheDir.slice(root.length + 1),
    captureContract: manifest.capture,
    browser: {
      engine: "playwright-chromium",
      playwrightVersion,
      browserVersion: browser.version(),
      executablePath: chromium.executablePath(),
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      osRelease: osRelease(),
      osVersion: osVersion(),
    },
    runtime,
    contentSha256: pageContext.contentSha256,
    platformFonts,
    resourceResponses: pageContext.resourceResponses,
    sourceFileHashes: sourceFileHashes(),
    diagnostics: pageContext.diagnostics,
  };
  writeFileSync(join(outputDir, "environment.json"), `${JSON.stringify(environment, null, 2)}\n`);
  console.log(`OK  fidelity artifacts: ${outputDir}`);
  console.log(`NO  canonical delta remains: ${((totalChanged / totalPixels) * 100).toFixed(2)}% of mapped pixels`);
} catch (error) {
  console.error(`Theme Lab fidelity capture failed: ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  if (pageContext?.context) await pageContext.context.close();
  if (browser) await browser.close();
  if (server) await stopProcess(server.child);
}
