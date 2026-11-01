// The built-in model's door in Control Panel > Local Model, driven against a
// small fake DOM and a scripted server: the writer sees the curated model, its
// exact size and license; Download stays off until the consent box is ticked and
// sends exactly the byte count that was shown; progress is painted; Cancel
// reaches the server; the states (not downloaded, partial, installed, memory
// gate, no Apple silicon, no helper) read in plain words in both languages. It
// is lazy: nothing in the eager boot names it except the one loader.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";

const test = createFeatureTest("built-in-model-door");
const source = read("app/features/built-in-model-door.js");

const tables = {};
for (const [lang, file, name] of [["en", "app/data/translations-en.js", "AISystem6TranslationsEn"], ["zh", "app/data/translations-zh.js", "AISystem6TranslationsZh"]]) {
  const context = vm.createContext({ window: {}, t: (key) => key });
  vm.runInContext(read(file), context);
  tables[lang] = context.window[name];
}

class El {
  constructor(tag) {
    this.tag = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.listeners = {}; this.parent = null;
    this.hidden = false; this.disabled = false; this.checked = false; this.className = ""; this.own = ""; this.href = "";
    this.props = {};
    this.style = { setProperty: (key, value) => { this.props[key] = value; } };
    this.classes = new Set();
    this.classList = { toggle: (name, on) => { if (on) this.classes.add(name); else this.classes.delete(name); } };
  }
  get textContent() { return this.own + this.children.map((child) => child.textContent).join(""); }
  set textContent(value) { this.own = String(value); this.children.forEach((child) => { child.parent = null; }); this.children = []; }
  get isConnected() { return this === rootElement || Boolean(this.parent?.isConnected); }
  append(...nodes) { for (const node of nodes) { node.parent?.remove?.(node); node.parent = this; this.children.push(node); } }
  remove(node) { this.children = this.children.filter((child) => child !== node); }
  after(...nodes) { const list = this.parent.children; const at = list.indexOf(this) + 1; nodes.forEach((node) => { node.parent = this.parent; }); list.splice(at, 0, ...nodes); }
  prepend(...nodes) { nodes.forEach((node) => { node.parent = this; }); this.children.unshift(...nodes); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  fire(type) { (this.listeners[type] || []).forEach((handler) => handler({ stopPropagation() {} })); }
  querySelector(selector) { return selector === ":scope > h3" ? this.children.find((child) => child.tag === "h3") || null : null; }
  find(id) { if (this.id === id) return this; for (const child of this.children) { const hit = child.find?.(id); if (hit) return hit; } return null; }
}
const rootElement = new El("section");
const heading = new El("h3");
rootElement.append(heading);

function setup({ catalog, status = { builtIn: { reason: "noModelDownloaded" } }, language = "en" }) {
  const requests = [];
  const stream = { controller: null };
  const script = { catalog, status, downloadResponse: null };
  const routes = (url, init = {}) => {
    const method = init.method || "GET";
    requests.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith("/catalog")) return new Response(JSON.stringify(script.catalog), { headers: { "Content-Type": "application/json" } });
    if (url.endsWith("/status")) return new Response(JSON.stringify(script.status), { headers: { "Content-Type": "application/json" } });
    if (method === "DELETE") return new Response(JSON.stringify({ cancelled: true }), { headers: { "Content-Type": "application/json" } });
    if (method === "POST") return script.downloadResponse();
    return new Response(JSON.stringify({ download: null }), { headers: { "Content-Type": "application/json" } });
  };
  const providers = new Map();
  const capabilityNames = new Map([["device.status", { available: true, provider: "same-origin-node" }]]);
  let invalidated = "";
  const window = {
    AISystem6Capabilities: {
      getCapability: (name) => capabilityNames.get(name) || { available: false, provider: "none" },
      registerServiceProvider: (name, provider) => providers.set(name, provider),
      setCapability: (name, provider) => capabilityNames.set(name, { available: true, provider }),
      requestService: (name, input) => {
        if (name === "device.status") return Promise.resolve(routes("/api/device-model/status", {}));
        return providers.get(name).request(input);
      },
    },
    AISystem6ClioProvider: { invalidate: (reason) => { invalidated = reason; } },
  };
  const panel = rootElement;
  rootElement.children = [heading];
  rootElement.id = "control-panel-local";
  const context = vm.createContext({
    window,
    document: { createElement: (tag) => new El(tag), querySelector: (selector) => (selector === "#control-panel-local" ? panel : null), documentElement: {} },
    MutationObserver: class { observe() {} },
    fetch: async (url, init) => routes(url, init),
    t: (key, ...args) => { const value = tables[language][key]; return typeof value === "function" ? value(...args) : value ?? key; },
    TextDecoder, Response, JSON, Number, Math, String, Object, Promise,
  });
  vm.runInContext(source, context);
  return { window, requests, script, stream, invalidated: () => invalidated };
}
const pack = (extra = {}) => ({
  id: "qwen3.5-4b-4bit", displayName: "Qwen3.5 4B (4-bit)", repo: "mlx-community/Qwen3.5-4B-MLX-4bit", license: "Apache-2.0",
  licenseURL: "https://huggingface.co/Qwen/Qwen3.5-4B/blob/main/LICENSE", totalBytes: 3_061_000_000, estimatedResidentBytes: 4_090_000_000,
  contextTokens: 16384, languages: ["en"], state: "notInstalled", bytesOnDisk: null, memoryGate: { allowed: true, limitBytes: 9_600_000_000 }, ...extra,
});
const door = (id) => rootElement.find(id);
const sse = (events) => new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

