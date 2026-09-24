// The status band of a home-screen web app, measured in a real engine.
//
// A web clip gets a blur painted across the top of the screen by the system,
// and what a person sees is whatever the app's own bar lets through: over a
// flat, opaque strip that blur has nothing to work with; over a translucent
// material it is the desk showing through, which is the washed band the owner
// reported twice (DEBT-AUDIT.zh-CN.md §11 and §14; the MacRumors thread "iOS 27
// PWA blurred across top of screen" traces it to exactly that).
//
// This drives the shipped build in WebKit with the signal and the insets a real
// clip reports, and asks three questions of the same three surfaces the owner
// uses — a phone in both orientations and a 12.9" tablet:
//
//   1. does the menu bar cover the band,
//   2. is any control painted inside it,
//   3. does the band show what is behind it (a black desk swapped for a white
//      one must not change what the band photographs).
//
// The third is the one a style declaration cannot answer: a bar can be opaque
// by an image whose colours happen to be solid (Aqua's pinstripes) and
// translucent by a colour (Liquid Glass's 0.9 white), so it is asked of pixels.

import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { webkit } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let checked = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  checked += 1;
  console.log(`OK  ios-standalone-band: ${message}`);
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(url, deadlineMs) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((wait) => setTimeout(wait, 400));
  }
  return false;
}

// The four surfaces, with the insets a real clip reports on each. An iPhone
// turns its top inset into the two side insets in landscape and keeps a shorter
// bottom one; an iPad keeps a 24pt top inset in both orientations.
const SURFACES = [
  { name: "iPhone portrait", width: 438, height: 954, inset: { top: 59, bottom: 34, left: 0, right: 0 }, mobile: true },
  { name: "iPhone landscape", width: 954, height: 438, inset: { top: 0, bottom: 21, left: 59, right: 59 }, mobile: true },
  { name: "iPad portrait", width: 1024, height: 1366, inset: { top: 24, bottom: 20, left: 0, right: 0 }, mobile: true },
];

const APPEARANCES = ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "big-sur", "liquid-glass", "nextstep"];

const port = await reservePort();
const scratch = mkdtempSync(path.join(tmpdir(), "ios-standalone-band-"));
const server = spawn(process.execPath, ["tooling/dev-preview.mjs"], {
  cwd: root,
  env: { ...process.env, DEV_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += String(chunk); });
server.stderr.on("data", (chunk) => { serverOutput += String(chunk); });

const url = `http://127.0.0.1:${port}/`;
const browser = await webkit.launch();
try {
  assert(await waitForServer(url, 120000), `the preview answers on ${url} — ${serverOutput.trim().split("\n").slice(-1)[0] || ""}`);
  for (const surface of SURFACES) {
    const context = await browser.newContext({
      viewport: { width: surface.width, height: surface.height },
      isMobile: surface.mobile,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    // The app asks the platform which surface it is on; a browser is never a
    // web clip, so the phase answers that question the way a clip would.
    await page.addInitScript(() => {
      try {
        Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
      } catch {
        // a browser that refuses the property is not a web clip
      }
    });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.body.classList.contains("is-booting"), null, { timeout: 120000 });
    await page.addStyleTag({
      content: `:root{--safe-area-top:${surface.inset.top}px;--safe-area-bottom:${surface.inset.bottom}px;`
        + `--safe-area-left:${surface.inset.left}px;--safe-area-right:${surface.inset.right}px;}`,
    });
    await page.waitForTimeout(400);

    assert(
      await page.evaluate(() => document.documentElement.hasAttribute("data-installed")),
      `${surface.name}: the app marks itself as the installed surface`,
    );

    for (const appearance of APPEARANCES) {
      await page.evaluate((id) => { window.AISystem6Theme.applyTheme(id); }, appearance);
      await page.waitForTimeout(320);
      const geometry = await page.evaluate((insetTop) => {
        const bar = document.querySelector(".menu-bar");
        const rect = bar.getBoundingClientRect();
        // Every control on the desk, against the band the system owns.
        const controls = [...document.querySelectorAll("button, [role='button'], input, select, textarea")]
          .filter((el) => {
            const box = el.getBoundingClientRect();
            if (box.width < 1 || box.height < 1) return false;
            const style = getComputedStyle(el);
            return style.visibility !== "hidden" && style.display !== "none" && !el.closest(".is-hidden");
          })
          .map((el) => el.getBoundingClientRect());
        return {
          barTop: Math.round(rect.top),
          barBottom: Math.round(rect.bottom),
          position: getComputedStyle(bar).position,
          intruding: controls.filter((box) => box.top < insetTop - 1 && box.bottom > 1).length,
        };
      }, surface.inset.top);
      const where = `${surface.name} · ${appearance}`;
      if (!surface.inset.top) {
        assert(geometry.barTop === 0 && geometry.intruding === 0, `${where}: the bar sits at the top with nothing painted over it`);
        continue;
      }
      assert(
        geometry.barTop <= 0.5 && geometry.barBottom >= surface.inset.top - 1,
        `${where}: the menu bar covers the ${surface.inset.top}px band (${geometry.barTop}..${geometry.barBottom}, ${geometry.position})`,
      );
      assert(geometry.intruding === 0, `${where}: no control is painted inside the band`);

      // The band must not show what is behind it. Black desk, then white desk,
      // same photograph: any difference is the see-through half of the fill.
      await page.evaluate(() => {
        if (document.getElementById("band-probe")) return;
        const back = document.createElement("div");
        back.id = "band-probe";
        back.style.cssText = "position:fixed;inset:0;z-index:5;background:#000;pointer-events:none";
        document.body.prepend(back);
      });
      const clip = { x: 0, y: 0, width: surface.width, height: Math.round(surface.inset.top) };
      const shot = async (color) => {
        await page.evaluate((value) => { document.getElementById("band-probe").style.background = value; }, color);
        await page.waitForTimeout(120);
        return page.screenshot({ clip });
      };
      const dark = await shot("#000000");
      const light = await shot("#ffffff");
      await page.evaluate(() => document.getElementById("band-probe")?.remove());
      assert(Buffer.compare(dark, light) === 0, `${where}: the band is opaque — a white desk behind the bar photographs the same as a black one`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`ios-standalone-band: ${checked} assertions across ${SURFACES.length} surfaces and ${APPEARANCES.length} appearances`);
