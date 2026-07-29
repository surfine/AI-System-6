// Capture CSS work evidence for one visible surface at a time.
//
// This is deliberately separate from visual-snapshot.mjs:
// - visual-snapshot is the global computed-style gate;
// - this tool writes before/after screenshots + computed JSON for a specific
//   CSS refactor slice, so reviewers can compare the exact affected surface.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

const THEMES = [
  { id: "classic", liquid: false },
  { id: "liquid", liquid: true },
];

const VIEWPORTS = [
  { id: "desktop", width: 1280, height: 820 },
  { id: "mobile", width: 390, height: 760 },
];

const MATERIAL_PROPS = [
  "display",
  "visibility",
  "color",
  "background",
  "background-color",
  "border-top-width",
  "border-top-style",
  "border-top-color",
  "border-right-width",
  "border-right-style",
  "border-right-color",
  "border-bottom-width",
  "border-bottom-style",
  "border-bottom-color",
  "border-left-width",
  "border-left-style",
  "border-left-color",
  "border-radius",
  "box-shadow",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
];

const TEXT_PROPS = [
  "color",
  "font-size",
  "font-weight",
  "line-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
];

const SURFACES = {
  "system-menu": {
    description: "System menu bar buttons, application menus, and popover interaction states",
    scenarios: [
      {
        id: "file-open",
        setup: async (page) => {
          await setupSystemMenu(page, "file");
        },
      },
      {
        id: "file-item-hover",
        setup: async (page) => {
          await setupSystemMenu(page, "file");
          await page.hover('.menu.is-open .menu-popover button[data-action="open-menu-selection"]');
        },
      },
      {
        id: "writing-tools-hover",
        setup: async (page) => {
          await setupSystemMenu(page, "writing-tools");
          await page.hover('.menu.is-open .menu-popover button[data-action="ai-proofread"]');
        },
      },
      {
        id: "apple-open",
        setup: async (page) => {
          await setupSystemMenu(page, "apple");
        },
      },
      {
        id: "multifinder-open",
        setup: async (page) => {
          await setupSystemMenu(page, "multifinder");
        },
      },
      {
        id: "multifinder-focus",
        setup: async (page) => {
          await setupSystemMenu(page, "multifinder");
          await page.focus("#multifinder-button");
        },
      },
    ],
    targets: [
      { sel: ".menu-bar", props: MATERIAL_PROPS.concat(["height", "gap"]) },
      { sel: '.menu-bar > .menu > button[data-i18n="menu_file"]', props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["height", "min-height", "border-radius"]) },
      { sel: '.menu.is-open > button[data-i18n="menu_file"]', props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["height", "min-height", "border-radius"]) },
      { sel: ".menu:focus-within > button", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["height", "min-height", "border-radius"]) },
      { sel: ".menu-popover", props: MATERIAL_PROPS.concat(["top", "min-width", "max-height", "overflow"]) },
      { sel: ".menu.is-open .menu-popover button:not(:disabled):not(.is-disabled)", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["min-height", "margin-top", "margin-right", "margin-bottom", "margin-left"]) },
      { sel: ".menu.is-open .menu-popover button:hover:not(:disabled):not(.is-disabled)", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["min-height", "margin-top", "margin-right", "margin-bottom", "margin-left"]) },
      { sel: ".menu.is-open .menu-popover button:hover:not(:disabled):not(.is-disabled) .shortcut", props: ["color", "opacity"] },
      { sel: '.menu-bar > .menu > button[data-i18n="menu_edit"]', props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["height", "min-height", "border-radius"]) },
      { sel: '.menu.is-open .menu-popover button[data-action="ai-proofread"]', props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["min-height", "margin-top", "margin-right", "margin-bottom", "margin-left"]) },
      { sel: '.menu.is-open .menu-popover button[data-action="ai-proofread"]:hover', props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["min-height", "margin-top", "margin-right", "margin-bottom", "margin-left"]) },
      { sel: ".multifinder-menu > .multifinder-button", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["height", "min-height", "border-radius"]) },
      { sel: ".multifinder-menu.is-open > .multifinder-button", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["height", "min-height", "border-radius"]) },
      { sel: ".multifinder-menu:focus-within > .multifinder-button", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["height", "min-height", "border-radius"]) },
      { sel: ".multifinder-menu .menu-popover", props: MATERIAL_PROPS.concat(["top", "right", "min-width", "max-width", "max-height", "overflow"]) },
      { sel: ".multifinder-popover .multifinder-app", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["grid-template-columns", "min-height"]) },
      { sel: ".multifinder-popover .multifinder-app:hover", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["grid-template-columns", "min-height"]) },
    ],
  },
  "window-chrome": {
    description: "Shared window chrome, title bar, and title-bar controls",
    scenarios: [
      {
        id: "active-default",
        setup: async (page) => {
          await showOnlyWindow(page, "teachText");
        },
      },
      {
        id: "close-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "teachText");
          await page.hover(".window.is-active .close-box");
        },
      },
      {
        id: "resize-focus",
        setup: async (page) => {
          await showOnlyWindow(page, "teachText");
          await page.focus(".window.is-active .resize-box");
        },
      },
      {
        id: "inactive-window",
        setup: async (page) => {
          await showWindowChromePair(page);
        },
      },
    ],
    targets: [
      { sel: ".window.is-active", props: MATERIAL_PROPS.concat(["overflow"]) },
      { sel: ".window:not(.is-active):not(.is-hidden)", props: MATERIAL_PROPS.concat(["filter", "opacity"]) },
      { sel: ".window.is-active .title-bar", props: MATERIAL_PROPS.concat(["height", "min-height", "gap", "grid-template-columns"]) },
      { sel: ".window:not(.is-active):not(.is-hidden) .title-bar", props: MATERIAL_PROPS.concat(["height", "min-height", "gap", "grid-template-columns"]) },
      { sel: ".window.is-active .title-bar h1", props: TEXT_PROPS.concat(["background", "border-left-width", "border-right-width"]) },
      { sel: ".window:not(.is-active):not(.is-hidden) .title-bar h1", props: TEXT_PROPS.concat(["background", "border-left-width", "border-right-width"]) },
      { sel: ".window.is-active .close-box", props: MATERIAL_PROPS.concat(["width", "height", "margin-top", "margin-right", "margin-bottom", "margin-left", "filter", "opacity", "transform", "justify-self", "align-self"]) },
      { sel: ".window.is-active .resize-box", props: MATERIAL_PROPS.concat(["width", "height", "margin-top", "margin-right", "margin-bottom", "margin-left", "filter", "opacity", "transform", "justify-self", "align-self"]) },
      { sel: ".window:not(.is-active):not(.is-hidden) .close-box", props: MATERIAL_PROPS.concat(["filter", "opacity"]) },
      { sel: ".window:not(.is-active):not(.is-hidden) .resize-box", props: MATERIAL_PROPS.concat(["filter", "opacity"]) },
      { sel: ".window.is-active .close-box::before", props: ["content", "opacity", "background", "transform"] },
      { sel: ".window.is-active .close-box::after", props: ["content", "opacity", "background", "transform"] },
      { sel: ".window.is-active .resize-box::before", props: ["content", "opacity", "background", "transform"] },
      { sel: ".window.is-active .resize-box::after", props: ["content", "opacity", "background", "transform"] },
      { sel: ".window.is-active .close-box:hover::before", props: ["opacity"] },
      { sel: ".window.is-active .close-box:hover::after", props: ["opacity"] },
      { sel: ".window.is-active .resize-box:focus-visible::before", props: ["opacity"] },
      { sel: ".window.is-active .resize-box:focus-visible::after", props: ["opacity"] },
      { sel: ".window.is-active .resize-box:focus-visible", props: MATERIAL_PROPS.concat(["outline-width", "outline-style", "outline-color"]) },
    ],
  },
  guide: {
    description: "Start Here guide window cards",
    scenarios: [
      {
        id: "default",
        setup: async (page) => {
          await showOnlyWindow(page, "guide");
        },
      },
    ],
    targets: [
      { sel: ".guide-pane", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".guide-start-card", props: MATERIAL_PROPS },
      { sel: ".guide-mode-card", props: MATERIAL_PROPS },
      { sel: ".guide-start-card small", props: TEXT_PROPS },
    ],
  },
  "system-status": {
    description: "System Status local/cloud panels",
    scenarios: [
      {
        id: "local",
        setup: async (page) => {
          await showOnlyWindow(page, "systemStatus");
          await page.evaluate(() => {
            document.body.classList.remove("is-cloud-active");
            const panel = document.querySelector("#model-state-panel");
            panel?.classList.add("is-running");
            document.querySelectorAll("[data-model-step]").forEach((item) => {
              item.classList.remove("is-current", "is-done");
              if (item.dataset.modelStep === "server") item.classList.add("is-done");
              if (item.dataset.modelStep === "models") item.classList.add("is-current");
            });
          });
        },
      },
      {
        id: "cloud",
        setup: async (page) => {
          await showOnlyWindow(page, "systemStatus");
          await page.evaluate(() => {
            document.body.classList.add("is-cloud-active");
            document.querySelector("#system-cloud-name").textContent = "DeepSeek";
            document.querySelector("#system-cloud-status").textContent = "Ready";
            document.querySelector("#system-cloud-context").textContent = "64K";
            document.querySelector("#system-cloud-latest").textContent = "0 tokens";
            document.querySelector("#system-cloud-session").textContent = "0 tokens";
            document.querySelector("#system-cloud-balance").textContent = "OK";
          });
        },
      },
    ],
    targets: [
      { sel: ".system-status-pane", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".status-clock", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".status-clock b", props: TEXT_PROPS.concat(["text-shadow"]) },
      { sel: ".model-state-panel", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".model-state-panel b", props: TEXT_PROPS },
      { sel: ".model-state-panel ol", props: ["gap", "grid-template-columns"] },
      { sel: ".model-state-panel li:not(.is-current):not(.is-done)", props: MATERIAL_PROPS },
      { sel: ".model-state-panel li.is-current", props: MATERIAL_PROPS },
      { sel: ".model-state-panel li.is-done", props: MATERIAL_PROPS },
      { sel: "#model-state-next", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".cloud-state-panel", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".cloud-state-panel b", props: TEXT_PROPS },
      { sel: ".cloud-state-name", props: TEXT_PROPS },
      { sel: ".cloud-state-status", props: TEXT_PROPS.concat(["gap"]) },
      { sel: ".cloud-state-usage", props: MATERIAL_PROPS.concat(["gap", "font-size"]) },
      { sel: ".cloud-state-usage dt", props: TEXT_PROPS },
    ],
  },
  "system-help": {
    description: "System Help list and detail panes",
    scenarios: [
      {
        id: "default",
        setup: async (page) => {
          await page.evaluate(async () => {
            if (typeof openSystemHelpEntry !== "function") {
              throw new Error("openSystemHelpEntry is not available");
            }
            await openSystemHelpEntry("system-help");
            const query = document.querySelector("#system-help-query");
            if (query) query.value = "system";
          });
        },
      },
    ],
    targets: [
      { sel: ".system-help-pane", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".system-help-search-row input", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".system-help-list", props: MATERIAL_PROPS },
      { sel: ".system-help-detail", props: MATERIAL_PROPS },
      { sel: ".system-help-list button", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["gap"])) },
      { sel: ".system-help-list button.is-selected", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["gap"])) },
      { sel: ".system-help-aliases span", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".system-help-actions", props: MATERIAL_PROPS.concat(["gap"]) },
    ],
  },
  "system-select": {
    description: "System select menu option states",
    scenarios: [
      {
        id: "selected",
        setup: async (page) => {
          await showOnlyWindow(page, "chooser");
          await openSnapshotSystemSelect(page, "#search-provider");
        },
      },
      {
        id: "option-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "chooser");
          await openSnapshotSystemSelect(page, "#search-provider");
          await page.hover("#search-provider + .system-select-button + .system-select-menu .system-select-option:nth-child(2)");
        },
      },
      {
        id: "option-focus",
        setup: async (page) => {
          await showOnlyWindow(page, "chooser");
          await openSnapshotSystemSelect(page, "#search-provider");
          await page.focus("#search-provider + .system-select-button + .system-select-menu .system-select-option:nth-child(2)");
        },
      },
    ],
    targets: [
      { sel: "#search-provider + .system-select-button + .system-select-menu", props: MATERIAL_PROPS },
      { sel: "#search-provider + .system-select-button + .system-select-menu .system-select-option", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["min-height", "margin-top", "margin-bottom"]) },
      { sel: "#search-provider + .system-select-button + .system-select-menu .system-select-option.is-selected", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["min-height", "margin-top", "margin-bottom"]) },
      { sel: "#search-provider + .system-select-button + .system-select-menu .system-select-option:hover", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["min-height", "margin-top", "margin-bottom"]) },
      { sel: "#search-provider + .system-select-button + .system-select-menu .system-select-option:focus-visible", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["min-height", "margin-top", "margin-bottom"]) },
      { sel: "#search-provider + .system-select-button + .system-select-menu .system-select-option.is-selected + .system-select-option", props: ["border-top-color", "border-top-style", "border-top-width"] },
      { sel: "#search-provider + .system-select-button + .system-select-menu .system-select-option:hover + .system-select-option", props: ["border-top-color", "border-top-style", "border-top-width"] },
      { sel: "#search-provider + .system-select-button + .system-select-menu .system-select-option:focus-visible + .system-select-option", props: ["border-top-color", "border-top-style", "border-top-width"] },
    ],
  },
  "tdi-tabs": {
    description: "TeachText and DocMap tab strips",
    scenarios: [
      {
        id: "teachtext-default",
        setup: async (page) => {
          await showOnlyWindow(page, "teachText");
          await setupTdiTabs(page, "#teachtext-tabs");
        },
      },
      {
        id: "teachtext-close-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "teachText");
          await setupTdiTabs(page, "#teachtext-tabs");
          await page.hover("#teachtext-tabs .tdi-tab-wrap.is-active .tdi-tab-close");
        },
      },
      {
        id: "teachtext-dragging",
        setup: async (page) => {
          await showOnlyWindow(page, "teachText");
          await setupTdiTabs(page, "#teachtext-tabs", { activeState: "dragging" });
        },
      },
      {
        id: "teachtext-drop-target",
        setup: async (page) => {
          await showOnlyWindow(page, "teachText");
          await setupTdiTabs(page, "#teachtext-tabs", { inactiveState: "drop-target" });
        },
      },
      {
        id: "docmap-default",
        setup: async (page) => {
          await showOnlyWindow(page, "docMap");
          await setupTdiTabs(page, "#docmap-tabs");
        },
      },
      {
        id: "docmap-close-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "docMap");
          await setupTdiTabs(page, "#docmap-tabs");
          await page.hover("#docmap-tabs .tdi-tab-wrap.is-active .tdi-tab-close");
        },
      },
    ],
    targets: [
      { sel: ".teachtext-tabs.tdi-tabs", props: MATERIAL_PROPS.concat(["gap", "min-height", "align-items"]) },
      { sel: ".docmap-tabs.tdi-tabs", props: MATERIAL_PROPS.concat(["gap", "min-height", "align-items"]) },
      { sel: ".tdi-tabs .tdi-tab-wrap", props: ["height", "min-height", "background", "border-top-width", "border-top-style", "border-top-color"] },
      { sel: ".tdi-tabs .tdi-tab-wrap.is-active", props: ["height", "min-height", "background", "border-top-width", "border-top-style", "border-top-color"] },
      { sel: ".tdi-tabs .tdi-tab-wrap.is-dragging", props: ["opacity"] },
      { sel: ".tdi-tabs .tdi-tab-wrap.is-drop-target .tdi-tab", props: MATERIAL_PROPS },
      { sel: ".tdi-tabs .tdi-tab", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["height", "min-height"]) },
      { sel: ".tdi-tabs .tdi-tab:not(.is-active)", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["height", "min-height"]) },
      { sel: ".tdi-tabs .tdi-tab.is-active", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["height", "min-height"]) },
      { sel: ".tdi-tabs .tdi-tab-wrap.is-dragging .tdi-tab", props: MATERIAL_PROPS.concat(["transform"]) },
      { sel: ".tdi-tabs .tdi-tab span", props: TEXT_PROPS.concat(["overflow", "text-overflow", "white-space"]) },
      { sel: ".tdi-tabs .tdi-tab small", props: TEXT_PROPS.concat(["overflow", "text-overflow", "white-space"]) },
      { sel: ".tdi-tabs .tdi-tab.is-active small", props: TEXT_PROPS },
      { sel: ".tdi-tabs .tdi-tab-close", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["width", "min-width", "height", "min-height", "top", "right", "transform"]) },
      { sel: ".tdi-tabs .tdi-tab:not(.is-active) + .tdi-tab-close", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["width", "min-width", "height", "min-height", "top", "right", "transform"]) },
      { sel: ".tdi-tabs .tdi-tab-wrap.is-active .tdi-tab-close", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["width", "min-width", "height", "min-height", "top", "right", "transform"]) },
      { sel: ".teachtext-tabs .tdi-tab-close:hover", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["transform"]) },
      { sel: ".docmap-tabs .tdi-tab-close:hover", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["transform"]) },
      { sel: ".teachtext-tabs .tdi-tab-wrap.is-active .tdi-tab-close:hover", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["transform"]) },
      { sel: ".docmap-tabs .tdi-tab-wrap.is-active .tdi-tab-close:hover", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["transform"]) },
    ],
  },
  "reader-tabs": {
    description: "Reader saved document tab strip",
    scenarios: [
      {
        id: "default",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderTabs(page);
        },
      },
      {
        id: "open-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderTabs(page);
          await page.hover("#reader-tabs .reader-tabs-item:not(.is-active) .reader-saved-open");
        },
      },
      {
        id: "active-remove-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderTabs(page);
          await page.hover("#reader-tabs .reader-tabs-item.is-active .reader-saved-remove");
        },
      },
      {
        id: "dragging",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderTabs(page, { activeState: "dragging" });
        },
      },
      {
        id: "drop-target",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderTabs(page, { inactiveState: "drop-target" });
        },
      },
      {
        id: "grabber-default",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderTabs(page);
        },
      },
      {
        id: "grabber-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderTabs(page);
          await hoverIfVisible(page, "#reader-split-handle");
        },
      },
      {
        id: "grabber-focus",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderTabs(page);
          await focusIfVisible(page, "#reader-split-handle");
        },
      },
      {
        id: "grabber-resizing",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderTabs(page);
          await setupTdiGrabberResizing(page);
        },
      },
    ],
    targets: [
      { sel: "#reader-tabs.reader-tabs", props: MATERIAL_PROPS.concat(["gap", "min-height", "align-items"]) },
      { sel: "#reader-tabs .reader-saved-label", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: "#reader-tabs .btn", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: "#reader-tabs .reader-tabs-item", props: ["display", "position", "width", "min-width", "max-width", "opacity"] },
      { sel: "#reader-tabs .reader-tabs-item.is-active", props: ["display", "position", "width", "min-width", "max-width", "opacity"] },
      { sel: "#reader-tabs .reader-tabs-item.is-dragging", props: ["opacity"] },
      { sel: "#reader-tabs .reader-saved-open", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["width", "min-width", "max-width", "min-height", "grid-template-columns", "gap", "transform"]) },
      { sel: "#reader-tabs .reader-tabs-item.is-active .reader-saved-open", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["width", "min-width", "max-width", "min-height", "grid-template-columns", "gap", "transform"]) },
      { sel: "#reader-tabs .reader-tabs-item.is-dragging .reader-saved-open", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["transform"]) },
      { sel: "#reader-tabs .reader-tabs-item.is-active.is-dragging .reader-saved-open", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["transform"]) },
      { sel: "#reader-tabs .reader-tabs-item.is-drop-target .reader-saved-open", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["transform"]) },
      { sel: "#reader-tabs .reader-saved-open b", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["width", "height"]) },
      { sel: "#reader-tabs .reader-tabs-item.is-active .reader-saved-open b", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["width", "height"]) },
      { sel: "#reader-tabs .reader-tab-text", props: ["display", "gap", "min-width"] },
      { sel: "#reader-tabs .reader-tab-text strong", props: TEXT_PROPS.concat(["overflow", "text-overflow", "white-space"]) },
      { sel: "#reader-tabs .reader-tab-text small", props: TEXT_PROPS.concat(["opacity", "overflow", "text-overflow", "white-space"]) },
      { sel: "#reader-tabs .reader-tabs-item.is-active .reader-tab-text small", props: TEXT_PROPS.concat(["opacity"]) },
      { sel: "#reader-tabs .reader-saved-remove", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["top", "right", "width", "min-width", "max-width", "height", "min-height", "transform", "z-index"]) },
      { sel: "#reader-tabs .reader-saved-remove:hover", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["transform"]) },
      { sel: "#reader-tabs .reader-tabs-item.is-active .reader-saved-remove", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["top", "right", "width", "min-width", "max-width", "height", "min-height", "transform", "z-index"]) },
      { sel: "#reader-tabs .reader-tabs-item.is-active .reader-saved-remove:hover", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["transform"]) },
      { sel: "#reader-split-handle.tdi-grabber", props: MATERIAL_PROPS.concat(["flex-basis", "align-self", "min-height", "cursor", "touch-action"]) },
      { sel: "#reader-split-handle.tdi-grabber::after", props: MATERIAL_PROPS.concat(["content", "top", "left", "width", "height", "opacity", "transform"]) },
      { sel: "#reader-split-handle.tdi-grabber:hover::after", props: MATERIAL_PROPS.concat(["top", "left", "width", "height", "opacity", "transform"]) },
      { sel: "#reader-split-handle.tdi-grabber:focus-visible", props: MATERIAL_PROPS.concat(["outline-width", "outline-style", "outline-color", "outline-offset"]) },
      { sel: "#reader-split-handle.tdi-grabber:focus-visible::after", props: MATERIAL_PROPS.concat(["top", "left", "width", "height", "opacity", "transform"]) },
      { sel: "body.is-resizing-reader #reader-split-handle.tdi-grabber::after", props: MATERIAL_PROPS.concat(["top", "left", "width", "height", "opacity", "transform"]) },
    ],
  },
  "reader-content": {
    description: "Reader article pane and empty state",
    scenarios: [
      {
        id: "article",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderContent(page);
        },
      },
      {
        id: "empty",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderContent(page, { empty: true });
        },
      },
      {
        id: "dragging",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderContent(page);
          await setupReaderWorkspaceOverlay(page, "is-dragging");
        },
      },
      {
        id: "importing",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderContent(page);
          await setupReaderWorkspaceOverlay(page, "is-importing");
        },
      },
    ],
    targets: [
      { sel: "#reader-content.reader-content", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["overflow-y", "font-family", "user-select"]) },
      { sel: "#reader-content.reader-content h1", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["text-align"]) },
      { sel: "#reader-content .reader-meta", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["word-break", "text-align"]) },
      { sel: "#reader-content .reader-body-content p", props: TEXT_PROPS.concat(["text-indent", "text-align"]) },
      { sel: "#reader-content > .empty-folder-note", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["display", "align-items", "justify-content", "max-width", "min-height", "text-align"]) },
      { sel: ".reader-workspace.is-dragging::after", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["inset", "z-index", "place-items", "pointer-events", "text-align", "text-shadow", "backdrop-filter"]) },
      { sel: ".reader-workspace.is-importing::after", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["inset", "z-index", "place-items", "pointer-events", "text-align", "text-shadow", "backdrop-filter"]) },
    ],
  },
  "reader-transcript": {
    description: "Reader video transcript paragraphs and source blocks",
    scenarios: [
      {
        id: "paragraphs",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderTranscript(page);
        },
      },
      {
        id: "button-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderTranscript(page);
          await page.hover(".reader-transcript-paragraph button");
        },
      },
      {
        id: "blocks-open",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderTranscript(page, { blocksOpen: true });
        },
      },
      {
        id: "block-focus",
        setup: async (page) => {
          await showOnlyWindow(page, "reader");
          await setupReaderTranscript(page, { blocksOpen: true, focusBlock: true });
        },
      },
    ],
    targets: [
      { sel: ".reader-transcript-view", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".reader-transcript-heading", props: TEXT_PROPS },
      { sel: ".reader-transcript-paragraphs", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".reader-transcript-paragraph", props: MATERIAL_PROPS.concat(["cursor"]) },
      { sel: ".reader-transcript-paragraph header", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["display", "justify-content", "align-items", "gap"]) },
      { sel: ".reader-transcript-paragraph p", props: TEXT_PROPS.concat(["white-space"]) },
      { sel: ".reader-transcript-paragraph button", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["cursor"]) },
      { sel: ".reader-transcript-paragraph button:hover", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["cursor"]) },
      { sel: ".reader-transcript-blocks", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".reader-transcript-blocks summary", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["cursor"]) },
      { sel: ".reader-transcript-block", props: MATERIAL_PROPS },
      { sel: ".reader-transcript-block header", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["display", "justify-content", "align-items", "gap"]) },
      { sel: ".reader-transcript-block p", props: TEXT_PROPS.concat(["white-space"]) },
      { sel: ".reader-transcript-block.is-focus", props: MATERIAL_PROPS.concat(["outline-width", "outline-style", "outline-color", "outline-offset"]) },
    ],
  },
  dictionary: {
    description: "Dictionary result panel",
    scenarios: [
      {
        id: "empty",
        setup: async (page) => {
          await showOnlyWindow(page, "dictionary");
          await page.evaluate(() => {
            const term = document.querySelector("#dictionary-term");
            const source = document.querySelector("#dictionary-source");
            const result = document.querySelector("#dictionary-result");
            if (term) term.textContent = "No term";
            if (source) source.textContent = "No source";
            if (result) {
              result.innerHTML = '<p class="empty-folder-note">Enter or select a word or short phrase, then choose Look Up.</p>';
            }
          });
        },
      },
      {
        id: "recent",
        setup: async (page) => {
          await showOnlyWindow(page, "dictionary");
          await page.evaluate(() => {
            const term = document.querySelector("#dictionary-term");
            const source = document.querySelector("#dictionary-source");
            const result = document.querySelector("#dictionary-result");
            const recent = document.querySelector("#dictionary-recent");
            if (term) term.textContent = "TeachText";
            if (source) source.textContent = "System Help";
            if (result) {
              result.innerHTML = `
                <article class="dictionary-card">
                  <h3>TeachText</h3>
                  <dl>
                    <dt>Definition</dt>
                    <dd>The manuscript surface in AI System 6.</dd>
                    <dt>Source</dt>
                    <dd>System Help</dd>
                  </dl>
                </article>
              `;
            }
            if (recent) {
              recent.innerHTML = `
                <b>Recent:</b>
                <button type="button" class="btn mini-btn">TeachText</button>
                <button type="button" class="btn mini-btn">Dictionary</button>
              `;
            }
          });
        },
      },
    ],
    targets: [
      { sel: ".dictionary-pane", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".dictionary-form label", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".dictionary-result", props: MATERIAL_PROPS },
      { sel: ".dictionary-result > .empty-folder-note", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".dictionary-recent", props: MATERIAL_PROPS.concat(["min-height", "font-size"]) },
      { sel: ".dictionary-recent button", props: MATERIAL_PROPS.concat(["max-width", "overflow", "text-overflow", "white-space"]) },
    ],
  },
  "find-file": {
    description: "Find File result rows",
    scenarios: [
      {
        id: "empty",
        setup: async (page) => {
          await showOnlyWindow(page, "findFile");
          await page.evaluate(() => {
            const query = document.querySelector("#find-file-query");
            const count = document.querySelector("#find-file-count");
            const scope = document.querySelector("#find-file-scope");
            const results = document.querySelector("#find-file-results");
            if (query) query.value = "missing";
            if (count) count.textContent = "No items";
            if (scope) scope.textContent = "Project Hard Disk";
            if (results) {
              results.innerHTML = '<p class="empty-folder-note">No matching files in Project Hard Disk.</p>';
            }
          });
        },
      },
      {
        id: "results",
        setup: async (page) => {
          await showOnlyWindow(page, "findFile");
          await page.evaluate(() => {
            const query = document.querySelector("#find-file-query");
            const count = document.querySelector("#find-file-count");
            const scope = document.querySelector("#find-file-scope");
            const results = document.querySelector("#find-file-results");
            if (query) query.value = "draft";
            if (count) count.textContent = "2 items";
            if (scope) scope.textContent = "Project Hard Disk";
            if (results) {
              results.innerHTML = `
                <button type="button" class="find-file-result is-selected">
                  <strong>Section Draft</strong>
                  <small>Draft</small>
                  <span>Project Hard Disk / Drafts / section-draft.md</span>
                </button>
                <button type="button" class="find-file-result">
                  <strong>Question Sheet</strong>
                  <small>Route</small>
                  <span>Project Hard Disk / Question Sheet</span>
                </button>
              `;
            }
          });
        },
      },
    ],
    targets: [
      { sel: ".find-file-pane", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".find-file-search-row label", props: TEXT_PROPS },
      { sel: ".find-file-results", props: MATERIAL_PROPS },
      { sel: ".find-file-results > .empty-folder-note", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".find-file-result", props: MATERIAL_PROPS },
      { sel: ".find-file-result:not(.is-selected)", props: MATERIAL_PROPS },
      { sel: ".find-file-result.is-selected", props: MATERIAL_PROPS },
      { sel: ".find-file-result small", props: TEXT_PROPS.concat(["opacity", "white-space"]) },
    ],
  },
  "context-panel": {
    description: "Context Panel retrieved/source rows",
    scenarios: [
      {
        id: "mixed",
        setup: async (page) => {
          await showOnlyWindow(page, "contextPanel");
          await setupContextPanelRows(page);
        },
      },
    ],
    targets: [
      { sel: ".context-panel-list", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".context-section-title", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".context-item", props: MATERIAL_PROPS },
      { sel: ".context-item:not(.is-dropped)", props: MATERIAL_PROPS },
      { sel: ".context-item.is-dropped", props: MATERIAL_PROPS.concat(["opacity"]) },
      { sel: ".source-registry-item", props: MATERIAL_PROPS },
      { sel: ".context-header", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".context-header strong", props: TEXT_PROPS },
      { sel: ".context-header span", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".context-body", props: TEXT_PROPS },
      { sel: ".context-item .button-row", props: MATERIAL_PROPS.concat(["gap"]) },
    ],
  },
  "clio-talk": {
    description: "ClioTalk empty state, conversation, reply actions, and composer",
    scenarios: [
      {
        id: "empty",
        setup: async (page) => {
          await setupClioTalk(page, "empty");
        },
      },
      {
        id: "ready-to-send",
        setup: async (page) => {
          await setupClioTalk(page, "ready-to-send");
        },
      },
      {
        id: "conversation",
        setup: async (page) => {
          await setupClioTalk(page, "conversation");
        },
      },
      {
        id: "sideask",
        setup: async (page) => {
          await setupClioTalk(page, "sideask");
        },
      },
      {
        id: "compose-tools",
        setup: async (page) => {
          await setupClioTalk(page, "conversation");
          await page.click("#compose-tools-toggle");
        },
      },
      {
        id: "run-assembly",
        setup: async (page) => {
          await setupClioTalk(page, "run-assembly");
          await page.click("#clio-run-summary");
        },
      },
      {
        id: "run-record",
        setup: async (page) => {
          await setupClioTalk(page, "run-record");
        },
      },
      {
        id: "reply-actions",
        setup: async (page) => {
          await setupClioTalk(page, "conversation");
          await page.click(".message-use-actions > summary");
          await page.evaluate(() => {
            const messages = document.querySelector("#messages");
            if (messages) messages.scrollTop = messages.scrollHeight;
          });
        },
      },
      {
        id: "failure",
        setup: async (page) => {
          await setupClioTalk(page, "failure");
        },
      },
      {
        id: "stopped",
        setup: async (page) => {
          await setupClioTalk(page, "stopped");
        },
      },
      {
        id: "streaming",
        setup: async (page) => {
          await setupClioTalk(page, "streaming");
        },
      },
      {
        id: "reading-history",
        setup: async (page) => {
          await setupClioTalk(page, "reading-history");
        },
      },
    ],
    targets: [
      { sel: ".assistant-window", props: MATERIAL_PROPS.concat(["width", "height"]) },
      { sel: ".assistant-details-bar", props: MATERIAL_PROPS.concat(["gap", "grid-template-columns"]) },
      { sel: ".assistant-window .clio-chat-file-link", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".assistant-window .sideask-mode-strip", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".assistant-window .sideask-source-link", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".assistant-window .sideask-end-button", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".assistant-window .clio-new-chat-button", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".assistant-window .assistant-context-button", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".assistant-window .messages-stage", props: MATERIAL_PROPS.concat(["overflow"]) },
      { sel: ".assistant-window .messages", props: MATERIAL_PROPS.concat(["overflow"]) },
      { sel: ".assistant-window .clio-scroll-latest", props: MATERIAL_PROPS.concat(["width", "height"]) },
      { sel: ".assistant-window .clio-welcome", props: MATERIAL_PROPS },
      { sel: ".assistant-window .message.user", props: MATERIAL_PROPS.concat(["grid-template-columns", "gap", "max-width"]) },
      { sel: ".assistant-window .message.assistant:not(.clio-welcome)", props: MATERIAL_PROPS.concat(["grid-template-columns", "gap", "max-width"]) },
      { sel: ".assistant-window .message.pending.streaming", props: MATERIAL_PROPS },
      { sel: ".assistant-window .speaker", props: TEXT_PROPS },
      { sel: ".assistant-window .message-content", props: TEXT_PROPS.concat(["max-width"]) },
      { sel: ".assistant-window .message-run-state", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["gap"]) },
      { sel: ".assistant-window .message-run-receipt", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["gap"]) },
      { sel: ".assistant-window .message-grounding-strip", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".assistant-window .clio-context-link", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".assistant-window .message-actions", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".assistant-window .message-disposition", props: TEXT_PROPS },
      { sel: ".assistant-window .message-use-menu", props: MATERIAL_PROPS },
      { sel: ".assistant-window .message-more-actions", props: MATERIAL_PROPS },
      { sel: ".assistant-window .message-action-menu", props: MATERIAL_PROPS },
      { sel: ".assistant-window .message-error", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".assistant-window .message-retry-button", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".assistant-window .composer", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".assistant-window .composer textarea", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["height", "min-height", "max-height"]) },
      { sel: ".assistant-window .composer-action-row", props: MATERIAL_PROPS.concat(["gap", "grid-template-columns"]) },
      { sel: ".assistant-window .clio-run-assembly > summary", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".assistant-window .clio-run-panel", props: MATERIAL_PROPS.concat(["width", "max-height"]) },
      { sel: ".assistant-window .clio-run-file", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".assistant-window .composer-file-button", props: MATERIAL_PROPS.concat(["width", "height", "min-width", "min-height"]) },
      { sel: ".assistant-window .composer-submit-slot", props: MATERIAL_PROPS.concat(["width", "height"]) },
      { sel: ".assistant-window .composer-submit-button", props: MATERIAL_PROPS.concat(["width", "height", "min-width", "min-height"]) },
      { sel: ".assistant-window .composer-stop-button", props: MATERIAL_PROPS.concat(["width", "height", "min-width", "min-height"]) },
      { sel: ".assistant-window .compose-tools-menu", props: MATERIAL_PROPS.concat(["width", "min-width", "max-width"]) },
    ],
  },
  "find-path": {
    description: "Searcher result rows",
    scenarios: [
      {
        id: "empty",
        setup: async (page) => {
          await showOnlyWindow(page, "findPath");
          await page.evaluate(() => {
            const query = document.querySelector("#find-path-query");
            const provider = document.querySelector("#find-path-provider");
            const count = document.querySelector("#find-path-count");
            const summary = document.querySelector("#find-path-summary");
            const results = document.querySelector("#find-path-results");
            if (query) query.value = "missing source";
            if (provider) provider.textContent = "DuckDuckGo";
            if (count) count.textContent = "0 results";
            summary?.classList.add("is-hidden");
            if (results) {
              results.innerHTML = '<p class="empty-folder-note find-path-notice">No results yet.</p>';
            }
          });
        },
      },
      {
        id: "results",
        setup: async (page) => {
          await showOnlyWindow(page, "findPath");
          await setupFindPathResults(page);
        },
      },
      {
        id: "normal-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "findPath");
          await setupFindPathResults(page);
          await page.hover(".find-path-result:not(.is-selected)");
        },
      },
      {
        id: "selected-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "findPath");
          await setupFindPathResults(page);
          await page.hover(".find-path-result.is-selected");
        },
      },
    ],
    targets: [
      { sel: ".find-path-pane", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".find-path-results", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".find-path-results > .empty-folder-note", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".find-path-result", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".find-path-result:not(.is-selected)", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".find-path-result.is-selected", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".find-path-result:hover", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".find-path-result strong", props: TEXT_PROPS },
      { sel: ".find-path-result span", props: TEXT_PROPS },
      { sel: ".find-path-result p", props: TEXT_PROPS },
      { sel: ".find-path-result:hover strong", props: TEXT_PROPS },
      { sel: ".find-path-result:hover span", props: TEXT_PROPS },
      { sel: ".find-path-result:hover p", props: TEXT_PROPS },
      { sel: ".find-path-result:hover .find-path-translation", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".find-path-translation", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
    ],
  },
  "clio-stage": {
    description: "ClioStage controls, viewport states, and cue view",
    scenarios: [
      {
        id: "slide",
        setup: async (page) => {
          await setupClioStage(page, "slide");
        },
      },
      {
        id: "button-states",
        setup: async (page) => {
          await setupClioStage(page, "button-states");
        },
      },
      {
        id: "dragging",
        setup: async (page) => {
          await setupClioStage(page, "dragging");
        },
      },
      {
        id: "importing",
        setup: async (page) => {
          await setupClioStage(page, "importing");
        },
      },
      {
        id: "cue",
        setup: async (page) => {
          await setupClioStage(page, "cue");
        },
      },
    ],
    targets: [
      { sel: ".clio-stage-pane", props: MATERIAL_PROPS.concat(["gap", "grid-template-rows"]) },
      { sel: ".clio-stage-details-bar", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: "#clio-stage-status", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["min-width", "overflow", "text-overflow", "white-space"])) },
      { sel: "#clio-stage-meta", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["min-width", "overflow", "text-overflow", "white-space"])) },
      { sel: ".clio-stage-toolbar", props: MATERIAL_PROPS.concat(["gap", "align-items"]) },
      { sel: ".clio-stage-controls", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".clio-stage-nav-button", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["min-width", "padding-inline"])) },
      { sel: ".clio-stage-view-switcher", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".clio-stage-view-switcher .btn", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["min-height", "opacity"])) },
      { sel: ".clio-stage-view-switcher .btn.default", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["min-height", "opacity"])) },
      { sel: ".clio-stage-view-switcher .btn:disabled", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["min-height", "opacity"])) },
      { sel: ".clio-stage-view-switcher .btn.is-disabled", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["min-height", "opacity"])) },
      { sel: ".clio-stage-viewport", props: MATERIAL_PROPS.concat(["min-height"]) },
      { sel: ".clio-stage-viewport.is-dragging", props: MATERIAL_PROPS.concat(["min-height"]) },
      { sel: ".clio-stage-viewport.is-importing", props: MATERIAL_PROPS.concat(["min-height"]) },
      { sel: ".clio-stage-slide-mode", props: MATERIAL_PROPS.concat(["min-height", "overflow"]) },
      { sel: ".clio-stage-slide-frame", props: MATERIAL_PROPS.concat(["max-height", "aspect-ratio"]) },
      { sel: ".clio-stage-cue-mode", props: MATERIAL_PROPS.concat(["min-height", "gap", "grid-template-rows"]) },
      { sel: ".clio-stage-cue-current", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["overflow"])) },
      { sel: ".clio-stage-cue-current h1", props: TEXT_PROPS },
      { sel: ".clio-stage-cue-current h2", props: TEXT_PROPS },
      { sel: ".clio-stage-cue-next", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["gap"])) },
    ],
  },
  "liquid-cover": {
    description: "Cover Glass artboard, inspector hierarchy, and creative-control states",
    scenarios: [
      {
        id: "layers",
        setup: async (page) => {
          await setupLiquidCover(page, "layers");
        },
      },
      {
        id: "media",
        setup: async (page) => {
          await setupLiquidCover(page, "media");
        },
      },
      {
        id: "glass",
        setup: async (page) => {
          await setupLiquidCover(page, "glass");
        },
      },
      {
        id: "export",
        setup: async (page) => {
          await setupLiquidCover(page, "export");
        },
      },
    ],
    targets: [
      { sel: ".lc-toolbar", props: MATERIAL_PROPS.concat(["grid-template-columns", "gap"]) },
      { sel: ".lc-toolbar-modes", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".liquid-cover-body", props: MATERIAL_PROPS.concat(["grid-template-columns", "grid-template-rows"]) },
      { sel: ".lc-sidebar", props: MATERIAL_PROPS.concat(["grid-template-columns", "grid-template-rows", "overflow"]) },
      { sel: ".lc-stage", props: MATERIAL_PROPS.concat(["grid-template-rows", "overflow"]) },
      { sel: ".lc-stage-head", props: MATERIAL_PROPS.concat(["gap", "grid-template-columns"]) },
      { sel: ".lc-canvas", props: MATERIAL_PROPS.concat(["max-width", "max-height", "outline-width", "outline-color"]) },
      { sel: ".lc-panel", props: MATERIAL_PROPS.concat(["width", "max-width", "overflow"]) },
      { sel: ".lc-panel-intro", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".lc-inspector-tab.is-active", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["min-height"]) },
      { sel: ".lc-inspector-tab:not(.is-active)", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["min-height"]) },
      { sel: ".lc-aspect button.is-active", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["min-height"]) },
      { sel: ".lc-layer-item.is-active", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["min-height"]) },
      { sel: ".lc-bg-item[aria-pressed=\"true\"]", props: MATERIAL_PROPS.concat(["min-height"]) },
      { sel: ".lc-preset-row .btn", props: MATERIAL_PROPS.concat(TEXT_PROPS).concat(["min-height"]) },
      { sel: ".lc-preset-row .btn::before", props: MATERIAL_PROPS.concat(["content", "height"]) },
      { sel: ".lc-ask-bar", props: MATERIAL_PROPS.concat(["grid-template-columns", "gap"]) },
    ],
  },
  "writing-bell": {
    description: "Writing Bell timer surface",
    scenarios: [
      {
        id: "default",
        setup: async (page) => {
          await showOnlyWindow(page, "writingBell");
          await page.evaluate(() => {
            document.querySelector("#writing-bell-time").textContent = "25:00";
            document.querySelectorAll("[data-bell-mode]").forEach((button) => {
              button.classList.toggle("is-active", button.dataset.bellMode === "work");
              button.disabled = false;
            });
            document.querySelectorAll("[data-bell-preset]").forEach((button) => {
              button.classList.toggle("is-active", button.dataset.bellPreset === "25");
              button.disabled = false;
            });
          });
        },
      },
      {
        id: "preset-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "writingBell");
          await page.evaluate(() => {
            document.querySelector("#writing-bell-time").textContent = "25:00";
            document.querySelectorAll("[data-bell-mode]").forEach((button) => {
              button.classList.toggle("is-active", button.dataset.bellMode === "work");
              button.disabled = false;
            });
            document.querySelectorAll("[data-bell-preset]").forEach((button) => {
              button.classList.toggle("is-active", button.dataset.bellPreset === "25");
              button.disabled = false;
            });
          });
          await page.hover('[data-bell-preset="15"]');
        },
      },
    ],
    targets: [
      { sel: ".writing-bell-pane", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".writing-bell-time", props: MATERIAL_PROPS.concat(["font-size", "line-height"]) },
      { sel: ".writing-bell-mode", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".writing-bell-mode button:not(.is-active)", props: MATERIAL_PROPS.concat(["min-height"]) },
      { sel: ".writing-bell-mode button.is-active", props: MATERIAL_PROPS.concat(["min-height"]) },
      { sel: ".writing-bell-presets .mini-btn:not(.is-active)", props: MATERIAL_PROPS },
      { sel: ".writing-bell-presets .mini-btn:hover:not(:disabled):not(.is-disabled):not(.is-active)", props: MATERIAL_PROPS },
      { sel: ".writing-bell-presets .mini-btn.is-active", props: MATERIAL_PROPS },
    ],
  },
  "desk-accessories": {
    description: "Key Caps, Calculator, and Puzzle small tool surfaces",
    scenarios: [
      {
        id: "key-caps",
        setup: async (page) => {
          await showOnlyWindow(page, "keyCaps");
          await placeSnapshotWindow(page, "keyCaps");
        },
      },
      {
        id: "key-caps-character-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "keyCaps");
          await placeSnapshotWindow(page, "keyCaps");
          await setupCompactKeyCaps(page);
          await page.hover(".character-map button");
        },
      },
      {
        id: "key-caps-character-active",
        setup: async (page) => {
          await showOnlyWindow(page, "keyCaps");
          await placeSnapshotWindow(page, "keyCaps");
          await setupCompactKeyCaps(page);
          await page.hover(".character-map button");
          await page.mouse.down();
        },
      },
      {
        id: "calculator",
        setup: async (page) => {
          await showOnlyWindow(page, "calculator");
          await placeSnapshotWindow(page, "calculator");
          await page.evaluate(() => {
            const display = document.querySelector("#calculator-display");
            if (display) display.value = "42";
          });
        },
      },
      {
        id: "calculator-key-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "calculator");
          await placeSnapshotWindow(page, "calculator");
          await page.hover(".calculator-keys button:not(.calculator-equals)");
        },
      },
      {
        id: "calculator-key-active",
        setup: async (page) => {
          await showOnlyWindow(page, "calculator");
          await placeSnapshotWindow(page, "calculator");
          await page.hover(".calculator-keys button:not(.calculator-equals)");
          await page.mouse.down();
        },
      },
      {
        id: "puzzle",
        setup: async (page) => {
          await showOnlyWindow(page, "puzzle");
          await placeSnapshotWindow(page, "puzzle");
          await setupPuzzleRows(page);
        },
      },
      {
        id: "puzzle-tile-hover",
        setup: async (page) => {
          await showOnlyWindow(page, "puzzle");
          await placeSnapshotWindow(page, "puzzle");
          await setupPuzzleRows(page);
          await page.hover(".puzzle-tile:not(:disabled)");
        },
      },
      {
        id: "puzzle-tile-active",
        setup: async (page) => {
          await showOnlyWindow(page, "puzzle");
          await placeSnapshotWindow(page, "puzzle");
          await setupPuzzleRows(page);
          await page.hover(".puzzle-tile:not(:disabled)");
          await page.mouse.down();
        },
      },
    ],
    targets: [
      { sel: ".key-caps-pane", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".key-caps-pane > p", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["width"])) },
      { sel: ".shortcut-grid", props: MATERIAL_PROPS.concat(["overflow"]) },
      { sel: ".shortcut-grid span", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".shortcut-grid b", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".character-map", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".character-map button", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["min-height"])) },
      { sel: ".character-map button:hover", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["min-height"])) },
      { sel: ".character-map button:active", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["min-height", "transform"])) },
      { sel: ".calculator-pane", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: "#calculator-display", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".calculator-keys", props: MATERIAL_PROPS.concat(["gap", "grid-auto-rows"]) },
      { sel: ".calculator-keys button", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["height", "transform"])) },
      { sel: ".calculator-keys button:hover", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["height", "transform"])) },
      { sel: ".calculator-keys button:active", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["height", "transform"])) },
      { sel: ".calculator-keys .calculator-equals", props: MATERIAL_PROPS.concat(["height"]) },
      { sel: ".puzzle-window", props: MATERIAL_PROPS.concat(["width", "height"]) },
      { sel: ".puzzle-pane", props: MATERIAL_PROPS.concat(["gap"]) },
      { sel: ".puzzle-board", props: MATERIAL_PROPS.concat(["gap", "width", "height"]) },
      { sel: ".puzzle-tile", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["width", "height", "transform"])) },
      { sel: ".puzzle-tile:nth-child(4n)", props: MATERIAL_PROPS },
      { sel: ".puzzle-tile:nth-child(n + 13)", props: MATERIAL_PROPS },
      { sel: ".puzzle-tile:not(:disabled):hover", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["transform"])) },
      { sel: ".puzzle-tile:not(:disabled):active", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["transform"])) },
      { sel: ".puzzle-blank", props: MATERIAL_PROPS },
      { sel: ".puzzle-blank:disabled", props: MATERIAL_PROPS },
      { sel: ".puzzle-footer", props: MATERIAL_PROPS.concat(["width"]) },
      { sel: ".puzzle-footer span", props: MATERIAL_PROPS.concat(TEXT_PROPS.concat(["display", "min-height"])) },
    ],
  },
  "desktop-experience": {
    description: "Desktop profile, Startup Disk, and Applications",
    scenarios: [
      {
        id: "desktop",
        setup: async (page) => {
          await selectDesktopProfileForSnapshot(page);
          await page.evaluate(() => {
            for (const win of document.querySelectorAll(".window")) {
              win.classList.add("is-hidden");
              win.classList.remove("is-active");
            }
          });
        },
      },
      {
        id: "startup-disk",
        setup: async (page) => {
          await selectDesktopProfileForSnapshot(page);
          await showOnlyWindow(page, "disk");
          await placeSnapshotWindow(page, "disk");
        },
      },
      {
        id: "applications",
        setup: async (page) => {
          await selectDesktopProfileForSnapshot(page);
          await showOnlyWindow(page, "applications");
          await placeSnapshotWindow(page, "applications");
        },
      },
      {
        id: "writing-studio",
        setup: async (page) => {
          await selectDesktopProfileForSnapshot(page);
          await page.evaluate(async () => {
            await openWritingStudio();
          });
          await page.waitForFunction(() => document.body.dataset.workspaceProfile === "writing");
          await showOnlyWindow(page, "projects");
          await placeSnapshotWindow(page, "projects");
          await page.evaluate(() => {
            document.querySelector('.window[data-window="projects"]').style.left = "170px";
          });
        },
      },
    ],
    targets: [
      { sel: ".desktop", props: MATERIAL_PROPS },
      { sel: ".icon-column", props: ["display", "gap", "top", "right"] },
      { sel: ".desktop-icon:not(.is-hidden)", props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: '.window[data-window="disk"]', props: MATERIAL_PROPS.concat(["width", "height"]) },
      { sel: '.window[data-window="applications"]', props: MATERIAL_PROPS.concat(["width", "height"]) },
      { sel: '.window[data-window="disk"] .details-bar', props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: '.window[data-window="applications"] .details-bar', props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: '.window[data-window="disk"] .finder-item', props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: '.window[data-window="applications"] .finder-item', props: MATERIAL_PROPS.concat(TEXT_PROPS) },
      { sel: ".writing-spine-panel", props: MATERIAL_PROPS.concat(["width", "height"]) },
    ],
  },
  "startup-settings": {
    description: "Startup Settings modal",
    scenarios: [
      {
        id: "default",
        setup: async (page) => {
          await page.evaluate(() => {
            for (const win of document.querySelectorAll(".window")) {
              win.classList.add("is-hidden");
              win.classList.remove("is-active");
            }
            const modal = document.querySelector("#startup-settings-modal");
            if (!modal.open) modal.showModal();
          });
        },
      },
      {
        id: "radio-focus",
        setup: async (page) => {
          await page.evaluate(() => {
            for (const win of document.querySelectorAll(".window")) {
              win.classList.add("is-hidden");
              win.classList.remove("is-active");
            }
            const modal = document.querySelector("#startup-settings-modal");
            if (!modal.open) modal.showModal();
            const radio = modal.querySelector("input[type=\"radio\"]");
            radio?.focus();
          });
        },
      },
    ],
    targets: [
      { sel: "#startup-settings-modal", props: MATERIAL_PROPS },
      { sel: "#startup-settings-modal form", props: ["gap"] },
      { sel: ".startup-settings-header", props: ["gap"] },
      { sel: ".startup-settings-disk-icon", props: MATERIAL_PROPS.concat(["width", "height"]) },
      { sel: ".startup-settings-choice-row label", props: ["gap", "border-radius"] },
      { sel: ".startup-open-option", props: ["gap", "border-radius"] },
      { sel: "#startup-settings-modal input[type=\"radio\"]:not(:checked)", props: ["width", "min-width", "height", "min-height", "border-top-width", "border-top-style", "border-top-color", "border-radius", "accent-color"] },
      { sel: "#startup-settings-modal input[type=\"radio\"]:checked", props: ["width", "min-width", "height", "min-height", "border-top-width", "border-top-style", "border-top-color", "border-radius", "accent-color"] },
      { sel: "#startup-settings-modal input[type=\"radio\"]:focus", props: ["outline", "outline-offset", "box-shadow"] },
      { sel: "#startup-settings-modal input[type=\"radio\"]:focus-visible", props: ["outline", "outline-offset", "box-shadow"] },
      { sel: "#startup-settings-modal hr", props: MATERIAL_PROPS },
      { sel: ".startup-settings-subhead", props: TEXT_PROPS },
    ],
  },
};