// Not downloaded: size, license and consent are shown; Download needs the tick.
{
  const h = setup({ catalog: { helper: true, reason: null, pack: pack(), physicalMemoryBytes: 16e9, download: null } });
  await h.window.AISystem6BuiltInModelDoor.show();
  const shown = rootElement.children.filter((child) => child.dataset?.builtInModel === "door");
  test.assert(shown.length === 10 && heading.children.length === 0 && rootElement.children[0] === heading && rootElement.children[1].dataset.builtInModel === "door", "the door sits under the panel heading");
  const text = shown.filter((node) => !node.hidden).map((node) => node.textContent).join("\n");
  test.assert(text.includes("Qwen3.5 4B (4-bit)") && text.includes("3.06 GB") && text.includes("3,061,000,000 bytes"), "the curated model and its exact download size are shown");
  test.assert(text.includes("Apache-2.0") && text.includes("Read the license") && text.includes("huggingface.co"), "the license and the source host are shown");
  test.assert(text.includes("Not downloaded yet."), "the not-downloaded state reads plainly");
  const download = door("built-in-model-download");
  const consent = door("built-in-model-consent");
  test.assert(download.disabled === true && consent.checked === false, "Download is off until the writer consents");
  download.fire("click");
  await settle();
  test.assert(!h.requests.some((request) => request.method === "POST"), "a click without consent starts nothing");

  // Consent, then a download with progress that ends installed.
  consent.checked = true;
  consent.fire("change");
  test.assert(download.disabled === false, "ticking the box turns Download on");
  h.script.downloadResponse = () => sse([
    { type: "progress", state: "running", bytesDone: 765_250_000, totalBytes: 3_061_000_000 },
    { type: "progress", state: "running", bytesDone: 1_530_500_000, totalBytes: 3_061_000_000 },
    { type: "done", state: "done", bytesDone: 3_061_000_000, totalBytes: 3_061_000_000 },
  ]);
  h.script.catalog = { helper: true, reason: null, pack: pack({ state: "installed" }), physicalMemoryBytes: 16e9, download: { state: "done" } };
  download.fire("click");
  await settle();
  const post = h.requests.find((request) => request.method === "POST");
  test.assert(post.body.consentBytes === 3_061_000_000 && post.body.id === "qwen3.5-4b-4bit", "the consent sent is exactly the byte count that was shown");
  test.assert(door("built-in-model-download").parent.hidden === true && /Downloaded and ready/.test(rootElement.children.find((n) => n.attrs.role === "status").textContent), "a finished download reads installed");
  test.assert(h.invalidated() === "model-installed", "the Clio provider probes again after the install");
}

