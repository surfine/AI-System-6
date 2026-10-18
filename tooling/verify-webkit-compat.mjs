#!/usr/bin/env node
// WebKit compatibility gate: no lookbehind in the boot bundle or in the app's
// own sources.
//
// 1.0.59 shipped `/…(?<=…)/` in review-sections.js. Every WebKit build from
// macOS 12 rejects that literal while parsing the bundle, and because the file
// is concatenated into app.bundle.js the whole desk failed before boot() ran:
// the packaged app showed a blank window (a "Sad Mac") on a 2017 MacBook while
// the server behind it answered 200. Chrome, Firefox and current WebKit accept
// the syntax, so nothing local caught it.
//
// Old WebKit rejects a lookbehind with "invalid group specifier name", so a
// lookbehind is the one form this gate must refuse. Vendor bundles are listed
// rather than failed: they are upstream assets, and their remaining matches are
// reported so the next reader knows where they are.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOOKBEHIND = /\(\?<[=!]/g;
const CANDIDATES = ["apps/desktop/app.bundle.js"];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "vendor" || entry.name === "node_modules") continue;
      walk(next, out);
    } else if (entry.isFile() && /\.js$/i.test(entry.name)) {
      out.push(next);
    }
  }
  return out;
}

const files = [
  ...CANDIDATES.map((path) => join(root, path)),
  ...walk(join(root, "apps/desktop/app")),
].filter((path) => existsSync(path));

const vendorFiles = [];
function walkVendor(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name);
    if (entry.isDirectory()) walkVendor(next);
    else if (entry.isFile() && /\.js$/i.test(entry.name)) vendorFiles.push(next);
  }
}
walkVendor(join(root, "apps/desktop/app/vendor"));

let failures = 0;
for (const path of files) {
  const source = readFileSync(path, "utf8");
  const hits = [...source.matchAll(LOOKBEHIND)];
  if (!hits.length) continue;
  failures += hits.length;
  const lines = hits.map((hit) => source.slice(0, hit.index).split("\n").length);
  console.log(`NO  ${relative(root, path)}: lookbehind at line ${[...new Set(lines)].join(", ")}`);
}
if (failures) {
  console.log("");
  console.log("A lookbehind stops the boot bundle from parsing on WebKit before 16.4");
  console.log("(macOS 12's WKWebView): the desk never starts. Scan the text instead.");
}

const vendorHits = vendorFiles.flatMap((path) => {
  const source = readFileSync(path, "utf8");
  return [...source.matchAll(LOOKBEHIND)].map(() => relative(root, path));
});
if (vendorHits.length) {
  const unique = [...new Set(vendorHits)];
  console.log(`note: vendor lookbehinds remain (upstream, lazy-loaded): ${unique.join(", ")}`);
}

if (failures) process.exit(1);
console.log(`OK  no lookbehind in ${files.length} app files`);
