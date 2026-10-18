// ClioWorks S11 M1 contract: the workbook on the real desk (spec §15.2).
//
// Boots the real eager module set, loads the ClioChart and workbook modules through
// the desk's own lazy loaders, mounts the frozen budget-s11.xlsx through the REAL
// ledger-adapter, and drives the seams that live outside the workbook module:
//   - the menu bar: 存储 / 复原到上次存储… (File), 完整编辑 (View), 加批注… (Edit) are
//     listed only for a mounted workbook, grey with a reason when the workbook's own
//     commandState says no, and ⌘E through the menu is the same switch as the status
//     bar's and never touches dirty;
//   - the chart's commands (Chart menu, ⌘1–6, ⌘R) are refused while a workbook is
//     mounted, with a reason, and run again after it unmounts;
//   - ⌘M with a workbook in front adds a comment and does not minimize; without one
//     it still minimizes;
//   - the close box and switchProject ask about unsaved edits, and Cancel aborts.
import { readFileSync } from "node:fs";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("clioworks-s11-m1-desk-glue");
const fixture = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/budget-s11.xlsx")));

const isShimNode = (value) => !!value && typeof value === "object" && (typeof value.tagName === "string" || typeof value.nodeType === "number");

async function bootDesk() {
  const vm = createAppBootVm({ location: { href: "http://localhost/", reload: () => {}, search: "" } });
  Object.defineProperty(vm.window.Node, Symbol.hasInstance, { value: isShimNode });
  const createElement = vm.document.createElement;
  vm.document.createElement = (tag) => {
    const el = createElement(tag);
    if (typeof el.getClientRects !== "function") el.getClientRects = () => [];
    return el;
  };
  await vm.settleBoot();
  return vm;
}

const vm = await bootDesk();
const w = vm.window;
vm.run('openWindow("clioChart")');
await vm.waitFor(() => w.AISystem6ClioChartLoaded);
await vm.run("ensureClioChartWorkbookModule()");
await vm.run("ensureLazySystemModule('app/vendor/clioworks-v3/ledger-adapter.js', 'ClioWorksLedgerAdapter')");
test.assert(!!w.AISystem6ClioChartWorkbook && !!w.ClioWorksLedgerAdapter, "workbook module and real ledger adapter loaded");

