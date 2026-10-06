#!/usr/bin/env node
// Build Theme Lab fidelity manifests for the seven formerly-UNCOVERED eras
// from authored-seed-summary.json + tiger HIG cache metadata.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { loadImage } = require("canvas");
const summary = JSON.parse(
  readFileSync(join(root, "internal/evidence/drafts/theme-lab-fidelity-cache/authored-seed-summary.json"), "utf8"),
);

const OUT = join(root, "tests/visual/theme-lab-fidelity");
const HIG_PDF = "https://web.archive.org/web/20061004072228/http://developer.apple.com/documentation/UserExperience/Conceptual/OSXHIGuidelines/OSXHIGuidelines.pdf";
const AUTHORED_BASE = "https://aisystem6.local/theme-lab-fidelity-cache";

const FONT_PROBES = [
  ".theme-lab-controls h3",
  ".theme-lab-button-row .btn:first-child",
  ".theme-lab-form-grid > label:nth-child(4) .system-select-button",
  ".theme-lab-tab-specimen .system-tab.is-active",
];

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fontContract(themeInfo, historicalFontTarget, requiredFamily, isCustomFont) {
  return {
    historicalFontTarget,
    fontProbeSelectors: FONT_PROBES,
    fontAssertions: FONT_PROBES.map((selector) => ({
      selector,
      requiredFamily,
      isCustomFont,
    })),
  };
}

function authoredSourceId(theme, file) {
  return `authored.theme-lab.${theme}.${file.replace(/\.png$/, "")}`;
}

function authoredSource(theme, file, meta, label) {
  return {
    id: authoredSourceId(theme, file),
    file,
    url: `${AUTHORED_BASE}/${theme}/${file}`,
    pageUrl: `${AUTHORED_BASE}/${theme}/`,
    sha256: meta.sha256,
    width: meta.width,
    height: meta.height,
    systemVersion: label.systemVersion,
    credit: label.credit,
    redistribution: "Authored Theme Lab design specimen freeze; local research and comparison only. Not a native Mac OS capture.",
  };
}

function byFile(themeInfo) {
  return Object.fromEntries(themeInfo.specimens.map((s) => [s.file, s]));
}

function metFloor(note) {
  return { status: "met", failing: [], note };
}

function gapFloor(failing, note) {
  return { status: "gap", failing, note };
}

function tightTolerances() {
  // Authored freeze ↔ live Theme Lab: expect near-zero; keep a small regression margin.
  return { geometryMismatch: 0.02, edgeErrorPx: 0.5, materialError: 5 };
}

function captureBase(theme, themeInfo, font) {
  const width = themeInfo.labSize.width;
  const height = themeInfo.labSize.height;
  return {
    viewport: { width: 1280, height: 1040 },
    screen: { width: 1280, height: 1040 },
    windowSize: { width, height },
    deviceScaleFactor: 1,
    zoom: 1,
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    reducedMotion: "reduce",
    forcedColors: "none",
    colorSpace: "srgb",
    playwrightVersion: summary.playwrightVersion,
    browserRevision: "1243",
    browserVersion: summary.browserVersion,
    contentSha256: themeInfo.contentSha256,
    ...font,
    requiredResources: [],
    requiredResourcePrefixes: [],
    fixtureAssertions: [
      { selector: ".theme-lab-finder-window > .title-bar", count: 1, visible: true },
      { selector: ".theme-lab-button-row .btn.default", count: 1, visible: true },
    ],
    sourceScale: 1,
  };
}

function titleSetup(cropX = 80) {
  return [
    {
      selector: ".theme-lab-finder-window",
      style: { width: "400px", minWidth: "400px", maxWidth: "400px" },
    },
    {
      selector: ".theme-lab-finder-window > .title-bar",
      style: { width: "400px", minWidth: "400px", maxWidth: "400px" },
    },
    {
      selector: ".theme-lab-finder-window > .title-bar > h2",
      text: " ",
    },
  ];
}

function metalWindowSetup() {
  return [
    {
      selector: ".theme-lab-finder-window",
      style: {
        width: "420px",
        minWidth: "420px",
        maxWidth: "420px",
        height: "280px",
        minHeight: "280px",
        maxHeight: "280px",
      },
    },
  ];
}

