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
  "zh-CN.html",
  "build-zh-page.mjs",
  "history/index.html",
  "history/zh-CN.html",
  "build-history-page.mjs",
  "history.css",
  "js/history.js",
  "site.css",
  "desk.css",
  "js/main.js",
  "js/copy.js",
  "js/argument.js",
  "img/og-poster.png",
  "img/frames/manifest.json",
  "img/frames/classic.webp",
  "img/frames/nextstep.webp",
  "img/frames/platinum.webp",
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
  // Cloudflare Pages answers an extensionless path from the .html file beside
  // it — /zh-CN serves zh-CN.html, which is why the Chinese page's own
  // canonical names /zh-CN rather than the file that happens to hold it. The
  // check follows the same rule the host does, or a correct link reads as
  // broken for a file that is right there.
  const cleanUrlTarget = `${reference.target}.html`;
  const resolves = existsSync(reference.target) || existsSync(cleanUrlTarget);
  // "../" from a page one folder down is the site root itself, which is a
  // page (index.html), not an escape from the site.
  const insideSite = reference.target === siteRoot || reference.target.startsWith(`${siteRoot}${path.sep}`);
  if (!insideSite || !resolves) {
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

// Every share card, the home poster and the two Field Notes cards, is read
// by chat apps and social sites at 1200×630.
for (const card of ["og-poster.png", "og-history.png", "og-history-zh.png"]) {
  const file = path.join(siteRoot, "img", card);
  if (!existsSync(file)) {
    fail(`site/img/${card} is missing; run npm run site:render-og`);
    continue;
  }
  const png = readFileSync(file);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width === 1200 && height === 630) ok(`share card ${card} is 1200×630`);
  else fail(`share card ${card} is ${width}×${height}; expected 1200×630`);
}

const index = readFileSync(path.join(siteRoot, "index.html"), "utf8");
const zhIndex = readFileSync(path.join(siteRoot, "zh-CN.html"), "utf8");
const argument = readFileSync(path.join(siteRoot, "js", "argument.js"), "utf8");
const quickTime = readFileSync(path.join(siteRoot, "js", "quicktime.js"), "utf8");
for (const needle of [
  // The public story leads with writer ownership. Historical appearances are
  // supporting evidence after the route, temporary-output rule, and chat
  // boundary have established the product.
  "Your words should",
  "never quietly takes the pen",
  'id="route"',
  'id="temporary"',
  'id="chat"',
  "https://system6.aaronlau.me",
  "https://www.bilibili.com/video/BV1ht3m6UEDb/",
  "https://github.com/surfine/AI-System-6",
  'src="js/main.js',
]) {
  if (!index.includes(needle)) fail(`site/index.html is missing ${needle}`);
}
if (index.indexOf('id="route"') < index.indexOf('id="argument"')
  && index.indexOf('id="temporary"') < index.indexOf('id="argument"')
  && index.indexOf('id="chat"') < index.indexOf('id="argument"')) {
  ok("official-site narrative establishes writing ownership before appearance and feature proof");
} else {
  fail("official-site route, temporary-output rule, and chat boundary must precede appearance proof");
}

for (const needle of [
  '<html lang="zh-CN">',
  // The URL that answers 200. The file is still zh-CN.html; Pages redirects
  // that name to /zh-CN, so the canonical has to name the final address.
  '<link rel="canonical" href="https://aisystem6.pages.dev/zh-CN">',
  "写到最后",
  "模型可以帮忙，却不能悄悄接过笔",
  "审校台",
  'href="index.html" lang="en">English</a>',
]) {
  if (!zhIndex.includes(needle)) fail(`site/zh-CN.html is missing ${needle}`);
}
for (const needle of [
  'hreflang="en"',
  'hreflang="zh-CN"',
  'hreflang="x-default"',
]) {
  if (index.includes(needle) && zhIndex.includes(needle)) ok(`both official-site languages carry ${needle}`);
  else fail(`official-site language alternates are missing ${needle}`);
}

const localizedBuild = spawnSync(process.execPath, [path.join(siteRoot, "build-zh-page.mjs"), "--check"], {
  cwd: root,
  encoding: "utf8",
});
if (localizedBuild.status === 0) ok("Chinese official-site page matches the shared page structure and copy map");
else fail((localizedBuild.stderr || localizedBuild.stdout || "Chinese site page is stale").trim());

