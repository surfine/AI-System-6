// ClioWorks v5.1 CW51-03 contract: the context strip reads the REAL chart
// selection. The chart adapter's context carries the fields the v5.1
// contracts require (selection with the engine's selected cell identity,
// embedded/editable from the actual table, hasSource from the extraction),
// and the strip's per-selection rows derive from it — a chart selection
// shows 编辑副本/图表类型/查看来源, a non-chart command is disabled with a
// named reason. Drives the REAL vendored modules with the engine's state
// shape; no fake applied anything.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v51-context-strip");
const uiModel = read("app/vendor/clioworks-v3/ui-model.js");
const adapterSource = read("app/vendor/clioworks-v3/chart-adapter.js");
const stripSource = read("app/vendor/clioworks-v3/context-strip.js");

const test2 = uiModel; // readability alias for assertions below

const context = {
  console, String, Number, JSON, Math, Array, Object, Set, Map, WeakMap, Error, Boolean, Promise,
  Date, RegExp, AbortController, document: null, window: null,
};
context.globalThis = context; context.window = context;
context.clioChartState = {
  // The engine's real state shape: one table, one selected cell.
  table: { rows: [{ label: "一季度", cells: [{ text: "10" }] }], columns: [{ text: "销售额" }] },
  selection: { row: 0, column: 0 },
  extraction: { temporary: true },
  templateFileId: "",
  history: { canUndo: () => false, canRedo: () => false },
};
context.clioChartState.owner = null;
vm.createContext(context);

// Load the ui-model, then the chart adapter slice that builds the context.
vm.runInContext(uiModel, context, { filename: "ui-model.vm.js" });
const ui = context.window.ClioWorksUIModel;
test.assert(!!ui && typeof ui.commandState === "function", "the ui-model installs");

// The adapter's context builder, extracted with a stubbed window/engine surface.
const adapterContext = `
  const engineState = () => window.clioChartState;
  const state = { kind: 'chart', documentId: 'doc-1', sessionId: 's-1', generation: 0,
    editRevision: 0, selectionEpoch: 0, readonly: false, composing: false, saving: false,
    closed: false, canUndo: false, canRedo: false,
    supported: ['edit.undo', 'edit.redo', 'embed.edit', 'chart.kind', 'source.inspect', 'file.save'] };
  ${adapterSource.slice(adapterSource.indexOf("    const chartSelection = () => {"), adapterSource.indexOf("    const adapter = {"))}
  window.buildContext = () => {
    syncDerivedSafe();
    const engine = engineState();
    return { ...state, selection: chartSelection(), active: !state.closed,
      mayRestoreFocus: !state.composing, modalOpen: false };
  };
  function syncDerivedSafe() {}
`;
vm.runInContext(adapterContext, context, { filename: "chart-context.vm.js" });
const chartContext = context.window.buildContext();
test.assert(chartContext.selection.kind === "chart" && chartContext.selection.ids[0] === "cell-0-0",
  "the adapter derives the engine's selected cell identity");
test.assert(chartContext.selection.embedded === true && chartContext.selection.editable === true,
  "the chart's own table is an embedded editable copy");
test.assert(chartContext.selection.hasSource === true,
  "an extraction chart has a source to inspect");
test.assert(chartContext.active === true && chartContext.mayRestoreFocus === true,
  "an open window is active and may restore focus");

// The strip's row set for a chart selection comes from the ui-model matrix.
const wanted = ui.contextualItems(chartContext.selection);
test.assert(wanted[0] === "embed.edit" && wanted.includes("chart.kind") && wanted.includes("source.inspect"),
  "a chart selection surfaces 编辑副本 first, then chart kinds and source");
test.assert(!wanted.includes("text.bold") && !wanted.includes("table.format"),
  "a chart selection does not surface text/table commands");

// The command matrix against the FULL context shape (validateContext
// requires the whole stamp — the adapter's spread supplies it in
// production; the extraction slice above carries only the derived fields).
// The FULL context mirrors the real adapter's shape after the sweep fixes:
// writeAllowed present (the engine has no read-only mode), the supported
// list is the honestly-wired set (undo/redo/save — the strip commands are
// NOT yet wired into execute), and the selection carries the owner-aware
// hasSource. The unwired strip commands are disabled with NOT_CONNECTED —
// the spec's rule for anything not wired: disabled with a reason, never
// fake-enabled.
const fullContext = (overrides = {}) => ({
  kind: "chart", documentId: "doc-1", sessionId: "s-1", generation: 0,
  editRevision: 0, selectionEpoch: 0, selection: chartContext.selection,
  active: true, mayRestoreFocus: true, readonly: false, writeAllowed: true,
  composing: false, saving: false, closed: false, canUndo: false, canRedo: false,
  supported: ["edit.undo", "edit.redo", "file.save"],
  ...overrides,
});
const notConnected = ui.commandState("layout.check", fullContext());
test.assert(notConnected.enabled === false && notConnected.code === "NOT_CONNECTED",
  "an unwired command is disabled with NOT_CONNECTED before any other gate");
