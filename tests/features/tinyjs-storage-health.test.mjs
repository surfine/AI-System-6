import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createFeatureTest, read } from '../helpers/feature-test-harness.mjs';
import { fakeAppDb, memoryStorage } from '../helpers/fake-app-db.mjs';
const test = createFeatureTest('tinyjs-storage-health');
const state = new Map([
  ['projects', new Map([['p', { id: 'p', name: 'Saved Project', draft: 'original' }]])],
  ['keyval', new Map([['settings', { theme: 'classic', localModelReady: false, startupOpenedWindowNames: ['projects'] }],
    ['documentRevisions:p:d', [{ body: 'prior version' }]], ['__ai_system6_write_fence__', { epoch: 1 }],
    ['storageVersion', '1'], ['workingSession:v3:project:p', { windows: [] }]])],
  ['imageAttachments', new Map([['image', { id: 'image', bytes: new Blob(['original image']) }]])],
]);
let prefs = '', failedRead = false;
const appDb = fakeAppDb(state, { failRead: () => failedRead });
const session = memoryStorage();
const context = vm.createContext({
  window: { AISystem6StorageTransactions: { transactionDone: async () => {} } },
  localStorage: { getItem: () => prefs }, sessionStorage: session, indexedDB: appDb.indexedDB,
  crypto: webcrypto, TextEncoder, Blob, Date, DOMException, setTimeout,
  t: (key) => key,
  openAppDb: async () => appDb.connection(),
});
// The module the bootstrap inlines and the desk loads before the adapter.
vm.runInContext(read('app/core/storage-fingerprint.js'), context);
vm.runInContext(read('app/core/tinyjs-shell.js'), context);
const fingerprint = () => context.window.AISystem6TinyShell.fingerprint();
const baseline = await fingerprint(); assert.match(baseline, /^[a-f0-9]{64}$/);
// The previous app's updater compares this value byte for byte, so the
// algorithm is frozen: this is what the shipped 1.0.58 adapter (143fdf743)
// computes for the same fixture.
assert.equal(baseline, "d0f985c6752b48f9aeaae40f6a6b18fbcc22dc1eb98774236bbf8af9e155ce25");
const keyval = state.get('keyval');
keyval.set('__ai_system6_write_fence__', { epoch: 20 }); keyval.set('storageVersion', '20');
keyval.set('workingSession:v3:project:p', { windows: ['scrapbook'] });
keyval.get('settings').localModelReady = true; keyval.get('settings').startupOpenedWindowNames = [];
assert.equal(await fingerprint(), baseline);
keyval.get('settings').theme = 'aqua'; assert.notEqual(await fingerprint(), baseline); keyval.get('settings').theme = 'classic';
keyval.set('documentRevisions:p:d', [{ body: 'changed history' }]); assert.notEqual(await fingerprint(), baseline);
keyval.set('documentRevisions:p:d', [{ body: 'prior version' }]);
state.get('imageAttachments').get('image').bytes = new Blob(['changed image']); assert.notEqual(await fingerprint(), baseline);
state.get('imageAttachments').get('image').bytes = new Blob(['original image']);
prefs = JSON.stringify({ clipboard: true, hotkey: 'cmd+shift+k' }); assert.notEqual(await fingerprint(), baseline);
prefs = ''; assert.equal(await fingerprint(), baseline);
failedRead = true; await assert.rejects(fingerprint(), /native_storage_failed/); assert.ok(appDb.counters().closed >= 8);
test.assert(true, 'real shell fingerprint covers settings, revision history, image bytes and native preferences; read failure refuses health');
failedRead = false;
{
  // First launch after a swap: the bootstrap measures storage before the desk
  // runs, then the new desk rewrites records while booting (a normalised
  // setting, a stamped project). The ready report must carry the handed-over
  // fingerprint - the one the previous app measured - and prove no record was
  // lost. Reporting the post-boot fingerprint is what rolled updates back.
  const store = context.window.AISystem6StorageFingerprint;
  const arrival = await store.recordArrival();
  assert.equal(arrival.fingerprint, baseline);
  keyval.get('settings').theme = 'platinum';
  state.get('projects').get('p').updatedAt = '2026-10-17T00:00:00.000Z';
  keyval.set('derived-index:v2', { rebuilt: true });
  const first = await context.window.AISystem6TinyShell.readyStorage();
  assert.equal(first.dataFingerprint, baseline);
  assert.equal(first.writerData.checked, true); assert.equal(first.writerData.lost, 0);
  assert.equal(first.writerData.rewritten, true); assert.equal(first.writerData.stores.projects, 1);
  // A desk reload later in the same run is not a launch: it measures now.
  const reload = await context.window.AISystem6TinyShell.readyStorage();
  assert.equal(reload.writerData.checked, false); assert.notEqual(reload.dataFingerprint, baseline);
  // A boot that drops a writer's record cannot pass.
  await store.recordArrival();
  const project = state.get('projects').get('p'); state.get('projects').delete('p');
  const lostBoot = await context.window.AISystem6TinyShell.readyStorage();
  assert.equal(lostBoot.writerData.lost, 1); assert.deepEqual([...lostBoot.writerData.missing], ['projects:"p"']);
  state.get('projects').set('p', project);
  keyval.get('settings').theme = 'classic'; delete project.updatedAt; keyval.delete('derived-index:v2');
  assert.equal(await fingerprint(), baseline);
  // A fresh profile has no database: the bootstrap must not create one.
  const fresh = fakeAppDb(new Map(), { exists: () => false });
  const freshContext = vm.createContext({ window: {}, sessionStorage: memoryStorage(), localStorage: { getItem: () => null },
    indexedDB: fresh.indexedDB, crypto: webcrypto, TextEncoder, Blob, Date, DOMException, setTimeout });
  vm.runInContext(read('app/core/storage-fingerprint.js'), freshContext);
  assert.deepEqual({ ...(await freshContext.window.AISystem6StorageFingerprint.recordArrival()) }, { empty: true });
  assert.equal(fresh.counters().opened, 0);
  test.assert(true, 'first launch after a swap reports the handed-over fingerprint, allows boot rewrites, refuses a lost record and never creates a database');
}
const Surface = class { constructor(inert) { this.inert = inert; this.tagName = "DIV"; } };
const surfaces = [new Surface(false), new Surface(true)];
context.HTMLElement = Surface;
context.document = { body: { children: surfaces }, querySelector: () => null };
context.deskPersistenceWritable = true;
context.activeAbortController = null;
context.activeLongTasks = new Set();
context.setStatus = () => {};
let saved = false, failInstall = false, allowFreeze = true;
const installed = [], freezes = [];
context.saveDeskState = async () => saved;
context.window.tiny = { api: { call: async (name, payload) => {
  if (name === "shell.checkUpdate") return { available: true, latest: "1.0.1" };
  if (name === "shell.installUpdate") {
    if (failInstall) throw new Error("prepare failed");
    installed.push(payload); return { installing: true };
  }
  throw new Error("Unexpected RPC: " + name);
} } };
context.window.AISystem6Native = { browser: 1 };
context.window.webkit = { messageHandlers: { aisystem6Browser: { postMessage: async ({ frozen }) => {
  freezes.push(frozen); return !frozen || allowFreeze;
} } } };
const adapter = context.window.AISystem6TinyShell;
const realCall = context.window.tiny.api.call;
let rpcStatus = "";
context.setStatus = (value) => { rpcStatus = value; };
context.t = (key, detail) => detail ? key + ": " + detail : key;
context.window.tiny.api.call = async () => { throw "No selected text, or Accessibility permission is unavailable"; };
await adapter.checkUpdate();
assert.match(rpcStatus, /Accessibility permission is unavailable/);
assert.doesNotMatch(rpcStatus, /undefined/);
context.window.tiny.api.call = realCall;
await adapter.checkUpdate();
context.activeAbortController = {}; await adapter.installUpdate(); assert.equal(installed.length, 0);
context.activeAbortController = null;
const finish = adapter.beginFileActivity(); await adapter.installUpdate(); assert.equal(installed.length, 0); finish();
adapter.receiveNativeDownload({ id: 'download', state: 'started' }, false);
await adapter.installUpdate(); assert.equal(installed.length, 0);
adapter.receiveNativeDownload({ id: 'download', state: 'cancelled' }, false);
await adapter.installUpdate(); assert.equal(installed.length, 0); assert.deepEqual(surfaces.map((s) => s.inert), [false, true]);
saved = true; allowFreeze = false; await adapter.installUpdate(); assert.equal(installed.length, 0);
assert.deepEqual(surfaces.map((s) => s.inert), [false, true]);
allowFreeze = true; failInstall = true; await adapter.installUpdate();
assert.equal(adapter.isInstalling(), false); assert.equal(freezes.at(-1), false);
assert.deepEqual(surfaces.map((s) => s.inert), [false, true]);
failInstall = false; await adapter.installUpdate(); assert.equal(installed.length, 1);
assert.equal(installed[0].saved, true); assert.equal(installed[0].dataFingerprint, await fingerprint());
assert.deepEqual(surfaces.map((s) => s.inert), [true, true]); assert.equal(adapter.isInstalling(), true);
await adapter.installUpdate(); assert.equal(installed.length, 1); assert.throws(() => adapter.beginFileActivity());
test.assert(true, 'real install barrier waits for models, file work and main downloads; failed save/freeze/prepare restores surfaces and browser; success dispatches once');
// Exercise backend health publication under overlapping navigation/RPC updates.
const backendSource = read("platform/macos/tinyjs/src/main.js");
const healthBytes = new Map(), published = [];
const healthContext = vm.createContext({ identity: { productVersion: "1.0.59" }, ready: true,
  healthFile: "health.json", healthReport: {}, healthWrite: Promise.resolve(),
  supervisor: { pid: 12 }, Date,
  jsonWrite: async (path, data) => { await new Promise((resolve) => setTimeout(resolve, 2)); healthBytes.set(path, JSON.stringify(data)); },
  tjs: { pid: 11, rename: async (from, to) => { healthBytes.set(to, healthBytes.get(from)); healthBytes.delete(from); published.push(JSON.parse(healthBytes.get(to))); } },
});
vm.runInContext(backendSource.slice(backendSource.indexOf("async function publishHealth("), backendSource.indexOf("async function cleanup(")), healthContext);
await healthContext.publishHealth({ dataFingerprint: baseline });
await Promise.all([healthContext.publishHealth({ navigation: "finish" }), healthContext.publishHealth({ lastRpc: "shell.settings" })]);
assert.equal(published.at(-1).dataFingerprint, baseline);
assert.equal(published.at(-1).navigation, "finish");
assert.equal(published.at(-1).lastRpc, "shell.settings");
healthContext.ready = false; await healthContext.publishHealth({ bootDiagnostic: { name: "Error" } });
assert.equal(published.at(-1).ready, false);
assert.ok(published.every((value) => value.dataFingerprint === baseline));
test.assert(true, "overlapping health reports publish complete atomic snapshots and retain the data fingerprint; failed boot cannot remain ready");
const readySource = backendSource.slice(backendSource.indexOf('"shell.ready": async '), backendSource.indexOf('"shell.settings": ')).trim().replace(/,$/, "");
const purges = [], evals = [], reported = [];
const readyContext = vm.createContext({ identity: { productVersion: "1.0.59", productBuild: "20261011.2", sourceCommit: "a".repeat(40) },
  ready: false, sleep: async () => {}, host: { permissions: { check: async () => "granted" }, eval: (code) => evals.push(code) },
  publishHealth: async (value) => { reported.push(value); }, queue: [], emit: () => {}, files: new Map(),
  frontendReloaded: false, purgeFrontendCache: async (force) => { purges.push(force); } });
