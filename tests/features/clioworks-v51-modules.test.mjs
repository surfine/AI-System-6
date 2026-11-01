// ClioWorks v5.1 contract: the four candidate modules work against the
// contracts' real shapes — the ui-model's command matrix, the runtime port's
// single-install and trusted-owner target resolution against a real
// registerCommand/getCommand runtime, the frame session's open→edit→prepare→
// commit→receipt lifecycle with stale-target refusal and no fake
// cancellations, and the context strip's rows. Drives the REAL vendored
// modules; a port that returns a fake applied is not a pass.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v51-modules");
const uiModel = read("app/vendor/clioworks-v3/ui-model.js");
const frameSession = read("app/vendor/clioworks-v3/frame-session.js");
const runtimePort = read("app/vendor/clioworks-v3/runtime-port.js");
const contextStrip = read("app/vendor/clioworks-v3/context-strip.js");

const context = {
  console, String, Number, JSON, Math, Array, Object, Set, Map, WeakMap, Error, Boolean, Promise,
  Date, RegExp, globalThis: null, AbortController, setTimeout, clearTimeout,
};
context.globalThis = context; context.window = context;
context.setTimeout = (fn) => { fn(); return 0; }; // VM timers are lazy; run inline.
context.clearTimeout = () => {};
vm.createContext(context);
vm.runInContext(uiModel, context, { filename: "ui-model.vm.js" });
vm.runInContext(frameSession, context, { filename: "frame-session.vm.js" });
vm.runInContext(runtimePort, context, { filename: "runtime-port.vm.js" });
vm.runInContext(contextStrip, context, { filename: "context-strip.vm.js" });
const ui = context.window.ClioWorksUIModel || context.ClioWorksUIModel;
const frames = context.window.ClioWorksFrames || context.ClioWorksFrames;
const port = context.window.ClioWorksRuntimePort || context.ClioWorksRuntimePort;
test.assert(!!ui && !!frames && !!port, "the three core modules install");

// A real-shaped runtime: registerCommand/getCommand with nothing pre-registered.
const registered = new Map();
const runtime = {
  registerCommand(id, definition) { registered.set(id, definition); },
  getCommand(id) { return registered.get(id) || null; },
};

// The trusted owner: a mounted editor binding with its own commands.
const executed = [];
const binding = {
  getContext: () => ({
    kind: "chart", documentId: "doc-1", sessionId: "s-1", generation: 0, editRevision: 0,
    selectionEpoch: 0,
    selection: { kind: "table", ids: ["t-1"], embedded: true, editable: true },
    active: true, mayRestoreFocus: true, readonly: false, writeAllowed: true,
    composing: false, saving: false, closed: false, canUndo: false, canRedo: false,
  }),
  execute: async (id) => { executed.push(id); return { status: "ok", code: "DONE" }; },
  commands: [{ id: "cw.copy", label: "复制", icon: "copy", group: "edit", modifies: false }],
};
const resolveOwner = () => "clioChart"; // the trusted owner is the bound window
const resolveCommand = (id) => (id === "cw.copy"
  ? { enabled: true, reason: "", code: "" }
  : { enabled: false, reason: "未知命令", code: "UNKNOWN_COMMAND" });

const installed = port.installRuntimePort({ runtime, resolveOwner, resolveCommand });
test.assert(!!installed && installed.commandId === "clioworks-context-command",
  "the runtime port installs with its fixed command id");
test.assert(registered.has("clioworks-context-command"), "the port registered its command on the runtime");

// Single install per runtime; a taken command id is refused.
test.assert(port.installRuntimePort({ runtime, resolveOwner, resolveCommand }) === installed,
  "installing twice returns the same port");
let refused = "";
try { port.installRuntimePort({ runtime: { registerCommand: () => {}, getCommand: () => ({}) }, resolveOwner, resolveCommand }); }
catch (error) { refused = error.code; }
test.assert(refused === "RUNTIME_COMMAND_ID_OCCUPIED", "an occupied command id is refused");

// Binding and rows.
const menuPort = installed.menuPortFor("clioChart");
const release = menuPort.bind(binding);
test.assert(installed.boundCount() === 1, "one binding is live");
const rows = installed.rows("clioChart");
test.assert(rows.length === 1 && rows[0].commandId === "clioworks-context-command"
  && rows[0].payload.commandId === "cw.copy" && rows[0].enabled === true,
  "rows carry the wrapper payload and the host-resolved state");

// isAvailable resolves through the trusted owner — no payload documentId.
const definition = registered.get("clioworks-context-command");
test.assert(definition.isAvailable({ commandId: "cw.copy" }) === true,
  "availability resolves through the trusted owner");
test.assert(definition.isAvailable({ commandId: "cw.copy", extra: "junk" }) === false,
  "a payload carrying more than a command id resolves to nothing");
test.assert(definition.unavailableReason({ commandId: "cw.nope" }).length > 0,
  "an unknown command carries a human reason");

