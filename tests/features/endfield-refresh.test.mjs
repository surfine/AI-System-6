import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mergeDataset, prepareRefresh, datasets } from '../../tooling/prepare-endfield-refresh.mjs';
const oldTime = '2026-09-03T00:00:00Z', newTime = '2026-10-08T00:00:00Z';
const meta = {source: 'https://warfarin.wiki/cn/missions', scrapedAt: newTime, gameVersion: 'v1.5'};
const record = (id, text) => ({id, transcript: [{text}], sections: [{text}], description: text});
const old = { ...meta, scrapedAt: oldTime, count: 2, missions: [record('shared', '保留正文'), {...record('skland:one', '官方补充'), version: 'v1.4'}] };
const fresh = { ...meta, count: 2, missions: [record('shared', ''), record('new', '新对白')] };
const merged = mergeDataset(old, fresh, 'missions', meta);
assert.equal(merged.data.count, 3);
assert.equal(merged.data.scrapedAt, oldTime);
assert.equal(merged.data.refreshedAt, newTime);
assert.deepEqual(merged.data.missions.find(row => row.id === 'shared').transcript, [{text: '保留正文'}]);
assert.equal(merged.data.missions.find(row => row.id === 'skland:one').version, 'v1.4');
assert.equal(merged.data.missions.find(row => row.id === 'skland:one').scrapedAt, oldTime);
const renamed = mergeDataset({...old, count:1, missions:[{...record('same', '正文'), chapter:'雾隐冬梦深林中'}]}, {...fresh, count:1, missions:[{...record('same','正文'), chapter:'A Winter Dream'}]}, 'missions', meta);
assert.deepEqual(renamed.data.missions[0].searchAliases, ['雾隐冬梦深林中']);
assert.throws(() => mergeDataset(old, {...fresh, missions: [record('same', 'a'), record('same', 'b')]}, 'missions', meta), /duplicate/);
assert.throws(() => mergeDataset(old, {...fresh, missions: [record('a', ''), record('b', '')]}, 'missions', meta), /no usable/);
const dir = await mkdtemp(path.join(os.tmpdir(), 'endfield-refresh-test-'));
try {
  const previousRoot = path.join(dir, 'before'), stagingRoot = path.join(dir, 'stage'), outRoot = path.join(dir, 'out');
  for (const kind of datasets) {
    const rel = `warfarin-${kind === 'missions' ? 'missions-lines' : kind}`;
    await mkdir(path.join(previousRoot, rel), {recursive:true}); await mkdir(path.join(stagingRoot, kind), {recursive:true});
    const payload = {...meta, count: 1, [kind]: [record('one', '测试正文')]};
    await writeFile(path.join(previousRoot, rel, `${kind}.json`), JSON.stringify(payload));
    await writeFile(path.join(stagingRoot, kind, `${kind}.json`), JSON.stringify(kind === 'documents' ? {...payload, count: 99} : payload));
  }
  await assert.rejects(prepareRefresh({previousRoot, stagingRoot, outRoot}), /mismatched/);
  await assert.rejects(access(outRoot));
  await writeFile(path.join(stagingRoot, 'documents/documents.json'), JSON.stringify({...meta, count:1, documents:[record('one','测试正文')]}));
  const receipt = await prepareRefresh({previousRoot, stagingRoot, outRoot});
  assert.equal(Object.keys(receipt.datasets).length, 5);
  assert.match(receipt.datasets.missions.outputSha256, /^[a-f0-9]{64}$/);
  await assert.rejects(prepareRefresh({previousRoot, stagingRoot, outRoot}), /already exists/);
  await assert.rejects(prepareRefresh({previousRoot, stagingRoot, outRoot: previousRoot}), /separate/);
} finally { await rm(dir, {recursive:true, force:true}); }
console.log('Endfield refresh: retention, provenance, corruption rejection and all-or-nothing staging passed.');