function usage(exitCode = 1) {
  console.error(`Usage:
  npm run snapshot:css -- --surface <name|all> --label <step-label>

  node scripts/css-surface-snapshot.mjs --surface guide --label step08-guide-before
  node scripts/css-surface-snapshot.mjs --surface writing-bell,startup-settings --label step09-after
  node scripts/css-surface-snapshot.mjs --surface all --label step10-baseline

  node scripts/css-surface-snapshot.mjs --diff before.json after.json

Options:
  --surface   One of: ${Object.keys(SURFACES).join(", ")}, all
  --scenario  Comma-separated scenario ids, or all. Default all
  --label     Required. Directory name under drafts/css-refactor-snapshots/
  --out       Output root, default drafts/css-refactor-snapshots
  --theme     classic, liquid, or all. Default all
  --viewport  desktop, mobile, or all. Default all
  --url       Capture an already running app URL instead of starting a server
  --diff      Compare two css-surface-computed.json files and report drift
  --info      List surfaces and targets
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = {
    surface: "all",
    scenario: "all",
    label: "",
    out: "drafts/css-refactor-snapshots",
    theme: "all",
    viewport: "all",
    url: "",
    diff: null,
    info: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") usage(0);
    if (arg === "--info") {
      opts.info = true;
      continue;
    }
    const next = argv[i + 1];
    if (arg === "--diff") {
      const before = argv[i + 1];
      const after = argv[i + 2];
      if (!before || before.startsWith("--") || !after || after.startsWith("--")) {
        console.error("--diff requires two JSON paths.");
        usage();
      }
      opts.diff = [before, after];
      i += 2;
    } else if (arg === "--surface") opts.surface = requireValue(arg, next, ++i);
    else if (arg === "--scenario") opts.scenario = requireValue(arg, next, ++i);
    else if (arg === "--label") opts.label = requireValue(arg, next, ++i);
    else if (arg === "--out") opts.out = requireValue(arg, next, ++i);
    else if (arg === "--theme") opts.theme = requireValue(arg, next, ++i);
    else if (arg === "--viewport") opts.viewport = requireValue(arg, next, ++i);
    else if (arg === "--url") opts.url = requireValue(arg, next, ++i);
    else {
      console.error(`Unknown option: ${arg}`);
      usage();
    }
  }
  return opts;
}

function requireValue(flag, value) {
  if (!value || value.startsWith("--")) {
    console.error(`${flag} requires a value.`);
    usage();
  }
  return value;
}

function selectedSurfaces(value) {
  if (value === "all") return Object.keys(SURFACES);
  const names = value.split(",").map((item) => item.trim()).filter(Boolean);
  for (const name of names) {
    if (!SURFACES[name]) {
      console.error(`Unknown surface: ${name}`);
      usage();
    }
  }
  return names;
}

function selectedThemes(value) {
  if (value === "all") return THEMES;
  const theme = THEMES.find((item) => item.id === value);
  if (!theme) {
    console.error(`Unknown theme: ${value}`);
    usage();
  }
  return [theme];
}

function selectedScenarios(surface, value) {
  if (value === "all") return surface.scenarios;
  const ids = value.split(",").map((item) => item.trim()).filter(Boolean);
  const scenarios = ids.map((id) => surface.scenarios.find((scenario) => scenario.id === id));
  const unknownIndex = scenarios.findIndex((scenario) => !scenario);
  if (unknownIndex >= 0) {
    console.error(`Unknown scenario for this surface: ${ids[unknownIndex]}`);
    usage();
  }
  return scenarios;
}

function selectedViewports(value) {
  if (value === "all") return VIEWPORTS;
  const viewport = VIEWPORTS.find((item) => item.id === value);
  if (!viewport) {
    console.error(`Unknown viewport: ${value}`);
    usage();
  }
  return [viewport];
}

function outputRoot(out, label) {
  if (!label || !/^[a-zA-Z0-9._-]+$/.test(label)) {
    console.error("--label is required and may contain only letters, numbers, dot, underscore, and hyphen.");
    usage();
  }
  return isAbsolute(out) ? join(out, label) : join(root, out, label);
}

function resolveOptionalPlaywright() {
  const candidates = [
    "playwright",
    process.env.PLAYWRIGHT_MODULE,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next known location.
    }
  }
  console.error("Playwright is required. Install it locally or set PLAYWRIGHT_MODULE to a resolvable package path.");
  process.exit(1);
}

function chromeExecutablePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) || undefined;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpReady(url) {
  return new Promise((resolveReady) => {
    const req = get(url, (res) => {
      res.resume();
      resolveReady(res.statusCode && res.statusCode < 500);
    });
    req.on("error", () => resolveReady(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolveReady(false);
    });
  });
}

async function waitForServer(url, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await httpReady(url)) return;
    await wait(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => port ? resolvePort(port) : reject(new Error("Could not allocate port")));
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
  child.on("exit", (code) => {
    if (code !== null && code !== 0 && code !== 130) console.error(output.trim());
  });
  try {
    await waitForServer(url);
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
  return { url, child };
}

function stopAppServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function closeBrowser(browserInstance) {
  if (!browserInstance) return;
  try {
    await Promise.race([browserInstance.close(), wait(3000)]);
  } catch {
    // Snapshot evidence is already written; do not let browser cleanup hang CI.
  }
}

async function prepareBase(page, url, theme) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#boot-screen")?.hidden === true, null, { timeout: 12000 });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 12000 });
  await page.evaluate((themeId) => {
    document.body.classList.toggle("use-liquid-glass", themeId === "liquid");
    document.body.classList.remove("is-writer-mode", "is-cloud-active", "quick-draft-focus");
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    for (const win of document.querySelectorAll(".window")) {
      win.classList.add("is-hidden");
      win.classList.remove("is-active");
    }
    const existingNoMotion = document.querySelector("#css-surface-snapshot-no-motion");
    if (!existingNoMotion) {
      const style = document.createElement("style");
      style.id = "css-surface-snapshot-no-motion";
      style.textContent = `
        *, *::before, *::after {
          animation-delay: 0s !important;
          animation-duration: 0s !important;
          transition-delay: 0s !important;
          transition-duration: 0s !important;
        }
      `;
      document.head.append(style);
    }
    const spine = document.querySelector(".writing-spine-panel");
    if (spine) spine.style.display = "none";
  }, theme.id);
  await page.evaluate(() => document.fonts?.ready || true);
}

async function showOnlyWindow(page, name) {
  await page.evaluate((windowName) => {
    for (const win of document.querySelectorAll(".window")) {
      win.classList.add("is-hidden");
      win.classList.remove("is-active");
    }
    const target = document.querySelector(`.window[data-window="${windowName}"]`);
    if (!target) throw new Error(`Window not found: ${windowName}`);
    target.classList.remove("is-hidden", "is-collapsed");
    target.classList.add("is-active");
    target.removeAttribute("aria-hidden");
    target.style.left = "";
    target.style.top = "";
    target.style.right = "";
    target.style.bottom = "";
    target.style.width = "";
    target.style.height = "";
  }, name);
}

async function selectDesktopProfileForSnapshot(page) {
  await page.evaluate(async () => {
    await activateWorkspaceProfile("desktop", { openDefault: false, persist: false });
  });
  await page.waitForFunction(() => document.body.dataset.workspaceProfile === "desktop");
}

async function showWindowChromePair(page) {
  await page.evaluate(() => {
    for (const win of document.querySelectorAll(".window")) {
      win.classList.add("is-hidden");
      win.classList.remove("is-active");
      win.setAttribute("aria-hidden", "true");
    }
    const active = document.querySelector('.window[data-window="teachText"]');
    const inactive = document.querySelector('.window[data-window="systemHelp"]');
    if (!active || !inactive) throw new Error("Window chrome pair targets are not available");
    active.classList.remove("is-hidden", "is-collapsed");
    active.classList.add("is-active");
    active.removeAttribute("aria-hidden");
    active.style.left = "32px";
    active.style.top = "52px";
    active.style.right = "auto";
    active.style.bottom = "auto";
    inactive.classList.remove("is-hidden", "is-collapsed");
    inactive.classList.remove("is-active");
    inactive.removeAttribute("aria-hidden");
    inactive.style.left = "132px";
    inactive.style.top = "146px";
    inactive.style.right = "auto";
    inactive.style.bottom = "auto";
  });
}

async function setupSystemMenu(page, scenario) {
  await page.evaluate((scenarioId) => {
    for (const win of document.querySelectorAll(".window")) {
      win.classList.add("is-hidden");
      win.classList.remove("is-active");
    }
    document.body.classList.add("is-multifinder");
    renderAppMenuBar(scenarioId === "writing-tools" ? "teachText" : "finder", { force: true });
    document.querySelector(".multifinder-menu")?.classList.remove("is-hidden");
    document.querySelector("#notification-center-button")?.classList.add("is-hidden");
    document.querySelector("#clock")?.classList.add("is-hidden");
    document.querySelector("#cloud-model-indicator")?.classList.add("is-hidden");
    document.querySelectorAll(".menu").forEach((menu) => menu.classList.remove("is-open"));

    document.querySelector('[data-action="ai-proofread"]')?.classList.remove("is-disabled");

    const multifinderPopover = document.querySelector("#multifinder-popover");
    if (multifinderPopover) {
      multifinderPopover.innerHTML = `
        <div class="multifinder-heading">Running Applications</div>
        <button type="button" class="multifinder-app is-current">
          <span class="multifinder-mark">✓</span>
          <span>Finder</span>
          <small>active</small>
        </button>
        <button type="button" class="multifinder-app">
          <span class="multifinder-mark"></span>
          <span>TeachText</span>
          <small>open</small>
        </button>
      `;
    }

    const menu =
      scenarioId === "writing-tools"
        ? document.querySelector('.menu > button[data-i18n="menu_edit"]')?.closest(".menu")
        : scenarioId === "apple"
          ? document.querySelector(".menu")
        : scenarioId === "multifinder"
          ? document.querySelector(".multifinder-menu")
          : document.querySelector('.menu > button[data-i18n="menu_file"]')?.closest(".menu");
    if (!menu) throw new Error(`System menu scenario not found: ${scenarioId}`);
    menu.classList.add("is-open");
    if (scenarioId === "writing-tools") {
      menu.querySelector('[data-i18n="writing_tools"]')?.closest(".menu-item-with-sub")?.classList.add("is-open");
    }
  }, scenario);
}

async function placeSnapshotWindow(page, name) {
  await page.evaluate((windowName) => {
    const target = document.querySelector(`.window[data-window="${windowName}"]`);
    if (!target) throw new Error(`Window not found: ${windowName}`);
    target.style.left = "12px";
    target.style.top = "32px";
    target.style.right = "auto";
    target.style.bottom = "auto";
  }, name);
}

async function setupLiquidCover(page, panel) {
  await page.evaluate(async () => {
    await ensureLiquidCoverModule();
    await window.AISystem6LiquidCover.open({ skipPlacement: true });
  });
  await showOnlyWindow(page, "liquidCover");
  await placeSnapshotWindow(page, "liquidCover");
  await page.click(`#lc-tab-${panel}`);
  await page.waitForFunction((panelName) => {
    const tab = document.querySelector(`#lc-tab-${panelName}`);
    const activePanel = document.querySelector(`#lc-panel-${panelName}`);
    const activeControl =
      tab?.getAttribute("aria-selected") === "true" ||
      tab?.getAttribute("aria-pressed") === "true";
    return activeControl && activePanel?.hidden === false;
  }, panel);
}

async function setupClioStage(page, scenario) {
  await showOnlyWindow(page, "clioStage");
  await placeSnapshotWindow(page, "clioStage");
  await page.evaluate((scenarioId) => {
    const status = document.querySelector("#clio-stage-status");
    const meta = document.querySelector("#clio-stage-meta");
    const pageCounter = document.querySelector("#clio-stage-page");
    const source = document.querySelector("#clio-stage-source-view");
    const documentView = document.querySelector("#clio-stage-document-view");
    const slide = document.querySelector("#clio-stage-slide-view");
    const cue = document.querySelector("#clio-stage-cue-view");
    const prev = document.querySelector("#clio-stage-prev");
    const next = document.querySelector("#clio-stage-next");
    const viewport = document.querySelector("#clio-stage-viewport");

    if (status) status.textContent = "Deck: System 6 field notes";
    if (meta) meta.textContent = "16:9 · default · 4 slides";
    if (pageCounter) pageCounter.textContent = "2 / 4";
    [source, documentView, slide, cue].forEach((button) => {
      if (!button) return;
      button.classList.remove("default", "is-disabled");
      button.disabled = false;
    });
    slide?.classList.add("default");
    if (prev) prev.disabled = false;
    if (next) next.disabled = false;
    if (!viewport) return;

    viewport.className = "clio-stage-viewport clio-stage-slide-mode";
    viewport.innerHTML = `
      <section class="clio-stage-slide-frame">
        <div class="clio-stage-slide-body">
          <h1>System 6 Field Notes</h1>
          <h2>Glass controls stay measurable</h2>
          <p>Snapshots keep the pane, toolbar, and stateful controls from drifting.</p>
        </div>
      </section>
    `;

    if (scenarioId === "button-states") {
      source.classList.add("default");
      slide?.classList.remove("default");
      documentView.disabled = true;
      cue?.classList.add("is-disabled");
      return;
    }
    if (scenarioId === "dragging") {
      viewport.className = "clio-stage-viewport is-dragging";
      viewport.innerHTML = '<p class="empty-folder-note">Drop a slides.md file here.</p>';
      return;
    }
    if (scenarioId === "importing") {
      viewport.className = "clio-stage-viewport is-importing";
      viewport.innerHTML = '<p class="empty-folder-note">Importing deck...</p>';
      return;
    }
    if (scenarioId === "cue") {
      slide?.classList.remove("default");
      cue?.classList.add("default");
      viewport.className = "clio-stage-viewport clio-stage-cue-mode";
      viewport.innerHTML = `
        <article class="clio-stage-cue-current">
          <h1>System 6 Field Notes</h1>
          <h2>Keep state visible</h2>
          <p>Every refactor batch has paired screenshots.</p>
        </article>
        <aside class="clio-stage-cue-next">
          <span>Next slide</span>
          <strong>Viewport and controls</strong>
        </aside>
      `;
    }
  }, scenario);
}

async function setupFindPathResults(page) {
  await page.evaluate(() => {
    const query = document.querySelector("#find-path-query");
    const provider = document.querySelector("#find-path-provider");
    const count = document.querySelector("#find-path-count");
    const summary = document.querySelector("#find-path-summary");
    const results = document.querySelector("#find-path-results");
    if (query) query.value = "System 6 writing";
    if (provider) provider.textContent = "DuckDuckGo";
    if (count) count.textContent = "2 results";
    if (summary) {
      summary.textContent = "A short synthesis of the selected source evidence.";
      summary.classList.remove("is-hidden");
    }
    if (results) {
      results.innerHTML = `
        <div class="find-path-result is-selected" role="button" tabindex="0">
          <strong>System 6 interface notes</strong>
          <span>example.com/system-6</span>
          <p>Window chrome, menus, and controls stay dense and object-led.</p>
          <div class="find-path-translation"><b>Translation</b><p>窗口和控件保持清晰。</p></div>
        </div>
        <div class="find-path-result" role="button" tabindex="0">
          <strong>Writing workflow source</strong>
          <span>example.com/writing</span>
          <p>Source-grounded drafting depends on visible clipping and review.</p>
        </div>
      `;
    }
  });
}

async function setupContextPanelRows(page) {
  await page.evaluate(() => {
    const count = document.querySelector("#context-panel-count");
    const budget = document.querySelector("#context-panel-budget");
    const list = document.querySelector("#context-panel-list");
    if (count) count.textContent = "2 items";
    if (budget) budget.textContent = "Prompt 1,620 / Context 980 / Output 640 · HD-Gist";
    if (list) {
      list.innerHTML = `
        <div class="context-section-title">Retrieved context</div>
        <div class="context-item">
          <div class="context-header">
            <strong title="Reader: System 6 interface notes">Reader: System 6 interface notes</strong>
            <span>Used · coarse gist</span>
          </div>
          <div class="context-body">Window chrome, list rows, and action buttons stay dense and object-led so the writer can audit where retrieved context came from.</div>
          <div class="button-row">
            <button type="button" class="btn">Open source</button>
            <button type="button" class="btn">Disable source</button>
          </div>
        </div>
        <div class="context-item is-dropped">
          <div class="context-header">
            <strong title="Scrapbook: earlier clipping">Scrapbook: earlier clipping</strong>
            <span>Dropped</span>
          </div>
          <div class="context-body">This row represents a dropped context item. It should keep its dimmed treatment without changing the surrounding glass material.</div>
          <div class="button-row">
            <button type="button" class="btn">Open source</button>
            <button type="button" class="btn">Enable source</button>
          </div>
        </div>
        <div class="context-section-title">Source registry</div>
        <div class="context-item source-registry-item">
          <div class="context-header">
            <strong title="Project Hard Disk / Draft sources">Project Hard Disk / Draft sources</strong>
            <span>Available</span>
          </div>
          <div class="context-body">A source registry row uses the same object grammar with a dashed border in Classic.</div>
          <div class="button-row">
            <button type="button" class="btn">Open source</button>
            <button type="button" class="btn">Disable source</button>
          </div>
        </div>
      `;
    }
  });
}

async function setupClioTalk(page, scenario) {
  await showOnlyWindow(page, "assistant");
  await placeSnapshotWindow(page, "assistant");
  await page.evaluate(async (scenarioId) => {
    const win = document.querySelector('.window[data-window="assistant"]');
    const messages = document.querySelector("#messages");
    const prompt = document.querySelector("#prompt");
    const status = document.querySelector("#status");
    const context = document.querySelector("#assistant-context-space");
    if (!win || !messages) throw new Error("ClioTalk snapshot targets are not available");
    win.style.width = "720px";
    win.style.height = "540px";
    conversation.length = 0;
    messages.replaceChildren();
    setComposerBusy(false);
    if (status) status.textContent = "Ready";
    if (context) context.textContent = "Context available 7.4K / 8K · 93%";
    if (prompt) prompt.value = "";
    document.querySelector("#compose-tools-menu")?.classList.add("is-hidden");
    document.querySelector("#compose-tools-toggle")?.setAttribute("aria-expanded", "false");
    const chatFileButton = document.querySelector("#clio-chat-file-link");
    const chatFileName = document.querySelector("#clio-chat-file-name");
    const chatFilePath = document.querySelector("#clio-chat-file-path");
    renderClioTalkRunAssembly();
    if (chatFileButton) chatFileButton.disabled = false;
    if (chatFileName) chatFileName.textContent = "Field Notes Chat";
    if (chatFilePath) chatFilePath.textContent = "Project Hard Disk / ClioTalk / Conversations";

    if (scenarioId === "sideask") {
      setSideAskAnchorApp("teachText", "teachText");
      enterSideAskClioTalkSession("teachText");
      renderClioTalkWelcome();
      return;
    }

    if (scenarioId === "empty") {
      renderClioTalkWelcome();
      return;
    }

    if (scenarioId === "ready-to-send") {
      renderClioTalkWelcome();
      if (prompt) prompt.value = "Help me clarify this opening.";
      syncClioTalkSendButton();
      return;
    }

    addMessage("user", "Help me turn these scattered notes into a clear opening paragraph.", {
      messageRecord: { id: "snapshot-user-message", role: "user" },
      messageIndex: 0,
    });
    if (scenarioId === "failure") {
      const pending = createPendingMessage();
      resolvePendingStatus(pending, "The model connection was interrupted.", {
        retryText: "Help me turn these scattered notes into a clear opening paragraph.",
      });
      messages.scrollTop = messages.scrollHeight;
      return;
    }
    if (scenarioId === "streaming") {
      const pending = createPendingMessage();
      updatePendingStreamContent(
        pending,
        "Start with the decision the reader needs to make. Then use each note as evidence for that decision, keeping the writer's own uncertainty visible"
      );
      setComposerBusy(true);
      if (status) status.textContent = "Generating";
      return;
    }
    const runManifest = {
      scope: "application-supplied",
      promptStack: [
        { label: "System Integrity · runtime" },
        { label: "ClioTalk Main Prompt" },
        { label: "Interface Language · runtime" },
      ],
      skillFiles: [],
      harnessFile: null,
    };
    const assistantRecord = {
      id: "snapshot-assistant-message",
      role: "assistant",
      taskKind: "chat",
      ...(scenarioId === "run-record" ? { runRecordId: "snapshot-run-record", runManifest } : {}),
      ...(scenarioId === "stopped" ? { stopped: true, finishReason: "stopped" } : {}),
    };
    addMessage(
      "assistant",
      "Start with the decision the reader needs to make, then use the notes as evidence rather than as an inventory.\n\n**Possible opening**\n\nThe project succeeds when its files remain understandable outside the chat that created them.",
      {
        messageRecord: assistantRecord,
        messageIndex: 1,
        grounding: {
          sources: [{ key: "snapshot-source", label: "Project Hard Disk · Field Notes", kind: "project-file" }],
          sourceCount: 1,
          missing: [],
          contextPanelAvailable: true,
        },
      }
    );
    if (scenarioId === "reading-history") {
      for (let index = 0; index < 8; index += 1) {
        addMessage("user", `Earlier note ${index + 1}: keep the handoff concrete and name what remains uncertain.`, {
          messageRecord: { id: `snapshot-history-user-${index}`, role: "user" },
        });
        addMessage("assistant", `Working note ${index + 1}: preserve the writer's wording, then separate evidence from inference.`, {
          messageRecord: { id: `snapshot-history-assistant-${index}`, role: "assistant" },
        });
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      messages.scrollTop = 0;
      handleClioTalkMessagesScroll();
      return;
    }
    if (scenarioId === "stopped") {
      messages.scrollTop = messages.scrollHeight;
      return;
    }
    if (scenarioId === "run-assembly") {
      if (prompt) prompt.value = "Turn these field notes into a clear opening.";
      renderClioTalkRunAssembly();
      if (chatFileButton) chatFileButton.disabled = false;
      if (chatFileName) chatFileName.textContent = "Field Notes Chat";
      if (chatFilePath) chatFilePath.textContent = "Project Hard Disk / ClioTalk / Conversations";
      messages.scrollTop = messages.scrollHeight;
      return;
    }
    messages.scrollTop = 0;
  }, scenario);
}

async function setupPuzzleRows(page) {
  await page.evaluate(() => {
    const board = document.querySelector("#puzzle-board");
    const moves = document.querySelector("#puzzle-moves");
    if (moves) moves.textContent = "12 moves";
    if (!board) return;
    const tiles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 15];
    board.replaceChildren();
    tiles.forEach((tile, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = tile ? "puzzle-tile" : "puzzle-tile puzzle-blank";
      button.dataset.puzzleIndex = String(index);
      button.textContent = tile ? String(tile) : "";
      button.disabled = !tile || tile !== 15;
      board.append(button);
    });
  });
}

async function setupCompactKeyCaps(page) {
  await page.evaluate(() => {
    const grid = document.querySelector(".shortcut-grid");
    if (!grid) return;
    grid.innerHTML = `
      <span>⌘N</span><b>New Document</b>
      <span>⌘S</span><b>Save</b>
      <span>⌘?</span><b>Searcher</b>
    `;
  });
}

async function openSnapshotSystemSelect(page, selector) {
  await page.waitForSelector(`${selector} + .system-select-button`, { state: "visible" });
  await page.click(`${selector} + .system-select-button`);
  await page.waitForSelector(`${selector} + .system-select-button + .system-select-menu .system-select-option`, { state: "visible" });
}

async function hoverIfVisible(page, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function focusIfVisible(page, selector) {
  const isVisible = await page.locator(selector).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }).catch(() => false);
  if (!isVisible) return;
  await page.focus(selector);
}

