// Instrument: does the Dock's minimized-window tile get a REAL DOM bitmap?
//
//   node tests/e2e/probe-dock-dom-miniature.spec.mjs
//
// The J1 work (owner decision 2B) claims a minimized window's Dock tile shows a
// html2canvas-class miniature produced by cloning the live window into an SVG
// <foreignObject> and rasterizing that to a canvas. Nothing in the headless
// feature contracts can prove it: their canvas stub draws no pixels, so
// "captureDomWindowBitmap" could be returning nothing while every contract
// stays green. This probe drives a real Chromium, puts a uniquely colored
// swatch inside the window, minimizes it, and reads the tile's bitmap back
// pixel by pixel. The swatch color can only be in the picture if the DOM was
// really rasterized -- the schematic paint path never draws it.

import { chromium } from "@playwright/test";
import { repositoryRoot } from "../../tooling/lib/paths.mjs";
import { startAppServer, stopProcess } from "../../tooling/lib/app-preview-server.mjs";
import { bootApp, dismissGuide, openWindow } from "./helpers.mjs";

const SWATCH = { r: 255, g: 0, b: 128, hex: "rgb(255,0,128)" };

const { child: server, url: baseURL } = await startAppServer(repositoryRoot);
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const report = { capture: null, tile: null, sampled: null };
try {
  await bootApp(page);
  await dismissGuide(page);

  // A Snow Leopard MultiFinder desk with the Dock and the yellow lamp on, the
  // state the J1 tile only exists in.
  await page.evaluate(() => {
    localStorage.setItem("ai-system-6-dock", JSON.stringify({ visible: true }));
    localStorage.setItem("ai-system-6-minimize", JSON.stringify({ enabled: true }));
    runtimeEnvironment = "multifinder";
  });
  await page.evaluate(async () => {
    await window.AISystem6Theme.applyTheme("snow-leopard", { persist: false });
    await window.AISystem6Theme.whenReady();
  });
  await page.waitForFunction(() => !!window.AISystem6DeskDock && !!window.AISystem6WindowMinimize);

  await openWindow(page, "notePad");
  await page.evaluate(() => {
    const win = getWindow("notePad");
    focusWindow(win);
    // A swatch the schematic paint can never draw: the paint path fills the
    // pane with its solid background and a title bar, nothing else.
    const swatch = document.createElement("div");
    swatch.id = "probe-swatch";
    swatch.style.cssText = "position:absolute;left:24px;top:60px;width:160px;height:90px;background:rgb(255,0,128);z-index:5;";
    const pane = win.querySelector(".window-pane, .window-body, .window-content") || win;
    pane.append(swatch);
  });

  // The raw capture promise, before minimize hides the window.
  report.capture = await page.evaluate(async () => {
    try {
      const win = getWindow("notePad");
      const started = performance.now();
      const capture = await window.AISystem6WindowMinimize.captureDomWindowBitmap(win);
      const ms = Math.round(performance.now() - started);
      if (!capture?.canvas) return { ok: false, ms, reason: "capture returned no canvas" };
      const ctx = capture.canvas.getContext("2d");
      const data = ctx.getImageData(0, 0, capture.canvas.width, capture.canvas.height).data;
      let swatchPixels = 0;
      let opaquePixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) opaquePixels += 1;
        if (Math.abs(data[i] - 255) < 24 && data[i + 1] < 40 && Math.abs(data[i + 2] - 128) < 24) swatchPixels += 1;
      }
      return {
        ok: true,
        ms,
        source: capture.source || "",
        width: capture.canvas.width,
        height: capture.canvas.height,
        cssWidth: capture.cssWidth,
        cssHeight: capture.cssHeight,
        opaquePixels,
        swatchPixels,
        dataUrlLength: (capture.dataUrl || "").length,
      };
    } catch (error) {
      return { ok: false, reason: `${error.name}: ${error.message}` };
    }
  });

  // Now the real verb: minimize and read the Dock tile the writer sees.
  await page.evaluate(() => {
    // Instrument the decode so a fallback says WHY it fell back.
    window.__imgLog = [];
    const RealImage = window.Image;
    const srcSetter = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src").set;
    const srcGetter = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src").get;
    window.Image = function ImageProbe() {
      const img = new RealImage();
      Object.defineProperty(img, "src", {
        configurable: true,
        get() { return srcGetter.call(img); },
        set(value) {
          const text = String(value);
          window.__imgLog.push({ ev: "src", t: Math.round(performance.now()), len: text.length, kind: text.slice(0, 22) });
          img.addEventListener("load", () => window.__imgLog.push({ ev: "load", t: Math.round(performance.now()), w: img.naturalWidth, h: img.naturalHeight }));
          img.addEventListener("error", () => window.__imgLog.push({ ev: "error", t: Math.round(performance.now()) }));
          srcSetter.call(img, value);
        },
      });
      return img;
    };
    const realToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function patchedToDataURL(...args) {
      try {
        const value = realToDataURL.apply(this, args);
        window.__imgLog.push({ ev: "toDataURL", t: Math.round(performance.now()), len: value.length, w: this.width, h: this.height });
        return value;
      } catch (error) {
        window.__imgLog.push({ ev: "toDataURL-throw", t: Math.round(performance.now()), w: this.width, h: this.height, message: String(error.message || error) });
        throw error;
      }
    };
    const win = getWindow("notePad");
    win.querySelector("#probe-swatch")?.remove();
    const swatch = document.createElement("div");
    swatch.id = "probe-swatch";
    swatch.style.cssText = "position:absolute;left:24px;top:60px;width:160px;height:90px;background:rgb(255,0,128);z-index:5;";
    (win.querySelector(".window-pane, .window-body, .window-content") || win).append(swatch);
    minimizeWindow(win);
  });
  await page.waitForTimeout(600);
  report.imgLog = await page.evaluate(() => window.__imgLog);
  report.stored = await page.evaluate(() => {
    const url = window.AISystem6WindowMinimize.getMiniatureDataUrl(getWindow("notePad")) || "";
    return { length: url.length, head: url.slice(0, 22) };
  });
  await page.evaluate(() => window.AISystem6DeskDock.sync());
  await page.waitForSelector('.desk-dock-items [data-miniwindow="notePad"]', { timeout: 10_000 });

  report.tile = await page.evaluate(() => {
    const cell = document.querySelector('.desk-dock-items [data-miniwindow="notePad"]');
    const figure = cell?.querySelector(".desk-dock-miniature");
    const photo = cell?.querySelector(".desk-dock-miniature-photo");
    return {
      isPhoto: !!figure?.classList.contains("is-photo"),
      src: photo?.getAttribute("src") || "",
      srcLength: (photo?.getAttribute("src") || "").length,
      isSchematic: !!cell?.querySelector(".desk-dock-miniature-bar"),
    };
  });

  if (report.tile?.isPhoto && report.tile.src.startsWith("data:image")) {
    report.sampled = await page.evaluate(async ({ r, g, b }) => {
      const photo = document.querySelector('.desk-dock-items [data-miniwindow="notePad"] .desk-dock-miniature-photo');
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("tile bitmap did not decode"));
        img.src = photo.getAttribute("src");
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let swatchPixels = 0;
      let distinct = new Set();
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - r) < 30 && Math.abs(data[i + 1] - g) < 40 && Math.abs(data[i + 2] - b) < 30) swatchPixels += 1;
        distinct.add(`${data[i] >> 5},${data[i + 1] >> 5},${data[i + 2] >> 5}`);
      }
      return { width: canvas.width, height: canvas.height, swatchPixels, distinctColors: distinct.size };
    }, SWATCH);
  }

  const failures = [];
  const expect = (ok, message) => { if (!ok) failures.push(message); };
  expect(report.capture?.ok === true, `DOM capture failed: ${JSON.stringify(report.capture)}`);
  expect(report.capture?.source === "dom", "capture did not report the DOM path as its source");
  expect((report.capture?.swatchPixels || 0) > 1000, `the raw DOM canvas did not contain the window's swatch (${report.capture?.swatchPixels || 0} px)`);
  expect(report.tile?.isPhoto === true, "the minimized-window tile is not a photo");
  expect(!report.tile?.isSchematic, "the tile fell back to the schematic document drawing");
  expect((report.sampled?.swatchPixels || 0) > 1000, `the tile bitmap did not contain the window's swatch (${report.sampled?.swatchPixels || 0} px), so it is the schematic fallback, not the window`);
  report.failures = failures;
} finally {
  console.log("PROBE-REPORT", JSON.stringify(report, null, 2));
  const failures = report.failures || [];
  if (report.failures) {
    if (failures.length) {
      console.error(`PROBLEM: ${failures.length} issue(s):\n${failures.join("\n")}`);
      process.exitCode = 1;
    } else {
      console.log("probe: the Dock tile pixels are the window's own, not the schematic fallback");
    }
  }
  await context.close();
  await browser.close();
  stopProcess(server);
}