// Cancel reaches the server and the stream ends as cancelled.
{
  const h = setup({ catalog: { helper: true, reason: null, pack: pack({ state: "partial", bytesOnDisk: 1_000_000_000 }), physicalMemoryBytes: 16e9, download: null } });
  await h.window.AISystem6BuiltInModelDoor.show();
  test.assert(/Partly downloaded: 1\.00 GB of 3\.06 GB/.test(rootElement.children.find((n) => n.attrs.role === "status").textContent), "a partial download says how far it got");
  let controller;
  h.script.downloadResponse = () => new Response(new ReadableStream({ start(c) { controller = c; } }));
  const enc = new TextEncoder();
  door("built-in-model-consent").checked = true;
  door("built-in-model-download").fire("click");
  await settle();
  controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "progress", state: "running", bytesDone: 1_530_500_000, totalBytes: 3_061_000_000 })}\n\n`));
  await settle();
  const statusNode = rootElement.children.find((n) => n.attrs.role === "status");
  test.assert(/Downloading: 50% \(1\.53 GB of 3\.06 GB\)/.test(statusNode.textContent), "progress is painted as a percentage and sizes");
  const meter = rootElement.children.find((n) => n.attrs.role === "progressbar");
  test.assert(meter.attrs["aria-valuenow"] === "50" && meter.children[0].props["--progress-fill-width"] === "50%" && meter.hidden === false, "the shared progress meter follows the download");
  test.assert(door("built-in-model-cancel").hidden === false && door("built-in-model-download").hidden === true, "Cancel replaces Download while it runs");
  door("built-in-model-cancel").fire("click");
  await settle();
  test.assert(h.requests.some((request) => request.method === "DELETE"), "Cancel is sent to the server");
  controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "cancelled", state: "cancelled", bytesDone: 1_530_500_000, totalBytes: 3_061_000_000 })}\n\n`));
  controller.close();
  await settle();
  test.assert(/Download cancelled/.test(statusNode.textContent) && door("built-in-model-cancel").hidden === true, "a cancelled download reads cancelled and Download returns");
}

// Refusals and absence.
{
  const gated = setup({ catalog: { helper: true, reason: null, pack: pack({ memoryGate: { allowed: false, limitBytes: 3_000_000_000 } }), physicalMemoryBytes: 5e9, download: null } });
  await gated.window.AISystem6BuiltInModelDoor.show();
  const statusNode = rootElement.children.find((n) => n.attrs.role === "status");
  test.assert(/not have enough memory/.test(statusNode.textContent) && /4\.09 GB/.test(statusNode.textContent) && /3\.00 GB/.test(statusNode.textContent), "the memory gate refusal names the need and the limit");
  test.assert(door("built-in-model-download").parent.hidden === true && rootElement.children.find((n) => n.tag === "label").hidden === true, "no download is offered when the memory gate refuses");
}
{
  const intel = setup({ catalog: { helper: true, reason: null, pack: pack(), physicalMemoryBytes: 16e9, download: null }, status: { builtIn: { reason: "notAppleSilicon" } } });
  await intel.window.AISystem6BuiltInModelDoor.show();
  test.assert(/Apple silicon/.test(rootElement.children.find((n) => n.attrs.role === "status").textContent), "a Mac without Apple silicon is told why");
}
{
  const none = setup({ catalog: { helper: false, reason: "helperMissing", pack: null, download: null } });
  await none.window.AISystem6BuiltInModelDoor.show();
  test.assert(rootElement.children.filter((n) => n.dataset?.builtInModel === "door").every((n) => n.hidden), "without the helper the door is not shown");
}
{
  const zh = setup({ catalog: { helper: true, reason: null, pack: pack(), physicalMemoryBytes: 16e9, download: null }, language: "zh" });
  await zh.window.AISystem6BuiltInModelDoor.show();
  const text = rootElement.children.filter((n) => n.dataset?.builtInModel === "door" && !n.hidden).map((n) => n.textContent).join("\n");
  test.assert(text.includes("内置模型") && text.includes("3.06 GB") && text.includes("勾选后才能点「下载」"), "the Chinese door reads in Chinese with 「」 quotes");
}

// Lazy: only the Local Model tab's loader names the module, and it asks the deployment first.
const config = read("app/core/config.js");
const persistence = read("app/core/persistence-status.js");
test.assert(lazyRuntimePaths.includes("app/features/built-in-model-door.js"), "the door is a lazy runtime module");
test.assert(config.includes('createLazyModuleLoader("AISystem6BuiltInModelDoorLoaded", ["app/features/built-in-model-door.js"])'), "a lazy loader names the door");
test.assert(/target === "local" && window\.AISystem6Capabilities\?\.capabilityAvailable\("device\.status"\)/.test(persistence), "opening the Local Model tab loads it, and only where the deployment offers the on-device service");
test.finish();
