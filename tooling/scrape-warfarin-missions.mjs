#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'htmlparser2';
import { textContent, getAttributeValue } from 'domutils';
import { selectAll, selectOne } from 'css-select';
import { decode } from 'entities';

const DEFAULT_BASE_URL = 'https://warfarin.wiki';
const DEFAULT_LANG = 'cn';
const DEFAULT_OUT_DIR = 'data/warfarin-missions';

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.baseUrl || DEFAULT_BASE_URL;
const lang = args.lang || DEFAULT_LANG;
const outDir = path.resolve(args.out || DEFAULT_OUT_DIR);
const delayMs = Number.parseInt(args.delay || '0', 10);
const limit = args.limit ? Number.parseInt(args.limit, 10) : Infinity;
const concurrency = Number.parseInt(args.concurrency || '8', 10);
const includeRadio = args['include-radio'] === 'true';

const indexUrl = new URL(`/${lang}/missions`, baseUrl).toString();

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await mkdir(outDir, { recursive: true });

  console.log(`Fetching mission index: ${indexUrl}`);
  const indexHtml = await fetchText(indexUrl);
  const index = parseMissionIndex(indexHtml);
  const selectedMissions = index.missions.slice(0, limit);

  console.log(`Found ${index.missions.length} missions. Scraping ${selectedMissions.length}.`);

  const missions = await mapConcurrent(selectedMissions, concurrency, async (mission, i) => {
    const n = `${i + 1}`.padStart(String(selectedMissions.length).length, ' ');
    console.log(`[${n}/${selectedMissions.length}] ${mission.title} (${mission.id})`);
    const html = await fetchText(mission.url);
    if (delayMs > 0) await wait(delayMs);
    return {
      ...mission,
      ...parseMissionDetail(html, mission),
    };
  });

  const payload = {
    source: indexUrl,
    scrapedAt: new Date().toISOString(),
    gameVersion: index.gameVersion,
    lastUpdated: index.lastUpdated,
    count: missions.length,
    missions,
  };

  await writeFile(path.join(outDir, 'missions.json'), `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(path.join(outDir, 'missions.md'), renderMarkdown(payload).replace(/[ \t]+$/gm, ''));

  console.log(`Wrote ${path.join(outDir, 'missions.json')}`);
  console.log(`Wrote ${path.join(outDir, 'missions.md')}`);
}

function parseMissionIndex(html) {
  const doc = parseDocument(html);
  const content = selectOne('main .flex-1.max-w-5xl', doc) || selectOne('main', doc) || doc;
  const allNodes = flatten(content);
  const missions = [];
  const seen = new Set();
  const context = {
    section: '',
    chapter: '',
    process: '',
  };

  for (const node of allNodes) {
    if (node.type !== 'tag') continue;

    if (node.name === 'h2') {
      context.section = cleanText(textContent(node));
      context.chapter = '';
      context.process = '';
      continue;
    }
    if (node.name === 'h3') {
      context.chapter = cleanText(textContent(node));
      context.process = '';
      continue;
    }
    if (node.name === 'h4') {
      context.process = cleanText(textContent(node));
      continue;
    }
    if (node.name !== 'a') continue;

    const href = getAttributeValue(node, 'href');
    if (!href || !new RegExp(`^/${lang}/missions/[^#?]+$`).test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);

    const title = cleanText(textContent(selectOne('span', node) || node));
    const summary = cleanText(textContent(selectOne('p', node) || ''));
    const url = new URL(href, baseUrl).toString();

    missions.push({
      id: href.split('/').pop(),
      title,
      summary,
      url,
      section: context.section,
      chapter: context.chapter,
      process: context.process,
    });
  }

  return {
    gameVersion: extractLabeledValue(doc, '当前版本') || '',
    lastUpdated: extractLabeledValue(doc, '最后更新') || '',
    missions,
  };
}

function parseMissionDetail(html, indexMission) {
  const doc = parseDocument(html);
  const content = selectOne('main .flex-1.max-w-5xl', doc) || selectOne('main', doc) || doc;
  const h1 = selectOne('h1', content);
  const sections = selectAll('section', content);
  const introSection = sections[0];
  const warningText = 'warfarin.wiki 的剧情阅读器仍在开发中';
  const description = firstText(
    selectAll('p', introSection || content)
      .map((node) => cleanText(textContent(node)))
      .filter((value) => value && value !== '任务' && !value.includes(warningText))
  );

  return {
    title: cleanText(textContent(h1 || '')) || indexMission.title,
    description: description || indexMission.summary,
    objectives: parseObjectives(findSection(sections, 'Objectives')),
    transcript: parseDialogueSection(findSection(sections, 'Transcript')),
    ...(includeRadio ? { radio: parseDialogueSection(findSection(sections, 'Radio')) } : {}),
  };
}