async function setupTdiTabs(page, selector, options = {}) {
  await page.evaluate(({ tabSelector, activeState, inactiveState }) => {
    const tabs = document.querySelector(tabSelector);
    if (!tabs) throw new Error(`TDI tabs not found: ${tabSelector}`);
    tabs.classList.remove("is-hidden", "is-overflowing", "is-crowded");
    tabs.dataset.tabCount = "3";
    const tabData = [
      { id: "draft", label: "Manuscript Draft", sublabel: "General / 860 words", active: true, dirty: true },
      { id: "notes", label: "Source Notes", sublabel: "Reader clip", active: false, dirty: false },
      { id: "map", label: "Argument Map", sublabel: "DocMap", active: false, dirty: false },
    ];
    tabs.innerHTML = tabData.map((tab, index) => {
      const wrapClasses = ["tdi-tab-wrap"];
      const tabClasses = ["tdi-tab"];
      if (tab.active) {
        wrapClasses.push("is-active");
        tabClasses.push("is-active");
        if (activeState === "dragging") wrapClasses.push("is-dragging");
      } else if (inactiveState === "drop-target" && index === 1) {
        wrapClasses.push("is-drop-target");
      }
      if (tab.dirty) tabClasses.push("is-dirty");
      const mark = tab.dirty ? "• " : "";
      return `
        <div class="${wrapClasses.join(" ")}" data-document-tab-id="${tab.id}">
          <button type="button" class="${tabClasses.join(" ")}" data-document-tab-id="${tab.id}">
            <span>${mark}${tab.label}</span>
            <small>${tab.sublabel}</small>
          </button>
          <button type="button" class="tdi-tab-close" aria-label="Close tab" title="Close tab">×</button>
        </div>
      `;
    }).join("");
  }, { tabSelector: selector, ...options });
}

