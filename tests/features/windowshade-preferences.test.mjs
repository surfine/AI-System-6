import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
const source = readFileSync(new URL("../../apps/desktop/app/core/windowshade-preferences.js", import.meta.url), "utf8");
function setup(stored) {
  const storage = new Map(stored ? [["ai-system-6-windowshade-preferences", stored]] : []);
  const h = createAppBootVm({ localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  } });
  const timers = new Map(); let serial = 0;
  h.context.setTimeout = (fn, delay) => { const id = ++serial; timers.set(id, { fn, delay }); return id; };
  h.context.clearTimeout = (id) => timers.delete(id);
  return { h, api: h.context.AISystem6WindowShadePreferences, timers };
}
test("defaults, corruption, persistence and actual control-panel changes", () => {
  const { h, api } = setup('{broken');
  assert.equal(api.get('dockHoverPreview'), true);
  assert.equal(api.get('edgeSlideOver'), true);
  api.set('dockHoverPreview', false);
  assert.equal(JSON.parse(h.context.localStorage.getItem('ai-system-6-windowshade-preferences')).dockHoverPreview, false);
  const anchor = h.document.createElement('div'); anchor.className = 'liquid-tint-field'; h.document.body.append(anchor);
  api.syncFields();
  const input = h.document.getElementById('windowshade-edgeSlideOver');
  assert.equal(input.checked, true);
  input.checked = false; input.dispatchEvent(new h.context.Event('change'));
  assert.equal(api.get('edgeSlideOver'), false);
  h.run(source);
  assert.equal(h.context.AISystem6WindowShadePreferences, api, "repeat script evaluation retains the original control bindings and API");
  const restarted = setup(h.context.localStorage.getItem("ai-system-6-windowshade-preferences"));
  assert.equal(restarted.api.get('edgeSlideOver'), false, "a fresh boot reads the durable control choice");
});
test("hover waits 350 ms, cancels stale loading, and yields until leave", async () => {
  const { h, api, timers } = setup();
  const calls = []; let resolveLoad;
  h.context.AISystem6WindowBrowse = { open: options => calls.push(options), closeHover: owner => calls.push(['close', owner]), hoverLeave: owner => calls.push(['leave', owner]) };
  h.context.ensureLazySystemModule = () => new Promise(resolve => { resolveLoad = resolve; });
  const node = h.document.createElement('button'); h.document.body.append(node);
  api.bindDockHover(node, 'quickDraft');
  const fire = type => node.dispatchEvent(new h.context.Event(type));
  fire('pointerenter');
  assert.equal([...timers.values()].at(-1).delay, 350);
  const pending = [...timers.values()].at(-1).fn();
  fire('contextmenu'); resolveLoad(); await pending;
  assert.equal(calls.filter(call => call.appId).length, 0);
  const count = timers.size; fire('pointerenter'); assert.equal(timers.size, count);
  fire('pointerleave'); fire('pointerenter');
  const ready = [...timers.values()].at(-1).fn(); resolveLoad(); await ready;
  assert.equal(calls.at(-1).appId, 'quickDraft');
  assert.equal(calls.at(-1).returnFocus, false);
  assert.equal(calls.at(-1).anchor, node);
  fire('dragstart'); assert.equal(calls.at(-1)[0], 'close');
  fire('pointerleave'); assert.equal(calls.at(-1)[0], 'leave');
  api.set('dockHoverPreview', false); const before = timers.size;
  fire('pointerenter'); assert.equal(timers.size, before);
});
test("menu key, detached icons, and preference changes invalidate pending previews", async () => {
  const { h, api, timers } = setup();
  let opened = 0; let resolveLoad;
  h.context.AISystem6WindowBrowse = { open: () => opened++, closeHover: () => {} };
  h.context.ensureLazySystemModule = () => new Promise(resolve => { resolveLoad = resolve; });
  const node = h.document.createElement('button'); h.document.body.append(node);
  api.bindDockHover(node, 'assistant');
  const fire = type => node.dispatchEvent(new h.context.Event(type));
  fire('pointerenter');
  const keyboard = new h.context.Event('keydown'); keyboard.key = 'ContextMenu';
  node.dispatchEvent(keyboard);
  assert.equal(timers.size, 0);
  fire('pointerleave'); fire('pointerenter');
  let pending = [...timers.values()].at(-1).fn();
  // The boot shim stores isConnected as a field instead of deriving it.
  node.remove(); node.isConnected = false; resolveLoad(); await pending;
  assert.equal(opened, 0);
  h.document.body.append(node); node.isConnected = true; fire('pointerleave'); fire('pointerenter');
  pending = [...timers.values()].at(-1).fn();
  api.set('dockHoverPreview', false); resolveLoad(); await pending;
  assert.equal(opened, 0);
});
test("existing Dock switches receive the late bilingual language sweep", async () => {
  const { h } = setup();
  await h.settleBoot();
  h.context.t = key => key;
  h.run(readFileSync(new URL('../../apps/desktop/app/core/window-minimize.js', import.meta.url), 'utf8'));
  const labels = ['dock-visible', 'minimize-enabled'].map(id => h.document.getElementById(id)?.nextElementSibling);
  assert.ok(labels.every(Boolean));
  assert.deepEqual(labels.map(label => label.textContent), ['show_dock', 'minimize_windows_setting']);
  for (const [language, expected] of [['en', ['Show Dock', 'Allow minimizing windows']], ['zh', ['显示 Dock', '允许最小化窗口']]]) {
    h.run(readFileSync(new URL(`../../apps/desktop/app/data/translations-${language}.js`, import.meta.url), 'utf8'));
    const table = h.context[language === 'en' ? 'AISystem6TranslationsEn' : 'AISystem6TranslationsZh'];
    h.context.t = key => table[key] || key;
    h.context.applyLanguage();
    assert.deepEqual(labels.map(label => label.textContent), expected);
  }
});
test("36 Dock bindings capture only the selected hover and reject old lazy and picture results", async () => {
  const { h, api, timers } = setup();
  await h.settleBoot();
  timers.clear();
  const captures = []; const pictureResolvers = new Map();
  const entries = Array.from({ length: 36 }, (_, index) => ({ name: `dense-${index}`, appId: `app-${index}`, title: `Window ${index}`, state: 'open' }));
  entries.push({ name: 'dense-extra', appId: 'app-35', title: 'Second window', state: 'open' });
  h.context.windowBrowseEntries = () => entries;
  h.context.getWindow = name => ({ dataset: { window: name } });
  h.context.AISystem6WindowPreview = { get: win => {
    const name = win.dataset.window; captures.push(name);
    return new Promise(resolve => pictureResolvers.set(name, resolve));
  } };
  h.run(readFileSync(new URL('../../apps/desktop/app/features/window-browse.js', import.meta.url), 'utf8'));
  const pendingLoads = [];
  h.context.ensureLazySystemModule = () => new Promise(resolve => pendingLoads.push(resolve));
  const icons = Array.from({ length: 36 }, (_, index) => {
    const node = h.document.createElement('button'); h.document.body.append(node);
    api.bindDockHover(node, `app-${index}`); return node;
  });
  const fire = (node, type) => node.dispatchEvent(new h.context.Event(type));
  const nextIntent = () => [...timers].find(([, timer]) => timer.delay === 350);
  const runIntent = () => { const [id, timer] = nextIntent(); timers.delete(id); return timer.fn(); };
  fire(icons[0], 'pointerenter'); const oldLoad = runIntent();
  for (let index = 0; index < 35; index++) {
    fire(icons[index], 'pointerleave'); fire(icons[index + 1], 'pointerenter');
    assert.equal([...timers.values()].filter(timer => timer.delay === 350).length, 1, 'rapid traversal keeps only current intent timer');
  }
  const lastLoad = runIntent();
  pendingLoads[1](); await lastLoad;
  pendingLoads[0](); await oldLoad;
  assert.deepEqual(captures, ['dense-35'], 'only selected window is captured, not the other 36 windows');
  fire(icons[35], 'pointerleave'); fire(icons[34], 'pointerenter');
  const newerLoad = runIntent(); pendingLoads[2](); await newerLoad;
  assert.deepEqual(captures, ['dense-35', 'dense-34']);
  pictureResolvers.get('dense-34')({ url: 'data:image/png;base64,new', stale: false });
  await Promise.resolve(); await Promise.resolve();
  pictureResolvers.get('dense-35')({ url: 'data:image/png;base64,old', stale: false });
  await Promise.resolve(); await Promise.resolve();
  const image = h.document.querySelector('.window-browse-preview img');
  assert.equal(image.src, 'data:image/png;base64,new', 'late previous capture cannot replace current picture');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(captures.length, 2, 'idle hover performs no additional capture');
  assert.equal([...timers.values()].filter(timer => timer.delay === 350).length, 0, 'hover does not reschedule capture intent');
  h.context.AISystem6WindowBrowse.close();
});
