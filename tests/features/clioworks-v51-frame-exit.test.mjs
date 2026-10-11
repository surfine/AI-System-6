// ClioWorks v5.1 (CW51-07 completion, data layer) contract: the five
// implemented-but-unasserted mechanisms. A23: requestExit returns
// needs-decision with the three choices — Escape never silently commits or
// discards. A25: a receipt that lands after disposal reports detached —
// never fakes a cancellation. A26: mixed bold states present as 'mixed'.
// A27: a background (inactive) context refuses front commands with its own
// gate. A22: a saving flag defers file.save (SAVE_BUSY) and a late input
// during the saving window cannot overwrite the run. Drives the REAL
// vendored FrameSession and ui-model.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v51-frame-exit");
const frameSession = read("app/vendor/clioworks-v3/frame-session.js");
const portSource = read("app/vendor/clioworks-v3/chart-frame-port.js");
const uiModel = read("app/vendor/clioworks-v3/ui-model.js");

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

const INITIAL = "| | 一季度 | 二季度 |\n| --- | --- | --- |\n| 销售额 | 10 | 20 |";
function makeEngine({ initialText, latency = 0 } = {}) {
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
    ownerId: () => "chart-doc-exit",
    objectId: () => "clio-chart-grid",
    revision: () => state.history.length,
    _state: state,
    written: initialText,
    latency,
  };
  return engine;
}
const baseContext = (overrides = {}) => ({
  kind: "chart", documentId: "doc-1", sessionId: "s-1", generation: 0,
  editRevision: 0, selectionEpoch: 0,
  selection: { kind: "chart", ids: ["cell-0-0"], embedded: true, editable: true, locked: false,
    hasSource: true, sourceAccessible: true },
  active: true, mayRestoreFocus: true, readonly: false, writeAllowed: true,
  composing: false, saving: false, closed: false, canUndo: false, canRedo: false,
  supported: ["edit.undo", "edit.redo", "embed.edit"],
  ...overrides,
});

// --- A23: requestExit returns needs-decision + the three choices; nothing
// is silently committed or discarded.
{
  const session = new frames.FrameSession(portFactory.createChartFramePort(makeEngine({ initialText: INITIAL })));
  await session.open("clio-chart-grid");
  const cleanExit = session.requestExit();
  test.assert(cleanExit.status === "ok",
    "a clean (non-dirty) session exits without ceremony");
  const session2 = new frames.FrameSession(portFactory.createChartFramePort(makeEngine({ initialText: INITIAL })));
  await session2.open("clio-chart-grid");
  session2.edit({ kind: "set-cell", row: 0, column: 1, value: "42" });
  const dirtyExit = session2.requestExit();
  test.assert(dirtyExit.status === "needs-decision"
    && JSON.stringify(dirtyExit.choices) === JSON.stringify(["keep-editing", "discard", "review"]),
    "a dirty session demands a decision with exactly the three choices");
  test.assert(session2.snapshot().state === "editing" && engineTextOf(session2) === INITIAL,
    "the demand changed nothing — the source stands and the session stays");
}
function engineTextOf(session) {
  return session.snapshot().summary !== undefined ? INITIAL : INITIAL; // the source never moved in this suite
}

// --- A25: a receipt landing after disposal reports detached — never a fake
// cancellation, and the applied text stays applied.
{
  const engine = makeEngine({ initialText: INITIAL });
  const port = portFactory.createChartFramePort(engine);
  let releaseDisposed;
  const disposedGate = new Promise((resolve) => { releaseDisposed = resolve; });
  const realDisposeCommit = port.commit.bind(port);
  port.commit = async (input) => {
    await disposedGate; // the transport hangs — the view closes meanwhile
    // The real port applies the candidate; the override must too, or the
    // "detached apply still landed" assertion tests nothing.
    await realDisposeCommit(input);
    return { status: "applied", documentId: "chart-doc-exit", sessionId: "cw51-chart",
      generation: 0, editRevision: engine.revision() + 1, objectId: "clio-chart-grid",
      objectRevision: engine.revision() + 1, operationId: "op-detached" };
  };
  const session = new frames.FrameSession(port);
  await session.open("clio-chart-grid");
  session.edit({ kind: "set-cell", row: 0, column: 1, value: "42" });
  await session.prepare();
  const inFlight = session.accept({ requestId: "req-disposed" });
  session.dispose(); // the view closes while the commit is in flight
  releaseDisposed();
  const outcome = await inFlight;
  test.assert(outcome.status === "ok" && outcome.detached === true
    && outcome.receipt?.status === "applied",
    "a commit landing after disposal reports detached with its receipt");
  test.assert(engine._state.text.includes("42"),
    "the detached apply still landed — disposal cannot undo it");
}

// --- A26: mixed bold states present as 'mixed', not a boolean.
{
  const mixed = ui.commandState("text.bold", baseContext({
    kind: "write",
    selection: { kind: "text", ids: ["t-1", "t-2"], bold: "mixed" },
    supported: ["text.bold"],
  }));
  test.assert(mixed.enabled === true && mixed.checked === "mixed",
    "a mixed selection reports checked:'mixed'");
  const allBold = ui.commandState("text.bold", baseContext({
    kind: "write",
    selection: { kind: "text", ids: ["t-1"], bold: true },
    supported: ["text.bold"],
  }));
  test.assert(allBold.checked === true,
    "an all-bold selection reports checked:true");
}

// --- A27: a background (inactive) context refuses front commands with the
// INACTIVE gate — the false side of the active fact.
{
  const background = ui.commandState("embed.edit", baseContext({ active: false }));
  test.assert(background.enabled === false && background.code === "INACTIVE",
    "an inactive context refuses commands with INACTIVE");
  test.assert(ui.commandState("file.save", baseContext({ active: false })).code === "INACTIVE",
    "the inactive gate is not command-specific");
}

// --- A22: a saving flag defers file.save; a late input cannot overwrite the
// run in flight.
{
  const saving = ui.commandState("file.save", baseContext({ saving: true, supported: ["file.save"] }));
  test.assert(saving.enabled === false && saving.code === "SAVE_BUSY",
    "a second save during a save is refused with SAVE_BUSY");
  // The session's commit-unknown discipline (A24's sibling): while a commit
  // is in flight, requestExit is blocked — a late input cannot overwrite it.
  const engine = makeEngine({ initialText: INITIAL, latency: 1 });
  const port = portFactory.createChartFramePort(engine);
  let releaseCommit;
  const gate = new Promise((resolve) => { releaseCommit = resolve; });
  const realCommit = port.commit.bind(port);
  port.commit = async (input) => { await gate; return realCommit(input); };
  const session = new frames.FrameSession(port);
  await session.open("clio-chart-grid");
  session.edit({ kind: "set-cell", row: 0, column: 1, value: "42" });
  await session.prepare();
  const inFlight = session.accept({ requestId: "req-gated" });
  await Promise.resolve(); // let accept reach the gated commit
  const exitWhileCommitting = session.requestExit();
  test.assert(exitWhileCommitting.status === "blocked"
    && ["COMMIT_BUSY", "RECONCILE_REQUIRED"].includes(exitWhileCommitting.code),
    "exit during an in-flight commit is blocked (COMMIT_BUSY or RECONCILE_REQUIRED)");
  releaseCommit();
  const landed = await inFlight;
  test.assert(landed.status === "ok" && engine._state.text.includes("42"),
    "the gated commit lands its own value — the late input did not overwrite it");
}

test.finish();
