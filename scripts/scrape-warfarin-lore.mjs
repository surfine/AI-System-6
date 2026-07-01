#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'htmlparser2';
import { getAttributeValue, textContent } from 'domutils';
import { selectAll, selectOne } from 'css-select';
import { decode } from 'entities';

const DEFAULT_BASE_URL = 'https://warfarin.wiki';
const DEFAULT_LANG = 'cn';
const DEFAULT_OUT_DIR = 'data/warfarin-lore';

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.baseUrl || DEFAULT_BASE_URL;
const lang = args.lang || DEFAULT_LANG;
const slug = args.slug || args._[0] || 'nar_document_v0d8_10_1';
const outDir = path.resolve(args.out || DEFAULT_OUT_DIR);
const concurrency = Number.parseInt(args.concurrency || '8', 10);
const all = args.all === 'true';

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await mkdir(outDir, { recursive: true });
  if (all) {
    await scrapeAllLore();
    return;
  }

  const url = new URL(`/${lang}/lore/${slug}`, baseUrl).toString();
  console.log(`Fetching lore: ${url}`);
  const html = await fetchText(url);
  const lore = parseLorePage(html, { slug, url });
  const payload = {
    source: url,
    scrapedAt: new Date().toISOString(),
    lore,
  };
  await writeLoreFiles(slug, payload);
}

async function scrapeAllLore() {
  const indexUrl = new URL(`/${lang}/lore`, baseUrl).toString();
  console.log(`Fetching lore index: ${indexUrl}`);
  const html = await fetchText(indexUrl);
  const loreEntries = parseLoreIndex(html);
  console.log(`Found ${loreEntries.length} lore entries.`);

  const scraped = await mapConcurrent(loreEntries, concurrency, async (entry, index) => {
    const n = `${index + 1}`.padStart(String(loreEntries.length).length, ' ');
    console.log(`[${n}/${loreEntries.length}] ${entry.title || entry.slug} (${entry.slug})`);
    const detailHtml = await fetchText(entry.url);
    const lore = parseLorePage(detailHtml, entry);
    await writeLoreFiles(entry.slug, {
      source: entry.url,
      scrapedAt: new Date().toISOString(),
      lore,
    });
    return lore;
  });

  const payload = {
    source: indexUrl,
    scrapedAt: new Date().toISOString(),
    count: scraped.length,
    typeCounts: countTypes(scraped),
    lore: scraped,
  };
  const jsonPath = path.join(outDir, 'lore.json');
  const mdPath = path.join(outDir, 'lore.md');
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(mdPath, renderLoreCollectionMarkdown(payload));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

async function writeLoreFiles(targetSlug, payload) {
  const jsonPath = path.join(outDir, `${targetSlug}.json`);
  const mdPath = path.join(outDir, `${targetSlug}.md`);
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(mdPath, renderMarkdown(payload));
}

function parseLoreIndex(html) {
  const doc = parseDocument(html);
  const seen = new Set();
  return selectAll(`a[href^="/${lang}/lore/"]`, doc)
    .map((anchor) => {
      const href = getAttributeValue(anchor, 'href') || '';
      const targetSlug = href.split('/').pop();
      const spans = selectAll('span', anchor)
        .map((span) => cleanText(textContent(span)))
        .filter(Boolean);
      return {
        slug: targetSlug,
        title: spans[0] || cleanText(textContent(anchor)),
        type: spans[1] || '',
        url: new URL(href, baseUrl).toString(),
      };
    })
    .filter((entry) => entry.slug && !seen.has(entry.slug) && seen.add(entry.slug));
}

function parseLorePage(html, source) {
  const doc = parseDocument(html);
  const main = selectOne('main .flex-1.max-w-5xl', doc) || selectOne('main', doc) || doc;
  const summary = selectOne('section#summary', main);
  const contents = selectOne('section#contents', main);
  const title = cleanText(textContent(selectOne('h1', summary || main) || '')) || source.title || source.slug;
  const type = cleanText(textContent(selectOne('#summary p.text-sm', main) || '')) || source.type || '';
  const sections = parseContentSections(contents);

  return {
    id: source.slug,
    title,
    type,
    url: source.url,
    sections,
    text: sections.map((entry) => [entry.title, entry.text].filter(Boolean).join('\n')).join('\n\n'),
  };
}

function parseContentSections(contents) {
  if (!contents) return [];
  const headings = selectAll('h2,h3', contents);
  if (!headings.length) {
    const paragraphs = selectAll('p', contents)
      .map((paragraph) => cleanText(textContent(paragraph)))
      .filter(Boolean);
    return paragraphs.length ? [{ title: '正文', text: paragraphs.join('\n\n') }] : [];
  }

  return headings
    .map((heading, index) => {
      const title = cleanText(textContent(heading)) || `段落 ${index + 1}`;
      const body = collectFollowingParagraphs(heading);
      return { title, text: body.join('\n\n') };
    })
    .filter((entry) => entry.text);
}

function collectFollowingParagraphs(node) {
  const paragraphs = [];
  let current = node.next;
  while (current) {
    if (current.type === 'tag' && /^(h2|h3)$/i.test(current.name)) break;
    if (current.type === 'tag') {
      for (const paragraph of selectAll('p', current)) {
        const text = cleanText(textContent(paragraph));
        if (text) paragraphs.push(text);
      }
    }
    current = current.next;
  }
  return paragraphs;
}

function countTypes(entries) {
  return entries.reduce((counts, entry) => {
    const type = entry.type || 'unknown';
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
}

function renderMarkdown(payload) {
  const entry = payload.lore;
  const lines = [
    `# ${entry.title}`,
    '',
    `Source: ${payload.source}`,
    `Scraped at: ${payload.scrapedAt}`,
    `Type: ${entry.type || 'unknown'}`,
    '',
  ];
  for (const section of entry.sections) {
    lines.push(`## ${section.title || 'Section'}`, '');
    lines.push(section.text, '');
  }
  return `${lines.join('\n')}\n`;
}

function renderLoreCollectionMarkdown(payload) {
  const lines = [
    '# Warfarin Wiki Endfield Lore',
    '',
    `Source: ${payload.source}`,
    `Scraped at: ${payload.scrapedAt}`,
    `Lore count: ${payload.count}`,
    '',
    '## Types',
    '',
  ];
  for (const [type, count] of Object.entries(payload.typeCounts || {})) {
    lines.push(`- ${type}: ${count}`);
  }
  lines.push('');
  for (const entry of payload.lore) {
    lines.push(`## ${entry.title}`, '');
    lines.push(`- ID: ${entry.id}`);
    lines.push(`- URL: ${entry.url}`);
    lines.push(`- Type: ${entry.type || 'unknown'}`);
    lines.push(`- Sections: ${entry.sections.length}`);
    if (entry.text) lines.push(`- Preview: ${entry.text.slice(0, 160).replace(/\n+/g, ' ')}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function fetchText(targetUrl) {
  const response = await fetch(targetUrl, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'AI-System-6 lore archiver (+personal-use)',
    },
  });
  if (!response.ok) throw new Error(`Request failed ${response.status} ${response.statusText}: ${targetUrl}`);
  return response.text();
}

function cleanText(value) {
  if (!value) return '';
  return decode(String(value))
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      parsed._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = 'true';
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

async function mapConcurrent(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, size) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