async function setupReaderTabs(page, options = {}) {
  await page.evaluate(({ activeState, inactiveState }) => {
    const tabs = document.querySelector("#reader-tabs");
    if (!tabs) throw new Error("Reader tabs not found");
    tabs.classList.remove("is-hidden", "is-overflowing", "is-crowded");
    tabs.dataset.tabCount = "3";
    const tabData = [
      { id: "source", title: "System 6 interface notes", subtitle: "Reader clip / example.com", active: true },
      { id: "draft", title: "Writing workflow source", subtitle: "Local PDF / 14 pages", active: false },
      { id: "quote", title: "Review desk quote", subtitle: "Saved clipping", active: false },
    ];
    tabs.innerHTML = [
      '<span class="reader-saved-label">Saved reader tabs</span>',
      ...tabData.map((tab, index) => {
        const itemClasses = ["reader-tabs-item"];
        if (tab.active) {
          itemClasses.push("is-active");
          if (activeState === "dragging") itemClasses.push("is-dragging");
        } else if (inactiveState === "drop-target" && index === 1) {
          itemClasses.push("is-drop-target");
        }
        return `
          <div class="${itemClasses.join(" ")}" data-document-tab-id="${tab.id}">
            <button type="button" class="btn reader-saved-open" data-document-tab-id="${tab.id}">
              <b>${index + 1}</b>
              <span class="reader-tab-text">
                <strong>${tab.title}</strong>
                <small>${tab.subtitle}</small>
              </span>
            </button>
            <button type="button" class="btn reader-saved-remove" aria-label="Close tab" title="Close tab">×</button>
          </div>
        `;
      }),
    ].join("");
  }, options);
}

