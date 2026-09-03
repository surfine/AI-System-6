#!/usr/bin/env node
// Visual hunt prober — one question, six appearances, measured in the live app.
//
// The sweep (tooling/visual-defect-hunt.mjs) photographs 1,368 cells and lists
// the ones worth opening. This runs the follow-up: it opens one surface, puts
// it in the state the defect needs, and reports numbers the eye can be held to
// — an icon's drawn size, a title bar's active fill, a window's pane height,
// a control's box against its row.
//
// It reports. It fixes nothing and it owns no baseline.
//
// Usage:
//   node tooling/visual-hunt-probe.mjs --list
//   node tooling/visual-hunt-probe.mjs --probe folder-pane
//   node tooling/visual-hunt-probe.mjs --probe finder-icon --themes platinum,classic
//   node tooling/visual-hunt-probe.mjs --probe folder-pane --shot folder --width 1440

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const OUT_DIR = join(root, "internal/evidence/drafts/visual-hunt/probe");
const THEMES = ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"];

/**
 * Each probe is { window, act, read }, all optional but `read`.
 * `window` names a window to open alone; `act` runs before the measurement;
 * `read` returns the row this probe contributes. Everything runs in the page.
 */
const PROBES = {
  // A folder window that opens with no room for the objects it counts.
  "folder-pane": {
    window: "controlStripModules",
    read: () => {
      const win = document.querySelector('.window[data-window="controlStripModules"]');
      if (!win) return { missing: true };
      const pane = win.querySelector(".window-pane, .finder-body, [class*='finder']");
      const grid = win.querySelector(".finder-grid, .finder-items, .finder-list");
      const items = win.querySelectorAll(".finder-item, .finder-list-row");
      const count = win.querySelector(".details-bar, .finder-status");
      const box = win.getBoundingClientRect();
      return {
        windowH: Math.round(box.height),
        paneClass: pane?.className?.toString().slice(0, 50) || null,
        paneH: pane ? Math.round(pane.getBoundingClientRect().height) : null,
        gridClass: grid?.className?.toString().slice(0, 50) || null,
        gridH: grid ? Math.round(grid.scrollHeight) : null,
        gridVisibleH: grid ? Math.round(grid.getBoundingClientRect().height) : null,
        items: items.length,
        itemsVisible: [...items].filter((node) => {
          const rect = node.getBoundingClientRect();
          const owner = grid?.getBoundingClientRect();
          return owner ? rect.top >= owner.top - 1 && rect.bottom <= owner.bottom + 1 : false;
        }).length,
        says: (count?.textContent || "").trim().slice(0, 40),
      };
    },
  },

  // Every Finder content window: does its first open show the objects it
  // counts, or a title bar with a sliver under it?
  "finder-fit": {
    read: async () => {
      const rows = [];
      // windowRegistry is a bundle-scope const, so it is a bare identifier here.
      for (const id of Object.keys(windowRegistry)) {
        try {
          if (!document.querySelector(`.window[data-window="${id}"]`) && typeof loadLazyWindowModule === "function") {
            await loadLazyWindowModule(id);
          }
          if (typeof openWindow === "function") openWindow(id);
        } catch { continue; }
        await new Promise((resolve) => setTimeout(resolve, 260));
        const win = document.querySelector(`.window[data-window="${id}"]`);
        const scroller = win?.querySelector(".window-frame-scroller");
        if (!win || !scroller || !win.classList.contains("is-finder-content-fit")) continue;
        const short = scroller.scrollHeight - scroller.clientHeight;
        if (short <= 8) continue;
        rows.push({
          window: id,
          windowH: Math.round(win.getBoundingClientRect().height),
          paneVisible: scroller.clientHeight,
          paneContent: scroller.scrollHeight,
          hidden: short,
          pending: win.dataset.finderFitPending || "-",
          items: scroller.querySelectorAll(".finder-item, .finder-list-row").length,
        });
      }
      return { rows };
    },
  },

  // Finder object artwork: drawn size and ink, against the slot it is given.
  "finder-icon": {
    window: "finder",
    read: () => {
      const win = document.querySelector('.window[data-window="finder"]');
      const item = win?.querySelector(".finder-item");
      const icon = item?.querySelector(".sys-icon");
      const art = icon?.querySelector("svg, img");
      if (!icon) return { missing: true };
      const iconBox = icon.getBoundingClientRect();
      const artBox = art?.getBoundingClientRect();
      const style = getComputedStyle(icon);
      const artStyle = art ? getComputedStyle(art) : null;
      const inked = art ? [...art.querySelectorAll("*")].slice(0, 400).map((node) => {
        const nodeStyle = getComputedStyle(node);
        return `${node.tagName}:${nodeStyle.fill}/${nodeStyle.stroke}`;
      }) : [];
      return {
        slot: `${Math.round(iconBox.width)}x${Math.round(iconBox.height)}`,
        art: artBox ? `${Math.round(artBox.width)}x${Math.round(artBox.height)}` : null,
        iconBackground: style.backgroundColor,
        iconBackgroundImage: style.backgroundImage.slice(0, 60),
        artColor: artStyle?.color,
        artOpacity: artStyle?.opacity,
        inkSample: [...new Set(inked)].slice(0, 6),
        // Every object in the grid: the art against the slot it was given.
        census: [...win.querySelectorAll(".finder-item")].map((node) => {
          const slotNode = node.querySelector(".sys-icon");
          const artNode = slotNode?.querySelector("svg, img");
          const slotRect = slotNode?.getBoundingClientRect();
          const artRect = artNode?.getBoundingClientRect();
          return {
            name: (node.textContent || "").trim().slice(0, 18),
            slot: slotRect ? Math.round(slotRect.width) : null,
            art: artRect ? Math.round(artRect.width) : null,
            source: artNode?.getAttribute?.("data-platinum-source-size") || null,
            fill: slotRect && artRect ? Math.round((artRect.width / slotRect.width) * 100) : null,
          };
        }),
      };
    },
  },

  // Active versus inactive window chrome: does the front window look front?
  "titlebar-active": {
    window: "finder",
    read: () => {
      const win = document.querySelector('.window[data-window="finder"]');
      const bar = win?.querySelector(".title-bar");
      if (!bar) return { missing: true };
      const sample = (node) => {
        const style = getComputedStyle(node);
        const before = getComputedStyle(node, "::before");
        return {
          background: style.backgroundColor,
          backgroundImage: style.backgroundImage.slice(0, 90),
          color: style.color,
          beforeBackground: before.backgroundImage.slice(0, 90),
          beforeContent: before.content.slice(0, 20),
        };
      };
      // The active signal may sit on the bar, on its lamps, or on the frame.
      // Sample all three before calling a window indistinguishable.
      const lamps = () => [...bar.querySelectorAll("button, .close-box, .zoom-box, .window-lamp")]
        .map((node) => {
          const style = getComputedStyle(node);
          return `${style.backgroundColor}|${style.backgroundImage.slice(0, 40)}|${style.borderColor}|${style.opacity}`;
        });
      const frame = () => {
        const style = getComputedStyle(win);
        return `${style.boxShadow.slice(0, 60)}|${style.borderColor}|${style.backgroundColor}`;
      };
      win.classList.add("is-active");
      const active = { bar: sample(bar), lamps: lamps(), frame: frame() };
      win.classList.remove("is-active");
      const inactive = { bar: sample(bar), lamps: lamps(), frame: frame() };
      win.classList.add("is-active");
      return {
        active,
        inactive,
        sameBar: JSON.stringify(active.bar) === JSON.stringify(inactive.bar),
        sameLamps: JSON.stringify(active.lamps) === JSON.stringify(inactive.lamps),
        sameFrame: active.frame === inactive.frame,
      };
    },
  },

  // The same window with the front taken away from it.
  "titlebar-inactive": {
    window: "finder",
    act: () => {
      document.querySelector('.window[data-window="finder"]')?.classList.remove("is-active");
    },
    read: () => {
      const bar = document.querySelector('.window[data-window="finder"] .title-bar');
      return { widgets: bar ? bar.querySelectorAll("button").length : 0 };
    },
  },

  // The menu-bar switcher when its title is pulled down (inverted).
  "menubar-invert": {
    act: async () => {
      document.querySelector("#project-switcher-button")?.click();
    },
    read: () => {
      const button = document.querySelector("#project-switcher-button");
      const icon = button?.querySelector(".sys-icon");
      const menu = button?.closest(".menu");
      if (!button) return { missing: true };
      const iconStyle = icon ? getComputedStyle(icon) : null;
      return {
        open: Boolean(menu?.classList.contains("is-open")),
        titleBackground: getComputedStyle(button).backgroundColor,
        titleColor: getComputedStyle(button).color,
        iconBackground: iconStyle?.backgroundColor,
        iconPlate: iconStyle ? iconStyle.backgroundColor !== "rgba(0, 0, 0, 0)" : null,
      };
    },
  },

  // Anything a window paints past its own right edge, named well enough to
  // find in the source. The sweep counts these; this says what they are.
  "past-right-edge": {
    read: async () => {
      const rows = [];
      for (const id of ["scrapbook", "teachText", "questionSheet", "sectionDrafts", "reviewDesk", "outline"]) {
        try {
          if (!document.querySelector(`.window[data-window="${id}"]`) && typeof loadLazyWindowModule === "function") {
            await loadLazyWindowModule(id);
          }
          for (const win of document.querySelectorAll(".window")) {
            if (win.dataset.window !== id) win.classList.add("is-hidden");
          }
          if (typeof isPortraitDocumentFlow === "function" && isPortraitDocumentFlow()
            && typeof mobileHomeToDesktop === "function") mobileHomeToDesktop();
          if (typeof openWindow === "function") openWindow(id);
        } catch { continue; }
        await new Promise((resolve) => setTimeout(resolve, 400));
        const win = document.querySelector(`.window[data-window="${id}"]`);
        if (!win) continue;
        win.classList.remove("is-hidden");
        const box = win.getBoundingClientRect();
        for (const node of win.querySelectorAll("*")) {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") continue;
          const rect = node.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) continue;
          const past = Math.round(rect.right - Math.min(box.right, window.innerWidth));
          if (past < 6) continue;
          // A scroller may legitimately hold content wider than itself.
          const scrolls = [...node.parentElement ? [node.parentElement] : []]
            .some((parent) => ["auto", "scroll"].includes(getComputedStyle(parent).overflowX));
          rows.push({
            window: id,
            tag: node.tagName.toLowerCase(),
            cls: node.className?.toString().slice(0, 44) || "",
            text: (node.textContent || "").trim().slice(0, 24),
            past,
            inScroller: scrolls,
          });
          if (rows.length > 40) break;
        }
      }
      return { rows: rows.filter((entry) => !entry.inScroller).slice(0, 20) };
    },
  },

  // The route's own next-step button: does the default read as the default?
  "default-button": {
    window: "questionSheet",
    read: () => {
      const win = document.querySelector('.window[data-window="questionSheet"]');
      const buttons = [...(win?.querySelectorAll(".btn") || [])].filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 2 && rect.height > 2 && !node.closest("details:not([open])");
      });
      const read = (node) => {
        const style = getComputedStyle(node);
        return {
          label: (node.textContent || "").trim().slice(0, 18),
          background: style.backgroundColor,
          backgroundImage: style.backgroundImage.slice(0, 34),
          color: style.color,
          border: `${style.borderWidth} ${style.borderColor}`,
          shadow: style.boxShadow.slice(0, 34),
          weight: style.fontWeight,
        };
      };
      const isDefault = (node) => node.classList.contains("default")
        || node.classList.contains("is-default") || node.dataset.default === "true";
      const def = buttons.find(isDefault);
      const plain = buttons.find((node) => !isDefault(node));
      if (!def || !plain) return { defaults: buttons.length, note: "no default/plain pair found" };
      const a = read(def);
      const b = read(plain);
      const differs = Object.keys(a).filter((key) => key !== "label" && a[key] !== b[key]);
      return { default: a, plain: b, differsIn: differs };
    },
  },

  // The sweep photographed three windows as a zero-height box. Real or a race?
  "stub-windows": {
    read: async () => {
      const rows = [];
      for (const id of ["projectCd", "printDirectory", "claimCheck", "styleSheet"]) {
        let error = null;
        try {
          if (!document.querySelector(`.window[data-window="${id}"]`) && typeof loadLazyWindowModule === "function") {
            await loadLazyWindowModule(id);
          }
          if (typeof openWindow === "function") openWindow(id);
        } catch (cause) { error = String(cause).slice(0, 70); }
        await new Promise((resolve) => setTimeout(resolve, 900));
        const win = document.querySelector(`.window[data-window="${id}"]`);
        const box = win?.getBoundingClientRect();
        rows.push({
          window: id,
          present: Boolean(win),
          inRegistry: Object.prototype.hasOwnProperty.call(windowRegistry, id),
          box: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : null,
          hidden: win ? win.classList.contains("is-hidden") : null,
          error,
        });
      }
      return { rows };
    },
  },

  // Scrapbook on a phone: what is off the right edge, and can it be reached?
  "scrapbook-phone": {
    window: "scrapbook",
    read: () => {
      const win = document.querySelector('.window[data-window="scrapbook"]');
      if (!win) return { missing: true };
      const scroller = (node) => {
        for (let cur = node.parentElement; cur; cur = cur.parentElement) {
          const style = getComputedStyle(cur);
          if (["auto", "scroll"].includes(style.overflowX)) {
            return { cls: cur.className?.toString().slice(0, 34), room: cur.scrollWidth - cur.clientWidth };
          }
          if (cur === win) break;
        }
        return null;
      };
      const rows = [];
      for (const node of win.querySelectorAll("button, input, textarea")) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (node.closest("details:not([open])")) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const past = Math.round(rect.right - window.innerWidth);
        if (past < 2) continue;
        const owner = scroller(node);
        rows.push({
          label: (node.textContent || node.placeholder || node.tagName).trim().slice(0, 20),
          past,
          reachableBy: owner ? `${owner.cls} (+${owner.room}px)` : "nothing",
        });
      }
      return { offRight: rows };
    },
  },

  // The writing route's Commands popover, opened the way a writer opens it.
  "commands-popover": {
    window: "teachText",
    act: async () => {
      const win = document.querySelector('.window[data-window="teachText"]');
      // The command menu is a <details>. A closed <details> still reports a
      // box in Chromium, so measuring it shut proves nothing; open it first.
      const menu = win.querySelector("details.teachtext-command-menu")
        || win.querySelector(".teachtext-command-menu");
      if (menu && "open" in menu) menu.open = true;
      else {
        const summary = win.querySelector(".teachtext-command-menu > summary");
        summary?.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    },
    read: () => {
      const win = document.querySelector('.window[data-window="teachText"]');
      const popover = win?.querySelector(".teachtext-command-popover");
      if (!popover) return { missing: true };
      const menu = popover.closest(".teachtext-command-menu, .specialized-command-menu, .command-menu");
      const box = popover.getBoundingClientRect();
      const style = getComputedStyle(popover);
      return {
        open: popover.classList.toString().slice(0, 60),
        menuClass: menu?.className?.toString().slice(0, 70) || null,
        menuOpen: menu ? menu.hasAttribute("open") : null,
        popHidden: popover.hasAttribute("hidden"),
        clipPath: style.clipPath,
        zIndex: style.zIndex,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        transform: style.transform.slice(0, 40),
        box: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        pastRight: Math.round(box.right - window.innerWidth),
        pastBottom: Math.round(box.bottom - window.innerHeight),
      };
    },
  },

  // A pulled-down menu: does it fit the screen, and does its title invert?
  "menu-fit": {
    act: async () => {
      document.querySelector(".menu > button.apple")?.click();
    },
    read: () => {
      const menu = document.querySelector(".apple-menu-popover, .menu.is-open .menu-popover");
      const title = document.querySelector(".menu > button.apple");
      if (!menu) return { missing: true };
      const box = menu.getBoundingClientRect();
      const items = [...menu.querySelectorAll("button")];
      const below = items.filter((node) => node.getBoundingClientRect().bottom > window.innerHeight + 1);
      const style = getComputedStyle(menu);
      const titleStyle = title ? getComputedStyle(title) : null;
      return {
        menu: { y: Math.round(box.y), h: Math.round(box.height), bottom: Math.round(box.bottom) },
        viewportH: window.innerHeight,
        overflowsBy: Math.round(box.bottom - window.innerHeight),
        overflowY: style.overflowY,
        maxHeight: style.maxHeight,
        items: items.length,
        itemsBelowFold: below.length,
        firstBelow: below[0] ? (below[0].textContent || "").trim().slice(0, 22) : null,
        titleBackground: titleStyle?.backgroundColor,
        titleColor: titleStyle?.color,
      };
    },
  },

  // A window that opens partly off the left edge of a phone.
  "peek-offscreen": {
    window: "projectPeek",
    read: () => {
      const win = document.querySelector('.window[data-window="projectPeek"]');
      if (!win) return { missing: true };
      const box = win.getBoundingClientRect();
      const controls = [...win.querySelectorAll(".title-bar button, .close-box, .zoom-box, .grow-box")]
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return { cls: node.className?.toString().slice(0, 30), x: Math.round(rect.x * 10) / 10, w: Math.round(rect.width) };
        });
      return {
        box: { x: Math.round(box.x * 10) / 10, y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
        viewport: window.innerWidth,
        controls,
        offLeft: controls.filter((entry) => entry.x < 0).map((entry) => `${entry.cls}@${entry.x}`),
      };
    },
  },

  // Disabled controls: is the label still readable, and is it one label?
  "disabled-ink": {
    act: async () => {
      for (const id of ["clipboard", "scrapbook", "reviewDesk", "liquidCover", "control", "clioStage"]) {
        try {
          if (!document.querySelector(`.window[data-window="${id}"]`) && typeof loadLazyWindowModule === "function") {
            await loadLazyWindowModule(id);
          }
          if (typeof openWindow === "function") openWindow(id);
        } catch { /* measured or absent */ }
        await new Promise((resolve) => setTimeout(resolve, 220));
      }
    },
    read: () => {
      // The painted backdrop, not the nearest transparent ancestor: walk up
      // until a layer is actually opaque, the way the pixel is composed.
      const parse = (value) => {
        const match = String(value).match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
      };
      const luminance = (rgb) => {
        const channel = (value) => {
          const v = value / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
      };
      const backdrop = (node) => {
        const layers = [];
        for (let current = node; current && current !== document.documentElement; current = current.parentElement) {
          const parsed = parse(getComputedStyle(current).backgroundColor);
          if (parsed && parsed.a > 0) { layers.push(parsed); if (parsed.a >= 0.999) break; }
        }
        let base = [255, 255, 255];
        for (let index = layers.length - 1; index >= 0; index -= 1) {
          base = base.map((channel, position) => layers[index].rgb[position] * layers[index].a + channel * (1 - layers[index].a));
        }
        return base;
      };
      const ratio = (node, style) => {
        const fg = parse(style.webkitTextFillColor !== style.color ? style.webkitTextFillColor : style.color);
        if (!fg) return null;
        const bg = backdrop(node);
        const blended = fg.rgb.map((channel, position) => channel * fg.a + bg[position] * (1 - fg.a));
        const l1 = luminance(blended);
        const l2 = luminance(bg);
        return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
      };
      const rows = [];
      for (const node of document.querySelectorAll("button[disabled], button.is-disabled, .btn.is-disabled")) {
        const rect = node.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const style = getComputedStyle(node);
        const contrast = ratio(node, style);
        rows.push({
          label: (node.textContent || "").trim().slice(0, 26),
          window: node.closest(".window")?.dataset.window || "-",
          color: style.color,
          opacity: style.opacity,
          contrast,
        });
        if (rows.length > 30) break;
      }
      const worst = rows.filter((entry) => entry.contrast !== null).sort((a, b) => a.contrast - b.contrast);
      return { count: rows.length, worst: worst.slice(0, 8), best: worst.slice(-2) };
    },
  },

  // Control heights inside one row: do the boxes agree on a baseline?
  "row-baseline": {
    window: "control",
    read: () => {
      const rows = [];
      for (const row of document.querySelectorAll(".button-row, .field-row, .view-controls")) {
        const kids = [...row.children].filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 2 && rect.height > 2;
        });
        if (kids.length < 2) continue;
        const boxes = kids.map((node) => node.getBoundingClientRect());
        const heights = boxes.map((box) => Math.round(box.height));
        const tops = boxes.map((box) => Math.round(box.top));
        const spread = Math.max(...heights) - Math.min(...heights);
        const drift = Math.max(...tops) - Math.min(...tops);
        if (spread <= 1 && drift <= 1) continue;
        rows.push({
          row: row.className?.toString().slice(0, 44),
          window: row.closest(".window")?.dataset.window || "-",
          heights,
          tops,
          spread,
          drift,
          labels: kids.map((node) => (node.textContent || node.tagName).trim().slice(0, 14)),
        });
        if (rows.length > 12) break;
      }
      return { rows };
    },
  },

  // Round things: an object that means "circle" drawn in a box that is not
  // square is not round. A pill is a legitimate wide shape, so only objects
  // whose role is a disc are asked the question.
  "roundness": {
    read: () => {
      const DISCS = [
        ".close-box", ".zoom-box", ".shade-box", ".resize-box", ".window-lamp",
        "input[type='radio']", ".radio-mark", ".status-dot", ".model-dot",
        ".spinner", ".busy-dot", ".control-strip-lamp", ".finder-operation-spinner",
        ".theme-lab-radio", ".assistant-activity-dot", ".notification-dot",
      ].join(", ");
      const bad = [];
      const seen = [];
      for (const node of document.querySelectorAll(DISCS)) {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) continue;
        const ratio = rect.width / rect.height;
        const radius = style.borderRadius;
        const round = /(50%|9999px|999px)/.test(radius);
        seen.push({
          cls: node.className?.toString().slice(0, 40) || node.tagName,
          size: `${Math.round(rect.width * 10) / 10}x${Math.round(rect.height * 10) / 10}`,
          radius: radius.slice(0, 24),
        });
        if (round && (ratio > 1.06 || ratio < 0.95)) {
          bad.push({
            cls: node.className?.toString().slice(0, 40) || node.tagName,
            size: `${Math.round(rect.width * 10) / 10}x${Math.round(rect.height * 10) / 10}`,
            ratio: Math.round(ratio * 100) / 100,
            window: node.closest(".window")?.dataset.window || "chrome",
          });
        }
      }
      return { notRound: bad, discs: seen.slice(0, 16) };
    },
  },
};

