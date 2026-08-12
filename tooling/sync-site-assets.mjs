// Sync the official-site icon set from the canonical theme assets.
//
// The site (site/) is deployed as a direct upload to Cloudflare Pages and
// must stay self-contained. This script is the single source for every
// theme icon the site uses: it copies each icon from apps/desktop/assets/themes/<era>/
// into site/img/themes/<era>/ under a stable name, so the site never keeps
// hand-copied art that can drift from the app.
//
// Run: node tooling/sync-site-assets.mjs        (add --check for CI dry run)

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const themesRoot = path.join(repoRoot, "apps", "desktop", "assets", "themes");
const siteThemesRoot = path.join(repoRoot, "site", "img", "themes");

// Every icon name the site references. Keep this list tight: each name costs
// six era files in the deployed payload.
const ICON_NAMES = [
  // Route + flexible tools
  "searcher", "reader", "scrapbook", "docMap", "teachText", "reviewDesk",
  "clioStage", "clioChart", "cmfStudio", "assistant", "liquidCover",
  "timeMachine", "importUtility", "soundscape", "questionSheet", "manuscript",
  // Desk objects
  "hardDisk", "fileFloppy", "projectDisc", "trash", "trashFull", "folder",
  "document", "startupDisk", "controlPanel", "applications",
  // Model providers
  "localModel", "cloudModel", "chooser", "endfieldTerminal",
];

// One deployed file per era per icon: the smallest source that still renders
// sharp at the site's display sizes (32 px CSS, 2x displays). Classic and
// Platinum render pixelated on purpose, so their native small sizes win.
const ERA_SOURCES = {
  classic: { pattern: (n) => `classic/icons/${n}-32.svg`, ext: "svg" },
  platinum: { pattern: (n) => `platinum/icons/${n}-32.png`, ext: "png" },
  aqua: { pattern: (n) => `aqua/icons/${n}-128.png`, ext: "png" },
  "snow-leopard": { pattern: (n) => `snow-leopard/icons/${n}-128.png`, ext: "png" },
  yosemite: { pattern: (n) => `yosemite/icons/${n}-64.png`, ext: "png" },
  "liquid-glass": { pattern: (n) => `liquid-glass/icons/${n}-64-default.png`, ext: "png" },
};

const checkOnly = process.argv.includes("--check");
const missing = [];
const drift = [];
const planned = new Map(); // era -> Set of expected file names

function filesMatch(left, right) {
  return existsSync(left) && existsSync(right) && readFileSync(left).equals(readFileSync(right));
}

for (const [era, source] of Object.entries(ERA_SOURCES)) {
  const outDir = path.join(siteThemesRoot, era);
  if (!checkOnly) mkdirSync(outDir, { recursive: true });
  planned.set(era, new Set());
  for (const name of ICON_NAMES) {
    const from = path.join(themesRoot, source.pattern(name));
    const outName = `${name}.${source.ext}`;
    planned.get(era).add(outName);
    if (!existsSync(from)) {
      missing.push(`${era}: ${source.pattern(name)}`);
      continue;
    }
    const to = path.join(outDir, outName);
    if (checkOnly) {
      if (!filesMatch(from, to)) drift.push(path.relative(repoRoot, to));
    } else {
      copyFileSync(from, to);
    }
  }
}

// Remove synced files whose manifest entry is gone, so deletions propagate.
if (!checkOnly && existsSync(siteThemesRoot)) {
  for (const era of readdirSync(siteThemesRoot)) {
    const eraDir = path.join(siteThemesRoot, era);
    if (!statSync(eraDir).isDirectory()) continue;
    const expected = planned.get(era);
    for (const file of readdirSync(eraDir)) {
      if (!expected || !expected.has(file)) rmSync(path.join(eraDir, file));
    }
    if (!expected) rmSync(eraDir, { recursive: true });
  }
}

if (checkOnly && existsSync(siteThemesRoot)) {
  for (const era of readdirSync(siteThemesRoot)) {
    const eraDir = path.join(siteThemesRoot, era);
    if (!statSync(eraDir).isDirectory()) {
      drift.push(path.relative(repoRoot, eraDir));
      continue;
    }
    const expected = planned.get(era);
    for (const file of readdirSync(eraDir)) {
      if (!expected || !expected.has(file)) drift.push(path.relative(repoRoot, path.join(eraDir, file)));
    }
  }
}

// App identity icons (favicon, Apple touch icon) come from the same source
// as the packaged app's.
const appIconDir = path.join(repoRoot, "apps", "desktop", "assets", "app-icon");
for (const file of ["app-icon-180.png", "app-icon-192.png"]) {
  const from = path.join(appIconDir, file);
  if (!existsSync(from)) { missing.push(`app-icon: ${file}`); continue; }
  const to = path.join(repoRoot, "site", "img", file);
  if (checkOnly) {
    if (!filesMatch(from, to)) drift.push(path.relative(repoRoot, to));
  } else {
    copyFileSync(from, to);
  }
}

if (missing.length) {
  console.error("sync-site-assets: missing sources:\n  " + missing.join("\n  "));
  process.exit(1);
}

if (drift.length) {
  console.error("sync-site-assets: generated site assets are stale:\n  " + drift.sort().join("\n  "));
  console.error("Run npm run site:sync and commit the result.");
  process.exit(1);
}

let total = 0;
let bytes = 0;
for (const era of Object.keys(ERA_SOURCES)) {
  const eraDir = path.join(siteThemesRoot, era);
  if (!existsSync(eraDir)) continue;
  for (const file of readdirSync(eraDir)) {
    total += 1;
    bytes += statSync(path.join(eraDir, file)).size;
  }
}
console.log(
  `sync-site-assets: ${checkOnly ? "verified" : "synced"} ${ICON_NAMES.length} icons × ${Object.keys(ERA_SOURCES).length} eras` +
  (checkOnly ? "" : ` → ${total} files, ${(bytes / 1024).toFixed(0)} KB`)
);
