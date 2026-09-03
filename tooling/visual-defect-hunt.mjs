#!/usr/bin/env node
// Visual defect hunt — a full sweep of the appearance matrix, for eyes.
//
// tooling/appearance-snapshot.mjs holds the 33 cells the product promises. It
// is a pixel differ: it tells you a cell CHANGED, never that a cell is WRONG.
// The defects the owner keeps finding by eye (a menu-bar icon that stays dark
// on a dark selection, a label that overlaps its own disabled state, a circle
// that is not round, a Finder list that overflows its window in all six eras)
// are all wrong-from-the-first-frame, so a baseline agrees with them forever.
//
// This tool sweeps the whole matrix instead of the promised part:
//   every appearance x every window in windowRegistry x three widths.
// It writes one PNG per cell AND one row of measured geometry per cell, so the
// eye can start from the cells the measurements already call suspicious.
//
// It reports. It fixes nothing and it owns no baseline.
//
// Usage:
//   node tooling/visual-defect-hunt.mjs                     # full sweep
//   node tooling/visual-defect-hunt.mjs --themes classic    # one appearance
//   node tooling/visual-defect-hunt.mjs --widths desktop
//   node tooling/visual-defect-hunt.mjs --windows finder,control
//   node tooling/visual-defect-hunt.mjs --states            # interactive states
//   node tooling/visual-defect-hunt.mjs --sheet <glob-ish>  # contact sheet

import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const OUT_DIR = join(root, "internal/evidence/drafts/visual-hunt");
const THEMES = ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"];
const WIDTHS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "tablet", width: 768, height: 1024 },
  { id: "phone", width: 375, height: 812 },
];
// Blur appearances rasterize backdrop-filter; two at once starve each other.
const BLUR_THEMES = new Set(["liquid-glass", "yosemite"]);

const FROZEN_EPOCH = Date.UTC(2026, 7, 21, 9, 0, 0);
const DETERMINISM = `
  (() => {
    const base = ${FROZEN_EPOCH};
    const origin = performance.now();
    const RealDate = Date;
    const now = () => base + Math.round(performance.now() - origin);
    class FrozenDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [now()])); }
      static now() { return now(); }
    }
    globalThis.Date = FrozenDate;
    Math.random = () => 0.4242424242424242;
  })();
`;

function parseArgs(argv) {
  const options = {
    mode: "sweep",
    themes: THEMES,
    widths: WIDTHS,
    windows: null,
    profile: "writing",
    sheet: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--states") options.mode = "states";
    else if (flag === "--sheet") { options.mode = "sheet"; options.sheet = argv[++index]; }
    else if (flag === "--themes") options.themes = argv[++index].split(",");
    else if (flag === "--widths") {
      const ids = argv[++index].split(",");
      options.widths = WIDTHS.filter((entry) => ids.includes(entry.id));
    } else if (flag === "--windows") options.windows = argv[++index].split(",");
    else if (flag === "--profile") options.profile = argv[++index];
  }
  return options;
}

async function newPage(browser, theme, width) {
  const context = await browser.newContext({
    viewport: { width: width.width, height: width.height },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    hasTouch: width.width < 768,
    isMobile: width.width < 768,
  });
  await context.route(/https?:\/\/(?:127\.0\.0\.1|localhost):(?:1234|11434)\//, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ models: [] }) });
  });
  await context.addInitScript(DETERMINISM);
  await context.addInitScript((themeId) => {
    localStorage.setItem("ai-system-6-theme", themeId);
    localStorage.removeItem("ai-system-6-liquid-glass");
    localStorage.setItem("clioOnboardingCompleted", "1");
  }, theme);
  const page = await context.newPage();
  return { context, page };
}