const options = { probe: null, themes: THEMES, width: 1440, height: 900, shot: null, list: false, profile: "writing" };
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const flag = argv[index];
  if (flag === "--probe") options.probe = argv[++index];
  else if (flag === "--themes") options.themes = argv[++index].split(",");
  else if (flag === "--width") options.width = Number(argv[++index]);
  else if (flag === "--height") options.height = Number(argv[++index]);
  else if (flag === "--shot") options.shot = argv[++index];
  else if (flag === "--list") options.list = true;
  else if (flag === "--profile") options.profile = argv[++index];
}

if (options.list || !PROBES[options.probe]) {
  console.log("probes:", Object.keys(PROBES).join(", "));
  process.exit(options.list ? 0 : 1);
}

const probe = PROBES[options.probe];
mkdirSync(OUT_DIR, { recursive: true });
const server = await startAppServer(root);
const browser = await chromium.launch();
const report = [];
try {
  for (const theme of options.themes) {
    const context = await browser.newContext({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: options.shot ? 3 : 1,
      colorScheme: "light",
      reducedMotion: "reduce",
      hasTouch: options.width < 768,
      isMobile: options.width < 768,
    });
    await context.route(/https?:\/\/(?:127\.0\.0\.1|localhost):(?:1234|11434)\//, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ models: [] }) });
    });
    await context.addInitScript((id) => {
      localStorage.setItem("ai-system-6-theme", id);
      localStorage.removeItem("ai-system-6-liquid-glass");
      localStorage.setItem("clioOnboardingCompleted", "1");
    }, theme);
    const page = await context.newPage();
    await page.goto(server.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 30000 });
    if (options.profile === "writing") {
      await page.evaluate(async () => {
        if (typeof activateWorkspaceProfile === "function") {
          await activateWorkspaceProfile("writing", { persist: false, announce: false });
        }
      });
    }
    await page.evaluate((id) => {
      window.AISystem6Theme?.applyTheme(id, { experimental: true, persist: false, announce: false, modernFontPreference: false });
      for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
      const style = document.createElement("style");
      style.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }";
      document.head.append(style);
    }, theme);
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(700);

    if (probe.window) {
      await page.evaluate(async (id) => {
        if (!document.querySelector(`.window[data-window="${id}"]`) && typeof loadLazyWindowModule === "function") {
          try { await loadLazyWindowModule(id); } catch { /* reported below */ }
        }
        for (const win of document.querySelectorAll(".window")) {
          if (win.dataset.window === id) continue;
          win.classList.add("is-hidden");
          win.classList.remove("is-active");
        }
        if (typeof isPortraitDocumentFlow === "function" && isPortraitDocumentFlow()
          && typeof mobileHomeToDesktop === "function") mobileHomeToDesktop();
        try { if (typeof openWindow === "function") openWindow(id); } catch { /* reported below */ }
        const target = document.querySelector(`.window[data-window="${id}"]`);
        if (target) { target.classList.remove("is-hidden"); target.classList.add("is-active"); }
      }, probe.window);
      await page.waitForTimeout(800);
    }
    if (probe.act) { await page.evaluate(probe.act).catch(() => {}); await page.waitForTimeout(400); }

    const row = await page.evaluate(probe.read);
    report.push({ theme, ...row });
    console.log(theme, JSON.stringify(row));

    if (options.shot) {
      const target = probe.window ? `.window[data-window="${probe.window}"]` : ".menu-bar";
      const box = await page.evaluate((selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height };
      }, target);
      if (box && box.width > 2) {
        await page.screenshot({
          path: join(OUT_DIR, `${options.shot}-${theme}.png`),
          clip: {
            x: Math.round(box.x), y: Math.round(box.y),
            width: Math.round(Math.min(box.width, options.width - box.x)),
            height: Math.round(Math.min(box.height, options.height - box.y)),
          },
          animations: "disabled",
        });
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await stopProcess(server.child);
}
writeFileSync(join(OUT_DIR, `${options.probe}.json`), JSON.stringify(report, null, 2));
console.log(`\n${join(OUT_DIR, `${options.probe}.json`)}`);
