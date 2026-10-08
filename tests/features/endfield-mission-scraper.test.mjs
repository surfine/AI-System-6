import assert from 'node:assert/strict';
import { parseMissionDetail } from '../../tooling/scrape-warfarin-missions.mjs';

const turn = (name, text) => `<div class="py-4"><div title="${name}"><img src="portrait.png"><span class="font-semibold">${name[0]}</span></div><div class="font-bold">${name}</div><div title="au_audio_id"><button>Play</button></div><p>${text}</p></div>`;
const narration = '<div class="py-4"><div title="au_narration"><button>Play</button></div><p>风吹过空地。</p></div>';
const page = (heading, body) => `<main><section><h1>测试任务</h1><p>摘要</p></section><section><h2>任务目标</h2><ul><li>前往基地</li></ul></section><section><h2>${heading}</h2>${body}</section></main>`;
const current = parseMissionDetail(page('对话', `<div data-slot="card"><div>dlg_scene_id</div><div class="divide-y">${turn('甲', '第一句')}${narration}${turn('乙', '第二句')}</div></div>`), {});
assert.deepEqual(current.objectives, ['前往基地']);
assert.deepEqual(current.transcript.map(({speaker, text}) => ({speaker, text})), [
  {speaker: '甲', text: '第一句'}, {speaker: '', text: '风吹过空地。'}, {speaker: '乙', text: '第二句'},
]);
assert.equal(current.transcript.some(line => /au_|dlg_|Play/.test(line.text + line.speaker)), false);
const legacy = parseMissionDetail(page('Transcript', `<div data-slot="card">${turn('甲', '旧版对白')}</div>`), {});
assert.equal(legacy.transcript[0].speaker, '甲');
assert.equal(legacy.transcript[0].text, '旧版对白');
const withRadio = parseMissionDetail(page('对话', `<div data-slot="card">${turn('甲', '现场对白')}</div>`).replace('</main>', `<section><h2>无线电</h2><div data-slot="card"><div class="divide-y">${turn('乙', '无线电通话')}</div></div></section></main>`), {});
assert.deepEqual(withRadio.transcript.map(line => [line.speaker, line.text, line.channel || 'dialogue']), [['甲', '现场对白', 'dialogue'], ['乙', '无线电通话', 'radio']]);
assert.deepEqual(parseMissionDetail(page('对话', ''), {}).transcript, []);
console.log('Endfield mission scraper: Chinese/English headings, per-turn speakers, narration and empty sections passed.');