async function boot(page, url, theme, profile) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 30000 });
  if (profile === "writing") {
    await page.evaluate(async () => {
      if (typeof activateWorkspaceProfile === "function") {
        await activateWorkspaceProfile("writing", { persist: false, announce: false });
      }
    });
    await page.waitForTimeout(200);
  }
  await page.evaluate((themeId) => {
    window.AISystem6Theme?.applyTheme(themeId, {
      experimental: true, persist: false, announce: false, modernFontPreference: false,
    });
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    const noMotion = document.createElement("style");
    noMotion.id = "visual-hunt-no-motion";
    noMotion.textContent =
      "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }";
    document.head.append(noMotion);
  }, theme);
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForFunction(() => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
    return links.every((link) => { try { return Boolean(link.sheet); } catch { return true; } });
  }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
}

/**
 * Everything a cell can be judged on without looking at it.
 *
 * The eye is the instrument this tool serves, but the eye cannot hold 1,368
 * cells. These measurements name the cells worth opening first: a window that
 * renders as a title bar with nothing under it, content wider than its pane,
 * a child painted outside its own window, text below the contrast the eye
 * needs. A row here is a lead, not a verdict.
 */
const MEASURE = (id) => {
  const win = document.querySelector(`.window[data-window="${id}"]`);
  if (!win) return { missing: true };
  const box = win.getBoundingClientRect();
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const style = getComputedStyle(win);

  const overflow = [];
  const outside = [];
  const tiny = [];
  let nodes = 0;
  for (const node of win.querySelectorAll("*")) {
    nodes += 1;
    if (nodes > 4000) break;
    const nodeStyle = getComputedStyle(node);
    if (nodeStyle.display === "none" || nodeStyle.visibility === "hidden") continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    // Content wider than its own scroll box, with no way to scroll to it.
    const canScrollX = nodeStyle.overflowX === "auto" || nodeStyle.overflowX === "scroll";
    const canScrollY = nodeStyle.overflowY === "auto" || nodeStyle.overflowY === "scroll";
    if (!canScrollX && node.scrollWidth - node.clientWidth > 2 && nodeStyle.overflowX === "hidden") {
      overflow.push({ tag: node.tagName.toLowerCase(), cls: node.className?.toString?.().slice(0, 60) || "",
        over: node.scrollWidth - node.clientWidth, axis: "x" });
    }
    if (!canScrollY && node.scrollHeight - node.clientHeight > 2 && nodeStyle.overflowY === "hidden") {
      overflow.push({ tag: node.tagName.toLowerCase(), cls: node.className?.toString?.().slice(0, 60) || "",
        over: node.scrollHeight - node.clientHeight, axis: "y" });
    }
    // Painted outside the window that owns it.
    if (nodeStyle.position !== "fixed" && nodeStyle.position !== "absolute") {
      if (rect.right > box.right + 2 || rect.bottom > box.bottom + 2 || rect.left < box.left - 2) {
        outside.push({ tag: node.tagName.toLowerCase(), cls: node.className?.toString?.().slice(0, 60) || "",
          dx: Math.round(rect.right - box.right), dy: Math.round(rect.bottom - box.bottom) });
      }
    }
    // A control that has text but no room to draw it.
    if (node.matches("button, .btn, .mini-btn, a[role='button']")
      && rect.height > 0 && node.scrollWidth - node.clientWidth > 1) {
      tiny.push({ label: (node.textContent || "").trim().slice(0, 24), over: node.scrollWidth - node.clientWidth });
    }
  }

  // Contrast of every visible text run against its painted background.
  const luminance = (rgb) => {
    const channel = (value) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  };
  const parse = (value) => {
    const match = String(value).match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
  };
  const backdrop = (node) => {
    let current = node;
    let layers = [];
    while (current && current !== document.documentElement) {
      const parsed = parse(getComputedStyle(current).backgroundColor);
      if (parsed && parsed.a > 0) {
        layers.push(parsed);
        if (parsed.a >= 0.999) break;
      }
      current = current.parentElement;
    }
    if (!layers.length) return [255, 255, 255];
    let base = [255, 255, 255];
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const layer = layers[index];
      base = base.map((channel, position) => layer.rgb[position] * layer.a + channel * (1 - layer.a));
    }
    return base;
  };
  const lowContrast = [];
  const walker = document.createTreeWalker(win, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let text = walker.nextNode(); text && seen < 600; text = walker.nextNode()) {
    const value = (text.nodeValue || "").trim();
    if (!value) continue;
    const parent = text.parentElement;
    if (!parent) continue;
    const parentStyle = getComputedStyle(parent);
    if (parentStyle.display === "none" || parentStyle.visibility === "hidden" || Number(parentStyle.opacity) < 0.05) continue;
    const rect = parent.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    seen += 1;
    const fg = parse(parentStyle.color);
    if (!fg) continue;
    const bg = backdrop(parent);
    const blended = fg.rgb.map((channel, position) => channel * fg.a + bg[position] * (1 - fg.a));
    const l1 = luminance(blended);
    const l2 = luminance(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (ratio < 3) {
      lowContrast.push({
        text: value.slice(0, 30),
        ratio: Math.round(ratio * 100) / 100,
        cls: parent.className?.toString?.().slice(0, 50) || parent.tagName.toLowerCase(),
        size: parentStyle.fontSize,
        disabled: Boolean(parent.closest("[disabled], .is-disabled, :disabled")),
      });
    }
  }

  return {
    missing: false,
    box: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
    viewport,
    // The title-bar-with-nothing-under-it case, named explicitly.
    stub: box.height <= 32,
    offscreen: box.right > viewport.w + 1 || box.bottom > viewport.h + 1 || box.x < -1 || box.y < 0,
    clipped: box.right > viewport.w + 1 || box.bottom > viewport.h + 1,
    position: style.position,
    nodes,
    overflow: overflow.slice(0, 8),
    outside: outside.slice(0, 8),
    tinyControls: tiny.slice(0, 8),
    lowContrast: lowContrast.slice(0, 12),
  };
};

