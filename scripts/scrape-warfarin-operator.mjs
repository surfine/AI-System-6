#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'htmlparser2';
import { getAttributeValue, textContent } from 'domutils';
import { selectAll, selectOne } from 'css-select';
import { decode } from 'entities';

const DEFAULT_BASE_URL = 'https://warfarin.wiki';
const DEFAULT_LANG = 'cn';
const DEFAULT_OUT_DIR = 'data/warfarin-operators';

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.baseUrl || DEFAULT_BASE_URL;
const lang = args.lang || DEFAULT_LANG;
const slug = args.slug || args._[0] || 'zhuang-fangyi';
const outDir = path.resolve(args.out || DEFAULT_OUT_DIR);
const concurrency = Number.parseInt(args.concurrency || '6', 10);
const all = args.all === 'true';
const url = new URL(`/${lang}/operators/${slug}`, baseUrl).toString();

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await mkdir(outDir, { recursive: true });
  if (all) {
    await scrapeAllOperators();
    return;
  }

  console.log(`Fetching operator: ${url}`);
  const html = await fetchText(url);
  const operator = parseOperatorPage(html, { slug, url });
  const payload = {
    source: url,
    scrapedAt: new Date().toISOString(),
    operator,
  };

  const jsonPath = path.join(outDir, `${slug}.json`);
  const mdPath = path.join(outDir, `${slug}.md`);
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(mdPath, renderMarkdown(payload));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

