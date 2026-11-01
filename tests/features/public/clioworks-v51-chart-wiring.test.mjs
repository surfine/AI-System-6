// ClioWorks v5.1 (CW51-04 wiring) contract: the first real path becomes
// browser-reachable. The chart adapter's execute() handles embed.edit by
// opening a FrameSession over a real-engine façade (history and owner
// write-back stay the engine's own), the context carries frameState so a
// second 编辑副本 is refused (FRAME_ACTIVE), the supported list honestly
// names what is wired, and the catalog injection unblocks the three strip
// commands at the run() layer. The adapter's real façade and its `frame`
// API run against the real ClioChart engine in
// tests/features/clioworks-chart-context-boot.test.mjs (section 2b), not
// here: an engine double would only test the double.
import vm from "node:vm";
import { createFeatureTest, read } from "../../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v51-chart-wiring");
const uiModel = read("app/vendor/clioworks-v3/ui-model.js");
const adapterSource = read("app/vendor/clioworks-v3/chart-adapter.js");
const fixtureSource = read("app/vendor/clioworks-v3/fixture.js");

const context = {
  console, String, Number, JSON, Math, Array, Object, Set, Map, WeakMap, Error, Boolean, Promise,
  Date, RegExp, AbortController,
  crypto: { randomUUID: () => `op-${Math.random().toString(36).slice(2, 10)}` },
};
context.globalThis = context; context.window = context;
vm.createContext(context);
vm.runInContext(uiModel, context, { filename: "ui-model.vm.js" });
const ui = context.window.ClioWorksUIModel;
test.assert(!!ui, "the catalog installs");

// Wiring fact 1: the adapter's supported list names embed.edit (wired) —
// and its execute handles it. Pinned on the real source so the wiring
// cannot silently disappear.
test.assert(/command === 'embed\.edit'/.test(adapterSource),
  "the adapter's execute handles embed.edit");
test.assert(/state\.supported = engineState\(\)\?\.extraction\?\.temporary\s*\?\s*\['edit\.undo', 'edit\.redo', 'file\.save', 'embed\.edit'\]\s*:\s*\['edit\.undo', 'edit\.redo', 'embed\.edit'\]/.test(adapterSource),
  "the supported list names embed.edit on both scratch and extraction tables");
test.assert(adapterSource.includes("frameState: frameState()"),
  "getContext carries frameState from the live session");

// Wiring fact 2: the fixture injects the v5.1 catalog into the chart mount
// and loads the frame modules — the three-layer gate opens in order.
test.assert(fixtureSource.includes("catalog: window.ClioWorksUIModel.CATALOG")
  && fixtureSource.includes("resolveCommand: window.ClioWorksUIModel.commandState"),
  "the fixture mount injects the v5.1 catalog and matrix");
test.assert(fixtureSource.includes("app/vendor/clioworks-v3/frame-session.js")
  && fixtureSource.includes("app/vendor/clioworks-v3/chart-frame-port.js"),
  "the fixture chart branch loads the frame modules");

// Wiring fact 3: the matrix refuses a second copy while one is open.
// A second 编辑副本 while the frame is open: FRAME_ACTIVE.
const matrix = ui.commandState("embed.edit", {
  kind: "chart", documentId: "chart-doc-wired", sessionId: "s", generation: 0,
  editRevision: 0, selectionEpoch: 0,
  selection: { kind: "chart", ids: ["cell-0-0"], embedded: true, editable: true, locked: false,
    hasSource: true, sourceAccessible: true },
  active: true, mayRestoreFocus: true, readonly: false, writeAllowed: true,
  composing: false, saving: false, closed: false, canUndo: false, canRedo: false,
  supported: ["edit.undo", "edit.redo", "embed.edit"],
  frameState: "editing",
});
test.assert(matrix.enabled === false && matrix.code === "FRAME_ACTIVE",
  "a second 编辑副本 while a frame is open is refused with FRAME_ACTIVE");

// Catalog fact: the injected catalog carries the copy-edit and chart-kind
// commands, and the matrix states their wiring honestly (wired → READY,
// unwired → NOT_CONNECTED for a context that omits them from supported).
test.assert(!!ui.CATALOG.some((command) => command.id === "embed.edit")
  && !!ui.CATALOG.some((command) => command.id === "chart.kind")
  && !!ui.CATALOG.some((command) => command.id === "source.inspect"),
  "the injected catalog carries the three strip commands");
const unwired = ui.commandState("chart.kind", {
  kind: "chart", documentId: "d", sessionId: "s", generation: 0,
  editRevision: 0, selectionEpoch: 0,
  selection: { kind: "chart", ids: ["c"], embedded: true, editable: true },
  active: true, mayRestoreFocus: true, readonly: false, writeAllowed: true,
  composing: false, saving: false, closed: false, canUndo: false, canRedo: false,
  supported: ["edit.undo", "embed.edit"],
});
test.assert(unwired.enabled === false && unwired.code === "NOT_CONNECTED",
  "chart.kind stays honestly NOT_CONNECTED until wired");

test.finish();
