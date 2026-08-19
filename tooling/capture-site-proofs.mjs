#!/usr/bin/env node

// Capture the proof shots: the real app doing the things a 1988 desktop
// should not be able to do. Each shot is one window of the running product,
// with real content, and no model or network involved. The site shows these
// instead of asking the visitor to take the claim on faith.
//
//   npm start                       (app on :4173)
//   node tooling/capture-site-proofs.mjs
//
// Output: site/img/proofs/<id>.webp + proofs.json

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, statSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "site", "img", "proofs");
const appUrl = process.env.APP_URL || "http://localhost:4173/";
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg >= 0 ? String(process.argv[onlyArg + 1] || "").split(",").filter(Boolean) : null;

const CHART_MARKDOWN = `| year | GWh |
| --- | --- |
| 1967 | 240 |
| 1980 | 490 |
| 1995 | 512 |
| 2010 | 486 |
| 2024 | 503 |`;

const SLIDE_MARKDOWN = `---
marp: true
title: The Tide Comes In Twice
---

# The Tide Comes In Twice

---

## Billed by the moon

The engineers at La Rance never called it renewable energy.

---

## 240 GWh, twice a day`;

// A paragraph written to sound like a machine wrote it. It is the input to the
// Review Desk proof, and it is deliberately the worst kind of prose this
// product exists to catch: even cadence, borrowed authority, no one in it.
const SLOP_DRAFT = `# The Tide Comes In Twice

In today's rapidly evolving energy landscape, tidal power represents a compelling
opportunity for stakeholders seeking sustainable solutions. It is important to note
that the La Rance facility has consistently demonstrated significant potential.
Moreover, by leveraging existing infrastructure, operators can unlock considerable
value while navigating an increasingly complex regulatory environment. Ultimately,
the future of tidal energy remains bright.`;