async function openWindowCell(page, id) {
  // Open through the app's own path; hide the siblings so the cell shows one
  // window. Clearing before opening matters: openWindow pairs route windows.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.evaluate(async (name) => {
      if (!document.querySelector(`.window[data-window="${name}"]`) && typeof loadLazyWindowModule === "function") {
        try { await loadLazyWindowModule(name); } catch { /* reported by the measurement */ }
      }
    }, id);
    await page.evaluate((name) => {
      for (const win of document.querySelectorAll(".window")) {
        if (win.dataset.window === name) continue;
        win.classList.add("is-hidden");
        win.classList.remove("is-active");
      }
    }, id);
    const portrait = await page.evaluate(() => {
      if (typeof isPortraitDocumentFlow !== "function" || !isPortraitDocumentFlow()) return false;
      if (typeof mobileHomeToDesktop === "function") mobileHomeToDesktop();
      return true;
    });
    if (portrait) await page.waitForTimeout(200 * (attempt + 1));
    await page.evaluate((name) => {
      try { if (typeof openWindow === "function") openWindow(name); } catch { /* measured below */ }
    }, id);
    await page.waitForFunction((name) => {
      const target = document.querySelector(`.window[data-window="${name}"]`);
      if (!target) return false;
      const rect = target.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    }, id, { timeout: 5000 }).catch(() => {});
    const state = await page.evaluate((name) => {
      const target = document.querySelector(`.window[data-window="${name}"]`);
      if (!target) return "absent";
      target.classList.remove("is-hidden");
      target.classList.add("is-active");
      const rect = target.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2 ? "ok" : "flat";
    }, id);
    if (state === "ok") return "ok";
    if (attempt === 2) return state;
  }
  return "absent";
}

async function shootWindow(page, id, file) {
  const frame = await page.evaluate((name) => {
    const element = document.querySelector(`.window[data-window="${name}"]`);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return {
      x: Math.max(0, box.x), y: Math.max(0, box.y),
      width: Math.min(box.width, window.innerWidth - Math.max(0, box.x)),
      height: Math.min(box.height, window.innerHeight - Math.max(0, box.y)),
    };
  }, id);
  if (!frame || frame.width < 2 || frame.height < 2) return false;
  try {
    await page.screenshot({
      path: file, animations: "disabled", timeout: 20000,
      clip: { x: Math.round(frame.x), y: Math.round(frame.y), width: Math.round(frame.width), height: Math.round(frame.height) },
    });
    return true;
  } catch { return false; }
}

