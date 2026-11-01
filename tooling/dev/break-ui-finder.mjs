#!/usr/bin/env node
// Break-UI capture for Finder and the desktop: Demo (a shared disk) versus the
// worst-case backup, in two appearances and two viewports. Dev tool: it drives a
// server you started yourself (PORT=4211 node apps/server/server.js) and writes
// PNGs, nothing else.
//
//   node tooling/dev/worst-case-disks.mjs
//   PORT=4211 node apps/server/server.js &
//   node tooling/dev/break-ui-finder.mjs [--base http://127.0.0.1:4211] [--out DIR] [--data worst,demo]
//
// The desk is booted on localhost with ?data=<name>. Demo mounts the DTK shared
// disk through the same openSharedProjectDisk path, so both datasets arrive as a
// Project Hard Disk backup. Windows other than the one under test are closed.

import { mkdirSync } from "node:fs";
import { loadavg } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const base = arg("base", "http://127.0.0.1:4211");
const out = arg("out", join(root, "internal", "evidence", "drafts", "break-ui", "finder"));
const only = arg("only", "");
const datasets = arg("data", "demo,worst").split(",");
const themes = arg("themes", "classic,liquid-glass").split(",");
const viewports = arg("widths", "1280,390").split(",").map((w) => ({ w: Number(w), h: Number(w) < 768 ? 844 : 800 }));
mkdirSync(out, { recursive: true });

// A shared machine: do not start a browser while the one-minute load is above 40.
async function waitForQuiet(limit = 40) {
  while (loadavg()[0] > limit) await new Promise((resolve) => setTimeout(resolve, 10_000));
}

async function boot(browser, { dataset, theme, w, h }) {
  const mobile = w < 768;
  const context = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "reduce", hasTouch: mobile, isMobile: mobile,
  });
  await context.addInitScript((id) => { try { localStorage.setItem("ai-system-6-theme", id); } catch { /* about:blank */ } }, theme);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log("  pageerror", error.message.slice(0, 160)));
  // The fixtures never need the network; keep model probes and embedding fetches out of the picture.
  await context.route(/huggingface\.co|:1234\//, (route) => route.abort());
  await page.goto(`${base}/?data=${dataset === "demo" ? "demo" : dataset}`);
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 45000 });
  if (dataset === "demo") {
    await page.waitForFunction(() => window.DataSw === true, null, { timeout: 15000 });
    await page.evaluate(() => openSharedProjectDisk("dtk"));
  }
  await page.waitForFunction(() => typeof getActiveProject === "function" && /Restored|未来通车|iPhone|New/.test(getActiveProject()?.name || ""), null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  // The mount path opens the manuscript a beat late; close it twice, so it is gone before the shots.
  await closeAll(page);
  await page.waitForTimeout(2000);
  await closeAll(page);
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  return { context, page };
}

const closeAll = (page) => page.evaluate(() => {
  document.querySelectorAll(".window:not(.is-hidden)").forEach((win) => { try { closeWindow(win.dataset.window, true); } catch { /* keep going */ } });
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
});

async function shoot(page, file, clip) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, file), ...(clip ? { clip } : {}) });
  console.log("  ", file);
}

for (const dataset of datasets) for (const theme of themes) for (const vp of viewports) {
  if (only && !`${dataset}-${theme}-${vp.w}`.includes(only)) continue;
  const tag = `${dataset}-${theme}-${vp.w}`;
  console.log(tag);
  await waitForQuiet();
  const browser = await chromium.launch();
  try {
    const { page } = await boot(browser, { dataset, theme, ...vp });
    await closeAll(page);
    await shoot(page, `${tag}-desktop.png`);
    // The project disk's icon label, close up.
    const label = await page.evaluate(() => {
      const r = document.querySelector("#active-project-drop-target")?.getBoundingClientRect();
      return r ? { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 8), width: Math.min(r.width + 40, innerWidth), height: r.height + 24 } : null;
    });
    if (label) await shoot(page, `${tag}-disk-label.png`, label);

    // Every project on the desk, drawn as disks, and the menu-bar switcher.
    if (dataset !== "demo") {
      await page.evaluate(() => {
        const box = document.querySelector("#show-unmounted-disks");
        if (box) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
      });
      await shoot(page, `${tag}-desktop-disks.png`);
      await page.locator("#project-switcher-button").click({ timeout: 3000 }).catch(() => {});
      await shoot(page, `${tag}-switcher.png`);
      await page.keyboard.press("Escape");
      await page.evaluate(() => {
        const box = document.querySelector("#show-unmounted-disks");
        if (box) { box.checked = false; box.dispatchEvent(new Event("change", { bubbles: true })); }
      });
    }
    // Finder: root, then inside Documents, each as icons and as a list.
    await page.evaluate(() => openWindow("projects"));
    await page.waitForTimeout(800);
    await shoot(page, `${tag}-finder-icon.png`);
    await page.locator('.window[data-window="projects"] .view-btn[aria-label="List view"]').click().catch(() => {});
    await shoot(page, `${tag}-finder-list.png`);
    await page.locator('.window[data-window="projects"] .view-btn[aria-label="Icon view"]').click().catch(() => {});
    const docs = await page.evaluate(() => {
      const folder = getProjectFolders().find((f) => !f.parentId && /^Documents$/i.test(f.name)) || getProjectFolders().find((f) => !f.parentId);
      if (folder) openProjectFinderFolder(folder.id);
      return folder?.id || null;
    });
    if (docs) {
      await page.waitForTimeout(500);
      await shoot(page, `${tag}-finder-icon-documents.png`);
      await page.locator('.window[data-window="projects"] .view-btn[aria-label="List view"]').click().catch(() => {});
      await shoot(page, `${tag}-finder-list-documents.png`);
      // The rest of the rows: names that differ only at the end live below the fold.
      await page.evaluate(() => {
        const list = document.querySelector('.window[data-window="projects"] .finder-list');
        for (let el = list; el; el = el.parentElement) {
          if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) { el.scrollTop = el.scrollHeight; break; }
        }
      });
      await shoot(page, `${tag}-finder-list-documents-end.png`);
      // Get Info on the first file in the folder (the manuscript for worst).
      const picked = await page.evaluate(() => {
        const files = getProjectFiles().filter((f) => f.type === "text");
        const file = files.find((f) => f.label === "final") || files[0];
        if (!file) return false;
        selectedChatFileId = file.id;
        openFileInfo();
        return true;
      });
      if (picked) await shoot(page, `${tag}-info-file.png`);
      await page.evaluate(() => closeWindow("fileInfo", true));
    }
    // Get Info on the project disk itself.
    await page.evaluate(() => { try { openProjectInfo(); } catch (e) { console.log(e); } });
    await shoot(page, `${tag}-info-disk.png`);
    await closeAll(page);
    await page.evaluate(() => openWindow("trash"));
    await page.waitForTimeout(800);
    await shoot(page, `${tag}-trash.png`);
  } catch (error) {
    console.log("  FAILED", error.message.slice(0, 300));
  } finally {
    await browser.close();
  }
}
