import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../vendor/tinyjs/', import.meta.url));
const baseline = JSON.parse(await readFile(path.join(root, 'baselines.json')));
if (baseline.commit !== '2ea9f0ef7e83a4962adaaa78d4590c412e9f87a9' || baseline.version !== 'v0.50.1') throw new Error('Unknown TinyJS pin');
async function visit(folder, prefix = '') {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (name === 'baselines.json') continue;
    if (entry.isDirectory()) await visit(path.join(folder, entry.name), name + '/');
    else if (!entry.isFile() || !baseline.files[name]) throw new Error('Uncontrolled TinyJS file: ' + name);
  }
}
await visit(root);
for (const [name, expected] of Object.entries(baseline.files)) {
  const actual = createHash('sha256').update(await readFile(path.join(root, name))).digest('hex');
  if (actual !== expected) throw new Error('TinyJS upstream bytes changed: ' + name);
}
console.log('TinyJS fixed upstream SHA-256 baseline passed.');