async function sweep(options) {
  const server = await startAppServer(root);
  const browser = await chromium.launch();
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = [];
  try {
    const names = options.windows || await (async () => {
      const { context, page } = await newPage(browser, "classic", WIDTHS[0]);
      await boot(page, server.url, "classic", options.profile);
      const list = await page.evaluate(() => Object.keys(windowRegistry));
      await context.close();
      return list;
    })();
    writeFileSync(join(OUT_DIR, "windows.json"), JSON.stringify(names, null, 2));
    for (const theme of options.themes) {
      for (const width of options.widths) {
        const { context, page } = await newPage(browser, theme, width);
        await boot(page, server.url, theme, options.profile);
        for (const id of names) {
          const cell = `${theme}-${width.id}-${id}`;
          const state = await openWindowCell(page, id);
          let metrics = { missing: true };
          if (state === "ok") {
            await page.waitForTimeout(120);
            metrics = await page.evaluate(MEASURE, id);
            await shootWindow(page, id, join(OUT_DIR, `${cell}.png`));
          }
          rows.push({ cell, theme, width: width.id, window: id, state, ...metrics });
          process.stdout.write(`${cell} ${state}\n`);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await stopProcess(server.child);
  }
  writeFileSync(join(OUT_DIR, "metrics.json"), JSON.stringify(rows, null, 2));
  const suspects = rows.filter((row) => row.state !== "ok" || row.stub || row.clipped
    || row.overflow?.length || row.outside?.length || row.tinyControls?.length || row.lowContrast?.length);
  console.log(`\n${rows.length} cells, ${suspects.length} with a lead.`);
}

/**
 * Contact sheet — many cells on one page, so the eye can sweep a row of six
 * appearances at once. Composed in the browser because this repo carries no
 * image library, and Chromium already decodes PNG.
 */
async function contactSheet(pattern) {
  const wanted = pattern.split(",");
  const source = process.env.SHEET_DIR ? join(OUT_DIR, process.env.SHEET_DIR) : OUT_DIR;
  const zoom = Number(process.env.SHEET_ZOOM || 1);
  const files = readdirSync(source).filter((name) => name.endsWith(".png")
    && !name.startsWith("sheet-")
    && wanted.some((part) => name.includes(part)));
  if (!files.length) { console.log("no cells match"); return; }
  files.sort();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const items = files.map((name) => ({
    name,
    data: readFileSync(join(source, name)).toString("base64"),
  }));
  await page.setContent(`<body style="margin:0;background:#555;font:11px monospace;color:#fff">
    <div id="grid" style="display:flex;flex-wrap:wrap;gap:6px;padding:6px"></div></body>`);
  await page.evaluate(({ entries, scale }) => {
    const grid = document.getElementById("grid");
    for (const entry of entries) {
      const cell = document.createElement("figure");
      cell.style.cssText = "margin:0;background:#222;padding:3px";
      const image = document.createElement("img");
      image.src = `data:image/png;base64,${entry.data}`;
      image.style.cssText = scale > 1
        ? `display:block;zoom:${scale};image-rendering:pixelated;background:#888`
        : "display:block;max-width:460px;max-height:520px;background:#888";
      const caption = document.createElement("figcaption");
      caption.textContent = entry.name.replace(/\.png$/, "");
      caption.style.cssText = "padding:2px 0;font:10px monospace";
      cell.append(image, caption);
      grid.append(cell);
    }
  }, { entries: items, scale: zoom });
  await page.waitForTimeout(400);
  const out = join(OUT_DIR, `sheet-${(process.env.SHEET_NAME || pattern.split(",")[0]).replace(/[^a-z0-9]+/gi, "-")}.png`);
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log(out);
}

/**
 * Interactive states. The resting frame is where a sweep stops and where this
 * product's defects start: an icon that stays dark on a dark selection reads
 * correctly in every resting screenshot ever taken of it.
 */
async function states(options) {
  const server = await startAppServer(root);
  const browser = await chromium.launch();
  const dir = join(OUT_DIR, "states");
  mkdirSync(dir, { recursive: true });
  const report = [];
  try {
    for (const theme of options.themes) {
      const width = options.widths[0];
      const { context, page } = await newPage(browser, theme, width);
      await boot(page, server.url, theme, options.profile);
      const shot = (name, clip) => page.screenshot({ path: join(dir, `${theme}-${name}.png`), clip, animations: "disabled" });

      // 1. The menu bar at rest, then a menu pulled down, then an item tracked.
      // The pulled-down title reverses; every glyph inside it has to reverse
      // with it, which is where this product has failed most often.
      await shot("menubar-rest", { x: 0, y: 0, width: width.width, height: 26 });
      await page.click(".menu.menu-bar-current-app > button").catch(() => {});
      await page.waitForTimeout(250);
      await shot("menu-app-open", { x: 0, y: 0, width: Math.min(760, width.width), height: 420 });
      await page.keyboard.press("Escape").catch(() => {});
      await page.click(".menu > button.apple").catch(() => {});
      await page.waitForTimeout(250);
      await shot("menu-apple-open", { x: 0, y: 0, width: Math.min(420, width.width), height: Math.min(820, width.height) });
      const item = await page.$(".apple-menu-popover button:not([disabled])");
      if (item) {
        await item.hover().catch(() => {});
        await page.waitForTimeout(150);
        await shot("menu-apple-hover", { x: 0, y: 0, width: Math.min(420, width.width), height: Math.min(820, width.height) });
      }
      await page.keyboard.press("Escape").catch(() => {});
      await page.mouse.click(width.width / 2, width.height - 40).catch(() => {});
      await page.waitForTimeout(200);

      // 2. The right cluster: the model and project switchers, which are icon
      // buttons that open a menu — an inverted title with art inside it.
      const cluster = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll(".menu-bar .menu")].slice(-3);
        if (!nodes.length) return null;
        const boxes = nodes.map((node) => node.getBoundingClientRect()).filter((box) => box.width > 2);
        if (!boxes.length) return null;
        const left = Math.min(...boxes.map((box) => box.x));
        const right = Math.max(...boxes.map((box) => box.right));
        return { x: Math.max(0, left - 10), width: Math.min(window.innerWidth - Math.max(0, left - 10), right - left + 20) };
      });
      if (cluster) await shot("menubar-right", { x: cluster.x, y: 0, width: cluster.width, height: 26 });
      const switcher = await page.$("#project-switcher-button");
      if (switcher) {
        await switcher.click().catch(() => {});
        await page.waitForTimeout(220);
        if (cluster) await shot("menubar-right-open", { x: cluster.x, y: 0, width: cluster.width, height: 26 });
        report.push({ theme, ...(await page.evaluate(() => {
          const button = document.querySelector("#project-switcher-button");
          const menu = button?.closest(".menu");
          const icon = button?.querySelector(".sys-icon svg, .sys-icon img, svg");
          const label = button?.querySelector("#project-switcher-label");
          const style = button ? getComputedStyle(button) : null;
          return {
            probe: "menu-bar-switcher",
            open: Boolean(menu?.classList.contains("is-open")),
            buttonBackground: style?.backgroundColor,
            labelColor: label ? getComputedStyle(label).color : null,
            iconFilter: icon ? getComputedStyle(icon).filter : null,
            iconClass: icon?.getAttribute("class") || null,
          };
        })) });
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(150);
      }

      // 3. Theme Lab — the shipping control specimens: Normal / Default /
      // Pressed / Focused / Disabled in one row, tabs, fields, a menu, a
      // dialog. One window covers most of the control state matrix.
      if (await openWindowCell(page, "themeLab") === "ok") {
        await page.waitForTimeout(500);
        await shootWindow(page, "themeLab", join(dir, `${theme}-themelab-chrome.png`));
        for (const tab of ["objects", "surfaces"]) {
          const handle = await page.$(`[data-theme-lab-tab="${tab}"]`);
          if (!handle) continue;
          await handle.click().catch(() => {});
          await page.waitForTimeout(350);
          await shootWindow(page, "themeLab", join(dir, `${theme}-themelab-${tab}.png`));
        }
      }

      // 4. Finder: one icon selected, and one list row selected. The label
      // reverses; the artwork above it has to reverse too.
      if (await openWindowCell(page, "finder") === "ok") {
        await page.waitForTimeout(300);
        await shootWindow(page, "finder", join(dir, `${theme}-finder-rest.png`));
        const marks = await page.evaluate(() => {
          const win = document.querySelector('.window[data-window="finder"]');
          const item = win?.querySelector(".finder-item");
          if (!item) return null;
          item.classList.add("is-selected");
          const icon = item.querySelector("svg, img");
          const label = item.querySelector("span:last-of-type");
          return {
            probe: "finder-icon-selection",
            labelColor: label ? getComputedStyle(label).color : null,
            labelBackground: label ? getComputedStyle(label).backgroundColor : null,
            iconFilter: icon ? getComputedStyle(icon).filter : null,
            iconTag: icon?.tagName || null,
            hasClassicMask: Boolean(item.querySelector(".has-classic-mask")),
          };
        });
        if (marks) report.push({ theme, ...marks });
        await page.waitForTimeout(200);
        await shootWindow(page, "finder", join(dir, `${theme}-finder-selected.png`));
        // List view, where the row itself is the highlight.
        const listButton = await page.$('.window[data-window="finder"] .view-btn:last-of-type, .window[data-window="finder"] [data-view="list"]');
        if (listButton) {
          await listButton.click().catch(() => {});
          await page.waitForTimeout(350);
          await page.evaluate(() => {
            document.querySelector('.window[data-window="finder"] .finder-list-row')?.classList.add("is-selected");
          });
          await page.waitForTimeout(150);
          await shootWindow(page, "finder", join(dir, `${theme}-finder-list-selected.png`));
        }
      }

      // 5. Control Panel: the chooser rail (a selected icon tab), a focused
      // button, and a hovered tab.
      if (await openWindowCell(page, "control") === "ok") {
        await page.waitForTimeout(350);
        await shootWindow(page, "control", join(dir, `${theme}-control-rest.png`));
        const tabs = await page.$$('.window[data-window="control"] [role="tab"]');
        if (tabs.length > 1) {
          await tabs[1].hover().catch(() => {});
          await page.waitForTimeout(180);
          await shootWindow(page, "control", join(dir, `${theme}-control-tab-hover.png`));
        }
        const button = await page.$('.window[data-window="control"] .window-pane button:not([disabled])');
        if (button) {
          await button.focus().catch(() => {});
          await page.waitForTimeout(150);
          await shootWindow(page, "control", join(dir, `${theme}-control-button-focus.png`));
        }
        await page.mouse.move(2, 400);
      }

      // 6. The Control Strip, a separate bar with its own state model.
      if (await openWindowCell(page, "controlStripModules") === "ok") {
        await page.waitForTimeout(300);
        await shootWindow(page, "controlStripModules", join(dir, `${theme}-controlstrip.png`));
      }

      await context.close();
    }
  } finally {
    await browser.close();
    await stopProcess(server.child);
  }
  writeFileSync(join(dir, "state-report.json"), JSON.stringify(report, null, 2));
  console.log(`states written to ${dir}`);
}

const options = parseArgs(process.argv.slice(2));
if (options.mode === "sheet") await contactSheet(options.sheet);
else if (options.mode === "states") await states(options);
else await sweep(options);
