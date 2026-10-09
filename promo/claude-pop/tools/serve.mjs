#!/usr/bin/env node
// The preview over http: a browser will not import ES modules (three.js) from file://. Serves the repository read-only on
// 127.0.0.1 (the page reaches ../../ for its fonts and icons, so the root is two levels above this folder).
//   node tools/serve.mjs [port]     then open http://127.0.0.1:8640/promo/claude-pop/index.html (?t=36, ?style, ?s3d)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), PORT = +process.argv[2] || 8640;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
http.createServer((req, res) => {
  let p;
  try { p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); } catch { p = ''; }
  if (req.method !== 'GET' && req.method !== 'HEAD' || !p.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(p, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end(); return; }
    const head = { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');   // ranges, so the song can be seeked
    const a = m && m[1] ? +m[1] : 0, b = m && m[2] ? +m[2] : st.size - 1;
    if (m) { if (a >= st.size || b < a) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end(); return; } head['Content-Range'] = `bytes ${a}-${b}/${st.size}`; }
    res.writeHead(m ? 206 : 200, { ...head, 'Content-Length': b - a + 1 });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(p, { start: a, end: b }).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`preview: http://127.0.0.1:${PORT}/promo/claude-pop/index.html`));
