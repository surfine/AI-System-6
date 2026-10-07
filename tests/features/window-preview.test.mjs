import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
const source = readFileSync(new URL('../../apps/desktop/app/core/window-preview.js', import.meta.url), 'utf8');
function setup(capture) {
  const classes = new Set();
  const win = { isConnected: true, classList: { contains: (key) => classes.has(key) } };
  let calls = 0;
  const scope = { window: { AISystem6WindowMinimize: { captureDomWindowBitmap: (...args) => { calls++; return capture(...args); } } } };
  runInNewContext(source, scope);
  return { api: scope.window.AISystem6WindowPreview, win, classes, calls: () => calls };
}
test('real capture cached for hidden states without invoking capture or changing state', async () => {
  const h = setup(async () => ({ source: 'dom', dataUrl: 'data:real' }));
  assert.equal((await h.api.get(h.win)).url, 'data:real');
  for (const state of ['is-app-hidden', 'is-collapsed', 'is-minimized', 'is-slide-hidden']) {
    h.classes.add(state);
    const picture = await h.api.get(h.win);
    assert.equal(picture.url, 'data:real');
    assert.equal(picture.stale, true);
    assert.ok(h.classes.has(state));
    h.classes.delete(state);
  }
  assert.equal(h.calls(), 1);
});
test('deduplicates pending capture; cancellation and close discard late pictures', async () => {
  let resolve;
  const h = setup(() => new Promise((done) => { resolve = done; }));
  const first = h.api.get(h.win);
  assert.equal(h.api.get(h.win), first);
  h.api.cancel(h.win);
  resolve({ source: 'dom', dataUrl: 'data:late' });
  assert.equal((await first).url, null);
  const second = h.api.get(h.win);
  h.win.isConnected = false;
  resolve({ source: 'dom', dataUrl: 'data:closed' });
  assert.equal((await second).url, null);
  assert.equal((await h.api.get(h.win)).url, null);
});
test('never accepts schematic paint and returns an honest unavailable result', async () => {
  const h = setup(async () => ({ source: 'schematic', dataUrl: 'data:fake' }));
  assert.equal((await h.api.get(h.win)).unavailable, true);
  h.classes.add('is-minimized');
  assert.equal((await h.api.get(h.win)).url, null);
  assert.equal(h.calls(), 1);
});
test('release forgets memory-only picture and failed capture retains previous picture', async () => {
  let fails = false;
  const h = setup(async () => { if (fails) throw Error('blocked'); return { source: 'dom', dataUrl: 'data:first' }; });
  await h.api.get(h.win);
  fails = true;
  assert.equal((await h.api.get(h.win)).stale, true);
  h.api.release(h.win);
  assert.equal((await h.api.get(h.win)).unavailable, true);
});


test('closing and reopening the same DOM node cannot adopt the old capture', async () => {
  const jobs = [];
  const h = setup(() => new Promise((done) => jobs.push(done)));
  const old = h.api.get(h.win);
  h.classes.add('is-hidden');
  h.api.release(h.win);
  h.classes.delete('is-hidden');
  const current = h.api.get(h.win);
  jobs[1]({ source: 'dom', dataUrl: 'data:new-lifetime' });
  assert.equal((await current).url, 'data:new-lifetime');
  jobs[0]({ source: 'dom', dataUrl: 'data:old-lifetime' });
  assert.equal((await old).url, null);
  h.classes.add('is-slide-hidden');
  assert.equal((await h.api.get(h.win)).url, 'data:new-lifetime');
  assert.equal(h.calls(), 2);
});