function parseObjectives(section) {
  if (!section) return [];
  return selectAll('li', section)
    .map((node) => cleanText(textContent(node)))
    .filter(Boolean);
}

function parseDialogueSection(section) {
  if (!section) return [];

  const cards = selectAll('[data-slot="card"]', section);
  if (!cards.length) {
    return sectionTextLines(section).map((text) => ({ speaker: '', initial: '', text }));
  }

  return cards.flatMap((card) => {
    const portrait = selectOne('[title]', card);
    const nameNode = selectOne('.font-bold', card);
    const initialNode = selectOne('.font-semibold', card);
    const lineNodes = selectAll('p', card);
    const speaker = cleanText(textContent(nameNode || '')) || (portrait ? getAttributeValue(portrait, 'title') : '') || '';
    const initial = cleanText(textContent(initialNode || ''));

    return lineNodes
      .map((node) => cleanText(textContent(node)))
      .filter(Boolean)
      .map((text) => ({ speaker, initial, text }));
  }).filter((entry) => entry.speaker || entry.text);
}

function findSection(sections, heading) {
  return sections.find((section) => {
    const h2 = selectOne('h2', section);
    return h2 && cleanText(textContent(h2)) === heading;
  });
}

function sectionTextLines(section) {
  if (!section) return [];
  const h2 = selectOne('h2', section);
  const heading = h2 ? cleanText(textContent(h2)) : '';
  return cleanText(textContent(section))
    .split('\n')
    .map(cleanText)
    .filter((line) => line && line !== heading);
}

function extractLabeledValue(root, label) {
  const text = cleanText(textContent(root));
  const valuePattern = label === '当前版本' ? '(v\\s*[\\d.]+)' : '(\\d{4}-\\d{2}-\\d{2})';
  const match = text.match(new RegExp(`${escapeRegExp(label)}:\\s*${valuePattern}`));
  return match ? cleanText(match[1]) : '';
}

function renderMarkdown(payload) {
  const lines = [
    '# Warfarin Wiki Endfield Missions',
    '',
    `Source: ${payload.source}`,
    `Scraped at: ${payload.scrapedAt}`,
    `Game version: ${payload.gameVersion || 'unknown'}`,
    `Last updated: ${payload.lastUpdated || 'unknown'}`,
    `Mission count: ${payload.count}`,
    '',
  ];

  for (const mission of payload.missions) {
    lines.push(`## ${mission.title}`);
    lines.push('');
    lines.push(`- ID: ${mission.id}`);
    lines.push(`- URL: ${mission.url}`);
    if (mission.section) lines.push(`- Section: ${mission.section}`);
    if (mission.chapter) lines.push(`- Chapter: ${mission.chapter}`);
    if (mission.process) lines.push(`- Process: ${mission.process}`);
    if (mission.description) lines.push(`- Description: ${mission.description}`);
    if (mission.objectives.length) {
      lines.push('', '### Objectives', '');
      for (const objective of mission.objectives) lines.push(`- ${objective}`);
    }
    if (mission.transcript.length) {
      lines.push('', '### Transcript', '');
      renderDialogue(lines, mission.transcript);
    }
    if (mission.radio?.length) {
      lines.push('', '### Radio', '');
      renderDialogue(lines, mission.radio);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function renderDialogue(lines, entries) {
  for (const entry of entries) {
    const speaker = entry.speaker || 'Unknown';
    lines.push(`**${speaker}**`);
    lines.push('');
    lines.push(entry.text);
    lines.push('');
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'accept': 'text/html,application/xhtml+xml',
      'user-agent': 'AI-System-6 story archiver (+personal-use)',
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${response.statusText}: ${url}`);
  }
  return response.text();
}

function cleanText(value) {
  if (!value) return '';
  return decode(String(value))
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function flatten(node) {
  const result = [];
  const stack = [node];
  while (stack.length) {
    const current = stack.shift();
    if (!current) continue;
    result.push(current);
    if (current.children) stack.unshift(...current.children);
  }
  return result;
}

function firstText(values) {
  return values.find(Boolean) || '';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
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
