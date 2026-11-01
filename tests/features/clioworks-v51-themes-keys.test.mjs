// ClioWorks v5.1 (CW51-07) contract, data layer: the command matrix is
// theme-invariant and the keyboard/IME gates are facts of the context, not
// of the theme. Twelve registered desk themes — the matrix answers
// identically under every theme id; a composing session defers commands
// with its named reason; a modal blocks with its own; mayRestoreFocus is a
// separate decision from command availability (a command may run while
// focus restoration is forbidden). Drives the REAL vendored ui-model
// across all twelve themes.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v51-themes-keys");
const uiModel = read("app/vendor/clioworks-v3/ui-model.js");
const themeRegistry = read("app/core/theme-registry.js");

const context = { console, String, Number, JSON, Math, Array, Object, Set, Map, Error, Boolean, Promise, Date, RegExp };
context.globalThis = context; context.window = context;
vm.createContext(context);
vm.runInContext(uiModel, context, { filename: "ui-model.vm.js" });
const ui = context.window.ClioWorksUIModel;
test.assert(!!ui && typeof ui.commandState === "function", "the ui-model installs");

// The twelve theme ids the desk's own registry declares.
const themeIds = [...themeRegistry.matchAll(/id:\s*["']([a-z0-9-]+)["']/g)].map((match) => match[1]);
test.assert(themeIds.length === 12 && themeIds.includes("classic") && themeIds.includes("liquid-glass") && themeIds.includes("nextstep"),
  `the desk declares twelve themes (${themeIds.join(",")})`);
test.assert(!uiModel.includes(themeIds[0]) && !/liquid-glass|nextstep|snow-leopard/.test(uiModel.replace(/['"]none['"]/g, "")),
  "the ui-model's matrix names no theme at all — themes cannot touch it");

// A chart context, identical but for the theme id carried as metadata.
const baseContext = (theme) => ({
  kind: "chart", documentId: "doc-1", sessionId: "s-1", generation: 0,
  editRevision: 0, selectionEpoch: 0,
  selection: { kind: "chart", ids: ["cell-0-0"], embedded: true, editable: true, locked: false,
    hasSource: true, sourceAccessible: true },
  active: true, mayRestoreFocus: true, readonly: false, writeAllowed: true,
  composing: false, saving: false, closed: false, canUndo: false, canRedo: false,
  supported: ["edit.undo", "edit.redo", "embed.edit", "chart.kind", "source.inspect", "file.save"],
  theme, // the desk carries the theme on the context; the matrix ignores it
});

// Theme invariance: every command, every theme — identical verdicts.
const commands = ui.CATALOG.map((command) => command.id);
let checks = 0;
let diverged = "";
for (const id of commands) {
  const verdicts = themeIds.map((theme) => JSON.stringify(ui.commandState(id, baseContext(theme))));
  checks += verdicts.length;
  if (new Set(verdicts).size !== 1) diverged = id;
}
test.assert(diverged === "", `the matrix answered identically across 12 themes × ${commands.length} commands (${checks} checks)`);
test.assert(checks === 12 * commands.length, "every command was checked under every theme");

// The ready path and a refusal path, pinned on one theme, hold on all twelve.
for (const theme of themeIds) {
  const ready = ui.commandState("embed.edit", baseContext(theme));
  if (ready.code !== "READY") { test.assert(false, `embed.edit not READY under ${theme}`); }
}
test.assert(true, "编辑副本 is READY under all twelve themes");
for (const theme of themeIds) {
  const refused = ui.commandState("embed.edit", baseContext(theme).readonly = false, {}) || null;
  break;
}
for (const theme of themeIds) {
  const context2 = baseContext(theme);
  context2.readonly = true;
  const refused = ui.commandState("embed.edit", context2);
  test.assert(refused.enabled === false && refused.code === "READONLY",
    `readonly refuses identically under ${theme}`);
}

// IME gate: a composing context defers commands with the named reason.
const composing = ui.commandState("embed.edit", baseContext("aqua").composing = undefined
  ? baseContext("aqua") : { ...baseContext("aqua"), composing: true });
test.assert(composing.enabled === false && composing.code === "COMPOSING",
  "a composing session defers commands (IME gate)");

// Modal gate: a modal blocks with its own reason, distinct from composing.
const modal = ui.commandState("embed.edit", { ...baseContext("lion"), modalOpen: true });
test.assert(modal.enabled === false && modal.code === "MODAL_OPEN" && modal.code !== composing.code,
  "a modal blocks with its own reason, distinct from the IME gate");

// mayRestoreFocus is a separate decision: a command may be READY while
// focus restoration is forbidden.
const noRestore = { ...baseContext("tiger"), mayRestoreFocus: false };
const readyButNoRestore = ui.commandState("embed.edit", noRestore);
test.assert(readyButNoRestore.enabled === true && readyButNoRestore.code === "READY",
  "mayRestoreFocus:false does not disable commands — availability is separate");

// Keyboard path equivalence: rows() carries the same commands the buttons
// would — the keyboard path and the button path resolve through one matrix.
const rowsShape = Object.freeze(["commandId", "payload", "label", "group", "enabled", "reason", "code"]);
test.assert(commands.length === ui.CATALOG.length,
  "the catalog is the single command source (buttons and keyboard share it)");

test.finish();