async function scrapeAllOperators() {
  const indexUrl = new URL(`/${lang}/operators`, baseUrl).toString();
  console.log(`Fetching operator index: ${indexUrl}`);
  const html = await fetchText(indexUrl);
  const operators = parseOperatorIndex(html);
  console.log(`Found ${operators.length} operators.`);

  const scraped = await mapConcurrent(operators, concurrency, async (entry, index) => {
    const n = `${index + 1}`.padStart(String(operators.length).length, ' ');
    console.log(`[${n}/${operators.length}] ${entry.name || entry.slug} (${entry.slug})`);
    const detailHtml = await fetchText(entry.url);
    const operator = parseOperatorPage(detailHtml, entry);
    await writeOperatorFiles(entry.slug, {
      source: entry.url,
      scrapedAt: new Date().toISOString(),
      operator,
    });
    return operator;
  });

  const payload = {
    source: indexUrl,
    scrapedAt: new Date().toISOString(),
    count: scraped.length,
    operators: scraped,
  };
  const jsonPath = path.join(outDir, 'operators.json');
  const mdPath = path.join(outDir, 'operators.md');
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(mdPath, renderOperatorsMarkdown(payload));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

async function writeOperatorFiles(targetSlug, payload) {
  const jsonPath = path.join(outDir, `${targetSlug}.json`);
  const mdPath = path.join(outDir, `${targetSlug}.md`);
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(mdPath, renderMarkdown(payload));
}

function parseOperatorIndex(html) {
  const doc = parseDocument(html);
  const seen = new Set();
  return selectAll(`a[href^="/${lang}/operators/"]`, doc)
    .map((anchor) => {
      const href = getAttributeValue(anchor, 'href') || '';
      const targetSlug = href.split('/').pop();
      const name = cleanText(textContent(selectOne('span', anchor) || anchor));
      const icon = getAttributeValue(selectOne('img[src]', anchor), 'src') || '';
      return {
        slug: targetSlug,
        name: name.replace(/★+/g, '').trim(),
        url: new URL(href, baseUrl).toString(),
        icon,
      };
    })
    .filter((entry) => entry.slug && !seen.has(entry.slug) && seen.add(entry.slug));
}

function parseOperatorPage(html, source) {
  const doc = parseDocument(html);
  const main = selectOne('main .flex-1.max-w-5xl', doc) || selectOne('main', doc) || doc;
  const header = sectionById(main, 'overview');
  const overview = findSectionByHeading(main, '总览');
  const title = cleanText(textContent(selectOne('h1', header || main) || ''));
  const ogImage = getAttributeValue(selectOne('meta[property="og:image"]', doc), 'content') || '';
  const description = getAttributeValue(selectOne('meta[name="description"]', doc), 'content') || '';

  return {
    id: source.slug,
    name: title,
    url: source.url,
    icon: ogImage,
    description,
    overview: parseOverview(overview),
    intel: parseCards(sectionById(main, 'intel')),
    files: parseCards(sectionById(main, 'files')),
    voiceLines: parseVoiceLines(sectionById(main, 'dialogue')),
    artwork: parseArtwork(sectionById(main, 'snapshots')),
  };
}

function sectionById(root, id) {
  return selectOne(`section#${id}`, root);
}

function findSectionByHeading(root, heading) {
  return selectAll('section', root).find((section) => {
    const h2 = selectOne('h2', section);
    return h2 && cleanText(textContent(h2)) === heading;
  });
}

function parseOverview(section) {
  if (!section) return {};
  const fields = {};
  const voiceActors = {};

  const tables = selectAll('table', section);
  readKeyValueTable(tables[0], fields);
  readKeyValueTable(tables[1], voiceActors);

  return {
    name: fields['名字'] || '',
    englishName: fields['英语名字'] || '',
    summary: fields['简介'] || '',
    trait: fields['特点'] || '',
    rarity: fields['稀有度'] || '',
    weapon: fields['武器'] || '',
    element: fields['元素'] || '',
    class: fields['职业'] || '',
    primaryAttribute: fields['主属性'] || '',
    secondaryAttribute: fields['副属性'] || '',
    voiceActors,
  };
}

function readKeyValueTable(table, target) {
  if (!table) return;
  for (const row of selectAll('tr', table)) {
    const cells = selectAll('th,td', row)
      .map((cell) => cleanText(textContent(cell)))
      .filter(Boolean);
    if (!cells.length || cells.length === 1) continue;
    for (let i = 0; i < cells.length - 1; i += 2) {
      target[cells[i]] = cells[i + 1];
    }
  }
}

function parseCards(section) {
  if (!section) return [];
  return selectAll('h3', section)
    .map((heading) => {
      const card = closestAncestor(heading, (node) => node.name === 'div' && hasCardText(node));
      const title = cleanText(textContent(heading));
      const bodyNode = selectOne('.whitespace-pre-line', card) || selectOne('p', card);
      const text = cleanText(textContent(bodyNode || ''));
      return { title, text };
    })
    .filter((entry) => entry.title && entry.text);
}

function parseVoiceLines(section) {
  if (!section) return [];
  return selectAll('li', section)
    .map((item) => {
      const spans = selectAll('span', item).map((span) => cleanText(textContent(span))).filter(Boolean);
      return {
        label: spans[0] || '',
        text: spans.slice(1).join('\n'),
        language: 'CN',
      };
    })
    .filter((entry) => entry.label && entry.text);
}

function parseArtwork(section) {
  if (!section) return [];
  return selectAll('img[src]', section)
    .map((img) => ({
      src: getAttributeValue(img, 'src') || '',
      alt: getAttributeValue(img, 'alt') || '',
    }))
    .filter((image, index, images) => image.src && images.findIndex((item) => item.src === image.src) === index);
}

function renderMarkdown(payload) {
  const op = payload.operator;
  const lines = [
    `# ${op.name}`,
    '',
    `Source: ${payload.source}`,
    `Scraped at: ${payload.scrapedAt}`,
    '',
    '## Overview',
    '',
    `- English name: ${op.overview.englishName || 'unknown'}`,
    `- Rarity: ${op.overview.rarity || 'unknown'}`,
    `- Element/Class: ${[op.overview.element, op.overview.class].filter(Boolean).join(' / ') || 'unknown'}`,
    `- Weapon: ${op.overview.weapon || 'unknown'}`,
    `- Main attributes: ${[op.overview.primaryAttribute, op.overview.secondaryAttribute].filter(Boolean).join(' / ') || 'unknown'}`,
  ];

  if (op.overview.summary) lines.push(`- Summary: ${op.overview.summary}`);
  if (op.overview.trait) lines.push(`- Trait: ${op.overview.trait}`);
  if (Object.keys(op.overview.voiceActors || {}).length) {
    lines.push('', '### Voice Actors', '');
    for (const [lang, actor] of Object.entries(op.overview.voiceActors)) {
      lines.push(`- ${lang}: ${actor}`);
    }
  }

  appendEntries(lines, 'Operator Intel', op.intel);
  appendEntries(lines, 'Files', op.files);
  appendEntries(lines, 'Voice Lines', op.voiceLines.map((entry) => ({ title: entry.label, text: entry.text })));

  if (op.artwork.length) {
    lines.push('', '## Artwork', '');
    for (const image of op.artwork) {
      lines.push(`- ${image.alt || 'image'}: ${image.src}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function renderOperatorsMarkdown(payload) {
  const lines = [
    '# Warfarin Wiki Endfield Operators',
    '',
    `Source: ${payload.source}`,
    `Scraped at: ${payload.scrapedAt}`,
    `Operator count: ${payload.count}`,
    '',
  ];

  for (const op of payload.operators) {
    lines.push(`## ${op.name}`, '');
    lines.push(`- ID: ${op.id}`);
    lines.push(`- URL: ${op.url}`);
    lines.push(`- English name: ${op.overview.englishName || 'unknown'}`);
    lines.push(`- Rarity: ${op.overview.rarity || 'unknown'}`);
    lines.push(`- Element/Class: ${[op.overview.element, op.overview.class].filter(Boolean).join(' / ') || 'unknown'}`);
    lines.push(`- Intel entries: ${op.intel.length}`);
    lines.push(`- File entries: ${op.files.length}`);
    lines.push(`- Voice lines: ${op.voiceLines.length}`);
    if (op.overview.summary) lines.push(`- Summary: ${op.overview.summary}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function appendEntries(lines, title, entries) {
  if (!entries.length) return;
  lines.push('', `## ${title}`, '');
  for (const entry of entries) {
    lines.push(`### ${entry.title}`, '');
    lines.push(entry.text, '');
  }
}

async function fetchText(targetUrl) {
  const response = await fetch(targetUrl, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'AI-System-6 operator archiver (+personal-use)',
    },
  });
  if (!response.ok) throw new Error(`Request failed ${response.status} ${response.statusText}: ${targetUrl}`);
  return response.text();
}

function closestAncestor(node, predicate) {
  let current = node;
  while (current) {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return node;
}

function hasCardText(node) {
  return !!selectOne('.whitespace-pre-line, p', node);
}

function cleanText(value) {
  if (!value) return '';
  return decode(String(value))
    .replace(/\r\n?/g, '\n')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\t/g, '\t')
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
