import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { parse } from 'acorn';

const source = readFileSync(new URL('../../apps/desktop/app/features/liquid-cover.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
const functions = new Map(), declarations = new Map();
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration') functions.set(node.id.name, source.slice(node.start, node.end));
  if (node.type === 'VariableDeclaration') for (const d of node.declarations) if (d.id.type === 'Identifier') declarations.set(d.id.name, source.slice(d.start, d.end));
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
}
walk(ast);
const names = ['isSolidLayer', 'applyFontSelection', 'setSlider', 'applyPreset', 'recipeByKey', 'applyRecipeByName', 'thumbSampleText', 'thumbSdfFor', 'recipeRenderParams', 'renderPresetThumbs', 'syncPresetButtons', 'setActivePreset', 'onPresetClick', 'cloneLayerForHistory', 'historyControlValues', 'captureHistoryState', 'historySignature', 'updateHistoryButtons', 'beginHistory', 'commitHistory', 'runHistoryAction', 'restoreHistoryState', 'undoEditor', 'liquidModeValue', 'syncLiquidControls'];
const actual = ['PRESETS', 'HISTORY_CONTROL_IDS'].map(n => 'const ' + declarations.get(n) + ';').join('\n') + '\n' + names.map(n => {
  assert.ok(functions.has(n), 'actual production function exists: ' + n); return functions.get(n);
}).join('\n');
const plain = value => JSON.parse(JSON.stringify(value));
function fixture({ mode = 'glass', locked = false, shape = false } = {}) {
  const controls = new Map(), rasterCalls = [], thumbRenders = [];
  const layer = { id: 'lc-layer-1', name: 'Main', text: 'AI System 6', font: 'Arial', fontWeight: 800, fontSize: 125, cx: .42, cy: .3, rotation: 12, letterSpacing: 3, renderMode: mode, solidColor: '#abc123', tintColor: '#fff000', tintAlpha: 3, refThickness: 20, locked, shape: null, shapeKind: shape ? 'circle' : null };
  const sibling = { ...layer, id: 'lc-layer-2', text: 'Real caption', locked: false, renderMode: 'solid', font: 'Songti SC', solidColor: '#123456', tintColor: '#654321', shapeKind: null };
  for (const id of ['lc-light-angle','lc-light-intensity','lc-splay','lc-refraction','lc-dispersion','lc-brightness','lc-saturation','lc-blur-radius','lc-shadow-factor','lc-shadow-expand','lc-magnify','lc-merge','lc-post-blur','lc-material-mix']) controls.set(id, { value: '7' });
  const font = { value: 'Arial', options: [{ dataset: { fontAvailable: 'true' } }], selectedIndex: 0 };
  controls.set('lc-font', font);
  const noOp = () => {};
  const context = vm.createContext({
    layers: [layer, sibling], sel: 0, selectedLayerIds: new Set([layer.id]), fg: { x: .5, y: .5, scale: 1, registered: true }, glassFx: { bodyFactor: 30 }, activePresetKey: 'cover', activeBg: 0, currentBgUrl: 'real-photo', nextLayerId: 3,
    undoStack: [], redoStack: [], pendingHistory: null, historyRestoring: false, HISTORY_LIMIT: 50,
    $: id => controls.get(id), tr: (_k, fallback) => fallback, setFontStatus: noOp, refreshSystemSelectControls: noOp,
    clampNum: (n, lo, hi, fallback) => Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Number(n))) : fallback,
    rebuildAllSDF: noOp, loadLayerIntoPanel: noOp, syncValueLabels: noOp, renderNow: noOp, scheduleRender: noOp, renderLayerList: noOp, setInspectorPanel: noOp, isShapeLayer: L => !!(L.shape || L.shapeKind), applyAspect: noOp, setBgFromUrl: noOp,
    syncMaterialMixToRecipe: noOp, aiStatusText: noOp, activeAspectKey: () => '16:9', ASPECTS: { '16:9': [1280, 720] }, document: { querySelectorAll: () => [], createElement: () => ({ width: 0, height: 0 }) },
    FONT_DEFAULT: 'Arial', THUMB_W: 432, THUMB_H: 180, THUMB_DPR: 2, THUMB_FONT: 64, COVER_FONT: 170, thumbSdf: new Map(), thumbRenderer: null, thumbTimer: 0, lastStillBgSource: {}, renderer: {},
    rasterizeText(opts) { rasterCalls.push(opts); return { alpha: [255], width: 1, height: 1 }; }, alphaToSignedDistance: () => new Float32Array([-8]), smoothSDF: noOp, gaussianWeights: r => [r], validHex: value => value, hexToRgb: value => [1,3,5].map(i => parseInt(value.slice(i,i+2),16)/255),
    Renderer: class { constructor() { this.canvas = { toDataURL: () => 'data:image/png;base64,stub' }; } setBackground() {} setLayerSDF() {} render(p) { thumbRenders.push(p); } },
  });
  vm.runInContext(actual + '\nthis.findRecipe = recipeByKey;', context);
  return { context, controls, font, rasterCalls, thumbRenders, aqua: context.findRecipe('aqua') };
}
function snapshot(f) { return plain(f.context.captureHistoryState()); }
for (const mode of ['glass', 'solid']) test('Aqua converts only active ' + mode + ' text while preserving composition and sibling', () => {
  const f = fixture({ mode }), before = snapshot(f);
  f.context.onPresetClick(f.aqua);
  const L = f.context.layers[0];
  assert.equal(L.renderMode, 'glass'); assert.equal(L.font, f.aqua.p.fontFamily); assert.equal(L.fontWeight, 600);
  for (const k of ['text','name','cx','cy','fontSize','rotation','letterSpacing','solidColor']) assert.equal(L[k], before.layers[0][k], k + ' preserved');
  assert.deepEqual(plain(f.context.layers[1]), before.layers[1]);
  assert.equal(f.context.currentBgUrl, before.currentBgUrl); assert.equal(f.context.activePresetKey, 'aqua');
  assert.equal(L.tintColor, '#369dd1'); assert.equal(L.tintAlpha, 18); assert.equal(L.refThickness, 85);
  assert.equal(Number(f.controls.get('lc-refraction').value), 37.5); assert.equal(Number(f.controls.get('lc-splay').value), 80);
  assert.equal(f.context.glassFx.bodyFactor, 0); assert.equal(f.context.undoStack.length, 1);
  f.context.undoEditor(); assert.deepEqual(snapshot(f), before, 'real single-step undo restores globals, selected state and layers');
});
test('locked selected layer rejects Aqua before changing optics, preset or history', () => {
  const f = fixture({ locked: true }), before = snapshot(f);
  f.context.onPresetClick(f.aqua); assert.deepEqual(snapshot(f), before); assert.equal(f.context.undoStack.length, 0);
  f.context.applyPreset(f.aqua.p); assert.deepEqual(snapshot(f), before);
  f.context.applyRecipeByName('aqua'); assert.deepEqual(snapshot(f), before);
});
test('font switch preserves Aqua material and active preset, with unavailable and locked checks', () => {
  const f = fixture(); f.context.onPresetClick(f.aqua); const before = snapshot(f);
  f.font.value = 'Other Serif'; f.font.options[0].dataset.fontSerif = 'true';
  assert.equal(f.context.applyFontSelection(), true);
  const expected = structuredClone(before); expected.layers[0].font = 'Other Serif';
  assert.deepEqual(snapshot(f), expected, 'only font changes; no hidden gray recipe');
  f.context.undoEditor(); assert.deepEqual(snapshot(f), before);
  f.font.value = 'Missing'; f.font.options[0].dataset.fontAvailable = 'false';
  assert.equal(f.context.applyFontSelection(), false); assert.deepEqual(snapshot(f), before);
  f.context.layers[0].locked = true; const lockedBefore = snapshot(f); f.font.value = 'Other';
  assert.equal(f.context.applyFontSelection(), false); assert.deepEqual(snapshot(f), lockedBefore);
});
test('Aqua applies material to selected shape without changing font or sibling', () => {
  const f = fixture({ shape: true }), before = snapshot(f); f.context.onPresetClick(f.aqua);
  assert.equal(f.context.layers[0].font, before.layers[0].font); assert.equal(f.context.layers[0].fontWeight, before.layers[0].fontWeight);
  assert.equal(f.context.layers[0].tintColor, '#369dd1'); assert.deepEqual(plain(f.context.layers[1]), before.layers[1]);
});
test('existing cover and legacy recipes do not force serif or convert solid text', () => {
  for (const key of ['cover', 'clear', 'ios27', 'ninefive', 'aaron']) {
    const f = fixture({ mode: 'solid' }), before = snapshot(f); f.context.onPresetClick(f.context.findRecipe(key));
    for (let i=0;i<2;i++) { assert.equal(f.context.layers[i].font, before.layers[i].font); assert.equal(f.context.layers[i].renderMode, 'solid'); assert.equal(f.context.layers[i].solidColor, before.layers[i].solidColor); }
    assert.equal(f.context.layers[0].fontWeight, key === 'aaron' ? 500 : 800, 'legacy intentional weight remains');
  }
});
test('actual thumbnails use serif X and recipe optics; cache distinguishes text, weight and family', () => {
  const f = fixture(), previews = new Map();
  f.controls.set('lc-preset-row', { querySelector(selector) { const preview = { style: {}, classList: { add() {} } }; previews.set(selector, preview); return preview; } });
  f.context.renderPresetThumbs();
  const x = f.rasterCalls.find(o => o.text === 'X'); assert.ok(x); assert.equal(x.fontFamily, f.aqua.p.fontFamily); assert.equal(x.fontWeight, 600);
  const params = f.thumbRenders[0]; assert.equal(params.refraction, .75); assert.equal(params.splay, .8); assert.equal(params.tints[0][3], .18);
  const count = f.rasterCalls.length;
  f.context.thumbSdfFor('X', 600, f.aqua.p.fontFamily); assert.equal(f.rasterCalls.length, count, 'same glyph uses cached SDF');
  f.context.thumbSdfFor('X', 600, 'Arial'); f.context.thumbSdfFor('X', 700, 'Arial'); f.context.thumbSdfFor('Y', 700, 'Arial');
  assert.equal(f.rasterCalls.length, count+3, 'all three identity dimensions invalidate cache');
  assert.ok([...previews.values()].every(p => p.style.backgroundImage.includes('data:image/png')));
});
