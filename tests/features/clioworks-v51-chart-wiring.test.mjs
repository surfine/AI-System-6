// ClioWorks v5.1 (CW51-04 wiring) contract: the first real path becomes
// browser-reachable. The chart adapter's execute() handles embed.edit by
// opening a FrameSession over a real-engine façade (history and owner
// write-back stay the engine's own), the context carries frameState so a
// second 编辑副本 is refused (FRAME_ACTIVE), the supported list honestly
// names what is wired, and the catalog injection unblocks the three strip
// commands at the run() layer. Drives the REAL vendored FrameSession and
// chart frame port against an engine double faithful to the ClioChart
// surface — the same binding the adapter's façade performs in production.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v51-chart-wiring");
const frameSession = read("app/vendor/clioworks-v3/frame-session.js");
const portSource = read("app/vendor/clioworks-v3/chart-frame-port.js");
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
vm.runInContext(frameSession, context, { filename: "frame-session.vm.js" });
vm.runInContext(portSource, context, { filename: "chart-frame-port.vm.js" });
vm.runInContext(uiModel, context, { filename: "ui-model.vm.js" });
const frames = context.window.ClioWorksFrames;
const portFactory = context.window.AISystem6ChartFramePort;
const ui = context.window.ClioWorksUIModel;
test.assert(!!frames && !!portFactory && !!ui, "the frame session, port and catalog install");

// The engine double: the surface the adapter's façade binds (readTable/
// applyTable through the history, serialize/parse round-trip, undoOnce,
// beginChange, ownerId, objectId, revision).
const INITIAL = "| | 一季度 | 二季度 |\n| --- | --- | --- |\n| 销售额 | 10 | 20 |\n| 成本 | 5 | 8 |";
function makeEngine({ initialText }) {
  const state = { text: initialText, history: [], future: [] };
  const parse = (text) => {
    if (!text) return null;
    const lines = String(text).split("\n");
    if (lines.length < 2 || !lines[1].includes("---")) return null;
    return {
      columns: lines[0].split("|").slice(1, -1).map((cell) => ({ text: cell.trim() })),
      rows: lines.slice(2).filter((line) => line.trim()).map((line, index) => ({
        lineIndex: index + 2,
        label: line.split("|")[1].trim(),
        cells: line.split("|").slice(2, -1).map((cell) => ({ text: cell.trim() })),
        dirty: false,
      })),
      headerDirty: false, headerIndex: 0, configIndex: -1,
      config: { sort: "source" }, eol: "\n", lines,
    };
  };
  const engine = {
    readTable: () => parse(state.text),
    applyTable(table) {
      state.history.push(state.text);
      state.text = engine.serialize(table);
      engine.written = state.text;
      return true;
    },
    serialize: (table) => {
      if (!table) return "";
      const lines = table.lines.slice();
      if (table.headerDirty) lines[table.headerIndex] = `| ${table.columns.map((column) => column.text).join(" | ")} |`;
      table.rows.forEach((row) => {
        if (!row.dirty) return;
        lines[row.lineIndex] = `| ${row.label} | ${row.cells.map((cell) => cell.text).join(" | ")} |`;
      });
      return lines.join("\n");
    },
    parse,
    undoOnce() {
      const previous = state.history.pop();
      if (previous === undefined) return false;
      state.future.push(state.text);
      state.text = previous;
      engine.written = previous;
      return true;
    },
    beginChange: (mutate) => mutate(),
    ownerId: () => "chart-doc-wired",
    objectId: () => "clio-chart-grid",
    revision: () => state.history.length,
    _state: state,
    written: initialText,
  };
  return engine;
}

// The façade binding, identical in shape to the adapter's production code:
// applyTable goes through beginChange(→history) + the host's
// restoreClioChartText equivalent, which carries the owner fence.
function bindPort(engine, host) {
  return portFactory.createChartFramePort({
    readTable: () => engine.readTable(),
    applyTable: (table) => host.clioChartTableChange("frame_apply",
      () => host.restoreClioChartText(engine.serialize(table))),
    serialize: (table) => engine.serialize(table),
    parse: (text) => engine.parse(text),
    undoOnce: () => engine.undoOnce(),
    beginChange: (mutate) => host.clioChartTableChange("frame_metadata", mutate),
    ownerId: () => engine.ownerId(),
    objectId: () => engine.objectId(),
    revision: () => engine.revision(),
  });
}

const host = {
  // Production restore runs inside the caller's history wrapper — the push
  // lives there. Route through the engine's own applyTable.
  restoreClioChartText: (text) => {
    const table = host.engine.parse(text);
    if (!table) return false;
    return host.engine.applyTable(table);
  },
  clioChartTableChange: (label, mutate) => mutate(),
};
host.engine = makeEngine({ initialText: INITIAL });

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

// Wiring fact 3: the real path end to end on the bound port.
const engine = host.engine;
const session = new frames.FrameSession(bindPort(engine, host));
const opened = await session.open("clio-chart-grid");
test.assert(opened.status === "ok", "embed.edit opens the frame over the bound engine");

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

// Adopt through the façade: the host engine carries the change, one undo step.
session.edit({ kind: "set-cell", row: 0, column: 1, value: "25" });
await session.prepare();
let adopted;
try {
  adopted = await session.accept({ requestId: "cw51-wiring-1" });
} catch (error) { console.log("THREW:", error && error.message); adopted = { status: "threw", message: error?.message }; }
console.log("adopted:", JSON.stringify(adopted), "| engine:", JSON.stringify(engine._state.text.slice(0, 60)), "| written:", JSON.stringify(engine.written.slice(0, 60)));
console.log("revision:", engine.revision());
test.assert(adopted.status === "ok" && adopted.receipt?.status === "applied",
  "the adopt lands an applied receipt through the façade");
test.assert(engine.written.includes("25") && engine.written.includes("一季度"),
  "the host engine's serialized text carries the edit and the untouched rows");
const undid = engine.undoOnce();
test.assert(undid === true && engine._state.text === INITIAL,
  "one parent undo restores the pre-adoption text");

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
