#!/usr/bin/env node

// Did the DeepSeek manual move?
//
// The product's cloud behaviour is written against api-docs.deepseek.com, and
// that manual changes without asking: a model id was retired, a price table
// was rewritten, images moved to a different model. Reading the whole site by
// hand found four drifts in one pass, which is not a sustainable way to keep
// up. This tool captures the manual into internal/references/deepseek-docs/
// and refuses when the live site no longer matches the capture.
//
// Usage:
//   node tooling/deepseek-docs-watch.mjs                 # check for drift (exit 1 on drift)
//   node tooling/deepseek-docs-watch.mjs --update        # capture the manual as it is now
//   node tooling/deepseek-docs-watch.mjs --json          # machine-readable report
//   node tooling/deepseek-docs-watch.mjs --page <slug>   # print one captured page
//   node tooling/deepseek-docs-watch.mjs --hints 40      # hint lines per changed page
//
// This one needs the network, so it is deliberately not part of verify:release
// or verify:quick. The weekly automation runs it, and the capture contract that
// can run offline lives in tests/features/deepseek-docs-watch.test.mjs.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  DOCS_EN_SITEMAP,
  DOCS_ORIGIN,
  DOCS_ZH_SITEMAP,
  SNAPSHOT_DIR,
  buildSnapshotIndex,
  compareIndexes,
  diffHints,
  extractArticleText,
  hasDrift,
  sha256Hex,
  slugForUrl,
  sitemapUrls,
  urlsForLocale,
} from "./lib/deepseek-docs.mjs";
import { repositoryRoot } from "./lib/paths.mjs";

const args = process.argv.slice(2);
const wantsJson = args.includes("--json");
const wantsUpdate = args.includes("--update");
const pageFlag = args.indexOf("--page");
const requestedPage = pageFlag >= 0 ? String(args[pageFlag + 1] || "") : "";
const hintsFlag = args.indexOf("--hints");
const hintLimit = hintsFlag >= 0 ? Math.max(1, Number(args[hintsFlag + 1]) || 20) : 20;
const FETCH_CONCURRENCY = 6;
const FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 20000;

const snapshotRoot = join(repositoryRoot, SNAPSHOT_DIR);
const indexPath = join(snapshotRoot, "index.json");
const pagesRoot = join(snapshotRoot, "pages");

function readIndex() {
  try {
    return JSON.parse(readFileSync(indexPath, "utf8"));
  } catch {
    return null;
  }
}

async function fetchText(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "ai-system6-deepseek-docs-watch/1" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => { setTimeout(resolve, 400 * attempt); });
    }
  }
  throw lastError || new Error(`${url} could not be read`);
}

/**
 * Fetch a list of URLs with a small pool, so a weekly run is quick without
 * hammering the docs site.
 *
 * @param {Array<{ key: string, url: string }>} jobs
 * @returns {Promise<Map<string, string>>}
 */
async function fetchAll(jobs) {
  const results = new Map();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      results.set(job.key, await fetchText(job.url));
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * @returns {Promise<{ index: any, pages: Map<string, string> }>}
 */
async function captureManual() {
  const [zhSitemap, enSitemap] = await Promise.all([fetchText(DOCS_ZH_SITEMAP), fetchText(DOCS_EN_SITEMAP)]);
  const zhUrls = urlsForLocale(sitemapUrls(zhSitemap), "zh");
  const enUrls = urlsForLocale(sitemapUrls(enSitemap), "en");
  if (!zhUrls.length) throw new Error("The Chinese sitemap listed no pages; refusing to capture an empty manual.");

  const pageBodies = await fetchAll(
    zhUrls.map((url) => ({ key: slugForUrl(url), url }))
  );
  const enBodies = await fetchAll(enUrls.map((url) => ({ key: url, url })));

  /** @type {Map<string, string>} */
  const pages = new Map();
  const pageEntries = [];
  for (const url of zhUrls) {
    const slug = slugForUrl(url);
    const text = extractArticleText(pageBodies.get(slug) || "");
    pages.set(slug, text);
    pageEntries.push({ slug, url, sha256: sha256Hex(text), bytes: Buffer.byteLength(text, "utf8") });
  }

  const index = buildSnapshotIndex({
    captured: new Date().toISOString().slice(0, 10),
    sitemaps: {
      "zh-cn": { url: DOCS_ZH_SITEMAP, sha256: sha256Hex(zhSitemap) },
      en: { url: DOCS_EN_SITEMAP, sha256: sha256Hex(enSitemap) },
    },
    pages: pageEntries,
    english: enUrls.map((url) => ({ url, sha256: sha256Hex(extractArticleText(enBodies.get(url) || "")) })),
  });
  return { index, pages };
}

function writeCapture(result) {
  mkdirSync(pagesRoot, { recursive: true });
  for (const [slug, text] of result.pages) {
    // Written exactly as captured: the file's own bytes are what index.json
    // hashes, so a capture can be checked without re-declaring a newline rule.
    writeFileSync(join(pagesRoot, `${slug}.txt`), text, "utf8");
  }
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, `${JSON.stringify(result.index, null, 2)}\n`, "utf8");
}

