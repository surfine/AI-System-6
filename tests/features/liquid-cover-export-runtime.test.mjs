import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../../apps/desktop/app/features/liquid-cover.js', import.meta.url), 'utf8');
const actualExport = source.slice(source.indexOf('  let pngExportInFlight = false;'), source.indexOf('\n  function pickVideoMime()'));
function fixture({ blob = { type: 'image/png' }, saveError = false } = {}) {
  const events = [], saved = [];
  let encodeDone;
  const canvas = { width: 1280, height: 720, toBlob(cb) { encodeDone = () => cb(blob); events.push('encode'); } };
  const button = { disabled: false };
  const context = vm.createContext({
    canvas, renderScale: 1, EXPORT_W: 1280, EXPORT_H: 720, DESIGN_W: 1280, DESIGN_H: 720,
    renderer: { gl: { MAX_TEXTURE_SIZE: 1, getParameter: () => 4096 }, render() { events.push('render'); } },
    liquid: { frozen: false, energy: 0, last: 0, frameId: 0, hold: false, seed: 1, scripted: null },
    wakeLiquid: () => events.push('wake'),
    exportTargetDims: () => ({ scale: 2, w: 2560, h: 1440 }),
    drawingBufferFits: () => true,
    $: () => button, tr: (_key, fallback) => fallback,
    setBusy(_button, busy) { button.disabled = busy; events.push(busy ? 'busy' : 'idle'); },
    aiStatusText: message => events.push(message), aiStatus: (...args) => events.push(args.join(':')),
    requestAnimationFrame: cb => queueMicrotask(cb), setTimeout,
    rebuildAllSDF: () => events.push('sdf'), readParams: () => ({}), renderNow: () => events.push('preview'),
    updateThumbnailPreview: () => events.push('thumbnail'),
    applyAspect(w, h) { canvas.width = w; canvas.height = h; context.renderScale = 1; },
    async downloadBlob(result, name) { if (saveError) throw new Error('Save failed'); saved.push({ result, name, w: canvas.width, h: canvas.height }); },
  });
  vm.runInContext(actualExport + '\nthis.exportPng = exportPng;', context);
  return { context, events, saved, canvas, button, liquid: context.liquid, finishEncode: () => encodeDone() };
}
async function reachEncoding(f) {
  for (let n = 0; n < 30 && !f.events.includes('encode'); n++) await new Promise(r => setTimeout(r, 1));
  assert.ok(f.events.includes('encode'));
}
test('PNG export rejects overlapping requests, waits for encoding and restores artboard after save', async () => {
  const f = fixture();
  const first = f.context.exportPng();
  assert.equal(f.button.disabled, true);
  assert.equal(f.liquid.hold, true, 'liquid loop is held while the export occupies the renderer');
  assert.equal(f.events.includes('sdf'), false, 'busy state gets a paint opportunity');
  await f.context.exportPng();
  await reachEncoding(f);
  assert.equal(f.events.filter(e => e === 'encode').length, 1);
  assert.equal(f.saved.length, 0);
  f.finishEncode(); await first;
  assert.equal(f.saved[0].name, 'liquid-glass-2560x1440.png');
  assert.deepEqual([f.saved[0].w, f.saved[0].h], [2560, 1440]);
  assert.deepEqual([f.canvas.width, f.canvas.height, f.button.disabled], [1280, 720, false]);
  assert.equal(f.liquid.hold, false, 'liquid loop is released once the export finishes');
});

for (const failure of [{ blob: null }, { saveError: true }]) {
  test('PNG failure restores canvas and allows retry: ' + JSON.stringify(failure), async () => {
    const f = fixture(failure); const first = f.context.exportPng();
    assert.equal(f.liquid.hold, true);
    await reachEncoding(f); f.finishEncode(); await first;
    assert.equal(f.saved.length, 0);
    assert.deepEqual([f.canvas.width, f.canvas.height, f.button.disabled], [1280, 720, false]);
    assert.equal(f.liquid.hold, false, 'failed export still releases the liquid loop');
    assert.ok(f.events.some(e => e.startsWith('error:')));
    const again = f.context.exportPng(); await reachEncoding(f); await new Promise(r => setTimeout(r, 10));
    f.finishEncode(); await again;
    assert.equal(f.events.filter(e => e === 'encode').length, 2);
  });
}