// The Field Notes essay is generated for both languages from one chapter
// list; a hand edit to either page, or a source edit without a rebuild, is a
// stale essay.
const historyBuild = spawnSync(process.execPath, [path.join(siteRoot, "build-history-page.mjs"), "--check"], {
  cwd: root,
  encoding: "utf8",
});
if (historyBuild.status === 0) ok("Field Notes pages match their one chapter source");
else fail((historyBuild.stderr || historyBuild.stdout || "Field Notes pages are stale").trim());

const publicNarrative = [index, zhIndex, ...jsFiles.map((file) => readFileSync(file, "utf8"))].join("\n");
for (const forbidden of [
  "THE AI HAS A DESKTOP NOW",
  "No account and no upload",
  "with no reformatting",
  "this stop refuses to be skipped",
  "It goes and reads the live web",
]) {
  if (!publicNarrative.includes(forbidden)) ok(`official-site copy retired: ${forbidden}`);
  else fail(`official-site copy still contains retired or inaccurate claim: ${forbidden}`);
}
for (const requiredClaim of [
  "Searcher finds titles, sites, and snippets to open and inspect in Reader.",
  "Source Markdown can be converted into a Marp deck",
  "cloud requests follow the policy of the provider you choose",
  "The server keeps no second project database",
]) {
  if (publicNarrative.includes(requiredClaim)) ok(`official-site fact boundary: ${requiredClaim}`);
  else fail(`official-site fact boundary is missing: ${requiredClaim}`);
}
// The route section must show real captures, not a diagram of itself.
{
  const routeModule = readFileSync(path.join(siteRoot, "js", "route.js"), "utf8");
  const routeShots = ["question-sheet", "outline", "section-drafts", "teachtext"];
  const missingShots = routeShots.filter((id) =>
    !routeModule.includes(`"${id}"`) || !existsSync(path.join(siteRoot, "img", "route", `${id}.webp`)));
  if (!missingShots.length) ok(`${routeShots.length} writing-route stops carry a real capture`);
  else fail(`writing-route captures are missing: ${missingShots.join(", ")}`);
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
// The appearance menu has to list exactly the appearances this build releases,
// and only those. It said seven in its own copy while offering six (Big Sur
// shipped as the seventh and was never added), and a hand-typed list here was
// how that went unnoticed; the released set is now read from the registry the
// app itself ships. A branch (NeXTSTEP, js/eras.js BRANCHES) is released too,
// but it is not a stop on the 1988-2026 line: it must stay out of ERAS, which
// the dissolve and the cycle walk, and it sits in its own menu group.
{
  const registry = readFileSync(path.join(root, "apps", "desktop", "app", "core", "theme-registry.js"), "utf8");
  const released = [];
  let pendingId = null;
  for (const token of registry.matchAll(/\bid:\s*"([a-z-]+)"|\breleaseReady:\s*(true|false)/g)) {
    if (token[1]) pendingId = token[1];
    else if (pendingId) { if (token[2] === "true") released.push(pendingId); pendingId = null; }
  }
  const listed = [...index.matchAll(/data-appearance="([a-z-]+)"/g)].map((match) => match[1]);
  const missing = released.filter((id) => !listed.includes(id));
  const extra = listed.filter((id) => !released.includes(id));
  if (released.length && !missing.length && !extra.length) {
    ok(`the appearance menu lists exactly the ${released.length} appearances the registry releases`);
  } else {
    fail(`the appearance menu and the registry's released set disagree — missing ${missing.join(", ") || "nothing"}; unexpected ${extra.join(", ") || "nothing"}`);
  }
  const erasSource = readFileSync(path.join(siteRoot, "js", "eras.js"), "utf8");
  const lineSource = erasSource.slice(erasSource.indexOf("export const ERAS"), erasSource.indexOf("export const BRANCHES"));
  const branchSource = erasSource.slice(erasSource.indexOf("export const BRANCHES"));
  const branches = [...branchSource.matchAll(/\bid:\s*"([a-z-]+)"/g)].map((match) => match[1]).filter((id) => released.includes(id));
  const onLine = branches.filter((id) => lineSource.includes(`id: "${id}"`));
  const menuTail = index.slice(index.lastIndexOf('data-appearance="liquid-glass"'));
  const grouped = branches.every((id) => /menu-sep[^]*?data-appearance="/.test(menuTail) && menuTail.includes(`data-appearance="${id}"`));
  if (branches.includes("nextstep") && !onLine.length && grouped && index.includes('id="branch"')) {
    ok(`the branch appearance (${branches.join(", ")}) stays off the 1988-2026 line, in its own menu group and scene`);
  } else {
    fail("NeXTSTEP must be a branch: listed in BRANCHES not ERAS, after a separator in the Special menu, with its #branch scene");
  }
}
// The floppies scene states how many disks ship, and that sentence is the only
// place on the public page where the number appears. It read "thirty-four"
// while nothing counted anything, so a thirty-fifth disk would have made the
// page wrong in silence. The count is read from the generated index — the same
// module the app's own folder loads — rather than from the sources, so the
// number here is the published one.
{
  const diskIndex = readFileSync(path.join(root, "apps", "desktop", "app", "content", "shared-project-disks-index.js"), "utf8");
  // One `exportedAt` per disk: the module is a single object literal keyed by
  // route, so `route: "…"` never appears.
  const shipped = Number((diskIndex.match(/"exportedAt"/g) || []).length);
  const words = { 10: "ten", 20: "twenty", 30: "thirty", 40: "forty", 50: "fifty" };
  const tens = words[Math.floor(shipped / 10) * 10];
  const ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][shipped % 10];
  const spelled = shipped % 10 ? `${tens}-${ones}` : tens;
  if (shipped > 0 && index.includes(`${spelled} finished project disks`)) {
    ok(`the floppies scene names the ${shipped} disks that actually ship`);
  } else {
    fail(`the floppies scene does not name the ${shipped} disks that ship (expected "${spelled} finished project disks")`);
  }
  if (/\/go\/dtk/.test(index) && /every window follows/.test(index)) {
    ok("and says a disk travels by the same /go/<route> rule every window uses");
  } else {
    fail("the page never states the address rule a disk travels by");
  }
}
if (index.includes('id="argument"')
  && index.includes('id="claim-list"')
  && argument.includes("const OBJECT = \"teachText\"")
  && argument.includes("[...ERAS, ...BRANCHES].map")
  && argument.includes("setEra(era.id, true)")) {
  ok("the appearance argument (seven eras and the branch) uses canonical manuscript icons and changes the live era");
} else {
  fail("the appearance argument is incomplete or detached from the live era");
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

// Unlisted pages are live but deliberately unlinked: each must ask search
// engines to stay away, and no other page may point at it, or it stops being
// unlisted the moment a crawler follows the link.
// A retired unlisted address stays retired, and it is retired by a file, not
// by an absence: Pages refreshes edge caches only for paths the new deploy
// contains, so a path that simply disappears can keep serving the old page
// from a cache for hours (seen 2026-09-23 on the TPE edge). The path keeps a
// tiny redirect home that carries nothing of what used to be there.
for (const slug of ["safufuruarua"]) {
  const page = path.join(siteRoot, slug, "index.html");
  const html = existsSync(page) ? readFileSync(page, "utf8") : "";
  if (html && /http-equiv="refresh"/.test(html) && !/crypto\.subtle|<script/i.test(html) && html.length < 1024) {
    ok(`retired unlisted page /${slug} is a bare redirect`);
  } else {
    fail(`site/${slug}/index.html must be a bare redirect with no script or content; the address was retired`);
  }
}
for (const slug of ["safufu"]) {
  const page = path.join(siteRoot, slug, "index.html");
  if (!existsSync(page)) {
    fail(`site/${slug}/index.html is missing; the unlisted page is live and must ship with every deploy`);
    continue;
  }
  const html = readFileSync(page, "utf8");
  if (/<meta name="robots" content="[^"]*noindex/.test(html)) ok(`unlisted page /${slug} asks not to be indexed`);
  else fail(`unlisted page /${slug} lost its noindex`);
  const linkers = siteTextFiles.filter((file) => file !== page && siteText.get(file).includes(slug));
  if (!linkers.length) ok(`no page links to the unlisted /${slug}`);
  else fail(`the unlisted /${slug} is linked from ${linkers.map((f) => path.relative(root, f)).join(", ")}`);
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
