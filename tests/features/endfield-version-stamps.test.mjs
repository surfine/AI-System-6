import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { findEndfieldStoryMatches } from '../../functions/_lib/endfield.mjs';
const require = createRequire(import.meta.url);
const { buildEndfieldMissionLines, decorateEndfieldLines } = require('../../apps/server/server/endfield.js');
const mission = { id: 'one', title: '版本样本', version: 'v1.6', transcript: [{text: '版本样本甲', version: 'v1.4'}, {text: '版本样本乙'}] };
const data = { source: 'https://warfarin.wiki/cn/missions', gameVersion: 'v1.5', missions: [mission, {id: 'two', title: '版本样本', transcript: [{text: '版本样本丙'}]}] };
assert.deepEqual(buildEndfieldMissionLines(data).map(row => row.version), ['v1.4', 'v1.6', 'v1.5']);
assert.equal(buildEndfieldMissionLines({ missions: [{id: 'unknown', transcript: [{text: '未知'}]}] })[0].version, '');
assert.deepEqual(decorateEndfieldLines([{version: 'v1.4'}, {}], '教学', 'v1.5').map(row => row.version), ['v1.4', 'v1.5']);
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  const key = /\/([^/]+)\.json$/.exec(String(url))[1];
  return new Response(JSON.stringify(key === 'missions' ? data : { [key]: [] }));
};
try {
  const response = await findEndfieldStoryMatches('版本样本', 10, 'https://example.test/');
  const versions = Object.fromEntries(response.results.map(row => [row.text, row.version]));
  assert.deepEqual(versions, {'版本样本甲': 'v1.4', '版本样本乙': 'v1.6', '版本样本丙': 'v1.5'});
} finally { globalThis.fetch = originalFetch; }
console.log('Endfield version stamps: explicit line/record, dataset fallback, unknown and Pages search passed.');
