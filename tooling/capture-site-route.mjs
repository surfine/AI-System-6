#!/usr/bin/env node

// Capture the writing route from the real app: Question Sheet, Outline,
// Section Drafts, and the manuscript in TeachText, holding one piece of
// writing as it moves along the route.
//
// Everything in these shots is typed by this script as the writer would type
// it. No model is connected and no network call is made, so nothing here is
// generated text presented as a product claim. The site shows the surfaces
// the writer works in, with a writer's own messy material in them.
//
// Unlike the older capture scripts, this one starts its own server on a free
// port, so it never collides with a dev server you already have running:
//
//   node tooling/capture-site-route.mjs
//
// Output: site/img/route/<id>.webp + route.json

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, statSync, rmSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const outDir = path.join(root, "site", "img", "route");

// One real piece of writing, in the writer's own words, at four points on the
// route. The Question Sheet is deliberately messy: the product asks for the
// recipient, raw questions, personal observation and handoff friction before
// it will help with prose, and the site should show that honestly.
// Paragraphs are single lines: the editors soft-wrap them, and hard wraps
// captured at this width read as broken text.
const QUESTION_SHEET = [
  "Recipient: the editor on the coastal energy desk, who has read nothing about La Rance.",
  "",
  "What I actually want to say",
  "- The 1966 barrage is still running. That is the story, and nobody prints it.",
  "- Why does every \"world's first\" piece stop at the ribbon cutting?",
  "",
  "Raw questions",
  "- How much of the 240 GWh is ebb, how much is flood?",
  "- Who maintains the turbines now? Still the same operator?",
  "- What did the estuary pay for it? I keep reading \"silting\" with no number.",
  "",
  "Things I saw myself",
  "- On the barrage road in March the water stood at visibly different heights on the two sides. My photograph is soft but the gap is obvious.",
  "- The visitor centre still has a laminated hand-drawn tide chart from the 80s.",
  "",
  "Objection I expect",
  "- \"Tidal is a rounding error.\" Fine. This one has run for 58 years.",
  "",
  "Handoff friction",
  "- The editor wants 900 words. I have four sections and one number I cannot verify yet.",
].join("\n");

const OUTLINE = [
  "## The bill arrives by moonlight",
  "",
  "Open on the barrage road, not on the ribbon cutting. Keep the editor's 900 words in view.",
  "",
  "## Both directions count",
  "",
  "The ebb and the flood. This is where the 240 GWh figure has to be split, or flagged as unverified.",
  "",
  "## What the 1966 report knew",
  "",
  "The engineers considered it unremarkable. That is the point of the piece.",
  "",
  "## What the estuary paid",
  "",
  "Silting. Find the number or say plainly that there is not one.",
].join("\n");

// Written for the first outline section, which is the one the route selects.
const SECTION_DRAFT = [
  "The engineers at La Rance never called it renewable energy. They called it the tide, and they billed it by the moon. Open here, on the barrage road in March with the water standing at two different heights, and not on the 1966 ribbon cutting.",
  "",
  "I still cannot split the 240 GWh between ebb and flood. The report gives one combined figure and the operator's page repeats it. Until someone answers, this section says \"both directions\" and stops there.",
].join("\n");

const MANUSCRIPT = [
  "# The Tide Comes In Twice",
  "",
  "## The bill arrives by moonlight",
  "",
  "The engineers at La Rance never called it renewable energy. They called it the tide, and they billed it by the moon.",
  "",
  "## Both directions count",
  "",
  "Twice a day the estuary fills, and twice a day it empties. The turbines do not care which direction the water travels.",
  "",
  "## What the 1966 report knew",
  "",
  "The barrage generated power on both the ebb and the flood, a fact the engineers of the day considered unremarkable.",
].join("\n");

