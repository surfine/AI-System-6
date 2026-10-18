// ClioWorks S11 M2 contract: the ClioStage native surface on the real desk.
//
// Boots the real eager module set, loads ClioStage and the native surface through the
// desk's own lazy loaders, mounts a presentation (lane-A adapter shape, stubbed) and
// drives the seams that live outside the surface module:
//   - the menu bar: while a presentation is mounted the ClioStage menus list its
//     commands (存储, 复原到上次存储…, Express / 完整编辑, the existing page commands,
//     检查当前页, 加批注…), grey with the surface's own reason, and the Markdown deck's
//     menus come back unchanged when it unmounts;
//   - Express / 完整编辑 from the menu is the same switch as ⌘E and never touches dirty;
//   - Edit › Undo in ClioStage is the presentation's own history;
//   - the close box, Quit and switching project ask about unsaved edits, Cancel aborts;
//     a clean presentation unmounts without a question.
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { stubAdapter } from "../fixtures/clioworks-s11/lectern-stub.mjs";

const test = createFeatureTest("clioworks-s11-m2-stage-desk");
const isShimNode = (value) => !!value && typeof value === "object" && (typeof value.tagName === "string" || typeof value.nodeType === "number");

const vm = createAppBootVm({ location: { href: "http://localhost/", reload: () => {}, search: "" } });
Object.defineProperty(vm.window.Node, Symbol.hasInstance, { value: isShimNode });
const createElement = vm.document.createElement;
vm.document.createElement = (tag) => {
  const el = createElement(tag);
  if (typeof el.getClientRects !== "function") el.getClientRects = () => [];
  return el;
};
await vm.settleBoot();
const w = vm.window;
const doc = vm.document;