const SHEET = "预算";
const doc = vm.document;
const chartWin = doc.querySelector('[data-window="clioChart"]');
// Shim patch: the shim's static elements carry no ownerDocument; the surface builds its DOM through it.
chartWin.ownerDocument = doc;
// Shim patch: the shim has no :scope or child combinators, and no title bar built for this window; the desk's minimizable-window test asks for its close box.
const shimQuery = chartWin.querySelector.bind(chartWin);
const withCloseBox = (on) => { chartWin.querySelector = on ? (selector) => (String(selector).includes(".close-box") ? {} : shimQuery(selector)) : shimQuery; };
const menuRow = (action) => doc.querySelector(`[data-app-menu] [data-action="${action}"]`);
const menuOf = (id) => doc.querySelector(`[data-app-menu][data-menu-id="${id}"]`);
const rowState = (action) => {
  const el = menuRow(action);
  return el ? { hidden: el.classList.contains("is-hidden"), disabled: !!el.disabled, checked: el.classList.contains("is-checked"), help: el.dataset.balloonHelp || "" } : null;
};
const refresh = () => { vm.run("updateMenuState()"); };
const fire = (key, extra = {}) => {
  const event = { type: "keydown", key, metaKey: true, target: doc.body, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
  doc.dispatchEvent(event);
  return event;
};
const answers = [];
const asked = [];
w.showSystemModal = async (message, kind, options) => { asked.push({ message, kind, options }); return answers.length ? answers.shift() : "cancel"; };
const saves = [];
const hostWith = (revert) => {
  w.AISystem6ClioWorks = {
    saveNativeDocument: async (name) => { saves.push(name); return { ok: true }; },
    ...(revert ? { revertNativeDocument: async () => ({ ok: true }) } : {}),
  };
};
const mount = async (name = "budget-s11.xlsx") => {
  const adapter = await w.ClioWorksLedgerAdapter.open(fixture, { name });
  const out = await w.AISystem6ClioChartWorkbook.open({ liveAdapter: adapter, mountedName: name, fileName: name }, {});
  refresh();
  return { adapter, out };
};
let commentOpens = 0;
const realComments = w.AISystem6ClioChartComments;
w.AISystem6ClioChartComments = { ...realComments, open: () => { commentOpens += 1; return { close() {}, refresh() {} }; } };

// ---- minimize still works on a chart with no workbook -------------------------
w.AISystem6Theme = { ...w.AISystem6Theme, hasCapability: () => true };
w.localStorage.setItem("ai-system-6-minimize", JSON.stringify({ enabled: true }));
await vm.run("ensureLazySystemModule('app/core/window-minimize.js', 'AISystem6WindowMinimizeLoaded')");
vm.run('focusWindow(getWindow("clioChart"))');
vm.run('renderAppMenuBar("clioChart", { force: true })');
refresh();
test.assert(w.AISystem6WindowMinimize.minimizeEnabled() === true, "(control) the desk's Minimize is switched on in this harness");
withCloseBox(true);
fire("m");
await vm.settleBoot();
withCloseBox(false);
test.assert(chartWin.classList.contains("is-minimized"), "no workbook: ⌘M minimizes the front window as before");
w.AISystem6WindowMinimize.restore(chartWin);
chartWin.classList.remove("is-minimized");
vm.run('focusWindow(getWindow("clioChart"))');

// ---- before a workbook: nothing of it shows, the chart's commands are live --------
test.assert(rowState("clio-chart-workbook-save")?.hidden === true && rowState("clio-chart-workbook-revert")?.hidden === true && rowState("clio-chart-workbook-comment")?.hidden === true,
  "no workbook: 存储, 复原到上次存储… and 加批注… are not listed");
test.assert(menuOf("view")?.classList.contains("is-hidden") === true, "no workbook: the 查看 menu (完整编辑) is not listed");
test.assert(w.AISystem6Runtime.commandAvailability("clio-chart-matrix").available === true, "no workbook: the chart's own commands stay available");

// ---- a workbook whose host has no revert ------------------------------------------------
hostWith(false);
let { adapter, out } = await mount();
test.assert(out.ok === true && w.AISystem6ClioChartWorkbook.current()?.mountedName === "budget-s11.xlsx", "the budget workbook mounts through the real ledger adapter");
test.assert(rowState("clio-chart-workbook-save")?.hidden === false && menuOf("view")?.classList.contains("is-hidden") === false,
  "a mounted workbook lists 存储 (File) and 完整编辑 (查看)");
test.assert(rowState("clio-chart-workbook-revert")?.hidden === true, "a host without revert: 复原到上次存储… is not listed at all");
test.assert(rowState("clio-chart-workbook-comment")?.hidden === false && rowState("clio-chart-workbook-comment")?.disabled === false, "加批注… is listed and live when the adapter carries comments");
let save = rowState("clio-chart-workbook-save");
test.assert(save.disabled === true && save.help === w.AISystem6ClioChartWorkbook.commandState("file.save").reason && save.help.length > 0,
  `a clean workbook: 存储 is grey and gives the workbook's own reason (${save.help})`);
test.assert(menuRow("clio-chart-workbook-save").dataset.shortcut === "⌘S" && menuRow("clio-chart-workbook-mode").dataset.shortcut === "⌘E" && menuRow("clio-chart-workbook-comment").dataset.shortcut === "⌘M",
  "the rows show ⌘S, ⌘E and ⌘M");

// The chart underneath is hidden: its commands leave the menus (hidden, not grey: Q-M1-6)
// and the keys still refuse with a reason.
test.assert(menuOf("chart")?.classList.contains("is-hidden") === true, "a mounted workbook hides the whole Chart menu");
for (const action of ["clio-chart-import", "clio-chart-from-text", "clio-chart-save-document", "clio-chart-save-template", "clio-chart-hand-back"]) {
  test.assert(rowState(action)?.hidden === true, `${action} is not listed in File while a workbook is mounted`);
}
const templateMenu = [...doc.querySelectorAll("[data-app-menu] .menu-submenu")].find((el) => el.querySelector('[data-action="clio-chart-new-blank"]'));
test.assert(!!templateMenu && templateMenu.classList.contains("is-hidden"), "the 'New from template' submenu is hidden with its seven rows");
const fileVisibleChartRows = [...menuOf("file").querySelectorAll("[data-action]")].filter((el) => el.dataset.action.startsWith("clio-chart-") && !el.dataset.action.startsWith("clio-chart-workbook-") && !el.classList.contains("is-hidden") && !el.closest(".menu-submenu.is-hidden"));
test.assert(fileVisibleChartRows.length === 0, `File lists no chart command (${fileVisibleChartRows.map((el) => el.dataset.action).join(",")})`);
test.assert(rowState("clio-chart-bars")?.disabled === true && rowState("clio-chart-reverse-sort")?.disabled === true, "(keys) the hidden chart rows are still refused");
const projectionBefore = vm.run("clioChartState.projection");
await vm.run('handleAction("clio-chart-matrix")');
fire("2");
test.assert(vm.run("clioChartState.projection") === projectionBefore, "⌘2 and the Chart menu do not command the hidden chart");
test.assert(w.AISystem6Runtime.commandAvailability("clio-chart-score").reason === "clio_chart_workbook_reason_chart_off", "the runtime names the reason for any chart command");

// ⌘E: the menu, the key and the status bar are one switch; none touches dirty.
adapter.setCell(SHEET, "B2", { value: 250 });
refresh();
test.assert(adapter.isDirty() === true && rowState("clio-chart-workbook-save").disabled === false, "an edited workbook: 存储 turns live");
test.assert(rowState("clio-chart-workbook-mode").checked === false, "Express: 完整编辑 is unticked");
await vm.run('handleAction("clio-chart-workbook-mode")');
refresh();
test.assert(w.AISystem6ClioChartWorkbook.current().mode === "full" && rowState("clio-chart-workbook-mode").checked === true, "choosing 完整编辑 from the menu switches the workbook and ticks the row");
test.assert(adapter.isDirty() === true && w.AISystem6ClioChartWorkbook.current().dirty === true && saves.length === 0, "switching mode neither saves nor changes dirty");
const eKey = fire("e");
refresh();
test.assert(eKey.defaultPrevented && w.AISystem6ClioChartWorkbook.current().mode === "express" && rowState("clio-chart-workbook-mode").checked === false && adapter.isDirty() === true,
  "⌘E (focus outside the grid) is the same switch, back to Express, dirty untouched");
const composing = fire("e", { isComposing: true });
test.assert(!composing.defaultPrevented && w.AISystem6ClioChartWorkbook.current().mode === "express", "⌘E during composition is not taken");

// ⌘M with a workbook in front adds a comment and does not minimize.
withCloseBox(true);
const mKey = fire("m");
await vm.settleBoot();
withCloseBox(false);
test.assert(mKey.defaultPrevented && commentOpens === 1 && !chartWin.classList.contains("is-minimized"), "⌘M with a workbook in front opens 加批注… and does not minimize");
const mComposing = fire("m", { isComposing: true });
test.assert(commentOpens === 1 && !mComposing.defaultPrevented, "⌘M during composition is not taken by the workbook");

// ---- the close box --------------------------------------------------------------------------
answers.push("cancel");
let closed = await vm.run('closeWindow("clioChart")');
test.assert(closed === false && asked.length === 1 && asked[0].kind === "confirm" && asked[0].options?.confirmKey === "clio_chart_workbook_cmd_save" && asked[0].options?.altKey === "clio_chart_workbook_dont_save" && asked[0].options?.defaultAction === "cancel", "the close box over unsaved edits asks the three-way question in the surface's own words (存储 / 不存储 / 取消), default Cancel");
test.assert(!chartWin.classList.contains("is-hidden") && !!w.AISystem6ClioChartWorkbook.current(), "Cancel keeps the window and the workbook");
test.assert(chartWin.classList.contains("is-workbook-mounted"), "and the workbook still owns the window's chrome");

// ---- switching project -----------------------------------------------------------------------
vm.run('projects.push({ id: "glue-other", name: "Other", createdAt: 1, updatedAt: 1 })');
const activeBefore = vm.run("activeProjectId");
answers.push("cancel");
const switched = await vm.run('switchProject("glue-other")');
test.assert(switched === false && asked.length === 2 && asked[1].kind === "confirm", "switching project over unsaved edits asks the same question");
test.assert(vm.run("activeProjectId") === activeBefore && !!w.AISystem6ClioChartWorkbook.current(), "Cancel keeps the project and the workbook");

// Discard: the close box closes, unmounts and gives the chart its chrome back.
answers.push("no");
closed = await vm.run('closeWindow("clioChart")');
test.assert(!w.AISystem6ClioChartWorkbook.current() && chartWin.classList.contains("is-hidden") && !chartWin.classList.contains("is-workbook-mounted"), "Don't Save closes the window, unmounts the workbook and restores the chart's chrome");
vm.run('openWindow("clioChart")'); vm.run('focusWindow(getWindow("clioChart"))');
refresh();
test.assert(rowState("clio-chart-workbook-save")?.hidden === true && menuOf("chart")?.classList.contains("is-hidden") === false && rowState("clio-chart-import")?.hidden === false && w.AISystem6Runtime.commandAvailability("clio-chart-matrix").available === true, "after it unmounts the Chart menu and File rows are back; the workbook's rows are gone and the chart's commands are live again");

// ---- a host with revert; a clean close unmounts without asking --------------------------------
hostWith(true);
({ adapter } = await mount("budget-s11.xlsx"));
test.assert(rowState("clio-chart-workbook-revert")?.hidden === false && rowState("clio-chart-workbook-revert").disabled === true && rowState("clio-chart-workbook-revert").help.length > 0,
  "a host with revert lists 复原到上次存储… (grey with a reason while clean)");
adapter.setCell(SHEET, "B2", { value: 251 });
refresh();
test.assert(rowState("clio-chart-workbook-revert").disabled === false, "and live once the workbook is edited");
answers.push("no");
await vm.run('closeWindow("clioChart")');
vm.run('openWindow("clioChart")');
({ adapter } = await mount("budget-s11.xlsx"));
const askedBefore = asked.length;
closed = await vm.run('closeWindow("clioChart")');
test.assert(asked.length === askedBefore && !w.AISystem6ClioChartWorkbook.current() && !chartWin.classList.contains("is-workbook-mounted"), "a clean workbook closes without a question, and is unmounted");
// A clean workbook does not travel into the next project: switching unmounts it without asking.
({ adapter } = await mount("budget-s11.xlsx"));
const askedAtSwitch = asked.length;
const switchedAway = await vm.run('switchProject("glue-other")');
test.assert(switchedAway !== false && asked.length === askedAtSwitch && !w.AISystem6ClioChartWorkbook.current() && !chartWin.classList.contains("is-workbook-mounted"), "switching project with a clean workbook unmounts it, no question");
const switchedClean = await vm.run('switchProject("no-such-project")');
test.assert(switchedClean === undefined, "(control) an unknown project is still refused as before");

test.finish();