const STOPS = [
  {
    id: "question-sheet",
    window: "questionSheet",
    label: "Question Sheet",
    caption: "The writer's own raw questions, before any prose.",
    async setup(page) {
      await page.evaluate((text) => {
        openWindow("questionSheet");
        const field = document.getElementById("question-sheet-body");
        if (field) {
          field.value = text;
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, QUESTION_SHEET);
      await page.waitForTimeout(900);
    },
  },
  {
    id: "outline",
    window: "outline",
    label: "Outline",
    caption: "The same material as structure, still in the writer's words.",
    async setup(page) {
      await page.evaluate((text) => {
        openWindow("outline");
        const field = document.getElementById("outline-content");
        if (field) {
          field.value = text;
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, OUTLINE);
      await page.waitForTimeout(900);
    },
  },
  {
    id: "section-drafts",
    window: "sectionDrafts",
    label: "Section Drafts",
    caption: "One section at a time, with the unverified number left standing.",
    async setup(page) {
      // Use the product's own handoff so the section list, the selected
      // section and the word count are the state the route really produces.
      // Forcing text into an unselected draft would photograph a state no
      // writer can reach.
      await page.evaluate(async (outline) => {
        openWindow("outline");
        const field = document.getElementById("outline-content");
        if (field) {
          field.value = outline;
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
        await advanceOutlineToSectionDrafts();
      }, OUTLINE);
      await page.waitForTimeout(1400);
      // The handoff selects the first section; draft that one.
      await page.evaluate((text) => {
        const field = document.getElementById("draft-body");
        if (field) {
          field.value = text;
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, SECTION_DRAFT);
      await page.waitForTimeout(1000);
    },
  },
  {
    id: "teachtext",
    window: "teachText",
    label: "TeachText",
    caption: "The manuscript, on paper the writer owns.",
    async setup(page) {
      await page.evaluate((text) => {
        openWindow("teachText");
        const field = document.getElementById("teachtext-body");
        if (field) {
          field.value = text;
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, MANUSCRIPT);
      await page.waitForTimeout(900);
    },
  },
];

function httpReady(url) {
  return new Promise((resolve) => {
    const request = get(url, (response) => {
      response.resume();
      resolve(true);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(800, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function startAppServer() {
  const port = await new Promise((resolvePort) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const resolved = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolvePort(resolved));
    });
  });
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["apps/server/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (await httpReady(url)) return { child, url };
    if (child.exitCode !== null) break;
    await new Promise((wait) => setTimeout(wait, 150));
  }
  child.kill("SIGTERM");
  throw new Error(`App server did not become ready.\n${output.trim()}`);
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

let server;
let browser;
try {
  server = await startAppServer();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--force-color-profile=srgb"] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  await context.clock.setFixedTime(new Date("2026-08-15T10:07:00"));
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("pageerror:", error.message));

  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 30000 });
  await page.waitForTimeout(800);

  // The Start Here guide steps aside; the route is the subject.
  await page.evaluate(() => {
    const guide = document.querySelector('.window[data-window="guide"]');
    if (guide && !guide.classList.contains("is-hidden")) guide.querySelector(".close-box")?.click();
  });

  mkdirSync(outDir, { recursive: true });
  const captured = [];

  for (const stop of STOPS) {
    await page.evaluate((keep) => {
      document.querySelectorAll(".window").forEach((win) => {
        if (win.dataset.window !== keep) win.classList.add("is-hidden");
      });
    }, stop.window);

    try {
      await stop.setup(page);
    } catch (error) {
      console.warn(`skip ${stop.id}: setup failed:`, error.message);
      continue;
    }

    const box = await page.evaluate((name) => {
      const win = document.querySelector(`.window[data-window="${name}"]`);
      if (!win) return null;
      win.classList.remove("is-hidden");
      win.style.left = "120px";
      win.style.top = "70px";
      win.style.width = "760px";
      win.style.height = "560px";
      const rect = win.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, stop.window);

    if (!box || box.width < 200) {
      console.warn(`skip ${stop.id}: window never appeared`);
      continue;
    }
    await page.waitForTimeout(700);

    const png = path.join(outDir, `${stop.id}.png`);
    await page.screenshot({ path: png, clip: box });
    const webp = path.join(outDir, `${stop.id}.webp`);
    let file = `${stop.id}.png`;
    try {
      // The site shows these four in one row, so 760 px stays sharp there
      // without spending the payload budget on pixels nobody sees.
      execFileSync("cwebp", ["-quiet", "-q", "80", "-resize", "760", "0", png, "-o", webp]);
      rmSync(png);
      file = `${stop.id}.webp`;
    } catch (error) {
      console.warn("webp encode failed for", stop.id);
    }
    captured.push({ id: stop.id, label: stop.label, caption: stop.caption, file });
    console.log("captured", stop.id, `${Math.round(statSync(path.join(outDir, file)).size / 1024)}KB`);
  }

  const build = await page.evaluate(async () => {
    try {
      return (await (await fetch("/api/version")).json()).build || null;
    } catch (error) {
      return null;
    }
  });

  writeFileSync(path.join(outDir, "route.json"), `${JSON.stringify({
    capturedAt: new Date().toISOString(),
    build,
    note: "Typed by tooling/capture-site-route.mjs in the running app. No model, no network.",
    stops: captured,
  }, null, 2)}\n`);
  console.log(`wrote ${captured.length} route stop(s); build ${build}`);
} finally {
  if (browser) await browser.close();
  if (server) await stopProcess(server.child);
}
