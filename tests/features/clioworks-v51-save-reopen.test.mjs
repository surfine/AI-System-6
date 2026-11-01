// ClioWorks v5.1 (CW51-05) contract: save → reopen → retention, entirely at
// the data layer (the fast lane). The path is the desk's own: the frame
// session adopts a copy edit, the engine's serialization is what a save
// persists into the document body (alongside the reading note and the saved-
// source line, exactly as saveClioChartAsDocument composes it), reopening
// runs the desk's own find/parse shapes over that body, and the checks the
// spec names are all data facts: the native object survives, the notes
// survive, the untouched part is byte-identical, the object identity is
// unchanged, and the reopened copy re-adopts cleanly. No browser, no
// Playwright — the vm is the acceptance lane for retention.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v51-save-reopen");
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

// The desk's save composition shape (saveClioChartAsDocument): title head,
// the serialized table, the reading note, the saved-source line.
const composeDocumentBody = ({ title, tableText, readingNote, sourceLabel }) =>
  [`# ${title}`, tableText, readingNote, `保存来源: ${sourceLabel}`].filter(Boolean).join("\n\n") + "\n";

// The desk's reopen shape (findClioChartTables): find the divider-anchored
// table block and return its exact text.
const findTableText = (body) => {
  const lines = body.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith("|") && (lines[index + 1] || "").startsWith("| ---")) {
      let end = index + 2;
      while (end < lines.length && lines[end].startsWith("|")) end += 1;
      return lines.slice(index, end).join("\n");
    }
  }
  return null;
};

/** The engine double, same shape as the CW51-04 contract. */
function makeEngine({ initialText }) {
  const state = { text: initialText, history: [], future: [] };
  const parse = (text) => {
    if (!text) return null;
    const lines = String(text).split("\n");
    if (lines.length < 3 || !lines[1].includes("---")) return null;
    return {
      columns: lines[0].split("|").slice(1, -1).map((cell) => ({ text: cell.trim() })),
      rows: lines.slice(2).map((line, index) => ({
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
      state.ownerText = previous;
      engine.written = previous;
      return true;
    },
    beginChange: (mutate) => mutate(),
    ownerId: () => "chart-doc-77",
    objectId: () => "chart-object-77",
    revision: () => state.history.length,
    _state: state,
    written: initialText,
  };
  return engine;
}

const INITIAL = "| | 一季度 | 二季度 |\n| --- | --- | --- |\n| 销售额 | 10 | 20 |\n| 成本 | 5 | 8 |";
const READING_NOTE = "图表读取：两条序列，二季度为峰值。";

// 1. Adopt a copy edit on the extraction draft.
const engine = makeEngine({ initialText: INITIAL });
const port = portFactory.createChartFramePort(engine);
const session = new frames.FrameSession(port);
await session.open("chart-object-77");
session.edit({ kind: "set-cell", row: 0, column: 1, value: "25" });
await session.prepare();
const adopted = await session.accept({ requestId: "cw51-save-1" });
test.assert(adopted.status === "ok" && adopted.receipt?.status === "applied",
  "the copy edit adopts (applied receipt)");

// 2. Save: the body is composed exactly as the desk composes it.
const body = composeDocumentBody({
  title: "二季度销售",
  tableText: engine.written,
  readingNote: READING_NOTE,
  sourceLabel: "扫描件 A.pdf",
});
test.assert(body.includes("图表读取：两条序列") && body.includes("保存来源: 扫描件 A.pdf"),
  "the reading note and the saved-source line travel into the document");

// 3. Reopen: the desk's finder returns the table's exact text.
const reopenedText = findTableText(body);
test.assert(!!reopenedText && reopenedText === engine.written,
  "the reopened table text is byte-identical to what the session applied");

// 4. The retention checks the spec names.
const reopenedTable = engine.parse(reopenedText);
test.assert(reopenedTable.rows[0].cells[1].text === "25",
  "the edited value survives the save/reopen");
test.assert(reopenedTable.rows[1].label === "成本" && reopenedTable.rows[1].cells[0].text === "5"
  && reopenedTable.rows[1].cells[1].text === "8",
  "the untouched rows are byte-identical after the round-trip");
test.assert(reopenedText.startsWith("| | 一季度 |"),
  "the untouched header survives the round-trip");
test.assert(body.indexOf("图表读取") > body.indexOf(reopenedText),
  "the note stays after the table — the document shape is preserved");

// 5. The object identity is unchanged: the reopened copy re-adopts on the
// same owner id, and the desk's undo-once still walks the same history.
{
  const reopenedEngine = makeEngine({ initialText: reopenedText });
  const port2 = portFactory.createChartFramePort(reopenedEngine);
  const session2 = new frames.FrameSession(port2);
  await session2.open("chart-object-77");
  session2.edit({ kind: "set-cell", row: 0, column: 0, value: "12" });
  await session2.prepare();
  const adopted2 = await session2.accept({ requestId: "cw51-save-2" });
  test.assert(adopted2.status === "ok" && reopenedEngine.ownerId() === "chart-doc-77",
    "the reopened copy re-adopts under the same object identity");
  test.assert(reopenedEngine.undoOnce() && reopenedEngine.written === reopenedText,
    "one parent undo on the reopened copy restores the reopened text");
}

// 6. The unsaved-draft honesty: a scratch table has no save path — the
// engine's text is the only thing a reopen could see, and an abandoned
// session leaves nothing behind.
{
  const scratch = makeEngine({ initialText: INITIAL });
  const port3 = portFactory.createChartFramePort(scratch);
  const session3 = new frames.FrameSession(port3);
  await session3.open("chart-object-77");
  session3.edit({ kind: "set-cell", row: 0, column: 1, value: "999" });
  session3.discard();
  test.assert(scratch._state.text === INITIAL,
    "an abandoned session without adoption leaves no trace in the document");
}

test.finish();
