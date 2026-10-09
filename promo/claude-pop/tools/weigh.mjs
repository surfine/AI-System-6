#!/usr/bin/env node
// Weighs the film: every file it is made from (score, synthesiser, drawing code, page; the
// Markdown notes are reported but not counted, since the film is not made from them), and writes data/weight.js so the end card can show the real number. Rendered audio, video,
// downloaded voices and installed modules are not source and are not counted. Run it last,
// after every source change, right before rendering.
//
//   node tools/weigh.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SKIP_DIRS = new Set(['build', '.cache', 'node_modules', '__pycache__']);
const SKIP_FILES = new Set(['data/weight.js', 'package-lock.json']);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name), rel = path.relative(ROOT, abs).split(path.sep).join('/');
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(abs); continue; }
    if (SKIP_FILES.has(rel) || !/\.(js|mjs|py|json|html|md|sh)$/.test(e.name)) continue;
    files.push({ rel, bytes: fs.statSync(abs).size });
  }
})(ROOT);
files.sort((a, b) => a.rel.localeCompare(b.rel));
const sum = re => files.filter(f => re.test(f.rel)).reduce((n, f) => n + f.bytes, 0);
const weight = {
  bytes: sum(/\.(js|mjs|py|html|sh|json)$/),
  files: files.filter(f => !f.rel.endsWith('.md')).length,
  code: sum(/\.(js|mjs|py|html|sh)$/),
  words: sum(/\.md$/),
  data: sum(/\.json$/),
  floppy: 1474560,
};
fs.writeFileSync(path.join(ROOT, 'data/weight.js'),
  `// Written by tools/weigh.mjs: the byte count of this film's own source. Do not edit.\nconst WEIGHT = ${JSON.stringify(weight)};\n`);
console.log(weight);