async function setupTdiGrabberResizing(page) {
  await page.evaluate(() => {
    document.body.classList.add("is-resizing-reader");
  });
}

async function setupReaderContent(page, options = {}) {
  await page.evaluate(({ empty }) => {
    const content = document.querySelector("#reader-content");
    if (!content) throw new Error("Reader content not found");
    if (empty) {
      content.innerHTML = `
        <div class="empty-folder-note">
          <span class="mini-icon">R</span>
          Open a source to read, clip, and save selected passages.
        </div>
      `;
      return;
    }
    content.innerHTML = `
      <h1>System 6 Interface Notes</h1>
      <div class="reader-meta">https://example.com/system-6-notes · saved 2026-06-21</div>
      <div class="reader-body-content">
        <p>The Reader keeps source text separate from the manuscript so clips remain evidence, not automatic prose.</p>
        <p>Selections can move into Scrapbook or TeachText only after the writer chooses an explicit action.</p>
        <h2>Reading Surface</h2>
        <p>The pane should stay quiet in Classic and Liquid Glass while preserving long-form readability.</p>
      </div>
    `;
  }, options);
}

async function setupReaderWorkspaceOverlay(page, stateClass) {
  await page.evaluate((className) => {
    const workspace = document.querySelector(".reader-workspace");
    if (!workspace) throw new Error("Reader workspace not found");
    workspace.classList.remove("is-dragging", "is-importing");
    workspace.classList.add(className);
    workspace.dataset.dropLabel = className === "is-importing" ? "Importing source..." : "Drop source to Reader";
  }, stateClass);
}

