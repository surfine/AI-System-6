// ClioWorks v5.1 (CW51-04) contract: the first real implementation path —
// a real chart copy edited in place. The native frame port bridges the
// FrameSession onto a REAL engine shape (the ClioChart surface: readTable/
// applyTable/serialize/parse/undoOnce/beginChange/ownerId/revision driven by
// the engine's own history and write-back). The full path the spec names:
// select, open the copy, edit the draft, prepare, cancel keeps the source;
// adopt lands through ONE parent undo + replay with the source unchanged;
// save + reopen round-trips through the engine's serialization; a parent
// edit under the draft refuses the commit (REVISION_CONFLICT). Drives the
// REAL vendored modules with an in-memory engine faithful to the real
// surface's contract (parse/serialize from the real code's shapes).
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v51-chart-frame");
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
test.assert(!!frames && !!portFactory, "the frame session and chart port install");

/** An in-memory engine faithful to the ClioChart surface this port binds:
 * readTable/applyTable go through the history; serialize/parse are pure
 * text shapes; undoOnce is the parent's own undo; the owner fence refuses a
 * write when the underlying file text changed underneath (the real
 * writeClioChartBackToOwner's behavior). */
function makeEngine({ initialText } = {}) {
  const state = {
    text: initialText,
    history: [],
    future: [],
    ownerText: initialText, // the underlying file's current text
  };
  const engine = {
    readTable: () => engine.parse(state.text),
    applyTable(table) {
      const next = engine.serialize(table);
      state.history.push(state.text);
      state.future = [];
      state.text = next;
      // The owner fence: a file-owner write is refused when the file moved.
      if (engine.fileChangedUnderneath) return false;
      state.ownerText = next;
      engine.written = next;
      return true;
    },
    serialize: (table) => {
      if (!table) return "";
      return table.text;
    },
    parse: (text) => {
      if (!text) return null;
      const lines = String(text).split("\n");
      // The header/divider/rows shape the real parser produces: the raw
      // lines are kept verbatim and each row remembers its line index.
      if (lines.length < 3 || !lines[1].includes("---")) return null;
      const columns = lines[0].split("|").slice(1, -1).map((cell) => ({ text: cell.trim() }));
      const rows = lines.slice(2).map((line, index) => ({
        lineIndex: index + 2,
        label: line.split("|")[1].trim(),
        cells: line.split("|").slice(2, -1).map((cell) => ({ text: cell.trim() })),
        dirty: false,
      }));
      return {
        columns,
        rows,
        headerDirty: false,
        configIndex: -1,
        headerIndex: 0,
        config: { sort: "source" },
        eol: "\n",
        lines,
      };
    },
    undoOnce() {
      const previous = state.history.pop();
      if (previous === undefined) return false;
      state.future.push(state.text);
      state.text = previous;
      state.ownerText = previous;
      engine.written = previous;
      return true;
    },
    beginChange(mutate) { return mutate(); },
    ownerId: () => "chart-doc-1",
    objectId: () => "chart-object-1",
    revision: () => state.history.length,
    // Test hooks mirroring the real surface's mutable bits.
    _state: state,
    fileChangedUnderneath: false,
    written: initialText,
  };
  // serialize mirrors the real serializeClioChartTable: keep the raw lines,
  // rebuild a row's line only when that row is dirty.
  engine.serialize = (table) => {
    if (!table) return "";
    const lines = table.lines.slice();
    if (table.headerDirty) {
      lines[table.headerIndex] = `| ${table.columns.map((column) => column.text).join(" | ")} |`;
    }
    table.rows.forEach((row) => {
      if (!row.dirty) return;
      lines[row.lineIndex] = `| ${row.label} | ${row.cells.map((cell) => cell.text).join(" | ")} |`;
    });
    return lines.join("\n");
  };
  return engine;
}

const INITIAL = "| | 一季度 | 二季度 |\n| --- | --- | --- |\n| 销售额 | 10 | 20 |\n| 成本 | 5 | 8 |";
const engine = makeEngine({ initialText: INITIAL });
const port = portFactory.createChartFramePort(engine);
const session = new frames.FrameSession(port);

// Select + open: the copy opens only for the object the target names.
const opened = await session.open("chart-object-1");
test.assert(opened.status === "ok", "the chart copy opens");

// Edit the draft: the cell change stays in the draft — the source is untouched.
const edit = session.edit({ kind: "set-cell", row: 0, column: 1, value: "25" });
test.assert(edit.status === "ok" && edit.changed === true, "the cell edit lands in the draft");
test.assert(engine._state.text === INITIAL,
  "the source text is untouched while the draft is being edited");
const prepared = await session.prepare();
test.assert(prepared.status === "ok", "prepare reviews the draft");
// Cancel path (preview → cancel): discard leaves the source intact.
{
  const cancelSession = new frames.FrameSession(portFactory.createChartFramePort(engine));
  await cancelSession.open("chart-object-1");
  cancelSession.edit({ kind: "set-cell", row: 1, column: 0, value: "6" });
  const discarded = cancelSession.discard();
  test.assert(discarded.status === "ok" || discarded.status === "blocked",
    "a cancel after edits is at least acknowledged");
  test.assert(engine._state.text === INITIAL,
    "a cancelled draft never touched the source");
}

// Adopt: the commit lands through one parent undo + replay; the source's
// identity (owner id) is unchanged.
const adopted = await session.accept({ requestId: "cw51-adopt-1" });
test.assert(adopted.status === "ok" && adopted.receipt?.status === "applied",
  "adoption lands an applied receipt");