function readCapturedPage(slug) {
  try {
    return readFileSync(join(pagesRoot, `${slug}.txt`), "utf8");
  } catch {
    return null;
  }
}

function report(drift, hints) {
  const lines = [];
  for (const slug of drift.changed) {
    lines.push(`CHANGED  ${slug}`);
    const before = readCapturedPage(slug) || "";
    for (const line of hints.get(slug)?.removed || []) lines.push(`  - ${line}`);
    for (const line of hints.get(slug)?.added || []) lines.push(`  + ${line}`);
  }
  for (const slug of drift.added) lines.push(`ADDED    ${slug}`);
  for (const slug of drift.removed) lines.push(`REMOVED  ${slug}`);
  if (drift.englishChanged.length) {
    lines.push(`English text moved on ${drift.englishChanged.length} page(s) whose Chinese text did not:`);
    for (const url of drift.englishChanged.slice(0, 10)) lines.push(`  ~ ${url}`);
  }
  for (const url of drift.englishAdded) lines.push(`ADDED (en)    ${url}`);
  for (const url of drift.englishRemoved) lines.push(`REMOVED (en)  ${url}`);
  return lines;
}

async function main() {
  if (requestedPage) {
    const text = readCapturedPage(requestedPage);
    if (text === null) {
      console.error(`No captured page named ${requestedPage}.`);
      process.exit(2);
    }
    process.stdout.write(text);
    return;
  }

  const previous = readIndex();
  const captured = await captureManual();
  const drift = compareIndexes(previous, captured.index);

  if (wantsUpdate) {
    writeCapture(captured);
    const moved = report(drift, new Map());
    if (moved.length && previous) {
      console.log("Captured the live manual; it moved since the last capture:");
      for (const line of moved) console.log(line);
    }
    console.log(`Captured ${captured.index.pageCount} pages from ${DOCS_ORIGIN} into ${SNAPSHOT_DIR}.`);
    return;
  }

  if (!previous) {
    console.error(`No capture at ${SNAPSHOT_DIR}. Run: npm run deepseek-docs:capture`);
    process.exit(2);
  }

  const hints = new Map();
  for (const slug of drift.changed) {
    const before = readCapturedPage(slug) || "";
    const after = captured.pages.get(slug) || "";
    hints.set(slug, diffHints(before, after, { limit: hintLimit }));
  }
  const moved = report(drift, hints);
  const drifted = hasDrift(drift);

  if (wantsJson) {
    console.log(JSON.stringify({
      drifted,
      captured: previous.captured,
      checkedAt: captured.index.captured,
      drift,
      hints: Object.fromEntries(hints),
    }, null, 2));
  } else if (!drifted) {
    console.log(`DeepSeek manual unchanged since ${previous.captured} (${previous.pageCount} pages).`);
  } else {
    console.log(`DeepSeek manual moved since ${previous.captured}:`);
    for (const line of moved) console.log(line);
    console.log("");
    console.log("Read the pages above, align the product, then run: npm run deepseek-docs:capture");
  }

  if (drifted) process.exit(1);
}

main().catch((error) => {
  console.error(`DeepSeek manual check failed: ${error?.message || error}`);
  process.exit(2);
});