const reportReady = vm.runInContext("({" + readySource + "})['shell.ready']", readyContext);
const stale = { dataFingerprint: baseline, frontendVersion: "1.0.58", frontendBuild: "20261011.2", frontendSource: "a".repeat(40) };
await assert.rejects(reportReady(stale), /does not match/);
assert.equal(readyContext.ready, false);
// A stale desk drops the HTTP cache and restarts this launch's desk, once.
assert.deepEqual(purges, [true]); assert.equal(evals.length, 1); assert.match(evals[0], /\/api\/shell\/bootstrap/);
await assert.rejects(reportReady(stale), /does not match/);
assert.deepEqual(purges, [true]); assert.equal(evals.length, 1);
const current = { dataFingerprint: baseline, frontendVersion: "1.0.59", frontendBuild: "20261011.2", frontendSource: "a".repeat(40) };
await assert.rejects(reportReady({ ...current, writerData: { checked: true, lost: 2, missing: ['projects:"p"'] } }), /Writer data is missing/);
assert.equal(readyContext.ready, false); assert.equal(reported.at(-1).writerData.lost, 2);
await reportReady({ ...current, writerData: { checked: true, lost: 0, rewritten: true, stores: { projects: 1, "bad name": 3 } } });
assert.equal(readyContext.ready, true);
assert.deepEqual({ ...reported.at(-1).writerData, stores: { ...reported.at(-1).writerData.stores } },
  { checked: true, lost: 0, rewritten: true, stores: { projects: 1 } });
test.assert(true, "a stale desktop build cannot report healthy for a different installed payload, and triggers one cache purge and desk restart; a boot that lost writer records is not ready");
let permission = "denied", requests = 0, selectionReads = 0;
const selectionSource = backendSource.slice(backendSource.indexOf('"shell.selection": async '), backendSource.indexOf('"shell.screenshot": ')).trim().replace(/,$/, "");
const selectionContext = vm.createContext({ host: {
  permissions: { check: async () => permission, request: async () => { requests += 1; return "denied"; } },
  macos: { selectedText: async () => { selectionReads += 1; return "Public selection fixture"; } },
} });
const collectSelection = vm.runInContext("({" + selectionSource + "})['shell.selection']", selectionContext);
await assert.rejects(collectSelection(), /Enable Accessibility/);
assert.equal(requests, 1); assert.equal(selectionReads, 0);
permission = "granted";
assert.equal((await collectSelection()).text, "Public selection fixture");
assert.equal(requests, 1); assert.equal(selectionReads, 1);
test.assert(true, "denied selection requests native permission before reading; retry after grant reads the selected text");
test.finish();