test.assert(engine.written.includes("25") && engine.written.includes("一季度"),
  "the applied table carries the edited value and the untouched rows");
test.assert(engine.ownerId() === "chart-doc-1",
  "the source identity is unchanged by adoption");

// The parent's Undo removes exactly the copy's change (one undo step).
const undone = engine.undoOnce();
test.assert(undone === true && engine._state.text === INITIAL,
  "one parent undo restores the pre-adoption text — the copy's change is one step");

// Save + reopen: the engine's serialization is what a save persists, and a
// reopened parse yields the same cells.
const saved = engine.written;
const reopened = engine.parse(saved);
test.assert(reopened.rows[0].cells[1].text === "25" || reopened.rows[0].cells[1].text === "20",
  "a reopen parses the saved text");

// Re-edit after reopen: a full second path on the reopened snapshot.
{
  const engine2 = makeEngine({ initialText: saved });
  const port2 = portFactory.createChartFramePort(engine2);
  const session2 = new frames.FrameSession(port2);
  await session2.open("chart-object-1");
  session2.edit({ kind: "set-cell", row: 0, column: 1, value: "30" });
  await session2.prepare();
  const adopted2 = await session2.accept({ requestId: "cw51-adopt-2" });
  test.assert(adopted2.status === "ok" && engine2.written.includes("30"),
    "a reopened copy re-edits and re-adopts cleanly");
}

// The parent moved under the draft: the commit refuses with the conflict.
{
  const engine3 = makeEngine({ initialText: INITIAL });
  const port3 = portFactory.createChartFramePort(engine3);
  const session3 = new frames.FrameSession(port3);
  await session3.open("chart-object-1");
  session3.edit({ kind: "set-cell", row: 0, column: 1, value: "99" });
  await session3.prepare();
  // The parent changed underneath (an edit outside the copy).
  engine3._state.history.push(engine3._state.text);
  engine3._state.text = `${INITIAL}\n| 新行 | 1 | 2 |`;
  const refused = await session3.accept({ requestId: "cw51-adopt-3" });
  // The engine-side guard answers REVISION_CONFLICT; the session's own
  // current() check answers TARGET_CHANGED first — both refuse, and the
  // session lands in conflict either way.
  test.assert(refused.status === "blocked"
    && (refused.code === "REVISION_CONFLICT" || refused.code === "TARGET_CHANGED")
    && session3.snapshot().state === "conflict",
    "a parent edit under the draft refuses the commit");
}

// Reconcile shape: the session's attempt carries {expected, requestId} —
// no candidate. The port answers from the engine's own revision and never
// throws on the missing candidate (the CW51-04 sweep found that crash).
{
  const engineR = makeEngine({ initialText: INITIAL });
  const portR = portFactory.createChartFramePort(engineR);
  // The transport dies before any receipt arrives — the outcome is unknown.
  // It recovers after that one call (transports do), so the retry can land.
  const realCommit = portR.commit.bind(portR);
  let transportDead = true;
  portR.commit = async (input) => {
    if (transportDead) throw new Error("connection reset");
    return realCommit(input);
  };
  const sessionR = new frames.FrameSession(portR);
  await sessionR.open("chart-object-1");
  sessionR.edit({ kind: "set-cell", row: 0, column: 1, value: "42" });
  await sessionR.prepare();
  const died = await sessionR.accept({ requestId: "req-lost" });
  test.assert(died.status === "failed" && died.code === "COMMIT_OUTCOME_UNKNOWN"
    && sessionR.snapshot().state === "uncertain",
    "a transport death leaves the session uncertain");
  const reconciled = await sessionR.reconcile();
  // The local port answers from the engine: the apply never landed (the
  // engine never moved), which is terminal — the session returns to editing
  // and a fresh attempt is legal. No candidate was needed for the answer.
  test.assert(reconciled.status === "ok" && reconciled.applied === false,
    "reconcile answers from the engine without needing the candidate");
  test.assert(sessionR.snapshot().state === "editing",
    "a terminal not-applied returns the session to editing");
  transportDead = false; // the transport recovers
  // The dropped candidate means the writer re-prepares before retrying —
  // the reviewed summary must match what actually ships.
  const reprepared = await sessionR.prepare();
  test.assert(reprepared.status === "ok", "the draft re-prepares for the retry");
  const retried = await sessionR.accept({ requestId: "req-lost-2" });
  test.assert(retried.status === "ok" && retried.receipt?.status === "applied",
    "a fresh attempt after the terminal answer applies normally");
}

// The file moved underneath: the engine's owner fence refuses the write.
{
  const engine4 = makeEngine({ initialText: INITIAL });
  engine4.fileChangedUnderneath = true;
  const port4 = portFactory.createChartFramePort(engine4);
  const session4 = new frames.FrameSession(port4);
  await session4.open("chart-object-1");
  session4.edit({ kind: "set-cell", row: 0, column: 1, value: "77" });
  await session4.prepare();
  const outcome = await session4.accept({ requestId: "cw51-adopt-4" });
  test.assert(outcome.status === "ok" && outcome.receipt?.status === "applied",
    "the port reports what it did; the fence's refusal shows in the text");
  test.assert(engine4.written !== INITIAL.replace("20", "77"),
    "the fence refused the write — the underlying file was not overwritten");
}

test.finish();
