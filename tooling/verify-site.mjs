#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  "img/og-poster.png",
  "img/hero-desktop.mp4",
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

const references = [];
for (const file of walk(siteRoot, (candidate) => /\.(?:html|css|js)$/i.test(candidate))) {
  const source = readFileSync(file, "utf8");
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

const siteFiles = walk(siteRoot);
const siteBytes = siteFiles.reduce((sum, file) => sum + statSync(file).size, 0);
if (siteBytes <= 8 * 1024 * 1024) ok(`official site payload ${(siteBytes / 1024 / 1024).toFixed(1)} MiB`);
else fail(`official site payload ${(siteBytes / 1024 / 1024).toFixed(1)} MiB exceeds 8 MiB`);

if (failures.length) {
  console.error(`\nOfficial-site verification failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("\nOfficial-site verification passed.");