async function setupReaderTranscript(page, options = {}) {
  await page.evaluate(({ blocksOpen, focusBlock }) => {
    const content = document.querySelector("#reader-content");
    if (!content) throw new Error("Reader content not found");
    content.innerHTML = `
      <div class="reader-transcript-view">
        <div class="reader-transcript-heading">Video transcript</div>
        <div class="reader-transcript-paragraphs">
          <article class="reader-transcript-paragraph" data-transcript-paragraph-id="para-1" data-transcript-start="00:00:01,000" data-transcript-end="00:00:12,000" data-transcript-block-ids="1,2">
            <header><small>00:01-00:12</small><button type="button" data-jump-blocks="1,2">Show source blocks</button></header>
            <p>The reader keeps transcript paragraphs selectable so clips preserve time ranges and source block ids.</p>
          </article>
          <article class="reader-transcript-paragraph" data-transcript-paragraph-id="para-2" data-transcript-start="00:00:13,000" data-transcript-end="00:00:25,000" data-transcript-block-ids="3,4">
            <header><small>00:13-00:25</small><button type="button" data-jump-blocks="3,4">Show source blocks</button></header>
            <p>Source blocks stay available underneath for audit, translation, and manuscript handoff.</p>
          </article>
        </div>
        <details class="reader-transcript-blocks"${blocksOpen ? " open" : ""}>
          <summary>Original SRT blocks</summary>
          <article class="reader-transcript-block${focusBlock ? " is-focus" : ""}" id="reader-srt-block-1" data-transcript-block-id="1">
            <header>#1 · <small>00:01-00:06</small></header>
            <p>The reader keeps transcript paragraphs selectable.</p>
          </article>
          <article class="reader-transcript-block" id="reader-srt-block-2" data-transcript-block-id="2">
            <header>#2 · <small>00:06-00:12</small></header>
            <p>Clips preserve time ranges and source block ids.</p>
          </article>
        </details>
      </div>
    `;
  }, options);
}