import { createAppBootVm } from '../helpers/app-boot-vm.mjs';
const minimizeSource = readFileSync(new URL('../../apps/desktop/app/core/window-minimize.js', import.meta.url), 'utf8');
const captureSource = minimizeSource.slice(minimizeSource.indexOf('  function captureDomWindowBitmap('), minimizeSource.indexOf('  // Eager stand-in paint'));
test('DOM capture styles all descendants, resets root geometry, keeps form values and scroll crop', async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  const create = h.document.createElement;
  function copyTree(node) {
    const copy = create(node.tagName);
    // Browser CSSStyleDeclaration parses a single cssText assignment. The boot
    // shim is a plain property bag, so model that parser at this boundary.
    Object.defineProperty(copy.style, 'cssText', { configurable: true, set(value) {
      for (const declaration of value.split(';')) {
        const at = declaration.indexOf(':');
        if (at > 0) copy.style[declaration.slice(0, at)] = declaration.slice(at + 1);
      }
    } });
    copy.textContent = node.textContent;
    for (const child of node.children) copy.append(copyTree(child));
    return copy;
  }
  const win = create('section');
  win.getBoundingClientRect = () => ({ width: 600, height: 400, left: 200, top: 90 });
  win.style.transform = 'matrix(1, 0, 0, 1, 80, 50)';
  win.style.position = 'fixed';
  win.style.backgroundColor = 'rgb(255, 255, 255)';
  let deep = win;
  for (let i = 0; i < 9; i++) { const child = create('div'); child.style.display = 'flex'; child.style['flex-grow'] = String(i); deep.append(child); deep = child; }
  for (let i = 0; i < 30; i++) { const child = create('button'); child.style.color = `rgb(${i}, 0, 0)`; deep.append(child); }
  const field = create('textarea'); field.value = 'unsaved words'; deep.append(field);
  const scroller = create('div'); scroller.scrollTop = 72; const content = create('div'); content.style.transform = 'none'; scroller.append(content); win.append(scroller);
  win.cloneNode = () => copyTree(win);
  let serialized;
  let fill;
  const requestedProperties = [];
  h.context.getComputedStyle = (node) => {
    const names = Object.keys(node.style);
    return { length: names.length, item: (i) => names[i], getPropertyValue: (key) => { requestedProperties.push(key); return node.style[key] || ''; }, backgroundColor: node.style.backgroundColor, display: 'block' };
  };
  h.context.XMLSerializer = class { serializeToString(node) { serialized = node; return '<div></div>'; } };
  h.context.Image = class { set src(_) { Promise.resolve().then(() => this.onload()); } };
  h.document.createElement = (tag) => tag === 'canvas' ? { getContext: () => ({ set fillStyle(value) { fill = value; }, fillRect() {}, drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,abcdefghijklmnopqrstuvwxyz' } : create(tag);
  h.run(captureSource + '\nglobalThis.captureUnderTest = captureDomWindowBitmap;');
  assert.equal((await h.context.captureUnderTest(win)).source, 'dom');
  assert.equal(serialized.style.position, 'relative');
  assert.equal(serialized.style.transform, 'none');
  assert.equal(serialized.style.width, '600px');
  let clonedDeep = serialized; for (let i = 0; i < 9; i++) clonedDeep = clonedDeep.children[0];
  assert.equal(clonedDeep.style['flex-grow'], '8');
  assert.equal(clonedDeep.children[29].style.color, 'rgb(29, 0, 0)');
  assert.equal(clonedDeep.children[30].textContent, 'unsaved words');
  assert.equal(serialized.children[1].style.overflow, 'hidden');
  assert.match(serialized.children[1].children[0].style.transform, /translate\(0px, -72px\)/);
  assert.equal(win.style.transform, 'matrix(1, 0, 0, 1, 80, 50)');
  assert.equal(scroller.scrollTop, 72);
  assert.equal(fill, 'rgb(255, 255, 255)');
  assert.ok(requestedProperties.length < 120 * 44, 'capture reads a bounded painting/layout set per node');
  assert.ok(!requestedProperties.some((key) => key.startsWith('--')), 'resolved style capture does not duplicate theme custom properties');
  const canvas = create('canvas'); canvas.getBoundingClientRect = () => ({ width: 40, height: 30 }); win.append(canvas);
  assert.equal(await h.context.captureUnderTest(win), null);
  canvas.remove();
  const query = win.querySelectorAll.bind(win);
  win.querySelectorAll = (selector) => selector === '*' ? { length: 1201 } : query(selector);
  assert.equal(await h.context.captureUnderTest(win), null);
  win.querySelectorAll = query;
  let elapsed = 0;
  h.context.performance = { now: () => { elapsed += 100; return elapsed; } };
  assert.equal(await h.context.captureUnderTest(win), null);
});