function authoredSpecimen({ id, label, sourceId, meta, selector, setup, crop, tolerances = tightTolerances() }) {
  return {
    id,
    label,
    reference: {
      source: sourceId,
      crop: { x: 0, y: 0, width: meta.width, height: meta.height },
    },
    current: {
      selector,
      ...(crop ? { crop } : {}),
      ...(setup ? { setup } : {}),
    },
    repeat: { maxChangedPixels: 40, maxChannelDelta: 2 },
    tolerances,
    floor: metFloor(`Seeded 2026-10-05 against authored Theme Lab freeze ${meta.file}; freeze↔live expected near identity.`),
  };
}

async function buildTiger() {
  const info = summary.themes.tiger;
  const files = byFile(info);
  const hig0 = "hig-2005-p180-img180-000.png";
  const hig0Path = join(root, "internal/evidence/drafts/theme-lab-fidelity-cache/tiger", hig0);
  const hig0Img = await loadImage(hig0Path);
  const sources = [
    {
      id: "hig.tiger.p180.isync",
      file: hig0,
      url: HIG_PDF,
      pageUrl: HIG_PDF,
      sha256: sha256File(hig0Path),
      width: hig0Img.width,
      height: hig0Img.height,
      systemVersion: "Mac OS X 10.4 Tiger (HIG 2005-09-08 fig. p.180 iSync metal)",
      credit: "Apple Mac OS X Human Interface Guidelines, 2005-09-08 revision (Wayback research crop)",
      redistribution: "Copyrighted Apple documentation figure; local research and comparison only.",
    },
    authoredSource("tiger", "theme-lab-finder-metal-window.png", files["theme-lab-finder-metal-window.png"], {
      systemVersion: "Authored Theme Lab design specimen — Tiger brushed-metal Finder (data-app=finder)",
      credit: "AI System 6 Theme Lab freeze 2026-10-05 (not a native Mac OS capture)",
    }),
    authoredSource("tiger", "theme-lab-finder-metal-titleband.png", files["theme-lab-finder-metal-titleband.png"], {
      systemVersion: "Authored Theme Lab design specimen — Tiger metal title-bar band (text-cleared)",
      credit: "AI System 6 Theme Lab freeze 2026-10-05 (not a native Mac OS capture)",
    }),
  ];
  const font = fontContract(info, "Lucida Grande 13 pt", "Lucida Grande", false);
  const capture = {
    ...captureBase("tiger", info, font),
    fixtureAssertions: [
      { selector: ".theme-lab-finder-window", count: 1, visible: true },
      { selector: ".theme-lab-finder-window[data-app=finder]", count: 1, visible: true },
      { selector: ".theme-lab-finder-window > .title-bar", count: 1, visible: true },
      { selector: ".theme-lab-finder-window > .title-bar > .close-box", count: 1, visible: true },
      { selector: ".theme-lab-finder-window > .title-bar > .resize-box", count: 1, visible: true },
    ],
  };
  const metal = files["theme-lab-finder-metal-window.png"];
  const band = files["theme-lab-finder-metal-titleband.png"];
  const specimens = [
    authoredSpecimen({
      id: "finder-metal",
      label: "Tiger brushed-metal Finder window (authored Theme Lab freeze)",
      sourceId: authoredSourceId("tiger", "theme-lab-finder-metal-window.png"),
      meta: metal,
      selector: ".theme-lab-finder-window",
      setup: metalWindowSetup(),
    }),
    authoredSpecimen({
      id: "metal-titleband",
      label: "Tiger metal title-bar band, text-free (authored Theme Lab freeze)",
      sourceId: authoredSourceId("tiger", "theme-lab-finder-metal-titleband.png"),
      meta: band,
      selector: ".theme-lab-finder-window > .title-bar",
      setup: titleSetup(),
      crop: { x: 80, y: 0, width: 200, height: 22 },
    }),
    {
      id: "titlebar-lamps",
      label: "Active 10.4 close lamp (HIG p.180 iSync) vs Theme Lab close-box",
      reference: {
        source: "hig.tiger.p180.isync",
        crop: { x: 18, y: 10, width: 14, height: 14 },
      },
      current: {
        selector: ".theme-lab-finder-window > .title-bar > .close-box",
        crop: { x: 0, y: 0, width: 14, height: 14 },
      },
      repeat: { maxChangedPixels: 40, maxChannelDelta: 2 },
      tolerances: {
        geometryMismatch: 0.25,
        edgeErrorPx: 4,
        materialError: 40,
      },
      floor: gapFloor(
        ["geometryMismatch", "edgeErrorPx", "materialError"],
        "Seeded 2026-10-05 vs HIG p.180 iSync close lamp. Theme Lab gumdrop is product CSS, not a native 10.4 capture; silhouette/material short of FIDELITY_FLOOR — honest gap, not fake green.",
      ),
    },
  ];
  return {
    schemaVersion: 1,
    id: "tiger-macosx104-v1",
    theme: "tiger",
    target: "Mac OS X 10.4 Tiger",
    fixtureRevision: "theme-lab-fidelity-v1",
    capture,
    output: { atlasWidth: 1120, columns: 2 },
    sources,
    specimens,
    tolerancePolicy: "Seeded 2026-10-05 Ask A expanded. Narrow tiger board: authored Theme Lab metal Finder freeze + text-free metal title band (regression/authored floors) plus HIG 2005-09-08 p.180 close lamp (honest gap vs product gumdrop). HIG three crops alone never certify metal geometry — metal specimens are Theme Lab freezes with truthful credit.",
  };
}

