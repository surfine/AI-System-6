#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'htmlparser2';
import { getAttributeValue, textContent } from 'domutils';
import { selectAll, selectOne } from 'css-select';
import { decode } from 'entities';

const DEFAULT_BASE_URL = 'https://warfarin.wiki';
const DEFAULT_LANG = 'cn';
const DEFAULT_OUT_DIR = 'data/warfarin-tutorials';

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.baseUrl || DEFAULT_BASE_URL;
const lang = args.lang || DEFAULT_LANG;
const slug = args.slug || args._[0] || 'wiki_tut_adv_camp';
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
    await scrapeAllTutorials();
    return;
  }

  const url = new URL(`/${lang}/tutorials/${slug}`, baseUrl).toString();
  console.log(`Fetching tutorial: ${url}`);
  const html = await fetchText(url);
  const tutorial = parseTutorialPage(html, { slug, url });
  const payload = {
    source: url,
    scrapedAt: new Date().toISOString(),
    tutorial,
  };
  await writeTutorialFiles(slug, payload);
}

async function scrapeAllTutorials() {
  const indexUrl = new URL(`/${lang}/tutorials`, baseUrl).toString();
  console.log(`Fetching tutorial index: ${indexUrl}`);
  const html = await fetchText(indexUrl);
  const tutorials = parseTutorialIndex(html);
  console.log(`Found ${tutorials.length} tutorials.`);

  const scraped = await mapConcurrent(tutorials, concurrency, async (entry, index) => {
    const n = `${index + 1}`.padStart(String(tutorials.length).length, ' ');
    console.log(`[${n}/${tutorials.length}] ${entry.title || entry.slug} (${entry.slug})`);
    const detailHtml = await fetchText(entry.url);
    const tutorial = parseTutorialPage(detailHtml, entry);
    await writeTutorialFiles(entry.slug, {
      source: entry.url,
      scrapedAt: new Date().toISOString(),
      tutorial,
    });
    return tutorial;
  });

  const payload = {
    source: indexUrl,
    scrapedAt: new Date().toISOString(),
    count: scraped.length,
    tutorials: scraped,
  };
  const jsonPath = path.join(outDir, 'tutorials.json');
  const mdPath = path.join(outDir, 'tutorials.md');
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(mdPath, renderTutorialsMarkdown(payload).replace(/[ \t]+$/gm, ''));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

async function writeTutorialFiles(targetSlug, payload) {
  const jsonPath = path.join(outDir, `${targetSlug}.json`);
  const mdPath = path.join(outDir, `${targetSlug}.md`);
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(mdPath, renderMarkdown(payload).replace(/[ \t]+$/gm, ''));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

function parseTutorialIndex(html) {
  const doc = parseDocument(html);
  const seen = new Set();
  return selectAll(`a[href^="/${lang}/tutorials/"]`, doc)
    .map((anchor) => {
      const href = getAttributeValue(anchor, 'href') || '';
      const slug = href.split('/').pop();
      const spans = selectAll('span', anchor).map((span) => cleanText(textContent(span))).filter(Boolean);
      return {
        slug,
        title: spans[0] || cleanText(textContent(anchor)),
        type: spans[1] || '',
        url: new URL(href, baseUrl).toString(),
      };
    })
    .filter((entry) => entry.slug && !seen.has(entry.slug) && seen.add(entry.slug));
}

function parseTutorialPage(html, source) {
  const doc = parseDocument(html);
  const main = selectOne('main .flex-1.max-w-5xl', doc) || selectOne('main', doc) || doc;
  const summary = selectOne('section#summary', main);
  const title = cleanText(textContent(selectOne('h1', summary || main) || '')) || source.title || source.slug;
  const type = cleanText(textContent(selectOne('#summary p.text-sm', main) || '')) || source.type || '';
  const section = selectOne('section#tutorials', main);
  const blocks = section ? selectAll(':scope > div > div', section) : [];
  const sections = blocks
    .map((block, index) => {
      const heading = cleanText(textContent(selectOne('h2', block) || '')) || (index === 0 ? '概要' : '');
      const paragraphs = selectAll('p', block)
        .map((paragraph) => cleanText(textContent(paragraph)))
        .filter(Boolean);
      return {
        title: heading,
        text: paragraphs.join('\n\n'),
      };
    })
    .filter((entry) => entry.text);

  return {
    id: source.slug,
    title,
    type,
    url: source.url,
    sections,
    text: sections.map((entry) => [entry.title, entry.text].filter(Boolean).join('\n')).join('\n\n'),
  };
}

function renderMarkdown(payload) {
  const tutorial = payload.tutorial;
  const lines = [
    `# ${tutorial.title}`,
    '',
    `Source: ${payload.source}`,
    `Scraped at: ${payload.scrapedAt}`,
    `Type: ${tutorial.type || 'unknown'}`,
    '',
  ];
  for (const section of tutorial.sections) {
    lines.push(`## ${section.title || 'Section'}`, '');
    lines.push(section.text, '');
  }
  return `${lines.join('\n')}\n`;
}

function renderTutorialsMarkdown(payload) {
  const lines = [
    '# Warfarin Wiki Endfield Tutorials',
    '',
    `Source: ${payload.source}`,
    `Scraped at: ${payload.scrapedAt}`,
    `Tutorial count: ${payload.count}`,
    '',
  ];
  for (const tutorial of payload.tutorials) {
    lines.push(`## ${tutorial.title}`, '');
    lines.push(`- ID: ${tutorial.id}`);
    lines.push(`- URL: ${tutorial.url}`);
    lines.push(`- Type: ${tutorial.type || 'unknown'}`);
    lines.push(`- Sections: ${tutorial.sections.length}`);
    if (tutorial.text) lines.push(`- Preview: ${tutorial.text.slice(0, 160).replace(/\n+/g, ' ')}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function fetchText(targetUrl) {
  const response = await fetch(targetUrl, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'AI-System-6 tutorial archiver (+personal-use)',
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