async function captureComputed(page, targets) {
  return await page.evaluate((targetList) => {
    const selectorParts = (selector) => {
      const match = selector.match(/^(.*?)(::before|::after)$/);
      return match ? { elementSelector: match[1], pseudo: match[2] } : { elementSelector: selector, pseudo: null };
    };
    const firstVisible = (selector) => {
      const all = Array.from(document.querySelectorAll(selector));
      return all.find((el) => {
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return cs.display !== "none" && cs.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }) || all[0] || null;
    };
    const out = {};
    for (const target of targetList) {
      const { elementSelector, pseudo } = selectorParts(target.sel);
      const el = firstVisible(elementSelector);
      if (!el) {
        out[target.sel] = null;
        continue;
      }
      const cs = getComputedStyle(el, pseudo);
      const rect = el.getBoundingClientRect();
      const entry = {
        _x: Math.round(rect.x),
        _y: Math.round(rect.y),
        _w: Math.round(rect.width),
        _h: Math.round(rect.height),
      };
      for (const prop of target.props) entry[prop] = cs.getPropertyValue(prop).trim();
      out[target.sel] = entry;
    }
    return out;
  }, targets);
}

function printInfo() {
  console.log("CSS surface snapshot targets");
  for (const [name, surface] of Object.entries(SURFACES)) {
    console.log(`  ${name}: ${surface.description}`);
    console.log(`    scenarios: ${surface.scenarios.map((scenario) => scenario.id).join(", ")}`);
    console.log(`    targets: ${surface.targets.map((target) => target.sel).join(", ")}`);
  }
}