function buildAuthoredBoard({
  theme,
  id,
  target,
  historicalFontTarget,
  requiredFamily,
  isCustomFont,
  specimenPlan,
  extraFixtureAssertions = [],
  tolerancePolicy,
}) {
  const info = summary.themes[theme];
  const files = byFile(info);
  const sources = specimenPlan.map((plan) => authoredSource(theme, plan.file, files[plan.file], {
    systemVersion: `Authored Theme Lab design specimen — ${target}`,
    credit: "AI System 6 Theme Lab freeze 2026-10-05 (not a native Mac OS capture)",
  }));
  const font = fontContract(info, historicalFontTarget, requiredFamily, isCustomFont);
  const capture = {
    ...captureBase(theme, info, font),
    fixtureAssertions: [
      ...captureBase(theme, info, font).fixtureAssertions,
      ...extraFixtureAssertions,
    ],
  };
  const specimens = specimenPlan.map((plan) => authoredSpecimen({
    id: plan.id,
    label: plan.label,
    sourceId: sources.find((s) => s.file === plan.file).id,
    meta: files[plan.file],
    selector: plan.selector,
    setup: plan.setup,
    crop: plan.crop,
  }));
  return {
    schemaVersion: 1,
    id,
    theme,
    target,
    fixtureRevision: "theme-lab-fidelity-v1",
    capture,
    output: { atlasWidth: 1120, columns: 2 },
    sources,
    specimens,
    tolerancePolicy,
  };
}

const classicTitleCrop = { x: 40, y: 0, width: 180, height: 18 };
const aquaTitleCrop = { x: 80, y: 0, width: 200, height: 22 };