const embed = ui.commandState("embed.edit", fullContext());
test.assert(embed.enabled === false && embed.code === "NOT_CONNECTED",
  "编辑副本 stays disabled until the adapter actually wires it — no fake availability");
const embedWired = ui.commandState("embed.edit", fullContext({
  supported: ["edit.undo", "edit.redo", "file.save", "embed.edit"],
}));
test.assert(embedWired.enabled === true && embedWired.code === "READY",
  "once wired, an editable embedded chart's 编辑副本 is READY");
const embedReadonly = ui.commandState("embed.edit", fullContext({
  supported: ["embed.edit"], readonly: true,
}));
test.assert(embedReadonly.enabled === false && embedReadonly.code === "READONLY",
  "a read-only file refuses copy editing with the readonly reason");
const embedNoSource = ui.commandState("source.inspect", fullContext({
  supported: ["source.inspect"], selection: { ...chartContext.selection, hasSource: false },
}));
test.assert(embedNoSource.enabled === false && embedNoSource.code === "NO_SOURCE",
  "an object without a source record refuses 查看来源");
const frameBusy = ui.commandState("embed.edit", fullContext({
  supported: ["embed.edit"], frameState: "editing",
}));
test.assert(frameBusy.enabled === false && frameBusy.code === "FRAME_ACTIVE",
  "an open frame refuses a second 编辑副本 until adopted or cancelled");

// The strip's DOM wiring: rows derive from the contextual items and the
// label from the selection (drive the real attachContextStrip with a
// minimal DOM shim sufficient for its calls).
const stripDom = (() => {
  const make = (tag, attrs = {}) => ({
    tag, attrs, children: [], _class: attrs.class || "",
    classList: {
      add(...names) {}, remove(...names) {}, toggle() {}, contains: () => false,
    },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    append(...nodes) { this.children.push(...nodes); },
    insertBefore(node, before) { this.children.unshift(node); },
    before(node) { this.children.unshift(node); },
    remove() {},
    addEventListener() {}, removeEventListener() {},
    _isConnected: true,
    get isConnected() { return this._isConnected === true; },
    get textContent() { return this._text || ""; },
    set textContent(value) { this._text = value; },
    set hidden(value) { this._hidden = value; },
    get hidden() { return this._hidden === true; },
    set disabled(value) { this._disabled = value === true; },
    get disabled() { return this._disabled === true; },
    querySelector() { return null; },
  });
  return {
    h: (tag, attrs, ...children) => { const node = make(tag, attrs || {}); (children || []).forEach((child) => { if (child && typeof child === "object") node.children.push(child); }); return node; },
    make,
  };
})();
context.ClioWorksDOM = {
  h: stripDom.h,
  roving: (element) => ({ sync() {}, dispose() {} }),
  // The strip binds per-button pointerdown capture through the bag.
  disposable: () => {
    const cleanups = [];
    return {
      add(cleanup) { cleanups.push(cleanup); },
      on(target, type, fn, opts) {
        target.addEventListener?.(type, fn, opts);
        cleanups.push(() => target.removeEventListener?.(type, fn, opts));
      },
      dispose() { cleanups.forEach((cleanup) => { try { cleanup(); } catch {} }); },
    };
  },
};
context.ClioWorksComponents = { button: (options) => stripDom.make("button", options) };
context.ClioWorksUIModel = ui;
context.document = {
  createElement: (tag) => stripDom.make(tag),
};
vm.runInContext(stripSource, context, { filename: "context-strip.vm.js" });
const stripApi = context.window.ClioWorksContextStrip;
test.assert(!!stripApi && typeof stripApi.attachContextStrip === "function",
  "the strip module installs in the DOM shim");

const listeners = [];
const stripAdapter = {
  getContext: () => context.window.buildContext(),
  subscribe(listener) { listeners.push(listener); return () => { listeners.splice(listeners.indexOf(listener), 1); }; },
};
const mounted = {
  editor: (() => { const editor = stripDom.make("div"); return editor; })(),
  execute: async (id) => ({ status: "ok" }),
  captureSelection() {},
};
let threw = "";
let strip;
try {
  strip = stripApi.attachContextStrip({ mounted, adapter: stripAdapter, onError: (error) => { threw = error.message; } });
} catch (error) { threw = error.message; }
test.assert(threw === "" && !!strip, `the strip attaches over the mount (${threw})`);

// Refresh reflects the chart selection: label names the selection, the
// re-refresh after an adapter notification is clean.
strip.refresh();
test.assert(listeners.length === 1, "the strip subscribed to the adapter");
listeners[0]();
test.assert(strip.element.children.length > 1,
  "the strip rendered its label and command buttons");

strip.dispose();
test.assert(listeners.length === 0, "dispose unsubscribes from the adapter");

test.finish();