// Each proof names the window to shoot and the setup that fills it with real
// content. The first group runs offline: no model, no network. The second
// group needs a local model, because the work it shows is the model working.
const PROOFS = [
  {
    id: "slides",
    maxWidth: 1000,
    window: "clioStage",
    label: "Build Slides",
    caption: "A Marp deck, opened and presented on the desktop.",
    async setup(page) {
      await page.evaluate(async (md) => {
        if (typeof ensureClioStageModule === "function") await ensureClioStageModule();
        await window.AISystem6ClioStage?.load?.({ title: "slides.md", markdown: md });
        openWindow("clioStage");
      }, SLIDE_MARKDOWN);
      await page.waitForTimeout(2200);
    },
  },
  {
    id: "charts",
    maxWidth: 1000,
    window: "clioChart",
    label: "Make Charts",
    caption: "A Markdown table in the manuscript, projected as a chart.",
    async setup(page) {
      // The product's own handoff: a table in TeachText, then ClioChart's
      // openFromTeachText, which reads the table under the caret.
      await page.evaluate(async (md) => {
        openWindow("teachText");
        if (typeof teachTextBodyInput !== "undefined" && teachTextBodyInput) {
          teachTextBodyInput.value = md;
          teachTextBodyInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (typeof ensureClioChartModule === "function") await ensureClioChartModule();
        await window.AISystem6ClioChart?.openFromTeachText?.();
      }, CHART_MARKDOWN);
      await page.waitForTimeout(2400);
      // Filling TeachText from a script leaves the document dirty, so the
      // handoff raises a save sheet. Decline it: the proof is the chart.
      await page.evaluate(() => {
        const decline = [...document.querySelectorAll("button")].find((b) =>
          /Don't Save|不存储|不保存/i.test(b.textContent || ""));
        decline?.click();
        document.querySelectorAll(".window").forEach((w) => {
          if (w.dataset.window !== "clioChart") w.classList.add("is-hidden");
        });
      });
      await page.waitForTimeout(700);
    },
  },
  {
    id: "cmf",
    maxWidth: 1000,
    window: "cmfStudio",
    label: "Design in 3D",
    caption: "A 3D colorway on a 1988 desktop, exportable as USDZ for AR.",
    async setup(page) {
      await page.evaluate(() => openWindow("cmfStudio"));
      await page.waitForTimeout(4500);
    },
  },
  {
    id: "micropolis",
    // The site shows this in a three-up grid (~340 CSS px) and the README
    // in a third of a table row; 1000 px stays 2x sharp there without
    // spending the official site's payload budget on invisible pixels.
    maxWidth: 1000,
    window: "micropolis",
    label: "Build",
    caption: "Micropolis: a fresh map, simulating.",
    async setup(page) {
      await page.evaluate(async () => {
        if (typeof openMicropolisApp === "function") await openMicropolisApp();
        else openWindow("micropolis");
      });
      // Terrain generation plus the first simulation ticks.
      await page.waitForTimeout(7000);
    },
  },
  {
    id: "openttd",
    maxWidth: 1000,
    window: "openttd",
    label: "Connect",
    caption: "OpenTTD: the wasm build at its Chinese title screen.",
    async setup(page) {
      // The Chinese build is the point: flip the desk language before the
      // iframe attaches so the game boots its zh UI, then flip back after
      // the shot (the teardown below runs before the next proof).
      await page.evaluate(async () => {
        if (typeof currentLanguage !== "undefined" && currentLanguage === "en") await switchLanguage();
        openWindow("openttd");
      });
      await page.waitForFunction(() => {
        const s = document.querySelector("[data-openttd-status]");
        return /运行|Running/i.test(s?.textContent || "");
      }, null, { timeout: 120000 });
      await page.waitForTimeout(4000);
      // Into a real game, deterministically: the engine console takes a map
      // seed, so the same 1950 countryside comes back on every re-shoot. The
      // arrow keys then walk the viewport off the open sea onto the farms.
      const frame = await page.evaluate(() => {
        const f = document.querySelector('.window[data-window="openttd"] iframe');
        const r = f.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height * 0.95 };
      });
      await page.mouse.click(frame.x, frame.y);
      await page.waitForTimeout(400);
      await page.keyboard.press("Backquote");
      await page.waitForTimeout(600);
      await page.keyboard.type("newgame 1988", { delay: 60 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(12000);
      // Escape closes the console even while its text input holds focus;
      // the console hotkey itself gets swallowed as typed text there.
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
      for (let i = 0; i < 52; i++) {
        await page.keyboard.press(i % 2 ? "ArrowUp" : "ArrowLeft");
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(1500);
    },
    async teardown(page) {
      await page.evaluate(async () => {
        if (typeof currentLanguage !== "undefined" && currentLanguage === "zh") await switchLanguage();
      });
    },
  },
  {
    id: "doom",
    maxWidth: 1000,
    window: "doom",
    label: "Survive",
    caption: "DOOM: engine compiled and idling, waiting for your own WAD.",
    async setup(page) {
      await page.evaluate(() => openWindow("doom"));
      await page.waitForFunction(() => {
        const s = document.querySelector("[data-doom-status]");
        return /WAD/i.test(s?.textContent || "");
      }, null, { timeout: 90000 });
      await page.waitForTimeout(800);
    },
  },
  {
    id: "glass",
    maxWidth: 1000,
    window: "liquidCover",
    label: "Render Glass",
    caption: "Refractive WebGL typography, rendered in the browser.",
    async setup(page) {
      await page.evaluate(async () => {
        if (typeof openLiquidCover === "function") await openLiquidCover();
        else openWindow("liquidCover");
      });
      await page.waitForTimeout(4500);
    },
  },
  {
    id: "image-prompt",
    maxWidth: 1000,
    window: "imagePromptStudio",
    label: "Write Image Prompts",
    caption: "Image Prompt Studio turns an idea into two ready-to-paste prompts.",
    async setup(page) {
      await page.evaluate(async () => {
        await openWindow("imagePromptStudio");
        const idea = document.getElementById("ips-idea");
        if (idea) {
          idea.value = "a calm, cinematic tech-blue cover with generous negative space";
          idea.dispatchEvent(new Event("input", { bubbles: true }));
        }
        const title = document.getElementById("ips-title");
        if (title) {
          title.value = "The Shape of Quiet";
          title.dispatchEvent(new Event("input", { bubbles: true }));
        }
        const gptOut = document.getElementById("ips-gpt-out");
        if (gptOut) {
          gptOut.value = "A calm, cinematic cover in deep tech blue with generous negative space. The scene is a wide, quiet composition built for a title: soft blue gradients fall away to near-black at the edges, leaving the center open and low-contrast. A single, even key light catches faint atmospheric haze. The title \"The Shape of Quiet\" sits small and centered in clean sans-serif type. Editorial minimalism, polished and high-fidelity, 16:9.";
        }
        const universalOut = document.getElementById("ips-universal-out");
        if (universalOut) {
          universalOut.value = "Subject: a calm cinematic tech-blue cover with generous negative space\nStyle: polished, high-fidelity, editorial minimalism\nLighting: soft, even key light with faint atmospheric haze\nComposition: wide 16:9, low-contrast open center, richer detail toward the edges\nNegative: clutter, high contrast in the center, rendered title text\nAspect ratio: 16:9";
        }
        const status = document.getElementById("ips-status");
        if (status) status.textContent = "Prompt ready — copy it.";
      });
      await page.waitForTimeout(900);
    },
  },
  {
    id: "calculator",
    natural: true,
    window: "calculator",
    label: "Calculator",
    caption: "Adds up, in a beveled window.",
    async setup(page) {
      await page.evaluate(() => {
        openWindow("calculator");
        pressCalculatorKey("clear");
        ["1", "9", "8", "8", "+", "3", "8"].forEach((key) => pressCalculatorKey(key));
        pressCalculatorKey("=");
      });
      await page.waitForTimeout(500);
    },
  },
  {
    id: "puzzle",
    natural: true,
    window: "puzzle",
    label: "Puzzle",
    caption: "The sliding-tile puzzle, mid-move.",
    async setup(page) {
      await page.evaluate(() => openWindow("puzzle"));
      await page.waitForTimeout(800);
    },
  },
  {
    id: "writing-bell",
    natural: true,
    window: "writingBell",
    label: "Writing Bell",
    caption: "A Pomodoro timer that rings like 1988.",
    async setup(page) {
      await page.evaluate(() => openWindow("writingBell"));
      await page.waitForTimeout(500);
    },
  },
  {
    id: "alarm-clock",
    natural: true,
    window: "alarmClock",
    label: "Alarm Clock",
    caption: "Winds up, goes off, looks the part.",
    async setup(page) {
      await page.evaluate(() => openWindow("alarmClock"));
      await page.waitForTimeout(500);
    },
  },
  {
    id: "dictation",
    natural: true,
    window: "dictation",
    label: "Dictation Pad",
    caption: "Speak into the field you are already in.",
    async setup(page) {
      await page.evaluate(() => {
        openWindow("dictation");
        const raw = document.getElementById("dictation-raw");
        if (raw) {
          raw.value = "we need the 240 gigawatt figure split by source, and the real objection is cost, not engineering";
          raw.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      await page.waitForTimeout(600);
    },
  },
  {
    id: "memory-cards",
    natural: true,
    window: "memoryCards",
    label: "Memory Cards",
    caption: "Flip two, find the pair.",
    async setup(page) {
      await page.evaluate(() => openWindow("memoryCards"));
      await page.waitForTimeout(800);
    },
  },
];


const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
await context.clock.setFixedTime(new Date("2026-08-13T10:07:00"));
const page = await context.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

await page.goto(appUrl, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => {
  const boot = document.getElementById("boot-screen");
  return !boot || boot.hidden || getComputedStyle(boot).display === "none";
}, null, { timeout: 30000 });
await page.waitForTimeout(700);
await page.evaluate(() => {
  const guide = document.querySelector('.window[data-window="guide"]');
  if (guide && !guide.classList.contains("is-hidden")) guide.querySelector(".close-box")?.click();
});

mkdirSync(outDir, { recursive: true });
const captured = [];

for (const proof of PROOFS) {
  if (only && !only.includes(proof.id)) continue;
  // One window at a time, centred and alone, so the shot is about the work.
  await page.evaluate((keep) => {
    document.querySelectorAll(".window").forEach((win) => {
      if (win.dataset.window !== keep) win.classList.add("is-hidden");
    });
  }, proof.window);

  try {
    await proof.setup(page);
  } catch (error) {
    console.warn(`skip ${proof.id}: setup failed:`, error.message);
    continue;
  }

  const box = await page.evaluate(({ name, natural }) => {
    const win = document.querySelector(`.window[data-window="${name}"]`);
    if (!win) return null;
    win.classList.remove("is-hidden");
    win.style.right = "auto";
    win.style.left = "120px";
    win.style.top = "80px";
    if (!natural) {
      win.style.width = "900px";
      win.style.height = "620px";
    }
    const r = win.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, { name: proof.window, natural: !!proof.natural });

  if (!box || box.width < 24 || box.height < 24) {
    console.warn(`skip ${proof.id}: window never appeared`);
    continue;
  }
  await page.waitForTimeout(1200);

  const png = path.join(outDir, `${proof.id}.png`);
  await page.screenshot({ path: png, clip: box });
  const webp = path.join(outDir, `${proof.id}.webp`);
  let file = `${proof.id}.png`;
  try {
    const encodeArgs = ["-quiet", "-q", proof.maxWidth ? "82" : "86"];
    if (proof.maxWidth) encodeArgs.push("-resize", String(proof.maxWidth), "0");
    execFileSync("cwebp", [...encodeArgs, png, "-o", webp]);
    rmSync(png);
    file = `${proof.id}.webp`;
  } catch (e) {
    console.warn("webp encode failed for", proof.id);
  }
  if (proof.teardown) await proof.teardown(page);
  captured.push({ id: proof.id, label: proof.label, caption: proof.caption, file });
  console.log("captured", proof.id, Math.round(statSync(path.join(outDir, file)).size / 1024) + "KB");
}

const build = await page.evaluate(async () => {
  try { return (await (await fetch("/api/version")).json()).build || null; } catch (e) { return null; }
});

// A --only re-shoot updates just those proofs and keeps the rest of the
// manifest; a full shoot replaces everything in PROOFS order.
let priorProofs = [];
try {
  const prior = JSON.parse(readFileSync(path.join(outDir, "proofs.json"), "utf8"));
  if (Array.isArray(prior.proofs)) priorProofs = prior.proofs;
} catch {}
const priorById = new Map(priorProofs.map((proof) => [proof.id, proof]));
const merged = PROOFS.map((proof) => {
  const fresh = captured.find((item) => item.id === proof.id);
  if (fresh) return fresh;
  if (only) return priorById.get(proof.id) || null;
  return null;
}).filter(Boolean);

writeFileSync(path.join(outDir, "proofs.json"), JSON.stringify({
  capturedAt: new Date().toISOString(),
  build,
  proofs: merged,
}, null, 2));
console.log(`wrote ${merged.length} proof(s); build ${build}`);

await browser.close();