const boards = {
  tiger: null, // async
  "system-7": buildAuthoredBoard({
    theme: "system-7",
    id: "system-7-macos-v1",
    target: "Macintosh System 7 (Theme Lab authored specimens)",
    historicalFontTarget: "Chicago 12 pt",
    requiredFamily: "ChiKareGo2",
    isCustomFont: true,
    extraFixtureAssertions: [
      { selector: ".theme-lab-finder-window > .title-bar > .close-box", count: 1, visible: true },
      { selector: ".theme-lab-controls label.field-row:has(input[type=checkbox]:checked)", count: 1, visible: true },
    ],
    specimenPlan: [
      {
        id: "active-titlebar",
        label: "System 7 active title-bar band (authored Theme Lab freeze)",
        file: "theme-lab-finder-titlebar.png",
        selector: ".theme-lab-finder-window > .title-bar",
        setup: titleSetup(40),
        crop: classicTitleCrop,
      },
      {
        id: "close-box",
        label: "System 7 close box (authored Theme Lab freeze)",
        file: "theme-lab-close-box.png",
        selector: ".theme-lab-finder-window > .title-bar > .close-box",
      },
      {
        id: "default-ok",
        label: "System 7 default OK button (authored Theme Lab freeze)",
        file: "theme-lab-default-ok.png",
        selector: ".theme-lab-button-row .btn.default",
      },
      {
        id: "checkbox-checked",
        label: "System 7 checked checkbox row (authored Theme Lab freeze)",
        file: "theme-lab-checkbox-checked.png",
        selector: ".theme-lab-controls label.field-row:has(input[type=checkbox]:checked)",
      },
    ],
    tolerancePolicy: "Seeded 2026-10-05 Ask A expanded. System 7 board uses assembled Theme Lab fixture freezes (not raw system-7-reference dumps). Credit marks authored Theme Lab / design specimens.",
  }),
  classic: buildAuthoredBoard({
    theme: "classic",
    id: "classic-system6-v1",
    target: "Macintosh System 6 (Theme Lab authored specimens)",
    historicalFontTarget: "Chicago 12 pt",
    requiredFamily: "ChiKareGo2",
    isCustomFont: true,
    extraFixtureAssertions: [
      { selector: ".theme-lab-finder-window > .title-bar > .close-box", count: 1, visible: true },
      { selector: ".theme-lab-form-grid > label:nth-child(4) .system-select-button", count: 1, visible: true },
    ],
    specimenPlan: [
      {
        id: "active-titlebar",
        label: "System 6 active title-bar band (authored Theme Lab freeze)",
        file: "theme-lab-finder-titlebar.png",
        selector: ".theme-lab-finder-window > .title-bar",
        setup: titleSetup(40),
        crop: classicTitleCrop,
      },
      {
        id: "close-box",
        label: "System 6 close box (authored Theme Lab freeze)",
        file: "theme-lab-close-box.png",
        selector: ".theme-lab-finder-window > .title-bar > .close-box",
      },
      {
        id: "default-ok",
        label: "System 6 default OK button (authored Theme Lab freeze)",
        file: "theme-lab-default-ok.png",
        selector: ".theme-lab-button-row .btn.default",
      },
      {
        id: "popup-normal",
        label: "System 6 popup / system-select (authored Theme Lab freeze)",
        file: "theme-lab-popup.png",
        selector: ".theme-lab-form-grid > label:nth-child(4) .system-select-button",
      },
    ],
    tolerancePolicy: "Seeded 2026-10-05 Ask A expanded. Classic has no native OS historical board — authored Theme Lab design specimen freezes with truthful credit.",
  }),
  "drawing-board": buildAuthoredBoard({
    theme: "drawing-board",
    id: "drawing-board-macos85-v1",
    target: "Mac OS 8.5 Drawing Board (Theme Lab authored specimens)",
    historicalFontTarget: "Charcoal 12 pt",
    requiredFamily: "Asap",
    isCustomFont: true,
    extraFixtureAssertions: [
      { selector: ".theme-lab-finder-window > .title-bar > .close-box", count: 1, visible: true },
      { selector: ".theme-lab-tab-specimen .system-tab.is-active", count: 1, visible: true },
    ],
    specimenPlan: [
      {
        id: "active-titlebar",
        label: "Drawing Board active title-bar band (authored Theme Lab freeze)",
        file: "theme-lab-finder-titlebar.png",
        selector: ".theme-lab-finder-window > .title-bar",
        setup: titleSetup(40),
        crop: { x: 40, y: 0, width: 180, height: 20 },
      },
      {
        id: "close-box",
        label: "Drawing Board close box (authored Theme Lab freeze)",
        file: "theme-lab-close-box.png",
        selector: ".theme-lab-finder-window > .title-bar > .close-box",
      },
      {
        id: "default-ok",
        label: "Drawing Board default OK button (authored Theme Lab freeze)",
        file: "theme-lab-default-ok.png",
        selector: ".theme-lab-button-row .btn.default",
      },
      {
        id: "selected-tab",
        label: "Drawing Board selected tab (authored Theme Lab freeze)",
        file: "theme-lab-selected-tab.png",
        selector: ".theme-lab-tab-specimen .system-tab.is-active",
      },
    ],
    tolerancePolicy: "Seeded 2026-10-05 Ask A expanded. Drawing Board has no native capture board (second-hand WindowBlinds history elsewhere) — authored Theme Lab design specimen freezes; not claimed as native Mac OS.",
  }),
  nextstep: buildAuthoredBoard({
    theme: "nextstep",
    id: "nextstep-v1",
    target: "NeXTSTEP (Theme Lab authored specimens)",
    historicalFontTarget: "Helvetica 12 pt",
    requiredFamily: "Helvetica",
    isCustomFont: false,
    extraFixtureAssertions: [
      { selector: ".theme-lab-form-grid > label:nth-child(4) .system-select-button", count: 1, visible: true },
      { selector: ".theme-lab-scroll-specimen .window-frame-bar.is-vertical .window-frame-thumb", count: 1, visible: true },
    ],
    specimenPlan: [
      {
        id: "active-titlebar",
        label: "NeXTSTEP active title-bar band (authored Theme Lab freeze)",
        file: "theme-lab-finder-titlebar.png",
        selector: ".theme-lab-finder-window > .title-bar",
        setup: titleSetup(40),
        crop: { x: 40, y: 0, width: 200, height: 22 },
      },
      {
        id: "default-ok",
        label: "NeXTSTEP default OK button (authored Theme Lab freeze)",
        file: "theme-lab-default-ok.png",
        selector: ".theme-lab-button-row .btn.default",
      },
      {
        id: "popup-normal",
        label: "NeXTSTEP popup / system-select (authored Theme Lab freeze)",
        file: "theme-lab-popup.png",
        selector: ".theme-lab-form-grid > label:nth-child(4) .system-select-button",
      },
      {
        id: "scroll-thumb",
        label: "NeXTSTEP vertical scroll thumb (authored Theme Lab freeze)",
        file: "theme-lab-scroll-thumb.png",
        selector: ".theme-lab-scroll-specimen .window-frame-bar.is-vertical .window-frame-thumb",
      },
    ],
    tolerancePolicy: "Seeded 2026-10-05 Ask A expanded. NeXTSTEP Theme Lab authored specimen freezes; workflow/edgecase instruments remain separate. Not claimed as native NeXT capture.",
  }),
  "big-sur": buildAuthoredBoard({
    theme: "big-sur",
    id: "big-sur-macos11-v1",
    target: "macOS 11 Big Sur (Theme Lab authored specimens)",
    historicalFontTarget: "SF Pro 13 pt",
    requiredFamily: ".SF NS",
    isCustomFont: false,
    extraFixtureAssertions: [
      { selector: ".theme-lab-finder-window > .title-bar > .close-box", count: 1, visible: true },
      { selector: ".theme-lab-sidebar button.is-selected", count: 1, visible: true },
    ],
    specimenPlan: [
      {
        id: "active-titlebar",
        label: "Big Sur active title-bar band (authored Theme Lab freeze)",
        file: "theme-lab-finder-titlebar.png",
        selector: ".theme-lab-finder-window > .title-bar",
        setup: titleSetup(),
        crop: aquaTitleCrop,
      },
      {
        id: "titlebar-lamps",
        label: "Big Sur close lamp (authored Theme Lab freeze)",
        file: "theme-lab-close-lamp.png",
        selector: ".theme-lab-finder-window > .title-bar > .close-box",
      },
      {
        id: "default-ok",
        label: "Big Sur default OK button (authored Theme Lab freeze)",
        file: "theme-lab-default-ok.png",
        selector: ".theme-lab-button-row .btn.default",
      },
      {
        id: "sidebar-active",
        label: "Big Sur sidebar selection (authored Theme Lab freeze)",
        file: "theme-lab-sidebar-active.png",
        selector: ".theme-lab-sidebar button.is-selected",
      },
    ],
    tolerancePolicy: "Seeded 2026-10-05 Ask A expanded. Big Sur Theme Lab authored specimen freezes — WWDC slides are not native OS captures and are not claimed here. Honest design-specimen board with FIDELITY_FLOOR ledger.",
  }),
  "liquid-glass": buildAuthoredBoard({
    theme: "liquid-glass",
    id: "liquid-glass-v1",
    target: "Liquid Glass (Theme Lab authored specimens)",
    historicalFontTarget: "SF Pro 13 pt",
    requiredFamily: ".SF NS",
    isCustomFont: false,
    extraFixtureAssertions: [
      { selector: ".theme-lab-finder-window > .title-bar > .close-box", count: 1, visible: true },
      { selector: ".theme-lab-tab-specimen .system-tab.is-active", count: 1, visible: true },
    ],
    specimenPlan: [
      {
        id: "active-titlebar",
        label: "Liquid Glass active title-bar band (authored Theme Lab freeze)",
        file: "theme-lab-finder-titlebar.png",
        selector: ".theme-lab-finder-window > .title-bar",
        setup: titleSetup(),
        crop: aquaTitleCrop,
      },
      {
        id: "titlebar-lamps",
        label: "Liquid Glass close lamp (authored Theme Lab freeze)",
        file: "theme-lab-close-lamp.png",
        selector: ".theme-lab-finder-window > .title-bar > .close-box",
      },
      {
        id: "default-ok",
        label: "Liquid Glass default OK button (authored Theme Lab freeze)",
        file: "theme-lab-default-ok.png",
        selector: ".theme-lab-button-row .btn.default",
      },
      {
        id: "selected-tab",
        label: "Liquid Glass selected tab (authored Theme Lab freeze)",
        file: "theme-lab-selected-tab.png",
        selector: ".theme-lab-tab-specimen .system-tab.is-active",
      },
    ],
    tolerancePolicy: "Seeded 2026-10-05 Ask A expanded. Liquid Glass has no historical native OS board — authored Theme Lab / product design specimen freezes with truthful credit. Not claimed as Tahoe native capture.",
  }),
};

boards.tiger = await buildTiger();

for (const [theme, manifest] of Object.entries(boards)) {
  const path = join(OUT, `${theme}.json`);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${path}`);
}