const run = async () => {
  vm.run('openWindow("clioStage")');
  await vm.waitFor(() => w.AISystem6ClioStageLoaded);
  await vm.run("ensureClioStageNativeModule()");
  test.assert(!!w.AISystem6ClioStageNative, "the native surface loads through its own lazy loader");
  const stageWin = doc.querySelector('[data-window="clioStage"]');
  stageWin.ownerDocument = doc;
  const menuRow = (action) => doc.querySelector(`[data-app-menu] [data-action="${action}"]`);
  const rowState = (action) => {
    const el = menuRow(action);
    return el ? { hidden: el.classList.contains("is-hidden"), disabled: !!el.disabled, checked: el.classList.contains("is-checked"), help: el.dataset.balloonHelp || "", shortcut: el.dataset.shortcut || "" } : null;
  };
  const refresh = () => { vm.run("updateMenuState()"); };
  const asked = [];
  const answers = [];
  w.showSystemModal = async (message, kind, options) => { asked.push({ message, kind, options }); return answers.length ? answers.shift() : "cancel"; };
  const saves = [];
  w.AISystem6ClioWorks = { saveNativeDocument: async (name) => { saves.push(name); return { ok: true }; }, revertNativeDocument: async () => ({ ok: true }) };
  const mount = async (name = "搬家说明会.pptx") => {
    const adapter = stubAdapter();
    const out = await w.AISystem6ClioStageNative.open({ liveAdapter: adapter, mountedName: name, fileName: name }, {});
    vm.run('focusWindow(getWindow("clioStage"))');
    vm.run('renderAppMenuBar("clioStage", { force: true })');
    refresh();
    return { adapter, out };
  };

  vm.run('focusWindow(getWindow("clioStage"))');
  vm.run('renderAppMenuBar("clioStage", { force: true })');
  refresh();
  test.assert(!!menuRow("clio-stage-add-slide") && !menuRow("clio-stage-native-save"), "no presentation: ClioStage's own menus, none of the native rows");

  let { adapter, out } = await mount();
  test.assert(out.ok === true && w.AISystem6ClioStageNative.current()?.mountedName === "搬家说明会.pptx" && stageWin.classList.contains("is-native-mounted"),
    "a presentation mounts into the ClioStage window (no new window) and takes its chrome");
  for (const action of ["clio-stage-native-save", "clio-stage-native-revert", "clio-stage-native-mode-express", "clio-stage-native-mode-full", "clio-stage-native-add-slide", "clio-stage-native-duplicate-slide", "clio-stage-native-delete-slide", "clio-stage-native-layout", "clio-stage-native-reset-layout", "clio-stage-native-check", "clio-stage-native-comment", "clio-stage-native-prev", "clio-stage-native-next"]) {
    test.assert(!!menuRow(action), `the mounted presentation lists ${action}`);
  }
  test.assert(!menuRow("clio-stage-add-slide") && !menuRow("clio-stage-import") && !menuRow("clio-stage-source"), "the Markdown deck's rows are not listed while a presentation owns the window");
  let save = rowState("clio-stage-native-save");
  test.assert(save.disabled === true && save.help === w.AISystem6ClioStageNative.commandState("file.save").reason && save.help.length > 0, `a clean presentation: 存储 is grey with the surface's reason (${save.help})`);
  test.assert(save.shortcut === "⌘S" && rowState("clio-stage-native-mode-express").shortcut === "⌘E" && rowState("clio-stage-native-check").shortcut === "⌘K" && rowState("clio-stage-native-comment").shortcut === "⌘M",
    "the rows show ⌘S, ⌘E, ⌘K and ⌘M");
  test.assert(rowState("clio-stage-native-add-slide").disabled === true && rowState("clio-stage-native-add-slide").help === w.AISystem6ClioStageNative.commandState("slide.add").reason,
    "Express: the page commands are grey with the reason (完整编辑 has them)");
  test.assert(rowState("clio-stage-native-mode-express").checked === true && rowState("clio-stage-native-mode-full").checked === false, "Express is ticked");

  // Edit › Undo reaches the presentation's own history.
  adapter.setRunText("s1", "r1", "三千多本书");
  refresh();
  test.assert(vm.run('editHistoryFor("clioStage")?.undoLabel?.()') === "clio_stage_native_step_text" && rowState("clio-stage-native-save").disabled === false,
    "an edited presentation: Edit › Undo names 「文字编辑」 and 存储 turns live");

  await vm.run('handleAction("clio-stage-native-mode-full")');
  refresh();
  test.assert(w.AISystem6ClioStageNative.current().mode === "full" && rowState("clio-stage-native-mode-full").checked === true && rowState("clio-stage-native-add-slide").disabled === false,
    "choosing 完整编辑 from the 演示 menu switches the surface, ticks the row and frees the page commands");
  test.assert(adapter.isDirty() === true && saves.length === 0, "switching mode neither saves nor changes dirty");
  await vm.run('handleAction("clio-stage-native-add-slide")');
  test.assert(adapter.calls.some((call) => call[0] === "addSlide") && w.AISystem6ClioStageNative.current().slideId === "n1", "加页 from the menu runs on the native model");

  // ---- the close box, Quit and switching project ----
  answers.push("cancel");
  let closed = await vm.run('closeWindow("clioStage")');
  test.assert(closed === false && asked.length === 1 && asked[0].options?.confirmKey === "clio_stage_native_cmd_save" && asked[0].options?.altKey === "clio_stage_native_dont_save" && asked[0].options?.defaultAction === "cancel",
    "the close box over unsaved edits asks 存储 / 不存储 / 取消, default Cancel");
  test.assert(!!w.AISystem6ClioStageNative.current() && stageWin.classList.contains("is-native-mounted"), "Cancel keeps the window and the presentation");
  answers.push("cancel");
  await vm.run('quitApp("clioStage")');
  test.assert(asked.length === 2 && !!w.AISystem6ClioStageNative.current(), "Quit asks the same question; Cancel keeps it");
  vm.run('projects.push({ id: "stage-other", name: "Other", createdAt: 1, updatedAt: 1 })');
  const activeBefore = vm.run("activeProjectId");
  answers.push("cancel");
  const switched = await vm.run('switchProject("stage-other")');
  test.assert(switched === false && asked.length === 3 && vm.run("activeProjectId") === activeBefore && !!w.AISystem6ClioStageNative.current(), "switching project asks too; Cancel keeps the project and the presentation");

  answers.push("no");
  await vm.run('closeWindow("clioStage")');
  vm.run('openWindow("clioStage")');
  vm.run('focusWindow(getWindow("clioStage"))');
  vm.run('renderAppMenuBar("clioStage", { force: true })');
  refresh();
  test.assert(!w.AISystem6ClioStageNative.current() && !stageWin.classList.contains("is-native-mounted") && !!menuRow("clio-stage-add-slide") && !menuRow("clio-stage-native-save"),
    "Don't Save unmounts it; ClioStage's own menus and chrome come back");
  test.assert(vm.run('editHistoryFor("clioStage")?.undoLabel?.() || ""') !== "clio_stage_native_step_text", "and Edit › Undo is ClioStage's own again");

  ({ adapter } = await mount());
  const askedBefore = asked.length;
  closed = await vm.run('closeWindow("clioStage")');
  test.assert(asked.length === askedBefore && !w.AISystem6ClioStageNative.current(), "a clean presentation closes without a question, and is unmounted");

  test.finish();
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
