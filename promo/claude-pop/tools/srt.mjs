#!/usr/bin/env node
// Writes the subtitles from the same timeline the picture uses (data/data.js), with the Chinese from
// data/lyrics-zh.json: build/pen-pal.zh-en.srt (Chinese over English) and build/pen-pal.zh.srt.
// Lines that start together (lead and gang, chant and la-la) share one cue; a cue ends where the next begins.
//
//   node tools/srt.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data/data.js'), 'utf8') + '\nthis.LYRICS = LYRICS;', ctx);
const zh = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lyrics-zh.json'), 'utf8'));

const cues = [];
for (const l of [...ctx.LYRICS].sort((a, b) => a.start - b.start)) {
  const last = cues[cues.length - 1];
  if (last && l.start - last.start < 0.06) {
    if (!last.texts.includes(l.text)) last.texts.push(l.text);
    last.end = Math.max(last.end, l.end);
  } else cues.push({ start: l.start, end: l.end, texts: [l.text] });
}
cues.forEach((c, i) => { const next = cues[i + 1]; c.end = Math.max(c.start + 0.5, c.end + 0.25); if (next) c.end = Math.min(c.end, next.start - 0.02); });

const missing = [...new Set(cues.flatMap(c => c.texts))].filter(t => !(t in zh));
if (missing.length) { console.error('no Chinese for:\n' + missing.join('\n')); process.exit(1); }
const stamp = s => { const ms = Math.round(s * 1000), p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(ms / 3600000 | 0)}:${p(ms / 60000 % 60 | 0)}:${p(ms / 1000 % 60 | 0)},${p(ms % 1000, 3)}`; };
const write = (name, body) => { const out = path.join(ROOT, 'build', name); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, body); console.log(out, cues.length + ' cues'); };
const srt = lines => cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${lines(c).join('\n')}\n`).join('\n');
write('pen-pal.zh-en.srt', srt(c => [c.texts.map(t => zh[t]).join('　'), c.texts.join('  ')]));
write('pen-pal.zh.srt', srt(c => [c.texts.map(t => zh[t]).join('　')]));
