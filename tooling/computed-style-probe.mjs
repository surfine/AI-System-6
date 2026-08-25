#!/usr/bin/env node
// Computed-style probe for CSS drains.
//
// The pixel net proves 36 cells. A drain often touches a selector that lives
// outside them — Alarm Clock, the chooser, a memory card — and "the base sets
// the same value" is a candidate, not a proof: a rule in between, or a media
// override the appearance re-asserts, can make a redundant-looking declaration
// load-bearing.
//
// This reads the actual computed value of the actual property on every element
// the selector matches, in every appearance, and writes it to a JSON record.
// Run it before a drain and after: identical records mean the drain changed
// nothing anywhere the selector reaches, not merely in the cells we screenshot.
//
//   node tooling/computed-style-probe.mjs --targets <file.json> --out <file.json>

import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const THEMES = ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"];
const WIDTHS = [{ id: "phone", width: 375, height: 812 }, { id: "desktop", width: 1280, height: 820 }];

const args = process.argv.slice(2);
const targetsPath = args[args.indexOf("--targets") + 1];
const outPath = args[args.indexOf("--out") + 1];
// --noise walks the matrix twice in one invocation and reports which targets
// disagree with themselves. Some computed values depend on which windows
// happen to be open or active, and those wander between runs: `.close-box::before`
// transform came back 16 rotated glyphs one pass and 15 the next with no code
// change at all. A target that cannot agree with itself cannot testify about
// an edit, and every mismatch it reports was being read as signal.
const noiseMode = args.includes("--noise");
const targets = JSON.parse(readFileSync(targetsPath, "utf8"));

async function sweep(browser, server) {
  const record = {};
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      record[`${theme}|${width.id}`] = await readCombination(browser, server, theme, width);
      process.stdout.write(".");
    }
  }
  process.stdout.write("\n");
  return record;
}

const server = await startAppServer(root);
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb"] });
let record = {};
async function readCombination(browser, server, theme, width) {
  {
    {
      const context = await browser.newContext({
        viewport: { width: width.width, height: width.height },
        deviceScaleFactor: 1, reducedMotion: "reduce",
        isMobile: width.width < 768, hasTouch: width.width < 768,
      });
      await context.addInitScript((t) => localStorage.setItem("ai-system-6-theme", t), theme);
      const page = await context.newPage();
      await page.goto(server.url, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 20000 });
      // Open every window the registry knows, so selectors that only exist
      // inside a summoned surface are actually in the document.
      await page.evaluate((t) => {
        window.AISystem6Theme?.applyTheme(t, { experimental: true, persist: false, announce: false });
        if (typeof activateWorkspaceProfile === "function") activateWorkspaceProfile("writing", { persist: false, announce: false });
      }, theme);
      await page.waitForTimeout(300);
      // Never await inside the page: an in-page promise that outlives its task
      // gets garbage collected and the whole evaluate rejects. Fire the lazy
      // loads, wait on this side, then open the windows synchronously.
      const ids = targets.windows || [];
      for (let index = 0; index < ids.length; index += 8) {
        const chunk = ids.slice(index, index + 8);
        await page.evaluate((list) => {
          for (const id of list) {
            try {
              if (!document.querySelector(`.window[data-window="${id}"]`) && typeof loadLazyWindowModule === "function") {
                loadLazyWindowModule(id);
              }
            } catch {}
          }
        }, chunk);
        await page.waitForTimeout(400);
        await page.evaluate((list) => {
          for (const id of list) {
            try { if (typeof openWindow === "function") openWindow(id); } catch {}
          }
        }, chunk);
        await page.waitForTimeout(120);
      }
      // Surfaces that are built on demand are invisible to a probe that only
       // opens windows. Ask the app to render the ones a batch names.
      await page.evaluate(() => {
        try { if (typeof renderMultiFinderMenu === "function") renderMultiFinderMenu(); } catch {}
        for (const el of document.querySelectorAll(".multifinder-menu, .menu-popover")) el.classList.remove("is-hidden");
      });
      await page.waitForTimeout(600);
      // font-family resolves only once the faces are in. Reading before that
      // makes the probe report a change no edit caused — tests/visual-snapshot-manifest.mjs
      // avoids the property entirely for the same reason; here it is waited for.
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(200);
      const values = await page.evaluate((list) => {
        const out = {};
        for (const { selector, property } of list) {
          // querySelectorAll cannot return a pseudo-element, so a `::before`
          // selector matched nothing and the probe reported NO-MATCH on exactly
          // the rows a title-bar glyph lives in. Split the pseudo off and read
          // it through the second argument of getComputedStyle instead.
          const pseudoAt = selector.search(/::(before|after|first-line|first-letter|marker|placeholder)\b/);
          const host = pseudoAt === -1 ? selector : selector.slice(0, pseudoAt);
          const pseudo = pseudoAt === -1 ? null : selector.slice(pseudoAt);
          let nodes = [];
          try { nodes = [...document.querySelectorAll(host)]; } catch { out[`${selector}|${property}`] = "BAD-SELECTOR"; continue; }
          // Sorted, because querySelectorAll returns document order and the
          // order windows land in the DOM is not stable between runs. Sorting
          // keeps the multiset — how many elements hold each value — so a real
          // change still shows, while a reshuffle of identical values does not
          // masquerade as one.
          out[`${selector}|${property}`] = nodes.length
            ? nodes.map((n) => getComputedStyle(n, pseudo).getPropertyValue(property).trim()).sort().join("~")
            : "NO-MATCH";
        }
        return out;
      }, targets.probes);
      await context.close();
      return values;
    }
  }
}

try {
  record = await sweep(browser, server);
  if (noiseMode) {
    const second = await sweep(browser, server);
    const unstable = new Set();
    let total = 0;
    for (const combo of Object.keys(record)) {
      for (const key of Object.keys(record[combo])) {
        total += 1;
        if (record[combo][key] !== second[combo]?.[key]) unstable.add(key);
      }
    }
    console.log(`\n=== 噪音报告:同一棵树,两轮 ===`);
    console.log(`读数 ${total}，自己与自己不一致的目标 ${unstable.size} 个`);
    for (const key of unstable) console.log(`  ~ ${key}  <- 状态敏感，不能为任何改动作证`);
    writeFileSync(outPath.replace(/\.json$/, ".unstable.json"), `${JSON.stringify([...unstable], null, 1)}\n`);
  }
} finally {
  await browser.close();
  await stopProcess(server.child);
}
writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
const matched = Object.values(record).flatMap((v) => Object.values(v)).filter((v) => v !== "NO-MATCH" && v !== "BAD-SELECTOR").length;
console.log(`probed ${targets.probes.length} selector/property pairs x ${Object.keys(record).length} appearance-width combinations; ${matched} had matching elements -> ${outPath}`);
