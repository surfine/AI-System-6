import { readFile, writeFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const datasets = ['missions', 'operators', 'tutorials', 'lore', 'documents'];
const relativeFile = (kind) => `warfarin-${kind === 'missions' ? 'missions-lines' : kind}/${kind}.json`;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const iso = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
function texts(kind, row) {
  if (kind === 'missions') return (row.transcript || []).map(line => line.text || '').join('\n');
  if (kind === 'operators') return [row.overview?.summary || row.description || '', row.overview?.trait || '', ...['intel', 'files', 'voiceLines'].flatMap(key => (row[key] || []).map(line => line.text || ''))].join('\n');
  return (row.sections || []).map(section => section.text || '').join('\n');
}
export function validateDataset(data, kind) {
  if (!Array.isArray(data[kind]) || !data[kind].length || data.count !== data[kind].length) throw new Error(`${kind}: empty or mismatched record count`);
  if (!iso(data.scrapedAt) || !/^https:\/\//.test(data.source || '')) throw new Error(`${kind}: missing source or scrape time`);
  const ids = new Set();
  for (const row of data[kind]) {
    if (typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id)) throw new Error(`${kind}: empty or duplicate id`);
    ids.add(row.id);
    if (kind === 'missions' && !Array.isArray(row.transcript)) throw new Error(`${kind}: missing transcript array`);
    if (kind !== 'missions' && kind !== 'operators' && !Array.isArray(row.sections)) throw new Error(`${kind}: missing sections array`);
  }
  if (!data[kind].some(row => texts(kind, row).trim())) throw new Error(`${kind}: no usable body text`);
}
export function mergeDataset(previous, fresh, kind, commonMeta) {
  validateDataset(previous, kind);
  validateDataset(fresh, kind);
  const freshVersion = fresh.gameVersion || (new URL(fresh.source).hostname === 'warfarin.wiki' && new URL(commonMeta.source).hostname === 'warfarin.wiki' ? commonMeta.gameVersion : '');
  if (!freshVersion) throw new Error(`${kind}: upstream version is unknown`);
  const old = new Map(previous[kind].map(row => [row.id, row]));
  const report = { added: [], updated: [], unchanged: [], retained: [] };
  const kept = (row, reason) => {
    report.retained.push({ id: row.id, reason });
    return { ...row, version: row.version || row.gameVersion || previous.gameVersion || 'unknown', scrapedAt: row.scrapedAt || previous.scrapedAt };
  };
  const rows = fresh[kind].map(row => {
    const prior = old.get(row.id);
    old.delete(row.id);
    const body = texts(kind, row).trim();
    const priorBody = prior ? texts(kind, prior).trim() : '';
    if (priorBody && !body) return kept(prior, 'empty-upstream-body');
    if (priorBody.length > 200 && body.length < priorBody.length / 2) return kept(prior, 'body-shrank-over-half');
    report[!prior ? 'added' : JSON.stringify(row) === JSON.stringify(prior) ? 'unchanged' : 'updated'].push(row.id);
    const aliases = kind === 'missions' ? [...new Set([...(prior?.searchAliases || []), ...['title', 'chapter', 'process'].map(key => prior?.[key] && prior[key] !== row[key] ? prior[key] : '').filter(Boolean)])] : [];
    return { ...row, ...(aliases.length ? { searchAliases: aliases } : {}), version: row.version || row.gameVersion || freshVersion, scrapedAt: row.scrapedAt || fresh.scrapedAt };
  });
  for (const row of old.values()) rows.push(kept(row, 'absent-from-upstream-index'));
  const dates = rows.map(row => row.scrapedAt).filter(iso).sort();
  const data = { ...fresh, gameVersion: freshVersion, lastUpdated: fresh.lastUpdated || commonMeta.lastUpdated || '',
    versionSource: fresh.gameVersion ? fresh.source : commonMeta.source,
    scrapedAt: dates[0] || fresh.scrapedAt, refreshedAt: fresh.scrapedAt, count: rows.length, [kind]: rows,
    contentNote: `Refreshed ${fresh[kind].length} upstream records; retained ${report.retained.length} prior records with their original version and scrape time.`,
  };
  if (fresh.typeCounts) data.typeCounts = rows.reduce((counts, row) => { counts[row.type || 'unknown'] = (counts[row.type || 'unknown'] || 0) + 1; return counts; }, {});
  return { data, report: { ...report, previousCount: previous[kind].length, upstreamCount: fresh[kind].length, outputCount: rows.length } };
}
export async function prepareRefresh({ previousRoot, stagingRoot, outRoot }) {
  previousRoot = path.resolve(previousRoot); stagingRoot = path.resolve(stagingRoot); outRoot = path.resolve(outRoot);
  const overlaps = (a, b) => a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
  if (overlaps(outRoot, previousRoot) || overlaps(outRoot, stagingRoot)) throw new Error('Output must be separate from both inputs');
  if (await stat(outRoot).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('Output directory already exists');
  const commonMeta = JSON.parse(await readFile(path.join(stagingRoot, 'missions/missions.json'), 'utf8'));
  const outputs = [];
  const receipt = { checkedAt: new Date().toISOString(), datasets: {} };
  for (const kind of datasets) {
    const before = await readFile(path.join(previousRoot, relativeFile(kind)));
    const staged = await readFile(path.join(stagingRoot, kind, `${kind}.json`));
    const { data, report } = mergeDataset(JSON.parse(before), JSON.parse(staged), kind, commonMeta);
    const output = JSON.stringify(data, null, 2) + '\n';
    outputs.push({ file: relativeFile(kind), output });
    receipt.datasets[kind] = { ...report, previousSha256: hash(before), upstreamSha256: hash(staged), outputSha256: hash(output) };
  }
  // Validate every input before creating anything. Publish only a complete new directory.
  const temporary = `${outRoot}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(temporary, { recursive: false });
  try {
    for (const { file, output } of outputs) {
      await mkdir(path.dirname(path.join(temporary, file)), { recursive: true });
      await writeFile(path.join(temporary, file), output);
    }
    await writeFile(path.join(temporary, 'refresh-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    await rename(temporary, outRoot);
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
  return receipt;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const option = (key) => { const i = process.argv.indexOf(key); if (i < 0 || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error(`Required: ${key}`); return process.argv[i + 1]; };
  try {
    const receipt = await prepareRefresh({ previousRoot: option('--previous'), stagingRoot: option('--staging'), outRoot: option('--out') });
    for (const [kind, report] of Object.entries(receipt.datasets)) console.log(`${kind}: ${report.previousCount} → ${report.outputCount}; added ${report.added.length}, retained ${report.retained.length}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