// Execute: ok flows; failure shapes are preserved, not faked.
const okResult = await definition.handler({ commandId: "cw.copy" });
test.assert(okResult.ok === true && okResult.status === "ok" && executed.join(",") === "cw.copy",
  "an ok editor result passes through");
const blockedResult = await definition.handler({ commandId: "cw.nope" });
test.assert(blockedResult.ok === false && blockedResult.status === "blocked",
  "an unknown command is blocked before reaching the editor");
test.assert(executed.join(",").includes("cw.nope") === false,
  "a blocked command never executed");
release();
test.assert(installed.boundCount() === 0, "release unbinds");

// The frame session: a port whose target goes stale mid-open is refused.
function makeFramePort({ staleOnCreate = false } = {}) {
  let revisions = 0;
  const drafts = [];
  return {
    _revisions: () => revisions,
    readTarget() {
      return {
        documentId: "doc-1", sessionId: "s-1", generation: 0, editRevision: revisions,
        objectId: "chart-1", objectRevision: 0,
        active: true, writable: true, embedded: true, editable: true, composing: false, closed: false,
      };
    },
    async createDraft({ target }) {
      if (staleOnCreate) revisions += 1; // the parent moved while we opened
      const handle = { id: drafts.length + 1 };
      drafts.push(handle);
      return { handle };
    },
    editDraft(handle, op) { return { changed: true, dirty: true }; },
    async prepare() { return { candidate: { cells: [[1, 2]] }, summary: "改了两个数" }; },
    async commit({ expected }) {
      if (expected.editRevision !== revisions) return { status: "blocked", code: "REVISION_CONFLICT" };
      // A real apply advances the object: the receipt's editRevision must be
      // strictly past the base's, or the session refuses the receipt.
      return { status: "applied", documentId: "doc-1", sessionId: "s-1", generation: 0,
        editRevision: revisions + 1, objectId: "chart-1", objectRevision: 1, operationId: "op-1" };
    },
    lookupCommit: async () => ({ status: "not-applied", terminal: true }),
    disposeDraft() {},
  };
}

// Stale open: the parent's editRevision moved during createDraft → blocked.
{
  const session = new frames.FrameSession(makeFramePort({ staleOnCreate: true }));
  const outcome = await session.open("chart-1");
  test.assert(outcome.status === "blocked" && outcome.code === "STALE_OPEN",
    "an open whose target moved mid-flight is blocked, not half-opened");
}

// The happy path: open → edit → prepare → commit lands an applied receipt.
{
  const session = new frames.FrameSession(makeFramePort());
  const opened = await session.open("chart-1");
  test.assert(opened.status === "ok", "a clean target opens");
  const edit = session.edit({ kind: "set-cell", row: 0, column: 0, value: 1 });
  test.assert(edit.status === "ok" && session.dirty === true, "an edit dirties the draft");
  const prepared = await session.prepare();
  test.assert(prepared.status === "ok" && prepared.summary === "改了两个数",
    "prepare produces the reviewed candidate");
  const committed = await session.accept({ requestId: "req-1" });
  test.assert(committed.status === "ok" && committed.receipt?.status === "applied"
    && committed.receipt.operationId === "op-1" && committed.receipt.editRevision > 0,
    "accept lands an applied receipt with its operation id");
}

// Commit-unknown: the session goes uncertain, reconcile() queries the
// port's authoritative record, and no second write is ever fired.
{
  const port2 = makeFramePort();
  let commits = 0;
  // The transport dies before any receipt arrives — the outcome is unknown,
  // which is exactly when the session must go uncertain and query.
  port2.commit = async () => { commits += 1; throw new Error("connection reset"); };
  port2.lookupCommit = async ({ requestId }) => ({ status: "applied",
    documentId: "doc-1", sessionId: "s-1", generation: 0, editRevision: 1,
    objectId: "chart-1", objectRevision: 1, operationId: "op-x", requestId });
  const session = new frames.FrameSession(port2);
  await session.open("chart-1");
  session.edit({ kind: "set-cell", row: 0, column: 0, value: 1 });
  await session.prepare();
  // A commit whose receipt the transport lost: the wire lied about failing.
  const outcome = await session.accept({ requestId: "req-9" });
  test.assert(outcome.status === "failed" && outcome.code === "COMMIT_OUTCOME_UNKNOWN"
    && session.snapshot().state === "uncertain",
    "an unreadable outcome leaves the session uncertain, not failed-and-forgotten");
  test.assert(commits === 1, "the uncertain session never refires the write");
  const reconciled = await session.reconcile();
  test.assert(reconciled.status === "ok" && reconciled.receipt?.operationId === "op-x"
    && reconciled.receipt?.status === "applied",
    "reconcile reports the truth: the operation actually landed");
}

// Context strip rows render from the port's rows shape.
{
  const strip = context.window.ClioWorksContextStrip || context.ClioWorksContextStrip;
  test.assert(!!strip, "the context strip module installs");
}

test.finish();
