#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_ICON_NAMES } from "./site-assets-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.join(root, "site");
const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`NO  ${message}`);
}

function ok(message) {
  console.log(`OK  ${message}`);
}

function walk(directory, predicate = () => true) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute, predicate));
    else if (entry.isFile() && predicate(absolute)) files.push(absolute);
  }
  return files;
}

function localTarget(sourceFile, rawTarget) {
  const target = String(rawTarget).trim().replace(/^['"]|['"]$/g, "");
  if (!target || /^(?:[a-z]+:|\/\/|#|data:)/i.test(target)) return null;
  const clean = target.split(/[?#]/, 1)[0];
  return path.resolve(path.dirname(sourceFile), clean);
}

const required = [
  "index.html",
  "site.css",
  "desk.css",
  "js/main.js",
  "js/argument.js",
  "img/og-poster.png",
  "img/frames/manifest.json",
  "img/frames/classic.png",
  "img/frames/platinum.png",
  "img/frames/aqua.webp",
  "img/frames/snow-leopard.webp",
  "img/frames/yosemite.webp",
  "img/frames/liquid-glass.webp",
];
for (const relative of required) {
  if (existsSync(path.join(siteRoot, relative))) ok(`site/${relative}`);
  else fail(`site/${relative} is missing`);
}

const jsFiles = walk(path.join(siteRoot, "js"), (file) => file.endsWith(".js"));
for (const file of jsFiles) {
  const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (syntax.status !== 0) fail(`${path.relative(root, file)} syntax: ${syntax.stderr || syntax.stdout}`);
}
if (!failures.length) ok(`${jsFiles.length} site modules parse`);

const siteTextFiles = walk(siteRoot, (candidate) => /\.(?:html|css|js)$/i.test(candidate));
const siteText = new Map(siteTextFiles.map((file) => [file, readFileSync(file, "utf8")]));
const allSiteText = [...siteText.values()].join("\n");
const references = [];
for (const file of siteTextFiles) {
  const source = siteText.get(file);
  const patterns = file.endsWith(".html")
    ? [/(?:src|href)\s*=\s*["']([^"']+)["']/gi, /url\(\s*([^)]+?)\s*\)/gi]
    : file.endsWith(".css")
      ? [/url\(\s*([^)]+?)\s*\)/gi]
      : [/(?:from\s*|import\s*\()["']([^"']+)["']/g];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const target = localTarget(file, match[1]);
      if (target) references.push({ file, target, raw: match[1] });
    }
  }
}
for (const reference of references) {
  if (!reference.target.startsWith(`${siteRoot}${path.sep}`) || !existsSync(reference.target)) {
    fail(`${path.relative(root, reference.file)} has broken local reference: ${reference.raw}`);
  }
}
if (!failures.length) ok(`${references.length} local site references resolve`);

const iconUses = new Set();
for (const source of siteText.values()) {
  for (const pattern of [
    /data-icon=["']([^"']+)["']/g,
    /\bicon:\s*["']([^"']+)["']/g,
    /\biconImg\(\s*["']([^"']+)["']/g,
  ]) {
    for (const match of source.matchAll(pattern)) iconUses.add(match[1]);
  }
}
const declaredIcons = new Set(SITE_ICON_NAMES);
const missingIcons = [...iconUses].filter((name) => !declaredIcons.has(name)).sort();
const unusedIcons = [...declaredIcons].filter((name) => !iconUses.has(name)).sort();
if (!missingIcons.length && !unusedIcons.length) {
  ok(`${declaredIcons.size} official-site icon ids have one canonical sync manifest`);
} else {
  if (missingIcons.length) fail(`site icon manifest is missing: ${missingIcons.join(", ")}`);
  if (unusedIcons.length) fail(`site icon manifest still carries unused ids: ${unusedIcons.join(", ")}`);
}

const imgRoot = path.join(siteRoot, "img");
const orphanImages = readdirSync(imgRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && !allSiteText.includes(`img/${entry.name}`))
  .map((entry) => entry.name)
  .sort();
if (!orphanImages.length) ok("site/img has no unreferenced top-level legacy assets");
else fail(`site/img has unreferenced top-level assets: ${orphanImages.join(", ")}`);

const legacySurfaceTokens = [
  "mini-desktop", "mini-surface", "desk-apps", "desk-objects", "chat-stage",
  "chat-apps", "chat-app", "route-cell", "route-chip", "demo-wave",
  "demo-scanline", "demo-stagger", "mw-phone", "mw-caret",
];
const legacyResidue = legacySurfaceTokens.filter((token) => allSiteText.includes(token));
if (!legacyResidue.length) ok("retired replica-desktop selectors are absent");
else fail(`retired replica-desktop selectors remain: ${legacyResidue.join(", ")}`);

if (!/[—–]/.test(allSiteText)) ok("official-site copy avoids decorative long dashes");
else fail("official-site text still contains em/en dash characters");

const sync = spawnSync(process.execPath, [path.join(root, "tooling", "sync-site-assets.mjs"), "--check"], {
  cwd: root,
  encoding: "utf8",
});
if (sync.status === 0) ok("official-site icons match canonical desktop assets");
else fail((sync.stderr || sync.stdout || "site asset sync check failed").trim());

const poster = readFileSync(path.join(siteRoot, "img", "og-poster.png"));
const posterWidth = poster.readUInt32BE(16);
const posterHeight = poster.readUInt32BE(20);
if (posterWidth === 1200 && posterHeight === 630) ok("Open Graph poster is 1200×630");
else fail(`Open Graph poster is ${posterWidth}×${posterHeight}; expected 1200×630`);

const index = readFileSync(path.join(siteRoot, "index.html"), "utf8");
const argument = readFileSync(path.join(siteRoot, "js", "argument.js"), "utf8");
const quickTime = readFileSync(path.join(siteRoot, "js", "quicktime.js"), "utf8");
for (const needle of [
  "THE AI HAS",
  "https://system6.aaronlau.me",
  "https://www.bilibili.com/video/BV1ht3m6UEDb/",
  "https://github.com/surfine/AI-System-6",
  'src="js/main.js',
]) {
  if (!index.includes(needle)) fail(`site/index.html is missing ${needle}`);
}
if (!index.includes("site.js")) ok("legacy monolithic site.js is absent");
else fail("site/index.html still references legacy site.js");
if (index.includes('class="menu-apple s6-mark"') && !index.includes("&#63743;")) {
  ok("the menu bar wears the project-owned 1-bit System mark");
} else {
  fail("the menu bar still depends on the Apple private-use glyph");
}
// The hero dissolve replaced era cycling: the six real captures are stacked
// on one continuous 1988-to-2026 axis, so the page has one timeline, not two.
if (index.includes('id="hero-dissolve"') && !index.includes('id="era-strip"')) {
  ok("the six eras live on one continuous dissolve, not a second timeline");
} else {
  fail("the page carries a second era timeline besides the hero dissolve");
}
if (index.includes('id="argument"')
  && index.includes('id="claim-list"')
  && argument.includes("const OBJECT = \"teachText\"")
  && argument.includes("ERAS.map")
  && argument.includes("setEra(era.id, true)")) {
  ok("the six-appearance argument uses canonical manuscript icons and changes the live era");
} else {
  fail("the six-appearance argument is incomplete or detached from the live era");
}
if (quickTime.includes("https://player.bilibili.com/player.html?bvid=BV1ht3m6UEDb")
  && quickTime.includes('poster.addEventListener("click"')) {
  ok("Bilibili film embed loads only after the poster is clicked");
} else {
  fail("Bilibili film embed is missing or eagerly loaded");
}
if (!existsSync(path.join(siteRoot, "img", "hero-desktop.mp4"))) {
  ok("the site does not duplicate the film in its public payload");
} else {
  fail("site/img/hero-desktop.mp4 duplicates the Bilibili film");
}

const siteFiles = walk(siteRoot);
const siteBytes = siteFiles.reduce((sum, file) => sum + statSync(file).size, 0);
const sitePayloadBudget = 4 * 1024 * 1024;
if (siteBytes <= sitePayloadBudget) ok(`official site payload ${(siteBytes / 1024 / 1024).toFixed(1)} MiB`);
else fail(`official site payload ${(siteBytes / 1024 / 1024).toFixed(1)} MiB exceeds 4 MiB`);

// The floppy claim appears in three places, so only one of them is allowed
// to be a source: the receipt verify:floppy writes. A hand-edited README is
// how this number quietly stopped being true before.
{
  const receiptPath = path.join(siteRoot, "data", "floppy-budget.json");
  if (!existsSync(receiptPath)) {
    fail("site/data/floppy-budget.json is missing; run npm run verify:floppy");
  } else {
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    const readme = readFileSync(path.join(root, "README.md"), "utf8");
    const quoted = receipt.bytes.toLocaleString("en-US");
    if (readme.includes(quoted)) ok(`README quotes the measured payload (${quoted} bytes)`);
    else fail(`README does not quote the measured payload ${quoted}; run npm run sync:readme-payload`);
  }
}

if (failures.length) {
  console.error(`\nOfficial-site verification failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("\nOfficial-site verification passed.");