function readCaptureJson(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    console.error(`Snapshot JSON not found: ${resolved}`);
    process.exit(1);
  }
  const parsed = JSON.parse(readFileSync(resolved, "utf8"));
  if (!Array.isArray(parsed)) {
    console.error(`Snapshot JSON must contain an array: ${resolved}`);
    process.exit(1);
  }
  return { path: resolved, entries: parsed };
}

function captureKey(entry) {
  const viewport = entry?.viewport || {};
  return [
    entry?.surface || "",
    entry?.scenario || "",
    entry?.theme || "",
    `${viewport.width || "?"}x${viewport.height || "?"}`,
  ].join("|");
}

function compareCaptures(beforeEntries, afterEntries) {
  const drift = [];
  const before = new Map(beforeEntries.map((entry) => [captureKey(entry), entry]));
  const after = new Map(afterEntries.map((entry) => [captureKey(entry), entry]));
  const keys = new Set([...before.keys(), ...after.keys()]);
  for (const key of [...keys].sort()) {
    const b = before.get(key);
    const a = after.get(key);
    if (!b) {
      drift.push({ key, type: "appeared" });
      continue;
    }
    if (!a) {
      drift.push({ key, type: "disappeared" });
      continue;
    }
    const beforeComputed = b.computed || {};
    const afterComputed = a.computed || {};
    const selectors = new Set([...Object.keys(beforeComputed), ...Object.keys(afterComputed)]);
    for (const selector of [...selectors].sort()) {
      const beforeSelector = beforeComputed[selector];
      const afterSelector = afterComputed[selector];
      if (beforeSelector == null && afterSelector == null) continue;
      if (beforeSelector == null) {
        drift.push({ key, selector, type: "selector appeared" });
        continue;
      }
      if (afterSelector == null) {
        drift.push({ key, selector, type: "selector disappeared" });
        continue;
      }
      const props = new Set([...Object.keys(beforeSelector), ...Object.keys(afterSelector)]);
      for (const prop of [...props].sort()) {
        if (beforeSelector[prop] !== afterSelector[prop]) {
          drift.push({
            key,
            selector,
            prop,
            before: beforeSelector[prop],
            after: afterSelector[prop],
          });
        }
      }
    }
  }
  return drift;
}

function diffCaptureFiles(beforePath, afterPath) {
  const before = readCaptureJson(beforePath);
  const after = readCaptureJson(afterPath);
  const drift = compareCaptures(before.entries, after.entries);
  if (!drift.length) {
    console.log(`OK  CSS surface computed snapshot stable. ${before.entries.length} entries compared, 0 drifted.`);
    console.log(`    before: ${before.path}`);
    console.log(`    after:  ${after.path}`);
    return;
  }
  console.error(`NO  CSS surface computed drift: ${drift.length} change(s).`);
  for (const item of drift.slice(0, 120)) {
    if (item.type) {
      console.error(`  [${item.key}] ${item.selector ? `${item.selector} ` : ""}${item.type}`);
    } else {
      console.error(`  [${item.key}] ${item.selector} ${item.prop}`);
      console.error(`      was: ${item.before}`);
      console.error(`      now: ${item.after}`);
    }
  }
  if (drift.length > 120) console.error(`  ... and ${drift.length - 120} more`);
  process.exitCode = 1;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.info) {
  printInfo();
  process.exit(0);
}

if (opts.diff) {
  diffCaptureFiles(opts.diff[0], opts.diff[1]);
  process.exit(process.exitCode || 0);
}

const surfaces = selectedSurfaces(opts.surface);
const themes = selectedThemes(opts.theme);
const viewports = selectedViewports(opts.viewport);
const outDir = outputRoot(opts.out, opts.label);
mkdirSync(outDir, { recursive: true });

let server = null;
let browser = null;
try {
  const url = opts.url || (server = await startAppServer()).url;
  const { chromium } = resolveOptionalPlaywright();
  const launchOptions = { headless: true, args: ["--no-sandbox"] };
  const executablePath = chromeExecutablePath();
  if (executablePath) launchOptions.executablePath = executablePath;
  browser = await chromium.launch(launchOptions);

  const captures = [];
  for (const surfaceName of surfaces) {
    const surface = SURFACES[surfaceName];
    const surfaceDir = join(outDir, surfaceName);
    mkdirSync(surfaceDir, { recursive: true });
    for (const scenario of selectedScenarios(surface, opts.scenario)) {
      for (const theme of themes) {
        for (const viewport of viewports) {
          const page = await browser.newPage({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: 1,
          });
          try {
            await prepareBase(page, url, theme);
            await scenario.setup(page);
            await page.waitForTimeout(320);
            const stem = `${surfaceName}-${scenario.id}-${theme.id}-${viewport.id}`;
            const screenshot = join(surfaceDir, `${stem}.png`);
            await page.screenshot({ path: screenshot, fullPage: true });
            captures.push({
              surface: surfaceName,
              scenario: scenario.id,
              theme: theme.id,
              viewport: { width: viewport.width, height: viewport.height },
              screenshot: screenshot.replace(`${root}/`, ""),
              computed: await captureComputed(page, surface.targets),
            });
          } finally {
            await page.close();
          }
        }
      }
    }
  }

  const jsonPath = join(outDir, "css-surface-computed.json");
  writeFileSync(jsonPath, JSON.stringify(captures, null, 2) + "\n");
  console.log(`OK  CSS surface snapshot captured: ${outDir}`);
  console.log(`    screenshots: ${captures.length}`);
  console.log(`    computed: ${jsonPath}`);
} catch (error) {
  console.error(`CSS surface snapshot failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeBrowser(browser);
  if (server?.child) await stopAppServer(server.child);
}

process.exit(process.exitCode || 0);
