// ClioWorks v5.1 (CW51-06) contract: the copy path grows within scope —
// table structure ops (add-row / remove-row / add-column) replay
// deterministically through the frame port, and an image region anchor
// rides the copy as metadata (the source image's bytes are never an input
// to the replay, and the anchor keeps the M01 facts: box, declared scope,
// context sufficiency). Drives the REAL port with the same faithful engine
// double as CW51-04.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v51-table-image-scope");
const frameSession = read("app/vendor/clioworks-v3/frame-session.js");
const portSource = read("app/vendor/clioworks-v3/chart-frame-port.js");

const context = {
  console, String, Number, JSON, Math, Array, Object, Set, Map, WeakMap, Error, Boolean, Promise,
  Date, RegExp, AbortController,
  crypto: { randomUUID: () => `op-${Math.random().toString(36).slice(2, 10)}` },
};
context.globalThis = context; context.window = context;
vm.createContext(context);
vm.runInContext(frameSession, context, { filename: "frame-session.vm.js" });
vm.runInContext(portSource, context, { filename: "chart-frame-port.vm.js" });
const frames = context.window.ClioWorksFrames;
const portFactory = context.window.AISystem6ChartFramePort;

function makeEngine({ initialText }) {
  const state = { text: initialText, history: [], future: [] };
  const parse = (text) => {
    if (!text) return null;
    const lines = String(text).split("\n");
    // A divider-only tail is a valid 0-row table (the real parser accepts it).
    if (lines.length < 2 || !lines[1].includes("---")) return null;
    return {
      columns: lines[0].split("|").slice(1, -1).map((cell) => ({ text: cell.trim() })),
      rows: lines.slice(2).filter((line) => line.trim()).map((line, index) => ({
        lineIndex: lines.indexOf(line),
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
      state.ownerText = state.text;
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
    ownerId: () => "chart-doc-9",
    objectId: () => "chart-object-9",
    revision: () => state.history.length,
    _state: state,
    written: initialText,
  };
  return engine;
}

const INITIAL = "| | 一季度 | 二季度 |\n| --- | --- | --- |\n| 销售额 | 10 | 20 |\n| 成本 | 5 | 8 |";

// Structure ops: add a row, fill it, remove it — each replays cleanly.
{
  const engine = makeEngine({ initialText: INITIAL });
  const session = new frames.FrameSession(portFactory.createChartFramePort(engine));
  await session.open("chart-object-9");
  session.edit({ kind: "add-row", label: "利润" });
  session.edit({ kind: "set-cell", row: 1, column: 1, value: "4" });
  const prepared = await session.prepare();
  test.assert(prepared.status === "ok" && prepared.summary.includes("3 行"),
    "the added row is part of the reviewed draft");
  const adopted = await session.accept({ requestId: "cw51-add-row" });
  test.assert(adopted.status === "ok" && engine.written.includes("利润") && engine.written.includes("4"),
    "the added row adopts with its filled cell");
  test.assert(engine.undoOnce() && engine._state.text === INITIAL,
    "one parent undo removes the row addition as one step");
}

{
  const engine = makeEngine({ initialText: INITIAL });
  const session = new frames.FrameSession(portFactory.createChartFramePort(engine));
  await session.open("chart-object-9");
  session.edit({ kind: "remove-row", row: 1 });
  const prepared = await session.prepare();
  test.assert(prepared.status === "ok", "the smaller draft reviews");
  const adopted = await session.accept({ requestId: "cw51-remove-row" });
  test.assert(adopted.status === "ok" && !engine.written.includes("成本")
    && engine.written.includes("销售额"),
    "a removed row leaves the other rows intact");
}

{
  const engine = makeEngine({ initialText: INITIAL });
  const session = new frames.FrameSession(portFactory.createChartFramePort(engine));
  await session.open("chart-object-9");
  session.edit({ kind: "add-column", label: "三季度" });
  const prepared = await session.prepare();
  test.assert(prepared.status === "ok", "the widened draft reviews");
  const adopted = await session.accept({ requestId: "cw51-add-column" });
  test.assert(adopted.status === "ok" && engine.written.includes("三季度"),
    "an added column adopts through the header line");
}

// The engine invariant: a chart table keeps at least one row — removing
// the last data row is inert, not a table-corrupting edit.
{
  const single = makeEngine({ initialText: "| | 一季度 |\n| --- | --- |\n| 销售额 | 10 |" });
  const sessionS = new frames.FrameSession(portFactory.createChartFramePort(single));
  await sessionS.open("chart-object-9");
  const inert = sessionS.edit({ kind: "remove-row", row: 0 });
  test.assert(inert.status === "ok" && inert.changed === false && single._state.text.includes("销售额"),
    "removing the last data row changes nothing (the engine's own invariant)");
}

// The image region anchor: metadata on the copy, M01 facts intact.
{
  const engine = makeEngine({ initialText: INITIAL });
  const session = new frames.FrameSession(portFactory.createChartFramePort(engine));
  await session.open("chart-object-9");
  const anchorEdit = session.edit({
    kind: "attach-region",
    anchor: {
      kind: "region", pageIndex: 0, box: [10, 20, 200, 100],
      originalWidth: 800, originalHeight: 600,
      sawWholeImage: false, contextKinds: ["legend"], contextSufficient: true,
    },
  });
  test.assert(anchorEdit.status === "ok" && session.dirty === true,
    "attaching a region dirties the draft");
  const prepared = await session.prepare();
  test.assert(prepared.summary.includes("1 个区域注记"),
    "the region travels into the reviewed candidate");
  const sourceBytesBefore = engine._state.text;
  const adopted = await session.accept({ requestId: "cw51-region" });
  test.assert(adopted.status === "ok" && engine._state.text === sourceBytesBefore,
    "the region anchor is metadata — the source text is untouched by it");
  test.assert(adopted.receipt?.status === "applied",
    "the region-carrying adoption lands");
}

// Mismatch shapes stay inert: a region without a box, an unknown op.
{
  const engine = makeEngine({ initialText: INITIAL });
  const session = new frames.FrameSession(portFactory.createChartFramePort(engine));
  await session.open("chart-object-9");
  const noBox = session.edit({ kind: "attach-region", anchor: { kind: "region" } });
  test.assert(noBox.status === "ok" && session.dirty === false,
    "a region without a box changes nothing");
  const unknown = session.edit({ kind: "teleport-table" });
  test.assert(unknown.status === "ok" && session.dirty === false,
    "an unknown op is inert, not an error");
}

test.finish();
